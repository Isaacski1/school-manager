// Administrator carry-forward review helpers.
//
// Pure module (no I/O, no side effects) so it can be used by the server
// (which publishes the rollover notification and the review snapshot) and by
// the admin UI.
//
// The financial source of truth is the carry-forward fee entry that the term
// rollover service persists on a student's ledger. This module only reads
// those entries - it never recalculates a balance, so it can never disagree
// with the ledger.

import { isCarryForwardFee } from "./termBalanceCarryForward.js";

/**
 * Prefix used by the rollover service for carry-forward fee IDs.
 */
const CARRY_FORWARD_FEE_PREFIX = "__carry_forward__";

/**
 * True when the given fee ID is a carry-forward fee ID.
 *
 * @param {string} feeId
 * @returns {boolean}
 */
export const isCarryForwardFeeId = (feeId) =>
  typeof feeId === "string" && isCarryForwardFee(feeId);

/**
 * Turn the whitespace-free term used inside a carry-forward ID back into the
 * display form ("Term3" -> "Term 3").
 *
 * @param {string} term
 * @returns {string}
 */
const humanizeTerm = (term) => {
  const value = String(term || "");
  const match = value.match(/^Term(\d+)$/i);
  return match ? `Term ${match[1]}` : value;
};

/**
 * Read the source period out of a carry-forward fee ID.
 *
 * The rollover builds the ID as
 * `__carry_forward__<schoolId>_<studentId>_<academicYear>_<term>`
 * with whitespace removed, so the academic year and the term are always the
 * last two segments.
 *
 * @param {string} feeId
 * @param {{schoolId?: string, studentId?: string}} [context]
 * @returns {{fromAcademicYear: string, fromTerm: string}|null}
 */
export const parseCarryForwardFeeId = (feeId, context = {}) => {
  if (!isCarryForwardFeeId(feeId)) return null;
  let rest = String(feeId).slice(CARRY_FORWARD_FEE_PREFIX.length + 1);
  const { schoolId, studentId } = context || {};
  if (schoolId && studentId) {
    const knownPrefix = `${schoolId}_${studentId}_`;
    if (rest.startsWith(knownPrefix)) rest = rest.slice(knownPrefix.length);
  }
  const segments = rest.split("_").filter(Boolean);
  if (segments.length < 2) return null;
  const fromTerm = humanizeTerm(segments[segments.length - 1]);
  const fromAcademicYear = segments[segments.length - 2];
  if (!fromAcademicYear || !fromTerm) return null;
  return { fromAcademicYear, fromTerm };
};

/**
 * Total amount paid against a single fee.
 *
 * Mirrors the crediting rule of the carry-forward engine
 * (services/termBalanceCarryForward.js): a payment that carries allocations
 * credits each allocation to its own fee, otherwise the whole payment is
 * credited to the payment's fee.
 *
 * @param {Array<Object>} payments
 * @param {string} feeId
 * @returns {number}
 */
export const sumPaidAgainstFee = (payments, feeId) => {
  let total = 0;
  for (const payment of payments || []) {
    if (!payment || payment.isOpeningPayment === true) continue;
    if (Array.isArray(payment.allocations) && payment.allocations.length > 0) {
      for (const allocation of payment.allocations) {
        if (!allocation || allocation.feeId !== feeId) continue;
        total += Number(allocation.amountPaid) || 0;
      }
      continue;
    }
    if (payment.feeId !== feeId) continue;
    total += Number(payment.amountPaid) || 0;
  }
  return total;
};

const sumBy = (rows, key) =>
  rows.reduce((total, row) => total + (Number(row?.[key]) || 0), 0);

/**
 * Build one review row per student carrying a balance into the given term.
 *
 * @param {Object} params
 * @param {Array<Object>} params.ledgers - Student fee ledgers
 * @param {Array<Object>} params.payments - Student fee payments
 * @param {Array<Object>} params.students - Students (for names and classes)
 * @param {string} params.schoolId
 * @param {string} params.academicYear - The term the balances are carried into
 * @param {string} params.term - The term the balances are carried into
 * @returns {Array<Object>}
 */
export const buildCarryForwardRows = ({
  ledgers = [],
  payments = [],
  students = [],
  schoolId,
  academicYear,
  term,
} = {}) => {
  const studentsById = new Map(
    (students || []).map((student) => [String(student?.id), student]),
  );
  const scopedPayments = (payments || []).filter(
    (payment) =>
      payment &&
      (!academicYear || payment.academicYear === academicYear) &&
      (!term || payment.term === term),
  );

  const rows = [];
  for (const ledger of ledgers || []) {
    if (!ledger) continue;
    if (academicYear && ledger.academicYear !== academicYear) continue;
    if (term && ledger.term !== term) continue;

    for (const fee of ledger.fees || []) {
      if (!isCarryForwardFeeId(fee?.feeId)) continue;
      const source = parseCarryForwardFeeId(fee.feeId, {
        schoolId,
        studentId: ledger.studentId,
      });
      if (!source) continue;

      const student = studentsById.get(String(ledger.studentId));
      const carriedAmount = Number(fee.amount) || 0;
      const paidAmount = sumPaidAgainstFee(
        scopedPayments.filter(
          (payment) => payment.studentId === ledger.studentId,
        ),
        fee.feeId,
      );
      const outstandingAmount = Math.max(0, carriedAmount - paidAmount);

      rows.push({
        studentId: ledger.studentId,
        studentName: student?.name || ledger.studentId,
        classId: ledger.classId || student?.classId || "",
        className:
          student?.className ||
          ledger.className ||
          (ledger.classId ? "" : "Unassigned"),
        carryForwardFeeId: fee.feeId,
        feeName: fee.feeName || "",
        fromAcademicYear: source.fromAcademicYear,
        fromTerm: source.fromTerm,
        toAcademicYear: ledger.academicYear,
        toTerm: ledger.term,
        carriedAmount,
        paidAmount,
        outstandingAmount,
        status: outstandingAmount > 0 ? "outstanding" : "settled",
      });
    }
  }
  return rows;
};

const groupRows = (rows, keyOf, labelOf) => {
  const groups = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: labelOf(row),
        studentCount: 0,
        carriedAmount: 0,
        paidAmount: 0,
        outstandingAmount: 0,
      });
    }
    const group = groups.get(key);
    group.studentCount += 1;
    group.carriedAmount += Number(row.carriedAmount) || 0;
    group.paidAmount += Number(row.paidAmount) || 0;
    group.outstandingAmount += Number(row.outstandingAmount) || 0;
  }
  return [...groups.values()].sort(
    (a, b) => b.outstandingAmount - a.outstandingAmount || a.label.localeCompare(b.label),
  );
};

/**
 * Build a lookup of class id -> human readable class name from the class
 * rooms a school has configured.
 *
 * The admin pages already load this list (`availableClasses`); this helper
 * only turns it into a lookup so a stored class id can be shown with its
 * human readable name. It never introduces a second class-name source.
 *
 * @param {Array<{id: string, name?: string}>} classRooms
 * @returns {Map<string, string>}
 */
export const buildClassNameLookup = (classRooms) => {
  const lookup = new Map();
  for (const classRoom of classRooms || []) {
    const id = String(classRoom?.id || "").trim();
    if (!id) continue;
    const name = String(classRoom?.name || "").trim();
    lookup.set(id, name || id);
  }
  return lookup;
};

/**
 * Resolve the label to display for a class.
 *
 * Preference order: the configured human readable name, the name stored on
 * the record, the raw class id, and finally "Unassigned". It never throws.
 *
 * @param {Object} params
 * @param {string} [params.classId] - The stored class id
 * @param {string} [params.className] - The class name stored on the record
 * @param {Map<string, string>} [params.classNameLookup] - Configured classes
 * @returns {string}
 */
export const resolveClassLabel = ({
  classId,
  className,
  classNameLookup,
} = {}) => {
  const id = String(classId || "").trim();
  if (id) {
    const mapped = classNameLookup?.get ? classNameLookup.get(id) : undefined;
    const mappedName = String(mapped || "").trim();
    if (mappedName) return mappedName;
  }
  const stored = String(className || "").trim();
  if (stored) return stored;
  return id || "Unassigned";
};

/**
 * Build the full administrator review: the rows, the group totals and the
 * school totals.
 *
 * @param {Object} params - see {@link buildCarryForwardRows}
 * @returns {Object}
 */
export const buildCarryForwardReview = ({
  ledgers = [],
  payments = [],
  students = [],
  schoolId,
  academicYear,
  term,
} = {}) => {
  const rows = buildCarryForwardRows({
    ledgers,
    payments,
    students,
    schoolId,
    academicYear,
    term,
  });
  const outstandingRows = rows.filter((row) => row.outstandingAmount > 0);

  const byClass = groupRows(
    rows,
    (row) => row.classId || "unassigned",
    (row) => row.className || row.classId || "Unassigned",
  );
  const bySourceTerm = groupRows(
    rows,
    (row) => `${row.fromAcademicYear}|${row.fromTerm}`,
    (row) => `${row.fromTerm}, ${row.fromAcademicYear}`,
  );

  return {
    schoolId,
    academicYear,
    term,
    rows,
    outstandingRows,
    groups: { byClass, bySourceTerm },
    totals: {
      studentCount: rows.length,
      outstandingStudentCount: outstandingRows.length,
      carriedAmount: sumBy(rows, "carriedAmount"),
      paidAmount: sumBy(rows, "paidAmount"),
      outstandingAmount: sumBy(outstandingRows, "outstandingAmount"),
    },
  };
};

/**
 * Deterministic ID of the per-rollover review snapshot.
 *
 * @param {string} schoolId
 * @param {string} academicYear
 * @param {string} term
 * @returns {string}
 */
export const buildCarryForwardReviewId = (schoolId, academicYear, term) =>
  `cf-${schoolId}-${String(academicYear || "").replace(/\s+/g, "")}-${String(
    term || "",
  ).replace(/\s+/g, "")}`;

/**
 * Deterministic ID of the school level carry-forward notification.
 *
 * @param {string} schoolId
 * @param {string} academicYear
 * @param {string} term
 * @returns {string}
 */
export const buildCarryForwardNotificationId = (schoolId, academicYear, term) =>
  `carry-forward-${schoolId}-${String(academicYear || "").replace(
    /\s+/g,
    "",
  )}-${String(term || "").replace(/\s+/g, "")}`;

/**
 * Human readable summary of a review, used for the admin notification.
 *
 * @param {Object} review
 * @returns {string}
 */
export const buildCarryForwardNotificationMessage = (review) => {
  const totals = review?.totals || {};
  const sourceTerm = review?.groups?.bySourceTerm?.[0]?.label || "the previous term";
  return (
    `${review?.term || "New term"} carry-forward: ` +
    `${totals.studentCount || 0} student(s) carried GHS ${(
      totals.carriedAmount || 0
    ).toFixed(2)} from ${sourceTerm}. ` +
    `Outstanding carried balance: GHS ${(
      totals.outstandingAmount || 0
    ).toFixed(2)}. ` +
    `Review in Fees & Payments -> Carry-forward review.`
  );
};
