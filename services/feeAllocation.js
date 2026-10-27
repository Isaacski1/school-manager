// Automated sequential fee allocation.
// This module is pure (no I/O, no side effects) so it is trivially testable
// and safe to import from anywhere.

/**
 * When a payment is recorded WITHOUT a specific fee being selected, the
 * amount is distributed across the student's outstanding fee balances in a
 * deterministic order until the funds are exhausted.
 */

/** Sentinel feeId used for payments that were not applied to a single fee. */
export const UNALLOCATED_FEE_ID = "__OVERPAYMENT__";

/**
 * Sort outstanding fees into the allocation order for the given strategy.
 * Ties are always broken by feeName so the result is deterministic and
 * repeatable across runs.
 *
 * @param {import("../types").OutstandingFee[]} fees - Array of outstanding fees
 * @param {"priority"|"dueDate"|"alphabetical"} strategy - The allocation strategy
 * @returns {import("../types").OutstandingFee[]} Sorted array of outstanding fees
 */
export function orderFees(fees, strategy) {
  const copy = [...fees];
  const byName = (a, b) => a.feeName.localeCompare(b.feeName);
  switch (strategy) {
    case "dueDate":
      return copy.sort(
        (a, b) =>
          (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity) || byName(a, b),
      );
    case "alphabetical":
      return copy.sort(byName);
    case "priority":
    default:
      return copy.sort(
        (a, b) =>
          (b.priority ?? 0) - (a.priority ?? 0) || byName(a, b),
      );
  }
}

/**
 * Distribute a payment amount across outstanding fees in allocation order.
 *
 * - Each fee is credited up to its remaining outstanding balance.
 * - Any surplus after all fees are fully paid is returned as a single
 *   `__OVERPAYMENT__` allocation so it can be reviewed/refunded later.
 * - Returns an empty array when there is nothing to allocate (no outstanding
 *   fees or non-positive amount), allowing callers to reject the payment.
 *
 * @param {number} paymentAmount - The amount to allocate
 * @param {import("../types").OutstandingFee[]} fees - Array of outstanding fees
 * @param {"priority"|"dueDate"|"alphabetical"}= "priority" strategy - The allocation strategy
 * @returns {import("../types").FeeAllocation[]} Array of fee allocations
 */
export function allocate(paymentAmount, fees, strategy = "priority") {
  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) return [];
  if (!fees.length) return [];

  const ordered = orderFees(fees, strategy);
  const allocations = [];
  let remaining = paymentAmount;

  for (const fee of ordered) {
    if (remaining <= 0) break;
    const owed = Math.max(
      0,
      fee.amount - fee.alreadyPaid - (fee.openingPaidAmount || 0),
    );
    if (owed <= 0) continue;
    const apply = Math.min(owed, remaining);
    allocations.push({
      feeId: fee.feeId,
      feeName: fee.feeName,
      amountPaid: apply,
      isOverpayment: false,
    });
    remaining -= apply;
  }

  if (remaining > 0) {
    allocations.push({
      feeId: UNALLOCATED_FEE_ID,
      feeName: "Unapplied credit",
      amountPaid: remaining,
      isOverpayment: true,
    });
  }

  return allocations;
}

/**
 * Sum allocations per feeId, useful for crediting the ledger per fee.
 *
 * @param {import("../types").FeeAllocation[]} allocations - Array of fee allocations
 * @returns {Map<string, number>} Map of feeId to total amount paid
 */
export function summarizeAllocations(allocations) {
  const map = new Map();
  for (const a of allocations) {
    map.set(a.feeId, (map.get(a.feeId) || 0) + a.amountPaid);
  }
  return map;
}