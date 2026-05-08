import React, { useState, useEffect, useMemo } from "react";
import { db } from "../../services/mockDb";
import { Assessment, StudentRemark, Student, ComputedGrade } from "../../types";
import { calculateGrade, calculateTotalScore, getGradeColor } from "../../constants";
import { FileText, Download, TrendingUp, AlertCircle, MessageSquare, Loader2 } from "lucide-react";
import { useSchool } from "../../context/SchoolContext";
// @ts-ignore
import html2pdf from "html2pdf.js";

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
}

const ReportCardView: React.FC<ReportCardViewProps> = ({ student, onClose }) => {
  const { school } = useSchool();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [remarks, setRemarks] = useState<StudentRemark[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTerm, setSelectedTerm] = useState<string>("all");
  const [academicYear] = useState("2024/2025"); // TODO: Make dynamic
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    async function fetchReportData() {
      if (!student.schoolId || !student.id) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // Fetch assessments for the student
        const assessmentData = await db.getStudentAssessmentsByStudent(
          student.schoolId,
          student.id,
        );
        setAssessments(assessmentData);

        // Fetch remarks for the student
        const remarksData = await db.getStudentRemarks(student.schoolId, student.id);
        setRemarks(remarksData);

      } catch (error) {
        console.error("Error fetching report card data:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchReportData();
  }, [student.schoolId, student.id, academicYear]);

  const termReports = useMemo((): TermReport[] => {
    const grouped: { [key: string]: Assessment[] } = {};

    assessments.forEach(assessment => {
      const termStr = assessment.term.toString();
      const key = `${termStr}-${assessment.academicYear}`;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(assessment);
    });

    return Object.entries(grouped).map(([key, assessments]) => {
      const first = assessments[0];
      const termNum = parseInt(first.term.toString()) as TermType;
      return {
        term: termNum,
        academicYear: first.academicYear,
        assessments,
        remark: remarks.find(r =>
          r.term === first.term &&
          r.academicYear === first.academicYear
        ),
      };
    }).sort((a, b) => {
      // Sort by term
      return a.term - b.term;
    });
  }, [assessments, remarks]);

  const filteredReports = useMemo(() => {
    if (selectedTerm === "all") return termReports;
    const termNum = parseInt(selectedTerm) as TermType;
    return termReports.filter(r => r.term === termNum);
  }, [termReports, selectedTerm]);

  const getAssessmentSummary = (termAssessments: Assessment[]) => {
    const subjectMap: { [key: string]: Assessment[] } = {};

    termAssessments.forEach(a => {
      if (!subjectMap[a.subject]) {
        subjectMap[a.subject] = [];
      }
      subjectMap[a.subject].push(a);
    });

    return Object.entries(subjectMap).map(([subject, assessments]) => {
      const total = assessments.reduce((sum, a) => sum + calculateTotalScore(a), 0);
      const average = total / assessments.length;
      const grade = calculateGrade(average);
      return { subject, assessments, total, average, grade };
    });
  };

  const overallStats = useMemo(() => {
    let totalScore = 0;
    let totalSubjects = 0;
    let gradeCount: { [key: string]: number } = {};

    filteredReports.forEach(report => {
      const summary = getAssessmentSummary(report.assessments);
      summary.forEach(s => {
        totalScore += s.average;
        totalSubjects++;
        gradeCount[s.grade.grade] = (gradeCount[s.grade.grade] || 0) + 1;
      });
    });

    const average = totalSubjects > 0 ? totalScore / totalSubjects : 0;
    const overallGrade = calculateGrade(average);

    return { totalSubjects, average, overallGrade, gradeCount };
  }, [filteredReports]);

  const handleDownload = async () => {
    try {
      setIsDownloading(true);
      
      const element = document.getElementById('printable-report-card');
      if (!element) return;
      
      const opt = {
        margin: 0.5,
        filename: `${student.name.replace(/\s+/g, '_')}_Report_Card.pdf`,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' as const }
      };
      
      await html2pdf().set(opt).from(element).save();
    } catch (error) {
      console.error("Error downloading report card:", error);
    } finally {
      setIsDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className={onClose ? "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" : "flex items-center justify-center p-12 bg-white rounded-2xl border border-slate-200"}>
        <div className={onClose ? "bg-white rounded-2xl max-w-4xl w-full p-8" : ""}>
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={onClose ? "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" : "h-full flex flex-col"}>
      <div className={onClose ? "bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" : "bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col flex-1"}>
        {/* Header */}
        {onClose && (
          <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
            <div>
              <h2 className="text-xl font-bold text-slate-800">Report Cards</h2>
              <p className="text-sm text-slate-500">{student.name} - {student.classId}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Hidden Printable PDF Template */}
        <div style={{ position: 'absolute', top: '-9999px', left: '-9999px' }}>
          <div id="printable-report-card" className="bg-white text-black p-10" style={{ width: '800px' }}>
            {/* Header */}
            <div className="flex justify-between items-center border-b-4 border-blue-900 pb-6 mb-8">
              <div className="flex items-center gap-4">
                {school?.logoUrl && <img src={school.logoUrl} alt="Logo" className="w-20 h-20 object-contain" crossOrigin="anonymous" />}
                <div>
                  <h1 className="text-3xl font-bold uppercase text-blue-900 tracking-wider">{school?.name || "School Name"}</h1>
                  <p className="text-gray-600 font-medium mt-1">{school?.address || "School Address"}</p>
                  <p className="text-gray-600 font-medium">{school?.phone || "Contact Number"}</p>
                </div>
              </div>
              <div className="text-right">
                <h2 className="text-3xl font-black text-gray-800 uppercase tracking-widest">REPORT CARD</h2>
                <p className="text-gray-500 font-medium mt-2">Term: {selectedTerm === "all" ? "Cumulative" : selectedTerm}</p>
                <p className="text-gray-500 font-medium">Academic Year: {academicYear}</p>
              </div>
            </div>

            {/* Student Info */}
            <div className="bg-gray-50 rounded-lg p-6 mb-8 border border-gray-200">
              <h3 className="font-bold text-gray-800 mb-4 border-b border-gray-200 pb-2 uppercase tracking-wide">Student Details</h3>
              <div className="grid grid-cols-2 gap-y-3 text-sm">
                <div className="flex"><span className="w-24 text-gray-500 font-medium">Name:</span> <span className="font-bold text-gray-900">{student.name}</span></div>
                <div className="flex"><span className="w-24 text-gray-500 font-medium">Class:</span> <span className="font-bold text-gray-900">{student.classId}</span></div>
                <div className="flex"><span className="w-24 text-gray-500 font-medium">DOB:</span> <span className="font-bold text-gray-900">{student.dob ? new Date(student.dob).toLocaleDateString() : 'N/A'}</span></div>
                <div className="flex"><span className="w-24 text-gray-500 font-medium">Gender:</span> <span className="font-bold text-gray-900">{student.gender}</span></div>
              </div>
            </div>

            {/* Academic Summary */}
            <div className="flex gap-6 mb-8">
              <div className="flex-1 bg-blue-50 p-6 rounded-lg border border-blue-100 text-center">
                <p className="text-blue-600 font-semibold mb-1 uppercase tracking-wide text-xs">Overall Average</p>
                <p className="text-3xl font-black text-blue-900">{overallStats.average.toFixed(1)}%</p>
              </div>
              <div className="flex-1 bg-green-50 p-6 rounded-lg border border-green-100 text-center">
                <p className="text-green-600 font-semibold mb-1 uppercase tracking-wide text-xs">Overall Grade</p>
                <p className="text-3xl font-black text-green-900">{overallStats.overallGrade.grade}</p>
                <p className="text-sm text-green-700 font-medium mt-1">{overallStats.overallGrade.remark}</p>
              </div>
              <div className="flex-1 bg-slate-50 p-6 rounded-lg border border-slate-200 text-center">
                <p className="text-slate-600 font-semibold mb-1 uppercase tracking-wide text-xs">Total Subjects</p>
                <p className="text-3xl font-black text-slate-900">{overallStats.totalSubjects}</p>
              </div>
            </div>

            {/* Subject Breakdown */}
            <div className="mb-8">
              <h3 className="font-bold text-gray-800 mb-4 border-b border-gray-200 pb-2 uppercase tracking-wide">Academic Performance</h3>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-100 text-gray-700 text-sm">
                    <th className="py-3 px-4 border border-gray-200 font-semibold">Subject</th>
                    <th className="py-3 px-4 border border-gray-200 font-semibold text-center">Class Score</th>
                    <th className="py-3 px-4 border border-gray-200 font-semibold text-center">Exam Score</th>
                    <th className="py-3 px-4 border border-gray-200 font-semibold text-center">Total Score</th>
                    <th className="py-3 px-4 border border-gray-200 font-semibold text-center">Grade</th>
                    <th className="py-3 px-4 border border-gray-200 font-semibold text-right">Remark</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {filteredReports.map((report, idx) => {
                    const summary = getAssessmentSummary(report.assessments);
                    return summary.map((s, sIdx) => {
                      return (
                        <tr key={`${idx}-${sIdx}`} className="border-b border-gray-200">
                          <td className="py-3 px-4 text-gray-800 font-medium">{s.subject} <span className="text-xs text-gray-500">(Term {report.term})</span></td>
                          <td className="py-3 px-4 text-center text-gray-600">{s.assessments.reduce((sum, a) => sum + (a.testScore || 0) + (a.homeworkScore || 0) + (a.projectScore || 0), 0)}</td>
                          <td className="py-3 px-4 text-center text-gray-600">{s.assessments.reduce((sum, a) => sum + (a.examScore || 0), 0)}</td>
                          <td className="py-3 px-4 text-center font-bold text-gray-900">{s.average.toFixed(1)}%</td>
                          <td className={`py-3 px-4 text-center font-bold text-slate-800`}>{s.grade.grade}</td>
                          <td className="py-3 px-4 text-right text-gray-600 italic">{s.grade.remark}</td>
                        </tr>
                      );
                    });
                  })}
                </tbody>
              </table>
            </div>

            {/* Remarks Section */}
            {remarks.length > 0 && (
              <div className="mb-8">
                <h3 className="font-bold text-gray-800 mb-4 border-b border-gray-200 pb-2 uppercase tracking-wide">Teacher Remarks</h3>
                <div className="space-y-4">
                  {remarks.map((remark, idx) => (
                    <div key={idx} className="bg-gray-50 p-4 rounded border border-gray-200">
                      <p className="text-sm text-gray-800 italic">"{remark.remark}"</p>
                      <div className="mt-2 flex justify-between text-xs text-gray-500 font-medium">
                        <span>Teacher: {remark.teacherId}</span>
                        <span>Date: {new Date(remark.dateCreated).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Footer */}
            <div className="mt-16 text-center text-gray-500 text-xs border-t border-gray-200 pt-8">
              <p>This is an officially generated document from {school?.name || "School Manager GH"}.</p>
              <p>For any questions or discrepancies, please contact the administration.</p>
            </div>
          </div>
        </div>

        <div id="report-card-content" className="p-6 space-y-6">
          {/* Overall Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp size={18} className="text-blue-600" />
                <span className="text-sm text-blue-700 font-medium">Overall Average</span>
              </div>
              <p className="text-2xl font-bold text-blue-800">
                {overallStats.average.toFixed(1)}%
              </p>
            </div>
            <div className={`rounded-xl p-4 border ${getGradeColor(overallStats.overallGrade.grade)}`}>
              <div className="flex items-center gap-2 mb-2">
                <FileText size={18} />
                <span className="text-sm font-medium">Overall Grade</span>
              </div>
              <p className="text-2xl font-bold">
                {overallStats.overallGrade.grade} - {overallStats.overallGrade.remark}
              </p>
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
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600">Filter by term:</span>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedTerm("all")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedTerm === "all"
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                All Terms
              </button>
              {["1", "2", "3"].map(term => (
                <button
                  key={term}
                  onClick={() => setSelectedTerm(term)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedTerm === term
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  Term {term}
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
                    {/* Term Header */}
                    <div className="bg-slate-50 px-5 py-4 border-b border-slate-200">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-bold text-slate-800">
                            Term {report.term} - {report.academicYear}
                          </h3>
                          <p className="text-sm text-slate-500">
                            {report.assessments.length} assessment(s)
                          </p>
                        </div>
                        <div className={`px-4 py-2 rounded-lg font-bold ${getGradeColor(termGrade.grade)}`}>
                          Average: {termGrade.grade} ({termAverage.toFixed(1)}%)
                        </div>
                      </div>
                    </div>

                    {/* Subject Scores */}
                    <div className="p-5">
                      <table className="w-full">
                        <thead>
                          <tr className="text-left text-sm text-slate-600 border-b border-slate-200">
                            <th className="pb-3">Subject</th>
                            <th className="pb-3 text-right">Test</th>
                            <th className="pb-3 text-right">Homework</th>
                            <th className="pb-3 text-right">Project</th>
                            <th className="pb-3 text-right">Exam</th>
                            <th className="pb-3 text-right">Total</th>
                            <th className="pb-3 text-right">Grade</th>
                          </tr>
                        </thead>
                        <tbody>
                          {summary.map((s, idx) => (
                            <tr key={idx} className="border-b border-slate-100 last:border-0">
                              <td className="py-3 font-medium text-slate-800">{s.subject}</td>
                              <td className="py-3 text-right text-slate-600">
                                {s.assessments.reduce((sum, a) => sum + (a.testScore || 0), 0)}
                              </td>
                              <td className="py-3 text-right text-slate-600">
                                {s.assessments.reduce((sum, a) => sum + (a.homeworkScore || 0), 0)}
                              </td>
                              <td className="py-3 text-right text-slate-600">
                                {s.assessments.reduce((sum, a) => sum + (a.projectScore || 0), 0)}
                              </td>
                              <td className="py-3 text-right text-slate-600">
                                {s.assessments.reduce((sum, a) => sum + (a.examScore || 0), 0)}
                              </td>
                              <td className="py-3 text-right font-bold text-slate-800">
                                {s.average.toFixed(1)}
                              </td>
                              <td className="py-3 text-right">
                                <span className={`px-2 py-1 rounded text-xs font-bold ${getGradeColor(s.grade.grade)}`}>
                                  {s.grade.grade}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Teacher Remark */}
                    {report.remark && (
                      <div className="px-5 py-4 bg-slate-50 border-t border-slate-200">
                        <div className="flex items-start gap-3">
                          <MessageSquare size={20} className="text-blue-600 mt-1" />
                          <div>
                            <p className="text-sm font-medium text-slate-700 mb-1">
                              Teacher's Remark - Term {report.remark.term}
                            </p>
                            <p className="text-slate-600">{report.remark.remark}</p>
                            {report.remark.behaviorTag && (
                              <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-medium ${
                                report.remark.behaviorTag === "Excellent" ? "bg-green-100 text-green-700" :
                                report.remark.behaviorTag === "Good" ? "bg-blue-100 text-blue-700" :
                                "bg-yellow-100 text-yellow-700"
                              }`}>
                                {report.remark.behaviorTag}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Download Button */}
          <div className="flex justify-center mt-8">
            <button 
              onClick={handleDownload}
              disabled={isDownloading}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg transition-colors font-medium ${
                isDownloading ? "bg-blue-100 text-blue-600 cursor-not-allowed" : "bg-slate-100 hover:bg-slate-200 text-slate-700"
              }`}
            >
              {isDownloading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Generating PDF...
                </>
              ) : (
                <>
                  <Download size={18} />
                  Download Full Report Card
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportCardView;
