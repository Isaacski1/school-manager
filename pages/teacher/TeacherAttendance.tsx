import React, { useState, useEffect, useMemo } from 'react';
import Layout from '../../components/Layout';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../services/mockDb';
import { TeacherAttendanceRecord } from '../../types';
import { Calendar, CheckCircle, XCircle, AlertTriangle, Clock } from 'lucide-react';

/* =======================
   ✅ FIX: MOVE THIS TO TOP
======================= */
const parseLocalDate = (dateString: string): Date => {
  const parts = dateString.split('-');
  if (parts.length === 3) {
    const date = new Date(
      parseInt(parts[0]),
      parseInt(parts[1]) - 1,
      parseInt(parts[2])
    );
    if (!isNaN(date.getTime())) return date;
  }

  const fallback = new Date(dateString);
  if (!isNaN(fallback.getTime())) return fallback;

  console.error('Invalid date string:', dateString);
  return new Date();
};
/* ======================= */

const TeacherAttendance = () => {
  const { user } = useAuth();

  const [attendanceRecords, setAttendanceRecords] = useState<Record<string, TeacherAttendanceRecord>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [schoolConfig, setSchoolConfig] = useState<any>(null);
  const [missedAttendanceAlert, setMissedAttendanceAlert] = useState<string | null>(null);

  /* =======================
     Dates
  ======================= */
  const toYYYYMMDD = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const getLocalTodayDate = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  };

  const todayDate = useMemo(() => getLocalTodayDate(), []);
  const todayString = useMemo(
    () => toYYYYMMDD(todayDate),
    [todayDate]
  );

  const getConsecutiveSchoolDates = (startDate: Date, numDays: number) => {
    const dates: string[] = [];
    let current = new Date(startDate);
    current.setHours(0, 0, 0, 0);

    while (dates.length < numDays) {
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

    let startDate = new Date(todayDate);

    if (reopenObj && todayDate < reopenObj) {
      startDate = reopenObj;
    }

    const generatedDates = getConsecutiveSchoolDates(startDate, 10);

    return generatedDates.filter(dateString => {
      const currentDate = parseLocalDate(dateString);
      const nextTermObj = schoolConfig?.nextTermBegins ? parseLocalDate(schoolConfig.nextTermBegins) : null;

      // If nextTermBegins is set and currentDate >= nextTermBegins, include for new term
      if (nextTermObj && currentDate >= nextTermObj) return true;

      const isAfterReopen = !reopenObj || currentDate >= reopenObj;
      const isBeforeVacation = !vacationObj || currentDate <= vacationObj;
      return isAfterReopen && isBeforeVacation;
    }).slice(0, 5);
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
    [todayDate]
  );

  const isValidAttendanceDate = (dateString: string, reopen?: string, vacation?: string, nextTerm?: string) => {
    const checkDate = parseLocalDate(dateString);
    const reopenDateObj = reopen ? parseLocalDate(reopen) : null;
    const vacationDateObj = vacation ? parseLocalDate(vacation) : null;
    const nextTermDateObj = nextTerm ? parseLocalDate(nextTerm) : null;

    // If nextTermBegins is set and checkDate >= nextTermBegins, valid for new term
    if (nextTermDateObj && checkDate >= nextTermDateObj) return true;

    if (reopenDateObj && checkDate < reopenDateObj) return false;
    if (vacationDateObj && checkDate > vacationDateObj) return false;

    return true;
  };

  /* =======================
     Effects
  ======================= */
  useEffect(() => {
    const fetchConfig = async () => {
      const config = await db.getSchoolConfig();
      setSchoolConfig(config);
    };
    fetchConfig();
  }, []);

  useEffect(() => {
    if (!user?.id || weekDates.length === 0) {
      setLoading(false);
      return;
    }

    const fetchAttendance = async () => {
      setLoading(true);
      const records: Record<string, TeacherAttendanceRecord> = {};

      for (const date of weekDates) {
        if (isValidAttendanceDate(date, schoolConfig?.schoolReopenDate, schoolConfig?.vacationDate, schoolConfig?.nextTermBegins)) {
          const record = await db.getTeacherAttendance(user.id, date);
          if (record) records[date] = record;
        }
      }

      setAttendanceRecords(records);
      setLoading(false);
    };

    fetchAttendance();
  }, [user?.id, weekDates, schoolConfig?.schoolReopenDate]);

  useEffect(() => {
    if (!user?.id || !schoolConfig) return;

    const checkMissed = async () => {
      const reopen = schoolConfig.schoolReopenDate;
      const vacation = schoolConfig.vacationDate;
      
      if (!isValidAttendanceDate(previousSchoolDay, reopen, vacation, schoolConfig.nextTermBegins)) {
        return;
      }
      
      const record = await db.getTeacherAttendance(user.id, previousSchoolDay);
      if (!record) setMissedAttendanceAlert(previousSchoolDay);
    };

    checkMissed();
  }, [user?.id, schoolConfig, previousSchoolDay, isValidAttendanceDate]);

  /* =======================
     Actions
  ======================= */
  const handleMarkAttendance = async (date: string, status: 'present' | 'absent') => {
    if (!user?.id) return;

    setSaving(s => ({ ...s, [date]: true }));

    const record: TeacherAttendanceRecord = {
      id: `${user.id}_${date}`,
      date,
      teacherId: user.id,
      status
    };

    await db.saveTeacherAttendance(record);
    setAttendanceRecords(prev => ({ ...prev, [date]: record }));
    setMissedAttendanceAlert(null);

    await db.addSystemNotification(
      `${user.name} marked ${status} for ${date}`,
      'attendance'
    );

    setSaving(s => ({ ...s, [date]: false }));
  };

  const isSchoolOpen = () => {
    if (!schoolConfig?.schoolReopenDate) return true;
    return todayDate >= parseLocalDate(schoolConfig.schoolReopenDate);
  };

  const isSchoolInSession = (dateString: string) => {
    const checkDate = parseLocalDate(dateString);
    const reopenDateObj = schoolConfig?.schoolReopenDate ? parseLocalDate(schoolConfig.schoolReopenDate) : null;
    const vacationDateObj = schoolConfig?.vacationDate ? parseLocalDate(schoolConfig.vacationDate) : null;
    const nextTermDateObj = schoolConfig?.nextTermBegins ? parseLocalDate(schoolConfig.nextTermBegins) : null;

    // If nextTermBegins is set and checkDate >= nextTermBegins, valid for new term
    if (nextTermDateObj && checkDate >= nextTermDateObj) return true;

    if (reopenDateObj && checkDate < reopenDateObj) return false;
    if (vacationDateObj && checkDate > vacationDateObj) return false;

    return true;
  };

  /* =======================
     UI
  ======================= */
  return (
    <Layout title="Daily Attendance">
      <div className="max-w-4xl mx-auto">

        <h1 className="text-3xl font-bold mb-6">Daily Attendance</h1>

        {missedAttendanceAlert && (
          <div className="mb-4 p-4 bg-amber-50 border rounded">
            <AlertTriangle className="inline mr-2 text-amber-600" />
            You missed attendance for {missedAttendanceAlert}
            <div className="mt-3 space-x-2">
              <button
                onClick={() => handleMarkAttendance(missedAttendanceAlert, 'present')}
                disabled={saving[missedAttendanceAlert]}
                className="px-3 py-1 bg-green-600 text-white rounded disabled:opacity-50"
              >
                Mark Present
              </button>
              <button
                onClick={() => handleMarkAttendance(missedAttendanceAlert, 'absent')}
                disabled={saving[missedAttendanceAlert]}
                className="px-3 py-1 bg-red-600 text-white rounded disabled:opacity-50"
              >
                Mark Absent
              </button>
            </div>
          </div>
        )}

        {!isSchoolOpen() && (
          <div className="mb-4 p-4 bg-blue-50 border rounded">
            <Clock className="inline mr-2 text-blue-600" />
            School not yet open
          </div>
        )}

        {schoolConfig?.vacationDate && todayDate < parseLocalDate(schoolConfig.vacationDate) && (
          <div className="mb-4 p-4 bg-amber-50 border rounded">
            <Calendar className="inline mr-2 text-amber-600" />
            School will vacate on: {schoolConfig.vacationDate}
          </div>
        )}

        <div className="bg-white border rounded">
          {loading ? (
            <div className="p-6 text-center">Loading...</div>
          ) : (
            weekDates.map(date => {
              const record = attendanceRecords[date];
              const isFuture = date > todayString;
              // Only show "After Vacation" if school hasn't reopened yet
              const isAfterVacation = schoolConfig?.vacationDate && date > schoolConfig.vacationDate && 
                (!schoolConfig?.nextTermBegins || todayDate < parseLocalDate(schoolConfig.nextTermBegins));

              return (
                <div key={date} className="p-4 border-b flex justify-between items-center">
                  <span>{date}</span>

                  {record ? (
                    <span className={record.status === 'present' ? 'text-green-600' : 'text-red-600'}>
                      {record.status.toUpperCase()}
                    </span>
                  ) : !isValidAttendanceDate(date, schoolConfig?.schoolReopenDate, schoolConfig?.vacationDate, schoolConfig?.nextTermBegins) ? (
                    <span className="text-amber-600">
                      {parseLocalDate(date) < parseLocalDate(schoolConfig?.schoolReopenDate || '') ? 'Before Reopen' : 'After Vacation'}
                    </span>
                  ) : !isFuture ? (
                    <div className="space-x-2">
                      <button
                        onClick={() => handleMarkAttendance(date, 'present')}
                        className="px-3 py-1 bg-green-600 text-white rounded"
                      >
                        Present
                      </button>
                      <button
                        onClick={() => handleMarkAttendance(date, 'absent')}
                        className="px-3 py-1 bg-red-600 text-white rounded"
                      >
                        Absent
                      </button>
                    </div>
                  ) : (
                    <span className="text-gray-400">Future</span>
                  )}
                </div>
              );
            })
          )}
        </div>

      </div>
    </Layout>
  );
};

export default TeacherAttendance;
