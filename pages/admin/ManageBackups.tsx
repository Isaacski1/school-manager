import React, { useEffect, useMemo, useState } from "react";
import Layout from "../../components/Layout";
import { db } from "../../services/mockDb";
import { Backup, BackupType, RecoveryCollectionScope } from "../../types";
import {
  RefreshCcw,
  Eye,
  Download,
  Trash2,
  Filter,
  X,
  Shield,
  History,
} from "lucide-react";
import { showToast } from "../../services/toast";
import { useSchool } from "../../context/SchoolContext";

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

const formatTimestamp = (value?: number) =>
  value ? new Date(value).toLocaleString() : "-";

const getEntryTitle = (entry: Partial<Backup>) =>
  entry.recoveryMeta?.title || `${entry.term || "Backup"} - ${entry.academicYear || ""}`;

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

const applyFilters = (
  rows: Partial<Backup>[],
  filters: { term: string; academicYear: string; date: string },
) =>
  rows.filter((row) => {
    if (filters.term && row.term !== filters.term) return false;
    if (
      filters.academicYear &&
      row.academicYear !== filters.academicYear.trim()
    ) {
      return false;
    }
    if (filters.date) {
      const start = new Date(filters.date).getTime();
      const end = start + 24 * 60 * 60 * 1000 - 1;
      if ((row.timestamp || 0) < start || (row.timestamp || 0) > end) {
        return false;
      }
    }
    return true;
  });

const getCollectionBadges = (collections: RecoveryCollectionScope[] = []) =>
  collections.map(
    (scope) => scope.label || COLLECTION_LABELS[scope.collection] || scope.collection,
  );

const ManageBackups = () => {
  const { school } = useSchool();
  const schoolId = school?.id || null;
  const isTrialPlan = (school as any)?.plan === "trial";

  const [fullBackups, setFullBackups] = useState<Partial<Backup>[]>([]);
  const [recoveryPoints, setRecoveryPoints] = useState<Partial<Backup>[]>([]);
  const [recycleBin, setRecycleBin] = useState<Partial<Backup>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const refreshEntries = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!schoolId) {
        setFullBackups([]);
        setRecoveryPoints([]);
        setRecycleBin([]);
        return;
      }
      const [backups, recovery, recycle] = await Promise.all([
        db.getBackups({ schoolId }),
        db.getRecoveryRecords({ schoolId, backupType: "recovery-point" }),
        db.getRecoveryRecords({ schoolId, backupType: "recycle-bin" }),
      ]);
      setFullBackups(backups);
      setRecoveryPoints(recovery);
      setRecycleBin(recycle);
    } catch (err) {
      console.error("Failed to load recovery center", err);
      setError("Failed to load recovery center.");
      showToast("Failed to load recovery center.", { type: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshEntries();
  }, [schoolId]);

  const filters = useMemo(
    () => ({
      term: filterTerm,
      academicYear: filterAcademicYear,
      date: filterDate,
    }),
    [filterTerm, filterAcademicYear, filterDate],
  );

  const filteredBackups = useMemo(
    () => applyFilters(fullBackups, filters),
    [fullBackups, filters],
  );
  const filteredRecoveryPoints = useMemo(
    () => applyFilters(recoveryPoints, filters),
    [recoveryPoints, filters],
  );
  const filteredRecycleBin = useMemo(
    () => applyFilters(recycleBin, filters),
    [recycleBin, filters],
  );

  const latestProtection = useMemo(() => {
    const rows = [...fullBackups, ...recoveryPoints, ...recycleBin].sort(
      (a, b) => (b.timestamp || 0) - (a.timestamp || 0),
    );
    return rows[0] || null;
  }, [fullBackups, recoveryPoints, recycleBin]);

  const handleView = async (id: string) => {
    try {
      if (!schoolId) return;
      const details = await db.getBackupDetails(schoolId, id);
      if (!details) {
        showToast("Record not found.", { type: "error" });
        return;
      }
      setSelectedEntry(details);
    } catch (err) {
      console.error("Failed to load details", err);
      showToast("Failed to load details.", { type: "error" });
    }
  };

  const handleDownload = async (id: string) => {
    try {
      if (!schoolId) return;
      const details = await db.getBackupDetails(schoolId, id);
      if (!details?.data || !isFullBackup(details)) {
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
    if (!entryToDelete?.id || !schoolId) return;
    setBusyAction("delete");
    try {
      const deletedId = entryToDelete.id;
      const deletedType = entryToDelete.backupType;
      await db.deleteBackup(schoolId, deletedId);
      if (selectedEntry?.id === deletedId) {
        setSelectedEntry(null);
      }
      setEntryToDelete(null);
      showToast(
        deletedType === "recycle-bin"
          ? "Recycle-bin item purged."
          : deletedType === "recovery-point"
            ? "Recovery point deleted."
            : "Backup deleted.",
        { type: "success" },
      );
      await refreshEntries();
    } catch (err) {
      console.error("Delete failed", err);
      showToast("Failed to delete record.", { type: "error" });
    } finally {
      setBusyAction(null);
    }
  };

  const confirmRestoreBackup = async () => {
    if (!entryToRestoreBackup?.id || !schoolId) return;
    setBusyAction("restore-backup");
    try {
      const restoredId = entryToRestoreBackup.id;
      await db.restoreBackup(schoolId, restoredId);
      if (selectedEntry?.id === restoredId) {
        setSelectedEntry(null);
      }
      setEntryToRestoreBackup(null);
      showToast("Backup restored. A safety backup was created first.", {
        type: "success",
      });
      await refreshEntries();
    } catch (err: any) {
      console.error("Backup restore failed", err);
      showToast(err?.message || "Failed to restore backup.", {
        type: "error",
      });
    } finally {
      setBusyAction(null);
    }
  };

  const confirmRestoreRecovery = async () => {
    if (!entryToRestoreRecovery?.id || !schoolId) return;
    setBusyAction("restore-recovery");
    try {
      const restoredId = entryToRestoreRecovery.id;
      const restoredType = entryToRestoreRecovery.backupType;
      await db.restoreRecoveryRecord(schoolId, restoredId);
      if (selectedEntry?.id === restoredId) {
        setSelectedEntry(null);
      }
      setEntryToRestoreRecovery(null);
      showToast(
        restoredType === "recycle-bin"
          ? "Recycle-bin item restored."
          : "Recovery point restored.",
        { type: "success" },
      );
      await refreshEntries();
    } catch (err: any) {
      console.error("Recovery restore failed", err);
      showToast(err?.message || "Failed to restore record.", {
        type: "error",
      });
    } finally {
      setBusyAction(null);
    }
  };

  const renderList = (
    title: string,
    subtitle: string,
    rows: Partial<Backup>[],
    icon: React.ReactNode,
    listClassName = "",
  ) => (
    <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <div className="rounded-xl bg-slate-100 p-3">{icon}</div>
        <div>
          <h2 className="text-xl font-bold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-slate-500">
          No records found for the current filters.
        </div>
      ) : (
        <div className={`space-y-4 ${listClassName}`.trim()}>
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
                    {entry.recoveryMeta?.restoredAt && (
                      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                        Restored
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">
                      {getEntryTitle(entry)}
                    </p>
                    <p className="text-sm text-slate-500">
                      {getEntryDescription(entry)}
                    </p>
                  </div>
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
                      disabled={isTrialPlan}
                      className="inline-flex items-center rounded-lg bg-emerald-100 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-200 disabled:opacity-60"
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
                    disabled={isTrialPlan || busyAction !== null}
                    className="inline-flex items-center rounded-lg bg-amber-100 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-200 disabled:opacity-60"
                  >
                    <RefreshCcw size={16} className="mr-1" /> Restore
                  </button>
                  <button
                    onClick={() => setEntryToDelete(entry)}
                    disabled={isTrialPlan || busyAction !== null}
                    className="inline-flex items-center rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-60"
                  >
                    <Trash2 size={16} className="mr-1" />
                    {entry.backupType === "recycle-bin" ? "Purge" : "Delete"}
                  </button>
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
      <Layout title="Recovery Center">
        <div className="flex h-48 items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-300 border-t-[#0B4A82]"></div>
          <p className="ml-4 text-slate-500">Loading recovery center...</p>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout title="Recovery Center">
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
    <Layout title="Recovery Center">
      <div className="space-y-6">
        <section className="rounded-3xl bg-gradient-to-br from-[#0B4A82] via-[#0f2745] to-[#1f2937] p-6 text-white shadow-xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
                <Shield size={14} className="mr-2" /> Automatic protection
              </div>
              <h1 className="text-3xl font-bold">Recovery Center</h1>
              <p className="mt-3 max-w-2xl text-sm text-slate-200">
                Use recycle-bin restore for deleted records, recovery points for
                risky bulk changes, and full backups for major restore cases.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4 text-sm">
              <p className="font-semibold">Latest protection</p>
              <p className="mt-1">
                {latestProtection
                  ? `${getEntryTypeLabel(latestProtection)} at ${formatTimestamp(latestProtection.timestamp)}`
                  : "No recovery data yet."}
              </p>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
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
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Last Protected
            </p>
            <p className="mt-2 text-sm font-bold text-slate-900">
              {latestProtection
                ? new Date(latestProtection.timestamp || 0).toLocaleString()
                : "No records"}
            </p>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Filters</h2>
              <p className="text-sm text-slate-500">
                Apply the same filters across all recovery layers.
              </p>
            </div>
            <button
              onClick={() => {
                setFilterTerm("");
                setFilterAcademicYear("");
                setFilterDate("");
              }}
              className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
            >
              Clear Filters
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
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
            Showing {filteredRecycleBin.length} recycle items,{" "}
            {filteredRecoveryPoints.length} recovery points, and{" "}
            {filteredBackups.length} full backups.
          </div>
        </section>

        {renderList(
          "Recycle Bin",
          "Restore deleted records without rolling back the whole workspace.",
          filteredRecycleBin,
          <Trash2 className="text-rose-700" size={20} />,
        )}
        {renderList(
          "Recovery Points",
          "These are created automatically before risky bulk changes.",
          filteredRecoveryPoints,
          <History className="text-amber-700" size={20} />,
          "max-h-[38rem] overflow-y-auto pr-2",
        )}
        {renderList(
          "Full Backups",
          "Use these when the entire school workspace needs to be restored.",
          filteredBackups,
          <Shield className="text-[#0B4A82]" size={20} />,
        )}

        {isTrialPlan && (
          <p className="text-xs text-slate-500">
            Recovery center actions are disabled during the trial period.
          </p>
        )}
      </div>

      {selectedEntry && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-60 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {getEntryTypeLabel(selectedEntry)}
                </p>
                <h3 className="text-xl font-bold text-slate-900">
                  {getEntryTitle(selectedEntry)}
                </h3>
              </div>
              <button
                onClick={() => setSelectedEntry(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-6 p-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    Created
                  </p>
                  <p className="mt-2 font-semibold text-slate-900">
                    {formatTimestamp(selectedEntry.timestamp)}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    Records
                  </p>
                  <p className="mt-2 text-2xl font-bold text-slate-900">
                    {getRecordCount(selectedEntry)}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    Term
                  </p>
                  <p className="mt-2 font-semibold text-slate-900">
                    {selectedEntry.term || "-"}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    Academic Year
                  </p>
                  <p className="mt-2 font-semibold text-slate-900">
                    {selectedEntry.academicYear || "-"}
                  </p>
                </div>
              </div>

              {selectedEntry.recoveryMeta?.collections?.length ? (
                <div className="flex flex-wrap gap-2">
                  {getCollectionBadges(selectedEntry.recoveryMeta.collections).map(
                    (badge) => (
                      <span
                        key={`detail_${badge}`}
                        className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600"
                      >
                        {badge}
                      </span>
                    ),
                  )}
                </div>
              ) : null}

              {selectedEntry.data?.students?.length ? (
                <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                  <h4 className="font-bold text-slate-900">Students</h4>
                  <div className="mt-3 space-y-2">
                    {selectedEntry.data.students.map((student) => (
                      <div
                        key={student.id}
                        className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-900"
                      >
                        {student.name}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {selectedEntry.data?.users?.length ? (
                <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                  <h4 className="font-bold text-slate-900">Users</h4>
                  <div className="mt-3 space-y-2">
                    {selectedEntry.data.users.map((record) => (
                      <div
                        key={record.id}
                        className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm"
                      >
                        <div>
                          <p className="font-medium text-slate-900">
                            {record.fullName}
                          </p>
                          <p className="text-slate-500">{record.email}</p>
                        </div>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase text-slate-600">
                          {record.role}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {selectedEntry.data?.notices?.length ? (
                <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                  <h4 className="font-bold text-slate-900">Notices</h4>
                  <div className="mt-3 space-y-2">
                    {selectedEntry.data.notices.map((notice) => (
                      <div
                        key={notice.id}
                        className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3"
                      >
                        <p className="text-sm font-medium text-slate-900">
                          {notice.message}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {notice.date} | {notice.type}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {selectedEntry.data?.classSubjects?.length ? (
                <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                  <h4 className="font-bold text-slate-900">Class Subjects</h4>
                  <div className="mt-3 space-y-3">
                    {selectedEntry.data.classSubjects.map((config) => (
                      <div
                        key={`${config.schoolId}_${config.classId}`}
                        className="rounded-xl border border-slate-100 bg-slate-50 p-4"
                      >
                        <p className="font-semibold text-slate-900">
                          {config.classId}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {(config.subjects || []).map((subject) => (
                            <span
                              key={subject}
                              className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600"
                            >
                              {subject}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {entryToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-6">
              <h3 className="text-lg font-bold text-slate-900">
                Confirm Delete
              </h3>
              <button
                onClick={() => setEntryToDelete(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-3 p-6 text-sm text-slate-600">
              <p>
                Delete <strong>{getEntryTitle(entryToDelete)}</strong> from the
                recovery center?
              </p>
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
                into the current workspace.
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
                Restore <strong>{getEntryTitle(entryToRestoreRecovery)}</strong>
                ?
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

export default ManageBackups;
