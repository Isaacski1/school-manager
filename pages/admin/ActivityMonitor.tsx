import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Layout from "../../components/Layout";
import { firestore } from "../../services/firebase";
import { useSchool } from "../../context/SchoolContext";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  BadgeCheck,
  Filter,
  RefreshCw,
  Search,
  Timer,
  UserCheck,
  Users,
} from "lucide-react";
import {
  collection,
  doc,
  DocumentData,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  QueryDocumentSnapshot,
  startAfter,
  Timestamp,
} from "firebase/firestore";

type ActivityLog = {
  id: string;
  schoolId?: string | null;
  userId?: string | null;
  userName?: string | null;
  role?: string | null;
  actionType?: string;
  module?: string | null;
  description?: string | null;
  status?: string | null;
  metadata?: Record<string, any> | null;
  entityId?: string | null;
  timestamp?: Timestamp | number | string;
};

const PAGE_SIZE = 25;
const MAX_CACHE_LOGS = 200;

const statusStyles: Record<
  string,
  { badge: string; dot: string; icon: React.ReactNode }
> = {
  success: {
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
    icon: <BadgeCheck size={16} className="text-emerald-600" />,
  },
  warning: {
    badge: "bg-amber-50 text-amber-700 border-amber-200",
    dot: "bg-amber-500",
    icon: <AlertTriangle size={16} className="text-amber-600" />,
  },
  failed: {
    badge: "bg-rose-50 text-rose-700 border-rose-200",
    dot: "bg-rose-500",
    icon: <AlertCircle size={16} className="text-rose-600" />,
  },
};

const normalizeDate = (value?: Timestamp | number | string): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof (value as any)?.toDate === "function")
    return (value as any).toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDateTime = (value?: Timestamp | number | string) => {
  const date = normalizeDate(value);
  if (!date) return "—";
  return date.toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const prettyLabel = (value?: string) => {
  if (!value) return "—";
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
};

const ActivityMonitor: React.FC = () => {
  const { school } = useSchool();
  const schoolId = school?.id || null;
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [firstLogs, setFirstLogs] = useState<ActivityLog[]>([]);
  const [extraLogs, setExtraLogs] = useState<ActivityLog[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [cursor, setCursor] =
    useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [realtime, setRealtime] = useState(true);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  const extraLogsRef = useRef<ActivityLog[]>([]);
  const hasHydratedRef = useRef(false);
  const suppressResetRef = useRef(false);
  const hasFetchedRef = useRef(false);
  const hasCachedRef = useRef(false);

  const cacheKey = useMemo(() => {
    if (!schoolId) return null;
    return `activity_monitor_cache_${schoolId}`;
  }, [schoolId]);

  const serializeLogs = useCallback((logs: ActivityLog[]) => {
    return logs.slice(0, MAX_CACHE_LOGS).map((log) => {
      const timestamp = (() => {
        if (!log.timestamp) return log.timestamp;
        if (log.timestamp instanceof Timestamp) return log.timestamp.toMillis();
        if (typeof (log.timestamp as any)?.toDate === "function") {
          return (log.timestamp as any).toDate().getTime();
        }
        return log.timestamp;
      })();
      return {
        ...log,
        timestamp,
      };
    });
  }, []);

  const mergeUnique = useCallback(
    (base: ActivityLog[], next: ActivityLog[]) => {
      const map = new Map<string, ActivityLog>();
      base.forEach((item) => map.set(item.id, item));
      next.forEach((item) => map.set(item.id, item));
      return Array.from(map.values());
    },
    [],
  );

  const resolvedLogs = useMemo(() => {
    const combined = mergeUnique(firstLogs, extraLogs);
    return combined.sort((a, b) => {
      const aTime = normalizeDate(a.timestamp)?.getTime() || 0;
      const bTime = normalizeDate(b.timestamp)?.getTime() || 0;
      return sortDir === "desc" ? bTime - aTime : aTime - bTime;
    });
  }, [extraLogs, firstLogs, mergeUnique, sortDir]);

  const baseQuery = useCallback(() => {
    if (!schoolId) return null;
    return query(
      collection(doc(firestore, "schools", schoolId), "activityLogs"),
      orderBy("timestamp", sortDir),
      limit(PAGE_SIZE),
    );
  }, [schoolId, sortDir]);

  const getStatus = (log: ActivityLog) => {
    const raw = String(
      log.status ||
        log.metadata?.status ||
        log.metadata?.result ||
        log.metadata?.outcome ||
        "success",
    )
      .toLowerCase()
      .trim();
    if (["failed", "error", "denied"].includes(raw)) return "failed";
    if (["warning", "warn", "partial"].includes(raw)) return "warning";
    return "success";
  };

  const getActorName = (log: ActivityLog) => {
    return (
      log.userName ||
      log.metadata?.actorName ||
      log.metadata?.userName ||
      log.metadata?.studentName ||
      log.metadata?.teacherName ||
      log.metadata?.adminName ||
      log.metadata?.name ||
      log.metadata?.email ||
      log.userId ||
      "Unknown"
    );
  };

  const getModule = (log: ActivityLog) => {
    return (
      log.module ||
      log.metadata?.module ||
      log.metadata?.page ||
      log.metadata?.entity ||
      log.metadata?.collection ||
      log.metadata?.context ||
      "System"
    );
  };

  const getRole = (log: ActivityLog) => {
    if (!log.role) return "Unknown";
    return String(log.role)
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const getDescription = (log: ActivityLog) => {
    return (
      log.description ||
      log.metadata?.description ||
      log.metadata?.details ||
      log.metadata?.reason ||
      log.metadata?.note ||
      ""
    );
  };

  useEffect(() => {
    extraLogsRef.current = extraLogs;
  }, [extraLogs]);

  useEffect(() => {
    if (!cacheKey) return;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as {
          firstLogs?: ActivityLog[];
          extraLogs?: ActivityLog[];
          sortDir?: "asc" | "desc";
          realtime?: boolean;
        };
        if (Array.isArray(parsed.firstLogs)) {
          setFirstLogs(parsed.firstLogs);
        }
        if (Array.isArray(parsed.extraLogs)) {
          setExtraLogs(parsed.extraLogs);
        }
        if (parsed.sortDir === "asc" || parsed.sortDir === "desc") {
          setSortDir(parsed.sortDir);
        }
        if (typeof parsed.realtime === "boolean") {
          setRealtime(parsed.realtime);
        }
      } catch {
        // Ignore cache errors
      }
    }
    hasCachedRef.current = Boolean(cached);
    hasHydratedRef.current = true;
    suppressResetRef.current = true;
  }, [cacheKey]);

  useEffect(() => {
    if (!cacheKey) return;
    if (!hasHydratedRef.current) return;
    if (
      hasCachedRef.current &&
      !hasFetchedRef.current &&
      firstLogs.length === 0 &&
      extraLogs.length === 0
    ) {
      return;
    }
    const payload = {
      firstLogs: serializeLogs(firstLogs),
      extraLogs: serializeLogs(extraLogs),
      sortDir,
      realtime,
      savedAt: Date.now(),
    };
    localStorage.setItem(cacheKey, JSON.stringify(payload));
  }, [cacheKey, extraLogs, firstLogs, realtime, serializeLogs, sortDir]);

  useEffect(() => {
    if (!hasHydratedRef.current) return;
    if (suppressResetRef.current) {
      suppressResetRef.current = false;
      return;
    }
    setExtraLogs([]);
    setCursor(null);
    setHasMore(true);
  }, [schoolId, sortDir]);

  useEffect(() => {
    const q = baseQuery();
    if (!q || !schoolId) return;

    setLoading(true);

    if (realtime) {
      const unsubscribe = onSnapshot(
        q,
        (snap) => {
          const items = snap.docs.map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as ActivityLog),
          }));
          setFirstLogs(items);
          hasFetchedRef.current = true;
          if (!extraLogsRef.current.length) {
            setCursor(snap.docs[snap.docs.length - 1] || null);
            setHasMore(snap.docs.length === PAGE_SIZE);
          }
          setLoading(false);
        },
        () => setLoading(false),
      );
      return () => unsubscribe();
    }

    const load = async () => {
      try {
        const snap = await getDocs(q);
        const items = snap.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as ActivityLog),
        }));
        setFirstLogs(items);
        hasFetchedRef.current = true;
        setCursor(snap.docs[snap.docs.length - 1] || null);
        setHasMore(snap.docs.length === PAGE_SIZE);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [baseQuery, realtime, schoolId]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore || !schoolId) return;
    setLoadingMore(true);
    try {
      const nextSnap = await getDocs(
        query(
          collection(doc(firestore, "schools", schoolId), "activityLogs"),
          orderBy("timestamp", sortDir),
          startAfter(cursor),
          limit(PAGE_SIZE),
        ),
      );
      const nextItems = nextSnap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as ActivityLog),
      }));
      setExtraLogs((prev) => mergeUnique(prev, nextItems));
      setCursor(nextSnap.docs[nextSnap.docs.length - 1] || cursor);
      setHasMore(nextSnap.docs.length === PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, mergeUnique, schoolId, sortDir]);

  const filteredLogs = useMemo(() => {
    const term = search.trim().toLowerCase();
    const fromDate = dateFrom ? new Date(dateFrom + "T00:00:00") : null;
    const toDate = dateTo ? new Date(dateTo + "T23:59:59") : null;
    return resolvedLogs.filter((log) => {
      const status = getStatus(log);
      const role = getRole(log);
      const module = getModule(log);
      const event = log.actionType || "";
      const desc = getDescription(log);
      const actor = getActorName(log);
      const createdAt = normalizeDate(log.timestamp);

      if (roleFilter !== "all" && role !== roleFilter) return false;
      if (typeFilter !== "all" && prettyLabel(event) !== typeFilter)
        return false;
      if (moduleFilter !== "all" && module !== moduleFilter) return false;
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (fromDate && (!createdAt || createdAt < fromDate)) return false;
      if (toDate && (!createdAt || createdAt > toDate)) return false;

      if (!term) return true;
      return [event, module, actor, desc, role]
        .filter(Boolean)
        .some((val) => String(val).toLowerCase().includes(term));
    });
  }, [
    dateFrom,
    dateTo,
    moduleFilter,
    resolvedLogs,
    roleFilter,
    search,
    statusFilter,
    typeFilter,
  ]);

  const roles = useMemo(() => {
    const set = new Set(resolvedLogs.map((log) => getRole(log)));
    return ["all", ...Array.from(set).filter(Boolean)];
  }, [resolvedLogs]);

  const types = useMemo(() => {
    const set = new Set(resolvedLogs.map((log) => prettyLabel(log.actionType)));
    return ["all", ...Array.from(set).filter(Boolean)];
  }, [resolvedLogs]);

  const modules = useMemo(() => {
    const set = new Set(resolvedLogs.map((log) => getModule(log)));
    return ["all", ...Array.from(set).filter(Boolean)];
  }, [resolvedLogs]);

  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todays = resolvedLogs.filter((log) => {
      const d = normalizeDate(log.timestamp);
      return d ? d >= today : false;
    });
    const uniqueUsers = new Set(
      resolvedLogs.map((log) => log.userId || getActorName(log)),
    );
    const errors = resolvedLogs.filter((log) =>
      ["failed", "warning"].includes(getStatus(log)),
    );
    const recentLogins = resolvedLogs.filter((log) =>
      String(log.actionType || "")
        .toLowerCase()
        .includes("login"),
    );
    return {
      today: todays.length,
      activeUsers: uniqueUsers.size,
      issues: errors.length,
      logins: recentLogins.length,
    };
  }, [resolvedLogs]);

  return (
    <Layout title="Activity Monitor">
      <div className="space-y-6">
        <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-white to-[#E6F0FA] p-6 shadow-sm">
          <div className="absolute right-4 top-4 h-16 w-16 rounded-2xl bg-[#0B4A82] text-white flex items-center justify-center shadow-lg">
            <Activity size={28} />
          </div>
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#1160A8]">
              Real-time monitoring
            </p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">
              School Activity Monitoring Hub
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Track every action across the platform, detect issues instantly,
              and understand system usage with live insights.
            </p>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                realtime
                  ? "bg-emerald-600 text-white"
                  : "bg-white text-slate-600 border border-slate-200"
              }`}
              onClick={() => setRealtime((prev) => !prev)}
            >
              <Timer size={14} />
              {realtime ? "Live updates enabled" : "Live updates paused"}
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50"
              onClick={() => setSearch("")}
            >
              <RefreshCw size={14} />
              Clear filters
            </button>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "Total activities today",
              value: stats.today,
              icon: <Activity size={18} />,
              tone: "from-indigo-500 to-[#0B4A82]",
            },
            {
              label: "Active users",
              value: stats.activeUsers,
              icon: <Users size={18} />,
              tone: "from-emerald-500 to-emerald-600",
            },
            {
              label: "Errors & warnings",
              value: stats.issues,
              icon: <AlertTriangle size={18} />,
              tone: "from-amber-500 to-orange-500",
            },
            {
              label: "Recent logins",
              value: stats.logins,
              icon: <UserCheck size={18} />,
              tone: "from-slate-700 to-slate-500",
            },
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-1 hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <div
                  className={`h-10 w-10 rounded-xl bg-gradient-to-br ${card.tone} text-white flex items-center justify-center shadow-sm`}
                >
                  {card.icon}
                </div>
                <span className="text-xs text-slate-400">Today</span>
              </div>
              <div className="mt-4 text-2xl font-bold text-slate-900">
                {card.value}
              </div>
              <div className="text-xs text-slate-500 mt-1">{card.label}</div>
            </div>
          ))}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Activity filters
              </h2>
              <p className="text-xs text-slate-500">
                Narrow down logs by role, module, and time.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Filter size={14} />
              {filteredLogs.length} results
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <label className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search user, action, module..."
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-700 focus:border-[#0B4A82] focus:outline-none"
              />
            </label>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700"
            >
              {roles.map((role) => (
                <option key={role} value={role}>
                  {role === "all" ? "All roles" : role}
                </option>
              ))}
            </select>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700"
            >
              {types.map((type) => (
                <option key={type} value={type}>
                  {type === "all" ? "All activity types" : type}
                </option>
              ))}
            </select>
            <select
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700"
            >
              {modules.map((module) => (
                <option key={module} value={module}>
                  {module === "all" ? "All modules" : module}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700"
            >
              <option value="all">All statuses</option>
              <option value="success">Success</option>
              <option value="warning">Warning</option>
              <option value="failed">Failed</option>
            </select>
            <select
              value={sortDir}
              onChange={(e) => setSortDir(e.target.value as "asc" | "desc")}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700"
            >
              <option value="desc">Latest first</option>
              <option value="asc">Oldest first</option>
            </select>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700"
            />
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Live Activity Timeline
                </h2>
                <p className="text-xs text-slate-500">
                  Chronological feed with status indicators and module context.
                </p>
              </div>
              {loading && (
                <div className="text-xs text-slate-400 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#0B4A82] animate-pulse" />
                  Syncing…
                </div>
              )}
            </div>

            <div className="mt-6 max-h-[520px] space-y-4 overflow-y-auto pr-2">
              {filteredLogs.length === 0 && !loading ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-400">
                  No activity logs found for the selected filters.
                </div>
              ) : (
                filteredLogs.map((log, index) => {
                  const status = getStatus(log);
                  const styles = statusStyles[status] || statusStyles.success;
                  const description = getDescription(log);
                  return (
                    <div
                      key={`${log.id}-${index}`}
                      className="relative flex gap-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition-all hover:border-[#E6F0FA]"
                    >
                      <div className="relative flex flex-col items-center">
                        <span
                          className={`h-3 w-3 rounded-full ${styles.dot} shadow`}
                        />
                        {index < filteredLogs.length - 1 && (
                          <span className="mt-2 h-full w-px bg-slate-100" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900">
                            {prettyLabel(log.actionType)}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${
                              styles.badge
                            }`}
                          >
                            {styles.icon}
                            {status}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {formatDateTime(log.timestamp)}
                          </span>
                        </div>
                        <div className="mt-2 text-sm text-slate-600">
                          <span className="font-semibold text-slate-800">
                            {getActorName(log)}
                          </span>{" "}
                          <span className="text-slate-400">
                            ({getRole(log)})
                          </span>
                          <span className="mx-2 text-slate-300">•</span>
                          <span className="text-slate-600">
                            {getModule(log)}
                          </span>
                        </div>
                        {description && (
                          <div className="mt-2 text-xs text-slate-500">
                            {description}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {hasMore && !loading && (
              <div className="mt-6 flex justify-center">
                <button
                  onClick={loadMore}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                  disabled={loadingMore}
                >
                  <RefreshCw
                    size={14}
                    className={loadingMore ? "animate-spin" : ""}
                  />
                  {loadingMore ? "Loading more" : "Load more"}
                </button>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-base font-semibold text-slate-900">
                Critical highlights
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Most important system changes & warnings.
              </p>
              <div className="mt-4 space-y-3">
                {filteredLogs
                  .filter((log) =>
                    ["failed", "warning"].includes(getStatus(log)),
                  )
                  .slice(0, 6)
                  .map((log) => (
                    <div
                      key={`critical-${log.id}`}
                      className="rounded-2xl border border-slate-100 bg-slate-50 p-3"
                    >
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>{prettyLabel(log.actionType)}</span>
                        <span>{formatDateTime(log.timestamp)}</span>
                      </div>
                      <div className="mt-1 text-sm font-semibold text-slate-800">
                        {getActorName(log)} · {getModule(log)}
                      </div>
                      <div className="text-xs text-slate-500">
                        {getDescription(log) || "Check for details in the log."}
                      </div>
                    </div>
                  ))}
                {filteredLogs.filter((log) =>
                  ["failed", "warning"].includes(getStatus(log)),
                ).length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-xs text-slate-400">
                    No critical alerts right now.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-base font-semibold text-slate-900">
                Summary insights
              </h3>
              <div className="mt-4 space-y-3">
                {[
                  {
                    label: "Live updates",
                    value: realtime ? "Enabled" : "Paused",
                  },
                  {
                    label: "Logs loaded",
                    value: resolvedLogs.length.toString(),
                  },
                  {
                    label: "Filtered results",
                    value: filteredLogs.length.toString(),
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600"
                  >
                    <span>{item.label}</span>
                    <span className="font-semibold text-slate-800">
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
};

export default ActivityMonitor;
