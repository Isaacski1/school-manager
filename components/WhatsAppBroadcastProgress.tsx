import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  MessageCircle,
  Minus,
  X,
} from "lucide-react";
import { auth } from "../services/firebase";
import { API_BASE_URL } from "../src/config";

const ACTIVE_JOB_STORAGE_KEY = "active_whatsapp_broadcast_job";

type BroadcastJobState = {
  jobId: string;
  status: string;
  total: number;
  sent: number;
  failed: number;
  skippedOptOut: number;
  error?: string | null;
};

type StoredBroadcastJob = {
  jobId: string;
  startedAt: number;
};

const readStoredJob = (): StoredBroadcastJob | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ACTIVE_JOB_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredBroadcastJob;
    return parsed?.jobId ? parsed : null;
  } catch {
    return null;
  }
};

const getProgressPercent = (done: number, total: number) => {
  if (!total) return 0;
  return Math.min(100, Math.round((done / total) * 100));
};

const WhatsAppBroadcastProgress: React.FC = () => {
  const [activeJobId, setActiveJobId] = useState<string | null>(() => readStoredJob()?.jobId || null);
  const [job, setJob] = useState<BroadcastJobState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [minimized, setMinimized] = useState(false);

  const isFinished = job?.status === "completed" || job?.status === "error";
  const done = (job?.sent || 0) + (job?.failed || 0);
  const total = job?.total || 0;
  const percent = getProgressPercent(done, total);

  const activateJob = useCallback((jobId: string) => {
    setActiveJobId(jobId);
    setJob(null);
    setError(null);
    setMinimized(false);
    localStorage.setItem(
      ACTIVE_JOB_STORAGE_KEY,
      JSON.stringify({ jobId, startedAt: Date.now() }),
    );
  }, []);

  useEffect(() => {
    const handleJobStarted = (event: Event) => {
      const custom = event as CustomEvent<{ jobId?: string }>;
      if (custom.detail?.jobId) activateJob(custom.detail.jobId);
    };

    window.addEventListener("whatsapp-broadcast-job-started", handleJobStarted);
    return () => window.removeEventListener("whatsapp-broadcast-job-started", handleJobStarted);
  }, [activateJob]);

  useEffect(() => {
    if (!activeJobId) return;

    let cancelled = false;
    const fetchJob = async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;

        const res = await fetch(`${API_BASE_URL}/api/whatsapp/job/${activeJobId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || `Could not load broadcast progress (${res.status})`);
        }
        if (cancelled) return;

        const nextJob = data.job || {};
        setJob({
          jobId: activeJobId,
          status: nextJob.status || "processing",
          total: Number(nextJob.total || 0),
          sent: Number(nextJob.sent || 0),
          failed: Number(nextJob.failed || 0),
          skippedOptOut: Number(nextJob.skippedOptOut || 0),
          error: nextJob.error || null,
        });
        setError(null);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Could not load broadcast progress.");
      }
    };

    fetchJob();
    const interval = window.setInterval(fetchJob, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeJobId]);

  const statusText = useMemo(() => {
    if (error) return error;
    if (!job) return "Preparing broadcast progress...";
    if (job.status === "completed") return `Finished sending to ${job.sent} parent${job.sent === 1 ? "" : "s"}.`;
    if (job.status === "error") return job.error || "Broadcast failed.";
    if (job.status === "paused_anti_ban") return "Cooling down before the next batch.";
    return `Sent to ${job.sent} of ${job.total} parent${job.total === 1 ? "" : "s"}.`;
  }, [error, job]);

  const closeTracker = () => {
    localStorage.removeItem(ACTIVE_JOB_STORAGE_KEY);
    setActiveJobId(null);
    setJob(null);
    setError(null);
  };

  if (!activeJobId) return null;

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        className="fixed bottom-4 right-4 z-[1000] flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-xl shadow-emerald-900/20"
      >
        <MessageCircle size={18} />
        <span>{isFinished ? "Broadcast done" : `${done}/${total || "..."}`}</span>
      </button>
    );
  }

  return (
    <div className="fixed inset-x-3 bottom-3 z-[1000] sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[380px]">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/20">
        <div className="flex items-start gap-3 border-b border-slate-100 p-4">
          <div className={`mt-0.5 rounded-xl p-2 ${job?.status === "completed" ? "bg-emerald-50 text-emerald-600" : job?.status === "error" || error ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"}`}>
            {job?.status === "completed" ? <CheckCircle2 size={20} /> : job?.status === "error" || error ? <AlertTriangle size={20} /> : <Loader2 size={20} className="animate-spin" />}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-slate-900">WhatsApp broadcast progress</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{statusText}</p>
          </div>
          <button
            type="button"
            onClick={() => setMinimized(true)}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Minimize broadcast progress"
          >
            <Minus size={16} />
          </button>
          {isFinished || error ? (
            <button
              type="button"
              onClick={closeTracker}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close broadcast progress"
            >
              <X size={16} />
            </button>
          ) : null}
        </div>

        <div className="p-4">
          <div className="mb-3 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-all duration-500 ${job?.status === "error" || error ? "bg-red-500" : "bg-emerald-500"}`}
              style={{ width: `${percent}%` }}
            />
          </div>

          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="rounded-xl bg-slate-50 p-2">
              <p className="text-base font-black text-slate-900">{total || 0}</p>
              <p className="text-[10px] font-semibold uppercase text-slate-400">Total</p>
            </div>
            <div className="rounded-xl bg-emerald-50 p-2">
              <p className="text-base font-black text-emerald-700">{job?.sent || 0}</p>
              <p className="text-[10px] font-semibold uppercase text-emerald-500">Sent</p>
            </div>
            <div className="rounded-xl bg-red-50 p-2">
              <p className="text-base font-black text-red-700">{job?.failed || 0}</p>
              <p className="text-[10px] font-semibold uppercase text-red-500">Failed</p>
            </div>
            <div className="rounded-xl bg-amber-50 p-2">
              <p className="text-base font-black text-amber-700">{job?.skippedOptOut || 0}</p>
              <p className="text-[10px] font-semibold uppercase text-amber-500">Skipped</p>
            </div>
          </div>

          {!isFinished && !error ? (
            <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
              You can open another page. Sending continues on the server while this tracker updates.
            </p>
          ) : (
            <button
              type="button"
              onClick={closeTracker}
              className="mt-3 w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export const announceWhatsAppBroadcastJob = (jobId: string) => {
  if (typeof window === "undefined" || !jobId) return;
  localStorage.setItem(ACTIVE_JOB_STORAGE_KEY, JSON.stringify({ jobId, startedAt: Date.now() }));
  window.dispatchEvent(new CustomEvent("whatsapp-broadcast-job-started", { detail: { jobId } }));
};

export default WhatsAppBroadcastProgress;
