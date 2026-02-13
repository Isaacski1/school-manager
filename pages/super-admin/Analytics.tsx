import React, { useEffect, useMemo, useState } from "react";
import Layout from "../../components/Layout";
import { showToast } from "../../services/toast";
import { firestore } from "../../services/firebase";
import {
  collection,
  getDocs,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore";
import { School } from "../../types";
import {
  Activity,
  BarChart3,
  CalendarRange,
  TrendingUp,
  Wallet,
} from "lucide-react";

type AnalyticsEvent = {
  id: string;
  schoolId?: string | null;
  actionType?: string;
  userRole?: string | null;
  createdAt?: Timestamp | number | string;
};

type ActivityLog = {
  id: string;
  schoolId?: string | null;
  eventType?: string;
  createdAt?: Timestamp | number | string;
};

type PaymentRecord = {
  id: string;
  amount?: number;
  status?: string;
  createdAt?: Timestamp | number | string;
  schoolId?: string;
};

const formatMonth = (date: Date) =>
  date.toLocaleDateString("en-US", { month: "short", year: "numeric" });

const normalizeDate = (value: any): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value?.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const buildMonthSeries = (months: number) => {
  const series: { key: string; label: string; date: Date }[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    series.push({ key, label: formatMonth(d), date: d });
  }
  return series;
};

const Analytics = () => {
  const [loading, setLoading] = useState(false);
  const [schools, setSchools] = useState<School[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [studentCounts, setStudentCounts] = useState<Record<string, number>>(
    {},
  );

  const loadData = async () => {
    setLoading(true);
    try {
      const [schoolSnap, paymentSnap, eventsSnap, activitySnap, studentsSnap] =
        await Promise.all([
          getDocs(
            query(
              collection(firestore, "schools"),
              orderBy("createdAt", "desc"),
            ),
          ),
          getDocs(
            query(
              collection(firestore, "payments"),
              orderBy("createdAt", "desc"),
            ),
          ),
          getDocs(
            query(
              collection(firestore, "analyticsEvents"),
              orderBy("createdAt", "desc"),
            ),
          ),
          getDocs(
            query(
              collection(firestore, "activity_logs"),
              orderBy("createdAt", "desc"),
            ),
          ),
          getDocs(collection(firestore, "students")),
        ]);

      setSchools(
        schoolSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) })),
      );
      setPayments(
        paymentSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) })),
      );
      setEvents(
        eventsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) })),
      );
      setActivityLogs(
        activitySnap.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as any),
        })),
      );
      const counts: Record<string, number> = {};
      studentsSnap.docs.forEach((doc) => {
        const data = doc.data() as any;
        if (!data.schoolId) return;
        counts[data.schoolId] = (counts[data.schoolId] || 0) + 1;
      });
      setStudentCounts(counts);
    } catch (err: any) {
      console.error("Failed to load analytics", err);
      showToast(err?.message || "Failed to load analytics.", { type: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const months = useMemo(() => buildMonthSeries(12), []);

  const growthSeries = useMemo(() => {
    const counts: Record<string, number> = Object.fromEntries(
      months.map((m) => [m.key, 0]),
    );
    schools.forEach((school) => {
      const created = normalizeDate((school as any).createdAt);
      if (!created) return;
      const key = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, "0")}`;
      if (counts[key] !== undefined) counts[key] += 1;
    });
    return months.map((m) => ({ label: m.label, value: counts[m.key] || 0 }));
  }, [months, schools]);

  const totalSchools = schools.length;
  const newSchoolsThisMonth = useMemo(() => {
    const now = new Date();
    return schools.filter((s) => {
      const created = normalizeDate((s as any).createdAt);
      return (
        created &&
        created.getFullYear() === now.getFullYear() &&
        created.getMonth() === now.getMonth()
      );
    }).length;
  }, [schools]);

  const newSchoolsLastMonth = useMemo(() => {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return schools.filter((s) => {
      const created = normalizeDate((s as any).createdAt);
      return (
        created &&
        created.getFullYear() === lastMonth.getFullYear() &&
        created.getMonth() === lastMonth.getMonth()
      );
    }).length;
  }, [schools]);

  const growthRate =
    newSchoolsLastMonth === 0
      ? 100
      : Math.round(
          ((newSchoolsThisMonth - newSchoolsLastMonth) / newSchoolsLastMonth) *
            100,
        );

  const revenueSeries = useMemo(() => {
    const totals: Record<string, number> = Object.fromEntries(
      months.map((m) => [m.key, 0]),
    );
    payments.forEach((payment) => {
      if (String(payment.status || "").toLowerCase() !== "success") return;
      const created = normalizeDate(payment.createdAt);
      if (!created) return;
      const key = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, "0")}`;
      if (totals[key] !== undefined) {
        const amountRaw = payment.amount || 0;
        totals[key] += amountRaw >= 100 ? amountRaw / 100 : amountRaw;
      }
    });
    return months.map((m) => ({ label: m.label, value: totals[m.key] || 0 }));
  }, [months, payments]);

  const revenueTotals = useMemo(() => {
    let total = 0;
    let active = 0;
    let expired = 0;
    payments.forEach((payment) => {
      const status = String(payment.status || "").toLowerCase();
      if (status === "success") {
        const amountRaw = payment.amount || 0;
        total += amountRaw >= 100 ? amountRaw / 100 : amountRaw;
        active += 1;
      }
      if (status === "failed" || status === "past_due") expired += 1;
    });
    return { total, active, expired };
  }, [payments]);

  const activityBySchool = useMemo(() => {
    const counts: Record<string, { count: number; last: Date | null }> = {};
    const source = events.length ? events : activityLogs;
    source.forEach((event) => {
      if (!event.schoolId) return;
      const key = event.schoolId;
      const created = normalizeDate(event.createdAt);
      if (!counts[key]) counts[key] = { count: 0, last: null };
      counts[key].count += 1;
      if (created) {
        if (!counts[key].last || created > (counts[key].last as Date)) {
          counts[key].last = created;
        }
      }
    });
    return counts;
  }, [events, activityLogs]);

  const topActiveSchools = useMemo(() => {
    return schools
      .map((s) => {
        const activity = activityBySchool[s.id] || { count: 0, last: null };
        return {
          ...s,
          activityScore: activity.count,
          lastActive: activity.last,
        };
      })
      .sort((a, b) => (b as any).activityScore - (a as any).activityScore)
      .slice(0, 10);
  }, [schools, activityBySchool]);

  const lowActivitySchools = useMemo(() => {
    const now = Date.now();
    return schools
      .map((s) => {
        const activity = activityBySchool[s.id] || { count: 0, last: null };
        const lastActive = activity.last;
        const daysInactive = lastActive
          ? Math.floor((now - lastActive.getTime()) / (1000 * 60 * 60 * 24))
          : null;
        return { ...s, lastActive, daysInactive };
      })
      .filter((s) => s.daysInactive === null || s.daysInactive >= 7)
      .sort((a, b) => {
        const aValue = a.daysInactive ?? Number.POSITIVE_INFINITY;
        const bValue = b.daysInactive ?? Number.POSITIVE_INFINITY;
        return bValue - aValue;
      })
      .slice(0, 10);
  }, [schools, activityBySchool]);

  const featureUsage = useMemo(() => {
    const counts: Record<string, number> = {};
    events.forEach((event) => {
      if (!event.actionType) return;
      counts[event.actionType] = (counts[event.actionType] || 0) + 1;
    });
    const entries = Object.entries(counts).map(([key, value]) => ({
      key,
      value,
    }));
    entries.sort((a, b) => b.value - a.value);
    return entries;
  }, [events]);

  const mostUsed = featureUsage[0];
  const leastUsed = featureUsage[featureUsage.length - 1];

  return (
    <Layout title="Analytics & Reports">
      <div className="space-y-8">
        <div className="relative overflow-hidden rounded-3xl border border-slate-900/10 bg-gradient-to-br from-[#0B4A82] via-[#0B4A82] to-[#0F172A] p-6 shadow-lg">
          <div className="absolute -top-24 -right-20 h-48 w-48 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-24 -left-16 h-48 w-48 rounded-full bg-[#1E293B]/50 blur-3xl" />
          <div className="relative">
            <h1 className="text-2xl md:text-3xl font-bold text-slate-100">
              Platform Analytics & Reports
            </h1>
            <p className="text-sm text-slate-100 mt-2">
              Insights across all schools on the platform.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-400">
            Loading analytics…
          </div>
        ) : (
          <>
            <section className="bg-gradient-to-br from-[#0B4A82]/15 via-white to-[#0F172A]/5 rounded-3xl border border-slate-900/10 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2 text-slate-800 font-semibold">
                  <TrendingUp size={18} /> Growth
                </div>
                <span className="text-xs text-slate-500">Last 12 months</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="p-4 rounded-2xl bg-cyan-700">
                  <p className="text-xs uppercase text-slate-100">
                    Total schools
                  </p>
                  <p className="text-2xl font-bold text-slate-100">
                    {totalSchools}
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-green-700">
                  <p className="text-xs uppercase text-slate-100">
                    New this month
                  </p>
                  <p className="text-2xl font-bold text-emerald-100">
                    {newSchoolsThisMonth}
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-yellow-300">
                  <p className="text-xs uppercase text-slate-600">
                    New last month
                  </p>
                  <p className="text-2xl font-bold text-emerald-700">
                    {newSchoolsLastMonth}
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-amber-600">
                  <p className="text-xs uppercase text-slate-100">
                    Growth rate
                  </p>
                  <p className="text-2xl font-bold text-slate-100">
                    {growthRate}%
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-12 gap-2 items-end h-40">
                {growthSeries.map((point) => (
                  <div
                    key={point.label}
                    className="col-span-1 flex flex-col items-center"
                  >
                    <div
                      className="w-4 rounded-full bg-gradient-to-t from-[#0B4A82] to-[#1E3A8A]"
                      style={{ height: `${Math.max(6, point.value * 6)}px` }}
                    ></div>
                    <span className="text-[10px] text-slate-400 mt-2">
                      {point.label}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="bg-gradient-to-br from-[#0F172A]/5 via-white to-emerald-200/40 rounded-3xl border border-slate-900/10 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2 text-slate-800 font-semibold">
                  <Wallet size={18} /> Revenue
                </div>
                <span className="text-xs text-slate-500">Success payments</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="p-4 rounded-2xl bg-green-600">
                  <p className="text-xs uppercase text-slate-100">
                    Total revenue
                  </p>
                  <p className="text-2xl font-bold text-emerald-100">
                    GHS {revenueTotals.total.toFixed(2)}
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-blue-600">
                  <p className="text-xs uppercase text-slate-100">
                    Active subs
                  </p>
                  <p className="text-2xl font-bold text-sky-100">
                    {revenueTotals.active}
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-red-700">
                  <p className="text-xs uppercase text-slate-100">
                    Expired subs
                  </p>
                  <p className="text-2xl font-bold text-rose-100">
                    {revenueTotals.expired}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-12 gap-2 items-end h-40">
                {revenueSeries.map((point) => (
                  <div
                    key={point.label}
                    className="col-span-1 flex flex-col items-center"
                  >
                    <div
                      className="w-4 rounded-full bg-gradient-to-t from-emerald-700 to-emerald-400"
                      style={{ height: `${Math.max(6, point.value * 2)}px` }}
                    ></div>
                    <span className="text-[10px] text-slate-400 mt-2">
                      {point.label}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-red-900 rounded-3xl border border-slate-200 p-6 shadow-[0_20px_40px_-30px_rgba(2,6,23,0.9)]">
                <div className="flex items-center gap-2 text-slate-100 font-semibold mb-4">
                  <Activity size={18} /> Most Active Schools
                </div>
                <div className="space-y-3">
                  {topActiveSchools.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between border-b border-slate-200 pb-2"
                    >
                      <div>
                        <p className="font-semibold text-slate-100">{s.name}</p>
                        <p className="text-xs text-slate-300">
                          Students:{" "}
                          {studentCounts[s.id] ?? s.studentsCount ?? "—"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-cyan-100">
                          {(s as any).activityScore}
                        </p>
                        <p className="text-xs text-slate-100">
                          {(s as any).lastActive
                            ? formatMonth((s as any).lastActive)
                            : "—"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-blue-900 rounded-3xl border border-slate-200 p-6 shadow-[0_20px_40px_-30px_rgba(2,6,23,0.9)]">
                <div className="flex items-center gap-2 text-slate-100 font-semibold mb-4">
                  <CalendarRange size={18} /> Low Activity Schools
                </div>
                <div className="space-y-3">
                  {lowActivitySchools.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between border-b border-slate-200 pb-2"
                    >
                      <div>
                        <p className="font-semibold text-slate-100">{s.name}</p>
                        <p className="text-xs text-slate-200">
                          Plan: {s.plan || "—"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-rose-300">
                          {s.daysInactive === null
                            ? "No activity yet"
                            : `${s.daysInactive} days`}
                        </p>
                        <p className="text-xs text-slate-100">
                          {s.lastActive ? formatMonth(s.lastActive) : "—"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="bg-green-600 rounded-3xl border border-slate-200 p-6 shadow-[0_20px_40px_-30px_rgba(2,6,23,0.9)]">
              <div className="flex items-center gap-2 text-slate-100 font-semibold mb-4">
                <BarChart3 size={18} /> Feature Usage
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="p-4 rounded-2xl bg-slate-100">
                  <p className="text-xs uppercase text-slate-500">Most used</p>
                  <p className="text-lg font-semibold text-slate-900">
                    {mostUsed?.key || "—"}
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-slate-100">
                  <p className="text-xs uppercase text-slate-500">Least used</p>
                  <p className="text-lg font-semibold text-slate-900">
                    {leastUsed?.key || "—"}
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-slate-100">
                  <p className="text-xs uppercase text-slate-500">
                    Total events
                  </p>
                  <p className="text-lg font-semibold text-slate-900">
                    {events.length}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {featureUsage.map((item) => (
                  <div
                    key={item.key}
                    className="p-3 rounded-2xl border border-slate-200 bg-slate-100"
                  >
                    <p className="text-xs text-slate-500">{item.key}</p>
                    <p className="text-lg font-semibold text-slate-900">
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </Layout>
  );
};

export default Analytics;
