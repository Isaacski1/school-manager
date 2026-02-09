import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import Layout from "../../components/Layout";
import { useSchool } from "../../context/SchoolContext";
import { firestore } from "../../services/firebase";
import {
  initiateSchoolBilling,
  verifySchoolPayment,
} from "../../services/backendApi";
import { showToast } from "../../services/toast";
import { PAYSTACK_PUBLIC_KEY } from "../../src/config";
import { CreditCard, ShieldCheck, Calendar, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

const Billing: React.FC = () => {
  const { school } = useSchool();
  const navigate = useNavigate();
  const [processing, setProcessing] = useState(false);
  const [amount, setAmount] = useState("0");
  const [paymentHistory, setPaymentHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const formatAmount = (value?: number, currency = "GHS") => {
    if (!value && value !== 0) return "-";
    const normalized = value >= 100 ? value / 100 : value;
    return new Intl.NumberFormat("en-GH", {
      style: "currency",
      currency,
    }).format(normalized);
  };

  const formatDate = (value?: Timestamp | number | string) => {
    if (!value) return "-";
    if (value instanceof Timestamp) {
      return value.toDate().toLocaleString();
    }
    if (typeof value === "number") {
      return new Date(value).toLocaleString();
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleString();
  };

  const getStatusMeta = (status?: string) => {
    const normalized = (status || "pending").toLowerCase();

    if (["success", "paid", "active"].includes(normalized)) {
      return {
        label: "Paid",
        className: "bg-emerald-50 text-emerald-700",
      };
    }

    if (["failed", "failure", "past_due"].includes(normalized)) {
      return {
        label: "Failed",
        className: "bg-rose-50 text-rose-700",
      };
    }

    if (["abandoned", "cancelled", "canceled"].includes(normalized)) {
      return {
        label: "Cancelled",
        className: "bg-slate-100 text-slate-600",
      };
    }

    return {
      label: "Pending",
      className: "bg-amber-50 text-amber-700",
    };
  };

  const billingStatus = useMemo(() => {
    const status = (school as any)?.billing?.status || "inactive";
    const plan = (school as any)?.plan || "monthly";
    return { status, plan };
  }, [school]);

  const isFreePlan = billingStatus.plan === "free";

  const displayStatus = useMemo(() => {
    const latestPayment = paymentHistory[0];
    return getStatusMeta(latestPayment?.status || billingStatus.status);
  }, [billingStatus.status, paymentHistory]);

  const expectedAmount = useMemo(() => {
    const plan = billingStatus.plan || "monthly";
    const base = 300;
    const multiplier = plan === "termly" ? 4 : plan === "yearly" ? 12 : 1;
    return base * multiplier;
  }, [billingStatus.plan]);

  useEffect(() => {
    if (isFreePlan) return;
    setAmount(String(expectedAmount));
  }, [expectedAmount, isFreePlan]);

  const loadPaymentHistory = async () => {
    if (!school?.id) return;
    setLoadingHistory(true);
    try {
      const paymentsRef = collection(firestore, "payments");
      const paymentsQuery = query(
        paymentsRef,
        where("schoolId", "==", school.id),
      );
      const snap = await getDocs(paymentsQuery);
      const rows = snap.docs
        .map((doc) => ({
          id: doc.id,
          ...(doc.data() as any),
        }))
        .sort((a, b) => {
          const aTime = a.createdAt?.toMillis
            ? a.createdAt.toMillis()
            : new Date(a.createdAt || 0).getTime();
          const bTime = b.createdAt?.toMillis
            ? b.createdAt.toMillis()
            : new Date(b.createdAt || 0).getTime();
          return bTime - aTime;
        });
      setPaymentHistory(rows);
    } catch (error) {
      console.error("Failed to load payment history", error);
      showToast("Failed to load payment history.", { type: "error" });
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleVerifyPending = async () => {
    if (!paymentHistory.length) {
      showToast("No payments to verify.", { type: "info" });
      return;
    }

    const pendingPayments = paymentHistory.filter((payment) =>
      ["pending", "abandoned", "failed"].includes(
        String(payment.status || "pending").toLowerCase(),
      ),
    );

    if (!pendingPayments.length) {
      showToast("All payments are already verified.", { type: "success" });
      return;
    }

    try {
      setVerifying(true);
      let updated = 0;

      for (const payment of pendingPayments) {
        if (!payment.reference) continue;
        await verifySchoolPayment({ reference: payment.reference });
        updated += 1;
      }

      showToast(`Verification complete. ${updated} payment(s) updated.`, {
        type: "success",
      });
      await loadPaymentHistory();
    } catch (error: any) {
      console.error("Payment verification failed:", error);
      showToast(error?.message || "Payment verification failed.", {
        type: "error",
      });
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    if (isFreePlan) return;
    loadPaymentHistory();
  }, [school?.id, isFreePlan]);

  useEffect(() => {
    if (isFreePlan) return;
    const params = new URLSearchParams(window.location.search);
    const reference = params.get("reference");
    if (!reference) return;

    const verifyAndRedirect = async () => {
      try {
        setVerifying(true);
        const result = await verifySchoolPayment({ reference });
        if (String(result?.status || "").toLowerCase() === "success") {
          setShowSuccess(true);
          setTimeout(() => {
            navigate("/", { replace: true });
          }, 3500);
          return;
        }

        showToast(
          "Payment was not completed. Please try again or verify later.",
          {
            type: "info",
          },
        );
        await loadPaymentHistory();
      } catch (error: any) {
        console.error("Payment verification failed:", error);
        showToast(error?.message || "Payment verification failed.", {
          type: "error",
        });
      } finally {
        setVerifying(false);
      }
    };

    verifyAndRedirect();
  }, [isFreePlan, navigate]);

  const handlePay = async () => {
    if (isFreePlan) return;
    const numericAmount = Number(expectedAmount);
    if (!numericAmount || numericAmount <= 0) {
      showToast("Enter a valid amount.", { type: "error" });
      return;
    }

    try {
      setProcessing(true);
      const response = await initiateSchoolBilling({
        amount: numericAmount * 100,
        currency: "GHS",
      });
      window.location.href = response.authorizationUrl;
    } catch (error: any) {
      console.error("Billing error:", error);
      showToast(error?.message || "Payment initiation failed.", {
        type: "error",
      });
    } finally {
      setProcessing(false);
    }
  };

  if (isFreePlan) {
    return (
      <Layout title="Billing & Subscription">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <ShieldCheck size={18} />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-slate-900">
                  Free Plan Active
                </h1>
                <p className="text-sm text-slate-600 mt-1">
                  Billing is disabled for your school. Contact your super admin
                  if you need to change your subscription.
                </p>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Billing & Subscription">
      <div className="max-w-5xl mx-auto space-y-6">
        {showSuccess && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <ShieldCheck size={18} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Subscription renewed successfully
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  Great news! Your access has been restored. Redirecting to the
                  dashboard now.
                </p>
              </div>
            </div>
          </div>
        )}
        <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-indigo-50 via-white to-emerald-50 p-6 shadow-sm">
          <div className="absolute -top-16 -right-16 h-40 w-40 rounded-full bg-indigo-200/40 blur-3xl" />
          <div className="absolute -bottom-20 -left-16 h-48 w-48 rounded-full bg-emerald-200/40 blur-3xl" />
          <div className="relative">
            <h1 className="text-3xl font-bold text-slate-900">
              Billing & Subscription
            </h1>
            <p className="text-sm text-slate-600 mt-2">
              Pay monthly via Mobile Money and keep your school active.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <CreditCard size={18} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Pay Monthly (MoMo)
                </h2>
                <p className="text-sm text-slate-500">
                  MTN, Telecel, AirtelTigo supported via Paystack.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Amount (GHS)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={amount}
                  readOnly
                  className="w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-slate-700"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={handlePay}
                  disabled={processing}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 text-white px-5 py-2.5 font-semibold hover:bg-emerald-700 transition disabled:opacity-60"
                >
                  {processing ? "Redirecting..." : "Pay with MoMo"}
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
            {/* <p className="mt-3 text-xs text-slate-400">
              Paystack Public Key loaded: {PAYSTACK_PUBLIC_KEY ? "Yes" : "No"}
            </p> */}
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
                <ShieldCheck size={18} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  Subscription Status
                </h3>
                <p className="text-sm text-slate-500">School Plan</p>
              </div>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Plan</span>
                <span className="font-semibold text-slate-800">
                  {billingStatus.plan}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Status</span>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${displayStatus.className}`}
                >
                  {displayStatus.label}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Renewal</span>
                <span className="font-semibold text-slate-800">Monthly</span>
              </div>
              {/* <div className="flex items-center gap-2 text-xs text-slate-400">
                <Calendar size={14} />
                Webhook updates status after payment.
              </div> */}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Payment History
              </h2>
              <p className="text-sm text-slate-500">
                Track all payments made by your school admin account.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleVerifyPending}
                className="text-sm text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-lg hover:bg-emerald-50"
                disabled={loadingHistory || verifying}
              >
                {verifying ? "Verifying..." : "Verify Pending"}
              </button>
              <button
                onClick={loadPaymentHistory}
                className="text-sm text-slate-600 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50"
                disabled={loadingHistory}
              >
                {loadingHistory ? "Loading..." : "Refresh"}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-100">
                  <th className="py-3 pr-4">Amount</th>
                  <th className="py-3 pr-4">Currency</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 pr-4">Reference</th>
                  <th className="py-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {paymentHistory.map((payment) => {
                  const statusMeta = getStatusMeta(payment.status);
                  return (
                    <tr key={payment.id} className="border-b border-slate-100">
                      <td className="py-3 pr-4 text-slate-700">
                        {formatAmount(payment.amount, payment.currency)}
                      </td>
                      <td className="py-3 pr-4 text-slate-600">
                        {payment.currency || "GHS"}
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${statusMeta.className}`}
                        >
                          {statusMeta.label}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-slate-500">
                        {payment.reference || "-"}
                      </td>
                      <td className="py-3 text-slate-500">
                        {formatDate(payment.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!paymentHistory.length && !loadingHistory && (
              <div className="text-center text-sm text-slate-400 py-10">
                No payment history yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Billing;
