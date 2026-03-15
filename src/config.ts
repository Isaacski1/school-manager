const sanitizeBaseUrl = (value?: string) =>
  String(value || "").trim().replace(/\/$/, "");

const resolvedApiBaseUrl =
  sanitizeBaseUrl(import.meta.env.VITE_API_BASE_URL) ||
  sanitizeBaseUrl(import.meta.env.VITE_BACKEND_URL);
const defaultApiBaseUrl = import.meta.env.DEV
  ? "http://localhost:3001"
  : "https://school-manager-hehk.onrender.com";

const runtimeHost =
  typeof window !== "undefined"
    ? String(window.location.hostname || "").toLowerCase()
    : "";

const isPrimaryProdHosting =
  runtimeHost === "school-manager-gh.web.app" ||
  runtimeHost === "school-manager-gh.firebaseapp.com";

const shouldIgnoreConfiguredApiForProd = Boolean(
  import.meta.env.PROD &&
    isPrimaryProdHosting &&
    resolvedApiBaseUrl &&
    /api-test\.onrender\.com/i.test(resolvedApiBaseUrl),
);

export const API_BASE_URL = shouldIgnoreConfiguredApiForProd
  ? defaultApiBaseUrl
  : resolvedApiBaseUrl || defaultApiBaseUrl;

export const PAYSTACK_PUBLIC_KEY =
  import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || "";

if (
  typeof window !== "undefined" &&
  !resolvedApiBaseUrl &&
  import.meta.env.PROD
) {
  console.warn(
    "[Config] VITE_API_BASE_URL / VITE_BACKEND_URL not set. Production is falling back to the default backend URL.",
  );
}

if (typeof window !== "undefined" && shouldIgnoreConfiguredApiForProd) {
  console.warn(
    "[Config] Ignoring test API base URL for primary production hosting domain.",
    {
      configuredApiBaseUrl: resolvedApiBaseUrl,
      enforcedApiBaseUrl: defaultApiBaseUrl,
      host: runtimeHost,
    },
  );
}
