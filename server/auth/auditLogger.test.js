// auditLogger.test.js
// Unit tests for auditLogger.js - event builder and schema validation.
import test from "node:test";
import assert from "node:assert/strict";
import buildAuditEvent, {
  ROLE_SCHOOL_ADMIN,
  ROLE_SUPER_ADMIN,
  ALLOWED_ROLES,
  ALLOWED_SCOPES,
  ALLOWED_EVENT_TYPES,
} from "./auditLogger.js";
import { recordAiAudit } from "./auditLogger.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const baseSchoolAdminEvent = {
  requestId: "ai_abc123_def456",
  eventType: "tool_execution",
  userId: "firebase_uid_123",
  role: ROLE_SCHOOL_ADMIN,
  schoolId: "school-1",
  scope: "single_school",
  action: "getStudent",
  success: true,
  timestampMs: Date.now(),
};

const baseSuperAdminGlobalEvent = {
  requestId: "ai_xyz789_ghi012",
  eventType: "tool_execution",
  userId: "firebase_uid_456",
  role: ROLE_SUPER_ADMIN,
  schoolId: null,
  scope: "global",
  action: "getSchoolAdministrativeSummary",
  success: true,
  timestampMs: Date.now(),
};

const baseSuperAdminSelectedEvent = {
  requestId: "ai_xyz789_jkl345",
  eventType: "tool_execution",
  userId: "firebase_uid_456",
  role: ROLE_SUPER_ADMIN,
  schoolId: "school-2",
  scope: "selected_school",
  action: "getStudent",
  success: true,
  timestampMs: Date.now(),
};

// ---------------------------------------------------------------------------
// Valid event tests
// ---------------------------------------------------------------------------

test("auditLogger: valid School Admin event is accepted", async (t) => {
  const event = buildAuditEvent(baseSchoolAdminEvent);
  assert.strictEqual(event.role, ROLE_SCHOOL_ADMIN);
  assert.strictEqual(event.scope, "single_school");
  assert.strictEqual(event.schoolId, "school-1");
  assert.strictEqual(event.success, true);
  assert.strictEqual(event.requestId, "ai_abc123_def456");
});

test("auditLogger: valid Super Admin global event is accepted", async (t) => {
  const event = buildAuditEvent(baseSuperAdminGlobalEvent);
  assert.strictEqual(event.role, ROLE_SUPER_ADMIN);
  assert.strictEqual(event.scope, "global");
  assert.strictEqual(event.schoolId, null);
  assert.strictEqual(event.success, true);
});

test("auditLogger: valid Super Admin selected-school event is accepted", async (t) => {
  const event = buildAuditEvent(baseSuperAdminSelectedEvent);
  assert.strictEqual(event.role, ROLE_SUPER_ADMIN);
  assert.strictEqual(event.scope, "selected_school");
  assert.strictEqual(event.schoolId, "school-2");
  assert.strictEqual(event.success, true);
});

// ---------------------------------------------------------------------------
// Invalid role tests
// ---------------------------------------------------------------------------

test("auditLogger: invalid role is rejected", async (t) => {
  const event = { ...baseSchoolAdminEvent, role: "teacher" };
  assert.throws(() => buildAuditEvent(event), /Invalid audit role/);
});

test("auditLogger: uppercase SCHOOL_ADMIN is rejected", async (t) => {
  const event = { ...baseSchoolAdminEvent, role: "SCHOOL_ADMIN" };
  assert.throws(() => buildAuditEvent(event), /Invalid audit role/);
});

test("auditLogger: uppercase SUPER_ADMIN is rejected", async (t) => {
  const event = { ...baseSuperAdminGlobalEvent, role: "SUPER_ADMIN" };
  assert.throws(() => buildAuditEvent(event), /Invalid audit role/);
});

test("auditLogger: unknown role is rejected", async (t) => {
  const event = { ...baseSchoolAdminEvent, role: "parent" };
  assert.throws(() => buildAuditEvent(event), /Invalid audit role/);
});

// ---------------------------------------------------------------------------
// Invalid scope tests
// ---------------------------------------------------------------------------

test("auditLogger: invalid scope is rejected", async (t) => {
  const event = { ...baseSchoolAdminEvent, scope: "global" };
  assert.throws(() => buildAuditEvent(event), /School Admin must use scope/);
});

test("auditLogger: Super Admin single_school scope is rejected", async (t) => {
  const event = { ...baseSuperAdminGlobalEvent, scope: "single_school" };
  assert.throws(() => buildAuditEvent(event), /Super Admin cannot use scope/);
});

// ---------------------------------------------------------------------------
// Invalid role/scope combinations
// ---------------------------------------------------------------------------

test("auditLogger: Super Admin global with non-null schoolId is rejected", async (t) => {
  const event = { ...baseSuperAdminGlobalEvent, schoolId: "school-1" };
  assert.throws(() => buildAuditEvent(event), /Super Admin global scope requires schoolId null/);
});

test("auditLogger: Super Admin selected_school with missing schoolId is rejected", async (t) => {
  const event = { ...baseSuperAdminSelectedEvent, schoolId: null };
  assert.throws(() => buildAuditEvent(event), /Super Admin selected_school requires/);
});

// ---------------------------------------------------------------------------
// Missing required field tests
// ---------------------------------------------------------------------------

test("auditLogger: missing userId is rejected", async (t) => {
  const event = { ...baseSchoolAdminEvent, userId: undefined };
  assert.throws(() => buildAuditEvent(event), /Required audit field "userId"/);
});

test("auditLogger: missing requestId is rejected", async (t) => {
  const event = { ...baseSchoolAdminEvent, requestId: undefined };
  assert.throws(() => buildAuditEvent(event), /Required audit field "requestId"/);
});

test("auditLogger: missing schoolId for school-scoped event is rejected", async (t) => {
  const event = { ...baseSchoolAdminEvent, schoolId: null };
  assert.throws(() => buildAuditEvent(event), /School Admin requires a valid schoolId/);
});

test("auditLogger: empty schoolId for school-scoped event is rejected", async (t) => {
  const event = { ...baseSchoolAdminEvent, schoolId: "" };
  assert.throws(() => buildAuditEvent(event), /School Admin requires a valid schoolId/);
});

test("auditLogger: whitespace schoolId for school-scoped event is rejected", async (t) => {
  const event = { ...baseSchoolAdminEvent, schoolId: "   " };
  assert.throws(() => buildAuditEvent(event), /School Admin requires a valid schoolId/);
});

test("auditLogger: non-string schoolId for school-scoped event is rejected", async (t) => {
  const event = { ...baseSchoolAdminEvent, schoolId: 12345 };
  assert.throws(() => buildAuditEvent(event), /School Admin requires a valid schoolId/);
});

// ---------------------------------------------------------------------------
// Privacy and unapproved field tests
// ---------------------------------------------------------------------------

test("auditLogger: unapproved field is rejected", async (t) => {
  const event = { ...baseSchoolAdminEvent, unauthorizedField: "secret" };
  assert.throws(() => buildAuditEvent(event), /not in the allowed field list/);
});

test("auditLogger: token field cannot enter audit event", async (t) => {
  const event = { ...baseSchoolAdminEvent, idToken: "fake-token-123" };
  assert.throws(() => buildAuditEvent(event), /prohibited pattern/);
});

test("auditLogger: phone field cannot enter audit event", async (t) => {
  const event = { ...baseSchoolAdminEvent, guardianPhone: "+233123456789" };
  assert.throws(() => buildAuditEvent(event), /prohibited pattern/);
});

test("auditLogger: prompt field cannot enter audit event", async (t) => {
  const event = { ...baseSchoolAdminEvent, prompt: "What is the student's grade?" };
  assert.throws(() => buildAuditEvent(event), /prohibited pattern/);
});

test("auditLogger: AI response field cannot enter audit event", async (t) => {
  const event = { ...baseSchoolAdminEvent, rawContent: "The answer is 42" };
  assert.throws(() => buildAuditEvent(event), /prohibited pattern/);
});

test("auditLogger: full tool arguments cannot enter audit event", async (t) => {
  const event = { ...baseSchoolAdminEvent, arguments: { studentId: "s1", guardianPhone: "123" } };
  assert.throws(() => buildAuditEvent(event), /prohibited pattern/);
});

test("auditLogger: full tool result cannot enter audit event", async (t) => {
  const event = { ...baseSchoolAdminEvent, result: { name: "John", balance: 500 } };
  assert.throws(() => buildAuditEvent(event), /prohibited pattern/);
});

test("auditLogger: financial amount field cannot enter audit event", async (t) => {
  const event = { ...baseSchoolAdminEvent, balance: 500 };
  assert.throws(() => buildAuditEvent(event), /prohibited pattern/);
});

test("auditLogger: fee field cannot enter audit event", async (t) => {
  const event = { ...baseSchoolAdminEvent, feeAmount: 500 };
  assert.throws(() => buildAuditEvent(event), /prohibited pattern/);
});

// ---------------------------------------------------------------------------
// Optional field tests
// ---------------------------------------------------------------------------

test("auditLogger: optional errorCode is accepted", async (t) => {
  const event = { ...baseSchoolAdminEvent, errorCode: "AUTH_FAILED", success: false };
  const result = buildAuditEvent(event);
  assert.strictEqual(result.errorCode, "AUTH_FAILED");
  assert.strictEqual(result.success, false);
});

test("auditLogger: optional durationMs is accepted", async (t) => {
  const event = { ...baseSchoolAdminEvent, durationMs: 120 };
  const result = buildAuditEvent(event);
  assert.strictEqual(result.durationMs, 120);
});

test("auditLogger: invalid durationMs is rejected", async (t) => {
  const event = { ...baseSchoolAdminEvent, durationMs: "not-a-number" };
  assert.throws(() => buildAuditEvent(event), /durationMs must be a finite number/);
});

// ---------------------------------------------------------------------------
// Returned object structure tests
// ---------------------------------------------------------------------------

test("auditLogger: returned event contains only allowed fields", async (t) => {
  const event = { ...baseSchoolAdminEvent, durationMs: 100 };
  const result = buildAuditEvent(event);
  const keys = Object.keys(result).sort();
  assert.deepStrictEqual(keys, [
    "action",
    "durationMs",
    "eventType",
    "requestId",
    "role",
    "schoolId",
    "scope",
    "success",
    "timestampMs",
    "userId",
  ]);
});

test("auditLogger: input object is not mutated", async (t) => {
  const input = { ...baseSchoolAdminEvent };
  buildAuditEvent(input);
  assert.deepStrictEqual(input, baseSchoolAdminEvent);
});

// ---------------------------------------------------------------------------
// Allowed constants tests
// ---------------------------------------------------------------------------

test("auditLogger: ALLOWED_ROLES contains expected values", async (t) => {
  assert.deepStrictEqual([...ALLOWED_ROLES].sort(), ["school_admin", "super_admin"]);
});

test("auditLogger: ALLOWED_SCOPES contains expected values", async (t) => {
  assert.deepStrictEqual([...ALLOWED_SCOPES].sort(), ["global", "selected_school", "single_school"]);
});

test("auditLogger: ALLOWED_EVENT_TYPES contains expected values", async (t) => {
  assert.deepStrictEqual([...ALLOWED_EVENT_TYPES].sort(), [
    "auth_failure",
    "authz_failure",
    "authz_success",
    "sms_draft_created",
    "tool_execution",
  ]);
});

test("auditLogger: ROLE_SCHOOL_ADMIN is lowercase", async (t) => {
  assert.strictEqual(ROLE_SCHOOL_ADMIN, "school_admin");
});

test("auditLogger: ROLE_SUPER_ADMIN is lowercase", async (t) => {
  assert.strictEqual(ROLE_SUPER_ADMIN, "super_admin");
});

// ---------------------------------------------------------------------------
// recordAiAudit tests
// ---------------------------------------------------------------------------

test("auditLogger: recordAiAudit writes valid event to Firestore", async (t) => {
  const writtenDocs = [];
  const mockFirestore = {
    collection: (name) => {
      assert.strictEqual(name, "ai_audit_logs");
      return {
        add: async (doc) => {
          writtenDocs.push(doc);
          return { id: "doc-123" };
        },
      }
    },
  };

  const event = buildAuditEvent(baseSchoolAdminEvent);
  const result = await recordAiAudit(event, { firestore: mockFirestore });

  assert.strictEqual(result.success, true);
  assert.strictEqual(writtenDocs.length, 1);
  assert.strictEqual(writtenDocs[0].userId, "firebase_uid_123");
  assert.strictEqual(writtenDocs[0].role, ROLE_SCHOOL_ADMIN);
  assert.strictEqual(writtenDocs[0].schoolId, "school-1");
  assert.strictEqual(writtenDocs[0].scope, "single_school");
  assert.strictEqual(writtenDocs[0].action, "getStudent");
  assert.strictEqual(writtenDocs[0].success, true);
  assert.strictEqual(writtenDocs[0].requestId, "ai_abc123_def456");
});

test("auditLogger: recordAiAudit includes server timestamp", async (t) => {
  const writtenDocs = [];
  const mockFirestore = {
    collection: () => ({
      add: async (doc) => {
        writtenDocs.push(doc);
        return { id: "doc-123" };
      },
    }),
  };

  const event = buildAuditEvent(baseSchoolAdminEvent);
  await recordAiAudit(event, { firestore: mockFirestore });

  assert.ok(writtenDocs[0].createdAt);
  assert.strictEqual(
    writtenDocs[0].createdAt.toString(),
    "[object Object]",
    "createdAt should be a Firestore server timestamp object"
  );
});

test("auditLogger: recordAiAudit returns failure on Firestore error", async (t) => {
  const mockFirestore = {
    collection: () => ({
      add: async () => {
        throw new Error("Firestore connection lost");
      },
    }),
  };

  const event = buildAuditEvent(baseSchoolAdminEvent);
  const result = await recordAiAudit(event, { firestore: mockFirestore });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.errorCode, "AUDIT_WRITE_FAILED");
});

test("auditLogger: recordAiAudit does not throw on Firestore failure", async (t) => {
  const mockFirestore = {
    collection: () => ({
      add: async () => {
        throw new Error("Firestore connection lost");
      },
    }),
  };

  const event = buildAuditEvent(baseSchoolAdminEvent);
  // Should not throw
  const result = await recordAiAudit(event, { firestore: mockFirestore });
  assert.ok(result);
  assert.strictEqual(result.success, false);
});

test("auditLogger: recordAiAudit does not expose raw Firestore error", async (t) => {
  const mockFirestore = {
    collection: () => ({
      add: async () => {
        throw new Error("Firestore connection lost: internal details here");
      },
    }),
  };

  const event = buildAuditEvent(baseSchoolAdminEvent);
  const result = await recordAiAudit(event, { firestore: mockFirestore });

  assert.strictEqual(result.errorCode, "AUDIT_WRITE_FAILED");
  assert.ok(!result.errorCode.includes("Firestore"));
  assert.ok(!result.errorCode.includes("internal details"));
});

test("auditLogger: recordAiAudit uses default firestore when not provided", async (t) => {
  // Should not crash even without firestore dependency
  const event = buildAuditEvent(baseSchoolAdminEvent);
  const result = await recordAiAudit(event);
  // admin.firestore() may or may not be initialized; either way no throw
  assert.ok(result);
});

test("auditLogger: recordAiAudit cannot persist unapproved fields", async (t) => {
  // Build a valid event, then try to inject an unapproved field via recordAiAudit
  // by directly calling recordAiAudit with an event that has extra fields.
  // Since buildAuditEvent strips unapproved fields, recordAiAudit should only
  // receive already-sanitized events. But recordAiAudit itself should not
  // add any fields beyond the event + createdAt.
  const mockFirestore = {
    collection: () => ({
      add: async (doc) => {
        // Verify no extra fields beyond the allowed ones + createdAt
        const keys = Object.keys(doc);
        const allowedKeys = [
          "requestId", "eventType", "userId", "role", "schoolId",
          "scope", "action", "success", "timestampMs",
          "errorCode", "durationMs", "createdAt",
        ];
        for (const key of keys) {
          assert.ok(
            allowedKeys.includes(key),
            `Unexpected field "${key}" persisted to audit log`
          );
        }
        return { id: "doc-123" };
      },
    }),
  };

  const event = buildAuditEvent(baseSchoolAdminEvent);
  await recordAiAudit(event, { firestore: mockFirestore });
});

test("auditLogger: recordAiAudit persists only allowed event fields", async (t) => {
  const persistedDoc = {};
  const mockFirestore = {
    collection: () => ({
      add: async (doc) => {
        Object.assign(persistedDoc, doc);
        return { id: "doc-123" };
      },
    }),
  };

  const event = buildAuditEvent(baseSchoolAdminEvent);
  await recordAiAudit(event, { firestore: mockFirestore });

  // Verify no sensitive fields leaked
  assert.ok(!persistedDoc.token);
  assert.ok(!persistedDoc.idToken);
  assert.ok(!persistedDoc.guardianPhone);
  assert.ok(!persistedDoc.prompt);
  assert.ok(!persistedDoc.rawContent);
  assert.ok(!persistedDoc.response);
  assert.ok(!persistedDoc.arguments);
  assert.ok(!persistedDoc.result);
  assert.ok(!persistedDoc.balance);
  assert.ok(!persistedDoc.amount);
  assert.ok(!persistedDoc.fee);
});

test("auditLogger: recordAiAudit with null schoolId for Super Admin global", async (t) => {
  const writtenDocs = [];
  const mockFirestore = {
    collection: () => ({
      add: async (doc) => {
        writtenDocs.push(doc);
        return { id: "doc-123" };
      },
    }),
  };

  const event = buildAuditEvent(baseSuperAdminGlobalEvent);
  const result = await recordAiAudit(event, { firestore: mockFirestore });

  assert.strictEqual(result.success, true);
  assert.strictEqual(writtenDocs[0].schoolId, null);
  assert.strictEqual(writtenDocs[0].scope, "global");
});

test("auditLogger: recordAiAudit default export works without dependencies", async (t) => {
  // Should not throw even without firebase-admin initialized
  const event = buildAuditEvent(baseSchoolAdminEvent);
  const result = await recordAiAudit(event);
  assert.ok(result);
  assert.strictEqual(typeof result.success, "boolean");
});

// ---------------------------------------------------------------------------
// recordAiAudit security tests (raw object rejection)
// ---------------------------------------------------------------------------

test("auditLogger: recordAiAudit rejects raw object containing prompt", async (t) => {
  const mockFirestore = {
    collection: () => ({
      add: async () => {
        throw new Error("Should not have been called");
      },
    }),
  };

  const rawObject = { ...baseSchoolAdminEvent, prompt: "What is the grade?" };
  const result = await recordAiAudit(rawObject, { firestore: mockFirestore });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.errorCode, "INVALID_EVENT");
});

test("auditLogger: recordAiAudit rejects raw object containing phone", async (t) => {
  const mockFirestore = {
    collection: () => ({
      add: async () => {
        throw new Error("Should not have been called");
      },
    }),
  };

  const rawObject = { ...baseSchoolAdminEvent, guardianPhone: "+233123456789" };
  const result = await recordAiAudit(rawObject, { firestore: mockFirestore });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.errorCode, "INVALID_EVENT");
});

test("auditLogger: recordAiAudit rejects raw object containing guardianPhone", async (t) => {
  const mockFirestore = {
    collection: () => ({
      add: async () => {
        throw new Error("Should not have been called");
      },
    }),
  };

  const rawObject = { ...baseSchoolAdminEvent, guardianPhone: "+233123456789" };
  const result = await recordAiAudit(rawObject, { firestore: mockFirestore });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.errorCode, "INVALID_EVENT");
});

test("auditLogger: recordAiAudit rejects raw object containing studentRecord", async (t) => {
  const mockFirestore = {
    collection: () => ({
      add: async () => {
        throw new Error("Should not have been called");
      },
    }),
  };

  const rawObject = { ...baseSchoolAdminEvent, studentRecord: { name: "John", id: "s1" } };
  const result = await recordAiAudit(rawObject, { firestore: mockFirestore });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.errorCode, "INVALID_EVENT");
});

test("auditLogger: recordAiAudit rejects raw object containing token", async (t) => {
  const mockFirestore = {
    collection: () => ({
      add: async () => {
        throw new Error("Should not have been called");
      },
    }),
  };

  const rawObject = { ...baseSchoolAdminEvent, idToken: "fake-token-123" };
  const result = await recordAiAudit(rawObject, { firestore: mockFirestore });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.errorCode, "INVALID_EVENT");
});

test("auditLogger: recordAiAudit rejects raw object with arbitrary unapproved fields", async (t) => {
  const mockFirestore = {
    collection: () => ({
      add: async () => {
        throw new Error("Should not have been called");
      },
    }),
  };

  const rawObject = { ...baseSchoolAdminEvent, secretField: "classified" };
  const result = await recordAiAudit(rawObject, { firestore: mockFirestore });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.errorCode, "INVALID_EVENT");
});

test("auditLogger: recordAiAudit rejects invalid role", async (t) => {
  const mockFirestore = {
    collection: () => ({
      add: async () => {
        throw new Error("Should not have been called");
      },
    }),
  };

  const rawObject = { ...baseSchoolAdminEvent, role: "teacher" };
  const result = await recordAiAudit(rawObject, { firestore: mockFirestore });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.errorCode, "INVALID_EVENT");
});

test("auditLogger: recordAiAudit rejects invalid scope", async (t) => {
  const mockFirestore = {
    collection: () => ({
      add: async () => {
        throw new Error("Should not have been called");
      },
    }),
  };

  const rawObject = { ...baseSchoolAdminEvent, scope: "global" };
  const result = await recordAiAudit(rawObject, { firestore: mockFirestore });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.errorCode, "INVALID_EVENT");
});

test("auditLogger: recordAiAudit rejects invalid role/scope combination", async (t) => {
  const mockFirestore = {
    collection: () => ({
      add: async () => {
        throw new Error("Should not have been called");
      },
    }),
  };

  const rawObject = { ...baseSuperAdminGlobalEvent, scope: "single_school" };
  const result = await recordAiAudit(rawObject, { firestore: mockFirestore });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.errorCode, "INVALID_EVENT");
});

test("auditLogger: recordAiAudit rejects missing required fields", async (t) => {
  const mockFirestore = {
    collection: () => ({
      add: async () => {
        throw new Error("Should not have been called");
      },
    }),
  };

  const rawObject = { ...baseSchoolAdminEvent, userId: undefined };
  const result = await recordAiAudit(rawObject, { firestore: mockFirestore });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.errorCode, "INVALID_EVENT");
});

test("auditLogger: recordAiAudit rejects event modified after buildAuditEvent", async (t) => {
  const mockFirestore = {
    collection: () => ({
      add: async () => {
        throw new Error("Should not have been called");
      },
    }),
  };

  const validEvent = buildAuditEvent(baseSchoolAdminEvent);
  const modifiedEvent = { ...validEvent, prompt: "Injected after build" };
  const result = await recordAiAudit(modifiedEvent, { firestore: mockFirestore });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.errorCode, "INVALID_EVENT");
});

test("auditLogger: recordAiAudit rejects unexpected nested objects", async (t) => {
  const mockFirestore = {
    collection: () => ({
      add: async () => {
        throw new Error("Should not have been called");
      },
    }),
  };

  const rawObject = {
    ...baseSchoolAdminEvent,
    metadata: { nested: { prompt: "secret" } },
  };
  const result = await recordAiAudit(rawObject, { firestore: mockFirestore });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.errorCode, "INVALID_EVENT");
});

test("auditLogger: recordAiAudit rejects invalid timestamp", async (t) => {
  const mockFirestore = {
    collection: () => ({
      add: async () => {
        throw new Error("Should not have been called");
      },
    }),
  };

  const rawObject = { ...baseSchoolAdminEvent, timestampMs: "not-a-number" };
  const result = await recordAiAudit(rawObject, { firestore: mockFirestore });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.errorCode, "INVALID_EVENT");
});

test("auditLogger: recordAiAudit rejects invalid duration", async (t) => {
  const mockFirestore = {
    collection: () => ({
      add: async () => {
        throw new Error("Should not have been called");
      },
    }),
  };

  const rawObject = { ...baseSchoolAdminEvent, durationMs: "not-a-number" };
  const result = await recordAiAudit(rawObject, { firestore: mockFirestore });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.errorCode, "INVALID_EVENT");
});

test("auditLogger: recordAiAudit invalid events never trigger Firestore writes", async (t) => {
  let writeCalled = false;
  const mockFirestore = {
    collection: () => ({
      add: async () => {
        writeCalled = true;
        return { id: "doc-123" };
      },
    }),
  };

  const rawObject = { ...baseSchoolAdminEvent, prompt: "secret" };
  const result = await recordAiAudit(rawObject, { firestore: mockFirestore });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.errorCode, "INVALID_EVENT");
  assert.strictEqual(writeCalled, false);
});

test("auditLogger: recordAiAudit valid events still persist successfully", async (t) => {
  const writtenDocs = [];
  const mockFirestore = {
    collection: () => ({
      add: async (doc) => {
        writtenDocs.push(doc);
        return { id: "doc-123" };
      },
    }),
  };

  const event = buildAuditEvent(baseSchoolAdminEvent);
  const result = await recordAiAudit(event, { firestore: mockFirestore });

  assert.strictEqual(result.success, true);
  assert.strictEqual(writtenDocs.length, 1);
});

test("auditLogger: recordAiAudit validation failures never expose raw sensitive values", async (t) => {
  const mockFirestore = {
    collection: () => ({
      add: async () => {
        throw new Error("Should not have been called");
      },
    }),
  };

  const rawObject = {
    ...baseSchoolAdminEvent,
    prompt: "Sensitive prompt content",
    guardianPhone: "+233123456789",
    token: "secret-token-xyz",
  };
  const result = await recordAiAudit(rawObject, { firestore: mockFirestore });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.errorCode, "INVALID_EVENT");
  // Verify no sensitive values leaked in error code
  assert.ok(!result.errorCode.includes("prompt"));
  assert.ok(!result.errorCode.includes("guardianPhone"));
  assert.ok(!result.errorCode.includes("token"));
  assert.ok(!result.errorCode.includes("Sensitive"));
  assert.ok(!result.errorCode.includes("+233123456789"));
  assert.ok(!result.errorCode.includes("secret-token-xyz"));
});

test("auditLogger: recordAiAudit existing Firestore failure handling still works", async (t) => {
  const mockFirestore = {
    collection: () => ({
      add: async () => {
        throw new Error("Firestore connection lost");
      },
    }),
  };

  const event = buildAuditEvent(baseSchoolAdminEvent);
  const result = await recordAiAudit(event, { firestore: mockFirestore });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.errorCode, "AUDIT_WRITE_FAILED");
});

test("auditLogger: recordAiAudit default export works without dependencies", async (t) => {
  // Should not throw even without firebase-admin initialized
  const event = buildAuditEvent(baseSchoolAdminEvent);
  const result = await recordAiAudit(event);
  assert.ok(result);
  assert.strictEqual(typeof result.success, "boolean");
});
