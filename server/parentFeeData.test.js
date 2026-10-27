// Parent data-path tests.
//
// Pure unit tests over services/parentFeeData.js (the Parent only data path
// that prepares the data for the verified financial engine
// services/parentFees.js).
//
// No database, no network.
//
// Run with: node --test server/parentFeeData.test.js

import test from "node:test";
import assert from "node:assert/strict";

import {
  buildParentPaymentHistory,
  describePaymentAllocation,
  mergeParentLedgers,
} from "../services/parentFeeData.js";
import { getParentFeeSummary } from "../services/parentFees.js";
import { buildCarryForwardId } from "../services/termBalanceCarryForward.js";

const SCHOOL_ID = "school-1";
const STUDENT_ID = "student-1";
const OTHER_STUDENT_ID = "student-2";
const YEAR = "2026-2027";
const TERM = "Term 1";
const UNALLOCATED_FEE_ID = "__OVERPAYMENT__";

const CF_ID = buildCarryForwardId(SCHOOL_ID, STUDENT_ID, "2025-2026", "Term 3");

const makeLedger = ({ id, academicYear = YEAR, term = TERM, fees = [] }) => ({
  id,
  schoolId: SCHOOL_ID,
  studentId: STUDENT_ID,
  classId: "class-1",
  academicYear,
  term,
  fees,
  openingPaidAmount: 0,
  totalFee: fees.reduce((sum, fee) => sum + fee.amount, 0),
  createdAt: 0,
});

const makeFee = ({ feeId, feeName, amount }) => ({
  feeId,
  feeName,
  amount,
  openingPaidAmount: 0,
});

const makePayment = ({
  id,
  studentId = STUDENT_ID,
  feeId,
  amountPaid,
  academicYear = YEAR,
  term = TERM,
  allocations,
  createdAt = 0,
}) => {
  const payment = {
    id,
    schoolId: SCHOOL_ID,
    studentId,
    classId: "class-1",
    feeId,
    feeName: "School Fees",
    amountPaid,
    paymentMethod: "MoMo",
    academicYear,
    term,
    recordedBy: "admin",
    createdAt,
  };
  if (allocations) payment.allocations = allocations;
  return payment;
};

// --- mergeParentLedgers ---------------------------------------------------

test("merge keeps the canonical ledger and restores the missing carry-forward entry", () => {
  const canonical = makeLedger({
    id: "ledger-1",
    fees: [makeFee({ feeId: "fee-tuition", feeName: "Tuition", amount: 600 })],
  });
  const alternate = makeLedger({
    id: "ledger-1",
    fees: [
      makeFee({ feeId: CF_ID, feeName: "Carried Balance (Term 3, 2025-2026)", amount: 200 }),
      makeFee({ feeId: "fee-tuition", feeName: "Tuition", amount: 600 }),
    ],
  });

  const merged = mergeParentLedgers([canonical], [alternate]);

  assert.equal(merged.length, 1);
  const feeIds = merged[0].fees.map((fee) => fee.feeId);
  assert.deepEqual(feeIds.sort(), ["fee-tuition", CF_ID].sort());
  assert.equal(merged[0].totalFee, 800);
});

test("merge never duplicates a fee", () => {
  const canonical = makeLedger({
    id: "ledger-1",
    fees: [
      makeFee({ feeId: CF_ID, feeName: "Carried Balance", amount: 200 }),
      makeFee({ feeId: "fee-tuition", feeName: "Tuition", amount: 600 }),
    ],
  });
  const alternate = makeLedger({
    id: "ledger-1",
    fees: [
      makeFee({ feeId: CF_ID, feeName: "Carried Balance", amount: 200 }),
      makeFee({ feeId: "fee-tuition", feeName: "Tuition", amount: 600 }),
    ],
  });

  const merged = mergeParentLedgers([canonical], [alternate]);

  assert.equal(merged[0].fees.length, 2);
  assert.equal(
    new Set(merged[0].fees.map((fee) => fee.feeId)).size,
    merged[0].fees.length,
  );
});

test("merge never resurrects an ordinary fee the canonical copy dropped", () => {
  const canonical = makeLedger({
    id: "ledger-1",
    fees: [makeFee({ feeId: "fee-tuition", feeName: "Tuition", amount: 600 })],
  });
  const alternate = makeLedger({
    id: "ledger-1",
    fees: [
      makeFee({ feeId: "fee-removed", feeName: "Removed Fee", amount: 250 }),
      makeFee({ feeId: "fee-tuition", feeName: "Tuition", amount: 600 }),
    ],
  });

  const merged = mergeParentLedgers([canonical], [alternate]);

  assert.deepEqual(merged[0].fees.map((fee) => fee.feeId), ["fee-tuition"]);
  assert.equal(merged[0].totalFee, 600);
});

test("merge keeps a ledger that only exists in the other layout", () => {
  const canonical = makeLedger({ id: "ledger-1" });
  const alternate = makeLedger({
    id: "ledger-2",
    fees: [makeFee({ feeId: "fee-tuition", feeName: "Tuition", amount: 600 })],
  });

  const merged = mergeParentLedgers([canonical], [alternate]);

  assert.equal(merged.length, 2);
  assert.equal(merged[1].id, "ledger-2");
});

test("merge is a no-op when only one layout holds the ledger", () => {
  const canonical = makeLedger({
    id: "ledger-1",
    fees: [makeFee({ feeId: "fee-tuition", feeName: "Tuition", amount: 600 })],
  });

  const merged = mergeParentLedgers([canonical], []);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].fees.length, 1);
});

// --- payment history -------------------------------------------------------

test("an allocation shaped payment is not hidden from the payment history", () => {
  const payment = makePayment({
    id: "payment-1",
    feeId: UNALLOCATED_FEE_ID,
    amountPaid: 300,
    allocations: [
      { feeId: CF_ID, feeName: "Carried Balance", amountPaid: 200, isOverpayment: false },
      { feeId: "fee-tuition", feeName: "Tuition", amountPaid: 100, isOverpayment: false },
    ],
  });

  const history = buildParentPaymentHistory([payment], {
    studentId: STUDENT_ID,
    academicYear: YEAR,
    term: TERM,
    feeIds: ["fee-tuition"],
    feeNameById: new Map([
      [CF_ID, "Carried Balance (Term 3, 2025-2026)"],
      ["fee-tuition", "Tuition"],
    ]),
  });

  assert.equal(history.length, 1);
  assert.equal(history[0].allocationDescription, "Carried Balance (Term 3, 2025-2026) (GHS 200.00), Tuition (GHS 100.00)");
  assert.equal(history[0].displayLabel, history[0].allocationDescription);
  assert.equal(history[0].appliedToOverallBalance, false);
});

test("a portal payment without allocation is shown as an overall balance payment", () => {
  const payment = makePayment({
    id: "payment-1",
    feeId: "online_payment",
    amountPaid: 300,
  });

  const history = buildParentPaymentHistory([payment], {
    studentId: STUDENT_ID,
    academicYear: YEAR,
    term: TERM,
    feeIds: [],
  });

  assert.equal(history.length, 1);
  assert.equal(history[0].appliedToOverallBalance, true);
  assert.equal(history[0].displayLabel, "Applied to overall balance");
  assert.equal(history[0].allocationDescription, "");
});

test("the payment history never shows another student, year or term", () => {
  const payments = [
    makePayment({ id: "p1", feeId: "fee-tuition", amountPaid: 100 }),
    makePayment({ id: "p2", studentId: OTHER_STUDENT_ID, feeId: "fee-tuition", amountPaid: 500 }),
    makePayment({ id: "p3", feeId: "fee-tuition", amountPaid: 300, term: "Term 2" }),
    makePayment({ id: "p4", feeId: "fee-tuition", amountPaid: 300, academicYear: "2025-2026" }),
  ];

  const history = buildParentPaymentHistory(payments, {
    studentId: STUDENT_ID,
    academicYear: YEAR,
    term: TERM,
    feeIds: ["fee-tuition"],
  });

  assert.deepEqual(history.map((entry) => entry.id), ["p1"]);
});

test("the payment history is sorted newest first for every date shape", () => {
  const payments = [
    makePayment({ id: "old", feeId: "fee-tuition", amountPaid: 1, createdAt: 1000 }),
    makePayment({ id: "new", feeId: "fee-tuition", amountPaid: 2, createdAt: 3000 }),
    makePayment({ id: "middle", feeId: "fee-tuition", amountPaid: 3, createdAt: 2000 }),
  ];

  const history = buildParentPaymentHistory(payments, {
    studentId: STUDENT_ID,
    academicYear: YEAR,
    term: TERM,
    feeIds: ["fee-tuition"],
  });

  assert.deepEqual(history.map((entry) => entry.id), ["new", "middle", "old"]);
});

test("an allocation is described with the fee name of the ledger", () => {
  const payment = makePayment({
    id: "payment-1",
    feeId: UNALLOCATED_FEE_ID,
    amountPaid: 200,
    allocations: [{ feeId: CF_ID, amountPaid: 200, isOverpayment: false }],
  });

  const description = describePaymentAllocation(
    payment,
    new Map([[CF_ID, "Carried Balance (Term 3, 2025-2026)"]]),
  );

  assert.equal(description, "Carried Balance (Term 3, 2025-2026) (GHS 200.00)");
});

// --- data path -> financial engine ----------------------------------------

test("the v1 and the v2 layout produce the same financial truth", () => {
  const tuition = makeFee({ feeId: "fee-tuition", feeName: "Tuition", amount: 600 });
  const carryForward = makeFee({
    feeId: CF_ID,
    feeName: "Carried Balance (Term 3, 2025-2026)",
    amount: 200,
  });
  const payment = makePayment({
    id: "payment-1",
    feeId: UNALLOCATED_FEE_ID,
    amountPaid: 300,
    allocations: [
      { feeId: CF_ID, feeName: "Carried Balance", amountPaid: 200, isOverpayment: false },
      { feeId: "fee-tuition", feeName: "Tuition", amountPaid: 100, isOverpayment: false },
    ],
  });

  // v1: the canonical copy already holds the carry-forward entry
  const v1Ledgers = mergeParentLedgers(
    [makeLedger({ id: "ledger-1", fees: [carryForward, tuition] })],
    [],
  );

  // v2 with a leftover copy in the other layout: the canonical copy lost the
  // carry-forward entry, the other layout still holds it
  const v2Ledgers = mergeParentLedgers(
    [makeLedger({ id: "ledger-1", fees: [tuition] })],
    [makeLedger({ id: "ledger-1", fees: [carryForward, tuition] })],
  );

  const v1 = getParentFeeSummary(v1Ledgers, [payment], TERM, YEAR);
  const v2 = getParentFeeSummary(v2Ledgers, [payment], TERM, YEAR);

  assert.equal(v1.carryForward.amount, 200);
  assert.equal(v1.currentTermFees, 600);
  assert.equal(v1.totalDue, 800);
  assert.equal(v1.totalPaid, 300);
  assert.equal(v1.remaining, 500);

  assert.deepEqual(
    {
      carryForward: v2.carryForward.amount,
      currentTermFees: v2.currentTermFees,
      totalDue: v2.totalDue,
      totalPaid: v2.totalPaid,
      remaining: v2.remaining,
    },
    {
      carryForward: v1.carryForward.amount,
      currentTermFees: v1.currentTermFees,
      totalDue: v1.totalDue,
      totalPaid: v1.totalPaid,
      remaining: v1.remaining,
    },
  );
  assert.equal(v2.carryForward.remaining, 0);
  assert.equal(v2.remaining, 500);
});

test("a fully paid carry-forward is not an outstanding debt after the merge", () => {
  const tuition = makeFee({ feeId: "fee-tuition", feeName: "Tuition", amount: 600 });
  const carryForward = makeFee({
    feeId: CF_ID,
    feeName: "Carried Balance (Term 3, 2025-2026)",
    amount: 200,
  });
  const payment = makePayment({
    id: "payment-1",
    feeId: UNALLOCATED_FEE_ID,
    amountPaid: 200,
    allocations: [
      { feeId: CF_ID, feeName: "Carried Balance", amountPaid: 200, isOverpayment: false },
    ],
  });

  const ledgers = mergeParentLedgers(
    [makeLedger({ id: "ledger-1", fees: [tuition] })],
    [makeLedger({ id: "ledger-1", fees: [carryForward, tuition] })],
  );

  const summary = getParentFeeSummary(ledgers, [payment], TERM, YEAR);

  assert.equal(summary.carryForward.outstanding, false);
  assert.equal(summary.carryForward.remaining, 0);
  assert.equal(summary.remaining, 600);
});
