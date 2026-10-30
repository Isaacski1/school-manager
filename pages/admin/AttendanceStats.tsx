import React, { useState, useEffect, useMemo } from "react";
import Layout from "../../components/Layout";
import { db } from "../../services/mockDb";
import { CLASSES_LIST } from "../../constants";
import { useSchoolClasses } from "../../hooks/useSchoolClasses";
import { Student, AttendanceRecord, SchoolConfig } from "../../types";
import {
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  Users,
  TrendingUp,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Info,
  XCircle,
} from "lucide-react";
import UserAvatar from "../../components/UserAvatar";
import { useSchool } from "../../context/SchoolContext";
import {
  collectHolidayDateKeys,
  getExpectedSchoolDayKeys,
  parseSchoolDate,
  formatSchoolDateKey,
} from "../../services/schoolCalendar";

interface StudentAttendanceStats {
  id: string;
  name: string;
  gender: string;
  photoUrl?: string;
  presentDays: number;
  absentDays: number;
  totalDays: number;
  percentage: number;
}

const getLocalDateString = (value: Date = new Date()) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;

type DayClassification =
  | "school-day"
  | "weekend"
  | "holiday"
  | "vacation"
  | "before-reopening"
  | "invalid";

const getDayClassification = (
  dateStr: string,
  config: SchoolConfig | null,
): { type: DayClassification; reason?: string } => {
  if (!config) return { type: "invalid" };
  const parsed = parseSchoolDate(dateStr);
  if (!parsed) return { type: "invalid" };

  const dayOfWeek = parsed.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) return { type: "weekend" };

  const adminHoliday = (config.holidayDates || []).find(
    (h) => h.date === dateStr,
  );
  if (adminHoliday) return { type: "holiday", reason: adminHoliday.reason };

  const vacationStart = parseSchoolDate(config.vacationDate);
  if (vacationStart && parsed > vacationStart) {
    const nextTermStart = parseSchoolDate(config.nextTermBegins);
    if (!nextTermStart || parsed < nextTermStart) {
      return { type: "vacation" };
    }
  }

  const reopen = parseSchoolDate(config.schoolReopenDate);
  if (reopen && parsed < reopen) return { type: "before-reopening" };

  return { type: "school-day" };
};

const formatDisplayDate = (dateStr: string): string => {
  const parsed = parseSchoolDate(dateStr);
  if (!parsed) return dateStr;
  return parsed.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const formatWeekday = (dateStr: string): string => {
  const parsed = parseSchoolDate(dateStr);
  if (!parsed) return "";
  return parsed.toLocaleDateString("en-GB", { weekday: "long" });
};

const AttendanceStats = () => {
  const { school } = useSchool();
  const schoolId = school?.id || null;
  const { classes: availableClasses } = useSchoolClasses();
  const [selectedClass, setSelectedClass] = useState(
    availableClasses[0]?.id || "c_p1",
  );
  const [stats, setStats] = useState<StudentAttendanceStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [termTotalDays, setTermTotalDays] = useState(0);

  // UI-only controls. They operate purely on the already-calculated `stats`
  // array and never trigger a Firestore request.
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "excellent" | "average" | "critical"
  >("all");
  const [sort, setSort] = useState<
    "name" | "highest" | "lowest" | "mostAbsent"
  >("name");

  // Two views inside the Admin Attendance page: Overview (existing) and a
  // read-only Daily Register. Both reuse the same AttendanceRecord schema.
  const [view, setView] = useState<"overview" | "register">("overview");
  const [registerDate, setRegisterDate] = useState(getLocalDateString());
   const [registerLoading, setRegisterLoading] = useState(false);
  const [registerRecord, setRegisterRecord] =
    useState<AttendanceRecord | null>(null);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registerConfig, setRegisterConfig] = useState<SchoolConfig | null>(
    null,
  );
  const [registerStudents, setRegisterStudents] = useState<Student[]>([]);

  // Changing the selected class must reset the UI controls so a filter from
  // the previous class cannot unexpectedly hide students in the new class.
  useEffect(() => {
    setSearch("");
    setStatusFilter("all");
    setSort("name");
  }, [selectedClass]);

  // Daily Register data fetch. Reuses the existing getAttendance() method and
  // the existing school-calendar classification. Read-only: no writes.
  // Students are fetched here (not in the child) so the existing students
  // query on class change is reused, avoiding a duplicate fetch and guaranteeing
  // that switching classes refreshes the displayed students consistently.
  useEffect(() => {
    if (!schoolId) {
      setRegisterRecord(null);
      setRegisterConfig(null);
      return;
    }
    if (view !== "register") return;

    let active = true;
    const load = async () => {
      setRegisterLoading(true);
      setRegisterError(null);
      try {
        const [config, record, students] = await Promise.all([
          db.getSchoolConfig(schoolId),
          db.getAttendance(schoolId, selectedClass, registerDate),
          db.getStudents(schoolId, selectedClass),
        ]);
        if (!active) return;
        setRegisterConfig(config);
        setRegisterRecord(record ?? null);
        setRegisterStudents(students);
      } catch (error) {
        console.error("Error fetching daily register:", error);
        if (!active) return;
        setRegisterError("Unable to load attendance for this date.");
      } finally {
        if (active) setRegisterLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [view, schoolId, selectedClass, registerDate]);

  useEffect(() => {
    const fetchAttendance = async () => {
      setLoading(true);
      try {
        if (!schoolId) {
          setStats([]);
          setTermTotalDays(0);
          return;
        }

        // 1. Get Students in Class
        const students = await db.getStudents(schoolId, selectedClass);

        // 2. Get School Config to calculate total school days
        const config = await db.getSchoolConfig(schoolId);

        // 3. Calculate expected school days from reopen date up to vacation end (zipped with admin holidays, weekends, and leave days).
        const attendanceRecords = await db.getClassAttendance(
          schoolId,
          selectedClass,
        );

        const holidayKeys = collectHolidayDateKeys([
          ...attendanceRecords.filter((r) => r.isHoliday).map((r) => r.date),
          ...(config.holidayDates || []),
        ]);

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const vacationDate = config.vacationDate
          ? new Date(`${config.vacationDate}T00:00:00`)
          : null;
        const endDate =
          vacationDate && vacationDate < today ? vacationDate : today;

        const expectedSchoolDays = getExpectedSchoolDayKeys({
          reopenDate: config.schoolReopenDate,
          endDate,
          holidayDates: Array.from(holidayKeys),
          vacationDate: config.vacationDate,
          nextTermBegins: config.nextTermBegins,
        });

        const expectedSchoolDaySet = new Set(expectedSchoolDays);
        const totalSchoolDays = expectedSchoolDays.length;

        setTermTotalDays(totalSchoolDays);

        // 4. Get all attendance records for this class
        const attendanceRecordsForStats = attendanceRecords;

        // 5. Build a lookup per student by expected school day date (dedupe by date)
        const studentDatePresent = new Map<string, Set<string>>();

        for (const record of attendanceRecordsForStats) {
          if (record.isHoliday) continue;
          if (!expectedSchoolDaySet.has(record.date)) continue;

          const presentStudentIds = record.presentStudentIds || [];

          for (const studentId of presentStudentIds) {
            if (!studentDatePresent.has(studentId)) {
              studentDatePresent.set(studentId, new Set());
            }
            studentDatePresent.get(studentId)?.add(record.date);
          }
        }

        // 5. Calculate Stats for each student
        const calculatedStats = students.map((student) => {
          const presentCount = studentDatePresent.get(student.id)?.size || 0;
          // Absent days are derived from the same expected-school-day set:
          // absent = totalDays - presentDays. This is NOT a new attendance
          // record; it is the existing implicit absent count made visible.
          const absentCount = Math.max(0, totalSchoolDays - presentCount);

          const pct =
            totalSchoolDays === 0
              ? 0
              : Math.round((presentCount / totalSchoolDays) * 100);

          return {
            id: student.id,
            name: student.name,
            gender: student.gender,
            photoUrl: student.photoUrl,
            presentDays: presentCount,
            absentDays: absentCount,
            totalDays: totalSchoolDays,
            percentage: pct,
          };
        });

        // Sort by name
        calculatedStats.sort((a, b) => a.name.localeCompare(b.name));
        setStats(calculatedStats);
      } catch (error) {
        console.error("Error fetching attendance stats:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAttendance();
  }, [selectedClass, schoolId]);

  // Summary metrics are derived from the same `stats` array rendered in the
  // student table. This guarantees the cards can never diverge from the
  // table: there is exactly one calculation source, and no second fetch.
  const summary = useMemo(() => {
    const totalStudents = stats.length;
    const criticalStudents = stats.filter((s) => s.percentage < 50).length;
    const averageAttendance =
      totalStudents === 0
        ? 0
        : Math.round(
            stats.reduce((sum, s) => sum + s.percentage, 0) / totalStudents,
          );
    return {
      totalStudents,
      criticalStudents,
      averageAttendance,
    };
  }, [stats]);

  // The displayed list is derived from the authoritative `stats` array only.
  // Search, status filter and sort are client-side and compose in order:
  // search -> status filter -> sort. They never mutate `stats` and never
  // trigger a Firestore request. The summary cards above intentionally keep
  // using the unfiltered `stats` so they always describe the whole class.
  const displayedStats = useMemo(() => {
    const query = search.trim().toLowerCase();
    const source = stats.filter((s) => {
      if (query && !s.name.toLowerCase().includes(query)) {
        return false;
      }
      if (statusFilter === "excellent" && s.percentage < 90) {
        return false;
      }
      if (statusFilter === "average" && (s.percentage < 50 || s.percentage >= 90)) {
        return false;
      }
      if (statusFilter === "critical" && s.percentage >= 50) {
        return false;
      }
      return true;
    });

    const sorted = [...source].sort((a, b) => {
      switch (sort) {
        case "highest":
          if (b.percentage !== a.percentage) return b.percentage - a.percentage;
          return a.name.localeCompare(b.name);
        case "lowest":
          if (a.percentage !== b.percentage) return a.percentage - b.percentage;
          return a.name.localeCompare(b.name);
        case "mostAbsent":
          if (b.absentDays !== a.absentDays) return b.absentDays - a.absentDays;
          return a.name.localeCompare(b.name);
        case "name":
        default:
          return a.name.localeCompare(b.name);
      }
    });

    return sorted;
  }, [stats, search, statusFilter, sort]);

  return (
    <Layout title="Attendance Statistics">
      <div data-assistant-focus="attendance-summary" className="bg-white rounded-xl shadow-sm border border-slate-100 flex flex-col overflow-y-auto h-auto md:h-[calc(100vh-8rem)]">
        {/* Header & Filters */}
        <div className="p-3 sm:p-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                Select Class
              </label>
              <select
                className="border border-slate-300 rounded-md px-3 py-1.5 text-sm w-full sm:w-44 bg-white text-slate-900 shadow-sm focus:border-[#0B4A82] focus:ring-2 focus:ring-[#E6F0FA] outline-none transition"
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
              >
                {availableClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 shadow-sm flex items-center gap-2">
              <div className="w-8 h-8 rounded-md bg-[#E6F0FA] flex items-center justify-center">
                <Calendar size={16} className="text-[#0B4A82]" />
              </div>
              <div>
                <span className="block text-xs text-slate-400 uppercase font-semibold">
                  Term Total Days
                </span>
                <span className="font-bold text-base text-slate-800 leading-tight">
                  {termTotalDays}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-md border border-slate-300 bg-white p-0.5 text-xs font-semibold shadow-sm">
              <button
                type="button"
                onClick={() => setView("overview")}
                className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded transition-colors whitespace-nowrap ${
                  view === "overview"
                    ? "bg-[#0B4A82] text-white"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <TrendingUp size={14} />
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
                <Calendar size={14} />
                <span>Daily Register</span>
              </button>
            </div>

            <div className="hidden md:flex flex-wrap gap-2">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-600 bg-white px-2.5 py-1.5 rounded-full border border-slate-200 shadow-sm">
                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>{" "}
                Excellent (90%+)
              </div>
              <div className="flex items-center gap-2 text-xs font-medium text-slate-600 bg-white px-2.5 py-1.5 rounded-full border border-slate-200 shadow-sm">
                <div className="w-2 h-2 rounded-full bg-amber-400"></div>{" "}
                Average (50-89%)
              </div>
              <div className="flex items-center gap-2 text-xs font-bold text-[#0B4A82] bg-[#E6F0FA] px-2.5 py-1.5 rounded-full border border-[#E6F0FA] shadow-sm">
                <AlertTriangle size={11} className="text-[#0B4A82]" /> Critical (&lt;50%)
              </div>
            </div>
          </div>
        </div>

        {view === "overview" ? (
          <>

        {/* Summary Cards */}
        <div className="p-4 sm:p-6 border-b border-slate-100 bg-slate-50/70">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="group bg-white border border-slate-200 rounded-xl px-4 py-4 shadow-sm hover:shadow-md hover:border-[#E6F0FA] transition-all">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center group-hover:bg-[#E6F0FA] transition">
                  <Users size={18} className="text-slate-500 group-hover:text-[#0B4A82] transition" />
                </div>
              </div>
              <p className="text-2xl font-bold text-slate-800">
                {summary.totalStudents}
              </p>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mt-1">
                Total Students
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {summary.totalStudents === 0
                  ? "No students in this class"
                  : "Students in selected class"}
              </p>
            </div>

            <div className="group bg-white border border-slate-200 rounded-xl px-4 py-4 shadow-sm hover:shadow-md hover:border-emerald-200 transition-all">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                  <TrendingUp size={18} className="text-emerald-600" />
                </div>
              </div>
              <p className="text-2xl font-bold text-slate-800">
                {summary.averageAttendance}%
              </p>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mt-1">
                Average Attendance
              </p>
              <p className="text-xs text-slate-400 mt-0.5">Class average</p>
            </div>

            <div className="group bg-white border border-slate-200 rounded-xl px-4 py-4 shadow-sm hover:shadow-md hover:border-[#E6F0FA] transition-all">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-lg bg-[#E6F0FA] flex items-center justify-center">
                  <AlertTriangle
                    size={18}
                    className={
                      summary.criticalStudents > 0
                        ? "text-[#0B4A82]"
                        : "text-slate-400"
                    }
                  />
                </div>
              </div>
              <p
                className={`text-2xl font-bold ${
                  summary.criticalStudents > 0
                    ? "text-[#0B4A82]"
                    : "text-slate-800"
                }`}
              >
                {summary.criticalStudents}
              </p>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mt-1">
                Critical Attendance
              </p>
              <p className="text-xs text-slate-400 mt-0.5">Below 50%</p>
            </div>

            <div className="group bg-white border border-slate-200 rounded-xl px-4 py-4 shadow-sm hover:shadow-md hover:border-slate-300 transition-all">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                  <Calendar size={18} className="text-slate-500" />
                </div>
              </div>
              <p className="text-2xl font-bold text-slate-800">
                {termTotalDays}
              </p>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mt-1">
                Term Total Days
              </p>
              <p className="text-xs text-slate-400 mt-0.5">Expected school days</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 p-0">
          {loading ? (
            <div className="text-center py-20 text-slate-400">
              Calculating Attendance Data...
            </div>
          ) : (
<div className="w-full overflow-auto">
                {/* Search / Filter / Sort controls */}
                <div className="p-4 sm:p-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between bg-gradient-to-r from-slate-50 to-white border-b border-slate-100">
                  <div className="relative flex-1 min-w-[200px] max-w-xs">
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search students..."
                      aria-label="Search students by name"
                      className="w-full rounded-md border border-slate-300 bg-white pl-9 pr-8 py-2 text-sm text-slate-900 focus:border-[#0B4A82] focus:ring-2 focus:ring-[#E6F0FA] outline-none transition shadow-sm"
                    />
                    <svg
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <circle cx="11" cy="11" r="7" />
                      <path d="m21 21-4.3-4.3" strokeLinecap="round" />
                    </svg>
                    {search && (
                      <button
                        type="button"
                        onClick={() => setSearch("")}
                        aria-label="Clear search"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 px-1"
                      >
                        {"×"}
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex flex-col">
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                        Attendance Status
                      </label>
                      <select
                        value={statusFilter}
                        onChange={(e) =>
                          setStatusFilter(e.target.value as typeof statusFilter)
                        }
                        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0B4A82] focus:ring-2 focus:ring-[#E6F0FA] outline-none transition shadow-sm"
                      >
                        <option value="all">All</option>
                        <option value="excellent">Excellent (90%+)</option>
                        <option value="average">Average (50-89%)</option>
                        <option value="critical">Critical (&lt;50%)</option>
                      </select>
                    </div>

                    <div className="flex flex-col">
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                        Sort
                      </label>
                      <select
                        value={sort}
                        onChange={(e) => setSort(e.target.value as typeof sort)}
                        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0B4A82] focus:ring-2 focus:ring-[#E6F0FA] outline-none transition shadow-sm"
                      >
                        <option value="name">Student Name</option>
                        <option value="highest">Highest Attendance</option>
                        <option value="lowest">Lowest Attendance</option>
                        <option value="mostAbsent">Most Absent</option>
                      </select>
                    </div>
                  </div>
                </div>

              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-100 text-slate-700 font-semibold border-b-2 border-slate-200">
                  <tr>
                    <th className="px-6 py-4 min-w-[220px]">
                      <span className="uppercase tracking-wide text-[11px]">Student</span>
                    </th>
                    <th className="px-6 py-4 text-center">
                      <span className="uppercase tracking-wide text-[11px]">Present</span>
                    </th>
                    <th className="px-6 py-4 text-center">
                      <span className="uppercase tracking-wide text-[11px]">Absent</span>
                    </th>
                    <th className="px-6 py-4 text-center">
                      <span className="uppercase tracking-wide text-[11px]">School Days</span>
                    </th>
                    <th className="px-6 py-4 w-1/3">
                      <span className="uppercase tracking-wide text-[11px]">Attendance Rate</span>
                    </th>
                    <th className="px-6 py-4 text-center">
                      <span className="uppercase tracking-wide text-[11px]">Status</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stats.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="p-12 text-center text-slate-400"
                      >
                        <div className="flex flex-col items-center gap-2">
                          <Users size={32} className="text-slate-300" />
                          <span>No students found in this class.</span>
                        </div>
                      </td>
                    </tr>
                  ) : displayedStats.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="p-12 text-center text-slate-400"
                      >
                        <div className="flex flex-col items-center gap-2">
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-slate-300">
                            <circle cx="11" cy="11" r="7" />
                            <path d="m21 21-4.3-4.3" strokeLinecap="round" />
                          </svg>
                          <span>No students match your current search and filters.</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    displayedStats.map((s) => {
                      // Color Logic
                      let barColor = "bg-emerald-500";
                      let badgeColor =
                        "text-emerald-700 bg-emerald-50 border-emerald-200";
                      let statusLabel = "Excellent";
                      let rowClass = "hover:bg-slate-50";
                      let warningIcon = null;

                      if (s.percentage < 50) {
                        barColor = "bg-red-500";
                        badgeColor =
                          "text-[#0B4A82] bg-[#E6F0FA] border-[#E6F0FA]";
                        statusLabel = "Critical";
                        rowClass = "bg-[#E6F0FA]/60 hover:bg-[#E6F0FA]/80";
                        warningIcon = (
                          <span
                            title="Critical attendance — below 50%"
                          >
                            <AlertTriangle
                              size={14}
                              className="text-[#0B4A82] ml-2"
                            />
                          </span>
                        );
                      } else if (s.percentage < 90) {
                        barColor = "bg-amber-400";
                        badgeColor =
                          "text-amber-700 bg-amber-50 border-amber-200";
                        statusLabel = "Average";
                      }

                      return (
                        <tr
                          key={s.id}
                          className={`${rowClass} transition-colors border-b border-slate-100 last:border-0 group hover:bg-slate-50/80`}
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-4">
                              <UserAvatar
                                user={s}
                                size="lg"
                                className="ring-2 ring-white shadow-sm transition-transform group-hover:scale-105"
                              />
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-800 flex items-center flex-wrap gap-1">
                                  {s.name}
                                  {warningIcon}
                                </p>
                                <p className="text-xs text-slate-500">
                                  {s.gender}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-emerald-50 text-emerald-700 font-bold text-lg">
                              {s.presentDays}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-rose-50 text-rose-700 font-bold text-lg">
                              {s.absentDays}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="text-slate-500 font-medium">
                              {s.totalDays}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex-1 h-2.5 bg-slate-200 rounded-full overflow-hidden shadow-inner">
                                <div
                                  className={`h-full ${barColor} transition-all duration-500 ease-out rounded-full`}
                                  style={{ width: `${s.percentage}%` }}
                                ></div>
                              </div>
                              <span
                                className={`text-xs font-bold px-2.5 py-1 rounded border ${badgeColor} min-w-[3.5rem] text-center shadow-sm`}
                              >
                                {s.percentage}%
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span
                              className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${badgeColor}`}
                            >
                              {s.percentage < 50 ? (
                                <AlertTriangle size={12} />
                              ) : null}
                              {statusLabel}
                            </span>
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
        </>
      ) : (
        <div className="flex-1 min-h-0">
          <DailyRegister
            schoolId={schoolId}
            selectedClass={selectedClass}
            registerDate={registerDate}
            setRegisterDate={setRegisterDate}
            loading={registerLoading}
            record={registerRecord}
            config={registerConfig}
            error={registerError}
            students={registerStudents}
          />
        </div>
      )}
      </div>
    </Layout>
  );
};

interface DailyRegisterProps {
  schoolId: string | null;
  selectedClass: string;
  registerDate: string;
  setRegisterDate: (v: string) => void;
  loading: boolean;
  record: AttendanceRecord | null;
  config: SchoolConfig | null;
  error: string | null;
  students: Student[];
}

const DailyRegister: React.FC<DailyRegisterProps> = ({
  schoolId: _schoolId,
  selectedClass,
  registerDate,
  setRegisterDate,
  loading,
  record,
  config,
  error,
  students,
}) => {
  const { classes: availableClasses } = useSchoolClasses();
  const selectedClassName =
    availableClasses.find((c) => c.id === selectedClass)?.name || selectedClass;

  const shiftDate = (days: number) => {
    const parsed = parseSchoolDate(registerDate);
    if (!parsed) return;
    parsed.setDate(parsed.getDate() + days);
    setRegisterDate(formatSchoolDateKey(parsed));
  };

  const goToday = () => setRegisterDate(getLocalDateString());

  const dayType = registerDate && config
    ? getDayClassification(registerDate, config)
    : { type: "invalid" as DayClassification };

  const isSchoolDay = dayType.type === "school-day";
  const isHolidayRecord = !!record?.isHoliday;
  const hasRecord = !!record && !isHolidayRecord;
  const totalStudents = students.length;

  // Derive present/absent only on a valid school day with a non-holiday
  // record. A missing register is never treated as "all absent".
  const presentCount =
    isSchoolDay && hasRecord
      ? students.filter((s) =>
          (record?.presentStudentIds || []).includes(s.id),
        ).length
      : 0;
  const absentCount = isSchoolDay && hasRecord ? totalStudents - presentCount : 0;
  const attendanceRate =
    isSchoolDay && hasRecord && totalStudents > 0
      ? Math.round((presentCount / totalStudents) * 100)
      : 0;

  const renderStatusBadge = (studentId: string) => {
    if (isHolidayRecord) {
      return { label: "Holiday", className: "bg-blue-50 text-blue-700 border-blue-200" };
    }
    if (hasRecord) {
      const isPresent = (record?.presentStudentIds || []).includes(studentId);
      return isPresent
        ? { label: "Present", className: "bg-emerald-50 text-emerald-700 border-emerald-200" }
        : { label: "Absent", className: "bg-rose-50 text-rose-700 border-rose-200" };
    }
    return { label: "Not Recorded", className: "bg-slate-100 text-slate-500 border-slate-200" };
  };

  const dayMessage = (() => {
    switch (dayType.type) {
      case "weekend":
        return {
          title: "Weekend",
          message: "No school on weekends.",
          icon: <Calendar className="text-slate-400" size={24} />,
        };
      case "holiday":
        return {
          title: "Holiday",
          message: dayType.reason || "School is closed on this date.",
          icon: <Calendar className="text-amber-500" size={24} />,
        };
      case "vacation":
        return {
          title: "School Vacation",
          message: "The selected date falls within the vacation period.",
          icon: <Calendar className="text-slate-400" size={24} />,
        };
      case "before-reopening":
        return {
          title: "Before Reopening",
          message: "School has not reopened yet for this term.",
          icon: <Calendar className="text-slate-400" size={24} />,
        };
      default:
        return null;
    }
  })();

return (
    <div className="flex flex-col h-full min-h-0">
      {/* Register Controls */}
      <div className="p-4 sm:p-6 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white flex flex-col sm:flex-row sm:items-end gap-4">
        <div className="flex flex-col">
          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
            Selected Class
          </label>
          <div className="border border-slate-200 rounded-md px-3 py-2 text-sm w-full sm:w-48 bg-slate-100 text-slate-700 shadow-sm">
            {selectedClassName}
          </div>
        </div>

        <div className="flex flex-col">
          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
            Select Date
          </label>
          <div className="relative">
            <Calendar
              className="absolute left-3 top-2.5 w-4 h-4 text-slate-400"
              size={16}
            />
            <input
              type="date"
              value={registerDate}
              onChange={(e) => setRegisterDate(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white pl-10 pr-3 py-2 text-sm text-slate-900 focus:border-[#0B4A82] focus:ring-2 focus:ring-[#E6F0FA] outline-none transition shadow-sm"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2 sm:ml-auto">
          <div className="inline-flex rounded-md border border-slate-300 bg-white p-0.5 shadow-sm">
            <button
              onClick={() => shiftDate(-1)}
              disabled={loading}
              aria-label="Previous day"
              className="flex items-center justify-center w-9 h-9 rounded-md text-slate-700 hover:bg-slate-100 disabled:opacity-50 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => shiftDate(1)}
              disabled={loading}
              aria-label="Next day"
              className="flex items-center justify-center w-9 h-9 rounded-md text-slate-700 hover:bg-slate-100 disabled:opacity-50 transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <button
            onClick={goToday}
            disabled={loading}
            className="text-xs font-semibold text-slate-700 hover:text-[#0B4A82] px-3 py-2 border border-slate-300 rounded-md bg-white hover:bg-[#E6F0FA] disabled:opacity-50 transition-colors shadow-sm"
          >
            Today
          </button>
        </div>
      </div>

{/* Non-school-day message OR Register Summary + Table */}
      {!isSchoolDay && dayMessage ? (
        <div className="p-6 sm:p-10 text-center flex-1 flex flex-col items-center justify-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
            {dayMessage.icon}
          </div>
          <h3 className="text-lg font-semibold text-slate-800">
            {dayMessage.title}
          </h3>
          <p className="text-sm text-slate-500 mt-1 max-w-xs">
            {dayMessage.message}
          </p>
        </div>
      ) : loading ? (
        <div className="flex-1 flex flex-col items-center justify-center py-20 text-slate-400">
          <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-3 animate-pulse">
            <Clock size={28} className="text-slate-400" />
          </div>
          <span className="text-sm font-medium">Loading daily register...</span>
        </div>
      ) : error ? (
        <div className="p-6 sm:p-10 text-center flex-1 flex flex-col items-center justify-center">
          <div className="w-16 h-16 rounded-2xl bg-rose-50 flex items-center justify-center mb-4">
            <Info className="text-rose-500" size={28} />
          </div>
          <h3 className="text-lg font-semibold text-slate-800">
            Unable to load register
          </h3>
          <p className="text-sm text-slate-500 mt-1 max-w-xs">{error}</p>
        </div>
      ) : dayType.type === "school-day" && isHolidayRecord ? (
        <div className="p-6 sm:p-10 text-center flex-1 flex flex-col items-center justify-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mb-4">
            <Calendar className="text-amber-500" size={28} />
          </div>
          <h3 className="text-lg font-semibold text-slate-800">
            Holiday — No School
          </h3>
          {record?.holidayReason ? (
            <p className="text-sm text-slate-500 mt-1">
              Reason: {record.holidayReason}
            </p>
          ) : null}
        </div>
      ) : dayType.type === "school-day" && !record ? (
        <div className="p-6 sm:p-10 text-center flex-1 flex flex-col items-center justify-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
            <Clock className="text-slate-400" size={28} />
          </div>
          <h3 className="text-lg font-semibold text-slate-800">
            Attendance has not been recorded for this date.
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            {formatDisplayDate(registerDate)} was a school day, but no
            attendance register has been submitted.
          </p>
        </div>
) : (
        <div className="flex flex-col flex-1 min-h-0 h-full">
          {/* Daily Summary Cards */}
          <div className="px-4 sm:px-6 pt-4 pb-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              <div className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 shadow-sm">
                <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                  <Users size={14} />
                  <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wide">
                    Total Students
                  </span>
                </div>
                <p className="text-xl font-bold text-slate-800">
                  {totalStudents}
                </p>
              </div>
              <div className="bg-white border border-emerald-200 rounded-lg px-3 py-2.5 shadow-sm">
                <div className="flex items-center gap-1.5 text-emerald-600 mb-1">
                  <CheckCircle size={14} />
                  <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wide">
                    Present
                  </span>
                </div>
                <p className="text-xl font-bold text-emerald-700">
                  {presentCount}
                </p>
              </div>
              <div className="bg-white border border-rose-200 rounded-lg px-3 py-2.5 shadow-sm">
                <div className="flex items-center gap-1.5 text-rose-600 mb-1">
                  <XCircle size={14} />
                  <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wide">
                    Absent
                  </span>
                </div>
                <p className="text-xl font-bold text-rose-700">
                  {absentCount}
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 shadow-sm">
                <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                  <TrendingUp size={14} />
                  <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wide">
                    Attendance Rate
                  </span>
                </div>
                <p className="text-xl font-bold text-slate-800">
                  {attendanceRate}%
                </p>
              </div>
            </div>
          </div>

          {/* Student Table */}
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-100 text-slate-700 font-semibold border-b-2 border-slate-200">
                <tr>
                  <th className="px-4 py-2.5 min-w-[200px]">
                    <span className="uppercase tracking-wide text-[11px]">Student</span>
                  </th>
                  <th className="px-4 py-2.5 text-center">
                    <span className="uppercase tracking-wide text-[11px]">Attendance</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="p-12 text-center text-slate-400">
                      <div className="flex flex-col items-center gap-2">
                        <Users size={32} className="text-slate-300" />
                        <span>No students found in this class.</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  students.map((student) => {
                    const badge = renderStatusBadge(student.id);
                    return (
                      <tr
                        key={student.id}
                        className="hover:bg-slate-50/80 transition-colors border-b border-slate-100 last:border-0 group"
                      >
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-3">
                            <UserAvatar
                              user={student}
                              size="md"
                              className="ring-2 ring-white shadow-sm transition-transform group-hover:scale-105"
                            />
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-800 text-sm">
                                {student.name}
                              </p>
                              <p className="text-xs text-slate-500">
                                {student.gender}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};


export default AttendanceStats;
