const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Callable function to create a teacher account
exports.createTeacherAccount = functions.https.onCall(async (data, context) => {
  // 1. Auth check
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated.",
    );
  }

  // 2. Only school_admin can call
  const callerId = context.auth.uid;
  const callerDoc = await admin
    .firestore()
    .collection("users")
    .doc(callerId)
    .get();
  if (!callerDoc.exists || callerDoc.data().role !== "school_admin") {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only school_admin can create teachers.",
    );
  }
  const callerSchoolId = callerDoc.data().schoolId;
  if (!callerSchoolId) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Your admin account is missing a schoolId.",
    );
  }

  // 3. Validate input
  const { fullName, email } = data;
  if (!fullName || !email) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "fullName and email are required.",
    );
  }

  // 4. Check if email already exists
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

  // 5. Create Auth user with temp password
  const tempPassword = Math.random().toString(36).slice(-12) + "Aa1!";
  const userRecord = await admin.auth().createUser({
    email,
    password: tempPassword,
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
  await admin.firestore().collection("users").doc(userRecord.uid).set(userData);

  // 7. Send password reset email
  await admin.auth().generatePasswordResetLink(email);

  // 8. Log activity (optional)
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
    tempPassword,
    teacherUid: userRecord.uid,
    message: "Teacher account created. Password reset link sent.",
  };
});
