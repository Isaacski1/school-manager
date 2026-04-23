import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart3,
  BookOpen,
  ClipboardCheck,
  GraduationCap,
  MessageSquare,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import Layout from "../../components/Layout";
import { useAuth } from "../../context/AuthContext";
import { CLASSES_LIST, calculateGrade, calculateTotalScore, getGradeColor } from "../../constants";
import { db } from "../../services/mockDb";
import { showToast } from "../../services/toast";
import {
  Assessment,
  SchoolConfig,
  Student,
  StudentRemark,
  StudentSkills,
} from "../../types";

type TermRecord = {
  key: string;
  label: string;
  academicYear: string;
  term: number;
  grades: Assessment[];
  remarks: StudentRemark[];
  skills: StudentSkills[];
};

type StudentPerformanceSnapshot = {
  attendance?: {
    total: number;
    present: number;
    percentage: number;
    schoolDates: string[];
    presentDates: string[];
  };
  grades?: Partial<Assessment>[];
} | null;

const parseAcademicYearStart = (value?: string) => {
  const match = String(value || "").match(/(\d{4})/);
  return match ? Number(match[1]) : 0;
};

const termRecordSorter = (left: TermRecord, right: TermRecord) => {
  const yearDiff =
    parseAcademicYearStart(right.academicYear) -
    parseAcademicYearStart(left.academicYear);
  if (yearDiff !== 0) return yearDiff;
  return right.term - left.term;
};

const buildTermRecords = (
  assessments: Assessment[],
  remarks: StudentRemark[],
  skills: StudentSkills[],
): TermRecord[] => {
  const records = new Map<string, TermRecord>();

  const ensureRecord = (academicYear: string, term: number) => {
    const key = `${academicYear}__${term}`;
    if (!records.has(key)) {
      records.set(key, {
        key,
        label: `${academicYear} - Term ${term}`,
        academicYear,
        term,
        grades: [],
        remarks: [],
        skills: [],
      });
    }
    return records.get(key)!;
  };

  assessments.forEach((assessment) => {
    ensureRecord(assessment.academicYear, assessment.term).grades.push(
      assessment,
    );
  });

  remarks.forEach((remark) => {
    ensureRecord(remark.academicYear, remark.term).remarks.push(remark);
  });

  skills.forEach((skill) => {
    ensureRecord(skill.academicYear, skill.term).skills.push(skill);
  });

  return Array.from(records.values()).sort(termRecordSorter);
};

const StudentPerformance = () => {
  const { user } = useAuth();
  const schoolId = user?.schoolId || "";
  const assignedClassIds = (user as any)?.assignedClassIds || [];

  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [students, setStudents] = useState<Student[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [performanceData, setPerformanceData] =
    useState<StudentPerformanceSnapshot>(null);
  const [termRecords, setTermRecords] = useState<TermRecord[]>([]);
  const [selectedTermKey, setSelectedTermKey] = useState<string | null>(null);
  const [schoolConfig, setSchoolConfig] = useState<SchoolConfig | null>(null);

  useEffect(() => {
    if (!assignedClassIds.length) return;
    if (!selectedClassId || !assignedClassIds.includes(selectedClassId)) {
      setSelectedClassId(assignedClassIds[0]);
    }
  }, [assignedClassIds, selectedClassId]);

  useEffect(() => {
    if (!schoolId) return;
    const loadSchoolConfig = async () => {
      try {
        const config = await db.getSchoolConfig(schoolId);
        setSchoolConfig(config);
      } catch (error) {
        console.error("Failed to load school config", error);
      }
    };
    void loadSchoolConfig();
  }, [schoolId]);

  const loadStudents = useCallback(async () => {
    if (!schoolId || !selectedClassId) {
      setStudents([]);
      return;
    }

    setLoadingStudents(true);
    try {
      const rows = await db.getStudents(schoolId, selectedClassId);
      const activeStudents = rows.filter(
        (student) => (student.studentStatus || "active") === "active",
      );
      activeStudents.sort((left, right) => left.name.localeCompare(right.name));
      setStudents(activeStudents);
    } catch (error) {
      console.error("Failed to load class students", error);
      showToast("Unable to load students for this class.", { type: "error" });
      setStudents([]);
    } finally {
      setLoadingStudents(false);
    }
  }, [schoolId, selectedClassId]);

  useEffect(() => {
    void loadStudents();
  }, [loadStudents]);

  useEffect(() => {
    if (!selectedStudent) return;
    const stillVisible = students.some((student) => student.id === selectedStudent.id);
    if (!stillVisible) {
      setSelectedStudent(null);
      setPerformanceData(null);
      setTermRecords([]);
      setSelectedTermKey(null);
    }
  }, [selectedStudent, students]);

  const handleSelectStudent = useCallback(
    async (student: Student) => {
      if (!schoolId) return;

      setSelectedStudent(student);
      setLoadingDetails(true);
      setPerformanceData(null);
      setTermRecords([]);
      setSelectedTermKey(null);

      try {
        const [snapshot, assessments, remarks, skills] = await Promise.all([
          db.getStudentPerformance(schoolId, student.id, student.classId),
          db.getStudentAssessmentsByStudent(schoolId, student.id),
          db.getStudentRemarksByStudent(schoolId, student.id),
          db.getStudentSkillsByStudent(schoolId, student.id),
        ]);

        const nextTermRecords = buildTermRecords(assessments, remarks, skills);
        setPerformanceData(snapshot || null);
        setTermRecords(nextTermRecords);
        setSelectedTermKey(nextTermRecords[0]?.key || null);
      } catch (error) {
        console.error("Failed to load student performance", error);
        showToast("Unable to load student performance right now.", {
          type: "error",
        });
      } finally {
        setLoadingDetails(false);
      }
    },
    [schoolId],
  );

  const selectedClassName =
    CLASSES_LIST.find((cls) => cls.id === selectedClassId)?.name || "Assigned class";

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredStudents = useMemo(() => {
    if (!normalizedSearch) return students;
    return students.filter((student) => {
      const haystack = [
        student.name,
        student.guardianName,
        student.guardianPhone,
        student.id,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [normalizedSearch, students]);

  const selectedTermRecord = useMemo(
    () => termRecords.find((record) => record.key === selectedTermKey) || null,
    [selectedTermKey, termRecords],
  );

  const activeGrades = useMemo(() => {
    if (selectedTermRecord?.grades?.length) return selectedTermRecord.grades;
    return performanceData?.grades || [];
  }, [performanceData?.grades, selectedTermRecord]);

  const activeRemark = useMemo(() => {
    if (!selectedTermRecord?.remarks?.length) return null;
    return [...selectedTermRecord.remarks].sort((left, right) =>
      String(right.dateCreated || "").localeCompare(String(left.dateCreated || "")),
    )[0];
  }, [selectedTermRecord]);

  const activeSkills = useMemo(() => {
    if (!selectedTermRecord?.skills?.length) return null;
    return [...selectedTermRecord.skills].sort((left, right) =>
      String(right.term).localeCompare(String(left.term)),
    )[0];
  }, [selectedTermRecord]);

  const attendanceSummary = performanceData?.attendance || null;
  const averageScore = useMemo(() => {
    if (!activeGrades.length) return null;
    const totals = activeGrades.map((row) =>
      typeof row.total === "number" && Number.isFinite(row.total)
        ? row.total
        : calculateTotalScore(row),
    );
    const total = totals.reduce((sum, value) => sum + value, 0);
    return Math.round(total / Math.max(1, totals.length));
  }, [activeGrades]);

  const subjectCount = activeGrades.length;
  const currentTermLabel = selectedTermRecord?.label
    ? selectedTermRecord.label
    : schoolConfig
      ? `${schoolConfig.academicYear || "Current Year"} - ${
          schoolConfig.currentTerm || "Current Term"
        }`
      : "Current term";

  if (!assignedClassIds.length) {
    return (
      <Layout title="Student Performance">
        <div className="mx-auto max-w-4xl rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
            <GraduationCap className="text-slate-500" size={28} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">
            No assigned class yet
          </h1>
          <p className="mt-3 text-sm text-slate-500">
            This page becomes available when a teacher has one or more classes
            assigned. Ask the school admin to assign your class first.
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Student Performance">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="absolute -right-16 -top-14 h-36 w-36 rounded-full bg-sky-100/70 blur-3xl" />
          <div className="absolute -bottom-16 -left-12 h-40 w-40 rounded-full bg-emerald-100/70 blur-3xl" />

          <div className="relative space-y-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                Teacher Workspace
              </p>
              <h1 className="mt-2 text-3xl font-bold text-slate-900">
                Student Performance
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                Review attendance, subject scores, remarks, and learning skills
                for students in your assigned classes.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
                  Assigned Classes
                </p>
                <p className="mt-2 text-2xl font-bold text-sky-900">
                  {assignedClassIds.length}
                </p>
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  Students in View
                </p>
                <p className="mt-2 text-2xl font-bold text-emerald-900">
                  {filteredStudents.length}
                </p>
              </div>
              <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                  Selected Class
                </p>
                <p className="mt-2 text-lg font-bold text-amber-900">
                  {selectedClassName}
                </p>
              </div>
              <div className="rounded-2xl border border-violet-100 bg-violet-50/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">
                  Current Term
                </p>
                <p className="mt-2 text-lg font-bold text-violet-900">
                  {schoolConfig?.currentTerm || "Not set"}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.96fr_1.34fr]">
          <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Students
                </p>
                <h2 className="mt-1 text-xl font-bold text-slate-900">
                  Class Register
                </h2>
              </div>
              <select
                value={selectedClassId}
                onChange={(event) => setSelectedClassId(event.target.value)}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[#1160A8] focus:ring-2 focus:ring-[#1160A8]/20"
              >
                {assignedClassIds.map((classId: string) => {
                  const className =
                    CLASSES_LIST.find((item) => item.id === classId)?.name || classId;
                  return (
                    <option key={classId} value={classId}>
                      {className}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                size={18}
              />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search student, guardian, phone, or ID"
                className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-700 outline-none transition focus:border-[#1160A8] focus:ring-2 focus:ring-[#1160A8]/20"
              />
            </div>

            <div className="space-y-3">
              {loadingStudents ? (
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-6 text-center text-sm text-slate-500">
                  Loading students...
                </div>
              ) : filteredStudents.length === 0 ? (
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-6 text-center text-sm text-slate-500">
                  No students found for this class and search filter.
                </div>
              ) : (
                filteredStudents.map((student) => {
                  const isActive = selectedStudent?.id === student.id;
                  return (
                    <button
                      key={student.id}
                      type="button"
                      onClick={() => void handleSelectStudent(student)}
                      className={`w-full rounded-2xl border p-4 text-left transition ${
                        isActive
                          ? "border-[#1160A8] bg-[#E6F0FA]/60 shadow-sm"
                          : "border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-base font-semibold text-slate-900">
                            {student.name}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            Guardian: {student.guardianName || "Not set"}
                          </p>
                        </div>
                        <div className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                          {student.gender}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1">
                          {selectedClassName}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1">
                          {student.guardianPhone || "No guardian phone"}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            {!selectedStudent ? (
              <div className="flex min-h-[520px] flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50/70 px-6 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm">
                  <BarChart3 className="text-slate-500" size={28} />
                </div>
                <h2 className="text-2xl font-bold text-slate-900">
                  Choose a student
                </h2>
                <p className="mt-3 max-w-md text-sm leading-6 text-slate-500">
                  Select any student from your class register to view attendance,
                  grades, remarks, and learning skills in one place.
                </p>
              </div>
            ) : loadingDetails ? (
              <div className="flex min-h-[520px] items-center justify-center rounded-3xl border border-slate-100 bg-slate-50/70">
                <div className="text-center">
                  <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-[#0B4A82]" />
                  <p className="mt-4 text-sm text-slate-500">
                    Loading student performance...
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                      Student Snapshot
                    </p>
                    <h2 className="mt-1 text-2xl font-bold text-slate-900">
                      {selectedStudent.name}
                    </h2>
                    <p className="mt-2 text-sm text-slate-500">
                      {selectedClassName} | Current focus: {currentTermLabel}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedStudent(null);
                      setPerformanceData(null);
                      setTermRecords([]);
                      setSelectedTermKey(null);
                    }}
                    className="inline-flex items-center justify-center rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                    aria-label="Close student details"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                      Attendance
                    </p>
                    <p className="mt-2 text-2xl font-bold text-emerald-900">
                      {attendanceSummary?.percentage ?? 0}%
                    </p>
                    <p className="mt-1 text-xs text-emerald-700">
                      {attendanceSummary
                        ? `${attendanceSummary.present}/${attendanceSummary.total} school days`
                        : "No attendance record yet"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
                      Subjects Graded
                    </p>
                    <p className="mt-2 text-2xl font-bold text-sky-900">
                      {subjectCount}
                    </p>
                    <p className="mt-1 text-xs text-sky-700">
                      Subjects with report data in view
                    </p>
                  </div>
                  <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                      Average Score
                    </p>
                    <p className="mt-2 text-2xl font-bold text-amber-900">
                      {averageScore ?? "-"}
                    </p>
                    <p className="mt-1 text-xs text-amber-700">
                      Average across visible subjects
                    </p>
                  </div>
                  <div className="rounded-2xl border border-violet-100 bg-violet-50/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">
                      Behavior
                    </p>
                    <p className="mt-2 text-lg font-bold text-violet-900">
                      {activeRemark?.behaviorTag || "Not tagged"}
                    </p>
                    <p className="mt-1 text-xs text-violet-700">
                      Latest teacher behavior note
                    </p>
                  </div>
                </div>

                {termRecords.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                      Report Terms
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {termRecords.map((record) => (
                        <button
                          key={record.key}
                          type="button"
                          onClick={() => setSelectedTermKey(record.key)}
                          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                            selectedTermKey === record.key
                              ? "bg-[#0B4A82] text-white"
                              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          }`}
                        >
                          {record.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
                  <div className="rounded-3xl border border-slate-100 bg-slate-50/60 p-4">
                    <div className="mb-4 flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white shadow-sm">
                        <BookOpen className="text-[#1160A8]" size={18} />
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                          Subject Breakdown
                        </p>
                        <h3 className="text-lg font-bold text-slate-900">
                          Performance Table
                        </h3>
                      </div>
                    </div>

                    {activeGrades.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
                        No assessment scores found for this student yet.
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white">
                        <table className="min-w-full text-left text-sm">
                          <thead className="bg-slate-50 text-slate-600">
                            <tr>
                              <th className="px-4 py-3 font-semibold">Subject</th>
                              <th className="px-4 py-3 font-semibold">CA</th>
                              <th className="px-4 py-3 font-semibold">Exam</th>
                              <th className="px-4 py-3 font-semibold">Total</th>
                              <th className="px-4 py-3 font-semibold">Grade</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {activeGrades.map((row, index) => {
                              const hasBreakdown =
                                "testScore" in row ||
                                "homeworkScore" in row ||
                                "projectScore" in row ||
                                "examScore" in row;
                              const totalScore =
                                typeof row.total === "number" &&
                                Number.isFinite(row.total)
                                  ? row.total
                                  : calculateTotalScore(row);
                              const grade = calculateGrade(
                                totalScore,
                                schoolConfig?.gradingScale,
                              );
                              const caScore = hasBreakdown
                                ? (row.testScore || 0) +
                                  (row.homeworkScore || 0) +
                                  (row.projectScore || 0)
                                : null;

                              return (
                                <tr key={`${row.subject}_${index}`}>
                                  <td className="px-4 py-3 font-medium text-slate-900">
                                    {row.subject}
                                  </td>
                                  <td className="px-4 py-3 text-slate-600">
                                    {caScore === null ? "-" : caScore}
                                  </td>
                                  <td className="px-4 py-3 text-slate-600">
                                    {hasBreakdown ? row.examScore || 0 : "-"}
                                  </td>
                                  <td className="px-4 py-3 font-semibold text-slate-900">
                                    {totalScore}
                                  </td>
                                  <td className="px-4 py-3">
                                    <span
                                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getGradeColor(
                                        grade.grade,
                                      )}`}
                                    >
                                      {grade.grade} - {grade.remark}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div className="space-y-5">
                    <div className="rounded-3xl border border-slate-100 bg-slate-50/60 p-4">
                      <div className="mb-4 flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white shadow-sm">
                          <MessageSquare className="text-emerald-600" size={18} />
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                            Teacher Remark
                          </p>
                          <h3 className="text-lg font-bold text-slate-900">
                            Latest Feedback
                          </h3>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-100 bg-white p-4">
                        {activeRemark ? (
                          <>
                            <div className="mb-3 flex flex-wrap items-center gap-2">
                              {activeRemark.behaviorTag ? (
                                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                                  {activeRemark.behaviorTag}
                                </span>
                              ) : null}
                              <span className="text-xs text-slate-400">
                                {activeRemark.dateCreated || "No date"}
                              </span>
                            </div>
                            <p className="text-sm leading-6 text-slate-700">
                              {activeRemark.remark}
                            </p>
                          </>
                        ) : (
                          <p className="text-sm text-slate-500">
                            No teacher remark saved for this term yet.
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="rounded-3xl border border-slate-100 bg-slate-50/60 p-4">
                      <div className="mb-4 flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white shadow-sm">
                          <Sparkles className="text-amber-600" size={18} />
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                            Learning Skills
                          </p>
                          <h3 className="text-lg font-bold text-slate-900">
                            Classroom Habits
                          </h3>
                        </div>
                      </div>

                      {activeSkills ? (
                        <div className="grid grid-cols-1 gap-2">
                          {[
                            ["Punctuality", activeSkills.punctuality],
                            ["Neatness", activeSkills.neatness],
                            ["Conduct", activeSkills.conduct],
                            ["Attitude to Work", activeSkills.attitudeToWork],
                            ["Class Participation", activeSkills.classParticipation],
                            ["Homework Completion", activeSkills.homeworkCompletion],
                          ].map(([label, value]) => (
                            <div
                              key={label}
                              className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white px-3 py-2.5 text-sm"
                            >
                              <span className="text-slate-600">{label}</span>
                              <span className="font-semibold text-slate-900">
                                {value}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-slate-100 bg-white p-4 text-sm text-slate-500">
                          No skill ratings saved for this term yet.
                        </div>
                      )}
                    </div>

                    <div className="rounded-3xl border border-slate-100 bg-slate-50/60 p-4">
                      <div className="mb-4 flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white shadow-sm">
                          <ClipboardCheck className="text-violet-600" size={18} />
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                            Quick Actions
                          </p>
                          <h3 className="text-lg font-bold text-slate-900">
                            Continue Teaching Tasks
                          </h3>
                        </div>
                      </div>

                      <div className="flex flex-col gap-3">
                        <Link
                          to="/teacher/assessment"
                          className="w-full rounded-2xl border border-slate-100 bg-white px-4 py-3 text-sm font-semibold leading-5 text-slate-700 transition hover:border-amber-200 hover:bg-amber-50"
                        >
                          <span className="block">Open Assessment</span>
                        </Link>
                        <Link
                          to="/teacher/write-remarks"
                          className="w-full rounded-2xl border border-slate-100 bg-white px-4 py-3 text-sm font-semibold leading-5 text-slate-700 transition hover:border-emerald-200 hover:bg-emerald-50"
                        >
                          <span className="block">Write Remarks</span>
                        </Link>
                        <Link
                          to="/teacher/edit-skills"
                          className="w-full rounded-2xl border border-slate-100 bg-white px-4 py-3 text-sm font-semibold leading-5 text-slate-700 transition hover:border-violet-200 hover:bg-violet-50"
                        >
                          <span className="block">Edit Skills</span>
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </Layout>
  );
};

export default StudentPerformance;
