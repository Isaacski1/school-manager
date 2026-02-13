const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

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

async function deleteCollection(db, collectionPath, batchSize) {
  const collectionRef = db.collection(collectionPath);
  const query = collectionRef.orderBy("__name__").limit(batchSize);

  return new Promise((resolve, reject) => {
    deleteQueryBatch(db, query, resolve, reject);
  });
}

async function deleteQueryBatch(db, query, resolve, reject) {
  const snapshot = await query.get();

  const batchSize = snapshot.size;
  if (batchSize === 0) {
    // When there are no documents left, we are done
    resolve();
    return;
  }

  // Delete documents in a batch
  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  await batch.commit();

  // Recurse on the next process tick, to avoid
  // exploding the stack.
  process.nextTick(() => {
    deleteQueryBatch(db, query, resolve, reject);
  });
}

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

  const { schoolId } = data;

  if (!schoolId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "schoolId is required.",
    );
  }

  // Verify school exists
  const schoolDoc = await admin
    .firestore()
    .collection("schools")
    .doc(schoolId)
    .get();
  if (!schoolDoc.exists) {
    throw new functions.https.HttpsError("not-found", "School not found.");
  }

  const schoolData = schoolDoc.data();
  console.log(`Starting deletion of school: ${schoolId} (${schoolData.name})`);

  let deletedUsers = 0;
  const deletedDocs = {};
  const batchSize = 400; // Stay under 500 limit

  try {
    // 1. Find and delete all users associated with this school
    const usersSnapshot = await admin
      .firestore()
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
      await Promise.allSettled(userDeletions);
      console.log(`Deleted ${userDeletions.length} Auth users`);
    }

    // Delete user documents from Firestore
    if (firestoreUserDeletions.length > 0) {
      const userBatches = [];
      for (let i = 0; i < firestoreUserDeletions.length; i += batchSize) {
        const batch = admin.firestore().batch();
        const batchUids = firestoreUserDeletions.slice(i, i + batchSize);

        for (const uid of batchUids) {
          batch.delete(admin.firestore().collection("users").doc(uid));
        }

        userBatches.push(batch.commit());
      }

      await Promise.all(userBatches);
      deletedUsers = firestoreUserDeletions.length;
      console.log(`Deleted ${deletedUsers} user documents`);
    }

    // 2. Delete school-scoped collections
    const collectionsToDelete = [
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
      "settings", // Special case: settings/{schoolId}
    ];

    for (const collectionName of collectionsToDelete) {
      let deletedCount = 0;

      if (collectionName === "settings") {
        // Settings is stored as settings/{schoolId}
        try {
          await admin.firestore().collection("settings").doc(schoolId).delete();
          deletedCount = 1;
        } catch (error) {
          // Document might not exist, continue
          console.log(
            `Settings document ${schoolId} not found or already deleted`,
          );
        }
      } else {
        // Query documents where schoolId == schoolId
        const query = admin
          .firestore()
          .collection(collectionName)
          .where("schoolId", "==", schoolId);

        const snapshot = await query.get();
        const docIds = snapshot.docs.map((doc) => doc.id);

        if (docIds.length > 0) {
          // Delete in batches
          for (let i = 0; i < docIds.length; i += batchSize) {
            const batch = admin.firestore().batch();
            const batchDocIds = docIds.slice(i, i + batchSize);

            for (const docId of batchDocIds) {
              batch.delete(
                admin.firestore().collection(collectionName).doc(docId),
              );
            }

            await batch.commit();
            deletedCount += batchDocIds.length;
          }
        }
      }

      deletedDocs[collectionName] = deletedCount;
      console.log(`Deleted ${deletedCount} documents from ${collectionName}`);
    }

    // 3. Finally, delete the school document itself
    await admin.firestore().collection("schools").doc(schoolId).delete();
    console.log(`Deleted school document: ${schoolId}`);

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

  // Check if the user is a school admin or super admin
  const userId = context.auth.uid;
  const userDoc = await admin.firestore().collection("users").doc(userId).get();
  if (
    !userDoc.exists ||
    (userDoc.data().role !== "school_admin" &&
      userDoc.data().role !== "super_admin")
  ) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only admins can perform this action.",
    );
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
    // Delete collections
    for (const collectionPath of collectionsToDelete) {
      console.log(`Deleting collection: ${collectionPath}`);
      await deleteCollection(admin.firestore(), collectionPath, 100);
    }

    // Reset school config
    const schoolConfigRef = admin
      .firestore()
      .collection("settings")
      .doc("schoolConfig");
    await schoolConfigRef.set(
      {
        schoolReopenDate: "",
        vacationDate: "",
        nextTermBegins: "",
      },
      { merge: true },
    );

    console.log("Term data reset successfully.");
    return { success: true, message: "Term data has been successfully reset." };
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
