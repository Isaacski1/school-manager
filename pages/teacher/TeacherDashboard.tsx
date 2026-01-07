import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../../components/Layout';
import { useAuth } from '../../context/AuthContext';
import { CLASSES_LIST, CURRENT_TERM, ACADEMIC_YEAR, calculateTotalScore } from '../../constants';
import { db } from '../../services/mockDb';
import { Notice, TimeSlot, ClassTimetable, TeacherAttendanceRecord, Student, StudentRemark, StudentSkills, Assessment, SchoolConfig } from '../../types';
import { showToast } from '../../services/toast';
import TeacherAttendance from './TeacherAttendance';
import { ClipboardCheck, BookOpen, Clock, TrendingUp, Bell, ChevronDown, X } from 'lucide-react';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const SKILLS_LIST = ['punctuality', 'neatness', 'conduct', 'attitudeToWork', 'classParticipation', 'homeworkCompletion'];

const nurserySubjects = [
    "Language & Literacy",
    "Numeracy",
    "Environmental Studies",
    "Creative Arts",
    "Physical Development",
    "Social & Emotional Development",
    "Rhymes, Songs & Storytelling"
];

const kgSubjects = [
    "Literacy & Language",
    "Numeracy",
    "OWOP",
    "Creative Art",
    "Physical Education"
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
    "Physical Education"
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
    "Computing / Coding"
];

const TeacherDashboard = () => {
  const { user } = useAuth();

  const [subjects, setSubjects] = useState<string[]>([]);

  // Loading state for when user is not available
  if (!user) {
    return (
      <Layout title="Teacher Dashboard">
        <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600 mx-auto mb-4"></div>
          <p className="text-slate-500">Loading dashboard...</p>
        </div>
      </Layout>
    );
  }

  // Class selection for multi-class teachers
  const assignedClassIds = user?.assignedClassIds || [];
  const [selectedClassId, setSelectedClassId] = useState<string>('');

  // School Config State
  const [currentTerm, setCurrentTerm] = useState('Term 1');

  useEffect(() => {
      if (assignedClassIds.length > 0) {
          setSelectedClassId(assignedClassIds[0]);
      }
  }, [user]);

  const assignedClass = CLASSES_LIST.find(c => c.id === selectedClassId);
  const classNames = assignedClassIds.map(id => CLASSES_LIST.find(c => c.id === id)?.name).join(', ');

  const [notices, setNotices] = useState<Notice[]>([]);

  // Teacher Attendance State
  const [teacherAttendance, setTeacherAttendance] = useState<TeacherAttendanceRecord | null>(null);
  const [markingAttendance, setMarkingAttendance] = useState(false);
   const [missedAttendanceModal, setMissedAttendanceModal] = useState<{show: boolean, date: string}>({show: false, date: ''});
   const [missedStudentAttendanceModal, setMissedStudentAttendanceModal] = useState<{show: boolean, date: string}>({show: false, date: ''});

   // Remarks Modal State
   const [remarksModalOpen, setRemarksModalOpen] = useState(false);
   const [studentsForRemarks, setStudentsForRemarks] = useState<Student[]>([]);
   const [remarksData, setRemarksData] = useState<Record<string, { remark: string, behaviorTag: string }>>({});
   const [savingRemarks, setSavingRemarks] = useState(false);

   // Skills Modal State
   const [skillsModalOpen, setSkillsModalOpen] = useState(false);
   const [studentsForSkills, setStudentsForSkills] = useState<Student[]>([]);
   const [skillsData, setSkillsData] = useState<Record<string, StudentSkills>>({});
   const [savingSkills, setSavingSkills] = useState(false);

   // Class students for remarks
   const [classStudents, setClassStudents] = useState<Student[]>([]);
  
  // Helper to get current day
  const getCurrentDay = () => {
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    return DAYS.includes(today) ? today : 'Monday';
  };

  // Schedule State
  const [timetable, setTimetable] = useState<ClassTimetable | null>(null);
  const [selectedDay, setSelectedDay] = useState<string>(getCurrentDay());
  const [scheduleForDay, setScheduleForDay] = useState<TimeSlot[]>([]);

    // Attendance Trend State
    const [attendanceTrend, setAttendanceTrend] = useState<{ day: string, percentage: number }[]>([]);
    const [weekOffset, setWeekOffset] = useState(0);

    // Class Overview State
    const [totalStudents, setTotalStudents] = useState(0);
    const [presentToday, setPresentToday] = useState(0);
    const [absentToday, setAbsentToday] = useState(0);
    const [classAverage, setClassAverage] = useState(0);
    const [behaviorAverage, setBehaviorAverage] = useState('0.0');
    const [subjectStandings, setSubjectStandings] = useState<{subject: string, topStudent: string, average: number}[]>([]);

    const getWeekDates = (offset = 0) => {
        const now = new Date();
        // Go back by N weeks
        now.setDate(now.getDate() + (offset * 7));

        const currentDay = now.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
        const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay; // Adjust to get Monday
        const monday = new Date(now);
        monday.setDate(now.getDate() + mondayOffset);

        const dates: string[] = [];
        for (let i = 0; i < 5; i++) { // Monday to Friday
            const date = new Date(monday);
            date.setDate(monday.getDate() + i);
            // Build local YYYY-MM-DD to avoid UTC timezone shifts from toISOString()
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            dates.push(`${y}-${m}-${d}`);
        }
        return dates;
    };

    const getWeekLabel = (offset: number) => {
        if (offset === 0) return "This Week";
        const weekDates = getWeekDates(offset);
        const startDate = new Date(weekDates[0] + 'T00:00:00'); // Add time to avoid timezone issues
        const endDate = new Date(weekDates[4] + 'T00:00:00');
        const options = { month: 'short' as const, day: 'numeric' as const };
        
        const start = startDate.toLocaleDateString('en-US', options);
        const end = endDate.toLocaleDateString('en-US', options);
        
        if (offset === -1) return `Last Week (${start} - ${end})`;
        
        return `${start} - ${end}`;
    };

  // Refresh attendance data when returning from attendance page
  useEffect(() => {
      // Re-check for missed attendance when returning to dashboard
      const checkAttendance = async () => {
        const today = new Date().toISOString().split('T')[0];

        const todayAttendance = await db.getTeacherAttendance(user?.id || '', today);

        try {
          const config = await db.getSchoolConfig();
          const currentDate = new Date();
          const schoolHasReopened = config.schoolReopenDate && currentDate >= new Date(config.schoolReopenDate);

          if (schoolHasReopened) {
            // Find the most recent weekday before today
            const todayDate = new Date();
            const previousWeekday = new Date(todayDate);
            let dayOfWeek = previousWeekday.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
            const vacationDateObj = config.vacationDate ? new Date(config.vacationDate + 'T00:00:00') : null; // Parse to local date

            // Go back one day at a time until we hit a weekday (Mon-Fri) AND not a vacation day
            do {
              previousWeekday.setDate(previousWeekday.getDate() - 1);
              dayOfWeek = previousWeekday.getDay();
              const isVacationDay = vacationDateObj && previousWeekday.toDateString() === vacationDateObj.toDateString();
              if (dayOfWeek === 0 || dayOfWeek === 6 || isVacationDay) {
                  continue;
              }
            } while (true);
            const previousSchoolDay = `${previousWeekday.getFullYear()}-${String(previousWeekday.getMonth() + 1).padStart(2, '0')}-${String(previousWeekday.getDate()).padStart(2, '0')}`;
            // Only check if the previous school day is on or after the reopen date
            if (previousSchoolDay >= config.schoolReopenDate) {
              const attendance = await db.getTeacherAttendance(user?.id || '', previousSchoolDay);
              if (!attendance) {
                setMissedAttendanceModal({show: true, date: previousSchoolDay});
              } else {
                setMissedAttendanceModal({show: false, date: ''});
              }
            }
          }
        } catch (error) {
          console.error('Error re-checking missed attendance:', error);
        }
      };

      if (user) checkAttendance();
  }, [user]);

  useEffect(() => {
    const fetchData = async () => {
        // Fetch Config and Subjects
        let config: SchoolConfig;
        try {
            config = await db.getSchoolConfig();
            setCurrentTerm(config.currentTerm || `Term ${CURRENT_TERM}`);
        } catch (e) {
            console.error(e);
            config = { 
                currentTerm: `Term ${CURRENT_TERM}`, 
                academicYear: ACADEMIC_YEAR, 
                schoolReopenDate: '',
                schoolName: 'Noble Care Academy', // Default value
                headTeacherRemark: 'An outstanding performance. The school is proud of you.', // Default value
                termEndDate: '2024-12-20', // Default value
                vacationDate: '2024-12-20' // Default value
            };
        }

        // Fetch subjects from system settings for the selected class
        const currentSubjects = await db.getSubjects(selectedClassId);
        setSubjects(currentSubjects);

        // Notices
        const noticeData = await db.getNotices();
        setNotices(noticeData);

        // Teacher Attendance
        const today = new Date().toISOString().split('T')[0];
        const attendance = await db.getTeacherAttendance(user?.id || '', today);
        setTeacherAttendance(attendance);

        // Check for missed attendance on the previous school day (weekday)
        try {
          const config = await db.getSchoolConfig();
          const currentDate = new Date();
          const schoolHasReopened = config.schoolReopenDate && currentDate >= new Date(config.schoolReopenDate);

          if (schoolHasReopened) {
            // Find the most recent weekday before today
            const today = new Date();
            const previousWeekday = new Date(today);
            let dayOfWeek = previousWeekday.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
            const vacationDateObj = config.vacationDate ? new Date(config.vacationDate + 'T00:00:00') : null; // Parse to local date

            // Go back one day at a time until we hit a weekday (Mon-Fri) AND not a vacation day
            do {
              previousWeekday.setDate(previousWeekday.getDate() - 1);
              dayOfWeek = previousWeekday.getDay();
              const isVacationDay = vacationDateObj && previousWeekday.toDateString() === vacationDateObj.toDateString();
              if (dayOfWeek === 0 || dayOfWeek === 6 || isVacationDay) {
                  continue;
              } else {
                  break;
              }
            } while (true);

            const previousSchoolDay = `${previousWeekday.getFullYear()}-${String(previousWeekday.getMonth() + 1).padStart(2, '0')}-${String(previousWeekday.getDate()).padStart(2, '0')}`;

            // Only check if the previous school day is on or after the reopen date
            if (config.schoolReopenDate && previousSchoolDay >= config.schoolReopenDate) {
              const attendance = await db.getTeacherAttendance(user?.id || '', previousSchoolDay);
              if (!attendance) {
                setMissedAttendanceModal({show: true, date: previousSchoolDay});
              }

              // Also check for missed STUDENT attendance for the selected class
              if (selectedClassId) {
                const studentAttendance = await db.getAttendance(selectedClassId, previousSchoolDay);
                if (!studentAttendance) {
                    setMissedStudentAttendanceModal({show: true, date: previousSchoolDay});
                }
              }
            }
          }
        } catch (error) {
          console.error('Error checking missed attendance:', error);
        }

        // Class Specific Data
        if (selectedClassId) {
            // 1. Timetable
            const t = await db.getTimetable(selectedClassId);
            setTimetable(t || null);

            // Ensure schedule defaults to "Today" whenever class loads/changes
            setSelectedDay(getCurrentDay());

            // 2. Real Attendance Trend
            try {
                // Fetch attendance records and students in parallel
                const [attendanceRecords, students] = await Promise.all([
                    db.getClassAttendance(selectedClassId),
                    db.getStudents(selectedClassId)
                ]);

                const totalStudents = students.length || 1; // Prevent division by zero

                // Get dates for the selected week
                const weekDates = getWeekDates(weekOffset);

                // Filter records to the selected week's dates
                const weekRecords = attendanceRecords.filter(record => weekDates.includes(record.date));

                // Map to trend data for each day of the week
                const trendData = weekDates.map(date => {
                    const record = weekRecords.find(r => r.date === date);
                    const percentage = record ? Math.round((record.presentStudentIds.length / totalStudents) * 100) : 0;
                    const [y, m, d] = date.split('-').map(Number);
                    const dateObj = new Date(y, m - 1, d); // construct local date to avoid timezone shift
                    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' }); // "Mon", "Tue"
                    return { day: dayName, percentage };
                });

                setAttendanceTrend(trendData);
                setClassStudents(students);

                // Class Overview Calculations (only for current week)
                if (weekOffset === 0) {
                    setTotalStudents(students.length);
                    const today = new Date().toISOString().split('T')[0];
                    const todayAttendance = attendanceRecords.find(r => r.date === today);
                    const presentTodayCount = todayAttendance ? todayAttendance.presentStudentIds.length : 0;
                    setPresentToday(presentTodayCount);
                    setAbsentToday(students.length - presentTodayCount);
                } else {
                    // Reset today's stats when viewing past weeks
                    setPresentToday(0);
                    setAbsentToday(0);
                }

                // Class Average
                const currentTermNum = parseInt((config.currentTerm || `Term ${CURRENT_TERM}`).split(' ')[1]);
                let totalScore = 0;
                let totalAssessments = 0;
                for (const subject of currentSubjects) { // Use currentSubjects
                    const assessments = await db.getAssessments(selectedClassId, subject);
                    const termAssessments = assessments.filter(a => a.term === currentTermNum);
                    for (const assessment of termAssessments) {
                        const score = assessment.total ?? calculateTotalScore(assessment); // Use ?? and new function
                        totalScore += score;
                        totalAssessments++;
                    }
                }
                const avg = totalAssessments > 0 ? (totalScore / totalAssessments) : 0;
                setClassAverage(avg);

                // Behavior Tracker
                const skills = await db.getStudentSkills(selectedClassId);
                const termSkills = skills.filter(s => s.term === currentTermNum);
                let totalConductScore = 0;
                let conductCount = 0;
                const conductMap: {[key: string]: number} = {'Excellent': 5, 'Very Good': 4, 'Good': 3, 'Fair': 2, 'Poor': 1};
                for (const skill of termSkills) {
                    if (skill.conduct) {
                        totalConductScore += conductMap[skill.conduct] || 0;
                        conductCount++;
                    }
                }
                const avgConduct = conductCount > 0 ? totalConductScore / conductCount : 0;
                setBehaviorAverage(avgConduct.toFixed(1));

                // Subject Standings
                const standings: {subject: string, topStudent: string, average: number}[] = [];
                for (const subject of currentSubjects) { // Use currentSubjects
                    const assessments = await db.getAssessments(selectedClassId, subject);
                    const termAssessments = assessments.filter(a => a.term === currentTermNum);
                    if (termAssessments.length === 0) continue;
                    let totalScore = 0;
                    let maxScore = 0;
                    let topStudent = '';
                    for (const assessment of termAssessments) {
                        const score = assessment.total ?? calculateTotalScore(assessment); // Use ?? and new function
                        const student = students.find(s => s.id === assessment.studentId);
                        if (student && score > maxScore) {
                            maxScore = score;
                            topStudent = student.name;
                        }
                        totalScore += score;
                    }
                    const avg = totalScore / termAssessments.length;
                    standings.push({subject, topStudent, average: avg});
                }
                standings.sort((a,b) => b.average - a.average);
                setSubjectStandings(standings);

            } catch (error) {
                console.error("Error calculating dashboard stats:", error);
            }
        }
    };
    fetchData();
    }, [selectedClassId, weekOffset]);

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
        case 'break': return { border: 'border-amber-400', bgHover: 'group-hover:bg-amber-50', text: 'text-amber-700 italic', badge: 'text-amber-600' };
        case 'worship': return { border: 'border-purple-400', bgHover: 'group-hover:bg-purple-50', text: 'text-purple-700 font-semibold', badge: 'text-purple-600' };
        case 'closing': return { border: 'border-slate-400', bgHover: 'group-hover:bg-slate-50', text: 'text-slate-700 font-bold', badge: 'text-slate-600' };
        default: return { border: 'border-red-500', bgHover: 'group-hover:bg-red-50', text: 'text-slate-800', badge: 'text-red-600' };
    }
  };

  const handleMarkAttendance = async (status: 'present' | 'absent') => {
    if (!user?.id) return;
    setMarkingAttendance(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const record: TeacherAttendanceRecord = {
        id: `${user.id}_${today}`,
        date: today,
        teacherId: user.id,
        status
      };
      await db.saveTeacherAttendance(record);
      setTeacherAttendance(record);

      // Notification
      await db.addSystemNotification(
        `${user.name} marked themselves as ${status} on ${today}`,
        'attendance'
      );
    } catch (err) {
      console.error(err);
    } finally {
      setMarkingAttendance(false);
    }
  };

  return (
    <Layout title="Teacher Dashboard">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
            <h1 className="text-2xl font-bold text-slate-800">Welcome back, {user?.name}</h1>
            <p className="text-slate-500 mt-1">
              <span className="inline-block w-2 h-2 rounded-full bg-red-600 mr-2"></span>
              Class Teacher for: <span className="font-semibold text-slate-800">{classNames || "Not Assigned"}</span>
            </p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 items-end sm:items-center">
            {/* Class Context Switcher */}
            {assignedClassIds.length > 1 && (
                <div className="flex items-center bg-white border border-slate-200 rounded-lg px-3 py-1.5 shadow-sm">
                    <span className="text-xs font-bold text-slate-500 uppercase mr-2">Viewing:</span>
                    <select 
                        value={selectedClassId}
                        onChange={(e) => setSelectedClassId(e.target.value)}
                        className="text-sm font-semibold text-slate-800 bg-transparent outline-none cursor-pointer"
                    >
                        {assignedClassIds.map(id => {
                            const c = CLASSES_LIST.find(cls => cls.id === id);
                            return <option key={id} value={id}>{c?.name}</option>
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
                <Link to="/teacher/attendance" className="group block bg-white p-6 rounded-xl shadow-sm border border-slate-100 hover:border-red-500 transition-all relative overflow-hidden">
                    <div className="absolute right-0 top-0 w-24 h-24 bg-red-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                    <div className="relative z-10">
                        <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center mb-4 group-hover:bg-red-800 transition-colors">
                            <ClipboardCheck className="w-6 h-6 text-red-700 group-hover:text-white" />
                        </div>
                        <h3 className="font-bold text-lg text-slate-800 mb-1">Take Attendance</h3>
                        <p className="text-sm text-slate-500">Record daily register for {assignedClass?.name || 'your class'}.</p>
                    </div>
                </Link>

                <Link to="/teacher/assessment" className="group block bg-white p-6 rounded-xl shadow-sm border border-slate-100 hover:border-amber-500 transition-all relative overflow-hidden">
                    <div className="absolute right-0 top-0 w-24 h-24 bg-amber-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                    <div className="relative z-10">
                        <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center mb-4 group-hover:bg-amber-500 transition-colors">
                            <BookOpen className="w-6 h-6 text-amber-600 group-hover:text-white" />
                        </div>
                        <h3 className="font-bold text-lg text-slate-800 mb-1">Gradebook</h3>
                        <p className="text-sm text-slate-500">Record marks for tests, homework & exams.</p>
                    </div>
                </Link>

                <Link to="/teacher/my-attendance" className="group block bg-white p-6 rounded-xl shadow-sm border border-slate-100 hover:border-green-500 transition-all relative overflow-hidden w-full text-left">
                    <div className="absolute right-0 top-0 w-24 h-24 bg-green-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                    <div className="relative z-10">
                        <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4 group-hover:bg-green-500 transition-colors">
                            <ClipboardCheck className="w-6 h-6 text-green-600 group-hover:text-white" />
                        </div>
                        <h3 className="font-bold text-lg text-slate-800 mb-1">My Attendance</h3>
                        <p className="text-sm text-slate-500">Mark weekly attendance & view records</p>
                        {teacherAttendance && (
                          <p className="text-xs text-slate-400 mt-1">
                            Last marked: {teacherAttendance.date}
                          </p>
                        )}
                    </div>
                </Link>

                <button onClick={async () => { 
                    const existingRemarks = await db.getStudentRemarks(selectedClassId);
                    const remarksMap = existingRemarks.reduce((acc, remark) => {
                        acc[remark.studentId] = { remark: remark.remark, behaviorTag: remark.behaviorTag };
                        return acc;
                    }, {} as Record<string, { remark: string, behaviorTag: string }>);
                    setRemarksData(remarksMap);

    const existingSkills = await db.getStudentSkills(selectedClassId);
    const skillsMap = existingSkills.reduce((acc, skill) => {
        acc[skill.studentId] = {
            punctuality: skill.punctuality,
            neatness: skill.neatness,
            conduct: skill.conduct,
            attitudeToWork: skill.attitudeToWork,
            classParticipation: skill.classParticipation,
            homeworkCompletion: skill.homeworkCompletion,
        };
        return acc;
    }, {} as Record<string, any>);
    setSkillsData(skillsMap);
                    setStudentsForRemarks(classStudents); 
                    setRemarksModalOpen(true); 
                }} className="group block bg-white p-6 rounded-xl shadow-sm border border-slate-100 hover:border-purple-500 transition-all relative overflow-hidden w-full text-left">
                    <div className="absolute right-0 top-0 w-24 h-24 bg-purple-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                    <div className="relative z-10">
                        <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4 group-hover:bg-purple-500 transition-colors">
                            <BookOpen className="w-6 h-6 text-purple-600 group-hover:text-white" />
                        </div>
                        <h3 className="font-bold text-lg text-slate-800 mb-1">Write Remarks</h3>
                        <p className="text-sm text-slate-500">End of term comments & behavior tags.</p>
                    </div>
                </button>

                <button onClick={async () => {
                    const existingSkills = await db.getStudentSkills(selectedClassId);
                    const skillsMap = existingSkills.reduce((acc, skill) => {
                        acc[skill.studentId] = {
                            punctuality: skill.punctuality,
                            neatness: skill.neatness,
                            conduct: skill.conduct,
                            attitudeToWork: skill.attitudeToWork,
                            classParticipation: skill.classParticipation,
                            homeworkCompletion: skill.homeworkCompletion,
                        };
                        return acc;
                    }, {} as Record<string, any>);
                    setSkillsData(skillsMap);
                    setStudentsForSkills(classStudents);
                    setSkillsModalOpen(true);
                }} className="group block bg-white p-6 rounded-xl shadow-sm border border-slate-100 hover:border-blue-500 transition-all relative overflow-hidden w-full text-left">
                    <div className="absolute right-0 top-0 w-24 h-24 bg-blue-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                    <div className="relative z-10">
                        <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4 group-hover:bg-blue-500 transition-colors">
                            <TrendingUp className="w-6 h-6 text-blue-600 group-hover:text-white" />
                        </div>
                        <h3 className="font-bold text-lg text-slate-800 mb-1">Edit Skills</h3>
                        <p className="text-sm text-slate-500">Rate student skills and behavior.</p>
                    </div>
                </button>
            </div>

            {/* Class Overview Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                    <h4 className="font-bold text-slate-800 mb-2">Class Health</h4>
                    <div className="space-y-1 text-sm">
                        <div className="flex justify-between"><span>Total Students:</span><span className="font-semibold">{totalStudents}</span></div>
                        <div className="flex justify-between"><span>Present Today:</span><span className="font-semibold text-green-600">{presentToday}</span></div>
                        <div className="flex justify-between"><span>Absent Today:</span><span className="font-semibold text-red-600">{absentToday}</span></div>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                    <h4 className="font-bold text-slate-800 mb-2">Average Performance</h4>
                    <div className="text-center">
                        {classAverage > 0 ? (
                            <span className="text-2xl font-bold text-blue-600">{classAverage.toFixed(1)}%</span>
                        ) : (
                            <span className="text-sm text-slate-400 italic">No assessment data.</span>
                        )}
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                    <h4 className="font-bold text-slate-800 mb-2">Behavior Average</h4>
                    <div className="text-center">
                        {parseFloat(behaviorAverage) > 0 ? (
                            <span className="text-lg font-semibold text-purple-600">{behaviorAverage}/5</span>
                        ) : (
                            <span className="text-sm text-slate-400 italic">No behavior data.</span>
                        )}
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                    <h4 className="font-bold text-slate-800 mb-2">Subject Standings</h4>
                    <div className="space-y-1 max-h-20 overflow-y-auto">
                        {subjectStandings.slice(0,3).map(s => (
                            <div key={s.subject} className="flex justify-between text-xs">
                                <span>{s.subject}:</span>
                                <span className="font-semibold">{s.topStudent || 'N/A'}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Attendance Chart Visualization */}
            <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-slate-100">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 sm:mb-8 gap-3 sm:gap-0">
                    <h3 className="font-bold text-slate-800 flex items-center text-base sm:text-lg">
                        <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 mr-2 text-red-700"/> Weekly Attendance Trend
                    </h3>
                    <div className="flex gap-2 items-center w-full sm:w-auto justify-center sm:justify-start">
                        <button
                            onClick={() => setWeekOffset(weekOffset - 1)}
                            className="px-3 py-1.5 text-xs font-medium rounded-full bg-slate-100 hover:bg-slate-200 transition-colors min-w-[60px] touch-manipulation"
                        >
                            &larr; Prev
                        </button>
                        <span className="px-3 py-1.5 text-xs font-medium rounded-full bg-red-600 text-white text-center min-w-[120px] sm:w-36 truncate">
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
                             <TrendingUp className="w-6 h-6 sm:w-8 sm:h-8 mb-2 opacity-30"/>
                             <p className="text-xs sm:text-sm italic">No attendance records found.</p>
                         </div>
                    ) : (
                        attendanceTrend.map((data, i) => (
                            <div key={i} className="flex flex-col items-center flex-1 group min-w-0">
                                <div className="relative w-full flex justify-center">
                                    <div
                                        className="w-full max-w-[32px] sm:max-w-[40px] bg-slate-100 rounded-t-lg transition-all duration-500 group-hover:bg-red-100 relative overflow-hidden"
                                        style={{ height: '120px' }}
                                    >
                                        <div
                                            className="absolute bottom-0 left-0 right-0 bg-red-600 rounded-t-lg transition-all duration-1000"
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
        </div>

        {/* Right Column: Notices & Schedule */}
        <div className="space-y-6">
            
            {/* Notice Board Widget */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                <h3 className="font-bold text-slate-800 mb-4 flex items-center">
                    <Bell className="w-5 h-5 mr-2 text-red-700"/> Notice Board
                </h3>
                <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
                    {notices.length === 0 ? (
                         <div className="text-center py-6 text-slate-400 italic text-sm">
                            No announcements at this time.
                        </div>
                    ) : (
                        notices.map(notice => (
                            <div key={notice.id} className="group relative pl-4 pb-2 border-l-2 border-slate-200 hover:border-red-400 transition-colors">
                                <div className={`absolute -left-[5px] top-1 w-2.5 h-2.5 rounded-full border-2 border-white ${notice.type === 'urgent' ? 'bg-red-500' : 'bg-amber-400'} shadow-sm`}></div>
                                <div>
                                    <div className="flex justify-between items-start mb-1">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{notice.date}</span>
                                        {notice.type === 'urgent' && <span className="text-[10px] text-red-500 font-bold px-1.5 py-0.5 bg-red-50 rounded">URGENT</span>}
                                    </div>
                                    <p className="text-sm font-medium text-slate-800 leading-snug">{notice.message}</p>
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
                        <Clock className="w-5 h-5 mr-2 text-red-700"/> Class Schedule
                    </h3>
                    <select 
                        value={selectedDay} 
                        onChange={(e) => setSelectedDay(e.target.value)}
                        className="text-xs font-bold text-red-700 bg-red-50 px-2 py-1 rounded uppercase border-none outline-none cursor-pointer hover:bg-red-100 transition-colors"
                    >
                        {DAYS.map(day => <option key={day} value={day}>{day}</option>)}
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
                                        <div className={`absolute left-0 top-1.5 w-5 h-5 bg-white border-2 rounded-full z-10 transition-colors ${styles.border} ${styles.bgHover}`}></div>
                                        <div className="flex items-baseline justify-between">
                                            <p className="text-xs text-slate-500 font-mono">{slot.startTime} - {slot.endTime}</p>
                                            {slot.type !== 'lesson' && <span className={`text-[10px] font-bold uppercase ${styles.badge}`}>{slot.type}</span>}
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
                    <div className="text-center py-10 text-slate-400">Select a class to view schedule.</div>
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
                  <h3 className="font-bold text-slate-900">Attendance Reminder</h3>
                  <p className="text-sm text-slate-500">You missed marking attendance for a previous school day</p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="text-sm text-amber-800">
                  Please mark your attendance for <strong>{new Date(missedAttendanceModal.date).toLocaleDateString()}</strong> to keep your records accurate.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setMissedAttendanceModal({show: false, date: ''})}
                  className="flex-1 px-4 py-2 text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Remind Me Later
                </button>
                {/* <button
                  onClick={() => {
                    setMissedAttendanceModal({show: false, date: ''});
                    setShowWeeklyAttendance(true);
                  }}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  Mark Attendance
                </button> */}
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
                <div className="p-2 bg-amber-100 rounded-full">
                  <Bell className="text-amber-600" size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">Student Attendance Reminder</h3>
                  <p className="text-sm text-slate-500">You missed marking student attendance for your class.</p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="text-sm text-amber-800">
                  Please mark student attendance for <strong>{assignedClass?.name}</strong> on <strong>{new Date(missedStudentAttendanceModal.date).toLocaleDateString()}</strong> to keep records accurate.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setMissedStudentAttendanceModal({show: false, date: ''})}
                  className="flex-1 px-4 py-2 text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Remind Me Later
                </button>
                <Link
                  to="/teacher/attendance"
                  onClick={() => setMissedStudentAttendanceModal({show: false, date: ''})}
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
                    <h3 className="font-bold text-slate-900">End of Term Remarks</h3>
                    <p className="text-sm text-slate-500">Write comments and select behavior tags for each student</p>
                  </div>
                </div>
                <button onClick={() => setRemarksModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full">
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="p-6">
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {studentsForRemarks.map(student => (
                  <div key={student.id} className="border rounded p-4">
                    <h4 className="font-semibold mb-2">{student.name}</h4>
                    <div className="mb-2">
                      <label className="block text-sm font-medium mb-1">Behavior Tag</label>
                      <select value={remarksData[student.id]?.behaviorTag || ''} onChange={(e) => setRemarksData(prev => ({ ...prev, [student.id]: { ...prev[student.id], behaviorTag: e.target.value } })) } className="w-full p-2 border rounded">
                        <option value="">Select Behavior</option>
                        <option value="Excellent">Excellent</option>
                        <option value="Good">Good</option>
                        <option value="Needs Improvement">Needs Improvement</option>
                      </select>
                    </div>
                    <div className="mb-2">
                      <label className="block text-sm font-medium mb-1">Remark</label>
                      <textarea value={remarksData[student.id]?.remark || ''} onChange={(e) => setRemarksData(prev => ({ ...prev, [student.id]: { ...prev[student.id], remark: e.target.value } })) } placeholder="Write remark..." className="w-full p-2 border rounded" rows={3} />
                    </div>
                    <div className="mb-2">
                      <label className="block text-sm font-medium mb-1">Suggestion Remarks</label>
                      <div className="max-h-32 overflow-y-auto border rounded p-2 bg-gray-50">
                        {[
                          "An excellent student who consistently shows outstanding performance and behavior.",
                          "A dedicated learner who participates actively in class activities.",
                          "Shows great potential and is making steady progress in all subjects.",
                          "A hardworking student who always completes assignments on time.",
                          "Demonstrates good leadership qualities and helps peers.",
                          "Has improved significantly this term and should continue the good work.",
                          "A well-behaved student who respects teachers and classmates.",
                          "Shows creativity and enthusiasm in learning new concepts.",
                          "Needs to focus more on studies and participate more in class.",
                          "Has the ability to excel with consistent effort and better time management."
                        ].map((suggestion, index) => (
                          <div key={index} className="mb-1">
                            <button onClick={() => setRemarksData(prev => ({ ...prev, [student.id]: { ...prev[student.id], remark: suggestion } })) } className="text-left text-sm text-blue-600 hover:text-blue-800 underline block w-full">{suggestion}</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex justify-end">
                <button onClick={async () => {
                  setSavingRemarks(true);
                  try {
                    const termNumber = parseInt(currentTerm.split(' ')[1]);
                    const promises = Object.entries(remarksData).map(async ([studentId, data]) => {
                      const d = data as { remark: string, behaviorTag: string };
                      if (d.remark || d.behaviorTag) {
                        const remark: StudentRemark = {
                          id: `${studentId}_${currentTerm.replace(' ', '_')}`,
                          studentId,
                          classId: selectedClassId || '',
                          term: termNumber as 1 | 2 | 3,
                          academicYear: ACADEMIC_YEAR,
                          remark: d.remark,
                          behaviorTag: d.behaviorTag as 'Excellent' | 'Good' | 'Needs Improvement',
                          teacherId: user?.id || '',
                          dateCreated: new Date().toISOString().split('T')[0]
                        };
                        return db.saveStudentRemark(remark);
                      }
                    });
                    await Promise.all(promises.filter(Boolean));
                    showToast('Remarks saved successfully', { type: 'success' });
                    setRemarksModalOpen(false);
                  } catch (e) {
                    console.error(e);
                    showToast('Error saving remarks', { type: 'error' });
                  } finally {
                    setSavingRemarks(false);
                  }
                }} disabled={savingRemarks} className="px-6 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50 flex items-center">
                  {savingRemarks && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>}
                  {savingRemarks ? 'Saving...' : 'Save All Remarks'}
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
                            <div className="p-2 bg-blue-100 rounded-full">
                                <TrendingUp className="text-blue-600" size={20} />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-900">Edit Student Skills</h3>
                                <p className="text-sm text-slate-500">Rate each student on the following skills</p>
                            </div>
                        </div>
                        <button onClick={() => setSkillsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full">
                            <X size={20} />
                        </button>
                    </div>
                </div>
                <div className="p-6">
                    <div className="space-y-4 max-h-96 overflow-y-auto">
                        {studentsForSkills.map(student => (
                            <div key={student.id} className="border rounded p-4">
                                <h4 className="font-semibold mb-2">{student.name}</h4>
                                <div className="grid grid-cols-2 gap-4">
                                    {SKILLS_LIST.map(skill => (
                                        <div key={skill} className="mb-2">
                                            <label className="block text-sm font-medium mb-1 capitalize">{skill.replace(/([A-Z])/g, ' $1')}</label>
                                            <select 
                                                value={skillsData[student.id]?.[skill] || ''} 
                                                onChange={(e) => setSkillsData(prev => ({ ...prev, [student.id]: { ...prev[student.id], [skill]: e.target.value } }))} 
                                                className="w-full p-2 border rounded"
                                            >
                                                <option value="">Select Rating</option>
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
                    <div className="mt-6 flex justify-end">
                        <button onClick={async () => {
                            setSavingSkills(true);
                            try {
                                const termNumber = parseInt(currentTerm.split(' ')[1]);
                                const promises = Object.entries(skillsData).map(async ([studentId, data]) => {
                                    const d = data as Partial<StudentSkills>;

                                    // Skip saving if no skills were entered for this student
                                    if (!d || Object.values(d).every(val => !val)) {
                                        return null;
                                    }

                                    const skills: StudentSkills = {
                                        id: `${studentId}_${currentTerm.replace(' ', '_')}`,
                                        studentId,
                                        classId: selectedClassId || '',
                                        term: termNumber as 1 | 2 | 3,
                                        academicYear: ACADEMIC_YEAR,
                                        punctuality: d.punctuality || 'Fair',
                                        neatness: d.neatness || 'Fair',
                                        conduct: d.conduct || 'Fair',
                                        attitudeToWork: d.attitudeToWork || 'Fair',
                                        classParticipation: d.classParticipation || 'Fair',
                                        homeworkCompletion: d.homeworkCompletion || 'Fair',
                                    };
                                    return db.saveStudentSkills(skills);
                                });
                                await Promise.all(promises.filter(Boolean));
                                showToast('Skills saved successfully', { type: 'success' });
                                setSkillsModalOpen(false);
                            } catch (e) {
                                console.error(e);
                                showToast('Error saving skills', { type: 'error' });
                            } finally {
                                setSavingSkills(false);
                            }
                        }} disabled={savingSkills} className="px-6 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 flex items-center">
                            {savingSkills && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>}
                            {savingSkills ? 'Saving...' : 'Save All Skills'}
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
