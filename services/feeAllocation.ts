/**
 * Automated sequential fee allocation.
 *
 * When a payment is recorded WITHOUT a specific fee being selected, the
 * amount is distributed across the student's outstanding fee balances in a
 * deterministic order until the funds are exhausted.
 *
 * This module is pure (no I/O, no side effects) so it is trivially testable
 * and safe to import from anywhere.
 */

export type AllocationStrategy = "priority" | "dueDate" | "alphabetical";

/** Sentinel feeId used for payments that were not applied to a single fee. */
export const UNALLOCATED_FEE_ID = "__OVERPAYMENT__";

export interface FeeAllocation {
  feeId: string;
  feeName: string;
  amountPaid: number;
  isOverpayment: boolean;
}

export interface OutstandingFee {
  feeId: string;
  feeName: string;
  amount: number;
  priority?: number;
  dueDate?: number;
  openingPaidAmount?: number;
  alreadyPaid: number;
}

/**
 * Sort outstanding fees into the allocation order for the given strategy.
 * Ties are always broken by feeName so the result is deterministic and
 * repeatable across runs.
 */
export function orderFees(
  fees: OutstandingFee[],
  strategy: AllocationStrategy,
): OutstandingFee[] {
  const copy = [...fees];
  const byName = (
    a: OutstandingFee,
    b: OutstandingFee,
  ): number => a.feeName.localeCompare(b.feeName);
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
 */
export function allocate(
  paymentAmount: number,
  fees: OutstandingFee[],
  strategy: AllocationStrategy = "priority",
): FeeAllocation[] {
  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) return [];
  if (!fees.length) return [];

  const ordered = orderFees(fees, strategy);
  const allocations: FeeAllocation[] = [];
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

/** Sum allocations per feeId, useful for crediting the ledger per fee. */
export function summarizeAllocations(
  allocations: FeeAllocation[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const a of allocations) {
    map.set(a.feeId, (map.get(a.feeId) || 0) + a.amountPaid);
  }
  return map;
}