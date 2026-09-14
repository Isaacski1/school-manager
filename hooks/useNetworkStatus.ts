import { useEffect, useMemo, useState } from "react";

type ConnectionType = "4g" | "3g" | "2g" | "slow-2g" | "unknown";

interface ConnectionInfo {
  effectiveType: ConnectionType;
  downlinkMbps: number;
  rttMs: number | null;
  saveData: boolean;
}

export interface NetworkStatus {
  isOnline: boolean;
  connection: ConnectionInfo;
  isSlowConnection: boolean;
}

const DEFAULT_CONNECTION: ConnectionInfo = {
  effectiveType: "unknown",
  downlinkMbps: 0,
  rttMs: null,
  saveData: false,
};

const readNetworkInformation = (): ConnectionInfo => {
  if (typeof navigator === "undefined" || !("connection" in navigator)) {
    return DEFAULT_CONNECTION;
  }

  const connection = (navigator as any).connection;
  if (!connection) return DEFAULT_CONNECTION;

  const effectiveType = (connection.effectiveType || "unknown") as ConnectionType;
  const downlinkMbps = typeof connection.downlink === "number" ? connection.downlink : 0;
  const rttMs = typeof connection.rtt === "number" ? connection.rtt : null;
  const saveData = Boolean(connection.saveData);

  return {
    effectiveType,
    downlinkMbps,
    rttMs,
    saveData,
  };
};

export const useNetworkStatus = (): NetworkStatus => {
  const [isOnline, setIsOnline] = useState(() => {
    if (typeof navigator !== "undefined") return navigator.onLine;
    return true;
  });
  const [connection, setConnection] = useState<ConnectionInfo>(readNetworkInformation);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    const handleConnectionChange = () => setConnection(readNetworkInformation());

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    if ("connection" in navigator && (navigator as any).connection) {
      (navigator as any).connection.addEventListener("change", handleConnectionChange);
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);

      if ("connection" in navigator && (navigator as any).connection) {
        (navigator as any).connection.removeEventListener("change", handleConnectionChange);
      }
    };
  }, []);

  const isSlowConnection = useMemo(() => {
    if (!isOnline) return false;

    const effectiveType = connection.effectiveType;
    if (effectiveType === "slow-2g" || effectiveType === "2g") return true;

    if (connection.saveData) return true;

    if (typeof connection.rttMs === "number" && connection.rttMs > 2000) return true;
    if (connection.downlinkMbps > 0 && connection.downlinkMbps < 0.5) return true;

    return false;
  }, [connection, isOnline]);

  return {
    isOnline,
    connection,
    isSlowConnection,
  };
};
