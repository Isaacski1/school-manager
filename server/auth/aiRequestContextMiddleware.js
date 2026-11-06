// aiRequestContextMiddleware.js
// Middleware that generates a unique server-side request ID for AI-related
// requests and attaches it to req.aiRequestContext.
// Never trusts client-supplied request IDs; always generates server-side.

import crypto from "crypto";

// Prefix for all AI request IDs.
const REQUEST_ID_PREFIX = "ai";

/**
 * Generates a unique server-side request ID.
 * Uses Date.now() (base 36) + crypto.randomBytes(4) for uniqueness.
 * @returns {string} Unique request ID like "ai_<timestamp36>_<8hex>"
 */
function generateRequestId() {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(4).toString("hex");
  return `${REQUEST_ID_PREFIX}_${timestamp}_${random}`;
}

/**
 * Express middleware that attaches a server-generated request ID to
 * req.aiRequestContext. Never overwrites existing authContext or schoolScope.
 * Never trusts client-supplied request IDs.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
function aiRequestContextMiddleware(req, res, next) {
  // Never trust client-supplied request ID; always generate server-side.
  const requestId = generateRequestId();

  req.aiRequestContext = {
    requestId,
  };

  next();
}

export { aiRequestContextMiddleware, generateRequestId };
export default aiRequestContextMiddleware;
