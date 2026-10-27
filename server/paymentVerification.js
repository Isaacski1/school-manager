/**
 * Server-authoritative online fee payment recording.
 *
 * Parents used to write authoritative student payment documents straight from
 * the browser after a Paystack checkout. This service moves that write behind
 * the Express API: it verifies the Paystack reference server-side (Verify
 * Transaction API), checks the caller is authorized for the student, checks
 * the student/school/ledger combination, and only then writes the payment
 * documents with the Admin SDK. Doc IDs are derived from the Paystack
 * reference so repeated requests are idempotent.
 */

import crypto from "crypto";

export const PAYMENT_RECORD_SOURCE = "paystack_verified_server";

const MAX_ALLOCATIONS = 20;
const ALLOWED_CURRENCY = "GHS";
// A pesewa is the smallest unit; compare amounts in pesewas to avoid float drift.
const PESA_EPSILON = 0;

/**
 * Compute the SHA-256 request ID from the normalized school ID and raw reference.
 * @param {string} normalizedSchoolId - The school ID after trimming.
 * @param {string} rawReference - The raw Paystack reference.
 * @returns {string} Hex-encoded SHA-256 hash.
 */
function computeRequestId(normalizedSchoolId, rawReference) {
  const input = `${normalizedSchoolId}|${rawReference}`;
  return crypto.createHash("sha256").update(input, "utf8").digest().toString("hex");
}

/**
 * Compute the canonical fingerprint of the payment request.
 * @param {Object} input - The parsed input from parseVerifyAndRecordInput.
 * @returns {string} Canonical string representation.
 */
function computeFingerprint(input) {
  // Create a copy of the allocations array to avoid mutating the original
  const allocations = [...input.allocations];
  // Sort allocations by feeId, academicYear, term, amountPaid (in pesewas)
  allocations.sort((a, b) => {
    if (a.feeId !== b.feeId) return a.feeId.localeCompare(b.feeId);
    if (a.academicYear !== b.academicYear) return a.academicYear.localeCompare(b.academicYear);
    if (a.term !== b.term) return a.term.localeCompare(b.term);
    return Math.round(a.amountPaid * 100) - Math.round(b.amountPaid * 100);
  });

  // Build a canonical string
  // We include: schoolId, studentId, reference, and each allocation in order
  const parts = [
    input.schoolId,
    input.studentId,
    input.reference,
    allocations.map(
      (alloc) =>
        `${alloc.feeId}|${alloc.academicYear}|${alloc.term}|${Math.round(
          alloc.amountPaid * 100
        )}` // Convert to pesewas for integer comparison
    ).join(";"),
  ];
  return parts.join("|");
}

export { computeRequestId, computeFingerprint };

export class PaymentVerificationError extends Error {
  constructor(code, message, httpStatus = 400) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

const sanitizeReference = (raw) =>
  String(raw || "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);

const normalizeDigits = (value) => String(value || "").replace(/\D/g, "");

const phoneDigitsMatch = (a, b) => {
  const da = normalizeDigits(a);
  const db = normalizeDigits(b);
  return Boolean(
    da &&
      db &&
      (da === db || da.endsWith(db) || db.endsWith(da)),
  );
};

const toFinitePositiveNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

/**
 * Parse and validate the request body into normalized input.
 * Exported for tests.
 */
export function parseVerifyAndRecordInput(rawBody) {
  const body = rawBody || {};
  const reference = String(body.reference || "").trim();
  const schoolId = String(body.schoolId || "").trim();
  const studentId = String(body.studentId || "").trim();

  if (!reference || reference.length > 120) {
    throw new PaymentVerificationError(
      "INVALID_REFERENCE",
      "A valid Paystack reference is required.",
    );
  }
  if (!schoolId || !studentId) {
    throw new PaymentVerificationError(
      "INVALID_REQUEST",
      "schoolId and studentId are required.",
    );
  }
  if (!Array.isArray(body.allocations) || body.allocations.length === 0) {
    throw new PaymentVerificationError(
      "INVALID_ALLOCATIONS",
      "At least one payment allocation is required.",
    );
  }
  if (body.allocations.length > MAX_ALLOCATIONS) {
    throw new PaymentVerificationError(
      "INVALID_ALLOCATIONS",
      `Too many allocations (max ${MAX_ALLOCATIONS}).`,
    );
  }

  let totalPesewas = 0;
  const allocations = body.allocations.map((allocation, index) => {
    const amount = toFinitePositiveNumber(allocation?.amountPaid);
    if (amount === null) {
      throw new PaymentVerificationError(
        "INVALID_ALLOCATIONS",
        `Allocation ${index} has an invalid amount.`,
      );
    }
    const roundedPesewas = Math.round(amount * 100);
    if (roundedPesewas <= 0) {
      throw new PaymentVerificationError(
        "INVALID_ALLOCATIONS",
        `Allocation ${index} amount is too small.`,
      );
    }
    totalPesewas += roundedPesewas;
    return {
      feeId: String(allocation.feeId || "online_payment").slice(0, 120),
      feeName: String(allocation.feeName || "School Fees").slice(0, 200),
      amountPaid: roundedPesewas / 100,
      academicYear: String(allocation.academicYear || "").slice(0, 40),
      term: String(allocation.term || "").slice(0, 40),
    };
  });

  if (totalPesewas <= 0) {
    throw new PaymentVerificationError(
      "INVALID_ALLOCATIONS",
      "Total allocated amount must be greater than zero.",
    );
  }

  return {
    reference,
    schoolId,
    studentId,
    allocations,
    totalPesewas,
  };
}

export function createPaymentVerificationService({
  db,
  FieldValue,
  verifyTransaction,
  now = () => Date.now(),
}) {
  const verifyWithPaystack = async (reference) => {
    const response = await verifyTransaction(reference);
    if (!response || !response.ok || response.status !== true || !response.data) {
      throw new PaymentVerificationError(
        "PAYSTACK_VERIFICATION_FAILED",
        "We could not verify this payment with Paystack. Please contact support.",
        402,
      );
    }
    return response.data;
  };

  const assertTransactionUsable = (transaction, input) => {
    if (String(transaction.status || "") !== "success") {
      throw new PaymentVerificationError(
        "PAYSTACK_TRANSACTION_NOT_SUCCESSFUL",
        "This payment has not been completed successfully.",
        402,
      );
    }
    if (
      transaction.currency &&
      String(transaction.currency).toUpperCase() !== ALLOWED_CURRENCY
    ) {
      throw new PaymentVerificationError(
        "CURRENCY_MISMATCH",
        `Unexpected payment currency: ${transaction.currency}.`,
      );
    }
    const verifiedPesewas = Math.round(Number(transaction.amount || 0));
    if (!Number.isFinite(verifiedPesewas) || verifiedPesewas <= 0) {
      throw new PaymentVerificationError(
        "PAYSTACK_VERIFICATION_FAILED",
        "Paystack did not return a usable amount for this payment.",
        402,
      );
    }
    if (Math.abs(verifiedPesewas - input.totalPesewas) > PESA_EPSILON) {
      throw new PaymentVerificationError(
        "AMOUNT_MISMATCH",
        "The amount paid does not match the amount to be recorded. Please contact support.",
        409,
      );
    }

    // The reference was created by /api/payments/initialize-fee-payment with
    // metadata binding it to one student and school. If Paystack returns that
    // metadata, it must agree with the request — this prevents replaying a
    // valid reference for a different student.
    const metadata = transaction.metadata || {};
    const metadataStudentId = String(metadata.studentId || "");
    const metadataSchoolId = String(metadata.schoolId || "");
    if (
      (metadataStudentId && metadataStudentId !== input.studentId) ||
      (metadataSchoolId && metadataSchoolId !== input.schoolId)
    ) {
      throw new PaymentVerificationError(
        "REFERENCE_MISMATCH",
        "This payment reference belongs to a different student or school.",
        409,
      );
    }
    return verifiedPesewas;
  };

  const loadStudentAndSchool = async (input) => {
    const [studentSnap, schoolSnap] = await Promise.all([
      db.collection("students").doc(input.studentId).get(),
      db.collection("schools").doc(input.schoolId).get(),
    ]);
    if (!studentSnap.exists) {
      throw new PaymentVerificationError(
        "STUDENT_NOT_FOUND",
        "Student record not found.",
        404,
      );
    }
    if (!schoolSnap.exists) {
      throw new PaymentVerificationError(
        "SCHOOL_NOT_FOUND",
        "School record not found.",
        404,
      );
    }
    const studentData = studentSnap.data() || {};
    if (String(studentData.schoolId || "") !== input.schoolId) {
      throw new PaymentVerificationError(
        "STUDENT_SCHOOL_MISMATCH",
        "This student does not belong to the requested school.",
        409,
      );
    }
    const schoolData = schoolSnap.data() || {};
    const status = String(schoolData.status || "");
    if (status && status !== "active" && status !== "trial_active") {
      throw new PaymentVerificationError(
        "SCHOOL_INACTIVE",
        "The school is not active.",
        409,
      );
    }
    return { studentData, schoolData };
  };

  const assertCallerAuthorized = async (caller, input, studentData) => {
    const userSnap = await db.collection("users").doc(caller.uid).get();
    const userData = userSnap.exists ? userSnap.data() || {} : {};
    const role = String(
      userData.role || caller.role || caller.userRole || "",
    );

    if (role === "super_admin") return;
    if (role === "school_admin" && String(userData.schoolId || "") === input.schoolId) {
      return;
    }

    if (role === "parent" || caller.role === "parent" || caller.userRole === "parent") {
      const callerPhones = [
        userData.phoneNumber,
        caller.phone_number,
        caller.phoneNumber,
        caller.parentPhone,
        caller.uid,
      ].filter(Boolean);

      const studentContactPhones = [
        studentData.fatherPhone,
        studentData.motherPhone,
        studentData.guardianPhone,
      ];

      const phoneMatches = callerPhones.some((callerPhone) =>
        studentContactPhones.some((studentPhone) =>
          phoneDigitsMatch(callerPhone, studentPhone),
        ),
      );

      const linkedStudentIds = [
        ...(Array.isArray(userData.linkedStudentIds) ? userData.linkedStudentIds : []),
        ...(Array.isArray(userData.studentIds) ? userData.studentIds : []),
        ...(Array.isArray(caller.studentIds) ? caller.studentIds : []),
      ].map(String);

      if (phoneMatches || linkedStudentIds.includes(input.studentId)) return;
    }

    throw new PaymentVerificationError(
      "FORBIDDEN",
      "You are not authorized to record a payment for this student.",
      403,
    );
  };

  const loadStudentLedgers = async (input) => {
    // NOTE: the Admin SDK's collection() silently ignores extra variadic
    // path segments (unlike the browser v9 SDK), so nested paths must be
    // slash-joined strings.
    const queries = await Promise.all([
      db
        .collection(`schools/${input.schoolId}/feeLedgers`)
        .where("schoolId", "==", input.schoolId)
        .where("studentId", "==", input.studentId)
        .get()
        .catch(() => ({ docs: [] })),
      db
        .collection("student_ledgers")
        .where("schoolId", "==", input.schoolId)
        .where("studentId", "==", input.studentId)
        .get()
        .catch(() => ({ docs: [] })),
    ]);
    return queries.flatMap((snapshot) =>
      (snapshot.docs || []).map((doc) => ({ id: doc.id, ...(doc.data() || {}) })),
    );
  };

  /**
   * Every allocation must point at a real ledger (academicYear + term) for
   * this student. Exception: students with no ledgers at all yet (brand-new
   * students whose ledgers are projected from fee definitions on the client)
   * are still recorded — the amount itself is already verified against
   * Paystack, so financial integrity does not depend on this check.
   */
  const assertAllocationsMatchLedgers = (input, ledgers) => {
    if (ledgers.length === 0) return;
    const ledgerKeys = new Set(
      ledgers.map(
        (ledger) => `${String(ledger.academicYear || "")}|${String(ledger.term || "")}`,
      ),
    );
    for (const [index, allocation] of input.allocations.entries()) {
      if (!ledgerKeys.has(`${allocation.academicYear}|${allocation.term}`)) {
        throw new PaymentVerificationError(
          "LEDGER_NOT_FOUND",
          `No fee ledger found for ${allocation.academicYear} ${allocation.term}. Please contact your school.`,
          409,
        );
      }
    }
  };

  const resolvePaymentsCollection = async (schoolId) => {
    const settingsSnap = await db
      .collection("schools")
      .doc(schoolId)
      .collection("financeSettings")
      .doc("main")
      .get()
      .catch(() => null);
    const settings =
      settingsSnap && settingsSnap.exists ? settingsSnap.data() || {} : {};
    if (settings.financeVersion === "v2") {
      // Slash-joined path: Admin SDK collection() ignores variadic segments.
      return db.collection(`schools/${schoolId}/payments`);
    }
    return db.collection("payments");
  };

  const buildPaymentDoc = ({ input, studentData, allocation, index, docId, verifiedPesewas, transaction }) => ({
    id: docId,
    schoolId: input.schoolId,
    studentId: input.studentId,
    classId: String(studentData.classId || ""),
    feeId: allocation.feeId,
    feeName: allocation.feeName,
    amountPaid: allocation.amountPaid,
    paymentMethod: "MoMo",
    receiptNumber: input.reference,
    reference: input.reference,
    academicYear: allocation.academicYear,
    term: allocation.term,
    isOpeningPayment: false,
    createdAt: now(),
    recordedBy: "Parent Portal",
    source: PAYMENT_RECORD_SOURCE,
    paystackVerified: true,
    currency: ALLOWED_CURRENCY,
    verifiedAmountGhs: Math.round(verifiedPesewas) / 100,
    paystackChannel: transaction.channel || null,
    paystackGatewayResponse: transaction.gateway_response || null,
    paystackPaidAt: transaction.paid_at || null,
    allocationIndex: index,
    updatedAt: FieldValue.serverTimestamp(),
  });

const verifyAndRecordPayment = async (caller, rawBody) => {
      const input = parseVerifyAndRecordInput(rawBody);

      // All reads must happen before any writes
      const { studentData } = await loadStudentAndSchool(input);
      await assertCallerAuthorized(caller, input, studentData);

      const transaction = await verifyWithPaystack(input.reference);
      const verifiedPesewas = assertTransactionUsable(transaction, input);

      const ledgers = await loadStudentLedgers(input);
      assertAllocationsMatchLedgers(input, ledgers);

      // Compute request ID and fingerprint
      const requestId = computeRequestId(input.schoolId, input.reference);
      const fingerprint = computeFingerprint(input);

      // Resolve payments collections
      const activePaymentsCol = await resolvePaymentsCollection(input.schoolId);
      const settingsSnap = await db
        .collection("schools")
        .doc(input.schoolId)
        .collection("financeSettings")
        .doc("main")
        .get()
        .catch(() => null);
      const settings =
        settingsSnap && settingsSnap.exists ? settingsSnap.data() || {} : {};
      let alternatePaymentsCol;
      if (settings.financeVersion === "v2") {
        alternatePaymentsCol = db.collection("payments");
      } else {
        alternatePaymentsCol = db.collection(`schools/${input.schoolId}/payments`);
      }

      // Reference to the payment request document
      const paymentRequestsCollection = db.collection("paymentRequests");
      const requestDocRef = paymentRequestsCollection.doc(requestId);

      // Helper to build allocation tuple for comparison
      const allocationTuple = (alloc) => [
        alloc.feeId,
        alloc.academicYear,
        alloc.term,
        Math.round(alloc.amountPaid * 100),
      ];

      // Build input allocations tuples for comparison
      const inputAllocationsTuples = input.allocations
        .map(allocationTuple)
        .sort((a, b) => {
          if (a[0] !== b[0]) return a[0].localeCompare(b[0]);
          if (a[1] !== b[1]) return a[1].localeCompare(b[1]);
          if (a[2] !== b[2]) return a[2].localeCompare(b[2]);
          return a[3] - b[3];
        });

      // Execute the write phase in a transaction with create-only semantics
      const attemptWrite = async () => {
        return await db.runTransaction(async (tx) => {
          // All transaction reads before any transaction writes
          const requestDocSnap = await tx.get(requestDocRef);

          // Query both collections for payment documents with matching reference
          const [activeSnaps, alternateSnaps] = await Promise.all([
            activePaymentsCol.where("reference", "==", input.reference).get(),
            alternatePaymentsCol.where("reference", "==", input.reference).get(),
          ]);

          const existingAllocationDocs = [...activeSnaps.docs, ...alternateSnaps.docs].map(
            (doc) => ({ id: doc.id, ...(doc.data() || {}) })
          );

          // Build set of existing allocations from docs that match source and receiptNumber
          const validExistingAllocations = [];
          for (const doc of existingAllocationDocs) {
            if (
              doc.source === PAYMENT_RECORD_SOURCE &&
              String(doc.receiptNumber || "") === input.reference
            ) {
              validExistingAllocations.push({
                feeId: doc.feeId,
                academicYear: doc.academicYear,
                term: doc.term,
                amountPaid: doc.amountPaid,
              });
            } else {
              // Found a document with matching reference but mismatched source/receiptNumber -> conflict
              throw new PaymentVerificationError(
                "IDEMPOTENCY_CONFLICT",
                "Conflicting payment record found with mismatched source or reference.",
                409
              );
            }
          }

          // Build existing allocations tuples for comparison
          const existingAllocationsTuples = validExistingAllocations
            .map(allocationTuple)
            .sort((a, b) => {
              if (a[0] !== b[0]) return a[0].localeCompare(b[0]);
              if (a[1] !== b[1]) return a[1].localeCompare(b[1]);
              if (a[2] !== b[2]) return a[2].localeCompare(b[2]);
              return a[3] - b[3];
            });

          // Check if the existing allocations exactly match the input allocations
          const isExactMatch =
            inputAllocationsTuples.length === existingAllocationsTuples.length &&
            inputAllocationsTuples.every((tuple, index) => {
              return (
                tuple[0] === existingAllocationsTuples[index][0] &&
                tuple[1] === existingAllocationsTuples[index][1] &&
                tuple[2] === existingAllocationsTuples[index][2] &&
                tuple[3] === existingAllocationsTuples[index][3]
              );
            });

          // Case 1: Request document exists and fingerprint matches -> idempotent success
          if (requestDocSnap.exists) {
            const existingData = requestDocSnap.data();
            if (existingData && existingData.fingerprint === fingerprint) {
              return {
                success: true,
                reference: input.reference,
                verifiedAmountGhs: verifiedPesewas / 100,
                recordedCount: 0,
                alreadyRecordedCount: input.allocations.length,
                idempotent: true,
                payments: [],
              };
            } else {
              // Request document exists but fingerprint mismatch -> conflict
              throw new PaymentVerificationError(
                "IDEMPOTENCY_CONFLICT",
                "Payment request fingerprint mismatch.",
                409
              );
            }
          }

          // Case 2: No existing allocation documents -> create request and allocations
          if (existingAllocationDocs.length === 0) {
            // Create request document (create-only)
            const requestRecord = {
              fingerprint,
              createdAt: now(),
              schoolId: input.schoolId,
              studentId: input.studentId,
              reference: input.reference,
            };
            tx.create(requestDocRef, requestRecord);

            // Create allocation documents (create-only)
            const recorded = [];
            for (const [index, allocation] of input.allocations.entries()) {
              const docId = `PAYVRF-${sanitizeReference(input.reference)}-${index}`;
              const docRef = activePaymentsCol.doc(docId);
              const paymentDoc = buildPaymentDoc({
                input,
                studentData,
                allocation,
                index,
                docId,
                verifiedPesewas,
                transaction,
              });
              tx.create(docRef, paymentDoc);
              recorded.push(paymentDoc);
            }

            return {
              success: true,
              reference: input.reference,
              verifiedAmountGhs: verifiedPesewas / 100,
              recordedCount: recorded.length,
              alreadyRecordedCount: 0,
              idempotent: false,
              payments: recorded,
            };
          }

          // Case 3: Exact match of existing allocations -> create request document only, return idempotent
          if (isExactMatch) {
            const requestRecord = {
              fingerprint,
              createdAt: now(),
              schoolId: input.schoolId,
              studentId: input.studentId,
              reference: input.reference,
            };
            tx.create(requestDocRef, requestRecord);

            return {
              success: true,
              reference: input.reference,
              verifiedAmountGhs: verifiedPesewas / 100,
              recordedCount: 0,
              alreadyRecordedCount: input.allocations.length,
              idempotent: true,
              payments: [],
            };
          }

          // Case 4: Partial or conflicting legacy set -> conflict
          throw new PaymentVerificationError(
            "IDEMPOTENCY_CONFLICT",
            "Partial or conflicting legacy allocation set found.",
            409
          );
        });
      };

      // Handle transaction conflicts (ALREADY_EXISTS) with fresh read-only validation
      try {
        return await attemptWrite();
      } catch (error) {
        // Check if this is a Firestore ALREADY_EXISTS error
        const isAlreadyExists =
          error.code === "already-exists" ||
          error.code === "ALREADY_EXISTS" ||
          (error.message && error.message.includes("already exists"));

        if (isAlreadyExists) {
          // Fresh read-only validation after conflict
          const freshRequestDocSnap = await requestDocRef.get();
          if (freshRequestDocSnap.exists) {
            const existingData = freshRequestDocSnap.data();
            if (existingData && existingData.fingerprint === fingerprint) {
              // Exact match -> idempotent success
              return {
                success: true,
                reference: input.reference,
                verifiedAmountGhs: verifiedPesewas / 100,
                recordedCount: 0,
                alreadyRecordedCount: input.allocations.length,
                idempotent: true,
                payments: [],
              };
            } else {
              // Fingerprint mismatch -> conflict
              throw new PaymentVerificationError(
                "IDEMPOTENCY_CONFLICT",
                "Payment request fingerprint mismatch after conflict.",
                409
              );
            }
          }

          // Request document doesn't exist, check allocation documents
          const [freshActiveSnaps, freshAlternateSnaps] = await Promise.all([
            activePaymentsCol.where("reference", "==", input.reference).get(),
            alternatePaymentsCol.where("reference", "==", input.reference).get(),
          ]);

          const freshExistingAllocationDocs = [...freshActiveSnaps.docs, ...freshAlternateSnaps.docs].map(
            (doc) => ({ id: doc.id, ...(doc.data() || {}) })
          );

          const freshValidExistingAllocations = [];
          for (const doc of freshExistingAllocationDocs) {
            if (
              doc.source === PAYMENT_RECORD_SOURCE &&
              String(doc.receiptNumber || "") === input.reference
            ) {
              freshValidExistingAllocations.push({
                feeId: doc.feeId,
                academicYear: doc.academicYear,
                term: doc.term,
                amountPaid: doc.amountPaid,
              });
            } else {
              throw new PaymentVerificationError(
                "IDEMPOTENCY_CONFLICT",
                "Conflicting payment record found with mismatched source or reference after conflict.",
                409
              );
            }
          }

          const freshExistingAllocationsTuples = freshValidExistingAllocations
            .map(allocationTuple)
            .sort((a, b) => {
              if (a[0] !== b[0]) return a[0].localeCompare(b[0]);
              if (a[1] !== b[1]) return a[1].localeCompare(b[1]);
              if (a[2] !== b[2]) return a[2].localeCompare(b[2]);
              return a[3] - b[3];
            });

          const freshIsExactMatch =
            inputAllocationsTuples.length === freshExistingAllocationsTuples.length &&
            inputAllocationsTuples.every((tuple, index) => {
              return (
                tuple[0] === freshExistingAllocationsTuples[index][0] &&
                tuple[1] === freshExistingAllocationsTuples[index][1] &&
                tuple[2] === freshExistingAllocationsTuples[index][2] &&
                tuple[3] === freshExistingAllocationsTuples[index][3]
              );
            });

          if (freshExistingAllocationDocs.length === 0) {
            // No allocation docs found after conflict - this shouldn't happen if conflict was on request doc
            // But we'll treat as conflict since we can't determine state
            throw new PaymentVerificationError(
              "IDEMPOTENCY_CONFLICT",
              "Unable to determine state after conflict: no request or allocation documents found.",
              409
            );
          } else if (freshIsExactMatch) {
            // Exact match -> idempotent success (request doc was created by another transaction)
            return {
              success: true,
              reference: input.reference,
              verifiedAmountGhs: verifiedPesewas / 100,
              recordedCount: 0,
              alreadyRecordedCount: input.allocations.length,
              idempotent: true,
              payments: [],
            };
          } else {
            // Partial or conflicting -> conflict
            throw new PaymentVerificationError(
              "IDEMPOTENCY_CONFLICT",
              "Partial or conflicting legacy allocation set found after conflict.",
              409
            );
          }
        }

        // Unrelated error - propagate unchanged
        throw error;
      }
    };

  return { verifyAndRecordPayment };
}
