import fs from "fs";
import os from "os";
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
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const escapeHtml = (unsafe) => {
  return String(unsafe || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

const normalizeWhatsappAddress = (addr) => {
  if (!addr) return "";
  let clean = String(addr).trim();
  // Ensure it starts with whatsapp: prefix and a +
  if (!clean.startsWith("whatsapp:")) {
    const phone = clean.startsWith("+") ? clean : "+" + clean;
    clean = `whatsapp:${phone}`;
  } else {
    // If it already has whatsapp: prefix, ensure the phone part has +
    const parts = clean.split(":");
    const phone = parts[1].startsWith("+") ? parts[1] : "+" + parts[1];
    clean = `whatsapp:${phone}`;
  }
  return clean;
};

const parseNumericBalance = (value) => {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const match = String(value).replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
};

const readJsonResponse = async (response) => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
};

const fetchArkeselBalanceDetails = async (apiKey) => {
  const primaryRes = await fetch("https://sms.arkesel.com/api/v2/clients/balance-details", {
    method: "GET",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
    },
  });
  const primaryData = await readJsonResponse(primaryRes);

  if (primaryRes.ok && primaryData?.status === "success") {
    const data = primaryData.data || {};
    const smsBalance = parseNumericBalance(data.sms_balance ?? data.balance);
    const mainBalance = parseNumericBalance(data.main_balance);
    return {
      smsBalance,
      mainBalance,
      raw: primaryData,
      source: "v2",
    };
  }

  const fallbackRes = await fetch("https://sms.arkesel.com/sms/api?action=check-balance", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "check-balance",
      api_key: apiKey,
      response: "json",
    }),
  });
  const fallbackData = await readJsonResponse(fallbackRes);

  if (fallbackRes.ok && fallbackData && fallbackData.balance !== undefined) {
    return {
      smsBalance: parseNumericBalance(fallbackData.balance),
      mainBalance: parseNumericBalance(fallbackData.main_balance),
      raw: fallbackData,
      source: "v1",
    };
  }

  const message =
    fallbackData?.message ||
    primaryData?.message ||
    primaryData?.error ||
    `Arkesel balance request failed with status ${primaryRes.status}`;
  const error = new Error(message);
  error.primary = primaryData;
  error.fallback = fallbackData;
  throw error;
};

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

const LOCAL_DEV_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

const PRODUCTION_APP_ORIGINS = [
  "https://schoolmanagergh.com",
  "https://www.schoolmanagergh.com",
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
  ...PRODUCTION_APP_ORIGINS.map((origin) => normalizeOriginValue(origin)),
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

const REQUEST_LIMIT = process.env.REQUEST_BODY_LIMIT || "10mb";
app.use(
  express.json({
    limit: REQUEST_LIMIT,
    verify: (req, res, buf) => {
      req.rawBody = buf.toString();
    },
  }),
);

const API_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const API_LIMIT_MAX_REQUESTS = 300;
const AUTH_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const AUTH_LIMIT_MAX_REQUESTS = 120;

const parsePositiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const REQUEST_METRICS_RETENTION_MS = Math.max(
  5 * 60 * 1000,
  parsePositiveNumber(process.env.REQUEST_METRICS_RETENTION_MS, 60 * 60 * 1000),
);
const REQUEST_METRICS_MAX_POINTS = Math.max(
  2000,
  Math.floor(parsePositiveNumber(process.env.REQUEST_METRICS_MAX_POINTS, 8000)),
);
const REQUEST_METRICS = [];
let ACTIVE_REQUESTS = 0;
let lastRequestMetricsPruneAt = 0;
const HAS_HRTIME_BIGINT = Boolean(
  process?.hrtime && typeof process.hrtime.bigint === "function",
);

const normalizeRequestPath = (value) => {
  const pathOnly = String(value || "/").split("?")[0] || "/";
  const segments = pathOnly.split("/");
  const normalized = segments
    .map((segment, index) => {
      if (!segment || index === 0) return segment;
      const isNumeric = /^\d+$/.test(segment);
      const isLongToken =
        /^[a-f0-9-]{12,}$/i.test(segment) || segment.length > 24;
      return isNumeric || isLongToken ? ":id" : segment;
    })
    .join("/");

  if (normalized.length <= 180) return normalized;
  return `${normalized.slice(0, 177)}...`;
};

const pruneRequestMetrics = (now = Date.now()) => {
  const cutoffMs = now - REQUEST_METRICS_RETENTION_MS;
  while (
    REQUEST_METRICS.length &&
    REQUEST_METRICS[0].timestampMs < cutoffMs
  ) {
    REQUEST_METRICS.shift();
  }
  if (REQUEST_METRICS.length > REQUEST_METRICS_MAX_POINTS) {
    REQUEST_METRICS.splice(
      0,
      REQUEST_METRICS.length - REQUEST_METRICS_MAX_POINTS,
    );
  }
  lastRequestMetricsPruneAt = now;
};

const maybePruneRequestMetrics = (now = Date.now()) => {
  if (
    REQUEST_METRICS.length < REQUEST_METRICS_MAX_POINTS &&
    now - lastRequestMetricsPruneAt < 15000
  ) {
    return;
  }
  pruneRequestMetrics(now);
};

const recordRequestMetric = (entry) => {
  REQUEST_METRICS.push(entry);
  maybePruneRequestMetrics(entry.timestampMs);
};

const resolveElapsedMs = ({ startedAtMs, startedAtNs, startedAtHr }) => {
  try {
    if (HAS_HRTIME_BIGINT && typeof startedAtNs === "bigint") {
      const elapsedNs = process.hrtime.bigint() - startedAtNs;
      const elapsedMs = Number(elapsedNs) / 1_000_000;
      if (Number.isFinite(elapsedMs) && elapsedMs >= 0) return elapsedMs;
    }
    if (
      Array.isArray(startedAtHr) &&
      process?.hrtime &&
      typeof process.hrtime === "function"
    ) {
      const diff = process.hrtime(startedAtHr);
      const elapsedMs = (Number(diff[0] || 0) * 1000) + Number(diff[1] || 0) / 1_000_000;
      if (Number.isFinite(elapsedMs) && elapsedMs >= 0) return elapsedMs;
    }
  } catch {
    // Fall back to Date-based timing below.
  }
  return Math.max(0, Date.now() - startedAtMs);
};

app.use((req, res, next) => {
  try {
    const startedAtMs = Date.now();
    const startedAtNs = HAS_HRTIME_BIGINT ? process.hrtime.bigint() : null;
    const startedAtHr =
      process?.hrtime && typeof process.hrtime === "function"
        ? process.hrtime()
        : null;
    const method = String(req.method || "GET").toUpperCase();
    const path = normalizeRequestPath(req.originalUrl || req.url || "/");
    ACTIVE_REQUESTS += 1;

    let finalized = false;
    const finalizeMetric = (statusCode, aborted = false) => {
      if (finalized) return;
      finalized = true;
      ACTIVE_REQUESTS = Math.max(0, ACTIVE_REQUESTS - 1);
      const elapsedMs = resolveElapsedMs({
        startedAtMs,
        startedAtNs,
        startedAtHr,
      });
      recordRequestMetric({
        timestampMs: startedAtMs,
        method,
        path,
        statusCode: Number(statusCode) || (aborted ? 499 : 0),
        durationMs: Number.isFinite(elapsedMs) ? elapsedMs : 0,
        aborted,
      });
    };

    res.on("finish", () => {
      finalizeMetric(res.statusCode, false);
    });

    res.on("close", () => {
      if (!res.writableEnded) {
        finalizeMetric(499, true);
        return;
      }
      finalizeMetric(res.statusCode, false);
    });
  } catch (error) {
    console.error("Request metrics middleware error:", error?.message || error);
  } finally {
    next();
  }
});

const apiLimiter = rateLimit({
  windowMs: API_LIMIT_WINDOW_MS,
  limit: API_LIMIT_MAX_REQUESTS,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: "Too many requests from this IP. Please wait and try again later.",
  },
});

const authLimiter = rateLimit({
  windowMs: AUTH_LIMIT_WINDOW_MS,
  limit: AUTH_LIMIT_MAX_REQUESTS,
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

const normalizeStorageBucketName = (value) =>
  String(value || "")
    .trim()
    .replace(/^gs:\/\//i, "")
    .replace(/\/+$/, "");

const getStorageBucketCandidates = () => {
  const configuredBucket = normalizeStorageBucketName(
    process.env.FIREBASE_STORAGE_BUCKET ||
      process.env.GCLOUD_STORAGE_BUCKET ||
      "",
  );
  const appBucket = normalizeStorageBucketName(
    admin.apps.length ? admin.app().options.storageBucket : "",
  );

  return [
    configuredBucket,
    appBucket,
    firebaseProjectId ? `${firebaseProjectId}.appspot.com` : "",
    firebaseProjectId ? `${firebaseProjectId}.firebasestorage.app` : "",
  ].filter((bucket, index, buckets) => bucket && buckets.indexOf(bucket) === index);
};

const FIRESTORE_INLINE_LOGO_MAX_BYTES = 700 * 1024;

const isTransientFirebaseAdminNetworkError = (error) => {
  const message = String(error?.message || error || "").toLowerCase();
  const code = String(error?.code || error?.errorInfo?.code || "").toLowerCase();
  return (
    code === "app/network-error" ||
    message.includes("enotfound") ||
    message.includes("etimedout") ||
    message.includes("econnreset") ||
    message.includes("eai_again") ||
    message.includes("socket hang up")
  );
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const retryFirebaseAdminNetworkCall = async (label, operation) => {
  const delays = [0, 750, 2000];
  let lastError = null;

  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    if (delays[attempt]) {
      await sleep(delays[attempt]);
    }

    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientFirebaseAdminNetworkError(error) || attempt === delays.length - 1) {
        throw error;
      }
      console.warn(
        `[FirebaseAdmin] ${label} failed due to network issue. Retrying ${attempt + 2}/${delays.length}...`,
        error?.message || error,
      );
    }
  }

  throw lastError;
};

if (firebaseProjectId) {
  allowedOrigins.add(`https://${firebaseProjectId}.web.app`);
  allowedOrigins.add(`https://${firebaseProjectId}.firebaseapp.com`);
}

try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket:
      normalizeStorageBucketName(process.env.FIREBASE_STORAGE_BUCKET) ||
      (firebaseProjectId ? `${firebaseProjectId}.appspot.com` : undefined),
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

/**
 * Free Parent Login using Phone Number + Child's Date of Birth
 * Bypasses Firebase SMS OTP limitations by minting a Custom Token.
 * POST /api/auth/parent-login
 */
app.post("/api/auth/parent-login", authLimiter, async (req, res) => {
  try {
    const { phone, dob } = req.body;

    if (!phone || !dob) {
      return res.status(400).json({
        success: false,
        error: "Phone number and Date of Birth are required."
      });
    }

    const rawPhone = String(phone).trim();
    const normalizedPhone = normalizeWhatsappAddress(rawPhone).replace("whatsapp:", "");
    console.log(`[Auth] Parent login attempt for phone: ${normalizedPhone}, DOB: ${dob}`);

    // Generate phone variants to check (normalized, local 0..., and raw digits)
    const phoneVariants = [normalizedPhone, rawPhone, normalizedPhone.replace(/^\+/, "")];
    if (normalizedPhone.startsWith("+233")) {
      phoneVariants.push("0" + normalizedPhone.substring(4));
      phoneVariants.push(normalizedPhone.substring(4));
      phoneVariants.push("233" + normalizedPhone.substring(4));
    }
    // Remove duplicates and empty strings
    const uniquePhoneVariants = [...new Set(phoneVariants.filter(Boolean))];

    // Generate DOB variants (YYYY-MM-DD, MM/DD/YYYY, M/D/YYYY)
    const [y, m, d] = dob.split("-");
    const dobVariants = [
      dob,
      `${m}/${d}/${y}`,
      `${parseInt(m)}/${parseInt(d)}/${y}`
    ];

    const startTime = Date.now();
    // Query by phone variants across all admission contact fields.
    const studentsRef = admin.firestore().collection("students");
    const phoneFields = ["fatherPhone", "motherPhone", "guardianPhone"];
    const snapshots = await Promise.all(
      phoneFields.map((field) =>
        studentsRef.where(field, "in", uniquePhoneVariants.slice(0, 10)).get(),
      ),
    );
    const studentDocsById = new Map();
    snapshots.forEach((snapshot) => {
      snapshot.docs.forEach((doc) => studentDocsById.set(doc.id, doc));
    });
    const candidateDocs = Array.from(studentDocsById.values());
    
    console.log(`[Auth] Phone query found ${candidateDocs.length} potential matches in ${Date.now() - startTime}ms.`);

    // Filter by DOB in memory to handle different date formats
    const matches = candidateDocs.filter(doc => {
      const studentDob = String(doc.data().dob || "").trim();
      return dobVariants.includes(studentDob);
    });

    if (matches.length === 0) {
      return res.status(401).json({
        success: false,
        error: "Invalid login credentials. Please verify the phone number and your child's Date of Birth."
      });
    }

    const normalizeDigits = (value) => String(value || "").replace(/\D/g, "");
    const loginDigits = normalizeDigits(normalizedPhone);
    const phoneMatchesLogin = (value) => {
      const digits = normalizeDigits(value);
      return (
        loginDigits &&
        digits &&
        (loginDigits === digits ||
          loginDigits.endsWith(digits) ||
          digits.endsWith(loginDigits))
      );
    };
    const firstMatchData = matches[0].data() || {};
    const matchedContact = phoneMatchesLogin(firstMatchData.fatherPhone)
      ? {
          role: "father",
          name: firstMatchData.fatherName || "Father",
          phone: firstMatchData.fatherPhone,
        }
      : phoneMatchesLogin(firstMatchData.motherPhone)
        ? {
            role: "mother",
            name: firstMatchData.motherName || "Mother",
            phone: firstMatchData.motherPhone,
          }
        : {
            role: "guardian",
            name: firstMatchData.guardianName || "Guardian",
            phone: firstMatchData.guardianPhone,
          };

    // Match found! Grant access to ALL students associated with this phone number
    // This allows parents with multiple children to manage all of them with one login
    const allChildren = candidateDocs;
    const uid = normalizedPhone;
    const schoolIds = [...new Set(allChildren.map(doc => doc.data().schoolId))].filter(Boolean);
    const studentIds = allChildren.map(doc => doc.id);

    console.log(`[Auth] Parent login success for ${normalizedPhone}. Granting access to ${studentIds.length} students in schools: ${schoolIds.join(', ')}`);

    const customToken = await admin.auth().createCustomToken(uid, {
      role: "parent",
      schoolIds: schoolIds,
      studentIds: studentIds,
      parentContactRole: matchedContact.role,
      parentContactName: matchedContact.name,
      parentPhone: matchedContact.phone || normalizedPhone,
    });

    return res.json({
      success: true,
      token: customToken
    });

  } catch (error) {
    console.error("Parent Custom Login Error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error during login."
    });
  }
});

/**
 * Setup School Payment (Paystack Subaccount)
 * POST /api/schools/setup-payment
 */
app.post("/api/schools/setup-payment", authMiddleware, async (req, res) => {
  try {
    const {
      schoolId,
      businessName,
      bankCode,
      accountNumber,
      contactPhone,
      method,
      bankName,
      accountName,
      momoNetwork,
      momoNumber,
      momoName,
    } = req.body;
    const { uid } = req.user;

    // 1. Verify caller is admin of this school
    const userDoc = await admin.firestore().collection("users").doc(uid).get();
    const userData = userDoc.data();
    const role = userData?.role || req.user?.role || "";
    const callerSchoolId = userData?.schoolId || req.user?.schoolId || null;
    if (
      !userData ||
      (role !== "super_admin" && (callerSchoolId !== schoolId || role !== "school_admin"))
    ) {
      return res.status(403).json({ error: "Forbidden: You are not authorized to setup payments for this school." });
    }

    const resolvedBusinessName =
      businessName ||
      (method === "Bank" ? accountName : momoName) ||
      accountName ||
      momoName;
    const resolvedBankCode =
      bankCode ||
      (method === "Bank" ? bankName : momoNetwork) ||
      bankName ||
      momoNetwork;
    const resolvedAccountNumber =
      accountNumber ||
      (method === "MoMo" ? momoNumber : accountNumber) ||
      momoNumber;

    if (!schoolId || !resolvedBusinessName || !resolvedBankCode || !resolvedAccountNumber) {
      return res.status(400).json({ error: "Business name, bank, and account number are required." });
    }

    if (!PAYSTACK_SECRET_KEY) {
      return res.status(500).json({ error: "Server configuration error: Paystack secret key missing." });
    }
    if (!isLivePaystackSecret()) {
      return res.status(500).json({ error: "Server Paystack configuration is still in test mode." });
    }

    // 2. Call Paystack to create subaccount
    const paystackResponse = await fetch("https://api.paystack.co/subaccount", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        business_name: resolvedBusinessName,
        settlement_bank: resolvedBankCode,
        account_number: resolvedAccountNumber,
        percentage_charge: 0,
        primary_contact_phone: contactPhone || userData.phone || ""
      }),
    });

    const paystackData = await paystackResponse.json();

    if (!paystackResponse.ok || !paystackData.status) {
      console.error("Paystack Subaccount Error:", paystackData);
      return res.status(400).json({ 
        error: paystackData.message || "Failed to create Paystack subaccount." 
      });
    }

    const subaccountCode = paystackData.data.subaccount_code;

    // 3. Store subaccount details in Firestore
    const resolvedMethod = method || (momoNumber || momoNetwork || momoName ? "MoMo" : "Bank");
    const paymentSettings = {
      method: resolvedMethod,
      status: "active",
      subaccountCode,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      setupAt: admin.firestore.FieldValue.serverTimestamp(),
      bankName: resolvedMethod === "Bank" ? (bankName || resolvedBankCode) : null,
      accountNumber: resolvedMethod === "Bank" ? resolvedAccountNumber : null,
      accountName: resolvedMethod === "Bank" ? resolvedBusinessName : null,
      momoNetwork: resolvedMethod === "MoMo" ? (momoNetwork || resolvedBankCode) : null,
      momoNumber: resolvedMethod === "MoMo" ? resolvedAccountNumber : null,
      momoName: resolvedMethod === "MoMo" ? resolvedBusinessName : null,
    };

    await admin.firestore().collection("schools").doc(schoolId).update({
      paymentSettings
    });

    return res.json({
      success: true,
      subaccountCode,
      paymentSettings
    });

  } catch (error) {
    console.error("Payment Setup Error:", error);
    return res.status(500).json({ error: "Internal server error during payment setup." });
  }
});

/**
 * Send SMS Reminders via Arkesel
 * POST /api/admin/reminders/send
 */
app.post("/api/admin/reminders/send", authMiddleware, async (req, res) => {
  try {
    const { message, phones } = req.body;
    const { uid } = req.user;

    // 1. Verify caller is admin
    const userDoc = await admin.firestore().collection("users").doc(uid).get();
    const userData = userDoc.data();
    if (!userData || userData.role !== "school_admin") {
      return res.status(403).json({ error: "Forbidden: Only school admins can send reminders." });
    }

    if (!message || !phones || !Array.isArray(phones) || phones.length === 0) {
      return res.status(400).json({ error: "Message and at least one phone number are required." });
    }

    const schoolId = userData.schoolId;
    if (!schoolId) {
      return res.status(400).json({ error: "School not linked to admin." });
    }

    const schoolDoc = await admin.firestore().collection("schools").doc(schoolId).get();
    if (!schoolDoc.exists) {
      return res.status(404).json({ error: "School not found." });
    }

    // Fetch the global dynamic SMS pricing structure
    const smsConfigDoc = await admin.firestore().collection("settings").doc("platform_sms").get();
    const smsConfig = smsConfigDoc.exists ? smsConfigDoc.data() : {};
    const retailRate = Number(smsConfig.retailRatePerSms ?? 0.05);
    const wholesaleRate = Number(smsConfig.wholesaleRatePerSms ?? 0.02);

    const schoolData = schoolDoc.data();
    const walletBalance = schoolData?.smsWallet?.balance ?? 0;
    
    // Format phones to international format (233...)
    const formattedPhones = phones.map(p => {
      let clean = String(p).replace(/\D/g, "");
      if (clean.startsWith("0")) clean = "233" + clean.substring(1);
      return clean;
    });

    const totalCost = formattedPhones.length * retailRate;

    if (walletBalance < totalCost) {
      return res.status(400).json({ 
        error: `Insufficient SMS wallet balance. Sending requires GH₵ ${totalCost.toFixed(2)}, but your current balance is GH₵ ${walletBalance.toFixed(2)}. Please top up.` 
      });
    }

    const ARKESEL_API_KEY = process.env.ARKESEL_API_KEY;
    const ARKESEL_SENDER_ID = smsConfig.providerSenderId || process.env.ARKESEL_SENDER_ID || "SMGH";

    let smsData;

    if (!ARKESEL_API_KEY) {
      console.warn("⚠️ ARKESEL_API_KEY is not configured. Mocking successful SMS delivery for testing.");
      smsData = { status: "success", message: "Mock SMS sent successfully (development mode)." };
    } else {
      // Call Arkesel v2 API
      const smsResponse = await fetch("https://sms.arkesel.com/api/v2/sms/send", {
        method: "POST",
        headers: {
          "api-key": ARKESEL_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sender: ARKESEL_SENDER_ID,
          message: message,
          recipients: formattedPhones
        })
      });

      smsData = await smsResponse.json();

      if (!smsResponse.ok) {
        console.error("Arkesel SMS Error:", smsData);
        return res.status(400).json({ error: smsData.message || "Failed to send SMS via Arkesel." });
      }
    }

    // Deduct the cost from SMS balance
    await admin.firestore().collection("schools").doc(userData.schoolId).set({
      smsWallet: {
        balance: admin.firestore.FieldValue.increment(-totalCost),
        lastSendAt: Date.now()
      }
    }, { merge: true });

    const totalWholesaleCost = formattedPhones.length * wholesaleRate;
    const totalProfitMargin = totalCost - totalWholesaleCost;

    // Record audit log in Firestore
    await admin.firestore().collection("reminders").add({
      schoolId: userData.schoolId,
      sentBy: uid,
      message,
      recipientCount: formattedPhones.length,
      cost: totalCost,
      wholesaleCost: totalWholesaleCost,
      profitMargin: totalProfitMargin,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      status: "success",
      apiResponse: smsData
    });

    const smsSummaryRef = admin.firestore().collection("settings").doc("platform_sms_summary");
    const schoolSmsUsageRef = admin.firestore().collection("sms_school_usage").doc(userData.schoolId);
    await Promise.all([
      smsSummaryRef.set({
        totalSmsSent: admin.firestore.FieldValue.increment(formattedPhones.length),
        totalRevenue: admin.firestore.FieldValue.increment(totalCost),
        totalWholesaleCost: admin.firestore.FieldValue.increment(totalWholesaleCost),
        totalProfitMargin: admin.firestore.FieldValue.increment(totalProfitMargin),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true }),
      schoolSmsUsageRef.set({
        schoolId: userData.schoolId,
        schoolName: schoolData?.name || "Unknown School",
        totalSms: admin.firestore.FieldValue.increment(formattedPhones.length),
        totalCost: admin.firestore.FieldValue.increment(totalCost),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true }),
    ]);

    const updatedSchoolDoc = await admin.firestore().collection("schools").doc(userData.schoolId).get();
    const newBalance = updatedSchoolDoc.data()?.smsWallet?.balance ?? 0;

    return res.json({
      success: true,
      message: "Reminders sent successfully.",
      newBalance
    });

  } catch (error) {
    console.error("SMS Reminders Error:", error);
    return res.status(500).json({ error: "Internal server error during SMS sending." });
  }
});

/**
 * Send in-app reminder notices to parent dashboards.
 * POST /api/admin/parent-notices
 */
app.post("/api/admin/parent-notices", authMiddleware, async (req, res) => {
  try {
    const { uid } = req.user;
    const {
      message,
      type = "info",
      targetStudentIds,
      targetClassId,
      targetClassName,
    } = req.body || {};

    const callerDoc = await admin.firestore().collection("users").doc(uid).get();
    const callerData = callerDoc.data();
    if (!callerData || callerData.role !== "school_admin") {
      return res.status(403).json({ error: "Forbidden: Only school admins can send parent dashboard notices." });
    }

    const schoolId = callerData.schoolId;
    const safeMessage = String(message || "").trim();
    const safeType = type === "urgent" ? "urgent" : "info";
    const requestedStudentIds = Array.isArray(targetStudentIds)
      ? [...new Set(targetStudentIds.map((id) => String(id || "").trim()).filter(Boolean))]
      : [];

    if (!schoolId) {
      return res.status(400).json({ error: "School not linked to admin." });
    }
    if (!safeMessage) {
      return res.status(400).json({ error: "Message is required." });
    }
    if (requestedStudentIds.length === 0) {
      return res.status(400).json({ error: "Select at least one parent recipient." });
    }

    const studentRefs = requestedStudentIds.map((id) =>
      admin.firestore().collection("students").doc(id),
    );
    const studentDocs = await admin.firestore().getAll(...studentRefs);
    const allowedStudentIds = studentDocs
      .filter((snap) => snap.exists && snap.data()?.schoolId === schoolId)
      .map((snap) => snap.id);

    if (allowedStudentIds.length === 0) {
      return res.status(400).json({ error: "No selected students belong to your school." });
    }

    const noticeRef = admin.firestore().collection("parent_notices").doc();
    const createdAt = Date.now();
    const expiresAt = createdAt + 14 * 24 * 60 * 60 * 1000;
    const date = new Date(createdAt).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

    const noticeDoc = {
      id: noticeRef.id,
      schoolId,
      message: safeMessage,
      date,
      type: safeType,
      targetType: "students",
      targetClassId: targetClassId ? String(targetClassId) : null,
      targetClassName: targetClassName ? String(targetClassName) : null,
      targetStudentIds: allowedStudentIds,
      recipientCount: allowedStudentIds.length,
      createdAt,
      expiresAt,
      createdBy: uid,
      createdByName: callerData.fullName || callerData.email || null,
    };

    await noticeRef.set(noticeDoc);

    return res.json({
      success: true,
      notice: noticeDoc,
      message: "Parent dashboard notice sent successfully.",
    });
  } catch (error) {
    console.error("Parent dashboard notice send error:", error);
    return res.status(500).json({
      error: error.message || "Failed to send parent dashboard notice.",
    });
  }
});

/**
 * Load in-app parent notice history for the admin.
 * GET /api/admin/parent-notices/history
 */
app.get("/api/admin/parent-notices/history", authMiddleware, async (req, res) => {
  try {
    const { uid } = req.user;
    const callerDoc = await admin.firestore().collection("users").doc(uid).get();
    const callerData = callerDoc.data();
    if (!callerData || callerData.role !== "school_admin") {
      return res.status(403).json({ error: "Forbidden: Only school admins can view parent notice history." });
    }

    const schoolId = callerData.schoolId;
    if (!schoolId) {
      return res.status(400).json({ error: "School not linked to admin." });
    }

    const noticesSnap = await admin
      .firestore()
      .collection("parent_notices")
      .where("schoolId", "==", schoolId)
      .get();

    const noticeIds = noticesSnap.docs.map((docSnap) => docSnap.id);
    const readsByNotice = new Map();

    const readsSnap = await admin
      .firestore()
      .collection("parent_notice_reads")
      .where("schoolId", "==", schoolId)
      .get();

    const noticeIdSet = new Set(noticeIds);
    readsSnap.docs.forEach((readDoc) => {
      const read = { id: readDoc.id, ...readDoc.data() };
      if (!noticeIdSet.has(read.noticeId)) return;
      const existing = readsByNotice.get(read.noticeId) || [];
      existing.push(read);
      readsByNotice.set(read.noticeId, existing);
    });

    const now = Date.now();
    const notices = noticesSnap.docs
      .map((docSnap) => {
        const notice = { id: docSnap.id, ...docSnap.data() };
        const reads = (readsByNotice.get(docSnap.id) || []).sort(
          (a, b) => Number(b.readAt || 0) - Number(a.readAt || 0),
        );
        return {
          ...notice,
          status: notice.expiresAt && Number(notice.expiresAt) <= now ? "expired" : "active",
          readCount: reads.length,
          unreadCount: Math.max(0, Number(notice.recipientCount || 0) - reads.length),
          reads,
        };
      })
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
      .slice(0, 100);

    return res.json({ success: true, notices });
  } catch (error) {
    console.error("Parent dashboard notice history load error:", error);
    return res.status(500).json({
      error: error.message || "Failed to load parent dashboard notice history.",
    });
  }
});

/**
 * Delete one parent dashboard notice and its read receipt history.
 * DELETE /api/admin/parent-notices/:noticeId
 */
app.delete("/api/admin/parent-notices/:noticeId", authMiddleware, async (req, res) => {
  try {
    const { uid } = req.user;
    const noticeId = String(req.params.noticeId || "").trim();
    if (!noticeId) {
      return res.status(400).json({ error: "noticeId is required." });
    }

    const callerDoc = await admin.firestore().collection("users").doc(uid).get();
    const callerData = callerDoc.data();
    if (!callerData || callerData.role !== "school_admin") {
      return res.status(403).json({ error: "Forbidden: Only school admins can delete parent notice history." });
    }

    const schoolId = callerData.schoolId;
    if (!schoolId) {
      return res.status(400).json({ error: "School not linked to admin." });
    }

    const noticeRef = admin.firestore().collection("parent_notices").doc(noticeId);
    const noticeSnap = await noticeRef.get();
    if (!noticeSnap.exists || noticeSnap.data()?.schoolId !== schoolId) {
      return res.status(404).json({ error: "Parent notice not found." });
    }

    const readsSnap = await admin
      .firestore()
      .collection("parent_notice_reads")
      .where("schoolId", "==", schoolId)
      .get();

    const matchingReadDocs = readsSnap.docs.filter(
      (readDoc) => readDoc.data()?.noticeId === noticeId,
    );

    const deleteBatch = admin.firestore().batch();
    deleteBatch.delete(noticeRef);
    matchingReadDocs.slice(0, 450).forEach((readDoc) => {
      deleteBatch.delete(readDoc.ref);
    });
    await deleteBatch.commit();

    return res.json({
      success: true,
      deletedReadReceipts: matchingReadDocs.length,
      message: "Parent notice history deleted.",
    });
  } catch (error) {
    console.error("Parent dashboard notice delete error:", error);
    return res.status(500).json({
      error: error.message || "Failed to delete parent dashboard notice history.",
    });
  }
});

/**
 * Load parent dashboard reminder notices for one linked student.
 * GET /api/parent/notices?schoolId=...&studentId=...&classId=...
 */
app.get("/api/parent/notices", authMiddleware, async (req, res) => {
  try {
    const schoolId = String(req.query.schoolId || "").trim();
    const studentId = String(req.query.studentId || "").trim();
    const classId = String(req.query.classId || "").trim();

    if (!schoolId || !studentId) {
      return res.status(400).json({ error: "schoolId and studentId are required." });
    }

    const studentSnap = await admin.firestore().collection("students").doc(studentId).get();
    if (!studentSnap.exists || studentSnap.data()?.schoolId !== schoolId) {
      return res.status(404).json({ error: "Student not found." });
    }

    const tokenStudentIds = Array.isArray(req.user?.studentIds) ? req.user.studentIds : [];
    const isLinkedByClaim = tokenStudentIds.includes(studentId);
    const requesterRole = String(req.user?.role || req.user?.userRole || "").toLowerCase();
    const requesterUid = String(req.user?.uid || "");
    const requesterDigits = requesterUid.replace(/\D/g, "");
    const studentData = studentSnap.data() || {};
    const contactDigits = [
      studentData.fatherPhone,
      studentData.motherPhone,
      studentData.guardianPhone,
      studentData.parentPhone,
    ].map((phone) => String(phone || "").replace(/\D/g, ""));
    const isLinkedByPhone = contactDigits.some(
      (phone) =>
        phone &&
        requesterDigits &&
        (phone === requesterDigits ||
          phone.endsWith(requesterDigits) ||
          requesterDigits.endsWith(phone)),
    );

    const callerDoc = await admin.firestore().collection("users").doc(req.user.uid).get();
    const callerData = callerDoc.exists ? callerDoc.data() || {} : {};
    const isSchoolStaffForStudent =
      ["school_admin", "teacher"].includes(String(callerData.role || "").toLowerCase()) &&
      callerData.schoolId === schoolId;
    const isLinkedParent =
      requesterRole === "parent" && (isLinkedByClaim || isLinkedByPhone);

    if (!isLinkedParent && !isSchoolStaffForStudent) {
      return res.status(403).json({ error: "Forbidden: You can only read notices for linked students." });
    }

    const noticesSnap = await admin
      .firestore()
      .collection("parent_notices")
      .where("schoolId", "==", schoolId)
      .get();

    const className = String(req.query.className || "").trim();
    const now = Date.now();
    const expiredDocs = noticesSnap.docs.filter((docSnap) => {
      const expiresAt = Number(docSnap.data()?.expiresAt || 0);
      return expiresAt > 0 && expiresAt <= now;
    });
    if (expiredDocs.length > 0) {
      const batch = admin.firestore().batch();
      expiredDocs.slice(0, 450).forEach((docSnap) => batch.delete(docSnap.ref));
      await batch.commit().catch((error) => {
        console.warn("Expired parent notice cleanup skipped:", error?.message || error);
      });
    }

    const matchedNotices = noticesSnap.docs
      .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
      .filter((notice) => {
        const expiresAt = Number(notice.expiresAt || 0);
        if (expiresAt > 0 && expiresAt <= now) return false;
        if (notice.targetType === "all") return true;
        if (notice.targetType === "class") {
          return notice.targetClassId === classId || notice.targetClassName === className;
        }
        return Array.isArray(notice.targetStudentIds) &&
          notice.targetStudentIds.includes(studentId);
      });

    const readRefs = matchedNotices.map((notice) => {
      const receiptId = crypto
        .createHash("sha256")
        .update(`${notice.id}:${studentId}:${req.user.uid}`)
        .digest("hex");
      return admin.firestore().collection("parent_notice_reads").doc(receiptId);
    });
    const readDocs = readRefs.length ? await admin.firestore().getAll(...readRefs) : [];
    const readNoticeIds = new Set(
      readDocs
        .filter((readDoc) => readDoc.exists)
        .map((readDoc) => String(readDoc.data()?.noticeId || "")),
    );

    const notices = matchedNotices
      .filter((notice) => !readNoticeIds.has(notice.id))
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
      .slice(0, 20);

    return res.json({ success: true, notices });
  } catch (error) {
    console.error("Parent dashboard notices load error:", error);
    return res.status(500).json({
      error: error.message || "Failed to load parent dashboard notices.",
    });
  }
});

/**
 * Mark a parent dashboard reminder notice as read for the current parent.
 * POST /api/parent/notices/:noticeId/read
 */
app.post("/api/parent/notices/:noticeId/read", authMiddleware, async (req, res) => {
  try {
    const noticeId = String(req.params.noticeId || "").trim();
    const schoolId = String(req.body?.schoolId || "").trim();
    const studentId = String(req.body?.studentId || "").trim();
    const parentName = String(req.body?.parentName || "").trim();

    if (!noticeId || !schoolId || !studentId) {
      return res.status(400).json({ error: "noticeId, schoolId, and studentId are required." });
    }

    const [noticeSnap, studentSnap] = await Promise.all([
      admin.firestore().collection("parent_notices").doc(noticeId).get(),
      admin.firestore().collection("students").doc(studentId).get(),
    ]);

    if (!noticeSnap.exists || noticeSnap.data()?.schoolId !== schoolId) {
      return res.status(404).json({ error: "Notice not found." });
    }
    if (!studentSnap.exists || studentSnap.data()?.schoolId !== schoolId) {
      return res.status(404).json({ error: "Student not found." });
    }

    const tokenStudentIds = Array.isArray(req.user?.studentIds) ? req.user.studentIds : [];
    const isLinkedByClaim = tokenStudentIds.includes(studentId);
    const requesterRole = String(req.user?.role || req.user?.userRole || "").toLowerCase();
    const requesterUid = String(req.user?.uid || "");
    const requesterDigits = requesterUid.replace(/\D/g, "");
    const studentData = studentSnap.data() || {};
    const contactDigits = [
      studentData.fatherPhone,
      studentData.motherPhone,
      studentData.guardianPhone,
      studentData.parentPhone,
    ].map((phone) => String(phone || "").replace(/\D/g, ""));
    const isLinkedByPhone = contactDigits.some(
      (phone) =>
        phone &&
        requesterDigits &&
        (phone === requesterDigits ||
          phone.endsWith(requesterDigits) ||
          requesterDigits.endsWith(phone)),
    );

    if (requesterRole !== "parent" || (!isLinkedByClaim && !isLinkedByPhone)) {
      return res.status(403).json({ error: "Forbidden: You can only mark notices for linked students." });
    }

    const notice = noticeSnap.data() || {};
    const now = Date.now();
    if (notice.expiresAt && Number(notice.expiresAt) <= now) {
      await noticeSnap.ref.delete().catch(() => {});
      return res.json({ success: true, message: "Notice expired and was removed." });
    }

    const targetMatches =
      notice.targetType === "all" ||
      (notice.targetType === "class" &&
        (notice.targetClassId === studentData.classId || notice.targetClassName === studentData.className)) ||
      (Array.isArray(notice.targetStudentIds) && notice.targetStudentIds.includes(studentId));

    if (!targetMatches) {
      return res.status(403).json({ error: "Forbidden: Notice is not linked to this student." });
    }

    const receiptId = crypto
      .createHash("sha256")
      .update(`${noticeId}:${studentId}:${req.user.uid}`)
      .digest("hex");
    const readAt = now;
    const readDoc = {
      noticeId,
      schoolId,
      studentId,
      studentName: studentData.name || studentData.fullName || null,
      parentUid: req.user.uid,
      parentName: parentName || req.user.parentContactName || req.user.name || null,
      parentPhone: req.user.parentPhone || req.user.phone_number || req.user.uid || null,
      readAt,
      expiresAt: readAt + 14 * 24 * 60 * 60 * 1000,
    };

    await admin
      .firestore()
      .collection("parent_notice_reads")
      .doc(receiptId)
      .set(readDoc, { merge: true });

    return res.json({ success: true, message: "Notice marked as read." });
  } catch (error) {
    console.error("Parent dashboard notice mark-read error:", error);
    return res.status(500).json({
      error: error.message || "Failed to mark parent dashboard notice as read.",
    });
  }
});

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "";
const PAYSTACK_PLAN_CODE = process.env.PAYSTACK_PLAN_CODE || "";
const PAYSTACK_CALLBACK_URL = process.env.PAYSTACK_CALLBACK_URL || "";
const isLivePaystackSecret = () => /^sk_live_/i.test(String(PAYSTACK_SECRET_KEY || "").trim());
const APP_VERSION = process.env.APP_VERSION || "1.0.0";
const APP_ENV = process.env.APP_ENV || "development";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini";
const DEMO_NOTIFY_EMAIL =
  process.env.DEMO_NOTIFY_EMAIL || "info@schoolmanagergh.com";
const DEMO_NOTIFY_WHATSAPP =
  process.env.DEMO_NOTIFY_WHATSAPP || "+233201008784";
const TRIAL_NOTIFY_EMAIL =
  process.env.TRIAL_NOTIFY_EMAIL || DEMO_NOTIFY_EMAIL || "info@schoolmanagergh.com";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "";
const RESEND_FROM_NAME = process.env.RESEND_FROM_NAME || "School Manager GH";
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM || "";
const SUPER_ADMIN_ASSISTANT_NAME = "Isaacski AI";
const SUPERADMIN_AI_MODE = (
  process.env.SUPERADMIN_AI_MODE || "openai_first"
).toLowerCase();
const SUPERADMIN_OPENAI_TIMEOUT_MS = Number(
  process.env.SUPERADMIN_OPENAI_TIMEOUT_MS || 12000,
);
const AI_CONTEXT_CACHE_TTL_MS = Number(
  process.env.SUPERADMIN_AI_CACHE_TTL_MS || 45000,
);
const AI_CONTEXT_CACHE_MAX_ENTRIES = Math.max(
  20,
  Math.floor(
    parsePositiveNumber(process.env.SUPERADMIN_AI_CACHE_MAX_ENTRIES, 80),
  ),
);
const AI_CONTEXT_CACHE = new Map();
const SUPERADMIN_VIEW_CACHE_TTL_MS = Number(
  process.env.SUPERADMIN_VIEW_CACHE_TTL_MS || 45000,
);
const SUPERADMIN_VIEW_CACHE_MAX_ENTRIES = Math.max(
  50,
  Math.floor(
    parsePositiveNumber(process.env.SUPERADMIN_VIEW_CACHE_MAX_ENTRIES, 500),
  ),
);
const SUPERADMIN_VIEW_CACHE = new Map();

const formatDemoRequestText = (demoDoc) => {
  const lines = [
    "New Book a Demo request",
    "",
    `School: ${demoDoc.schoolName || "Not provided"}`,
    `Contact: ${demoDoc.fullName || "Not provided"}`,
    `Role: ${demoDoc.role || "Not provided"}`,
    `Phone: ${demoDoc.phone || "Not provided"}`,
    `Email: ${demoDoc.email || "Not provided"}`,
    `Students: ${demoDoc.studentCount || "Not provided"}`,
    `School type: ${demoDoc.schoolType || "Not provided"}`,
    `Preferred date: ${demoDoc.preferredDate || "Not provided"}`,
    `Preferred time: ${demoDoc.preferredTime || "Not provided"}`,
  ];
  if (demoDoc.message) {
    lines.push("", `Message: ${demoDoc.message}`);
  }
  return lines.join("\n");
};

const buildDemoWhatsappUrl = (demoDoc) => {
  const phone = String(DEMO_NOTIFY_WHATSAPP || "")
    .replace(/^whatsapp:/i, "")
    .replace(/\D/g, "");
  return `https://wa.me/${phone}?text=${encodeURIComponent(formatDemoRequestText(demoDoc))}`;
};

const formatDemoRequestHtml = (demoDoc) => {
  const rows = [
    ["School", demoDoc.schoolName],
    ["Contact", demoDoc.fullName],
    ["Role", demoDoc.role],
    ["Phone", demoDoc.phone],
    ["Email", demoDoc.email],
    ["Students", demoDoc.studentCount],
    ["School type", demoDoc.schoolType],
    ["Preferred date", demoDoc.preferredDate],
    ["Preferred time", demoDoc.preferredTime],
    ["Message", demoDoc.message],
  ];

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
      <h2 style="margin:0 0 16px">New Book a Demo request</h2>
      <table cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:640px">
        ${rows
          .map(
            ([label, value]) => `
              <tr>
                <td style="border:1px solid #e2e8f0;font-weight:700;background:#f8fafc;width:160px">${escapeHtml(label)}</td>
                <td style="border:1px solid #e2e8f0">${escapeHtml(value || "Not provided")}</td>
              </tr>
            `,
          )
          .join("")}
      </table>
    </div>
  `;
};

const sendDemoEmailNotification = async (demoDoc) => {
  if (!RESEND_API_KEY || !RESEND_FROM_EMAIL || !DEMO_NOTIFY_EMAIL) {
    return {
      sent: false,
      skipped: true,
      reason:
        "Missing RESEND_API_KEY, RESEND_FROM_EMAIL, or DEMO_NOTIFY_EMAIL.",
    };
  }

  const from = RESEND_FROM_NAME
    ? `${RESEND_FROM_NAME} <${RESEND_FROM_EMAIL}>`
    : RESEND_FROM_EMAIL;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [DEMO_NOTIFY_EMAIL],
      reply_to: demoDoc.email || undefined,
      subject: `Book a Demo: ${demoDoc.schoolName || "New school"}`,
      text: formatDemoRequestText(demoDoc),
      html: formatDemoRequestHtml(demoDoc),
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.message || `Resend failed with ${response.status}`);
  }
  return { sent: true, provider: "resend", id: body?.id || null };
};

const sendDemoNotifications = async (demoDoc) => {
  const [emailResult] = await Promise.allSettled([
    sendDemoEmailNotification(demoDoc),
  ]);

  const normalizeResult = (result) =>
    result.status === "fulfilled"
      ? result.value
      : {
          sent: false,
          skipped: false,
          error: result.reason?.message || String(result.reason),
        };

  const notifications = {
    email: normalizeResult(emailResult),
    whatsapp: {
      sent: false,
      skipped: true,
      provider: "direct_whatsapp_link",
      url: buildDemoWhatsappUrl(demoDoc),
      reason: "Demo WhatsApp alerts use the direct WhatsApp Business link, not Twilio.",
    },
  };

  console.info("[BookDemo] notification results", notifications);
  return notifications;
};

const summarizeNotificationFailure = (result = {}) =>
  result.reason || result.error || (result.skipped ? "Skipped" : "Not sent");

const writeTrialNotificationAudit = async ({ schoolId, adminEmail, schoolName, notifications }) => {
  try {
    await admin.firestore().collection("notification_logs").add({
      schoolId: schoolId || null,
      recipient: adminEmail || null,
      type: "start_trial_notifications",
      status: Object.values(notifications || {}).every((result) => result?.sent)
        ? "sent"
        : "partial_or_failed",
      errorMessage: Object.entries(notifications || {})
        .filter(([, result]) => !result?.sent)
        .map(([channel, result]) => `${channel}: ${summarizeNotificationFailure(result)}`)
        .join("; "),
      metadata: {
        schoolName: schoolName || null,
        notifications,
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.warn("[StartTrial] Failed to write notification audit log:", error?.message || error);
  }
};

const buildAiSystemPrompt = (dataContext) => {
  const base = `You are ${SUPER_ADMIN_ASSISTANT_NAME}, the Super Admin assistant for School Manager GH.
You are a precise operations copilot for the platform owner.
Answer directly, concretely, and accurately from DATA_CONTEXT only.
If the user asks for analysis, summarize with real numbers, names, IDs, dates, and notable exceptions when relevant.
If the user asks for an action and you have enough information, propose one action.
If fields are missing, ask only for the missing fields and do not invent values.
You can propose admin actions, but you must NEVER execute them yourself.
When you want an action, return JSON with {"reply": "...", "action": {"type": "...", "description": "...", "payload": {...}}}.
If no action is needed, return JSON with {"reply": "..."}.
Allowed action types:
- create_school: payload { name, plan, phone?, address?, logoUrl?, featurePlan?, billingStartType? }
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
- create_platform_broadcast: payload { title, message, type?, priority?, targetType?, targetSchoolIds?, publishNow?, publishAt?, expiresAt? }
Use clear, short descriptions in "description".
Never include secrets or API keys.
Do not fabricate data. If data is missing, say so plainly.
Do not claim certainty when information is missing or ambiguous.
Never say an action is already completed.
Always respond in JSON only.`;

  if (!dataContext) return base;
  return `${base}\n\nDATA_CONTEXT:\n${JSON.stringify(dataContext)}`;
};

const limitContextRows = (rows = [], limit = 20) =>
  Array.isArray(rows) ? rows.slice(0, Math.max(0, Number(limit) || 0)) : [];

const buildAiModelContext = (dataContext = {}) => {
  const schools = limitContextRows(dataContext.schools, 120).map((school) => ({
    id: school.id,
    name: trimToString(school.name, 120),
    code: trimToString(school.code, 40),
    status: trimToString(school.status, 24) || "active",
    plan: trimToString(school.plan, 24) || null,
    featurePlan: trimToString(school.featurePlan, 24) || null,
    subscriptionPlanId: trimToString(school?.subscription?.planId, 80) || null,
    studentsCount: Number(school.studentsCount || 0) || 0,
    maxStudents: Number(school?.limits?.maxStudents || 0) || 0,
    billingStartType: trimToString(school?.billing?.startType, 24) || null,
    createdAt: toMillisValue(school.createdAt),
    updatedAt: toMillisValue(school.updatedAt),
  }));

  const schoolAdmins = limitContextRows(dataContext.schoolAdmins, 120).map(
    (adminUser) => ({
      id: adminUser.id,
      fullName: trimToString(adminUser.fullName, 120),
      email: trimToString(adminUser.email, 120).toLowerCase(),
      schoolId: normalizeSchoolId(adminUser.schoolId),
      status: trimToString(adminUser.status, 24) || "active",
      createdAt: toMillisValue(adminUser.createdAt),
      lastLogin: toMillisValue(adminUser.lastLogin || adminUser.lastLoginAt),
    }),
  );

  const plans = limitContextRows(dataContext.plans, 80).map((planDoc) => ({
    id: trimToString(planDoc.id, 80).toLowerCase(),
    name: trimToString(planDoc.name, 120),
    maxStudents: Number(planDoc.maxStudents || 0) || 0,
    updatedAt: toMillisValue(planDoc.updatedAt),
  }));

  const payments = limitContextRows(dataContext.payments, 120);
  const successfulPayments = payments.filter(
    (payment) =>
      normalizePaymentStatus(
        payment?.status || payment?.billingStatus || payment?.paymentStatus,
      ) === "success",
  );
  const pendingPayments = payments.filter(
    (payment) =>
      normalizePaymentStatus(
        payment?.status || payment?.billingStatus || payment?.paymentStatus,
      ) === "pending",
  );
  const failedPayments = payments.filter(
    (payment) =>
      normalizePaymentStatus(
        payment?.status || payment?.billingStatus || payment?.paymentStatus,
      ) === "failed",
  );

  const paymentSummary = {
    totalLoaded: payments.length,
    successfulCount: successfulPayments.length,
    pendingCount: pendingPayments.length,
    failedCount: failedPayments.length,
    successfulRevenueGhs: Number(
      successfulPayments
        .reduce(
          (sum, payment) =>
            sum + normalizeAmount(payment?.amount ?? payment?.amountPaid),
          0,
        )
        .toFixed(2),
    ),
  };

  const recentPayments = successfulPayments.slice(0, 40).map((payment) => ({
    id: trimToString(payment.id, 80),
    schoolId: normalizeSchoolId(payment.schoolId),
    schoolName: trimToString(payment.schoolName || payment.studentSchoolName, 120),
    amountGhs: Number(
      normalizeAmount(payment?.amount ?? payment?.amountPaid).toFixed(2),
    ),
    status: trimToString(
      normalizePaymentStatus(
        payment?.status || payment?.billingStatus || payment?.paymentStatus,
      ),
      24,
    ),
    createdAt: toMillisValue(
      payment?.createdAt ||
        payment?.paidAt ||
        payment?.verifiedAt ||
        payment?.timestamp,
    ),
  }));

  const broadcasts = limitContextRows(dataContext.broadcasts, 60).map(
    (broadcast) => ({
      id: trimToString(broadcast.id, 80),
      title: trimToString(broadcast.title, 120),
      type: trimToString(broadcast.type, 40) || "GENERAL",
      priority: trimToString(broadcast.priority, 40) || "NORMAL",
      status: trimToString(broadcast.status, 40) || "DRAFT",
      targetType: trimToString(broadcast.targetType, 40) || "ALL",
      targetSchoolIds: Array.isArray(broadcast.targetSchoolIds)
        ? broadcast.targetSchoolIds.slice(0, 20)
        : [],
      createdAt: toMillisValue(broadcast.createdAt),
      publishAt: toMillisValue(broadcast.publishAt),
      expiresAt: toMillisValue(broadcast.expiresAt),
    }),
  );

  const recentActivity = limitContextRows(dataContext.recentActivity, 80).map(
    (item) => ({
      id: trimToString(item.id, 80),
      eventType: trimToString(item.eventType, 80),
      schoolId: normalizeSchoolId(item.schoolId),
      actorRole: trimToString(item.actorRole, 40) || null,
      createdAt: toMillisValue(item.createdAt || item.timestamp || item.timestampMs),
      meta: item?.meta && typeof item.meta === "object" ? item.meta : null,
    }),
  );

  const backups = limitContextRows(dataContext.backups, 40).map((entry) => ({
    id: trimToString(entry.id, 80),
    schoolId: normalizeSchoolId(entry.schoolId),
    term: trimToString(entry.term, 40),
    academicYear: trimToString(entry.academicYear, 40),
    backupType: trimToString(entry.backupType, 40) || "manual",
    createdAt: toMillisValue(entry.createdAt || entry.timestamp),
    recordCount: Number(entry?.recoveryMeta?.recordCount || entry.recordCount || 0) || 0,
  }));

  const securityLoginLogs = limitContextRows(dataContext.securityLoginLogs, 60);
  const suspiciousEvents = limitContextRows(dataContext.suspiciousEvents, 60);
  const auditLogs = limitContextRows(dataContext.auditLogs, 60);

  return {
    generatedAt: dataContext.generatedAt || Date.now(),
    totals: dataContext.totals || {},
    usersByRole:
      dataContext.usersByRole && typeof dataContext.usersByRole === "object"
        ? dataContext.usersByRole
        : {},
    schools,
    schoolAdmins,
    plans,
    paymentSummary,
    recentPayments,
    broadcasts,
    recentActivity,
    backups,
    security: {
      failedLogins: securityLoginLogs.filter(
        (log) => String(log?.status || "").toUpperCase() === "FAILED",
      ).length,
      recentFailedLogins: securityLoginLogs
        .filter((log) => String(log?.status || "").toUpperCase() === "FAILED")
        .slice(0, 20)
        .map((log) => ({
          id: trimToString(log.id, 80),
          email: trimToString(log.email, 120).toLowerCase(),
          role: trimToString(log.role, 40) || null,
          schoolId: normalizeSchoolId(log.schoolId),
          schoolName: trimToString(log.schoolName, 120) || null,
          timestamp: toMillisValue(log.timestamp),
        })),
      openSuspiciousEvents: suspiciousEvents.filter(
        (eventRow) => String(eventRow?.status || "").toUpperCase() === "OPEN",
      ).length,
      suspiciousEvents: suspiciousEvents.map((eventRow) => ({
        id: trimToString(eventRow.id, 80),
        schoolId: normalizeSchoolId(eventRow.schoolId),
        schoolName: trimToString(eventRow.schoolName, 120) || null,
        type: trimToString(eventRow.type, 80) || null,
        severity: trimToString(eventRow.severity, 40) || null,
        status: trimToString(eventRow.status, 40) || null,
        createdAt: toMillisValue(eventRow.createdAt || eventRow.timestamp),
      })),
      auditLogs: auditLogs.map((log) => ({
        id: trimToString(log.id, 80),
        action: trimToString(log.action || log.eventType, 120),
        actorUid: trimToString(log.actorUid, 120) || null,
        entityId: trimToString(log.entityId, 120) || null,
        createdAt: toMillisValue(log.createdAt || log.timestamp),
      })),
    },
  };
};

const fetchCollectionRows = async ({
  collectionName,
  limitCount = 100,
  orderField = "",
  whereField = "",
  whereOp = "==",
  whereValue = null,
  selectFields = [],
}) => {
  const limitValue = Math.max(1, Number(limitCount) || 1);
  const projection =
    Array.isArray(selectFields) && selectFields.length
      ? selectFields
          .map((field) => String(field || "").trim())
          .filter((field) => field.length > 0)
      : [];
  try {
    let ref = admin.firestore().collection(collectionName);
    if (whereField) {
      ref = ref.where(whereField, whereOp, whereValue);
    }
    if (orderField) {
      ref = ref.orderBy(orderField, "desc");
    }
    if (projection.length) {
      ref = ref.select(...projection);
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
      if (projection.length) {
        fallbackRef = fallbackRef.select(...projection);
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

const toPositiveInt = (value, fallback, min = 1, max = 100000) => {
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

const pruneExpiringMapCache = (cache, maxEntries, now = Date.now()) => {
  if (!cache || !(cache instanceof Map)) return;

  cache.forEach((entry, key) => {
    const expiresAt = Number(entry?.expiresAt || 0);
    if (expiresAt > 0 && expiresAt <= now) {
      cache.delete(key);
    }
  });

  const limit = Math.max(1, Number(maxEntries) || 1);
  while (cache.size > limit) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
};

const setMapCacheEntry = (cache, key, value, maxEntries) => {
  if (!cache || !(cache instanceof Map)) return;
  if (cache.has(key)) {
    cache.delete(key);
  }
  cache.set(key, value);
  pruneExpiringMapCache(cache, maxEntries, Date.now());
};

const setCachedSuperAdminView = (
  cacheKey,
  payload,
  ttlMs = SUPERADMIN_VIEW_CACHE_TTL_MS,
) => {
  setMapCacheEntry(
    SUPERADMIN_VIEW_CACHE,
    cacheKey,
    {
      payload,
      expiresAt: Date.now() + Math.max(5000, Number(ttlMs) || 0),
    },
    SUPERADMIN_VIEW_CACHE_MAX_ENTRIES,
  );
};

const clearSuperAdminViewCache = () => {
  SUPERADMIN_VIEW_CACHE.clear();
};

const withTimeoutFallback = (
  promise,
  timeoutMs = 2500,
  fallbackValue = null,
) =>
  new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(fallbackValue);
    }, Math.max(250, Number(timeoutMs) || 2500));

    Promise.resolve(promise)
      .then((result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      })
      .catch(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(fallbackValue);
      });
  });

const roundMetric = (value, digits = 2) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Number(numeric.toFixed(digits));
};

const getPercentileValue = (values = [], percentile = 0.95) => {
  if (!Array.isArray(values) || !values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const normalizedPercentile = Math.min(
    1,
    Math.max(0, Number(percentile) || 0.95),
  );
  const index = Math.max(0, Math.ceil(sorted.length * normalizedPercentile) - 1);
  return sorted[index];
};

const summarizeRequestWindow = (entries = [], windowMs = 60000) => {
  const statusBuckets = {
    success2xx: 0,
    redirect3xx: 0,
    client4xx: 0,
    server5xx: 0,
    rateLimited429: 0,
    other: 0,
  };

  const durations = [];
  entries.forEach((entry) => {
    const statusCode = Number(entry.statusCode || 0);
    if (statusCode >= 200 && statusCode < 300) {
      statusBuckets.success2xx += 1;
    } else if (statusCode >= 300 && statusCode < 400) {
      statusBuckets.redirect3xx += 1;
    } else if (statusCode >= 400 && statusCode < 500) {
      statusBuckets.client4xx += 1;
      if (statusCode === 429) {
        statusBuckets.rateLimited429 += 1;
      }
    } else if (statusCode >= 500) {
      statusBuckets.server5xx += 1;
    } else {
      statusBuckets.other += 1;
    }

    const durationMs = Number(entry.durationMs || 0);
    if (Number.isFinite(durationMs) && durationMs >= 0) {
      durations.push(durationMs);
    }
  });

  const totalRequests = entries.length;
  const windowMinutes = Math.max(1 / 60, Number(windowMs) / 60000);
  const failedCount =
    statusBuckets.client4xx + statusBuckets.server5xx + statusBuckets.other;
  const avgLatency =
    durations.length > 0
      ? durations.reduce((sum, value) => sum + value, 0) / durations.length
      : 0;
  const maxLatency = durations.length ? Math.max(...durations) : 0;
  const p95Latency = durations.length ? getPercentileValue(durations, 0.95) : 0;

  return {
    totalRequests,
    requestsPerMinute: roundMetric(totalRequests / windowMinutes, 2),
    avgLatencyMs: roundMetric(avgLatency, 2),
    p95LatencyMs: roundMetric(p95Latency, 2),
    maxLatencyMs: roundMetric(maxLatency, 2),
    errorRatePct: totalRequests
      ? roundMetric((failedCount / totalRequests) * 100, 2)
      : 0,
    statusBuckets,
  };
};

const buildSlowRouteSummary = (entries = [], maxRows = 8) => {
  const routeMap = new Map();
  entries.forEach((entry) => {
    const method = String(entry.method || "GET").toUpperCase();
    const path = normalizeRequestPath(entry.path || "/");
    const key = `${method} ${path}`;
    if (!routeMap.has(key)) {
      routeMap.set(key, {
        route: key,
        durations: [],
        requests: 0,
        errors: 0,
      });
    }
    const bucket = routeMap.get(key);
    bucket.requests += 1;
    const durationMs = Number(entry.durationMs || 0);
    if (Number.isFinite(durationMs) && durationMs >= 0) {
      bucket.durations.push(durationMs);
    }
    const statusCode = Number(entry.statusCode || 0);
    if (statusCode >= 400 || statusCode <= 0) {
      bucket.errors += 1;
    }
  });

  return Array.from(routeMap.values())
    .map((bucket) => {
      const avgLatency = bucket.durations.length
        ? bucket.durations.reduce((sum, value) => sum + value, 0) /
          bucket.durations.length
        : 0;
      const p95Latency = bucket.durations.length
        ? getPercentileValue(bucket.durations, 0.95)
        : 0;
      const maxLatency = bucket.durations.length
        ? Math.max(...bucket.durations)
        : 0;
      return {
        route: bucket.route,
        requests: bucket.requests,
        avgLatencyMs: roundMetric(avgLatency, 2),
        p95LatencyMs: roundMetric(p95Latency, 2),
        maxLatencyMs: roundMetric(maxLatency, 2),
        errorRatePct: bucket.requests
          ? roundMetric((bucket.errors / bucket.requests) * 100, 2)
          : 0,
      };
    })
    .sort((left, right) => {
      if (right.p95LatencyMs !== left.p95LatencyMs) {
        return right.p95LatencyMs - left.p95LatencyMs;
      }
      if (right.avgLatencyMs !== left.avgLatencyMs) {
        return right.avgLatencyMs - left.avgLatencyMs;
      }
      return right.requests - left.requests;
    })
    .slice(0, Math.max(1, Number(maxRows) || 8));
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

const deleteBackendSchoolScopedCollection = async (
  db,
  collectionName,
  schoolId,
  batchSize = 400,
) => {
  const scopedSchoolId = normalizeSchoolId(schoolId);
  if (!scopedSchoolId) return 0;

  let deletedCount = 0;
  while (true) {
    const snap = await db
      .collection(collectionName)
      .where("schoolId", "==", scopedSchoolId)
      .limit(batchSize)
      .get();

    if (snap.empty) break;

    const batch = db.batch();
    snap.docs.forEach((docSnap) => batch.delete(docSnap.ref));
    await batch.commit();
    deletedCount += snap.size;

    if (snap.size < batchSize) break;
  }

  return deletedCount;
};

const deleteBackendSchoolDocumentTree = async (db, schoolId) => {
  const schoolRef = db.collection("schools").doc(schoolId);
  if (typeof db.recursiveDelete === "function") {
    await db.recursiveDelete(schoolRef);
    return;
  }

  const deleteDescendants = async (docRef) => {
    const childCollections = await docRef.listCollections();
    for (const childCollection of childCollections) {
      while (true) {
        const snap = await childCollection.limit(400).get();
        if (snap.empty) break;
        const batch = db.batch();
        snap.docs.forEach((docSnap) => batch.delete(docSnap.ref));
        await batch.commit();
        if (snap.size < 400) break;
      }
    }
  };

  await deleteDescendants(schoolRef);
  await schoolRef.delete();
};

const getAggregateCount = async (queryRef) => {
  const snap = await queryRef.count().get();
  return Number(snap.data()?.count || 0) || 0;
};

const buildSchoolTotals = async ({
  db,
  schoolRows = [],
  timeoutMs = 2500,
} = {}) => {
  const schoolsRef = db.collection("schools");
  const rows = Array.isArray(schoolRows) ? schoolRows : [];
  const rowTotals = rows.reduce(
    (acc, row) => {
      const normalized = normalizeSchoolForView(row.id, row);
      acc.totalSchools += 1;
      if (normalized.status === "inactive") {
        acc.inactiveSchools += 1;
      } else {
        acc.activeSchools += 1;
      }
      if (normalized.plan === "free") acc.freeSchools += 1;
      if (normalized.plan === "trial") acc.trialSchools += 1;
      if (["monthly", "termly", "yearly"].includes(normalized.plan)) {
        acc.paidSchools += 1;
      }
      const createdAt = parseFlexibleDate(normalized.createdAt);
      if (createdAt && createdAt >= acc.thirtyDaysAgo) {
        acc.newSchoolsLast30 += 1;
      }
      return acc;
    },
    {
      totalSchools: 0,
      activeSchools: 0,
      inactiveSchools: 0,
      freeSchools: 0,
      trialSchools: 0,
      paidSchools: 0,
      newSchoolsLast30: 0,
      thirtyDaysAgo: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    },
  );

  const countOrNull = (queryRef) =>
    withTimeoutFallback(getAggregateCount(queryRef), timeoutMs, null);

  const thirtyDaysAgoTimestamp = admin.firestore.Timestamp.fromMillis(
    rowTotals.thirtyDaysAgo.getTime(),
  );

  const [
    totalCount,
    activeCount,
    inactiveCount,
    freeCount,
    trialCount,
    monthlyCount,
    termlyCount,
    yearlyCount,
    newSchoolsCount,
  ] = await Promise.all([
    countOrNull(schoolsRef),
    countOrNull(schoolsRef.where("status", "==", "active")),
    countOrNull(schoolsRef.where("status", "==", "inactive")),
    countOrNull(schoolsRef.where("plan", "==", "free")),
    countOrNull(schoolsRef.where("plan", "==", "trial")),
    countOrNull(schoolsRef.where("plan", "==", "monthly")),
    countOrNull(schoolsRef.where("plan", "==", "termly")),
    countOrNull(schoolsRef.where("plan", "==", "yearly")),
    countOrNull(schoolsRef.where("createdAt", ">=", thirtyDaysAgoTimestamp)),
  ]);

  const totalSchools =
    totalCount === null ? rowTotals.totalSchools : Number(totalCount) || 0;
  const inactiveSchools =
    inactiveCount === null ? rowTotals.inactiveSchools : Number(inactiveCount) || 0;
  const exactActiveSchools =
    activeCount === null ? rowTotals.activeSchools : Number(activeCount) || 0;
  const activeSchools = Math.max(
    exactActiveSchools,
    totalSchools - inactiveSchools,
  );
  const freeSchools =
    freeCount === null ? rowTotals.freeSchools : Number(freeCount) || 0;
  const exactTrialSchools =
    trialCount === null ? rowTotals.trialSchools : Number(trialCount) || 0;
  const paidSchools =
    monthlyCount === null || termlyCount === null || yearlyCount === null
      ? rowTotals.paidSchools
      : (Number(monthlyCount) || 0) +
        (Number(termlyCount) || 0) +
        (Number(yearlyCount) || 0);
  const trialSchools = Math.max(
    exactTrialSchools,
    totalSchools - freeSchools - paidSchools,
  );
  const newSchoolsLast30 =
    newSchoolsCount === null
      ? rowTotals.newSchoolsLast30
      : Math.max(Number(newSchoolsCount) || 0, rowTotals.newSchoolsLast30);

  return {
    totalSchools,
    schools: totalSchools,
    activeSchools,
    active: activeSchools,
    inactiveSchools,
    inactive: inactiveSchools,
    freeSchools,
    free: freeSchools,
    trialSchools,
    trial: trialSchools,
    paidSchools,
    paid: paidSchools,
    monthlySchools: monthlyCount !== null ? Number(monthlyCount) || 0 : rowTotals.monthlySchools,
    termlySchools: termlyCount !== null ? Number(termlyCount) || 0 : rowTotals.termlySchools,
    yearlySchools: yearlyCount !== null ? Number(yearlyCount) || 0 : rowTotals.yearlySchools,
    newSchoolsLast30,
    newSchools: newSchoolsLast30,
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
    if (cached) {
      AI_CONTEXT_CACHE.delete(cacheKey);
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

  setMapCacheEntry(
    AI_CONTEXT_CACHE,
    cacheKey,
    {
      value: context,
      expiresAt: Date.now() + Math.max(5000, AI_CONTEXT_CACHE_TTL_MS),
    },
    AI_CONTEXT_CACHE_MAX_ENTRIES,
  );

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

const extractJsonObjectFromText = (rawText = "") => {
  const text = String(rawText || "").trim();
  if (!text) return "";

  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }

  return text;
};

const parseAiResponse = (rawText) => {
  if (!rawText) {
    return { reply: "I could not generate a response." };
  }
  try {
    const parsed = JSON.parse(extractJsonObjectFromText(rawText));
    if (parsed && typeof parsed.reply === "string") {
      const action =
        parsed.action &&
        typeof parsed.action === "object" &&
        typeof parsed.action.type === "string"
          ? {
              type: String(parsed.action.type || "").trim(),
              ...(parsed.action.description
                ? { description: trimToString(parsed.action.description, 220) }
                : {}),
              ...(parsed.action.payload &&
              typeof parsed.action.payload === "object" &&
              !Array.isArray(parsed.action.payload)
                ? { payload: parsed.action.payload }
                : {}),
            }
          : null;
      return {
        reply: String(parsed.reply || "").trim(),
        ...(action ? { action } : {}),
      };
    }
    return { reply: rawText };
  } catch {
    return { reply: rawText };
  }
};

const callSuperAdminOpenAi = async ({ messages = [], dataContext = {} }) => {
  if (!OPENAI_API_KEY) {
    throw new Error("OpenAI API key is not configured");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    Math.max(2500, SUPERADMIN_OPENAI_TIMEOUT_MS),
  );

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.15,
        messages: [
          {
            role: "system",
            content: buildAiSystemPrompt(buildAiModelContext(dataContext)),
          },
          ...messages,
        ],
      }),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error?.message || "OpenAI request failed");
    }

    const content = data?.choices?.[0]?.message?.content || "";
    const parsed = parseAiResponse(content);
    if (!parsed?.reply) {
      throw new Error("OpenAI returned an empty reply");
    }
    return parsed;
  } finally {
    clearTimeout(timeoutId);
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

const extractQuotedSegments = (text = "") =>
  Array.from(String(text).matchAll(/["']([^"']{2,240})["']/g)).map((match) =>
    String(match?.[1] || "").trim(),
  );

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

const extractBroadcastTypeFromText = (text = "") => {
  const lower = String(text).toLowerCase();
  if (/\b(maintenance|downtime|outage|service window)\b/.test(lower)) {
    return "MAINTENANCE";
  }
  if (/\b(update|upgrade|release|version|patch)\b/.test(lower)) {
    return "SYSTEM_UPDATE";
  }
  return "GENERAL";
};

const extractBroadcastPriorityFromText = (text = "") => {
  const lower = String(text).toLowerCase();
  if (/\b(critical|urgent|emergency)\b/.test(lower)) return "CRITICAL";
  if (/\b(important|priority|attention)\b/.test(lower)) return "IMPORTANT";
  return "NORMAL";
};

const extractBroadcastTitleAndMessage = (text = "") => {
  const quotedSegments = extractQuotedSegments(text);
  const titleMatch = String(text).match(
    /\btitle\b\s*(?:is|=|:)?\s*["']?([^"'.,\n]{3,120})/i,
  );
  const messageMatch = String(text).match(
    /\b(?:message|body|content|saying|say|that)\b\s*(?:is|=|:)?\s*["']?([\s\S]{8,280})/i,
  );

  const titleFromMatch = titleMatch?.[1]
    ? titleMatch[1]
        .replace(/\b(message|body|content|publish|broadcast|to all|to schools)\b.*$/i, "")
        .trim()
    : "";
  const messageFromMatch = messageMatch?.[1]
    ? messageMatch[1]
        .replace(/\b(?:publish now|send now|to all schools|to all|for all schools)\b.*$/i, "")
        .trim()
    : "";

  const title =
    titleFromMatch ||
    (quotedSegments.length >= 2 ? quotedSegments[0] : "") ||
    extractQuotedText(text) ||
    "";
  const message =
    messageFromMatch ||
    (quotedSegments.length >= 2 ? quotedSegments[1] : "") ||
    "";

  return {
    title: trimToString(title, 120),
    message: trimToString(message, 600),
  };
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
        "I can read Super Admin data across schools, users, plans, payments, activity, security, backups, and broadcasts. I can also prepare confirmable actions like creating schools, creating school admins, updating admin emails, resetting passwords, changing school status or plans, managing configured plans, and drafting platform broadcasts.",
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

  const asksSchoolList =
    /\bschool|schools\b/i.test(prompt) &&
    /\b(list|show|which|inactive|active|trial|monthly|termly|yearly|free|starter|standard)\b/i.test(
      prompt,
    ) &&
    !hasActionVerb;
  if (asksSchoolList) {
    let filteredSchools = [...schools];
    if (/\binactive\b/i.test(prompt)) {
      filteredSchools = filteredSchools.filter(
        (school) => String(school?.status || "").toLowerCase() === "inactive",
      );
    } else if (/\bactive\b/i.test(prompt)) {
      filteredSchools = filteredSchools.filter(
        (school) => String(school?.status || "").toLowerCase() === "active",
      );
    }

    const planMatch = ["trial", "monthly", "termly", "yearly", "free"].find(
      (planValue) => new RegExp(`\\b${planValue}\\b`, "i").test(prompt),
    );
    if (planMatch) {
      filteredSchools = filteredSchools.filter(
        (school) => String(school?.plan || "").toLowerCase() === planMatch,
      );
    }

    const featurePlanMatch = ["starter", "standard"].find((planValue) =>
      new RegExp(`\\b${planValue}\\b`, "i").test(prompt),
    );
    if (featurePlanMatch) {
      filteredSchools = filteredSchools.filter(
        (school) =>
          String(school?.featurePlan || "").toLowerCase() === featurePlanMatch,
      );
    }

    if (!filteredSchools.length) {
      return {
        reply: `I did not find schools matching that filter.${asOfLabel ? ` Data as of ${asOfLabel}.` : ""}`,
        action: null,
      };
    }

    const preview = filteredSchools
      .slice(0, 8)
      .map((school) => {
        const studentCount = Number(school?.studentsCount || 0) || 0;
        return `${school.name} (${school.code || school.id}) - ${school.status || "active"}, ${school.plan || "trial"}, ${school.featurePlan || "starter"}, ${studentCount} students`;
      })
      .join("; ");

    return {
      reply: `Matching schools (${filteredSchools.length}): ${preview}.${asOfLabel ? ` Data as of ${asOfLabel}.` : ""}`,
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

  const asksRecentSecurityEntries =
    /\b(failed login|suspicious|audit)\b/i.test(prompt) &&
    /\b(show|list|recent|latest)\b/i.test(prompt) &&
    !hasActionVerb;
  if (asksRecentSecurityEntries) {
    if (/\bfailed login\b/i.test(prompt)) {
      const failedEntries = securityLoginLogs
        .filter((row) => String(row?.status || "").toUpperCase() === "FAILED")
        .slice(0, 8)
        .map((row) => {
          const when = parseFlexibleDate(row?.timestamp);
          return `${row?.email || "unknown email"}${row?.schoolName ? ` (${row.schoolName})` : ""}${when ? ` at ${when.toLocaleString()}` : ""}`;
        });
      return {
        reply: failedEntries.length
          ? `Recent failed logins: ${failedEntries.join("; ")}.${asOfLabel ? ` Data as of ${asOfLabel}.` : ""}`
          : "No recent failed logins were loaded.",
        action: null,
      };
    }

    if (/\bsuspicious\b/i.test(prompt)) {
      const recentSuspicious = suspiciousEvents.slice(0, 8).map((row) => {
        const when = parseFlexibleDate(row?.createdAt || row?.timestamp);
        return `${row?.type || "event"}${row?.schoolName ? ` at ${row.schoolName}` : ""} - ${row?.status || "OPEN"}${when ? ` (${when.toLocaleString()})` : ""}`;
      });
      return {
        reply: recentSuspicious.length
          ? `Recent suspicious events: ${recentSuspicious.join("; ")}.${asOfLabel ? ` Data as of ${asOfLabel}.` : ""}`
          : "No suspicious events were loaded.",
        action: null,
      };
    }

    const recentAuditLogs = auditLogs.slice(0, 8).map((row) => {
      const when = parseFlexibleDate(row?.createdAt || row?.timestamp);
      return `${row?.eventType || row?.action || "activity"}${row?.entityId ? ` (${row.entityId})` : ""}${when ? ` at ${when.toLocaleString()}` : ""}`;
    });
    return {
      reply: recentAuditLogs.length
        ? `Recent audit logs: ${recentAuditLogs.join("; ")}.${asOfLabel ? ` Data as of ${asOfLabel}.` : ""}`
        : "No audit log entries were loaded.",
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

  const asksRecentBroadcasts =
    /\b(broadcast|announcement|platform message)\b/i.test(prompt) &&
    /\b(show|list|recent|latest)\b/i.test(prompt) &&
    !hasActionVerb;
  if (asksRecentBroadcasts) {
    const recentBroadcasts = broadcasts.slice(0, 8).map((broadcast) => {
      const when = parseFlexibleDate(
        broadcast?.publishAt || broadcast?.createdAt || null,
      );
      return `${broadcast?.title || "Untitled"} - ${broadcast?.status || "DRAFT"}${broadcast?.type ? ` (${broadcast.type})` : ""}${when ? ` at ${when.toLocaleString()}` : ""}`;
    });
    return {
      reply: recentBroadcasts.length
        ? `Recent broadcasts: ${recentBroadcasts.join("; ")}.${asOfLabel ? ` Data as of ${asOfLabel}.` : ""}`
        : "No platform broadcasts were loaded.",
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

  const wantsCreateBroadcast =
    /\b(create|draft|write|send|publish|post)\b/i.test(prompt) &&
    /\b(broadcast|announcement|platform message)\b/i.test(prompt);
  if (wantsCreateBroadcast) {
    const { title, message } = extractBroadcastTitleAndMessage(prompt);
    const targetSchool = findSchoolFromText(prompt, schools);
    const publishNow = !/\b(draft|later|save only)\b/i.test(prompt);
    const missingFields = [];
    if (!title) missingFields.push("broadcast title");
    if (!message) missingFields.push("broadcast message");

    if (missingFields.length) {
      return {
        reply: `I can prepare a platform broadcast, but I still need: ${missingFields.join(", ")}. Example: create broadcast title "Maintenance Notice" message "The platform will be offline tonight from 10 PM to 11 PM."`,
        action: null,
      };
    }

    const targetAllSchools = /\b(all schools|everyone|all users|entire platform)\b/i.test(
      prompt,
    );
    const targetType = targetSchool && !targetAllSchools ? "SCHOOLS" : "ALL";
    const broadcastType = extractBroadcastTypeFromText(prompt);
    const priority = extractBroadcastPriorityFromText(prompt);

    return {
      reply: `I prepared a ${publishNow ? "publish-ready" : "draft"} broadcast${targetType === "SCHOOLS" && targetSchool ? ` for ${targetSchool.name}` : " for all schools"}. Confirm to apply it.`,
      action: {
        type: "create_platform_broadcast",
        description: `Create ${publishNow ? "published" : "draft"} platform broadcast "${title}"`,
        payload: {
          title,
          message,
          type: broadcastType,
          priority,
          targetType,
          ...(targetType === "SCHOOLS" && targetSchool
            ? { targetSchoolIds: [targetSchool.id] }
            : {}),
          publishNow,
        },
      },
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
      const validStatuses = ["active", "inactive", "trial_active"];
      if (!schoolId) missingFields.push("schoolId");
      if (!validStatuses.includes(status)) missingFields.push("status");
      normalizedPayload = {
        schoolId,
        status: validStatuses.includes(status) ? status : "active",
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
    case "create_platform_broadcast": {
      const title = trimToString(payload?.title, 120);
      const message = trimToString(payload?.message, 2000);
      const type = trimToString(payload?.type || "GENERAL", 40).toUpperCase();
      const priority = trimToString(
        payload?.priority || "NORMAL",
        40,
      ).toUpperCase();
      const targetType = trimToString(
        payload?.targetType || "ALL",
        40,
      ).toUpperCase();
      const publishNow = Boolean(
        payload?.publishNow === undefined ? true : payload?.publishNow,
      );
      const validTypes = ["GENERAL", "SYSTEM_UPDATE", "MAINTENANCE"];
      const validPriorities = ["NORMAL", "IMPORTANT", "CRITICAL"];
      const validTargetTypes = ["ALL", "SCHOOLS"];
      const targetSchoolIds = Array.isArray(payload?.targetSchoolIds)
        ? payload.targetSchoolIds
            .map((value) => trimToString(value, 80))
            .filter(Boolean)
            .slice(0, 50)
        : [];
      const publishAt = payload?.publishAt
        ? toMillisValue(payload.publishAt)
        : null;
      const expiresAt = payload?.expiresAt
        ? toMillisValue(payload.expiresAt)
        : null;

      if (!title) missingFields.push("title");
      if (!message) missingFields.push("message");
      if (!validTypes.includes(type)) missingFields.push("type");
      if (!validPriorities.includes(priority)) missingFields.push("priority");
      if (!validTargetTypes.includes(targetType)) missingFields.push("targetType");
      if (targetType === "SCHOOLS" && targetSchoolIds.length === 0) {
        missingFields.push("targetSchoolIds");
      }

      normalizedPayload = {
        title,
        message,
        type: validTypes.includes(type) ? type : "GENERAL",
        priority: validPriorities.includes(priority) ? priority : "NORMAL",
        targetType: validTargetTypes.includes(targetType) ? targetType : "ALL",
        ...(targetSchoolIds.length ? { targetSchoolIds } : {}),
        publishNow,
        ...(publishAt ? { publishAt } : {}),
        ...(expiresAt ? { expiresAt } : {}),
      };
      if (!description) {
        description = `Create platform broadcast ${title || "broadcast"}`;
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
  c_creche: [
    "Language & Literacy",
    "Numeracy",
    "Environmental Studies",
    "Creative Arts",
    "Physical Development",
    "Social & Emotional Development",
    "Rhymes, Songs & Storytelling",
  ],
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
      const schoolsLimit = toPositiveInt(req.query?.schoolsLimit, 800, 25, 100000);
      const activityLimit = toPositiveInt(req.query?.activityLimit, 120, 10, 500);
      const paymentsLimit = toPositiveInt(
        req.query?.paymentsLimit,
        1200,
        50,
        8000,
      );
      const checklistLimit = toPositiveInt(
        req.query?.checklistLimit,
        12000,
        100,
        100000,
      );
      const DASHBOARD_QUERY_TIMEOUT_MS = 1500; // Reduced from 2800
      const CHECKLIST_QUERY_TIMEOUT_MS = 1200; // Reduced from 2200

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
        const rows = await withTimeoutFallback(
          Promise.resolve().then(loader),
          DASHBOARD_QUERY_TIMEOUT_MS,
          [],
        );
        return Array.isArray(rows) ? rows : [];
      };

      // Smart schools fetcher with fast fallback for better reliability
      const safeGetSchools = async () => {
        try {
          // Try ordered query first with timeout
          const orderedRows = await withTimeoutFallback(
            fetchCollectionRows({
              collectionName: "schools",
              limitCount: schoolsLimit,
              orderField: "createdAt",
              selectFields: [
                "name",
                "code",
                "logoUrl",
                "phone",
                "address",
                "plan",
                "status",
                "featurePlan",
                "createdBy",
                "createdAt",
                "planEndsAt",
                "studentsCount",
                "limits",
                "billing",
                "subscription",
              ],
            }),
            Math.max(500, DASHBOARD_QUERY_TIMEOUT_MS - 500),
            null,
          );

          if (Array.isArray(orderedRows) && orderedRows.length > 0) {
            return orderedRows;
          }

          // If ordered query fails/times out, use unordered query as fallback
          const unorderedRows = await withTimeoutFallback(
            fetchCollectionRows({
              collectionName: "schools",
              limitCount: schoolsLimit,
              orderField: "", // No ordering for faster response
              selectFields: [
                "name",
                "code",
                "logoUrl",
                "phone",
                "address",
                "plan",
                "status",
                "featurePlan",
                "createdBy",
                "createdAt",
                "planEndsAt",
                "studentsCount",
                "limits",
                "billing",
                "subscription",
              ],
            }),
            1000,
            [],
          );

          return Array.isArray(unorderedRows) ? unorderedRows : [];
        } catch (err) {
          console.error("Error fetching schools:", err?.message);
          return [];
        }
      };

      const [schoolRows, activityRows, paymentRows] = await Promise.all([
        safeGetSchools(),
        safeGetRows(() =>
          fetchCollectionRows({
            collectionName: "activity_logs",
            limitCount: activityLimit,
            orderField: "createdAt",
            selectFields: [
              "schoolId",
              "eventType",
              "actionType",
              "actorUid",
              "actorRole",
              "createdAt",
              "timestamp",
              "timestampMs",
              "meta",
            ],
          }),
        ),
        safeGetRows(() =>
          fetchCollectionRows({
            collectionName: "payments",
            limitCount: paymentsLimit,
            orderField: "createdAt",
            selectFields: [
              "schoolId",
              "schoolName",
              "adminEmail",
              "amount",
              "amountPaid",
              "currency",
              "status",
              "reference",
              "createdAt",
              "paidAt",
              "verifiedAt",
              "module",
              "type",
              "category",
              "paymentMethod",
              "method",
              "channel",
            ],
          }),
        ),
      ]);

      const schools = schoolRows.map((row) => normalizeSchoolForView(row.id, row));
      const schoolTotals = await buildSchoolTotals({
        db,
        schoolRows,
        timeoutMs: 2500,
      });
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

      const checklistScanLimit = Math.min(
        checklistLimit,
        Math.max(
          300,
          Math.max(schools.length || 0, 1) * 80,
        ),
      );

      const runChecklistQuery = (loader) =>
        withTimeoutFallback(
          Promise.resolve()
            .then(loader)
            .catch(() => null),
          CHECKLIST_QUERY_TIMEOUT_MS,
          null,
        );

      const [
        attendanceSnap,
        teacherAttendanceSnap,
        assessmentsSnap,
        timetablesSnap,
        noticesSnap,
      ] = await Promise.all([
        runChecklistQuery(() =>
          db
            .collection("attendance")
            .select("schoolId")
            .where("date", "==", today)
            .limit(checklistScanLimit)
            .get(),
        ),
        runChecklistQuery(() =>
          db
            .collection("teacher_attendance")
            .select("schoolId")
            .where("date", "==", today)
            .limit(checklistScanLimit)
            .get(),
        ),
        runChecklistQuery(() =>
          db
            .collection("assessments")
            .select("schoolId")
            .where("createdAt", ">=", startMs)
            .where("createdAt", "<=", endMs)
            .limit(checklistScanLimit)
            .get(),
        ),
        runChecklistQuery(() =>
          db
            .collection("timetables")
            .select("schoolId")
            .limit(checklistScanLimit)
            .get(),
        ),
        runChecklistQuery(() =>
          db
            .collection("notices")
            .select("schoolId")
            .where("createdAt", ">=", startMs)
            .where("createdAt", "<=", endMs)
            .limit(checklistScanLimit)
            .get(),
        ),
      ]);

      const attendanceSchools = extractUniqueSchoolIds(getRowsFromSnap(attendanceSnap));
      const teacherAttendanceSchools = extractUniqueSchoolIds(
        getRowsFromSnap(teacherAttendanceSnap),
      );
      const assessmentSchools = extractUniqueSchoolIds(getRowsFromSnap(assessmentsSnap));
      const timetableSchools = extractUniqueSchoolIds(getRowsFromSnap(timetablesSnap));
      const noticeSchools = extractUniqueSchoolIds(getRowsFromSnap(noticesSnap));

      const totalSchools = schoolTotals.totalSchools;
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
        totals: schoolTotals,
        dailyChecklist: {
          summary: dailyChecklistSummary,
          perSchool: dailyChecklistPerSchool,
        },
        limits: {
          schoolsLimit,
          activityLimit,
          paymentsLimit,
          checklistLimit,
          checklistScanLimit,
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
      const schoolsLimit = toPositiveInt(req.query?.schoolsLimit, 1200, 50, 5000);
      const paymentsLimit = toPositiveInt(
        req.query?.paymentsLimit,
        2000,
        50,
        10000,
      );
      const eventsLimit = toPositiveInt(req.query?.eventsLimit, 2000, 50, 10000);
      const activityLimit = toPositiveInt(
        req.query?.activityLimit,
        2000,
        50,
        10000,
      );
      const ANALYTICS_QUERY_TIMEOUT_MS = 2800;

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
        const rows = await withTimeoutFallback(
          Promise.resolve().then(loader),
          ANALYTICS_QUERY_TIMEOUT_MS,
          [],
        );
        return Array.isArray(rows) ? rows : [];
      };

      // Smart schools fetcher with fast fallback for better reliability
      const safeGetSchools = async () => {
        try {
          // Try ordered query first with timeout
          const orderedRows = await withTimeoutFallback(
            fetchCollectionRows({
              collectionName: "schools",
              limitCount: schoolsLimit,
              orderField: "createdAt",
              selectFields: [
                "name",
                "code",
                "logoUrl",
                "phone",
                "address",
                "plan",
                "status",
                "featurePlan",
                "createdBy",
                "createdAt",
                "planEndsAt",
                "studentsCount",
                "limits",
                "billing",
                "subscription",
              ],
            }),
            Math.max(500, ANALYTICS_QUERY_TIMEOUT_MS - 1000),
            null,
          );

          if (Array.isArray(orderedRows) && orderedRows.length > 0) {
            return orderedRows;
          }

          // If ordered query fails/times out, use unordered query as fallback
          const unorderedRows = await withTimeoutFallback(
            fetchCollectionRows({
              collectionName: "schools",
              limitCount: schoolsLimit,
              orderField: "", // No ordering for faster response
              selectFields: [
                "name",
                "code",
                "logoUrl",
                "phone",
                "address",
                "plan",
                "status",
                "featurePlan",
                "createdBy",
                "createdAt",
                "planEndsAt",
                "studentsCount",
                "limits",
                "billing",
                "subscription",
              ],
            }),
            1500,
            [],
          );

          return Array.isArray(unorderedRows) ? unorderedRows : [];
        } catch (err) {
          console.error("Error fetching schools for analytics:", err?.message);
          return [];
        }
      };

      const [schoolRows, paymentRows, eventRows, activityRows] = await Promise.all([
        safeGetSchools(),
        safeGetRows(() =>
          fetchCollectionRows({
            collectionName: "payments",
            limitCount: paymentsLimit,
            orderField: "createdAt",
            selectFields: [
              "schoolId",
              "schoolName",
              "adminEmail",
              "amount",
              "amountPaid",
              "currency",
              "status",
              "reference",
              "createdAt",
              "paidAt",
              "verifiedAt",
              "module",
              "type",
              "category",
              "paymentMethod",
              "method",
              "channel",
            ],
          }),
        ),
        safeGetRows(() =>
          fetchCollectionRows({
            collectionName: "analyticsEvents",
            limitCount: eventsLimit,
            orderField: "createdAt",
            selectFields: ["schoolId", "actionType", "userRole", "createdAt"],
          }),
        ),
        safeGetRows(() =>
          fetchCollectionRows({
            collectionName: "activity_logs",
            limitCount: activityLimit,
            orderField: "createdAt",
            selectFields: ["schoolId", "eventType", "createdAt", "timestamp", "timestampMs"],
          }),
        ),
      ]);

      const schools = schoolRows.map((row) => normalizeSchoolForView(row.id, row));
      const schoolTotals = await buildSchoolTotals({
        db: admin.firestore(),
        schoolRows,
        timeoutMs: 2500,
      });
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

      const totalSchools = schoolTotals.totalSchools;
      const activeSchools = schoolTotals.activeSchools;
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
 * Super Admin system health + load metrics
 * GET /api/superadmin/system-health
 */
app.get(
  "/api/superadmin/system-health",
  authLimiter,
  authMiddleware,
  superAdminMiddleware,
  async (req, res) => {
    try {
      const now = Date.now();
      pruneRequestMetrics(now);

      const oneMinuteEntries = REQUEST_METRICS.filter(
        (entry) => entry.timestampMs >= now - 60 * 1000,
      );
      const fiveMinuteEntries = REQUEST_METRICS.filter(
        (entry) => entry.timestampMs >= now - 5 * 60 * 1000,
      );

      const memoryUsage = process.memoryUsage();
      const bytesToMb = (value) => roundMetric(Number(value || 0) / (1024 * 1024), 2);

      const cpuCores = Math.max(1, Array.isArray(os.cpus()) ? os.cpus().length : 1);
      const loadAverageRaw =
        typeof os.loadavg === "function" ? os.loadavg() : [0, 0, 0];
      const loadAverage = loadAverageRaw.map((value) => roundMetric(value, 2));

      return res.json({
        success: true,
        generatedAt: now,
        runtime: {
          environment: APP_ENV,
          nodeVersion: process.version,
          pid: process.pid,
          platform: process.platform,
          uptimeSeconds: Math.floor(process.uptime()),
          cpuCores,
          loadAverage,
          normalizedLoadPct: {
            oneMinute: roundMetric((loadAverageRaw[0] / cpuCores) * 100, 2),
            fiveMinutes: roundMetric((loadAverageRaw[1] / cpuCores) * 100, 2),
            fifteenMinutes: roundMetric((loadAverageRaw[2] / cpuCores) * 100, 2),
          },
          memoryMb: {
            rss: bytesToMb(memoryUsage.rss),
            heapUsed: bytesToMb(memoryUsage.heapUsed),
            heapTotal: bytesToMb(memoryUsage.heapTotal),
            external: bytesToMb(memoryUsage.external),
            arrayBuffers: bytesToMb(memoryUsage.arrayBuffers),
          },
        },
        requests: {
          active: ACTIVE_REQUESTS,
          retainedPoints: REQUEST_METRICS.length,
          retentionMinutes: Math.round(REQUEST_METRICS_RETENTION_MS / 60000),
          last1m: summarizeRequestWindow(oneMinuteEntries, 60 * 1000),
          last5m: summarizeRequestWindow(fiveMinuteEntries, 5 * 60 * 1000),
          topSlowRoutes: buildSlowRouteSummary(fiveMinuteEntries, 8),
        },
        limiters: {
          api: {
            windowMs: API_LIMIT_WINDOW_MS,
            limit: API_LIMIT_MAX_REQUESTS,
          },
          auth: {
            windowMs: AUTH_LIMIT_WINDOW_MS,
            limit: AUTH_LIMIT_MAX_REQUESTS,
          },
        },
        backgroundJobs: {
          invoiceNotifications: {
            queued: invoiceNotificationQueue.length,
            active: activeInvoiceNotificationJobs,
            concurrency: INVOICE_NOTIFICATION_CONCURRENCY,
          },
        },
      });
    } catch (error) {
      console.error("System health metrics error:", error.message || error);
      return res.status(500).json({
        error: error.message || "Failed to load system health metrics",
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
 * Delete a school and its scoped data through the backend admin SDK.
 * POST /api/superadmin/delete-school
 */
app.post(
  "/api/superadmin/delete-school",
  authLimiter,
  authMiddleware,
  superAdminMiddleware,
  async (req, res) => {
    const db = admin.firestore();
    const schoolId = normalizeSchoolId(req.body?.schoolId);

    if (!schoolId) {
      return res.status(400).json({ error: "schoolId is required." });
    }

    const schoolRef = db.collection("schools").doc(schoolId);
    const schoolSnap = await schoolRef.get();
    if (!schoolSnap.exists) {
      return res.status(404).json({ error: "School not found." });
    }

    const schoolData = schoolSnap.data() || {};
    const deletedDocs = {};
    const deletionErrors = {};
    let deletedUsers = 0;

    try {
      const usersSnap = await db
        .collection("users")
        .where("schoolId", "==", schoolId)
        .get();

      const authDeleteResults = await Promise.allSettled(
        usersSnap.docs
          .filter((userDoc) =>
            ["school_admin", "teacher"].includes(
              String(userDoc.data()?.role || ""),
            ),
          )
          .map((userDoc) => admin.auth().deleteUser(userDoc.id)),
      );
      const authFailures = authDeleteResults.filter((result) => {
        if (result.status !== "rejected") return false;
        return result.reason?.code !== "auth/user-not-found";
      });
      if (authFailures.length) {
        deletionErrors.authUsers = `${authFailures.length} Auth user(s) could not be deleted.`;
      }

      for (let i = 0; i < usersSnap.docs.length; i += 400) {
        const batch = db.batch();
        usersSnap.docs.slice(i, i + 400).forEach((userDoc) => {
          batch.delete(userDoc.ref);
        });
        await batch.commit();
      }
      deletedUsers = usersSnap.size;

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

      for (const collectionName of rootCollectionsToDelete) {
        try {
          deletedDocs[collectionName] = await deleteBackendSchoolScopedCollection(
            db,
            collectionName,
            schoolId,
          );
        } catch (error) {
          deletedDocs[collectionName] = 0;
          deletionErrors[collectionName] = error.message || String(error);
          console.error(`Failed to delete ${collectionName}:`, error);
        }
      }

      try {
        const settingsRef = db.collection("settings").doc(schoolId);
        const settingsSnap = await settingsRef.get();
        if (settingsSnap.exists) {
          await settingsRef.delete();
          deletedDocs.settings = 1;
        } else {
          deletedDocs.settings = 0;
        }
      } catch (error) {
        deletedDocs.settings = 0;
        deletionErrors.settings = error.message || String(error);
      }

      await deleteBackendSchoolDocumentTree(db, schoolId);

      await logActivity({
        eventType: "school_deleted",
        schoolId: null,
        actorUid: req.user.uid,
        actorRole: "super_admin",
        entityId: schoolId,
        meta: {
          schoolName: schoolData.name || null,
          deletedUsers,
          deletedDocs,
          deletionErrors,
        },
      });

      clearSuperAdminViewCache();
      return res.json({
        success: true,
        deletedUsers,
        deletedDocs,
        deletionErrors,
        message: "School deleted successfully.",
      });
    } catch (error) {
      console.error("Delete school error:", error);
      return res.status(500).json({
        error: error.message || "Failed to delete school.",
        deletionErrors,
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

const normalizeSpecialPricingRequest = (value) => {
  if (!value || typeof value !== "object") return null;

  const enabled = Boolean(value.enabled);
  const rawAmount = Number(value.amount);
  const amount =
    Number.isFinite(rawAmount) && rawAmount > 0
      ? Number(rawAmount.toFixed(2))
      : null;
  const cycle = String(value.cycle || "")
    .trim()
    .toLowerCase();
  const note = String(value.note || "").trim().slice(0, 240);
  const validCycle = ["monthly", "termly", "yearly"].includes(cycle)
    ? cycle
    : null;

  if (!enabled && amount === null && !validCycle && !note) {
    return null;
  }

  return {
    enabled,
    amount,
    cycle: validCycle,
    note,
  };
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
        schoolType,
        cloneFromTemplate,
        templateType,
        templateSchoolId,
        planId,
        featurePlan,
        billingStartType,
        specialPricing,
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

      const normalizedSpecialPricing =
        normalizeSpecialPricingRequest(specialPricing);
      if (normalizedSpecialPricing?.enabled) {
        if (normalizedSpecialPricing.amount === null) {
          return res.status(400).json({
            error: "Special pricing amount must be greater than 0",
          });
        }
        if (!normalizedSpecialPricing.cycle) {
          return res.status(400).json({
            error: "Special pricing cycle must be monthly, termly, or yearly",
          });
        }
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
        schoolType: schoolType ? String(schoolType).trim() : "Basic School",
        status: "active",
        plan,
        planEndsAt: trialEndsAt,
        featurePlan: featurePlan || "starter",
        billing: {
          startType:
            billingStartType === "mid_term" ? "mid_term" : "term_start",
          ...(normalizedSpecialPricing
            ? {
                specialPricing: {
                  enabled: normalizedSpecialPricing.enabled,
                  amount: normalizedSpecialPricing.amount,
                  cycle: normalizedSpecialPricing.cycle,
                  note: normalizedSpecialPricing.note,
                  createdAt: admin.firestore.FieldValue.serverTimestamp(),
                  createdBy: req.user.uid,
                  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                  updatedBy: req.user.uid,
                },
              }
            : {}),
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
          ...(normalizedSpecialPricing?.enabled
            ? {
                specialPricing: {
                  amount: normalizedSpecialPricing.amount,
                  cycle: normalizedSpecialPricing.cycle,
                },
              }
            : {}),
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
      const openAiEnabled =
        Boolean(OPENAI_API_KEY) && SUPERADMIN_AI_MODE !== "local_only";
      const openAiPreferred =
        openAiEnabled && SUPERADMIN_AI_MODE !== "local_first";
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
      const localParsed = buildLocalAiResponse({
        messages,
        dataContext,
      });
      let parsed = localParsed;
      let aiMode = "local";
      const shouldTryOpenAi =
        openAiEnabled &&
        !promptIntent.isSmallTalk &&
        !promptIntent.asksCapabilities;
      const promptLooksActionOrComplex =
        /\b(create|add|new|update|change|switch|move|set|reset|activate|deactivate|enable|disable|suspend|delete|remove|assign|apply|provision|publish|broadcast|announcement|compare|analyze|why|which|best|worst|top|recent)\b/i.test(
          latestPrompt,
        );
      const shouldUseOpenAi =
        shouldTryOpenAi &&
        (openAiPreferred ||
          isGenericLocalFallbackReply(localParsed?.reply) ||
          (!localParsed?.action && promptLooksActionOrComplex));

      if (shouldUseOpenAi) {
        try {
          const parsedOpenAi = await callSuperAdminOpenAi({
            messages,
            dataContext,
          });
          if (parsedOpenAi?.reply) {
            const openAiReply = String(parsedOpenAi.reply || "").trim();
            const shouldMergeLocalAction =
              !parsedOpenAi.action && Boolean(localParsed?.action);
            parsed = shouldMergeLocalAction
              ? {
                  reply: /\bconfirm\b/i.test(openAiReply)
                    ? openAiReply
                    : `${openAiReply}${/[.!?]$/.test(openAiReply) ? "" : "."} I also prepared the matching action. Confirm when ready.`,
                  action: localParsed.action,
                }
              : parsedOpenAi;
            aiMode = "openai";
          }
        } catch (openAiError) {
          console.warn(
            "OpenAI chat failed, switching to local assistant mode:",
            openAiError?.message || openAiError,
          );
          if (!localParsed?.reply) {
            parsed = {
              reply:
                "I could not complete that request right now. Please try again.",
              action: null,
            };
          } else {
            parsed = localParsed;
          }
        }
      } else if (!parsed?.reply) {
        parsed = {
          reply:
            "I didn't fully catch that. Please rephrase with one clear goal.",
          action: null,
        };
      }

      const responseMs = Date.now() - responseStart;
      const fallbackUsed =
        openAiEnabled && shouldUseOpenAi && aiMode !== "openai";

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
        case "create_platform_broadcast": {
          const {
            title,
            message,
            type,
            priority,
            targetType,
            targetSchoolIds = [],
            publishNow = true,
            publishAt = null,
            expiresAt = null,
          } = payload;
          const broadcastRef = admin
            .firestore()
            .collection("platformBroadcasts")
            .doc();
          const now = Date.now();
          const scheduledPublishAt = publishNow
            ? now
            : Number(publishAt || 0) || null;
          const status = publishNow
            ? "PUBLISHED"
            : scheduledPublishAt
              ? "SCHEDULED"
              : "DRAFT";

          await broadcastRef.set({
            title: trimToString(title, 120),
            message: trimToString(message, 2000),
            type: trimToString(type || "GENERAL", 40).toUpperCase(),
            priority: trimToString(priority || "NORMAL", 40).toUpperCase(),
            targetType: trimToString(targetType || "ALL", 40).toUpperCase(),
            targetSchoolIds:
              targetType === "SCHOOLS" && Array.isArray(targetSchoolIds)
                ? targetSchoolIds
                    .map((value) => trimToString(value, 80))
                    .filter(Boolean)
                : [],
            createdAt: now,
            createdBy: req.user.uid,
            publishAt: scheduledPublishAt,
            expiresAt: Number(expiresAt || 0) || null,
            status,
          });

          entityId = broadcastRef.id;
          schoolId =
            targetType === "SCHOOLS" && Array.isArray(targetSchoolIds)
              ? trimToString(targetSchoolIds[0], 80) || null
              : null;

          await logActivity({
            eventType: "platform_broadcast_created",
            schoolId,
            actorUid: req.user.uid,
            actorRole: "super_admin",
            entityId,
            meta: {
              title: trimToString(title, 120),
              type: trimToString(type || "GENERAL", 40).toUpperCase(),
              priority: trimToString(priority || "NORMAL", 40).toUpperCase(),
              status,
              targetType: trimToString(targetType || "ALL", 40).toUpperCase(),
            },
          });

          actionResult = {
            broadcastId: broadcastRef.id,
            title: trimToString(title, 120),
            status,
            targetType: trimToString(targetType || "ALL", 40).toUpperCase(),
            publishAt: scheduledPublishAt,
            expiresAt: Number(expiresAt || 0) || null,
            message: "Platform broadcast created successfully",
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
      clearSuperAdminViewCache();

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
        case "create_platform_broadcast": {
          const broadcastId = trimToString(
            result.broadcastId || payload.broadcastId || result.id,
            120,
          );
          if (!broadcastId) {
            return res
              .status(400)
              .json({ error: "Missing broadcastId for undo operation" });
          }
          await admin
            .firestore()
            .collection("platformBroadcasts")
            .doc(broadcastId)
            .delete();
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
      clearSuperAdminViewCache();

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
/**
 * GET /api/superadmin/sms/overview
 * Fetch provider status, pricing configs, usage metrics, school consumption, and recharge logs.
 */
app.get(
  "/api/superadmin/sms/overview",
  authLimiter,
  authMiddleware,
  superAdminMiddleware,
  async (req, res) => {
    try {
      // 1. Fetch Global config
      const smsConfigDoc = await admin.firestore().collection("settings").doc("platform_sms").get();
      const config = smsConfigDoc.exists ? smsConfigDoc.data() : {
        retailRatePerSms: 0.05,
        wholesaleRatePerSms: 0.02,
        providerSenderId: "SMGH"
      };

      // 2. Fetch real-time Arkesel balance if API key is present
      const ARKESEL_API_KEY = process.env.ARKESEL_API_KEY;
      let providerBalance = 0;
      let providerError = null;
      let provider;

      if (ARKESEL_API_KEY) {
        try {
          const balanceDetails = await fetchArkeselBalanceDetails(ARKESEL_API_KEY);
          providerBalance = balanceDetails.smsBalance;
          provider = {
            balance: providerBalance,
            error: null,
            senderId: config.providerSenderId || process.env.ARKESEL_SENDER_ID || "SMGH",
            apiStatus: "connected",
            credits: {
              totalCredits: providerBalance,
              availableCredits: providerBalance,
              reservedCredits: 0,
              currency: "SMS",
              lastUpdated: new Date().toISOString()
            },
            balanceBreakdown: {
              smsBalance: providerBalance,
              voiceBalance: 0,
              ussdBalance: 0,
              totalBalance: providerBalance
            },
            mainBalanceGhs: balanceDetails.mainBalance,
            source: balanceDetails.source,
            lastRefreshed: new Date().toISOString()
          };
        } catch (err) {
          providerError = err.message || "Arkesel balance API call failed";
          provider = {
            balance: 0,
            error: providerError,
            senderId: config.providerSenderId || process.env.ARKESEL_SENDER_ID || "SMGH",
            apiStatus: "error"
          };
        }
      } else {
        providerError = "Arkesel API key is not configured on the backend server. Set ARKESEL_API_KEY in the production backend environment variables and restart the service.";
        provider = {
          balance: 0,
          error: providerError,
          senderId: config.providerSenderId || process.env.ARKESEL_SENDER_ID || "SMGH",
          apiStatus: "unconfigured"
        };
      }

      // 3. Fetch Platform analytics & history from bounded summary collections.
      const summaryDoc = await admin.firestore().collection("settings").doc("platform_sms_summary").get();
      const summary = summaryDoc.exists ? summaryDoc.data() || {} : {};

      let totalSmsSent = Number(summary.totalSmsSent || 0);
      let totalRevenue = Number(summary.totalRevenue || 0);
      let totalWholesaleCost = Number(summary.totalWholesaleCost || 0);
      let totalProfitMargin = Number(summary.totalProfitMargin || 0);

      // Migration fallback for older data: scan only recent reminder docs if summary is empty.
      if (!totalSmsSent && !totalRevenue) {
        const recentRemindersSnap = await admin.firestore()
          .collection("reminders")
          .orderBy("createdAt", "desc")
          .limit(1000)
          .get()
          .catch(() => admin.firestore().collection("reminders").limit(1000).get());

        recentRemindersSnap.forEach(doc => {
          const data = doc.data();
          const count = Number(data.recipientCount || 0);
          const cost = Number(data.cost || 0);
          const wCost = Number(data.wholesaleCost || (count * (config.wholesaleRatePerSms || 0.02)));
          const profit = Number(data.profitMargin || (cost - wCost));

          totalSmsSent += count;
          totalRevenue += cost;
          totalWholesaleCost += wCost;
          totalProfitMargin += profit;
        });
      }

      const usageSnap = await admin.firestore()
        .collection("sms_school_usage")
        .orderBy("totalSms", "desc")
        .limit(100)
        .get()
        .catch(() => admin.firestore().collection("sms_school_usage").limit(100).get());

      const leaderboard = usageSnap.docs.map(doc => {
        const data = doc.data() || {};
        return {
          schoolId: data.schoolId || doc.id,
          schoolName: data.schoolName || "Unknown School",
          totalSms: Number(data.totalSms || 0),
          totalCost: Number(data.totalCost || 0)
        };
      }).sort((a, b) => b.totalSms - a.totalSms);

      // 4. Fetch only recent recharge transaction history.
      const paymentsSnap = await admin.firestore()
        .collection("payments")
        .where("type", "==", "sms_topup")
        .orderBy("createdAt", "desc")
        .limit(100)
        .get()
        .catch(() => admin.firestore()
          .collection("payments")
          .where("type", "==", "sms_topup")
          .limit(100)
          .get());

      const transactions = paymentsSnap.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          schoolId: data.schoolId,
          schoolName: data.schoolName || "Unknown School",
          amount: data.amount,
          status: data.status,
          reference: data.reference,
          adminEmail: data.adminEmail,
          createdAt: data.createdAt ? (data.createdAt.toMillis ? data.createdAt.toMillis() : data.createdAt) : Date.now()
        };
      }).sort((a, b) => b.createdAt - a.createdAt);

      res.json({
        success: true,
        provider: {
          ...provider,
          balance: providerBalance,
          error: providerError,
          senderId: config.providerSenderId || provider.senderId || "SMGH"
        },
        config,
        analytics: {
          totalSmsSent,
          totalRevenue,
          totalWholesaleCost,
          totalProfitMargin
        },
        leaderboard,
        transactions
      });

    } catch (error) {
      console.error("SMS Overview error:", error.message);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * POST /api/superadmin/sms/config
 * Update global pricing rate structures and gateway credentials.
 */
app.post(
  "/api/superadmin/sms/config",
  authLimiter,
  authMiddleware,
  superAdminMiddleware,
  async (req, res) => {
    try {
      const { retailRatePerSms, wholesaleRatePerSms, providerSenderId } = req.body;

      if (retailRatePerSms === undefined || wholesaleRatePerSms === undefined) {
        return res.status(400).json({ error: "retailRatePerSms and wholesaleRatePerSms are required." });
      }

      const retail = Number(retailRatePerSms);
      const wholesale = Number(wholesaleRatePerSms);

      if (isNaN(retail) || retail <= 0 || isNaN(wholesale) || wholesale <= 0) {
        return res.status(400).json({ error: "Rates must be valid positive numbers." });
      }

      await admin.firestore().collection("settings").doc("platform_sms").set({
        retailRatePerSms: retail,
        wholesaleRatePerSms: wholesale,
        providerSenderId: providerSenderId || "SMGH",
        updatedAt: Date.now(),
        updatedBy: req.user.uid
      }, { merge: true });

      await logActivity({
        eventType: "sms_config_updated",
        schoolId: "system",
        actorUid: req.user.uid,
        actorRole: "super_admin",
        entityId: "platform_sms",
        meta: { retail, wholesale, providerSenderId }
      });

      res.json({
        success: true,
        message: "SMS pricing configuration updated successfully."
      });
    } catch (error) {
      console.error("SMS Config Update error:", error.message);
      res.status(500).json({ error: error.message });
    }
  }
);

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
 * Initialize SMS balance Top Up via Paystack central keys
 * POST /api/billing/sms-initiate
 */
app.post(
  "/api/billing/sms-initiate",
  authLimiter,
  authMiddleware,
  schoolAdminMiddleware,
  async (req, res) => {
    try {
      const { uid, email } = req.user;
      const { amount, currency = "GHS", metadata = {} } = req.body;

      if (!amount || Number(amount) <= 0) {
        return res.status(400).json({ error: "Invalid top up amount." });
      }

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

      const reference = `sms_${schoolId}_${Date.now()}`;
      const payload = {
        email: email || userData.email,
        amount: Math.round(Number(amount) * 100), // convert to pesewas/kobo
        currency,
        reference,
        callback_url: PAYSTACK_CALLBACK_URL || undefined,
        metadata: {
          schoolId,
          adminUid: uid,
          reference,
          type: "sms_topup",
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
            amount: Math.round(Number(amount) * 100),
            currency,
            status: "pending",
            schoolId,
            schoolName: schoolDoc.data()?.name || "",
            adminUid: uid,
            adminEmail: email || userData.email || "",
            module: "billing",
            type: "sms_topup",
            category: "sms_topup",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );

      await logActivity({
        eventType: "sms_wallet_topup_initiated",
        schoolId,
        actorUid: uid,
        actorRole: "school_admin",
        entityId: reference,
        meta: { amount, currency, reference },
      });

      res.json({
        authorizationUrl: response.data.authorization_url,
        reference: response.data.reference,
      });
    } catch (error) {
      console.error("SMS Topup initiate error:", error.message);
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

      const isSmsTopup = paymentData?.type === "sms_topup";
      const wasAlreadySuccessful = String(paymentData?.status || "").toLowerCase() === "success";
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
            type: isSmsTopup ? "sms_topup" : "subscription",
            category: isSmsTopup ? "sms_topup" : "subscription",
          },
          { merge: true },
        );

      if (mappedStatus === "success") {
        if (isSmsTopup) {
          const amountGhs = (paymentData.amount || 0) / 100;
          if (!wasAlreadySuccessful) {
            await admin
              .firestore()
              .collection("schools")
              .doc(schoolId)
              .set(
                {
                  smsWallet: {
                    balance: admin.firestore.FieldValue.increment(amountGhs),
                    lastTopupAt: Date.now(),
                  },
                },
                { merge: true },
              );
            await admin
              .firestore()
              .collection("settings")
              .doc("platform_sms_summary")
              .set(
                {
                  totalTopupAmount: admin.firestore.FieldValue.increment(amountGhs),
                  totalTopupCount: admin.firestore.FieldValue.increment(1),
                  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                },
                { merge: true },
              );
          }
          await logActivity({
            eventType: "sms_wallet_topup_success",
            schoolId,
            actorUid: req.user.uid,
            actorRole: "school_admin",
            entityId: reference,
            meta: { status: mappedStatus, amount: amountGhs },
          });
          return res.json({
            success: true,
            status: mappedStatus,
            reference,
          });
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
        if (isSmsTopup) {
          await logActivity({
            eventType: "sms_wallet_topup_failed",
            schoolId,
            actorUid: req.user.uid,
            actorRole: "school_admin",
            entityId: reference,
            meta: { status: mappedStatus },
          });
          return res.json({
            success: false,
            status: mappedStatus,
            reference,
          });
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

    if (
      paymentReference &&
      String(paymentReference).startsWith("PAYROLL-") &&
      (event.event === "transfer.success" || event.event === "transfer.failed")
    ) {
      const payrollStatus =
        event.event === "transfer.success" ? "success" : "failed";
      const payrollPaymentSnap = await admin
        .firestore()
        .collection("payrollPayments")
        .where("transferReference", "==", paymentReference)
        .limit(1)
        .get();

      if (!payrollPaymentSnap.empty) {
        const paymentRef = payrollPaymentSnap.docs[0].ref;
        const paymentData = payrollPaymentSnap.docs[0].data() || {};
        await paymentRef.set(
          {
            status: payrollStatus,
            failureReason:
              payrollStatus === "failed"
                ? data?.reason || data?.gateway_response || "Transfer failed"
                : null,
            paidAt:
              payrollStatus === "success"
                ? admin.firestore.FieldValue.serverTimestamp()
                : paymentData.paidAt || null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            webhookEvent: event.event,
          },
          { merge: true },
        );

        if (payrollStatus === "success") {
          try {
            await sendStaffPayrollNotification(paymentRef.id);
          } catch (notificationError) {
            console.error("[Payroll notification] Error:", notificationError?.message || notificationError);
          }
        }

        if (paymentData.payrollRunId) {
          await refreshPayrollRunStatus(paymentData.payrollRunId);
        }
      }

      return res.status(200).send("OK");
    }

    if (!schoolId) {
      return res.status(200).send("No schoolId on webhook metadata");
    }

    if (event.event === "charge.success" && metadata?.type === "sms_topup") {
      const amountGhs = Number(data.amount || 0) / 100;
      const paymentRef = paymentReference
        ? admin.firestore().collection("payments").doc(paymentReference)
        : null;
      const previousPayment = paymentRef ? await paymentRef.get() : null;
      const wasAlreadySuccessful =
        previousPayment?.exists &&
        String(previousPayment.data()?.status || "").toLowerCase() === "success";

      if (paymentRef) {
        await paymentRef.set(
          {
            status: "success",
            paidAt: Date.now(),
            gatewayResponse: data.gateway_response || null,
            channel: data.channel || null,
            event: event.event,
            reference: paymentReference,
            schoolId,
            module: "billing",
            type: "sms_topup",
            category: "sms_topup",
          },
          { merge: true },
        );
      }

      if (!wasAlreadySuccessful && amountGhs > 0) {
        await Promise.all([
          admin.firestore().collection("schools").doc(schoolId).set(
            {
              smsWallet: {
                balance: admin.firestore.FieldValue.increment(amountGhs),
                lastTopupAt: Date.now(),
              },
            },
            { merge: true },
          ),
          admin.firestore().collection("settings").doc("platform_sms_summary").set(
            {
              totalTopupAmount: admin.firestore.FieldValue.increment(amountGhs),
              totalTopupCount: admin.firestore.FieldValue.increment(1),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true },
          ),
        ]);
      }

      await logActivity({
        eventType: "sms_wallet_topup_webhook_success",
        schoolId,
        actorUid: null,
        actorRole: "system",
        entityId: paymentReference,
        meta: { reference: paymentReference, event: event.event, amount: amountGhs },
      });

      return res.status(200).send("OK");
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

const maskAccountNumber = (value) => {
  const raw = String(value || "").replace(/\s+/g, "");
  if (raw.length <= 4) return raw ? "****" : "";
  return `${raw.slice(0, 3)}****${raw.slice(-3)}`;
};

const toMoneyAmount = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
};

const resolveSchoolAdmin = async (req, res) => {
  const userSnap = await admin.firestore().collection("users").doc(req.user.uid).get();
  const user = userSnap.exists ? userSnap.data() || {} : {};
  if (user.role !== "school_admin" || !user.schoolId) {
    res.status(403).json({ error: "Forbidden. Only school admins can manage payroll." });
    return null;
  }
  return { uid: req.user.uid, ...user };
};

const refreshPayrollRunStatus = async (payrollRunId) => {
  const db = admin.firestore();
  const paymentsSnap = await db
    .collection("payrollPayments")
    .where("payrollRunId", "==", payrollRunId)
    .get();
  const payments = paymentsSnap.docs.map((docSnap) => docSnap.data() || {});
  const successCount = payments.filter((p) => p.status === "success").length;
  const failedCount = payments.filter((p) => p.status === "failed").length;
  const pendingCount = payments.filter((p) =>
    ["pending", "otp", "draft"].includes(String(p.status || "")),
  ).length;
  let status = "processing";
  if (payments.length && successCount === payments.length) status = "completed";
  else if (payments.length && failedCount === payments.length) status = "failed";
  else if (payments.length && pendingCount === 0) status = "partial";

  await db.collection("payrollRuns").doc(payrollRunId).set(
    {
      status,
      successCount,
      failedCount,
      pendingCount,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
};

const callPaystack = async (path, options = {}) => {
  if (!PAYSTACK_SECRET_KEY) {
    throw new Error("PAYSTACK_SECRET_KEY is not set in the environment.");
  }
  if (!isLivePaystackSecret()) {
    throw new Error("Server Paystack configuration is still in test mode.");
  }

  const response = await fetch(`https://api.paystack.co${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.status === false) {
    throw new Error(data.message || `Paystack request failed with ${response.status}`);
  }
  return data;
};

const STAFF_PAYROLL_ENABLED =
  String(process.env.ENABLE_STAFF_PAYROLL || "").trim().toLowerCase() === "true";

const requireStaffPayrollEnabled = (req, res, next) => {
  if (!STAFF_PAYROLL_ENABLED) {
    return res.status(503).json({
      error: "Staff Payroll is coming soon and is not enabled for this deployment.",
    });
  }
  next();
};

const formatGhsAmount = (amount) =>
  `GHS ${Number(amount || 0).toLocaleString("en-GH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const normalizeSmsPhone = (phone) => {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("233")) return digits;
  if (digits.startsWith("0")) return `233${digits.slice(1)}`;
  return digits;
};

const sendSmsWithWallet = async ({ schoolId, phone, message }) => {
  const arkeselKey = process.env.ARKESEL_API_KEY;
  if (!arkeselKey) {
    return { success: false, skipped: true, error: "ARKESEL_API_KEY is not configured." };
  }

  const normalizedPhone = normalizeSmsPhone(phone);
  if (!normalizedPhone) {
    return { success: false, skipped: true, error: "No valid staff phone number." };
  }

  const db = admin.firestore();
  const schoolRef = db.collection("schools").doc(String(schoolId));
  const reservation = await db.runTransaction(async (tx) => {
    const schoolSnap = await tx.get(schoolRef);
    const balance = Number(schoolSnap.data()?.smsWallet?.balance || 0);
    if (balance < 1) {
      return { reserved: false, balance };
    }
    tx.update(schoolRef, { "smsWallet.balance": balance - 1 });
    return { reserved: true, balance };
  });

  if (!reservation.reserved) {
    return { success: false, skipped: true, error: "SMS wallet has no credits." };
  }

  try {
    const smsRes = await fetch("https://sms.arkesel.com/api/v2/sms/send", {
      method: "POST",
      headers: {
        "api-key": arkeselKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: process.env.ARKESEL_SENDER_ID || "SCHOOL",
        message,
        recipients: [normalizedPhone],
      }),
    });
    const smsData = await smsRes.json().catch(() => ({}));
    if (!smsRes.ok || smsData.status !== "success") {
      await schoolRef.update({
        "smsWallet.balance": admin.firestore.FieldValue.increment(1),
      });
      return {
        success: false,
        error: smsData.message || `Arkesel failed with ${smsRes.status}`,
      };
    }
    return { success: true, provider: "arkesel", phone: normalizedPhone };
  } catch (error) {
    await schoolRef.update({
      "smsWallet.balance": admin.firestore.FieldValue.increment(1),
    });
    return { success: false, error: error.message || "SMS send failed." };
  }
};

const sendStaffPayrollNotification = async (paymentId) => {
  const db = admin.firestore();
  const paymentRef = db.collection("payrollPayments").doc(String(paymentId));
  const paymentSnap = await paymentRef.get();
  if (!paymentSnap.exists) return { success: false, skipped: true, error: "Payment not found." };

  const payment = paymentSnap.data() || {};
  if (payment.status !== "success") {
    return { success: false, skipped: true, error: "Payment is not successful yet." };
  }
  if (payment.notificationStatus === "sent") {
    return { success: true, skipped: true, channel: payment.notificationChannel || null };
  }

  let staffPhone = String(payment.staffPhoneNumber || "").trim();
  if (!staffPhone && payment.staffId) {
    const staffSnap = await db.collection("users").doc(String(payment.staffId)).get();
    staffPhone = String(staffSnap.data()?.phoneNumber || "").trim();
  }
  if (!staffPhone) {
    await paymentRef.set(
      {
        notificationStatus: "skipped",
        notificationError: "No staff phone number on profile.",
        notificationUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return { success: false, skipped: true, error: "No staff phone number." };
  }

  const [schoolSnap, runSnap] = await Promise.all([
    db.collection("schools").doc(String(payment.schoolId)).get(),
    payment.payrollRunId
      ? db.collection("payrollRuns").doc(String(payment.payrollRunId)).get()
      : Promise.resolve(null),
  ]);
  const schoolName = schoolSnap.data()?.name || "Your school";
  const period = runSnap?.exists ? runSnap.data()?.period : "";
  const referenceText = payment.transferReference
    ? ` Reference: ${payment.transferReference}.`
    : "";
  const message = [
    `Hello ${payment.staffName || "Staff"},`,
    `${schoolName} has paid your staff salary${period ? ` for ${period}` : ""}.`,
    `Amount: ${formatGhsAmount(payment.amount)}.`,
    `Please check your bank or MoMo account.${referenceText}`,
  ].join(" ");

  await paymentRef.set(
    {
      notificationStatus: "sending",
      notificationUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  let whatsappResult = { success: false, skipped: true, error: "WhatsApp not attempted." };
  try {
    const svc = await loadWhatsAppService();
    const readiness = svc?.ensureWhatsAppReady
      ? await svc.ensureWhatsAppReady()
      : { ready: false, status: "unavailable" };
    if (svc?.sendWhatsAppMessage && readiness.ready) {
      whatsappResult = await svc.sendWhatsAppMessage(staffPhone, message);
    } else {
      whatsappResult = {
        success: false,
        skipped: true,
        error: `WhatsApp is not ready (${readiness.status || "unavailable"}).`,
      };
    }
  } catch (error) {
    whatsappResult = { success: false, error: error.message || "WhatsApp send failed." };
  }

  if (whatsappResult.success) {
    await paymentRef.set(
      {
        notificationStatus: "sent",
        notificationChannel: "whatsapp",
        notificationPhone: normalizeSmsPhone(staffPhone),
        notificationSentAt: admin.firestore.FieldValue.serverTimestamp(),
        notificationUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        notificationError: null,
      },
      { merge: true },
    );
    return { success: true, channel: "whatsapp" };
  }

  const smsResult = await sendSmsWithWallet({
    schoolId: payment.schoolId,
    phone: staffPhone,
    message,
  });

  await paymentRef.set(
    {
      notificationStatus: smsResult.success ? "sent" : "failed",
      notificationChannel: smsResult.success ? "sms" : null,
      notificationPhone: normalizeSmsPhone(staffPhone),
      notificationSentAt: smsResult.success
        ? admin.firestore.FieldValue.serverTimestamp()
        : payment.notificationSentAt || null,
      notificationUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      notificationError: smsResult.success
        ? null
        : smsResult.error || whatsappResult.error || "Notification failed.",
      whatsappNotificationError: whatsappResult.error || null,
      smsNotificationError: smsResult.error || null,
    },
    { merge: true },
  );

  return smsResult.success
    ? { success: true, channel: "sms" }
    : { success: false, error: smsResult.error || whatsappResult.error };
};

app.get("/api/payroll/banks", authMiddleware, requireStaffPayrollEnabled, async (req, res) => {
  try {
    const caller = await resolveSchoolAdmin(req, res);
    if (!caller) return;
    const type = String(req.query.type || "mobile_money").trim();
    if (!["mobile_money", "ghipss"].includes(type)) {
      return res.status(400).json({ error: "Invalid payout account type." });
    }

    const data = await callPaystack(
      `/bank?currency=GHS&type=${encodeURIComponent(type)}`,
    );
    const banks = Array.isArray(data.data)
      ? data.data.map((bank) => ({
          name: bank.name,
          code: bank.code,
          type: bank.type || type,
        }))
      : [];
    return res.json({ success: true, banks });
  } catch (error) {
    console.error("[Payroll banks] Error:", error);
    return res.status(500).json({ error: error.message || "Failed to load payout providers." });
  }
});

app.get("/api/payroll/overview", authMiddleware, requireStaffPayrollEnabled, async (req, res) => {
  try {
    const caller = await resolveSchoolAdmin(req, res);
    if (!caller) return;
    const db = admin.firestore();
    const [profilesSnap, runsSnap, paymentsSnap] = await Promise.all([
      db.collection("staffPaymentProfiles").where("schoolId", "==", caller.schoolId).get(),
      db.collection("payrollRuns").where("schoolId", "==", caller.schoolId).get(),
      db.collection("payrollPayments").where("schoolId", "==", caller.schoolId).get(),
    ]);

    const mapDoc = (docSnap) => ({ id: docSnap.id, ...docSnap.data() });
    const byCreatedDesc = (a, b) =>
      Number(b.createdAt?.toMillis?.() || b.createdAt || 0) -
      Number(a.createdAt?.toMillis?.() || a.createdAt || 0);

    return res.json({
      success: true,
      profiles: profilesSnap.docs.map(mapDoc),
      runs: runsSnap.docs.map(mapDoc).sort(byCreatedDesc).slice(0, 20),
      payments: paymentsSnap.docs.map(mapDoc).sort(byCreatedDesc).slice(0, 100),
    });
  } catch (error) {
    console.error("[Payroll overview] Error:", error);
    return res.status(500).json({ error: "Failed to load payroll overview." });
  }
});

app.post("/api/payroll/profiles", authMiddleware, requireStaffPayrollEnabled, async (req, res) => {
  try {
    const caller = await resolveSchoolAdmin(req, res);
    if (!caller) return;
    const {
      staffId,
      staffName,
      staffEmail,
      staffPhoneNumber,
      paymentMethod,
      accountName,
      accountNumber,
      bankCode,
      bankName,
      salaryAmount,
    } = req.body || {};

    if (!staffId || !staffName || !accountName || !accountNumber || !bankCode) {
      return res.status(400).json({ error: "Staff name and payout account details are required." });
    }
    if (!["mobile_money", "ghipss"].includes(String(paymentMethod))) {
      return res.status(400).json({ error: "Choose Mobile Money or Bank Account." });
    }
    const salary = toMoneyAmount(salaryAmount);
    if (salary <= 0) {
      return res.status(400).json({ error: "Enter a valid salary amount." });
    }

    const staffSnap = await admin.firestore().collection("users").doc(String(staffId)).get();
    const staff = staffSnap.exists ? staffSnap.data() || {} : {};
    if (staff.schoolId !== caller.schoolId || staff.role !== "teacher") {
      return res.status(403).json({ error: "This staff member does not belong to your school." });
    }

    const recipientPayload = {
      type: paymentMethod,
      name: accountName,
      account_number: String(accountNumber).replace(/\s+/g, ""),
      bank_code: bankCode,
      currency: "GHS",
      metadata: {
        schoolId: caller.schoolId,
        staffId,
        staffName,
      },
    };
    const recipientData = await callPaystack("/transferrecipient", {
      method: "POST",
      body: recipientPayload,
    });
    const recipientCode = recipientData?.data?.recipient_code;
    if (!recipientCode) {
      return res.status(400).json({ error: "Paystack did not return a transfer recipient code." });
    }

    const profileRef = admin.firestore().collection("staffPaymentProfiles").doc(String(staffId));
    const profile = {
      schoolId: caller.schoolId,
      staffId: String(staffId),
      staffName: String(staffName).trim(),
      staffEmail: staffEmail || staff.email || null,
      staffPhoneNumber: String(staffPhoneNumber || staff.phoneNumber || "").trim() || null,
      paymentMethod,
      accountName: String(accountName).trim(),
      accountNumberMasked: maskAccountNumber(accountNumber),
      bankCode: String(bankCode).trim(),
      bankName: String(bankName || bankCode).trim(),
      salaryAmount: salary,
      recipientCode,
      isVerified: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: caller.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await profileRef.set(profile, { merge: true });
    await logActivity({
      eventType: "staff_payroll_profile_saved",
      schoolId: caller.schoolId,
      actorUid: caller.uid,
      actorRole: "school_admin",
      entityId: String(staffId),
      meta: { staffName, paymentMethod, bankName, salary },
    });
    return res.json({ success: true, profile: { id: profileRef.id, ...profile } });
  } catch (error) {
    console.error("[Payroll profile] Error:", error);
    return res.status(500).json({ error: error.message || "Failed to save payroll profile." });
  }
});

app.post("/api/payroll/runs", authMiddleware, requireStaffPayrollEnabled, async (req, res) => {
  try {
    const caller = await resolveSchoolAdmin(req, res);
    if (!caller) return;
    const period = String(req.body?.period || "").trim();
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!period) return res.status(400).json({ error: "Payroll period is required." });
    if (!items.length) return res.status(400).json({ error: "Select at least one staff member." });

    const db = admin.firestore();
    const duplicateSnap = await db
      .collection("payrollRuns")
      .where("schoolId", "==", caller.schoolId)
      .where("period", "==", period)
      .where("status", "in", ["draft", "processing", "completed", "partial"])
      .limit(1)
      .get();
    if (!duplicateSnap.empty) {
      return res.status(400).json({ error: "A payroll run already exists for this period." });
    }

    const runRef = db.collection("payrollRuns").doc();
    const payments = [];
    let totalAmount = 0;
    const batch = db.batch();

    for (const item of items) {
      const profileSnap = await db.collection("staffPaymentProfiles").doc(String(item.staffId)).get();
      if (!profileSnap.exists) continue;
      const profile = profileSnap.data() || {};
      if (profile.schoolId !== caller.schoolId || !profile.recipientCode) continue;
      const allowance = toMoneyAmount(item.allowance || 0);
      const deduction = toMoneyAmount(item.deduction || 0);
      const baseAmount = toMoneyAmount(item.amount || profile.salaryAmount);
      const netPay = Math.max(0, toMoneyAmount(baseAmount + allowance - deduction));
      if (netPay <= 0) continue;
      totalAmount += netPay;
      const paymentRef = db.collection("payrollPayments").doc();
      const payment = {
        id: paymentRef.id,
        schoolId: caller.schoolId,
        payrollRunId: runRef.id,
        staffId: profile.staffId,
        staffName: profile.staffName,
        staffPhoneNumber: profile.staffPhoneNumber || null,
        amount: netPay,
        baseAmount,
        allowance,
        deduction,
        recipientCode: profile.recipientCode,
        status: "draft",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      payments.push(payment);
      batch.set(paymentRef, payment);
    }

    if (!payments.length || totalAmount <= 0) {
      return res.status(400).json({ error: "No valid staff payment profiles were selected." });
    }

    const run = {
      id: runRef.id,
      schoolId: caller.schoolId,
      period,
      status: "draft",
      totalAmount: toMoneyAmount(totalAmount),
      staffCount: payments.length,
      createdBy: caller.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    batch.set(runRef, run);
    await batch.commit();
    await logActivity({
      eventType: "payroll_run_created",
      schoolId: caller.schoolId,
      actorUid: caller.uid,
      actorRole: "school_admin",
      entityId: runRef.id,
      meta: { period, totalAmount: run.totalAmount, staffCount: payments.length },
    });
    return res.json({ success: true, run, payments });
  } catch (error) {
    console.error("[Payroll run create] Error:", error);
    return res.status(500).json({ error: error.message || "Failed to create payroll run." });
  }
});

app.post("/api/payroll/runs/:runId/pay", authMiddleware, requireStaffPayrollEnabled, async (req, res) => {
  try {
    const caller = await resolveSchoolAdmin(req, res);
    if (!caller) return;
    if (String(req.body?.confirmation || "").trim().toUpperCase() !== "PAY STAFF") {
      return res.status(400).json({ error: "Type PAY STAFF to confirm this payroll payout." });
    }

    const db = admin.firestore();
    const runRef = db.collection("payrollRuns").doc(String(req.params.runId));
    const runSnap = await runRef.get();
    if (!runSnap.exists) return res.status(404).json({ error: "Payroll run not found." });
    const run = runSnap.data() || {};
    if (run.schoolId !== caller.schoolId) return res.status(403).json({ error: "Forbidden." });
    if (run.status !== "draft") {
      return res.status(400).json({ error: "Only draft payroll runs can be paid." });
    }

    const paymentsSnap = await db
      .collection("payrollPayments")
      .where("payrollRunId", "==", runRef.id)
      .where("schoolId", "==", caller.schoolId)
      .get();
    const paymentDocs = paymentsSnap.docs.filter((docSnap) => docSnap.data()?.status === "draft");
    if (!paymentDocs.length) {
      return res.status(400).json({ error: "No draft payments found for this payroll run." });
    }

    await runRef.set(
      {
        status: "processing",
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        processedBy: caller.uid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    const results = [];
    for (const paymentDoc of paymentDocs) {
      const payment = paymentDoc.data() || {};
      const reference = `PAYROLL-${runRef.id.slice(0, 8)}-${paymentDoc.id.slice(0, 8)}-${Date.now()}`;
      try {
        const transferData = await callPaystack("/transfer", {
          method: "POST",
          body: {
            source: "balance",
            amount: Math.round(Number(payment.amount || 0) * 100),
            recipient: payment.recipientCode,
            reference,
            reason: `Staff salary - ${run.period}`,
            currency: "GHS",
          },
        });
        const status = transferData?.data?.status || "pending";
        await paymentDoc.ref.set(
          {
            status,
            transferReference: reference,
            paystackTransferCode: transferData?.data?.transfer_code || null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        if (status === "success") {
          try {
            await sendStaffPayrollNotification(paymentDoc.id);
          } catch (notificationError) {
            console.error("[Payroll notification] Error:", notificationError?.message || notificationError);
          }
        }
        results.push({ id: paymentDoc.id, ...payment, status, transferReference: reference });
      } catch (transferError) {
        await paymentDoc.ref.set(
          {
            status: "failed",
            transferReference: reference,
            failureReason: transferError.message || "Transfer failed",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        results.push({
          id: paymentDoc.id,
          ...payment,
          status: "failed",
          transferReference: reference,
          failureReason: transferError.message || "Transfer failed",
        });
      }
    }

    await refreshPayrollRunStatus(runRef.id);
    const refreshedRun = await runRef.get();
    await logActivity({
      eventType: "payroll_run_processed",
      schoolId: caller.schoolId,
      actorUid: caller.uid,
      actorRole: "school_admin",
      entityId: runRef.id,
      meta: { period: run.period, totalAmount: run.totalAmount, staffCount: paymentDocs.length },
    });
    return res.json({
      success: true,
      run: { id: refreshedRun.id, ...refreshedRun.data() },
      payments: results,
    });
  } catch (error) {
    console.error("[Payroll run pay] Error:", error);
    return res.status(500).json({ error: error.message || "Failed to process payroll." });
  }
});

app.post("/api/payroll/payments/:paymentId/finalize", authMiddleware, requireStaffPayrollEnabled, async (req, res) => {
  try {
    const caller = await resolveSchoolAdmin(req, res);
    if (!caller) return;
    const otp = String(req.body?.otp || "").trim();
    if (!otp) return res.status(400).json({ error: "Transfer OTP is required." });

    const db = admin.firestore();
    const paymentRef = db.collection("payrollPayments").doc(String(req.params.paymentId));
    const paymentSnap = await paymentRef.get();
    if (!paymentSnap.exists) return res.status(404).json({ error: "Payroll payment not found." });
    const payment = paymentSnap.data() || {};
    if (payment.schoolId !== caller.schoolId) return res.status(403).json({ error: "Forbidden." });
    if (payment.status !== "otp" || !payment.paystackTransferCode) {
      return res.status(400).json({ error: "This payroll payment is not waiting for an OTP." });
    }

    const finalizeData = await callPaystack("/transfer/finalize_transfer", {
      method: "POST",
      body: {
        transfer_code: payment.paystackTransferCode,
        otp,
      },
    });
    const status = finalizeData?.data?.status || "pending";
    await paymentRef.set(
      {
        status,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        finalizedBy: caller.uid,
      },
      { merge: true },
    );
    if (status === "success") {
      try {
        await sendStaffPayrollNotification(paymentRef.id);
      } catch (notificationError) {
        console.error("[Payroll notification] Error:", notificationError?.message || notificationError);
      }
    }
    if (payment.payrollRunId) {
      await refreshPayrollRunStatus(payment.payrollRunId);
    }
    await logActivity({
      eventType: "payroll_transfer_finalized",
      schoolId: caller.schoolId,
      actorUid: caller.uid,
      actorRole: "school_admin",
      entityId: paymentRef.id,
      meta: { payrollRunId: payment.payrollRunId, staffId: payment.staffId, status },
    });
    const updatedSnap = await paymentRef.get();
    return res.json({ success: true, payment: { id: updatedSnap.id, ...updatedSnap.data() } });
  } catch (error) {
    console.error("[Payroll transfer finalize] Error:", error);
    return res.status(500).json({ error: error.message || "Failed to finalize payroll transfer." });
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
/**
 * Public Marketing Endpoints
 */
app.post("/api/public/book-demo", async (req, res) => {
  try {
    const {
      fullName,
      schoolName,
      role,
      phone,
      email,
      studentCount,
      schoolType,
      preferredDate,
      preferredTime,
      message,
      source,
    } = req.body;

    const safeFullName = String(fullName || "").trim();
    const safeSchoolName = String(schoolName || "").trim();
    const safeEmail = String(email || "").trim().toLowerCase();

    if (!safeFullName || !safeSchoolName || !safeEmail) {
      return res.status(400).json({
        error: "Full name, school name, and email are required.",
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeEmail)) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }

    const demoDoc = {
      fullName: safeFullName,
      schoolName: safeSchoolName,
      role: String(role || "").trim(),
      phone: String(phone || "").trim(),
      email: safeEmail,
      studentCount: Number(studentCount) || 0,
      schoolType: String(schoolType || "").trim(),
      preferredDate: String(preferredDate || "").trim(),
      preferredTime: String(preferredTime || "").trim(),
      message: String(message || "").trim(),
      source: String(source || "").trim(),
      status: "new",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const demoRef = await admin.firestore().collection("demo_requests").add(demoDoc);
    const notifications = await sendDemoNotifications(demoDoc);
    await demoRef.set(
      {
        notifications,
        notifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    if (!notifications.email?.sent) {
      console.warn("[BookDemo] request saved but owner email was not delivered", {
        demoRequestId: demoRef.id,
        email: summarizeNotificationFailure(notifications.email),
      });
    }

    res.json({
      success: true,
      message: notifications.email?.sent
        ? "Demo request received"
        : "Demo request received. Owner email was not delivered, but WhatsApp link is available.",
      demoRequestId: demoRef.id,
      whatsappUrl: notifications.whatsapp?.url,
      notifications,
    });
  } catch (error) {
    console.error("Error booking demo:", error);
    res.status(500).json({ error: error.message || "Failed to book demo" });
  }
});

app.post("/api/public/start-trial", async (req, res) => {
  try {
    const {
      schoolName,
      schoolPhone,
      schoolEmail,
      address,
      schoolType,
      studentEstimate,
      adminFullName,
      adminEmail,
      password,
      academicYear,
      currentTerm,
      onboardingTemplate,
      logoData, // New: base64 logo data
      logoFileName, // New: logo filename
      plan,
      featurePlan,
    } = req.body;

    const safeEmail = String(adminEmail || "").trim().toLowerCase();
    if (!safeEmail) {
      return res.status(400).json({ error: "Admin email is required" });
    }

    try {
      await retryFirebaseAdminNetworkCall("check trial admin email", () =>
        admin.auth().getUserByEmail(safeEmail),
      );
      return res.status(400).json({ error: "A user with this email already exists" });
    } catch (error) {
      if (error.code !== "auth/user-not-found") {
        throw error;
      }
    }

    if (!password || password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters long" });
    }

    const schoolRef = admin.firestore().collection("schools").doc();
    const schoolId = schoolRef.id;

    // Store trial logos as Firebase Storage download URLs so they render
    // outside the uploader preview, including dashboards and admin lists.
    let finalLogoUrl = "";
    if (typeof logoData === "string" && logoData.includes("base64,")) {
      try {
        const logoDataMatch = String(logoData).match(
          /^data:(image\/(?:png|jpe?g|webp|gif|svg\+xml));base64,(.+)$/i,
        );
        if (!logoDataMatch) {
          return res.status(400).json({
            error: "Logo must be a PNG, JPG, WEBP, GIF, or SVG image",
          });
        }

        const [, contentType, base64String] = logoDataMatch;
        console.log(`[StartTrial] Processing logo: ${logoFileName} (${base64String.length} chars)`);
        const buffer = Buffer.from(base64String, "base64");
        if (buffer.length > 2 * 1024 * 1024) {
          return res.status(400).json({ error: "Logo size must be less than 2MB" });
        }

        const extensionByType = {
          "image/png": "png",
          "image/jpeg": "jpg",
          "image/jpg": "jpg",
          "image/webp": "webp",
          "image/gif": "gif",
          "image/svg+xml": "svg",
        };
        const ext = extensionByType[contentType.toLowerCase()] || "png";
        const fileName = `schools/${schoolId}/logo/brand.${ext}`;
        const downloadToken = crypto.randomUUID();
        const bucketCandidates = getStorageBucketCandidates();
        if (!bucketCandidates.length) {
          throw new Error("No Firebase Storage bucket is configured for this project.");
        }

        let uploadedBucketName = "";
        let lastBucketError = null;
        for (const bucketName of bucketCandidates) {
          try {
            const bucket = admin.storage().bucket(bucketName);
            const file = bucket.file(fileName);

            console.log("[StartTrial] Saving file to bucket:", bucketName, fileName);
            await file.save(buffer, {
              metadata: {
                contentType,
                cacheControl: "public, max-age=31536000",
                metadata: {
                  firebaseStorageDownloadTokens: downloadToken,
                },
              },
            });

            uploadedBucketName = bucket.name;
            break;
          } catch (bucketError) {
            lastBucketError = bucketError;
            const status = bucketError?.code || bucketError?.status || bucketError?.response?.status;
            console.warn("[StartTrial] Logo upload failed for bucket:", bucketName, status || bucketError?.message || bucketError);
          }
        }

        if (!uploadedBucketName) {
          if (buffer.length <= FIRESTORE_INLINE_LOGO_MAX_BYTES) {
            finalLogoUrl = `data:${contentType};base64,${base64String}`;
            console.warn(
              "[StartTrial] Storage upload failed for all buckets. Using inline logo data URL fallback.",
              {
                bytes: buffer.length,
                attemptedBuckets: bucketCandidates,
              },
            );
          } else {
            const attemptedBuckets = bucketCandidates.join(", ");
            const error = new Error(
              "Logo upload failed because no configured Firebase Storage bucket exists. " +
                `Tried: ${attemptedBuckets}. Configure FIREBASE_STORAGE_BUCKET or create a Firebase Storage bucket.`,
            );
            error.cause = lastBucketError;
            throw error;
          }
        }

        if (uploadedBucketName) {
          finalLogoUrl = `https://firebasestorage.googleapis.com/v0/b/${uploadedBucketName}/o/${encodeURIComponent(fileName)}?alt=media&token=${downloadToken}`;
          console.log("[StartTrial] Logo upload successful. URL:", finalLogoUrl);
        }
      } catch (uploadError) {
        console.error("[StartTrial] Backend logo upload failed:", uploadError);
        return res.status(500).json({
          error:
            uploadError?.message ||
            "Logo upload failed. Please try a smaller image or continue without a logo.",
        });
      }
    }

    const featurePlanSafe = String(featurePlan || "starter").trim().toLowerCase();
    const maxStudents = featurePlanSafe === "standard" ? 0 : 500;

    // Calculate trial end date (30 days from now) - store as Firestore Timestamp
    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + 30);
    
    const schoolDoc = {
      name: String(schoolName || "").trim(),
      phone: String(schoolPhone || "").trim(),
      email: String(schoolEmail || "").trim().toLowerCase(),
      address: String(address || "").trim(),
      schoolType: String(schoolType || "").trim(),
      studentsCount: 0,
      limits: { maxStudents }, // Enforce hard limits based on plan
      status: "trial_active",
      plan: String(plan || "trial").trim(),
      featurePlan: featurePlanSafe,
      logoUrl: finalLogoUrl, // Store the URL immediately
      onboardingTemplate: String(onboardingTemplate || "default"),
      planEndsAt: admin.firestore.Timestamp.fromDate(trialEndDate),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const settingsDoc = {
      academicYear: String(academicYear || "").trim(),
      currentTerm: String(currentTerm || "").trim(),
      logoUrl: finalLogoUrl,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const userRecord = await retryFirebaseAdminNetworkCall(
      "create trial admin auth user",
      () =>
        admin.auth().createUser({
          email: safeEmail,
          password: password,
          displayName: String(adminFullName || "").trim(),
        }),
    );

    const requestOrigin = normalizeOriginValue(req.headers.origin || "");
    const configuredAppOrigin = normalizeOriginValue(
      process.env.PUBLIC_APP_URL ||
        process.env.FRONTEND_URL ||
        process.env.CLIENT_URL ||
        process.env.APP_URL ||
        "https://school-manager-gh.web.app",
    );
    let emailVerificationLink = "";
    const verificationOrigins = [
      requestOrigin && isAllowedOrigin(requestOrigin) ? requestOrigin : "",
      configuredAppOrigin,
      "https://school-manager-gh.web.app",
    ].filter((origin, index, origins) => origin && origins.indexOf(origin) === index);

    for (const origin of verificationOrigins) {
      const verificationContinueUrl = `${origin}/?${new URLSearchParams({
        authAction: "emailVerified",
        email: safeEmail,
      }).toString()}`;
      try {
        emailVerificationLink = await retryFirebaseAdminNetworkCall(
          "generate trial admin email verification link",
          () =>
            admin.auth().generateEmailVerificationLink(safeEmail, {
              url: verificationContinueUrl,
              handleCodeInApp: true,
            }),
        );
        break;
      } catch (verificationLinkError) {
        console.error(
          "[StartTrial] Failed to generate email verification link for origin:",
          origin,
          verificationLinkError?.message || verificationLinkError,
        );
      }
    }

    const userDoc = {
      fullName: String(adminFullName || "").trim(),
      email: safeEmail,
      role: "school_admin",
      schoolId: schoolId,
      status: "active",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const batch = admin.firestore().batch();
    batch.set(schoolRef, schoolDoc);
    batch.set(admin.firestore().collection("settings").doc(schoolId), settingsDoc);
    batch.set(admin.firestore().collection("users").doc(userRecord.uid), userDoc);

    const onboardingRef = admin.firestore().collection("onboarding_sessions").doc();
    batch.set(onboardingRef, {
      schoolId,
      adminUid: userRecord.uid,
      source: "start_free_trial",
      step: "completed",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await batch.commit();

    // --- Notifications (fire-and-forget, don't block response) ---
    const safeSchoolName = String(schoolName || "").trim() || "Unknown School";
    const safeAdminName  = String(adminFullName || "").trim() || "Unknown";
    const safeSchoolType = String(schoolType || "").trim() || "Not specified";
    const safeSchoolPhone = String(schoolPhone || "").trim() || "Not provided";
    const safeSchoolEmail = String(schoolEmail || "").trim().toLowerCase() || "Not provided";
    const safeAddress = String(address || "").trim() || "Not provided";
    const safeStudentEstimate = studentEstimate || "Not provided";
    const safeFeaturePlan = String(featurePlan || "starter").toUpperCase();
    const safeBillingCycle = String(plan || "trial").toUpperCase();
    const safeAcademicYear = String(academicYear || "").trim() || "N/A";
    const safeCurrentTerm = String(currentTerm || "").trim() || "N/A";

    const trialNotificationText = [
      "New School Registration",
      "",
      `School: ${safeSchoolName}`,
      `School Email: ${safeSchoolEmail}`,
      `School Phone: ${safeSchoolPhone}`,
      `Address: ${safeAddress}`,
      `School Type: ${safeSchoolType}`,
      `Estimated Students: ${safeStudentEstimate}`,
      "",
      `Admin Name: ${safeAdminName}`,
      `Admin Email: ${safeEmail}`,
      "",
      `Feature Plan: ${safeFeaturePlan}`,
      `Billing Cycle: ${safeBillingCycle}`,
      `Academic Year: ${safeAcademicYear}`,
      `Current Term: ${safeCurrentTerm}`,
      "",
      `School ID: ${schoolId}`,
    ].join("\n");

    const trialNotificationHtml = `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
        <h2 style="margin:0 0 16px">New School Registration</h2>
        <table cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:680px">
          ${[
            ["School", safeSchoolName],
            ["School Email", safeSchoolEmail],
            ["School Phone", safeSchoolPhone],
            ["Address", safeAddress],
            ["School Type", safeSchoolType],
            ["Estimated Students", safeStudentEstimate],
            ["Admin Name", safeAdminName],
            ["Admin Email", safeEmail],
            ["Feature Plan", safeFeaturePlan],
            ["Billing Cycle", safeBillingCycle],
            ["Academic Year", safeAcademicYear],
            ["Current Term", safeCurrentTerm],
            ["School ID", schoolId],
          ].map(([label, value]) => `
            <tr>
              <td style="border:1px solid #e2e8f0;font-weight:700;background:#f8fafc;width:180px">${escapeHtml(label)}</td>
              <td style="border:1px solid #e2e8f0">${escapeHtml(value || "Not provided")}</td>
            </tr>
          `).join("")}
        </table>
      </div>
    `;

    // 1. WhatsApp alert to super admin via Twilio
    const sendTrialWhatsapp = async () => {
      console.log("[StartTrial] Sending WhatsApp...");
      const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM;
      const whatsappTo = process.env.TRIAL_NOTIFY_WHATSAPP || process.env.DEMO_NOTIFY_WHATSAPP;

      if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !whatsappFrom || !whatsappTo) {
        console.warn("[StartTrial] WhatsApp skipped: missing Twilio env vars", {
          sid: !!process.env.TWILIO_ACCOUNT_SID,
          token: !!process.env.TWILIO_AUTH_TOKEN,
          from: !!whatsappFrom,
          to: !!whatsappTo
        });
        return { sent: false, skipped: true };
      }
      const form = new URLSearchParams();
      form.set("From", normalizeWhatsappAddress(whatsappFrom));
      form.set("To", normalizeWhatsappAddress(whatsappTo));
      form.set("Body", trialNotificationText);

      const authHeader = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(process.env.TWILIO_ACCOUNT_SID)}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${authHeader}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: form,
        },
      );
      const resBody = await response.json().catch(() => ({}));
      console.log("[StartTrial] Twilio status:", response.status);
      if (!response.ok) {
        console.error("[StartTrial] Twilio error:", resBody);
        throw new Error(resBody?.message || `Twilio failed with ${response.status}`);
      }
      console.log("[StartTrial] WhatsApp sent:", resBody?.sid);
      return { sent: true, provider: "twilio", sid: resBody?.sid || null };
    };

    // 2. Owner email alert with the submitted registration details.
    const sendTrialOwnerEmail = async () => {
      const resendKey = process.env.RESEND_API_KEY;
      const resendFrom = process.env.RESEND_FROM_EMAIL;
      if (!resendKey || !resendFrom || !TRIAL_NOTIFY_EMAIL) {
        console.warn("[StartTrial] Owner email skipped: missing Resend or recipient env vars");
        return { sent: false, skipped: true };
      }
      const from = process.env.RESEND_FROM_NAME
        ? `${process.env.RESEND_FROM_NAME} <${resendFrom}>`
        : resendFrom;

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [TRIAL_NOTIFY_EMAIL],
          reply_to: safeEmail || undefined,
          subject: `New School Registration: ${safeSchoolName}`,
          text: trialNotificationText,
          html: trialNotificationHtml,
        }),
      });
      const resBody = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(resBody?.message || `Resend failed with ${response.status}`);
      }
      return { sent: true, provider: "resend", id: resBody?.id || null };
    };

    // 3. Welcome + verification guidance email to the new school admin via Resend
    const sendTrialWelcomeEmail = async () => {
      const resendKey = process.env.RESEND_API_KEY;
      const resendFrom = process.env.RESEND_FROM_EMAIL;
      if (!resendKey || !resendFrom) {
        console.warn("[StartTrial] Welcome email skipped: missing Resend env vars");
        return { sent: false, skipped: true };
      }
      const from = process.env.RESEND_FROM_NAME ? `${process.env.RESEND_FROM_NAME} <${resendFrom}>` : resendFrom;

      const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#0f172a">
          <div style="background:linear-gradient(135deg,#0B4A82,#1160A8);padding:40px 32px;border-radius:16px 16px 0 0;text-align:center">
            <h1 style="color:white;margin:0;font-size:24px">Welcome to School Manager GH 🇬🇭</h1>
            <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:15px">Your free trial workspace is ready</p>
          </div>
          <div style="background:white;padding:32px;border:1px solid #DBEAFE;border-top:none">
            <p style="font-size:16px;margin:0 0 16px">Hi <strong>${escapeHtml(safeAdminName)}</strong>,</p>
            <p style="color:#475569;line-height:1.7;margin:0 0 24px">
              Your school workspace for <strong>${escapeHtml(safeSchoolName)}</strong> has been created successfully on School Manager GH.
            </p>

            <div style="background:#EFF6FF;border-radius:12px;padding:20px;border:1px solid #BFDBFE;margin-bottom:24px">
              <h3 style="margin:0 0 12px;color:#0B4A82;font-size:15px">✅ Next Step: Verify your email</h3>
              <p style="color:#374151;font-size:14px;line-height:1.7;margin:0">
                You should receive a separate <strong>verification email from Firebase</strong> shortly.
                Please click the link in that email to activate your account and gain access to your dashboard.
              </p>
            </div>

            ${
              emailVerificationLink
                ? `<p style="margin:-10px 0 24px"><a href="${escapeHtml(emailVerificationLink)}" style="display:inline-block;background:#0B4A82;color:white;text-decoration:none;border-radius:999px;padding:12px 20px;font-size:14px;font-weight:700">Verify Email Address</a></p>`
                : ""
            }

            <div style="background:#F8FAFC;border-radius:12px;padding:20px;border:1px solid #E2E8F0;margin-bottom:24px">
              <h3 style="margin:0 0 12px;color:#0f172a;font-size:15px">Your Account Details</h3>
              <table cellpadding="6" cellspacing="0" style="width:100%;font-size:14px">
                <tr><td style="color:#64748B;width:140px">School Name</td><td><strong>${escapeHtml(safeSchoolName)}</strong></td></tr>
                <tr><td style="color:#64748B">Your Email</td><td><strong>${escapeHtml(safeEmail)}</strong></td></tr>
                <tr><td style="color:#64748B">School Type</td><td>${escapeHtml(safeSchoolType)}</td></tr>
                <tr><td style="color:#64748B">Academic Year</td><td>${escapeHtml(String(academicYear || "").trim() || "N/A")}</td></tr>
                <tr><td style="color:#64748B">Current Term</td><td>${escapeHtml(String(currentTerm || "").trim() || "N/A")}</td></tr>
              </table>
            </div>

            <p style="color:#64748B;font-size:13px;line-height:1.7;margin:0">
              Once verified, you can log in at <a href="https://school-manager-gh.web.app" style="color:#0B4A82">school-manager-gh.web.app</a> 
              and start managing your school — add teachers, enrol students, configure classes and more.
            </p>
          </div>
          <div style="background:#F8FAFC;padding:16px 32px;border-radius:0 0 16px 16px;border:1px solid #DBEAFE;border-top:none;text-align:center">
            <p style="color:#94A3B8;font-size:12px;margin:0">School Manager GH &bull; Powering Ghanaian Schools 🇬🇭</p>
          </div>
        </div>
      `;

      const text = [
        `Hi ${safeAdminName},`,
        "",
        `Your school workspace "${safeSchoolName}" has been created on School Manager GH.`,
        "",
        "NEXT STEP: Verify your email",
        emailVerificationLink
          ? `Click this link to activate your account: ${emailVerificationLink}`
          : "Please log in and request a new verification email.",
        "",
        "Once verified, log in at: https://school-manager-gh.web.app",
        "",
        "School Manager GH",
      ].join("\n");

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [safeEmail],
          subject: `Welcome to School Manager GH — Verify your account, ${safeAdminName}`,
          text,
          html,
        }),
      });
      const resBody = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(resBody?.message || `Resend failed with ${response.status}`);
      }
      return { sent: true, provider: "resend", id: resBody?.id || null };
    };

    // Fire notifications concurrently but don't let them block the response
    const [whatsappResult, ownerEmailResult, welcomeEmailResult] = await Promise.allSettled([
      sendTrialWhatsapp(),
      sendTrialOwnerEmail(),
      sendTrialWelcomeEmail(),
    ]);

    const normalizeResult = (r) =>
      r.status === "fulfilled"
        ? r.value
        : { sent: false, error: r.reason?.message || String(r.reason) };

    const notifications = {
      whatsapp: normalizeResult(whatsappResult),
      ownerEmail: normalizeResult(ownerEmailResult),
      welcomeEmail: normalizeResult(welcomeEmailResult),
    };

    await writeTrialNotificationAudit({
      schoolId,
      adminEmail: safeEmail,
      schoolName: safeSchoolName,
      notifications,
    });

    console.info("[StartTrial] notifications", notifications);

    const failedNotifications = Object.entries(notifications)
      .filter(([, result]) => !result?.sent)
      .map(([channel, result]) => `${channel}: ${summarizeNotificationFailure(result)}`);

    res.json({
      success: true,
      schoolId: schoolId,
      adminUid: userRecord.uid,
      logoUrl: finalLogoUrl,
      message: failedNotifications.length
        ? `School trial started, but some notifications were not delivered: ${failedNotifications.join("; ")}`
        : "School trial started successfully",
      notifications,
    });
  } catch (error) {
    console.error("Error starting trial:", error);
    if (isTransientFirebaseAdminNetworkError(error)) {
      return res.status(503).json({
        error:
          "Firebase Auth is unreachable from the backend right now. Check your internet/DNS connection and try again.",
        code: "FIREBASE_AUTH_UNREACHABLE",
      });
    }
    res.status(500).json({ error: error.message || "Failed to start school setup" });
  }
});


// ─── Paystack Integration Endpoints ──────────────────────────────────────────
/**
 * POST /api/schools/setup-payment
 * Configures Paystack subaccount for a school.
 */
app.post("/api/schools/setup-payment", authMiddleware, async (req, res) => {
  const { schoolId, method, bankName, accountNumber, accountName, momoNetwork, momoNumber, momoName } = req.body;

  if (!schoolId) return res.status(400).json({ error: "School ID is required." });

  try {
    const { uid } = req.user;
    const userDoc = await admin.firestore().collection("users").doc(uid).get();
    const userData = userDoc.data();
    
    if (userData?.role !== "school_admin" || userData?.schoolId !== schoolId) {
      if (userData?.role !== "super_admin") {
        return res.status(403).json({ error: "Unauthorized to configure payment for this school." });
      }
    }

    const paystackSecret = process.env.PAYSTACK_SECRET_KEY;
    if (!paystackSecret) {
      return res.status(500).json({ error: "Paystack is not configured on the server." });
    }
    if (!isLivePaystackSecret()) {
      return res.status(500).json({ error: "Server Paystack configuration is still in test mode." });
    }

    const business_name = method === "Bank" ? accountName : momoName;
    const settlement_bank = method === "Bank" ? bankName : momoNetwork;
    const account_number = method === "Bank" ? accountNumber : momoNumber;

    console.log("[Paystack Setup] Final Payload:", { method, business_name, settlement_bank, account_number });

    if (!business_name || !settlement_bank || !account_number) {
      return res.status(400).json({ error: `Missing required ${method} details.` });
    }

    const response = await fetch("https://api.paystack.co/subaccount", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paystackSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        business_name,
        settlement_bank,
        account_number,
        percentage_charge: 0,
      }),
    });

    const data = await response.json();

    if (!data.status) {
      return res.status(400).json({ error: data.message });
    }

    const subaccountCode = data.data.subaccount_code;

    // Explicit mapping to ensure no fields are lost
    const paymentSettings = {
      method,
      subaccountCode,
      status: "active",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      // Bank specific fields
      bankName: method === "Bank" ? (bankName || settlement_bank) : null,
      accountNumber: method === "Bank" ? (accountNumber || account_number) : null,
      accountName: method === "Bank" ? (accountName || business_name) : null,
      // MoMo specific fields
      momoNetwork: method === "MoMo" ? (momoNetwork || settlement_bank) : null,
      momoNumber: method === "MoMo" ? (momoNumber || account_number) : null,
      momoName: method === "MoMo" ? (momoName || business_name) : null,
    };

    await admin.firestore().collection("schools").doc(schoolId).update({
      paymentSettings,
    });

    return res.json({ success: true, subaccountCode });
  } catch (err) {
    console.error("[Setup Payment] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

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

// ─── WhatsApp Broadcast Endpoints ────────────────────────────────────────────
let whatsappService = null;

const loadWhatsAppService = async () => {
  if (!whatsappService) {
    try {
      whatsappService = await import("./whatsappService.js");
    } catch (err) {
      console.error("[WhatsApp] Failed to load whatsappService:", err.message);
    }
  }
  return whatsappService;
};

/**
 * GET /api/whatsapp/status
 * Returns current WhatsApp connection status and QR code if pending.
 */
app.get("/api/whatsapp/status", authMiddleware, async (req, res) => {
  return res.json({
    status: "centralized",
    qr: null,
    centralNumber: "+233201008784",
    message:
      "School-owned WhatsApp QR pairing is temporarily disabled. Notifications use the centralized School Manager GH WhatsApp service.",
  });
});

/**
 * POST /api/whatsapp/init
 * Initializes the WhatsApp client and starts QR generation.
 */
app.post("/api/whatsapp/init", authMiddleware, async (req, res) => {
  return res.status(410).json({
    error:
      "WhatsApp QR pairing is disabled for Version 1. Configure Notification Settings instead.",
  });
});

/**
 * POST /api/whatsapp/pairing-code
 * Requests a pairing code for a specific phone number.
 */
app.post("/api/whatsapp/pairing-code", authMiddleware, async (req, res) => {
  return res.status(410).json({
    error:
      "Pairing codes are disabled for Version 1 centralized notifications.",
  });
});

/**
 * POST /api/whatsapp/disconnect
 * Disconnects and destroys the WhatsApp session.
 */
app.post("/api/whatsapp/disconnect", authMiddleware, async (req, res) => {
  return res.json({
    success: true,
    message: "No school-owned WhatsApp session is active in Version 1.",
  });
});

/**
 * POST /api/whatsapp/clear-session
 * Disconnects and deletes the local session folder.
 */
app.post("/api/whatsapp/clear-session", authMiddleware, async (req, res) => {
  return res.json({
    success: true,
    message: "School-owned WhatsApp sessions are disabled in Version 1.",
  });
});

/**
 * POST /api/whatsapp/broadcast
 * Sends a WhatsApp message to multiple parents.
 * Body: { message: string, phones: string[] }
 */
const WHATSAPP_BROADCAST_LIMIT = 100;
const WHATSAPP_DAILY_LIMIT = 100;

const normalizeBroadcastPhone = (phone) => {
  let digits = String(phone || "").replace(/[^\d]/g, "");
  if (digits.startsWith("0") && digits.length === 10) digits = `233${digits.slice(1)}`;
  if (digits.length === 9) digits = `233${digits}`;
  return digits;
};

app.post("/api/whatsapp/broadcast", authMiddleware, async (req, res) => {
  return res.status(410).json({
    error:
      "WhatsApp broadcasting is temporarily disabled for production stability. Payment and invoice notifications use the centralized School Manager GH WhatsApp service.",
  });

  /*
  // Validate caller is a school_admin
  const { uid } = req.user;
  try {
    const callerDoc = await admin.firestore().collection("users").doc(uid).get();
    const role = callerDoc.exists ? (callerDoc.data().role || "") : "";
    const schoolId = callerDoc.exists ? (callerDoc.data().schoolId || null) : null;
    
    if (role !== "school_admin") {
      return res.status(403).json({ error: "Only school admins can send WhatsApp broadcasts." });
    }

    const { message, phones } = req.body;
    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "Message is required." });
    }
    if (!Array.isArray(phones) || phones.length === 0) {
      return res.status(400).json({ error: "At least one phone number is required." });
    }
    if (!schoolId) {
      return res.status(400).json({ error: "Your admin profile is missing schoolId." });
    }
    if (phones.length > WHATSAPP_BROADCAST_LIMIT) {
      return res.status(400).json({ error: `Maximum ${WHATSAPP_BROADCAST_LIMIT} recipients per broadcast.` });
    }

    const svc = await loadWhatsAppService();
    if (!svc) return res.status(503).json({ error: "WhatsApp service unavailable. Ensure whatsapp-web.js is installed." });

    const { status } = svc.getWhatsAppStatus();
    if (status !== "ready") {
      return res.status(400).json({ error: `WhatsApp is not connected. Current status: ${status}` });
    }

    const uniquePhones = [...new Set(
      phones
        .map(normalizeBroadcastPhone)
        .filter((p) => p.length >= 10)
    )];

    if (uniquePhones.length === 0) {
      return res.status(400).json({ error: "No valid parent phone numbers were selected." });
    }

    const db = admin.firestore();
    const optOutRefs = uniquePhones.map((phone) =>
      db.collection("schools").doc(schoolId).collection("whatsapp_opt_outs").doc(phone)
    );
    const optOutDocs = optOutRefs.length ? await db.getAll(...optOutRefs) : [];
    const optedOut = new Set(optOutDocs.filter((doc) => doc.exists).map((doc) => doc.id));
    const cleanPhones = uniquePhones.filter((phone) => !optedOut.has(phone));

    if (cleanPhones.length === 0) {
      return res.status(400).json({ error: "All selected recipients have opted out or have invalid phone numbers." });
    }
    if (cleanPhones.length > WHATSAPP_BROADCAST_LIMIT) {
      return res.status(400).json({ error: `Maximum ${WHATSAPP_BROADCAST_LIMIT} valid recipients per broadcast.` });
    }

    const todayKey = new Date().toISOString().slice(0, 10);
    const quotaRef = db.collection("whatsapp_daily_quotas").doc(`${schoolId}_${todayKey}`);
    const quotaResult = await db.runTransaction(async (tx) => {
      const quotaSnap = await tx.get(quotaRef);
      const used = quotaSnap.exists ? Number(quotaSnap.data().attempted || 0) : 0;
      const remaining = Math.max(0, WHATSAPP_DAILY_LIMIT - used);
      if (cleanPhones.length > remaining) {
        return { allowed: false, used, remaining };
      }
      tx.set(
        quotaRef,
        {
          schoolId,
          date: todayKey,
          attempted: admin.firestore.FieldValue.increment(cleanPhones.length),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      return { allowed: true, used: used + cleanPhones.length, remaining: remaining - cleanPhones.length };
    });

    if (!quotaResult.allowed) {
      return res.status(429).json({
        error: `Daily WhatsApp safe-send limit reached. Remaining today: ${quotaResult.remaining}. Try a smaller class group or send tomorrow.`,
      });
    }

    // 1. Create Background Job in Firestore
    const jobId = `broadcast_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const jobRef = admin.firestore().collection("whatsapp_jobs").doc(jobId);
    
    await jobRef.set({
      status: "processing",
      total: cleanPhones.length,
      sent: 0,
      failed: 0,
      skippedOptOut: optedOut.size,
      safeLimit: WHATSAPP_DAILY_LIMIT,
      createdBy: uid,
      schoolId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      results: []
    });

    // 2. Run broadcast asynchronously in the background
    (async () => {
      try {
        await svc.broadcastWhatsAppMessages(
          cleanPhones,
          message.trim(),
          async (progress) => {
            if (progress.type === "pause") {
              await jobRef.update({ 
                status: "paused_anti_ban", 
                resumeAt: Date.now() + progress.duration 
              });
              return;
            }
            
            let finalSuccess = progress.success;
            let finalError = progress.error || null;
            let usedFallback = false;

            // ── SMS FALLBACK LOGIC ──
            if (!progress.success && schoolId) {
              const schoolRef = admin.firestore().collection("schools").doc(schoolId);
              try {
                await admin.firestore().runTransaction(async (t) => {
                  const doc = await t.get(schoolRef);
                  if (!doc.exists) return;
                  const balance = doc.data().smsWallet?.balance || 0;
                  
                  if (balance > 0) {
                    const arkeselKey = process.env.ARKESEL_API_KEY;
                    if (arkeselKey) {
                      const smsRes = await fetch("https://sms.arkesel.com/api/v2/sms/send", {
                        method: "POST",
                        headers: { "api-key": arkeselKey, "Content-Type": "application/json" },
                        body: JSON.stringify({
                          sender: "SCHOOL", // Note: Arkesel requires an approved sender ID
                          message: progress.message || message.trim(),
                          recipients: [progress.phone]
                        })
                      });
                      const smsData = await smsRes.json();
                      if (smsData.status === "success") {
                        finalSuccess = true;
                        finalError = null;
                        usedFallback = true;
                        t.update(schoolRef, { "smsWallet.balance": balance - 1 });
                      } else {
                        finalError = `WhatsApp failed & SMS fallback failed: ${smsData.message || 'Unknown Arkesel error'}`;
                      }
                    } else {
                      finalError = `WhatsApp failed & No Arkesel API Key configured for fallback.`;
                    }
                  } else {
                    finalError = `WhatsApp failed & Out of SMS credits.`;
                  }
                });
              } catch (fallbackErr) {
                console.error("[SMS Fallback Transaction Error]:", fallbackErr);
                finalError = `WhatsApp failed & SMS error: ${fallbackErr.message}`;
              }
            }
            // ──────────────────────────
            
            // Only update Firestore every 2 messages or if it's the last few to save writes
            const isSignificant = progress.count % 2 === 0 || progress.count === cleanPhones.length;
            
            const updateData = {
              status: "processing",
              results: admin.firestore.FieldValue.arrayUnion({
                phone: progress.phone,
                success: finalSuccess,
                usedFallback: usedFallback,
                error: finalError
              })
            };
            
            if (finalSuccess) {
              updateData.sent = admin.firestore.FieldValue.increment(1);
            } else {
              updateData.failed = admin.firestore.FieldValue.increment(1);
            }
            
            await jobRef.update(updateData);
          }
        );
        
        await jobRef.update({ 
          status: "completed", 
          completedAt: admin.firestore.FieldValue.serverTimestamp() 
        });
      } catch (bgErr) {
        console.error("[WhatsApp Background Job Error]:", bgErr.message);
        await jobRef.update({ status: "error", error: bgErr.message });
      }
    })();

    // 3. Return Job ID immediately
    return res.json({ success: true, jobId });
  } catch (err) {
    console.error("[WhatsApp Broadcast] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
  */
});

/**
 * Get WhatsApp Broadcast Job Status
 * GET /api/whatsapp/job/:id
 */
app.get("/api/whatsapp/job/:id", authMiddleware, async (req, res) => {
  try {
    const { uid } = req.user;
    const callerDoc = await admin.firestore().collection("users").doc(uid).get();
    const callerData = callerDoc.exists ? callerDoc.data() || {} : {};
    const role = callerData.role || req.user.role || "";
    const callerSchoolId = callerData.schoolId || req.user.schoolId || null;

    if (role !== "school_admin" && role !== "super_admin") {
      return res.status(403).json({ error: "Forbidden." });
    }
    const docRef = await admin.firestore().collection("whatsapp_jobs").doc(req.params.id).get();
    if (!docRef.exists) {
      return res.status(404).json({ error: "Job not found." });
    }
    const job = docRef.data() || {};
    if (
      role === "school_admin" &&
      job.createdBy !== uid &&
      (!callerSchoolId || job.schoolId !== callerSchoolId)
    ) {
      return res.status(403).json({ error: "Forbidden." });
    }
    return res.json({ success: true, job });
  } catch (err) {
    console.error("[WhatsApp Job] Error:", err.message);
    return res.status(500).json({ error: "Failed to fetch job status." });
  }
});

/**
 * Top Up SMS Wallet
 * POST /api/sms/topup
 */
app.post("/api/sms/topup", authMiddleware, async (req, res) => {
  try {
    const { reference, amount, credits, schoolId } = req.body;
    const { role, uid } = req.user;
    
    if (role !== "school_admin" && role !== "super_admin") {
      return res.status(403).json({ error: "Forbidden. Only admins can top up SMS." });
    }
    if (!reference || !amount || !credits || !schoolId) {
      return res.status(400).json({ error: "Missing required fields." });
    }
    
    // Verify with Paystack
    const paystackSecret = process.env.PAYSTACK_SECRET_KEY;
    if (!paystackSecret) {
      return res.status(500).json({ error: "Server missing Paystack configuration." });
    }
    if (!isLivePaystackSecret()) {
      return res.status(500).json({ error: "Server Paystack configuration is still in test mode." });
    }
    
    const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${paystackSecret}` }
    });
    
    const verifyData = await verifyRes.json();
    if (!verifyData.status || verifyData.data.status !== "success") {
      return res.status(400).json({ error: "Payment verification failed." });
    }
    
    // Verify amount matches (Paystack amount is in pesewas)
    const expectedPesewas = amount * 100;
    if (verifyData.data.amount < expectedPesewas) {
       return res.status(400).json({ error: "Payment amount mismatch." });
    }
    
    // Update Firestore
    const schoolRef = admin.firestore().collection("schools").doc(schoolId);
    
    await admin.firestore().runTransaction(async (t) => {
       const doc = await t.get(schoolRef);
       if (!doc.exists) throw new Error("School not found");
       
       const currentBalance = doc.data().smsWallet?.balance || 0;
       const newBalance = currentBalance + credits;
       
       t.update(schoolRef, {
         "smsWallet.balance": newBalance,
         "smsWallet.lastRechargeAt": admin.firestore.FieldValue.serverTimestamp()
       });
       
       // Log the topup
       const logRef = admin.firestore().collection("sms_recharges").doc();
       t.set(logRef, {
         schoolId,
         amount,
         creditsAdded: credits,
         reference,
         rechargedBy: uid,
         createdAt: admin.firestore.FieldValue.serverTimestamp()
       });
    });
    
    return res.json({ success: true, message: `Successfully added ${credits} SMS credits.` });
  } catch (err) {
    console.error("[SMS TopUp Error]:", err.message);
    return res.status(500).json({ error: err.message || "Top-up failed." });
  }
});

/**
 * Initialize a parent fee payment with Paystack on the server so the
 * configured school subaccount is validated before checkout opens.
 * POST /api/payments/initialize-fee-payment
 */
app.post("/api/payments/initialize-fee-payment", authMiddleware, async (req, res) => {
  try {
    const {
      studentId,
      schoolId,
      amount,
      email,
      guardianName,
      studentName,
      feeId,
      feeName,
      academicYear,
      term,
    } = req.body || {};

    const amountNumber = Number(amount);
    if (!studentId || !schoolId || !Number.isFinite(amountNumber) || amountNumber <= 0) {
      return res.status(400).json({ error: "Missing or invalid payment details." });
    }

    if (!PAYSTACK_SECRET_KEY) {
      return res.status(500).json({ error: "Server missing Paystack configuration." });
    }
    if (!isLivePaystackSecret()) {
      return res.status(500).json({ error: "Server Paystack configuration is still in test mode." });
    }

    const db = admin.firestore();
    const [schoolSnap, studentSnap, userSnap] = await Promise.all([
      db.collection("schools").doc(String(schoolId)).get(),
      db.collection("students").doc(String(studentId)).get(),
      db.collection("users").doc(req.user.uid).get(),
    ]);

    if (!schoolSnap.exists) {
      return res.status(404).json({ error: "School not found." });
    }
    if (!studentSnap.exists) {
      return res.status(404).json({ error: "Student not found." });
    }

    const schoolData = schoolSnap.data() || {};
    const studentData = studentSnap.data() || {};
    const userData = userSnap.exists ? userSnap.data() || {} : {};

    if (studentData.schoolId !== schoolId) {
      return res.status(400).json({ error: "Student does not belong to this school." });
    }

    const role = userData.role || req.user.role;
    if (role === "parent") {
      const parentPhone = String(userData.phoneNumber || req.user.phoneNumber || req.user.uid || "");
      const normalized = (value) => String(value || "").replace(/\D/g, "");
      const studentContactPhones = [
        studentData.fatherPhone,
        studentData.motherPhone,
        studentData.guardianPhone,
      ]
        .map(normalized)
        .filter(Boolean);
      const normalizedParentPhone = normalized(parentPhone);
      const phoneMatches =
        normalizedParentPhone &&
        studentContactPhones.some(
          (studentPhone) =>
            normalizedParentPhone === studentPhone ||
            normalizedParentPhone.endsWith(studentPhone) ||
            studentPhone.endsWith(normalizedParentPhone),
        );
      const linkedStudentIds = [
        ...(Array.isArray(userData.linkedStudentIds) ? userData.linkedStudentIds : []),
        ...(Array.isArray(userData.studentIds) ? userData.studentIds : []),
        ...(Array.isArray(req.user.studentIds) ? req.user.studentIds : []),
      ];

      if (!phoneMatches && !linkedStudentIds.includes(studentId)) {
        return res.status(403).json({ error: "You are not authorized to pay for this student." });
      }
    } else if (role !== "school_admin" && role !== "super_admin") {
      return res.status(403).json({ error: "Forbidden." });
    }

    const paymentSettings = schoolData.paymentSettings || {};
    const subaccountCode = String(paymentSettings.subaccountCode || "").trim();
    if (paymentSettings.status !== "active" || !subaccountCode) {
      return res.status(400).json({ error: "The school has not activated an online payout account yet." });
    }

    const reference = `FEES-${String(studentId).slice(0, 5)}-${Date.now()}`;
    const payload = {
      email: email || `${String(studentId).slice(0, 8)}@schoolmanagergh.com`,
      amount: Math.round(amountNumber * 100),
      currency: "GHS",
      reference,
      subaccount: subaccountCode,
      metadata: {
        studentId,
        studentName: studentName || studentData.name || "",
        guardianName: guardianName || studentData.guardianName || "",
        schoolId,
        feeId: feeId || "general",
        feeName: feeName || "School Fees",
        academicYear,
        term,
      },
    };

    const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const paystackData = await paystackRes.json();

    if (!paystackRes.ok || !paystackData.status) {
      console.error("[Fee Payment Initialize] Paystack error:", paystackData);
      const paystackMessage = String(paystackData.message || "");
      if (/invalid subaccount/i.test(paystackMessage)) {
        await db.collection("schools").doc(String(schoolId)).update({
          "paymentSettings.status": "error",
          "paymentSettings.lastError": "Invalid Paystack subaccount. Recreate the payout account in Paystack live mode.",
          "paymentSettings.lastErrorAt": admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      return res.status(400).json({
        error: /invalid subaccount/i.test(paystackMessage)
          ? "Invalid school payout account. The admin must re-activate Online Payments with a live Paystack subaccount."
          : paystackData.message || "Could not initialize payment.",
      });
    }

    return res.json({
      success: true,
      reference,
      accessCode: paystackData.data.access_code,
      authorizationUrl: paystackData.data.authorization_url,
      paystackMode: "live",
    });
  } catch (err) {
    console.error("[Fee Payment Initialize Error]:", err.message);
    return res.status(500).json({ error: "Could not initialize payment." });
  }
});

/**
 * Send Payment Invoice via WhatsApp
 * POST /api/payments/send-invoice
 */

const SCHOOL_MANAGER_GH_WHATSAPP_NUMBER = "233201008784";

const writeNotificationLog = async ({ schoolId, recipient, type, status, errorMessage = "", metadata = {} }) => {
  try {
    await admin.firestore().collection("notification_logs").add({
      schoolId: schoolId || null,
      recipient: recipient || "",
      type,
      status,
      errorMessage,
      metadata,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: Date.now(),
    });
  } catch (err) {
    console.warn("[NotificationLog] Failed:", err.message);
  }
};

const writeAdminNotification = async (schoolId, message) => {
  if (!schoolId) return;
  try {
    const id = `${schoolId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await admin.firestore().collection("admin_notifications").doc(id).set({
      id,
      schoolId,
      message,
      createdAt: Date.now(),
      isRead: false,
      type: "system",
    });
  } catch (err) {
    console.warn("[AdminNotification] Failed:", err.message);
  }
};

const enqueueWhatsAppRetry = async (payload) => {
  try {
    await admin.firestore().collection("whatsapp_retry_queue").add({
      ...payload,
      status: "pending",
      attempts: 0,
      maxAttempts: 3,
      nextAttemptAt: Date.now() + 10 * 60 * 1000,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.warn("[WhatsAppRetryQueue] Failed:", err.message);
  }
};

const resolvePaymentNotificationRecipients = (studentData, body) => {
  const candidates = [
    body.fatherPhone,
    studentData?.fatherPhone,
    studentData?.fatherWhatsApp,
    body.motherPhone,
    studentData?.motherPhone,
    studentData?.motherWhatsApp,
    body.guardianPhone,
    studentData?.guardianPhone,
    studentData?.guardianWhatsApp,
  ];
  return [...new Set(candidates.map(normalizeBroadcastPhone).filter((phone) => /^233\d{9}$/.test(phone)))];
};

const resolveInvoicePdfBase64 = async ({ base64Pdf, invoiceStoragePath, invoiceDownloadUrl }) => {
  if (typeof base64Pdf === "string" && base64Pdf.trim()) {
    const cleanBase64 = base64Pdf.includes("base64,")
      ? base64Pdf.split("base64,")[1]
      : base64Pdf;
    return {
      cleanBase64,
      source: "base64",
    };
  }

  const storagePath = String(invoiceStoragePath || "").trim();
  if (storagePath) {
    const bucket = admin.storage().bucket();
    const [buffer] = await bucket.file(storagePath).download();
    return {
      cleanBase64: buffer.toString("base64"),
      source: "storage",
    };
  }

  const downloadUrl = String(invoiceDownloadUrl || "").trim();
  if (downloadUrl) {
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(`Invoice PDF download failed with status ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return {
      cleanBase64: Buffer.from(arrayBuffer).toString("base64"),
      source: "url",
    };
  }

  throw new Error("Student ID and PDF data are required.");
};

const shouldProcessInvoiceNotificationsInline = () => {
  const setting = String(process.env.INVOICE_NOTIFICATIONS_INLINE || "")
    .trim()
    .toLowerCase();
  return ["1", "true", "yes", "on"].includes(setting);
};

const INVOICE_NOTIFICATION_CONCURRENCY = Math.max(
  1,
  Math.min(5, Math.floor(parsePositiveNumber(process.env.INVOICE_NOTIFICATION_CONCURRENCY, 1))),
);
const invoiceNotificationQueue = [];
let activeInvoiceNotificationJobs = 0;

const processPaymentInvoiceNotification = async ({
  svc,
  resolvedSchoolId,
  settings,
  schoolData,
  studentData,
  body,
  cleanBase64,
  payloadSize,
}) => {
  const {
    amount,
    reference,
    studentId,
    studentName,
    feeName,
    adminPhone,
  } = body || {};
  const notificationSettings = settings.notificationSettings || {};
  const schoolName = settings.schoolName || schoolData.name || "School Manager GH";
  const effectiveStudentName = studentName || studentData.name || "Student";
  const caption = `School Manager GH Notification\n\n${schoolName}\n\nPayment received successfully for:\nStudent: ${effectiveStudentName}\nAmount: GHS ${amount}\n\nInvoice attached.\n\nSent via School Manager GH WhatsApp Service\n+233201008784`;
  const filename = `Invoice_${reference}.pdf`;
  const mimetype = "application/pdf";
  const results = [];

  if (notificationSettings.enableInvoiceNotifications !== false) {
    const recipients = resolvePaymentNotificationRecipients(studentData, body);
    for (const recipient of recipients) {
      const result = await svc.sendWhatsAppMedia(recipient, caption, cleanBase64, filename, mimetype);
      results.push({ recipient, ...result });
      await writeNotificationLog({
        schoolId: resolvedSchoolId,
        recipient,
        type: "payment_invoice_parent",
        status: result.success ? "sent" : "failed",
        errorMessage: result.error || "",
        metadata: { reference, studentId, centralNumber: SCHOOL_MANAGER_GH_WHATSAPP_NUMBER, payloadSize },
      });
      if (!result.success) {
        await enqueueWhatsAppRetry({
          schoolId: resolvedSchoolId,
          recipient,
          type: "payment_invoice_parent",
          payload: { caption, cleanBase64, filename, mimetype },
          lastError: result.error || "Send failed",
        });
      }
    }
  }

  const adminRecipient = normalizeBroadcastPhone(
    notificationSettings.adminWhatsAppNumber || adminPhone || schoolData.phone || settings.phone || "",
  );
  if (notificationSettings.enablePaymentAlerts !== false && /^233\d{9}$/.test(adminRecipient)) {
    const adminMessage = `School Manager GH Notification\n\n${schoolName}\n\nPayment received successfully for:\nStudent: ${effectiveStudentName}\nAmount: GHS ${amount}\nFee: ${feeName || "School Fees"}\nReference: ${reference}\n\nSent via School Manager GH WhatsApp Service\n+233201008784`;
    const adminResult = await svc.sendWhatsAppMessage(adminRecipient, adminMessage);
    results.push({ recipient: adminRecipient, ...adminResult });
    await writeNotificationLog({
      schoolId: resolvedSchoolId,
      recipient: adminRecipient,
      type: "payment_alert_admin",
      status: adminResult.success ? "sent" : "failed",
      errorMessage: adminResult.error || "",
      metadata: { reference, studentId, centralNumber: SCHOOL_MANAGER_GH_WHATSAPP_NUMBER },
    });
  }

  if (results.some((result) => !result.success)) {
    await writeAdminNotification(
      resolvedSchoolId,
      `Some WhatsApp payment notifications failed for ${effectiveStudentName}. They were added to the retry queue.`,
    );
  }

  return results;
};

const schedulePaymentInvoiceNotification = (job) => {
  invoiceNotificationQueue.push(job);
  drainPaymentInvoiceNotificationQueue();
};

const drainPaymentInvoiceNotificationQueue = () => {
  while (
    activeInvoiceNotificationJobs < INVOICE_NOTIFICATION_CONCURRENCY &&
    invoiceNotificationQueue.length
  ) {
    const job = invoiceNotificationQueue.shift();
    activeInvoiceNotificationJobs += 1;
    runPaymentInvoiceNotificationJob(job).finally(() => {
      activeInvoiceNotificationJobs = Math.max(0, activeInvoiceNotificationJobs - 1);
      drainPaymentInvoiceNotificationQueue();
    });
  }
};

const runPaymentInvoiceNotificationJob = async (job) => {
  const run = async () => {
    try {
      const results = await processPaymentInvoiceNotification(job);
      console.log(
        `[Invoice] Background notification completed for ${job.body?.reference || "unknown"} (${results.length} sends).`,
      );
    } catch (error) {
      console.error("[Invoice] Background notification failed:", error?.message || error);
      await writeNotificationLog({
        schoolId: job.resolvedSchoolId,
        recipient: "multiple",
        type: "payment_invoice",
        status: "failed",
        errorMessage: error?.message || "Background notification failed.",
        metadata: {
          reference: job.body?.reference,
          studentId: job.body?.studentId,
          background: true,
        },
      });
      await enqueueWhatsAppRetry({
        schoolId: job.resolvedSchoolId,
        type: "payment_invoice",
        payload: { ...job.body, schoolId: job.resolvedSchoolId },
        lastError: error?.message || "Background notification failed.",
      });
    }
  };

  if (typeof setImmediate === "function") {
    await new Promise((resolve) => setImmediate(resolve));
    await run();
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
  await run();
};

// Send Payment Invoice via WhatsApp
// POST /api/payments/send-invoice
app.post("/api/payments/send-invoice", authMiddleware, async (req, res) => {
  try {
    {
      const {
        studentId,
        schoolId,
        amount,
        reference,
        base64Pdf,
        invoiceStoragePath,
        invoiceDownloadUrl,
        studentName,
        feeName,
        adminPhone,
      } = req.body || {};
      if (!studentId || (!base64Pdf && !invoiceStoragePath && !invoiceDownloadUrl)) {
        return res.status(400).json({ error: "Student ID and PDF data are required." });
      }

      const db = admin.firestore();
      const studentSnap = await db.collection("students").doc(String(studentId)).get();
      const studentData = studentSnap.exists ? studentSnap.data() || {} : {};
      const resolvedSchoolId = String(schoolId || studentData.schoolId || "").trim();
      const [settingsSnap, schoolSnap] = await Promise.all([
        resolvedSchoolId ? db.collection("settings").doc(resolvedSchoolId).get() : Promise.resolve(null),
        resolvedSchoolId ? db.collection("schools").doc(resolvedSchoolId).get() : Promise.resolve(null),
      ]);
      const settings = settingsSnap?.exists ? settingsSnap.data() || {} : {};
      const schoolData = schoolSnap?.exists ? schoolSnap.data() || {} : {};
      const notificationSettings = settings.notificationSettings || {};

      if (
        notificationSettings.enableWhatsAppNotifications === false ||
        (notificationSettings.enablePaymentAlerts === false &&
          notificationSettings.enableInvoiceNotifications === false)
      ) {
        await writeNotificationLog({
          schoolId: resolvedSchoolId,
          recipient: "",
          type: "payment_invoice",
          status: "skipped",
          metadata: { reason: "Notification settings disabled", reference, studentId },
        });
        return res.json({ success: true, skipped: true });
      }

      const invoicePdf = await resolveInvoicePdfBase64({
        base64Pdf,
        invoiceStoragePath,
        invoiceDownloadUrl,
      });
      const cleanBase64 = invoicePdf.cleanBase64;
      const payloadSize = cleanBase64.length;
      if (payloadSize < 1000) {
        return res.status(400).json({ error: "Invalid PDF payload (too small)." });
      }

      const svc = await loadWhatsAppService();
      const statusInfo = svc?.getWhatsAppStatus ? svc.getWhatsAppStatus() : { status: "unavailable" };
      if (!svc || statusInfo.status !== "ready") {
        const errorMessage = `Central WhatsApp session is not ready (${statusInfo.status}).`;
        await writeNotificationLog({
          schoolId: resolvedSchoolId,
          recipient: "multiple",
          type: "payment_invoice",
          status: "queued",
          errorMessage,
          metadata: { reference, studentId, centralNumber: SCHOOL_MANAGER_GH_WHATSAPP_NUMBER },
        });
        await writeAdminNotification(
          resolvedSchoolId,
          `WhatsApp notification queued for ${studentName || studentData.name || "student"} because the central sender is not ready.`,
        );
        await enqueueWhatsAppRetry({
          schoolId: resolvedSchoolId,
          type: "payment_invoice",
          payload: { ...req.body, schoolId: resolvedSchoolId },
          lastError: errorMessage,
        });
        return res.json({ success: true, queued: true, whatsappStatus: statusInfo.status });
      }

      const invoiceJob = {
        svc,
        resolvedSchoolId,
        settings,
        schoolData,
        studentData,
        body: req.body,
        cleanBase64,
        payloadSize,
      };

      if (!shouldProcessInvoiceNotificationsInline()) {
        await writeNotificationLog({
          schoolId: resolvedSchoolId,
          recipient: "multiple",
          type: "payment_invoice",
          status: "queued",
          metadata: {
            reference,
            studentId,
            centralNumber: SCHOOL_MANAGER_GH_WHATSAPP_NUMBER,
            background: true,
            payloadSize,
            invoiceSource: invoicePdf.source,
          },
        });
        schedulePaymentInvoiceNotification(invoiceJob);
        return res.json({ success: true, queued: true, background: true, size: payloadSize });
      }

      const results = await processPaymentInvoiceNotification(invoiceJob);
      return res.json({ success: true, size: payloadSize, results });
    }

    const { studentId, amount, reference, base64Pdf, studentName, guardianPhone, feeName, adminPhone } = req.body;
    console.log(`[Invoice] Received request payload for: ${studentName}`);
    if (!guardianPhone || !base64Pdf) {
      console.warn('[Invoice] Missing guardianPhone or base64Pdf');
      return res.status(400).json({ error: "Guardian phone and PDF data are required." });
    }
    const svc = await loadWhatsAppService();
    if (!svc) {
      console.error('[Invoice] WhatsApp service unavailable');
      return res.status(503).json({ error: "WhatsApp service unavailable." });
    }

    const readiness = svc.ensureWhatsAppReady
      ? await svc.ensureWhatsAppReady()
      : { ready: false, status: "unavailable" };
    if (!readiness.ready) {
      console.error("[Invoice] WhatsApp is not ready:", readiness);
      return res.status(503).json({
        error:
          readiness.status === "qr_ready"
            ? "WhatsApp is waiting for admin pairing. Open the Admin Panel and connect WhatsApp."
            : `WhatsApp client is not ready (Status: ${readiness.status}). Please reconnect WhatsApp in the Admin Panel.`,
        whatsappStatus: readiness.status,
        lastError: readiness.lastError || null,
      });
    }

    const caption = `Dear Parent, please find attached the receipt for your fee payment of GHS ${amount} for ${studentName}. Reference: ${reference}. Thank you!`;
    const filename = `Invoice_${reference}.pdf`;
    const mimetype = "application/pdf";
    console.log(`[Invoice] Attempting to send WhatsApp invoice to ${guardianPhone} for ${studentName} (Ref: ${reference})`);
    const cleanBase64 = base64Pdf.includes("base64,") ? base64Pdf.split("base64,")[1] : base64Pdf;
    
    // Diagnostic Logging
    const payloadSize = cleanBase64.length;
    const isPDF = cleanBase64.startsWith("JVBERi0"); // %PDF- in base64 usually starts with this
    console.log(`[Invoice] Payload Analysis: Size=${(payloadSize/1024).toFixed(2)}KB, isPDFHeader=${isPDF}`);

    if (payloadSize < 1000) {
      console.error("[Invoice] Payload size too small - possibly corrupted or blank PDF");
      return res.status(400).json({ error: "Invalid PDF payload (too small)." });
    }
    
    // Add a tiny stability delay before sending media to prevent frame detachment
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const result = await svc.sendWhatsAppMedia(guardianPhone, caption, cleanBase64, filename, mimetype);
    console.log(`[Invoice] Parent WhatsApp result for ${studentName}:`, result.success ? "✅ Success" : `❌ Failed: ${result.error}`);
    
    // ANTI-BAN: Add an 8 second delay before sending the admin notification to prevent "burst" flags
    console.log(`[Invoice] Waiting 8 seconds before sending admin notification to simulate human typing...`);
    await new Promise(resolve => setTimeout(resolve, 8000));
    
    // Notify the school admin about the payment
    const adminMessage = `🟢 *New Payment Received*\n\nStudent: *${studentName}*\nAmount: *GHS ${amount}*\nFee: *${feeName || "School Fees"}*\nReference: ${reference}`;
    
    try {
      if (adminPhone) {
        console.log(`[Invoice] Attempting Admin notification to ${adminPhone}`);
        const adminResult = await svc.sendWhatsAppMessage(adminPhone, adminMessage);
        if (!adminResult.success && svc.sendWhatsAppToSelf) {
          console.log(`[Invoice] Admin notify failed, falling back to Send-To-Self`);
          await svc.sendWhatsAppToSelf(adminMessage);
        }
      } else if (svc.sendWhatsAppToSelf) {
        console.log(`[Invoice] No adminPhone provided, using Send-To-Self`);
        await svc.sendWhatsAppToSelf(adminMessage);
      }
    } catch (adminErr) {
      console.warn(`[Invoice] Admin notification secondary failure (non-critical):`, adminErr.message);
    }
    
    if (!result.success) {
      console.error(`[Invoice] Final failure returning to client: ${result.error}`);
      return res.status(500).json({ error: result.error });
    }
    return res.json({ success: true, size: payloadSize });
  } catch (error) {
    console.error("Error sending WhatsApp invoice:", error);
    await writeNotificationLog({
      schoolId: req.body?.schoolId || null,
      recipient: "multiple",
      type: "payment_invoice",
      status: "failed",
      errorMessage: error?.message || "Internal server error.",
      metadata: { reference: req.body?.reference, studentId: req.body?.studentId },
    });
    return res.json({ success: true, queued: true, warning: "Notification failed and was logged for review." });
  }
});

/**
 * Setup Paystack Subaccount for Schools
 * POST /api/schools/setup-payment
 */
app.post("/api/schools/setup-payment", authMiddleware, async (req, res) => {
  try {
    const { role } = req.user;
    if (role !== "school_admin" && role !== "super_admin") {
      return res.status(403).json({ error: "Forbidden. Only admins can setup payments." });
    }

    const { schoolId, businessName, bankCode, accountNumber, contactPhone, method, bankName, accountName, momoNetwork, momoNumber, momoName } = req.body;

    if (!schoolId || !businessName || !bankCode || !accountNumber) {
      return res.status(400).json({ error: "Missing required fields for Paystack subaccount." });
    }

    const paystackSecret = process.env.PAYSTACK_SECRET_KEY;
    if (!paystackSecret) {
      return res.status(500).json({ error: "Server missing Paystack configuration." });
    }
    if (!isLivePaystackSecret()) {
      return res.status(500).json({ error: "Server Paystack configuration is still in test mode." });
    }

    const payload = {
      business_name: businessName,
      settlement_bank: bankCode,
      account_number: accountNumber,
      percentage_charge: 0,
      primary_contact_phone: contactPhone || ""
    };
    
    console.log("[Setup Payment] Sending payload to Paystack:", { ...payload, secret_key: paystackSecret.substring(0, 10) + "..." });

    const psRes = await fetch("https://api.paystack.co/subaccount", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${paystackSecret}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const psData = await psRes.json();
    console.log("[Setup Payment] Paystack response:", JSON.stringify(psData, null, 2));

    if (!psData.status) {
      return res.status(400).json({ error: psData.message || "Failed to create Paystack subaccount" });
    }

    const subaccountCode = psData.data.subaccount_code;
    console.log("[Setup Payment] Successfully extracted subaccount code:", subaccountCode);

    // Save configuration back to the school document
    const paymentSettings = {
      method,
      status: "active",
      subaccountCode,
      ...(method === "Bank" ? { bankName, accountNumber, accountName } : { momoNetwork, momoNumber, momoName })
    };

    await admin.firestore().collection("schools").doc(schoolId).update({
      paymentSettings
    });

    return res.json({ success: true, subaccountCode, paymentSettings });
  } catch (err) {
    console.error("[Setup Payment Error]:", err.message);
    return res.status(500).json({ error: "Internal server error." });
  }
});

// Start server
const PORT = process.env.PORT || 3001;
const shouldAutoInitWhatsApp = () => {
  const setting = String(process.env.WHATSAPP_AUTO_INIT || "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(setting)) return true;
  if (["0", "false", "no", "off"].includes(setting)) return false;
  return false;
};

const server = app.listen(PORT);

server.on("listening", async () => {
  console.log(`Server running on port ${PORT}`);

  // Auto-initialize WhatsApp on startup if possible
  if (!shouldAutoInitWhatsApp()) {
    console.log("[WhatsApp] Auto-initialization skipped. Set WHATSAPP_AUTO_INIT=true to enable startup connection.");
    return;
  }

  try {
    const svc = await loadWhatsAppService();
    if (svc) {
      console.log("[WhatsApp] Auto-initializing client on startup...");
      svc.initWhatsAppClient();
    }
  } catch (err) {
    console.error("[WhatsApp] Failed to auto-initialize on startup:", err.message);
  }
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `Port ${PORT} is already in use. Stop the other server process or run with a different port, for example: $env:PORT=3002; npm run server:dev`,
    );
    process.exit(1);
  }

  console.error("Server failed to start:", err);
  process.exit(1);
});
