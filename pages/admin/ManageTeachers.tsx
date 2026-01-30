import React, { useEffect, useState } from "react";
import Layout from "../../components/Layout";
import { showToast } from "../../services/toast";
import { db } from "../../services/mockDb";
import { createTeacher } from "../../services/backendApi";
import { User, UserRole } from "../../types";
import { CLASSES_LIST } from "../../constants";
import { useSchool } from "../../context/SchoolContext";

import {
  Plus,
  Trash2,
  UserPlus,
  Mail,
  AlertTriangle,
  CheckSquare,
  Square,
  Loader2,
  Copy,
  Check,
  Wrench,
  AlertCircle,
  Eye,
  EyeOff,
  Pencil,
} from "lucide-react";

// Firebase imports
import { deleteDoc, doc } from "firebase/firestore";
import { firestore } from "../../services/firebase";
import { repairUserSchoolId } from "../../services/functions";

type TeacherWithClasses = User & { assignedClassIds?: string[] };

type TeacherFormData = Partial<User> & {
  fullName?: string;
  password?: string;
  assignedClassIds?: string[];
};

const ManageTeachers = () => {
  const { school } = useSchool();
  const schoolId = school?.id || ""; // ✅ current school scope

  const [teachers, setTeachers] = useState<TeacherWithClasses[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successData, setSuccessData] = useState<{
    tempPassword?: string;
    email: string;
    fullName: string;
    adminProvidedPassword?: boolean;
  } | null>(null);

  const [copiedField, setCopiedField] = useState<string | null>(null);

  const [repairModalUid, setRepairModalUid] = useState<string | null>(null);
  const [isRepairing, setIsRepairing] = useState(false);

  const [showPassword, setShowPassword] = useState(false);

  const [showEditModal, setShowEditModal] = useState(false);
  const [editTeacher, setEditTeacher] = useState<TeacherWithClasses | null>(
    null,
  );
  const [editClasses, setEditClasses] = useState<string[]>([]);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [formData, setFormData] = useState<TeacherFormData>({
    role: UserRole.TEACHER,
    assignedClassIds: [],
  });

  const [deleteId, setDeleteId] = useState<string | null>(null);

  // ✅ Fetch only teachers for THIS school
  const fetchData = async () => {
    if (!schoolId) {
      setTeachers([]);
      return;
    }

    const users = (await db.getUsers(schoolId)) as TeacherWithClasses[];

    const scopedTeachers = users.filter((u) => u.role === UserRole.TEACHER);

    setTeachers(scopedTeachers);
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const toggleClass = (classId: string) => {
    setFormData((prev) => {
      const current = prev.assignedClassIds || [];
      if (current.includes(classId)) {
        return {
          ...prev,
          assignedClassIds: current.filter((id) => id !== classId),
        };
      }
      return { ...prev, assignedClassIds: [...current, classId] };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!schoolId) {
      showToast("School ID is not available. Please refresh and try again.", {
        type: "error",
      });
      return;
    }

    if (!formData.fullName || !formData.email) {
      showToast("Please fill in all fields (full name and email).", {
        type: "error",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // ✅ ALWAYS send schoolId to backend so teacher gets aligned
      await createTeacher({
        fullName: formData.fullName,
        email: formData.email,
        password: formData.password || undefined,
        assignedClassIds: formData.assignedClassIds || [],
        schoolId, // ✅ critical
      } as any);

      setSuccessData({
        tempPassword: formData.password || undefined,
        email: formData.email,
        fullName: formData.fullName,
        adminProvidedPassword: Boolean(formData.password),
      });
      setShowSuccessModal(true);

      setShowModal(false);
      setFormData({
        role: UserRole.TEACHER,
        assignedClassIds: [],
        email: "",
        fullName: "",
        password: "",
      });
      setShowPassword(false);

      await fetchData();
    } catch (error: any) {
      console.error("Error creating teacher:", error);
      showToast(error?.message || "Failed to create teacher.", {
        type: "error",
        duration: 7000,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const promptDelete = (id: string) => {
    setDeleteId(id);
  };

  const executeDelete = async () => {
    if (!deleteId) return;

    const teacherToDelete = teachers.find((t) => t.id === deleteId);
    if (!teacherToDelete) {
      setDeleteId(null);
      return;
    }

    // ✅ safety: ensure teacher belongs to this school
    if (teacherToDelete.schoolId !== schoolId) {
      setDeleteId(null);
      showToast("You can only delete teachers from your school.", {
        type: "error",
      });
      return;
    }

    const idToDelete = deleteId;
    setDeleteId(null);

    const previousTeachers = [...teachers];
    setTeachers((prev) => prev.filter((t) => t.id !== idToDelete));

    try {
      // Delete Firestore user profile
      await db.deleteUser(idToDelete);

      // Delete teacher attendance records (scoped)
      const teacherAttendanceRecords =
        await db.getAllTeacherAttendanceRecords(schoolId);
      const recordsToDelete = teacherAttendanceRecords.filter(
        (r: any) =>
          r.teacherId === idToDelete && r.schoolId && r.schoolId === schoolId,
      );

      const deletePromises = recordsToDelete.map((r: any) =>
        deleteDoc(doc(firestore, "teacher_attendance", r.id)),
      );

      await Promise.all(deletePromises);
    } catch (error) {
      console.error("Failed to delete teacher", error);
      setTeachers(previousTeachers);
      showToast("Failed to delete teacher profile. Please try again.", {
        type: "error",
      });
    }
  };

  const openEditModal = (teacher: TeacherWithClasses) => {
    setEditTeacher(teacher);
    setEditClasses(teacher.assignedClassIds || []);
    setShowEditModal(true);
  };

  const toggleEditClass = (classId: string) => {
    setEditClasses((prev) =>
      (prev || []).includes(classId)
        ? (prev || []).filter((id) => id !== classId)
        : [...(prev || []), classId],
    );
  };

  const handleSaveEdit = async () => {
    if (!editTeacher) return;

    if (editTeacher.schoolId !== schoolId) {
      showToast("You can only edit teachers from your school.", {
        type: "error",
      });
      return;
    }

    setIsSavingEdit(true);
    try {
      await db.updateUserAssignedClasses(editTeacher.id, editClasses);
      showToast("Teacher classes updated successfully.", { type: "success" });
      setShowEditModal(false);
      setEditTeacher(null);
      setEditClasses([]);
      await fetchData();
    } catch (error: any) {
      console.error("Error updating teacher classes:", error);
      showToast(error?.message || "Failed to update teacher classes.", {
        type: "error",
      });
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleRepairTeacher = async () => {
    if (!repairModalUid) return;

    setIsRepairing(true);
    try {
      // ✅ repair should attach this school's ID
      const result = await repairUserSchoolId({
        targetUid: repairModalUid,
        schoolId,
      } as any);

      const { message } = result.data as { message?: string };
      showToast(message || "Teacher account repaired successfully.", {
        type: "success",
      });

      setRepairModalUid(null);
      await fetchData();
    } catch (error: any) {
      console.error("Error repairing teacher:", error);
      showToast(
        error?.details || error?.message || "Failed to repair teacher account.",
        { type: "error", duration: 6000 },
      );
    } finally {
      setIsRepairing(false);
    }
  };

  return (
    <Layout title="Manage Teachers">
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center">
          <h2 className="font-semibold text-slate-800">Staff List</h2>

          <button
            onClick={() => {
              if (!schoolId) {
                showToast(
                  "School ID is not available yet. Please refresh and try again.",
                  { type: "error" },
                );
                return;
              }
              setShowModal(true);
            }}
            className="flex items-center bg-emerald-600 text-white px-4 py-2 rounded-md hover:bg-emerald-700 transition-colors text-sm font-medium"
          >
            <Plus size={16} className="mr-2" />
            Add Teacher
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-800 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-6 py-3">Name</th>
                <th className="px-6 py-3">Email</th>
                <th className="px-6 py-3">Account Status</th>
                <th className="px-6 py-3">Assigned Classes</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {teachers.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-8 text-center text-slate-400"
                  >
                    No teachers found for this school.
                  </td>
                </tr>
              ) : (
                teachers.map((teacher) => {
                  const assignedIds = teacher.assignedClassIds || [];
                  const classNames = assignedIds
                    .map((id) => CLASSES_LIST.find((c) => c.id === id)?.name)
                    .filter(Boolean);

                  const isMissingSchoolId = !teacher.schoolId;

                  return (
                    <tr
                      key={teacher.id}
                      className={`hover:bg-slate-50 ${
                        isMissingSchoolId ? "bg-red-50" : ""
                      }`}
                    >
                      <td className="px-6 py-3 font-medium text-slate-800">
                        {teacher.fullName}
                      </td>

                      <td className="px-6 py-3 flex items-center">
                        <Mail size={14} className="mr-2 text-slate-400" />
                        {teacher.email}
                      </td>

                      <td className="px-6 py-3">
                        {isMissingSchoolId ? (
                          <div className="flex items-center gap-2">
                            <AlertCircle size={16} className="text-red-600" />
                            <span className="text-red-700 font-semibold text-xs">
                              Missing schoolId
                            </span>
                          </div>
                        ) : (
                          <span className="text-emerald-700 text-xs font-medium">
                            ✓ Complete
                          </span>
                        )}
                      </td>

                      <td className="px-6 py-3">
                        <div className="flex flex-wrap gap-1">
                          {classNames.length > 0 ? (
                            classNames.map((name) => (
                              <span
                                key={name}
                                className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700"
                              >
                                {name}
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-400 italic text-xs">
                              No classes
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-3 text-right flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEditModal(teacher)}
                          className="text-blue-600 hover:text-blue-800 p-2 hover:bg-blue-50 rounded-full transition-colors"
                          title="Edit Assigned Classes"
                        >
                          <Pencil size={16} className="pointer-events-none" />
                        </button>

                        {isMissingSchoolId && (
                          <button
                            onClick={() => setRepairModalUid(teacher.id)}
                            className="text-orange-600 hover:text-orange-800 p-2 hover:bg-orange-50 rounded-full transition-colors"
                            title="Repair Account"
                          >
                            <Wrench size={16} className="pointer-events-none" />
                          </button>
                        )}

                        <button
                          onClick={() => promptDelete(teacher.id)}
                          className="text-red-500 hover:text-red-700 p-2 hover:bg-red-50 rounded-full transition-colors"
                          title="Remove Teacher"
                        >
                          <Trash2 size={16} className="pointer-events-none" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg max-w-sm w-full p-6 shadow-xl transform transition-all">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
                <AlertTriangle className="text-red-600 w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">
                Remove Teacher?
              </h3>
              <p className="text-sm text-slate-500 mb-6">
                This removes their profile and disables their login account from
                the system.
              </p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => setDeleteId(null)}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={executeDelete}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors shadow-sm"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4 flex items-center text-slate-900 border-b pb-2">
              <UserPlus className="mr-2 text-emerald-600" size={20} /> Add New
              Teacher
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4 pt-2">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none placeholder-slate-400"
                  value={formData.fullName || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, fullName: e.target.value })
                  }
                  placeholder="e.g. Mr. John Doe"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none placeholder-slate-400"
                  value={formData.email || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  placeholder="teacher@school.com"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Password (Optional)
                </label>

                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    className="w-full border border-slate-300 p-2.5 pr-10 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none placeholder-slate-400"
                    value={formData.password || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, password: e.target.value })
                    }
                    placeholder="Leave empty to send password reset link"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 transition-colors"
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <p className="text-xs text-slate-500 bg-blue-50 p-3 rounded-lg border border-blue-200">
                💡 <strong>Option 1:</strong> Leave password empty - a reset
                link will be sent to email. <strong>Option 2:</strong> Set a
                password above - teacher can log in immediately with it.
              </p>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Assign Classes
                </label>

                <div className="border border-slate-300 rounded-lg p-3 max-h-56 overflow-y-auto bg-slate-50">
                  <div className="grid grid-cols-2 gap-3">
                    {CLASSES_LIST.map((c) => {
                      const isSelected = formData.assignedClassIds?.includes(
                        c.id,
                      );

                      return (
                        <button
                          type="button"
                          key={c.id}
                          onClick={() => toggleClass(c.id)}
                          className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium border transition-all duration-200 ${
                            isSelected
                              ? "bg-emerald-600 border-emerald-600 text-white shadow-md transform scale-[1.02]"
                              : "bg-white border-slate-200 text-slate-600 hover:border-emerald-300 hover:shadow-sm"
                          }`}
                        >
                          <span>{c.name}</span>
                          {isSelected ? (
                            <CheckSquare
                              size={16}
                              className="text-white ml-2"
                            />
                          ) : (
                            <Square size={16} className="text-slate-300 ml-2" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <p className="text-[10px] text-slate-400 mt-2">
                  Click classes to select/deselect them.
                </p>
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium shadow-sm transition-colors disabled:opacity-70"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={16} className="mr-2 animate-spin" />{" "}
                      Creating...
                    </>
                  ) : (
                    "Create Teacher"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Repair Teacher Modal */}
      {repairModalUid && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg max-w-sm w-full p-6 shadow-xl transform transition-all">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mb-4">
                <Wrench className="text-orange-600 w-6 h-6" />
              </div>

              <h3 className="text-lg font-bold text-slate-900 mb-2">
                Repair Teacher Account?
              </h3>

              <p className="text-sm text-slate-500 mb-2">
                This teacher's account is missing the required schoolId field.
              </p>

              <p className="text-sm text-slate-500 mb-6">
                This action will add your school's ID to their profile so they
                can log in.
              </p>

              <div className="bg-orange-50 border border-orange-200 rounded p-3 mb-6 w-full">
                <p className="text-xs text-orange-700">
                  After repair, the teacher will be able to log in and access
                  the system.
                </p>
              </div>

              <div className="flex gap-3 w-full">
                <button
                  onClick={() => setRepairModalUid(null)}
                  disabled={isRepairing}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  onClick={handleRepairTeacher}
                  disabled={isRepairing}
                  className="flex-1 flex items-center justify-center px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-medium transition-colors shadow-sm disabled:opacity-70"
                >
                  {isRepairing ? (
                    <>
                      <Loader2 size={16} className="mr-2 animate-spin" />
                      Repairing...
                    </>
                  ) : (
                    "Repair Account"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccessModal && successData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-xl">
            <div className="flex flex-col items-center text-center mb-4">
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
                <Check className="text-emerald-600 w-6 h-6" />
              </div>

              <h3 className="text-lg font-bold text-slate-900 mb-2">
                Teacher Created Successfully!
              </h3>

              <p className="text-sm text-slate-500 mb-4">
                Share these credentials with the teacher.
              </p>
            </div>

            <div className="bg-slate-50 rounded-lg p-4 space-y-4 mb-4 border border-slate-200">
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1 uppercase">
                  Email
                </p>

                <div className="flex items-center justify-between bg-white p-3 rounded border border-slate-200">
                  <code className="text-sm font-mono text-slate-700">
                    {successData.email}
                  </code>

                  <button
                    onClick={() => handleCopy(successData.email, "email")}
                    className="text-slate-400 hover:text-slate-600 transition-colors"
                    title="Copy to clipboard"
                  >
                    {copiedField === "email" ? (
                      <Check size={16} className="text-emerald-600" />
                    ) : (
                      <Copy size={16} />
                    )}
                  </button>
                </div>
              </div>

              {successData.tempPassword && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-1 uppercase">
                    {successData.adminProvidedPassword
                      ? "Password"
                      : "Temporary Password"}
                  </p>

                  <div className="flex items-center justify-between bg-white p-3 rounded border border-slate-200">
                    <code className="text-sm font-mono text-slate-700">
                      {successData.tempPassword}
                    </code>

                    <button
                      onClick={() =>
                        handleCopy(successData.tempPassword!, "password")
                      }
                      className="text-slate-400 hover:text-slate-600 transition-colors"
                      title="Copy to clipboard"
                    >
                      {copiedField === "password" ? (
                        <Check size={16} className="text-emerald-600" />
                      ) : (
                        <Copy size={16} />
                      )}
                    </button>
                  </div>

                  {!successData.adminProvidedPassword && (
                    <p className="text-xs text-slate-500 mt-2">
                      ⚠️ Teacher must change password on first login.
                    </p>
                  )}
                </div>
              )}

              {successData.adminProvidedPassword ? (
                <div className="bg-green-50 border border-green-200 rounded p-3">
                  <p className="text-xs text-green-700">
                    ✅ Teacher can log in immediately with the password above.
                  </p>
                </div>
              ) : (
                <div className="bg-blue-50 border border-blue-200 rounded p-3">
                  <p className="text-xs text-blue-700">
                    📧 A password reset link has been sent to their email inbox.
                  </p>
                </div>
              )}
            </div>

            <button
              onClick={() => setShowSuccessModal(false)}
              className="w-full px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Edit Classes Modal */}
      {showEditModal && editTeacher && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-xl">
            <h3 className="text-lg font-bold mb-4 text-slate-900 border-b pb-2">
              Assign Classes
            </h3>

            <p className="text-sm text-slate-500 mb-4">
              Assign classes to {editTeacher.fullName}.
            </p>

            <div className="border border-slate-300 rounded-lg p-3 max-h-56 overflow-y-auto bg-slate-50 mb-4">
              <div className="grid grid-cols-2 gap-3">
                {CLASSES_LIST.map((c) => {
                  const isSelected = (editClasses || []).includes(c.id);

                  return (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() => toggleEditClass(c.id)}
                      className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium border transition-all duration-200 ${
                        isSelected
                          ? "bg-emerald-600 border-emerald-600 text-white shadow-md transform scale-[1.02]"
                          : "bg-white border-slate-200 text-slate-600 hover:border-emerald-300 hover:shadow-sm"
                      }`}
                    >
                      <span>{c.name}</span>
                      {isSelected ? (
                        <CheckSquare size={16} className="text-white ml-2" />
                      ) : (
                        <Square size={16} className="text-slate-300 ml-2" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                disabled={isSavingEdit}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors disabled:opacity-60"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={isSavingEdit}
                className="flex items-center px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium shadow-sm transition-colors disabled:opacity-60"
              >
                {isSavingEdit ? (
                  <>
                    <Loader2 size={16} className="mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default ManageTeachers;
