import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawn, spawnSync } from "child_process";
import dotenv from "dotenv";
import admin from "firebase-admin";
import { chromium } from "@playwright/test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const serverDir = path.join(repoRoot, "server");
const artifactsDir = path.join(repoRoot, "e2e-artifacts");

fs.mkdirSync(artifactsDir, { recursive: true });

dotenv.config({ path: path.join(serverDir, ".env.local") });
dotenv.config({ path: path.join(repoRoot, ".env.local") });

const serviceAccountRaw = String(
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY || "",
).trim();

if (!serviceAccountRaw) {
  throw new Error(
    "Missing FIREBASE_SERVICE_ACCOUNT_KEY in local environment configuration.",
  );
}

const serviceAccount = JSON.parse(serviceAccountRaw);
serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const FIREBASE_PROJECT_ID =
  process.env.VITE_FIREBASE_PROJECT_ID?.trim() ||
  serviceAccount.project_id ||
  "noble-care-management-system";
const FIREBASE_API_KEY =
  process.env.VITE_FIREBASE_API_KEY?.trim() ||
  "AIzaSyCHlCLhumJn50nw2JBgJTGeIH_6GKzjFbA";
const FIRESTORE_ROOT_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;
const IDENTITY_TOOLKIT_URL = "https://identitytoolkit.googleapis.com/v1";

const FRONTEND_PORT = process.env.E2E_FRONTEND_PORT || "5173";
const BACKEND_PORT = process.env.E2E_BACKEND_PORT || "3001";
const FRONTEND_BASE_URL = `http://127.0.0.1:${FRONTEND_PORT}`;
const FRONTEND_URL = `${FRONTEND_BASE_URL}/#/login`;
const FRONTEND_HEALTH_URL = FRONTEND_BASE_URL;
const BACKEND_HEALTH_URL = `http://127.0.0.1:${BACKEND_PORT}/health`;
const BROWSER_CHANNEL = process.env.E2E_BROWSER_CHANNEL || "msedge";
const BROWSER_EXECUTABLE = process.env.E2E_CHROME_PATH || "";
const TEST_PREFIX = `E2E ${Date.now()}`;
const superAdminEmail = `e2e.superadmin.${Date.now()}@schoolmanagergh.test`;
const schoolAdminEmail = `e2e.schooladmin.${Date.now()}@schoolmanagergh.test`;
const sharedPassword = `E2E!${Date.now()}Aa`;
const schoolName = `${TEST_PREFIX} Academy`;

const startedProcesses = [];
const state = {
  superAdminUid: null,
  schoolAdminUid: null,
  schoolId: null,
  superAdminIdToken: null,
  schoolAdminIdToken: null,
};

const appendLog = (name, message) => {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFileSync(path.join(artifactsDir, `${name}.log`), line);
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const canReachHttp = async (url) => {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
};

const waitForCondition = async (
  label,
  callback,
  timeoutMs = 60000,
  intervalMs = 1000,
) => {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const result = await callback();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await wait(intervalMs);
  }

  const suffix =
    lastError instanceof Error ? ` Last error: ${lastError.message}` : "";
  throw new Error(`Timed out waiting for ${label}.${suffix}`);
};

const waitForHttp = async (url, timeoutMs = 120000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // keep retrying
    }
    await wait(1000);
  }
  throw new Error(`Timed out waiting for ${url}`);
};

const spawnProcess = (name, command, args, cwd, envOverrides = {}) => {
  const child = spawn("cmd.exe", ["/d", "/s", "/c", command, ...args], {
    cwd,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    env: {
      ...process.env,
      ...envOverrides,
    },
  });
  startedProcesses.push(child);
  child.stdout.on("data", (data) => appendLog(name, data.toString().trim()));
  child.stderr.on("data", (data) => appendLog(name, data.toString().trim()));
  child.on("exit", (code) => appendLog(name, `process exited with code ${code}`));
  return child;
};

const ensureService = async ({
  name,
  healthUrl,
  command,
  args,
  cwd,
  envOverrides,
}) => {
  if (await canReachHttp(healthUrl)) {
    appendLog(name, `reusing existing service at ${healthUrl}`);
    return;
  }

  spawnProcess(name, command, args, cwd, envOverrides);
  await waitForHttp(healthUrl);
};

const fetchJson = async (label, url, options = {}) => {
  const response = await fetch(url, options);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.error ||
      data?.message ||
      response.statusText ||
      "Request failed";
    throw new Error(`${label} failed (${response.status}): ${message}`);
  }

  return data;
};

const identityRequest = async (endpoint, body) =>
  fetchJson(
    endpoint,
    `${IDENTITY_TOOLKIT_URL}/${endpoint}?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

const signUpWithEmailPassword = async (email, password) =>
  identityRequest("accounts:signUp", {
    email,
    password,
    returnSecureToken: true,
  });

const signInWithEmailPassword = async (email, password) =>
  identityRequest("accounts:signInWithPassword", {
    email,
    password,
    returnSecureToken: true,
  });

const signInWithCustomToken = async (token) =>
  identityRequest("accounts:signInWithCustomToken", {
    token,
    returnSecureToken: true,
  });

const deleteAuthAccount = async (idToken) =>
  identityRequest("accounts:delete", { idToken });

const toFirestoreValue = (value) => {
  if (value === null) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map((item) => toFirestoreValue(item)),
      },
    };
  }
  if (typeof value === "object") {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(value)
            .filter(([, entryValue]) => entryValue !== undefined)
            .map(([key, entryValue]) => [key, toFirestoreValue(entryValue)]),
        ),
      },
    };
  }
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  return { stringValue: String(value) };
};

const fromFirestoreValue = (value) => {
  if (!value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  if ("arrayValue" in value) {
    return (value.arrayValue.values || []).map((item) => fromFirestoreValue(item));
  }
  if ("mapValue" in value) {
    return Object.fromEntries(
      Object.entries(value.mapValue.fields || {}).map(([key, item]) => [
        key,
        fromFirestoreValue(item),
      ]),
    );
  }
  return null;
};

const firestoreHeaders = (idToken) => ({
  Authorization: `Bearer ${idToken}`,
  "Content-Type": "application/json",
});

const setFirestoreDocument = async (documentPath, data, idToken) =>
  fetchJson("firestore patch", `${FIRESTORE_ROOT_URL}/${documentPath}`, {
    method: "PATCH",
    headers: firestoreHeaders(idToken),
    body: JSON.stringify({
      fields: Object.fromEntries(
        Object.entries(data)
          .filter(([, value]) => value !== undefined)
          .map(([key, value]) => [key, toFirestoreValue(value)]),
      ),
    }),
  });

const deleteFirestoreDocument = async (documentPath, idToken) => {
  const response = await fetch(`${FIRESTORE_ROOT_URL}/${documentPath}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  if (!response.ok && response.status !== 404) {
    const message = await response.text();
    throw new Error(
      `firestore delete failed (${response.status}): ${message || response.statusText}`,
    );
  }
};

const deleteFirestoreDocumentByName = async (documentName, idToken) => {
  const response = await fetch(`https://firestore.googleapis.com/v1/${documentName}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  if (!response.ok && response.status !== 404) {
    const message = await response.text();
    throw new Error(
      `firestore delete failed (${response.status}): ${message || response.statusText}`,
    );
  }
};

const buildFieldFilter = ({ field, value }) => ({
  fieldFilter: {
    field: {
      fieldPath: field,
    },
    op: "EQUAL",
    value: toFirestoreValue(value),
  },
});

const runFirestoreQuery = async (
  { collectionId, filters = [], limit = null, parentPath = "" },
  idToken,
) => {
  const where =
    filters.length === 0
      ? undefined
      : filters.length === 1
        ? buildFieldFilter(filters[0])
        : {
            compositeFilter: {
              op: "AND",
              filters: filters.map((filter) => buildFieldFilter(filter)),
            },
          };

  const response = await fetchJson(
    "firestore query",
    `${FIRESTORE_ROOT_URL}${parentPath ? `/${parentPath}` : ""}:runQuery`,
    {
      method: "POST",
      headers: firestoreHeaders(idToken),
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId }],
          ...(where ? { where } : {}),
          ...(limit ? { limit } : {}),
        },
      }),
    },
  );

  return (response || [])
    .filter((entry) => entry.document)
    .map(({ document }) => ({
      name: document.name,
      id: document.name.split("/").pop(),
      data: Object.fromEntries(
        Object.entries(document.fields || {}).map(([key, value]) => [
          key,
          fromFirestoreValue(value),
        ]),
      ),
    }));
};

const getUserByEmail = async (email) => {
  const results = await runFirestoreQuery(
    {
      collectionId: "users",
      filters: [{ field: "email", value: email }],
      limit: 1,
    },
    state.superAdminIdToken,
  );
  return results[0] || null;
};

const getSchoolBackupCount = async (schoolId) => {
  const results = await runFirestoreQuery(
    {
      collectionId: "backups",
      filters: [{ field: "schoolId", value: schoolId }],
    },
    state.superAdminIdToken,
  );
  return results.length;
};

const hasActivityEvent = async (schoolId, eventType) => {
  const topLevelResults = await runFirestoreQuery(
    {
      collectionId: "activity_logs",
      filters: [
        { field: "schoolId", value: schoolId },
        { field: "eventType", value: eventType },
      ],
      limit: 1,
    },
    state.superAdminIdToken,
  ).catch(() => []);
  if (topLevelResults.length > 0) {
    return true;
  }

  const schoolScopedResults = await runFirestoreQuery(
    {
      collectionId: "activityLogs",
      parentPath: `schools/${schoolId}`,
      filters: [{ field: "actionType", value: eventType }],
      limit: 1,
    },
    state.superAdminIdToken,
  ).catch(() => []);
  return schoolScopedResults.length > 0;
};

const deleteSchoolScopedCollection = async (collectionId, schoolId) => {
  const docs = await runFirestoreQuery(
    {
      collectionId,
      filters: [{ field: "schoolId", value: schoolId }],
    },
    state.superAdminIdToken,
  );

  for (const doc of docs) {
    await deleteFirestoreDocumentByName(doc.name, state.superAdminIdToken);
  }
};

const deleteNestedCollection = async (parentPath, collectionId) => {
  const docs = await runFirestoreQuery(
    {
      collectionId,
      parentPath,
    },
    state.superAdminIdToken,
  );

  for (const doc of docs) {
    await deleteFirestoreDocumentByName(doc.name, state.superAdminIdToken);
  }
};

const attachPageDiagnostics = (page, label, diagnostics) => {
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      diagnostics.consoleErrors.push(`[${label}] ${msg.text()}`);
    }
  });

  page.on("pageerror", (error) => {
    diagnostics.pageErrors.push(`[${label}] ${error.message}`);
  });

  page.on("requestfailed", (request) => {
    const failure = request.failure();
    diagnostics.requestFailures.push(
      `[${label}] ${request.method()} ${request.url()} :: ${failure?.errorText || "unknown error"}`,
    );
  });
};

const captureFailureSnapshot = async (page, label) => {
  if (!page || page.isClosed()) return;

  const safeLabel = label.replace(/[^a-z0-9-_]/gi, "-").toLowerCase();
  await page.screenshot({
    path: path.join(artifactsDir, `${safeLabel}.png`),
    fullPage: true,
  });
  fs.writeFileSync(
    path.join(artifactsDir, `${safeLabel}.html`),
    await page.content(),
  );
};

const cleanupSchoolData = async () => {
  if (!state.superAdminIdToken) return;

  if (state.schoolId) {
    const schoolId = state.schoolId;
    const topLevelCollections = [
      "students",
      "attendance",
      "assessments",
      "teacher_attendance",
      "notices",
      "student_remarks",
      "student_skills",
      "admin_remarks",
      "admin_notifications",
      "timetables",
      "class_subjects",
      "backups",
      "payments",
      "fees",
      "student_ledgers",
      "activity_logs",
    ];

    for (const collectionName of topLevelCollections) {
      await deleteSchoolScopedCollection(collectionName, schoolId).catch((error) => {
        appendLog(
          "cleanup",
          `failed deleting ${collectionName}: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }

    const schoolUsers = await runFirestoreQuery(
      {
        collectionId: "users",
        filters: [{ field: "schoolId", value: schoolId }],
      },
      state.superAdminIdToken,
    ).catch(() => []);

    for (const userDoc of schoolUsers) {
      await deleteFirestoreDocumentByName(
        userDoc.name,
        state.superAdminIdToken,
      ).catch((error) => {
        appendLog(
          "cleanup",
          `failed deleting school user doc ${userDoc.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }

    await deleteNestedCollection(`schools/${schoolId}`, "fees").catch(() => {});
    await deleteNestedCollection(`schools/${schoolId}`, "feeLedgers").catch(
      () => {},
    );
    await deleteNestedCollection(`schools/${schoolId}`, "payments").catch(
      () => {},
    );
    await deleteNestedCollection(`schools/${schoolId}`, "activityLogs").catch(
      () => {},
    );

    await deleteFirestoreDocument(
      `schools/${schoolId}/financeSettings/main`,
      state.superAdminIdToken,
    ).catch(() => {});
    await deleteFirestoreDocument(
      `settings/${schoolId}`,
      state.superAdminIdToken,
    ).catch(() => {});
    await deleteFirestoreDocument(
      `schools/${schoolId}`,
      state.superAdminIdToken,
    ).catch(() => {});
  }

  if (state.schoolAdminIdToken) {
    await deleteAuthAccount(state.schoolAdminIdToken).catch((error) => {
      appendLog(
        "cleanup",
        `failed deleting school admin auth user: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  if (state.superAdminUid) {
    await deleteFirestoreDocument(
      `users/${state.superAdminUid}`,
      state.superAdminIdToken,
    ).catch(() => {});
  }

  if (state.superAdminIdToken) {
    await deleteAuthAccount(state.superAdminIdToken).catch((error) => {
      appendLog(
        "cleanup",
        `failed deleting super admin auth user: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }
};

const createSuperAdmin = async () => {
  const signUpResult = await signUpWithEmailPassword(
    superAdminEmail,
    sharedPassword,
  );
  state.superAdminUid = signUpResult.localId;

  const customToken = await admin.auth().createCustomToken(signUpResult.localId, {
    role: "super_admin",
    userRole: "super_admin",
  });
  const elevatedSession = await signInWithCustomToken(customToken);
  state.superAdminIdToken = elevatedSession.idToken;

  await setFirestoreDocument(
    `users/${signUpResult.localId}`,
    {
      id: signUpResult.localId,
      fullName: "E2E Super Admin",
      email: superAdminEmail,
      role: "super_admin",
      status: "active",
      createdAt: new Date(),
    },
    state.superAdminIdToken,
  );
};

const runBrowserFlow = async () => {
  if (BROWSER_EXECUTABLE && !fs.existsSync(BROWSER_EXECUTABLE)) {
    throw new Error(
      `Browser executable not found at ${BROWSER_EXECUTABLE}. Set E2E_CHROME_PATH to a valid browser.`,
    );
  }

  const browser = await chromium.launch({
    ...(BROWSER_EXECUTABLE
      ? { executablePath: BROWSER_EXECUTABLE }
      : { channel: BROWSER_CHANNEL }),
    headless: true,
    timeout: 180000,
  });

  const diagnostics = {
    consoleErrors: [],
    pageErrors: [],
    requestFailures: [],
  };

  let activePage = null;
  let superAdminContext = null;
  let schoolAdminContext = null;

  try {
    superAdminContext = await browser.newContext();
    const superAdminPage = await superAdminContext.newPage();
    activePage = superAdminPage;
    superAdminPage.setDefaultTimeout(120000);
    superAdminPage.setDefaultNavigationTimeout(120000);

    attachPageDiagnostics(superAdminPage, "super-admin", diagnostics);

    await superAdminPage.goto(FRONTEND_URL, { waitUntil: "domcontentloaded" });
    await superAdminPage.locator('input[type="email"]').fill(superAdminEmail);
    await superAdminPage.locator('input[type="password"]').fill(sharedPassword);
    await superAdminPage.getByRole("button", { name: "Sign In" }).click();
    await superAdminPage.waitForURL(
      (url) => !url.toString().includes("/login"),
      { timeout: 60000 },
    );
    await superAdminPage.goto(`${FRONTEND_BASE_URL}/#/super-admin/schools`, {
      waitUntil: "domcontentloaded",
    });

    await superAdminPage.getByRole("button", { name: /^Create School$/ }).click();
    const schoolModal = superAdminPage.locator("form").filter({
      has: superAdminPage.getByPlaceholder("Enter school name"),
    });
    await schoolModal.getByPlaceholder("Enter school name").fill(schoolName);
    await schoolModal.getByPlaceholder("School phone number").fill("0240000000");
    await schoolModal.getByPlaceholder("School address").fill("Accra, Ghana");
    await schoolModal.locator("select").nth(0).selectOption("free");
    await schoolModal.locator("select").nth(1).selectOption("standard");
    await schoolModal.getByRole("button", { name: "Create School" }).click();

    await superAdminPage.locator("tr", { hasText: schoolName }).waitFor({
      state: "visible",
      timeout: 60000,
    });

    const schoolRow = superAdminPage.locator("tr", { hasText: schoolName });
    await schoolRow.getByTitle("View Details").click();
    await superAdminPage.waitForURL(/super-admin\/schools\/.+/, {
      timeout: 60000,
    });
    state.schoolId = superAdminPage.url().split("/").pop();

    const adminCard = superAdminPage.locator("section").filter({
      hasText: "School Admin Access",
    });
    await adminCard.getByRole("button", { name: /^Create Admin$/ }).click();

    const adminModal = superAdminPage.locator("form").filter({
      has: superAdminPage.getByPlaceholder("Enter admin email"),
    });
    await adminModal
      .getByPlaceholder("Enter admin full name")
      .fill("E2E School Admin");
    await adminModal.getByPlaceholder("Enter admin email").fill(schoolAdminEmail);
    await adminModal
      .getByPlaceholder("Leave blank to send reset link")
      .fill(sharedPassword);
    await adminModal.getByRole("button", { name: "Create Admin" }).click();

    const schoolAdminUser = await waitForCondition(
      "school admin provisioning",
      async () => {
        const userDoc = await getUserByEmail(schoolAdminEmail);
        if (!userDoc) return false;

        const authSession = await signInWithEmailPassword(
          schoolAdminEmail,
          sharedPassword,
        );
        state.schoolAdminUid = authSession.localId;
        state.schoolAdminIdToken = authSession.idToken;
        return userDoc;
      },
      120000,
      3000,
    );

    if (!schoolAdminUser) {
      throw new Error("School admin was not created through the UI flow.");
    }

    schoolAdminContext = await browser.newContext();
    const schoolAdminPage = await schoolAdminContext.newPage();
    activePage = schoolAdminPage;
    schoolAdminPage.setDefaultTimeout(120000);
    schoolAdminPage.setDefaultNavigationTimeout(120000);

    attachPageDiagnostics(schoolAdminPage, "school-admin", diagnostics);

    await schoolAdminPage.goto(FRONTEND_URL, { waitUntil: "domcontentloaded" });
    await schoolAdminPage.locator('input[type="email"]').fill(schoolAdminEmail);
    await schoolAdminPage.locator('input[type="password"]').fill(sharedPassword);
    await schoolAdminPage.getByRole("button", { name: "Sign In" }).click();
    await schoolAdminPage.waitForURL(
      (url) => !url.toString().includes("/login"),
      { timeout: 60000 },
    );
    await schoolAdminPage.goto(`${FRONTEND_BASE_URL}/#/admin/students`, {
      waitUntil: "domcontentloaded",
    });

    await schoolAdminPage.getByRole("button", { name: "Add Student" }).click();
    const studentModal = schoolAdminPage.locator("form").filter({
      has: schoolAdminPage.getByPlaceholder("e.g. Kwame Nkrumah Jnr"),
    });
    await studentModal
      .getByPlaceholder("e.g. Kwame Nkrumah Jnr")
      .fill("E2E Student");
    await studentModal.locator('input[type="date"]').fill("2018-01-15");
    await studentModal
      .getByPlaceholder("e.g. Mr. John Doe")
      .fill("E2E Guardian");
    await studentModal
      .getByPlaceholder("e.g. 024 123 4567")
      .fill("0241111111");
    await studentModal.getByRole("button", { name: "Save Student" }).click();
    await schoolAdminPage.locator("text=E2E Student").waitFor({
      state: "visible",
      timeout: 60000,
    });

    const initialBackupCount = await getSchoolBackupCount(state.schoolId);

    await schoolAdminPage.goto(`${FRONTEND_BASE_URL}/#/admin/settings`, {
      waitUntil: "domcontentloaded",
    });
    await schoolAdminPage
      .getByRole("button", { name: /Create Current Term Backup/i })
      .click();
    await waitForCondition(
      "manual backup creation",
      async () => {
        const backupCount = await getSchoolBackupCount(state.schoolId);
        return backupCount > initialBackupCount;
      },
      90000,
      2000,
    );

    await schoolAdminPage.goto(`${FRONTEND_BASE_URL}/#/admin/backups`, {
      waitUntil: "domcontentloaded",
    });
    await schoolAdminPage.locator("text=Available Backups").waitFor({
      state: "visible",
      timeout: 60000,
    });
    await schoolAdminPage.getByTitle("Restore Backup").first().click();
    const restoreModal = schoolAdminPage.locator("div.fixed.inset-0").filter({
      has: schoolAdminPage.getByText("Confirm Restore"),
    });
    await restoreModal.waitFor({
      state: "visible",
      timeout: 30000,
    });
    await restoreModal.getByRole("button", { name: "Restore" }).click();
    await waitForCondition(
      "backup restore completion",
      async () => hasActivityEvent(state.schoolId, "backup_restored"),
      120000,
      3000,
    );

    await schoolAdminPage.goto(`${FRONTEND_BASE_URL}/#/admin/students`, {
      waitUntil: "domcontentloaded",
    });
    await schoolAdminPage.locator("text=E2E Student").waitFor({
      state: "visible",
      timeout: 60000,
    });

    await schoolAdminPage.goto(`${FRONTEND_BASE_URL}/#/admin/fees`, {
      waitUntil: "domcontentloaded",
    });
    await schoolAdminPage
      .getByRole("heading", { name: "Finance & Payments", exact: true })
      .waitFor({
      state: "visible",
      timeout: 60000,
    });

    return diagnostics;
  } catch (error) {
    await captureFailureSnapshot(activePage, "browser-failure");
    if (diagnostics.consoleErrors.length > 0) {
      appendLog("run", `console errors: ${JSON.stringify(diagnostics.consoleErrors)}`);
    }
    if (diagnostics.pageErrors.length > 0) {
      appendLog("run", `page errors: ${JSON.stringify(diagnostics.pageErrors)}`);
    }
    if (diagnostics.requestFailures.length > 0) {
      appendLog("run", `request failures: ${JSON.stringify(diagnostics.requestFailures)}`);
    }
    throw error;
  } finally {
    if (schoolAdminContext) {
      await schoolAdminContext.close().catch(() => {});
    }
    if (superAdminContext) {
      await superAdminContext.close().catch(() => {});
    }
    await browser.close().catch(() => {});
  }
};

const main = async () => {
  await createSuperAdmin();

  await ensureService({
    name: "backend",
    healthUrl: BACKEND_HEALTH_URL,
    command: "npm.cmd",
    args: ["run", "dev"],
    cwd: serverDir,
    envOverrides: {
      PORT: BACKEND_PORT,
    },
  });
  await ensureService({
    name: "frontend",
    healthUrl: FRONTEND_HEALTH_URL,
    command: "npm.cmd",
    args: ["run", "dev", "--", "--host", "127.0.0.1", "--port", FRONTEND_PORT],
    cwd: repoRoot,
  });

  const result = await runBrowserFlow();
  const summary = {
    success: true,
    schoolName,
    superAdminEmail,
    schoolAdminEmail,
    schoolId: state.schoolId,
    consoleErrors: result.consoleErrors,
    pageErrors: result.pageErrors,
    requestFailures: result.requestFailures,
  };
  fs.writeFileSync(
    path.join(artifactsDir, "e2e-browser-summary.json"),
    JSON.stringify(summary, null, 2),
  );
  console.log(JSON.stringify(summary, null, 2));
};

try {
  await main();
} catch (error) {
  appendLog(
    "run",
    `fatal error: ${error instanceof Error ? error.stack || error.message : String(error)}`,
  );
  const failure = {
    success: false,
    error: error instanceof Error ? error.message : String(error),
    schoolName,
    superAdminEmail,
    schoolAdminEmail,
    schoolId: state.schoolId,
  };
  fs.writeFileSync(
    path.join(artifactsDir, "e2e-browser-summary.json"),
    JSON.stringify(failure, null, 2),
  );
  console.error(JSON.stringify(failure, null, 2));
  process.exitCode = 1;
} finally {
  for (const child of startedProcesses) {
    if (child.pid) {
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        windowsHide: true,
      });
    }
  }
  await cleanupSchoolData().catch((error) => {
    appendLog(
      "cleanup",
      `cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  });
}
