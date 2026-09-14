import { useEffect, useState } from "react";
import { WifiOff, Wifi } from "lucide-react";
import { useNetworkStatus } from "../hooks/useNetworkStatus";

type NetworkIssue = "offline" | "slow" | null;

export const NetworkStatusNotification = () => {
  const { isOnline, connection } = useNetworkStatus();
  const [issue, setIssue] = useState<NetworkIssue>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isOnline) {
      setIssue("offline");
      setVisible(true);
      return;
    }

    const effectiveType = connection.effectiveType;
    const isKnownSlow =
      effectiveType === "slow-2g" ||
      effectiveType === "2g" ||
      (typeof connection.rttMs === "number" &&
        connection.rttMs > 2000 &&
        connection.downlinkMbps > 0 &&
        connection.downlinkMbps < 0.5);

    if (isKnownSlow) {
      setIssue("slow");
      setVisible(true);
    } else {
      setIssue(null);
      setVisible(false);
    }
  }, [isOnline, connection]);

  if (!visible || !issue) return null;

  const isOffline = issue === "offline";
  const label = isOffline ? "Internet connection lost" : "Weak internet connection";
  const description = isOffline
    ? "You're currently offline. Please check your connection."
    : "Your connection seems slow. Some features may not work properly.";

  return (
    <div className="fixed left-1/2 top-4 z-[70] w-full max-w-[calc(100vw-2rem)] sm:max-w-xl -translate-x-1/2 px-4">
      <div
        className={`flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-lg ${
          isOffline
            ? "border-rose-200 bg-rose-50 text-rose-700"
            : "border-amber-200 bg-amber-50 text-amber-700"
        }`}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/70">
          {isOffline ? <WifiOff className="h-4 w-4" /> : <Wifi className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{label}</p>
          <p className="text-xs opacity-80">{description}</p>
        </div>
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="shrink-0 rounded-full p-1 opacity-70 hover:opacity-100"
          aria-label="Dismiss notification"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};
