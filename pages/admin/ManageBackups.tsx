import React, { useState, useEffect, useMemo } from "react";
import Layout from "../../components/Layout";
import { db } from "../../services/mockDb";
import { Backup } from "../../types";
import {
  RefreshCcw,
  Eye,
  Download,
  Trash2,
  Filter,
  X,
  Users,
  GraduationCap,
  BookOpen,
  Calendar,
  FileText,
  Clock,
  BarChart2,
  Bell,
  AlertCircle,
} from "lucide-react";
import { showToast } from "../../services/toast";
import { CLASSES_LIST, calculateTotalScore } from "../../constants";
import { useSchool } from "../../context/SchoolContext";

const getClassType = (classId: string): string => {
  if (!classId) return "CLASS";
  const classInfo = CLASSES_LIST.find((c) => c.id === classId);
  if (classInfo && classInfo.level) return classInfo.level;
  if (classId.startsWith("c_n")) return "NURSERY";
  if (classId.startsWith("c_kg")) return "KG";
  if (classId.startsWith("c_p")) return "PRIMARY";
  if (classId.startsWith("c_jhs")) return "JHS";
  return "CLASS";
};

const ManageBackups = () => {
  const { school } = useSchool();
  const schoolId = school?.id || null;
  const isTrialPlan = (school as any)?.plan === "trial";
  const [backups, setBackups] = useState<Partial<Backup>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter states
  const [filterTerm, setFilterTerm] = useState("");
  const [filterAcademicYear, setFilterAcademicYear] = useState("");
  const [filterDate, setFilterDate] = useState("");

  // Modals and selection states
  const [selectedBackup, setSelectedBackup] = useState<Backup | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [backupToDeleteId, setBackupToDeleteId] = useState<string | null>(null);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);

  const studentSnapshots = useMemo(() => {
    if (!selectedBackup?.data?.students) return [];

    const students = selectedBackup.data.students || [];
    const attendanceRecords = selectedBackup.data.attendanceRecords || [];
    const assessments = selectedBackup.data.assessments || [];
    const studentRemarks = selectedBackup.data.studentRemarks || [];

    const recordsByClass = attendanceRecords.reduce(
      (acc: Record<string, typeof attendanceRecords>, record: any) => {
        if (!acc[record.classId]) acc[record.classId] = [];
        acc[record.classId].push(record);
        return acc;
      },
      {},
    );

    const assessmentTotals = assessments.reduce(
      (
        acc: Record<string, { total: number; count: number }>,
        assessment: any,
      ) => {
        const total =
          typeof assessment.total === "number"
            ? assessment.total
            : calculateTotalScore(assessment);
        if (!acc[assessment.studentId]) {
          acc[assessment.studentId] = { total: 0, count: 0 };
        }
        acc[assessment.studentId].total += total;
        acc[assessment.studentId].count += 1;
        return acc;
      },
      {},
    );

    const remarksByStudent = studentRemarks.reduce(
      (acc: Record<string, any>, remark: any) => {
        const existing = acc[remark.studentId];
        if (!existing) {
          acc[remark.studentId] = remark;
          return acc;
        }
        const existingDate = new Date(existing.dateCreated).getTime();
        const nextDate = new Date(remark.dateCreated).getTime();
        if (nextDate >= existingDate) {
          acc[remark.studentId] = remark;
        }
        return acc;
      },
      {},
    );

    return students.map((student: any) => {
      const classRecords = recordsByClass[student.classId] || [];
      const presentDays = classRecords.filter((record: any) =>
        record.presentStudentIds?.includes(student.id),
      ).length;
      const totalDays = classRecords.length;
      const attendanceRate = totalDays
        ? `${Math.round((presentDays / totalDays) * 100)}%`
        : "-";

      const assessmentInfo = assessmentTotals[student.id];
      const avgScore = assessmentInfo?.count
        ? (assessmentInfo.total / assessmentInfo.count).toFixed(1)
        : "-";

      const remark = remarksByStudent[student.id]?.remark || "N/A";

      return {
        student,
        presentDays,
        totalDays,
        attendanceRate,
        avgScore,
        remark,
      };
    });
  }, [selectedBackup]);

  const fetchBackups = async (filters?: {
    term?: string;
    academicYear?: string;
    date?: string;
  }) => {
    setLoading(true);
    setError(null);
    try {
      if (!schoolId) {
        setBackups([]);
        return;
      }
      const actualFilters = {
        schoolId,
        term: filters?.term || undefined,
        academicYear: filters?.academicYear || undefined,
        date: filters?.date || undefined,
      };
      const fetchedBackups = await db.getBackups(actualFilters);
      setBackups(fetchedBackups);
    } catch (err: any) {
      console.error("Error fetching backups:", err);
      setError("Failed to fetch backups.");
      showToast("Failed to fetch backups.", { type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = async (id: string) => {
    try {
      if (!schoolId) return;
      const details = await db.getBackupDetails(schoolId, id);
      if (details) {
        setSelectedBackup(details);
        setShowDetailsModal(true);
      } else {
        showToast("Backup details not found.", { type: "error" });
      }
    } catch (err) {
      console.error("Error fetching backup details:", err);
      showToast("Failed to fetch backup details.", { type: "error" });
    }
  };

  const handleDeleteRequest = (id: string) => {
    setBackupToDeleteId(id);
    setShowDeleteConfirmModal(true);
  };

  const handleDownloadBackup = async (id: string) => {
    try {
      if (!schoolId) return;
      const details = await db.getBackupDetails(schoolId, id);
      if (details && details.data) {
        const filename = `backup_${details.academicYear.replace("-", "")}_${details.term.replace(" ", "")}_${details.timestamp}.json`;
        const jsonStr = JSON.stringify(details.data, null, 2);
        const blob = new Blob([jsonStr], { type: "application/json" });
        const href = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = href;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(href);
        showToast("Backup downloaded successfully!", { type: "success" });
      } else {
        showToast("No data available to download for this backup.", {
          type: "error",
        });
      }
    } catch (err) {
      console.error("Error downloading backup:", err);
      showToast("Failed to download backup.", { type: "error" });
    }
  };

  const confirmDelete = async () => {
    if (!backupToDeleteId) return;
    console.log("Attempting to delete backup:", backupToDeleteId);
    try {
      if (!schoolId) return;
      await db.deleteBackup(schoolId, backupToDeleteId);
      console.log("Backup deleted successfully in DB.");
      showToast("Backup deleted successfully!", { type: "success" });
      setShowDeleteConfirmModal(false);
      setBackupToDeleteId(null);
      setFilterTerm("");
      setFilterAcademicYear("");
      setFilterDate("");
      await fetchBackups();
      console.log("Backup list refreshed after deletion.");
    } catch (err: any) {
      console.error("Error during backup deletion or refresh:", err);
      showToast("Failed to delete backup or refresh list.", { type: "error" });
    }
  };

  useEffect(() => {
    fetchBackups();
  }, [schoolId]);

  if (loading) {
    return (
      <Layout title="Manage Backups">
        <div className="flex justify-center items-center h-48">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-slate-300 border-t-[#0B4A82]"></div>
          <p className="ml-4 text-slate-500">Loading backups...</p>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout title="Manage Backups">
        <div className="text-center p-8 bg-[#E6F0FA] border border-[#E6F0FA] rounded-lg">
          <p className="text-[#0B4A82]">{error}</p>
          <button
            onClick={() => fetchBackups()}
            className="mt-4 px-4 py-2 bg-[#0B4A82] text-white rounded hover:bg-[#0B4A82]"
          >
            <RefreshCcw className="inline-block mr-2" size={16} /> Retry
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Manage Backups">
      <h1 className="text-2xl font-bold text-slate-800 mb-6">
        Manage Term Backups
      </h1>

      {/* Filter and Actions Section */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 mb-6">
        <h2 className="text-xl font-bold text-slate-800 mb-4">
          Backup Filters
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label
              htmlFor="filterTerm"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Term
            </label>
            <select
              id="filterTerm"
              value={filterTerm}
              onChange={(e) => setFilterTerm(e.target.value)}
              className="w-full border border-slate-300 p-2 rounded-lg bg-white text-slate-800 focus:ring-2 focus:ring-[#1160A8] outline-none"
            >
              <option value="">All Terms</option>
              <option value="Term 1">Term 1</option>
              <option value="Term 2">Term 2</option>
              <option value="Term 3">Term 3</option>
            </select>
          </div>
          <div>
            <label
              htmlFor="filterAcademicYear"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Academic Year
            </label>
            <input
              id="filterAcademicYear"
              type="text"
              value={filterAcademicYear}
              onChange={(e) => setFilterAcademicYear(e.target.value)}
              placeholder="e.g., 2023-2024"
              className="w-full border border-slate-300 p-2 rounded-lg bg-white text-slate-800 focus:ring-2 focus:ring-[#1160A8] outline-none"
            />
          </div>
          <div>
            <label
              htmlFor="filterDate"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Date Created (YYYY-MM-DD)
            </label>
            <input
              id="filterDate"
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="w-full border border-slate-300 p-2 rounded-lg bg-white text-slate-800 focus:ring-2 focus:ring-[#1160A8] outline-none"
            />
          </div>
        </div>
        <button
          onClick={() =>
            fetchBackups({
              term: filterTerm,
              academicYear: filterAcademicYear,
              date: filterDate,
            })
          }
          className="px-4 py-2 bg-[#1160A8] text-white rounded-lg hover:bg-[#0B4A82] transition-colors flex items-center"
        >
          <Filter size={16} className="mr-2" /> Apply Filters
        </button>
        <button
          onClick={() => {
            setFilterTerm("");
            setFilterAcademicYear("");
            setFilterDate("");
            fetchBackups();
          }}
          className="ml-2 px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors"
        >
          Clear Filters
        </button>
      </div>

      {/* Backups List */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
        <h2 className="text-xl font-bold text-slate-800 mb-4">
          Available Backups
        </h2>
        {backups.length === 0 ? (
          <div className="text-center p-8 text-slate-500">
            <p>No backups found. Create one from System Settings.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {backups.map((backup, index) => (
              <div
                key={backup.id || `backup-${index}`}
                className="flex items-center justify-between p-4 border border-slate-200 rounded-lg"
              >
                <div>
                  <p className="font-semibold text-slate-800">
                    {backup.term} - {backup.academicYear}
                  </p>
                  <p className="text-sm text-slate-500">
                    Created: {new Date(backup.timestamp).toLocaleString()}
                  </p>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleViewDetails(backup.id || "")}
                    className="px-3 py-1 bg-[#E6F0FA] text-[#0B4A82] rounded-md text-sm hover:bg-[#E6F0FA] flex items-center"
                    title="View Backup Details"
                  >
                    <Eye size={16} className="mr-1" /> View
                  </button>
                  <button
                    onClick={() => handleDownloadBackup(backup.id || "")}
                    disabled={isTrialPlan}
                    className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-md text-sm hover:bg-emerald-200 flex items-center disabled:opacity-60 disabled:cursor-not-allowed"
                    title="Download Backup"
                  >
                    <Download size={16} className="mr-1" /> Download
                  </button>
                  <button
                    onClick={() => handleDeleteRequest(backup.id || "")}
                    disabled={isTrialPlan}
                    className="px-3 py-1 bg-[#E6F0FA] text-[#0B4A82] rounded-md text-sm hover:bg-[#E6F0FA] flex items-center disabled:opacity-60 disabled:cursor-not-allowed"
                    title="Delete Backup"
                  >
                    <Trash2 size={16} className="mr-1" /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {isTrialPlan && (
          <p className="mt-3 text-xs text-slate-500">
            Backups are disabled during the trial period.
          </p>
        )}
      </div>

      {/* View Details Modal */}
      {showDetailsModal && selectedBackup && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-900">
                Backup Details: {selectedBackup.term} -{" "}
                {selectedBackup.academicYear}
              </h3>
              <button
                onClick={() => setShowDetailsModal(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              {/* Backup Metadata */}
              <div className="bg-gradient-to-r from-[#E6F0FA] to-amber-50 rounded-xl p-4 mb-6 border border-[#E6F0FA]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-[#E6F0FA] rounded-full">
                      <Clock className="text-[#0B4A82]" size={24} />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 uppercase font-semibold">
                        Backup Created
                      </p>
                      <p className="text-lg font-bold text-slate-800">
                        {new Date(selectedBackup.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500 uppercase font-semibold">
                      Backup ID
                    </p>
                    <p className="text-sm font-mono text-slate-700">
                      {selectedBackup.id?.slice(0, 8)}...
                    </p>
                  </div>
                </div>
              </div>

              {/* Data Summary Cards */}
              {selectedBackup.data ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-amber-100 rounded-lg">
                          <GraduationCap className="text-amber-600" size={20} />
                        </div>
                        <span className="text-xs text-slate-500 font-semibold uppercase">
                          Students
                        </span>
                      </div>
                      <p className="text-2xl font-bold text-slate-800">
                        {selectedBackup.data.students?.length || 0}
                      </p>
                    </div>

                    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-[#E6F0FA] rounded-lg">
                          <Users className="text-[#0B4A82]" size={20} />
                        </div>
                        <span className="text-xs text-slate-500 font-semibold uppercase">
                          Users
                        </span>
                      </div>
                      <p className="text-2xl font-bold text-slate-800">
                        {selectedBackup.data.users?.length || 0}
                      </p>
                    </div>

                    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-emerald-100 rounded-lg">
                          <BookOpen className="text-emerald-600" size={20} />
                        </div>
                        <span className="text-xs text-slate-500 font-semibold uppercase">
                          Assessments
                        </span>
                      </div>
                      <p className="text-2xl font-bold text-slate-800">
                        {selectedBackup.data.assessments?.length || 0}
                      </p>
                    </div>

                    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-purple-100 rounded-lg">
                          <Calendar className="text-purple-600" size={20} />
                        </div>
                        <span className="text-xs text-slate-500 font-semibold uppercase">
                          Attendance
                        </span>
                      </div>
                      <p className="text-2xl font-bold text-slate-800">
                        {selectedBackup.data.attendanceRecords?.length || 0}
                      </p>
                    </div>

                    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-slate-100 rounded-lg">
                          <FileText className="text-slate-500" size={20} />
                        </div>
                        <span className="text-xs text-slate-500 font-semibold uppercase">
                          Teacher Attendance
                        </span>
                      </div>
                      <p className="text-2xl font-bold text-slate-800">
                        {selectedBackup.data.teacherAttendanceRecords?.length ||
                          0}
                      </p>
                    </div>

                    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-amber-50 rounded-lg">
                          <BarChart2 className="text-amber-600" size={20} />
                        </div>
                        <span className="text-xs text-slate-500 font-semibold uppercase">
                          Remarks
                        </span>
                      </div>
                      <p className="text-2xl font-bold text-slate-800">
                        {selectedBackup.data.studentRemarks?.length || 0}
                      </p>
                    </div>

                    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-indigo-50 rounded-lg">
                          <BookOpen className="text-indigo-600" size={20} />
                        </div>
                        <span className="text-xs text-slate-500 font-semibold uppercase">
                          Timetables
                        </span>
                      </div>
                      <p className="text-2xl font-bold text-slate-800">
                        {selectedBackup.data.timetables?.length || 0}
                      </p>
                    </div>

                    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-emerald-50 rounded-lg">
                          <Bell className="text-emerald-600" size={20} />
                        </div>
                        <span className="text-xs text-slate-500 font-semibold uppercase">
                          Notices
                        </span>
                      </div>
                      <p className="text-2xl font-bold text-slate-800">
                        {selectedBackup.data.notices?.length || 0}
                      </p>
                    </div>

                    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-rose-50 rounded-lg">
                          <AlertCircle className="text-rose-600" size={20} />
                        </div>
                        <span className="text-xs text-slate-500 font-semibold uppercase">
                          Notifications
                        </span>
                      </div>
                      <p className="text-2xl font-bold text-slate-800">
                        {selectedBackup.data.adminNotifications?.length || 0}
                      </p>
                    </div>

                    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-sky-50 rounded-lg">
                          <Clock className="text-sky-600" size={20} />
                        </div>
                        <span className="text-xs text-slate-500 font-semibold uppercase">
                          Activity Logs
                        </span>
                      </div>
                      <p className="text-2xl font-bold text-slate-800">
                        {selectedBackup.data.activityLogs?.length || 0}
                      </p>
                    </div>

                    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-purple-50 rounded-lg">
                          <Calendar className="text-purple-600" size={20} />
                        </div>
                        <span className="text-xs text-slate-500 font-semibold uppercase">
                          Payments
                        </span>
                      </div>
                      <p className="text-2xl font-bold text-slate-800">
                        {selectedBackup.data.payments?.length || 0}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                      <h4 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-3">
                        School Settings Snapshot
                      </h4>
                      <div className="grid grid-cols-2 gap-3 text-sm text-slate-600">
                        <div>
                          <p className="text-xs text-slate-400">
                            Academic Year
                          </p>
                          <p className="font-semibold text-slate-800">
                            {selectedBackup.data.schoolSettings?.academicYear ||
                              selectedBackup.data.schoolConfig?.academicYear ||
                              "-"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">Current Term</p>
                          <p className="font-semibold text-slate-800">
                            {selectedBackup.data.schoolSettings?.currentTerm ||
                              selectedBackup.data.schoolConfig?.currentTerm ||
                              "-"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">Reopen Date</p>
                          <p className="font-semibold text-slate-800">
                            {selectedBackup.data.schoolSettings
                              ?.schoolReopenDate ||
                              selectedBackup.data.schoolConfig
                                ?.schoolReopenDate ||
                              "-"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">
                            Vacation Date
                          </p>
                          <p className="font-semibold text-slate-800">
                            {selectedBackup.data.schoolSettings?.vacationDate ||
                              selectedBackup.data.schoolConfig?.vacationDate ||
                              "-"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">
                            Next Term Begins
                          </p>
                          <p className="font-semibold text-slate-800">
                            {selectedBackup.data.schoolSettings
                              ?.nextTermBegins ||
                              selectedBackup.data.schoolConfig
                                ?.nextTermBegins ||
                              "-"}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                      <h4 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-3">
                        Data Coverage
                      </h4>
                      <div className="space-y-2 text-sm text-slate-600">
                        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                          <span>Class Subjects</span>
                          <span className="font-semibold text-slate-800">
                            {selectedBackup.data.classSubjects?.length || 0}
                          </span>
                        </div>
                        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                          <span>Student Skills</span>
                          <span className="font-semibold text-slate-800">
                            {selectedBackup.data.studentSkills?.length || 0}
                          </span>
                        </div>
                        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                          <span>Admin Remarks</span>
                          <span className="font-semibold text-slate-800">
                            {selectedBackup.data.adminRemarks?.length || 0}
                          </span>
                        </div>
                        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                          <span>Payments</span>
                          <span className="font-semibold text-slate-800">
                            {selectedBackup.data.payments?.length || 0}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Data Preview Section */}
                  <div className="border-t border-slate-100 pt-6">
                    <h4 className="font-bold text-slate-800 mb-4 flex items-center">
                      <Users size={18} className="mr-2 text-[#0B4A82]" />
                      Students List
                    </h4>

                    {/* Students Performance Table */}
                    {studentSnapshots.length > 0 ? (
                      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-600 font-semibold">
                              <tr>
                                <th className="px-4 py-3">Student</th>
                                <th className="px-4 py-3">Class</th>
                                <th className="px-4 py-3 text-center">
                                  Attendance
                                </th>
                                <th className="px-4 py-3 text-center">
                                  Avg Score
                                </th>
                                <th className="px-4 py-3">Remark</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {studentSnapshots.map((row) => (
                                <tr
                                  key={row.student.id}
                                  className="hover:bg-slate-50 transition-colors"
                                >
                                  <td className="px-4 py-3 font-medium text-slate-800">
                                    <div className="flex items-center">
                                      <div
                                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs text-white mr-3 shadow-sm ${row.student.gender === "Male" ? "bg-amber-400" : "bg-[#0B4A82]"}`}
                                      >
                                        {row.student.name.charAt(0)}
                                      </div>
                                      <div>
                                        <p>{row.student.name}</p>
                                        <p className="text-xs text-slate-400">
                                          {row.student.gender}
                                        </p>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 text-xs font-semibold border border-slate-200">
                                      {CLASSES_LIST.find(
                                        (c) => c.id === row.student.classId,
                                      )?.name || row.student.classId}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <div className="text-sm font-semibold text-slate-700">
                                      {row.attendanceRate}
                                    </div>
                                    <div className="text-xs text-slate-400">
                                      {row.presentDays}/{row.totalDays} days
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-center font-semibold text-slate-700">
                                    {row.avgScore}
                                  </td>
                                  <td className="px-4 py-3 text-slate-600">
                                    {row.remark}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 text-xs text-slate-500">
                          Total: {studentSnapshots.length} student
                          {studentSnapshots.length !== 1 ? "s" : ""}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-xl border border-slate-100">
                        <Users
                          size={32}
                          className="mx-auto mb-2 text-slate-300"
                        />
                        <p>No students in this backup.</p>
                      </div>
                    )}

                    {/* Classes & Subjects Overview */}
                    {selectedBackup.data.classSubjects &&
                      selectedBackup.data.classSubjects.length > 0 && (
                        <div className="mt-6">
                          <h5 className="font-bold text-slate-800 mb-3 flex items-center">
                            <GraduationCap
                              size={18}
                              className="mr-2 text-amber-600"
                            />
                            Classes & Subjects
                          </h5>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {selectedBackup.data.classSubjects.map(
                              (cs: any, idx: number) => {
                                const classInfo = CLASSES_LIST.find(
                                  (c) => c.id === cs.classId,
                                );
                                const classType = getClassType(cs.classId);
                                return (
                                  <div
                                    key={idx}
                                    className="bg-gradient-to-br from-amber-50 to-white rounded-xl p-4 border border-amber-200 hover:shadow-lg transition-shadow"
                                  >
                                    <div className="text-center mb-3 pb-3 border-b border-amber-200">
                                      <p className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-1">
                                        {classType}
                                      </p>
                                      <p className="text-2xl font-extrabold text-slate-800">
                                        {classInfo?.name || cs.classId}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                                        Subjects
                                      </p>
                                      <div className="flex flex-wrap gap-1">
                                        {cs.subjects &&
                                        cs.subjects.length > 0 ? (
                                          cs.subjects.map(
                                            (subject: string, sIdx: number) => (
                                              <span
                                                key={sIdx}
                                                className="px-2 py-1 bg-white border border-slate-200 text-slate-700 text-xs rounded-md shadow-sm"
                                              >
                                                {subject}
                                              </span>
                                            ),
                                          )
                                        ) : (
                                          <span className="text-xs text-slate-400 italic">
                                            No subjects
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-xs text-slate-500 mt-2 font-medium">
                                        {cs.subjects?.length || 0} subject
                                        {cs.subjects?.length !== 1 ? "s" : ""}
                                      </p>
                                    </div>
                                  </div>
                                );
                              },
                            )}
                          </div>
                        </div>
                      )}
                  </div>
                </>
              ) : (
                <div className="text-center py-12 text-slate-500">
                  <FileText size={48} className="mx-auto mb-4 text-slate-300" />
                  <p>No data available for this backup.</p>
                </div>
              )}
            </div>
            <div className="p-6 border-t border-slate-100 text-right">
              <button
                onClick={() => setShowDetailsModal(false)}
                className="px-4 py-2 bg-[#1160A8] text-white rounded-lg hover:bg-[#0B4A82]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-[#0B4A82]">
                Confirm Deletion
              </h3>
              <button
                onClick={() => setShowDeleteConfirmModal(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <p className="text-slate-700 mb-4">
                Are you sure you want to delete this backup? This action cannot
                be undone.
              </p>
              <p className="text-sm text-slate-500">
                Backup ID: {backupToDeleteId}
              </p>
            </div>
            <div className="p-6 border-t border-slate-100 text-right space-x-2">
              <button
                onClick={() => setShowDeleteConfirmModal(false)}
                className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 bg-[#1160A8] text-white rounded-lg hover:bg-[#0B4A82]"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default ManageBackups;
