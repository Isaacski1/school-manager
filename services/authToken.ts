import { auth } from "./firebase";

/**
 * Gets a fresh Firebase ID token, forcing a refresh to avoid using a cached token.
 * Throws an error if no user is signed in.
 * @returns {Promise<string>} A fresh Firebase ID token.
 */
export async function getFreshIdToken(): Promise<string> {
  const user = auth.currentUser;

  if (!user) {
    // This error can be caught by the UI to trigger a redirect to the login page.
    throw new Error("NO_SESSION");
  }

  try {
    // The 'true' argument forces a token refresh.
    return await user.getIdToken(true);
  } catch (error) {
    console.error("Error refreshing ID token:", error);
    // Re-throw a generic error to be handled by the calling function.
    throw new Error("TOKEN_REFRESH_FAILED");
  }
}
