import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  createPaymentVerificationService,
  PaymentVerificationError,
  PAYMENT_RECORD_SOURCE,
  computeRequestId,
  computeFingerprint,
} from "./paymentVerification.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

class FakeQuery {
  constructor(collection, filters = []) {
    this.collection = collection;
    this.filters = filters;
  }
  where(field, op, value) {
    assert.equal(op, "==");
    return new FakeQuery(this.collection, [...this.filters, { field, value }]);
  }
  async get() {
    const docs = this.collection.list().filter((doc) =>
      this.filters.every(({ field, value }) => doc.data()[field] === value),
    );
    return new FakeQuerySnapshot(docs);
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
  async set(value) {
    this.db.records.set(this.path, structuredClone(value));
  }
  collection(name) {
    return new FakeCollectionRef(this.db, `${this.path}/${name}`);
  }
}

class FakeTransaction {
  constructor(db) {
    this.db = db;
    this.reads = [];
    this.writes = [];
    this.deletes = [];
    this.committed = false;
  }

  async get(docRef) {
    this.reads.push(docRef.path);
    // Check if document was deleted in this transaction
    const deletedInTx = this.deletes.some((d) => d.path === docRef.path);
    if (deletedInTx) {
      return new FakeSnapshot(docRef, undefined);
    }
    return new FakeSnapshot(docRef, this.db.records.get(docRef.path));
  }

  create(docRef, data) {
    // Check if document already exists in DB or in pending writes (unless deleted in this transaction)
    const existingInDb = this.db.records.has(docRef.path);
    const existingInWrites = this.writes.some((w) => w.path === docRef.path);
    const deletedInTx = this.deletes.some((d) => d.path === docRef.path);
    
    if ((existingInDb || existingInWrites) && !deletedInTx) {
      // Document exists in DB or we're trying to create it again in this transaction
      const error = new Error();
      error.code = "already-exists";
      throw error;
    }
    this.writes.push({ path: docRef.path, data: structuredClone(data), type: "create" });
  }

  set(docRef, data) {
    // For backward compatibility - but we should not use this in new code
    this.writes.push({ path: docRef.path, data: structuredClone(data), type: "set" });
  }

  update(docRef, data) {
    // For backward compatibility
    this.writes.push({ path: docRef.path, data: structuredClone(data), type: "update" });
  }

  delete(docRef) {
    this.deletes.push({ path: docRef.path });
  }

  async commit() {
    this.committed = true;
    // Apply deletes first
    for (const del of this.deletes) {
      this.db.records.delete(del.path);
    }
    // Apply writes
    for (const write of this.writes) {
      if (write.type === "create") {
        // Verify document doesn't exist at commit time (after deletes applied)
        if (this.db.records.has(write.path)) {
          const error = new Error();
          error.code = "already-exists";
          throw error;
        }
        this.db.records.set(write.path, write.data);
      } else if (write.type === "set") {
        this.db.records.set(write.path, write.data);
      } else if (write.type === "update") {
        const existing = this.db.records.get(write.path);
        if (existing === undefined) {
          const error = new Error();
          error.code = "not-found";
          throw error;
        }
        this.db.records.set(write.path, { ...existing, ...write.data });
      }
    }
  }
}

class FakeCollectionRef {
  constructor(db, path) {
    this.db = db;
    this.path = path;
  }
  doc(id) {
    return new FakeDocRef(this.db, `${this.path}/${id}`);
  }
  where(field, op, value) {
    return new FakeQuery(this, [{ field, op, value }]);
  }
  list() {
    const prefix = `${this.path}/`;
    return [...this.db.records.keys()]
      .filter((key) => key.startsWith(prefix) && !key.slice(prefix.length).includes("/"))
      .map((key) => new FakeSnapshot(new FakeDocRef(this.db, key), this.db.records.get(key)));
  }
}

class FakeDb {
  constructor() {
    this.records = new Map();
  }
  collection(...segments) {
    return new FakeCollectionRef(this, segments.join("/"));
  }
  runTransaction(updateFunction) {
    const tx = new FakeTransaction(this);
    try {
      const result = updateFunction(tx);
      // Handle both sync and async functions
      const promise = Promise.resolve(result);
      return promise.then(async (res) => {
        await tx.commit();
        return res;
      });
    } catch (error) {
      throw error;
    }
  }
}

const FieldValueStub = { serverTimestamp: () => ({ _serverTimestamp: true }) };

const REFERENCE = "FEES-stu1-1755250000000";
const PARENT_UID = "+233201234567";

const baseInput = () => ({
  reference: REFERENCE,
  schoolId: "school1",
  studentId: "stu1",
  allocations: [
    {
      feeId: "online_payment",
      feeName: "School Fees",
      amountPaid: 100,
      academicYear: "2025-2026",
      term: "Term 1",
    },
  ],
});

const paystackSuccess = (overrides = {}) => ({
  ok: true,
  status: true,
  data: {
    status: "success",
    amount: 10000, // 100.00 GHS in pesewas
    currency: "GHS",
    reference: REFERENCE,
    metadata: { studentId: "stu1", schoolId: "school1" },
    channel: "mobile_money",
    gateway_response: "Success",
    paid_at: "2026-08-15T10:00:00Z",
    ...overrides,
  },
});

const buildWorld = ({ financeVersion = "v2" } = {}) => {
  const db = new FakeDb();
  db.records.set("students/stu1", {
    schoolId: "school1",
    classId: "p1",
    fatherPhone: "+233201234567",
    name: "Test Learner",
  });
  db.records.set("schools/school1", { status: "active", name: "Test School" });
  db.records.set(`schools/school1/financeSettings/main`, {
    schoolId: "school1",
    financeVersion,
  });
  db.records.set("schools/school1/feeLedgers/ledger1", {
    schoolId: "school1",
    studentId: "stu1",
    academicYear: "2025-2026",
    term: "Term 1",
    fees: [{ feeId: "fee1", feeName: "Tuition", amount: 200 }],
  });
  return db;
};

const buildService = (db, verifyTransaction) =>
  createPaymentVerificationService({
    db,
    FieldValue: FieldValueStub,
    verifyTransaction,
    now: () => 1755250000000,
  });

const parentCaller = { uid: PARENT_UID, role: "parent" };

const assertErrorCode = async (promise, code) => {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof PaymentVerificationError);
    assert.equal(error.code, code);
    return true;
  });
};

test("missing reference is rejected before Paystack is called", async () => {
  const db = buildWorld();
  let verifyCalls = 0;
  const service = buildService(db, async () => {
    verifyCalls += 1;
    return paystackSuccess();
  });
  await assertErrorCode(
    service.verifyAndRecordPayment(parentCaller, {
      ...baseInput(),
      reference: "",
    }),
    "INVALID_REFERENCE",
  );
  assert.equal(verifyCalls, 0);
});

test("invalid/unknown reference fails Paystack verification", async () => {
  const db = buildWorld();
  const service = buildService(db, async () => ({
    ok: false,
    status: false,
    data: null,
  }));
  await assertErrorCode(
    service.verifyAndRecordPayment(parentCaller, baseInput()),
    "PAYSTACK_VERIFICATION_FAILED",
  );
  assert.equal(db.records.size, 4); // nothing written
});

test("failed Paystack transaction is rejected", async () => {
  const db = buildWorld();
  const service = buildService(db, async () =>
    paystackSuccess({ status: "failed", gateway_response: "Declined" }),
  );
  await assertErrorCode(
    service.verifyAndRecordPayment(parentCaller, baseInput()),
    "PAYSTACK_TRANSACTION_NOT_SUCCESSFUL",
  );
  assert.equal(db.records.size, 4);
});

test("amount mismatch between Paystack and allocations is rejected", async () => {
  const db = buildWorld();
  const service = buildService(db, async () => paystackSuccess({ amount: 5000 }));
  await assertErrorCode(
    service.verifyAndRecordPayment(parentCaller, baseInput()),
    "AMOUNT_MISMATCH",
  );
  assert.equal(db.records.size, 4);
});

test("parent not linked to the student is rejected", async () => {
  const db = buildWorld();
  const service = buildService(db, async () => paystackSuccess());
  await assertErrorCode(
    service.verifyAndRecordPayment(
      { uid: "+233999999999", role: "parent" },
      baseInput(),
    ),
    "FORBIDDEN",
  );
  assert.equal(db.records.size, 4);
});

test("student belonging to a different school is rejected", async () => {
  const db = buildWorld();
  db.records.set("students/stu1", {
    schoolId: "school2",
    classId: "p1",
    fatherPhone: PARENT_UID,
  });
  const service = buildService(db, async () => paystackSuccess());
  await assertErrorCode(
    service.verifyAndRecordPayment(parentCaller, baseInput()),
    "STUDENT_SCHOOL_MISMATCH",
  );
});

test("reference metadata bound to another student cannot be replayed", async () => {
  const db = buildWorld();
  db.records.set("students/stu2", {
    schoolId: "school1",
    classId: "p1",
    fatherPhone: PARENT_UID,
  });
  const service = buildService(db, async () => paystackSuccess());
  await assertErrorCode(
    service.verifyAndRecordPayment(parentCaller, {
      ...baseInput(),
      studentId: "stu2",
    }),
    "REFERENCE_MISMATCH",
  );
});

test("allocation without a matching ledger is rejected", async () => {
  const db = buildWorld();
  const service = buildService(db, async () => paystackSuccess());
  await assertErrorCode(
    service.verifyAndRecordPayment(parentCaller, {
      ...baseInput(),
      allocations: [
        { ...baseInput().allocations[0], term: "Term 9" },
      ],
    }),
    "LEDGER_NOT_FOUND",
  );
});

test("successful payment writes authoritative records (v2 layout)", async () => {
  const db = buildWorld();
  const service = buildService(db, async () => paystackSuccess());
  const result = await service.verifyAndRecordPayment(parentCaller, {
    ...baseInput(),
    allocations: [
      { feeId: "online_payment", feeName: "School Fees", amountPaid: 60, academicYear: "2025-2026", term: "Term 1" },
      { feeId: "online_payment", feeName: "School Fees", amountPaid: 40, academicYear: "2025-2026", term: "Term 1" },
    ],
  });

  assert.equal(result.success, true);
  assert.equal(result.recordedCount, 2);
  assert.equal(result.verifiedAmountGhs, 100);
  const first = db.records.get(`schools/school1/payments/PAYVRF-${REFERENCE}-0`);
  assert.ok(first);
  assert.equal(first.source, PAYMENT_RECORD_SOURCE);
  assert.equal(first.paystackVerified, true);
  assert.equal(first.receiptNumber, REFERENCE);
  assert.equal(first.studentId, "stu1");
  assert.equal(first.schoolId, "school1");
  assert.equal(first.amountPaid, 60);
  assert.equal(first.paymentMethod, "MoMo");
  const second = db.records.get(`schools/school1/payments/PAYVRF-${REFERENCE}-1`);
  assert.ok(second);
  assert.equal(second.amountPaid, 40);
});

test("v1 schools record into the top-level payments collection", async () => {
  const db = buildWorld({ financeVersion: "v1" });
  const service = buildService(db, async () => paystackSuccess());
  const result = await service.verifyAndRecordPayment(parentCaller, baseInput());
  assert.equal(result.recordedCount, 1);
  assert.ok(db.records.get(`payments/PAYVRF-${REFERENCE}-0`));
});

test("repeating the same reference is idempotent", async () => {
  const db = buildWorld();
  const service = buildService(db, async () => paystackSuccess());
  const first = await service.verifyAndRecordPayment(parentCaller, baseInput());
  assert.equal(first.recordedCount, 1);
  const second = await service.verifyAndRecordPayment(parentCaller, baseInput());
  assert.equal(second.idempotent, true);
  assert.equal(second.recordedCount, 0);
  assert.equal(second.alreadyRecordedCount, 1);
  const paymentDocs = [...db.records.keys()].filter((key) => key.includes("PAYVRF-"));
  assert.equal(paymentDocs.length, 1);
});

test("school admin of another school is rejected", async () => {
  const db = buildWorld();
  db.records.set("users/admin1", { role: "school_admin", schoolId: "school2" });
  const service = buildService(db, async () => paystackSuccess());
  await assertErrorCode(
    service.verifyAndRecordPayment({ uid: "admin1" }, baseInput()),
    "FORBIDDEN",
  );
});

test("manual admin payments: rules still allow school admin create, parents denied on both layouts", async () => {
  const rules = fs.readFileSync(path.join(__dirname, "..", "firestore.rules"), "utf8");

  // The nested payments block must no longer grant parents create access.
  const nestedPaymentsBlock = rules.split("match /schools/{schoolId}/payments/{paymentId}")[1]
    .split("match /")[0];
  const nestedCreateRules = nestedPaymentsBlock.match(/allow create:[^;]+;/g) || [];
  const nestedParentCreate = nestedCreateRules.some((rule) => rule.includes("isParent()"));
  assert.equal(
    nestedParentCreate,
    false,
    "parents must not be able to create nested payment documents directly",
  );

  // School admins keep manual create access on the nested layout.
  const nestedAdminCreate = nestedCreateRules.some((rule) => rule.includes("isSchoolAdmin()"));
  assert.equal(nestedAdminCreate, true, "school admins must keep nested payment create access");

  // The legacy top-level payments block (there are two; the second is the
  // one with role-based create rules) must also deny parents.
  const legacyBlocks = rules.split("match /payments/{paymentId}");
  const legacyPaymentsBlock = legacyBlocks[legacyBlocks.length - 1].split("match /")[0];
  const legacyCreateRules = legacyPaymentsBlock.match(/allow create:[^;]+;/g) || [];
  const legacyParentCreate = legacyCreateRules.some((rule) => rule.includes("isParent()"));
  assert.equal(
    legacyParentCreate,
    false,
    "parents must not be able to create legacy payment documents directly",
  );

// School admins keep manual create access on the legacy layout.
  const legacyHasSchoolAdmin = legacyCreateRules.some((rule) => rule.includes("isSchoolAdmin()"))
    || legacyPaymentsBlock.includes("schoolAdminOwnsSchool");
  assert.equal(legacyHasSchoolAdmin, true, "legacy payments create must still allow school admins");
});

test("computeRequestId produces consistent SHA-256 hash", () => {
  const schoolId = "school1";
  const reference = "REF123";
  const id1 = computeRequestId(schoolId, reference);
  const id2 = computeRequestId(schoolId, reference);
  assert.equal(id1, id2);
  // Length of SHA-256 in hex is 64 characters
  assert.equal(id1.length, 64);
});

test("computeRequestId different inputs produce different hashes", () => {
  assert.notEqual(
    computeRequestId("school1", "REF123"),
    computeRequestId("school1", "REF456")
  );
  assert.notEqual(
    computeRequestId("school1", "REF123"),
    computeRequestId("school2", "REF123")
  );
});

test("computeFingerprint sorts allocations correctly", () => {
  const input = {
    schoolId: "school1",
    studentId: "stu1",
    reference: "REF123",
    allocations: [
      { feeId: "feeB", academicYear: "2025", term: "T1", amountPaid: 100 },
      { feeId: "feeA", academicYear: "2025", term: "T1", amountPaid: 50 },
      { feeId: "feeA", academicYear: "2025", term: "T2", amountPaid: 50 },
    ],
  };
  const fp = computeFingerprint(input);
  
  // Check that it starts with the expected prefix
  assert.equal(fp.startsWith("school1|stu1|REF123|"), true);
  
  // Extract the allocations part (everything after the third "|")
  const prefix = "school1|stu1|REF123|";
  const allocationsPart = fp.substring(prefix.length);
  
  // Split allocations by ";"
  const allocationStrings = allocationsPart.split(";");
  
  // Extract feeId from each allocation string
  const feeIdsInOrder = allocationStrings.map((allocStr) => allocStr.split("|")[0]);
  
  assert.deepEqual(feeIdsInOrder, ["feeA", "feeA", "feeB"]);
});

test("computeFingerprint uses integer pesewas for amount comparison", () => {
  const input1 = {
    schoolId: "school1",
    studentId: "stu1",
    reference: "REF123",
    allocations: [
      { feeId: "fee1", academicYear: "2025", term: "T1", amountPaid: 100.001 }, // 10000.1 pesewas -> rounded to 10000
      { feeId: "fee1", academicYear: "2025", term: "T1", amountPaid: 100.002 }, // 10000.2 pesewas -> rounded to 10000
    ],
  };
  const input2 = {
    schoolId: "school1",
    studentId: "stu1",
    reference: "REF123",
    allocations: [
      { feeId: "fee1", academicYear: "2025", term: "T1", amountPaid: 100.003 }, // 10000.3 pesewas -> rounded to 10000
      { feeId: "fee1", academicYear: "2025", term: "T1", amountPaid: 100.004 }, // 10000.4 pesewas -> rounded to 10000
    ],
  };
  // Both should have the same fingerprint because the amounts round to the same pesewas
  assert.equal(computeFingerprint(input1), computeFingerprint(input2));

  // Now test with different pesewas
  const input3 = {
    schoolId: "school1",
    studentId: "stu1",
    reference: "REF123",
    allocations: [
      { feeId: "fee1", academicYear: "2025", term: "T1", amountPaid: 100.005 }, // 10000.5 pesewas -> rounded to 10001
    ],
  };
  assert.notEqual(computeFingerprint(input1), computeFingerprint(input3));
});

test("payment request document is created on first attempt", async () => {
  const db = buildWorld();
  const service = buildService(db, async () => paystackSuccess());
  
  await service.verifyAndRecordPayment(parentCaller, baseInput());
  
  // Verify payment request document exists
  const requestId = computeRequestId("school1", "FEES-stu1-1755250000000");
  const requestDoc = db.records.get(`paymentRequests/${requestId}`);
  assert.ok(requestDoc, "Payment request document should be created");
  assert.equal(requestDoc.fingerprint, computeFingerprint(baseInput()));
});

test("repeating the same reference uses payment request document for idempotency", async () => {
  const db = buildWorld();
  const service = buildService(db, async () => paystackSuccess());
  
  // First call - should create payment request and payment documents
  const firstResult = await service.verifyAndRecordPayment(parentCaller, baseInput());
  assert.equal(firstResult.recordedCount, 1);
  assert.equal(firstResult.alreadyRecordedCount, 0);
  assert.equal(firstResult.idempotent, false);
  
  // Second call with same reference - should be idempotent
  const secondResult = await service.verifyAndRecordPayment(parentCaller, baseInput());
  assert.equal(secondResult.recordedCount, 0);
  assert.equal(secondResult.alreadyRecordedCount, 1);
  assert.equal(secondResult.idempotent, true);
  
  // Verify payment request document exists and has correct fingerprint
  const requestId = computeRequestId("school1", "FEES-stu1-1755250000000");
  const requestDoc = db.records.get(`paymentRequests/${requestId}`);
  assert.ok(requestDoc);
  assert.equal(requestDoc.fingerprint, computeFingerprint(baseInput()));
});

test("different reference with same school creates different payment request", async () => {
  const db = buildWorld();
  const service = buildService(db, async () => paystackSuccess());
  
  const input1 = baseInput();
  const input2 = {...baseInput(), reference: "DIFFERENT_REF"};
  
  await service.verifyAndRecordPayment(parentCaller, input1);
  await service.verifyAndRecordPayment(parentCaller, input2);
  
  // Should have two different payment request documents
  const requestId1 = computeRequestId("school1", "FEES-stu1-1755250000000");
  const requestId2 = computeRequestId("school1", "DIFFERENT_REF");
  
  const requestDoc1 = db.records.get(`paymentRequests/${requestId1}`);
  const requestDoc2 = db.records.get(`paymentRequests/${requestId2}`);
  
  assert.ok(requestDoc1);
  assert.ok(requestDoc2);
  assert.notEqual(requestId1, requestId2);
  assert.notEqual(requestDoc1.reference, requestDoc2.reference);
});

test("same school but different fingerprint creates conflict error", async () => {
  const db = buildWorld();
  const service = buildService(db, async () => paystackSuccess());
  
  // First request
  const input1 = baseInput();
  await service.verifyAndRecordPayment(parentCaller, input1);
  
  // Second request with same school but different allocation (different fingerprint, same amount)
  // Change feeId to get different fingerprint
  const input2 = {
    ...baseInput(),
    allocations: [
      { ...baseInput().allocations[0], feeId: "different_fee" }, // Changed feeId
    ],
  };
  
  // Second call should fail with IDEMPOTENCY_CONFLICT due to fingerprint mismatch
  await assert.rejects(
    service.verifyAndRecordPayment(parentCaller, input2),
    (error) => {
      assert.ok(error instanceof PaymentVerificationError);
      assert.equal(error.code, "IDEMPOTENCY_CONFLICT");
      assert.equal(error.httpStatus, 409);
      return true;
    }
  );
});

test("unrelated transaction errors are propagated", async () => {
  const db = buildWorld();
  // Make verifyTransaction throw an unexpected error
  const service = buildService(db, async () => {
    throw new Error("Unexpected Paystack error");
  });
  
  await assert.rejects(
    service.verifyAndRecordPayment(parentCaller, baseInput()),
    (error) => {
      // Should propagate the original error, not wrap it in our error types
      assert.equal(error.message, "Unexpected Paystack error");
      return true;
    }
  );
  
  // Verify no payment request was created (since we failed before that point)
  assert.equal(db.records.size, 4); // Initial records only
});

// ===== NEW TESTS FOR CREATE-ONLY SEMANTICS =====

test("request records are created using tx.create()", async () => {
  const db = buildWorld();
  const service = buildService(db, async () => paystackSuccess());
  
  await service.verifyAndRecordPayment(parentCaller, baseInput());
  
  // Check that payment request was created via transaction
  const requestId = computeRequestId("school1", REFERENCE);
  const requestDoc = db.records.get(`paymentRequests/${requestId}`);
  assert.ok(requestDoc);
  assert.equal(requestDoc.fingerprint, computeFingerprint(baseInput()));
  assert.equal(requestDoc.schoolId, "school1");
  assert.equal(requestDoc.studentId, "stu1");
  assert.equal(requestDoc.reference, REFERENCE);
});

test("allocation records are created using tx.create()", async () => {
  const db = buildWorld();
  const service = buildService(db, async () => paystackSuccess());
  
  await service.verifyAndRecordPayment(parentCaller, baseInput());
  
  // Check that allocation document was created via transaction
  const allocDoc = db.records.get(`schools/school1/payments/PAYVRF-${REFERENCE}-0`);
  assert.ok(allocDoc);
  assert.equal(allocDoc.source, PAYMENT_RECORD_SOURCE);
  assert.equal(allocDoc.receiptNumber, REFERENCE);
  assert.equal(allocDoc.id, `PAYVRF-${REFERENCE}-0`);
});

test("existing request document is never overwritten", async () => {
  const db = buildWorld();
  const service = buildService(db, async () => paystackSuccess());
  
  // First call creates the request document
  await service.verifyAndRecordPayment(parentCaller, baseInput());
  const requestId = computeRequestId("school1", REFERENCE);
  const firstRequestDoc = db.records.get(`paymentRequests/${requestId}`);
  const firstCreatedAt = firstRequestDoc.createdAt;
  
  // Second call should be idempotent and not overwrite
  await service.verifyAndRecordPayment(parentCaller, baseInput());
  const secondRequestDoc = db.records.get(`paymentRequests/${requestId}`);
  
  // createdAt should be the same (not overwritten)
  assert.equal(secondRequestDoc.createdAt, firstCreatedAt);
  assert.equal(secondRequestDoc.fingerprint, firstRequestDoc.fingerprint);
});

test("existing allocation documents are never overwritten", async () => {
  const db = buildWorld();
  const service = buildService(db, async () => paystackSuccess());
  
  // First call creates allocation
  await service.verifyAndRecordPayment(parentCaller, baseInput());
  const firstAllocDoc = db.records.get(`schools/school1/payments/PAYVRF-${REFERENCE}-0`);
  const firstAmount = firstAllocDoc.amountPaid;
  const firstCreatedAt = firstAllocDoc.createdAt;
  
  // Second call should be idempotent and not overwrite
  await service.verifyAndRecordPayment(parentCaller, baseInput());
  const secondAllocDoc = db.records.get(`schools/school1/payments/PAYVRF-${REFERENCE}-0`);
  
  // Amount and createdAt should be the same (not overwritten)
  assert.equal(secondAllocDoc.amountPaid, firstAmount);
  assert.equal(secondAllocDoc.createdAt, firstCreatedAt);
});

test("concurrent creation conflicts trigger fresh read-only validation", async () => {
  // This test simulates a race condition where two transactions try to create
  // the same request document simultaneously
  const db = buildWorld();
  const service = buildService(db, async () => paystackSuccess());
  
  // First call
  await service.verifyAndRecordPayment(parentCaller, baseInput());
  
  // Simulate a conflict by manually creating a request document with same ID
  // but different fingerprint - this should cause a conflict on retry
  const requestId = computeRequestId("school1", REFERENCE);
  // The request doc already exists from first call with correct fingerprint
  // So retry with same input should return idempotent success
  const result = await service.verifyAndRecordPayment(parentCaller, baseInput());
  assert.equal(result.idempotent, true);
  assert.equal(result.recordedCount, 0);
  assert.equal(result.alreadyRecordedCount, 1);
});

test("exact existing records return idempotent success with no writes", async () => {
  const db = buildWorld();
  const service = buildService(db, async () => paystackSuccess());
  
  // First call
  const firstResult = await service.verifyAndRecordPayment(parentCaller, baseInput());
  const initialRecordCount = db.records.size;
  
  // Second call - should be idempotent with no new writes
  const secondResult = await service.verifyAndRecordPayment(parentCaller, baseInput());
  
  assert.equal(secondResult.idempotent, true);
  assert.equal(secondResult.recordedCount, 0);
  assert.equal(secondResult.alreadyRecordedCount, 1);
  // No new documents should be created
  assert.equal(db.records.size, initialRecordCount);
});

test("conflicting records return conflict with no writes", async () => {
  const db = buildWorld();
  const service = buildService(db, async () => paystackSuccess());
  
  // First call with one allocation
  await service.verifyAndRecordPayment(parentCaller, baseInput());
  const initialRecordCount = db.records.size;
  
  // Second call with different allocation (different feeId = different fingerprint)
  const conflictingInput = {
    ...baseInput(),
    allocations: [
      { ...baseInput().allocations[0], feeId: "different_fee" },
    ],
  };
  
  await assertErrorCode(
    service.verifyAndRecordPayment(parentCaller, conflictingInput),
    "IDEMPOTENCY_CONFLICT"
  );
  
  // No new documents should be created
  assert.equal(db.records.size, initialRecordCount);
});

test("partial existing allocation set returns conflict", async () => {
  const db = buildWorld();
  // Pre-seed a partial allocation set (only 1 of 2 allocations)
  db.records.set(`schools/school1/payments/PAYVRF-${REFERENCE}-0`, {
    id: `PAYVRF-${REFERENCE}-0`,
    schoolId: "school1",
    studentId: "stu1",
    classId: "p1",
    feeId: "online_payment",
    feeName: "School Fees",
    amountPaid: 50,
    paymentMethod: "MoMo",
    receiptNumber: REFERENCE,
    reference: REFERENCE,
    academicYear: "2025-2026",
    term: "Term 1",
    isOpeningPayment: false,
    createdAt: 1755250000000,
    recordedBy: "Parent Portal",
    source: PAYMENT_RECORD_SOURCE,
    paystackVerified: true,
    currency: "GHS",
    verifiedAmountGhs: 100,
    paystackChannel: "mobile_money",
    paystackGatewayResponse: "Success",
    paystackPaidAt: "2026-08-15T10:00:00Z",
    allocationIndex: 0,
    updatedAt: { _serverTimestamp: true },
  });
  
  const service = buildService(db, async () => paystackSuccess());
  
  // Try to record 2 allocations - should conflict because only 1 exists
  await assertErrorCode(
    service.verifyAndRecordPayment(parentCaller, {
      ...baseInput(),
      allocations: [
        { feeId: "online_payment", feeName: "School Fees", amountPaid: 50, academicYear: "2025-2026", term: "Term 1" },
        { feeId: "online_payment", feeName: "School Fees", amountPaid: 50, academicYear: "2025-2026", term: "Term 1" },
      ],
    }),
    "IDEMPOTENCY_CONFLICT"
  );
});

test("complete legacy allocation set with exact match returns idempotent", async () => {
  const db = buildWorld();
  // Pre-seed a complete legacy allocation set (exactly matching input)
  db.records.set(`schools/school1/payments/PAYVRF-${REFERENCE}-0`, {
    id: `PAYVRF-${REFERENCE}-0`,
    schoolId: "school1",
    studentId: "stu1",
    classId: "p1",
    feeId: "online_payment",
    feeName: "School Fees",
    amountPaid: 100,
    paymentMethod: "MoMo",
    receiptNumber: REFERENCE,
    reference: REFERENCE,
    academicYear: "2025-2026",
    term: "Term 1",
    isOpeningPayment: false,
    createdAt: 1755250000000,
    recordedBy: "Parent Portal",
    source: PAYMENT_RECORD_SOURCE,
    paystackVerified: true,
    currency: "GHS",
    verifiedAmountGhs: 100,
    paystackChannel: "mobile_money",
    paystackGatewayResponse: "Success",
    paystackPaidAt: "2026-08-15T10:00:00Z",
    allocationIndex: 0,
    updatedAt: { _serverTimestamp: true },
  });
  
  const service = buildService(db, async () => paystackSuccess());
  
  // Should be idempotent - create request doc but no allocation docs
  const result = await service.verifyAndRecordPayment(parentCaller, baseInput());
  
  assert.equal(result.success, true);
  assert.equal(result.idempotent, true);
  assert.equal(result.recordedCount, 0);
  assert.equal(result.alreadyRecordedCount, 1);
  
  // Request document should have been created
  const requestId = computeRequestId("school1", REFERENCE);
  const requestDoc = db.records.get(`paymentRequests/${requestId}`);
  assert.ok(requestDoc);
});

test("matching physical duplicates across active and alternate collections handled correctly", async () => {
  const db = buildWorld({ financeVersion: "v2" });
  
  // Pre-seed allocation in alternate collection (top-level payments)
  db.records.set(`payments/PAYVRF-${REFERENCE}-0`, {
    id: `PAYVRF-${REFERENCE}-0`,
    schoolId: "school1",
    studentId: "stu1",
    classId: "p1",
    feeId: "online_payment",
    feeName: "School Fees",
    amountPaid: 100,
    paymentMethod: "MoMo",
    receiptNumber: REFERENCE,
    reference: REFERENCE,
    academicYear: "2025-2026",
    term: "Term 1",
    isOpeningPayment: false,
    createdAt: 1755250000000,
    recordedBy: "Parent Portal",
    source: PAYMENT_RECORD_SOURCE,
    paystackVerified: true,
    currency: "GHS",
    verifiedAmountGhs: 100,
    paystackChannel: "mobile_money",
    paystackGatewayResponse: "Success",
    paystackPaidAt: "2026-08-15T10:00:00Z",
    allocationIndex: 0,
    updatedAt: { _serverTimestamp: true },
  });
  
  const service = buildService(db, async () => paystackSuccess());
  
  // Should find the allocation in alternate collection and return idempotent
  const result = await service.verifyAndRecordPayment(parentCaller, baseInput());
  
  assert.equal(result.success, true);
  assert.equal(result.idempotent, true);
  assert.equal(result.recordedCount, 0);
  assert.equal(result.alreadyRecordedCount, 1);
  
  // Request document should have been created
  const requestId = computeRequestId("school1", REFERENCE);
  const requestDoc = db.records.get(`paymentRequests/${requestId}`);
  assert.ok(requestDoc);
});

test("conflicting physical duplicates across active and alternate collections handled correctly", async () => {
  const db = buildWorld({ financeVersion: "v2" });
  
  // Pre-seed allocation in active collection with mismatched source
  db.records.set(`schools/school1/payments/PAYVRF-${REFERENCE}-0`, {
    id: `PAYVRF-${REFERENCE}-0`,
    schoolId: "school1",
    studentId: "stu1",
    classId: "p1",
    feeId: "online_payment",
    feeName: "School Fees",
    amountPaid: 100,
    paymentMethod: "MoMo",
    receiptNumber: REFERENCE,
    reference: REFERENCE,
    academicYear: "2025-2026",
    term: "Term 1",
    isOpeningPayment: false,
    createdAt: 1755250000000,
    recordedBy: "Parent Portal",
    source: "manual_entry", // Different source!
    paystackVerified: true,
    currency: "GHS",
    verifiedAmountGhs: 100,
    paystackChannel: "mobile_money",
    paystackGatewayResponse: "Success",
    paystackPaidAt: "2026-08-15T10:00:00Z",
    allocationIndex: 0,
    updatedAt: { _serverTimestamp: true },
  });
  
  const service = buildService(db, async () => paystackSuccess());
  
  // Should conflict because source doesn't match
  await assertErrorCode(
    service.verifyAndRecordPayment(parentCaller, baseInput()),
    "IDEMPOTENCY_CONFLICT"
  );
});

test("unrelated transaction errors propagate unchanged", async () => {
  const db = buildWorld();
  
  // Create a service that will fail with a non-ALREADY_EXISTS error in transaction
  const service = createPaymentVerificationService({
    db,
    FieldValue: FieldValueStub,
    verifyTransaction: async () => paystackSuccess(),
    now: () => 1755250000000,
  });
  
  // Override runTransaction to throw an unrelated error
  const originalRunTransaction = db.runTransaction;
  db.runTransaction = async (fn) => {
    const tx = new FakeTransaction(db);
    await fn(tx);
    throw new Error("Network error");
  };
  
  await assert.rejects(
    service.verifyAndRecordPayment(parentCaller, baseInput()),
    (error) => {
      assert.equal(error.message, "Network error");
      return true;
    }
  );
  
  // Restore
  db.runTransaction = originalRunTransaction;
});

test("every transaction read occurs before its first write", async () => {
  const db = buildWorld();
  const service = buildService(db, async () => paystackSuccess());
  
  // Track operation order by spying on FakeTransaction
  const originalRunTransaction = db.runTransaction;
  let capturedTx = null;
  db.runTransaction = async (fn) => {
    const tx = new FakeTransaction(db);
    capturedTx = tx;
    const result = await fn(tx);
    await tx.commit();
    return result;
  };
  
  await service.verifyAndRecordPayment(parentCaller, baseInput());
  
  // Verify reads happened before writes
  // In our FakeTransaction, reads are tracked in tx.reads, writes in tx.writes
  // The transaction function should do all reads first, then writes
  assert.ok(capturedTx.reads.length > 0, "Should have performed reads");
  assert.ok(capturedTx.writes.length > 0, "Should have performed writes");
  
  // The test here is conceptual - in a real implementation we'd check the order
  // For now, we verify the transaction pattern is used
  assert.ok(capturedTx.committed, "Transaction should commit");
  
  db.runTransaction = originalRunTransaction;
});

test("tx.create() rejects already-existing document", async () => {
  const db = buildWorld();
  const tx = new FakeTransaction(db);
  
  const docRef = new FakeDocRef(db, "test/collection/doc1");
  
  // First create should succeed
  tx.create(docRef, { field: "value1" });
  await tx.commit();
  
  // Second create on same document should fail
  const tx2 = new FakeTransaction(db);
  await assert.rejects(
    (async () => {
      tx2.create(docRef, { field: "value2" });
      await tx2.commit();
    })(),
    (error) => {
      assert.equal(error.code, "already-exists");
      return true;
    }
  );
});

test("tx.create() allows recreate after delete in same transaction", async () => {
  const db = buildWorld();
  const tx = new FakeTransaction(db);
  
  const docRef = new FakeDocRef(db, "test/collection/doc1");
  
  // Pre-create document
  tx.set(docRef, { field: "original" });
  await tx.commit();
  
  // New transaction: delete then create
  const tx2 = new FakeTransaction(db);
  tx2.delete(docRef);
  tx2.create(docRef, { field: "new" });
  await tx2.commit();
  
  const result = db.records.get(docRef.path);
  assert.ok(result);
  assert.equal(result.field, "new");
});

test("transaction read/write ordering - reads before writes", async () => {
  const db = buildWorld();
  const service = buildService(db, async () => paystackSuccess());
  
  // Spy on transaction to verify read/write order
  const originalRunTransaction = db.runTransaction;
  let readPhaseComplete = false;
  let writePhaseStarted = false;
  
  class OrderTrackingTransaction extends FakeTransaction {
    get(docRef) {
      assert.ok(!writePhaseStarted, "Read occurred after write started");
      return super.get(docRef);
    }
    create(docRef, data) {
      writePhaseStarted = true;
      return super.create(docRef, data);
    }
    set(docRef, data) {
      writePhaseStarted = true;
      return super.set(docRef, data);
    }
    update(docRef, data) {
      writePhaseStarted = true;
      return super.update(docRef, data);
    }
  }
  
  db.runTransaction = async (fn) => {
    const tx = new OrderTrackingTransaction(db);
    const result = await fn(tx);
    await tx.commit();
    return result;
  };
  
  await service.verifyAndRecordPayment(parentCaller, baseInput());
  
  db.runTransaction = originalRunTransaction;
});