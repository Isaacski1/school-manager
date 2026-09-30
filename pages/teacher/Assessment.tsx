import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import Layout from "../../components/Layout";
import { useAuth } from "../../context/AuthContext";
import { useSchool } from "../../context/SchoolContext";
import { db } from "../../services/mockDb";
import { firestore } from "../../services/firebase";
import { collection, doc, onSnapshot, query, where, writeBatch } from "firebase/firestore";
import { Student, Assessment, UserRole } from "../../types";
import {
  CLASSES_LIST,
  ACADEMIC_YEAR,
  CURRENT_TERM,
  calculateGrade,
  getGradeColor,
  calculateTotalScore,
} from "../../constants";
import { useSchoolClasses } from "../../hooks/useSchoolClasses";
import { Save } from "lucide-react";
import { showToast } from "../../services/toast";
import { logActivity } from "../../services/activityLog";
import { useNetworkStatus } from "../../hooks/useNetworkStatus";
import { AssessmentDraftStorage } from "../../src/assessmentDraftStorage";

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

const isPermissionDeniedError = (error: unknown) => {
  const message = String(
    (error as any)?.code || (error as any)?.message || error || "",
  );
  return (
    message.includes("permission-denied") ||
    message.includes("Missing or insufficient permissions")
  );
};

const AssessmentPage = () => {
  const { user } = useAuth();
  const { school } = useSchool();
  const isAdmin = user?.role === UserRole.SCHOOL_ADMIN;
  const { classes: schoolClasses } = useSchoolClasses();
  const { isOnline } = useNetworkStatus();

  const availableClasses = React.useMemo(() => {
    if (isAdmin) {
      return schoolClasses;
    }
    const assignedIds = user?.assignedClassIds || [];
    return schoolClasses.filter((c) => assignedIds.includes(c.id));
  }, [isAdmin, schoolClasses, user?.assignedClassIds]);

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
  const [syncStatus, setSyncStatus] = useState<"idle" | "saving" | "syncing" | "error" | "pending">("idle");
  const [draftRecovered, setDraftRecovered] = useState(false);

  // School config (term + academic year) fetched from DB
  const [schoolConfig, setSchoolConfig] = useState<{
    currentTerm: string;
    academicYear: string;
    assessmentScoreWeights?: {
      testScore: number;
      homeworkScore: number;
      projectScore: number;
      examScore: number;
    };
  }>({ currentTerm: `Term ${CURRENT_TERM}`, academicYear: ACADEMIC_YEAR });

  // Score Limits - use dynamic weights from school config, with defaults
  const LIMITS = React.useMemo(() => ({
    testScore: schoolConfig.assessmentScoreWeights?.testScore ?? 15,
    homeworkScore: schoolConfig.assessmentScoreWeights?.homeworkScore ?? 15,
    projectScore: schoolConfig.assessmentScoreWeights?.projectScore ?? 20,
    examScore: schoolConfig.assessmentScoreWeights?.examScore ?? 100,
  }), [schoolConfig.assessmentScoreWeights]);

  // Offline-first refs
  const currentDraftRef = useRef<{
    schoolId: string;
    classId: string;
    subject: string;
    term: number;
    academicYear: string;
    assessments: Record<string, Partial<Assessment>>;
    lastModified: number;
    version: number;
  } | null>(null);
  const draftVersionRef = useRef(0);
  const isSyncingRef = useRef(false);
  const pendingSyncVersionRef = useRef<{ lastModified: number; version: number; schoolId: string; classId: string; subject: string; term: number; academicYear: string } | null>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const assessmentsRef = useRef(assessments);
  const prevIsOnlineRef = useRef(isOnline);
  const didMountRef = useRef(false);
  const [externalDraftChanged, setExternalDraftChanged] = useState(false);
  const currentContextRef = useRef({
    schoolId: schoolId || "",
    classId: selectedClassId,
    subject: selectedSubject,
    term: CURRENT_TERM,
    academicYear: schoolConfig.academicYear,
  });
  const loadedDraftRevisionRef = useRef<number | null>(null);

  useEffect(() => {
    assessmentsRef.current = assessments;
  }, [assessments]);

  // Multi-tab draft change detection
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleStorage = (event: StorageEvent) => {
      if (!schoolId || !selectedClassId || !selectedSubject) return;

      let dynamicTerm = CURRENT_TERM;
      if (schoolConfig.currentTerm) {
        const match = schoolConfig.currentTerm.match(/\d+/);
        if (match) dynamicTerm = parseInt(match[0], 10);
      }

      const currentKey = AssessmentDraftStorage.getDraftKey(
        schoolId,
        selectedClassId,
        selectedSubject,
        dynamicTerm,
        schoolConfig.academicYear,
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
          } else if (externalDraft.lastModified > localDraft.lastModified) {
            setExternalDraftChanged(true);
          }
        } catch {
          // ignore malformed external storage events
        }
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [schoolId, selectedClassId, selectedSubject, schoolConfig.currentTerm, schoolConfig.academicYear]);

  // Track the current assessment context so old async operations
  // cannot accidentally mutate a newer context's UI state.
  useEffect(() => {
    let dynamicTerm = CURRENT_TERM;
    if (schoolConfig.currentTerm) {
      const match = schoolConfig.currentTerm.match(/\d+/);
      if (match) dynamicTerm = parseInt(match[0], 10);
    }

    currentContextRef.current = {
      schoolId: schoolId || "",
      classId: selectedClassId,
      subject: selectedSubject,
      term: dynamicTerm,
      academicYear: schoolConfig.academicYear,
    };
  }, [schoolId, selectedClassId, selectedSubject, schoolConfig.currentTerm, schoolConfig.academicYear]);

  // Helper: detect whether the stored draft has been changed by another tab
  // since the current tab loaded its local copy.
  const hasStoredRevisionChanged = useCallback(() => {
    if (!schoolId || !selectedClassId || !selectedSubject) return false;
    if (loadedDraftRevisionRef.current === null) return false;

    let dynamicTerm = CURRENT_TERM;
    if (schoolConfig.currentTerm) {
      const match = schoolConfig.currentTerm.match(/\d+/);
      if (match) dynamicTerm = parseInt(match[0], 10);
    }

    const storedDraft = AssessmentDraftStorage.loadDraft(
      schoolId,
      selectedClassId,
      selectedSubject,
      dynamicTerm,
      schoolConfig.academicYear,
    );

    if (!storedDraft) return false;

    const loadedRevision = loadedDraftRevisionRef.current;
    const currentStoredVersion = storedDraft.version;
    const loadedContext = currentContextRef.current;
    const storedContextMatches =
      storedDraft.schoolId === loadedContext.schoolId &&
      storedDraft.classId === loadedContext.classId &&
      storedDraft.subject === loadedContext.subject &&
      storedDraft.term === loadedContext.term &&
      storedDraft.academicYear === loadedContext.academicYear;

    return storedContextMatches && currentStoredVersion !== loadedRevision;
  }, [schoolId, selectedClassId, selectedSubject, schoolConfig.currentTerm, schoolConfig.academicYear]);

  // Draft recovery on context change
  useEffect(() => {
    if (!schoolId || !selectedClassId || !selectedSubject) {
      return;
    }

    let dynamicTerm = CURRENT_TERM;
    if (schoolConfig.currentTerm) {
      const match = schoolConfig.currentTerm.match(/\d+/);
      if (match) dynamicTerm = parseInt(match[0], 10);
    }

    const draft = AssessmentDraftStorage.loadDraft(
      schoolId,
      selectedClassId,
      selectedSubject,
      dynamicTerm,
      schoolConfig.academicYear,
    );

    if (draft) {
      setAssessments(draft.assessments);
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
  }, [schoolId, selectedClassId, selectedSubject, schoolConfig.currentTerm, schoolConfig.academicYear]);

  // Debounced draft persistence
  const scheduleDraftSave = useCallback(() => {
    if (draftTimerRef.current) {
      clearTimeout(draftTimerRef.current);
    }

    draftTimerRef.current = setTimeout(() => {
      if (!schoolId || !selectedClassId || !selectedSubject) return;

      // Multi-tab protection: if the stored draft has been changed by another
      // tab since this tab loaded it, do not silently overwrite it.
      if (hasStoredRevisionChanged()) {
        setExternalDraftChanged(true);
        return;
      }

      let dynamicTerm = CURRENT_TERM;
      if (schoolConfig.currentTerm) {
        const match = schoolConfig.currentTerm.match(/\d+/);
        if (match) dynamicTerm = parseInt(match[0], 10);
      }

      const version = draftVersionRef.current;
      const success = AssessmentDraftStorage.saveDraft(
        schoolId,
        selectedClassId,
        selectedSubject,
        dynamicTerm,
        schoolConfig.academicYear,
        assessmentsRef.current,
        version,
      );

      if (success) {
        currentDraftRef.current = {
          schoolId,
          classId: selectedClassId,
          subject: selectedSubject,
          term: dynamicTerm,
          academicYear: schoolConfig.academicYear,
          assessments: assessmentsRef.current,
          lastModified: Date.now(),
          version,
        };
        loadedDraftRevisionRef.current = version;
        setSyncStatus("idle");
      }
    }, 1000);
  }, [schoolId, selectedClassId, selectedSubject, schoolConfig, hasStoredRevisionChanged]);

  // Reconnection sync
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      prevIsOnlineRef.current = isOnline;
      return;
    }

    const wasOffline = !prevIsOnlineRef.current;
    prevIsOnlineRef.current = isOnline;

    if (!isOnline || !wasOffline) return;
    if (isSyncingRef.current) return;

    let dynamicTerm = CURRENT_TERM;
    if (schoolConfig.currentTerm) {
      const match = schoolConfig.currentTerm.match(/\d+/);
      if (match) dynamicTerm = parseInt(match[0], 10);
    }

    const draft = AssessmentDraftStorage.loadDraft(
      schoolId || "",
      selectedClassId,
      selectedSubject,
      dynamicTerm,
      schoolConfig.academicYear,
    );

    if (!draft) return;

    // If there is a pending sync version, only sync if draft matches
    if (pendingSyncVersionRef.current) {
      const matches =
        draft.schoolId === pendingSyncVersionRef.current.schoolId &&
        draft.classId === pendingSyncVersionRef.current.classId &&
        draft.subject === pendingSyncVersionRef.current.subject &&
        draft.term === pendingSyncVersionRef.current.term &&
        draft.academicYear === pendingSyncVersionRef.current.academicYear &&
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
        subject: draft.subject,
        term: draft.term,
        academicYear: draft.academicYear,
      };

      // Check if the context has changed since we loaded the draft (in the useEffect)
      const currentContext = currentContextRef.current;
      const contextChanged =
        currentContext.schoolId !== syncContext.schoolId ||
        currentContext.classId !== syncContext.classId ||
        currentContext.subject !== syncContext.subject ||
        currentContext.term !== syncContext.term ||
        currentContext.academicYear !== syncContext.academicYear;

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
        subject: draft.subject,
        term: draft.term,
        academicYear: draft.academicYear,
      };
      pendingSyncVersionRef.current = capturedVersion;

      try {
        const completeRecords = (Object.values(draft.assessments) as Assessment[]).map(
          (a) => {
            const total = calculateTotalScore(a);
            return {
              ...a,
              id: a.id || `${draft.schoolId}_${a.studentId}_${draft.subject}_${draft.term}_${draft.academicYear}`,
              schoolId: draft.schoolId,
              total,
              studentId: a.studentId!,
              classId: draft.classId,
              subject: draft.subject,
              term: draft.term as 1 | 2 | 3,
              academicYear: draft.academicYear,
              testScore: a.testScore || 0,
              homeworkScore: a.homeworkScore || 0,
              projectScore: a.projectScore || 0,
              examScore: a.examScore || 0,
            } as Assessment;
          },
        );

        await db.saveAssessmentsBatch(completeRecords);

        // Guard: if context changed, do not mutate current UI state
        const currentContext = currentContextRef.current;
        const contextChanged =
          currentContext.schoolId !== capturedVersion.schoolId ||
          currentContext.classId !== capturedVersion.classId ||
          currentContext.subject !== capturedVersion.subject ||
          currentContext.term !== capturedVersion.term ||
          currentContext.academicYear !== capturedVersion.academicYear;

        if (contextChanged) {
          isSyncingRef.current = false;
          return;
        }

        const currentDraft = AssessmentDraftStorage.loadDraft(
          draft.schoolId,
          draft.classId,
          draft.subject,
          draft.term,
          draft.academicYear,
        );

        if (
          currentDraft &&
          currentDraft.version === capturedVersion.version &&
          currentDraft.lastModified === capturedVersion.lastModified &&
          currentDraft.schoolId === capturedVersion.schoolId &&
          currentDraft.classId === capturedVersion.classId &&
          currentDraft.subject === capturedVersion.subject &&
          currentDraft.term === capturedVersion.term &&
          currentDraft.academicYear === capturedVersion.academicYear
        ) {
          AssessmentDraftStorage.deleteDraft(
            draft.schoolId,
            draft.classId,
            draft.subject,
            draft.term,
            draft.academicYear,
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
          currentContext.subject !== capturedVersion.subject ||
          currentContext.term !== capturedVersion.term ||
          currentContext.academicYear !== capturedVersion.academicYear;
        if (!contextChanged) {
          setSyncStatus("error");
        }
        pendingSyncVersionRef.current = null;
      } finally {
        isSyncingRef.current = false;
      }
    };

syncDraft();
   }, [isOnline, schoolId, selectedClassId, selectedSubject, schoolConfig.currentTerm, schoolConfig.academicYear]);
 
   // Clean up draft timer on unmount to prevent stray saves after component unmount
   useEffect(() => {
     return () => {
       if (draftTimerRef.current) {
         clearTimeout(draftTimerRef.current);
         draftTimerRef.current = null;
       }
     };
   }, []);
 
   // Initialize selected class
  useEffect(() => {
    if (availableClasses.length > 0 && !selectedClassId) {
      setSelectedClassId(availableClasses[0].id);
    }
  }, [availableClasses]);

  // Load school configuration (term + academic year) with real-time updates
  useEffect(() => {
    if (!schoolId) return;

    const configRef = doc(firestore, "settings", schoolId);

    const unsubscribe = onSnapshot(
      configRef,
      (snapshot) => {
        if (!snapshot.exists()) return;
        const cfg = snapshot.data() as any;
        setSchoolConfig({
          currentTerm: cfg.currentTerm || `Term ${CURRENT_TERM}`,
          academicYear: cfg.academicYear || ACADEMIC_YEAR,
          assessmentScoreWeights: cfg.assessmentScoreWeights,
        });
      },
      (error) => {
        console.error("Failed to load school config", error);
      },
    );

    return unsubscribe;
  }, [schoolId]);

  useEffect(() => {
    const loadSubjectsForClass = async () => {
      if (!selectedClassId || !schoolId) {
        setSubjects([]);
        setSelectedSubject("");
        return;
      }

      // Get subjects from DB, with fallback to hardcoded based on class level
      let currentSubjects: string[] = [];
      try {
        currentSubjects = await db.getSubjects(schoolId, selectedClassId);
      } catch (error) {
        if (isPermissionDeniedError(error)) {
          console.debug("Assessment subjects unavailable: permission denied");
        } else {
          console.error("Failed to load assessment subjects", error);
        }
      }

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
      try {
        const studentsList = await db.getStudents(schoolId, selectedClassId);
        setStudents(studentsList);
      } catch (error) {
        if (isPermissionDeniedError(error)) {
          console.debug("Assessment students unavailable: permission denied");
          setStudents([]);
          return;
        }
        console.error("Failed to load assessment students", error);
      }
    };

    loadStudents();
  }, [selectedClassId, schoolId]);

  useEffect(() => {
    if (!selectedClassId || !selectedSubject || !schoolId) {
      setAssessments({});
      return;
    }

    setLoading(true);

    // Determine dynamic term number from schoolConfig (e.g. "Term 2" -> 2)
    let dynamicTerm = CURRENT_TERM;
    if (schoolConfig.currentTerm) {
      const match = schoolConfig.currentTerm.match(/\d+/);
      if (match) dynamicTerm = parseInt(match[0], 10);
    }

    const q = query(
      collection(firestore, "assessments"),
      where("schoolId", "==", schoolId),
      where("classId", "==", selectedClassId),
      where("subject", "==", selectedSubject),
      where("term", "==", dynamicTerm),
      where("academicYear", "==", schoolConfig.academicYear),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const existing: Assessment[] = snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Assessment, "id">),
        }));

        const map: Record<string, Assessment> = {};
        students.forEach((s) => {
          const found = existing.find(
            (a) => a.studentId === s.id && a.term === dynamicTerm,
          );
          const base = found || {
            id: `${s.id}_${selectedSubject.replace(/\//g, '-')}_${dynamicTerm}_${schoolConfig.academicYear}`,
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

          // If we have an active local draft, prefer local values over server values
          const draftRecord = currentDraftRef.current?.assessments[s.id];
          if (draftRecord) {
            map[s.id] = { ...base, ...draftRecord };
          } else {
            map[s.id] = base;
          }
        });
        setAssessments(map);
        setLoading(false);
      },
      (error) => {
        if (isPermissionDeniedError(error)) {
          console.debug("Assessments unavailable: permission denied");
        } else {
          console.error("Failed to load assessments", error);
        }
        setLoading(false);
      },
    );

    return unsubscribe;
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
      const next = { ...prev, [studentId]: { ...current, [field]: numValue } };
      assessmentsRef.current = next;

      // Update draft ref immediately for snapshot protection
      currentDraftRef.current = {
        ...(currentDraftRef.current || {
          schoolId: schoolId || "",
          classId: selectedClassId,
          subject: selectedSubject,
          term: CURRENT_TERM,
          academicYear: schoolConfig.academicYear,
          assessments: {},
          lastModified: Date.now(),
          version: 0,
        }),
        assessments: {
          ...currentDraftRef.current?.assessments,
          [studentId]: { ...current, [field]: numValue },
        },
        lastModified: Date.now(),
      };
      draftVersionRef.current += 1;
      currentDraftRef.current.version = draftVersionRef.current;

      scheduleDraftSave();

      return next;
    });
  };

const handleSave = async () => {
  if (!selectedClassId || !schoolId || !selectedSubject) return;
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
        subject: currentDraftRef.current.subject,
        term: currentDraftRef.current.term,
        academicYear: currentDraftRef.current.academicYear,
      }
    : null;

  try {
    // determine dynamic term from config
    let dynamicTerm = CURRENT_TERM;
    if (schoolConfig.currentTerm) {
      const match = schoolConfig.currentTerm.match(/\d+/);
      if (match) dynamicTerm = parseInt(match[0], 10);
    }

    const completeRecords = (Object.values(assessmentsRef.current) as Assessment[]).map(
      (a) => {
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

        return completeRecord;
      },
    );

    if (isOnline) {
      // Online save - write to Firestore
      await db.saveAssessmentsBatch(completeRecords);

      // Guard: if context changed, do not mutate draft refs or sync status
      const currentContext = currentContextRef.current;
      const contextChanged = capturedVersion
        ? currentContext.schoolId !== capturedVersion.schoolId ||
          currentContext.classId !== capturedVersion.classId ||
          currentContext.subject !== capturedVersion.subject ||
          currentContext.term !== capturedVersion.term ||
          currentContext.academicYear !== capturedVersion.academicYear
        : false;

      if (!contextChanged && capturedVersion && currentDraftRef.current) {
        const unchanged =
          currentDraftRef.current.lastModified === capturedVersion.lastModified &&
          currentDraftRef.current.version === capturedVersion.version &&
          currentDraftRef.current.schoolId === capturedVersion.schoolId &&
          currentDraftRef.current.classId === capturedVersion.classId &&
          currentDraftRef.current.subject === capturedVersion.subject &&
          currentDraftRef.current.term === capturedVersion.term &&
          currentDraftRef.current.academicYear === capturedVersion.academicYear;

        if (unchanged) {
          AssessmentDraftStorage.deleteDraft(
            schoolId,
            selectedClassId,
            selectedSubject,
            dynamicTerm,
            schoolConfig.academicYear,
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
      const saveOperationVersion = capturedVersion?.version ?? draftVersionRef.current;
      const notificationId = `${schoolId}_${selectedClassId}_${selectedSubject}_${dynamicTerm}_${schoolConfig.academicYear}_assessment_save_v${saveOperationVersion}`;
      try {
        await db.addSystemNotification(
          `${user?.fullName || "Teacher"} updated assessments for ${className} in ${selectedSubject}.`,
          "assessment",
          schoolId,
          notificationId,
        );
      } catch (notificationError) {
        console.debug("Assessment notification skipped", notificationError);
      }

      showToast("Saved Successfully", { type: "success" });
      loadedDraftRevisionRef.current = currentDraftRef.current?.version ?? null;
      await logActivity({
        schoolId,
        actorUid: user?.id || null,
        actorRole: user?.role || null,
        eventType: "assessments_saved",
        entityId: `${selectedClassId}_${selectedSubject}`,
        meta: {
          status: "success",
          module: "Assessment",
          classId: selectedClassId,
          subject: selectedSubject,
          term: schoolConfig.currentTerm,
          academicYear: schoolConfig.academicYear,
          actorName: user?.fullName || "",
        },
      });
    } else {
      // Offline save - persist draft locally
      let dynamicTerm = CURRENT_TERM;
      if (schoolConfig.currentTerm) {
        const match = schoolConfig.currentTerm.match(/\d+/);
        if (match) dynamicTerm = parseInt(match[0], 10);
      }

      const success = AssessmentDraftStorage.saveDraft(
        schoolId || "",
        selectedClassId,
        selectedSubject,
        dynamicTerm,
        schoolConfig.academicYear,
        assessmentsRef.current,
        draftVersionRef.current + 1, // Increment version for offline save
      );

      if (success) {
        // Update local refs to match saved draft
        currentDraftRef.current = {
          schoolId: schoolId || "",
          classId: selectedClassId,
          subject: selectedSubject,
          term: dynamicTerm,
          academicYear: schoolConfig.academicYear,
          assessments: assessmentsRef.current,
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
      eventType: "assessments_save_failed",
      entityId: `${selectedClassId}_${selectedSubject}`,
      meta: {
        status: "failed",
        module: "Assessment",
        classId: selectedClassId,
        subject: selectedSubject,
        term: schoolConfig.currentTerm,
        academicYear: schoolConfig.academicYear,
        error: (e as any)?.message || "Unknown error",
        actorName: user?.fullName || "",
      },
    });
  } finally {
    setSaving(false);
  }
};

  if (availableClasses.length === 0)
    return (
      <Layout title="Assessment">
        <div className="p-8 text-center text-slate-500">No class available.</div>
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
                {availableClasses.map((c) => {
                  return (
                    <option key={c.id} value={c.id}>
                      {c.name}
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
            <div className="flex items-center gap-4">
              {/* Sync Status */}
              {!isOnline && (
                <div className="text-sm text-amber-600 font-medium flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  Offline — changes saved locally
                </div>
              )}
              {isOnline && syncStatus === "syncing" && (
                <div className="text-sm text-blue-600 font-medium flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  Syncing...
                </div>
              )}
              {isOnline && syncStatus === "pending" && (
                <div className="text-sm text-amber-600 font-medium flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  New changes saved locally — waiting to sync
                </div>
              )}
              {externalDraftChanged && (
                <div className="text-sm text-orange-700 font-medium flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-orange-500" />
                  This assessment was changed in another tab.
                  <button
                    onClick={() => {
                      setExternalDraftChanged(false);
                      if (schoolId && selectedClassId && selectedSubject) {
                        let dynamicTerm = CURRENT_TERM;
                        if (schoolConfig.currentTerm) {
                          const match = schoolConfig.currentTerm.match(/\d+/);
                          if (match) dynamicTerm = parseInt(match[0], 10);
                        }
                        const draft = AssessmentDraftStorage.loadDraft(
                          schoolId,
                          selectedClassId,
                          selectedSubject,
                          dynamicTerm,
                          schoolConfig.academicYear,
                        );
                        if (draft) {
                          setAssessments(draft.assessments);
                          currentDraftRef.current = draft;
                          draftVersionRef.current = draft.version;
                          loadedDraftRevisionRef.current = draft.version;
                          setDraftRecovered(true);
                        }
                      }
                    }}
                    className="underline text-orange-900"
                  >
                    Review latest changes
                  </button>
                </div>
              )}
              {isOnline && syncStatus === "error" && (
                <div className="text-sm text-red-600 font-medium flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  Sync failed — changes preserved locally
                </div>
              )}
              {isOnline && syncStatus === "idle" && draftRecovered && (
                <div className="text-sm text-emerald-600 font-medium flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Draft recovered
                </div>
              )}
<button
  onClick={handleSave}
  disabled={saving || !selectedSubject || !selectedClassId}
  className="flex items-center bg-emerald-600 text-white px-6 py-2 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
>
  <Save size={18} className="mr-2" />
  {saving ? "Saving..." : "Save Scores"}
</button>
            </div>
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
                  Class Score
                  <br />
                  <span className="text-[10px] normal-case font-bold text-emerald-600">
                    ({LIMITS.testScore})
                  </span>
                </th>
                <th className="px-2 py-3 w-24 text-center">
                  Homework
                  <br />
                  <span className="text-[10px] normal-case font-bold text-emerald-600">
                    ({LIMITS.homeworkScore})
                  </span>
                </th>
                <th className="px-2 py-3 w-24 text-center">
                  Project
                  <br />
                  <span className="text-[10px] normal-case font-bold text-emerald-600">
                    ({LIMITS.projectScore})
                  </span>
                </th>
                <th className="px-2 py-3 w-28 text-center border-l border-slate-200 bg-red-50/50">
                  Exam
                  <br />
                  <span className="text-[10px] normal-case font-bold text-red-600">
                    ({LIMITS.examScore})
                  </span>
                </th>
                <th className="assessment-result-header w-24 bg-slate-200 px-4 py-3 text-center">
                  Total
                  <br />
                  <span className="text-[10px] normal-case">(100%)</span>
                </th>
                <th className="assessment-result-header w-20 bg-slate-200 px-4 py-3 text-center">
                  Grade
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {students.map((student) => {
                const data =
                  assessments[student.id] || ({} as Partial<Assessment>);
                const total = calculateTotalScore(data, LIMITS);
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
