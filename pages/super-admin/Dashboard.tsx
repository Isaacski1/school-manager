import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  collection,
  query,
  getDocs,
  orderBy,
  limit,
  Timestamp,
  where,
} from "firebase/firestore";
import { firestore } from "../../services/firebase";
import { useAuth } from "../../context/AuthContext";
import { Link } from "react-router-dom";
import { School } from "../../types";
import logActivity from "../../services/activityLog";
import {
  RefreshCw,
  Users,
  Zap,
  PieChart,
  Clock,
  Search,
  Eye,
  CheckCircle,
  AlertTriangle,
  TrendingUp,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Building,
  MoreHorizontal,
  ChevronRight,
  Wallet,
  BadgeDollarSign,
} from "lucide-react";

// Premium Card Component
const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = "",
}) => (
  <div
    className={`bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow p-6 ${className}`}
  >
    {children}
  </div>
);

// Premium Stat Card with mini sparkline and hover effect
const StatCard: React.FC<{
  label: string;
  value: number | string;
  hint?: string;
  icon?: React.ReactNode;
  trend?: number;
}> = ({ label, value, hint, icon, trend = 0 }) => (
  <Card className="group hover:-translate-y-0.5 hover:shadow-lg transition-all">
    <div className="flex items-start justify-between gap-3 mb-3">
      <div className="flex-1">
        <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">
          {label}
        </div>
        <div className="text-3xl md:text-4xl font-bold text-slate-900 mt-2">
          {value}
        </div>
      </div>
      <div
        className={`w-12 h-12 rounded-xl flex items-center justify-center text-white ${
          trend >= 0
            ? "bg-gradient-to-br from-emerald-400 to-emerald-600"
            : "bg-gradient-to-br from-amber-400 to-amber-600"
        }`}
      >
        {icon}
      </div>
    </div>
    <div className="flex items-center justify-between">
      {hint && <div className="text-xs text-slate-500">{hint}</div>}
      {trend !== undefined && (
        <div
          className={`flex items-center gap-1 text-xs font-semibold ${trend >= 0 ? "text-emerald-600" : "text-[#0B4A82]"}`}
        >
          {trend >= 0 ? (
            <ArrowUpRight size={14} />
          ) : (
            <ArrowDownRight size={14} />
          )}
          {Math.abs(trend)}%
        </div>
      )}
    </div>
    {/* Mini sparkline placeholder (CSS-only) */}
    <div className="mt-3 h-1 bg-gradient-to-r from-slate-100 via-slate-200 to-slate-100 rounded-full opacity-50" />
  </Card>
);

// Insight Card Component (for Action Needed section)
const InsightCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  count: number;
  description: string;
  accentColor: string;
}> = ({ icon, title, count, description, accentColor }) => (
  <Card
    className={`border-l-4 ${accentColor} group hover:shadow-lg transition-all`}
  >
    <div className="flex items-start justify-between">
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-2">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center text-white ${accentColor.replace("border", "bg")}`}
          >
            {icon}
          </div>
          <h3 className="font-semibold text-slate-800">{title}</h3>
        </div>
        <div className="text-3xl font-bold text-slate-900 mb-1">{count}</div>
        <p className="text-sm text-slate-600">{description}</p>
      </div>
      <button className="p-2 rounded-lg hover:bg-slate-50 transition">
        <ChevronRight size={18} className="text-slate-400" />
      </button>
    </div>
  </Card>
);

// Skeleton Loader with shimmer effect
const Skeleton: React.FC<{ className?: string }> = ({
  className = "h-6 bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100 rounded animate-pulse",
}) => <div className={className} />;

// Empty State Component
const EmptyState: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}> = ({ icon, title, description, action }) => (
  <div className="text-center py-12">
    <div className="flex justify-center mb-4">{icon}</div>
    <h3 className="text-lg font-semibold text-slate-800 mb-2">{title}</h3>
    <p className="text-sm text-slate-600 mb-6">{description}</p>
    {action && (
      <button
        onClick={action.onClick}
        className="inline-flex items-center gap-2 px-4 py-2 bg-[#0B4A82] text-white rounded-lg hover:bg-[#0B4A82] transition-colors text-sm font-medium"
      >
        {action.label}
      </button>
    )}
  </div>
);

type PaymentRecord = {
  id: string;
  amount?: number;
  currency?: string;
  status?: string;
  schoolId?: string;
  schoolName?: string;
  createdAt?: Timestamp | number | string;
};

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [schools, setSchools] = useState<School[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [planFilter, setPlanFilter] = useState<string>("");
  const [selectedTab, setSelectedTab] = useState<
    "inactive" | "trials" | "noactivity"
  >("inactive");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [dailyChecklist, setDailyChecklist] = useState<{
    summary: Record<string, { completed: number; total: number }>;
    perSchool: Record<
      string,
      {
        attendance: boolean;
        teacherAttendance: boolean;
        assessments: boolean;
        timetable: boolean;
        notices: boolean;
      }
    >;
  }>({ summary: {}, perSchool: {} });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const sCol = collection(firestore, "schools");
      const sSnap = await getDocs(sCol);
      const rows: School[] = sSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      }));
      setSchools(rows as School[]);

      const aCol = collection(firestore, "activity_logs");
      const aQ = query(aCol, orderBy("createdAt", "desc"), limit(20));
      const aSnap = await getDocs(aQ);
      const events = aSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      }));
      setActivity(events);

      const paymentsCol = collection(firestore, "payments");
      const paymentsQuery = query(
        paymentsCol,
        orderBy("createdAt", "desc"),
        limit(200),
      );
      const paymentsSnap = await getDocs(paymentsQuery);
      const paymentRows = paymentsSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      })) as PaymentRecord[];
      setPayments(paymentRows);

      setLastUpdated(new Date());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!schools.length) return;
    const loadDailyChecklist = async () => {
      try {
        const now = new Date();
        const toLocalYYYYMMDD = (date: Date) => {
          const y = date.getFullYear();
          const m = String(date.getMonth() + 1).padStart(2, "0");
          const d = String(date.getDate()).padStart(2, "0");
          return `${y}-${m}-${d}`;
        };
        const today = toLocalYYYYMMDD(now);
        const startOfDay = new Date(now);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(now);
        endOfDay.setHours(23, 59, 59, 999);
        const startMs = startOfDay.getTime();
        const endMs = endOfDay.getTime();
        const totalSchools = schools.length;
        const completion = {
          attendance: { completed: 0, total: totalSchools },
          teacherAttendance: { completed: 0, total: totalSchools },
          assessments: { completed: 0, total: totalSchools },
          timetable: { completed: 0, total: totalSchools },
          notices: { completed: 0, total: totalSchools },
        } as Record<string, { completed: number; total: number }>;
        const perSchool: Record<
          string,
          {
            attendance: boolean;
            teacherAttendance: boolean;
            assessments: boolean;
            timetable: boolean;
            notices: boolean;
          }
        > = {};

        const [
          attendanceSnap,
          teacherAttendanceSnap,
          assessmentsSnap,
          timetablesSnap,
          noticesSnap,
        ] = await Promise.all([
          getDocs(
            query(
              collection(firestore, "attendance"),
              where("date", "==", today),
            ),
          ),
          getDocs(
            query(
              collection(firestore, "teacher_attendance"),
              where("date", "==", today),
            ),
          ),
          getDocs(
            query(
              collection(firestore, "assessments"),
              where("createdAt", ">=", startMs),
              where("createdAt", "<=", endMs),
            ),
          ),
          getDocs(collection(firestore, "timetables")),
          getDocs(
            query(
              collection(firestore, "notices"),
              where("createdAt", ">=", startMs),
              where("createdAt", "<=", endMs),
            ),
          ),
        ]);

        const attendanceSchools = new Set(
          attendanceSnap.docs
            .map((doc) => (doc.data() as any).schoolId)
            .filter(Boolean),
        );
        const teacherAttendanceSchools = new Set(
          teacherAttendanceSnap.docs
            .map((doc) => (doc.data() as any).schoolId)
            .filter(Boolean),
        );
        const assessmentSchools = new Set(
          assessmentsSnap.docs
            .map((doc) => (doc.data() as any).schoolId)
            .filter(Boolean),
        );
        const timetableSchools = new Set(
          timetablesSnap.docs
            .map((doc) => (doc.data() as any).schoolId)
            .filter(Boolean),
        );
        const noticeSchools = new Set(
          noticesSnap.docs
            .map((doc) => (doc.data() as any).schoolId)
            .filter(Boolean),
        );

        schools.forEach((school) => {
          const schoolId = school.id;
          if (!schoolId) return;

          const status = {
            attendance: attendanceSchools.has(schoolId),
            teacherAttendance: teacherAttendanceSchools.has(schoolId),
            assessments: assessmentSchools.has(schoolId),
            timetable: timetableSchools.has(schoolId),
            notices: noticeSchools.has(schoolId),
          };
          perSchool[schoolId] = status;

          if (status.attendance) completion.attendance.completed += 1;
          if (status.teacherAttendance)
            completion.teacherAttendance.completed += 1;
          if (status.assessments) completion.assessments.completed += 1;
          if (status.timetable) completion.timetable.completed += 1;
          if (status.notices) completion.notices.completed += 1;
        });
        setDailyChecklist({ summary: completion, perSchool });
      } catch (err) {
        console.error("Failed to load daily checklist", err);
      }
    };

    loadDailyChecklist();
  }, [schools]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // KPI calculations (unchanged logic)
  const kpis = useMemo(() => {
    const total = schools.length;
    const active = schools.filter((s) => s.status === "active").length;
    const inactive = schools.filter((s) => s.status === "inactive").length;
    const trial = schools.filter((s) => s.plan === "trial").length;
    const free = schools.filter((s) => s.plan === "free").length;
    const paid = schools.filter(
      (s) => s.plan && s.plan !== "trial" && s.plan !== "free",
    ).length;
    const newSchools = schools.filter((s) => {
      if (!s.createdAt) return false;
      const created =
        s.createdAt instanceof Timestamp
          ? s.createdAt.toDate()
          : new Date(s.createdAt as any);
      return created >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }).length;
    const activeLast7 = new Set(
      activity
        .filter((a) => {
          if (!a.createdAt) return false;
          const created =
            a.createdAt instanceof Timestamp
              ? a.createdAt.toDate()
              : new Date(a.createdAt);
          return created >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        })
        .map((a) => a.schoolId),
    ).size;

    return {
      total,
      active,
      inactive,
      trial,
      free,
      paid,
      newSchools,
      activeLast7,
    };
  }, [schools, activity]);

  const normalizePaymentStatus = (status?: string) => {
    const normalized = String(status || "pending").toLowerCase();
    if (["success", "paid", "active"].includes(normalized)) return "success";
    if (["failed", "failure", "past_due"].includes(normalized)) return "failed";
    if (["abandoned", "cancelled", "canceled"].includes(normalized))
      return "failed";
    return "pending";
  };

  const formatCurrency = (value: number, currency = "GHS") =>
    new Intl.NumberFormat("en-GH", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);

  const paymentMetrics = useMemo(() => {
    const now = new Date();
    const monthBuckets: { key: string; label: string }[] = [];
    for (let month = 0; month < 12; month += 1) {
      const d = new Date(now.getFullYear(), month, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleString("en-US", { month: "short" });
      monthBuckets.push({ key, label });
    }

    const monthlyTotals = Object.fromEntries(
      monthBuckets.map((bucket) => [bucket.key, 0]),
    ) as Record<string, number>;
    const monthlyFeesTotals = Object.fromEntries(
      monthBuckets.map((bucket) => [bucket.key, 0]),
    ) as Record<string, number>;

    const last30Cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    let paidAmount = 0;
    let paidCount = 0;
    let pendingCount = 0;
    let failedCount = 0;
    let last30Amount = 0;

    payments.forEach((payment) => {
      const status = normalizePaymentStatus(payment.status);
      const amountRaw = payment.amount ?? 0;
      const amount = amountRaw >= 100 ? amountRaw / 100 : amountRaw;
      const createdAt =
        payment.createdAt instanceof Timestamp
          ? payment.createdAt.toDate()
          : new Date(payment.createdAt || 0);

      if (status === "success") {
        paidAmount += amount;
        paidCount += 1;
        if (createdAt >= last30Cutoff) {
          last30Amount += amount;
        }
        const key = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, "0")}`;
        if (monthlyTotals[key] !== undefined) {
          monthlyTotals[key] += amount;
        }
        if (monthlyFeesTotals[key] !== undefined) {
          monthlyFeesTotals[key] += amount;
        }
      }

      if (status === "pending") pendingCount += 1;
      if (status === "failed") failedCount += 1;
    });

    const totalTracked = paidCount + pendingCount + failedCount;
    const successRate = totalTracked
      ? Math.round((paidCount / totalTracked) * 100)
      : 0;

    return {
      paidAmount,
      paidCount,
      pendingCount,
      failedCount,
      last30Amount,
      successRate,
      monthlySeries: monthBuckets.map((bucket) => ({
        label: bucket.label,
        value: monthlyTotals[bucket.key] || 0,
      })),
      monthlyFeesSeries: monthBuckets.map((bucket) => ({
        label: bucket.label,
        value: monthlyFeesTotals[bucket.key] || 0,
      })),
    };
  }, [payments]);

  const planDist = useMemo(() => {
    const counts: Record<string, number> = {
      free: 0,
      trial: 0,
      monthly: 0,
      termly: 0,
      yearly: 0,
    };
    schools.forEach((s) => {
      const p = (s.plan as string) || "trial";
      counts[p] = (counts[p] || 0) + 1;
    });
    return counts;
  }, [schools]);

  const filteredSchools = schools.filter((s) => {
    if (search && !s.name.toLowerCase().includes(search.toLowerCase()))
      return false;
    if (statusFilter && s.status !== statusFilter) return false;
    if (planFilter && s.plan !== planFilter) return false;
    return true;
  });

  const renderActivity = (a: any) => {
    const when = a.createdAt
      ? a.createdAt instanceof Timestamp
        ? a.createdAt.toDate()
        : new Date(a.createdAt)
      : new Date();
    const ago = timeAgo(when);
    const title = (a.eventType || "event").replace(/_/g, " ");
    return { title, ago, school: a.schoolId || "System", meta: a.meta };
  };

  // helper: human-friendly relative time
  function timeAgo(d: Date) {
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  // Action lists
  const inactiveList = schools.filter((s) => s.status !== "active");
  const trialsList = schools
    .filter((s) => s.plan === "trial" && s.planEndsAt)
    .sort((a, b) => {
      const aDate =
        a.planEndsAt instanceof Timestamp
          ? a.planEndsAt.toDate().getTime()
          : new Date(a.planEndsAt as any).getTime();
      const bDate =
        b.planEndsAt instanceof Timestamp
          ? b.planEndsAt.toDate().getTime()
          : new Date(b.planEndsAt as any).getTime();
      return aDate - bDate;
    });

  const expiredSubscriptions = schools
    .filter((s) => s.plan !== "free" && s.planEndsAt)
    .map((s) => {
      const raw = s.planEndsAt as any;
      const planEndsAt =
        raw instanceof Timestamp ? raw.toDate() : new Date(raw);
      const graceEndsAt = new Date(
        planEndsAt.getTime() + 7 * 24 * 60 * 60 * 1000,
      );
      return {
        ...s,
        planEndsAt,
        graceEndsAt,
      };
    })
    .filter((s) => !Number.isNaN(s.graceEndsAt.getTime()))
    .filter((s) => new Date() >= s.graceEndsAt)
    .sort((a, b) => a.graceEndsAt.getTime() - b.graceEndsAt.getTime());
  const noActivityList = (() => {
    const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const lastActivityBySchool: Record<string, Date | null> = {};
    activity.forEach((a) => {
      if (!a.schoolId) return;
      const when =
        a.createdAt instanceof Timestamp
          ? a.createdAt.toDate()
          : new Date(a.createdAt);
      if (
        !lastActivityBySchool[a.schoolId] ||
        lastActivityBySchool[a.schoolId] < when
      )
        lastActivityBySchool[a.schoolId] = when;
    });
    return schools.filter((s) => {
      const last = lastActivityBySchool[s.id];
      return !last || last < cutoff;
    });
  })();

  // Quick action filters
  const quickFilters = [
    {
      label: "Active",
      count: kpis.active,
      color: "bg-emerald-100 text-emerald-700",
    },
    {
      label: "Free",
      count: kpis.free,
      color: "bg-emerald-50 text-emerald-700",
    },
    { label: "Trial", count: kpis.trial, color: "bg-amber-100 text-amber-700" },
    { label: "Paid", count: kpis.paid, color: "bg-[#E6F0FA] text-[#0B4A82]" },
  ];

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto">
        {/* Premium Hero Header */}
        <div className="mb-8">
          <div className="bg-gradient-to-br from-slate-50 via-white to-slate-50 rounded-3xl border border-slate-100 shadow-sm p-8">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-3 h-3 rounded-full bg-emerald-500" />
                  <span className="text-xs font-semibold text-emerald-600 uppercase tracking-widest">
                    System Status
                  </span>
                </div>
                <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-2">
                  Super Admin Dashboard
                </h1>
                <p className="text-slate-600">
                  Manage {kpis.total} schools across {kpis.active} active
                  organizations
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => loadData()}
                  aria-label="Refresh dashboard"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#1160A8]"
                >
                  <RefreshCw
                    size={16}
                    className="group-hover:rotate-180 transition-transform"
                  />
                  Refresh
                </button>
                <Link
                  to="/super-admin/schools"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[#0B4A82] text-white rounded-lg text-sm font-medium hover:bg-[#0B4A82] transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#1160A8]"
                >
                  <Building size={16} />
                  View Schools
                </Link>
              </div>
            </div>

            {/* Quick Filters */}
            <div className="flex flex-wrap gap-3 mt-6 pt-6 border-t border-slate-100">
              {quickFilters.map((f) => (
                <div
                  key={f.label}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold ${f.color}`}
                >
                  {f.label}: <span className="font-bold">{f.count}</span>
                </div>
              ))}
              <div className="text-xs text-slate-500 flex items-center ml-auto">
                {lastUpdated
                  ? `Last updated ${lastUpdated.toLocaleTimeString()}`
                  : "Not updated yet"}
              </div>
            </div>
          </div>
        </div>

        {/* KPI Cards - Premium Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="h-32" />
              </div>
            ))
          ) : (
            <>
              <StatCard
                label="Total Schools"
                value={kpis.total}
                hint="All time"
                icon={<Users size={20} />}
                trend={5}
              />
              <StatCard
                label="Active Schools"
                value={kpis.active}
                hint="Currently active"
                icon={<CheckCircle size={20} />}
                trend={3}
              />
              <StatCard
                label="Inactive Schools"
                value={kpis.inactive}
                hint="Needs attention"
                icon={<AlertTriangle size={20} />}
                trend={-1}
              />
              <StatCard
                label="New Schools"
                value={kpis.newSchools}
                hint="Last 30 days"
                icon={<TrendingUp size={20} />}
                trend={8}
              />
            </>
          )}
        </div>

        {/* Billing Analytics */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <Card className="lg:col-span-2">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Billing Analytics
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  Payment performance over the last 6 months
                </p>
              </div>
              <Link
                to="/super-admin/payments"
                className="inline-flex items-center gap-2 text-sm font-semibold text-[#0B4A82]"
              >
                View payments <ChevronRight size={16} />
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase text-emerald-600">
                    Total Revenue
                  </span>
                  <span className="w-8 h-8 rounded-lg bg-emerald-500/90 text-white flex items-center justify-center">
                    <BadgeDollarSign size={16} />
                  </span>
                </div>
                <div className="mt-3 text-2xl font-bold text-slate-900">
                  {formatCurrency(paymentMetrics.paidAmount)}
                </div>
                <p className="text-xs text-emerald-700 mt-2">
                  {paymentMetrics.paidCount} successful payments
                </p>
              </div>
              <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase text-amber-600">
                    Pending
                  </span>
                  <span className="w-8 h-8 rounded-lg bg-amber-500/90 text-white flex items-center justify-center">
                    <Clock size={16} />
                  </span>
                </div>
                <div className="mt-3 text-2xl font-bold text-slate-900">
                  {paymentMetrics.pendingCount}
                </div>
                <p className="text-xs text-amber-700 mt-2">
                  Awaiting confirmation
                </p>
              </div>
              <div className="rounded-2xl border border-rose-100 bg-rose-50/60 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase text-rose-600">
                    Failed
                  </span>
                  <span className="w-8 h-8 rounded-lg bg-rose-500/90 text-white flex items-center justify-center">
                    <AlertTriangle size={16} />
                  </span>
                </div>
                <div className="mt-3 text-2xl font-bold text-slate-900">
                  {paymentMetrics.failedCount}
                </div>
                <p className="text-xs text-rose-700 mt-2">Needs follow-up</p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Earnings
                  </h3>
                  <p className="text-xs text-slate-500">
                    Successful payments per month
                  </p>
                </div>
                <div className="text-xs text-slate-400">
                  {new Date().toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </div>
              </div>

              <div className="mt-4 flex items-center gap-6 text-xs text-slate-500">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#3B82F6]" />
                  Total Collections
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-rose-500" />
                  Fees Collection
                </span>
              </div>

              <div className="mt-4 flex items-center gap-10">
                <div>
                  <p className="text-xs text-slate-400">Total Collections</p>
                  <p className="text-lg font-bold text-slate-900">
                    {formatCurrency(paymentMetrics.paidAmount)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Fees Collection</p>
                  <p className="text-lg font-bold text-slate-900">
                    {formatCurrency(paymentMetrics.last30Amount)}
                  </p>
                </div>
              </div>

              <div className="mt-4">
                {(() => {
                  const height = 180;
                  const width = 640;
                  const padding = 28;
                  const minValue = 300;
                  const maxValue = 3600;
                  const underflowHeight = 22;
                  const baselineY = height - padding - underflowHeight;
                  const chartHeight = baselineY - padding;

                  const toY = (value: number) => {
                    if (value >= minValue) {
                      const ratio = (value - minValue) / (maxValue - minValue);
                      return baselineY - ratio * chartHeight;
                    }
                    const underRatio = Math.min(
                      1,
                      (minValue - value) / minValue,
                    );
                    return baselineY + underRatio * underflowHeight;
                  };

                  const points = paymentMetrics.monthlySeries.map(
                    (point, index) => {
                      const x =
                        padding +
                        (index * (width - padding * 2)) /
                          (paymentMetrics.monthlySeries.length - 1 || 1);
                      const y = toY(point.value);
                      return { x, y };
                    },
                  );
                  const feePoints = paymentMetrics.monthlyFeesSeries.map(
                    (point, index) => {
                      const x =
                        padding +
                        (index * (width - padding * 2)) /
                          (paymentMetrics.monthlyFeesSeries.length - 1 || 1);
                      const y = toY(point.value);
                      return { x, y };
                    },
                  );

                  const buildPath = (pts: { x: number; y: number }[]) => {
                    if (pts.length === 0) return "";
                    const [first, ...rest] = pts;
                    return rest.reduce((acc, point, idx) => {
                      const prev = pts[idx];
                      const midX = (prev.x + point.x) / 2;
                      return `${acc} Q ${midX} ${prev.y} ${point.x} ${point.y}`;
                    }, `M ${first.x} ${first.y}`);
                  };

                  const areaPath = (pts: { x: number; y: number }[]) => {
                    const line = buildPath(pts);
                    if (!line) return "";
                    const last = pts[pts.length - 1];
                    const first = pts[0];
                    return `${line} L ${last.x} ${height - padding} L ${first.x} ${height - padding} Z`;
                  };

                  return (
                    <div className="w-full rounded-2xl bg-gradient-to-br from-slate-50 via-white to-slate-50 border border-slate-100 p-3 shadow-[0_10px_30px_-24px_rgba(15,23,42,0.5)]">
                      <svg
                        viewBox={`0 0 ${width} ${height}`}
                        className="w-full h-44"
                        role="img"
                        aria-label="Monthly earnings chart"
                      >
                        <defs>
                          <linearGradient
                            id="earningsBlue"
                            x1="0"
                            x2="0"
                            y1="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor="#3B82F6"
                              stopOpacity="0.65"
                            />
                            <stop
                              offset="100%"
                              stopColor="#3B82F6"
                              stopOpacity="0.05"
                            />
                          </linearGradient>
                          <linearGradient
                            id="earningsRed"
                            x1="0"
                            x2="0"
                            y1="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor="#F43F5E"
                              stopOpacity="0.7"
                            />
                            <stop
                              offset="100%"
                              stopColor="#F43F5E"
                              stopOpacity="0.1"
                            />
                          </linearGradient>
                        </defs>

                        <rect
                          x={padding}
                          y={padding}
                          width={width - padding * 2}
                          height={baselineY - padding}
                          rx={12}
                          fill="#FFFFFF"
                          opacity="0.6"
                        />
                        <rect
                          x={padding}
                          y={baselineY}
                          width={width - padding * 2}
                          height={underflowHeight}
                          rx={10}
                          fill="#F1F5F9"
                        />

                        {[0, 25, 50, 75, 100].map((tick) => {
                          const y = baselineY - (tick / 100) * chartHeight;
                          const labelValue = Math.round(
                            minValue + (tick / 100) * (maxValue - minValue),
                          );
                          return (
                            <g key={tick}>
                              <line
                                x1={padding}
                                x2={width - padding}
                                y1={y}
                                y2={y}
                                stroke="#E2E8F0"
                                strokeDasharray="4 4"
                              />
                              <text
                                x={6}
                                y={y + 4}
                                fontSize="10"
                                fill="#94A3B8"
                              >
                                GHS {labelValue.toLocaleString("en-GH")}
                              </text>
                            </g>
                          );
                        })}

                        <line
                          x1={padding}
                          x2={width - padding}
                          y1={baselineY}
                          y2={baselineY}
                          stroke="#CBD5F5"
                          strokeWidth="1.5"
                        />

                        <path d={areaPath(points)} fill="url(#earningsBlue)" />
                        <path
                          d={buildPath(points)}
                          fill="none"
                          stroke="#3B82F6"
                          strokeWidth="2"
                        />

                        <path
                          d={areaPath(feePoints)}
                          fill="url(#earningsRed)"
                        />
                        <path
                          d={buildPath(feePoints)}
                          fill="none"
                          stroke="#F43F5E"
                          strokeWidth="2"
                        />

                        {paymentMetrics.monthlySeries.map((point, idx) => {
                          const x =
                            padding +
                            (idx * (width - padding * 2)) /
                              (paymentMetrics.monthlySeries.length - 1 || 1);
                          return (
                            <text
                              key={point.label}
                              x={x}
                              y={height - 6}
                              textAnchor="middle"
                              fontSize="10"
                              fill="#94A3B8"
                            >
                              {point.label}
                            </text>
                          );
                        })}
                      </svg>
                    </div>
                  );
                })()}
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  Billing Health
                </h3>
                <p className="text-sm text-slate-600">
                  Current payment status mix
                </p>
              </div>
              <div className="w-11 h-11 rounded-xl bg-[#E6F0FA] text-[#0B4A82] flex items-center justify-center">
                <Wallet size={18} />
              </div>
            </div>

            <div className="space-y-4">
              {[
                {
                  label: "Successful",
                  value: paymentMetrics.paidCount,
                  color: "bg-emerald-500",
                },
                {
                  label: "Pending",
                  value: paymentMetrics.pendingCount,
                  color: "bg-amber-500",
                },
                {
                  label: "Failed",
                  value: paymentMetrics.failedCount,
                  color: "bg-rose-500",
                },
              ].map((item) => {
                const total =
                  paymentMetrics.paidCount +
                  paymentMetrics.pendingCount +
                  paymentMetrics.failedCount;
                const percentage = total
                  ? Math.round((item.value / total) * 100)
                  : 0;
                return (
                  <div key={item.label} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700">
                        {item.label}
                      </span>
                      <span className="text-slate-500">{percentage}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full ${item.color} rounded-full`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 rounded-2xl bg-slate-50 border border-slate-100 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500">Success rate</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {paymentMetrics.successRate}%
                  </p>
                </div>
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                  <TrendingUp size={18} />
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-3">
                Track billed revenue and follow up on pending payments.
              </p>
            </div>
          </Card>
        </div>

        {/* Insight Cards Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
          <InsightCard
            icon={<AlertTriangle size={18} />}
            title="Inactive Schools"
            count={inactiveList.length}
            description="Schools requiring attention"
            accentColor="border-[#1160A8] bg-[#E6F0FA]"
          />
          <InsightCard
            icon={<Zap size={18} />}
            title="Trials Ending"
            count={trialsList.length}
            description="Trial periods expiring soon"
            accentColor="border-amber-400 bg-amber-80"
          />
          <InsightCard
            icon={<Clock size={18} />}
            title="Expired Subscriptions"
            count={expiredSubscriptions.length}
            description="Grace period ended — renewal required"
            accentColor="border-rose-400 bg-rose-50"
          />
          <InsightCard
            icon={<Clock size={18} />}
            title="No Recent Activity"
            count={noActivityList.length}
            description="Last 14 days with no activity"
            accentColor="border-slate-400 bg-slate-50"
          />
        </div>

        {expiredSubscriptions.length > 0 && (
          <Card className="mb-8">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-rose-500">
                  Renewal required
                </p>
                <h2 className="text-lg font-semibold text-slate-900 mt-1">
                  Subscriptions past grace period
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  These schools have exceeded the one-week grace period and need
                  renewal to restore access.
                </p>
              </div>
              <Link
                to="/super-admin/payments"
                className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-100"
              >
                <Wallet size={16} />
                Review payments
              </Link>
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-slate-400">
                    <th className="py-2 pr-4">School</th>
                    <th className="py-2 pr-4">Plan</th>
                    <th className="py-2 pr-4">Grace ended</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {expiredSubscriptions.slice(0, 6).map((s) => (
                    <tr key={s.id} className="text-slate-600">
                      <td className="py-3 pr-4">
                        <Link
                          to={`/super-admin/schools/${s.id}`}
                          className="font-semibold text-slate-800 hover:text-[#0B4A82]"
                        >
                          {s.name}
                        </Link>
                        <div className="text-xs text-slate-400">{s.code}</div>
                      </td>
                      <td className="py-3 pr-4 capitalize">{s.plan}</td>
                      <td className="py-3 pr-4">
                        {s.graceEndsAt.toLocaleDateString()}
                      </td>
                      <td className="py-3">
                        <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-600">
                          Renewal overdue
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Plan Distribution Card */}
        <Card className="mb-8">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-slate-900">
              Plan Distribution
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Plan split across {kpis.total} schools
            </p>
          </div>

          {schools.length === 0 ? (
            <EmptyState
              icon={<PieChart className="mx-auto text-slate-300" size={48} />}
              title="No Plan Data"
              description="Create your first school to see plan distribution"
              action={{ label: "Create School", onClick: () => {} }}
            />
          ) : (
            <div className="flex flex-col lg:flex-row gap-8 items-center">
              <div className="w-full lg:w-1/3 flex justify-center">
                <div className="w-40 h-40">
                  <svg
                    viewBox="0 0 36 36"
                    className="w-full h-full"
                    style={{ transform: "rotate(-90deg)" }}
                  >
                    <circle
                      cx="18"
                      cy="18"
                      r="15.915"
                      fill="none"
                      stroke="#f1f5f9"
                      strokeWidth="8"
                    />
                    {/* Trial */}
                    <circle
                      cx="18"
                      cy="18"
                      r="15.915"
                      fill="none"
                      stroke="#f97316"
                      strokeWidth="8"
                      strokeDasharray={`${(planDist.trial / Math.max(1, schools.length)) * 100} 100`}
                    />
                    {/* Monthly (offset) */}
                    <circle
                      cx="18"
                      cy="18"
                      r="15.915"
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth="8"
                      strokeDasharray={`${(planDist.monthly / Math.max(1, schools.length)) * 100} 100`}
                      style={{
                        strokeDashoffset: `${-((planDist.trial / Math.max(1, schools.length)) * 100)}`,
                      }}
                    />
                  </svg>
                </div>
              </div>

              <div className="w-full lg:w-2/3">
                <div className="grid grid-cols-2 gap-4">
                  {[
                    {
                      label: "Free",
                      value: planDist.free,
                      color: "bg-emerald-50 border-l-4 border-emerald-500",
                    },
                    {
                      label: "Trial",
                      value: planDist.trial,
                      color: "bg-orange-100 border-l-4 border-orange-500",
                    },
                    {
                      label: "Monthly",
                      value: planDist.monthly,
                      color: "bg-[#E6F0FA] border-l-4 border-[#1160A8]",
                    },
                    {
                      label: "Termly",
                      value: planDist.termly,
                      color: "bg-green-100 border-l-4 border-green-500",
                    },
                    {
                      label: "Yearly",
                      value: planDist.yearly,
                      color: "bg-purple-100 border-l-4 border-purple-500",
                    },
                  ].map((p) => (
                    <div key={p.label} className={`${p.color} rounded-lg p-4`}>
                      <div className="text-2xl font-bold text-slate-900">
                        {p.value}
                      </div>
                      <div className="text-xs text-slate-600 mt-1">
                        {p.label} Plan
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Premium Data Table Card */}
        <Card className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Schools Directory
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                {filteredSchools.length} of {schools.length} schools
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
              <div className="relative flex-1 sm:flex-none">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  size={16}
                />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search schools..."
                  className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-[#1160A8] transition-all"
                  aria-label="Search schools"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1160A8]"
              >
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <select
                value={planFilter}
                onChange={(e) => setPlanFilter(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1160A8]"
              >
                <option value="">All Plans</option>
                <option value="free">Free</option>
                <option value="trial">Trial</option>
                <option value="monthly">Monthly</option>
                <option value="termly">Termly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">
                    School
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">
                    Status
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">
                    Plan
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">
                    Created
                  </th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="py-4 px-4">
                        <Skeleton className="h-4 w-32" />
                      </td>
                      <td className="py-4 px-4">
                        <Skeleton className="h-4 w-16" />
                      </td>
                      <td className="py-4 px-4">
                        <Skeleton className="h-4 w-20" />
                      </td>
                      <td className="py-4 px-4">
                        <Skeleton className="h-4 w-24" />
                      </td>
                      <td className="py-4 px-4 text-right">
                        <Skeleton className="h-8 w-16 ml-auto" />
                      </td>
                    </tr>
                  ))
                ) : filteredSchools.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 px-4">
                      <EmptyState
                        icon={
                          <Search
                            className="text-slate-300 mx-auto"
                            size={40}
                          />
                        }
                        title="No schools found"
                        description="Try adjusting your filters or search criteria"
                      />
                    </td>
                  </tr>
                ) : (
                  filteredSchools.map((s, idx) => (
                    <tr
                      key={s.id}
                      className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${
                        idx % 2 === 0 ? "bg-white" : "bg-slate-50/30"
                      }`}
                    >
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-slate-600 overflow-hidden font-semibold flex-shrink-0">
                            {s.logoUrl ? (
                              <img
                                src={s.logoUrl}
                                alt={s.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              s.name.charAt(0).toUpperCase()
                            )}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900">
                              {s.name}
                            </div>
                            <div className="text-xs text-slate-500">
                              {s.code || "â€”"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                            s.status === "active"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-[#E6F0FA] text-[#0B4A82]"
                          }`}
                        >
                          {s.status === "active" ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 capitalize">
                          {s.plan}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-slate-600">
                        {s.createdAt
                          ? s.createdAt instanceof Timestamp
                            ? s.createdAt.toDate().toLocaleDateString()
                            : new Date(s.createdAt as any).toLocaleDateString()
                          : "â€”"}
                      </td>
                      <td className="py-4 px-4 text-right">
                        <Link
                          to={`/super-admin/schools/${s.id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#0B4A82] text-white hover:bg-[#0B4A82] transition-colors"
                        >
                          <Eye size={14} /> View
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination placeholder */}
          {filteredSchools.length > 0 && (
            <div className="flex items-center justify-between mt-6 pt-6 border-t border-slate-100">
              <div className="text-xs text-slate-600">
                Showing 1 to {Math.min(10, filteredSchools.length)} of{" "}
                {filteredSchools.length}
              </div>
              <div className="flex gap-1">
                <button className="px-3 py-1 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                  ← Previous
                </button>
                <button className="px-3 py-1 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                  Next →
                </button>
              </div>
            </div>
          )}
        </Card>

        {/* Daily Operations Checklist */}
        <Card className="bg-gradient-to-br from-white via-slate-50 to-white border border-slate-100">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-10 h-10 rounded-2xl bg-[#E6F0FA] text-[#0B4A82] flex items-center justify-center">
                  <Activity size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Daily Operations Checklist
                  </h2>
                  <p className="text-sm text-slate-600">
                    Track routine school actions completed each day
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="px-3 py-1 rounded-full border border-slate-200 bg-white">
                Live today
              </span>
              <span className="px-3 py-1 rounded-full border border-slate-200 bg-white">
                {schools.length} schools
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              {
                key: "attendance",
                title: "Attendance submitted",
                description: "Daily student attendance recorded by classes.",
                gradient: "from-emerald-500/15 to-emerald-500/5",
                accent: "text-emerald-600",
                bar: "bg-emerald-500",
              },
              {
                key: "teacherAttendance",
                title: "Teacher attendance completed",
                description: "Staff attendance confirmed for the day.",
                gradient: "from-blue-500/15 to-blue-500/5",
                accent: "text-blue-600",
                bar: "bg-blue-500",
              },
              {
                key: "timetable",
                title: "Lesson plans logged",
                description: "Timetable updated today to reflect lessons.",
                gradient: "from-violet-500/15 to-violet-500/5",
                accent: "text-violet-600",
                bar: "bg-violet-500",
              },
              {
                key: "assessments",
                title: "Assessments graded",
                description: "Class assessments scored and saved.",
                gradient: "from-amber-500/15 to-amber-500/5",
                accent: "text-amber-600",
                bar: "bg-amber-500",
              },
              {
                key: "notices",
                title: "Notices posted",
                description: "Daily notices shared to staff and students.",
                gradient: "from-slate-500/15 to-slate-500/5",
                accent: "text-slate-600",
                bar: "bg-slate-500",
              },
            ].map((item) => {
              const metrics = dailyChecklist.summary[item.key];
              const percent = metrics
                ? Math.round(
                    (metrics.completed / Math.max(1, metrics.total)) * 100,
                  )
                : 0;
              const completed = metrics?.completed ?? 0;
              const total = metrics?.total ?? 0;
              return (
                <div
                  key={item.title}
                  className={`rounded-2xl border border-slate-100 bg-gradient-to-br ${item.gradient} p-4 shadow-sm hover:shadow-md transition-shadow`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className={`mt-1 ${item.accent}`}>
                        <CheckCircle size={18} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {item.title}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          {item.description}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-bold ${item.accent}`}>
                        {percent}%
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {completed}/{total} schools
                      </div>
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="h-2 w-full rounded-full bg-white/70 border border-white/60 overflow-hidden">
                      <div
                        className={`h-full ${item.bar} transition-all`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-slate-900">
                School Activity Status
              </h3>
              <span className="text-xs text-slate-500">
                Live today per school
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {schools.map((school) => {
                const status = dailyChecklist.perSchool[school.id] || {
                  attendance: false,
                  teacherAttendance: false,
                  assessments: false,
                  timetable: false,
                  notices: false,
                };
                const activityItems = [
                  { label: "Attendance", value: status.attendance },
                  {
                    label: "Teacher Attendance",
                    value: status.teacherAttendance,
                  },
                  { label: "Assessments", value: status.assessments },
                  { label: "Timetable", value: status.timetable },
                  { label: "Notices", value: status.notices },
                ];
                const completedCount = activityItems.filter(
                  (item) => item.value,
                ).length;

                return (
                  <div
                    key={school.id}
                    className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-slate-500">School</p>
                        <p className="text-lg font-semibold text-slate-900">
                          {school.name}
                        </p>
                        <p className="text-xs text-slate-400">{school.code}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-500">Completion</p>
                        <p className="text-lg font-bold text-emerald-600">
                          {completedCount}/{activityItems.length}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                      {activityItems.map((item) => (
                        <div
                          key={item.label}
                          className={`flex items-center justify-between rounded-lg border px-2 py-1.5 ${
                            item.value
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-slate-200 bg-slate-50 text-slate-500"
                          }`}
                        >
                          <span>{item.label}</span>
                          <span className="font-semibold">
                            {item.value ? "Done" : "Pending"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
