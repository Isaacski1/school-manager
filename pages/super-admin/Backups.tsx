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
    <Layout title="Backups Overview">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-indigo-50 via-white to-emerald-50 p-6 shadow-sm">
          <div className="absolute -top-16 -right-16 h-40 w-40 rounded-full bg-indigo-200/40 blur-3xl" />
          <div className="absolute -bottom-20 -left-16 h-48 w-48 rounded-full bg-emerald-200/40 blur-3xl" />
          <div className="relative flex flex-col gap-2">
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
              <span className="h-10 w-10 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                <Shield size={20} />
              </span>
              Global Backups
            </h1>
            <p className="text-sm text-slate-600">
              View, audit, and manage term backups across all schools.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 font-medium text-slate-700 shadow-sm">
                <Building className="h-4 w-4 text-indigo-500" />
                {schoolLabel}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 font-medium text-emerald-700 shadow-sm">
                <FileText className="h-4 w-4" />
                Backups: {backups.length}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <div className="flex items-center gap-2 mb-4 text-slate-700 font-semibold">
            <Filter size={16} /> Filters
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                School
              </label>
              <select
                value={filterSchoolId}
                onChange={(e) => setFilterSchoolId(e.target.value)}
                className="w-full border border-slate-200 p-2.5 rounded-xl bg-white text-slate-800 focus:ring-2 focus:ring-emerald-200 outline-none"
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
                className="w-full border border-slate-200 p-2.5 rounded-xl bg-white text-slate-800 focus:ring-2 focus:ring-emerald-200 outline-none"
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
                placeholder="e.g. 2024-2025"
                className="w-full border border-slate-200 p-2.5 rounded-xl bg-white text-slate-800 focus:ring-2 focus:ring-emerald-200 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Date
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  type="date"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className="w-full border border-slate-200 pl-10 pr-3 py-2.5 rounded-xl bg-white text-slate-800 focus:ring-2 focus:ring-emerald-200 outline-none"
                />
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={fetchBackups}
              className="inline-flex items-center gap-2 rounded-full bg-[#0B4A82] text-white px-4 py-2 text-sm font-semibold hover:bg-[#0B4A82]"
            >
              <RefreshCcw size={16} /> Refresh
            </button>
            <button
              onClick={() => {
                setFilterSchoolId("");
                setFilterTerm("");
                setFilterAcademicYear("");
                setFilterDate("");
              }}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Clear Filters
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-500">
            Loading backups...
          </div>
        ) : error ? (
          <div className="text-center py-12 text-rose-600">{error}</div>
        ) : backups.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            No backups found for the current filters.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {backups.map((backup) => {
              const schoolName = backup.schoolId
                ? schoolMap[backup.schoolId]?.name || backup.schoolId
                : "Unknown School";
              return (
                <div
                  key={backup.id}
                  className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-slate-500">School</p>
                      <p className="text-lg font-semibold text-slate-900">
                        {schoolName}
                      </p>
                      <p className="text-sm text-slate-500">
                        {backup.term} • {backup.academicYear}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        {backup.timestamp
                          ? new Date(backup.timestamp).toLocaleString()
                          : "N/A"}
                      </p>
                    </div>
                    <Link
                      to={
                        backup.schoolId
                          ? `/super-admin/schools/${backup.schoolId}`
                          : "/super-admin/schools"
                      }
                      className="text-xs font-semibold text-[#1160A8] hover:text-[#0B4A82]"
                    >
                      View School
                    </Link>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-3 text-xs text-slate-500">
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p>Students</p>
                      <p className="text-sm font-semibold text-slate-800">
                        {renderCount(backup.data?.students)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p>Assessments</p>
                      <p className="text-sm font-semibold text-slate-800">
                        {renderCount(backup.data?.assessments)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p>Users</p>
                      <p className="text-sm font-semibold text-slate-800">
                        {renderCount(backup.data?.users)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => handleViewDetails(backup.id || "")}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Eye size={14} /> View
                    </button>
                    <button
                      onClick={() => handleDownloadBackup(backup.id || "")}
                      className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                    >
                      <Download size={14} /> Download
                    </button>
                    <button
                      onClick={() => {
                        setBackupToDeleteId(backup.id || null);
                        setShowDeleteConfirmModal(true);
                      }}
                      className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showDetailsModal && selectedBackup && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Backup Details
                </h3>
                <p className="text-sm text-slate-500">
                  {selectedBackup.term} • {selectedBackup.academicYear}
                </p>
              </div>
              <button
                onClick={() => setShowDetailsModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            <div className="p-5 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Students</p>
                  <p className="text-lg font-semibold text-slate-900">
                    {renderCount(selectedBackup.data?.students)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Assessments</p>
                  <p className="text-lg font-semibold text-slate-900">
                    {renderCount(selectedBackup.data?.assessments)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Users</p>
                  <p className="text-lg font-semibold text-slate-900">
                    {renderCount(selectedBackup.data?.users)}
                  </p>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-800 mb-3 flex items-center">
                  <FileText size={18} className="mr-2 text-[#0B4A82]" />
                  Student Performance Snapshot
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
                            <th className="px-4 py-3 text-center">Avg Score</th>
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
                    <FileText
                      size={32}
                      className="mx-auto mb-2 text-slate-300"
                    />
                    <p>No student records in this backup.</p>
                  </div>
                )}
              </div>

              {selectedBackup.data?.classSubjects &&
                selectedBackup.data.classSubjects.length > 0 && (
                  <div>
                    <h4 className="font-bold text-slate-800 mb-3 flex items-center">
                      <GraduationCap
                        size={18}
                        className="mr-2 text-amber-600"
                      />
                      Classes & Subjects
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {selectedBackup.data.classSubjects.map((cs: any, idx) => {
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
                                {cs.subjects && cs.subjects.length > 0 ? (
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
                      })}
                    </div>
                  </div>
                )}

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => handleDownloadBackup(selectedBackup.id)}
                  className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
                >
                  <Download size={16} /> Download JSON
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirmModal && backupToDeleteId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900 mb-2">
              Delete Backup
            </h3>
            <p className="text-sm text-slate-600 mb-4">
              Are you sure you want to delete this backup? This action cannot be
              undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteConfirmModal(false)}
                className="px-4 py-2 rounded-full border border-slate-200 text-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 rounded-full bg-rose-600 text-white"
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
