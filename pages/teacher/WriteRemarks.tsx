import React, { useState, useEffect } from "react";
import Layout from "../../components/Layout";
import { useAuth } from "../../context/AuthContext";
import { db } from "../../services/mockDb";
import { Student, StudentRemark } from "../../types";
import { CLASSES_LIST, ACADEMIC_YEAR, CURRENT_TERM } from "../../constants";
import { Save, MessageSquare, Sparkles } from "lucide-react";
import UserAvatar from "../../components/UserAvatar";
import { logActivity } from "../../services/activityLog";

const isPermissionDeniedError = (error: unknown) => {
  const message = String(
    (error as any)?.code || (error as any)?.message || error || "",
  );
  return (
    message.includes("permission-denied") ||
    message.includes("Missing or insufficient permissions")
  );
};

const REMARK_SUGGESTIONS = [
  "An outstanding performer with excellent academic progress.",
  "Shows great potential and maintains good conduct in class.",
  "Consistent effort and improvement throughout the term.",
  "Active participant in class activities and assignments.",
  "Demonstrates good leadership qualities among peers.",
  "Maintains excellent attendance and punctuality.",
  "Shows remarkable improvement in academic performance.",
  "A disciplined student who follows school rules diligently.",
  "Excellent interpersonal skills and teamwork abilities.",
  "Creative and innovative in approaching class tasks.",
];

const WriteRemarks = () => {
  const { user } = useAuth();
  const assignedClassIds = (user?.assignedClassIds || []).sort((a, b) => {
    const indexA = CLASSES_LIST.findIndex((c) => c.id === a);
    const indexB = CLASSES_LIST.findIndex((c) => c.id === b);
    return indexA - indexB;
  });
  const schoolId = user?.schoolId || null;
  const [selectedClassId, setSelectedClassId] = useState<string>("");

  const [students, setStudents] = useState<Student[]>([]);
  const [remarksData, setRemarksData] = useState<
    Record<
      string,
      {
        remark: string;
        behaviorTag: "Excellent" | "Good" | "Needs Improvement" | "";
      }
    >
  >({});
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
        let existingRemarks: StudentRemark[] = [];
        try {
          existingRemarks = await db.getStudentRemarks(
            schoolId,
            selectedClassId,
          );
        } catch (remarksError) {
          if (isPermissionDeniedError(remarksError)) {
            console.debug("Student remarks unavailable: permission denied");
          } else {
            throw remarksError;
          }
        }

        // Determine dynamic term
        let dynamicTerm = CURRENT_TERM;
        const config = await db.getSchoolConfig(schoolId);
        if (config.currentTerm) {
          const match = config.currentTerm.match(/\d+/);
          if (match) dynamicTerm = parseInt(match[0], 10);
        }
        const currentAcademicYear = config.academicYear || ACADEMIC_YEAR;

        const data: Record<
          string,
          {
            remark: string;
            behaviorTag: "Excellent" | "Good" | "Needs Improvement" | "";
          }
        > = {};

        studentsList.forEach((s) => {
          const found = existingRemarks.find(
            (r) =>
              r.studentId === s.id &&
              r.term === dynamicTerm &&
              r.academicYear === currentAcademicYear,
          );
          data[s.id] = {
            remark: found?.remark || "",
            behaviorTag: (found?.behaviorTag as
              | "Excellent"
              | "Good"
              | "Needs Improvement"
              | "") || "",
          };
        });

        setRemarksData(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [selectedClassId, schoolId]);

  const handleRemarkChange = (studentId: string, value: string) => {
    setRemarksData((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        remark: value,
      },
    }));
  };

  const handleBehaviorTagChange = (
    studentId: string,
    value: "Excellent" | "Good" | "Needs Improvement" | "",
  ) => {
    setRemarksData((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        behaviorTag: value,
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
      const currentAcademicYear = config.academicYear || ACADEMIC_YEAR;

      const promises = Object.entries(remarksData).map(
        async ([studentId, data]) => {
          const text = data.remark;
          if (!text.trim()) return;

          const remark: StudentRemark = {
            id: `${studentId}_${selectedClassId}_${dynamicTerm}_${currentAcademicYear}`,
            studentId,
            classId: selectedClassId,
            term: dynamicTerm as 1 | 2 | 3,
            academicYear: currentAcademicYear,
            schoolId,
            remark: text,
            behaviorTag: data.behaviorTag || "Good",
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
      try {
        await db.addSystemNotification(
          `${user?.fullName} updated remarks for ${className}.`,
          "assessment",
          schoolId,
        );
      } catch (notificationError) {
        console.debug("Remarks notification skipped", notificationError);
      }

      setMessage("Remarks saved successfully!");
      setTimeout(() => setMessage(""), 3000);
      await logActivity({
        schoolId,
        actorUid: user?.id || null,
        actorRole: user?.role || null,
        eventType: "remarks_saved",
        entityId: selectedClassId,
        meta: {
          status: "success",
          module: "Remarks",
          classId: selectedClassId,
          term: config.currentTerm,
          academicYear: config.academicYear,
          actorName: user?.fullName || "",
        },
      });
    } catch (err) {
      console.error(err);
      setMessage("Error saving remarks");
      setTimeout(() => setMessage(""), 3000);
      await logActivity({
        schoolId,
        actorUid: user?.id || null,
        actorRole: user?.role || null,
        eventType: "remarks_save_failed",
        entityId: selectedClassId,
        meta: {
          status: "failed",
          module: "Remarks",
          classId: selectedClassId,
          error: (err as any)?.message || "Unknown error",
          actorName: user?.fullName || "",
        },
      });
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
                  <UserAvatar user={student} size="md" className="mr-3" />
                  <div>
                    <p className="font-medium text-slate-800">{student.name}</p>
                    <p className="text-xs text-slate-400">
                      {CLASSES_LIST.find((c) => c.id === student.classId)?.name}
                    </p>
                  </div>
                </div>
                <div className="mb-2">
                  <label className="block text-sm font-medium mb-1">
                    Behavior Tag
                  </label>
                  <select
                    value={remarksData[student.id]?.behaviorTag || ""}
                    onChange={(e) =>
                      handleBehaviorTagChange(
                        student.id,
                        e.target.value as
                          | "Excellent"
                          | "Good"
                          | "Needs Improvement"
                          | "",
                      )
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white text-black"
                  >
                    <option value="">Select Behavior</option>
                    <option value="Excellent">Excellent</option>
                    <option value="Good">Good</option>
                    <option value="Needs Improvement">
                      Needs Improvement
                    </option>
                  </select>
                </div>
                <div className="mb-2">
                  <label className="block text-sm font-medium mb-1 flex items-center gap-2">
                    <Sparkles size={14} className="text-purple-600" />
                    Remark
                  </label>
                  <textarea
                    value={remarksData[student.id]?.remark || ""}
                    onChange={(e) =>
                      handleRemarkChange(student.id, e.target.value)
                    }
                    placeholder="Write remark or select from suggestions below..."
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                    rows={3}
                  />
                  {/* Remark Suggestions */}
                  <div className="mt-2">
                    <p className="text-xs text-slate-500 mb-2">
                      Tap to insert suggestion:
                    </p>
                    <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto p-1 bg-slate-50 rounded-lg">
                      {REMARK_SUGGESTIONS.map((suggestion, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() =>
                            handleRemarkChange(student.id, suggestion)
                          }
                          className="max-w-full truncate rounded-full border border-purple-200 bg-purple-50 px-2 py-1 text-left text-xs text-purple-700 transition-colors hover:bg-purple-100"
                          title={suggestion}
                        >
                          {suggestion.length > 50
                            ? suggestion.substring(0, 50) + "..."
                            : suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
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
