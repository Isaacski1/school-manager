// auditLogger.js
// Audit event builder for School Manager AI Assistant.
// Constructs audit events using an explicitly approved field allowlist.
// Persists validated audit events to Firestore.

import admin from "firebase-admin";

const ROLE_SCHOOL_ADMIN = "school_admin";
const ROLE_SUPER_ADMIN = "super_admin";

const ALLOWED_ROLES = Object.freeze([ROLE_SCHOOL_ADMIN, ROLE_SUPER_ADMIN]);
const ALLOWED_SCOPES = Object.freeze(["single_school", "selected_school", "global"]);
const ALLOWED_EVENT_TYPES = Object.freeze([
  "auth_failure",
  "authz_success",
  "authz_failure",
  "tool_execution",
  "sms_draft_created",
]);

const REQUIRED_FIELDS = Object.freeze([
  "requestId",
  "eventType",
  "userId",
  "role",
  "schoolId",
  "scope",
  "action",
  "success",
  "timestampMs",
]);

const OPTIONAL_FIELDS = Object.freeze(["errorCode", "durationMs"]);

// Fields that are strictly prohibited from audit events (privacy protection).
const FORBIDDEN_FIELD_PATTERNS = Object.freeze([
  /token/i,
  /password/i,
  /credential/i,
  /secret/i,
  /key/i,
  /phone/i,
  /guardian/i,
  /studentName/i,
  /fullName/i,
  /grade/i,
  /attendance/i,
  /prompt/i,
  /response/i,
  /raw/i,
  /arguments/i,
  /result/i,
  /balance/i,
  /amount/i,
  /fee/i,
]);

// Fields explicitly allowed in audit events.
const ALLOWED_FIELD_NAMES = Object.freeze([
  "requestId",
  "eventType",
  "userId",
  "role",
  "schoolId",
  "scope",
  "action",
  "success",
  "timestampMs",
  "errorCode",
  "durationMs",
]);

/**
 * Checks whether a field name contains any prohibited pattern.
 * @param {string} fieldName
 * @returns {boolean}
 */
function containsProhibitedPattern(fieldName) {
  return FORBIDDEN_FIELD_PATTERNS.some((pattern) => pattern.test(fieldName));
}

/**
 * Builds an audit event object using only explicitly allowed fields.
 * Rejects any input containing prohibited patterns or unapproved fields.
 *
 * @param {object} input - Raw input object to build audit event from
 * @returns {object} Sanitized audit event object
 * @throws {Error} If required fields are missing, invalid, or prohibited fields are present
 */
function buildAuditEvent(input = {}) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Audit event input must be a non-null object");
  }

  // Reject any input containing prohibited field patterns (privacy protection).
  const inputKeys = Object.keys(input);
  for (const key of inputKeys) {
    if (containsProhibitedPattern(key)) {
      throw new Error(`Audit event field "${key}" contains prohibited pattern`);
    }
  }

  // Reject any input fields not in the explicit allowlist.
  for (const key of inputKeys) {
    if (!ALLOWED_FIELD_NAMES.includes(key)) {
      throw new Error(`Audit event field "${key}" is not in the allowed field list`);
    }
  }

  // Validate role FIRST so invalid role errors take precedence.
  if (!ALLOWED_ROLES.includes(input.role)) {
    throw new Error(`Invalid audit role: "${input.role}"`);
  }

  // Validate scope.
  if (!ALLOWED_SCOPES.includes(input.scope)) {
    throw new Error(`Invalid audit scope: "${input.scope}"`);
  }

  // Validate event type.
  if (!ALLOWED_EVENT_TYPES.includes(input.eventType)) {
    throw new Error(`Invalid audit event type: "${input.eventType}"`);
  }

  // Validate success is a boolean.
  if (typeof input.success !== "boolean") {
    throw new Error("Audit field 'success' must be a boolean");
  }

  // Validate timestampMs is a number.
  if (typeof input.timestampMs !== "number" || !Number.isFinite(input.timestampMs)) {
    throw new Error("Audit field 'timestampMs' must be a finite number");
  }

  // Role/scope validation rules.
  if (input.role === ROLE_SCHOOL_ADMIN) {
    if (input.scope !== "single_school") {
      throw new Error("School Admin must use scope 'single_school'");
    }
    if (
      typeof input.schoolId !== "string" ||
      input.schoolId.trim() === ""
    ) {
      throw new Error("School Admin requires a valid schoolId");
    }
  }

  if (input.role === ROLE_SUPER_ADMIN) {
    if (input.scope === "single_school") {
      throw new Error("Super Admin cannot use scope 'single_school'");
    }
    if (
      input.scope === "global" &&
      input.schoolId !== null &&
      input.schoolId !== undefined
    ) {
      throw new Error("Super Admin global scope requires schoolId null");
    }
    if (
      input.scope === "selected_school" &&
      (typeof input.schoolId !== "string" || input.schoolId.trim() === "")
    ) {
      throw new Error("Super Admin selected_school requires a valid schoolId");
    }
  }

  // Validate required fields AFTER role validation.
  // schoolId may be null for Super Admin global scope.
  for (const field of REQUIRED_FIELDS) {
    if (field === "schoolId" && input.role === ROLE_SUPER_ADMIN) {
      continue;
    }
    if (
      input[field] === undefined ||
      input[field] === null ||
      (typeof input[field] === "string" && input[field].trim() === "")
    ) {
      throw new Error(`Required audit field "${field}" is missing or empty`);
    }
  }

  // Build the sanitized audit event with only allowed fields.
  const event = {
    requestId: input.requestId,
    eventType: input.eventType,
    userId: input.userId,
    role: input.role,
    schoolId:
      input.role === ROLE_SUPER_ADMIN && input.scope === "global"
        ? null
        : input.schoolId,
    scope: input.scope,
    action: input.action,
    success: input.success,
    timestampMs: input.timestampMs,
  };

  if (input.errorCode !== undefined && input.errorCode !== null) {
    event.errorCode = String(input.errorCode).slice(0, 64);
  }

  if (input.durationMs !== undefined && input.durationMs !== null) {
    if (typeof input.durationMs !== "number" || !Number.isFinite(input.durationMs)) {
      throw new Error("durationMs must be a finite number");
    }
    event.durationMs = input.durationMs;
  }

  return event;
}

/**
 * Persists an audit event to Firestore.
 *
 * Validates the event through buildAuditEvent() before persisting,
 * ensuring only authorized fields and values are written. Never
 * persists raw caller-provided objects directly.
 *
 * @param {object} event - Audit event data (validated via buildAuditEvent internally)
 * @param {object} [dependencies] - Optional dependencies for testing
 * @param {object} [dependencies.firestore] - Firestore instance (defaults to admin.firestore())
 * @returns {object} { success: boolean, errorCode?: string }
 */
async function recordAiAudit(event, dependencies = {}) {
  // Step 1: Validate the event through buildAuditEvent before persisting.
  // This rejects null, arrays, primitives, invalid roles/scopes, missing
  // required fields, prohibited field names, and any other invalid input.
  let validatedEvent;
  try {
    validatedEvent = buildAuditEvent(event);
  } catch (validationError) {
    // Do not log sensitive event data; return a generic failure result.
    return { success: false, errorCode: "INVALID_EVENT" };
  }

  // Step 2: Get Firestore instance (or mock for testing).
  let db;
  try {
    db = dependencies.firestore || admin.firestore();
  } catch (error) {
    console.warn("Failed to initialize Firestore", error?.message || "Unknown error");
    return { success: false, errorCode: "AUDIT_WRITE_FAILED" };
  }

  // Step 3: Persist ONLY the validated event (never the original input).
  try {
    await db.collection("ai_audit_logs").add({
      ...validatedEvent,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { success: true };
  } catch (error) {
    console.warn("Failed to record AI audit log", error?.message || "Unknown error");
    return { success: false, errorCode: "AUDIT_WRITE_FAILED" };
  }
}

export { buildAuditEvent, recordAiAudit, ROLE_SCHOOL_ADMIN, ROLE_SUPER_ADMIN, ALLOWED_ROLES, ALLOWED_SCOPES, ALLOWED_EVENT_TYPES };
export default buildAuditEvent;
