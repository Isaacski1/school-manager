import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import { showToast } from '../../services/toast';
import { db } from '../../services/mockDb';
import { firestore } from '../../services/firebase';
import { collection, onSnapshot, doc } from 'firebase/firestore';
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
  AlertOctagon
} from 'lucide-react';
import { Notice, Student, TeacherAttendanceRecord, SchoolConfig } from '../../types';
import { CLASSES_LIST, calculateGrade, getGradeColor, CURRENT_TERM, ACADEMIC_YEAR, calculateTotalScore } from '../../constants';

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    students: 0,
    teachers: 0,
    classes: CLASSES_LIST.length,
    maleStudents: 0,
    femaleStudents: 0,
    classAttendance: [] as { className: string, percentage: number, id: string }[]
  });
  const [notices, setNotices] = useState<Notice[]>([]);
  const [recentStudents, setRecentStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Teacher Attendance State
  const [teacherAttendance, setTeacherAttendance] = useState<TeacherAttendanceRecord[]>([]);
  const [teacherTermStats, setTeacherTermStats] = useState<any[]>([]);
  const [missedAttendanceAlerts, setMissedAttendanceAlerts] = useState<any[]>([]);
  const [missedStudentAttendanceAlerts, setMissedStudentAttendanceAlerts] = useState<any[]>([]);

    // Real-time metrics
    const [realTimeEnabled, setRealTimeEnabled] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const pollRef = React.useRef<number | null>(null);
    const [now, setNow] = useState<number>(Date.now());
    const [animatedStudents, setAnimatedStudents] = useState<number>(0);
    const [animatedAttendance, setAnimatedAttendance] = useState<number>(0);
    const [animatedGradeAvg, setAnimatedGradeAvg] = useState<number>(0);
    const [thisWeekAttendance, setThisWeekAttendance] = useState<number | null>(null);
    const [lastWeekAttendance, setLastWeekAttendance] = useState<number | null>(null);
  
  // Configuration State
  const [schoolConfig, setSchoolConfig] = useState<SchoolConfig>({
      academicYear: '',
      currentTerm: '',
      schoolReopenDate: '',
      schoolName: '', // Assuming these properties are always present based on SchoolConfig interface
      headTeacherRemark: '',
      termEndDate: '',
      vacationDate: ''
  });

  // Attendance Week Navigation (initialized to null, set after config loads)
  const [attendanceWeek, setAttendanceWeek] = useState<Date | null>(null);

  // Performance Stats
  const [gradeDistribution, setGradeDistribution] = useState<Record<string, number>>({ A:0, B:0, C:0, D:0, F:0 });
    const [topStudents, setTopStudents] = useState<{id: string, name: string, class: string, avg: number}[]>([]);
    const [gradeBuckets, setGradeBuckets] = useState<Record<string, {id: string, name: string, class: string, avg: number}[]>>({ A: [], B: [], C: [], D: [], F: [] });
    const [selectedGrade, setSelectedGrade] = useState<string | null>(null);

    // Advanced visualization state
    const [heatmapData, setHeatmapData] = useState<Record<string, Record<string, number>>>({}); // classId -> { subject: avg }
    const [comparativeData, setComparativeData] = useState<{ className: string; avg: number }[]>([]);
    const [gradeDistributionByClass, setGradeDistributionByClass] = useState<Record<string, Record<string, number>>>({});
    const [sparklines, setSparklines] = useState<Record<string, number[]>>({});

  // --- Modal States ---
  const [viewStudent, setViewStudent] = useState<Student | null>(null);
  const [performanceData, setPerformanceData] = useState<any>(null);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<Student>>({});

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
        const dashboardStats = await db.getDashboardStats();
        const students = await db.getStudents();
        const fetchedNotices = await db.getNotices();
        const config = await db.getSchoolConfig();

        // Teacher Attendance for today and term statistics
        const localToday = new Date();
        const today = `${localToday.getFullYear()}-${String(localToday.getMonth() + 1).padStart(2, '0')}-${String(localToday.getDate()).padStart(2, '0')}`;
        const teachers = await db.getUsers();

        // Get today's attendance
        const teacherAttendanceData = await db.getAllTeacherAttendance(today);

        // Get all teacher attendance records for term statistics
        const allTeacherRecords = await db.getAllTeacherAttendanceRecords();

        // Check for missed attendance on the previous school day (weekday)
        const missedAlerts: any[] = [];

        // Only check if school has reopened and there are attendance records in the database
        const currentDate = new Date();
        const reopenDateObj = config.schoolReopenDate ? new Date(config.schoolReopenDate + 'T00:00:00') : null;
        const schoolHasReopened = !reopenDateObj || currentDate >= reopenDateObj;
        const vacationDateObj = config.vacationDate ? new Date(config.vacationDate + 'T00:00:00') : null;
        if (vacationDateObj) vacationDateObj.setHours(0, 0, 0, 0);
        const nextTermBeginsObj = config.nextTermBegins ? new Date(config.nextTermBegins + 'T00:00:00') : null;
        currentDate.setHours(0, 0, 0, 0);
        const isOnVacation = vacationDateObj && nextTermBeginsObj && currentDate >= vacationDateObj && currentDate < nextTermBeginsObj;

        if (schoolHasReopened && !isOnVacation && allTeacherRecords.length > 0) {
            // Find the most recent weekday before today
            const today = new Date();
            const previousWeekday = new Date(today);
            let dayOfWeek = previousWeekday.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
            const vacationDateObj = config.vacationDate ? new Date(config.vacationDate + 'T00:00:00') : null; // Parse to local date
            
            // Parse reopen date as local date to avoid timezone issues
            const parseLocalDate = (dateStr: string): Date | null => {
                if (!dateStr) return null;
                let parts: string[] = [];
                if (dateStr.includes('-')) {
                    // Format: YYYY-MM-DD
                    parts = dateStr.split('-');
                    if (parts.length === 3) {
                        return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                    }
                } else if (dateStr.includes('/')) {
                    // Format: MM/DD/YYYY
                    parts = dateStr.split('/');
                    if (parts.length === 3) {
                        return new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
                    }
                }
                return null;
            };
            const reopenDateObjLocal = parseLocalDate(config.schoolReopenDate);

            // Go back one day at a time until we hit a weekday (Mon-Fri) AND not a vacation day
            do {
                previousWeekday.setDate(previousWeekday.getDate() - 1);
                dayOfWeek = previousWeekday.getDay();
                // Check if it's a vacation day
                const isVacationDay = vacationDateObj && previousWeekday.toDateString() === vacationDateObj.toDateString();

                // Skip Sunday (0), Saturday (6), and vacation days
                if (dayOfWeek === 0 || dayOfWeek === 6 || isVacationDay) {
                    continue; // Skip this day and go back one more
                } else {
                    break; // Found a valid previous school day
                }
            } while (true);

            const previousSchoolDay = `${previousWeekday.getFullYear()}-${String(previousWeekday.getMonth() + 1).padStart(2, '0')}-${String(previousWeekday.getDate()).padStart(2, '0')}`;

            // Only check if the previous school day is on or after the reopen date
            // This ensures we don't show alerts for dates during vacation when school just reopened
            const previousWeekdayTime = previousWeekday.getTime();
            const reopenDateTime = reopenDateObjLocal ? reopenDateObjLocal.getTime() : 0;
            
            const isDuringVacation = vacationDateObj && nextTermBeginsObj && previousWeekday >= vacationDateObj && previousWeekday < nextTermBeginsObj;
            if (previousWeekdayTime >= reopenDateTime && reopenDateTime > 0 && !isDuringVacation) {
                for (const teacher of teachers.filter(t => t.role === 'TEACHER')) {
                    const attendanceRecord = await db.getTeacherAttendance(teacher.id, previousSchoolDay);
                    if (!attendanceRecord) {
                        missedAlerts.push({
                            teacherId: teacher.id,
                            teacherName: teacher.name,
                            date: previousSchoolDay,
                            classes: teacher.assignedClassIds?.map(id =>
                                CLASSES_LIST.find(c => c.id === id)?.name
                            ).join(', ') || 'Not Assigned'
                        });
                    }
                }
            }
        }

        // Check for missed STUDENT attendance on the previous school day
        const missedStudentAlerts: any[] = [];
        if (schoolHasReopened && !isOnVacation) {
            const today = new Date();
            const previousWeekday = new Date(today);
            let dayOfWeek = previousWeekday.getDay();
            
            // Parse reopen date as local date to avoid timezone issues
            // Handle both "YYYY-MM-DD" and "MM/DD/YYYY" formats
            const parseLocalDate = (dateStr: string): Date | null => {
                if (!dateStr) return null;
                let parts: string[] = [];
                if (dateStr.includes('-')) {
                    // Format: YYYY-MM-DD
                    parts = dateStr.split('-');
                    if (parts.length === 3) {
                        return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                    }
                } else if (dateStr.includes('/')) {
                    // Format: MM/DD/YYYY
                    parts = dateStr.split('/');
                    if (parts.length === 3) {
                        return new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
                    }
                }
                return null;
            };
            const reopenDateObjLocal = parseLocalDate(config.schoolReopenDate);
            const vacationDateObjLocal = parseLocalDate(config.vacationDate);
            
            do {
                previousWeekday.setDate(previousWeekday.getDate() - 1);
                dayOfWeek = previousWeekday.getDay();
                
                // Check if the date falls within the vacation period.
                let isVacationDay = false;
                if (vacationDateObjLocal && reopenDateObjLocal) {
                    const previousDayAtMidnight = new Date(previousWeekday);
                    previousDayAtMidnight.setHours(0, 0, 0, 0);
                    if (previousDayAtMidnight >= vacationDateObjLocal && previousDayAtMidnight < reopenDateObjLocal) {
                        isVacationDay = true;
                    }
                }

                if (dayOfWeek === 0 || dayOfWeek === 6 || isVacationDay) {
                    continue;
                } else {
                    break;
                }
            } while (true);
            
            const previousSchoolDay = `${previousWeekday.getFullYear()}-${String(previousWeekday.getMonth() + 1).padStart(2, '0')}-${String(previousWeekday.getDate()).padStart(2, '0')}`;

            // Only show missed attendance alerts if the previous school day is on or after the reopen date
            // This ensures we don't show alerts for dates during vacation when school just reopened
            const previousWeekdayTime = previousWeekday.getTime();
            const reopenDateTime = reopenDateObjLocal ? reopenDateObjLocal.getTime() : 0;
            
            console.log('Debug - Reopen date config:', config.schoolReopenDate);
            console.log('Debug - Reopen parsed:', reopenDateObjLocal?.toDateString());
            console.log('Debug - Previous school day:', previousSchoolDay);
            console.log('Debug - Previous >= Reopen?:', previousWeekdayTime >= reopenDateTime);

            const isDuringVacation = vacationDateObj && nextTermBeginsObj && previousWeekday >= vacationDateObj && previousWeekday < nextTermBeginsObj;
            if (previousWeekdayTime >= reopenDateTime && reopenDateTime > 0 && !isDuringVacation) {
                for (const teacher of teachers.filter(t => t.role === 'TEACHER' && t.assignedClassIds && t.assignedClassIds.length > 0)) {
                    // Assuming a teacher is responsible for their first assigned class for this check
                    const classId = teacher.assignedClassIds![0];
                    const className = CLASSES_LIST.find(c => c.id === classId)?.name || 'Unknown Class';
                    const studentAttendanceRecord = await db.getAttendance(classId, previousSchoolDay);
                    if (!studentAttendanceRecord) {
                        missedStudentAlerts.push({
                            teacherId: teacher.id,
                            teacherName: teacher.name,
                            date: previousSchoolDay,
                            className: className,
                        });
                    }
                }
            } else {
                console.log('Debug - Skipping: previous weekday is before or equal to reopen date (or reopen date invalid)');
            }
        }

        // Calculate term statistics for each teacher (only from school reopen date)
        const teacherTermStats = teachers
            .filter(t => t.role === 'TEACHER')
            .map(teacher => {
                const teacherRecords = allTeacherRecords.filter(r => r.teacherId === teacher.id && r.date >= (config.schoolReopenDate || ''));
                const presentDays = teacherRecords.filter(r => r.status === 'present').length;
                const totalDays = teacherRecords.length;
                const attendanceRate = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;

                return {
                    id: teacher.id,
                    name: teacher.name,
                    classes: teacher.assignedClassIds?.map(id =>
                        CLASSES_LIST.find(c => c.id === id)?.name
                    ).join(', ') || 'Not Assigned',
                    presentDays,
                    totalDays,
                    attendanceRate
                };
            });

        // Map today's attendance records to include teacher names and classes
        const teacherAttendanceWithDetails = teacherAttendanceData.map(record => {
            const teacher = teachers.find(t => t.id === record.teacherId);
            return {
                ...record,
                teacherName: teacher?.name || 'Unknown',
                teacherClasses: teacher?.assignedClassIds?.map(id =>
                    CLASSES_LIST.find(c => c.id === id)?.name
                ).join(', ') || 'Not Assigned'
            };
        });

        setSchoolConfig({
            academicYear: config.academicYear,
            currentTerm: config.currentTerm,
            schoolReopenDate: config.schoolReopenDate || ''
        });
        
        // Use Dynamic Term Number from config string (e.g. "Term 2" -> 2)
        // Fallback to CURRENT_TERM constant if parsing fails
        let dynamicTerm = CURRENT_TERM;
        if (config.currentTerm) {
            const match = config.currentTerm.match(/\d+/);
            if (match) dynamicTerm = parseInt(match[0]);
        }

        // Performance Calculations
        const allAssessments = await db.getAllAssessments();
        
        // 1. Group by Student
        const studentScores: Record<string, { total: number, count: number, name: string, classId: string }> = {};
        
        // Map ID to Name for easier lookup
        const studentMap = new Map(students.map(s => [s.id, s]));

        allAssessments.forEach(a => {
            // Filter using the DYNAMIC term
            if(a.term === dynamicTerm as any && studentMap.has(a.studentId)) {
                if(!studentScores[a.studentId]) {
                    const s = studentMap.get(a.studentId)!;
                    studentScores[a.studentId] = { total: 0, count: 0, name: s.name, classId: s.classId };
                }
                const score = a.total ?? calculateTotalScore(a);
                studentScores[a.studentId].total += score;
                studentScores[a.studentId].count += 1;
            }
        });

        // 2. Calculate Averages & Grade Distribution (also build buckets)
        const counts = { A: 0, B: 0, C: 0, D: 0, F: 0 };
        const averagesList: {id:string,name: string, class: string, avg: number}[] = [];
        const buckets: Record<string, {id:string,name:string,class:string,avg:number}[]> = { A: [], B: [], C: [], D: [], F: [] };

        Object.entries(studentScores).forEach(([studentId, s]) => {
            const avg = s.count > 0 ? s.total / s.count : 0;
            const { grade } = calculateGrade(avg);
            if(counts[grade as keyof typeof counts] !== undefined) {
                counts[grade as keyof typeof counts]++;
            }
            const record = {
                id: studentId,
                name: s.name,
                class: CLASSES_LIST.find(c => c.id === s.classId)?.name || 'N/A',
                avg: parseFloat(avg.toFixed(1))
            };
            averagesList.push(record);
            if (buckets[grade]) buckets[grade].push(record);
        });

        // 3. Sort for Top Students
        averagesList.sort((a, b) => b.avg - a.avg);

        setStats({
          students: dashboardStats.studentsCount,
          teachers: dashboardStats.teachersCount,
          classes: CLASSES_LIST.length,
          maleStudents: dashboardStats.gender.male,
          femaleStudents: dashboardStats.gender.female,
          classAttendance: dashboardStats.classAttendance
        });
        setNotices(fetchedNotices);
        setRecentStudents(students.slice(-5).reverse());
        setTeacherAttendance(teacherAttendanceWithDetails);
        setTeacherTermStats(teacherTermStats);
        setMissedAttendanceAlerts(missedAlerts);
        setMissedStudentAttendanceAlerts(missedStudentAlerts);

        setGradeDistribution(counts);
        setTopStudents(averagesList.slice(0, 5));
        setGradeBuckets(buckets);
        setLastUpdated(new Date());
    } catch (err: any) {
        console.error("Dashboard fetch error:", err);
        setError("Failed to load dashboard data. Please check your internet connection or database permissions.");
    } finally {
        setLoading(false);
    }
  };

    // Lightweight stats fetch used by the live updater
    const fetchStats = async () => {
        try {
            const dashboardStats = await db.getDashboardStats();
                    // compute simple attendance average across classes
                    const classPctList = (dashboardStats.classAttendance || []).map((c: any) => c.percentage || 0);
                    const currentAttendanceAvg = classPctList.length > 0 ? Math.round(classPctList.reduce((a,b) => a+b, 0) / classPctList.length) : 0;
            setStats(prev => ({
                ...prev,
                students: dashboardStats.studentsCount,
                teachers: dashboardStats.teachersCount,
                classes: CLASSES_LIST.length,
                maleStudents: dashboardStats.gender.male,
                femaleStudents: dashboardStats.gender.female,
                classAttendance: dashboardStats.classAttendance
            }));
                        // animate KPI targets
                        setLastUpdated(new Date());
                        animateNumber(setAnimatedStudents, dashboardStats.studentsCount, 600);
                        animateNumber(setAnimatedAttendance, currentAttendanceAvg, 600);

                        // compute grade average from assessments (best-effort, use getAllAssessments)
                        try {
                            const all = await db.getAllAssessments();
                            const studentScores: Record<string, { total: number, count: number }> = {};
                            all.forEach((a: any) => {
                                if(!studentScores[a.studentId]) studentScores[a.studentId] = { total: 0, count: 0 };
                                const score = a.total ?? calculateTotalScore(a);
                                studentScores[a.studentId].total += score;
                                studentScores[a.studentId].count += 1;
                            });
                            const avgs = Object.values(studentScores).map(s => s.count > 0 ? s.total / s.count : 0);
                            const overallAvg = avgs.length > 0 ? Math.round(avgs.reduce((a,b) => a+b, 0) / avgs.length) : 0;
                            animateNumber(setAnimatedGradeAvg, overallAvg, 600);
                        } catch(e) {
                            console.error('Failed to compute grade avg', e);
                        }
                        // compute this-week vs last-week attendance in background
                        computeWeekComparison().catch(e => console.error(e));
                        // refresh visualizations in background as well
                        fetchVisualizations().catch((e: any) => console.error('Failed to compute visuals', e));
        } catch (e) {
            console.error('Failed to fetch live stats', e);
        }
    };

    // Aggregate assessment data for advanced visualizations
    const fetchVisualizations = async () => {
        try {
            const all = await db.getAllAssessments();
            const students = await db.getStudents();

            // Structures
            const perClassSubject: Record<string, Record<string, { total: number; count: number }>> = {};
            const perClassTotals: Record<string, { total: number; count: number }> = {};
            const perClassGrades: Record<string, Record<string, number>> = {};
            const perClassTimeline: Record<string, { date: number; avg: number }[]> = {};

            // Map student -> class for fallback
            const studentToClass = new Map(students.map((s: any) => [s.id, s.classId]));

            all.forEach((a: any) => {
                const classId = a.classId || studentToClass.get(a.studentId) || 'unknown';
                const subject = a.subject || 'General';
                const score = a.total ?? calculateTotalScore(a);
                if (!perClassSubject[classId]) perClassSubject[classId] = {};
                if (!perClassSubject[classId][subject]) perClassSubject[classId][subject] = { total: 0, count: 0 };
                perClassSubject[classId][subject].total += score;
                perClassSubject[classId][subject].count += 1;

                if (!perClassTotals[classId]) perClassTotals[classId] = { total: 0, count: 0 };
                perClassTotals[classId].total += score;
                perClassTotals[classId].count += 1;

                // grade buckets
                const avgForAssessment = score; // we treat each assessment score as sample
                const grade = (() => {
                    if (avgForAssessment >= 80) return 'A';
                    if (avgForAssessment >= 65) return 'B';
                    if (avgForAssessment >= 50) return 'C';
                    if (avgForAssessment >= 35) return 'D';
                    return 'F';
                })();
                if (!perClassGrades[classId]) perClassGrades[classId] = { A:0,B:0,C:0,D:0,F:0 };
                perClassGrades[classId][grade] = (perClassGrades[classId][grade] || 0) + 1;

                // timeline: use assessment date or createdAt else fallback to now
                const when = a.date ? new Date(a.date).getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : Date.now());
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
            const comp = Object.entries(perClassTotals).map(([cls, v]) => ({
                className: CLASSES_LIST.find(c => c.id === cls)?.name || cls,
                avg: Math.round(v.total / Math.max(1, v.count))
            })).sort((a,b) => b.avg - a.avg);

            // prepare sparklines: sort timeline and take last 8 points averaged into buckets
            const sparks: Record<string, number[]> = {};
            Object.entries(perClassTimeline).forEach(([cls, points]) => {
                const sorted = points.sort((a,b) => a.date - b.date);
                // reduce to up to 8 points evenly
                const n = 8;
                const bucketSize = Math.max(1, Math.ceil(sorted.length / n));
                const arr: number[] = [];
                for (let i=0;i<sorted.length;i+=bucketSize) {
                    const slice = sorted.slice(i, i+bucketSize);
                    const avg = Math.round(slice.reduce((s,p) => s + p.avg, 0) / slice.length);
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
            console.error('Error fetching visualizations', e);
        }
    };

    // Helper: animate numeric value from current to target over duration (ms)
    const animateNumber = (setter: (v: number) => void, target: number, duration = 500) => {
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
                const records = await db.getClassAttendance(cls.id);
                const inRange = records.filter((r: any) => {
                    const parts = r.date.split('-');
                    if (parts.length !== 3) return false;
                    const d = new Date(parseInt(parts[0]), parseInt(parts[1]) -1, parseInt(parts[2]));
                    return d >= monday && d <= friday;
                });
                const studentsInClass = (await db.getStudents(cls.id)).length || 0;
                if (inRange.length > 0 && studentsInClass > 0) {
                    const totalPossible = inRange.length * studentsInClass;
                    const totalPresent = inRange.reduce((s: number, r: any) => s + (r.presentStudentIds?.length || 0), 0);
                    results.push(Math.round((totalPresent / totalPossible) * 100));
                }
            } catch (e) {
                console.error('Error computing class attendance for', cls.id, e);
            }
        }
        if (results.length === 0) return null;
        return Math.round(results.reduce((a,b) => a+b, 0) / results.length);
    };

    const computeWeekComparison = async () => {
        // determine current attendanceWeek (use attendanceWeek state or today)
        const refDate = attendanceWeek || new Date();
        const { monday } = getWeekRange(refDate);
        const thisMonday = monday;
        const thisFriday = new Date(monday); thisFriday.setDate(monday.getDate() + 4);
        const lastMonday = new Date(monday); lastMonday.setDate(monday.getDate() - 7);
        const lastFriday = new Date(lastMonday); lastFriday.setDate(lastMonday.getDate() + 4);

        const thisPct = await computeAttendanceForWeek(thisMonday, thisFriday);
        const lastPct = await computeAttendanceForWeek(lastMonday, lastFriday);
        setThisWeekAttendance(thisPct);
        setLastWeekAttendance(lastPct);
    };

  useEffect(() => {
    fetchData();
  }, []);

    // Real-time listeners: refresh stats when attendance, assessments, or config change
    useEffect(() => {
        const attendanceRef = collection(firestore, 'attendance');
        const assessmentsRef = collection(firestore, 'assessments');
        const teacherAttendanceRef = collection(firestore, 'teacher_attendance');
        const configRef = doc(firestore, 'settings', 'schoolConfig');
        const unsubAttendance = onSnapshot(attendanceRef, () => {
            // Keep this lightweight — update class attendance and counters
            fetchStats().catch(e => console.error('Error refreshing stats on attendance change', e));
        });
        const unsubAssessments = onSnapshot(assessmentsRef, () => {
            // Refresh all data when assessments change to update performance stats
            fetchData().catch(e => console.error('Error refreshing data on assessments change', e));
        });
        const unsubTeacherAttendance = onSnapshot(teacherAttendanceRef, () => {
            fetchData().catch(e => console.error('Error refreshing data on teacher attendance change', e));
        });
        const unsubConfig = onSnapshot(configRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data() as any;
                setSchoolConfig({
                    academicYear: data.academicYear || ACADEMIC_YEAR,
                    currentTerm: data.currentTerm || `Term ${CURRENT_TERM}`,
                    schoolReopenDate: data.schoolReopenDate || ''
                });
            }
        });
        return () => {
            unsubAttendance();
            unsubAssessments();
            unsubConfig();
            unsubTeacherAttendance();
        };
    }, []);

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
        pollRef.current = window.setInterval(fetchStats, 15000);

        return () => {
            if (pollRef.current) {
                clearInterval(pollRef.current);
                pollRef.current = null;
            }
        };
    }, [realTimeEnabled]);

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
          const parts = schoolConfig.schoolReopenDate.split('-');
          const reopenDate = parts.length === 3 
              ? new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
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
        window.addEventListener('click', handleClickOutside);
    }
    return () => window.removeEventListener('click', handleClickOutside);
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
          const data = await db.getStudentPerformance(student.id, student.classId);
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
          fetchData();
          setEditingStudent(null);
      } catch(e) {
          showToast("Failed to update student", { type: 'error' });
      }
  };

  const fetchAndViewStudent = async (id: string) => {
      setSelectedGrade(null);
      try {
          const students = await db.getStudents();
          const s = students.find((st: any) => st.id === id);
          if (s) {
              handleViewDetails(s);
          } else {
              showToast('Student not found', { type: 'error' });
          }
      } catch (e) {
          console.error(e);
          showToast('Failed to fetch student', { type: 'error' });
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

  const getEffectiveCurrentWeekStart = () => {
      // If school re-open date is set and is in the future, use it as reference
      if (schoolConfig.schoolReopenDate) {
          const parts = schoolConfig.schoolReopenDate.split('-');
          const reopenDate = parts.length === 3 
              ? new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
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
          const parts = schoolConfig.schoolReopenDate.split('-');
          const reopenDate = parts.length === 3 
              ? new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
              : new Date(schoolConfig.schoolReopenDate);
          const reopenWeek = getWeekRange(reopenDate).monday;
          if (prevWeek < reopenWeek) {
              showToast('Cannot view weeks before school re-opens', { type: 'info' });
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
          const parts = schoolConfig.schoolReopenDate.split('-');
          const reopenDate = parts.length === 3 
              ? new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
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

  const StatCard = ({ title, value, subtext, icon: Icon, colorClass, iconColorClass }: any) => (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-shadow min-h-[140px]">
      <div className="flex justify-between items-start z-10">
        <div>
           <p className="text-slate-500 text-sm font-semibold uppercase tracking-wider">{title}</p>
           <h3 className="text-3xl font-bold text-slate-800 mt-2">{value}</h3>
           {subtext && <p className="text-xs text-slate-400 mt-1">{subtext}</p>}
        </div>
      </div>
            {/* KPI Row removed from StatCard - KPI cards will be shown in a separate standalone card */}
      <div className={`absolute -right-4 -bottom-4 opacity-10 pointer-events-none transform group-hover:scale-110 transition-transform ${iconColorClass}`}>
         <Icon size={100} />
      </div>
    </div>
  );

    const KPICard = ({ title, value, suffix, delta, deltaPositive }: any) => (
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-xs text-slate-400 uppercase font-semibold">{title}</p>
                    <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-slate-800">{value}</span>
                        {suffix && <span className="text-sm text-slate-500">{suffix}</span>}
                    </div>
                </div>
                <div className={`text-sm font-semibold px-2 py-1 rounded ${deltaPositive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                    {delta ?? '--'}
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
                    delta={thisWeekAttendance !== null && lastWeekAttendance !== null ? `${thisWeekAttendance - lastWeekAttendance}% vs last week` : 'No comparison'}
                    deltaPositive={thisWeekAttendance !== null && lastWeekAttendance !== null ? (thisWeekAttendance - lastWeekAttendance) >= 0 : true}
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
        <div className="bg-gradient-to-br from-amber-50 to-amber-100 p-6 rounded-2xl shadow-md border border-amber-200 flex flex-col justify-between min-h-[140px]">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="text-xs font-semibold uppercase text-amber-700">Students Enrolled</p>
                    <h3 className="text-3xl sm:text-4xl font-extrabold text-amber-900 mt-2">{stats.students}</h3>
                    <p className="text-sm text-amber-700 mt-1">{stats.classes} classes • {stats.teachers} teachers</p>
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
                        <div className="text-lg font-bold text-red-800">{stats.femaleStudents}</div>
                    </div>
                    <div className="text-center">
                        <div className="text-xs text-slate-500">Male</div>
                        <div className="text-lg font-bold text-amber-600">{stats.maleStudents}</div>
                    </div>
                </div>

                <div className="hidden sm:flex items-end gap-2 flex-1 max-w-[55%]">
                    {stats.classAttendance.slice(0, 8).map(c => (
                        <div key={c.id} className="flex-1 flex flex-col items-center">
                            <div
                                className="w-full rounded-sm"
                                title={`${c.className}: ${c.percentage}%`}
                                style={{
                                    background: c.percentage >= 80 ? '#16a34a' : c.percentage < 50 ? '#dc2626' : '#f59e0b',
                                    height: `${Math.max(6, Math.round(c.percentage / 2))}px`
                                }}
                            />
                            <div className="text-[10px] text-slate-500 mt-1 truncate text-center">{c.className.replace('Primary ', 'P').replace('Class ', 'P').replace('Nursery ', 'N')}</div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="mt-4 flex items-center justify-between">
                <div className="text-xs text-slate-500">Updated {lastUpdated ? `${Math.floor((now - lastUpdated.getTime())/1000)}s ago` : '—'}</div>
                <div className="text-xs text-slate-400 hidden sm:block">Responsive • Clean • Insightful</div>
            </div>
        </div>
    );

    // Polished, responsive Teacher / Staff card
    const TeacherStaffCard = () => {
        const avgStudentsPerTeacher = stats.teachers > 0 ? Math.round(stats.students / stats.teachers) : '—';
        return (
            <div className="bg-gradient-to-br from-sky-50 to-sky-100 p-6 rounded-2xl shadow-md border border-sky-200 flex flex-col justify-between min-h-[140px]">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <p className="text-xs font-semibold uppercase text-sky-700">Teachers & Staff</p>
                        <h3 className="text-3xl sm:text-4xl font-extrabold text-sky-900 mt-2">{stats.teachers}</h3>
                        <p className="text-sm text-sky-700 mt-1">Teaching across {stats.classes} classes</p>
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
                            <div className="text-xs text-slate-500">Avg Students / Teacher</div>
                            <div className="text-lg font-bold text-sky-800">{avgStudentsPerTeacher}</div>
                        </div>
                        <div className="text-center">
                            <div className="text-xs text-slate-500">Classes</div>
                            <div className="text-lg font-bold text-sky-800">{stats.classes}</div>
                        </div>
                    </div>

                    <div className="hidden sm:flex items-center gap-3">
                        <Link to="/admin/teachers" className="text-xs bg-white px-3 py-1 rounded-md font-medium text-sky-700 shadow-sm hover:underline">Manage Staff</Link>
                    </div>
                </div>

                <div className="mt-4 flex items-center justify-between">
                    <div className="text-xs text-slate-500">Updated {lastUpdated ? `${Math.floor((now - lastUpdated.getTime())/1000)}s ago` : '—'}</div>
                    <div className="text-xs text-slate-400 hidden sm:block">Professional • Accessible • Responsive</div>
                </div>
            </div>
        );
    };

  const AttendanceChart = () => {
    // Return placeholder if week hasn't loaded yet
    if (attendanceWeek === null) {
        return (
            <div className="bg-white p-6 rounded-2xl shadow-md border border-slate-100 h-full flex flex-col items-center justify-center">
                <div className="relative w-12 h-12 border-3 border-slate-100 border-t-red-900 rounded-full animate-spin"></div>
                <p className="text-slate-400 text-sm mt-4">Loading attendance data...</p>
            </div>
        );
    }

    const data = stats.classAttendance;
    const { monday, friday } = getWeekRange(attendanceWeek);
    const effectiveCurrentWeekStart = getEffectiveCurrentWeekStart();
    const isCurrentWeek = effectiveCurrentWeekStart.toDateString() === monday.toDateString();

    // Parse date string safely to avoid timezone shift
    const parseLocalDate = (dateString: string): Date => {
        const parts = dateString.split('-');
        if (parts.length === 3) {
            return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        }
        return new Date(dateString);
    };

    // Check if school has reopened
    let schoolStatus = '';
    let reopenDateObj: Date | null = null;
    if (schoolConfig.schoolReopenDate) {
        reopenDateObj = parseLocalDate(schoolConfig.schoolReopenDate);
        const today = new Date();
        if (reopenDateObj > today) {
            schoolStatus = 'School Closed';
        } else {
            schoolStatus = 'School Open';
        }
    }

    const formatDate = (date: Date) => {
        return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
    };

    return (
        <div className="bg-white p-6 rounded-2xl shadow-md border border-slate-100 h-full flex flex-col">
             {/* Header with Week Navigation */}
             <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
                <div>
                    <h3 className="font-bold text-slate-800 text-lg">Class Attendance</h3>
                    <p className="text-xs text-slate-500">Weekly participation overview</p>
                </div>
                {schoolStatus && (
                    <div className={`text-xs font-bold px-3 py-1 rounded-full ${schoolStatus === 'School Closed' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {schoolStatus}
                    </div>
                )}
            </div>

            {/* Beautiful Week Selector */}
            <div className="mb-6 p-4 bg-gradient-to-r from-red-50 to-amber-50 rounded-xl border border-red-100">
                <div className="flex items-center justify-between">
                    <button
                        onClick={goToPreviousWeek}
                        className="flex items-center justify-center w-10 h-10 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 hover:border-red-400 transition-colors shadow-sm text-slate-600 hover:text-red-700 font-semibold"
                        title="Previous week"
                    >
                        ←
                    </button>

                    <div className="flex-1 mx-4 text-center">
                        <div className="flex flex-col items-center gap-1">
                            <p className="text-sm font-semibold text-slate-800">
                                {formatDate(monday)} — {formatDate(friday)}
                            </p>
                            <p className="text-xs text-slate-500 font-medium">
                                {monday.getFullYear()}
                            </p>
                            {isCurrentWeek && (
                                <span className="inline-block px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold rounded-full mt-1 uppercase tracking-wide">
                                    Current Week
                                </span>
                            )}
                        </div>
                    </div>

                    <button
                        onClick={goToNextWeek}
                        disabled={isCurrentWeek}
                        className="flex items-center justify-center w-10 h-10 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 hover:border-red-400 transition-colors shadow-sm text-slate-600 hover:text-red-700 font-semibold disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-slate-200 disabled:hover:text-slate-600"
                        title={isCurrentWeek ? "You are viewing the current week" : "Next week"}
                    >
                        →
                    </button>
                </div>

                {!isCurrentWeek && (
                    <div className="mt-3 text-center">
                        <button
                            onClick={goToCurrentWeek}
                            className="text-xs text-red-700 hover:text-red-800 font-semibold bg-white border border-red-200 px-3 py-1.5 rounded-md hover:bg-red-50 transition-colors"
                        >
                            Return to Current Week
                        </button>
                    </div>
                )}
            </div>

            {/* School Closed Notice */}
            {schoolStatus === 'School Closed' && reopenDateObj && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-800 font-semibold">
                        School is currently closed. Attendance records will begin from {formatDate(reopenDateObj)}
                    </p>
                </div>
            )}

            {/* Attendance Bars */}
            <div className="flex-1 flex items-end justify-between gap-1 sm:gap-2 px-1 pb-2 h-96 w-full overflow-x-auto">
                {data.map((item) => {
                    let barColor = 'bg-amber-500'; // Standard Noble Gold
                    if (item.percentage < 50) barColor = 'bg-red-600'; // Warning Red
                    else if (item.percentage >= 80) barColor = 'bg-emerald-500'; // Excellence

                    return (
                        <div key={item.id} className="flex flex-col items-center flex-1 group h-full justify-end min-w-[20px]">
                            <div className="w-full max-w-[30px] bg-slate-50 rounded-t-sm relative flex items-end h-full hover:bg-slate-100 transition-colors">
                                 <div className="absolute -top-10 left-1/2 transform -translate-x-1/2 bg-slate-800 text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">
                                     {item.className}: {item.percentage}%
                                 </div>
                                 <div 
                                    className={`w-full ${barColor} rounded-t-sm transition-all duration-1000 ease-out relative`}
                                    style={{ height: `${item.percentage}%` }}
                                 ></div>
                            </div>
                            <span className="text-[10px] text-slate-400 mt-2 font-medium truncate w-full text-center">
                                {item.className.replace('Nursery ', 'N').replace('Class ', 'P').replace('Primary ', 'P').replace('KG ', 'K').replace('JHS ', 'J')}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    )
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
                        background: `conic-gradient(#7f1d1d 0% ${femalePct}%, #f59e0b ${femalePct}% 100%)`, // Red (Female) and Gold (Male) for Noble Theme
                        mask: 'radial-gradient(transparent 60%, black 61%)',
                        WebkitMask: 'radial-gradient(transparent 60%, black 61%)'
                    }}
                ></div>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                     <span className="text-3xl font-bold text-slate-800">{stats.students}</span>
                     <span className="text-xs text-slate-500 uppercase tracking-wide">Total</span>
                </div>
            </div>
            <div className="flex w-full justify-between px-6 mt-8">
                <div className="text-center">
                    <p className="text-xs text-slate-400 mb-1">Female</p>
                    <p className="text-xl font-bold text-red-900">{femalePct}%</p>
                    <p className="text-lg font-bold text-red-700 mt-1">{stats.femaleStudents}</p>
                </div>
                <div className="w-px bg-slate-100"></div>
                <div className="text-center">
                    <p className="text-xs text-slate-400 mb-1">Male</p>
                    <p className="text-xl font-bold text-amber-500">{malePct}%</p>
                    <p className="text-lg font-bold text-amber-600 mt-1">{stats.maleStudents}</p>
                </div>
            </div>
        </div>
     )
  }

  const PerformanceSection = () => {
    const totalGrades = Object.keys(gradeDistribution).reduce((sum, key) => sum + gradeDistribution[key], 0) || 0;

    // Compute average grade score (A=4 .. F=0) and derive a letter
    const weights: Record<string, number> = { A: 4, B: 3, C: 2, D: 1, F: 0 };
        const weightedSum = Object.entries(gradeDistribution).reduce((acc, [g, c]: [string, number]) => {
            const w = weights[g as keyof typeof weights] ?? 0;
            return acc + w * c;
        }, 0);
    const avgScore = totalGrades > 0 ? (weightedSum / totalGrades) : 0;
    const avgLetter = avgScore >= 3.5 ? 'A' : avgScore >= 2.5 ? 'B' : avgScore >= 1.5 ? 'C' : avgScore >= 0.5 ? 'D' : 'F';

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
            {/* Grade Distribution Chart (Enhanced) */}
            <div className="lg:col-span-2 bg-white p-4 sm:p-6 rounded-2xl shadow-md border border-slate-100 overflow-x-auto">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 sm:mb-6 gap-3 sm:gap-0">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-red-50 rounded-xl">
                            <BarChart2 className="w-6 h-6 text-red-700"/>
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-800">Academic Performance Rate</h3>
                            <p className="text-xs text-slate-500">{schoolConfig.currentTerm}</p>
                        </div>
                        <div className="grid grid-cols-2 sm:flex sm:ml-6 gap-4 sm:gap-6 sm:hidden">
                            <div>
                                <p className="text-xs text-slate-500 uppercase">Graded Students</p>
                                <p className="text-lg sm:text-2xl font-bold text-slate-800">{totalGrades}</p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-500 uppercase">Average Grade</p>
                                <p className="text-lg sm:text-2xl font-bold text-amber-500">{avgLetter} <span className="text-xs sm:text-sm text-slate-500">({avgScore.toFixed(2)})</span></p>
                            </div>
                        </div>
                        <div className="hidden sm:block ml-6">
                            <p className="text-xs text-slate-500 uppercase">Graded Students</p>
                            <p className="text-2xl font-bold text-slate-800">{totalGrades}</p>
                        </div>
                        <div className="hidden sm:block ml-6">
                            <p className="text-xs text-slate-500 uppercase">Average Grade</p>
                            <p className="text-2xl font-bold text-amber-500">{avgLetter} <span className="text-sm text-slate-500">({avgScore.toFixed(2)})</span></p>
                        </div>
                    </div>
                    <button
                        onClick={fetchData}
                        disabled={loading}
                        className="flex items-center px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                        title="Refresh performance data"
                    >
                        <RefreshCw size={14} className={`mr-1 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                </div>

                <div className="space-y-4">
                    <div className="space-y-3">
                        {Object.entries(gradeDistribution).map(([grade, count]: [string, number]) => {
                            const percentage = totalGrades > 0 ? Math.round((count / totalGrades) * 100) : 0;
                            let barColor = 'from-emerald-400 to-emerald-600';
                            if (grade === 'B') barColor = 'from-blue-400 to-blue-600';
                            if (grade === 'C') barColor = 'from-amber-300 to-amber-500';
                            if (grade === 'D') barColor = 'from-orange-300 to-orange-500';
                            if (grade === 'F') barColor = 'from-red-400 to-red-600';

                            return (
                                <div key={grade} className="flex items-center gap-4">
                                    <div className="w-10 font-bold text-slate-700">{grade}</div>
                                    <div className="flex-1">
                                        <div className="relative h-4 bg-slate-100 rounded-full overflow-hidden">
                                            <div
                                                className={`absolute left-0 top-0 h-full rounded-full bg-gradient-to-r ${barColor} transition-all duration-1000`}
                                                style={{ width: `${percentage}%` }}
                                                title={`${count} students — ${percentage}%`}
                                            />
                                        </div>
                                        <div className="mt-2 flex justify-between text-xs text-slate-500">
                                            <span>{count} {count === 1 ? 'student' : 'students'}</span>
                                            <span className="font-semibold text-slate-700">{percentage}%</span>
                                        </div>
                                    </div>
                                    <div className="ml-4">
                                        <button
                                            onClick={() => setSelectedGrade(grade)}
                                            className="text-xs text-red-700 hover:underline font-medium"
                                        >
                                            View
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Legend explaining colors */}
                    <div className="mt-4 flex flex-wrap gap-4 items-center">
                        <div className="flex items-center gap-2">
                            <span className="w-4 h-4 rounded-sm block bg-gradient-to-r from-emerald-400 to-emerald-600" aria-hidden></span>
                            <span className="text-xs text-slate-600">A — Excellent</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="w-4 h-4 rounded-sm block bg-gradient-to-r from-blue-400 to-blue-600" aria-hidden></span>
                            <span className="text-xs text-slate-600">B — Very Good</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="w-4 h-4 rounded-sm block bg-gradient-to-r from-amber-300 to-amber-500" aria-hidden></span>
                            <span className="text-xs text-slate-600">C — Satisfactory</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="w-4 h-4 rounded-sm block bg-gradient-to-r from-orange-300 to-orange-500" aria-hidden></span>
                            <span className="text-xs text-slate-600">D — Needs Support</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="w-4 h-4 rounded-sm block bg-gradient-to-r from-red-400 to-red-600" aria-hidden></span>
                            <span className="text-xs text-slate-600">F — Intervention Required</span>
                        </div>
                    </div>
                    {totalGrades === 0 && (
                         <div className="text-center text-slate-400 py-4 text-sm">No academic data available for {schoolConfig.currentTerm}.</div>
                    )}

                    <div className="mt-4 p-4 bg-gradient-to-r from-emerald-50 to-blue-50 rounded-lg text-sm text-slate-700 border border-slate-100">
                        <div className="font-semibold text-slate-800 mb-1">What this chart shows</div>
                        <div className="text-sm">
                            Each bar represents the number of students who received that grade during the selected term. Percentages are calculated against the total number of graded students. Use the counts and percentages to identify strengths (high A/B) and areas for intervention (high D/F). Hover a bar to see the exact count.
                        </div>
                    </div>
                </div>
            </div>

            {/* Top Students */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <h3 className="font-bold text-slate-800 mb-4 flex items-center">
                    <Trophy className="w-5 h-5 mr-2 text-amber-500"/> Top Performers
                </h3>
                <div className="space-y-4">
                    {topStudents.length === 0 ? (
                        <p className="text-sm text-slate-400 italic">No data yet.</p>
                    ) : (
                        topStudents.map((s, i) => (
                            <div key={i} className="flex items-center justify-between border-b border-slate-50 pb-2 last:border-0 last:pb-0">
                                <div className="flex items-center gap-3">
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${i === 0 ? 'bg-amber-500' : 'bg-slate-300'}`}>
                                        {i + 1}
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-slate-800">{s.name}</p>
                                        <p className="text-xs text-slate-400">{s.class}</p>
                                    </div>
                                </div>
                                <span className="text-sm font-bold text-red-900">{s.avg}</span>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
  };

  if (loading) {
      return (
          <Layout title="Dashboard">
              <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)]">
                  <div className="relative">
                      {/* Outer glow */}
                      <div className="absolute inset-0 bg-amber-100 rounded-full blur-xl opacity-50 animate-pulse"></div>
                      
                      {/* Spinner */}
                      <div className="relative w-16 h-16 border-4 border-slate-100 border-t-red-900 rounded-full animate-spin shadow-sm"></div>
                      
                      {/* Inner Icon */}
                      <div className="absolute inset-0 flex items-center justify-center">
                         <div className="w-2 h-2 bg-red-900 rounded-full"></div>
                      </div>
                  </div>
                  
                  <div className="mt-8 text-center space-y-2">
                      <h3 className="text-lg font-bold text-slate-800">Noble Care Academy</h3>
                      <div className="flex items-center justify-center space-x-1">
                          <div className="w-2 h-2 bg-amber-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                          <div className="w-2 h-2 bg-amber-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                          <div className="w-2 h-2 bg-red-800 rounded-full animate-bounce"></div>
                      </div>
                  </div>
              </div>
          </Layout>
      )
  }

  // --- Advanced Visualization Components ---
  const scoreToColor = (v: number) => {
      if (v >= 80) return 'bg-emerald-500';
      if (v >= 65) return 'bg-blue-500';
      if (v >= 50) return 'bg-amber-400';
      if (v >= 35) return 'bg-orange-400';
      return 'bg-red-500';
  };

  const HeatmapComponent = ({ data }: { data: Record<string, Record<string, number>> }) => {
      const classes = Object.keys(data).slice(0, 8);
      const subjects = Array.from(new Set(classes.flatMap(c => Object.keys(data[c] || {})))).slice(0, 8);
      return (
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
              <h4 className="font-bold text-slate-800 mb-3">Class × Subject Heatmap</h4>
              <div className="overflow-x-auto">
                  <div className="inline-block">
                      <div className="grid" style={{ gridTemplateColumns: `repeat(${subjects.length + 1}, minmax(80px, 1fr))` }}>
                          <div className="p-2 font-semibold"></div>
                          {subjects.map(s => <div key={s} className="p-2 text-xs text-slate-500 font-semibold text-center">{s}</div>)}
                          {classes.map(cls => (
                              <React.Fragment key={cls}>
                                  <div className="p-2 font-medium text-sm text-slate-700">{CLASSES_LIST.find(c => c.id === cls)?.name || cls}</div>
                                  {subjects.map(sub => {
                                      const v = data[cls]?.[sub] ?? 0;
                                      return (
                                          <div key={cls + '-' + sub} className={`p-2 m-1 rounded text-white text-xs flex items-center justify-center ${scoreToColor(v)}`} title={`${sub}: ${v}`}>
                                              {v}
                                          </div>
                                      )
                                  })}
                              </React.Fragment>
                          ))}
                      </div>
                  </div>
              </div>
          </div>
      )
  }

  const ComparativeBars = ({ data }: { data: { className: string; avg: number }[] }) => (
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
          <h4 className="font-bold text-slate-800 mb-3">Class Comparison</h4>
          <div className="space-y-3">
              {data.slice(0,6).map(d => (
                  <div key={d.className} className="flex items-center gap-3">
                      <div className="w-36 text-sm text-slate-600">{d.className}</div>
                      <div className="flex-1 h-4 bg-slate-100 rounded overflow-hidden">
                          <div className={`${scoreToColor(d.avg)} h-full`} style={{ width: `${Math.min(100, d.avg)}%` }} />
                      </div>
                      <div className="w-12 text-right text-sm font-semibold text-slate-700">{d.avg}%</div>
                  </div>
              ))}
          </div>
      </div>
  );

  const GradeDistributionPieByClass = ({ dist }: { dist: Record<string, number> }) => {
      const total = Object.values(dist).reduce((a,b) => a+b, 0) || 1;
      // build gradient stops
      const segments = ['A','B','C','D','F'].map((k,i) => ({k, v: dist[k] || 0}));
      let start = 0;
      const stops: string[] = [];
      segments.forEach(s => {
          const pct = Math.round((s.v / total) * 100);
          stops.push(`${s.v ? pct : 0}%`);
      });
      // fallback simple pie using conic-gradient with fixed colors
      const colors = { A: '#10b981', B: '#3b82f6', C: '#f59e0b', D: '#fb923c', F: '#ef4444' };
      let gradient = '';
      let offset = 0;
      segments.forEach((s, idx) => {
          const pct = (s.v / total) * 100;
          const next = offset + pct;
          gradient += `${colors[s.k]} ${offset}% ${next}%, `;
          offset = next;
      });
      gradient = gradient || '#f3f4f6 0% 100%';
      return (
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
              <div className="w-28 h-28 rounded-full" style={{ background: `conic-gradient(${gradient})`, mask: 'radial-gradient(transparent 60%, black 61%)', WebkitMask: 'radial-gradient(transparent 60%, black 61%)' }} />
              <div>
                  {segments.map(s => (
                      <div key={s.k} className="flex items-center gap-2 text-sm">
                          <span className="w-3 h-3 rounded-sm" style={{ background: colors[s.k] }} />
                          <span className="text-slate-700 font-medium">{s.k}</span>
                          <span className="text-slate-500 ml-2">{s.v}</span>
                      </div>
                  ))}
              </div>
          </div>
      )
  }

  const Sparkline = ({ points }: { points: number[] }) => {
      const w = 120; const h = 28;
      if (!points || points.length === 0) return <div className="text-xs text-slate-400">No data</div>;
      const max = Math.max(...points, 1);
      const min = Math.min(...points);
      const norm = points.map((p,i) => {
          const x = Math.round((i/(points.length-1)) * w);
          const y = Math.round(h - ((p - min) / Math.max(1, (max - min))) * h);
          return `${x},${y}`;
      }).join(' ');
      return (
          <svg width={w} height={h} className="block"><polyline fill="none" stroke="#ef4444" strokeWidth={2} points={norm} /></svg>
      )
  }

  const ClassSparklines = ({ sparks }: { sparks: Record<string, number[]> }) => (
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
          <h4 className="font-bold text-slate-800 mb-3">Class Performance Trends</h4>
          <div className="space-y-3">
              {Object.entries(sparks).slice(0,6).map(([cls, pts]) => (
                  <div key={cls} className="flex items-center justify-between">
                      <div className="text-sm text-slate-700 w-40">{CLASSES_LIST.find(c => c.id === cls)?.name || cls}</div>
                      <div className="flex-1 flex items-center justify-end gap-4">
                          <div className="w-40"><Sparkline points={pts} /></div>
                          <div className="w-12 text-right font-semibold text-slate-700">{Math.round((pts.reduce((a,b)=>a+b,0)/Math.max(1,pts.length))) }%</div>
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
                  <AlertOctagon size={48} className="text-red-400 mb-4"/>
                  <h3 className="text-lg font-bold text-slate-700">Unable to load dashboard</h3>
                  <p className="text-slate-500 text-center max-w-md mb-6">{error}</p>
                  <button onClick={fetchData} className="flex items-center px-4 py-2 bg-red-800 text-white rounded-lg hover:bg-red-900 transition-colors">
                      <RefreshCw size={16} className="mr-2"/> Retry
                  </button>
              </div>
          </Layout>
      )
  }

  return (
    <Layout title="Dashboard">
      {/* Top Welcome Section */}
      <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
            <h1 className="text-2xl font-bold text-slate-800">Welcome, Headmistress</h1>
            <p className="text-slate-500 mt-1">Here is what's happening in your school today.</p>
        </div>
        
        {/* Term and Actions */}
        <div className="flex items-center gap-4">
             <div className="text-right mr-2 hidden sm:block">
                 <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Academic Period</p>
                 <p className="text-sm font-bold text-red-900">{schoolConfig.currentTerm} &bull; {schoolConfig.academicYear}</p>
             </div>

             <div className="flex gap-3">
                <Link to="/admin/students" className="flex items-center px-4 py-2 bg-red-900 text-white rounded-lg hover:bg-red-950 transition-colors shadow-sm text-sm font-medium">
                    <UserPlus size={16} className="mr-2" />
                    Add Student
                </Link>
                <Link to="/admin/teachers" className="flex items-center px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors shadow-sm text-sm font-medium">
                    <Users size={16} className="mr-2" />
                    Add Staff
                </Link>
             </div>
             
             {/* Live Metrics Toggle */}
             <div className="ml-4 flex flex-col items-end text-right">
                <div className="flex items-center gap-2">
                    <span className={`w-3 h-3 rounded-full ${realTimeEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`} aria-hidden></span>
                    <button
                        onClick={() => setRealTimeEnabled(v => !v)}
                        className="text-xs text-slate-600 hover:underline"
                        title="Toggle live metrics polling"
                    >
                        {realTimeEnabled ? 'Live Metrics On' : 'Enable Live Metrics'}
                    </button>
                </div>
                <div className="text-xs text-slate-400 mt-1">
                    {lastUpdated ? `Updated ${Math.floor((now - lastUpdated.getTime())/1000)}s ago` : 'Not updated'}
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
                <h3 className="font-bold text-red-900 text-lg">Attendance Alerts</h3>
                <p className="text-red-700 text-sm">{missedAttendanceAlerts.length} teacher{missedAttendanceAlerts.length !== 1 ? 's' : ''} missed attendance on {(() => {
                  const parts = missedAttendanceAlerts[0].date.split('-');
                  if (parts.length === 3) {
                    return `${parts[1]}/${parts[2]}/${parts[0]}`;
                  }
                  return missedAttendanceAlerts[0].date;
                })()}</p>
              </div>
            </div>
            <div className="space-y-3">
              {missedAttendanceAlerts.map((alert: any) => (
                <div key={alert.teacherId} className="bg-white p-4 rounded-lg border border-red-100 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                        <span className="text-sm font-bold text-red-600">
                          {alert.teacherName.charAt(0)}
                        </span>
                      </div>
                      <div>
                        <p className="font-semibold text-slate-800">{alert.teacherName}</p>
                        <p className="text-sm text-slate-500">{alert.classes}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-red-700">Missed: {(() => {
                        const parts = alert.date.split('-');
                        if (parts.length === 3) {
                          return `${parts[1]}/${parts[2]}/${parts[0]}`;
                        }
                        return alert.date;
                      })()}</p>
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
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-100 rounded-full">
                <AlertOctagon className="text-blue-600" size={24} />
              </div>
              <div>
                <h3 className="font-bold text-blue-900 text-lg">Missed Student Attendance</h3>
                <p className="text-blue-700 text-sm">{missedStudentAttendanceAlerts.length} teacher{missedStudentAttendanceAlerts.length !== 1 ? 's' : ''} did not mark student attendance for {(() => {
                  const parts = missedStudentAttendanceAlerts[0].date.split('-');
                  if (parts.length === 3) {
                    return `${parts[1]}/${parts[2]}/${parts[0]}`;
                  }
                  return missedStudentAttendanceAlerts[0].date;
                })()}</p>
              </div>
            </div>
            <div className="space-y-3">
              {missedStudentAttendanceAlerts.map((alert: any) => (
                <div key={alert.teacherId} className="bg-white p-4 rounded-lg border border-blue-100 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <span className="text-sm font-bold text-blue-600">
                          {alert.teacherName.charAt(0)}
                        </span>
                      </div>
                      <div>
                        <p className="font-semibold text-slate-800">{alert.teacherName}</p>
                        <p className="text-sm text-slate-500">{alert.className}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-blue-700">Missed for: {(() => {
                        const parts = alert.date.split('-');
                        if (parts.length === 3) {
                          return `${parts[1]}/${parts[2]}/${parts[0]}`;
                        }
                        return alert.date;
                      })()}</p>
                      <p className="text-xs text-slate-400">Action may be required</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <StudentEnrollCard />
        <TeacherStaffCard />
        <StatCard 
            title="Notices" 
            value={notices.length} 
            subtext="Active Announcements"
            icon={Bell} 
            colorClass="bg-blue-50" 
            iconColorClass="text-blue-600"
        />
      </div>

    {/* KPI row placed below the main stats so the three-card grid remains intact */}
    <div className="mb-8">
        <KPIRowContainer />
    </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
         <div className="lg:col-span-2 h-[550px]">
            <AttendanceChart />
         </div>
         <div className="h-96">
            <GenderDonut />
         </div>
      </div>

      {/* New Performance Section */}
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
                <Link to="/admin/students" className="text-sm text-red-700 hover:text-red-800 font-medium bg-red-50 px-3 py-1 rounded-full transition-colors">View All</Link>
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
                             <tr><td colSpan={4} className="p-6 text-center text-slate-400">No students yet.</td></tr>
                        ) : (
                            recentStudents.map((s, i) => (
                                <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-4 font-medium text-slate-800 flex items-center">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs text-white mr-3 shadow-sm ${s.gender === 'Male' ? 'bg-amber-400' : 'bg-red-800'}`}>
                                            {s.name.charAt(0)}
                                        </div>
                                        <div>
                                            <p>{s.name}</p>
                                            <p className="text-[10px] text-slate-400 uppercase">{s.gender}</p>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 text-xs font-semibold border border-slate-200">
                                            {CLASSES_LIST.find(c => c.id === s.classId)?.name}
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
                                                className={`transition-colors p-1.5 rounded-full hover:bg-slate-200 ${openMenuId === s.id ? 'text-red-600 bg-slate-100' : 'text-slate-400'}`}
                                            >
                                                <MoreHorizontal size={18} />
                                            </button>
                                            
                                            {/* Dropdown Menu */}
                                            {openMenuId === s.id && (
                                                <div className="absolute right-0 mt-1 w-40 bg-white rounded-lg shadow-xl border border-slate-100 z-50 py-1 text-left animate-in fade-in zoom-in-95 duration-100 origin-top-right">
                                                    <button 
                                                        onClick={() => handleViewDetails(s)}
                                                        className="flex items-center w-full px-4 py-2.5 text-xs text-slate-700 hover:bg-slate-50 hover:text-red-600 font-medium transition-colors"
                                                    >
                                                        <Eye size={14} className="mr-2"/> View Details
                                                    </button>
                                                     <button 
                                                        onClick={() => handleEditStudent(s)}
                                                        className="flex items-center w-full px-4 py-2.5 text-xs text-slate-700 hover:bg-slate-50 hover:text-blue-600 font-medium transition-colors"
                                                    >
                                                        <Edit size={14} className="mr-2"/> Edit Student
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
        <div className="bg-gradient-to-br from-red-900 to-slate-900 rounded-2xl shadow-lg border border-red-800 overflow-hidden flex flex-col text-white self-start">
            <div className="p-6 border-b border-red-800 flex justify-between items-center">
                 <div>
                    <h3 className="font-bold text-amber-400">Notice Board</h3>
                    <p className="text-xs text-slate-300">School announcements</p>
                 </div>
                 <Link to="/admin/settings" className="p-2 rounded-lg hover:bg-white/10 text-slate-300 transition-colors"><Settings size={18}/></Link>
            </div>
            <div className="p-4 space-y-4 flex-1 overflow-y-auto max-h-[400px]">
                {notices.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 text-slate-400">
                        <Calendar size={40} className="mb-2 opacity-20"/>
                        <p className="text-sm">No new notices</p>
                    </div>
                ) : (
                    notices.map((n, i) => (
                        <div key={n.id} className="group relative pl-4 pb-4 border-l border-slate-700 last:pb-0">
                            <div className={`absolute -left-[5px] top-0 w-2.5 h-2.5 rounded-full border-2 border-slate-800 ${n.type === 'urgent' ? 'bg-red-500' : 'bg-amber-500'}`}></div>
                            <div>
                                <div className="flex justify-between items-start mb-1">
                                    <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded">{n.date}</span>
                                    {n.type === 'urgent' && <span className="text-[10px] text-red-400 font-bold uppercase tracking-wider">Urgent</span>}
                                </div>
                                <p className="text-sm font-medium text-slate-200 group-hover:text-white transition-colors">{n.message}</p>
                            </div>
                        </div>
                    ))
                )}
            </div>
            <div className="p-4 bg-slate-900/50 text-center">
                <Link to="/admin/timetable" className="text-xs font-semibold text-amber-400 hover:text-amber-300 uppercase tracking-wide flex items-center justify-center w-full">
                    View Calendar <ArrowUpRight size={12} className="ml-1"/>
                </Link>
            </div>
        </div>

        {/* Teacher Attendance Widgets */}
        <div className="space-y-6">
          {/* Today's Teacher Attendance */}
          <div className="bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 rounded-2xl shadow-lg border border-emerald-200 flex flex-col min-h-[260px] hover:shadow-xl transition-shadow duration-300">
              <div className="p-3 sm:p-4 border-b border-emerald-200 flex justify-between items-center">
                  <div>
                      <h3 className="font-bold text-emerald-900 text-base sm:text-lg">Teacher Attendance Today</h3>
                      <p className="text-[10px] sm:text-xs text-emerald-700 mt-0.5">Current day's staff presence overview</p>
                  </div>
                  <div className="bg-emerald-100 p-1.5 sm:p-2 rounded-full">
                      <Users className="text-emerald-600" size={16} sm:size={20} />
                  </div>
              </div>
              <div className="p-3 space-y-2 flex-1 overflow-y-auto max-h-[300px] sm:max-h-[350px]">
                  {teacherAttendance.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-24 text-emerald-500">
                          <div className="bg-emerald-100 p-3 rounded-full mb-2">
                              <Users size={24} className="text-emerald-400"/>
                          </div>
                          <p className="text-xs font-medium text-center">No attendance marked yet today</p>
                          <p className="text-[10px] text-emerald-400 mt-0.5">Teachers will appear here once they mark attendance</p>
                      </div>
                  ) : (
                      <div className="space-y-2">
                          {teacherAttendance.map((record) => (
                              <div key={record.id} className="bg-white p-3 rounded-lg shadow-sm border border-emerald-100 hover:shadow-md transition-all duration-200 hover:border-emerald-200">
                                  <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2 flex-1 min-w-0">
                                          <div className={`w-3.5 h-3.5 rounded-full flex-shrink-0 ${
                                              record.status === 'present' ? 'bg-emerald-500' : 'bg-red-500'
                                          } shadow-sm`}></div>
                                          <div className="flex-1 min-w-0">
                                              <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                                                  <p className="text-[10px] sm:text-xs font-semibold text-slate-800 truncate max-w-[120px] sm:max-w-none">{record.teacherName}</p>
                                                  <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-medium flex-shrink-0 ${
                                                      record.status === 'present'
                                                          ? 'bg-emerald-100 text-emerald-700'
                                                          : 'bg-red-100 text-red-700'
                                                  }`}>
                                                      {record.status === 'present' ? 'Present' : 'Absent'}
                                                  </span>
                                              </div>
                                              <p className="text-[9px] text-slate-500 truncate">
                                                  {record.teacherClasses || 'No classes assigned'}
                                              </p>
                                              <p className="text-[9px] text-slate-400 mt-0.5">{record.date}</p>
                                          </div>
                                      </div>
                                      <div className="ml-2 flex-shrink-0">
                                          <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                                              record.status === 'present'
                                                  ? 'bg-emerald-100 text-emerald-600'
                                                  : 'bg-red-100 text-red-600'
                                          }`}>
                                              {record.status === 'present' ? (
                                                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                  </svg>
                                              ) : (
                                                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                                  </svg>
                                              )}
                                          </div>
                                      </div>
                                  </div>
                              </div>
                          ))}
                          <div className="text-center mt-3 pt-2 border-t border-emerald-100">
                              <p className="text-[10px] text-emerald-600 font-medium">
                                  {teacherAttendance.length} teacher{teacherAttendance.length !== 1 ? 's' : ''} marked attendance today
                              </p>
                          </div>
                      </div>
                  )}
              </div>
          </div>

          {/* Teacher Term Attendance Statistics */}
          {(schoolConfig.schoolReopenDate !== new Date().toISOString().split('T')[0]) && (
          <div className="bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 rounded-2xl shadow-lg border border-blue-200 flex flex-col min-h-[280px] hover:shadow-xl transition-shadow duration-300">
              <div className="p-3 sm:p-4 border-b border-blue-200 flex justify-between items-center">
                  <div>
                      <h3 className="font-bold text-blue-900 text-base sm:text-lg">Teacher Attendance Summary</h3>
                      <p className="text-[10px] sm:text-xs text-blue-700 mt-0.5">Term-wide staff attendance statistics</p>
                  </div>
                  <div className="bg-blue-100 p-1.5 sm:p-2 rounded-full">
                      <BarChart2 className="text-blue-600" size={16} sm:size={20} />
                  </div>
              </div>
              <div className="p-3 space-y-2 flex-1 overflow-y-auto max-h-[300px] sm:max-h-[350px]">
                  {teacherTermStats.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-24 text-blue-500">
                          <div className="bg-blue-100 p-3 rounded-full mb-2">
                              <BarChart2 size={24} className="text-blue-400"/>
                          </div>
                          <p className="text-xs font-medium text-center">No attendance data available</p>
                          <p className="text-[10px] text-blue-400 mt-0.5">Term statistics will appear as teachers mark attendance</p>
                      </div>
                  ) : (
                      <div className="space-y-2">
                          {teacherTermStats.map((stat: any) => (
                              <div key={stat.id} className="bg-white p-3 rounded-lg shadow-sm border border-blue-100 hover:shadow-md transition-all duration-200 hover:border-blue-200">
                                  <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2 flex-1 min-w-0">
                                          <div className="flex-shrink-0">
                                              <div className="relative">
                                                  <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center">
                                                      <span className="text-[10px] font-bold text-blue-600">{stat.attendanceRate}%</span>
                                                  </div>
                                                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-white rounded-full flex items-center justify-center">
                                                      <div className={`w-2 h-2 rounded-full ${
                                                          stat.attendanceRate >= 80 ? 'bg-emerald-500' :
                                                          stat.attendanceRate >= 70 ? 'bg-amber-500' : 'bg-red-500'
                                                      }`}></div>
                                                  </div>
                                              </div>
                                          </div>
                                          <div className="flex-1 min-w-0">
                                              <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                                                  <p className="text-[10px] sm:text-xs font-semibold text-slate-800 truncate max-w-[120px] sm:max-w-none">{stat.name}</p>
                                                  <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-medium flex-shrink-0 ${
                                                      stat.attendanceRate >= 80 ? 'bg-emerald-100 text-emerald-700' :
                                                      stat.attendanceRate >= 70 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                                                  }`}>
                                                      {stat.attendanceRate >= 80 ? 'Excellent' :
                                                       stat.attendanceRate >= 70 ? 'Good' : 'Needs Attention'}
                                                  </span>
                                              </div>
                                              <p className="text-[9px] text-slate-500 truncate">
                                                  {stat.classes || 'No classes assigned'}
                                              </p>
                                              <p className="text-[9px] text-slate-400 mt-0.5">{stat.presentDays} present / {stat.totalDays} total days</p>
                                          </div>
                                      </div>
                                  </div>
                              </div>
                          ))}
                          <div className="text-center mt-3 pt-2 border-t border-blue-100">
                              <p className="text-[10px] text-blue-600 font-medium">
                                  Average attendance: {teacherTermStats.length > 0 ? Math.round(teacherTermStats.reduce((sum: number, stat: any) => sum + stat.attendanceRate, 0) / teacherTermStats.length) : 0}%
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
                          <h2 className="text-xl font-bold text-slate-900">{viewStudent.name}</h2>
                          <div className="flex gap-2 text-sm text-slate-500 mt-1">
                             <span className="flex items-center"><User size={14} className="mr-1"/> {viewStudent.gender}</span>
                             <span>•</span>
                             <span>{CLASSES_LIST.find(c => c.id === viewStudent.classId)?.name}</span>
                          </div>
                      </div>
                  </div>
                  <button onClick={() => setViewStudent(null)} className="text-slate-400 hover:text-slate-700 transition-colors bg-white p-2 rounded-full shadow-sm hover:shadow">
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
                              <h4 className="font-semibold text-amber-900">Attendance Overview</h4>
                              <p className="text-sm text-amber-700">Current Term Participation</p>
                          </div>
                      </div>
                      <div className="text-right">
                          <span className="text-3xl font-bold text-amber-600">
                              {performanceData ? `${performanceData.attendance.percentage}%` : '...'}
                          </span>
                          <p className="text-xs text-amber-700 font-medium mt-1">
                              {performanceData ? `${performanceData.attendance.present}/${performanceData.attendance.total} Days` : 'Loading'}
                          </p>
                      </div>
                  </div>

                  <div>
                      <h3 className="font-bold text-slate-800 mb-4 flex items-center">
                          <BookOpen size={20} className="mr-2 text-red-800"/> Academic Performance ({schoolConfig.currentTerm})
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
                                  {performanceData ? performanceData.grades.map((g: any, i: number) => {
                                      const score = g.total ?? calculateTotalScore(g);
                                      const { grade, remark } = calculateGrade(score);
                                      return (
                                          <tr key={i} className="hover:bg-slate-50">
                                              <td className="px-4 py-3 font-medium text-slate-800">{g.subject}</td>
                                              <td className="px-4 py-3 text-center">{score > 0 ? score : '-'}</td>
                                              <td className="px-4 py-3 text-center">
                                                  <span className={`px-2 py-1 rounded text-xs font-bold ${getGradeColor(grade)}`}>
                                                      {score > 0 ? grade : '-'}
                                                  </span>
                                              </td>
                                              <td className="px-4 py-3 text-right text-slate-500">{score > 0 ? remark : 'N/A'}</td>
                                          </tr>
                                      );
                                  }) : (
                                      <tr><td colSpan={4} className="p-4 text-center text-slate-400 italic">Fetching academic records...</td></tr>
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
                <h3 className="text-lg font-bold text-slate-900">Edit Student Details</h3>
                <button onClick={() => setEditingStudent(null)} className="text-slate-400 hover:text-slate-700">
                    <X size={20}/>
                </button>
            </div>
            
            <form onSubmit={handleSaveEdit} className="space-y-5">
              <div className="space-y-4">
                  <h4 className="text-xs font-bold text-red-800 uppercase tracking-wide">Personal Information</h4>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Full Name</label>
                    <input 
                      type="text" 
                      required
                      className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-red-800 outline-none transition-all placeholder-slate-400"
                      value={editFormData.name || ''}
                      onChange={e => setEditFormData({...editFormData,name: e.target.value})}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                     <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Gender</label>
                      <select 
                        className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-red-800 outline-none bg-white text-slate-900"
                        value={editFormData.gender}
                        onChange={e => setEditFormData({...editFormData, gender: e.target.value as any})}
                      >
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Date of Birth</label>
                      <input 
                        type="date"
                        className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-red-800 outline-none"
                        value={editFormData.dob || ''}
                        onChange={e => setEditFormData({...editFormData, dob: e.target.value})}
                      />
                    </div>
                  </div>
              </div>

              <div className="space-y-4 pt-2 border-t border-slate-50 mt-2">
                 <h4 className="text-xs font-bold text-red-800 uppercase tracking-wide">Academic Info</h4>
                 <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Assigned Class</label>
                    <select 
                        className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-red-800 outline-none bg-white text-slate-900"
                        value={editFormData.classId}
                        onChange={e => setEditFormData({...editFormData, classId: e.target.value})}
                    >
                        {CLASSES_LIST.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </div>
              </div>

              <div className="space-y-4 pt-2 border-t border-slate-50 mt-2">
                 <h4 className="text-xs font-bold text-red-800 uppercase tracking-wide">Guardian Information</h4>
                 <div className="grid grid-cols-1 gap-4">
                     <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Guardian Name</label>
                      <input 
                        type="text" 
                        className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-red-800 outline-none placeholder-slate-400"
                        value={editFormData.guardianName || ''}
                        onChange={e => setEditFormData({...editFormData, guardianName: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Phone Number</label>
                      <input 
                        type="tel" 
                        className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-red-800 outline-none placeholder-slate-400"
                        value={editFormData.guardianPhone || ''}
                        onChange={e => setEditFormData({...editFormData, guardianPhone: e.target.value})}
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
                  className="flex items-center px-5 py-2.5 bg-red-800 text-white rounded-lg hover:bg-red-900 font-medium shadow-sm transition-colors"
                >
                  <Save size={18} className="mr-2"/> Save Changes
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
                      <h2 className="text-lg font-bold text-slate-900">Students with grade {selectedGrade}</h2>
                      <p className="text-sm text-slate-500">{(gradeBuckets[selectedGrade] || []).length} students</p>
                  </div>
                  <button onClick={() => setSelectedGrade(null)} className="text-slate-400 hover:text-slate-700 transition-colors bg-white p-2 rounded-full shadow-sm hover:shadow">
                      <X size={20} />
                  </button>
              </div>
              <div className="p-6 space-y-4">
                  {(!gradeBuckets[selectedGrade] || gradeBuckets[selectedGrade].length === 0) ? (
                      <div className="text-center text-slate-400 py-8">No students in this grade for the selected term.</div>
                  ) : (
                      <div className="space-y-3">
                          {gradeBuckets[selectedGrade].map((s, i) => (
                              <div key={s.id} className="flex items-center justify-between border-b border-slate-100 pb-3 last:pb-0">
                                  <div>
                                      <p className="font-semibold text-slate-800">{s.name}</p>
                                      <p className="text-xs text-slate-400">{s.class} • Avg: {s.avg}</p>
                                  </div>
                                  <div className="flex items-center gap-3">
                                      <button onClick={() => fetchAndViewStudent(s.id)} className="text-xs text-red-700 hover:underline">View</button>
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
