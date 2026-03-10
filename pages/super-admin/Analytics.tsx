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
  Building2,
  CalendarRange,
  CircleAlert,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Users,
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

type SeriesPoint = {
  label: string;
  value: number;
};

const formatMonth = (date: Date) =>
  date.toLocaleDateString("en-US", { month: "short", year: "numeric" });

const normalizeDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }
  const parsed = new Date(value as string | number);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const buildMonthSeries = (count: number) => {
  const items: { key: string; label: string }[] = [];
  const now = new Date();
  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    items.push({
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      label: formatMonth(date),
    });
  }
  return items;
};

const normalizeAmount = (value?: number) => {
  const amount = value || 0;
  return amount >= 100 ? amount / 100 : amount;
};

const formatCurrency = (value: number) =>
  `GHS ${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const compact = (value: number) =>
  new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value);

const labelize = (value?: string | null) =>
  value
    ? value
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\b\w/g, (part) => part.toUpperCase())
    : "Unspecified";

const shortDate = (value: Date | null) =>
  value
    ? value.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "-";

const relativeDate = (value: Date | null) => {
  if (!value) return "No activity yet";
  const days = Math.floor((Date.now() - value.getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Updated today";
  if (days === 1) return "Updated 1 day ago";
  if (days < 30) return `Updated ${days} days ago`;
  const months = Math.floor(days / 30);
  return `Updated ${months} month${months === 1 ? "" : "s"} ago`;
};

const panelShell =
  "relative overflow-hidden rounded-[32px] border border-slate-200/80 bg-white/88 p-5 shadow-[0_28px_70px_-42px_rgba(15,23,42,0.28)] backdrop-blur-sm sm:p-6";

const Analytics = () => {
  const [loading, setLoading] = useState(false);
  const [schools, setSchools] = useState<School[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [studentCounts, setStudentCounts] = useState<Record<string, number>>({});
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [schoolSnap, paymentSnap, eventsSnap, activitySnap, studentsSnap] =
        await Promise.all([
          getDocs(
            query(collection(firestore, "schools"), orderBy("createdAt", "desc")),
          ),
          getDocs(
            query(collection(firestore, "payments"), orderBy("createdAt", "desc")),
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
        schoolSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as School) })),
      );
      setPayments(
        paymentSnap.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as PaymentRecord),
        })),
      );
      setEvents(
        eventsSnap.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as AnalyticsEvent),
        })),
      );
      setActivityLogs(
        activitySnap.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as ActivityLog),
        })),
      );

      const counts: Record<string, number> = {};
      studentsSnap.docs.forEach((doc) => {
        const data = doc.data() as { schoolId?: string | null };
        if (!data.schoolId) return;
        counts[data.schoolId] = (counts[data.schoolId] || 0) + 1;
      });
      setStudentCounts(counts);
      setLastLoadedAt(new Date());
    } catch (error: any) {
      console.error("Failed to load analytics", error);
      showToast(error?.message || "Failed to load analytics.", { type: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const months = useMemo(() => buildMonthSeries(12), []);
  const activityFeed = useMemo(
    () => (events.length ? events : activityLogs),
    [events, activityLogs],
  );

  const growthSeries = useMemo<SeriesPoint[]>(() => {
    const counts: Record<string, number> = Object.fromEntries(
      months.map((month) => [month.key, 0]),
    );
    schools.forEach((school) => {
      const created = normalizeDate(
        (school as unknown as { createdAt?: unknown }).createdAt,
      );
      if (!created) return;
      const key = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, "0")}`;
      if (counts[key] !== undefined) counts[key] += 1;
    });
    return months.map((month) => ({
      label: month.label,
      value: counts[month.key] || 0,
    }));
  }, [months, schools]);

  const revenueSeries = useMemo<SeriesPoint[]>(() => {
    const totals: Record<string, number> = Object.fromEntries(
      months.map((month) => [month.key, 0]),
    );
    payments.forEach((payment) => {
      if (String(payment.status || "").toLowerCase() !== "success") return;
      const created = normalizeDate(payment.createdAt);
      if (!created) return;
      const key = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, "0")}`;
      if (totals[key] !== undefined) totals[key] += normalizeAmount(payment.amount);
    });
    return months.map((month) => ({
      label: month.label,
      value: totals[month.key] || 0,
    }));
  }, [months, payments]);

  const activitySeries = useMemo<SeriesPoint[]>(() => {
    const counts: Record<string, number> = Object.fromEntries(
      months.map((month) => [month.key, 0]),
    );
    activityFeed.forEach((item) => {
      const created = normalizeDate(item.createdAt);
      if (!created) return;
      const key = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, "0")}`;
      if (counts[key] !== undefined) counts[key] += 1;
    });
    return months.map((month) => ({
      label: month.label,
      value: counts[month.key] || 0,
    }));
  }, [activityFeed, months]);

  const revenueTotals = useMemo(() => {
    let total = 0;
    let success = 0;
    let issues = 0;
    payments.forEach((payment) => {
      const status = String(payment.status || "").toLowerCase();
      if (status === "success") {
        total += normalizeAmount(payment.amount);
        success += 1;
      }
      if (status === "failed" || status === "past_due") issues += 1;
    });
    return { total, success, issues };
  }, [payments]);

  const activityBySchool = useMemo(() => {
    const counts: Record<string, { count: number; last: Date | null }> = {};
    activityFeed.forEach((item) => {
      if (!item.schoolId) return;
      const created = normalizeDate(item.createdAt);
      if (!counts[item.schoolId]) counts[item.schoolId] = { count: 0, last: null };
      counts[item.schoolId].count += 1;
      if (created && (!counts[item.schoolId].last || created > counts[item.schoolId].last!)) {
        counts[item.schoolId].last = created;
      }
    });
    return counts;
  }, [activityFeed]);

  const featureUsage = useMemo(() => {
    const counts: Record<string, number> = {};
    if (events.length) {
      events.forEach((event) => {
        const key = event.actionType || event.userRole || "unknown_event";
        counts[key] = (counts[key] || 0) + 1;
      });
    } else {
      activityLogs.forEach((item) => {
        const key = item.eventType || "platform_activity";
        counts[key] = (counts[key] || 0) + 1;
      });
    }
    return Object.entries(counts)
      .map(([key, value]) => ({ key, value }))
      .sort((left, right) => right.value - left.value);
  }, [activityLogs, events]);

  const totalSchools = schools.length;
  const activeSchools = schools.filter((school) => school.status === "active").length;
  const totalStudents = Object.values(studentCounts).reduce((sum, value) => sum + value, 0);
  const avgStudents = totalSchools ? Math.round(totalStudents / totalSchools) : 0;
  const thisMonth = new Date();
  const lastMonth = new Date(thisMonth.getFullYear(), thisMonth.getMonth() - 1, 1);
  const newSchoolsThisMonth = schools.filter((school) => {
    const created = normalizeDate(
      (school as unknown as { createdAt?: unknown }).createdAt,
    );
    return (
      created &&
      created.getFullYear() === thisMonth.getFullYear() &&
      created.getMonth() === thisMonth.getMonth()
    );
  }).length;
  const newSchoolsLastMonth = schools.filter((school) => {
    const created = normalizeDate(
      (school as unknown as { createdAt?: unknown }).createdAt,
    );
    return (
      created &&
      created.getFullYear() === lastMonth.getFullYear() &&
      created.getMonth() === lastMonth.getMonth()
    );
  }).length;
  const growthRate =
    newSchoolsLastMonth === 0
      ? newSchoolsThisMonth === 0
        ? 0
        : 100
      : Math.round(
          ((newSchoolsThisMonth - newSchoolsLastMonth) / newSchoolsLastMonth) * 100,
        );

  const topActiveSchools = schools
    .map((school) => ({
      ...school,
      activityScore: activityBySchool[school.id]?.count || 0,
      lastActive: activityBySchool[school.id]?.last || null,
    }))
    .sort((left, right) => right.activityScore - left.activityScore)
    .slice(0, 6);

  const lowActivitySchools = schools
    .map((school) => {
      const lastActive = activityBySchool[school.id]?.last || null;
      const daysInactive = lastActive
        ? Math.floor((Date.now() - lastActive.getTime()) / (1000 * 60 * 60 * 24))
        : null;
      return { ...school, lastActive, daysInactive };
    })
    .filter((school) => school.daysInactive === null || school.daysInactive >= 7)
    .sort((left, right) => (right.daysInactive ?? 999999) - (left.daysInactive ?? 999999))
    .slice(0, 6);

  const mostUsed = featureUsage[0];
  const leastUsed = featureUsage[featureUsage.length - 1];
  const recentActions = activityFeed.filter((item) => {
    const created = normalizeDate(item.createdAt);
    return created ? created.getTime() >= Date.now() - 30 * 24 * 60 * 60 * 1000 : false;
  }).length;
  const highRiskSchools = lowActivitySchools.filter(
    (school) => school.daysInactive === null || school.daysInactive >= 30,
  ).length;

  const planMix = Object.entries(
    schools.reduce<Record<string, number>>((acc, school) => {
      const key = school.plan || "free";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {}),
  ).sort((left, right) => right[1] - left[1]);

  const metrics = [
    {
      label: "Schools live",
      value: compact(totalSchools),
      detail: `${activeSchools} active schools and ${newSchoolsThisMonth} added this month.`,
      tone: "from-sky-50 via-white to-cyan-50",
      iconTone: "bg-sky-100 text-sky-700",
      icon: <Building2 className="h-5 w-5" />,
    },
    {
      label: "Student footprint",
      value: compact(totalStudents),
      detail: `Average of ${avgStudents} students per school across the platform.`,
      tone: "from-emerald-50 via-white to-teal-50",
      iconTone: "bg-emerald-100 text-emerald-700",
      icon: <Users className="h-5 w-5" />,
    },
    {
      label: "Revenue captured",
      value: formatCurrency(revenueTotals.total),
      detail: `${revenueTotals.success} successful payments and ${revenueTotals.issues} payment issues.`,
      tone: "from-amber-50 via-white to-orange-50",
      iconTone: "bg-amber-100 text-amber-700",
      icon: <Wallet className="h-5 w-5" />,
    },
    {
      label: "Platform activity",
      value: compact(activityFeed.length),
      detail: `${recentActions} actions in the last 30 days. ${labelize(mostUsed?.key)} is leading usage.`,
      tone: "from-slate-100 via-white to-slate-50",
      iconTone: "bg-slate-200 text-slate-700",
      icon: <Activity className="h-5 w-5" />,
    },
  ];

  const renderBars = (
    series: SeriesPoint[],
    barClassName: string,
    titleFormatter: (value: number) => string,
  ) => {
    const maxValue = Math.max(1, ...series.map((item) => item.value));
    return (
      <div className="overflow-x-auto pb-2">
        <div className="grid h-60 min-w-[720px] grid-cols-12 gap-3">
          {series.map((item, index) => {
            const height = item.value <= 0 ? 14 : Math.max(18, (item.value / maxValue) * 100);
            return (
              <div key={item.label} className="flex flex-col items-center gap-2">
                <span className="text-[10px] font-semibold text-slate-500">
                  {compact(item.value)}
                </span>
                <div className="flex h-full w-full items-end justify-center rounded-[20px] bg-slate-100/80 px-1.5 py-2">
                  <div
                    className={`w-full rounded-[16px] ${barClassName} ${index === series.length - 1 ? "ring-2 ring-white/80" : ""}`}
                    style={{ height: `${height}%` }}
                    title={`${item.label}: ${titleFormatter(item.value)}`}
                  />
                </div>
                <span className="text-[10px] text-slate-400">
                  {item.label.split(" ")[0]}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <Layout title="Analytics & Reports">
      <div className="relative isolate space-y-6 pb-8">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[540px] bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.18),transparent_32%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.14),transparent_28%),linear-gradient(180deg,rgba(248,250,252,0.96),rgba(255,255,255,0))]" />

        <section className="relative overflow-hidden rounded-[36px] border border-slate-200/80 bg-[linear-gradient(135deg,#061526_0%,#0b4a82_40%,#0f766e_100%)] px-5 py-6 text-white shadow-[0_28px_80px_-42px_rgba(8,47,73,0.72)] sm:px-8 sm:py-8">
          <div className="absolute inset-y-0 right-0 w-[48%] bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.18),transparent_68%)]" />
          <div className="absolute -top-20 left-1/3 h-52 w-52 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-24 right-10 h-56 w-56 rounded-full bg-emerald-300/20 blur-3xl" />
          <div className="relative grid gap-8 xl:grid-cols-[1.2fr_0.8fr] xl:items-end">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-100">
                <Sparkles className="h-4 w-4" />
                Platform Command Center
              </div>
              <h1 className="mt-5 text-3xl font-semibold tracking-tight text-white sm:text-4xl lg:text-[2.8rem]">
                Super Admin analytics redesigned for modern reporting.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-100/88 sm:text-base">
                Review growth, revenue, feature adoption, and school engagement
                from one cleaner workspace built to scale from mobile to large
                desktop screens.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/18 bg-white/10 px-3.5 py-2 text-sm text-white/90">
                  <TrendingUp className="h-4 w-4 text-cyan-200" />
                  12-month rolling analytics
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/18 bg-white/10 px-3.5 py-2 text-sm text-white/90">
                  <Activity className="h-4 w-4 text-amber-200" />
                  {compact(recentActions)} recent actions
                </span>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
              <div className="rounded-[28px] border border-white/16 bg-white/10 p-5 backdrop-blur-md">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-100/80">
                  Active footprint
                </p>
                <p className="mt-3 text-3xl font-bold tracking-tight text-white">
                  {totalSchools ? Math.round((activeSchools / totalSchools) * 100) : 0}%
                </p>
                <p className="mt-2 text-sm text-slate-100/78">
                  {activeSchools} of {totalSchools} schools are active.
                </p>
              </div>
              <div className="rounded-[28px] border border-white/16 bg-white/10 p-5 backdrop-blur-md">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-100/80">
                  Revenue pulse
                </p>
                <p className="mt-3 text-3xl font-bold tracking-tight text-white">
                  GHS {compact(revenueTotals.total)}
                </p>
                <p className="mt-2 text-sm text-slate-100/78">
                  {formatCurrency(
                    revenueSeries.reduce((sum, item) => sum + item.value, 0) /
                      (revenueSeries.length || 1),
                  )}{" "}
                  average monthly revenue.
                </p>
              </div>
              <div className="rounded-[28px] border border-white/16 bg-white/10 p-5 backdrop-blur-md">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-100/80">
                  Sync status
                </p>
                <p className="mt-3 text-lg font-semibold text-white">
                  {lastLoadedAt ? shortDate(lastLoadedAt) : "Not synced yet"}
                </p>
                <p className="mt-2 text-sm text-slate-100/78">
                  {loading
                    ? "Refreshing platform metrics..."
                    : "Dashboard ready for review."}
                </p>
              </div>
            </div>
          </div>
        </section>

        {loading && !lastLoadedAt ? (
          <div className="space-y-6 animate-pulse">
            <div className="h-56 rounded-[32px] bg-slate-200/80" />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="h-44 rounded-[28px] bg-slate-200/80"
                />
              ))}
            </div>
            <div className="grid gap-6 xl:grid-cols-2">
              <div className="h-[28rem] rounded-[32px] bg-slate-200/80" />
              <div className="h-[28rem] rounded-[32px] bg-slate-200/80" />
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {metrics.map((metric) => (
                <div
                  key={metric.label}
                  className={`relative overflow-hidden rounded-[28px] border border-white/80 bg-gradient-to-br ${metric.tone} p-5 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.35)]`}
                >
                  <div className="absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.65),transparent_70%)]" />
                  <div className="relative flex h-full flex-col gap-5">
                    <div
                      className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl ${metric.iconTone}`}
                    >
                      {metric.icon}
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                        {metric.label}
                      </p>
                      <p className="mt-3 text-[1.8rem] font-bold tracking-tight text-slate-950">
                        {metric.value}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {metric.detail}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.18fr_0.82fr]">
              <section className={panelShell}>
                <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                      Growth
                    </p>
                    <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
                      School acquisition momentum
                    </h2>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                      Clear monthly onboarding signals with quick access to this
                      month, last month, and the current growth rate.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void loadData();
                    }}
                    disabled={loading}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <RefreshCw
                      className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                    />
                    Refresh data
                  </button>
                </div>
                <div className="grid gap-4 lg:grid-cols-3">
                  <div className="rounded-[24px] border border-slate-200/80 bg-sky-50/80 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                      New this month
                    </p>
                    <p className="mt-3 text-3xl font-bold tracking-tight text-slate-950">
                      {newSchoolsThisMonth}
                    </p>
                  </div>
                  <div className="rounded-[24px] border border-slate-200/80 bg-emerald-50/80 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                      Last month
                    </p>
                    <p className="mt-3 text-3xl font-bold tracking-tight text-slate-950">
                      {newSchoolsLastMonth}
                    </p>
                  </div>
                  <div className="rounded-[24px] border border-slate-200/80 bg-slate-50 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                      Growth rate
                    </p>
                    <p className="mt-3 text-3xl font-bold tracking-tight text-slate-950">
                      {growthRate}%
                    </p>
                  </div>
                </div>
                <div className="mt-5 rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(255,255,255,0.98))] p-4 sm:p-5">
                  {renderBars(
                    growthSeries,
                    "bg-[linear-gradient(180deg,#38bdf8_0%,#0b4a82_100%)] shadow-[0_12px_30px_-18px_rgba(11,74,130,0.7)]",
                    (value) => `${value} schools`,
                  )}
                </div>
              </section>

              <section
                className={`${panelShell} bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(248,250,252,0.98))]`}
              >
                <div className="flex items-center gap-3">
                  <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                      Executive report
                    </p>
                    <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
                      Health snapshot
                    </h2>
                  </div>
                </div>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-[24px] border border-emerald-200/80 bg-emerald-50/80 p-4">
                    <div className="flex items-center gap-2 text-emerald-700">
                      <Activity className="h-4 w-4" />
                      <p className="text-xs font-semibold uppercase tracking-[0.2em]">
                        Engagement
                      </p>
                    </div>
                    <p className="mt-3 text-3xl font-bold tracking-tight text-slate-950">
                      {compact(recentActions)}
                    </p>
                    <p className="mt-2 text-sm text-slate-600">
                      Actions recorded in the last 30 days.
                    </p>
                  </div>
                  <div className="rounded-[24px] border border-rose-200/80 bg-rose-50/80 p-4">
                    <div className="flex items-center gap-2 text-rose-700">
                      <CircleAlert className="h-4 w-4" />
                      <p className="text-xs font-semibold uppercase tracking-[0.2em]">
                        Attention
                      </p>
                    </div>
                    <p className="mt-3 text-3xl font-bold tracking-tight text-slate-950">
                      {highRiskSchools}
                    </p>
                    <p className="mt-2 text-sm text-slate-600">
                      Schools have 30+ days of inactivity or none at all.
                    </p>
                  </div>
                </div>
                <div className="mt-4 rounded-[28px] border border-slate-200/80 bg-slate-950 p-5 text-white">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                        Plan distribution
                      </p>
                      <p className="mt-2 text-lg font-semibold text-white">
                        Subscription mix across all schools
                      </p>
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
                      {planMix.length} plan types
                    </span>
                  </div>
                  <div className="mt-5 space-y-3">
                    {planMix.length ? (
                      planMix.map(([key, count]) => {
                        const share = totalSchools
                          ? Math.round((count / totalSchools) * 100)
                          : 0;
                        return (
                          <div key={key}>
                            <div className="flex items-center justify-between gap-4 text-sm">
                              <span className="font-medium text-slate-100">
                                {labelize(key)}
                              </span>
                              <span className="text-slate-300">
                                {count} schools
                              </span>
                            </div>
                            <div className="mt-2 h-2 rounded-full bg-white/10">
                              <div
                                className="h-full rounded-full bg-[linear-gradient(90deg,#38bdf8,#34d399)]"
                                style={{ width: `${Math.max(share, 8)}%` }}
                              />
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-sm text-slate-300">
                        No schools available yet.
                      </p>
                    )}
                  </div>
                </div>
              </section>
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
              <section className={panelShell}>
                <div className="mb-6">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                    Revenue
                  </p>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
                    Subscription revenue flow
                  </h2>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                    A cleaner monthly revenue report for successful payments,
                    active subscriptions, and billing issues.
                  </p>
                </div>
                <div className="grid gap-4 lg:grid-cols-3">
                  <div className="rounded-[24px] border border-emerald-200/80 bg-emerald-50/80 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                      Total revenue
                    </p>
                    <p className="mt-3 text-[1.85rem] font-bold tracking-tight text-slate-950">
                      {formatCurrency(revenueTotals.total)}
                    </p>
                  </div>
                  <div className="rounded-[24px] border border-sky-200/80 bg-sky-50/80 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                      Active payments
                    </p>
                    <p className="mt-3 text-[1.85rem] font-bold tracking-tight text-slate-950">
                      {revenueTotals.success}
                    </p>
                  </div>
                  <div className="rounded-[24px] border border-rose-200/80 bg-rose-50/80 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                      Issues
                    </p>
                    <p className="mt-3 text-[1.85rem] font-bold tracking-tight text-slate-950">
                      {revenueTotals.issues}
                    </p>
                  </div>
                </div>
                <div className="mt-5 rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(255,255,255,0.98))] p-4 sm:p-5">
                  {renderBars(
                    revenueSeries,
                    "bg-[linear-gradient(180deg,#34d399_0%,#047857_100%)] shadow-[0_12px_30px_-18px_rgba(4,120,87,0.7)]",
                    (value) => formatCurrency(value),
                  )}
                </div>
              </section>

              <section className={panelShell}>
                <div className="mb-6 flex items-start gap-3">
                  <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white">
                    <BarChart3 className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                      Usage report
                    </p>
                    <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
                      Feature adoption and action load
                    </h2>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                      Monitor which features dominate activity and how platform
                      interaction volume moves across the year.
                    </p>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-[24px] border border-slate-200/80 bg-slate-50 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                      Most used
                    </p>
                    <p className="mt-3 text-lg font-semibold text-slate-950">
                      {labelize(mostUsed?.key)}
                    </p>
                  </div>
                  <div className="rounded-[24px] border border-slate-200/80 bg-slate-50 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                      Least used
                    </p>
                    <p className="mt-3 text-lg font-semibold text-slate-950">
                      {labelize(leastUsed?.key)}
                    </p>
                  </div>
                  <div className="rounded-[24px] border border-slate-200/80 bg-slate-50 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                      Tracked actions
                    </p>
                    <p className="mt-3 text-lg font-semibold text-slate-950">
                      {compact(featureUsage.reduce((sum, item) => sum + item.value, 0))}
                    </p>
                  </div>
                </div>
                <div className="mt-5 rounded-[28px] border border-slate-200/80 bg-slate-950 p-5 text-white">
                  {renderBars(
                    activitySeries,
                    "bg-[linear-gradient(180deg,#f59e0b_0%,#ea580c_100%)] shadow-[0_12px_30px_-18px_rgba(234,88,12,0.7)]",
                    (value) => `${value} actions`,
                  )}
                </div>
                <div className="mt-5 grid gap-3">
                  {featureUsage.length ? (
                    featureUsage.slice(0, 6).map((item) => {
                      const total = featureUsage.reduce(
                        (sum, row) => sum + row.value,
                        0,
                      );
                      const share = total
                        ? Math.round((item.value / total) * 100)
                        : 0;
                      return (
                        <div
                          key={item.key}
                          className="rounded-[22px] border border-slate-200/80 bg-white px-4 py-3"
                        >
                          <div className="flex items-center justify-between gap-4">
                            <div className="min-w-0">
                              <p className="truncate font-medium text-slate-900">
                                {labelize(item.key)}
                              </p>
                              <p className="text-xs text-slate-500">
                                {item.value} recorded actions
                              </p>
                            </div>
                            <span className="shrink-0 rounded-full border border-slate-200/80 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                              {share}%
                            </span>
                          </div>
                          <div className="mt-3 h-2 rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-[linear-gradient(90deg,#0b4a82,#38bdf8)]"
                              style={{ width: `${Math.max(share, 6)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="rounded-[22px] border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
                      No feature usage records available yet.
                    </div>
                  )}
                </div>
              </section>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <section
                className={`${panelShell} bg-[linear-gradient(160deg,rgba(255,255,255,0.96),rgba(240,249,255,0.92))]`}
              >
                <div className="mb-6 flex items-start gap-3">
                  <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#0b4a82,#38bdf8)] text-white">
                    <Activity className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                      Leaderboard
                    </p>
                    <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
                      Most active schools
                    </h2>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                      Schools ranked by tracked platform activity, with student
                      footprint and last engagement.
                    </p>
                  </div>
                </div>
                <div className="space-y-3">
                  {topActiveSchools.length ? (
                    topActiveSchools.map((school, index) => (
                      <div
                        key={school.id}
                        className="flex flex-col gap-4 rounded-[24px] border border-slate-200/80 bg-white/90 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex min-w-0 items-start gap-4">
                          <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#0b4a82,#38bdf8)] text-sm font-bold text-white">
                            {index + 1}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-base font-semibold text-slate-950">
                              {school.name}
                            </p>
                            <p className="mt-1 text-sm text-slate-600">
                              {studentCounts[school.id] ??
                                school.studentsCount ??
                                0}{" "}
                              students
                            </p>
                            <p className="mt-1 text-xs text-slate-400">
                              {relativeDate(school.lastActive)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 sm:text-right">
                          <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50 px-3 py-2">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700">
                              Activity
                            </p>
                            <p className="mt-1 text-lg font-semibold text-slate-950">
                              {compact(school.activityScore)}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                              Last seen
                            </p>
                            <p className="mt-1 text-sm font-semibold text-slate-900">
                              {shortDate(school.lastActive)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[24px] border border-dashed border-slate-300 bg-white/80 px-4 py-10 text-center text-sm text-slate-500">
                      No school activity has been recorded yet.
                    </div>
                  )}
                </div>
              </section>

              <section
                className={`${panelShell} bg-[linear-gradient(160deg,rgba(255,255,255,0.96),rgba(255,241,242,0.9))]`}
              >
                <div className="mb-6 flex items-start gap-3">
                  <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#fb7185,#f97316)] text-white">
                    <CalendarRange className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                      Attention queue
                    </p>
                    <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
                      Low activity schools
                    </h2>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                      Schools with no recent activity are grouped here for
                      faster follow-up.
                    </p>
                  </div>
                </div>
                <div className="space-y-3">
                  {lowActivitySchools.length ? (
                    lowActivitySchools.map((school, index) => (
                      <div
                        key={school.id}
                        className="flex flex-col gap-4 rounded-[24px] border border-slate-200/80 bg-white/90 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex min-w-0 items-start gap-4">
                          <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#fb7185,#f97316)] text-sm font-bold text-white">
                            {index + 1}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-base font-semibold text-slate-950">
                              {school.name}
                            </p>
                            <p className="mt-1 text-sm text-slate-600">
                              Plan {labelize(school.plan)}
                            </p>
                            <p className="mt-1 text-xs text-slate-400">
                              {relativeDate(school.lastActive)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 sm:text-right">
                          <div className="rounded-2xl border border-rose-200/80 bg-rose-50 px-3 py-2">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-rose-700">
                              Idle window
                            </p>
                            <p className="mt-1 text-lg font-semibold text-slate-950">
                              {school.daysInactive === null
                                ? "No data"
                                : `${school.daysInactive} days`}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                              Last active
                            </p>
                            <p className="mt-1 text-sm font-semibold text-slate-900">
                              {shortDate(school.lastActive)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[24px] border border-dashed border-slate-300 bg-white/80 px-4 py-10 text-center text-sm text-slate-500">
                      No inactive schools found in the current dataset.
                    </div>
                  )}
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
};

export default Analytics;
