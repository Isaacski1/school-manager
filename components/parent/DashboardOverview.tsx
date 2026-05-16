import React, { useState, useEffect } from "react";
import { Student, AttendanceRecord, Assessment, StudentFeeLedger, StudentRemark, FeeDefinition } from "../../types";
import { db } from "../../services/mockDb";
import { CreditCard, Activity, BookOpen, MessageSquare, FileText } from "lucide-react";
import { useAuth } from "../../context/AuthContext";

interface DashboardOverviewProps {
  student: Student;
}

const DashboardOverview: React.FC<DashboardOverviewProps> = ({ student }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [dueFees, setDueFees] = useState(0);
  const [attendanceStats, setAttendanceStats] = useState({ present: 0, total: 0, percentage: 0, isNew: false });
  const [hasLedgers, setHasLedgers] = useState(false);
  const [latestExam, setLatestExam] = useState<Assessment | null>(null);
  const [latestRemark, setLatestRemark] = useState<StudentRemark | null>(null);

  useEffect(() => {
    async function fetchData() {
      const effectiveSchoolId = student.schoolId || (user as any)?.schoolId;
      if (!effectiveSchoolId || !student.id) return;
      
      try {
        setLoading(true);
        
        // 0. Fetch School Config first to get correct academic context
        let config;
        try {
          config = await db.getSchoolConfig(effectiveSchoolId);
        } catch (e) {
          console.error("[DashboardOverview] Error fetching school config:", e);
          throw e;
        }
        
        const currentYear = config.academicYear || "2023-2024";
        const currentTermLabel = config.currentTerm || "Term 1";
        const currentTermNum = parseInt(currentTermLabel.split(" ")[1]) || 1;
        const getStudentCreatedAtMs = () => {
          if (!student.createdAt) return null;
          const value =
            student.createdAt instanceof Date
              ? student.createdAt.getTime()
              : new Date(student.createdAt).getTime();
          return Number.isNaN(value) ? null : value;
        };
        const isFeeApplicableToStudent = (fee: FeeDefinition) => {
          if (fee.academicYear !== currentYear || fee.term !== currentTermLabel) {
            return false;
          }
          if (fee.feeFrequency === "per_year" && fee.applyToAcademicYear && fee.applyToAcademicYear !== currentYear) {
            return false;
          }
          if (fee.feeFrequency === "per_term" && fee.applyToTerm && fee.applyToTerm !== currentTermLabel) {
            return false;
          }

          switch (fee.appliesTo || "all_students") {
            case "class":
              return !fee.classId || fee.classId === student.classId;
            case "selected_students":
              return fee.selectedStudentIds?.includes(student.id) || false;
            case "new_students_only": {
              const cutoffDate = config.schoolReopenDate || "";
              if (!cutoffDate) return true;
              const createdAtMs = getStudentCreatedAtMs();
              if (createdAtMs === null) return true;
              const cutoffMs = new Date(`${cutoffDate}T00:00:00`).getTime();
              return Number.isNaN(cutoffMs) || createdAtMs >= cutoffMs;
            }
            case "all_students":
            default:
              return true;
          }
        };
        
        // --- PARALLEL DATA FETCHING ---
        console.log(`[DashboardOverview] Student Data Probe:`, {
          id: student.id,
          name: student.name,
          schoolId: student.schoolId,
          classId: student.classId,
          effectiveSchoolId
        });

        const [ledgerData, paymentData, allClassAttendance, assessments, remarks] = await Promise.all([
          // 1. Fees data
          db.getStudentLedgers({
            schoolId: effectiveSchoolId,
            classId: student.classId || "",
            academicYear: currentYear,
            studentId: student.id
          }).catch(e => { 
            console.error("[DashboardOverview] Ledger Fetch Error:", e); 
            // If it's a permission error (401/403), it might be due to a missing schoolId on the student record
            return []; 
          }),
          
          db.getPayments({
            schoolId: effectiveSchoolId,
            studentId: student.id
          }).catch(e => { console.error("Error fetching payments:", e); return []; }),
          
          // 2. Attendance data
          db.getClassAttendance(effectiveSchoolId, student.classId || "")
            .catch(e => { console.error("Error fetching attendance:", e); return []; }),
            
          // 3. Assessments data
          db.getStudentAssessmentsByStudent(effectiveSchoolId, student.id)
            .catch(e => { console.error("Error fetching assessments:", e); return []; }),
            
          // 4. Remarks data
          db.getStudentRemarksByStudent(effectiveSchoolId, student.id)
            .catch(e => { console.error("Error fetching remarks:", e); return []; })
        ]);

        // --- PROCESS RESULTS ---
        console.log(`[DashboardOverview] Data Counts for ${student.name}:`, {
          ledgers: ledgerData.length,
          payments: paymentData.length,
          attendanceRecords: allClassAttendance.length,
          assessments: assessments.length,
          remarks: remarks.length
        });
        // We calculate balance per-ledger (per term) to correctly handle payments made
        // via the parent portal (feeId = "online_payment") that are not tied to a specific
        
        // 1. Process Fees
        let finalLedgerData = [...ledgerData];
        
        if (finalLedgerData.length === 0) {
          console.log("[DashboardOverview] No personal ledger found, fetching class-wide fees as fallback...");
          try {
            const allFees = await db.getFees({
              schoolId: effectiveSchoolId,
              academicYear: currentYear,
            });
            const classFees = allFees.filter(isFeeApplicableToStudent);
            
            if (classFees.length > 0) {
              console.log("[DashboardOverview] Projected class fees found:", classFees);
              // Create a virtual ledger for the UI
              const virtualLedger: any = {
                id: "virtual_ledger_" + student.id,
                studentId: student.id,
                classId: student.classId,
                academicYear: currentYear,
                term: currentTermLabel,
                fees: classFees.map(f => ({
                  feeId: f.id,
                  feeName: f.feeName,
                  amount: f.amount
                })),
                isVirtual: true
              };
              finalLedgerData = [virtualLedger];
            }
          } catch (e) {
            console.error("[DashboardOverview] Class fee fetch failed:", e);
          }
        }

        const currentTermLedgers = finalLedgerData.filter(
          (l) => l.academicYear === currentYear && l.term === currentTermLabel
        );
        
        const hasLedgers = finalLedgerData.length > 0;
        const currentBalance = currentTermLedgers.reduce((acc, ledger) => {
          const totalDue = ledger.fees.reduce((sum: number, f: any) => sum + f.amount, 0);
          const totalPaid = paymentData
            .filter((p) => p.studentId === student.id && p.academicYear === currentYear && p.term === currentTermLabel)
            .reduce((sum, p) => sum + p.amountPaid, 0);
          return acc + (totalDue - totalPaid);
        }, 0);

        setDueFees(currentBalance);
        setHasLedgers(hasLedgers);
        
        // 2. Process Attendance (Term-wide, aligned with admin student view)
        const getLocalDateString = (d: Date) => 
          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const endDate = getLocalDateString(today);
        
        let present = 0;
        let total = 0;
        const studentIdTrimmed = student.id.trim();
        const recordHolidayDates = new Set(
          allClassAttendance.filter((record) => record.isHoliday).map((record) => record.date),
        );
        const configHolidayDates = new Set(
          (config.holidayDates || []).map((holiday: any) => holiday.date),
        );
        const schoolDates: string[] = [];
        
        if (config.schoolReopenDate) {
          const cursor = new Date(`${config.schoolReopenDate}T00:00:00`);
          const vacation = config.vacationDate
            ? new Date(`${config.vacationDate}T00:00:00`)
            : null;
          const finalDay = vacation && vacation < today ? vacation : today;

          while (!Number.isNaN(cursor.getTime()) && cursor <= finalDay) {
            const dateKey = getLocalDateString(cursor);
            const day = cursor.getDay();
            if (
              day !== 0 &&
              day !== 6 &&
              !recordHolidayDates.has(dateKey) &&
              !configHolidayDates.has(dateKey)
            ) {
              total++;
              schoolDates.push(dateKey);
            }
            cursor.setDate(cursor.getDate() + 1);
          }
        }

        if (total === 0) {
          allClassAttendance.forEach(record => {
            if (!record.isHoliday && !configHolidayDates.has(record.date)) {
              total++;
              schoolDates.push(record.date);
            }
          });
        }

        const schoolDateSet = new Set(schoolDates);
        present = allClassAttendance.filter(record =>
          !record.isHoliday &&
          !configHolidayDates.has(record.date) &&
          (schoolDateSet.size === 0 || schoolDateSet.has(record.date)) &&
          record.presentStudentIds?.some((id: string) => id.trim() === studentIdTrimmed)
        ).length;
        
        present = Math.min(present, total);
        const attendancePercentage = total > 0 ? Math.round((present / total) * 100) : 0;
        
        // Check if student is "New" (joined in the last 7 days)
        const isNewStudent = student.createdAt ? (Date.now() - new Date(student.createdAt).getTime() < 7 * 24 * 60 * 60 * 1000) : false;

        setAttendanceStats({
          present,
          total,
          percentage: attendancePercentage,
          isNew: isNewStudent && total === 0
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

  if (!student.classId) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl border border-amber-200 shadow-sm">
        <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mb-4">
          <FileText size={32} />
        </div>
        <h3 className="text-xl font-bold text-slate-800 mb-2">No Class Assigned</h3>
        <p className="text-slate-500 text-center max-w-md">
          {student.name} has been added to the system but has not been assigned to a class yet. 
          Please contact the school administration to assign a class.
        </p>
      </div>
    );
  }

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
          <p className="text-2xl font-bold text-orange-900">
            {dueFees > 0 ? `GHS ${dueFees.toFixed(2)}` : hasLedgers ? "GHS 0.00" : "—"}
          </p>
          <p className="text-xs text-orange-600 mt-1">
            {dueFees > 0 
              ? "Outstanding balance" 
              : hasLedgers 
                ? "Fully paid" 
                : "Setting up account balance..."}
          </p>
        </div>

        <div className="bg-purple-50 rounded-2xl p-5 border border-purple-100 flex flex-col justify-center">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600">
              <Activity size={16} />
            </div>
            <span className="font-semibold text-purple-800">Avg. Attendance</span>
          </div>
          <p className="text-2xl font-bold text-purple-900">
            {attendanceStats.total > 0 ? `${attendanceStats.percentage}%` : "—"}
          </p>
          <p className="text-xs text-purple-600 mt-1">
            {attendanceStats.total > 0 
              ? `Present ${attendanceStats.present} out of ${attendanceStats.total} days this term`
              : (attendanceStats as any).isNew ? "Attendance tracking starting soon" : "No attendance records yet"}
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
            {latestExam ? `${latestExam.total || (latestExam.testScore + latestExam.homeworkScore + latestExam.projectScore + latestExam.examScore)}/100` : "—"}
          </p>
          <p className="text-xs text-green-600 mt-1 truncate">
            {latestExam ? `${latestExam.subject} - Term ${latestExam.term}` : "No exams recorded this term"}
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
