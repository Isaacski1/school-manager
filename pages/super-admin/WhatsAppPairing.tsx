import React, { useCallback, useEffect, useRef, useState } from "react";
import Layout from "../../components/Layout";
import { showToast } from "../../services/toast";
import { API_BASE_URL } from "../../src/config";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Power,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Wifi,
  WifiOff,
} from "lucide-react";

const API_BASE = API_BASE_URL;
const CENTRAL_WHATSAPP_NUMBER = "+233201008784";

type WaStatus = "disconnected" | "connecting" | "qr_ready" | "ready" | "error" | "unavailable";

const WhatsAppIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
  </svg>
);

const statusMeta: Record<WaStatus, { label: string; className: string; icon: React.ReactNode }> = {
  disconnected: {
    label: "Disconnected",
    className: "bg-slate-100 text-slate-700",
    icon: <WifiOff size={16} />,
  },
  connecting: {
    label: "Connecting",
    className: "bg-amber-100 text-amber-800",
    icon: <Loader2 size={16} className="animate-spin" />,
  },
  qr_ready: {
    label: "Scan QR",
    className: "bg-blue-100 text-blue-800",
    icon: <Smartphone size={16} />,
  },
  ready: {
    label: "Ready",
    className: "bg-emerald-100 text-emerald-800",
    icon: <Wifi size={16} />,
  },
  error: {
    label: "Error",
    className: "bg-red-100 text-red-800",
    icon: <AlertTriangle size={16} />,
  },
  unavailable: {
    label: "Unavailable",
    className: "bg-red-100 text-red-800",
    icon: <AlertTriangle size={16} />,
  },
};

const WhatsAppPairing: React.FC = () => {
  const [status, setStatus] = useState<WaStatus>("disconnected");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [available, setAvailable] = useState(true);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [pairingPhone, setPairingPhone] = useState("0201008784");
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const getToken = useCallback(async () => {
    const { getAuth } = await import("firebase/auth");
    return getAuth().currentUser?.getIdToken() ?? "";
  }, []);

  const apiFetch = useCallback(async (path: string, opts: RequestInit = {}) => {
    const token = await getToken();
    return fetch(`${API_BASE}${path}`, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(opts.headers || {}),
      },
    });
  }, [getToken]);

  const loadStatus = useCallback(async (manual = false) => {
    if (manual) setLoadingAction("refresh");
    try {
      const res = await apiFetch("/api/whatsapp/status");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
      setStatus((data.status || "disconnected") as WaStatus);
      setQrCode(data.qr || null);
      setLastError(data.lastError || null);
      setAvailable(data.available !== false);
      setStatusError(null);
    } catch (error: any) {
      setStatusError(error?.message || "Could not reach WhatsApp service.");
    } finally {
      if (manual) setLoadingAction(null);
    }
  }, [apiFetch]);

  useEffect(() => {
    loadStatus();
    // Polling delays: Fast when connecting (1s), slower for QR display (120s/2min), normal otherwise (3s)
    let pollDelay = 3000;
    if (status === "connecting" || loadingAction === "connect") {
      pollDelay = 1000;
    } else if (status === "qr_ready") {
      pollDelay = 120000; // 2 minutes for QR code display
    }
    intervalRef.current = setInterval(() => loadStatus(false), pollDelay);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [loadStatus, loadingAction, status]);

  const runAction = async (action: string, path: string, successMessage: string, opts: RequestInit = {}) => {
    setLoadingAction(action);
    try {
      const res = await apiFetch(path, { method: "POST", ...opts });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
      setStatusError(null);
      showToast(successMessage, { type: "success" });
      await loadStatus();
      return data;
    } catch (error: any) {
      const message = error?.message || "WhatsApp action failed.";
      setStatusError(message);
      showToast(message, { type: "error" });
      return null;
    } finally {
      setLoadingAction(null);
    }
  };

  const handleConnect = () => {
    setStatus("connecting");
    setQrCode(null);
    setLastError(null);
    setStatusError(null);
    runAction("connect", "/api/whatsapp/init", "WhatsApp service is starting. Wait for the QR code.");
  };

  const handleDisconnect = () =>
    runAction("disconnect", "/api/whatsapp/disconnect", "WhatsApp session disconnected.");

  const handleClearSession = () => {
    if (!window.confirm("Clear the saved WhatsApp session and force a fresh QR scan?")) return;
    setPairingCode(null);
    runAction("clear", "/api/whatsapp/clear-session", "WhatsApp session cleared.");
  };

  const handleRequestPairingCode = async () => {
    if (!pairingPhone.trim()) {
      showToast("Enter the WhatsApp phone number first.", { type: "error" });
      return;
    }
    const data = await runAction(
      "pairing-code",
      "/api/whatsapp/pairing-code",
      "Pairing code generated.",
      { body: JSON.stringify({ phone: pairingPhone.trim() }) },
    );
    if (data?.code) setPairingCode(data.code);
  };

  const meta = statusMeta[status] || statusMeta.disconnected;
  const isBusy = Boolean(loadingAction);

  return (
    <Layout title="WhatsApp Pairing">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <WhatsAppIcon size={26} />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Central WhatsApp Sender</h1>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Pair the WhatsApp Business account for {CENTRAL_WHATSAPP_NUMBER}. This account is the sender for parent invoice and payment notifications.
                </p>
              </div>
            </div>
            <span className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold ${meta.className}`}>
              {meta.icon}
              {meta.label}
            </span>
          </div>

          {!available && (
            <div className="mt-5 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
              WhatsApp dependencies are not available on the server. Check `whatsapp-web.js` and `qrcode` installation.
            </div>
          )}

          {statusError && (
            <div className="mt-5 flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              {statusError}
            </div>
          )}

          {lastError && (
            <div className="mt-5 rounded-xl border border-red-100 bg-red-50 p-4">
              <p className="text-sm font-bold text-red-800">Last WhatsApp error</p>
              <p className="mt-1 break-words font-mono text-xs text-red-700">{lastError}</p>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleConnect}
              disabled={isBusy || status === "ready" || status === "connecting" || status === "qr_ready"}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingAction === "connect" ? <Loader2 size={16} className="animate-spin" /> : <Power size={16} />}
              Start Pairing
            </button>
            <button
              type="button"
              onClick={() => loadStatus(true)}
              disabled={isBusy}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              {loadingAction === "refresh" ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              Refresh
            </button>
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={isBusy || status === "disconnected"}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              <WifiOff size={16} />
              Disconnect
            </button>
            <button
              type="button"
              onClick={handleClearSession}
              disabled={isBusy}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-bold text-red-700 transition hover:bg-red-100 disabled:opacity-60"
            >
              {loadingAction === "clear" ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
              Clear Session
            </button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <Smartphone size={18} className="text-emerald-600" />
              <h2 className="text-lg font-bold text-slate-900">Scan QR Code</h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              On the phone using {CENTRAL_WHATSAPP_NUMBER}, open WhatsApp Business, go to Linked Devices, choose Link a Device, then scan this QR.
            </p>

            <div className="mt-6 flex min-h-72 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6">
              {status === "ready" ? (
                <div className="text-center">
                  <CheckCircle2 size={52} className="mx-auto text-emerald-500" />
                  <p className="mt-3 text-sm font-bold text-emerald-700">WhatsApp is connected and ready.</p>
                </div>
              ) : qrCode ? (
                <img src={qrCode} alt="WhatsApp QR Code" className="h-64 w-64 rounded-2xl border-8 border-white bg-white shadow-md" />
              ) : status === "connecting" || status === "qr_ready" ? (
                <div className="text-center">
                  <Loader2 size={36} className="mx-auto animate-spin text-emerald-600" />
                  <p className="mt-3 text-sm font-semibold text-slate-700">Waiting for QR code...</p>
                  <p className="mt-1 text-xs text-slate-500">First startup can take 30 to 60 seconds. After the server is warm, it is usually faster.</p>
                </div>
              ) : (
                <div className="text-center">
                  <WifiOff size={42} className="mx-auto text-slate-400" />
                  <p className="mt-3 text-sm font-semibold text-slate-700">Start pairing to generate a QR code.</p>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} className="text-emerald-600" />
                <h2 className="text-lg font-bold text-slate-900">Link With Phone Number</h2>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Use this if you are managing the dashboard on the same phone and cannot scan the QR.
              </p>
              <div className="mt-4 space-y-3">
                <input
                  type="tel"
                  value={pairingPhone}
                  onChange={(event) => setPairingPhone(event.target.value)}
                  placeholder="0201008784"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
                <button
                  type="button"
                  onClick={handleRequestPairingCode}
                  disabled={isBusy || (status !== "connecting" && status !== "qr_ready")}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loadingAction === "pairing-code" ? <Loader2 size={16} className="animate-spin" /> : <Smartphone size={16} />}
                  Generate Pairing Code
                </button>
                {pairingCode && (
                  <div className="rounded-2xl border-2 border-emerald-500 bg-emerald-50 p-4 text-center">
                    <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Pairing Code</p>
                    <p className="mt-2 select-all text-3xl font-black tracking-[0.25em] text-emerald-700">{pairingCode}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5 text-sm leading-6 text-blue-900">
              Keep only one server process using this WhatsApp session. Running multiple servers against the same `server/whatsapp-session` folder can disconnect linked devices.
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default WhatsAppPairing;
