import {
  FeeTerm,
  StudentFeeLedger,
  StudentFeePayment,
} from "../types";

export type ParentFeeTermFilter = FeeTerm | "all";

export type EnrichedParentFee = StudentFeeLedger["fees"][number] & {
  actualPaid: number;
  actualBalance: number;
  actualStatus: "Paid" | "Part-paid" | "Unpaid";
};

export type EnrichedParentLedger = Omit<StudentFeeLedger, "fees"> & {
  fees: EnrichedParentFee[];
  actualTotalDue: number;
  actualTotalPaid: number;
  actualBalance: number;
  actualStatus: "Paid" | "Part-paid" | "Unpaid";
};

export type ParentFeeTotals = {
  totalFees: number;
  totalPaid: number;
  totalBalance: number;
};

const isAdmissionFee = (feeName?: string) =>
  String(feeName || "").trim().toLowerCase().includes("admission");

const shouldHidePaidAdmissionFee = (fee: {
  feeName: string;
  actualBalance?: number;
}) => isAdmissionFee(fee.feeName) && (fee.actualBalance || 0) <= 0;

export const normalizeParentFeeTerm = (value?: string | null) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "1" || normalized === "term1" || normalized === "term 1") return "Term 1";
  if (normalized === "2" || normalized === "term2" || normalized === "term 2") return "Term 2";
  if (normalized === "3" || normalized === "term3" || normalized === "term 3") return "Term 3";
  return value || "";
};

export const enrichParentFeeLedgers = (
  ledgers: StudentFeeLedger[],
  payments: StudentFeePayment[],
  selectedTerm: ParentFeeTermFilter,
): EnrichedParentLedger[] => {
  const termLedgers =
    selectedTerm === "all"
      ? ledgers
      : ledgers.filter((ledger) => ledger.term === selectedTerm);

  return termLedgers.map((ledger) => {
    let ledgerTotalDue = 0;
    let ledgerTotalPaid = 0;

    const enrichedFees = ledger.fees.map((fee) => {
      const feePayments = payments.filter(
        (payment) =>
          payment.studentId === ledger.studentId &&
          payment.academicYear === ledger.academicYear &&
          normalizeParentFeeTerm(payment.term) === ledger.term &&
          payment.feeId === fee.feeId,
      );
      const paidSinceOnboarding = feePayments.reduce(
        (sum, payment) => sum + payment.amountPaid,
        0,
      );
      const totalPaidForFee =
        (fee.openingPaidAmount || 0) + paidSinceOnboarding;
      const balanceForFee = Math.max(0, fee.amount - totalPaidForFee);

      let statusForFee = fee.openingStatus || "Unpaid";
      if (totalPaidForFee > 0) {
        statusForFee = balanceForFee <= 0 ? "Paid" : "Part-paid";
      }

      return {
        ...fee,
        actualPaid: totalPaidForFee,
        actualBalance: balanceForFee,
        actualStatus: statusForFee,
      };
    });

    const visibleFees = enrichedFees.filter(
      (fee) => !shouldHidePaidAdmissionFee(fee),
    );

    visibleFees.forEach((fee) => {
      ledgerTotalDue += fee.amount;
      ledgerTotalPaid += fee.actualPaid || 0;
    });

    const ledgerBalance = Math.max(0, ledgerTotalDue - ledgerTotalPaid);
    let ledgerStatus = ledger.openingStatus || "Unpaid";
    if (ledgerTotalPaid > 0) {
      ledgerStatus = ledgerBalance <= 0 ? "Paid" : "Part-paid";
    }

    return {
      ...ledger,
      fees: visibleFees,
      actualTotalDue: ledgerTotalDue,
      actualTotalPaid: ledgerTotalPaid,
      actualBalance: ledgerBalance,
      actualStatus: ledgerStatus,
    };
  });
};

export const getParentFeeTotals = (
  ledgers: StudentFeeLedger[],
  payments: StudentFeePayment[],
  selectedTerm: ParentFeeTermFilter,
  academicYear: string,
): {
  enrichedLedgers: EnrichedParentLedger[];
  billLedgers: EnrichedParentLedger[];
  totals: ParentFeeTotals;
} => {
  const enrichedLedgers = enrichParentFeeLedgers(
    ledgers,
    payments,
    selectedTerm,
  );
  const billLedgers = enrichedLedgers.filter(
    (ledger) => ledger.fees.length > 0,
  );

  let totalFees = 0;
  let totalPaidInLedgers = 0;

  billLedgers.forEach((ledger) => {
    totalFees += ledger.actualTotalDue;
    totalPaidInLedgers += ledger.actualTotalPaid;
  });

  const unallocatedPayments = payments
    .filter(
      (payment) =>
        payment.feeId === "online_payment" &&
        payment.academicYear === academicYear,
    )
    .filter((payment) =>
      selectedTerm === "all"
        ? true
        : normalizeParentFeeTerm(payment.term) === selectedTerm,
    )
    .reduce((sum, payment) => sum + payment.amountPaid, 0);

  const totalPaid = totalPaidInLedgers + unallocatedPayments;
  const totalBalance = Math.max(0, totalFees - totalPaid);

  return {
    enrichedLedgers,
    billLedgers,
    totals: { totalFees, totalPaid, totalBalance },
  };
};
