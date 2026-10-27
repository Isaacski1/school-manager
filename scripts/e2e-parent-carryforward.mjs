// Parent Dashboard carry-forward browser verification.
//
// Runs the real application (Vite dev server + Express backend) against a
// real Firebase project, logs in as a real parent, and checks what the parent
// actually sees for a rolled-over student.
//
// The seeded school, students, ledgers and payments are removed again when
// the run finishes, so no permanent test data is left behind.
//
// Usage: node scripts/e2e-parent-carryforward.mjs
// Screenshots and the report are written to e2e-artifacts/.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawn, spawnSync } from "child_process";
import dotenv from "dotenv";
import admin from "firebase-admin";
import { chromium } from "@playwright/test";

import {
  buildCarryForwardId,
  buildLedgerId,
} from "../services/termBalanceCarryForward.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const serverDir = path.join(repoRoot, "server");
const artifactsDir = path.join(repoRoot, "e2e-artifacts");

fs.mkdirSync(artifactsDir, { recursive: true });

dotenv.config({ path: path.join(serverDir, ".env") });
dotenv.config({ path: path.join(repoRoot, ".env") });

const serviceAccountRaw = String(
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY || "",
).trim();
if (!serviceAccountRaw) {
  throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_KEY in server/.env");
}
const serviceAccount = JSON.parse(serviceAccountRaw);
serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const FRONTEND_PORT = process.env.E2E_FRONTEND_PORT || "5173";
const BACKEND_PORT = process.env.E2E_BACKEND_PORT || "3001";
const FRONTEND_BASE_URL = `http://127.0.0.1:${FRONTEND_PORT}`;
const BACKEND_HEALTH_URL = `http://127.0.0.1:${BACKEND_PORT}/health`;
// Comma separated list of scenario groups to run in this invocation. Each
// group is a self-contained login + student + view so the whole run fits
// inside the backend's lifetime.
const SCENARIOS = (process.env.E2E_SCENARIOS || "A,G")
  .split(",")
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);

const STAMP = Date.now();
const V1_SCHOOL_ID = `e2e-parent-v1-${STAMP}`;
const V2_SCHOOL_ID = `e2e-parent-v2-${STAMP}`;
// A fresh phone number per run: a leftover parent account from an earlier run
// would otherwise keep its own school id in the auth claims.
const PHONE_TAIL = String(STAMP).slice(-6);
const PARENT_PHONE = `0244${PHONE_TAIL}`;
const V2_PARENT_PHONE = `0245${PHONE_TAIL}`;
const PARENT_UID = `+233${PARENT_PHONE.slice(1)}`;
const V2_PARENT_UID = `+233${V2_PARENT_PHONE.slice(1)}`;
const YEAR = "2026-2027";
const PREVIOUS_YEAR = "2025-2026";
const PREVIOUS_TERM = "Term 3";
const TERM = "Term 1";

const startedProcesses = [];
const state = { seededDocs: [], parentUids: [] };
const checks = [];

const appendLog = (name, message) => {
  fs.appendFileSync(
    path.join(artifactsDir, `parent-cf-${name}.log`),
    `[${new Date().toISOString()}] ${message}\n`,
  );
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

const waitForHttp = async (url, timeoutMs = 180000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await canReachHttp(url)) return;
    await wait(1000);
  }
  throw new Error(`Timed out waiting for ${url}`);
};

const ensureBackendUp = async (timeoutMs = 120000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await canReachHttp(BACKEND_HEALTH_URL)) return;
    await wait(2000);
  }
  throw new Error("Backend became unreachable during the run");
};

const spawnProcess = (name, command, args, cwd) => {
  const child = spawn("cmd.exe", ["/d", "/s", "/c", command, ...args], {
    cwd,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    env: { ...process.env },
  });
  startedProcesses.push(child);
  child.stdout.on("data", (data) => appendLog(name, String(data).trim()));
  child.stderr.on("data", (data) => appendLog(name, String(data).trim()));
  child.on("exit", (code) => appendLog(name, `process exited with code ${code}`));
  return child;
};

const record = (scenario, name, expected, actual, ok) => {
  checks.push({ scenario, name, expected, actual, ok });
  if (!ok) {
    throw new Error(
      `[${scenario}] ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
};

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

const db = admin.firestore();
const now = admin.firestore.Timestamp.now();

const track = (ref) => {
  state.seededDocs.push(ref.path);
  return ref;
};

const seedSchool = async ({ schoolId, financeVersion, name }) => {
  await track(db.collection("schools").doc(schoolId)).set({
    id: schoolId,
    name,
    phone: "0240000000",
    email: "e2e@example.test",
    address: "Accra, Ghana",
    plan: "standard",
    planTier: "standard",
    status: "active",
    currency: "GHS",
    createdAt: now,
  });
  await track(db.collection("settings").doc(schoolId)).set({
    schoolId,
    academicYear: YEAR,
    currentTerm: TERM,
    termEndDate: "2026-12-20",
    schoolReopenDate: "2026-01-05",
    vacationDate: "2026-08-01",
    holidayDates: [],
    createdAt: now,
  });
  await track(
    db.collection("schools").doc(schoolId).collection("financeSettings").doc("main"),
  ).set({ schoolId, financeVersion, updatedAt: now });
};

const seedStudent = async ({ schoolId, studentId, name, dob, phone }) => {
  await track(db.collection("students").doc(studentId)).set({
    id: studentId,
    schoolId,
    name,
    classId: "basic-7",
    className: "Basic 7",
    dob,
    gender: "Male",
    status: "active",
    admissionDate: "2024-09-02",
    fatherName: "E2E Father",
    fatherPhone: phone,
    motherName: "E2E Mother",
    motherPhone: phone,
    guardianName: "E2E Guardian",
    guardianPhone: phone,
    createdAt: now,
  });
};

const ledgerDoc = ({ schoolId, studentId, academicYear, term, fees }) => ({
  id: buildLedgerId(schoolId, studentId, academicYear, term),
  schoolId,
  studentId,
  classId: "basic-7",
  academicYear,
  term,
  fees,
  openingPaidAmount: 0,
  totalFee: fees.reduce((sum, fee) => sum + fee.amount, 0),
  status: "Active",
  createdAt: now,
  updatedAt: now,
});

const seedLedgers = async ({ schoolId, financeVersion, studentId, fees, payments }) => {
  const collectionRef =
    financeVersion === "v2"
      ? db.collection("schools").doc(schoolId).collection("feeLedgers")
      : db.collection("student_ledgers");
  const paymentsRef =
    financeVersion === "v2"
      ? db.collection("schools").doc(schoolId).collection("payments")
      : db.collection("payments");

  for (const ledger of fees) {
    await track(
      collectionRef.doc(
        buildLedgerId(schoolId, studentId, ledger.academicYear, ledger.term),
      ),
    ).set(ledgerDoc({ schoolId, studentId, ...ledger }));
  }

  for (const payment of payments) {
    await track(paymentsRef.doc(payment.id)).set({
      ...payment,
      schoolId,
      studentId,
      classId: "basic-7",
      paymentMethod: "MoMo",
      recordedBy: "admin",
      isOpeningPayment: false,
      createdAt: now,
    });
  }
};

/**
 * Student A - the canonical carry-forward scenario.
 *   previous term : 500 due, 300 paid, 200 outstanding
 *   current term  : 200 carried forward + 600 tuition
 *   new term payment : 300 (portal shape, no allocation)
 */
const seedCanonicalStudent = async ({ schoolId, financeVersion, studentId, phone, name }) => {
  const carryForwardFeeId = buildCarryForwardId(
    schoolId,
    studentId,
    PREVIOUS_YEAR,
    PREVIOUS_TERM,
  );
  const carryForwardEntry = {
    feeId: carryForwardFeeId,
    feeName: `Carried Balance (${PREVIOUS_TERM}, ${PREVIOUS_YEAR})`,
    amount: 200,
    openingPaidAmount: 0,
    openingBalance: 200,
    openingStatus: "Unpaid",
    openingPaidDate: null,
  };

  await seedStudent({ schoolId, studentId, name, dob: "2015-03-10", phone });

  await seedLedgers({
    schoolId,
    financeVersion,
    studentId,
    fees: [
      {
        academicYear: PREVIOUS_YEAR,
        term: PREVIOUS_TERM,
        fees: [
          {
            feeId: "fee-tuition",
            feeName: "Tuition",
            amount: 500,
            openingPaidAmount: 0,
            openingStatus: "Unpaid",
          },
        ],
      },
      {
        academicYear: YEAR,
        term: TERM,
        fees: [
          carryForwardEntry,
          {
            feeId: "fee-tuition",
            feeName: "Tuition",
            amount: 600,
            openingPaidAmount: 0,
            openingStatus: "Unpaid",
          },
        ],
      },
    ],
    payments: [
      {
        id: `${studentId}-prev-payment`,
        feeId: "fee-tuition",
        feeName: "Tuition",
        amountPaid: 300,
        academicYear: PREVIOUS_YEAR,
        term: PREVIOUS_TERM,
      },
      {
        id: `${studentId}-current-payment`,
        feeId: "online_payment",
        feeName: "Online Payment",
        amountPaid: 300,
        academicYear: YEAR,
        term: TERM,
      },
    ],
  });
};

/**
 * Student B - isolation check, no carry-forward at all.
 */
const seedIsolationStudent = async ({ schoolId, financeVersion, studentId, phone, name }) => {
  await seedStudent({ schoolId, studentId, name, dob: "2016-07-22", phone });
  await seedLedgers({
    schoolId,
    financeVersion,
    studentId,
    fees: [
      {
        academicYear: YEAR,
        term: TERM,
        fees: [
          {
            feeId: "fee-tuition",
            feeName: "Tuition",
            amount: 900,
            openingPaidAmount: 0,
            openingStatus: "Unpaid",
          },
        ],
      },
    ],
    payments: [
      {
        id: `${studentId}-payment`,
        feeId: "fee-tuition",
        feeName: "Tuition",
        amountPaid: 400,
        academicYear: YEAR,
        term: TERM,
      },
    ],
  });
};

/**
 * Student C - the carry-forward is already fully paid, recorded with the
 * administrator auto-allocation shape.
 */
const seedClearedStudent = async ({ schoolId, financeVersion, studentId, phone, name }) => {
  const carryForwardFeeId = buildCarryForwardId(
    schoolId,
    studentId,
    PREVIOUS_YEAR,
    PREVIOUS_TERM,
  );

  await seedStudent({ schoolId, studentId, name, dob: "2017-11-02", phone });

  await seedLedgers({
    schoolId,
    financeVersion,
    studentId,
    fees: [
      {
        academicYear: YEAR,
        term: TERM,
        fees: [
          {
            feeId: carryForwardFeeId,
            feeName: `Carried Balance (${PREVIOUS_TERM}, ${PREVIOUS_YEAR})`,
            amount: 200,
            openingPaidAmount: 0,
            openingBalance: 200,
            openingStatus: "Unpaid",
            openingPaidDate: null,
          },
          {
            feeId: "fee-tuition",
            feeName: "Tuition",
            amount: 600,
            openingPaidAmount: 0,
            openingStatus: "Unpaid",
          },
        ],
      },
    ],
    payments: [
      {
        id: `${studentId}-auto-allocation`,
        feeId: "__OVERPAYMENT__",
        feeName: "Auto Allocation",
        amountPaid: 200,
        academicYear: YEAR,
        term: TERM,
        allocations: [
          {
            feeId: carryForwardFeeId,
            feeName: `Carried Balance (${PREVIOUS_TERM}, ${PREVIOUS_YEAR})`,
            amountPaid: 200,
            isOverpayment: false,
          },
        ],
      },
    ],
  });
};

const seedAll = async () => {
  await seedSchool({
    schoolId: V1_SCHOOL_ID,
    financeVersion: "v1",
    name: "E2E Parent V1 Academy",
  });
  await seedSchool({
    schoolId: V2_SCHOOL_ID,
    financeVersion: "v2",
    name: "E2E Parent V2 Academy",
  });

  await seedCanonicalStudent({
    schoolId: V1_SCHOOL_ID,
    financeVersion: "v1",
    studentId: `${V1_SCHOOL_ID}-student-a`,
    phone: PARENT_PHONE,
    name: "E2E Child Carry Forward",
  });
  await seedIsolationStudent({
    schoolId: V1_SCHOOL_ID,
    financeVersion: "v1",
    studentId: `${V1_SCHOOL_ID}-student-b`,
    phone: PARENT_PHONE,
    name: "E2E Child Isolated",
  });
  await seedClearedStudent({
    schoolId: V1_SCHOOL_ID,
    financeVersion: "v1",
    studentId: `${V1_SCHOOL_ID}-student-c`,
    phone: PARENT_PHONE,
    name: "E2E Child Cleared",
  });
  await seedCanonicalStudent({
    schoolId: V2_SCHOOL_ID,
    financeVersion: "v2",
    studentId: `${V2_SCHOOL_ID}-student-a`,
    phone: V2_PARENT_PHONE,
    name: "E2E Child Carry Forward",
  });
};

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

const cleanup = async () => {
  for (const docPath of state.seededDocs) {
    await db.doc(docPath).delete().catch(() => {});
  }
  for (const uid of state.parentUids) {
    await admin.auth().deleteUser(uid).catch(() => {});
    await db.collection("users").doc(uid).delete().catch(() => {});
  }
  for (const phone of [PARENT_PHONE, V2_PARENT_PHONE]) {
    const normalized = `+233${phone.slice(1)}`;
    for (const candidate of [normalized, phone, `233${phone.slice(1)}`]) {
      const user = await admin.auth().getUserByPhoneNumber(candidate).catch(() => null);
      if (user) {
        state.parentUids.push(user.uid);
        await admin.auth().deleteUser(user.uid).catch(() => {});
        await db.collection("users").doc(user.uid).delete().catch(() => {});
      }
    }
  }
};

/**
 * Remove the leftovers of an earlier run that was interrupted. A stale parent
 * account keeps a school id that no longer exists, which would break the
 * dashboard for the current run.
 */
const cleanupStaleSeeds = async () => {
  const prefixes = ["e2e-parent-v1-", "e2e-parent-v2-"];
  const rootCollections = ["students", "schools", "student_ledgers", "payments"];

  for (const collectionName of rootCollections) {
    const snapshot = await db.collection(collectionName).get().catch(() => null);
    if (!snapshot) continue;
    for (const doc of snapshot.docs) {
      if (!prefixes.some((prefix) => doc.id.startsWith(prefix))) continue;
      await doc.ref.delete().catch(() => {});
    }
  }

  const schools = await db.collection("schools").get().catch(() => null);
  if (schools) {
    for (const school of schools.docs) {
      if (!prefixes.some((prefix) => school.id.startsWith(prefix))) continue;
      for (const sub of ["feeLedgers", "payments", "financeSettings"]) {
        const nested = await school.ref.collection(sub).get().catch(() => null);
        if (!nested) continue;
        for (const doc of nested.docs) {
          await doc.ref.delete().catch(() => {});
        }
      }
    }
  }

  const users = await db.collection("users").get().catch(() => null);
  if (users) {
    for (const user of users.docs) {
      const phone = String(user.data()?.phoneNumber || "");
      if (phone.startsWith("+233244") || phone.startsWith("+233245")) {
        await user.ref.delete().catch(() => {});
      }
    }
  }
};

// ---------------------------------------------------------------------------
// Browser flow
// ---------------------------------------------------------------------------

const summaryValue = async (page, key) => {
  const locator = page.locator(`[data-testid="fee-summary-${key}-value"]`);
  await locator.first().waitFor({ state: "visible", timeout: 60000 });
  return (await locator.first().innerText()).trim();
};

const withRetry = async (label, fn, attempts = 1) => {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      appendLog("retry", `${label} attempt ${attempt} failed: ${error?.message}`);
    }
  }
  throw lastError;
};

const withTimeout = (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${ms}ms: ${label}`)), ms),
    ),
  ]);

const loginAsParent = async (page, phone, dob) => {
  await page.goto(`${FRONTEND_BASE_URL}/#/login`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Parent Login" }).click();
  await page.locator('input[type="tel"]').fill(phone);
  await page.getByPlaceholder("Day").fill(dob.day);
  await page.locator("select").first().selectOption(dob.month);
  await page.getByPlaceholder("Year").fill(dob.year);
await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.waitForURL((url) => !url.toString().includes("/login"), {
    timeout: 60000,
  });
};

const openFees = async (page) => {
  await page.goto(`${FRONTEND_BASE_URL}/#/parent?view=fees`, {
    waitUntil: "domcontentloaded",
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator('[data-testid="fee-summary-total-amount-due"]').first().waitFor({
    state: "visible",
    timeout: 90000,
  });
};

/**
 * Select a linked student. The parent profile only carries the school id
 * once a student has been selected, so the fees view cannot be reached
 * without this step.
 */
const selectStudent = async (page, name) => {
  await page.goto(`${FRONTEND_BASE_URL}/#/parent`, { waitUntil: "domcontentloaded" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(`button:has-text("${name}")`).first().waitFor({
    state: "visible",
    timeout: 90000,
  });
  await page.locator(`button:has-text("${name}")`).first().click();
  await wait(3000);
};

const runBrowserFlow = async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext();
  // The dashboard shows a guided tour on first visit. Its overlay blocks the
  // page, so the tour is marked as already seen for the parent accounts.
  await context.addInitScript(
    ({ uids }) => {
      for (const uid of uids) {
        window.localStorage.setItem(
          `school_manager_tour:1:parent:${uid}`,
          JSON.stringify({ version: 1, role: "parent", status: "skipped" }),
        );
      }
    },
    { uids: [PARENT_UID, V2_PARENT_UID] },
  );
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  page.setDefaultNavigationTimeout(120000);

  const consoleErrors = [];
  const consoleLog = [];
  page.on("console", (message) => {
    consoleLog.push(`[${message.type()}] ${message.text()}`);
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));
  page.on("requestfailed", (request) => {
    consoleErrors.push(
      `requestfailed ${request.method()} ${request.url()} :: ${request.failure()?.errorText}`,
    );
  });

  let context2 = null;
  let page2 = null;

  try {
    if (SCENARIOS.includes("A")) {
      // --- Scenario A: V1 school -------------------------------------------
      await withRetry("parent login v1", () =>
        loginAsParent(page, PARENT_PHONE, {
          day: "10",
          month: "03",
          year: "2015",
        }),
      );
      await withRetry("select student a", () =>
        selectStudent(page, "E2E Child Carry Forward"),
      );
      await withRetry("open fees v1", () => openFees(page));

      const v1 = {
        previous: await summaryValue(page, "previous-term-balance"),
        current: await summaryValue(page, "current-term-fees"),
        due: await summaryValue(page, "total-amount-due"),
        paid: await summaryValue(page, "payments"),
        remaining: await summaryValue(page, "remaining-balance"),
      };
      record("A-V1", "previous term balance", "GHS 200.00", v1.previous, v1.previous === "GHS 200.00");
      record("A-V1", "current term fees", "GHS 600.00", v1.current, v1.current === "GHS 600.00");
      record("A-V1", "total amount due", "GHS 800.00", v1.due, v1.due === "GHS 800.00");
      record("A-V1", "payments", "GHS 300.00", v1.paid, v1.paid === "GHS 300.00");
      record("A-V1", "remaining balance", "GHS 500.00", v1.remaining, v1.remaining === "GHS 500.00");

      const badge = page.locator('[data-testid="carry-forward-badge"]').first();
      await badge.waitFor({ state: "visible", timeout: 30000 });
      const badgeText = (await badge.innerText()).trim();
      record(
        "A-V1",
        "carry-forward badge",
        "Carried over from Term 3, 2025-2026",
        badgeText,
        badgeText.includes("Carried over from Term 3, 2025-2026"),
      );

      const unallocated = page.locator('[data-testid="unallocated-note"]').first();
      await unallocated.waitFor({ state: "visible", timeout: 30000 });
      const unallocatedText = (await unallocated.innerText()).trim();
      record(
        "A-V1",
        "unallocated payment note",
        "GHS 300.00 applied to the overall balance",
        unallocatedText,
        unallocatedText.includes("GHS 300.00"),
      );

      const historyItems = page.locator('[data-testid="payment-history-item"]');
      const historyCount = await historyItems.count();
      record("A-V1", "payment history entries", ">= 1", historyCount, historyCount >= 1);
      const historyText = await historyItems.first().innerText();
      record(
        "A-V1",
        "portal payment shown as overall balance",
        "Applied to overall balance",
        historyText,
        historyText.includes("Applied to overall balance"),
      );

      await page.screenshot({
        path: path.join(artifactsDir, "parent-cf-a-v1-carry-forward.png"),
        fullPage: true,
      });
    }

    await ensureBackendUp();
    if (SCENARIOS.includes("G")) {
      // --- Scenario G: all terms ------------------------------------------
      await page.locator("button").filter({ hasText: "All" }).first().click();
      await wait(2500);
      const allTermsDue = await summaryValue(page, "total-amount-due");
      const allTermsRemaining = await summaryValue(page, "remaining-balance");
      record("G-all-terms", "total amount due", "GHS 800.00", allTermsDue, allTermsDue === "GHS 800.00");
      record(
        "G-all-terms",
        "remaining balance",
        "GHS 500.00",
        allTermsRemaining,
        allTermsRemaining === "GHS 500.00",
      );
      const previousTermVisible = await page
        .getByText("Term 3 - 2025-2026", { exact: false })
        .count();
      record(
        "G-all-terms",
        "previous term ledger not shown as a current term debt",
        0,
        previousTermVisible,
        previousTermVisible === 0,
      );
      await page.screenshot({
        path: path.join(artifactsDir, "parent-cf-g-all-terms.png"),
        fullPage: true,
      });
      await page.getByRole("button", { name: "Term 1", exact: true }).click();
      await wait(1500);

      // The previous academic year stays inspectable on its own.
      const urlBeforeYear = page.url();
      const feesVisibleBefore = await page
        .locator('[data-testid="fee-summary-total-amount-due"]')
        .first()
        .isVisible()
        .catch(() => false);
      appendLog(
        "diag",
        "year-switch: url=" + urlBeforeYear + " feesVisible=" + feesVisibleBefore,
      );
      await page.locator('[data-testid="year-select"]').selectOption("2025-2026");
      await page.waitForTimeout(3000);
      const urlAfterYear = page.url();
      const feesVisibleAfter = await page
        .locator('[data-testid="fee-summary-total-amount-due"]')
        .first()
        .isVisible()
        .catch(() => false);
      appendLog(
        "diag",
        "year-switch: url=" + urlAfterYear + " feesVisible=" + feesVisibleAfter,
      );
      const historyTerm = await page
        .getByText("Term 3 - 2025-2026", { exact: false })
        .count();
      record(
        "G-all-terms",
        "previous term still inspectable",
        ">= 1",
        historyTerm,
        historyTerm >= 1,
      );
      const historyDue = await summaryValue(page, "total-amount-due");
      const historyPaid = await summaryValue(page, "payments");
      const historyRemaining = await summaryValue(page, "remaining-balance");
      record("G-all-terms", "previous term total due", "GHS 500.00", historyDue, historyDue === "GHS 500.00");
      record("G-all-terms", "previous term payments", "GHS 300.00", historyPaid, historyPaid === "GHS 300.00");
      record(
        "G-all-terms",
        "previous term remaining",
        "GHS 200.00",
        historyRemaining,
        historyRemaining === "GHS 200.00",
      );
      await page.screenshot({
        path: path.join(artifactsDir, "parent-cf-g-previous-term-history.png"),
        fullPage: true,
      });
      await page.locator('[data-testid="year-select"]').selectOption("2026-2027");
      await wait(2000);
    }

    await ensureBackendUp();
    if (SCENARIOS.includes("E")) {
      // --- Scenario E: student isolation -----------------------------------
      await page.getByRole("button", { name: "E2E Child Isolated", exact: false }).first().click();
      await wait(2500);
      await openFees(page);
      const isolated = {
        previous: await summaryValue(page, "previous-term-balance"),
        current: await summaryValue(page, "current-term-fees"),
        due: await summaryValue(page, "total-amount-due"),
        paid: await summaryValue(page, "payments"),
        remaining: await summaryValue(page, "remaining-balance"),
      };
      record("E-isolation", "no carry-forward", "GHS 0.00", isolated.previous, isolated.previous === "GHS 0.00");
      record("E-isolation", "current term fees", "GHS 900.00", isolated.current, isolated.current === "GHS 900.00");
      record("E-isolation", "total amount due", "GHS 900.00", isolated.due, isolated.due === "GHS 900.00");
      record("E-isolation", "payments", "GHS 400.00", isolated.paid, isolated.paid === "GHS 400.00");
      record("E-isolation", "remaining balance", "GHS 500.00", isolated.remaining, isolated.remaining === "GHS 500.00");
      const isolatedBadges = await page.locator('[data-testid="carry-forward-badge"]').count();
      record("E-isolation", "no carry-forward badge", 0, isolatedBadges, isolatedBadges === 0);
      await page.screenshot({
        path: path.join(artifactsDir, "parent-cf-e-isolation.png"),
        fullPage: true,
      });
    }

    await ensureBackendUp();
    if (SCENARIOS.includes("D")) {
      // --- Scenario D: fully paid carry-forward ----------------------------
      await page.getByRole("button", { name: "E2E Child Cleared", exact: false }).first().click();
      await wait(2500);
      await openFees(page);
      const cleared = {
        previous: await summaryValue(page, "previous-term-balance"),
        current: await summaryValue(page, "current-term-fees"),
        due: await summaryValue(page, "total-amount-due"),
        paid: await summaryValue(page, "payments"),
        remaining: await summaryValue(page, "remaining-balance"),
      };
      record("D-cleared", "previous term balance", "GHS 0.00", cleared.previous, cleared.previous === "GHS 0.00");
      record("D-cleared", "current term fees", "GHS 600.00", cleared.current, cleared.current === "GHS 600.00");
      record("D-cleared", "total amount due", "GHS 800.00", cleared.due, cleared.due === "GHS 800.00");
      record("D-cleared", "payments", "GHS 200.00", cleared.paid, cleared.paid === "GHS 200.00");
      record("D-cleared", "remaining balance", "GHS 600.00", cleared.remaining, cleared.remaining === "GHS 600.00");
      const clearedHint = await page
        .locator('[data-testid="fee-summary-previous-term-balance"]')
        .first()
        .innerText();
      record(
        "D-cleared",
        "carry-forward reported as cleared",
        "Fully cleared",
        clearedHint,
        clearedHint.includes("Fully cleared"),
      );
      const clearedBadge = await page
        .locator('[data-testid="carry-forward-badge"]')
        .first()
        .innerText();
      record(
        "D-cleared",
        "carry-forward badge marked cleared",
        "Cleared",
        clearedBadge,
        clearedBadge.includes("Cleared"),
      );
      const clearedHistory = await page
        .locator('[data-testid="payment-history-item"]')
        .first()
        .innerText();
      record(
        "D-cleared",
        "allocation shaped payment visible in history",
        "Carried Balance",
        clearedHistory,
        clearedHistory.includes("Carried Balance"),
      );
      await page.screenshot({
        path: path.join(artifactsDir, "parent-cf-d-cleared-carry-forward.png"),
        fullPage: true,
      });
    }

    if (SCENARIOS.includes("B")) {
    // --- Scenario B: V2 school -------------------------------------------
    const context2 = await browser.newContext();
    await context2.addInitScript(
      ({ uids }) => {
        for (const uid of uids) {
          window.localStorage.setItem(
            `school_manager_tour:1:parent:${uid}`,
            JSON.stringify({ version: 1, role: "parent", status: "skipped" }),
          );
        }
      },
      { uids: [V2_PARENT_UID] },
    );
    const page2 = await context2.newPage();
    page2.setDefaultTimeout(120000);
    page2.setDefaultNavigationTimeout(120000);
    page2.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page2.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));

    await withRetry("parent login v2", () =>
      loginAsParent(page2, V2_PARENT_PHONE, {
        day: "10",
        month: "03",
        year: "2015",
      }),
    );
    await withRetry("select student a v2", () =>
      selectStudent(page2, "E2E Child Carry Forward"),
    );
    await withRetry("open fees v2", () => openFees(page2));

    const v2 = {
      previous: await summaryValue(page2, "previous-term-balance"),
      current: await summaryValue(page2, "current-term-fees"),
      due: await summaryValue(page2, "total-amount-due"),
      paid: await summaryValue(page2, "payments"),
      remaining: await summaryValue(page2, "remaining-balance"),
    };
    record("B-V2", "previous term balance", "GHS 200.00", v2.previous, v2.previous === "GHS 200.00");
    record("B-V2", "current term fees", "GHS 600.00", v2.current, v2.current === "GHS 600.00");
    record("B-V2", "total amount due", "GHS 800.00", v2.due, v2.due === "GHS 800.00");
    record("B-V2", "payments", "GHS 300.00", v2.paid, v2.paid === "GHS 300.00");
    record("B-V2", "remaining balance", "GHS 500.00", v2.remaining, v2.remaining === "GHS 500.00");
    await page2.screenshot({
      path: path.join(artifactsDir, "parent-cf-b-v2-carry-forward.png"),
      fullPage: true,
    });

    // --- Overview card ----------------------------------------------------
    await page2.goto(`${FRONTEND_BASE_URL}/#/parent`, { waitUntil: "domcontentloaded" });
    const overviewNote = page2.locator('[data-testid="carry-forward-note"]').first();
    await overviewNote.waitFor({ state: "visible", timeout: 60000 });
    const overviewText = (await overviewNote.innerText()).trim();
    record(
      "H-overview",
      "overview mentions the carried balance",
      "carried over from Term 3, 2025-2026",
      overviewText,
      overviewText.includes("carried over from Term 3, 2025-2026"),
    );
    await page2.screenshot({
      path: path.join(artifactsDir, "parent-cf-h-overview.png"),
      fullPage: true,
    });

    await context2.close().catch(() => {});
  }

    return { consoleErrors };
  } catch (error) {
    for (const snapshotPage of [page, page2].filter(Boolean)) {
      if (snapshotPage.isClosed()) continue;
      await snapshotPage
        .screenshot({
          path: path.join(artifactsDir, "parent-cf-failure.png"),
          fullPage: true,
        })
        .catch(() => {});
      fs.writeFileSync(
        path.join(artifactsDir, "parent-cf-failure.html"),
        await snapshotPage.content().catch(() => ""),
      );
    }
    fs.writeFileSync(
      path.join(artifactsDir, "parent-cf-failure-console.txt"),
      consoleErrors.join("\n"),
    );
    fs.writeFileSync(
      path.join(artifactsDir, "parent-cf-failure-log.txt"),
      `URL: ${page?.url()}\n\n${consoleLog.join("\n")}`,
    );
    throw error;
  } finally {
    if (context2) {
      await context2.close().catch(() => {});
    }
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
};

const main = async () => {
  await cleanupStaleSeeds();
  await seedAll();

  // The client reads the school document directly, make sure it is there.
  for (const schoolId of [V1_SCHOOL_ID, V2_SCHOOL_ID]) {
    const snap = await db.collection("schools").doc(schoolId).get();
    if (!snap.exists) {
      throw new Error(`Seeded school ${schoolId} is not readable`);
    }
    appendLog("seed", `school ${schoolId} verified: ${snap.data()?.name}`);
  }

  if (!(await canReachHttp(BACKEND_HEALTH_URL))) {
    spawnProcess("backend", "npm.cmd", ["run", "dev"], serverDir);
  }
  await waitForHttp(BACKEND_HEALTH_URL);
  if (!(await canReachHttp(FRONTEND_BASE_URL))) {
    spawnProcess(
      "frontend",
      "npm.cmd",
      ["run", "dev", "--", "--host", "127.0.0.1", "--port", FRONTEND_PORT],
      repoRoot,
    );
  }
  await waitForHttp(FRONTEND_BASE_URL);

  const { consoleErrors } = await withTimeout(
    runBrowserFlow(),
    15 * 60 * 1000,
    "browser flow",
  );

  const report = {
    success: true,
    schools: { v1: V1_SCHOOL_ID, v2: V2_SCHOOL_ID },
    checks,
    consoleErrors,
    screenshots: [
      "parent-cf-a-v1-carry-forward.png",
      "parent-cf-g-all-terms.png",
      "parent-cf-e-isolation.png",
      "parent-cf-d-cleared-carry-forward.png",
      "parent-cf-b-v2-carry-forward.png",
      "parent-cf-h-overview.png",
    ],
  };
  fs.writeFileSync(
    path.join(artifactsDir, "parent-carryforward-report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
};

try {
  await main();
} catch (error) {
  const failure = {
    success: false,
    error: error instanceof Error ? error.message : String(error),
    checks,
  };
  fs.writeFileSync(
    path.join(artifactsDir, "parent-carryforward-report.json"),
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
  await cleanup().catch((error) => {
    appendLog(
      "cleanup",
      `cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  });
}
