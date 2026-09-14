import { useMemo } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useNetworkStatus } from "../hooks/useNetworkStatus";

export const OfflineModal = () => {
  const { isOnline, connection } = useNetworkStatus();
  const effectiveType = connection.effectiveType;
  const isKnownSlowConnection = effectiveType === "slow-2g" || effectiveType === "2g";

  if (isOnline && !isKnownSlowConnection) return null;

  const handleRetry = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  const title = !isOnline ? "You're Offline" : "Weak Connection Detected";
  const description = !isOnline
    ? "It looks like you're not connected to the internet. Please check your connection and try again."
    : "Your connection appears to be slow or unstable. Some features may not work reliably until your connection improves.";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      <div className="relative w-full max-w-md mx-4 rounded-2xl bg-white shadow-2xl border border-slate-200 p-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600">
          <AlertTriangle className="h-8 w-8" />
        </div>

        <h2 className="mt-6 text-2xl font-bold text-slate-900">
          {title}
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {description}
        </p>

        {!isOnline && (
          <p className="mt-2 text-xs text-slate-500">
            While offline, previously loaded pages may still be available, but new data cannot be synced.
          </p>
        )}

        <div className="mt-8 space-y-3">
          <button
            onClick={handleRetry}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#0B4A82] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#083a66]"
          >
            <RefreshCw size={16} />
            Try Again
          </button>
          <button
            onClick={handleRetry}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            Refresh Page
          </button>
        </div>

        {import.meta.env.DEV && (
          <details className="mt-4 text-left">
            <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700">
              Error Details (Development)
            </summary>
            <pre className="mt-2 rounded-lg bg-slate-100 p-3 text-xs text-slate-800">
              {`isOnline: ${String(isOnline)}`}
              {`\neffectiveType: ${effectiveType}`}
              {`\ndownlink: ${connection.downlinkMbps} Mbps`}
              {`\nrtt: ${connection.rttMs ?? "unknown"} ms`}
              {`\nsaveData: ${String(connection.saveData)}`}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
};
