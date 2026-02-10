import React, { useState, useEffect } from "react";
import Layout from "../../components/Layout";
import { showToast } from "../../services/toast";
import { db } from "../../services/mockDb";
import { Notice, ClassRoom, SchoolConfig } from "../../types";
import { useAuth } from "../../context/AuthContext";
import { useSchool } from "../../context/SchoolContext";
import { requireSchoolId } from "../../services/authProfile";
import {
  CLASSES_LIST,
  nurserySubjects,
  kgSubjects,
  primarySubjects,
  jhsSubjects,
} from "../../constants";
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
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

const getClassGroupKey = (name: string) => {
  const normalized = name.toLowerCase();
  if (normalized.includes("nursery")) return "Nursery";
  if (normalized.startsWith("kg") || normalized.includes("kg")) return "KG";
  if (/class\s*[1-3]\b/i.test(name)) return "Class 1-3";
  if (/class\s*[4-6]\b/i.test(name)) return "Class 4-6";
  if (/jhs\s*[1-3]\b/i.test(name)) return "JHS 1-3";
  return "Other";
};

const SystemSettings = () => {
  const { user } = useAuth();
  const { school } = useSchool();
  const schoolId = requireSchoolId(user);
  const isTrialPlan = (school as any)?.plan === "trial";

  // Notices State
  const [notices, setNotices] = useState<Notice[]>([]);
  const [newNotice, setNewNotice] = useState("");
  const [noticeDate, setNoticeDate] = useState(
    new Date().toISOString().split("T")[0],
  ); // Default to today
  const [noticeType, setNoticeType] = useState<"info" | "urgent">("info");
  const [isAddingNotice, setIsAddingNotice] = useState(false);

  // Class Subjects State
  const [selectedClassId, setSelectedClassId] = useState<string>(
    CLASSES_LIST[0]?.id || "",
  );
  const [currentClassSubjects, setCurrentClassSubjects] = useState<string[]>(
    [],
  );
  const [newSubjectName, setNewSubjectName] = useState("");
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
  });
  const [savingConfig, setSavingConfig] = useState(false);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false); // New state
  const [newHolidayDate, setNewHolidayDate] = useState("");
  const [newHolidayReason, setNewHolidayReason] = useState("");

  // Danger Zone State
  const [showDangerZone, setShowDangerZone] = useState(false);
  const [termResetting, setTermResetting] = useState(false);
  const [showTermResetModal, setShowTermResetModal] = useState(false);
  const [showDeleteSubjectModal, setShowDeleteSubjectModal] = useState(false);
  const [subjectToDeleteName, setSubjectToDeleteName] = useState<string | null>(
    null,
  );

  // Logo Upload State
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const classGroups = React.useMemo(() => {
    const groups: Record<string, ClassRoom[]> = {
      Nursery: [],
      KG: [],
      "Class 1-3": [],
      "Class 4-6": [],
      "JHS 1-3": [],
      Other: [],
    };

    CLASSES_LIST.forEach((cls: ClassRoom) => {
      const key = getClassGroupKey(cls.name);
      groups[key].push(cls);
    });

    return groups;
  }, []);

  const getGroupClassIds = (classId: string) => {
    const cls = CLASSES_LIST.find((item) => item.id === classId);
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
    }));
  };

  useEffect(() => {
    fetchNotices();
    fetchConfig();
  }, [schoolId]);

  useEffect(() => {
    fetchSubjects();
  }, [selectedClassId, schoolId]);

  // --- Config Handlers ---
  const handleSaveConfig = async () => {
    setSavingConfig(true);
    await db.updateSchoolConfig({
      ...config,
      holidayDates: config.holidayDates || [],
    });
    setSavingConfig(false);
    showToast("Configuration saved successfully!", { type: "success" });
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
    await db.updateSchoolConfig({
      ...nextConfig,
      holidayDates: nextConfig.holidayDates || [],
    });
    showToast("Holiday date saved.", { type: "success" });
    setNewHolidayDate("");
    setNewHolidayReason("");
  };

  const handleRemoveHolidayDate = async (date: string) => {
    const current = config.holidayDates || [];
    const nextConfig = {
      ...config,
      holidayDates: current.filter((h) => h.date !== date),
    };
    setConfig(nextConfig);
    await db.updateSchoolConfig({
      ...nextConfig,
      holidayDates: nextConfig.holidayDates || [],
    });
    showToast("Holiday date removed.", { type: "success" });
  };

  const handleCreateTermBackup = async () => {
    setIsCreatingBackup(true);
    try {
      // db.createTermBackup will be implemented in the next step
      // For now, it will use currentTerm and academicYear from the config state
      await db.createTermBackup(
        config,
        config.currentTerm,
        config.academicYear,
      );
      showToast("Term backup created successfully!", { type: "success" });
    } catch (error) {
      console.error("Error creating term backup:", error);
      showToast("Failed to create term backup. Please try again.", {
        type: "error",
      });
    } finally {
      setIsCreatingBackup(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingLogo(true);
    try {
      const storage = getStorage();
      const storageRef = ref(storage, `logos/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);
      const updatedConfig = { ...config, schoolId, logoUrl: downloadURL };
      setConfig(updatedConfig);
      await db.updateSchoolConfig(updatedConfig);
      showToast("Logo uploaded successfully!", { type: "success" });
    } catch (error) {
      console.error("Logo upload error:", error);
      showToast("Failed to upload logo. Please try again.", { type: "error" });
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
    } catch (error) {
      console.error("Error adding notice:", error);
      showToast("Failed to add notice. Please try again.", { type: "error" });
    } finally {
      setIsAddingNotice(false);
    }
  };

  const handleDeleteNotice = async (id: string) => {
    await db.deleteNotice(id);
    fetchNotices();
  };

  // --- Subjects Handlers ---
  const handleAddSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubjectName.trim() || !selectedClassId) return;
    const targetClassIds = getGroupClassIds(selectedClassId);
    await Promise.all(
      targetClassIds.map((classId) =>
        db.addSubject(classId, newSubjectName.trim(), schoolId),
      ),
    );
    setNewSubjectName("");
    fetchSubjects();
    showToast("Subject added successfully!", { type: "success" });
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
    } catch (error) {
      console.error("Error deleting subject:", error);
      showToast("Failed to delete subject. Please try again.", {
        type: "error",
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
  };

  // --- Danger Zone Handler ---
  const handleTermReset = () => {
    setShowTermResetModal(true);
  };

  const deleteCollectionInBatches = async (collectionName: string) => {
    const collectionRef = collection(firestore, collectionName);
    const snapshot = await getDocs(collectionRef);
    const deletions = snapshot.docs.map((doc) => deleteDoc(doc.ref));
    await Promise.all(deletions);
  };

  const confirmTermReset = async () => {
    setShowTermResetModal(false);
    setTermResetting(true);
    try {
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

      for (const colName of collectionsToDelete) {
        console.log(`Deleting collection: ${colName}`);
        await deleteCollectionInBatches(colName);
      }

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
      // Reload the page to reflect changes
      window.location.reload();
    } catch (error: any) {
      console.error("Term Reset error:", error);
      showToast(`Term Reset Failed: ${error.message}`, { type: "error" });
    } finally {
      setTermResetting(false);
    }
  };

  return (
    <Layout title="System Settings">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-indigo-50 via-white to-emerald-50 p-6 shadow-sm">
          <div className="absolute -top-16 -right-16 h-40 w-40 rounded-full bg-indigo-200/40 blur-3xl" />
          <div className="absolute -bottom-20 -left-16 h-48 w-48 rounded-full bg-emerald-200/40 blur-3xl" />
          <div className="relative flex flex-col gap-2">
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
              <span className="h-10 w-10 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                <Settings size={20} />
              </span>
              System Settings
            </h1>
            <p className="text-sm text-slate-600">
              Configure academic terms, subjects, notices, and backups with a
              premium control center.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column */}
          <div className="space-y-8">
            {/* General Config */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
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

            {/* Subject Management */}
            {/* Subject Management */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
              <h2 className="text-xl font-bold mb-6 text-slate-800 flex items-center">
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

              <form onSubmit={handleAddSubject} className="flex gap-2 mb-6">
                <input
                  type="text"
                  required
                  className="flex-1 border border-slate-200 p-2.5 rounded-xl focus:ring-2 focus:ring-[#1160A8] outline-none text-sm"
                  placeholder="New subject name..."
                  value={newSubjectName}
                  onChange={(e) => setNewSubjectName(e.target.value)}
                />
                <button
                  type="submit"
                  className="bg-[#1160A8] text-white px-4 py-2 rounded-xl hover:bg-[#0B4A82] transition-colors"
                >
                  <Plus size={20} />
                </button>
              </form>

              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {currentClassSubjects.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center italic">
                    No subjects configured for this class. Add some above!
                  </p>
                ) : (
                  currentClassSubjects.map((subject) => (
                    <div
                      key={subject}
                      className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100 group"
                    >
                      {editingSubject?.original === subject ? (
                        <div className="flex items-center flex-1 gap-2">
                          <input
                            type="text"
                            className="flex-1 border border-slate-200 p-2 rounded-lg text-sm focus:ring-2 focus:ring-[#1160A8] outline-none"
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
                          <span className="text-sm font-medium text-slate-700">
                            {subject}
                          </span>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
              <h2 className="text-xl font-bold mb-6 text-slate-800 flex items-center">
                <Save className="mr-2 text-purple-600" size={24} />
                Term Data Backup
              </h2>
              <p className="text-sm text-slate-600 mb-4">
                Create a full backup of the current term's academic records,
                attendance, and student data. Backups can be viewed and restored
                from the "Manage Backups" section.
              </p>
              <button
                onClick={handleCreateTermBackup}
                disabled={isCreatingBackup || isTrialPlan}
                className="bg-purple-600 text-white px-4 py-2 rounded-full hover:bg-purple-700 transition-colors flex items-center disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isCreatingBackup ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                    Creating...
                  </>
                ) : (
                  <>
                    <Save size={16} className="mr-2" /> Create Current Term
                    Backup
                  </>
                )}
              </button>
              <Link
                to="/admin/backups"
                className={`mt-4 inline-flex items-center text-sm font-medium ${
                  isTrialPlan
                    ? "text-slate-400 pointer-events-none"
                    : "text-[#1160A8] hover:text-[#0B4A82]"
                }`}
              >
                <History size={16} className="mr-1" /> View Previous Backups
              </Link>
              {isTrialPlan && (
                <p className="text-xs text-slate-500 mt-2">
                  Backups are disabled during the trial period.
                </p>
              )}
            </div>

            {/* Secret Database Reset */}
            {showDangerZone && (
              <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6">
                <div className="flex items-center mb-4">
                  <Shield className="text-rose-600 mr-2" size={24} />
                  <h2 className="text-xl font-bold text-rose-800">
                    Danger Zone: Database Reset
                  </h2>
                </div>
                <p className="text-rose-700 mb-4">
                  This will reset term data (attendance, assessments, reports,
                  and term-specific records) for the selected term. It does not
                  delete school accounts or core setup, but the term data cannot
                  be recovered. Use with extreme caution.
                </p>
                <div className="flex flex-col space-y-4">
                  <button
                    onClick={handleTermReset}
                    disabled={termResetting}
                    className="bg-rose-600 text-white px-4 py-2 rounded-full hover:bg-rose-700 disabled:bg-rose-400 transition-colors"
                  >
                    {termResetting ? "Resetting Term..." : "Term Reset"}
                  </button>
                </div>
              </div>
            )}

            <div className="text-center mt-4">
              <button
                onClick={() => setShowDangerZone(!showDangerZone)}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition-all hover:border-[#1160A8] hover:text-[#0B4A82] hover:shadow-md"
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                    showDangerZone
                      ? "bg-rose-100 text-rose-600"
                      : "bg-[#E6F0FA] text-[#0B4A82]"
                  }`}
                >
                  {showDangerZone ? "—" : "+"}
                </span>
                {showDangerZone ? "Hide" : "Show"} Advanced Settings
              </button>
            </div>
          </div>

          {/* Right Column: Notices Management */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex flex-col h-full">
            <h2 className="text-xl font-bold mb-6 text-slate-800 flex items-center">
              <Megaphone className="mr-2 text-emerald-600" size={24} />
              School Notices
            </h2>

            <form
              onSubmit={handleAddNotice}
              className="mb-6 bg-slate-50 p-4 rounded-2xl border border-slate-200"
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
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <label className="flex items-center text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="type"
                      className="mr-2 text-emerald-600 focus:ring-emerald-500"
                      checked={noticeType === "info"}
                      onChange={() => setNoticeType("info")}
                    />
                    Info
                  </label>
                  <label className="flex items-center text-sm cursor-pointer">
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
                  className="bg-emerald-600 text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-emerald-700 transition-colors flex items-center disabled:opacity-70 disabled:cursor-not-allowed"
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

            <div className="flex-1 overflow-y-auto pr-1">
              <h3 className="text-sm font-bold text-slate-500 uppercase mb-3">
                Active Notices
              </h3>
              <div className="space-y-3">
                {notices.length === 0 ? (
                  <p className="text-slate-400 text-sm text-center italic">
                    No notices posted.
                  </p>
                ) : (
                  notices.map((notice) => (
                    <div
                      key={notice.id}
                      className="flex justify-between items-start group p-3 border border-slate-100 rounded-xl hover:bg-slate-50 transition-colors"
                    >
                      <div
                        className={`border-l-2 pl-3 ${notice.type === "urgent" ? "border-red-500" : "border-emerald-500"}`}
                      >
                        <p className="text-sm text-slate-800 font-medium">
                          {notice.message}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          {notice.date} â€¢{" "}
                          {notice.type === "urgent" ? "Urgent" : "General Info"}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteNotice(notice.id)}
                        className="text-slate-300 hover:text-[#1160A8] transition-colors p-1"
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
        </div>
      </div>

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
