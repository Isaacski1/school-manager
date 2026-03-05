// Billing Analytics Utilities
export interface PaymentRecord {
  id: string;
  amount: number;
  status: string;
  createdAt: Date | any;
  schoolId?: string;
  feeType?: string;
  method?: string;
  studentId?: string;
}

export type TimeRange = "7D" | "30D" | "90D" | "6M" | "12M" | "YTD" | "ALL";

export interface AnalyticsData {
  totalRevenue: number;
  successfulPayments: number;
  pendingPayments: number;
  failedPayments: number;
  refundedPayments: number;
  successRate: number;
  avgPaymentValue: number;
  trendPercentage: number;
  timeSeriesData: Array<{
    date: string;
    revenue: number;
    count: number;
  }>;
  statusDistribution: Array<{
    status: string;
    count: number;
    amount: number;
    percentage: number;
  }>;
  insights: {
    bestDay: string;
    mostCommonMethod: string;
    topFeeCategory: string;
  };
}

// Normalize payment status
export const normalizePaymentStatus = (status: string): string => {
  const normalized = status?.toLowerCase();
  if (
    normalized?.includes("success") ||
    normalized === "paid" ||
    normalized === "completed"
  ) {
    return "success";
  }
  if (normalized?.includes("pending") || normalized === "processing") {
    return "pending";
  }
  if (
    normalized?.includes("fail") ||
    normalized === "failed" ||
    normalized === "error"
  ) {
    return "failed";
  }
  if (normalized?.includes("refund")) {
    return "refunded";
  }
  return "pending";
};

// Calculate date range
export const getDateRange = (range: TimeRange): { start: Date; end: Date } => {
  const now = new Date();
  const start = new Date();

  switch (range) {
    case "7D":
      start.setDate(now.getDate() - 7);
      break;
    case "30D":
      start.setDate(now.getDate() - 30);
      break;
    case "90D":
      start.setDate(now.getDate() - 90);
      break;
    case "6M":
      start.setMonth(now.getMonth() - 6);
      break;
    case "12M":
      start.setFullYear(now.getFullYear() - 1);
      break;
    case "YTD":
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      break;
    case "ALL":
      start.setFullYear(2020, 0, 1);
      break;
  }

  return { start, end: now };
};

// Generate time series data
export const generateTimeSeriesData = (
  payments: PaymentRecord[],
  range: TimeRange,
): Array<{ date: string; revenue: number; count: number }> => {
  const { start, end } = getDateRange(range);
  const data: Array<{ date: string; revenue: number; count: number }> = [];

  // Determine grouping interval
  let interval: "day" | "week" | "month" = "month";
  let format: Intl.DateTimeFormatOptions;

  if (range === "7D") {
    interval = "day";
    format = { month: "short", day: "numeric" };
  } else if (range === "30D") {
    interval = "day";
    format = { month: "short", day: "numeric" };
  } else if (range === "90D") {
    interval = "week";
    format = { month: "short", day: "numeric" };
  } else {
    interval = "month";
    format = { month: "short", year: "2-digit" };
  }

  // Generate date buckets
  const buckets: {
    [key: string]: { revenue: number; count: number; date: Date };
  } = {};

  payments.forEach((payment) => {
    const paymentDate =
      payment.createdAt instanceof Date
        ? payment.createdAt
        : new Date(payment.createdAt);

    if (paymentDate < start || paymentDate > end) return;

    let bucketKey: string;
    let displayDate: Date;

    if (interval === "day") {
      bucketKey = paymentDate.toDateString();
      displayDate = new Date(paymentDate);
    } else if (interval === "week") {
      const weekStart = new Date(paymentDate);
      weekStart.setDate(paymentDate.getDate() - paymentDate.getDay());
      bucketKey = weekStart.toDateString();
      displayDate = weekStart;
    } else {
      const monthStart = new Date(
        paymentDate.getFullYear(),
        paymentDate.getMonth(),
        1,
      );
      bucketKey = monthStart.toDateString();
      displayDate = monthStart;
    }

    if (!buckets[bucketKey]) {
      buckets[bucketKey] = { revenue: 0, count: 0, date: displayDate };
    }

    if (normalizePaymentStatus(payment.status) === "success") {
      const amount =
        payment.amount >= 100 ? payment.amount / 100 : payment.amount;
      buckets[bucketKey].revenue += amount;
      buckets[bucketKey].count += 1;
    }
  });

  // Convert to array and sort
  Object.values(buckets)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .forEach((bucket) => {
      data.push({
        date: bucket.date.toLocaleDateString("en-US", format),
        revenue: bucket.revenue,
        count: bucket.count,
      });
    });

  return data;
};

// Generate insights
export const generateInsights = (payments: PaymentRecord[]) => {
  // Best day
  const dailyRevenue: { [key: string]: number } = {};
  payments.forEach((payment) => {
    if (normalizePaymentStatus(payment.status) === "success") {
      const date =
        payment.createdAt instanceof Date
          ? payment.createdAt
          : new Date(payment.createdAt);
      const dayKey = date.toDateString();
      const amount =
        payment.amount >= 100 ? payment.amount / 100 : payment.amount;
      dailyRevenue[dayKey] = (dailyRevenue[dayKey] || 0) + amount;
    }
  });

  const bestDay = Object.entries(dailyRevenue).sort(([, a], [, b]) => b - a)[0];

  // Most common payment method
  const methodCount: { [key: string]: number } = {};
  payments.forEach((payment) => {
    const method = payment.method || "Unknown";
    methodCount[method] = (methodCount[method] || 0) + 1;
  });

  const mostCommonMethod =
    Object.entries(methodCount).sort(([, a], [, b]) => b - a)[0]?.[0] ||
    "Unknown";

  // Top fee category
  const feeTypeRevenue: { [key: string]: number } = {};
  payments.forEach((payment) => {
    if (normalizePaymentStatus(payment.status) === "success") {
      const feeType = payment.feeType || "Other";
      const amount =
        payment.amount >= 100 ? payment.amount / 100 : payment.amount;
      feeTypeRevenue[feeType] = (feeTypeRevenue[feeType] || 0) + amount;
    }
  });

  const topFeeCategory =
    Object.entries(feeTypeRevenue).sort(([, a], [, b]) => b - a)[0]?.[0] ||
    "Other";

  return {
    bestDay: bestDay
      ? new Date(bestDay[0]).toLocaleDateString("en-US", {
          weekday: "long",
          month: "short",
          day: "numeric",
        })
      : "No data",
    mostCommonMethod,
    topFeeCategory,
  };
};

// Calculate analytics data
export const calculateAnalyticsData = (
  payments: PaymentRecord[],
  timeRange: TimeRange,
): AnalyticsData => {
  const { start, end } = getDateRange(timeRange);

  // Filter payments by date range
  const filteredPayments = payments.filter((payment) => {
    const paymentDate =
      payment.createdAt instanceof Date
        ? payment.createdAt
        : new Date(payment.createdAt);
    return paymentDate >= start && paymentDate <= end;
  });

  // Calculate metrics
  let totalRevenue = 0;
  let successfulPayments = 0;
  let pendingPayments = 0;
  let failedPayments = 0;
  let refundedPayments = 0;

  filteredPayments.forEach((payment) => {
    const status = normalizePaymentStatus(payment.status);
    const amount =
      payment.amount >= 100 ? payment.amount / 100 : payment.amount;

    switch (status) {
      case "success":
        totalRevenue += amount;
        successfulPayments++;
        break;
      case "pending":
        pendingPayments++;
        break;
      case "failed":
        failedPayments++;
        break;
      case "refunded":
        refundedPayments++;
        break;
    }
  });

  const totalPayments =
    successfulPayments + pendingPayments + failedPayments + refundedPayments;
  const successRate =
    totalPayments > 0 ? (successfulPayments / totalPayments) * 100 : 0;
  const avgPaymentValue =
    successfulPayments > 0 ? totalRevenue / successfulPayments : 0;

  // Calculate trend (compare with previous period)
  const previousPeriodStart = new Date(start);
  const previousPeriodEnd = new Date(start);

  switch (timeRange) {
    case "7D":
      previousPeriodStart.setDate(previousPeriodStart.getDate() - 7);
      previousPeriodEnd.setDate(previousPeriodEnd.getDate() - 7);
      break;
    case "30D":
      previousPeriodStart.setDate(previousPeriodStart.getDate() - 30);
      previousPeriodEnd.setDate(previousPeriodEnd.getDate() - 30);
      break;
    case "90D":
      previousPeriodStart.setDate(previousPeriodStart.getDate() - 90);
      previousPeriodEnd.setDate(previousPeriodEnd.getDate() - 90);
      break;
    case "6M":
      previousPeriodStart.setMonth(previousPeriodStart.getMonth() - 6);
      previousPeriodEnd.setMonth(previousPeriodEnd.getMonth() - 6);
      break;
    case "12M":
      previousPeriodStart.setFullYear(previousPeriodStart.getFullYear() - 1);
      previousPeriodEnd.setFullYear(previousPeriodEnd.getFullYear() - 1);
      break;
    case "YTD":
      previousPeriodStart.setFullYear(previousPeriodStart.getFullYear() - 1);
      previousPeriodEnd.setFullYear(previousPeriodEnd.getFullYear() - 1);
      previousPeriodEnd.setMonth(11, 31);
      break;
    case "ALL":
      // No trend for ALL
      break;
  }

  let previousRevenue = 0;
  if (timeRange !== "ALL") {
    const previousPayments = payments.filter((payment) => {
      const paymentDate =
        payment.createdAt instanceof Date
          ? payment.createdAt
          : new Date(payment.createdAt);
      return (
        paymentDate >= previousPeriodStart &&
        paymentDate <= previousPeriodEnd &&
        normalizePaymentStatus(payment.status) === "success"
      );
    });

    previousRevenue = previousPayments.reduce((sum, payment) => {
      const amount =
        payment.amount >= 100 ? payment.amount / 100 : payment.amount;
      return sum + amount;
    }, 0);
  }

  const trendPercentage =
    previousRevenue > 0
      ? ((totalRevenue - previousRevenue) / previousRevenue) * 100
      : totalRevenue > 0
        ? 100
        : 0;

  // Generate time series data
  const timeSeriesData = generateTimeSeriesData(filteredPayments, timeRange);

  // Status distribution
  const statusDistribution = [
    {
      status: "success",
      count: successfulPayments,
      amount: totalRevenue,
      percentage:
        totalPayments > 0 ? (successfulPayments / totalPayments) * 100 : 0,
    },
    {
      status: "pending",
      count: pendingPayments,
      amount: 0,
      percentage:
        totalPayments > 0 ? (pendingPayments / totalPayments) * 100 : 0,
    },
    {
      status: "failed",
      count: failedPayments,
      amount: 0,
      percentage:
        totalPayments > 0 ? (failedPayments / totalPayments) * 100 : 0,
    },
    {
      status: "refunded",
      count: refundedPayments,
      amount: 0,
      percentage:
        totalPayments > 0 ? (refundedPayments / totalPayments) * 100 : 0,
    },
  ].filter((item) => item.count > 0);

  // Insights
  const insights = generateInsights(filteredPayments);

  return {
    totalRevenue,
    successfulPayments,
    pendingPayments,
    failedPayments,
    refundedPayments,
    successRate,
    avgPaymentValue,
    trendPercentage,
    timeSeriesData,
    statusDistribution,
    insights,
  };
};
