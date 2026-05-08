import React, { useState, useEffect } from "react";
import { Student, AttendanceRecord, Assessment, StudentFeeLedger, StudentRemark } from "../../types";
import { db } from "../../services/mockDb";
import { CreditCard, Activity, BookOpen, MessageSquare, FileText } from "lucide-react";

interface DashboardOverviewProps {
  student: Student;
}

const DashboardOverview: React.FC<DashboardOverviewProps> = ({ student }) => {
  const [loading, setLoading] = useState(true);
  const [dueFees, setDueFees] = useState(0);
  const [attendanceStats, setAttendanceStats] = useState({ present: 0, total: 0, percentage: 0 });
  const [latestExam, setLatestExam] = useState<Assessment | null>(null);
  const [latestRemark, setLatestRemark] = useState<StudentRemark | null>(null);

  useEffect(() => {
    async function fetchData() {
      if (!student.schoolId || !student.id) return;
      
      try {
        setLoading(true);
        
        // 1. Fetch Fees
        console.log("[Dashboard] Fetching ledgers...");
        const ledgerData = await db.getStudentLedgers({
          schoolId: student.schoolId,
          classId: student.classId || "",
          academicYear: "2024/2025",
          studentId: student.id
        });
        const ledgers = ledgerData;
        const totalDue = ledgers.reduce((sum, ledger) => sum + (ledger.openingBalance ?? 0), 0);
        setDueFees(totalDue);
        
        // 2. Fetch Attendance (Current Month)
        console.log("[Dashboard] Fetching attendance...");
        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const daysInMonth = new Date(year, date.getMonth() + 1, 0).getDate();
        const startDate = `${year}-${month}-01`;
        const endDate = `${year}-${month}-${daysInMonth}`;
        
        const attendanceRecords = await db.getClassAttendanceByDateRange(
          student.schoolId,
          student.classId || "",
          startDate,
          endDate
        );
        
        let present = 0;
        let total = 0;
        attendanceRecords.forEach(record => {
          if (!record.isHoliday) {
            total++;
            if (record.presentStudentIds.includes(student.id)) present++;
          }
        });
        
        setAttendanceStats({
          present,
          total,
          percentage: total > 0 ? Math.round((present / total) * 100) : 0
        });
        
        // 3. Fetch Latest Assessment
        console.log("[Dashboard] Fetching assessments...");
        const assessments = await db.getStudentAssessmentsByStudent(
          student.schoolId,
          student.id
        );
        
        if (assessments.length > 0) {
          // Sort by term desc
          const sorted = [...assessments].sort((a, b) => b.term - a.term);
          setLatestExam(sorted[0]);
        } else {
          setLatestExam(null);
        }

        // 4. Fetch Latest Remark
        console.log("[Dashboard] Fetching remarks...");
        const remarks = await db.getStudentRemarks(student.schoolId, student.id);
        if (remarks.length > 0) {
          const sorted = [...remarks].sort((a, b) => {
             const dateA = typeof a.dateCreated === 'number' ? a.dateCreated : new Date(a.dateCreated).getTime();
             const dateB = typeof b.dateCreated === 'number' ? b.dateCreated : new Date(b.dateCreated).getTime();
             return dateB - dateA;
          });
          setLatestRemark(sorted[0]);
        } else {
          setLatestRemark(null);
        }
        
      } catch (error) {
        console.error("Error fetching overview data:", error);
      } finally {
        setLoading(false);
      }
    }
    
    fetchData();
  }, [student]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 bg-slate-50 rounded-2xl border border-slate-200">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 overflow-y-auto pr-2 pb-10">
      {/* Dashboard Overview */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-700 rounded-2xl p-6 text-white shadow-md">
        <h2 className="text-2xl font-bold mb-2">Overview for {student.name}</h2>
        <p className="text-slate-300">Track student progress, attendance, and academic performance in one place.</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-orange-50 rounded-2xl p-5 border border-orange-100 flex flex-col justify-center">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-600">
              <CreditCard size={16} />
            </div>
            <span className="font-semibold text-orange-800">Due Fees</span>
          </div>
          <p className="text-2xl font-bold text-orange-900">GHS {dueFees.toFixed(2)}</p>
          <p className="text-xs text-orange-600 mt-1">
            {dueFees === 0 ? "Fully paid" : "Outstanding balance"}
          </p>
        </div>

        <div className="bg-purple-50 rounded-2xl p-5 border border-purple-100 flex flex-col justify-center">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600">
              <Activity size={16} />
            </div>
            <span className="font-semibold text-purple-800">Avg. Attendance</span>
          </div>
          <p className="text-2xl font-bold text-purple-900">{attendanceStats.percentage}%</p>
          <p className="text-xs text-purple-600 mt-1">
            Present {attendanceStats.present} out of {attendanceStats.total} days this month
          </p>
        </div>

        <div className="bg-green-50 rounded-2xl p-5 border border-green-100 flex flex-col justify-center">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600">
              <BookOpen size={16} />
            </div>
            <span className="font-semibold text-green-800">Latest Exam</span>
          </div>
          <p className="text-2xl font-bold text-green-900">
            {latestExam ? `${latestExam.total || (latestExam.testScore + latestExam.homeworkScore + latestExam.projectScore + latestExam.examScore)}/100` : "N/A"}
          </p>
          <p className="text-xs text-green-600 mt-1 truncate">
            {latestExam ? `${latestExam.subject} - Term ${latestExam.term}` : "No exams recorded"}
          </p>
        </div>
      </div>

      {/* Notice Board and Exam Results */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <MessageSquare size={18} className="text-blue-500" /> Recent Remarks
          </h3>
          <div className="space-y-4">
            {latestRemark ? (
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                <p className="text-sm text-slate-700 italic mb-3">"{latestRemark.remark}"</p>
                <div className="flex items-center justify-between">
                  <span className={`px-2 py-1 rounded-full text-[10px] font-bold border ${
                    latestRemark.behaviorTag === "Excellent" ? "bg-green-100 text-green-700 border-green-200" :
                    latestRemark.behaviorTag === "Good" ? "bg-blue-100 text-blue-700 border-blue-200" :
                    "bg-yellow-100 text-yellow-700 border-yellow-200"
                  }`}>
                    {latestRemark.behaviorTag}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {new Date(latestRemark.dateCreated).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-slate-500 text-sm">
                No recent remarks available for this term.
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <FileText size={18} className="text-purple-500" /> Recent Results
          </h3>
          <div className="space-y-3">
            {latestExam ? (
              <div className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-lg">
                <div>
                  <p className="text-sm font-semibold text-slate-700">{latestExam.subject}</p>
                  <p className="text-xs text-slate-500">Term {latestExam.term}</p>
                </div>
                <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-bold rounded">
                  {latestExam.total || (latestExam.testScore + latestExam.homeworkScore + latestExam.projectScore + latestExam.examScore)}%
                </span>
              </div>
            ) : (
              <div className="text-center py-6 text-slate-500 text-sm">
                No exam results recorded yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardOverview;
