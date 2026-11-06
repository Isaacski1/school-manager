import admin from "firebase-admin";

const REQUIRED_ROLE = "school_admin";
const REQUIRED_STATUS = "active";

async function executeMiddleware(req, res, authService, db, next) {
  // Step 1: Extract Bearer token from Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized: Missing Authorization header" });
  }

  const idToken = authHeader.split(" ")[1];
  if (!idToken || idToken.trim() === "") {
    return res.status(401).json({ error: "Unauthorized: Missing token" });
  }

  // Step 2: Verify Firebase ID token
  let decodedToken;
  try {
    decodedToken = await authService.verifyIdToken(idToken, true);
  } catch (error) {
    if (
      error.code === "auth/id-token-expired" ||
      error.code === "auth/id-token-revoked"
    ) {
      return res.status(401).json({
        code: "ID_TOKEN_EXPIRED",
        message: "ID token has expired or been revoked",
      });
    }
    return res.status(403).json({ error: "Forbidden: Invalid token" });
  }

  const uid = decodedToken.uid;

  // Step 3: Load the authenticated user's Firestore record
  let userDoc;
  try {
    const userSnap = await db.collection("users").doc(uid).get();
    userDoc = userSnap;
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }

  if (!userDoc.exists) {
    return res.status(403).json({ error: "Forbidden: User record not found" });
  }

  const userData = userDoc.data();

  // Step 4: Verify account is active
  if (userData.status !== REQUIRED_STATUS) {
    return res.status(403).json({ error: "Forbidden: Account not active" });
  }

  // Step 5: Verify role is exactly school_admin
  if (userData.role !== REQUIRED_ROLE) {
    return res.status(403).json({ error: "Forbidden: Insufficient privileges" });
  }

  // Step 6: Verify a valid, non-empty schoolId from the trusted record
  // The schoolId must be a string from the Firestore user record.
  // null, undefined, numbers, objects, and whitespace-only strings are rejected.
  const rawSchoolId = userData.schoolId;
  if (typeof rawSchoolId !== "string") {
    return res.status(403).json({ error: "Forbidden: No school assigned" });
  }
  const schoolId = rawSchoolId.trim();
  if (!schoolId) {
    return res.status(403).json({ error: "Forbidden: No school assigned" });
  }

  // Step 7: Attach trusted authentication context
  // schoolId comes exclusively from the verified Firestore record,
  // never from the request body, query parameters, or AI model output.
  req.schoolAuthContext = {
    userId: uid,
    schoolId,
    role: userData.role,
  };

  next();
}

export function createSchoolAdminMiddleware({ auth, firestore } = {}) {
  const authService = auth || admin.auth();
  const db = firestore || admin.firestore();

  return async function schoolAdminMiddleware(req, res, next) {
    await executeMiddleware(req, res, authService, db, next);
  };
}

// Default export uses the existing Firebase Admin initialization
// from server/server.js. auth() and firestore() are resolved at
// request time (lazy) so this module can be imported before
// Firebase Admin is initialized without throwing.
export async function schoolAdminMiddleware(req, res, next) {
  const middleware = createSchoolAdminMiddleware({
    auth: admin.auth(),
    firestore: admin.firestore(),
  });
  await middleware(req, res, next);
}

export default schoolAdminMiddleware;
