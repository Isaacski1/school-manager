import crypto from "crypto";

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
  "payments",
  "student_ledgers",
]);

const RESET_SCHOOL_SUBCOLLECTIONS = Object.freeze([
  "payments",
  "feeLedgers",
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
    await batch.commit();
  }
};

const readRootRows = async (db, collectionName, schoolId) => {
  const snapshot = await db
    .collection(collectionName)
    .where("schoolId", "==", schoolId)
    .get();
  return rowsFromSnapshot(snapshot);
};

const readSubcollectionRows = async (db, schoolId, collectionName) => {
  const snapshot = await db
    .collection("schools")
    .doc(schoolId)
    .collection(collectionName)
    .get();
  return rowsFromSnapshot(snapshot);
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

  const entries = await Promise.all(
    Object.entries(ROOT_BACKUP_COLLECTIONS).map(
      async ([payloadKey, collectionName]) => [
        payloadKey,
        await readRootRows(db, collectionName, schoolId),
      ],
    ),
  );
  const payload = Object.fromEntries(entries);

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
          index,
          count: rows.length,
          rows,
        }),
      );
    });
    chunkManifest.push({ key, chunkIds, count: value.length });
  });

  await backupRef.set({
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
  });
  await commitInBatches(db, writeOperations);

  const verificationSnapshot = await backupRef.collection("chunks").get();
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
  const snapshot = await db
    .collection(collectionName)
    .where("schoolId", "==", schoolId)
    .get();
  await commitInBatches(
    db,
    snapshot.docs.map((doc) => (batch) => batch.delete(doc.ref)),
  );
  return snapshot.size;
};

const deleteSchoolSubcollection = async (db, schoolId, collectionName) => {
  const snapshot = await db
    .collection("schools")
    .doc(schoolId)
    .collection(collectionName)
    .get();
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
      const backup = await createVerifiedBackup({
        db,
        FieldValue,
        schoolId,
        config: lock.config,
        transitionKey: lock.transitionKey,
      });
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

      const nextPeriod = getNextAcademicPeriod(
        lock.config.currentTerm,
        lock.config.academicYear,
      );
      await lock.settingsRef.update({
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
      });
      await db.collection("activity_logs").add({
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
        },
      });
      return {
        changed: true,
        backupId: backup.backupId,
        nextPeriod,
        resetCounts,
      };
    } catch (error) {
      logger.error("[TermRollover] Failed", {
        schoolId,
        error: error?.message || String(error),
      });
      await lock.settingsRef.set(
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
      );
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
