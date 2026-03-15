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
app.disable("x-powered-by");
app.set("trust proxy", 1);

const LOCAL_DEV_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

const normalizeOriginValue = (value) => String(value || "").trim().replace(/\/$/, "");

const collectOrigins = (...values) =>
  values
    .flatMap((value) =>
      typeof value === "string" ? value.split(",") : [],
    )
    .map((value) => normalizeOriginValue(value))
    .filter(Boolean);

const configuredOrigins = collectOrigins(
  process.env.CORS_ALLOWED_ORIGINS,
  process.env.CLIENT_URL,
  process.env.FRONTEND_URL,
  process.env.APP_URL,
  process.env.PUBLIC_APP_URL,
  process.env.SITE_URL,
  process.env.VITE_FRONTEND_URL,
  process.env.VITE_SITE_URL,
);

const allowedOrigins = new Set([
  ...LOCAL_DEV_ORIGINS.map((origin) => normalizeOriginValue(origin)),
  ...configuredOrigins.filter((origin) => !origin.includes("*")),
]);

const wildcardOriginPatterns = configuredOrigins.filter((origin) =>
  origin.includes("*"),
);

const escapeRegex = (value) =>
  String(value || "").replace(/[|\\{}()[\]^$+?.]/g, "\\$&");

const wildcardToRegex = (pattern) => {
  const escaped = escapeRegex(pattern).replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
};

const wildcardOriginRegexes = wildcardOriginPatterns.map(wildcardToRegex);

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  const normalizedOrigin = normalizeOriginValue(origin);
  if (allowedOrigins.has(normalizedOrigin)) return true;
  return wildcardOriginRegexes.some((regex) => regex.test(normalizedOrigin));
};

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!isAllowedOrigin(origin)) {
    return res.status(403).json({
      error:
        "Forbidden: Request origin is not allowed. Configure CORS_ALLOWED_ORIGINS for this deployment.",
    });
  }
  next();
});

app.use(
  cors({
    origin(origin, callback) {
      callback(null, isAllowedOrigin(origin));
    },
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Authorization",
      "Content-Type",
      "X-Requested-With",
      "X-Paystack-Signature",
    ],
    optionsSuccessStatus: 204,
  }),
);

app.use((req, res, next) => {
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");

  const forwardedProto = (req.headers["x-forwarded-proto"] || "")
    .toString()
    .split(",")[0]
    .trim();
  if (req.secure || forwardedProto === "https") {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }

  next();
});

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

const firebaseProjectId =
  serviceAccount.project_id ||
  process.env.FIREBASE_PROJECT_ID ||
  process.env.GCLOUD_PROJECT ||
  "";
if (firebaseProjectId) {
  allowedOrigins.add(`https://${firebaseProjectId}.web.app`);
  allowedOrigins.add(`https://${firebaseProjectId}.firebaseapp.com`);
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
  console.log("   Allowed browser origins:", Array.from(allowedOrigins));
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

/**
 * Resolve current user's admin MFA policy status.
 * GET /api/auth/admin-mfa-policy
 */
app.get(
  "/api/auth/admin-mfa-policy",
  authLimiter,
  authMiddleware,
  async (req, res) => {
    try {
      const uid = trimToString(req.user?.uid, 120);
      if (!uid) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const callerDoc = await admin.firestore().collection("users").doc(uid).get();
      const callerData = callerDoc.exists ? callerDoc.data() || {} : {};
      const role = trimToString(callerData.role, 40).toLowerCase() || null;

      const settingsDoc = await admin
        .firestore()
        .collection("platformSecuritySettings")
        .doc("2fa")
        .get();
      const settings = settingsDoc.exists ? settingsDoc.data() || {} : {};

      const enforcementModeRaw = trimToString(
        settings.enforcementMode || "optional",
        24,
      ).toLowerCase();
      const enforcementMode = ["off", "optional", "required"].includes(
        enforcementModeRaw,
      )
        ? enforcementModeRaw
        : "optional";

      const enabledForSuperAdmins = Boolean(settings.enabledForSuperAdmins);
      const enabledForSchoolAdmins = Boolean(settings.enabledForSchoolAdmins);
      const appliesTo =
        (role === "super_admin" && enabledForSuperAdmins) ||
        (role === "school_admin" && enabledForSchoolAdmins);
      const required = appliesTo && enforcementMode === "required";

      const userRecord = await admin.auth().getUser(uid);
      const enrolledFactors = Array.isArray(
        userRecord?.multiFactor?.enrolledFactors,
      )
        ? userRecord.multiFactor.enrolledFactors
        : [];
      const enrolledFactorsCount = enrolledFactors.length;
      const compliant = !required || enrolledFactorsCount > 0;

      const message =
        required && !compliant
          ? "Admin MFA policy requires MFA enrollment for your role. Enroll at least one second factor before signing in."
          : "Admin MFA policy check passed.";

      return res.json({
        success: true,
        role,
        enforcementMode,
        enabledForSuperAdmins,
        enabledForSchoolAdmins,
        appliesTo,
        required,
        enrolledFactorsCount,
        compliant,
        message,
      });
    } catch (error) {
      console.error("Admin MFA policy status error:", error.message || error);
      return res
        .status(500)
        .json({ error: error.message || "Failed to resolve MFA policy" });
    }
  },
);

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "";
const PAYSTACK_PLAN_CODE = process.env.PAYSTACK_PLAN_CODE || "";
const PAYSTACK_CALLBACK_URL = process.env.PAYSTACK_CALLBACK_URL || "";
const APP_VERSION = process.env.APP_VERSION || "1.0.0";
const APP_ENV = process.env.APP_ENV || "development";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const SUPER_ADMIN_ASSISTANT_NAME = "Isaacski AI";
const SUPERADMIN_AI_MODE = (
  process.env.SUPERADMIN_AI_MODE || "local_first"
).toLowerCase();
const SUPERADMIN_OPENAI_TIMEOUT_MS = Number(
  process.env.SUPERADMIN_OPENAI_TIMEOUT_MS || 3200,
);
const AI_CONTEXT_CACHE_TTL_MS = Number(
  process.env.SUPERADMIN_AI_CACHE_TTL_MS || 45000,
);
const AI_CONTEXT_CACHE = new Map();
const SUPERADMIN_VIEW_CACHE_TTL_MS = Number(
  process.env.SUPERADMIN_VIEW_CACHE_TTL_MS || 45000,
);
const SUPERADMIN_VIEW_CACHE = new Map();

const buildAiSystemPrompt = (dataContext) => {
  const base = `You are ${SUPER_ADMIN_ASSISTANT_NAME}, the Super Admin assistant for School Manager GH.
You can propose admin actions, but you must NEVER execute them yourself.
When you want an action, return JSON with {"reply": "...", "action": {"type": "...", "description": "...", "payload": {...}}}.
If no action, return JSON with {"reply": "..."}.
Allowed action types:
- create_school: payload { name, plan, phone?, address?, logoUrl? }
- create_school_admin: payload { schoolId, fullName, email, password? }
- update_school_admin_email: payload { adminUid, newEmail, fullName? }
- reset_school_admin_password: payload { adminUid }
- provision_user: payload { uid, role, schoolId?, fullName, email }
- set_school_status: payload { schoolId, status } where status is active|inactive
- set_school_plan: payload { schoolId, plan } where plan is free|trial|monthly|termly|yearly
- set_school_feature_plan: payload { schoolId, featurePlan } where featurePlan is starter|standard
- upsert_plan: payload { id, name, maxStudents }
- delete_plan: payload { id }
- assign_school_subscription_plan: payload { schoolId, planId }
Use clear, short descriptions in "description".
Never include secrets or API keys. Do not fabricate data. If data is missing, ask for it in reply.
Do not claim 100% certainty when information is missing or ambiguous.
Always respond in JSON only.`;

  if (!dataContext) return base;
  return `${base}\n\nDATA_CONTEXT:\n${JSON.stringify(dataContext)}`;
};

const fetchCollectionRows = async ({
  collectionName,
  limitCount = 100,
  orderField = "",
  whereField = "",
  whereOp = "==",
  whereValue = null,
}) => {
  const limitValue = Math.max(1, Number(limitCount) || 1);
  try {
    let ref = admin.firestore().collection(collectionName);
    if (whereField) {
      ref = ref.where(whereField, whereOp, whereValue);
    }
    if (orderField) {
      ref = ref.orderBy(orderField, "desc");
    }
    const snap = await ref.limit(limitValue).get();
    return snap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() || {}),
    }));
  } catch {
    try {
      let fallbackRef = admin.firestore().collection(collectionName);
      if (whereField) {
        fallbackRef = fallbackRef.where(whereField, whereOp, whereValue);
      }
      const fallbackSnap = await fallbackRef
        .limit(Math.min(500, limitValue))
        .get();
      return fallbackSnap.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() || {}),
      }));
    } catch {
      return [];
    }
  }
};

const toPositiveInt = (value, fallback, min = 1, max = 2000) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.floor(parsed);
  if (normalized < min) return min;
  if (normalized > max) return max;
  return normalized;
};

const toBooleanFlag = (value) => {
  const raw = String(value || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
};

const toMillisValue = (value) => {
  const dt = parseFlexibleDate(value);
  return dt ? dt.getTime() : null;
};

const buildSuperAdminViewCacheKey = (scope, uid, query = {}) => {
  const stableQuery = Object.keys(query || {})
    .sort()
    .reduce((acc, key) => {
      const current = query[key];
      if (current === undefined || current === null || current === "") {
        return acc;
      }
      acc[key] = String(current);
      return acc;
    }, {});
  return `${scope}:${uid || "anonymous"}:${JSON.stringify(stableQuery)}`;
};

const getCachedSuperAdminView = (cacheKey) => {
  const cached = SUPERADMIN_VIEW_CACHE.get(cacheKey);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    SUPERADMIN_VIEW_CACHE.delete(cacheKey);
    return null;
  }
  return cached.payload;
};

const setCachedSuperAdminView = (
  cacheKey,
  payload,
  ttlMs = SUPERADMIN_VIEW_CACHE_TTL_MS,
) => {
  SUPERADMIN_VIEW_CACHE.set(cacheKey, {
    payload,
    expiresAt: Date.now() + Math.max(5000, Number(ttlMs) || 0),
  });
};

const clearSuperAdminViewCache = () => {
  SUPERADMIN_VIEW_CACHE.clear();
};

const normalizeSchoolForView = (docId, data = {}) => {
  const planRaw = String(data.plan || "trial").toLowerCase();
  const statusRaw = String(data.status || "active").toLowerCase();
  const validPlan = ["free", "trial", "monthly", "termly", "yearly"].includes(
    planRaw,
  )
    ? planRaw
    : "trial";
  const validStatus = ["active", "inactive"].includes(statusRaw)
    ? statusRaw
    : "active";

  return {
    id: docId,
    name: String(data.name || "Unnamed School").trim() || "Unnamed School",
    code:
      String(data.code || "").trim() || String(docId || "").slice(-6).toUpperCase(),
    logoUrl: String(data.logoUrl || "").trim(),
    phone: String(data.phone || "").trim(),
    address: String(data.address || "").trim(),
    plan: validPlan,
    status: validStatus,
    featurePlan: String(data.featurePlan || "starter").toLowerCase(),
    createdBy: data.createdBy || null,
    createdAt: toMillisValue(data.createdAt),
    planEndsAt: toMillisValue(data.planEndsAt),
    studentsCount: Number(data.studentsCount || 0) || 0,
    limits: data.limits || {},
    billing: data.billing || {},
    subscription: data.subscription || {},
  };
};

const normalizePaymentForView = (docId, data = {}) => ({
  id: docId,
  schoolId: String(data.schoolId || "").trim() || null,
  schoolName: String(data.schoolName || "").trim() || "Unknown School",
  adminEmail: String(data.adminEmail || "").trim() || null,
  amount: Number(data.amount ?? data.amountPaid ?? 0) || 0,
  currency: String(data.currency || "GHS").trim() || "GHS",
  status: String(data.status || "pending").trim() || "pending",
  reference: String(data.reference || "").trim() || null,
  createdAt: toMillisValue(data.createdAt ?? data.paidAt ?? data.verifiedAt),
  module: String(data.module || "billing"),
  type: String(data.type || "subscription"),
  category: String(data.category || "subscription"),
  paymentMethod:
    String(data.paymentMethod || data.method || data.channel || "").trim() || null,
});

const listCollectionPage = async ({
  collectionName,
  orderField = "createdAt",
  direction = "desc",
  cursorDocId = "",
  limitCount = 50,
}) => {
  const db = admin.firestore();
  const pageSize = toPositiveInt(limitCount, 50, 1, 250);
  const dir = String(direction).toLowerCase() === "asc" ? "asc" : "desc";
  const cursorId = String(cursorDocId || "").trim();

  const buildPrimaryQuery = async () => {
    let ref = db.collection(collectionName).orderBy(orderField, dir);
    if (cursorId) {
      const cursorSnap = await db.collection(collectionName).doc(cursorId).get();
      if (cursorSnap.exists) {
        ref = ref.startAfter(cursorSnap);
      }
    }
    return ref.limit(pageSize).get();
  };

  const buildFallbackQuery = async () => {
    let ref = db
      .collection(collectionName)
      .orderBy(admin.firestore.FieldPath.documentId(), dir);
    if (cursorId) {
      ref = ref.startAfter(cursorId);
    }
    return ref.limit(pageSize).get();
  };

  let snap;
  let usedFallback = false;
  try {
    snap = await buildPrimaryQuery();
  } catch (error) {
    usedFallback = true;
    snap = await buildFallbackQuery();
  }

  const items = snap.docs.map((docSnap) => ({
    id: docSnap.id,
    ...(docSnap.data() || {}),
  }));
  const nextCursor =
    snap.size === pageSize ? snap.docs[snap.docs.length - 1]?.id || null : null;

  return {
    items,
    nextCursor,
    hasMore: Boolean(nextCursor),
    pageSize,
    usedFallback,
  };
};

const toLocalDateKey = (date = new Date()) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const normalizeSchoolId = (value) => {
  const schoolId = String(value || "").trim();
  return schoolId || null;
};

const extractUniqueSchoolIds = (rows = []) =>
  new Set(
    rows
      .map((row) => normalizeSchoolId(row?.schoolId))
      .filter((schoolId) => Boolean(schoolId)),
  );

const buildAiDataContext = async (options = {}) => {
  const {
    includeSchools = true,
    includeActivity = false,
    includeSchoolAdmins = false,
    includeUsers = false,
    includePlans = false,
    includePayments = false,
    includeBroadcasts = false,
    includeBackups = false,
    includeSecurityLogs = false,
    includeSuspiciousEvents = false,
    includeAuditLogs = false,
    schoolsLimit = 80,
    activityLimit = 24,
    schoolAdminsLimit = 120,
    usersLimit = 300,
    plansLimit = 120,
    paymentsLimit = 300,
    broadcastsLimit = 80,
    backupsLimit = 120,
    securityLogsLimit = 180,
    suspiciousEventsLimit = 180,
    auditLogsLimit = 220,
    forceRefresh = false,
  } = options || {};

  const cacheKey = JSON.stringify({
    includeSchools,
    includeActivity,
    includeSchoolAdmins,
    includeUsers,
    includePlans,
    includePayments,
    includeBroadcasts,
    includeBackups,
    includeSecurityLogs,
    includeSuspiciousEvents,
    includeAuditLogs,
    schoolsLimit,
    activityLimit,
    schoolAdminsLimit,
    usersLimit,
    plansLimit,
    paymentsLimit,
    broadcastsLimit,
    backupsLimit,
    securityLogsLimit,
    suspiciousEventsLimit,
    auditLogsLimit,
  });

  if (!forceRefresh) {
    const cached = AI_CONTEXT_CACHE.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
  }

  const taskEntries = [];
  const pushTask = (key, promise) => {
    taskEntries.push([key, promise]);
  };

  if (includeSchools) {
    pushTask(
      "schools",
      fetchCollectionRows({
        collectionName: "schools",
        limitCount: schoolsLimit,
        orderField: "createdAt",
      }),
    );
  }

  if (includeActivity) {
    pushTask(
      "recentActivity",
      fetchCollectionRows({
        collectionName: "activity_logs",
        limitCount: activityLimit,
        orderField: "createdAt",
      }),
    );
  }

  if (includeUsers) {
    pushTask(
      "users",
      fetchCollectionRows({
        collectionName: "users",
        limitCount: usersLimit,
        orderField: "createdAt",
      }),
    );
  }

  if (includeSchoolAdmins && !includeUsers) {
    pushTask(
      "schoolAdmins",
      fetchCollectionRows({
        collectionName: "users",
        limitCount: schoolAdminsLimit,
        whereField: "role",
        whereValue: "school_admin",
      }),
    );
  }

  if (includePlans) {
    pushTask(
      "plans",
      fetchCollectionRows({
        collectionName: "plans",
        limitCount: plansLimit,
        orderField: "updatedAt",
      }),
    );
  }

  if (includePayments) {
    pushTask(
      "payments",
      fetchCollectionRows({
        collectionName: "payments",
        limitCount: paymentsLimit,
        orderField: "createdAt",
      }),
    );
  }

  if (includeBroadcasts) {
    pushTask(
      "broadcasts",
      fetchCollectionRows({
        collectionName: "platformBroadcasts",
        limitCount: broadcastsLimit,
        orderField: "createdAt",
      }),
    );
  }

  if (includeBackups) {
    pushTask(
      "backups",
      fetchCollectionRows({
        collectionName: "backups",
        limitCount: backupsLimit,
        orderField: "createdAt",
      }),
    );
  }

  if (includeSecurityLogs) {
    pushTask(
      "securityLoginLogs",
      fetchCollectionRows({
        collectionName: "securityLoginLogs",
        limitCount: securityLogsLimit,
        orderField: "timestamp",
      }),
    );
  }

  if (includeSuspiciousEvents) {
    pushTask(
      "suspiciousEvents",
      fetchCollectionRows({
        collectionName: "suspiciousEvents",
        limitCount: suspiciousEventsLimit,
        orderField: "createdAt",
      }),
    );
  }

  if (includeAuditLogs) {
    pushTask(
      "auditLogs",
      fetchCollectionRows({
        collectionName: "auditLogs",
        limitCount: auditLogsLimit,
        orderField: "timestamp",
      }),
    );
  }

  const resolvedPairs = await Promise.all(
    taskEntries.map(async ([key, promise]) => [key, await promise]),
  );
  const resolved = Object.fromEntries(resolvedPairs);

  const schools = Array.isArray(resolved.schools) ? resolved.schools : [];
  const recentActivity = Array.isArray(resolved.recentActivity)
    ? resolved.recentActivity
    : [];
  const users = Array.isArray(resolved.users) ? resolved.users : [];
  const schoolAdmins = includeSchoolAdmins
    ? includeUsers
      ? users.filter((userDoc) => String(userDoc?.role || "") === "school_admin")
      : Array.isArray(resolved.schoolAdmins)
        ? resolved.schoolAdmins
        : []
    : [];
  const plans = Array.isArray(resolved.plans) ? resolved.plans : [];
  const payments = Array.isArray(resolved.payments) ? resolved.payments : [];
  const broadcasts = Array.isArray(resolved.broadcasts)
    ? resolved.broadcasts
    : [];
  const backups = Array.isArray(resolved.backups) ? resolved.backups : [];
  const securityLoginLogs = Array.isArray(resolved.securityLoginLogs)
    ? resolved.securityLoginLogs
    : [];
  const suspiciousEvents = Array.isArray(resolved.suspiciousEvents)
    ? resolved.suspiciousEvents
    : [];
  const auditLogs = Array.isArray(resolved.auditLogs) ? resolved.auditLogs : [];

  const usersByRole = users.reduce(
    (acc, userDoc) => {
      const roleKey = String(userDoc?.role || "unknown").toLowerCase();
      acc[roleKey] = (acc[roleKey] || 0) + 1;
      return acc;
    },
    {},
  );

  const failedLogins = securityLoginLogs.filter(
    (log) => String(log?.status || "").toUpperCase() === "FAILED",
  ).length;
  const openSuspiciousEvents = suspiciousEvents.filter(
    (row) => String(row?.status || "").toUpperCase() === "OPEN",
  ).length;

  const context = {
    generatedAt: Date.now(),
    totals: {
      schools: schools.length,
      activeSchools: schools.filter((s) => s.status === "active").length,
      inactiveSchools: schools.filter((s) => s.status === "inactive").length,
      users: users.length,
      schoolAdmins: schoolAdmins.length,
      teachers: Number(usersByRole.teacher || 0),
      plans: plans.length,
      payments: payments.length,
      broadcasts: broadcasts.length,
      backups: backups.length,
      failedLogins,
      openSuspiciousEvents,
    },
    schools,
    users,
    schoolAdmins,
    plans,
    recentActivity,
    payments,
    broadcasts,
    backups,
    securityLoginLogs,
    suspiciousEvents,
    auditLogs,
    usersByRole,
  };

  AI_CONTEXT_CACHE.set(cacheKey, {
    value: context,
    expiresAt: Date.now() + Math.max(5000, AI_CONTEXT_CACHE_TTL_MS),
  });

  return context;
};

const detectAiPromptIntents = (prompt = "") => {
  const plainPrompt = String(prompt || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const mentionsInstitution =
    /\b(school|academy|college|campus|institute)\b/.test(plainPrompt);

  const isGreeting =
    /^(hi|hello|hey|good morning|good afternoon|good evening)\b/.test(
      plainPrompt,
    ) ||
    (/\b(hi|hello|hey)\b/.test(plainPrompt) &&
      plainPrompt.split(" ").length <= 4);
  const isSmallTalk =
    isGreeting ||
    /\b(how are you|how are u|how r u|thanks|thank you|thank u|bye|goodbye|see you)\b/.test(
      plainPrompt,
    );
  const asksCapabilities =
    /\b(what can you do|help me|help|capabilities|options|what do you do)\b/.test(
      plainPrompt,
    );
  const asksFinance =
    /\b(profit|gain|revenue|income|earnings|earned|money made|cash flow|cashflow|payment|paid|amount collected|sales)\b/.test(
      plainPrompt,
    );
  const wantsSummary =
    /\b(summary|overview|status|kpi|report|dashboard)\b/.test(plainPrompt) ||
    /\bhow many|count|total schools\b/.test(plainPrompt);
  const wantsSchoolAdminAction =
    /\b(create|add|new)\b/.test(plainPrompt) &&
    /\b(admin|administrator|school admin)\b/.test(plainPrompt);
  const wantsResetPassword =
    /\b(reset|change)\b/.test(plainPrompt) &&
    /\b(password|passcode)\b/.test(plainPrompt);
  const wantsCreateSchool =
    /\b(create|add|new)\b/.test(plainPrompt) && /\bschool\b/.test(plainPrompt);
  const wantsSchoolStatusChange =
    /\b(activate|deactivate|disable|enable|suspend|unsuspend)\b/.test(
      plainPrompt,
    ) && mentionsInstitution;
  const wantsSchoolPlanChange =
    /\b(change|update|switch|move|set)\b/.test(plainPrompt) &&
    /\bplan\b/.test(plainPrompt);
  const wantsSchoolFeaturePlanChange =
    /\b(change|update|switch|move|set)\b/.test(plainPrompt) &&
    (/\bfeature plan\b/.test(plainPrompt) ||
      /\bstarter\b/.test(plainPrompt) ||
      /\bstandard\b/.test(plainPrompt));
  const wantsSchoolAdminEmailChange =
    /\b(change|update|set)\b/.test(plainPrompt) &&
    /\b(admin|administrator|school admin)\b/.test(plainPrompt) &&
    /\bemail\b/.test(plainPrompt);
  const wantsPlanConfigAction =
    /\b(create|add|new|update|edit|set|delete|remove)\b/.test(plainPrompt) &&
    /\bplan\b/.test(plainPrompt) &&
    /\b(max students|max student|student limit|plan key|plan id)\b/.test(
      plainPrompt,
    );
  const wantsSubscriptionPlanAssign =
    /\b(assign|apply|set|update|switch|move|change)\b/.test(plainPrompt) &&
    /\bplan\b/.test(plainPrompt) &&
    mentionsInstitution &&
    /\b(plan id|plan key|configured plan|package)\b/.test(plainPrompt);
  const asksUsers =
    /\b(user|users|admin|admins|teacher|teachers)\b/.test(plainPrompt);
  const asksSecurity =
    /\b(security|failed login|login history|suspicious|audit)\b/.test(
      plainPrompt,
    );
  const asksPlans = /\b(plan|plans|max students|student limit)\b/.test(
    plainPrompt,
  );
  const asksBackups = /\b(backup|backups|restore)\b/.test(plainPrompt);
  const asksBroadcasts =
    /\b(broadcast|announcement|platform message)\b/.test(plainPrompt);
  const asksFreshData =
    /\b(now|today|latest|current|refresh)\b/.test(plainPrompt);

  return {
    plainPrompt,
    isSmallTalk,
    asksCapabilities,
    asksFinance,
    wantsSummary,
    wantsSchoolAdminAction,
    wantsResetPassword,
    wantsCreateSchool,
    wantsSchoolStatusChange,
    wantsSchoolPlanChange,
    wantsSchoolFeaturePlanChange,
    wantsSchoolAdminEmailChange,
    wantsPlanConfigAction,
    wantsSubscriptionPlanAssign,
    asksUsers,
    asksSecurity,
    asksPlans,
    asksBackups,
    asksBroadcasts,
    asksFreshData,
  };
};

const isGenericLocalFallbackReply = (reply = "") => {
  const normalized = String(reply || "").toLowerCase();
  return (
    normalized.includes("didn't fully catch") ||
    normalized.includes("please rephrase with one clear goal")
  );
};

const parseFlexibleDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === "function") {
    const dt = value.toDate();
    return Number.isNaN(dt?.getTime?.()) ? null : dt;
  }
  if (typeof value === "number") {
    const ms = value > 1_000_000_000_000 ? value : value * 1000;
    const dt = new Date(ms);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? null : dt;
};

const normalizeAmount = (amount) => {
  const n = Number(amount || 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n >= 100 ? n / 100 : n;
};

const normalizePaymentStatus = (status = "") => {
  const raw = String(status || "").toLowerCase();
  if (
    raw === "success" ||
    raw === "paid" ||
    raw === "active" ||
    raw.includes("success")
  ) {
    return "success";
  }
  if (
    raw === "pending" ||
    raw === "processing" ||
    raw === "initiated" ||
    raw.includes("pending")
  ) {
    return "pending";
  }
  if (raw.includes("fail") || raw.includes("abandon") || raw === "past_due") {
    return "failed";
  }
  return "pending";
};

const formatGhsCurrency = (value) => {
  const amount = Number.isFinite(value) ? value : 0;
  try {
    return new Intl.NumberFormat("en-GH", {
      style: "currency",
      currency: "GHS",
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `GHS ${amount.toFixed(2)}`;
  }
};

const resolvePeriodRange = (prompt = "") => {
  const lower = String(prompt).toLowerCase();
  const now = new Date();
  const start = new Date(now);

  if (/\btoday\b/.test(lower)) {
    start.setHours(0, 0, 0, 0);
    return { label: "today", start };
  }
  if (/\b(this week|weekly|week)\b/.test(lower)) {
    const day = start.getDay();
    const delta = day === 0 ? 6 : day - 1;
    start.setDate(start.getDate() - delta);
    start.setHours(0, 0, 0, 0);
    return { label: "this week", start };
  }
  if (/\b(this month|monthly|month)\b/.test(lower)) {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    return { label: "this month", start };
  }
  if (/\b(this year|yearly|year)\b/.test(lower)) {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
    return { label: "this year", start };
  }
  return { label: "all time", start: null };
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

const extractEmailFromText = (text = "") => {
  const match = String(text)
    .toLowerCase()
    .match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/);
  return match ? match[0] : "";
};

const extractEmailsFromText = (text = "") => {
  const matches = String(text)
    .toLowerCase()
    .match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g);
  return Array.from(new Set(matches || []));
};

const extractQuotedText = (text = "") => {
  const quoteMatch = String(text).match(/["']([^"']{2,80})["']/);
  return quoteMatch ? quoteMatch[1].trim() : "";
};

const extractAdminNameFromText = (text = "", email = "") => {
  const normalized = String(text).replace(/\s+/g, " ").trim();
  const namePattern =
    /\b(?:named|name is|admin is|for)\s+([A-Za-z][A-Za-z\s'.-]{1,60})/i;
  const namedMatch = normalized.match(namePattern);
  if (namedMatch?.[1]) {
    return namedMatch[1]
      .replace(/\b(with|email|at|for school|in school)\b.*$/i, "")
      .trim();
  }

  if (email) {
    const beforeEmail = normalized
      .replace(email, " ")
      .replace(
        /\b(create|add|new|school|admin|administrator|for|please|an|a)\b/gi,
        " ",
      )
      .replace(/\s+/g, " ")
      .trim();
    if (beforeEmail.split(" ").length >= 2) {
      return beforeEmail;
    }
  }

  return "";
};

const extractPlanFromText = (text = "") => {
  const lower = String(text).toLowerCase();
  if (lower.includes(" yearly")) return "yearly";
  if (lower.includes(" termly")) return "termly";
  if (lower.includes(" monthly")) return "monthly";
  if (lower.includes(" trial")) return "trial";
  if (lower.includes(" free")) return "free";
  return "trial";
};

const extractExplicitPlanFromText = (text = "") => {
  const lower = String(text).toLowerCase();
  if (/\byearly\b/.test(lower)) return "yearly";
  if (/\btermly\b/.test(lower)) return "termly";
  if (/\bmonthly\b/.test(lower)) return "monthly";
  if (/\btrial\b/.test(lower)) return "trial";
  if (/\bfree\b/.test(lower)) return "free";
  return "";
};

const extractFeaturePlanFromText = (text = "") => {
  const lower = String(text).toLowerCase();
  if (/\bstandard\b/.test(lower)) return "standard";
  if (/\bstarter\b/.test(lower)) return "starter";
  return "";
};

const extractPlanIdFromText = (text = "") => {
  const keyedMatch = String(text).match(
    /\b(?:plan key|plan id|key|id)\s*(?:is|=|:)?\s*([a-z0-9][a-z0-9_-]{1,40})\b/i,
  );
  if (keyedMatch?.[1]) return keyedMatch[1].toLowerCase();

  const quoted = extractQuotedText(text);
  if (/^[a-z0-9][a-z0-9_-]{1,40}$/i.test(quoted || "")) {
    return String(quoted).toLowerCase();
  }

  return "";
};

const extractPlanNameFromText = (text = "") => {
  const explicit = String(text).match(
    /\b(?:plan name|name)\s*(?:is|=|:)?\s*["']?([A-Za-z][A-Za-z0-9\s'.&-]{1,80})/i,
  );
  if (explicit?.[1]) {
    return explicit[1]
      .replace(/\b(max students|max student|student limit)\b.*$/i, "")
      .trim();
  }
  const quoted = extractQuotedText(text);
  return quoted || "";
};

const extractMaxStudentsFromText = (text = "") => {
  const explicitMatch = String(text).match(
    /\b(?:max(?:imum)?\s*students?|student\s*limit)\s*(?:is|to|=|:)?\s*(\d{1,7})\b/i,
  );
  if (explicitMatch?.[1]) return Number(explicitMatch[1]);
  const fallbackMatch = String(text).match(/\b(\d{1,7})\s*(?:students?|learners?)\b/i);
  if (fallbackMatch?.[1]) return Number(fallbackMatch[1]);
  return Number.NaN;
};

const buildActionClarificationQuestion = (prompt = "", schools = []) => {
  const lower = String(prompt || "").toLowerCase();
  const sampleSchools = Array.isArray(schools)
    ? schools
        .slice(0, 3)
        .map((school) => school?.name)
        .filter(Boolean)
        .join(", ")
    : "";

  if (/\bplan\b/.test(lower)) {
    return `I can do that. Please confirm three details: school name (or ID), whether you mean subscription plan (free/trial/monthly/termly/yearly) or feature plan (starter/standard), and the target value.${sampleSchools ? ` Example schools: ${sampleSchools}.` : ""}`;
  }

  if (
    /\b(create|add)\b/.test(lower) &&
    /\b(admin|administrator|school admin)\b/.test(lower)
  ) {
    return "I can do that. Please provide: school name (or ID), admin full name, and admin email.";
  }

  if (/\breset\b/.test(lower) && /\bpassword\b/.test(lower)) {
    return "I can do that. Please provide the school admin email, full name, or UID for the password reset.";
  }

  if (
    /\b(activate|deactivate|disable|enable|suspend|unsuspend)\b/.test(lower) &&
    /\bschool\b/.test(lower)
  ) {
    return "I can do that. Please provide the exact school name (or ID) and confirm whether to set it active or inactive.";
  }

  return "I can take action for you, but I need one clear instruction with target details. Example: \"Set Star Academy feature plan to standard\" or \"Deactivate Star Academy school\".";
};

const normalizeText = (value = "") =>
  String(value).toLowerCase().replace(/\s+/g, " ").trim();

const findSchoolFromText = (text = "", schools = []) => {
  if (!Array.isArray(schools) || schools.length === 0) return null;
  const lowerText = normalizeText(text);

  const byId = schools.find((school) => lowerText.includes(String(school.id)));
  if (byId) return byId;

  const quoted = extractQuotedText(text);
  if (quoted) {
    const quotedLower = normalizeText(quoted);
    const exactQuoted = schools.find(
      (school) => normalizeText(school.name) === quotedLower,
    );
    if (exactQuoted) return exactQuoted;
  }

  const byName = schools.find((school) =>
    lowerText.includes(normalizeText(school.name)),
  );
  if (byName) return byName;

  const byCode = schools.find(
    (school) =>
      school.code && lowerText.includes(normalizeText(String(school.code))),
  );
  if (byCode) return byCode;

  if (quoted) {
    const partial = schools.find((school) =>
      normalizeText(school.name).includes(normalizeText(quoted)),
    );
    if (partial) return partial;
  }

  return null;
};

const findSchoolAdminFromText = (text = "", schoolAdmins = []) => {
  if (!Array.isArray(schoolAdmins) || schoolAdmins.length === 0) return null;
  const lowerText = normalizeText(text);
  const email = extractEmailFromText(text);
  if (email) {
    const byEmail = schoolAdmins.find(
      (adminUser) => normalizeText(adminUser.email) === normalizeText(email),
    );
    if (byEmail) return byEmail;
  }

  const byUid = schoolAdmins.find((adminUser) =>
    lowerText.includes(normalizeText(adminUser.id)),
  );
  if (byUid) return byUid;

  const byName = schoolAdmins.find((adminUser) =>
    lowerText.includes(normalizeText(adminUser.fullName)),
  );
  if (byName) return byName;

  return null;
};

const findPlanFromText = (text = "", plans = []) => {
  if (!Array.isArray(plans) || plans.length === 0) return null;
  const lowerText = normalizeText(text);

  const extractedPlanId = extractPlanIdFromText(text);
  if (extractedPlanId) {
    const byId = plans.find(
      (plan) => normalizeText(plan?.id) === normalizeText(extractedPlanId),
    );
    if (byId) return byId;
  }

  const byIdInText = plans.find((plan) =>
    lowerText.includes(normalizeText(plan?.id)),
  );
  if (byIdInText) return byIdInText;

  const quoted = extractQuotedText(text);
  if (quoted) {
    const quotedLower = normalizeText(quoted);
    const byQuotedName = plans.find(
      (plan) => normalizeText(plan?.name) === quotedLower,
    );
    if (byQuotedName) return byQuotedName;
  }

  const byName = plans.find((plan) =>
    lowerText.includes(normalizeText(plan?.name)),
  );
  if (byName) return byName;

  return null;
};

const buildLocalAiResponse = ({ messages = [], dataContext = {} }) => {
  const userMessage = [...messages]
    .reverse()
    .find((message) => message?.role === "user")?.content;

  const prompt = String(userMessage || "").trim();
  const plainPrompt = prompt
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const mentionsInstitution =
    /\b(school|academy|college|campus|institute)\b/.test(plainPrompt);
  const hasActionVerb =
    /\b(create|add|new|update|change|switch|move|set|reset|activate|deactivate|enable|disable|suspend|delete|remove|assign|apply|provision)\b/i.test(
      prompt,
    );
  const schools = Array.isArray(dataContext?.schools) ? dataContext.schools : [];
  const users = Array.isArray(dataContext?.users) ? dataContext.users : [];
  const schoolAdmins = Array.isArray(dataContext?.schoolAdmins)
    ? dataContext.schoolAdmins
    : users.filter((userDoc) => String(userDoc?.role || "") === "school_admin");
  const plans = Array.isArray(dataContext?.plans) ? dataContext.plans : [];
  const broadcasts = Array.isArray(dataContext?.broadcasts)
    ? dataContext.broadcasts
    : [];
  const backups = Array.isArray(dataContext?.backups) ? dataContext.backups : [];
  const securityLoginLogs = Array.isArray(dataContext?.securityLoginLogs)
    ? dataContext.securityLoginLogs
    : [];
  const suspiciousEvents = Array.isArray(dataContext?.suspiciousEvents)
    ? dataContext.suspiciousEvents
    : [];
  const auditLogs = Array.isArray(dataContext?.auditLogs) ? dataContext.auditLogs : [];
  const asOfLabel = dataContext?.generatedAt
    ? new Date(dataContext.generatedAt).toLocaleString()
    : null;
  const totals = dataContext?.totals || {
    schools: schools.length,
    activeSchools: schools.filter((school) => school.status === "active").length,
    inactiveSchools: schools.filter((school) => school.status === "inactive")
      .length,
  };

  if (!prompt) {
    return {
      reply:
        "Ask for a dashboard summary or ask me to prepare actions like creating a school admin.",
      action: null,
    };
  }

  const isGreeting =
    /^(hi|hello|hey|good morning|good afternoon|good evening)\b/.test(
      plainPrompt,
    ) ||
    (/\b(hi|hello|hey)\b/.test(plainPrompt) &&
      plainPrompt.split(" ").length <= 4);
  if (isGreeting) {
    return {
      reply:
        "Hi. How can I help you today? You can ask for a revenue summary, school status, or admin management tasks.",
      action: null,
    };
  }

  if (/\b(how are you|how are u|how r u)\b/.test(plainPrompt)) {
      return {
        reply:
        "I'm ready to help. What would you like to check right now?",
        action: null,
      };
  }

  if (/\b(thanks|thank you|thank u)\b/.test(plainPrompt)) {
    return {
      reply: "You're welcome. If you want, I can continue with the next task.",
      action: null,
    };
  }

  if (/\b(bye|goodbye|see you)\b/.test(plainPrompt)) {
    return {
      reply: "Alright. I'll be here whenever you need help again.",
      action: null,
    };
  }

  const asksCapabilities =
    /\b(what can you do|help me|help|capabilities|options|what do you do)\b/.test(
      plainPrompt,
    );
  if (asksCapabilities) {
    return {
      reply:
        "I can read Super Admin data across schools, users, plans, payments, activity, security, backups, and broadcasts. I can also prepare and execute actions like creating schools/admins, updating admin emails, resetting passwords, provisioning users, changing school status/plans/feature plans, and managing configured plans.",
      action: null,
    };
  }

  if (
    /\b(agent|make changes|do it for me|take action|perform action)\b/.test(
      plainPrompt,
    )
  ) {
    return {
      reply:
        "Yes. I can work as your Super Admin agent: I prepare the exact action, you confirm once, then I execute it. I support school/user/plan operations including create, update, activate/deactivate, assignment, and plan configuration changes.",
      action: null,
    };
  }

  const wantsSummary =
    /\b(summary|overview|status|kpi|report|dashboard)\b/i.test(prompt) ||
    /\bhow many|count|total schools\b/i.test(prompt);
  if (wantsSummary) {
    const activeAdmins = schoolAdmins.filter(
      (adminUser) => adminUser.status === "active",
    ).length;
    const teachersCount = users.filter(
      (userDoc) => String(userDoc?.role || "").toLowerCase() === "teacher",
    ).length;
    return {
      reply: `Current snapshot: ${totals.schools} schools (${totals.activeSchools} active, ${totals.inactiveSchools} inactive), ${schoolAdmins.length} school admin accounts (${activeAdmins} active), ${teachersCount} teachers, and ${plans.length} configured plans.${asOfLabel ? ` Data as of ${asOfLabel}.` : ""}`,
      action: null,
    };
  }

  const asksPlansOverview =
    /\b(plan|plans|max students|student limit|pricing)\b/i.test(prompt) &&
    /\b(list|show|what|which|summary|overview|configured)\b/i.test(prompt) &&
    !hasActionVerb;
  if (asksPlansOverview) {
    if (!plans.length) {
      return {
        reply:
          "No configured plans were found in the plans collection. You can ask me to create one.",
        action: null,
      };
    }

    const topPlans = plans
      .slice(0, 8)
      .map(
        (planDoc) =>
          `${planDoc.name || planDoc.id} (${planDoc.id}) - max students ${Number(planDoc.maxStudents || 0)}`,
      )
      .join("; ");

    return {
      reply: `Configured plans (${plans.length}): ${topPlans}.${asOfLabel ? ` Data as of ${asOfLabel}.` : ""}`,
      action: null,
    };
  }

  const asksUsersOverview =
    /\b(user|users|admin|admins|teacher|teachers)\b/i.test(prompt) &&
    /\b(list|count|how many|summary|overview|active|inactive|status)\b/i.test(
      prompt,
    ) &&
    !hasActionVerb;
  if (asksUsersOverview) {
    const activeUsers = users.filter(
      (userDoc) => String(userDoc?.status || "").toLowerCase() === "active",
    ).length;
    const inactiveUsers = users.filter(
      (userDoc) => String(userDoc?.status || "").toLowerCase() === "inactive",
    ).length;
    const teachersCount = users.filter(
      (userDoc) => String(userDoc?.role || "").toLowerCase() === "teacher",
    ).length;
    const superAdminsCount = users.filter(
      (userDoc) => String(userDoc?.role || "").toLowerCase() === "super_admin",
    ).length;

    return {
      reply: `Users snapshot: ${users.length} total users, ${activeUsers} active, ${inactiveUsers} inactive, ${schoolAdmins.length} school admins, ${teachersCount} teachers, and ${superAdminsCount} super admins.${asOfLabel ? ` Data as of ${asOfLabel}.` : ""}`,
      action: null,
    };
  }

  const asksSecurityOverview =
    /\b(security|failed login|login history|suspicious|audit)\b/i.test(prompt) &&
    /\b(list|count|summary|overview|status|recent|open)\b/i.test(prompt) &&
    !hasActionVerb;
  if (asksSecurityOverview) {
    const failedLogins = securityLoginLogs.filter(
      (row) => String(row?.status || "").toUpperCase() === "FAILED",
    ).length;
    const successfulLogins = securityLoginLogs.filter(
      (row) => String(row?.status || "").toUpperCase() === "SUCCESS",
    ).length;
    const openSuspiciousEvents = suspiciousEvents.filter(
      (row) => String(row?.status || "").toUpperCase() === "OPEN",
    ).length;
    const resolvedSuspiciousEvents = suspiciousEvents.filter(
      (row) => String(row?.status || "").toUpperCase() === "RESOLVED",
    ).length;

    return {
      reply: `Security snapshot: ${failedLogins} failed logins, ${successfulLogins} successful logins, ${openSuspiciousEvents} open suspicious events, ${resolvedSuspiciousEvents} resolved suspicious events, and ${auditLogs.length} recent audit log entries loaded.${asOfLabel ? ` Data as of ${asOfLabel}.` : ""}`,
      action: null,
    };
  }

  const asksBackupsOverview =
    /\b(backup|backups|restore)\b/i.test(prompt) &&
    /\b(list|count|summary|overview|recent|status)\b/i.test(prompt) &&
    !hasActionVerb;
  if (asksBackupsOverview) {
    return {
      reply: `Backups snapshot: ${backups.length} recent backup records loaded.${asOfLabel ? ` Data as of ${asOfLabel}.` : ""}`,
      action: null,
    };
  }

  const asksBroadcastsOverview =
    /\b(broadcast|announcement|platform message)\b/i.test(prompt) &&
    /\b(list|count|summary|overview|recent|status)\b/i.test(prompt) &&
    !hasActionVerb;
  if (asksBroadcastsOverview) {
    return {
      reply: `Broadcast snapshot: ${broadcasts.length} recent platform broadcast records loaded.${asOfLabel ? ` Data as of ${asOfLabel}.` : ""}`,
      action: null,
    };
  }

  const asksSpecificSchoolOverview =
    /\b(details?|info|information|profile|overview|summary)\b/i.test(prompt) &&
    mentionsInstitution &&
    !hasActionVerb;
  if (asksSpecificSchoolOverview) {
    const targetSchool = findSchoolFromText(prompt, schools);
    if (!targetSchool) {
      return {
        reply:
          "I can provide school details. Please include the exact school name, code, or school ID.",
        action: null,
      };
    }

    const planLabel =
      targetSchool?.subscription?.planId ||
      targetSchool?.featurePlan ||
      targetSchool?.plan ||
      "unknown";
    const maxStudents = Number(targetSchool?.limits?.maxStudents || 0);
    const usedStudents = Number(targetSchool?.studentsCount || 0);
    const createdAt = parseFlexibleDate(targetSchool?.createdAt);

    return {
      reply: `${targetSchool.name} (${targetSchool.code || targetSchool.id}) is currently ${targetSchool.status || "active"}, plan ${planLabel}, student usage ${usedStudents}/${maxStudents || "N/A"}, and billing start type ${targetSchool?.billing?.startType || "term_start"}.${createdAt ? ` Created on ${createdAt.toLocaleDateString()}.` : ""}${asOfLabel ? ` Data as of ${asOfLabel}.` : ""}`,
      action: null,
    };
  }

  const asksFinance =
    /\b(profit|gain|revenue|income|earnings|earned|money made|cash flow|cashflow|payment|paid|amount collected|sales)\b/i.test(
      prompt,
    );
  if (asksFinance) {
    const payments = Array.isArray(dataContext?.payments)
      ? dataContext.payments
      : [];
    const { label: periodLabel, start: periodStart } = resolvePeriodRange(prompt);
    const filteredPayments = payments.filter((payment) => {
      const rawDate =
        payment?.createdAt ||
        payment?.paidAt ||
        payment?.verifiedAt ||
        payment?.timestamp;
      const paymentDate = parseFlexibleDate(rawDate);
      if (!paymentDate) return true;
      return periodStart ? paymentDate >= periodStart : true;
    });

    const successful = filteredPayments.filter(
      (payment) =>
        normalizePaymentStatus(
          payment?.status || payment?.billingStatus || payment?.paymentStatus,
        ) === "success",
    );
    const pending = filteredPayments.filter(
      (payment) =>
        normalizePaymentStatus(
          payment?.status || payment?.billingStatus || payment?.paymentStatus,
        ) === "pending",
    );
    const failed = filteredPayments.filter(
      (payment) =>
        normalizePaymentStatus(
          payment?.status || payment?.billingStatus || payment?.paymentStatus,
        ) === "failed",
    );

    const grossRevenue = successful.reduce(
      (sum, payment) =>
        sum + normalizeAmount(payment?.amount ?? payment?.amountPaid),
      0,
    );

    if (!payments.length) {
      return {
        reply:
          "I could not find payment records to compute revenue yet. Please confirm billing transactions are being saved in the payments collection.",
        action: null,
      };
    }

    return {
      reply: `For ${periodLabel}, recorded successful billing revenue is ${formatGhsCurrency(grossRevenue)} from ${successful.length} successful payments. Pending: ${pending.length}, failed: ${failed.length}. True profit (net profit) cannot be computed yet because operating expenses are not tracked in this dashboard.${asOfLabel ? ` Data as of ${asOfLabel}.` : ""}`,
      action: null,
    };
  }

  const wantsCreateAdmin =
    /\b(create|add|new)\b/i.test(prompt) &&
    /\b(admin|administrator|school admin)\b/i.test(prompt);
  if (wantsCreateAdmin) {
    const targetSchool = findSchoolFromText(prompt, schools);
    const email = extractEmailFromText(prompt);
    const fullName = extractAdminNameFromText(prompt, email);
    const missingFields = [];
    if (!targetSchool) missingFields.push("school name (or school ID)");
    if (!fullName) missingFields.push("admin full name");
    if (!email) missingFields.push("admin email");

    if (missingFields.length) {
      const sampleSchools = schools
        .slice(0, 4)
        .map((school) => school.name)
        .join(", ");
      return {
        reply: `I can prepare that admin-creation action, but I still need: ${missingFields.join(", ")}.${sampleSchools ? ` Example schools: ${sampleSchools}.` : ""}`,
        action: null,
      };
    }

    return {
      reply: `I prepared an action to create admin ${fullName} for ${targetSchool.name}. Confirm to apply it.`,
      action: {
        type: "create_school_admin",
        description: `Create school admin ${fullName} (${email}) for ${targetSchool.name}`,
        payload: {
          schoolId: targetSchool.id,
          fullName,
          email,
        },
      },
    };
  }

  const wantsResetPassword =
    /\b(reset|change)\b/i.test(prompt) &&
    /\b(password|passcode)\b/i.test(prompt);
  if (wantsResetPassword) {
    const adminUser = findSchoolAdminFromText(prompt, schoolAdmins);
    if (!adminUser) {
      return {
        reply:
          "I can prepare a password reset action, but I need the admin email, full name, or UID.",
        action: null,
      };
    }

    return {
      reply: `I prepared a password reset action for ${adminUser.fullName} (${adminUser.email}). Confirm to generate a reset link.`,
      action: {
        type: "reset_school_admin_password",
        description: `Reset school admin password for ${adminUser.fullName}`,
        payload: {
          adminUid: adminUser.id,
        },
      },
    };
  }

  const wantsUpdateAdminEmail =
    /\b(change|update|set)\b/i.test(prompt) &&
    /\b(email)\b/i.test(prompt) &&
    /\b(admin|administrator|school admin)\b/i.test(prompt);
  if (wantsUpdateAdminEmail) {
    const allEmails = extractEmailsFromText(prompt);
    const newEmail = allEmails.length ? allEmails[allEmails.length - 1] : "";
    let adminUser = findSchoolAdminFromText(prompt, schoolAdmins);

    if (!adminUser && allEmails.length >= 2) {
      const currentEmail = allEmails[0];
      adminUser = schoolAdmins.find(
        (candidate) =>
          normalizeText(candidate?.email) === normalizeText(currentEmail),
      );
    }

    if (!adminUser) {
      return {
        reply:
          "I can prepare an admin email update, but I need the target admin (email, full name, or UID).",
        action: null,
      };
    }

    if (!newEmail) {
      return {
        reply:
          "I can prepare this update. Please include the new email address for the admin.",
        action: null,
      };
    }

    if (normalizeText(adminUser.email) === normalizeText(newEmail)) {
      return {
        reply:
          "The provided email matches the admin's current email. Please provide a different new email.",
        action: null,
      };
    }

    return {
      reply: `I prepared an action to update ${adminUser.fullName || "the admin"} email to ${newEmail}. Confirm to apply it.`,
      action: {
        type: "update_school_admin_email",
        description: `Update admin email for ${adminUser.fullName || adminUser.id}`,
        payload: {
          adminUid: adminUser.id,
          newEmail,
          ...(adminUser.fullName ? { fullName: adminUser.fullName } : {}),
        },
      },
    };
  }

  const wantsCreateSchool =
    /\b(create|add|new)\b/i.test(prompt) && /\bschool\b/i.test(prompt);
  if (wantsCreateSchool) {
    const schoolNameFromQuote = extractQuotedText(prompt);
    const schoolNameMatch = prompt.match(
      /\b(?:called|named|name is)\s+([A-Za-z0-9][A-Za-z0-9\s'.&-]{1,80})/i,
    );
    const name =
      schoolNameFromQuote ||
      (schoolNameMatch ? schoolNameMatch[1].trim() : "").replace(
        /\b(plan|with|phone|address)\b.*$/i,
        "",
      );
    if (!name) {
      return {
        reply:
          "I can prepare school creation. Please provide at least the school name, for example: create school \"Star Academy\" on trial plan.",
        action: null,
      };
    }
    const plan = extractPlanFromText(prompt);
    return {
      reply: `I prepared an action to create school ${name} on the ${plan} plan. Confirm to proceed.`,
      action: {
        type: "create_school",
        description: `Create school ${name} (${plan} plan)`,
        payload: {
          name,
          plan,
        },
      },
    };
  }

  const wantsDeletePlan =
    /\b(delete|remove)\b/i.test(prompt) && /\bplan\b/i.test(prompt);
  if (wantsDeletePlan && !mentionsInstitution) {
    const targetPlan = findPlanFromText(prompt, plans);
    if (!targetPlan) {
      const samplePlans = plans
        .slice(0, 5)
        .map((planDoc) => `${planDoc.name || planDoc.id} (${planDoc.id})`)
        .join(", ");
      return {
        reply: `I can prepare a plan delete action, but I need the plan name or plan key.${samplePlans ? ` Available plans: ${samplePlans}.` : ""}`,
        action: null,
      };
    }

    return {
      reply: `I prepared an action to delete plan ${targetPlan.name || targetPlan.id} (${targetPlan.id}). Confirm to proceed.`,
      action: {
        type: "delete_plan",
        description: `Delete configured plan ${targetPlan.name || targetPlan.id}`,
        payload: {
          id: targetPlan.id,
        },
      },
    };
  }

  const wantsUpsertPlan =
    /\b(create|add|new|update|edit|set)\b/i.test(prompt) &&
    /\bplan\b/i.test(prompt) &&
    /\b(max students|max student|student limit|plan key|plan id)\b/i.test(
      prompt,
    ) &&
    !mentionsInstitution;
  if (wantsUpsertPlan) {
    const existingPlan = findPlanFromText(prompt, plans);
    const planId = extractPlanIdFromText(prompt) || existingPlan?.id || "";
    const planName =
      extractPlanNameFromText(prompt) || existingPlan?.name || "";
    const maxStudents = extractMaxStudentsFromText(prompt);
    const missingFields = [];
    if (!planId) missingFields.push("plan key (id)");
    if (!planName) missingFields.push("plan name");
    if (!Number.isFinite(maxStudents) || maxStudents < 0) {
      missingFields.push("max students");
    }

    if (missingFields.length) {
      return {
        reply: `I can prepare a plan save action, but I still need: ${missingFields.join(", ")}.`,
        action: null,
      };
    }

    return {
      reply: `I prepared an action to save plan ${planName} (${planId}) with max students ${Math.floor(maxStudents)}. Confirm to apply it.`,
      action: {
        type: "upsert_plan",
        description: `Save plan ${planName} (${planId})`,
        payload: {
          id: planId,
          name: planName,
          maxStudents: Math.floor(maxStudents),
        },
      },
    };
  }

  const mentionsConfiguredPlan = Boolean(findPlanFromText(prompt, plans));
  const wantsAssignConfiguredPlan =
    /\b(assign|apply|switch|move|set|update|change)\b/i.test(prompt) &&
    /\bplan\b/i.test(prompt) &&
    mentionsInstitution &&
    mentionsConfiguredPlan;
  if (wantsAssignConfiguredPlan) {
    const targetSchool = findSchoolFromText(prompt, schools);
    const targetPlan = findPlanFromText(prompt, plans);
    if (!targetSchool || !targetPlan) {
      const samplePlans = plans
        .slice(0, 5)
        .map((planDoc) => `${planDoc.name || planDoc.id} (${planDoc.id})`)
        .join(", ");
      return {
        reply: `I can prepare a configured-plan assignment, but I need both school name/ID and plan key/name.${samplePlans ? ` Available plans: ${samplePlans}.` : ""}`,
        action: null,
      };
    }

    return {
      reply: `I prepared an action to assign configured plan ${targetPlan.name || targetPlan.id} to ${targetSchool.name}. Confirm to apply it.`,
      action: {
        type: "assign_school_subscription_plan",
        description: `Assign configured plan ${targetPlan.name || targetPlan.id} to ${targetSchool.name}`,
        payload: {
          schoolId: targetSchool.id,
          planId: targetPlan.id,
        },
      },
    };
  }

  const wantsSchoolStatusChange =
    /\b(activate|enable|unsuspend|reopen|deactivate|disable|suspend)\b/i.test(
      prompt,
    ) && mentionsInstitution;
  if (wantsSchoolStatusChange) {
    const targetSchool = findSchoolFromText(prompt, schools);
    if (!targetSchool) {
      return {
        reply:
          "I can prepare a school status change, but I need the school name or school ID.",
        action: null,
      };
    }

    const nextStatus = /\b(deactivate|disable|suspend)\b/i.test(prompt)
      ? "inactive"
      : "active";

    return {
      reply: `I prepared an action to set ${targetSchool.name} to ${nextStatus}. Confirm to apply it.`,
      action: {
        type: "set_school_status",
        description: `Set school status for ${targetSchool.name} to ${nextStatus}`,
        payload: {
          schoolId: targetSchool.id,
          status: nextStatus,
        },
      },
    };
  }

  const wantsSchoolPlanChange =
    /\b(change|update|switch|move|set)\b/i.test(prompt) &&
    /\bplan\b/i.test(prompt);
  const wantsSchoolFeaturePlanChange =
    /\b(change|update|switch|move|set)\b/i.test(prompt) &&
    (/\bfeature plan\b/i.test(prompt) ||
      /\bstarter\b/i.test(prompt) ||
      /\bstandard\b/i.test(prompt));
  if (wantsSchoolFeaturePlanChange) {
    const targetSchool = findSchoolFromText(prompt, schools);
    const featurePlan = extractFeaturePlanFromText(prompt);
    if (!targetSchool || !featurePlan) {
      return {
        reply:
          "I can prepare a feature plan change, but I need both the school name (or ID) and the target feature plan (starter or standard).",
        action: null,
      };
    }

    return {
      reply: `I prepared an action to set ${targetSchool.name} feature plan to ${featurePlan}. Confirm to apply it.`,
      action: {
        type: "set_school_feature_plan",
        description: `Set feature plan for ${targetSchool.name} to ${featurePlan}`,
        payload: {
          schoolId: targetSchool.id,
          featurePlan,
        },
      },
    };
  }

  if (wantsSchoolPlanChange) {
    const targetSchool = findSchoolFromText(prompt, schools);
    const explicitPlan = extractExplicitPlanFromText(prompt);
    const featurePlan = extractFeaturePlanFromText(prompt);
    if (targetSchool && !explicitPlan && featurePlan) {
      return {
        reply: `I prepared an action to set ${targetSchool.name} feature plan to ${featurePlan}. Confirm to apply it.`,
        action: {
          type: "set_school_feature_plan",
          description: `Set feature plan for ${targetSchool.name} to ${featurePlan}`,
          payload: {
            schoolId: targetSchool.id,
            featurePlan,
          },
        },
      };
    }

    if (!targetSchool || !explicitPlan) {
      return {
        reply:
          "I can prepare a school plan change, but I need both the school name (or ID) and the target plan (free, trial, monthly, termly, yearly).",
        action: null,
      };
    }

    return {
      reply: `I prepared an action to change ${targetSchool.name} to the ${explicitPlan} plan. Confirm to apply it.`,
      action: {
        type: "set_school_plan",
        description: `Change plan for ${targetSchool.name} to ${explicitPlan}`,
        payload: {
          schoolId: targetSchool.id,
          plan: explicitPlan,
        },
      },
    };
  }

  const soundsLikeActionRequest =
    /\b(create|add|update|change|switch|move|set|reset|activate|deactivate|enable|disable|suspend|provision|delete|remove|assign|apply)\b/i.test(
      prompt,
    );
  if (soundsLikeActionRequest) {
    return {
      reply: buildActionClarificationQuestion(prompt, schools),
      action: null,
    };
  }

  return {
    reply:
      'I want to help with that. Can you clarify your goal in one sentence? Example: "Set Star Academy feature plan to standard" or "Deactivate Star Academy school".',
    action: null,
  };
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

const recordAiTelemetry = async (data = {}) => {
  try {
    await admin.firestore().collection("ai_telemetry").add({
      ...data,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      timestampMs: Date.now(),
    });
  } catch (error) {
    console.warn("Failed to record AI telemetry", error?.message || error);
  }
};

const trimToString = (value, maxLength = 200) =>
  String(value || "")
    .trim()
    .slice(0, maxLength);

const validateAiActionPayload = (action = {}) => {
  const type = String(action?.type || "").trim();
  const payload = action?.payload || {};
  const missingFields = [];
  const warnings = [];
  let normalizedPayload = {};
  let description = trimToString(action?.description, 220);
  let canUndo = false;

  switch (type) {
    case "create_school": {
      const name = trimToString(payload?.name, 120);
      const plan = trimToString(payload?.plan || "trial", 20).toLowerCase();
      const phone = trimToString(payload?.phone, 40);
      const address = trimToString(payload?.address, 200);
      const logoUrl = trimToString(payload?.logoUrl, 1000);
      const featurePlan = trimToString(payload?.featurePlan || "starter", 20);
      const billingStartType = trimToString(
        payload?.billingStartType || "term_start",
        20,
      );
      const validPlans = ["free", "trial", "monthly", "termly", "yearly"];
      const validFeaturePlans = ["starter", "standard"];
      const validBillingStartTypes = ["term_start", "mid_term"];
      if (!name) missingFields.push("name");
      if (!validPlans.includes(plan)) missingFields.push("plan");
      if (!validFeaturePlans.includes(featurePlan)) {
        warnings.push("featurePlan normalized to starter");
      }
      if (!validBillingStartTypes.includes(billingStartType)) {
        warnings.push("billingStartType normalized to term_start");
      }

      normalizedPayload = {
        name,
        plan: validPlans.includes(plan) ? plan : "trial",
        ...(phone ? { phone } : {}),
        ...(address ? { address } : {}),
        ...(logoUrl ? { logoUrl } : {}),
        featurePlan: validFeaturePlans.includes(featurePlan)
          ? featurePlan
          : "starter",
        billingStartType: validBillingStartTypes.includes(billingStartType)
          ? billingStartType
          : "term_start",
      };
      if (!description) {
        description = `Create school ${name || "New School"} (${normalizedPayload.plan} plan)`;
      }
      canUndo = true;
      break;
    }
    case "create_school_admin": {
      const schoolId = trimToString(payload?.schoolId, 80);
      const fullName = trimToString(payload?.fullName, 120);
      const email = trimToString(payload?.email, 120).toLowerCase();
      const password = trimToString(payload?.password, 120);
      if (!schoolId) missingFields.push("schoolId");
      if (!fullName) missingFields.push("fullName");
      if (!email) missingFields.push("email");
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        missingFields.push("valid email");
      }
      if (password && password.length < 6) {
        missingFields.push("password(min 6 chars)");
      }
      normalizedPayload = {
        schoolId,
        fullName,
        email,
        ...(password ? { password } : {}),
      };
      if (!description) {
        description = `Create school admin ${fullName || "Admin"} (${email || "email"})`;
      }
      canUndo = true;
      break;
    }
    case "update_school_admin_email": {
      const adminUid = trimToString(payload?.adminUid, 80);
      const newEmail = trimToString(payload?.newEmail, 120).toLowerCase();
      const fullName = trimToString(payload?.fullName, 120);
      if (!adminUid) missingFields.push("adminUid");
      if (!newEmail) missingFields.push("newEmail");
      if (newEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
        missingFields.push("valid newEmail");
      }
      normalizedPayload = {
        adminUid,
        newEmail,
        ...(fullName ? { fullName } : {}),
      };
      if (!description) {
        description = `Update admin email to ${newEmail || "new email"}`;
      }
      canUndo = true;
      break;
    }
    case "reset_school_admin_password": {
      const adminUid = trimToString(payload?.adminUid, 80);
      if (!adminUid) missingFields.push("adminUid");
      normalizedPayload = { adminUid };
      if (!description) {
        description = `Reset password for admin ${adminUid || "unknown"}`;
      }
      canUndo = false;
      break;
    }
    case "provision_user": {
      const uid = trimToString(payload?.uid, 120);
      const role = trimToString(payload?.role, 60).toLowerCase();
      const schoolId = trimToString(payload?.schoolId, 80);
      const fullName = trimToString(payload?.fullName, 120);
      const email = trimToString(payload?.email, 120).toLowerCase();
      const validRoles = ["super_admin", "school_admin", "teacher"];
      if (!uid) missingFields.push("uid");
      if (!fullName) missingFields.push("fullName");
      if (!email) missingFields.push("email");
      if (!validRoles.includes(role)) missingFields.push("role");
      if (
        (role === "school_admin" || role === "teacher") &&
        !schoolId
      ) {
        missingFields.push("schoolId");
      }
      normalizedPayload = {
        uid,
        role: validRoles.includes(role) ? role : "teacher",
        ...(schoolId ? { schoolId } : {}),
        fullName,
        email,
      };
      if (!description) {
        description = `Provision ${role || "user"} profile for ${fullName || uid || "user"}`;
      }
      canUndo = true;
      break;
    }
    case "set_school_status": {
      const schoolId = trimToString(payload?.schoolId, 80);
      const status = trimToString(payload?.status, 24).toLowerCase();
      const validStatuses = ["active", "inactive"];
      if (!schoolId) missingFields.push("schoolId");
      if (!validStatuses.includes(status)) missingFields.push("status");
      normalizedPayload = {
        schoolId,
        status: validStatuses.includes(status) ? status : "inactive",
      };
      if (!description) {
        description = `Set school ${schoolId || "unknown"} status to ${normalizedPayload.status}`;
      }
      canUndo = true;
      break;
    }
    case "set_school_plan": {
      const schoolId = trimToString(payload?.schoolId, 80);
      const plan = trimToString(payload?.plan, 24).toLowerCase();
      const validPlans = ["free", "trial", "monthly", "termly", "yearly"];
      if (!schoolId) missingFields.push("schoolId");
      if (!validPlans.includes(plan)) missingFields.push("plan");
      normalizedPayload = {
        schoolId,
        plan: validPlans.includes(plan) ? plan : "trial",
      };
      if (!description) {
        description = `Set school ${schoolId || "unknown"} plan to ${normalizedPayload.plan}`;
      }
      canUndo = true;
      break;
    }
    case "set_school_feature_plan": {
      const schoolId = trimToString(payload?.schoolId, 80);
      const featurePlan = trimToString(payload?.featurePlan, 24).toLowerCase();
      const validFeaturePlans = ["starter", "standard"];
      if (!schoolId) missingFields.push("schoolId");
      if (!validFeaturePlans.includes(featurePlan)) {
        missingFields.push("featurePlan");
      }
      normalizedPayload = {
        schoolId,
        featurePlan: validFeaturePlans.includes(featurePlan)
          ? featurePlan
          : "starter",
      };
      if (!description) {
        description = `Set school ${schoolId || "unknown"} feature plan to ${normalizedPayload.featurePlan}`;
      }
      canUndo = true;
      break;
    }
    case "upsert_plan": {
      const id = trimToString(payload?.id, 80).toLowerCase();
      const name = trimToString(payload?.name, 120);
      const maxStudents = Number(payload?.maxStudents);
      if (!id) missingFields.push("id");
      if (!name) missingFields.push("name");
      if (!Number.isFinite(maxStudents) || maxStudents < 0) {
        missingFields.push("maxStudents");
      }
      if (id.includes("/")) {
        missingFields.push("id(no slash)");
      }
      normalizedPayload = {
        id,
        name,
        maxStudents: Number.isFinite(maxStudents) ? Math.floor(maxStudents) : 0,
      };
      if (!description) {
        description = `Save plan ${name || id || "plan"}`;
      }
      canUndo = true;
      break;
    }
    case "delete_plan": {
      const id = trimToString(payload?.id, 80).toLowerCase();
      if (!id) missingFields.push("id");
      normalizedPayload = { id };
      if (!description) {
        description = `Delete plan ${id || "plan"}`;
      }
      canUndo = true;
      break;
    }
    case "assign_school_subscription_plan": {
      const schoolId = trimToString(payload?.schoolId, 80);
      const planId = trimToString(payload?.planId, 80).toLowerCase();
      if (!schoolId) missingFields.push("schoolId");
      if (!planId) missingFields.push("planId");
      normalizedPayload = { schoolId, planId };
      if (!description) {
        description = `Assign configured plan ${planId || "plan"} to school ${schoolId || "unknown"}`;
      }
      canUndo = true;
      break;
    }
    default: {
      missingFields.push("valid action type");
      break;
    }
  }

  return {
    valid: missingFields.length === 0,
    type,
    description,
    payload: normalizedPayload,
    missingFields,
    warnings,
    canUndo,
  };
};

const createAiActionAudit = async ({
  actorUid,
  actionType,
  description,
  payload,
  result = null,
  entityId = null,
  schoolId = null,
  canUndo = false,
}) => {
  const now = Date.now();
  const undoToken = canUndo
    ? `undo_${crypto.randomUUID?.() || crypto.randomBytes(16).toString("hex")}`
    : null;
  const undoBefore = canUndo ? now + 15 * 60 * 1000 : null;
  const docRef = admin.firestore().collection("ai_action_history").doc();
  await docRef.set({
    actorUid: actorUid || null,
    actionType,
    description,
    payload: payload || {},
    result: result || {},
    entityId: entityId || null,
    schoolId: schoolId || null,
    canUndo: Boolean(canUndo),
    undoToken,
    undoBefore,
    undoneAt: null,
    undoneBy: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    timestampMs: now,
  });
  return canUndo && undoToken
    ? { undoToken, actionType, undoBefore }
    : null;
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
 * Super Admin Dashboard Overview (cached + aggregated)
 * GET /api/superadmin/dashboard-overview
 */
app.get(
  "/api/superadmin/dashboard-overview",
  authLimiter,
  authMiddleware,
  superAdminMiddleware,
  async (req, res) => {
    try {
      const forceRefresh = toBooleanFlag(req.query?.forceRefresh);
      const schoolsLimit = toPositiveInt(req.query?.schoolsLimit, 2000, 50, 5000);
      const activityLimit = toPositiveInt(req.query?.activityLimit, 60, 10, 400);
      const paymentsLimit = toPositiveInt(
        req.query?.paymentsLimit,
        2500,
        100,
        8000,
      );
      const checklistLimit = toPositiveInt(
        req.query?.checklistLimit,
        20000,
        500,
        100000,
      );

      const cacheKey = buildSuperAdminViewCacheKey(
        "dashboard-overview",
        req.user?.uid,
        {
          schoolsLimit,
          activityLimit,
          paymentsLimit,
          checklistLimit,
        },
      );

      if (!forceRefresh) {
        const cached = getCachedSuperAdminView(cacheKey);
        if (cached) {
          return res.json({
            success: true,
            cached: true,
            ...cached,
          });
        }
      }

      const db = admin.firestore();
      const safeGetRows = async (loader) => {
        try {
          return await loader();
        } catch {
          return [];
        }
      };

      const [schoolRows, activityRows, paymentRows] = await Promise.all([
        safeGetRows(() =>
          fetchCollectionRows({
            collectionName: "schools",
            limitCount: schoolsLimit,
            orderField: "createdAt",
          }),
        ),
        safeGetRows(() =>
          fetchCollectionRows({
            collectionName: "activity_logs",
            limitCount: activityLimit,
            orderField: "createdAt",
          }),
        ),
        safeGetRows(() =>
          fetchCollectionRows({
            collectionName: "payments",
            limitCount: paymentsLimit,
            orderField: "createdAt",
          }),
        ),
      ]);

      const schools = schoolRows.map((row) => normalizeSchoolForView(row.id, row));
      const activity = activityRows.map((row) => ({
        id: row.id,
        schoolId: normalizeSchoolId(row.schoolId),
        eventType: String(row.eventType || row.actionType || "activity"),
        actorUid: row.actorUid || null,
        actorRole: row.actorRole || null,
        createdAt: toMillisValue(row.createdAt || row.timestamp || row.timestampMs),
        meta: row.meta || null,
      }));
      const payments = paymentRows.map((row) => normalizePaymentForView(row.id, row));

      const now = new Date();
      const today = toLocalDateKey(now);
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59, 999);
      const startMs = startOfDay.getTime();
      const endMs = endOfDay.getTime();

      const getRowsFromSnap = (snap) =>
        Array.isArray(snap?.docs) ? snap.docs.map((docSnap) => docSnap.data()) : [];

      const [
        attendanceSnap,
        teacherAttendanceSnap,
        assessmentsSnap,
        timetablesSnap,
        noticesSnap,
      ] = await Promise.all([
        db
          .collection("attendance")
          .where("date", "==", today)
          .limit(checklistLimit)
          .get()
          .catch(() => null),
        db
          .collection("teacher_attendance")
          .where("date", "==", today)
          .limit(checklistLimit)
          .get()
          .catch(() => null),
        db
          .collection("assessments")
          .where("createdAt", ">=", startMs)
          .where("createdAt", "<=", endMs)
          .limit(checklistLimit)
          .get()
          .catch(() => null),
        db
          .collection("timetables")
          .limit(checklistLimit)
          .get()
          .catch(() => null),
        db
          .collection("notices")
          .where("createdAt", ">=", startMs)
          .where("createdAt", "<=", endMs)
          .limit(checklistLimit)
          .get()
          .catch(() => null),
      ]);

      const attendanceSchools = extractUniqueSchoolIds(getRowsFromSnap(attendanceSnap));
      const teacherAttendanceSchools = extractUniqueSchoolIds(
        getRowsFromSnap(teacherAttendanceSnap),
      );
      const assessmentSchools = extractUniqueSchoolIds(getRowsFromSnap(assessmentsSnap));
      const timetableSchools = extractUniqueSchoolIds(getRowsFromSnap(timetablesSnap));
      const noticeSchools = extractUniqueSchoolIds(getRowsFromSnap(noticesSnap));

      const totalSchools = schools.length;
      const dailyChecklistSummary = {
        attendance: { completed: 0, total: totalSchools },
        teacherAttendance: { completed: 0, total: totalSchools },
        assessments: { completed: 0, total: totalSchools },
        timetable: { completed: 0, total: totalSchools },
        notices: { completed: 0, total: totalSchools },
      };
      const dailyChecklistPerSchool = {};

      schools.forEach((school) => {
        const schoolId = normalizeSchoolId(school.id);
        if (!schoolId) return;

        const status = {
          attendance: attendanceSchools.has(schoolId),
          teacherAttendance: teacherAttendanceSchools.has(schoolId),
          assessments: assessmentSchools.has(schoolId),
          timetable: timetableSchools.has(schoolId),
          notices: noticeSchools.has(schoolId),
        };
        dailyChecklistPerSchool[schoolId] = status;

        if (status.attendance) dailyChecklistSummary.attendance.completed += 1;
        if (status.teacherAttendance) {
          dailyChecklistSummary.teacherAttendance.completed += 1;
        }
        if (status.assessments) dailyChecklistSummary.assessments.completed += 1;
        if (status.timetable) dailyChecklistSummary.timetable.completed += 1;
        if (status.notices) dailyChecklistSummary.notices.completed += 1;
      });

      const payload = {
        generatedAt: Date.now(),
        schools,
        activity,
        payments,
        dailyChecklist: {
          summary: dailyChecklistSummary,
          perSchool: dailyChecklistPerSchool,
        },
        limits: {
          schoolsLimit,
          activityLimit,
          paymentsLimit,
          checklistLimit,
        },
      };

      setCachedSuperAdminView(cacheKey, payload);
      return res.json({
        success: true,
        cached: false,
        ...payload,
      });
    } catch (error) {
      console.error("Dashboard overview error:", error.message || error);
      return res.status(500).json({
        error: error.message || "Failed to build dashboard overview",
      });
    }
  },
);

/**
 * Super Admin Analytics Overview (cached + aggregated)
 * GET /api/superadmin/analytics-overview
 */
app.get(
  "/api/superadmin/analytics-overview",
  authLimiter,
  authMiddleware,
  superAdminMiddleware,
  async (req, res) => {
    try {
      const forceRefresh = toBooleanFlag(req.query?.forceRefresh);
      const schoolsLimit = toPositiveInt(req.query?.schoolsLimit, 2500, 50, 5000);
      const paymentsLimit = toPositiveInt(
        req.query?.paymentsLimit,
        5000,
        100,
        10000,
      );
      const eventsLimit = toPositiveInt(req.query?.eventsLimit, 5000, 100, 10000);
      const activityLimit = toPositiveInt(
        req.query?.activityLimit,
        5000,
        100,
        10000,
      );

      const cacheKey = buildSuperAdminViewCacheKey(
        "analytics-overview",
        req.user?.uid,
        {
          schoolsLimit,
          paymentsLimit,
          eventsLimit,
          activityLimit,
        },
      );

      if (!forceRefresh) {
        const cached = getCachedSuperAdminView(cacheKey);
        if (cached) {
          return res.json({
            success: true,
            cached: true,
            ...cached,
          });
        }
      }

      const safeGetRows = async (loader) => {
        try {
          return await loader();
        } catch {
          return [];
        }
      };

      const [schoolRows, paymentRows, eventRows, activityRows] = await Promise.all([
        safeGetRows(() =>
          fetchCollectionRows({
            collectionName: "schools",
            limitCount: schoolsLimit,
            orderField: "createdAt",
          }),
        ),
        safeGetRows(() =>
          fetchCollectionRows({
            collectionName: "payments",
            limitCount: paymentsLimit,
            orderField: "createdAt",
          }),
        ),
        safeGetRows(() =>
          fetchCollectionRows({
            collectionName: "analyticsEvents",
            limitCount: eventsLimit,
            orderField: "createdAt",
          }),
        ),
        safeGetRows(() =>
          fetchCollectionRows({
            collectionName: "activity_logs",
            limitCount: activityLimit,
            orderField: "createdAt",
          }),
        ),
      ]);

      const schools = schoolRows.map((row) => normalizeSchoolForView(row.id, row));
      const payments = paymentRows.map((row) => normalizePaymentForView(row.id, row));
      const events = eventRows.map((row) => ({
        id: row.id,
        schoolId: normalizeSchoolId(row.schoolId),
        actionType: row.actionType || null,
        userRole: row.userRole || null,
        createdAt: toMillisValue(row.createdAt),
      }));
      const activityLogs = activityRows.map((row) => ({
        id: row.id,
        schoolId: normalizeSchoolId(row.schoolId),
        eventType: row.eventType || null,
        createdAt: toMillisValue(row.createdAt || row.timestamp || row.timestampMs),
      }));

      const now = new Date();
      const months = [];
      for (let offset = 11; offset >= 0; offset -= 1) {
        const dt = new Date(now.getFullYear(), now.getMonth() - offset, 1);
        months.push({
          key: `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`,
          label: dt.toLocaleDateString("en-US", {
            month: "short",
            year: "numeric",
          }),
        });
      }

      const growthMap = Object.fromEntries(months.map((month) => [month.key, 0]));
      const revenueMap = Object.fromEntries(months.map((month) => [month.key, 0]));
      const activityMap = Object.fromEntries(months.map((month) => [month.key, 0]));

      const activityBySchool = {};
      const featureUsageMap = {};

      schools.forEach((school) => {
        const createdDate = parseFlexibleDate(school.createdAt);
        if (!createdDate) return;
        const key = `${createdDate.getFullYear()}-${String(createdDate.getMonth() + 1).padStart(2, "0")}`;
        if (growthMap[key] !== undefined) {
          growthMap[key] += 1;
        }
      });

      let successfulRevenue = 0;
      let successfulPayments = 0;
      let issuePayments = 0;
      payments.forEach((payment) => {
        const status = normalizePaymentStatus(payment.status);
        const createdDate = parseFlexibleDate(payment.createdAt);
        if (!createdDate) return;
        const key = `${createdDate.getFullYear()}-${String(createdDate.getMonth() + 1).padStart(2, "0")}`;
        if (status === "success") {
          const amount = normalizeAmount(payment.amount);
          successfulRevenue += amount;
          successfulPayments += 1;
          if (revenueMap[key] !== undefined) {
            revenueMap[key] += amount;
          }
        }
        if (status === "failed") {
          issuePayments += 1;
        }
      });

      const recordActivity = (schoolId, createdAt) => {
        const createdDate = parseFlexibleDate(createdAt);
        if (!createdDate) return;
        const key = `${createdDate.getFullYear()}-${String(createdDate.getMonth() + 1).padStart(2, "0")}`;
        if (activityMap[key] !== undefined) {
          activityMap[key] += 1;
        }
        const normalizedSchoolId = normalizeSchoolId(schoolId);
        if (!normalizedSchoolId) return;
        if (!activityBySchool[normalizedSchoolId]) {
          activityBySchool[normalizedSchoolId] = { count: 0, last: null };
        }
        activityBySchool[normalizedSchoolId].count += 1;
        const createdMs = createdDate.getTime();
        if (
          !activityBySchool[normalizedSchoolId].last ||
          createdMs > activityBySchool[normalizedSchoolId].last
        ) {
          activityBySchool[normalizedSchoolId].last = createdMs;
        }
      };

      events.forEach((eventRow) => {
        const usageKey = String(
          eventRow.actionType || eventRow.userRole || "unknown_event",
        );
        featureUsageMap[usageKey] = (featureUsageMap[usageKey] || 0) + 1;
        recordActivity(eventRow.schoolId, eventRow.createdAt);
      });
      activityLogs.forEach((row) => {
        if (!events.length) {
          const usageKey = String(row.eventType || "platform_activity");
          featureUsageMap[usageKey] = (featureUsageMap[usageKey] || 0) + 1;
        }
        recordActivity(row.schoolId, row.createdAt);
      });

      const studentCounts = Object.fromEntries(
        schools.map((school) => [school.id, Number(school.studentsCount || 0) || 0]),
      );

      const totalSchools = schools.length;
      const activeSchools = schools.filter((school) => school.status === "active").length;
      const totalStudents = Object.values(studentCounts).reduce(
        (sum, value) => sum + Number(value || 0),
        0,
      );
      const avgStudents = totalSchools ? Math.round(totalStudents / totalSchools) : 0;

      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const getMonthCount = (targetDate) =>
        schools.filter((school) => {
          const created = parseFlexibleDate(school.createdAt);
          if (!created) return false;
          return (
            created.getFullYear() === targetDate.getFullYear() &&
            created.getMonth() === targetDate.getMonth()
          );
        }).length;
      const newSchoolsThisMonth = getMonthCount(thisMonth);
      const newSchoolsLastMonth = getMonthCount(lastMonth);
      const growthRate =
        newSchoolsLastMonth === 0
          ? newSchoolsThisMonth === 0
            ? 0
            : 100
          : Math.round(
              ((newSchoolsThisMonth - newSchoolsLastMonth) / newSchoolsLastMonth) *
                100,
            );

      const topActiveSchools = schools
        .map((school) => ({
          ...school,
          activityScore: activityBySchool[school.id]?.count || 0,
          lastActive: activityBySchool[school.id]?.last || null,
        }))
        .sort((left, right) => right.activityScore - left.activityScore)
        .slice(0, 8);

      const featureUsage = Object.entries(featureUsageMap)
        .map(([key, value]) => ({ key, value }))
        .sort((left, right) => right.value - left.value)
        .slice(0, 16);

      const payload = {
        generatedAt: Date.now(),
        schools,
        payments,
        events,
        activityLogs,
        studentCounts,
        months,
        growthSeries: months.map((month) => ({
          label: month.label,
          value: growthMap[month.key] || 0,
        })),
        revenueSeries: months.map((month) => ({
          label: month.label,
          value: revenueMap[month.key] || 0,
        })),
        activitySeries: months.map((month) => ({
          label: month.label,
          value: activityMap[month.key] || 0,
        })),
        totals: {
          totalSchools,
          activeSchools,
          totalStudents,
          avgStudents,
          newSchoolsThisMonth,
          newSchoolsLastMonth,
          growthRate,
          successfulRevenue,
          successfulPayments,
          issuePayments,
        },
        topActiveSchools,
        featureUsage,
      };

      setCachedSuperAdminView(cacheKey, payload);
      return res.json({
        success: true,
        cached: false,
        ...payload,
      });
    } catch (error) {
      console.error("Analytics overview error:", error.message || error);
      return res.status(500).json({
        error: error.message || "Failed to build analytics overview",
      });
    }
  },
);

/**
 * Super Admin schools list (paginated)
 * GET /api/superadmin/schools-page
 */
app.get(
  "/api/superadmin/schools-page",
  authLimiter,
  authMiddleware,
  superAdminMiddleware,
  async (req, res) => {
    try {
      const limitCount = toPositiveInt(req.query?.limit, 50, 5, 200);
      const cursorDocId = String(req.query?.cursor || "").trim();
      const forceRefresh = toBooleanFlag(req.query?.forceRefresh);

      const cacheKey = buildSuperAdminViewCacheKey(
        "schools-page",
        req.user?.uid,
        { limitCount, cursorDocId },
      );
      if (!forceRefresh) {
        const cached = getCachedSuperAdminView(cacheKey);
        if (cached) {
          return res.json({
            success: true,
            cached: true,
            ...cached,
          });
        }
      }

      const page = await listCollectionPage({
        collectionName: "schools",
        orderField: "createdAt",
        direction: "desc",
        cursorDocId,
        limitCount,
      });
      const items = page.items.map((row) => normalizeSchoolForView(row.id, row));

      const payload = {
        items,
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
      };
      setCachedSuperAdminView(cacheKey, payload);
      return res.json({
        success: true,
        cached: false,
        ...payload,
      });
    } catch (error) {
      console.error("Schools page error:", error.message || error);
      return res.status(500).json({
        error: error.message || "Failed to load schools page",
      });
    }
  },
);

/**
 * Super Admin users list (paginated)
 * GET /api/superadmin/users-page
 */
app.get(
  "/api/superadmin/users-page",
  authLimiter,
  authMiddleware,
  superAdminMiddleware,
  async (req, res) => {
    try {
      const limitCount = toPositiveInt(req.query?.limit, 100, 10, 300);
      const cursorDocId = String(req.query?.cursor || "").trim();
      const excludeSuperAdmins = toBooleanFlag(
        req.query?.excludeSuperAdmins ?? "1",
      );
      const forceRefresh = toBooleanFlag(req.query?.forceRefresh);

      const cacheKey = buildSuperAdminViewCacheKey(
        "users-page",
        req.user?.uid,
        {
          limitCount,
          cursorDocId,
          excludeSuperAdmins: excludeSuperAdmins ? "1" : "0",
        },
      );
      if (!forceRefresh) {
        const cached = getCachedSuperAdminView(cacheKey);
        if (cached) {
          return res.json({
            success: true,
            cached: true,
            ...cached,
          });
        }
      }

      const page = await listCollectionPage({
        collectionName: "users",
        orderField: "createdAt",
        direction: "desc",
        cursorDocId,
        limitCount,
      });

      const items = page.items
        .map((row) => ({
          id: row.id,
          fullName: String(row.fullName || "").trim(),
          email: String(row.email || "").trim(),
          role: String(row.role || row.userRole || "").trim() || null,
          schoolId: normalizeSchoolId(row.schoolId),
          status: String(row.status || "active").trim() || "active",
          createdAt: toMillisValue(row.createdAt),
          lastLogin: toMillisValue(row.lastLogin),
          lastLoginAt:
            Number(row.lastLoginAt || 0) ||
            toMillisValue(row.lastLoginAt) ||
            null,
        }))
        .filter((row) =>
          excludeSuperAdmins ? String(row.role) !== "super_admin" : true,
        );

      const payload = {
        items,
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
      };
      setCachedSuperAdminView(cacheKey, payload);
      return res.json({
        success: true,
        cached: false,
        ...payload,
      });
    } catch (error) {
      console.error("Users page error:", error.message || error);
      return res.status(500).json({
        error: error.message || "Failed to load users page",
      });
    }
  },
);

/**
 * Super Admin payments list (paginated)
 * GET /api/superadmin/payments-page
 */
app.get(
  "/api/superadmin/payments-page",
  authLimiter,
  authMiddleware,
  superAdminMiddleware,
  async (req, res) => {
    try {
      const limitCount = toPositiveInt(req.query?.limit, 120, 10, 300);
      const cursorDocId = String(req.query?.cursor || "").trim();
      const forceRefresh = toBooleanFlag(req.query?.forceRefresh);

      const cacheKey = buildSuperAdminViewCacheKey(
        "payments-page",
        req.user?.uid,
        { limitCount, cursorDocId },
      );
      if (!forceRefresh) {
        const cached = getCachedSuperAdminView(cacheKey);
        if (cached) {
          return res.json({
            success: true,
            cached: true,
            ...cached,
          });
        }
      }

      const page = await listCollectionPage({
        collectionName: "payments",
        orderField: "createdAt",
        direction: "desc",
        cursorDocId,
        limitCount,
      });
      const items = page.items.map((row) => normalizePaymentForView(row.id, row));

      const payload = {
        items,
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
      };
      setCachedSuperAdminView(cacheKey, payload);
      return res.json({
        success: true,
        cached: false,
        ...payload,
      });
    } catch (error) {
      console.error("Payments page error:", error.message || error);
      return res.status(500).json({
        error: error.message || "Failed to load payments page",
      });
    }
  },
);

/**
 * Super Admin backups list (paginated)
 * GET /api/superadmin/backups-page
 */
app.get(
  "/api/superadmin/backups-page",
  authLimiter,
  authMiddleware,
  superAdminMiddleware,
  async (req, res) => {
    try {
      const limitCount = toPositiveInt(req.query?.limit, 80, 10, 200);
      const cursorDocId = String(req.query?.cursor || "").trim();
      const includeSchools = toBooleanFlag(req.query?.includeSchools ?? "1");
      const forceRefresh = toBooleanFlag(req.query?.forceRefresh);

      const cacheKey = buildSuperAdminViewCacheKey(
        "backups-page",
        req.user?.uid,
        {
          limitCount,
          cursorDocId,
          includeSchools: includeSchools ? "1" : "0",
        },
      );
      if (!forceRefresh) {
        const cached = getCachedSuperAdminView(cacheKey);
        if (cached) {
          return res.json({
            success: true,
            cached: true,
            ...cached,
          });
        }
      }

      const page = await listCollectionPage({
        collectionName: "backups",
        orderField: "timestamp",
        direction: "desc",
        cursorDocId,
        limitCount,
      });

      const computeBackupRecordCount = (entry = {}) => {
        const explicit = Number(entry?.recoveryMeta?.recordCount || 0);
        if (explicit > 0) return explicit;
        const data = entry?.data || {};
        return [
          Array.isArray(data.students) ? data.students.length : 0,
          Array.isArray(data.teacherAttendanceRecords)
            ? data.teacherAttendanceRecords.length
            : 0,
          Array.isArray(data.users) ? data.users.length : 0,
          Array.isArray(data.notices) ? data.notices.length : 0,
          Array.isArray(data.classSubjects) ? data.classSubjects.length : 0,
          Array.isArray(data.payments) ? data.payments.length : 0,
          Array.isArray(data.fees) ? data.fees.length : 0,
          Array.isArray(data.studentLedgers) ? data.studentLedgers.length : 0,
        ].reduce((sum, value) => sum + value, 0);
      };

      const items = page.items.map((row) => {
        const recoveryMeta = row.recoveryMeta || {};
        return {
          id: row.id,
          schoolId: normalizeSchoolId(row.schoolId),
          term: String(row.term || "").trim() || null,
          academicYear: String(row.academicYear || "").trim() || null,
          backupType: String(row.backupType || "manual").trim() || "manual",
          timestamp: Number(row.timestamp || 0) || toMillisValue(row.createdAt) || 0,
          createdAt: toMillisValue(row.createdAt),
          recoveryMeta: {
            title: recoveryMeta.title || null,
            description: recoveryMeta.description || null,
            recordCount:
              Number(recoveryMeta.recordCount || 0) ||
              computeBackupRecordCount(row),
            collections: Array.isArray(recoveryMeta.collections)
              ? recoveryMeta.collections
              : [],
          },
          recordCount: computeBackupRecordCount(row),
        };
      });

      let schools = [];
      if (includeSchools) {
        const schoolRows = await fetchCollectionRows({
          collectionName: "schools",
          limitCount: 3000,
          orderField: "createdAt",
        });
        schools = schoolRows.map((row) => ({
          id: row.id,
          name: String(row.name || "Unnamed School").trim() || "Unnamed School",
        }));
      }

      const payload = {
        items,
        schools,
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
      };
      setCachedSuperAdminView(cacheKey, payload);
      return res.json({
        success: true,
        cached: false,
        ...payload,
      });
    } catch (error) {
      console.error("Backups page error:", error.message || error);
      return res.status(500).json({
        error: error.message || "Failed to load backups page",
      });
    }
  },
);

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
        featurePlan,
        billingStartType,
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

      const validFeaturePlans = ["starter", "standard"];
      if (featurePlan && !validFeaturePlans.includes(featurePlan)) {
        return res.status(400).json({ error: "Invalid feature plan type" });
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
        featurePlan: featurePlan || "starter",
        billing: {
          startType:
            billingStartType === "mid_term" ? "mid_term" : "term_start",
        },
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
      clearSuperAdminViewCache();
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

      clearSuperAdminViewCache();
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

      clearSuperAdminViewCache();
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

      clearSuperAdminViewCache();
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
    const responseStart = Date.now();
    try {
      const { messages } = req.body;
      if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "messages array is required" });
      }

      const latestUserMessage = [...messages]
        .reverse()
        .find((message) => message?.role === "user")?.content;
      const latestPrompt = String(latestUserMessage || "");
      const promptIntent = detectAiPromptIntents(latestPrompt);
      const openAiFirstMode =
        Boolean(OPENAI_API_KEY) && SUPERADMIN_AI_MODE === "openai_first";
      const shouldSkipContext =
        promptIntent.isSmallTalk || promptIntent.asksCapabilities;

      const dataContext = shouldSkipContext
        ? {
            generatedAt: Date.now(),
            totals: {
              schools: 0,
              activeSchools: 0,
              inactiveSchools: 0,
              users: 0,
              schoolAdmins: 0,
              teachers: 0,
              plans: 0,
              payments: 0,
              broadcasts: 0,
              backups: 0,
              failedLogins: 0,
              openSuspiciousEvents: 0,
            },
            schools: [],
            users: [],
            schoolAdmins: [],
            plans: [],
            recentActivity: [],
            payments: [],
            broadcasts: [],
            backups: [],
            securityLoginLogs: [],
            suspiciousEvents: [],
            auditLogs: [],
            usersByRole: {},
          }
        : await buildAiDataContext({
            includeSchools: true,
            includeActivity: true,
            includeSchoolAdmins: true,
            includeUsers: true,
            includePlans: true,
            includePayments: true,
            includeBroadcasts: true,
            includeBackups: true,
            includeSecurityLogs: true,
            includeSuspiciousEvents: true,
            includeAuditLogs: true,
            schoolsLimit: 260,
            activityLimit: 220,
            schoolAdminsLimit: 220,
            usersLimit: 520,
            plansLimit: 160,
            paymentsLimit: 520,
            broadcastsLimit: 180,
            backupsLimit: 220,
            securityLogsLimit: 300,
            suspiciousEventsLimit: 220,
            auditLogsLimit: 260,
            forceRefresh: promptIntent.asksFreshData,
          });
      let parsed = buildLocalAiResponse({
        messages,
        dataContext,
      });
      let aiMode = "local";
      const shouldEscalateToOpenAi =
        openAiFirstMode &&
        !parsed?.action &&
        !promptIntent.isSmallTalk &&
        !promptIntent.asksCapabilities &&
        isGenericLocalFallbackReply(parsed?.reply);

      if (shouldEscalateToOpenAi) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(
            () => controller.abort(),
            Math.max(1200, SUPERADMIN_OPENAI_TIMEOUT_MS),
          );
          try {
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
                signal: controller.signal,
              },
            );

            const data = await response.json();
            if (response.ok) {
              const content = data?.choices?.[0]?.message?.content || "";
              const parsedOpenAi = parseAiResponse(content);
              if (parsedOpenAi?.reply) {
                parsed = parsedOpenAi;
                aiMode = "openai";
              }
            } else {
              console.warn(
                "OpenAI request failed, switching to local assistant mode:",
                data?.error?.message || "unknown error",
              );
            }
          } finally {
            clearTimeout(timeoutId);
          }
        } catch (openAiError) {
          console.warn(
            "OpenAI chat failed, switching to local assistant mode:",
            openAiError?.message || openAiError,
          );
        }
      }

      const responseMs = Date.now() - responseStart;
      const fallbackUsed =
        Boolean(OPENAI_API_KEY) && shouldEscalateToOpenAi && aiMode !== "openai";

      void logActivity({
        eventType: "superadmin_ai_chat",
        schoolId: null,
        actorUid: req.user.uid,
        actorRole: "super_admin",
        entityId: null,
        meta: {
          promptCount: messages.length,
          actionType: parsed?.action?.type || null,
          mode: aiMode,
          responseMs,
        },
      });

      void recordAiTelemetry({
        type: "chat",
        actorUid: req.user.uid,
        mode: aiMode,
        responseMs,
        fallbackUsed,
        actionSuggested: Boolean(parsed?.action?.type),
      });

      return res.json({
        reply: parsed.reply || "",
        action: parsed.action || null,
        mode: aiMode,
        dataAsOf: dataContext?.generatedAt || null,
        responseMs,
      });
    } catch (error) {
      console.error("AI chat error:", error.message || error);
      void recordAiTelemetry({
        type: "chat",
        actorUid: req.user?.uid || null,
        mode: "error",
        responseMs: Date.now() - responseStart,
        fallbackUsed: false,
        actionSuggested: false,
        success: false,
        error: String(error?.message || error),
      });
      return res.status(500).json({ error: error.message || "AI chat failed" });
    }
  },
);

/**
 * Super Admin AI action validator
 * POST /api/superadmin/ai-action-validate
 */
app.post(
  "/api/superadmin/ai-action-validate",
  authLimiter,
  authMiddleware,
  superAdminMiddleware,
  async (req, res) => {
    try {
      const { action } = req.body || {};
      if (!action || !action.type) {
        return res.status(400).json({ error: "action.type is required" });
      }

      const validation = validateAiActionPayload(action);
      return res.json(validation);
    } catch (error) {
      console.error("AI action validation error:", error.message || error);
      return res
        .status(500)
        .json({ error: error.message || "AI action validation failed" });
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
    const actionStart = Date.now();
    try {
      const { action } = req.body || {};
      if (!action || !action.type) {
        return res.status(400).json({ error: "action.type is required" });
      }
      const validation = validateAiActionPayload(action);
      if (!validation.valid) {
        return res.status(400).json({
          error: `Action is missing required fields: ${validation.missingFields.join(", ")}`,
          validation,
        });
      }

      const payload = validation.payload || {};
      let actionResult = null;
      let entityId = null;
      let schoolId = null;
      let actionType = validation.type;

      switch (actionType) {
        case "create_school": {
          const { name, phone, address, logoUrl, plan, featurePlan, billingStartType } =
            payload;
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
            counter += 1;
            if (counter > 999) {
              schoolCode = `${baseCode}${Math.floor(Math.random() * 1000)}`;
            }
          }

          const schoolRef = admin.firestore().collection("schools").doc();
          schoolId = schoolRef.id;
          entityId = schoolId;

          const now = Date.now();
          const trialEndsAt =
            plan === "trial" ? new Date(now + 30 * 24 * 60 * 60 * 1000) : null;

          await schoolRef.set({
            schoolId,
            name: name.trim(),
            code: schoolCode,
            phone: phone ? phone.trim() : "",
            address: address ? address.trim() : "",
            logoUrl: logoUrl ? logoUrl.trim() : "",
            status: "active",
            plan,
            planEndsAt: trialEndsAt,
            featurePlan: featurePlan || "starter",
            billing: {
              startType:
                billingStartType === "mid_term" ? "mid_term" : "term_start",
            },
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            createdBy: req.user.uid,
          });

          await logActivity({
            eventType: "school_created",
            schoolId,
            actorUid: req.user.uid,
            actorRole: "super_admin",
            entityId: schoolId,
            meta: { name: name.trim(), plan },
          });

          actionResult = {
            schoolId,
            code: schoolCode,
            message: "School created successfully",
          };
          break;
        }
        case "create_school_admin": {
          const { schoolId: targetSchoolId, fullName, email, password } = payload;
          const schoolDoc = await admin
            .firestore()
            .collection("schools")
            .doc(targetSchoolId.trim())
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
            : `${Math.random().toString(36).slice(-8)}Aa1!`;

          const userRecord = await admin.auth().createUser({
            email: email.trim(),
            password: authPassword,
            displayName: fullName.trim(),
          });

          await admin
            .firestore()
            .collection("users")
            .doc(userRecord.uid)
            .set({
              fullName: fullName.trim(),
              email: email.trim(),
              role: "school_admin",
              schoolId: targetSchoolId.trim(),
              status: "active",
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });

          schoolId = targetSchoolId.trim();
          entityId = userRecord.uid;

          await logActivity({
            eventType: "school_admin_created",
            schoolId,
            actorUid: req.user.uid,
            actorRole: "super_admin",
            entityId: userRecord.uid,
            meta: { email: email.trim(), fullName: fullName.trim() },
          });

          actionResult = {
            uid: userRecord.uid,
            email: email.trim(),
            message: "School admin created successfully",
          };
          break;
        }
        case "update_school_admin_email": {
          const { adminUid, newEmail, fullName } = payload;
          const trimmedEmail = trimToString(newEmail, 120).toLowerCase();
          const trimmedFullName = trimToString(fullName, 120);

          const userRecord = await admin.auth().getUser(adminUid);
          if (!userRecord) {
            return res.status(404).json({ error: "Admin user not found" });
          }

          if (userRecord.email && userRecord.email !== trimmedEmail) {
            try {
              const existingUser = await admin.auth().getUserByEmail(trimmedEmail);
              if (existingUser.uid !== adminUid) {
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

          const userRef = admin.firestore().collection("users").doc(adminUid);
          const userDoc = await userRef.get();
          if (!userDoc.exists) {
            return res.status(404).json({ error: "Admin profile not found" });
          }
          const userData = userDoc.data() || {};
          if (trimToString(userData.role, 32) !== "school_admin") {
            return res
              .status(400)
              .json({ error: "Target user is not a school admin" });
          }

          const previousEmail = trimToString(
            userRecord.email || userData.email,
            120,
          ).toLowerCase();
          const previousFullName = trimToString(
            userData.fullName || userRecord.displayName,
            120,
          );

          await admin.auth().updateUser(adminUid, {
            email: trimmedEmail,
            ...(trimmedFullName ? { displayName: trimmedFullName } : {}),
          });

          await userRef.set(
            {
              email: trimmedEmail,
              ...(trimmedFullName ? { fullName: trimmedFullName } : {}),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true },
          );

          schoolId = trimToString(userData.schoolId, 80) || null;
          entityId = adminUid;

          await logActivity({
            eventType: "school_admin_email_updated",
            schoolId,
            actorUid: req.user.uid,
            actorRole: "super_admin",
            entityId: adminUid,
            meta: {
              previousEmail,
              newEmail: trimmedEmail,
            },
          });

          actionResult = {
            adminUid,
            previousEmail,
            newEmail: trimmedEmail,
            previousFullName: previousFullName || null,
            fullName: trimmedFullName || previousFullName || null,
            message: "Admin email updated successfully",
          };
          break;
        }
        case "reset_school_admin_password": {
          const { adminUid } = payload;
          const userRecord = await admin.auth().getUser(adminUid);
          if (!userRecord.email) {
            return res.status(400).json({ error: "Admin email not found" });
          }

          const resetLink = await admin
            .auth()
            .generatePasswordResetLink(userRecord.email);

          entityId = adminUid;
          schoolId = null;

          await logActivity({
            eventType: "school_admin_password_reset",
            schoolId,
            actorUid: req.user.uid,
            actorRole: "super_admin",
            entityId: adminUid,
            meta: { email: userRecord.email },
          });

          actionResult = {
            email: userRecord.email,
            resetLink,
            message: "Password reset link generated successfully",
          };
          break;
        }
        case "provision_user": {
          const { uid, role, schoolId: targetSchoolId, fullName, email } = payload;
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

          await admin.firestore().collection("users").doc(uid).set({
            fullName: fullName.trim(),
            email: email.trim(),
            role: role.trim(),
            ...(targetSchoolId && { schoolId: targetSchoolId.trim() }),
            status: "active",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          schoolId = targetSchoolId || null;
          entityId = uid;

          await logActivity({
            eventType: "user_provisioned",
            schoolId,
            actorUid: req.user.uid,
            actorRole: "super_admin",
            entityId: uid,
            meta: { role, email: email.trim(), fullName: fullName.trim() },
          });

          actionResult = {
            uid,
            message: "User profile provisioned successfully",
          };
          break;
        }
        case "set_school_status": {
          const { schoolId: targetSchoolId, status } = payload;
          const schoolRef = admin
            .firestore()
            .collection("schools")
            .doc(targetSchoolId.trim());
          const schoolDoc = await schoolRef.get();
          if (!schoolDoc.exists) {
            return res.status(404).json({ error: "School not found" });
          }

          const schoolData = schoolDoc.data() || {};
          const previousStatus = trimToString(schoolData.status || "active", 24);
          await schoolRef.set(
            {
              status,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true },
          );

          schoolId = targetSchoolId.trim();
          entityId = schoolId;

          await logActivity({
            eventType: "school_status_updated",
            schoolId,
            actorUid: req.user.uid,
            actorRole: "super_admin",
            entityId: schoolId,
            meta: { previousStatus, status },
          });

          actionResult = {
            schoolId,
            previousStatus,
            status,
            message: `School status updated to ${status}`,
          };
          break;
        }
        case "set_school_plan": {
          const { schoolId: targetSchoolId, plan } = payload;
          const schoolRef = admin
            .firestore()
            .collection("schools")
            .doc(targetSchoolId.trim());
          const schoolDoc = await schoolRef.get();
          if (!schoolDoc.exists) {
            return res.status(404).json({ error: "School not found" });
          }

          const schoolData = schoolDoc.data() || {};
          const previousPlan = trimToString(schoolData.plan || "trial", 24);
          await schoolRef.set(
            {
              plan,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true },
          );

          schoolId = targetSchoolId.trim();
          entityId = schoolId;

          await logActivity({
            eventType: "school_plan_updated",
            schoolId,
            actorUid: req.user.uid,
            actorRole: "super_admin",
            entityId: schoolId,
            meta: { previousPlan, plan },
          });

          actionResult = {
            schoolId,
            previousPlan,
            plan,
            message: `School plan updated to ${plan}`,
          };
          break;
        }
        case "set_school_feature_plan": {
          const { schoolId: targetSchoolId, featurePlan } = payload;
          const schoolRef = admin
            .firestore()
            .collection("schools")
            .doc(targetSchoolId.trim());
          const schoolDoc = await schoolRef.get();
          if (!schoolDoc.exists) {
            return res.status(404).json({ error: "School not found" });
          }

          const schoolData = schoolDoc.data() || {};
          const previousFeaturePlan = trimToString(
            schoolData.featurePlan || "starter",
            24,
          );
          await schoolRef.set(
            {
              featurePlan,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true },
          );

          schoolId = targetSchoolId.trim();
          entityId = schoolId;

          await logActivity({
            eventType: "school_feature_plan_updated",
            schoolId,
            actorUid: req.user.uid,
            actorRole: "super_admin",
            entityId: schoolId,
            meta: { previousFeaturePlan, featurePlan },
          });

          actionResult = {
            schoolId,
            previousFeaturePlan,
            featurePlan,
            message: `School feature plan updated to ${featurePlan}`,
          };
          break;
        }
        case "upsert_plan": {
          const { id, name, maxStudents } = payload;
          const planId = trimToString(id, 80).toLowerCase();
          const planName = trimToString(name, 120);
          const max = Math.max(0, Math.floor(Number(maxStudents) || 0));
          const planRef = admin.firestore().collection("plans").doc(planId);
          const existingPlanDoc = await planRef.get();
          const previousPlan = existingPlanDoc.exists
            ? { id: planId, ...(existingPlanDoc.data() || {}) }
            : null;

          const nextPlanData = {
            name: planName,
            maxStudents: max,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            ...(existingPlanDoc.exists
              ? {}
              : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
          };
          await planRef.set(nextPlanData, { merge: true });

          entityId = planId;
          schoolId = null;

          await logActivity({
            eventType: "plan_upserted",
            schoolId,
            actorUid: req.user.uid,
            actorRole: "super_admin",
            entityId: planId,
            meta: {
              previousName: previousPlan?.name || null,
              previousMaxStudents: Number(previousPlan?.maxStudents || 0),
              name: planName,
              maxStudents: max,
            },
          });

          actionResult = {
            id: planId,
            previousPlan,
            plan: {
              id: planId,
              name: planName,
              maxStudents: max,
            },
            message: "Plan saved successfully",
          };
          break;
        }
        case "delete_plan": {
          const { id } = payload;
          const planId = trimToString(id, 80).toLowerCase();
          const planRef = admin.firestore().collection("plans").doc(planId);
          const planDoc = await planRef.get();
          if (!planDoc.exists) {
            return res.status(404).json({ error: "Plan not found" });
          }

          const assignedSchools = await admin
            .firestore()
            .collection("schools")
            .where("subscription.planId", "==", planId)
            .limit(10)
            .get();

          if (!assignedSchools.empty) {
            const sampleSchoolNames = assignedSchools.docs
              .slice(0, 3)
              .map((docSnap) => trimToString(docSnap.data()?.name, 80))
              .filter(Boolean)
              .join(", ");
            return res.status(400).json({
              error: `Cannot delete plan because it is assigned to ${assignedSchools.size} school(s)${sampleSchoolNames ? `: ${sampleSchoolNames}` : ""}`,
            });
          }

          const deletedPlan = { id: planId, ...(planDoc.data() || {}) };
          await planRef.delete();

          entityId = planId;
          schoolId = null;

          await logActivity({
            eventType: "plan_deleted",
            schoolId,
            actorUid: req.user.uid,
            actorRole: "super_admin",
            entityId: planId,
            meta: {
              name: deletedPlan?.name || null,
              maxStudents: Number(deletedPlan?.maxStudents || 0),
            },
          });

          actionResult = {
            id: planId,
            deletedPlan,
            message: "Plan deleted successfully",
          };
          break;
        }
        case "assign_school_subscription_plan": {
          const { schoolId: targetSchoolId, planId } = payload;
          const schoolRef = admin
            .firestore()
            .collection("schools")
            .doc(targetSchoolId.trim());
          const schoolDoc = await schoolRef.get();
          if (!schoolDoc.exists) {
            return res.status(404).json({ error: "School not found" });
          }

          const planDoc = await admin
            .firestore()
            .collection("plans")
            .doc(trimToString(planId, 80).toLowerCase())
            .get();
          if (!planDoc.exists) {
            return res.status(404).json({ error: "Plan not found" });
          }

          const planData = planDoc.data() || {};
          const schoolData = schoolDoc.data() || {};
          const previousPlanId = trimToString(
            schoolData?.subscription?.planId,
            80,
          );
          const previousMaxStudents = Number(
            schoolData?.limits?.maxStudents || 0,
          );
          const nextPlanId = trimToString(planDoc.id, 80);
          const maxStudents = Number(planData.maxStudents || 0);

          await schoolRef.set(
            {
              subscription: { planId: nextPlanId },
              limits: { maxStudents },
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true },
          );

          schoolId = targetSchoolId.trim();
          entityId = schoolId;

          await logActivity({
            eventType: "school_subscription_plan_assigned",
            schoolId,
            actorUid: req.user.uid,
            actorRole: "super_admin",
            entityId: schoolId,
            meta: {
              previousPlanId: previousPlanId || null,
              planId: nextPlanId,
              maxStudents,
            },
          });

          actionResult = {
            schoolId,
            previousPlanId: previousPlanId || null,
            planId: nextPlanId,
            previousMaxStudents,
            maxStudents,
            message: "Configured plan assigned successfully",
          };
          break;
        }
        default: {
          return res.status(400).json({ error: "Unknown action type" });
        }
      }

      await logActivity({
        eventType: "superadmin_ai_action_confirmed",
        schoolId,
        actorUid: req.user.uid,
        actorRole: "super_admin",
        entityId,
        meta: { actionType },
      });

      const undo = await createAiActionAudit({
        actorUid: req.user.uid,
        actionType,
        description: validation.description,
        payload,
        result: actionResult,
        entityId,
        schoolId,
        canUndo: validation.canUndo,
      });

      void recordAiTelemetry({
        type: "action_confirm",
        actorUid: req.user.uid,
        actionType,
        success: true,
        responseMs: Date.now() - actionStart,
      });

      return res.json({
        success: true,
        actionType,
        result: actionResult,
        undo: undo || null,
      });
    } catch (error) {
      console.error("AI action error:", error.message || error);
      void recordAiTelemetry({
        type: "action_confirm",
        actorUid: req.user?.uid || null,
        actionType: String(req.body?.action?.type || ""),
        success: false,
        responseMs: Date.now() - actionStart,
        error: String(error?.message || error),
      });
      return res
        .status(500)
        .json({ error: error.message || "AI action failed" });
    }
  },
);

/**
 * Super Admin AI undo action
 * POST /api/superadmin/ai-action-undo
 */
app.post(
  "/api/superadmin/ai-action-undo",
  authLimiter,
  authMiddleware,
  superAdminMiddleware,
  async (req, res) => {
    const undoStart = Date.now();
    try {
      const undoToken = trimToString(req.body?.undoToken, 160);
      if (!undoToken) {
        return res.status(400).json({ error: "undoToken is required" });
      }

      const historySnap = await admin
        .firestore()
        .collection("ai_action_history")
        .where("undoToken", "==", undoToken)
        .limit(1)
        .get();

      if (historySnap.empty) {
        return res.status(404).json({ error: "Undo token not found" });
      }

      const historyDoc = historySnap.docs[0];
      const history = historyDoc.data() || {};
      if (!history.canUndo) {
        return res.status(400).json({ error: "This action cannot be undone" });
      }
      if (history.undoneAt) {
        return res.status(409).json({ error: "This action was already undone" });
      }
      if (history.undoBefore && Date.now() > Number(history.undoBefore)) {
        return res
          .status(410)
          .json({ error: "Undo window has expired for this action" });
      }

      const actionType = trimToString(history.actionType, 80);
      const result = history.result || {};
      const payload = history.payload || {};

      switch (actionType) {
        case "create_school": {
          const schoolId = trimToString(result.schoolId || payload.schoolId, 80);
          if (schoolId) {
            await admin.firestore().collection("schools").doc(schoolId).delete();
          }
          break;
        }
        case "create_school_admin": {
          const adminUid = trimToString(result.uid || payload.adminUid, 120);
          if (!adminUid) {
            return res
              .status(400)
              .json({ error: "Missing admin UID for undo operation" });
          }
          await admin.auth().updateUser(adminUid, { disabled: true });
          await admin.firestore().collection("users").doc(adminUid).delete();
          break;
        }
        case "update_school_admin_email": {
          const adminUid = trimToString(result.adminUid || payload.adminUid, 120);
          const previousEmail = trimToString(
            result.previousEmail || payload.previousEmail,
            120,
          ).toLowerCase();
          const previousFullName = trimToString(result.previousFullName, 120);
          if (!adminUid || !previousEmail) {
            return res.status(400).json({
              error: "Missing adminUid or previousEmail for undo operation",
            });
          }
          await admin.auth().updateUser(adminUid, {
            email: previousEmail,
            ...(previousFullName ? { displayName: previousFullName } : {}),
          });
          await admin
            .firestore()
            .collection("users")
            .doc(adminUid)
            .set(
              {
                email: previousEmail,
                ...(previousFullName ? { fullName: previousFullName } : {}),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true },
            );
          break;
        }
        case "provision_user": {
          const uid = trimToString(result.uid || payload.uid, 120);
          if (!uid) {
            return res
              .status(400)
              .json({ error: "Missing UID for undo operation" });
          }
          await admin.firestore().collection("users").doc(uid).delete();
          break;
        }
        case "set_school_status": {
          const schoolId = trimToString(result.schoolId || payload.schoolId, 80);
          const previousStatus = trimToString(result.previousStatus, 24);
          if (!schoolId || !previousStatus) {
            return res.status(400).json({
              error: "Missing schoolId or previousStatus for undo operation",
            });
          }
          await admin
            .firestore()
            .collection("schools")
            .doc(schoolId)
            .set(
              {
                status: previousStatus,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true },
            );
          break;
        }
        case "set_school_plan": {
          const schoolId = trimToString(result.schoolId || payload.schoolId, 80);
          const previousPlan = trimToString(result.previousPlan, 24);
          if (!schoolId || !previousPlan) {
            return res.status(400).json({
              error: "Missing schoolId or previousPlan for undo operation",
            });
          }
          await admin
            .firestore()
            .collection("schools")
            .doc(schoolId)
            .set(
              {
                plan: previousPlan,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true },
            );
          break;
        }
        case "set_school_feature_plan": {
          const schoolId = trimToString(result.schoolId || payload.schoolId, 80);
          const previousFeaturePlan = trimToString(result.previousFeaturePlan, 24);
          if (!schoolId || !previousFeaturePlan) {
            return res.status(400).json({
              error:
                "Missing schoolId or previousFeaturePlan for undo operation",
            });
          }
          await admin
            .firestore()
            .collection("schools")
            .doc(schoolId)
            .set(
              {
                featurePlan: previousFeaturePlan,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true },
            );
          break;
        }
        case "upsert_plan": {
          const planId = trimToString(result.id || payload.id, 80).toLowerCase();
          if (!planId) {
            return res
              .status(400)
              .json({ error: "Missing id for undo operation" });
          }
          const previousPlan = result.previousPlan || null;
          if (previousPlan && typeof previousPlan === "object") {
            const restoredPlan = { ...(previousPlan || {}) };
            delete restoredPlan.id;
            await admin
              .firestore()
              .collection("plans")
              .doc(planId)
              .set(
                {
                  ...restoredPlan,
                  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                },
                { merge: true },
              );
          } else {
            await admin.firestore().collection("plans").doc(planId).delete();
          }
          break;
        }
        case "delete_plan": {
          const planId = trimToString(result.id || payload.id, 80).toLowerCase();
          const deletedPlan = result.deletedPlan || null;
          if (!planId || !deletedPlan) {
            return res.status(400).json({
              error: "Missing id or deletedPlan for undo operation",
            });
          }
          const restoredPlan = { ...(deletedPlan || {}) };
          delete restoredPlan.id;
          await admin
            .firestore()
            .collection("plans")
            .doc(planId)
            .set(
              {
                ...restoredPlan,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                ...(restoredPlan.createdAt
                  ? {}
                  : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
              },
              { merge: true },
            );
          break;
        }
        case "assign_school_subscription_plan": {
          const schoolId = trimToString(result.schoolId || payload.schoolId, 80);
          if (!schoolId) {
            return res
              .status(400)
              .json({ error: "Missing schoolId for undo operation" });
          }
          const previousPlanId = trimToString(result.previousPlanId, 80);
          const previousMaxStudents = Number(result.previousMaxStudents || 0);
          await admin
            .firestore()
            .collection("schools")
            .doc(schoolId)
            .set(
              {
                subscription: previousPlanId ? { planId: previousPlanId } : {},
                limits: { maxStudents: previousMaxStudents },
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true },
            );
          break;
        }
        default:
          return res
            .status(400)
            .json({ error: "Undo is not supported for this action type" });
      }

      await historyDoc.ref.set(
        {
          undoneAt: admin.firestore.FieldValue.serverTimestamp(),
          undoneBy: req.user.uid,
          undoResult: { success: true },
        },
        { merge: true },
      );

      await logActivity({
        eventType: "superadmin_ai_action_undone",
        schoolId: history.schoolId || null,
        actorUid: req.user.uid,
        actorRole: "super_admin",
        entityId: history.entityId || null,
        meta: { actionType },
      });

      void recordAiTelemetry({
        type: "action_undo",
        actorUid: req.user.uid,
        actionType,
        success: true,
        responseMs: Date.now() - undoStart,
      });

      return res.json({
        success: true,
        actionType,
        message: "Action undone successfully",
      });
    } catch (error) {
      console.error("AI undo error:", error.message || error);
      void recordAiTelemetry({
        type: "action_undo",
        actorUid: req.user?.uid || null,
        success: false,
        responseMs: Date.now() - undoStart,
        error: String(error?.message || error),
      });
      return res
        .status(500)
        .json({ error: error.message || "AI undo failed" });
    }
  },
);

/**
 * Super Admin AI feedback
 * POST /api/superadmin/ai-feedback
 */
app.post(
  "/api/superadmin/ai-feedback",
  authLimiter,
  authMiddleware,
  superAdminMiddleware,
  async (req, res) => {
    try {
      const messageId = trimToString(req.body?.messageId, 160);
      const conversationId = trimToString(req.body?.conversationId, 120);
      const rating = trimToString(req.body?.rating, 10).toLowerCase();
      const message = trimToString(req.body?.message, 2000);
      if (!messageId || !conversationId) {
        return res
          .status(400)
          .json({ error: "messageId and conversationId are required" });
      }
      if (!["up", "down"].includes(rating)) {
        return res.status(400).json({ error: "rating must be up or down" });
      }

      await admin.firestore().collection("ai_feedback").add({
        actorUid: req.user.uid,
        actorRole: "super_admin",
        messageId,
        conversationId,
        rating,
        message,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        timestampMs: Date.now(),
      });

      void recordAiTelemetry({
        type: "feedback",
        actorUid: req.user.uid,
        success: true,
        rating,
      });

      return res.json({ success: true });
    } catch (error) {
      console.error("AI feedback error:", error.message || error);
      return res
        .status(500)
        .json({ error: error.message || "AI feedback failed" });
    }
  },
);

/**
 * Super Admin AI metrics
 * GET /api/superadmin/ai-metrics
 */
app.get(
  "/api/superadmin/ai-metrics",
  authLimiter,
  authMiddleware,
  superAdminMiddleware,
  async (req, res) => {
    try {
      const periodDays = Math.max(1, Math.min(90, Number(req.query.days) || 14));
      const cutoffMs = Date.now() - periodDays * 24 * 60 * 60 * 1000;

      const telemetrySnap = await admin
        .firestore()
        .collection("ai_telemetry")
        .where("timestampMs", ">=", cutoffMs)
        .limit(5000)
        .get();
      const feedbackSnap = await admin
        .firestore()
        .collection("ai_feedback")
        .where("timestampMs", ">=", cutoffMs)
        .limit(5000)
        .get();

      const telemetryRows = telemetrySnap.docs.map((doc) => doc.data() || {});
      const feedbackRows = feedbackSnap.docs.map((doc) => doc.data() || {});

      const chatRows = telemetryRows.filter(
        (row) => row.type === "chat" && row.success !== false,
      );
      const responseSeries = chatRows
        .map((row) => Number(row.responseMs || 0))
        .filter((value) => Number.isFinite(value) && value > 0)
        .sort((a, b) => a - b);
      const totalChats = chatRows.length;
      const avgResponseMs = responseSeries.length
        ? Math.round(
            responseSeries.reduce((sum, value) => sum + value, 0) /
              responseSeries.length,
          )
        : 0;
      const p95ResponseMs = responseSeries.length
        ? responseSeries[Math.max(0, Math.floor(responseSeries.length * 0.95) - 1)]
        : 0;
      const fallbackUsedCount = chatRows.filter((row) => row.fallbackUsed).length;
      const fallbackRate = totalChats
        ? Number(((fallbackUsedCount / totalChats) * 100).toFixed(2))
        : 0;

      const actionRows = telemetryRows.filter((row) => row.type === "action_confirm");
      const successfulActionCount = actionRows.filter((row) => row.success).length;
      const actionSuccessRate = actionRows.length
        ? Number(((successfulActionCount / actionRows.length) * 100).toFixed(2))
        : 0;

      const positiveFeedback = feedbackRows.filter(
        (row) => String(row.rating) === "up",
      ).length;
      const negativeFeedback = feedbackRows.filter(
        (row) => String(row.rating) === "down",
      ).length;
      const feedbackTotal = positiveFeedback + negativeFeedback;
      const feedbackPositiveRate = feedbackTotal
        ? Number(((positiveFeedback / feedbackTotal) * 100).toFixed(2))
        : 0;

      return res.json({
        success: true,
        periodDays,
        totalChats,
        avgResponseMs,
        p95ResponseMs,
        fallbackRate,
        actionSuccessRate,
        feedbackPositiveRate,
        positiveFeedback,
        negativeFeedback,
      });
    } catch (error) {
      console.error("AI metrics error:", error.message || error);
      return res
        .status(500)
        .json({ error: error.message || "AI metrics failed" });
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
            module: "billing",
            type: "subscription",
            category: "subscription",
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
            module: "billing",
            type: "subscription",
            category: "subscription",
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
              module: "billing",
              type: "subscription",
              category: "subscription",
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
            module: "billing",
            type: "subscription",
            category: "subscription",
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

      clearSuperAdminViewCache();
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

      clearSuperAdminViewCache();
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

      clearSuperAdminViewCache();
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
