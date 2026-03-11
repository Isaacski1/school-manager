import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import Layout from "../../components/Layout";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useAuth } from "../../context/AuthContext";
import { useSchool } from "../../context/SchoolContext";
import {
  CLASSES_LIST,
  CURRENT_TERM,
  ACADEMIC_YEAR,
  calculateTotalScore,
} from "../../constants";
import { db } from "../../services/mockDb";
import { firestore } from "../../services/firebase";
import {
  AttendanceRecord,
  Notice,
  PlatformBroadcast,
  TimeSlot,
  ClassTimetable,
  TeacherAttendanceRecord,
  Student,
  StudentRemark,
  StudentSkills,
  Assessment,
  SchoolConfig,
} from "../../types";
import { showToast } from "../../services/toast";
import { canAccessFeature } from "../../services/featureAccess";
import {
  ClipboardCheck,
  BookOpen,
  Clock,
  TrendingUp,
  Bell,
  X,
  Sparkles,
  Calendar,
  AlertCircle,
} from "lucide-react";
import VacationOverlay from "./VacationOverlay";
import SectionState from "./components/SectionState";
import TodayPrioritiesStrip, {
  PriorityItem,
} from "./components/TodayPrioritiesStrip";
import StudentsNeedingAttention, {
  StudentAttentionItem,
} from "./components/StudentsNeedingAttention";
import useTeacherWeekUtils from "./hooks/useTeacherWeekUtils";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const SKILLS_LIST = [
  "punctuality",
  "neatness",
  "conduct",
  "attitudeToWork",
  "classParticipation",
  "homeworkCompletion",
];

// Pre-defined remark suggestions for teachers
const REMARK_SUGGESTIONS = [
  "An outstanding performer with excellent academic progress.",
  "Shows great potential and maintains good conduct in class.",
  "Consistent effort and improvement throughout the term.",
  "Active participant in class activities and assignments.",
  "Demonstrates good leadership qualities among peers.",
  "Maintains excellent attendance and punctuality.",
  "Shows remarkable improvement in academic performance.",
  "A disciplined student who follows school rules diligently.",
  "Excellent interpersonal skills and teamwork abilities.",
  "Creative and innovative in approaching class tasks.",
];

const nurserySubjects = [
  "Language & Literacy",
  "Numeracy",
  "Environmental Studies",
  "Creative Arts",
  "Physical Development",
  "Social & Emotional Development",
  "Rhymes, Songs & Storytelling",
];

const kgSubjects = [
  "Literacy & Language",
  "Numeracy",
  "OWOP",
  "Creative Art",
  "Physical Education",
];

const primarySubjects = [
  "English Language",
  "Mathematics",
  "Science",
  "ICT",
  "Religious & Moral Education (RME)",
  "Ghanaian Language",
  "Our World Our People (OWOP)",
  "Creative Arts",
  "Physical Education",
];

const jhsSubjects = [
  "English Language",
  "Mathematics",
  "Integrated Science",
  "Social Studies",
  "Religious & Moral Education (RME)",
  "ICT",
  "French",
  "Ghanaian Language",
  "Creative Arts & Design",
  "Physical Education",
  "Career Technology",
  "Computing / Coding",
];

type SectionKey = "attendance" | "timetable" | "notices" | "analytics";

type SectionStateMap = Record<
  SectionKey,
  {
    loading: boolean;
    error: string | null;
  }
>;

type StudentSkillsDraft = Partial<StudentSkills>;

const createInitialSectionState = (): SectionStateMap => ({
  attendance: { loading: true, error: null },
  timetable: { loading: true, error: null },
  notices: { loading: true, error: null },
  analytics: { loading: true, error: null },
});

const toHolidayDateString = (
  value?: string | { date: string; reason?: string } | null,
) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.date || "";
};

const TeacherDashboard = () => {
  const { user } = useAuth();
  const schoolId = user?.schoolId || null;
  const { school } = useSchool();
  const hasFeature = (feature: any) => canAccessFeature(user, school, feature);
  const canUseExamReports = hasFeature("basic_exam_reports");
  const { getLocalDateString, getWeekDates, getWeekLabel } = useTeacherWeekUtils();

  const [subjects, setSubjects] = useState<string[]>([]);

  // Class selection for multi-class teachers
  const assignedClassIds = (user as any)?.assignedClassIds || [];
  const [selectedClassId, setSelectedClassId] = useState<string>("");

  // School Config State
  const [currentTerm, setCurrentTerm] = useState("Term 1");
  const [schoolConfig, setSchoolConfig] = useState<SchoolConfig | null>(null);
  const [isVacation, setIsVacation] = useState(false);
  const [attendanceLocked, setAttendanceLocked] = useState(false);
  const [sectionState, setSectionState] = useState<SectionStateMap>(
    createInitialSectionState,
  );
  const [refreshSeed, setRefreshSeed] = useState(0);

  useEffect(() => {
    if (!assignedClassIds.length) return;
    if (!selectedClassId || !assignedClassIds.includes(selectedClassId)) {
      setSelectedClassId(assignedClassIds[0]);
    }
  }, [assignedClassIds, selectedClassId]);

  const assignedClass = CLASSES_LIST.find((c) => c.id === selectedClassId);
  const classNames = assignedClassIds
    .map((id) => CLASSES_LIST.find((c) => c.id === id)?.name)
    .join(", ");

  const [notices, setNotices] = useState<Notice[]>([]);
  const [broadcasts, setBroadcasts] = useState<PlatformBroadcast[]>([]);

  // Teacher Attendance State
  const [teacherAttendance, setTeacherAttendance] =
    useState<TeacherAttendanceRecord | null>(null);
  const [missedAttendanceModal, setMissedAttendanceModal] = useState<{
    show: boolean;
    dates: string[];
  }>({ show: false, dates: [] });
  const [missedStudentAttendanceModal, setMissedStudentAttendanceModal] =
    useState<{ show: boolean; dates: string[] }>({ show: false, dates: [] });

  // Remarks Modal State
  const [remarksModalOpen, setRemarksModalOpen] = useState(false);
  const [studentsForRemarks, setStudentsForRemarks] = useState<Student[]>([]);
  const [remarksData, setRemarksData] = useState<
    Record<
      string,
      {
        remark: string;
        behaviorTag: "Excellent" | "Good" | "Needs Improvement" | "";
      }
    >
  >({});
  const [savingRemarks, setSavingRemarks] = useState(false);

  // Skills Modal State
  const [skillsModalOpen, setSkillsModalOpen] = useState(false);
  const [studentsForSkills, setStudentsForSkills] = useState<Student[]>([]);
  const [skillsData, setSkillsData] = useState<Record<string, StudentSkillsDraft>>(
    {},
  );
  const [savingSkills, setSavingSkills] = useState(false);

  // Class students for remarks
  const [classStudents, setClassStudents] = useState<Student[]>([]);
  const [classAttendanceRecords, setClassAttendanceRecords] = useState<
    AttendanceRecord[]
  >([]);
  const [termAssessments, setTermAssessments] = useState<Assessment[]>([]);
  const [termRemarks, setTermRemarks] = useState<StudentRemark[]>([]);

  // Helper to get current day
  const getCurrentDay = () => {
    const today = new Date().toLocaleDateString("en-US", { weekday: "long" });
    return DAYS.includes(today) ? today : "Monday";
  };

  const formatDisplayDate = (dateStr?: string) => {
    if (!dateStr) return "TBD";
    const parsed = new Date(dateStr + "T00:00:00");
    if (Number.isNaN(parsed.getTime())) return dateStr;
    return parsed.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  // Schedule State
  const [timetable, setTimetable] = useState<ClassTimetable | null>(null);
  const [selectedDay, setSelectedDay] = useState<string>(getCurrentDay());
  const [scheduleForDay, setScheduleForDay] = useState<TimeSlot[]>([]);

  // Attendance Trend State
  const [attendanceTrend, setAttendanceTrend] = useState<
    { day: string; percentage: number }[]
  >([]);
  const [teacherAttendanceTrend, setTeacherAttendanceTrend] = useState<
    { day: string; percentage: number; status?: string }[]
  >([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [totalSchoolDays, setTotalSchoolDays] = useState(0);
  const [totalSchoolWeeks, setTotalSchoolWeeks] = useState(0);

  // Class Overview State
  const [totalStudents, setTotalStudents] = useState(0);
  const [presentToday, setPresentToday] = useState(0);
  const [absentToday, setAbsentToday] = useState(0);
  const [classAverage, setClassAverage] = useState(0);
  const [behaviorAverage, setBehaviorAverage] = useState("0.0");
  const [subjectStandings, setSubjectStandings] = useState<
    { subject: string; topStudent: string; average: number }[]
  >([]);

  // If user is not yet available, show loading (keep hooks above this line)
  if (!user) {
    return (
      <Layout title="Teacher Dashboard">
        <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1160A8] mx-auto mb-4"></div>
          <p className="text-slate-500">Loading dashboard...</p>
        </div>
      </Layout>
    );
  }

  const setSectionLoading = useCallback((section: SectionKey, loading: boolean) => {
    setSectionState((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        loading,
      },
    }));
  }, []);

  const setSectionError = useCallback((section: SectionKey, error: string | null) => {
    setSectionState((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        error,
      },
    }));
  }, []);

  const triggerRefresh = useCallback(() => {
    setRefreshSeed((prev) => prev + 1);
  }, []);

  const buildTeacherTrend = useCallback(
    async (
      offset: number,
      options?: { records?: TeacherAttendanceRecord[]; forceEmpty?: boolean },
    ) => {
      if (!schoolId || !user?.id) return;
      const weekDates = getWeekDates(offset);
      const startDate = weekDates[0];
      const endDate = weekDates[weekDates.length - 1];

      const weekRecords =
        options?.records ||
        (await db.getTeacherAttendanceByDateRange(
          schoolId,
          user.id,
          startDate,
          endDate,
        ));

      const recordsByDate = new Map(
        weekRecords.map((record) => [record.date, record]),
      );
      const trendData = weekDates.map((date) => {
        const record = recordsByDate.get(date);
        const [y, m, d] = date.split("-").map(Number);
        const dateObj = new Date(y, m - 1, d);
        const dayName = dateObj.toLocaleDateString("en-US", {
          weekday: "short",
        });
        const status = record
          ? record.approvalStatus === "pending"
            ? "pending"
            : record.approvalStatus === "approved"
              ? record.status
              : record.approvalStatus === "rejected"
                ? "absent"
                : record.status || "missing"
          : "missing";
        return {
          day: dayName,
          percentage: record ? 100 : 0,
          status,
        };
      });

      setTeacherAttendanceTrend((prev) => {
        if (options?.forceEmpty) return trendData;
        const hasAnyRecord = trendData.some((item) => item.status !== "missing");
        return hasAnyRecord ? trendData : prev;
      });
    },
    [getWeekDates, schoolId, user?.id],
  );

  const applyClassAttendanceMetrics = useCallback(
    (attendanceRecords: AttendanceRecord[], students: Student[]) => {
      const total = students.length || 1;
      const weekDates = getWeekDates(weekOffset);
      const recordsByDate = new Map(
        attendanceRecords.map((record) => [record.date, record]),
      );
      const trendData = weekDates.map((date) => {
        const record = recordsByDate.get(date);
        const percentage = record
          ? Math.round((record.presentStudentIds.length / total) * 100)
          : 0;
        const [y, m, d] = date.split("-").map(Number);
        const dayName = new Date(y, m - 1, d).toLocaleDateString("en-US", {
          weekday: "short",
        });
        return { day: dayName, percentage };
      });

      setAttendanceTrend(trendData);
      setTotalStudents(students.length);
      setClassAttendanceRecords(attendanceRecords);

      const todayKey = getLocalDateString();
      const todayAttendance = recordsByDate.get(todayKey);
      const presentTodayCount = todayAttendance
        ? todayAttendance.presentStudentIds.length
        : 0;
      setPresentToday(presentTodayCount);
      setAbsentToday(todayAttendance ? students.length - presentTodayCount : 0);
    },
    [getLocalDateString, getWeekDates, weekOffset],
  );

  const refreshTeacherAttendanceSnapshot = useCallback(async () => {
    if (!schoolId || !user?.id) return;
    try {
      setSectionLoading("attendance", true);
      setSectionError("attendance", null);
      const weekDates = getWeekDates(weekOffset);
      const [records, todayAttendance] = await Promise.all([
        db.getTeacherAttendanceByDateRange(
          schoolId,
          user.id,
          weekDates[0],
          weekDates[weekDates.length - 1],
        ),
        db.getTeacherAttendance(schoolId, user.id, getLocalDateString()),
      ]);
      await buildTeacherTrend(weekOffset, {
        records,
        forceEmpty: true,
      });
      setTeacherAttendance(todayAttendance || null);
    } catch (error) {
      console.error("Error refreshing teacher attendance:", error);
      setSectionError(
        "attendance",
        "Could not refresh teacher attendance right now.",
      );
    } finally {
      setSectionLoading("attendance", false);
    }
  }, [
    buildTeacherTrend,
    getLocalDateString,
    getWeekDates,
    schoolId,
    setSectionError,
    setSectionLoading,
    user?.id,
    weekOffset,
  ]);

  const refreshClassAttendanceSnapshot = useCallback(async () => {
    if (!schoolId || !selectedClassId) return;
    try {
      setSectionLoading("attendance", true);
      setSectionError("attendance", null);
      const weekDates = getWeekDates(weekOffset);
      const weekStartDate = new Date(`${weekDates[0]}T00:00:00`);
      const lookbackStart = new Date();
      lookbackStart.setHours(0, 0, 0, 0);
      lookbackStart.setDate(lookbackStart.getDate() - 30);
      const rangeStartDate =
        weekStartDate < lookbackStart ? weekStartDate : lookbackStart;
      const [attendanceRecords, students] = await Promise.all([
        db.getClassAttendanceByDateRange(
          schoolId,
          selectedClassId,
          getLocalDateString(rangeStartDate),
          weekDates[weekDates.length - 1],
        ),
        db.getStudents(schoolId, selectedClassId),
      ]);
      applyClassAttendanceMetrics(attendanceRecords, students);
      setClassStudents(students);
    } catch (error) {
      console.error("Error refreshing class attendance:", error);
      setSectionError("attendance", "Could not refresh class attendance.");
    } finally {
      setSectionLoading("attendance", false);
    }
  }, [
    applyClassAttendanceMetrics,
    getLocalDateString,
    getWeekDates,
    schoolId,
    selectedClassId,
    setSectionError,
    setSectionLoading,
    weekOffset,
  ]);

  // Re-check for missed attendance with batched range reads.
  useEffect(() => {
    let isMounted = true;

    const checkAttendance = async () => {
      try {
        if (!schoolId || !user?.id) return;
        const config = await db.getSchoolConfig(schoolId);
        if (!isMounted) return;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const reopenDateObj = config.schoolReopenDate
          ? new Date(`${config.schoolReopenDate}T00:00:00`)
          : null;
        if (reopenDateObj) reopenDateObj.setHours(0, 0, 0, 0);

        const nextTermBeginsObj = config.nextTermBegins
          ? new Date(`${config.nextTermBegins}T00:00:00`)
          : null;
        if (nextTermBeginsObj) nextTermBeginsObj.setHours(0, 0, 0, 0);

        if (
          nextTermBeginsObj &&
          today.getTime() === nextTermBeginsObj.getTime()
        ) {
          setMissedAttendanceModal({ show: false, dates: [] });
          setMissedStudentAttendanceModal({ show: false, dates: [] });
          return;
        }

        const vacationDateObj = config.vacationDate
          ? new Date(`${config.vacationDate}T00:00:00`)
          : null;
        if (vacationDateObj) vacationDateObj.setHours(0, 0, 0, 0);

        const schoolHasReopened = !reopenDateObj || today >= reopenDateObj;
        const isOnVacation =
          vacationDateObj &&
          nextTermBeginsObj &&
          today >= vacationDateObj &&
          today < nextTermBeginsObj;

        if (!schoolHasReopened || isOnVacation) {
          setMissedAttendanceModal({ show: false, dates: [] });
          setMissedStudentAttendanceModal({ show: false, dates: [] });
          return;
        }

        const lookbackDate = new Date(today);
        lookbackDate.setDate(lookbackDate.getDate() - 10);
        lookbackDate.setHours(0, 0, 0, 0);
        const startDate =
          reopenDateObj && reopenDateObj > lookbackDate
            ? reopenDateObj
            : lookbackDate;
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (yesterday < startDate) {
          setMissedAttendanceModal({ show: false, dates: [] });
          setMissedStudentAttendanceModal({ show: false, dates: [] });
          return;
        }

        const startDateStr = getLocalDateString(startDate);
        const endDateStr = getLocalDateString(yesterday);

        const [teacherRecords, classRecords] = await Promise.all([
          db.getTeacherAttendanceByDateRange(
            schoolId,
            user.id,
            startDateStr,
            endDateStr,
          ),
          selectedClassId
            ? db.getClassAttendanceByDateRange(
                schoolId,
                selectedClassId,
                startDateStr,
                endDateStr,
              )
            : Promise.resolve([] as AttendanceRecord[]),
        ]);

        if (!isMounted) return;
        const teacherByDate = new Set(teacherRecords.map((record) => record.date));
        const classByDate = new Set(classRecords.map((record) => record.date));
        const missedTeacherDates: string[] = [];
        const missedStudentDates: string[] = [];

        const cursor = new Date(yesterday);
        while (cursor >= startDate) {
          const dayOfWeek = cursor.getDay();
          const isVacationDay =
            vacationDateObj &&
            cursor.toDateString() === vacationDateObj.toDateString();
          if (dayOfWeek !== 0 && dayOfWeek !== 6 && !isVacationDay) {
            const dateKey = getLocalDateString(cursor);
            if (!teacherByDate.has(dateKey)) {
              missedTeacherDates.push(dateKey);
            }
            if (selectedClassId && !classByDate.has(dateKey)) {
              missedStudentDates.push(dateKey);
            }
          }
          cursor.setDate(cursor.getDate() - 1);
        }

        setMissedAttendanceModal({
          show: missedTeacherDates.length > 0,
          dates: missedTeacherDates,
        });
        setMissedStudentAttendanceModal({
          show: Boolean(selectedClassId) && missedStudentDates.length > 0,
          dates: missedStudentDates,
        });
      } catch (error) {
        console.error("Error re-checking missed attendance:", error);
      }
    };

    checkAttendance();
    return () => {
      isMounted = false;
    };
  }, [schoolId, user?.id, selectedClassId, getLocalDateString, refreshSeed]);

  useEffect(() => {
    refreshTeacherAttendanceSnapshot();
  }, [refreshTeacherAttendanceSnapshot]);

  useEffect(() => {
    if (!schoolId || !user?.id) return;
    const attendanceRef = query(
      collection(firestore, "teacher_attendance"),
      where("schoolId", "==", schoolId),
      where("teacherId", "==", user.id),
    );
    const unsubscribe = onSnapshot(attendanceRef, async () => {
      await refreshTeacherAttendanceSnapshot();
    });

    return () => unsubscribe();
  }, [refreshTeacherAttendanceSnapshot, schoolId, user?.id]);

  useEffect(() => {
    refreshClassAttendanceSnapshot();
  }, [refreshClassAttendanceSnapshot]);

  useEffect(() => {
    if (!schoolId || !selectedClassId) return;
    const attendanceRef = query(
      collection(firestore, "attendance"),
      where("schoolId", "==", schoolId),
      where("classId", "==", selectedClassId),
    );
    const unsubscribe = onSnapshot(attendanceRef, async () => {
      await refreshClassAttendanceSnapshot();
    });

    return () => unsubscribe();
  }, [refreshClassAttendanceSnapshot, schoolId, selectedClassId]);

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      if (!selectedClassId || !schoolId || !user?.id) return;

      setSectionLoading("notices", true);
      setSectionLoading("timetable", true);
      setSectionLoading("analytics", true);
      setSectionError("notices", null);
      setSectionError("timetable", null);
      setSectionError("analytics", null);

      let config: SchoolConfig = {
        currentTerm: `Term ${CURRENT_TERM}`,
        academicYear: ACADEMIC_YEAR,
        schoolReopenDate: "",
        schoolName: "School Manager GH",
        headTeacherRemark:
          "An outstanding performance. The school is proud of you.",
        termEndDate: "2024-12-20",
        vacationDate: "",
        nextTermBegins: "",
        termTransitionProcessed: false,
        schoolId: schoolId || "",
      };
      let currentSubjects: string[] = [];

      try {
        config = await db.getSchoolConfig(schoolId);

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayMs = today.getTime();
        const nextTermBeginsMs = config.nextTermBegins
          ? new Date(`${config.nextTermBegins}T00:00:00`).getTime()
          : null;

        if (
          config.nextTermBegins &&
          nextTermBeginsMs &&
          todayMs >= nextTermBeginsMs &&
          config.termTransitionProcessed === false
        ) {
          await db.resetForNewTerm(config);
          const updatedConfig = {
            ...config,
            termTransitionProcessed: true,
          };
          await db.updateSchoolConfig(updatedConfig);
          config = updatedConfig;
          showToast("New term started. Dashboard refreshed.", {
            type: "success",
          });
          triggerRefresh();
        } else if (
          config.nextTermBegins &&
          nextTermBeginsMs &&
          todayMs < nextTermBeginsMs &&
          config.termTransitionProcessed === true
        ) {
          const resetTransitionFlag = {
            ...config,
            termTransitionProcessed: false,
          };
          await db.updateSchoolConfig(resetTransitionFlag);
          config = resetTransitionFlag;
        }

        if (!isMounted) return;
        setSchoolConfig(config);
        setCurrentTerm(config.currentTerm || `Term ${CURRENT_TERM}`);

        const vacationDateObj = config.vacationDate
          ? new Date(`${config.vacationDate}T00:00:00`)
          : null;
        if (vacationDateObj) vacationDateObj.setHours(0, 0, 0, 0);
        const vacationStartMs =
          vacationDateObj !== null
            ? new Date(
                new Date(vacationDateObj).setDate(vacationDateObj.getDate() + 1),
              ).getTime()
            : null;
        const shouldBeVacation =
          vacationStartMs !== null
            ? nextTermBeginsMs
              ? todayMs >= vacationStartMs && todayMs < nextTermBeginsMs
              : todayMs >= vacationStartMs
            : false;
        setIsVacation(shouldBeVacation);

        setAttendanceLocked(
          Boolean(nextTermBeginsMs) &&
            todayMs >= Number(nextTermBeginsMs) &&
            !config.schoolReopenDate,
        );

        const countWeekdays = (startDate: string, endDate: string) => {
          const start = new Date(`${startDate}T00:00:00`);
          const end = new Date(`${endDate}T00:00:00`);
          if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
          if (start > end) return 0;
          let count = 0;
          const current = new Date(start);
          while (current <= end) {
            const day = current.getDay();
            if (day !== 0 && day !== 6) count += 1;
            current.setDate(current.getDate() + 1);
          }
          return count;
        };

        const reopenDateObj = config.schoolReopenDate
          ? new Date(`${config.schoolReopenDate}T00:00:00`)
          : null;
        if (reopenDateObj) reopenDateObj.setHours(0, 0, 0, 0);

        let effectiveStart = getLocalDateString();
        if (reopenDateObj && reopenDateObj <= today) {
          effectiveStart = getLocalDateString(reopenDateObj);
        }

        let effectiveEnd = getLocalDateString();
        if (vacationDateObj && vacationDateObj < today) {
          effectiveEnd = getLocalDateString(vacationDateObj);
        }

        const totalPossibleDays = countWeekdays(effectiveStart, effectiveEnd);
        const holidayCount = (config.holidayDates || []).filter((holidayItem) => {
          const holidayDate = toHolidayDateString(holidayItem);
          if (!holidayDate) return false;
          const holiday = new Date(`${holidayDate}T00:00:00`);
          if (Number.isNaN(holiday.getTime())) return false;
          return (
            holiday >= new Date(`${effectiveStart}T00:00:00`) &&
            holiday <= new Date(`${effectiveEnd}T00:00:00`)
          );
        }).length;
        const totalDays = Math.max(0, totalPossibleDays - holidayCount);
        setTotalSchoolDays(totalDays);
        setTotalSchoolWeeks(Math.max(0, Math.ceil(totalDays / 5)));
      } catch (error) {
        console.error("Error fetching school config:", error);
        setSectionError("analytics", "Could not load school term settings.");
      }

      try {
        currentSubjects = await db.getSubjects(schoolId, selectedClassId);
        if (!isMounted) return;
        setSubjects(currentSubjects);
      } catch (error) {
        console.error("Error fetching subjects:", error);
        setSectionError("analytics", "Could not load class subjects.");
      }

      try {
        const [noticeData, broadcastData] = await Promise.all([
          db.getNotices(schoolId),
          db.getPlatformBroadcasts(schoolId),
        ]);
        if (!isMounted) return;
        setNotices(noticeData);
        setBroadcasts(broadcastData);
      } catch (error) {
        console.error("Error loading notices:", error);
        setSectionError("notices", "Could not load notices and broadcasts.");
      } finally {
        setSectionLoading("notices", false);
      }

      try {
        const t = await db.getTimetable(schoolId, selectedClassId);
        if (!isMounted) return;
        setTimetable(t || null);
        setSelectedDay(getCurrentDay());
      } catch (error) {
        console.error("Error loading timetable:", error);
        setSectionError("timetable", "Could not load class schedule.");
      } finally {
        setSectionLoading("timetable", false);
      }

      try {
        const currentTermNum =
          parseInt((config.currentTerm || `Term ${CURRENT_TERM}`).split(" ")[1], 10) || 1;

        const [students, allClassAttendance, allSkills, remarksForClass] =
          await Promise.all([
            db.getStudents(schoolId, selectedClassId),
            db.getClassAttendance(schoolId, selectedClassId),
            db.getStudentSkills(schoolId, selectedClassId),
            db.getStudentRemarks(schoolId, selectedClassId),
          ]);

        if (!isMounted) return;
        setClassStudents(students);
        applyClassAttendanceMetrics(allClassAttendance, students);

        const assessmentCollections = await Promise.all(
          currentSubjects.map((subject) =>
            db.getAssessments(schoolId, selectedClassId, subject),
          ),
        );
        const flattenedAssessments = assessmentCollections.flat();
        const currentTermAssessments = flattenedAssessments.filter(
          (assessment) => assessment.term === currentTermNum,
        );
        setTermAssessments(currentTermAssessments);
        setTermRemarks(
          remarksForClass.filter((remark) => remark.term === currentTermNum),
        );

        const totalScore = currentTermAssessments.reduce((sum, assessment) => {
          return sum + (assessment.total ?? calculateTotalScore(assessment));
        }, 0);
        const classAvg =
          currentTermAssessments.length > 0
            ? totalScore / currentTermAssessments.length
            : 0;
        setClassAverage(classAvg);

        const termSkills = allSkills.filter((skill) => skill.term === currentTermNum);
        const conductMap: Record<string, number> = {
          Excellent: 5,
          "Very Good": 4,
          Good: 3,
          Fair: 2,
          Poor: 1,
        };
        const behaviorValues = termSkills
          .map((skill) => conductMap[String(skill.conduct || "")] || 0)
          .filter((value) => value > 0);
        const behaviorAvg =
          behaviorValues.length > 0
            ? behaviorValues.reduce((sum, value) => sum + value, 0) /
              behaviorValues.length
            : 0;
        setBehaviorAverage(behaviorAvg.toFixed(1));

        const standings = currentSubjects
          .map((subject) => {
            const subjectAssessments = currentTermAssessments.filter(
              (assessment) => assessment.subject === subject,
            );
            if (!subjectAssessments.length) return null;
            let maxScore = -1;
            let topStudent = "N/A";
            let total = 0;
            subjectAssessments.forEach((assessment) => {
              const score = assessment.total ?? calculateTotalScore(assessment);
              total += score;
              if (score > maxScore) {
                maxScore = score;
                const student = students.find((s) => s.id === assessment.studentId);
                if (student) topStudent = student.name;
              }
            });
            return {
              subject,
              topStudent,
              average: total / subjectAssessments.length,
            };
          })
          .filter(Boolean) as { subject: string; topStudent: string; average: number }[];
        standings.sort((a, b) => b.average - a.average);
        setSubjectStandings(standings);
      } catch (error) {
        console.error("Error loading class analytics:", error);
        setSectionError(
          "analytics",
          "Could not load class analytics right now.",
        );
      } finally {
        setSectionLoading("analytics", false);
      }

    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [
    applyClassAttendanceMetrics,
    getLocalDateString,
    refreshSeed,
    schoolId,
    selectedClassId,
    setSectionError,
    setSectionLoading,
    triggerRefresh,
    user?.id,
    weekOffset,
  ]);

  // Update displayed schedule when day or data changes
  useEffect(() => {
    if (timetable && timetable.schedule && selectedDay) {
      const daySchedule = timetable.schedule[selectedDay] || [];
      setScheduleForDay(daySchedule);
    } else {
      setScheduleForDay([]);
    }
  }, [timetable, selectedDay]);

  const getSlotStyles = (type: string) => {
    switch (type) {
      case "break":
        return {
          border: "border-amber-400",
          bgHover: "group-hover:bg-amber-50",
          text: "text-amber-700 italic",
          badge: "text-amber-600",
        };
      case "worship":
        return {
          border: "border-purple-400",
          bgHover: "group-hover:bg-purple-50",
          text: "text-purple-700 font-semibold",
          badge: "text-purple-600",
        };
      case "closing":
        return {
          border: "border-slate-400",
          bgHover: "group-hover:bg-slate-50",
          text: "text-slate-700 font-bold",
          badge: "text-slate-600",
        };
      default:
        return {
          border: "border-[#1160A8]",
          bgHover: "group-hover:bg-[#E6F0FA]",
          text: "text-slate-800",
          badge: "text-[#1160A8]",
        };
    }
  };

  const todayClassAttendanceRecord = useMemo(() => {
    const todayKey = getLocalDateString();
    return classAttendanceRecords.find((record) => record.date === todayKey);
  }, [classAttendanceRecords, getLocalDateString]);

  const priorities = useMemo<PriorityItem[]>(() => {
    const next: PriorityItem[] = [];

    if (attendanceLocked) {
      next.push({
        id: "attendance-locked",
        title: "Attendance is locked",
        description:
          "Admin must set a school reopen date before attendance can be submitted.",
        tone: "high",
      });
    } else if (!todayClassAttendanceRecord) {
      next.push({
        id: "student-attendance",
        title: "Take student attendance",
        description: `Attendance for ${assignedClass?.name || "your class"} is still pending today.`,
        tone: "high",
        actionLabel: "Take Attendance",
        actionTo: "/teacher/attendance",
      });
    }

    if (!teacherAttendance) {
      next.push({
        id: "teacher-attendance",
        title: "Mark your attendance",
        description: "Your staff attendance has not been submitted today.",
        tone: "high",
        actionLabel: "Mark Now",
        actionTo: "/teacher/my-attendance",
      });
    } else if (teacherAttendance.approvalStatus === "pending") {
      next.push({
        id: "teacher-pending",
        title: "Attendance awaiting approval",
        description: "Your latest attendance is pending admin approval.",
        tone: "medium",
      });
    }

    if (canUseExamReports && termAssessments.length === 0) {
      next.push({
        id: "assessments",
        title: "Record assessments",
        description: "No assessment scores found for this term yet.",
        tone: "medium",
        actionLabel: "Open Gradebook",
        actionTo: "/teacher/assessment",
      });
    }

    const urgentNotices = notices.filter((notice) => notice.type === "urgent");
    if (urgentNotices.length > 0) {
      next.push({
        id: "urgent-notice",
        title: "Review urgent notices",
        description: `${urgentNotices.length} urgent notice(s) require attention.`,
        tone: "normal",
      });
    }

    return next.slice(0, 3);
  }, [
    assignedClass?.name,
    attendanceLocked,
    canUseExamReports,
    notices,
    teacherAttendance,
    termAssessments.length,
    todayClassAttendanceRecord,
  ]);

  const studentsNeedingAttention = useMemo<StudentAttentionItem[]>(() => {
    if (!classStudents.length) return [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const lookbackStart = new Date(today);
    lookbackStart.setDate(lookbackStart.getDate() - 20);

    const schoolDays = classAttendanceRecords
      .filter((record) => {
        const date = new Date(`${record.date}T00:00:00`);
        if (Number.isNaN(date.getTime())) return false;
        if (date < lookbackStart || date > today) return false;
        const day = date.getDay();
        return day !== 0 && day !== 6;
      })
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10);

    const passMark = Number(schoolConfig?.passMark || 50);
    const className = assignedClass?.name || "Class";
    const remarksByStudent = new Set(termRemarks.map((remark) => remark.studentId));
    const scoresByStudent = new Map<string, number[]>();

    termAssessments.forEach((assessment) => {
      const score = assessment.total ?? calculateTotalScore(assessment);
      const current = scoresByStudent.get(assessment.studentId) || [];
      current.push(score);
      scoresByStudent.set(assessment.studentId, current);
    });

    const attentionRows: StudentAttentionItem[] = classStudents
      .map((student) => {
        const reasons: string[] = [];

        if (schoolDays.length > 0) {
          const absentCount = schoolDays.filter(
            (record) => !record.presentStudentIds.includes(student.id),
          ).length;
          if (absentCount >= 2) {
            reasons.push(`${absentCount} absences in recent school days`);
          }
        }

        const scores = scoresByStudent.get(student.id) || [];
        if (scores.length >= 2) {
          const avg = scores.reduce((sum, value) => sum + value, 0) / scores.length;
          if (avg < passMark) {
            reasons.push(`Low average (${avg.toFixed(1)}%)`);
          }
        }

        if (termAssessments.length > 0 && !remarksByStudent.has(student.id)) {
          reasons.push("Remark not entered");
        }

        return {
          studentId: student.id,
          studentName: student.name,
          className,
          reasons,
        };
      })
      .filter((row) => row.reasons.length > 0)
      .sort((a, b) => b.reasons.length - a.reasons.length);

    return attentionRows.slice(0, 8);
  }, [
    assignedClass?.name,
    classAttendanceRecords,
    classStudents,
    schoolConfig?.passMark,
    termAssessments,
    termRemarks,
  ]);

  const preloadRemarksAndSkills = useCallback(async () => {
    if (!schoolId || !selectedClassId) {
      return { students: [] as Student[] };
    }
    const students =
      classStudents.length > 0
        ? classStudents
        : await db.getStudents(schoolId, selectedClassId);

    const [existingRemarks, existingSkills] = await Promise.all([
      db.getStudentRemarks(schoolId, selectedClassId),
      db.getStudentSkills(schoolId, selectedClassId),
    ]);

    const remarksMap = existingRemarks.reduce(
      (acc, remark) => {
        acc[remark.studentId] = {
          remark: remark.remark,
          behaviorTag: remark.behaviorTag as
            | "Excellent"
            | "Good"
            | "Needs Improvement"
            | "",
        };
        return acc;
      },
      {} as Record<
        string,
        {
          remark: string;
          behaviorTag: "Excellent" | "Good" | "Needs Improvement" | "";
        }
      >,
    );

    const skillsMap = existingSkills.reduce(
      (acc, skill) => {
        acc[skill.studentId] = {
          punctuality: skill.punctuality,
          neatness: skill.neatness,
          conduct: skill.conduct,
          attitudeToWork: skill.attitudeToWork,
          classParticipation: skill.classParticipation,
          homeworkCompletion: skill.homeworkCompletion,
        };
        return acc;
      },
      {} as Record<string, StudentSkillsDraft>,
    );

    setRemarksData(remarksMap);
    setSkillsData(skillsMap);
    return { students };
  }, [classStudents, schoolId, selectedClassId]);

  return (
    <Layout title="Teacher Dashboard">
      {isVacation && (
        <VacationOverlay reopenDate={schoolConfig?.nextTermBegins || "TBD"} />
      )}

      {isVacation && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 via-yellow-50 to-orange-50 p-4 sm:p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="h-12 w-12 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-md">
                <AlertCircle className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-amber-700">
                  Vacation Mode
                </p>
                <h2 className="text-lg sm:text-xl font-bold text-amber-900 mt-1">
                  School is on vacation
                </h2>
                <p className="text-sm text-amber-800 mt-1">
                  Classes resume on{" "}
                  <span className="font-semibold">
                    {formatDisplayDate(schoolConfig?.nextTermBegins)}
                  </span>
                  . Enjoy the break!
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-white/70 px-4 py-2 text-xs font-semibold text-amber-800 shadow-sm">
              <Calendar className="h-4 w-4" />
              Vacation since {formatDisplayDate(schoolConfig?.vacationDate)}
            </div>
          </div>
        </div>
      )}

      <TodayPrioritiesStrip items={priorities} />

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            Welcome back, {user?.fullName}
          </h1>
          <p className="text-slate-500 mt-1">
            <span className="inline-block w-2 h-2 rounded-full bg-[#1160A8] mr-2"></span>
            Class Teacher for:{" "}
            <span className="font-semibold text-slate-800">
              {classNames || "Not Assigned"}
            </span>
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-end sm:items-center">
          <div className="flex flex-wrap gap-2">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-2 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Total School Days
              </p>
              <p className="text-lg font-bold text-slate-800">
                {totalSchoolDays || "—"}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-2 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Total Weeks
              </p>
              <p className="text-lg font-bold text-slate-800">
                {totalSchoolWeeks || "—"}
              </p>
            </div>
          </div>
          {/* Class Context Switcher */}
          {assignedClassIds.length > 1 && (
            <div className="flex items-center bg-white border border-slate-200 rounded-lg px-3 py-1.5 shadow-sm">
              <span className="text-xs font-bold text-slate-500 uppercase mr-2">
                Viewing:
              </span>
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="text-sm font-semibold text-slate-800 bg-transparent outline-none cursor-pointer"
              >
                {assignedClassIds.map((id) => {
                  const c = CLASSES_LIST.find((cls) => cls.id === id);
                  return (
                    <option key={id} value={id}>
                      {c?.name}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          <div className="flex gap-2">
            <span className="px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-full border border-emerald-100 uppercase tracking-wide">
              {currentTerm} Active
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Quick Actions & Chart */}
        <div className="lg:col-span-2 space-y-8">
          {/* Quick Stats/Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Link
              to={attendanceLocked ? "#" : "/teacher/attendance"}
              onClick={(event) => {
                if (!attendanceLocked) return;
                event.preventDefault();
                showToast(
                  "Attendance is locked until the admin sets a school re-open date.",
                  { type: "warning" },
                );
              }}
              className={`group block bg-white p-6 rounded-xl shadow-sm border border-slate-100 transition-all relative overflow-hidden ${
                attendanceLocked
                  ? "opacity-60 cursor-not-allowed"
                  : "hover:border-[#1160A8]"
              }`}
              aria-disabled={attendanceLocked}
            >
              <div className="absolute right-0 top-0 w-24 h-24 bg-[#E6F0FA] rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
              <div className="relative z-10">
                <div className="w-12 h-12 bg-[#E6F0FA] rounded-lg flex items-center justify-center mb-4 group-hover:bg-[#0B4A82] transition-colors">
                  <ClipboardCheck className="w-6 h-6 text-[#1160A8] group-hover:text-white" />
                </div>
                <h3 className="font-bold text-lg text-slate-800 mb-1">
                  Take Attendance
                </h3>
                <p className="text-sm text-slate-500">
                  Record daily register for{" "}
                  {assignedClass?.name || "your class"}.
                </p>
              </div>
            </Link>

            {hasFeature("basic_exam_reports") && (
              <Link
                to="/teacher/assessment"
                className="group block bg-white p-6 rounded-xl shadow-sm border border-slate-100 hover:border-amber-500 transition-all relative overflow-hidden"
              >
                <div className="absolute right-0 top-0 w-24 h-24 bg-amber-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                <div className="relative z-10">
                  <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center mb-4 group-hover:bg-amber-500 transition-colors">
                    <BookOpen className="w-6 h-6 text-amber-600 group-hover:text-white" />
                  </div>
                  <h3 className="font-bold text-lg text-slate-800 mb-1">
                    Gradebook
                  </h3>
                  <p className="text-sm text-slate-500">
                    Record marks for tests, homework & exams.
                  </p>
                </div>
              </Link>
            )}

            {hasFeature("teacher_attendance") && (
              <Link
                to="/teacher/my-attendance"
                className="group block bg-white p-6 rounded-xl shadow-sm border border-slate-100 hover:border-green-500 transition-all relative overflow-hidden w-full text-left"
              >
                <div className="absolute right-0 top-0 w-24 h-24 bg-green-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                <div className="relative z-10">
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4 group-hover:bg-green-500 transition-colors">
                    <ClipboardCheck className="w-6 h-6 text-green-600 group-hover:text-white" />
                  </div>
                  <h3 className="font-bold text-lg text-slate-800 mb-1">
                    My Attendance
                  </h3>
                  <p className="text-sm text-slate-500">
                    Mark weekly attendance & view records
                  </p>
                  {teacherAttendance && (
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      <span>Last marked: {teacherAttendance.date}</span>
                      {teacherAttendance.approvalStatus === "pending" && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                          Pending approval
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </Link>
            )}

            <button
              onClick={async () => {
                try {
                  const { students } = await preloadRemarksAndSkills();
                  setStudentsForRemarks(students || []);
                  setRemarksModalOpen(true);
                } catch (error) {
                  console.error("Failed to preload remarks:", error);
                  showToast("Could not load remarks data.", { type: "error" });
                }
              }}
              className="group block bg-white p-6 rounded-xl shadow-sm border border-slate-100 hover:border-purple-500 transition-all relative overflow-hidden w-full text-left"
            >
              <div className="absolute right-0 top-0 w-24 h-24 bg-purple-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
              <div className="relative z-10">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4 group-hover:bg-purple-500 transition-colors">
                  <BookOpen className="w-6 h-6 text-purple-600 group-hover:text-white" />
                </div>
                <h3 className="font-bold text-lg text-slate-800 mb-1">
                  Write Remarks
                </h3>
                <p className="text-sm text-slate-500">
                  End of term comments & behavior tags.
                </p>
              </div>
            </button>

            <button
              onClick={async () => {
                try {
                  const { students } = await preloadRemarksAndSkills();
                  setStudentsForSkills(students || []);
                  setSkillsModalOpen(true);
                } catch (error) {
                  console.error("Failed to preload skills:", error);
                  showToast("Could not load skills data.", { type: "error" });
                }
              }}
              className="group block bg-white p-6 rounded-xl shadow-sm border border-slate-100 hover:border-[#1160A8] transition-all relative overflow-hidden w-full text-left"
            >
              <div className="absolute right-0 top-0 w-24 h-24 bg-[#E6F0FA] rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
              <div className="relative z-10">
                <div className="w-12 h-12 bg-[#E6F0FA] rounded-lg flex items-center justify-center mb-4 group-hover:bg-[#1160A8] transition-colors">
                  <TrendingUp className="w-6 h-6 text-[#1160A8] group-hover:text-white" />
                </div>
                <h3 className="font-bold text-lg text-slate-800 mb-1">
                  Edit Skills
                </h3>
                <p className="text-sm text-slate-500">
                  Rate student skills and behavior.
                </p>
              </div>
            </button>
          </div>

          {/* Class Overview Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
              <h4 className="font-bold text-slate-800 mb-2">Class Health</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Total Students:</span>
                  <span className="font-semibold">{totalStudents}</span>
                </div>
                <div className="flex justify-between">
                  <span>Present Today:</span>
                  <span className="font-semibold text-green-600">
                    {presentToday}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Absent Today:</span>
                  <span className="font-semibold text-red-600">
                    {absentToday}
                  </span>
                </div>
              </div>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
              <h4 className="font-bold text-slate-800 mb-2">
                Average Performance
              </h4>
              <div className="text-center">
                {classAverage > 0 ? (
                  <span className="text-2xl font-bold text-[#1160A8]">
                    {classAverage.toFixed(1)}%
                  </span>
                ) : (
                  <span className="text-sm text-slate-400 italic">
                    No assessment data.
                  </span>
                )}
              </div>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
              <h4 className="font-bold text-slate-800 mb-2">
                Behavior Average
              </h4>
              <div className="text-center">
                {parseFloat(behaviorAverage) > 0 ? (
                  <span className="text-lg font-semibold text-purple-600">
                    {behaviorAverage}/5
                  </span>
                ) : (
                  <span className="text-sm text-slate-400 italic">
                    No behavior data.
                  </span>
                )}
              </div>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
              <h4 className="font-bold text-slate-800 mb-2">
                Subject Standings
              </h4>
              <div className="space-y-1 max-h-20 overflow-y-auto">
                {subjectStandings.slice(0, 3).map((s) => (
                  <div key={s.subject} className="flex justify-between text-xs">
                    <span>{s.subject}:</span>
                    <span className="font-semibold">
                      {s.topStudent || "N/A"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <StudentsNeedingAttention
            items={studentsNeedingAttention}
            loading={sectionState.analytics.loading}
            error={sectionState.analytics.error}
            onRetry={triggerRefresh}
          />

          {/* Attendance Chart Visualization */}
          <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-slate-100">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 sm:mb-8 gap-3 sm:gap-0">
              <h3 className="font-bold text-slate-800 flex items-center text-base sm:text-lg">
                <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 mr-2 text-[#1160A8]" />{" "}
                Students Weekly Attendance Trend
              </h3>
              <div className="flex gap-2 items-center w-full sm:w-auto justify-center sm:justify-start">
                <button
                  onClick={() => setWeekOffset(weekOffset - 1)}
                  className="px-3 py-1.5 text-xs font-medium rounded-full bg-slate-100 hover:bg-slate-200 transition-colors min-w-[60px] touch-manipulation"
                >
                  &larr; Prev
                </button>
                <span className="px-3 py-1.5 text-xs font-medium rounded-full bg-[#1160A8] text-white text-center min-w-[120px] sm:w-36 truncate">
                  {getWeekLabel(weekOffset)}
                </span>
                <button
                  onClick={() => setWeekOffset(weekOffset + 1)}
                  disabled={weekOffset === 0}
                  className="px-3 py-1.5 text-xs font-medium rounded-full bg-slate-100 hover:bg-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-w-[60px] touch-manipulation"
                >
                  Next &rarr;
                </button>
              </div>
            </div>
            <SectionState
              loading={sectionState.attendance.loading}
              error={sectionState.attendance.error}
              loadingLabel="Refreshing attendance trends..."
              onRetry={refreshClassAttendanceSnapshot}
            />
            {!sectionState.attendance.loading && !sectionState.attendance.error && (
              <div className="flex items-end justify-between h-32 sm:h-40 gap-1 sm:gap-2 px-1 sm:px-2">
                {attendanceTrend.length === 0 ? (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-300">
                    <TrendingUp className="w-6 h-6 sm:w-8 sm:h-8 mb-2 opacity-30" />
                    <p className="text-xs sm:text-sm italic">
                      No attendance records found.
                    </p>
                  </div>
                ) : (
                  attendanceTrend.map((data, i) => (
                    <div
                      key={i}
                      className="flex flex-col items-center flex-1 group min-w-0"
                    >
                      <div className="relative w-full flex justify-center">
                        <div
                          className="w-full max-w-[32px] sm:max-w-[40px] bg-slate-100 rounded-t-lg transition-all duration-500 group-hover:bg-[#E6F0FA] relative overflow-hidden"
                          style={{ height: "120px" }}
                        >
                          <div
                            className="absolute bottom-0 left-0 right-0 bg-[#1160A8] rounded-t-lg transition-all duration-1000"
                            style={{ height: `${data.percentage}%` }}
                          ></div>
                        </div>
                        <div className="hidden sm:block absolute -top-8 bg-slate-800 text-white text-xs py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                          {data.percentage}%
                        </div>
                        <div className="sm:hidden absolute -top-6 bg-slate-800 text-white text-xs py-0.5 px-1 rounded opacity-0 group-active:opacity-100 transition-opacity">
                          {data.percentage}%
                        </div>
                      </div>
                      <span className="text-xs text-slate-500 mt-2 sm:mt-3 font-medium truncate">
                        {data.day}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* My Attendance Trend */}
          <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-slate-100">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 sm:mb-8 gap-3 sm:gap-0">
              <h3 className="font-bold text-slate-800 flex items-center text-base sm:text-lg">
                <ClipboardCheck className="w-4 h-4 sm:w-5 sm:h-5 mr-2 text-emerald-600" />{" "}
                Teacher Attendance Trend
              </h3>
              <div className="flex gap-2 items-center w-full sm:w-auto justify-center sm:justify-start">
                <button
                  onClick={() => setWeekOffset(weekOffset - 1)}
                  className="px-3 py-1.5 text-xs font-medium rounded-full bg-slate-100 hover:bg-slate-200 transition-colors min-w-[60px] touch-manipulation"
                >
                  &larr; Prev
                </button>
                <span className="px-3 py-1.5 text-xs font-medium rounded-full bg-emerald-600 text-white text-center min-w-[120px] sm:w-36 truncate">
                  {getWeekLabel(weekOffset)}
                </span>
                <button
                  onClick={() => setWeekOffset(weekOffset + 1)}
                  disabled={weekOffset === 0}
                  className="px-3 py-1.5 text-xs font-medium rounded-full bg-slate-100 hover:bg-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-w-[60px] touch-manipulation"
                >
                  Next &rarr;
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-500 mb-5 mt-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Present (Approved)
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 font-semibold text-rose-700">
                <span className="h-2 w-2 rounded-full bg-rose-500" />
                Absent
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">
                <span className="h-2 w-2 rounded-full bg-amber-400" />
                Pending
              </span>
            </div>
            <SectionState
              loading={sectionState.attendance.loading}
              error={sectionState.attendance.error}
              loadingLabel="Refreshing teacher attendance..."
              onRetry={refreshTeacherAttendanceSnapshot}
            />
            {!sectionState.attendance.loading && !sectionState.attendance.error && (
              <div className="flex items-end justify-between h-32 sm:h-40 gap-1 sm:gap-2 px-1 sm:px-2 mt-2">
                {teacherAttendanceTrend.length === 0 ? (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-300">
                    <ClipboardCheck className="w-6 h-6 sm:w-8 sm:h-8 mb-2 opacity-30" />
                    <p className="text-xs sm:text-sm italic">
                      No attendance records found.
                    </p>
                  </div>
                ) : (
                  teacherAttendanceTrend.map((data, i) => (
                    <div
                      key={i}
                      className="flex flex-col items-center flex-1 group min-w-0"
                    >
                      <div className="relative w-full flex justify-center">
                        <div
                          className="w-full max-w-[32px] sm:max-w-[40px] bg-slate-100 rounded-t-lg transition-all duration-500 group-hover:bg-emerald-50 relative overflow-hidden"
                          style={{ height: "120px" }}
                        >
                          <div
                            className={`absolute bottom-0 left-0 right-0 rounded-t-lg transition-all duration-1000 ${
                              data.status === "pending"
                                ? "bg-amber-400"
                                : data.status === "present"
                                  ? "bg-emerald-500"
                                  : data.status === "absent"
                                    ? "bg-rose-500"
                                    : "bg-slate-300"
                            }`}
                            style={{ height: `${data.percentage}%` }}
                          ></div>
                        </div>
                        <div className="hidden sm:block absolute -top-8 bg-slate-800 text-white text-xs py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                          {data.status === "pending"
                            ? "Pending"
                            : data.status === "present"
                              ? "Present"
                              : data.status === "absent"
                                ? "Absent"
                                : "Missing"}
                        </div>
                        <div className="sm:hidden absolute -top-6 bg-slate-800 text-white text-xs py-0.5 px-1 rounded opacity-0 group-active:opacity-100 transition-opacity">
                          {data.status === "pending"
                            ? "Pending"
                            : data.status === "present"
                              ? "Present"
                              : data.status === "absent"
                                ? "Absent"
                                : "Missing"}
                        </div>
                      </div>
                      <span className="text-xs text-slate-500 mt-2 sm:mt-3 font-medium truncate">
                        {data.day}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Notices & Schedule */}
        <div className="space-y-6">
          {/* Notice Board Widget */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center">
              <Bell className="w-5 h-5 mr-2 text-[#1160A8]" /> Notice Board
            </h3>
            <SectionState
              loading={sectionState.notices.loading}
              error={sectionState.notices.error}
              loadingLabel="Loading notices..."
              onRetry={triggerRefresh}
            />
            {!sectionState.notices.loading && !sectionState.notices.error && (
              <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
                {broadcasts.length > 0 && (
                  <div className="space-y-2">
                    {broadcasts.map((b) => (
                      <div
                        key={b.id}
                        className={`rounded-xl border px-4 py-3 ${
                          b.type === "MAINTENANCE"
                            ? "border-red-200 bg-red-50"
                            : b.type === "SYSTEM_UPDATE"
                              ? "border-emerald-200 bg-emerald-50"
                              : "border-slate-200 bg-white"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold text-slate-800 text-sm">
                            {b.title}
                          </h4>
                          <span className="text-[10px] font-semibold text-slate-500">
                            {b.priority}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1 whitespace-pre-line">
                          {b.message}
                        </p>
                        {b.type === "SYSTEM_UPDATE" && b.whatsNew?.length && (
                          <ul className="list-disc pl-5 text-xs text-slate-600 mt-2 space-y-1">
                            {b.whatsNew.map((item, idx) => (
                              <li key={idx}>{item}</li>
                            ))}
                          </ul>
                        )}
                        {b.type === "MAINTENANCE" && (
                          <p className="text-[11px] text-slate-500 mt-2">
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
                  <div className="text-center py-6 text-slate-400 italic text-sm">
                    No announcements at this time.
                  </div>
                ) : (
                  notices.map((notice) => (
                    <div
                      key={notice.id}
                      className="group relative pl-4 pb-2 border-l-2 border-slate-200 hover:border-[#1160A8] transition-colors"
                    >
                      <div
                        className={`absolute -left-[5px] top-1 w-2.5 h-2.5 rounded-full border-2 border-white ${notice.type === "urgent" ? "bg-red-500" : "bg-amber-400"} shadow-sm`}
                      ></div>
                      <div>
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                            {notice.date}
                          </span>
                          {notice.type === "urgent" && (
                            <span className="text-[10px] text-red-500 font-bold px-1.5 py-0.5 bg-red-50 rounded">
                              URGENT
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-medium text-slate-800 leading-snug">
                          {notice.message}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Schedule Widget */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-slate-800 flex items-center">
                <Clock className="w-5 h-5 mr-2 text-[#1160A8]" /> Class Schedule
              </h3>
              <select
                value={selectedDay}
                onChange={(e) => setSelectedDay(e.target.value)}
                className="text-xs font-bold text-[#1160A8] bg-[#E6F0FA] px-2 py-1 rounded uppercase border-none outline-none cursor-pointer hover:bg-[#E6F0FA] transition-colors"
              >
                {DAYS.map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
            </div>

            <SectionState
              loading={sectionState.timetable.loading}
              error={sectionState.timetable.error}
              loadingLabel="Loading schedule..."
              onRetry={triggerRefresh}
            />
            {!sectionState.timetable.loading &&
              !sectionState.timetable.error &&
              (selectedClassId ? (
                <div className="space-y-4 relative min-h-[150px]">
                  {scheduleForDay.length === 0 ? (
                    <div className="text-center py-10 text-slate-400 text-sm italic border-2 border-dashed border-slate-100 rounded-lg">
                      No schedule set for {selectedDay}.
                    </div>
                  ) : (
                    <>
                      <div className="absolute left-2.5 top-2 bottom-2 w-0.5 bg-slate-200"></div>

                      {scheduleForDay.map((slot) => {
                        const styles = getSlotStyles(slot.type);
                        return (
                          <div key={slot.id} className="relative pl-8 group">
                            <div
                              className={`absolute left-0 top-1.5 w-5 h-5 bg-white border-2 rounded-full z-10 transition-colors ${styles.border} ${styles.bgHover}`}
                            ></div>
                            <div className="flex items-baseline justify-between">
                              <p className="text-xs text-slate-500 font-mono">
                                {slot.startTime} - {slot.endTime}
                              </p>
                              <span
                                className={`text-[10px] font-bold uppercase ${styles.badge}`}
                              >
                                {slot.type}
                              </span>
                            </div>
                            <p className={`text-sm ${styles.text}`}>
                              {slot.subject}
                            </p>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              ) : (
                <div className="text-center py-10 text-slate-400">
                  Select a class to view schedule.
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Missed Attendance Modal */}
      {missedAttendanceModal.show && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-6 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-full">
                  <Bell className="text-amber-600" size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">
                    Attendance Reminder
                  </h3>
                  <p className="text-sm text-slate-500">
                    You missed marking attendance for a previous school day
                  </p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="text-sm text-amber-800">
                  Please mark your attendance for the following dates to keep
                  your records accurate:
                </p>
                <ul className="mt-2 space-y-1">
                  {missedAttendanceModal.dates.map((date) => (
                    <li key={date} className="text-sm font-medium">
                      <strong>
                        {(() => {
                          const parts = date.split("-");
                          if (parts.length === 3) {
                            return `${parts[1]}/${parts[2]}/${parts[0]}`;
                          }
                          return date;
                        })()}
                      </strong>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() =>
                    setMissedAttendanceModal({ show: false, dates: [] })
                  }
                  className="flex-1 px-4 py-2 text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Remind Me Later
                </button>

                {hasFeature("teacher_attendance") && (
                  <Link
                    to="/teacher/my-attendance"
                    onClick={() =>
                      setMissedAttendanceModal({ show: false, dates: [] })
                    }
                    className="flex-1 px-4 py-2 bg-[#1160A8] text-white rounded-lg hover:bg-[#0B4A82] transition-colors text-center"
                  >
                    Mark Attendance Now
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Missed Student Attendance Modal */}
      {missedStudentAttendanceModal.show && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-6 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-full">
                  <Bell className="text-red-600" size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">
                    Student Attendance Reminder
                  </h3>
                  <p className="text-sm text-slate-500">
                    You missed marking student attendance for your class.
                  </p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-800">
                  Please mark student attendance for{" "}
                  <strong>{assignedClass?.name}</strong> on the following dates
                  to keep records accurate:
                </p>
                <ul className="mt-3 space-y-1">
                  {missedStudentAttendanceModal.dates.map((date) => (
                    <li key={date} className="text-sm font-semibold">
                      {(() => {
                        const parts = date.split("-");
                        if (parts.length === 3) {
                          return `${parts[1]}/${parts[2]}/${parts[0]}`;
                        }
                        return date;
                      })()}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() =>
                    setMissedStudentAttendanceModal({ show: false, dates: [] })
                  }
                  className="flex-1 px-4 py-2 text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Remind Me Later
                </button>
                {hasFeature("attendance") && (
                  <Link
                    to="/teacher/attendance"
                    onClick={() =>
                      setMissedStudentAttendanceModal({
                        show: false,
                        dates: [],
                      })
                    }
                    className="flex-1 px-4 py-2 text-center bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  >
                    Take Attendance
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Remarks Modal */}
      {remarksModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-6 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 rounded-full">
                    <BookOpen className="text-purple-600" size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900">
                      End of Term Remarks
                    </h3>
                    <p className="text-sm text-slate-500">
                      Write comments and select behavior tags for each student
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setRemarksModalOpen(false)}
                  className="p-2 hover:bg-slate-100 rounded-full"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="p-6">
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {studentsForRemarks.map((student) => (
                  <div key={student.id} className="border rounded p-4">
                    <h4 className="font-semibold mb-2">{student.name}</h4>
                    <div className="mb-2">
                      <label className="block text-sm font-medium mb-1">
                        Behavior Tag
                      </label>
                      <select
                        value={remarksData[student.id]?.behaviorTag || ""}
                        onChange={(e) =>
                          setRemarksData((prev) => ({
                            ...prev,
                            [student.id]: {
                              ...prev[student.id],
                              behaviorTag: e.target.value as
                                | "Excellent"
                                | "Good"
                                | "Needs Improvement"
                                | "",
                            },
                          }))
                        }
                        className="w-full p-2 border rounded"
                      >
                        <option value="">Select Behavior</option>
                        <option value="Excellent">Excellent</option>
                        <option value="Good">Good</option>
                        <option value="Needs Improvement">
                          Needs Improvement
                        </option>
                      </select>
                    </div>
                    <div className="mb-2">
                      <label className="block text-sm font-medium mb-1 flex items-center gap-2">
                        <Sparkles size={14} className="text-purple-600" />
                        Remark
                      </label>
                      <textarea
                        value={remarksData[student.id]?.remark || ""}
                        onChange={(e) =>
                          setRemarksData((prev) => ({
                            ...prev,
                            [student.id]: {
                              ...prev[student.id],
                              remark: e.target.value,
                            },
                          }))
                        }
                        placeholder="Write remark or select from suggestions below..."
                        className="w-full p-2 border rounded"
                        rows={3}
                      />
                      {/* Remark Suggestions */}
                      <div className="mt-2">
                        <p className="text-xs text-slate-500 mb-2">
                          Tap to insert suggestion:
                        </p>
                        <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto p-1 bg-slate-50 rounded-lg">
                          {REMARK_SUGGESTIONS.map((suggestion, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() =>
                                setRemarksData((prev) => ({
                                  ...prev,
                                  [student.id]: {
                                    ...prev[student.id],
                                    remark: suggestion,
                                  },
                                }))
                              }
                              className="text-xs px-2 py-1 bg-purple-50 text-purple-700 rounded-full border border-purple-200 hover:bg-purple-100 transition-colors text-left truncate max-w-full"
                              title={suggestion}
                            >
                              {suggestion.length > 50
                                ? suggestion.substring(0, 50) + "..."
                                : suggestion}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-end gap-3">
                <button
                  onClick={() => setRemarksModalOpen(false)}
                  className="px-4 py-2 text-slate-600 border rounded hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    setSavingRemarks(true);
                    try {
                      const termNum =
                        (parseInt(currentTerm.split(" ")[1], 10) as 1 | 2 | 3) ||
                        1;
                      const payloads = studentsForRemarks.map((student) => {
                        const remark: StudentRemark = {
                          id: `${student.id}_${currentTerm}_${ACADEMIC_YEAR}`,
                          studentId: student.id,
                          classId: selectedClassId,
                          term: termNum,
                          academicYear: ACADEMIC_YEAR,
                          schoolId: schoolId || schoolConfig?.schoolId || "",
                          remark: remarksData[student.id]?.remark || "",
                          behaviorTag:
                            remarksData[student.id]?.behaviorTag || "",
                          teacherId: user.id,
                          dateCreated: new Date().toISOString().split("T")[0],
                        };
                        return { studentName: student.name, remark };
                      });

                      const results = await Promise.allSettled(
                        payloads.map((entry) => db.saveStudentRemark(entry.remark)),
                      );
                      const failed = results
                        .map((result, index) =>
                          result.status === "rejected"
                            ? payloads[index].studentName
                            : null,
                        )
                        .filter(Boolean) as string[];

                      if (!failed.length) {
                        showToast("Remarks saved successfully!", {
                          type: "success",
                        });
                        setRemarksModalOpen(false);
                      } else if (failed.length === payloads.length) {
                        showToast("Failed to save remarks for all students.", {
                          type: "error",
                        });
                      } else {
                        showToast(
                          `Saved with partial success. Failed for ${failed.length}: ${failed.slice(0, 3).join(", ")}${failed.length > 3 ? "..." : ""}`,
                          { type: "warning" },
                        );
                      }
                    } catch (err) {
                      console.error(err);
                      showToast("Failed to save remarks", { type: "error" });
                    } finally {
                      setSavingRemarks(false);
                    }
                  }}
                  disabled={savingRemarks}
                  className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
                >
                  {savingRemarks ? "Saving..." : "Save Remarks"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Skills Modal */}
      {skillsModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-6 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-[#E6F0FA] rounded-full">
                    <TrendingUp className="text-[#1160A8]" size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900">
                      Edit Student Skills
                    </h3>
                    <p className="text-sm text-slate-500">
                      Rate skills and behavior for each student
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSkillsModalOpen(false)}
                  className="p-2 hover:bg-slate-100 rounded-full"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="p-6">
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {studentsForSkills.map((student) => (
                  <div key={student.id} className="border rounded p-4">
                    <h4 className="font-semibold mb-3">{student.name}</h4>
                    <div className="grid grid-cols-2 gap-3">
                      {SKILLS_LIST.map((skill) => (
                        <div key={skill}>
                          <label className="block text-xs font-medium mb-1 capitalize">
                            {skill.replace(/([A-Z])/g, " $1").trim()}
                          </label>
                          <select
                            value={
                              skillsData[student.id]?.[
                                skill as keyof StudentSkills
                              ] || ""
                            }
                            onChange={(e) =>
                              setSkillsData((prev) => ({
                                ...prev,
                                [student.id]: {
                                  ...prev[student.id],
                                  [skill]: e.target.value,
                                },
                              }))
                            }
                            className="w-full p-2 border rounded text-sm"
                          >
                            <option value="">Select</option>
                            <option value="Excellent">Excellent</option>
                            <option value="Very Good">Very Good</option>
                            <option value="Good">Good</option>
                            <option value="Fair">Fair</option>
                            <option value="Poor">Poor</option>
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-end gap-3">
                <button
                  onClick={() => setSkillsModalOpen(false)}
                  className="px-4 py-2 text-slate-600 border rounded hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    setSavingSkills(true);
                    try {
                      const termNum =
                        (parseInt(currentTerm.split(" ")[1], 10) as 1 | 2 | 3) ||
                        1;
                      const payloads = studentsForSkills.map((student) => ({
                        studentName: student.name,
                        skills: {
                          id: `${student.id}_${currentTerm}_${ACADEMIC_YEAR}`,
                          studentId: student.id,
                          classId: selectedClassId,
                          term: termNum,
                          academicYear: ACADEMIC_YEAR,
                          schoolId: schoolId || schoolConfig?.schoolId || "",
                          ...skillsData[student.id],
                        } as StudentSkills,
                      }));

                      const results = await Promise.allSettled(
                        payloads.map((entry) => db.saveStudentSkills(entry.skills)),
                      );
                      const failed = results
                        .map((result, index) =>
                          result.status === "rejected"
                            ? payloads[index].studentName
                            : null,
                        )
                        .filter(Boolean) as string[];

                      if (!failed.length) {
                        showToast("Skills saved successfully!", {
                          type: "success",
                        });
                        setSkillsModalOpen(false);
                      } else if (failed.length === payloads.length) {
                        showToast("Failed to save skills for all students.", {
                          type: "error",
                        });
                      } else {
                        showToast(
                          `Saved with partial success. Failed for ${failed.length}: ${failed.slice(0, 3).join(", ")}${failed.length > 3 ? "..." : ""}`,
                          { type: "warning" },
                        );
                      }
                    } catch (err) {
                      console.error(err);
                      showToast("Failed to save skills", { type: "error" });
                    } finally {
                      setSavingSkills(false);
                    }
                  }}
                  disabled={savingSkills}
                  className="px-4 py-2 bg-[#1160A8] text-white rounded hover:bg-[#0B4A82] disabled:opacity-50"
                >
                  {savingSkills ? "Saving..." : "Save Skills"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default TeacherDashboard;
