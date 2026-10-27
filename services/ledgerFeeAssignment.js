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
 * Ordinary fee entries are rebuilt exactly as before: a fee definition that is
 * assigned produces a fresh entry (carrying over its opening paid/balance/
 * status), and a fee that is no longer assigned is dropped.
 *
 * Carry-forward entries are preserved, because they represent a balance
 * carried over from the previous term and are not fee definitions. They are
 * de-duplicated by their deterministic fee ID so that repeated assignment can
 * never create a duplicate.
 *
 * @param {Object} params
 * @param {Array<{id:string, feeName:string, amount:number}>} params.assignedFees -
 *   The fee definitions currently assigned to the student
 * @param {Array<Object>} params.existingFees - The ledger's current fee entries
 * @returns {Array<Object>} The rebuilt fee list
 */
export const buildLedgerFeeList = ({
  assignedFees = [],
  existingFees = [],
} = {}) => {
  const previousFees = existingFees || [];

  const feesList = assignedFees.map((fee) => {
    const previous = previousFees.find((item) => item.feeId === fee.id);
    const feeEntry = {
      feeId: fee.id,
      feeName: fee.feeName,
      amount: fee.amount,
    };
    if (previous?.openingPaidAmount !== undefined) {
      feeEntry.openingPaidAmount = previous.openingPaidAmount;
    }
    if (previous?.openingBalance !== undefined) {
      feeEntry.openingBalance = previous.openingBalance;
    }
    if (previous?.openingStatus !== undefined) {
      feeEntry.openingStatus = previous.openingStatus;
    }
    return feeEntry;
  });

  const seenFeeIds = new Set(feesList.map((fee) => fee.feeId));
  for (const carryForwardFee of collectCarryForwardFees(previousFees)) {
    if (seenFeeIds.has(carryForwardFee.feeId)) continue;
    feesList.push({ ...carryForwardFee });
    seenFeeIds.add(carryForwardFee.feeId);
  }

  return feesList;
};

/**
 * Build the fee-derived fields of a student ledger from the current term's
 * fee assignments, preserving any carry-forward entries.
 *
 * @param {Object} params
 * @param {Array<Object>} params.assignedFees - Assigned fee definitions
 * @param {Array<Object>} params.existingFees - The ledger's current fee entries
 * @returns {{fees: Array<{feeId: string, feeName: string, amount: number,
 *   openingPaidAmount?: number, openingBalance?: number,
 *   openingStatus?: "Paid" | "Part-paid" | "Unpaid",
 *   openingPaidDate?: string | null}>, totalFee: number,
 *   openingPaidAmount: number, openingBalance: number,
 *   openingStatus: "Paid" | "Part-paid" | "Unpaid"}}
 */
export const buildLedgerFeesPayload = ({
  assignedFees = [],
  existingFees = [],
} = {}) => {
  const fees = buildLedgerFeeList({ assignedFees, existingFees });

  const openingPaidAmount = fees.reduce(
    (sum, fee) => sum + (fee.openingPaidAmount || 0),
    0,
  );

  const openingBalance = fees.reduce((sum, fee) => {
    const paid = fee.openingPaidAmount || 0;
    const balanceValue =
      fee.openingBalance !== undefined && fee.openingBalance !== null
        ? fee.openingBalance
        : Math.max(0, fee.amount - paid);
    return sum + balanceValue;
  }, 0);

  const totalFee = fees.reduce((sum, fee) => sum + fee.amount, 0);

  const openingStatus =
    openingPaidAmount <= 0
      ? "Unpaid"
      : openingPaidAmount >= totalFee
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
 * Signature of the current-term fee assignments held by a ledger.
 *
 * Carry-forward entries are excluded so that the automatic ledger sync is not
 * triggered by the presence of a carry-forward entry.
 *
 * @param {Array<Object>} fees - The ledger's fee entries
 * @returns {string}
 */
export const buildFeeAssignmentSignature = (fees) =>
  (fees || [])
    .filter((fee) => !isCarryForwardFeeEntry(fee))
    .map((fee) => `${fee.feeId}:${fee.amount}`)
    .sort()
    .join("|");
