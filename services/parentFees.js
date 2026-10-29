// Parent financial engine.
//
// Pure and deterministic: no I/O, no side effects, no clock, no randomness.
// It is consumed by the Parent Dashboard (browser bundle) and by `node --test`.
//
// Every rule implemented here is borrowed from the VERIFIED backend so the
// parent view can never disagree with the ledger:
//
//   ledger totals ............ services/mockDb.ts (computeLedgerTotals)
//   carry-forward identity ... services/termBalanceCarryForward.js
//                              (isCarryForwardFee / buildCarryForwardId)
//   fee crediting ........... services/carryForwardReview.js
//                              (isCarryForwardFeeId / parseCarryForwardFeeId /
//                               sumPaidAgainstFee)
//
// Payment crediting (verified semantics):
//   - a payment that carries `allocations` credits every allocation to its own
//     feeId, and only the allocated amount;
//   - a payment without allocations credits its own `feeId`;
//   - a payment flagged `isOpeningPayment` is not an ordinary payment, the
//     money it stands for is already held by the ledger opening paid amount.
//
// Money that cannot be credited to one of the ledger's fees is reported as
// `unallocatedPaid`; it is never pushed onto an arbitrary fee.

import {
  isCarryForwardFeeId,
  parseCarryForwardFeeId,
  sumPaidAgainstFee,
} from "./carryForwardReview.js";
import { sumDemandedAmounts } from "./ledgerFeeAssignment.js";

/**
 * @typedef {"Term 1"|"Term 2"|"Term 3"|string} ParentFeeTermFilter
 * @typedef {"Paid"|"Part-paid"|"Unpaid"} ParentFeeStatus
 */

/**
 * @typedef {Object} ParentCarryForwardEntry
 * @property {string} feeId
 * @property {string} feeName
 * @property {number} amount - Amount carried into the current term
 * @property {number} paid - Amount paid against the carried balance
 * @property {number} remaining - Carried balance still outstanding
 * @property {boolean} outstanding
 * @property {string} fromAcademicYear - Source academic year
 * @property {string} fromTerm - Source term
 * @property {ParentFeeStatus} status
 */

/**
 * @typedef {Object} ParentCarryForwardSummary
 * @property {number} amount - Total amount carried
 * @property {number} paid - Total paid against the carried balance
 * @property {number} remaining - Carried balance still outstanding
 * @property {boolean} outstanding
 * @property {string|null} fromAcademicYear - Source year (single entry only)
 * @property {string|null} fromTerm - Source term (single entry only)
 * @property {ParentCarryForwardEntry[]} entries
 */

/**
 * @typedef {Object} ParentFeeSummary
 * @property {string} studentId
 * @property {string} academicYear
 * @property {ParentFeeTermFilter} term
 * @property {ParentCarryForwardSummary|null} carryForward
 * @property {number} currentTermFees - Current term fees, carry-forward excluded
 * @property {number} totalDue
 * @property {number} totalPaid
 * @property {number} remaining
 * @property {number} unallocatedPaid - Paid but not credited to a specific fee
 * @property {ParentFeeStatus} status
 */

/**
 * @typedef {Object} EnrichedParentFee
 * @property {string} feeId
 * @property {string} feeName
 * @property {number} amount
 * @property {number} openingPaidAmount
 * @property {number} actualPaid
 * @property {number} actualBalance
 * @property {ParentFeeStatus} actualStatus
 * @property {boolean} isCarryForward
 * @property {{academicYear: string, term: string}|null} carryForwardSource
 */

/**
 * @typedef {Object} EnrichedParentLedger
 * @property {string} id
 * @property {string} studentId
 * @property {string} academicYear
 * @property {string} term
 * @property {EnrichedParentFee[]} fees - Visible fees (admission rows hidden)
 * @property {EnrichedParentFee[]} allFees - Every fee of the ledger
 * @property {number} actualTotalDue
 * @property {number} actualTotalPaid
 * @property {number} actualBalance
 * @property {ParentFeeStatus} actualStatus
 * @property {number} unallocatedPaid
 * @property {boolean} isCarryForwardSource
 */

/**
 * @typedef {Object} ParentFeeTotals
 * @property {number} totalFees
 * @property {number} totalPaid
 * @property {number} totalBalance
 */

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const sumBy = (rows, keyOf) =>
  (rows || []).reduce((total, row) => total + toNumber(row?.[keyOf]), 0);

/**
 * Compact comparison key: whitespace and case are irrelevant.
 *
 * @param {*} value
 * @returns {string}
 */
const compactKey = (value) =>
  String(value === null || value === undefined ? "" : value)
    .replace(/\s+/g, "")
    .toLowerCase();

/**
 * Canonical "Term 1" / "Term 2" / "Term 3" form of a term label.
 *
 * @param {*} value
 * @returns {string}
 */
export const normalizeParentFeeTerm = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "1" || normalized === "term1" || normalized === "term 1")
    return "Term 1";
  if (normalized === "2" || normalized === "term2" || normalized === "term 2")
    return "Term 2";
  if (normalized === "3" || normalized === "term3" || normalized === "term 3")
    return "Term 3";
  return value || "";
};

/**
 * @param {*} a
 * @param {*} b
 * @returns {boolean}
 */
const sameTerm = (a, b) =>
  compactKey(normalizeParentFeeTerm(a)) === compactKey(normalizeParentFeeTerm(b));

/**
 * @param {*} a
 * @param {*} b
 * @returns {boolean}
 */
const sameYear = (a, b) => compactKey(a) === compactKey(b);

/**
 * Stable identity of a ledger for de-duplication purposes.
 *
 * @param {Object} ledger
 * @returns {string}
 */
const ledgerKey = (ledger) =>
  [
    compactKey(ledger?.studentId),
    compactKey(ledger?.academicYear),
    compactKey(normalizeParentFeeTerm(ledger?.term)),
  ].join("|");

/**
 * Term ordering used to pick the live ledger of a student.
 *
 * @param {*} term
 * @returns {number}
 */
const termOrder = (term) => {
  const match = String(term || "").match(/(\d+)/);
  return match ? Number(match[1]) : 0;
};

/**
 * @param {Object} a
 * @param {Object} b
 * @returns {number}
 */
const compareLedgers = (a, b) => {
  const yearDelta = compactKey(a?.academicYear).localeCompare(
    compactKey(b?.academicYear),
  );
  if (yearDelta !== 0) return yearDelta;
  return termOrder(a?.term) - termOrder(b?.term);
};

const isAdmissionFee = (feeName) =>
  String(feeName || "")
    .trim()
    .toLowerCase()
    .includes("admission");

/**
 * Row filtering only. It never changes a financial total.
 *
 * @param {Object} fee
 * @returns {boolean}
 */
const shouldHidePaidAdmissionFee = (fee) =>
  isAdmissionFee(fee?.feeName) && toNumber(fee?.actualBalance) <= 0;

/**
 * Payments that belong to one ledger: same student, same academic year, same
 * term. Nothing else may be credited to the ledger.
 *
 * @param {Array<Object>} payments
 * @param {Object} ledger
 * @returns {Array<Object>}
 */
const scopePaymentsForLedger = (payments, ledger) => {
  if (!ledger || !ledger.studentId) return [];
  return (payments || []).filter(
    (payment) =>
      payment &&
      payment.studentId === ledger.studentId &&
      sameYear(payment.academicYear, ledger.academicYear) &&
      sameTerm(payment.term, ledger.term),
  );
};

/**
 * Amount of a payment that is credited to one of the ledger's fees.
 *
 * @param {Object} payment
 * @param {Set<string>} feeIds
 * @returns {number}
 */
const creditedAmountForLedgerFees = (payment, feeIds) => {
  if (!payment) return 0;
  if (Array.isArray(payment.allocations) && payment.allocations.length > 0) {
    return payment.allocations.reduce((total, allocation) => {
      if (!allocation || !feeIds.has(allocation.feeId)) return total;
      return total + toNumber(allocation.amountPaid);
    }, 0);
  }
  return feeIds.has(payment.feeId) ? toNumber(payment.amountPaid) : 0;
};

/**
 * Read the carry-forward source period of a fee entry.
 *
 * @param {Object} fee
 * @param {Object} ledger
 * @returns {{academicYear: string, term: string}|null}
 */
const readCarryForwardSource = (fee, ledger) => {
  if (!isCarryForwardFeeId(fee?.feeId)) return null;
  const source = parseCarryForwardFeeId(fee.feeId, {
    schoolId: ledger?.schoolId,
    studentId: ledger?.studentId,
  });
  if (!source) return null;
  return { academicYear: source.fromAcademicYear, term: source.fromTerm };
};

/**
 * Enrich the ledgers of one student with the money that was actually paid.
 *
 * The returned `fees` array keeps the historical Parent Dashboard behaviour of
 * hiding a fully paid admission row. `allFees` always holds every fee, and
 * every financial total is computed from `allFees`.
 *
 * @param {Array<Object>} ledgers
 * @param {Array<Object>} payments
 * @param {ParentFeeTermFilter} selectedTerm
 * @returns {EnrichedParentLedger[]}
 */
export const enrichParentFeeLedgers = (ledgers, payments, selectedTerm) => {
  const sourceLedgers = Array.isArray(ledgers) ? ledgers : [];
  const allPayments = Array.isArray(payments) ? payments : [];

  const termLedgers =
    selectedTerm === "all"
      ? sourceLedgers
      : sourceLedgers.filter((ledger) =>
          sameTerm(ledger?.term, selectedTerm),
        );

  // Carry-forward entries present in this scope. The deterministic carry
  // forward id is the only anchor used to find them.
  const carryForwardEntries = [];
  termLedgers.forEach((ledger) => {
    (ledger?.fees || []).forEach((fee) => {
      const source = readCarryForwardSource(fee, ledger);
      if (!source) return;
      carryForwardEntries.push({ ledger, fee, source });
    });
  });

  // A ledger whose outstanding was carried forward into one of the carry
  // forward entries above shows the same debt twice once it is combined with
  // the ledger that carries it. It is kept in the list (history stays visible)
  // but excluded from the combined totals.
  const carriedSourceKeys = new Set();
  carryForwardEntries.forEach((entry) => {
    termLedgers.forEach((ledger) => {
      if (!ledger || ledger === entry.ledger) return;
      if (ledger.studentId !== entry.ledger.studentId) return;
      if (!sameYear(ledger.academicYear, entry.source.academicYear)) return;
      if (!sameTerm(ledger.term, entry.source.term)) return;
      carriedSourceKeys.add(ledgerKey(ledger));
    });
  });

  return termLedgers.map((ledger) => {
    const ledgerPayments = scopePaymentsForLedger(allPayments, ledger);
    const feeIds = new Set((ledger?.fees || []).map((fee) => fee?.feeId));

    const allFees = (ledger?.fees || []).map((fee) => {
      const amount = toNumber(fee?.amount);
      const openingPaid = toNumber(fee?.openingPaidAmount);
      const paidSinceOnboarding = sumPaidAgainstFee(ledgerPayments, fee?.feeId);
      const actualPaid = openingPaid + paidSinceOnboarding;
      const actualBalance = Math.max(0, amount - actualPaid);

      let actualStatus = fee?.openingStatus || "Unpaid";
      if (actualPaid > 0) {
        actualStatus = actualBalance <= 0 ? "Paid" : "Part-paid";
      }

      const carryForwardSource = readCarryForwardSource(fee, ledger);

      return {
        ...fee,
        amount,
        openingPaidAmount: openingPaid,
        actualPaid,
        actualBalance,
        actualStatus,
        isCarryForward: Boolean(carryForwardSource),
        carryForwardSource,
      };
    });

    const visibleFees = allFees.filter(
      (fee) => !shouldHidePaidAdmissionFee(fee),
    );

    // Opening paid: the per fee amounts are authoritative, the ledger level
    // amount is the fallback for ledgers that only carry the aggregate.
    const feeOpeningPaid = sumBy(allFees, "openingPaidAmount");
    const ledgerOpeningPaid = toNumber(ledger?.openingPaidAmount);
    const openingPaid = feeOpeningPaid > 0 ? feeOpeningPaid : ledgerOpeningPaid;
    const unattributedOpeningPaid = Math.max(
      0,
      openingPaid - feeOpeningPaid,
    );

    // Ordinary payments of the ledger. Opening payments are not ordinary
    // payments, they are already represented by the opening paid amount.
    const ordinaryPayments = ledgerPayments.filter(
      (payment) => payment?.isOpeningPayment !== true,
    );
    const appliedPayments = sumBy(ordinaryPayments, "amountPaid");
    const creditedPayments = ordinaryPayments.reduce(
      (total, payment) =>
        total + creditedAmountForLedgerFees(payment, feeIds),
      0,
    );
    const unallocatedPaid =
      unattributedOpeningPaid + Math.max(0, appliedPayments - creditedPayments);

    const actualTotalDue = sumDemandedAmounts(allFees);
    const actualTotalPaid = openingPaid + appliedPayments;
    const actualBalance = Math.max(0, actualTotalDue - actualTotalPaid);

    let actualStatus = ledger?.openingStatus || "Unpaid";
    if (actualTotalPaid > 0) {
      actualStatus = actualBalance <= 0 ? "Paid" : "Part-paid";
    }

    return {
      ...ledger,
      fees: visibleFees,
      allFees,
      actualTotalDue,
      actualTotalPaid,
      actualBalance,
      actualStatus,
      unallocatedPaid,
      isCarryForwardSource: carriedSourceKeys.has(ledgerKey(ledger)),
    };
  });
};

/**
 * Resolve the single student the engine works on.
 *
 * The engine never mixes students: payments are always scoped to the ledger
 * they belong to.
 *
 * @param {Array<Object>} ledgers
 * @param {{studentId?: string}} [options]
 * @returns {string}
 */
const resolveTargetStudentId = (ledgers, options) => {
  const explicit = options?.studentId;
  if (explicit) return String(explicit);
  const ids = [
    ...new Set(
      (ledgers || [])
        .map((ledger) => ledger?.studentId)
        .filter((id) => id !== null && id !== undefined && id !== ""),
    ),
  ].map((id) => String(id));
  if (ids.length <= 1) return ids[0] || "";
  return [...ids].sort()[0];
};

/**
 * Build the enriched ledgers, the bill ledgers and the financial summary of a
 * single student.
 *
 * @param {Array<Object>} ledgers
 * @param {Array<Object>} payments
 * @param {ParentFeeTermFilter} selectedTerm
 * @param {string} academicYear
 * @param {{studentId?: string}} [options]
 * @returns {{enrichedLedgers: EnrichedParentLedger[], billLedgers: EnrichedParentLedger[], summary: ParentFeeSummary}}
 */
const buildParentFeeState = (
  ledgers,
  payments,
  selectedTerm,
  academicYear,
  options,
) => {
  const studentId = resolveTargetStudentId(ledgers, options);
  const studentLedgers = (ledgers || []).filter(
    (ledger) => String(ledger?.studentId) === studentId,
  );

  const enrichedLedgers = enrichParentFeeLedgers(
    studentLedgers,
    payments,
    selectedTerm,
  );

  const billLedgers = enrichedLedgers.filter(
    (ledger) => (ledger?.fees || []).length > 0,
  );

  // Ledgers that carry money. A ledger whose outstanding was carried forward
  // is excluded from the combined totals, the carry forward entry it produced
  // already represents that debt.
  const totalsLedgers = enrichedLedgers.filter(
    (ledger) => (ledger?.allFees || []).length > 0 && !ledger.isCarryForwardSource,
  );

  const totalDue = totalsLedgers.reduce(
    (total, ledger) => total + toNumber(ledger.actualTotalDue),
    0,
  );
  const totalPaid = totalsLedgers.reduce(
    (total, ledger) => total + toNumber(ledger.actualTotalPaid),
    0,
  );
  const remaining = Math.max(0, totalDue - totalPaid);
  const unallocatedPaid = totalsLedgers.reduce(
    (total, ledger) => total + toNumber(ledger.unallocatedPaid),
    0,
  );

  const liveLedger = [...totalsLedgers].sort(compareLedgers).pop() || null;

  const currentTermFees = liveLedger
    ? (liveLedger.allFees || [])
        .filter((fee) => !fee.isCarryForward && !fee.historicalOnly)
        .reduce((total, fee) => total + toNumber(fee.amount), 0)
    : 0;

  const carryForwardFees = totalsLedgers.flatMap((ledger) =>
    (ledger.allFees || []).filter((fee) => fee.isCarryForward),
  );

  /** @type {ParentCarryForwardSummary|null} */
  let carryForward = null;
  if (carryForwardFees.length > 0) {
    const entries = carryForwardFees.map((fee) => ({
      feeId: fee.feeId,
      feeName: fee.feeName,
      amount: toNumber(fee.amount),
      paid: toNumber(fee.actualPaid),
      remaining: toNumber(fee.actualBalance),
      outstanding: toNumber(fee.actualBalance) > 0,
      fromAcademicYear: fee.carryForwardSource?.academicYear || "",
      fromTerm: fee.carryForwardSource?.term || "",
      status: fee.actualStatus,
    }));
    const carriedAmount = entries.reduce(
      (total, entry) => total + entry.amount,
      0,
    );
    const carriedPaid = entries.reduce(
      (total, entry) => total + entry.paid,
      0,
    );
    const carriedRemaining = entries.reduce(
      (total, entry) => total + entry.remaining,
      0,
    );
    carryForward = {
      amount: carriedAmount,
      paid: carriedPaid,
      remaining: carriedRemaining,
      outstanding: carriedRemaining > 0,
      fromAcademicYear:
        entries.length === 1 ? entries[0].fromAcademicYear : null,
      fromTerm: entries.length === 1 ? entries[0].fromTerm : null,
      entries,
    };
  }

  let status = "Unpaid";
  if (totalPaid > 0) {
    status = remaining <= 0 ? "Paid" : "Part-paid";
  }

  const summary = {
    studentId,
    academicYear: String(academicYear || ""),
    term: selectedTerm,
    carryForward,
    currentTermFees,
    totalDue,
    totalPaid,
    remaining,
    unallocatedPaid,
    status,
  };

  return { enrichedLedgers, billLedgers, summary };
};

/**
 * Financial summary of one student.
 *
 * @param {Array<Object>} ledgers
 * @param {Array<Object>} payments
 * @param {ParentFeeTermFilter} selectedTerm
 * @param {string} academicYear
 * @param {{studentId?: string}} [options]
 * @returns {ParentFeeSummary}
 */
export const getParentFeeSummary = (
  ledgers,
  payments,
  selectedTerm,
  academicYear,
  options,
) =>
  buildParentFeeState(ledgers, payments, selectedTerm, academicYear, options)
    .summary;

/**
 * Parent Dashboard totals.
 *
 * The historical shape (`enrichedLedgers`, `billLedgers`, `totals`) is kept.
 * The totals now follow the verified ledger rule, so they can no longer
 * disagree with the administrator view.
 *
 * @param {Array<Object>} ledgers
 * @param {Array<Object>} payments
 * @param {ParentFeeTermFilter} selectedTerm
 * @param {string} academicYear
 * @param {{studentId?: string}} [options]
 * @returns {{enrichedLedgers: EnrichedParentLedger[], billLedgers: EnrichedParentLedger[], totals: ParentFeeTotals, summary: ParentFeeSummary}}
 */
export const getParentFeeTotals = (
  ledgers,
  payments,
  selectedTerm,
  academicYear,
  options,
) => {
  const state = buildParentFeeState(
    ledgers,
    payments,
    selectedTerm,
    academicYear,
    options,
  );

  return {
    enrichedLedgers: state.enrichedLedgers,
    billLedgers: state.billLedgers,
    totals: {
      totalFees: state.summary.totalDue,
      totalPaid: state.summary.totalPaid,
      totalBalance: state.summary.remaining,
    },
    summary: state.summary,
  };
};
