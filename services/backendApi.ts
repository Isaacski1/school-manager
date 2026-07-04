/**
 * Backend API Client
 * Handles all communication with the Express backend server.
 * This client automatically handles token refreshing and retries once on token expiration.
 */

import { getIdTokenWithRetry } from "./authToken";
import { API_BASE_URL } from "../src/config";
import { getFriendlyErrorMessage } from "./errorMessages";
import { PlatformBroadcast } from "../types";

const BACKEND_URL = API_BASE_URL;

export type SchoolAssistantChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type SchoolAssistantChatResponse = {
  answer: string;
  action?: { label: string; path: string; target?: string } | null;
};

const buildQueryString = (params: Record<string, any>) => {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : "";
};

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

export async function askSchoolAssistant(payload: {
  message: string;
  pathname: string;
  history: SchoolAssistantChatMessage[];
}): Promise<SchoolAssistantChatResponse> {
  return apiRequest<SchoolAssistantChatResponse>("/api/admin/school-assistant/chat", {
    body: payload,
  });
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
    requiresAuth?: boolean;
    method?: "GET" | "POST" | "PUT" | "DELETE";
    body?: Record<string, any>;
  } = {},
): Promise<T> {
  let retries = 0;
  const maxRetries = 1;

  while (retries <= maxRetries) {
    try {
      let token: string | undefined;
      if (options.requiresAuth !== false) {
        token = await getIdTokenWithRetry();
      }

      const response = await fetch(`${BACKEND_URL}${endpoint}`, {
        method: options.method || "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
          getFriendlyErrorMessage(
            {
              message: errorData.error || errorData.message || response.statusText,
              code: errorData.code,
              status: response.status,
            },
            "The request could not be completed. Please try again.",
          ),
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
          "We could not connect to the server. Please check your internet connection and try again.",
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

export interface PayoutStatusResponse {
  success: boolean;
  schoolId: string;
  currency: "GHS";
  minimumSettlementAmount: number;
  grossOnlineCollections: number;
  estimatedSchoolShare: number;
  settledAmount: number;
  availableBalance: number;
  remainingToThreshold: number;
  progressPercent: number;
  status: "unconfigured" | "pending" | "ready";
  paymentAccountStatus: string;
  source?: "payoutLedger" | "recordedPaymentsEstimate";
  lastSettlement?: {
    id: string | number;
    status: string;
    amount: number;
    settledAt?: string | null;
  } | null;
  warnings?: string[];
  lastRefreshed: string;
}

export async function getPayoutStatus(
  schoolId: string,
): Promise<PayoutStatusResponse> {
  return apiRequest(`/api/payments/${encodeURIComponent(schoolId)}/payout-status`, {
    method: "GET",
  });
}

/**
 * Create a school via backend
 * REQUIRES: Caller must be super_admin
 */
export async function createSchool(payload: {
  name: string;
  schoolAdminFullName?: string;
  phone?: string;
  address?: string;
  logoUrl?: string;
  plan: "free" | "trial" | "monthly" | "termly" | "yearly";
  schoolType?: string;
  featurePlan?: "starter" | "standard";
  billingStartType?: "term_start" | "mid_term";
  cloneFromTemplate?: boolean;
  templateType?: "default" | "school";
  templateSchoolId?: string;
  planId?: string;
  specialPricing?: {
    enabled: boolean;
    amount: number;
    cycle: "monthly" | "termly" | "yearly";
    note?: string;
  };
}): Promise<{
  success: boolean;
  schoolId: string;
  code: string;
  clonedFrom?: string;
  message: string;
}> {
  return apiRequest("/api/superadmin/create-school", {
    body: payload,
  });
}

export async function createOrUpdatePlan(payload: {
  id: string;
  name: string;
  maxStudents: number;
}): Promise<{ success: boolean; id: string; message: string }> {
  return apiRequest("/api/superadmin/upsert-plan", { body: payload });
}

export async function updateSchoolPlan(payload: {
  schoolId: string;
  planId: string;
}): Promise<{ success: boolean; message: string }> {
  return apiRequest("/api/superadmin/update-school-plan", { body: payload });
}

export async function deleteSchool(payload: {
  schoolId: string;
}): Promise<{
  success: boolean;
  deletedUsers: number;
  deletedDocs: Record<string, number>;
  deletionErrors?: Record<string, string>;
  message: string;
}> {
  return apiRequest("/api/superadmin/delete-school", { body: payload });
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

export async function deleteSchoolAdmin(payload: {
  adminUid: string;
}): Promise<{
  success: boolean;
  email: string;
  message: string;
}> {
  return apiRequest("/api/superadmin/delete-school-admin", {
    body: payload,
  });
}

/**
 * Update a school admin email via backend
 * REQUIRES: Caller must be super_admin
 */
export async function updateSchoolAdminEmail(payload: {
  adminUid: string;
  newEmail: string;
  fullName?: string;
}): Promise<{
  success: boolean;
  email: string;
  message: string;
}> {
  return apiRequest("/api/superadmin/update-school-admin-email", {
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

export async function logSecurityLogin(payload: {
  status: "SUCCESS" | "FAILED";
  email?: string | null;
  errorCode?: string | null;
  userAgent?: string | null;
}): Promise<{ success: boolean }> {
  return apiRequest("/api/security/log-login", { body: payload, requiresAuth: false });
}

export type AdminMfaPolicyStatus = {
  success: boolean;
  role: string | null;
  enforcementMode: "off" | "optional" | "required";
  enabledForSuperAdmins: boolean;
  enabledForSchoolAdmins: boolean;
  appliesTo: boolean;
  required: boolean;
  enrolledFactorsCount: number;
  compliant: boolean;
  message: string;
};

export async function getAdminMfaPolicyStatus(): Promise<AdminMfaPolicyStatus> {
  return apiRequest("/api/auth/admin-mfa-policy", { method: "GET" });
}

export type PayrollBank = {
  name: string;
  code: string;
  type?: string;
};

export type StaffPayrollProfilePayload = {
  staffId: string;
  staffName: string;
  staffEmail?: string | null;
  staffPhoneNumber?: string | null;
  paymentMethod: "mobile_money" | "ghipss";
  accountName: string;
  accountNumber: string;
  bankCode: string;
  bankName: string;
  salaryAmount: number;
};

export async function getPayrollBanks(type: "mobile_money" | "ghipss") {
  const query = buildQueryString({ type });
  return apiRequest<{ success: boolean; banks: PayrollBank[] }>(
    `/api/payroll/banks${query}`,
    { method: "GET" },
  );
}

export async function getPayrollOverview() {
  return apiRequest<{
    success: boolean;
    profiles: any[];
    runs: any[];
    payments: any[];
  }>("/api/payroll/overview", { method: "GET" });
}

export async function saveStaffPayrollProfile(
  payload: StaffPayrollProfilePayload,
) {
  return apiRequest<{ success: boolean; profile: any }>(
    "/api/payroll/profiles",
    { body: payload },
  );
}

export async function createPayrollRun(payload: {
  period: string;
  items: Array<{
    staffId: string;
    allowance?: number;
    deduction?: number;
    amount?: number;
  }>;
}) {
  return apiRequest<{ success: boolean; run: any; payments: any[] }>(
    "/api/payroll/runs",
    { body: payload },
  );
}

export async function processPayrollRun(payload: {
  payrollRunId: string;
  confirmation: string;
}) {
  return apiRequest<{ success: boolean; run: any; payments: any[] }>(
    `/api/payroll/runs/${encodeURIComponent(payload.payrollRunId)}/pay`,
    { body: { confirmation: payload.confirmation } },
  );
}

export async function finalizePayrollTransfer(payload: {
  paymentId: string;
  otp: string;
}) {
  return apiRequest<{ success: boolean; payment: any }>(
    `/api/payroll/payments/${encodeURIComponent(payload.paymentId)}/finalize`,
    { body: { otp: payload.otp } },
  );
}

export type SuperAdminDashboardOverview = {
  success: boolean;
  cached?: boolean;
  generatedAt: number;
  schools: Array<Record<string, any>>;
  activity: Array<Record<string, any>>;
  payments: Array<Record<string, any>>;
  totals?: {
    totalSchools?: number;
    schools?: number;
    activeSchools?: number;
    active?: number;
    inactiveSchools?: number;
    inactive?: number;
    freeSchools?: number;
    free?: number;
    trialSchools?: number;
    trial?: number;
    paidSchools?: number;
    paid?: number;
    newSchoolsLast30?: number;
    newSchools?: number;
  };
  dailyChecklist?: {
    summary: Record<string, { completed: number; total: number }>;
    perSchool: Record<
      string,
      {
        attendance: boolean;
        teacherAttendance: boolean;
        assessments: boolean;
        timetable: boolean;
        notices: boolean;
      }
    >;
  };
  limits?: Record<string, number>;
};

export async function getSuperAdminDashboardOverview(params?: {
  forceRefresh?: boolean;
  schoolsLimit?: number;
  activityLimit?: number;
  paymentsLimit?: number;
  checklistLimit?: number;
}): Promise<SuperAdminDashboardOverview> {
  const query = buildQueryString({
    forceRefresh: params?.forceRefresh ? 1 : undefined,
    schoolsLimit: params?.schoolsLimit,
    activityLimit: params?.activityLimit,
    paymentsLimit: params?.paymentsLimit,
    checklistLimit: params?.checklistLimit,
  });
  return apiRequest(`/api/superadmin/dashboard-overview${query}`, {
    method: "GET",
  });
}

export type SuperAdminAnalyticsOverview = {
  success: boolean;
  cached?: boolean;
  generatedAt: number;
  schools: Array<Record<string, any>>;
  payments: Array<Record<string, any>>;
  events: Array<Record<string, any>>;
  activityLogs: Array<Record<string, any>>;
  studentCounts: Record<string, number>;
  months: Array<{ key: string; label: string }>;
  growthSeries: Array<{ label: string; value: number }>;
  revenueSeries: Array<{ label: string; value: number }>;
  activitySeries: Array<{ label: string; value: number }>;
  totals: {
    totalSchools: number;
    activeSchools: number;
    totalStudents: number;
    avgStudents: number;
    newSchoolsThisMonth: number;
    newSchoolsLastMonth: number;
    growthRate: number;
    successfulRevenue: number;
    successfulPayments: number;
    issuePayments: number;
  };
  topActiveSchools: Array<Record<string, any>>;
  featureUsage: Array<{ key: string; value: number }>;
};

export async function getSuperAdminAnalyticsOverview(params?: {
  forceRefresh?: boolean;
  schoolsLimit?: number;
  paymentsLimit?: number;
  eventsLimit?: number;
  activityLimit?: number;
}): Promise<SuperAdminAnalyticsOverview> {
  const query = buildQueryString({
    forceRefresh: params?.forceRefresh ? 1 : undefined,
    schoolsLimit: params?.schoolsLimit,
    paymentsLimit: params?.paymentsLimit,
    eventsLimit: params?.eventsLimit,
    activityLimit: params?.activityLimit,
  });
  return apiRequest(`/api/superadmin/analytics-overview${query}`, {
    method: "GET",
  });
}

export type SuperAdminPagedResponse<T> = {
  success: boolean;
  cached?: boolean;
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
};

export async function getSuperAdminSchoolsPage(params?: {
  limit?: number;
  cursor?: string | null;
  forceRefresh?: boolean;
}): Promise<SuperAdminPagedResponse<Record<string, any>>> {
  const query = buildQueryString({
    limit: params?.limit,
    cursor: params?.cursor || undefined,
    forceRefresh: params?.forceRefresh ? 1 : undefined,
  });
  return apiRequest(`/api/superadmin/schools-page${query}`, { method: "GET" });
}

export async function getSuperAdminUsersPage(params?: {
  limit?: number;
  cursor?: string | null;
  excludeSuperAdmins?: boolean;
  forceRefresh?: boolean;
}): Promise<SuperAdminPagedResponse<Record<string, any>>> {
  const query = buildQueryString({
    limit: params?.limit,
    cursor: params?.cursor || undefined,
    excludeSuperAdmins:
      params?.excludeSuperAdmins === undefined
        ? 1
        : params.excludeSuperAdmins
          ? 1
          : 0,
    forceRefresh: params?.forceRefresh ? 1 : undefined,
  });
  return apiRequest(`/api/superadmin/users-page${query}`, { method: "GET" });
}

export async function getSuperAdminPaymentsPage(params?: {
  limit?: number;
  cursor?: string | null;
  forceRefresh?: boolean;
}): Promise<SuperAdminPagedResponse<Record<string, any>>> {
  const query = buildQueryString({
    limit: params?.limit,
    cursor: params?.cursor || undefined,
    forceRefresh: params?.forceRefresh ? 1 : undefined,
  });
  return apiRequest(`/api/superadmin/payments-page${query}`, { method: "GET" });
}

export async function getSuperAdminBackupsPage(params?: {
  limit?: number;
  cursor?: string | null;
  includeSchools?: boolean;
  forceRefresh?: boolean;
}): Promise<
  SuperAdminPagedResponse<Record<string, any>> & {
    schools?: Array<{ id: string; name: string }>;
  }
> {
  const query = buildQueryString({
    limit: params?.limit,
    cursor: params?.cursor || undefined,
    includeSchools:
      params?.includeSchools === undefined
        ? 1
        : params.includeSchools
          ? 1
          : 0,
    forceRefresh: params?.forceRefresh ? 1 : undefined,
  });
  return apiRequest(`/api/superadmin/backups-page${query}`, { method: "GET" });
}

export type SuperAdminRequestStatusBuckets = {
  success2xx: number;
  redirect3xx: number;
  client4xx: number;
  server5xx: number;
  rateLimited429: number;
  other: number;
};

export type SuperAdminRequestWindowMetrics = {
  totalRequests: number;
  requestsPerMinute: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  maxLatencyMs: number;
  errorRatePct: number;
  statusBuckets: SuperAdminRequestStatusBuckets;
};

export type SuperAdminSystemHealth = {
  success: boolean;
  generatedAt: number;
  runtime: {
    environment: string;
    nodeVersion: string;
    pid: number;
    platform: string;
    uptimeSeconds: number;
    cpuCores: number;
    loadAverage: number[];
    normalizedLoadPct: {
      oneMinute: number;
      fiveMinutes: number;
      fifteenMinutes: number;
    };
    memoryMb: {
      rss: number;
      heapUsed: number;
      heapTotal: number;
      heapLimit: number;
      external: number;
      arrayBuffers: number;
    };
  };
  requests: {
    active: number;
    retainedPoints: number;
    retentionMinutes: number;
    last1m: SuperAdminRequestWindowMetrics;
    last5m: SuperAdminRequestWindowMetrics;
    topSlowRoutes: Array<{
      route: string;
      requests: number;
      avgLatencyMs: number;
      p95LatencyMs: number;
      maxLatencyMs: number;
      errorRatePct: number;
    }>;
    problemRoutes: Array<{
      route: string;
      requests: number;
      errors: number;
      serverErrors: number;
      rateLimited: number;
      aborted: number;
      errorRatePct: number;
      lastStatusCode: number;
      lastSeenAt: number;
    }>;
  };
  limiters: {
    api: {
      windowMs: number;
      limit: number;
    };
    auth: {
      windowMs: number;
      limit: number;
    };
  };
  dependencies: {
    firestore: {
      status: "healthy" | "degraded" | "unavailable";
      latencyMs: number | null;
      checkedAt: number;
      error?: string | null;
    };
  };
  platform: {
    cached: boolean;
    cacheAgeMs: number;
    totals: {
      schools: number;
      activeSchools: number;
      students: number;
      users: number;
      schoolAdmins: number;
      teachers: number;
      parents: number;
    };
  };
  backgroundJobs: {
    invoiceNotifications: {
      queued: number;
      active: number;
      concurrency: number;
    };
  };
  ops: {
    status: "healthy" | "degraded" | "critical";
    headline: string;
    summary: string;
    findings: Array<{
      severity: "info" | "warning" | "critical";
      title: string;
      detail: string;
    }>;
    recommendations: string[];
  };
};

export async function getSuperAdminSystemHealth(): Promise<SuperAdminSystemHealth> {
  return apiRequest("/api/superadmin/system-health", { method: "GET" });
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

export async function initiateSmsTopup(payload: {
  amount: number;
  currency?: "GHS";
  metadata?: Record<string, any>;
}): Promise<{
  authorizationUrl: string;
  reference: string;
}> {
  return apiRequest("/api/billing/sms-initiate", {
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
    | "update_school_admin_email"
    | "reset_school_admin_password"
    | "provision_user"
    | "set_school_status"
    | "set_school_plan"
    | "set_school_feature_plan"
    | "upsert_plan"
    | "delete_plan"
    | "assign_school_subscription_plan"
    | "create_platform_broadcast";
  description?: string;
  payload?: Record<string, any>;
};

export type AiUndoMeta = {
  undoToken: string;
  actionType: AiChatAction["type"];
  undoBefore?: number;
};

export type AiActionValidationResult = {
  valid: boolean;
  type: AiChatAction["type"];
  description: string;
  payload: Record<string, any>;
  missingFields: string[];
  warnings: string[];
  canUndo: boolean;
};

export async function superAdminAiChat(payload: {
  messages: AiChatMessage[];
}): Promise<{
  reply: string;
  action?: AiChatAction | null;
  mode?: "local" | "deepseek";
  limitedMode?: boolean;
  dataAsOf?: number | null;
  responseMs?: number;
  contextWarning?: string | null;
}> {
  return apiRequest("/api/superadmin/ai-chat", {
    body: payload,
  });
}

export async function confirmSuperAdminAiAction(payload: {
  action: AiChatAction;
}): Promise<{
  success: boolean;
  actionType: string;
  result?: any;
  undo?: AiUndoMeta | null;
}> {
  return apiRequest("/api/superadmin/ai-action", {
    body: payload,
  });
}

export async function validateSuperAdminAiAction(payload: {
  action: AiChatAction;
}): Promise<AiActionValidationResult> {
  return apiRequest("/api/superadmin/ai-action-validate", {
    body: payload,
  });
}

export async function undoSuperAdminAiAction(payload: {
  undoToken: string;
}): Promise<{ success: boolean; actionType: string; message: string }> {
  return apiRequest("/api/superadmin/ai-action-undo", {
    body: payload,
  });
}

export async function submitSuperAdminAiFeedback(payload: {
  messageId: string;
  conversationId: string;
  rating: "up" | "down";
  message: string;
}): Promise<{ success: boolean }> {
  return apiRequest("/api/superadmin/ai-feedback", {
    body: payload,
  });
}

export async function getSuperAdminAiMetrics(): Promise<{
  success: boolean;
  periodDays: number;
  totalChats: number;
  avgResponseMs: number;
  p95ResponseMs: number;
  fallbackRate: number;
  actionSuccessRate: number;
  feedbackPositiveRate: number;
  positiveFeedback: number;
  negativeFeedback: number;
  googleAi: {
    status:
      | "healthy"
      | "tracking"
      | "warning"
      | "critical"
      | "degraded"
      | "exhausted";
    model: string;
    resetTimeZone: string;
    limits: {
      requestsPerMinute: number | null;
      tokensPerMinute: number | null;
      requestsPerDay: number | null;
    };
    utilization: {
      requestsPerMinute: number | null;
      tokensPerMinute: number | null;
      requestsPerDay: number | null;
    };
    thisMinute: {
      requests: number;
      tokens: number;
    };
    today: {
      requests: number;
      promptTokens: number;
      outputTokens: number;
      totalTokens: number;
      failures: number;
      quotaHits: number;
      timeouts: number;
      activeSchools: number;
    };
    lastQuotaErrorAt: number | null;
    topSchools: Array<{
      schoolId: string;
      requests: number;
      tokens: number;
      failures: number;
    }>;
  };
}> {
  return apiRequest("/api/superadmin/ai-metrics", { method: "GET" });
}

export async function submitBookDemoRequest(payload: any): Promise<any> {
  return apiRequest("/api/public/book-demo", {
    body: payload,
    requiresAuth: false,
  });
}


export async function startPublicSchoolSetup(payload: any): Promise<any> {
  return apiRequest("/api/public/start-trial", {
    body: payload,
    requiresAuth: false,
  });
}

export async function resendPublicVerificationEmail(payload: {
  email: string;
}): Promise<{ success: boolean; message: string }> {
  return apiRequest("/api/public/resend-verification-email", {
    body: payload,
    requiresAuth: false,
  });
}

export async function sendParentDashboardNotice(payload: {
  message: string;
  type: "info" | "urgent";
  targetStudentIds: string[];
  targetClassId?: string | null;
  targetClassName?: string | null;
}): Promise<{ success: boolean; notice: any; message: string }> {
  return apiRequest("/api/admin/parent-notices", {
    body: payload,
  });
}

export async function getParentDashboardNoticeHistory(): Promise<{
  success: boolean;
  notices: any[];
}> {
  return apiRequest("/api/admin/parent-notices/history", {
    method: "GET",
  });
}

export async function deleteParentDashboardNotice(noticeId: string): Promise<{
  success: boolean;
  message: string;
}> {
  return apiRequest(`/api/admin/parent-notices/${encodeURIComponent(noticeId)}`, {
    method: "DELETE",
  });
}

export async function getParentDashboardNotices(params: {
  schoolId: string;
  studentId: string;
  classId?: string;
  className?: string;
}): Promise<{ success: boolean; notices: any[] }> {
  const query = buildQueryString(params);
  return apiRequest(`/api/parent/notices${query}`, {
    method: "GET",
  });
}

export async function markParentDashboardNoticeRead(payload: {
  noticeId: string;
  schoolId: string;
  studentId: string;
  parentName?: string;
}): Promise<{ success: boolean; message: string }> {
  return apiRequest(`/api/parent/notices/${encodeURIComponent(payload.noticeId)}/read`, {
    body: payload,
  });
}

export async function getPlatformBroadcastInbox(): Promise<{
  success: boolean;
  broadcasts: PlatformBroadcast[];
}> {
  return apiRequest("/api/platform-broadcasts/inbox", {
    method: "GET",
  });
}

export async function updatePlatformBroadcastReceipt(
  broadcastId: string,
  action: "impression" | "read" | "acknowledge" | "dismiss" | "snooze",
): Promise<{ success: boolean; receipt: Record<string, any> }> {
  return apiRequest(
    `/api/platform-broadcasts/${encodeURIComponent(broadcastId)}/receipt`,
    {
      body: { action },
    },
  );
}


export interface SuperAdminSmsOverview {
  success: boolean;
  provider: {
    balance: number;
    error: string | null;
    senderId: string;
    apiStatus?: "connected" | "error" | "unconfigured";
    credits?: {
      totalCredits: number;
      availableCredits: number;
      reservedCredits: number;
      currency: string;
      lastUpdated: string;
    };
    balanceBreakdown?: {
      smsBalance: number;
      voiceBalance: number;
      ussdBalance: number;
      totalBalance: number;
    };
    lastRefreshed?: string;
  };
  config: {
    retailRatePerSms: number;
    wholesaleRatePerSms: number;
    providerSenderId: string;
    smsBundleExpiryType?: "expiring" | "unexpiring";
    smsBundleExpiresAt?: number | null;
    smsBundles?: Array<{
      id: string;
      type: "expiring" | "unexpiring";
      messageCount: number;
      purchasedAt: number;
      expiresAt: number | null;
      label?: string;
    }>;
    updatedAt?: number;
    updatedBy?: string;
  };
  analytics: {
    totalSmsSent: number;
    totalRevenue: number;
    totalWholesaleCost: number;
    totalProfitMargin: number;
  };
  leaderboard: Array<{
    schoolId: string;
    schoolName: string;
    totalSms: number;
    totalCost: number;
  }>;
  transactions: Array<{
    id: string;
    schoolId: string;
    schoolName: string;
    amount: number;
    status: string;
    reference: string;
    adminEmail: string;
    createdAt: number;
  }>;
}

export async function getSuperAdminSmsOverview(): Promise<SuperAdminSmsOverview> {
  return apiRequest("/api/superadmin/sms/overview", { method: "GET" });
}

export async function updateSuperAdminSmsConfig(payload: {
  retailRatePerSms: number;
  wholesaleRatePerSms: number;
  providerSenderId: string;
  smsBundleExpiryType?: "expiring" | "unexpiring";
  smsBundleExpiresAt?: number | null;
  smsBundles?: Array<{
    id: string;
    type: "expiring" | "unexpiring";
    messageCount: number;
    purchasedAt: number;
    expiresAt: number | null;
    label?: string;
  }>;
}): Promise<{ success: boolean; message: string }> {
  return apiRequest("/api/superadmin/sms/config", { body: payload });
}

export async function checkSchoolTermRollover(): Promise<{
  success: boolean;
  changed: boolean;
  reason?: string;
  backupId?: string;
  nextPeriod?: { currentTerm: string; academicYear: string };
}> {
  return apiRequest("/api/schools/term-rollover/check", {
    method: "POST",
    body: {},
  });
}

export { BACKEND_URL };
