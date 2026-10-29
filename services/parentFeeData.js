// Parent data-path helpers.
//
// Pure module (no I/O, no side effects) so it can be unit tested with
// `node --test` and used by the Parent Dashboard.
//
// It prepares the data the Parent Dashboard hands to services/parentFees.js.
// It never calculates a balance: the financial truth stays in the verified
// engine (services/parentFees.js).
//
// The helpers here cover two things the shared storage abstraction does not do
// for the Parent view:
//
//   1. mergeParentLedgers - a school that lives in both storage layouts
//      (schools/{schoolId}/feeLedgers and student_ledgers) can hold the same
//      ledger document twice. The shared reader keeps the canonical copy and
//      drops the other one, which would hide a carry-forward entry that the
//      term rollover wrote while the school was on the other layout. This
//      merge keeps the canonical copy and restores only the carry-forward
//      entries the canonical copy is missing.
//
//   2. buildParentPaymentHistory - a payment recorded with allocations (the
//      administrator auto-allocation shape) carries the unallocated fee id, so
//      a filter that only knows the visible fee ids would hide it.

import { isCarryForwardFeeId } from "./carryForwardReview.js";
import { sumDemandedAmounts } from "./ledgerFeeAssignment.js";
import { normalizeParentFeeTerm } from "./parentFees.js";
import { UNALLOCATED_FEE_ID } from "./feeAllocation.js";

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * @param {*} value
 * @returns {number}
 */
const paymentTime = (payment) => {
  const value = payment?.createdAt;
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "object" && typeof value.toDate === "function") {
    return value.toDate().getTime();
  }
  if (typeof value === "number") return value;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

/**
 * Merge the ledgers of both storage layouts for the Parent view.
 *
 * The canonical copy always wins. Only carry-forward entries that the
 * canonical copy is missing are restored from the other layout, so an
 * obsolete fee that was removed by the fee assignment logic can never be
 * resurrected and no fee is ever duplicated.
 *
 * @param {Array<Object>} canonicalLedgers
 * @param {Array<Object>} alternateLedgers
 * @returns {Array<Object>}
 */
export const mergeParentLedgers = (canonicalLedgers, alternateLedgers) => {
  const canonical = (Array.isArray(canonicalLedgers) ? canonicalLedgers : []).filter(
    (ledger) => ledger && ledger.id,
  );
  const alternate = (
    Array.isArray(alternateLedgers) ? alternateLedgers : []
  ).filter((ledger) => ledger && ledger.id);

  const merged = new Map();
  canonical.forEach((ledger) => merged.set(ledger.id, ledger));

  alternate.forEach((alt) => {
    const current = merged.get(alt.id);
    if (!current) {
      merged.set(alt.id, alt);
      return;
    }
    const existingFeeIds = new Set(
      (current.fees || []).map((fee) => fee?.feeId),
    );
    const missingCarryForward = (alt.fees || []).filter(
      (fee) =>
        fee && isCarryForwardFeeId(fee.feeId) && !existingFeeIds.has(fee.feeId),
    );
    if (missingCarryForward.length === 0) return;
    const fees = [...(current.fees || []), ...missingCarryForward];
    merged.set(alt.id, {
      ...current,
      fees,
      totalFee: sumDemandedAmounts(fees),
    });
  });

  const canonicalIds = new Set(canonical.map((ledger) => ledger.id));
  const result = canonical.map((ledger) => merged.get(ledger.id));
  alternate.forEach((ledger) => {
    if (!canonicalIds.has(ledger.id)) result.push(merged.get(ledger.id));
  });
  return result;
};

/**
 * Human readable description of what a payment was allocated toward.
 *
 * @param {Object} payment
 * @param {Map<string, string>} [feeNameById]
 * @returns {string}
 */
export const describePaymentAllocation = (payment, feeNameById) => {
  const allocations = Array.isArray(payment?.allocations) ? payment.allocations : [];
  const parts = allocations
    .filter((allocation) => allocation && allocation.feeId)
    .map((allocation) => {
      const name =
        (feeNameById && feeNameById.get(allocation.feeId)) ||
        (allocation.feeId === UNALLOCATED_FEE_ID
          ? "Overall balance"
          : allocation.feeName) ||
        allocation.feeId;
      return `${name} (GHS ${toNumber(allocation.amountPaid).toFixed(2)})`;
    });
  return parts.join(", ");
};

/**
 * Build the payment history of the Parent view.
 *
 * A payment is kept when it belongs to the student and the selected period
 * and when it is either
 *   - a payment of one of the fees of the view,
 *   - a portal payment without a fee (money that only reduces the overall
 *     balance), or
 *   - a payment that carries allocations (the administrator auto-allocation
 *     shape, which stores the unallocated fee id).
 *
 * @param {Array<Object>} payments
 * @param {{studentId?: string, academicYear?: string, term?: string, feeIds?: Array<string>, feeNameById?: Map<string, string>}} [options]
 * @returns {Array<Object>}
 */
export const buildParentPaymentHistory = (payments, options = {}) => {
  const { studentId, academicYear, term, feeIds, feeNameById } = options;
  const visibleFeeIds = new Set(feeIds || []);

  const scoped = (Array.isArray(payments) ? payments : []).filter((payment) => {
    if (!payment) return false;
    if (studentId && payment.studentId !== studentId) return false;
    if (academicYear && payment.academicYear !== academicYear) return false;
    if (
      term &&
      term !== "all" &&
      normalizeParentFeeTerm(payment.term) !== normalizeParentFeeTerm(term)
    ) {
      return false;
    }
    return true;
  });

  const visible = scoped.filter((payment) => {
    const allocations = Array.isArray(payment.allocations) ? payment.allocations : [];
    if (allocations.length > 0) return true;
    if (payment.feeId === "online_payment") return true;
    if (payment.feeId === UNALLOCATED_FEE_ID) return true;
    return visibleFeeIds.has(payment.feeId);
  });

  return visible
    .map((payment) => {
      const allocations = Array.isArray(payment.allocations) ? payment.allocations : [];
      const allocationDescription = describePaymentAllocation(payment, feeNameById);
      const appliedToOverallBalance =
        allocations.length === 0 &&
        (payment.feeId === "online_payment" || payment.feeId === UNALLOCATED_FEE_ID);
      return {
        ...payment,
        allocationDescription,
        appliedToOverallBalance,
        displayLabel: allocationDescription
          ? allocationDescription
          : appliedToOverallBalance
            ? "Applied to overall balance"
            : payment.feeName || "Payment",
      };
    })
    .sort((a, b) => paymentTime(b) - paymentTime(a));
};
