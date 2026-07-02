import React, { useEffect, useState } from "react";
import Layout from "../../components/Layout";
import UserAvatar from "../../components/UserAvatar";
import { showToast } from "../../services/toast";
import { db } from "../../services/mockDb";
import { createTeacher } from "../../services/backendApi";
import { User, UserRole } from "../../types";
import { useSchool } from "../../context/SchoolContext";
import { useSchoolClasses } from "../../hooks/useSchoolClasses";
import { useAuth } from "../../context/AuthContext";
import { logActivity } from "../../services/activityLog";

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
  Edit,
  BookOpen,
} from "lucide-react";

// Firebase imports
import { deleteDoc, doc } from "firebase/firestore";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth, firestore } from "../../services/firebase";
import { repairUserSchoolId } from "../../services/functions";

type TeacherWithClasses = User & { assignedClassIds?: string[] };

type TeacherFormData = Partial<User> & {
  fullName?: string;
  password?: string;
  assignedClassIds?: string[];
};

const ManageTeachers = () => {
  const { school } = useSchool();
  const { user } = useAuth();
  const schoolId = school?.id || ""; // ✅ current school scope
  const { classes: availableClasses } = useSchoolClasses();

  const [teachers, setTeachers] = useState<TeacherWithClasses[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successData, setSuccessData] = useState<{
    tempPassword?: string;
    email: string;
    fullName: string;
    adminProvidedPassword?: boolean;
    resetEmailSent?: boolean;
    resetEmailError?: string;
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

  const openCreateTeacherModal = () => {
    if (!schoolId) {
      showToast(
        "School ID is not available yet. Please refresh and try again.",
        { type: "error" },
      );
      return;
    }

    setFormData({
      role: UserRole.TEACHER,
      fullName: "",
      email: "",
      password: "",
      assignedClassIds: [],
    });
    setShowPassword(false);
    setShowModal(true);
  };

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

  const normalizeEmail = (value: string) =>
    String(value || "")
      .trim()
      .toLowerCase();

  const wait = (ms: number) =>
    new Promise((resolve) => window.setTimeout(resolve, ms));

  const sendTeacherSetupEmail = async (email: string) => {
    const normalizedEmail = normalizeEmail(email);
    let lastError: any = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await sendPasswordResetEmail(auth, normalizedEmail);
        return;
      } catch (error: any) {
        lastError = error;
        const shouldRetry = error?.code === "auth/user-not-found";
        if (!shouldRetry || attempt === 2) {
          throw error;
        }
        await wait(1000 * (attempt + 1));
      }
    }

    throw lastError || new Error("Failed to send password setup email.");
  };

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
    const normalizedEmail = normalizeEmail(formData.email || "");

    if (!schoolId) {
      showToast("School ID is not available. Please refresh and try again.", {
        type: "error",
      });
      return;
    }

    if (!formData.fullName || !normalizedEmail) {
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
        email: normalizedEmail,
        password: formData.password || undefined,
        assignedClassIds: formData.assignedClassIds || [],
        schoolId, // ✅ critical
      } as any);

      let resetEmailSent = false;
      let resetEmailError = "";
      if (!formData.password) {
        try {
          await sendTeacherSetupEmail(normalizedEmail);
          resetEmailSent = true;
        } catch (error: any) {
          console.error("Failed to send teacher setup email:", error);
          resetEmailError =
            error?.code === "auth/invalid-email"
              ? "The teacher account was created, but Firebase rejected the email address for password reset delivery."
              : error?.message ||
                "The teacher account was created, but the password setup email could not be sent automatically.";

          showToast(
            "Teacher account created, but the password setup email could not be sent automatically. The teacher can use Forgot Password on the login page.",
            {
              type: "error",
              duration: 9000,
            },
          );
        }
      }

      setSuccessData({
        tempPassword: formData.password || undefined,
        email: normalizedEmail,
        fullName: formData.fullName,
        adminProvidedPassword: Boolean(formData.password),
        resetEmailSent,
        resetEmailError,
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

      await logActivity({
        schoolId,
        actorUid: user?.id || null,
        actorRole: user?.role || null,
        eventType: "teacher_created",
        entityId: normalizedEmail,
        meta: {
          status: "success",
          module: "Teachers",
          teacherName: formData.fullName || "",
          email: normalizedEmail,
          assignedClasses: formData.assignedClassIds || [],
          passwordSetup:
            formData.password
              ? "admin_password"
              : resetEmailSent
                ? "reset_email_sent"
                : "reset_email_failed",
          actorName: user?.fullName || "",
        },
      });

      await fetchData();
    } catch (error: any) {
      console.error("Error creating teacher:", error);
      showToast(error?.message || "Failed to create teacher.", {
        type: "error",
        duration: 7000,
      });
      await logActivity({
        schoolId,
        actorUid: user?.id || null,
        actorRole: user?.role || null,
        eventType: "teacher_create_failed",
        entityId: formData.email || "",
        meta: {
          status: "failed",
          module: "Teachers",
          teacherName: formData.fullName || "",
          email: formData.email || "",
          error: error?.message || "Unknown error",
          actorName: user?.fullName || "",
        },
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

      await logActivity({
        schoolId,
        actorUid: user?.id || null,
        actorRole: user?.role || null,
        eventType: "teacher_deleted",
        entityId: idToDelete,
        meta: {
          status: "success",
          module: "Teachers",
          teacherName: teacherToDelete.fullName || "",
          email: teacherToDelete.email || "",
          actorName: user?.fullName || "",
        },
      });
    } catch (error) {
      console.error("Failed to delete teacher", error);
      setTeachers(previousTeachers);
      showToast("Failed to delete teacher profile. Please try again.", {
        type: "error",
      });
      await logActivity({
        schoolId,
        actorUid: user?.id || null,
        actorRole: user?.role || null,
        eventType: "teacher_delete_failed",
        entityId: idToDelete,
        meta: {
          status: "failed",
          module: "Teachers",
          teacherName: teacherToDelete.fullName || "",
          email: teacherToDelete.email || "",
          error: (error as any)?.message || "Unknown error",
          actorName: user?.fullName || "",
        },
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

      await logActivity({
        schoolId,
        actorUid: user?.id || null,
        actorRole: user?.role || null,
        eventType: "teacher_classes_updated",
        entityId: editTeacher.id,
        meta: {
          status: "success",
          module: "Teachers",
          teacherName: editTeacher.fullName || "",
          email: editTeacher.email || "",
          assignedClasses: editClasses,
          actorName: user?.fullName || "",
        },
      });

      setShowEditModal(false);
      setEditTeacher(null);
      setEditClasses([]);
      await fetchData();
    } catch (error: any) {
      console.error("Error updating teacher classes:", error);
      showToast(error?.message || "Failed to update teacher classes.", {
        type: "error",
      });
      await logActivity({
        schoolId,
        actorUid: user?.id || null,
        actorRole: user?.role || null,
        eventType: "teacher_classes_update_failed",
        entityId: editTeacher.id,
        meta: {
          status: "failed",
          module: "Teachers",
          teacherName: editTeacher.fullName || "",
          email: editTeacher.email || "",
          assignedClasses: editClasses,
          error: error?.message || "Unknown error",
          actorName: user?.fullName || "",
        },
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
      await logActivity({
        schoolId,
        actorUid: user?.id || null,
        actorRole: user?.role || null,
        eventType: "teacher_repaired",
        entityId: repairModalUid,
        meta: {
          status: "success",
          module: "Teachers",
          actorName: user?.fullName || "",
        },
      });
      await fetchData();
    } catch (error: any) {
      console.error("Error repairing teacher:", error);
      showToast(
        error?.details || error?.message || "Failed to repair teacher account.",
        { type: "error", duration: 6000 },
      );
      await logActivity({
        schoolId,
        actorUid: user?.id || null,
        actorRole: user?.role || null,
        eventType: "teacher_repair_failed",
        entityId: repairModalUid,
        meta: {
          status: "failed",
          module: "Teachers",
          error: error?.message || "Unknown error",
          actorName: user?.fullName || "",
        },
      });
    } finally {
      setIsRepairing(false);
    }
  };

  return (
    <Layout title="Manage Teachers">
      <div data-assistant-focus="teachers-list" className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
          <h2 className="font-semibold text-slate-800">Staff List</h2>

          <button
            data-assistant-focus="teachers-add"
            onClick={openCreateTeacherModal}
            className="flex items-center bg-emerald-600 text-white px-4 py-2 rounded-md hover:bg-emerald-700 transition-colors text-sm font-medium w-full sm:w-auto justify-center sm:justify-start"
          >
            <Plus size={16} className="mr-2" />
            Add Teacher
          </button>
        </div>

        <div className="p-4">
          {teachers.length === 0 ? (
            <div className="px-6 py-10 text-center text-slate-400">
              No teachers found for this school.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {teachers.map((teacher) => {
                const assignedIds = teacher.assignedClassIds || [];
                const classNames = assignedIds
                  .map((id) => availableClasses.find((c) => c.id === id)?.name)
                  .filter(Boolean);

                const isMissingSchoolId = !teacher.schoolId;

                return (
                  <div
                    key={teacher.id}
                    className={`group relative overflow-hidden rounded-2xl border transition duration-300 hover:-translate-y-1 hover:shadow-md shadow-sm p-5 ${
                      isMissingSchoolId
                        ? "border-red-200 bg-red-50"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="absolute -top-14 -right-14 h-28 w-28 rounded-full bg-indigo-100/60 blur-2xl" />
                    <div className="absolute -bottom-16 -left-10 h-32 w-32 rounded-full bg-blue-100/60 blur-2xl" />

                    <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
                      <div className="flex items-center gap-3">
                        <UserAvatar user={teacher} size="md" />
                        <div>
                          <p className="font-semibold text-slate-900 text-sm sm:text-base">
                            {teacher.fullName}
                          </p>
                          <p className="text-xs text-slate-500 truncate">
                            ID: {teacher.id}
                          </p>
                        </div>
                      </div>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${
                        isMissingSchoolId
                          ? "bg-red-100 text-red-700"
                          : "bg-emerald-100 text-emerald-700"
                      }`}>
                        {isMissingSchoolId ? "⚠ Incomplete" : "✓ Active"}
                      </span>
                    </div>

                    <div className="relative mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-600">
                      <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-slate-400">
                          Email
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-800 truncate">
                          {teacher.email}
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-slate-400">
                          Classes
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-800">
                          {classNames.length > 0 ? classNames.length : "—"}
                        </p>
                      </div>
                    </div>

                    {classNames.length > 0 && (
                      <div className="relative mt-3 flex flex-wrap gap-1">
                        {classNames.map((name) => (
                          <span
                            key={name}
                            className="teacher-class-badge inline-flex items-center whitespace-nowrap rounded-full border border-blue-200 bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-700"
                          >
                            {name}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="relative mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <button
                        onClick={() => openEditModal(teacher)}
                        className="inline-flex items-center justify-center sm:justify-start gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 whitespace-nowrap"
                        title="Edit Assigned Classes"
                      >
                        <Edit size={14} />
                        <span className="hidden sm:inline">Edit Classes</span>
                        <span className="sm:hidden">Edit</span>
                      </button>
                      <div className="flex items-center gap-2">
                        {isMissingSchoolId && (
                          <button
                            onClick={() => setRepairModalUid(teacher.id)}
                            className="text-orange-600 hover:text-orange-800 p-2 hover:bg-orange-50 rounded-full transition-colors flex-shrink-0"
                            title="Repair Account"
                          >
                            <Wrench size={16} className="pointer-events-none" />
                          </button>
                        )}
                        <button
                          onClick={() => promptDelete(teacher.id)}
                          className="text-rose-500 hover:text-rose-700 p-2 hover:bg-rose-50 rounded-full transition-colors flex-shrink-0 cursor-pointer"
                          title="Remove Teacher"
                        >
                          <Trash2 size={16} className="pointer-events-none" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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

            <form
              onSubmit={handleSubmit}
              className="space-y-4 pt-2"
              autoComplete="off"
            >
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  name="new-teacher-full-name"
                  autoComplete="off"
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
                  name="new-teacher-email"
                  autoComplete="off"
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
                    name="new-teacher-password"
                    autoComplete="new-password"
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
                    {availableClasses.map((c) => {
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
                {successData.adminProvidedPassword
                  ? "Share these credentials with the teacher."
                  : successData.resetEmailSent
                    ? "The teacher should check email to set a password."
                    : "The teacher account was created, but the email step needs attention."}
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
              ) : successData.resetEmailSent ? (
                <div className="bg-blue-50 border border-blue-200 rounded p-3">
                  <p className="text-xs text-blue-700">
                    📧 A password reset link has been sent to their email inbox.
                  </p>
                </div>
              ) : null}

              {!successData.adminProvidedPassword &&
                !successData.resetEmailSent && (
                  <div className="bg-amber-50 border border-amber-200 rounded p-3">
                    <p className="text-xs text-amber-700">
                      No reset email was sent automatically. Ask the teacher to
                      use Forgot Password on the login page with this email
                      address.
                    </p>
                    {successData.resetEmailError ? (
                      <p className="text-[11px] text-amber-700 mt-2">
                        {successData.resetEmailError}
                      </p>
                    ) : null}
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
                {availableClasses.map((c) => {
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
