import React, { useEffect, useMemo, useState } from "react";
import { collection, query, getDocs, orderBy, limit } from "firebase/firestore";
import { firestore } from "../services/firebase";
import {
  BadgeDollarSign,
  Clock,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Download,
  BarChart3,
  PieChart,
  Activity,
  RefreshCw,
} from "lucide-react";
import {
  PaymentRecord,
  TimeRange,
  AnalyticsData,
  calculateAnalyticsData,
} from "../services/billingAnalytics";

interface BillingAnalyticsProps {
  className?: string;
}

const BillingAnalytics: React.FC<BillingAnalyticsProps> = ({
  className = "",
}) => {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>("6M");
  const [chartMode, setChartMode] = useState<"revenue" | "count">("revenue");

  // Fetch payments data from all sources (global + school-specific collections)
  const fetchPaymentsData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch from global payments collection
      const globalPaymentsQuery = query(
        collection(firestore, "payments"),
        orderBy("createdAt", "desc"),
        limit(1000),
      );

      const [globalSnapshot] = await Promise.all([
        getDocs(globalPaymentsQuery),
      ]);

      let allPayments: PaymentRecord[] = [];

      // Process global payments
      const globalPaymentData: PaymentRecord[] = globalSnapshot.docs.map(
        (doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            amount: data.amount ?? data.amountPaid ?? 0,
            status: data.status ?? "pending",
            createdAt:
              data.createdAt ?? data.paidAt ?? data.verifiedAt ?? new Date(),
            schoolId: data.schoolId,
            feeType: data.feeType ?? data.feeName,
            method: data.method ?? data.paymentMethod,
            studentId: data.studentId,
          };
        },
      );

      allPayments = [...allPayments, ...globalPaymentData];

      // Also try to fetch from school-specific payment collections if they exist
      // This ensures we get payments from schools using the v2 finance system
      try {
        // Get all schools first
        const schoolsSnap = await getDocs(collection(firestore, "schools"));
        const schoolPromises = schoolsSnap.docs.map(async (schoolDoc) => {
          try {
            const schoolPaymentsQuery = query(
              collection(firestore, "schools", schoolDoc.id, "payments"),
              orderBy("createdAt", "desc"),
              limit(500),
            );
            const schoolPaymentsSnap = await getDocs(schoolPaymentsQuery);
            return schoolPaymentsSnap.docs.map((doc) => {
              const data = doc.data();
              return {
                id: `${schoolDoc.id}_${doc.id}`,
                amount: data.amount ?? data.amountPaid ?? 0,
                status: data.status ?? "pending",
                createdAt:
                  data.createdAt ??
                  data.paidAt ??
                  data.verifiedAt ??
                  new Date(),
                schoolId: schoolDoc.id,
                feeType: data.feeType ?? data.feeName,
                method: data.method ?? data.paymentMethod,
                studentId: data.studentId,
              } as PaymentRecord;
            });
          } catch (err) {
            // School might not have payments collection or it might be empty
            return [];
          }
        });

        const schoolPaymentsArrays = await Promise.all(schoolPromises);
        const schoolPayments = schoolPaymentsArrays.flat();
        allPayments = [...allPayments, ...schoolPayments];
      } catch (err) {
        // If fetching school-specific payments fails, continue with global payments
        console.log("Could not fetch school-specific payments:", err);
      }

      // Remove duplicates based on payment ID and school
      const uniquePayments = allPayments.filter(
        (payment, index, self) =>
          index ===
          self.findIndex(
            (p) => p.id === payment.id && p.schoolId === payment.schoolId,
          ),
      );

      // Sort by createdAt descending
      uniquePayments.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

      setPayments(uniquePayments);
    } catch (err) {
      console.error("Failed to fetch payments:", err);
      setError("Failed to load payment data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPaymentsData();
  }, []);

  // Process analytics data
  const analyticsData = useMemo((): AnalyticsData => {
    return calculateAnalyticsData(payments, timeRange);
  }, [payments, timeRange]);

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-GH", {
      style: "currency",
      currency: "GHS",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Export to CSV
  const exportToCSV = () => {
    const headers = ["Date", "Revenue", "Payment Count"];
    const rows = analyticsData.timeSeriesData.map((item) => [
      item.date,
      item.revenue.toFixed(2),
      item.count.toString(),
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `billing-analytics-${timeRange}-${new Date().toISOString().split("T")[0]}.csv`,
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Loading state
  if (loading) {
    return (
      <div
        className={`bg-white rounded-2xl border border-slate-100 shadow-sm p-6 ${className}`}
      >
        <div className="animate-pulse">
          <div className="h-6 bg-slate-200 rounded w-1/3 mb-4"></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-slate-200 rounded-xl"></div>
            ))}
          </div>
          <div className="h-64 bg-slate-200 rounded-xl"></div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div
        className={`bg-white rounded-2xl border border-slate-100 shadow-sm p-6 ${className}`}
      >
        <div className="text-center py-12">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">
            Failed to Load Data
          </h3>
          <p className="text-slate-600 mb-4">{error}</p>
          <button
            onClick={fetchPaymentsData}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <RefreshCw size={16} />
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`bg-white rounded-2xl border border-slate-100 shadow-sm p-6 ${className}`}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Billing Analytics
          </h2>
          <p className="text-sm text-slate-600">
            Payment performance over the last {timeRange.toLowerCase()}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Time Range Selector */}
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as TimeRange)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="7D">7 Days</option>
            <option value="30D">30 Days</option>
            <option value="90D">90 Days</option>
            <option value="6M">6 Months</option>
            <option value="12M">12 Months</option>
            <option value="YTD">Year to Date</option>
            <option value="ALL">All Time</option>
          </select>
          {/* Export Button */}
          <button
            onClick={exportToCSV}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl p-4 border border-emerald-200">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase text-emerald-700">
              Total Revenue
            </span>
            <div className="w-10 h-10 rounded-lg bg-emerald-500 text-white flex items-center justify-center">
              <BadgeDollarSign size={20} />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 mb-1">
            {formatCurrency(analyticsData.totalRevenue)}
          </div>
          <div className="text-xs text-emerald-600">
            {analyticsData.successfulPayments} successful payments
          </div>
          {analyticsData.trendPercentage !== 0 && (
            <div
              className={`flex items-center gap-1 mt-2 text-xs font-medium ${
                analyticsData.trendPercentage >= 0
                  ? "text-emerald-600"
                  : "text-red-600"
              }`}
            >
              {analyticsData.trendPercentage >= 0 ? (
                <TrendingUp size={12} />
              ) : (
                <TrendingDown size={12} />
              )}
              {Math.abs(analyticsData.trendPercentage).toFixed(1)}% vs previous
              period
            </div>
          )}
        </div>

        <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-4 border border-amber-200">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase text-amber-700">
              Pending
            </span>
            <div className="w-10 h-10 rounded-lg bg-amber-500 text-white flex items-center justify-center">
              <Clock size={20} />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 mb-1">
            {analyticsData.pendingPayments}
          </div>
          <div className="text-xs text-amber-600">Awaiting confirmation</div>
        </div>

        <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl p-4 border border-red-200">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase text-red-700">
              Failed
            </span>
            <div className="w-10 h-10 rounded-lg bg-red-500 text-white flex items-center justify-center">
              <AlertTriangle size={20} />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 mb-1">
            {analyticsData.failedPayments}
          </div>
          <div className="text-xs text-red-600">Needs follow-up</div>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase text-blue-700">
              Success Rate
            </span>
            <div className="w-10 h-10 rounded-lg bg-blue-500 text-white flex items-center justify-center">
              <TrendingUp size={20} />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 mb-1">
            {analyticsData.successRate.toFixed(1)}%
          </div>
          <div className="text-xs text-blue-600">
            {formatCurrency(analyticsData.avgPaymentValue)} avg payment
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Revenue Chart */}
        <div className="lg:col-span-2">
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-900">
                Revenue Over Time
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setChartMode("revenue")}
                  className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                    chartMode === "revenue"
                      ? "text-blue-600 bg-blue-100"
                      : "text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  Revenue
                </button>
                <button
                  onClick={() => setChartMode("count")}
                  className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                    chartMode === "count"
                      ? "text-blue-600 bg-blue-100"
                      : "text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  Count
                </button>
              </div>
            </div>
            {analyticsData.timeSeriesData.length > 0 ? (
              <div className="h-64 overflow-hidden">
                <RevenueChart
                  data={analyticsData.timeSeriesData}
                  mode={chartMode}
                />
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-slate-500">
                <div className="text-center">
                  <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No payment data available</p>
                  <p className="text-xs">
                    Record some payments to see analytics
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Status Distribution */}
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">
            Payment Status
          </h3>
          {analyticsData.statusDistribution.length > 0 ? (
            <div className="space-y-3">
              {analyticsData.statusDistribution.map((item) => (
                <div key={item.status} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-700 capitalize">
                      {item.status}
                    </span>
                    <span className="text-slate-500">
                      {item.percentage.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        item.status === "success"
                          ? "bg-emerald-500"
                          : item.status === "pending"
                            ? "bg-amber-500"
                            : item.status === "failed"
                              ? "bg-red-500"
                              : "bg-gray-500"
                      }`}
                      style={{ width: `${item.percentage}%` }}
                    />
                  </div>
                  <div className="text-xs text-slate-500">
                    {item.count} payments
                    {item.amount > 0 && ` • ${formatCurrency(item.amount)}`}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-slate-500">
              <div className="text-center">
                <PieChart className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-xs">No data</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Insights Panel */}
      <div className="bg-gradient-to-r from-slate-50 to-blue-50 rounded-xl p-4 border border-slate-200">
        <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <Activity size={16} />
          Key Insights
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-xs text-slate-500 mb-1">
              Best Performing Day
            </div>
            <div className="text-sm font-semibold text-slate-900">
              {analyticsData.insights.bestDay}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-slate-500 mb-1">
              Most Common Method
            </div>
            <div className="text-sm font-semibold text-slate-900">
              {analyticsData.insights.mostCommonMethod}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-slate-500 mb-1">Top Fee Category</div>
            <div className="text-sm font-semibold text-slate-900">
              {analyticsData.insights.topFeeCategory}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Simple Revenue Chart Component
const RevenueChart: React.FC<{
  data: Array<{ date: string; revenue: number; count: number }>;
  mode: "revenue" | "count";
}> = ({ data, mode }) => {
  const maxValue = Math.max(
    ...data.map((d) => (mode === "revenue" ? d.revenue : d.count)),
    1,
  );

  return (
    <div className="flex items-end justify-between h-full gap-1 px-2 overflow-hidden">
      {data.map((item, index) => {
        const value = mode === "revenue" ? item.revenue : item.count;
        return (
          <div
            key={index}
            className="flex-1 flex flex-col items-center gap-2 h-full"
          >
            <div
              className="w-full bg-gradient-to-t from-blue-500 to-blue-600 rounded-t-sm transition-all hover:from-blue-600 hover:to-blue-700 cursor-pointer"
              style={{
                height: `${Math.min(100, (value / maxValue) * 100)}%`,
                maxHeight: "100%",
                minHeight: value > 0 ? "4px" : "0px",
              }}
              title={`${item.date}: ${mode === "revenue" ? `GHS ${item.revenue.toFixed(2)}` : `${item.count} payments`} (${item.count} payments)`}
            />
            <div className="text-xs text-slate-500 transform -rotate-45 origin-top-left whitespace-nowrap max-w-12 truncate">
              {item.date}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default BillingAnalytics;
