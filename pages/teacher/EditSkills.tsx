import React, { useState, useEffect } from "react";
import Layout from "../../components/Layout";
import { useAuth } from "../../context/AuthContext";
import { db } from "../../services/mockDb";
import { Student, StudentSkills } from "../../types";
import { CLASSES_LIST, ACADEMIC_YEAR, CURRENT_TERM } from "../../constants";
import { Save, Edit } from "lucide-react";

const skillOptions = [
  "Excellent",
  "Very Good",
  "Good",
  "Fair",
  "Poor",
] as const;

const EditSkills = () => {
  const { user } = useAuth();
  const assignedClassIds = (user as any)?.assignedClassIds || [];
  const schoolId = user?.schoolId || null;
  const [selectedClassId, setSelectedClassId] = useState<string>("");

  const [students, setStudents] = useState<Student[]>([]);
  const [skills, setSkills] = useState<Record<string, StudentSkills>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  // Initialize selected class
  useEffect(() => {
    if (assignedClassIds.length > 0 && !selectedClassId) {
      setSelectedClassId(assignedClassIds[0]);
    }
  }, [assignedClassIds]);

  useEffect(() => {
    if (!selectedClassId || !schoolId) return;

    const loadData = async () => {
      setLoading(true);
      try {
        const studentsList = await db.getStudents(schoolId, selectedClassId);
        setStudents(studentsList);

        // Load existing skills
        const existingSkills = await db.getStudentSkills(
          schoolId,
          selectedClassId,
        );
        const skillsMap: Record<string, StudentSkills> = {};

        // Determine dynamic term
        let dynamicTerm = CURRENT_TERM;
        const config = await db.getSchoolConfig(schoolId);
        if (config.currentTerm) {
          const match = config.currentTerm.match(/\d+/);
          if (match) dynamicTerm = parseInt(match[0], 10);
        }

        studentsList.forEach((s) => {
          const found = existingSkills.find(
            (sk) => sk.studentId === s.id && sk.term === dynamicTerm,
          );
          if (found) {
            skillsMap[s.id] = found;
          } else {
            // Default skills for new entry
            skillsMap[s.id] = {
              id: `${s.id}_${selectedClassId}_${dynamicTerm}_${ACADEMIC_YEAR}`,
              studentId: s.id,
              classId: selectedClassId,
              term: dynamicTerm as 1 | 2 | 3,
              academicYear: ACADEMIC_YEAR,
              schoolId: schoolId || config?.schoolId || "",
              punctuality: "Good",
              neatness: "Good",
              conduct: "Good",
              attitudeToWork: "Good",
              classParticipation: "Good",
              homeworkCompletion: "Good",
            };
          }
        });

        setSkills(skillsMap);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [selectedClassId, schoolId]);

  const handleSkillChange = (
    studentId: string,
    field: keyof StudentSkills,
    value: string,
  ) => {
    setSkills((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [field]: value,
      },
    }));
  };

  const handleSave = async () => {
    if (!selectedClassId || !schoolId) return;
    setSaving(true);

    try {
      const config = await db.getSchoolConfig(schoolId);

      // Determine dynamic term
      let dynamicTerm = CURRENT_TERM;
      if (config.currentTerm) {
        const match = config.currentTerm.match(/\d+/);
        if (match) dynamicTerm = parseInt(match[0], 10);
      }

      const promises = Object.values(skills).map(async (skillData) => {
        await db.saveStudentSkills(skillData as StudentSkills);
      });

      await Promise.all(promises);

      // Notification logic
      const className =
        CLASSES_LIST.find((c) => c.id === selectedClassId)?.name ||
        selectedClassId;
      await db.addSystemNotification(
        `${user?.fullName || "Teacher"} updated skills for ${className}.`,
        "assessment",
        schoolId,
      );

      setMessage("Skills saved successfully!");
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      console.error(err);
      setMessage("Error saving skills");
      setTimeout(() => setMessage(""), 3000);
    } finally {
      setSaving(false);
    }
  };

  if (assignedClassIds.length === 0) {
    return (
      <Layout title="Edit Skills">
        <div className="p-8 text-center text-slate-500">
          You are not assigned to any class. Contact Admin.
        </div>
      </Layout>
    );
  }

  const skillFields: { key: keyof StudentSkills; label: string }[] = [
    { key: "punctuality", label: "Punctuality" },
    { key: "neatness", label: "Neatness" },
    { key: "conduct", label: "Conduct" },
    { key: "attitudeToWork", label: "Attitude to Work" },
    { key: "classParticipation", label: "Class Participation" },
    { key: "homeworkCompletion", label: "Homework Completion" },
  ];

  return (
    <Layout title="Edit Skills">
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 max-w-6xl mx-auto">
        {/* Header Controls */}
        <div className="flex flex-col gap-6 mb-6">
          <div className="flex flex-col sm:flex-row gap-4 justify-between">
            {/* Class Selector */}
            <div className="w-full sm:w-auto">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Select Class
              </label>
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="w-full sm:w-64 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white text-black"
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

            {/* Save Button */}
            <div className="flex items-end">
              <button
                onClick={handleSave}
                disabled={saving || !selectedClassId}
                className="flex items-center bg-emerald-600 text-white px-6 py-2.5 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 font-medium shadow-sm"
              >
                <Save size={18} className="mr-2" />
                {saving ? "Saving..." : "Save Skills"}
              </button>
            </div>
          </div>

          {message && (
            <div
              className={`p-3 rounded text-center text-sm ${message.includes("Error") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}
            >
              {message}
            </div>
          )}
        </div>

        {/* Skills Table */}
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          {loading ? (
            <div className="p-8 text-center text-slate-500">Loading...</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-slate-600 font-semibold">
                <tr>
                  <th className="px-4 py-3 text-left w-48">Student Name</th>
                  {skillFields.map((field) => (
                    <th key={field.key} className="px-2 py-3 text-center">
                      {field.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.map((student) => (
                  <tr key={student.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">
                      <div className="flex items-center">
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-sm font-bold text-slate-600 mr-3">
                          {student.name.charAt(0)}
                        </div>
                        {student.name}
                      </div>
                    </td>
                    {skillFields.map((field) => (
                      <td key={field.key} className="px-2 py-3">
                        <select
                          value={skills[student.id]?.[field.key] || "Good"}
                          onChange={(e) =>
                            handleSkillChange(
                              student.id,
                              field.key,
                              e.target.value,
                            )
                          }
                          className="w-full px-2 py-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white text-center"
                        >
                          {skillOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {students.length === 0 && (
            <div className="p-8 text-center text-slate-500">
              {selectedClassId
                ? "No students found in this class."
                : "Select a class to view students."}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default EditSkills;
