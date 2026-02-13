import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import admin from "firebase-admin";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import rateLimit from "express-rate-limit";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env.local") });
dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();
app.use(cors());

const REQUEST_LIMIT = process.env.REQUEST_BODY_LIMIT || "1mb";
app.use(
  express.json({
    limit: REQUEST_LIMIT,
    verify: (req, res, buf) => {
      req.rawBody = buf.toString();
    },
  }),
);

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: "Too many requests from this IP. Please wait and try again later.",
  },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: "Too many authentication attempts. Please wait and try again later.",
  },
});

app.use("/api/", apiLimiter);

// --- Robust Firebase Admin SDK Initialization ---

let serviceAccount;
const normalizeServiceAccount = (account) => {
  if (account && typeof account.private_key === "string") {
    account.private_key = account.private_key.replace(/\\n/g, "\n");
  }
  return account;
};
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    const resolvedPath = path.resolve(
      process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
    );
    const rawJson = fs.readFileSync(resolvedPath, "utf8");
    serviceAccount = normalizeServiceAccount(JSON.parse(rawJson));
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    let rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY.trim();
    if (
      (rawKey.startsWith('"') && rawKey.endsWith('"')) ||
      (rawKey.startsWith("'") && rawKey.endsWith("'"))
    ) {
      rawKey = rawKey.slice(1, -1);
    }
    let parsedKey = JSON.parse(rawKey);
    if (typeof parsedKey === "string") {
      parsedKey = JSON.parse(parsedKey);
    }
    serviceAccount = normalizeServiceAccount(parsedKey);
  } else {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_SERVICE_ACCOUNT_KEY is not set in the environment.",
    );
  }
} catch (error) {
  console.error("CRITICAL: Failed to parse Firebase Service Account Key.");
  console.error(
    "Set FIREBASE_SERVICE_ACCOUNT_PATH to the JSON file path or FIREBASE_SERVICE_ACCOUNT_KEY to a valid JSON string.",
  );
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
    req.userIp =
      (req.headers["x-forwarded-for"] || "").toString().split(",")[0].trim() ||
      req.socket?.remoteAddress ||
      null;
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

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "";
const PAYSTACK_PLAN_CODE = process.env.PAYSTACK_PLAN_CODE || "";
const PAYSTACK_CALLBACK_URL = process.env.PAYSTACK_CALLBACK_URL || "";
const APP_VERSION = process.env.APP_VERSION || "1.0.0";
const APP_ENV = process.env.APP_ENV || "development";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

const buildAiSystemPrompt = (dataContext) => {
  const base = `You are the Super Admin AI assistant for School Manager GH.
You can propose admin actions, but you must NEVER execute them yourself.
When you want an action, return JSON with {"reply": "...", "action": {"type": "...", "description": "...", "payload": {...}}}.
If no action, return JSON with {"reply": "..."}.
Allowed action types:
- create_school: payload { name, plan, phone?, address?, logoUrl? }
- create_school_admin: payload { schoolId, fullName, email, password? }
- reset_school_admin_password: payload { adminUid }
- provision_user: payload { uid, role, schoolId?, fullName, email }
Use clear, short descriptions in "description".
Never include secrets or API keys. Do not fabricate data. If data is missing, ask for it in reply.
Always respond in JSON only.`;

  if (!dataContext) return base;
  return `${base}\n\nDATA_CONTEXT:\n${JSON.stringify(dataContext)}`;
};

const buildAiDataContext = async () => {
  const schoolsSnap = await admin
    .firestore()
    .collection("schools")
    .orderBy("createdAt", "desc")
    .limit(200)
    .get();
  const schools = schoolsSnap.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() || {}),
  }));

  const activitySnap = await admin
    .firestore()
    .collection("activity_logs")
    .orderBy("createdAt", "desc")
    .limit(50)
    .get();
  const activity = activitySnap.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() || {}),
  }));

  return {
    totals: {
      schools: schools.length,
      activeSchools: schools.filter((s) => s.status === "active").length,
      inactiveSchools: schools.filter((s) => s.status === "inactive").length,
    },
    schools,
    recentActivity: activity,
  };
};

const parseAiResponse = (rawText) => {
  if (!rawText) {
    return { reply: "I could not generate a response." };
  }
  try {
    const parsed = JSON.parse(rawText);
    if (parsed && typeof parsed.reply === "string") return parsed;
    return { reply: rawText };
  } catch (error) {
    return { reply: rawText };
  }
};

const paystackRequest = async (endpoint, method, body) => {
  if (!PAYSTACK_SECRET_KEY) {
    throw new Error("PAYSTACK_SECRET_KEY is not set in the environment.");
  }
  const response = await fetch(`https://api.paystack.co${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.message || "Paystack request failed");
  }
  return data;
};

const verifyPaystackTransaction = async (reference) => {
  if (!reference) {
    throw new Error("Payment reference is required for verification.");
  }
  return paystackRequest(`/transaction/verify/${reference}`, "GET");
};

const updateSchoolBilling = async (schoolId, updates) => {
  await admin
    .firestore()
    .collection("schools")
    .doc(schoolId)
    .set(
      {
        billing: {
          ...(updates.billing || {}),
        },
        plan: updates.plan || "monthly",
        planEndsAt: updates.planEndsAt || null,
        status: updates.status || "active",
      },
      { merge: true },
    );
};

const logActivity = async ({
  eventType,
  schoolId = null,
  actorUid = null,
  actorRole = null,
  entityId = null,
  meta = null,
}) => {
  try {
    await admin.firestore().collection("activity_logs").add({
      eventType,
      schoolId,
      actorUid,
      actorRole,
      entityId,
      meta,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.warn("Failed to log activity", error?.message || error);
  }
};

const DEFAULT_CLASS_SUBJECTS = {
  c_n1: [
    "Language & Literacy",
    "Numeracy",
    "Environmental Studies",
    "Creative Arts",
    "Physical Development",
    "Social & Emotional Development",
    "Rhymes, Songs & Storytelling",
  ],
  c_n2: [
    "Language & Literacy",
    "Numeracy",
    "Environmental Studies",
    "Creative Arts",
    "Physical Development",
    "Social & Emotional Development",
    "Rhymes, Songs & Storytelling",
  ],
  c_kg1: [
    "Literacy & Language",
    "Numeracy",
    "OWOP",
    "Creative Art",
    "Physical Education",
  ],
  c_kg2: [
    "Literacy & Language",
    "Numeracy",
    "OWOP",
    "Creative Art",
    "Physical Education",
  ],
  c_p1: [
    "English Language",
    "Mathematics",
    "Science",
    "ICT",
    "Religious & Moral Education (RME)",
    "Ghanaian Language",
    "Our World Our People (OWOP)",
    "Creative Arts",
    "Physical Education",
  ],
  c_p2: [
    "English Language",
    "Mathematics",
    "Science",
    "ICT",
    "Religious & Moral Education (RME)",
    "Ghanaian Language",
    "Our World Our People (OWOP)",
    "Creative Arts",
    "Physical Education",
  ],
  c_p3: [
    "English Language",
    "Mathematics",
    "Science",
    "ICT",
    "Religious & Moral Education (RME)",
    "Ghanaian Language",
    "Our World Our People (OWOP)",
    "Creative Arts",
    "Physical Education",
  ],
  c_p4: [
    "English Language",
    "Mathematics",
    "Science",
    "ICT",
    "Religious & Moral Education (RME)",
    "Ghanaian Language",
    "Our World Our People (OWOP)",
    "Creative Arts",
    "Physical Education",
  ],
  c_p5: [
    "English Language",
    "Mathematics",
    "Science",
    "ICT",
    "Religious & Moral Education (RME)",
    "Ghanaian Language",
    "Our World Our People (OWOP)",
    "Creative Arts",
    "Physical Education",
  ],
  c_p6: [
    "English Language",
    "Mathematics",
    "Science",
    "ICT",
    "Religious & Moral Education (RME)",
    "Ghanaian Language",
    "Our World Our People (OWOP)",
    "Creative Arts",
    "Physical Education",
  ],
  c_jhs1: [
    "English Language",
    "Mathematics",
    "Integrated Science",
    "Social Studies",
    "Religious & Moral Education (RME)",
    "ICT",
    "French",
    "Ghanaian Language",
    "Creative Arts & Design",
    "Physical Education",
    "Career Technology",
    "Computing / Coding",
  ],
  c_jhs2: [
    "English Language",
    "Mathematics",
    "Integrated Science",
    "Social Studies",
    "Religious & Moral Education (RME)",
    "ICT",
    "French",
    "Ghanaian Language",
    "Creative Arts & Design",
    "Physical Education",
    "Career Technology",
    "Computing / Coding",
  ],
  c_jhs3: [
    "English Language",
    "Mathematics",
    "Integrated Science",
    "Social Studies",
    "Religious & Moral Education (RME)",
    "ICT",
    "French",
    "Ghanaian Language",
    "Creative Arts & Design",
    "Physical Education",
    "Career Technology",
    "Computing / Coding",
  ],
};

/**
 * Create School
 * POST /api/superadmin/create-school
 */
app.post(
  "/api/superadmin/create-school",
  authLimiter,
  authMiddleware,
  superAdminMiddleware,
  async (req, res) => {
    console.log("Received POST /api/superadmin/create-school");
    console.log("Caller (super_admin):", req.user.email);

    try {
      const {
        name,
        phone,
        address,
        logoUrl,
        plan,
        cloneFromTemplate,
        templateType,
        templateSchoolId,
        planId,
      } = req.body;

      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).json({
          error: "School name is required and must be a non-empty string",
        });
      }

      const validPlans = ["free", "trial", "monthly", "termly", "yearly"];
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

      const now = Date.now();
      const trialEndsAt =
        plan === "trial" ? new Date(now + 30 * 24 * 60 * 60 * 1000) : null;

      const schoolData = {
        schoolId,
        name: name.trim(),
        code: schoolCode,
        phone: phone ? phone.trim() : "",
        address: address ? address.trim() : "",
        logoUrl: logoUrl ? logoUrl.trim() : "",
        status: "active",
        plan,
        planEndsAt: trialEndsAt,
        subscription: planId ? { planId: String(planId) } : {},
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: req.user.uid,
      };

      await schoolRef.set(schoolData);

      const shouldClone = Boolean(cloneFromTemplate);
      let clonedFrom = null;

      if (shouldClone) {
        const settingsRef = admin.firestore().collection("settings");
        const classSubjectsRef = admin.firestore().collection("class_subjects");
        const targetSettingsRef = settingsRef.doc(schoolId);

        const existingSettings = await targetSettingsRef.get();
        if (existingSettings.exists) {
          return res.status(409).json({
            error: "Settings already exist for this school; cloning skipped",
          });
        }

        let sourceSettings = null;
        let sourceLabel = null;

        if (templateType === "school" && templateSchoolId) {
          const sourceSettingsDoc = await settingsRef
            .doc(String(templateSchoolId))
            .get();
          if (!sourceSettingsDoc.exists) {
            return res
              .status(404)
              .json({ error: "Template school settings not found" });
          }
          sourceSettings = sourceSettingsDoc.data();
          sourceLabel = String(templateSchoolId);
        } else {
          const systemTemplateDoc = await settingsRef.doc("default").get();
          sourceSettings = systemTemplateDoc.exists
            ? systemTemplateDoc.data()
            : {
                academicYear: "",
                currentTerm: "Term 1",
                schoolReopenDate: "",
                vacationDate: "",
                nextTermBegins: "",
                termTransitionProcessed: false,
                headTeacherRemark:
                  "An outstanding performance. The school is proud of you.",
                termEndDate: "",
                holidayDates: [],
                gradingScale: { A: 80, B: 70, C: 60, D: 45 },
                positionRule: "total",
              };
          sourceLabel = "default";
        }

        const clonedSettings = {
          ...(sourceSettings || {}),
          schoolId,
          schoolName: name.trim(),
          address: address ? address.trim() : "",
          phone: phone ? phone.trim() : "",
          email: "",
          logoUrl: logoUrl ? logoUrl.trim() : "",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        await targetSettingsRef.set(clonedSettings, { merge: true });

        if (templateType === "school" && templateSchoolId) {
          const sourceSubjectsSnap = await classSubjectsRef
            .where("schoolId", "==", String(templateSchoolId))
            .get();
          if (!sourceSubjectsSnap.empty) {
            const batch = admin.firestore().batch();
            sourceSubjectsSnap.docs.forEach((docSnap) => {
              const data = docSnap.data() || {};
              const classId = data.classId;
              if (!classId) return;
              batch.set(classSubjectsRef.doc(`${schoolId}_${classId}`), {
                schoolId,
                classId,
                subjects: Array.isArray(data.subjects) ? data.subjects : [],
              });
            });
            await batch.commit();
          }
        } else {
          const batch = admin.firestore().batch();
          Object.entries(DEFAULT_CLASS_SUBJECTS).forEach(
            ([classId, subjects]) => {
              batch.set(classSubjectsRef.doc(`${schoolId}_${classId}`), {
                schoolId,
                classId,
                subjects,
              });
            },
          );
          await batch.commit();
        }

        clonedFrom = sourceLabel;
      }

      if (planId) {
        const planDoc = await admin
          .firestore()
          .collection("plans")
          .doc(String(planId))
          .get();
        if (!planDoc.exists) {
          return res.status(400).json({ error: "Invalid planId" });
        }
        const planData = planDoc.data() || {};
        const maxStudents = Number(planData.maxStudents || 0);
        await schoolRef.set(
          {
            limits: { maxStudents },
          },
          { merge: true },
        );
      }

      await logActivity({
        eventType: "school_created",
        schoolId,
        actorUid: req.user.uid,
        actorRole: "super_admin",
        entityId: schoolId,
        meta: {
          name: name.trim(),
          plan,
          ...(clonedFrom ? { clonedFrom } : {}),
        },
      });

      if (clonedFrom) {
        await logActivity({
          eventType: "school_settings_cloned",
          schoolId,
          actorUid: req.user.uid,
          actorRole: "super_admin",
          entityId: schoolId,
          meta: { templateId: clonedFrom },
        });
      }

      console.log(`School created successfully: ${schoolId}`);
      return res.json({
        success: true,
        schoolId,
        code: schoolCode,
        ...(clonedFrom ? { clonedFrom } : {}),
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
 * Log security login events
 * POST /api/security/log-login
 */
app.post("/api/security/log-login", authLimiter, async (req, res) => {
  try {
    const { status, email, errorCode, userAgent } = req.body || {};
    if (!status || !email) {
      return res.status(400).json({ error: "status and email are required" });
    }

    let userDoc = null;
    let userData = null;
    let schoolData = null;

    const userSnap = await admin
      .firestore()
      .collection("users")
      .where("email", "==", String(email).toLowerCase())
      .limit(1)
      .get();
    if (!userSnap.empty) {
      userDoc = userSnap.docs[0];
      userData = userDoc.data();
      if (userData?.schoolId) {
        const schoolDoc = await admin
          .firestore()
          .collection("schools")
          .doc(String(userData.schoolId))
          .get();
        if (schoolDoc.exists) schoolData = schoolDoc.data();
      }
    }

    const ipAddress =
      (req.headers["x-forwarded-for"] || "").toString().split(",")[0].trim() ||
      req.socket?.remoteAddress ||
      null;

    const logRef = admin.firestore().collection("securityLoginLogs").doc();
    await logRef.set({
      userId: userDoc?.id || null,
      name: userData?.fullName || null,
      email: String(email).toLowerCase(),
      role: userData?.role || null,
      schoolId: userData?.schoolId || null,
      schoolName: schoolData?.name || null,
      timestamp: Date.now(),
      userAgent: userAgent || req.headers["user-agent"] || null,
      ipAddress,
      status,
      errorCode: errorCode || null,
    });

    return res.json({ success: true });
  } catch (error) {
    console.error("Failed to log login event", error);
    return res.status(500).json({ error: "Failed to log login event" });
  }
});

/**
 * Create or update a plan
 * POST /api/superadmin/upsert-plan
 */
app.post(
  "/api/superadmin/upsert-plan",
  authLimiter,
  authMiddleware,
  superAdminMiddleware,
  async (req, res) => {
    try {
      const { id, name, maxStudents } = req.body || {};
      if (!id || !name || typeof maxStudents !== "number") {
        return res
          .status(400)
          .json({ error: "id, name, and maxStudents are required" });
      }

      await admin
        .firestore()
        .collection("plans")
        .doc(String(id))
        .set(
          {
            name: String(name).trim(),
            maxStudents: Number(maxStudents),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );

      return res.json({
        success: true,
        id: String(id),
        message: "Plan saved successfully",
      });
    } catch (error) {
      console.error("Error saving plan:", error.message || error);
      return res.status(500).json({
        error: error.message || "Failed to save plan",
      });
    }
  },
);

/**
 * Update school plan assignment
 * POST /api/superadmin/update-school-plan
 */
app.post(
  "/api/superadmin/update-school-plan",
  authLimiter,
  authMiddleware,
  superAdminMiddleware,
  async (req, res) => {
    try {
      const { schoolId, planId } = req.body || {};
      if (!schoolId || !planId) {
        return res
          .status(400)
          .json({ error: "schoolId and planId are required" });
      }

      const planDoc = await admin
        .firestore()
        .collection("plans")
        .doc(String(planId))
        .get();

      if (!planDoc.exists) {
        return res.status(400).json({ error: "Invalid planId" });
      }

      const planData = planDoc.data() || {};
      const maxStudents = Number(planData.maxStudents || 0);

      await admin
        .firestore()
        .collection("schools")
        .doc(String(schoolId))
        .set(
          {
            subscription: { planId: String(planId) },
            limits: { maxStudents },
          },
          { merge: true },
        );

      return res.json({
        success: true,
        message: "School plan updated successfully",
      });
    } catch (error) {
      console.error("Error updating school plan:", error.message || error);
      return res.status(500).json({
        error: error.message || "Failed to update school plan",
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
  authLimiter,
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

      await logActivity({
        eventType: "school_admin_created",
        schoolId: schoolId.trim(),
        actorUid: req.user.uid,
        actorRole: "super_admin",
        entityId: userRecord.uid,
        meta: { email: email.trim(), fullName: fullName.trim() },
      });

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
 * Super Admin AI chat (read + propose actions)
 * POST /api/superadmin/ai-chat
 */
app.post(
  "/api/superadmin/ai-chat",
  authLimiter,
  authMiddleware,
  superAdminMiddleware,
  async (req, res) => {
    try {
      if (!OPENAI_API_KEY) {
        return res
          .status(500)
          .json({ error: "OPENAI_API_KEY is not set in the environment." });
      }

      const { messages } = req.body;
      if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "messages array is required" });
      }

      const dataContext = await buildAiDataContext();
      const systemPrompt = buildAiSystemPrompt(dataContext);

      const payload = {
        model: OPENAI_MODEL,
        temperature: 0.2,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
      };

      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );

      const data = await response.json();
      if (!response.ok) {
        return res.status(500).json({
          error: data?.error?.message || "OpenAI request failed",
        });
      }

      const content = data?.choices?.[0]?.message?.content || "";
      const parsed = parseAiResponse(content);

      await logActivity({
        eventType: "superadmin_ai_chat",
        schoolId: null,
        actorUid: req.user.uid,
        actorRole: "super_admin",
        entityId: null,
        meta: {
          promptCount: messages.length,
          actionType: parsed?.action?.type || null,
        },
      });

      return res.json({
        reply: parsed.reply || "",
        action: parsed.action || null,
      });
    } catch (error) {
      console.error("AI chat error:", error.message || error);
      return res.status(500).json({ error: error.message || "AI chat failed" });
    }
  },
);

/**
 * Super Admin AI action confirmation executor
 * POST /api/superadmin/ai-action
 */
app.post(
  "/api/superadmin/ai-action",
  authLimiter,
  authMiddleware,
  superAdminMiddleware,
  async (req, res) => {
    try {
      const { action } = req.body || {};
      if (!action || !action.type) {
        return res.status(400).json({ error: "action.type is required" });
      }

      const payload = action.payload || {};

      switch (action.type) {
        case "create_school": {
          const { name, phone, address, logoUrl, plan } = payload;
          if (!name || typeof name !== "string" || name.trim().length === 0) {
            return res.status(400).json({
              error: "School name is required and must be a non-empty string",
            });
          }

          const validPlans = ["free", "trial", "monthly", "termly", "yearly"];
          if (!validPlans.includes(plan)) {
            return res.status(400).json({ error: "Invalid plan type" });
          }

          const baseCode = name
            .replace(/[^a-zA-Z0-9]/g, "")
            .toUpperCase()
            .substring(0, 6);
          let schoolCode = baseCode;
          let counter = 1;

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

          const now = Date.now();
          const trialEndsAt =
            plan === "trial" ? new Date(now + 30 * 24 * 60 * 60 * 1000) : null;

          const schoolData = {
            schoolId,
            name: name.trim(),
            code: schoolCode,
            phone: phone ? phone.trim() : "",
            address: address ? address.trim() : "",
            logoUrl: logoUrl ? logoUrl.trim() : "",
            status: "active",
            plan,
            planEndsAt: trialEndsAt,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            createdBy: req.user.uid,
          };

          await schoolRef.set(schoolData);

          await logActivity({
            eventType: "school_created",
            schoolId,
            actorUid: req.user.uid,
            actorRole: "super_admin",
            entityId: schoolId,
            meta: { name: name.trim(), plan },
          });

          await logActivity({
            eventType: "superadmin_ai_action_confirmed",
            schoolId: null,
            actorUid: req.user.uid,
            actorRole: "super_admin",
            entityId: schoolId,
            meta: { actionType: action.type },
          });

          return res.json({
            success: true,
            schoolId,
            code: schoolCode,
            message: "School created successfully",
          });
        }
        case "create_school_admin": {
          const { schoolId, fullName, email, password } = payload;

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

          const authPassword = password
            ? password
            : Math.random().toString(36).slice(-12) + "Aa1!";

          if (password && password.length < 6) {
            return res
              .status(400)
              .json({ error: "Password must be at least 6 characters long" });
          }

          const userRecord = await admin.auth().createUser({
            email: email.trim(),
            password: authPassword,
            displayName: fullName.trim(),
          });

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

          await logActivity({
            eventType: "school_admin_created",
            schoolId: schoolId.trim(),
            actorUid: req.user.uid,
            actorRole: "super_admin",
            entityId: userRecord.uid,
            meta: { email: email.trim(), fullName: fullName.trim() },
          });

          await logActivity({
            eventType: "superadmin_ai_action_confirmed",
            schoolId: schoolId.trim(),
            actorUid: req.user.uid,
            actorRole: "super_admin",
            entityId: userRecord.uid,
            meta: { actionType: action.type },
          });

          return res.json({
            success: true,
            uid: userRecord.uid,
            email: email.trim(),
            message: "School admin created successfully",
          });
        }
        case "reset_school_admin_password": {
          const { adminUid } = payload;
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

          await logActivity({
            eventType: "school_admin_password_reset",
            schoolId: null,
            actorUid: req.user.uid,
            actorRole: "super_admin",
            entityId: adminUid,
            meta: { email: userRecord.email },
          });

          await logActivity({
            eventType: "superadmin_ai_action_confirmed",
            schoolId: null,
            actorUid: req.user.uid,
            actorRole: "super_admin",
            entityId: adminUid,
            meta: { actionType: action.type },
          });

          return res.json({
            success: true,
            email: userRecord.email,
            resetLink,
            message: "Password reset link generated successfully",
          });
        }
        case "provision_user": {
          const { uid, role, schoolId, fullName, email } = payload;
          if (!uid || !role || !fullName || !email) {
            return res.status(400).json({
              error: "Missing required fields: uid, role, fullName, email",
            });
          }

          try {
            await admin.auth().getUser(uid);
          } catch (error) {
            return res.status(404).json({
              error: "User not found in Firebase Auth",
            });
          }

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

          const userData = {
            fullName: fullName.trim(),
            email: email.trim(),
            role: role.trim(),
            ...(schoolId && { schoolId: schoolId.trim() }),
            status: "active",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          };

          await admin.firestore().collection("users").doc(uid).set(userData);

          await logActivity({
            eventType: "user_provisioned",
            schoolId: schoolId || null,
            actorUid: req.user.uid,
            actorRole: "super_admin",
            entityId: uid,
            meta: { role, email: email.trim(), fullName: fullName.trim() },
          });

          await logActivity({
            eventType: "superadmin_ai_action_confirmed",
            schoolId: schoolId || null,
            actorUid: req.user.uid,
            actorRole: "super_admin",
            entityId: uid,
            meta: { actionType: action.type },
          });

          return res.json({
            success: true,
            uid,
            message: "User profile provisioned successfully",
          });
        }
        default:
          return res.status(400).json({ error: "Unknown action type" });
      }
    } catch (error) {
      console.error("AI action error:", error.message || error);
      return res
        .status(500)
        .json({ error: error.message || "AI action failed" });
    }
  },
);

/**
 * Initialize Paystack subscription for school admin
 * POST /api/billing/initiate
 */
app.post(
  "/api/billing/initiate",
  authLimiter,
  authMiddleware,
  schoolAdminMiddleware,
  async (req, res) => {
    try {
      const { uid, email } = req.user;
      const { amount, currency = "GHS", metadata = {} } = req.body;

      const userDoc = await admin
        .firestore()
        .collection("users")
        .doc(uid)
        .get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: "User profile not found" });
      }

      const userData = userDoc.data();
      const schoolId = userData.schoolId;
      if (!schoolId) {
        return res.status(400).json({ error: "School not linked to admin" });
      }

      const schoolDoc = await admin
        .firestore()
        .collection("schools")
        .doc(schoolId)
        .get();
      if (!schoolDoc.exists) {
        return res.status(404).json({ error: "School not found" });
      }

      const reference = `sch_${schoolId}_${Date.now()}`;
      const payload = {
        email: email || userData.email,
        amount,
        currency,
        reference,
        callback_url: PAYSTACK_CALLBACK_URL || undefined,
        metadata: {
          schoolId,
          adminUid: uid,
          reference,
          ...metadata,
        },
      };

      const response = await paystackRequest(
        "/transaction/initialize",
        "POST",
        payload,
      );

      await admin
        .firestore()
        .collection("payments")
        .doc(reference)
        .set(
          {
            reference,
            amount,
            currency,
            status: "pending",
            schoolId,
            schoolName: schoolDoc.data()?.name || "",
            adminUid: uid,
            adminEmail: email || userData.email || "",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );

      await logActivity({
        eventType: "billing_initiated",
        schoolId,
        actorUid: uid,
        actorRole: "school_admin",
        entityId: reference,
        meta: { amount, currency, reference },
      });

      await admin
        .firestore()
        .collection("schools")
        .doc(schoolId)
        .set(
          {
            billing: {
              ...(PAYSTACK_PLAN_CODE ? { planCode: PAYSTACK_PLAN_CODE } : {}),
              reference,
              status: "pending",
            },
          },
          { merge: true },
        );

      res.json({
        authorizationUrl: response.data.authorization_url,
        reference: response.data.reference,
      });
    } catch (error) {
      console.error("Billing initiate error:", error.message);
      res.status(500).json({ error: error.message });
    }
  },
);

/**
 * Verify and backfill a payment status by reference
 * POST /api/billing/verify
 */
app.post(
  "/api/billing/verify",
  authLimiter,
  authMiddleware,
  schoolAdminMiddleware,
  async (req, res) => {
    try {
      const { reference } = req.body;
      if (!reference) {
        return res.status(400).json({ error: "reference is required" });
      }

      const paymentDoc = await admin
        .firestore()
        .collection("payments")
        .doc(reference)
        .get();

      if (!paymentDoc.exists) {
        return res.status(404).json({ error: "Payment not found" });
      }

      const paymentData = paymentDoc.data();
      const schoolId = paymentData?.schoolId;

      if (!schoolId || schoolId !== req.callerDoc.schoolId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const verification = await verifyPaystackTransaction(reference);
      const data = verification?.data || {};
      const mappedStatus = String(data.status || "pending");

      await admin
        .firestore()
        .collection("payments")
        .doc(reference)
        .set(
          {
            status: mappedStatus,
            paidAt: data.paid_at ? new Date(data.paid_at).getTime() : null,
            gatewayResponse: data.gateway_response || null,
            channel: data.channel || null,
            reference,
            schoolId,
            verifiedAt: Date.now(),
          },
          { merge: true },
        );

      if (mappedStatus === "success") {
        await admin
          .firestore()
          .collection("schools")
          .doc(schoolId)
          .set(
            {
              billing: {
                status: "active",
                customerCode: data.customer?.customer_code || null,
                subscriptionCode: data.subscription?.subscription_code || null,
                email: data.customer?.email || null,
                lastPaymentAt: Date.now(),
              },
              plan: "monthly",
              status: "active",
            },
            { merge: true },
          );

        await logActivity({
          eventType: "billing_verified_success",
          schoolId,
          actorUid: req.user.uid,
          actorRole: "school_admin",
          entityId: reference,
          meta: { status: mappedStatus },
        });
      }

      if (["failed", "abandoned"].includes(mappedStatus)) {
        await admin
          .firestore()
          .collection("schools")
          .doc(schoolId)
          .set(
            {
              billing: { status: "past_due" },
            },
            { merge: true },
          );

        await logActivity({
          eventType: "billing_verified_failed",
          schoolId,
          actorUid: req.user.uid,
          actorRole: "school_admin",
          entityId: reference,
          meta: { status: mappedStatus },
        });
      }

      return res.json({
        success: true,
        status: mappedStatus,
        reference,
      });
    } catch (error) {
      console.error("Billing verify error:", error.message);
      return res.status(500).json({ error: error.message });
    }
  },
);

/**
 * Paystack webhook
 * POST /api/billing/webhook
 */
app.post("/api/billing/webhook", async (req, res) => {
  try {
    if (!PAYSTACK_SECRET_KEY) {
      return res.status(500).send("Paystack not configured");
    }

    const signature = req.headers["x-paystack-signature"];
    const hash = crypto
      .createHmac("sha512", PAYSTACK_SECRET_KEY)
      .update(req.rawBody || "")
      .digest("hex");

    if (hash !== signature) {
      return res.status(401).send("Invalid signature");
    }

    const event = req.body;
    const data = event?.data || {};
    const metadata = data?.metadata || {};
    const schoolId = metadata.schoolId;
    const paymentReference = data?.reference || metadata?.reference;

    if (!schoolId) {
      return res.status(200).send("No schoolId on webhook metadata");
    }

    if (event.event === "charge.success") {
      const subscription = data.subscription || {};
      if (paymentReference) {
        await admin
          .firestore()
          .collection("payments")
          .doc(paymentReference)
          .set(
            {
              status: "success",
              paidAt: Date.now(),
              gatewayResponse: data.gateway_response || null,
              channel: data.channel || null,
              event: event.event,
              reference: paymentReference,
              schoolId,
            },
            { merge: true },
          );
      }
      await admin
        .firestore()
        .collection("schools")
        .doc(schoolId)
        .set(
          {
            billing: {
              status: "active",
              customerCode: data.customer?.customer_code || null,
              subscriptionCode: subscription.subscription_code || null,
              email: data.customer?.email || null,
              lastPaymentAt: Date.now(),
            },
            plan: "monthly",
            status: "active",
          },
          { merge: true },
        );

      await logActivity({
        eventType: "billing_webhook_success",
        schoolId,
        actorUid: null,
        actorRole: "system",
        entityId: paymentReference,
        meta: { reference: paymentReference, event: event.event },
      });
    }

    if (
      event.event === "subscription.disable" ||
      event.event === "invoice.payment_failed"
    ) {
      if (paymentReference) {
        await admin.firestore().collection("payments").doc(data.reference).set(
          {
            status: "failed",
            failedAt: Date.now(),
            event: event.event,
            reference: paymentReference,
            schoolId,
          },
          { merge: true },
        );
      }
      await admin
        .firestore()
        .collection("schools")
        .doc(schoolId)
        .set(
          {
            billing: { status: "past_due" },
          },
          { merge: true },
        );

      await logActivity({
        eventType: "billing_webhook_failed",
        schoolId,
        actorUid: null,
        actorRole: "system",
        entityId: paymentReference,
        meta: { reference: paymentReference, event: event.event },
      });
    }

    if (paymentReference && data?.status) {
      await admin
        .firestore()
        .collection("payments")
        .doc(paymentReference)
        .set(
          {
            status: String(data.status),
            event: event.event || null,
            reference: paymentReference,
            schoolId,
          },
          { merge: true },
        );
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("Webhook error:", error.message);
    res.status(500).send("Webhook error");
  }
});

/**
 * Reset School Admin Password
 * POST /api/superadmin/reset-school-admin-password
 */
app.post(
  "/api/superadmin/reset-school-admin-password",
  authLimiter,
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

      await logActivity({
        eventType: "school_admin_password_reset",
        schoolId: null,
        actorUid: req.user.uid,
        actorRole: "super_admin",
        entityId: adminUid,
        meta: { email: userRecord.email },
      });

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
 * Update School Admin Email
 * POST /api/superadmin/update-school-admin-email
 */
app.post(
  "/api/superadmin/update-school-admin-email",
  authLimiter,
  authMiddleware,
  superAdminMiddleware,
  async (req, res) => {
    console.log("Received POST /api/superadmin/update-school-admin-email");
    console.log("Caller (super_admin):", req.user.email);

    try {
      const { adminUid, newEmail, fullName } = req.body;

      if (!adminUid || !newEmail) {
        return res
          .status(400)
          .json({ error: "adminUid and newEmail are required" });
      }

      const trimmedEmail = String(newEmail).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
        return res.status(400).json({ error: "Invalid email address" });
      }

      const userRecord = await admin.auth().getUser(adminUid);

      if (!userRecord) {
        return res.status(404).json({ error: "Admin user not found" });
      }

      if (userRecord.email && userRecord.email !== trimmedEmail) {
        try {
          const existing = await admin.auth().getUserByEmail(trimmedEmail);
          if (existing.uid !== adminUid) {
            return res
              .status(400)
              .json({ error: "A user with this email already exists" });
          }
        } catch (error) {
          if (error.code !== "auth/user-not-found") {
            throw error;
          }
        }
      }

      await admin.auth().updateUser(adminUid, {
        email: trimmedEmail,
        ...(fullName ? { displayName: String(fullName).trim() } : {}),
      });

      const userDocRef = admin.firestore().collection("users").doc(adminUid);
      await userDocRef.set(
        {
          email: trimmedEmail,
          ...(fullName ? { fullName: String(fullName).trim() } : {}),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      await logActivity({
        eventType: "school_admin_email_updated",
        schoolId: null,
        actorUid: req.user.uid,
        actorRole: "super_admin",
        entityId: adminUid,
        meta: { email: trimmedEmail },
      });

      return res.json({
        success: true,
        email: trimmedEmail,
        message: "Admin email updated successfully",
      });
    } catch (error) {
      console.error("Error updating admin email:", error.message || error);
      return res.status(500).json({
        error: error.message || "Failed to update admin email",
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
  authLimiter,
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

      await logActivity({
        eventType: "user_provisioned",
        schoolId: schoolId || null,
        actorUid: req.user.uid,
        actorRole: "super_admin",
        entityId: uid,
        meta: { role, email: email.trim(), fullName: fullName.trim() },
      });

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
  authLimiter,
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
      await logActivity({
        eventType: "teacher_created",
        schoolId: callerSchoolId,
        actorUid: callerId,
        actorRole: "school_admin",
        entityId: userRecord.uid,
        meta: { email: email.trim(), fullName: fullName.trim() },
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
app.get("/", (req, res) => {
  res.send("School Manager GH Backend is running ✅");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/version", (req, res) => {
  res.json({
    version: APP_VERSION,
    environment: APP_ENV,
    timestamp: new Date().toISOString(),
  });
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
