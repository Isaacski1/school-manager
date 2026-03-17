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
  RefreshCw,
  Server,
  ShieldCheck,
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
    const heapTotal = Number(metrics.runtime.memoryMb.heapTotal || 0);
    const memoryPressure =
      heapTotal > 0 ? (heapUsed / Math.max(1, heapTotal)) * 100 : 0;
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
                      <p className="text-slate-600">Heap memory usage</p>
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
                    <p className="text-slate-500">RSS</p>
                    <p className="font-semibold text-slate-900">
                      {formatNumber(metrics.runtime.memoryMb.rss)} MB
                    </p>
                  </div>
                </div>
              </div>
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
