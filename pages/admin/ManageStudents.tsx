import React, { useState, useEffect } from "react";
import Layout from "../../components/Layout";
import UserAvatar from "../../components/UserAvatar";
import { showToast } from "../../services/toast";
import { db } from "../../services/mockDb";
import { useSchool } from "../../context/SchoolContext";
import { useAuth } from "../../context/AuthContext";
import { logActivity } from "../../services/activityLog";
import { Student } from "../../types";
import {
  CLASS_PROMOTION_MAP,
  calculateGrade,
  getGradeColor,
} from "../../constants";
import { useSchoolClasses } from "../../hooks/useSchoolClasses";

import {
  Plus,
  Trash2,
  Edit,
  Eye,
  X,
  BookOpen,
  Calendar,
  User as UserIcon,
  Users,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ArrowUpRight,
  FileText,
} from "lucide-react";

const ManageStudents = () => {
  const { school } = useSchool();
  const { user } = useAuth();
  const schoolId = school?.id || null;

  const { classes: availableClasses, allClasses, getClassName } = useSchoolClasses();
  const defaultClassId = availableClasses[0]?.id || "c_p1";
  const getNextClassId = (classId: string) =>
    allClasses.find((classRoom) => classRoom.id === classId)?.nextClassId ??
    CLASS_PROMOTION_MAP[classId] ??
    null;
  const [students, setStudents] = useState<Student[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [filterClass, setFilterClass] = useState("all");

  // Edit/Add State
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Student>>({
    gender: "Male",
    classId: defaultClassId,
    dob: "",
    homeTown: "",
    region: "",
    languagesSpoken: "",
    previousSchool: "",
    reasonForLeaving: "",
    dateOfLastAttendance: "",
    residentialAddress: "",
    digitalAddress: "",
    chronicDisease: "",
    fatherName: "",
    fatherOccupation: "",
    fatherPhone: "",
    fatherEducation: "",
    fatherAddress: "",
    fatherWhatsApp: "",
    fatherEmail: "",
    motherName: "",
    motherOccupation: "",
    motherPhone: "",
    motherEducation: "",
    motherAddress: "",
    motherWhatsApp: "",
    motherEmail: "",
    guardianName: "",
    guardianPhone: "",
    guardianEmail: "",
    guardianOccupation: "",
    guardianEducation: "",
    guardianAddress: "",
    guardianWhatsApp: "",
  });

  // Performance Data (Shared for both View Modal and Edit Modal)
  const [viewStudent, setViewStudent] = useState<Student | null>(null);
  const [performanceData, setPerformanceData] = useState<any>(null);
  
  // Admission Form View State
  const [viewAdmissionStudent, setViewAdmissionStudent] = useState<Student | null>(null);

  // Delete Confirmation State
  const [deleteId, setDeleteId] = useState<string | null>(null);
  // Save button loading state
  const [isSaving, setIsSaving] = useState(false);
  // Bulk Promotion State
  const [showPromotionModal, setShowPromotionModal] = useState(false);
  const [isPromoting, setIsPromoting] = useState(false);
  const [promotionClassId, setPromotionClassId] = useState(defaultClassId);
  const [promotionScores, setPromotionScores] = useState<
    Record<string, number>
  >({});
  const [promotionPassMark, setPromotionPassMark] = useState(50);
  const [promotionTermNumber, setPromotionTermNumber] = useState<1 | 2 | 3>(1);
  const [promotionLoading, setPromotionLoading] = useState(false);
  const [selectedPromoteIds, setSelectedPromoteIds] = useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const compressImageToBase64 = (file: File, maxPx = 300, quality = 0.75): Promise<string> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingPhoto(true);
    try {
      const base64 = await compressImageToBase64(file);
      setFormData(prev => ({ ...prev, photoUrl: base64 }));
      showToast("Photo ready! Save the student to apply it.", { type: "success" });
    } catch (error) {
      console.error("Photo upload error:", error);
      showToast("Failed to process photo.", { type: "error" });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const fetchData = async () => {
    if (!schoolId) {
      setStudents([]);
      return;
    }
    setStudentsLoading(true);
    try {
      const data: Student[] = [];
      let cursorId: string | null = null;
      let hasMore = true;
      let safetyCounter = 0;
      let renderedFirstPage = false;

      while (hasMore && safetyCounter < 500) {
        const page = await db.getStudentsPage({
          schoolId,
          pageSize: 250,
          cursorId,
        });
        data.push(...page.items);
        cursorId = page.nextCursor;
        hasMore = page.hasMore && Boolean(cursorId);
        safetyCounter += 1;

        if (!renderedFirstPage) {
          setStudents(data);
          renderedFirstPage = true;
        }
      }

      setStudents(data);

      const missingSchool = data.filter((s) => !s.schoolId);
      if (missingSchool.length > 0) {
        await Promise.all(
          missingSchool.map((student) =>
            db.updateStudent({ ...student, schoolId }),
          ),
        );
      }
    } catch (error) {
      console.error("Failed to load students", error);
      showToast("Failed to load students. Please try again.", {
        type: "error",
      });
    } finally {
      setStudentsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [schoolId]);

  const parseTermNumber = (termString: string): 1 | 2 | 3 => {
    let term = parseInt(termString);
    if (!Number.isNaN(term) && term >= 1 && term <= 3) return term as 1 | 2 | 3;

    const parts = termString.split(" ");
    if (parts.length > 1) {
      term = parseInt(parts[1]);
      if (!Number.isNaN(term) && term >= 1 && term <= 3)
        return term as 1 | 2 | 3;
    }

    return 1;
  };

  // --- Logic for Performance View ---
  const handleViewPerformance = async (student: Student) => {
    setPerformanceData(null); // Reset prev data
    setViewStudent(student);
    const data = await db.getStudentPerformance(
      schoolId || "",
      student.id,
      student.classId,
    );
    setPerformanceData(data);
  };

  const closeViewModal = () => {
    setViewStudent(null);
    setPerformanceData(null);
  };
  
  const handleViewAdmissionForm = (student: Student) => {
    setViewAdmissionStudent(student);
  };
  
  const closeAdmissionModal = () => {
    setViewAdmissionStudent(null);
  };
  // ----------------------------------

  const filteredStudents = students
    .filter((s) => (filterClass === "all" ? true : s.classId === filterClass))
    .sort((a, b) => a.name.localeCompare(b.name));

  const classLabel =
    filterClass === "all"
      ? "All Classes"
      : availableClasses.find((c) => c.id === filterClass)?.name || filterClass;
  const totalStudents = students.length;
  const filteredCount = filteredStudents.length;
  const attendanceTotal = performanceData?.attendance?.total;
  const attendancePresent = performanceData?.attendance?.present;
  const attendanceAbsent =
    attendanceTotal != null && attendancePresent != null
      ? Math.max(attendanceTotal - attendancePresent, 0)
      : null;
  const attendanceRate = performanceData?.attendance?.percentage;
  const subjectCount = performanceData?.grades?.length ?? 0;

  const handleOpenAdd = () => {
    setPerformanceData(null);
    const selectedClass = filterClass !== "all" ? filterClass : defaultClassId;
    setFormData({
      gender: "Male",
      classId: selectedClass,
      dob: "",
      homeTown: "",
      region: "",
      languagesSpoken: "",
      previousSchool: "",
      reasonForLeaving: "",
      dateOfLastAttendance: "",
      residentialAddress: "",
      digitalAddress: "",
      chronicDisease: "",
      fatherName: "",
      fatherOccupation: "",
      fatherPhone: "",
      fatherEducation: "",
      fatherAddress: "",
      fatherWhatsApp: "",
      fatherEmail: "",
      motherName: "",
      motherOccupation: "",
      motherPhone: "",
      motherEducation: "",
      motherAddress: "",
      motherWhatsApp: "",
      motherEmail: "",
      guardianName: "",
      guardianPhone: "",
      guardianEmail: "",
      guardianOccupation: "",
      guardianEducation: "",
      guardianAddress: "",
      guardianWhatsApp: "",
    });
    setEditingId(null);
    setShowModal(true);
  };

  const handleOpenPromotion = () => {
    const initialClassId =
      filterClass !== "all" ? filterClass : defaultClassId;
    setPromotionClassId(initialClassId);
    setShowPromotionModal(true);
  };

  const handleEdit = async (student: Student) => {
    const cleanedStudent = {
      ...student,
      dob: student.dob === "2015-01-01" ? "" : student.dob,
    };
    setFormData(cleanedStudent);
    setEditingId(student.id);
    setShowModal(true);

    // Also fetch performance data to show in the edit modal
    setPerformanceData(null);
    const data = await db.getStudentPerformance(
      schoolId || "",
      student.id,
      student.classId,
    );
    setPerformanceData(data);
  };

  const handleClose = () => {
    setShowModal(false);
    setFormData({
      gender: "Male",
      classId: defaultClassId,
      dob: "",
      homeTown: "",
      region: "",
      languagesSpoken: "",
      previousSchool: "",
      reasonForLeaving: "",
      dateOfLastAttendance: "",
      residentialAddress: "",
      digitalAddress: "",
      chronicDisease: "",
      fatherName: "",
      fatherOccupation: "",
      fatherPhone: "",
      fatherEducation: "",
      fatherAddress: "",
      fatherWhatsApp: "",
      fatherEmail: "",
      motherName: "",
      motherOccupation: "",
      motherPhone: "",
      motherEducation: "",
      motherAddress: "",
      motherWhatsApp: "",
      motherEmail: "",
      guardianName: "",
      guardianPhone: "",
      guardianEmail: "",
      guardianOccupation: "",
      guardianEducation: "",
      guardianAddress: "",
      guardianWhatsApp: "",
    });
    setEditingId(null);
    setPerformanceData(null);
  };

  const togglePromote = (id: string) => {
    setSelectedPromoteIds((prev) =>
      prev.includes(id)
        ? prev.filter((existing) => existing !== id)
        : [...prev, id],
    );
  };

  useEffect(() => {
    if (!showPromotionModal || !schoolId) return;

    const loadPromotionData = async () => {
      setPromotionLoading(true);
      try {
        const schoolConfig = await db.getSchoolConfig(schoolId);
        const passMark =
          typeof schoolConfig.passMark === "number"
            ? schoolConfig.passMark
            : 50;
        const termNumber = parseTermNumber(schoolConfig.currentTerm || "");
        setPromotionPassMark(passMark);
        setPromotionTermNumber(termNumber);

        const assessments = await db.getAllAssessments(schoolId);
        const classAssessments = assessments.filter(
          (a) => a.classId === promotionClassId && a.term === termNumber,
        );
        const totals = classAssessments.reduce(
          (acc: Record<string, number>, assessment) => {
            const total = assessment.total || 0;
            acc[assessment.studentId] =
              (acc[assessment.studentId] || 0) + total;
            return acc;
          },
          {},
        );

        setPromotionScores(totals);

        const classStudents = students.filter(
          (student) => student.classId === promotionClassId,
        );
        const passedIds = classStudents
          .filter((student) => (totals[student.id] || 0) >= passMark)
          .map((student) => student.id);
        setSelectedPromoteIds(passedIds);
      } catch (error) {
        console.error("Failed to load promotion data", error);
        showToast("Failed to load promotion data. Please try again.", {
          type: "error",
        });
      } finally {
        setPromotionLoading(false);
      }
    };

    loadPromotionData();
  }, [showPromotionModal, promotionClassId, schoolId, students]);

  const handleBulkPromotion = async () => {
    if (!schoolId) return;

    const promotionClass = allClasses.find(
      (classRoom) => classRoom.id === promotionClassId,
    );
    if (promotionClass?.section && !promotionClass.nextClassId) {
      showToast(
        `Set the promotion destination for ${promotionClass.name} in System Settings first.`,
        { type: "error" },
      );
      return;
    }

    const selectedSet = new Set(selectedPromoteIds);
    const classStudents = students.filter(
      (student) => student.classId === promotionClassId,
    );
    const updates = classStudents
      .filter((student) => selectedSet.has(student.id))
      .map((student) => ({
        id: student.id,
        classId: getNextClassId(student.classId),
      }))
      .filter((row) => row.classId);

    if (updates.length === 0) {
      showToast("No eligible students to promote.", { type: "info" });
      return;
    }

    setIsPromoting(true);
    try {
      await db.updateStudentsClassBulk(schoolId, updates);
      showToast(`Promoted ${updates.length} students.`, { type: "success" });
      await logActivity({
        schoolId,
        actorUid: user?.id || null,
        actorRole: user?.role || null,
        eventType: "students_promoted",
        entityId: promotionClassId,
        meta: {
          status: "success",
          module: "Students",
          classId: promotionClassId,
          promotedCount: updates.length,
          actorName: user?.fullName || "",
        },
      });
      setShowPromotionModal(false);
      await fetchData();
    } catch (error) {
      console.error("Promotion failed", error);
      showToast("Failed to promote students. Please try again.", {
        type: "error",
      });
      await logActivity({
        schoolId,
        actorUid: user?.id || null,
        actorRole: user?.role || null,
        eventType: "students_promotion_failed",
        entityId: promotionClassId,
        meta: {
          status: "failed",
          module: "Students",
          classId: promotionClassId,
          error: (error as any)?.message || "Unknown error",
          actorName: user?.fullName || "",
        },
      });
    } finally {
      setIsPromoting(false);
    }
  };

  const promptDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteId(id);
  };

  const executeDelete = async () => {
    if (!deleteId) return;

    const idToDelete = deleteId;
    // Close modal immediately
    setDeleteId(null);

    const previousStudents = [...students];
    const targetStudent = students.find((s) => s.id === idToDelete);
    if (!targetStudent) return;

    // Optimistic update: remove from UI immediately
    setStudents((prev) => prev.filter((s) => s.id !== idToDelete));

    try {
      await db.updateStudent({
        ...targetStudent,
        studentStatus: "stopped",
      });
      showToast("Student moved to Stopped School history.", {
        type: "success",
      });
      await logActivity({
        schoolId,
        actorUid: user?.id || null,
        actorRole: user?.role || null,
        eventType: "student_archived",
        entityId: targetStudent.id,
        meta: {
          status: "success",
          module: "Students",
          studentName: targetStudent.name,
          classId: targetStudent.classId,
          actorName: user?.fullName || "",
        },
      });
    } catch (error) {
      console.error("Archive failed", error);
      // Revert state if DB fails
      setStudents(previousStudents);
      showToast("Failed to update student. Please try again.", {
        type: "error",
      });
      await logActivity({
        schoolId,
        actorUid: user?.id || null,
        actorRole: user?.role || null,
        eventType: "student_archive_failed",
        entityId: targetStudent.id,
        meta: {
          status: "failed",
          module: "Students",
          studentName: targetStudent.name,
          classId: targetStudent.classId,
          error: (error as any)?.message || "Unknown error",
          actorName: user?.fullName || "",
        },
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.classId) return;

    if (!editingId) {
      const limit = Number(school?.limits?.maxStudents || 0);
      const used = Number(school?.studentsCount ?? students.length);
      if (limit > 0 && used >= limit) {
        showToast(
          "Student limit reached for your plan. Upgrade to add more students.",
          { type: "error" },
        );
        return;
      }
    }

    setIsSaving(true);
    try {
      const normalizePhone = (p: string) => {
        if (!p) return "";
        let cleaned = p.trim().replace(/\s+/g, "");
        if (!cleaned.startsWith("+")) {
          if (cleaned.startsWith("0")) cleaned = "+233" + cleaned.substring(1);
          else cleaned = "+233" + cleaned;
        }
        return cleaned;
      };

      if (editingId) {
        const updatedStudent: Student = {
          ...(formData as Student),
          id: editingId,
          schoolId: schoolId || (formData as Student).schoolId,
          fatherPhone: normalizePhone(formData.fatherPhone || ""),
          fatherWhatsApp: normalizePhone(formData.fatherWhatsApp || ""),
          motherPhone: normalizePhone(formData.motherPhone || ""),
          motherWhatsApp: normalizePhone(formData.motherWhatsApp || ""),
          guardianPhone: normalizePhone(formData.guardianPhone || ""),
          guardianWhatsApp: normalizePhone(formData.guardianWhatsApp || ""),
        };
        await db.updateStudent(updatedStudent);
        showToast("Student updated successfully.", { type: "success" });
        await logActivity({
          schoolId,
          actorUid: user?.id || null,
          actorRole: user?.role || null,
          eventType: "student_updated",
          entityId: updatedStudent.id,
          meta: {
            status: "success",
            module: "Students",
            studentName: updatedStudent.name,
            classId: updatedStudent.classId,
            actorName: user?.fullName || "",
          },
        });
      } else {
        if (!formData.classId) {
          showToast("Please select a class for the student.", { type: "error" });
          return;
        }

        const newStudent: Student = {
          ...(formData as any),
          id: Math.random().toString(36).substr(2, 9),
          name: formData.name!,
          gender: formData.gender as "Male" | "Female",
          dob: formData.dob || "",
          classId: formData.classId,
          schoolId: schoolId || (school as any)?.id || "",
          fatherPhone: normalizePhone(formData.fatherPhone || ""),
          fatherWhatsApp: normalizePhone(formData.fatherWhatsApp || ""),
          motherPhone: normalizePhone(formData.motherPhone || ""),
          motherWhatsApp: normalizePhone(formData.motherWhatsApp || ""),
          guardianPhone: normalizePhone(formData.guardianPhone || ""),
          guardianWhatsApp: normalizePhone(formData.guardianWhatsApp || ""),
          createdAt: Date.now(),
        };
        await db.addStudent(newStudent);
        showToast("Student added successfully.", { type: "success" });
        await logActivity({
          schoolId,
          actorUid: user?.id || null,
          actorRole: user?.role || null,
          eventType: "student_created",
          entityId: newStudent.id,
          meta: {
            status: "success",
            module: "Students",
            studentName: newStudent.name,
            classId: newStudent.classId,
            actorName: user?.fullName || "",
          },
        });
      }

      await fetchData();
      handleClose();
    } catch (error) {
      console.error("Save failed", error);
      showToast("Failed to save student. Please try again.", { type: "error" });
      await logActivity({
        schoolId,
        actorUid: user?.id || null,
        actorRole: user?.role || null,
        eventType: editingId
          ? "student_update_failed"
          : "student_create_failed",
        entityId: editingId || "new",
        meta: {
          status: "failed",
          module: "Students",
          studentName: formData.name || "",
          classId: formData.classId || "",
          error: (error as any)?.message || "Unknown error",
          actorName: user?.fullName || "",
        },
      });
    } finally {
      setIsSaving(false);
    }
  };

  // --- Calendar Rendering Helpers ---
  const renderCalendar = () => {
    if (
      !performanceData ||
      !performanceData.attendance ||
      !performanceData.attendance.schoolDates
    )
      return null;

    const { schoolDates, presentDates } = performanceData.attendance;
    if (schoolDates.length === 0)
      return (
        <div className="text-center text-slate-400 py-4 italic">
          No attendance records found for this term.
        </div>
      );

    // Normalize date strings (YYYY-MM-DD)
    const normalize = (d: string | Date) => {
      const date = typeof d === "string" ? new Date(d) : d;
      return date.toISOString().split("T")[0];
    };

    const schoolSet = new Set(schoolDates.map((s: string) => normalize(s)));
    const presentSet = new Set(presentDates.map((s: string) => normalize(s)));

    // Group by month-year using numeric keys for correct ordering
    const months: Record<
      string,
      { label: string; year: number; month: number }
    > = {};
    schoolDates.forEach((s: string) => {
      const d = new Date(s);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (!months[key])
        months[key] = {
          label: d.toLocaleString("default", {
            month: "long",
            year: "numeric",
          }),
          year: d.getFullYear(),
          month: d.getMonth(),
        };
    });

    const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        {Object.entries(months).map(([key, info]) => {
          const { year, month, label } = info;
          const firstDay = new Date(year, month, 1).getDay();
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;

          return (
            <div
              key={key}
              className="relative overflow-hidden border border-slate-200 rounded-2xl p-4 bg-white shadow-sm"
            >
              <div className="absolute -top-10 -right-10 h-24 w-24 rounded-full bg-indigo-100/60 blur-2xl" />
              <div className="absolute -bottom-12 -left-10 h-28 w-28 rounded-full bg-emerald-100/60 blur-2xl" />
              <div className="relative flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
                <h5 className="font-semibold text-slate-800 text-sm">
                  {label}
                </h5>
                <span className="text-[11px] text-slate-400">Attendance</span>
              </div>

              <div className="grid grid-cols-7 gap-1 text-center">
                {weekdayLabels.map((d, i) => (
                  <div
                    key={i}
                    className="text-[10px] text-slate-400 font-semibold uppercase"
                  >
                    {d}
                  </div>
                ))}

                {Array.from({ length: totalCells }).map((_, idx) => {
                  const dayNum = idx - firstDay + 1;
                  if (dayNum < 1 || dayNum > daysInMonth) {
                    return <div key={idx} className="h-8"></div>;
                  }

                  const dateObj = new Date(year, month, dayNum);
                  const iso = normalize(dateObj);
                  const isSchoolDay = schoolSet.has(iso);
                  const isPresent = presentSet.has(iso);
                  const isWeekend =
                    dateObj.getDay() === 0 || dateObj.getDay() === 6;

                  // Visual styles
                  const baseClasses =
                    "h-8 w-8 mx-auto flex items-center justify-center rounded-full text-xs font-semibold transition";
                  const weekendClasses = isWeekend
                    ? "text-slate-300 bg-slate-50"
                    : "text-slate-600";

                  if (!isSchoolDay) {
                    return (
                      <div
                        key={idx}
                        className="h-8 flex items-center justify-center text-[11px] text-slate-200"
                      ></div>
                    );
                  }

                  return (
                    <div key={idx} className="flex items-center justify-center">
                      <div
                        title={`${iso}: ${isPresent ? "Present" : "Absent"}`}
                        className={`${baseClasses} ${weekendClasses} ${isPresent ? "bg-emerald-100 text-emerald-800 shadow-sm" : "bg-red-100 text-red-800 shadow-sm"}`}
                      >
                        {dayNum}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-3 flex justify-center gap-4 text-[11px] text-slate-500">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-emerald-100 rounded-full border border-emerald-200"></div>{" "}
                  Present
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-red-100 rounded-full border border-red-200"></div>{" "}
                  Absent
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Layout title="Manage Students">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-indigo-50 via-white to-emerald-50 p-6 shadow-sm">
          <div className="absolute -top-16 -right-16 h-40 w-40 rounded-full bg-indigo-200/40 blur-3xl" />
          <div className="absolute -bottom-20 -left-16 h-48 w-48 rounded-full bg-emerald-200/40 blur-3xl" />
          <div className="relative flex flex-col gap-2">
            <h1 className="text-3xl font-bold text-slate-900">
              Manage Students
            </h1>
            <p className="text-sm text-slate-600">
              Organize, update, and review student profiles in a beautiful
              workspace.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 font-medium text-slate-700 shadow-sm">
                <Users className="h-4 w-4 text-indigo-500" />
                Total: {totalStudents}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 font-medium text-emerald-700 shadow-sm">
                <CheckCircle className="h-4 w-4" />
                Showing: {filteredCount}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700 shadow-sm">
                <BookOpen className="h-4 w-4" />
                {classLabel}
              </span>
              {studentsLoading && (
                <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 font-medium text-amber-700 shadow-sm">
                  Loading students...
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border bg-white/80 shadow-sm overflow-hidden">
          {/* Toolbar */}
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex gap-2">
              <select
                className="border border-slate-200 rounded-full px-4 py-2 text-sm bg-white text-slate-700 shadow-sm focus:ring-2 focus:ring-emerald-200"
                value={filterClass}
                onChange={(e) => setFilterClass(e.target.value)}
              >
                <option value="all">All Classes</option>
                {availableClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleOpenPromotion}
                className="flex items-center justify-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 px-5 py-2 text-sm font-semibold shadow-sm transition hover:scale-[1.01] hover:bg-emerald-100"
              >
                <ArrowUpRight size={16} />
                Promote Students
              </button>
              <button
                onClick={handleOpenAdd}
                className="flex items-center justify-center gap-2 rounded-full bg-emerald-600 text-white px-5 py-2 text-sm font-semibold shadow-sm transition hover:scale-[1.01] hover:bg-emerald-700"
              >
                <Plus size={16} />
                Add Student
              </button>
            </div>
          </div>

          {/* Cards */}
          <div className="p-4">
            {studentsLoading && students.length === 0 ? (
              <div className="px-6 py-10 text-center text-slate-400">
                Loading students...
              </div>
            ) : !studentsLoading && filteredStudents.length === 0 ? (
              <div className="px-6 py-10 text-center text-slate-400">
                No students found.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                {filteredStudents.map((student) => {
                  const className =
                    availableClasses.find((c) => c.id === student.classId)?.name ||
                    student.classId;
                  const primaryContact = student.fatherPhone
                    ? { label: "Father Number", name: student.fatherName, phone: student.fatherPhone }
                    : student.motherPhone
                      ? { label: "Mother Number", name: student.motherName, phone: student.motherPhone }
                      : student.guardianPhone
                        ? { label: "Guardian Number", name: student.guardianName, phone: student.guardianPhone }
                        : { label: "Parent Number", name: "", phone: "" };
                  return (
                    <div
                      key={student.id}
                      className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-md sm:p-5"
                    >
                      <div className="absolute -top-14 -right-14 h-28 w-28 rounded-full bg-indigo-100/60 blur-2xl" />
                      <div className="absolute -bottom-16 -left-10 h-32 w-32 rounded-full bg-emerald-100/60 blur-2xl" />

                      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-center gap-4">
                          <UserAvatar
                            user={student}
                            size="xl"
                            className="ring-4 ring-white shadow-md"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-base font-semibold text-slate-900 sm:text-lg">
                              {student.name}
                            </p>
                            <p className="truncate text-xs text-slate-500">
                              ID: {student.id}
                            </p>
                          </div>
                        </div>
                        <span className="inline-flex w-fit items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 whitespace-nowrap">
                          {className}
                        </span>
                      </div>

                      <div className="relative mt-4 grid grid-cols-1 gap-3 text-xs text-slate-600 sm:grid-cols-3">
                        <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                          <p className="text-[11px] uppercase tracking-wide text-slate-400">
                            Gender
                          </p>
                          <p className="mt-1 break-words text-sm font-semibold text-slate-800">
                            {student.gender}
                          </p>
                        </div>
                        <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                          <p className="text-[11px] uppercase tracking-wide text-slate-400">
                            Date of Birth
                          </p>
                          <p className="mt-1 break-words text-sm font-semibold text-slate-800">
                            {student.dob && student.dob !== "" && student.dob !== "2015-01-01"
                              ? new Date(student.dob).toLocaleDateString("en-US")
                              : "Not Set"}
                          </p>
                        </div>
                        <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                          <p className="text-[11px] uppercase tracking-wide text-slate-400">
                            {primaryContact.label}
                          </p>
                          <p className="mt-1 break-words text-sm font-semibold text-slate-800">
                            {primaryContact.name || primaryContact.phone || "-"}
                          </p>
                          <p className="break-all text-[11px] text-slate-400">
                            {primaryContact.name ? primaryContact.phone : ""}
                          </p>
                        </div>
                      </div>

                      <div className="relative mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap">
                          <button
                            type="button"
                            onClick={() => handleViewPerformance(student)}
                            className="inline-flex items-center justify-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 sm:justify-start"
                            title="View Academic Performance"
                          >
                            <Eye size={14} />
                            <span className="hidden sm:inline">Academic Performance</span>
                            <span className="sm:hidden">Performance</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleViewAdmissionForm(student)}
                            className="inline-flex items-center justify-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 sm:justify-start"
                            title="View Admission Form"
                          >
                            <FileText size={14} />
                            <span className="hidden sm:inline">Admission Form</span>
                            <span className="sm:hidden">Admission</span>
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleEdit(student)}
                            className="text-[#1160A8] hover:text-[#0B4A82] p-2 hover:bg-[#E6F0FA] rounded-full transition-colors flex-shrink-0"
                            title="Edit Details"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => promptDelete(student.id, e)}
                            className="text-rose-500 hover:text-rose-700 p-2 hover:bg-rose-50 rounded-full transition-colors cursor-pointer flex-shrink-0"
                            title="Delete Student"
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
      </div>

      {/* View Admission Form Modal (Read-Only) */}
      {viewAdmissionStudent && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[95vh] overflow-y-auto shadow-2xl flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 via-white to-blue-50 sticky top-0 z-10">
              <div className="flex items-center gap-4">
                <UserAvatar user={viewAdmissionStudent} size="lg" className="shadow-sm !rounded-xl" />
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">
                    {viewAdmissionStudent.name} - Admission Form
                  </h2>
                  <p className="text-sm text-slate-500 mt-1">Read-only view of admission information</p>
                </div>
              </div>
              <button
                onClick={closeAdmissionModal}
                className="text-slate-400 hover:text-slate-700 bg-white p-2 rounded-full shadow-sm"
              >
                <X size={24} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-8">
              {/* 1. Student / Pupil Information */}
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-emerald-600 uppercase tracking-wide flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-xs font-bold">1</div>
                  Student / Pupil Information
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <label className="block text-xs font-semibold text-slate-500 uppercase">Full Name</label>
                    <p className="mt-2 text-sm font-medium text-slate-900">{viewAdmissionStudent.name || "-"}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <label className="block text-xs font-semibold text-slate-500 uppercase">Gender</label>
                    <p className="mt-2 text-sm font-medium text-slate-900">{viewAdmissionStudent.gender || "-"}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <label className="block text-xs font-semibold text-slate-500 uppercase">Date of Birth</label>
                    <p className="mt-2 text-sm font-medium text-slate-900">
                      {viewAdmissionStudent.dob && viewAdmissionStudent.dob !== "" && viewAdmissionStudent.dob !== "2015-01-01"
                        ? new Date(viewAdmissionStudent.dob).toLocaleDateString("en-US")
                        : "-"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <label className="block text-xs font-semibold text-slate-500 uppercase">Class</label>
                    <p className="mt-2 text-sm font-medium text-slate-900">
                      {getClassName(viewAdmissionStudent.classId)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <label className="block text-xs font-semibold text-slate-500 uppercase">Home Town</label>
                    <p className="mt-2 text-sm font-medium text-slate-900">{viewAdmissionStudent.homeTown || "-"}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <label className="block text-xs font-semibold text-slate-500 uppercase">Region</label>
                    <p className="mt-2 text-sm font-medium text-slate-900">{viewAdmissionStudent.region || "-"}</p>
                  </div>
                </div>
              </div>

              {/* 2. Parent/Guardian Information */}
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-emerald-600 uppercase tracking-wide flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-xs font-bold">2</div>
                  Parent/Guardian Information
                </h4>
                
                {/* Father's Information */}
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <h5 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                    <Users size={16} className="text-emerald-600" />
                    Father's Information
                  </h5>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <label className="block text-xs font-semibold text-slate-500 uppercase">Name</label>
                      <p className="mt-1 text-sm font-medium text-slate-900">{viewAdmissionStudent.fatherName || "-"}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <label className="block text-xs font-semibold text-slate-500 uppercase">Occupation</label>
                      <p className="mt-1 text-sm font-medium text-slate-900">{viewAdmissionStudent.fatherOccupation || "-"}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <label className="block text-xs font-semibold text-slate-500 uppercase">Phone</label>
                      <p className="mt-1 text-sm font-medium text-slate-900">{viewAdmissionStudent.fatherPhone || "-"}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <label className="block text-xs font-semibold text-slate-500 uppercase">Email</label>
                      <p className="mt-1 text-sm font-medium text-slate-900">{viewAdmissionStudent.fatherEmail || "-"}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <label className="block text-xs font-semibold text-slate-500 uppercase">Education</label>
                      <p className="mt-1 text-sm font-medium text-slate-900">{viewAdmissionStudent.fatherEducation || "-"}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <label className="block text-xs font-semibold text-slate-500 uppercase">WhatsApp</label>
                      <p className="mt-1 text-sm font-medium text-slate-900">{viewAdmissionStudent.fatherWhatsApp || "-"}</p>
                    </div>
                  </div>
                </div>

                {/* Mother's Information */}
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <h5 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                    <Users size={16} className="text-purple-600" />
                    Mother's Information
                  </h5>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <label className="block text-xs font-semibold text-slate-500 uppercase">Name</label>
                      <p className="mt-1 text-sm font-medium text-slate-900">{viewAdmissionStudent.motherName || "-"}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <label className="block text-xs font-semibold text-slate-500 uppercase">Occupation</label>
                      <p className="mt-1 text-sm font-medium text-slate-900">{viewAdmissionStudent.motherOccupation || "-"}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <label className="block text-xs font-semibold text-slate-500 uppercase">Phone</label>
                      <p className="mt-1 text-sm font-medium text-slate-900">{viewAdmissionStudent.motherPhone || "-"}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <label className="block text-xs font-semibold text-slate-500 uppercase">Email</label>
                      <p className="mt-1 text-sm font-medium text-slate-900">{viewAdmissionStudent.motherEmail || "-"}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <label className="block text-xs font-semibold text-slate-500 uppercase">Education</label>
                      <p className="mt-1 text-sm font-medium text-slate-900">{viewAdmissionStudent.motherEducation || "-"}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <label className="block text-xs font-semibold text-slate-500 uppercase">WhatsApp</label>
                      <p className="mt-1 text-sm font-medium text-slate-900">{viewAdmissionStudent.motherWhatsApp || "-"}</p>
                    </div>
                  </div>
                </div>

                {/* Guardian's Information */}
                {(viewAdmissionStudent.guardianName || viewAdmissionStudent.guardianPhone) && (
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <h5 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                      <Users size={16} className="text-blue-600" />
                      Guardian's Information
                    </h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <label className="block text-xs font-semibold text-slate-500 uppercase">Name</label>
                        <p className="mt-1 text-sm font-medium text-slate-900">{viewAdmissionStudent.guardianName || "-"}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <label className="block text-xs font-semibold text-slate-500 uppercase">Occupation</label>
                        <p className="mt-1 text-sm font-medium text-slate-900">{viewAdmissionStudent.guardianOccupation || "-"}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <label className="block text-xs font-semibold text-slate-500 uppercase">Phone</label>
                        <p className="mt-1 text-sm font-medium text-slate-900">{viewAdmissionStudent.guardianPhone || "-"}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <label className="block text-xs font-semibold text-slate-500 uppercase">Email</label>
                        <p className="mt-1 text-sm font-medium text-slate-900">{viewAdmissionStudent.guardianEmail || "-"}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <label className="block text-xs font-semibold text-slate-500 uppercase">Education</label>
                        <p className="mt-1 text-sm font-medium text-slate-900">{viewAdmissionStudent.guardianEducation || "-"}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <label className="block text-xs font-semibold text-slate-500 uppercase">WhatsApp</label>
                        <p className="mt-1 text-sm font-medium text-slate-900">{viewAdmissionStudent.guardianWhatsApp || "-"}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 3. Contact & Location Information */}
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-emerald-600 uppercase tracking-wide flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-xs font-bold">3</div>
                  Contact & Location Information
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <label className="block text-xs font-semibold text-slate-500 uppercase">Residential Address</label>
                    <p className="mt-2 text-sm font-medium text-slate-900">{viewAdmissionStudent.residentialAddress || "-"}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <label className="block text-xs font-semibold text-slate-500 uppercase">Digital Address</label>
                    <p className="mt-2 text-sm font-medium text-slate-900">{viewAdmissionStudent.digitalAddress || "-"}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <label className="block text-xs font-semibold text-slate-500 uppercase">Languages Spoken</label>
                    <p className="mt-2 text-sm font-medium text-slate-900">{viewAdmissionStudent.languagesSpoken || "-"}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <label className="block text-xs font-semibold text-slate-500 uppercase">Chronic Disease</label>
                    <p className="mt-2 text-sm font-medium text-slate-900">{viewAdmissionStudent.chronicDisease || "None"}</p>
                  </div>
                </div>
              </div>

              {/* 4. Educational Background */}
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-emerald-600 uppercase tracking-wide flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-xs font-bold">4</div>
                  Educational Background
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <label className="block text-xs font-semibold text-slate-500 uppercase">Previous School</label>
                    <p className="mt-2 text-sm font-medium text-slate-900">{viewAdmissionStudent.previousSchool || "-"}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <label className="block text-xs font-semibold text-slate-500 uppercase">Reason for Leaving</label>
                    <p className="mt-2 text-sm font-medium text-slate-900">{viewAdmissionStudent.reasonForLeaving || "-"}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <label className="block text-xs font-semibold text-slate-500 uppercase">Date of Last Attendance</label>
                    <p className="mt-2 text-sm font-medium text-slate-900">
                      {viewAdmissionStudent.dateOfLastAttendance
                        ? new Date(viewAdmissionStudent.dateOfLastAttendance).toLocaleDateString("en-US")
                        : "-"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Footer Message */}
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <p className="text-sm text-blue-800">
                  <strong>Note:</strong> This is a read-only view of the student's admission information. To make changes, please use the Edit button on the student card.
                </p>
              </div>
            </div>

            {/* Footer Button */}
            <div className="border-t border-slate-100 bg-slate-50 px-6 py-4 flex justify-end">
              <button
                onClick={closeAdmissionModal}
                className="px-6 py-2 bg-slate-200 text-slate-800 rounded-lg font-semibold hover:bg-slate-300 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl transform transition-all">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-rose-50 rounded-full flex items-center justify-center mb-4">
                <AlertTriangle className="text-rose-600 w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">
                Delete Student?
              </h3>
              <p className="text-sm text-slate-500 mb-6">
                Are you sure you want to delete this student? This action cannot
                be undone.
              </p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => setDeleteId(null)}
                  className="flex-1 px-4 py-2 border border-slate-200 text-slate-700 rounded-full hover:bg-slate-50 font-medium transition"
                >
                  Cancel
                </button>
                <button
                  onClick={executeDelete}
                  className="flex-1 px-4 py-2 bg-rose-600 text-white rounded-full hover:bg-rose-700 font-medium transition shadow-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="mb-6 border-b border-slate-100 pb-3 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-900">
                  {editingId ? "Edit Student Details" : "Student Admission Form"}
                </h3>
                <p className="text-sm text-slate-500">
                  Fill in all required information for accurate records.
                </p>
              </div>
              <button onClick={handleClose} className="p-2 hover:bg-slate-100 rounded-full">
                <X size={24} className="text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-8">
              {/* 1. Student / Pupil Information */}
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-emerald-600 uppercase tracking-wide flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-[10px]">1</div>
                  Student / Pupil Information
                </h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Photo Upload */}
                  <div className="lg:col-span-3 flex justify-center mb-4">
                    <div className="relative group">
                      <div className="w-24 h-24 rounded-full border-2 border-slate-200 p-1 bg-white flex items-center justify-center overflow-hidden">
                        {formData.photoUrl ? (
                          <img src={formData.photoUrl} alt="Student" className="w-full h-full object-cover rounded-full" />
                        ) : (
                          <UserIcon size={40} className="text-slate-300" />
                        )}
                      </div>
                      <label className="absolute inset-0 flex items-center justify-center bg-black/40 text-white opacity-0 group-hover:opacity-100 rounded-full cursor-pointer transition-opacity">
                        <div className="text-center">
                          <Edit size={16} className="mx-auto mb-1" />
                          <span className="text-[10px] font-bold uppercase">Upload</span>
                        </div>
                        <input type="file" className="hidden" accept="image/*" onChange={handlePhotoUpload} disabled={uploadingPhoto} />
                      </label>
                      {uploadingPhoto && (
                        <div className="absolute inset-0 flex items-center justify-center bg-white/60 rounded-full">
                          <div className="h-5 w-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="lg:col-span-2">
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Student Full Name</label>
                    <input
                      type="text"
                      required
                      className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                      value={formData.name || ""}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Full Name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Gender</label>
                    <select
                      className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                      value={formData.gender}
                      onChange={(e) => setFormData({ ...formData, gender: e.target.value as any })}
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Date of Birth</label>
                    <input
                      type="date"
                      className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                      value={formData.dob || ""}
                      onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Home Town</label>
                    <input
                      type="text"
                      className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                      value={formData.homeTown || ""}
                      onChange={(e) => setFormData({ ...formData, homeTown: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Region</label>
                    <input
                      type="text"
                      className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                      value={formData.region || ""}
                      onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Language(s) Spoken</label>
                    <input
                      type="text"
                      className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                      value={formData.languagesSpoken || ""}
                      onChange={(e) => setFormData({ ...formData, languagesSpoken: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Assigned Class</label>
                    <select
                      className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                      value={formData.classId}
                      onChange={(e) => setFormData({ ...formData, classId: e.target.value })}
                    >
                      {availableClasses.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="lg:col-span-3">
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Previous School Attended</label>
                    <input
                      type="text"
                      className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                      value={formData.previousSchool || ""}
                      onChange={(e) => setFormData({ ...formData, previousSchool: e.target.value })}
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Reason(s) for leaving last school</label>
                    <input
                      type="text"
                      className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                      value={formData.reasonForLeaving || ""}
                      onChange={(e) => setFormData({ ...formData, reasonForLeaving: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Date of last attendance</label>
                    <input
                      type="date"
                      className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                      value={formData.dateOfLastAttendance || ""}
                      onChange={(e) => setFormData({ ...formData, dateOfLastAttendance: e.target.value })}
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Residential Address</label>
                    <input
                      type="text"
                      className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                      value={formData.residentialAddress || ""}
                      onChange={(e) => setFormData({ ...formData, residentialAddress: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">G.P.A Address (Digital)</label>
                    <input
                      type="text"
                      className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                      value={formData.digitalAddress || ""}
                      onChange={(e) => setFormData({ ...formData, digitalAddress: e.target.value })}
                      placeholder="e.g. AK-123-4567"
                    />
                  </div>
                  <div className="lg:col-span-3">
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Any Chronic Disease / Abnormality</label>
                    <textarea
                      className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none min-h-[80px]"
                      value={formData.chronicDisease || ""}
                      onChange={(e) => setFormData({ ...formData, chronicDisease: e.target.value })}
                      placeholder="Specify if any, or 'None'"
                    />
                  </div>
                </div>
              </div>

              {/* 2. Parent Information */}
              <div className="space-y-6 pt-4 border-t border-slate-100">
                <h4 className="text-sm font-bold text-emerald-600 uppercase tracking-wide flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-[10px]">2</div>
                  Parent / Guardian Information
                </h4>

                {/* Father Info */}
                <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                  <h5 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                    Father's Information
                  </h5>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="lg:col-span-2">
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Father's Name</label>
                      <input
                        type="text"
                        className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                        value={formData.fatherName || ""}
                        onChange={(e) => setFormData({ ...formData, fatherName: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Occupation</label>
                      <input
                        type="text"
                        className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                        value={formData.fatherOccupation || ""}
                        onChange={(e) => setFormData({ ...formData, fatherOccupation: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Telephone</label>
                      <input
                        type="tel"
                        className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                        value={formData.fatherPhone || ""}
                        onChange={(e) => setFormData({ ...formData, fatherPhone: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">WhatsApp Number</label>
                      <input
                        type="tel"
                        className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                        value={formData.fatherWhatsApp || ""}
                        onChange={(e) => setFormData({ ...formData, fatherWhatsApp: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Email Address</label>
                      <input
                        type="email"
                        className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                        value={formData.fatherEmail || ""}
                        onChange={(e) => setFormData({ ...formData, fatherEmail: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Level of Education</label>
                      <input
                        type="text"
                        className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                        value={formData.fatherEducation || ""}
                        onChange={(e) => setFormData({ ...formData, fatherEducation: e.target.value })}
                      />
                    </div>
                    <div className="lg:col-span-2">
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Residential Address</label>
                      <input
                        type="text"
                        className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                        value={formData.fatherAddress || ""}
                        onChange={(e) => setFormData({ ...formData, fatherAddress: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                {/* Mother Info */}
                <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                  <h5 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                    Mother's Information
                  </h5>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="lg:col-span-2">
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Mother's Name</label>
                      <input
                        type="text"
                        className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                        value={formData.motherName || ""}
                        onChange={(e) => setFormData({ ...formData, motherName: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Occupation</label>
                      <input
                        type="text"
                        className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                        value={formData.motherOccupation || ""}
                        onChange={(e) => setFormData({ ...formData, motherOccupation: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Telephone</label>
                      <input
                        type="tel"
                        className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                        value={formData.motherPhone || ""}
                        onChange={(e) => setFormData({ ...formData, motherPhone: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">WhatsApp Number</label>
                      <input
                        type="tel"
                        className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                        value={formData.motherWhatsApp || ""}
                        onChange={(e) => setFormData({ ...formData, motherWhatsApp: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Email Address</label>
                      <input
                        type="email"
                        className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                        value={formData.motherEmail || ""}
                        onChange={(e) => setFormData({ ...formData, motherEmail: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Level of Education</label>
                      <input
                        type="text"
                        className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                        value={formData.motherEducation || ""}
                        onChange={(e) => setFormData({ ...formData, motherEducation: e.target.value })}
                      />
                    </div>
                    <div className="lg:col-span-2">
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Residential Address</label>
                      <input
                        type="text"
                        className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                        value={formData.motherAddress || ""}
                        onChange={(e) => setFormData({ ...formData, motherAddress: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                {/* Guardian Info */}
                <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                  <h5 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                    Guardian's Information
                  </h5>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="lg:col-span-2">
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Guardian's Name</label>
                      <input
                        type="text"
                        className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                        value={formData.guardianName || ""}
                        onChange={(e) => setFormData({ ...formData, guardianName: e.target.value })}
                        placeholder="Required if no parent info"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Occupation</label>
                      <input
                        type="text"
                        className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                        value={formData.guardianOccupation || ""}
                        onChange={(e) => setFormData({ ...formData, guardianOccupation: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Telephone</label>
                      <input
                        type="tel"
                        className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                        value={formData.guardianPhone || ""}
                        onChange={(e) => setFormData({ ...formData, guardianPhone: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">WhatsApp Number</label>
                      <input
                        type="tel"
                        className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                        value={formData.guardianWhatsApp || ""}
                        onChange={(e) => setFormData({ ...formData, guardianWhatsApp: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Email Address</label>
                      <input
                        type="email"
                        className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                        value={formData.guardianEmail || ""}
                        onChange={(e) => setFormData({ ...formData, guardianEmail: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Level of Education</label>
                      <input
                        type="text"
                        className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                        value={formData.guardianEducation || ""}
                        onChange={(e) => setFormData({ ...formData, guardianEducation: e.target.value })}
                      />
                    </div>
                    <div className="lg:col-span-2">
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Residential Address</label>
                      <input
                        type="text"
                        className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                        value={formData.guardianAddress || ""}
                        onChange={(e) => setFormData({ ...formData, guardianAddress: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-10 pt-6 border-t border-slate-100 sticky bottom-0 bg-white pb-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-6 py-3 text-slate-600 hover:bg-slate-100 rounded-xl font-bold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className={`px-8 py-3 bg-emerald-600 text-white rounded-xl font-bold shadow-lg shadow-emerald-200 transition-all active:scale-95 ${isSaving ? "opacity-60 cursor-not-allowed hover:bg-emerald-600" : "hover:bg-emerald-700 hover:-translate-y-0.5"}`}
                >
                  {isSaving ? (
                    <span className="flex items-center">
                      <svg
                        className="animate-spin h-5 w-5 mr-3 text-white"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                      </svg>
                      {editingId ? "Updating..." : "Admitting Student..."}
                    </span>
                  ) : editingId ? (
                    "Save Changes"
                  ) : (
                    "Complete Admission"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Promotion Modal */}
      {showPromotionModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-6 border-b border-slate-100">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    Promote Students
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Choose a class, then review pass/fail groups for promotion.
                  </p>
                </div>
                <button
                  onClick={() => setShowPromotionModal(false)}
                  className="text-slate-400 hover:text-slate-700 bg-white p-2 rounded-full shadow-sm"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {(() => {
              const classStudents = students.filter(
                (student) => student.classId === promotionClassId,
              );
              const passStudents = classStudents.filter(
                (student) =>
                  (promotionScores[student.id] || 0) >= promotionPassMark,
              );
              const failStudents = classStudents.filter(
                (student) =>
                  (promotionScores[student.id] || 0) < promotionPassMark,
              );
              const selectedSet = new Set(selectedPromoteIds);
              const willPromoteCount = classStudents.filter((student) =>
                selectedSet.has(student.id),
              ).length;
              const nextClassId = getNextClassId(promotionClassId);
              const promotionClass = allClasses.find(
                (classRoom) => classRoom.id === promotionClassId,
              );
              const nextClassName = nextClassId
                ? getClassName(nextClassId)
                : promotionClass?.section
                  ? "Not configured"
                  : "Graduating";

              return (
                <div className="p-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-400">
                        Selected Class
                      </p>
                      <select
                        value={promotionClassId}
                        onChange={(e) => setPromotionClassId(e.target.value)}
                        className="mt-2 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white text-slate-700 focus:ring-2 focus:ring-emerald-200"
                      >
                        {availableClasses.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-4">
                      <p className="text-xs uppercase tracking-wide text-emerald-500">
                        Pass Mark (Term {promotionTermNumber})
                      </p>
                      <p className="mt-2 text-2xl font-bold text-emerald-700">
                        {promotionPassMark}
                      </p>
                      <p className="text-[11px] text-emerald-600 mt-1">
                        Next class: {nextClassName}
                      </p>
                    </div>
                    <div className="rounded-xl border border-sky-100 bg-sky-50/70 p-4">
                      <p className="text-xs uppercase tracking-wide text-sky-500">
                        Selected to Promote
                      </p>
                      <p className="mt-2 text-2xl font-bold text-sky-700">
                        {willPromoteCount}
                      </p>
                      <p className="text-[11px] text-sky-600 mt-1">
                        Total in class: {classStudents.length}
                      </p>
                    </div>
                  </div>

                  {promotionLoading ? (
                    <div className="rounded-2xl border border-slate-100 bg-white p-6 text-center text-sm text-slate-500">
                      Loading promotion data...
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="rounded-2xl border border-emerald-100 bg-white p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-semibold text-emerald-700">
                            Passed (select to promote)
                          </h4>
                          <span className="text-xs text-emerald-600">
                            {passStudents.length} students
                          </span>
                        </div>
                        {passStudents.length === 0 ? (
                          <p className="text-sm text-slate-500">
                            No students passed for this term.
                          </p>
                        ) : (
                          <div className="space-y-2 max-h-[320px] overflow-y-auto">
                            {passStudents.map((student) => (
                              <label
                                key={student.id}
                                className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-sm transition ${selectedSet.has(student.id) ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200 bg-white"}`}
                              >
                                <div className="flex items-center gap-3">
                                  <input
                                    type="checkbox"
                                    checked={selectedSet.has(student.id)}
                                    onChange={() => togglePromote(student.id)}
                                    className="h-4 w-4 text-emerald-600"
                                  />
                                  <div>
                                    <p className="font-semibold text-slate-800">
                                      {student.name}
                                    </p>
                                    <p className="text-xs text-slate-500">
                                      Total: {promotionScores[student.id] || 0}
                                    </p>
                                  </div>
                                </div>
                                <span className="text-xs text-slate-400">
                                  ID: {student.id}
                                </span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="rounded-2xl border border-rose-100 bg-white p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-semibold text-rose-700">
                            Failed (optional promotion)
                          </h4>
                          <span className="text-xs text-rose-600">
                            {failStudents.length} students
                          </span>
                        </div>
                        {failStudents.length === 0 ? (
                          <p className="text-sm text-slate-500">
                            No students failed for this term.
                          </p>
                        ) : (
                          <div className="space-y-2 max-h-[320px] overflow-y-auto">
                            {failStudents.map((student) => (
                              <label
                                key={student.id}
                                className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-sm transition ${selectedSet.has(student.id) ? "border-rose-200 bg-rose-50/40" : "border-slate-200 bg-white"}`}
                              >
                                <div className="flex items-center gap-3">
                                  <input
                                    type="checkbox"
                                    checked={selectedSet.has(student.id)}
                                    onChange={() => togglePromote(student.id)}
                                    className="h-4 w-4 text-rose-600"
                                  />
                                  <div>
                                    <p className="font-semibold text-slate-800">
                                      {student.name}
                                    </p>
                                    <p className="text-xs text-slate-500">
                                      Total: {promotionScores[student.id] || 0}
                                    </p>
                                  </div>
                                </div>
                                <span className="text-xs text-slate-400">
                                  ID: {student.id}
                                </span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowPromotionModal(false)}
                      className="px-5 py-2.5 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleBulkPromotion}
                      disabled={
                        isPromoting ||
                        promotionLoading ||
                        selectedPromoteIds.length === 0
                      }
                      className={`px-5 py-2.5 bg-emerald-600 text-white rounded-lg font-medium shadow-sm transition-colors ${isPromoting || promotionLoading || selectedPromoteIds.length === 0 ? "opacity-60 cursor-not-allowed hover:bg-emerald-600" : "hover:bg-emerald-700"}`}
                    >
                      {isPromoting ? "Promoting..." : "Apply Promotion"}
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* View Performance Modal (Report Card) */}
      {viewStudent && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[95vh] overflow-y-auto shadow-2xl flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex flex-col gap-4 bg-gradient-to-r from-slate-50 via-white to-emerald-50 sticky top-0 z-10">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <UserAvatar user={viewStudent} size="xl" className="shadow-sm !rounded-2xl" />
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900">
                      {viewStudent.name}
                    </h2>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500 mt-1">
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 text-xs font-semibold text-slate-600 shadow-sm">
                        <UserIcon size={14} />
                        {viewStudent.gender}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 text-xs font-semibold text-slate-600 shadow-sm">
                        <BookOpen size={14} />
                        {
                          getClassName(viewStudent.classId)
                        }
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={closeViewModal}
                  className="text-slate-400 hover:text-slate-700 bg-white p-2 rounded-full shadow-sm"
                >
                  <X size={24} />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    Attendance Rate
                  </p>
                  <p
                    className={`mt-1 text-2xl font-bold ${performanceData?.attendance?.percentage < 50 ? "text-rose-600" : "text-emerald-600"}`}
                  >
                    {performanceData
                      ? `${performanceData.attendance.percentage}%`
                      : "-"}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    Days Present
                  </p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">
                    {performanceData ? performanceData.attendance.present : "-"}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    Total School Days
                  </p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">
                    {performanceData ? performanceData.attendance.total : "-"}
                  </p>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="p-6 space-y-8">
              {/* Detailed Attendance Stats */}
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
                    <span className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1 font-semibold text-red-700">
                      <div className="w-2.5 h-2.5 bg-red-300 rounded-full" />
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
                  <div className="rounded-2xl border border-red-100 bg-red-50/70 p-4">
                    <p className="text-xs uppercase tracking-wide text-red-500">
                      Days Absent
                    </p>
                    <p className="mt-2 text-2xl font-bold text-red-700">
                      {attendanceAbsent ?? "-"}
                    </p>
                  </div>
                </div>

                {/* Calendar View */}
                <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                  {renderCalendar()}
                </div>
              </div>

              {/* Academic Grades */}
              <div className="rounded-2xl border border-slate-100 bg-white/80 p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <h3 className="font-bold text-slate-800 flex items-center">
                    <BookOpen size={20} className="mr-2 text-[#0B4A82]" />{" "}
                    Academic Performance
                  </h3>
                  <span className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                    Subjects: {subjectCount}
                  </span>
                </div>
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
                        performanceData.grades.map((g: any, i: number) => {
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
                            Loading grades...
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 flex items-center justify-end text-xs text-slate-400">
                  Updated via system records
                </div>
              </div>
            </div>

            {/* Footer */}
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

export default ManageStudents;
