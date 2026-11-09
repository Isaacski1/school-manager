import crypto from "crypto";

// Constant-time comparison of two hex strings to prevent timing attacks
export const constantTimeEqual = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) {
    return false;
  }
  try {
    return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
};

// Constant-time comparison of two raw strings (used for legacy signature path)
export const constantTimeCompare = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) {
    return false;
  }
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
};

const KEY_ID_PREFIX = "whk_";
const SIGNATURE_REGEX = /^[0-9a-f]{128}$/;
const DECIMAL_TIMESTAMP_REGEX = /^\d+$/;
const TIMESTAMP_TOLERANCE_SECONDS = 300;

// Parse Paystack-Signature header: t=TIMESTAMP,v1=KEY_ID:HEX_SIGNATURE
// Returns null if malformed, otherwise { timestamp, signatures: string[] }
// Each signature must be exactly 128 hex characters (SHA-512 output)
export const parsePaystackWebhookSignature = (headerValue) => {
  if (typeof headerValue !== "string" || headerValue.length === 0) {
    return null;
  }
  const parts = headerValue.split(",");
  let timestamp = null;
  const signatures = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith("t=")) {
      timestamp = trimmed.substring(2);
    } else if (trimmed.startsWith("v1=")) {
      const sigPart = trimmed.substring(3);
      const colonIdx = sigPart.indexOf(":");
      if (colonIdx === -1) {
        return null; // Missing colon separator
      }
      const keyId = sigPart.substring(0, colonIdx);
      const sig = sigPart.substring(colonIdx + 1);
      // Key ID must start with whk_
      if (!keyId.startsWith(KEY_ID_PREFIX)) {
        return null;
      }
      // Signature must be exactly 128 hex characters (SHA-512 output)
      if (!SIGNATURE_REGEX.test(sig)) {
        return null;
      }
      signatures.push(sig);
    }
  }
  if (timestamp === null || signatures.length === 0) {
    return null;
  }
  return { timestamp, signatures };
};

// Validate timestamp is a strict decimal Unix timestamp within tolerance seconds of now
// Accepts only unsigned decimal digits (rejects 1e3, +1000, whitespace-padded, etc.)
export const isWebhookTimestampRecent = (timestampStr, nowSeconds = Math.floor(Date.now() / 1000)) => {
  if (typeof timestampStr !== "string" || !DECIMAL_TIMESTAMP_REGEX.test(timestampStr)) {
    return false;
  }
  const timestamp = Number(timestampStr);
  if (timestamp < 0) {
    return false;
  }
  return Math.abs(nowSeconds - timestamp) <= TIMESTAMP_TOLERANCE_SECONDS;
};

// Verify Paystack-Signature header against the webhook signing secret
export const verifyWebhookSignature = (headerValue, rawBody, webhookSecret) => {
  // Reject if webhook secret is not configured
  if (!webhookSecret) {
    return false;
  }
  const parsed = parsePaystackWebhookSignature(headerValue);
  if (!parsed) {
    return false;
  }
  if (!isWebhookTimestampRecent(parsed.timestamp)) {
    return false;
  }
  const message = `${parsed.timestamp}.${rawBody}`;
  return parsed.signatures.some((sig) => {
    try {
      const expected = crypto
        .createHmac("sha512", webhookSecret)
        .update(message)
        .digest("hex");
      return constantTimeEqual(expected, sig);
    } catch {
      return false;
    }
  });
};

// Authorize a webhook request using new-header precedence with legacy fallback.
// Precedence rules:
//   - New header present (even malformed): accept only if the new signature is valid.
//     No silent fallback to legacy.
//   - New header absent: accept only if a valid legacy signature is present.
// Legacy HMAC uses the API secret and the exact raw body.
export const authorizeWebhookRequest = (
  newHeader,
  legacyHeader,
  rawBody,
  webhookSecret,
  apiSecret,
  nowSeconds = Math.floor(Date.now() / 1000),
) => {
  const body = rawBody || "";

  if (newHeader !== undefined && newHeader !== null && String(newHeader).length > 0) {
    // Explicitly present new header: verify only against webhook secret; no legacy fallback.
    return verifyWebhookSignature(newHeader, body, webhookSecret);
  }

  // New header absent: fall back to legacy x-paystack-signature.
  if (!legacyHeader) {
    return false;
  }

  try {
    const hash = crypto.createHmac("sha512", apiSecret).update(body).digest("hex");
    return constantTimeCompare(hash, legacyHeader);
  } catch {
    return false;
  }
};
