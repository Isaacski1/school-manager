import test from "node:test";
import assert from "node:assert/strict";
import { createTwoRoleAuthMiddleware } from "./twoRoleAuthMiddleware.js";

// ---------------------------------------------------------------------------
// Mock Firebase Admin services
// ---------------------------------------------------------------------------

const mockUsers = {
  "school-admin-active": {
    role: "school_admin",
    status: "active",
    schoolId: "school-1",
  },
  "school-admin-inactive": {
    role: "school_admin",
    status: "inactive",
    schoolId: "school-1",
  },
  "school-admin-no-school": {
    role: "school_admin",
    status: "active",
    schoolId: null,
  },
  "school-admin-empty-school": {
    role: "school_admin",
    status: "active",
    schoolId: "",
  },
  "school-admin-whitespace-school": {
    role: "school_admin",
    status: "active",
    schoolId: "   ",
  },
  "school-admin-number-school": {
    role: "school_admin",
    status: "active",
    schoolId: 12345,
  },
  "super-admin-active": {
    role: "super_admin",
    status: "active",
    schoolId: null,
  },
  "super-admin-with-school": {
    role: "super_admin",
    status: "active",
    schoolId: "school-9",
  },
  "super-admin-no-school-field": {
    role: "super_admin",
    status: "active",
  },
  "super-admin-inactive": {
    role: "super_admin",
    status: "inactive",
    schoolId: null,
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

const middleware = createTwoRoleAuthMiddleware({
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

test("twoRoleAuthMiddleware: missing Authorization header returns 401", async (t) => {
  const req = makeRequest(null);
  const response = makeResponse();
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  await middleware(req, response.res, next);

  assert.strictEqual(response.statusCode, 401);
  assert.strictEqual(nextCalled, false, "next() must not be called");
  assert.ok(response.body.error.includes("Missing Authorization header"));
});

test("twoRoleAuthMiddleware: malformed Bearer token returns 401", async (t) => {
  const req = { headers: { authorization: "Basic abc123" } };
  const response = makeResponse();
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  await middleware(req, response.res, next);

  assert.strictEqual(response.statusCode, 401);
  assert.strictEqual(nextCalled, false);
});

test("twoRoleAuthMiddleware: empty Bearer token returns 401", async (t) => {
  const req = { headers: { authorization: "Bearer " } };
  const response = makeResponse();
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  await middleware(req, response.res, next);

  assert.strictEqual(response.statusCode, 401);
  assert.strictEqual(nextCalled, false);
});

test("twoRoleAuthMiddleware: invalid Firebase token returns 403", async (t) => {
  const req = makeRequest("invalid-token");
  const response = makeResponse();
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  await middleware(req, response.res, next);

  assert.strictEqual(response.statusCode, 403);
  assert.strictEqual(nextCalled, false);
});

test("twoRoleAuthMiddleware: expired Firebase token returns 401", async (t) => {
  const req = makeRequest("expired-token");
  const response = makeResponse();
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  await middleware(req, response.res, next);

  assert.strictEqual(response.statusCode, 401);
  assert.strictEqual(nextCalled, false);
  assert.ok(response.body.code === "ID_TOKEN_EXPIRED");
});

test("twoRoleAuthMiddleware: revoked Firebase token returns 401", async (t) => {
  const req = makeRequest("revoked-token");
  const response = makeResponse();
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  await middleware(req, response.res, next);

  assert.strictEqual(response.statusCode, 401);
  assert.strictEqual(nextCalled, false);
  assert.ok(response.body.code === "ID_TOKEN_EXPIRED");
});

test("twoRoleAuthMiddleware: verifyIdToken is called with checkRevoked=true", async (t) => {
  lastVerifyIdTokenArgs = null;
  const mockAuthRevocation = {
    verifyIdToken: async (token, checkRevoked) => {
      lastVerifyIdTokenArgs = { token, checkRevoked };
      return { uid: "school-admin-active" };
    },
  };
  const m = createTwoRoleAuthMiddleware({
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

test("twoRoleAuthMiddleware: missing Firestore user document returns 403", async (t) => {
  const req = makeRequest("unknown-user-token");
  const response = makeResponse();
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  await middleware(req, response.res, next);

  assert.strictEqual(response.statusCode, 403);
  assert.strictEqual(nextCalled, false);
});

test("twoRoleAuthMiddleware: inactive account returns 403", async (t) => {
  const mockAuthInactive = {
    verifyIdToken: async () => ({ uid: "school-admin-inactive" }),
  };
  const m = createTwoRoleAuthMiddleware({
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

test("twoRoleAuthMiddleware: Firestore read failure returns 500 without exposing internal details", async (t) => {
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
  const m = createTwoRoleAuthMiddleware({
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

// ---------------------------------------------------------------------------
// SCHOOL_ADMIN tests
// ---------------------------------------------------------------------------

test("twoRoleAuthMiddleware: valid lowercase school_admin accepted with auth context", async (t) => {
  const mockAuthActive = {
    verifyIdToken: async () => ({ uid: "school-admin-active" }),
  };
  const m = createTwoRoleAuthMiddleware({
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
  assert.ok(req.authContext, "authContext must be attached");
  assert.strictEqual(req.authContext.userId, "school-admin-active");
  assert.strictEqual(req.authContext.schoolId, "school-1");
  assert.strictEqual(req.authContext.role, "school_admin");
});

test("twoRoleAuthMiddleware: uppercase SCHOOL_ADMIN is rejected", async (t) => {
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
  const m = createTwoRoleAuthMiddleware({
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

test("twoRoleAuthMiddleware: missing schoolId returns 403", async (t) => {
  const mockAuthNoSchool = {
    verifyIdToken: async () => ({ uid: "school-admin-no-school" }),
  };
  const m = createTwoRoleAuthMiddleware({
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

test("twoRoleAuthMiddleware: null schoolId returns 403", async (t) => {
  // Covered by missing schoolId test (admin-no-school has schoolId: null)
  const mockAuthNullSchool = {
    verifyIdToken: async () => ({ uid: "school-admin-no-school" }),
  };
  const m = createTwoRoleAuthMiddleware({
    auth: mockAuthNullSchool,
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

test("twoRoleAuthMiddleware: empty schoolId returns 403", async (t) => {
  const mockAuthEmptySchool = {
    verifyIdToken: async () => ({ uid: "school-admin-empty-school" }),
  };
  const m = createTwoRoleAuthMiddleware({
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

test("twoRoleAuthMiddleware: whitespace-only schoolId returns 403", async (t) => {
  const mockAuthWhitespace = {
    verifyIdToken: async () => ({ uid: "school-admin-whitespace-school" }),
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
  const m = createTwoRoleAuthMiddleware({
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

test("twoRoleAuthMiddleware: non-string schoolId returns 403", async (t) => {
  const mockAuthNumberSchool = {
    verifyIdToken: async () => ({ uid: "school-admin-number-school" }),
  };
  const mockFirestoreNumberSchool = {
    collection: (name) => {
      assert.strictEqual(name, "users");
      return {
        doc: (uid) => ({
          get: async () => ({
            exists: true,
            data: () => ({
              role: "school_admin",
              status: "active",
              schoolId: 12345,
            }),
          }),
        }),
      };
    },
  };
  const m = createTwoRoleAuthMiddleware({
    auth: mockAuthNumberSchool,
    firestore: mockFirestoreNumberSchool,
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

test("twoRoleAuthMiddleware: teacher is rejected", async (t) => {
  const mockAuthTeacher = {
    verifyIdToken: async () => ({ uid: "teacher" }),
  };
  const m = createTwoRoleAuthMiddleware({
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

test("twoRoleAuthMiddleware: parent is rejected", async (t) => {
  const mockAuthParent = {
    verifyIdToken: async () => ({ uid: "parent" }),
  };
  const m = createTwoRoleAuthMiddleware({
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

test("twoRoleAuthMiddleware: school admin context contains only trusted backend-derived values", async (t) => {
  const mockAuthTrust = {
    verifyIdToken: async () => ({ uid: "school-admin-active" }),
  };
  const m = createTwoRoleAuthMiddleware({
    auth: mockAuthTrust,
    firestore: mockFirestore,
  });
  const req = makeRequest("any-token");
  const response = makeResponse();
  const next = () => {};

  await m(req, response.res, next);

  assert.ok(req.authContext);
  assert.deepStrictEqual(Object.keys(req.authContext).sort(), ["role", "schoolId", "userId"]);
  assert.strictEqual(typeof req.authContext.userId, "string");
  assert.strictEqual(typeof req.authContext.schoolId, "string");
  assert.strictEqual(typeof req.authContext.role, "string");
  assert.strictEqual(req.authContext.token, undefined);
  assert.strictEqual(req.authContext.uid, undefined);
  assert.strictEqual(req.authContext.role, "school_admin");
  assert.strictEqual(req.authContext.schoolId, "school-1");
});

// ---------------------------------------------------------------------------
// SUPER_ADMIN tests
// ---------------------------------------------------------------------------

test("twoRoleAuthMiddleware: valid lowercase super_admin accepted without schoolId", async (t) => {
  const mockAuthSuper = {
    verifyIdToken: async () => ({ uid: "super-admin-active" }),
  };
  const m = createTwoRoleAuthMiddleware({
    auth: mockAuthSuper,
    firestore: mockFirestore,
  });
  const req = makeRequest("any-token");
  const response = makeResponse();
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  await m(req, response.res, next);

  assert.strictEqual(response.statusCode, undefined, "middleware should not send a response");
  assert.strictEqual(nextCalled, true, "next() must be called");
  assert.ok(req.authContext, "authContext must be attached");
  assert.strictEqual(req.authContext.userId, "super-admin-active");
  assert.strictEqual(req.authContext.role, "super_admin");
  assert.strictEqual(req.authContext.schoolId, null);
});

test("twoRoleAuthMiddleware: super_admin with null schoolId accepted", async (t) => {
  // super-admin-active already has schoolId: null
  const mockAuthSuperNull = {
    verifyIdToken: async () => ({ uid: "super-admin-active" }),
  };
  const m = createTwoRoleAuthMiddleware({
    auth: mockAuthSuperNull,
    firestore: mockFirestore,
  });
  const req = makeRequest("any-token");
  const response = makeResponse();
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  await m(req, response.res, next);

  assert.strictEqual(response.statusCode, undefined);
  assert.strictEqual(nextCalled, true);
  assert.ok(req.authContext);
  assert.strictEqual(req.authContext.schoolId, null);
  assert.strictEqual(req.authContext.role, "super_admin");
});

test("twoRoleAuthMiddleware: super_admin with no schoolId field accepted", async (t) => {
  const mockAuthSuperNoField = {
    verifyIdToken: async () => ({ uid: "super-admin-no-school-field" }),
  };
  const m = createTwoRoleAuthMiddleware({
    auth: mockAuthSuperNoField,
    firestore: mockFirestore,
  });
  const req = makeRequest("any-token");
  const response = makeResponse();
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  await m(req, response.res, next);

  assert.strictEqual(response.statusCode, undefined);
  assert.strictEqual(nextCalled, true);
  assert.ok(req.authContext);
  assert.strictEqual(req.authContext.role, "super_admin");
  assert.strictEqual(req.authContext.schoolId, null);
});

test("twoRoleAuthMiddleware: super_admin with optional stored schoolId accepted", async (t) => {
  const mockAuthSuperWithSchool = {
    verifyIdToken: async () => ({ uid: "super-admin-with-school" }),
  };
  const m = createTwoRoleAuthMiddleware({
    auth: mockAuthSuperWithSchool,
    firestore: mockFirestore,
  });
  const req = makeRequest("any-token");
  const response = makeResponse();
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  await m(req, response.res, next);

  assert.strictEqual(response.statusCode, undefined);
  assert.strictEqual(nextCalled, true);
  assert.ok(req.authContext);
  assert.strictEqual(req.authContext.role, "super_admin");
  // Context schoolId is always null for Super Admin, even if Firestore has a value
  assert.strictEqual(req.authContext.schoolId, null);
});

test("twoRoleAuthMiddleware: super_admin context schoolId is always null", async (t) => {
  const mockAuthSuper = {
    verifyIdToken: async () => ({ uid: "super-admin-with-school" }),
  };
  const m = createTwoRoleAuthMiddleware({
    auth: mockAuthSuper,
    firestore: mockFirestore,
  });
  const req = makeRequest("any-token");
  const response = makeResponse();
  const next = () => {};

  await m(req, response.res, next);

  assert.ok(req.authContext);
  assert.strictEqual(req.authContext.role, "super_admin");
  assert.strictEqual(req.authContext.schoolId, null);
});

test("twoRoleAuthMiddleware: uppercase SUPER_ADMIN is rejected", async (t) => {
  const mockAuthUpperSuper = {
    verifyIdToken: async () => ({ uid: "admin-upper-super" }),
  };
  const mockFirestoreUpperSuper = {
    collection: (name) => {
      assert.strictEqual(name, "users");
      return {
        doc: (uid) => ({
          get: async () => ({
            exists: true,
            data: () => ({
              role: "SUPER_ADMIN",
              status: "active",
              schoolId: null,
            }),
          }),
        }),
      };
    },
  };
  const m = createTwoRoleAuthMiddleware({
    auth: mockAuthUpperSuper,
    firestore: mockFirestoreUpperSuper,
  });
  const req = makeRequest("any-token");
  const response = makeResponse();
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  await m(req, response.res, next);

  assert.strictEqual(response.statusCode, 403);
  assert.strictEqual(nextCalled, false);
});

test("twoRoleAuthMiddleware: school admin cannot authenticate as super_admin via request role", async (t) => {
  // The middleware never reads role from the request; it only reads from Firestore.
  // A school_admin user with a request-supplied role of super_admin in the body
  // is still evaluated by their actual Firestore role.
  const mockAuthSchool = {
    verifyIdToken: async () => ({ uid: "school-admin-active" }),
  };
  const m = createTwoRoleAuthMiddleware({
    auth: mockAuthSchool,
    firestore: mockFirestore,
  });
  const req = {
    headers: { authorization: "Bearer any-token" },
    body: { role: "super_admin" },
  };
  const response = makeResponse();
  const next = () => {};

  await m(req, response.res, next);

  // The request-supplied role is ignored; the user is a school_admin
  assert.ok(req.authContext);
  assert.strictEqual(req.authContext.role, "school_admin");
  assert.strictEqual(req.authContext.schoolId, "school-1");
});

test("twoRoleAuthMiddleware: super_admin context contains only trusted backend-derived values", async (t) => {
  const mockAuthTrust = {
    verifyIdToken: async () => ({ uid: "super-admin-active" }),
  };
  const m = createTwoRoleAuthMiddleware({
    auth: mockAuthTrust,
    firestore: mockFirestore,
  });
  const req = makeRequest("any-token");
  const response = makeResponse();
  const next = () => {};

  await m(req, response.res, next);

  assert.ok(req.authContext);
  assert.deepStrictEqual(Object.keys(req.authContext).sort(), ["role", "schoolId", "userId"]);
  assert.strictEqual(typeof req.authContext.userId, "string");
  assert.strictEqual(req.authContext.schoolId, null);
  assert.strictEqual(typeof req.authContext.role, "string");
  assert.strictEqual(req.authContext.token, undefined);
  assert.strictEqual(req.authContext.uid, undefined);
});

test("twoRoleAuthMiddleware: does not create or modify req.schoolScope", async (t) => {
  const mockAuthTrust = {
    verifyIdToken: async () => ({ uid: "school-admin-active" }),
  };
  const m = createTwoRoleAuthMiddleware({
    auth: mockAuthTrust,
    firestore: mockFirestore,
  });
  const req = makeRequest("any-token");
  const response = makeResponse();
  const next = () => {};

  await m(req, response.res, next);

  assert.strictEqual(req.schoolScope, undefined, "schoolScope must not be created");
});
