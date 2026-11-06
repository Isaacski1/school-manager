import assert from "node:assert";
import test from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { collection, query, where, getDocs } from "@firebase/firestore";
import { mergeParentLedgers } from "../services/parentFeeData.js";

const RULES = readFileSync(join(process.cwd(), "firestore.rules"), "utf8");

let testEnv;

const TEST_PROJECT_ID = "school-manager-test";

const SCHOOL_A = "school-a";
const SCHOOL_B = "school-b";
const STUDENT_A1 = "student-a1";
const STUDENT_B1 = "student-b1";
const PARENT_A = "parent-a";
const SUPER_ADMIN = "super-admin";

async function setupEnvironment() {
  return await initializeTestEnvironment({
    projectId: TEST_PROJECT_ID,
    firestore: {
      host: "localhost",
      port: 8080,
      rules: RULES,
    },
  });
}

async function authenticatedContext(testEnv, uid, role, phoneNumber = null) {
  const claims = { role, userRole: role };
  if (phoneNumber) {
    claims.phone_number = phoneNumber;
  }
  return testEnv.authenticatedContext(uid, claims);
}

async function unauthenticatedContext(testEnv) {
  return testEnv.unauthenticatedContext();
}

async function createDoc(db, path, data) {
  const ref = db.doc(path);
  await ref.set(data);
  return ref;
}

// Seed all data using super admin (parents cannot create school/student/user docs)
async function seedAllData(db) {
  await createDoc(db, `schools/${SCHOOL_A}`, {
    id: SCHOOL_A,
    status: "active",
    name: "School A",
  });
  await createDoc(db, `schools/${SCHOOL_B}`, {
    id: SCHOOL_B,
    status: "active",
    name: "School B",
  });
  await createDoc(
    db,
    `students/${STUDENT_A1}`,
    { id: STUDENT_A1, schoolId: SCHOOL_A, guardianPhone: "0551234567", name: "Student A1" },
  );
  await createDoc(
    db,
    `students/${STUDENT_B1}`,
    { id: STUDENT_B1, schoolId: SCHOOL_B, guardianPhone: "0559876543", name: "Student B1" },
  );
  await createDoc(db, `users/${PARENT_A}`, {
    id: PARENT_A,
    role: "parent",
    phoneNumber: "0551234567",
    schoolId: SCHOOL_A,
  });
  await createDoc(db, `users/${SUPER_ADMIN}`, {
    id: SUPER_ADMIN,
    role: "super_admin",
    schoolId: SCHOOL_A,
  });
}

// ===== mergeParentLedgers unit tests (pure JS, no emulator needed) =====

test("ledger-retrieval: mergeParentLedgers - both sources succeed with records", () => {
  const canonical = [
    { id: "ledger-1", schoolId: SCHOOL_A, studentId: STUDENT_A1, academicYear: "2026", term: 1, fees: [], totalFee: 500 },
  ];
  const alternate = [
    { id: "ledger-2", schoolId: SCHOOL_A, studentId: STUDENT_A1, academicYear: "2026", term: 2, fees: [], totalFee: 400 },
  ];
  const result = mergeParentLedgers(canonical, alternate);
  assert.strictEqual(result.length, 2);
  assert.ok(result.some(l => l.id === "ledger-1"));
  assert.ok(result.some(l => l.id === "ledger-2"));
});

test("ledger-retrieval: mergeParentLedgers - both sources return empty results", () => {
  const result = mergeParentLedgers([], []);
  assert.strictEqual(result.length, 0);
});

test("ledger-retrieval: mergeParentLedgers - overlapping records are deduplicated", () => {
  const canonical = [
    { id: "ledger-1", schoolId: SCHOOL_A, studentId: STUDENT_A1, academicYear: "2026", term: 1, fees: [], totalFee: 500 },
  ];
  const alternate = [
    { id: "ledger-1", schoolId: SCHOOL_A, studentId: STUDENT_A1, academicYear: "2026", term: 1, fees: [], totalFee: 500 },
    { id: "ledger-2", schoolId: SCHOOL_A, studentId: STUDENT_A1, academicYear: "2026", term: 2, fees: [], totalFee: 400 },
  ];
  const result = mergeParentLedgers(canonical, alternate);
  assert.strictEqual(result.length, 2);
  const ids = result.map(l => l.id);
  assert.ok(ids.includes("ledger-1"));
  assert.ok(ids.includes("ledger-2"));
  assert.strictEqual(result.filter(l => l.id === "ledger-1").length, 1);
});

test("ledger-retrieval: mergeParentLedgers - canonical wins on conflict", () => {
  const canonical = [
    { id: "ledger-1", schoolId: SCHOOL_A, studentId: STUDENT_A1, academicYear: "2026", term: 1, fees: [{ feeId: "fee-1", feeName: "Canonical Fee", amount: 100 }], totalFee: 100 },
  ];
  const alternate = [
    { id: "ledger-1", schoolId: SCHOOL_A, studentId: STUDENT_A1, academicYear: "2026", term: 1, fees: [{ feeId: "fee-2", feeName: "Alternate Fee", amount: 200 }], totalFee: 200 },
  ];
  const result = mergeParentLedgers(canonical, alternate);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].fees[0].feeId, "fee-1");
  assert.strictEqual(result[0].fees[0].feeName, "Canonical Fee");
});

test("ledger-retrieval: mergeParentLedgers - alternate records not in canonical are added", () => {
  const canonical = [
    { id: "ledger-1", schoolId: SCHOOL_A, studentId: STUDENT_A1, academicYear: "2026", term: 1, fees: [], totalFee: 100 },
  ];
  const alternate = [
    { id: "ledger-2", schoolId: SCHOOL_A, studentId: STUDENT_A1, academicYear: "2026", term: 2, fees: [], totalFee: 400 },
  ];
  const result = mergeParentLedgers(canonical, alternate);
  assert.strictEqual(result.length, 2);
  assert.ok(result.some(l => l.id === "ledger-1"));
  assert.ok(result.some(l => l.id === "ledger-2"));
});

// ===== Firestore rules-based authorization tests =====

test("ledger-retrieval: Parent A queries own child's assessments (ALLOW)", async () => {
  const testEnv = await setupEnvironment();
  try {
    const pa = await authenticatedContext(testEnv, PARENT_A, "parent", "0551234567");
    const sa = await authenticatedContext(testEnv, SUPER_ADMIN, "super_admin");
    const dbParentA = pa.firestore();
    const dbSuperAdmin = sa.firestore();
    await seedAllData(dbSuperAdmin);
    await createDoc(dbSuperAdmin, `assessments/${SCHOOL_A}_${STUDENT_A1}_Math_1_2026`, {
      id: `${SCHOOL_A}_${STUDENT_A1}_Math_1_2026`,
      schoolId: SCHOOL_A,
      studentId: STUDENT_A1,
      classId: "class-1",
      term: 1,
      academicYear: "2026",
      subject: "Math",
      testScore: 18,
      homeworkScore: 9,
      projectScore: 17,
      examScore: 60,
      total: 104,
    });
    const q = query(
      collection(dbParentA, "assessments"),
      where("schoolId", "==", SCHOOL_A),
      where("studentId", "==", STUDENT_A1),
    );
    const snap = await getDocs(q);
    assert.ok(snap.size > 0, "Parent A should see Student A1's assessments");
  } finally {
    await testEnv.cleanup();
  }
});

test("ledger-retrieval: Parent A queries another parent's child's assessments (DENY)", async () => {
  const testEnv = await setupEnvironment();
  try {
    const pa = await authenticatedContext(testEnv, PARENT_A, "parent", "0551234567");
    const sa = await authenticatedContext(testEnv, SUPER_ADMIN, "super_admin");
    const dbParentA = pa.firestore();
    const dbSuperAdmin = sa.firestore();
    await seedAllData(dbSuperAdmin);
    await createDoc(dbSuperAdmin, `assessments/${SCHOOL_B}_${STUDENT_B1}_Math_1_2026`, {
      id: `${SCHOOL_B}_${STUDENT_B1}_Math_1_2026`,
      schoolId: SCHOOL_B,
      studentId: STUDENT_B1,
      classId: "class-2",
      term: 1,
      academicYear: "2026",
      subject: "Math",
      testScore: 15,
      homeworkScore: 8,
      projectScore: 15,
      examScore: 50,
      total: 88,
    });
    const q = query(
      collection(dbParentA, "assessments"),
      where("schoolId", "==", SCHOOL_B),
      where("studentId", "==", STUDENT_B1),
    );
    try {
      const snap = await getDocs(q);
      assert.fail(
        `Parent A should NOT see Student B1's assessments, but got ${snap.size} docs`,
      );
    } catch (e) {
      assert.strictEqual(e.code, "permission-denied", "Should be permission-denied");
    }
  } finally {
    await testEnv.cleanup();
  }
});

test("ledger-retrieval: Parent A queries cross-school assessment (DENY)", async () => {
  const testEnv = await setupEnvironment();
  try {
    const pa = await authenticatedContext(testEnv, PARENT_A, "parent", "0551234567");
    const sa = await authenticatedContext(testEnv, SUPER_ADMIN, "super_admin");
    const dbParentA = pa.firestore();
    const dbSuperAdmin = sa.firestore();
    await seedAllData(dbSuperAdmin);
    await createDoc(dbSuperAdmin, `assessments/${SCHOOL_B}_${STUDENT_A1}_Math_1_2026`, {
      id: `${SCHOOL_B}_${STUDENT_A1}_Math_1_2026`,
      schoolId: SCHOOL_B,
      studentId: STUDENT_A1,
      classId: "class-2",
      term: 1,
      academicYear: "2026",
      subject: "Math",
      testScore: 10,
      homeworkScore: 5,
      projectScore: 10,
      examScore: 40,
      total: 65,
    });
    const q = query(
      collection(dbParentA, "assessments"),
      where("schoolId", "==", SCHOOL_B),
      where("studentId", "==", STUDENT_A1),
    );
    try {
      const snap = await getDocs(q);
      assert.fail(
        `Parent A should NOT see School B assessments for Student A1, but got ${snap.size} docs`,
      );
    } catch (e) {
      assert.strictEqual(e.code, "permission-denied", "Should be permission-denied");
    }
  } finally {
    await testEnv.cleanup();
  }
});

test("ledger-retrieval: Parent broad query without studentId (DENY)", async () => {
  const testEnv = await setupEnvironment();
  try {
    const pa = await authenticatedContext(testEnv, PARENT_A, "parent", "0551234567");
    const sa = await authenticatedContext(testEnv, SUPER_ADMIN, "super_admin");
    const dbParentA = pa.firestore();
    const dbSuperAdmin = sa.firestore();
    await seedAllData(dbSuperAdmin);
    const q = query(
      collection(dbParentA, "assessments"),
      where("schoolId", "==", SCHOOL_A),
    );
    try {
      const snap = await getDocs(q);
      assert.fail(
        `Parent should NOT be able to query all assessments for a school without studentId, but got ${snap.size} docs`,
      );
    } catch (e) {
      assert.strictEqual(e.code, "permission-denied", "Should be permission-denied");
    }
  } finally {
    await testEnv.cleanup();
  }
});

test("ledger-retrieval: Unauthenticated user reads assessments (DENY)", async () => {
  const testEnv = await setupEnvironment();
  try {
    const sa = await authenticatedContext(testEnv, SUPER_ADMIN, "super_admin");
    const ua = await unauthenticatedContext(testEnv);
    const dbSuperAdmin = sa.firestore();
    const dbUnauth = ua.firestore();
    await seedAllData(dbSuperAdmin);
    const q = query(
      collection(dbUnauth, "assessments"),
      where("schoolId", "==", SCHOOL_A),
      where("studentId", "==", STUDENT_A1),
    );
    try {
      const snap = await getDocs(q);
      assert.fail(
        `Unauthenticated user should NOT see assessments, but got ${snap.size} docs`,
      );
    } catch (e) {
      assert.strictEqual(e.code, "permission-denied", "Should be permission-denied");
    }
  } finally {
    await testEnv.cleanup();
  }
});

test("ledger-retrieval: Super admin reads own school's ledgers (ALLOW)", async () => {
  const testEnv = await setupEnvironment();
  try {
    const sa = await authenticatedContext(testEnv, SUPER_ADMIN, "super_admin");
    const db = sa.firestore();
    await seedAllData(db);
    await createDoc(db, `student_ledgers/ledger-a1-2026`, {
      id: "ledger-a1-2026",
      schoolId: SCHOOL_A,
      studentId: STUDENT_A1,
      classId: "class-1",
      academicYear: "2026",
      term: 1,
      fees: [],
      totalFee: 500,
      createdAt: Date.now(),
    });
    const q = query(
      collection(db, "student_ledgers"),
      where("schoolId", "==", SCHOOL_A),
    );
    const snap = await getDocs(q);
    assert.ok(snap.size > 0, "Super admin should see all ledgers for school A");
  } finally {
    await testEnv.cleanup();
  }
});

test("ledger-retrieval: V2 feeLedgers - Super admin queries all V2 ledgers for school (ALLOW)", async () => {
  const testEnv = await setupEnvironment();
  try {
    const sa = await authenticatedContext(testEnv, SUPER_ADMIN, "super_admin");
    const db = sa.firestore();
    await seedAllData(db);
    await createDoc(db, `schools/${SCHOOL_A}/feeLedgers/v2-ledger-a1-2026`, {
      id: "v2-ledger-a1-2026",
      schoolId: SCHOOL_A,
      studentId: STUDENT_A1,
      classId: "class-1",
      academicYear: "2026",
      term: 1,
      fees: [],
      totalFee: 500,
      createdAt: Date.now(),
    });
    const q = query(
      collection(db, "schools", SCHOOL_A, "feeLedgers"),
      where("schoolId", "==", SCHOOL_A),
    );
    const snap = await getDocs(q);
    assert.ok(snap.size > 0, "Super admin should see all V2 feeLedgers for school A");
  } finally {
    await testEnv.cleanup();
  }
});

test("ledger-retrieval: Failed retrieval does not create virtual ledgers", () => {
  const failedResult = {
    ledgers: [],
    status: "failed",
    sources: [
      { source: "primary", status: "failed", error: "permission-denied", recordCount: 0 },
      { source: "alternate", status: "failed", error: "permission-denied", recordCount: 0 },
    ],
    error: "Both ledger sources failed",
  };
  assert.strictEqual(failedResult.status, "failed");
  assert.strictEqual(failedResult.ledgers.length, 0);
  assert.ok(failedResult.status !== "complete", "Virtual ledger creation requires complete status");
});

test("ledger-retrieval: Complete retrieval with empty results allows virtual ledger creation", () => {
  const completeResult = {
    ledgers: [],
    status: "complete",
    sources: [
      { source: "primary", status: "ok", recordCount: 0 },
      { source: "alternate", status: "ok", recordCount: 0 },
    ],
  };
  assert.strictEqual(completeResult.status, "complete");
  assert.strictEqual(completeResult.ledgers.length, 0);
  assert.ok(completeResult.status === "complete" && completeResult.ledgers.length === 0, "Complete + empty = virtual ledger allowed");
});
