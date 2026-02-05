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

const formatAmount = (amount?: number, currency = "GHS") => {
  if (!amount && amount !== 0) return "-";
  const normalized = amount >= 100 ? amount / 100 : amount;
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

const Payments: React.FC = () => {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const loadPayments = async () => {
    setLoading(true);
    try {
      const paymentsCol = collection(firestore, "payments");
      const paymentsQuery = query(paymentsCol, orderBy("createdAt", "desc"));
      const snap = await getDocs(paymentsQuery);
      const rows = snap.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as any),
      })) as PaymentRecord[];
      setPayments(rows);
    } catch (error) {
      console.error("Failed to load payments", error);
      showToast("Failed to load payment data.", { type: "error" });
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
          {!filteredPayments.length && !loading && (
            <div className="text-center text-sm text-slate-400 py-10">
              No payments found yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Payments;
