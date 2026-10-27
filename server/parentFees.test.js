// Parent financial engine tests.
//
// Pure unit tests over services/parentFees.js. No database, no network.
//
// The fixtures mirror the shapes the production code really writes:
//   - a carry-forward fee entry persisted by the term rollover
//     (services/termBalanceCarryForward.js)
//   - an admin payment recorded with allocations and the unallocated fee id
//     (pages/admin/FeesPayments.tsx)
//   - a parent portal payment recorded without a fee id
//     (components/parent/FeesView.tsx)
//
// Run with: node --test server/parentFees.test.js

import test from "node:test";
import assert from "node:assert/strict";

import {
  enrichParentFeeLedgers,
  getParentFeeSummary,
  getParentFeeTotals,
  normalizeParentFeeTerm,
} from "../services/parentFees.js";
import { buildCarryForwardRows } from "../services/carryForwardReview.js";
import { buildCarryForwardId } from "../services/termBalanceCarryForward.js";

const SCHOOL_ID = "school-1";
const STUDENT_ID = "student-1";
const OTHER_STUDENT_ID = "student-2";
const UNALLOCATED_FEE_ID = "__OVERPAYMENT__";
const ONLINE_PAYMENT_FEE_ID = "online_payment";

const YEAR = "2026-2027";
const TERM = "Term 1";

/** Deterministic carry-forward fee id, identical to the rollover's format. */
const carryForwardFeeId = (studentId, academicYear, term) =>
  buildCarryForwardId(SCHOOL_ID, studentId, academicYear, term);

const makeFee = ({ feeId, feeName, amount, openingPaidAmount = 0 }) => ({
  feeId,
  feeName,
  amount,
  openingPaidAmount,
});

const makeLedger = ({
  id,
  studentId = STUDENT_ID,
  schoolId = SCHOOL_ID,
  academicYear = YEAR,
  term = TERM,
  fees = [],
  openingPaidAmount = 0,
}) => ({
  id,
  schoolId,
  studentId,
  classId: "class-1",
  academicYear,
  term,
  fees,
  openingPaidAmount,
  totalFee: fees.reduce((sum, fee) => sum + fee.amount, 0),
  createdAt: 0,
});

const makePayment = ({
  id,
  studentId = STUDENT_ID,
  schoolId = SCHOOL_ID,
  feeId,
  feeName = "Tuition",
  amountPaid,
  academicYear = YEAR,
  term = TERM,
  allocations,
  isOpeningPayment,
}) => {
  const payment = {
    id,
    schoolId,
    studentId,
    classId: "class-1",
    feeId,
    feeName,
    amountPaid,
    paymentMethod: "Cash",
    receiptNumber: null,
    academicYear,
    term,
    recordedBy: "admin-1",
    createdAt: 0,
  };
  if (allocations) payment.allocations = allocations;
  if (isOpeningPayment) payment.isOpeningPayment = isOpeningPayment;
  return payment;
};

const findFee = (ledgers, feeId) =>
  ledgers
    .flatMap((ledger) => ledger.allFees)
    .find((fee) => fee.feeId === feeId);

test("A - carry-forward entry is separated from the current term fees", () => {
  const cfId = carryForwardFeeId(STUDENT_ID, "2025-2026", "Term 3");
  const ledger = makeLedger({
    id: "ledger-1",
    fees: [
      makeFee({ feeId: cfId, feeName: "Carried Balance (Term 3, 2025-2026)", amount: 200 }),
      makeFee({ feeId: "fee-tuition", feeName: "Tuition", amount: 600 }),
    ],
  });

  const summary = getParentFeeSummary([ledger], [], TERM, YEAR);

  assert.equal(summary.carryForward.amount, 200);
  assert.equal(summary.carryForward.paid, 0);
  assert.equal(summary.carryForward.remaining, 200);
  assert.equal(summary.carryForward.outstanding, true);
  assert.equal(summary.carryForward.fromAcademicYear, "2025-2026");
  assert.equal(summary.carryForward.fromTerm, "Term 3");
  assert.equal(summary.currentTermFees, 600);
  assert.equal(summary.totalDue, 800);
  assert.equal(summary.totalPaid, 0);
  assert.equal(summary.remaining, 800);
});

test("B - a payment allocated to the carry-forward only clears the carry-forward", () => {
  const cfId = carryForwardFeeId(STUDENT_ID, "2025-2026", "Term 3");
  const ledger = makeLedger({
    id: "ledger-1",
    fees: [
      makeFee({ feeId: cfId, feeName: "Carried Balance (Term 3, 2025-2026)", amount: 200 }),
      makeFee({ feeId: "fee-tuition", feeName: "Tuition", amount: 600 }),
    ],
  });
  const payment = makePayment({
    id: "payment-1",
    feeId: UNALLOCATED_FEE_ID,
    amountPaid: 100,
    allocations: [{ feeId: cfId, feeName: "Carried Balance", amountPaid: 100, isOverpayment: false }],
  });

  const state = enrichParentFeeLedgers([ledger], [payment], TERM);

  assert.equal(findFee(state, cfId).actualBalance, 100);
  assert.equal(findFee(state, "fee-tuition").actualBalance, 600);

  const summary = getParentFeeSummary([ledger], [payment], TERM, YEAR);
  assert.equal(summary.carryForward.remaining, 100);
  assert.equal(summary.carryForward.outstanding, true);
  assert.equal(summary.remaining, 700);
  assert.equal(summary.currentTermFees, 600);
});

test("C - a payment that fully clears the carry-forward", () => {
  const cfId = carryForwardFeeId(STUDENT_ID, "2025-2026", "Term 3");
  const ledger = makeLedger({
    id: "ledger-1",
    fees: [
      makeFee({ feeId: cfId, feeName: "Carried Balance (Term 3, 2025-2026)", amount: 200 }),
      makeFee({ feeId: "fee-tuition", feeName: "Tuition", amount: 600 }),
    ],
  });
  const payment = makePayment({
    id: "payment-1",
    feeId: UNALLOCATED_FEE_ID,
    amountPaid: 200,
    allocations: [{ feeId: cfId, feeName: "Carried Balance", amountPaid: 200, isOverpayment: false }],
  });

  const summary = getParentFeeSummary([ledger], [payment], TERM, YEAR);

  assert.equal(summary.carryForward.remaining, 0);
  assert.equal(summary.carryForward.outstanding, false);
  assert.equal(summary.carryForward.paid, 200);
  assert.equal(summary.currentTermFees, 600);
  assert.equal(summary.remaining, 600);
});

test("D - a payment that crosses from the carry-forward into the current term fees", () => {
  const cfId = carryForwardFeeId(STUDENT_ID, "2025-2026", "Term 3");
  const ledger = makeLedger({
    id: "ledger-1",
    fees: [
      makeFee({ feeId: cfId, feeName: "Carried Balance (Term 3, 2025-2026)", amount: 200 }),
      makeFee({ feeId: "fee-tuition", feeName: "Tuition", amount: 600 }),
    ],
  });
  const payments = [
    makePayment({ id: "payment-1", feeId: cfId, amountPaid: 200 }),
    makePayment({ id: "payment-2", feeId: "fee-tuition", amountPaid: 100 }),
  ];

  const state = enrichParentFeeLedgers([ledger], payments, TERM);
  assert.equal(findFee(state, cfId).actualBalance, 0);
  assert.equal(findFee(state, "fee-tuition").actualBalance, 500);

  const summary = getParentFeeSummary([ledger], payments, TERM, YEAR);
  assert.equal(summary.carryForward.remaining, 0);
  assert.equal(summary.totalPaid, 300);
  assert.equal(summary.remaining, 500);
});

test("D2 - the admin auto-allocation shape credits every allocation", () => {
  const cfId = carryForwardFeeId(STUDENT_ID, "2025-2026", "Term 3");
  const ledger = makeLedger({
    id: "ledger-1",
    fees: [
      makeFee({ feeId: cfId, feeName: "Carried Balance (Term 3, 2025-2026)", amount: 200 }),
      makeFee({ feeId: "fee-tuition", feeName: "Tuition", amount: 600 }),
    ],
  });
  const payment = makePayment({
    id: "payment-1",
    feeId: UNALLOCATED_FEE_ID,
    amountPaid: 300,
    allocations: [
      { feeId: cfId, feeName: "Carried Balance", amountPaid: 200, isOverpayment: false },
      { feeId: "fee-tuition", feeName: "Tuition", amountPaid: 100, isOverpayment: false },
    ],
  });

  const state = enrichParentFeeLedgers([ledger], [payment], TERM);
  assert.equal(findFee(state, cfId).actualPaid, 200);
  assert.equal(findFee(state, cfId).actualBalance, 0);
  assert.equal(findFee(state, "fee-tuition").actualPaid, 100);
  assert.equal(findFee(state, "fee-tuition").actualBalance, 500);

  const summary = getParentFeeSummary([ledger], [payment], TERM, YEAR);
  assert.equal(summary.carryForward.paid, 200);
  assert.equal(summary.carryForward.remaining, 0);
  assert.equal(summary.totalPaid, 300);
  assert.equal(summary.remaining, 500);
  assert.equal(summary.unallocatedPaid, 0);
});

test("D3 - the parent portal payment shape is counted once and stays consistent", () => {
  const cfId = carryForwardFeeId(STUDENT_ID, "2025-2026", "Term 3");
  const ledger = makeLedger({
    id: "ledger-1",
    fees: [
      makeFee({ feeId: cfId, feeName: "Carried Balance (Term 3, 2025-2026)", amount: 200 }),
      makeFee({ feeId: "fee-tuition", feeName: "Tuition", amount: 600 }),
    ],
  });
  const payment = makePayment({
    id: "payment-1",
    feeId: ONLINE_PAYMENT_FEE_ID,
    amountPaid: 300,
  });

  const state = enrichParentFeeLedgers([ledger], [payment], TERM);
  const summary = getParentFeeSummary([ledger], [payment], TERM, YEAR);

  assert.equal(summary.totalPaid, 300);
  assert.equal(summary.remaining, 500);
  assert.equal(summary.totalDue, 800);

  // The portal payment carries no fee id, so it cannot be credited to a fee.
  // It is reported as unallocated instead of being pushed onto an arbitrary fee.
  assert.equal(summary.unallocatedPaid, 300);
  const creditedToFees = state
    .flatMap((entry) => entry.allFees)
    .reduce((sum, fee) => sum + fee.actualPaid, 0);
  assert.equal(creditedToFees + summary.unallocatedPaid, summary.totalPaid);

  // The fee rows never claim less debt than the summary does.
  const feeBalances = state
    .flatMap((entry) => entry.allFees)
    .reduce((sum, fee) => sum + fee.actualBalance, 0);
  assert.ok(summary.remaining <= feeBalances);
});

test("E - a student without a carry-forward keeps the ordinary behaviour", () => {
  const ledger = makeLedger({
    id: "ledger-1",
    fees: [makeFee({ feeId: "fee-tuition", feeName: "Tuition", amount: 600 })],
  });

  const summary = getParentFeeSummary([ledger], [], TERM, YEAR);

  assert.equal(summary.carryForward, null);
  assert.equal(summary.currentTermFees, 600);
  assert.equal(summary.totalDue, 600);
  assert.equal(summary.totalPaid, 0);
  assert.equal(summary.remaining, 600);
});

test("F - a fully paid carry-forward is not reported as an outstanding debt", () => {
  const cfId = carryForwardFeeId(STUDENT_ID, "2025-2026", "Term 3");
  const ledger = makeLedger({
    id: "ledger-1",
    fees: [
      makeFee({ feeId: cfId, feeName: "Carried Balance (Term 3, 2025-2026)", amount: 200 }),
      makeFee({ feeId: "fee-tuition", feeName: "Tuition", amount: 600 }),
    ],
  });
  const payment = makePayment({
    id: "payment-1",
    feeId: UNALLOCATED_FEE_ID,
    amountPaid: 200,
    allocations: [{ feeId: cfId, feeName: "Carried Balance", amountPaid: 200, isOverpayment: false }],
  });

  const state = enrichParentFeeLedgers([ledger], [payment], TERM);
  const summary = getParentFeeSummary([ledger], [payment], TERM, YEAR);

  assert.equal(summary.carryForward.outstanding, false);
  assert.equal(summary.carryForward.remaining, 0);
  assert.equal(findFee(state, cfId).actualBalance, 0);
  assert.equal(findFee(state, cfId).actualStatus, "Paid");
  // The current term fees are untouched by the carry-forward payment.
  assert.equal(summary.currentTermFees, 600);
  assert.equal(findFee(state, "fee-tuition").actualBalance, 600);
  assert.equal(summary.remaining, 600);
});

test("G1 - a same year rollover is not counted twice", () => {
  const cfId = carryForwardFeeId(STUDENT_ID, YEAR, "Term 1");
  const previous = makeLedger({
    id: "ledger-term-1",
    academicYear: YEAR,
    term: "Term 1",
    fees: [makeFee({ feeId: "fee-tuition", feeName: "Tuition", amount: 500 })],
  });
  const current = makeLedger({
    id: "ledger-term-2",
    academicYear: YEAR,
    term: "Term 2",
    fees: [
      makeFee({ feeId: cfId, feeName: "Carried Balance (Term 1, 2026-2027)", amount: 200 }),
      makeFee({ feeId: "fee-tuition-2", feeName: "Tuition", amount: 600 }),
    ],
  });
  const payments = [
    makePayment({ id: "payment-1", feeId: "fee-tuition", amountPaid: 300, term: "Term 1" }),
    makePayment({ id: "payment-2", feeId: ONLINE_PAYMENT_FEE_ID, amountPaid: 300, term: "Term 2" }),
  ];

  const summary = getParentFeeSummary([previous, current], payments, "all", YEAR);

  assert.equal(summary.totalDue, 800);
  assert.notEqual(summary.totalDue, 1300);
  assert.equal(summary.totalPaid, 300);
  assert.equal(summary.remaining, 500);
});

test("G2 - a cross year rollover is not counted twice", () => {
  const cfId = carryForwardFeeId(STUDENT_ID, "2025-2026", "Term 3");
  const previous = makeLedger({
    id: "ledger-term-3",
    academicYear: "2025-2026",
    term: "Term 3",
    fees: [makeFee({ feeId: "fee-tuition", feeName: "Tuition", amount: 500 })],
  });
  const current = makeLedger({
    id: "ledger-term-1",
    academicYear: YEAR,
    term: "Term 1",
    fees: [
      makeFee({ feeId: cfId, feeName: "Carried Balance (Term 3, 2025-2026)", amount: 200 }),
      makeFee({ feeId: "fee-tuition-1", feeName: "Tuition", amount: 600 }),
    ],
  });
  const payments = [
    makePayment({
      id: "payment-1",
      feeId: "fee-tuition",
      amountPaid: 300,
      academicYear: "2025-2026",
      term: "Term 3",
    }),
    makePayment({ id: "payment-2", feeId: ONLINE_PAYMENT_FEE_ID, amountPaid: 300 }),
  ];

  const summary = getParentFeeSummary([previous, current], payments, "all", YEAR);

  assert.equal(summary.totalDue, 800);
  assert.equal(summary.totalPaid, 300);
  assert.equal(summary.remaining, 500);
});

test("G3 - the previous term can still be inspected on its own", () => {
  const cfId = carryForwardFeeId(STUDENT_ID, YEAR, "Term 1");
  const previous = makeLedger({
    id: "ledger-term-1",
    academicYear: YEAR,
    term: "Term 1",
    fees: [makeFee({ feeId: "fee-tuition", feeName: "Tuition", amount: 500 })],
  });
  const current = makeLedger({
    id: "ledger-term-2",
    academicYear: YEAR,
    term: "Term 2",
    fees: [
      makeFee({ feeId: cfId, feeName: "Carried Balance (Term 1, 2026-2027)", amount: 200 }),
      makeFee({ feeId: "fee-tuition-2", feeName: "Tuition", amount: 600 }),
    ],
  });
  const payments = [
    makePayment({ id: "payment-1", feeId: "fee-tuition", amountPaid: 300, term: "Term 1" }),
  ];

  const summary = getParentFeeSummary([previous, current], payments, "Term 1", YEAR);

  assert.equal(summary.totalDue, 500);
  assert.equal(summary.totalPaid, 300);
  assert.equal(summary.remaining, 200);
  assert.equal(summary.carryForward, null);
});

test("H - two students stay completely separated", () => {
  const firstLedger = makeLedger({
    id: "ledger-1",
    studentId: STUDENT_ID,
    fees: [makeFee({ feeId: "fee-tuition", feeName: "Tuition", amount: 600 })],
  });
  const secondLedger = makeLedger({
    id: "ledger-2",
    studentId: OTHER_STUDENT_ID,
    fees: [makeFee({ feeId: "fee-tuition", feeName: "Tuition", amount: 900 })],
  });
  const payments = [
    makePayment({ id: "payment-1", studentId: STUDENT_ID, feeId: "fee-tuition", amountPaid: 100 }),
    makePayment({ id: "payment-2", studentId: OTHER_STUDENT_ID, feeId: "fee-tuition", amountPaid: 400 }),
  ];

  const first = getParentFeeSummary([firstLedger, secondLedger], payments, TERM, YEAR, {
    studentId: STUDENT_ID,
  });
  const second = getParentFeeSummary([firstLedger, secondLedger], payments, TERM, YEAR, {
    studentId: OTHER_STUDENT_ID,
  });

  assert.equal(first.studentId, STUDENT_ID);
  assert.equal(first.totalDue, 600);
  assert.equal(first.totalPaid, 100);
  assert.equal(first.remaining, 500);

  assert.equal(second.studentId, OTHER_STUDENT_ID);
  assert.equal(second.totalDue, 900);
  assert.equal(second.totalPaid, 400);
  assert.equal(second.remaining, 500);
});

test("I - a payment of another student never touches this student", () => {
  const ledger = makeLedger({
    id: "ledger-1",
    fees: [makeFee({ feeId: "fee-tuition", feeName: "Tuition", amount: 600 })],
  });
  const payments = [
    makePayment({
      id: "payment-1",
      studentId: OTHER_STUDENT_ID,
      feeId: "fee-tuition",
      amountPaid: 500,
    }),
    makePayment({
      id: "payment-2",
      studentId: OTHER_STUDENT_ID,
      feeId: ONLINE_PAYMENT_FEE_ID,
      amountPaid: 500,
    }),
  ];

  const summary = getParentFeeSummary([ledger], payments, TERM, YEAR);

  assert.equal(summary.totalDue, 600);
  assert.equal(summary.totalPaid, 0);
  assert.equal(summary.remaining, 600);
  assert.equal(summary.unallocatedPaid, 0);
});

test("J - a fee that only looks like a carry-forward is not one", () => {
  const ledger = makeLedger({
    id: "ledger-1",
    fees: [
      makeFee({
        feeId: "fee-books",
        feeName: "Carried Balance (Term 3, 2025-2026)",
        amount: 200,
      }),
      makeFee({ feeId: "fee-tuition", feeName: "Tuition", amount: 600 }),
    ],
  });

  const state = enrichParentFeeLedgers([ledger], [], TERM);
  const summary = getParentFeeSummary([ledger], [], TERM, YEAR);

  assert.equal(summary.carryForward, null);
  assert.equal(findFee(state, "fee-books").isCarryForward, false);
  assert.equal(summary.currentTermFees, 800);
  assert.equal(summary.totalDue, 800);
});

test("K - an opening payment is not counted twice", () => {
  const ledger = makeLedger({
    id: "ledger-1",
    fees: [makeFee({ feeId: "fee-tuition", feeName: "Tuition", amount: 600, openingPaidAmount: 100 })],
  });
  const payments = [
    makePayment({
      id: "payment-1",
      feeId: "fee-tuition",
      amountPaid: 100,
      isOpeningPayment: true,
    }),
  ];

  const state = enrichParentFeeLedgers([ledger], payments, TERM);
  const summary = getParentFeeSummary([ledger], payments, TERM, YEAR);

  // The opening paid amount already carries the money, the opening payment
  // document must not be added on top of it.
  assert.equal(findFee(state, "fee-tuition").actualPaid, 100);
  assert.equal(findFee(state, "fee-tuition").actualBalance, 500);
  assert.equal(summary.totalPaid, 100);
  assert.equal(summary.remaining, 500);
});

test("K2 - a ledger level opening paid amount is honoured", () => {
  const ledger = makeLedger({
    id: "ledger-1",
    fees: [makeFee({ feeId: "fee-tuition", feeName: "Tuition", amount: 600 })],
    openingPaidAmount: 300,
  });

  const summary = getParentFeeSummary([ledger], [], TERM, YEAR);

  assert.equal(summary.totalPaid, 300);
  assert.equal(summary.remaining, 300);
});

test("L - payments of another term or another year are excluded", () => {
  const ledger = makeLedger({
    id: "ledger-1",
    fees: [makeFee({ feeId: "fee-tuition", feeName: "Tuition", amount: 600 })],
  });
  const payments = [
    makePayment({ id: "payment-1", feeId: "fee-tuition", amountPaid: 300, term: "Term 2" }),
    makePayment({
      id: "payment-2",
      feeId: "fee-tuition",
      amountPaid: 300,
      academicYear: "2025-2026",
      term: "Term 3",
    }),
  ];

  const summary = getParentFeeSummary([ledger], payments, TERM, YEAR);

  assert.equal(summary.totalPaid, 0);
  assert.equal(summary.remaining, 600);
});

test("M - the engine agrees with the administrator carry-forward review", () => {
  const cfId = carryForwardFeeId(STUDENT_ID, "2025-2026", "Term 3");
  const ledger = makeLedger({
    id: "ledger-1",
    fees: [
      makeFee({ feeId: cfId, feeName: "Carried Balance (Term 3, 2025-2026)", amount: 200 }),
      makeFee({ feeId: "fee-tuition", feeName: "Tuition", amount: 600 }),
    ],
  });
  const payments = [
    makePayment({
      id: "payment-1",
      feeId: UNALLOCATED_FEE_ID,
      amountPaid: 100,
      allocations: [{ feeId: cfId, feeName: "Carried Balance", amountPaid: 100, isOverpayment: false }],
    }),
  ];

  const summary = getParentFeeSummary([ledger], payments, TERM, YEAR);
  const rows = buildCarryForwardRows({
    ledgers: [ledger],
    payments,
    students: [{ id: STUDENT_ID, name: "Ama Serwa", classId: "class-1" }],
    schoolId: SCHOOL_ID,
    academicYear: YEAR,
    term: TERM,
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].outstandingAmount, summary.carryForward.remaining);
  assert.equal(rows[0].carriedAmount, summary.carryForward.amount);
  assert.equal(rows[0].paidAmount, summary.carryForward.paid);
  assert.equal(rows[0].fromAcademicYear, summary.carryForward.fromAcademicYear);
  assert.equal(rows[0].fromTerm, summary.carryForward.fromTerm);
});

test("N - the historical totals shape is preserved", () => {
  const ledger = makeLedger({
    id: "ledger-1",
    fees: [makeFee({ feeId: "fee-tuition", feeName: "Tuition", amount: 600 })],
  });
  const payment = makePayment({ id: "payment-1", feeId: "fee-tuition", amountPaid: 100 });

  const result = getParentFeeTotals([ledger], [payment], TERM, YEAR);

  assert.ok(Array.isArray(result.enrichedLedgers));
  assert.ok(Array.isArray(result.billLedgers));
  assert.equal(result.billLedgers.length, 1);
  assert.equal(result.totals.totalFees, 600);
  assert.equal(result.totals.totalPaid, 100);
  assert.equal(result.totals.totalBalance, 500);
  assert.equal(result.summary.remaining, 500);
  assert.equal(result.enrichedLedgers[0].actualBalance, 500);
});

test("N2 - a fully paid admission fee stays out of the row list but not out of the totals", () => {
  const ledger = makeLedger({
    id: "ledger-1",
    fees: [
      makeFee({ feeId: "fee-admission", feeName: "Admission Fee", amount: 200 }),
      makeFee({ feeId: "fee-tuition", feeName: "Tuition", amount: 600 }),
    ],
  });
  const payment = makePayment({ id: "payment-1", feeId: "fee-admission", amountPaid: 200 });

  const result = getParentFeeTotals([ledger], [payment], TERM, YEAR);
  const visible = result.enrichedLedgers[0].fees.map((fee) => fee.feeId);
  const all = result.enrichedLedgers[0].allFees.map((fee) => fee.feeId);

  assert.ok(!visible.includes("fee-admission"));
  assert.ok(all.includes("fee-admission"));
  assert.equal(result.totals.totalFees, 800);
  assert.equal(result.totals.totalPaid, 200);
  assert.equal(result.totals.totalBalance, 600);
});

test("O - term labels are normalised", () => {
  assert.equal(normalizeParentFeeTerm("1"), "Term 1");
  assert.equal(normalizeParentFeeTerm("term1"), "Term 1");
  assert.equal(normalizeParentFeeTerm("Term 3"), "Term 3");
  assert.equal(normalizeParentFeeTerm("Term3"), "Term 3");
  assert.equal(normalizeParentFeeTerm(undefined), "");
});
