import express from "express";
import admin from "firebase-admin";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// --- Robust Firebase Admin SDK Initialization ---

let serviceAccount;
try {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_KEY is not set in the environment.",
    );
  }
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
} catch (error) {
  console.error("CRITICAL: Failed to parse Firebase Service Account Key.");
  console.error("Ensure FIREBASE_SERVICE_ACCOUNT_KEY is a valid JSON string.");
  console.error("Original Error:", error.message);
  process.exit(1);
}

if (!serviceAccount.project_id) {
  console.error(
    "CRITICAL: Service Account JSON is invalid or missing 'project_id'.",
  );
  process.exit(1);
}

try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  const cred = admin.app().options.credential;
  console.log("✅ Firebase Admin SDK initialized successfully.");
  console.log("   Project ID:", admin.app().options.projectId);
  if (cred && cred.constructor.name === "ServiceAccountCredential") {
    console.log("   Credential Type: Service Account (Explicit)");
  } else {
    console.warn(
      "   Credential Type: Unknown or Application Default Credentials",
    );
  }
} catch (error) {
  console.error("CRITICAL: Firebase Admin SDK initialization failed.");
  console.error("Original Error:", error.message);
  process.exit(1);
}

/**
 * Middleware: Verify Firebase ID token
 */
async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ error: "Unauthorized: Missing Authorization header" });
  }

  const idToken = authHeader.split(" ")[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error("Token verification error:", error.code, error.message);
    if (error.code === "auth/id-token-expired") {
      return res.status(401).json({
        code: "ID_TOKEN_EXPIRED",
        message: "ID token has expired. Please refresh and try again.",
      });
    }
    return res.status(403).json({ error: "Forbidden: Invalid token" });
  }
}

/**
 * Middleware: Check for super_admin role
 */
async function superAdminMiddleware(req, res, next) {
  const { uid } = req.user;
  try {
    const callerDoc = await admin
      .firestore()
      .collection("users")
      .doc(uid)
      .get();

    if (callerDoc.exists && callerDoc.data().role === "super_admin") {
      next();
    } else {
      res.status(403).json({
        error: "Forbidden: Only super admins can perform this action",
      });
    }
  } catch (error) {
    console.error("Error checking super admin role:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * Create School
 * POST /api/superadmin/create-school
 */
app.post(
  "/api/superadmin/create-school",
  authMiddleware,
  superAdminMiddleware,
  async (req, res) => {
    console.log("Received POST /api/superadmin/create-school");
    console.log("Caller (super_admin):", req.user.email);

    try {
      const { name, phone, address, logoUrl, plan } = req.body;

      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).json({
          error: "School name is required and must be a non-empty string",
        });
      }

      const validPlans = ["trial", "monthly", "termly", "yearly"];
      if (!validPlans.includes(plan)) {
        return res.status(400).json({ error: "Invalid plan type" });
      }

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
          schoolCode = `${baseCode}${Math.floor(Math.random() * 1000)}`;
        }
      }

      const schoolRef = admin.firestore().collection("schools").doc();
      const schoolId = schoolRef.id;

      const schoolData = {
        schoolId,
        name: name.trim(),
        code: schoolCode,
        phone: phone ? phone.trim() : "",
        address: address ? address.trim() : "",
        logoUrl: logoUrl ? logoUrl.trim() : "",
        status: "active",
        plan,
        planEndsAt: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: req.user.uid,
      };

      await schoolRef.set(schoolData);

      console.log(`School created successfully: ${schoolId}`);
      return res.json({
        success: true,
        schoolId,
        code: schoolCode,
        message: "School created successfully",
      });
    } catch (error) {
      console.error("Error creating school:", error.message);
      return res.status(500).json({
        error: error.message || "Failed to create school",
      });
    }
  },
);

/**
 * Create School Admin
 * POST /api/superadmin/create-school-admin
 */
app.post(
  "/api/superadmin/create-school-admin",
  authMiddleware,
  superAdminMiddleware,
  async (req, res) => {
    console.log("Received POST /api/superadmin/create-school-admin");
    console.log("Caller (super_admin):", req.user.email);

    try {
      const { schoolId, fullName, email, password } = req.body;

      // Validate input
      if (!schoolId || !fullName || !email) {
        return res.status(400).json({
          error: "Missing required fields: schoolId, fullName, email",
        });
      }

      const schoolDoc = await admin
        .firestore()
        .collection("schools")
        .doc(schoolId.trim())
        .get();

      if (!schoolDoc.exists) {
        return res.status(404).json({ error: "School not found" });
      }

      if (schoolDoc.data().status !== "active") {
        return res
          .status(400)
          .json({ error: "Cannot create admin for inactive school" });
      }

      // Check if email already exists
      try {
        await admin.auth().getUserByEmail(email);
        return res
          .status(400)
          .json({ error: "A user with this email already exists" });
      } catch (error) {
        if (error.code !== "auth/user-not-found") {
          throw error;
        }
      }

      // Determine password
      const authPassword = password
        ? password
        : Math.random().toString(36).slice(-12) + "Aa1!";

      if (password && password.length < 6) {
        return res
          .status(400)
          .json({ error: "Password must be at least 6 characters long" });
      }

      // Create Auth user
      const userRecord = await admin.auth().createUser({
        email: email.trim(),
        password: authPassword,
        displayName: fullName.trim(),
      });

      console.log("Auth user created for school admin, uid:", userRecord.uid);

      // Create Firestore document
      const userData = {
        fullName: fullName.trim(),
        email: email.trim(),
        role: "school_admin",
        schoolId: schoolId.trim(),
        status: "active",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      await admin
        .firestore()
        .collection("users")
        .doc(userRecord.uid)
        .set(userData);

      console.log("Firestore profile created for school admin");

      // Generate password reset link when password not provided
      const resetLink = password
        ? null
        : await admin.auth().generatePasswordResetLink(email);

      return res.json({
        success: true,
        uid: userRecord.uid,
        email: userRecord.email,
        ...(resetLink && { resetLink }),
        message: "School admin created successfully",
      });
    } catch (error) {
      console.error("Error creating school admin:", error.message);
      return res.status(500).json({
        error: error.message || "Failed to create school admin",
      });
    }
  },
);

/**
 * Reset School Admin Password
 * POST /api/superadmin/reset-school-admin-password
 */
app.post(
  "/api/superadmin/reset-school-admin-password",
  authMiddleware,
  superAdminMiddleware,
  async (req, res) => {
    console.log("Received POST /api/superadmin/reset-school-admin-password");
    console.log("Caller (super_admin):", req.user.email);

    try {
      const { adminUid } = req.body;

      if (!adminUid) {
        return res.status(400).json({ error: "adminUid is required" });
      }

      const userRecord = await admin.auth().getUser(adminUid);
      if (!userRecord.email) {
        return res.status(400).json({ error: "Admin email not found" });
      }

      const resetLink = await admin
        .auth()
        .generatePasswordResetLink(userRecord.email);

      return res.json({
        success: true,
        email: userRecord.email,
        resetLink,
        message: "Password reset link generated successfully",
      });
    } catch (error) {
      console.error("Error resetting admin password:", error.message);
      return res.status(500).json({
        error: error.message || "Failed to reset admin password",
      });
    }
  },
);

/**
 * Provision Missing User Profile
 * POST /api/superadmin/provision-user
 * For backfilling existing Auth-only users with Firestore profiles
 */
app.post(
  "/api/superadmin/provision-user",
  authMiddleware,
  superAdminMiddleware,
  async (req, res) => {
    console.log("Received POST /api/superadmin/provision-user");
    console.log("Caller (super_admin):", req.user.email);

    try {
      const { uid, role, schoolId, fullName, email } = req.body;

      // Validate input
      if (!uid || !role || !fullName || !email) {
        return res.status(400).json({
          error: "Missing required fields: uid, role, fullName, email",
        });
      }

      // Verify the user exists in Firebase Auth
      try {
        await admin.auth().getUser(uid);
      } catch (error) {
        return res.status(404).json({
          error: "User not found in Firebase Auth",
        });
      }

      // Check if Firestore doc already exists
      const existingDoc = await admin
        .firestore()
        .collection("users")
        .doc(uid)
        .get();

      if (existingDoc.exists) {
        return res.status(400).json({
          error: "User profile already exists in Firestore",
        });
      }

      // Create Firestore document
      const userData = {
        fullName: fullName.trim(),
        email: email.trim(),
        role: role.trim(),
        ...(schoolId && { schoolId: schoolId.trim() }),
        status: "active",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      await admin.firestore().collection("users").doc(uid).set(userData);

      console.log(`Firestore profile created for user ${uid}`);

      return res.json({
        success: true,
        uid,
        message: "User profile provisioned successfully",
      });
    } catch (error) {
      console.error("Error provisioning user:", error.message);
      return res.status(500).json({
        error: error.message || "Failed to provision user",
      });
    }
  },
);

/**
 * Middleware: Check for school_admin or super_admin role
 */
async function schoolAdminMiddleware(req, res, next) {
  const { uid } = req.user;
  try {
    const callerDoc = await admin
      .firestore()
      .collection("users")
      .doc(uid)
      .get();

    if (!callerDoc.exists) {
      return res.status(403).json({
        error:
          "Forbidden: Your admin account is not provisioned. Contact your Super Admin.",
      });
    }

    const { role, schoolId } = callerDoc.data();

    if (role !== "school_admin") {
      res.status(403).json({
        error: "Forbidden: Only school admins can perform this action",
      });
      return;
    }

    if (!schoolId) {
      res.status(400).json({
        error:
          "Your admin profile is missing schoolId. Please contact support.",
      });
      return;
    }

    req.callerDoc = callerDoc.data();
    next();
  } catch (error) {
    console.error("Error checking admin role:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * Create Teacher Account
 * POST /api/createTeacher
 */
app.post(
  "/api/createTeacher",
  authMiddleware,
  schoolAdminMiddleware,
  async (req, res) => {
    console.log("Received /api/createTeacher request from", req.user.email);

    try {
      const { fullName, email, password, assignedClassIds } = req.body;
      const callerId = req.user.uid;
      const callerSchoolId = req.callerDoc.schoolId;

      // Validate input
      if (!fullName || !email) {
        return res
          .status(400)
          .json({ error: "Missing required fields: fullName, email" });
      }

      if (!callerSchoolId) {
        return res.status(400).json({
          error:
            "Your admin profile is missing schoolId. Please contact support.",
        });
      }

      // Check if email already exists
      try {
        await admin.auth().getUserByEmail(email);
        return res
          .status(400)
          .json({ error: "A user with this email already exists" });
      } catch (error) {
        if (error.code !== "auth/user-not-found") {
          throw error;
        }
      }

      // Validate password if provided
      if (password && password.length < 6) {
        return res
          .status(400)
          .json({ error: "Password must be at least 6 characters long" });
      }

      // Determine password and whether to send reset email
      const authPassword =
        password || Math.random().toString(36).slice(-12) + "Aa1!";
      const sendResetEmail = !password;

      // Create Auth user
      const userRecord = await admin.auth().createUser({
        email: email.trim(),
        password: authPassword,
        displayName: fullName.trim(),
      });

      console.log("Auth user created with uid:", userRecord.uid);

      // Create Firestore document
      const userData = {
        fullName: fullName.trim(),
        email: email.trim(),
        role: "teacher",
        schoolId: callerSchoolId,
        assignedClassIds: Array.isArray(assignedClassIds)
          ? assignedClassIds
          : [],
        status: "active",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      await admin
        .firestore()
        .collection("users")
        .doc(userRecord.uid)
        .set(userData);

      // Generate password reset link if needed
      let resetLink = null;
      if (sendResetEmail) {
        resetLink = await admin.auth().generatePasswordResetLink(email);
      }

      // Log activity
      await admin.firestore().collection("activityLogs").add({
        eventType: "teacher_created",
        schoolId: callerSchoolId,
        createdBy: callerId,
        teacherUid: userRecord.uid,
        email: email.trim(),
        fullName: fullName.trim(),
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Return success
      res.json({
        success: true,
        teacherUid: userRecord.uid,
        ...(sendResetEmail && { resetLink }),
        message: "Teacher account created successfully",
      });
    } catch (error) {
      console.error("Error creating teacher:", error);
      res.status(500).json({
        error: error.message || "Failed to create teacher account",
      });
    }
  },
);

/**
 * Health check endpoint
 */
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
