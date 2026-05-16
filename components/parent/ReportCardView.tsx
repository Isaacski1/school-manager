import React, { useState, useEffect, useMemo, useRef } from "react";
import { db } from "../../services/mockDb";
import { Assessment, StudentRemark, Student, AdminRemark, StudentSkills, SchoolConfig } from "../../types";
import { calculateGrade, calculateTotalScore, getGradeColor, CLASSES_LIST } from "../../constants";
import { FileText, Download, TrendingUp, MessageSquare, Loader2 } from "lucide-react";
import { useSchool } from "../../context/SchoolContext";
import ReportCardLayout from "../ReportCardLayout";
import {
  collectHolidayDateKeys,
  getExpectedSchoolDayKeys,
} from "../../services/schoolCalendar";

interface ReportCardViewProps {
  student: Student;
  onClose?: () => void;
}

type TermType = 1 | 2 | 3;

interface TermReport {
  term: TermType;
  academicYear: string;
  assessments: Assessment[];
  remark?: StudentRemark;
  adminRemark?: AdminRemark;
  skills?: StudentSkills;
}

const ReportCardView: React.FC<ReportCardViewProps> = ({ student, onClose }) => {
  const { school } = useSchool();
  const hiddenContainerRef = useRef<HTMLDivElement | null>(null);
  const userSelectedTermRef = useRef(false);

  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [remarks, setRemarks] = useState<StudentRemark[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTerm, setSelectedTerm] = useState<string>(() => {
    return "1";
  });

  useEffect(() => {
    localStorage.setItem("parent_report_selected_term", selectedTerm);
  }, [selectedTerm]);

  const [academicYear, setAcademicYear] = useState("2023-2024");
  const [isDownloading, setIsDownloading] = useState(false);
  const [adminRemarks, setAdminRemarks] = useState<AdminRemark[]>([]);
  const [studentSkills, setStudentSkills] = useState<StudentSkills[]>([]);
  const [rankInfo, setRankInfo] = useState<{ rank: number; totalStudents: number } | null>(null);
  const [schoolConfig, setSchoolConfig] = useState<SchoolConfig | null>(null);
  const [printData, setPrintData] = useState<any>(null);

  // Separate data fetching from printData building
  useEffect(() => {
    async function fetchAllData() {
      if (!student.schoolId || !student.id) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const config = await db.getSchoolConfig(student.schoolId);
        setSchoolConfig(config);
        setAcademicYear(config.academicYear || "2023-2024");
        if (!userSelectedTermRef.current) {
          const configuredTerm = config.currentTerm?.split(" ")[1] || "1";
          setSelectedTerm(["1", "2", "3"].includes(configuredTerm) ? configuredTerm : "1");
        }

        const [assessmentData, remarksData, adminRemarksData, skillsData] = await Promise.all([
          db.getStudentAssessmentsByStudent(student.schoolId, student.id),
          db.getStudentRemarksByStudent(student.schoolId, student.id),
          db.getAdminRemarks(student.schoolId, student.id),
          db.getStudentSkillsByStudent(student.schoolId, student.id),
        ]);

        setAssessments(assessmentData);
        setRemarks(remarksData);
        setAdminRemarks(adminRemarksData);
        setStudentSkills(skillsData);
      } catch (error) {
        console.error("Error fetching report data:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchAllData();
  }, [student.schoolId, student.id]);

  // Effect to rebuild printData when data or selectedTerm changes
  useEffect(() => {
    async function buildPrintData() {
      if (!student.id) return;

      try {
        // Fetch fresh config snapshot
        const config = await db.getSchoolConfig(student.schoolId);
        const activeConfig = config || schoolConfig;
        if (!activeConfig) return;

        // Determine which term to print
        let activeTermNum: TermType;
        let activeYear = academicYear;

        if (selectedTerm === "all") {
          // Default to latest term that has assessments
          if (assessments.length > 0) {
            const latest = assessments.reduce((prev, curr) => (curr.term > prev.term ? curr : prev));
            activeTermNum = latest.term;
            activeYear = latest.academicYear;
          } else {
            activeTermNum = parseInt(activeConfig.currentTerm?.split(" ")[1] || "1") as TermType;
          }
        } else {
          activeTermNum = parseInt(selectedTerm) as TermType;
        }

        // 1. Fetch Class Data for Rank (if needed)
        let classStudents: Student[] = [];
        let allAssessmentsInClass: Assessment[] = [];
        if (student.classId) {
          [classStudents, allAssessmentsInClass] = await Promise.all([
            db.getStudents(student.schoolId, student.classId),
            db.getAllAssessments(student.schoolId),
          ]);
        }

        // 2. Rank calculation for the active term
        const studentScores = classStudents.map(s => {
          const sAssessments = allAssessmentsInClass.filter(a =>
            a.studentId === s.id &&
            a.classId === student.classId &&
            String(a.term) === String(activeTermNum) &&
            String(a.academicYear) === String(activeYear)
          );
          const subjectTotals: { [subject: string]: number } = {};
          sAssessments.forEach(a => {
            const total = (a.testScore || 0) + (a.homeworkScore || 0) + (a.projectScore || 0) + (a.examScore || 0);
            if (!subjectTotals[a.subject] || total > subjectTotals[a.subject]) {
              subjectTotals[a.subject] = total;
            }
          });
          const totalScore = Object.values(subjectTotals).reduce((sum, score) => sum + score, 0);
          return { studentId: s.id, totalScore };
        }).sort((a, b) => b.totalScore - a.totalScore);

        const studentRank = studentScores.findIndex(s => s.studentId === student.id) + 1;

        // 3. Performance Data (Assessments)
        const termAssessmentsRaw = assessments.filter(
          a => String(a.term) === String(activeTermNum) && String(a.academicYear) === String(activeYear)
        );
        const termAssessments = Object.values(
          termAssessmentsRaw.reduce((acc, a) => {
            if (!a.subject) return acc;
            const existing = acc[a.subject];
            const total = (a.testScore || 0) + (a.homeworkScore || 0) + (a.projectScore || 0) + (a.examScore || 0);
            if (!existing || total >= (existing.total || 0)) acc[a.subject] = a;
            return acc;
          }, {} as Record<string, Assessment>)
        );

        // 4. Attendance Data
        let attendanceData = { totalDays: 0, presentDays: 0, absentDays: 0, attendancePercentage: 0 };
        try {
          const classAttendance = await db.getClassAttendance(student.schoolId, student.classId || "");
          const holidayKeys = collectHolidayDateKeys([
            ...classAttendance.filter(r => r.isHoliday).map(r => r.date),
            ...(activeConfig.holidayDates || []),
          ]);
          
          // For attendance end date: if it's the current term, use today. 
          // If it's a past term, we should ideally use the term's end date.
          const isCurrentTerm = String(activeTermNum) === String(activeConfig.currentTerm?.split(" ")[1]);
          const termEndDate = isCurrentTerm ? new Date() : (activeConfig.termEndDate ? new Date(activeConfig.termEndDate) : new Date());
          termEndDate.setHours(23, 59, 59, 999);

          const expectedDays = getExpectedSchoolDayKeys({
            reopenDate: activeConfig.schoolReopenDate,
            endDate: termEndDate,
            holidayDates: Array.from(holidayKeys),
            vacationDate: activeConfig.vacationDate,
            nextTermBegins: activeConfig.nextTermBegins,
          });
          
          const expectedSet = new Set(expectedDays);
          let presentCount = 0;
          classAttendance.forEach(record => {
            if (expectedSet.has(record.date) && record.presentStudentIds?.includes(student.id)) {
              presentCount++;
            }
          });

          const total = expectedDays.length;
          attendanceData = {
            totalDays: total,
            presentDays: presentCount,
            absentDays: Math.max(0, total - presentCount),
            attendancePercentage: total > 0 ? Math.round((presentCount / total) * 100) : 0,
          };
        } catch (e) {
          console.warn("Attendance calculation failed for print data:", e);
        }

        const termTotal = termAssessments.reduce((sum, a) => sum + (calculateTotalScore(a) || 0), 0);
        const termAvg = termAssessments.length > 0 ? termTotal / termAssessments.length : 0;
        const overallGrade = calculateGrade(termAvg, activeConfig.gradingScale);

        const termRemark = remarks.find(r => String(r.term) === String(activeTermNum));
        const adminRemark = adminRemarks.find(r => String(r.term) === String(activeTermNum));
        const skills = studentSkills.find(s => String((s as any).term) === String(activeTermNum) || !(s as any).term);

        const className = CLASSES_LIST.find(c => c.id === student.classId)?.name || student.classId || "";
        const logoUrl = activeConfig.logoUrl || (school as any)?.logoUrl || "";

        // Promotion logic — mirrors the admin dashboard's PASS_THRESHOLD (500 total score)
        const PASS_THRESHOLD = 500;
        const currentClassIndex = CLASSES_LIST.findIndex(c => c.id === student.classId);
        const nextClass =
          currentClassIndex > -1 && currentClassIndex < CLASSES_LIST.length - 1
            ? CLASSES_LIST[currentClassIndex + 1].name
            : "";
        const isPromotionalTerm = activeConfig.isPromotionalTerm ?? true;
        const promotionStatus = isPromotionalTerm
          ? termTotal >= PASS_THRESHOLD
            ? nextClass
              ? `Promoted to ${nextClass}`
              : "Promoted"
            : "Fail"
          : "N/A";

        setPrintData({
          schoolInfo: {
            name: school?.name || activeConfig.schoolName || "School",
            logoUrl,
            address: school?.address || activeConfig.address || "",
            phone: school?.phone || activeConfig.phone || "",
            email: activeConfig.email || "",
            academicYear: activeYear,
            term: `Term ${activeTermNum}`,
          },
          studentInfo: {
            name: student.name,
            gender: student.gender || "",
            dob: student.dob || "",
            class: className,
            classTeacher: "N/A",
          },
          attendance: attendanceData,
          performance: termAssessments,
          positionRule: activeConfig.positionRule || "subject",
          gradingScale: activeConfig.gradingScale,
          summary: {
            totalScore: termTotal,
            averageScore: termAvg.toFixed(1),
            overallGrade: overallGrade.grade,
            classPosition: studentRank > 0 ? `${studentRank}${["st", "nd", "rd"][studentRank - 1] || "th"}` : "N/A",
            totalStudents: classStudents.length,
          },
          skills: {
            punctuality: skills?.punctuality || "N/A",
            neatness: skills?.neatness || "N/A",
            conduct: skills?.conduct || "N/A",
            attitudeToWork: skills?.attitudeToWork || "N/A",
            classParticipation: skills?.classParticipation || "N/A",
            homeworkCompletion: skills?.homeworkCompletion || "N/A",
          },
          remarks: {
            teacher: termRemark?.remark || "N/A",
            headTeacher: adminRemark?.remark || activeConfig.headTeacherRemark || "An outstanding performance.",
            adminRemark: adminRemark?.remark || "",
            adminRemarkDate: adminRemark?.dateCreated || "",
          },
          promotion: { status: promotionStatus, isPromotionalTerm },
          termDates: {
            endDate: activeConfig.termEndDate || "",
            reopeningDate: activeConfig.nextTermBegins || "",
            vacationDate: activeConfig.vacationDate || "",
          },
          allStudentsAssessments: allAssessmentsInClass.filter(
            a => String(a.term) === String(activeTermNum) && String(a.academicYear) === String(activeYear)
          ),
        });
      } catch (err) {
        console.error("Error building print data:", err);
      }
    }

    if (!loading) {
      buildPrintData();
    }
  }, [student.id, schoolConfig, assessments, remarks, adminRemarks, studentSkills, selectedTerm, loading]);

  const termReports = useMemo((): TermReport[] => {
    const grouped: { [key: string]: Assessment[] } = {};
    assessments.forEach(assessment => {
      const key = `${assessment.term}-${assessment.academicYear}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(assessment);
    });
    return Object.entries(grouped).map(([, termAssessments]) => {
      const first = termAssessments[0];
      const termNum = parseInt(first.term.toString()) as TermType;
      return {
        term: termNum,
        academicYear: first.academicYear,
        assessments: termAssessments,
        remark: remarks.find(r => r.term === termNum && r.academicYear === first.academicYear),
        adminRemark: adminRemarks.find(r => r.term === termNum && r.academicYear === first.academicYear),
        skills: studentSkills.find(s => (s as any).term === termNum && (s as any).academicYear === first.academicYear),
      };
    }).sort((a, b) => a.term - b.term);
  }, [assessments, remarks, adminRemarks, studentSkills]);

  const filteredReports = useMemo(() => {
    if (selectedTerm === "all") return termReports;
    const termNum = parseInt(selectedTerm) as TermType;
    return termReports.filter(r => r.term === termNum);
  }, [termReports, selectedTerm]);

  const handleTermChange = (term: string) => {
    userSelectedTermRef.current = true;
    setSelectedTerm(term);
  };

  const getAssessmentSummary = (termAssessments: Assessment[]) => {
    const subjectMap: { [key: string]: Assessment[] } = {};
    termAssessments.forEach(a => {
      if (!subjectMap[a.subject]) subjectMap[a.subject] = [];
      subjectMap[a.subject].push(a);
    });
    return Object.entries(subjectMap).map(([subject, assessments]) => {
      const best = assessments.reduce((prev, curr) =>
        calculateTotalScore(curr) > calculateTotalScore(prev) ? curr : prev
      );
      const score = calculateTotalScore(best);
      const grade = calculateGrade(score);
      return { subject, assessments, total: score, average: score, grade, best };
    });
  };

  const overallStats = useMemo(() => {
    let totalScore = 0;
    let totalSubjects = 0;
    filteredReports.forEach(report => {
      const summary = getAssessmentSummary(report.assessments);
      summary.forEach(s => {
        totalScore += s.average;
        totalSubjects++;
      });
    });
    const average = totalSubjects > 0 ? totalScore / totalSubjects : 0;
    const overallGrade = calculateGrade(average);
    const isPromotionalTerm = schoolConfig?.isPromotionalTerm ?? true;
    const promotionStatus = isPromotionalTerm ? (average >= 50 ? "Promoted" : "Failed") : "N/A";
    return { totalSubjects, average, overallGrade, promotionStatus, isPromotionalTerm };
  }, [filteredReports, schoolConfig]);

  const handleDownload = async () => {
    const container = hiddenContainerRef.current;
    if (!container) return;
    const btn = container.querySelector("button") as HTMLButtonElement | null;
    if (btn) {
      setIsDownloading(true);
      btn.click();
      setTimeout(() => setIsDownloading(false), 8000);
    }
  };

  if (loading) {
    return (
      <div className={onClose ? "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" : "flex items-center justify-center p-12 bg-white rounded-2xl border border-slate-200"}>
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="text-slate-600">Loading report card...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={onClose ? "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" : "h-full flex flex-col"}>
      <div className={onClose
        ? "bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
        : "bg-white rounded-2xl border border-slate-200 flex flex-col flex-1 overflow-hidden"
      }>

        {/* Header */}
        {onClose && (
          <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
            <div>
              <h2 className="text-xl font-bold text-slate-800">Report Cards</h2>
              <p className="text-sm text-slate-500">{student.name}</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
              <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Scrollable Content */}
        <div className="overflow-y-auto flex-1 p-6 space-y-6">

          {/* Overall Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp size={18} className="text-blue-600" />
                <span className="text-sm text-blue-700 font-medium">Overall Average</span>
              </div>
              <p className="text-2xl font-bold text-blue-800">{overallStats.average.toFixed(1)}%</p>
            </div>
            <div className={`rounded-xl p-4 border ${getGradeColor(overallStats.overallGrade.grade)}`}>
              <div className="flex items-center gap-2 mb-2">
                <FileText size={18} />
                <span className="text-sm font-medium">Overall Grade</span>
              </div>
              <p className="text-2xl font-bold">{overallStats.overallGrade.grade} - {overallStats.overallGrade.remark}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <div className="flex items-center gap-2 mb-2">
                <FileText size={18} className="text-slate-600" />
                <span className="text-sm text-slate-700 font-medium">Subjects</span>
              </div>
              <p className="text-2xl font-bold text-slate-800">{overallStats.totalSubjects}</p>
            </div>
          </div>

          {/* Term Filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-slate-600">Filter by term:</span>
            <div className="flex gap-2 flex-wrap">
              {["all", "1", "2", "3"].map(term => (
                <button
                  key={term}
                  onClick={() => handleTermChange(term)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedTerm === term ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {term === "all" ? "All Terms" : `Term ${term}`}
                </button>
              ))}
            </div>
          </div>

          {/* Term Reports */}
          {filteredReports.length === 0 ? (
            <div className="bg-slate-50 rounded-xl p-8 text-center">
              <FileText size={48} className="text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">No report cards found for this student.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {filteredReports.map((report, index) => {
                const summary = getAssessmentSummary(report.assessments);
                const termTotal = summary.reduce((sum, s) => sum + s.average, 0);
                const termAverage = summary.length > 0 ? termTotal / summary.length : 0;
                const termGrade = calculateGrade(termAverage);

                return (
                  <div key={index} className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="bg-slate-50 px-5 py-4 border-b border-slate-200">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div>
                          <h3 className="font-bold text-slate-800">Term {report.term} - {report.academicYear}</h3>
                          <p className="text-sm text-slate-500">{summary.length} subject(s)</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className={`px-4 py-2 rounded-lg font-bold ${getGradeColor(termGrade.grade)}`}>
                            Average: {termGrade.grade} ({termAverage.toFixed(1)}%)
                          </div>
                          <button
                            onClick={() => {
                              handleTermChange(String(report.term));
                              setTimeout(handleDownload, 100);
                            }}
                            className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                            title="Download this report card"
                          >
                            <Download size={18} />
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[600px] text-sm border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider min-w-[160px]">Subject</th>
                            <th className="text-center px-3 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider w-16">
                              Test<br/><span className="text-[10px] text-emerald-600 normal-case font-bold">(15)</span>
                            </th>
                            <th className="text-center px-3 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider w-20">
                              Homework<br/><span className="text-[10px] text-emerald-600 normal-case font-bold">(15)</span>
                            </th>
                            <th className="text-center px-3 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider w-16">
                              Project<br/><span className="text-[10px] text-emerald-600 normal-case font-bold">(20)</span>
                            </th>
                            <th className="text-center px-3 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider w-16 border-l border-slate-200">
                              Exam<br/><span className="text-[10px] text-red-500 normal-case font-bold">(100)</span>
                            </th>
                            <th className="text-center px-3 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider w-16 bg-slate-100">Total</th>
                            <th className="text-center px-3 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider w-16 bg-slate-100">Grade</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {summary.map((s, idx) => {
                            const score = calculateTotalScore(s.best);
                            const gradeInfo = calculateGrade(score, schoolConfig?.gradingScale);
                            return (
                              <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                                <td className="px-4 py-3 font-medium text-slate-800">{s.subject}</td>
                                <td className="px-3 py-3 text-center text-slate-600">{s.best.testScore ?? 0}</td>
                                <td className="px-3 py-3 text-center text-slate-600">{s.best.homeworkScore ?? 0}</td>
                                <td className="px-3 py-3 text-center text-slate-600">{s.best.projectScore ?? 0}</td>
                                <td className="px-3 py-3 text-center text-slate-600 border-l border-slate-200">{s.best.examScore ?? 0}</td>
                                <td className="px-3 py-3 text-center font-bold text-slate-800 bg-slate-50">{score}</td>
                                <td className="px-3 py-3 text-center bg-slate-50">
                                  <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${getGradeColor(gradeInfo.grade)}`}>
                                    {gradeInfo.grade}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {report.remark && (
                      <div className="px-5 py-4 bg-slate-50 border-t border-slate-200">
                        <div className="flex items-start gap-3">
                          <MessageSquare size={20} className="text-blue-600 mt-1 shrink-0" />
                          <div>
                            <p className="text-sm font-medium text-slate-700 mb-1">Teacher's Remark</p>
                            <p className="text-slate-600">{report.remark.remark}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

        </div>
      </div>

      {/* Hidden ReportCardLayout for PDF generation — same as admin */}
      {printData && (
        <div ref={hiddenContainerRef} style={{ position: "fixed", top: "-9999px", left: "-9999px", width: "794px" }}>
          <ReportCardLayout data={printData} />
        </div>
      )}
    </div>
  );
};

export default ReportCardView;
