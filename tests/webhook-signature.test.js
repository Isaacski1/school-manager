import assert from "node:assert";
import test from "node:test";
import crypto from "crypto";
import {
  authorizeWebhookRequest,
  constantTimeCompare,
  constantTimeEqual,
  isWebhookTimestampRecent,
  parsePaystackWebhookSignature,
  verifyWebhookSignature,
} from "../server/paystackWebhookSecurity.js";

const rawBody = '{"id":"evt_test_123","data":{"object":{"id":"ch_123"}}}';
const validWebhookSecret = "whsec_test_secret_1234567890abcdef";
const wrongWebhookSecret = "whsec_wrong_secret_0000000000000000";
const validApiSecret = "sk_test_api_secret_1234567890abcdef";
const wrongApiSecret = "sk_wrong_api_secret_0000000000000000";
const validTimestamp = Math.floor(Date.now() / 1000);
const oldTimestamp = Math.floor(Date.now() / 1000) - 400; // 400 seconds ago (> 300s)
const futureTimestamp = Math.floor(Date.now() / 1000) + 400; // 400 seconds in future

// Helper to build a valid new-format header with given secret, timestamp, keyId, and body
function makeHeader(secret, timestamp, keyId = "whk_test_key", body = rawBody) {
  const message = `${timestamp}.${body}`;
  const sig = crypto.createHmac("sha512", secret).update(message).digest("hex");
  return `t=${timestamp},v1=${keyId}:${sig}`;
}

// Helper to build a valid legacy signature (HMAC-SHA512 over the raw body, no timestamp)
function makeLegacySignature(apiSecret, body = rawBody) {
  return crypto.createHmac("sha512", apiSecret).update(body).digest("hex");
}

// --- verifyWebhookSignature (new-format) tests ---

// Test: Valid new signature is accepted
test("valid new signature is accepted", async () => {
  const header = makeHeader(validWebhookSecret, validTimestamp);
  const result = verifyWebhookSignature(header, rawBody, validWebhookSecret);
  assert.strictEqual(result, true, "Valid new signature should be accepted");
});

// Test: Invalid new signature is rejected
test("invalid new signature is rejected", async () => {
  const header = makeHeader(wrongWebhookSecret, validTimestamp);
  const result = verifyWebhookSignature(header, rawBody, validWebhookSecret);
  assert.strictEqual(result, false, "Invalid signature should be rejected");
});

// Test: Wrong webhook secret → REJECT
test("wrong webhook secret is rejected", async () => {
  const header = makeHeader(wrongWebhookSecret, validTimestamp);
  const result = verifyWebhookSignature(header, rawBody, validWebhookSecret);
  assert.strictEqual(result, false, "Wrong secret should be rejected");
});

// Test: Missing webhook secret → REJECT
test("missing webhook secret is rejected", async () => {
  const header = makeHeader(validWebhookSecret, validTimestamp);
  const result = verifyWebhookSignature(header, rawBody, "");
  assert.strictEqual(result, false, "Missing webhook secret should be rejected");
});

// Test: New header valid + legacy invalid → ACCEPT (verifyWebhookSignature only checks new header)
test("valid new signature is accepted even without legacy", async () => {
  const header = makeHeader(validWebhookSecret, validTimestamp);
  const result = verifyWebhookSignature(header, rawBody, validWebhookSecret);
  assert.strictEqual(result, true, "Valid new signature should be accepted");
});

// Test: Expired timestamp → REJECT
test("expired timestamp is rejected", async () => {
  const header = makeHeader(validWebhookSecret, oldTimestamp);
  const result = verifyWebhookSignature(header, rawBody, validWebhookSecret);
  assert.strictEqual(result, false, "Expired timestamp should be rejected");
});

// Test: Future timestamp beyond 300 seconds → REJECT
test("future timestamp beyond 300 seconds is rejected", async () => {
  const header = makeHeader(validWebhookSecret, futureTimestamp);
  const result = verifyWebhookSignature(header, rawBody, validWebhookSecret);
  assert.strictEqual(result, false, "Future timestamp beyond 300s should be rejected");
});

// Test: Malformed header → REJECT
test("malformed header is rejected", async () => {
  assert.strictEqual(verifyWebhookSignature("", rawBody, validWebhookSecret), false, "Empty header should be rejected");
  assert.strictEqual(verifyWebhookSignature("not-a-valid-header", rawBody, validWebhookSecret), false, "Malformed header should be rejected");
  assert.strictEqual(verifyWebhookSignature("t=12345", rawBody, validWebhookSecret), false, "Header without v1 should be rejected");
});

// Test: Multiple v1 signatures with one valid → ACCEPT
test("multiple v1 signatures with one valid is accepted", async () => {
  const goodSig = crypto
    .createHmac("sha512", validWebhookSecret)
    .update(`${validTimestamp}.${rawBody}`)
    .digest("hex");
  const badSig = "a".repeat(128);
  const header = `t=${validTimestamp},v1=whk_test_key:${badSig},v1=whk_test:${goodSig}`;
  const result = verifyWebhookSignature(header, rawBody, validWebhookSecret);
  assert.strictEqual(result, true, "Multiple v1 signatures with one valid should be accepted");
});

// Test: Empty raw body handled correctly
test("empty raw body is handled correctly", async () => {
  const message = `${validTimestamp}.`;
  const sig = crypto.createHmac("sha512", validWebhookSecret).update(message).digest("hex");
  const header = `t=${validTimestamp},v1=whk_test_key:${sig}`;
  const result = verifyWebhookSignature(header, "", validWebhookSecret);
  assert.strictEqual(result, true, "Empty body with valid signature should be accepted");
});

// Test: parsePaystackWebhookSignature parses valid header
test("parsePaystackWebhookSignature parses valid header", async () => {
  const goodSig = crypto
    .createHmac("sha512", validWebhookSecret)
    .update(`${validTimestamp}.${rawBody}`)
    .digest("hex");
  const header = `t=${validTimestamp},v1=whk_test_key:${goodSig}`;
  const result = parsePaystackWebhookSignature(header);
  assert.strictEqual(result.timestamp, validTimestamp.toString());
  assert.strictEqual(result.signatures.length, 1);
  assert.strictEqual(result.signatures[0], goodSig);
});

// Test: parsePaystackWebhookSignature rejects malformed header
test("parsePaystackWebhookSignature rejects malformed header", async () => {
  assert.strictEqual(parsePaystackWebhookSignature(""), null);
  assert.strictEqual(parsePaystackWebhookSignature("not-a-header"), null);
  assert.strictEqual(parsePaystackWebhookSignature("t=12345"), null);
  assert.strictEqual(parsePaystackWebhookSignature("v1=badkey:sig"), null);
});

// Test: missing key ID → reject
test("missing key ID in header is rejected", async () => {
  const goodSig = crypto
    .createHmac("sha512", validWebhookSecret)
    .update(`${validTimestamp}.${rawBody}`)
    .digest("hex");
  const header = `t=${validTimestamp},v1=:${goodSig}`;
  const result = verifyWebhookSignature(header, rawBody, validWebhookSecret);
  assert.strictEqual(result, false, "Missing key ID should be rejected");
});

// Test: invalid key ID → reject
test("invalid key ID is rejected", async () => {
  const goodSig = crypto
    .createHmac("sha512", validWebhookSecret)
    .update(`${validTimestamp}.${rawBody}`)
    .digest("hex");
  const header = `t=${validTimestamp},v1=invalid_key:${goodSig}`;
  const result = verifyWebhookSignature(header, rawBody, validWebhookSecret);
  assert.strictEqual(result, false, "Invalid key ID should be rejected");
});

// Test: non-hex signature → reject
test("non-hex signature is rejected", async () => {
  const header = `t=${validTimestamp},v1=whk_test_key:nothex`;
  const result = verifyWebhookSignature(header, rawBody, validWebhookSecret);
  assert.strictEqual(result, false, "Non-hex signature should be rejected");
});

// Test: signature of incorrect length → reject
test("signature of incorrect length is rejected", async () => {
  const shortSig = "a".repeat(64);
  const header = `t=${validTimestamp},v1=whk_test:${shortSig}`;
  const result = verifyWebhookSignature(header, rawBody, validWebhookSecret);
  assert.strictEqual(result, false, "Short signature should be rejected");
  const longSig = "a".repeat(200);
  const header2 = `t=${validTimestamp},v1=whk_test:${longSig}`;
  const result2 = verifyWebhookSignature(header2, rawBody, validWebhookSecret);
  assert.strictEqual(result2, false, "Long signature should be rejected");
});

// --- isWebhookTimestampRecent tests ---

// Test: isWebhookTimestampRecent accepts timestamps within 300s
test("isWebhookTimestampRecent accepts timestamps within 300s", async () => {
  const now = Math.floor(Date.now() / 1000);
  assert.strictEqual(isWebhookTimestampRecent(now.toString()), true);
  assert.strictEqual(isWebhookTimestampRecent((now - 300).toString()), true);
  assert.strictEqual(isWebhookTimestampRecent((now + 300).toString()), true);
});

// Test: isWebhookTimestampRecent rejects timestamps outside 300s
test("isWebhookTimestampRecent rejects timestamps outside 300s", async () => {
  const now = Math.floor(Date.now() / 1000);
  assert.strictEqual(isWebhookTimestampRecent((now - 301).toString()), false);
  assert.strictEqual(isWebhookTimestampRecent((now + 301).toString()), false);
  assert.strictEqual(isWebhookTimestampRecent("not-a-number"), false);
  assert.strictEqual(isWebhookTimestampRecent(""), false);
});

// Test: isWebhookTimestampRecent rejects non-decimal representations
test("isWebhookTimestampRecent rejects non-decimal timestamps", async () => {
  const now = Math.floor(Date.now() / 1000);
  assert.strictEqual(isWebhookTimestampRecent("1e3"), false, "exponent notation should be rejected");
  assert.strictEqual(isWebhookTimestampRecent("+1000"), false, "leading plus should be rejected");
  assert.strictEqual(isWebhookTimestampRecent(" 1000 "), false, "whitespace-padded should be rejected");
  assert.strictEqual(isWebhookTimestampRecent("0xdead"), false, "hex notation should be rejected");
  assert.strictEqual(isWebhookTimestampRecent(now.toString()), true, "plain decimal should be accepted");
});

// --- constantTimeEqual tests ---

// Test: constantTimeEqual compares hex strings correctly
test("constantTimeEqual compares hex strings correctly", async () => {
  const a = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2";
  const b = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2";
  assert.strictEqual(constantTimeEqual(a, b), true);
  const c = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b3";
  assert.strictEqual(constantTimeEqual(a, c), false);
});

// Test: constantTimeEqual rejects different lengths
test("constantTimeEqual rejects different lengths", async () => {
  const a = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2";
  const b = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b";
  assert.strictEqual(constantTimeEqual(a, b), false);
});

// --- authorizeWebhookRequest (route-level authorization) tests ---

const validLegacySig = makeLegacySignature(validApiSecret, rawBody);
const invalidLegacySig = makeLegacySignature(wrongApiSecret, rawBody);
const validNewHeader = makeHeader(validWebhookSecret, validTimestamp);
const invalidNewHeader = makeHeader(wrongWebhookSecret, validTimestamp);

// New header valid + legacy invalid → ACCEPT
test("authorize: valid new header + invalid legacy → accept", async () => {
  const result = authorizeWebhookRequest(
    validNewHeader,
    invalidLegacySig,
    rawBody,
    validWebhookSecret,
    validApiSecret,
  );
  assert.strictEqual(result, true, "Valid new header should be accepted even if legacy is invalid");
});

// New header invalid + legacy valid → REJECT (no silent fallback)
test("authorize: invalid new header + valid legacy → reject", async () => {
  const result = authorizeWebhookRequest(
    invalidNewHeader,
    validLegacySig,
    rawBody,
    validWebhookSecret,
    validApiSecret,
  );
  assert.strictEqual(result, false, "Invalid new header should be rejected even if legacy is valid");
});

// New header valid + legacy valid → ACCEPT
test("authorize: valid new header + valid legacy → accept", async () => {
  const result = authorizeWebhookRequest(
    validNewHeader,
    validLegacySig,
    rawBody,
    validWebhookSecret,
    validApiSecret,
  );
  assert.strictEqual(result, true, "Valid new header and valid legacy should be accepted");
});

// New header absent + legacy valid → ACCEPT
test("authorize: absent new header + valid legacy → accept", async () => {
  const result = authorizeWebhookRequest(
    undefined,
    validLegacySig,
    rawBody,
    validWebhookSecret,
    validApiSecret,
  );
  assert.strictEqual(result, true, "Absent new header with valid legacy should be accepted");
});

// New header absent + legacy invalid → REJECT
test("authorize: absent new header + invalid legacy → reject", async () => {
  const result = authorizeWebhookRequest(
    undefined,
    invalidLegacySig,
    rawBody,
    validWebhookSecret,
    validApiSecret,
  );
  assert.strictEqual(result, false, "Absent new header with invalid legacy should be rejected");
});

// New header absent + legacy absent → REJECT
test("authorize: absent new header + absent legacy → reject", async () => {
  const result = authorizeWebhookRequest(
    undefined,
    undefined,
    rawBody,
    validWebhookSecret,
    validApiSecret,
  );
  assert.strictEqual(result, false, "Absent new header and absent legacy should be rejected");
});

// Explicitly present but malformed new header → REJECT (no fallback to valid legacy)
test("authorize: malformed present new header + valid legacy → reject", async () => {
  const result = authorizeWebhookRequest(
    "not-a-valid-header",
    validLegacySig,
    rawBody,
    validWebhookSecret,
    validApiSecret,
  );
  assert.strictEqual(result, false, "Malformed present new header should be rejected without legacy fallback");
});

// Legacy HMAC uses API secret and exact raw body
test("authorize: legacy signature uses API secret and exact raw body", async () => {
  const tamperedBody = rawBody + "extra";
  const result = authorizeWebhookRequest(
    undefined,
    validLegacySig,
    tamperedBody,
    validWebhookSecret,
    validApiSecret,
  );
  assert.strictEqual(result, false, "Legacy signature over different body should be rejected");
});
