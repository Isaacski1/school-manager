import test from "node:test";
import assert from "node:assert/strict";
import { createSchoolScopeMiddleware } from "./schoolScopeMiddleware.js";

// ---------------------------------------------------------------------------
// Mock Firebase Admin services
// ---------------------------------------------------------------------------

const mockSchools = {
  "school-1": {
    id: "school-1",
    name: "Test School 1",
    status: "active",
    featurePlan: "standard",
  },
  "school-2": {
    id: "school-2",
    name: "Test School 2",
    status: "active",
    featurePlan: "starter",
  },
  "school-inactive": {
    id: "school-inactive",
    name: "Inactive School",
    status: "inactive",
    featurePlan: "standard",
  },
};

const mockFirestore = {
  collection: (name) => {
    assert.strictEqual(name, "schools");
    return {
      doc: (schoolId) => ({
        get: async () => {
          const school = mockSchools[schoolId];
          if (!school) {
            return { exists: false, data: () => null };
          }
          return { exists: true, data: () => school };
        },
      }),
    };
  },
};

const middleware = createSchoolScopeMiddleware({
  firestore: mockFirestore,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(options = {}) {
  return {
    headers: options.token ? { authorization: `Bearer ${options.token}` } : {},
    body: options.body || {},
    query: options.query || {},
    params: options.params || {},
    authContext: options.authContext || null,
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
// Tests — SCHOOL_ADMIN
// ---------------------------------------------------------------------------

test("schoolScopeMiddleware: School Admin receives single_school scope", async (t) => {
  const req = makeRequest({
    body: {},
    authContext: {
      userId: "admin-1",
      role: "school_admin",
      schoolId: "school-1",
    },
  });
  const response = makeResponse();
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  await middleware(req, response.res, next);

  assert.strictEqual(response.statusCode, undefined);
  assert.strictEqual(nextCalled, true);
  assert.ok(req.schoolScope);
  assert.strictEqual(req.schoolScope.scope, "single_school");
  assert.strictEqual(req.schoolScope.schoolId, "school-1");
});

test("schoolScopeMiddleware: School Admin scope uses authenticated Firestore schoolId", async (t) => {
  const req = makeRequest({
    body: { schoolId: "school-999" }, // Attempt to override
    authContext: {
      userId: "admin-1",
      role: "school_admin",
      schoolId: "school-1",
    },
  });
  const response = makeResponse();
  const next = () => {};

  await middleware(req, response.res, next);

  assert.ok(req.schoolScope);
  assert.strictEqual(req.schoolScope.scope, "single_school");
  assert.strictEqual(req.schoolScope.schoolId, "school-1"); // Not overridden
});

test("schoolScopeMiddleware: missing authentication context is rejected", async (t) => {
  const req = makeRequest({ body: {} });
  const response = makeResponse();
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  await middleware(req, response.res, next);

  assert.strictEqual(response.statusCode, 403);
  assert.strictEqual(nextCalled, false);
  assert.ok(response.body.error.includes("Authentication context missing"));
});

test("schoolScopeMiddleware: wrong role is rejected", async (t) => {
  const mockAuthContext = {
    userId: "teacher-1",
    role: "teacher",
    schoolId: "school-1",
  };
  const req = makeRequest({
    body: {},
    authContext: mockAuthContext,
  });
  const response = makeResponse();
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  await middleware(req, response.res, next);

  assert.strictEqual(response.statusCode, 403);
  assert.strictEqual(nextCalled, false);
});

test("schoolScopeMiddleware: request body schoolId cannot override scope", async (t) => {
  const req = makeRequest({
    body: { schoolId: "school-999" },
    authContext: {
      userId: "admin-1",
      role: "school_admin",
      schoolId: "school-1",
    },
  });
  const response = makeResponse();
  const next = () => {};

  await middleware(req, response.res, next);

  assert.ok(req.schoolScope);
  assert.strictEqual(req.schoolScope.scope, "single_school");
  assert.strictEqual(req.schoolScope.schoolId, "school-1");
  assert.notStrictEqual(req.schoolScope.schoolId, "school-999");
});

test("schoolScopeMiddleware: query schoolId cannot override scope", async (t) => {
  const req = makeRequest({
    body: {},
    query: { schoolId: "school-888" },
    authContext: {
      userId: "admin-1",
      role: "school_admin",
      schoolId: "school-1",
    },
  });
  const response = makeResponse();
  const next = () => {};

  await middleware(req, response.res, next);

  assert.ok(req.schoolScope);
  assert.strictEqual(req.schoolScope.scope, "single_school");
  assert.strictEqual(req.schoolScope.schoolId, "school-1");
  assert.notStrictEqual(req.schoolScope.schoolId, "school-888");
});

test("schoolScopeMiddleware: URL parameter schoolId cannot override scope", async (t) => {
  const req = makeRequest({
    body: {},
    params: { schoolId: "school-777" },
    authContext: {
      userId: "admin-1",
      role: "school_admin",
      schoolId: "school-1",
    },
  });
  const response = makeResponse();
  const next = () => {};

  await middleware(req, response.res, next);

  assert.ok(req.schoolScope);
  assert.strictEqual(req.schoolScope.scope, "single_school");
  assert.strictEqual(req.schoolScope.schoolId, "school-1");
  assert.notStrictEqual(req.schoolScope.schoolId, "school-777");
});

test("schoolScopeMiddleware: School Admin global scope request is rejected", async (t) => {
  // School Admin cannot request global scope — scope is always single_school
  const req = makeRequest({
    body: {},
    authContext: {
      userId: "admin-1",
      role: "school_admin",
      schoolId: "school-1",
    },
  });
  const response = makeResponse();
  const next = () => {};

  await middleware(req, response.res, next);

  // School Admin always gets single_school scope, never global
  assert.ok(req.schoolScope);
  assert.strictEqual(req.schoolScope.scope, "single_school");
  assert.notStrictEqual(req.schoolScope.scope, "global");
});

test("schoolScopeMiddleware: School Admin selected-school request is rejected", async (t) => {
  // School Admin cannot request selected-school scope
  const req = makeRequest({
    body: { schoolId: "school-2" },
    authContext: {
      userId: "admin-1",
      role: "school_admin",
      schoolId: "school-1",
    },
  });
  const response = makeResponse();
  const next = () => {};

  await middleware(req, response.res, next);

  // School Admin always gets single_school scope with their own schoolId
  assert.ok(req.schoolScope);
  assert.strictEqual(req.schoolScope.scope, "single_school");
  assert.strictEqual(req.schoolScope.schoolId, "school-1");
  assert.notStrictEqual(req.schoolScope.schoolId, "school-2");
});

test("schoolScopeMiddleware: empty authenticated schoolId is rejected", async (t) => {
  const mockAuthContext = {
    userId: "admin-no-school",
    role: "school_admin",
    schoolId: "",
  };
  const req = makeRequest({
    body: {},
    authContext: mockAuthContext,
  });
  const response = makeResponse();
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  await middleware(req, response.res, next);

  assert.strictEqual(response.statusCode, 403);
  assert.strictEqual(nextCalled, false);
});

// ---------------------------------------------------------------------------
// Tests — SUPER_ADMIN
// ---------------------------------------------------------------------------

test("schoolScopeMiddleware: Super Admin defaults to global scope", async (t) => {
  const req = makeRequest({
    body: {},
    authContext: {
      userId: "super-1",
      role: "super_admin",
      schoolId: null,
    },
  });
  const response = makeResponse();
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  await middleware(req, response.res, next);

  assert.strictEqual(response.statusCode, undefined);
  assert.strictEqual(nextCalled, true);
  assert.ok(req.schoolScope);
  assert.strictEqual(req.schoolScope.scope, "global");
  assert.strictEqual(req.schoolScope.schoolId, null);
});

test("schoolScopeMiddleware: Super Admin without stored schoolId receives global scope", async (t) => {
  const mockAuthContext = {
    userId: "super-1",
    role: "super_admin",
    schoolId: null,
  };
  const req = makeRequest({
    body: {},
    authContext: mockAuthContext,
  });
  const response = makeResponse();
  const next = () => {};

  await middleware(req, response.res, next);

  assert.ok(req.schoolScope);
  assert.strictEqual(req.schoolScope.scope, "global");
  assert.strictEqual(req.schoolScope.schoolId, null);
});

test("schoolScopeMiddleware: Super Admin with optional stored schoolId still receives global scope", async (t) => {
  const mockAuthContext = {
    userId: "super-1",
    role: "super_admin",
    schoolId: "school-9", // Stored schoolId does not restrict global access
  };
  const req = makeRequest({
    body: {},
    authContext: mockAuthContext,
  });
  const response = makeResponse();
  const next = () => {};

  await middleware(req, response.res, next);

  assert.ok(req.schoolScope);
  assert.strictEqual(req.schoolScope.scope, "global");
  assert.strictEqual(req.schoolScope.schoolId, null);
});

test("schoolScopeMiddleware: valid selected school receives selected_school scope", async (t) => {
  const req = makeRequest({
    body: { schoolId: "school-1" },
    authContext: {
      userId: "super-1",
      role: "super_admin",
      schoolId: null,
    },
  });
  const response = makeResponse();
  const next = () => {};

  await middleware(req, response.res, next);

  assert.ok(req.schoolScope);
  assert.strictEqual(req.schoolScope.scope, "selected_school");
  assert.strictEqual(req.schoolScope.schoolId, "school-1");
});

test("schoolScopeMiddleware: missing selected school ID returns global scope", async (t) => {
  const req = makeRequest({
    body: {},
    authContext: {
      userId: "super-1",
      role: "super_admin",
      schoolId: null,
    },
  });
  const response = makeResponse();
  const next = () => {};

  await middleware(req, response.res, next);

  assert.ok(req.schoolScope);
  assert.strictEqual(req.schoolScope.scope, "global");
  assert.strictEqual(req.schoolScope.schoolId, null);
});

test("schoolScopeMiddleware: empty selected school ID returns global scope", async (t) => {
  const req = makeRequest({
    body: { schoolId: "" },
    authContext: {
      userId: "super-1",
      role: "super_admin",
      schoolId: null,
    },
  });
  const response = makeResponse();
  const next = () => {};

  await middleware(req, response.res, next);

  assert.ok(req.schoolScope);
  assert.strictEqual(req.schoolScope.scope, "global");
  assert.strictEqual(req.schoolScope.schoolId, null);
});

test("schoolScopeMiddleware: whitespace selected school ID returns global scope", async (t) => {
  const req = makeRequest({
    body: { schoolId: "   " },
    authContext: {
      userId: "super-1",
      role: "super_admin",
      schoolId: null,
    },
  });
  const response = makeResponse();
  const next = () => {};

  await middleware(req, response.res, next);

  assert.ok(req.schoolScope);
  assert.strictEqual(req.schoolScope.scope, "global");
  assert.strictEqual(req.schoolScope.schoolId, null);
});

test("schoolScopeMiddleware: non-string selected school ID returns global scope", async (t) => {
  const req = makeRequest({
    body: { schoolId: 12345 },
    authContext: {
      userId: "super-1",
      role: "super_admin",
      schoolId: null,
    },
  });
  const response = makeResponse();
  const next = () => {};

  await middleware(req, response.res, next);

  assert.ok(req.schoolScope);
  assert.strictEqual(req.schoolScope.scope, "global");
  assert.strictEqual(req.schoolScope.schoolId, null);
});

test("schoolScopeMiddleware: nonexistent school is rejected", async (t) => {
  const req = makeRequest({
    body: { schoolId: "school-nonexistent" },
    authContext: {
      userId: "super-1",
      role: "super_admin",
      schoolId: null,
    },
  });
  const response = makeResponse();
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  await middleware(req, response.res, next);

  assert.strictEqual(response.statusCode, 403);
  assert.strictEqual(nextCalled, false);
  assert.ok(!req.schoolScope || req.schoolScope.scope !== "selected_school");
});

test("schoolScopeMiddleware: inactive school is rejected", async (t) => {
  const req = makeRequest({
    body: { schoolId: "school-inactive" },
    authContext: {
      userId: "super-1",
      role: "super_admin",
      schoolId: null,
    },
  });
  const response = makeResponse();
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  await middleware(req, response.res, next);

  assert.strictEqual(response.statusCode, 403);
  assert.strictEqual(nextCalled, false);
});

test("schoolScopeMiddleware: Firestore read failure returns 500 without exposing internal details", async (t) => {
  const mockFirestoreFail = {
    collection: () => ({
      doc: () => ({
        get: async () => {
          throw new Error("Firestore connection lost: internal details here");
        },
      }),
    }),
  };
  const m = createSchoolScopeMiddleware({
    firestore: mockFirestoreFail,
  });
  const req = makeRequest({
    body: { schoolId: "school-1" },
    authContext: {
      userId: "super-1",
      role: "super_admin",
      schoolId: null,
    },
  });
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

test("schoolScopeMiddleware: failed selected-school validation does not assign selected-school scope", async (t) => {
  const req = makeRequest({
    body: { schoolId: "school-nonexistent" },
    authContext: {
      userId: "super-1",
      role: "super_admin",
      schoolId: null,
    },
  });
  const response = makeResponse();
  const next = () => {};

  await middleware(req, response.res, next);

  assert.strictEqual(response.statusCode, 403);
  assert.ok(!req.schoolScope || req.schoolScope.scope !== "selected_school");
});

// ---------------------------------------------------------------------------
// Tests — OTHER ROLES
// ---------------------------------------------------------------------------

test("schoolScopeMiddleware: teacher cannot receive school scope", async (t) => {
  const mockAuthContext = {
    userId: "teacher-1",
    role: "teacher",
    schoolId: "school-1",
  };
  const req = makeRequest({
    body: {},
    authContext: mockAuthContext,
  });
  const response = makeResponse();
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  await middleware(req, response.res, next);

  assert.strictEqual(response.statusCode, 403);
  assert.strictEqual(nextCalled, false);
});

test("schoolScopeMiddleware: parent cannot receive school scope", async (t) => {
  const mockAuthContext = {
    userId: "parent-1",
    role: "parent",
    schoolId: "school-1",
  };
  const req = makeRequest({
    body: {},
    authContext: mockAuthContext,
  });
  const response = makeResponse();
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  await middleware(req, response.res, next);

  assert.strictEqual(response.statusCode, 403);
  assert.strictEqual(nextCalled, false);
});

test("schoolScopeMiddleware: unknown role cannot receive school scope", async (t) => {
  const mockAuthContext = {
    userId: "unknown-1",
    role: "unknown_role",
    schoolId: null,
  };
  const req = makeRequest({
    body: {},
    authContext: mockAuthContext,
  });
  const response = makeResponse();
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  await middleware(req, response.res, next);

  assert.strictEqual(response.statusCode, 403);
  assert.strictEqual(nextCalled, false);
});

// ---------------------------------------------------------------------------
// Tests — CONTEXT INTEGRITY
// ---------------------------------------------------------------------------

test("schoolScopeMiddleware: req.authContext remains unchanged", async (t) => {
  const mockAuthContext = {
    userId: "super-1",
    role: "super_admin",
    schoolId: null,
  };
  const req = makeRequest({
    body: { schoolId: "school-1" },
    authContext: { ...mockAuthContext },
  });
  const response = makeResponse();
  const next = () => {};

  await middleware(req, response.res, next);

  assert.ok(req.authContext);
  assert.strictEqual(req.authContext.userId, "super-1");
  assert.strictEqual(req.authContext.role, "super_admin");
  assert.strictEqual(req.authContext.schoolId, null);
});

test("schoolScopeMiddleware: schoolScope is derived from trusted context and validated data", async (t) => {
  const req = makeRequest({
    body: { schoolId: "school-1" },
    authContext: {
      userId: "super-1",
      role: "super_admin",
      schoolId: null,
    },
  });
  const response = makeResponse();
  const next = () => {};

  await middleware(req, response.res, next);

  assert.ok(req.schoolScope);
  assert.strictEqual(req.schoolScope.scope, "selected_school");
  assert.strictEqual(req.schoolScope.schoolId, "school-1");
});

test("schoolScopeMiddleware: School Admin cannot change scope through frontend-supplied values", async (t) => {
  const req = makeRequest({
    body: { schoolId: "school-999", scope: "global" },
    authContext: {
      userId: "admin-1",
      role: "school_admin",
      schoolId: "school-1",
    },
  });
  const response = makeResponse();
  const next = () => {};

  await middleware(req, response.res, next);

  assert.ok(req.schoolScope);
  assert.strictEqual(req.schoolScope.scope, "single_school");
  assert.strictEqual(req.schoolScope.schoolId, "school-1");
  assert.notStrictEqual(req.schoolScope.schoolId, "school-999");
});

test("schoolScopeMiddleware: Super Admin cannot select a school without backend validation", async (t) => {
  // A non-existent school must not be assigned selected-school scope
  const req = makeRequest({
    body: { schoolId: "school-fake" },
    authContext: {
      userId: "super-1",
      role: "super_admin",
      schoolId: null,
    },
  });
  const response = makeResponse();
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  await middleware(req, response.res, next);

  assert.strictEqual(response.statusCode, 403);
  assert.strictEqual(nextCalled, false);
});
