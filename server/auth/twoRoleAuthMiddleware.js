import admin from "firebase-admin";

const REQUIRED_STATUS = "active";
const ROLE_SCHOOL_ADMIN = "school_admin";
const ROLE_SUPER_ADMIN = "super_admin";

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

  // Step 2: Verify Firebase ID token with revocation checking
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

  // Step 5: Verify exact role (lowercase values only)
  const role = userData.role;
  if (role !== ROLE_SCHOOL_ADMIN && role !== ROLE_SUPER_ADMIN) {
    return res.status(403).json({ error: "Forbidden: Insufficient privileges" });
  }

  // Step 6: Role-specific schoolId validation
  let schoolId = null;
  if (role === ROLE_SCHOOL_ADMIN) {
    // School Admin requires a valid non-empty string schoolId from Firestore
    const rawSchoolId = userData.schoolId;
    if (typeof rawSchoolId !== "string") {
      return res.status(403).json({ error: "Forbidden: No school assigned" });
    }
    schoolId = rawSchoolId.trim();
    if (!schoolId) {
      return res.status(403).json({ error: "Forbidden: No school assigned" });
    }
  }
  // Super Admin: schoolId is always null in context, regardless of stored value

  // Step 7: Attach trusted authentication context
  // schoolId comes exclusively from the verified Firestore record,
  // never from the request body, query parameters, or AI model output.
  req.authContext = {
    userId: uid,
    role,
    schoolId,
  };

  next();
}

export function createTwoRoleAuthMiddleware({ auth, firestore } = {}) {
  const authService = auth || admin.auth();
  const db = firestore || admin.firestore();

  return async function twoRoleAuthMiddleware(req, res, next) {
    await executeMiddleware(req, res, authService, db, next);
  };
}

// Default export uses the existing Firebase Admin initialization
// from server/server.js. auth() and firestore() are resolved at
// request time (lazy) so this module can be imported before
// Firebase Admin is initialized without throwing.
export async function twoRoleAuthMiddleware(req, res, next) {
  const middleware = createTwoRoleAuthMiddleware({
    auth: admin.auth(),
    firestore: admin.firestore(),
  });
  await middleware(req, res, next);
}

export default twoRoleAuthMiddleware;
