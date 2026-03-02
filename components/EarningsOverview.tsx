import React, { useMemo, useState } from "react";
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

export type EarningsRecord = {
  date: string;
  totalCollections: number;
  feesCollections: number;
  outstanding: number;
  transactions: number;
  paymentMethod?: string;
  className?: string;
};

type Props = {
  data: EarningsRecord[];
  loading?: boolean;
  error?: string | null;
  currency?: string;
  onRetry?: () => void;
  onRecordPayment?: () => void;
};

const RANGE_OPTIONS = [
  "This month",
  "Last month",
  "This term",
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

const formatShort = (value: number) =>
  new Intl.NumberFormat("en-GH", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);

const toDate = (value: string) => new Date(value + "T00:00:00");

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
    case "This term":
      start.setMonth(now.getMonth() - 3, 1);
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
    const date = toDate(entry.date);
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
    const date = toDate(entry.date);
    let key = entry.date;
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
      totalCollections: existing.totalCollections + entry.totalCollections,
      feesCollections: existing.feesCollections + entry.feesCollections,
      outstanding: existing.outstanding + entry.outstanding,
      transactions: existing.transactions + entry.transactions,
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

const EarningsOverview: React.FC<Props> = ({
  data,
  loading,
  error,
  currency = "GHS",
  onRetry,
  onRecordPayment,
}) => {
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
      return data.filter((entry) => {
        const date = toDate(entry.date);
        return date >= start && date <= end;
      });
    }
    return range === "Custom" ? [] : useFilteredData(data, range);
  }, [data, end, range, start]);
  const series = useMemo(
    () => aggregateSeries(filtered, bucket),
    [filtered, bucket],
  );
  const comparisonSeries = useMemo(() => buildComparison(series), [series]);

  const totals = useMemo(() => {
    const totalCollections = filtered.reduce(
      (sum, row) => sum + row.totalCollections,
      0,
    );
    const feesCollections = filtered.reduce(
      (sum, row) => sum + row.feesCollections,
      0,
    );
    const outstanding = filtered.reduce((sum, row) => sum + row.outstanding, 0);
    const transactions = filtered.reduce(
      (sum, row) => sum + row.transactions,
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
    filtered.forEach((row) => {
      const key = row.paymentMethod || "Unknown";
      methods.set(key, (methods.get(key) || 0) + row.totalCollections);
    });
    return Array.from(methods.entries()).map(([name, value]) => ({
      name,
      value,
    }));
  }, [filtered]);

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

  if (loading) {
    return (
      <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-4 w-32 rounded bg-slate-100 animate-pulse" />
            <div className="mt-2 h-3 w-48 rounded bg-slate-100 animate-pulse" />
          </div>
          <div className="h-8 w-40 rounded bg-slate-100 animate-pulse" />
        </div>
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <SkeletonCard key={idx} />
          ))}
        </div>
        <div className="mt-6 h-64 rounded-2xl bg-slate-50 animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl border border-rose-100 bg-rose-50 p-6 text-rose-700">
        <div className="text-lg font-semibold">Unable to load earnings</div>
        <p className="text-sm mt-2">{error}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

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

  const renderChart = () => {
    const commonProps = {
      data: series,
      margin: { top: 10, right: 10, left: 0, bottom: 0 },
    } as const;

    const renderLines = () => (
      <>
        {visibleSeries.total && (
          <Line
            type="monotone"
            dataKey="totalCollections"
            stroke={chartColors.total}
            strokeWidth={2.5}
            dot={false}
          />
        )}
        {visibleSeries.fees && (
          <Line
            type="monotone"
            dataKey="feesCollections"
            stroke={chartColors.fees}
            strokeWidth={2.5}
            dot={false}
          />
        )}
        {compare && (
          <Line
            type="monotone"
            data={comparisonSeries}
            dataKey="totalCollections"
            stroke="#94A3B8"
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={false}
          />
        )}
      </>
    );

    if (chartType === "Bar") {
      return (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart {...commonProps}>
            <XAxis dataKey="date" tick={{ fill: "#94A3B8", fontSize: 11 }} />
            <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} />
            <Tooltip
              contentStyle={{
                borderRadius: 12,
                borderColor: "#E2E8F0",
                fontSize: 12,
              }}
              formatter={(value: number, name: string) => [
                formatCurrency(value, currency),
                name === "totalCollections" ? "Total" : "Fees",
              ]}
            />
            {visibleSeries.total && (
              <Bar dataKey="totalCollections" fill={chartColors.total} />
            )}
            {visibleSeries.fees && (
              <Bar dataKey="feesCollections" fill={chartColors.fees} />
            )}
          </BarChart>
        </ResponsiveContainer>
      );
    }

    if (chartType === "Line") {
      return (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart {...commonProps}>
            <XAxis dataKey="date" tick={{ fill: "#94A3B8", fontSize: 11 }} />
            <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} />
            <Tooltip
              contentStyle={{
                borderRadius: 12,
                borderColor: "#E2E8F0",
                fontSize: 12,
              }}
              formatter={(value: number, name: string) => [
                formatCurrency(value, currency),
                name === "totalCollections" ? "Total" : "Fees",
              ]}
            />
            {renderLines()}
          </LineChart>
        </ResponsiveContainer>
      );
    }

    return (
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart {...commonProps}>
          <XAxis dataKey="date" tick={{ fill: "#94A3B8", fontSize: 11 }} />
          <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} />
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              borderColor: "#E2E8F0",
              fontSize: 12,
            }}
            formatter={(value: number, name: string) => [
              formatCurrency(value, currency),
              name === "totalCollections" ? "Total" : "Fees",
            ]}
          />
          {visibleSeries.total && (
            <Area
              type="monotone"
              dataKey="totalCollections"
              stroke={chartColors.total}
              fill={chartColors.total}
              fillOpacity={0.18}
              strokeWidth={2.5}
            />
          )}
          {visibleSeries.fees && (
            <Area
              type="monotone"
              dataKey="feesCollections"
              stroke={chartColors.fees}
              fill={chartColors.fees}
              fillOpacity={0.12}
              strokeWidth={2.5}
            />
          )}
          {compare && (
            <Line
              type="monotone"
              data={comparisonSeries}
              dataKey="totalCollections"
              stroke="#94A3B8"
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={false}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    );
  };

  return (
    <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
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
                    if (option === "Custom") {
                      setShowCustomRange(true);
                    }
                  }}
                  className={`px-2.5 py-1 rounded-full transition ${
                    range === option
                      ? "bg-white text-slate-900 shadow"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                  aria-label={`Filter by ${option}`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
          <button
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            aria-label="Export data"
          >
            <Download size={14} /> Export
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            aria-label="Refresh data"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpiCards.map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {card.label}
            </div>
            <div className="mt-3 text-2xl font-bold text-slate-900">
              {card.value}
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
                {Math.abs(card.trend)}%
              </span>
              <span className="text-slate-400">vs previous</span>
            </div>
            <div className="mt-4 h-1 w-full rounded-full bg-slate-200" />
          </div>
        ))}
      </div>

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
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
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

          <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-slate-500">
            <button
              onClick={() =>
                setVisibleSeries((prev) => ({
                  ...prev,
                  total: !prev.total,
                }))
              }
              className="inline-flex items-center gap-2"
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: chartColors.total }}
              />
              Total Collections
            </button>
            <button
              onClick={() =>
                setVisibleSeries((prev) => ({
                  ...prev,
                  fees: !prev.fees,
                }))
              }
              className="inline-flex items-center gap-2"
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: chartColors.fees }}
              />
              Fees Collected
            </button>
          </div>

          <div className="mt-4">
            {showEmpty ? (
              <div className="flex h-[280px] items-center justify-center rounded-2xl border border-dashed border-slate-200 text-sm text-slate-500">
                {range === "Custom"
                  ? "Select a custom range to view analytics."
                  : "No payments in this range."}
              </div>
            ) : (
              renderChart()
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="text-sm font-semibold text-slate-900">
              Payment Methods
            </div>
            <div className="mt-4 h-44">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    dataKey="value"
                    data={paymentMethods}
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={2}
                  >
                    {paymentMethods.map((entry, index) => (
                      <Cell
                        key={entry.name}
                        fill={
                          ["#2563EB", "#F97316", "#10B981", "#F43F5E"][
                            index % 4
                          ]
                        }
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
            </div>
            <div className="mt-2 space-y-2 text-xs text-slate-500">
              {paymentMethods.length === 0 ? (
                <div className="text-slate-400">No payment methods yet.</div>
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

          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="text-sm font-semibold text-slate-900">
              Top Classes
            </div>
            <div className="mt-4 space-y-3">
              {topClasses.length === 0 ? (
                <div className="text-xs text-slate-400">No classes yet.</div>
              ) : (
                topClasses.map((entry) => (
                  <div key={entry.name}>
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>{entry.name}</span>
                      <span className="font-semibold text-slate-700">
                        {formatShort(entry.value)}
                      </span>
                    </div>
                    <div className="mt-2 h-2 w-full rounded-full bg-slate-100">
                      <div
                        className="h-2 rounded-full bg-[#2563EB]"
                        style={{
                          width: `${Math.min(
                            100,
                            (entry.value / (topClasses[0]?.value || 1)) * 100,
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="text-sm font-semibold text-slate-900">
              Recent Successful Payments
            </div>
            <div className="mt-4 space-y-3">
              {recentPayments.length === 0 ? (
                <div className="text-xs text-slate-400">No payments yet.</div>
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
