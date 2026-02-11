import React, {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useLayoutEffect,
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
} from "lucide-react";
import {
  Notice,
  Student,
  TeacherAttendanceRecord,
  SchoolConfig,
  UserRole,
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

const parseLocalDate = (dateStr?: string | null): Date | null => {
  if (!dateStr) return null;
  const [year, month, day] = dateStr.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
};

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

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { school, schoolLoading } = useSchool();
  const schoolId = school?.id || null;
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
  const [recentStudents, setRecentStudents] = useState<Student[]>([]);
  const [dashboardStatsCache, setDashboardStatsCache] = useState<
    typeof stats | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [initialDataReady, setInitialDataReady] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [heavyLoading, setHeavyLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Teacher Attendance State
  const [teacherAttendance, setTeacherAttendance] = useState<any[]>([]);
  const [pendingTeacherAttendance, setPendingTeacherAttendance] = useState<
    any[]
  >([]);
  const [teacherTermStats, setTeacherTermStats] = useState<any[]>([]);
  const [missedAttendanceAlerts, setMissedAttendanceAlerts] = useState<any[]>(
    [],
  );
  const [missedStudentAttendanceAlerts, setMissedStudentAttendanceAlerts] =
    useState<any[]>([]);

  // Real-time metrics
  const [realTimeEnabled, setRealTimeEnabled] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const pollRef = React.useRef<number | null>(null);
  const heavyRefreshTimerRef = React.useRef<number | null>(null);
  const heavyRefreshInFlightRef = React.useRef(false);
  const lastHeavyRefreshAtRef = React.useRef(0);
  const [now, setNow] = useState<number>(Date.now());
  const [animatedStudents, setAnimatedStudents] = useState<number>(0);
  const [animatedAttendance, setAnimatedAttendance] = useState<number>(0);
  const [animatedGradeAvg, setAnimatedGradeAvg] = useState<number>(0);
  const [thisWeekAttendance, setThisWeekAttendance] = useState<number | null>(
    null,
  );
  const [lastWeekAttendance, setLastWeekAttendance] = useState<number | null>(
    null,
  );

  const HEAVY_REFRESH_THROTTLE_MS = 8000;
  const STATS_POLL_INTERVAL_MS = 30000;

  // Configuration State
  const [schoolConfig, setSchoolConfig] = useState<Partial<SchoolConfig>>({
    academicYear: "",
    currentTerm: "",
    schoolReopenDate: "",
    schoolName: "", // Assuming these properties are always present based on SchoolConfig interface
    headTeacherRemark: "",
    termEndDate: "",
    vacationDate: "",
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

  const subscriptionCountdown = useMemo(() => {
    if ((school as any)?.plan === "free") return null;
    if ((school as any)?.plan === "trial") return null;

    const planEndsAt = resolvePlanEndsAt();
    if (!planEndsAt) return null;

    const nowDate = new Date(now);

    if (nowDate >= planEndsAt) return null;

    const remainingMs = Math.max(0, planEndsAt.getTime() - nowDate.getTime());
    const days = Math.floor(remainingMs / (24 * 60 * 60 * 1000));
    const hours = Math.floor((remainingMs / (60 * 60 * 1000)) % 24);
    const minutes = Math.floor((remainingMs / (60 * 1000)) % 60);
    const seconds = Math.floor((remainingMs / 1000) % 60);

    return {
      planEndsAt,
      days,
      hours,
      minutes,
      seconds,
    };
  }, [school?.planEndsAt, now, school?.plan]);

  const trialCountdown = useMemo(() => {
    if ((school as any)?.plan !== "trial") return null;

    const planEndsAt = normalizePlanEndsAt((school as any)?.planEndsAt);
    if (!planEndsAt) return null;

    const nowDate = new Date(now);
    if (nowDate >= planEndsAt) return null;

    const remainingMs = Math.max(0, planEndsAt.getTime() - nowDate.getTime());
    const days = Math.floor(remainingMs / (24 * 60 * 60 * 1000));
    const hours = Math.floor((remainingMs / (60 * 60 * 1000)) % 24);
    const minutes = Math.floor((remainingMs / (60 * 1000)) % 60);
    const seconds = Math.floor((remainingMs / 1000) % 60);

    return {
      planEndsAt,
      days,
      hours,
      minutes,
      seconds,
    };
  }, [school?.planEndsAt, now, school?.plan]);

  const graceCountdown = useMemo(() => {
    if ((school as any)?.plan === "free") return null;
    if ((school as any)?.plan === "trial") return null;

    const planEndsAt = resolvePlanEndsAt();
    if (!planEndsAt) return null;

    const graceMs = 7 * 24 * 60 * 60 * 1000;
    const graceEndsAt = new Date(planEndsAt.getTime() + graceMs);
    const nowDate = new Date(now);

    if (nowDate < planEndsAt || nowDate >= graceEndsAt) return null;

    const remainingMs = Math.max(0, graceEndsAt.getTime() - nowDate.getTime());
    const days = Math.floor(remainingMs / (24 * 60 * 60 * 1000));
    const hours = Math.floor((remainingMs / (60 * 60 * 1000)) % 24);
    const minutes = Math.floor((remainingMs / (60 * 1000)) % 60);
    const seconds = Math.floor((remainingMs / 1000) % 60);

    return {
      planEndsAt,
      graceEndsAt,
      days,
      hours,
      minutes,
      seconds,
    };
  }, [school?.planEndsAt, now, school?.plan]);

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
    const raw = localStorage.getItem(heavyCacheKey);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AdminDashboardCache;
    } catch (e) {
      console.warn("Failed to parse cached dashboard data", e);
      localStorage.removeItem(heavyCacheKey);
      return null;
    }
  }, [heavyCacheKey]);

  useLayoutEffect(() => {
    if (!cachedHeavy) return;
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    if (cachedHeavy.attendanceDate && cachedHeavy.attendanceDate !== todayStr) {
      localStorage.removeItem(heavyCacheKey);
      setTeacherAttendance([]);
      setPendingTeacherAttendance([]);
      setTeacherTermStats([]);
      return;
    }
    setStats(cachedHeavy.stats);
    setDashboardStatsCache(cachedHeavy.stats);
    setNotices(cachedHeavy.notices);
    setRecentStudents(cachedHeavy.recentStudents);
    const cachedTeacherAttendance = (
      cachedHeavy.teacherAttendance || []
    ).filter((record: any) => record.date === todayStr);
    setTeacherAttendance(cachedTeacherAttendance);
    const cachedPending = cachedHeavy.pendingTeacherAttendance || [];
    const filteredCachedPending = cachedPending.filter(
      (record: any) => record.approvalStatus === "pending",
    );
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
    if (cachedHeavy.stats?.students !== undefined) {
      setAnimatedStudents(cachedHeavy.stats.students);
    }
    if (cachedHeavy.stats?.classAttendance?.length) {
      const classPctList = cachedHeavy.stats.classAttendance.map(
        (c) => c.percentage || 0,
      );
      const currentAttendanceAvg =
        classPctList.length > 0
          ? Math.round(
              classPctList.reduce((a, b) => a + b, 0) / classPctList.length,
            )
          : 0;
      setAnimatedAttendance(currentAttendanceAvg);
    }
    if (cachedHeavy.gradeDistribution) {
      const totalGrades = Object.values(cachedHeavy.gradeDistribution).reduce(
        (sum, value) => sum + value,
        0,
      );
      if (totalGrades > 0) {
        const weights: Record<string, number> = {
          A: 4,
          B: 3,
          C: 2,
          D: 1,
          F: 0,
        };
        const weightedSum = Object.entries(
          cachedHeavy.gradeDistribution,
        ).reduce(
          (acc, [grade, count]) => acc + (weights[grade] ?? 0) * (count ?? 0),
          0,
        );
        const avgScore = weightedSum / totalGrades;
        setAnimatedGradeAvg(Math.round((avgScore / 4) * 100));
      }
    }
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
          localStorage.setItem(
            summaryCacheKey,
            JSON.stringify({
              ...nextStats,
              updatedAt: Date.now(),
            }),
          );
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

        const [
          dashboardStats,
          students,
          fetchedNotices,
          config,
          teachers,
          teacherAttendanceData,
          pendingTeacherAttendance,
          allTeacherRecords,
        ] = await Promise.all([
          db.getDashboardStats(schoolId),
          db.getStudents(schoolId),
          db.getNotices(schoolId),
          db.getSchoolConfig(schoolId),
          db.getUsers(schoolId),
          db.getAllApprovedTeacherAttendance(schoolId, today),
          db.getAllPendingTeacherAttendance(schoolId),
          db.getAllTeacherAttendanceRecords(schoolId),
        ]);

        // Check for missed attendance on recent school days (weekdays)
        const missedAlerts: any[] = [];

        // Only check if school has reopened and there are attendance records in the database
        const currentDate = new Date();
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

        const maxDaysBack = 5; // Check up to 5 previous school days for missed attendance

        const holidayDates = new Set([
          ...allTeacherRecords.filter((r) => r.isHoliday).map((r) => r.date),
          ...(config.holidayDates || []).map((h) => h.date),
        ]);

        if (
          schoolHasReopened &&
          !isOnVacation &&
          allTeacherRecords.length > 0
        ) {
          // Parse dates
          const parseLocalDate = (dateStr: string): Date | null => {
            if (!dateStr) return null;
            let parts: string[] = [];
            if (dateStr.includes("-")) {
              parts = dateStr.split("-");
              if (parts.length === 3) {
                return new Date(
                  parseInt(parts[0]),
                  parseInt(parts[1]) - 1,
                  parseInt(parts[2]),
                );
              }
            } else if (dateStr.includes("/")) {
              parts = dateStr.split("/");
              if (parts.length === 3) {
                return new Date(
                  parseInt(parts[2]),
                  parseInt(parts[0]) - 1,
                  parseInt(parts[1]),
                );
              }
            }
            return null;
          };
          const reopenDateObjLocal = parseLocalDate(config.schoolReopenDate);
          const vacationDateObjLocal = parseLocalDate(config.vacationDate);

          let currentCheckDate = new Date();
          for (let i = 0; i < maxDaysBack; i++) {
            // Find next previous weekday
            let checkDate = new Date(currentCheckDate);
            let dayOfWeek = checkDate.getDay();
            do {
              checkDate.setDate(checkDate.getDate() - 1);
              dayOfWeek = checkDate.getDay();
              const isVacationDay =
                vacationDateObjLocal &&
                checkDate.toDateString() ===
                  vacationDateObjLocal.toDateString();
              if (dayOfWeek === 0 || dayOfWeek === 6 || isVacationDay) {
                continue;
              } else {
                break;
              }
            } while (true);

            const checkDayStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, "0")}-${String(checkDate.getDate()).padStart(2, "0")}`;
            const checkDayTime = checkDate.getTime();
            const reopenTime = reopenDateObjLocal
              ? reopenDateObjLocal.getTime()
              : 0;
            const isDuringVacationCheck =
              vacationDateObjLocal &&
              nextTermBeginsObj &&
              checkDate >= vacationDateObjLocal &&
              checkDate < nextTermBeginsObj;

            if (
              checkDayTime >= reopenTime &&
              reopenTime > 0 &&
              !isDuringVacationCheck &&
              !holidayDates.has(checkDayStr)
            ) {
              for (const teacher of teachers.filter(
                (t) => t.role === UserRole.TEACHER,
              )) {
                const attendanceRecord = await db.getTeacherAttendance(
                  schoolId,
                  teacher.id,
                  checkDayStr,
                );
                if (!attendanceRecord || attendanceRecord.isHoliday) {
                  missedAlerts.push({
                    teacherId: teacher.id,
                    teacherName: teacher.fullName,
                    date: checkDayStr,
                    classes:
                      teacher.assignedClassIds
                        ?.map(
                          (id) => CLASSES_LIST.find((c) => c.id === id)?.name,
                        )
                        .join(", ") || "Not Assigned",
                  });
                }
              }
            } else {
              // If this day is before reopen or during vacation, stop checking further back
              break;
            }
            currentCheckDate = checkDate;
          }
        }

        // Check for missed STUDENT attendance on recent school days
        const missedStudentAlerts: any[] = [];

        if (schoolHasReopened && !isOnVacation) {
          // Parse dates
          const parseLocalDate = (dateStr: string): Date | null => {
            if (!dateStr) return null;
            let parts: string[] = [];
            if (dateStr.includes("-")) {
              parts = dateStr.split("-");
              if (parts.length === 3) {
                return new Date(
                  parseInt(parts[0]),
                  parseInt(parts[1]) - 1,
                  parseInt(parts[2]),
                );
              }
            } else if (dateStr.includes("/")) {
              parts = dateStr.split("/");
              if (parts.length === 3) {
                return new Date(
                  parseInt(parts[2]),
                  parseInt(parts[0]) - 1,
                  parseInt(parts[1]),
                );
              }
            }
            return null;
          };
          const reopenDateObjLocal = parseLocalDate(config.schoolReopenDate);
          const vacationDateObjLocal = parseLocalDate(config.vacationDate);

          let currentCheckDate = new Date();
          for (let i = 0; i < maxDaysBack; i++) {
            // Find next previous weekday
            let checkDate = new Date(currentCheckDate);
            let dayOfWeek = checkDate.getDay();
            do {
              checkDate.setDate(checkDate.getDate() - 1);
              dayOfWeek = checkDate.getDay();
              const isVacationDay =
                vacationDateObjLocal &&
                checkDate.toDateString() ===
                  vacationDateObjLocal.toDateString();
              if (dayOfWeek === 0 || dayOfWeek === 6 || isVacationDay) {
                continue;
              } else {
                break;
              }
            } while (true);

            const checkDayStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, "0")}-${String(checkDate.getDate()).padStart(2, "0")}`;
            const checkDayTime = checkDate.getTime();
            const reopenTime = reopenDateObjLocal
              ? reopenDateObjLocal.getTime()
              : 0;
            const isDuringVacationCheck =
              vacationDateObjLocal &&
              nextTermBeginsObj &&
              checkDate >= vacationDateObjLocal &&
              checkDate < nextTermBeginsObj;

            const holidayRecords = await db.getAttendanceByDate(
              schoolId,
              checkDayStr,
            );
            const isHolidayDate =
              holidayRecords.some((r) => r.isHoliday) ||
              (config.holidayDates || []).some((h) => h.date === checkDayStr);

            if (
              checkDayTime >= reopenTime &&
              reopenTime > 0 &&
              !isDuringVacationCheck &&
              !isHolidayDate
            ) {
              for (const teacher of teachers.filter(
                (t) =>
                  t.role === UserRole.TEACHER &&
                  t.assignedClassIds &&
                  t.assignedClassIds.length > 0,
              )) {
                const classId = teacher.assignedClassIds![0];
                const className =
                  CLASSES_LIST.find((c) => c.id === classId)?.name ||
                  "Unknown Class";
                const studentAttendanceRecord = await db.getAttendance(
                  schoolId,
                  classId,
                  checkDayStr,
                );
                if (
                  !studentAttendanceRecord ||
                  studentAttendanceRecord.isHoliday
                ) {
                  missedStudentAlerts.push({
                    teacherId: teacher.id,
                    teacherName: teacher.fullName,
                    date: checkDayStr,
                    className: className,
                  });
                }
              }
            } else {
              // If this day is before reopen or during vacation, stop checking further back
              break;
            }
            currentCheckDate = checkDate;
          }
        }

        // Helper function to count weekdays between two dates (inclusive)
        const countWeekdays = (startDate: string, endDate: string): number => {
          if (!startDate || !endDate) return 0;
          const start = new Date(startDate + "T00:00:00");
          const end = new Date(endDate + "T00:00:00");
          if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            return 0;
          }
          if (start > end) return 0;
          let count = 0;
          const current = new Date(start);
          while (current <= end) {
            const dayOfWeek = current.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
              // Not Sunday or Saturday
              count++;
            }
            current.setDate(current.getDate() + 1);
          }
          return count;
        };

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
        const termStartDate =
          config.schoolReopenDate || earliestRecordDate || today;
        const termEndDate = config.vacationDate || latestRecordDate || today;

        const parsedStart = parseLocalDateForStats(termStartDate);
        const parsedEnd = parseLocalDateForStats(termEndDate);
        const safeStart = parsedStart || new Date(today + "T00:00:00");
        const safeEnd = parsedEnd || new Date(today + "T00:00:00");
        const startLabel = `${safeStart.getFullYear()}-${String(
          safeStart.getMonth() + 1,
        ).padStart(2, "0")}-${String(safeStart.getDate()).padStart(2, "0")}`;
        const endLabel = `${safeEnd.getFullYear()}-${String(
          safeEnd.getMonth() + 1,
        ).padStart(2, "0")}-${String(safeEnd.getDate()).padStart(2, "0")}`;
        const normalizedStart = safeStart <= safeEnd ? startLabel : endLabel;
        const normalizedEnd = safeStart <= safeEnd ? endLabel : startLabel;

        // Calculate total possible school days in the term
        const teacherHolidayDates = new Set([
          ...allTeacherRecords.filter((r) => r.isHoliday).map((r) => r.date),
          ...(config.holidayDates || []).map((h) => h.date),
        ]);
        const totalPossibleDays = countWeekdays(normalizedStart, normalizedEnd);
        const totalPossibleDaysWithoutHolidays = Math.max(
          0,
          totalPossibleDays - teacherHolidayDates.size,
        );

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
            const totalDays = totalPossibleDaysWithoutHolidays; // Total possible school days in the term
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
          record.id || `${record.teacherId || "unknown"}_${record.date || ""}`;

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

        setSchoolConfig((prev) => ({
          ...prev,
          academicYear: config.academicYear,
          currentTerm: config.currentTerm,
          schoolReopenDate: config.schoolReopenDate || "",
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

        const hasAssessmentData = allAssessments.some((a) => {
          const score = a.total ?? calculateTotalScore(a);
          return a.term === (dynamicTerm as any) && score > 0;
        });

        if (hasAssessmentData) {
          allAssessments.forEach((a) => {
            const score = a.total ?? calculateTotalScore(a);
            if (
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
        }

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

        const fullStats = {
          students: dashboardStats.studentsCount,
          teachers: dashboardStats.teachersCount,
          classes: CLASSES_LIST.length,
          maleStudents: dashboardStats.gender.male,
          femaleStudents: dashboardStats.gender.female,
          classAttendance: dashboardStats.classAttendance,
        };
        setStats(fullStats);
        setDashboardStatsCache(fullStats);
        if (summaryCacheKey) {
          localStorage.setItem(
            summaryCacheKey,
            JSON.stringify({ ...fullStats, updatedAt: Date.now() }),
          );
        }
        setNotices(fetchedNotices);
        setRecentStudents(students.slice(-5).reverse());
        const combinedTeacherAttendance = [
          ...approvedAttendanceWithDetails,
          ...teacherAttendanceWithDetails,
        ]
          .filter((record) => record.date === today)
          .reduce((acc: any[], record: any) => {
            const key = attendanceKey(record);
            if (!acc.find((item) => attendanceKey(item) === key)) {
              acc.push({ ...record, id: key });
            }
            return acc;
          }, []);
        setTeacherAttendance(combinedTeacherAttendance);
        const pendingTodayWithDetails = pendingAttendanceWithDetails.filter(
          (record) => record.approvalStatus === "pending",
        );
        setPendingTeacherAttendance(pendingTodayWithDetails);
        setTeacherTermStats(teacherTermStats);
        setMissedAttendanceAlerts(missedAlerts);
        setMissedStudentAttendanceAlerts(missedStudentAlerts);

        setGradeDistribution(counts);
        setTopStudents(averagesList.slice(0, 5));
        setGradeBuckets(buckets);
        setLastUpdated(new Date());
        setInitialDataReady(true);
        if (heavyCacheKey) {
          const cachePayload: AdminDashboardCache = {
            stats: fullStats,
            notices: fetchedNotices,
            recentStudents: students.slice(-5).reverse(),
            teacherAttendance: combinedTeacherAttendance,
            pendingTeacherAttendance: pendingTodayWithDetails,
            teacherTermStats: teacherTermStats,
            missedAttendanceAlerts: missedAlerts,
            missedStudentAttendanceAlerts: missedStudentAlerts,
            gradeDistribution: counts,
            topStudents: averagesList.slice(0, 5),
            gradeBuckets: buckets,
            schoolConfig: {
              academicYear: config.academicYear,
              currentTerm: config.currentTerm,
              schoolReopenDate: config.schoolReopenDate || "",
              schoolName: config.schoolName,
              headTeacherRemark: config.headTeacherRemark,
              termEndDate: config.termEndDate,
              vacationDate: config.vacationDate,
              nextTermBegins: config.nextTermBegins,
              termTransitionProcessed: config.termTransitionProcessed,
            },
            heatmapData,
            comparativeData,
            gradeDistributionByClass,
            sparklines,
            lastUpdated: Date.now(),
            attendanceDate: today,
          };
          localStorage.setItem(heavyCacheKey, JSON.stringify(cachePayload));
        }
      } catch (err: any) {
        console.error("Dashboard fetch error:", err);
        setError(
          "Failed to load dashboard data. Please check your internet connection or database permissions.",
        );
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
      localStorage.removeItem(heavyCacheKey);
      setTeacherAttendance([]);
      setPendingTeacherAttendance([]);
      setTeacherTermStats([]);
      setMissedAttendanceAlerts([]);
      setMissedStudentAttendanceAlerts([]);
      fetchHeavyData({ background: true }).catch((e) =>
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
      await db.approveTeacherAttendance(schoolId, record.id, user.id);
      showToast(`Approved attendance for ${record.teacherName}.`, {
        type: "success",
      });
      setPendingTeacherAttendance((prev) =>
        prev.filter((item) => item.id !== record.id),
      );
      setTeacherAttendance((prev) => [
        ...prev,
        { ...record, approvalStatus: "approved", approvedBy: user.id },
      ]);
      if (heavyCacheKey) {
        localStorage.removeItem(heavyCacheKey);
      }
    } catch (error) {
      console.error("Failed to approve attendance", error);
      showToast("Failed to approve attendance.", { type: "error" });
    }
  };

  const handleRejectTeacherAttendance = async (record: any) => {
    if (!schoolId || !user?.id) return;
    try {
      await db.rejectTeacherAttendance(schoolId, record.id, user.id);
      showToast(`Rejected attendance for ${record.teacherName}.`, {
        type: "success",
      });
      setPendingTeacherAttendance((prev) =>
        prev.filter((item) => item.id !== record.id),
      );
      setTeacherAttendance((prev) => [
        ...prev,
        {
          ...record,
          approvalStatus: "rejected",
          status: "absent",
          approvedBy: user.id,
        },
      ]);
      if (heavyCacheKey) {
        localStorage.removeItem(heavyCacheKey);
      }
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
      // compute simple attendance average across classes
      const classPctList = (dashboardStats.classAttendance || []).map(
        (c: any) => c.percentage || 0,
      );
      const currentAttendanceAvg =
        classPctList.length > 0
          ? Math.round(
              classPctList.reduce((a, b) => a + b, 0) / classPctList.length,
            )
          : 0;
      setStats((prev) => ({
        ...prev,
        students: dashboardStats.studentsCount,
        teachers: dashboardStats.teachersCount,
        classes: CLASSES_LIST.length,
        maleStudents: dashboardStats.gender.male,
        femaleStudents: dashboardStats.gender.female,
        classAttendance: dashboardStats.classAttendance,
      }));
      if (summaryCacheKey) {
        localStorage.setItem(
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
      }
      // animate KPI targets
      setLastUpdated(new Date());
      setInitialDataReady(true);
      animateNumber(setAnimatedStudents, dashboardStats.studentsCount, 600);
      animateNumber(setAnimatedAttendance, currentAttendanceAvg, 600);

      // compute grade average from a limited sample to keep live updates fast
      try {
        const all = await db.getAllAssessments(schoolId);
        const limited = all.slice(-300);
        const studentScores: Record<string, { total: number; count: number }> =
          {};
        limited.forEach((a: any) => {
          if (!studentScores[a.studentId])
            studentScores[a.studentId] = { total: 0, count: 0 };
          const score = a.total ?? calculateTotalScore(a);
          studentScores[a.studentId].total += score;
          studentScores[a.studentId].count += 1;
        });
        const avgs = Object.values(studentScores).map((s) =>
          s.count > 0 ? s.total / s.count : 0,
        );
        const overallAvg =
          avgs.length > 0
            ? Math.round(avgs.reduce((a, b) => a + b, 0) / avgs.length)
            : 0;
        animateNumber(setAnimatedGradeAvg, overallAvg, 600);
      } catch (e) {
        console.error("Failed to compute grade avg", e);
      }
      // compute this-week vs last-week attendance in background
      computeWeekComparison().catch((e) => console.error(e));
      // refresh visualizations in background as well
      fetchVisualizations().catch((e: any) =>
        console.error("Failed to compute visuals", e),
      );
    } catch (e) {
      console.error("Failed to fetch live stats", e);
    }
  };

  // Aggregate assessment data for advanced visualizations
  const fetchVisualizations = async () => {
    try {
      if (!schoolId) return;
      const all = await db.getAllAssessments(schoolId);
      const students = await db.getStudents(schoolId);

      // Structures
      const perClassSubject: Record<
        string,
        Record<string, { total: number; count: number }>
      > = {};
      const perClassTotals: Record<string, { total: number; count: number }> =
        {};
      const perClassGrades: Record<string, Record<string, number>> = {};
      const perClassTimeline: Record<string, { date: number; avg: number }[]> =
        {};

      // Map student -> class for fallback
      const studentToClass = new Map(
        students.map((s: any) => [s.id, s.classId]),
      );

      all.forEach((a: any) => {
        const classId =
          a.classId || studentToClass.get(a.studentId) || "unknown";
        const subject = a.subject || "General";
        const score = a.total ?? calculateTotalScore(a);
        if (!perClassSubject[classId]) perClassSubject[classId] = {};
        if (!perClassSubject[classId][subject])
          perClassSubject[classId][subject] = { total: 0, count: 0 };
        perClassSubject[classId][subject].total += score;
        perClassSubject[classId][subject].count += 1;

        if (!perClassTotals[classId])
          perClassTotals[classId] = { total: 0, count: 0 };
        perClassTotals[classId].total += score;
        perClassTotals[classId].count += 1;

        // grade buckets
        const avgForAssessment = score; // we treat each assessment score as sample
        const grade = (() => {
          if (avgForAssessment >= 80) return "A";
          if (avgForAssessment >= 65) return "B";
          if (avgForAssessment >= 50) return "C";
          if (avgForAssessment >= 35) return "D";
          return "F";
        })();
        if (!perClassGrades[classId])
          perClassGrades[classId] = { A: 0, B: 0, C: 0, D: 0, F: 0 };
        perClassGrades[classId][grade] =
          (perClassGrades[classId][grade] || 0) + 1;

        // timeline: use assessment date or createdAt else fallback to now
        const when = a.date
          ? new Date(a.date).getTime()
          : a.createdAt
            ? new Date(a.createdAt).getTime()
            : Date.now();
        if (!perClassTimeline[classId]) perClassTimeline[classId] = [];
        perClassTimeline[classId].push({ date: when, avg: score });
      });

      // Build heatmap avg per subject
      const heat: Record<string, Record<string, number>> = {};
      Object.entries(perClassSubject).forEach(([cls, subjects]) => {
        heat[cls] = {};
        Object.entries(subjects).forEach(([subj, val]) => {
          heat[cls][subj] = Math.round(val.total / Math.max(1, val.count));
        });
      });

      // comparative per-class averages
      const comp = Object.entries(perClassTotals)
        .map(([cls, v]) => ({
          className: CLASSES_LIST.find((c) => c.id === cls)?.name || cls,
          avg: Math.round(v.total / Math.max(1, v.count)),
        }))
        .sort((a, b) => b.avg - a.avg);

      // prepare sparklines: sort timeline and take last 8 points averaged into buckets
      const sparks: Record<string, number[]> = {};
      Object.entries(perClassTimeline).forEach(([cls, points]) => {
        const sorted = points.sort((a, b) => a.date - b.date);
        // reduce to up to 8 points evenly
        const n = 8;
        const bucketSize = Math.max(1, Math.ceil(sorted.length / n));
        const arr: number[] = [];
        for (let i = 0; i < sorted.length; i += bucketSize) {
          const slice = sorted.slice(i, i + bucketSize);
          const avg = Math.round(
            slice.reduce((s, p) => s + p.avg, 0) / slice.length,
          );
          arr.push(avg);
        }
        // pad to length n
        while (arr.length < n) arr.unshift(arr[0] ?? 0);
        sparks[cls] = arr.slice(-n);
      });

      setHeatmapData(heat);
      setComparativeData(comp);
      setGradeDistributionByClass(perClassGrades);
      setSparklines(sparks);
    } catch (e) {
      console.error("Error fetching visualizations", e);
    }
  };

  // Helper: animate numeric value from current to target over duration (ms)
  const animateNumber = (
    setter: (v: number) => void,
    target: number,
    duration = 500,
  ) => {
    const start = Date.now();
    const from = 0;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const v = Math.round(from + (target - from) * t);
      setter(v);
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

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

    if (summaryCacheKey) {
      const cachedSummary = localStorage.getItem(summaryCacheKey);
      if (cachedSummary) {
        try {
          const parsed = JSON.parse(cachedSummary);
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
          localStorage.removeItem(summaryCacheKey);
        }
      }
    }

    fetchSummary().catch((e) => console.error(e));
    if (!cachedHeavy) {
      fetchHeavyData().catch((e) => console.error(e));
    } else {
      fetchHeavyData({ background: true }).catch((e) => console.error(e));
    }
  }, [
    schoolLoading,
    schoolId,
    fetchSummary,
    fetchHeavyData,
    summaryCacheKey,
    cachedHeavy,
  ]);

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
    const configRef = doc(firestore, "settings", schoolId);
    const unsubAttendance = onSnapshot(attendanceRef, () => {
      // Keep this lightweight — update class attendance and counters
      fetchStats().catch((e) =>
        console.error("Error refreshing stats on attendance change", e),
      );
    });
    const unsubAssessments = onSnapshot(assessmentsRef, () => {
      // Keep this lightweight to avoid full dashboard refetch on every update
      fetchStats().catch((e) =>
        console.error("Error refreshing stats on assessments change", e),
      );
    });
    const unsubTeacherAttendance = onSnapshot(teacherAttendanceRef, () => {
      fetchStats().catch((e) =>
        console.error("Error refreshing stats on teacher attendance change", e),
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
        }));
      }
    });
    return () => {
      unsubAttendance();
      unsubAssessments();
      unsubConfig();
      unsubTeacherAttendance();
    };
  }, [schoolId]);

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
      }
    }, STATS_POLL_INTERVAL_MS);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [realTimeEnabled]);

  useEffect(() => {
    return () => {
      if (heavyRefreshTimerRef.current) {
        clearTimeout(heavyRefreshTimerRef.current);
        heavyRefreshTimerRef.current = null;
      }
    };
  }, []);

  // Update `now` every second while we have a lastUpdated timestamp (for "Xs ago" freshness)
  useEffect(() => {
    if (!lastUpdated) return;
    // tick immediately so UI shows up-to-date seconds
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [lastUpdated]);

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
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-shadow min-h-[140px]">
      <div className="flex justify-between items-start z-10">
        <div>
          <p className="text-slate-500 text-sm font-semibold uppercase tracking-wider">
            {title}
          </p>
          <h3 className="text-3xl font-bold text-slate-800 mt-2">{value}</h3>
          {subtext && <p className="text-xs text-slate-400 mt-1">{subtext}</p>}
        </div>
      </div>
      {/* KPI Row removed from StatCard - KPI cards will be shown in a separate standalone card */}
      <div
        className={`absolute -right-4 -bottom-4 opacity-10 pointer-events-none transform group-hover:scale-110 transition-transform ${iconColorClass}`}
      >
        <Icon size={100} />
      </div>
    </div>
  );

  const KPICard = ({ title, value, suffix, delta, deltaPositive }: any) => (
    <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-400 uppercase font-semibold">
            {title}
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-800">{value}</span>
            {suffix && <span className="text-sm text-slate-500">{suffix}</span>}
          </div>
        </div>
        <div
          className={`text-sm font-semibold px-2 py-1 rounded ${deltaPositive ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}
        >
          {delta ?? "--"}
        </div>
      </div>
    </div>
  );

  // Standalone KPI container to avoid embedding KPIs inside StatCard
  const KPIRowContainer = () => (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPICard
          title="Students Enrolled"
          value={animatedStudents}
          suffix="total"
          delta={null}
          deltaPositive={true}
        />
        <KPICard
          title="Attendance Now"
          value={`${animatedAttendance}%`}
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
          value={`${animatedGradeAvg}%`}
          suffix={null}
          delta={null}
          deltaPositive={true}
        />
      </div>
    </div>
  );

  // Polished, responsive Student enrollment card (replaces Students StatCard)
  const StudentEnrollCard = () => (
    <div className="bg-gradient-to-br from-amber-50 to-amber-100 p-6 rounded-2xl shadow-md border border-amber-200 flex flex-col justify-between min-h-[140px] overflow-hidden">
      <div className="flex items-start justify-between gap-4 min-w-0">
        <div>
          <p className="text-xs font-semibold uppercase text-amber-700">
            Students Enrolled
          </p>
          <h3 className="text-3xl sm:text-4xl font-extrabold text-amber-900 mt-2">
            {stats.students}
          </h3>
          <p className="text-sm text-amber-700 mt-1">
            {stats.classes} classes • {stats.teachers} teachers
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-white p-3 rounded-xl shadow-sm hidden sm:flex">
            <GraduationCap className="text-amber-600" size={28} />
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-6">
          <div className="text-center">
            <div className="text-xs text-slate-500">Female</div>
            <div className="text-lg font-bold text-[#0B4A82]">
              {stats.femaleStudents}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-slate-500">Male</div>
            <div className="text-lg font-bold text-amber-600">
              {stats.maleStudents}
            </div>
          </div>
        </div>

        <div className="hidden sm:flex items-end gap-2 flex-1 max-w-[55%] overflow-hidden">
          {stats.classAttendance.slice(0, 8).map((c) => (
            <div key={c.id} className="flex-1 flex flex-col items-center">
              <div
                className="w-full rounded-sm"
                title={`${c.className}: ${c.percentage}%`}
                style={{
                  background:
                    c.percentage >= 80
                      ? "#16a34a"
                      : c.percentage < 50
                        ? "#dc2626"
                        : "#f59e0b",
                  height: `${Math.max(6, Math.round(c.percentage / 2))}px`,
                }}
              />
              <div className="text-[10px] text-slate-500 mt-1 truncate text-center">
                {c.className
                  .replace("Primary ", "P")
                  .replace("Class ", "P")
                  .replace("Nursery ", "N")}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="text-xs text-slate-500">
          Updated{" "}
          {lastUpdated
            ? `${Math.floor((now - lastUpdated.getTime()) / 1000)}s ago`
            : "—"}
        </div>
        <div className="text-xs text-slate-400 hidden sm:block">
          Responsive • Clean • Insightful
        </div>
      </div>
    </div>
  );

  // Polished, responsive Teacher / Staff card
  const TeacherStaffCard = () => {
    const avgStudentsPerTeacher =
      stats.teachers > 0 ? Math.round(stats.students / stats.teachers) : "—";
    return (
      <div className="bg-gradient-to-br from-sky-50 to-sky-100 p-6 rounded-2xl shadow-md border border-sky-200 flex flex-col justify-between min-h-[140px]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-sky-700">
              Teachers & Staff
            </p>
            <h3 className="text-3xl sm:text-4xl font-extrabold text-sky-900 mt-2">
              {stats.teachers}
            </h3>
            <p className="text-sm text-sky-700 mt-1">
              Teaching across {stats.classes} classes
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="bg-white p-3 rounded-xl shadow-sm hidden sm:flex">
              <Users className="text-sky-600" size={28} />
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-6">
            <div className="text-center">
              <div className="text-xs text-slate-500">
                Avg Students / Teacher
              </div>
              <div className="text-lg font-bold text-sky-800">
                {avgStudentsPerTeacher}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-slate-500">Classes</div>
              <div className="text-lg font-bold text-sky-800">
                {stats.classes}
              </div>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-3">
            <Link
              to="/admin/teachers"
              className="text-xs bg-white px-3 py-1 rounded-md font-medium text-sky-700 shadow-sm hover:underline"
            >
              Manage Staff
            </Link>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            Updated{" "}
            {lastUpdated
              ? `${Math.floor((now - lastUpdated.getTime()) / 1000)}s ago`
              : "—"}
          </div>
          <div className="text-xs text-slate-400 hidden sm:block">
            Professional • Accessible • Responsive
          </div>
        </div>
      </div>
    );
  };

  const GenderDonut = () => {
    const total = stats.maleStudents + stats.femaleStudents || 1;
    const malePct = Math.round((stats.maleStudents / total) * 100);
    const femalePct = Math.round((stats.femaleStudents / total) * 100);

    return (
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 h-full flex flex-col justify-center items-center">
        <h3 className="font-bold text-slate-800 w-full mb-6">Demographics</h3>
        <div className="relative w-48 h-48">
          <div className="absolute inset-0 rounded-full border-8 border-slate-50"></div>
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: `conic-gradient(#1160A8 0% ${femalePct}%, #f59e0b ${femalePct}% 100%)`,
              mask: "radial-gradient(transparent 60%, black 61%)",
              WebkitMask: "radial-gradient(transparent 60%, black 61%)",
            }}
          ></div>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-3xl font-bold text-slate-800">
              {stats.students}
            </span>
            <span className="text-xs text-slate-500 uppercase tracking-wide">
              Total
            </span>
          </div>
        </div>
        <div className="flex w-full justify-between px-6 mt-8">
          <div className="text-center">
            <p className="text-xs text-slate-400 mb-1">Female</p>
            <p className="text-xl font-bold text-[#0B4A82]">{femalePct}%</p>
            <p className="text-lg font-bold text-[#1160A8] mt-1">
              {stats.femaleStudents}
            </p>
          </div>
          <div className="w-px bg-slate-100"></div>
          <div className="text-center">
            <p className="text-xs text-slate-400 mb-1">Male</p>
            <p className="text-xl font-bold text-amber-500">{malePct}%</p>
            <p className="text-lg font-bold text-amber-600 mt-1">
              {stats.maleStudents}
            </p>
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        {/* Grade Distribution Chart (Enhanced) */}
        <div className="lg:col-span-2 bg-white p-4 sm:p-6 rounded-2xl shadow-md border border-slate-100 overflow-x-auto">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 sm:mb-6 gap-3 sm:gap-0">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-[#E6F0FA] rounded-xl">
                <BarChart2 className="w-6 h-6 text-[#0B4A82]" />
              </div>
              <div>
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
              className="flex items-center px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
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

            <div className="mt-4 p-4 bg-gradient-to-r from-emerald-50 to-[#E6F0FA] rounded-lg text-sm text-slate-700 border border-slate-100">
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
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
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

  const showSkeletons = summaryLoading || !initialDataReady;

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
      {/* Top Welcome Section */}
      <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            Welcome{user?.fullName ? `, ${user.fullName}` : ""}
          </h1>
          <p className="text-slate-500 mt-1">
            Here is what's happening in your school today.
          </p>
          <div className="mt-2 text-xs text-slate-500 flex items-center gap-2">
            {isRefreshing || heavyLoading ? (
              <span className="inline-flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                Refreshing data…
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                Data up to date
              </span>
            )}
          </div>
        </div>

        {/* Term and Actions */}
        <div className="flex items-center gap-4">
          <div className="text-right mr-2 hidden sm:block">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Academic Period
            </p>
            <p className="text-sm font-bold text-[#0B4A82]">
              {schoolConfig.currentTerm} &bull; {schoolConfig.academicYear}
            </p>
          </div>

          <div className="flex gap-3">
            <Link
              to="/admin/students"
              className="flex items-center px-4 py-2 bg-[#0B4A82] text-white rounded-lg hover:bg-[#0B4A82] transition-colors shadow-sm text-sm font-medium"
            >
              <UserPlus size={16} className="mr-2" />
              Add Student
            </Link>
            <Link
              to="/admin/teachers"
              className="flex items-center px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors shadow-sm text-sm font-medium"
            >
              <Users size={16} className="mr-2" />
              Add Staff
            </Link>
          </div>

          {/* Live Metrics Toggle */}
          <div className="ml-4 flex flex-col items-end text-right">
            <div className="flex items-center gap-2">
              <span
                className={`w-3 h-3 rounded-full ${realTimeEnabled ? "bg-emerald-500" : "bg-slate-300"}`}
                aria-hidden
              ></span>
              <button
                onClick={() => setRealTimeEnabled((v) => !v)}
                className="text-xs text-slate-600 hover:underline"
                title="Toggle live metrics polling"
              >
                {realTimeEnabled ? "Live Metrics On" : "Enable Live Metrics"}
              </button>
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {lastUpdated
                ? `Updated ${Math.floor((now - lastUpdated.getTime()) / 1000)}s ago`
                : "Not updated"}
            </div>
          </div>
        </div>
      </div>

      {vacationBanner && (
        <div className="mb-8">
          <div className="rounded-2xl border border-sky-200 bg-gradient-to-r from-sky-50 via-white to-blue-50 p-6 shadow-sm">
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

      {subscriptionCountdown && (
        <div className="mb-8">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-[#0B4A82] text-white">
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
                      {subscriptionCountdown.planEndsAt.toLocaleDateString()}
                    </span>
                    . Renew before the end date to avoid interruption.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="px-4 py-2 rounded-full text-sm font-semibold bg-[#0B4A82] text-white">
                  Subscription ends
                </div>
                <div className="px-4 py-2 rounded-2xl bg-slate-50 border border-slate-200 text-slate-700">
                  <div className="text-xs uppercase text-slate-400">
                    Countdown
                  </div>
                  <div className="text-lg font-bold">
                    {subscriptionCountdown.days}d {subscriptionCountdown.hours}h{" "}
                    {subscriptionCountdown.minutes}m{" "}
                    {subscriptionCountdown.seconds}s
                  </div>
                </div>
                <Link
                  to="/admin/billing"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[#0B4A82] text-white rounded-lg text-sm font-medium hover:bg-[#1160A8] transition-colors"
                >
                  <Wallet size={16} />
                  Renew Now
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {trialCountdown && (
        <div className="mb-8">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-6 shadow-sm">
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
                      {trialCountdown.planEndsAt.toLocaleDateString()}
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
                    {trialCountdown.days}d {trialCountdown.hours}h{" "}
                    {trialCountdown.minutes}m {trialCountdown.seconds}s
                  </div>
                </div>
                <Link
                  to="/admin/billing"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[#0B4A82] text-white rounded-lg text-sm font-medium hover:bg-[#1160A8] transition-colors"
                >
                  <Wallet size={16} />
                  Upgrade Plan
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {graceCountdown && (
        <div className="mb-8">
          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-6 shadow-sm">
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
                    Your subscription has ended. You have a one-week window to
                    renew before access is paused.
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Grace ends on{" "}
                    {graceCountdown.graceEndsAt.toLocaleDateString()}.
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
                    {graceCountdown.days}d {graceCountdown.hours}h{" "}
                    {graceCountdown.minutes}m {graceCountdown.seconds}s
                  </div>
                </div>
                <Link
                  to="/admin/billing"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[#0B4A82] text-white rounded-lg text-sm font-medium hover:bg-[#0B4A82] transition-colors"
                >
                  <Wallet size={16} />
                  Go to Billing
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mb-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
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
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
                target="_blank"
                rel="noreferrer"
              >
                WhatsApp
              </a>
              <a
                href="tel:+233201008784"
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#0B4A82] text-white rounded-lg text-sm font-medium hover:bg-[#1160A8] transition-colors"
              >
                Call Support
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Missed Attendance Alerts */}
      {missedAttendanceAlerts.length > 0 && (
        <div className="mb-8">
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
                  {missedAttendanceAlerts.length !== 1 ? "s" : ""} have missed
                  attendance recently.
                </p>
              </div>
            </div>
            <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
              {missedAttendanceAlerts.map((alert: any) => (
                <div
                  key={`${alert.teacherId}-${alert.date}`}
                  className="bg-white p-4 rounded-lg border border-red-100 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                        <span className="text-sm font-bold text-red-600">
                          {alert.teacherName.charAt(0)}
                        </span>
                      </div>
                      <div>
                        <p className="font-semibold text-slate-800">
                          {alert.teacherName}
                        </p>
                        <p className="text-sm text-slate-500">
                          {alert.classes}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-red-700">
                        Missed:{" "}
                        {(() => {
                          const parts = alert.date.split("-");
                          if (parts.length === 3) {
                            return `${parts[1]}/${parts[2]}/${parts[0]}`;
                          }
                          return alert.date;
                        })()}
                      </p>
                      <p className="text-xs text-slate-400">Please follow up</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Missed Student Attendance Alerts */}
      {missedStudentAttendanceAlerts.length > 0 && (
        <div className="mb-8">
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
                  {missedStudentAttendanceAlerts.length !== 1 ? "s" : ""} have
                  not marked student attendance recently.
                </p>
              </div>
            </div>
            <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
              {missedStudentAttendanceAlerts.map((alert: any) => (
                <div
                  key={`${alert.teacherId}-${alert.date}`}
                  className="bg-white p-4 rounded-lg border border-blue-100 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <span className="text-sm font-bold text-blue-700">
                          {alert.teacherName.charAt(0)}
                        </span>
                      </div>
                      <div>
                        <p className="font-semibold text-slate-800">
                          {alert.teacherName}
                        </p>
                        <p className="text-sm text-slate-500">
                          {alert.className}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-blue-700">
                        Missed for:{" "}
                        {(() => {
                          const parts = alert.date.split("-");
                          if (parts.length === 3) {
                            return `${parts[1]}/${parts[2]}/${parts[0]}`;
                          }
                          return alert.date;
                        })()}
                      </p>
                      <p className="text-xs text-slate-400">
                        Action may be required
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">
          Overview
        </h2>
        {(summaryLoading || isRefreshing) && <SectionLoadingBadge />}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
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
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">
            Live KPIs
          </h2>
          {(summaryLoading || isRefreshing) && <SectionLoadingBadge />}
        </div>
        {showSkeletons ? (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
        {(heavyLoading || isRefreshing) && <SectionLoadingBadge />}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
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
        <div className="h-96">
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
        {(heavyLoading || isRefreshing) && <SectionLoadingBadge />}
      </div>
      <PerformanceSection />

      {/* Bottom Section: Recent Students & Notices */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Recent Students Table */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 overflow-visible">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center">
            <div>
              <h3 className="font-bold text-slate-800">New Admissions</h3>
              <p className="text-xs text-slate-500">Recently added students</p>
            </div>
            {(heavyLoading || isRefreshing) && <SectionLoadingBadge />}
            <Link
              to="/admin/students"
              className="text-sm text-[#0B4A82] hover:text-[#0B4A82] font-medium bg-[#E6F0FA] px-3 py-1 rounded-full transition-colors"
            >
              View All
            </Link>
          </div>
          <div className="overflow-x-auto overflow-y-visible">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-slate-700 font-semibold">
                <tr>
                  <th className="px-6 py-3">Student Name</th>
                  <th className="px-6 py-3">Assigned Class</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentStudents.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-slate-400">
                      No students yet.
                    </td>
                  </tr>
                ) : (
                  recentStudents.map((s, i) => (
                    <tr
                      key={s.id}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-6 py-4 font-medium text-slate-800 flex items-center">
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
                      <td className="px-6 py-4">
                        <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 text-xs font-semibold border border-slate-200">
                          {CLASSES_LIST.find((c) => c.id === s.classId)?.name}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5"></span>
                          Active
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
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
                                <Eye size={14} className="mr-2" /> View Details
                              </button>
                              <button
                                onClick={() => handleEditStudent(s)}
                                className="flex items-center w-full px-4 py-2.5 text-xs text-slate-700 hover:bg-slate-50 hover:text-[#1160A8] font-medium transition-colors"
                              >
                                <Edit size={14} className="mr-2" /> Edit Student
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
          </div>
        </div>

        {/* Notice Board Widget */}
        <div className="bg-gradient-to-br from-[#0B4A82] to-[#0B4A82] rounded-2xl shadow-lg border border-[#0B4A82] overflow-hidden flex flex-col text-white self-start">
          <div className="p-6 border-b border-[#0B4A82] flex justify-between items-center">
            <div>
              <h3 className="font-bold text-[#E6F0FA]">Notice Board</h3>
              <p className="text-xs text-slate-300">School announcements</p>
            </div>
            {(heavyLoading || isRefreshing) && (
              <SectionLoadingBadge label="Refreshing" />
            )}
            <Link
              to="/admin/settings"
              className="p-2 rounded-lg hover:bg-white/10 text-slate-300 transition-colors"
            >
              <Settings size={18} />
            </Link>
          </div>
          <div className="p-4 space-y-4 flex-1 overflow-y-auto max-h-[400px]">
            {notices.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-slate-400">
                <Calendar size={40} className="mb-2 opacity-20" />
                <p className="text-sm">No new notices</p>
              </div>
            ) : (
              notices.map((n, i) => (
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
          <div className="p-4 bg-slate-900/50 text-center">
            <Link
              to="/admin/timetable"
              className="text-xs font-semibold text-amber-400 hover:text-amber-300 uppercase tracking-wide flex items-center justify-center w-full"
            >
              View Calendar <ArrowUpRight size={12} className="ml-1" />
            </Link>
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
              {(heavyLoading || isRefreshing) && <SectionLoadingBadge />}
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
                    <span className="text-[10px] text-amber-700">
                      Approve to confirm attendance
                    </span>
                  </div>
                  <div className="space-y-2">
                    {pendingTeacherAttendance.map((record) => (
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
                            className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1 text-[10px] font-semibold text-white hover:bg-emerald-700"
                          >
                            Yes
                          </button>
                          <button
                            onClick={() =>
                              handleRejectTeacherAttendance(record)
                            }
                            className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-3 py-1 text-[10px] font-semibold text-white hover:bg-rose-700"
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
                  {teacherAttendance.map((record) => (
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
                              {record.teacherClasses || "No classes assigned"}
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
                {(heavyLoading || isRefreshing) && <SectionLoadingBadge />}
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
                      Term statistics will appear as teachers mark attendance
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {teacherTermStats.map((stat: any) => (
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
                                {stat.presentDays} present / {stat.totalDays}{" "}
                                total days
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    <div className="text-center mt-3 pt-2 border-t border-[#E6F0FA]">
                      <p className="text-[10px] text-[#0B4A82] font-medium">
                        Average attendance:{" "}
                        {teacherTermStats.length > 0
                          ? Math.round(
                              teacherTermStats.reduce(
                                (sum: number, stat: any) =>
                                  sum + stat.attendanceRate,
                                0,
                              ) / teacherTermStats.length,
                            )
                          : 0}
                        %
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
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
