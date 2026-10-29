import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  buildLedgerFeeList,
  buildLedgerFeesPayload,
  buildFeeAssignmentSignature,
  collectCarryForwardFees,
  isCarryForwardFeeEntry,
  resolveAssignedAmount,
  resolveAssignedFeeName,
  hasHistoricalSnapshot,
} from "../services/ledgerFeeAssignment.js";
import {
  buildCarryForwardId,
  buildLedgerId,
  isCarryForwardFee,
} from "../services/termBalanceCarryForward.js";
import { allocate } from "../services/feeAllocation.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const feesPagePath = path.join(repoRoot, "pages", "admin", "FeesPayments.tsx");

const schoolId = "school-1";
const studentId = "student-1";
const academicYear = "2026-2027";
const term = "Term 1";
const currentTermFees = [
  {
    id: "fee-tuition-current",
    feeName: "Tuition",
    amount: 600,
  },
];
const carryForwardFeeId = buildCarryForwardId(
  schoolId,
  studentId,
  "2025-2026",
  "Term 3",
);
const carryForwardFee = {
  feeId: carryForwardFeeId,
  feeName: "Carried Balance (Term 3, 2025-2026)",
  amount: 200,
  openingPaidAmount: 0,
  openingBalance: 200,
  openingStatus: "Unpaid",
  openingPaidDate: null,
};

/**
 * The ledger document as it exists in storage before the fee assignment runs:
 * GHS 600 of current term fees plus the GHS 200 carry-forward entry written by
 * the term rollover.
 */
const existingLedger = {
  id: buildLedgerId(schoolId, studentId, academicYear, term),
  schoolId,
  studentId,
  classId: "class-1",
  academicYear,
  term,
  fees: [
    {
      feeId: "fee-tuition-current",
      feeName: "Tuition",
      amount: 600,
      openingPaidAmount: 0,
    },
    carryForwardFee,
  ],
  totalFee: 800,
  openingPaidAmount: 0,
  openingBalance: 800,
  openingStatus: "Unpaid",
};

/**
 * Production ledger totals (services/mockDb.ts:4584-4612).
 */
const productionLedgerTotals = (ledger, payments = []) => {
  const totalDue = ledger.fees.reduce((sum, fee) => sum + fee.amount, 0);
  const openingPaid = ledger.openingPaidAmount || 0;
  const totalPaid = payments
    .filter(
      (payment) =>
        payment.studentId === ledger.studentId &&
        payment.academicYear === ledger.academicYear &&
        payment.term === ledger.term,
    )
    .reduce((sum, payment) => sum + payment.amountPaid, 0);
  const totalPaidIncludingOpening = openingPaid + totalPaid;
  return {
    totalDue,
    totalPaid: totalPaidIncludingOpening,
    balance: Math.max(0, totalDue - totalPaidIncludingOpening),
  };
};

/**
 * Mirror of pages/admin/FeesPayments.tsx `ensureLedger`: build the ledger
 * payload from the assigned fees and the existing ledger, then persist it on
 * the storage path used by services/mockDb.ts (upsertStudentLedger).
 */
const runEnsureLedger = ({ db, assignedFees, ledger }) => {
  const existingFees = ledger?.fees || [];
  const feePayload = buildLedgerFeesPayload({ assignedFees, existingFees });
  const payload = {
    id: buildLedgerId(schoolId, studentId, academicYear, term),
    schoolId,
    studentId,
    classId: "class-1",
    academicYear,
    term,
    fees: feePayload.fees,
    totalFee: feePayload.totalFee,
    openingPaidAmount: feePayload.openingPaidAmount,
    openingBalance: feePayload.openingBalance,
    openingStatus: feePayload.openingStatus,
    openingDate: ledger?.openingDate || null,
    createdAt: ledger?.createdAt || 1,
    updatedAt: 2,
  };
  db.upsertStudentLedger(payload);
  return payload;
};

/**
 * Mirror of pages/admin/FeesPayments.tsx `ensureLedgersBulk`: build every
 * ledger payload and persist them in bulk (upsertStudentLedgersBulk).
 */
const runEnsureLedgersBulk = ({ db, assignedFees, ledgers }) => {
  const payloads = ledgers.map((ledger) => {
    const existingFees = ledger?.fees || [];
    const feePayload = buildLedgerFeesPayload({ assignedFees, existingFees });
    return {
      id: buildLedgerId(schoolId, studentId, academicYear, term),
      schoolId,
      studentId,
      classId: "class-1",
      academicYear,
      term,
      fees: feePayload.fees,
      totalFee: feePayload.totalFee,
      openingPaidAmount: feePayload.openingPaidAmount,
      openingBalance: feePayload.openingBalance,
      openingStatus: feePayload.openingStatus,
      openingDate: ledger?.openingDate || null,
      createdAt: ledger?.createdAt || 1,
      updatedAt: 2,
    };
  });
  db.upsertStudentLedgersBulk(payloads);
  return payloads;
};

/**
 * Minimal Firestore stand-in that mirrors the storage paths used by
 * services/mockDb.ts for ledgers and payments.
 */
class FakeLedgerStore {
  constructor({ useV2 }) {
    this.useV2 = useV2;
    this.records = new Map();
  }
  ledgerPath(id) {
    return this.useV2
      ? `schools/${schoolId}/feeLedgers/${id}`
      : `student_ledgers/${id}`;
  }
  paymentsPath(id) {
    return this.useV2 ? `schools/${schoolId}/payments/${id}` : `payments/${id}`;
  }
  upsertStudentLedger(ledger) {
    // services/mockDb.ts:4367-4384 - setDoc(..., { merge: true }) replaces
    // top level fields, so the fees array is replaced wholesale.
    this.records.set(this.ledgerPath(ledger.id), {
      ...ledger,
    });
  }
  upsertStudentLedgersBulk(ledgers) {
    ledgers.forEach((ledger) => this.upsertStudentLedger(ledger));
  }
  recordStudentPayment(payment) {
    this.records.set(this.paymentsPath(payment.id), { ...payment });
  }
  readLedger(id) {
    return this.records.get(this.ledgerPath(id));
  }
  readAll() {
    return [...this.records.entries()];
  }
}

test("fee assignment: ensureLedger preserves the carry-forward entry (v1 storage)", () => {
  const db = new FakeLedgerStore({ useV2: false });
  db.upsertStudentLedger(existingLedger);

  const payload = runEnsureLedger({
    db,
    assignedFees: currentTermFees,
    ledger: db.readLedger(existingLedger.id),
  });

  const persisted = db.readLedger(existingLedger.id);
  assert.ok(persisted, "Ledger must still exist after fee assignment");

  // Both the current term fee and the carry-forward survive
  const carryForwardEntries = persisted.fees.filter(
    (fee) => fee.feeId === carryForwardFeeId,
  );
  assert.equal(carryForwardEntries.length, 1, "Exactly one carry-forward entry");
  assert.equal(carryForwardEntries[0].amount, 200);
  assert.equal(carryForwardEntries[0].feeName, "Carried Balance (Term 3, 2025-2026)");
  assert.equal(carryForwardEntries[0].openingPaidAmount, 0);
  assert.equal(carryForwardEntries[0].openingBalance, 200);
  assert.equal(carryForwardEntries[0].openingStatus, "Unpaid");

  const currentFee = persisted.fees.find(
    (fee) => fee.feeId === "fee-tuition-current",
  );
  assert.ok(currentFee, "Current term fee must be preserved");
  assert.equal(currentFee.amount, 600);

  // Total due stays at GHS 800
  const totals = productionLedgerTotals(persisted);
  assert.equal(totals.totalDue, 800);
  assert.equal(totals.balance, 800);
  assert.equal(persisted.totalFee, 800);

  // The production allocation engine agrees
  const allocations = allocate(
    800,
    persisted.fees.map((fee) => ({
      feeId: fee.feeId,
      feeName: fee.feeName,
      amount: fee.amount,
      openingPaidAmount: fee.openingPaidAmount,
      alreadyPaid: 0,
    })),
    "priority",
  );
  assert.equal(
    allocations.filter((allocation) => allocation.isOverpayment).length,
    0,
    "GHS 800 must be fully covered by the ledger fees",
  );
  assert.equal(payload.fees.length, 2);
});

test("fee assignment: ensureLedgersBulk preserves the carry-forward entry (v2 storage)", () => {
  const db = new FakeLedgerStore({ useV2: true });
  db.upsertStudentLedger(existingLedger);

  const payloads = runEnsureLedgersBulk({
    db,
    assignedFees: currentTermFees,
    ledgers: [db.readLedger(existingLedger.id)],
  });

  const persisted = db.readLedger(existingLedger.id);
  assert.ok(persisted, "v2 ledger must still exist after fee assignment");
  assert.ok(
    db.readAll().some(([key]) =>
      key.startsWith(`schools/${schoolId}/feeLedgers/`),
    ),
    "Ledger must be stored on the v2 path",
  );

  const carryForwardEntries = persisted.fees.filter(
    (fee) => fee.feeId === carryForwardFeeId,
  );
  assert.equal(carryForwardEntries.length, 1, "Exactly one carry-forward entry");
  assert.equal(carryForwardEntries[0].amount, 200);

  const currentFee = persisted.fees.find(
    (fee) => fee.feeId === "fee-tuition-current",
  );
  assert.ok(currentFee, "Current term fee must be preserved");
  assert.equal(currentFee.amount, 600);

  const totals = productionLedgerTotals(persisted);
  assert.equal(totals.totalDue, 800);
  assert.equal(totals.balance, 800);
  assert.equal(payloads[0].fees.length, 2);
});

test("fee assignment: repeated reassignment never duplicates the carry-forward", () => {
  for (const useV2 of [false, true]) {
    const db = new FakeLedgerStore({ useV2 });
    db.upsertStudentLedger(existingLedger);

    for (let round = 0; round < 3; round += 1) {
      runEnsureLedger({
        db,
        assignedFees: currentTermFees,
        ledger: db.readLedger(existingLedger.id),
      });
    }

    const persisted = db.readLedger(existingLedger.id);
    const carryForwardEntries = persisted.fees.filter(
      (fee) => fee.feeId === carryForwardFeeId,
    );
    assert.equal(
      carryForwardEntries.length,
      1,
      `Exactly one carry-forward entry after repeated assignment (useV2=${useV2})`,
    );
    assert.equal(carryForwardEntries[0].amount, 200);
    assert.equal(productionLedgerTotals(persisted).totalDue, 800);
  }
});

test("fee assignment: existing assignment is frozen when the live fee amount changes", () => {
  const db = new FakeLedgerStore({ useV2: false });
  db.upsertStudentLedger(existingLedger);

  // The live definition is re-priced from 600 to 700, but the student was
  // already assigned at 600. The historical obligation and its snapshot must
  // survive unchanged; only genuinely new assignments use 700.
  runEnsureLedger({
    db,
    assignedFees: [{ id: "fee-tuition-current", feeName: "Tuition", amount: 700 }],
    ledger: db.readLedger(existingLedger.id),
  });

  const persisted = db.readLedger(existingLedger.id);
  const currentFee = persisted.fees.find(
    (fee) => fee.feeId === "fee-tuition-current",
  );
  assert.equal(
    currentFee.amount,
    600,
    "Existing assignment amount must be frozen, not updated to the live 700",
  );
  assert.equal(
    currentFee.assignedAmount,
    600,
    "Historical assignedAmount snapshot must be preserved",
  );
  assert.equal(
    currentFee.feeNameSnapshot,
    "Tuition",
    "Historical feeNameSnapshot must be preserved",
  );

  const carryForwardEntries = persisted.fees.filter(
    (fee) => fee.feeId === carryForwardFeeId,
  );
  assert.equal(carryForwardEntries.length, 1);
  assert.equal(carryForwardEntries[0].amount, 200);
  // 600 (frozen) + 200 (carry-forward) = 800, unchanged by the live edit.
  assert.equal(productionLedgerTotals(persisted).totalDue, 800);
});

test("fee assignment: obsolete ordinary fee entries are retained as historical records", () => {
  const db = new FakeLedgerStore({ useV2: false });
  db.upsertStudentLedger({
    ...existingLedger,
    fees: [
      ...existingLedger.fees,
      // An ordinary fee that is no longer assigned to the student (scope
      // narrowed or fee deactivated). Its obligation and payment attribution
      // must survive as a historical record rather than being silently
      // erased.
      { feeId: "fee-old-lunch", feeName: "Lunch", amount: 150 },
    ],
  });

  runEnsureLedger({
    db,
    assignedFees: currentTermFees,
    ledger: db.readLedger(existingLedger.id),
  });

  const persisted = db.readLedger(existingLedger.id);
  assert.equal(
    persisted.fees.some((fee) => fee.feeId === "fee-old-lunch"),
    true,
    "Obsolete ordinary fee entries must be retained as historical records",
  );
  const obsolete = persisted.fees.find((fee) => fee.feeId === "fee-old-lunch");
  assert.equal(obsolete.amount, 150, "Obsolete entry keeps its historical amount");
  // The entry is preserved verbatim; it carries no Phase 1 snapshot because it
  // was hand-crafted without one, and Phase 2 must not invent one.
  assert.equal(obsolete.assignedAmount, undefined);
  assert.equal(obsolete.feeName, "Lunch");
  // 600 (current) + 150 (retained historical) + 200 (carry-forward) = 950.
  assert.equal(productionLedgerTotals(persisted).totalDue, 950);
});

test("fee assignment: payments and prior-term records remain intact", () => {
  const db = new FakeLedgerStore({ useV2: false });

  // Prior term ledger + payment, and a new term payment with an allocation
  db.records.set("student_ledgers/ledger-prev", {
    schoolId,
    studentId,
    term: "Term 3",
    academicYear: "2025-2026",
    fees: [{ feeId: "fee-tuition", feeName: "Tuition", amount: 500 }],
  });
  db.records.set("payments/payment-prev", {
    id: "payment-prev",
    schoolId,
    studentId,
    term: "Term 3",
    academicYear: "2025-2026",
    feeId: "fee-tuition",
    amountPaid: 300,
  });
  db.recordStudentPayment({
    id: "payment-current",
    schoolId,
    studentId,
    term,
    academicYear,
    feeId: carryForwardFeeId,
    amountPaid: 200,
  });
  db.upsertStudentLedger(existingLedger);

  runEnsureLedger({
    db,
    assignedFees: currentTermFees,
    ledger: db.readLedger(existingLedger.id),
  });

  const persisted = db.readLedger(existingLedger.id);
  const payments = db
    .readAll()
    .filter(
      ([, value]) =>
        value &&
        value.studentId === studentId &&
        typeof value.amountPaid === "number",
    )
    .map(([, value]) => value);

  // The allocation recorded against the carry-forward fee still reduces the
  // outstanding balance.
  const totals = productionLedgerTotals(persisted, payments);
  assert.equal(totals.totalDue, 800);
  assert.equal(totals.totalPaid, 200);
  assert.equal(totals.balance, 600);

  // Prior term records are untouched
  const previousLedger = db.records.get("student_ledgers/ledger-prev");
  assert.equal(previousLedger.term, "Term 3");
  assert.equal(previousLedger.fees[0].amount, 500);
  const previousPayment = db.records.get("payments/payment-prev");
  assert.equal(previousPayment.amountPaid, 300);
  assert.equal(previousPayment.term, "Term 3");
});

test("fee assignment: admin page wires both ledger builders to the shared helper", () => {
  const source = readFileSync(feesPagePath, "utf8");

  assert.ok(
    source.includes('from "../../services/ledgerFeeAssignment";'),
    "FeesPayments.tsx must import the shared fee-assignment helper",
  );
  assert.equal(
    (source.match(/buildLedgerFeesPayload\(\{ assignedFees, existingFees \}\)/g) || [])
      .length,
    2,
    "Both ensureLedger and ensureLedgersBulk must use buildLedgerFeesPayload",
  );
  assert.ok(
    source.includes("buildFeeAssignmentSignature("),
    "The automatic ledger sync must ignore carry-forward entries",
  );
  // The old behaviour (rebuilding the fee list inline) must be gone.
  assert.equal(
    source.includes("const feesList = assignedFees.map((fee) => {"),
    false,
    "The inline fee-list rebuild must be replaced by the shared helper",
  );
});

test("fee assignment: carry-forward detection and signature helpers", () => {
  assert.equal(isCarryForwardFeeEntry(carryForwardFee), true);
  assert.equal(
    isCarryForwardFeeEntry({ feeId: "fee-tuition-current", amount: 600 }),
    false,
  );
  assert.equal(isCarryForwardFeeEntry(undefined), false);
  assert.equal(isCarryForwardFee(carryForwardFeeId), true);

  assert.equal(collectCarryForwardFees(existingLedger.fees).length, 1);

  // The assignment signature is identity-based (feeId only) and ignores
  // carry-forward entries, so a live fee amount/name edit cannot trigger a
  // spurious ledger sync.
  const signature = buildFeeAssignmentSignature(existingLedger.fees);
  assert.equal(signature, "fee-tuition-current");
  assert.equal(
    buildFeeAssignmentSignature([
      { feeId: "fee-tuition-current", amount: 600 },
      carryForwardFee,
    ]),
    buildFeeAssignmentSignature([{ feeId: "fee-tuition-current", amount: 600 }]),
  );
  // Identity-based: changing the live amount does not change the signature.
  assert.equal(
    buildFeeAssignmentSignature([
      { feeId: "fee-tuition-current", amount: 999 },
    ]),
    buildFeeAssignmentSignature([{ feeId: "fee-tuition-current", amount: 600 }]),
  );

  // The fee list keeps the carry-forward entry exactly once
  const fees = buildLedgerFeeList({
    assignedFees: currentTermFees,
    existingFees: [...existingLedger.fees, carryForwardFee],
  });
  assert.equal(fees.filter((fee) => fee.feeId === carryForwardFeeId).length, 1);
  assert.equal(fees.length, 2);
});

// --- Phase 1: historical snapshot fields (additive, optional) ---

test("phase1: new ledger entry receives snapshots from the assigned fee", () => {
  const db = new FakeLedgerStore({ useV2: false });
  const freshLedger = { ...existingLedger, fees: [] };
  db.upsertStudentLedger(freshLedger);

  const payload = runEnsureLedger({
    db,
    assignedFees: [{ id: "fee-tuition-current", feeName: "Tuition", amount: 300 }],
    ledger: db.readLedger(freshLedger.id),
  });

  const entry = payload.fees.find((fee) => fee.feeId === "fee-tuition-current");
  assert.ok(entry, "Assigned fee entry must exist");
  assert.equal(entry.feeName, "Tuition");
  assert.equal(entry.amount, 300);
  assert.equal(entry.feeNameSnapshot, "Tuition", "New assignment must snapshot the fee name");
  assert.equal(entry.assignedAmount, 300, "New assignment must snapshot the fee amount");
});

test("phase1: existing entry without snapshots is lazily backfilled from its own stored values", () => {
  const db = new FakeLedgerStore({ useV2: false });
  db.upsertStudentLedger(existingLedger);

  runEnsureLedger({
    db,
    assignedFees: currentTermFees,
    ledger: db.readLedger(existingLedger.id),
  });

  const persisted = db.readLedger(existingLedger.id);
  const entry = persisted.fees.find((fee) => fee.feeId === "fee-tuition-current");
  assert.equal(entry.feeNameSnapshot, "Tuition", "Backfilled snapshot must equal stored feeName");
  assert.equal(entry.assignedAmount, 600, "Backfilled snapshot must equal stored amount");
});

test("phase1: backfill uses stored ledger values, never the live FeeDefinition", () => {
  const db = new FakeLedgerStore({ useV2: false });
  db.upsertStudentLedger(existingLedger);

  // The live fee definition says 700, but the stored ledger entry still says
  // 600. Under Phase 2 the existing assignment is FROZEN: both the live
  // `amount` and the snapshot come from the stored entry, never from the live
  // definition.
  runEnsureLedger({
    db,
    assignedFees: [{ id: "fee-tuition-current", feeName: "Tuition", amount: 700 }],
    ledger: db.readLedger(existingLedger.id),
  });

  const persisted = db.readLedger(existingLedger.id);
  const entry = persisted.fees.find((fee) => fee.feeId === "fee-tuition-current");
  assert.equal(
    entry.amount,
    600,
    "Existing assignment amount must be frozen at the stored 600, not the live 700",
  );
  assert.equal(
    entry.assignedAmount,
    600,
    "Snapshot must be backfilled from the stored 600, NOT the live 700",
  );
  assert.equal(entry.feeNameSnapshot, "Tuition");
});

test("phase1: existing snapshots are never overwritten during backfill", () => {
  const db = new FakeLedgerStore({ useV2: false });
  const ledgerWithSnapshots = {
    ...existingLedger,
    fees: existingLedger.fees.map((fee) =>
      fee.feeId === "fee-tuition-current"
        ? { ...fee, feeNameSnapshot: "Old Tuition", assignedAmount: 300 }
        : fee,
    ),
  };
  db.upsertStudentLedger(ledgerWithSnapshots);

  // Live definition has been renamed and re-priced since the snapshot was taken.
  // Under Phase 2 the existing assignment is frozen verbatim: the historical
  // name and amount survive and are never replaced by the live definition.
  runEnsureLedger({
    db,
    assignedFees: [{ id: "fee-tuition-current", feeName: "New Tuition", amount: 350 }],
    ledger: db.readLedger(ledgerWithSnapshots.id),
  });

  const persisted = db.readLedger(ledgerWithSnapshots.id);
  const entry = persisted.fees.find((fee) => fee.feeId === "fee-tuition-current");
  // The entry is preserved verbatim: its stored feeName ("Tuition") and amount
  // (600) are frozen, and the pre-existing snapshot ("Old Tuition"/300) is
  // preserved untouched. None of these are replaced by the live definition.
  assert.equal(entry.feeName, "Tuition", "Stored historical feeName must be frozen");
  assert.equal(entry.amount, 600, "Stored historical amount must be frozen");
  assert.equal(
    entry.feeNameSnapshot,
    "Old Tuition",
    "Existing snapshot must be preserved verbatim",
  );
  assert.equal(entry.assignedAmount, 300, "Existing snapshot must be preserved verbatim");
});

test("phase1: carry-forward entries are not given synthetic snapshots", () => {
  const db = new FakeLedgerStore({ useV2: false });
  db.upsertStudentLedger(existingLedger);

  runEnsureLedger({
    db,
    assignedFees: currentTermFees,
    ledger: db.readLedger(existingLedger.id),
  });

  const persisted = db.readLedger(existingLedger.id);
  const carry = persisted.fees.find((fee) => fee.feeId === carryForwardFeeId);
  assert.ok(carry, "Carry-forward entry must still be preserved");
  assert.equal(carry.amount, 200);
  assert.equal(
    hasHistoricalSnapshot(carry),
    false,
    "Carry-forward entries must not be given synthetic snapshots",
  );
});

test("phase1: read-compatibility helpers fall back to live fields", () => {
  const entryWithSnapshots = {
    feeId: "fee-tuition-current",
    feeName: "Tuition",
    amount: 600,
    feeNameSnapshot: "Old Tuition",
    assignedAmount: 300,
  };
  assert.equal(resolveAssignedAmount(entryWithSnapshots), 300);
  assert.equal(resolveAssignedFeeName(entryWithSnapshots), "Old Tuition");

  const legacyEntry = { feeId: "fee-tuition-current", feeName: "Tuition", amount: 600 };
  assert.equal(resolveAssignedAmount(legacyEntry), 600, "Legacy entry falls back to amount");
  assert.equal(resolveAssignedFeeName(legacyEntry), "Tuition", "Legacy entry falls back to feeName");
  assert.equal(hasHistoricalSnapshot(legacyEntry), false);
  assert.equal(resolveAssignedAmount(undefined), 0);
  assert.equal(resolveAssignedFeeName(undefined), "");
});

test("phase1: repeated reassignment keeps snapshots stable and idempotent", () => {
  for (const useV2 of [false, true]) {
    const db = new FakeLedgerStore({ useV2 });
    db.upsertStudentLedger(existingLedger);

    for (let round = 0; round < 3; round += 1) {
      runEnsureLedger({
        db,
        assignedFees: [{ id: "fee-tuition-current", feeName: "Tuition", amount: 300 }],
        ledger: db.readLedger(existingLedger.id),
      });
    }

    const persisted = db.readLedger(existingLedger.id);
    const entry = persisted.fees.find((fee) => fee.feeId === "fee-tuition-current");
    assert.equal(entry.feeNameSnapshot, "Tuition");
    // Phase 1 backfill semantics: the snapshot is seeded from the EXISTING
    // entry's stored values (600), never from the newly-assigned fee (300).
    assert.equal(entry.assignedAmount, 600);
    assert.equal(
      persisted.fees.filter((fee) => fee.feeId === "fee-tuition-current").length,
      1,
    );
  }
});
