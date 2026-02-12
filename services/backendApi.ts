/**
 * Backend API Client
 * Handles all communication with the Express backend server.
 * This client automatically handles token refreshing and retries once on token expiration.
 */

import { getIdTokenWithRetry } from "./authToken";
import { API_BASE_URL } from "../src/config";

const BACKEND_URL = API_BASE_URL;

class ApiError extends Error {
  constructor(
    message: string,
    public code?: string,
    public status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * API request helper with built-in token refresh and retry logic.
 *
 * @param endpoint The API endpoint to call.
 * @param options Request options (method, body).
 * @returns The JSON response from the backend.
 */
async function apiRequest<T>(
  endpoint: string,
  options: {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    body?: Record<string, any>;
  } = {},
): Promise<T> {
  let retries = 0;
  const maxRetries = 1;

  while (retries <= maxRetries) {
    try {
      const token = await getIdTokenWithRetry();

      const response = await fetch(`${BACKEND_URL}${endpoint}`, {
        method: options.method || "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      if (!response.ok) {
        // Try to parse the error response from the backend
        const errorData = await response.json().catch(() => ({}));

        const isInvalidToken =
          response.status === 403 &&
          (errorData.code === "INVALID_TOKEN" ||
            /invalid token/i.test(errorData.error || "") ||
            /invalid token/i.test(errorData.message || ""));

        // Check for token errors from our backend
        if (
          (response.status === 401 && errorData.code === "ID_TOKEN_EXPIRED") ||
          isInvalidToken
        ) {
          // If we haven't exhausted retries, the loop will try again
          if (retries < maxRetries) {
            console.log("ID token expired, retrying request...");
            retries++;
            continue; // Go to next iteration to retry
          }
          // If retries are exhausted, throw a specific error for the UI
          throw new ApiError(
            "Your session has expired. Please log out and log in again.",
            "SESSION_EXPIRED",
            response.status,
          );
        }
        // For all other errors, throw a generic ApiError
        throw new ApiError(
          errorData.error || `HTTP ${response.status} ${response.statusText}`,
          errorData.code,
          response.status,
        );
      }

      return (await response.json()) as T;
    } catch (error: any) {
      // Handle "NO_SESSION" from getFreshIdToken
      if (error.message === "NO_SESSION") {
        throw new ApiError(
          "You are not logged in. Please log in to continue.",
          "NO_SESSION",
        );
      }
      if (error.message === "TOKEN_REFRESH_FAILED") {
        throw new ApiError(
          "Your session has expired. Please log out and log in again.",
          "SESSION_EXPIRED",
        );
      }
      // Handle fetch failing entirely
      if (error.name === "TypeError" && error.message === "Failed to fetch") {
        throw new ApiError(
          `Cannot connect to the backend at ${BACKEND_URL}. Please ensure the server is running.`,
          "CONNECTION_FAILED",
        );
      }
      // Re-throw ApiErrors and other unexpected errors
      throw error;
    }
  }

  // This should not be reachable, but is a safeguard.
  throw new Error("API request failed after all retries.");
}

/**
 * Create a school via backend
 * REQUIRES: Caller must be super_admin
 */
export async function createSchool(payload: {
  name: string;
  phone?: string;
  address?: string;
  logoUrl?: string;
  plan: "free" | "trial" | "monthly" | "termly" | "yearly";
}): Promise<{
  success: boolean;
  schoolId: string;
  code: string;
  message: string;
}> {
  return apiRequest("/api/superadmin/create-school", {
    body: payload,
  });
}

/**
 * Create a school admin via backend
 * REQUIRES: Caller must be super_admin
 */
export async function createSchoolAdmin(payload: {
  schoolId: string;
  fullName: string;
  email: string;
  password?: string;
}): Promise<{
  success: boolean;
  uid: string;
  email: string;
  resetLink?: string;
  message: string;
}> {
  return apiRequest("/api/superadmin/create-school-admin", {
    body: payload,
  });
}

/**
 * Reset a school admin password via backend
 * REQUIRES: Caller must be super_admin
 */
export async function resetSchoolAdminPassword(payload: {
  adminUid: string;
}): Promise<{
  success: boolean;
  email: string;
  resetLink: string;
  message: string;
}> {
  return apiRequest("/api/superadmin/reset-school-admin-password", {
    body: payload,
  });
}

/**
 * Provision a missing user profile
 * REQUIRES: Caller must be super_admin
 * Used to backfill existing Auth-only users with Firestore profiles
 */
export async function provisionUser(payload: {
  uid: string;
  role: string;
  schoolId?: string;
  fullName: string;
  email: string;
}): Promise<{
  success: boolean;
  uid: string;
  message: string;
}> {
  return apiRequest("/api/superadmin/provision-user", {
    body: payload,
  });
}

/**
 * Create a new teacher via backend
 * REQUIRES: Caller must be school_admin
 */
export async function createTeacher(payload: {
  fullName: string;
  email: string;
  password?: string; // Added optional password field
  assignedClassIds?: string[];
}): Promise<{
  success: boolean;
  uid: string;
  email: string;
  message: string;
}> {
  return apiRequest("/api/createTeacher", {
    body: payload,
  });
}

export async function initiateSchoolBilling(payload: {
  amount: number;
  currency?: "GHS";
  metadata?: Record<string, any>;
}): Promise<{
  authorizationUrl: string;
  reference: string;
}> {
  return apiRequest("/api/billing/initiate", {
    body: payload,
  });
}

export async function verifySchoolPayment(payload: {
  reference: string;
}): Promise<{
  success: boolean;
  status: string;
  reference: string;
}> {
  return apiRequest("/api/billing/verify", {
    body: payload,
  });
}

export type AiChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type AiChatAction = {
  type:
    | "create_school"
    | "create_school_admin"
    | "reset_school_admin_password"
    | "provision_user";
  description?: string;
  payload?: Record<string, any>;
};

export async function superAdminAiChat(payload: {
  messages: AiChatMessage[];
}): Promise<{ reply: string; action?: AiChatAction | null }> {
  return apiRequest("/api/superadmin/ai-chat", {
    body: payload,
  });
}

export async function confirmSuperAdminAiAction(payload: {
  action: AiChatAction;
}): Promise<{ success: boolean; actionType: string; result?: any }> {
  return apiRequest("/api/superadmin/ai-action", {
    body: payload,
  });
}

export { BACKEND_URL };
