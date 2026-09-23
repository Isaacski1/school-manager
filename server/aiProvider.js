const PROVIDER_REGISTRY = new Map();

const NORMALIZED_ERROR_CODES = Object.freeze({
  TIMEOUT: "AI_TIMEOUT",
  CONNECTION_RESET: "AI_CONNECTION_RESET",
  NETWORK: "AI_NETWORK_ERROR",
  AUTH: "AI_AUTH_ERROR",
  RATE_LIMIT: "AI_RATE_LIMIT",
  SERVER: "AI_SERVER_ERROR",
  MALFORMED_RESPONSE: "AI_MALFORMED_RESPONSE",
  TOOL_CALL_PARSE: "AI_TOOL_CALL_PARSE_ERROR",
});

const registerProvider = (name, factory) => {
  if (PROVIDER_REGISTRY.has(name)) {
    throw new Error(`AI provider "${name}" is already registered`);
  }
  PROVIDER_REGISTRY.set(name, factory);
};

const resolveProvider = (name) => {
  const factory = PROVIDER_REGISTRY.get(name);
  if (!factory) {
    throw new Error(`AI provider "${name}" is not registered. Available: ${Array.from(PROVIDER_REGISTRY.keys()).join(", ")}`);
  }
  return factory();
};

const listProviders = () => Array.from(PROVIDER_REGISTRY.keys());

const buildNormalizedError = ({ category, message, code, status, provider }) => ({
  category: String(category || "network"),
  message: String(message || "Unknown AI error").slice(0, 500),
  code: String(code || "AI_UNKNOWN_ERROR"),
  status: Number.isFinite(status) ? status : null,
  provider: String(provider || "unknown"),
});

export {
  NORMALIZED_ERROR_CODES,
  registerProvider,
  resolveProvider,
  listProviders,
  buildNormalizedError,
};
