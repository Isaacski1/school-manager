import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Timestamp } from "firebase/firestore";
import { useAuth } from "../../context/AuthContext";
import { UserRole } from "../../types";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { School } from "../../types";
import Modal from "../../components/Modal";
import {
  superAdminAiChat,
  confirmSuperAdminAiAction,
  AiChatAction,
  AiChatMessage,
  AiActionValidationResult,
  AiUndoMeta,
  validateSuperAdminAiAction,
  undoSuperAdminAiAction,
  submitSuperAdminAiFeedback,
  getSuperAdminAiMetrics,
  getSuperAdminDashboardOverview,
} from "../../services/backendApi";
import showToast from "../../services/toast";
import { clearClientCache, resolveClientCache } from "../../services/clientCache";
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
  Bot,
  SendHorizontal,
  ShieldCheck,
  Plus,
  MessageSquare,
  Sparkles,
  Pin,
  Pencil,
  Copy,
  Check,
  Trash2,
  ThumbsUp,
  ThumbsDown,
  Undo2,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
} from "recharts";

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

const ChartSurface: React.FC<{
  height: number;
  className?: string;
  children:
    | React.ReactNode
    | ((size: { width: number; height: number }) => React.ReactNode);
}> = ({ height, className = "", children }) => {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const updateSize = () => {
      const nextWidth = Math.floor(node.getBoundingClientRect().width);
      setWidth((previousWidth) =>
        previousWidth === nextWidth ? previousWidth : nextWidth,
      );
    };

    updateSize();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateSize);
      return () => window.removeEventListener("resize", updateSize);
    }

    const observer = new ResizeObserver(() => updateSize());
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: "100%", height: `${height}px` }}
    >
      {typeof children === "function"
        ? width > 0
          ? children({ width, height })
          : null
        : children}
    </div>
  );
};

const normalizePaymentStatus = (status?: string) => {
  const normalized = String(status || "pending").toLowerCase();
  if (["success", "paid", "active"].includes(normalized)) return "success";
  if (["failed", "failure", "past_due"].includes(normalized)) return "failed";
  if (["abandoned", "cancelled", "canceled"].includes(normalized))
    return "failed";
  return "pending";
};

const supportsCompactNotation = (() => {
  try {
    const formatter = new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
    });
    return formatter.format(1250).length > 0;
  } catch {
    return false;
  }
})();

const formatNumericValue = (value: number, maximumFractionDigits = 2) => {
  const normalized = Number.isFinite(value) ? value : 0;
  const absolute = Math.abs(normalized);
  const fixed = absolute.toFixed(maximumFractionDigits);
  const trimmed =
    maximumFractionDigits > 0 ? fixed.replace(/\.?0+$/, "") : fixed;
  const parts = trimmed.split(".");
  const withSeparators = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body = parts[1] ? `${withSeparators}.${parts[1]}` : withSeparators;
  return normalized < 0 ? `-${body}` : body;
};

const formatCurrencyFallback = (value: number, currency: string) =>
  `${currency} ${formatNumericValue(value, 2)}`;

const formatCompactCurrencyFallback = (value: number, currency: string) => {
  const absolute = Math.abs(value);
  const suffixes = [
    { threshold: 1_000_000_000, suffix: "B" },
    { threshold: 1_000_000, suffix: "M" },
    { threshold: 1_000, suffix: "K" },
  ];
  for (const entry of suffixes) {
    if (absolute >= entry.threshold) {
      const compact = value / entry.threshold;
      return `${currency} ${formatNumericValue(compact, 1)}${entry.suffix}`;
    }
  }
  return formatCurrencyFallback(value, currency);
};

const formatCurrency = (value: number, currency = "GHS") => {
  const normalizedValue = Number.isFinite(value) ? value : 0;
  try {
    return new Intl.NumberFormat("en-GH", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(normalizedValue);
  } catch {
    return formatCurrencyFallback(normalizedValue, currency);
  }
};

const formatCompactCurrency = (value: number, currency = "GHS") => {
  const normalizedValue = Number.isFinite(value) ? value : 0;
  if (!supportsCompactNotation || Math.abs(normalizedValue) < 1000) {
    return formatCurrency(normalizedValue, currency);
  }
  try {
    return new Intl.NumberFormat("en-GH", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(normalizedValue);
  } catch {
    return formatCompactCurrencyFallback(normalizedValue, currency);
  }
};

const toSafeDate = (value?: Timestamp | number | string | Date | null) => {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? null : value;
  const d = new Date(value as any);
  return Number.isNaN(d.getTime()) ? null : d;
};

const normalizeAmount = (amount?: number) => {
  if (!amount) return 0;
  return amount >= 100 ? amount / 100 : amount;
};

const normalizeMethodLabel = (value?: string) => {
  const raw = String(value || "").trim();
  if (!raw) return "Unknown";
  const cleaned = raw.replace(/_/g, " ").toLowerCase();
  return cleaned.replace(/\b\w/g, (m) => m.toUpperCase());
};

const PLAN_ORDER = ["free", "trial", "monthly", "termly", "yearly"] as const;
type PlanType = (typeof PLAN_ORDER)[number];
const PLAN_SET = new Set<PlanType>(PLAN_ORDER);

const normalizeText = (value: unknown, fallback = "") => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || fallback;
  }
  if (value === null || value === undefined) return fallback;
  const normalized = String(value).trim();
  return normalized || fallback;
};

const normalizePlan = (value: unknown): PlanType => {
  const normalized = normalizeText(value, "trial").toLowerCase();
  return PLAN_SET.has(normalized as PlanType)
    ? (normalized as PlanType)
    : "trial";
};

const normalizeStatus = (value: unknown): School["status"] => {
  const normalized = normalizeText(value, "active").toLowerCase();
  return normalized === "inactive" ? "inactive" : "active";
};

const getSchoolName = (value: unknown) => normalizeText(value, "Unnamed School");

const getSchoolCode = (value: unknown, schoolId = "") => {
  const normalized = normalizeText(value);
  if (normalized) return normalized;
  const suffix = schoolId.slice(-6).toUpperCase();
  return suffix ? `SCH-${suffix}` : "--";
};

const PLAN_COLORS: Record<PlanType, string> = {
  free: "#10b981",
  trial: "#f59e0b",
  monthly: "#2563eb",
  termly: "#22c55e",
  yearly: "#8b5cf6",
};

const PLAN_GRADIENTS: Record<PlanType, { from: string; to: string }> = {
  free: { from: "#6ee7b7", to: "#10b981" },
  trial: { from: "#fdba74", to: "#f59e0b" },
  monthly: { from: "#60a5fa", to: "#2563eb" },
  termly: { from: "#4ade80", to: "#22c55e" },
  yearly: { from: "#c4b5fd", to: "#8b5cf6" },
};

const PAYMENT_CHANNEL_COLORS = [
  "#0B4A82",
  "#14b8a6",
  "#f59e0b",
  "#8b5cf6",
  "#ef4444",
  "#06b6d4",
];

const REVENUE_RANGE_OPTIONS = [
  { label: "3M", value: 3 },
  { label: "6M", value: 6 },
  { label: "12M", value: 12 },
] as const;
type RevenueRangeValue = (typeof REVENUE_RANGE_OPTIONS)[number]["value"];

const buildRollingMonths = (count: number) => {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const offset = count - 1 - index;
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleString("en-US", { month: "short" });
    const shortLabel = d.toLocaleString("en-US", {
      month: "short",
      year: "2-digit",
    });
    const fullLabel = d.toLocaleString("en-US", {
      month: "short",
      year: "numeric",
    });
    return { key, label, shortLabel, fullLabel, date: d };
  });
};

const getMonthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const buildRecord = <T,>(
  keys: string[],
  createInitialValue: () => T,
): Record<string, T> => {
  const result: Record<string, T> = {};
  keys.forEach((key) => {
    result[key] = createInitialValue();
  });
  return result;
};

const RiskBadge: React.FC<{ level: "low" | "medium" | "high" }> = ({
  level,
}) => {
  const styles =
    level === "high"
      ? "bg-rose-50 text-rose-600"
      : level === "medium"
        ? "bg-amber-50 text-amber-600"
        : "bg-emerald-50 text-emerald-600";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${styles}`}
    >
      {level === "high"
        ? "High risk"
        : level === "medium"
          ? "Watch"
          : "Healthy"}
    </span>
  );
};

const ChartTooltip: React.FC<{
  active?: boolean;
  payload?: any[];
  label?: string;
  currency?: string;
}> = ({ active, payload, label, currency = "GHS" }) => {
  if (!active || !payload?.length) return null;
  const resolvedLabel = payload[0]?.payload?.tooltipLabel ?? label;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-lg text-xs">
      <div className="font-semibold text-slate-800 mb-1">{resolvedLabel}</div>
      {payload.map((entry, idx) => (
        <div key={`${entry.name}-${idx}`} className="flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-slate-500">{entry.name}:</span>
          <span className="font-semibold text-slate-800">
            {entry.name?.toLowerCase().includes("revenue")
              ? formatCurrency(entry.value || 0, currency)
              : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
};

type PaymentRecord = {
  id: string;
  amount?: number;
  currency?: string;
  status?: string;
  module?: string;
  schoolId?: string;
  schoolName?: string;
  createdAt?: Timestamp | number | string;
  paymentMethod?: string;
  method?: string;
  channel?: string;
  provider?: string;
  paymentType?: string;
};

type ActivityEntry = {
  id: string;
  eventType?: string;
  schoolId?: string | null;
  actorRole?: string | null;
  actorUid?: string | null;
  entityId?: string | null;
  meta?: Record<string, any> | null;
  createdAt?: Timestamp | number | string;
};

const formatActivityDate = (value?: Timestamp | number | string) => {
  if (!value) return "—";
  if (value instanceof Timestamp) return value.toDate().toLocaleString();
  const date = new Date(value as any);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
};

const formatActivityLabel = (entry: ActivityEntry) => {
  const type = entry.eventType || "activity";
  const meta = entry.meta || {};
  switch (type) {
    case "school_created":
      return `School created (${meta.name || "Unnamed"})`;
    case "school_admin_created":
      return `School admin created (${meta.email || "email"})`;
    case "school_admin_password_reset":
      return `School admin password reset (${meta.email || "email"})`;
    case "user_provisioned":
      return `User provisioned (${meta.email || "email"})`;
    case "teacher_created":
      return `Teacher created (${meta.email || "email"})`;
    case "backup_created":
      return `Backup created (${meta.term || "term"} ${meta.academicYear || ""})`;
    case "billing_initiated":
      return `Billing initiated (${meta.currency || "GHS"} ${meta.amount || ""})`;
    case "billing_verified_success":
      return "Billing verified (success)";
    case "billing_verified_failed":
      return "Billing verified (failed)";
    case "billing_webhook_success":
      return "Billing webhook (success)";
    case "billing_webhook_failed":
      return "Billing webhook (failed)";
    default:
      return type.replace(/_/g, " ");
  }
};

const EarningsOverview: React.FC<{
  loading: boolean;
  schools: School[];
  payments: PaymentRecord[];
  billingPayments: PaymentRecord[];
  paymentMetrics: {
    paidAmount: number;
    paidCount: number;
    pendingCount: number;
    failedCount: number;
    last30Amount: number;
    successRate: number;
    monthlySeries: { label: string; value: number }[];
    monthlyFeesSeries: { label: string; value: number }[];
  };
  planDist: Record<string, number>;
  expiredSubscriptions: Array<School & { planEndsAt: Date; graceEndsAt: Date }>;
  kpis: {
    total: number;
    active: number;
    inactive: number;
    trial: number;
    free: number;
    paid: number;
    newSchools: number;
    activeLast7: number;
  };
}> = ({
  loading,
  schools,
  payments,
  billingPayments,
  paymentMetrics,
  planDist,
  expiredSubscriptions,
  kpis,
}) => {
  const [revenueRange, setRevenueRange] = useState<RevenueRangeValue>(12);

  const normalizedBillingPayments = useMemo(() => {
    return billingPayments.map((payment) => {
      const createdAt = toSafeDate(payment.createdAt);
      return {
        ...payment,
        createdAt,
        normalizedStatus: normalizePaymentStatus(payment.status),
        normalizedAmount: normalizeAmount(payment.amount),
        normalizedMethod: normalizeMethodLabel(
          payment.paymentMethod ||
            payment.method ||
            payment.channel ||
            payment.provider ||
            payment.paymentType,
        ),
      };
    });
  }, [billingPayments]);

  const normalizedPayments = useMemo(() => {
    return payments.map((payment) => {
      const createdAt = toSafeDate(payment.createdAt);
      return {
        ...payment,
        createdAt,
        normalizedStatus: normalizePaymentStatus(payment.status),
        normalizedAmount: normalizeAmount(payment.amount),
        normalizedMethod: normalizeMethodLabel(
          payment.paymentMethod ||
            payment.method ||
            payment.channel ||
            payment.provider ||
            payment.paymentType,
        ),
      };
    });
  }, [payments]);

  const latestBillingBySchool = useMemo(() => {
    const map = new Map<string, { amount: number; date: Date }>();
    normalizedBillingPayments.forEach((payment) => {
      if (payment.normalizedStatus !== "success") return;
      if (!payment.schoolId || !payment.createdAt) return;
      const current = map.get(payment.schoolId);
      if (!current || current.date < payment.createdAt) {
        map.set(payment.schoolId, {
          amount: payment.normalizedAmount,
          date: payment.createdAt,
        });
      }
    });
    return map;
  }, [normalizedBillingPayments]);

  const revenueTrend = useMemo(() => {
    const buckets = buildRollingMonths(12);
    const totals = buildRecord(
      buckets.map((b) => b.key),
      () => 0,
    );
    const counts = buildRecord(
      buckets.map((b) => b.key),
      () => 0,
    );
    normalizedBillingPayments.forEach((payment) => {
      if (payment.normalizedStatus !== "success") return;
      if (!payment.createdAt) return;
      const key = getMonthKey(payment.createdAt);
      if (totals[key] === undefined) return;
      totals[key] += payment.normalizedAmount;
      counts[key] += 1;
    });
    return buckets.map((bucket) => ({
      label: bucket.fullLabel,
      axisLabel: bucket.shortLabel,
      tooltipLabel: bucket.fullLabel,
      date: bucket.date,
      revenue: totals[bucket.key] || 0,
      count: counts[bucket.key] || 0,
    }));
  }, [normalizedBillingPayments]);

  const filteredRevenueTrend = useMemo(() => {
    return revenueTrend.slice(-revenueRange);
  }, [revenueRange, revenueTrend]);

  const revenueDateSpan = useMemo(() => {
    const start = filteredRevenueTrend[0]?.date;
    const end = filteredRevenueTrend[filteredRevenueTrend.length - 1]?.date;
    if (!start || !end) return null;
    const formatMonth = (value: Date) =>
      value.toLocaleString("en-US", {
        month: "short",
        year: "numeric",
      });
    return `${formatMonth(start)} - ${formatMonth(end)}`;
  }, [filteredRevenueTrend]);

  const paymentStatusTrend = useMemo(() => {
    const buckets = buildRollingMonths(6);
    const totals = buildRecord(
      buckets.map((b) => b.key),
      () => ({ success: 0, pending: 0, failed: 0 }),
    ) as Record<string, { success: number; pending: number; failed: number }>;
    normalizedPayments.forEach((payment) => {
      if (!payment.createdAt) return;
      const key = getMonthKey(payment.createdAt);
      if (!totals[key]) return;
      totals[key][payment.normalizedStatus] += 1;
    });
    return buckets.map((bucket) => ({
      label: bucket.label,
      success: totals[bucket.key]?.success || 0,
      pending: totals[bucket.key]?.pending || 0,
      failed: totals[bucket.key]?.failed || 0,
    }));
  }, [normalizedPayments]);

  const planRevenue = useMemo(() => {
    const totals: Record<PlanType, number> = {
      free: 0,
      trial: 0,
      monthly: 0,
      termly: 0,
      yearly: 0,
    };
    const planBySchool = new Map<string, PlanType>();
    schools.forEach((school) => {
      const plan = normalizePlan(school.plan);
      planBySchool.set(school.id, plan);
    });
    normalizedBillingPayments.forEach((payment) => {
      if (payment.normalizedStatus !== "success") return;
      if (!payment.schoolId) return;
      const plan = planBySchool.get(payment.schoolId) || "trial";
      totals[plan] += payment.normalizedAmount;
    });
    return totals;
  }, [normalizedBillingPayments, schools]);

  const planRevenueSeries = useMemo(() => {
    return PLAN_ORDER.map((plan) => ({
      plan,
      label: plan.charAt(0).toUpperCase() + plan.slice(1),
      revenue: planRevenue[plan] || 0,
    }));
  }, [planRevenue]);

  const maxPlanRevenue = useMemo(() => {
    return Math.max(0, ...planRevenueSeries.map((plan) => plan.revenue));
  }, [planRevenueSeries]);

  const planDistributionSeries = useMemo(() => {
    const total = PLAN_ORDER.reduce(
      (sum, plan) => sum + Number(planDist[plan] || 0),
      0,
    );
    let offset = 0;

    const segments = PLAN_ORDER.map((plan) => {
      const value = Number(planDist[plan] || 0);
      const percentage = total > 0 ? (value / total) * 100 : 0;
      const segment = {
        plan,
        value,
        percentage,
        offset,
      };

      offset += percentage;
      return segment;
    }).filter((segment) => segment.value > 0);

    return { total, segments };
  }, [planDist]);

  const paymentChannelSeries = useMemo(() => {
    const totals = new Map<string, { count: number; amount: number }>();
    normalizedBillingPayments.forEach((payment) => {
      if (payment.normalizedStatus !== "success") return;
      const key = payment.normalizedMethod;
      const current = totals.get(key) || { count: 0, amount: 0 };
      totals.set(key, {
        count: current.count + 1,
        amount: current.amount + payment.normalizedAmount,
      });
    });
    return Array.from(totals.entries())
      .map(([label, data]) => ({ label, ...data }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6);
  }, [normalizedBillingPayments]);

  const lifecycleMetrics = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const newSubscriptions = schools.filter((school) => {
      const createdAt = toSafeDate(school.createdAt);
      if (!createdAt) return false;
      return createdAt >= monthStart;
    }).length;
    const renewals = normalizedBillingPayments.filter((payment) => {
      if (payment.normalizedStatus !== "success") return false;
      if (!payment.createdAt) return false;
      if (!payment.schoolId) return false;
      const school = schools.find((s) => s.id === payment.schoolId);
      if (!school) return false;
      const createdAt = toSafeDate(school.createdAt);
      return (
        !!createdAt && createdAt < monthStart && payment.createdAt >= monthStart
      );
    }).length;
    const trialsEndingSoon = schools.filter((school) => {
      if (normalizePlan(school.plan) !== "trial") return false;
      const ends = toSafeDate(school.planEndsAt);
      if (!ends) return false;
      const diffDays = (ends.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      return diffDays >= 0 && diffDays <= 14;
    }).length;
    const expiredCount = expiredSubscriptions.length;
    const overdueCount = expiredSubscriptions.length;
    const churnRisk = schools.filter((school) => {
      const paid = !["free", "trial"].includes(normalizePlan(school.plan));
      return (
        paid &&
        (school.status === "inactive" ||
          !!expiredSubscriptions.find((e) => e.id === school.id))
      );
    }).length;

    return {
      newSubscriptions,
      renewals,
      trialsEndingSoon,
      expiredCount,
      overdueCount,
      churnRisk,
    };
  }, [schools, normalizedBillingPayments, expiredSubscriptions]);

  const mrrMetrics = useMemo(() => {
    let mrr = 0;
    const byPlan: Record<PlanType, number> = {
      free: 0,
      trial: 0,
      monthly: 0,
      termly: 0,
      yearly: 0,
    };
    schools.forEach((school) => {
      const plan = normalizePlan(school.plan);
      if (["free", "trial"].includes(plan)) return;
      const latestPayment = latestBillingBySchool.get(school.id);
      if (!latestPayment) return;
      let monthlyValue = 0;
      if (plan === "monthly") monthlyValue = latestPayment.amount;
      if (plan === "termly") monthlyValue = latestPayment.amount / 3;
      if (plan === "yearly") monthlyValue = latestPayment.amount / 12;
      byPlan[plan] += monthlyValue;
      mrr += monthlyValue;
    });
    const arr = mrr * 12;
    return { mrr, arr, byPlan };
  }, [schools, latestBillingBySchool]);

  const planPerformance = useMemo(() => {
    return PLAN_ORDER.map((plan) => {
      const schoolsOnPlan = schools.filter(
        (school) => normalizePlan(school.plan) === plan,
      );
      const activeCount = schoolsOnPlan.filter(
        (school) => school.status === "active",
      ).length;
      const revenue = planRevenue[plan] || 0;
      const avgRevenue = schoolsOnPlan.length
        ? revenue / schoolsOnPlan.length
        : 0;
      const monthlyValue = mrrMetrics.byPlan[plan] || 0;
      const expiredCount = expiredSubscriptions.filter(
        (school) => normalizePlan(school.plan) === plan,
      ).length;
      const expiredRate = schoolsOnPlan.length
        ? expiredCount / schoolsOnPlan.length
        : 0;
      const level: "low" | "medium" | "high" =
        expiredRate > 0.2 ? "high" : expiredRate > 0.1 ? "medium" : "low";
      return {
        plan,
        schoolsCount: schoolsOnPlan.length,
        activeCount,
        revenue,
        avgRevenue,
        monthlyValue,
        level,
      };
    });
  }, [schools, planRevenue, mrrMetrics.byPlan, expiredSubscriptions]);

  const revenueGrowth = useMemo(() => {
    const current = revenueTrend[revenueTrend.length - 1]?.revenue || 0;
    const previous = revenueTrend[revenueTrend.length - 2]?.revenue || 0;
    const change = previous ? ((current - previous) / previous) * 100 : 0;
    return { current, previous, change };
  }, [revenueTrend]);

  const insightPanel = useMemo(() => {
    const currentMonthStart = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1,
    );
    const revenueByPlanCurrent: Record<PlanType, number> = {
      free: 0,
      trial: 0,
      monthly: 0,
      termly: 0,
      yearly: 0,
    };
    const planBySchool = new Map<string, PlanType>();
    schools.forEach((school) => {
      planBySchool.set(
        school.id,
        normalizePlan(school.plan),
      );
    });
    normalizedBillingPayments.forEach((payment) => {
      if (payment.normalizedStatus !== "success") return;
      if (!payment.createdAt || payment.createdAt < currentMonthStart) return;
      if (!payment.schoolId) return;
      const plan = planBySchool.get(payment.schoolId) || "trial";
      revenueByPlanCurrent[plan] += payment.normalizedAmount;
    });
    const bestPlan = Object.entries(revenueByPlanCurrent).reduce(
      (acc, [plan, value]) => (value > acc.value ? { plan, value } : acc),
      { plan: "trial", value: 0 },
    );
    const trialRate = kpis.total ? (planDist.trial / kpis.total) * 100 : 0;
    const failureRate =
      paymentMetrics.paidCount + paymentMetrics.failedCount
        ? (paymentMetrics.failedCount /
            (paymentMetrics.paidCount + paymentMetrics.failedCount)) *
          100
        : 0;
    const renewalRisk = kpis.total
      ? (expiredSubscriptions.length / kpis.total) * 100
      : 0;

    return [
      {
        title: "Top revenue plan (month)",
        detail: `${bestPlan.plan.charAt(0).toUpperCase() + bestPlan.plan.slice(1)} • ${formatCurrency(bestPlan.value)}`,
        tone: "success",
      },
      {
        title: "Trial pipeline",
        detail: `${trialRate.toFixed(1)}% of schools on trial`,
        tone: "warning",
      },
      {
        title: "Payment failure signal",
        detail:
          failureRate > 18
            ? `${failureRate.toFixed(1)}% failed payments — review`
            : `${failureRate.toFixed(1)}% failed payments`,
        tone: failureRate > 18 ? "danger" : "neutral",
      },
      {
        title: "Renewal risk",
        detail:
          renewalRisk > 8
            ? `${renewalRisk.toFixed(1)}% overdue subscriptions`
            : `${renewalRisk.toFixed(1)}% overdue subscriptions`,
        tone: renewalRisk > 8 ? "danger" : "neutral",
      },
      {
        title: "Revenue momentum",
        detail:
          revenueGrowth.change >= 0
            ? `Up ${revenueGrowth.change.toFixed(1)}% vs last month`
            : `Down ${Math.abs(revenueGrowth.change).toFixed(1)}% vs last month`,
        tone: revenueGrowth.change >= 0 ? "success" : "danger",
      },
    ];
  }, [
    normalizedBillingPayments,
    planDist.trial,
    kpis.total,
    paymentMetrics.paidCount,
    paymentMetrics.failedCount,
    expiredSubscriptions.length,
    revenueGrowth.change,
    schools,
  ]);

  const hasRevenue = normalizedBillingPayments.some(
    (payment) => payment.normalizedStatus === "success",
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, idx) => (
            <Skeleton key={idx} className="h-28" />
          ))}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="rounded-3xl border border-slate-100 bg-gradient-to-br from-white via-slate-50 to-white p-4 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
              Earnings Overview
            </p>
            <h3 className="text-2xl font-bold text-slate-900 mt-2">
              Subscription revenue intelligence
            </h3>
            <p className="text-sm text-slate-600 mt-1">
              Track revenue flow, plan performance, and renewal risk signals in
              one unified view.
            </p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 text-xs text-slate-500 lg:w-auto lg:justify-end">
            <span className="inline-flex max-w-full items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-center leading-tight sm:text-left">
              {kpis.paid} paid schools
            </span>
            <span className="inline-flex max-w-full items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-center leading-tight sm:text-left">
              {paymentMetrics.paidCount} successful payments
            </span>
            <span className="inline-flex max-w-full items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-center leading-tight sm:text-left">
              {paymentMetrics.successRate}% success rate
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          {
            label: "Total Revenue",
            value: formatCurrency(paymentMetrics.paidAmount),
            hint: "All time",
            icon: <BadgeDollarSign size={18} />,
            gradient: "from-emerald-500/20 via-emerald-200/30 to-white",
            ring: "bg-emerald-600",
            glow: "shadow-emerald-100/70",
          },
          {
            label: "Revenue (30d)",
            value: formatCurrency(paymentMetrics.last30Amount),
            hint: "Last 30 days",
            icon: <TrendingUp size={18} />,
            gradient: "from-[#0B4A82]/20 via-blue-200/30 to-white",
            ring: "bg-[#0B4A82]",
            glow: "shadow-blue-100/70",
          },
          {
            label: "Successful Payments",
            value: paymentMetrics.paidCount,
            hint: "Verified transactions",
            icon: <CheckCircle size={18} />,
            gradient: "from-emerald-400/20 via-emerald-200/30 to-white",
            ring: "bg-emerald-500",
            glow: "shadow-emerald-100/70",
          },
          {
            label: "Success Rate",
            value: `${paymentMetrics.successRate}%`,
            hint: "Across all payments",
            icon: <Activity size={18} />,
            gradient: "from-cyan-400/20 via-sky-200/30 to-white",
            ring: "bg-cyan-500",
            glow: "shadow-cyan-100/70",
          },
          {
            label: "Active Paid Schools",
            value: schools.filter(
              (s) =>
                s.status === "active" &&
                !["free", "trial"].includes(normalizePlan(s.plan)),
            ).length,
            hint: "Currently billable",
            icon: <Users size={18} />,
            gradient: "from-indigo-400/20 via-indigo-200/30 to-white",
            ring: "bg-indigo-500",
            glow: "shadow-indigo-100/70",
          },
          {
            label: "Expired Subscriptions",
            value: expiredSubscriptions.length,
            hint: "Grace ended",
            icon: <AlertTriangle size={18} />,
            gradient: "from-rose-400/20 via-rose-200/30 to-white",
            ring: "bg-rose-500",
            glow: "shadow-rose-100/70",
          },
          {
            label: "Estimated MRR",
            value: formatCurrency(mrrMetrics.mrr),
            hint: "Monthly recurring",
            icon: <Wallet size={18} />,
            gradient: "from-amber-400/20 via-amber-200/30 to-white",
            ring: "bg-amber-500",
            glow: "shadow-amber-100/70",
          },
          {
            label: "Estimated ARR",
            value: formatCurrency(mrrMetrics.arr),
            hint: "Annualized",
            icon: <BadgeDollarSign size={18} />,
            gradient: "from-violet-400/20 via-violet-200/30 to-white",
            ring: "bg-violet-500",
            glow: "shadow-violet-100/70",
          },
        ].map((item) => (
          <div
            key={item.label}
            className={`min-w-0 rounded-2xl border border-slate-100 bg-gradient-to-br ${item.gradient} p-4 sm:p-5 shadow-sm hover:shadow-lg transition-all ${item.glow}`}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1 pr-0 sm:pr-3">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                  {item.label}
                </p>
                <div
                  className="mt-3 truncate text-[clamp(1.35rem,5.3vw,2rem)] font-bold leading-tight text-slate-900 tabular-nums"
                  title={String(item.value)}
                >
                  {item.value}
                </div>
                <p className="text-xs text-slate-500 mt-2">{item.hint}</p>
              </div>
              <span
                className={`h-11 w-11 sm:h-10 sm:w-10 self-end sm:self-auto flex-shrink-0 rounded-2xl ${item.ring} text-white flex items-center justify-center shadow-md`}
              >
                {item.icon}
              </span>
            </div>
            <div className="mt-4 h-1.5 rounded-full bg-white/70 border border-white/60 overflow-hidden">
              <div className={`h-full ${item.ring}`} style={{ width: "62%" }} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="xl:col-span-2 p-4 sm:p-6">
          <div className="flex flex-col gap-3 mb-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <h4 className="text-lg font-semibold text-slate-900">
                Revenue Flow ({revenueRange} months)
              </h4>
              <p className="text-xs text-slate-500">
                Successful billing collections with monthly momentum
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                <span>
                  {revenueDateSpan || "Building date range"}
                </span>
                <span className="h-1 w-1 rounded-full bg-slate-300" />
                <span>
                  {filteredRevenueTrend.length > 0
                    ? `${filteredRevenueTrend.length} months tracked`
                    : "Building chart data"}
                </span>
              </div>
            </div>
            <div className="inline-flex w-fit rounded-full border border-slate-200 bg-white p-1 shadow-sm">
              {REVENUE_RANGE_OPTIONS.map((option) => {
                const isActive = revenueRange === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setRevenueRange(option.value)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                      isActive
                        ? "bg-[#0B4A82] text-white"
                        : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
          <ChartSurface
            height={288}
            className="rounded-lg border border-slate-200 bg-gradient-to-br from-slate-50 to-white overflow-hidden"
          >
            {filteredRevenueTrend && filteredRevenueTrend.length > 0 ? (
              ({ width, height }) => (
                <AreaChart
                  width={width}
                  height={height}
                  data={filteredRevenueTrend}
                  margin={{ left: 40, right: 20, top: 10, bottom: 10 }}
                >
                  <defs>
                    <linearGradient
                      id="revGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor="#0B4A82"
                        stopOpacity={0.35}
                      />
                      <stop
                        offset="100%"
                        stopColor="#0B4A82"
                        stopOpacity={0.05}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="axisLabel"
                    tick={{ fontSize: 11 }}
                    minTickGap={16}
                  />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value) => `${Math.round(value / 1000)}k`}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    name="Revenue"
                    stroke="#0B4A82"
                    strokeWidth={2}
                    fill="url(#revGradient)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              )
            ) : (
              <div className="h-full flex items-center justify-center">
                <EmptyState
                  icon={
                    <BadgeDollarSign className="text-slate-300" size={40} />
                  }
                  title="No revenue recorded"
                  description="Successful billing transactions will appear here once schools start paying."
                />
              </div>
            )}
          </ChartSurface>
        </Card>

        <Card className="min-w-0 p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-lg font-semibold text-slate-900">
                Payment Status Mix
              </h4>
              <p className="text-xs text-slate-500">
                Success vs pending vs failed trends
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#E6F0FA] text-[#0B4A82] flex items-center justify-center">
              <Wallet size={18} />
            </div>
          </div>
          <ChartSurface
            height={240}
            className="rounded-lg border border-slate-200 bg-gradient-to-br from-slate-50 to-white overflow-hidden"
          >
            {paymentStatusTrend && paymentStatusTrend.length > 0 ? (
              ({ width, height }) => (
                <BarChart
                  width={width}
                  height={height}
                  data={paymentStatusTrend}
                  margin={{ top: 10, right: 20, bottom: 10, left: 40 }}
                  barSize={12}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar
                    dataKey="success"
                    stackId="a"
                    name="Success"
                    minPointSize={0}
                    fill="#10b981"
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey="pending"
                    stackId="a"
                    name="Pending"
                    minPointSize={0}
                    fill="#f59e0b"
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey="failed"
                    stackId="a"
                    name="Failed"
                    minPointSize={0}
                    fill="#f43f5e"
                    isAnimationActive={false}
                  />
                </BarChart>
              )
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <p className="text-slate-500 text-sm">No payment data yet</p>
                  <p className="text-slate-400 text-xs mt-1">
                    Payment transactions will appear as they are processed
                  </p>
                </div>
              </div>
            )}
          </ChartSurface>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
            {[
              { label: "Success", color: "#10b981" },
              { label: "Pending", color: "#f59e0b" },
              { label: "Failed", color: "#f43f5e" },
            ].map((item) => (
              <div
                key={item.label}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-600"
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="font-medium">{item.label}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-2 text-xs text-slate-600">
            <div className="flex items-center justify-between">
              <span>Successful payments</span>
              <span className="font-semibold text-slate-900">
                {paymentMetrics.paidCount}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Pending payments</span>
              <span className="font-semibold text-slate-900">
                {paymentMetrics.pendingCount}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Failed payments</span>
              <span className="font-semibold text-slate-900">
                {paymentMetrics.failedCount}
              </span>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="min-w-0 p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-lg font-semibold text-slate-900">
                Plan Distribution
              </h4>
              <p className="text-xs text-slate-500">School split by plan</p>
            </div>
            <PieChart size={18} className="text-slate-400" />
          </div>
          <ChartSurface
            height={224}
            className="rounded-lg border border-slate-200 bg-gradient-to-br from-slate-50 to-white overflow-hidden"
          >
            {planDistributionSeries.total > 0 ? (
              <div className="flex h-full items-center justify-center">
                <div className="relative h-40 w-40">
                  <svg
                    viewBox="0 0 36 36"
                    className="h-full w-full"
                    style={{ transform: "rotate(-90deg)" }}
                  >
                    <circle
                      cx="18"
                      cy="18"
                      r="15.915"
                      fill="none"
                      stroke="#e2e8f0"
                      strokeWidth="6"
                    />
                    {planDistributionSeries.segments.map((segment) => (
                      <circle
                        key={segment.plan}
                        cx="18"
                        cy="18"
                        r="15.915"
                        fill="none"
                        stroke={PLAN_COLORS[segment.plan]}
                        strokeWidth="6"
                        strokeLinecap="round"
                        strokeDasharray={`${segment.percentage} ${100 - segment.percentage}`}
                        strokeDashoffset={-segment.offset}
                      />
                    ))}
                  </svg>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                    <div className="text-[11px] font-medium uppercase tracking-widest text-slate-400">
                      Schools
                    </div>
                    <div className="mt-1 text-2xl font-bold text-slate-900">
                      {planDistributionSeries.total}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <p className="text-slate-500 text-sm">Building plan data</p>
                  <p className="text-slate-400 text-xs mt-1">
                    School plan distribution will appear soon
                  </p>
                </div>
              </div>
            )}
          </ChartSurface>
          <div className="mt-4 space-y-2 text-xs">
            {PLAN_ORDER.map((plan) => (
              <div key={plan} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: PLAN_COLORS[plan] }}
                  />
                  <span className="capitalize text-slate-600">{plan}</span>
                </div>
                <span className="font-semibold text-slate-900">
                  {planDist[plan] || 0}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="xl:col-span-2 p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-lg font-semibold text-slate-900">
                Plan Revenue Contribution
              </h4>
              <p className="text-xs text-slate-500">
                Revenue mix by plan tier (successful billing)
              </p>
            </div>
            <BadgeDollarSign size={18} className="text-slate-400" />
          </div>
          <ChartSurface
            height={344}
            className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-slate-100 overflow-hidden"
          >
            {() => {
              const guideRatios = [1, 0.5, 0];

              return (
                <div className="grid h-full grid-rows-[1fr_auto] gap-3 px-3 py-4 sm:px-5 sm:py-5">
                  <div className="relative min-h-0">
                    <div className="pointer-events-none absolute inset-0">
                      {guideRatios.map((ratio) => (
                        <div
                          key={ratio}
                          className="absolute inset-x-0 border-t border-dashed border-slate-200/90"
                          style={{ bottom: `${ratio * 100}%` }}
                        />
                      ))}
                    </div>

                    <div className="relative z-10 grid h-full grid-cols-5 items-end gap-2 sm:gap-4">
                      {planRevenueSeries.map((plan) => {
                        const ratio =
                          maxPlanRevenue > 0 ? plan.revenue / maxPlanRevenue : 0;
                        const fillHeight =
                          plan.revenue > 0
                            ? `${Math.max(18, ratio * 100)}%`
                            : "10px";

                        return (
                          <div
                            key={plan.plan}
                            className="flex h-full min-w-0 flex-col items-center justify-end gap-2"
                          >
                            <div className="w-full px-1">
                              <div
                                className="inline-flex w-full items-center justify-center rounded-full border bg-white/95 px-1.5 py-1 text-[10px] font-semibold text-slate-700 shadow-sm sm:px-2.5"
                                style={{
                                  borderColor: `${PLAN_COLORS[plan.plan]}28`,
                                }}
                              >
                                <span className="truncate">
                                  {formatCompactCurrency(plan.revenue)}
                                </span>
                              </div>
                            </div>

                            <div className="flex h-full w-full items-end justify-center px-0.5">
                              <div className="relative flex h-full w-full max-w-[78px] items-end overflow-hidden rounded-[24px] border border-slate-200/80 bg-white/80 p-2 shadow-inner shadow-slate-200/70">
                                <div className="absolute inset-2 rounded-[18px] bg-slate-100/90" />
                                <div
                                  className="absolute inset-x-3 bottom-2 h-6 rounded-[14px] bg-white/55"
                                  aria-hidden="true"
                                />
                                <div
                                  className="relative z-10 w-full rounded-[16px] shadow-[0_18px_32px_-24px_rgba(15,23,42,0.95)] transition-[height] duration-300"
                                  style={{
                                    height: fillHeight,
                                    opacity: plan.revenue > 0 ? 1 : 0.35,
                                    background: `linear-gradient(180deg, ${PLAN_GRADIENTS[plan.plan].from} 0%, ${PLAN_GRADIENTS[plan.plan].to} 100%)`,
                                    border: `1px solid ${PLAN_COLORS[plan.plan]}33`,
                                  }}
                                >
                                  <div
                                    className="absolute inset-x-0 top-0 h-8 bg-white/10"
                                    aria-hidden="true"
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-5 gap-2 sm:gap-4">
                    {planRevenueSeries.map((plan) => (
                      <div key={plan.plan} className="min-w-0">
                        <div
                          className="inline-flex w-full items-center justify-center gap-1.5 rounded-full border bg-white/92 px-2 py-1 text-[10px] font-semibold text-slate-600 shadow-sm sm:text-[11px]"
                          style={{
                            borderColor: `${PLAN_COLORS[plan.plan]}26`,
                          }}
                        >
                          <span
                            className="h-2 w-2 flex-none rounded-full"
                            style={{ backgroundColor: PLAN_COLORS[plan.plan] }}
                          />
                          <span className="truncate capitalize">
                            {plan.label}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }}
          </ChartSurface>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 text-xs">
            {planRevenueSeries.map((plan) => (
              <div
                key={plan.plan}
                className="min-w-0 rounded-2xl border bg-white p-3.5 shadow-sm transition-transform duration-200 hover:-translate-y-0.5"
                style={{
                  borderColor: `${PLAN_COLORS[plan.plan]}22`,
                  background: `linear-gradient(135deg, ${PLAN_GRADIENTS[plan.plan].from}16 0%, #ffffff 72%)`,
                }}
              >
                <div className="flex items-center gap-2 text-slate-500">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: PLAN_COLORS[plan.plan] }}
                  />
                  <span className="capitalize">{plan.label}</span>
                </div>
                <div className="mt-1 break-words text-[clamp(0.95rem,2.6vw,1.125rem)] font-semibold leading-tight text-slate-900">
                  {formatCurrency(plan.revenue)}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-lg font-semibold text-slate-900">
                Renewal Intelligence
              </h4>
              <p className="text-xs text-slate-500">
                Lifecycle signals this month
              </p>
            </div>
            <Clock size={18} className="text-slate-400" />
          </div>
          <div className="space-y-3 text-xs">
            {[
              {
                label: "New subscriptions",
                value: lifecycleMetrics.newSubscriptions,
                color: "text-emerald-600",
              },
              {
                label: "Renewals",
                value: lifecycleMetrics.renewals,
                color: "text-blue-600",
              },
              {
                label: "Trials ending soon",
                value: lifecycleMetrics.trialsEndingSoon,
                color: "text-amber-600",
              },
              {
                label: "Expired",
                value: lifecycleMetrics.expiredCount,
                color: "text-rose-600",
              },
              {
                label: "Overdue after grace",
                value: lifecycleMetrics.overdueCount,
                color: "text-rose-600",
              },
              {
                label: "Churn risk",
                value: lifecycleMetrics.churnRisk,
                color: "text-slate-700",
              },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between rounded-lg border border-slate-100 bg-white px-3 py-2"
              >
                <span className="text-slate-600">{item.label}</span>
                <span className={`font-semibold ${item.color}`}>
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-lg font-semibold text-slate-900">
                Payment Channels
              </h4>
              <p className="text-xs text-slate-500">Collections by method</p>
            </div>
            <Wallet size={18} className="text-slate-400" />
          </div>
          <ChartSurface
            height={Math.max(240, paymentChannelSeries.length * 76 + 28)}
            className="rounded-lg border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-slate-100 overflow-hidden"
          >
            {paymentChannelSeries.length > 0 ? (
              (() => {
                const maxAmount = Math.max(
                  ...paymentChannelSeries.map((entry) => entry.amount),
                  1,
                );

                return (
                  <div className="grid h-full content-center gap-3 px-3 py-4 sm:gap-4 sm:px-5 sm:py-5">
                    {paymentChannelSeries.map((item, index) => {
                      const accent =
                        PAYMENT_CHANNEL_COLORS[
                          index % PAYMENT_CHANNEL_COLORS.length
                        ];
                      const widthPercent =
                        item.amount > 0
                          ? Math.max(14, (item.amount / maxAmount) * 100)
                          : 0;

                      return (
                        <div
                          key={item.label}
                          className="space-y-2 rounded-xl border border-slate-200/80 bg-white/80 p-2.5 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0"
                        >
                          <div className="grid gap-2 text-xs sm:flex sm:items-center sm:justify-between sm:gap-3">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <span
                                className="inline-block h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: accent }}
                              />
                              <span className="min-w-0 max-w-[11rem] truncate font-medium text-slate-600 sm:max-w-none">
                                {item.label}
                              </span>
                              <span className="shrink-0 whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                                {item.count} payment
                                {item.count === 1 ? "" : "s"}
                              </span>
                            </div>
                            <span className="shrink-0 text-[11px] font-semibold tabular-nums text-slate-900 sm:text-xs">
                              {formatCurrency(item.amount)}
                            </span>
                          </div>

                          <div className="h-3.5 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200/80 sm:h-4">
                            <div
                              className="h-full rounded-full shadow-[0_10px_20px_-12px_rgba(15,23,42,0.9)]"
                              style={{
                                width: `${widthPercent}%`,
                                background: `linear-gradient(90deg, ${accent}cc 0%, ${accent} 100%)`,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()
            ) : (
              <div className="h-full flex items-center justify-center">
                <EmptyState
                  icon={<Wallet className="text-slate-300" size={40} />}
                  title="No channel data"
                  description="Payment methods will appear once billing transactions are completed."
                />
              </div>
            )}
          </ChartSurface>
          <div className="mt-4 space-y-2 text-xs">
            {paymentChannelSeries.map((item, index) => (
              <div
                key={item.label}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <span className="flex min-w-0 items-center gap-2 text-slate-600">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{
                      backgroundColor:
                        PAYMENT_CHANNEL_COLORS[
                          index % PAYMENT_CHANNEL_COLORS.length
                        ],
                    }}
                  />
                  <span className="truncate">{item.label}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-slate-900">
                  {formatCurrency(item.amount)}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-slate-50 via-white to-slate-50 p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-lg font-semibold text-slate-900">
                Revenue Insights
              </h4>
              <p className="text-xs text-slate-500">
                Auto-generated from live data
              </p>
            </div>
            <TrendingUp size={18} className="text-slate-400" />
          </div>
          <div className="space-y-3">
            {insightPanel.map((insight) => (
              <div
                key={insight.title}
                className="rounded-xl border border-slate-100 bg-white p-3"
              >
                <div className="text-xs font-semibold text-slate-500">
                  {insight.title}
                </div>
                <div
                  className={`text-sm font-semibold mt-1 ${
                    insight.tone === "success"
                      ? "text-emerald-600"
                      : insight.tone === "danger"
                        ? "text-rose-600"
                        : insight.tone === "warning"
                          ? "text-amber-600"
                          : "text-slate-700"
                  }`}
                >
                  {insight.detail}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-lg font-semibold text-slate-900">
              Plan Performance Table
            </h4>
            <p className="text-xs text-slate-500">
              Revenue and risk benchmarks across subscription tiers
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-slate-400">
                <th className="py-2 pr-4">Plan</th>
                <th className="py-2 pr-4">Schools</th>
                <th className="py-2 pr-4">Active</th>
                <th className="py-2 pr-4">Revenue</th>
                <th className="py-2 pr-4">Avg / School</th>
                <th className="py-2 pr-4">Est. Monthly</th>
                <th className="py-2">Risk</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {planPerformance.map((row) => (
                <tr key={row.plan} className="text-slate-600">
                  <td className="py-3 pr-4 capitalize font-semibold text-slate-800">
                    {row.plan}
                  </td>
                  <td className="py-3 pr-4">{row.schoolsCount}</td>
                  <td className="py-3 pr-4">{row.activeCount}</td>
                  <td className="py-3 pr-4">{formatCurrency(row.revenue)}</td>
                  <td className="py-3 pr-4">
                    {formatCurrency(row.avgRevenue)}
                  </td>
                  <td className="py-3 pr-4">
                    {formatCurrency(row.monthlyValue)}
                  </td>
                  <td className="py-3">
                    <RiskBadge level={row.level} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-lg font-semibold text-slate-900">
              Recent Payment Records
            </h4>
            <p className="text-xs text-slate-500">
              Latest billing transactions from super admin payment history
            </p>
          </div>
          <Wallet size={18} className="text-slate-400" />
        </div>

        {normalizedBillingPayments.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-slate-400">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">School</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2 pr-4">Method</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {normalizedBillingPayments.slice(0, 10).map((payment) => (
                  <tr
                    key={payment.id}
                    className="text-slate-600 hover:bg-slate-50"
                  >
                    <td className="py-3 pr-4 text-xs">
                      {payment.createdAt
                        ? payment.createdAt.toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="py-3 pr-4 font-medium text-slate-800">
                      {payment.schoolName || "Unknown"}
                    </td>
                    <td className="py-3 pr-4 font-semibold text-emerald-600">
                      {formatCurrency(payment.normalizedAmount)}
                    </td>
                    <td className="py-3 pr-4">
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                        {payment.normalizedMethod}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                          payment.normalizedStatus === "success"
                            ? "bg-emerald-50 text-emerald-700"
                            : payment.normalizedStatus === "pending"
                              ? "bg-amber-50 text-amber-700"
                              : "bg-rose-50 text-rose-700"
                        }`}
                      >
                        {payment.normalizedStatus}
                      </span>
                    </td>
                    <td className="py-3 text-xs text-slate-400 font-mono">
                      {payment.id}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={<BadgeDollarSign className="text-slate-300" size={40} />}
            title="No payment records"
            description="Payment transactions will appear here as schools complete billing."
          />
        )}

        {normalizedBillingPayments.length > 10 && (
          <div className="mt-4 text-center">
            <p className="text-xs text-slate-500">
              Showing 10 of {normalizedBillingPayments.length} total payment
              records
            </p>
          </div>
        )}
      </Card>
    </div>
  );
};

type AiConversationMessage = AiChatMessage & {
  id: string;
  createdAt: number;
  mode?: "local" | "openai";
  responseMs?: number;
  dataAsOf?: number | null;
};

type AiConversationEntry = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  messages: AiConversationMessage[];
  pendingAction: AiChatAction | null;
  pendingValidation: AiActionValidationResult | null;
  lastUndo: AiUndoMeta | null;
};

type AiMetricsSnapshot = {
  success: boolean;
  periodDays: number;
  totalChats: number;
  avgResponseMs: number;
  p95ResponseMs: number;
  fallbackRate: number;
  actionSuccessRate: number;
  feedbackPositiveRate: number;
  positiveFeedback: number;
  negativeFeedback: number;
};

const sortAiConversations = (items: AiConversationEntry[]) =>
  [...items].sort(
    (a, b) =>
      Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
      b.updatedAt - a.updatedAt,
  );

const buildApiMessages = (
  messages: AiConversationMessage[],
): AiChatMessage[] => {
  const maxWindow = 20;
  if (messages.length <= maxWindow) {
    return messages.map((message) => ({
      role: message.role,
      content: message.content,
    }));
  }

  const recent = messages.slice(-16);
  const older = messages.slice(0, -16).filter((message) => message.role !== "system");
  const olderUserSnippets = older
    .filter((message) => message.role === "user")
    .slice(-4)
    .map((message) => message.content.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 3);
  const olderAssistantSnippets = older
    .filter((message) => message.role === "assistant")
    .slice(-3)
    .map((message) => message.content.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 2);

  const summaryLines = [
    olderUserSnippets.length
      ? `Recent user intents: ${olderUserSnippets.join(" | ")}`
      : "",
    olderAssistantSnippets.length
      ? `Recent assistant outcomes: ${olderAssistantSnippets.join(" | ")}`
      : "",
  ].filter(Boolean);

  const summaryMessage: AiChatMessage | null = summaryLines.length
    ? {
        role: "system",
        content: `Conversation summary for continuity:\n${summaryLines.join("\n")}`,
      }
    : null;

  const payload = [
    ...(summaryMessage ? [summaryMessage] : []),
    ...recent.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  ];
  return payload.slice(-maxWindow);
};

const Dashboard: React.FC = () => {
  const AI_ASSISTANT_NAME = "Isaacski AI";
  const AI_HISTORY_STORAGE_KEY = "super_admin_ai_history_v1";
  const AI_FEEDBACK_STORAGE_KEY = "super_admin_ai_feedback_v1";
  const createAiConversation = (): AiConversationEntry => {
    const now = Date.now();
    return {
      id: `ai-${now}-${Math.random().toString(36).slice(2, 8)}`,
      title: "New chat",
      createdAt: now,
      updatedAt: now,
      pinned: false,
      messages: [
        {
          id: `msg-${now}-welcome`,
          createdAt: now,
          role: "assistant",
          content:
            "Hello Super Admin. I can help analyze system data and propose actions. Ask me anything.",
        },
      ],
      pendingAction: null,
      pendingValidation: null,
      lastUndo: null,
    };
  };
  const normalizeAiReply = (reply?: string) =>
    String(reply || "")
      .replace(/^isaacski ai is active\.?\s*/i, "")
      .replace(/^isaacski ai summary:\s*/i, "")
      .trim();
  const toConversationMessage = (
    role: AiChatMessage["role"],
    content: string,
    extra?: Partial<AiConversationMessage>,
  ): AiConversationMessage => {
    const now = Date.now();
    return {
      id: `msg-${now}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: now,
      role,
      content,
      ...extra,
    };
  };
  const buildConversationTitle = (input: string) => {
    const normalized = input.replace(/\s+/g, " ").trim();
    if (!normalized) return "New chat";
    if (normalized.length <= 40) return normalized;
    return `${normalized.slice(0, 40).trimEnd()}...`;
  };
  const formatConversationTime = (timestamp: number) => {
    try {
      return new Date(timestamp).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "Just now";
    }
  };
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  // Restrict this page to super-admin users only to avoid permission errors
  if (!user || user.role !== UserRole.SUPER_ADMIN) {
    return (
      <div className="p-8">
        <EmptyState
          icon={<ShieldCheck size={36} className="text-amber-500" />}
          title="Access denied"
          description="You do not have permission to view the Super Admin dashboard."
          action={{
            label: "Go to my dashboard",
            onClick: () => (window.location.href = "/"),
          }}
        />
      </div>
    );
  }
  const [schools, setSchools] = useState<School[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [activityFilter, setActivityFilter] = useState<string>("");
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [paymentsError, setPaymentsError] = useState<string | null>(null);
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
  const DASHBOARD_CACHE_KEY = "super_admin_dashboard_overview_v1";
  const DASHBOARD_CACHE_TTL_MS = 45_000;
  const [aiOpen, setAiOpen] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiValidationLoading, setAiValidationLoading] = useState(false);
  const [aiMetricsLoading, setAiMetricsLoading] = useState(false);
  const [aiTyping, setAiTyping] = useState(false);
  const [aiHistoryOpenMobile, setAiHistoryOpenMobile] = useState(false);
  const [aiHistorySearch, setAiHistorySearch] = useState("");
  const [aiCopiedMessageId, setAiCopiedMessageId] = useState<string | null>(
    null,
  );
  const [aiEditingMessageId, setAiEditingMessageId] = useState<string | null>(
    null,
  );
  const [aiEditDraft, setAiEditDraft] = useState("");
  const [aiMessageFeedback, setAiMessageFeedback] = useState<
    Record<string, "up" | "down">
  >(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(AI_FEEDBACK_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  });
  const [aiMetrics, setAiMetrics] = useState<AiMetricsSnapshot | null>(null);
  const [aiConversations, setAiConversations] = useState<AiConversationEntry[]>(
    () => {
      if (typeof window === "undefined") return [createAiConversation()];
      try {
        const raw = window.localStorage.getItem(AI_HISTORY_STORAGE_KEY);
        if (!raw) return [createAiConversation()];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed) || parsed.length === 0) {
          return [createAiConversation()];
        }
        const normalized = parsed
          .filter(
            (item) =>
              item &&
              typeof item.id === "string" &&
              Array.isArray(item.messages) &&
              item.messages.length > 0,
          )
          .map((item) => ({
            id: item.id,
            title:
              typeof item.title === "string" && item.title.trim()
                ? item.title
                : "New chat",
            createdAt:
              typeof item.createdAt === "number" ? item.createdAt : Date.now(),
            updatedAt:
              typeof item.updatedAt === "number" ? item.updatedAt : Date.now(),
            pinned: Boolean(item.pinned),
            messages: (item.messages as AiConversationMessage[]).map(
              (message, index) => ({
                id:
                  typeof message.id === "string" && message.id
                    ? message.id
                    : `msg-${Date.now()}-${index}`,
                createdAt:
                  typeof message.createdAt === "number"
                    ? message.createdAt
                    : Date.now(),
                role: message.role || "assistant",
                content: String(message.content || ""),
                mode: message.mode,
                responseMs:
                  typeof message.responseMs === "number"
                    ? message.responseMs
                    : undefined,
                dataAsOf:
                  typeof message.dataAsOf === "number"
                    ? message.dataAsOf
                    : null,
              }),
            ),
            pendingAction: (item.pendingAction || null) as AiChatAction | null,
            pendingValidation:
              (item.pendingValidation ||
                null) as AiActionValidationResult | null,
            lastUndo: (item.lastUndo || null) as AiUndoMeta | null,
          }));
        return normalized.length
          ? sortAiConversations(normalized)
          : [createAiConversation()];
      } catch {
        return [createAiConversation()];
      }
    },
  );
  const [activeConversationId, setActiveConversationId] = useState<string>("");
  const aiMessagesViewportRef = React.useRef<HTMLDivElement | null>(null);
  const typingTimerRef = React.useRef<number | null>(null);
  const activeConversation = useMemo(() => {
    if (!aiConversations.length) return null;
    return (
      aiConversations.find((item) => item.id === activeConversationId) ||
      aiConversations[0]
    );
  }, [aiConversations, activeConversationId]);
  const filteredAiConversations = useMemo(() => {
    const keyword = aiHistorySearch.toLowerCase().trim();
    if (!keyword) return aiConversations;
    return aiConversations.filter((conversation) => {
      if (conversation.title.toLowerCase().includes(keyword)) return true;
      return conversation.messages.some((message) =>
        message.content.toLowerCase().includes(keyword),
      );
    });
  }, [aiConversations, aiHistorySearch]);

  const refreshAiMetrics = useCallback(async () => {
    setAiMetricsLoading(true);
    try {
      const snapshot = await getSuperAdminAiMetrics();
      setAiMetrics(snapshot);
    } catch (error) {
      console.warn("[Dashboard] Failed to load AI metrics", error);
    } finally {
      setAiMetricsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!aiConversations.length) return;
    const conversationExists = aiConversations.some(
      (item) => item.id === activeConversationId,
    );
    if (!activeConversationId || !conversationExists) {
      setActiveConversationId(aiConversations[0].id);
    }
  }, [aiConversations, activeConversationId]);

  useEffect(() => {
    setAiEditingMessageId(null);
    setAiEditDraft("");
    setAiCopiedMessageId(null);
  }, [activeConversationId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        AI_HISTORY_STORAGE_KEY,
        JSON.stringify(
          aiConversations.slice(0, 40).map((conversation) => ({
            ...conversation,
            messages: conversation.messages.slice(-120),
          })),
        ),
      );
    } catch {
      // ignore local storage errors
    }
  }, [aiConversations, AI_HISTORY_STORAGE_KEY]);

  const closeAiModal = useCallback(() => {
    setAiOpen(false);
    const params = new URLSearchParams(location.search);
    const hadAssistantFlag = params.has("assistant") || params.has("ai");
    if (!hadAssistantFlag) return;
    params.delete("assistant");
    params.delete("ai");
    const nextQuery = params.toString();
    navigate(
      {
        pathname: location.pathname,
        search: nextQuery ? `?${nextQuery}` : "",
      },
      { replace: true },
    );
  }, [location.pathname, location.search, navigate]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const shouldOpenAssistant =
      params.get("assistant") === "1" || params.get("ai") === "1";
    if (shouldOpenAssistant) {
      setAiOpen(true);
    }
  }, [location.search]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        AI_FEEDBACK_STORAGE_KEY,
        JSON.stringify(aiMessageFeedback),
      );
    } catch {
      // ignore local storage errors
    }
  }, [aiMessageFeedback, AI_FEEDBACK_STORAGE_KEY]);

  useEffect(() => {
    const viewport = aiMessagesViewportRef.current;
    if (!viewport) return;
    viewport.scrollTop = viewport.scrollHeight;
  }, [
    activeConversationId,
    activeConversation?.messages.length,
    aiLoading,
    aiTyping,
  ]);

  useEffect(() => {
    if (!aiOpen) return;
    refreshAiMetrics();
  }, [aiOpen, refreshAiMetrics]);

  useEffect(
    () => () => {
      if (typingTimerRef.current) {
        window.clearInterval(typingTimerRef.current);
      }
    },
    [],
  );

  const loadData = useCallback(
    async (options?: { forceRefresh?: boolean }) => {
      const forceRefresh = Boolean(options?.forceRefresh);
      setLoading(true);
      setPaymentsError(null);
      try {
        if (forceRefresh) {
          clearClientCache(DASHBOARD_CACHE_KEY);
        }
        const payload = await resolveClientCache(
          DASHBOARD_CACHE_KEY,
          DASHBOARD_CACHE_TTL_MS,
          async () =>
            getSuperAdminDashboardOverview({
              forceRefresh,
              schoolsLimit: 800,
              activityLimit: 120,
              paymentsLimit: 1200,
              checklistLimit: 12000,
            }),
          { forceRefresh },
        );

        const normalizedSchools: School[] = (payload?.schools || []).map((row: any) => ({
          ...(row || {}),
          id: String(row?.id || ""),
          name: getSchoolName(row?.name),
          code: getSchoolCode(row?.code, row?.id),
          logoUrl: normalizeText(row?.logoUrl),
          plan: normalizePlan(row?.plan),
          status: normalizeStatus(row?.status),
          createdAt: row?.createdAt || null,
        }));
        const normalizedActivity: ActivityEntry[] = (payload?.activity || []).map(
          (row: any) => ({
            id: String(row?.id || ""),
            ...row,
            createdAt: row?.createdAt || null,
            schoolId: row?.schoolId || "",
            eventType: row?.eventType || "activity",
          }),
        );
        const normalizedPayments: PaymentRecord[] = (payload?.payments || []).map(
          (row: any) => ({
            id: String(row?.id || ""),
            ...row,
            amount: row?.amount ?? row?.amountPaid ?? 0,
            createdAt: row?.createdAt ?? row?.paidAt ?? row?.verifiedAt ?? null,
            paymentMethod: row?.paymentMethod ?? row?.method ?? row?.channel,
            method: row?.method ?? row?.paymentMethod,
            channel: row?.channel ?? row?.paymentMethod ?? row?.method,
            provider: row?.provider ?? row?.gateway ?? row?.processor,
            paymentType: row?.paymentType ?? row?.payment_method ?? row?.type,
            module: row?.module ?? "billing",
            type: row?.type ?? "subscription",
            category: row?.category ?? "subscription",
          }),
        );

        setSchools(normalizedSchools);
        setActivity(normalizedActivity);
        setPayments(normalizedPayments);

        const fallbackDailySummary = {
          attendance: { completed: 0, total: normalizedSchools.length },
          teacherAttendance: { completed: 0, total: normalizedSchools.length },
          assessments: { completed: 0, total: normalizedSchools.length },
          timetable: { completed: 0, total: normalizedSchools.length },
          notices: { completed: 0, total: normalizedSchools.length },
        };
        setDailyChecklist({
          summary: payload?.dailyChecklist?.summary || fallbackDailySummary,
          perSchool: payload?.dailyChecklist?.perSchool || {},
        });
        setLastUpdated(
          payload?.generatedAt ? new Date(payload.generatedAt) : new Date(),
        );
      } catch (err) {
        console.error(err);
        setPaymentsError("Unable to load payment history.");
      } finally {
        setLoading(false);
      }
    },
    [DASHBOARD_CACHE_KEY],
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // KPI calculations (unchanged logic)
  const kpis = useMemo(() => {
    const total = schools.length;
    const active = schools.filter((s) => s.status === "active").length;
    const inactive = schools.filter((s) => s.status === "inactive").length;
    const trial = schools.filter((s) => normalizePlan(s.plan) === "trial").length;
    const free = schools.filter((s) => normalizePlan(s.plan) === "free").length;
    const paid = schools.filter((s) => {
      const plan = normalizePlan(s.plan);
      return plan !== "trial" && plan !== "free";
    }).length;
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

  const activityFeed = useMemo(() => {
    if (!activityFilter) return activity;
    return activity.filter((entry) => entry.eventType === activityFilter);
  }, [activity, activityFilter]);

  const billingPayments = useMemo(() => {
    return payments.filter((payment) => {
      // Check multiple field names for billing/subscription indicator
      const moduleValue = String((payment as any).module || "").toLowerCase();
      const typeValue = String((payment as any).type || "").toLowerCase();
      const categoryValue = String(
        (payment as any).category || "",
      ).toLowerCase();
      const paymentTypeValue = String(
        (payment as any).paymentType || "",
      ).toLowerCase();

      // Identify billing/subscription payments by checking various fields
      const isBillingModule =
        moduleValue === "billing" || moduleValue.includes("billing");
      const isBillingType =
        typeValue === "subscription" ||
        typeValue === "billing" ||
        typeValue === "school_billing";
      const isBillingCategory =
        categoryValue === "subscription" || categoryValue === "billing";
      const isBillingPaymentType =
        paymentTypeValue.includes("billing") ||
        paymentTypeValue.includes("subscription");

      // Also include payments that have schoolId and amount (indicating school subscription payment)
      const isSchoolSubscription =
        (payment as any).schoolId && (payment as any).amount;

      return (
        isBillingModule ||
        isBillingType ||
        isBillingCategory ||
        isBillingPaymentType ||
        isSchoolSubscription
      );
    });
  }, [payments]);

  const paymentMetrics = useMemo(() => {
    const now = new Date();
    const monthBuckets: { key: string; label: string }[] = [];
    for (let month = 0; month < 12; month += 1) {
      const d = new Date(now.getFullYear(), month, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleString("en-US", { month: "short" });
      monthBuckets.push({ key, label });
    }

    const monthlyTotals = buildRecord(
      monthBuckets.map((bucket) => bucket.key),
      () => 0,
    ) as Record<string, number>;
    const monthlyFeesTotals = buildRecord(
      monthBuckets.map((bucket) => bucket.key),
      () => 0,
    ) as Record<string, number>;

    const last30Cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    let paidAmount = 0;
    let paidCount = 0;
    let pendingCount = 0;
    let failedCount = 0;
    let last30Amount = 0;

    // Use billingPayments for accurate earnings metrics
    billingPayments.forEach((payment) => {
      const status = normalizePaymentStatus(payment.status);
      const amountRaw = payment.amount ?? 0;
      const amount = amountRaw >= 100 ? amountRaw / 100 : amountRaw;
      const createdAt =
        payment.createdAt instanceof Timestamp
          ? payment.createdAt.toDate()
          : new Date(payment.createdAt || 0);

      if (Number.isNaN(createdAt.getTime())) return;

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

    console.log("[Dashboard] Payment metrics calculated", {
      paidAmount,
      paidCount,
      pendingCount,
      failedCount,
      last30Amount,
      successRate,
      billingPaymentCount: billingPayments.length,
      totalPaymentCount: payments.length,
    });

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
  }, [billingPayments, payments]);

  const earningsData = useMemo(() => {
    return payments
      .filter((payment) => normalizePaymentStatus(payment.status) === "success")
      .map((payment) => {
        const amountRaw = payment.amount ?? 0;
        const amount = amountRaw >= 100 ? amountRaw / 100 : amountRaw;
        const createdAt =
          payment.createdAt instanceof Timestamp
            ? payment.createdAt.toDate()
            : new Date(payment.createdAt || 0);
        const date = Number.isNaN(createdAt.getTime())
          ? new Date().toISOString().slice(0, 10)
          : createdAt.toISOString().slice(0, 10);
        const method =
          payment.paymentMethod ||
          payment.method ||
          payment.channel ||
          payment.provider ||
          payment.paymentType ||
          "Unknown";

        return {
          date,
          totalCollections: amount,
          feesCollections: amount,
          outstanding: 0,
          transactions: 1,
          paymentMethod: method,
          className: payment.schoolName || "School",
          createdAt: payment.createdAt ?? null,
        };
      });
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
      const p = normalizePlan(s.plan);
      counts[p] = (counts[p] || 0) + 1;
    });
    return counts;
  }, [schools]);

  const filteredSchools = schools.filter((s) => {
    const schoolName = getSchoolName(s.name);
    if (search && !schoolName.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    if (statusFilter && s.status !== statusFilter) return false;
    if (planFilter && normalizePlan(s.plan) !== planFilter) return false;
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
    .filter((s) => normalizePlan(s.plan) === "trial" && s.planEndsAt)
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
    .filter((s) => normalizePlan(s.plan) !== "free" && s.planEndsAt)
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

  const createNewConversation = () => {
    const nextConversation = createAiConversation();
    setAiConversations((prev) => sortAiConversations([nextConversation, ...prev]));
    setActiveConversationId(nextConversation.id);
    setAiInput("");
    setAiHistoryOpenMobile(false);
  };

  const renameConversation = (conversationId: string) => {
    const current = aiConversations.find((item) => item.id === conversationId);
    if (!current) return;
    const nextTitle = window.prompt("Rename conversation", current.title);
    if (nextTitle === null) return;
    const title = buildConversationTitle(nextTitle);
    setAiConversations((prev) =>
      sortAiConversations(
        prev.map((item) =>
          item.id === conversationId
            ? { ...item, title, updatedAt: Date.now() }
            : item,
        ),
      ),
    );
  };

  const toggleConversationPin = (conversationId: string) => {
    setAiConversations((prev) =>
      sortAiConversations(
        prev.map((item) =>
          item.id === conversationId
            ? { ...item, pinned: !item.pinned, updatedAt: Date.now() }
            : item,
        ),
      ),
    );
  };

  const deleteConversation = (conversationId: string) => {
    setAiConversations((prev) => {
      const remaining = prev.filter((item) => item.id !== conversationId);
      const next = remaining.length ? sortAiConversations(remaining) : [createAiConversation()];
      if (!next.some((item) => item.id === activeConversationId)) {
        setActiveConversationId(next[0].id);
      }
      return next;
    });
  };

  const appendAssistantMessageWithTyping = useCallback(
    async (conversationId: string, message: AiConversationMessage) => {
      const fullText = message.content || "";
      const placeholder: AiConversationMessage = { ...message, content: "" };
      setAiConversations((prev) =>
        sortAiConversations(
          prev.map((item) =>
            item.id === conversationId
              ? {
                  ...item,
                  updatedAt: Date.now(),
                  messages: [...item.messages, placeholder],
                }
              : item,
          ),
        ),
      );

      if (!fullText) return;
      setAiTyping(true);

      await new Promise<void>((resolve) => {
        let cursor = 0;
        const step = Math.max(2, Math.ceil(fullText.length / 28));
        if (typingTimerRef.current) {
          window.clearInterval(typingTimerRef.current);
        }

        typingTimerRef.current = window.setInterval(() => {
          cursor = Math.min(fullText.length, cursor + step);
          const partial = fullText.slice(0, cursor);
          setAiConversations((prev) =>
            prev.map((item) =>
              item.id === conversationId
                ? {
                    ...item,
                    updatedAt: Date.now(),
                    messages: item.messages.map((entry) =>
                      entry.id === placeholder.id
                        ? { ...entry, content: partial }
                        : entry,
                    ),
                  }
                : item,
            ),
          );

          if (cursor >= fullText.length) {
            if (typingTimerRef.current) {
              window.clearInterval(typingTimerRef.current);
              typingTimerRef.current = null;
            }
            setAiTyping(false);
            resolve();
          }
        }, 14);
      });
    },
    [],
  );

  const requestAssistantReply = useCallback(
    async (conversationId: string, nextMessages: AiConversationMessage[]) => {
      setAiLoading(true);
      try {
        const messagesForApi = buildApiMessages(nextMessages);
        const response = await superAdminAiChat({ messages: messagesForApi });
        const normalizedReply =
          normalizeAiReply(response.reply) ||
          "I could not generate a response. Please try again.";
        let validation: AiActionValidationResult | null = null;

        if (response.action) {
          setAiValidationLoading(true);
          try {
            validation = await validateSuperAdminAiAction({
              action: response.action,
            });
          } catch (error) {
            console.warn("[Dashboard] AI action validation failed", error);
          } finally {
            setAiValidationLoading(false);
          }
        }

        setAiConversations((prev) =>
          sortAiConversations(
            prev.map((item) =>
              item.id === conversationId
                ? {
                    ...item,
                    updatedAt: Date.now(),
                    pendingAction: response.action || null,
                    pendingValidation: validation,
                  }
                : item,
            ),
          ),
        );
        await appendAssistantMessageWithTyping(
          conversationId,
          toConversationMessage("assistant", normalizedReply, {
            mode: response.mode,
            responseMs: response.responseMs,
            dataAsOf: response.dataAsOf ?? null,
          }),
        );
        refreshAiMetrics();
      } catch (error: any) {
        showToast(error?.message || "AI chat failed", { type: "error" });
        await appendAssistantMessageWithTyping(
          conversationId,
          toConversationMessage(
            "assistant",
            "I could not complete that request right now. Please try again.",
          ),
        );
      } finally {
        setAiValidationLoading(false);
        setAiLoading(false);
      }
    },
    [appendAssistantMessageWithTyping, refreshAiMetrics],
  );

  const copyAiMessage = async (message: AiConversationMessage) => {
    const text = String(message.content || "").trim();
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setAiCopiedMessageId(message.id);
      window.setTimeout(() => {
        setAiCopiedMessageId((prev) => (prev === message.id ? null : prev));
      }, 1400);
      showToast("Message copied", { type: "success" });
    } catch {
      showToast("Could not copy message", { type: "error" });
    }
  };

  const startAiMessageEdit = (message: AiConversationMessage) => {
    if (message.role !== "user" || aiLoading) return;
    setAiEditingMessageId(message.id);
    setAiEditDraft(message.content);
  };

  const cancelAiMessageEdit = () => {
    setAiEditingMessageId(null);
    setAiEditDraft("");
  };

  const saveAiMessageEditAndRegenerate = async (messageId: string) => {
    const trimmed = aiEditDraft.trim();
    if (!trimmed || aiLoading || !activeConversation) return;
    const conversationId = activeConversation.id;
    const targetIndex = activeConversation.messages.findIndex(
      (message) => message.id === messageId && message.role === "user",
    );
    if (targetIndex < 0) {
      showToast("Unable to edit that message", { type: "error" });
      return;
    }

    const nextMessages = activeConversation.messages
      .slice(0, targetIndex + 1)
      .map((message, index) =>
        index === targetIndex
          ? { ...message, content: trimmed, createdAt: Date.now() }
          : message,
      );

    setAiConversations((prev) =>
      sortAiConversations(
        prev.map((item) =>
          item.id === conversationId
            ? {
                ...item,
                title:
                  item.title === "New chat"
                    ? buildConversationTitle(trimmed)
                    : item.title,
                updatedAt: Date.now(),
                pendingAction: null,
                pendingValidation: null,
                lastUndo: null,
                messages: nextMessages,
              }
            : item,
        ),
      ),
    );
    setAiEditingMessageId(null);
    setAiEditDraft("");
    await requestAssistantReply(conversationId, nextMessages);
  };

  const sendAiMessage = async () => {
    const trimmed = aiInput.trim();
    if (!trimmed || aiLoading || !activeConversation) return;
    const conversationId = activeConversation.id;
    const userMessage = toConversationMessage("user", trimmed);
    const nextMessages: AiConversationMessage[] = [
      ...activeConversation.messages,
      userMessage,
    ];

    setAiConversations((prev) =>
      sortAiConversations(
        prev.map((item) =>
          item.id === conversationId
            ? {
                ...item,
                title:
                  item.title === "New chat"
                    ? buildConversationTitle(trimmed)
                    : item.title,
                updatedAt: Date.now(),
                pendingAction: null,
                pendingValidation: null,
                messages: nextMessages,
              }
            : item,
        ),
      ),
    );
    setAiInput("");
    await requestAssistantReply(conversationId, nextMessages);
  };

  const confirmAiAction = async () => {
    if (!activeConversation?.pendingAction || aiLoading) return;
    const conversationId = activeConversation.id;
    const action = activeConversation.pendingAction;
    setAiLoading(true);
    setAiValidationLoading(true);
    try {
      const validation = await validateSuperAdminAiAction({ action });
      setAiConversations((prev) =>
        sortAiConversations(
          prev.map((item) =>
            item.id === conversationId
              ? { ...item, pendingValidation: validation, updatedAt: Date.now() }
              : item,
          ),
        ),
      );

      if (!validation.valid) {
        const validationText = `I cannot execute this action yet. Missing fields: ${validation.missingFields.join(", ")}.`;
        await appendAssistantMessageWithTyping(
          conversationId,
          toConversationMessage("assistant", validationText),
        );
        showToast("Action is missing required fields", { type: "error" });
        return;
      }

      const response = await confirmSuperAdminAiAction({
        action: {
          ...action,
          description: validation.description,
          payload: validation.payload,
        },
      });
      showToast("Action completed successfully", { type: "success" });
      setAiConversations((prev) =>
        sortAiConversations(
          prev.map((item) =>
            item.id === conversationId
              ? {
                  ...item,
                  updatedAt: Date.now(),
                  pendingAction: null,
                  pendingValidation: null,
                  lastUndo: response.undo || null,
                }
              : item,
          ),
        ),
      );
      await appendAssistantMessageWithTyping(
        conversationId,
        toConversationMessage(
          "assistant",
          response.undo
            ? `Action completed: ${response.actionType}. You can undo this for the next 15 minutes.`
            : `Action completed: ${response.actionType}.`,
        ),
      );
      void loadData({ forceRefresh: true });
      refreshAiMetrics();
    } catch (error: any) {
      showToast(error?.message || "Action failed", { type: "error" });
      await appendAssistantMessageWithTyping(
        conversationId,
        toConversationMessage(
          "assistant",
          "I could not complete that action. Please review the details and try again.",
        ),
      );
    } finally {
      setAiValidationLoading(false);
      setAiLoading(false);
    }
  };

  const undoAiAction = async () => {
    if (!activeConversation?.lastUndo || aiLoading) return;
    const conversationId = activeConversation.id;
    setAiLoading(true);
    try {
      const response = await undoSuperAdminAiAction({
        undoToken: activeConversation.lastUndo.undoToken,
      });
      setAiConversations((prev) =>
        sortAiConversations(
          prev.map((item) =>
            item.id === conversationId
              ? { ...item, updatedAt: Date.now(), lastUndo: null }
              : item,
          ),
        ),
      );
      await appendAssistantMessageWithTyping(
        conversationId,
        toConversationMessage("assistant", response.message),
      );
      showToast("Action undone", { type: "success" });
      void loadData({ forceRefresh: true });
      refreshAiMetrics();
    } catch (error: any) {
      showToast(error?.message || "Undo failed", { type: "error" });
    } finally {
      setAiLoading(false);
    }
  };

  const submitMessageFeedback = async (
    conversationId: string,
    message: AiConversationMessage,
    rating: "up" | "down",
  ) => {
    const feedbackKey = `${conversationId}:${message.id}`;
    if (aiMessageFeedback[feedbackKey]) return;
    setAiMessageFeedback((prev) => ({ ...prev, [feedbackKey]: rating }));
    try {
      await submitSuperAdminAiFeedback({
        conversationId,
        messageId: message.id,
        rating,
        message: message.content,
      });
      refreshAiMetrics();
    } catch (error: any) {
      setAiMessageFeedback((prev) => {
        const next = { ...prev };
        delete next[feedbackKey];
        return next;
      });
      showToast(error?.message || "Feedback failed", { type: "error" });
    }
  };

  const cancelAiAction = () => {
    if (!activeConversation) return;
    const conversationId = activeConversation.id;
    setAiConversations((prev) =>
      sortAiConversations(
        prev.map((item) =>
          item.id === conversationId
            ? {
                ...item,
                updatedAt: Date.now(),
                pendingAction: null,
                pendingValidation: null,
              }
            : item,
        ),
      ),
    );
    void appendAssistantMessageWithTyping(
      conversationId,
      toConversationMessage(
        "assistant",
        "Action canceled. Let me know if you want to try something else.",
      ),
    );
  };

  return (
    <div className="p-3 sm:p-6">
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
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <button
                  onClick={() => setAiOpen(true)}
                  className="inline-flex w-full sm:w-auto items-center justify-center gap-2 px-4 py-2 bg-[#0B4A82] text-white rounded-lg text-sm font-medium hover:bg-[#0B4A82] transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#1160A8]"
                >
                  <Bot size={16} />
                  {AI_ASSISTANT_NAME}
                </button>
                <Link
                  to="/super-admin/schools"
                  className="inline-flex w-full sm:w-auto items-center justify-center gap-2 px-4 py-2 bg-[#0B4A82] text-white rounded-lg text-sm font-medium hover:bg-[#0B4A82] transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#1160A8]"
                >
                  <Building size={16} />
                  View Schools
                </Link>
                <button
                  onClick={() => void loadData({ forceRefresh: true })}
                  aria-label="Refresh dashboard"
                  className="inline-flex w-full sm:w-auto items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#1160A8]"
                >
                  <RefreshCw
                    size={16}
                    className="group-hover:rotate-180 transition-transform"
                  />
                  Refresh
                </button>
              </div>
            </div>

            {/* Quick Filters */}
            <div className="flex flex-wrap gap-2 sm:gap-3 mt-6 pt-6 border-t border-slate-100">
              {quickFilters.map((f) => (
                <div
                  key={f.label}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold ${f.color}`}
                >
                  {f.label}: <span className="font-bold">{f.count}</span>
                </div>
              ))}
              <div className="text-xs text-slate-500 flex items-center ml-0 sm:ml-auto">
                {lastUpdated
                  ? `Last updated ${lastUpdated.toLocaleTimeString()}`
                  : "Not updated yet"}
              </div>
            </div>
          </div>
        </div>

        <Modal
          isOpen={aiOpen}
          onClose={closeAiModal}
          title={`${AI_ASSISTANT_NAME} Assistant`}
          className="mx-auto max-w-[94vw] lg:max-w-7xl xl:translate-x-32"
        >
          <div className="space-y-4">
            <div className="rounded-2xl border border-cyan-100 bg-gradient-to-r from-cyan-50 via-white to-blue-50 p-4 shadow-sm">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">
                    <ShieldCheck size={14} />
                    Super Admin • Secure Assistant Workspace
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-white/90 px-3 py-1 text-[11px] font-medium text-cyan-700">
                    <Sparkles size={13} />
                    {AI_ASSISTANT_NAME} • Live Session
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-xl border border-cyan-100 bg-white/90 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">
                      Avg latency
                    </p>
                    <p className="text-sm font-semibold text-slate-800">
                      {aiMetricsLoading
                        ? "..."
                        : `${aiMetrics?.avgResponseMs ?? 0} ms`}
                    </p>
                  </div>
                  <div className="rounded-xl border border-cyan-100 bg-white/90 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">
                      P95 latency
                    </p>
                    <p className="text-sm font-semibold text-slate-800">
                      {aiMetricsLoading
                        ? "..."
                        : `${aiMetrics?.p95ResponseMs ?? 0} ms`}
                    </p>
                  </div>
                  <div className="rounded-xl border border-cyan-100 bg-white/90 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">
                      Positive feedback
                    </p>
                    <p className="text-sm font-semibold text-slate-800">
                      {aiMetricsLoading
                        ? "..."
                        : `${aiMetrics?.feedbackPositiveRate ?? 0}%`}
                    </p>
                  </div>
                  <div className="rounded-xl border border-cyan-100 bg-white/90 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">
                      Fallback usage
                    </p>
                    <p className="text-sm font-semibold text-slate-800">
                      {aiMetricsLoading
                        ? "..."
                        : `${aiMetrics?.fallbackRate ?? 0}%`}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
              <aside className="rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-3 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <button
                    onClick={createNewConversation}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
                  >
                    <Plus size={14} />
                    New Chat
                  </button>
                  <button
                    onClick={() => setAiHistoryOpenMobile((prev) => !prev)}
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-600 lg:hidden"
                  >
                    <MessageSquare size={14} />
                    History
                  </button>
                </div>
                <div className="mb-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5">
                  <Search size={14} className="text-slate-400" />
                  <input
                    value={aiHistorySearch}
                    onChange={(e) => setAiHistorySearch(e.target.value)}
                    placeholder="Search history"
                    className="w-full bg-transparent text-xs text-slate-700 outline-none placeholder:text-slate-400"
                  />
                </div>
                <div
                  className={`space-y-2 overflow-y-auto pr-1 ${aiHistoryOpenMobile ? "max-h-64" : "max-h-0 lg:max-h-[560px]"} transition-all duration-300 lg:max-h-[560px]`}
                >
                  {filteredAiConversations.length === 0 && (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-white p-3 text-center">
                      <p className="text-xs text-slate-500">
                        No matching conversations
                      </p>
                    </div>
                  )}
                  {filteredAiConversations.map((conversation) => (
                    <div
                      key={conversation.id}
                      className={`rounded-xl border px-3 py-2.5 transition-all ${
                        activeConversation?.id === conversation.id
                          ? "border-cyan-300 bg-cyan-50 shadow-sm"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button
                          onClick={() => {
                            setActiveConversationId(conversation.id);
                            setAiHistoryOpenMobile(false);
                          }}
                          className="flex-1 text-left"
                        >
                          <p className="line-clamp-2 text-xs font-semibold text-slate-800">
                            {conversation.title}
                          </p>
                          <p className="mt-1 text-[10px] text-slate-500">
                            {formatConversationTime(conversation.updatedAt)}
                          </p>
                        </button>
                        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                          {conversation.messages.length}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-end gap-1">
                        <button
                          onClick={() => toggleConversationPin(conversation.id)}
                          className={`rounded-lg p-1.5 transition ${
                            conversation.pinned
                              ? "bg-amber-100 text-amber-700"
                              : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                          }`}
                          title={conversation.pinned ? "Unpin" : "Pin"}
                        >
                          <Pin size={13} />
                        </button>
                        <button
                          onClick={() => renameConversation(conversation.id)}
                          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                          title="Rename"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => deleteConversation(conversation.id)}
                          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                          title="Delete"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </aside>

              <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(14,165,233,0.08),transparent_48%)]" />
                <div className="relative border-b border-slate-100 px-4 py-3 sm:px-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">
                        {activeConversation?.title || "New chat"}
                      </p>
                      <p className="text-xs text-slate-500">
                        Select a previous conversation from history to continue
                        where you left off.
                      </p>
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-700">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                      Ready
                    </div>
                  </div>
                </div>

                <div
                  ref={aiMessagesViewportRef}
                  className="relative h-[360px] overflow-y-auto bg-slate-50/80 p-4 sm:h-[440px] sm:p-5"
                >
                  <div className="space-y-3">
                    {(activeConversation?.messages || []).map((message) => {
                      const feedbackKey = `${activeConversation?.id}:${message.id}`;
                      const feedback = aiMessageFeedback[feedbackKey];
                      const isEditingMessage =
                        aiEditingMessageId === message.id && message.role === "user";
                      return (
                        <div
                          key={message.id}
                          className={`flex ${
                            message.role === "user"
                              ? "justify-end"
                              : "justify-start"
                          }`}
                        >
                          <div className="max-w-[92%] sm:max-w-[80%]">
                            {isEditingMessage ? (
                              <div className="rounded-2xl border border-cyan-200 bg-white p-3 shadow-sm">
                                <textarea
                                  value={aiEditDraft}
                                  onChange={(event) => setAiEditDraft(event.target.value)}
                                  onKeyDown={(event) => {
                                    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                                      event.preventDefault();
                                      void saveAiMessageEditAndRegenerate(message.id);
                                    }
                                  }}
                                  rows={3}
                                  className="w-full resize-y rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100"
                                  placeholder="Edit message and regenerate..."
                                />
                                <div className="mt-2 flex items-center justify-end gap-2">
                                  <button
                                    onClick={cancelAiMessageEdit}
                                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() =>
                                      void saveAiMessageEditAndRegenerate(message.id)
                                    }
                                    disabled={aiLoading || !aiEditDraft.trim()}
                                    className="rounded-lg bg-gradient-to-r from-[#0B4A82] to-[#1160A8] px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    Save & Regenerate
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div
                                className={`rounded-2xl px-4 py-3 text-sm shadow-sm transition-all ${
                                  message.role === "user"
                                    ? "bg-gradient-to-r from-[#0B4A82] to-[#1160A8] text-white"
                                    : "border border-slate-200 bg-white text-slate-700"
                                }`}
                              >
                                {message.content}
                              </div>
                            )}
                            <div
                              className={`mt-1 flex flex-wrap items-center gap-2 px-1 ${
                                message.role === "user" ? "justify-end" : ""
                              }`}
                            >
                              {message.role === "assistant" && (
                                <>
                                  {(message.responseMs || message.mode) && (
                                    <span className="text-[10px] text-slate-400">
                                      {message.mode ? `${message.mode} • ` : ""}
                                      {message.responseMs
                                        ? `${message.responseMs} ms`
                                        : ""}
                                    </span>
                                  )}
                                </>
                              )}
                              <button
                                onClick={() => void copyAiMessage(message)}
                                disabled={!message.content.trim()}
                                className={`rounded-md p-1 transition disabled:cursor-not-allowed ${
                                  aiCopiedMessageId === message.id
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                                }`}
                                title={
                                  aiCopiedMessageId === message.id ? "Copied" : "Copy"
                                }
                              >
                                {aiCopiedMessageId === message.id ? (
                                  <Check size={12} />
                                ) : (
                                  <Copy size={12} />
                                )}
                              </button>
                              {message.role === "user" && !isEditingMessage && (
                                <button
                                  onClick={() => startAiMessageEdit(message)}
                                  disabled={aiLoading}
                                  className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
                                  title="Edit and regenerate"
                                >
                                  <Pencil size={12} />
                                </button>
                              )}
                              {message.role === "assistant" && (
                                <>
                                  <button
                                    onClick={() =>
                                      submitMessageFeedback(
                                        activeConversation?.id || "",
                                        message,
                                        "up",
                                      )
                                    }
                                    disabled={Boolean(feedback)}
                                    className={`rounded-md p-1 transition ${
                                      feedback === "up"
                                        ? "bg-emerald-100 text-emerald-700"
                                        : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                                    } disabled:cursor-not-allowed`}
                                    title="Helpful"
                                  >
                                    <ThumbsUp size={12} />
                                  </button>
                                  <button
                                    onClick={() =>
                                      submitMessageFeedback(
                                        activeConversation?.id || "",
                                        message,
                                        "down",
                                      )
                                    }
                                    disabled={Boolean(feedback)}
                                    className={`rounded-md p-1 transition ${
                                      feedback === "down"
                                        ? "bg-rose-100 text-rose-700"
                                        : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                                    } disabled:cursor-not-allowed`}
                                    title="Not helpful"
                                  >
                                    <ThumbsDown size={12} />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {aiLoading && (
                      <div className="flex justify-start">
                        <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500 shadow-sm">
                          <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 animate-bounce" />
                          <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 animate-bounce [animation-delay:120ms]" />
                          <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 animate-bounce [animation-delay:240ms]" />
                          Thinking...
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {activeConversation?.pendingAction && (
                  <div className="border-t border-amber-200 bg-amber-50/70 p-4">
                    <div className="text-sm font-semibold text-amber-900">
                      Action suggested
                    </div>
                    <div className="mt-1 text-xs text-amber-800">
                      {activeConversation.pendingAction.description ||
                        activeConversation.pendingAction.type}
                    </div>
                    {activeConversation.pendingValidation && (
                      <div className="mt-2 space-y-1 rounded-xl border border-amber-200 bg-white/80 p-2.5 text-[11px] text-amber-900">
                        <div className="font-semibold">
                          Validation:{" "}
                          {activeConversation.pendingValidation.valid
                            ? "ready"
                            : "needs input"}
                        </div>
                        {activeConversation.pendingValidation.missingFields
                          .length > 0 && (
                          <div>
                            Missing:{" "}
                            {activeConversation.pendingValidation.missingFields.join(
                              ", ",
                            )}
                          </div>
                        )}
                        {activeConversation.pendingValidation.warnings.length >
                          0 && (
                          <div>
                            Warnings:{" "}
                            {activeConversation.pendingValidation.warnings.join(
                              ", ",
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        onClick={confirmAiAction}
                        disabled={aiValidationLoading || aiLoading}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700"
                      >
                        {aiValidationLoading ? "Validating..." : "Confirm action"}
                      </button>
                      <button
                        onClick={cancelAiAction}
                        disabled={aiLoading}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {activeConversation?.lastUndo && (
                  <div className="border-t border-cyan-200 bg-cyan-50/60 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-cyan-900">
                          Undo available
                        </div>
                        <div className="text-xs text-cyan-800">
                          You can rollback the last action while the undo window is active.
                        </div>
                      </div>
                      <button
                        onClick={undoAiAction}
                        disabled={aiLoading}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-300 bg-white px-3 py-1.5 text-xs font-semibold text-cyan-700 transition hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Undo2 size={12} />
                        Undo action
                      </button>
                    </div>
                  </div>
                )}

                <div className="border-t border-slate-100 bg-white p-3 sm:p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <textarea
                      value={aiInput}
                      onChange={(e) => setAiInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          sendAiMessage();
                        }
                      }}
                      rows={2}
                      className="w-full min-w-0 max-h-40 min-h-[56px] sm:min-h-[48px] sm:flex-1 resize-y rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100"
                      placeholder={`Ask ${AI_ASSISTANT_NAME}...`}
                    />
                    <button
                      onClick={sendAiMessage}
                      disabled={aiLoading || aiTyping || !aiInput.trim()}
                      className="inline-flex h-11 w-full sm:w-auto sm:shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0B4A82] to-[#1160A8] px-4 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <SendHorizontal size={16} />
                      Send
                    </button>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </Modal>

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

        <Card className="mb-8 -mx-1 sm:mx-0 p-4 sm:p-6 md:p-7">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 sm:gap-5 mb-6 sm:mb-7">
            <div>
              <h3 className="text-xl font-semibold text-slate-900">
                Billing Health
              </h3>
              <p className="text-sm text-slate-600">
                Premium payment status overview
              </p>
            </div>
            <div className="flex w-full sm:w-auto items-center justify-between sm:justify-start gap-3">
              <div className="w-12 h-12 rounded-2xl bg-[#E6F0FA] text-[#0B4A82] flex items-center justify-center shadow-sm">
                <Wallet size={20} />
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 sm:px-5 py-2.5 sm:py-3 min-w-[132px]">
                <p className="text-xs text-emerald-600 uppercase font-semibold tracking-widest">
                  Success rate
                </p>
                <p className="text-xl font-bold text-emerald-700 leading-tight">
                  {paymentMetrics.successRate}%
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
            {[
              {
                label: "Successful",
                value: paymentMetrics.paidCount,
                accent: "from-emerald-400/20 via-emerald-200/30 to-white",
                ring: "bg-emerald-500",
                text: "text-emerald-700",
                icon: <CheckCircle size={18} />,
              },
              {
                label: "Pending",
                value: paymentMetrics.pendingCount,
                accent: "from-amber-400/20 via-amber-200/30 to-white",
                ring: "bg-amber-500",
                text: "text-amber-700",
                icon: <Clock size={18} />,
              },
              {
                label: "Failed",
                value: paymentMetrics.failedCount,
                accent: "from-rose-400/20 via-rose-200/30 to-white",
                ring: "bg-rose-500",
                text: "text-rose-700",
                icon: <AlertTriangle size={18} />,
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
                <div
                  key={item.label}
                  className={`rounded-2xl border border-slate-100 bg-gradient-to-br ${item.accent} p-5 sm:p-6 shadow-sm hover:shadow-md transition-all`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[13px] uppercase tracking-widest text-slate-500 font-semibold">
                        {item.label}
                      </p>
                      <p className="text-4xl sm:text-3xl font-bold text-slate-900 mt-2 leading-none">
                        {item.value}
                      </p>
                    </div>
                    <div
                      className={`w-12 h-12 rounded-2xl ${item.ring} text-white flex items-center justify-center shadow`}
                    >
                      {item.icon}
                    </div>
                  </div>
                  <div className="mt-5">
                    <div className="flex items-center justify-between text-sm text-slate-500">
                      <span>Share of total</span>
                      <span className={`font-semibold ${item.text}`}>
                        {percentage}%
                      </span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-white/70 border border-white/60 overflow-hidden">
                      <div
                        className={`h-full ${item.ring} rounded-full`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Billing Analytics */}
        <div className="mb-8">
          <Card>
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

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
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

            <div className="rounded-2xl border border-slate-100 bg-white p-3 sm:p-5">
              <EarningsOverview
                loading={loading}
                schools={schools}
                payments={payments}
                billingPayments={billingPayments}
                paymentMetrics={paymentMetrics}
                planDist={planDist}
                expiredSubscriptions={expiredSubscriptions}
                kpis={kpis}
              />
            </div>
          </Card>
        </div>

        <div className="mb-8" />

        {/* Insight Cards Section */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
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
                  {expiredSubscriptions.slice(0, 6).map((s) => {
                    const schoolName = getSchoolName(s.name);
                    const schoolCode = getSchoolCode(s.code, s.id);
                    const schoolPlan = normalizePlan(s.plan);
                    return (
                      <tr key={s.id} className="text-slate-600">
                        <td className="py-3 pr-4">
                          <Link
                            to={`/super-admin/schools/${s.id}`}
                            className="font-semibold text-slate-800 hover:text-[#0B4A82]"
                          >
                            {schoolName}
                          </Link>
                          <div className="text-xs text-slate-400">
                            {schoolCode}
                          </div>
                        </td>
                        <td className="py-3 pr-4 capitalize">{schoolPlan}</td>
                        <td className="py-3 pr-4">
                          {s.graceEndsAt.toLocaleDateString()}
                        </td>
                        <td className="py-3">
                          <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-600">
                            Renewal overdue
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Plan Distribution Card */}
        <Card className="mb-8 p-4 sm:p-6">
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

        {/* Activity Feed */}
        <Card className="mb-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-10 h-10 rounded-2xl bg-[#E6F0FA] text-[#0B4A82] flex items-center justify-center">
                  <Activity size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Activity Feed
                  </h2>
                  <p className="text-sm text-slate-600">
                    Recent system events across all schools
                  </p>
                </div>
              </div>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <select
                value={activityFilter}
                onChange={(e) => setActivityFilter(e.target.value)}
                className="w-full sm:w-auto rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
              >
                <option value="">All events</option>
                <option value="school_created">School created</option>
                <option value="school_admin_created">
                  School admin created
                </option>
                <option value="school_admin_password_reset">
                  School admin password reset
                </option>
                <option value="user_provisioned">User provisioned</option>
                <option value="teacher_created">Teacher created</option>
                <option value="backup_created">Backup created</option>
                <option value="billing_initiated">Billing initiated</option>
                <option value="billing_verified_success">
                  Billing verified (success)
                </option>
                <option value="billing_verified_failed">
                  Billing verified (failed)
                </option>
                <option value="billing_webhook_success">
                  Billing webhook (success)
                </option>
                <option value="billing_webhook_failed">
                  Billing webhook (failed)
                </option>
              </select>
              <button
                onClick={() => void loadData({ forceRefresh: true })}
                className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                <RefreshCw size={14} />
                Refresh
              </button>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div
                  key={idx}
                  className="p-4 border border-slate-100 rounded-xl"
                >
                  <Skeleton className="h-4 w-1/3 mb-2" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            </div>
          ) : activityFeed.length === 0 ? (
            <EmptyState
              icon={<Activity className="text-slate-300" size={48} />}
              title="No activity yet"
              description="System events will appear here as schools use the platform."
            />
          ) : (
            <div className="max-h-[420px] overflow-y-auto pr-0 sm:pr-1 space-y-3">
              {activityFeed.map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 rounded-xl border border-slate-100 bg-white p-3 sm:p-4"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 break-words">
                      {formatActivityLabel(entry)}
                    </p>
                    <p className="text-xs text-slate-500 mt-1 break-all">
                      {entry.schoolId ? `School: ${entry.schoolId}` : "System"}
                    </p>
                  </div>
                  <div className="text-xs text-slate-500">
                    {formatActivityDate(entry.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Premium Data Table Card */}
        <Card className="mb-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Schools Directory
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                {filteredSchools.length} of {schools.length} schools
              </p>
            </div>
            <div className="flex flex-col sm:flex-row flex-wrap gap-2 items-stretch sm:items-center">
              <div className="relative flex-1 sm:flex-none sm:min-w-[220px]">
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
                className="w-full sm:w-auto px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1160A8]"
              >
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <select
                value={planFilter}
                onChange={(e) => setPlanFilter(e.target.value)}
                className="w-full sm:w-auto px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1160A8]"
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
                  filteredSchools.map((s, idx) => {
                    const schoolName = getSchoolName(s.name);
                    const schoolCode = getSchoolCode(s.code, s.id);
                    const schoolStatus = normalizeStatus(s.status);
                    const schoolPlan = normalizePlan(s.plan);
                    return (
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
                                  alt={schoolName}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                schoolName.charAt(0).toUpperCase()
                              )}
                            </div>
                            <div>
                              <div className="font-semibold text-slate-900">
                                {schoolName}
                              </div>
                              <div className="text-xs text-slate-500">
                                {schoolCode}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                              schoolStatus === "active"
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-[#E6F0FA] text-[#0B4A82]"
                            }`}
                          >
                            {schoolStatus === "active" ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="py-4 px-4">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 capitalize">
                            {schoolPlan}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-slate-600">
                          {s.createdAt
                            ? s.createdAt instanceof Timestamp
                              ? s.createdAt.toDate().toLocaleDateString()
                              : new Date(s.createdAt as any).toLocaleDateString()
                            : "--"}
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
                    );
                  })
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
        <Card className="bg-gradient-to-br from-white via-slate-50 to-white border border-slate-100 p-4 sm:p-6">
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

          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
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
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
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
                    <div className="text-left sm:text-right sm:min-w-[64px]">
                      <div
                        className={`text-base sm:text-lg font-bold ${item.accent}`}
                      >
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
            <div className="flex items-center justify-between gap-2 mb-4">
              <h3 className="text-base font-semibold text-slate-900">
                School Activity Status
              </h3>
              <span className="text-xs text-slate-500 whitespace-nowrap">
                Live today per school
              </span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {schools.map((school) => {
                const status = dailyChecklist.perSchool[school.id] || {
                  attendance: false,
                  teacherAttendance: false,
                  assessments: false,
                  timetable: false,
                  notices: false,
                };
                const schoolName = getSchoolName(school.name);
                const schoolCode = getSchoolCode(school.code, school.id);
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
                    className="rounded-2xl border border-slate-100 bg-white p-4 sm:p-5 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm text-slate-500">School</p>
                        <p className="text-lg font-semibold text-slate-900 break-words leading-tight">
                          {schoolName}
                        </p>
                        <p className="text-xs text-slate-400">{schoolCode}</p>
                      </div>
                      <div className="text-left sm:text-right sm:shrink-0">
                        <p className="text-xs text-slate-500">Completion</p>
                        <p className="text-lg font-bold text-emerald-600">
                          {completedCount}/{activityItems.length}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {activityItems.map((item) => (
                        <div
                          key={item.label}
                          className={`flex items-center justify-between gap-2 rounded-lg border px-2 py-1.5 ${
                            item.value
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-slate-200 bg-slate-50 text-slate-500"
                          }`}
                        >
                          <span className="min-w-0 break-words">
                            {item.label}
                          </span>
                          <span className="shrink-0 font-semibold">
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
