import admin from "firebase-admin";

const ROLE_SCHOOL_ADMIN = "school_admin";
const ROLE_SUPER_ADMIN = "super_admin";

async function executeMiddleware(req, res, db, next) {
  // Step 1: Require authenticated context from twoRoleAuthMiddleware
  if (!req.authContext) {
    return res.status(403).json({ error: "Forbidden: Authentication context missing" });
  }

  const { role, schoolId: authSchoolId } = req.authContext;

  // Step 2: Only school_admin and super_admin can receive school scope
  if (role !== ROLE_SCHOOL_ADMIN && role !== ROLE_SUPER_ADMIN) {
    return res.status(403).json({ error: "Forbidden: Role not authorized for school scope" });
  }

  // Step 3: School Admin — always single_school scope from trusted context
  if (role === ROLE_SCHOOL_ADMIN) {
    if (!authSchoolId || typeof authSchoolId !== "string" || !authSchoolId.trim()) {
      return res.status(403).json({ error: "Forbidden: School Admin has no assigned school" });
    }

    req.schoolScope = {
      scope: "single_school",
      schoolId: authSchoolId.trim(),
    };

    next();
    return;
  }

  // Step 4: Super Admin — determine scope
  // Check if request requests a specific school (selected-school mode)
  const requestedSchoolId = extractRequestedSchoolId(req);

  if (requestedSchoolId === null) {
    // No school requested — default to global scope
    req.schoolScope = {
      scope: "global",
      schoolId: null,
    };
    next();
    return;
  }

  // Step 5: Super Admin selected-school — validate against Firestore
  // requestedSchoolId is a non-empty string at this point
  try {
    const schoolSnap = await db.collection("schools").doc(requestedSchoolId).get();

    if (!schoolSnap.exists) {
      return res.status(403).json({ error: "Forbidden: School not found" });
    }

    const schoolData = schoolSnap.data() || {};

    // Validate school status if present
    const schoolStatus = schoolData.status;
    if (schoolStatus && schoolStatus !== "active") {
      return res.status(403).json({ error: "Forbidden: School is not active" });
    }

    // Assign selected-school scope
    req.schoolScope = {
      scope: "selected_school",
      schoolId: requestedSchoolId,
    };

    next();
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
}

// Extract requested schoolId from request for Super Admin selected-school mode.
// Returns null if no school was requested (global scope).
// Only checks request body — URL/query params are not used for school selection
// in this middleware to avoid ambiguity with other route parameters.
function extractRequestedSchoolId(req) {
  const body = req.body || {};
  const rawSchoolId = body.schoolId;

  if (rawSchoolId === undefined || rawSchoolId === null) {
    return null;
  }

  if (typeof rawSchoolId !== "string") {
    return null;
  }

  const trimmed = rawSchoolId.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed;
}

export function createSchoolScopeMiddleware({ firestore } = {}) {
  const db = firestore || admin.firestore();

  return async function schoolScopeMiddleware(req, res, next) {
    await executeMiddleware(req, res, db, next);
  };
}

// Default export uses the existing Firebase Admin initialization
export async function schoolScopeMiddleware(req, res, next) {
  const middleware = createSchoolScopeMiddleware({
    firestore: admin.firestore(),
  });
  await middleware(req, res, next);
}

export default schoolScopeMiddleware;
