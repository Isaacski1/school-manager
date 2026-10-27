// Type declarations for services/parentFeeData.js
//
// Parent data-path helpers. Pure: they prepare the data for the verified
// financial engine (services/parentFees.js), they never calculate a balance.

export interface ParentPaymentHistoryEntry {
  id: string;
  studentId: string;
  feeId: string;
  feeName: string;
  amountPaid: number;
  academicYear: string;
  term: string;
  paymentMethod?: string;
  createdAt?: Date | string | number;
  allocations?: Array<{
    feeId: string;
    feeName?: string;
    amountPaid: number;
    isOverpayment?: boolean;
  }>;
  /** Human readable description of what the payment was allocated toward. */
  allocationDescription: string;
  /** True when the payment reduces the overall balance without a fee. */
  appliedToOverallBalance: boolean;
  /** Label the Parent Dashboard renders for the payment. */
  displayLabel: string;
}

export interface ParentPaymentHistoryOptions {
  studentId?: string;
  academicYear?: string;
  term?: string;
  /** Fee ids of the ledgers in view. */
  feeIds?: string[];
  /** Fee id -> fee name lookup used to describe allocations. */
  feeNameById?: Map<string, string>;
}

export function mergeParentLedgers(
  canonicalLedgers: Array<Record<string, any>>,
  alternateLedgers: Array<Record<string, any>>,
): Array<Record<string, any>>;

export function describePaymentAllocation(
  payment: Record<string, any>,
  feeNameById?: Map<string, string>,
): string;

export function buildParentPaymentHistory(
  payments: Array<Record<string, any>>,
  options?: ParentPaymentHistoryOptions,
): ParentPaymentHistoryEntry[];
