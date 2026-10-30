import { isCarryForwardFeeEntry } from "./ledgerFeeAssignment.js";
import { resolveAssignedAmount, resolveAssignedFeeName } from "./ledgerFeeAssignment.js";

/**
 * Result type for {@link reassignObligation}.
 *
 * @typedef {Object} ReassignObligationResult
 * @property {boolean} ok
 * @property {import("./types").StudentFeeLedger} [ledger]
 * @property {string} [error]
 */

/**
 * Reassignment audit metadata stored on a newly created current fee entry.
 *
 * @typedef {Object} ReassignedFrom
 * @property {string} fromFeeId - The original fee ID the obligation was moved from
 * @property {string} fromFeeName - The historical fee name of the original obligation
 * @property {number} fromAmount - The historical amount of the original obligation
 * @property {number} fromOpeningPaidAmount - The pre-transfer opening paid amount on the old entry
 * @property {number} transferredPaidAmount - The credit transferred to the new entry (capped at the original obligation amount)
 * @property {string[]} absorbedPaymentIds - IDs of term payments originally against the old fee (for audit)
 * @property {number} reassignedAt - Timestamp of the reassignment
 * @property {string} reassignedBy - Admin user who performed the reassignment
 */

/**
 * Validate that the ledger's academic year and term match a target scope.
 *
 * @param {Object} ledger
 * @param {string} [targetAcademicYear]
 * @param {string} [targetTerm]
 * @returns {string|null} Error message or null
 */
const validateTermScope = (ledger, targetAcademicYear, targetTerm) => {
  if (targetAcademicYear && ledger.academicYear && targetAcademicYear !== ledger.academicYear) {
    return `Cross-term reassignment not allowed: ledger is in academic year "${ledger.academicYear}" but target is "${targetAcademicYear}"`;
  }
  if (targetTerm && ledger.term && targetTerm !== ledger.term) {
    return `Cross-term reassignment not allowed: ledger is in term "${ledger.term}" but target is "${targetTerm}"`;
  }
  return null;
};

/**
 * Sum the opening paid amounts of fees that represent current demand
 * (i.e. NOT historical-only). This is the Phase 2 fix that prevents
 * transferred credit from being counted twice.
 *
 * @param {Array<Object>} fees
 * @returns {number}
 */
const sumCurrentOpeningPaid = (fees = []) =>
  (fees || []).reduce(
    (sum, fee) => sum + (fee?.historicalOnly ? 0 : Number(fee?.openingPaidAmount || 0)),
    0,
  );

/**
 * Compute the per-feed opening balance, defaulting to amount - paid.
 *
 * @param {Object} fee
 * @returns {number}
 */
const resolveOpeningBalance = (fee) => {
  if (fee.openingBalance !== undefined && fee.openingBalance !== null) {
    return Math.max(0, Number(fee.openingBalance));
  }
  return Math.max(0, Number(fee.amount || 0) - Number(fee.openingPaidAmount || 0));
};

/**
 * Resolve the opening status from paid/balance totals.
 *
 * @param {number} paid
 * @param {number} totalDue
 * @returns {"Paid"|"Part-paid"|"Unpaid"}
 */
const resolveOpeningStatus = (paid, totalDue) => {
  if (paid <= 0) return "Unpaid";
  if (paid >= totalDue) return "Paid";
  return "Part-paid";
};

/**
 * Safely deep-clone a fee entry for freezing as a historical record.
 * Only plain data properties are copied; functions and undefined are dropped.
 *
 * @param {Object} fee
 * @returns {Object}
 */
const freezeHistoricalEntry = (fee) => {
  const clone = {};
  for (const key of Object.keys(fee)) {
    if (key === "historicalOnly") continue;
    const value = fee[key];
    if (value === undefined) continue;
    clone[key] = value;
  }
  clone.historicalOnly = true;
  return clone;
};

/**
 * Reassign a student's obligation from one fee to another within the same
 * academic year and term.
 *
 * This is an explicit admin operation that moves a student's unpaid obligation
 * (and its associated paid credit) from one fee definition to another. It is
 * NEVER automatic — fee creation, scope changes, and deactivation follow the
 * normal `buildLedgerFeeList` path. Reassignment is used when a student needs
 * to be moved from Fee A to Fee B while keeping the same paid history and
 * balance intact.
 *
 * Rules (Phase 2.2):
 *   - Same academic year + term only.
 *   - The `fromFeeId` must exist as a current (non-historical-only, non
 *     carry-forward) entry on the ledger.
 *   - The `toFee.feeId` must NOT already be a current entry on the ledger.
 *   - Payment documents (`StudentFeePayment`) are NEVER modified.
 *   - The old ledger entry is kept as `historicalOnly: true` with its original
 *     `openingPaidAmount` intact for audit; all demand calculations exclude it.
 *   - The new entry carries the transferred paid credit in `openingPaidAmount`,
 *     capped at `min(originalPaidCredit, originalAmount)`. Excess credit above
 *     the original amount is NOT refunded — it stays preserved on the frozen
 *     historical entry for audit.
 *   - Carry-forward entries are preserved unchanged and never become sources
 *     or targets of reassignment.
 *
 * @param {Object} params
 * @param {import("./types").StudentFeeLedger} params.ledger - The student's fee ledger
 * @param {string} params.fromFeeId - The fee ID to reassign FROM
 * @param {{feeId: string, feeName: string, amount: number, active?: boolean}} params.toFee
 *     The fee definition to reassign TO
 * @param {string} params.schoolId - The school identifier
 * @param {string} [params.adminId] - Admin performing the reassignment
 * @param {Array<import("./types").StudentFeePayment>} [params.payments=[]]
 *     Term payments (for audit metadata; NOT modified)
 * @param {number} [params.now=Date.now()] - Timestamp (for testability)
 * @param {string} [params.targetAcademicYear] - Enforced academic year scope
 * @param {string} [params.targetTerm] - Enforced term scope
 * @returns {ReassignObligationResult}
 */
export const reassignObligation = ({
  ledger,
  fromFeeId,
  toFee,
  schoolId,
  adminId = "unknown",
  payments = [],
  now = Date.now(),
  targetAcademicYear,
  targetTerm,
}) => {
  if (!ledger || !Array.isArray(ledger.fees)) {
    return { ok: false, error: "Invalid ledger: missing fees array" };
  }

  if (!fromFeeId || !toFee || !toFee.feeId || !toFee.feeName || toFee.amount == null) {
    return { ok: false, error: "Invalid parameters: fromFeeId and toFee are required" };
  }

  if (!schoolId) {
    return { ok: false, error: "schoolId is required" };
  }

  // Cross-term guard (V1: same-term only)
  const termError = validateTermScope(ledger, targetAcademicYear, targetTerm);
  if (termError) {
    return { ok: false, error: termError };
  }

  // Inactive fee guard
  if (toFee.active === false) {
    return { ok: false, error: `Cannot reassign to inactive fee ${toFee.feeId}` };
  }

  // Find the existing entry for fromFeeId (excluding carry-forward entries
  // which cannot be a reassignment source).
  const existingEntry = ledger.fees.find(
    (fee) =>
      fee.feeId === fromFeeId &&
      !isCarryForwardFeeEntry(fee),
  );

  if (existingEntry && existingEntry.historicalOnly) {
    return {
      ok: false,
      error: `Fee ${fromFeeId} has already been reassigned (entry is historicalOnly)`,
    };
  }

  // The fromFeeId must exist as a current (non-historical-only) entry.
  const oldEntry = existingEntry;
  if (!oldEntry) {
    return {
      ok: false,
      error: `No current obligation found for feeId "${fromFeeId}" on this student's ledger`,
    };
  }

  // New fee must not already exist as a current (non-historical-only) entry
  const existingNewFee = ledger.fees.find(
    (fee) => fee.feeId === toFee.feeId && !fee.historicalOnly,
  );
  if (existingNewFee) {
    return {
      ok: false,
      error: `Fee ${toFee.feeId} is already assigned as a current obligation on this ledger`,
    };
  }

  // Compute transferred paid credit: capped at the original obligation amount.
  // Excess credit above the original amount is NOT refunded — it stays on
  // the frozen historical entry for audit.
  const originalAmount = resolveAssignedAmount(oldEntry);
  const originalPaidCredit = Number(oldEntry.openingPaidAmount) || 0;
  const transferredPaidAmount = Math.min(originalPaidCredit, originalAmount);

  // Collect IDs of term payments originally against the old fee (for audit trail).
  // These payments are NOT modified; only their IDs are recorded here.
  const absorbedPaymentIds = (payments || [])
    .filter(
      (p) =>
        p &&
        p.studentId === ledger.studentId &&
        p.academicYear === ledger.academicYear &&
        p.term === ledger.term &&
        p.feeId === fromFeeId &&
        p.isOpeningPayment !== true,
    )
    .map((p) => p.id);

  // Freeze the old entry as historical-only with all original values intact.
  const frozenOldEntry = freezeHistoricalEntry(oldEntry);

  // Create the new current fee entry.
  const newEntry = {
    feeId: toFee.feeId,
    feeName: toFee.feeName,
    amount: toFee.amount,
    feeNameSnapshot: toFee.feeName,
    assignedAmount: toFee.amount,
    openingPaidAmount: transferredPaidAmount,
    openingBalance: Math.max(0, toFee.amount - transferredPaidAmount),
    openingStatus: resolveOpeningStatus(transferredPaidAmount, toFee.amount),
    openingPaidDate: oldEntry.openingPaidDate || null,
    historicalOnly: false,
    reassignedFrom: {
      fromFeeId,
      fromFeeName: resolveAssignedFeeName(oldEntry),
      fromAmount: originalAmount,
      fromOpeningPaidAmount: originalPaidCredit,
      transferredPaidAmount,
      absorbedPaymentIds,
      reassignedAt: now,
      reassignedBy: adminId,
    },
  };

  // Build the new fees array: replace old with frozen, add new.
  const newFees = [];
  for (const fee of ledger.fees) {
    if (fee.feeId === fromFeeId && !fee.historicalOnly && !isCarryForwardFeeEntry(fee)) {
      newFees.push(frozenOldEntry);
    } else {
      newFees.push(fee);
    }
  }

  // Safety: avoid duplicate if somehow the new feeId is already present.
  if (!newFees.find((f) => f.feeId === toFee.feeId)) {
    newFees.push(newEntry);
  }

  // Recompute ledger-level aggregates.
  // totalFee includes ALL entries (frozen semantics for audit).
  // openingPaidAmount / openingBalance / openingStatus exclude historicalOnly
  // entries so transferred credit is never double-counted.
  const totalFee = newFees.reduce((sum, fee) => sum + (Number(fee.amount) || 0), 0);

  const currentFees = newFees.filter((fee) => !fee.historicalOnly);
  const openingPaidAmount = sumCurrentOpeningPaid(newFees);
  const openingBalance = currentFees.reduce(
    (sum, fee) => sum + resolveOpeningBalance(fee),
    0,
  );
  const demandedTotal = currentFees.reduce(
    (sum, fee) => sum + (Number(fee.amount) || 0),
    0,
  );
  const openingStatus = resolveOpeningStatus(openingPaidAmount, demandedTotal);

  return {
    ok: true,
    ledger: {
      ...ledger,
      fees: newFees,
      totalFee,
      openingPaidAmount,
      openingBalance,
      openingStatus,
      updatedAt: now,
    },
  };
};
