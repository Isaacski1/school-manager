import React, { useEffect, useMemo, useState } from "react";
import Layout from "../../components/Layout";
import {
  getSuperAdminSystemHealth,
  SuperAdminSystemHealth,
} from "../../services/backendApi";
import { showToast } from "../../services/toast";
import {
  Activity,
  AlertTriangle,
  Clock3,
  Cpu,
  Gauge,
  HardDrive,
  Database,
  RefreshCw,
  Server,
  ShieldCheck,
  Users,
  GraduationCap,
  Bot,
  CheckCircle2,
  ListChecks,
} from "lucide-react";

const AUTO_REFRESH_MS = 20_000;

const formatNumber = (value: number, digits = 2) =>
  new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);

const formatCompact = (value: number) =>
  new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);

const formatWindow = (windowMs: number) => {
  const minutes = Math.round(windowMs / 60000);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
};

const formatUptime = (totalSeconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const days = Math.floor(safeSeconds / 86400);
  const hours = Math.floor((safeSeconds % 86400) / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

const progressTone = (value: number) => {
  if (value >= 85) return "bg-rose-500";
  if (value >= 65) return "bg-amber-500";
  return "bg-emerald-500";
};

const textTone = (value: number) => {
  if (value >= 85) return "text-rose-700";
  if (value >= 65) return "text-amber-700";
  return "text-emerald-700";
};

const opsStatusTone = {
  healthy: {
    className: "border-emerald-200 bg-emerald-50 text-emerald-900",
    badgeClassName: "bg-emerald-100 text-emerald-800 ring-emerald-200",
    iconClassName: "bg-emerald-600 text-white",
  },
  degraded: {
    className: "border-amber-200 bg-amber-50 text-amber-900",
    badgeClassName: "bg-amber-100 text-amber-800 ring-amber-200",
    iconClassName: "bg-amber-500 text-white",
  },
  critical: {
    className: "border-rose-200 bg-rose-50 text-rose-900",
    badgeClassName: "bg-rose-100 text-rose-800 ring-rose-200",
    iconClassName: "bg-rose-600 text-white",
  },
} as const;

const findingTone = {
  info: {
    className: "border-blue-100 bg-blue-50 text-blue-900",
    dotClassName: "bg-blue-500",
  },
  warning: {
    className: "border-amber-100 bg-amber-50 text-amber-900",
    dotClassName: "bg-amber-500",
  },
  critical: {
    className: "border-rose-100 bg-rose-50 text-rose-900",
    dotClassName: "bg-rose-500",
  },
} as const;

const formatRelativeTime = (timestamp: number) => {
  if (!timestamp) return "Unknown";
  const elapsedMs = Math.max(0, Date.now() - timestamp);
  const seconds = Math.round(elapsedMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
};

type HealthStatus = "healthy" | "degraded" | "critical";

const getOverallHealth = (
  metrics: SuperAdminSystemHealth,
  pressures: { cpuPressure: number; memoryPressure: number; limiterPressure: number },
): HealthStatus => {
  const errorRate = Number(metrics.requests.last5m.errorRatePct || 0);
  const latency = Number(metrics.requests.last5m.p95LatencyMs || 0);
  const firestoreDown = metrics.dependencies.firestore.status === "unavailable";

  if (
    firestoreDown ||
    errorRate >= 5 ||
    latency >= 3000 ||
    pressures.cpuPressure >= 90 ||
    pressures.memoryPressure >= 90 ||
    pressures.limiterPressure >= 90
  ) {
    return "critical";
  }
  if (
    metrics.dependencies.firestore.status === "degraded" ||
    errorRate >= 2 ||
    latency >= 1000 ||
    pressures.cpuPressure >= 70 ||
    pressures.memoryPressure >= 75 ||
    pressures.limiterPressure >= 70
  ) {
    return "degraded";
  }
  return "healthy";
};

const getHealthReasons = (
  metrics: SuperAdminSystemHealth,
  pressures: { cpuPressure: number; memoryPressure: number; limiterPressure: number },
) => {
  const reasons: string[] = [];
  const errorRate = Number(metrics.requests.last5m.errorRatePct || 0);
  const latency = Number(metrics.requests.last5m.p95LatencyMs || 0);

  if (metrics.dependencies.firestore.status === "unavailable") {
    reasons.push("Firestore is unavailable");
  } else if (metrics.dependencies.firestore.status === "degraded") {
    reasons.push(
      metrics.dependencies.firestore.error || "Some database metrics are unavailable",
    );
  }
  if (errorRate >= 2) reasons.push(`5-minute error rate is ${formatNumber(errorRate)}%`);
  if (latency >= 1000) reasons.push(`P95 latency is ${formatNumber(latency, 0)} ms`);
  if (pressures.cpuPressure >= 70) {
    reasons.push(`CPU pressure is ${formatNumber(pressures.cpuPressure)}%`);
  }
  if (pressures.memoryPressure >= 75) {
    reasons.push(`Memory pressure is ${formatNumber(pressures.memoryPressure)}%`);
  }
  if (pressures.limiterPressure >= 70) {
    reasons.push(`Rate-limit pressure is ${formatNumber(pressures.limiterPressure)}%`);
  }
  return reasons;
};

const SystemHealth: React.FC = () => {
  const [metrics, setMetrics] = useState<SuperAdminSystemHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadMetrics = async (options?: { silent?: boolean }) => {
    const silent = Boolean(options?.silent);
    if (!silent) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const response = await getSuperAdminSystemHealth();
      setMetrics(response);
      setLastUpdated(
        response?.generatedAt ? new Date(response.generatedAt) : new Date(),
      );
    } catch (error: any) {
      console.error("Failed to load system health", error);
      showToast(error?.message || "Failed to load system health metrics.", {
        type: "error",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadMetrics();
    const timer = window.setInterval(() => {
      void loadMetrics({ silent: true });
    }, AUTO_REFRESH_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const derived = useMemo(() => {
    if (!metrics) {
      return {
        cpuPressure: 0,
        memoryPressure: 0,
        limiterPressure: 0,
      };
    }

    const heapUsed = Number(metrics.runtime.memoryMb.heapUsed || 0);
    const heapLimit = Number(
      metrics.runtime.memoryMb.heapLimit || metrics.runtime.memoryMb.heapTotal || 0,
    );
    const memoryPressure =
      heapLimit > 0 ? (heapUsed / Math.max(1, heapLimit)) * 100 : 0;
    const cpuPressure = Number(metrics.runtime.normalizedLoadPct.oneMinute || 0);
    const estimated15MinCalls = Number(metrics.requests.last5m.requestsPerMinute) * 15;
    const limiterPressure =
      (estimated15MinCalls / Math.max(1, Number(metrics.limiters.api.limit))) * 100;

    return {
      cpuPressure: Math.max(0, cpuPressure),
      memoryPressure: Math.max(0, memoryPressure),
      limiterPressure: Math.max(0, limiterPressure),
    };
  }, [metrics]);

  const overallHealth = metrics ? getOverallHealth(metrics, derived) : null;
  const healthReasons = metrics ? getHealthReasons(metrics, derived) : [];
  const healthPresentation = {
    healthy: {
      label: "All systems healthy",
      description: "The API, database, and current server resources are operating normally.",
      className: "border-emerald-200 bg-emerald-50 text-emerald-900",
      dotClassName: "bg-emerald-500",
    },
    degraded: {
      label: "Performance degraded",
      description: "One or more metrics are above their warning threshold. Monitor the pressure panels below.",
      className: "border-amber-200 bg-amber-50 text-amber-900",
      dotClassName: "bg-amber-500",
    },
    critical: {
      label: "Attention required",
      description: "A dependency is unavailable or a critical performance threshold has been reached.",
      className: "border-rose-200 bg-rose-50 text-rose-900",
      dotClassName: "bg-rose-500",
    },
  } as const;

  return (
    <Layout title="System Health">
      <div className="max-w-6xl mx-auto space-y-6">
        <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                System Pressure & Load
              </h1>
              <p className="text-slate-600 mt-1">
                Live backend load, request pressure, and runtime health for the
                platform.
              </p>
              <p className="text-xs text-slate-500 mt-2">
                Auto-refresh every {Math.round(AUTO_REFRESH_MS / 1000)} seconds
                {lastUpdated
                  ? ` | Last updated ${lastUpdated.toLocaleString()}`
                  : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadMetrics()}
              disabled={loading || refreshing}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <RefreshCw
                size={16}
                className={loading || refreshing ? "animate-spin" : ""}
              />
              Refresh now
            </button>
          </div>
        </section>

        {!metrics ? (
          <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm text-slate-600">
            {loading ? "Loading system metrics..." : "No system metrics available."}
          </section>
        ) : (
          <>
            {overallHealth ? (
              <section
                className={`rounded-2xl border p-5 shadow-sm ${healthPresentation[overallHealth].className}`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${healthPresentation[overallHealth].dotClassName}`}
                  />
                  <div>
                    <h2 className="text-lg font-semibold">
                      {healthPresentation[overallHealth].label}
                    </h2>
                    <p className="mt-1 text-sm opacity-80">
                      {healthPresentation[overallHealth].description}
                    </p>
                    {healthReasons.length > 0 ? (
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm font-medium">
                        {healthReasons.map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </div>
              </section>
            ) : null}

            <section
              className={`rounded-2xl border p-6 shadow-sm ${opsStatusTone[metrics.ops.status].className}`}
            >
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex gap-4">
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-sm ${opsStatusTone[metrics.ops.status].iconClassName}`}
                  >
                    <Bot size={24} />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-bold">Ops Agent</h2>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide ring-1 ${opsStatusTone[metrics.ops.status].badgeClassName}`}
                      >
                        {metrics.ops.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-semibold opacity-90">
                      {metrics.ops.headline}
                    </p>
                    <p className="mt-2 max-w-3xl text-sm leading-6 opacity-80">
                      {metrics.ops.summary}
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl bg-white/60 p-4 text-sm shadow-sm ring-1 ring-black/5 lg:w-80">
                  <div className="flex items-center gap-2 font-semibold">
                    <ListChecks size={17} />
                    Recommended next steps
                  </div>
                  <ul className="mt-3 space-y-2">
                    {metrics.ops.recommendations.map((recommendation) => (
                      <li key={recommendation} className="flex gap-2 leading-5">
                        <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
                        <span>{recommendation}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
                {metrics.ops.findings.map((finding) => (
                  <div
                    key={`${finding.severity}-${finding.title}`}
                    className={`rounded-2xl border p-4 ${findingTone[finding.severity].className}`}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${findingTone[finding.severity].dotClassName}`}
                      />
                      <div>
                        <p className="font-semibold">{finding.title}</p>
                        <p className="mt-1 text-sm leading-5 opacity-80">
                          {finding.detail}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-600">
                    Active Requests
                  </p>
                  <Activity size={18} className="text-[#0B4A82]" />
                </div>
                <p className="mt-3 text-3xl font-bold text-slate-900">
                  {formatCompact(metrics.requests.active)}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  Current in-flight requests
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-600">
                    Throughput (1m)
                  </p>
                  <Gauge size={18} className="text-[#0B4A82]" />
                </div>
                <p className="mt-3 text-3xl font-bold text-slate-900">
                  {formatNumber(metrics.requests.last1m.requestsPerMinute, 0)}
                </p>
                <p className="mt-2 text-xs text-slate-500">Requests per minute</p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-600">
                    Error Rate (5m)
                  </p>
                  <AlertTriangle size={18} className="text-[#0B4A82]" />
                </div>
                <p
                  className={`mt-3 text-3xl font-bold ${textTone(metrics.requests.last5m.errorRatePct)}`}
                >
                  {formatNumber(metrics.requests.last5m.errorRatePct)}%
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  Client + server response errors
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-600">
                    P95 Latency (5m)
                  </p>
                  <Clock3 size={18} className="text-[#0B4A82]" />
                </div>
                <p className="mt-3 text-3xl font-bold text-slate-900">
                  {formatNumber(metrics.requests.last5m.p95LatencyMs)} ms
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  95th percentile response time
                </p>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Database size={18} className="text-[#0B4A82]" />
                    <h2 className="text-lg font-semibold text-slate-900">
                      Platform Scale
                    </h2>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    Current database volume across every school.
                  </p>
                </div>
                <div className="text-xs text-slate-500">
                  Firestore:{" "}
                  <span
                    className={
                      metrics.dependencies.firestore.status === "healthy"
                        ? "font-semibold text-emerald-700"
                        : "font-semibold text-rose-700"
                    }
                  >
                    {metrics.dependencies.firestore.status}
                  </span>
                  {metrics.dependencies.firestore.latencyMs !== null
                    ? ` · ${metrics.dependencies.firestore.latencyMs} ms`
                    : ""}
                  {metrics.platform.cached ? " · cached" : ""}
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                {[
                  {
                    label: "Schools",
                    value: metrics.platform.totals.schools,
                    detail: `${formatCompact(metrics.platform.totals.activeSchools)} active`,
                    icon: <GraduationCap size={17} />,
                  },
                  {
                    label: "Students",
                    value: metrics.platform.totals.students,
                    detail: "All schools",
                    icon: <Users size={17} />,
                  },
                  {
                    label: "Teachers",
                    value: metrics.platform.totals.teachers,
                    detail: `${formatCompact(metrics.platform.totals.schoolAdmins)} admins`,
                    icon: <Users size={17} />,
                  },
                  {
                    label: "Platform Users",
                    value: metrics.platform.totals.users,
                    detail: `${formatCompact(metrics.platform.totals.parents)} parents`,
                    icon: <Users size={17} />,
                  },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl bg-slate-50 p-4">
                    <div className="flex items-center justify-between text-slate-500">
                      <p className="text-sm">{item.label}</p>
                      {item.icon}
                    </div>
                    <p className="mt-2 text-2xl font-bold text-slate-900">
                      {formatCompact(item.value)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{item.detail}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
                <div className="flex items-center gap-2">
                  <Server size={18} className="text-[#0B4A82]" />
                  <h2 className="text-lg font-semibold text-slate-900">
                    Runtime
                  </h2>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-slate-500">Environment</p>
                    <p className="font-semibold text-slate-900">
                      {metrics.runtime.environment}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-slate-500">Uptime</p>
                    <p className="font-semibold text-slate-900">
                      {formatUptime(metrics.runtime.uptimeSeconds)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-slate-500">Node</p>
                    <p className="font-semibold text-slate-900">
                      {metrics.runtime.nodeVersion}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-slate-500">Process</p>
                    <p className="font-semibold text-slate-900">
                      PID {metrics.runtime.pid}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
                <div className="flex items-center gap-2">
                  <Cpu size={18} className="text-[#0B4A82]" />
                  <h2 className="text-lg font-semibold text-slate-900">
                    Pressure Meters
                  </h2>
                </div>

                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between text-sm">
                      <p className="text-slate-600">CPU load (1m)</p>
                      <p className={`font-semibold ${textTone(derived.cpuPressure)}`}>
                        {formatNumber(derived.cpuPressure)}%
                      </p>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${progressTone(derived.cpuPressure)}`}
                        style={{ width: `${Math.min(100, derived.cpuPressure)}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-sm">
                      <p className="text-slate-600">Heap limit usage</p>
                      <p className={`font-semibold ${textTone(derived.memoryPressure)}`}>
                        {formatNumber(derived.memoryPressure)}%
                      </p>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${progressTone(derived.memoryPressure)}`}
                        style={{ width: `${Math.min(100, derived.memoryPressure)}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-sm">
                      <p className="text-slate-600">API limiter pressure (est.)</p>
                      <p className={`font-semibold ${textTone(derived.limiterPressure)}`}>
                        {formatNumber(Math.min(derived.limiterPressure, 999))}%
                      </p>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${progressTone(derived.limiterPressure)}`}
                        style={{ width: `${Math.min(100, derived.limiterPressure)}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-slate-500">Load average (1/5/15)</p>
                    <p className="font-semibold text-slate-900">
                      {formatNumber(metrics.runtime.loadAverage[0] || 0)} /{" "}
                      {formatNumber(metrics.runtime.loadAverage[1] || 0)} /{" "}
                      {formatNumber(metrics.runtime.loadAverage[2] || 0)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-slate-500">CPU cores</p>
                    <p className="font-semibold text-slate-900">
                      {metrics.runtime.cpuCores}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-slate-500">Heap used</p>
                    <p className="font-semibold text-slate-900">
                      {formatNumber(metrics.runtime.memoryMb.heapUsed)} MB
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-slate-500">Heap limit</p>
                    <p className="font-semibold text-slate-900">
                      {formatNumber(
                        metrics.runtime.memoryMb.heapLimit ||
                          metrics.runtime.memoryMb.heapTotal,
                      )} MB
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-slate-500">RSS</p>
                    <p className="font-semibold text-slate-900">
                      {formatNumber(metrics.runtime.memoryMb.rss)} MB
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle size={18} className="text-[#0B4A82]" />
                <h2 className="text-lg font-semibold text-slate-900">
                  Problem Routes ({formatWindow(5 * 60 * 1000)})
                </h2>
              </div>
              {metrics.requests.problemRoutes.length === 0 ? (
                <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
                  No recent 4xx, 5xx, 429, or aborted requests detected.
                </p>
              ) : (
                <>
                  <div className="sm:hidden space-y-3">
                    {metrics.requests.problemRoutes.map((route) => (
                      <div
                        key={route.route}
                        className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                      >
                        <p className="text-xs uppercase tracking-wide text-slate-500">
                          Route
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-900 break-all leading-5">
                          {route.route}
                        </p>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded-lg bg-white p-2">
                            <p className="text-slate-500">Errors</p>
                            <p className="font-semibold text-slate-900">
                              {route.errors}
                            </p>
                          </div>
                          <div className="rounded-lg bg-white p-2">
                            <p className="text-slate-500">5xx</p>
                            <p className="font-semibold text-slate-900">
                              {route.serverErrors}
                            </p>
                          </div>
                          <div className="rounded-lg bg-white p-2">
                            <p className="text-slate-500">429</p>
                            <p className="font-semibold text-slate-900">
                              {route.rateLimited}
                            </p>
                          </div>
                          <div className="rounded-lg bg-white p-2">
                            <p className="text-slate-500">Last</p>
                            <p className="font-semibold text-slate-900">
                              {route.lastStatusCode} · {formatRelativeTime(route.lastSeenAt)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full min-w-[760px] text-sm">
                      <thead className="text-left text-slate-500 border-b border-slate-100">
                        <tr>
                          <th className="py-2 pr-3">Route</th>
                          <th className="py-2 pr-3">Req</th>
                          <th className="py-2 pr-3">Errors</th>
                          <th className="py-2 pr-3">5xx</th>
                          <th className="py-2 pr-3">429</th>
                          <th className="py-2 pr-3">Aborted</th>
                          <th className="py-2 pr-3">Error %</th>
                          <th className="py-2 pr-3">Last</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {metrics.requests.problemRoutes.map((route) => (
                          <tr key={route.route}>
                            <td className="py-3 pr-3 font-medium text-slate-900 break-all leading-5">
                              {route.route}
                            </td>
                            <td className="py-3 pr-3 text-slate-700">
                              {route.requests}
                            </td>
                            <td className="py-3 pr-3 text-slate-700">
                              {route.errors}
                            </td>
                            <td className="py-3 pr-3 text-slate-700">
                              {route.serverErrors}
                            </td>
                            <td className="py-3 pr-3 text-slate-700">
                              {route.rateLimited}
                            </td>
                            <td className="py-3 pr-3 text-slate-700">
                              {route.aborted}
                            </td>
                            <td className="py-3 pr-3 text-slate-700">
                              {formatNumber(route.errorRatePct)}%
                            </td>
                            <td className="py-3 pr-3 text-slate-700">
                              {route.lastStatusCode} · {formatRelativeTime(route.lastSeenAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>

            <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <div className="xl:col-span-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <HardDrive size={18} className="text-[#0B4A82]" />
                  <h2 className="text-lg font-semibold text-slate-900">
                    Slowest Routes ({formatWindow(5 * 60 * 1000)})
                  </h2>
                </div>
                {metrics.requests.topSlowRoutes.length === 0 ? (
                  <p className="py-2 text-sm text-slate-500">
                    Not enough recent traffic to rank routes.
                  </p>
                ) : (
                  <>
                    <div className="sm:hidden space-y-3">
                      {metrics.requests.topSlowRoutes.map((route) => (
                        <div
                          key={route.route}
                          className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                        >
                          <p className="text-xs uppercase tracking-wide text-slate-500">
                            Route
                          </p>
                          <p className="mt-1 text-sm font-semibold text-slate-900 break-all leading-5">
                            {route.route}
                          </p>
                          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                            <div className="rounded-lg bg-white p-2">
                              <p className="text-slate-500">Req</p>
                              <p className="font-semibold text-slate-900">
                                {route.requests}
                              </p>
                            </div>
                            <div className="rounded-lg bg-white p-2">
                              <p className="text-slate-500">Err</p>
                              <p className="font-semibold text-slate-900">
                                {formatNumber(route.errorRatePct)}%
                              </p>
                            </div>
                            <div className="rounded-lg bg-white p-2">
                              <p className="text-slate-500">Avg</p>
                              <p className="font-semibold text-slate-900">
                                {formatNumber(route.avgLatencyMs)} ms
                              </p>
                            </div>
                            <div className="rounded-lg bg-white p-2">
                              <p className="text-slate-500">P95</p>
                              <p className="font-semibold text-slate-900">
                                {formatNumber(route.p95LatencyMs)} ms
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="hidden sm:block overflow-x-auto">
                      <table className="w-full min-w-[640px] text-sm">
                        <thead className="text-left text-slate-500 border-b border-slate-100">
                          <tr>
                            <th className="py-2 pr-3">Route</th>
                            <th className="py-2 pr-3">Req</th>
                            <th className="py-2 pr-3">Avg</th>
                            <th className="py-2 pr-3">P95</th>
                            <th className="py-2 pr-3">Err</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {metrics.requests.topSlowRoutes.map((route) => (
                            <tr key={route.route}>
                              <td className="py-3 pr-3 font-medium text-slate-900 break-all leading-5">
                                {route.route}
                              </td>
                              <td className="py-3 pr-3 text-slate-700">
                                {route.requests}
                              </td>
                              <td className="py-3 pr-3 text-slate-700">
                                {formatNumber(route.avgLatencyMs)} ms
                              </td>
                              <td className="py-3 pr-3 text-slate-700">
                                {formatNumber(route.p95LatencyMs)} ms
                              </td>
                              <td className="py-3 pr-3 text-slate-700">
                                {formatNumber(route.errorRatePct)}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={18} className="text-[#0B4A82]" />
                  <h2 className="text-lg font-semibold text-slate-900">
                    Response Mix (5m)
                  </h2>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">2xx Success</span>
                    <span className="font-semibold text-slate-900">
                      {metrics.requests.last5m.statusBuckets.success2xx}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">3xx Redirect</span>
                    <span className="font-semibold text-slate-900">
                      {metrics.requests.last5m.statusBuckets.redirect3xx}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">4xx Client Errors</span>
                    <span className="font-semibold text-slate-900">
                      {metrics.requests.last5m.statusBuckets.client4xx}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">5xx Server Errors</span>
                    <span className="font-semibold text-slate-900">
                      {metrics.requests.last5m.statusBuckets.server5xx}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">429 Rate Limited</span>
                    <span className="font-semibold text-slate-900">
                      {metrics.requests.last5m.statusBuckets.rateLimited429}
                    </span>
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                  <p className="font-semibold text-slate-700">
                    Active limits ({formatWindow(metrics.limiters.api.windowMs)})
                  </p>
                  <p className="mt-1">
                    API: {metrics.limiters.api.limit} requests/IP
                  </p>
                  <p>Auth: {metrics.limiters.auth.limit} requests/IP</p>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </Layout>
  );
};

export default SystemHealth;
