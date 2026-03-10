import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore";
import { firestore } from "../../services/firebase";
import { showToast } from "../../services/toast";
import { Search, RefreshCw } from "lucide-react";

type PaymentRecord = {
  id: string;
  schoolId?: string;
  schoolName?: string;
  adminEmail?: string;
  amount?: number;
  currency?: string;
  status?: string;
  reference?: string;
  createdAt?: Timestamp | number | string;
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

const normalizeAmount = (amount?: number) => {
  if (!amount && amount !== 0) return 0;
  return amount >= 100 ? amount / 100 : amount;
};

const formatAmount = (
  amount?: number,
  currency = "GHS",
  options?: { normalized?: boolean },
) => {
  if (!amount && amount !== 0) return "-";
  const normalized = options?.normalized ? amount : normalizeAmount(amount);
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency,
  }).format(normalized);
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

const isSuccessfulPayment = (status?: string) => {
  const normalized = (status || "").toLowerCase();
  return ["success", "paid", "active"].includes(normalized);
};

const Payments: React.FC = () => {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const pieColors = [
    {
      from: "#60A5FA",
      to: "#2563EB",
      solid: "#2563EB",
      stroke: "#1D4ED8",
    },
    {
      from: "#FDBA74",
      to: "#F97316",
      solid: "#F97316",
      stroke: "#EA580C",
    },
    {
      from: "#6EE7B7",
      to: "#10B981",
      solid: "#10B981",
      stroke: "#059669",
    },
    {
      from: "#C4B5FD",
      to: "#8B5CF6",
      solid: "#8B5CF6",
      stroke: "#7C3AED",
    },
    {
      from: "#FDA4AF",
      to: "#F43F5E",
      solid: "#F43F5E",
      stroke: "#E11D48",
    },
  ];

  const loadPayments = async () => {
    setLoading(true);
    try {
      console.log("[PAYMENTS] Starting to load payments...");
      const paymentsRef = collection(firestore, "payments");
      const paymentsQuery = query(paymentsRef, orderBy("createdAt", "desc"));

      console.log("[PAYMENTS] Executing query...");
      const snap = await getDocs(paymentsQuery);
      console.log("[PAYMENTS] Query result:", {
        docsCount: snap.docs.length,
        empty: snap.empty,
      });

      const rows = snap.docs
        .map((doc) => {
          const data = doc.data() as any;
          console.log("[PAYMENTS] Processing doc:", doc.id, data);
          return {
            id: doc.id,
            schoolId: data.schoolId || "",
            schoolName: data.schoolName || "Unknown School",
            adminEmail: data.adminEmail || "",
            amount: data.amount ?? data.amountPaid,
            currency: data.currency || "GHS",
            status: data.status || "pending",
            reference: data.reference || "",
            createdAt: data.createdAt ?? data.paidAt ?? data.verifiedAt,
          } as PaymentRecord;
        })
        .sort((a, b) => {
          const aTime =
            a.createdAt instanceof Timestamp
              ? a.createdAt.toMillis()
              : typeof a.createdAt === "number"
                ? a.createdAt
                : new Date(a.createdAt || 0).getTime();
          const bTime =
            b.createdAt instanceof Timestamp
              ? b.createdAt.toMillis()
              : typeof b.createdAt === "number"
                ? b.createdAt
                : new Date(b.createdAt || 0).getTime();
          return bTime - aTime;
        });
      console.log("[PAYMENTS] Processed rows:", rows);
      setPayments(rows);
      showToast(`Loaded ${rows.length} payment(s).`, { type: "success" });
    } catch (error: any) {
      console.error("[PAYMENTS] Failed to load payments", error);
      console.error("[PAYMENTS] Error details:", {
        message: error.message,
        code: error.code,
        type: error.type,
      });
      showToast(`Failed to load payment data: ${error.message}`, {
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayments();
  }, []);

  const filteredPayments = useMemo(() => {
    const queryText = search.trim().toLowerCase();
    if (!queryText) return payments;
    return payments.filter((payment) => {
      const values = [
        payment.schoolName,
        payment.schoolId,
        payment.adminEmail,
        payment.status,
        payment.reference,
        payment.currency,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return values.includes(queryText);
    });
  }, [payments, search]);

  const successfulPayments = useMemo(
    () => payments.filter((payment) => isSuccessfulPayment(payment.status)),
    [payments],
  );

  const successfulBreakdown = useMemo(() => {
    const totals = new Map<string, { name: string; value: number }>();
    successfulPayments.forEach((payment) => {
      const key = payment.schoolId || payment.schoolName || payment.id;
      const resolvedName =
        payment.schoolName?.trim() || payment.schoolId || "Unknown School";
      const current = totals.get(key) || { name: resolvedName, value: 0 };

      totals.set(key, {
        name: current.name || resolvedName,
        value: current.value + normalizeAmount(payment.amount),
      });
    });
    return Array.from(totals.values())
      .sort((a, b) => b.value - a.value);
  }, [successfulPayments]);

  const successfulStats = useMemo(() => {
    const total = successfulBreakdown.reduce(
      (sum, entry) => sum + entry.value,
      0,
    );
    const currency = successfulPayments.find(
      (payment) => payment.currency,
    )?.currency;
    return { total, currency: currency || "GHS" };
  }, [successfulBreakdown, successfulPayments]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Payments</h1>
            <p className="text-sm text-slate-500">
              View all school admin payments in one place.
            </p>
          </div>
          <button
            onClick={loadPayments}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Successful payments
            </div>
            <div className="mt-1 text-lg font-semibold text-slate-900">
              Total paid by school
            </div>
          </div>
          <div className="rounded-full bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-500">
            Total{" "}
            {formatAmount(successfulStats.total, successfulStats.currency, {
              normalized: true,
            })}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex h-[260px] items-center justify-center rounded-2xl bg-gradient-to-br from-slate-50 via-white to-slate-100">
            {successfulBreakdown.length === 0 ? (
              <div className="text-sm text-slate-400">
                No successful payments yet.
              </div>
            ) : (
              <div className="relative h-[220px] w-[220px]">
                <div className="absolute inset-0 rounded-full bg-white shadow-sm" />
                <div className="absolute inset-2 rounded-full bg-gradient-to-br from-slate-100 via-white to-slate-50" />
                <div className="absolute inset-0">
                  <svg viewBox="0 0 100 100" className="h-full w-full">
                    <defs>
                      {pieColors.map((color, idx) => (
                        <linearGradient
                          key={`success-gradient-${idx}`}
                          id={`success-gradient-${idx}`}
                          x1="0%"
                          y1="0%"
                          x2="100%"
                          y2="100%"
                        >
                          <stop offset="0%" stopColor={color.from} />
                          <stop offset="100%" stopColor={color.to} />
                        </linearGradient>
                      ))}
                    </defs>
                    {(() => {
                      const total = successfulStats.total || 1;
                      let start = -90;
                      return successfulBreakdown.map((entry, idx) => {
                        const palette = pieColors[idx % pieColors.length];
                        const angle = (entry.value / total) * 360;
                        const end = start + angle;
                        const large = angle > 180 ? 1 : 0;
                        const startRad = (Math.PI / 180) * start;
                        const endRad = (Math.PI / 180) * end;
                        const x1 = 50 + 40 * Math.cos(startRad);
                        const y1 = 50 + 40 * Math.sin(startRad);
                        const x2 = 50 + 40 * Math.cos(endRad);
                        const y2 = 50 + 40 * Math.sin(endRad);
                        const d = `M 50 50 L ${x1} ${y1} A 40 40 0 ${large} 1 ${x2} ${y2} Z`;
                        start = end;
                        return (
                          <path
                            key={`success-slice-${entry.name}`}
                            d={d}
                            fill={`url(#success-gradient-${idx % pieColors.length})`}
                            stroke={palette.stroke}
                            strokeWidth="1.2"
                            strokeLinejoin="round"
                          />
                        );
                      });
                    })()}
                  </svg>
                </div>
                <div className="absolute inset-8 flex flex-col items-center justify-center rounded-full bg-white text-center shadow-sm">
                  <div className="text-[10px] font-semibold uppercase text-slate-400">
                    Total paid
                  </div>
                  <div className="text-sm font-semibold text-slate-900">
                    {formatAmount(
                      successfulStats.total,
                      successfulStats.currency,
                      { normalized: true },
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3">
            {successfulBreakdown.length === 0 ? (
              <div className="text-sm text-slate-400">
                No successful payments to summarize.
              </div>
            ) : (
              successfulBreakdown.map((entry, idx) => {
                const pct =
                  successfulStats.total > 0
                    ? (entry.value / successfulStats.total) * 100
                    : 0;
                return (
                  <div
                    key={`success-legend-${entry.name}`}
                    className="rounded-xl border p-3"
                    style={{
                      borderColor: `${pieColors[idx % pieColors.length].stroke}22`,
                      background: `linear-gradient(135deg, ${pieColors[idx % pieColors.length].from}16 0%, rgba(255,255,255,0.96) 85%)`,
                    }}
                  >
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{
                            background: `linear-gradient(135deg, ${pieColors[idx % pieColors.length].from} 0%, ${pieColors[idx % pieColors.length].to} 100%)`,
                          }}
                        />
                        {entry.name}
                      </span>
                      <span className="text-slate-500">{pct.toFixed(1)}%</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-sm font-semibold text-slate-900">
                      <span>
                        {formatAmount(entry.value, successfulStats.currency, {
                          normalized: true,
                        })}
                      </span>
                      <span className="text-xs text-slate-400">
                        {entry.value.toFixed(2)}
                      </span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-white">
                      <div
                        className="h-2 rounded-full"
                        style={{
                          width: `${Math.min(100, pct)}%`,
                          background: `linear-gradient(90deg, ${pieColors[idx % pieColors.length].from} 0%, ${pieColors[idx % pieColors.length].to} 100%)`,
                        }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by school, email, status, reference"
              className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B4A82]/20"
            />
          </div>
          <span className="text-xs text-slate-400">
            {filteredPayments.length} records
          </span>
        </div>

        {loading && (
          <div className="text-center py-10">
            <div className="text-sm text-slate-600 mb-2">
              Loading payments...
            </div>
            <div className="w-8 h-8 border-4 border-slate-200 border-t-[#0B4A82] rounded-full animate-spin mx-auto" />
          </div>
        )}

        {!loading && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-100">
                  <th className="py-3 pr-4">School</th>
                  <th className="py-3 pr-4">Admin Email</th>
                  <th className="py-3 pr-4">Amount</th>
                  <th className="py-3 pr-4">Currency</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 pr-4">Reference</th>
                  <th className="py-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {filteredPayments.map((payment) => (
                  <tr key={payment.id} className="border-b border-slate-100">
                    <td className="py-3 pr-4">
                      <div className="font-medium text-slate-800">
                        {payment.schoolName || "-"}
                      </div>
                      <div className="text-xs text-slate-400">
                        {payment.schoolId || ""}
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-slate-600">
                      {payment.adminEmail || "-"}
                    </td>
                    <td className="py-3 pr-4 text-slate-700">
                      {formatAmount(payment.amount, payment.currency)}
                    </td>
                    <td className="py-3 pr-4 text-slate-600">
                      {payment.currency || "GHS"}
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${getStatusMeta(payment.status).className}`}
                      >
                        {getStatusMeta(payment.status).label}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-slate-500">
                      {payment.reference || "-"}
                    </td>
                    <td className="py-3 text-slate-500">
                      {formatDate(payment.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filteredPayments.length && (
              <div className="text-center text-sm text-slate-400 py-10">
                No payments found yet.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Payments;
