// Type declarations for services/carryForwardReview.js

export interface CarryForwardReviewRow {
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  carryForwardFeeId: string;
  feeName: string;
  fromAcademicYear: string;
  fromTerm: string;
  toAcademicYear: string;
  toTerm: string;
  carriedAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  status: "outstanding" | "settled";
}

export interface CarryForwardReviewGroup {
  key: string;
  label: string;
  studentCount: number;
  carriedAmount: number;
  paidAmount: number;
  outstandingAmount: number;
}

export interface CarryForwardReviewTotals {
  studentCount: number;
  outstandingStudentCount: number;
  carriedAmount: number;
  paidAmount: number;
  outstandingAmount: number;
}

export interface CarryForwardReview {
  schoolId?: string;
  academicYear?: string;
  term?: string;
  rows: CarryForwardReviewRow[];
  outstandingRows: CarryForwardReviewRow[];
  groups: {
    byClass: CarryForwardReviewGroup[];
    bySourceTerm: CarryForwardReviewGroup[];
  };
  totals: CarryForwardReviewTotals;
}

export function isCarryForwardFeeId(feeId: unknown): boolean;
export function parseCarryForwardFeeId(
  feeId: string,
  context?: { schoolId?: string; studentId?: string },
): { fromAcademicYear: string; fromTerm: string } | null;
export function sumPaidAgainstFee(
  payments: Array<Record<string, any>>,
  feeId: string,
): number;
export function buildCarryForwardRows(params: {
  ledgers?: Array<Record<string, any>>;
  payments?: Array<Record<string, any>>;
  students?: Array<Record<string, any>>;
  schoolId?: string;
  academicYear?: string;
  term?: string;
}): CarryForwardReviewRow[];
export function buildClassNameLookup(
  classRooms?: Array<{ id?: string; name?: string }>,
): Map<string, string>;
export function resolveClassLabel(params?: {
  classId?: string | null;
  className?: string | null;
  classNameLookup?: Map<string, string>;
}): string;
export function buildCarryForwardReview(params: {
  ledgers?: Array<Record<string, any>>;
  payments?: Array<Record<string, any>>;
  students?: Array<Record<string, any>>;
  schoolId?: string;
  academicYear?: string;
  term?: string;
}): CarryForwardReview;
export function buildCarryForwardReviewId(
  schoolId: string,
  academicYear: string,
  term: string,
): string;
export function buildCarryForwardNotificationId(
  schoolId: string,
  academicYear: string,
  term: string,
): string;
export function buildCarryForwardNotificationMessage(
  review: Partial<CarryForwardReview>,
): string;
