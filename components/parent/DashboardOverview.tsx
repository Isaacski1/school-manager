import React, { useState, useEffect } from "react";
import { Student, Assessment, StudentRemark, FeeDefinition, FeeTerm, StudentFeeLedger } from "../../types";
import { db } from "../../services/mockDb";
import { CreditCard, Activity, BookOpen, MessageSquare, FileText, CalendarDays, ArrowRight, TrendingUp, Clock, CheckCircle2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { getParentFeeTotals } from "../../services/parentFees";

interface DashboardOverviewProps {
  student: Student;
}

const formatCurrency = (value: number) =>
  `GHS ${value.toFixed(2)}`;

const formatDate = (value?: string | number | Date) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value as any);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString();
};

const daysRemaining = (endDateStr?: string) => {
  if (!endDateStr) return null;
  const end = new Date(`${endDateStr}T23:59:59`);
  if (Number.isNaN(end.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffMs = end.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return diffDays;
};

const DashboardOverview: React.FC<DashboardOverviewProps> = ({ student }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [dueFees, setDueFees] = useState(0);
  const [feeStatus, setFeeStatus] = useState<"Paid" | "Part-paid" | "Outstanding" | "Loading">("Loading");
  const [lastPaymentDate, setLastPaymentDate] = useState<string | null>(null);
  const [attendanceStats, setAttendanceStats] = useState({ present: 0, total: 0, percentage: 0, isNew: false });
  const [hasLedgers, setHasLedgers] = useState(false);
  const [latestExam, setLatestExam] = useState<Assessment | null>(null);
  const [recentAssessments, setRecentAssessments] = useState<Assessment[]>([]);
  const [latestRemark, setLatestRemark] = useState<StudentRemark | null>(null);
  const [termInfo, setTermInfo] = useState<{
    currentTerm: string;
    academicYear: string;
    termEndDate: string;
    daysRemaining: number | null;
  } | null>(null);

  useEffect(() => {
    async function fetchData() {
      const effectiveSchoolId = student.schoolId || (user as any)?.schoolId;
      if (!effectiveSchoolId || !student.id) return;

      try {
        setLoading(true);

        let config;
        try {
          config = await db.getSchoolConfig(effectiveSchoolId);
        } catch (e) {
          console.error("[DashboardOverview] Error fetching school config:", e);
          throw e;
        }

        const currentYear = config.academicYear || "2023-2024";
        const currentTermLabel = config.currentTerm || "Term 1";
        const selectedFeeTerm: FeeTerm =
          currentTermLabel === "Term 2" || currentTermLabel === "Term 3"
            ? currentTermLabel
            : "Term 1";
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

        const [ledgerData, paymentData, allClassAttendance, assessments, remarks] = await Promise.all([
          db.getStudentLedgers({
            schoolId: effectiveSchoolId,
            academicYear: currentYear,
            studentId: student.id
          }).catch(e => {
            console.error("[DashboardOverview] Ledger Fetch Error:", e);
            return [];
          }),

          db.getPayments({
            schoolId: effectiveSchoolId,
            studentId: student.id
          }).catch(e => { console.error("Error fetching payments:", e); return []; }),

          db.getClassAttendance(effectiveSchoolId, student.classId || "")
            .catch(e => { console.error("Error fetching attendance:", e); return []; }),

          db.getStudentAssessmentsByStudent(effectiveSchoolId, student.id)
            .catch(e => { console.error("Error fetching assessments:", e); return []; }),

          db.getStudentRemarksByStudent(effectiveSchoolId, student.id)
            .catch(e => { console.error("Error fetching remarks:", e); return []; })
        ]);

        let finalLedgerData: StudentFeeLedger[] = [...ledgerData];

        if (finalLedgerData.length === 0) {
          try {
            const allFees = await db.getFees({
              schoolId: effectiveSchoolId,
              academicYear: currentYear,
            });
            const classFees = allFees.filter(isFeeApplicableToStudent);

            if (classFees.length > 0) {
              const virtualLedger: StudentFeeLedger = {
                id: "virtual_ledger_" + student.id,
                schoolId: effectiveSchoolId,
                studentId: student.id,
                classId: student.classId || "",
                academicYear: currentYear,
                term: selectedFeeTerm,
                fees: classFees.map(f => ({
                  feeId: f.id,
                  feeName: f.feeName,
                  amount: f.amount
                })),
                createdAt: Date.now(),
              };
              finalLedgerData = [virtualLedger];
            }
          } catch (e) {
            console.error("[DashboardOverview] Class fee fetch failed:", e);
          }
        }

        const currentTermLedgers = finalLedgerData.filter(
          (ledger) =>
            ledger.academicYear === currentYear &&
            ledger.term === selectedFeeTerm,
        );

        const hasLedgers = finalLedgerData.length > 0;
        const { totals } = getParentFeeTotals(
          currentTermLedgers,
          paymentData,
          selectedFeeTerm,
          currentYear,
        );

        setDueFees(totals.totalBalance);
        setHasLedgers(hasLedgers);

        const sortedPayments = [...paymentData].sort((a, b) => {
          const aDate = new Date(a.createdAt as any).getTime();
          const bDate = new Date(b.createdAt as any).getTime();
          return bDate - aDate;
        });
        const lastPayment = sortedPayments[0] || null;
        setLastPaymentDate(formatDate(lastPayment?.createdAt));

        let feeStatusValue: "Paid" | "Part-paid" | "Outstanding" = "Outstanding";
        if (totals.totalBalance <= 0 && hasLedgers) {
          feeStatusValue = "Paid";
        } else if (totals.totalPaid > 0 && totals.totalBalance > 0) {
          feeStatusValue = "Part-paid";
        }
        setFeeStatus(feeStatusValue);

        const getLocalDateString = (d: Date) =>
          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

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

        const isNewStudent = student.createdAt ? (Date.now() - new Date(student.createdAt).getTime() < 7 * 24 * 60 * 60 * 1000) : false;

        setAttendanceStats({
          present,
          total,
          percentage: attendancePercentage,
          isNew: isNewStudent && total === 0
        });

        if (assessments.length > 0) {
          const sorted = [...assessments].sort((a, b) => {
            if (b.academicYear !== a.academicYear) return b.academicYear.localeCompare(a.academicYear);

            const termA = parseInt(String(a.term).replace(/\D/g, '')) || 0;
            const termB = parseInt(String(b.term).replace(/\D/g, '')) || 0;
            return termB - termA;
          });

          setLatestExam(sorted[0]);
          setRecentAssessments(sorted.slice(0, 5));
        } else {
          setLatestExam(null);
          setRecentAssessments([]);
        }

        if (remarks.length > 0) {
          let matchedRemark = remarks.find(
            r => r.academicYear === currentYear && r.term === currentTermLabel
          );

          if (!matchedRemark) {
            const sortedRemarks = [...remarks].sort((a, b) => {
              if (b.academicYear !== a.academicYear) return b.academicYear.localeCompare(a.academicYear);
              const termA = parseInt(String(a.term).replace(/\D/g, '')) || 0;
              const termB = parseInt(String(b.term).replace(/\D/g, '')) || 0;
              return termB - termA;
            });
            matchedRemark = sortedRemarks[0];
          }

          setLatestRemark(matchedRemark);
        } else {
          setLatestRemark(null);
        }

        const remaining = daysRemaining(config.termEndDate);
        setTermInfo({
          currentTerm: currentTermLabel,
          academicYear: currentYear,
          termEndDate: config.termEndDate || "",
          daysRemaining: remaining,
        });

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

  const absentDays = attendanceStats.total > 0 ? Math.max(0, attendanceStats.total - attendanceStats.present) : 0;
  const feeStatusStyles = {
    Paid: "bg-emerald-100 text-emerald-700 border-emerald-200",
    "Part-paid": "bg-amber-100 text-amber-700 border-amber-200",
    Outstanding: "bg-rose-100 text-rose-700 border-rose-200",
    Loading: "bg-slate-100 text-slate-600 border-slate-200",
  } as const;

  const attendanceColor = attendanceStats.percentage >= 80
    ? "from-emerald-500 to-teal-600"
    : attendanceStats.percentage >= 50
      ? "from-amber-500 to-orange-500"
      : "from-rose-500 to-pink-600";

  const scoreColor = latestExam
    ? (() => {
        const score = latestExam.total || (latestExam.testScore + latestExam.homeworkScore + latestExam.projectScore + latestExam.examScore);
        return score >= 80
          ? "text-emerald-700 bg-emerald-100"
          : score >= 50
            ? "text-amber-700 bg-amber-100"
            : "text-rose-700 bg-rose-100";
      })()
    : "text-slate-500 bg-slate-100";

  return (
    <div className="space-y-6 overflow-y-auto pr-2 pb-10">
      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 px-6 py-6 text-white shadow-xl">
        <div className="relative z-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-300">Parent Dashboard</p>
          <h2 className="mt-1 text-2xl font-bold">Overview for {student.name}</h2>
          <p className="mt-1 text-sm text-slate-300">
            Track progress, attendance, and academic performance in one place.
          </p>
        </div>
        <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-white/5 blur-3xl" />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Fees Card */}
        <div className="group relative overflow-hidden rounded-3xl border border-orange-100 bg-white p-5 shadow-sm transition hover:shadow-md">
          <div className="absolute inset-0 bg-gradient-to-br from-orange-50/60 to-transparent" />
          <div className="relative">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-100 text-orange-600 shadow-sm">
                  <CreditCard size={18} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-orange-700">Due Fees</p>
                  <p className="text-[10px] text-orange-500/80">Current term</p>
                </div>
              </div>
              {feeStatus !== "Loading" && (
                <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold ${feeStatusStyles[feeStatus]}`}>
                  {feeStatus === "Paid" && <CheckCircle2 size={12} className="mr-1" />}
                  {feeStatus}
                </span>
              )}
            </div>
            <p className="mt-4 text-3xl font-bold text-orange-900">
              {dueFees > 0 ? formatCurrency(dueFees) : hasLedgers ? "GHS 0.00" : "—"}
            </p>
            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-orange-600">
                {dueFees > 0
                  ? "Outstanding balance"
                  : hasLedgers
                    ? "Fully paid"
                    : "Setting up account balance..."}
              </p>
              {lastPaymentDate && (
                <span className="flex items-center gap-1 text-[10px] text-orange-500">
                  <Clock size={10} />
                  Paid on {lastPaymentDate}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Attendance Card */}
        <div className="group relative overflow-hidden rounded-3xl border border-purple-100 bg-white p-5 shadow-sm transition hover:shadow-md">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-50/60 to-transparent" />
          <div className="relative">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-purple-100 text-purple-600 shadow-sm">
                  <Activity size={18} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-purple-700">Attendance</p>
                  <p className="text-[10px] text-purple-500/80">This term</p>
                </div>
              </div>
              {attendanceStats.total > 0 && (
                <div className={`flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br ${attendanceColor} text-white shadow-md`}>
                  <TrendingUp size={18} />
                </div>
              )}
            </div>
            <p className="mt-4 text-3xl font-bold text-purple-900">
              {attendanceStats.total > 0 ? `${attendanceStats.percentage}%` : "—"}
            </p>
            <p className="mt-1 text-xs text-purple-600">
              {attendanceStats.total > 0
                ? `Present ${attendanceStats.present} of ${attendanceStats.total} days`
                : (attendanceStats as any).isNew ? "Attendance tracking starting soon" : "No attendance records yet"}
            </p>
            {attendanceStats.total > 0 && (
              <p className="mt-1 text-[10px] text-purple-500">
                Absent {absentDays} {absentDays === 1 ? "day" : "days"}
              </p>
            )}
          </div>
        </div>

        {/* Latest Exam Card */}
        <div className="group relative overflow-hidden rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm transition hover:shadow-md">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/60 to-transparent" />
          <div className="relative">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 shadow-sm">
                <BookOpen size={18} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Latest Exam</p>
                <p className="text-[10px] text-emerald-500/80">Most recent result</p>
              </div>
            </div>
            <p className="mt-4 text-3xl font-bold text-emerald-900">
              {latestExam ? `${latestExam.total || (latestExam.testScore + latestExam.homeworkScore + latestExam.projectScore + latestExam.examScore)}/100` : "—"}
            </p>
            <p className="mt-1 text-xs text-emerald-600 truncate">
              {latestExam ? `${latestExam.subject} · Term ${latestExam.term}` : "No exams recorded this term"}
            </p>
          </div>
        </div>
      </div>

      {/* Current Term */}
      {termInfo && (
        <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="absolute inset-0 bg-gradient-to-r from-slate-50 to-transparent" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                <CalendarDays size={16} />
              </div>
              <h3 className="font-bold text-slate-800">Current Term</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-2xl border border-slate-100 bg-white p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Term</p>
                <p className="mt-1 text-sm font-bold text-slate-900">{termInfo.currentTerm}</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Academic Year</p>
                <p className="mt-1 text-sm font-bold text-slate-900">{termInfo.academicYear}</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Term Ends</p>
                <p className="mt-1 text-sm font-bold text-slate-900">
                  {termInfo.termEndDate ? new Date(termInfo.termEndDate).toLocaleDateString() : "—"}
                </p>
                {termInfo.daysRemaining !== null && (
                  <p className="mt-1 text-[10px] text-slate-500">
                    {termInfo.daysRemaining > 0
                      ? `${termInfo.daysRemaining} day${termInfo.daysRemaining === 1 ? "" : "s"} remaining`
                      : termInfo.daysRemaining === 0
                        ? "Ends today"
                        : "Term ended"}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recent Results + Remarks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Recent Remarks */}
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
              <MessageSquare size={16} />
            </div>
            <h3 className="font-bold text-slate-800">Recent Remarks</h3>
          </div>
          <div className="space-y-3">
            {latestRemark ? (
              <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                <p className="text-sm text-slate-700 italic leading-relaxed">"{latestRemark.remark}"</p>
                <div className="mt-3 flex items-center justify-between">
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold ${
                    latestRemark.behaviorTag === "Excellent" ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
                    latestRemark.behaviorTag === "Good" ? "bg-blue-100 text-blue-700 border-blue-200" :
                    latestRemark.behaviorTag === "Needs Improvement" ? "bg-amber-100 text-amber-700 border-amber-200" :
                    "bg-slate-100 text-slate-600 border-slate-200"
                  }`}>
                    {latestRemark.behaviorTag || "Remark"}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {new Date(latestRemark.dateCreated).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center text-slate-500 text-sm">
                <MessageSquare size={24} className="mb-2 text-slate-300" />
                No recent remarks available for this term.
              </div>
            )}
          </div>
        </div>

        {/* Recent Results */}
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-100 text-purple-600">
                <FileText size={16} />
              </div>
              <h3 className="font-bold text-slate-800">Recent Results</h3>
            </div>
            <a
              href={`/parent?view=report`}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#1160A8] hover:text-[#0B4A82]"
            >
              View all results <ArrowRight size={12} />
            </a>
          </div>
          <div className="space-y-2">
            {recentAssessments.length > 0 ? (
              recentAssessments.map((item) => {
                const score = item.total || (item.testScore + item.homeworkScore + item.projectScore + item.examScore);
                const scoreColorCls = score >= 80
                  ? "bg-emerald-100 text-emerald-700"
                  : score >= 50
                    ? "bg-amber-100 text-amber-700"
                    : "bg-rose-100 text-rose-700";
                return (
                  <div key={item.id} className="flex items-center justify-between rounded-xl border border-slate-100 p-3 transition hover:border-purple-200 hover:bg-purple-50/40">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{item.subject}</p>
                      <p className="text-[11px] text-slate-500">Term {item.term} · {item.academicYear}</p>
                    </div>
                    <span className={`ml-3 rounded-full px-2.5 py-1 text-xs font-bold ${scoreColorCls}`}>
                      {score}%
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center text-slate-500 text-sm">
                <FileText size={24} className="mb-2 text-slate-300" />
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
