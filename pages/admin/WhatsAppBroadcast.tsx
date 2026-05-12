import React, { useEffect, useRef, useState, useCallback } from "react";
import Layout from "../../components/Layout";
import { useSchool } from "../../context/SchoolContext";
import { useAuth } from "../../context/AuthContext";
import { firestore } from "../../services/firebase";
import { collection, getDocs, query, where } from "firebase/firestore";
import { showToast } from "../../services/toast";
import { resolveFeaturePlan } from "../../services/featureAccess";
import { Link } from "react-router-dom";
import {
  Send, Users, CheckCircle2, XCircle,
  Loader2, Wifi, WifiOff, RefreshCw, AlertTriangle, MessageSquare, Smartphone,
} from "lucide-react";

// WhatsApp official SVG icon
const WhatsAppIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
  </svg>
);

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

type WaStatus = "disconnected" | "connecting" | "qr_ready" | "ready" | "error";

interface SendResult { phone: string; success: boolean; error?: string; }

const TEMPLATES = [
  { label: "School Fees Reminder", text: "Dear Parent, this is a reminder that school fees for this term are due. Kindly make payment at your earliest convenience. Thank you." },
  { label: "School Resumption", text: "Dear Parent, school resumes on Monday. Please ensure your ward is in school early. Thank you." },
  { label: "Parent-Teacher Meeting", text: "Dear Parent, you are invited to a Parent-Teacher Meeting on [DATE] at [TIME]. Your attendance is very important. Thank you." },
  { label: "Emergency Notice", text: "URGENT: Dear Parent, school will be closed tomorrow due to [REASON]. We apologize for the inconvenience." },
  { label: "Report Card Ready", text: "Dear Parent, your ward's report card is ready for collection. Please visit the school office at your earliest convenience. Thank you." },
];

const WhatsAppBroadcast: React.FC = () => {
  const { school } = useSchool();
  const { user } = useAuth();
  const featurePlan = resolveFeaturePlan(school);
  const isStandard = featurePlan === "standard";

  // ── Upgrade Wall for Starter Plan ───────────────────────────────────────────
  if (!isStandard) {
    return (
      <Layout title="WhatsApp Broadcast">
        <div className="max-w-2xl mx-auto mt-10 sm:mt-16 px-4">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-lg overflow-hidden">
            {/* Gradient banner */}
            <div className="bg-gradient-to-br from-emerald-600 to-teal-700 p-8 sm:p-10 flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center mb-4">
                <WhatsAppIcon size={32} />
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white mb-2">WhatsApp Broadcast</h1>
              <p className="text-emerald-100 text-sm sm:text-base">Send messages to all parents at once — completely free</p>
            </div>

            {/* Lock state */}
            <div className="p-8 sm:p-10 flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-full bg-amber-50 border-2 border-amber-200 flex items-center justify-center mb-4">
                <svg className="w-7 h-7 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <span className="text-xs font-bold bg-amber-100 text-amber-700 px-3 py-1 rounded-full mb-4">Standard Plan Feature</span>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-800 mb-3">Upgrade to Standard</h2>
              <p className="text-slate-500 text-sm sm:text-base mb-6 max-w-md">
                WhatsApp Broadcast allows you to message all parents instantly — no phone needed. Upgrade your plan to unlock this feature and many more.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full mb-8">
                {[
                  { icon: "💬", label: "Bulk WhatsApp Messaging" },
                  { icon: "📄", label: "Auto Payment Invoices" },
                  { icon: "👨‍👩‍👧", label: "Parent Portal Access" },
                ].map(f => (
                  <div key={f.label} className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
                    <div className="text-2xl mb-1">{f.icon}</div>
                    <p className="text-xs font-semibold text-slate-600">{f.label}</p>
                  </div>
                ))}
              </div>
              <Link
                to="/admin/billing"
                className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-8 py-3 rounded-full transition shadow-md text-sm sm:text-base"
              >
                Upgrade to Standard
              </Link>
              <p className="text-xs text-slate-400 mt-3">Contact your administrator or visit the Billing page to upgrade.</p>
            </div>
          </div>
        </div>
      </Layout>
    );
  }
  const [waStatus, setWaStatus] = useState<WaStatus>("disconnected");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  // Recipients
  const [parents, setParents] = useState<{ name: string; phone: string; class?: string }[]>([]);
  const [loadingParents, setLoadingParents] = useState(false);
  const [selectedPhones, setSelectedPhones] = useState<Set<string>>(new Set());
  const [classFilter, setClassFilter] = useState("All");

  // Message
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<SendResult[]>([]);

  const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Auth token helper ────────────────────────────────────────────────────────
  const getToken = useCallback(async () => {
    const { getAuth } = await import("firebase/auth");
    const fb = getAuth();
    return fb.currentUser?.getIdToken() ?? "";
  }, []);

  const apiFetch = useCallback(async (path: string, opts: RequestInit = {}) => {
    const token = await getToken();
    return fetch(`${API_BASE}${path}`, {
      ...opts,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
    });
  }, [getToken]);

  // ── Poll WhatsApp status ─────────────────────────────────────────────────────
  const pollStatus = useCallback(async (manual = false) => {
    if (manual) setIsPolling(true);
    try {
      const res = await apiFetch("/api/whatsapp/status");
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setStatusError((err as any).error || `Server error ${res.status}`);
        return;
      }
      setStatusError(null);
      const data = await res.json();
      setWaStatus(data.status);
      setQrCode(data.qr || null);
      if (manual) await new Promise(r => setTimeout(r, 400));
    } catch (e: any) {
      setStatusError(e.message || "Cannot reach server");
    } finally {
      if (manual) setIsPolling(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    pollStatus();
    statusPollRef.current = setInterval(() => pollStatus(false), 3000);
    return () => { if (statusPollRef.current) clearInterval(statusPollRef.current); };
  }, [pollStatus]);

  // ── Connect / Disconnect ─────────────────────────────────────────────────────
  const handleConnect = async () => {
    setConnecting(true);
    try {
      await apiFetch("/api/whatsapp/init", { method: "POST" });
      await pollStatus(false);
    } catch {
      showToast("Failed to start WhatsApp connection.", { type: "error" });
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    await apiFetch("/api/whatsapp/disconnect", { method: "POST" });
    setWaStatus("disconnected");
    setQrCode(null);
  };

  // ── Load parents from Firestore ──────────────────────────────────────────────
  useEffect(() => {
    if (!school?.id) return;
    const load = async () => {
      setLoadingParents(true);
      try {
        const q = query(collection(firestore, "students"), where("schoolId", "==", school.id));
        const snap = await getDocs(q);
        const list: { name: string; phone: string; class?: string }[] = [];
        const seen = new Set<string>();
        snap.docs.forEach((doc) => {
          const d = doc.data() as any;
          const phone = String(d.guardianPhone || d.parentPhone || d.guardian_phone || d.contactPhone || "").trim();
          const name = String(d.guardianName || d.parentName || d.guardian_name || d.contactName || "Parent").trim();
          if (phone && !seen.has(phone)) {
            seen.add(phone);
            list.push({ name, phone, class: d.class || d.className || d.classLevel || d.grade });
          }
        });
        setParents(list);
        setSelectedPhones(new Set(list.map((p) => p.phone)));
      } catch (err: any) {
        showToast("Failed to load parent contacts: " + err.message, { type: "error" });
      } finally {
        setLoadingParents(false);
      }
    };
    load();
  }, [school?.id]);

  const classes = ["All", ...Array.from(new Set(parents.map((p) => p.class).filter(Boolean) as string[])).sort()];
  const filteredParents = classFilter === "All" ? parents : parents.filter((p) => p.class === classFilter);

  const togglePhone = (phone: string) => {
    setSelectedPhones((prev) => {
      const next = new Set(prev);
      if (next.has(phone)) next.delete(phone); else next.add(phone);
      return next;
    });
  };

  const toggleAll = () => {
    const visible = filteredParents.map((p) => p.phone);
    const allSelected = visible.every((ph) => selectedPhones.has(ph));
    setSelectedPhones((prev) => {
      const next = new Set(prev);
      if (allSelected) visible.forEach((ph) => next.delete(ph));
      else visible.forEach((ph) => next.add(ph));
      return next;
    });
  };

  // ── Send Broadcast ───────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!message.trim()) { showToast("Please enter a message.", { type: "error" }); return; }
    if (selectedPhones.size === 0) { showToast("Select at least one recipient.", { type: "error" }); return; }
    if (waStatus !== "ready") { showToast("WhatsApp is not connected.", { type: "error" }); return; }

    setSending(true);
    setResults([]);
    setProgress({ done: 0, total: selectedPhones.size });

    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/api/whatsapp/broadcast`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: message.trim(), phones: Array.from(selectedPhones) }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let done = 0;

      while (reader) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          const line = part.replace(/^data: /, "").trim();
          if (!line) continue;
          try {
            const evt = JSON.parse(line);
            if (evt.type === "progress") {
              done++;
              setProgress({ done, total: selectedPhones.size });
              setResults((prev) => [...prev, { phone: evt.phone, success: evt.success, error: evt.error }]);
            }
            if (evt.type === "complete") {
              showToast(`Broadcast complete: ${evt.sent} sent, ${evt.failed} failed.`, { type: evt.failed > 0 ? "info" : "success" });
            }
          } catch (_) { /* ignore parse errors */ }
        }
      }
    } catch (err: any) {
      showToast(err.message || "Broadcast failed.", { type: "error" });
    } finally {
      setSending(false);
      setProgress(null);
    }
  };

  // ── Status UI helpers ────────────────────────────────────────────────────────
  const statusColor: Record<WaStatus, string> = {
    disconnected: "text-slate-400",
    connecting: "text-amber-500",
    qr_ready: "text-blue-500",
    ready: "text-emerald-500",
    error: "text-red-500",
  };
  const statusLabel: Record<WaStatus, string> = {
    disconnected: "Not Connected",
    connecting: "Connecting...",
    qr_ready: "Scan QR Code",
    ready: "Connected",
    error: "Connection Error",
  };

  const sentCount = results.filter((r) => r.success).length;
  const failedCount = results.filter((r) => !r.success).length;

  return (
    <Layout title="WhatsApp Broadcast">
      <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6 px-0">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 p-4 sm:p-6 text-white shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <WhatsAppIcon size={20} />
            </div>
            <div>
              <h1 className="text-lg sm:text-2xl font-bold leading-tight">WhatsApp Broadcast</h1>
              <p className="text-emerald-100 text-xs sm:text-sm">Send messages to all parents at once — completely free</p>
            </div>
          </div>
        </div>

        {/* ── Main grid — stacks on mobile ────────────────────────────────── */}
        <div className="flex flex-col xl:grid xl:grid-cols-3 gap-4 sm:gap-6">

          {/* ── LEFT: Connection + Composer ─────────────────────────────── */}
          <div className="xl:col-span-2 space-y-4 sm:space-y-5">

            {/* Connection Panel */}
            <div className="bg-white rounded-2xl border border-slate-100 p-4 sm:p-6 shadow-sm">
              {/* Title row — wraps on very small screens */}
              <div className="flex flex-wrap items-start gap-3 mb-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {waStatus === "ready"
                    ? <Wifi size={20} className="text-emerald-500 shrink-0" />
                    : <WifiOff size={20} className="text-slate-400 shrink-0" />}
                  <div className="min-w-0">
                    <h2 className="font-semibold text-slate-800 text-sm sm:text-base">WhatsApp Connection</h2>
                    <p className={`text-xs sm:text-sm font-medium ${statusColor[waStatus]}`}>{statusLabel[waStatus]}</p>
                  </div>
                </div>

                {/* Action buttons — always on same row, shrink to icons on xs */}
                <div className="flex items-center gap-2 shrink-0">
                  {waStatus !== "ready" && (
                    <button
                      onClick={handleConnect}
                      disabled={connecting || waStatus === "connecting" || waStatus === "qr_ready"}
                      className="flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full bg-emerald-600 text-white text-xs sm:text-sm font-semibold hover:bg-emerald-700 transition disabled:opacity-60"
                    >
                      {connecting || waStatus === "connecting"
                        ? <Loader2 size={13} className="animate-spin" />
                        : <Smartphone size={13} />}
                      <span>Connect</span>
                    </button>
                  )}
                  {waStatus === "ready" && (
                    <button
                      onClick={handleDisconnect}
                      className="flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full border border-slate-200 text-slate-600 text-xs sm:text-sm font-semibold hover:bg-slate-50 transition"
                    >
                      <WifiOff size={13} />
                      <span className="hidden sm:inline">Disconnect</span>
                    </button>
                  )}
                  <button
                    onClick={() => pollStatus(true)}
                    disabled={isPolling}
                    title="Refresh Status"
                    className="p-1.5 sm:p-2 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 transition disabled:opacity-50"
                  >
                    <RefreshCw size={14} className={isPolling ? "animate-spin" : ""} />
                  </button>
                </div>
              </div>

              {/* QR Code */}
              {qrCode && waStatus === "qr_ready" && (
                <div className="flex flex-col items-center gap-3 p-4 sm:p-6 bg-slate-50 rounded-xl border border-slate-100">
                  <p className="text-xs sm:text-sm font-semibold text-slate-700 text-center">
                    Open WhatsApp → ⋮ Menu → Linked Devices → Link a Device → Scan QR
                  </p>
                  <img src={qrCode} alt="WhatsApp QR Code" className="w-44 h-44 sm:w-56 sm:h-56 rounded-xl border-4 border-white shadow-lg" />
                  <p className="text-xs text-slate-400">QR code refreshes automatically every 20 seconds</p>
                </div>
              )}

              {waStatus === "ready" && (
                <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                  <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                  <p className="text-xs sm:text-sm text-emerald-700 font-medium">WhatsApp is connected and ready to send messages.</p>
                </div>
              )}
              {waStatus === "error" && (
                <div className="flex items-center gap-2 p-3 bg-red-50 rounded-xl border border-red-100">
                  <AlertTriangle size={16} className="text-red-500 shrink-0" />
                  <p className="text-xs sm:text-sm text-red-700">Connection error. Click Connect to try again.</p>
                </div>
              )}
              {statusError && (
                <div className="mt-2 flex items-center gap-2 p-3 bg-amber-50 rounded-xl border border-amber-100">
                  <AlertTriangle size={14} className="text-amber-500 shrink-0" />
                  <p className="text-xs text-amber-700 font-medium">{statusError}</p>
                </div>
              )}
            </div>

            {/* ── Message Composer ─────────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-slate-100 p-4 sm:p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <MessageSquare size={16} className="text-slate-500 shrink-0" />
                <h2 className="font-semibold text-slate-800 text-sm sm:text-base">Compose Message</h2>
              </div>

              {/* Templates */}
              <div className="mb-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Quick Templates</p>
                <div className="flex flex-wrap gap-2">
                  {TEMPLATES.map((t) => (
                    <button
                      key={t.label}
                      onClick={() => setMessage(t.text)}
                      className="px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700 transition"
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                placeholder="Type your message here... Use [DATE], [TIME], [AMOUNT] as placeholders."
                className="w-full border border-slate-200 rounded-xl p-3 sm:p-4 text-sm text-slate-800 resize-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition"
              />
              <div className="flex items-center justify-between mt-1.5">
                <p className="text-xs text-slate-400">{message.length} characters</p>
                <p className="text-xs text-slate-400">{selectedPhones.size} recipient{selectedPhones.size !== 1 ? "s" : ""} selected</p>
              </div>

              <button
                onClick={handleSend}
                disabled={sending || waStatus !== "ready" || !message.trim() || selectedPhones.size === 0}
                className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-full bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
              >
                {sending ? (
                  <><Loader2 size={15} className="animate-spin" /> Sending... {progress ? `(${progress.done}/${progress.total})` : ""}</>
                ) : (
                  <><Send size={15} /> Send to {selectedPhones.size} Parent{selectedPhones.size !== 1 ? "s" : ""}</>
                )}
              </button>
            </div>

            {/* ── Results ─────────────────────────────────────────────── */}
            {results.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-100 p-4 sm:p-6 shadow-sm">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-4">
                  <h2 className="font-semibold text-slate-800 text-sm sm:text-base">Broadcast Results</h2>
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">{sentCount} sent</span>
                  {failedCount > 0 && (
                    <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">{failedCount} failed</span>
                  )}
                </div>
                <div className="space-y-1.5 sm:space-y-2 max-h-56 overflow-y-auto">
                  {results.map((r, i) => (
                    <div key={i} className={`flex items-center justify-between px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm ${r.success ? "bg-emerald-50" : "bg-red-50"}`}>
                      <span className="font-medium text-slate-700 truncate mr-2">{r.phone}</span>
                      <span className={`flex items-center gap-1 font-semibold shrink-0 ${r.success ? "text-emerald-600" : "text-red-600"}`}>
                        {r.success ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                        {r.success ? "Sent" : (r.error || "Failed")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── RIGHT: Recipients ───────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-slate-100 p-4 sm:p-5 shadow-sm xl:sticky xl:top-4 xl:self-start">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-slate-500" />
                <h2 className="font-semibold text-slate-800 text-sm sm:text-base">Recipients</h2>
                <span className="text-xs text-slate-400 font-normal">({parents.length})</span>
              </div>
              {loadingParents && <Loader2 size={14} className="animate-spin text-slate-400" />}
            </div>

            <p className="text-xs text-slate-500 mb-3 sm:mb-4 bg-slate-50 p-2.5 sm:p-3 rounded-xl border border-slate-100 leading-relaxed">
              All <strong>unique parent phone numbers</strong> from your student records.
              Unregistered WhatsApp numbers will be marked "Failed".
            </p>

            {/* Class filter pills — horizontally scrollable on mobile */}
            <div className="flex gap-1.5 mb-3 sm:mb-4 overflow-x-auto pb-1 scrollbar-hide">
              {classes.map((cls) => (
                <button
                  key={cls}
                  onClick={() => setClassFilter(cls)}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition shrink-0 ${classFilter === cls ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                >
                  {cls}
                </button>
              ))}
            </div>

            {/* Select all */}
            <button onClick={toggleAll} className="w-full text-left text-xs font-bold text-emerald-700 hover:text-emerald-800 mb-2 sm:mb-3 flex items-center gap-1.5">
              <CheckCircle2 size={12} />
              {filteredParents.every((p) => selectedPhones.has(p.phone)) ? "Deselect All" : "Select All"}
              <span className="ml-auto text-slate-400 font-normal">
                {filteredParents.filter((p) => selectedPhones.has(p.phone)).length}/{filteredParents.length}
              </span>
            </button>

            {/* Parent list — fixed height with scroll */}
            <div className="space-y-1 max-h-64 sm:max-h-80 xl:max-h-[420px] overflow-y-auto pr-0.5">
              {filteredParents.length === 0 && !loadingParents && (
                <div className="text-center py-6 px-2">
                  <p className="text-slate-400 text-sm mb-1">No parents found</p>
                  <p className="text-slate-300 text-xs">Make sure students have a <code className="bg-slate-100 px-1 rounded">guardianPhone</code> field in Firestore</p>
                </div>
              )}
              {filteredParents.map((p) => (
                <label key={p.phone} className="flex items-center gap-2.5 sm:gap-3 p-2 sm:p-2.5 rounded-xl hover:bg-slate-50 cursor-pointer transition">
                  <input
                    type="checkbox"
                    checked={selectedPhones.has(p.phone)}
                    onChange={() => togglePhone(p.phone)}
                    className="accent-emerald-600 w-4 h-4 cursor-pointer shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-slate-700 truncate">{p.name}</p>
                    <p className="text-xs text-slate-400">{p.phone}{p.class ? ` · ${p.class}` : ""}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

        </div>
      </div>
    </Layout>
  );
};

export default WhatsAppBroadcast;
