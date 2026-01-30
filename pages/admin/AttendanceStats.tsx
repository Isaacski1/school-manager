import React, { useState, useEffect } from "react";
import Layout from "../../components/Layout";
import { db } from "../../services/mockDb";
import { CLASSES_LIST } from "../../constants";
import { AlertTriangle, CheckCircle, HelpCircle } from "lucide-react";
import { useSchool } from "../../context/SchoolContext";

interface StudentAttendanceStats {
  id: string;
  name: string;
  gender: string;
  presentDays: number;
  totalDays: number;
  percentage: number;
}

const AttendanceStats = () => {
  const { school } = useSchool();
  const schoolId = school?.id || null;
  const [selectedClass, setSelectedClass] = useState(CLASSES_LIST[0].id);
  const [stats, setStats] = useState<StudentAttendanceStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [termTotalDays, setTermTotalDays] = useState(0);

  useEffect(() => {
    const fetchAttendance = async () => {
      setLoading(true);
      try {
        if (!schoolId) {
          setStats([]);
          setTermTotalDays(0);
          return;
        }

        // 1. Get Students in Class
        const students = await db.getStudents(schoolId, selectedClass);

        // 2. Get School Config to calculate total school days
        const config = await db.getSchoolConfig(schoolId);

        // 3. Calculate total school days from reopen to vacation (inclusive)
        let totalSchoolDays = 0;
        if (config.schoolReopenDate && config.vacationDate) {
          const reopen = new Date(config.schoolReopenDate);
          const vacation = new Date(config.vacationDate);

          // Count all calendar days between dates inclusive
          const current = new Date(reopen);
          while (current <= vacation) {
            totalSchoolDays++;
            current.setDate(current.getDate() + 1);
          }
        } else {
          // Fallback: count existing attendance records
          const attendanceRecords = await db.getClassAttendance(
            schoolId,
            selectedClass,
          );
          totalSchoolDays = attendanceRecords.length;
        }

        setTermTotalDays(totalSchoolDays);

        // 4. Get All Attendance Records for this class
        const attendanceRecords = await db.getClassAttendance(
          schoolId,
          selectedClass,
        );

        // 5. Calculate Stats for each student
        const calculatedStats = students.map((student) => {
          // Count how many records have this student's ID in 'presentStudentIds'
          const presentCount = attendanceRecords.filter((r) =>
            r.presentStudentIds.includes(student.id),
          ).length;

          const pct =
            totalSchoolDays === 0
              ? 0
              : Math.round((presentCount / totalSchoolDays) * 100);

          return {
            id: student.id,
            name: student.name,
            gender: student.gender,
            presentDays: presentCount,
            totalDays: totalSchoolDays,
            percentage: pct,
          };
        });

        // Sort by name
        calculatedStats.sort((a, b) => a.name.localeCompare(b.name));
        setStats(calculatedStats);
      } catch (error) {
        console.error("Error fetching attendance stats:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAttendance();
  }, [selectedClass, schoolId]);

  return (
    <Layout title="Attendance Statistics">
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 flex flex-col h-[calc(100vh-8rem)]">
        {/* Header & Filters */}
        <div className="p-6 border-b border-slate-100 flex flex-col xl:flex-row justify-between xl:items-center gap-4 bg-slate-50">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                Select Class
              </label>
              <select
                className="border border-slate-300 rounded-md px-3 py-2 text-sm w-48 bg-white text-slate-900"
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
              >
                {CLASSES_LIST.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="bg-white border border-slate-200 rounded-md px-4 py-1.5 shadow-sm">
              <span className="block text-xs text-slate-400 uppercase">
                Term Total Days
              </span>
              <span className="font-bold text-lg text-slate-800">
                {termTotalDays}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-600 bg-white px-3 py-1.5 rounded-full border border-slate-200 shadow-sm">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>{" "}
              Excellent (90%+)
            </div>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-600 bg-white px-3 py-1.5 rounded-full border border-slate-200 shadow-sm">
              <div className="w-2.5 h-2.5 rounded-full bg-amber-400"></div>{" "}
              Average (50-89%)
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-[#0B4A82] bg-[#E6F0FA] px-3 py-1.5 rounded-full border border-[#E6F0FA] shadow-sm">
              <AlertTriangle size={12} className="text-[#0B4A82]" /> Critical (
              {"<"}50%)
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-0">
          {loading ? (
            <div className="text-center py-20 text-slate-400">
              Calculating Attendance Data...
            </div>
          ) : (
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-slate-800 font-semibold border-b border-slate-200 sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-4">Student Name</th>
                  <th className="px-6 py-4 text-center">Days Present</th>
                  <th className="px-6 py-4 text-center">Total School Days</th>
                  <th className="px-6 py-4 w-1/3">Attendance Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stats.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-slate-400">
                      No students found in this class.
                    </td>
                  </tr>
                ) : (
                  stats.map((s) => {
                    // Color Logic
                    let barColor = "bg-emerald-500";
                    let badgeColor =
                      "text-emerald-700 bg-emerald-50 border-emerald-200";
                    let rowClass = "hover:bg-slate-50";
                    let warningIcon = null;

                    if (s.percentage < 50) {
                      barColor = "bg-red-500";
                      badgeColor =
                        "text-[#0B4A82] bg-[#E6F0FA] border-[#E6F0FA]";
                      rowClass = "bg-[#E6F0FA]/60 hover:bg-[#E6F0FA]/80";
                      warningIcon = (
                        <span title="Critical Attendance">
                          <AlertTriangle
                            size={14}
                            className="text-[#0B4A82] ml-2"
                          />
                        </span>
                      );
                    } else if (s.percentage < 90) {
                      barColor = "bg-amber-400";
                      badgeColor =
                        "text-amber-700 bg-amber-50 border-amber-200";
                    }

                    return (
                      <tr
                        key={s.id}
                        className={`${rowClass} transition-colors border-b border-slate-100 last:border-0`}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center">
                            <div
                              className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white mr-3 shadow-sm ${s.gender === "Male" ? "bg-[#0B4A82]" : "bg-pink-500"}`}
                            >
                              {s.name.charAt(0)}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-800 flex items-center">
                                {s.name}
                                {warningIcon}
                              </p>
                              <p className="text-xs text-slate-500">
                                {s.gender}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="font-bold text-slate-800 text-lg">
                            {s.presentDays}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="text-slate-500">{s.totalDays}</span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex-1 h-2.5 bg-slate-200 rounded-full overflow-hidden shadow-inner">
                              <div
                                className={`h-full ${barColor} transition-all duration-500 rounded-full`}
                                style={{ width: `${s.percentage}%` }}
                              ></div>
                            </div>
                            <span
                              className={`text-xs font-bold px-2.5 py-1 rounded border ${badgeColor} min-w-[3.5rem] text-center shadow-sm`}
                            >
                              {s.percentage}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default AttendanceStats;
