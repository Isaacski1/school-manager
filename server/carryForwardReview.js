// Server side carry-forward review: reads the persisted carry-forward ledger
// entries and publishes the administrator notification plus the per-rollover
// review snapshot.
//
// The financial source of truth is the carry-forward fee entry stored on the
// student's ledger by the term rollover service. Nothing is recalculated here.

import {
  buildCarryForwardNotificationId,
  buildCarryForwardNotificationMessage,
  buildCarryForwardReview,
  buildCarryForwardReviewId,
} from "../services/carryForwardReview.js";

const rowsFromSnapshot = (snapshot) =>
  (snapshot?.docs || []).map((doc) => ({
    id: doc.id,
    ...(typeof doc.data === "function" ? doc.data() || {} : doc.data || {}),
  }));

/**
 * Read a school scoped sub-collection (already scoped by path).
 */
const readSubcollection = async (db, path) => {
  try {
    return rowsFromSnapshot(await db.collection(path).get());
  } catch (error) {
    console.warn(
      `[CarryForwardReview] Could not read ${path}:`,
      error?.message || error,
    );
    return [];
  }
};

/**
 * Read a root collection filtered to one school.
 */
const readRootCollection = async (db, collectionName, schoolId) => {
  try {
    const snapshot = await db
      .collection(collectionName)
      .where("schoolId", "==", schoolId)
      .get();
    return rowsFromSnapshot(snapshot);
  } catch (error) {
    console.warn(
      `[CarryForwardReview] Could not read ${collectionName}:`,
      error?.message || error,
    );
    return [];
  }
};

/**
 * Merge rows that may exist in both storage layouts, keyed by document ID.
 * Fees are merged by fee ID so a carry-forward entry is never lost.
 */
const mergeById = (...collections) => {
  const merged = new Map();
  for (const collection of collections) {
    for (const row of collection || []) {
      const key = String(row.id);
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, row);
        continue;
      }
      const seen = new Set();
      const fees = [...(existing.fees || []), ...(row.fees || [])].filter(
        (fee) => {
          const feeId = fee?.feeId;
          if (!feeId || seen.has(feeId)) return false;
          seen.add(feeId);
          return true;
        },
      );
      merged.set(key, { ...existing, ...row, fees });
    }
  }
  return [...merged.values()];
};

/**
 * Load the current term's ledgers, payments and students for a school and
 * build the administrator review from the persisted carry-forward entries.
 *
 * @param {Object} params
 * @param {Object} params.db - Firestore instance
 * @param {string} params.schoolId
 * @param {string} params.academicYear
 * @param {string} params.term
 * @returns {Promise<Object>} the review
 */
export const loadCarryForwardReview = async ({
  db,
  schoolId,
  academicYear,
  term,
} = {}) => {
  const [v1Ledgers, v2Ledgers, v1Payments, v2Payments, students] =
    await Promise.all([
      readRootCollection(db, "student_ledgers", schoolId),
      readSubcollection(db, `schools/${schoolId}/feeLedgers`),
      readRootCollection(db, "payments", schoolId),
      readSubcollection(db, `schools/${schoolId}/payments`),
      readRootCollection(db, "students", schoolId),
    ]);

  const ledgers = mergeById(v1Ledgers, v2Ledgers);
  const payments = mergeById(v1Payments, v2Payments);

  return buildCarryForwardReview({
    ledgers,
    payments,
    students,
    schoolId,
    academicYear,
    term,
  });
};

/**
 * Publish the administrator notification and the per-rollover review snapshot.
 *
 * Both documents use deterministic IDs, so repeating the rollover (or running
 * the publisher twice) overwrites the same documents instead of duplicating
 * them.
 *
 * @param {Object} params
 * @param {Object} params.db - Firestore instance
 * @param {string} params.schoolId
 * @param {string} params.academicYear - The term the balances were carried into
 * @param {string} params.term - The term the balances were carried into
 * @param {Object} [params.review] - A pre-built review (avoids re-reading)
 * @returns {Promise<{review: Object, snapshotId: string|null, notificationId: string|null}>}
 */
export const publishCarryForwardReview = async ({
  db,
  schoolId,
  academicYear,
  term,
  review: providedReview,
} = {}) => {
  const review =
    providedReview ||
    (await loadCarryForwardReview({ db, schoolId, academicYear, term }));

  if (!review?.totals?.studentCount) {
    // Nothing was carried forward - no notification, no snapshot.
    return { review, snapshotId: null, notificationId: null };
  }

  const snapshotId = buildCarryForwardReviewId(schoolId, academicYear, term);
  const notificationId = buildCarryForwardNotificationId(
    schoolId,
    academicYear,
    term,
  );
  const message = buildCarryForwardNotificationMessage(review);

  await db
    .collection("carry_forward_reviews")
    .doc(snapshotId)
    .set({
      id: snapshotId,
      schoolId,
      academicYear,
      term,
      createdAt: Date.now(),
      totals: review.totals,
      groups: review.groups,
      rows: review.rows,
    });

  await db
    .collection("admin_notifications")
    .doc(notificationId)
    .set({
      id: notificationId,
      schoolId,
      message,
      createdAt: Date.now(),
      isRead: false,
      type: "system",
    });

  return { review, snapshotId, notificationId };
};
