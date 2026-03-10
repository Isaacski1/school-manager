import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../../components/Layout";
import { db } from "../../services/mockDb";
import { showToast } from "../../services/toast";
import { firestore } from "../../services/firebase";
import { collection, deleteDoc, doc, getDoc, getDocs } from "firebase/firestore";
import {
  Backup,
  BackupType,
  RecoveryCollectionScope,
  School,
} from "../../types";
import {
  Building,
  Download,
  Eye,
  Filter,
  History,
  RefreshCcw,
  Shield,
  Trash2,
  X,
} from "lucide-react";

const FULL_BACKUP_TYPES = new Set<BackupType>([
  "term-reset",
  "manual",
  "safety-restore",
]);

const COLLECTION_LABELS: Record<string, string> = {
  settings: "Settings",
  students: "Students",
  attendance: "Attendance",
  teacher_attendance: "Teacher Attendance",
  assessments: "Assessments",
  student_remarks: "Student Remarks",
  admin_remarks: "Admin Remarks",
  student_skills: "Student Skills",
  timetables: "Timetables",
  users: "Users",
  class_subjects: "Class Subjects",
  notices: "Notices",
  admin_notifications: "Notifications",
  fees: "Fees",
  student_ledgers: "Ledgers",
  payments: "Payments",
  finance_settings: "Finance Settings",
};

const isFullBackup = (entry?: Partial<Backup> | Backup | null) =>
  FULL_BACKUP_TYPES.has((entry?.backupType || "manual") as BackupType);

const formatTimestamp = (value?: number | null) =>
  value ? new Date(value).toLocaleString() : "-";

const getEntryTitle = (entry: Partial<Backup>) =>
  entry.recoveryMeta?.title ||
  `${entry.term || "Backup"} - ${entry.academicYear || ""}`;

const getEntryTypeLabel = (entry: Partial<Backup>) => {
  switch (entry.backupType) {
    case "recycle-bin":
      return "Recycle Bin";
    case "recovery-point":
      return "Recovery Point";
    case "safety-restore":
      return "Safety Backup";
    case "term-reset":
      return "Term Reset Backup";
    case "manual":
    default:
      return "Manual Backup";
  }
};

const getEntryDescription = (entry: Partial<Backup>) =>
  entry.recoveryMeta?.description ||
  (entry.backupType === "safety-restore"
    ? "Automatic safety backup created before a restore."
    : "Full school snapshot.");

const getRecordCount = (entry: Partial<Backup>) => {
  if (typeof entry.recoveryMeta?.recordCount === "number") {
    return entry.recoveryMeta.recordCount;
  }
  const data = entry.data;
  if (!data) return 0;
  return [
    data.students?.length || 0,
    data.teacherAttendanceRecords?.length || 0,
    data.users?.length || 0,
    data.notices?.length || 0,
    data.classSubjects?.length || 0,
    data.payments?.length || 0,
    data.fees?.length || 0,
    data.studentLedgers?.length || 0,
  ].reduce((sum, value) => sum + value, 0);
};

const getCollectionBadges = (collections: RecoveryCollectionScope[] = []) =>
  collections.map(
    (scope) => scope.label || COLLECTION_LABELS[scope.collection] || scope.collection,
  );

const Backups: React.FC = () => {
  const [schools, setSchools] = useState<School[]>([]);
  const [entries, setEntries] = useState<Partial<Backup>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterSchoolId, setFilterSchoolId] = useState("");
  const [filterTerm, setFilterTerm] = useState("");
  const [filterAcademicYear, setFilterAcademicYear] = useState("");
  const [filterDate, setFilterDate] = useState("");

  const [selectedEntry, setSelectedEntry] = useState<Backup | null>(null);
  const [entryToDelete, setEntryToDelete] = useState<Partial<Backup> | null>(
    null,
  );
  const [entryToRestoreBackup, setEntryToRestoreBackup] =
    useState<Partial<Backup> | null>(null);
  const [entryToRestoreRecovery, setEntryToRestoreRecovery] =
    useState<Partial<Backup> | null>(null);
  const [busyAction, setBusyAction] = useState<
    "delete" | "restore-backup" | "restore-recovery" | null
  >(null);

  const schoolMap = useMemo(
    () =>
      schools.reduce<Record<string, School>>((acc, school) => {
        acc[school.id] = school;
        return acc;
      }, {}),
    [schools],
  );

  const getSchoolLabel = (schoolId?: string | null) => {
    if (!schoolId) return "Unknown school";
    return schoolMap[schoolId]?.name || schoolId;
  };

  const refreshEntries = async () => {
    setLoading(true);
    setError(null);
    try {
      const [schoolSnap, backupSnap] = await Promise.all([
        getDocs(collection(firestore, "schools")),
        getDocs(collection(firestore, "backups")),
      ]);
      setSchools(
        schoolSnap.docs.map(
          (schoolDoc) => ({ id: schoolDoc.id, ...(schoolDoc.data() as any) }) as School,
        ),
      );
      setEntries(
        backupSnap.docs
          .map((backupDoc) => backupDoc.data() as Partial<Backup>)
          .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)),
      );
    } catch (err) {
      console.error("Failed to load recovery records", err);
      setError("Failed to load recovery records.");
      showToast("Failed to load recovery records.", { type: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshEntries();
  }, []);

  const filteredEntries = useMemo(
    () =>
      entries.filter((entry) => {
        if (filterSchoolId && entry.schoolId !== filterSchoolId) return false;
        if (filterTerm && entry.term !== filterTerm) return false;
        if (
          filterAcademicYear &&
          entry.academicYear !== filterAcademicYear.trim()
        ) {
          return false;
        }
        if (filterDate) {
          const start = new Date(filterDate).getTime();
          const end = start + 24 * 60 * 60 * 1000 - 1;
          if ((entry.timestamp || 0) < start || (entry.timestamp || 0) > end) {
            return false;
          }
        }
        return true;
      }),
    [entries, filterAcademicYear, filterDate, filterSchoolId, filterTerm],
  );

  const fullBackups = useMemo(
    () => filteredEntries.filter((entry) => isFullBackup(entry)),
    [filteredEntries],
  );
  const recoveryPoints = useMemo(
    () => filteredEntries.filter((entry) => entry.backupType === "recovery-point"),
    [filteredEntries],
  );
  const recycleBin = useMemo(
    () => filteredEntries.filter((entry) => entry.backupType === "recycle-bin"),
    [filteredEntries],
  );
  const filteredSchoolCount = useMemo(
    () =>
      new Set(
        filteredEntries
          .map((entry) => entry.schoolId)
          .filter((schoolId): schoolId is string => Boolean(schoolId)),
      ).size,
    [filteredEntries],
  );

  const handleView = async (id: string) => {
    try {
      const snap = await getDoc(doc(firestore, "backups", id));
      if (!snap.exists()) {
        showToast("Record not found.", { type: "error" });
        return;
      }
      setSelectedEntry(snap.data() as Backup);
    } catch (err) {
      console.error("Failed to load details", err);
      showToast("Failed to load details.", { type: "error" });
    }
  };

  const handleDownload = async (id: string) => {
    try {
      const snap = await getDoc(doc(firestore, "backups", id));
      if (!snap.exists()) {
        showToast("Record not found.", { type: "error" });
        return;
      }
      const details = snap.data() as Backup;
      if (!details.data || !isFullBackup(details)) {
        showToast("Only full backups can be downloaded.", { type: "error" });
        return;
      }
      const blob = new Blob([JSON.stringify(details.data, null, 2)], {
        type: "application/json",
      });
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = `backup_${details.academicYear.replace("-", "")}_${details.term.replace(" ", "")}_${details.timestamp}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(href);
      showToast("Backup downloaded successfully.", { type: "success" });
    } catch (err) {
      console.error("Failed to download backup", err);
      showToast("Failed to download backup.", { type: "error" });
    }
  };

  const confirmDelete = async () => {
    if (!entryToDelete?.id) return;
    setBusyAction("delete");
    try {
      await deleteDoc(doc(firestore, "backups", entryToDelete.id));
      if (selectedEntry?.id === entryToDelete.id) {
        setSelectedEntry(null);
      }
      setEntryToDelete(null);
      showToast("Record deleted.", { type: "success" });
      await refreshEntries();
    } catch (err) {
      console.error("Failed to delete record", err);
      showToast("Failed to delete record.", { type: "error" });
    } finally {
      setBusyAction(null);
    }
  };

  const confirmRestoreBackup = async () => {
    if (!entryToRestoreBackup?.id || !entryToRestoreBackup.schoolId) return;
    setBusyAction("restore-backup");
    try {
      await db.restoreBackup(entryToRestoreBackup.schoolId, entryToRestoreBackup.id);
      if (selectedEntry?.id === entryToRestoreBackup.id) {
        setSelectedEntry(null);
      }
      setEntryToRestoreBackup(null);
      showToast("Backup restored for the school.", { type: "success" });
      await refreshEntries();
    } catch (err: any) {
      console.error("Failed to restore backup", err);
      showToast(err?.message || "Failed to restore backup.", {
        type: "error",
      });
    } finally {
      setBusyAction(null);
    }
  };

  const confirmRestoreRecovery = async () => {
    if (!entryToRestoreRecovery?.id || !entryToRestoreRecovery.schoolId) return;
    setBusyAction("restore-recovery");
    try {
      await db.restoreRecoveryRecord(
        entryToRestoreRecovery.schoolId,
        entryToRestoreRecovery.id,
      );
      if (selectedEntry?.id === entryToRestoreRecovery.id) {
        setSelectedEntry(null);
      }
      setEntryToRestoreRecovery(null);
      showToast("Recovery record restored for the school.", {
        type: "success",
      });
      await refreshEntries();
    } catch (err: any) {
      console.error("Failed to restore recovery record", err);
      showToast(err?.message || "Failed to restore recovery record.", {
        type: "error",
      });
    } finally {
      setBusyAction(null);
    }
  };

  const renderList = (
    title: string,
    rows: Partial<Backup>[],
    icon: React.ReactNode,
  ) => (
    <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <div className="rounded-xl bg-slate-100 p-3">{icon}</div>
        <h2 className="text-xl font-bold text-slate-900">{title}</h2>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-slate-500">
          No records found for the current filters.
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((entry) => (
            <div
              key={entry.id}
              className="rounded-2xl border border-slate-200 bg-white p-4"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[#E6F0FA] px-3 py-1 text-xs font-semibold text-[#0B4A82]">
                      {getEntryTypeLabel(entry)}
                    </span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                      {getSchoolLabel(entry.schoolId)}
                    </span>
                  </div>
                  <p className="font-bold text-slate-900">
                    {getEntryTitle(entry)}
                  </p>
                  <p className="text-sm text-slate-500">
                    {getEntryDescription(entry)}
                  </p>
                  <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                    <span>Created: {formatTimestamp(entry.timestamp)}</span>
                    <span>Records: {getRecordCount(entry)}</span>
                    <span>Term: {entry.term || "-"}</span>
                  </div>
                  {entry.recoveryMeta?.collections?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {getCollectionBadges(entry.recoveryMeta.collections).map(
                        (badge) => (
                          <span
                            key={`${entry.id}_${badge}`}
                            className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600"
                          >
                            {badge}
                          </span>
                        ),
                      )}
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleView(entry.id || "")}
                    className="inline-flex items-center rounded-lg bg-[#E6F0FA] px-3 py-2 text-sm font-medium text-[#0B4A82] hover:bg-[#d7e7f7]"
                  >
                    <Eye size={16} className="mr-1" /> View
                  </button>
                  {isFullBackup(entry) && (
                    <button
                      onClick={() => handleDownload(entry.id || "")}
                      className="inline-flex items-center rounded-lg bg-emerald-100 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-200"
                    >
                      <Download size={16} className="mr-1" /> Download
                    </button>
                  )}
                  <button
                    onClick={() =>
                      isFullBackup(entry)
                        ? setEntryToRestoreBackup(entry)
                        : setEntryToRestoreRecovery(entry)
                    }
                    disabled={!entry.schoolId || busyAction !== null}
                    className="inline-flex items-center rounded-lg bg-amber-100 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-200 disabled:opacity-60"
                  >
                    <RefreshCcw size={16} className="mr-1" /> Restore
                  </button>
                  <button
                    onClick={() => setEntryToDelete(entry)}
                    disabled={busyAction !== null}
                    className="inline-flex items-center rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-60"
                  >
                    <Trash2 size={16} className="mr-1" /> Delete
                  </button>
                  <Link
                    to={
                      entry.schoolId
                        ? `/super-admin/schools/${entry.schoolId}`
                        : "/super-admin/schools"
                    }
                    className="inline-flex items-center rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
                  >
                    <Building size={16} className="mr-1" /> School
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );

  if (loading) {
    return (
      <Layout title="School Recovery Center">
        <div className="flex h-48 items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-300 border-t-[#0B4A82]"></div>
          <p className="ml-4 text-slate-500">Loading school recovery center...</p>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout title="School Recovery Center">
        <div className="rounded-xl border border-[#E6F0FA] bg-[#E6F0FA] p-8 text-center">
          <p className="text-[#0B4A82]">{error}</p>
          <button
            onClick={refreshEntries}
            className="mt-4 inline-flex items-center rounded-lg bg-[#0B4A82] px-4 py-2 text-white hover:bg-[#083862]"
          >
            <RefreshCcw size={16} className="mr-2" /> Retry
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="School Recovery Center">
      <div className="space-y-6">
        <section className="rounded-3xl bg-gradient-to-br from-[#0B4A82] via-[#0f2745] to-[#1f2937] p-6 text-white shadow-xl">
          <h1 className="text-3xl font-bold">School Recovery Center</h1>
          <p className="mt-3 max-w-3xl text-sm text-slate-200">
            Super admins can now review recycle-bin items, recovery points, and
            full backups across every school and restore them directly from this
            page.
          </p>
        </section>

        <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Filters</h2>
              <p className="text-sm text-slate-500">
                Narrow the list before restoring a school.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={refreshEntries}
                className="rounded-lg bg-[#0B4A82] px-4 py-2 text-sm font-medium text-white hover:bg-[#083862]"
              >
                <RefreshCcw size={16} className="mr-2 inline" /> Refresh
              </button>
              <button
                onClick={() => {
                  setFilterSchoolId("");
                  setFilterTerm("");
                  setFilterAcademicYear("");
                  setFilterDate("");
                }}
                className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
              >
                Clear Filters
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <select
              value={filterSchoolId}
              onChange={(e) => setFilterSchoolId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-800 outline-none focus:ring-2 focus:ring-[#1160A8]"
            >
              <option value="">All Schools</option>
              {schools.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.name}
                </option>
              ))}
            </select>
            <select
              value={filterTerm}
              onChange={(e) => setFilterTerm(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-800 outline-none focus:ring-2 focus:ring-[#1160A8]"
            >
              <option value="">All Terms</option>
              <option value="Term 1">Term 1</option>
              <option value="Term 2">Term 2</option>
              <option value="Term 3">Term 3</option>
            </select>
            <input
              type="text"
              value={filterAcademicYear}
              onChange={(e) => setFilterAcademicYear(e.target.value)}
              placeholder="Academic year"
              className="w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-800 outline-none focus:ring-2 focus:ring-[#1160A8]"
            />
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-800 outline-none focus:ring-2 focus:ring-[#1160A8]"
            />
          </div>

          <div className="mt-4 inline-flex items-center rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">
            <Filter size={16} className="mr-2" />
            Showing {filteredEntries.length} records across {filteredSchoolCount}{" "}
            school{filteredSchoolCount === 1 ? "" : "s"}.
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Full Backups
            </p>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {fullBackups.length}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Recovery Points
            </p>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {recoveryPoints.length}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Recycle Bin
            </p>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {recycleBin.length}
            </p>
          </div>
        </section>

        {renderList(
          "Recycle Bin",
          recycleBin,
          <Trash2 className="text-rose-700" size={20} />,
        )}
        {renderList(
          "Recovery Points",
          recoveryPoints,
          <History className="text-amber-700" size={20} />,
        )}
        {renderList(
          "Full Backups",
          fullBackups,
          <Shield className="text-[#0B4A82]" size={20} />,
        )}
      </div>

      {selectedEntry && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-60 p-4">
          <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {getEntryTypeLabel(selectedEntry)}
                </p>
                <h3 className="text-xl font-bold text-slate-900">
                  {getEntryTitle(selectedEntry)}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {getSchoolLabel(selectedEntry.schoolId)}
                </p>
              </div>
              <button
                onClick={() => setSelectedEntry(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4 p-6 text-sm text-slate-600">
              <p>Created: {formatTimestamp(selectedEntry.timestamp)}</p>
              <p>Term: {selectedEntry.term || "-"}</p>
              <p>Academic Year: {selectedEntry.academicYear || "-"}</p>
              <p>Records: {getRecordCount(selectedEntry)}</p>
              {selectedEntry.recoveryMeta?.collections?.length ? (
                <div className="flex flex-wrap gap-2">
                  {getCollectionBadges(selectedEntry.recoveryMeta.collections).map(
                    (badge) => (
                      <span
                        key={badge}
                        className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600"
                      >
                        {badge}
                      </span>
                    ),
                  )}
                </div>
              ) : null}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 p-6">
              {selectedEntry.schoolId && (
                <Link
                  to={`/super-admin/schools/${selectedEntry.schoolId}`}
                  className="rounded-lg bg-slate-100 px-4 py-2 text-slate-700 hover:bg-slate-200"
                >
                  Open School
                </Link>
              )}
              <button
                onClick={() => setSelectedEntry(null)}
                className="rounded-lg bg-[#0B4A82] px-4 py-2 text-white hover:bg-[#083862]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {entryToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-6">
              <h3 className="text-lg font-bold text-slate-900">Confirm Delete</h3>
              <button
                onClick={() => setEntryToDelete(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-3 p-6 text-sm text-slate-600">
              <p>
                Delete <strong>{getEntryTitle(entryToDelete)}</strong>?
              </p>
              <p>School: {getSchoolLabel(entryToDelete.schoolId)}</p>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 p-6">
              <button
                onClick={() => setEntryToDelete(null)}
                className="rounded-lg bg-slate-100 px-4 py-2 text-slate-700 hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={busyAction === "delete"}
                className="rounded-lg bg-rose-600 px-4 py-2 text-white hover:bg-rose-700 disabled:opacity-60"
              >
                {busyAction === "delete" ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {entryToRestoreBackup && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-6">
              <h3 className="text-lg font-bold text-amber-800">
                Confirm Full Restore
              </h3>
              <button
                onClick={() => setEntryToRestoreBackup(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-3 p-6 text-sm text-slate-600">
              <p>
                Restore <strong>{getEntryTitle(entryToRestoreBackup)}</strong>{" "}
                for <strong>{getSchoolLabel(entryToRestoreBackup.schoolId)}</strong>.
              </p>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 p-6">
              <button
                onClick={() => setEntryToRestoreBackup(null)}
                className="rounded-lg bg-slate-100 px-4 py-2 text-slate-700 hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={confirmRestoreBackup}
                disabled={busyAction === "restore-backup"}
                className="rounded-lg bg-amber-600 px-4 py-2 text-white hover:bg-amber-700 disabled:opacity-60"
              >
                {busyAction === "restore-backup" ? "Restoring..." : "Restore"}
              </button>
            </div>
          </div>
        </div>
      )}

      {entryToRestoreRecovery && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-6">
              <h3 className="text-lg font-bold text-emerald-800">
                Confirm Recovery Restore
              </h3>
              <button
                onClick={() => setEntryToRestoreRecovery(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-3 p-6 text-sm text-slate-600">
              <p>
                Restore <strong>{getEntryTitle(entryToRestoreRecovery)}</strong>{" "}
                for <strong>{getSchoolLabel(entryToRestoreRecovery.schoolId)}</strong>.
              </p>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 p-6">
              <button
                onClick={() => setEntryToRestoreRecovery(null)}
                className="rounded-lg bg-slate-100 px-4 py-2 text-slate-700 hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={confirmRestoreRecovery}
                disabled={busyAction === "restore-recovery"}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {busyAction === "restore-recovery"
                  ? "Restoring..."
                  : "Restore"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default Backups;
