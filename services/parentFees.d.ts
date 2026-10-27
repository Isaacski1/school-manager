// Type declarations for services/parentFees.js
//
// The Parent financial engine. Pure and deterministic: it reuses the verified
// backend rules (carry-forward identity from services/carryForwardReview.js,
// ledger totals from the verified ledger rule) so the Parent Dashboard can
// never disagree with the ledger.

import { FeeTerm, StudentFeeLedger, StudentFeePayment } from "../types";

export type ParentFeeTermFilter = FeeTerm | "all";

export type ParentFeeStatus = "Paid" | "Part-paid" | "Unpaid";

export type ParentCarryForwardEntry = {
  feeId: string;
  feeName: string;
  /** Amount carried into the current term. */
  amount: number;
  /** Amount paid against the carried balance. */
  paid: number;
  /** Carried balance still outstanding. */
  remaining: number;
  outstanding: boolean;
  /** Source academic year taken from the deterministic carry-forward fee id. */
  fromAcademicYear: string;
  /** Source term taken from the deterministic carry-forward fee id. */
  fromTerm: string;
  status: ParentFeeStatus;
};

export type ParentCarryForwardSummary = {
  /** Total amount carried. */
  amount: number;
  /** Total paid against the carried balance. */
  paid: number;
  /** Carried balance still outstanding. */
  remaining: number;
  outstanding: boolean;
  /** Source academic year, only set when a single carry-forward entry exists. */
  fromAcademicYear: string | null;
  /** Source term, only set when a single carry-forward entry exists. */
  fromTerm: string | null;
  entries: ParentCarryForwardEntry[];
};

export type EnrichedParentFee = StudentFeeLedger["fees"][number] & {
  actualPaid: number;
  actualBalance: number;
  actualStatus: ParentFeeStatus;
  /** True for carry-forward entries, identified by the deterministic fee id. */
  isCarryForward: boolean;
  carryForwardSource: { academicYear: string; term: string } | null;
};

export type EnrichedParentLedger = Omit<StudentFeeLedger, "fees"> & {
  /** Visible fees (a fully paid admission row is hidden, row filtering only). */
  fees: EnrichedParentFee[];
  /** Every fee of the ledger, used for the financial totals. */
  allFees: EnrichedParentFee[];
  actualTotalDue: number;
  actualTotalPaid: number;
  actualBalance: number;
  actualStatus: ParentFeeStatus;
  /** Paid money that could not be credited to one of the ledger's fees. */
  unallocatedPaid: number;
  /** True when this ledger's outstanding was carried forward into this scope. */
  isCarryForwardSource: boolean;
};

export type ParentFeeTotals = {
  totalFees: number;
  totalPaid: number;
  totalBalance: number;
};

export type ParentFeeSummary = {
  studentId: string;
  academicYear: string;
  term: ParentFeeTermFilter;
  /** null when the student has no carry-forward entry. */
  carryForward: ParentCarryForwardSummary | null;
  /** Current term fees, carry-forward entry excluded. */
  currentTermFees: number;
  /** SUM of the ledger fee amounts, carry-forward included. */
  totalDue: number;
  totalPaid: number;
  remaining: number;
  /** Paid money that could not be credited to one of the ledger's fees. */
  unallocatedPaid: number;
  status: ParentFeeStatus;
};

export function normalizeParentFeeTerm(value?: string | null): string;

export function enrichParentFeeLedgers(
  ledgers: StudentFeeLedger[],
  payments: StudentFeePayment[],
  selectedTerm: ParentFeeTermFilter,
): EnrichedParentLedger[];

export function getParentFeeSummary(
  ledgers: StudentFeeLedger[],
  payments: StudentFeePayment[],
  selectedTerm: ParentFeeTermFilter,
  academicYear: string,
  options?: { studentId?: string },
): ParentFeeSummary;

export function getParentFeeTotals(
  ledgers: StudentFeeLedger[],
  payments: StudentFeePayment[],
  selectedTerm: ParentFeeTermFilter,
  academicYear: string,
  options?: { studentId?: string },
): {
  enrichedLedgers: EnrichedParentLedger[];
  billLedgers: EnrichedParentLedger[];
  totals: ParentFeeTotals;
  summary: ParentFeeSummary;
};
