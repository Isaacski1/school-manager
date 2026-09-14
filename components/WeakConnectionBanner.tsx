import { useCallback } from "react";
import { useNetworkStatus } from "../hooks/useNetworkStatus";

export const WeakConnectionBanner = () => {
  const { isOnline, isSlowConnection, connection } = useNetworkStatus();

  const handleRetry = useCallback(() => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  }, []);

  if (!isOnline || !isSlowConnection) return null;

  const effectiveType = connection.effectiveType;
  const connectionLabel =
    effectiveType === "slow-2g"
      ? "Very slow connection (slow-2g)"
      : effectiveType === "2g"
        ? "Slow connection (2g)"
        : connection.saveData
          ? "Low data mode enabled"
          : "Unstable connection detected";

  return (
    <div className="fixed bottom-4 left-0 right-0 z-50 flex items-center justify-center px-4 pointer-events-none">
      <div className="relative w-full max-w-2xl pointer-events-auto">
        <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3 shadow-lg backdrop-blur-sm">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-4 w-4"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-amber-800">
              {connectionLabel}
            </p>
            <p className="text-xs text-amber-600">
              Some features may be slow or temporarily unavailable
            </p>
          </div>

          <button
            onClick={handleRetry}
            className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-4 w-4"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348c4.499-.276 7.212 2.453 7.212 6.5 0 4.5-3.5 7.5-7.5 7.5S8.235 20.25 8.235 15.75c0-1.162.346-2.24.936-3.166.352-.468.846-.85 1.422-1.116M4.5 15.75a9 9 0 1 1 18 0 9 9 0 0 1-18 0z"
              />
            </svg>
            Retry
          </button>
        </div>
      </div>
    </div>
  );
};
