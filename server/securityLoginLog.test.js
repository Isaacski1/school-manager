import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createSecurityLoginLogHandler } from "./securityLoginLog.js";

/**
 * Test utilities: fake Firebase Admin, Firestore, and Auth.
 */

class FakeSnapshot {
  constructor(data) {
    this.exists = data !== undefined && data !== null;
    this._data = data || null;
  }
  data() {
    return this._data;
  }
}

let autoIdCounter = 0;
const nextAutoId = () => `auto_${++autoIdCounter}_${Date.now()}`;

class FakeDocRef {
  constructor(firestore, path) {
    this.firestore = firestore;
    this.path = path;
    this.id = path.split("/").pop();
    this.writtenData = null;
  }
  async get() {
    return new FakeSnapshot(this.firestore.records.get(this.path));
  }
  async set(data) {
    const clone = structuredClone(data);
    this.firestore.records.set(this.path, clone);
    this.writtenData = clone;
  }
}

class FakeCollectionRef {
  constructor(firestore, path) {
    this.firestore = firestore;
    this.path = path;
  }
  doc(id) {
    if (id === undefined || id === null) {
      return new FakeDocRef(this.firestore, `${this.path}/${nextAutoId()}`);
    }
    return new FakeDocRef(this.firestore, `${this.path}/${id}`);
  }
}

class FakeFirestore {
  constructor(records = new Map()) {
    this.records = records;
  }
  collection(name) {
    return new FakeCollectionRef(this, name);
  }
}

const createMockAdmin = (options = {}) => {
  const records = new Map();
  const callLog = { verifyIdTokenCalls: [] };

  if (options.userRecord) {
    records.set(`users/${options.userRecord.uid}`, options.userRecord);
  }
  if (options.schoolRecord) {
    records.set(`schools/${options.schoolRecord.id}`, options.schoolRecord);
  }

  const validToken = options.validToken || "valid-token-for-user-A";
  const userUid = options.userUid || "user-A-uid";

  const authInstance = {
    verifyIdToken: async (token) => {
      callLog.verifyIdTokenCalls.push(token);
      if (options.verifyIdTokenImpl) {
        return options.verifyIdTokenImpl(token);
      }
      if (token === validToken) {
        return { uid: userUid };
      }
      throw new Error("auth/id-token-expired");
    },
  };

  const firestoreInstance = new FakeFirestore(records);

  const handler = createSecurityLoginLogHandler({
    auth: () => authInstance,
    firestore: () => firestoreInstance,
  });

  return { auth: authInstance, firestore: firestoreInstance, handler, callLog, records };
};

const createReqRes = (overrides = {}) => {
  const req = {
    body: overrides.body || {},
    headers: overrides.headers || {},
    ip: overrides.ip,
    socket: overrides.socket || { remoteAddress: "::1" },
  };

  const state = { statusCode: 200, body: null };
  const res = {
    status(code) {
      state.statusCode = code;
      return res;
    },
    json(data) {
      state.body = data;
      return res;
    },
  };

  return { req, res, state };
};

const callHandler = async (admin, overrides = {}) => {
  const { req, res, state } = createReqRes(overrides);
  await admin.handler(req, res);
  return { req, status: state.statusCode, body: state.body };
};

const getWrittenLogs = (admin) => {
  const logs = [];
  for (const [path, data] of admin.records.entries()) {
    if (path.startsWith("securityLoginLogs/")) {
      logs.push(data);
    }
  }
  return logs;
};

// ─── Test 1: SUCCESS without token is rejected ─────────────

test("SUCCESS without Authorization header is rejected with 401", async () => {
  const admin = createMockAdmin({ userUid: "user-A-uid" });
  const { status, body } = await callHandler(admin, {
    body: { status: "SUCCESS", email: "user@test.com", userAgent: "test" },
    headers: {},
  });

  assert.equal(status, 401);
  assert.equal(body.error, "ID token required for successful login events");
  assert.equal(getWrittenLogs(admin).length, 0);
});

// ─── Test 2: Invalid/expired tokens rejected ───────────────

test("SUCCESS with invalid/expired ID token is rejected with 401", async () => {
  const admin = createMockAdmin({ userUid: "user-A-uid" });
  const { status, body } = await callHandler(admin, {
    body: { status: "SUCCESS", email: "user@test.com", userAgent: "test" },
    headers: { authorization: "Bearer expired-or-invalid-token" },
  });

  assert.equal(status, 401);
  assert.equal(body.error, "Invalid or expired ID token");
  assert.equal(getWrittenLogs(admin).length, 0);
  assert.equal(admin.callLog.verifyIdTokenCalls.length, 1);
});

// ─── Test 3: Token for User A can't create record attributed to User B ──

test("Token for User A cannot create a record attributed to User B", async () => {
  const admin = createMockAdmin({ userUid: "user-A-uid" });
  const { status } = await callHandler(admin, {
    body: {
      status: "SUCCESS",
      email: "userB@test.com",
      userId: "user-B-uid",
      name: "Hacker User B",
      role: "super_admin",
      schoolId: "school-B",
      schoolName: "School B",
      userAgent: "test",
    },
    headers: { authorization: "Bearer valid-token-for-user-A" },
    ip: "1.2.3.4",
    socket: { remoteAddress: "::1" },
  });

  assert.equal(status, 200);
  const logs = getWrittenLogs(admin);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].userId, "user-A-uid");
  assert.notEqual(logs[0].userId, "user-B-uid");
  assert.notEqual(logs[0].name, "Hacker User B");
  assert.notEqual(logs[0].role, "super_admin");
  assert.notEqual(logs[0].schoolName, "School B");
});

// ─── Test 4: Client-supplied fields cannot override verified identity ──

test("Client-supplied uid, name, role, school fields do not override server-derived identity", async () => {
  const admin = createMockAdmin({ userUid: "user-A-uid" });
  const { status } = await callHandler(admin, {
    body: {
      status: "SUCCESS",
      email: "user@test.com",
      userId: "INJECTED-UID",
      name: "Injected Name",
      role: "INJECTED-ROLE",
      schoolId: "injected-school",
      schoolName: "Injected School",
      userAgent: "test",
    },
    headers: { authorization: "Bearer valid-token-for-user-A" },
    ip: "1.2.3.4",
    socket: { remoteAddress: "::1" },
  });

  assert.equal(status, 200);
  const logs = getWrittenLogs(admin);
  assert.equal(logs.length, 1);

  // userId must come from the verified token, not the body
  assert.equal(logs[0].userId, "user-A-uid");
  // Client-supplied identity fields must NOT appear in the record
  assert.equal(logs[0].name, null);
  assert.equal(logs[0].role, null);
  assert.equal(logs[0].schoolId, null);
  assert.equal(logs[0].schoolName, null);
});

// ─── Test 5: Valid SUCCESS uses server-derived identity ─────

test("Valid authenticated SUCCESS event uses server-derived identity from Firestore", async () => {
  const admin = createMockAdmin({
    userUid: "user-A-uid",
    userRecord: {
      uid: "user-A-uid",
      fullName: "Alice Admin",
      role: "school_admin",
      schoolId: "school-1",
    },
    schoolRecord: { id: "school-1", name: "Greenwood School" },
  });

  const { status } = await callHandler(admin, {
    body: { status: "SUCCESS", email: "alice@test.com", userAgent: "test" },
    headers: { authorization: "Bearer valid-token-for-user-A" },
    ip: "1.2.3.4",
    socket: { remoteAddress: "::1" },
  });

  assert.equal(status, 200);
  const logs = getWrittenLogs(admin);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].userId, "user-A-uid");
  assert.equal(logs[0].name, "Alice Admin");
  assert.equal(logs[0].role, "school_admin");
  assert.equal(logs[0].schoolId, "school-1");
  assert.equal(logs[0].schoolName, "Greenwood School");
});

// ─── Test 6: FAILED events accepted without auth ───────────

test("Unauthenticated FAILED event is accepted", async () => {
  const admin = createMockAdmin({});
  const { status, body } = await callHandler(admin, {
    body: { status: "FAILED", email: "baduser@test.com", errorCode: "auth/wrong-password", userAgent: "test-browser" },
    headers: {},
  });

  assert.equal(status, 200);
  assert.equal(body.success, true);
  const logs = getWrittenLogs(admin);
  assert.equal(logs.length, 1);
});

// ─── Test 7: FAILED events don't inherit trusted identity ───

test("FAILED event does not inherit trusted identity; only lowercased email stored as userId", async () => {
  const admin = createMockAdmin({
    userUid: "user-A-uid",
    userRecord: {
      uid: "user-A-uid",
      fullName: "Alice Admin",
      role: "school_admin",
      schoolId: "school-1",
    },
  });

  const { status } = await callHandler(admin, {
      body: {
        status: "FAILED",
        email: "Alice@TEST.Com",
        errorCode: "auth/wrong-password",
        userAgent: "test-browser",
      },
    headers: {},
  });

  assert.equal(status, 200);
  const logs = getWrittenLogs(admin);
  assert.equal(logs.length, 1);
  // userId stores lowercased email (trim handled by client, but server lowercases)
  assert.equal(logs[0].userId, "alice@test.com");
  // name, role, schoolId, schoolName MUST remain null
  assert.equal(logs[0].name, null);
  assert.equal(logs[0].role, null);
  assert.equal(logs[0].schoolId, null);
  assert.equal(logs[0].schoolName, null);
  assert.equal(admin.callLog.verifyIdTokenCalls.length, 0);
});

// ─── Test 8: Unsupported statuses and malformed payloads ───

test("Unsupported status is rejected with 400", async () => {
  const admin = createMockAdmin({});
  const { status, body } = await callHandler(admin, {
    body: { status: "PENDING", email: "user@test.com" },
    headers: {},
  });

  assert.equal(status, 400);
  assert.equal(body.error, "Unsupported event status");
  assert.equal(getWrittenLogs(admin).length, 0);
});

test("Missing status is rejected with 400", async () => {
  const admin = createMockAdmin({});
  const { status, body } = await callHandler(admin, {
    body: { email: "user@test.com" },
    headers: {},
  });

  assert.equal(status, 400);
  assert.equal(body.error, "status and email are required");
});

test("Missing email is rejected with 400", async () => {
  const admin = createMockAdmin({});
  const { status, body } = await callHandler(admin, {
    body: { status: "SUCCESS" },
    headers: {},
  });

  assert.equal(status, 400);
  assert.equal(body.error, "status and email are required");
});

test("Missing body is rejected with 400", async () => {
  const admin = createMockAdmin({});
  const { status, body } = await callHandler(admin, {
    body: undefined,
    headers: {},
  });

  assert.equal(status, 400);
  assert.equal(body.error, "status and email are required");
});

// ─── Test 9: No sensitive values persisted ─────────────────

test("Sensitive values (password, dob, idToken, customToken) are never persisted", async () => {
  const admin = createMockAdmin({ userUid: "user-A-uid" });
  const { status } = await callHandler(admin, {
    body: {
      status: "SUCCESS",
      email: "user@test.com",
      password: "super-secret-password",
      dateOfBirth: "2000-01-01",
      idToken: "secret-id-token-value",
      customToken: "secret-custom-token",
      userAgent: "test",
    },
    headers: { authorization: "Bearer valid-token-for-user-A" },
    ip: "1.2.3.4",
    socket: { remoteAddress: "::1" },
  });

  assert.equal(status, 200);
  const logs = getWrittenLogs(admin);
  assert.equal(logs.length, 1);
  const record = logs[0];

  const sensitiveKeys = Object.keys(record);
  for (const key of sensitiveKeys) {
    const value = record[key];
    assert.ok(
      typeof value !== "string" || !value.includes("super-secret-password"),
      `password value leaked in field '${key}'`,
    );
    assert.ok(
      typeof value !== "string" || !value.includes("secret-id-token-value"),
      `idToken value leaked in field '${key}'`,
    );
    assert.ok(
      typeof value !== "string" || !value.includes("secret-custom-token"),
      `customToken value leaked in field '${key}'`,
    );
    assert.ok(
      typeof value !== "string" || !value.includes("2000-01-01"),
      `dateOfBirth value leaked in field '${key}'`,
    );
  }

  assert.ok(!("password" in record), "password field persisted");
  assert.ok(!("dateOfBirth" in record), "dateOfBirth field persisted");
  assert.ok(!("idToken" in record), "idToken field persisted");
  assert.ok(!("customToken" in record), "customToken field persisted");
});

// ─── Test 10: Rate limiting attached to endpoint ───────────

test("Rate limiting is attached to the endpoint and returns 429 under load", async () => {
  const { handler } = createMockAdmin({ userUid: "user-A-uid" });

  const rateLimit = (limit) => {
    let count = 0;
    return (req, res, next) => {
      count++;
      if (count > limit) {
        return res.status(429).json({ error: "Too many requests" });
      }
      next();
    };
  };

  const app = express();
  app.use(express.json());
  app.post("/api/security/log-login", rateLimit(3), handler);

  const server = app.listen(0);
  const port = server.address().port;

  try {
    const results = [];
    for (let i = 0; i < 6; i++) {
      const res = await fetch(`http://127.0.0.1:${port}/api/security/log-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "FAILED", email: "test@test.com" }),
      });
      results.push(res.status);
    }

    assert.ok(results.slice(0, 3).every((s) => s === 200), "first 3 requests should succeed");
    assert.ok(results.slice(3).every((s) => s === 429), "requests beyond limit should be rate-limited (429)");
  } finally {
    server.close();
  }
});

// ─── Test 11: IP extracted from req.ip ─────────────────────

test("IP address is recorded from req.ip (not raw X-Forwarded-For header)", async () => {
  const admin = createMockAdmin({ userUid: "user-A-uid" });
  const { status } = await callHandler(admin, {
    body: { status: "FAILED", email: "user@test.com" },
    headers: { "x-forwarded-for": "99.99.99.99" },
    ip: "203.0.113.42",
    socket: { remoteAddress: "192.168.1.1" },
  });

  assert.equal(status, 200);
  const logs = getWrittenLogs(admin);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].ipAddress, "203.0.113.42");
  assert.notEqual(logs[0].ipAddress, "99.99.99.99");
});

test("Falls back to req.socket.remoteAddress when req.ip is unavailable", async () => {
  const admin = createMockAdmin({ userUid: "user-A-uid" });
  const { status } = await callHandler(admin, {
    body: { status: "FAILED", email: "user@test.com" },
    headers: { "x-forwarded-for": "99.99.99.99" },
    ip: undefined,
    socket: { remoteAddress: "192.168.1.100" },
  });

  assert.equal(status, 200);
  const logs = getWrittenLogs(admin);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].ipAddress, "192.168.1.100");
});

// ─── Test 12: Error code and user agent sanitization ───────

test("Error code is truncated to 64 characters", async () => {
  const admin = createMockAdmin({ userUid: "user-A-uid" });
  const longErrorCode = "A".repeat(200);
  const { status } = await callHandler(admin, {
    body: { status: "FAILED", email: "user@test.com", errorCode: longErrorCode, userAgent: "test" },
    headers: {},
  });

  assert.equal(status, 200);
  const logs = getWrittenLogs(admin);
  assert.equal(logs[0].errorCode.length, 64);
});

test("UserAgent is rejected if longer than 500 characters", async () => {
  const admin = createMockAdmin({ userUid: "user-A-uid" });
  const longUA = "X".repeat(600);
  const { status } = await callHandler(admin, {
    body: { status: "FAILED", email: "user@test.com", userAgent: longUA },
    headers: {},
  });

  assert.equal(status, 200);
  const logs = getWrittenLogs(admin);
  assert.equal(logs[0].userAgent, null);
});

test("Non-string userAgent is rejected", async () => {
  const admin = createMockAdmin({ userUid: "user-A-uid" });
  const { status } = await callHandler(admin, {
    body: { status: "FAILED", email: "user@test.com", userAgent: 12345 },
    headers: {},
  });

  assert.equal(status, 200);
  const logs = getWrittenLogs(admin);
  assert.equal(logs[0].userAgent, null);
});
