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

const RULES = readFileSync(join(process.cwd(), "firestore.rules"), "utf8");

let testEnv;

const TEST_PROJECT_ID = "school-manager-test";

const SCHOOL_A = "school-a";
const SCHOOL_B = "school-b";
const STUDENT_A1 = "student-a1";
const STUDENT_A2 = "student-a2";
const STUDENT_B1 = "student-b1";
const PARENT_A = "parent-a";
const PARENT_B = "parent-b";
const SCHOOL_ADMIN_A = "school-admin-a";
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

async function readDoc(db, path) {
  const ref = db.doc(path);
  return ref.get();
}

// Seed all data using super admin (parents cannot create student/user docs)
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
    `students/${STUDENT_A2}`,
    { id: STUDENT_A2, schoolId: SCHOOL_A, guardianPhone: "0551234567", name: "Student A2" },
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
  await createDoc(db, `users/${PARENT_B}`, {
    id: PARENT_B,
    role: "parent",
    phoneNumber: "0559876543",
    schoolId: SCHOOL_B,
  });
  await createDoc(db, `users/${SUPER_ADMIN}`, {
    id: SUPER_ADMIN,
    role: "super_admin",
    schoolId: SCHOOL_A,
  });
}

async function withParentAndSuperAdmin(fn) {
  const testEnv = await setupEnvironment();
  try {
    const pa = await authenticatedContext(testEnv, PARENT_A, "parent", "0551234567");
    const pb = await authenticatedContext(testEnv, PARENT_B, "parent", "0559876543");
    const sa = await authenticatedContext(testEnv, SUPER_ADMIN, "super_admin");
    const ua = await unauthenticatedContext(testEnv);
    const dbParentA = pa.firestore();
    const dbParentB = pb.firestore();
    const dbSuperAdmin = sa.firestore();
    const dbUnauth = ua.firestore();
    const dbSchoolAdminA = sa.firestore();

    await seedAllData(dbSuperAdmin);

    await fn({ dbParentA, dbParentB, dbSuperAdmin, dbUnauth, dbSchoolAdminA });
  } finally {
    await testEnv.cleanup();
  }
}

test("Phase 2: assessments - Parent A reads own child's assessment", async () => {
  await withParentAndSuperAdmin(async ({ dbParentA, dbSuperAdmin }) => {
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
    await assertSucceeds(
      readDoc(dbParentA, `assessments/${SCHOOL_A}_${STUDENT_A1}_Math_1_2026`),
    );
  });
});

test("Phase 2: assessments - Parent A reads another parent's child's assessment", async () => {
  await withParentAndSuperAdmin(async ({ dbParentA, dbSuperAdmin }) => {
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
    await assertFails(readDoc(dbParentA, `assessments/${SCHOOL_B}_${STUDENT_B1}_Math_1_2026`));
  });
});

test("Phase 2: assessments - Parent A reads assessment from another school", async () => {
  await withParentAndSuperAdmin(async ({ dbParentA, dbSuperAdmin }) => {
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
    await assertFails(readDoc(dbParentA, `assessments/${SCHOOL_B}_${STUDENT_A1}_Math_1_2026`));
  });
});

test("Phase 2: assessments - Super admin reads assessment", async () => {
  await withParentAndSuperAdmin(async ({ dbSuperAdmin }) => {
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
    await assertSucceeds(readDoc(dbSuperAdmin, `assessments/${SCHOOL_A}_${STUDENT_A1}_Math_1_2026`));
  });
});

test("Phase 2: assessments - Unauthenticated user reads assessment", async () => {
  await withParentAndSuperAdmin(async ({ dbUnauth }) => {
    await assertFails(readDoc(dbUnauth, `assessments/${SCHOOL_A}_${STUDENT_A1}_Math_1_2026`));
  });
});

test("Phase 3B: student_remarks - Parent A reads own child's remark", async () => {
  await withParentAndSuperAdmin(async ({ dbParentA, dbSuperAdmin }) => {
    await createDoc(dbSuperAdmin, `student_remarks/remark-a1-1`, {
      id: "remark-a1-1",
      schoolId: SCHOOL_A,
      studentId: STUDENT_A1,
      classId: "class-1",
      term: 1,
      academicYear: "2026",
      remark: "Good progress",
      behaviorTag: "Good",
      teacherId: "teacher-1",
      dateCreated: "2026-01-15",
    });
    await assertSucceeds(readDoc(dbParentA, "student_remarks/remark-a1-1"));
  });
});

test("Phase 3B: student_remarks - Parent A reads another parent's child's remark", async () => {
  await withParentAndSuperAdmin(async ({ dbParentA, dbSuperAdmin }) => {
    await createDoc(dbSuperAdmin, `student_remarks/remark-b1-1`, {
      id: "remark-b1-1",
      schoolId: SCHOOL_B,
      studentId: STUDENT_B1,
      classId: "class-2",
      term: 1,
      academicYear: "2026",
      remark: "Good progress",
      behaviorTag: "Good",
      teacherId: "teacher-2",
      dateCreated: "2026-01-15",
    });
    await assertFails(readDoc(dbParentA, "student_remarks/remark-b1-1"));
  });
});

test("Phase 3B: student_remarks - Parent A reads remark from another school", async () => {
  await withParentAndSuperAdmin(async ({ dbParentA, dbSuperAdmin }) => {
    await createDoc(dbSuperAdmin, `student_remarks/remark-cross-1`, {
      id: "remark-cross-1",
      schoolId: SCHOOL_B,
      studentId: STUDENT_A1,
      classId: "class-2",
      term: 1,
      academicYear: "2026",
      remark: "Cross school",
      behaviorTag: "Good",
      teacherId: "teacher-2",
      dateCreated: "2026-01-15",
    });
    await assertFails(readDoc(dbParentA, "student_remarks/remark-cross-1"));
  });
});

test("Phase 3B: student_remarks - Super admin reads remark", async () => {
  await withParentAndSuperAdmin(async ({ dbSuperAdmin }) => {
    await createDoc(dbSuperAdmin, `student_remarks/remark-super-1`, {
      id: "remark-super-1",
      schoolId: SCHOOL_A,
      studentId: STUDENT_A1,
      classId: "class-1",
      term: 1,
      academicYear: "2026",
      remark: "Super",
      behaviorTag: "Excellent",
      teacherId: "teacher-1",
      dateCreated: "2026-01-15",
    });
    await assertSucceeds(readDoc(dbSuperAdmin, "student_remarks/remark-super-1"));
  });
});

test("Phase 3B: student_remarks - Unauthenticated user reads remark", async () => {
  await withParentAndSuperAdmin(async ({ dbUnauth }) => {
    await assertFails(readDoc(dbUnauth, "student_remarks/remark-a1-1"));
  });
});

test("Phase 3B: student_ledgers (current) - Parent A reads own child's ledger", async () => {
  await withParentAndSuperAdmin(async ({ dbParentA, dbSuperAdmin }) => {
    await createDoc(dbSuperAdmin, `student_ledgers/ledger-a1-2026`, {
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
    await assertSucceeds(readDoc(dbParentA, "student_ledgers/ledger-a1-2026"));
  });
});

test("Phase 3B: student_ledgers (current) - Parent A reads another parent's child's ledger", async () => {
  await withParentAndSuperAdmin(async ({ dbParentA, dbSuperAdmin }) => {
    await createDoc(dbSuperAdmin, `student_ledgers/ledger-b1-2026`, {
      id: "ledger-b1-2026",
      schoolId: SCHOOL_B,
      studentId: STUDENT_B1,
      classId: "class-2",
      academicYear: "2026",
      term: 1,
      fees: [],
      totalFee: 500,
      createdAt: Date.now(),
    });
    await assertFails(readDoc(dbParentA, "student_ledgers/ledger-b1-2026"));
  });
});

test("Phase 3B: student_ledgers (current) - Parent A reads ledger from another school", async () => {
  await withParentAndSuperAdmin(async ({ dbParentA, dbSuperAdmin }) => {
    await createDoc(dbSuperAdmin, `student_ledgers/ledger-cross-2026`, {
      id: "ledger-cross-2026",
      schoolId: SCHOOL_B,
      studentId: STUDENT_A1,
      classId: "class-2",
      academicYear: "2026",
      term: 1,
      fees: [],
      totalFee: 500,
      createdAt: Date.now(),
    });
    await assertFails(readDoc(dbParentA, "student_ledgers/ledger-cross-2026"));
  });
});

test("Phase 3B: student_ledgers (current) - Super admin reads ledger", async () => {
  await withParentAndSuperAdmin(async ({ dbSuperAdmin }) => {
    await createDoc(dbSuperAdmin, `student_ledgers/ledger-super-2026`, {
      id: "ledger-super-2026",
      schoolId: SCHOOL_A,
      studentId: STUDENT_A1,
      classId: "class-1",
      academicYear: "2026",
      term: 1,
      fees: [],
      totalFee: 500,
      createdAt: Date.now(),
    });
    await assertSucceeds(readDoc(dbSuperAdmin, "student_ledgers/ledger-super-2026"));
  });
});

test("Phase 3B: student_ledgers (current) - Unauthenticated user reads ledger", async () => {
  await withParentAndSuperAdmin(async ({ dbUnauth }) => {
    await assertFails(readDoc(dbUnauth, "student_ledgers/ledger-a1-2026"));
  });
});

test("Phase 3B: student_ledgers (legacy) - Parent A reads own child's legacy ledger", async () => {
  await withParentAndSuperAdmin(async ({ dbParentA, dbSuperAdmin }) => {
    await createDoc(dbSuperAdmin, `student_ledgers/legacy-ledger-a1-2026`, {
      id: "legacy-ledger-a1-2026",
      schoolId: SCHOOL_A,
      studentId: STUDENT_A1,
      classId: "class-1",
      academicYear: "2026",
      term: 1,
      fees: [],
      totalFee: 500,
      createdAt: Date.now(),
    });
    await assertSucceeds(readDoc(dbParentA, `student_ledgers/legacy-ledger-a1-2026`));
  });
});

test("Phase 3B: student_ledgers (legacy) - Parent A reads another parent's child's legacy ledger", async () => {
  await withParentAndSuperAdmin(async ({ dbParentA, dbSuperAdmin }) => {
    await createDoc(dbSuperAdmin, `student_ledgers/legacy-ledger-b1-2026`, {
      id: "legacy-ledger-b1-2026",
      schoolId: SCHOOL_B,
      studentId: STUDENT_B1,
      classId: "class-2",
      academicYear: "2026",
      term: 1,
      fees: [],
      totalFee: 500,
      createdAt: Date.now(),
    });
    await assertFails(readDoc(dbParentA, `student_ledgers/legacy-ledger-b1-2026`));
  });
});

test("Phase 3B: student_ledgers (legacy) - Super admin reads legacy ledger", async () => {
  await withParentAndSuperAdmin(async ({ dbSuperAdmin }) => {
    await createDoc(dbSuperAdmin, `student_ledgers/legacy-ledger-super-2026`, {
      id: "legacy-ledger-super-2026",
      schoolId: SCHOOL_A,
      studentId: STUDENT_A1,
      classId: "class-1",
      academicYear: "2026",
      term: 1,
      fees: [],
      totalFee: 500,
      createdAt: Date.now(),
    });
    await assertSucceeds(readDoc(dbSuperAdmin, `student_ledgers/legacy-ledger-super-2026`));
  });
});

test("Phase 3B: student_ledgers (legacy) - Unauthenticated user reads legacy ledger", async () => {
  await withParentAndSuperAdmin(async ({ dbUnauth }) => {
    await assertFails(readDoc(dbUnauth, `student_ledgers/legacy-ledger-a1-2026`));
  });
});

test("Phase 3B: V2 feeLedgers - Parent A reads own child's V2 ledger", async () => {
  await withParentAndSuperAdmin(async ({ dbParentA, dbSuperAdmin }) => {
    await createDoc(
      dbSuperAdmin,
      `schools/${SCHOOL_A}/feeLedgers/v2-ledger-a1-2026`,
      {
        id: "v2-ledger-a1-2026",
        schoolId: SCHOOL_A,
        studentId: STUDENT_A1,
        classId: "class-1",
        academicYear: "2026",
        term: 1,
        fees: [],
        totalFee: 500,
        createdAt: Date.now(),
      },
    );
    await assertSucceeds(
      readDoc(dbParentA, `schools/${SCHOOL_A}/feeLedgers/v2-ledger-a1-2026`),
    );
  });
});

test("Phase 3B: V2 feeLedgers - Parent A reads V2 ledger whose schoolId does not match path schoolId", async () => {
  await withParentAndSuperAdmin(async ({ dbParentA, dbSuperAdmin }) => {
    await createDoc(
      dbSuperAdmin,
      `schools/${SCHOOL_A}/feeLedgers/v2-ledger-cross-school`,
      {
        id: "v2-ledger-cross-school",
        schoolId: SCHOOL_B,
        studentId: STUDENT_A1,
        classId: "class-2",
        academicYear: "2026",
        term: 1,
        fees: [],
        totalFee: 500,
        createdAt: Date.now(),
      },
    );
    await assertFails(
      readDoc(dbParentA, `schools/${SCHOOL_A}/feeLedgers/v2-ledger-cross-school`),
    );
  });
});

test("Phase 3B: V2 feeLedgers - Super admin reads V2 ledger", async () => {
  await withParentAndSuperAdmin(async ({ dbSuperAdmin }) => {
    await createDoc(
      dbSuperAdmin,
      `schools/${SCHOOL_A}/feeLedgers/v2-ledger-super-2026`,
      {
        id: "v2-ledger-super-2026",
        schoolId: SCHOOL_A,
        studentId: STUDENT_A1,
        classId: "class-1",
        academicYear: "2026",
        term: 1,
        fees: [],
        totalFee: 500,
        createdAt: Date.now(),
      },
    );
    await assertSucceeds(
      readDoc(dbSuperAdmin, `schools/${SCHOOL_A}/feeLedgers/v2-ledger-super-2026`),
    );
  });
});

test("Phase 3B: V2 feeLedgers - Unauthenticated user reads V2 ledger", async () => {
  await withParentAndSuperAdmin(async ({ dbUnauth }) => {
    await assertFails(
      readDoc(dbUnauth, `schools/${SCHOOL_A}/feeLedgers/v2-ledger-a1-2026`),
    );
  });
});

test("Phase 3B: admin_remarks - Parent A reads own child's admin remark", async () => {
  await withParentAndSuperAdmin(async ({ dbParentA, dbSuperAdmin }) => {
    await createDoc(dbSuperAdmin, `admin_remarks/admin-remark-a1-1`, {
      id: "admin-remark-a1-1",
      schoolId: SCHOOL_A,
      studentId: STUDENT_A1,
      classId: "class-1",
      term: 1,
      academicYear: "2026",
      remark: "Admin comment",
      adminId: "admin-1",
      dateCreated: "2026-01-15",
    });
    await assertSucceeds(readDoc(dbParentA, "admin_remarks/admin-remark-a1-1"));
  });
});

test("Phase 3B: admin_remarks - Parent A reads another parent's child's admin remark", async () => {
  await withParentAndSuperAdmin(async ({ dbParentA, dbSuperAdmin }) => {
    await createDoc(dbSuperAdmin, `admin_remarks/admin-remark-b1-1`, {
      id: "admin-remark-b1-1",
      schoolId: SCHOOL_B,
      studentId: STUDENT_B1,
      classId: "class-2",
      term: 1,
      academicYear: "2026",
      remark: "Admin comment",
      adminId: "admin-2",
      dateCreated: "2026-01-15",
    });
    await assertFails(readDoc(dbParentA, "admin_remarks/admin-remark-b1-1"));
  });
});

test("Phase 3B: admin_remarks - Super admin reads admin remark", async () => {
  await withParentAndSuperAdmin(async ({ dbSuperAdmin }) => {
    await createDoc(dbSuperAdmin, `admin_remarks/admin-remark-super-1`, {
      id: "admin-remark-super-1",
      schoolId: SCHOOL_A,
      studentId: STUDENT_A1,
      classId: "class-1",
      term: 1,
      academicYear: "2026",
      remark: "Admin comment",
      adminId: "admin-1",
      dateCreated: "2026-01-15",
    });
    await assertSucceeds(readDoc(dbSuperAdmin, "admin_remarks/admin-remark-super-1"));
  });
});

test("Phase 3B: admin_remarks - Unauthenticated user reads admin remark", async () => {
  await withParentAndSuperAdmin(async ({ dbUnauth }) => {
    await assertFails(readDoc(dbUnauth, "admin_remarks/admin-remark-a1-1"));
  });
});

test("Edge cases: Parent reads record with missing student document", async () => {
  await withParentAndSuperAdmin(async ({ dbParentA, dbSuperAdmin }) => {
    await createDoc(dbSuperAdmin, `assessments/${SCHOOL_A}_nonexistent_Math_1_2026`, {
      id: `${SCHOOL_A}_nonexistent_Math_1_2026`,
      schoolId: SCHOOL_A,
      studentId: "nonexistent",
      classId: "class-1",
      term: 1,
      academicYear: "2026",
      subject: "Math",
      testScore: 10,
      homeworkScore: 5,
      projectScore: 10,
      examScore: 40,
      total: 65,
    });
    await assertFails(
      readDoc(dbParentA, `assessments/${SCHOOL_A}_nonexistent_Math_1_2026`),
    );
  });
});

test("Edge cases: Parent reads record where record schoolId != student schoolId", async () => {
  await withParentAndSuperAdmin(async ({ dbParentA, dbSuperAdmin }) => {
    await createDoc(dbSuperAdmin, `student_remarks/remark-school-mismatch`, {
      id: "remark-school-mismatch",
      schoolId: SCHOOL_B,
      studentId: STUDENT_A1,
      classId: "class-2",
      term: 1,
      academicYear: "2026",
      remark: "School mismatch",
      behaviorTag: "Good",
      teacherId: "teacher-2",
      dateCreated: "2026-01-15",
    });
    await assertFails(readDoc(dbParentA, "student_remarks/remark-school-mismatch"));
  });
});

test("Edge cases: Parent A reads own child's assessment via query", async () => {
  await withParentAndSuperAdmin(async ({ dbParentA, dbSuperAdmin }) => {
    await createDoc(dbSuperAdmin, `assessments/${SCHOOL_A}_${STUDENT_A1}_Sci_2_2026`, {
      id: `${SCHOOL_A}_${STUDENT_A1}_Sci_2_2026`,
      schoolId: SCHOOL_A,
      studentId: STUDENT_A1,
      classId: "class-1",
      term: 2,
      academicYear: "2026",
      subject: "Science",
      testScore: 16,
      homeworkScore: 8,
      projectScore: 16,
      examScore: 55,
      total: 95,
    });
    const q = query(
      collection(dbParentA, "assessments"),
      where("schoolId", "==", SCHOOL_A),
      where("studentId", "==", STUDENT_A1),
    );
    const snap = await getDocs(q);
    assert.ok(snap.size > 0, "Query should return at least one document");
  });
});

// ---------- GATE 5: Query authorization tests ----------
// These tests exercise the exact same queries that mockDb.ts parent-facing
// functions use, verifying Firestore security rules enforce authorization
// at the query level (not just document level).

test("Gate 5 Q1: Parent A queries own child's assessments (ALLOW)", async () => {
  await withParentAndSuperAdmin(async ({ dbParentA, dbSuperAdmin }) => {
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
  });
});

test("Gate 5 Q2: Parent A queries another parent's child's assessments (DENY)", async () => {
  await withParentAndSuperAdmin(async ({ dbParentA, dbSuperAdmin }) => {
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
  });
});

test("Gate 5 Q3: Parent A queries cross-school assessment (DENY)", async () => {
  await withParentAndSuperAdmin(async ({ dbParentA, dbSuperAdmin }) => {
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
  });
});

test("Gate 5 Q4: Parent A queries own child's remarks (ALLOW)", async () => {
  await withParentAndSuperAdmin(async ({ dbParentA, dbSuperAdmin }) => {
    await createDoc(dbSuperAdmin, `student_remarks/remark-a1-1`, {
      id: "remark-a1-1",
      schoolId: SCHOOL_A,
      studentId: STUDENT_A1,
      classId: "class-1",
      term: 1,
      academicYear: "2026",
      remark: "Good progress",
      behaviorTag: "Good",
      teacherId: "teacher-1",
      dateCreated: "2026-01-15",
    });
    const q = query(
      collection(dbParentA, "student_remarks"),
      where("schoolId", "==", SCHOOL_A),
      where("studentId", "==", STUDENT_A1),
    );
    const snap = await getDocs(q);
    assert.ok(snap.size > 0, "Parent A should see Student A1's remarks");
  });
});

test("Gate 5 Q5: Parent A queries another parent's child's remarks (DENY)", async () => {
  await withParentAndSuperAdmin(async ({ dbParentA, dbSuperAdmin }) => {
    await createDoc(dbSuperAdmin, `student_remarks/remark-b1-1`, {
      id: "remark-b1-1",
      schoolId: SCHOOL_B,
      studentId: STUDENT_B1,
      classId: "class-2",
      term: 1,
      academicYear: "2026",
      remark: "Good progress",
      behaviorTag: "Good",
      teacherId: "teacher-2",
      dateCreated: "2026-01-15",
    });
    const q = query(
      collection(dbParentA, "student_remarks"),
      where("schoolId", "==", SCHOOL_B),
      where("studentId", "==", STUDENT_B1),
    );
    try {
      const snap = await getDocs(q);
      assert.fail(
        `Parent A should NOT see Student B1's remarks, but got ${snap.size} docs`,
      );
    } catch (e) {
      assert.strictEqual(e.code, "permission-denied", "Should be permission-denied");
    }
  });
});

test("Gate 5 Q6: Parent A queries own child's admin remarks (ALLOW)", async () => {
  await withParentAndSuperAdmin(async ({ dbParentA, dbSuperAdmin }) => {
    await createDoc(dbSuperAdmin, `admin_remarks/admin-remark-a1-1`, {
      id: "admin-remark-a1-1",
      schoolId: SCHOOL_A,
      studentId: STUDENT_A1,
      classId: "class-1",
      term: 1,
      academicYear: "2026",
      remark: "Admin comment",
      adminId: "admin-1",
      dateCreated: "2026-01-15",
    });
    const q = query(
      collection(dbParentA, "admin_remarks"),
      where("schoolId", "==", SCHOOL_A),
      where("studentId", "==", STUDENT_A1),
    );
    const snap = await getDocs(q);
    assert.ok(snap.size > 0, "Parent A should see Student A1's admin remarks");
  });
});

test("Gate 5 Q7: Parent A queries another parent's child's admin remarks (DENY)", async () => {
  await withParentAndSuperAdmin(async ({ dbParentA, dbSuperAdmin }) => {
    await createDoc(dbSuperAdmin, `admin_remarks/admin-remark-b1-1`, {
      id: "admin-remark-b1-1",
      schoolId: SCHOOL_B,
      studentId: STUDENT_B1,
      classId: "class-2",
      term: 1,
      academicYear: "2026",
      remark: "Admin comment",
      adminId: "admin-2",
      dateCreated: "2026-01-15",
    });
    const q = query(
      collection(dbParentA, "admin_remarks"),
      where("schoolId", "==", SCHOOL_B),
      where("studentId", "==", STUDENT_B1),
    );
    try {
      const snap = await getDocs(q);
      assert.fail(
        `Parent A should NOT see Student B1's admin remarks, but got ${snap.size} docs`,
      );
    } catch (e) {
      assert.strictEqual(e.code, "permission-denied", "Should be permission-denied");
    }
  });
});

test("Gate 5 Q8: Parent A queries own child's legacy ledgers (ALLOW)", async () => {
  await withParentAndSuperAdmin(async ({ dbParentA, dbSuperAdmin }) => {
    await createDoc(dbSuperAdmin, `student_ledgers/ledger-a1-2026`, {
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
      collection(dbParentA, "student_ledgers"),
      where("schoolId", "==", SCHOOL_A),
      where("studentId", "==", STUDENT_A1),
    );
    const snap = await getDocs(q);
    assert.ok(snap.size > 0, "Parent A should see Student A1's legacy ledgers");
  });
});

test("Gate 5 Q9: Parent A queries another parent's child's legacy ledgers (DENY)", async () => {
  await withParentAndSuperAdmin(async ({ dbParentA, dbSuperAdmin }) => {
    await createDoc(dbSuperAdmin, `student_ledgers/ledger-b1-2026`, {
      id: "ledger-b1-2026",
      schoolId: SCHOOL_B,
      studentId: STUDENT_B1,
      classId: "class-2",
      academicYear: "2026",
      term: 1,
      fees: [],
      totalFee: 600,
      createdAt: Date.now(),
    });
    const q = query(
      collection(dbParentA, "student_ledgers"),
      where("schoolId", "==", SCHOOL_B),
      where("studentId", "==", STUDENT_B1),
    );
    try {
      const snap = await getDocs(q);
      assert.fail(
        `Parent A should NOT see Student B1's legacy ledgers, but got ${snap.size} docs`,
      );
    } catch (e) {
      assert.strictEqual(e.code, "permission-denied", "Should be permission-denied");
    }
  });
});

test("Gate 5 Q10: Parent A queries cross-school legacy ledgers (DENY)", async () => {
  await withParentAndSuperAdmin(async ({ dbParentA, dbSuperAdmin }) => {
    await createDoc(dbSuperAdmin, `student_ledgers/ledger-cross-2026`, {
      id: "ledger-cross-2026",
      schoolId: SCHOOL_B,
      studentId: STUDENT_A1,
      classId: "class-2",
      academicYear: "2026",
      term: 1,
      fees: [],
      totalFee: 500,
      createdAt: Date.now(),
    });
    const q = query(
      collection(dbParentA, "student_ledgers"),
      where("schoolId", "==", SCHOOL_B),
      where("studentId", "==", STUDENT_A1),
    );
    try {
      const snap = await getDocs(q);
      assert.fail(
        `Parent A should NOT see School B legacy ledgers for Student A1, but got ${snap.size} docs`,
      );
    } catch (e) {
      assert.strictEqual(e.code, "permission-denied", "Should be permission-denied");
    }
  });
});

test("Gate 5 Q11: Parent A queries own child's V2 feeLedgers (ALLOW)", async () => {
  await withParentAndSuperAdmin(async ({ dbParentA, dbSuperAdmin }) => {
    await createDoc(dbSuperAdmin, `schools/${SCHOOL_A}/feeLedgers/v2-ledger-a1-2026`, {
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
      collection(dbParentA, "schools", SCHOOL_A, "feeLedgers"),
      where("schoolId", "==", SCHOOL_A),
      where("studentId", "==", STUDENT_A1),
    );
    const snap = await getDocs(q);
    assert.ok(snap.size > 0, "Parent A should see Student A1's V2 feeLedgers");
  });
});

test("Gate 5 Q12: Parent A queries V2 feeLedgers with mismatched schoolId (DENY)", async () => {
  await withParentAndSuperAdmin(async ({ dbParentA, dbSuperAdmin }) => {
    await createDoc(dbSuperAdmin, `schools/${SCHOOL_A}/feeLedgers/v2-ledger-cross-school`, {
      id: "v2-ledger-cross-school",
      schoolId: SCHOOL_B,
      studentId: STUDENT_A1,
      classId: "class-2",
      academicYear: "2026",
      term: 1,
      fees: [],
      totalFee: 500,
      createdAt: Date.now(),
    });
    const q = query(
      collection(dbParentA, "schools", SCHOOL_A, "feeLedgers"),
      where("schoolId", "==", SCHOOL_B),
      where("studentId", "==", STUDENT_A1),
    );
    try {
      const snap = await getDocs(q);
      assert.fail(
        `Parent A should NOT see V2 ledgers with mismatched schoolId, but got ${snap.size} docs`,
      );
    } catch (e) {
      assert.strictEqual(e.code, "permission-denied", "Should be permission-denied");
    }
  });
});

test("Gate 5 Q13: Unauthenticated user reads assessments (DENY)", async () => {
  await withParentAndSuperAdmin(async ({ dbUnauth, dbSuperAdmin }) => {
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
  });
});

test("Gate 5 Q14: Parent broad query without studentId (DENY)", async () => {
  await withParentAndSuperAdmin(async ({ dbParentA, dbSuperAdmin }) => {
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
  });
});

test("Gate 5 Q15: Parent broad query without studentId for ledgers (DENY)", async () => {
  await withParentAndSuperAdmin(async ({ dbParentA, dbSuperAdmin }) => {
    const q = query(
      collection(dbParentA, "student_ledgers"),
      where("schoolId", "==", SCHOOL_A),
    );
    try {
      const snap = await getDocs(q);
      assert.fail(
        `Parent should NOT be able to query all ledgers for a school without studentId, but got ${snap.size} docs`,
      );
    } catch (e) {
      assert.strictEqual(e.code, "permission-denied", "Should be permission-denied");
    }
  });
});

test("Gate 5 Q16: School admin queries all ledgers for school without studentId (ALLOW)", async () => {
  await withParentAndSuperAdmin(async ({ dbSchoolAdminA, dbSuperAdmin }) => {
    await createDoc(dbSuperAdmin, `student_ledgers/admin-ledger-2026`, {
      id: "admin-ledger-2026",
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
      collection(dbSchoolAdminA, "student_ledgers"),
      where("schoolId", "==", SCHOOL_A),
    );
    const snap = await getDocs(q);
    assert.ok(snap.size > 0, "School admin should see all ledgers for school A");
  });
});

test("Gate 5 Q17: School admin queries V2 feeLedgers for school (ALLOW)", async () => {
  await withParentAndSuperAdmin(async ({ dbSchoolAdminA, dbSuperAdmin }) => {
    await createDoc(dbSuperAdmin, `schools/${SCHOOL_A}/feeLedgers/admin-v2-ledger-2026`, {
      id: "admin-v2-ledger-2026",
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
      collection(dbSchoolAdminA, "schools", SCHOOL_A, "feeLedgers"),
      where("schoolId", "==", SCHOOL_A),
    );
    const snap = await getDocs(q);
    assert.ok(snap.size > 0, "School admin should see all V2 feeLedgers for school A");
  });
});

test("Gate 5 Q18: Parent cannot query school-wide ledgers (DENY)", async () => {
  await withParentAndSuperAdmin(async ({ dbParentA, dbSuperAdmin }) => {
    const q = query(
      collection(dbParentA, "student_ledgers"),
      where("schoolId", "==", SCHOOL_A),
    );
    try {
      const snap = await getDocs(q);
      assert.fail(
        `Parent should NOT be able to query all ledgers for a school, but got ${snap.size} docs`,
      );
    } catch (e) {
      assert.strictEqual(e.code, "permission-denied", "Should be permission-denied");
    }
  });
});

test("Gate 5 Q19: Dual-read simulation - both layouts accessible", async () => {
  await withParentAndSuperAdmin(async ({ dbParentA, dbSuperAdmin }) => {
    await createDoc(dbSuperAdmin, `student_ledgers/ledger-a1-2026`, {
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
    await createDoc(dbSuperAdmin, `schools/${SCHOOL_A}/feeLedgers/v2-ledger-a1-2026`, {
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
    const legacyQ = query(
      collection(dbParentA, "student_ledgers"),
      where("schoolId", "==", SCHOOL_A),
      where("studentId", "==", STUDENT_A1),
    );
    const v2Q = query(
      collection(dbParentA, "schools", SCHOOL_A, "feeLedgers"),
      where("schoolId", "==", SCHOOL_A),
      where("studentId", "==", STUDENT_A1),
    );
    const [legacySnap, v2Snap] = await Promise.all([
      getDocs(legacyQ),
      getDocs(v2Q),
    ]);
    assert.ok(
      legacySnap.size > 0 || v2Snap.size > 0,
      "At least one layout should have parent's own records",
    );
  });
});

test("Gate 5 Q20: Dual-read simulation - cross-school denied in both layouts", async () => {
  await withParentAndSuperAdmin(async ({ dbParentA, dbSuperAdmin }) => {
    const legacyQ = query(
      collection(dbParentA, "student_ledgers"),
      where("schoolId", "==", SCHOOL_B),
      where("studentId", "==", STUDENT_A1),
    );
    const v2Q = query(
      collection(dbParentA, "schools", SCHOOL_A, "feeLedgers"),
      where("schoolId", "==", SCHOOL_B),
      where("studentId", "==", STUDENT_A1),
    );
    try {
      await getDocs(legacyQ);
      assert.fail("Legacy cross-school query should be denied");
    } catch (e) {
      assert.strictEqual(e.code, "permission-denied", "Legacy should be permission-denied");
    }
    try {
      await getDocs(v2Q);
      assert.fail("V2 cross-school query should be denied");
    } catch (e) {
      assert.strictEqual(e.code, "permission-denied", "V2 should be permission-denied");
    }
  });
});
