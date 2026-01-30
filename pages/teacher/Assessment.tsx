import React, { useState, useEffect } from "react";
import Layout from "../../components/Layout";
import { useAuth } from "../../context/AuthContext";
import { db } from "../../services/mockDb";
import { Student, Assessment } from "../../types";
import {
  CLASSES_LIST,
  ACADEMIC_YEAR,
  CURRENT_TERM,
  calculateGrade,
  getGradeColor,
  calculateTotalScore,
} from "../../constants";
import { Save } from "lucide-react";
import { showToast } from "../../services/toast";

const nurserySubjects = [
  "Language & Literacy",
  "Numeracy",
  "Environmental Studies",
  "Creative Arts",
  "Physical Development",
  "Social & Emotional Development",
  "Rhymes, Songs & Storytelling",
];

const kgSubjects = [
  "Literacy & Language",
  "Numeracy",
  "OWOP",
  "Creative Art",
  "Physical Education",
];

const primarySubjects = [
  "English Language",
  "Mathematics",
  "Science",
  "ICT",
  "Religious & Moral Education (RME)",
  "Ghanaian Language",
  "Our World Our People (OWOP)",
  "Creative Arts",
  "Physical Education",
];

const jhsSubjects = [
  "English Language",
  "Mathematics",
  "Integrated Science",
  "Social Studies",
  "Religious & Moral Education (RME)",
  "ICT",
  "French",
  "Ghanaian Language",
  "Creative Arts & Design",
  "Physical Education",
  "Career Technology",
  "Computing / Coding",
];

const AssessmentPage = () => {
  const { user } = useAuth();
  const assignedClassIds = user?.assignedClassIds || [];
  const schoolId = user?.schoolId || null;
  const [selectedClassId, setSelectedClassId] = useState<string>("");

  const [students, setStudents] = useState<Student[]>([]);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [selectedSubject, setSelectedSubject] = useState("");
  const [assessments, setAssessments] = useState<
    Record<string, Partial<Assessment>>
  >({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // School config (term + academic year) fetched from DB
  const [schoolConfig, setSchoolConfig] = useState<{
    currentTerm: string;
    academicYear: string;
  }>({ currentTerm: `Term ${CURRENT_TERM}`, academicYear: ACADEMIC_YEAR });

  // Score Limits
  const LIMITS = {
    testScore: 15,
    homeworkScore: 15,
    projectScore: 20,
    examScore: 100,
  };

  // Initialize selected class
  useEffect(() => {
    if (assignedClassIds.length > 0 && !selectedClassId) {
      setSelectedClassId(assignedClassIds[0]);
    }
  }, [assignedClassIds]);

  // Load school configuration (term + academic year)
  useEffect(() => {
    const loadConfig = async () => {
      try {
        if (!schoolId) return;
        const cfg = await db.getSchoolConfig(schoolId);
        setSchoolConfig({
          currentTerm: cfg.currentTerm || `Term ${CURRENT_TERM}`,
          academicYear: cfg.academicYear || ACADEMIC_YEAR,
        });

        // Check if term transition has been processed - reload once to get fresh data
        if (cfg.termTransitionProcessed) {
          console.log("Term transition detected, reloading for fresh data...");
          await db.updateSchoolConfig({
            ...cfg,
            termTransitionProcessed: false,
          });
          window.location.reload();
          return;
        }

        // Check if nextTermBegins date has passed and reset hasn't been triggered yet
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const nextTermDate = cfg.nextTermBegins
          ? new Date(cfg.nextTermBegins + "T00:00:00")
          : null;

        if (nextTermDate && today >= nextTermDate) {
          console.log("New term begins, initiating reset...");
          await db.resetForNewTerm(cfg);
          await db.updateSchoolConfig({
            ...cfg,
            termTransitionProcessed: true,
          });
          showToast("New term started! Assessments have been reset.", {
            type: "success",
          });
          window.location.reload();
          return;
        }
      } catch (e) {
        console.error("Failed to load school config", e);
      }
    };
    loadConfig();
  }, [schoolId]);

  useEffect(() => {
    const loadSubjectsForClass = async () => {
      if (!selectedClassId || !schoolId) {
        setSubjects([]);
        setSelectedSubject("");
        return;
      }

      // Get subjects from DB, with fallback to hardcoded based on class level
      const currentSubjects = await db.getSubjects(schoolId, selectedClassId);

      setSubjects(currentSubjects);
      if (currentSubjects.length > 0) {
        setSelectedSubject(currentSubjects[0]);
      } else {
        setSelectedSubject("");
      }
    };

    loadSubjectsForClass();
  }, [selectedClassId, schoolId]);

  useEffect(() => {
    if (!selectedClassId || !schoolId) return;

    const loadStudents = async () => {
      const studentsList = await db.getStudents(schoolId, selectedClassId);
      setStudents(studentsList);
    };

    loadStudents();
  }, [selectedClassId, schoolId]);

  useEffect(() => {
    if (!selectedClassId || !selectedSubject || !schoolId) {
      setAssessments({});
      return;
    }

    const loadAssessments = async () => {
      setLoading(true);

      // Get existing assessments
      const existing = await db.getAssessments(
        schoolId,
        selectedClassId,
        selectedSubject,
      );

      // Determine dynamic term number from schoolConfig (e.g. "Term 2" -> 2)
      let dynamicTerm = CURRENT_TERM;
      if (schoolConfig.currentTerm) {
        const match = schoolConfig.currentTerm.match(/\d+/);
        if (match) dynamicTerm = parseInt(match[0], 10);
      }

      // Map to state
      const map: Record<string, Assessment> = {};
      students.forEach((s) => {
        const found = existing.find(
          (a) => a.studentId === s.id && a.term === dynamicTerm,
        );
        map[s.id] = found || {
          id: `${s.id}_${selectedSubject}_${dynamicTerm}_${schoolConfig.academicYear}`,
          schoolId: schoolId || "",
          studentId: s.id,
          classId: selectedClassId,
          term: dynamicTerm as 1 | 2 | 3,
          academicYear: schoolConfig.academicYear,
          subject: selectedSubject,
          testScore: 0,
          homeworkScore: 0,
          projectScore: 0,
          examScore: 0,
          total: 0,
        };
      });
      setAssessments(map);
      setLoading(false);
    };

    loadAssessments();
  }, [
    selectedClassId,
    selectedSubject,
    students,
    schoolConfig.currentTerm,
    schoolConfig.academicYear,
    schoolId,
  ]);

  const handleChange = (
    studentId: string,
    field: keyof Assessment,
    value: string,
  ) => {
    let numValue = value === "" ? 0 : parseFloat(value);

    // Constraint: Prevent entering values higher than max
    const maxLimit = LIMITS[field as keyof typeof LIMITS];
    if (numValue > maxLimit) {
      numValue = maxLimit;
    }
    if (numValue < 0) numValue = 0;

    setAssessments((prev) => {
      const current = prev[studentId] || {};
      return {
        ...prev,
        [studentId]: { ...current, [field]: numValue },
      };
    });
  };

  const handleSave = async () => {
    if (!selectedClassId || !schoolId) return;
    setSaving(true);
    try {
      // determine dynamic term from config
      let dynamicTerm = CURRENT_TERM;
      if (schoolConfig.currentTerm) {
        const match = schoolConfig.currentTerm.match(/\d+/);
        if (match) dynamicTerm = parseInt(match[0], 10);
      }

      const promises = (Object.values(assessments) as Assessment[]).map(
        async (a) => {
          if (!a.studentId) return;

          const total = calculateTotalScore(a);

          const completeRecord = {
            ...a,
            id: a.id || Math.random().toString(36),
            schoolId,
            total,
            // Ensuring required fields exist for TS
            studentId: a.studentId!,
            classId: selectedClassId!,
            subject: selectedSubject,
            term: dynamicTerm as 1 | 2 | 3,
            academicYear: schoolConfig.academicYear,
            testScore: a.testScore || 0,
            homeworkScore: a.homeworkScore || 0,
            projectScore: a.projectScore || 0,
            examScore: a.examScore || 0,
          } as Assessment;

          return db.saveAssessment(completeRecord);
        },
      );
      await Promise.all(promises);

      // Notification logic
      const className =
        CLASSES_LIST.find((c) => c.id === selectedClassId)?.name ||
        selectedClassId;
      await db.addSystemNotification(
        `${user?.fullName || "Teacher"} updated assessments for ${className} in ${selectedSubject}.`,
        "assessment",
        schoolId,
      );

      showToast("Saved Successfully", { type: "success" });
    } catch (e) {
      console.error(e);
      showToast("Error saving data", { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  if (assignedClassIds.length === 0)
    return (
      <Layout title="Assessment">
        <div className="p-8 text-center text-slate-500">No class assigned.</div>
      </Layout>
    );

  return (
    <Layout title="Assessment Sheet">
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        {/* Controls */}
        <div className="p-6 border-b border-slate-100 bg-slate-50 flex flex-col gap-4">
          <div className="flex flex-col md:flex-row gap-4 justify-between">
            {/* Class Selector */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">
                Class
              </label>
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="p-2 border border-slate-300 rounded-md shadow-sm w-full md:w-64 bg-white text-black"
              >
                {assignedClassIds.map((id) => {
                  const c = CLASSES_LIST.find((cl) => cl.id === id);
                  return (
                    <option key={id} value={id}>
                      {c?.name}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Subject Selector */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">
                Subject
              </label>
              <select
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                className="p-2 border border-slate-300 rounded-md shadow-sm w-full md:w-64"
                disabled={subjects.length === 0}
              >
                {subjects.length === 0 && <option>Loading subjects...</option>}
                {subjects.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-slate-200 pt-4">
            <div className="hidden sm:block">
              <p className="text-sm font-medium text-slate-900">
                {schoolConfig.currentTerm} &bull; {schoolConfig.academicYear}
              </p>
            </div>
            <button
              onClick={handleSave}
              disabled={saving || !selectedSubject || !selectedClassId}
              className="flex items-center bg-emerald-600 text-white px-6 py-2 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ml-auto"
            >
              <Save size={18} className="mr-2" />
              {saving ? "Saving..." : "Save Scores"}
            </button>
          </div>
        </div>

        {/* Spreadsheet */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100 text-slate-600 font-semibold uppercase text-xs tracking-wider">
              <tr>
                <th className="px-4 py-3 sticky left-0 bg-slate-100 z-10 w-48">
                  Student Name
                </th>
                <th className="px-2 py-3 w-24 text-center">
                  Class Test
                  <br />
                  <span className="text-[10px] normal-case font-bold text-emerald-600">
                    (15)
                  </span>
                </th>
                <th className="px-2 py-3 w-24 text-center">
                  Homework
                  <br />
                  <span className="text-[10px] normal-case font-bold text-emerald-600">
                    (15)
                  </span>
                </th>
                <th className="px-2 py-3 w-24 text-center">
                  Project
                  <br />
                  <span className="text-[10px] normal-case font-bold text-emerald-600">
                    (20)
                  </span>
                </th>
                <th className="px-2 py-3 w-28 text-center border-l border-slate-200 bg-red-50/50">
                  Exam
                  <br />
                  <span className="text-[10px] normal-case font-bold text-red-600">
                    (100)
                  </span>
                </th>
                <th className="px-4 py-3 w-24 text-center bg-slate-200">
                  Total
                  <br />
                  <span className="text-[10px] normal-case">(100%)</span>
                </th>
                <th className="px-4 py-3 w-20 text-center bg-slate-200">
                  Grade
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {students.map((student) => {
                const data =
                  assessments[student.id] || ({} as Partial<Assessment>);
                const total = calculateTotalScore(data);
                const { grade, remark } = calculateGrade(total);
                const gradeColor = getGradeColor(grade);

                return (
                  <tr key={student.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800 sticky left-0 bg-white border-r border-slate-100">
                      {student.name}
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min="0"
                        max={LIMITS.testScore}
                        className="w-full text-center border border-slate-200 rounded p-1 focus:ring-2 focus:ring-emerald-500 outline-none"
                        value={data.testScore || 0}
                        onChange={(e) =>
                          handleChange(student.id, "testScore", e.target.value)
                        }
                        onFocus={(e) => e.target.select()}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min="0"
                        max={LIMITS.homeworkScore}
                        className="w-full text-center border border-slate-200 rounded p-1 focus:ring-2 focus:ring-emerald-500 outline-none"
                        value={data.homeworkScore || 0}
                        onChange={(e) =>
                          handleChange(
                            student.id,
                            "homeworkScore",
                            e.target.value,
                          )
                        }
                        onFocus={(e) => e.target.select()}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min="0"
                        max={LIMITS.projectScore}
                        className="w-full text-center border border-slate-200 rounded p-1 focus:ring-2 focus:ring-emerald-500 outline-none"
                        value={data.projectScore || 0}
                        onChange={(e) =>
                          handleChange(
                            student.id,
                            "projectScore",
                            e.target.value,
                          )
                        }
                        onFocus={(e) => e.target.select()}
                      />
                    </td>
                    <td className="px-2 py-2 border-l border-slate-200 bg-red-50/20">
                      <input
                        type="number"
                        min="0"
                        max={LIMITS.examScore}
                        className="w-full text-center border border-red-500 rounded p-1 focus:ring-2 focus:ring-red-300 outline-none font-bold text-slate-800 bg-white shadow-sm"
                        value={data.examScore || 0}
                        onChange={(e) =>
                          handleChange(student.id, "examScore", e.target.value)
                        }
                        onFocus={(e) => e.target.select()}
                      />
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-slate-800 bg-slate-50">
                      {total}
                    </td>
                    <td className="px-4 py-3 text-center bg-slate-50">
                      <span
                        className={`inline-block w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${gradeColor}`}
                      >
                        {grade}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {students.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    {selectedClassId
                      ? "No students found in this class."
                      : "Select a class above."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
};

export default AssessmentPage;
