import React, {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useLayoutEffect,
  startTransition,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import Layout from "../../components/Layout";
import { showToast } from "../../services/toast";
import { db } from "../../services/mockDb";
import { firestore } from "../../services/firebase";
import { collection, onSnapshot, doc, query, where } from "firebase/firestore";
import { useSchool } from "../../context/SchoolContext";
import { useAuth } from "../../context/AuthContext";
import {
  Users,
  GraduationCap,
  CreditCard,
  MoreHorizontal,
  UserPlus,
  User,
  BookOpen,
  Settings,
  Bell,
  Eye,
  Edit,
  X,
  Save,
  ArrowUpRight,
  Calendar,
  BarChart2,
  Trophy,
  RefreshCw,
  AlertOctagon,
  Wallet,
  Timer,
  AlertTriangle,
  Shield,
} from "lucide-react";
import { canAccessFeature } from "../../services/featureAccess";
import {
  collectHolidayDateKeys,
  formatSchoolDateKey,
  getExpectedSchoolDayKeys,
} from "../../services/schoolCalendar";
import {
  Notice,
  Student,
  TeacherAttendanceRecord,
  SchoolConfig,
  UserRole,
  PlatformBroadcast,
} from "../../types";
import {
  CLASSES_LIST,
  calculateGrade,
  getGradeColor,
  CURRENT_TERM,
  ACADEMIC_YEAR,
  calculateTotalScore,
} from "../../constants";
import AttendanceChart from "../../components/dashboard/AttendanceChart";

const MemoAttendanceChart = React.memo(AttendanceChart);

type AdminDashboardCache = {
  stats: {
    students: number;
    teachers: number;
    classes: number;
    maleStudents: number;
    femaleStudents: number;
    classAttendance: { className: string; percentage: number; id: string }[];
  };
  notices: Notice[];
  recentStudents: Student[];
  teacherAttendance: any[];
  pendingTeacherAttendance?: any[];
  teacherTermStats: any[];
  missedAttendanceAlerts: any[];
  missedStudentAttendanceAlerts: any[];
  gradeDistribution: Record<string, number>;
  topStudents: { id: string; name: string; class: string; avg: number }[];
  gradeBuckets: Record<
    string,
    { id: string; name: string; class: string; avg: number }[]
  >;
  schoolConfig: Partial<SchoolConfig>;
  heatmapData: Record<string, Record<string, number>>;
  comparativeData: { className: string; avg: number }[];
  gradeDistributionByClass: Record<string, Record<string, number>>;
  sparklines: Record<string, number[]>;
  lastUpdated: number;
  attendanceDate?: string;
};

const adminDashboardMemoryCache: Record<string, AdminDashboardCache> = {};

const SkeletonBlock: React.FC<{ className?: string }> = ({
  className = "h-4 bg-slate-100 rounded animate-pulse",
}) => <div className={className} />;

const SectionLoadingBadge: React.FC<{ label?: string }> = ({
  label = "Loading",
}) => (
  <div className="inline-flex items-center gap-2 text-xs text-slate-500">
    <span className="relative inline-flex h-4 w-4">
      <span className="absolute inset-0 rounded-full bg-gradient-to-r from-amber-400 via-[#0B4A82] to-emerald-400 opacity-60 blur-[1px]" />
      <span className="absolute inset-0 rounded-full border-2 border-slate-200 border-t-[#0B4A82] animate-spin" />
    </span>
    {label}…
  </div>
);

const DASHBOARD_SHELL =
  "relative min-w-0 overflow-hidden rounded-[36px] bg-[linear-gradient(180deg,#f8fafc_0%,#f5f9ff_34%,#ffffff_100%)] p-4 sm:p-6 lg:p-8";

const DASHBOARD_PANEL =
  "min-w-0 rounded-[28px] border border-slate-200/80 bg-white/95 shadow-[0_18px_45px_-34px_rgba(15,23,42,0.22)]";

const DASHBOARD_PANEL_SOFT =
  "min-w-0 rounded-[24px] border border-slate-200/80 bg-white/94 shadow-[0_14px_34px_-26px_rgba(15,23,42,0.18)]";

const DASHBOARD_PANEL_TINT =
  "min-w-0 rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] shadow-[0_18px_42px_-32px_rgba(15,23,42,0.2)]";

const DASHBOARD_HERO =
  "relative min-w-0 overflow-hidden rounded-[32px] border border-slate-900/5 bg-[linear-gradient(135deg,#0f172a_0%,#0b4a82_48%,#0284c7_100%)] p-6 text-white shadow-[0_24px_56px_-38px_rgba(11,74,130,0.56)] sm:p-7";

const DASHBOARD_SECTION_LABEL =
  "text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400";

const DASHBOARD_INFO_PILL =
  "inline-flex items-center gap-2 rounded-full border border-slate-200/85 bg-white/88 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm";

const DASHBOARD_BUTTON_PRIMARY =
  "inline-flex items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#0f172a_0%,#0b4a82_46%,#0284c7_100%)] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_14px_30px_-22px_rgba(11,74,130,0.44)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_34px_-20px_rgba(11,74,130,0.34)]";

const DASHBOARD_BUTTON_SECONDARY =
  "inline-flex items-center justify-center gap-2 rounded-full border border-slate-200/85 bg-white/88 px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md";

const DASHBOARD_TABLE_WRAPPER =
  "overflow-x-auto rounded-[24px] border border-white/80 bg-white/70 p-2 shadow-sm";

const DASHBOARD_DEFERRED_RENDER_STYLE: React.CSSProperties = {
  contentVisibility: "auto",
  containIntrinsicSize: "720px",
  contain: "layout paint style",
};

const DASHBOARD_ROOT_OVERLAY =
  "pointer-events-none absolute inset-0 rounded-[36px] bg-[linear-gradient(180deg,rgba(255,255,255,0.55),transparent_52%)]";

const DASHBOARD_HERO_OVERLAY =
  "pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.14),transparent_46%)]";

const DASHBOARD_SECTION_OVERLAY =
  "pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.34),transparent_48%)]";

const DASHBOARD_RENDER_LIMITS = {
  missedAttendanceAlerts: 8,
  missedStudentAttendanceAlerts: 8,
  notices: 8,
  broadcasts: 3,
  pendingTeacherAttendance: 6,
  teacherAttendance: 8,
  teacherTermStats: 8,
  recentStudents: 8,
} as const;

const getGradeAveragePercent = (distribution: Record<string, number>) => {
  const totalGrades = Object.values(distribution).reduce(
    (sum, value) => sum + value,
    0,
  );
  if (totalGrades <= 0) return 0;

  const weights: Record<string, number> = {
    A: 4,
    B: 3,
    C: 2,
    D: 1,
    F: 0,
  };
  const weightedSum = Object.entries(distribution).reduce(
    (acc, [grade, count]) => acc + (weights[grade] ?? 0) * (count ?? 0),
    0,
  );
  return Math.round((weightedSum / totalGrades / 4) * 100);
};

const RelativeTimeText: React.FC<{
  timestamp: Date | null;
  fallback?: string;
}> = React.memo(({ timestamp, fallback = "Not updated" }) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!timestamp) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [timestamp?.getTime()]);

  if (!timestamp) return <>{fallback}</>;
  return <>{Math.max(0, Math.floor((now - timestamp.getTime()) / 1000))}s ago</>;
});

const LiveCountdownText: React.FC<{
  target: Date;
  expiredLabel?: string;
}> = React.memo(({ target, expiredLabel = "Expired" }) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target.getTime()]);

  const remainingMs = Math.max(0, target.getTime() - now);
  if (remainingMs <= 0) return <>{expiredLabel}</>;

  const days = Math.floor(remainingMs / (24 * 60 * 60 * 1000));
  const hours = Math.floor((remainingMs / (60 * 60 * 1000)) % 24);
  const minutes = Math.floor((remainingMs / (60 * 1000)) % 60);
  const seconds = Math.floor((remainingMs / 1000) % 60);

  return (
    <>
      {days}d {hours}h {minutes}m {seconds}s
    </>
  );
});

const AnimatedMetricValue: React.FC<{
  value: number;
  format?: (value: number) => string;
}> = React.memo(({ value, format = (nextValue) => String(nextValue) }) => {
  const [displayValue, setDisplayValue] = useState(value);
  const previousValueRef = React.useRef(value);

  useEffect(() => {
    const startValue = previousValueRef.current;
    previousValueRef.current = value;

    if (startValue === value) {
      setDisplayValue(value);
      return;
    }

    const duration = 450;
    const animationStart = performance.now();
    let frameId = 0;

    const tick = (frameTime: number) => {
      const progress = Math.min(1, (frameTime - animationStart) / duration);
      const nextValue = Math.round(
        startValue + (value - startValue) * progress,
      );
      setDisplayValue(nextValue);
      if (progress < 1) {
        frameId = requestAnimationFrame(tick);
      }
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [value]);

  return <>{format(displayValue)}</>;
});

const parseLocalDate = (dateStr?: string | null): Date | null => {
  if (!dateStr) return null;
  const [year, month, day] = dateStr.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
};

type SchoolHolidayInput =
  | string
  | {
      date?: string | null;
      reason?: string;
    }
  | null
  | undefined;

const getSchoolDaySummary = (params: {
  config: Partial<SchoolConfig>;
  endDate?: Date;
  extraHolidayDates?: SchoolHolidayInput[];
  fallbackStartDate?: string | Date | null;
}) => {
  const summaryEndDate = params.endDate ? new Date(params.endDate) : new Date();
  summaryEndDate.setHours(0, 0, 0, 0);

  const dayKeys = getExpectedSchoolDayKeys({
    reopenDate: params.config.schoolReopenDate,
    endDate: summaryEndDate,
    holidayDates: [
      ...((params.config.holidayDates || []) as SchoolHolidayInput[]),
      ...(params.extraHolidayDates || []),
    ],
    vacationDate: params.config.vacationDate,
    nextTermBegins: params.config.nextTermBegins,
    fallbackStartDate:
      params.fallbackStartDate ?? formatSchoolDateKey(summaryEndDate),
  });
  const days = dayKeys.length;

  return {
    dayKeys,
    days,
    weeks: Math.max(0, Math.ceil(days / 5)),
  };
};

const getStudentCreatedAtMs = (student: Student): number => {
  const rawCreatedAt = (student as any)?.createdAt;
  if (!rawCreatedAt) return 0;

  if (typeof rawCreatedAt === "number") {
    return Number.isFinite(rawCreatedAt) ? rawCreatedAt : 0;
  }

  if (rawCreatedAt instanceof Date) {
    const timestamp = rawCreatedAt.getTime();
    return Number.isNaN(timestamp) ? 0 : timestamp;
  }

  if (typeof rawCreatedAt === "string") {
    const timestamp = new Date(rawCreatedAt).getTime();
    return Number.isNaN(timestamp) ? 0 : timestamp;
  }

  if (typeof rawCreatedAt?.toDate === "function") {
    const timestamp = rawCreatedAt.toDate().getTime();
    return Number.isNaN(timestamp) ? 0 : timestamp;
  }

  if (typeof rawCreatedAt?.seconds === "number") {
    return rawCreatedAt.seconds * 1000;
  }

  return 0;
};

const getRecentAdmissions = (students: Student[], limit = 5): Student[] =>
  [...students]
    .sort((a, b) => {
      const dateDiff = getStudentCreatedAtMs(b) - getStudentCreatedAtMs(a);
      if (dateDiff !== 0) return dateDiff;
      return a.name.localeCompare(b.name);
    })
    .slice(0, limit);

const getNextTermMeta = (currentTerm: string, academicYear: string) => {
  const match = currentTerm.match(/\d+/);
  const currentTermNumber = match ? parseInt(match[0], 10) : CURRENT_TERM;
  let nextTerm = currentTermNumber + 1;
  let nextAcademicYear = academicYear;

  if (currentTermNumber >= 3) {
    nextTerm = 1;
    const years = academicYear.split("-").map(Number);
    if (years.length === 2 && years.every((y) => !Number.isNaN(y))) {
      nextAcademicYear = `${years[0] + 1}-${years[1] + 1}`;
    }
  }

  return {
    nextTerm,
    nextAcademicYear,
  };
};

const polarToCartesian = (
  centerX: number,
  centerY: number,
  radius: number,
  angleInDegrees: number,
) => {
  const angleInRadians = (angleInDegrees * Math.PI) / 180;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
};

const describePieSlice = (
  centerX: number,
  centerY: number,
  radius: number,
  startAngle: number,
  endAngle: number,
) => {
  const start = polarToCartesian(centerX, centerY, radius, startAngle);
  const end = polarToCartesian(centerX, centerY, radius, endAngle);
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${centerX} ${centerY}`,
    `L ${start.x} ${start.y}`,
    `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`,
    "Z",
  ].join(" ");
};

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { school, schoolLoading } = useSchool();
  const schoolId = school?.id || null;
  const hasFeature = (feature: any) => canAccessFeature(user, school, feature);
  const [stats, setStats] = useState({
    students: 0,
    teachers: 0,
    classes: CLASSES_LIST.length,
    maleStudents: 0,
    femaleStudents: 0,
    classAttendance: [] as {
      className: string;
      percentage: number;
      id: string;
    }[],
  });
  const [notices, setNotices] = useState<Notice[]>([]);
  const [broadcasts, setBroadcasts] = useState<PlatformBroadcast[]>([]);
  const [recentStudents, setRecentStudents] = useState<Student[]>([]);
  const [dashboardStatsCache, setDashboardStatsCache] = useState<
    typeof stats | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [initialDataReady, setInitialDataReady] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [heavyLoading, setHeavyLoading] = useState(false);
  const skipSkeletonsOnRefreshRef = React.useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Teacher Attendance State
  const [teacherAttendance, setTeacherAttendance] = useState<any[]>([]);
  const [pendingTeacherAttendance, setPendingTeacherAttendance] = useState<
    any[]
  >([]);
  const [isApprovingAllTeacherAttendance, setIsApprovingAllTeacherAttendance] =
    useState(false);
  const [teacherTermStats, setTeacherTermStats] = useState<any[]>([]);
  const [missedAttendanceAlerts, setMissedAttendanceAlerts] = useState<any[]>(
    [],
  );
  const [missedStudentAttendanceAlerts, setMissedStudentAttendanceAlerts] =
    useState<any[]>([]);

  // Real-time metrics
  const [realTimeEnabled, setRealTimeEnabled] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const pollRef = React.useRef<number | null>(null);
  const heavyRefreshTimerRef = React.useRef<number | null>(null);
  const heavyRefreshInFlightRef = React.useRef(false);
  const lastHeavyRefreshAtRef = React.useRef(0);
  const [thisWeekAttendance, setThisWeekAttendance] = useState<number | null>(
    null,
  );
  const [lastWeekAttendance, setLastWeekAttendance] = useState<number | null>(
    null,
  );

  const HEAVY_REFRESH_THROTTLE_MS = 15000;
  const STATS_POLL_INTERVAL_MS = 30000;
  const parseYmdDate = (value?: string) => {
    if (!value) return null;
    const parts = value.split("-");
    if (parts.length !== 3) return null;
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
  };

  const isPendingWithinReopenWindow = (
    value?: string,
    baseDate?: Date,
    reopenDate?: string,
  ) => {
    const target = parseYmdDate(value || "");
    if (!target) return false;
    const base = baseDate ? new Date(baseDate) : new Date();
    base.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    if (target > base) return false;
    const reopen = parseYmdDate(reopenDate || "");
    if (!reopen) return true;
    reopen.setHours(0, 0, 0, 0);
    return target >= reopen;
  };

  // Configuration State
  const [schoolConfig, setSchoolConfig] = useState<Partial<SchoolConfig>>({
    academicYear: "",
    currentTerm: "",
    schoolReopenDate: "",
    schoolName: "", // Assuming these properties are always present based on SchoolConfig interface
    headTeacherRemark: "",
    termEndDate: "",
    vacationDate: "",
    holidayDates: [],
    nextTermBegins: "",
    termTransitionProcessed: false,
  });

  // Attendance Week Navigation (initialized to null, set after config loads)
  const [attendanceWeek, setAttendanceWeek] = useState<Date | null>(null);

  // Performance Stats
  const [gradeDistribution, setGradeDistribution] = useState<
    Record<string, number>
  >({ A: 0, B: 0, C: 0, D: 0, F: 0 });
  const [topStudents, setTopStudents] = useState<
    { id: string; name: string; class: string; avg: number }[]
  >([]);
  const [gradeBuckets, setGradeBuckets] = useState<
    Record<string, { id: string; name: string; class: string; avg: number }[]>
  >({ A: [], B: [], C: [], D: [], F: [] });
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
  const [totalSchoolDays, setTotalSchoolDays] = useState<number | null>(null);
  const [totalSchoolWeeks, setTotalSchoolWeeks] = useState<number | null>(null);
  const fallbackSchoolDays = useMemo(() => {
    return getSchoolDaySummary({
      config: schoolConfig,
      endDate: new Date(),
    });
  }, [schoolConfig]);

  const vacationBanner = useMemo(() => {
    const vacationDate = parseLocalDate(schoolConfig.vacationDate || "");
    const nextTermBegins = parseLocalDate(schoolConfig.nextTermBegins || "");
    if (!vacationDate || !nextTermBegins) return null;

    const bannerStart = new Date(vacationDate);
    bannerStart.setDate(bannerStart.getDate() + 1);
    bannerStart.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (today < bannerStart || today >= nextTermBegins) return null;

    return { vacationDate, nextTermBegins };
  }, [schoolConfig.vacationDate, schoolConfig.nextTermBegins]);

  const normalizePlanEndsAt = (raw: any) => {
    if (!raw) return null;
    const date =
      raw instanceof Date
        ? raw
        : new Date(typeof raw?.toDate === "function" ? raw.toDate() : raw);
    if (Number.isNaN(date.getTime())) return null;
    if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      date.setHours(23, 59, 59, 999);
    }
    return date;
  };

  const getPlanMonths = (plan?: string) => {
    if (plan === "termly") return 4;
    if (plan === "yearly") return 12;
    return 1;
  };

  const resolvePlanEndsAt = () => {
    const plan = (school as any)?.plan || "monthly";
    if (plan === "free") return null;

    const explicitEndsAt = normalizePlanEndsAt((school as any)?.planEndsAt);
    if (explicitEndsAt) return explicitEndsAt;

    const rawLastPayment = (school as any)?.billing?.lastPaymentAt || null;
    const rawCreatedAt =
      school?.createdAt || (school as any)?.billing?.createdAt || null;

    const parseDate = (raw: any) => {
      if (!raw) return null;
      const date =
        raw instanceof Date
          ? raw
          : new Date(typeof raw?.toDate === "function" ? raw.toDate() : raw);
      if (Number.isNaN(date.getTime())) return null;
      return date;
    };

    let baseDate = parseDate(rawLastPayment) || parseDate(rawCreatedAt);
    if (!baseDate) return null;

    if (rawLastPayment) {
      baseDate = new Date(baseDate);
      baseDate.setDate(1);
      baseDate.setHours(0, 0, 0, 0);
    }

    const endDate = new Date(baseDate);
    endDate.setMonth(endDate.getMonth() + getPlanMonths(plan));
    return endDate;
  };

  const resolvedPlanEndsAt = useMemo(
    () => resolvePlanEndsAt(),
    [
      school?.plan,
      school?.planEndsAt,
      school?.createdAt,
      (school as any)?.billing?.lastPaymentAt,
      (school as any)?.billing?.createdAt,
    ],
  );

  const subscriptionPlanEndsAt = useMemo(() => {
    if ((school as any)?.plan === "free") return null;
    if ((school as any)?.plan === "trial") return null;
    if (!resolvedPlanEndsAt) return null;
    return resolvedPlanEndsAt.getTime() > Date.now() ? resolvedPlanEndsAt : null;
  }, [resolvedPlanEndsAt, school?.plan]);

  const trialPlanEndsAt = useMemo(() => {
    if ((school as any)?.plan !== "trial") return null;
    const planEndsAt = normalizePlanEndsAt((school as any)?.planEndsAt);
    if (!planEndsAt) return null;
    return planEndsAt.getTime() > Date.now() ? planEndsAt : null;
  }, [school?.planEndsAt, school?.plan]);

  const gracePeriod = useMemo(() => {
    if ((school as any)?.plan === "free") return null;
    if ((school as any)?.plan === "trial") return null;
    if (!resolvedPlanEndsAt) return null;

    const graceEndsAt = new Date(
      resolvedPlanEndsAt.getTime() + 7 * 24 * 60 * 60 * 1000,
    );
    const nowMs = Date.now();
    if (
      nowMs < resolvedPlanEndsAt.getTime() ||
      nowMs >= graceEndsAt.getTime()
    ) {
      return null;
    }

    return {
      graceEndsAt,
    };
  }, [resolvedPlanEndsAt, school?.plan]);

  // Advanced visualization state
  const [heatmapData, setHeatmapData] = useState<
    Record<string, Record<string, number>>
  >({}); // classId -> { subject: avg }
  const [comparativeData, setComparativeData] = useState<
    { className: string; avg: number }[]
  >([]);
  const [gradeDistributionByClass, setGradeDistributionByClass] = useState<
    Record<string, Record<string, number>>
  >({});
  const [sparklines, setSparklines] = useState<Record<string, number[]>>({});

  // --- Modal States ---
  const [viewStudent, setViewStudent] = useState<Student | null>(null);
  const [performanceData, setPerformanceData] = useState<any>(null);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<Student>>({});

  const summaryCacheKey = useMemo(
    () => (schoolId ? `admin_dashboard_summary_${schoolId}` : ""),
    [schoolId],
  );

  const heavyCacheKey = useMemo(
    () => (schoolId ? `admin_dashboard_heavy_${schoolId}` : ""),
    [schoolId],
  );

  const cachedHeavy = useMemo(() => {
    if (!heavyCacheKey) return null;
    const raw =
      sessionStorage.getItem(heavyCacheKey) ||
      localStorage.getItem(heavyCacheKey);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AdminDashboardCache;
    } catch (e) {
      console.warn("Failed to parse cached dashboard data", e);
      sessionStorage.removeItem(heavyCacheKey);
      localStorage.removeItem(heavyCacheKey);
      return null;
    }
  }, [heavyCacheKey]);

  const currentAttendanceAverage = useMemo(() => {
    const classPctList = stats.classAttendance.map((c) => c.percentage || 0);
    if (classPctList.length === 0) return 0;
    return Math.round(
      classPctList.reduce((sum, percentage) => sum + percentage, 0) /
        classPctList.length,
    );
  }, [stats.classAttendance]);

  const overallGradeAverage = useMemo(
    () => getGradeAveragePercent(gradeDistribution),
    [gradeDistribution],
  );

  const averageTeacherAttendanceRate = useMemo(() => {
    if (teacherTermStats.length === 0) return 0;
    return Math.round(
      teacherTermStats.reduce(
        (sum: number, stat: any) => sum + stat.attendanceRate,
        0,
      ) / teacherTermStats.length,
    );
  }, [teacherTermStats]);

  const visibleRecentStudents = useMemo(
    () => recentStudents.slice(0, DASHBOARD_RENDER_LIMITS.recentStudents),
    [recentStudents],
  );
  const visibleBroadcasts = useMemo(
    () => broadcasts.slice(0, DASHBOARD_RENDER_LIMITS.broadcasts),
    [broadcasts],
  );
  const visibleNotices = useMemo(
    () => notices.slice(0, DASHBOARD_RENDER_LIMITS.notices),
    [notices],
  );
  const visibleMissedAttendanceAlerts = useMemo(
    () =>
      missedAttendanceAlerts.slice(
        0,
        DASHBOARD_RENDER_LIMITS.missedAttendanceAlerts,
      ),
    [missedAttendanceAlerts],
  );
  const visibleMissedStudentAttendanceAlerts = useMemo(
    () =>
      missedStudentAttendanceAlerts.slice(
        0,
        DASHBOARD_RENDER_LIMITS.missedStudentAttendanceAlerts,
      ),
    [missedStudentAttendanceAlerts],
  );
  const visiblePendingTeacherAttendance = useMemo(
    () =>
      pendingTeacherAttendance.slice(
        0,
        DASHBOARD_RENDER_LIMITS.pendingTeacherAttendance,
      ),
    [pendingTeacherAttendance],
  );
  const visibleTeacherAttendance = useMemo(
    () =>
      teacherAttendance.slice(0, DASHBOARD_RENDER_LIMITS.teacherAttendance),
    [teacherAttendance],
  );
  const visibleTeacherTermStats = useMemo(
    () => teacherTermStats.slice(0, DASHBOARD_RENDER_LIMITS.teacherTermStats),
    [teacherTermStats],
  );

  useLayoutEffect(() => {
    if (!cachedHeavy) return;
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    const isCacheStale =
      cachedHeavy.attendanceDate && cachedHeavy.attendanceDate !== todayStr;
    skipSkeletonsOnRefreshRef.current = true;
    setStats(cachedHeavy.stats);
    setDashboardStatsCache(cachedHeavy.stats);
    setNotices(cachedHeavy.notices);
    setRecentStudents(cachedHeavy.recentStudents);
    const cachedTeacherAttendance = (
      isCacheStale
        ? cachedHeavy.teacherAttendance || []
        : (cachedHeavy.teacherAttendance || []).filter(
            (record: any) => record.date === todayStr,
          )
    ).filter((record: any) => record.approvalStatus !== "pending");
    const cachedPending = cachedHeavy.pendingTeacherAttendance || [];
    const filteredCachedPending = cachedPending.filter(
      (record: any) => record.approvalStatus === "pending",
    );
    const cachedApprovedToday = cachedTeacherAttendance;
    setTeacherAttendance(cachedApprovedToday);
    setPendingTeacherAttendance(filteredCachedPending);
    setTeacherTermStats(cachedHeavy.teacherTermStats);
    setMissedAttendanceAlerts(cachedHeavy.missedAttendanceAlerts);
    setMissedStudentAttendanceAlerts(cachedHeavy.missedStudentAttendanceAlerts);
    setGradeDistribution(cachedHeavy.gradeDistribution);
    setTopStudents(cachedHeavy.topStudents);
    setGradeBuckets(cachedHeavy.gradeBuckets);
    setSchoolConfig((prev) => ({ ...prev, ...cachedHeavy.schoolConfig }));
    setHeatmapData(cachedHeavy.heatmapData);
    setComparativeData(cachedHeavy.comparativeData);
    setGradeDistributionByClass(cachedHeavy.gradeDistributionByClass);
    setSparklines(cachedHeavy.sparklines);
    setLastUpdated(new Date(cachedHeavy.lastUpdated));
    setInitialDataReady(true);
  }, [cachedHeavy]);

  const fetchSummary = useCallback(
    async (options?: { background?: boolean }) => {
      if (!schoolId) return;
      if (!options?.background) setSummaryLoading(true);
      setError(null);
      try {
        const summary = await db.getDashboardSummary(schoolId);
        const nextStats = {
          students: summary.studentsCount,
          teachers: summary.teachersCount,
          classes: CLASSES_LIST.length,
          maleStudents: 0,
          femaleStudents: 0,
          classAttendance: [] as {
            className: string;
            percentage: number;
            id: string;
          }[],
        };

        setStats((prev) => ({
          ...prev,
          students: nextStats.students,
          teachers: nextStats.teachers,
          classes: nextStats.classes,
        }));
        setDashboardStatsCache((prev) => ({
          ...(prev || nextStats),
          students: nextStats.students,
          teachers: nextStats.teachers,
          classes: nextStats.classes,
        }));
        if (summaryCacheKey) {
          sessionStorage.setItem(
            summaryCacheKey,
            JSON.stringify({
              ...nextStats,
              updatedAt: Date.now(),
            }),
          );
          localStorage.removeItem(summaryCacheKey);
        }
      } catch (err) {
        console.error("Summary fetch error:", err);
      } finally {
        if (!options?.background) setSummaryLoading(false);
      }
    },
    [schoolId, summaryCacheKey],
  );

  const fetchHeavyData = useCallback(
    async (options?: { background?: boolean; force?: boolean }) => {
      if (!schoolId) return;
      if (heavyRefreshInFlightRef.current && !options?.force) return;
      heavyRefreshInFlightRef.current = true;
      if (!options?.background) setHeavyLoading(true);
      setError(null);
      try {
        const localToday = new Date();
        const today = `${localToday.getFullYear()}-${String(localToday.getMonth() + 1).padStart(2, "0")}-${String(localToday.getDate()).padStart(2, "0")}`;

        // Wrap each call to prevent permission errors from blocking the whole dashboard
        const wrapCall = async <T,>(
          fn: () => Promise<T>,
          fallback: T,
        ): Promise<T> => {
          try {
            return await fn();
          } catch (err) {
            const msg = String((err as any)?.message || "");
            if (msg.includes("permission") || msg.includes("insufficient")) {
              console.warn(
                "Permission denied for dashboard call, continuing with fallback",
                err,
              );
              return fallback;
            }
            throw err;
          }
        };

        const [
          dashboardStats,
          students,
          fetchedNotices,
          fetchedBroadcasts,
          config,
          teachers,
          teacherAttendanceData,
          pendingTeacherAttendance,
          allTeacherRecords,
        ] = await Promise.all([
          wrapCall(() => db.getDashboardStats(schoolId), {
            studentsCount: 0,
            teachersCount: 0,
            gender: { male: 0, female: 0 },
            classAttendance: [],
          }),
          wrapCall(() => db.getStudents(schoolId), []),
          wrapCall(() => db.getNotices(schoolId), []),
          wrapCall(() => db.getPlatformBroadcasts(schoolId), []),
          wrapCall(() => db.getSchoolConfig(schoolId), {
            schoolId: schoolId || "",
            schoolName: "",
            academicYear: "",
            currentTerm: "",
            headTeacherRemark: "",
            termEndDate: "",
            schoolReopenDate: "",
            vacationDate: "",
            nextTermBegins: "",
            termTransitionProcessed: false,
          }),
          wrapCall(() => db.getUsers(schoolId), []),
          wrapCall(
            () => db.getAllApprovedTeacherAttendance(schoolId, today),
            [],
          ),
          wrapCall(() => db.getAllPendingTeacherAttendance(schoolId), []),
          wrapCall(() => db.getAllTeacherAttendanceRecords(schoolId), []),
        ]);

        // Check for missed attendance from school reopen date through yesterday.
        const missedAlerts: any[] = [];
        const missedStudentAlerts: any[] = [];

        const currentDate = new Date();
        currentDate.setHours(0, 0, 0, 0);
        const reopenDateObj = config.schoolReopenDate
          ? new Date(config.schoolReopenDate + "T00:00:00")
          : null;
        const schoolHasReopened =
          !reopenDateObj || currentDate >= reopenDateObj;
        const vacationDateObj = config.vacationDate
          ? new Date(config.vacationDate + "T00:00:00")
          : null;
        if (vacationDateObj) vacationDateObj.setHours(0, 0, 0, 0);
        const nextTermBeginsObj = config.nextTermBegins
          ? new Date(config.nextTermBegins + "T00:00:00")
          : null;
        currentDate.setHours(0, 0, 0, 0);
        const isOnVacation =
          vacationDateObj &&
          nextTermBeginsObj &&
          currentDate >= vacationDateObj &&
          currentDate < nextTermBeginsObj;
        const yesterday = new Date(currentDate);
        yesterday.setDate(yesterday.getDate() - 1);
        const fallbackMissedStart = new Date(currentDate);
        fallbackMissedStart.setDate(fallbackMissedStart.getDate() - 5);
        fallbackMissedStart.setHours(0, 0, 0, 0);
        const missedRangeStart = reopenDateObj || fallbackMissedStart;
        const shouldCheckMissedAttendance =
          schoolHasReopened && !isOnVacation && teachers.length > 0 &&
          yesterday >= missedRangeStart;

        const classAttendanceRange = shouldCheckMissedAttendance
          ? await wrapCall(
              () =>
                db.getAttendanceByDateRange(
                  schoolId,
                  formatSchoolDateKey(missedRangeStart),
                  formatSchoolDateKey(yesterday),
                ),
              [],
            )
          : [];

        const holidayDates = collectHolidayDateKeys([
          ...allTeacherRecords.filter((record) => record.isHoliday).map((record) => record.date),
          ...classAttendanceRange
            .filter((record: any) => record.isHoliday)
            .map((record: any) => record.date),
          ...(config.holidayDates || []),
        ]);

        const expectedSchoolDays = shouldCheckMissedAttendance
          ? getExpectedSchoolDayKeys({
              reopenDate: config.schoolReopenDate,
              endDate: yesterday,
              holidayDates: Array.from(holidayDates),
              vacationDate: config.vacationDate,
              nextTermBegins: config.nextTermBegins,
              fallbackStartDate: fallbackMissedStart,
            })
          : [];

        const teacherAttendanceKeys = new Set(
          allTeacherRecords
            .filter((record) => !record.isHoliday)
            .map((record) => `${record.teacherId}_${record.date}`),
        );
        const classAttendanceKeys = new Set(
          classAttendanceRange
            .filter((record: any) => !record.isHoliday)
            .map((record: any) => `${record.classId}_${record.date}`),
        );
        const teacherUsers = teachers.filter(
          (teacher) => teacher.role === UserRole.TEACHER,
        );

        teacherUsers.forEach((teacher) => {
          expectedSchoolDays.forEach((dateKey) => {
            if (!teacherAttendanceKeys.has(`${teacher.id}_${dateKey}`)) {
              missedAlerts.push({
                teacherId: teacher.id,
                teacherName: teacher.fullName,
                date: dateKey,
                classes:
                  teacher.assignedClassIds
                    ?.map((id) => CLASSES_LIST.find((c) => c.id === id)?.name)
                    .join(", ") || "Not Assigned",
              });
            }
          });
        });

        teacherUsers
          .filter(
            (teacher) =>
              teacher.assignedClassIds && teacher.assignedClassIds.length > 0,
          )
          .forEach((teacher) => {
            const classId = teacher.assignedClassIds![0];
            const className =
              CLASSES_LIST.find((c) => c.id === classId)?.name ||
              "Unknown Class";

            expectedSchoolDays.forEach((dateKey) => {
              if (!classAttendanceKeys.has(`${classId}_${dateKey}`)) {
                missedStudentAlerts.push({
                  teacherId: teacher.id,
                  teacherName: teacher.fullName,
                  date: dateKey,
                  className,
                });
              }
            });
          });

        const parseLocalDateForStats = (dateStr: string): Date | null => {
          if (!dateStr) return null;
          if (dateStr.includes("-")) {
            const parts = dateStr.split("-");
            if (parts.length === 3) {
              const [p1, p2, p3] = parts.map(Number);
              if (parts[0].length === 4) {
                const d = new Date(p1, p2 - 1, p3);
                return Number.isNaN(d.getTime()) ? null : d;
              }
              const d = new Date(p3, p1 - 1, p2);
              return Number.isNaN(d.getTime()) ? null : d;
            }
          }
          if (dateStr.includes("/")) {
            const parts = dateStr.split("/");
            if (parts.length === 3) {
              const [m, d, y] = parts.map(Number);
              const parsed = new Date(y, m - 1, d);
              return Number.isNaN(parsed.getTime()) ? null : parsed;
            }
          }
          const fallback = new Date(dateStr);
          return Number.isNaN(fallback.getTime()) ? null : fallback;
        };

        const recordDateRange = allTeacherRecords.reduce<{
          min?: Date;
          max?: Date;
          minLabel?: string;
          maxLabel?: string;
        }>((acc, record) => {
          const parsed = parseLocalDateForStats(record.date);
          if (!parsed) return acc;
          if (!acc.min || parsed < acc.min) {
            acc.min = parsed;
            acc.minLabel = record.date;
          }
          if (!acc.max || parsed > acc.max) {
            acc.max = parsed;
            acc.maxLabel = record.date;
          }
          return acc;
        }, {});

        const earliestRecordDate = recordDateRange.minLabel || "";
        const latestRecordDate = recordDateRange.maxLabel || "";
        const todayStr = today;
        const termStartDate =
          config.schoolReopenDate || earliestRecordDate || todayStr;
        const termEndDate = config.vacationDate || latestRecordDate || todayStr;

        const parsedStart = parseLocalDateForStats(termStartDate);
        const parsedEnd = parseLocalDateForStats(termEndDate);
        const parsedToday = parseLocalDateForStats(todayStr) || new Date();
        const safeStart = parsedStart || parsedToday;
        const safeEndRaw = parsedEnd || parsedToday;
        const safeEnd = safeEndRaw > parsedToday ? parsedToday : safeEndRaw;
        const startLabel = `${safeStart.getFullYear()}-${String(
          safeStart.getMonth() + 1,
        ).padStart(2, "0")}-${String(safeStart.getDate()).padStart(2, "0")}`;
        const endLabel = `${safeEnd.getFullYear()}-${String(
          safeEnd.getMonth() + 1,
        ).padStart(2, "0")}-${String(safeEnd.getDate()).padStart(2, "0")}`;
        const normalizedStart = safeStart <= safeEnd ? startLabel : endLabel;
        const normalizedEnd = safeStart <= safeEnd ? endLabel : startLabel;

        const totalSchoolDaySummary = getSchoolDaySummary({
          config,
          endDate: parsedToday,
          extraHolidayDates: allTeacherRecords
            .filter((record) => record.isHoliday)
            .map((record) => record.date),
          fallbackStartDate: earliestRecordDate || todayStr,
        });
        setTotalSchoolDays(totalSchoolDaySummary.days);
        setTotalSchoolWeeks(totalSchoolDaySummary.weeks);

        // Calculate term statistics for each teacher (only from school reopen date to vacation date)
        const teacherTermStats = teachers
          .filter((t) => t.role === UserRole.TEACHER)
          .map((teacher) => {
            const teacherRecords = allTeacherRecords.filter(
              (r) =>
                r.teacherId === teacher.id &&
                r.date >= normalizedStart &&
                r.date <= normalizedEnd &&
                !r.isHoliday &&
                r.approvalStatus !== "pending",
            );
            const presentDays = teacherRecords.filter(
              (r) => r.status === "present",
            ).length;
            const totalDays = totalSchoolDaySummary.days;
            const attendanceRate =
              totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;

            return {
              id: teacher.id,
              name: teacher.fullName,
              classes:
                teacher.assignedClassIds
                  ?.map((id) => CLASSES_LIST.find((c) => c.id === id)?.name)
                  .join(", ") || "Not Assigned",
              presentDays,
              totalDays,
              attendanceRate,
            };
          });

        const attendanceKey = (record: any) =>
          record.id ||
          `${record.schoolId || schoolId || "unknown"}_${record.teacherId || "unknown"}_${record.date || ""}`;

        // Map today's attendance records to include teacher names and classes
        const teacherAttendanceWithDetails = teacherAttendanceData.map(
          (record) => {
            const teacher = teachers.find((t) => t.id === record.teacherId);
            return {
              ...record,
              id: attendanceKey(record),
              teacherName: teacher?.fullName || "Unknown",
              teacherClasses:
                teacher?.assignedClassIds
                  ?.map((id) => CLASSES_LIST.find((c) => c.id === id)?.name)
                  .join(", ") || "Not Assigned",
            };
          },
        ) as any[];

        const pendingRecordsForToday = (
          pendingTeacherAttendance.length > 0
            ? pendingTeacherAttendance
            : allTeacherRecords.filter(
                (record) => record.approvalStatus === "pending",
              )
        ) as any[];

        const pendingAttendanceWithDetails = pendingRecordsForToday.map(
          (record) => {
            const teacher = teachers.find((t) => t.id === record.teacherId);
            const resolvedId = record.id || attendanceKey(record);
            return {
              ...record,
              id: resolvedId,
              teacherName: teacher?.fullName || "Unknown",
              teacherClasses:
                teacher?.assignedClassIds
                  ?.map((id) => CLASSES_LIST.find((c) => c.id === id)?.name)
                  .join(", ") || "Not Assigned",
            };
          },
        ) as any[];

        const approvedAttendanceWithDetails = allTeacherRecords
          .filter((record) =>
            Boolean(
              record.date === today && record.approvalStatus !== "pending",
            ),
          )
          .map((record) => {
            const teacher = teachers.find((t) => t.id === record.teacherId);
            return {
              ...record,
              id: attendanceKey(record),
              teacherName: teacher?.fullName || "Unknown",
              teacherClasses:
                teacher?.assignedClassIds
                  ?.map((id) => CLASSES_LIST.find((c) => c.id === id)?.name)
                  .join(", ") || "Not Assigned",
            };
          }) as any[];

        const todayAttendanceWithDetails = allTeacherRecords
          .filter((record) => record.date === today)
          .map((record) => {
            const teacher = teachers.find((t) => t.id === record.teacherId);
            return {
              ...record,
              id: attendanceKey(record),
              teacherName: teacher?.fullName || "Unknown",
              teacherClasses:
                teacher?.assignedClassIds
                  ?.map((id) => CLASSES_LIST.find((c) => c.id === id)?.name)
                  .join(", ") || "Not Assigned",
            };
          }) as any[];

        setSchoolConfig((prev) => ({
          ...prev,
          academicYear: config.academicYear,
          currentTerm: config.currentTerm,
          schoolReopenDate: config.schoolReopenDate || "",
          vacationDate: config.vacationDate || "",
          nextTermBegins: config.nextTermBegins || "",
          holidayDates: config.holidayDates || [],
        }));

        // Check for automatic term transition
        if (
          config.nextTermBegins &&
          new Date() >= new Date(config.nextTermBegins + "T00:00:00") &&
          !config.termTransitionProcessed
        ) {
          try {
            const { nextTerm, nextAcademicYear } = getNextTermMeta(
              config.currentTerm,
              config.academicYear,
            );
            const updatedConfig = {
              ...config,
              currentTerm: `Term ${nextTerm}`,
              academicYear: nextAcademicYear,
              schoolReopenDate: config.nextTermBegins || "",
              vacationDate: "",
              nextTermBegins: "",
              termTransitionProcessed: true,
            };

            await db.resetForNewTerm(updatedConfig);
            showToast("Term transition completed automatically.", {
              type: "success",
            });
            // Refetch data after transition
            setTimeout(() => fetchHeavyData({ background: true }), 1000);
          } catch (error) {
            console.error("Auto term transition failed:", error);
            showToast("Auto term transition failed. Please check settings.", {
              type: "error",
            });
          }
        }

        // Use Dynamic Term Number from config string (e.g. "Term 2" -> 2)
        // Fallback to CURRENT_TERM constant if parsing fails
        let dynamicTerm = CURRENT_TERM;
        if (config.currentTerm) {
          const match = config.currentTerm.match(/\d+/);
          if (match) dynamicTerm = parseInt(match[0]);
        }

        // Performance Calculations
        const allAssessments = await db.getAllAssessments(schoolId);

        // 1. Group by Student
        const studentScores: Record<
          string,
          { total: number; count: number; name: string; classId: string }
        > = {};

        // Map ID to Name for easier lookup
        const studentMap = new Map(students.map((s) => [s.id, s]));
        const studentToClass = new Map(students.map((s) => [s.id, s.classId]));
        const perClassSubject: Record<
          string,
          Record<string, { total: number; count: number }>
        > = {};
        const perClassTotals: Record<string, { total: number; count: number }> =
          {};
        const perClassGrades: Record<string, Record<string, number>> = {};
        const perClassTimeline: Record<
          string,
          { date: number; avg: number }[]
        > = {};

        const hasAssessmentData = allAssessments.some((a) => {
          const score = a.total ?? calculateTotalScore(a);
          return a.term === (dynamicTerm as any) && score > 0;
        });

        allAssessments.forEach((a) => {
          const score = a.total ?? calculateTotalScore(a);
          const classId =
            a.classId || studentToClass.get(a.studentId) || "unknown";
          const subject = a.subject || "General";

          if (!perClassSubject[classId]) perClassSubject[classId] = {};
          if (!perClassSubject[classId][subject]) {
            perClassSubject[classId][subject] = { total: 0, count: 0 };
          }
          perClassSubject[classId][subject].total += score;
          perClassSubject[classId][subject].count += 1;

          if (!perClassTotals[classId]) {
            perClassTotals[classId] = { total: 0, count: 0 };
          }
          perClassTotals[classId].total += score;
          perClassTotals[classId].count += 1;

          const overallGrade =
            score >= 80
              ? "A"
              : score >= 65
                ? "B"
                : score >= 50
                  ? "C"
                  : score >= 35
                    ? "D"
                    : "F";
          if (!perClassGrades[classId]) {
            perClassGrades[classId] = { A: 0, B: 0, C: 0, D: 0, F: 0 };
          }
          perClassGrades[classId][overallGrade] =
            (perClassGrades[classId][overallGrade] || 0) + 1;

          const assessmentMeta = a as {
            date?: string;
            createdAt?: string | number | Date | null;
          };
          const when = assessmentMeta.date
            ? new Date(assessmentMeta.date).getTime()
            : assessmentMeta.createdAt
              ? new Date(assessmentMeta.createdAt).getTime()
              : Date.now();
          if (!perClassTimeline[classId]) perClassTimeline[classId] = [];
          perClassTimeline[classId].push({ date: when, avg: score });

          if (
            hasAssessmentData &&
            a.term === (dynamicTerm as any) &&
            score > 0 &&
            studentMap.has(a.studentId)
          ) {
            if (!studentScores[a.studentId]) {
              const s = studentMap.get(a.studentId)!;
              studentScores[a.studentId] = {
                total: 0,
                count: 0,
                name: s.name,
                classId: s.classId,
              };
            }
            studentScores[a.studentId].total += score;
            studentScores[a.studentId].count += 1;
          }
        });

        // 2. Calculate Averages & Grade Distribution (also build buckets)
        const counts = { A: 0, B: 0, C: 0, D: 0, F: 0 };
        const averagesList: {
          id: string;
          name: string;
          class: string;
          avg: number;
        }[] = [];
        const buckets: Record<
          string,
          { id: string; name: string; class: string; avg: number }[]
        > = { A: [], B: [], C: [], D: [], F: [] };

        Object.entries(studentScores).forEach(([studentId, s]) => {
          const avg = s.count > 0 ? s.total / s.count : 0;
          const { grade } = calculateGrade(avg);
          if (counts[grade as keyof typeof counts] !== undefined) {
            counts[grade as keyof typeof counts]++;
          }
          const record = {
            id: studentId,
            name: s.name,
            class: CLASSES_LIST.find((c) => c.id === s.classId)?.name || "N/A",
            avg: parseFloat(avg.toFixed(1)),
          };
          averagesList.push(record);
          if (buckets[grade]) buckets[grade].push(record);
        });

        // 3. Sort for Top Students
        averagesList.sort((a, b) => b.avg - a.avg);
        const topStudents = averagesList.slice(0, 5);

        const heat: Record<string, Record<string, number>> = {};
        Object.entries(perClassSubject).forEach(([cls, subjects]) => {
          heat[cls] = {};
          Object.entries(subjects).forEach(([subj, val]) => {
            heat[cls][subj] = Math.round(val.total / Math.max(1, val.count));
          });
        });

        const comp = Object.entries(perClassTotals)
          .map(([cls, v]) => ({
            className: CLASSES_LIST.find((c) => c.id === cls)?.name || cls,
            avg: Math.round(v.total / Math.max(1, v.count)),
          }))
          .sort((a, b) => b.avg - a.avg);

        const sparks: Record<string, number[]> = {};
        Object.entries(perClassTimeline).forEach(([cls, points]) => {
          const sorted = [...points].sort((a, b) => a.date - b.date);
          const bucketSize = Math.max(1, Math.ceil(sorted.length / 8));
          const bucketsForClass: number[] = [];

          for (let i = 0; i < sorted.length; i += bucketSize) {
            const slice = sorted.slice(i, i + bucketSize);
            bucketsForClass.push(
              Math.round(
                slice.reduce((sum, point) => sum + point.avg, 0) / slice.length,
              ),
            );
          }

          while (bucketsForClass.length < 8) {
            bucketsForClass.unshift(bucketsForClass[0] ?? 0);
          }
          sparks[cls] = bucketsForClass.slice(-8);
        });

        const fullStats = {
          students: dashboardStats.studentsCount,
          teachers: dashboardStats.teachersCount,
          classes: CLASSES_LIST.length,
          maleStudents: dashboardStats.gender.male,
          femaleStudents: dashboardStats.gender.female,
          classAttendance: dashboardStats.classAttendance,
        };
        const recentAdmissions = getRecentAdmissions(students);
        const todayTeacherAttendance = approvedAttendanceWithDetails.reduce(
          (acc: any[], record: any) => {
            const key = attendanceKey(record);
            if (!acc.find((item) => attendanceKey(item) === key)) {
              acc.push({ ...record, id: record.id || key });
            }
            return acc;
          },
          [],
        );
        const pendingTodayWithDetails = pendingAttendanceWithDetails.filter(
          (record) =>
            record.approvalStatus === "pending" &&
            isPendingWithinReopenWindow(
              record.date,
              localToday,
              config.schoolReopenDate,
            ),
        );
        const groupAlertsByTeacher = (alerts: any[]) => {
          const grouped = new Map<string, any>();
          alerts.forEach((alert) => {
            if (!grouped.has(alert.teacherId)) {
              grouped.set(alert.teacherId, {
                teacherId: alert.teacherId,
                teacherName: alert.teacherName,
                classes: alert.classes,
                className: alert.className,
                dates: [alert.date],
              });
            } else {
              const current = grouped.get(alert.teacherId);
              current.dates.push(alert.date);
            }
          });

          return Array.from(grouped.values()).map((alert) => ({
            ...alert,
            dates: Array.from(new Set(alert.dates)).sort(),
          }));
        };
        const groupedTeacherAlerts = groupAlertsByTeacher(missedAlerts);
        const groupedStudentAlerts = groupAlertsByTeacher(missedStudentAlerts);

        startTransition(() => {
          setStats(fullStats);
          setDashboardStatsCache(fullStats);
          setNotices(fetchedNotices);
          setBroadcasts(fetchedBroadcasts);
          setRecentStudents(recentAdmissions);
          setTeacherAttendance(todayTeacherAttendance);
          setPendingTeacherAttendance(pendingTodayWithDetails);
          setTeacherTermStats(teacherTermStats);
          setMissedAttendanceAlerts(groupedTeacherAlerts);
          setMissedStudentAttendanceAlerts(groupedStudentAlerts);
          setGradeDistribution(counts);
          setTopStudents(topStudents);
          setGradeBuckets(buckets);
          setHeatmapData(heat);
          setComparativeData(comp);
          setGradeDistributionByClass(perClassGrades);
          setSparklines(sparks);
          setLastUpdated(new Date());
          setInitialDataReady(true);
        });

        if (summaryCacheKey) {
          sessionStorage.setItem(
            summaryCacheKey,
            JSON.stringify({ ...fullStats, updatedAt: Date.now() }),
          );
          localStorage.removeItem(summaryCacheKey);
        }
        if (heavyCacheKey) {
          const cachePayload: AdminDashboardCache = {
            stats: fullStats,
            notices: fetchedNotices,
            recentStudents: recentAdmissions,
            teacherAttendance: todayTeacherAttendance,
            pendingTeacherAttendance: pendingTodayWithDetails,
            teacherTermStats: teacherTermStats,
            missedAttendanceAlerts: groupedTeacherAlerts,
            missedStudentAttendanceAlerts: groupedStudentAlerts,
            gradeDistribution: counts,
            topStudents,
            gradeBuckets: buckets,
            schoolConfig: {
              academicYear: config.academicYear,
              currentTerm: config.currentTerm,
              schoolReopenDate: config.schoolReopenDate || "",
              schoolName: config.schoolName,
              headTeacherRemark: config.headTeacherRemark,
              termEndDate: config.termEndDate,
              vacationDate: config.vacationDate,
              holidayDates: config.holidayDates || [],
              nextTermBegins: config.nextTermBegins,
              termTransitionProcessed: config.termTransitionProcessed,
            },
            heatmapData: heat,
            comparativeData: comp,
            gradeDistributionByClass: perClassGrades,
            sparklines: sparks,
            lastUpdated: Date.now(),
            attendanceDate: today,
          };
          sessionStorage.setItem(heavyCacheKey, JSON.stringify(cachePayload));
          localStorage.removeItem(heavyCacheKey);
        }
      } catch (err: any) {
        console.error("Dashboard fetch error:", err);
        const message = (err && (err.code || err.message)) || String(err);

        // Only show error message for non-permission issues
        // Permission errors are now handled per-call with fallbacks
        if (
          typeof message === "string" &&
          !(
            message.includes("permission-denied") ||
            message.includes("Missing or insufficient permissions") ||
            message.includes("permission") ||
            message.includes("PERMISSION_DENIED")
          )
        ) {
          setError(
            "Failed to load dashboard data. Please check your internet connection.",
          );
        }
        // Ensure UI renders with cached/empty data instead of staying in loading state
        setInitialDataReady(true);
      } finally {
        heavyRefreshInFlightRef.current = false;
        if (!options?.background) setHeavyLoading(false);
      }
    },
    [schoolId, summaryCacheKey],
  );

  const scheduleHeavyRefresh = useCallback(() => {
    if (!schoolId) return;
    const nowMs = Date.now();
    const elapsed = nowMs - lastHeavyRefreshAtRef.current;
    if (elapsed >= HEAVY_REFRESH_THROTTLE_MS) {
      lastHeavyRefreshAtRef.current = nowMs;
      fetchHeavyData({ background: true }).catch((e) =>
        console.error("Error refreshing attendance widgets", e),
      );
      return;
    }

    if (heavyRefreshTimerRef.current) return;
    const waitMs = Math.max(HEAVY_REFRESH_THROTTLE_MS - elapsed, 0);
    heavyRefreshTimerRef.current = window.setTimeout(() => {
      heavyRefreshTimerRef.current = null;
      lastHeavyRefreshAtRef.current = Date.now();
      fetchHeavyData({ background: true }).catch((e) =>
        console.error("Error refreshing attendance widgets", e),
      );
    }, waitMs);
  }, [fetchHeavyData, schoolId]);

  useEffect(() => {
    if (!cachedHeavy || !heavyCacheKey) return;

    const cachedConfig = cachedHeavy.schoolConfig;
    if (!cachedConfig) return;

    const hasLiveConfig = Boolean(
      schoolConfig.currentTerm ||
      schoolConfig.academicYear ||
      schoolConfig.schoolReopenDate,
    );

    if (!hasLiveConfig) return;

    const termChanged =
      (cachedConfig.currentTerm || "") !== (schoolConfig.currentTerm || "") ||
      (cachedConfig.academicYear || "") !== (schoolConfig.academicYear || "");
    const reopenChanged =
      (cachedConfig.schoolReopenDate || "") !==
      (schoolConfig.schoolReopenDate || "");

    if (termChanged || reopenChanged) {
      fetchHeavyData({ background: true, force: true }).catch((e) =>
        console.error("Error refreshing after term reset", e),
      );
    }
  }, [
    cachedHeavy,
    heavyCacheKey,
    schoolConfig.currentTerm,
    schoolConfig.academicYear,
    schoolConfig.schoolReopenDate,
    fetchHeavyData,
  ]);

  const handleApproveTeacherAttendance = async (record: any) => {
    if (!schoolId || !user?.id) return;
    try {
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const recordId =
        record.id ||
        `${schoolId}_${record.teacherId}_${record.date || todayStr}`;
      await db.approveTeacherAttendance(schoolId, recordId, user.id, {
        teacherId: record.teacherId,
        date: record.date || todayStr,
      });
      showToast(`Approved attendance for ${record.teacherName}.`, {
        type: "success",
      });
      setPendingTeacherAttendance((prev) =>
        prev.filter((item) => item.id !== recordId),
      );
      if ((record.date || todayStr) === todayStr) {
        setTeacherAttendance((prev) => [
          ...prev.filter((item) => item.id !== recordId),
          {
            ...record,
            approvalStatus: "approved",
            approvedBy: user.id,
            date: record.date || todayStr,
            id: recordId,
          },
        ]);
      }
      if (heavyCacheKey) {
        sessionStorage.removeItem(heavyCacheKey);
        localStorage.removeItem(heavyCacheKey);
      }
      scheduleHeavyRefresh();
    } catch (error) {
      console.error("Failed to approve attendance", error);
      showToast("Failed to approve attendance.", { type: "error" });
    }
  };

  const handleApproveAllTeacherAttendance = async () => {
    if (
      !schoolId ||
      !user?.id ||
      !pendingTeacherAttendance.length ||
      isApprovingAllTeacherAttendance
    ) {
      return;
    }

    setIsApprovingAllTeacherAttendance(true);
    try {
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const recordsToApprove = pendingTeacherAttendance.map((record) => {
        const resolvedId =
          record.id ||
          `${schoolId}_${record.teacherId}_${record.date || todayStr}`;
        return {
          ...record,
          id: resolvedId,
          date: record.date || todayStr,
        };
      });

      await db.approveTeacherAttendanceBulk(
        schoolId,
        recordsToApprove.map((record) => ({
          recordId: record.id,
          teacherId: record.teacherId,
          date: record.date,
        })),
        user.id,
      );

      const approvedIds = new Set(recordsToApprove.map((record) => record.id));
      const approvedTodayRecords = recordsToApprove
        .filter((record) => record.date === todayStr)
        .map((record) => ({
          ...record,
          approvalStatus: "approved",
          approvedBy: user.id,
        }));

      setPendingTeacherAttendance((prev) =>
        prev.filter((item) => !approvedIds.has(item.id)),
      );
      if (approvedTodayRecords.length > 0) {
        setTeacherAttendance((prev) => {
          const approvedTodayIds = new Set(
            approvedTodayRecords.map((record) => record.id),
          );
          return [
            ...prev.filter((item) => !approvedTodayIds.has(item.id)),
            ...approvedTodayRecords,
          ];
        });
      }

      if (heavyCacheKey) {
        sessionStorage.removeItem(heavyCacheKey);
        localStorage.removeItem(heavyCacheKey);
      }
      showToast(
        `Approved ${recordsToApprove.length} teacher attendance record${recordsToApprove.length === 1 ? "" : "s"}.`,
        { type: "success" },
      );
      scheduleHeavyRefresh();
    } catch (error) {
      console.error("Failed to approve all teacher attendance", error);
      showToast("Failed to approve all teacher attendance.", {
        type: "error",
      });
    } finally {
      setIsApprovingAllTeacherAttendance(false);
    }
  };

  const handleRejectTeacherAttendance = async (record: any) => {
    if (!schoolId || !user?.id) return;
    try {
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const recordId =
        record.id ||
        `${schoolId}_${record.teacherId}_${record.date || todayStr}`;
      await db.rejectTeacherAttendance(schoolId, recordId, user.id, {
        teacherId: record.teacherId,
        date: record.date || todayStr,
      });
      showToast(`Rejected attendance for ${record.teacherName}.`, {
        type: "success",
      });
      setPendingTeacherAttendance((prev) =>
        prev.filter((item) => item.id !== recordId),
      );
      if ((record.date || todayStr) === todayStr) {
        setTeacherAttendance((prev) => [
          ...prev.filter((item) => item.id !== recordId),
          {
            ...record,
            approvalStatus: "rejected",
            status: "absent",
            approvedBy: user.id,
            date: record.date || todayStr,
            id: recordId,
          },
        ]);
      }
      if (heavyCacheKey) {
        sessionStorage.removeItem(heavyCacheKey);
        localStorage.removeItem(heavyCacheKey);
      }
      scheduleHeavyRefresh();
    } catch (error) {
      console.error("Failed to reject attendance", error);
      showToast("Failed to reject attendance.", { type: "error" });
    }
  };

  const refreshDashboard = useCallback(async () => {
    if (!schoolId) return;
    setIsRefreshing(true);
    await Promise.all([
      fetchSummary({ background: true }),
      fetchHeavyData({ background: true }),
    ]);
    setIsRefreshing(false);
  }, [fetchSummary, fetchHeavyData, schoolId]);

  // Lightweight stats fetch used by the live updater
  const fetchStats = async () => {
    try {
      if (!schoolId) return;
      const dashboardStats = await db.getDashboardStats(schoolId);
      startTransition(() => {
        setStats((prev) => ({
          ...prev,
          students: dashboardStats.studentsCount,
          teachers: dashboardStats.teachersCount,
          classes: CLASSES_LIST.length,
          maleStudents: dashboardStats.gender.male,
          femaleStudents: dashboardStats.gender.female,
          classAttendance: dashboardStats.classAttendance,
        }));
        setLastUpdated(new Date());
        setInitialDataReady(true);
      });
      if (summaryCacheKey) {
        sessionStorage.setItem(
          summaryCacheKey,
          JSON.stringify({
            students: dashboardStats.studentsCount,
            teachers: dashboardStats.teachersCount,
            classes: CLASSES_LIST.length,
            maleStudents: dashboardStats.gender.male,
            femaleStudents: dashboardStats.gender.female,
            classAttendance: dashboardStats.classAttendance,
            updatedAt: Date.now(),
          }),
        );
        localStorage.removeItem(summaryCacheKey);
      }
    } catch (e) {
      console.error("Failed to fetch live stats", e);
    }
  };

  const fetchPendingTeacherAttendance = useCallback(async () => {
    if (!schoolId) return;
    try {
      const localToday = new Date();
      const today = `${localToday.getFullYear()}-${String(localToday.getMonth() + 1).padStart(2, "0")}-${String(localToday.getDate()).padStart(2, "0")}`;
      const [pendingTeacherAttendance, teachers, config] = await Promise.all([
        db.getAllPendingTeacherAttendance(schoolId),
        db.getUsers(schoolId),
        db.getSchoolConfig(schoolId),
      ]);

      const pendingAttendanceWithDetails = pendingTeacherAttendance.map(
        (record) => {
          const teacher = teachers.find((t: any) => t.id === record.teacherId);
          const resolvedId =
            record.id ||
            `${record.schoolId || schoolId || "unknown"}_${record.teacherId || "unknown"}_${record.date || ""}`;
          return {
            ...record,
            id: resolvedId,
            teacherName: teacher?.fullName || "Unknown",
            teacherClasses:
              teacher?.assignedClassIds
                ?.map(
                  (id: string) => CLASSES_LIST.find((c) => c.id === id)?.name,
                )
                .join(", ") || "Not Assigned",
          };
        },
      ) as any[];

      const pendingWithWindow = pendingAttendanceWithDetails.filter(
        (record) =>
          record.approvalStatus === "pending" &&
          isPendingWithinReopenWindow(
            record.date,
            localToday,
            config.schoolReopenDate,
          ),
      );

      const todayAttendanceWithDetails = pendingAttendanceWithDetails.filter(
        (record) => record.date === today,
      );

      startTransition(() => {
        setPendingTeacherAttendance(pendingWithWindow);
        setTeacherAttendance((prev) => {
          if (!todayAttendanceWithDetails.length) {
            return prev.filter((item) => item.approvalStatus !== "pending");
          }

          const pendingIds = new Set(
            todayAttendanceWithDetails.map((record) => record.id),
          );
          return prev.filter(
            (item) =>
              item.approvalStatus !== "pending" && !pendingIds.has(item.id),
          );
        });
      });
    } catch (error) {
      console.error("Failed to refresh pending teacher attendance", error);
    }
  }, [schoolId]);

  // Compute attendance percentage for a given week (monday -> friday)
  const computeAttendanceForWeek = async (monday: Date, friday: Date) => {
    // For each class, fetch attendance records and compute percent for dates in range
    const results: number[] = [];
    for (const cls of CLASSES_LIST) {
      try {
        if (!schoolId) return null;
        const records = await db.getClassAttendance(schoolId, cls.id);
        const inRange = records.filter((r: any) => {
          const parts = r.date.split("-");
          if (parts.length !== 3) return false;
          const d = new Date(
            parseInt(parts[0]),
            parseInt(parts[1]) - 1,
            parseInt(parts[2]),
          );
          return d >= monday && d <= friday && !r.isHoliday;
        });
        const studentsInClass =
          (await db.getStudents(schoolId, cls.id)).length || 0;
        if (inRange.length > 0 && studentsInClass > 0) {
          const totalPossible = inRange.length * studentsInClass;
          const totalPresent = inRange.reduce(
            (s: number, r: any) => s + (r.presentStudentIds?.length || 0),
            0,
          );
          results.push(Math.round((totalPresent / totalPossible) * 100));
        }
      } catch (e) {
        console.error("Error computing class attendance for", cls.id, e);
      }
    }
    if (results.length === 0) return null;
    return Math.round(results.reduce((a, b) => a + b, 0) / results.length);
  };

  const computeWeekComparison = async () => {
    // determine current attendanceWeek (use attendanceWeek state or today)
    const refDate = attendanceWeek || new Date();
    const { monday } = getWeekRange(refDate);
    const thisMonday = monday;
    const thisFriday = new Date(monday);
    thisFriday.setDate(monday.getDate() + 4);
    const lastMonday = new Date(monday);
    lastMonday.setDate(monday.getDate() - 7);
    const lastFriday = new Date(lastMonday);
    lastFriday.setDate(lastMonday.getDate() + 4);

    const thisPct = await computeAttendanceForWeek(thisMonday, thisFriday);
    const lastPct = await computeAttendanceForWeek(lastMonday, lastFriday);
    setThisWeekAttendance(thisPct);
    setLastWeekAttendance(lastPct);
  };

  useEffect(() => {
    if (schoolLoading || !schoolId) return;

    setLoading(false);

    let hasCachedSummary = false;
    const hasCachedHeavy = Boolean(cachedHeavy);
    if (summaryCacheKey) {
      const cachedSummary =
        sessionStorage.getItem(summaryCacheKey) ||
        localStorage.getItem(summaryCacheKey);
      if (cachedSummary) {
        try {
          const parsed = JSON.parse(cachedSummary);
          hasCachedSummary = true;
          setStats((prev) => ({
            ...prev,
            students: parsed.students ?? prev.students,
            teachers: parsed.teachers ?? prev.teachers,
            classes: parsed.classes ?? prev.classes,
            maleStudents: parsed.maleStudents ?? prev.maleStudents,
            femaleStudents: parsed.femaleStudents ?? prev.femaleStudents,
            classAttendance: parsed.classAttendance ?? prev.classAttendance,
          }));
          setDashboardStatsCache(parsed);
        } catch (e) {
          console.warn("Failed to parse cached dashboard summary", e);
          sessionStorage.removeItem(summaryCacheKey);
          localStorage.removeItem(summaryCacheKey);
        }
      }
    }

    fetchSummary(
      hasCachedSummary || hasCachedHeavy ? { background: true } : undefined,
    ).catch((e) => console.error(e));
    if (!cachedHeavy) {
      fetchHeavyData().catch((e) => console.error(e));
    } else {
      fetchHeavyData({ background: true }).catch((e) => console.error(e));
      fetchPendingTeacherAttendance().catch((e) =>
        console.error("Error refreshing pending attendance", e),
      );
    }
  }, [
    schoolLoading,
    schoolId,
    fetchSummary,
    fetchHeavyData,
    summaryCacheKey,
    cachedHeavy,
  ]);

  useEffect(() => {
    if (!schoolId) return;
    computeWeekComparison().catch((e) =>
      console.error("Error computing week comparison", e),
    );
  }, [schoolId, attendanceWeek]);

  // Real-time listeners: refresh stats when attendance, assessments, or config change
  useEffect(() => {
    if (!schoolId) return;
    const attendanceRef = query(
      collection(firestore, "attendance"),
      where("schoolId", "==", schoolId),
    );
    const assessmentsRef = query(
      collection(firestore, "assessments"),
      where("schoolId", "==", schoolId),
    );
    const teacherAttendanceRef = query(
      collection(firestore, "teacher_attendance"),
      where("schoolId", "==", schoolId),
    );
    const studentsRef = query(
      collection(firestore, "students"),
      where("schoolId", "==", schoolId),
    );
    const configRef = doc(firestore, "settings", schoolId);
    const unsubAttendance = onSnapshot(attendanceRef, () => {
      // Keep this lightweight — update class attendance and counters
      fetchStats().catch((e) =>
        console.error("Error refreshing stats on attendance change", e),
      );
      computeWeekComparison().catch((e) =>
        console.error("Error refreshing week comparison", e),
      );
    });
    const unsubAssessments = onSnapshot(assessmentsRef, () => {
      // Refresh summary stats immediately and throttle heavier academic widgets
      fetchStats().catch((e) =>
        console.error("Error refreshing stats on assessments change", e),
      );
      scheduleHeavyRefresh();
    });
    const unsubTeacherAttendance = onSnapshot(teacherAttendanceRef, () => {
      fetchStats().catch((e) =>
        console.error("Error refreshing stats on teacher attendance change", e),
      );
      fetchPendingTeacherAttendance().catch((e) =>
        console.error("Error refreshing pending attendance", e),
      );
      scheduleHeavyRefresh();
    });
    const unsubStudents = onSnapshot(studentsRef, () => {
      fetchStats().catch((e) =>
        console.error("Error refreshing stats on student change", e),
      );
      scheduleHeavyRefresh();
    });
    const unsubConfig = onSnapshot(configRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as any;
        setSchoolConfig((prev) => ({
          ...prev,
          academicYear: data.academicYear || ACADEMIC_YEAR,
          currentTerm: data.currentTerm || `Term ${CURRENT_TERM}`,
          schoolReopenDate: data.schoolReopenDate || "",
          vacationDate: data.vacationDate || "",
          nextTermBegins: data.nextTermBegins || "",
          holidayDates: data.holidayDates || [],
        }));
      }
    });
    return () => {
      unsubAttendance();
      unsubAssessments();
      unsubStudents();
      unsubConfig();
      unsubTeacherAttendance();
    };
  }, [schoolId, attendanceWeek]);

  // Real-time polling effect
  useEffect(() => {
    if (!realTimeEnabled) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }

    // Fetch immediately and then poll
    fetchStats();
    pollRef.current = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchStats();
        fetchPendingTeacherAttendance().catch((e) =>
          console.error("Error refreshing pending attendance", e),
        );
      }
    }, STATS_POLL_INTERVAL_MS);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [realTimeEnabled, fetchPendingTeacherAttendance, schoolId]);

  useEffect(() => {
    return () => {
      if (heavyRefreshTimerRef.current) {
        clearTimeout(heavyRefreshTimerRef.current);
        heavyRefreshTimerRef.current = null;
      }
    };
  }, []);

  // Initialize attendance week based on school re-open date (runs AFTER config loads)
  useEffect(() => {
    if (schoolConfig.schoolReopenDate) {
      const parts = schoolConfig.schoolReopenDate.split("-");
      const reopenDate =
        parts.length === 3
          ? new Date(
              parseInt(parts[0]),
              parseInt(parts[1]) - 1,
              parseInt(parts[2]),
            )
          : new Date(schoolConfig.schoolReopenDate);
      const today = new Date();

      // If school hasn't reopened yet, set attendance week to the Monday of the re-open week
      if (reopenDate > today) {
        setAttendanceWeek(getWeekRange(reopenDate).monday);
        return;
      }
    }

    // If no re-open date set or school already reopened, default to current week's Monday
    setAttendanceWeek(getWeekRange(new Date()).monday);
  }, [schoolConfig.schoolReopenDate]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setOpenMenuId(null);
    if (openMenuId) {
      window.addEventListener("click", handleClickOutside);
    }
    return () => window.removeEventListener("click", handleClickOutside);
  }, [openMenuId]);

  const handleMenuClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setOpenMenuId(openMenuId === id ? null : id);
  };

  // --- Action Handlers ---

  const handleViewDetails = async (student: Student) => {
    setOpenMenuId(null);
    setViewStudent(student);
    setPerformanceData(null);
    try {
      const data = await db.getStudentPerformance(
        schoolId,
        student.id,
        student.classId,
      );
      setPerformanceData(data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleEditStudent = (student: Student) => {
    setOpenMenuId(null);
    setEditingStudent(student);
    setEditFormData({ ...student });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent || !editFormData.name) return;

    try {
      const updated = { ...editingStudent, ...editFormData } as Student;
      await db.updateStudent(updated);

      // Refresh Data
      refreshDashboard();
      setEditingStudent(null);
    } catch (e) {
      showToast("Failed to update student", { type: "error" });
    }
  };

  const fetchAndViewStudent = async (id: string) => {
    setSelectedGrade(null);
    try {
      if (!schoolId) return;
      const students = await db.getStudents(schoolId);
      const s = students.find((st: any) => st.id === id);
      if (s) {
        handleViewDetails(s);
      } else {
        showToast("Student not found", { type: "error" });
      }
    } catch (e) {
      console.error(e);
      showToast("Failed to fetch student", { type: "error" });
    }
  };

  // Week Navigation Helpers
  const getWeekRange = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    // Calculate Monday (1st day of week): if Sunday (0), go back 6 days; otherwise go back (day-1) days
    const monday = new Date(d);
    monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));

    // For school schedule use weekdays only: calculate Friday (5th day)
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);

    return { monday, friday };
  };

  const getRelativeDayLabel = (dateStr?: string) => {
    if (!dateStr) return "";
    const date = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(date.getTime())) return "";
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.round(
      (date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (diffDays === 0) return "Today";
    if (diffDays === -1) return "Yesterday";
    if (diffDays === 1) return "Tomorrow";
    return "";
  };

  const getEffectiveCurrentWeekStart = () => {
    // If school re-open date is set and is in the future, use it as reference
    if (schoolConfig.schoolReopenDate) {
      const parts = schoolConfig.schoolReopenDate.split("-");
      const reopenDate =
        parts.length === 3
          ? new Date(
              parseInt(parts[0]),
              parseInt(parts[1]) - 1,
              parseInt(parts[2]),
            )
          : new Date(schoolConfig.schoolReopenDate);
      const today = new Date();
      if (reopenDate > today) {
        // School hasn't reopened yet, return the week of re-open date
        return getWeekRange(reopenDate).monday;
      }
    }
    // Otherwise, use today's week
    return getWeekRange(new Date()).monday;
  };

  const goToPreviousWeek = () => {
    if (attendanceWeek === null) return;

    const prevWeek = new Date(attendanceWeek);
    prevWeek.setDate(prevWeek.getDate() - 7);

    // Don't allow going before school reopen date
    if (schoolConfig.schoolReopenDate) {
      const parts = schoolConfig.schoolReopenDate.split("-");
      const reopenDate =
        parts.length === 3
          ? new Date(
              parseInt(parts[0]),
              parseInt(parts[1]) - 1,
              parseInt(parts[2]),
            )
          : new Date(schoolConfig.schoolReopenDate);
      const reopenWeek = getWeekRange(reopenDate).monday;
      if (prevWeek < reopenWeek) {
        showToast("Cannot view weeks before school re-opens", { type: "info" });
        return;
      }
    }
    setAttendanceWeek(prevWeek);
  };

  const goToNextWeek = () => {
    if (attendanceWeek === null) return;

    const nextWeek = new Date(attendanceWeek);
    nextWeek.setDate(nextWeek.getDate() + 7);
    setAttendanceWeek(nextWeek);
  };

  const goToCurrentWeek = () => {
    if (schoolConfig.schoolReopenDate) {
      const parts = schoolConfig.schoolReopenDate.split("-");
      const reopenDate =
        parts.length === 3
          ? new Date(
              parseInt(parts[0]),
              parseInt(parts[1]) - 1,
              parseInt(parts[2]),
            )
          : new Date(schoolConfig.schoolReopenDate);
      const today = new Date();
      if (reopenDate > today) {
        // School hasn't reopened yet, go to the Monday of the reopen week
        setAttendanceWeek(getWeekRange(reopenDate).monday);
        return;
      }
    }
    setAttendanceWeek(getWeekRange(new Date()).monday);
  };

  // --- Components ---

  const StatCard = ({
    title,
    value,
    subtext,
    icon: Icon,
    colorClass,
    iconColorClass,
  }: any) => (
    <div
      className={`relative overflow-hidden ${DASHBOARD_PANEL} min-h-[168px] p-6 transition hover:-translate-y-0.5 hover:shadow-[0_22px_48px_-34px_rgba(15,23,42,0.26)]`}
    >
      <div
        className={`pointer-events-none absolute inset-0 opacity-90 ${colorClass}`}
      />
      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className={DASHBOARD_SECTION_LABEL}>{title}</p>
            <h3 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
              {value}
            </h3>
            {subtext && (
              <p className="mt-2 max-w-[18rem] text-sm text-slate-500">
                {subtext}
              </p>
            )}
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/80 bg-white/86 shadow-sm">
            <Icon size={22} className={iconColorClass} />
          </div>
        </div>
        <div className="mt-5 inline-flex w-fit items-center rounded-full border border-white/75 bg-white/80 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500 shadow-sm">
          Dashboard signal
        </div>
      </div>
      <div
        className={`pointer-events-none absolute -right-8 -top-6 opacity-[0.08] ${iconColorClass}`}
      >
        <Icon size={128} />
      </div>
    </div>
  );

  const KPICard = ({ title, value, suffix, delta, deltaPositive }: any) => (
    <div
      className={`min-w-0 overflow-hidden rounded-[24px] border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        deltaPositive
          ? "border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-cyan-50"
          : "border-rose-200/80 bg-gradient-to-br from-rose-50 via-white to-orange-50"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className={DASHBOARD_SECTION_LABEL}>{title}</p>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-slate-900">
              {value}
            </span>
            {suffix && <span className="text-sm text-slate-500">{suffix}</span>}
          </div>
        </div>
        <div
          className={`ml-auto inline-flex max-w-full shrink break-words rounded-full px-3 py-1 text-right text-[10px] font-semibold uppercase leading-tight tracking-[0.14em] whitespace-normal sm:text-[11px] ${
            deltaPositive
              ? "bg-emerald-100 text-emerald-700"
              : "bg-rose-100 text-rose-700"
          }`}
        >
          {delta ?? "Stable"}
        </div>
      </div>
      <div className="mt-5 h-2 rounded-full bg-white/80">
        <div
          className={`h-full rounded-full ${
            deltaPositive
              ? "bg-gradient-to-r from-emerald-500 via-cyan-500 to-sky-500"
              : "bg-gradient-to-r from-rose-500 via-orange-500 to-amber-500"
          }`}
          style={{
            width: delta ? (deltaPositive ? "82%" : "58%") : "72%",
          }}
        />
      </div>
    </div>
  );

  const KPIRowContainer = () => (
    <div className={`relative overflow-hidden ${DASHBOARD_PANEL} p-5 sm:p-6`}>
      <div className={DASHBOARD_SECTION_OVERLAY} />
      <div className="relative">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className={DASHBOARD_SECTION_LABEL}>Daily Pulse</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">
              Live KPI Snapshot
            </h3>
          </div>
          <div className={DASHBOARD_INFO_PILL}>Responsive metrics</div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <KPICard
            title="Students Enrolled"
            value={<AnimatedMetricValue value={stats.students} />}
            suffix="total"
            delta="Live total"
            deltaPositive={true}
          />
          <KPICard
            title="Attendance Now"
            value={
              <AnimatedMetricValue
                value={currentAttendanceAverage}
                format={(value) => `${value}%`}
              />
            }
            suffix={null}
            delta={
              thisWeekAttendance !== null && lastWeekAttendance !== null
                ? `${thisWeekAttendance - lastWeekAttendance}% vs last week`
                : "No comparison"
            }
            deltaPositive={
              thisWeekAttendance !== null && lastWeekAttendance !== null
                ? thisWeekAttendance - lastWeekAttendance >= 0
                : true
            }
          />
          <KPICard
            title="Avg Grade"
            value={
              <AnimatedMetricValue
                value={overallGradeAverage}
                format={(value) => `${value}%`}
              />
            }
            suffix={null}
            delta="Academic pulse"
            deltaPositive={true}
          />
        </div>
      </div>
    </div>
  );

  const StudentEnrollCard = () => (
    <div className="relative overflow-hidden rounded-[28px] border border-amber-200/80 bg-[linear-gradient(145deg,rgba(255,251,235,0.96),rgba(255,255,255,0.94),rgba(255,237,213,0.92))] p-5 sm:p-6 shadow-[0_18px_42px_-30px_rgba(217,119,6,0.22)]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.28),transparent_50%)]" />
      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-start justify-between gap-4 min-w-0">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-700">
              Students Enrolled
            </p>
            <h3 className="mt-3 text-3xl font-extrabold tracking-tight text-amber-950 sm:text-4xl">
              {stats.students}
            </h3>
            <p className="mt-2 text-sm text-amber-800/85">
              {stats.classes} classes / {stats.teachers} teachers actively
              shaping the school day.
            </p>
          </div>
          <div className="flex h-14 w-14 items-center justify-center rounded-[20px] border border-white/75 bg-white/90 shadow-sm">
            <GraduationCap className="text-amber-600" size={28} />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-end xl:grid-cols-[auto_auto_1fr]">
          <div className="rounded-[22px] border border-white/80 bg-white/82 px-4 py-3 text-center shadow-sm">
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
              Female
            </div>
            <div className="mt-2 text-xl font-bold text-[#0B4A82]">
              {stats.femaleStudents}
            </div>
          </div>
          <div className="rounded-[22px] border border-white/80 bg-white/82 px-4 py-3 text-center shadow-sm">
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
              Male
            </div>
            <div className="mt-2 text-xl font-bold text-amber-600">
              {stats.maleStudents}
            </div>
          </div>

          <div className="min-w-0 sm:col-span-2 xl:col-span-1">
            <div className="rounded-[22px] border border-white/80 bg-white/82 px-4 py-3 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Class activity
                </span>
                <span className="hidden text-[11px] text-slate-500 2xl:inline">
                  Top attendance slices
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 xl:grid-cols-8">
                {stats.classAttendance.slice(0, 8).map((c) => (
                  <div key={c.id} className="min-w-0">
                    <div
                      className="w-full rounded-t-[8px]"
                      title={`${c.className}: ${c.percentage}%`}
                      style={{
                        background:
                          c.percentage >= 80
                            ? "linear-gradient(180deg,#10b981,#059669)"
                            : c.percentage < 50
                              ? "linear-gradient(180deg,#f97316,#ef4444)"
                              : "linear-gradient(180deg,#facc15,#f59e0b)",
                        height: `${Math.max(12, Math.round(c.percentage / 2.1))}px`,
                      }}
                    />
                    <div className="mt-1 truncate text-center text-[9px] text-slate-500">
                      {c.className
                        .replace("Creche", "Cr")
                        .replace("Primary ", "P")
                        .replace("Class ", "P")
                        .replace("Nursery ", "N")}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <div className={DASHBOARD_INFO_PILL}>
            Updated{" "}
            <RelativeTimeText timestamp={lastUpdated} fallback="—" />
          </div>
          <div className="hidden sm:block text-[11px] uppercase tracking-[0.18em] text-amber-700/80">
            Modern / responsive / structured
          </div>
        </div>
      </div>
    </div>
  );

  const TeacherStaffCard = () => {
    const avgStudentsPerTeacher =
      stats.teachers > 0 ? Math.round(stats.students / stats.teachers) : "—";
    return (
      <div className="relative overflow-hidden rounded-[28px] border border-sky-200/80 bg-[linear-gradient(145deg,rgba(239,246,255,0.96),rgba(255,255,255,0.94),rgba(224,242,254,0.92))] p-6 shadow-[0_18px_42px_-30px_rgba(14,116,144,0.18)]">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.28),transparent_50%)]" />
        <div className="relative flex h-full flex-col justify-between">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700">
                Teachers and Staff
              </p>
              <h3 className="mt-3 text-4xl font-extrabold tracking-tight text-sky-950">
                {stats.teachers}
              </h3>
              <p className="mt-2 text-sm text-sky-800/85">
                Supporting learning across {stats.classes} classes.
              </p>
            </div>
            <div className="flex h-14 w-14 items-center justify-center rounded-[20px] border border-white/75 bg-white/90 shadow-sm">
              <Users className="text-sky-600" size={28} />
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-[22px] border border-white/80 bg-white/84 px-4 py-3 shadow-sm">
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                Avg Students / Teacher
              </div>
              <div className="mt-2 text-2xl font-bold text-sky-900">
                {avgStudentsPerTeacher}
              </div>
            </div>
            <div className="rounded-[22px] border border-white/80 bg-white/84 px-4 py-3 shadow-sm">
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                Classes Covered
              </div>
              <div className="mt-2 text-2xl font-bold text-sky-900">
                {stats.classes}
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div className={DASHBOARD_INFO_PILL}>
              Updated{" "}
              <RelativeTimeText timestamp={lastUpdated} fallback="—" />
            </div>
            {hasFeature("teacher_management") && (
              <Link to="/admin/teachers" className={DASHBOARD_BUTTON_SECONDARY}>
                <Users size={15} />
                Manage Staff
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  };

  const GenderDonut = () => {
    const totalStudents = stats.maleStudents + stats.femaleStudents;
    const safeTotal = totalStudents || 1;
    const femalePct =
      totalStudents > 0
        ? Math.round((stats.femaleStudents / safeTotal) * 100)
        : 0;
    const malePct = totalStudents > 0 ? 100 - femalePct : 0;
    const chartSize = 220;
    const center = chartSize / 2;
    const radius = 82;
    const innerRadius = 48;

    const demographics = [
      {
        key: "female",
        label: "Female",
        count: stats.femaleStudents,
        percentage: femalePct,
        gradientId: "gender-female-gradient",
        colors: ["#0B4A82", "#38BDF8"],
        textClass: "text-[#0B4A82]",
        accentClass:
          "bg-[linear-gradient(135deg,rgba(11,74,130,0.14),rgba(56,189,248,0.2))]",
        barClass: "bg-[linear-gradient(90deg,#0B4A82,#38BDF8)]",
      },
      {
        key: "male",
        label: "Male",
        count: stats.maleStudents,
        percentage: malePct,
        gradientId: "gender-male-gradient",
        colors: ["#F59E0B", "#F97316"],
        textClass: "text-amber-600",
        accentClass:
          "bg-[linear-gradient(135deg,rgba(245,158,11,0.16),rgba(249,115,22,0.22))]",
        barClass: "bg-[linear-gradient(90deg,#F59E0B,#F97316)]",
      },
    ];

    const populatedSegments = demographics.filter(
      (segment) => segment.count > 0,
    );
    const dominantSegment = [...demographics].sort(
      (a, b) => b.count - a.count,
    )[0];
    const splitSummary =
      totalStudents === 0
        ? "Awaiting data"
        : Math.abs(femalePct - malePct) <= 6
          ? "Balanced mix"
          : `${dominantSegment.label}-leading mix`;

    let currentAngle = -90;
    const chartSegments = populatedSegments.map((segment) => {
      const sliceAngle = (segment.count / safeTotal) * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + sliceAngle;
      currentAngle = endAngle;

      return {
        ...segment,
        path: describePieSlice(center, center, radius, startAngle, endAngle),
      };
    });

    return (
      <div className={`relative self-start ${DASHBOARD_PANEL} p-5 sm:p-6`}>
        <div className={DASHBOARD_SECTION_OVERLAY} />
        <div className="relative flex flex-col">
          <div className="mb-4 flex w-full flex-col items-start gap-2.5 sm:mb-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className={DASHBOARD_SECTION_LABEL}>Student Mix</p>
              <h3 className="mt-1 text-lg font-semibold text-slate-900">
                Demographics
              </h3>
            </div>
            <div className="inline-flex max-w-full self-start rounded-full border border-slate-200/85 bg-white/88 px-3 py-1.5 text-[10px] font-medium leading-tight text-slate-600 shadow-sm">
              <span className="sm:hidden">Overview</span>
              <span className="hidden sm:inline">Balanced view</span>
            </div>
          </div>

          <div className="flex justify-center px-2">
            <div className="relative aspect-square w-full max-w-[182px] min-[380px]:max-w-[196px] min-[420px]:max-w-[216px] sm:max-w-[244px]">
              <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,_rgba(255,255,255,0.96)_0%,rgba(248,250,252,0.92)_58%,rgba(226,232,240,0.3)_100%)] shadow-[0_14px_30px_-22px_rgba(15,23,42,0.22)]" />
              <svg
                viewBox={`0 0 ${chartSize} ${chartSize}`}
                className="relative h-full w-full"
              >
                <defs>
                  <linearGradient
                    id="gender-female-gradient"
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="100%"
                  >
                    <stop offset="0%" stopColor="#0B4A82" />
                    <stop offset="100%" stopColor="#38BDF8" />
                  </linearGradient>
                  <linearGradient
                    id="gender-male-gradient"
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="100%"
                  >
                    <stop offset="0%" stopColor="#F59E0B" />
                    <stop offset="100%" stopColor="#F97316" />
                  </linearGradient>
                  <filter
                    id="gender-pie-shadow"
                    x="-20%"
                    y="-20%"
                    width="140%"
                    height="140%"
                  >
                    <feDropShadow
                      dx="0"
                      dy="12"
                      stdDeviation="14"
                      floodColor="rgba(15,23,42,0.18)"
                    />
                  </filter>
                </defs>

                <circle
                  cx={center}
                  cy={center}
                  r={radius + 8}
                  fill="rgba(255,255,255,0.86)"
                />

                {chartSegments.length === 0 ? (
                  <circle
                    cx={center}
                    cy={center}
                    r={radius}
                    fill="#E2E8F0"
                    stroke="rgba(255,255,255,0.95)"
                    strokeWidth="4"
                  />
                ) : chartSegments.length === 1 ? (
                  <g filter="url(#gender-pie-shadow)">
                    <circle
                      cx={center}
                      cy={center}
                      r={radius}
                      fill={`url(#${chartSegments[0].gradientId})`}
                      stroke="rgba(255,255,255,0.96)"
                      strokeWidth="4"
                    />
                  </g>
                ) : (
                  <g filter="url(#gender-pie-shadow)">
                    {chartSegments.map((segment) => (
                      <path
                        key={segment.key}
                        d={segment.path}
                        fill={`url(#${segment.gradientId})`}
                        stroke="rgba(255,255,255,0.96)"
                        strokeWidth="4"
                        strokeLinejoin="round"
                      />
                    ))}
                  </g>
                )}

                <circle
                  cx={center}
                  cy={center}
                  r={innerRadius}
                  fill="rgba(255,255,255,0.98)"
                  stroke="rgba(226,232,240,0.85)"
                  strokeWidth="2"
                />
              </svg>

              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center leading-none">
                  <span className="block text-[clamp(1.6rem,7vw,2.2rem)] font-bold tracking-tight text-slate-900">
                    {totalStudents}
                  </span>
                  <span className="mt-2 block text-[clamp(0.52rem,1.9vw,0.72rem)] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Students
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex justify-center">
            <div className="max-w-full rounded-full border border-white/85 bg-white/88 px-3 py-2 text-center text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-600 shadow-sm sm:px-4 sm:text-[10px]">
              {splitSummary}
            </div>
          </div>

          <div className="mt-5 flex w-full flex-wrap gap-3">
            {demographics.map((segment) => (
              <div
                key={segment.key}
                className={`min-w-0 basis-full rounded-[22px] border border-white/80 px-4 py-4 shadow-sm min-[460px]:flex-1 min-[460px]:basis-[168px] ${segment.accentClass}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="h-3.5 w-3.5 rounded-full shadow-[0_0_0_4px_rgba(255,255,255,0.7)]"
                      style={{
                        background: `linear-gradient(135deg, ${segment.colors[0]}, ${segment.colors[1]})`,
                      }}
                    />
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                        {segment.label}
                      </p>
                      <p
                        className={`mt-1 text-[1.9rem] font-bold leading-none ${segment.textClass}`}
                      >
                        {segment.percentage}%
                      </p>
                    </div>
                  </div>
                  <div className="rounded-full border border-white/80 bg-white/72 px-2.5 py-1 text-xs font-semibold text-slate-700 sm:px-3 sm:text-sm">
                    {segment.count}
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                  <span>Share of total</span>
                  <span className="font-semibold text-slate-700">
                    {segment.count} students
                  </span>
                </div>
                <div className="mt-3 h-2 rounded-full bg-white/70">
                  <div
                    className={`h-full rounded-full ${segment.barClass}`}
                    style={{ width: `${segment.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const PerformanceSection = () => {
    const totalGrades =
      Object.keys(gradeDistribution).reduce(
        (sum, key) => sum + gradeDistribution[key],
        0,
      ) || 0;

    // Compute average grade score (A=4 .. F=0) and derive a letter
    const weights: Record<string, number> = { A: 4, B: 3, C: 2, D: 1, F: 0 };
    const weightedSum = Object.entries(gradeDistribution).reduce(
      (acc, [g, c]: [string, number]) => {
        const w = weights[g as keyof typeof weights] ?? 0;
        return acc + w * c;
      },
      0,
    );
    const avgScore = totalGrades > 0 ? weightedSum / totalGrades : 0;
    const avgLetter =
      avgScore >= 3.5
        ? "A"
        : avgScore >= 2.5
          ? "B"
          : avgScore >= 1.5
            ? "C"
            : avgScore >= 0.5
              ? "D"
              : "F";

    return (
      <div className="mb-8 grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        {/* Grade Distribution Chart (Enhanced) */}
        <div
          className={`lg:col-span-2 ${DASHBOARD_PANEL} overflow-x-auto p-4 sm:p-6`}
        >
          <div className="mb-4 flex flex-col items-start justify-between gap-3 sm:mb-6 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex min-w-0 flex-wrap items-center gap-4">
              <div className="rounded-2xl border border-cyan-100 bg-cyan-50 p-3 shadow-sm">
                <BarChart2 className="w-6 h-6 text-[#0B4A82]" />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-slate-800">
                  Academic Performance Rate
                </h3>
                <p className="text-xs text-slate-500">
                  {schoolConfig.currentTerm}
                </p>
              </div>
              <div className="grid grid-cols-2 sm:flex sm:ml-6 gap-4 sm:gap-6 sm:hidden">
                <div>
                  <p className="text-xs text-slate-500 uppercase">
                    Graded Students
                  </p>
                  <p className="text-lg sm:text-2xl font-bold text-slate-800">
                    {totalGrades}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase">
                    Average Grade
                  </p>
                  <p className="text-lg sm:text-2xl font-bold text-amber-500">
                    {avgLetter}{" "}
                    <span className="text-xs sm:text-sm text-slate-500">
                      ({avgScore.toFixed(2)})
                    </span>
                  </p>
                </div>
              </div>
              <div className="hidden sm:block ml-6">
                <p className="text-xs text-slate-500 uppercase">
                  Graded Students
                </p>
                <p className="text-2xl font-bold text-slate-800">
                  {totalGrades}
                </p>
              </div>
              <div className="hidden sm:block ml-6">
                <p className="text-xs text-slate-500 uppercase">
                  Average Grade
                </p>
                <p className="text-2xl font-bold text-amber-500">
                  {avgLetter}{" "}
                  <span className="text-sm text-slate-500">
                    ({avgScore.toFixed(2)})
                  </span>
                </p>
              </div>
            </div>
            <button
              onClick={refreshDashboard}
              disabled={isRefreshing}
              className={DASHBOARD_BUTTON_SECONDARY}
              title="Refresh performance data"
            >
              <RefreshCw
                size={14}
                className={`mr-1 ${isRefreshing ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
          </div>

          <div className="space-y-4">
            <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
              {Object.entries(gradeDistribution).map(
                ([grade, count]: [string, number]) => {
                  const percentage =
                    totalGrades > 0
                      ? Math.round((count / totalGrades) * 100)
                      : 0;
                  let barColor = "from-emerald-400 to-emerald-600";
                  if (grade === "B") barColor = "from-[#E6F0FA] to-[#1160A8]";
                  if (grade === "C") barColor = "from-amber-300 to-amber-500";
                  if (grade === "D") barColor = "from-orange-300 to-orange-500";
                  if (grade === "F") barColor = "from-red-400 to-red-600";

                  return (
                    <div key={grade} className="flex items-center gap-4">
                      <div className="w-10 font-bold text-slate-700">
                        {grade}
                      </div>
                      <div className="flex-1">
                        <div className="relative h-4 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`absolute left-0 top-0 h-full rounded-full bg-gradient-to-r ${barColor} transition-all duration-1000`}
                            style={{ width: `${percentage}%` }}
                            title={`${count} students — ${percentage}%`}
                          />
                        </div>
                        <div className="mt-2 flex justify-between text-xs text-slate-500">
                          <span>
                            {count} {count === 1 ? "student" : "students"}
                          </span>
                          <span className="font-semibold text-slate-700">
                            {percentage}%
                          </span>
                        </div>
                      </div>
                      <div className="ml-4">
                        <button
                          onClick={() => setSelectedGrade(grade)}
                          className="text-xs text-[#0B4A82] hover:underline font-medium"
                        >
                          View
                        </button>
                      </div>
                    </div>
                  );
                },
              )}
            </div>

            {/* Legend explaining colors */}
            <div className="mt-4 flex flex-wrap gap-4 items-center">
              <div className="flex items-center gap-2">
                <span
                  className="w-4 h-4 rounded-sm block bg-gradient-to-r from-emerald-400 to-emerald-600"
                  aria-hidden
                ></span>
                <span className="text-xs text-slate-600">A — Excellent</span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="w-4 h-4 rounded-sm block bg-gradient-to-r from-[#E6F0FA] to-[#1160A8]"
                  aria-hidden
                ></span>
                <span className="text-xs text-slate-600">B — Very Good</span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="w-4 h-4 rounded-sm block bg-gradient-to-r from-amber-300 to-amber-500"
                  aria-hidden
                ></span>
                <span className="text-xs text-slate-600">C — Satisfactory</span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="w-4 h-4 rounded-sm block bg-gradient-to-r from-orange-300 to-orange-500"
                  aria-hidden
                ></span>
                <span className="text-xs text-slate-600">
                  D — Needs Support
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="w-4 h-4 rounded-sm block bg-gradient-to-r from-red-400 to-red-600"
                  aria-hidden
                ></span>
                <span className="text-xs text-slate-600">
                  F — Intervention Required
                </span>
              </div>
            </div>
            {totalGrades === 0 && (
              <div className="text-center text-slate-400 py-4 text-sm">
                No academic data available for {schoolConfig.currentTerm}.
              </div>
            )}

            <div className="mt-4 rounded-[22px] border border-slate-100 bg-gradient-to-r from-emerald-50 to-[#E6F0FA] p-4 text-sm text-slate-700 shadow-sm">
              <div className="font-semibold text-slate-800 mb-1">
                What this chart shows
              </div>
              <div className="text-sm">
                Each bar represents the number of students who received that
                grade during the selected term. Percentages are calculated
                against the total number of graded students. Use the counts and
                percentages to identify strengths (high A/B) and areas for
                intervention (high D/F). Hover a bar to see the exact count.
              </div>
            </div>
          </div>
        </div>

        {/* Top Students */}
        <div className={`relative overflow-hidden ${DASHBOARD_PANEL} p-6`}>
          <h3 className="font-bold text-slate-800 mb-4 flex items-center">
            <Trophy className="w-5 h-5 mr-2 text-amber-500" /> Top Performers
          </h3>
          <div className="space-y-4">
            {topStudents.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No data yet.</p>
            ) : (
              topStudents.map((s, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between border-b border-slate-50 pb-2 last:border-0 last:pb-0"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${i === 0 ? "bg-amber-500" : "bg-slate-300"}`}
                    >
                      {i + 1}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        {s.name}
                      </p>
                      <p className="text-xs text-slate-400">{s.class}</p>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-[#0B4A82]">
                    {s.avg}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  };

  const hasHeavyCache = Boolean(cachedHeavy);
  const showSkeletons =
    (summaryLoading || !initialDataReady) &&
    !skipSkeletonsOnRefreshRef.current &&
    !hasHeavyCache;
  const showSummaryLoading = (summaryLoading || isRefreshing) && !hasHeavyCache;
  const showHeavyLoading = (heavyLoading || isRefreshing) && !hasHeavyCache;

  // --- Advanced Visualization Components ---
  const scoreToColor = (v: number) => {
    if (v >= 80) return "bg-emerald-500";
    if (v >= 65) return "bg-red-500";
    if (v >= 50) return "bg-amber-400";
    if (v >= 35) return "bg-orange-400";
    return "bg-red-500";
  };

  const HeatmapComponent = ({
    data,
  }: {
    data: Record<string, Record<string, number>>;
  }) => {
    const classes = Object.keys(data).slice(0, 8);
    const subjects = Array.from(
      new Set(classes.flatMap((c) => Object.keys(data[c] || {}))),
    ).slice(0, 8);
    return (
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
        <h4 className="font-bold text-slate-800 mb-3">
          Class × Subject Heatmap
        </h4>
        <div className="overflow-x-auto">
          <div className="inline-block">
            <div
              className="grid"
              style={{
                gridTemplateColumns: `repeat(${subjects.length + 1}, minmax(80px, 1fr))`,
              }}
            >
              <div className="p-2 font-semibold"></div>
              {subjects.map((s) => (
                <div
                  key={s}
                  className="p-2 text-xs text-slate-500 font-semibold text-center"
                >
                  {s}
                </div>
              ))}
              {classes.map((cls) => (
                <React.Fragment key={cls}>
                  <div className="p-2 font-medium text-sm text-slate-700">
                    {CLASSES_LIST.find((c) => c.id === cls)?.name || cls}
                  </div>
                  {subjects.map((sub) => {
                    const v = data[cls]?.[sub] ?? 0;
                    return (
                      <div
                        key={cls + "-" + sub}
                        className={`p-2 m-1 rounded text-white text-xs flex items-center justify-center ${scoreToColor(v)}`}
                        title={`${sub}: ${v}`}
                      >
                        {v}
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const ComparativeBars = ({
    data,
  }: {
    data: { className: string; avg: number }[];
  }) => (
    <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
      <h4 className="font-bold text-slate-800 mb-3">Class Comparison</h4>
      <div className="space-y-3">
        {data.slice(0, 6).map((d) => (
          <div key={d.className} className="flex items-center gap-3">
            <div className="w-36 text-sm text-slate-600">{d.className}</div>
            <div className="flex-1 h-4 bg-slate-100 rounded overflow-hidden">
              <div
                className={`${scoreToColor(d.avg)} h-full`}
                style={{ width: `${Math.min(100, d.avg)}%` }}
              />
            </div>
            <div className="w-12 text-right text-sm font-semibold text-slate-700">
              {d.avg}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const GradeDistributionPieByClass = ({
    dist,
  }: {
    dist: Record<string, number>;
  }) => {
    const total = Object.values(dist).reduce((a, b) => a + b, 0) || 1;
    // build gradient stops
    const segments = ["A", "B", "C", "D", "F"].map((k, i) => ({
      k,
      v: dist[k] || 0,
    }));
    let start = 0;
    const stops: string[] = [];
    segments.forEach((s) => {
      const pct = Math.round((s.v / total) * 100);
      stops.push(`${s.v ? pct : 0}%`);
    });
    // fallback simple pie using conic-gradient with fixed colors
    const colors = {
      A: "#10b981",
      B: "#3b82f6",
      C: "#f59e0b",
      D: "#fb923c",
      F: "#ef4444",
    };
    let gradient = "";
    let offset = 0;
    segments.forEach((s, idx) => {
      const pct = (s.v / total) * 100;
      const next = offset + pct;
      gradient += `${colors[s.k]} ${offset}% ${next}%, `;
      offset = next;
    });
    gradient = gradient || "#f3f4f6 0% 100%";
    return (
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
        <div
          className="w-28 h-28 rounded-full"
          style={{
            background: `conic-gradient(${gradient})`,
            mask: "radial-gradient(transparent 60%, black 61%)",
            WebkitMask: "radial-gradient(transparent 60%, black 61%)",
          }}
        />
        <div>
          {segments.map((s) => (
            <div key={s.k} className="flex items-center gap-2 text-sm">
              <span
                className="w-3 h-3 rounded-sm"
                style={{ background: colors[s.k] }}
              />
              <span className="text-slate-700 font-medium">{s.k}</span>
              <span className="text-slate-500 ml-2">{s.v}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const Sparkline = ({ points }: { points: number[] }) => {
    const w = 120;
    const h = 28;
    if (!points || points.length === 0)
      return <div className="text-xs text-slate-400">No data</div>;
    const max = Math.max(...points, 1);
    const min = Math.min(...points);
    const norm = points
      .map((p, i) => {
        const x = Math.round((i / (points.length - 1)) * w);
        const y = Math.round(h - ((p - min) / Math.max(1, max - min)) * h);
        return `${x},${y}`;
      })
      .join(" ");
    return (
      <svg width={w} height={h} className="block">
        <polyline fill="none" stroke="#ef4444" strokeWidth={2} points={norm} />
      </svg>
    );
  };

  const ClassSparklines = ({
    sparks,
  }: {
    sparks: Record<string, number[]>;
  }) => (
    <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
      <h4 className="font-bold text-slate-800 mb-3">
        Class Performance Trends
      </h4>
      <div className="space-y-3">
        {Object.entries(sparks)
          .slice(0, 6)
          .map(([cls, pts]) => (
            <div key={cls} className="flex items-center justify-between">
              <div className="text-sm text-slate-700 w-40">
                {CLASSES_LIST.find((c) => c.id === cls)?.name || cls}
              </div>
              <div className="flex-1 flex items-center justify-end gap-4">
                <div className="w-40">
                  <Sparkline points={pts} />
                </div>
                <div className="w-12 text-right font-semibold text-slate-700">
                  {Math.round(
                    pts.reduce((a, b) => a + b, 0) / Math.max(1, pts.length),
                  )}
                  %
                </div>
              </div>
            </div>
          ))}
      </div>
    </div>
  );

  if (error) {
    return (
      <Layout title="Dashboard">
        <div className="flex items-center justify-center h-96 flex-col p-8">
          <AlertOctagon size={48} className="text-red-400 mb-4" />
          <h3 className="text-lg font-bold text-slate-700">
            Unable to load dashboard
          </h3>
          <p className="text-slate-500 text-center max-w-md mb-6">{error}</p>
          <button
            onClick={refreshDashboard}
            className="flex items-center px-4 py-2 bg-red-800 text-white rounded-lg hover:bg-red-900 transition-colors"
          >
            <RefreshCw size={16} className="mr-2" /> Retry
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Dashboard">
      <div className={DASHBOARD_SHELL}>
        <div className={DASHBOARD_ROOT_OVERLAY} />
        <div className="relative min-w-0 space-y-8">
          <div className="grid gap-6 xl:grid-cols-[1.18fr_0.82fr]">
            <div className={DASHBOARD_HERO}>
              <div className={DASHBOARD_HERO_OVERLAY} />
              <div className="relative">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="max-w-3xl">
                    <p className="text-xs uppercase tracking-[0.24em] text-cyan-100/80">
                      School Command Center
                    </p>
                    <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-4xl">
                      Welcome{user?.fullName ? `, ${user.fullName}` : ""}
                    </h1>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-sky-50/82 sm:text-base">
                      Here is what's happening across your school today, from
                      attendance and performance to admissions and live
                      announcements.
                    </p>
                  </div>

                  <div className="rounded-[24px] border border-white/15 bg-white/12 px-4 py-3 text-right shadow-[0_10px_24px_-20px_rgba(15,23,42,0.22)]">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-cyan-100/70">
                      Academic period
                    </div>
                    <div className="mt-2 text-base font-semibold text-white">
                      {schoolConfig.currentTerm || "Current term"}
                    </div>
                    <div className="text-sm text-cyan-100/75">
                      {schoolConfig.academicYear || ACADEMIC_YEAR}
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/18 bg-white/12 px-3 py-1.5 text-xs font-medium text-white/90 shadow-[0_10px_24px_-20px_rgba(15,23,42,0.16)]">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        isRefreshing || heavyLoading
                          ? "bg-amber-300 animate-pulse"
                          : "bg-emerald-300"
                      }`}
                    />
                    {isRefreshing || heavyLoading
                      ? "Refreshing data"
                      : "Data up to date"}
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/18 bg-white/12 px-3 py-1.5 text-xs font-medium text-white/90 shadow-[0_10px_24px_-20px_rgba(15,23,42,0.16)]">
                    {(totalSchoolDays ?? fallbackSchoolDays.days)} school days
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/18 bg-white/12 px-3 py-1.5 text-xs font-medium text-white/90 shadow-[0_10px_24px_-20px_rgba(15,23,42,0.16)]">
                    {(totalSchoolWeeks ?? fallbackSchoolDays.weeks)} teaching
                    weeks
                  </span>
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  {hasFeature("student_management") && (
                    <Link
                      to="/admin/students"
                      className={DASHBOARD_BUTTON_PRIMARY}
                    >
                      <UserPlus size={16} />
                      Add Student
                    </Link>
                  )}
                  {hasFeature("teacher_management") && (
                    <Link
                      to="/admin/teachers"
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/12 px-4 py-2.5 text-sm font-semibold text-white/95 shadow-[0_10px_24px_-20px_rgba(15,23,42,0.16)] transition hover:-translate-y-0.5 hover:bg-white/16"
                    >
                      <Users size={16} />
                      Add Staff
                    </Link>
                  )}
                  {hasFeature("backups") && (
                    <Link
                      to="/admin/backups"
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/12 px-4 py-2.5 text-sm font-semibold text-white/95 shadow-[0_10px_24px_-20px_rgba(15,23,42,0.16)] transition hover:-translate-y-0.5 hover:bg-white/16"
                    >
                      <Shield size={16} />
                      Recovery Center
                    </Link>
                  )}
                </div>
              </div>
            </div>

            <div
              className={`relative overflow-hidden ${DASHBOARD_PANEL} p-5 sm:p-6`}
            >
              <div className={DASHBOARD_SECTION_OVERLAY} />
              <div className="relative">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className={DASHBOARD_SECTION_LABEL}>Live Control</p>
                    <h2 className="mt-1 text-xl font-semibold text-slate-900">
                      Dashboard Status
                    </h2>
                  </div>
                  <button
                    onClick={() => setRealTimeEnabled((v) => !v)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] ${
                      realTimeEnabled
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                    title="Toggle live metrics polling"
                  >
                    {realTimeEnabled ? "Live on" : "Live off"}
                  </button>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-[22px] border border-white/80 bg-white/84 px-4 py-4 shadow-sm">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                      Last update
                    </p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">
                      <RelativeTimeText timestamp={lastUpdated} />
                    </p>
                  </div>
                  <div className="rounded-[22px] border border-white/80 bg-white/84 px-4 py-4 shadow-sm">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                      School days
                    </p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">
                      {totalSchoolDays ?? fallbackSchoolDays.days}
                    </p>
                  </div>
                  <div className="rounded-[22px] border border-white/80 bg-white/84 px-4 py-4 shadow-sm">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                      Total weeks
                    </p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">
                      {totalSchoolWeeks ?? fallbackSchoolDays.weeks}
                    </p>
                  </div>
                  <div className="rounded-[22px] border border-white/80 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 px-4 py-4 shadow-sm">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                      Sync status
                    </p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">
                      {isRefreshing || heavyLoading ? "Refreshing" : "Healthy"}
                    </p>
                  </div>
                </div>

                <div className="mt-5 rounded-[24px] border border-slate-200/80 bg-white/84 px-4 py-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                        Current scope
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {schoolConfig.currentTerm || "Current term"} /{" "}
                        {schoolConfig.academicYear || ACADEMIC_YEAR}
                      </p>
                    </div>
                    <div className={DASHBOARD_INFO_PILL}>
                      <Calendar size={14} />
                      School-wide
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {vacationBanner && (
            <div className="mb-8">
              <div className="relative overflow-hidden rounded-[28px] border border-sky-200/80 bg-gradient-to-r from-sky-50 via-white to-blue-50 p-6 shadow-[0_18px_42px_-30px_rgba(14,165,233,0.2)]">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-[#0B4A82] text-white">
                      <Calendar size={20} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-sky-700">
                        School Vacation
                      </p>
                      <h3 className="text-xl font-bold text-slate-900 mt-1">
                        Your school is currently on vacation
                      </h3>
                      <p className="text-sm text-slate-600 mt-2">
                        School will reopen on{" "}
                        <span className="font-semibold text-slate-800">
                          {vacationBanner.nextTermBegins.toLocaleDateString()}
                        </span>
                        .
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="px-4 py-2 rounded-full text-sm font-semibold bg-[#0B4A82] text-white">
                      Vacation mode
                    </div>
                    <div className="px-4 py-2 rounded-2xl bg-white border border-slate-200 text-slate-700">
                      <div className="text-xs uppercase text-slate-400">
                        Next term
                      </div>
                      <div className="text-sm font-bold">
                        {vacationBanner.nextTermBegins.toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {subscriptionPlanEndsAt && (
            <div className="mb-8" style={DASHBOARD_DEFERRED_RENDER_STYLE}>
              <div
                className={`relative overflow-hidden ${DASHBOARD_PANEL_TINT} p-4 sm:p-6`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center bg-[#0B4A82] text-white">
                      <Calendar size={20} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                        Subscription Countdown
                      </p>
                      <h3 className="text-xl font-bold text-slate-900 mt-1">
                        Renewal due soon
                      </h3>
                      <p className="text-sm text-slate-600 mt-2">
                        Your subscription ends on{" "}
                        <span className="font-semibold text-slate-800">
                          {subscriptionPlanEndsAt.toLocaleDateString()}
                        </span>
                        . Renew before the end date to avoid interruption.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-3">
                    <div className="px-4 py-2 rounded-full text-sm font-semibold bg-[#0B4A82] text-white">
                      Subscription ends
                    </div>
                    <div className="px-4 py-2 rounded-2xl bg-slate-50 border border-slate-200 text-slate-700">
                      <div className="text-xs uppercase text-slate-400">
                        Countdown
                      </div>
                      <div className="text-base sm:text-lg font-bold">
                        <LiveCountdownText target={subscriptionPlanEndsAt} />
                      </div>
                    </div>
                    {hasFeature("billing") && (
                      <Link
                        to="/admin/billing"
                        className={DASHBOARD_BUTTON_PRIMARY}
                      >
                        <Wallet size={16} />
                        Renew Now
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {trialPlanEndsAt && (
            <div className="mb-8" style={DASHBOARD_DEFERRED_RENDER_STYLE}>
              <div className="relative overflow-hidden rounded-[28px] border border-emerald-200/80 bg-gradient-to-r from-emerald-50 via-white to-cyan-50 p-6 shadow-[0_18px_42px_-30px_rgba(16,185,129,0.2)]">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-emerald-500 text-white">
                      <Timer size={20} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                        Trial Countdown
                      </p>
                      <h3 className="text-xl font-bold text-slate-900 mt-1">
                        Trial access ends soon
                      </h3>
                      <p className="text-sm text-slate-600 mt-2">
                        Your trial ends on{" "}
                        <span className="font-semibold text-slate-800">
                          {trialPlanEndsAt.toLocaleDateString()}
                        </span>
                        . Make the most of your evaluation period.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="px-4 py-2 rounded-full text-sm font-semibold bg-emerald-500 text-white">
                      Trial ends
                    </div>
                    <div className="px-4 py-2 rounded-2xl bg-white border border-slate-200 text-slate-700">
                      <div className="text-xs uppercase text-slate-400">
                        Countdown
                      </div>
                      <div className="text-lg font-bold">
                        <LiveCountdownText target={trialPlanEndsAt} />
                      </div>
                    </div>
                    {hasFeature("billing") && (
                      <Link
                        to="/admin/billing"
                        className={DASHBOARD_BUTTON_PRIMARY}
                      >
                        <Wallet size={16} />
                        Upgrade Plan
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {gracePeriod && (
            <div className="mb-8" style={DASHBOARD_DEFERRED_RENDER_STYLE}>
              <div className="relative overflow-hidden rounded-[28px] border border-amber-200/80 bg-gradient-to-r from-amber-50 via-white to-orange-50 p-6 shadow-[0_18px_42px_-30px_rgba(245,158,11,0.2)]">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-amber-500 text-white">
                      <Timer size={20} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                        Subscription Reminder
                      </p>
                      <h3 className="text-xl font-bold text-slate-900 mt-1">
                        One-week grace period is active
                      </h3>
                      <p className="text-sm text-slate-600 mt-2">
                        Your subscription has ended. You have a one-week window
                        to renew before access is paused.
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Grace ends on{" "}
                        {gracePeriod.graceEndsAt.toLocaleDateString()}.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="px-4 py-2 rounded-full text-sm font-semibold bg-amber-500 text-white">
                      Grace period
                    </div>
                    <div className="px-4 py-2 rounded-2xl bg-white border border-slate-200 text-slate-700">
                      <div className="text-xs uppercase text-slate-400">
                        Countdown
                      </div>
                      <div className="text-lg font-bold">
                        <LiveCountdownText target={gracePeriod.graceEndsAt} />
                      </div>
                    </div>
                    {hasFeature("billing") && (
                      <Link
                        to="/admin/billing"
                        className={DASHBOARD_BUTTON_PRIMARY}
                      >
                        <Wallet size={16} />
                        Go to Billing
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="mb-8">
            <div
              className={`relative overflow-hidden ${DASHBOARD_PANEL_TINT} p-6`}
            >
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-[#0B4A82] text-white">
                    <Bell size={20} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                      Customer Support
                    </p>
                    <h3 className="text-xl font-bold text-slate-900 mt-1">
                      Need assistance? Reach us anytime
                    </h3>
                    <p className="text-sm text-slate-600 mt-2">
                      WhatsApp or call support:{" "}
                      <span className="font-semibold text-slate-800">
                        0201008784
                      </span>
                      .
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <a
                    href="https://wa.me/233201008784"
                    className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(135deg,#059669_0%,#10b981_100%)] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_14px_30px_-22px_rgba(5,150,105,0.34)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_34px_-20px_rgba(5,150,105,0.28)]"
                    target="_blank"
                    rel="noreferrer"
                  >
                    WhatsApp
                  </a>
                  <a
                    href="tel:+233201008784"
                    className={DASHBOARD_BUTTON_PRIMARY}
                  >
                    Call Support
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Missed Attendance Alerts */}
          {missedAttendanceAlerts.length > 0 && (
            <div className="mb-8" style={DASHBOARD_DEFERRED_RENDER_STYLE}>
              <div className="bg-gradient-to-r from-red-50 to-orange-50 border border-red-200 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-red-100 rounded-full">
                    <AlertOctagon className="text-red-600" size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-red-900 text-lg">
                      Attendance Alerts
                    </h3>
                    <p className="text-red-700 text-sm">
                      {missedAttendanceAlerts.length} teacher
                      {missedAttendanceAlerts.length !== 1 ? "s" : ""} need to
                      mark attendance for school days since reopening.
                    </p>
                  </div>
                </div>
                <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
                  {visibleMissedAttendanceAlerts.map((alert: any) => (
                    <div
                      key={alert.teacherId}
                      className="bg-white p-4 rounded-lg border border-red-100 shadow-sm"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                            <span className="text-sm font-bold text-red-600">
                              {alert.teacherName.charAt(0)}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-800">
                              {alert.teacherName}
                            </p>
                            <p className="text-sm text-slate-500">
                              {alert.classes}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {alert.dates.map((date: string) => (
                                <span
                                  key={date}
                                  className="text-[11px] font-semibold text-red-700 bg-red-50 border border-red-100 px-2 py-0.5 rounded-full"
                                >
                                  {(() => {
                                    const parts = date.split("-");
                                    if (parts.length === 3) {
                                      return `${parts[1]}/${parts[2]}/${parts[0]}`;
                                    }
                                    return date;
                                  })()}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="w-full border-t border-slate-100 pt-2 text-left sm:w-auto sm:border-t-0 sm:pt-0 sm:pl-2 sm:text-right shrink-0">
                          <p className="text-sm font-medium text-red-700">
                            Missed: {alert.dates.length} day
                            {alert.dates.length !== 1 ? "s" : ""}
                          </p>
                          <p className="text-xs text-slate-400">
                            Please follow up
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {missedAttendanceAlerts.length >
                  visibleMissedAttendanceAlerts.length && (
                  <p className="mt-3 text-xs font-medium text-red-700">
                    Showing {visibleMissedAttendanceAlerts.length} of{" "}
                    {missedAttendanceAlerts.length} alerts. Open the attendance
                    tools for the full list.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Missed Student Attendance Alerts */}
          {missedStudentAttendanceAlerts.length > 0 && (
            <div className="mb-8" style={DASHBOARD_DEFERRED_RENDER_STYLE}>
              <div className="bg-gradient-to-r from-blue-50 to-sky-50 border border-blue-200 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-blue-100 rounded-full">
                    <AlertOctagon className="text-blue-600" size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-blue-900 text-lg">
                      Missed Student Attendance
                    </h3>
                    <p className="text-blue-700 text-sm">
                      {missedStudentAttendanceAlerts.length} teacher
                      {missedStudentAttendanceAlerts.length !== 1
                        ? "s"
                        : ""}{" "}
                      still need to mark student attendance since reopening.
                    </p>
                  </div>
                </div>
                <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
                  {visibleMissedStudentAttendanceAlerts.map((alert: any) => (
                    <div
                      key={alert.teacherId}
                      className="bg-white p-4 rounded-lg border border-blue-100 shadow-sm"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                            <span className="text-sm font-bold text-blue-700">
                              {alert.teacherName.charAt(0)}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-800">
                              {alert.teacherName}
                            </p>
                            <p className="text-sm text-slate-500">
                              {alert.className}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {alert.dates.map((date: string) => (
                                <span
                                  key={date}
                                  className="text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full"
                                >
                                  {(() => {
                                    const parts = date.split("-");
                                    if (parts.length === 3) {
                                      return `${parts[1]}/${parts[2]}/${parts[0]}`;
                                    }
                                    return date;
                                  })()}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="w-full border-t border-slate-100 pt-2 text-left sm:w-auto sm:border-t-0 sm:pt-0 sm:pl-2 sm:text-right shrink-0">
                          <p className="text-sm font-medium text-blue-700">
                            Missed: {alert.dates.length} day
                            {alert.dates.length !== 1 ? "s" : ""}
                          </p>
                          <p className="text-xs text-slate-400">
                            Action may be required
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {missedStudentAttendanceAlerts.length >
                  visibleMissedStudentAttendanceAlerts.length && (
                  <p className="mt-3 text-xs font-medium text-blue-700">
                    Showing {visibleMissedStudentAttendanceAlerts.length} of{" "}
                    {missedStudentAttendanceAlerts.length} alerts. Use the
                    attendance pages to review everything.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Stats Grid */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">
              Overview
            </h2>
            {showSummaryLoading && <SectionLoadingBadge />}
          </div>
          <div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8"
            style={DASHBOARD_DEFERRED_RENDER_STYLE}
          >
            {showSkeletons ? (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 min-h-[140px]">
                <SkeletonBlock className="h-4 w-32" />
                <SkeletonBlock className="h-10 w-24 mt-4" />
                <SkeletonBlock className="h-4 w-40 mt-4" />
                <div className="flex gap-6 mt-4">
                  <SkeletonBlock className="h-6 w-16" />
                  <SkeletonBlock className="h-6 w-16" />
                </div>
              </div>
            ) : (
              <StudentEnrollCard />
            )}
            {showSkeletons ? (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 min-h-[140px]">
                <SkeletonBlock className="h-4 w-32" />
                <SkeletonBlock className="h-10 w-24 mt-4" />
                <SkeletonBlock className="h-4 w-40 mt-4" />
                <div className="flex gap-6 mt-4">
                  <SkeletonBlock className="h-6 w-16" />
                  <SkeletonBlock className="h-6 w-16" />
                </div>
              </div>
            ) : (
              <TeacherStaffCard />
            )}
            <StatCard
              title="Notices"
              value={showSkeletons ? "—" : notices.length}
              subtext="Active Announcements"
              icon={Bell}
              colorClass="bg-[#E6F0FA]"
              iconColorClass="text-[#0B4A82]"
            />
          </div>

          {/* KPI row placed below the main stats so the three-card grid remains intact */}
          <div className="mb-8" style={DASHBOARD_DEFERRED_RENDER_STYLE}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">
                Live KPIs
              </h2>
              {showSummaryLoading && <SectionLoadingBadge />}
            </div>
            {showSkeletons ? (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Array.from({ length: 3 }).map((_, idx) => (
                    <div
                      key={idx}
                      className="bg-slate-50 p-4 rounded-2xl border border-slate-100"
                    >
                      <SkeletonBlock className="h-4 w-24" />
                      <SkeletonBlock className="h-8 w-20 mt-3" />
                      <SkeletonBlock className="h-4 w-16 mt-2" />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <KPIRowContainer />
            )}
          </div>

          {/* Charts Section */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">
              Attendance & Demographics
            </h2>
            {showHeavyLoading && <SectionLoadingBadge />}
          </div>
          <div
            className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8"
            style={DASHBOARD_DEFERRED_RENDER_STYLE}
          >
            <div className="lg:col-span-2 h-[550px]">
              {showSkeletons ? (
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 h-full">
                  <SkeletonBlock className="h-5 w-40" />
                  <SkeletonBlock className="h-4 w-64 mt-3" />
                  <SkeletonBlock className="h-64 mt-6" />
                </div>
              ) : (
                <MemoAttendanceChart
                  data={stats.classAttendance}
                  week={attendanceWeek}
                  onPreviousWeek={goToPreviousWeek}
                  onNextWeek={goToNextWeek}
                  onCurrentWeek={goToCurrentWeek}
                  schoolReopenDate={schoolConfig.schoolReopenDate}
                />
              )}
            </div>
            <div className="h-auto">
              {showSkeletons ? (
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 h-full flex flex-col justify-center">
                  <SkeletonBlock className="h-5 w-32" />
                  <SkeletonBlock className="h-44 w-44 rounded-full mx-auto mt-6" />
                  <div className="flex justify-between mt-6">
                    <SkeletonBlock className="h-6 w-20" />
                    <SkeletonBlock className="h-6 w-20" />
                  </div>
                </div>
              ) : (
                <GenderDonut />
              )}
            </div>
          </div>

          {/* New Performance Section */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">
              Academic Performance
            </h2>
            {showHeavyLoading && <SectionLoadingBadge />}
          </div>
          <div style={DASHBOARD_DEFERRED_RENDER_STYLE}>
            <PerformanceSection />
          </div>

          {/* Bottom Section: Recent Students & Notices */}
          <div
            className="grid grid-cols-1 gap-6 lg:grid-cols-4"
            style={DASHBOARD_DEFERRED_RENDER_STYLE}
          >
            {/* Recent Students Table */}
            <div
              className={`lg:col-span-2 ${DASHBOARD_PANEL} overflow-visible`}
            >
              <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
                <div>
                  <p className={DASHBOARD_SECTION_LABEL}>Admissions</p>
                  <h3 className="mt-1 font-bold text-slate-800">
                    New Admissions
                  </h3>
                  <p className="text-xs text-slate-500">
                    Recently added students
                  </p>
                </div>
                {showHeavyLoading && <SectionLoadingBadge />}
                {hasFeature("student_management") && (
                  <Link
                    to="/admin/students"
                    className={DASHBOARD_BUTTON_SECONDARY}
                  >
                    View All
                  </Link>
                )}
              </div>
              <div className={DASHBOARD_TABLE_WRAPPER}>
                <table className="w-full text-left text-sm text-slate-600">
                  <thead className="bg-slate-50/90 text-slate-700 font-semibold">
                    <tr>
                      <th className="px-6 py-3">Student Name</th>
                      <th className="px-6 py-3 text-center">Assigned Class</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recentStudents.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="p-6 text-center text-slate-400"
                        >
                          No students yet.
                        </td>
                      </tr>
                    ) : (
                      visibleRecentStudents.map((s, i) => (
                        <tr
                          key={s.id}
                          className="hover:bg-slate-50 transition-colors"
                        >
                          <td className="px-6 py-4 font-medium text-slate-800 flex items-center align-middle">
                            <div
                              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs text-white mr-3 shadow-sm ${s.gender === "Male" ? "bg-amber-400" : "bg-[#0B4A82]"}`}
                            >
                              {s.name.charAt(0)}
                            </div>
                            <div>
                              <p>{s.name}</p>
                              <p className="text-[10px] text-slate-400 uppercase">
                                {s.gender}
                              </p>
                            </div>
                          </td>
                          <td className="px-6 py-4 align-middle text-center">
                            <span className="inline-flex items-center justify-center min-w-[72px] px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 text-xs font-semibold border border-slate-200">
                              {
                                CLASSES_LIST.find((c) => c.id === s.classId)
                                  ?.name
                              }
                            </span>
                          </td>
                          <td className="px-6 py-4 align-middle">
                            <span className="inline-flex items-center text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5"></span>
                              Active
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right align-middle">
                            <div className="relative">
                              <button
                                onClick={(e) => handleMenuClick(e, s.id)}
                                className={`transition-colors p-1.5 rounded-full hover:bg-slate-200 ${openMenuId === s.id ? "text-[#1160A8] bg-slate-100" : "text-slate-400"}`}
                              >
                                <MoreHorizontal size={18} />
                              </button>

                              {/* Dropdown Menu */}
                              {openMenuId === s.id && (
                                <div className="absolute right-0 mt-1 w-40 bg-white rounded-lg shadow-xl border border-slate-100 z-50 py-1 text-left animate-in fade-in zoom-in-95 duration-100 origin-top-right">
                                  <button
                                    onClick={() => handleViewDetails(s)}
                                    className="flex items-center w-full px-4 py-2.5 text-xs text-slate-700 hover:bg-slate-50 hover:text-[#1160A8] font-medium transition-colors"
                                  >
                                    <Eye size={14} className="mr-2" /> View
                                    Details
                                  </button>
                                  <button
                                    onClick={() => handleEditStudent(s)}
                                    className="flex items-center w-full px-4 py-2.5 text-xs text-slate-700 hover:bg-slate-50 hover:text-[#1160A8] font-medium transition-colors"
                                  >
                                    <Edit size={14} className="mr-2" /> Edit
                                    Student
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
                {recentStudents.length > visibleRecentStudents.length && (
                  <div className="border-t border-slate-100 px-6 py-3 text-xs font-medium text-slate-500">
                    Showing the latest {visibleRecentStudents.length} of{" "}
                    {recentStudents.length} admissions.
                  </div>
                )}
              </div>
            </div>

            {/* Notice Board Widget */}
            <div className="relative overflow-hidden rounded-[28px] border border-slate-900/20 bg-[linear-gradient(155deg,#0f172a_0%,#0b4a82_42%,#082f49_100%)] shadow-[0_20px_48px_-34px_rgba(15,23,42,0.52)] flex flex-col text-white self-start">
              <div className={DASHBOARD_HERO_OVERLAY} />
              <div className="relative p-6 border-b border-white/10 flex justify-between items-center">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-100/70">
                    Communication
                  </p>
                  <h3 className="mt-1 font-bold text-[#E6F0FA]">
                    Notice Board
                  </h3>
                  <p className="text-xs text-slate-300">School announcements</p>
                </div>
                {showHeavyLoading && <SectionLoadingBadge label="Refreshing" />}
                {hasFeature("academic_year") && (
                  <Link
                    to="/admin/settings"
                    className="rounded-xl border border-white/10 bg-white/10 p-2 text-slate-200 transition-colors hover:bg-white/14"
                  >
                    <Settings size={18} />
                  </Link>
                )}
              </div>
              <div className="relative p-4 space-y-4 flex-1 overflow-y-auto max-h-[400px]">
                {broadcasts.length > 0 && (
                  <div className="space-y-2">
                    {visibleBroadcasts.map((b) => (
                      <div
                        key={b.id}
                        className={`rounded-xl border px-4 py-3 ${
                          b.type === "MAINTENANCE"
                            ? "border-red-200 bg-red-900/30"
                            : b.type === "SYSTEM_UPDATE"
                              ? "border-emerald-200 bg-emerald-900/20"
                              : "border-slate-200 bg-slate-900/20"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold text-slate-100 text-sm">
                            {b.title}
                          </h4>
                          <span className="text-[10px] font-semibold text-slate-300">
                            {b.priority}
                          </span>
                        </div>
                        <p className="text-xs text-slate-200 mt-1 whitespace-pre-line">
                          {b.message}
                        </p>
                        {b.type === "SYSTEM_UPDATE" && b.whatsNew?.length && (
                          <ul className="list-disc pl-5 text-xs text-slate-200 mt-2 space-y-1">
                            {b.whatsNew.map((item, idx) => (
                              <li key={idx}>{item}</li>
                            ))}
                          </ul>
                        )}
                        {b.type === "MAINTENANCE" && (
                          <p className="text-[11px] text-slate-300 mt-2">
                            {b.maintenanceStart
                              ? `Start: ${String(b.maintenanceStart)}`
                              : ""}{" "}
                            {b.maintenanceEnd
                              ? `End: ${String(b.maintenanceEnd)}`
                              : ""}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {notices.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 text-slate-400">
                    <Calendar size={40} className="mb-2 opacity-20" />
                    <p className="text-sm">No new notices</p>
                  </div>
                ) : (
                  visibleNotices.map((n, i) => (
                    <div
                      key={n.id}
                      className="group relative pl-4 pb-4 border-l border-slate-700 last:pb-0"
                    >
                      <div
                        className={`absolute -left-[5px] top-0 w-2.5 h-2.5 rounded-full border-2 border-slate-800 ${n.type === "urgent" ? "bg-red-500" : "bg-amber-500"}`}
                      ></div>
                      <div>
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded">
                            {n.date}
                          </span>
                          {n.type === "urgent" && (
                            <span className="text-[10px] text-red-400 font-bold uppercase tracking-wider">
                              Urgent
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-medium text-slate-200 group-hover:text-white transition-colors">
                          {n.message}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
              {(broadcasts.length > visibleBroadcasts.length ||
                notices.length > visibleNotices.length) && (
                <div className="relative px-4 pb-4 text-xs font-medium text-slate-300">
                  Showing the most recent dashboard items. Open Settings for the
                  full notice history.
                </div>
              )}
              <div className="relative p-4 bg-slate-950/30 text-center">
                {hasFeature("timetable") && (
                  <Link
                    to="/admin/timetable"
                    className="text-xs font-semibold text-amber-400 hover:text-amber-300 uppercase tracking-wide flex items-center justify-center w-full"
                  >
                    View Calendar <ArrowUpRight size={12} className="ml-1" />
                  </Link>
                )}
              </div>
            </div>

            {/* Teacher Attendance Widgets */}
            <div className="space-y-6">
              {/* Today's Teacher Attendance */}
              <div className="bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 rounded-2xl shadow-lg border border-emerald-200 flex flex-col min-h-[260px] hover:shadow-xl transition-shadow duration-300">
                <div className="p-3 sm:p-4 border-b border-emerald-200 flex justify-between items-center">
                  <div>
                    <h3 className="font-bold text-emerald-900 text-base sm:text-lg">
                      Teacher Attendance Today
                    </h3>
                    <p className="text-[10px] sm:text-xs text-emerald-700 mt-0.5">
                      Current day's staff presence overview
                    </p>
                  </div>
                  {showHeavyLoading && <SectionLoadingBadge />}
                  <div className="bg-emerald-100 p-1.5 sm:p-2 rounded-full">
                    <Users className="text-emerald-600" size={16} />
                  </div>
                </div>
                <div className="p-3 space-y-2 flex-1 overflow-y-auto max-h-[300px] sm:max-h-[350px]">
                  {pendingTeacherAttendance.length > 0 && (
                    <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <p className="text-xs font-semibold text-amber-800">
                          Pending approvals ({pendingTeacherAttendance.length})
                        </p>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-amber-700">
                            Approve to confirm attendance
                          </span>
                          <button
                            onClick={handleApproveAllTeacherAttendance}
                            disabled={isApprovingAllTeacherAttendance}
                            className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1 text-[10px] font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <RefreshCw
                              size={11}
                              className={
                                isApprovingAllTeacherAttendance
                                  ? "animate-spin"
                                  : ""
                              }
                            />
                            {isApprovingAllTeacherAttendance
                              ? "Approving..."
                              : "Approve All"}
                          </button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {visiblePendingTeacherAttendance.map((record) => (
                          <div
                            key={record.id}
                            className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2 border border-amber-100"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-slate-800 truncate">
                                {record.teacherName}
                              </p>
                              <p className="text-[10px] text-slate-500 truncate">
                                {record.teacherClasses || "No classes assigned"}
                              </p>
                              <p className="text-[10px] text-slate-400 flex flex-wrap items-center gap-1">
                                <span>{record.date}</span>
                                {getRelativeDayLabel(record.date) && (
                                  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600">
                                    {getRelativeDayLabel(record.date)}
                                  </span>
                                )}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() =>
                                  handleApproveTeacherAttendance(record)
                                }
                                disabled={isApprovingAllTeacherAttendance}
                                className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1 text-[10px] font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Yes
                              </button>
                              <button
                                onClick={() =>
                                  handleRejectTeacherAttendance(record)
                                }
                                disabled={isApprovingAllTeacherAttendance}
                                className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-3 py-1 text-[10px] font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                No
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {teacherAttendance.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-24 text-emerald-500">
                      <div className="bg-emerald-100 p-3 rounded-full mb-2">
                        <Users size={24} className="text-emerald-400" />
                      </div>
                      <p className="text-xs font-medium text-center">
                        No attendance marked yet today
                      </p>
                      <p className="text-[10px] text-emerald-400 mt-0.5">
                        Teachers will appear here once they mark attendance
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {visibleTeacherAttendance.map((record) => (
                        <div
                          key={record.id}
                          className="bg-white p-3 rounded-lg shadow-sm border border-emerald-100 hover:shadow-md transition-all duration-200 hover:border-emerald-200"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <div
                                className={`w-3.5 h-3.5 rounded-full flex-shrink-0 ${
                                  record.isHoliday
                                    ? "bg-amber-500"
                                    : record.status === "present"
                                      ? "bg-emerald-500"
                                      : "bg-red-500"
                                } shadow-sm`}
                              ></div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                                  <p className="text-[10px] sm:text-xs font-semibold text-slate-800 truncate max-w-[120px] sm:max-w-none">
                                    {record.teacherName}
                                  </p>
                                  <span
                                    className={`px-1.5 py-0.5 rounded-full text-[9px] font-medium flex-shrink-0 ${
                                      record.isHoliday
                                        ? "bg-amber-100 text-amber-700"
                                        : record.status === "present"
                                          ? "bg-emerald-100 text-emerald-700"
                                          : "bg-red-100 text-red-700"
                                    }`}
                                  >
                                    {record.isHoliday
                                      ? "Holiday"
                                      : record.status === "present"
                                        ? "Present"
                                        : "Absent"}
                                  </span>
                                </div>
                                <p className="text-[9px] text-slate-500 truncate">
                                  {record.teacherClasses ||
                                    "No classes assigned"}
                                </p>
                                <p className="text-[9px] text-slate-400 mt-0.5">
                                  {record.date}
                                </p>
                              </div>
                            </div>
                            <div className="ml-2 flex-shrink-0">
                              <div
                                className={`w-6 h-6 rounded-full flex items-center justify-center ${
                                  record.isHoliday
                                    ? "bg-amber-100 text-amber-600"
                                    : record.status === "present"
                                      ? "bg-emerald-100 text-emerald-600"
                                      : "bg-red-100 text-red-600"
                                }`}
                              >
                                {record.isHoliday ? (
                                  <AlertTriangle className="w-3 h-3" />
                                ) : record.status === "present" ? (
                                  <svg
                                    className="w-3 h-3"
                                    fill="currentColor"
                                    viewBox="0 0 20 20"
                                  >
                                    <path
                                      fillRule="evenodd"
                                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                      clipRule="evenodd"
                                    />
                                  </svg>
                                ) : (
                                  <svg
                                    className="w-3 h-3"
                                    fill="currentColor"
                                    viewBox="0 0 20 20"
                                  >
                                    <path
                                      fillRule="evenodd"
                                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                                      clipRule="evenodd"
                                    />
                                  </svg>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                      <div className="text-center mt-3 pt-2 border-t border-emerald-100">
                        <p className="text-[10px] text-emerald-600 font-medium">
                          {teacherAttendance.length} teacher
                          {teacherAttendance.length !== 1 ? "s" : ""} marked
                          attendance today
                        </p>
                        {teacherAttendance.length >
                          visibleTeacherAttendance.length && (
                          <p className="mt-1 text-[10px] text-emerald-500">
                            Showing {visibleTeacherAttendance.length} of{" "}
                            {teacherAttendance.length} records.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Teacher Term Attendance Statistics */}
              {schoolConfig.schoolReopenDate !==
                new Date().toISOString().split("T")[0] && (
                <div className="bg-gradient-to-br from-[#E6F0FA] via-[#E6F0FA] to-white rounded-2xl shadow-lg border border-[#E6F0FA] flex flex-col min-h-[280px] hover:shadow-xl transition-shadow duration-300">
                  <div className="p-3 sm:p-4 border-b border-[#E6F0FA] flex justify-between items-center">
                    <div>
                      <h3 className="font-bold text-[#0B4A82] text-base sm:text-lg">
                        Teacher Attendance Summary
                      </h3>
                      <p className="text-[10px] sm:text-xs text-[#1160A8] mt-0.5">
                        Term-wide staff attendance statistics
                      </p>
                    </div>
                    {showHeavyLoading && <SectionLoadingBadge />}
                    <div className="bg-[#E6F0FA] p-1.5 sm:p-2 rounded-full">
                      <BarChart2 className="text-[#0B4A82]" size={16} />
                    </div>
                  </div>
                  <div className="p-3 space-y-2 flex-1 overflow-y-auto max-h-[300px] sm:max-h-[350px]">
                    {teacherTermStats.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-24 text-[#0B4A82]">
                        <div className="bg-[#E6F0FA] p-3 rounded-full mb-2">
                          <BarChart2 size={24} className="text-[#1160A8]" />
                        </div>
                        <p className="text-xs font-medium text-center">
                          No attendance data available
                        </p>
                        <p className="text-[10px] text-[#1160A8] mt-0.5">
                          Term statistics will appear as teachers mark
                          attendance
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {visibleTeacherTermStats.map((stat: any) => (
                          <div
                            key={stat.id}
                            className="bg-white p-3 rounded-lg shadow-sm border border-[#E6F0FA] hover:shadow-md transition-all duration-200 hover:border-[#E6F0FA]"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <div className="flex-shrink-0">
                                  <div className="relative">
                                    <div className="w-9 h-9 bg-[#E6F0FA] rounded-full flex items-center justify-center">
                                      <span className="text-[10px] font-bold text-[#0B4A82]">
                                        {stat.attendanceRate}%
                                      </span>
                                    </div>
                                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-white rounded-full flex items-center justify-center">
                                      <div
                                        className={`w-2 h-2 rounded-full ${
                                          stat.attendanceRate >= 80
                                            ? "bg-emerald-500"
                                            : stat.attendanceRate >= 70
                                              ? "bg-amber-500"
                                              : "bg-red-500"
                                        }`}
                                      ></div>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                                    <p className="text-[10px] sm:text-xs font-semibold text-slate-800 truncate max-w-[120px] sm:max-w-none">
                                      {stat.name}
                                    </p>
                                    <span
                                      className={`px-1.5 py-0.5 rounded-full text-[9px] font-medium flex-shrink-0 ${
                                        stat.attendanceRate >= 80
                                          ? "bg-emerald-100 text-emerald-700"
                                          : stat.attendanceRate >= 70
                                            ? "bg-amber-100 text-amber-700"
                                            : "bg-red-100 text-red-700"
                                      }`}
                                    >
                                      {stat.attendanceRate >= 80
                                        ? "Excellent"
                                        : stat.attendanceRate >= 70
                                          ? "Good"
                                          : "Needs Attention"}
                                    </span>
                                  </div>
                                  <p className="text-[9px] text-slate-500 truncate">
                                    {stat.classes || "No classes assigned"}
                                  </p>
                                  <p className="text-[9px] text-slate-400 mt-0.5">
                                    {stat.presentDays} present /{" "}
                                    {stat.totalDays} total days
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                        <div className="text-center mt-3 pt-2 border-t border-[#E6F0FA]">
                          <p className="text-[10px] text-[#0B4A82] font-medium">
                            Average attendance:{" "}
                            {averageTeacherAttendanceRate}
                            %
                          </p>
                          {teacherTermStats.length >
                            visibleTeacherTermStats.length && (
                            <p className="mt-1 text-[10px] text-[#1160A8]">
                              Showing {visibleTeacherTermStats.length} of{" "}
                              {teacherTermStats.length} teachers.
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modals for View/Edit (content unchanged, but necessary to keep file valid if copy-pasting full file) */}
      {viewStudent && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
            <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center text-2xl font-bold text-slate-500 shadow-inner">
                  {viewStudent.name.charAt(0)}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">
                    {viewStudent.name}
                  </h2>
                  <div className="flex gap-2 text-sm text-slate-500 mt-1">
                    <span className="flex items-center">
                      <User size={14} className="mr-1" /> {viewStudent.gender}
                    </span>
                    <span>•</span>
                    <span>
                      {
                        CLASSES_LIST.find((c) => c.id === viewStudent.classId)
                          ?.name
                      }
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setViewStudent(null)}
                className="text-slate-400 hover:text-slate-700 transition-colors bg-white p-2 rounded-full shadow-sm hover:shadow"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-8">
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-amber-100 rounded-full text-amber-600">
                    <Calendar size={24} />
                  </div>
                  <div>
                    <h4 className="font-semibold text-amber-900">
                      Attendance Overview
                    </h4>
                    <p className="text-sm text-amber-700">
                      Current Term Participation
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-3xl font-bold text-amber-600">
                    {performanceData
                      ? `${performanceData.attendance.percentage}%`
                      : "..."}
                  </span>
                  <p className="text-xs text-amber-700 font-medium mt-1">
                    {performanceData
                      ? `${performanceData.attendance.present}/${performanceData.attendance.total} Days`
                      : "Loading"}
                  </p>
                </div>
              </div>

              <div>
                <h3 className="font-bold text-slate-800 mb-4 flex items-center">
                  <BookOpen size={20} className="mr-2 text-[#0B4A82]" />{" "}
                  Academic Performance ({schoolConfig.currentTerm})
                </h3>
                <div className="border border-slate-200 rounded-lg overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-100 text-slate-600 font-semibold">
                      <tr>
                        <th className="px-4 py-3">Subject</th>
                        <th className="px-4 py-3 text-center">Score</th>
                        <th className="px-4 py-3 text-center">Grade</th>
                        <th className="px-4 py-3 text-right">Remark</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {performanceData ? (
                        performanceData.grades.map((g: any, i: number) => {
                          const score = g.total ?? calculateTotalScore(g);
                          const { grade, remark } = calculateGrade(score);
                          return (
                            <tr key={i} className="hover:bg-slate-50">
                              <td className="px-4 py-3 font-medium text-slate-800">
                                {g.subject}
                              </td>
                              <td className="px-4 py-3 text-center">
                                {score > 0 ? score : "-"}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span
                                  className={`px-2 py-1 rounded text-xs font-bold ${getGradeColor(grade)}`}
                                >
                                  {score > 0 ? grade : "-"}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right text-slate-500">
                                {score > 0 ? remark : "N/A"}
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td
                            colSpan={4}
                            className="p-4 text-center text-slate-400 italic"
                          >
                            Fetching academic records...
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {editingStudent && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6 border-b pb-2">
              <h3 className="text-lg font-bold text-slate-900">
                Edit Student Details
              </h3>
              <button
                onClick={() => setEditingStudent(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-5">
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-[#0B4A82] uppercase tracking-wide">
                  Personal Information
                </h4>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-[#1160A8] outline-none transition-all placeholder-slate-400"
                    value={editFormData.name || ""}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, name: e.target.value })
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">
                      Gender
                    </label>
                    <select
                      className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-[#1160A8] outline-none bg-white text-slate-900"
                      value={editFormData.gender}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          gender: e.target.value as any,
                        })
                      }
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">
                      Date of Birth
                    </label>
                    <input
                      type="date"
                      className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-[#1160A8] outline-none"
                      value={editFormData.dob || ""}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          dob: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4 pt-2 border-t border-slate-50 mt-2">
                <h4 className="text-xs font-bold text-[#0B4A82] uppercase tracking-wide">
                  Academic Info
                </h4>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    Assigned Class
                  </label>
                  <select
                    className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-[#1160A8] outline-none bg-white text-slate-900"
                    value={editFormData.classId}
                    onChange={(e) =>
                      setEditFormData({
                        ...editFormData,
                        classId: e.target.value,
                      })
                    }
                  >
                    {CLASSES_LIST.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-4 pt-2 border-t border-slate-50 mt-2">
                <h4 className="text-xs font-bold text-[#0B4A82] uppercase tracking-wide">
                  Guardian Information
                </h4>
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">
                      Guardian Name
                    </label>
                    <input
                      type="text"
                      className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-[#1160A8] outline-none placeholder-slate-400"
                      value={editFormData.guardianName || ""}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          guardianName: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-[#1160A8] outline-none placeholder-slate-400"
                      value={editFormData.guardianPhone || ""}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          guardianPhone: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingStudent(null)}
                  className="px-5 py-2.5 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex items-center px-5 py-2.5 bg-[#0B4A82] text-white rounded-lg hover:bg-[#0B4A82] font-medium shadow-sm transition-colors"
                >
                  <Save size={18} className="mr-2" /> Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Grade Bucket Modal */}
      {selectedGrade && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Students with grade {selectedGrade}
                </h2>
                <p className="text-sm text-slate-500">
                  {(gradeBuckets[selectedGrade] || []).length} students
                </p>
              </div>
              <button
                onClick={() => setSelectedGrade(null)}
                className="text-slate-400 hover:text-slate-700 transition-colors bg-white p-2 rounded-full shadow-sm hover:shadow"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {!gradeBuckets[selectedGrade] ||
              gradeBuckets[selectedGrade].length === 0 ? (
                <div className="text-center text-slate-400 py-8">
                  No students in this grade for the selected term.
                </div>
              ) : (
                <div className="space-y-3">
                  {gradeBuckets[selectedGrade].map((s, i) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between border-b border-slate-100 pb-3 last:pb-0"
                    >
                      <div>
                        <p className="font-semibold text-slate-800">{s.name}</p>
                        <p className="text-xs text-slate-400">
                          {s.class} • Avg: {s.avg}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => fetchAndViewStudent(s.id)}
                          className="text-xs text-[#0B4A82] hover:underline"
                        >
                          View
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default AdminDashboard;
