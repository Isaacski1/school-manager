import test from "node:test";
import assert from "node:assert/strict";
import {
  createTermRolloverService,
  getNextAcademicPeriod,
  isTermRolloverDue,
} from "./termRollover.js";

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
  assert.equal(db.records.has("payments/payment-1"), false);
  assert.equal(db.records.has(`schools/${schoolId}/payments/payment-v2`), false);
  assert.equal(db.records.has("student_ledgers/ledger-1"), false);
  assert.equal(db.records.has(`schools/${schoolId}/feeLedgers/ledger-v2`), false);
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
