// Ledger fee-assignment helpers.
//
// Pure module (no I/O, no side effects) shared by the admin fees page and the
// term rollover service so that a student ledger's fee list is always rebuilt
// the same way.
//
// Background: when the current term's fees are (re)assigned to a student, the
// ledger's `fees` array is rebuilt from the fee definitions. Carry-forward
// entries created by the term rollover are not fee definitions, so they used to
// be dropped from the ledger - which silently cancelled the carried balance.
// These helpers preserve them, and only them.

import { isCarryForwardFee } from "./termBalanceCarryForward.js";

/**
 * True when a ledger fee entry is a carry-forward entry written by the term
 * rollover service.
 *
 * @param {Object} fee - A ledger fee entry
 * @returns {boolean}
 */
export const isCarryForwardFeeEntry = (fee) =>
  Boolean(fee && typeof fee.feeId === "string" && isCarryForwardFee(fee.feeId));

/**
 * The carry-forward entries that already exist on a ledger.
 *
 * @param {Array<Object>} existingFees - The ledger's current fee entries
 * @returns {Array<Object>}
 */
export const collectCarryForwardFees = (existingFees) =>
  (existingFees || []).filter((fee) => isCarryForwardFeeEntry(fee));

/**
 * Rebuild the fee list of a student ledger from the current term's fee
 * assignments.
 *
 * The rebuilt list is a MERGE, not a regeneration:
 *
 *   - An existing assignment (same `feeId` within the ledger's academic year and
 *     term) is UPDATED from the current live FeeDefinition: the `feeName`,
 *     `feeNameSnapshot`, `amount` and `assignedAmount` are taken from the live
 *     definition so admin edits are reflected on the student ledger card. The
 *     `openingPaidAmount` (the immutable record of money already collected) is
 *     preserved verbatim — payments are never rewritten. `openingBalance` and
 *     `openingStatus` are omitted so buildLedgerFeesPayload recomputes them.
 *   - A genuinely new assignment (fee currently applicable, no matching entry)
 *     is CREATED from the current definition.
 *   - Existing ordinary entries that are no longer returned by the assignment
 *     resolver (scope narrowed, fee deactivated, fee no longer applies to this
 *     student's class) are PRESERVED as historical records. Their obligation
 *     and payment attribution survive; they are not silently erased.
 *   - Carry-forward entries are preserved unchanged and never matched against
 *     incoming fee definitions.
 *
 * Matching is by `feeId` alone because the ledger document is already scoped to
 * one `(schoolId, studentId, academicYear, term)` by `buildLedgerId`, so a
 * `feeId` match inside it is unambiguous.
 *
 * @param {Object} params
 * @param {Array<{id:string, feeName:string, amount:number}>} params.assignedFees -
 *   The fee definitions currently assigned to the student
 * @param {Array<Object>} params.existingFees - The ledger's current fee entries
 * @returns {Array<Object>} The merged fee list
 */
export const buildLedgerFeeList = ({
  assignedFees = [],
  existingFees = [],
} = {}) => {
  const previousFees = existingFees || [];
  // Ordinary entries only; carry-forward entries are handled separately and
  // must never be matched against incoming fee definitions.
  const previousOrdinaryFees = previousFees.filter(
    (fee) => !isCarryForwardFeeEntry(fee),
  );

  const feesList = [];
  const seenFeeIds = new Set();

  for (const fee of assignedFees) {
    const previous = previousOrdinaryFees.find((item) => item.feeId === fee.id);
    if (previous) {
      // EXISTING assignment. Propagate the live FeeDefinition's name and amount
      // so admin edits are reflected on the student ledger card. The opening
      // paid amount is the immutable record of money already collected and is
      // preserved verbatim — payments are never rewritten. openingBalance and
      // openingStatus are omitted so buildLedgerFeesPayload recomputes them
      // from the live amount and the preserved paid amount.
      const { openingBalance, openingStatus, ...rest } = previous;
      feesList.push({
        ...rest,
        feeName: fee.feeName,
        feeNameSnapshot: fee.feeName,
        amount: fee.amount,
        assignedAmount: fee.amount,
        historicalOnly: false,
      });
    } else {
      // GENUINELY NEW assignment: use the current applicable definition.
      feesList.push({
        feeId: fee.id,
        feeName: fee.feeName,
        amount: fee.amount,
        feeNameSnapshot: fee.feeName,
        assignedAmount: fee.amount,
      });
    }
    seenFeeIds.add(fee.id);
  }

  // Preserve existing ordinary entries that are no longer returned by the
  // assignment resolver (fee scope narrowed, fee deactivated, or fee no longer
  // applies to this student's class). Their historical obligation and payment
  // attribution survive; they are marked historicalOnly so demand-calculating
  // consumers can exclude them from current balances and payment allocation.
  for (const previousFee of previousOrdinaryFees) {
    if (seenFeeIds.has(previousFee.feeId)) continue;
    feesList.push({ ...previousFee, historicalOnly: true });
    seenFeeIds.add(previousFee.feeId);
  }

  // Carry-forward entries are preserved unchanged and never matched against
  // incoming fee definitions.
  for (const carryForwardFee of collectCarryForwardFees(previousFees)) {
    if (seenFeeIds.has(carryForwardFee.feeId)) continue;
    feesList.push({ ...carryForwardFee, historicalOnly: false });
    seenFeeIds.add(carryForwardFee.feeId);
  }

  return feesList;
};

/**
 * Build the fee-derived fields of a student ledger from the current term's
 * fee assignments, preserving any carry-forward entries.
 *
 * `buildLedgerFeeList` now MERGES rather than regenerates: existing assignments
 * carry their live `amount`/`feeName`/snapshots (propagated from the current
 * definition) and only genuinely new assignments use the current definition.
 * `totalFee` is therefore the ledger's total obligation including preserved
 * historical-only entries; it is no longer silently frozen by a live fee edit.
 *
 * @param {Object} params
 * @param {Array<Object>} params.assignedFees - Assigned fee definitions
 * @param {Array<Object>} params.existingFees - The ledger's current fee entries
 * @returns {{fees: Array<{feeId: string, feeName: string, amount: number,
 *   openingPaidAmount?: number, openingBalance?: number,
 *   openingStatus?: "Paid" | "Part-paid" | "Unpaid",
 *   openingPaidDate?: string | null,
 *   feeNameSnapshot?: string, assignedAmount?: number}>, totalFee: number,
 *   openingPaidAmount: number, openingBalance: number,
 *   openingStatus: "Paid" | "Part-paid" | "Unpaid"}}
 */
export const buildLedgerFeesPayload = ({
  assignedFees = [],
  existingFees = [],
} = {}) => {
  const fees = buildLedgerFeeList({ assignedFees, existingFees });

  // Phase 2.2: historicalOnly entries (deactivated fees, reassigned
  // obligations) have their openingPaidAmount frozen for audit but must
  // NOT contribute to the current-term opening paid total — otherwise
  // transferred credit would be double-counted (once on the old
  // historicalOnly entry, once on the new current entry).
  const currentFees = fees.filter((fee) => !fee?.historicalOnly);

  const openingPaidAmount = currentFees.reduce(
    (sum, fee) => sum + (fee.openingPaidAmount || 0),
    0,
  );

  const openingBalance = currentFees.reduce((sum, fee) => {
    const paid = fee.openingPaidAmount || 0;
    const balanceValue =
      fee.openingBalance !== undefined && fee.openingBalance !== null
        ? fee.openingBalance
        : Math.max(0, fee.amount - paid);
    return sum + balanceValue;
  }, 0);

  // totalFee intentionally includes ALL entries (frozen semantics) so
  // historical obligations remain visible in the audit trail.
  const totalFee = fees.reduce((sum, fee) => sum + (fee?.amount || 0), 0);

  // Demand total excludes historicalOnly entries so the "Paid" status is
  // reachable when all current fees are fully paid.
  const demandedTotal = currentFees.reduce(
    (sum, fee) => sum + (Number(fee?.amount) || 0),
    0,
  );

  const openingStatus =
    openingPaidAmount <= 0
      ? "Unpaid"
      : openingPaidAmount >= demandedTotal
        ? "Paid"
        : "Part-paid";

  return {
    fees,
    totalFee,
    openingPaidAmount,
    openingBalance,
    openingStatus,
  };
};

/**
 * Signature of the ordinary (non carry-forward) fee assignments held by a
 * ledger.
 *
 * The signature is IDENTITY-BASED (`feeId` only), not `feeId:amount`.
 * Keying it on `amount` would make every fee amount/name edit look like a
 * pending assignment change and trigger a spurious, non-terminating ledger
 * sync.
 *
 * Identity-based signatures are stable across amount, name and scope edits,
 * and only change when the SET of ordinary fee assignments actually differs —
 * i.e. when a genuinely new fee must be assigned or an assignment is genuinely
 * removed. Carry-forward entries are excluded so they never keep triggering a
 * sync.
 *
 * @param {Array<Object>} fees - The ledger's fee entries
 * @returns {string}
 */
export const buildFeeAssignmentSignature = (fees) =>
  (fees || [])
    .filter((fee) => !isCarryForwardFeeEntry(fee))
    .map((fee) => `${fee.feeId}`)
    .sort()
    .join("|");

/**
 * Resolve the historically-assigned amount for a ledger fee entry.
 *
 * Phase 1 read-compatibility helper. Prefers the Phase 1 snapshot
 * `assignedAmount` when present, falling back to the live `amount` for
 * entries created before the snapshot fields existed. Never consults the live
 * FeeDefinition, so the result is stable regardless of later fee edits.
 *
 * @param {Object} fee - A ledger fee entry
 * @returns {number}
 */
export const resolveAssignedAmount = (fee) => {
  if (!fee) return 0;
  if (fee.assignedAmount !== undefined && fee.assignedAmount !== null) {
    return Number(fee.assignedAmount) || 0;
  }
  return Number(fee.amount) || 0;
};

/**
 * Resolve the historically-assigned fee name for a ledger fee entry.
 *
 * Phase 1 read-compatibility helper. Prefers the Phase 1 snapshot
 * `feeNameSnapshot` when present, falling back to the live `feeName` for
 * entries created before the snapshot fields existed.
 *
 * @param {Object} fee - A ledger fee entry
 * @returns {string}
 */
export const resolveAssignedFeeName = (fee) => {
  if (!fee) return "";
  if (fee.feeNameSnapshot !== undefined && fee.feeNameSnapshot !== null) {
    return String(fee.feeNameSnapshot);
  }
  return String(fee.feeName || "");
};

/**
 * True when a ledger fee entry carries a Phase 1 historical snapshot.
 *
 * @param {Object} fee - A ledger fee entry
 * @returns {boolean}
 */
export const hasHistoricalSnapshot = (fee) =>
  Boolean(fee && (fee.assignedAmount !== undefined || fee.feeNameSnapshot !== undefined));

/**
 * Sum the amounts of fees that are NOT historical-only.
 *
 * Historical-only entries represent obligations that have been deactivated
 * and must NOT be counted toward current-term demand (balances, invoices,
 * defaulter lists, payment allocation, carry-forward). This helper is the
 * single source of truth for "current demand" totals.
 *
 * @param {Array<Object>} fees - Ledger fee entries
 * @returns {number} Sum of amounts for non-historical-only fees
 */
export const sumDemandedAmounts = (fees = []) =>
  fees.reduce((sum, fee) => sum + (fee?.historicalOnly ? 0 : Number(fee?.amount || 0)), 0);

/**
 * Filter out historical-only entries, returning only fees that represent
 * current-term demand.
 *
 * @param {Array<Object>} fees - Ledger fee entries
 * @returns {Array<Object>} Non-historical-only fee entries
 */
export const filterDemandedFees = (fees = []) =>
  (fees || []).filter((fee) => !fee?.historicalOnly);
