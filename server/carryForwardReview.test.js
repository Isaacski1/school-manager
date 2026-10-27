import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCarryForwardNotificationId,
  buildCarryForwardNotificationMessage,
  buildCarryForwardReview,
  buildCarryForwardReviewId,
  buildCarryForwardRows,
  buildClassNameLookup,
  isCarryForwardFeeId,
  parseCarryForwardFeeId,
  resolveClassLabel,
  sumPaidAgainstFee,
} from "../services/carryForwardReview.js";
import { buildCarryForwardId } from "../services/termBalanceCarryForward.js";
import {
  loadCarryForwardReview,
  publishCarryForwardReview,
} from "./carryForwardReview.js";
import { createTermRolloverService } from "./termRollover.js";

const schoolId = "school-1";
const studentId = "student-1";
const otherStudentId = "student-2";
const fromAcademicYear = "2025-2026";
const fromTerm = "Term 3";
const toAcademicYear = "2026-2027";
const toTerm = "Term 1";

const carryForwardFeeId = buildCarryForwardId(
  schoolId,
  studentId,
  fromAcademicYear,
  fromTerm,
);

// ---------------------------------------------------------------------------
// Minimal Firestore stand-in (supports the reads/writes used by the rollover
// service and by the carry-forward review).
// ---------------------------------------------------------------------------
class FakeFirestore {
  constructor(seed = {}) {
    this.records = new Map(
      Object.entries(seed).map(([path, value]) => [path, structuredClone(value)]),
    );
    this.autoId = 1;
  }
  collection(path) {
    return new FakeCollectionRef(this, path);
  }
  batch() {
    const db = this;
    const operations = [];
    return {
      set: (ref, value) => operations.push(() => ref.set(value)),
      delete: (ref) => operations.push(() => db.records.delete(ref.path)),
      commit: async () => {
        for (const operation of operations) await operation();
      },
    };
  }
  async runTransaction(callback) {
    const db = this;
    const operations = [];
    const result = await callback({
      get: (ref) => ref.get(),
      update: (ref, value) => operations.push(() => ref.update(value)),
    });
    for (const operation of operations) await operation();
    return result;
  }
  read(path) {
    return this.records.get(path);
  }
  keys() {
    return [...this.records.keys()];
  }
}

class FakeCollectionRef {
  constructor(db, path) {
    this.db = db;
    this.path = path;
  }
  get prefix() {
    return `${this.path}/`;
  }
  get depth() {
    return this.path.split("/").length + 1;
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
  where(field, operator, value) {
    const collection = this;
    return {
      async get() {
        const docs = [...collection.db.records.entries()]
          .filter(
            ([key]) =>
              key.startsWith(collection.prefix) &&
              key.split("/").length === collection.depth,
          )
          .filter(([, data]) => data?.[field] === value)
          .map(([key, data]) => {
            const ref = new FakeDocRef(collection.db, key);
            return { id: ref.id, ref, data: () => data };
          });
        return { docs };
      },
    };
  }
  async get() {
    const docs = [...this.db.records.entries()]
      .filter(
        ([key]) =>
          key.startsWith(this.prefix) && key.split("/").length === this.depth,
      )
      .map(([key, data]) => {
        const ref = new FakeDocRef(this.db, key);
        return { id: ref.id, ref, data: () => data };
      });
    return { docs };
  }
}

class FakeDocRef {
  constructor(db, path) {
    this.db = db;
    this.path = path;
    this.id = path.split("/").at(-1);
  }
  collection(name) {
    return new FakeCollectionRef(this.db, `${this.path}/${name}`);
  }
  async get() {
    const data = this.db.records.get(this.path);
    return {
      id: this.id,
      exists: Boolean(data),
      data: () => data,
    };
  }
  async set(value) {
    this.db.records.set(this.path, structuredClone(value));
  }
  async update(value) {
    const current = this.db.records.get(this.path) || {};
    this.db.records.set(this.path, { ...current, ...structuredClone(value) });
  }
}

const Timestamp = { fromDate: (date) => new Date(date) };
const FieldValue = { serverTimestamp: () => new Date("2026-09-10T12:00:00.000Z") };

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const students = [
  { id: studentId, name: "Ama Mensah", classId: "class-1", className: "JHS 1A" },
  {
    id: otherStudentId,
    name: "Kofi Owusu",
    classId: "class-2",
    className: "JHS 2A",
  },
];

const currentLedger = (fees) => ({
  id: `${schoolId}_${studentId}_${toAcademicYear}_${toTerm.replace(/\s+/g, "")}`,
  schoolId,
  studentId,
  classId: "class-1",
  academicYear: toAcademicYear,
  term: toTerm,
  fees,
});

const currentFee = {
  feeId: "fee-tuition-current",
  feeName: "Tuition",
  amount: 600,
  openingPaidAmount: 0,
};

const carriedFee = {
  feeId: carryForwardFeeId,
  feeName: "Carried Balance (Term 3, 2025-2026)",
  amount: 200,
  openingPaidAmount: 0,
  openingBalance: 200,
  openingStatus: "Unpaid",
  openingPaidDate: null,
};

test("carry-forward review: identifies a carry-forward entry on a ledger", () => {
  const rows = buildCarryForwardRows({
    ledgers: [currentLedger([currentFee, carriedFee])],
    payments: [],
    students,
    schoolId,
    academicYear: toAcademicYear,
    term: toTerm,
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].studentId, studentId);
  assert.equal(rows[0].studentName, "Ama Mensah");
  assert.equal(rows[0].classId, "class-1");
  assert.equal(rows[0].className, "JHS 1A");
  assert.equal(rows[0].fromAcademicYear, fromAcademicYear);
  assert.equal(rows[0].fromTerm, fromTerm);
  assert.equal(rows[0].toAcademicYear, toAcademicYear);
  assert.equal(rows[0].toTerm, toTerm);
  assert.equal(rows[0].carryForwardFeeId, carryForwardFeeId);
  assert.equal(rows[0].status, "outstanding");
});

test("carry-forward review: ordinary fees are never identified as carry-forward", () => {
  const rows = buildCarryForwardRows({
    ledgers: [
      currentLedger([
        currentFee,
        { feeId: "fee-lunch", feeName: "Lunch", amount: 150 },
        { feeId: "__overpayment__", feeName: "Credit", amount: 20 },
      ]),
    ],
    payments: [],
    students,
    schoolId,
    academicYear: toAcademicYear,
    term: toTerm,
  });

  assert.equal(rows.length, 0, "Ordinary fees must not produce review rows");
  assert.equal(isCarryForwardFeeId("fee-lunch"), false);
  assert.equal(isCarryForwardFeeId("fee-tuition-current"), false);
  assert.equal(isCarryForwardFeeId(undefined), false);
});

test("carry-forward review: carried amount comes from the persisted ledger entry", () => {
  const rows = buildCarryForwardRows({
    ledgers: [currentLedger([currentFee, { ...carriedFee, amount: 275 }])],
    payments: [],
    students,
    schoolId,
    academicYear: toAcademicYear,
    term: toTerm,
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].carriedAmount, 275);
  assert.equal(rows[0].paidAmount, 0);
  assert.equal(rows[0].outstandingAmount, 275);
});

test("carry-forward review: outstanding is reduced by payments against the carried balance", () => {
  const payments = [
    {
      studentId,
      academicYear: toAcademicYear,
      term: toTerm,
      feeId: carryForwardFeeId,
      amountPaid: 200,
      isOpeningPayment: false,
    },
  ];
  const rows = buildCarryForwardRows({
    ledgers: [currentLedger([currentFee, carriedFee])],
    payments,
    students,
    schoolId,
    academicYear: toAcademicYear,
    term: toTerm,
  });

  assert.equal(rows[0].carriedAmount, 200);
  assert.equal(rows[0].paidAmount, 200);
  assert.equal(rows[0].outstandingAmount, 0);
  assert.equal(rows[0].status, "settled");
});

test("carry-forward review: payments stored with allocations are credited to the carried fee", () => {
  const payments = [
    {
      studentId,
      academicYear: toAcademicYear,
      term: toTerm,
      feeId: "fee-tuition-current",
      amountPaid: 300,
      allocations: [
        { feeId: carryForwardFeeId, amountPaid: 200 },
        { feeId: "fee-tuition-current", amountPaid: 100 },
      ],
      isOpeningPayment: false,
    },
  ];
  const rows = buildCarryForwardRows({
    ledgers: [currentLedger([currentFee, carriedFee])],
    payments,
    students,
    schoolId,
    academicYear: toAcademicYear,
    term: toTerm,
  });

  assert.equal(rows[0].paidAmount, 200);
  assert.equal(rows[0].outstandingAmount, 0);
  assert.equal(sumPaidAgainstFee(payments, carryForwardFeeId), 200);
});

test("carry-forward review: fully paid students are excluded from the active list", () => {
  const review = buildCarryForwardReview({
    ledgers: [
      currentLedger([currentFee, carriedFee]),
      {
        ...currentLedger([currentFee, carriedFee]),
        id: `${schoolId}_${otherStudentId}_${toAcademicYear}_Term1`,
        studentId: otherStudentId,
        classId: "class-2",
      },
    ],
    payments: [
      {
        studentId: otherStudentId,
        academicYear: toAcademicYear,
        term: toTerm,
        feeId: carryForwardFeeId,
        amountPaid: 200,
        isOpeningPayment: false,
      },
    ],
    students,
    schoolId,
    academicYear: toAcademicYear,
    term: toTerm,
  });

  assert.equal(review.rows.length, 2, "Both students remain in the history rows");
  assert.equal(review.outstandingRows.length, 1, "Only the unsettled student is active");
  assert.equal(review.outstandingRows[0].studentId, studentId);
  assert.equal(review.totals.studentCount, 2);
  assert.equal(review.totals.outstandingStudentCount, 1);
  assert.equal(review.totals.carriedAmount, 400);
  assert.equal(review.totals.paidAmount, 200);
  assert.equal(review.totals.outstandingAmount, 200);
});

test("carry-forward review: groups by class and keeps the source term", () => {
  const review = buildCarryForwardReview({
    ledgers: [
      currentLedger([currentFee, carriedFee]),
      {
        ...currentLedger([currentFee, carriedFee]),
        id: `${schoolId}_${otherStudentId}_${toAcademicYear}_Term1`,
        studentId: otherStudentId,
        classId: "class-2",
      },
    ],
    payments: [],
    students,
    schoolId,
    academicYear: toAcademicYear,
    term: toTerm,
  });

  assert.equal(review.groups.byClass.length, 2);
  const class1 = review.groups.byClass.find((group) => group.key === "class-1");
  assert.equal(class1.label, "JHS 1A");
  assert.equal(class1.studentCount, 1);
  assert.equal(class1.carriedAmount, 200);
  assert.equal(class1.outstandingAmount, 200);

  assert.equal(review.groups.bySourceTerm.length, 1);
  assert.equal(review.groups.bySourceTerm[0].label, "Term 3, 2025-2026");
  assert.equal(review.groups.bySourceTerm[0].studentCount, 2);
  assert.equal(review.groups.bySourceTerm[0].carriedAmount, 400);
});

test("carry-forward review: reads v1 root collections", async () => {
  const db = new FakeFirestore({
    [`student_ledgers/${schoolId}_${studentId}_${toAcademicYear}_Term1`]: {
      ...currentLedger([currentFee, carriedFee]),
      schoolId,
    },
    [`payments/payment-1`]: {
      schoolId,
      studentId,
      academicYear: toAcademicYear,
      term: toTerm,
      feeId: carryForwardFeeId,
      amountPaid: 100,
      isOpeningPayment: false,
    },
    [`students/${studentId}`]: { ...students[0], schoolId },
  });

  const review = await loadCarryForwardReview({
    db,
    schoolId,
    academicYear: toAcademicYear,
    term: toTerm,
  });

  assert.equal(review.totals.studentCount, 1);
  assert.equal(review.rows[0].carriedAmount, 200);
  assert.equal(review.rows[0].paidAmount, 100);
  assert.equal(review.rows[0].outstandingAmount, 100);
  assert.equal(review.rows[0].studentName, "Ama Mensah");
  assert.equal(review.groups.byClass[0].label, "JHS 1A");
});

test("carry-forward review: reads v2 school sub-collections", async () => {
  const db = new FakeFirestore({
    [`schools/${schoolId}/feeLedgers/${schoolId}_${studentId}_${toAcademicYear}_Term1`]: {
      ...currentLedger([currentFee, carriedFee]),
      schoolId,
    },
    [`schools/${schoolId}/payments/payment-1`]: {
      schoolId,
      studentId,
      academicYear: toAcademicYear,
      term: toTerm,
      feeId: carryForwardFeeId,
      amountPaid: 100,
      isOpeningPayment: false,
    },
    [`students/${studentId}`]: { ...students[0], schoolId },
  });

  const review = await loadCarryForwardReview({
    db,
    schoolId,
    academicYear: toAcademicYear,
    term: toTerm,
  });

  assert.equal(review.totals.studentCount, 1);
  assert.equal(review.rows[0].carriedAmount, 200);
  assert.equal(review.rows[0].paidAmount, 100);
  assert.equal(review.rows[0].outstandingAmount, 100);
  assert.equal(review.rows[0].studentName, "Ama Mensah");
  assert.equal(review.groups.byClass[0].label, "JHS 1A");
});

test("carry-forward review: v1 and v2 storage produce equivalent results", async () => {
  const v1 = new FakeFirestore({
    [`student_ledgers/${schoolId}_${studentId}_${toAcademicYear}_Term1`]: {
      ...currentLedger([currentFee, carriedFee]),
      schoolId,
    },
    [`payments/payment-1`]: {
      schoolId,
      studentId,
      academicYear: toAcademicYear,
      term: toTerm,
      feeId: carryForwardFeeId,
      amountPaid: 100,
      isOpeningPayment: false,
    },
    [`students/${studentId}`]: { ...students[0], schoolId },
  });
  const v2 = new FakeFirestore({
    [`schools/${schoolId}/feeLedgers/${schoolId}_${studentId}_${toAcademicYear}_Term1`]: {
      ...currentLedger([currentFee, carriedFee]),
      schoolId,
    },
    [`schools/${schoolId}/payments/payment-1`]: {
      schoolId,
      studentId,
      academicYear: toAcademicYear,
      term: toTerm,
      feeId: carryForwardFeeId,
      amountPaid: 100,
      isOpeningPayment: false,
    },
    [`students/${studentId}`]: { ...students[0], schoolId },
  });

  const reviewV1 = await loadCarryForwardReview({
    db: v1,
    schoolId,
    academicYear: toAcademicYear,
    term: toTerm,
  });
  const reviewV2 = await loadCarryForwardReview({
    db: v2,
    schoolId,
    academicYear: toAcademicYear,
    term: toTerm,
  });

  assert.deepEqual(reviewV1.rows, reviewV2.rows);
  assert.deepEqual(reviewV1.groups, reviewV2.groups);
  assert.deepEqual(reviewV1.totals, reviewV2.totals);
});

test("carry-forward review: publishing writes one notification and one snapshot", async () => {
  const db = new FakeFirestore({
    [`student_ledgers/${schoolId}_${studentId}_${toAcademicYear}_Term1`]: {
      ...currentLedger([currentFee, carriedFee]),
      schoolId,
    },
    [`students/${studentId}`]: { ...students[0], schoolId },
  });

  const { review, snapshotId, notificationId } = await publishCarryForwardReview({
    db,
    schoolId,
    academicYear: toAcademicYear,
    term: toTerm,
  });

  assert.equal(review.totals.studentCount, 1);
  assert.equal(review.totals.carriedAmount, 200);

  const notification = db.read(`admin_notifications/${notificationId}`);
  assert.ok(notification, "A notification must be written");
  assert.equal(notification.schoolId, schoolId);
  assert.equal(notification.type, "system");
  assert.equal(notification.isRead, false);
  assert.match(notification.message, /1 student\(s\)/);
  assert.match(notification.message, /GHS 200\.00/);
  assert.match(notification.message, /Carry-forward review/);

  const snapshot = db.read(`carry_forward_reviews/${snapshotId}`);
  assert.ok(snapshot, "A review snapshot must be written");
  assert.equal(snapshot.schoolId, schoolId);
  assert.equal(snapshot.totals.carriedAmount, 200);
  assert.equal(snapshot.rows.length, 1);
  assert.equal(snapshot.groups.byClass[0].label, "JHS 1A");
});

test("carry-forward review: publishing is idempotent", async () => {
  const db = new FakeFirestore({
    [`student_ledgers/${schoolId}_${studentId}_${toAcademicYear}_Term1`]: {
      ...currentLedger([currentFee, carriedFee]),
      schoolId,
    },
    [`students/${studentId}`]: { ...students[0], schoolId },
  });

  const first = await publishCarryForwardReview({
    db,
    schoolId,
    academicYear: toAcademicYear,
    term: toTerm,
  });
  const second = await publishCarryForwardReview({
    db,
    schoolId,
    academicYear: toAcademicYear,
    term: toTerm,
  });

  assert.equal(first.notificationId, second.notificationId);
  assert.equal(first.snapshotId, second.snapshotId);

  const notifications = db.keys().filter((key) =>
    key.startsWith("admin_notifications/"),
  );
  assert.equal(notifications.length, 1, "Only one notification may exist");

  const snapshots = db.keys().filter((key) =>
    key.startsWith("carry_forward_reviews/"),
  );
  assert.equal(snapshots.length, 1, "Only one review snapshot may exist");
});

test("carry-forward review: publishing writes nothing when no balance was carried", async () => {
  const db = new FakeFirestore({
    [`student_ledgers/${schoolId}_${studentId}_${toAcademicYear}_Term1`]: {
      ...currentLedger([currentFee]),
      schoolId,
    },
    [`students/${studentId}`]: { ...students[0], schoolId },
  });

  const { snapshotId, notificationId, review } = await publishCarryForwardReview({
    db,
    schoolId,
    academicYear: toAcademicYear,
    term: toTerm,
  });

  assert.equal(review.totals.studentCount, 0);
  assert.equal(snapshotId, null);
  assert.equal(notificationId, null);
  assert.equal(
    db.keys().filter((key) => key.startsWith("admin_notifications/")).length,
    0,
  );
});

test("carry-forward review: deterministic ids and message", () => {
  assert.equal(
    buildCarryForwardReviewId(schoolId, toAcademicYear, toTerm),
    `cf-${schoolId}-${toAcademicYear}-Term1`,
  );
  assert.equal(
    buildCarryForwardNotificationId(schoolId, toAcademicYear, toTerm),
    `carry-forward-${schoolId}-${toAcademicYear}-Term1`,
  );

  const message = buildCarryForwardNotificationMessage({
    term: toTerm,
    totals: { studentCount: 3, carriedAmount: 500, outstandingAmount: 200 },
    groups: { bySourceTerm: [{ label: "Term 3, 2025-2026" }] },
  });
  assert.match(message, /3 student\(s\)/);
  assert.match(message, /GHS 500\.00/);
  assert.match(message, /GHS 200\.00/);
  assert.match(message, /Term 3, 2025-2026/);
});

test("carry-forward review: parses the source period from the fee id", () => {
  assert.deepEqual(
    parseCarryForwardFeeId(carryForwardFeeId, { schoolId, studentId }),
    { fromAcademicYear, fromTerm },
  );
  assert.equal(parseCarryForwardFeeId("fee-tuition", { schoolId }), null);
  assert.equal(parseCarryForwardFeeId(undefined), null);
});

// ---------------------------------------------------------------------------
// End to end: term rollover -> persisted carry-forward -> notification -> review
// ---------------------------------------------------------------------------
const buildRolloverFixture = (useV2) => {
  const ledgerPath = useV2
    ? `schools/${schoolId}/feeLedgers/${schoolId}_${studentId}_${toAcademicYear}_Term1`
    : `student_ledgers/${schoolId}_${studentId}_${toAcademicYear}_Term1`;
  const previousLedgerPath = useV2
    ? `schools/${schoolId}/feeLedgers/ledger-prev`
    : "student_ledgers/ledger-prev";
  const previousPaymentPath = useV2
    ? `schools/${schoolId}/payments/payment-prev`
    : "payments/payment-prev";

  return new FakeFirestore({
    [`settings/${schoolId}`]: {
      schoolId,
      schoolName: "Test School",
      currentTerm: fromTerm,
      academicYear: fromAcademicYear,
      nextTermBegins: "2026-09-10",
      termTransitionProcessed: false,
    },
    [`schools/${schoolId}`]: { name: "Test School", status: "active" },
    ...(useV2
      ? { [`schools/${schoolId}/financeSettings/main`]: { financeVersion: "v2" } }
      : {}),
    [previousLedgerPath]: {
      schoolId,
      studentId,
      classId: "class-1",
      term: fromTerm,
      academicYear: fromAcademicYear,
      fees: [
        {
          feeId: "fee-tuition",
          feeName: "Tuition",
          amount: 500,
          openingPaidAmount: 0,
        },
      ],
    },
    [previousPaymentPath]: {
      schoolId,
      studentId,
      term: fromTerm,
      academicYear: fromAcademicYear,
      feeId: "fee-tuition",
      amountPaid: 300,
      isOpeningPayment: false,
    },
    [ledgerPath]: {
      ...currentLedger([currentFee]),
      schoolId,
    },
    [`students/${studentId}`]: { ...students[0], schoolId },
  });
};

const runRolloverAndPublish = async (useV2) => {
  const db = buildRolloverFixture(useV2);
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

  const published = await publishCarryForwardReview({
    db,
    schoolId,
    academicYear: result.nextPeriod.academicYear,
    term: result.nextPeriod.currentTerm,
  });

  return { db, result, published };
};

test("carry-forward workflow end to end: rollover persists the balance, then notifies (v1)", async () => {
  const { db, published } = await runRolloverAndPublish(false);

  // The rollover persisted the carry-forward fee on the new term ledger
  const ledger = db.read(
    `student_ledgers/${schoolId}_${studentId}_${toAcademicYear}_Term1`,
  );
  const carryForwardEntries = ledger.fees.filter(
    (fee) => fee.feeId === carryForwardFeeId,
  );
  assert.equal(carryForwardEntries.length, 1);
  assert.equal(carryForwardEntries[0].amount, 200);

  // The notification was written after the rollover
  const notification = db.read(`admin_notifications/${published.notificationId}`);
  assert.ok(notification, "The admin notification must exist");
  assert.equal(notification.schoolId, schoolId);
  assert.match(notification.message, /GHS 200\.00/);
  assert.match(notification.message, /Term 3, 2025-2026/);

  // The review reads the persisted ledger
  const review = await loadCarryForwardReview({
    db,
    schoolId,
    academicYear: toAcademicYear,
    term: toTerm,
  });
  assert.equal(review.totals.studentCount, 1);
  assert.equal(review.rows[0].studentName, "Ama Mensah");
  assert.equal(review.rows[0].className, "JHS 1A");
  assert.equal(review.rows[0].fromTerm, fromTerm);
  assert.equal(review.rows[0].fromAcademicYear, fromAcademicYear);
  assert.equal(review.rows[0].carriedAmount, 200);
  assert.equal(review.rows[0].paidAmount, 0);
  assert.equal(review.rows[0].outstandingAmount, 200);
  assert.equal(review.groups.byClass.length, 1);
  assert.equal(review.groups.byClass[0].outstandingAmount, 200);

  // The previous term history is untouched
  const previousLedger = db.read("student_ledgers/ledger-prev");
  assert.equal(previousLedger.fees.length, 1);
  assert.equal(previousLedger.fees[0].amount, 500);
  const previousPayment = db.read("payments/payment-prev");
  assert.equal(previousPayment.amountPaid, 300);
});

test("carry-forward workflow end to end: rollover persists the balance, then notifies (v2)", async () => {
  const { db, published } = await runRolloverAndPublish(true);

  const ledger = db.read(
    `schools/${schoolId}/feeLedgers/${schoolId}_${studentId}_${toAcademicYear}_Term1`,
  );
  const carryForwardEntries = ledger.fees.filter(
    (fee) => fee.feeId === carryForwardFeeId,
  );
  assert.equal(carryForwardEntries.length, 1);
  assert.equal(carryForwardEntries[0].amount, 200);

  const notification = db.read(`admin_notifications/${published.notificationId}`);
  assert.ok(notification, "The admin notification must exist");
  assert.equal(notification.schoolId, schoolId);
  assert.match(notification.message, /GHS 200\.00/);

  const review = await loadCarryForwardReview({
    db,
    schoolId,
    academicYear: toAcademicYear,
    term: toTerm,
  });
  assert.equal(review.totals.studentCount, 1);
  assert.equal(review.rows[0].carriedAmount, 200);
  assert.equal(review.rows[0].outstandingAmount, 200);
  assert.equal(review.groups.byClass[0].label, "JHS 1A");

  const previousLedger = db.read("schools/school-1/feeLedgers/ledger-prev");
  assert.equal(previousLedger.fees[0].amount, 500);
  const previousPayment = db.read("schools/school-1/payments/payment-prev");
  assert.equal(previousPayment.amountPaid, 300);
});

test("carry-forward workflow end to end: repeating the rollover keeps one notification", async () => {
  const db = buildRolloverFixture(false);
  const service = createTermRolloverService({
    db,
    FieldValue,
    Timestamp,
    logger: { error: () => {} },
  });

  const first = await service.rolloverSchool(schoolId, {
    now: new Date("2026-09-10T12:00:00"),
    source: "test",
  });
  assert.equal(first.changed, true);
  await publishCarryForwardReview({
    db,
    schoolId,
    academicYear: first.nextPeriod.academicYear,
    term: first.nextPeriod.currentTerm,
  });

  // Re-arm the rollover so the carry-forward step runs again
  const settings = db.read(`settings/${schoolId}`);
  settings.currentTerm = fromTerm;
  settings.academicYear = fromAcademicYear;
  settings.nextTermBegins = "2026-09-10";
  settings.termTransitionProcessed = false;
  settings.termTransition = null;
  db.records.set(`settings/${schoolId}`, settings);

  const second = await service.rolloverSchool(schoolId, {
    now: new Date("2026-09-10T12:30:00"),
    source: "test",
  });
  assert.equal(second.changed, true);
  const published = await publishCarryForwardReview({
    db,
    schoolId,
    academicYear: second.nextPeriod.academicYear,
    term: second.nextPeriod.currentTerm,
  });

  const notifications = db.keys().filter((key) =>
    key.startsWith("admin_notifications/"),
  );
  assert.equal(notifications.length, 1, "Only one notification may exist");

  const ledger = db.read(
    `student_ledgers/${schoolId}_${studentId}_${toAcademicYear}_Term1`,
  );
  const carryForwardEntries = ledger.fees.filter(
    (fee) => fee.feeId === carryForwardFeeId,
  );
  assert.equal(carryForwardEntries.length, 1, "No duplicate carry-forward fee");
  assert.equal(carryForwardEntries[0].amount, 200);

  const review = await loadCarryForwardReview({
    db,
    schoolId,
    academicYear: toAcademicYear,
    term: toTerm,
  });
  assert.equal(review.totals.studentCount, 1);
  assert.equal(review.rows[0].carriedAmount, 200);
  assert.ok(published.notificationId);
});

test("carry-forward review: class labels resolve to the configured class name", () => {
  // The admin page already loads the school's configured class rooms.
  const classNameLookup = buildClassNameLookup([
    { id: "class-1", name: "JHS 1A" },
    { id: "class-2", name: "JHS 2A" },
  ]);

  assert.equal(classNameLookup.get("class-1"), "JHS 1A");
  assert.equal(classNameLookup.get("class-2"), "JHS 2A");

  // A class without a configured name falls back to its id
  assert.equal(buildClassNameLookup([{ id: "class-3" }]).get("class-3"), "class-3");

  assert.equal(
    resolveClassLabel({ classId: "class-1", classNameLookup }),
    "JHS 1A",
  );
  // The configured name wins over a stored/raw name
  assert.equal(
    resolveClassLabel({ classId: "class-1", className: "class-1", classNameLookup }),
    "JHS 1A",
  );
  // Unconfigured class -> stored name, then the raw id (never throws)
  assert.equal(
    resolveClassLabel({ classId: "class-9", className: "Legacy 9", classNameLookup }),
    "Legacy 9",
  );
  assert.equal(
    resolveClassLabel({ classId: "class-9", classNameLookup }),
    "class-9",
  );
  // No class at all
  assert.equal(resolveClassLabel({ classNameLookup }), "Unassigned");
  assert.equal(resolveClassLabel(), "Unassigned");
  assert.equal(resolveClassLabel({ classNameLookup: null }), "Unassigned");
});

test("carry-forward review: student rows and class groups use the class name", () => {
  const classNameLookup = buildClassNameLookup([
    { id: "class-1", name: "JHS 1A" },
  ]);

  const review = buildCarryForwardReview({
    ledgers: [currentLedger([currentFee, carriedFee])],
    payments: [],
    students,
    schoolId,
    academicYear: toAcademicYear,
    term: toTerm,
  });

  // The stored data keeps the raw class id
  assert.equal(review.rows[0].classId, "class-1");
  assert.equal(review.groups.byClass[0].key, "class-1");

  // The displayed labels resolve to the human readable class name
  const rowLabel = resolveClassLabel({
    classId: review.rows[0].classId,
    className: review.rows[0].className,
    classNameLookup,
  });
  assert.equal(rowLabel, "JHS 1A");

  const groupLabel = resolveClassLabel({
    classId: review.groups.byClass[0].key,
    className: review.groups.byClass[0].label,
    classNameLookup,
  });
  assert.equal(groupLabel, "JHS 1A");

  // The financial values are untouched by the label resolution
  assert.equal(review.totals.carriedAmount, 200);
  assert.equal(review.totals.outstandingAmount, 200);
  assert.equal(review.rows[0].carriedAmount, 200);
  assert.equal(review.rows[0].outstandingAmount, 200);
  assert.equal(review.groups.byClass[0].carriedAmount, 200);
  assert.equal(review.groups.byClass[0].outstandingAmount, 200);
});
