import test from "node:test";
import assert from "node:assert/strict";
import { createSchoolAdminMiddleware } from "./schoolAdminMiddleware.js";

// ---------------------------------------------------------------------------
// Mock Firebase Admin services
// ---------------------------------------------------------------------------

const mockUsers = {
  "admin-active": {
    role: "school_admin",
    status: "active",
    schoolId: "school-1",
  },
  "admin-inactive": {
    role: "school_admin",
    status: "inactive",
    schoolId: "school-1",
  },
  "super-admin": {
    role: "super_admin",
    status: "active",
    schoolId: "school-1",
  },
  teacher: {
    role: "teacher",
    status: "active",
    schoolId: "school-1",
  },
  parent: {
    role: "parent",
    status: "active",
    schoolId: "school-1",
  },
  "admin-no-school": {
    role: "school_admin",
    status: "active",
    schoolId: null,
  },
  "admin-empty-school": {
    role: "school_admin",
    status: "active",
    schoolId: "",
  },
};

const mockAuth = {
  verifyIdToken: async (token, checkRevoked) => {
    lastVerifyIdTokenArgs = { token, checkRevoked };
    if (token === "expired-token") {
      const err = new Error("ID token has expired");
      err.code = "auth/id-token-expired";
      throw err;
    }
    if (token === "revoked-token") {
      const err = new Error("ID token has been revoked");
      err.code = "auth/id-token-revoked";
      throw err;
    }
    if (token === "invalid-token") {
      throw new Error("Invalid token");
    }
    if (token === "malformed-token") {
      const err = new Error("Malformed token");
      err.code = "auth/argument-error";
      throw err;
    }
    return { uid: "test-uid" };
  },
};

let lastVerifyIdTokenArgs = null;

const lastVerifyIdToken = () => lastVerifyIdTokenArgs;

const mockFirestore = {
  collection: (name) => {
    assert.strictEqual(name, "users");
    return {
      doc: (uid) => ({
        get: async () => {
          const user = mockUsers[uid];
          if (!user) {
            return { exists: false, data: () => null };
          }
          return { exists: true, data: () => user };
        },
      }),
    };
  },
};

const middleware = createSchoolAdminMiddleware({
  auth: mockAuth,
  firestore: mockFirestore,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(token) {
  return {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  };
}

function makeResponse() {
  let statusCode;
  let body;
  const res = {
    status: (code) => {
      statusCode = code;
      return res;
    },
    json: (data) => {
      body = data;
      return res;
    },
  };
  return {
    res,
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("schoolAdminMiddleware: missing Authorization header returns 401", async (t) => {
  const req = makeRequest(null);
  const response = makeResponse();
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  await middleware(req, response.res, next);

  assert.strictEqual(response.statusCode, 401);
  assert.strictEqual(nextCalled, false, "next() must not be called");
  assert.ok(response.body.error.includes("Missing Authorization header"));
});

test("schoolAdminMiddleware: malformed Bearer token returns 401", async (t) => {
  const req = { headers: { authorization: "Basic abc123" } };
  const response = makeResponse();
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  await middleware(req, response.res, next);

  assert.strictEqual(response.statusCode, 401);
  assert.strictEqual(nextCalled, false);
});

test("schoolAdminMiddleware: invalid Firebase token returns 403", async (t) => {
  const req = makeRequest("invalid-token");
  const response = makeResponse();
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  await middleware(req, response.res, next);

  assert.strictEqual(response.statusCode, 403);
  assert.strictEqual(nextCalled, false);
});

test("schoolAdminMiddleware: expired Firebase token returns 401", async (t) => {
  const req = makeRequest("expired-token");
  const response = makeResponse();
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  await middleware(req, response.res, next);

  assert.strictEqual(response.statusCode, 401);
  assert.strictEqual(nextCalled, false);
  assert.ok(response.body.code === "ID_TOKEN_EXPIRED");
});

test("schoolAdminMiddleware: revoked Firebase token returns 401", async (t) => {
  const req = makeRequest("revoked-token");
  const response = makeResponse();
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  await middleware(req, response.res, next);

  assert.strictEqual(response.statusCode, 401);
  assert.strictEqual(nextCalled, false);
  assert.ok(response.body.code === "ID_TOKEN_EXPIRED");
});

test("schoolAdminMiddleware: missing Firestore user document returns 403", async (t) => {
  const req = makeRequest("unknown-user-token");
  const response = makeResponse();
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  await middleware(req, response.res, next);

  assert.strictEqual(response.statusCode, 403);
  assert.strictEqual(nextCalled, false);
});

test("schoolAdminMiddleware: inactive school_admin returns 403", async (t) => {
  const mockAuthInactive = {
    verifyIdToken: async () => ({ uid: "admin-inactive" }),
  };
  const m = createSchoolAdminMiddleware({
    auth: mockAuthInactive,
    firestore: mockFirestore,
  });
  const req = makeRequest("any-token");
  const response = makeResponse();
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  await m(req, response.res, next);

  assert.strictEqual(response.statusCode, 403);
  assert.strictEqual(nextCalled, false);
});

test("schoolAdminMiddleware: active school_admin passes with auth context", async (t) => {
  const mockAuthActive = {
    verifyIdToken: async () => ({ uid: "admin-active" }),
  };
  const m = createSchoolAdminMiddleware({
    auth: mockAuthActive,
    firestore: mockFirestore,
  });
  const req = makeRequest("any-token");
  const response = makeResponse();
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  await m(req, response.res, next);

  assert.strictEqual(response.statusCode, undefined, "middleware should not send a response");
  assert.strictEqual(nextCalled, true, "next() must be called");
  assert.ok(req.schoolAuthContext, "schoolAuthContext must be attached");
  assert.strictEqual(req.schoolAuthContext.userId, "admin-active");
  assert.strictEqual(req.schoolAuthContext.schoolId, "school-1");
  assert.strictEqual(req.schoolAuthContext.role, "school_admin");
});

test("schoolAdminMiddleware: uppercase SCHOOL_ADMIN is rejected", async (t) => {
  const mockAuthUpper = {
    verifyIdToken: async () => ({ uid: "admin-upper" }),
  };
  const mockFirestoreUpper = {
    collection: (name) => {
      assert.strictEqual(name, "users");
      return {
        doc: (uid) => ({
          get: async () => ({
            exists: true,
            data: () => ({
              role: "SCHOOL_ADMIN",
              status: "active",
              schoolId: "school-1",
            }),
          }),
        }),
      };
    },
  };
  const m = createSchoolAdminMiddleware({
    auth: mockAuthUpper,
    firestore: mockFirestoreUpper,
  });
  const req = makeRequest("any-token");
  const response = makeResponse();
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  await m(req, response.res, next);

  assert.strictEqual(response.statusCode, 403);
  assert.strictEqual(nextCalled, false);
});

test("schoolAdminMiddleware: super_admin is denied", async (t) => {
  const mockAuthSuper = {
    verifyIdToken: async () => ({ uid: "super-admin" }),
  };
  const m = createSchoolAdminMiddleware({
    auth: mockAuthSuper,
    firestore: mockFirestore,
  });
  const req = makeRequest("any-token");
  const response = makeResponse();
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  await m(req, response.res, next);

  assert.strictEqual(response.statusCode, 403);
  assert.strictEqual(nextCalled, false);
});

test("schoolAdminMiddleware: teacher is denied", async (t) => {
  const mockAuthTeacher = {
    verifyIdToken: async () => ({ uid: "teacher" }),
  };
  const m = createSchoolAdminMiddleware({
    auth: mockAuthTeacher,
    firestore: mockFirestore,
  });
  const req = makeRequest("any-token");
  const response = makeResponse();
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  await m(req, response.res, next);

  assert.strictEqual(response.statusCode, 403);
  assert.strictEqual(nextCalled, false);
});

test("schoolAdminMiddleware: parent is denied", async (t) => {
  const mockAuthParent = {
    verifyIdToken: async () => ({ uid: "parent" }),
  };
  const m = createSchoolAdminMiddleware({
    auth: mockAuthParent,
    firestore: mockFirestore,
  });
  const req = makeRequest("any-token");
  const response = makeResponse();
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  await m(req, response.res, next);

  assert.strictEqual(response.statusCode, 403);
  assert.strictEqual(nextCalled, false);
});

test("schoolAdminMiddleware: missing schoolId returns 403", async (t) => {
  const mockAuthNoSchool = {
    verifyIdToken: async () => ({ uid: "admin-no-school" }),
  };
  const m = createSchoolAdminMiddleware({
    auth: mockAuthNoSchool,
    firestore: mockFirestore,
  });
  const req = makeRequest("any-token");
  const response = makeResponse();
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  await m(req, response.res, next);

  assert.strictEqual(response.statusCode, 403);
  assert.strictEqual(nextCalled, false);
});

test("schoolAdminMiddleware: empty schoolId returns 403", async (t) => {
  const mockAuthEmptySchool = {
    verifyIdToken: async () => ({ uid: "admin-empty-school" }),
  };
  const m = createSchoolAdminMiddleware({
    auth: mockAuthEmptySchool,
    firestore: mockFirestore,
  });
  const req = makeRequest("any-token");
  const response = makeResponse();
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  await m(req, response.res, next);

  assert.strictEqual(response.statusCode, 403);
  assert.strictEqual(nextCalled, false);
});

test("schoolAdminMiddleware: auth context contains only trusted backend-derived values", async (t) => {
  const mockAuthTrust = {
    verifyIdToken: async () => ({ uid: "admin-active" }),
  };
  const m = createSchoolAdminMiddleware({
    auth: mockAuthTrust,
    firestore: mockFirestore,
  });
  const req = makeRequest("any-token");
  const response = makeResponse();
  const next = () => {};

  await m(req, response.res, next);

  assert.ok(req.schoolAuthContext);
  assert.deepStrictEqual(Object.keys(req.schoolAuthContext).sort(), ["role", "schoolId", "userId"]);
  assert.strictEqual(typeof req.schoolAuthContext.userId, "string");
  assert.strictEqual(typeof req.schoolAuthContext.schoolId, "string");
  assert.strictEqual(typeof req.schoolAuthContext.role, "string");
  assert.strictEqual(req.schoolAuthContext.token, undefined);
  assert.strictEqual(req.schoolAuthContext.uid, undefined);
});

test("schoolAdminMiddleware: request-supplied schoolId cannot override Firestore schoolId", async (t) => {
  const mockAuthOverride = {
    verifyIdToken: async () => ({ uid: "admin-active" }),
  };
  const m = createSchoolAdminMiddleware({
    auth: mockAuthOverride,
    firestore: mockFirestore,
  });
  const req = {
    headers: { authorization: "Bearer any-token" },
    body: { schoolId: "school-999" },
    query: { schoolId: "school-888" },
  };
  const response = makeResponse();
  const next = () => {};

  await m(req, response.res, next);

  assert.strictEqual(req.schoolAuthContext.schoolId, "school-1");
  assert.notStrictEqual(req.schoolAuthContext.schoolId, "school-999");
  assert.notStrictEqual(req.schoolAuthContext.schoolId, "school-888");
});

test("schoolAdminMiddleware: verifyIdToken is called with checkRevoked=true", async (t) => {
  lastVerifyIdTokenArgs = null;
  const mockAuthRevocation = {
    verifyIdToken: async (token, checkRevoked) => {
      lastVerifyIdTokenArgs = { token, checkRevoked };
      return { uid: "admin-active" };
    },
  };
  const m = createSchoolAdminMiddleware({
    auth: mockAuthRevocation,
    firestore: mockFirestore,
  });
  const req = makeRequest("any-token");
  const response = makeResponse();
  const next = () => {};

  await m(req, response.res, next);

  assert.ok(lastVerifyIdTokenArgs, "verifyIdToken was called");
  assert.strictEqual(lastVerifyIdTokenArgs.token, "any-token");
  assert.strictEqual(lastVerifyIdTokenArgs.checkRevoked, true);
});

test("schoolAdminMiddleware: whitespace-only schoolId returns 403", async (t) => {
  const mockAuthWhitespace = {
    verifyIdToken: async () => ({ uid: "admin-whitespace-school" }),
  };
  const mockFirestoreWhitespace = {
    collection: (name) => {
      assert.strictEqual(name, "users");
      return {
        doc: (uid) => ({
          get: async () => ({
            exists: true,
            data: () => ({
              role: "school_admin",
              status: "active",
              schoolId: "   ",
            }),
          }),
        }),
      };
    },
  };
  const m = createSchoolAdminMiddleware({
    auth: mockAuthWhitespace,
    firestore: mockFirestoreWhitespace,
  });
  const req = makeRequest("any-token");
  const response = makeResponse();
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  await m(req, response.res, next);

  assert.strictEqual(response.statusCode, 403);
  assert.strictEqual(nextCalled, false);
  assert.ok(response.body.error.includes("No school assigned"));
});

test("schoolAdminMiddleware: Firestore read failure returns 500 without exposing internal details", async (t) => {
  const mockAuthFirestoreFail = {
    verifyIdToken: async () => ({ uid: "admin-firestore-fail" }),
  };
  const mockFirestoreFail = {
    collection: () => ({
      doc: () => ({
        get: async () => {
          throw new Error("Firestore connection lost: internal details here");
        },
      }),
    }),
  };
  const m = createSchoolAdminMiddleware({
    auth: mockAuthFirestoreFail,
    firestore: mockFirestoreFail,
  });
  const req = makeRequest("any-token");
  const response = makeResponse();
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  await m(req, response.res, next);

  assert.strictEqual(response.statusCode, 500);
  assert.strictEqual(nextCalled, false);
  assert.ok(response.body.error.includes("Internal server error"));
  assert.ok(!response.body.error.includes("Firestore"));
  assert.ok(!response.body.error.includes("connection lost"));
});
