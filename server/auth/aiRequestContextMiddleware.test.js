// aiRequestContextMiddleware.test.js
// Unit tests for aiRequestContextMiddleware.js - request ID generation
// and context isolation.
import test from "node:test";
import assert from "node:assert/strict";
import { aiRequestContextMiddleware, generateRequestId } from "./aiRequestContextMiddleware.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(options = {}) {
  return {
    headers: options.headers || {},
    body: options.body || {},
    query: options.query || {},
    params: options.params || {},
    authContext: options.authContext || null,
    schoolScope: options.schoolScope || null,
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
// Tests — generateRequestId
// ---------------------------------------------------------------------------

test("aiRequestContextMiddleware: generateRequestId returns a string", async (t) => {
  const id = generateRequestId();
  assert.strictEqual(typeof id, "string");
  assert.ok(id.length > 0);
});

test("aiRequestContextMiddleware: generateRequestId starts with 'ai_'", async (t) => {
  const id = generateRequestId();
  assert.ok(id.startsWith("ai_"));
});

test("aiRequestContextMiddleware: request IDs are unique across calls", async (t) => {
  const id1 = generateRequestId();
  const id2 = generateRequestId();
  assert.notStrictEqual(id1, id2);
});

test("aiRequestContextMiddleware: multiple request IDs are all unique", async (t) => {
  const ids = new Set();
  for (let i = 0; i < 100; i++) {
    ids.add(generateRequestId());
  }
  assert.strictEqual(ids.size, 100);
});

// ---------------------------------------------------------------------------
// Tests — middleware attaches request ID
// ---------------------------------------------------------------------------

test("aiRequestContextMiddleware: attaches aiRequestContext to request", async (t) => {
  const req = makeRequest();
  const response = makeResponse();
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  await aiRequestContextMiddleware(req, response.res, next);

  assert.strictEqual(response.statusCode, undefined);
  assert.strictEqual(nextCalled, true);
  assert.ok(req.aiRequestContext);
  assert.strictEqual(typeof req.aiRequestContext.requestId, "string");
  assert.ok(req.aiRequestContext.requestId.startsWith("ai_"));
});

test("aiRequestContextMiddleware: does not overwrite existing authContext", async (t) => {
  const existingAuthContext = {
    userId: "firebase_uid_123",
    role: "school_admin",
    schoolId: "school-1",
  };
  const req = makeRequest({ authContext: existingAuthContext });
  const response = makeResponse();
  const next = () => {};

  await aiRequestContextMiddleware(req, response.res, next);

  assert.ok(req.authContext);
  assert.strictEqual(req.authContext.userId, "firebase_uid_123");
  assert.strictEqual(req.authContext.role, "school_admin");
  assert.strictEqual(req.authContext.schoolId, "school-1");
});

test("aiRequestContextMiddleware: does not overwrite existing schoolScope", async (t) => {
  const existingSchoolScope = {
    scope: "single_school",
    schoolId: "school-1",
  };
  const req = makeRequest({ schoolScope: existingSchoolScope });
  const response = makeResponse();
  const next = () => {};

  await aiRequestContextMiddleware(req, response.res, next);

  assert.ok(req.schoolScope);
  assert.strictEqual(req.schoolScope.scope, "single_school");
  assert.strictEqual(req.schoolScope.schoolId, "school-1");
});

test("aiRequestContextMiddleware: does not overwrite authContext or schoolScope when both exist", async (t) => {
  const req = makeRequest({
    authContext: {
      userId: "uid-1",
      role: "super_admin",
      schoolId: null,
    },
    schoolScope: {
      scope: "global",
      schoolId: null,
    },
  });
  const response = makeResponse();
  const next = () => {};

  await aiRequestContextMiddleware(req, response.res, next);

  assert.ok(req.authContext);
  assert.strictEqual(req.authContext.role, "super_admin");
  assert.ok(req.schoolScope);
  assert.strictEqual(req.schoolScope.scope, "global");
  assert.ok(req.aiRequestContext);
  assert.strictEqual(typeof req.aiRequestContext.requestId, "string");
});

// ---------------------------------------------------------------------------
// Tests — client-supplied request ID is never trusted
// ---------------------------------------------------------------------------

test("aiRequestContextMiddleware: client-supplied request ID in headers is ignored", async (t) => {
  const req = makeRequest({
    headers: {
      "x-request-id": "client-supplied-id-123",
    },
  });
  const response = makeResponse();
  const next = () => {};

  await aiRequestContextMiddleware(req, response.res, next);

  assert.ok(req.aiRequestContext);
  assert.strictEqual(typeof req.aiRequestContext.requestId, "string");
  assert.notStrictEqual(req.aiRequestContext.requestId, "client-supplied-id-123");
  assert.ok(req.aiRequestContext.requestId.startsWith("ai_"));
});

test("aiRequestContextMiddleware: client-supplied request ID in body is ignored", async (t) => {
  const req = makeRequest({
    body: { requestId: "client-body-id-456" },
  });
  const response = makeResponse();
  const next = () => {};

  await aiRequestContextMiddleware(req, response.res, next);

  assert.ok(req.aiRequestContext);
  assert.strictEqual(typeof req.aiRequestContext.requestId, "string");
  assert.notStrictEqual(req.aiRequestContext.requestId, "client-body-id-456");
  assert.ok(req.aiRequestContext.requestId.startsWith("ai_"));
});

test("aiRequestContextMiddleware: client-supplied request ID in query is ignored", async (t) => {
  const req = makeRequest({
    query: { requestId: "client-query-id-789" },
  });
  const response = makeResponse();
  const next = () => {};

  await aiRequestContextMiddleware(req, response.res, next);

  assert.ok(req.aiRequestContext);
  assert.strictEqual(typeof req.aiRequestContext.requestId, "string");
  assert.notStrictEqual(req.aiRequestContext.requestId, "client-query-id-789");
  assert.ok(req.aiRequestContext.requestId.startsWith("ai_"));
});

// ---------------------------------------------------------------------------
// Tests — middleware is independently testable
// ---------------------------------------------------------------------------

test("aiRequestContextMiddleware: can be called independently without Express", async (t) => {
  const req = makeRequest();
  const response = makeResponse();
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  await aiRequestContextMiddleware(req, response.res, next);

  assert.strictEqual(nextCalled, true);
  assert.ok(req.aiRequestContext.requestId);
});

test("aiRequestContextMiddleware: generates a new ID for every request", async (t) => {
  const ids = new Set();
  for (let i = 0; i < 50; i++) {
    const req = makeRequest();
    const response = makeResponse();
    const next = () => {};
    await aiRequestContextMiddleware(req, response.res, next);
    ids.add(req.aiRequestContext.requestId);
  }
  assert.strictEqual(ids.size, 50);
});
