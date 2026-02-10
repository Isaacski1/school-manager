import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import Layout from "../../components/Layout";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useAuth } from "../../context/AuthContext";
import {
  CLASSES_LIST,
  CURRENT_TERM,
  ACADEMIC_YEAR,
  calculateTotalScore,
} from "../../constants";
import { db } from "../../services/mockDb";
import { firestore } from "../../services/firebase";
import {
  Notice,
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
import {
  ClipboardCheck,
  BookOpen,
  Clock,
  TrendingUp,
  Bell,
  X,
  Sparkles,
  Calendar,
  GraduationCap,
  RefreshCw,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import VacationOverlay from "./VacationOverlay";

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

const TeacherDashboard = () => {
  const { user } = useAuth();
  const schoolId = user?.schoolId || null;

  const [subjects, setSubjects] = useState<string[]>([]);

  // Class selection for multi-class teachers
  const assignedClassIds = (user as any)?.assignedClassIds || [];
  const [selectedClassId, setSelectedClassId] = useState<string>("");

  // School Config State
  const [currentTerm, setCurrentTerm] = useState("Term 1");
  const [schoolConfig, setSchoolConfig] = useState<SchoolConfig | null>(null);
  const [isVacation, setIsVacation] = useState(false);
  const [attendanceLocked, setAttendanceLocked] = useState(false);

  useEffect(() => {
    if (assignedClassIds.length > 0) {
      setSelectedClassId(assignedClassIds[0]);
    }
  }, [user]);

  const assignedClass = CLASSES_LIST.find((c) => c.id === selectedClassId);
  const classNames = assignedClassIds
    .map((id) => CLASSES_LIST.find((c) => c.id === id)?.name)
    .join(", ");

  const [notices, setNotices] = useState<Notice[]>([]);

  // Teacher Attendance State
  const [teacherAttendance, setTeacherAttendance] =
    useState<TeacherAttendanceRecord | null>(null);
  const [markingAttendance, setMarkingAttendance] = useState(false);
  const [missedAttendanceModal, setMissedAttendanceModal] = useState<{
    show: boolean;
    dates: string[];
  }>({ show: false, dates: [] });
  const [missedStudentAttendanceModal, setMissedStudentAttendanceModal] =
    useState<{ show: boolean; date: string }>({ show: false, date: "" });

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
  const [skillsData, setSkillsData] = useState<Record<string, StudentSkills>>(
    {},
  );
  const [savingSkills, setSavingSkills] = useState(false);

  // Class students for remarks
  const [classStudents, setClassStudents] = useState<Student[]>([]);

  // Helper to get current day
  const getCurrentDay = () => {
    const today = new Date().toLocaleDateString("en-US", { weekday: "long" });
    return DAYS.includes(today) ? today : "Monday";
  };

  const getLocalDateString = (date: Date = new Date()) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

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

  const getWeekDates = (offset = 0) => {
    const now = new Date();
    // Go back by N weeks
    now.setDate(now.getDate() + offset * 7);

    const currentDay = now.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
    const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay; // Adjust to get Monday
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);

    const dates: string[] = [];
    for (let i = 0; i < 5; i++) {
      // Monday to Friday
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      // Build local YYYY-MM-DD to avoid UTC timezone shifts from toISOString()
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      dates.push(`${y}-${m}-${d}`);
    }
    return dates;
  };

  const getWeekLabel = (offset: number) => {
    if (offset === 0) return "This Week";
    const weekDates = getWeekDates(offset);
    const startDate = new Date(weekDates[0] + "T00:00:00"); // Add time to avoid timezone issues
    const endDate = new Date(weekDates[4] + "T00:00:00");
    const options = { month: "short" as const, day: "numeric" as const };

    const start = startDate.toLocaleDateString("en-US", options);
    const end = endDate.toLocaleDateString("en-US", options);

    if (offset === -1) return `Last Week (${start} - ${end})`;

    return `${start} - ${end}`;
  };

  const buildTeacherTrend = async (offset: number) => {
    if (!schoolId || !user?.id) return;
    const weekDates = getWeekDates(offset);
    const weekRecords = await Promise.all(
      weekDates.map((date) =>
        db.getTeacherAttendance(schoolId, user?.id || "", date),
      ),
    );
    const trendData = weekDates.map((date, index) => {
      const record = weekRecords[index];
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
      const hasAnyRecord = trendData.some((item) => item.status !== "missing");
      return hasAnyRecord ? trendData : prev;
    });
  };

  // Refresh attendance data when returning from attendance page
  useEffect(() => {
    let isMounted = true;

    // Re-check for missed attendance when returning to dashboard
    const checkAttendance = async () => {
      const todayStr = getLocalDateString();

      const todayAttendance = await db.getTeacherAttendance(
        schoolId || undefined,
        user?.id || "",
        todayStr,
      );

      try {
        if (!schoolId) return;
        const config = await db.getSchoolConfig(schoolId);
        if (!isMounted) return;

        const currentDate = new Date();
        const reopenDateObj = config.schoolReopenDate
          ? new Date(config.schoolReopenDate + "T00:00:00")
          : null;
        if (reopenDateObj) reopenDateObj.setHours(0, 0, 0, 0);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const nextTermBeginsObj = config.nextTermBegins
          ? new Date(config.nextTermBegins + "T00:00:00")
          : null;
        if (nextTermBeginsObj) nextTermBeginsObj.setHours(0, 0, 0, 0);

        // Don't show missed attendance reminders on the nextTermBegins day
        if (
          nextTermBeginsObj &&
          today.getTime() === nextTermBeginsObj.getTime()
        ) {
          setMissedAttendanceModal({ show: false, dates: [] });
          setMissedStudentAttendanceModal({ show: false, date: "" });
          return;
        }

        const vacationDateObj = config.vacationDate
          ? new Date(config.vacationDate + "T00:00:00")
          : null;
        if (vacationDateObj) vacationDateObj.setHours(0, 0, 0, 0);

        const schoolHasReopened =
          !reopenDateObj || currentDate >= reopenDateObj;
        const isOnVacation =
          vacationDateObj &&
          nextTermBeginsObj &&
          today >= vacationDateObj &&
          today < nextTermBeginsObj;

        if (schoolHasReopened && !isOnVacation) {
          // Find all missed school days since reopen date
          const missedDates: string[] = [];
          let checkDate = new Date();
          checkDate.setDate(checkDate.getDate() - 1); // Start from yesterday

          // Go back until we reach the reopen date
          while (checkDate >= reopenDateObj) {
            const dayOfWeek = checkDate.getDay();
            const isVacationDay =
              vacationDateObj &&
              checkDate.toDateString() === vacationDateObj.toDateString();

            // Skip weekends and vacation days
            if (dayOfWeek === 0 || dayOfWeek === 6 || isVacationDay) {
              checkDate.setDate(checkDate.getDate() - 1);
              continue;
            }

            const dateString = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, "0")}-${String(checkDate.getDate()).padStart(2, "0")}`;
            const attendance = await db.getTeacherAttendance(
              schoolId,
              user?.id || "",
              dateString,
            );
            if (!isMounted) return;
            if (!attendance) {
              missedDates.push(dateString);
            }
            checkDate.setDate(checkDate.getDate() - 1);
          }

          if (missedDates.length > 0) {
            setMissedAttendanceModal({ show: true, dates: missedDates });
          } else {
            setMissedAttendanceModal({ show: false, dates: [] });
          }

          // Check for missed student attendance (keep only the most recent for student attendance)
          if (selectedClassId && missedDates.length > 0) {
            const mostRecentMissed = missedDates[0]; // First in array is most recent
            const studentAttendanceRecord = await db.getAttendance(
              schoolId,
              selectedClassId,
              mostRecentMissed,
            );
            if (!isMounted) return;
            if (!studentAttendanceRecord) {
              setMissedStudentAttendanceModal({
                show: true,
                date: mostRecentMissed,
              });
            } else {
              setMissedStudentAttendanceModal({ show: false, date: "" });
            }
          }
        }
      } catch (error) {
        console.error("Error re-checking missed attendance:", error);
      }
    };

    if (user) checkAttendance();

    return () => {
      isMounted = false;
    };
  }, [user, selectedClassId, weekOffset, schoolId]);

  useEffect(() => {
    if (!schoolId || !user?.id) return;
    buildTeacherTrend(weekOffset);
  }, [schoolId, user?.id, weekOffset]);

  useEffect(() => {
    if (!schoolId || !user?.id) return;
    const attendanceRef = query(
      collection(firestore, "teacher_attendance"),
      where("schoolId", "==", schoolId),
      where("teacherId", "==", user.id),
    );
    const unsubscribe = onSnapshot(attendanceRef, async () => {
      await buildTeacherTrend(weekOffset);
      const today = getLocalDateString();
      const attendance = await db.getTeacherAttendance(
        schoolId,
        user.id,
        today,
      );
      setTeacherAttendance(attendance);
    });

    return () => unsubscribe();
  }, [schoolId, user?.id, weekOffset]);

  useEffect(() => {
    if (!schoolId || !selectedClassId) return;
    const attendanceRef = query(
      collection(firestore, "attendance"),
      where("schoolId", "==", schoolId),
      where("classId", "==", selectedClassId),
    );
    const unsubscribe = onSnapshot(attendanceRef, async () => {
      try {
        const [attendanceRecords, students] = await Promise.all([
          db.getClassAttendance(schoolId, selectedClassId),
          db.getStudents(schoolId, selectedClassId),
        ]);

        const totalStudents = students.length || 1;
        const weekDates = getWeekDates(weekOffset);
        const weekRecords = attendanceRecords.filter((record) =>
          weekDates.includes(record.date),
        );

        const trendData = weekDates.map((date) => {
          const record = weekRecords.find((r) => r.date === date);
          const percentage = record
            ? Math.round(
                (record.presentStudentIds.length / totalStudents) * 100,
              )
            : 0;
          const [y, m, d] = date.split("-").map(Number);
          const dateObj = new Date(y, m - 1, d);
          const dayName = dateObj.toLocaleDateString("en-US", {
            weekday: "short",
          });
          return { day: dayName, percentage };
        });

        setAttendanceTrend(trendData);

        setTotalStudents(students.length);
        const todayStr = getLocalDateString();
        const todayAttendance = attendanceRecords.find(
          (r) => r.date === todayStr,
        );
        const presentTodayCount = todayAttendance
          ? todayAttendance.presentStudentIds.length
          : 0;
        setPresentToday(presentTodayCount);
        setAbsentToday(
          todayAttendance ? students.length - presentTodayCount : 0,
        );
      } catch (error) {
        console.error("Error updating attendance trend:", error);
      }
    });

    return () => unsubscribe();
  }, [schoolId, selectedClassId, weekOffset]);

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      if (!selectedClassId || !schoolId) return;

      // Fetch Config and Subjects
      let config: SchoolConfig;
      try {
        config = await db.getSchoolConfig(schoolId);
        if (isMounted) {
          setSchoolConfig(config);
          setCurrentTerm(config.currentTerm || `Term ${CURRENT_TERM}`);

          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const todayMs = today.getTime();

          let vacationDateMs: number | null = null;
          if (config.vacationDate) {
            const vd = new Date(config.vacationDate + "T00:00:00");
            vd.setHours(0, 0, 0, 0);
            vacationDateMs = vd.getTime();
          }

          let nextTermBeginsMs: number | null = null;
          if (config.nextTermBegins) {
            const nt = new Date(config.nextTermBegins + "T00:00:00");
            nt.setHours(0, 0, 0, 0);
            nextTermBeginsMs = nt.getTime();
          }

          let vacationStartMs: number | null = null;
          if (vacationDateMs !== null) {
            const vdPlusOne = new Date(vacationDateMs);
            vdPlusOne.setDate(vdPlusOne.getDate() + 1);
            vacationStartMs = vdPlusOne.getTime();
          }

          let shouldBeVacation = false;
          if (vacationStartMs !== null && todayMs >= vacationStartMs) {
            shouldBeVacation = nextTermBeginsMs
              ? todayMs < nextTermBeginsMs
              : true;
          }
          setIsVacation(shouldBeVacation);

          const shouldLockAttendance =
            Boolean(nextTermBeginsMs) &&
            todayMs >= nextTermBeginsMs! &&
            !config.schoolReopenDate;
          setAttendanceLocked(shouldLockAttendance);

          console.log("--- Vacation Overlay Debug ---");
          console.log(
            "Current Date (Local Midnight):",
            today.toLocaleDateString(),
          );
          console.log("Vacation Date (Last School Day):", config.vacationDate);
          console.log(
            "Vacation Starts (Local Midnight):",
            vacationStartMs
              ? new Date(vacationStartMs).toLocaleDateString()
              : "N/A",
          );
          console.log(
            "Next Term Begins (Local Midnight):",
            config.nextTermBegins,
          );
          console.log("Is Vacation:", shouldBeVacation);
          console.log("--- End Debug ---");

          // New Term Transition Logic: Check if nextTermBegins date is reached and reset needed
          if (config.nextTermBegins && todayMs >= nextTermBeginsMs) {
            if (config.termTransitionProcessed === false) {
              console.log(
                "New term begins today or has passed. Initiating dashboard reset...",
              );
              try {
                await db.resetForNewTerm(config);
                // Mark the transition as processed to prevent repeated resets on subsequent loads
                await db.updateSchoolConfig({
                  ...config,
                  termTransitionProcessed: true,
                });
                showToast("New term started! Dashboard has been reset.", {
                  type: "success",
                });
                window.location.reload(); // Reload to reflect new term's state
              } catch (resetError) {
                console.error("Error during new term reset:", resetError);
                showToast("Failed to reset dashboard for new term.", {
                  type: "error",
                });
              }
            } else {
              // Already processed, no need to change isVacation here
            }
          } else if (
            config.nextTermBegins &&
            todayMs < nextTermBeginsMs &&
            config.termTransitionProcessed === true
          ) {
            // If before nextTermBegins but already marked as processed, reset flag (e.g., if admin changes date backward)
            await db.updateSchoolConfig({
              ...config,
              termTransitionProcessed: false,
            });
          } else {
            // No nextTermBegins set, no need to change isVacation here
          }
        }
      } catch (e) {
        console.error(e);
        config = {
          currentTerm: `Term ${CURRENT_TERM}`,
          academicYear: ACADEMIC_YEAR,
          schoolReopenDate: "",
          schoolName: "School Manager GH",
          headTeacherRemark:
            "An outstanding performance. The school is proud of you.",
          termEndDate: "2024-12-20",
          vacationDate: "2024-12-20",
          nextTermBegins: "", // Ensure nextTermBegins is also included in fallback config
          termTransitionProcessed: false, // Default for fallback
          schoolId: "",
        };
      }

      // Fetch subjects from system settings for the selected class
      const currentSubjects = await db.getSubjects(schoolId, selectedClassId);
      if (!isMounted) return;
      setSubjects(currentSubjects);

      // Notices
      const noticeData = await db.getNotices(schoolId);
      if (!isMounted) return;
      setNotices(noticeData);

      // Teacher Attendance
      const today = getLocalDateString();
      const attendance = await db.getTeacherAttendance(
        schoolId,
        user?.id || "",
        today,
      );
      if (!isMounted) return;
      setTeacherAttendance(attendance);

      // Class Specific Data
      if (selectedClassId) {
        // 1. Timetable
        const t = await db.getTimetable(schoolId, selectedClassId);
        if (!isMounted) return;
        setTimetable(t || null);
        setSelectedDay(getCurrentDay());

        // 2. Real Attendance Trend (students)
        try {
          const [attendanceRecords, students] = await Promise.all([
            db.getClassAttendance(schoolId, selectedClassId),
            db.getStudents(schoolId, selectedClassId),
          ]);

          if (!isMounted) return;

          const totalStudents = students.length || 1;
          const weekDates = getWeekDates(weekOffset);
          const weekRecords = attendanceRecords.filter((record) =>
            weekDates.includes(record.date),
          );

          const trendData = weekDates.map((date) => {
            const record = weekRecords.find((r) => r.date === date);
            const percentage = record
              ? Math.round(
                  (record.presentStudentIds.length / totalStudents) * 100,
                )
              : 0;
            const [y, m, d] = date.split("-").map(Number);
            const dateObj = new Date(y, m - 1, d);
            const dayName = dateObj.toLocaleDateString("en-US", {
              weekday: "short",
            });
            return { day: dayName, percentage };
          });

          setAttendanceTrend(trendData);
          setClassStudents(students);

          setTotalStudents(students.length);
          const todayStr = getLocalDateString();
          const todayAttendance = attendanceRecords.find(
            (r) => r.date === todayStr,
          );
          const presentTodayCount = todayAttendance
            ? todayAttendance.presentStudentIds.length
            : 0;
          setPresentToday(presentTodayCount);
          setAbsentToday(
            todayAttendance ? students.length - presentTodayCount : 0,
          );

          // Class Average
          const currentTermNum = parseInt(
            (config.currentTerm || `Term ${CURRENT_TERM}`).split(" ")[1],
          );
          let totalScore = 0;
          let totalAssessments = 0;
          for (const subject of currentSubjects) {
            const assessments = await db.getAssessments(
              schoolId,
              selectedClassId,
              subject,
            );
            const termAssessments = assessments.filter(
              (a) => a.term === currentTermNum,
            );
            for (const assessment of termAssessments) {
              const score = assessment.total ?? calculateTotalScore(assessment);
              totalScore += score;
              totalAssessments++;
            }
          }
          const avg = totalAssessments > 0 ? totalScore / totalAssessments : 0;
          setClassAverage(avg);

          // Behavior Tracker
          const skills = await db.getStudentSkills(schoolId, selectedClassId);
          const termSkills = skills.filter((s) => s.term === currentTermNum);
          let totalConductScore = 0;
          let conductCount = 0;
          const conductMap: { [key: string]: number } = {
            Excellent: 5,
            "Very Good": 4,
            Good: 3,
            Fair: 2,
            Poor: 1,
          };
          for (const skill of termSkills) {
            if (skill.conduct) {
              totalConductScore += conductMap[skill.conduct] || 0;
              conductCount++;
            }
          }
          const avgConduct =
            conductCount > 0 ? totalConductScore / conductCount : 0;
          setBehaviorAverage(avgConduct.toFixed(1));

          // Subject Standings
          const standings: {
            subject: string;
            topStudent: string;
            average: number;
          }[] = [];
          for (const subject of currentSubjects) {
            const assessments = await db.getAssessments(
              schoolId,
              selectedClassId,
              subject,
            );
            const termAssessments = assessments.filter(
              (a) => a.term === currentTermNum,
            );
            if (termAssessments.length === 0) continue;
            let subjTotalScore = 0;
            let maxScore = 0;
            let topStudent = "";
            for (const assessment of termAssessments) {
              const score = assessment.total ?? calculateTotalScore(assessment);
              const student = students.find(
                (s) => s.id === assessment.studentId,
              );
              if (student && score > maxScore) {
                maxScore = score;
                topStudent = student.name;
              }
              subjTotalScore += score;
            }
            const avg = subjTotalScore / termAssessments.length;
            standings.push({ subject, topStudent, average: avg });
          }
          standings.sort((a, b) => b.average - a.average);
          setSubjectStandings(standings);
        } catch (error) {
          console.error("Error calculating dashboard stats:", error);
        }
      }

      // Teacher Attendance Trend (approved/pending)
      try {
        await buildTeacherTrend(weekOffset);
      } catch (error) {
        console.error("Error calculating teacher attendance trend:", error);
      }
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [selectedClassId, weekOffset, schoolId]);

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

  const handleMarkAttendance = async (status: "present" | "absent") => {
    if (!user?.id) return;
    if (attendanceLocked) {
      showToast(
        "Attendance is locked until the admin sets a school re-open date.",
        { type: "warning" },
      );
      return;
    }
    setMarkingAttendance(true);
    try {
      const today = getLocalDateString();
      const record: TeacherAttendanceRecord = {
        id: `${schoolId}_${user.id}_${today}`,
        date: today,
        teacherId: user.id,
        schoolId: schoolId || schoolConfig?.schoolId || "",
        status,
        approvalStatus: "pending",
      };
      await db.saveTeacherAttendance(record);
      setTeacherAttendance(record);

      // Notification
      await db.addSystemNotification(
        `${user?.fullName || "Teacher"} submitted ${status} attendance for ${today} (pending approval)`,
        "attendance",
        schoolId || schoolConfig?.schoolId || "",
      );
    } catch (err) {
      console.error(err);
    } finally {
      setMarkingAttendance(false);
    }
  };

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

            <button
              onClick={async () => {
                // Fetch students first if not loaded
                let students = classStudents;
                if (!students || students.length === 0) {
                  students = await db.getStudents(schoolId, selectedClassId);
                }

                const existingRemarks = await db.getStudentRemarks(
                  schoolId,
                  selectedClassId,
                );
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
                      behaviorTag:
                        | "Excellent"
                        | "Good"
                        | "Needs Improvement"
                        | "";
                    }
                  >,
                );
                setRemarksData(remarksMap);

                const existingSkills = await db.getStudentSkills(
                  schoolId,
                  selectedClassId,
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
                  {} as Record<string, any>,
                );
                setSkillsData(skillsMap);
                setStudentsForRemarks(students || []);
                setRemarksModalOpen(true);
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
                // Fetch students first if not loaded
                let students = classStudents;
                if (!students || students.length === 0) {
                  students = await db.getStudents(schoolId, selectedClassId);
                }

                const existingSkills = await db.getStudentSkills(
                  schoolId,
                  selectedClassId,
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
                  {} as Record<string, any>,
                );
                setSkillsData(skillsMap);
                setStudentsForSkills(students || []);
                setSkillsModalOpen(true);
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
                      {/* Tooltip - hidden on mobile, shown on larger screens */}
                      <div className="hidden sm:block absolute -top-8 bg-slate-800 text-white text-xs py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                        {data.percentage}%
                      </div>
                      {/* Mobile percentage display */}
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
          </div>
        </div>

        {/* Right Column: Notices & Schedule */}
        <div className="space-y-6">
          {/* Notice Board Widget */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center">
              <Bell className="w-5 h-5 mr-2 text-[#1160A8]" /> Notice Board
            </h3>
            <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
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

            {selectedClassId ? (
              <div className="space-y-4 relative min-h-[150px]">
                {scheduleForDay.length === 0 ? (
                  <div className="text-center py-10 text-slate-400 text-sm italic border-2 border-dashed border-slate-100 rounded-lg">
                    No schedule set for {selectedDay}.
                  </div>
                ) : (
                  <>
                    {/* Vertical Line */}
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
            )}
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

                <Link
                  to="/teacher/my-attendance"
                  onClick={() =>
                    setMissedAttendanceModal({ show: false, dates: [] })
                  }
                  className="flex-1 px-4 py-2 bg-[#1160A8] text-white rounded-lg hover:bg-[#0B4A82] transition-colors text-center"
                >
                  Mark Attendance Now
                </Link>
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
                  <strong>{assignedClass?.name}</strong> on{" "}
                  <strong>
                    {(() => {
                      const parts =
                        missedStudentAttendanceModal.date.split("-");
                      if (parts.length === 3) {
                        return `${parts[1]}/${parts[2]}/${parts[0]}`;
                      }
                      return missedStudentAttendanceModal.date;
                    })()}
                  </strong>{" "}
                  to keep records accurate.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() =>
                    setMissedStudentAttendanceModal({ show: false, date: "" })
                  }
                  className="flex-1 px-4 py-2 text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Remind Me Later
                </button>
                <Link
                  to="/teacher/attendance"
                  onClick={() =>
                    setMissedStudentAttendanceModal({ show: false, date: "" })
                  }
                  className="flex-1 px-4 py-2 text-center bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  Take Attendance
                </Link>
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
                      for (const student of studentsForRemarks) {
                        const termNum = parseInt(currentTerm.split(" ")[1]) as
                          | 1
                          | 2
                          | 3;
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
                        await db.saveStudentRemark(remark);
                      }
                      showToast("Remarks saved successfully!", {
                        type: "success",
                      });
                      setRemarksModalOpen(false);
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
                      const termNum = parseInt(currentTerm.split(" ")[1]) as
                        | 1
                        | 2
                        | 3;
                      for (const student of studentsForSkills) {
                        const skills: StudentSkills = {
                          id: `${student.id}_${currentTerm}_${ACADEMIC_YEAR}`,
                          studentId: student.id,
                          classId: selectedClassId,
                          term: termNum,
                          academicYear: ACADEMIC_YEAR,
                          schoolId: schoolId || schoolConfig?.schoolId || "",
                          ...skillsData[student.id],
                        };
                        await db.saveStudentSkills(skills);
                      }
                      showToast("Skills saved successfully!", {
                        type: "success",
                      });
                      setSkillsModalOpen(false);
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
