import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../../components/Layout';
import { useAuth } from '../../context/AuthContext';
import { CLASSES_LIST } from '../../constants';
import { db } from '../../services/mockDb';
import { Notice, TimeSlot, ClassTimetable, TeacherAttendanceRecord } from '../../types';
import TeacherAttendance from './TeacherAttendance';
import { ClipboardCheck, BookOpen, Clock, TrendingUp, Bell, ChevronDown } from 'lucide-react';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const TeacherDashboard = () => {
  const { user } = useAuth();

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
  const [showWeeklyAttendance, setShowWeeklyAttendance] = useState(false);
   const [missedAttendanceModal, setMissedAttendanceModal] = useState<{show: boolean, date: string}>({show: false, date: ''});
  
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

    const getWeekDates = () => {
        const now = new Date();
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

  // Refresh attendance data when returning from attendance page
  useEffect(() => {
    if (!showWeeklyAttendance) {
      // Re-check for missed attendance when returning to dashboard
      const checkAttendance = async () => {
        const today = new Date().toISOString().split('T')[0];
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const todayAttendance = await db.getTeacherAttendance(user?.id || '', today);

        try {
          const config = await db.getSchoolConfig();
          const schoolHasReopened = config.schoolReopenDate && yesterday >= config.schoolReopenDate;
          if (schoolHasReopened) {
            const yesterdayAttendance = await db.getTeacherAttendance(user?.id || '', yesterday);
            if (!yesterdayAttendance) {
              setMissedAttendanceModal({show: true, date: yesterday});
            } else {
              setMissedAttendanceModal({show: false, date: ''});
            }
          }
        } catch (error) {
          console.error('Error re-checking missed attendance:', error);
        }
      };

      if (user) checkAttendance();
    }
  }, [showWeeklyAttendance, user]);

  useEffect(() => {
    const fetchData = async () => {
        // Fetch Config for Term Badge
        try {
            const config = await db.getSchoolConfig();
            if (config && config.currentTerm) {
                setCurrentTerm(config.currentTerm);
            }
        } catch (e) {
            console.error(e);
        }

        // Notices
        const noticeData = await db.getNotices();
        setNotices(noticeData);

        // Teacher Attendance
        const today = new Date().toISOString().split('T')[0];
        const attendance = await db.getTeacherAttendance(user?.id || '', today);
        setTeacherAttendance(attendance);

        // Check for missed attendance (yesterday)
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        try {
          const config = await db.getSchoolConfig();
          const schoolHasReopened = config.schoolReopenDate && yesterday >= config.schoolReopenDate;
          if (schoolHasReopened) {
            const yesterdayAttendance = await db.getTeacherAttendance(user?.id || '', yesterday);
            if (!yesterdayAttendance) {
              setMissedAttendanceModal({show: true, date: yesterday});
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
                const weekDates = getWeekDates();

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

            } catch (error) {
                console.error("Error calculating attendance trend:", error);
            }
        }
    };
    fetchData();
    }, [selectedClassId]);

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

  if (showWeeklyAttendance) {
    return (
      <div>
        <button
          onClick={() => setShowWeeklyAttendance(false)}
          className="mb-4 px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors"
        >
          ← Back to Dashboard
        </button>
        <TeacherAttendance />
      </div>
    );
  }

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

                <button onClick={() => setShowWeeklyAttendance(true)} className="group block bg-white p-6 rounded-xl shadow-sm border border-slate-100 hover:border-green-500 transition-all relative overflow-hidden w-full text-left">
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
                </button>
            </div>

            {/* Attendance Chart Visualization */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-slate-800 flex items-center">
                        <TrendingUp className="w-5 h-5 mr-2 text-red-700"/> Weekly Attendance Trend
                    </h3>
                    <div className="flex gap-2">
                        <span className="px-3 py-1 text-xs font-medium rounded-full bg-red-600 text-white">This Week</span>
                    </div>
                </div>
                <div className="flex items-end justify-between h-40 gap-2 px-2">
                    {attendanceTrend.length === 0 ? (
                         <div className="w-full h-full flex flex-col items-center justify-center text-slate-300">
                             <TrendingUp className="w-8 h-8 mb-2 opacity-30"/>
                             <p className="text-sm italic">No attendance records found.</p>
                         </div>
                    ) : (
                        attendanceTrend.map((data, i) => (
                            <div key={i} className="flex flex-col items-center flex-1 group">
                                <div className="relative w-full flex justify-center">
                                    <div 
                                        className="w-full max-w-[40px] bg-slate-100 rounded-t-lg transition-all duration-500 group-hover:bg-red-100 relative overflow-hidden"
                                        style={{ height: '140px' }}
                                    >
                                        <div 
                                            className="absolute bottom-0 left-0 right-0 bg-red-600 rounded-t-lg transition-all duration-1000"
                                            style={{ height: `${data.percentage}%` }}
                                        ></div>
                                    </div>
                                    {/* Tooltip */}
                                    <div className="absolute -top-8 bg-slate-800 text-white text-xs py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                        {data.percentage}%
                                    </div>
                                </div>
                                <span className="text-xs text-slate-500 mt-2 font-medium">
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
                  <p className="text-sm text-slate-500">You missed marking attendance yesterday</p>
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
                <button
                  onClick={() => {
                    setMissedAttendanceModal({show: false, date: ''});
                    setShowWeeklyAttendance(true);
                  }}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  Mark Attendance
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
