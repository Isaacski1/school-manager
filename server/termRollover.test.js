console.log("Test file started");

import test from "node:test";
import assert from "node:assert/strict";
import {
  createTermRolloverService,
  getNextAcademicPeriod,
  isTermRolloverDue,
} from "./termRollover.js";
import {
  computeCarryForwardBalance,
  buildCarryForwardFeeEntry,
  buildCarryForwardId,
  isCarryForwardFee,
} from "../services/termBalanceCarryForward.js";
import { allocate } from "../services/feeAllocation.js";

test("academic period advances without deleting history", () => {
  assert.deepEqual(getNextAcademicPeriod("Term 1", "2025-2026"), {
    currentTerm: "Term 2",
    academicYear: "2025-2026",
  });
  assert.deepEqual(getNextAcademicPeriod("Term 3", "2025-2026"), {
    currentTerm: "Term 1",
    academicYear: "2026-2027",
  });
});

test("rollover due check respects date and processed state", () => {
  const now = new Date("2026-09-10T10:00:00");
  assert.equal(
    isTermRolloverDue(
      { nextTermBegins: "2026-09-10", termTransitionProcessed: false },
      now,
    ),
    true,
  );
  assert.equal(
    isTermRolloverDue(
      { nextTermBegins: "2026-09-11", termTransitionProcessed: false },
      now,
    ),
    false,
  );
  assert.equal(
    isTermRolloverDue(
      { nextTermBegins: "2026-09-01", termTransitionProcessed: true },
      now,
    ),
    false,
  );
});

test("verified backup is created before operational records reset", async () => {
  const schoolId = "school-1";
  const db = new FakeDb({
    [`settings/${schoolId}`]: {
      schoolId,
      schoolName: "Test School",
      currentTerm: "Term 3",
      academicYear: "2025-2026",
      schoolReopenDate: "2026-01-10",
      vacationDate: "2026-07-20",
      nextTermBegins: "2026-09-10",
      termTransitionProcessed: false,
    },
    [`schools/${schoolId}`]: { name: "Test School", status: "active" },
    "attendance/attendance-1": { schoolId, studentId: "student-1" },
    "teacher_attendance/teacher-attendance-1": {
      schoolId,
      teacherId: "teacher-1",
    },
    "assessments/assessment-1": {
      schoolId,
      studentId: "student-1",
      term: 3,
      academicYear: "2025-2026",
    },
    "student_remarks/remark-1": {
      schoolId,
      studentId: "student-1",
      term: 3,
      academicYear: "2025-2026",
    },
    "fees/tuition-root": {
      schoolId,
      feeName: "Tuition",
      amount: 100,
      term: "Term 3",
      academicYear: "2025-2026",
      feeFrequency: "per_term",
    },
    [`schools/${schoolId}/fees/tuition-v2`]: {
      schoolId,
      feeName: "Tuition",
      amount: 100,
      term: "Term 3",
      academicYear: "2025-2026",
      feeFrequency: "per_term",
    },
    "payments/payment-1": {
      schoolId,
      studentId: "student-1",
      amountPaid: 50,
      term: "Term 3",
      academicYear: "2025-2026",
    },
    [`schools/${schoolId}/payments/payment-v2`]: {
      schoolId,
      studentId: "student-1",
      amountPaid: 50,
      term: "Term 3",
      academicYear: "2025-2026",
    },
    "student_ledgers/ledger-1": {
      schoolId,
      studentId: "student-1",
      term: "Term 3",
      academicYear: "2025-2026",
      fees: [],
    },
    [`schools/${schoolId}/feeLedgers/ledger-v2`]: {
      schoolId,
      studentId: "student-1",
      term: "Term 3",
      academicYear: "2025-2026",
      fees: [],
    },
  });
  const service = createTermRolloverService({
    db,
    FieldValue,
    Timestamp,
    logger: { error: () => {} },
  });

  const result = await service.rolloverSchool(schoolId, {
    now: new Date("2026-09-10T12:00:00"),
    source: "test",
  });

  assert.equal(result.changed, true);
  assert.equal(db.records.has("attendance/attendance-1"), false);
  assert.equal(db.records.has("teacher_attendance/teacher-attendance-1"), false);
  // Payments and ledgers should NOT be deleted to preserve history for carry-forward
  assert.equal(db.records.has("payments/payment-1"), true);
  assert.equal(db.records.has(`schools/${schoolId}/payments/payment-v2`), true);
  assert.equal(db.records.has("student_ledgers/ledger-1"), true);
  assert.equal(db.records.has(`schools/${schoolId}/feeLedgers/ledger-v2`), true);
  assert.equal(db.records.has("fees/tuition-root"), true);
  assert.equal(db.records.has(`schools/${schoolId}/fees/tuition-v2`), true);
  assert.equal(db.records.has("assessments/assessment-1"), true);
  assert.equal(db.records.has("student_remarks/remark-1"), true);

  const settings = db.records.get(`settings/${schoolId}`);
  assert.equal(settings.currentTerm, "Term 1");
  assert.equal(settings.academicYear, "2026-2027");
  assert.equal(settings.schoolReopenDate, "2026-09-10");
  assert.equal(settings.termTransition.status, "completed");

  const backup = db.records.get(`backups/${result.backupId}`);
  assert.equal(backup.status, "verified");
  assert.equal(backup.recordCounts.attendanceRecords, 1);
  assert.equal(backup.recordCounts.assessments, 1);
  assert.equal(backup.recordCounts.fees, 2);
  assert.equal(backup.recordCounts.payments, 2);
  assert.equal(backup.recordCounts.studentLedgers, 2);

  const secondRun = await service.rolloverSchool(schoolId, {
    now: new Date("2026-09-10T12:05:00"),
    source: "test",
  });
  assert.equal(secondRun.changed, false);
  assert.equal(secondRun.reason, "not_due");
});

test("backup failure leaves operational records untouched", async () => {
  const schoolId = "missing-school";
  const db = new FakeDb({
    [`settings/${schoolId}`]: {
      schoolId,
      currentTerm: "Term 1",
      academicYear: "2026-2027",
      vacationDate: "2026-12-10",
      nextTermBegins: "2027-01-10",
      termTransitionProcessed: false,
    },
    "attendance/attendance-1": { schoolId, studentId: "student-1" },
  });
  const service = createTermRolloverService({
    db,
    FieldValue,
    Timestamp,
    logger: { error: () => {} },
  });

  await assert.rejects(
    service.rolloverSchool(schoolId, {
      now: new Date("2027-01-10T12:00:00"),
      source: "test",
    }),
    /does not exist/,
  );
  assert.equal(db.records.has("attendance/attendance-1"), true);
  assert.equal(
    db.records.get(`settings/${schoolId}`).termTransition.status,
    "failed",
  );
});

// --- Tests for termBalanceCarryForward functions ---

test("computeCarryForwardBalance: basic case", () => {
  const ledger = {
    studentId: "student-1",
    academicYear: "2025-2026",
    term: "Term 3",
    fees: [
      { feeId: "fee1", feeName: "Tuition", amount: 500, openingPaidAmount: 0 },
      { feeId: "fee2", feeName: "Lunch", amount: 300, openingPaidAmount: 50 },
    ],
  };
  const payments = [
    {
      studentId: "student-1",
      academicYear: "2025-2026",
      term: "Term 3",
      feeId: "fee1",
      amountPaid: 300, // partial payment for tuition
      isOpeningPayment: false,
    },
    {
      studentId: "student-1",
      academicYear: "2025-2026",
      term: "Term 3",
      feeId: "fee2",
      amountPaid: 300, // full payment for lunch (opening 50 + 250)
      isOpeningPayment: false,
    },
  ];
  // Total due: 500 + 300 = 800
  // Opening paid: 0 + 50 = 50
  // Payments during term: 300 (fee1) + 300 (fee2) = 600
  // Expected carry-forward: 800 - 50 - 600 = 150
  const balance = computeCarryForwardBalance({ ledger, payments });
  assert.equal(balance, 150);
});

test("computeCarryForwardBalance: with overpayment and allocations", () => {
  const ledger = {
    studentId: "student-1",
    academicYear: "2025-2026",
    term: "Term 3",
    fees: [
      { feeId: "fee1", feeName: "Tuition", amount: 500, openingPaidAmount: 0 },
      { feeId: "fee2", feeName: "Lunch", amount: 300, openingPaidAmount: 0 },
    ],
  };
  const payments = [
    {
      studentId: "student-1",
      academicYear: "2025-2026",
      term: "Term 3",
      feeId: "fee1",
      amountPaid: 600, // overpay tuition by 100
      isOpeningPayment: false,
      allocations: [
        { feeId: "fee1", feeName: "Tuition", amountPaid: 500, isOverpayment: false },
        { feeId: "__OVERPAYMENT__", feeName: "Unapplied credit", amountPaid: 100, isOverpayment: true },
      ],
    },
    {
      studentId: "student-1",
      academicYear: "2025-2026",
      term: "Term 3",
      feeId: "fee2",
      amountPaid: 200, // partial payment for lunch
      isOpeningPayment: false,
    },
  ];
  // Total due: 500 + 300 = 800
  // Opening paid: 0
  // Payments during term: 
  //   From allocations: fee1: 500, fee2: 200 -> total 700
  //   (Note: the overpayment allocation is ignored)
  // Expected carry-forward: 800 - 0 - 700 = 100
  const balance = computeCarryForwardBalance({ ledger, payments });
  assert.equal(balance, 100);
});

test("computeCarryForwardBalance: no payments", () => {
  const ledger = {
    studentId: "student-1",
    academicYear: "2025-2026",
    term: "Term 3",
    fees: [
      { feeId: "fee1", feeName: "Tuition", amount: 500, openingPaidAmount: 0 },
      { feeId: "fee2", feeName: "Lunch", amount: 300, openingPaidAmount: 0 },
    ],
  };
  const payments = [];
  // Total due: 800
  // Opening paid: 0
  // Payments during term: 0
  // Expected carry-forward: 800
  const balance = computeCarryForwardBalance({ ledger, payments });
  assert.equal(balance, 800);
});

test("computeCarryForwardBalance: fully paid", () => {
  const ledger = {
    studentId: "student-1",
    academicYear: "2025-2026",
    term: "Term 3",
    fees: [
      { feeId: "fee1", feeName: "Tuition", amount: 500, openingPaidAmount: 0 },
      { feeId: "fee2", feeName: "Lunch", amount: 300, openingPaidAmount: 0 },
    ],
  };
  const payments = [
    {
      studentId: "student-1",
      academicYear: "2025-2026",
      term: "Term 3",
      feeId: "fee1",
      amountPaid: 500,
      isOpeningPayment: false,
    },
    {
      studentId: "student-1",
      academicYear: "2025-2026",
      term: "Term 3",
      feeId: "fee2",
      amountPaid: 300,
      isOpeningPayment: false,
    },
  ];
  // Total due: 800
  // Opening paid: 0
  // Payments during term: 800
  // Expected carry-forward: 0
  const balance = computeCarryForwardBalance({ ledger, payments });
  assert.equal(balance, 0);
});

test("computeCarryForwardBalance: payments from other term or student are ignored", () => {
  const ledger = {
    studentId: "student-1",
    academicYear: "2025-2026",
    term: "Term 3",
    fees: [
      { feeId: "fee1", feeName: "Tuition", amount: 500, openingPaidAmount: 0 },
    ],
  };
  const payments = [
    // Same student, same academic year, but different term (Term 2) -> should be ignored
    {
      studentId: "student-1",
      academicYear: "2025-2026",
      term: "Term 2",
      feeId: "fee1",
      amountPaid: 500,
      isOpeningPayment: false,
    },
    // Same student, same term, but different academic year -> should be ignored
    {
      studentId: "student-1",
      academicYear: "2024-2025",
      term: "Term 3",
      feeId: "fee1",
      amountPaid: 500,
      isOpeningPayment: false,
    },
    // Different student, same academic year and term -> should be ignored
    {
      studentId: "student-2",
      academicYear: "2025-2026",
      term: "Term 3",
      feeId: "fee1",
      amountPaid: 500,
      isOpeningPayment: false,
    },
    // Valid payment
    {
      studentId: "student-1",
      academicYear: "2025-2026",
      term: "Term 3",
      feeId: "fee1",
      amountPaid: 200,
      isOpeningPayment: false,
    },
  ];
  // Total due: 500
  // Opening paid: 0
  // Payments during term (only the last one): 200
  // Expected carry-forward: 300
  const balance = computeCarryForwardBalance({ ledger, payments });
  assert.equal(balance, 300);
});

test("buildCarryForwardFeeEntry: returns null for zero balance", () => {
  const result = {
    studentId: "student-1",
    classId: "class-1",
    carriedBalance: 0,
    fromAcademicYear: "2025-2026",
    fromTerm: "Term 3",
    toAcademicYear: "2026-2027",
    toTerm: "Term 1",
    carryForwardFeeId: "__carry_forward__school-1_student-1_2025-2026_Term3",
  };
  const entry = buildCarryForwardFeeEntry(result);
  assert.equal(entry, null);
});

test("buildCarryForwardFeeEntry: returns fee entry for positive balance", () => {
  const result = {
    studentId: "student-1",
    classId: "class-1",
    carriedBalance: 250,
    fromAcademicYear: "2025-2026",
    fromTerm: "Term 3",
    toAcademicYear: "2026-2027",
    toTerm: "Term 1",
    carryForwardFeeId: "__carry_forward__school-1_student-1_2025-2026_Term3",
  };
  const entry = buildCarryForwardFeeEntry(result);
  assert.notEqual(entry, null);
  assert.equal(entry.feeId, "__carry_forward__school-1_student-1_2025-2026_Term3");
  assert.equal(entry.feeName, "Carried Balance (Term 3, 2025-2026)");
  assert.equal(entry.amount, 250);
  assert.equal(entry.openingPaidAmount, 0);
  assert.equal(entry.openingBalance, 250);
  assert.equal(entry.openingStatus, "Unpaid");
  assert.equal(entry.openingPaidDate, null);
});

test("buildCarryForwardId: generates correct ID", () => {
  const id = buildCarryForwardId("school-1", "student-1", "2025-2026", "Term 3");
  assert.equal(id, "__carry_forward___school-1_student-1_2025-2026_Term3");
  // Test with spaces in academic year and term
  const id2 = buildCarryForwardId("school-1", "student-1", "2025-2026 ", " Term 3 ");
  assert.equal(id2, "__carry_forward___school-1_student-1_2025-2026_Term3");
});

test("isCarryForwardFee: detects carry-forward fee IDs", () => {
  assert.equal(isCarryForwardFee("__carry_forward___school-1_student-1_2025-2026_Term3"), true);
  assert.equal(isCarryForwardFee("regular_fee_id"), false);
  assert.equal(isCarryForwardFee("__carry_forward__"), false); // not enough parts
});



test("carry-forward: end-to-end scenario with v1 storage", async () => {
  const schoolId = "school-1";
  const db = new FakeDb({
    [`settings/${schoolId}`]: {
      schoolId,
      schoolName: "Test School",
      currentTerm: "Term 3",
      academicYear: "2025-2026",
      nextTermBegins: "2026-09-10",
      termTransitionProcessed: false,
    },
    [`schools/${schoolId}`]: { name: "Test School", status: "active" },
    // Previous term ledger: GHS 500 due
    "student_ledgers/ledger-prev": {
      schoolId,
      studentId: "student-1",
      classId: "class-1",
      term: "Term 3",
      academicYear: "2025-2026",
      fees: [
        {
          feeId: "fee-tuition",
          feeName: "Tuition",
          amount: 500,
          openingPaidAmount: 0,
        },
      ],
    },
    // Previous term payment: GHS 300 paid -> GHS 200 outstanding
    "payments/payment-prev": {
      schoolId,
      studentId: "student-1",
      term: "Term 3",
      academicYear: "2025-2026",
      feeId: "fee-tuition",
      amountPaid: 300,
      isOpeningPayment: false,
    },
    // New term ledger already exists with the GHS 600 current term fee
    "student_ledgers/ledger-current": {
      schoolId,
      studentId: "student-1",
      classId: "class-1",
      term: "Term 1",
      academicYear: "2026-2027",
      fees: [
        {
          feeId: "fee-tuition-current",
          feeName: "Tuition",
          amount: 600,
          openingPaidAmount: 0,
        },
      ],
    },
  });
  const service = createTermRolloverService({
    db,
    FieldValue,
    Timestamp,
    logger: { error: () => {} },
  });

  const result = await service.rolloverSchool(schoolId, {
    now: new Date("2026-09-10T12:00:00"),
    source: "test",
  });

  assert.equal(result.changed, true);

  const expectedFeeId = buildCarryForwardId(
    schoolId,
    "student-1",
    "2025-2026",
    "Term 3",
  );

  // The carry-forward fee must be persisted in the student's new term ledger
  const newTermLedger = db.records.get("student_ledgers/ledger-current");
  assert.ok(newTermLedger, "New term ledger must exist");
  assert.equal(newTermLedger.term, "Term 1");
  assert.equal(newTermLedger.academicYear, "2026-2027");

  const carryForwardFees = newTermLedger.fees.filter(
    (fee) => fee.feeId === expectedFeeId,
  );
  assert.equal(carryForwardFees.length, 1, "Exactly one carry-forward fee");
  const carryForwardFee = carryForwardFees[0];
  assert.equal(carryForwardFee.amount, 200);
  assert.equal(carryForwardFee.feeName, "Carried Balance (Term 3, 2025-2026)");
  assert.equal(carryForwardFee.openingPaidAmount, 0);
  assert.equal(carryForwardFee.openingBalance, 200);
  assert.equal(carryForwardFee.openingStatus, "Unpaid");
  assert.equal(carryForwardFee.openingPaidDate, null);

  // The current term fee must not be removed or replaced
  const currentFees = newTermLedger.fees.filter(
    (fee) => fee.feeId === "fee-tuition-current",
  );
  assert.equal(currentFees.length, 1, "Current term fee must be preserved");
  assert.equal(currentFees[0].amount, 600);

  // New term total due = 600 current fee + 200 carried balance = 800
  const totalDue = newTermLedger.fees.reduce(
    (sum, fee) => sum + (Number(fee.amount) || 0),
    0,
  );
  assert.equal(totalDue, 800);

  // Previous term ledger and payment remain untouched
  const previousLedger = db.records.get("student_ledgers/ledger-prev");
  assert.equal(previousLedger.term, "Term 3");
  assert.equal(previousLedger.academicYear, "2025-2026");
  assert.equal(previousLedger.fees.length, 1);
  assert.equal(previousLedger.fees[0].amount, 500);
  assert.equal(previousLedger.fees[0].openingPaidAmount, 0);

  const previousPayment = db.records.get("payments/payment-prev");
  assert.equal(previousPayment.amountPaid, 300);
  assert.equal(previousPayment.term, "Term 3");
});

test("carry-forward: end-to-end scenario with v2 storage", async () => {
  const schoolId = "school-1";
  const db = new FakeDb({
    [`settings/${schoolId}`]: {
      schoolId,
      schoolName: "Test School",
      currentTerm: "Term 3",
      academicYear: "2025-2026",
      nextTermBegins: "2026-09-10",
      termTransitionProcessed: false,
    },
    [`schools/${schoolId}`]: { name: "Test School", status: "active" },
    [`schools/${schoolId}/financeSettings/main`]: { financeVersion: "v2" },
    // Previous term ledger: GHS 500 due
    [`schools/${schoolId}/feeLedgers/ledger-prev`]: {
      schoolId,
      studentId: "student-1",
      classId: "class-1",
      term: "Term 3",
      academicYear: "2025-2026",
      fees: [
        {
          feeId: "fee-tuition",
          feeName: "Tuition",
          amount: 500,
          openingPaidAmount: 0,
        },
      ],
    },
    // Previous term payment: GHS 300 paid -> GHS 200 outstanding
    [`schools/${schoolId}/payments/payment-prev`]: {
      schoolId,
      studentId: "student-1",
      term: "Term 3",
      academicYear: "2025-2026",
      feeId: "fee-tuition",
      amountPaid: 300,
      isOpeningPayment: false,
    },
    // New term ledger already exists with the GHS 600 current term fee
    [`schools/${schoolId}/feeLedgers/ledger-current`]: {
      schoolId,
      studentId: "student-1",
      classId: "class-1",
      term: "Term 1",
      academicYear: "2026-2027",
      fees: [
        {
          feeId: "fee-tuition-current",
          feeName: "Tuition",
          amount: 600,
          openingPaidAmount: 0,
        },
      ],
    },
  });
  const service = createTermRolloverService({
    db,
    FieldValue,
    Timestamp,
    logger: { error: () => {} },
  });

  const result = await service.rolloverSchool(schoolId, {
    now: new Date("2026-09-10T12:00:00"),
    source: "test",
  });

  assert.equal(result.changed, true);

  const expectedFeeId = buildCarryForwardId(
    schoolId,
    "student-1",
    "2025-2026",
    "Term 3",
  );

  // The carry-forward fee must be persisted in the v2 new term ledger
  const newTermLedger = db.records.get(
    `schools/${schoolId}/feeLedgers/ledger-current`,
  );
  assert.ok(newTermLedger, "New term v2 ledger must exist");
  assert.equal(newTermLedger.term, "Term 1");
  assert.equal(newTermLedger.academicYear, "2026-2027");

  const carryForwardFees = newTermLedger.fees.filter(
    (fee) => fee.feeId === expectedFeeId,
  );
  assert.equal(carryForwardFees.length, 1, "Exactly one carry-forward fee");
  const carryForwardFee = carryForwardFees[0];
  assert.equal(carryForwardFee.amount, 200);
  assert.equal(carryForwardFee.feeName, "Carried Balance (Term 3, 2025-2026)");
  assert.equal(carryForwardFee.openingPaidAmount, 0);
  assert.equal(carryForwardFee.openingBalance, 200);
  assert.equal(carryForwardFee.openingStatus, "Unpaid");
  assert.equal(carryForwardFee.openingPaidDate, null);

  // The current term fee must not be removed or replaced
  const currentFees = newTermLedger.fees.filter(
    (fee) => fee.feeId === "fee-tuition-current",
  );
  assert.equal(currentFees.length, 1, "Current term fee must be preserved");
  assert.equal(currentFees[0].amount, 600);

  // New term total due = 600 current fee + 200 carried balance = 800
  const totalDue = newTermLedger.fees.reduce(
    (sum, fee) => sum + (Number(fee.amount) || 0),
    0,
  );
  assert.equal(totalDue, 800);

  // Previous term v2 ledger and payment remain untouched
  const previousLedger = db.records.get(
    `schools/${schoolId}/feeLedgers/ledger-prev`,
  );
  assert.equal(previousLedger.term, "Term 3");
  assert.equal(previousLedger.fees.length, 1);
  assert.equal(previousLedger.fees[0].amount, 500);

  const previousPayment = db.records.get(
    `schools/${schoolId}/payments/payment-prev`,
  );
  assert.equal(previousPayment.amountPaid, 300);
});

test("carry-forward: idempotency when the rollover is repeated", async () => {
  const schoolId = "school-1";
  const db = new FakeDb({
    [`settings/${schoolId}`]: {
      schoolId,
      schoolName: "Test School",
      currentTerm: "Term 3",
      academicYear: "2025-2026",
      nextTermBegins: "2026-09-10",
      termTransitionProcessed: false,
    },
    [`schools/${schoolId}`]: { name: "Test School", status: "active" },
    "student_ledgers/ledger-prev": {
      schoolId,
      studentId: "student-1",
      classId: "class-1",
      term: "Term 3",
      academicYear: "2025-2026",
      fees: [
        {
          feeId: "fee-tuition",
          feeName: "Tuition",
          amount: 500,
          openingPaidAmount: 0,
        },
      ],
    },
    "payments/payment-prev": {
      schoolId,
      studentId: "student-1",
      term: "Term 3",
      academicYear: "2025-2026",
      feeId: "fee-tuition",
      amountPaid: 300,
      isOpeningPayment: false,
    },
    "student_ledgers/ledger-current": {
      schoolId,
      studentId: "student-1",
      classId: "class-1",
      term: "Term 1",
      academicYear: "2026-2027",
      fees: [
        {
          feeId: "fee-tuition-current",
          feeName: "Tuition",
          amount: 600,
          openingPaidAmount: 0,
        },
      ],
    },
  });
  const service = createTermRolloverService({
    db,
    FieldValue,
    Timestamp,
    logger: { error: () => {} },
  });

  const expectedFeeId = buildCarryForwardId(
    schoolId,
    "student-1",
    "2025-2026",
    "Term 3",
  );

  const countCarryForwardFees = () =>
    db.records
      .get("student_ledgers/ledger-current")
      .fees.filter((fee) => fee.feeId === expectedFeeId).length;

  const firstRun = await service.rolloverSchool(schoolId, {
    now: new Date("2026-09-10T12:00:00"),
    source: "test",
  });
  assert.equal(firstRun.changed, true);
  assert.equal(countCarryForwardFees(), 1, "Exactly one carry-forward fee after first run");

  // Re-arm the rollover so the carry-forward step runs again against the same
  // previous term data - this must not create a duplicate carry-forward fee.
  const settings = db.records.get(`settings/${schoolId}`);
  settings.currentTerm = "Term 3";
  settings.academicYear = "2025-2026";
  settings.nextTermBegins = "2026-09-10";
  settings.termTransitionProcessed = false;
  settings.termTransition = null;
  db.records.set(`settings/${schoolId}`, settings);

  const secondRun = await service.rolloverSchool(schoolId, {
    now: new Date("2026-09-10T12:30:00"),
    source: "test",
  });
  assert.equal(secondRun.changed, true);

  assert.equal(
    countCarryForwardFees(),
    1,
    "Exactly one carry-forward fee after the rollover is repeated",
  );

  const newTermLedger = db.records.get("student_ledgers/ledger-current");
  const carryForwardFee = newTermLedger.fees.find(
    (fee) => fee.feeId === expectedFeeId,
  );
  assert.equal(carryForwardFee.amount, 200);
  assert.equal(carryForwardFee.openingBalance, 200);

  // Total due must still be 800 (600 current fee + 200 carried balance)
  const totalDue = newTermLedger.fees.reduce(
    (sum, fee) => sum + (Number(fee.amount) || 0),
    0,
  );
  assert.equal(totalDue, 800);
});

test("carry-forward: fully paid previous term creates no carry-forward", async () => {
  const schoolId = "school-1";
  const db = new FakeDb({
    [`settings/${schoolId}`]: {
      schoolId,
      schoolName: "Test School",
      currentTerm: "Term 3",
      academicYear: "2025-2026",
      nextTermBegins: "2026-09-10",
      termTransitionProcessed: false,
    },
    [`schools/${schoolId}`]: { name: "Test School", status: "active" },
    "student_ledgers/ledger-prev": {
      schoolId,
      studentId: "student-1",
      classId: "class-1",
      term: "Term 3",
      academicYear: "2025-2026",
      fees: [
        {
          feeId: "fee-tuition",
          feeName: "Tuition",
          amount: 500,
          openingPaidAmount: 0,
        },
      ],
    },
    "payments/payment-prev": {
      schoolId,
      studentId: "student-1",
      term: "Term 3",
      academicYear: "2025-2026",
      feeId: "fee-tuition",
      amountPaid: 500, // fully paid
      isOpeningPayment: false,
    },
    "student_ledgers/ledger-current": {
      schoolId,
      studentId: "student-1",
      classId: "class-1",
      term: "Term 1",
      academicYear: "2026-2027",
      fees: [
        {
          feeId: "fee-tuition-current",
          feeName: "Tuition",
          amount: 600,
          openingPaidAmount: 0,
        },
      ],
    },
  });
  const service = createTermRolloverService({
    db,
    FieldValue,
    Timestamp,
    logger: { error: () => {} },
  });

  const result = await service.rolloverSchool(schoolId, {
    now: new Date("2026-09-10T12:00:00"),
    source: "test",
  });

  assert.equal(result.changed, true);

  const expectedFeeId = buildCarryForwardId(
    schoolId,
    "student-1",
    "2025-2026",
    "Term 3",
  );

  const newTermLedger = db.records.get("student_ledgers/ledger-current");
  assert.equal(
    newTermLedger.fees.some((fee) => fee.feeId === expectedFeeId),
    false,
    "No carry-forward fee should be created when the previous term is fully paid",
  );
  // The new term ledger contains only the current term fees
  assert.equal(newTermLedger.fees.length, 1);
  assert.equal(newTermLedger.fees[0].feeId, "fee-tuition-current");
  assert.equal(newTermLedger.fees[0].amount, 600);

  // Previous term ledger and payment remain intact
  const previousLedger = db.records.get("student_ledgers/ledger-prev");
  assert.equal(previousLedger.fees.length, 1);
  assert.equal(previousLedger.fees[0].amount, 500);
  const previousPayment = db.records.get("payments/payment-prev");
  assert.equal(previousPayment.amountPaid, 500);
});

test("carry-forward: persisted ledger is captured by the verified backup", async () => {
  const schoolId = "school-1";
  const db = new FakeDb({
    [`settings/${schoolId}`]: {
      schoolId,
      schoolName: "Test School",
      currentTerm: "Term 3",
      academicYear: "2025-2026",
      nextTermBegins: "2026-09-10",
      termTransitionProcessed: false,
    },
    [`schools/${schoolId}`]: { name: "Test School", status: "active" },
    "student_ledgers/ledger-prev": {
      schoolId,
      studentId: "student-1",
      classId: "class-1",
      term: "Term 3",
      academicYear: "2025-2026",
      fees: [
        {
          feeId: "fee-tuition",
          feeName: "Tuition",
          amount: 500,
          openingPaidAmount: 0,
        },
      ],
    },
    "payments/payment-prev": {
      schoolId,
      studentId: "student-1",
      term: "Term 3",
      academicYear: "2025-2026",
      feeId: "fee-tuition",
      amountPaid: 300,
      isOpeningPayment: false,
    },
  });
  const service = createTermRolloverService({
    db,
    FieldValue,
    Timestamp,
    logger: { error: () => {} },
  });

  const result = await service.rolloverSchool(schoolId, {
    now: new Date("2026-09-10T12:00:00"),
    source: "test",
  });

  assert.equal(result.changed, true);

  const backup = db.records.get(`backups/${result.backupId}`);
  assert.equal(backup.status, "verified");
  // previous term ledger + newly created new term ledger
  assert.equal(backup.recordCounts.studentLedgers, 2);

  const expectedFeeId = buildCarryForwardId(
    schoolId,
    "student-1",
    "2025-2026",
    "Term 3",
  );

  // Read the persisted backup chunks and confirm the carry-forward fee is stored
  const backedUpRows = [];
  for (const [key, value] of db.records.entries()) {
    if (!key.startsWith(`backups/${result.backupId}/chunks/`)) continue;
    if (!Array.isArray(value.rows)) continue;
    for (const row of value.rows) backedUpRows.push(row);
  }

  const backedUpLedgers = backedUpRows.filter(
    (row) => row.studentId === "student-1" && row.term === "Term 1",
  );
  assert.equal(backedUpLedgers.length, 1, "Backup must contain the new term ledger");
  const backedUpCarryForward = (backedUpLedgers[0].fees || []).filter(
    (fee) => fee.feeId === expectedFeeId,
  );
  assert.equal(
    backedUpCarryForward.length,
    1,
    "Backup must contain exactly one carry-forward fee",
  );
  assert.equal(backedUpCarryForward[0].amount, 200);
});


// ---------------------------------------------------------------------------
// AUDIT: persisted totals, openingBalance semantics and payment reconciliation
// ---------------------------------------------------------------------------

/**
 * Fixture for a term rollover that carries an outstanding balance forward.
 *
 * Previous term: fee GHS 500, payment GHS 300  ->  GHS 200 outstanding
 * New term:      fee GHS 600 already on the student's new-term ledger
 *
 * @param {boolean} useV2 - store the financial records in the v2 (school
 *   sub-collection) layout instead of the v1 root collections
 */
const buildCarryForwardAuditFixture = (useV2) => {
  const schoolId = "school-1";
  const paths = useV2
    ? {
        ledger: `schools/${schoolId}/feeLedgers/ledger-current`,
        previousLedger: `schools/${schoolId}/feeLedgers/ledger-prev`,
        previousPayment: `schools/${schoolId}/payments/payment-prev`,
        payments: `schools/${schoolId}/payments`,
      }
    : {
        ledger: "student_ledgers/ledger-current",
        previousLedger: "student_ledgers/ledger-prev",
        previousPayment: "payments/payment-prev",
        payments: "payments",
      };

  const previousLedger = {
    schoolId,
    studentId: "student-1",
    classId: "class-1",
    term: "Term 3",
    academicYear: "2025-2026",
    fees: [
      {
        feeId: "fee-tuition",
        feeName: "Tuition",
        amount: 500,
        openingPaidAmount: 0,
      },
    ],
  };
  const previousPayment = {
    schoolId,
    studentId: "student-1",
    term: "Term 3",
    academicYear: "2025-2026",
    feeId: "fee-tuition",
    amountPaid: 300,
    isOpeningPayment: false,
  };
  const currentLedger = {
    schoolId,
    studentId: "student-1",
    classId: "class-1",
    term: "Term 1",
    academicYear: "2026-2027",
    fees: [
      {
        feeId: "fee-tuition-current",
        feeName: "Tuition",
        amount: 600,
        openingPaidAmount: 0,
      },
    ],
  };

  const seed = {
    [`settings/${schoolId}`]: {
      schoolId,
      schoolName: "Test School",
      currentTerm: "Term 3",
      academicYear: "2025-2026",
      nextTermBegins: "2026-09-10",
      termTransitionProcessed: false,
    },
    [`schools/${schoolId}`]: { name: "Test School", status: "active" },
    [paths.previousLedger]: previousLedger,
    [paths.previousPayment]: previousPayment,
    [paths.ledger]: currentLedger,
  };
  if (useV2) {
    seed[`schools/${schoolId}/financeSettings/main`] = { financeVersion: "v2" };
  }

  return { schoolId, paths, db: new FakeDb(seed) };
};

/**
 * Production allocation input: pages/admin/FeesPayments.tsx:2020-2049
 * (alreadyPaid is accumulated from the term-scoped payments).
 */
const productionOutstandingFees = (ledger, payments) => {
  const alreadyPaidByFee = new Map();
  for (const payment of payments) {
    alreadyPaidByFee.set(
      payment.feeId,
      (alreadyPaidByFee.get(payment.feeId) || 0) + payment.amountPaid,
    );
  }
  return ledger.fees.map((fee) => ({
    feeId: fee.feeId,
    feeName: fee.feeName,
    amount: fee.amount,
    openingPaidAmount: fee.openingPaidAmount,
    alreadyPaid: alreadyPaidByFee.get(fee.feeId) || 0,
  }));
};

/**
 * Total due derived by the PRODUCTION allocation engine
 * (services/feeAllocation.js). `allocate` credits every fee up to its
 * remaining owed balance, so the credited total is exactly the ledger's
 * total due - it is not a sum performed by this test.
 */
const productionTotalDue = (ledger) => {
  const allocations = allocate(
    Number.MAX_SAFE_INTEGER,
    productionOutstandingFees(ledger, []),
    "priority",
  );
  return allocations
    .filter((allocation) => !allocation.isOverpayment)
    .reduce((sum, allocation) => sum + allocation.amountPaid, 0);
};

/**
 * Production ledger totals: services/mockDb.ts:4584-4612 (computeLedgerTotals)
 * - totalDue = sum of fee.amount, totalPaid = ledger opening paid + the
 * payments recorded for that student/term, balance = totalDue - totalPaid.
 *
 * (The admin UI computes the same figures in pages/admin/FeesPayments.tsx:2416-2450,
 * where openingPaid is summed from the per-fee openingPaidAmount instead.)
 */
const productionLedgerSummary = (ledger, payments) => {
  const totalDue = ledger.fees.reduce((sum, fee) => sum + fee.amount, 0);
  const openingPaid = ledger.openingPaidAmount || 0;
  const totalPaidSinceOnboarding = payments
    .filter(
      (payment) =>
        payment.studentId === ledger.studentId &&
        payment.academicYear === ledger.academicYear &&
        payment.term === ledger.term,
    )
    .reduce((sum, payment) => sum + payment.amountPaid, 0);
  const totalPaid = openingPaid + totalPaidSinceOnboarding;
  const balance = Math.max(0, totalDue - totalPaid);
  return { totalDue, openingPaid, totalPaidSinceOnboarding, totalPaid, balance };
};

test("audit: v1 persisted new-term ledger total due is GHS 800", async () => {
  const { schoolId, paths, db } = buildCarryForwardAuditFixture(false);
  const service = createTermRolloverService({
    db,
    FieldValue,
    Timestamp,
    logger: { error: () => {} },
  });

  const result = await service.rolloverSchool(schoolId, {
    now: new Date("2026-09-10T12:00:00"),
    source: "test",
  });
  assert.equal(result.changed, true);

  // Read the ledger back from the v1 storage path
  const persisted = db.records.get(paths.ledger);
  assert.ok(persisted, "Persisted v1 ledger must exist at " + paths.ledger);
  assert.equal(persisted.term, "Term 1");
  assert.equal(persisted.academicYear, "2026-2027");

  const expectedFeeId = buildCarryForwardId(
    schoolId,
    "student-1",
    "2025-2026",
    "Term 3",
  );
  const carryForwardEntries = persisted.fees.filter(
    (fee) => fee.feeId === expectedFeeId,
  );
  assert.equal(carryForwardEntries.length, 1, "Exactly one carry-forward entry");
  assert.equal(carryForwardEntries[0].amount, 200);
  assert.equal(carryForwardEntries[0].openingPaidAmount, 0);

  // Production total due (services/feeAllocation.js) must be 800
  assert.equal(productionTotalDue(persisted), 800);

  // Production ledger totals (services/mockDb.ts:4584-4612) must be 800 due
  const persistedTotals = productionLedgerSummary(persisted, []);
  assert.equal(persistedTotals.totalDue, 800);
  assert.equal(persistedTotals.totalPaid, 0);
  assert.equal(persistedTotals.balance, 800);

  // The production engine must not need an overpayment bucket for 800
  const allocationsFor800 = allocate(
    800,
    productionOutstandingFees(persisted, []),
    "priority",
  );
  assert.equal(
    allocationsFor800.filter((allocation) => allocation.isOverpayment).length,
    0,
    "GHS 800 must be fully covered by the ledger fees",
  );
  assert.equal(
    allocationsFor800.reduce((sum, allocation) => sum + allocation.amountPaid, 0),
    800,
  );

  // The carry-forward debt is GHS 200 - exactly once
  const perFeeOwed = new Map(
    allocationsFor800.map((allocation) => [allocation.feeId, allocation.amountPaid]),
  );
  assert.equal(perFeeOwed.get("fee-tuition-current"), 600);
  assert.equal(perFeeOwed.get(expectedFeeId), 200);

  // Production carry-forward engine agrees (services/termBalanceCarryForward.js)
  assert.equal(
    computeCarryForwardBalance({ ledger: persisted, payments: [] }),
    800,
  );

  // openingBalance does not participate in the debt calculation
  const withoutOpeningBalance = {
    ...persisted,
    fees: persisted.fees.map(({ openingBalance, ...fee }) => fee),
  };
  assert.equal(productionTotalDue(withoutOpeningBalance), 800);

  // Previous term history is unchanged
  const previousLedger = db.records.get(paths.previousLedger);
  assert.equal(previousLedger.fees.length, 1);
  assert.equal(previousLedger.fees[0].amount, 500);
  assert.equal(previousLedger.term, "Term 3");
  const previousPayment = db.records.get(paths.previousPayment);
  assert.equal(previousPayment.amountPaid, 300);
  assert.equal(previousPayment.term, "Term 3");
});

test("audit: v2 persisted new-term ledger total due is GHS 800", async () => {
  const { schoolId, paths, db } = buildCarryForwardAuditFixture(true);
  const service = createTermRolloverService({
    db,
    FieldValue,
    Timestamp,
    logger: { error: () => {} },
  });

  const result = await service.rolloverSchool(schoolId, {
    now: new Date("2026-09-10T12:00:00"),
    source: "test",
  });
  assert.equal(result.changed, true);

  // Read the ledger back from the v2 storage path
  const persisted = db.records.get(paths.ledger);
  assert.ok(persisted, "Persisted v2 ledger must exist at " + paths.ledger);
  assert.equal(persisted.term, "Term 1");
  assert.equal(persisted.academicYear, "2026-2027");

  const expectedFeeId = buildCarryForwardId(
    schoolId,
    "student-1",
    "2025-2026",
    "Term 3",
  );
  const carryForwardEntries = persisted.fees.filter(
    (fee) => fee.feeId === expectedFeeId,
  );
  assert.equal(carryForwardEntries.length, 1, "Exactly one carry-forward entry");
  assert.equal(carryForwardEntries[0].amount, 200);
  assert.equal(carryForwardEntries[0].openingPaidAmount, 0);

  // Production total due (services/feeAllocation.js) must be 800
  assert.equal(productionTotalDue(persisted), 800);

  // Production ledger totals (services/mockDb.ts:4584-4612) must be 800 due
  const persistedTotals = productionLedgerSummary(persisted, []);
  assert.equal(persistedTotals.totalDue, 800);
  assert.equal(persistedTotals.totalPaid, 0);
  assert.equal(persistedTotals.balance, 800);

  const allocationsFor800 = allocate(
    800,
    productionOutstandingFees(persisted, []),
    "priority",
  );
  assert.equal(
    allocationsFor800.filter((allocation) => allocation.isOverpayment).length,
    0,
    "GHS 800 must be fully covered by the ledger fees",
  );
  const perFeeOwed = new Map(
    allocationsFor800.map((allocation) => [allocation.feeId, allocation.amountPaid]),
  );
  assert.equal(perFeeOwed.get("fee-tuition-current"), 600);
  assert.equal(perFeeOwed.get(expectedFeeId), 200);

  // Production carry-forward engine agrees
  assert.equal(
    computeCarryForwardBalance({ ledger: persisted, payments: [] }),
    800,
  );

  // openingBalance does not participate in the debt calculation
  const withoutOpeningBalance = {
    ...persisted,
    fees: persisted.fees.map(({ openingBalance, ...fee }) => fee),
  };
  assert.equal(productionTotalDue(withoutOpeningBalance), 800);

  // Previous term history is unchanged
  const previousLedger = db.records.get(paths.previousLedger);
  assert.equal(previousLedger.fees.length, 1);
  assert.equal(previousLedger.fees[0].amount, 500);
  const previousPayment = db.records.get(paths.previousPayment);
  assert.equal(previousPayment.amountPaid, 300);
});

test("audit: v1 payment reconciliation leaves GHS 500 outstanding", async () => {
  const { schoolId, paths, db } = buildCarryForwardAuditFixture(false);
  const service = createTermRolloverService({
    db,
    FieldValue,
    Timestamp,
    logger: { error: () => {} },
  });

  await service.rolloverSchool(schoolId, {
    now: new Date("2026-09-10T12:00:00"),
    source: "test",
  });

  const persisted = db.records.get(paths.ledger);
  const expectedFeeId = buildCarryForwardId(
    schoolId,
    "student-1",
    "2025-2026",
    "Term 3",
  );

  // New term payment of GHS 300, allocated by the production engine
  // (services/feeAllocation.js) exactly like the admin payment flow
  // (pages/admin/FeesPayments.tsx:2026-2056).
  const allocations = allocate(
    300,
    productionOutstandingFees(persisted, []),
    "priority",
  ).map((allocation) => ({
    ...allocation,
    academicYear: persisted.academicYear,
    term: persisted.term,
  }));
  assert.equal(allocations.length, 2, "Payment is split across two fees");
  assert.equal(allocations[0].feeId, expectedFeeId);
  assert.equal(allocations[0].amountPaid, 200);
  assert.equal(allocations[1].feeId, "fee-tuition-current");
  assert.equal(allocations[1].amountPaid, 100);
  assert.equal(
    allocations.reduce((sum, allocation) => sum + allocation.amountPaid, 0),
    300,
  );

  // Persist the payment + allocation records on the production path with the
  // production document shape (server/paymentVerification.js:396-421)
  allocations.forEach((allocation, index) => {
    db.records.set(`${paths.payments}/payment-new-${index + 1}`, {
      id: `payment-new-${index + 1}`,
      schoolId,
      studentId: "student-1",
      classId: "class-1",
      feeId: allocation.feeId,
      feeName: allocation.feeName,
      amountPaid: allocation.amountPaid,
      paymentMethod: "MoMo",
      receiptNumber: "RCP-NEW-1",
      reference: "RCP-NEW-1",
      academicYear: "2026-2027",
      term: "Term 1",
      isOpeningPayment: false,
      createdAt: new Date("2026-09-11T09:00:00"),
      recordedBy: "Admin",
      source: "paystack_verified_server",
      paystackVerified: true,
      currency: "GHS",
      verifiedAmountGhs: allocation.amountPaid,
      allocationIndex: index,
    });
  });

  // Read the payments back from the production path and recompute the
  // production ledger summary (pages/admin/FeesPayments.tsx:2416-2450)
  const persistedPayments = [];
  for (const [key, value] of db.records.entries()) {
    if (!key.startsWith(`${paths.payments}/`)) continue;
    if (value.studentId !== "student-1") continue;
    persistedPayments.push(value);
  }
  const termPayments = persistedPayments.filter(
    (payment) =>
      payment.academicYear === "2026-2027" && payment.term === "Term 1",
  );
  assert.equal(termPayments.length, 2, "Both allocation records are persisted");

  const summary = productionLedgerSummary(persisted, termPayments);
  assert.equal(summary.totalDue, 800);
  assert.equal(summary.openingPaid, 0);
  assert.equal(summary.totalPaidSinceOnboarding, 300);
  assert.equal(summary.totalPaid, 300);
  assert.equal(summary.balance, 500, "GHS 500 outstanding after a GHS 300 payment");

  // The backend ledger check (server/paymentVerification.js:361-377) requires
  // every allocation to point at a real ledger for that academic year/term.
  const ledgerKeys = new Set(
    [persisted].map(
      (ledger) => `${String(ledger.academicYear || "")}|${String(ledger.term || "")}`,
    ),
  );
  for (const allocation of allocations) {
    assert.ok(
      ledgerKeys.has(`${allocation.academicYear}|${allocation.term}`),
      "Allocation must match a persisted ledger",
    );
  }

  // The production allocation engine confirms the same remaining debt
  const remainingAfterPayment = productionOutstandingFees(persisted, termPayments);
  const remainingTotal = remainingAfterPayment.reduce(
    (sum, fee) =>
      sum +
      Math.max(
        0,
        fee.amount - fee.alreadyPaid - (fee.openingPaidAmount || 0),
      ),
    0,
  );
  assert.equal(remainingTotal, 500);

  // Previous term history is untouched by the new term payment
  const previousLedger = db.records.get(paths.previousLedger);
  assert.equal(previousLedger.fees.length, 1);
  assert.equal(previousLedger.fees[0].amount, 500);
  const previousPayment = db.records.get(paths.previousPayment);
  assert.equal(previousPayment.amountPaid, 300);
  assert.equal(previousPayment.term, "Term 3");
  assert.equal(previousPayment.academicYear, "2025-2026");
});

test("audit: v2 payment reconciliation leaves GHS 500 outstanding", async () => {
  const { schoolId, paths, db } = buildCarryForwardAuditFixture(true);
  const service = createTermRolloverService({
    db,
    FieldValue,
    Timestamp,
    logger: { error: () => {} },
  });

  await service.rolloverSchool(schoolId, {
    now: new Date("2026-09-10T12:00:00"),
    source: "test",
  });

  const persisted = db.records.get(paths.ledger);
  const expectedFeeId = buildCarryForwardId(
    schoolId,
    "student-1",
    "2025-2026",
    "Term 3",
  );

  const allocations = allocate(
    300,
    productionOutstandingFees(persisted, []),
    "priority",
  ).map((allocation) => ({
    ...allocation,
    academicYear: persisted.academicYear,
    term: persisted.term,
  }));
  assert.equal(allocations.length, 2);
  assert.equal(allocations[0].feeId, expectedFeeId);
  assert.equal(allocations[0].amountPaid, 200);
  assert.equal(allocations[1].feeId, "fee-tuition-current");
  assert.equal(allocations[1].amountPaid, 100);

  allocations.forEach((allocation, index) => {
    db.records.set(`${paths.payments}/payment-new-${index + 1}`, {
      id: `payment-new-${index + 1}`,
      schoolId,
      studentId: "student-1",
      classId: "class-1",
      feeId: allocation.feeId,
      feeName: allocation.feeName,
      amountPaid: allocation.amountPaid,
      paymentMethod: "MoMo",
      receiptNumber: "RCP-NEW-1",
      reference: "RCP-NEW-1",
      academicYear: "2026-2027",
      term: "Term 1",
      isOpeningPayment: false,
      createdAt: new Date("2026-09-11T09:00:00"),
      recordedBy: "Admin",
      source: "paystack_verified_server",
      paystackVerified: true,
      currency: "GHS",
      verifiedAmountGhs: allocation.amountPaid,
      allocationIndex: index,
    });
  });

  const persistedPayments = [];
  for (const [key, value] of db.records.entries()) {
    if (!key.startsWith(`${paths.payments}/`)) continue;
    if (value.studentId !== "student-1") continue;
    persistedPayments.push(value);
  }
  const termPayments = persistedPayments.filter(
    (payment) =>
      payment.academicYear === "2026-2027" && payment.term === "Term 1",
  );
  assert.equal(termPayments.length, 2);

  const summary = productionLedgerSummary(persisted, termPayments);
  assert.equal(summary.totalDue, 800);
  assert.equal(summary.totalPaid, 300);
  assert.equal(summary.balance, 500, "GHS 500 outstanding after a GHS 300 payment");

  // The backend ledger check (server/paymentVerification.js:361-377)
  const ledgerKeys = new Set(
    [persisted].map(
      (ledger) => `${String(ledger.academicYear || "")}|${String(ledger.term || "")}`,
    ),
  );
  for (const allocation of allocations) {
    assert.ok(
      ledgerKeys.has(`${allocation.academicYear}|${allocation.term}`),
      "Allocation must match a persisted ledger",
    );
  }

  // Previous term history is untouched
  const previousLedger = db.records.get(paths.previousLedger);
  assert.equal(previousLedger.fees.length, 1);
  assert.equal(previousLedger.fees[0].amount, 500);
  const previousPayment = db.records.get(paths.previousPayment);
  assert.equal(previousPayment.amountPaid, 300);
  assert.equal(previousPayment.term, "Term 3");
});

// FakeSnapshot, FakeQuerySnapshot, FakeDocRef, FakeQuery, FakeCollectionRef, FakeDb, deepMerge, Timestamp, FieldValue
class FakeSnapshot {
  constructor(ref, data) {
    this.ref = ref;
    this.id = ref.id;
    this.exists = data !== undefined;
    this._data = data;
  }
  data() {
    return this._data;
  }
}

class FakeQuerySnapshot {
  constructor(docs) {
    this.docs = docs;
    this.size = docs.length;
    this.empty = docs.length === 0;
  }
}

class FakeDocRef {
  constructor(db, path) {
    this.db = db;
    this.path = path;
    this.id = path.split("/").at(-1);
  }
  async get() {
    return new FakeSnapshot(this, this.db.records.get(this.path));
  }
  async set(value, options = {}) {
    const current = this.db.records.get(this.path) || {};
    this.db.records.set(
      this.path,
      options.merge ? deepMerge(current, value) : structuredClone(value),
    );
  }
  async update(value) {
    const current = this.db.records.get(this.path);
    if (!current) throw new Error(`Missing document: ${this.path}`);
    this.db.records.set(this.path, deepMerge(current, value));
  }
  collection(name) {
    return new FakeCollectionRef(this.db, `${this.path}/${name}`);
  }
}

class FakeQuery {
  constructor(collection, filters = [], limitCount = null) {
    this.collection = collection;
    this.filters = filters;
    this.limitCount = limitCount;
  }
  where(field, operator, value) {
    return new FakeQuery(
      this.collection,
      [...this.filters, { field, operator, value }],
      this.limitCount,
    );
  }
  limit(count) {
    return new FakeQuery(this.collection, this.filters, count);
  }
  async get() {
    const prefix = `${this.collection.path}/`;
    const expectedDepth = this.collection.path.split("/").length + 1;
    let docs = Array.from(this.collection.db.records.entries())
      .filter(
        ([path]) =>
          path.startsWith(prefix) && path.split("/").length === expectedDepth,
      )
      .map(
        ([path, data]) =>
          new FakeSnapshot(new FakeDocRef(this.collection.db, path), data),
      )
      .filter((snapshot) =>
        this.filters.every(({ field, operator, value }) => {
          const actual = snapshot.data()?.[field];
          if (operator === "==") return actual === value;
          if (operator === "<=") return actual <= value;
          throw new Error(`Unsupported operator: ${operator}`);
        }),
      );
    if (this.limitCount !== null) docs = docs.slice(0, this.limitCount);
    return new FakeQuerySnapshot(docs);
  }
}

class FakeCollectionRef extends FakeQuery {
  constructor(db, path) {
    super(null);
    this.db = db;
    this.path = path;
    this.collection = this;
  }
  doc(id) {
    return new FakeDocRef(this.db, `${this.path}/${id}`);
  }
  async add(value) {
    const id = `auto-${this.db.autoId++}`;
    const ref = this.doc(id);
    await ref.set(value);
    return ref;
  }
}

class FakeDb {
  constructor(seed = {}) {
    this.records = new Map(
      Object.entries(seed).map(([path, value]) => [path, structuredClone(value)]),
    );
    this.autoId = 1;
  }
  collection(name) {
    return new FakeCollectionRef(this, name);
  }
  batch() {
    const operations = [];
    return {
      set: (ref, value) => operations.push(() => ref.set(value)),
      delete: (ref) => operations.push(() => this.records.delete(ref.path)),
      commit: async () => {
        for (const operation of operations) await operation();
      },
    };
  }
  async runTransaction(callback) {
    const operations = [];
    const result = await callback({
      get: (ref) => ref.get(),
      update: (ref, value) => operations.push(() => ref.update(value)),
    });
    for (const operation of operations) await operation();
    return result;
  }
}

const deepMerge = (current, next) => {
  const result = structuredClone(current);
  Object.entries(next).forEach(([key, value]) => {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      !(value instanceof Date)
    ) {
      result[key] = deepMerge(result[key] || {}, value);
    } else {
      result[key] = structuredClone(value);
    }
  });
  return result;
};

const Timestamp = {
  fromDate: (date) => new Date(date),
};
const FieldValue = {
  serverTimestamp: () => new Date("2026-07-04T00:00:00.000Z"),
};