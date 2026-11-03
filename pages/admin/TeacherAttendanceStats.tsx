import React, { useState, useEffect, useMemo } from "react";
import Layout from "../../components/Layout";
import { db } from "../../services/mockDb";
import {
  TeacherAttendanceAnalytics,
  UserRole,
  TeacherAttendanceRecord,
  User,
} from "../../types";
import { useSchool } from "../../context/SchoolContext";
import {
  parseSchoolDate,
  collectHolidayDateKeys,
} from "../../services/schoolCalendar";
import {
  Calendar,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  CheckCircle,
  User as UserIcon,
  Users,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  XCircle,
  Search,
} from "lucide-react";
import UserAvatar from "../../components/UserAvatar";

// --- Pure KPI helpers (testable without React) ---

export function countActiveTeachers(users: User[]): number {
  return users.filter(
    (u) =>
      u.role === UserRole.TEACHER &&
      (u.status === "active" || u.status === "trial_active"),
  ).length;
}

export function deduplicateByTeacherId(
  records: TeacherAttendanceRecord[],
): TeacherAttendanceRecord[] {
  return Array.from(
    new Map(records.map((r) => [r.teacherId, r])).values(),
  );
}

export function dedupeTeacherAttendanceByTeacherDate(
  records: TeacherAttendanceRecord[],
): TeacherAttendanceRecord[] {
  const approvalRank = (status?: string) => {
    switch (status) {
      case "approved":
        return 0;
      case "rejected":
        return 1;
      case "pending":
        return 2;
      default:
        return 3;
    }
  };

  const recordsByTeacherDate = new Map<string, TeacherAttendanceRecord[]>();

  records.filter(Boolean).forEach((record) => {
    const dateKey = String(record.date || "").trim();
    const teacherKey = String(record.teacherId || "").trim();
    if (!dateKey) return;
    const dedupeKey = teacherKey ? `${teacherKey}|${dateKey}` : record.id;
    const existing = recordsByTeacherDate.get(dedupeKey) || [];
    existing.push(record);
    recordsByTeacherDate.set(dedupeKey, existing);
  });

  return Array.from(recordsByTeacherDate.values()).map((group) => {
    return [...group].sort((a, b) => {
      const rankDiff =
        approvalRank(a.approvalStatus) - approvalRank(b.approvalStatus);
      if (rankDiff !== 0) return rankDiff;

      const aTime =
        (a as any).approvedAt ||
        (a as any).rejectedAt ||
        (a as any).createdAt ||
        0;
      const bTime =
        (b as any).approvedAt ||
        (b as any).rejectedAt ||
        (b as any).createdAt ||
        0;

      return bTime - aTime;
    })[0];
  });
}

export function computeSchoolOverallAttendance(
  analytics: TeacherAttendanceAnalytics[],
): number {
  const totalPresentDays = analytics.reduce(
    (sum, t) =>
      sum +
      t.monthlyBreakdown.reduce((mSum, m) => mSum + m.presentDays, 0),
    0,
  );
  const totalWorkingDaysAll = analytics.reduce(
    (sum, t) =>
      sum +
      t.monthlyBreakdown.reduce((mSum, m) => mSum + m.totalWorkingDays, 0),
    0,
  );
  return totalWorkingDaysAll > 0
    ? Math.round((totalPresentDays / totalWorkingDaysAll) * 100)
    : 0;
}

const TeacherAttendanceStats = () => {
  const { school } = useSchool();
  const schoolId = school?.id || null;
  const [analytics, setAnalytics] = useState<TeacherAttendanceAnalytics[]>([]);
  const [loading, setLoading] = useState(false);
  const [termStartDate, setTermStartDate] = useState("");
  const [vacationDate, setVacationDate] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [todaysAttendance, setTodaysAttendance] = useState<TeacherAttendanceRecord[]>([]);
  const [loadingToday, setLoadingToday] = useState(false);
  const [holidayDates, setHolidayDates] = useState<{ date: string; reason?: string }[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOption, setSortOption] = useState<"alphabetical" | "highest" | "lowest">("alphabetical");
  const [expandedTeacherIds, setExpandedTeacherIds] = useState<string[]>([]);
  const [pendingDrilldownOpen, setPendingDrilldownOpen] = useState(false);
  const [approvingPending, setApprovingPending] = useState<Set<string>>(new Set());
  const [rejectingPending, setRejectingPending] = useState<Set<string>>(new Set());

  // --- Daily Register view state ---
  const [view, setView] = useState<"overview" | "register">("overview");
  const [registerDate, setRegisterDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerRecords, setRegisterRecords] = useState<TeacherAttendanceRecord[]>([]);
  const [registerUsers, setRegisterUsers] = useState<User[]>([]);

  useEffect(() => {
    const fetchInitialData = async () => {
      setLoading(true);
      try {
        if (!schoolId) {
          setAnalytics([]);
          return;
        }
        const config = await db.getSchoolConfig(schoolId);

        if (config.schoolReopenDate && !termStartDate) {
          setTermStartDate(config.schoolReopenDate);
        }

        if (config.vacationDate && !vacationDate) {
          setVacationDate(config.vacationDate);
        }

        if (config.holidayDates && holidayDates.length === 0) {
          setHolidayDates(config.holidayDates);
        }

        const startDate = termStartDate || config.schoolReopenDate || undefined;
        const endDate = vacationDate || config.vacationDate || undefined;

        const data = await db.getTeacherAttendanceAnalytics(
          schoolId,
          startDate,
          endDate,
        );
        setAnalytics(data);
      } catch (error) {
        console.error("Error fetching teacher attendance analytics:", error);
      } finally {
        setLoading(false);
      }
    };

    const fetchUsersAndToday = async () => {
      if (!schoolId) {
        setUsers([]);
        setTodaysAttendance([]);
        return;
      }

      setLoadingToday(true);
      try {
        const allUsers = await db.getUsers(schoolId);
        setUsers(allUsers);

        const today = new Date().toISOString().split("T")[0];
        const todayRecords = await db.getAllTeacherAttendance(
          schoolId,
          today,
        );
        setTodaysAttendance(todayRecords);
      } catch (error) {
        console.error("Error fetching users or today's attendance:", error);
        setUsers([]);
        setTodaysAttendance([]);
      } finally {
        setLoadingToday(false);
      }
    };

    fetchInitialData();
    fetchUsersAndToday();
  }, [termStartDate, vacationDate, schoolId]);

  // Daily Register fetch: load teachers + their attendance for the selected date.
  useEffect(() => {
    if (view !== "register" || !schoolId) {
      setRegisterRecords([]);
      setRegisterUsers([]);
      return;
    }

    let active = true;
    const load = async () => {
      setRegisterLoading(true);
      try {
        const [teacherUsers, records] = await Promise.all([
          db.getUsers(schoolId),
          db.getAllTeacherAttendance(schoolId, registerDate),
        ]);
        if (!active) return;
        setRegisterUsers(teacherUsers);
        setRegisterRecords(records);
      } catch (error) {
        console.error("Error fetching teacher daily register:", error);
        if (!active) return;
        setRegisterUsers([]);
        setRegisterRecords([]);
      } finally {
        if (active) setRegisterLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [view, schoolId, registerDate]);

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case "improving":
        return <TrendingUp className="text-emerald-600" size={16} />;
      case "declining":
        return <TrendingDown className="text-[#0B4A82]" size={16} />;
      default:
        return <Minus className="text-slate-400" size={16} />;
    }
  };

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case "improving":
        return "text-emerald-700 bg-emerald-50 border-emerald-200";
      case "declining":
        return "text-[#0B4A82] bg-[#E6F0FA] border-[#E6F0FA]";
      default:
        return "text-slate-600 bg-slate-50 border-slate-200";
    }
  };

  const formatDisplayDate = (dateStr?: string | null): string => {
    if (!dateStr) return "Not set";
    const parsed = new Date(dateStr);
    if (Number.isNaN(parsed.getTime())) return "Not set";
    return parsed.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const formatMonthLabel = (monthKey: string): string => {
    const [year, month] = monthKey.split("-");
    const parsed = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
    if (Number.isNaN(parsed.getTime())) return monthKey;
    return parsed.toLocaleDateString("en-GB", {
      month: "long",
      year: "numeric",
    });
  };

  const todayDate = new Date().toISOString().split("T")[0];

  const activeTeacherCount = countActiveTeachers(users);

  const uniqueTodayRecords = dedupeTeacherAttendanceByTeacherDate(
    todaysAttendance,
  );

  const presentToday = uniqueTodayRecords.filter(
    (r) => r.approvalStatus === "approved" && r.status === "present",
  ).length;

  const absentToday = uniqueTodayRecords.filter(
    (r) => r.approvalStatus === "approved" && r.status === "absent",
  ).length;

  const pendingToday = uniqueTodayRecords.filter(
    (r) => r.approvalStatus === "pending",
  ).length;

  const validSubmissionTeacherIds = new Set(
    uniqueTodayRecords
      .filter(
        (r) =>
          (r.approvalStatus === "approved" &&
            (r.status === "present" || r.status === "absent")) ||
          r.approvalStatus === "pending",
      )
      .map((r) => r.teacherId),
  );

  const todayParsed = parseSchoolDate(todayDate);
  const isWeekend = todayParsed
    ? todayParsed.getDay() === 0 || todayParsed.getDay() === 6
    : false;
  const holidayKeys = collectHolidayDateKeys(holidayDates);
  const isHoliday = holidayKeys.has(todayDate);
  const isOutsideTerm =
    termStartDate && vacationDate
      ? new Date(todayDate) < new Date(termStartDate) ||
        new Date(todayDate) > new Date(vacationDate)
      : false;

  const isNonWorkingDay = isWeekend || isHoliday || isOutsideTerm;

  const pendingTodayRecords = uniqueTodayRecords.filter(
    (r) => r.approvalStatus === "pending",
  );

  const pendingPresentToday = pendingTodayRecords.filter(
    (r) => r.status === "present",
  ).length;

  const pendingAbsentToday = pendingTodayRecords.filter(
    (r) => r.status === "absent",
  ).length;

  const pendingTeacherIds = new Set(
    pendingTodayRecords.map((r) => r.teacherId),
  );

  const notSubmittedToday = isNonWorkingDay
    ? 0
    : activeTeacherCount - validSubmissionTeacherIds.size;

  const schoolOverallAttendance = computeSchoolOverallAttendance(analytics);

  const hasAttendanceData = (teacher: TeacherAttendanceAnalytics): boolean =>
    teacher.monthlyBreakdown.length > 0 &&
    teacher.monthlyBreakdown.reduce((sum, m) => sum + m.totalWorkingDays, 0) > 0;

  const getTeacherAttendanceRate = (
    teacher: TeacherAttendanceAnalytics,
  ): number | null => {
    if (!hasAttendanceData(teacher)) return null;
    const totalPresent = teacher.monthlyBreakdown.reduce(
      (sum, m) => sum + m.presentDays,
      0,
    );
    const totalWorking = teacher.monthlyBreakdown.reduce(
      (sum, m) => sum + m.totalWorkingDays,
      0,
    );
    return totalWorking > 0 ? Math.round((totalPresent / totalWorking) * 100) : null;
  };

  const filteredAndSortedTeachers = useMemo(() => {
    const trimmed = searchQuery.trim().toLowerCase();
    let list = analytics.filter((t) =>
      t.teacherName.toLowerCase().includes(trimmed),
    );

    const withData: TeacherAttendanceAnalytics[] = [];
    const withoutData: TeacherAttendanceAnalytics[] = [];

    list.forEach((t) => {
      if (hasAttendanceData(t)) {
        withData.push(t);
      } else {
        withoutData.push(t);
      }
    });

    if (sortOption === "alphabetical") {
      withData.sort((a, b) => a.teacherName.localeCompare(b.teacherName));
      withoutData.sort((a, b) => a.teacherName.localeCompare(b.teacherName));
    } else if (sortOption === "highest") {
      withData.sort(
        (a, b) =>
          (getTeacherAttendanceRate(b) || 0) -
          (getTeacherAttendanceRate(a) || 0),
      );
    } else if (sortOption === "lowest") {
      withData.sort(
        (a, b) =>
          (getTeacherAttendanceRate(a) || 0) -
          (getTeacherAttendanceRate(b) || 0),
      );
    }

    return [...withData, ...withoutData];
  }, [analytics, searchQuery, sortOption]);

  const expandedSet = new Set(expandedTeacherIds);

  const isExpanded = (teacherId: string): boolean => expandedSet.has(teacherId);

  const toggleExpanded = (teacherId: string): void => {
    setExpandedTeacherIds((prev) => {
      if (prev.includes(teacherId)) {
        return prev.filter((id) => id !== teacherId);
      }
      return [...prev, teacherId];
    });
  };

  const approvePending = async (
    record: TeacherAttendanceRecord,
  ): Promise<void> => {
    if (!schoolId) return;
    setApprovingPending((prev) => new Set([...prev, record.teacherId]));
    try {
      await db.approveTeacherAttendance(
        schoolId,
        record.id,
        school?.id || "",
        { teacherId: record.teacherId, date: record.date },
      );
      setTodaysAttendance((prev) =>
        prev.map((r) =>
          r.id === record.id
            ? { ...r, approvalStatus: "approved" as const }
            : r,
        ),
      );
      setPendingDrilldownOpen(false);
    } catch (error) {
      console.error("Error approving attendance:", error);
    } finally {
      setApprovingPending((prev) => {
        const next = new Set(prev);
        next.delete(record.teacherId);
        return next;
      });
    }
  };

  const rejectPending = async (
    record: TeacherAttendanceRecord,
  ): Promise<void> => {
    if (!schoolId) return;
    setRejectingPending((prev) => new Set([...prev, record.teacherId]));
    try {
      await db.rejectTeacherAttendance(
        schoolId,
        record.id,
        school?.id || "",
        { teacherId: record.teacherId, date: record.date },
      );
      setTodaysAttendance((prev) =>
        prev.map((r) =>
          r.id === record.id
            ? { ...r, approvalStatus: "rejected" as const }
            : r,
        ),
      );
      setPendingDrilldownOpen(false);
    } catch (error) {
      console.error("Error rejecting attendance:", error);
    } finally {
      setRejectingPending((prev) => {
        const next = new Set(prev);
        next.delete(record.teacherId);
        return next;
      });
    }
  };

  // --- Daily Register helpers ---
  const registerParsed = parseSchoolDate(registerDate);
  const registerIsWeekend = registerParsed
    ? registerParsed.getDay() === 0 || registerParsed.getDay() === 6
    : false;
  const registerHolidayKeys = collectHolidayDateKeys(holidayDates);
  const registerIsHoliday = registerHolidayKeys.has(registerDate);
  const registerIsOutsideTerm =
    termStartDate && vacationDate
      ? new Date(registerDate) < new Date(termStartDate) ||
        new Date(registerDate) > new Date(vacationDate)
      : false;
  const registerIsNonWorkingDay =
    registerIsWeekend || registerIsHoliday || registerIsOutsideTerm;

  const uniqueRegisterRecords = dedupeTeacherAttendanceByTeacherDate(
    registerRecords,
  );

  const registerPresentCount = uniqueRegisterRecords.filter(
    (r) => r.approvalStatus === "approved" && r.status === "present",
  ).length;

  const registerAbsentCount = uniqueRegisterRecords.filter(
    (r) => r.approvalStatus === "approved" && r.status === "absent",
  ).length;

  const registerPendingCount = uniqueRegisterRecords.filter(
    (r) => r.approvalStatus === "pending",
  ).length;

  const registerValidTeacherIds = new Set(
    uniqueRegisterRecords
      .filter(
        (r) =>
          (r.approvalStatus === "approved" &&
            (r.status === "present" || r.status === "absent")) ||
          r.approvalStatus === "pending",
      )
      .map((r) => r.teacherId),
  );

  const registerNotSubmittedCount = registerIsNonWorkingDay
    ? 0
    : activeTeacherCount - registerValidTeacherIds.size;

  const shiftDate = (days: number) => {
    const current = new Date(registerDate);
    current.setDate(current.getDate() + days);
    setRegisterDate(current.toISOString().split("T")[0]);
  };

  const goToday = () =>
    setRegisterDate(new Date().toISOString().split("T")[0]);

  return (
    <Layout title="Teacher Attendance Analytics">
      <div
        className="bg-white rounded-xl shadow-sm border border-slate-100 flex flex-col md:h-[calc(100vh-8rem)] overflow-y-auto"
        data-assistant-focus="teacher-attendance"
      >
        {/* Header & Filters */}
        <div
          className="p-4 sm:p-6 border-b border-slate-100 flex flex-col lg:flex-row justify-between lg:items-center gap-4 bg-slate-50"
        >
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold text-slate-800">
                Teacher Attendance Overview
              </h3>
            </div>

            <div className="flex flex-wrap gap-3 sm:gap-4 w-full sm:w-auto">
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 min-w-[140px] sm:min-w-auto">
                <div className="flex items-center gap-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">
                    Term Start
                  </label>
                  <input
                    type="date"
                    className="border border-slate-300 rounded-md px-2.5 py-1.5 text-sm w-full sm:w-44 bg-white text-slate-900"
                    value={termStartDate}
                    onChange={(e) => setTermStartDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 min-w-[140px] sm:min-w-auto">
                <div className="flex items-center gap-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">
                    Vacation
                  </label>
                  <input
                    type="date"
                    className="border border-slate-300 rounded-md px-2.5 py-1.5 text-sm w-full sm:w-44 bg-white text-slate-900"
                    value={vacationDate}
                    onChange={(e) => setVacationDate(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 w-full justify-end sm:justify-start">
            <div
              className="flex items-center gap-2 text-xs font-medium text-slate-600 bg-white px-3 py-1.5 rounded-full border border-slate-200 shadow-sm"
            >
              <TrendingUp size={12} className="text-emerald-600" /> Improving
            </div>
            <div
              className="flex items-center gap-2 text-xs font-medium text-slate-600 bg-white px-3 py-1.5 rounded-full border border-slate-200 shadow-sm"
            >
              <Minus size={12} className="text-slate-400" /> Stable
            </div>
            <div
              className="flex items-center gap-2 text-xs font-medium text-slate-600 bg-white px-3 py-1.5 rounded-full border border-slate-200 shadow-sm"
            >
              <TrendingDown size={12} className="text-slate-400" /> Declining
            </div>

            {/* Overview / Daily Register toggle */}
            <div className="inline-flex rounded-md border border-slate-300 bg-white p-0.5 shadow-sm">
              <button
                type="button"
                onClick={() => setView("overview")}
                className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded transition-colors whitespace-nowrap ${
                  view === "overview"
                    ? "bg-[#0B4A82] text-white"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <TrendingUp size={13} />
                <span>Overview</span>
              </button>
              <button
                type="button"
                onClick={() => setView("register")}
                className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded transition-colors whitespace-nowrap ${
                  view === "register"
                    ? "bg-[#0B4A82] text-white"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Calendar size={13} />
                <span>Daily Register</span>
              </button>
            </div>
          </div>
        </div>

        {/* Daily Register View */}
        {view === "register" && (
          <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
            {/* Date Navigation */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 mb-3 sm:mb-0">
                <button
                  onClick={() => shiftDate(-1)}
                  disabled={registerLoading}
                  aria-label="Previous day"
                  className="flex items-center justify-center w-8 h-8 rounded-md text-slate-700 hover:bg-slate-100 disabled:opacity-50 transition-colors"
                >
                  <ChevronLeft size={14} />
                </button>
                <div className="relative flex-1 sm:w-auto min-w-[140px]">
                  <input
                    type="date"
                    value={registerDate}
                    onChange={(e) => setRegisterDate(e.target.value)}
                    className="border border-slate-300 rounded-md px-2.5 py-1.5 text-sm bg-white text-slate-900 focus:border-[#0B4A82] focus:ring-2 focus:ring-[#E6F0FA] outline-none w-full"
                  />
                </div>
                <button
                  onClick={() => shiftDate(1)}
                  disabled={registerLoading}
                  aria-label="Next day"
                  className="flex items-center justify-center w-8 h-8 rounded-md text-slate-700 hover:bg-slate-100 disabled:opacity-50 transition-colors"
                >
                  <ChevronRight size={14} />
                </button>
              </div>

              <div className="flex justify-center">
                <button
                  onClick={goToday}
                  disabled={registerLoading}
                  className="text-xs font-semibold text-slate-700 hover:text-[#0B4A82] px-2.5 py-1.5 border border-slate-300 rounded-md bg-white hover:bg-[#E6F0FA] disabled:opacity-50 transition-colors shadow-sm"
                >
                  Today
                </button>
              </div>

              {registerIsNonWorkingDay ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-sm font-medium mt-3 sm:mt-0 sm:ml-auto">
                  <AlertTriangle size={14} /> Non-working day
                </div>
              ) : null}
            </div>

            {/* Register Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
              <div
                className={`bg-white rounded-xl border border-slate-200 p-4 sm:p-6 shadow-sm min-h-[140px] ${
                  registerLoading ? "opacity-70" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Total Teachers
                    </p>
                    <p className="text-2xl font-bold text-slate-800">
                      {activeTeacherCount}
                    </p>
                  </div>
                  <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                    <Users size={20} />
                  </div>
                </div>
              </div>

              <div
                className={`bg-white rounded-xl border border-emerald-200 p-4 sm:p-6 shadow-sm ${
                  registerLoading ? "opacity-70" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">
                      Present
                    </p>
                    <p className="text-2xl font-bold text-emerald-700">
                      {registerIsNonWorkingDay
                        ? "Non-working day"
                        : registerPresentCount}
                    </p>
                  </div>
                  <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
                    <CheckCircle size={20} />
                  </div>
                </div>
              </div>

              <div
                className={`bg-white rounded-xl border border-rose-200 p-4 sm:p-6 shadow-sm ${
                  registerLoading ? "opacity-70" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-rose-700 uppercase tracking-wide">
                      Absent
                    </p>
                    <p className="text-2xl font-bold text-rose-700">
                      {registerIsNonWorkingDay
                        ? "Non-working day"
                        : registerAbsentCount}
                    </p>
                  </div>
                  <div className="p-2 bg-rose-50 rounded-lg text-rose-600">
                    <AlertTriangle size={20} />
                  </div>
                </div>
              </div>

              <div
                className={`bg-white rounded-xl border border-amber-200 p-4 sm:p-6 shadow-sm ${
                  registerLoading ? "opacity-70" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
                      Pending
                    </p>
                    <p className="text-2xl font-bold text-amber-700">
                      {registerIsNonWorkingDay
                        ? "Non-working day"
                        : registerPendingCount}
                    </p>
                  </div>
                  <div className="p-2 bg-amber-50 rounded-lg text-amber-600">
                    <Clock size={20} />
                  </div>
                </div>
              </div>

              <div
                className={`bg-white rounded-xl border border-slate-200 p-4 sm:p-6 shadow-sm min-h-[140px] ${
                  registerLoading ? "opacity-70" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-slate-800 uppercase tracking-wide">
                      Not Submitted
                    </p>
                    <p className="text-2xl font-bold text-slate-800">
                      {registerIsNonWorkingDay
                        ? "Non-working day"
                        : registerNotSubmittedCount}
                    </p>
                  </div>
                  <div className="p-2 bg-slate-50 rounded-lg text-slate-600">
                    <UserIcon size={20} />
                  </div>
                </div>
              </div>
            </div>

            {/* Teacher Daily Register Table */}
            <div className="flex-1 min-h-0 overflow-auto">
              {registerLoading ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                  <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-3 animate-pulse">
                    <Clock size={28} className="text-slate-400" />
                  </div>
                  <span className="text-sm font-medium">Loading daily register...</span>
                </div>
              ) : registerIsNonWorkingDay ? (
                <div className="p-6 sm:p-10 text-center flex-1 flex flex-col items-center justify-center">
                  <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mb-4">
                    <AlertTriangle className="text-amber-500" size={28} />
                  </div>
                  <h3 className="text-lg font-semibold text-amber-800">
                    Non-working day
                  </h3>
                  <p className="text-sm text-slate-500 mt-1 max-w-xs">
                    {registerDate} is a weekend, holiday, or outside the term dates.
                    No teacher attendance is expected for this date.
                  </p>
                </div>
              ) : (
                <div className="overflow-auto">
                  <table className="w-full text-left text-sm text-slate-600">
                    <thead className="bg-slate-100 text-slate-700 font-semibold border-b-2 border-slate-200">
                      <tr>
                        <th className="px-4 py-2.5 min-w-[200px]">
                          <span className="uppercase tracking-wide text-[11px]">Teacher</span>
                        </th>
                        <th className="px-4 py-2.5 text-center">
                          <span className="uppercase tracking-wide text-[11px]">Status</span>
                        </th>
                        <th className="px-4 py-2.5 text-center">
                          <span className="uppercase tracking-wide text-[11px]">Approval</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {registerUsers.filter(
                        (u) => u.role === UserRole.TEACHER &&
                          (u.status === "active" || u.status === "trial_active"),
                      ).length === 0 ? (
                        <tr>
                          <td colSpan={3} className="p-12 text-center text-slate-400">
                            <div className="flex flex-col items-center gap-2">
                              <Users size={32} className="text-slate-300" />
                              <span>No teachers found.</span>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        registerUsers
                          .filter(
                            (u) =>
                              u.role === UserRole.TEACHER &&
                              (u.status === "active" || u.status === "trial_active"),
                          )
                          .map((teacher) => {
                            const record = uniqueRegisterRecords.find(
                              (r) => r.teacherId === teacher.id,
                            );
                            const isPresent = record
                              ? record.status === "present"
                              : false;
                            const isPending = record
                              ? record.approvalStatus === "pending"
                              : false;
                            const isRejected = record
                              ? record.approvalStatus === "rejected"
                              : false;
                            const isApproved = record
                              ? record.approvalStatus === "approved"
                              : false;

                            return (
                              <tr
                                key={teacher.id}
                                className="hover:bg-slate-50/80 transition-colors border-b border-slate-100 last:border-0 group"
                              >
                                <td className="px-4 py-2.5">
                                  <div className="flex items-center gap-3">
                                    <UserAvatar
                                      user={{
                                        name: teacher.fullName,
                                        photoUrl: teacher.photoUrl,
                                      }}
                                      size="md"
                                      className="ring-2 ring-white shadow-sm transition-transform group-hover:scale-105"
                                    />
                                    <div className="min-w-0">
                                      <p className="font-semibold text-slate-800 text-sm">
                                        {teacher.fullName}
                                      </p>
                                      <p className="text-xs text-slate-500">
                                        Teacher ID: {teacher.id}
                                      </p>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-2.5 text-center">
                                  {!record ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border border-slate-200 text-slate-400 bg-slate-50">
                                      Not Submitted
                                    </span>
                                  ) : (
                                    <span
                                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${
                                        isPresent
                                          ? "border-emerald-200 text-emerald-700 bg-emerald-50"
                                          : "border-rose-200 text-rose-700 bg-rose-50"
                                      }`}
                                    >
                                      {isPresent ? "Present" : "Absent"}
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5 text-center">
                                  {!record ? (
                                    <span className="text-[10px] text-slate-400">-</span>
                                  ) : isPending ? (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">
                                      Pending
                                    </span>
                                  ) : isRejected ? (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-700 border border-rose-200">
                                      Rejected
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200">
                                      Approved
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Overview View */}
        {view === "overview" && (
          <>
            {/* School-wide KPI Cards */}
            <div className="p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <div
                className={`bg-white rounded-xl border border-slate-200 p-4 sm:p-6 shadow-sm min-h-[140px] ${
                  loadingToday ? "opacity-70" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Active Teachers
                    </p>
                    <p className="text-2xl font-bold text-slate-800">
                      {activeTeacherCount}
                    </p>
                  </div>
                  <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                    <Users size={20} />
                  </div>
                </div>
              </div>

              <div
                className={`bg-white rounded-xl border border-slate-200 p-4 sm:p-6 shadow-sm min-h-[140px] ${
                  loadingToday ? "opacity-70" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Present Today
                    </p>
                    <p
                      className={`text-2xl font-bold ${
                        isNonWorkingDay
                          ? "text-slate-400"
                          : "text-emerald-700"
                      }`}
                    >
                      {isNonWorkingDay ? "Non-working day" : presentToday}
                    </p>
                  </div>
                  <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
                    <CheckCircle size={20} />
                  </div>
                </div>
              </div>

              <div
                className={`bg-white rounded-xl border border-slate-200 p-4 sm:p-6 shadow-sm min-h-[140px] ${
                  loadingToday ? "opacity-70" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Absent Today
                    </p>
                    <p
                      className={`text-2xl font-bold ${
                        isNonWorkingDay
                          ? "text-slate-400"
                          : "text-rose-700"
                      }`}
                    >
                      {isNonWorkingDay ? "Non-working day" : absentToday}
                    </p>
                  </div>
                  <div className="p-2 bg-rose-50 rounded-lg text-rose-600">
                    <AlertTriangle size={20} />
                  </div>
                </div>
              </div>

              <div
                onClick={() => setPendingDrilldownOpen(!pendingDrilldownOpen)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setPendingDrilldownOpen(!pendingDrilldownOpen);
                  }
                }}
                className={`bg-white rounded-xl border border-slate-200 p-4 sm:p-6 shadow-sm min-h-[140px] cursor-pointer ${
                  loadingToday ? "opacity-70" : ""
                } ${pendingDrilldownOpen ? "border-amber-200 ring-1 ring-amber-100" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Pending Today
                    </p>
                    <p
                      className={`text-2xl font-bold ${
                        isNonWorkingDay
                          ? "text-slate-400"
                          : "text-amber-700"
                      }`}
                    >
                      {isNonWorkingDay ? "Non-working day" : pendingToday}
                    </p>
                    {pendingToday > 0 && !isNonWorkingDay && (
                      <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700"
                        >
                          {pendingPresentToday} Present
                        </span>
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700"
                        >
                          {pendingAbsentToday} Absent
                        </span>
                      </p>
                    )}
                  </div>
                  <div className="p-2 bg-amber-50 rounded-lg text-amber-600">
                    <Clock size={20} />
                    {pendingDrilldownOpen ? (
                      <ChevronUp size={16} className="mt-1 text-amber-600" />
                    ) : (
                      <ChevronDown size={16} className="mt-1 text-amber-600" />
                    )}
                  </div>
                </div>
              </div>

              <div
                className={`bg-white rounded-xl border border-slate-200 p-4 sm:p-6 shadow-sm min-h-[140px] ${
                  loadingToday ? "opacity-70" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Not Submitted
                    </p>
                    <p
                      className={`text-2xl font-bold ${
                        isNonWorkingDay
                          ? "text-slate-400"
                          : "text-slate-800"
                      }`}
                    >
                      {isNonWorkingDay ? "Non-working day" : notSubmittedToday}
                    </p>
                  </div>
                  <div className="p-2 bg-slate-50 rounded-lg text-slate-600">
                    <UserIcon size={20} />
                  </div>
                </div>
              </div>

              <div
                className={`bg-white rounded-xl border border-slate-200 p-4 sm:p-6 shadow-sm min-h-[140px] ${
                  loadingToday ? "opacity-70" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Overall Attendance
                    </p>
                    <p className="text-2xl font-bold text-slate-800">
                      {schoolOverallAttendance}%
                    </p>
                  </div>
                  <div className="p-2 bg-[#0B4A82]/10 rounded-lg text-[#0B4A82]">
                    <Calendar size={20} />
                  </div>
                </div>
              </div>
            </div>

            {/* Pending Drilldown */}
            {pendingToday > 0 && !isNonWorkingDay && pendingDrilldownOpen && (
              <div className="p-4 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-semibold text-slate-800">
                    Pending Attendance Requests
                  </h4>
                  <button
                    onClick={() => setPendingDrilldownOpen(false)}
                    className="text-xs font-medium text-slate-600 hover:text-slate-800 underline"
                  >
                    Close
                  </button>
                </div>
                <div className="space-y-3">
                  {pendingTodayRecords.map((record) => {
                    const teacher = users.find((u) => u.id === record.teacherId);
                    const isPresent = record.status === "present";
                    const isApproving = approvingPending.has(record.teacherId);
                    const isRejecting = rejectingPending.has(record.teacherId);
                    return (
                      <div
                        key={record.id}
                        className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <UserAvatar
                              user={{
                                name: teacher?.fullName || "Unknown Teacher",
                                photoUrl: teacher?.photoUrl,
                              }}
                              size="md"
                              className="shrink-0"
                            />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-800">
                                {teacher?.fullName || "Unknown Teacher"}
                              </p>
                              <p className="text-xs text-slate-500">
                                Teacher ID: {record.teacherId}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span
                              className={`text-xs font-bold px-2 py-0.5 rounded ${
                                isPresent
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-rose-100 text-rose-700"
                              }`}
                            >
                              {isPresent ? "Present" : "Absent"}
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => approvePending(record)}
                                disabled={isApproving || isRejecting}
                                className={`text-xs font-medium px-3 py-1.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors`}
                              >
                                {isApproving ? "Approving..." : "Approve"}
                              </button>
                              <button
                                onClick={() => rejectPending(record)}
                                disabled={isApproving || isRejecting}
                                className={`text-xs font-medium px-3 py-1.5 rounded border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors`}
                              >
                                {isRejecting ? "Rejecting..." : "Reject"}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Content */}
            <div className="flex-1 min-h-0 p-0">
              {loading ? (
                <div className="text-center py-20 text-slate-400">
                  Analyzing Teacher Attendance Data...
                </div>
              ) : (
                <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
                  {/* Search & Sort Controls */}
                  <div
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                  >
                    <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 w-full sm:w-auto">
                      <div className="relative flex-1 sm:w-80">
                        <Search
                          size={16}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                        />
                        <input
                          type="text"
                          placeholder="Search teachers by name..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="border border-slate-300 rounded-md px-3 py-2 pl-9 text-sm w-full bg-white text-slate-900 focus:ring-2 focus:ring-[#0B4A82] outline-none"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:block">
                          Sort by
                        </label>
                        <select
                          value={sortOption}
                          onChange={(e) =>
                            setSortOption(
                              e.target.value as
                                | "alphabetical"
                                | "highest"
                                | "lowest",
                            )
                          }
                          className="border border-slate-300 rounded-md px-3 py-2 text-sm bg-white text-slate-900 focus:ring-2 focus:ring-[#0B4A82] outline-none"
                        >
                          <option value="alphabetical">Name A–Z</option>
                          <option value="highest">Highest Attendance</option>
                          <option value="lowest">Lowest Attendance</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {filteredAndSortedTeachers.length === 0 && (
                    <div className="text-center py-20 text-slate-400">
                      {searchQuery.trim() !== ""
                        ? "No teachers match your search."
                        : "No teacher attendance data found."}
                    </div>
                  )}

                  {filteredAndSortedTeachers.map((teacher) => {
                    const expanded = isExpanded(teacher.teacherId);
                    return (
                      <div
                        key={teacher.teacherId}
                        className="bg-slate-50 rounded-xl p-4 sm:p-6 border border-slate-200"
                      >
                        <button
                          onClick={() => toggleExpanded(teacher.teacherId)}
                          aria-expanded={expanded}
                          aria-label={`Expand attendance details for ${teacher.teacherName}`}
                          className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between w-full"
                        >
                          <div className="flex min-w-0 items-start gap-3 sm:gap-4">
                            <UserAvatar
                              user={{
                                ...teacher,
                                name: teacher.teacherName,
                                photoUrl: teacher.photoUrl,
                              }}
                              size="lg"
                              className="shrink-0 shadow-lg border-2 border-[#E6F0FA]"
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <h3 className="text-lg sm:text-xl font-bold text-slate-800 break-words">
                                  {teacher.teacherName}
                                </h3>
                                {expanded ? (
                                  <ChevronUp
                                    size={16}
                                    className="text-slate-400"
                                  />
                                ) : (
                                  <ChevronDown
                                    size={16}
                                    className="text-slate-400"
                                  />
                                )}
                                {pendingTeacherIds.has(teacher.teacherId) && (
                                  <span
                                    className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 ml-1"
                                  >
                                    Pending
                                  </span>
                                )}
                              </div>
                              <div className="mt-1 flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
                                <div className="flex items-center gap-2 min-w-0">
                                  <Calendar size={14} className="text-slate-500" />
                                  <span className="text-xs sm:text-sm text-slate-600 break-words">
                                    {formatDisplayDate(teacher.termStartDate)} -{" "}
                                    {formatDisplayDate(teacher.vacationDate)}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <CheckCircle
                                    size={14}
                                    className="text-emerald-600"
                                  />
                                  <div className="flex flex-col gap-1">
                                    <span className="text-sm font-semibold text-emerald-700">
                                      {teacher.overallAttendance}%
                                    </span>
                                    <span className="text-xs text-slate-500">
                                      Overall Attendance
                                    </span>
                                    <span className="text-xs text-slate-500">
                                      {teacher.monthlyBreakdown.reduce(
                                        (sum, m) => sum + m.presentDays,
                                        0,
                                      )} / {teacher.monthlyBreakdown.reduce(
                                        (sum, m) => sum + m.totalWorkingDays,
                                        0,
                                      )} working days
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </button>

                        {expanded && (
                          <div className="mt-4 space-y-4">
                            {/* Monthly Breakdown */}
                            <div className="space-y-3">
                              <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
                                Monthly Attendance Breakdown
                              </h4>
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {teacher.monthlyBreakdown.map((month) => (
                                  <div
                                    key={month.month}
                                    className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm"
                                  >
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="font-semibold text-slate-800">
                                        {formatMonthLabel(month.month)}
                                      </span>
                                      {getTrendIcon(month.trend)}
                                    </div>

                                    <div className="space-y-2">
                                      <div className="flex justify-between text-sm">
                                        <span className="text-slate-600">
                                          Working Days:
                                        </span>
                                        <span className="font-medium">
                                          {month.totalWorkingDays}
                                        </span>
                                      </div>
                                      <div className="flex justify-between text-sm">
                                        <span className="text-slate-600">Present:</span>
                                        <span className="font-medium text-emerald-700">
                                          {month.presentDays}
                                        </span>
                                      </div>
                                      <div className="flex justify-between text-sm">
                                        <span className="text-slate-600">Absent:</span>
                                        <span className="font-medium text-rose-600">
                                          {month.absentDays}
                                        </span>
                                      </div>

                                      {/* Attendance Rate Bar */}
                                      <div className="mt-3">
                                        <div className="flex justify-between items-center mb-1">
                                          <span className="text-xs text-slate-500">
                                            Attendance Rate
                                          </span>
                                          <span
                                            className={`text-xs font-bold px-2 py-0.5 rounded ${getTrendColor(month.trend)}`}
                                          >
                                            {month.attendanceRate}%
                                          </span>
                                        </div>
                                        <div className="w-full bg-slate-200 rounded-full h-2">
                                          <div
                                            className={`h-2 rounded-full transition-all duration-500 ${
                                              month.attendanceRate >= 90
                                                ? "bg-emerald-500"
                                                : month.attendanceRate >= 70
                                                  ? "bg-amber-400"
                                                  : "bg-[#1160A8]"
                                            }`}
                                            style={{
                                              width: `${month.attendanceRate}%`,
                                            }}
                                          ></div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Critical Alert for Low Attendance */}
                            {teacher.overallAttendance < 70 && (
                              <div className="mt-4 bg-[#E6F0FA] border border-[#E6F0FA] rounded-lg p-4 flex items-center gap-3">
                                <AlertTriangle className="text-[#0B4A82]" size={20} />
                                <div>
                                  <p className="text-sm font-semibold text-[#0B4A82]">
                                    Critical Attendance Alert
                                  </p>
                                  <p className="text-xs text-[#1160A8]">
                                    This teacher has below 70% overall attendance
                                    and may need intervention.
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
};

export default TeacherAttendanceStats;
