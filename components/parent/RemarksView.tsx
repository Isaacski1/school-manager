import React, { useState, useEffect, useMemo } from "react";
import { db } from "../../services/mockDb";
import { StudentRemark, AdminRemark, Student, Assessment } from "../../types";
import { MessageSquare, User, Calendar, Tag, AlertCircle, CheckCircle } from "lucide-react";

interface RemarksViewProps {
  student: Student;
  onClose?: () => void;
}

const RemarksView: React.FC<RemarksViewProps> = ({ student, onClose }) => {
  const [remarks, setRemarks] = useState<StudentRemark[]>([]);
  const [adminRemarks, setAdminRemarks] = useState<AdminRemark[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTerm, setSelectedTerm] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const stored = sessionStorage.getItem(`remarks-selected-term-${student.id}`);
      if (stored) return stored;
    }
    return "all";
  });

  useEffect(() => {
    sessionStorage.setItem(`remarks-selected-term-${student.id}`, selectedTerm);
  }, [selectedTerm, student.id]);

  useEffect(() => {
    async function fetchRemarks() {
      if (!student.schoolId || !student.id) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // Fetch teacher remarks for the student
        const teacherRemarks = await db.getStudentRemarksByStudent(
          student.schoolId,
          student.id
        );
        setRemarks(teacherRemarks);

        // Fetch admin remarks for the student
        const adminData = await db.getAdminRemarks(student.schoolId, student.id);
        setAdminRemarks(adminData);

      } catch (error) {
        console.error("Error fetching remarks:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchRemarks();
  }, [student.schoolId, student.id]);

  const allRemarks = useMemo(() => {
    const combined = [
      ...remarks.map(r => ({
        ...r,
        type: "teacher" as const,
        date: r.dateCreated,
      })),
      ...adminRemarks.map(r => ({
        ...r,
        type: "admin" as const,
        date: r.dateCreated,
      })),
    ];

    return combined.sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return dateB.getTime() - dateA.getTime(); // Most recent first
    });
  }, [remarks, adminRemarks]);

  const filteredRemarks = useMemo(() => {
    if (selectedTerm === "all") return allRemarks;
    const termNum = parseInt(selectedTerm);
    return allRemarks.filter(r => r.term === termNum);
  }, [allRemarks, selectedTerm]);

  const getBehaviorTagColor = (tag?: string) => {
    switch (tag) {
      case "Excellent":
        return "bg-green-100 text-green-700 border-green-300";
      case "Good":
        return "bg-blue-100 text-blue-700 border-blue-300";
      case "Needs Improvement":
        return "bg-yellow-100 text-yellow-700 border-yellow-300";
      default:
        return "bg-gray-100 text-gray-600 border-gray-300";
    }
  };

  if (loading) {
    return (
      <div className={onClose ? "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" : "flex items-center justify-center p-12 bg-white rounded-2xl border border-slate-200"}>
        <div className={onClose ? "bg-white rounded-2xl max-w-2xl w-full p-8" : ""}>
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={onClose ? "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" : "h-full flex flex-col"}>
      <div className={onClose ? "bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" : "bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col flex-1"}>
        {/* Header */}
        {onClose && (
          <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
            <div>
              <h2 className="text-xl font-bold text-slate-800">Remarks & Feedback</h2>
              <p className="text-sm text-slate-500">{student.name} - Class {student.classId}</p>
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

        <div className="p-6 space-y-6">
          {/* Term Filter */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-600">Filter by term:</span>
            <div className="flex flex-wrap gap-2">
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

          {/* Remarks List */}
          {filteredRemarks.length === 0 ? (
            <div className="bg-slate-50 rounded-xl p-8 text-center">
              <MessageSquare size={48} className="text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">No remarks found for this student.</p>
              <p className="text-sm text-slate-400 mt-2">
                Teacher and admin remarks will appear here when available.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredRemarks.map((remark, index) => (
                <div key={index} className="border border-slate-200 rounded-xl overflow-hidden">
                  {/* Remark Header */}
                  <div className={`px-4 sm:px-5 py-3 border-b border-slate-200 flex flex-wrap items-start sm:items-center justify-between gap-2 sm:gap-0 ${
                    remark.type === "teacher" ? "bg-blue-50" : "bg-purple-50"
                  }`}>
                    <div className="flex items-center gap-2 sm:gap-3">
                      {remark.type === "teacher" ? (
                        <User size={18} className="text-blue-600" />
                      ) : (
                        <AlertCircle size={18} className="text-purple-600" />
                      )}
                      <div>
                        <h3 className="font-semibold text-slate-800">
                          {remark.type === "teacher" ? "Teacher's Remark" : "Admin Remark"}
                        </h3>
                        <p className="text-xs text-slate-500">
                          Term {remark.term} • {remark.academicYear}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-slate-500 whitespace-nowrap ml-7 sm:ml-0 mt-1 sm:mt-0">
                      {new Date(remark.date).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Remark Content */}
                  <div className="p-5">
                    <p className="text-slate-700 leading-relaxed">{remark.remark}</p>

                    {/* Behavior Tag (only for teacher remarks) */}
                    {'behaviorTag' in remark && remark.behaviorTag && (
                      <div className="mt-4">
                        <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${getBehaviorTagColor(remark.behaviorTag)}`}>
                          {remark.behaviorTag === "Excellent" && <CheckCircle size={14} />}
                          {remark.behaviorTag}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Summary Stats */}
          {filteredRemarks.length > 0 && (
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Summary</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-slate-800">
                    {filteredRemarks.filter(r => r.type === "teacher").length}
                  </p>
                  <p className="text-xs text-slate-500">Teacher Remarks</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-slate-800">
                    {filteredRemarks.filter(r => r.type === "admin").length}
                  </p>
                  <p className="text-xs text-slate-500">Admin Remarks</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-slate-800">
                    {filteredRemarks.filter(r => 'behaviorTag' in r && r.behaviorTag === "Excellent").length}
                  </p>
                  <p className="text-xs text-slate-500">Excellent Ratings</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RemarksView;
