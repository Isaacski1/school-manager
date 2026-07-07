import React, { useState, useEffect } from "react";
import schoolLogo from "../../logo/apple-icon-180x180.png";
import Layout from "../../components/Layout";
import ReportCardLayout from "../../components/ReportCardLayout";
import UserAvatar from "../../components/UserAvatar";
import { showToast } from "../../services/toast";
import { db } from "../../services/mockDb";
import { auth } from "../../services/firebase";
import { logActivity } from "../../services/activityLog";
import { Notice, ClassRoom, SchoolConfig } from "../../types";
import { useAuth } from "../../context/AuthContext";
import { useSchool } from "../../context/SchoolContext";
import { requireSchoolId } from "../../services/authProfile";
import { canAccessFeature } from "../../services/featureAccess";
import { API_BASE_URL } from "../../src/config";
import {
  nurserySubjects,
  kgSubjects,
  primarySubjects,
  jhsSubjects,
  getDefaultFilteredClasses,
} from "../../constants";
import {
  createClassRoomId,
  getConfiguredClassRooms,
  normalizeClassName,
} from "../../services/classCatalog";
import { DEFAULT_REPORT_CARD_SETTINGS } from "../../services/reportCardSettings";
import {
  Plus,
  Trash2,
  Megaphone,
  Book,
  Edit,
  Check,
  X,
  Save,
  Calendar,
  AlertTriangle,
  History,
  Settings,
  Shield,
  Bell,
  School,
  ArrowUp,
  ArrowDown,
  Lock,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  collection,
  getDocs,
  deleteDoc,
  doc,
  setDoc,
  writeBatch,
  query,
  limit,
  getDocsFromServer,
} from "firebase/firestore";
import { firestore } from "../../services/firebase";


const getClassGroupKey = (name: string) => {
  const normalized = name.toLowerCase();
  if (normalized.includes("creche")) return "Creche";
  if (normalized.includes("nursery")) return "Nursery";
  if (normalized.startsWith("kg") || normalized.includes("kg")) return "KG";
  if (/class\s*[1-3]\b/i.test(name)) return "Class 1-3";
  if (/class\s*[4-6]\b/i.test(name)) return "Class 4-6";
  if (/jhs\s*[1-3]\b/i.test(name)) return "JHS 1-3";
  return "Other";
};

const SystemSettings = () => {
  const { user, updateUser } = useAuth();
  const { school, refreshSchool } = useSchool();
  const schoolId = requireSchoolId(user);
  const isTrialPlan = (school as any)?.plan === "trial";
  const canUseBackups = canAccessFeature(user, school, "backups");

  // Notices State
  const [notices, setNotices] = useState<Notice[]>([]);
  const [newNotice, setNewNotice] = useState("");
  const [noticeDate, setNoticeDate] = useState(
    new Date().toISOString().split("T")[0],
  ); // Default to today
  const [noticeType, setNoticeType] = useState<"info" | "urgent">("info");
  const [isAddingNotice, setIsAddingNotice] = useState(false);

  // Class Subjects State
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [currentClassSubjects, setCurrentClassSubjects] = useState<string[]>(
    [],
  );
  const [newSubjectName, setNewSubjectName] = useState("");
  const [isAddingSubject, setIsAddingSubject] = useState(false);
  const [editingSubject, setEditingSubject] = useState<{
    original: string;
    current: string;
  } | null>(null);

  // Config State
  const [config, setConfig] = useState<SchoolConfig>({
    schoolId,
    schoolName: "",
    academicYear: "",
    currentTerm: "",
    schoolReopenDate: "",
    vacationDate: "",
    nextTermBegins: "",
    termTransitionProcessed: false,
    headTeacherRemark: "",
    termEndDate: "",
    holidayDates: [],
    passMark: 50,
    failMark: 49,
    isPromotionalTerm: true,
    gradingScale: { A: 80, B: 70, C: 60, D: 45 },
    positionRule: "total",
    reportCardSettings: DEFAULT_REPORT_CARD_SETTINGS,
    notificationSettings: {
      adminWhatsAppNumber: "",
      adminSmsNumber: "",
      enableWhatsAppNotifications: true,
      enableSmsNotifications: true,
      enablePaymentAlerts: true,
      enableInvoiceNotifications: true,
    },
  });
  const [savingConfig, setSavingConfig] = useState(false);
  const availableClasses = React.useMemo(
    () =>
      getConfiguredClassRooms(
        schoolId,
        school?.schoolType,
        config.classRooms,
      ),
    [schoolId, school?.schoolType, config.classRooms],
  );
  const [savingNotificationSettings, setSavingNotificationSettings] =
    useState(false);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false); // New state
  const [newHolidayDate, setNewHolidayDate] = useState("");
  const [newHolidayReason, setNewHolidayReason] = useState("");
  const [newClassBaseId, setNewClassBaseId] = useState("");
  const [newClassSection, setNewClassSection] = useState("");
  const [savingClasses, setSavingClasses] = useState(false);

  // Danger Zone State
  const [showDangerZone, setShowDangerZone] = useState(false);
  const [termResetting, setTermResetting] = useState(false);
  const [showTermResetModal, setShowTermResetModal] = useState(false);
  const [showDeleteSubjectModal, setShowDeleteSubjectModal] = useState(false);
  const [subjectToDeleteName, setSubjectToDeleteName] = useState<string | null>(
    null,
  );
  const [showReportCardPreview, setShowReportCardPreview] = useState(false);
  const [showResetReportCardModal, setShowResetReportCardModal] =
    useState(false);
  const [resettingReportCardSettings, setResettingReportCardSettings] =
    useState(false);

  // Logo/Photo Upload State
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const classGroups = React.useMemo(() => {
    const groups: Record<string, ClassRoom[]> = {
      Creche: [],
      Nursery: [],
      KG: [],
      "Class 1-3": [],
      "Class 4-6": [],
      "JHS 1-3": [],
      Other: [],
    };

    availableClasses.forEach((cls: ClassRoom) => {
      const key = getClassGroupKey(cls.name);
      groups[key].push(cls);
    });

    return groups;
  }, [availableClasses]);

  const getGroupClassIds = (classId: string) => {
    const cls = availableClasses.find((item) => item.id === classId);
    if (!cls) return [classId];
    const groupKey = getClassGroupKey(cls.name);
    const group = classGroups[groupKey];
    return (group?.length ? group : [cls]).map((item) => item.id);
  };

  const fetchNotices = async () => {
    const data = await db.getNotices(schoolId);
    setNotices(data);
  };

  const fetchSubjects = async () => {
    if (selectedClassId) {
      const data = await db.getSubjects(schoolId, selectedClassId);
      setCurrentClassSubjects(data);
    }
  };

  const fetchConfig = async () => {
    const data = await db.getSchoolConfig(schoolId);
    setConfig((prev) => ({
      ...prev,
      schoolId,
      ...data,
      holidayDates: data.holidayDates || [],
      passMark: typeof data.passMark === "number" ? data.passMark : 50,
      failMark: typeof data.failMark === "number" ? data.failMark : 49,
      isPromotionalTerm:
        typeof data.isPromotionalTerm === "boolean"
          ? data.isPromotionalTerm
          : true,
      gradingScale: data.gradingScale || { A: 80, B: 70, C: 60, D: 45 },
      positionRule: data.positionRule || "total",
      reportCardSettings: {
        ...DEFAULT_REPORT_CARD_SETTINGS,
        ...(data.reportCardSettings || {}),
      },
      notificationSettings: {
        adminWhatsAppNumber:
          data.notificationSettings?.adminWhatsAppNumber || "",
        adminSmsNumber:
          data.notificationSettings?.adminSmsNumber ||
          data.notificationSettings?.adminWhatsAppNumber ||
          "",
        enableWhatsAppNotifications:
          data.notificationSettings?.enableWhatsAppNotifications ?? true,
        enableSmsNotifications:
          data.notificationSettings?.enableSmsNotifications ??
          data.notificationSettings?.enableWhatsAppNotifications ??
          true,
        enablePaymentAlerts:
          data.notificationSettings?.enablePaymentAlerts ?? true,
        enableInvoiceNotifications:
          data.notificationSettings?.enableInvoiceNotifications ?? true,
      },
    }));
  };

  const normalizeGhanaPhoneNumber = (value: string) => {
    let digits = String(value || "").replace(/\D/g, "");
    if (digits.startsWith("0") && digits.length === 10) {
      digits = `233${digits.slice(1)}`;
    } else if (digits.length === 9) {
      digits = `233${digits}`;
    } else if (digits.startsWith("233") && digits.length === 12) {
      digits = digits;
    }
    return digits;
  };

  const isValidGhanaPhoneNumber = (value: string) =>
    /^233(20|23|24|25|26|27|28|29|50|53|54|55|56|57|59)\d{7}$/.test(
      normalizeGhanaPhoneNumber(value),
    );

  useEffect(() => {
    fetchNotices();
    fetchConfig();
  }, [schoolId]);

  useEffect(() => {
    fetchSubjects();
  }, [selectedClassId, schoolId]);

  useEffect(() => {
    if (availableClasses.length > 0 && !selectedClassId) {
      setSelectedClassId(availableClasses[0].id);
    }
  }, [availableClasses, selectedClassId]);

  const saveClassRooms = async (classRooms: ClassRoom[], message: string) => {
    const nextConfig = { ...config, schoolId, classRooms };
    setSavingClasses(true);
    try {
      await db.updateSchoolConfig(nextConfig);
      setConfig(nextConfig);
      showToast(message, { type: "success" });
      await logActivity({
        schoolId,
        actorUid: user?.id || null,
        actorRole: user?.role || null,
        eventType: "classes_updated",
        entityId: schoolId,
        meta: {
          status: "success",
          module: "System Settings",
          classCount: classRooms.length,
          actorName: user?.fullName || "",
        },
      });
    } catch (error: any) {
      console.error("Failed to save classes", error);
      showToast(error?.message || "Failed to save classes.", { type: "error" });
    } finally {
      setSavingClasses(false);
    }
  };

  const handleAddClassStream = async () => {
    const baseClass = getDefaultFilteredClasses(school?.schoolType).find(
      (classRoom) => classRoom.id === newClassBaseId,
    );
    const section = normalizeClassName(newClassSection).toUpperCase();
    if (!baseClass || !section) {
      showToast("Select a class level and enter a stream name.", { type: "error" });
      return;
    }

    const name = `${baseClass.name}-${section}`;
    const current = getConfiguredClassRooms(
      schoolId,
      school?.schoolType,
      config.classRooms,
      true,
    );
    const nextId = createClassRoomId(baseClass.id, section);
    if (
      current.some(
        (classRoom) =>
          classRoom.id === nextId ||
          classRoom.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      showToast(`${name} already exists.`, { type: "error" });
      return;
    }

    const classRoom: ClassRoom = {
      id: nextId,
      schoolId,
      name,
      level: baseClass.level as ClassRoom["level"],
      baseClassId: baseClass.id,
      section,
      nextClassId: null,
      sortOrder: current.length,
      isActive: true,
    };
    await saveClassRooms([...current, classRoom], `${name} created.`);
    setNewClassSection("");
  };

  const handleClassRoomChange = async (
    classId: string,
    updates: Partial<ClassRoom>,
  ) => {
    if (updates.isActive === false) {
      const assignedStudents = await db.getStudents(schoolId, classId);
      if (assignedStudents.length > 0) {
        showToast(
          `Move the ${assignedStudents.length} student(s) out of this class before deactivating it.`,
          { type: "error" },
        );
        return;
      }
    }
    const current = getConfiguredClassRooms(
      schoolId,
      school?.schoolType,
      config.classRooms,
      true,
    );
    await saveClassRooms(
      current.map((classRoom) =>
        classRoom.id === classId ? { ...classRoom, ...updates } : classRoom,
      ),
      "Class configuration saved.",
    );
  };

  const handleRenameClassRoom = async (classId: string, value: string) => {
    const name = normalizeClassName(value);
    if (!name) {
      showToast("Class name cannot be empty.", { type: "error" });
      return;
    }
    const current = getConfiguredClassRooms(
      schoolId,
      school?.schoolType,
      config.classRooms,
      true,
    );
    if (
      current.some(
        (classRoom) =>
          classRoom.id !== classId &&
          classRoom.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      showToast(`${name} already exists.`, { type: "error" });
      return;
    }
    const classRoom = current.find((item) => item.id === classId);
    if (!classRoom || classRoom.name === name) return;
    await saveClassRooms(
      current.map((item) => (item.id === classId ? { ...item, name } : item)),
      "Class renamed.",
    );
  };

  const handleMoveClassRoom = async (classId: string, direction: -1 | 1) => {
    const current = getConfiguredClassRooms(
      schoolId,
      school?.schoolType,
      config.classRooms,
      true,
    );
    const index = current.findIndex((classRoom) => classRoom.id === classId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= current.length) return;
    const reordered = [...current];
    [reordered[index], reordered[targetIndex]] = [
      reordered[targetIndex],
      reordered[index],
    ];
    await saveClassRooms(
      reordered.map((classRoom, sortOrder) => ({ ...classRoom, sortOrder })),
      "Class order updated.",
    );
  };

  // --- Config Handlers ---
  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      // Save primary config first
      await db.updateSchoolConfig({
        ...config,
        schoolId, // Explicitly ensure schoolId is passed
        holidayDates: config.holidayDates || [],
      });
      
      // Success feedback immediately after primary save
      showToast("Configuration saved successfully!", { type: "success" });
      setSavingConfig(false);

      // Log activity in background without awaiting
      logActivity({
        schoolId,
        actorUid: user?.id || null,
        actorRole: user?.role || null,
        eventType: "settings_updated",
        entityId: schoolId,
        meta: {
          status: "success",
          module: "System Settings",
          actorName: user?.fullName || "",
        },
      }).catch(err => console.warn("Background activity log failed", err));

    } catch (error: any) {
      console.error("Failed to save config", error);
      showToast("Failed to save configuration. Please try again.", {
        type: "error",
      });
      setSavingConfig(false);
      
      logActivity({
        schoolId,
        actorUid: user?.id || null,
        actorRole: user?.role || null,
        eventType: "settings_update_failed",
        entityId: schoolId,
        meta: {
          status: "failed",
          module: "System Settings",
          error: error?.message || "Unknown error",
          actorName: user?.fullName || "",
        },
      }).catch(() => {});
    }
  };

  const handleSaveNotificationSettings = async () => {
    const settings = config.notificationSettings || {};
    const normalizedAdminPhone = normalizeGhanaPhoneNumber(
      settings.adminSmsNumber || settings.adminWhatsAppNumber || "",
    );

    if (
      settings.enableSmsNotifications &&
      !isValidGhanaPhoneNumber(normalizedAdminPhone)
    ) {
      showToast("Enter a valid Ghana SMS number.", { type: "error" });
      return;
    }

    const nextConfig = {
      ...config,
      schoolId,
      notificationSettings: {
        adminSmsNumber: normalizedAdminPhone,
        adminWhatsAppNumber: normalizedAdminPhone,
        enableSmsNotifications: Boolean(settings.enableSmsNotifications),
        enableWhatsAppNotifications: Boolean(
          settings.enableSmsNotifications,
        ),
        enablePaymentAlerts: Boolean(settings.enablePaymentAlerts),
        enableInvoiceNotifications: Boolean(settings.enableInvoiceNotifications),
      },
    };

    setSavingNotificationSettings(true);
    try {
      setConfig(nextConfig);
      await db.updateSchoolConfig(nextConfig);
      showToast("Notification settings saved.", { type: "success" });
      logActivity({
        schoolId,
        actorUid: user?.id || null,
        actorRole: user?.role || null,
        eventType: "notification_settings_updated",
        entityId: schoolId,
        meta: {
          status: "success",
          module: "System Settings",
          actorName: user?.fullName || "",
        },
      }).catch(() => {});
    } catch (error: any) {
      console.error("Failed to save notification settings", error);
      showToast("Failed to save notification settings.", { type: "error" });
    } finally {
      setSavingNotificationSettings(false);
    }
  };

  const handleAddHolidayDate = async () => {
    if (!newHolidayDate) return;
    const trimmedReason = newHolidayReason.trim();
    const current = config.holidayDates || [];
    if (current.some((h) => h.date === newHolidayDate)) {
      showToast("Holiday date already exists.", { type: "error" });
      return;
    }
    const nextConfig = {
      ...config,
      holidayDates: [
        ...current,
        { date: newHolidayDate, reason: trimmedReason || undefined },
      ].sort((a, b) => a.date.localeCompare(b.date)),
    };
    setConfig(nextConfig);
    try {
      await db.updateSchoolConfig({
        ...nextConfig,
        schoolId, // Explicitly ensure schoolId is passed
        holidayDates: nextConfig.holidayDates || [],
      });
      showToast("Holiday date saved.", { type: "success" });
      await logActivity({
        schoolId,
        actorUid: user?.id || null,
        actorRole: user?.role || null,
        eventType: "holiday_added",
        entityId: newHolidayDate,
        meta: {
          status: "success",
          module: "System Settings",
          date: newHolidayDate,
          reason: trimmedReason || "",
          actorName: user?.fullName || "",
        },
      });
      setNewHolidayDate("");
      setNewHolidayReason("");
    } catch (error: any) {
      console.error("Failed to add holiday", error);
      showToast("Failed to add holiday. Please try again.", {
        type: "error",
      });
      await logActivity({
        schoolId,
        actorUid: user?.id || null,
        actorRole: user?.role || null,
        eventType: "holiday_add_failed",
        entityId: newHolidayDate,
        meta: {
          status: "failed",
          module: "System Settings",
          date: newHolidayDate,
          error: error?.message || "Unknown error",
          actorName: user?.fullName || "",
        },
      });
    }
  };

  const handleRemoveHolidayDate = async (date: string) => {
    const current = config.holidayDates || [];
    const nextConfig = {
      ...config,
      holidayDates: current.filter((h) => h.date !== date),
    };
    setConfig(nextConfig);
    try {
      await db.updateSchoolConfig({
        ...nextConfig,
        schoolId, // Explicitly ensure schoolId is passed
        holidayDates: nextConfig.holidayDates || [],
      });
      showToast("Holiday date removed.", { type: "success" });
      await logActivity({
        schoolId,
        actorUid: user?.id || null,
        actorRole: user?.role || null,
        eventType: "holiday_removed",
        entityId: date,
        meta: {
          status: "success",
          module: "System Settings",
          date,
          actorName: user?.fullName || "",
        },
      });
    } catch (error: any) {
      console.error("Failed to remove holiday", error);
      showToast("Failed to remove holiday. Please try again.", {
        type: "error",
      });
      await logActivity({
        schoolId,
        actorUid: user?.id || null,
        actorRole: user?.role || null,
        eventType: "holiday_remove_failed",
        entityId: date,
        meta: {
          status: "failed",
          module: "System Settings",
          date,
          error: error?.message || "Unknown error",
          actorName: user?.fullName || "",
        },
      });
    }
  };

  const handleCreateSystemBackup = async () => {
    setIsCreatingBackup(true);
    try {
      await db.createSystemBackup(config);
      showToast("Full system backup created successfully!", {
        type: "success",
      });
    } catch (error) {
      console.error("Error creating term backup:", error);
      showToast("Failed to create full system backup. Please try again.", {
        type: "error",
      });
      await logActivity({
        schoolId,
        actorUid: user?.id || null,
        actorRole: user?.role || null,
        eventType: "backup_create_failed",
        entityId: `${config.currentTerm}-${config.academicYear}`,
        meta: {
          status: "failed",
          module: "System Settings",
          term: config.currentTerm,
          academicYear: config.academicYear,
          error: (error as any)?.message || "Unknown error",
          actorName: user?.fullName || "",
        },
      });
    } finally {
      setIsCreatingBackup(false);
    }
  };

  /** Compress an image File to a base64 JPEG string (max 300×300, ~30 KB). */
  const compressImageToBase64 = (file: File, maxPx = 300, quality = 0.7): Promise<string> =>
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

  const handleProfilePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploadingPhoto(true);
    try {
      const base64 = await compressImageToBase64(file);
      await db.updateUserProfilePhoto(user.id, base64);
      updateUser({ photoUrl: base64 }); // update in-memory user so avatar refreshes immediately
      showToast("Profile photo updated successfully!", { type: "success" });

      await logActivity({
        schoolId,
        actorUid: user.id,
        actorRole: user.role,
        eventType: "profile_photo_updated",
        entityId: user.id,
        meta: {
          status: "success",
          module: "System Settings",
          actorName: user.fullName || "",
        },
      });
    } catch (error) {
      console.error("Profile photo upload error:", error);
      showToast("Failed to upload profile photo.", { type: "error" });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingLogo(true);
    try {
      // Compress logo to max 400px, stored as base64 in Firestore (free, no Storage needed)
      const base64 = await compressImageToBase64(file, 400, 0.8);
      const updatedConfig = { ...config, schoolId, logoUrl: base64 };
      setConfig(updatedConfig);
      await db.updateSchoolConfig(updatedConfig);
      const idToken = await auth.currentUser?.getIdToken();
      const brandingResponse = await fetch(`${API_BASE_URL}/api/schools/branding`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({
          schoolId,
          logoUrl: base64,
          schoolName: config.schoolName || school?.name || "",
        }),
      });
      const brandingBody = await brandingResponse.json().catch(() => ({}));
      if (!brandingResponse.ok || brandingBody.success === false) {
        throw new Error(brandingBody.error || "Failed to sync logo to school profile.");
      }
      refreshSchool();
      window.dispatchEvent(new Event("school-branding-updated"));
      showToast("Logo uploaded successfully!", { type: "success" });
      await logActivity({
        schoolId,
        actorUid: user?.id || null,
        actorRole: user?.role || null,
        eventType: "logo_updated",
        entityId: schoolId,
        meta: {
          status: "success",
          module: "System Settings",
          fileName: file.name,
          actorName: user?.fullName || "",
        },
      });
    } catch (error) {
      console.error("Logo upload error:", error);
      showToast("Failed to upload logo. Please try again.", { type: "error" });
      await logActivity({
        schoolId,
        actorUid: user?.id || null,
        actorRole: user?.role || null,
        eventType: "logo_update_failed",
        entityId: schoolId,
        meta: {
          status: "failed",
          module: "System Settings",
          fileName: file.name,
          error: (error as any)?.message || "Unknown error",
          actorName: user?.fullName || "",
        },
      });
    } finally {
      setUploadingLogo(false);
    }
  };

  // --- Notices Handlers ---
  const handleAddNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNotice.trim() || !noticeDate) return;

    setIsAddingNotice(true);
    try {
      // Create date object from YYYY-MM-DD string safely
      const [year, month, day] = noticeDate.split("-").map(Number);
      const dateObj = new Date(year, month - 1, day);
      const formattedDate = dateObj.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
      });

      await db.addNotice({
        id: Math.random().toString(36).substr(2, 9),
        schoolId,
        message: newNotice,
        date: formattedDate,
        type: noticeType,
        createdAt: Date.now(),
      });
      setNewNotice("");
      // Keep the date as is or reset to today - typically easier to keep it if adding multiple for same day,
      // but resetting prevents accidental wrong dates. Let's keep it.
      fetchNotices();
      showToast("Notice added successfully!", { type: "success" });
      await logActivity({
        schoolId,
        actorUid: user?.id || null,
        actorRole: user?.role || null,
        eventType: "notice_created",
        entityId: noticeDate,
        meta: {
          status: "success",
          module: "System Settings",
          noticeType,
          date: noticeDate,
          actorName: user?.fullName || "",
        },
      });
    } catch (error) {
      console.error("Error adding notice:", error);
      showToast("Failed to add notice. Please try again.", { type: "error" });
      await logActivity({
        schoolId,
        actorUid: user?.id || null,
        actorRole: user?.role || null,
        eventType: "notice_create_failed",
        entityId: noticeDate,
        meta: {
          status: "failed",
          module: "System Settings",
          noticeType,
          date: noticeDate,
          error: (error as any)?.message || "Unknown error",
          actorName: user?.fullName || "",
        },
      });
    } finally {
      setIsAddingNotice(false);
    }
  };

  const handleDeleteNotice = async (id: string) => {
    try {
      await db.deleteNotice(id);
      fetchNotices();
      await logActivity({
        schoolId,
        actorUid: user?.id || null,
        actorRole: user?.role || null,
        eventType: "notice_deleted",
        entityId: id,
        meta: {
          status: "success",
          module: "System Settings",
          actorName: user?.fullName || "",
        },
      });
    } catch (error: any) {
      console.error("Failed to delete notice", error);
      showToast("Failed to delete notice. Please try again.", {
        type: "error",
      });
      await logActivity({
        schoolId,
        actorUid: user?.id || null,
        actorRole: user?.role || null,
        eventType: "notice_delete_failed",
        entityId: id,
        meta: {
          status: "failed",
          module: "System Settings",
          error: error?.message || "Unknown error",
          actorName: user?.fullName || "",
        },
      });
    }
  };

  // --- Subjects Handlers ---
  const handleAddSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubjectName.trim() || !selectedClassId || isAddingSubject) return;
    const targetClassIds = getGroupClassIds(selectedClassId);
    setIsAddingSubject(true);
    try {
      await Promise.all(
        targetClassIds.map((classId) =>
          db.addSubject(classId, newSubjectName.trim(), schoolId),
        ),
      );
      setNewSubjectName("");
      fetchSubjects();
      showToast("Subject added successfully!", { type: "success" });
      await logActivity({
        schoolId,
        actorUid: user?.id || null,
        actorRole: user?.role || null,
        eventType: "subject_created",
        entityId: newSubjectName.trim(),
        meta: {
          status: "success",
          module: "System Settings",
          classGroup: selectedClassId,
          actorName: user?.fullName || "",
        },
      });
    } catch (error: any) {
      console.error("Failed to add subject", error);
      showToast("Failed to add subject. Please try again.", {
        type: "error",
      });
      await logActivity({
        schoolId,
        actorUid: user?.id || null,
        actorRole: user?.role || null,
        eventType: "subject_create_failed",
        entityId: newSubjectName.trim(),
        meta: {
          status: "failed",
          module: "System Settings",
          classGroup: selectedClassId,
          error: error?.message || "Unknown error",
          actorName: user?.fullName || "",
        },
      });
    } finally {
      setIsAddingSubject(false);
    }
  };

  const handleDeleteSubject = (name: string) => {
    setSubjectToDeleteName(name);
    setShowDeleteSubjectModal(true);
  };

  const confirmDeleteSubject = async () => {
    if (!subjectToDeleteName || !selectedClassId) return;
    setShowDeleteSubjectModal(false);
    try {
      const targetClassIds = getGroupClassIds(selectedClassId);
      await Promise.all(
        targetClassIds.map((classId) =>
          db.deleteSubject(classId, subjectToDeleteName, schoolId),
        ),
      );
      fetchSubjects();
      showToast(`Subject "${subjectToDeleteName}" deleted successfully!`, {
        type: "success",
      });
      await logActivity({
        schoolId,
        actorUid: user?.id || null,
        actorRole: user?.role || null,
        eventType: "subject_deleted",
        entityId: subjectToDeleteName,
        meta: {
          status: "success",
          module: "System Settings",
          classGroup: selectedClassId,
          actorName: user?.fullName || "",
        },
      });
    } catch (error) {
      console.error("Error deleting subject:", error);
      showToast("Failed to delete subject. Please try again.", {
        type: "error",
      });
      await logActivity({
        schoolId,
        actorUid: user?.id || null,
        actorRole: user?.role || null,
        eventType: "subject_delete_failed",
        entityId: subjectToDeleteName,
        meta: {
          status: "failed",
          module: "System Settings",
          classGroup: selectedClassId,
          error: (error as any)?.message || "Unknown error",
          actorName: user?.fullName || "",
        },
      });
    } finally {
      setSubjectToDeleteName(null);
    }
  };

  const startEditSubject = (name: string) => {
    setEditingSubject({ original: name, current: name });
  };

  const saveEditSubject = async () => {
    if (!editingSubject || !editingSubject.current.trim() || !selectedClassId)
      return;
    const targetClassIds = getGroupClassIds(selectedClassId);
    try {
      await Promise.all(
        targetClassIds.map((classId) =>
          db.updateSubject(
            classId,
            editingSubject.original,
            editingSubject.current.trim(),
            schoolId,
          ),
        ),
      );
      setEditingSubject(null);
      fetchSubjects();
      showToast("Subject updated successfully!", { type: "success" });
      await logActivity({
        schoolId,
        actorUid: user?.id || null,
        actorRole: user?.role || null,
        eventType: "subject_updated",
        entityId: editingSubject.original,
        meta: {
          status: "success",
          module: "System Settings",
          classGroup: selectedClassId,
          nextName: editingSubject.current.trim(),
          actorName: user?.fullName || "",
        },
      });
    } catch (error: any) {
      console.error("Failed to update subject", error);
      showToast("Failed to update subject. Please try again.", {
        type: "error",
      });
      await logActivity({
        schoolId,
        actorUid: user?.id || null,
        actorRole: user?.role || null,
        eventType: "subject_update_failed",
        entityId: editingSubject.original,
        meta: {
          status: "failed",
          module: "System Settings",
          classGroup: selectedClassId,
          error: error?.message || "Unknown error",
          actorName: user?.fullName || "",
        },
      });
    }
  };

  // --- Danger Zone Handler ---
  const handleTermReset = () => {
    setShowTermResetModal(true);
  };

  const deleteCollectionInBatches = async (collectionName: string) => {
    const collectionRef = collection(firestore, collectionName);
    const batchSize = 200;

    while (true) {
      const snapshot = await getDocs(query(collectionRef, limit(batchSize)));
      if (snapshot.empty) break;

      const batch = writeBatch(firestore);
      snapshot.docs.forEach((docSnap) => {
        batch.delete(docSnap.ref);
      });
      await batch.commit();

      if (snapshot.size < batchSize) break;
    }
  };

  const confirmTermReset = async () => {
    setShowTermResetModal(false);
    setTermResetting(true);
    try {
      if (canUseBackups) {
        await db.createTermBackup(
          config,
          config.currentTerm,
          config.academicYear,
        );
      }

      const collectionsToDelete = [
        "attendance",
        "assessments",
        "teacher_attendance",
        "notices",
        "student_remarks",
        "admin_remarks",
        "student_skills",
        "admin_notifications",
      ];

      await Promise.all(
        collectionsToDelete.map(async (colName) => {
          console.log(`Deleting collection: ${colName}`);
          await deleteCollectionInBatches(colName);
        }),
      );

      // Reset relevant school config fields
      const schoolConfigRef = doc(firestore, "settings", schoolId);
      await setDoc(
        schoolConfigRef,
        {
          schoolReopenDate: "",
          vacationDate: "",
          nextTermBegins: "",
        },
        { merge: true },
      );

      showToast("Term data reset successfully!", { type: "success" });
      await logActivity({
        schoolId,
        actorUid: user?.id || null,
        actorRole: user?.role || null,
        eventType: "term_reset",
        entityId: schoolId,
        meta: {
          status: "success",
          module: "System Settings",
          actorName: user?.fullName || "",
        },
      });
      // Reload the page to reflect changes
      window.location.reload();
    } catch (error: any) {
      console.error("Term Reset error:", error);
      showToast(`Term Reset Failed: ${error.message}`, { type: "error" });
      await logActivity({
        schoolId,
        actorUid: user?.id || null,
        actorRole: user?.role || null,
        eventType: "term_reset_failed",
        entityId: schoolId,
        meta: {
          status: "failed",
          module: "System Settings",
          error: error?.message || "Unknown error",
          actorName: user?.fullName || "",
        },
      });
  } finally {
      setTermResetting(false);
    }
  };

  const reportCardSettings =
    config.reportCardSettings || DEFAULT_REPORT_CARD_SETTINGS;
  const updateReportCardSettings = (
    updates: Partial<typeof DEFAULT_REPORT_CARD_SETTINGS>,
  ) => {
    setConfig({
      ...config,
      reportCardSettings: {
        ...DEFAULT_REPORT_CARD_SETTINGS,
        ...(config.reportCardSettings || {}),
        ...updates,
      },
    });
  };
  const resetReportCardSettings = () => {
    setShowResetReportCardModal(true);
  };
  const confirmResetReportCardSettings = async () => {
    setResettingReportCardSettings(true);
    try {
      const defaultSettings = { ...DEFAULT_REPORT_CARD_SETTINGS };
      await setDoc(
        doc(firestore, "settings", schoolId),
        { reportCardSettings: defaultSettings },
        { merge: true },
      );
      setConfig((current) => ({
        ...current,
        reportCardSettings: defaultSettings,
      }));
      setShowResetReportCardModal(false);
      showToast("Report card customization reset to default.", {
        type: "success",
      });
      logActivity({
        schoolId,
        actorUid: user?.id || null,
        actorRole: user?.role || null,
        eventType: "report_card_customization_reset",
        entityId: schoolId,
        meta: {
          status: "success",
          module: "System Settings",
          actorName: user?.fullName || "",
        },
      }).catch((error) =>
        console.warn("Background activity log failed", error),
      );
    } catch (error) {
      console.error("Failed to reset report card customization", error);
      showToast("Could not reset the report card customization. Try again.", {
        type: "error",
      });
    } finally {
      setResettingReportCardSettings(false);
    }
  };
  const sampleReportCardData = {
    schoolInfo: {
      name: school?.name || config.schoolName || "Sample School",
      logoUrl: config.logoUrl || school?.logoUrl || "",
      address: school?.address || config.address || "School Address",
      phone: school?.phone || config.phone || "0240000000",
      email: config.email || "",
      academicYear: config.academicYear || "2026-2027",
      term: config.currentTerm || "Term 1",
    },
    studentInfo: {
      name: "Sample Student",
      photoUrl: "",
      gender: "Female",
      dob: "2015-01-01",
      class: "Class 1-A",
      classTeacher: "Class Teacher",
    },
    attendance: {
      totalDays: 60,
      presentDays: 56,
      absentDays: 4,
      attendancePercentage: 93,
    },
    performance: [
      {
        subject: "English Language",
        testScore: 18,
        homeworkScore: 9,
        projectScore: 9,
        examScore: 58,
        total: 94,
      },
      {
        subject: "Mathematics",
        testScore: 17,
        homeworkScore: 8,
        projectScore: 10,
        examScore: 55,
        total: 90,
      },
    ],
    allStudentsAssessments: [
      { subject: "English Language", total: 94 },
      { subject: "English Language", total: 88 },
      { subject: "Mathematics", total: 90 },
      { subject: "Mathematics", total: 84 },
    ],
    gradingScale: config.gradingScale,
    reportCardSettings,
    summary: {
      totalScore: 184,
      averageScore: "92.0",
      overallGrade: "A",
      classPosition: "1st",
      totalStudents: 32,
    },
    skills: {
      punctuality: "Excellent",
      neatness: "Very Good",
      conduct: "Excellent",
      attitudeToWork: "Very Good",
      classParticipation: "Excellent",
      homeworkCompletion: "Very Good",
    },
    remarks: {
      teacher: "A strong performance. Keep it up.",
      headTeacher:
        config.headTeacherRemark || "An outstanding performance.",
    },
    promotion: {
      status: "Promoted to Class 2-A",
      isPromotionalTerm: config.isPromotionalTerm,
    },
    termDates: {
      endDate: config.termEndDate || "",
      reopeningDate: config.nextTermBegins || "",
      vacationDate: config.vacationDate || "",
    },
  };

  return (
    <Layout title="System Settings">
      <div
        className="mx-auto max-w-7xl space-y-6"
        data-assistant-focus="settings"
      >
        <div className="relative overflow-hidden rounded-3xl border border-slate-200/70 bg-gradient-to-br from-indigo-50 via-white to-emerald-50 p-5 shadow-sm sm:p-7">
          <div className="absolute -top-16 -right-16 h-40 w-40 rounded-full bg-indigo-200/40 blur-3xl" />
          <div className="absolute -bottom-20 -left-16 h-48 w-48 rounded-full bg-emerald-200/40 blur-3xl" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="flex items-center gap-3 text-2xl font-bold text-slate-900 sm:text-3xl">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-200">
                  <Settings size={21} />
                </span>
                System Settings
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Configure branding, academic setup, report cards, notices, and
                backups from one organized control center.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[520px]">
              {[
                ["Term", config.currentTerm || "Not set"],
                ["Year", config.academicYear || "Not set"],
                ["Classes", String(availableClasses.length)],
                ["Notices", String(notices.length)],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 shadow-sm backdrop-blur"
                >
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                    {label}
                  </p>
                  <p className="mt-1 truncate text-sm font-bold text-slate-800">
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <section className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#0B4A82]">
                <Lock size={20} />
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-slate-800">
                  Account Security
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Set up an authenticator app to add two-factor protection to
                  your admin login.
                </p>
              </div>
            </div>
            <Link
              to="/account/mfa-setup"
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#0B4A82] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#083a66]"
            >
              <Shield size={16} />
              Open MFA Setup
            </Link>
          </div>
        </section>

        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
          {/* Left Column */}
          <div className="flex flex-col gap-6">
            {/* Profile & Logo Customization */}
            <div
              className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-sm sm:p-6"
              style={{ order: 1 }}
            >
              <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                <span className="h-8 w-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center">
                  <Shield size={18} />
                </span>
                Profile & Branding
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Personal Profile Photo */}
                <div className="flex flex-col items-center p-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <p className="text-sm font-semibold text-slate-700 mb-4">Your Profile Photo</p>
                  <div className="relative group">
                    <UserAvatar user={user} size="xl" className="ring-4 ring-white shadow-lg" />
                    <label className="absolute inset-0 flex items-center justify-center bg-black/40 text-white opacity-0 group-hover:opacity-100 rounded-full cursor-pointer transition-opacity">
                      <div className="text-center">
                        <Edit size={20} className="mx-auto mb-1" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Change</span>
                      </div>
                      <input type="file" className="hidden" accept="image/*" onChange={handleProfilePhotoUpload} disabled={uploadingPhoto} />
                    </label>
                    {uploadingPhoto && (
                      <div className="absolute inset-0 flex items-center justify-center bg-white/60 rounded-full">
                        <div className="h-6 w-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-4 text-center">
                    This photo will be visible to other staff and parents.
                  </p>
                </div>

                {/* School Logo */}
                <div className="flex flex-col items-center p-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <p className="text-sm font-semibold text-slate-700 mb-4">School Logo</p>
                  <div className="relative group">
                    <div className="h-24 w-24 rounded-2xl bg-white p-2 shadow-lg border border-slate-100 flex items-center justify-center overflow-hidden">
                      <img
                        src={config.logoUrl || schoolLogo}
                        alt="School Logo"
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                    <label className="absolute inset-0 flex items-center justify-center bg-black/40 text-white opacity-0 group-hover:opacity-100 rounded-2xl cursor-pointer transition-opacity">
                      <div className="text-center">
                        <Edit size={20} className="mx-auto mb-1" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Upload</span>
                      </div>
                      <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} disabled={uploadingLogo} />
                    </label>
                    {uploadingLogo && (
                      <div className="absolute inset-0 flex items-center justify-center bg-white/60 rounded-2xl">
                        <div className="h-6 w-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-4 text-center">
                    Used on report cards, receipts, and dashboards.
                  </p>
                </div>
              </div>
            </div>

            {/* Notification Settings */}
            <div
              className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-sm sm:p-6"
              style={{ order: 4 }}
            >
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <span className="h-8 w-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center">
                      <Bell size={18} />
                    </span>
                    Notification Settings
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Payment alerts and receipts are sent by SMS.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSaveNotificationSettings}
                  disabled={savingNotificationSettings}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {savingNotificationSettings ? (
                    <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                  ) : (
                    <Save size={14} />
                  )}
                  {savingNotificationSettings ? "Saving..." : "Save"}
                </button>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Admin SMS Number
                  </label>
                  <input
                    type="tel"
                    value={
                      config.notificationSettings?.adminSmsNumber ||
                      config.notificationSettings?.adminWhatsAppNumber ||
                      ""
                    }
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        notificationSettings: {
                          ...(config.notificationSettings || {}),
                          adminSmsNumber: e.target.value,
                          adminWhatsAppNumber: e.target.value,
                        },
                      })
                    }
                    onBlur={(e) =>
                      setConfig({
                        ...config,
                        notificationSettings: {
                          ...(config.notificationSettings || {}),
                          adminSmsNumber: normalizeGhanaPhoneNumber(
                            e.target.value,
                          ),
                          adminWhatsAppNumber: normalizeGhanaPhoneNumber(
                            e.target.value,
                          ),
                        },
                      })
                    }
                    placeholder="0541234567"
                    className="w-full border border-slate-200 p-2.5 rounded-xl bg-white text-slate-800 focus:ring-2 focus:ring-emerald-200 outline-none"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Local Ghana numbers are saved as international digits, for
                    example 0201008784 becomes 233201008784.
                  </p>
                </div>

                {[
                  {
                    key: "enableSmsNotifications",
                    label: "Enable SMS Notifications",
                  },
                  { key: "enablePaymentAlerts", label: "Enable Payment Alerts" },
                  {
                    key: "enableInvoiceNotifications",
                    label: "Enable Invoice Notifications",
                  },
                ].map((item) => (
                  <label
                    key={item.key}
                    className="flex items-center justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3"
                  >
                    <span className="text-sm font-medium text-slate-700">
                      {item.label}
                    </span>
                    <input
                      type="checkbox"
                      checked={Boolean(
                        (config.notificationSettings as any)?.[item.key],
                      )}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          notificationSettings: {
                            ...(config.notificationSettings || {}),
                            [item.key]: e.target.checked,
                          },
                        })
                      }
                      className="h-5 w-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                  </label>
                ))}
              </div>
            </div>

            {/* Classes & Streams */}
            <div
              className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-sm sm:p-6"
              style={{ order: 3 }}
            >
              <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <span className="h-8 w-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
                      <School size={18} />
                    </span>
                    Classes & Streams
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Create separate streams such as Class 1-A and Class 1-B.
                  </p>
                </div>
                {savingClasses && (
                  <span className="h-5 w-5 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin" />
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 mb-5">
                <select
                  value={newClassBaseId}
                  onChange={(event) => setNewClassBaseId(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-indigo-200"
                >
                  <option value="">Select class level</option>
                  {getDefaultFilteredClasses(school?.schoolType).map((classRoom) => (
                    <option key={classRoom.id} value={classRoom.id}>
                      {classRoom.name}
                    </option>
                  ))}
                </select>
                <input
                  value={newClassSection}
                  onChange={(event) => setNewClassSection(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleAddClassStream();
                    }
                  }}
                  placeholder="Stream, e.g. A or Gold"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-indigo-200"
                />
                <button
                  type="button"
                  onClick={() => void handleAddClassStream()}
                  disabled={savingClasses}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  <Plus size={16} /> Add Stream
                </button>
              </div>

              <div className="space-y-3 max-h-[32rem] overflow-y-auto pr-1">
                {getConfiguredClassRooms(
                  schoolId,
                  school?.schoolType,
                  config.classRooms,
                  true,
                ).map((classRoom, classIndex, classRooms) => (
                  <div
                    key={classRoom.id}
                    className={`rounded-xl border p-4 ${
                      classRoom.isActive === false
                        ? "border-slate-200 bg-slate-50 opacity-70"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <input
                          key={`${classRoom.id}-${classRoom.name}`}
                          defaultValue={classRoom.name}
                          disabled={savingClasses}
                          onBlur={(event) =>
                            void handleRenameClassRoom(
                              classRoom.id,
                              event.target.value,
                            )
                          }
                          className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1 font-bold text-slate-800 outline-none hover:border-slate-200 focus:border-indigo-300 focus:bg-white"
                        />
                        <p className="text-xs text-slate-500">
                          {classRoom.section
                            ? `Stream ${classRoom.section}`
                            : "Default class"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={savingClasses || classIndex === 0}
                          onClick={() => void handleMoveClassRoom(classRoom.id, -1)}
                          className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 disabled:opacity-30"
                          aria-label={`Move ${classRoom.name} up`}
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          type="button"
                          disabled={savingClasses || classIndex === classRooms.length - 1}
                          onClick={() => void handleMoveClassRoom(classRoom.id, 1)}
                          className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 disabled:opacity-30"
                          aria-label={`Move ${classRoom.name} down`}
                        >
                          <ArrowDown size={14} />
                        </button>
                        <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
                          <input
                            type="checkbox"
                            checked={classRoom.isActive !== false}
                            disabled={savingClasses}
                            onChange={(event) =>
                              void handleClassRoomChange(classRoom.id, {
                                isActive: event.target.checked,
                              })
                            }
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          Active
                        </label>
                      </div>
                    </div>
                    <div className="mt-3">
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        Promote students to
                      </label>
                      <select
                        value={classRoom.nextClassId || ""}
                        disabled={savingClasses}
                        onChange={(event) =>
                          void handleClassRoomChange(classRoom.id, {
                            nextClassId: event.target.value || null,
                          })
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-indigo-200"
                      >
                        <option value="">No promotion destination</option>
                        {availableClasses
                          .filter((candidate) => candidate.id !== classRoom.id)
                          .map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>
                              {candidate.name}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* General Config */}
            <div
              className="rounded-3xl border border-sky-100 bg-white p-5 shadow-sm sm:p-6"
              style={{ order: 2 }}
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-xl font-bold text-slate-800">
                    General Configuration
                  </h2>
                  <p className="text-xs text-slate-500">
                    Academic year, term, and key school dates.
                  </p>
                </div>
                <button
                  onClick={handleSaveConfig}
                  disabled={savingConfig}
                  className="flex items-center text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-full transition-colors"
                >
                  <Save size={14} className="mr-1" />{" "}
                  {savingConfig ? "Saving..." : "Save Changes"}
                </button>
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Academic Year
                    </label>
                    <input
                      type="text"
                      value={config.academicYear}
                      onChange={(e) =>
                        setConfig({ ...config, academicYear: e.target.value })
                      }
                      className="w-full border border-slate-200 p-2.5 rounded-xl bg-white text-slate-800 focus:ring-2 focus:ring-emerald-200 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Current Term
                    </label>
                    <select
                      value={config.currentTerm}
                      onChange={(e) =>
                        setConfig({ ...config, currentTerm: e.target.value })
                      }
                      className="w-full border border-slate-200 p-2.5 rounded-xl bg-white text-slate-800 focus:ring-2 focus:ring-emerald-200 outline-none"
                    >
                      <option value="Term 1">Term 1</option>
                      <option value="Term 2">Term 2</option>
                      <option value="Term 3">Term 3</option>
                    </select>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100">
                  <h3 className="font-medium text-slate-800 mb-2">
                    School Information
                  </h3>
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        School Re-open Date
                      </label>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
                        <input
                          type="date"
                          value={config.schoolReopenDate}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              schoolReopenDate: e.target.value,
                            })
                          }
                          className="w-full border border-slate-200 pl-10 pr-3 py-2.5 rounded-xl bg-white text-slate-800 focus:ring-2 focus:ring-emerald-200 outline-none"
                        />
                      </div>
                    </div>
                    {/* New Vacation Date Input */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Term Vacation Date
                      </label>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
                        <input
                          type="date"
                          value={config.vacationDate}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              vacationDate: e.target.value,
                            })
                          }
                          className="w-full border border-slate-200 pl-10 pr-3 py-2.5 rounded-xl bg-white text-slate-800 focus:ring-2 focus:ring-emerald-200 outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Next Term Begins
                      </label>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
                        <input
                          type="date"
                          value={config.nextTermBegins || ""}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              nextTermBegins: e.target.value,
                            })
                          }
                          className="w-full border border-slate-200 pl-10 pr-3 py-2.5 rounded-xl bg-white text-slate-800 focus:ring-2 focus:ring-emerald-200 outline-none"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
                    <div className="flex items-center gap-2 text-amber-900 font-semibold">
                      <AlertTriangle className="h-5 w-5" />
                      Holiday Dates (exclude from term totals)
                    </div>
                    <p className="mt-1 text-xs text-amber-800">
                      Add dates here to remove them from term total days and
                      attendance analytics.
                    </p>
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-[180px_1fr_auto] gap-3 items-center">
                      <div className="relative">
                        <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-amber-400 pointer-events-none" />
                        <input
                          type="date"
                          value={newHolidayDate}
                          onChange={(e) => setNewHolidayDate(e.target.value)}
                          className="w-full border border-amber-200 pl-10 pr-3 py-2.5 rounded-xl bg-white text-slate-800 focus:ring-2 focus:ring-amber-200 outline-none"
                        />
                      </div>
                      <input
                        type="text"
                        value={newHolidayReason}
                        onChange={(e) => setNewHolidayReason(e.target.value)}
                        placeholder="Reason (optional) e.g. Independence Day"
                        className="w-full border border-amber-200 px-3 py-2.5 rounded-xl bg-white text-slate-800 focus:ring-2 focus:ring-amber-200 outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleAddHolidayDate}
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700"
                      >
                        <Plus size={16} />
                        Add
                      </button>
                    </div>
                    <div className="mt-4 space-y-2">
                      {(config.holidayDates || []).length === 0 ? (
                        <div className="text-xs text-amber-700">
                          No holiday dates added yet.
                        </div>
                      ) : (
                        (config.holidayDates || []).map((h) => (
                          <div
                            key={h.date}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-white px-3 py-2"
                          >
                            <div>
                              <p className="text-sm font-semibold text-amber-900">
                                {h.date}
                              </p>
                              {h.reason && (
                                <p className="text-xs text-amber-700">
                                  {h.reason}
                                </p>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveHolidayDate(h.date)}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:text-rose-700"
                            >
                              <Trash2 size={14} />
                              Remove
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div
              className="rounded-3xl border border-indigo-100 bg-white p-5 shadow-sm sm:p-6"
              style={{ order: 5 }}
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-xl font-bold text-slate-800">
                    Grading & Remark Settings
                  </h2>
                  <p className="text-xs text-slate-500">
                    Configure grade thresholds, positions, and default remarks.
                  </p>
                </div>
                <button
                  onClick={handleSaveConfig}
                  disabled={savingConfig}
                  className="flex items-center text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-full transition-colors"
                >
                  <Save size={14} className="mr-1" />{" "}
                  {savingConfig ? "Saving..." : "Save Changes"}
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Default Head Teacher Remark
                  </label>
                  <textarea
                    rows={3}
                    value={config.headTeacherRemark}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        headTeacherRemark: e.target.value,
                      })
                    }
                    className="w-full border border-slate-200 p-2.5 rounded-xl bg-white text-slate-800 focus:ring-2 focus:ring-emerald-200 outline-none"
                    placeholder="Default remark shown on report cards"
                  />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {(
                    [
                      { key: "A", label: "A (>=)" },
                      { key: "B", label: "B (>=)" },
                      { key: "C", label: "C (>=)" },
                      { key: "D", label: "D (>=)" },
                    ] as const
                  ).map((item) => (
                    <div key={item.key}>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        {item.label}
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={config.gradingScale?.[item.key] ?? ""}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            gradingScale: {
                              A: config.gradingScale?.A ?? 80,
                              B: config.gradingScale?.B ?? 70,
                              C: config.gradingScale?.C ?? 60,
                              D: config.gradingScale?.D ?? 45,
                              [item.key]: Number(e.target.value || 0),
                            },
                          })
                        }
                        className="w-full border border-slate-200 p-2.5 rounded-xl bg-white text-slate-800 focus:ring-2 focus:ring-emerald-200 outline-none"
                      />
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Pass Mark (&gt;=)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={config.passMark ?? ""}
                      onChange={(e) => {
                        const nextPass = Number(e.target.value || 0);
                        setConfig({
                          ...config,
                          passMark: nextPass,
                          failMark:
                            config.failMark !== undefined &&
                            config.failMark >= nextPass
                              ? Math.max(0, nextPass - 1)
                              : config.failMark,
                        });
                      }}
                      className="w-full border border-slate-200 p-2.5 rounded-xl bg-white text-slate-800 focus:ring-2 focus:ring-emerald-200 outline-none"
                    />
                    <p className="text-xs text-slate-500 mt-2">
                      Students with scores at or above this mark pass.
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Fail Mark (&lt;=)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={config.failMark ?? ""}
                      onChange={(e) => {
                        const nextFail = Number(e.target.value || 0);
                        setConfig({
                          ...config,
                          failMark: nextFail,
                          passMark:
                            config.passMark !== undefined &&
                            nextFail >= config.passMark
                              ? Math.min(100, nextFail + 1)
                              : config.passMark,
                        });
                      }}
                      className="w-full border border-slate-200 p-2.5 rounded-xl bg-white text-slate-800 focus:ring-2 focus:ring-emerald-200 outline-none"
                    />
                    <p className="text-xs text-slate-500 mt-2">
                      Students with scores at or below this mark fail.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Promotional Term
                  </label>
                  <div className="flex flex-wrap gap-3">
                    <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="radio"
                        name="promotionalTerm"
                        value="yes"
                        checked={config.isPromotionalTerm === true}
                        onChange={() =>
                          setConfig({
                            ...config,
                            isPromotionalTerm: true,
                          })
                        }
                        className="h-4 w-4 text-emerald-600"
                      />
                      Promotional (show pass/fail promotion)
                    </label>
                    <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="radio"
                        name="promotionalTerm"
                        value="no"
                        checked={config.isPromotionalTerm === false}
                        onChange={() =>
                          setConfig({
                            ...config,
                            isPromotionalTerm: false,
                          })
                        }
                        className="h-4 w-4 text-emerald-600"
                      />
                      Non-promotional (hide promotion)
                    </label>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    When set to non-promotional, report cards will hide
                    promotion status.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Position Rule
                  </label>
                  <select
                    value={config.positionRule || "total"}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        positionRule: e.target
                          .value as SchoolConfig["positionRule"],
                      })
                    }
                    className="w-full border border-slate-200 p-2.5 rounded-xl bg-white text-slate-800 focus:ring-2 focus:ring-emerald-200 outline-none"
                  >
                    <option value="total">Total score rank</option>
                    <option value="average">Average score rank</option>
                    <option value="subject">Subject-by-subject rank</option>
                  </select>
                  <p className="text-xs text-slate-500 mt-2">
                    Choose how positions are calculated on report cards.
                  </p>
                </div>
              </div>
            </div>

          </div>

          {/* Right Column */}
          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-xl font-bold text-slate-800">
                    Report Card Customization
                  </h2>
                  <p className="text-xs text-slate-500">
                    Control the layout, branding, and sections shown on report cards.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={resetReportCardSettings}
                    className="flex items-center text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-full transition-colors"
                  >
                    Reset Default
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowReportCardPreview(true)}
                    className="flex items-center text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-4 py-2 rounded-full transition-colors"
                  >
                    Preview
                  </button>
                  <button
                    onClick={handleSaveConfig}
                    disabled={savingConfig}
                    className="flex items-center text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-full transition-colors"
                  >
                    <Save size={14} className="mr-1" />{" "}
                    {savingConfig ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Report Card Title
                    </label>
                    <input
                      value={reportCardSettings.title}
                      onChange={(event) =>
                        updateReportCardSettings({ title: event.target.value })
                      }
                      className="w-full border border-slate-200 p-2.5 rounded-xl bg-white text-slate-800 focus:ring-2 focus:ring-emerald-200 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Template
                    </label>
                    <select
                      value={reportCardSettings.template}
                      onChange={(event) =>
                        updateReportCardSettings({
                          template: event.target.value as any,
                        })
                      }
                      className="w-full border border-slate-200 p-2.5 rounded-xl bg-white text-slate-800 focus:ring-2 focus:ring-emerald-200 outline-none"
                    >
                      <option value="classic">Classic</option>
                      <option value="modern">Modern</option>
                      <option value="compact">Compact</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Primary Color
                    </label>
                    <input
                      type="color"
                      value={reportCardSettings.primaryColor}
                      onChange={(event) =>
                        updateReportCardSettings({
                          primaryColor: event.target.value,
                        })
                      }
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white p-1"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Accent Color
                    </label>
                    <input
                      type="color"
                      value={reportCardSettings.accentColor}
                      onChange={(event) =>
                        updateReportCardSettings({
                          accentColor: event.target.value,
                        })
                      }
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white p-1"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Header Style
                    </label>
                    <select
                      value={reportCardSettings.headerStyle}
                      onChange={(event) =>
                        updateReportCardSettings({
                          headerStyle: event.target.value as any,
                        })
                      }
                      className="w-full border border-slate-200 p-2.5 rounded-xl bg-white text-slate-800 focus:ring-2 focus:ring-emerald-200 outline-none"
                    >
                      <option value="plain">Plain</option>
                      <option value="band">Color Band</option>
                      <option value="boxed">Soft Box</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Logo Position
                    </label>
                    <select
                      value={reportCardSettings.logoPosition}
                      onChange={(event) =>
                        updateReportCardSettings({
                          logoPosition: event.target.value as any,
                        })
                      }
                      className="w-full border border-slate-200 p-2.5 rounded-xl bg-white text-slate-800 focus:ring-2 focus:ring-emerald-200 outline-none"
                    >
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    ["showSchoolLogo", "Show school logo"],
                    ["showWatermarkLogo", "Show watermark logo"],
                    ["showStudentPhoto", "Show student photo"],
                    ["showPosition", "Show position/rank"],
                    ["showAttendance", "Show attendance summary"],
                    ["showSkills", "Show skills/behaviour"],
                    ["showClassTeacherRemark", "Show class teacher remark"],
                    ["showHeadTeacherRemark", "Show head teacher remark"],
                    ["showGradingScale", "Show grading scale"],
                    ["showPromotionStatus", "Show promotion status"],
                  ].map(([key, label]) => (
                    <label
                      key={key}
                      className="flex items-center justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3"
                    >
                      <span className="text-sm font-medium text-slate-700">
                        {label}
                      </span>
                      <input
                        type="checkbox"
                        checked={Boolean((reportCardSettings as any)[key])}
                        onChange={(event) =>
                          updateReportCardSettings({
                            [key]: event.target.checked,
                          } as any)
                        }
                        className="h-5 w-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                    </label>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    ["classTeacherSignatureLabel", "Class teacher signature"],
                    ["headTeacherSignatureLabel", "Head teacher signature"],
                    ["stampLabel", "Stamp label"],
                  ].map(([key, label]) => (
                    <div key={key}>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        {label}
                      </label>
                      <input
                        value={String((reportCardSettings as any)[key] || "")}
                        onChange={(event) =>
                          updateReportCardSettings({
                            [key]: event.target.value,
                          } as any)
                        }
                        className="w-full border border-slate-200 p-2.5 rounded-xl bg-white text-slate-800 focus:ring-2 focus:ring-emerald-200 outline-none"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Subject Management */}
            <div className="overflow-hidden rounded-3xl border border-emerald-100 bg-white p-4 shadow-sm sm:p-6">
              <h2 className="text-lg sm:text-xl font-bold mb-4 sm:mb-6 text-slate-800 flex items-center">
                <Book className="mr-2 text-[#0B4A82]" size={24} />
                Manage Class Subjects
              </h2>

              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Select Class
                </label>
                <select
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  className="w-full border border-slate-200 p-2.5 rounded-xl bg-white text-slate-800 focus:ring-2 focus:ring-[#1160A8] outline-none"
                >
                  {(
                    [
                      "Creche",
                      "Nursery",
                      "KG",
                      "Class 1-3",
                      "Class 4-6",
                      "JHS 1-3",
                      "Other",
                    ] as const
                  ).map((group) =>
                    classGroups[group]?.length ? (
                      <optgroup key={group} label={group}>
                        {classGroups[group].map((cls) => (
                          <option key={cls.id} value={cls.id}>
                            {cls.name}
                          </option>
                        ))}
                      </optgroup>
                    ) : null,
                  )}
                </select>
              </div>

              <form
                onSubmit={handleAddSubject}
                className="grid grid-cols-[1fr_auto] gap-2 mb-5 sm:mb-6"
              >
                <input
                  type="text"
                  required
                  disabled={isAddingSubject}
                  className="min-w-0 border border-slate-200 p-2.5 rounded-xl focus:ring-2 focus:ring-[#1160A8] outline-none text-sm"
                  placeholder="New subject name..."
                  value={newSubjectName}
                  onChange={(e) => setNewSubjectName(e.target.value)}
                />
                <button
                  type="submit"
                  disabled={
                    isAddingSubject ||
                    !newSubjectName.trim() ||
                    !selectedClassId
                  }
                  className="h-11 w-11 shrink-0 inline-flex items-center justify-center bg-[#1160A8] text-white rounded-xl hover:bg-[#0B4A82] transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {isAddingSubject ? (
                    <span className="relative inline-flex items-center justify-center">
                      <span className="absolute h-5 w-5 rounded-full border-2 border-white/35 border-t-white animate-spin" />
                      <Plus size={18} className="opacity-80 animate-pulse" />
                    </span>
                  ) : (
                    <Plus size={20} />
                  )}
                </button>
              </form>

              <div className="space-y-2 max-h-none sm:max-h-[320px] overflow-y-visible sm:overflow-y-auto pr-1 sm:pr-2">
                {currentClassSubjects.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center italic">
                    No subjects configured for this class. Add some above!
                  </p>
                ) : (
                  currentClassSubjects.map((subject) => (
                    <div
                      key={subject}
                      className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 group"
                    >
                      {editingSubject?.original === subject ? (
                        <div className="flex items-center flex-1 min-w-0 gap-2">
                          <input
                            type="text"
                            className="flex-1 min-w-0 border border-slate-200 p-2 rounded-lg text-sm focus:ring-2 focus:ring-[#1160A8] outline-none"
                            value={editingSubject.current}
                            onChange={(e) =>
                              setEditingSubject({
                                ...editingSubject,
                                current: e.target.value,
                              })
                            }
                            autoFocus
                          />
                          <button
                            onClick={saveEditSubject}
                            className="text-emerald-600 hover:bg-emerald-50 p-1 rounded"
                          >
                            <Check size={16} />
                          </button>
                          <button
                            onClick={() => setEditingSubject(null)}
                            className="text-[#1160A8] hover:bg-[#E6F0FA] p-1 rounded"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className="text-sm font-medium text-slate-700 break-words">
                            {subject}
                          </span>
                          <div className="flex gap-1 self-end sm:self-auto opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => startEditSubject(subject)}
                              className="text-slate-400 hover:text-[#1160A8] p-1.5 hover:bg-[#E6F0FA] rounded-md transition-colors"
                            >
                              <Edit size={14} />
                            </button>
                            <button
                              onClick={() => handleDeleteSubject(subject)}
                              className="text-slate-400 hover:text-[#1160A8] p-1.5 hover:bg-[#E6F0FA] rounded-md transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Term Backup Section */}
            {canUseBackups && (
              <div className="bg-gradient-to-br from-[#2A1206] via-[#1F2937] to-[#111827] rounded-2xl shadow-[0_20px_40px_-30px_rgba(2,6,23,0.9)] border border-amber-500/20 p-4 sm:p-6">
                <h2 className="text-lg sm:text-xl font-bold mb-4 sm:mb-6 text-white flex items-center">
                  <Save className="mr-2 text-amber-200" size={24} />
                  Recovery and Full Backup
                </h2>
                <p className="text-sm text-slate-300 mb-4 leading-relaxed">
                  Create a full-system snapshot of your school workspace,
                  including settings, users, finance data, notices, timetables,
                  academic records, and activity history. Deleted records and
                  risky bulk changes are still captured automatically from the
                  Recovery Center.
                </p>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
                  <button
                    onClick={handleCreateSystemBackup}
                    disabled={isCreatingBackup || isTrialPlan}
                    title="Create Full System Backup"
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-purple-600 text-white px-4 py-2.5 rounded-full hover:bg-purple-700 transition-colors disabled:opacity-70 disabled:cursor-not-allowed text-sm sm:text-base"
                  >
                    {isCreatingBackup ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                        Creating...
                      </>
                    ) : (
                      <>
                        <Save size={16} />
                        <span>Create Full System Backup</span>
                      </>
                    )}
                  </button>
                  <Link
                    to="/admin/backups"
                    className={`inline-flex items-center justify-center text-sm font-medium ${
                      isTrialPlan
                        ? "text-slate-900 pointer-events-none"
                        : "text-[#ffffff] hover:text-[#dedede]"
                    }`}
                  >
                    <History size={16} className="mr-1" /> Open Recovery Center
                  </Link>
                </div>
                {isTrialPlan && (
                  <p className="text-xs text-slate-300 mt-2">
                    Recovery and backup actions are disabled during the trial
                    period.
                  </p>
                )}
              </div>
            )}

          {/* Right Column: Notices Management */}
          <div className="flex h-auto max-h-none flex-col rounded-3xl border border-slate-200/70 bg-white p-4 shadow-sm sm:p-6">
            <h2 className="mb-4 flex items-center text-lg font-bold text-slate-900 sm:mb-6 sm:text-xl">
              <span className="mr-2 flex h-9 w-9 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
                <Megaphone size={20} />
              </span>
              School Notices
            </h2>

            <form
              onSubmit={handleAddNotice}
              className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:mb-6 sm:p-4"
            >
              <div className="mb-3">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Date
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                  <input
                    type="date"
                    required
                    className="w-full border border-slate-200 pl-10 pr-3 py-2.5 rounded-xl focus:ring-2 focus:ring-emerald-200 outline-none text-sm"
                    value={noticeDate}
                    onChange={(e) => setNoticeDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="mb-3">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Notice Message
                </label>
                <textarea
                  required
                  className="w-full border border-slate-200 p-2.5 rounded-xl focus:ring-2 focus:ring-emerald-200 outline-none text-sm"
                  placeholder="Type notice here..."
                  rows={2}
                  value={newNotice}
                  onChange={(e) => setNewNotice(e.target.value)}
                />
              </div>
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                <div className="flex items-center flex-wrap gap-4">
                  <label className="flex items-center text-sm cursor-pointer text-slate-700">
                    <input
                      type="radio"
                      name="type"
                      className="mr-2 text-emerald-600 focus:ring-emerald-500"
                      checked={noticeType === "info"}
                      onChange={() => setNoticeType("info")}
                    />
                    Info
                  </label>
                  <label className="flex items-center text-sm cursor-pointer text-slate-700">
                    <input
                      type="radio"
                      name="type"
                      className="mr-2 text-red-600 focus:ring-red-500"
                      checked={noticeType === "urgent"}
                      onChange={() => setNoticeType("urgent")}
                    />
                    Urgent
                  </label>
                </div>
                <button
                  type="submit"
                  disabled={isAddingNotice}
                  className="w-full sm:w-auto bg-emerald-600 text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-emerald-700 transition-colors inline-flex items-center justify-center disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {isAddingNotice ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-1"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <Plus size={16} className="mr-1" /> Add Notice
                    </>
                  )}
                </button>
              </div>
            </form>

            <div className="min-h-0 flex-1 overflow-visible pr-0 lg:overflow-y-auto lg:pr-1">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
                Active Notices
              </h3>
              <div className="space-y-3">
                {notices.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm italic text-slate-500">
                    No notices posted.
                  </p>
                ) : (
                  notices.map((notice) => (
                    <div
                      key={notice.id}
                      className="group flex items-start justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition-colors hover:bg-slate-50 sm:gap-3"
                    >
                      <div
                        className={`border-l-2 pl-3 min-w-0 flex-1 ${notice.type === "urgent" ? "border-red-500" : "border-emerald-500"}`}
                      >
                        <p className="text-sm font-medium text-slate-800">
                          {notice.message}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {notice.date} &bull;{" "}
                          {notice.type === "urgent" ? "Urgent" : "General Info"}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteNotice(notice.id)}
                        className="shrink-0 rounded-lg p-1 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                        title="Delete Notice"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {canUseBackups && (
            <div className="rounded-3xl border border-rose-100 bg-white p-5 text-center shadow-sm sm:p-6">
              {showDangerZone && (
                <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-left">
                <div className="mb-3 flex items-center">
                  <Shield className="mr-2 text-rose-700" size={22} />
                  <h2 className="text-lg font-bold text-rose-800">
                    Danger Zone: Database Reset
                  </h2>
                </div>
                <p className="mb-4 text-sm leading-6 text-rose-700">
                  This will reset term data for attendance, assessments,
                  reports, and term-specific records. It does not delete school
                  accounts or core setup, but the term data cannot be recovered.
                </p>
                <button
                  onClick={handleTermReset}
                  disabled={termResetting}
                  className="w-full rounded-full bg-rose-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-rose-700 disabled:bg-rose-400"
                >
                  {termResetting ? "Resetting Term..." : "Term Reset"}
                </button>
              </div>
              )}

                <button
                  onClick={() => setShowDangerZone(!showDangerZone)}
                  className="inline-flex items-center gap-2 rounded-full border border-rose-100 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 shadow-sm transition-all hover:border-rose-200 hover:bg-rose-100"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-600 text-xs font-bold text-white">
                    {showDangerZone ? "-" : "+"}
                  </span>
                  {showDangerZone ? "Hide" : "Show"} Advanced Settings
                </button>
            </div>
          )}
        </div>
      </div>
      </div>

      {showReportCardPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4">
          <div className="relative max-h-[95vh] w-full max-w-6xl overflow-y-auto rounded-2xl bg-slate-100 p-4 shadow-2xl">
            <div className="sticky top-0 z-10 mb-4 flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-sm">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Report Card Preview
                </h2>
                <p className="text-xs text-slate-500">
                  Sample data using the current settings on this page.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowReportCardPreview(false)}
                className="rounded-full bg-slate-100 p-2 text-slate-600 hover:bg-slate-200"
                aria-label="Close preview"
              >
                <X size={20} />
              </button>
            </div>
            <ReportCardLayout data={sampleReportCardData} />
          </div>
        </div>
      )}

      {/* Reset Report Card Confirmation Modal */}
      {showResetReportCardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <AlertTriangle size={26} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Reset Report Card Design?
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  This will restore the default layout, colors, visible sections,
                  and signature labels.
                </p>
              </div>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              The default design will be saved immediately for this school.
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowResetReportCardModal(false)}
                disabled={resettingReportCardSettings}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmResetReportCardSettings}
                disabled={resettingReportCardSettings}
                className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {resettingReportCardSettings
                  ? "Resetting..."
                  : "Reset to Default"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Term Reset Confirmation Modal */}
      {showTermResetModal && (
        <div className="fixed inset-0 bg-slate-900 bg-opacity-30 flex items-center justify-center z-50 transition-opacity duration-300">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-lg w-full mx-4 transform transition-all duration-300 scale-100">
            <div className="flex items-center mb-4">
              <AlertTriangle className="text-red-600 mr-3" size={32} />
              <h2 className="text-xl font-bold text-slate-800">
                Confirm Term Reset
              </h2>
            </div>
            <div className="text-slate-600 mb-6 space-y-2">
              <p>
                This will reset all data for the current term, but{" "}
                <strong>keep core school setup</strong>. Are you sure you want
                to proceed?
              </p>
              <ul className="list-disc list-inside text-sm space-y-1">
                <li>
                  <strong>RESET:</strong> Attendance, Assessments, Teacher
                  Attendance, Notices, and all student Remarks.
                </li>
                <li>
                  <strong>KEEP:</strong> Student Enrollment, Teacher Accounts,
                  Class Subjects, and Timetables.
                </li>
              </ul>
              <p className="font-semibold text-red-700">
                This action cannot be undone.
              </p>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowTermResetModal(false)}
                className="px-4 py-2 text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmTermReset}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Confirm Term Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Subject Confirmation Modal */}
      {showDeleteSubjectModal && subjectToDeleteName && (
        <div className="fixed inset-0 bg-slate-900 bg-opacity-30 flex items-center justify-center z-50 transition-opacity duration-300">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4 transform transition-all duration-300 scale-100">
            <div className="flex items-center mb-4">
              <AlertTriangle className="text-red-600 mr-3" size={32} />
              <h2 className="text-xl font-bold text-slate-800">
                Delete Subject
              </h2>
            </div>
            <p className="text-slate-600 mb-6">
              Are you sure you want to delete the subject "
              <strong>{subjectToDeleteName}</strong>"? This might hide scores
              associated with this subject and cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDeleteSubjectModal(false);
                  setSubjectToDeleteName(null);
                }}
                className="px-4 py-2 text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteSubject}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete Subject
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};
export default SystemSettings;
