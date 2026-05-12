import React, { useState, useEffect, useMemo } from "react";
import { db } from "../../services/mockDb";
import { useAuth } from "../../context/AuthContext";
import { AttendanceRecord, Student } from "../../types";
import { Calendar, CheckCircle, XCircle, Clock, TrendingUp, X } from "lucide-react";

interface AttendanceViewProps {
  student: Student;
  onClose?: () => void;
}

interface CalendarDay {
  date: string;
  day: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  attendance?: "present" | "absent" | "holiday" | "no-record";
}

const AttendanceView: React.FC<AttendanceViewProps> = ({ student, onClose }) => {
  const { user } = useAuth();
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  useEffect(() => {
    async function fetchAttendance() {
      if (!student.classId || !student.schoolId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        // Get start and end date for the selected month
        // Use robust date string calculation to avoid timezone shifts
        const year = selectedYear;
        const month = String(selectedMonth + 1).padStart(2, '0');
        const startDate = `${year}-${month}-01`;
        
        // Get last day of month
        const lastDay = new Date(selectedYear, selectedMonth + 1, 0).getDate();
        const endDate = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
        
        console.log(`[AttendanceView] Fetching attendance for class ${student.classId} from ${startDate} to ${endDate}`);
        const records = await db.getClassAttendanceByDateRange(
          student.schoolId,
          student.classId,
          startDate,
          endDate
        );
        setAttendanceRecords(records);
        setErrorMsg(null);
      } catch (error: any) {
        console.error("Error fetching attendance:", error);
        setErrorMsg(error.message || "Failed to fetch attendance");
      } finally {
        setLoading(false);
      }
    }

    fetchAttendance();
  }, [student.id, student.classId, student.schoolId, selectedMonth, selectedYear]);

  const getDaysInMonth = (month: number, year: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (month: number, year: number) => {
    return new Date(year, month, 1).getDay();
  };

  const calendarDays = useMemo((): CalendarDay[] => {
    const days: CalendarDay[] = [];
    const daysInMonth = getDaysInMonth(selectedMonth, selectedYear);
    const firstDay = getFirstDayOfMonth(selectedMonth, selectedYear);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Add empty cells for days before the first day of the month
    for (let i = 0; i < firstDay; i++) {
      days.push({
        date: "",
        day: 0,
        isCurrentMonth: false,
        isToday: false,
      });
    }

    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const date = new Date(dateStr);
      date.setHours(0, 0, 0, 0);

      const record = attendanceRecords.find(r => r.date === dateStr);
      let attendance: CalendarDay["attendance"] = "no-record";

      if (record) {
        if (record.isHoliday) {
          attendance = "holiday";
        } else if (record.presentStudentIds?.includes(student.id)) {
          attendance = "present";
        } else {
          attendance = "absent";
        }
      }

      days.push({
        date: dateStr,
        day,
        isCurrentMonth: true,
        isToday: date.getTime() === today.getTime(),
        attendance,
      });
    }

    return days;
  }, [selectedMonth, selectedYear, attendanceRecords, student.id]);

  const stats = useMemo(() => {
    const recordsWithAttendance = attendanceRecords.filter(r => !r.isHoliday);
    const totalDays = recordsWithAttendance.length;
    const presentDays = recordsWithAttendance.filter(r =>
      r.presentStudentIds?.includes(student.id)
    ).length;
    const absentDays = totalDays - presentDays;
    const percentage = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;

    return { totalDays, presentDays, absentDays, percentage };
  }, [attendanceRecords, student.id]);

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  const navigateMonth = (direction: number) => {
    let newMonth = selectedMonth + direction;
    let newYear = selectedYear;

    if (newMonth > 11) {
      newMonth = 0;
      newYear += 1;
    } else if (newMonth < 0) {
      newMonth = 11;
      newYear -= 1;
    }

    setSelectedMonth(newMonth);
    setSelectedYear(newYear);
  };

  const getAttendanceColor = (attendance?: string) => {
    switch (attendance) {
      case "present": return "bg-green-100 text-green-700 border-green-300";
      case "absent": return "bg-red-100 text-red-700 border-red-300";
      case "holiday": return "bg-blue-100 text-blue-700 border-blue-300";
      default: return "bg-gray-50 text-gray-400 border-gray-200";
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl max-w-2xl w-full p-8">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={onClose ? "fixed inset-0 z-50 bg-slate-50 flex flex-col" : "bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col h-full"}>
      {/* Header */}
      {onClose && (
        <div className="bg-white border-b border-slate-200 px-4 py-4 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center">
              <Calendar size={20} />
            </div>
            <div>
              <h2 className="font-bold text-slate-800 text-lg">Attendance Record</h2>
              <p className="text-sm text-slate-500">{student.name} • Class {student.classId}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>
      )}

        <div className="p-6 space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-green-50 rounded-xl p-3 sm:p-4 border border-green-100">
              <div className="flex items-center gap-1.5 sm:gap-2 mb-1 sm:mb-2">
                <CheckCircle size={16} className="text-green-600 sm:w-[18px] sm:h-[18px]" />
                <span className="text-xs sm:text-sm text-green-700 font-medium truncate">Present</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-green-800">{stats.presentDays}</p>
            </div>
            <div className="bg-red-50 rounded-xl p-3 sm:p-4 border border-red-100">
              <div className="flex items-center gap-1.5 sm:gap-2 mb-1 sm:mb-2">
                <XCircle size={16} className="text-red-600 sm:w-[18px] sm:h-[18px]" />
                <span className="text-xs sm:text-sm text-red-700 font-medium truncate">Absent</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-red-800">{stats.absentDays}</p>
            </div>
            <div className="bg-blue-50 rounded-xl p-3 sm:p-4 border border-blue-100">
              <div className="flex items-center gap-1.5 sm:gap-2 mb-1 sm:mb-2">
                <Calendar size={16} className="text-blue-600 sm:w-[18px] sm:h-[18px]" />
                <span className="text-xs sm:text-sm text-blue-700 font-medium truncate">Total Days</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-blue-800">{stats.totalDays}</p>
            </div>
            <div className="bg-purple-50 rounded-xl p-3 sm:p-4 border border-purple-100">
              <div className="flex items-center gap-1.5 sm:gap-2 mb-1 sm:mb-2">
                <TrendingUp size={16} className="text-purple-600 sm:w-[18px] sm:h-[18px]" />
                <span className="text-xs sm:text-sm text-purple-700 font-medium truncate">Attendance</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-purple-800">{stats.percentage}%</p>
            </div>
          </div>

          {/* Month Navigation */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigateMonth(-1)}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              ← Previous
            </button>
            <h3 className="text-lg font-semibold text-slate-800">
              {monthNames[selectedMonth]} {selectedYear}
            </h3>
            <button
              onClick={() => navigateMonth(1)}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Next →
            </button>
          </div>


          {/* Calendar */}
          <div className="border border-slate-200 rounded-xl overflow-x-auto">
            <div className="min-w-[400px] sm:min-w-0">
              {/* Day Headers */}
              <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
                  <div key={day} className="p-2 sm:p-3 text-center text-xs sm:text-sm font-medium text-slate-600">
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar Days */}
              <div className="grid grid-cols-7">
                {calendarDays.map((day, index) => (
                  <div
                    key={index}
                    className={`p-1.5 sm:p-2 min-h-[60px] sm:min-h-[80px] border-b border-r border-slate-100 ${
                      !day.isCurrentMonth ? "bg-slate-50" : ""
                    }`}
                  >
                    {day.day > 0 && (
                      <>
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-xs sm:text-sm ${
                            day.isToday ? "font-bold text-blue-600" : "text-slate-700"
                          }`}>
                            {day.day}
                          </span>
                          {day.attendance && day.attendance !== "no-record" && (
                            <div className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full shrink-0 ${
                              day.attendance === "present" ? "bg-green-500" :
                              day.attendance === "absent" ? "bg-red-500" :
                              "bg-blue-500"
                            }`} />
                          )}
                        </div>
                        {day.isCurrentMonth && (
                          <div className={`text-[10px] sm:text-xs px-0.5 sm:px-1 py-0.5 rounded border text-center truncate ${getAttendanceColor(day.attendance)}`}>
                            {day.attendance === "present" && "Present"}
                            {day.attendance === "absent" && "Absent"}
                            {day.attendance === "holiday" && "Holiday"}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 text-sm text-slate-600">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span>Present</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <span>Absent</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500"></div>
              <span>Holiday</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-gray-300"></div>
              <span>No Record</span>
            </div>
          </div>
      </div>
    </div>
  );
};

export default AttendanceView;
