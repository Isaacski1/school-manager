import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../../components/Layout";
import { db } from "../../services/mockDb";
import { Backup, BackupType, RecoveryCollectionScope } from "../../types";
import { useSchool } from "../../context/SchoolContext";
import { showToast } from "../../services/toast";
import {
  Archive,
  ArrowRight,
  Bell,
  Building2,
  CalendarRange,
  Clock3,
  Database,
  Download,
  Eye,
  Filter,
  History,
  RefreshCcw,
  Settings2,
  Shield,
  Sparkles,
  Trash2,
  Users,
  Wallet,
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
  billing_payments: "Billing Payments",
  finance_settings: "Finance Settings",
};

const ENTRY_STYLES: Record<BackupType, { badge: string; card: string }> = {
  manual: {
    badge: "bg-cyan-100 text-cyan-900",
    card:
      "border-cyan-200/70 bg-gradient-to-br from-cyan-50 via-white to-slate-50",
  },
  "term-reset": {
    badge: "bg-amber-100 text-amber-900",
    card:
      "border-amber-200/70 bg-gradient-to-br from-amber-50 via-white to-orange-50",
  },
  "safety-restore": {
    badge: "bg-emerald-100 text-emerald-900",
    card:
      "border-emerald-200/70 bg-gradient-to-br from-emerald-50 via-white to-cyan-50",
  },
  "recovery-point": {
    badge: "bg-violet-100 text-violet-900",
    card:
      "border-violet-200/70 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50",
  },
  "recycle-bin": {
    badge: "bg-rose-100 text-rose-900",
    card:
      "border-rose-200/70 bg-gradient-to-br from-rose-50 via-white to-orange-50",
  },
};

type Metric = { key: string; label: string; count: number; description: string };

const isFullBackup = (entry?: Partial<Backup> | Backup | null) =>
  FULL_BACKUP_TYPES.has((entry?.backupType || "manual") as BackupType);

const formatTimestamp = (value?: number) =>
  value ? new Date(value).toLocaleString() : "-";

const getEntryStyle = (entry?: Partial<Backup> | Backup | null) =>
  ENTRY_STYLES[(entry?.backupType || "manual") as BackupType] ||
  ENTRY_STYLES.manual;

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
    : "Full school workspace snapshot.");

const getCollectionBadges = (collections: RecoveryCollectionScope[] = []) =>
  collections.map(
    (scope) =>
      scope.label || COLLECTION_LABELS[scope.collection] || scope.collection,
  );

const getMetrics = (entry?: Partial<Backup> | Backup | null): Metric[] => {
  const data = entry?.data;
  return [
    { key: "brand", label: "Branding", count: data?.schoolProfile ? 1 : 0, description: "School profile and brand" },
    { key: "settings", label: "Settings", count: data?.schoolSettings || data?.schoolConfig ? 1 : 0, description: "Academic year and grading setup" },
    { key: "users", label: "Users", count: data?.users?.length || 0, description: "Admins and teachers" },
    { key: "students", label: "Students", count: data?.students?.length || 0, description: "Student roster" },
    { key: "attendance", label: "Attendance", count: (data?.attendanceRecords?.length || 0) + (data?.teacherAttendanceRecords?.length || 0), description: "Student and teacher attendance" },
    { key: "assessment", label: "Assessments", count: (data?.assessments?.length || 0) + (data?.studentRemarks?.length || 0) + (data?.adminRemarks?.length || 0) + (data?.studentSkills?.length || 0), description: "Scores, remarks, and skills" },
    { key: "schedule", label: "Schedule", count: (data?.timetables?.length || 0) + (data?.classSubjects?.length || 0), description: "Timetables and subjects" },
    { key: "communication", label: "Communication", count: (data?.notices?.length || 0) + (data?.adminNotifications?.length || 0), description: "Notices and notifications" },
    { key: "finance", label: "Finance", count: (data?.fees?.length || 0) + (data?.studentLedgers?.length || 0) + (data?.payments?.length || 0) + (data?.billingPayments?.length || 0) + (data?.financeSettings ? 1 : 0), description: "Fees, student payments, billing history, and ledgers" },
    { key: "activity", label: "Activity", count: data?.activityLogs?.length || 0, description: "Administrative history" },
  ];
};

const getRecordCount = (entry?: Partial<Backup> | Backup | null) =>
  getMetrics(entry).reduce((sum, metric) => sum + metric.count, 0);

const getCollectionCount = (entry?: Partial<Backup> | Backup | null) =>
  getMetrics(entry).filter((metric) => metric.count > 0).length;

const getTopMetrics = (entry?: Partial<Backup> | Backup | null) =>
  getMetrics(entry)
    .filter((metric) => metric.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);

const applyFilters = (
  rows: Partial<Backup>[],
  filters: { term: string; year: string; date: string },
) =>
  rows.filter((row) => {
    if (filters.term && row.term !== filters.term) return false;
    if (filters.year && row.academicYear !== filters.year.trim()) return false;
    if (filters.date) {
      const start = new Date(filters.date).getTime();
      const end = start + 24 * 60 * 60 * 1000 - 1;
      if ((row.timestamp || 0) < start || (row.timestamp || 0) > end) {
        return false;
      }
    }
    return true;
  });

const normalizeMessage = (value?: string | null) => {
  const text = String(value || "").trim();
  return text.length > 90 ? `${text.slice(0, 87)}...` : text || "Untitled";
};

const resolvePaymentAmount = (payment?: Record<string, any>) => {
  const amount = Number(
    payment?.amountPaid ??
      payment?.amount ??
      payment?.total ??
      payment?.value ??
      0,
  );
  if (!Number.isFinite(amount)) return 0;
  return amount >= 100 ? amount / 100 : amount;
};

const formatAmount = (amount: number) =>
  `GHS ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const ConfirmModal = ({
  title,
  description,
  confirmLabel,
  busy,
  confirmClassName,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  busy: boolean;
  confirmClassName: string;
  onCancel: () => void;
  onConfirm: () => void;
}) => (
  <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
    <div className="w-full max-w-md overflow-hidden rounded-[28px] border border-white/20 bg-white shadow-[0_40px_120px_-60px_rgba(15,23,42,0.85)]">
      <div className="flex items-center justify-between border-b border-slate-200 p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            Confirmation
          </p>
          <h3 className="mt-2 text-xl font-bold text-slate-950">{title}</h3>
        </div>
        <button
          onClick={onCancel}
          className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:text-slate-800"
        >
          <X size={18} />
        </button>
      </div>
      <div className="space-y-3 p-6 text-sm leading-6 text-slate-600">
        {description}
      </div>
      <div className="flex justify-end gap-3 border-t border-slate-200 p-6">
        <button
          onClick={onCancel}
          className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={busy}
          className={`rounded-full px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-60 ${confirmClassName}`}
        >
          {busy ? "Working..." : confirmLabel}
        </button>
      </div>
    </div>
  </div>
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
  const [filterYear, setFilterYear] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [selectedEntry, setSelectedEntry] = useState<Backup | null>(null);
  const [entryToDelete, setEntryToDelete] = useState<Partial<Backup> | null>(null);
  const [entryToRestoreBackup, setEntryToRestoreBackup] = useState<Partial<Backup> | null>(null);
  const [entryToRestoreRecovery, setEntryToRestoreRecovery] = useState<Partial<Backup> | null>(null);
  const [busyAction, setBusyAction] = useState<"delete" | "restore-backup" | "restore-recovery" | null>(null);

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
    () => ({ term: filterTerm, year: filterYear, date: filterDate }),
    [filterDate, filterTerm, filterYear],
  );

  const filteredBackups = useMemo(
    () => applyFilters(fullBackups, filters),
    [filters, fullBackups],
  );
  const filteredRecovery = useMemo(
    () => applyFilters(recoveryPoints, filters),
    [filters, recoveryPoints],
  );
  const filteredRecycle = useMemo(
    () => applyFilters(recycleBin, filters),
    [filters, recycleBin],
  );

  const latestProtection = useMemo(() => {
    const rows = [...fullBackups, ...recoveryPoints, ...recycleBin].sort(
      (a, b) => (b.timestamp || 0) - (a.timestamp || 0),
    );
    return rows[0] || null;
  }, [fullBackups, recoveryPoints, recycleBin]);

  const latestFullBackup = useMemo(
    () =>
      [...fullBackups].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[
        0
      ] || null,
    [fullBackups],
  );

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
      await db.deleteBackup(schoolId, entryToDelete.id);
      if (selectedEntry?.id === entryToDelete.id) setSelectedEntry(null);
      setEntryToDelete(null);
      showToast("Recovery record deleted.", { type: "success" });
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
      await db.restoreBackup(schoolId, entryToRestoreBackup.id);
      if (selectedEntry?.id === entryToRestoreBackup.id) setSelectedEntry(null);
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
      await db.restoreRecoveryRecord(schoolId, entryToRestoreRecovery.id);
      if (selectedEntry?.id === entryToRestoreRecovery.id)
        setSelectedEntry(null);
      setEntryToRestoreRecovery(null);
      showToast("Recovery record restored.", { type: "success" });
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

  const renderSection = (
    title: string,
    subtitle: string,
    rows: Partial<Backup>[],
    icon: React.ReactNode,
  ) => (
    <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_30px_80px_-50px_rgba(15,23,42,0.45)]">
      <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="flex items-center gap-4">
          <div className="rounded-2xl bg-slate-950 p-3 text-white">{icon}</div>
          <div>
            <h2 className="text-2xl font-bold text-slate-950">{title}</h2>
            <p className="text-sm text-slate-600">{subtitle}</p>
          </div>
        </div>
        <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700">
          {rows.length}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-[28px] border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
          No records match the current filters.
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {rows.map((entry) => {
            const style = getEntryStyle(entry);
            const badges = getCollectionBadges(entry.recoveryMeta?.collections);
            const topMetrics = getTopMetrics(entry);

            return (
              <article
                key={entry.id}
                className={`rounded-[28px] border p-5 shadow-[0_24px_70px_-48px_rgba(15,23,42,0.8)] ${style.card}`}
              >
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${style.badge}`}
                      >
                        {getEntryTypeLabel(entry)}
                      </span>
                      {entry.recoveryMeta?.restoredAt ? (
                        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-800">
                          Restored
                        </span>
                      ) : null}
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-slate-950">
                        {getEntryTitle(entry)}
                      </h3>
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                        {getEntryDescription(entry)}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                      {[
                        { label: "Records", value: getRecordCount(entry) },
                        { label: "Collections", value: getCollectionCount(entry) },
                        { label: "Term", value: entry.term || "-" },
                        { label: "Created", value: formatTimestamp(entry.timestamp) },
                      ].map((item) => (
                        <div
                          key={`${entry.id}_${item.label}`}
                          className="rounded-2xl border border-white/80 bg-white/75 px-4 py-3"
                        >
                          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                            {item.label}
                          </p>
                          <p className="mt-2 font-semibold text-slate-900">
                            {item.value}
                          </p>
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(badges.length
                        ? badges
                        : topMetrics.map((metric) => `${metric.label}: ${metric.count}`)).map(
                        (badge) => (
                          <span
                            key={`${entry.id}_${badge}`}
                            className="rounded-full border border-white/80 bg-white/70 px-3 py-1.5 text-xs font-medium text-slate-700"
                          >
                            {badge}
                          </span>
                        ),
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 xl:max-w-sm xl:justify-end">
                    <button
                      onClick={() => handleView(entry.id || "")}
                      title="View Backup"
                      className="inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50"
                    >
                      <Eye size={16} className="mr-2" /> View
                    </button>
                    {isFullBackup(entry) ? (
                      <button
                        onClick={() => handleDownload(entry.id || "")}
                        disabled={isTrialPlan}
                        title="Download Backup"
                        className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-60"
                      >
                        <Download size={16} className="mr-2" /> Download
                      </button>
                    ) : null}
                    <button
                      onClick={() =>
                        isFullBackup(entry)
                          ? setEntryToRestoreBackup(entry)
                          : setEntryToRestoreRecovery(entry)
                      }
                      disabled={isTrialPlan || busyAction !== null}
                      title={
                        isFullBackup(entry)
                          ? "Restore Backup"
                          : "Restore Recovery Record"
                      }
                      className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 transition hover:bg-amber-100 disabled:opacity-60"
                    >
                      <RefreshCcw size={16} className="mr-2" /> Restore
                    </button>
                    <button
                      onClick={() => setEntryToDelete(entry)}
                      disabled={isTrialPlan || busyAction !== null}
                      className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-900 transition hover:bg-rose-100 disabled:opacity-60"
                    >
                      <Trash2 size={16} className="mr-2" /> Delete
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );

  if (loading) {
    return (
      <Layout title="Recovery Center">
        <div className="flex h-56 items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-300 border-t-slate-900" />
          <p className="ml-4 text-slate-500">Loading recovery center...</p>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout title="Recovery Center">
        <div className="rounded-[28px] border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-slate-700">{error}</p>
          <button
            onClick={refreshEntries}
            className="mt-4 inline-flex items-center rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            <RefreshCcw size={16} className="mr-2" /> Retry
          </button>
        </div>
      </Layout>
    );
  }

  const selectedMetrics = getMetrics(selectedEntry).filter(
    (metric) => metric.count > 0,
  );
  const selectedSettings =
    selectedEntry?.data?.schoolSettings || selectedEntry?.data?.schoolConfig;

  return (
    <Layout title="Recovery Center">
      <div className="space-y-8 pb-8">
        <section className="relative overflow-hidden rounded-[36px] bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.28),_transparent_32%),radial-gradient(circle_at_top_right,_rgba(14,165,233,0.28),_transparent_34%),linear-gradient(135deg,_#020617_0%,_#0f172a_45%,_#1e293b_100%)] p-6 text-white shadow-[0_45px_140px_-70px_rgba(15,23,42,0.95)] lg:p-8">
          <div className="absolute -left-16 top-10 h-36 w-36 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-cyan-400/20 blur-3xl" />
          <div className="relative grid gap-6 lg:grid-cols-[1.5fr_0.8fr]">
            <div>
              <div className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-100">
                <Sparkles size={14} className="mr-2" /> Full-System Protection
              </div>
              <h1 className="mt-5 text-3xl font-bold tracking-tight text-white md:text-4xl">
                System Recovery Center
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-200 md:text-base">
                Manual backups now capture the full school workspace: settings,
                branding, users, student data, finance, communication, and
                activity history.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  to="/admin/settings"
                  className="inline-flex items-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
                >
                  Create Full Backup <ArrowRight size={16} className="ml-2" />
                </Link>
                <button
                  onClick={refreshEntries}
                  className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
                >
                  <RefreshCcw size={16} className="mr-2" /> Refresh Records
                </button>
              </div>
            </div>

            <div className="grid gap-4">
              <div className="rounded-[28px] border border-white/10 bg-white/10 p-5 backdrop-blur">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-300">
                    Latest Protection
                  </p>
                  <Clock3 size={16} className="text-slate-300" />
                </div>
                <p className="mt-3 text-lg font-semibold text-white">
                  {latestProtection
                    ? getEntryTypeLabel(latestProtection)
                    : "No recovery data yet"}
                </p>
                <p className="mt-2 text-sm text-slate-300">
                  {latestProtection
                    ? formatTimestamp(latestProtection.timestamp)
                    : "Create your first full backup from System Settings."}
                </p>
              </div>

              <div className="rounded-[28px] border border-white/10 bg-white/10 p-5 backdrop-blur">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-300">
                    Latest Full Snapshot
                  </p>
                  <Shield size={16} className="text-slate-300" />
                </div>
                <p className="mt-3 text-3xl font-bold text-white">
                  {latestFullBackup ? getRecordCount(latestFullBackup) : 0}
                </p>
                <p className="mt-2 text-sm text-slate-300">
                  {latestFullBackup
                    ? `${getCollectionCount(latestFullBackup)} collections protected`
                    : "No manual or term reset backups yet."}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: "Available Backups",
                value: fullBackups.length,
                note: "Full-school restore points",
                icon: <Shield size={16} />,
                iconClass: "bg-slate-950 text-white",
              },
              {
                label: "Recovery Points",
                value: recoveryPoints.length,
                note: "Scoped rollback checkpoints",
                icon: <History size={16} />,
                iconClass: "bg-violet-100 text-violet-700",
              },
              {
                label: "Recycle Bin",
                value: recycleBin.length,
                note: "Recently deleted records",
                icon: <Archive size={16} />,
                iconClass: "bg-rose-100 text-rose-700",
              },
              {
                label: "Latest Coverage",
                value: latestFullBackup ? getCollectionCount(latestFullBackup) : 0,
                note: "Collections in the newest snapshot",
                icon: <Database size={16} />,
                iconClass: "bg-cyan-100 text-cyan-700",
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                    {item.label}
                  </p>
                  <div className={`rounded-2xl p-2 ${item.iconClass}`}>
                    {item.icon}
                  </div>
                </div>
                <p className="mt-4 text-3xl font-bold text-slate-950">
                  {item.value}
                </p>
                <p className="mt-2 text-sm text-slate-500">{item.note}</p>
              </div>
            ))}
          </div>

          <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Filters
                </p>
                <h2 className="mt-2 text-2xl font-bold text-slate-950">
                  Narrow the recovery timeline
                </h2>
              </div>
              <div className="rounded-2xl bg-slate-950 p-3 text-white">
                <Filter size={18} />
              </div>
            </div>

            <div className="mt-6 grid gap-4">
              <select
                value={filterTerm}
                onChange={(e) => setFilterTerm(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-slate-400 focus:bg-white"
              >
                <option value="">All Terms</option>
                <option value="Term 1">Term 1</option>
                <option value="Term 2">Term 2</option>
                <option value="Term 3">Term 3</option>
              </select>
              <input
                type="text"
                value={filterYear}
                onChange={(e) => setFilterYear(e.target.value)}
                placeholder="Academic year"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-slate-400 focus:bg-white"
              />
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-slate-400 focus:bg-white"
              />
            </div>
          </div>
        </section>

        {renderSection(
          "Available Backups",
          "Whole-system snapshots ready for restore or export.",
          filteredBackups,
          <Shield size={22} />,
        )}
        {renderSection(
          "Recovery Points",
          "Focused restore checkpoints created before high-impact changes.",
          filteredRecovery,
          <History size={22} />,
        )}
        {renderSection(
          "Recycle Bin",
          "Deleted records that can still be restored without a full rollback.",
          filteredRecycle,
          <Archive size={22} />,
        )}

        {isTrialPlan ? (
          <p className="text-center text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
            Recovery center actions are disabled during the trial period.
          </p>
        ) : null}
      </div>

      {selectedEntry ? (
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="mx-auto max-w-6xl overflow-hidden rounded-[32px] border border-white/15 bg-white shadow-[0_50px_160px_-80px_rgba(15,23,42,0.92)]">
            <div className="max-h-[calc(100vh-2rem)] overflow-y-auto">
            <div className="border-b border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.16),_transparent_28%),linear-gradient(135deg,_#ffffff_0%,_#f8fafc_48%,_#eef2ff_100%)] p-6 lg:p-8">
              <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${getEntryStyle(selectedEntry).badge}`}
                    >
                      {getEntryTypeLabel(selectedEntry)}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
                      {selectedEntry.schoolName || school?.name || "School"}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-3xl font-bold text-slate-950">
                      {getEntryTitle(selectedEntry)}
                    </h3>
                    <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
                      {getEntryDescription(selectedEntry)}
                    </p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-4">
                    {[
                      {
                        label: "Created",
                        value: formatTimestamp(selectedEntry.timestamp),
                      },
                      {
                        label: "Records",
                        value: getRecordCount(selectedEntry),
                      },
                      {
                        label: "Collections",
                        value: getCollectionCount(selectedEntry),
                      },
                      {
                        label: "Academic Year",
                        value: selectedEntry.academicYear || "-",
                      },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="rounded-[24px] border border-slate-200 bg-white/80 p-4"
                      >
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                          {item.label}
                        </p>
                        <p className="mt-2 font-semibold text-slate-900">
                          {item.value}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 xl:justify-end">
                  {isFullBackup(selectedEntry) ? (
                    <button
                      onClick={() => handleDownload(selectedEntry.id)}
                      disabled={isTrialPlan}
                      className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-60"
                    >
                      <Download size={16} className="mr-2" /> Download JSON
                    </button>
                  ) : null}
                  <button
                    onClick={() =>
                      isFullBackup(selectedEntry)
                        ? setEntryToRestoreBackup(selectedEntry)
                        : setEntryToRestoreRecovery(selectedEntry)
                    }
                    disabled={isTrialPlan || busyAction !== null}
                    className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 transition hover:bg-amber-100 disabled:opacity-60"
                  >
                    <RefreshCcw size={16} className="mr-2" /> Restore
                  </button>
                  <button
                    onClick={() => setSelectedEntry(null)}
                    className="inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    <X size={16} className="mr-2" /> Close
                  </button>
                </div>
              </div>
            </div>

            <div className="grid gap-6 p-4 sm:p-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] xl:p-8">
              <section className="space-y-6">
                <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                        Snapshot Coverage
                      </p>
                      <h4 className="mt-2 text-xl font-bold text-slate-950">
                        Everything inside this backup
                      </h4>
                    </div>
                    <div className="rounded-2xl bg-slate-950 p-3 text-white">
                      <Database size={18} />
                    </div>
                  </div>
                  <div className="mt-5 grid gap-3 md:grid-cols-2">
                    {selectedMetrics.length ? (
                      selectedMetrics.map((metric) => (
                        <div
                          key={metric.key}
                          className="rounded-[24px] border border-slate-200 bg-slate-50 p-4"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-slate-900">
                              {metric.label}
                            </p>
                            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                              {metric.count}
                            </span>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-slate-500">
                            {metric.description}
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                        No snapshot payload is available for this record.
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                  {selectedEntry.data?.students?.length ? (
                    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="rounded-2xl bg-cyan-100 p-3 text-cyan-700">
                            <Users size={18} />
                          </div>
                          <h4 className="text-lg font-bold text-slate-950">
                            Students
                          </h4>
                        </div>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                          {selectedEntry.data.students.length}
                        </span>
                      </div>
                      <div className="mt-4 max-h-64 space-y-2 overflow-y-auto pr-1">
                        {selectedEntry.data.students.map((student) => (
                          <div
                            key={student.id}
                            className="rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-2.5"
                          >
                            <p className="font-semibold text-slate-900">
                              {student.name}
                            </p>
                            <p className="mt-1 text-sm text-slate-500">
                              {student.classId}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {selectedEntry.data?.users?.length ? (
                    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="rounded-2xl bg-indigo-100 p-3 text-indigo-700">
                            <Users size={18} />
                          </div>
                          <h4 className="text-lg font-bold text-slate-950">
                            Users
                          </h4>
                        </div>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                          {selectedEntry.data.users.length}
                        </span>
                      </div>
                      <div className="mt-4 max-h-64 space-y-2 overflow-y-auto pr-1">
                        {selectedEntry.data.users.map((user) => (
                          <div
                            key={user.id}
                            className="rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-2.5"
                          >
                            <p className="font-semibold text-slate-900">
                              {user.fullName || user.email || user.id}
                            </p>
                            <p className="mt-1 break-words text-sm text-slate-500">
                              {user.email || user.role}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {selectedEntry.data?.fees?.length ? (
                    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="rounded-2xl bg-amber-100 p-3 text-amber-700">
                            <Wallet size={18} />
                          </div>
                          <h4 className="text-lg font-bold text-slate-950">
                            Fees
                          </h4>
                        </div>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                          {selectedEntry.data.fees.length}
                        </span>
                      </div>
                      <div className="mt-4 max-h-64 space-y-2 overflow-y-auto pr-1">
                        {selectedEntry.data.fees.map((fee) => (
                          <div
                            key={fee.id}
                            className="rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-2.5"
                          >
                            <p className="font-semibold text-slate-900">
                              {fee.feeName}
                            </p>
                            <p className="mt-1 text-sm text-slate-500">
                              {formatAmount(
                                resolvePaymentAmount({ amount: fee.amount }),
                              )}{" "}
                              - {fee.term} {fee.academicYear}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {selectedEntry.data?.payments?.length ? (
                    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700">
                            <Wallet size={18} />
                          </div>
                          <h4 className="text-lg font-bold text-slate-950">
                            Student Payments
                          </h4>
                        </div>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                          {selectedEntry.data.payments.length}
                        </span>
                      </div>
                      <div className="mt-4 max-h-64 space-y-2 overflow-y-auto pr-1">
                        {selectedEntry.data.payments.map((payment) => (
                          <div
                            key={payment.id}
                            className="rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-2.5"
                          >
                            <p className="break-words font-semibold text-slate-900">
                              {payment.feeName || payment.studentId || payment.id}
                            </p>
                            <p className="mt-1 text-sm text-slate-500">
                              {formatAmount(
                                resolvePaymentAmount({
                                  amountPaid: payment.amountPaid,
                                }),
                              )}{" "}
                              - {payment.term} {payment.academicYear}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {selectedEntry.data?.billingPayments?.length ? (
                    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="rounded-2xl bg-sky-100 p-3 text-sky-700">
                            <Database size={18} />
                          </div>
                          <h4 className="text-lg font-bold text-slate-950">
                            Billing History
                          </h4>
                        </div>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                          {selectedEntry.data.billingPayments.length}
                        </span>
                      </div>
                      <div className="mt-4 max-h-64 space-y-2 overflow-y-auto pr-1">
                        {selectedEntry.data.billingPayments.map(
                          (payment: any, index: number) => (
                            <div
                              key={
                                payment.id ||
                                payment.reference ||
                                `billing_${index}`
                              }
                              className="rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-2.5"
                            >
                              <p className="break-words font-semibold text-slate-900">
                                {payment.reference ||
                                  payment.transactionId ||
                                  payment.id ||
                                  "Billing payment"}
                              </p>
                              <p className="mt-1 text-sm text-slate-500">
                                {formatAmount(resolvePaymentAmount(payment))} -{" "}
                                {payment.status || "Unknown"}
                              </p>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  ) : null}

                  {selectedEntry.data?.notices?.length ? (
                    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700">
                            <Bell size={18} />
                          </div>
                          <h4 className="text-lg font-bold text-slate-950">
                            Notices
                          </h4>
                        </div>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                          {selectedEntry.data.notices.length}
                        </span>
                      </div>
                      <div className="mt-4 max-h-64 space-y-2 overflow-y-auto pr-1">
                        {selectedEntry.data.notices.map((notice) => (
                          <div
                            key={notice.id}
                            className="rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-2.5"
                          >
                            <p className="break-words font-semibold text-slate-900">
                              {normalizeMessage(notice.message)}
                            </p>
                            <p className="mt-1 text-sm text-slate-500">
                              {notice.date}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {selectedEntry.data?.activityLogs?.length ? (
                    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="rounded-2xl bg-violet-100 p-3 text-violet-700">
                            <History size={18} />
                          </div>
                          <h4 className="text-lg font-bold text-slate-950">
                            Activity
                          </h4>
                        </div>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                          {selectedEntry.data.activityLogs.length}
                        </span>
                      </div>
                      <div className="mt-4 max-h-64 space-y-2 overflow-y-auto pr-1">
                        {selectedEntry.data.activityLogs.map(
                          (entry: any, index: number) => (
                            <div
                              key={entry.id || `activity_${index}`}
                              className="rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-2.5"
                            >
                              <p className="break-words font-semibold text-slate-900">
                                {entry.actionType ||
                                  entry.eventType ||
                                  "Activity event"}
                              </p>
                              <p className="mt-1 text-sm text-slate-500">
                                {formatTimestamp(
                                  typeof entry.timestamp === "number"
                                    ? entry.timestamp
                                    : entry.timestamp?.seconds
                                      ? entry.timestamp.seconds * 1000
                                      : undefined,
                                )}
                              </p>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              </section>

              <aside className="space-y-6">
                <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl bg-slate-950 p-3 text-white">
                      <Building2 size={18} />
                    </div>
                    <h4 className="text-lg font-bold text-slate-950">
                      Snapshot Profile
                    </h4>
                  </div>
                  <div className="mt-5 space-y-3">
                    {[
                      {
                        label: "School",
                        value:
                          selectedEntry.data?.schoolProfile?.name ||
                          selectedSettings?.schoolName ||
                          school?.name ||
                          "School",
                      },
                      {
                        label: "Contact",
                        value:
                          selectedEntry.data?.schoolProfile?.phone ||
                          selectedSettings?.phone ||
                          "No phone saved",
                      },
                      {
                        label: "Address",
                        value:
                          selectedEntry.data?.schoolProfile?.address ||
                          selectedSettings?.address ||
                          "No address saved",
                      },
                      {
                        label: "Academic Cycle",
                        value: `${selectedEntry.term || "-"} - ${selectedEntry.academicYear || "-"}`,
                      },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="rounded-[22px] border border-slate-200 bg-slate-50 p-4"
                      >
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                          {item.label}
                        </p>
                        <p className="mt-2 text-sm font-semibold leading-6 text-slate-900">
                          {item.value}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl bg-cyan-100 p-3 text-cyan-700">
                      <Settings2 size={18} />
                    </div>
                    <h4 className="text-lg font-bold text-slate-950">
                      Settings Summary
                    </h4>
                  </div>
                  <div className="mt-5 space-y-3">
                    <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="inline-flex items-center text-sm text-slate-600">
                          <CalendarRange size={15} className="mr-2" />
                          Reopen Date
                        </span>
                        <span className="text-sm font-semibold text-slate-900">
                          {selectedSettings?.schoolReopenDate || "-"}
                        </span>
                      </div>
                    </div>
                    <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="inline-flex items-center text-sm text-slate-600">
                          <Wallet size={15} className="mr-2" />
                          Finance Version
                        </span>
                        <span className="text-sm font-semibold text-slate-900">
                          {selectedEntry.data?.financeSettings?.financeVersion ||
                            "Not saved"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-[28px] border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl bg-white/10 p-3 text-white">
                      <Shield size={18} />
                    </div>
                    <h4 className="text-lg font-bold">Restore Guardrail</h4>
                  </div>
                  <p className="mt-5 text-sm leading-7 text-slate-300">
                    A safety backup is created automatically before any full
                    restore starts. Review the collection counts before applying
                    an older snapshot.
                  </p>
                </div>
              </aside>
            </div>
          </div>
        </div>
      </div>
      ) : null}

      {entryToDelete ? (
        <ConfirmModal
          title="Delete recovery record"
          description={
            <p>
              Delete <strong>{getEntryTitle(entryToDelete)}</strong> from the
              recovery center? This only removes the stored snapshot.
            </p>
          }
          confirmLabel="Delete"
          busy={busyAction === "delete"}
          confirmClassName="bg-rose-600 hover:bg-rose-700"
          onCancel={() => setEntryToDelete(null)}
          onConfirm={confirmDelete}
        />
      ) : null}

      {entryToRestoreBackup ? (
        <ConfirmModal
          title="Restore full backup"
          description={
            <>
              <p>
                Restore <strong>{getEntryTitle(entryToRestoreBackup)}</strong>{" "}
                into the current workspace.
              </p>
              <p>
                This replaces the current school data with the backup snapshot.
                A safety backup is created automatically first.
              </p>
            </>
          }
          confirmLabel="Restore Backup"
          busy={busyAction === "restore-backup"}
          confirmClassName="bg-amber-600 hover:bg-amber-700"
          onCancel={() => setEntryToRestoreBackup(null)}
          onConfirm={confirmRestoreBackup}
        />
      ) : null}

      {entryToRestoreRecovery ? (
        <ConfirmModal
          title="Restore recovery record"
          description={
            <p>
              Restore <strong>{getEntryTitle(entryToRestoreRecovery)}</strong>?
              Only the collections captured in this record will be restored.
            </p>
          }
          confirmLabel="Restore"
          busy={busyAction === "restore-recovery"}
          confirmClassName="bg-emerald-600 hover:bg-emerald-700"
          onCancel={() => setEntryToRestoreRecovery(null)}
          onConfirm={confirmRestoreRecovery}
        />
      ) : null}
    </Layout>
  );
};

export default ManageBackups;
