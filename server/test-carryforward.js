import { computeCarryForwardBalance, buildCarryForwardFeeEntry, buildCarryForwardId } from "./services/termBalanceCarryForward.js";

// Test data from the failing test
const ledger = {
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
};

const payments = [
  {
    studentId: "student-1",
    amountPaid: 300,
    term: "Term 3",
    academicYear: "2025-2026",
    feeId: "tuition-root",
    isOpeningPayment: false
  }
];

// Calculate carry-forward amount
const carryForwardAmount = computeCarryForwardBalance({ ledger, payments });
console.log("Carry-forward amount:", carryForwardAmount);

// Build carry-forward fee entry if amount > 0
if (carryForwardAmount > 0) {
  const carryForwardFeeId = buildCarryForwardId("school-1", ledger.studentId, ledger.academicYear, ledger.term);
  const carryForwardResult = {
    studentId: ledger.studentId,
    classId: ledger.classId,
    carriedBalance: carryForwardAmount,
    fromAcademicYear: ledger.academicYear,
    fromTerm: ledger.term,
    toAcademicYear: "2026-2027",
    toTerm: "Term 1",
    carryForwardFeeId: carryForwardFeeId
  };
  
  const carryForwardFeeEntry = buildCarryForwardFeeEntry(carryForwardResult);
  console.log("Carry-forward fee entry:", carryForwardFeeEntry);
} else {
  console.log("No carry-forward amount");
}
