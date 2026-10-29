// Automated term balance carry-forward calculations.
// This module is pure (no I/O, no side effects) so it is trivially testable
// and safe to import from anywhere.

import { UNALLOCATED_FEE_ID } from "./feeAllocation.js";
import { sumDemandedAmounts } from "./ledgerFeeAssignment.js";

/**
 * Prefix for carry-forward fee IDs to distinguish them from regular fees.
 */
const CARRY_FORWARD_FEE_PREFIX = "__carry_forward__";

/**
 * Build a unique ID for a carry-forward fee record.
 * @param {string} schoolId - The school identifier
 * @param {string} studentId - The student identifier
 * @param {string} fromAcademicYear - The academic year the balance is carried from
 * @param {string} fromTerm - The term the balance is carried from
 * @returns {string} A unique fee ID for the carry-forward fee
 */
export function buildCarryForwardId(schoolId, studentId, fromAcademicYear, fromTerm) {
  // Remove whitespace from academic year and term to ensure consistent IDs
  const cleanAcademicYear = fromAcademicYear.replace(/\s+/g, "");
  const cleanTerm = fromTerm.replace(/\s+/g, "");
  return `${CARRY_FORWARD_FEE_PREFIX}_${schoolId}_${studentId}_${cleanAcademicYear}_${cleanTerm}`;
}

/**
 * Check if a fee ID is a carry-forward fee.
 * @param {string} feeId - The fee ID to check
 * @returns {boolean} True if the fee ID is a carry-forward fee
 */
export function isCarryForwardFee(feeId) {
  return feeId.startsWith(`${CARRY_FORWARD_FEE_PREFIX}_`);
}

/**
 * Result of a carry-forward calculation for a student.
 * @typedef {Object} CarryForwardResult
 * @property {string} studentId - The student identifier
 * @property {string} classId - The class identifier (optional)
 * @property {number} carriedBalance - The amount to carry forward
 * @property {string} fromAcademicYear - The academic year the balance is carried from
 * @property {string} fromTerm - The term the balance is carried from
 * @property {string} toAcademicYear - The academic year the balance is carried to
 * @property {string} toTerm - The term the balance is carried to
 * @property {string} carryForwardFeeId - The ID of the carry-forward fee entry
 */

/**
 * Input for the carry-forward calculation.
 * @typedef {Object} CarryForwardInput
 * @property {Array<{id:string, classId?:string>}> students - List of students
 * @property {import("../types").StudentFeeLedger[]} ledgers - List of student fee ledgers
 * @property {import("../types").StudentFeePayment[]} payments - List of student fee payments
 * @property {string} fromAcademicYear - The academic year to carry forward from
 * @property {string} fromTerm - The term the balance is carried from
 * @property {string} toAcademicYear - - The academic year the balance is carried to
 * @property {string} toTerm - The term the balance is carried to
 * @property {string} schoolId - The school identifier
 */

/**
 * Compute the outstanding balance for a single student's previous term.
 *
 * Rules:
 *   - Start with fee amounts from the ledger.
 *   - Subtract opening payments (fee.openingPaidAmount).
 *   - Subtract payments made during the term, using stored allocations where
 *     available to avoid double-counting.
 *   - Payments from other students, other academic years, or other terms are excluded.
 *   - Overpayments (allocations to UNALLOCATED_FEE_ID) are ignored.
 *   - Result is clamped to >= 0.
 *
 * @param {import("../types").StudentFeeLedger} ledger - The student's fee ledger for the term
 * @param {import("../types").StudentFeePayment[]} payments - All payments to filter
 * @returns {number} The outstanding balance to carry forward (>= 0)
 */
export function computeCarryForwardBalance({ ledger, payments }) {
  if (!ledger) return 0;

  // Total fee amount from the ledger, EXCLUDING historical-only entries.
  // Historical-only entries represent deactivated fees that must not be
  // carried forward as new-term demand.
  const totalDue = sumDemandedAmounts(ledger.fees);

  // Total opening payments, EXCLUDING historical-only entries.
  const openingPaid = ledger.fees
    .filter((fee) => !fee?.historicalOnly)
    .reduce((sum, fee) => sum + (Number(fee.openingPaidAmount) || 0), 0);

  // Filter payments to only those made during the term by this student (excluding opening payments)
  const termPayments = payments.filter(p =>
    p &&
    p.studentId === ledger.studentId &&
    p.academicYear === ledger.academicYear &&
    p.term === ledger.term &&
    p.isOpeningPayment !== true
  );

  // Build a map of feeId -> amount paid from payments, EXCLUDING historical-only fees.
  const creditedByFee = new Map();
  for (const payment of termPayments) {
    if (
      payment.allocations &&
      Array.isArray(payment.allocations) &&
      payment.allocations.length > 0
    ) {
      // Payment with stored allocations — credit each allocation to its fee
      for (const alloc of payment.allocations) {
        if (!alloc) continue;
        if (alloc.feeId === UNALLOCATED_FEE_ID) continue; // overpayment, handled separately
        // Skip allocations to historical-only fees
        const feeEntry = ledger.fees?.find(f => f.feeId === alloc.feeId);
        if (feeEntry?.historicalOnly) continue;
        const feeId = alloc.feeId;
        const amountPaid = Number(alloc.amountPaid) || 0;
        creditedByFee.set(feeId, (creditedByFee.get(feeId) || 0) + amountPaid);
      }
    } else {
      // Payment without stored allocations — credit the full amount to its feeId
      // Skip if the fee is historical-only
      const feeEntry = ledger.fees?.find(f => f.feeId === payment.feeId);
      if (feeEntry?.historicalOnly) continue;
      const feeId = payment.feeId;
      const amountPaid = Number(payment.amountPaid) || 0;
      creditedByFee.set(feeId, (creditedByFee.get(feeId) || 0) + amountPaid);
    }
  }

  // Sum all credited amounts across all non-historical-only fees
  let totalCredited = 0;
  for (const amount of creditedByFee.values()) {
    totalCredited += amount;
  }

  // Outstanding balance = total due - opening payments - payments made during term
  // Clamp to zero (no negative balances)
  return Math.max(0, totalDue - openingPaid - totalCredited);
}

/**
 * Build a carry-forward fee entry from a calculation result.
 * @param {CarryForwardResult} result - The carry-forward calculation result
 * @returns {Object|null} A fee entry object suitable for insertion into a ledger's fees array, or null if balance is zero
 */
export function buildCarryForwardFeeEntry(result) {
  if (result.carriedBalance <= 0) return null;
  return {
    feeId: result.carryForwardFeeId,
    feeName: `Carried Balance (${result.fromTerm}, ${result.fromAcademicYear})`,
    amount: result.carriedBalance,
    openingPaidAmount: 0,
    openingBalance: result.carriedBalance,
    openingStatus: "Unpaid",
    openingPaidDate: null,
  };
}

/**
 * Build a standard ledger ID.
 * @param {string} schoolId - The school identifier
* @param {string} studentId - The student identifier
 * @param {string} academicYear - The academic year
 * @param {string} term - The term
 * @returns {string} A unique ledger ID
 */
export function buildLedgerId(schoolId, studentId, academicYear, term) {
  const cleanAcademicYear = academicYear.replace(/\s+/g, "");
  const cleanTerm = term.replace(/\s+/g, "");
  return `${schoolId}_${studentId}_${cleanAcademicYear}_${cleanTerm}`;
}