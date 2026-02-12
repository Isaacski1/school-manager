import React, { useEffect, useMemo, useState } from "react";
import Layout from "../../components/Layout";
import { showToast } from "../../services/toast";
import { firestore } from "../../services/firebase";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { Backup, School } from "../../types";
import {
  RefreshCcw,
  Eye,
  Download,
  Trash2,
  Filter,
  Calendar,
  FileText,
  Shield,
  Building,
  GraduationCap,
  X,
  Users,
  BookOpen,
  Clock,
  BarChart2,
  Bell,
  AlertCircle,
} from "lucide-react";
import { Link } from "react-router-dom";
import { CLASSES_LIST, calculateTotalScore } from "../../constants";

const Backups: React.FC = () => {
  const [schools, setSchools] = useState<School[]>([]);
  const [backups, setBackups] = useState<Partial<Backup>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterSchoolId, setFilterSchoolId] = useState("");
  const [filterTerm, setFilterTerm] = useState("");
  const [filterAcademicYear, setFilterAcademicYear] = useState("");
  const [filterDate, setFilterDate] = useState("");

  const [selectedBackup, setSelectedBackup] = useState<Backup | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [backupToDeleteId, setBackupToDeleteId] = useState<string | null>(null);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);

  const schoolMap = useMemo(() => {
    return schools.reduce<Record<string, School>>((acc, school) => {
      acc[school.id] = school;
      return acc;
    }, {});
  }, [schools]);

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

  const schoolLabel =
    filterSchoolId && schoolMap[filterSchoolId]
      ? schoolMap[filterSchoolId].name
      : "All Schools";

  const loadSchools = async () => {
    const snap = await getDocs(collection(firestore, "schools"));
    const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    setSchools(rows as School[]);
  };

  const fetchBackups = async () => {
    setLoading(true);
    setError(null);
    try {
      const conditions = [] as any[];
      if (filterSchoolId)
        conditions.push(where("schoolId", "==", filterSchoolId));
      if (filterTerm) conditions.push(where("term", "==", filterTerm));
      if (filterAcademicYear)
        conditions.push(where("academicYear", "==", filterAcademicYear));
      if (filterDate) {
        const start = new Date(filterDate).getTime();
        const end = start + 24 * 60 * 60 * 1000 - 1;
        conditions.push(where("timestamp", ">=", start));
        conditions.push(where("timestamp", "<=", end));
      }

      const baseRef = collection(firestore, "backups");
      const q = conditions.length > 0 ? query(baseRef, ...conditions) : baseRef;
      const snap = await getDocs(q);
      const rows = snap.docs.map((d) => d.data() as Partial<Backup>);
      rows.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setBackups(rows);
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
      const snap = await getDoc(doc(firestore, "backups", id));
      if (!snap.exists()) {
        showToast("Backup details not found.", { type: "error" });
        return;
      }
      setSelectedBackup(snap.data() as Backup);
      setShowDetailsModal(true);
    } catch (err) {
      console.error("Error fetching backup details:", err);
      showToast("Failed to fetch backup details.", { type: "error" });
    }
  };

  const handleDownloadBackup = async (id: string) => {
    try {
      const snap = await getDoc(doc(firestore, "backups", id));
      if (!snap.exists()) {
        showToast("No data available to download.", { type: "error" });
        return;
      }
      const details = snap.data() as Backup;
      if (!details.data) {
        showToast("No data available to download.", { type: "error" });
        return;
      }
      const filename = `backup_${details.academicYear.replace(
        "-",
        "",
      )}_${details.term.replace(" ", "")}_${details.timestamp}.json`;
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
    } catch (err) {
      console.error("Error downloading backup:", err);
      showToast("Failed to download backup.", { type: "error" });
    }
  };

  const confirmDelete = async () => {
    if (!backupToDeleteId) return;
    try {
      await deleteDoc(doc(firestore, "backups", backupToDeleteId));
      showToast("Backup deleted successfully!", { type: "success" });
      setShowDeleteConfirmModal(false);
      setBackupToDeleteId(null);
      await fetchBackups();
    } catch (err) {
      console.error("Error deleting backup:", err);
      showToast("Failed to delete backup.", { type: "error" });
    }
  };

  useEffect(() => {
    loadSchools();
  }, []);

  useEffect(() => {
    fetchBackups();
  }, [filterSchoolId, filterTerm, filterAcademicYear, filterDate]);

  const renderCount = (value?: any[]) => (value ? value.length : "-");

  return (
    <Layout title="Manage Backups">
      <h1 className="text-2xl font-bold text-slate-800 mb-6">
        Manage Term Backups
      </h1>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 sm:p-6 mb-6">
        <h2 className="text-xl font-bold text-slate-800 mb-4">
          Backup Filters
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              School
            </label>
            <select
              value={filterSchoolId}
              onChange={(e) => setFilterSchoolId(e.target.value)}
              className="w-full border border-slate-300 p-2 rounded-lg bg-white text-slate-800 focus:ring-2 focus:ring-[#1160A8] outline-none"
            >
              <option value="">All Schools</option>
              {schools.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Term
            </label>
            <select
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
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Academic Year
            </label>
            <input
              type="text"
              value={filterAcademicYear}
              onChange={(e) => setFilterAcademicYear(e.target.value)}
              placeholder="e.g., 2023-2024"
              className="w-full border border-slate-300 p-2 rounded-lg bg-white text-slate-800 focus:ring-2 focus:ring-[#1160A8] outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Date Created (YYYY-MM-DD)
            </label>
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="w-full border border-slate-300 p-2 rounded-lg bg-white text-slate-800 focus:ring-2 focus:ring-[#1160A8] outline-none"
            />
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={fetchBackups}
            className="px-4 py-2 bg-[#1160A8] text-white rounded-lg hover:bg-[#0B4A82] transition-colors flex items-center justify-center"
          >
            <Filter size={16} className="mr-2" /> Apply Filters
          </button>
          <button
            onClick={() => {
              setFilterSchoolId("");
              setFilterTerm("");
              setFilterAcademicYear("");
              setFilterDate("");
            }}
            className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors"
          >
            Clear Filters
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 sm:p-6">
        <h2 className="text-xl font-bold text-slate-800 mb-4">
          Available Backups
        </h2>
        {loading ? (
          <div className="text-center p-8 text-slate-500">
            Loading backups...
          </div>
        ) : error ? (
          <div className="text-center p-8 text-rose-600">{error}</div>
        ) : backups.length === 0 ? (
          <div className="text-center p-8 text-slate-500">
            <p>No backups found for the current filters.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {backups.map((backup, index) => {
              const schoolName = backup.schoolId
                ? schoolMap[backup.schoolId]?.name || backup.schoolId
                : "Unknown School";
              return (
                <div
                  key={backup.id || `backup-${index}`}
                  className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 p-4 border border-slate-200 rounded-xl"
                >
                  <div>
                    <p className="font-semibold text-slate-800">
                      {backup.term} - {backup.academicYear}
                    </p>
                    <p className="text-sm text-slate-500">
                      School: {schoolName}
                    </p>
                    <p className="text-sm text-slate-500">
                      Created:{" "}
                      {new Date(backup.timestamp || 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => handleViewDetails(backup.id || "")}
                      className="px-3 py-1 bg-[#E6F0FA] text-[#0B4A82] rounded-md text-sm hover:bg-[#E6F0FA] flex items-center"
                      title="View Backup Details"
                    >
                      <Eye size={16} className="mr-1" /> View
                    </button>
                    <button
                      onClick={() => handleDownloadBackup(backup.id || "")}
                      className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-md text-sm hover:bg-emerald-200 flex items-center"
                      title="Download Backup"
                    >
                      <Download size={16} className="mr-1" /> Download
                    </button>
                    <button
                      onClick={() => {
                        setBackupToDeleteId(backup.id || null);
                        setShowDeleteConfirmModal(true);
                      }}
                      className="px-3 py-1 bg-[#E6F0FA] text-[#0B4A82] rounded-md text-sm hover:bg-[#E6F0FA] flex items-center"
                      title="Delete Backup"
                    >
                      <Trash2 size={16} className="mr-1" /> Delete
                    </button>
                    <Link
                      to={
                        backup.schoolId
                          ? `/super-admin/schools/${backup.schoolId}`
                          : "/super-admin/schools"
                      }
                      className="px-3 py-1 bg-slate-100 text-slate-600 rounded-md text-sm hover:bg-slate-200 flex items-center"
                    >
                      View School
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

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
                        {new Date(
                          selectedBackup.timestamp || 0,
                        ).toLocaleString()}
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

                  <div className="border-t border-slate-100 pt-6">
                    <h4 className="font-bold text-slate-800 mb-4 flex items-center">
                      <Users size={18} className="mr-2 text-[#0B4A82]" />
                      Students List
                    </h4>

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

      {showDeleteConfirmModal && backupToDeleteId && (
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

export default Backups;
