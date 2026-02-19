import React, { useState, useEffect, useMemo } from "react";
import Layout from "../../components/Layout";
import { useAuth } from "../../context/AuthContext";
import { db } from "../../services/mockDb";
import { TeacherAttendanceRecord } from "../../types";
import {
  Calendar,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
} from "lucide-react";

/* =======================
   ✅ FIX: MOVE THIS TO TOP
======================= */
const parseLocalDate = (dateString: string): Date => {
  const parts = dateString.split("-");
  if (parts.length === 3) {
    const date = new Date(
      parseInt(parts[0]),
      parseInt(parts[1]) - 1,
      parseInt(parts[2]),
    );
    if (!isNaN(date.getTime())) return date;
  }

  const fallback = new Date(dateString);
  if (!isNaN(fallback.getTime())) return fallback;

  console.error("Invalid date string:", dateString);
  return new Date();
};
/* ======================= */

const TeacherAttendance = () => {
  const { user } = useAuth();
  const schoolId = user?.schoolId || null;

  const [attendanceRecords, setAttendanceRecords] = useState<
    Record<string, TeacherAttendanceRecord>
  >({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [schoolConfig, setSchoolConfig] = useState<any>(null);
  const [missedAttendanceAlert, setMissedAttendanceAlert] = useState<
    string | null
  >(null);
  const [holidayDrafts, setHolidayDrafts] = useState<Record<string, string>>(
    {},
  );
  const [holidayOpen, setHolidayOpen] = useState<Record<string, boolean>>({});
  const [actionMessage, setActionMessage] = useState<string>("");

  /* =======================
     Dates
  ======================= */
  const toYYYYMMDD = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const getLocalTodayDate = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  };

  const todayDate = useMemo(() => getLocalTodayDate(), []);
  const todayString = useMemo(() => toYYYYMMDD(todayDate), [todayDate]);

  const getSchoolDatesBetween = (startDate: Date, endDate: Date) => {
    const dates: string[] = [];
    const current = new Date(startDate);
    current.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);

    while (current <= end) {
      if (current.getDay() !== 0 && current.getDay() !== 6) {
        dates.push(toYYYYMMDD(current));
      }
      current.setDate(current.getDate() + 1);
    }
    return dates;
  };

  const weekDates = useMemo(() => {
    const reopenObj = schoolConfig?.schoolReopenDate
      ? parseLocalDate(schoolConfig.schoolReopenDate)
      : null;
    const vacationObj = schoolConfig?.vacationDate
      ? parseLocalDate(schoolConfig.vacationDate)
      : null;

    const startDate = reopenObj || new Date(todayDate);
    const endDate = new Date(todayDate);
    const generatedDates = getSchoolDatesBetween(startDate, endDate);

    return generatedDates
      .filter((dateString) => {
        const currentDate = parseLocalDate(dateString);
        const nextTermObj = schoolConfig?.nextTermBegins
          ? parseLocalDate(schoolConfig.nextTermBegins)
          : null;

        // If nextTermBegins is set and currentDate >= nextTermBegins, include for new term
        if (nextTermObj && currentDate >= nextTermObj) return true;

        const isAfterReopen = !reopenObj || currentDate >= reopenObj;
        const isBeforeVacation = !vacationObj || currentDate <= vacationObj;
        return isAfterReopen && isBeforeVacation;
      })
      .sort(); // Sort dates chronologically
  }, [todayDate, schoolConfig]);

  const getPreviousSchoolDay = (date: Date) => {
    const d = new Date(date);
    d.setDate(d.getDate() - 1);
    while (d.getDay() === 0 || d.getDay() === 6) {
      d.setDate(d.getDate() - 1);
    }
    return toYYYYMMDD(d);
  };

  const previousSchoolDay = useMemo(
    () => getPreviousSchoolDay(todayDate),
    [todayDate],
  );

  const hasNextTermBegunWithoutReopen = useMemo(() => {
    if (!schoolConfig?.nextTermBegins) return false;
    if (schoolConfig?.schoolReopenDate) return false;
    const nextTermDateObj = parseLocalDate(schoolConfig.nextTermBegins);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today >= nextTermDateObj;
  }, [schoolConfig?.nextTermBegins, schoolConfig?.schoolReopenDate]);

  const isValidAttendanceDate = (
    dateString: string,
    reopen?: string,
    vacation?: string,
    nextTerm?: string,
    holidayDates?: { date: string }[],
  ) => {
    const checkDate = parseLocalDate(dateString);
    const reopenDateObj = reopen ? parseLocalDate(reopen) : null;
    const vacationDateObj = vacation ? parseLocalDate(vacation) : null;
    const nextTermDateObj = nextTerm ? parseLocalDate(nextTerm) : null;
    const isHoliday = (holidayDates || []).some((h) => h.date === dateString);

    // If next term has begun but reopen date is missing, block attendance
    if (nextTermDateObj && checkDate >= nextTermDateObj) {
      return !hasNextTermBegunWithoutReopen;
    }

    if (isHoliday) return false;

    if (reopenDateObj && checkDate < reopenDateObj) return false;
    if (vacationDateObj && checkDate > vacationDateObj) return false;

    return true;
  };

  /* =======================
     Effects
  ======================= */
  useEffect(() => {
    const fetchConfig = async () => {
      if (!schoolId) {
        setSchoolConfig(null);
        return;
      }
      const config = await db.getSchoolConfig(schoolId);
      setSchoolConfig(config);
    };
    fetchConfig();
  }, [schoolId]);

  useEffect(() => {
    if (!user?.id || !schoolId || weekDates.length === 0) {
      setLoading(false);
      return;
    }

    const fetchAttendance = async () => {
      setLoading(true);
      const records: Record<string, TeacherAttendanceRecord> = {};

      for (const date of weekDates) {
        if (
          isValidAttendanceDate(
            date,
            schoolConfig?.schoolReopenDate,
            schoolConfig?.vacationDate,
            schoolConfig?.nextTermBegins,
            schoolConfig?.holidayDates,
          )
        ) {
          const record = await db.getTeacherAttendance(schoolId, user.id, date);
          if (record) records[date] = record;
        }
      }

      setAttendanceRecords(records);
      setLoading(false);
    };

    fetchAttendance();
  }, [user?.id, weekDates, schoolConfig?.schoolReopenDate, schoolId]);

  useEffect(() => {
    if (!user?.id || !schoolId || !schoolConfig) return;

    const checkMissed = async () => {
      const reopen = schoolConfig.schoolReopenDate;
      const vacation = schoolConfig.vacationDate;

      if (
        !isValidAttendanceDate(
          previousSchoolDay,
          reopen,
          vacation,
          schoolConfig.nextTermBegins,
          schoolConfig.holidayDates,
        )
      ) {
        return;
      }

      const record = await db.getTeacherAttendance(
        schoolId,
        user.id,
        previousSchoolDay,
      );
      if (!record) setMissedAttendanceAlert(previousSchoolDay);
    };

    checkMissed();
  }, [user?.id, schoolConfig, previousSchoolDay, isValidAttendanceDate]);

  /* =======================
     Actions
  ======================= */
  const handleMarkAttendance = async (
    date: string,
    status: "present" | "absent",
  ) => {
    if (!user?.id || !schoolId) return;
    if (hasNextTermBegunWithoutReopen) {
      setActionMessage(
        "Attendance is locked until the admin sets a school re-open date.",
      );
      setTimeout(() => setActionMessage(""), 4000);
      return;
    }

    setSaving((s) => ({ ...s, [date]: true }));

    const record: TeacherAttendanceRecord = {
      id: `${schoolId}_${user.id}_${date}`,
      date,
      teacherId: user.id,
      schoolId: schoolId || schoolConfig?.schoolId || "",
      status,
      approvalStatus: "pending",
      isHoliday: false,
      holidayReason: "",
    };

    await db.saveTeacherAttendance(record);
    setAttendanceRecords((prev) => ({ ...prev, [date]: record }));
    setMissedAttendanceAlert(null);

    await db.addSystemNotification(
      `${user?.fullName || "Teacher"} submitted ${status} attendance for ${date} (pending approval)`,
      "attendance",
      schoolId,
    );

    setSaving((s) => ({ ...s, [date]: false }));
  };

  const handleMarkHoliday = async (date: string) => {
    if (!user?.id || !schoolId) return;
    if (hasNextTermBegunWithoutReopen) {
      setActionMessage(
        "Attendance is locked until the admin sets a school re-open date.",
      );
      setTimeout(() => setActionMessage(""), 4000);
      return;
    }

    setSaving((s) => ({ ...s, [date]: true }));

    try {
      const existing = await db.getAllTeacherAttendance(schoolId, date);
      const hasNonHoliday = existing.some((r) => !r.isHoliday);
      if (hasNonHoliday) {
        setActionMessage(
          "This date already has attendance records. Clear them before marking a holiday.",
        );
        setTimeout(() => setActionMessage(""), 4000);
        return;
      }

      const record: TeacherAttendanceRecord = {
        id: `${schoolId}_${user.id}_${date}`,
        date,
        teacherId: user.id,
        schoolId: schoolId || schoolConfig?.schoolId || "",
        status: "absent",
        approvalStatus: "pending",
        isHoliday: true,
        holidayReason: holidayDrafts[date]?.trim() || "",
      };

      await db.saveTeacherAttendance(record);
      setAttendanceRecords((prev) => ({ ...prev, [date]: record }));
      setMissedAttendanceAlert(null);

      await db.addSystemNotification(
        `${user?.fullName || "Teacher"} submitted ${date} as Holiday (pending approval).`,
        "attendance",
        schoolId,
      );

      setActionMessage("Holiday saved successfully!");
      setTimeout(() => setActionMessage(""), 3000);
      setHolidayOpen((prev) => ({ ...prev, [date]: false }));
    } finally {
      setSaving((s) => ({ ...s, [date]: false }));
    }
  };

  const isSchoolOpen = () => {
    if (hasNextTermBegunWithoutReopen) return false;
    if (!schoolConfig?.schoolReopenDate) return true;
    return todayDate >= parseLocalDate(schoolConfig.schoolReopenDate);
  };

  const isSchoolInSession = (dateString: string) => {
    const checkDate = parseLocalDate(dateString);
    const reopenDateObj = schoolConfig?.schoolReopenDate
      ? parseLocalDate(schoolConfig.schoolReopenDate)
      : null;
    const vacationDateObj = schoolConfig?.vacationDate
      ? parseLocalDate(schoolConfig.vacationDate)
      : null;
    const nextTermDateObj = schoolConfig?.nextTermBegins
      ? parseLocalDate(schoolConfig.nextTermBegins)
      : null;

    // If next term has begun but reopen date is missing, block session
    if (nextTermDateObj && checkDate >= nextTermDateObj) {
      return !hasNextTermBegunWithoutReopen;
    }

    if (reopenDateObj && checkDate < reopenDateObj) return false;
    if (vacationDateObj && checkDate > vacationDateObj) return false;

    return true;
  };

  const formatDate = (dateString: string) => {
    const parsed = parseLocalDate(dateString);
    return parsed.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  /* =======================
     UI
  ======================= */
  return (
    <Layout title="Daily Attendance">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-indigo-50 via-white to-emerald-50 p-6 shadow-sm">
          <div className="absolute -top-16 -right-16 h-40 w-40 rounded-full bg-indigo-200/40 blur-3xl" />
          <div className="absolute -bottom-20 -left-16 h-48 w-48 rounded-full bg-emerald-200/40 blur-3xl" />
          <div className="relative flex flex-col gap-2">
            <h1 className="text-3xl font-bold text-slate-900">
              Daily Attendance
            </h1>
            <p className="text-sm text-slate-600">
              Mark your attendance with confidence — fast, clear, and beautiful.
            </p>
            {schoolConfig?.holidayDates?.some(
              (h: any) => h.date === todayString,
            ) && (
              <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-2 text-xs font-semibold text-amber-900 shadow-sm">
                Admin Holiday:{" "}
                {(() => {
                  const h = schoolConfig.holidayDates.find(
                    (item: any) => item.date === todayString,
                  );
                  return h?.reason || "No reason provided";
                })()}
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 font-medium text-slate-700 shadow-sm">
                <Calendar className="h-4 w-4 text-indigo-500" />
                Today: {formatDate(todayString)}
              </span>
              <span
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1 font-medium shadow-sm ${
                  isSchoolOpen()
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-rose-50 text-rose-700"
                }`}
              >
                <Clock className="h-4 w-4" />
                {isSchoolOpen() ? "School Open" : "School Closed"}
              </span>
            </div>
          </div>
        </div>

        {missedAttendanceAlert && (
          <div className="relative overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/60 p-5 shadow-sm">
            <div className="absolute -right-10 -top-10 h-24 w-24 rounded-full bg-amber-200/60 blur-2xl" />
            <div className="relative flex flex-col gap-3">
              <div className="flex items-center gap-2 text-amber-800">
                <AlertTriangle className="h-5 w-5" />
                <span className="font-semibold">Missed Attendance</span>
              </div>
              <p className="text-sm text-amber-900">
                You missed attendance for
                <span className="font-semibold">
                  {" "}
                  {formatDate(missedAttendanceAlert)}
                </span>
                . Please update it now.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() =>
                    handleMarkAttendance(missedAttendanceAlert, "present")
                  }
                  disabled={saving[missedAttendanceAlert]}
                  className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:scale-[1.02] hover:bg-emerald-700 disabled:opacity-50"
                >
                  <CheckCircle className="h-4 w-4" />
                  Mark Present
                </button>
                <button
                  onClick={() =>
                    handleMarkAttendance(missedAttendanceAlert, "absent")
                  }
                  disabled={saving[missedAttendanceAlert]}
                  className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:scale-[1.02] hover:bg-rose-700 disabled:opacity-50"
                >
                  <XCircle className="h-4 w-4" />
                  Mark Absent
                </button>
              </div>
            </div>
          </div>
        )}

        {actionMessage && (
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 text-sm text-emerald-800 shadow-sm">
            {actionMessage}
          </div>
        )}

        {!isSchoolOpen() && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 text-rose-800 shadow-sm">
            <div className="flex items-center gap-2 font-semibold">
              <Clock className="h-5 w-5" />
              School not yet open
            </div>
          </div>
        )}

        {schoolConfig?.vacationDate &&
          todayDate < parseLocalDate(schoolConfig.vacationDate) && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-amber-900 shadow-sm">
              <div className="flex items-center gap-2 font-semibold">
                <Calendar className="h-5 w-5 text-amber-600" />
                School will vacate on: {schoolConfig.vacationDate}
              </div>
            </div>
          )}

        <div className="rounded-2xl border bg-white/80 p-2 shadow-sm">
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Loading attendance...
            </div>
          ) : (
            <div className="grid gap-3 p-2">
              {weekDates.map((date) => {
                const record = attendanceRecords[date];
                const isFuture = date > todayString;
                const isValid = isValidAttendanceDate(
                  date,
                  schoolConfig?.schoolReopenDate,
                  schoolConfig?.vacationDate,
                  schoolConfig?.nextTermBegins,
                  schoolConfig?.holidayDates,
                );
                const configHoliday = (schoolConfig?.holidayDates || []).find(
                  (h: any) => h.date === date,
                );
                const isConfigHoliday = Boolean(configHoliday);
                const isHoliday = !!record?.isHoliday;
                const holidayReason =
                  record?.holidayReason || configHoliday?.reason || "";

                return (
                  <div
                    key={date}
                    className="group flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition duration-300 hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {formatDate(date)}
                        </p>
                        <p className="text-xs text-slate-500">{date}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {isConfigHoliday || isHoliday ? (
                          <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                            <AlertTriangle className="h-4 w-4" />
                            Holiday
                          </span>
                        ) : record ? (
                          <span
                            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                              record.approvalStatus === "rejected"
                                ? "bg-rose-50 text-rose-700"
                                : record.status === "present"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-rose-50 text-rose-700"
                            }`}
                          >
                            {record.approvalStatus === "pending" ? (
                              <Clock className="h-4 w-4" />
                            ) : record.approvalStatus === "rejected" ? (
                              <XCircle className="h-4 w-4" />
                            ) : record.status === "present" ? (
                              <CheckCircle className="h-4 w-4" />
                            ) : (
                              <XCircle className="h-4 w-4" />
                            )}
                            {record.approvalStatus === "pending"
                              ? "PENDING"
                              : record.approvalStatus === "rejected"
                                ? "ABSENT"
                                : record.status.toUpperCase()}
                          </span>
                        ) : !isValid ? (
                          <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                            <AlertTriangle className="h-4 w-4" />
                            {parseLocalDate(date) <
                            parseLocalDate(schoolConfig?.schoolReopenDate || "")
                              ? "Before Reopen"
                              : "After Vacation"}
                          </span>
                        ) : isFuture ? (
                          <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                            <Clock className="h-4 w-4" />
                            Future
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                            <Calendar className="h-4 w-4" />
                            Pending
                          </span>
                        )}
                      </div>
                    </div>

                    {(isConfigHoliday || isHoliday) && holidayReason && (
                      <div className="text-xs font-medium text-amber-700">
                        Reason: {holidayReason}
                      </div>
                    )}
                    {record?.approvalStatus === "rejected" && (
                      <div className="text-xs font-semibold text-rose-600">
                        Attendance is marked as Absent. Please do not cheat when
                        marking attendance.
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-xs text-slate-500">
                        {isConfigHoliday || isHoliday
                          ? "Holiday / No School"
                          : isSchoolInSession(date)
                            ? "School in session"
                            : "Out of session"}
                      </div>

                      {isConfigHoliday || !isValid || isFuture ? null : (
                        <div className="flex flex-1 flex-wrap items-center gap-2">
                          {!record && (
                            <>
                              <button
                                onClick={() =>
                                  handleMarkAttendance(date, "present")
                                }
                                className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700 shadow-sm transition hover:scale-[1.02] hover:bg-emerald-100"
                              >
                                <CheckCircle className="h-4 w-4" />
                                Present
                              </button>
                              <button
                                onClick={() =>
                                  handleMarkAttendance(date, "absent")
                                }
                                className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700 shadow-sm transition hover:scale-[1.02] hover:bg-rose-100"
                              >
                                <XCircle className="h-4 w-4" />
                                Absent
                              </button>
                            </>
                          )}

                          {(!record || record.isHoliday) && (
                            <button
                              onClick={() =>
                                setHolidayOpen((prev) => ({
                                  ...prev,
                                  [date]: !prev[date],
                                }))
                              }
                              className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-700 shadow-sm transition hover:scale-[1.02] hover:bg-amber-100"
                            >
                              <AlertTriangle className="h-4 w-4" />
                              {record?.isHoliday
                                ? "Update Holiday"
                                : "Mark Holiday"}
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {(holidayOpen[date] || isHoliday) &&
                      (!record || record.isHoliday) &&
                      !isFuture &&
                      isValid &&
                      !isConfigHoliday && (
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <input
                            type="text"
                            value={
                              holidayDrafts[date] ?? record?.holidayReason ?? ""
                            }
                            onChange={(e) =>
                              setHolidayDrafts((prev) => ({
                                ...prev,
                                [date]: e.target.value,
                              }))
                            }
                            placeholder="Reason (optional) e.g. Independence Day"
                            className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-sm focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
                          />
                          <button
                            onClick={() => handleMarkHoliday(date)}
                            disabled={saving[date]}
                            className="inline-flex items-center justify-center gap-2 rounded-full bg-amber-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:scale-[1.02] hover:bg-amber-700 disabled:opacity-50"
                          >
                            Save Holiday
                          </button>
                        </div>
                      )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default TeacherAttendance;
