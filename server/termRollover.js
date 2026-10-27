import crypto from "crypto";
import {
  computeCarryForwardBalance,
  buildCarryForwardFeeEntry,
  buildCarryForwardId,
  buildLedgerId,
  isCarryForwardFee,
} from "../services/termBalanceCarryForward.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const LOCK_LEASE_MS = 15 * 60 * 1000;
const MAX_CHUNK_BYTES = 700_000;
const DELETE_BATCH_SIZE = 400;

const ROOT_BACKUP_COLLECTIONS = Object.freeze({
  students: "students",
  users: "users",
  attendanceRecords: "attendance",
  teacherAttendanceRecords: "teacher_attendance",
  assessments: "assessments",
  studentRemarks: "student_remarks",
  adminRemarks: "admin_remarks",
  studentSkills: "student_skills",
  timetables: "timetables",
  classSubjects: "class_subjects",
  notices: "notices",
  adminNotifications: "admin_notifications",
  activityLogs: "activity_logs",
  fees: "fees",
  studentLedgers: "student_ledgers",
});

const RESET_COLLECTIONS = Object.freeze([
  "attendance",
  "teacher_attendance",
  "notices",
  "admin_notifications",
  // Note: payments and student_ledgers are NOT reset to preserve financial history
  // and enable carry-forward of outstanding balances
]);

const RESET_SCHOOL_SUBCOLLECTIONS = Object.freeze([
  // Note: payments and feeLedgers are NOT reset to preserve financial history
  // and enable carry-forward of outstanding balances
]);

const toDateKey = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

export const getNextAcademicPeriod = (currentTerm, academicYear) => {
  const termMatch = String(currentTerm || "").match(/\d+/);
  const termNumber = Number(termMatch?.[0] || 1);
  if (termNumber < 3) {
    return {
      currentTerm: `Term ${termNumber + 1}`,
      academicYear: String(academicYear || ""),
    };
  }

  const yearMatch = String(academicYear || "").match(/^(\d{4})-(\d{4})$/);
  const nextAcademicYear = yearMatch
    ? `${Number(yearMatch[1]) + 1}-${Number(yearMatch[2]) + 1}`
    : String(academicYear || "");
  return { currentTerm: "Term 1", academicYear: nextAcademicYear };
};

export const isTermRolloverDue = (config, now = new Date()) => {
  const nextTermBegins = String(config?.nextTermBegins || "").trim();
  if (!nextTermBegins || config?.termTransitionProcessed === true) return false;
  return nextTermBegins <= toDateKey(now);
};

const stripUndefined = (value) => {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (!value || typeof value !== "object") return value;
  return Object.entries(value).reduce((result, [key, entry]) => {
    if (entry !== undefined) result[key] = stripUndefined(entry);
    return result;
  }, {});
};

const isFirestoreQuotaError = (error) => {
  const message = String(error?.message || error || "").toLowerCase();
  const code = String(error?.code || error?.errorInfo?.code || "").toLowerCase();
  return (
    code === "resource-exhausted" ||
    code === "8" ||
    message.includes("quota exceeded") ||
    message.includes("resource exhausted")
  );
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const withQuotaRetry = async (label, operation) => {
  const baseDelay = 5000;
  const maxDelay = 60_000;
  const maxAttempts = 4;
  let lastError = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isFirestoreQuotaError(error) || attempt === maxAttempts - 1) {
        throw error;
      }
      const delay = Math.min(baseDelay * 2 ** attempt, maxDelay);
      console.warn(
        `[TermRollover] ${label} hit quota limit. Backing off ${delay}ms before retry ${attempt + 2}/${maxAttempts}...`,
      );
      await sleep(delay);
    }
  }

  throw lastError;
};

const rowsFromSnapshot = (snapshot) =>
  snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

const dedupeRows = (rows) => {
  const byId = new Map();
  rows.forEach((row, index) => {
    const id = String(row?.id || row?.reference || `row-${index}`);
    byId.set(id, { ...row, id });
  });
  return Array.from(byId.values());
};

const splitRowsBySize = (rows) => {
  const chunks = [];
  let current = [];
  let currentBytes = 2;

  rows.forEach((row) => {
    const rowBytes = Buffer.byteLength(JSON.stringify(row), "utf8") + 1;
    if (current.length && currentBytes + rowBytes > MAX_CHUNK_BYTES) {
      chunks.push(current);
      current = [];
      currentBytes = 2;
    }
    current.push(row);
    currentBytes += rowBytes;
  });

  if (current.length || chunks.length === 0) chunks.push(current);
  return chunks;
};

const commitInBatches = async (db, operations) => {
  for (let index = 0; index < operations.length; index += DELETE_BATCH_SIZE) {
    const batch = db.batch();
    operations.slice(index, index + DELETE_BATCH_SIZE).forEach((operation) =>
      operation(batch),
    );
    await withQuotaRetry(`commit batch ${index + 1}-${Math.min(index + DELETE_BATCH_SIZE, operations.length)}`, () =>
      batch.commit(),
    );
  }
};

const readRootRows = async (db, collectionName, schoolId) => {
  return withQuotaRetry(`read ${collectionName}`, () =>
    db
      .collection(collectionName)
      .where("schoolId", "==", schoolId)
      .get()
      .then((snapshot) => rowsFromSnapshot(snapshot)),
  );
};

const readSubcollectionRows = async (db, schoolId, collectionName) => {
  return withQuotaRetry(`read schools/${schoolId}/${collectionName}`, () =>
    db
      .collection("schools")
      .doc(schoolId)
      .collection(collectionName)
      .get()
      .then((snapshot) => rowsFromSnapshot(snapshot)),
  );
};

const buildBackupPayload = async (db, schoolId, config) => {
  const schoolRef = db.collection("schools").doc(schoolId);
  const [schoolSnapshot, financeSettingsSnapshot, schoolActivityRows] =
    await Promise.all([
      schoolRef.get(),
      schoolRef.collection("financeSettings").doc("main").get(),
      readSubcollectionRows(db, schoolId, "activityLogs"),
    ]);

  if (!schoolSnapshot.exists) {
    throw new Error(`School ${schoolId} does not exist`);
  }

  const payload = {};
  const rootEntries = Object.entries(ROOT_BACKUP_COLLECTIONS);
  for (let index = 0; index < rootEntries.length; index += 3) {
    const batch = rootEntries.slice(index, index + 3);
    const results = await Promise.all(
      batch.map(async ([payloadKey, collectionName]) => [
        payloadKey,
        await readRootRows(db, collectionName, schoolId),
      ]),
    );
    results.forEach(([payloadKey, value]) => {
      payload[payloadKey] = value;
    });
  }

  const [v2Fees, v2Ledgers, v2Payments] = await Promise.all([
    readSubcollectionRows(db, schoolId, "fees"),
    readSubcollectionRows(db, schoolId, "feeLedgers"),
    readSubcollectionRows(db, schoolId, "payments"),
  ]);
  const rootPayments = await readRootRows(db, "payments", schoolId);

  payload.fees = dedupeRows([...(payload.fees || []), ...v2Fees]);
  payload.studentLedgers = dedupeRows([
    ...(payload.studentLedgers || []),
    ...v2Ledgers,
  ]);
  payload.payments = dedupeRows(
    [...rootPayments, ...v2Payments].filter((payment) => payment?.studentId),
  );
  payload.billingPayments = dedupeRows(
    rootPayments.filter((payment) => !payment?.studentId),
  );
  payload.activityLogs = dedupeRows([
    ...(payload.activityLogs || []),
    ...schoolActivityRows,
  ]);

  return {
    schoolConfig: config,
    schoolSettings: config,
    schoolProfile: { id: schoolSnapshot.id, ...schoolSnapshot.data() },
    financeSettings: financeSettingsSnapshot.exists
      ? financeSettingsSnapshot.data()
      : null,
    ...payload,
  };
};

/**
 * Resolve the finance storage version used by a school.
 *
 * Prefers the `financeSettings` sub-collection document and falls back to the
 * `financeVersion` stored on the school settings document so that a v2 school
 * is detected even when the financeSettings document has not been created.
 *
 * @param {Object} db - Firestore instance
 * @param {string} schoolId - The school identifier
 * @param {Object} config - The school settings/config snapshot
 * @returns {Promise<string>} "v1" or "v2"
 */
const resolveFinanceVersion = async (db, schoolId, config) => {
  try {
    const snapshot = await db
      .collection("schools")
      .doc(schoolId)
      .collection("financeSettings")
      .doc("main")
      .get();
    const stored = snapshot?.exists ? snapshot.data() : null;
    if (stored?.financeVersion) return stored.financeVersion;
  } catch (error) {
    // Fall through to the settings-level fallback below.
  }
  return config?.financeVersion || "v1";
};

/**
 * Calculate the outstanding balance of every previous-term ledger and persist
 * it as a carry-forward fee entry inside the student's new-term ledger.
 *
 * For each previous-term ledger with an outstanding balance:
 *   - a single carry-forward fee entry is built with the deterministic
 *     carry-forward fee ID,
 *   - if the student already has a ledger for the new term, the fee entry is
 *     appended to that ledger's `fees` array (never duplicating an existing
 *     carry-forward fee ID),
 *   - otherwise a new ledger is created for the new term containing the
 *     carry-forward fee.
 *
 * Previous term fees, payments and ledgers are never modified.
 *
 * @param {Object} params
 * @param {Object} params.db - Firestore instance
 * @param {string} params.schoolId - The school identifier
 * @param {Object} params.config - The school settings/config snapshot
 * @returns {Promise<{financeVersion: string, applied: Array<Object>}>}
 */
const applyCarryForwardBalances = async ({ db, schoolId, config }) => {
  const financeVersion = await resolveFinanceVersion(db, schoolId, config);
  const useV2 = financeVersion === "v2";

  const previousTerm = config.currentTerm;
  const previousAcademicYear = config.academicYear;
  const nextPeriod = getNextAcademicPeriod(
    config.currentTerm,
    config.academicYear,
  );
  const nextTerm = nextPeriod.currentTerm;
  const nextAcademicYear = nextPeriod.academicYear;

  // Canonical ledger collection for the resolved storage version.
  // v1 keeps ledgers in the root `student_ledgers` collection, v2 keeps them
  // in the `feeLedgers` sub-collection of the school document.
  const ledgerCollection = useV2 ? "feeLedgers" : "student_ledgers";

  const [v1LedgerRows, v2LedgerRows, v1PaymentRows, v2PaymentRows] =
    await Promise.all([
      readRootRows(db, "student_ledgers", schoolId),
      readSubcollectionRows(db, schoolId, "feeLedgers"),
      readRootRows(db, "payments", schoolId),
      readSubcollectionRows(db, schoolId, "payments"),
    ]);

  // Prefer the canonical collection but fall back to the other layout so that
  // a school whose financial records still live in the legacy location is
  // still carried forward.
  const canonicalLedgerRows = useV2 ? v2LedgerRows : v1LedgerRows;
  const sourceLedgerRows =
    canonicalLedgerRows.length > 0
      ? canonicalLedgerRows
      : useV2
        ? v1LedgerRows
        : v2LedgerRows;
  const canonicalPaymentRows = useV2 ? v2PaymentRows : v1PaymentRows;
  const sourcePaymentRows =
    canonicalPaymentRows.length > 0
      ? canonicalPaymentRows
      : useV2
        ? v1PaymentRows
        : v2PaymentRows;

  const previousTermLedgers = sourceLedgerRows.filter(
    (ledger) =>
      ledger.academicYear === previousAcademicYear &&
      ledger.term === previousTerm,
  );
  const previousTermPayments = sourcePaymentRows.filter(
    (payment) =>
      payment.academicYear === previousAcademicYear &&
      payment.term === previousTerm,
  );

  const ledgerCollectionRef = useV2
    ? db.collection("schools").doc(schoolId).collection(ledgerCollection)
    : db.collection(ledgerCollection);

  const applied = [];

  for (const ledger of previousTermLedgers) {
    const carryForwardAmount = computeCarryForwardBalance({
      ledger,
      payments: previousTermPayments,
    });
    if (!(carryForwardAmount > 0)) continue;

    const carryForwardFeeId = buildCarryForwardId(
      schoolId,
      ledger.studentId,
      previousAcademicYear,
      previousTerm,
    );

    const carryForwardResult = {
      studentId: ledger.studentId,
      classId: ledger.classId,
      carriedBalance: carryForwardAmount,
      fromAcademicYear: previousAcademicYear,
      fromTerm: previousTerm,
      toAcademicYear: nextAcademicYear,
      toTerm: nextTerm,
      carryForwardFeeId,
    };

    const carryForwardFeeEntry = buildCarryForwardFeeEntry(carryForwardResult);
    if (!carryForwardFeeEntry) continue;

    // Locate the student's new-term ledger in the canonical collection.
    const existingLedger = canonicalLedgerRows.find(
      (row) =>
        row.studentId === ledger.studentId &&
        row.academicYear === nextAcademicYear &&
        row.term === nextTerm,
    );

    if (existingLedger) {
      const fees = Array.isArray(existingLedger.fees)
        ? existingLedger.fees
        : [];
      // Idempotency: never add a second carry-forward entry for the same fee ID.
      if (fees.some((fee) => fee.feeId === carryForwardFeeId)) {
        applied.push({ ...carryForwardResult, action: "skipped" });
        continue;
      }
      await ledgerCollectionRef.doc(existingLedger.id).update({
        fees: [...fees, carryForwardFeeEntry],
      });
      applied.push({
        ...carryForwardResult,
        action: "updated",
        ledgerId: existingLedger.id,
      });
      continue;
    }

    const newLedgerId = buildLedgerId(
      schoolId,
      ledger.studentId,
      nextAcademicYear,
      nextTerm,
    );
    const newLedger = {
      schoolId,
      studentId: ledger.studentId,
      classId: ledger.classId,
      term: nextTerm,
      academicYear: nextAcademicYear,
      fees: [carryForwardFeeEntry],
      openingPaidAmount: 0,
      openingBalance: carryForwardFeeEntry.amount,
      openingStatus: "Unpaid",
    };
    await ledgerCollectionRef.doc(newLedgerId).set(newLedger);
    applied.push({
      ...carryForwardResult,
      action: "created",
      ledgerId: newLedgerId,
    });
  }

  return { financeVersion, applied };
};

const createVerifiedBackup = async ({
  db,
  FieldValue,
  schoolId,
  config,
  transitionKey,
}) => {
  const payload = await buildBackupPayload(db, schoolId, config);
  const backupId = `term-${schoolId}-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const backupRef = db.collection("backups").doc(backupId);
  const inlineData = {
    schoolConfig: payload.schoolConfig,
    schoolSettings: payload.schoolSettings,
    schoolProfile: payload.schoolProfile,
    financeSettings: payload.financeSettings,
  };
  const chunkManifest = [];
  const recordCounts = {};
  const writeOperations = [];

  Object.entries(payload).forEach(([key, value]) => {
    if (!Array.isArray(value)) return;
    const chunks = splitRowsBySize(stripUndefined(value));
    recordCounts[key] = value.length;
    const chunkIds = [];
    chunks.forEach((rows, index) => {
      const chunkId = `${key}-${String(index).padStart(4, "0")}`;
      chunkIds.push(chunkId);
      writeOperations.push((batch) =>
        batch.set(backupRef.collection("chunks").doc(chunkId), {
          schoolId,
          key,
          key,
          index,
          count: rows.length,
          rows,
        }),
      );
    });
    chunkManifest.push({ key, chunkIds, count: value.length });
  });

  await withQuotaRetry(`create backup manifest ${backupId}`, () =>
    backupRef.set({
      id: backupId,
      schoolId,
      schoolName: String(config.schoolName || payload.schoolProfile?.name || ""),
      timestamp: Date.now(),
      term: config.currentTerm,
      academicYear: config.academicYear,
      backupType: "term-reset",
      dedupeKey: transitionKey,
      storageVersion: 2,
      status: "writing",
      dataCollectionRef: `backups/${backupId}/chunks`,
      chunks: chunkManifest,
      recordCounts,
      data: stripUndefined(inlineData),
      createdAt: FieldValue.serverTimestamp(),
    }),
  );
  await commitInBatches(db, writeOperations);

  const verificationSnapshot = await withQuotaRetry(`verify backup chunks ${backupId}`, () =>
    backupRef.collection("chunks").get(),
  );
  const verifiedCounts = {};
  verificationSnapshot.docs.forEach((doc) => {
    const chunk = doc.data();
    verifiedCounts[chunk.key] =
      (verifiedCounts[chunk.key] || 0) + Number(chunk.count || 0);
  });
  const mismatch = Object.entries(recordCounts).find(
    ([key, count]) => Number(verifiedCounts[key] || 0) !== Number(count),
  );
  if (mismatch) {
    await backupRef.update({
      status: "failed",
      verificationError: `Count mismatch for ${mismatch[0]}`,
    });
    throw new Error(`Backup verification failed for ${mismatch[0]}`);
  }

  await backupRef.update({
    status: "verified",
    verifiedAt: FieldValue.serverTimestamp(),
  });
  return { backupId, recordCounts };
};

const deleteSchoolScopedCollection = async (db, collectionName, schoolId) => {
  const snapshot = await withQuotaRetry(`read ${collectionName}`, () =>
    db
      .collection(collectionName)
      .where("schoolId", "==", schoolId)
      .get(),
  );
  await commitInBatches(
    db,
    snapshot.docs.map((doc) => (batch) => batch.delete(doc.ref)),
  );
  return snapshot.size;
};

const deleteSchoolSubcollection = async (db, schoolId, collectionName) => {
  const snapshot = await withQuotaRetry(`read schools/${schoolId}/${collectionName}`, () =>
    db
      .collection("schools")
      .doc(schoolId)
      .collection(collectionName)
      .get(),
  );
  await commitInBatches(
    db,
    snapshot.docs.map((doc) => (batch) => batch.delete(doc.ref)),
  );
  return snapshot.size;
};

export const createTermRolloverService = ({
  db,
  FieldValue,
  Timestamp,
  logger = console,
}) => {
  const acquireLock = async (schoolId, source, now) => {
    const settingsRef = db.collection("settings").doc(schoolId);
    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(settingsRef);
      if (!snapshot.exists) return { acquired: false, reason: "missing_config" };
      const config = { schoolId, ...snapshot.data() };
      if (!isTermRolloverDue(config, now)) {
        return { acquired: false, reason: "not_due", config };
      }

      const transitionKey = `${schoolId}:${config.currentTerm}:${config.academicYear}:${config.nextTermBegins}`;
      const state = config.termTransition || {};
      const leaseExpiresAt = state.leaseExpiresAt?.toDate?.() || null;
      if (
        state.key === transitionKey &&
        state.status === "processing" &&
        leaseExpiresAt &&
        leaseExpiresAt.getTime() > now.getTime()
      ) {
        return { acquired: false, reason: "locked", config };
      }

      transaction.update(settingsRef, {
        termTransitionProcessed: false,
        termTransition: {
          key: transitionKey,
          status: "processing",
          source,
          startedAt: Timestamp.fromDate(now),
          leaseExpiresAt: Timestamp.fromDate(
            new Date(now.getTime() + LOCK_LEASE_MS),
          ),
          error: null,
        },
      });
      return { acquired: true, config, transitionKey, settingsRef };
    });
  };

  const rolloverSchool = async (
    schoolId,
    { source = "scheduler", now = new Date() } = {},
  ) => {
    const lock = await acquireLock(schoolId, source, now);
    if (!lock.acquired) return { changed: false, reason: lock.reason };

    try {
      const nextPeriod = getNextAcademicPeriod(
        lock.config.currentTerm,
        lock.config.academicYear,
      );

      // STEP 1: Calculate and persist carry-forward balances.
      // This runs BEFORE the backup so the persisted carry-forward ledger is
      // captured by the verified backup, and BEFORE any records are reset so
      // the previous term's fees and payments are still available.
      const carryForward = await applyCarryForwardBalances({
        db,
        schoolId,
        config: lock.config,
      });

      // STEP 2: Create the verified backup of the school data
      const backup = await createVerifiedBackup({
        db,
        FieldValue,
        schoolId,
        config: lock.config,
        transitionKey: lock.transitionKey,
      });

      // STEP 3: Delete only non-financial collections that need resetting
      const resetCounts = {};
      for (const collectionName of RESET_COLLECTIONS) {
        resetCounts[collectionName] = await deleteSchoolScopedCollection(
          db,
          collectionName,
          schoolId,
        );
      }
      for (const collectionName of RESET_SCHOOL_SUBCOLLECTIONS) {
        resetCounts[`schools/${collectionName}`] =
          await deleteSchoolSubcollection(db, schoolId, collectionName);
      }

      // STEP 4: Update academic period and mark rollover as completed
      await withQuotaRetry(`update settings ${schoolId}`, () =>
        lock.settingsRef.update({
          currentTerm: nextPeriod.currentTerm,
          academicYear: nextPeriod.academicYear,
          schoolReopenDate: lock.config.nextTermBegins,
          vacationDate: "",
          nextTermBegins: "",
          termTransitionProcessed: true,
          termTransition: {
            key: lock.transitionKey,
            status: "completed",
            source,
            backupId: backup.backupId,
            recordCounts: backup.recordCounts,
            resetCounts,
            completedAt: FieldValue.serverTimestamp(),
            leaseExpiresAt: null,
            error: null,
          },
        }),
      );
      await withQuotaRetry(`add activity log ${schoolId}`, () =>
        db.collection("activity_logs").add({
          schoolId,
          eventType: "term_rollover_completed",
          actorRole: "system",
          actorUid: null,
          entityId: backup.backupId,
          createdAt: FieldValue.serverTimestamp(),
          meta: {
            fromTerm: lock.config.currentTerm,
            fromAcademicYear: lock.config.academicYear,
            toTerm: nextPeriod.currentTerm,
            toAcademicYear: nextPeriod.academicYear,
            backupId: backup.backupId,
            resetCounts,
            source,
            carryForward,
          },
        }),
      );
      return {
        changed: true,
        backupId: backup.backupId,
        nextPeriod,
        resetCounts,
        carryForward,
      };
    } catch (error) {
      logger.error("[TermRollover] Failed", {
        schoolId,
        error: error?.message || String(error),
      });
      try {
        await withQuotaRetry(`mark rollover failed ${schoolId}`, () =>
          lock.settingsRef.set(
            {
              termTransition: {
                key: lock.transitionKey,
                status: "failed",
                source,
                failedAt: FieldValue.serverTimestamp(),
                leaseExpiresAt: null,
                error: String(error?.message || error).slice(0, 500),
              },
            },
            { merge: true },
          ),
        );
      } catch (markFailedErr) {
        logger.error("[TermRollover] Failed to mark failure", {
          schoolId,
          error: markFailedErr?.message || String(markFailedErr),
        });
      }
      throw error;
    }
  };

  const runDueRollovers = async ({ source = "scheduler", now = new Date() } = {}) => {
    const todayKey = toDateKey(now);
    const snapshot = await db
      .collection("settings")
      .where("nextTermBegins", "<=", todayKey)
      .limit(100)
      .get();
    const results = [];
    for (const doc of snapshot.docs) {
      const config = doc.data();
      if (!isTermRolloverDue(config, now)) continue;
      try {
        results.push({
          schoolId: doc.id,
          ...(await rolloverSchool(doc.id, { source, now })),
        });
      } catch (error) {
        results.push({
          schoolId: doc.id,
          changed: false,
          reason: "failed",
          error: String(error?.message || error),
        });
      }
    }
    return results;
  };

  return { rolloverSchool, runDueRollovers };
};

export const TERM_ROLLOVER_INTERVAL_MS = 5 * 60 * 1000;
export const TERM_ROLLOVER_DAY_MS = DAY_MS;
