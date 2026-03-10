const resolvedApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "");
const defaultApiBaseUrl = import.meta.env.DEV
  ? "http://localhost:3001"
  : "https://school-manager-hehk.onrender.com";

export const API_BASE_URL = resolvedApiBaseUrl || defaultApiBaseUrl;

export const PAYSTACK_PUBLIC_KEY =
  import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || "";

if (
  typeof window !== "undefined" &&
  !resolvedApiBaseUrl &&
  import.meta.env.PROD
) {
  console.warn(
    "[Config] VITE_API_BASE_URL is not set. Production is falling back to the default backend URL.",
  );
}
