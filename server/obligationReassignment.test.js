import test from "node:test";
import assert from "node:assert/strict";

import { reassignObligation } from "../services/obligationReassignment.js";
import {
  buildLedgerFeesPayload,
  sumDemandedAmounts,
} from "../services/ledgerFeeAssignment.js";
import { buildLedgerId, buildCarryForwardId } from "../services/termBalanceCarryForward.js";

const schoolId = "school-reassign-1";
const academicYear = "2026-2027";
const term = "Term 1";

const OLD_FEE_ID = "fee_tuition_old_school-reassign-1_2026-2027_Term 1";
const NEW_FEE_ID = "fee_tuition_daily_school-reassign-1_2026-2027_Term 1";
const OTHER_FEE_ID = "fee_books_school-reassign-1_2026-2027_Term 1";
const UNRELATED_FEE_ID = "fee_pta_school-reassign-1_2026-2027_Term 1";

const buildLedger = (overrides = {}) => ({
  id: buildLedgerId(schoolId, "student-1", academicYear, term),
  schoolId,
  studentId: "student-1",
  classId: "class-1",
  academicYear,
  term,
  fees: [{
    feeId: OLD_FEE_ID,
    feeName: "Tuition",
    amount: 150,
    openingPaidAmount: 0,
    openingBalance: 150,
    openingStatus: "Unpaid",
    feeNameSnapshot: "Tuition",
    assignedAmount: 150,
  }],
  totalFee: 150,
  openingPaidAmount: 0,
  openingBalance: 150,
  openingStatus: "Unpaid",
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

const payment = (overrides = {}) => ({
  id: "payment-1",
  schoolId,
  studentId: "student-1",
  classId: "class-1",
  academicYear,
  term,
  feeId: OLD_FEE_ID,
  feeName: "Tuition",
  amountPaid: 100,
  paymentMethod: "Cash",
  receiptNumber: "RCPT-001",
  recordedBy: "admin-1",
  createdAt: 1000,
  ...overrides,
});

/**
 * Compute ledger totals matching the verified backend semantics
 * (services/mockDb.ts computeLedgerTotals) with the Phase 2 fix that
 * historicalOnly entries are excluded from openingPaid aggregation.
 *
 * Key verification path: StudentFeePayment.feeId/allocations ->
 * ledger fee entry openingPaidAmount -> totalPaid -> balance;
 * the same credit must never be counted twice.
 */
const ledgerTotals = (ledger, payments) => {
  const totalDue = sumDemandedAmounts(ledger.fees);
  // Use ledger-level openingPaidAmount (already excludes historicalOnly
  // entries per the post-reassignment invariant).
  const openingPaid = Number(ledger.openingPaidAmount) || 0;
  const termPayments = (payments || [])
    .filter(
      (p) =>
        p &&
        p.studentId === ledger.studentId &&
        p.academicYear === ledger.academicYear &&
        p.term === ledger.term &&
        p.isOpeningPayment !== true,
    )
    .reduce((sum, p) => sum + (Number(p.amountPaid) || 0), 0);
  const totalPaid = openingPaid + termPayments;
  return {
    totalDue,
    totalPaid,
    balance: Math.max(0, totalDue - totalPaid),
  };
};

test("reassign: same amount transfers paid credit, balance correct", () => {
  const ledger = buildLedger({
    fees: [{
      feeId: OLD_FEE_ID,
      feeName: "Tuition",
      amount: 150,
      openingPaidAmount: 100,
      openingBalance: 50,
      openingStatus: "Part-paid",
      feeNameSnapshot: "Tuition",
      assignedAmount: 150,
    }],
    totalFee: 150,
    openingPaidAmount: 100,
    openingBalance: 50,
    openingStatus: "Part-paid",
  });

  const result = reassignObligation({
    ledger,
    fromFeeId: OLD_FEE_ID,
    toFee: { feeId: NEW_FEE_ID, feeName: "Tuition (Monthly)", amount: 150 },
    schoolId,
    adminId: "admin-1",
  });

  assert.equal(result.ok, true, `Must succeed: ${result.error || ""}`);
  const fees = result.ledger.fees;

  const oldEntry = fees.find((f) => f.feeId === OLD_FEE_ID);
  const newEntry = fees.find((f) => f.feeId === NEW_FEE_ID);

  assert.ok(oldEntry, "Old entry must be retained");
  assert.equal(oldEntry.historicalOnly, true, "Old entry must be historical-only");
  assert.equal(oldEntry.amount, 150, "Old entry amount frozen");
  assert.equal(oldEntry.openingPaidAmount, 100, "Old entry paid credit preserved for audit");

  assert.ok(newEntry, "New entry must exist");
  assert.equal(newEntry.historicalOnly, false, "New entry is current");
  assert.equal(newEntry.amount, 150, "New obligation amount = 150");
  assert.equal(newEntry.openingPaidAmount, 100, "Transferred paid credit on new entry");

  const totals = ledgerTotals(result.ledger, []);
  assert.equal(totals.totalDue, 150);
  assert.equal(totals.totalPaid, 100, "Paid credit counts exactly once");
  assert.equal(totals.balance, 50, "Balance = 50");
});

test("reassign: amount increase 150->200 with paid 100 -> balance 100", () => {
  const ledger = buildLedger({
    fees: [{
      feeId: OLD_FEE_ID,
      feeName: "Tuition",
      amount: 150,
      openingPaidAmount: 100,
      openingBalance: 50,
      openingStatus: "Part-paid",
      feeNameSnapshot: "Tuition",
      assignedAmount: 150,
    }],
    totalFee: 150,
    openingPaidAmount: 100,
    openingBalance: 50,
    openingStatus: "Part-paid",
  });

  const result = reassignObligation({
    ledger,
    fromFeeId: OLD_FEE_ID,
    toFee: { feeId: NEW_FEE_ID, feeName: "Tuition (Daily)", amount: 200 },
    schoolId,
    adminId: "admin-1",
  });

  assert.equal(result.ok, true, `Must succeed: ${result.error || ""}`);
  const newEntry = result.ledger.fees.find((f) => f.feeId === NEW_FEE_ID);
  const oldEntry = result.ledger.fees.find((f) => f.feeId === OLD_FEE_ID);

  assert.equal(newEntry.amount, 200, "New obligation = 200");
  assert.equal(
    newEntry.reassignedFrom.transferredPaidAmount,
    100,
    "Transferred credit = 100",
  );

  const totals = ledgerTotals(result.ledger, []);
  assert.equal(totals.totalDue, 200, "Demand is only the new fee, not 150+200");
  assert.equal(totals.totalPaid, 100, "Paid credit counts exactly once");
  assert.equal(totals.balance, 100, "Balance = 100");

  assert.equal(oldEntry.historicalOnly, true);
  assert.equal(oldEntry.amount, 150, "Old amount frozen");
  assert.equal(oldEntry.openingPaidAmount, 100, "Old paid credit preserved verbatim for audit");
});

test("reassign: amount decrease 200->150 with paid 100 -> balance 50 (no refund)", () => {
  const ledger = buildLedger({
    fees: [{
      feeId: OLD_FEE_ID,
      feeName: "Tuition",
      amount: 200,
      openingPaidAmount: 100,
      openingBalance: 100,
      openingStatus: "Part-paid",
      feeNameSnapshot: "Tuition",
      assignedAmount: 200,
    }],
    totalFee: 200,
    openingPaidAmount: 100,
    openingBalance: 100,
    openingStatus: "Part-paid",
  });

  const result = reassignObligation({
    ledger,
    fromFeeId: OLD_FEE_ID,
    toFee: { feeId: NEW_FEE_ID, feeName: "Tuition (Monthly)", amount: 150 },
    schoolId,
    adminId: "admin-1",
  });

  assert.equal(result.ok, true, `Must succeed: ${result.error || ""}`);
  const totals = ledgerTotals(result.ledger, []);
  assert.equal(totals.totalDue, 150);
  assert.equal(totals.totalPaid, 100);
  assert.equal(totals.balance, 50, "Balance = 50, not a refund");

  const oldEntry = result.ledger.fees.find((f) => f.feeId === OLD_FEE_ID);
  assert.equal(oldEntry.amount, 200, "Old amount frozen at 200");
  assert.equal(oldEntry.openingPaidAmount, 100, "Old paid preserved verbatim");
});

test("reassign: fully paid student stays fully paid", () => {
  const ledger = buildLedger({
    fees: [{
      feeId: OLD_FEE_ID,
      feeName: "Tuition",
      amount: 150,
      openingPaidAmount: 150,
      openingBalance: 0,
      openingStatus: "Paid",
      feeNameSnapshot: "Tuition",
      assignedAmount: 150,
    }],
    totalFee: 150,
    openingPaidAmount: 150,
    openingBalance: 0,
    openingStatus: "Paid",
  });

  const result = reassignObligation({
    ledger,
    fromFeeId: OLD_FEE_ID,
    toFee: { feeId: NEW_FEE_ID, feeName: "Tuition (Monthly)", amount: 150 },
    schoolId,
    adminId: "admin-1",
  });

  assert.equal(result.ok, true, `Must succeed: ${result.error || ""}`);
  const totals = ledgerTotals(result.ledger, []);
  assert.equal(totals.totalDue, 150);
  assert.equal(totals.totalPaid, 150);
  assert.equal(totals.balance, 0, "Fully paid stays 0");
});

test("reassign: multiple term payments all preserved, balance correct", () => {
  const ledger = buildLedger({
    fees: [{
      feeId: OLD_FEE_ID,
      feeName: "Tuition",
      amount: 150,
      openingPaidAmount: 50,
      openingBalance: 100,
      openingStatus: "Part-paid",
      feeNameSnapshot: "Tuition",
      assignedAmount: 150,
    }],
    totalFee: 150,
    openingPaidAmount: 50,
    openingBalance: 100,
    openingStatus: "Part-paid",
  });

  const payments = [
    payment({ id: "pay-1", amountPaid: 50 }),
    payment({ id: "pay-2", amountPaid: 30 }),
    payment({ id: "pay-3", amountPaid: 20 }),
  ];

  const result = reassignObligation({
    ledger,
    fromFeeId: OLD_FEE_ID,
    toFee: { feeId: NEW_FEE_ID, feeName: "Tuition (Daily)", amount: 200 },
    schoolId,
    payments,
    adminId: "admin-1",
  });

  assert.equal(result.ok, true, `Must succeed: ${result.error || ""}`);

  // All payments must be unchanged
  for (let i = 0; i < payments.length; i++) {
    const original = payments[i];
    const unchanged = JSON.parse(JSON.stringify(original));
    assert.equal(original.id, unchanged.id, "Payment id unchanged");
    assert.equal(original.feeId, unchanged.feeId, "Payment feeId unchanged");
    assert.equal(original.feeName, unchanged.feeName, "Payment feeName unchanged");
    assert.equal(original.amountPaid, unchanged.amountPaid, "Payment amount unchanged");
    assert.equal(original.receiptNumber, unchanged.receiptNumber, "Payment receipt unchanged");
    assert.equal(original.createdAt, unchanged.createdAt, "Payment date unchanged");
    assert.equal(original.recordedBy, unchanged.recordedBy, "Payment recorder unchanged");
    assert.deepEqual(
      JSON.parse(JSON.stringify(original.allocations || [])),
      JSON.parse(JSON.stringify(unchanged.allocations || [])),
      "Payment allocations unchanged",
    );
  }

  const totals = ledgerTotals(result.ledger, payments);
  // transferred = min(50, 150) = 50; term payments = 50+30+20 = 100
  assert.equal(totals.totalDue, 200);
  assert.equal(totals.totalPaid, 150, "Total paid counted exactly once (50 transferred + 100 term)");
  assert.equal(totals.balance, 50, "Balance = 50");

  // Transferred credit = min(50, 150) = 50 (only pre-term opening credit)
  const newEntry = result.ledger.fees.find((f) => f.feeId === NEW_FEE_ID);
  assert.equal(newEntry.reassignedFrom.transferredPaidAmount, 50);
  assert.deepEqual(
    newEntry.reassignedFrom.absorbedPaymentIds.sort(),
    ["pay-1", "pay-2", "pay-3"].sort(),
    "All absorbed payment IDs recorded for audit",
  );
});

test("reassign: overpayment 150 paid 180 -> 200, capped at 150, excess preserved", () => {
  const ledger = buildLedger({
    fees: [{
      feeId: OLD_FEE_ID,
      feeName: "Tuition",
      amount: 150,
      openingPaidAmount: 180,
      openingBalance: 0,
      openingStatus: "Paid",
      feeNameSnapshot: "Tuition",
      assignedAmount: 150,
    }],
    totalFee: 150,
    openingPaidAmount: 180,
    openingBalance: 0,
    openingStatus: "Paid",
  });

  const result = reassignObligation({
    ledger,
    fromFeeId: OLD_FEE_ID,
    toFee: { feeId: NEW_FEE_ID, feeName: "Tuition (Daily)", amount: 200 },
    schoolId,
    adminId: "admin-1",
  });

  assert.equal(result.ok, true, `Must succeed: ${result.error || ""}`);

  const newEntry = result.ledger.fees.find((f) => f.feeId === NEW_FEE_ID);
  assert.equal(newEntry.amount, 200);
  assert.equal(
    newEntry.reassignedFrom.transferredPaidAmount,
    150,
    "Transferred credit capped at obligation amount (150), not 180",
  );

  const totals = ledgerTotals(result.ledger, []);
  assert.equal(totals.totalDue, 200);
  assert.equal(totals.totalPaid, 150, "Only 150 transferred, 30 excess stays");
  assert.equal(totals.balance, 50, "Balance = 50");

  // Old entry retains full 180 for audit (excess preserved)
  const oldEntry = result.ledger.fees.find((f) => f.feeId === OLD_FEE_ID);
  assert.equal(oldEntry.openingPaidAmount, 180, "Old entry retains full 180 for audit");
  assert.equal(oldEntry.historicalOnly, true);
});

test("reassign: adding a separate fee is NOT reassignment (new fee gets no paid credit)", () => {
  const ledger = buildLedger({
    fees: [{
      feeId: OLD_FEE_ID,
      feeName: "Tuition",
      amount: 150,
      openingPaidAmount: 0,
      openingBalance: 150,
      openingStatus: "Unpaid",
      feeNameSnapshot: "Tuition",
      assignedAmount: 150,
    }],
    totalFee: 150,
    openingPaidAmount: 0,
    openingBalance: 150,
    openingStatus: "Unpaid",
  });

  const payments = [payment()];

  // Simulate the "add new fee" path: buildLedgerFeesPayload with OLD_FEE + OTHER_FEE
  const payload = buildLedgerFeesPayload({
    assignedFees: [
      { id: OLD_FEE_ID, feeName: "Tuition", amount: 150 },
      { id: OTHER_FEE_ID, feeName: "Books", amount: 50 },
    ],
    existingFees: ledger.fees,
  });

  const newFeeEntry = payload.fees.find((f) => f.feeId === OTHER_FEE_ID);
  assert.ok(newFeeEntry, "Separate fee gets its own entry");
  assert.equal(newFeeEntry.openingPaidAmount, undefined, "New fee starts with no paid credit");
  assert.equal(newFeeEntry.reassignedFrom, undefined, "New fee has no reassignment metadata");

  // No reassignment occurred: the old fee is still current (not historicalOnly)
  const preservedOld = payload.fees.find((f) => f.feeId === OLD_FEE_ID);
  assert.equal(preservedOld.historicalOnly, false, "Old fee still current after plain assignment");
  assert.equal(preservedOld.reassignedFrom, undefined, "Old fee has no reassignment metadata");

  // Both fees demanded: 150 + 50. The payment of 100 is a term payment
  // against OLD_FEE_ID; it is counted in term-payments, not as opening paid.
  const totals = ledgerTotals({ ...ledger, fees: payload.fees, openingPaidAmount: payload.openingPaidAmount }, payments);
  assert.equal(totals.totalDue, 200, "Both fees demanded: 150 + 50");
  assert.equal(totals.totalPaid, 100, "0 opening + 100 term payment");
  assert.equal(totals.balance, 100, "Total balance reflects both fees");
});

test("reassign: multiple students — only selected student changes", () => {
  const otherStudentLedger = {
    id: buildLedgerId(schoolId, "student-2", academicYear, term),
    schoolId,
    studentId: "student-2",
    classId: "class-1",
    academicYear,
    term,
    fees: [{
      feeId: OLD_FEE_ID,
      feeName: "Tuition",
      amount: 150,
      openingPaidAmount: 100,
      openingBalance: 50,
      openingStatus: "Part-paid",
      feeNameSnapshot: "Tuition",
      assignedAmount: 150,
    }],
    totalFee: 150,
    openingPaidAmount: 100,
    openingBalance: 50,
    openingStatus: "Part-paid",
    createdAt: 1,
    updatedAt: 1,
  };

  const result = reassignObligation({
    ledger: buildLedger({
      fees: [{
        feeId: OLD_FEE_ID,
        feeName: "Tuition",
        amount: 150,
        openingPaidAmount: 100,
        openingBalance: 50,
        openingStatus: "Part-paid",
        feeNameSnapshot: "Tuition",
        assignedAmount: 150,
      }],
      totalFee: 150,
      openingPaidAmount: 100,
      openingBalance: 50,
      openingStatus: "Part-paid",
    }),
    fromFeeId: OLD_FEE_ID,
    toFee: { feeId: NEW_FEE_ID, feeName: "Tuition (Daily)", amount: 200 },
    schoolId,
    adminId: "admin-1",
  });

  // The other student's ledger must be completely untouched
  const otherNewFee = otherStudentLedger.fees.find((f) => f.feeId === NEW_FEE_ID);
  assert.equal(otherNewFee, undefined, "Other student must NOT get the new fee");
  const otherOldFee = otherStudentLedger.fees.find((f) => f.feeId === OLD_FEE_ID);
  assert.equal(otherOldFee.historicalOnly, undefined, "Other student's old fee still current");
  assert.equal(otherOldFee.openingPaidAmount, 100, "Other student's paid preserved");
  const otherTotals = ledgerTotals(otherStudentLedger, []);
  assert.equal(otherTotals.totalDue, 150);
  assert.equal(otherTotals.totalPaid, 100);
  assert.equal(otherTotals.balance, 50, "Other student unaffected");

  // The reassigned student has correct balances
  assert.equal(result.ok, true);
  const totals = ledgerTotals(result.ledger, []);
  assert.equal(totals.totalDue, 200);
  assert.equal(totals.totalPaid, 100);
  assert.equal(totals.balance, 100);
});

test("reassign: unrelated fees are not touched", () => {
  const booksEntry = {
    feeId: OTHER_FEE_ID,
    feeName: "Books",
    amount: 50,
    openingPaidAmount: 20,
    openingBalance: 30,
    openingStatus: "Part-paid",
    feeNameSnapshot: "Books",
    assignedAmount: 50,
  };
  const ptaEntry = {
    feeId: UNRELATED_FEE_ID,
    feeName: "PTA",
    amount: 30,
    openingPaidAmount: 0,
    openingBalance: 30,
    openingStatus: "Unpaid",
    feeNameSnapshot: "PTA",
    assignedAmount: 30,
  };

  const ledger = buildLedger({
    fees: [
      { feeId: OLD_FEE_ID, feeName: "Tuition", amount: 150, openingPaidAmount: 100,
        openingBalance: 50, openingStatus: "Part-paid", feeNameSnapshot: "Tuition", assignedAmount: 150 },
      booksEntry,
      ptaEntry,
    ],
    totalFee: 230,
    openingPaidAmount: 100,
    openingBalance: 130,
    openingStatus: "Part-paid",
  });

  const result = reassignObligation({
    ledger,
    fromFeeId: OLD_FEE_ID,
    toFee: { feeId: NEW_FEE_ID, feeName: "Tuition (Daily)", amount: 200 },
    schoolId,
    adminId: "admin-1",
  });

  assert.equal(result.ok, true, `Must succeed: ${result.error || ""}`);

  const fees = result.ledger.fees;

  // Books untouched
  const books = fees.find((f) => f.feeId === OTHER_FEE_ID);
  assert.deepEqual(books, booksEntry, "Books fee entry untouched");
  assert.equal(books.historicalOnly, undefined, "Books still current");

  // PTA untouched
  const pta = fees.find((f) => f.feeId === UNRELATED_FEE_ID);
  assert.deepEqual(pta, ptaEntry, "PTA fee entry untouched");
  assert.equal(pta.historicalOnly, undefined, "PTA still current");

  const totals = ledgerTotals(result.ledger, []);
  assert.equal(totals.totalDue, 280, "200 (new tuition) + 50 (books) + 30 (PTA)");
  assert.equal(totals.totalPaid, 120, "100 (transferred) + 20 (books opening paid)");
  assert.equal(totals.balance, 160, "200+50+30 - 100-20 = 160");
});

test("reassign: payment history immutability — amount, date, receipt, allocations unchanged", () => {
  const ledger = buildLedger({
    fees: [{
      feeId: OLD_FEE_ID,
      feeName: "Tuition",
      amount: 150,
      openingPaidAmount: 0,
      openingBalance: 150,
      openingStatus: "Unpaid",
      feeNameSnapshot: "Tuition",
      assignedAmount: 150,
    }],
    totalFee: 150,
    openingPaidAmount: 0,
    openingBalance: 150,
    openingStatus: "Unpaid",
  });

  const originalPayment = {
    id: "payment-100",
    schoolId,
    studentId: "student-1",
    classId: "class-1",
    academicYear,
    term,
    feeId: OLD_FEE_ID,
    feeName: "Tuition",
    amountPaid: 100,
    paymentMethod: "MoMo",
    receiptNumber: "RCPT-100",
    recordedBy: "admin-1",
    createdAt: 5000,
    allocations: [{ feeId: OLD_FEE_ID, feeName: "Tuition", amountPaid: 100, isOverpayment: false }],
  };

  const snapshot = JSON.parse(JSON.stringify(originalPayment));

  const result = reassignObligation({
    ledger,
    fromFeeId: OLD_FEE_ID,
    toFee: { feeId: NEW_FEE_ID, feeName: "Tuition (Daily)", amount: 200 },
    schoolId,
    payments: [originalPayment],
    adminId: "admin-1",
  });

  assert.equal(result.ok, true, `Must succeed: ${result.error || ""}`);

  // The payment object passed in must be structurally identical after the call
  assert.deepEqual(
    JSON.parse(JSON.stringify(originalPayment)),
    snapshot,
    "Payment record must be byte-identical after reassignment",
  );
});

test("reassign: historical-only entry still findable by original feeId", () => {
  const ledger = buildLedger({
    fees: [{
      feeId: OLD_FEE_ID,
      feeName: "Tuition",
      amount: 150,
      openingPaidAmount: 100,
      openingBalance: 50,
      openingStatus: "Part-paid",
      feeNameSnapshot: "Tuition",
      assignedAmount: 150,
    }],
    totalFee: 150,
    openingPaidAmount: 100,
    openingBalance: 50,
    openingStatus: "Part-paid",
  });

  const result = reassignObligation({
    ledger,
    fromFeeId: OLD_FEE_ID,
    toFee: { feeId: NEW_FEE_ID, feeName: "Tuition (Monthly)", amount: 150 },
    schoolId,
    adminId: "admin-1",
  });

  assert.equal(result.ok, true);
  const oldEntry = result.ledger.fees.find((f) => f.feeId === OLD_FEE_ID);
  assert.ok(oldEntry, "Historical entry must remain findable by original feeId");
  assert.equal(oldEntry.feeNameSnapshot, "Tuition");
  assert.equal(oldEntry.assignedAmount, 150);
  assert.equal(oldEntry.historicalOnly, true);

  const newEntry = result.ledger.fees.find((f) => f.feeId === NEW_FEE_ID);
  assert.ok(newEntry, "New current entry must exist");
  assert.equal(newEntry.reassignedFrom.fromFeeId, OLD_FEE_ID);
  assert.equal(newEntry.reassignedFrom.fromAmount, 150);
  assert.equal(newEntry.reassignedFrom.transferredPaidAmount, 100);
  assert.equal(typeof newEntry.reassignedFrom.reassignedAt, "number");
  assert.equal(newEntry.reassignedFrom.reassignedBy, "admin-1");
});

test("reassign: guards reject invalid states", () => {
  const ledger = buildLedger({
    fees: [{
      feeId: OLD_FEE_ID,
      feeName: "Tuition",
      amount: 150,
      openingPaidAmount: 100,
      openingBalance: 50,
      openingStatus: "Part-paid",
      feeNameSnapshot: "Tuition",
      assignedAmount: 150,
    }],
    totalFee: 150,
    openingPaidAmount: 100,
    openingBalance: 50,
    openingStatus: "Part-paid",
  });

  // 1. No existing obligation for fromFeeId
  const noObligation = reassignObligation({
    ledger,
    fromFeeId: "nonexistent_fee",
    toFee: { feeId: NEW_FEE_ID, feeName: "Tuition (Daily)", amount: 200 },
    schoolId,
    adminId: "admin-1",
  });
  assert.equal(noObligation.ok, false);
  assert.ok(/no.*(?:current obligation|exist)/i.test(noObligation.error || ""), noObligation.error);

  // 2. Already reassigned (old entry already historicalOnly)
  const alreadyReassignedLedger = {
    ...ledger,
    fees: [
      { ...ledger.fees[0], historicalOnly: true },
      { feeId: NEW_FEE_ID, feeName: "Tuition (Daily)", amount: 200,
        openingPaidAmount: 100, openingBalance: 100, openingStatus: "Part-paid",
        feeNameSnapshot: "Tuition (Daily)", assignedAmount: 200, historicalOnly: false,
        reassignedFrom: { fromFeeId: OLD_FEE_ID, amount: 150, transferredPaidAmount: 100 } },
    ],
  };
  const alreadyReassigned = reassignObligation({
    ledger: alreadyReassignedLedger,
    fromFeeId: OLD_FEE_ID,
    toFee: { feeId: NEW_FEE_ID, feeName: "Tuition (Daily)", amount: 200 },
    schoolId,
    adminId: "admin-1",
  });
  assert.equal(alreadyReassigned.ok, false);
  assert.ok(/already.*reassign/i.test(alreadyReassigned.error || "") ||
            /historical/i.test(alreadyReassigned.error || ""), alreadyReassigned.error);

  // 3. New fee already assigned as current obligation
  const newFeeAlreadyAssigned = reassignObligation({
    ledger: {
      ...ledger,
      fees: [
        ...ledger.fees,
        { feeId: NEW_FEE_ID, feeName: "Tuition (Daily)", amount: 200,
          openingPaidAmount: 0, openingBalance: 200, openingStatus: "Unpaid",
          feeNameSnapshot: "Tuition (Daily)", assignedAmount: 200, historicalOnly: false },
      ],
    },
    fromFeeId: OLD_FEE_ID,
    toFee: { feeId: NEW_FEE_ID, feeName: "Tuition (Daily)", amount: 200 },
    schoolId,
    adminId: "admin-1",
  });
  assert.equal(newFeeAlreadyAssigned.ok, false);
  assert.ok(/already.*assigned|current obligation/i.test(newFeeAlreadyAssigned.error || ""), newFeeAlreadyAssigned.error);

  // 4. Cross-term mismatch
  const crossTermLedger = {
    ...ledger,
    academicYear: "2025-2026",
    term: "Term 3",
    id: buildLedgerId(schoolId, "student-1", "2025-2026", "Term 3"),
  };
  const crossTerm = reassignObligation({
    ledger: crossTermLedger,
    fromFeeId: OLD_FEE_ID,
    toFee: { feeId: NEW_FEE_ID, feeName: "Tuition (Daily)", amount: 200 },
    schoolId,
    targetAcademicYear: academicYear,
    targetTerm: term,
    adminId: "admin-1",
  });
  assert.equal(crossTerm.ok, false);
  assert.ok(/term|academic year/i.test(crossTerm.error || ""), crossTerm.error);

  // 5. Inactive new fee (active === false)
  const inactiveFee = reassignObligation({
    ledger,
    fromFeeId: OLD_FEE_ID,
    toFee: { feeId: NEW_FEE_ID, feeName: "Tuition (Daily)", amount: 200, active: false },
    schoolId,
    adminId: "admin-1",
  });
  assert.equal(inactiveFee.ok, false);
  assert.ok(/inactive|deactivate/i.test(inactiveFee.error || ""), inactiveFee.error);
});

test("reassign: idempotent — reassigning twice is a no-op / rejected", () => {
  const ledger = buildLedger({
    fees: [{
      feeId: OLD_FEE_ID,
      feeName: "Tuition",
      amount: 150,
      openingPaidAmount: 100,
      openingBalance: 50,
      openingStatus: "Part-paid",
      feeNameSnapshot: "Tuition",
      assignedAmount: 150,
    }],
    totalFee: 150,
    openingPaidAmount: 100,
    openingBalance: 50,
    openingStatus: "Part-paid",
  });

  const first = reassignObligation({
    ledger,
    fromFeeId: OLD_FEE_ID,
    toFee: { feeId: NEW_FEE_ID, feeName: "Tuition (Monthly)", amount: 150 },
    schoolId,
    adminId: "admin-1",
  });
  assert.equal(first.ok, true);

  // Attempt to reassign again from the same old fee
  const second = reassignObligation({
    ledger: first.ledger,
    fromFeeId: OLD_FEE_ID,
    toFee: { feeId: NEW_FEE_ID, feeName: "Tuition (Monthly)", amount: 150 },
    schoolId,
    adminId: "admin-1",
  });
  assert.equal(second.ok, false, "Second reassignment must be rejected");
  assert.ok(/already.*reassign|already.*historical|history/i.test(second.error || ""), second.error);
});

test("reassign: carry-forward entry on ledger is not consumed as a source", () => {
  const cfId = buildCarryForwardId(schoolId, "student-1", "2025-2026", "Term 3");
  const ledger = {
    ...buildLedger({
      fees: [{
        feeId: OLD_FEE_ID,
        feeName: "Tuition",
        amount: 150,
        openingPaidAmount: 100,
        openingBalance: 50,
        openingStatus: "Part-paid",
        feeNameSnapshot: "Tuition",
        assignedAmount: 150,
      }],
      totalFee: 150,
      openingPaidAmount: 100,
      openingBalance: 50,
      openingStatus: "Part-paid",
    }),
    fees: [
      { feeId: OLD_FEE_ID, feeName: "Tuition", amount: 150, openingPaidAmount: 100,
        openingBalance: 50, openingStatus: "Part-paid", feeNameSnapshot: "Tuition", assignedAmount: 150 },
      { feeId: cfId, feeName: "Carried Balance", amount: 80, openingPaidAmount: 0,
        openingBalance: 80, openingStatus: "Unpaid", openingPaidDate: null },
    ],
    totalFee: 230,
    openingPaidAmount: 100,
    openingBalance: 130,
    openingStatus: "Part-paid",
  };

  const result = reassignObligation({
    ledger,
    fromFeeId: OLD_FEE_ID,
    toFee: { feeId: NEW_FEE_ID, feeName: "Tuition (Daily)", amount: 200 },
    schoolId,
    adminId: "admin-1",
  });

  assert.equal(result.ok, true, `Must succeed: ${result.error || ""}`);

  // Carry-forward entry must be preserved unchanged
  const cfEntry = result.ledger.fees.find((f) => f.feeId === cfId);
  assert.ok(cfEntry, "Carry-forward entry must be preserved");
  assert.equal(cfEntry.amount, 80);
  assert.equal(cfEntry.historicalOnly, undefined, "Carry-forward entry is NOT historicalOnly");

  const totals = ledgerTotals(result.ledger, []);
  assert.equal(totals.totalDue, 280, "200 (new tuition) + 80 (carry-forward)");
  assert.equal(totals.totalPaid, 100);
  assert.equal(totals.balance, 180);
});

test("reassign: new ledger aggregate fields updated correctly", () => {
  const ledger = buildLedger({
    fees: [{
      feeId: OLD_FEE_ID,
      feeName: "Tuition",
      amount: 150,
      openingPaidAmount: 100,
      openingBalance: 50,
      openingStatus: "Part-paid",
      feeNameSnapshot: "Tuition",
      assignedAmount: 150,
    }],
    totalFee: 150,
    openingPaidAmount: 100,
    openingBalance: 50,
    openingStatus: "Part-paid",
  });

  const result = reassignObligation({
    ledger,
    fromFeeId: OLD_FEE_ID,
    toFee: { feeId: NEW_FEE_ID, feeName: "Tuition (Daily)", amount: 200 },
    schoolId,
    adminId: "admin-1",
  });

  assert.equal(result.ok, true);
  assert.equal(sumDemandedAmounts(result.ledger.fees), 200, "sumDemandedAmounts excludes historical-only");
  assert.equal(result.ledger.totalFee, 350, "totalFee still sums all entries (frozen semantics)");
  assert.equal(result.ledger.openingPaidAmount, 100, "Ledger-level openingPaid = 100 (transferred)");
  assert.equal(result.ledger.openingBalance, 100, "Ledger-level openingBalance = 100");
  assert.equal(result.ledger.openingStatus, "Part-paid");
});
