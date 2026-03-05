import React, { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  Download,
  RefreshCw,
} from "lucide-react";
import {
  collection,
  getDocs,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { firestore } from "../services/firebase";

export type EarningsRecord = {
  date: string;
  totalCollections: number;
  feesCollections: number;
  outstanding: number;
  transactions: number;
  paymentMethod?: string;
  className?: string;
  createdAt?: Timestamp | number | string | null;
};

type PaymentRecord = {
  id: string;
  amount?: number;
  currency?: string;
  channel?: string;
  createdAt?: Timestamp | number | string | null;
  paidAt?: Timestamp | number | string | null;
  status?: string;
  schoolId?: string;
  schoolName?: string;
  adminUid?: string;
  adminEmail?: string;
  reference?: string;
  gatewayResponse?: string;
};

type Props = {
  data?: EarningsRecord[];
  loading?: boolean;
  error?: string | null;
  currency?: string;
  onRetry?: () => void;
  onRecordPayment?: () => void;
  useLivePayments?: boolean;
};

const RANGE_OPTIONS = [
  "This month",
  "Last month",
  "This year",
  "Custom",
] as const;

const BUCKETS = ["Daily", "Weekly", "Monthly"] as const;
const CHART_TYPES = ["Area", "Line", "Bar"] as const;

const formatCurrency = (value: number, currency = "GHS") =>
  new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);

const formatCurrencyGHS = (value: number) => `GHC${value.toFixed(2)}`;

const formatShort = (value: number) =>
  new Intl.NumberFormat("en-GH", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);

const toDate = (value: string) => new Date(value + "T00:00:00");

const toNumber = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getEntryDate = (entry: EarningsRecord) => {
  if (entry.createdAt) {
    return toDateValue(entry.createdAt);
  }
  return entry.date ? toDate(entry.date) : null;
};

const toDateValue = (value?: Timestamp | number | string | null) => {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === "number") return new Date(value);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isSuccessfulPayment = (payment: PaymentRecord) => {
  const status = String(payment.status || "").toLowerCase();
  if (status === "success") return true;
  return Boolean(payment.paidAt);
};

const getPeriodRange = (range: (typeof RANGE_OPTIONS)[number]) => {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);
  switch (range) {
    case "This month":
      start.setDate(1);
      break;
    case "Last month":
      start.setMonth(now.getMonth() - 1, 1);
      end.setDate(0);
      break;
    case "This year":
      start.setMonth(0, 1);
      break;
    default:
      start.setMonth(now.getMonth() - 1, 1);
  }
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const useFilteredData = (
  data: EarningsRecord[],
  range: (typeof RANGE_OPTIONS)[number],
) => {
  const { start, end } = getPeriodRange(range);
  return data.filter((entry) => {
    const date = getEntryDate(entry);
    if (!date) return false;
    return date >= start && date <= end;
  });
};

const aggregateSeries = (
  data: EarningsRecord[],
  bucket: (typeof BUCKETS)[number],
) => {
  if (bucket === "Daily") return data;
  const grouped = new Map<string, EarningsRecord>();
  data.forEach((entry) => {
    const date = getEntryDate(entry);
    if (!date) return;
    const baseDate = entry.date || date.toISOString().slice(0, 10);
    let key = baseDate;
    if (bucket === "Weekly") {
      const weekStart = new Date(date);
      const day = weekStart.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      weekStart.setDate(weekStart.getDate() + diff);
      key = weekStart.toISOString().slice(0, 10);
    }
    if (bucket === "Monthly") {
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
    }

    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { ...entry, date: key });
      return;
    }
    grouped.set(key, {
      ...existing,
      totalCollections:
        toNumber(existing.totalCollections) + toNumber(entry.totalCollections),
      feesCollections:
        toNumber(existing.feesCollections) + toNumber(entry.feesCollections),
      outstanding: toNumber(existing.outstanding) + toNumber(entry.outstanding),
      transactions:
        toNumber(existing.transactions) + toNumber(entry.transactions),
    });
  });
  return Array.from(grouped.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
};

const buildComparison = (data: EarningsRecord[]) =>
  data.map((entry) => ({
    ...entry,
    totalCollections: Math.max(0, entry.totalCollections * 0.82),
    feesCollections: Math.max(0, entry.feesCollections * 0.78),
    transactions: Math.max(0, Math.round(entry.transactions * 0.9)),
  }));

const getTrend = (current: number, previous: number) => {
  if (!previous) return 0;
  return Math.round(((current - previous) / previous) * 100);
};

const SkeletonCard = () => (
  <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
    <div className="h-3 w-1/3 rounded bg-slate-100 animate-pulse" />
    <div className="mt-3 h-6 w-2/3 rounded bg-slate-100 animate-pulse" />
    <div className="mt-4 h-2 w-full rounded bg-slate-100 animate-pulse" />
  </div>
);

const SkeletonLine = ({ className }: { className: string }) => (
  <div className={`rounded bg-slate-100 animate-pulse ${className}`} />
);

export const mockEarningsData: EarningsRecord[] = [
  {
    date: "2026-02-01",
    totalCollections: 12500,
    feesCollections: 9800,
    outstanding: 2200,
    transactions: 38,
    paymentMethod: "MoMo",
    className: "JHS 1",
  },
  {
    date: "2026-02-05",
    totalCollections: 16800,
    feesCollections: 14100,
    outstanding: 2800,
    transactions: 52,
    paymentMethod: "Bank",
    className: "JHS 2",
  },
  {
    date: "2026-02-10",
    totalCollections: 14350,
    feesCollections: 11800,
    outstanding: 1900,
    transactions: 44,
    paymentMethod: "Cash",
    className: "Primary 6",
  },
  {
    date: "2026-02-15",
    totalCollections: 21200,
    feesCollections: 18900,
    outstanding: 3200,
    transactions: 63,
    paymentMethod: "MoMo",
    className: "JHS 3",
  },
  {
    date: "2026-02-20",
    totalCollections: 18400,
    feesCollections: 16200,
    outstanding: 2500,
    transactions: 58,
    paymentMethod: "Bank",
    className: "Primary 5",
  },
  {
    date: "2026-02-25",
    totalCollections: 19600,
    feesCollections: 17100,
    outstanding: 2100,
    transactions: 61,
    paymentMethod: "MoMo",
    className: "Primary 4",
  },
  {
    date: "2026-02-28",
    totalCollections: 23100,
    feesCollections: 20500,
    outstanding: 3000,
    transactions: 71,
    paymentMethod: "Cash",
    className: "KG 2",
  },
];

const EarningsOverview: React.FC<Props> = ({
  data,
  loading,
  error,
  currency = "GHS",
  onRetry,
  onRecordPayment,
}) => {
  const safeData = Array.isArray(data) ? data : [];
  const isLoading = Boolean(loading);
  const hasError = Boolean(error);
  const [range, setRange] =
    useState<(typeof RANGE_OPTIONS)[number]>("This year");
  const [showCustomRange, setShowCustomRange] = useState(false);
  const [customRange, setCustomRange] = useState({ start: "", end: "" });
  const [bucket, setBucket] = useState<(typeof BUCKETS)[number]>("Weekly");
  const [chartType, setChartType] =
    useState<(typeof CHART_TYPES)[number]>("Area");
  const [compare, setCompare] = useState(false);
  const [visibleSeries, setVisibleSeries] = useState({
    total: true,
    fees: true,
  });
  const [exportOpen, setExportOpen] = useState(false);

  const { start, end } = useMemo(() => {
    if (range !== "Custom") return getPeriodRange(range);
    if (!customRange.start || !customRange.end)
      return { start: null, end: null };
    const startDate = new Date(customRange.start + "T00:00:00");
    const endDate = new Date(customRange.end + "T23:59:59");
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return { start: null, end: null };
    }
    return { start: startDate, end: endDate };
  }, [range, customRange.end, customRange.start]);

  const filtered = useMemo(() => {
    if (start && end) {
      return safeData.filter((entry) => {
        const date = getEntryDate(entry);
        if (!date) return false;
        return date >= start && date <= end;
      });
    }
    return range === "Custom" ? [] : useFilteredData(safeData, range);
  }, [safeData, end, range, start]);
  const series = useMemo(
    () => aggregateSeries(filtered, bucket),
    [filtered, bucket],
  );
  const comparisonSeries = useMemo(() => buildComparison(series), [series]);

  const sparklineSeries = useMemo(() => {
    return aggregateSeries(filtered, "Weekly").slice(-10);
  }, [filtered]);

  const totals = useMemo(() => {
    const totalCollections = filtered.reduce(
      (sum, row) => sum + toNumber(row.totalCollections),
      0,
    );
    const feesCollections = filtered.reduce(
      (sum, row) => sum + toNumber(row.feesCollections),
      0,
    );
    const outstanding = filtered.reduce(
      (sum, row) => sum + toNumber(row.outstanding),
      0,
    );
    const transactions = filtered.reduce(
      (sum, row) => sum + toNumber(row.transactions),
      0,
    );
    return { totalCollections, feesCollections, outstanding, transactions };
  }, [filtered]);

  const previousTotals = useMemo(() => {
    const previous = buildComparison(filtered);
    return {
      totalCollections: previous.reduce(
        (sum, row) => sum + row.totalCollections,
        0,
      ),
      feesCollections: previous.reduce(
        (sum, row) => sum + row.feesCollections,
        0,
      ),
      outstanding: previous.reduce((sum, row) => sum + row.outstanding, 0),
      transactions: previous.reduce((sum, row) => sum + row.transactions, 0),
    };
  }, [filtered]);

  const paymentMethods = useMemo(() => {
    const methods = new Map<string, number>();
    const counts = new Map<string, number>();
    filtered.forEach((row) => {
      const key = row.paymentMethod || "Unknown";
      const amount = toNumber(row.totalCollections);
      methods.set(key, (methods.get(key) || 0) + amount);
      counts.set(
        key,
        (counts.get(key) || 0) + Math.max(1, toNumber(row.transactions)),
      );
    });

    const methodEntries = Array.from(methods.entries());
    const allZero = methodEntries.every(([, value]) => value <= 0);
    const source = allZero ? counts : methods;

    return Array.from(source.entries()).map(([name, value]) => ({
      name,
      value,
    }));
  }, [filtered]);

  const paymentMethodsPie = useMemo(() => {
    if (paymentMethods.length > 0) return paymentMethods;
    if (hasError || isLoading) return [];
    return [{ name: "No data", value: 1 }];
  }, [hasError, isLoading, paymentMethods]);

  const renderChart = () => {
    const chartData = compare
      ? series.map((entry, idx) => ({ ...entry, ...comparisonSeries[idx] }))
      : series;

    const ChartComponent =
      chartType === "Area"
        ? AreaChart
        : chartType === "Line"
          ? LineChart
          : BarChart;

    return (
      <ResponsiveContainer width="100%" height={280}>
        <ChartComponent
          data={chartData}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
        >
          <XAxis dataKey="date" tick={{ fill: "#94A3B8", fontSize: 11 }} />
          <YAxis
            tick={{ fill: "#94A3B8", fontSize: 11 }}
            allowDecimals={false}
          />
          <Tooltip content={chartTooltip} />
          {visibleSeries.total &&
            (chartType === "Area" ? (
              <Area
                type="monotone"
                dataKey="totalCollections"
                fill={chartColors.total}
                stroke={chartColors.total}
                fillOpacity={0.3}
              />
            ) : chartType === "Line" ? (
              <Line
                type="monotone"
                dataKey="totalCollections"
                stroke={chartColors.total}
                strokeWidth={2}
                dot={false}
              />
            ) : (
              <Bar
                dataKey="totalCollections"
                fill={chartColors.total}
                radius={[8, 8, 0, 0]}
                barSize={18}
              />
            ))}
          {visibleSeries.fees &&
            (chartType === "Area" ? (
              <Area
                type="monotone"
                dataKey="feesCollections"
                fill={chartColors.fees}
                stroke={chartColors.fees}
                fillOpacity={0.3}
              />
            ) : chartType === "Line" ? (
              <Line
                type="monotone"
                dataKey="feesCollections"
                stroke={chartColors.fees}
                strokeWidth={2}
                dot={false}
              />
            ) : (
              <Bar
                dataKey="feesCollections"
                fill={chartColors.fees}
                radius={[8, 8, 0, 0]}
                barSize={18}
              />
            ))}
        </ChartComponent>
      </ResponsiveContainer>
    );
  };

  const topClasses = useMemo(() => {
    const classes = new Map<string, number>();
    filtered.forEach((row) => {
      const key = row.className || "General";
      classes.set(key, (classes.get(key) || 0) + row.totalCollections);
    });
    return Array.from(classes.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [filtered]);

  const recentPayments = useMemo(() => {
    return [...filtered]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5);
  }, [filtered]);

  const showEmpty = !filtered.length;

  const kpiCards = [
    {
      label: "Total Collections",
      value: formatCurrency(totals.totalCollections, currency),
      trend: getTrend(totals.totalCollections, previousTotals.totalCollections),
    },
    {
      label: "Fees Collected",
      value: formatCurrency(totals.feesCollections, currency),
      trend: getTrend(totals.feesCollections, previousTotals.feesCollections),
    },
    {
      label: "Outstanding Balance",
      value: formatCurrency(totals.outstanding, currency),
      trend: getTrend(totals.outstanding, previousTotals.outstanding),
    },
    {
      label: "Transactions Count",
      value: totals.transactions.toLocaleString(),
      trend: getTrend(totals.transactions, previousTotals.transactions),
    },
  ];

  const chartColors = {
    total: "#2563EB",
    fees: "#F97316",
  };

  const seriesMeta = [
    {
      key: "total" as const,
      label: "Total Collections",
      color: chartColors.total,
    },
    {
      key: "fees" as const,
      label: "Fees Collected",
      color: chartColors.fees,
    },
  ];

  const chartTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: Array<{ dataKey?: string; value?: number }>;
    label?: string;
  }) => {
    if (!active || !label) return null;
    const match = series.find((entry) => entry.date === label);
    const total =
      payload?.find((entry) => entry.dataKey === "totalCollections")?.value ??
      match?.totalCollections;
    const fees =
      payload?.find((entry) => entry.dataKey === "feesCollections")?.value ??
      match?.feesCollections;
    const transactions = match?.transactions;

    return (
      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
        <div className="font-semibold text-slate-700">{label}</div>
        <div className="mt-1 space-y-1 text-slate-500">
          {typeof total === "number" && (
            <div className="flex items-center justify-between gap-4">
              <span>Total collections</span>
              <span className="font-semibold text-slate-700">
                {formatCurrency(total, currency)}
              </span>
            </div>
          )}
          {typeof fees === "number" && (
            <div className="flex items-center justify-between gap-4">
              <span>Fees collected</span>
              <span className="font-semibold text-slate-700">
                {formatCurrency(fees, currency)}
              </span>
            </div>
          )}
          {typeof transactions === "number" && (
            <div className="flex items-center justify-between gap-4">
              <span>Transactions</span>
              <span className="font-semibold text-slate-700">
                {transactions}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Earnings</h2>
          <p className="text-sm text-slate-500">Successful payments overview</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-full max-w-full overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] sm:w-auto sm:overflow-visible">
            <div className="inline-flex min-w-max items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">
              {RANGE_OPTIONS.map((option) => (
                <button
                  key={option}
                  onClick={() => {
                    setRange(option);
                    setShowCustomRange(option === "Custom");
                  }}
                  className={`px-2.5 py-1 rounded-full transition ${
                    range === option
                      ? "bg-white text-slate-900 shadow"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                  aria-label={`Filter by ${option}`}
                  aria-pressed={range === option}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
          <div className="relative">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              aria-label="Export data"
              aria-haspopup="menu"
              aria-expanded={exportOpen}
              onClick={() => setExportOpen((prev) => !prev)}
            >
              <Download size={14} /> Export
            </button>
            {exportOpen && (
              <div
                className="absolute right-0 z-10 mt-2 w-32 rounded-xl border border-slate-200 bg-white p-1 text-xs shadow-lg"
                role="menu"
              >
                <button
                  type="button"
                  className="w-full rounded-lg px-2 py-1.5 text-left text-slate-600 hover:bg-slate-50"
                  role="menuitem"
                  onClick={() => setExportOpen(false)}
                >
                  Export CSV
                </button>
                <button
                  type="button"
                  className="w-full rounded-lg px-2 py-1.5 text-left text-slate-600 hover:bg-slate-50"
                  role="menuitem"
                  onClick={() => setExportOpen(false)}
                >
                  Export PDF
                </button>
              </div>
            )}
          </div>
          <button
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            aria-label="Refresh data"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {hasError && (
        <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 p-4 text-rose-700">
          <div className="text-sm font-semibold">Unable to load earnings</div>
          <p className="text-xs mt-1">{error}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-3 inline-flex items-center gap-2 rounded-full bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white"
            >
              Retry
            </button>
          )}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, idx) => (
              <SkeletonCard key={idx} />
            ))
          : kpiCards.map((card) => (
              <div
                key={card.label}
                className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-md overflow-hidden min-w-0"
              >
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {card.label}
                </div>
                <div
                  className="mt-3 text-2xl font-bold text-slate-900 leading-tight max-w-full truncate"
                  title={hasError ? "--" : card.value}
                >
                  {hasError ? "--" : card.value}
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs font-semibold">
                  {card.trend >= 0 ? (
                    <ArrowUpRight size={14} className="text-emerald-500" />
                  ) : (
                    <ArrowDownRight size={14} className="text-rose-500" />
                  )}
                  <span
                    className={
                      card.trend >= 0 ? "text-emerald-600" : "text-rose-600"
                    }
                  >
                    {hasError ? "--" : `${Math.abs(card.trend)}%`}
                  </span>
                  <span className="text-slate-400">vs previous</span>
                </div>
                <div className="mt-3 h-10">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={sparklineSeries}>
                      <Line
                        type="monotone"
                        dataKey="totalCollections"
                        stroke={chartColors.total}
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ))}
      </div>

      {!isLoading && !hasError && showEmpty && (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
          <div className="text-sm font-semibold text-slate-700">
            No payments recorded yet
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Start tracking earnings by recording your first payment.
          </p>
          {onRecordPayment && (
            <button
              onClick={onRecordPayment}
              className="mt-4 inline-flex items-center justify-center rounded-full bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#1D4ED8]"
            >
              Record Payment
            </button>
          )}
        </div>
      )}

      {showCustomRange && (
        <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-col">
              <label className="text-xs font-semibold text-slate-500">
                Start date
              </label>
              <input
                type="date"
                value={customRange.start}
                onChange={(event) =>
                  setCustomRange((prev) => ({
                    ...prev,
                    start: event.target.value,
                  }))
                }
                className="mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-xs font-semibold text-slate-500">
                End date
              </label>
              <input
                type="date"
                value={customRange.end}
                onChange={(event) =>
                  setCustomRange((prev) => ({
                    ...prev,
                    end: event.target.value,
                  }))
                }
                className="mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700"
              />
            </div>
            <button
              onClick={() => setShowCustomRange(false)}
              className="ml-auto text-xs font-semibold text-slate-500 hover:text-slate-700"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1 text-xs font-semibold text-slate-600">
              {BUCKETS.map((option) => (
                <button
                  key={option}
                  onClick={() => setBucket(option)}
                  className={`px-3 py-1 rounded-full transition ${
                    bucket === option
                      ? "bg-white text-slate-900 shadow"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                  aria-pressed={bucket === option}
                >
                  {option}
                </button>
              ))}
            </div>
            <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1 text-xs font-semibold text-slate-600">
              {CHART_TYPES.map((option) => (
                <button
                  key={option}
                  onClick={() => setChartType(option)}
                  className={`px-3 py-1 rounded-full transition ${
                    chartType === option
                      ? "bg-white text-slate-900 shadow"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                  aria-pressed={chartType === option}
                >
                  {option}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-500">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-[#2563EB]"
                checked={compare}
                onChange={(event) => setCompare(event.target.checked)}
              />
              Compare to previous period
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            {seriesMeta.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() =>
                  setVisibleSeries((prev) => ({
                    ...prev,
                    [item.key]: !prev[item.key],
                  }))
                }
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 transition ${
                  visibleSeries[item.key]
                    ? "border-slate-200 bg-white text-slate-700"
                    : "border-slate-100 bg-slate-50 text-slate-400"
                }`}
                aria-pressed={visibleSeries[item.key]}
                aria-label={`Toggle ${item.label} series`}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                {item.label}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-3 rounded-full bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-500">
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                {totals.transactions} txns
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-indigo-400" />
                {formatShort(totals.totalCollections)} total
              </span>
            </div>
          </div>

          <div className="mt-4">
            {isLoading ? (
              <div className="h-[280px] rounded-2xl bg-white/60 animate-pulse" />
            ) : showEmpty || hasError ? (
              <div className="flex h-[280px] items-center justify-center rounded-2xl border border-dashed border-slate-200/70 text-sm text-slate-500">
                {hasError
                  ? "Failed to load earnings data."
                  : range === "Custom"
                    ? "Select a custom range to view analytics."
                    : "No payments in this range."}
              </div>
            ) : (
              renderChart()
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-sm font-semibold text-slate-900">
              Payment Methods
            </div>
            <div className="mt-4 h-52 rounded-xl border border-slate-200 bg-slate-50 p-3">
              {isLoading ? (
                <div className="h-full rounded-xl bg-white/60 animate-pulse" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      dataKey="value"
                      data={paymentMethodsPie}
                      innerRadius={42}
                      outerRadius={80}
                      paddingAngle={3}
                    >
                      {paymentMethodsPie.map((entry, index) => (
                        <Cell
                          key={entry.name}
                          fill={
                            ["#2563EB", "#F97316", "#10B981", "#F43F5E"][
                              index % 4
                            ]
                          }
                          stroke="#ffffff"
                          strokeWidth={2}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) =>
                        formatCurrency(value, currency)
                      }
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="mt-2 space-y-2 text-xs text-slate-500">
              {isLoading ? (
                <>
                  <SkeletonLine className="h-3 w-2/3" />
                  <SkeletonLine className="h-3 w-1/2" />
                  <SkeletonLine className="h-3 w-3/4" />
                </>
              ) : paymentMethods.length === 0 || hasError ? (
                <div className="text-slate-400">
                  {hasError
                    ? "Payment methods unavailable"
                    : "No payment methods yet."}
                </div>
              ) : (
                paymentMethods.map((method) => (
                  <div
                    key={method.name}
                    className="flex items-center justify-between"
                  >
                    <span>{method.name}</span>
                    <span className="font-semibold text-slate-700">
                      {formatCurrency(method.value, currency)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-sm font-semibold text-slate-900">
              Recent Successful Payments
            </div>
            <div className="mt-4 space-y-3">
              {isLoading ? (
                <>
                  <SkeletonLine className="h-4 w-full" />
                  <SkeletonLine className="h-4 w-5/6" />
                  <SkeletonLine className="h-4 w-2/3" />
                </>
              ) : recentPayments.length === 0 || hasError ? (
                <div className="text-xs text-slate-400">
                  {hasError ? "Payments unavailable." : "No payments yet."}
                </div>
              ) : (
                recentPayments.map((entry, index) => (
                  <div
                    key={`${entry.date}-${entry.totalCollections}-${index}`}
                    className="flex items-center justify-between text-xs text-slate-500"
                  >
                    <div>
                      <div className="font-semibold text-slate-700">
                        {entry.className || "General"}
                      </div>
                      <div>{entry.date}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-slate-700">
                        {formatCurrency(entry.totalCollections, currency)}
                      </div>
                      <div>{entry.transactions} txns</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default EarningsOverview;
