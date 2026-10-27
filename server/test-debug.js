
const test = require("node:test");
const assert = require("node:assert/strict");
const { createTermRolloverService } = require("./termRollover.js");

test("carry-forward: basic scenario with v1 storage", async () => {
  const schoolId = "school-1";
  const db = new FakeDb({
    [\settings/\\]:
    {
      schoolId,
      schoolName: "Test School",
      currentTerm: "Term 3",
      academicYear: "2025-2026",
      schoolReopenDate: "2026-01-10",
      vacationDate: "2026-07-20",
      nextTermBegins: "2026-09-10",
      termTransitionProcessed: false,
      financeVersion: "v1"
    },
    [\schools/\\]: { name: "Test School", status: "active" },
    "fees/tuition-root": {
      schoolId,
      feeName: "Tuition",
      amount: 500,
      term: "Term 3",
      academicYear: "2025-2026",
      feeFrequency: "per_term",
    },
    "fees/lunch-root": {
      schoolId,
      feeName: "Lunch",
      amount: 300,
      term: "Term 3",
      academicYear: "2025-2026",
      feeFrequency: "per_term",
    },
    "student_ledgers/ledger-1": {
      schoolId,
      studentId: "student-1",
      classId: "class-1",
      term: "Term 3",
      academicYear: "2025-2026",
      fees: [
        { feeId: "tuition-root", feeName: "Tuition", amount: 500, openingPaidAmount: 0 },
        { feeId: "lunch-root", feeName: "Lunch", amount: 300, openingPaidAmount: 50 },
      ],
      openingPaidAmount: 50,
      openingBalance: 750,
      openingStatus: "Part-paid"
    },
    "payments/payment-1": {
      schoolId,
      studentId: "student-1",
      amountPaid: 300,
      term: "Term 3",
      academicYear: "2025-2026",
      feeId: "tuition-root",
      isOpeningPayment: false
    }
  });

  const service = createTermRolloverService({
    db,
    FieldValue,
    Timestamp,
    logger: console,
  });

  const result = await service.rolloverSchool(schoolId, {
    now: new Date("2026-09-10T12:00:00"),
    source: "test",
  });

  assert.equal(result.changed, true);
});
