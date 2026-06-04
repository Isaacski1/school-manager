import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import admin from "firebase-admin";

dotenv.config({ path: path.join(process.cwd(), "server", ".env.local") });
dotenv.config({ path: path.join(process.cwd(), "server", ".env") });
dotenv.config({ path: path.join(process.cwd(), ".env") });

const WRITE = process.argv.includes("--write");
const SKIP_SETTLEMENTS = process.argv.includes("--skip-settlements");
const CLEAR_EXISTING = process.argv.includes("--clear-existing");
const NO_VERIFY_LIVE_PAYMENTS = process.argv.includes("--no-verify-live-payments");
const SCHOOL_ARG = process.argv.find((arg) => arg.startsWith("--schoolId="));
const SCHOOL_ID_FILTER = SCHOOL_ARG ? SCHOOL_ARG.split("=").slice(1).join("=").trim() : "";
const PLATFORM_FEE_PERCENTAGE = 2;
const SCHOOL_SETTLEMENT_PERCENTAGE = 100 - PLATFORM_FEE_PERCENTAGE;
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "";

const parseServiceAccount = () => {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return null;
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    return null;
  }

  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const possiblePath = path.isAbsolute(trimmed)
      ? trimmed
      : path.join(process.cwd(), trimmed);
    if (!fs.existsSync(possiblePath)) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY is neither valid JSON nor an existing file path.");
    }
    return JSON.parse(fs.readFileSync(possiblePath, "utf8"));
  }
};

const initializeFirebase = () => {
  const serviceAccount = parseServiceAccount();
  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id,
    });
    return;
  }

  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
};

const payoutLedgerDocId = (prefix, rawId) =>
  `${prefix}_${String(rawId || Date.now()).replace(/[^a-zA-Z0-9_-]/g, "_")}`;

const pesewasToGhs = (value) => {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? Math.round((amount / 100) * 100) / 100 : 0;
};

const isLivePaystackSecret = () => /^sk_live_/i.test(String(PAYSTACK_SECRET_KEY || "").trim());

const paystackRequest = async (endpoint) => {
  if (!isLivePaystackSecret()) {
    throw new Error("PAYSTACK_SECRET_KEY must be a live key to backfill settlements.");
  }

  const response = await fetch(`https://api.paystack.co${endpoint}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.status === false) {
    throw new Error(data?.message || `Paystack request failed with ${response.status}`);
  }
  return data;
};

const verifyLivePaystackPayment = async (reference) => {
  const cleanReference = String(reference || "").trim();
  if (!cleanReference || NO_VERIFY_LIVE_PAYMENTS || !isLivePaystackSecret()) {
    return { verified: false, data: null, skipped: true };
  }

  try {
    const verification = await paystackRequest(
      `/transaction/verify/${encodeURIComponent(cleanReference)}`,
    );
    const tx = verification?.data || {};
    return {
      verified:
        String(tx.status || "").toLowerCase() === "success" &&
        String(tx.currency || "GHS").toUpperCase() === "GHS",
      data: tx,
      skipped: false,
    };
  } catch (error) {
    return {
      verified: false,
      data: null,
      skipped: false,
      error: error.message,
    };
  }
};

const isOnlineFeePayment = (payment) => {
  const recordedBy = String(payment.recordedBy || "").toLowerCase();
  const receiptNumber = String(payment.receiptNumber || payment.reference || "");
  const type = String(payment.type || payment.category || "").toLowerCase();
  return (
    recordedBy === "parent portal" ||
    type === "fee_payment" ||
    /^FEES-/i.test(receiptNumber)
  );
};

const toDateValue = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (typeof value === "number") return value;
  return value;
};

const buildEntry = (payment, schoolSettings = {}, verifiedTransaction = null) => {
  const reference = String(payment.receiptNumber || payment.reference || payment.id || "").trim();
  const grossAmount = verifiedTransaction
    ? pesewasToGhs(verifiedTransaction.amount)
    : Math.max(0, Number(payment.amountPaid ?? payment.amount ?? 0));
  const schoolSettlementPercentage = Number.isFinite(Number(schoolSettings.schoolSettlementPercentage))
    ? Number(schoolSettings.schoolSettlementPercentage)
    : SCHOOL_SETTLEMENT_PERCENTAGE;
  const platformFeePercentage = Number.isFinite(Number(schoolSettings.platformFeePercentage))
    ? Number(schoolSettings.platformFeePercentage)
    : PLATFORM_FEE_PERCENTAGE;
  const schoolShareAmount =
    grossAmount * Math.max(0, Math.min(100, schoolSettlementPercentage)) / 100;

  return {
    entryId: payoutLedgerDocId("payment", reference || payment.id),
    data: {
      type: "payment_received",
      direction: "credit",
      reference: reference || payment.id || null,
      amount: Number(schoolShareAmount.toFixed(2)),
      grossAmount: Number(grossAmount.toFixed(2)),
      schoolShareAmount: Number(schoolShareAmount.toFixed(2)),
      platformFeePercentage,
      schoolSettlementPercentage,
      currency: payment.currency || "GHS",
      status: "success",
      source: verifiedTransaction ? "live_paystack_backfill" : "historical_backfill",
      paystackEvent: verifiedTransaction ? "live_transaction_verify_backfill" : payment.event || "historical_backfill",
      subaccountCode: schoolSettings.subaccountCode || payment.subaccountCode || null,
      studentId: payment.studentId || null,
      studentName: payment.studentName || null,
      feeId: payment.feeId || null,
      feeName: payment.feeName || null,
      academicYear: payment.academicYear || null,
      term: payment.term || null,
      paidAt:
        verifiedTransaction?.paid_at ||
        verifiedTransaction?.paidAt ||
        toDateValue(payment.paidAt || payment.createdAt) ||
        Date.now(),
      originalPaymentId: payment.id || null,
      paystackData: verifiedTransaction
        ? {
            id: verifiedTransaction.id || null,
            status: verifiedTransaction.status || null,
            channel: verifiedTransaction.channel || null,
            gateway_response: verifiedTransaction.gateway_response || null,
            amount: verifiedTransaction.amount || null,
            fees: verifiedTransaction.fees || null,
          }
        : null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
  };
};

const settlementAmountToGhs = (settlement) =>
  pesewasToGhs(
    settlement.effective_amount ??
      settlement.total_amount ??
      settlement.total_processed ??
      settlement.amount,
  );

const buildSettlementEntry = (settlement, schoolId, subaccountCode) => {
  const settlementId =
    settlement.id ||
    settlement.reference ||
    settlement.settlement_code ||
    `${schoolId}_${settlement.settlement_date || settlement.createdAt || Date.now()}`;
  const amount = settlementAmountToGhs(settlement);

  return {
    entryId: payoutLedgerDocId("settlement", settlementId),
    data: {
      type: "settlement",
      direction: "debit",
      reference: String(settlementId),
      amount,
      currency: settlement.currency || "GHS",
      status: String(settlement.status || "unknown").toLowerCase(),
      source: "historical_backfill",
      paystackEvent: "historical_settlement_backfill",
      subaccountCode: subaccountCode || null,
      settledAt:
        settlement.settlement_date ||
        settlement.createdAt ||
        settlement.updatedAt ||
        settlement.paid_at ||
        null,
      paystackData: {
        id: settlement.id || null,
        status: settlement.status || null,
        total_amount: settlement.total_amount ?? null,
        effective_amount: settlement.effective_amount ?? null,
        total_processed: settlement.total_processed ?? null,
        settlement_date: settlement.settlement_date || null,
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
  };
};

const fetchSettlementsForSubaccount = async (subaccountCode) => {
  const code = String(subaccountCode || "").trim();
  if (!code || SKIP_SETTLEMENTS || !isLivePaystackSecret()) {
    return [];
  }

  const subaccount = await paystackRequest(`/subaccount/${encodeURIComponent(code)}`);
  const subaccountId = subaccount?.data?.id || code;
  const settlements = [];

  for (let page = 1; page <= 20; page += 1) {
    const settlementData = await paystackRequest(
      `/settlement?subaccount=${encodeURIComponent(subaccountId)}&perPage=100&page=${page}`,
    );
    const rows = Array.isArray(settlementData?.data) ? settlementData.data : [];
    settlements.push(...rows);
    const pageCount = Number(settlementData?.meta?.pageCount || page);
    if (page >= pageCount || rows.length === 0) break;
  }

  return settlements;
};

const collectPayments = async (db, schoolId) => {
  const docs = new Map();
  const addSnap = (snap) => {
    snap.docs.forEach((docSnap) => {
      docs.set(docSnap.ref.path, { id: docSnap.id, ...(docSnap.data() || {}) });
    });
  };

  const [schoolPaymentsSnap, legacyPaymentsSnap] = await Promise.all([
    db.collection("schools").doc(schoolId).collection("payments").get(),
    db.collection("payments").where("schoolId", "==", schoolId).get(),
  ]);
  addSnap(schoolPaymentsSnap);
  addSnap(legacyPaymentsSnap);

  return Array.from(docs.values()).filter(isOnlineFeePayment);
};

const commitInChunks = async (db, writes) => {
  let committed = 0;
  for (let index = 0; index < writes.length; index += 450) {
    const batch = db.batch();
    writes.slice(index, index + 450).forEach(({ ref, data }) => {
      batch.set(ref, data, { merge: true });
    });
    await batch.commit();
    committed += Math.min(450, writes.length - index);
  }
  return committed;
};

const deleteCollectionInChunks = async (collectionRef) => {
  let deleted = 0;
  while (true) {
    const snap = await collectionRef.limit(450).get();
    if (snap.empty) break;
    const batch = collectionRef.firestore.batch();
    snap.docs.forEach((docSnap) => batch.delete(docSnap.ref));
    await batch.commit();
    deleted += snap.size;
  }
  return deleted;
};

const run = async () => {
  initializeFirebase();
  const db = admin.firestore();
  const schoolsSnap = SCHOOL_ID_FILTER
    ? await db.collection("schools").where(admin.firestore.FieldPath.documentId(), "==", SCHOOL_ID_FILTER).get()
    : await db.collection("schools").get();

  if (schoolsSnap.empty) {
    console.log(SCHOOL_ID_FILTER ? `No school found for ${SCHOOL_ID_FILTER}.` : "No schools found.");
    return;
  }

  let totalCandidates = 0;
  let totalExisting = 0;
  let totalWrites = 0;
  let totalSettlementCandidates = 0;
  let totalSettlementExisting = 0;
  let totalSettlementWrites = 0;
  let totalSkippedUnverified = 0;
  let totalCleared = 0;

  for (const schoolDoc of schoolsSnap.docs) {
    const schoolId = schoolDoc.id;
    const schoolData = schoolDoc.data() || {};
    const paymentSettings = schoolData.paymentSettings || {};
    const onlinePayments = await collectPayments(db, schoolId);
    const writes = [];
    const settlementWrites = [];
    let existing = 0;
    let settlementExisting = 0;
    let skippedUnverified = 0;

    const ledgerCollection = db.collection("schools").doc(schoolId).collection("payoutLedger");

    if (CLEAR_EXISTING) {
      if (!WRITE) {
        const existingLedgerSnap = await ledgerCollection.limit(5000).get();
        totalCleared += existingLedgerSnap.size;
        console.log(`  would clear ${existingLedgerSnap.size} existing payout ledger entries.`);
      } else {
        const deleted = await deleteCollectionInChunks(ledgerCollection);
        totalCleared += deleted;
        console.log(`  cleared ${deleted} existing payout ledger entries.`);
      }
    }

    for (const payment of onlinePayments) {
      const reference = String(payment.receiptNumber || payment.reference || payment.id || "").trim();
      const liveVerification = await verifyLivePaystackPayment(reference);
      if (!liveVerification.skipped && !liveVerification.verified) {
        skippedUnverified += 1;
        continue;
      }

      const { entryId, data } = buildEntry(payment, paymentSettings, liveVerification.data);
      const ref = db.collection("schools").doc(schoolId).collection("payoutLedger").doc(entryId);
      const current = await ref.get();
      if (current.exists) {
        existing += 1;
        continue;
      }
      writes.push({ ref, data: { ...data, schoolId } });
    }

    let settlements = [];
    try {
      settlements = await fetchSettlementsForSubaccount(paymentSettings.subaccountCode);
    } catch (error) {
      console.warn(`  settlement lookup skipped for ${schoolId}: ${error.message}`);
    }

    for (const settlement of settlements) {
      const { entryId, data } = buildSettlementEntry(
        settlement,
        schoolId,
        paymentSettings.subaccountCode,
      );
      const ref = db.collection("schools").doc(schoolId).collection("payoutLedger").doc(entryId);
      const current = await ref.get();
      if (current.exists) {
        settlementExisting += 1;
        continue;
      }
      settlementWrites.push({ ref, data: { ...data, schoolId } });
    }

    totalCandidates += onlinePayments.length;
    totalExisting += existing;
    totalWrites += writes.length;
    totalSettlementCandidates += settlements.length;
    totalSettlementExisting += settlementExisting;
    totalSettlementWrites += settlementWrites.length;
    totalSkippedUnverified += skippedUnverified;

    console.log(
      `${schoolId}: ${onlinePayments.length} historical online payments, ${existing} already in ledger, ${writes.length} to backfill.`,
    );
    if (skippedUnverified) {
      console.log(`  skipped ${skippedUnverified} payments that did not verify against live Paystack.`);
    }
    console.log(
      `  settlements: ${settlements.length} Paystack settlements, ${settlementExisting} already in ledger, ${settlementWrites.length} to backfill.`,
    );

    if (WRITE && (writes.length || settlementWrites.length)) {
      const committed = await commitInChunks(db, [...writes, ...settlementWrites]);
      console.log(`  wrote ${committed} payout ledger entries.`);
    }
  }

  console.log("\nSummary");
  console.log(`  Mode: ${WRITE ? "WRITE" : "DRY RUN"}`);
  console.log(`  Candidate payments: ${totalCandidates}`);
  console.log(`  Already existed: ${totalExisting}`);
  console.log(`  Payment entries to write: ${totalWrites}`);
  console.log(`  Payments skipped as not live-verified: ${totalSkippedUnverified}`);
  console.log(`  Candidate settlements: ${totalSettlementCandidates}`);
  console.log(`  Settlement entries already existed: ${totalSettlementExisting}`);
  console.log(`  Settlement entries to write: ${totalSettlementWrites}`);
  if (SKIP_SETTLEMENTS) {
    console.log("  Settlement lookup: skipped by --skip-settlements");
  } else if (!isLivePaystackSecret()) {
    console.log("  Settlement lookup: skipped because PAYSTACK_SECRET_KEY is not a live key");
  }
  if (CLEAR_EXISTING) {
    console.log(`  Existing ledger entries ${WRITE ? "cleared" : "to clear"}: ${totalCleared}`);
  }
  if (NO_VERIFY_LIVE_PAYMENTS) {
    console.log("  Live payment verification: disabled by --no-verify-live-payments");
  } else if (!isLivePaystackSecret()) {
    console.log("  Live payment verification: skipped because PAYSTACK_SECRET_KEY is not a live key");
  }
  if (!WRITE) {
    console.log("\nRun with --write to commit the backfill.");
  }
};

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
