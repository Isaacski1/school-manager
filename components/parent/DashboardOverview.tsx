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
        
        // 0. Fetch School Config first to get correct academic context
        let config;
        try {
          config = await db.getSchoolConfig(student.schoolId);
        } catch (e) {
          console.error("[DashboardOverview] Error fetching school config:", e);
          throw e;
        }
        
        const currentYear = config.academicYear || "2023-2024";
        const currentTermLabel = config.currentTerm || "Term 1";
        const currentTermNum = parseInt(currentTermLabel.split(" ")[1]) || 1;
        
        // --- PARALLEL DATA FETCHING ---
        // Fire all remaining queries at once to vastly improve load time
        const [ledgerData, paymentData, allClassAttendance, assessments, remarks] = await Promise.all([
          // 1. Fees data
          db.getStudentLedgers({
            schoolId: student.schoolId,
            classId: student.classId || "",
            academicYear: currentYear,
            studentId: student.id
          }).catch(e => { console.error("Error fetching ledgers:", e); return []; }),
          
          db.getPayments({
            schoolId: student.schoolId,
            studentId: student.id
          }).catch(e => { console.error("Error fetching payments:", e); return []; }),
          
          // 2. Attendance data
          db.getClassAttendance(student.schoolId, student.classId || "")
            .catch(e => { console.error("Error fetching attendance:", e); return []; }),
            
          // 3. Assessments data
          db.getStudentAssessmentsByStudent(student.schoolId, student.id)
            .catch(e => { console.error("Error fetching assessments:", e); return []; }),
            
          // 4. Remarks data
          db.getStudentRemarksByStudent(student.schoolId, student.id)
            .catch(e => { console.error("Error fetching remarks:", e); return []; })
        ]);

        // --- PROCESS RESULTS ---
        
        // 1. Process Fees
        // We calculate balance per-ledger (per term) to correctly handle payments made
        // via the parent portal (feeId = "online_payment") that are not tied to a specific
        // fee but still reduce the overall term balance.
        let totalDue = 0;
        ledgerData.forEach((ledger: any) => {
          const totalFeesInLedger = ledger.fees.reduce((sum: number, fee: any) => sum + fee.amount, 0);
          const openingPaidTotal = ledger.fees.reduce((sum: number, fee: any) => sum + (fee.openingPaidAmount || 0), 0);

          // Sum ALL payments for this student in this specific term (regardless of feeId)
          const termPayments = paymentData.filter(
            (p: any) => p.studentId === student.id &&
                        p.academicYear === ledger.academicYear &&
                        p.term === ledger.term
          );
          const paidSinceOnboarding = termPayments.reduce((sum: number, p: any) => sum + p.amountPaid, 0);

          const totalPaid = openingPaidTotal + paidSinceOnboarding;
          totalDue += Math.max(0, totalFeesInLedger - totalPaid);
        });
        setDueFees(totalDue);
        
        // 2. Process Attendance (Term-wide)
        const getLocalDateString = (d: Date) => 
          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        
        const today = new Date();
        const endDate = getLocalDateString(today);
        
        // Use schoolReopenDate or fallback to 90 days ago
        let startDate = config.schoolReopenDate?.trim();
        if (!startDate || startDate > endDate) {
          const fallbackDate = new Date();
          fallbackDate.setDate(today.getDate() - 90); 
          startDate = getLocalDateString(fallbackDate);
        }
        
        let present = 0;
        let total = 0;
        const studentIdTrimmed = student.id.trim();
        
        allClassAttendance.forEach(record => {
          // Filter by date range locally
          if (record.date >= startDate! && record.date <= endDate) {
            if (!record.isHoliday) {
              total++;
              // Robust ID check
              const isPresent = record.presentStudentIds?.some((id: string) => id.trim() === studentIdTrimmed);
              if (isPresent) present++;
            }
          }
        });
        
        // Final fallback: If still 0 days found in the term but data exists elsewhere, 
        // try the full 90-day window to show SOMETHING useful
        if (total === 0 && allClassAttendance.length > 0) {
           const fallbackDate = new Date();
           fallbackDate.setDate(today.getDate() - 90);
           const fallbackStart = getLocalDateString(fallbackDate);
           
           allClassAttendance.forEach(record => {
             if (record.date >= fallbackStart && record.date <= endDate) {
               if (!record.isHoliday) {
                 total++;
                 const isPresent = record.presentStudentIds?.some((id: string) => id.trim() === studentIdTrimmed);
                 if (isPresent) present++;
               }
             }
           });
        }
        
        setAttendanceStats({
          present,
          total,
          percentage: total > 0 ? Math.round((present / total) * 100) : 0
        });
        
        // 3. Process Latest Assessment
        if (assessments.length > 0) {
          // Sort by term desc, then academic year desc
          const sorted = [...assessments].sort((a, b) => {
            if (b.academicYear !== a.academicYear) return b.academicYear.localeCompare(a.academicYear);
            
            // Extract term numbers for comparison
            const termA = parseInt(String(a.term).replace(/\D/g, '')) || 0;
            const termB = parseInt(String(b.term).replace(/\D/g, '')) || 0;
            return termB - termA;
          });
          
          setLatestExam(sorted[0]);
        }
        
        // 4. Process Latest Remark
        if (remarks.length > 0) {
          // Find remark matching current year and term, otherwise use the most recent
          let matchedRemark = remarks.find(
            r => r.academicYear === currentYear && r.term === currentTermLabel
          );
          
          if (!matchedRemark) {
            // Sort to find latest
            const sortedRemarks = [...remarks].sort((a, b) => {
              if (b.academicYear !== a.academicYear) return b.academicYear.localeCompare(a.academicYear);
              const termA = parseInt(String(a.term).replace(/\D/g, '')) || 0;
              const termB = parseInt(String(b.term).replace(/\D/g, '')) || 0;
              return termB - termA;
            });
            matchedRemark = sortedRemarks[0];
          }
          
          setLatestRemark(matchedRemark);
        }
        
      } catch (error) {
        console.error("General error in DashboardOverview fetchData:", error);
      } finally {
        setLoading(false);
      }
    }
    
    fetchData();
  }, [student.id, student.schoolId, student.classId]);

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
            Present {attendanceStats.present} out of {attendanceStats.total} days this term
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
