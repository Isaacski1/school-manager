import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  GraduationCap,
  UserX,
  Calendar,
  BookOpen,
  User as UserIcon,
  X,
  Download,
} from "lucide-react";
// @ts-ignore - html2pdf.js doesn't have proper types
import html2pdf from "html2pdf.js";
import Layout from "../../components/Layout";
import { useSchool } from "../../context/SchoolContext";
import { db } from "../../services/mockDb";
import { CLASSES_LIST, calculateGrade, getGradeColor } from "../../constants";
import { Student } from "../../types";
import schoolLogo from "../../logo/apple-icon-180x180.png";

const StudentHistory = () => {
  const { school } = useSchool();
  const schoolId = school?.id || null;
  const [students, setStudents] = useState<Student[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [viewStudent, setViewStudent] = useState<Student | null>(null);
  const [performanceData, setPerformanceData] = useState<any>(null);
  const [recordsByTerm, setRecordsByTerm] = useState<
    Record<
      string,
      {
        attendance?: any;
        grades: any[];
        remarks: any[];
        skills: any[];
      }
    >
  >({});
  const [selectedTermKey, setSelectedTermKey] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportMode, setExportMode] = useState(false);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const pdfRef = useRef<HTMLDivElement | null>(null);

  const toDataURL = async (url: string): Promise<string | null> => {
    try {
      const res = await fetch(url, { mode: "cors" });
      const blob = await res.blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  };

  useEffect(() => {
    const loadLogo = async () => {
      const target = school?.logoUrl || schoolLogo;
      if (!target) return;
      if (target.startsWith("data:image")) {
        setLogoDataUrl(target);
        return;
      }
      const encoded = await toDataURL(target);
      setLogoDataUrl(encoded || target);
    };

    loadLogo();
  }, [school?.logoUrl]);

  useEffect(() => {
    const load = async () => {
      if (!schoolId) {
        setStudents([]);
        return;
      }
      setLoading(true);
      try {
        const data = await db.getStudents(schoolId, undefined);
        setStudents(data);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [schoolId]);

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredStudents = useMemo(() => {
    if (!normalizedSearch) return students;
    return students.filter((student) => {
      const classLabel =
        CLASSES_LIST.find((c) => c.id === student.classId)?.name || "";
      const searchable = [
        student.name,
        student.guardianName,
        student.guardianPhone,
        student.classId,
        classLabel,
        student.id,
      ]
        .join(" ")
        .toLowerCase();
      return searchable.includes(normalizedSearch);
    });
  }, [normalizedSearch, students]);

  const graduatedStudents = filteredStudents.filter(
    (student) => student.studentStatus === "graduated",
  );
  const stoppedStudents = filteredStudents.filter(
    (student) => student.studentStatus === "stopped",
  );

  const attendanceTotal = performanceData?.attendance?.total;
  const attendancePresent = performanceData?.attendance?.present;
  const attendanceAbsent =
    attendanceTotal != null && attendancePresent != null
      ? Math.max(attendanceTotal - attendancePresent, 0)
      : null;
  const subjectCount = performanceData?.grades?.length ?? 0;
  const termKeySorter = (a: string, b: string) => {
    const matchA = a.match(/(\d{4}).*Term\s+(\d)/i);
    const matchB = b.match(/(\d{4}).*Term\s+(\d)/i);
    if (matchA && matchB) {
      const yearDiff = Number(matchA[1]) - Number(matchB[1]);
      if (yearDiff !== 0) return yearDiff;
      return Number(matchA[2]) - Number(matchB[2]);
    }
    return a.localeCompare(b);
  };
  const termKeys = useMemo(
    () => Object.keys(recordsByTerm).sort(termKeySorter),
    [recordsByTerm],
  );
  const activeTermData = selectedTermKey
    ? recordsByTerm[selectedTermKey]
    : null;
  const activeGrades = activeTermData?.grades || performanceData?.grades || [];

  const handleViewDetails = async (student: Student) => {
    setPerformanceData(null);
    setViewStudent(student);
    const data = await db.getStudentPerformance(
      schoolId || "",
      student.id,
      student.classId,
    );
    setPerformanceData(data);

    const [assessments, remarks, skills] = await Promise.all([
      db.getStudentAssessmentsByStudent(schoolId || "", student.id),
      db.getStudentRemarksByStudent(schoolId || "", student.id),
      db.getStudentSkillsByStudent(schoolId || "", student.id),
    ]);

    const grouped: Record<
      string,
      {
        attendance?: any;
        grades: any[];
        remarks: any[];
        skills: any[];
      }
    > = {};

    assessments.forEach((assessment) => {
      const key = `${assessment.academicYear} · Term ${assessment.term}`;
      if (!grouped[key]) {
        grouped[key] = {
          attendance: data?.attendance,
          grades: [],
          remarks: [],
          skills: [],
        };
      }
      grouped[key].grades.push(assessment);
    });

    remarks.forEach((remark) => {
      const key = `${remark.academicYear} · Term ${remark.term}`;
      if (!grouped[key]) {
        grouped[key] = {
          attendance: data?.attendance,
          grades: [],
          remarks: [],
          skills: [],
        };
      }
      grouped[key].remarks.push(remark);
    });

    skills.forEach((skill) => {
      const key = `${skill.academicYear} · Term ${skill.term}`;
      if (!grouped[key]) {
        grouped[key] = {
          attendance: data?.attendance,
          grades: [],
          remarks: [],
          skills: [],
        };
      }
      grouped[key].skills.push(skill);
    });

    const sortedKeys = Object.keys(grouped).sort((a, b) => a.localeCompare(b));
    setRecordsByTerm(grouped);
    setSelectedTermKey(sortedKeys[sortedKeys.length - 1] || null);
  };

  const closeViewModal = () => {
    setViewStudent(null);
    setPerformanceData(null);
    setRecordsByTerm({});
    setSelectedTermKey(null);
  };

  const exportPdf = async () => {
    if (!pdfRef.current || !viewStudent) return;
    setIsExporting(true);
    setExportMode(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 50));
      const element = pdfRef.current;
      const opt = {
        margin: 10,
        filename: `${viewStudent.name}_student_history.pdf`,
        image: { type: "jpeg" as const, quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: {
          unit: "pt" as const,
          format: "a4" as const,
          orientation: "portrait" as const,
        },
      };
      await html2pdf().set(opt).from(element).save();
    } finally {
      setExportMode(false);
      setIsExporting(false);
    }
  };

  const renderCalendar = () => {
    if (
      !performanceData ||
      !performanceData.attendance ||
      !performanceData.attendance.schoolDates
    )
      return null;

    const { schoolDates, presentDates } = performanceData.attendance;
    if (schoolDates.length === 0) return null;

    const formatMonth = (value: string) => {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return value;
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    };

    return (
      <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-7 gap-2">
        {schoolDates.map((date: string) => {
          const present = presentDates.includes(date);
          return (
            <div
              key={date}
              className={`rounded-lg px-2 py-2 text-center text-[11px] font-semibold border ${
                present
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-sky-200 bg-sky-50 text-sky-700"
              }`}
            >
              {formatMonth(date)}
            </div>
          );
        })}
      </div>
    );
  };

  const renderCards = (rows: Student[], emptyLabel: string) => {
    if (rows.length === 0) {
      return (
        <div className="p-6 text-center text-sm text-slate-400">
          {emptyLabel}
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 p-5">
        {rows.map((student) => {
          const classLabel =
            CLASSES_LIST.find((c) => c.id === student.classId)?.name ||
            student.classId;
          const statusLabel = student.studentStatus || "active";
          const statusStyles =
            statusLabel === "graduated"
              ? "bg-emerald-100 text-emerald-700"
              : statusLabel === "stopped"
                ? "bg-rose-100 text-rose-700"
                : "bg-slate-100 text-slate-600";
          const accentStyles =
            statusLabel === "graduated"
              ? {
                  ring: "ring-emerald-200",
                  glow: "bg-emerald-200/40",
                  chip: "bg-emerald-50 text-emerald-700",
                  button: "bg-emerald-600 hover:bg-emerald-700",
                }
              : statusLabel === "stopped"
                ? {
                    ring: "ring-rose-200",
                    glow: "bg-rose-200/40",
                    chip: "bg-rose-50 text-rose-700",
                    button: "bg-rose-600 hover:bg-rose-700",
                  }
                : {
                    ring: "ring-slate-200",
                    glow: "bg-slate-200/40",
                    chip: "bg-slate-50 text-slate-600",
                    button: "bg-[#0B4A82] hover:bg-[#1160A8]",
                  };
          return (
            <div
              key={student.id}
              className={`group relative overflow-hidden rounded-3xl border border-slate-100 bg-white p-5 shadow-sm ring-1 ${accentStyles.ring} transition-all duration-300 hover:-translate-y-1 hover:shadow-xl`}
            >
              <div className="absolute -top-14 -right-14 h-32 w-32 rounded-full blur-3xl opacity-60 transition-opacity duration-300 group-hover:opacity-100">
                <div
                  className={`h-full w-full rounded-full ${accentStyles.glow}`}
                />
              </div>

              <div className="relative flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`h-12 w-12 rounded-2xl bg-white shadow-sm ring-1 ${accentStyles.ring} flex items-center justify-center text-lg font-bold text-slate-700`}
                  >
                    {student.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-lg font-bold text-slate-900">
                      {student.name}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span
                        className={`px-2 py-0.5 rounded-full font-semibold ${accentStyles.chip}`}
                      >
                        {classLabel}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-slate-50 text-slate-600 font-semibold">
                        {student.gender}
                      </span>
                    </div>
                  </div>
                </div>
                <span
                  className={`inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wide ${statusStyles}`}
                >
                  {statusLabel}
                </span>
              </div>

              <div className="relative mt-4 grid grid-cols-2 gap-3 text-xs text-slate-500">
                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                  <p className="uppercase tracking-wide text-[10px] text-slate-400">
                    Date of Birth
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-700">
                    {student.dob || "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                  <p className="uppercase tracking-wide text-[10px] text-slate-400">
                    Guardian
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-700">
                    {student.guardianName}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                  <p className="uppercase tracking-wide text-[10px] text-slate-400">
                    Guardian Phone
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-700">
                    {student.guardianPhone}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                  <p className="uppercase tracking-wide text-[10px] text-slate-400">
                    Student ID
                  </p>
                  <p className="mt-1 text-[11px] font-semibold text-slate-500 break-all">
                    {student.id}
                  </p>
                </div>
              </div>

              <button
                onClick={() => handleViewDetails(student)}
                className={`mt-5 inline-flex items-center justify-center w-full rounded-2xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors ${accentStyles.button}`}
              >
                View Details
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Layout title="Student History">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="absolute -top-16 -right-16 h-40 w-40 rounded-full bg-emerald-100/50 blur-3xl" />
          <div className="absolute -bottom-20 -left-16 h-48 w-48 rounded-full bg-rose-100/60 blur-3xl" />
          <div className="relative flex flex-col gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                Alumni & Withdrawals
              </p>
              <h1 className="text-3xl font-bold text-slate-900">
                Student History
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                Track students who have graduated from JHS and those who stopped
                school.
              </p>
            </div>
            <div className="flex flex-wrap gap-4">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 min-w-[180px]">
                <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">
                  Graduated
                </p>
                <p className="text-2xl font-bold text-emerald-800 mt-1">
                  {graduatedStudents.length}
                </p>
              </div>
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 min-w-[180px]">
                <p className="text-xs font-semibold text-rose-700 uppercase tracking-wide">
                  Stopped School
                </p>
                <p className="text-2xl font-bold text-rose-800 mt-1">
                  {stoppedStudents.length}
                </p>
              </div>
              <div className="flex-1 min-w-[220px]">
                <div className="relative">
                  <Search
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    size={18}
                  />
                  <input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search student, guardian, class, or ID"
                    className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-700 shadow-sm focus:border-[#1160A8] focus:outline-none focus:ring-2 focus:ring-[#1160A8]/20"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6">
          <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-emerald-100 bg-emerald-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                  <GraduationCap className="text-emerald-600" size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-emerald-900">
                    Graduated Students (JHS)
                  </h2>
                  <p className="text-xs text-emerald-700">
                    Students marked as graduated
                  </p>
                </div>
              </div>
              {loading && (
                <span className="text-xs text-emerald-700">Loading...</span>
              )}
            </div>
            {renderCards(graduatedStudents, "No graduated students found.")}
          </div>

          <div className="bg-white rounded-2xl border border-rose-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-rose-100 bg-rose-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center">
                  <UserX className="text-rose-600" size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-rose-900">
                    Stopped School
                  </h2>
                  <p className="text-xs text-rose-700">
                    Students marked as stopped
                  </p>
                </div>
              </div>
              {loading && (
                <span className="text-xs text-rose-700">Loading...</span>
              )}
            </div>
            {renderCards(stoppedStudents, "No students marked as stopped.")}
          </div>
        </div>
      </div>

      {viewStudent && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[95vh] overflow-y-auto shadow-2xl flex flex-col">
            <div className="p-6 border-b border-slate-100 flex flex-col gap-4 bg-gradient-to-r from-slate-50 via-white to-emerald-50 sticky top-0 z-10">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="h-16 w-16 rounded-2xl bg-white ring-1 ring-slate-200 p-2 shadow-sm">
                    <img
                      src={logoDataUrl || schoolLogo}
                      alt="School logo"
                      className="h-full w-full object-contain"
                    />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-400">
                      {school?.name || "School"}
                    </p>
                    <h2 className="text-2xl font-bold text-slate-900">
                      Student History Report
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">
                      {school?.address || ""}
                      {school?.phone ? ` · ${school.phone}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={exportPdf}
                    className="inline-flex items-center gap-2 rounded-full bg-[#0B4A82] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#1160A8]"
                    disabled={isExporting}
                  >
                    <Download size={14} />
                    {isExporting ? "Exporting..." : "Export PDF"}
                  </button>
                  <button
                    onClick={closeViewModal}
                    className="text-slate-400 hover:text-slate-700 bg-white p-2 rounded-full shadow-sm"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    Student
                  </p>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="w-12 h-12 bg-indigo-100 text-indigo-700 rounded-2xl flex items-center justify-center text-lg font-bold shadow-sm">
                      {viewStudent.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        {viewStudent.name}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-1">
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 shadow-sm">
                          <UserIcon size={12} />
                          {viewStudent.gender}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 shadow-sm">
                          <BookOpen size={12} />
                          {
                            CLASSES_LIST.find(
                              (c) => c.id === viewStudent.classId,
                            )?.name
                          }
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 shadow-sm">
                          {viewStudent.studentStatus || "active"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    Attendance Summary
                  </p>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl bg-slate-50 p-2">
                      <p className="text-[11px] text-slate-500">Rate</p>
                      <p
                        className={`text-lg font-bold ${performanceData?.attendance?.percentage < 50 ? "text-rose-600" : "text-emerald-600"}`}
                      >
                        {performanceData
                          ? `${performanceData.attendance.percentage}%`
                          : "-"}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-2">
                      <p className="text-[11px] text-slate-500">Present</p>
                      <p className="text-lg font-bold text-slate-800">
                        {performanceData
                          ? performanceData.attendance.present
                          : "-"}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-2">
                      <p className="text-[11px] text-slate-500">Total</p>
                      <p className="text-lg font-bold text-slate-800">
                        {performanceData
                          ? performanceData.attendance.total
                          : "-"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-8" ref={pdfRef}>
              <div className="rounded-2xl border border-slate-100 bg-white/80 p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="h-16 w-16 rounded-2xl bg-white ring-1 ring-slate-200 p-2 shadow-sm">
                      <img
                        src={logoDataUrl || schoolLogo}
                        alt="School logo"
                        className="h-full w-full object-contain"
                      />
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-400">
                        {school?.name || "School"}
                      </p>
                      <h3 className="text-lg font-bold text-slate-800">
                        Student History Report
                      </h3>
                      <p className="text-xs text-slate-500 mt-1">
                        {school?.address || ""}
                        {school?.phone ? ` · ${school.phone}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="text-xs text-slate-500">
                    Generated: {new Date().toLocaleDateString()}
                  </div>
                </div>
              </div>
              {!exportMode && termKeys.length > 0 && (
                <div className="rounded-2xl border border-slate-100 bg-white/80 p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-400">
                        Academic Year & Term
                      </p>
                      <h3 className="text-lg font-bold text-slate-800">
                        {selectedTermKey || "Select term"}
                      </h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {termKeys.map((key) => (
                        <button
                          key={key}
                          onClick={() => setSelectedTermKey(key)}
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                            selectedTermKey === key
                              ? "bg-[#0B4A82] border-[#0B4A82] text-white"
                              : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                          }`}
                        >
                          {key}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {termKeys.length === 0 && (
                <div className="rounded-2xl border border-slate-100 bg-white/80 p-6 shadow-sm text-sm text-slate-400">
                  No term records available for this student yet.
                </div>
              )}

              {!exportMode &&
                selectedTermKey &&
                recordsByTerm[selectedTermKey] && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-400">
                        Remarks
                      </p>
                      {recordsByTerm[selectedTermKey].remarks.length > 0 ? (
                        <div className="mt-2 space-y-2">
                          {recordsByTerm[selectedTermKey].remarks.map(
                            (remark: any) => (
                              <div
                                key={remark.id}
                                className="rounded-xl border border-slate-100 bg-white p-3 text-sm text-slate-600"
                              >
                                <p className="font-semibold text-slate-800">
                                  {remark.remark}
                                </p>
                                {remark.behaviorTag && (
                                  <span className="inline-flex mt-2 text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                                    {remark.behaviorTag}
                                  </span>
                                )}
                              </div>
                            ),
                          )}
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-slate-400">
                          No remarks for this term.
                        </p>
                      )}
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-400">
                        Skills
                      </p>
                      {recordsByTerm[selectedTermKey].skills.length > 0 ? (
                        <div className="mt-2 space-y-2 text-sm text-slate-600">
                          {recordsByTerm[selectedTermKey].skills.map(
                            (skill: any) => (
                              <div
                                key={skill.id}
                                className="rounded-xl border border-slate-100 bg-white p-3"
                              >
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                  <div>Punctuality: {skill.punctuality}</div>
                                  <div>Neatness: {skill.neatness}</div>
                                  <div>Conduct: {skill.conduct}</div>
                                  <div>Attitude: {skill.attitudeToWork}</div>
                                  <div>
                                    Participation: {skill.classParticipation}
                                  </div>
                                  <div>
                                    Homework: {skill.homeworkCompletion}
                                  </div>
                                </div>
                              </div>
                            ),
                          )}
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-slate-400">
                          No skills for this term.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    Guardian
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-700">
                    {viewStudent.guardianName}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    Guardian Phone
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-700">
                    {viewStudent.guardianPhone}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-white/80 p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600">
                      <Calendar size={20} />
                    </div>
                    <h4 className="font-bold text-slate-800 text-lg">
                      Attendance Record
                    </h4>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-700">
                      <div className="w-2.5 h-2.5 bg-emerald-300 rounded-full" />
                      Present
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 font-semibold text-sky-700">
                      <div className="w-2.5 h-2.5 bg-sky-300 rounded-full" />
                      Absent
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                  <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-400">
                      Total Days
                    </p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">
                      {attendanceTotal ?? "-"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                    <p className="text-xs uppercase tracking-wide text-emerald-500">
                      Days Present
                    </p>
                    <p className="mt-2 text-2xl font-bold text-emerald-700">
                      {attendancePresent ?? "-"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-4">
                    <p className="text-xs uppercase tracking-wide text-sky-500">
                      Days Absent
                    </p>
                    <p className="mt-2 text-2xl font-bold text-sky-700">
                      {attendanceAbsent ?? "-"}
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                  {renderCalendar()}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-white/80 p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <h3 className="font-bold text-slate-800 flex items-center">
                    <BookOpen size={20} className="mr-2 text-[#0B4A82]" />
                    Academic Performance
                  </h3>
                  <span className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                    Subjects: {subjectCount}
                  </span>
                </div>
                {exportMode ? (
                  <div className="space-y-6">
                    {(termKeys.length > 0 ? termKeys : ["Current Term"]).map(
                      (key) => (
                        <div
                          key={key}
                          className="rounded-2xl border border-slate-100 bg-white"
                        >
                          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 text-sm font-semibold text-slate-700">
                            {key}
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                              <thead className="bg-slate-50 text-slate-600 font-semibold">
                                <tr>
                                  <th className="px-4 py-3">Subject</th>
                                  <th className="px-4 py-3 text-center">
                                    Score
                                  </th>
                                  <th className="px-4 py-3 text-center">
                                    Grade
                                  </th>
                                  <th className="px-4 py-3 text-right">
                                    Remark
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {(termKeys.length > 0
                                  ? recordsByTerm[key]?.grades || []
                                  : activeGrades
                                ).length > 0 ? (
                                  (termKeys.length > 0
                                    ? recordsByTerm[key]?.grades || []
                                    : activeGrades
                                  ).map((g: any, i: number) => {
                                    const score =
                                      g.total ||
                                      (g.testScore || 0) +
                                        (g.homeworkScore || 0) +
                                        (g.projectScore || 0) +
                                        (g.examScore || 0);
                                    const { grade, remark } =
                                      calculateGrade(score);
                                    return (
                                      <tr key={i}>
                                        <td className="px-4 py-3 font-medium text-slate-800">
                                          {g.subject}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                          {score > 0 ? score : "-"}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                          <span
                                            className={`px-2 py-1 rounded text-xs font-bold ${getGradeColor(grade)}`}
                                          >
                                            {score > 0 ? grade : "-"}
                                          </span>
                                        </td>
                                        <td className="px-4 py-3 text-right text-slate-500">
                                          {score > 0 ? remark : "N/A"}
                                        </td>
                                      </tr>
                                    );
                                  })
                                ) : (
                                  <tr>
                                    <td colSpan={4} className="p-4 text-center">
                                      No assessments recorded for this term.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-slate-50 text-slate-600 font-semibold">
                        <tr>
                          <th className="px-4 py-3">Subject</th>
                          <th className="px-4 py-3 text-center">Score</th>
                          <th className="px-4 py-3 text-center">Grade</th>
                          <th className="px-4 py-3 text-right">Remark</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {performanceData ? (
                          activeGrades.length > 0 ? (
                            activeGrades.map((g: any, i: number) => {
                              const score =
                                g.total ||
                                (g.testScore || 0) +
                                  (g.homeworkScore || 0) +
                                  (g.projectScore || 0) +
                                  (g.examScore || 0);
                              const { grade, remark } = calculateGrade(score);
                              return (
                                <tr key={i} className="hover:bg-slate-50">
                                  <td className="px-4 py-3 font-medium text-slate-800">
                                    {g.subject}
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    {score > 0 ? score : "-"}
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <span
                                      className={`px-2 py-1 rounded text-xs font-bold ${getGradeColor(grade)}`}
                                    >
                                      {score > 0 ? grade : "-"}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-right text-slate-500">
                                    {score > 0 ? remark : "N/A"}
                                  </td>
                                </tr>
                              );
                            })
                          ) : (
                            <tr>
                              <td colSpan={4} className="p-4 text-center">
                                No assessments recorded for this term.
                              </td>
                            </tr>
                          )
                        ) : (
                          <tr>
                            <td colSpan={4} className="p-4 text-center">
                              Loading grades...
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="mt-3 flex items-center justify-end text-xs text-slate-400">
                  Updated via system records
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 text-center">
              <p className="text-xs text-slate-400">
                Generated automatically by School Manager GH System
              </p>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default StudentHistory;
