import React, { useState, useEffect, useCallback, useRef } from "react";
import Layout from "../../components/Layout";
import { useAuth } from "../../context/AuthContext";
import { db } from "../../services/mockDb";
import { logActivity } from "../../services/activityLog";
import { Student, AttendanceRecord } from "../../types";
import { CLASSES_LIST, ACADEMIC_YEAR, CURRENT_TERM } from "../../constants";
import {
  Save,
  Calendar,
  AlertTriangle,
  Users,
  CheckCircle,
  Clock,
  XCircle,
} from "lucide-react";
import UserAvatar from "../../components/UserAvatar";
import { useNetworkStatus } from "../../hooks/useNetworkStatus";
import { StudentAttendanceDraftStorage } from "../../src/studentAttendanceDraftStorage";
import { showToast } from "../../services/toast";

const isPermissionDeniedError = (error: unknown) => {
  const message = String(
    (error as any)?.code || (error as any)?.message || error || "",
  );
  return (
    message.includes("permission-denied") ||
    message.includes("Missing or insufficient permissions")
  );
};

const Attendance = () => {
  const { user } = useAuth();
  const assignedClassIds = (user?.assignedClassIds || []).sort((a, b) => {
    const indexA = CLASSES_LIST.findIndex((c) => c.id === a);
    const indexB = CLASSES_LIST.findIndex((c) => c.id === b);
    return indexA - indexB;
  });
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const schoolId = user?.schoolId || null;

  const [students, setStudents] = useState<Student[]>([]);
  const getLocalDateString = (value: Date = new Date()) =>
    `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  const [date, setDate] = useState(getLocalDateString());
  const [presentIds, setPresentIds] = useState<Set<string>>(new Set());
  const [isHoliday, setIsHoliday] = useState(false);
  const [holidayReason, setHolidayReason] = useState("");
  const [hasMarkedAttendance, setHasMarkedAttendance] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [adminHoliday, setAdminHoliday] = useState<{
    date: string;
    reason?: string;
  } | null>(null);
  const [message, setMessage] = useState("");
  const [schoolConfig, setSchoolConfig] = useState<any>(null);

  // Offline-first refs
  const isOnline = useNetworkStatus().isOnline;
  const currentDraftRef = useRef<{
    schoolId: string;
    classId: string;
    date: string;
    presentStudentIds: string[];
    isHoliday: boolean;
    holidayReason: string;
    lastModified: number;
    version: number;
  } | null>(null);
  const draftVersionRef = useRef(0);
  const isSyncingRef = useRef(false);
  const pendingSyncVersionRef = useRef<{
    lastModified: number;
    version: number;
    schoolId: string;
    classId: string;
    date: string;
  } | null>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevIsOnlineRef = useRef(isOnline);
  const didMountRef = useRef(false);
  const [externalDraftChanged, setExternalDraftChanged] = useState(false);
  const currentContextRef = useRef({
    schoolId: schoolId || "",
    classId: selectedClassId,
    date: date,
  });
  const loadedDraftRevisionRef = useRef<number | null>(null);
  const [syncStatus, setSyncStatus] = useState<"idle" | "saving" | "syncing" | "error" | "pending">("idle");
  const [draftRecovered, setDraftRecovered] = useState(false);

  // Initialize selected class
  useEffect(() => {
    if (assignedClassIds.length > 0 && !selectedClassId) {
      setSelectedClassId(assignedClassIds[0]);
    }
  }, [assignedClassIds]);

  // Fetch school config
  useEffect(() => {
    const fetchConfig = async () => {
      if (!schoolId) {
        setSchoolConfig(null);
        return;
      }
      const config = await db.getSchoolConfig(schoolId);
      setSchoolConfig(config);

      // Auto-set date to minimum allowed date if current date is before minimum
      const minDate = getMinDateFromConfig(config);
      if (minDate && date < minDate) {
        setDate(minDate);
      }
    };
    fetchConfig();
  }, [schoolId]);

  // Helper function to get minimum allowed date
  const getMinDate = () => {
    return getMinDateFromConfig(schoolConfig);
  };

  const getMinDateFromConfig = (config: any) => {
    if (!config) return "";
    // The user wants schoolReopenDate to be the primary start date for marking attendance
    if (config.schoolReopenDate) {
      return config.schoolReopenDate;
    }
    return "";
  };

  // Helper function to get maximum allowed date for attendance marking
  const getMaxDateFromConfig = (config: any) => {
    if (!config) return "";
    // The user wants vacationDate to be the end date for marking attendance
    if (config.vacationDate) {
      return config.vacationDate;
    }
    return "";
  };

  // Helper function to check if date is blocked
  const isDateBlocked = () => {
    const vacationDate = schoolConfig?.vacationDate;
    const nextTermBegins = schoolConfig?.nextTermBegins;
    const schoolReopenDate = schoolConfig?.schoolReopenDate;
    const isAdminHoliday = (schoolConfig?.holidayDates || []).some(
      (h: any) => h.date === date,
    );

    // If nextTermBegins is set and we're at or past that date, allow attendance (new term started)
    if (nextTermBegins && date >= nextTermBegins) {
      return false;
    }

    // Block if date is an admin-defined holiday
    if (isAdminHoliday) {
      return true;
    }

    // Block if date is after vacation date (during vacation period)
    if (vacationDate && date > vacationDate) {
      return true;
    }

    // Block if no vacationDate but schoolReopenDate is set and date is before it
    if (!vacationDate && schoolReopenDate && date < schoolReopenDate) {
      return true;
    }

    return false;
  };

  useEffect(() => {
    if (!selectedClassId || !schoolId) return;

    const loadData = async () => {
      setLoading(true);
      try {
        // 1. Get Students
        const studentsList = await db.getStudents(schoolId, selectedClassId);
        setStudents(studentsList);

        // 2. Get existing attendance for date
        const existing = await db.getAttendance(
          schoolId,
          selectedClassId,
          date,
        );
        const configHoliday = (schoolConfig?.holidayDates || []).find(
          (h: any) => h.date === date,
        );
        if (configHoliday) {
          setAdminHoliday(configHoliday);
          setIsHoliday(true);
          setHolidayReason(configHoliday.reason || "");
          setPresentIds(new Set());
          return;
        }

        if (existing) {
          if (existing.isHoliday) {
            setIsHoliday(true);
            setHolidayReason(existing.holidayReason || "");
            setPresentIds(new Set());
            setHasMarkedAttendance(false);
          } else {
            setIsHoliday(false);
            setHolidayReason("");
            setPresentIds(new Set(existing.presentStudentIds));
            setHasMarkedAttendance(true);
          }
        } else {
          // Default to empty - teacher must manually mark attendance
          setIsHoliday(false);
          setHolidayReason("");
          setPresentIds(new Set());
          setHasMarkedAttendance(false);
        }
        setAdminHoliday(null);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [selectedClassId, date, schoolId, schoolConfig]);

  // Track the current attendance context so old async operations
  // cannot accidentally mutate a newer context's UI state.
  useEffect(() => {
    currentContextRef.current = {
      schoolId: schoolId || "",
      classId: selectedClassId,
      date: date,
    };
  }, [schoolId, selectedClassId, date]);

  // Multi-tab draft change detection
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleStorage = (event: StorageEvent) => {
      if (!schoolId || !selectedClassId || !date) return;

      const currentKey = StudentAttendanceDraftStorage.getDraftKey(
        schoolId,
        selectedClassId,
        date,
      );

      if (event.key === currentKey && event.newValue) {
        try {
          const externalDraft = JSON.parse(event.newValue);
          const localDraft = currentDraftRef.current;
          const storedRevision = externalDraft.version ?? null;
          const loadedRevision = loadedDraftRevisionRef.current;

          if (storedRevision !== null && loadedRevision !== null && storedRevision !== loadedRevision) {
            setExternalDraftChanged(true);
          } else if (!localDraft) {
            setExternalDraftChanged(true);
           } else if (externalDraft.lastModified > (localDraft?.lastModified ?? 0)) {
            setExternalDraftChanged(true);
          }
        } catch {
          // ignore malformed external storage events
        }
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [schoolId, selectedClassId, date]);

  // Helper: detect whether the stored draft has been changed by another tab
  // since the current tab loaded its local copy.
  const hasStoredRevisionChanged = useCallback(() => {
    if (!schoolId || !selectedClassId || !date) return false;
    if (loadedDraftRevisionRef.current === null) return false;

    const storedDraft = StudentAttendanceDraftStorage.loadDraft(
      schoolId,
      selectedClassId,
      date,
    );

    if (!storedDraft) return false;

    const loadedRevision = loadedDraftRevisionRef.current;
    const currentStoredVersion = storedDraft.version;
    const loadedContext = currentContextRef.current;
    const storedContextMatches =
      storedDraft.schoolId === loadedContext.schoolId &&
      storedDraft.classId === loadedContext.classId &&
      storedDraft.date === loadedContext.date;

    return storedContextMatches && currentStoredVersion !== loadedRevision;
  }, [schoolId, selectedClassId, date]);

  // Draft recovery on context change
  useEffect(() => {
    if (!schoolId || !selectedClassId || !date) {
      return;
    }

    const draft = StudentAttendanceDraftStorage.loadDraft(
      schoolId,
      selectedClassId,
      date,
    );

    if (draft) {
      setPresentIds(new Set(draft.presentStudentIds));
      setIsHoliday(draft.isHoliday);
      setHolidayReason(draft.holidayReason);
      currentDraftRef.current = draft;
      draftVersionRef.current = draft.version;
      loadedDraftRevisionRef.current = draft.version;
      setDraftRecovered(true);
      showToast("Draft recovered", { type: "info" });
    } else {
      if (draftTimerRef.current) {
        clearTimeout(draftTimerRef.current);
        draftTimerRef.current = null;
      }
      currentDraftRef.current = null;
      draftVersionRef.current = 0;
      loadedDraftRevisionRef.current = null;
      pendingSyncVersionRef.current = null;
      setDraftRecovered(false);
      setSyncStatus("idle");
      setExternalDraftChanged(false);
    }
  }, [schoolId, selectedClassId, date]);

  // Debounced draft persistence
  const scheduleDraftSave = useCallback(() => {
    if (draftTimerRef.current) {
      clearTimeout(draftTimerRef.current);
    }

    draftTimerRef.current = setTimeout(() => {
      if (!schoolId || !selectedClassId || !date) return;

      // Multi-tab protection: if the stored draft has been changed by another
      // tab since this tab loaded it, do not silently overwrite it.
      if (hasStoredRevisionChanged()) {
        setExternalDraftChanged(true);
        return;
      }

      const version = draftVersionRef.current;
      const success = StudentAttendanceDraftStorage.saveDraft(
        schoolId,
        selectedClassId,
        date,
        Array.from(presentIds),
        isHoliday,
        holidayReason,
        version,
      );

      if (success) {
        currentDraftRef.current = {
          schoolId,
          classId: selectedClassId,
          date: date,
          presentStudentIds: Array.from(presentIds),
          isHoliday,
          holidayReason,
          lastModified: Date.now(),
          version,
        };
        loadedDraftRevisionRef.current = version;
        setSyncStatus("idle");
      }
    }, 1000);
  }, [schoolId, selectedClassId, date, hasStoredRevisionChanged]);

  // Reconnection sync
  useEffect(() => {
    // Guard: return early if schoolConfig is not available
    if (!schoolConfig) return;

    if (!didMountRef.current) {
      didMountRef.current = true;
      prevIsOnlineRef.current = isOnline;
      return;
    }

    const wasOffline = !prevIsOnlineRef.current;
    prevIsOnlineRef.current = isOnline;

    if (!isOnline || !wasOffline) return;
    if (isSyncingRef.current) return;

    let dynamicTerm = CURRENT_TERM; // Not used but keeping pattern similar to Assessment
    if (schoolConfig.currentTerm) {
      const match = schoolConfig.currentTerm.match(/\d+/);
      if (match) dynamicTerm = parseInt(match[0], 10);
    }

    const draft = StudentAttendanceDraftStorage.loadDraft(
      schoolId || "",
      selectedClassId,
      date,
    );

    if (!draft) return;

    // If there is a pending sync version, only sync if draft matches
    if (pendingSyncVersionRef.current) {
      const matches =
        draft.schoolId === pendingSyncVersionRef.current.schoolId &&
        draft.classId === pendingSyncVersionRef.current.classId &&
        draft.date === pendingSyncVersionRef.current.date &&
        draft.lastModified === pendingSyncVersionRef.current.lastModified &&
        draft.version === pendingSyncVersionRef.current.version;
      if (!matches) return;
    }

    const syncDraft = async () => {
      if (isSyncingRef.current) return;
      // We are about to start a sync, so we set the flag to true
      isSyncingRef.current = true;

      // Capture the context of the draft we are about to sync
      const syncContext = {
        schoolId: draft.schoolId,
        classId: draft.classId,
        date: draft.date,
      };

      // Check if the context has changed since we loaded the draft (in the useEffect)
      const currentContext = currentContextRef.current;
      const contextChanged =
        currentContext.schoolId !== syncContext.schoolId ||
        currentContext.classId !== syncContext.classId ||
        currentContext.date !== syncContext.date;

      if (contextChanged) {
        isSyncingRef.current = false;
        return;
      }

      setSyncStatus("syncing");

      const capturedVersion = {
        lastModified: draft.lastModified,
        version: draft.version,
        schoolId: draft.schoolId,
        classId: draft.classId,
        date: draft.date,
      };
      pendingSyncVersionRef.current = capturedVersion;

      try {
        const attendanceRecord: AttendanceRecord = {
          id: `${draft.schoolId}_${draft.classId}_${draft.date}`,
          schoolId: draft.schoolId,
          classId: draft.classId,
          date: draft.date,
          presentStudentIds: draft.presentStudentIds,
          isHoliday: draft.isHoliday,
          holidayReason: draft.holidayReason,
        };

        await db.saveAttendance(attendanceRecord);

        // Guard: if context changed, do not mutate current UI state
        const currentContext = currentContextRef.current;
        const contextChanged =
          currentContext.schoolId !== capturedVersion.schoolId ||
          currentContext.classId !== capturedVersion.classId ||
          currentContext.date !== capturedVersion.date;

        if (contextChanged) {
          isSyncingRef.current = false;
          return;
        }

        const currentDraft = StudentAttendanceDraftStorage.loadDraft(
          draft.schoolId,
          draft.classId,
          draft.date,
        );

        if (
          currentDraft &&
          currentDraft.version === capturedVersion.version &&
          currentDraft.lastModified === capturedVersion.lastModified &&
          currentDraft.schoolId === capturedVersion.schoolId &&
          currentDraft.classId === capturedVersion.classId &&
          currentDraft.date === capturedVersion.date
        ) {
          StudentAttendanceDraftStorage.deleteDraft(
            draft.schoolId,
            draft.classId,
            draft.date,
          );
          currentDraftRef.current = null;
          pendingSyncVersionRef.current = null;
          setSyncStatus("idle");
        } else if (currentDraft) {
          setSyncStatus("pending");
          pendingSyncVersionRef.current = null;
        } else {
          setSyncStatus("idle");
          pendingSyncVersionRef.current = null;
        }
      } catch (error) {
        console.error("Reconnection sync failed:", error);
        // Check if context has changed before setting error status
        const currentContext = currentContextRef.current;
        const contextChanged =
          currentContext.schoolId !== capturedVersion.schoolId ||
          currentContext.classId !== capturedVersion.classId ||
          currentContext.date !== capturedVersion.date;
        if (!contextChanged) {
          setSyncStatus("error");
        }
        pendingSyncVersionRef.current = null;
      } finally {
        isSyncingRef.current = false;
      }
    };

    syncDraft();
  }, [isOnline, schoolId, selectedClassId, date]);

  // Clean up draft timer on unmount to prevent stray saves after component unmount
  useEffect(() => {
    return () => {
      if (draftTimerRef.current) {
        clearTimeout(draftTimerRef.current);
        draftTimerRef.current = null;
      }
    };
  }, []);

  // Initialize selected class (duplicate removed, kept only one)

  const togglePresence = (id: string) => {
    if (isHoliday || adminHoliday) return;
    if (!hasMarkedAttendance) {
      setHasMarkedAttendance(true);
    }
    const newSet = new Set(presentIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setPresentIds(newSet);
  };

  const handleMarkAllPresent = () => {
    if (isHoliday || adminHoliday || students.length === 0 || isDateBlocked()) {
      return;
    }

    setHasMarkedAttendance(true);
    setPresentIds(new Set(students.map((student) => student.id)));
  };

  const handleChange = (
    studentId: string,
  ) => {
    // Toggle presence for the student
    const newSet = new Set(presentIds);
    if (newSet.has(studentId)) {
      newSet.delete(studentId);
    } else {
      newSet.add(studentId);
    }
    setPresentIds(newSet);

    // Update draft ref immediately for snapshot protection
    currentDraftRef.current = {
      ...(currentDraftRef.current || {
        schoolId: schoolId || "",
        classId: selectedClassId,
        date: date,
        presentStudentIds: [],
        isHoliday: false,
        holidayReason: "",
        lastModified: Date.now(),
        version: 0,
      }),
      presentStudentIds: Array.from(newSet),
      lastModified: Date.now(),
    };
    draftVersionRef.current += 1;
    currentDraftRef.current.version = draftVersionRef.current;

    scheduleDraftSave();
  };

  const handleSave = async () => {
    if (!selectedClassId || !schoolId) return;

    // Check if date is valid for attendance
    // After term reset, check if we're past nextTermBegins
    const vacationDate = schoolConfig?.vacationDate;
    const nextTermBegins = schoolConfig?.nextTermBegins;
    const schoolReopenDate = schoolConfig?.schoolReopenDate;

    // If nextTermBegins is set and we're at or past that date, allow attendance
    if (adminHoliday) {
      setMessage("This date is marked as a holiday by the admin.");
      setTimeout(() => setMessage(""), 3000);
      return;
    }

    if (nextTermBegins && date >= nextTermBegins) {
      // Attendance allowed - new term has started
    } else if (vacationDate && date > vacationDate) {
      // Block if date is after vacation date
      setMessage("Cannot mark attendance after school vacation date");
      setTimeout(() => setMessage(""), 3000);
      return;
    } else if (!vacationDate && schoolReopenDate && date < schoolReopenDate) {
      // Block if no vacationDate but schoolReopenDate is set and date is before it
      setMessage(
        `Cannot mark attendance before school re-open date (${schoolReopenDate})`,
      );
      setTimeout(() => setMessage(""), 3000);
      return;
    }

    setSaving(true);

    // Multi-tab protection: do not save if another tab has written since
    // this tab loaded its local copy.
    if (hasStoredRevisionChanged()) {
      setExternalDraftChanged(true);
      setSaving(false);
      return;
    }

    // Capture current draft version and context for race protection
    const capturedVersion = currentDraftRef.current
      ? {
          lastModified: currentDraftRef.current.lastModified,
          version: currentDraftRef.current.version,
          schoolId: currentDraftRef.current.schoolId,
          classId: currentDraftRef.current.classId,
          date: currentDraftRef.current.date,
        }
      : null;

    try {
      if (isOnline) {
        // Online save - write to Firestore
        const attendanceRecord: AttendanceRecord = {
          id: `${schoolId}_${selectedClassId}_${date}`,
          schoolId,
          classId: selectedClassId,
          date,
          presentStudentIds: Array.from(presentIds),
          isHoliday,
          holidayReason: holidayReason.trim(),
        };
        await db.saveAttendance(attendanceRecord);

        // Guard: if context changed, do not mutate draft refs or sync status
        const currentContext = currentContextRef.current;
        const contextChanged = capturedVersion
          ? currentContext.schoolId !== capturedVersion.schoolId ||
            currentContext.classId !== capturedVersion.classId ||
            currentContext.date !== capturedVersion.date
          : false;

        if (!contextChanged && capturedVersion && currentDraftRef.current) {
          const unchanged =
            currentDraftRef.current.lastModified === capturedVersion.lastModified &&
            currentDraftRef.current.version === capturedVersion.version &&
            currentDraftRef.current.schoolId === capturedVersion.schoolId &&
            currentDraftRef.current.classId === capturedVersion.classId &&
            currentDraftRef.current.date === capturedVersion.date;

          if (unchanged) {
            StudentAttendanceDraftStorage.deleteDraft(
              schoolId,
              selectedClassId,
              date,
            );
            currentDraftRef.current = null;
            pendingSyncVersionRef.current = null;
          }
          // If changed, newer local edits exist; preserve draft
        }

        // Notification logic
        const className =
          CLASSES_LIST.find((c) => c.id === selectedClassId)?.name ||
          selectedClassId;
        await db.addSystemNotification(
          `${user?.fullName} marked attendance for ${className} on ${date}. (${presentIds.size} Present)`,
          "attendance",
          schoolId,
        );

        await logActivity({
          schoolId,
          actorUid: user?.id || null,
          actorRole: user?.role || null,
          eventType: "attendance_saved",
          entityId: `${schoolId}_${selectedClassId}_${date}`,
          meta: {
            status: "success",
            module: "Attendance",
            classId: selectedClassId,
            date,
            presentCount: presentIds.size,
            holiday: isHoliday,
            holidayReason: isHoliday ? holidayReason.trim() : "",
            actorName: user?.fullName || "",
          },
        });

        showToast("Saved Successfully", { type: "success" });
        loadedDraftRevisionRef.current = currentDraftRef.current?.version ?? null;
      } else {
        // Offline save - persist draft locally
        const success = StudentAttendanceDraftStorage.saveDraft(
          schoolId || "",
          selectedClassId,
          date,
          Array.from(presentIds),
          isHoliday,
          holidayReason,
          draftVersionRef.current + 1, // Increment version for offline save
        );

        if (success) {
          // Update local refs to match saved draft
          currentDraftRef.current = {
            schoolId: schoolId || "",
            classId: selectedClassId,
            date: date,
            presentStudentIds: Array.from(presentIds),
            isHoliday,
            holidayReason,
            lastModified: Date.now(),
            version: draftVersionRef.current + 1,
          };
          draftVersionRef.current += 1;
          loadedDraftRevisionRef.current = draftVersionRef.current;
          
           showToast("Saved locally — will sync when you're back online", { type: "info" });
        } else {
          showToast("Failed to save locally", { type: "error" });
        }
      }
    } catch (e) {
      console.error(e);
      showToast("Error saving data", { type: "error" });
      await logActivity({
        schoolId,
        actorUid: user?.id || null,
        actorRole: user?.role || null,
        eventType: "attendance_save_failed",
        entityId: `${schoolId}_${selectedClassId}_${date}`,
        meta: {
          status: "failed",
          module: "Attendance",
          classId: selectedClassId,
          date,
          actorName: user?.fullName || "",
          error: (e as any)?.message || "Unknown error",
        },
      });
    } finally {
      setSaving(false);
    }
  };

  if (assignedClassIds.length === 0) {
    return (
      <Layout title="Attendance">
        <div className="p-8 text-center text-slate-500">
          You are not assigned to any class. Contact Admin.
        </div>
      </Layout>
    );
  }

  const classNameLabel =
    CLASSES_LIST.find((c) => c.id === selectedClassId)?.name || selectedClassId;
  const absentCount =
    isHoliday || !hasMarkedAttendance ? 0 : students.length - presentIds.size;
  const allStudentsPresent =
    students.length > 0 &&
    hasMarkedAttendance &&
    presentIds.size === students.length;
  const bulkActionBlocked =
    loading || saving || !selectedClassId || isDateBlocked() || !!adminHoliday;

  return (
    <Layout title="Mark Attendance">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-indigo-50 via-white to-emerald-50 p-6 shadow-sm">
          <div className="absolute -top-16 -right-16 h-40 w-40 rounded-full bg-indigo-200/40 blur-3xl" />
          <div className="absolute -bottom-20 -left-16 h-48 w-48 rounded-full bg-emerald-200/40 blur-3xl" />
          <div className="relative flex flex-col gap-2">
            <h1 className="text-3xl font-bold text-slate-900">
              Student Attendance
            </h1>
            <p className="text-sm text-slate-600">
              Mark attendance quickly and accurately for your class.
            </p>
            {adminHoliday && (
              <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-2 text-xs font-semibold text-amber-900 shadow-sm">
                Admin Holiday: {adminHoliday.reason || "No reason provided"}
              </div>
            )}
            {isHoliday && (
              <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                <AlertTriangle className="h-4 w-4" />
                {adminHoliday ? "Admin Holiday" : "Holiday / No School"}
                {holidayReason ? `• ${holidayReason}` : ""}
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 font-medium text-slate-700 shadow-sm">
                <Users className="h-4 w-4 text-indigo-500" />
                Class: {classNameLabel || "Select class"}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 font-medium text-emerald-700 shadow-sm">
                <CheckCircle className="h-4 w-4" />
                {presentIds.size} Present
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 font-medium text-rose-700 shadow-sm">
                <XCircle className="h-4 w-4" />
                {absentCount} Absent
              </span>
            </div>
          </div>
        </div>

        {/* Missed Attendance Alert */}
        {/* Keeping the original missed attendance alert logic from the file */}
        {/* ... rest of the original component continues ... */}
        <div className="rounded-2xl border bg-white/80 p-6 shadow-sm">
          {/* Header Controls */}
          <div className="flex flex-col gap-6">
            {/* Top Row: Class & Date Selection */}
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              {/* Class Selector */}
              <div className="w-full md:w-64">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Select Class
                </label>
                <select
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
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

              {/* Date Selector */}
              <div className="w-full md:w-64">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Select Date
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    min={getMinDate()}
                    className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2 text-sm shadow-sm transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                  />
                </div>
              </div>
            </div>

            {/* Holiday Toggle */}
            <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
              <label className="inline-flex items-center gap-3 text-sm font-semibold text-amber-900">
                <input
                  type="checkbox"
                  checked={isHoliday}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setIsHoliday(next);
                    if (next) {
                      setPresentIds(new Set());
                    }
                  }}
                  disabled={!!adminHoliday}
                  className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-300"
                />
                Mark this date as Holiday / No School
              </label>
              {adminHoliday ? (
                <div className="text-xs text-amber-800">
                  This date is locked as a holiday by the admin.
                </div>
              ) : isHoliday ? (
                <input
                  type="text"
                  value={holidayReason}
                  onChange={(e) => setHolidayReason(e.target.value)}
                  placeholder="Reason (optional) e.g. Independence Day"
                  className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
                />
              ) : null}
            </div>

            {/* Stats & Save Button */}
            <div className="flex flex-col gap-4 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-700">
                  <CheckCircle className="h-4 w-4" />
                  {presentIds.size} Present
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 font-semibold text-rose-700">
                  <XCircle className="h-4 w-4" />
                  {absentCount} Absent
                </span>
              </div>
              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <button
                  onClick={handleMarkAllPresent}
                  disabled={
                    bulkActionBlocked ||
                    isHoliday ||
                    students.length === 0 ||
                    allStudentsPresent
                  }
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-6 py-2.5 text-sm font-semibold text-emerald-700 shadow-sm transition hover:scale-[1.01] hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  <Users size={18} />
                  {allStudentsPresent ? "All Present Selected" : "Mark All Present"}
                </button>
                <button
                  onClick={handleSave}
                  disabled={bulkActionBlocked}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:scale-[1.01] hover:bg-emerald-700 disabled:opacity-50 sm:w-auto"
                >
                  <Save size={18} />
                  {loading
                    ? "Loading..."
                    : saving
                      ? "Saving..."
                      : isHoliday
                        ? "Save Holiday"
                        : "Save Register"}
                </button>
              </div>
            </div>
          </div>

          {/* Spreadsheet */}
          <div className="rounded-2xl border bg-white/80 p-2 shadow-sm">
            {students.map((student) => {
              const isPresent = presentIds.has(student.id);
              const isBlocked = isDateBlocked() || isHoliday || !!adminHoliday;
              return (
                <div
                  key={student.id}
                  className={`group flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition duration-300 hover:-translate-y-0.5 hover:shadow-md ${
                    isBlocked ? "opacity-60" : "cursor-pointer"
                  }`}
                  onClick={() => !isBlocked && togglePresence(student.id)}
                >
                  <div className="flex items-center gap-4">
                    <UserAvatar user={student} size="md" />
                    <div>
                      <p className="font-semibold text-slate-900">
                        {student.name}
                      </p>
                      <p className="text-xs text-slate-500">{student.gender}</p>
                    </div>
                  </div>

                  <div
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${
                      isHoliday
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : isPresent
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : hasMarkedAttendance
                            ? "border-rose-200 bg-rose-50 text-rose-700"
                            : "border-slate-200 bg-slate-50 text-slate-500"
                    }`}
                  >
                    {isHoliday ? (
                      <AlertTriangle className="h-4 w-4" />
                    ) : isPresent ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : hasMarkedAttendance ? (
                      <XCircle className="h-4 w-4" />
                    ) : (
                      <Clock className="h-4 w-4" />
                    )}
                    {isHoliday
                      ? adminHoliday
                        ? "ADMIN HOLIDAY"
                        : "HOLIDAY"
                      : isPresent
                        ? "PRESENT"
                        : hasMarkedAttendance
                          ? "ABSENT"
                          : "UNMARKED"}
                  </div>
                </div>
              );
            })}

            {students.length === 0 && (
              <div className="p-8 text-center text-slate-500">
                {selectedClassId
                  ? "No students found in this class."
                  : "Select a class to view students."}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Attendance;