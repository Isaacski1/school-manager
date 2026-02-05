import React, { useState, useEffect } from "react";
import Layout from "../../components/Layout";
import { useAuth } from "../../context/AuthContext";
import { db } from "../../services/mockDb";
import { Student } from "../../types";
import { CLASSES_LIST } from "../../constants";
import {
  Save,
  Calendar,
  AlertTriangle,
  Users,
  CheckCircle,
  XCircle,
} from "lucide-react";

const Attendance = () => {
  const { user } = useAuth();
  const assignedClassIds = user?.assignedClassIds || [];
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const schoolId = user?.schoolId || null;

  const [students, setStudents] = useState<Student[]>([]);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [presentIds, setPresentIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [schoolConfig, setSchoolConfig] = useState<any>(null);

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

    // If nextTermBegins is set and we're at or past that date, allow attendance (new term started)
    if (nextTermBegins && date >= nextTermBegins) {
      return false;
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
        if (existing) {
          setPresentIds(new Set(existing.presentStudentIds));
        } else {
          // Default to empty - teacher must manually mark attendance
          setPresentIds(new Set());
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [selectedClassId, date, schoolId]);

  const togglePresence = (id: string) => {
    const newSet = new Set(presentIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setPresentIds(newSet);
  };

  const handleSave = async () => {
    if (!selectedClassId || !schoolId) return;

    // Check if date is valid for attendance
    // After term reset, check if we're past nextTermBegins
    const vacationDate = schoolConfig?.vacationDate;
    const nextTermBegins = schoolConfig?.nextTermBegins;
    const schoolReopenDate = schoolConfig?.schoolReopenDate;

    // If nextTermBegins is set and we're at or past that date, allow attendance
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

    setLoading(true);
    try {
      await db.saveAttendance({
        id: `${schoolId}_${selectedClassId}_${date}`,
        schoolId,
        classId: selectedClassId,
        date,
        presentStudentIds: Array.from(presentIds),
      });

      // Notification logic
      const className =
        CLASSES_LIST.find((c) => c.id === selectedClassId)?.name ||
        selectedClassId;
      await db.addSystemNotification(
        `${user?.fullName} marked attendance for ${className} on ${date}. (${presentIds.size} Present)`,
        "attendance",
        schoolId,
      );

      setMessage("Attendance saved successfully!");
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
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
  const absentCount = students.length - presentIds.size;

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
              <button
                onClick={handleSave}
                disabled={loading || !selectedClassId || isDateBlocked()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:scale-[1.01] hover:bg-emerald-700 disabled:opacity-50 sm:w-auto"
              >
                <Save size={18} />
                {loading ? "Saving..." : "Save Register"}
              </button>
            </div>
          </div>
        </div>

        {message && (
          <div
            className={`rounded-2xl p-3 text-center text-sm shadow-sm ${message.includes("Cannot") ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}
          >
            {message}
          </div>
        )}

        {isDateBlocked() && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-amber-900 shadow-sm">
            <div className="flex items-center gap-2 text-amber-700">
              <AlertTriangle size={18} />
              <span className="font-medium">
                {schoolConfig?.nextTermBegins &&
                date >= schoolConfig.nextTermBegins
                  ? "Attendance not available for selected date"
                  : schoolConfig?.vacationDate &&
                      date > schoolConfig.vacationDate
                    ? `Cannot mark attendance after vacation date (${schoolConfig.vacationDate})`
                    : !schoolConfig?.vacationDate &&
                        schoolConfig?.schoolReopenDate &&
                        date < schoolConfig.schoolReopenDate
                      ? `Cannot mark attendance before school re-open date (${schoolConfig.schoolReopenDate})`
                      : "Attendance not available for selected date"}
              </span>
            </div>
          </div>
        )}

        {/* List */}
        <div className="rounded-2xl border bg-white/80 p-2 shadow-sm">
          {students.map((student) => {
            const isPresent = presentIds.has(student.id);
            const isBlocked = isDateBlocked();
            return (
              <div
                key={student.id}
                className={`group flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition duration-300 hover:-translate-y-0.5 hover:shadow-md ${
                  isBlocked ? "opacity-60" : "cursor-pointer"
                }`}
                onClick={() => !isBlocked && togglePresence(student.id)}
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold ${
                      isPresent
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-rose-100 text-rose-700"
                    }`}
                  >
                    {student.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">
                      {student.name}
                    </p>
                    <p className="text-xs text-slate-500">{student.gender}</p>
                  </div>
                </div>

                <div
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${
                    isPresent
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-rose-200 bg-rose-50 text-rose-700"
                  }`}
                >
                  {isPresent ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  {isPresent ? "PRESENT" : "ABSENT"}
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
    </Layout>
  );
};

export default Attendance;
