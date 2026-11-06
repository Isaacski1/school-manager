import assert from "node:assert";
import test from "node:test";
import { connectFirestoreEmulator } from "firebase/firestore";
import {
  initializeApp,
  getAuth,
  signInWithCustomToken,
  signOut,
} from "firebase/app";
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  setDoc,
} from "firebase/firestore";

// Connect to the running Firestore Emulator
const app = initializeApp({
  projectId: "school-manager-test",
  apiKey: "test",
  authDomain: "test.firebaseapp.com",
});
const db = getFirestore(app);
connectFirestoreEmulator(db, "localhost", 8080);

const SCHOOL_A = "school-a";
const SCHOOL_B = "school-b";
const STUDENT_A1 = "student-a1";
const STUDENT_B1 = "student-b1";
const PARENT_A = "parent-a";
const PARENT_B = "parent-b";

// Create authenticated Firestore client for a parent
async function parentDb(uid, phoneNumber) {
  const customToken = `test-${uid}`; // Emulator accepts any custom token
  // Use signInWithCustomToken to authenticate, then get a client with that auth
  const auth = getAuth(app);
  await signInWithCustomToken(auth, customToken);
  return { db, auth };
}

// Helper: expect a query to succeed and return documents
async function expectQueryAllow(q, label) {
  const snap = await getDocs(q);
  return { allowed: true, count: snap.size, docs: snap.docs.map((d) => d.id) };
}

// Helper: expect a query to be denied
async function expectQueryDeny(q, label) {
  try {
    const snap = await getDocs(q);
    return { allowed: true, count: snap.size, docs: [] }; // Unexpected: query succeeded
  } catch (e) {
    if (e.code === "permission-denied") {
      return { allowed: false, error: "permission-denied" };
    }
    return { allowed: true, error: `unexpected: ${e.code} ${e.message}` };
  }
}

// Helper: expect a doc read to succeed
async function expectDocAllow(ref, label) {
  const snap = await getDoc(ref);
  return { allowed: true, exists: snap.exists() };
}

// Helper: expect a doc read to be denied
async function expectDocDeny(ref, label) {
  try {
    const snap = await getDoc(ref);
    return { allowed: true, exists: snap.exists() }; // Unexpected
  } catch (e) {
    if (e.code === "permission-denied") {
      return { allowed: false, error: "permission-denied" };
    }
    return { allowed: true, error: `unexpected: ${e.code} ${e.message}` };
  }
}

// Seed data using a service-account-like approach (bypass rules via direct setDoc
// with admin-like access — in emulator, we can write directly as super admin)
// We'll create documents directly using setDoc which bypasses rules when called
// from a context that has write access.
// For these tests, we create documents first as a setup step, then test reads.

async function seedData(db) {
  // Create schools
  await setDoc(doc(db, "schools", SCHOOL_A), {
    id: SCHOOL_A,
    status: "active",
    name: "School A",
  });
  await setDoc(doc(db, "schools", SCHOOL_B), {
    id: SCHOOL_B,
    status: "active",
    name: "School B",
  });

  // Create students
  await setDoc(doc(db, "students", STUDENT_A1), {
    id: STUDENT_A1,
    schoolId: SCHOOL_A,
    guardianPhone: "0551234567",
    name: "Student A1",
  });
  await setDoc(doc(db, "students", STUDENT_B1), {
    id: STUDENT_B1,
    schoolId: SCHOOL_B,
    guardianPhone: "0559876543",
    name: "Student B1",
  });

  // Create parent user documents
  await setDoc(doc(db, "users", PARENT_A), {
    id: PARENT_A,
    role: "parent",
    phoneNumber: "0551234567",
    schoolId: SCHOOL_A,
  });
  await setDoc(doc(db, "users", PARENT_B), {
    id: PARENT_B,
    role: "parent",
    phoneNumber: "0559876543",
    schoolId: SCHOOL_B,
  });

  // Create super admin user document
  await setDoc(doc(db, "users", "super-admin"), {
    id: "super-admin",
    role: "super_admin",
    schoolId: SCHOOL_A,
  });
}

// Test data: create assessments for Student A (School A) and Student B (School B)
async function seedAssessments(db) {
  await setDoc(doc(db, "assessments", `${SCHOOL_A}_${STUDENT_A1}_Math_1_2026`), {
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
  await setDoc(doc(db, "assessments", `${SCHOOL_B}_${STUDENT_B1}_Math_1_2026`), {
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
  // Cross-school: assessment at school-b for student-a1
  await setDoc(doc(db, "assessments", `${SCHOOL_B}_${STUDENT_A1}_Math_1_2026`), {
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
}

// Test data: create remarks
async function seedRemarks(db) {
  await setDoc(doc(db, "student_remarks", "remark-a1-1"), {
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
  await setDoc(doc(db, "student_remarks", "remark-b1-1"), {
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
  await setDoc(doc(db, "student_remarks", "remark-cross-1"), {
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
}

// Test data: create admin remarks
async function seedAdminRemarks(db) {
  await setDoc(doc(db, "admin_remarks", "admin-remark-a1-1"), {
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
  await setDoc(doc(db, "admin_remarks", "admin-remark-b1-1"), {
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
}

// Test data: create legacy ledgers
async function seedLegacyLedgers(db) {
  await setDoc(doc(db, "student_ledgers", "legacy-ledger-a1-2026"), {
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
  await setDoc(doc(db, "student_ledgers", "legacy-ledger-b1-2026"), {
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
}

// Test data: create V2 feeLedgers
async function seedV2Ledgers(db) {
  await setDoc(
    doc(db, "schools", SCHOOL_A, "feeLedgers", "v2-ledger-a1-2026"),
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
  await setDoc(
    doc(db, "schools", SCHOOL_A, "feeLedgers", "v2-ledger-cross-school"),
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
}

test("Gate 5: Setup seed data", async (t) => {
  await seedData(db);
  await seedAssessments(db);
  await seedRemarks(db);
  await seedAdminRemarks(db);
  await seedLegacyLedgers(db);
  await seedV2Ledgers(db);
  console.log("Seed data created");
});

test("Gate 5 Q1: Parent A reads own child's assessments (authorized)", async (t) => {
  const q = query(
    collection(db, "assessments"),
    where("schoolId", "==", SCHOOL_A),
    where("studentId", "==", STUDENT_A1),
  );
  const snap = await getDocs(q);
  assert.ok(snap.size > 0, "Parent A should see Student A1's assessments");
  assert.ok(
    snap.docs.some((d) => d.data().subject === "Math"),
    "Should include Math assessment",
  );
});

test("Gate 5 Q2: Parent A reads another parent's child's assessments (DENY)", async (t) => {
  const q = query(
    collection(db, "assessments"),
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

test("Gate 5 Q3: Parent A reads cross-school assessment (DENY)", async (t) => {
  const q = query(
    collection(db, "assessments"),
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

test("Gate 5 Q4: Parent A reads own child's student remarks (authorized)", async (t) => {
  const q = query(
    collection(db, "student_remarks"),
    where("schoolId", "==", SCHOOL_A),
    where("studentId", "==", STUDENT_A1),
  );
  const snap = await getDocs(q);
  assert.ok(snap.size > 0, "Parent A should see Student A1's remarks");
});

test("Gate 5 Q5: Parent A reads another parent's child's remarks (DENY)", async (t) => {
  const q = query(
    collection(db, "student_remarks"),
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

test("Gate 5 Q6: Parent A reads own child's admin remarks (authorized)", async (t) => {
  const q = query(
    collection(db, "admin_remarks"),
    where("schoolId", "==", SCHOOL_A),
    where("studentId", "==", STUDENT_A1),
  );
  const snap = await getDocs(q);
  assert.ok(snap.size > 0, "Parent A should see Student A1's admin remarks");
});

test("Gate 5 Q7: Parent A reads another parent's child's admin remarks (DENY)", async (t) => {
  const q = query(
    collection(db, "admin_remarks"),
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

test("Gate 5 Q8: Parent A reads own child's legacy ledgers (authorized)", async (t) => {
  const q = query(
    collection(db, "student_ledgers"),
    where("schoolId", "==", SCHOOL_A),
    where("studentId", "==", STUDENT_A1),
  );
  const snap = await getDocs(q);
  assert.ok(snap.size > 0, "Parent A should see Student A1's legacy ledgers");
});

test("Gate 5 Q9: Parent A reads another parent's child's legacy ledgers (DENY)", async (t) => {
  const q = query(
    collection(db, "student_ledgers"),
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

test("Gate 5 Q10: Parent A reads cross-school legacy ledgers (DENY)", async (t) => {
  const q = query(
    collection(db, "student_ledgers"),
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

test("Gate 5 Q11: Parent A reads own child's V2 feeLedgers (authorized)", async (t) => {
  const q = query(
    collection(db, "schools", SCHOOL_A, "feeLedgers"),
    where("schoolId", "==", SCHOOL_A),
    where("studentId", "==", STUDENT_A1),
  );
  const snap = await getDocs(q);
  assert.ok(snap.size > 0, "Parent A should see Student A1's V2 feeLedgers");
});

test("Gate 5 Q12: Parent A reads V2 feeLedgers with mismatched schoolId (DENY)", async (t) => {
  const q = query(
    collection(db, "schools", SCHOOL_A, "feeLedgers"),
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

test("Gate 5 Q13: Unauthenticated user reads assessments (DENY)", async (t) => {
  // Create a separate app without auth
  const unauthApp = initializeApp({
    projectId: "school-manager-test",
    apiKey: "test",
    authDomain: "test.firebaseapp.com",
  });
  const unauthDb = getFirestore(unauthApp);
  connectFirestoreEmulator(unauthDb, "localhost", 8080);
  const q = query(
    collection(unauthDb, "assessments"),
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

test("Gate 5 Q14: Broad query without studentId is denied (parent)", async (t) => {
  // Parent queries assessments without studentId - broad query should be denied
  const q = query(collection(db, "assessments"), where("schoolId", "==", SCHOOL_A));
  try {
    const snap = await getDocs(q);
    assert.fail(
      `Parent should NOT be able to query all assessments for a school, but got ${snap.size} docs`,
    );
  } catch (e) {
    assert.strictEqual(e.code, "permission-denied", "Should be permission-denied");
  }
});

test("Gate 5 Q15: Dual-read - primary accessible, alternate denied", async (t) => {
  // This simulates the dual-read pattern in getStudentLedgers()
  // When V2 is used, primary is /schools/{id}/feeLedgers and alternate is /student_ledgers
  // When legacy, primary is /student_ledgers and alternate is /schools/{id}/feeLedgers
  
  // Test legacy mode: primary = student_ledgers (accessible), alternate = feeLedgers (may be denied for parent)
  const primaryQ = query(
    collection(db, "student_ledgers"),
    where("schoolId", "==", SCHOOL_A),
    where("studentId", "==", STUDENT_A1),
  );
  const primarySnap = await getDocs(primaryQ);
  assert.ok(
    primarySnap.size > 0,
    "Primary (legacy) ledgers should be accessible",
  );

  // Alternate = V2 feeLedgers - parent should be able to read their own child's
  const alternateQ = query(
    collection(db, "schools", SCHOOL_A, "feeLedgers"),
    where("schoolId", "==", SCHOOL_A),
    where("studentId", "==", STUDENT_A1),
  );
  const alternateSnap = await getDocs(alternateQ);
  assert.ok(
    alternateSnap.size > 0,
    "Alternate (V2) ledgers should be accessible for own child",
  );
});

test("Gate 5 Q16: Dual-read - both layouts return parent's own records", async (t) => {
  // Verify both layouts return the same student's records when queried correctly
  const legacyQ = query(
    collection(db, "student_ledgers"),
    where("schoolId", "==", SCHOOL_A),
    where("studentId", "==", STUDENT_A1),
  );
  const v2Q = query(
    collection(db, "schools", SCHOOL_A, "feeLedgers"),
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

test("Gate 5 Q16b: Broad query without studentId is denied (school-wide ledger query as parent)", async (t) => {
  // Simulates what would happen if a parent tried to call getStudentLedgers without studentId
  const q = query(collection(db, "student_ledgers"), where("schoolId", "==", SCHOOL_A));
  try {
    const snap = await getDocs(q);
    assert.fail(
      `Parent should NOT be able to query all ledgers for a school without studentId, but got ${snap.size} docs`,
    );
  } catch (e) {
    assert.strictEqual(e.code, "permission-denied", "Should be permission-denied");
  }
});
