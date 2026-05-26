const TECHNICAL_ERROR_HINTS = [
  "FirebaseError",
  "auth/",
  "firestore/",
  "HTTP ",
  "Failed to fetch",
  "Missing or insufficient permissions",
  "permission-denied",
  "requires an index",
  "ERR_",
  "TypeError",
  "NetworkError",
];

const isTechnicalMessage = (message: string) =>
  TECHNICAL_ERROR_HINTS.some((hint) =>
    message.toLowerCase().includes(hint.toLowerCase()),
  );

export const getFriendlyErrorMessage = (
  error: unknown,
  fallback = "Something went wrong. Please try again.",
) => {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as any).code || "")
      : "";
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? Number((error as any).status)
      : 0;
  const rawMessage =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "message" in error
          ? String((error as any).message || "")
          : "";
  const message = rawMessage.trim();
  const lowerMessage = message.toLowerCase();

  if (
    code === "auth/invalid-credential" ||
    code === "auth/user-not-found" ||
    code === "auth/wrong-password" ||
    lowerMessage.includes("invalid login credentials") ||
    lowerMessage.includes("invalid email or password")
  ) {
    return "The email, phone number, or password is not correct. Please check it and try again.";
  }

  if (code === "auth/invalid-email") {
    return "Please enter a valid email address.";
  }

  if (code === "ADMIN_EMAIL_EXISTS") {
    return "A school admin account already exists with this email. Please verify the email or sign in.";
  }

  if (code === "auth/too-many-requests") {
    return "Too many attempts. Please wait a few minutes, then try again.";
  }

  if (code === "auth/network-request-failed" || lowerMessage.includes("failed to fetch")) {
    return "We could not connect to the server. Please check your internet connection and try again.";
  }

  if (
    code === "auth/invalid-verification-code" ||
    code === "auth/code-expired" ||
    lowerMessage.includes("verification code")
  ) {
    return "The verification code is incorrect or has expired. Please request a new code.";
  }

  if (code === "auth/invalid-phone-number") {
    return "Please enter a valid phone number.";
  }

  if (code === "auth/invalid-custom-token") {
    return "We could not complete sign in right now. Please contact the school office or support.";
  }

  if (
    lowerMessage.includes("permission-denied") ||
    lowerMessage.includes("missing or insufficient permissions") ||
    status === 403
  ) {
    return "You do not have permission to do this. Please contact your school administrator if you think this is a mistake.";
  }

  if (status === 401 || code === "NO_SESSION" || code === "SESSION_EXPIRED") {
    return "Your session has expired. Please log in again.";
  }

  if (code === "EMAIL_NOT_CONFIGURED") {
    return "Email delivery is not configured on the server. Please contact support to set up the sender email.";
  }

  if (code === "EMAIL_DELIVERY_FAILED") {
    return message || "The email provider could not send the verification email. Please contact support.";
  }

  if (code === "FIREBASE_AUTH_UNREACHABLE") {
    return message || "Firebase Auth is unreachable right now. Please try again in a few minutes.";
  }

  if (status === 404) {
    return "We could not find the requested record. It may have been removed or changed.";
  }

  if (status >= 500) {
    return "The server had a problem. Please try again in a few minutes.";
  }

  if (
    lowerMessage.includes("requires an index") ||
    lowerMessage.includes("configure using single field index controls")
  ) {
    return "This list cannot load right now. Please contact support to finish the database setup.";
  }

  if (
    lowerMessage.includes("client is offline") ||
    lowerMessage.includes("network error") ||
    lowerMessage.includes("could not connect")
  ) {
    return "You appear to be offline. Please check your internet connection and try again.";
  }

  if (lowerMessage.includes("account_not_provisioned")) {
    return "Your account is not set up yet. Please contact your school administrator.";
  }

  if (lowerMessage.includes("account_inactive")) {
    return "Your account has been deactivated. Please contact your school administrator.";
  }

  if (lowerMessage.includes("school_not_found")) {
    return "Your school account could not be found. Please contact support.";
  }

  if (lowerMessage.includes("school_inactive")) {
    return "This school account is not active. Please contact support.";
  }

  if (!message || isTechnicalMessage(message)) {
    return fallback;
  }

  return message;
};
