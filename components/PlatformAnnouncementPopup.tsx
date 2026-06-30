import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import {
  getPlatformBroadcastInbox,
  updatePlatformBroadcastReceipt,
} from "../services/backendApi";
import { PlatformBroadcast, UserRole } from "../types";

const DEFAULT_IMAGE = "/assets/announcements/school-hallway.png";
const ELIGIBLE_ROLES = new Set<UserRole>([
  UserRole.SCHOOL_ADMIN,
  UserRole.TEACHER,
  UserRole.PARENT,
]);

const toMillis = (value: PlatformBroadcast["createdAt"]) => {
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  const candidate = value as any;
  if (typeof candidate?.toMillis === "function") return candidate.toMillis();
  if (typeof candidate?._seconds === "number") return candidate._seconds * 1000;
  return new Date(candidate as any).getTime();
};

const formatDate = (value: PlatformBroadcast["createdAt"]) => {
  const millis = toMillis(value);
  if (!Number.isFinite(millis)) return "Recently published";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(millis);
};

const formatMaintenanceWindow = (broadcast: PlatformBroadcast) => {
  if (!broadcast.maintenanceStart) return null;
  const start = new Date(broadcast.maintenanceStart as any);
  const end = broadcast.maintenanceEnd
    ? new Date(broadcast.maintenanceEnd as any)
    : null;
  if (Number.isNaN(start.getTime())) return null;
  const formatter = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
  return end && !Number.isNaN(end.getTime())
    ? `${formatter.format(start)} – ${formatter.format(end)}`
    : formatter.format(start);
};

const getSafeActionUrl = (value?: string | null) => {
  const url = String(value || "").trim();
  return /^(https?:\/\/|\/(?!\/)|#)/i.test(url) ? url : "";
};

const priorityStyle = {
  NORMAL: {
    label: "Announcement",
    badge: "text-blue-700",
    dot: "bg-blue-500",
  },
  IMPORTANT: {
    label: "Important",
    badge: "text-amber-700",
    dot: "bg-amber-500",
  },
  CRITICAL: {
    label: "Critical",
    badge: "text-rose-700",
    dot: "bg-rose-500",
  },
} as const;

interface PlatformAnnouncementPopupProps {
  previewBroadcast?: PlatformBroadcast | null;
  onPreviewClose?: () => void;
}

const PlatformAnnouncementPopup: React.FC<PlatformAnnouncementPopupProps> = ({
  previewBroadcast = null,
  onPreviewClose,
}) => {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState<PlatformBroadcast[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loadingAction, setLoadingAction] = useState(false);

  const eligible = Boolean(
    previewBroadcast || (user && ELIGIBLE_ROLES.has(user.role)),
  );
  const active = previewBroadcast || announcements[activeIndex] || null;
  const priority = active ? priorityStyle[active.priority] : priorityStyle.NORMAL;
  const maintenanceWindow = active ? formatMaintenanceWindow(active) : null;
  const safeActionUrl = active ? getSafeActionUrl(active.actionUrl) : "";

  useEffect(() => {
    if (previewBroadcast) return;
    if (!eligible) {
      setAnnouncements([]);
      return;
    }

    let cancelled = false;
    getPlatformBroadcastInbox()
      .then((response) => {
        if (cancelled) return;
        setAnnouncements(response.broadcasts || []);
        setActiveIndex(0);
      })
      .catch((error) => {
        console.warn("[Announcements] Inbox unavailable", error);
      });

    return () => {
      cancelled = true;
    };
  }, [eligible, previewBroadcast, user?.id]);

  useEffect(() => {
    if (!active || previewBroadcast) return;
    updatePlatformBroadcastReceipt(active.id, "impression").catch((error) => {
      console.warn("[Announcements] Impression could not be recorded", error);
    });
  }, [active?.id, previewBroadcast]);

  useEffect(() => {
    if (!active) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [active?.id]);

  const removeActive = useCallback(() => {
    setAnnouncements((current) =>
      current.filter((announcement) => announcement.id !== active?.id),
    );
    setActiveIndex((current) =>
      Math.max(0, Math.min(current, announcements.length - 2)),
    );
  }, [active?.id, announcements.length]);

  const recordAndClose = async (
    action: "acknowledge" | "dismiss" | "snooze",
  ) => {
    if (!active || loadingAction) return;
    if (previewBroadcast) {
      onPreviewClose?.();
      return;
    }
    setLoadingAction(true);
    try {
      await updatePlatformBroadcastReceipt(active.id, action);
      removeActive();
    } catch (error) {
      console.error("[Announcements] Receipt update failed", error);
    } finally {
      setLoadingAction(false);
    }
  };

  const dots = useMemo(
    () => announcements.map((announcement) => announcement.id),
    [announcements],
  );

  if (!active || !eligible) return null;

  const canDismiss = !active.requireAcknowledgement;
  const primaryLabel = active.requireAcknowledgement ? "I understand" : "Got it";

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center overflow-y-auto bg-slate-950/55 px-0 py-0 backdrop-blur-[2px] sm:items-center sm:px-5 sm:py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="platform-announcement-title"
      data-testid="platform-announcement"
    >
      <div className="absolute inset-0" aria-hidden="true" />
      <section className="relative z-10 flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-[1.75rem] bg-white shadow-[0_28px_100px_rgba(15,23,42,0.34)] motion-safe:animate-in motion-safe:slide-in-from-bottom-8 motion-safe:fade-in motion-safe:duration-300 sm:max-h-[88vh] sm:max-w-3xl sm:rounded-[1.75rem] lg:max-w-[760px]">
        <div className="relative h-40 shrink-0 overflow-hidden bg-slate-100 sm:h-60">
          <img
            src={active.imageUrl || DEFAULT_IMAGE}
            alt=""
            className="h-full w-full object-cover"
            loading="eager"
            decoding="async"
            onError={(event) => {
              if (event.currentTarget.src.endsWith(DEFAULT_IMAGE)) return;
              event.currentTarget.src = DEFAULT_IMAGE;
            }}
          />
          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-slate-950/35 to-transparent" />
          {canDismiss && (
            <button
              type="button"
              onClick={() => recordAndClose("dismiss")}
              disabled={loadingAction}
              className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/40 bg-slate-950/35 text-white shadow-sm backdrop-blur-md transition hover:bg-slate-950/55 focus:outline-none focus:ring-2 focus:ring-white"
              aria-label="Dismiss announcement"
            >
              <X size={19} />
            </button>
          )}
        </div>

        <div className="overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 sm:px-10 sm:pb-8 sm:pt-7">
          <div className="mb-3 flex items-center justify-between gap-4">
            <div
              className={`inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] ${priority.badge}`}
            >
              {active.priority === "CRITICAL" ? (
                <AlertTriangle size={15} />
              ) : (
                <span className={`h-2 w-2 rounded-full ${priority.dot}`} />
              )}
              {priority.label}
            </div>
            {!previewBroadcast && announcements.length > 1 && (
              <span className="text-xs font-semibold text-slate-500">
                {activeIndex + 1} / {announcements.length}
              </span>
            )}
          </div>

          <h2
            id="platform-announcement-title"
            className="text-2xl font-extrabold leading-tight tracking-[-0.025em] text-slate-950 sm:text-3xl"
          >
            {active.title}
          </h2>

          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-slate-500 sm:text-sm">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays size={15} />
              {formatDate(active.publishAt || active.createdAt)}
            </span>
            {maintenanceWindow && (
              <span className="inline-flex items-center gap-1.5 text-rose-700">
                <Clock3 size={15} />
                {maintenanceWindow}
              </span>
            )}
          </div>

          <div className="mt-5 whitespace-pre-line text-[15px] leading-7 text-slate-600">
            {active.message}
          </div>

          {active.whatsNew && active.whatsNew.length > 0 && (
            <ul className="mt-5 space-y-2 border-l-2 border-blue-100 pl-4 text-sm text-slate-600">
              {active.whatsNew.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}

          {safeActionUrl && (
            <a
              href={safeActionUrl}
              target={safeActionUrl.startsWith("http") ? "_blank" : undefined}
              rel="noreferrer"
              className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-blue-700 transition hover:text-blue-800"
              onClick={() =>
                updatePlatformBroadcastReceipt(active.id, "read").catch(() => {})
              }
            >
              {active.actionLabel || "Learn more"}
              <ExternalLink size={15} />
            </a>
          )}

          {!previewBroadcast && announcements.length > 1 && (
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() =>
                  setActiveIndex((current) =>
                    current === 0 ? announcements.length - 1 : current - 1,
                  )
                }
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                aria-label="Previous announcement"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="flex items-center gap-2" aria-hidden="true">
                {dots.map((id, index) => (
                  <span
                    key={id}
                    className={`h-1.5 rounded-full transition-all ${
                      index === activeIndex
                        ? "w-5 bg-blue-600"
                        : "w-1.5 bg-slate-200"
                    }`}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() =>
                  setActiveIndex((current) => (current + 1) % announcements.length)
                }
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                aria-label="Next announcement"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          )}

          <div className="mt-6 flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row">
            <button
              type="button"
              onClick={() => recordAndClose("snooze")}
              disabled={loadingAction}
              className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
            >
              <Clock3 size={17} />
              {active.requireAcknowledgement ? "Remind me later" : "View later"}
            </button>
            <button
              type="button"
              onClick={() => recordAndClose("acknowledge")}
              disabled={loadingAction}
              className="inline-flex min-h-12 flex-[1.2] items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
            >
              <CheckCircle2 size={18} />
              {loadingAction ? "Saving…" : primaryLabel}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default PlatformAnnouncementPopup;
