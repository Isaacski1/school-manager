import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Info, RefreshCw, Wallet } from "lucide-react";
import { getPayoutStatus } from "../../services/backendApi";
import type { PayoutStatusResponse } from "../../services/backendApi";

type PayoutStatusProps = {
  schoolId: string;
  minimumThreshold?: number;
};

const currency = (value: number) => `GHS ${value.toFixed(2)}`;

const PayoutStatus: React.FC<PayoutStatusProps> = ({
  schoolId,
  minimumThreshold = 50,
}) => {
  const [status, setStatus] = useState<PayoutStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError("");

    if (!schoolId) {
      setStatus(null);
      setLoading(false);
      return () => {
        mounted = false;
      };
    }

    void getPayoutStatus(schoolId)
      .then((data) => {
        if (mounted) setStatus(data);
      })
      .catch((err) => {
        if (!mounted) return;
        setStatus(null);
        setError(err?.message || "Payout status is currently unavailable.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [schoolId]);

  const balance = status?.availableBalance ?? 0;
  const threshold = status?.minimumSettlementAmount ?? minimumThreshold;
  const ready = status?.status === "ready" || balance >= threshold;
  const unconfigured = status?.status === "unconfigured";
  const remaining = Math.max(0, threshold - balance);
  const progress = useMemo(() => {
    if (!threshold) return 0;
    return Math.min(100, Math.max(0, (balance / threshold) * 100));
  }, [balance, threshold]);

  const renderStatusBadge = () => {
    if (loading) return null;
    if (error) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 sm:text-sm">
          <AlertCircle size={15} /> Unavailable
        </span>
      );
    }
    if (ready) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 sm:text-sm">
          <CheckCircle2 size={15} /> Ready
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 sm:text-sm">
        <Info size={15} /> Pending
      </span>
    );
  };

  return (
    <div className="h-full rounded-[28px] border border-white/60 bg-gradient-to-br from-white via-orange-50/40 to-slate-50 p-4 shadow-[0_24px_70px_-50px_rgba(15,23,42,0.55)] backdrop-blur sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-600 text-white shadow-sm">
            <Wallet size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
              Payout Status
            </p>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="text-2xl font-semibold leading-none text-slate-900 sm:text-3xl">
                {loading ? "..." : currency(balance)}
              </p>
              <p className="text-xs font-medium text-slate-500">
                estimated available
              </p>
            </div>
          </div>
        </div>
        <div className="shrink-0">{renderStatusBadge()}</div>
      </div>

      <div className="mt-5">
        {loading ? (
          <div className="space-y-3">
            <div className="h-20 w-full animate-pulse rounded-2xl bg-slate-100" />
            <div className="h-3 w-full animate-pulse rounded-full bg-slate-100" />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-rose-100 bg-rose-50/70 p-3">
            <p className="text-sm font-semibold text-rose-800">
              Payout Status: Unavailable
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-600">{error}</p>
          </div>
        ) : unconfigured ? (
          <div className="rounded-2xl border border-slate-200 bg-white/70 p-3">
            <p className="text-sm font-semibold text-slate-800">
              Online payouts not active
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-600">
              Activate Online Payment before parent Paystack collections can
              settle into the school's payout account.
            </p>
          </div>
        ) : ready ? (
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3">
            <p className="text-sm font-semibold text-emerald-800">
              Payout Status: Ready
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-600">
              The available payout balance has reached Paystack Ghana's{" "}
              {currency(threshold)} minimum. It should be settled to the
              configured account on the next working day, subject to Paystack
              processing.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-3">
            <p className="text-sm font-semibold text-amber-800">
              Payout Status: Pending
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-600">
              Paystack Ghana settles automatically after the school's available
              payout balance reaches {currency(threshold)}. New online fee
              payments keep adding to this balance until it qualifies.
            </p>

            <div className="mt-3">
              <div
                className="h-3 w-full overflow-hidden rounded-full bg-white/80"
                aria-label={`Payout progress ${progress.toFixed(0)} percent`}
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500"
                  style={{ width: `${progress.toFixed(2)}%` }}
                />
              </div>
              <div className="mt-2 flex flex-col gap-1 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
                <span>{currency(balance)} available</span>
                <span className="font-semibold text-slate-800">
                  {currency(remaining)} more until payout
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {!loading && !error && status?.lastRefreshed && (
        <div className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400">
          <RefreshCw size={12} />
          <span>Updated {new Date(status.lastRefreshed).toLocaleString()}</span>
        </div>
      )}
    </div>
  );
};

export default PayoutStatus;
