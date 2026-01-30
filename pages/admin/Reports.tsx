import React, { useState, useEffect } from "react";
import Layout from "../../components/Layout";
import { db } from "../../services/mockDb";
import { useSchool } from "../../context/SchoolContext";

import {
  CLASSES_LIST,
  CURRENT_TERM,
  ACADEMIC_YEAR,
  calculateGrade,
  getGradeColor,
  calculateTotalScore,
  nurserySubjects,
  kgSubjects,
  primarySubjects,
  jhsSubjects,
} from "../../constants";
import { Download } from "lucide-react";
import { Assessment } from "../../types";

const Reports = () => {
  const { school } = useSchool();
  const schoolId = school?.id || null;
  const [selectedClass, setSelectedClass] = useState(CLASSES_LIST[0].id);
  const [reportData, setReportData] = useState<any[]>([]);
  const [passFailData, setPassFailData] = useState<{
    pass: any[];
    fail: any[];
  }>({ pass: [], fail: [] });
  const [subjects, setSubjects] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [schoolConfig, setSchoolConfig] = useState<{
    currentTerm: string;
    academicYear: string;
    schoolReopenDate: string;
  }>({
    currentTerm: `Term ${CURRENT_TERM}`,
    academicYear: ACADEMIC_YEAR,
    schoolReopenDate: "",
  });

  useEffect(() => {
    const loadReportData = async () => {
      setLoading(true);

      if (!schoolId) {
        setReportData([]);
        setSubjects([]);
        setLoading(false);
        return;
      }

      // 1. Determine subjects for the selected class (prefer admin-configured)
      const selectedClassInfo = CLASSES_LIST.find(
        (c) => c.id === selectedClass,
      );
      let currentSubjects = await db.getSubjects(schoolId, selectedClass);
      if (!currentSubjects.length && selectedClassInfo) {
        switch (selectedClassInfo.level) {
          case "NURSERY":
            currentSubjects = nurserySubjects;
            break;
          case "KG":
            currentSubjects = kgSubjects;
            break;
          case "PRIMARY":
            currentSubjects = primarySubjects;
            break;
          case "JHS":
            currentSubjects = jhsSubjects;
            break;
          default:
            currentSubjects = [];
        }
      }
      setSubjects(currentSubjects);

      if (currentSubjects.length === 0) {
        setReportData([]);
        setLoading(false);
        return;
      }

      // 2. Fetch all other data
      const config = await db.getSchoolConfig(schoolId);
      setSchoolConfig({
        currentTerm: config.currentTerm || `Term ${CURRENT_TERM}`,
        academicYear: config.academicYear || ACADEMIC_YEAR,
        schoolReopenDate: config.schoolReopenDate || "",
      });

      let dynamicTerm = CURRENT_TERM;
      if (config.currentTerm) {
        const match = config.currentTerm.match(/\d+/);
        if (match) dynamicTerm = parseInt(match[0], 10);
      }

      const students = await db.getStudents(schoolId, selectedClass);
      const remarks = await db.getStudentRemarks(schoolId, selectedClass);

      const data = await Promise.all(
        students.map(async (student) => {
          let totalScore = 0;
          let subjectCount = 0;
          const scores: any = {};

          for (const subject of currentSubjects) {
            const assessments = await db.getAssessments(
              schoolId,
              selectedClass,
              subject,
            );
            const assessment = assessments.find(
              (a) => a.studentId === student.id && a.term === dynamicTerm,
            );

            if (assessment) {
              const currentTotal =
                assessment.total ?? calculateTotalScore(assessment);
              scores[subject] = currentTotal;
              totalScore += currentTotal;
              subjectCount++;
            } else {
              scores[subject] = "-";
            }
          }

          const average =
            subjectCount > 0 ? (totalScore / subjectCount).toFixed(1) : "0";
          const studentRemark = remarks.find(
            (r) => r.studentId === student.id && Number(r.term) === dynamicTerm,
          );

          return {
            student,
            scores,
            totalScore,
            average,
            remark: studentRemark ? studentRemark.remark : "N/A",
          };
        }),
      );

      // Sort by total score
      data.sort((a, b) => b.totalScore - a.totalScore);
      setReportData(data);

      const pass = data.filter((row) => row.totalScore >= 500);
      const fail = data.filter((row) => row.totalScore < 500);
      setPassFailData({ pass, fail });
      setLoading(false);
    };

    if (selectedClass) {
      loadReportData();
    }
  }, [selectedClass, schoolId]);

  const downloadCSV = () => {
    if (reportData.length === 0) return;

    // 1. Define Headers
    const headers = [
      "Position",
      "Student Name",
      ...subjects,
      "Total Score",
      "Average Grade",
      "Remark",
    ];

    // 2. Format Rows
    const rows = reportData.map((row, index) => {
      const subjectScores = subjects.map((sub) => row.scores[sub]);
      // Wrap string fields in quotes to handle commas safely
      return [
        index + 1,
        `"${row.student.name}"`,
        ...subjectScores,
        row.totalScore,
        row.average,
        `"${row.remark}"`,
      ];
    });

    // 3. Combine into CSV String
    const csvContent = [
      headers.join(","),
      ...rows.map((e) => e.join(",")),
    ].join("\n");

    // 4. Create Blob and Trigger Download
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    const className =
      CLASSES_LIST.find((c) => c.id === selectedClass)?.name || "Class";
    const filename = `${className}_Report_${schoolConfig.academicYear.replace("-", "_")}_Term${schoolConfig.currentTerm?.match(/\d+/)?.[0] || CURRENT_TERM}.csv`;

    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Layout title="Academic Reports">
      <style>{`
                @media print {
                    @page { size: landscape; margin: 10mm; }
                    body * {
                        visibility: hidden;
                    }
                    #report-content, #report-content * {
                        visibility: visible;
                    }
                    #report-content {
                        position: fixed;
                        left: 0;
                        top: 0;
                        width: 100%;
                        height: 100%;
                        margin: 0;
                        padding: 0;
                        background: white;
                        z-index: 9999;
                    }
                    .no-print {
                        display: none !important;
                    }
                    /* Ensure table expands fully and isn't cut off by scroll areas */
                    #table-container {
                        overflow: visible !important;
                        height: auto !important;
                    }
                }
            `}</style>

      <div
        id="report-content"
        className="bg-white rounded-xl shadow-sm border border-slate-100 flex flex-col h-[calc(100vh-8rem)] print:h-auto print:border-none print:shadow-none"
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 print:bg-white print:border-none">
          <div className="flex items-center gap-4">
            <select
              className="border border-slate-300 rounded-md px-3 py-2 text-sm bg-white text-black no-print"
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
            >
              {CLASSES_LIST.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            {/* Title for print view */}
            <div className="hidden print:block text-2xl font-bold text-slate-900">
              {CLASSES_LIST.find((c) => c.id === selectedClass)?.name} Report
            </div>

            <div className="text-sm text-slate-500 print:text-slate-900 print:font-semibold">
              {schoolConfig.currentTerm} | {schoolConfig.academicYear}
            </div>
          </div>
          <button
            onClick={downloadCSV}
            disabled={loading || reportData.length === 0}
            className="flex items-center text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-4 py-2 rounded-lg transition-colors no-print font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download size={18} className="mr-2" /> Export CSV
          </button>
        </div>

        {/* Table */}
        <div
          id="table-container"
          className="flex-1 overflow-auto p-4 print:overflow-visible print:p-0"
        >
          {schoolConfig.currentTerm?.includes("3") && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6 no-print">
              <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-emerald-800 mb-2">
                  Passed (&gt;= 500)
                </h3>
                {passFailData.pass.length === 0 ? (
                  <p className="text-sm text-emerald-700">
                    No passing students.
                  </p>
                ) : (
                  <ul className="text-sm text-emerald-900 space-y-1 max-h-40 overflow-y-auto">
                    {passFailData.pass.map((row) => (
                      <li
                        key={row.student.id}
                        className="flex items-center justify-between"
                      >
                        <span>{row.student.name}</span>
                        <span className="font-semibold">{row.totalScore}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="bg-red-50 border border-red-100 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-red-800 mb-2">
                  Failed (&lt; 500)
                </h3>
                {passFailData.fail.length === 0 ? (
                  <p className="text-sm text-red-700">No failing students.</p>
                ) : (
                  <ul className="text-sm text-red-900 space-y-1 max-h-40 overflow-y-auto">
                    {passFailData.fail.map((row) => (
                      <li
                        key={row.student.id}
                        className="flex items-center justify-between"
                      >
                        <span>{row.student.name}</span>
                        <span className="font-semibold">{row.totalScore}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
          {loading ? (
            <div className="text-center py-10 text-slate-400">
              Loading Report Data...
            </div>
          ) : (
            <div className="overflow-x-auto print:overflow-visible">
              <table className="w-full text-left text-sm border-collapse text-black">
                <thead className="bg-slate-100 text-black font-bold print:bg-slate-200">
                  <tr>
                    <th className="px-4 py-3 border border-slate-200 w-10">
                      Pos
                    </th>
                    <th className="px-4 py-3 border border-slate-200 min-w-[200px]">
                      Student Name
                    </th>
                    {subjects.map((s) => (
                      <th
                        key={s}
                        className="px-2 py-3 border border-slate-200 w-24 text-center text-xs"
                      >
                        {s.substring(0, 3)}
                      </th>
                    ))}
                    <th className="px-4 py-3 border border-slate-200 text-center w-20 bg-emerald-50 text-emerald-900 print:bg-slate-100">
                      Total
                    </th>
                    <th className="px-4 py-3 border border-slate-200 text-center w-20 bg-[#E6F0FA] text-[#0B4A82] print:bg-slate-100">
                      Avg
                    </th>
                    <th className="px-4 py-3 border border-slate-200 min-w-[200px]">
                      Remark
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.map((row, index) => (
                    <tr
                      key={row.student.id}
                      className="hover:bg-slate-50 print:hover:bg-transparent"
                    >
                      <td className="px-4 py-2 border border-slate-200 text-center font-medium">
                        {index + 1}
                      </td>
                      <td className="px-4 py-2 border border-slate-200 font-medium">
                        {row.student.name}
                      </td>
                      {subjects.map((s) => {
                        const score = row.scores[s];
                        const grade =
                          typeof score === "number"
                            ? calculateGrade(score).grade
                            : "-";
                        return (
                          <td
                            key={s}
                            className="px-2 py-2 border border-slate-200 text-center"
                          >
                            <div className="flex flex-col">
                              <span>{score}</span>
                              {typeof score === "number" && (
                                <span
                                  className={`text-[10px] font-bold ${getGradeColor(grade).split(" ")[0]}`}
                                >
                                  {grade}
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-4 py-2 border border-slate-200 text-center font-bold bg-emerald-50 text-emerald-900 print:bg-transparent">
                        {row.totalScore}
                      </td>
                      <td className="px-4 py-2 border border-slate-200 text-center font-bold bg-[#E6F0FA] text-[#0B4A82] print:bg-transparent">
                        {row.average}
                      </td>
                      <td className="px-4 py-2 border border-slate-200 text-sm">
                        {row.remark}
                      </td>
                    </tr>
                  ))}
                  {reportData.length === 0 && (
                    <tr>
                      <td
                        colSpan={subjects.length + 5}
                        className="p-8 text-center text-slate-400"
                      >
                        No students found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default Reports;
