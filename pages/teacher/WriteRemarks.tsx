import React, { useState, useEffect } from "react";
import Layout from "../../components/Layout";
import { useAuth } from "../../context/AuthContext";
import { db } from "../../services/mockDb";
import { Student, StudentRemark } from "../../types";
import { CLASSES_LIST, ACADEMIC_YEAR, CURRENT_TERM } from "../../constants";
import { Save, MessageSquare } from "lucide-react";

const WriteRemarks = () => {
  const { user } = useAuth();
  const assignedClassIds = user?.assignedClassIds || [];
  const schoolId = user?.schoolId || null;
  const [selectedClassId, setSelectedClassId] = useState<string>("");

  const [students, setStudents] = useState<Student[]>([]);
  const [remarks, setRemarks] = useState<Record<string, string>>({});
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

        // Load existing remarks
        const existingRemarks = await db.getStudentRemarks(
          schoolId,
          selectedClassId,
        );
        const remarksMap: Record<string, string> = {};

        // Determine dynamic term
        let dynamicTerm = CURRENT_TERM;
        const config = await db.getSchoolConfig(schoolId);
        if (config.currentTerm) {
          const match = config.currentTerm.match(/\d+/);
          if (match) dynamicTerm = parseInt(match[0], 10);
        }

        studentsList.forEach((s) => {
          const found = existingRemarks.find(
            (r) => r.studentId === s.id && r.term === dynamicTerm,
          );
          remarksMap[s.id] = found?.remark || "";
        });

        setRemarks(remarksMap);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [selectedClassId, schoolId]);

  const handleRemarkChange = (studentId: string, value: string) => {
    setRemarks((prev) => ({ ...prev, [studentId]: value }));
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

      const promises = Object.entries(remarks).map(
        async ([studentId, remarkText]) => {
          const text = remarkText as string;
          if (!text.trim()) return;

          const remark: StudentRemark = {
            id: `${studentId}_${selectedClassId}_${dynamicTerm}_${ACADEMIC_YEAR}`,
            studentId,
            classId: selectedClassId,
            term: dynamicTerm as 1 | 2 | 3,
            academicYear: ACADEMIC_YEAR,
            schoolId,
            remark: text,
            behaviorTag: "Good",
            teacherId: user?.id || "",
            dateCreated: new Date().toISOString().split("T")[0],
          };

          await db.saveStudentRemark(remark);
        },
      );

      await Promise.all(promises);

      // Notification logic
      const className =
        CLASSES_LIST.find((c) => c.id === selectedClassId)?.name ||
        selectedClassId;
      await db.addSystemNotification(
        `${user?.fullName} updated remarks for ${className}.`,
        "assessment",
        schoolId,
      );

      setMessage("Remarks saved successfully!");
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      console.error(err);
      setMessage("Error saving remarks");
      setTimeout(() => setMessage(""), 3000);
    } finally {
      setSaving(false);
    }
  };

  if (assignedClassIds.length === 0) {
    return (
      <Layout title="Write Remarks">
        <div className="p-8 text-center text-slate-500">
          You are not assigned to any class. Contact Admin.
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Write Remarks">
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 max-w-4xl mx-auto">
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
                {saving ? "Saving..." : "Save Remarks"}
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

        {/* Remarks List */}
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-slate-500">Loading...</div>
          ) : (
            students.map((student) => (
              <div key={student.id} className="p-4 border-b last:border-b-0">
                <div className="flex items-center mb-2">
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-sm font-bold text-slate-600 mr-3">
                    {student.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-medium text-slate-800">{student.name}</p>
                    <p className="text-xs text-slate-400">
                      {CLASSES_LIST.find((c) => c.id === student.classId)?.name}
                    </p>
                  </div>
                </div>
                <textarea
                  value={remarks[student.id] || ""}
                  onChange={(e) =>
                    handleRemarkChange(student.id, e.target.value)
                  }
                  placeholder="Write remarks for this student..."
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                  rows={3}
                />
              </div>
            ))
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

export default WriteRemarks;
