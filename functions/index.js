const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

const DEFAULT_BATCH_SIZE = 400;

const normalizeSchoolId = (value) => String(value || "").trim();

async function deleteSchoolScopedCollection(
  db,
  collectionName,
  schoolId,
  batchSize = DEFAULT_BATCH_SIZE,
) {
  const scopedSchoolId = normalizeSchoolId(schoolId);
  if (!scopedSchoolId) return 0;

  let deletedCount = 0;
  while (true) {
    const snapshot = await db
      .collection(collectionName)
      .where("schoolId", "==", scopedSchoolId)
      .limit(batchSize)
      .get();

    if (snapshot.empty) {
      break;
    }

    const batch = db.batch();
    snapshot.docs.forEach((docSnap) => batch.delete(docSnap.ref));
    await batch.commit();
    deletedCount += snapshot.size;

    if (snapshot.size < batchSize) {
      break;
    }
  }

  return deletedCount;
}

async function deleteSchoolScopedCollections(
  db,
  schoolId,
  collectionNames = [],
  batchSize = DEFAULT_BATCH_SIZE,
) {
  const deletedDocs = {};
  for (const collectionName of collectionNames) {
    const deletedCount = await deleteSchoolScopedCollection(
      db,
      collectionName,
      schoolId,
      batchSize,
    );
    deletedDocs[collectionName] = deletedCount;
    console.log(`Deleted ${deletedCount} documents from ${collectionName}`);
  }
  return deletedDocs;
}

async function deleteSchoolDocumentTree(db, schoolId) {
  const schoolRef = db.collection("schools").doc(schoolId);
  if (typeof db.recursiveDelete === "function") {
    await db.recursiveDelete(schoolRef);
    return;
  }
  await schoolRef.delete();
}

exports.deleteAuthUser = functions.firestore
  .document("users/{userId}")
  .onDelete(async (snap, context) => {
    const userId = context.params.userId;
    try {
      await admin.auth().deleteUser(userId);
      console.log(`Successfully deleted auth user: ${userId}`);
    } catch (error) {
      console.error(`Error deleting auth user ${userId}:`, error);
    }
  });

exports.createSchool = functions.https.onCall(async (data, context) => {
  // Check if user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated.",
    );
  }

  // Check if user is super admin
  const userId = context.auth.uid;
  const userDoc = await admin.firestore().collection("users").doc(userId).get();
  if (!userDoc.exists || userDoc.data().role !== "super_admin") {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only super admins can create schools.",
    );
  }

  const { name, phone, address, logoUrl, plan } = data;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "School name is required and must be a non-empty string.",
    );
  }

  // Validate plan
  const validPlans = ["trial", "monthly", "termly", "yearly"];
  if (!validPlans.includes(plan)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Invalid plan type.",
    );
  }

  try {
    // Generate unique school code
    const baseCode = name
      .replace(/[^a-zA-Z0-9]/g, "")
      .toUpperCase()
      .substring(0, 6);
    let schoolCode = baseCode;
    let counter = 1;

    // Ensure unique code
    while (true) {
      const existingSchool = await admin
        .firestore()
        .collection("schools")
        .where("code", "==", schoolCode)
        .limit(1)
        .get();

      if (existingSchool.empty) break;
      schoolCode = `${baseCode}${counter}`;
      counter++;
      if (counter > 999) {
        // Fallback: add random digits
        schoolCode = `${baseCode}${Math.floor(Math.random() * 1000)}`;
      }
    }

    // Create school document
    const schoolData = {
      name: name.trim(),
      code: schoolCode,
      phone: phone ? phone.trim() : "",
      address: address ? address.trim() : "",
      logoUrl: logoUrl ? logoUrl.trim() : "",
      status: "active",
      plan,
      planEndsAt: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: userId,
    };

    const schoolRef = await admin
      .firestore()
      .collection("schools")
      .add(schoolData);

    console.log(
      `School created successfully: ${schoolRef.id} with code ${schoolCode}`,
    );
    return {
      schoolId: schoolRef.id,
      code: schoolCode,
      message: "School created successfully",
    };
  } catch (error) {
    console.error("Error creating school:", error);
    throw new functions.https.HttpsError(
      "internal",
      "Failed to create school",
      error.message,
    );
  }
});

exports.createSchoolAdmin = functions.https.onCall(async (data, context) => {
  // Check if user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated.",
    );
  }

  // Check if user is super admin
  const callerId = context.auth.uid;
  const callerDoc = await admin
    .firestore()
    .collection("users")
    .doc(callerId)
    .get();
  if (!callerDoc.exists || callerDoc.data().role !== "super_admin") {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only super admins can create school admins.",
    );
  }

  const { schoolId, fullName, email } = data;

  if (!schoolId || !fullName || !email) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "schoolId, fullName, and email are required.",
    );
  }

  // Validate school exists and is active
  const schoolDoc = await admin
    .firestore()
    .collection("schools")
    .doc(schoolId)
    .get();
  if (!schoolDoc.exists) {
    throw new functions.https.HttpsError("not-found", "School not found.");
  }

  if (schoolDoc.data().status !== "active") {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Cannot create admin for inactive school.",
    );
  }

  try {
    // Check if email already exists
    const existingUser = await admin
      .auth()
      .getUserByEmail(email)
      .catch(() => null);
    if (existingUser) {
      throw new functions.https.HttpsError(
        "already-exists",
        "A user with this email already exists.",
      );
    }

    // Generate a temporary password
    const tempPassword = Math.random().toString(36).slice(-12) + "Aa1!";

    // Create Auth user
    const userRecord = await admin.auth().createUser({
      email,
      password: tempPassword,
      displayName: fullName,
    });

    // Create user document
    const userData = {
      fullName: fullName.trim(),
      email: email.trim(),
      role: "school_admin",
      schoolId,
      status: "active",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await admin
      .firestore()
      .collection("users")
      .doc(userRecord.uid)
      .set(userData);

    // Send password reset email
    const resetLink = await admin.auth().generatePasswordResetLink(email);

    console.log(
      `School admin created successfully: ${userRecord.uid} for school ${schoolId}`,
    );
    return {
      uid: userRecord.uid,
      resetLink,
      message:
        "School admin created successfully. Password reset link generated.",
    };
  } catch (error) {
    console.error("Error creating school admin:", error);
    if (
      error.code === "already-exists" ||
      error.code === "not-found" ||
      error.code === "failed-precondition"
    ) {
      throw error; // Re-throw specific errors
    }
    throw new functions.https.HttpsError(
      "internal",
      "Failed to create school admin",
      error.message,
    );
  }
});

exports.trackStudentsCount = functions.firestore
  .document("students/{studentId}")
  .onWrite(async (change, context) => {
    const before = change.before.exists ? change.before.data() : null;
    const after = change.after.exists ? change.after.data() : null;
    const beforeSchoolId = before?.schoolId || null;
    const afterSchoolId = after?.schoolId || null;

    const updates = [];

    const applyDelta = async (schoolId, delta) => {
      if (!schoolId || delta === 0) return;
      const schoolRef = admin.firestore().collection("schools").doc(schoolId);
      await admin.firestore().runTransaction(async (tx) => {
        const snap = await tx.get(schoolRef);
        if (!snap.exists) return;
        const current = Number(snap.data().studentsCount || 0);
        const next = Math.max(0, current + delta);
        tx.set(schoolRef, { studentsCount: next }, { merge: true });
      });
    };

    if (!before && after) {
      updates.push(applyDelta(afterSchoolId, 1));
    } else if (before && !after) {
      updates.push(applyDelta(beforeSchoolId, -1));
    } else if (before && after && beforeSchoolId !== afterSchoolId) {
      updates.push(applyDelta(beforeSchoolId, -1));
      updates.push(applyDelta(afterSchoolId, 1));
    }

    await Promise.all(updates);
    return null;
  });

exports.deleteSchool = functions.https.onCall(async (data, context) => {
  // Check if user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated.",
    );
  }

  // Check if user is super admin
  const callerId = context.auth.uid;
  const callerDoc = await admin
    .firestore()
    .collection("users")
    .doc(callerId)
    .get();
  if (!callerDoc.exists || callerDoc.data().role !== "super_admin") {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only super admins can delete schools.",
    );
  }

  const db = admin.firestore();
  const schoolId = normalizeSchoolId(data?.schoolId);

  if (!schoolId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "schoolId is required.",
    );
  }

  // Verify school exists
  const schoolDoc = await db.collection("schools").doc(schoolId).get();
  if (!schoolDoc.exists) {
    throw new functions.https.HttpsError("not-found", "School not found.");
  }

  const schoolData = schoolDoc.data();
  console.log(`Starting deletion of school: ${schoolId} (${schoolData.name})`);

  let deletedUsers = 0;
  const deletedDocs = {};
  const batchSize = DEFAULT_BATCH_SIZE; // Stay under Firestore batch limit

  try {
    // 1. Find and delete all users associated with this school
    const usersSnapshot = await db
      .collection("users")
      .where("schoolId", "==", schoolId)
      .get();

    const userDeletions = [];
    const firestoreUserDeletions = [];

    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      const uid = userDoc.id;

      // Add to Firestore deletions
      firestoreUserDeletions.push(uid);

      // Delete Auth user for school admins and teachers
      if (userData.role === "school_admin" || userData.role === "teacher") {
        userDeletions.push(admin.auth().deleteUser(uid));
      }
    }

    // Execute Auth user deletions in parallel (batched)
    if (userDeletions.length > 0) {
      const authDeletionResults = await Promise.allSettled(userDeletions);
      const failedAuthDeletions = authDeletionResults.filter(
        (result) => result.status === "rejected",
      );
      console.log(`Deleted ${userDeletions.length} Auth users`);
      if (failedAuthDeletions.length > 0) {
        console.warn(
          `Failed to delete ${failedAuthDeletions.length} Auth users for school ${schoolId}`,
        );
      }
    }

    // Delete user documents from Firestore
    if (firestoreUserDeletions.length > 0) {
      const userBatches = [];
      for (let i = 0; i < firestoreUserDeletions.length; i += batchSize) {
        const batch = db.batch();
        const batchUids = firestoreUserDeletions.slice(i, i + batchSize);

        for (const uid of batchUids) {
          batch.delete(db.collection("users").doc(uid));
        }

        userBatches.push(batch.commit());
      }

      await Promise.all(userBatches);
      deletedUsers = firestoreUserDeletions.length;
      console.log(`Deleted ${deletedUsers} user documents`);
    }

    // 2. Delete school-scoped root collections
    const rootCollectionsToDelete = [
      "students",
      "classes",
      "attendance",
      "assessments",
      "teacher_attendance",
      "notices",
      "student_remarks",
      "student_skills",
      "admin_remarks",
      "admin_notifications",
      "timetables",
      "class_subjects",
      "fees",
      "student_ledgers",
      "payments",
      "backups",
      "activity_logs",
      "activityLogs",
      "analyticsEvents",
    ];
    const rootDeletedDocs = await deleteSchoolScopedCollections(
      db,
      schoolId,
      rootCollectionsToDelete,
      batchSize,
    );
    Object.assign(deletedDocs, rootDeletedDocs);

    // 3. Delete settings document for this school
    const settingsRef = db.collection("settings").doc(schoolId);
    const settingsSnap = await settingsRef.get();
    if (settingsSnap.exists) {
      await settingsRef.delete();
      deletedDocs.settings = 1;
    } else {
      deletedDocs.settings = 0;
    }
    console.log(`Deleted ${deletedDocs.settings} documents from settings`);

    // 4. Finally, delete school doc and all nested subcollections
    await deleteSchoolDocumentTree(db, schoolId);
    console.log(`Deleted school document tree: ${schoolId}`);

    return {
      success: true,
      deletedUsers,
      deletedDocs,
      message: `School and all associated data deleted successfully`,
    };
  } catch (error) {
    console.error("Error deleting school:", error);
    if (
      error.code === "already-exists" ||
      error.code === "not-found" ||
      error.code === "failed-precondition"
    ) {
      throw error; // Re-throw specific errors
    }
    throw new functions.https.HttpsError(
      "internal",
      "Failed to delete school",
      error.message,
    );
  }
});

exports.resetTermData = functions.https.onCall(async (data, context) => {
  // Check if the user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated.",
    );
  }

  // Check if the user is a school admin or super admin and resolve school scope
  const db = admin.firestore();
  const userId = context.auth.uid;
  const userDoc = await db.collection("users").doc(userId).get();
  if (!userDoc.exists) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only admins can perform this action.",
    );
  }

  const callerData = userDoc.data();
  const callerRole = callerData.role;
  const callerSchoolId = normalizeSchoolId(callerData.schoolId);
  const requestedSchoolId = normalizeSchoolId(data?.schoolId);

  let targetSchoolId = "";
  if (callerRole === "school_admin") {
    if (!callerSchoolId) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Your admin profile is missing schoolId.",
      );
    }
    if (requestedSchoolId && requestedSchoolId !== callerSchoolId) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "School admins can only reset term data for their own school.",
      );
    }
    targetSchoolId = callerSchoolId;
  } else if (callerRole === "super_admin") {
    if (!requestedSchoolId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "schoolId is required for super admins.",
      );
    }
    targetSchoolId = requestedSchoolId;
  } else {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only admins can perform this action.",
    );
  }

  const schoolDoc = await db.collection("schools").doc(targetSchoolId).get();
  if (!schoolDoc.exists) {
    throw new functions.https.HttpsError("not-found", "School not found.");
  }

  const collectionsToDelete = [
    "attendance",
    "assessments",
    "teacher_attendance",
    "notices",
    "student_remarks",
    "admin_remarks",
    "student_skills",
    "admin_notifications",
  ];

  try {
    // Delete term-related records for this school only
    const deletedDocs = await deleteSchoolScopedCollections(
      db,
      targetSchoolId,
      collectionsToDelete,
      100,
    );

    // Reset scoped school config (settings/{schoolId})
    const schoolConfigRef = db.collection("settings").doc(targetSchoolId);
    await schoolConfigRef.set(
      {
        schoolReopenDate: "",
        vacationDate: "",
        nextTermBegins: "",
      },
      { merge: true },
    );

    console.log(`Term data reset successfully for school ${targetSchoolId}.`);
    return {
      success: true,
      schoolId: targetSchoolId,
      deletedDocs,
      message: "Term data has been successfully reset for the selected school.",
    };
  } catch (error) {
    console.error("Error resetting term data:", error);
    throw new functions.https.HttpsError(
      "internal",
      error.message,
      error.stack,
    );
  }
});

// Callable function to create a teacher account
exports.createTeacherAccount = functions.https.onCall(async (data, context) => {
  // 1. Auth check
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated.",
    );
  }

  // 2. Only school_admin or super_admin can call
  const callerId = context.auth.uid;
  const callerDoc = await admin
    .firestore()
    .collection("users")
    .doc(callerId)
    .get();
  if (!callerDoc.exists) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Caller account not found.",
    );
  }

  const callerRole = callerDoc.data().role;
  if (callerRole !== "school_admin" && callerRole !== "super_admin") {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only school_admin or super_admin can create teachers.",
    );
  }

  // 3. Determine schoolId (caller's schoolId or explicit schoolId for super_admin)
  let callerSchoolId = callerDoc.data().schoolId;
  if (callerRole === "super_admin" && data.schoolId) {
    // Super admin can explicitly specify schoolId
    callerSchoolId = data.schoolId;
  }
  if (!callerSchoolId) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Unable to determine school. Your account may be missing a schoolId.",
    );
  }

  // 3. Validate input
  const { fullName, email, password } = data;
  if (!fullName || !email) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "fullName and email are required.",
    );
  }

  // 4. Validate password if provided
  if (password && password.length < 6) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Password must be at least 6 characters long.",
    );
  }
  const existingUser = await admin
    .auth()
    .getUserByEmail(email)
    .catch(() => null);
  if (existingUser) {
    throw new functions.https.HttpsError(
      "already-exists",
      "A user with this email already exists.",
    );
  }

  try {
    // 5. Create Auth user with password (admin-provided or generated temp)
    let authPassword;
    let sendResetEmail = true;

    if (password) {
      // Admin provided a password - use it and don't send reset email
      authPassword = password;
      sendResetEmail = false;
    } else {
      // Generate a temporary password
      authPassword = Math.random().toString(36).slice(-12) + "Aa1!";
      sendResetEmail = true;
    }

    const userRecord = await admin.auth().createUser({
      email,
      password: authPassword,
      displayName: fullName,
    });

    // 6. Create Firestore user doc
    const userData = {
      fullName: fullName.trim(),
      email: email.trim(),
      role: "teacher",
      schoolId: callerSchoolId,
      status: "active",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await admin
      .firestore()
      .collection("users")
      .doc(userRecord.uid)
      .set(userData);

    // 7. Send password reset email only if using generated temp password
    let resetLink = null;
    if (sendResetEmail) {
      resetLink = await admin.auth().generatePasswordResetLink(email);
    }

    // 8. Log activity
    await admin.firestore().collection("activityLogs").add({
      eventType: "teacher_created",
      schoolId: callerSchoolId,
      createdBy: callerId,
      teacherUid: userRecord.uid,
      email,
      fullName,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      teacherUid: userRecord.uid,
      tempPassword: authPassword, // Return the password used (admin-provided or generated)
      resetLink,
      message: "Teacher account created successfully.",
    };
  } catch (error) {
    console.error("Error creating teacher account:", error);
    throw new functions.https.HttpsError(
      "internal",
      error.message || "Failed to create teacher account.",
    );
  }
});

/**
 * Repair existing teacher accounts by adding missing schoolId
 * Only school_admin (for their own school) or super_admin can call
 */
exports.repairUserSchoolId = functions.https.onCall(async (data, context) => {
  // 1. Auth check
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated.",
    );
  }

  // 2. Only school_admin or super_admin can call
  const callerId = context.auth.uid;
  const callerDoc = await admin
    .firestore()
    .collection("users")
    .doc(callerId)
    .get();
  if (!callerDoc.exists) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Caller account not found.",
    );
  }

  const callerRole = callerDoc.data().role;
  const callerSchoolId = callerDoc.data().schoolId;
  if (callerRole !== "school_admin" && callerRole !== "super_admin") {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only school_admin or super_admin can repair accounts.",
    );
  }

  // 3. Validate input
  const { targetUid, schoolId } = data;
  if (!targetUid) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "targetUid is required.",
    );
  }

  // 4. Determine schoolId to assign
  let assignSchoolId = schoolId;
  if (!assignSchoolId) {
    // If not provided, use caller's schoolId
    if (callerRole === "school_admin") {
      assignSchoolId = callerSchoolId;
    } else {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "schoolId is required for super_admin.",
      );
    }
  }

  // 5. Permission check: school_admin can only repair teachers in their own school
  if (callerRole === "school_admin" && assignSchoolId !== callerSchoolId) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "You can only repair teachers in your own school.",
    );
  }

  try {
    // 6. Load target user
    const targetUserDoc = await admin
      .firestore()
      .collection("users")
      .doc(targetUid)
      .get();

    if (!targetUserDoc.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Target user not found.",
      );
    }

    const targetUserData = targetUserDoc.data();
    if (targetUserData.role !== "teacher") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Target user is not a teacher.",
      );
    }

    // 7. Update user with schoolId
    await admin.firestore().collection("users").doc(targetUid).update({
      schoolId: assignSchoolId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 8. Log activity
    await admin.firestore().collection("activityLogs").add({
      eventType: "teacher_repair_schoolid",
      schoolId: assignSchoolId,
      repairedBy: callerId,
      teacherUid: targetUid,
      email: targetUserData.email,
      fullName: targetUserData.fullName,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      message: `Teacher account repaired. schoolId set to ${assignSchoolId}`,
    };
  } catch (error) {
    console.error("Error repairing user schoolId:", error);
    // If it's already an HttpsError, re-throw it
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    // Otherwise, wrap it in an HttpsError with details
    throw new functions.https.HttpsError(
      "internal",
      `Failed to repair user account: ${error.message || error.toString()}`,
    );
  }
});
