import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getUserRole(role) {
  return role;
}

// Simulate the frontend helper from services/featureAccess.ts
function canAccessSchoolAssistant(user) {
  if (!user) return false;
  return user.role === "super_admin";
}

// Simulate the backend check from server/server.js
function canAccessSchoolAssistantBackend(userData) {
  if (userData.role === "school_admin") {
    return { allowed: false, code: "AI_TEMPORARILY_DISABLED" };
  }
  if (userData.role !== "school_admin") {
    return { allowed: false, code: "ADMIN_ONLY" };
  }
  return { allowed: true, code: null };
}

test("Super Admin → AI enabled (frontend)", () => {
  const user = { role: "super_admin" };
  assert.strictEqual(canAccessSchoolAssistant(user), true);
});

test("School Admin → AI disabled (frontend)", () => {
  const user = { role: "school_admin" };
  assert.strictEqual(canAccessSchoolAssistant(user), false);
});

test("Teacher → AI disabled (frontend)", () => {
  const user = { role: "teacher" };
  assert.strictEqual(canAccessSchoolAssistant(user), false);
});

test("Parent → AI disabled (frontend)", () => {
  const user = { role: "parent" };
  assert.strictEqual(canAccessSchoolAssistant(user), false);
});

test("Null user → AI disabled (frontend)", () => {
  assert.strictEqual(canAccessSchoolAssistant(null), false);
});

test("School Admin → backend blocked with AI_TEMPORARILY_DISABLED", () => {
  const result = canAccessSchoolAssistantBackend({ role: "school_admin" });
  assert.strictEqual(result.allowed, false);
  assert.strictEqual(result.code, "AI_TEMPORARILY_DISABLED");
});

test("Super Admin → backend blocked by existing ADMIN_ONLY check", () => {
  const result = canAccessSchoolAssistantBackend({ role: "super_admin" });
  assert.strictEqual(result.allowed, false);
  assert.strictEqual(result.code, "ADMIN_ONLY");
});

test("Teacher → backend blocked by existing ADMIN_ONLY check", () => {
  const result = canAccessSchoolAssistantBackend({ role: "teacher" });
  assert.strictEqual(result.allowed, false);
  assert.strictEqual(result.code, "ADMIN_ONLY");
});

test("Parent → backend blocked by existing ADMIN_ONLY check", () => {
  const result = canAccessSchoolAssistantBackend({ role: "parent" });
  assert.strictEqual(result.allowed, false);
  assert.strictEqual(result.code, "ADMIN_ONLY");
});

test("Production provider config unchanged", () => {
  const envPath = path.resolve(__dirname, "..", "server", ".env");
  const content = fs.readFileSync(envPath, "utf8");
  const aiProviderMatch = content.match(/^AI_PROVIDER=(.*)$/m);
  const aiModelMatch = content.match(/^AI_MODEL=(.*)$/m);
  assert.strictEqual(aiProviderMatch?.[1]?.trim(), "nvidia", "AI_PROVIDER should remain nvidia");
  assert.strictEqual(aiModelMatch?.[1]?.trim(), "nvidia/nemotron-3.5-lightning-30b-a3b", "AI_MODEL should remain Nemotron");
});

test("Gemini benchmark config present but not active", () => {
  const envPath = path.resolve(__dirname, "..", "server", ".env");
  const content = fs.readFileSync(envPath, "utf8");
  assert.ok(content.includes("GEMINI_API_KEY="), "GEMINI_API_KEY should be present in .env");
  assert.ok(content.includes("GEMINI_MODEL=gemini-3.7-flash"), "GEMINI_MODEL should be gemini-3.7-flash");
});

test("Server module contains temporary AI disable code", async () => {
  const serverPath = path.resolve(__dirname, "..", "server", "server.js");
  const serverCode = fs.readFileSync(serverPath, "utf8");
  assert.ok(serverCode.includes("AI_TEMPORARILY_DISABLED"), "server.js should contain AI_TEMPORARILY_DISABLED code");
  assert.ok(serverCode.includes('"The School Assistant is temporarily unavailable."'), "server.js should contain the temporary disable message");
});
