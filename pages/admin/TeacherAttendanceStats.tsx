import React, { useState, useEffect } from "react";
import Layout from "../../components/Layout";
import { db } from "../../services/mockDb";
import { TeacherAttendanceAnalytics } from "../../types";
import { useSchool } from "../../context/SchoolContext";
import {
  Calendar,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";

const TeacherAttendanceStats = () => {
  const { school } = useSchool();
  const schoolId = school?.id || null;
  const [analytics, setAnalytics] = useState<TeacherAttendanceAnalytics[]>([]);
  const [loading, setLoading] = useState(false);
  const [termStartDate, setTermStartDate] = useState("");
  const [vacationDate, setVacationDate] = useState("");

  useEffect(() => {
    const fetchInitialData = async () => {
      setLoading(true);
      try {
        // Fetch school config to get the reopen date and vacation date
        if (!schoolId) {
          setAnalytics([]);
          return;
        }
        const config = await db.getSchoolConfig(schoolId);

        // Set term start date from config
        if (config.schoolReopenDate && !termStartDate) {
          setTermStartDate(config.schoolReopenDate);
        }

        // Set vacation date from config
        if (config.vacationDate && !vacationDate) {
          setVacationDate(config.vacationDate);
        }

        // Use dates from state, falling back to config
        const startDate = termStartDate || config.schoolReopenDate || undefined;
        const endDate = vacationDate || config.vacationDate || undefined;

        const data = await db.getTeacherAttendanceAnalytics(
          schoolId,
          startDate,
          endDate,
        );
        setAnalytics(data);
      } catch (error) {
        console.error("Error fetching teacher attendance analytics:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();
  }, [termStartDate, vacationDate, schoolId]);

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case "improving":
        return <TrendingUp className="text-emerald-600" size={16} />;
      case "declining":
        return <TrendingDown className="text-[#0B4A82]" size={16} />;
      default:
        return <Minus className="text-slate-400" size={16} />;
    }
  };

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case "improving":
        return "text-emerald-700 bg-emerald-50 border-emerald-200";
      case "declining":
        return "text-[#0B4A82] bg-[#E6F0FA] border-[#E6F0FA]";
      default:
        return "text-slate-600 bg-slate-50 border-slate-200";
    }
  };

  return (
    <Layout title="Teacher Attendance Analytics">
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 flex flex-col h-[calc(100vh-8rem)]">
        {/* Header & Filters */}
        <div className="p-6 border-b border-slate-100 flex flex-col xl:flex-row justify-between xl:items-center gap-4 bg-slate-50">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <h3 className="text-lg font-semibold text-slate-800">
              Teacher Attendance Overview
            </h3>

            <div className="flex flex-wrap gap-3">
              <div className="flex flex-col">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                  Term Start Date
                </label>
                <input
                  type="date"
                  className="border border-slate-300 rounded-md px-3 py-2 text-sm w-40 bg-white text-slate-900"
                  value={termStartDate}
                  onChange={(e) => setTermStartDate(e.target.value)}
                />
              </div>

              <div className="flex flex-col">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                  Vacation Date
                </label>
                <input
                  type="date"
                  className="border border-slate-300 rounded-md px-3 py-2 text-sm w-40 bg-white text-slate-900"
                  value={vacationDate}
                  onChange={(e) => setVacationDate(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-600 bg-white px-3 py-1.5 rounded-full border border-slate-200 shadow-sm">
              <TrendingUp size={12} className="text-emerald-600" /> Improving
            </div>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-600 bg-white px-3 py-1.5 rounded-full border border-slate-200 shadow-sm">
              <Minus size={12} className="text-slate-400" /> Stable
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-[#0B4A82] bg-[#E6F0FA] px-3 py-1.5 rounded-full border border-[#E6F0FA] shadow-sm">
              <TrendingDown size={12} className="text-[#0B4A82]" /> Declining
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-0">
          {loading ? (
            <div className="text-center py-20 text-slate-400">
              Analyzing Teacher Attendance Data...
            </div>
          ) : (
            <div className="p-6 space-y-6">
              {analytics.length === 0 ? (
                <div className="text-center py-20 text-slate-400">
                  No teacher attendance data found.
                </div>
              ) : (
                analytics.map((teacher) => (
                  <div
                    key={teacher.teacherId}
                    className="bg-slate-50 rounded-xl p-6 border border-slate-200"
                  >
                    {/* Teacher Header */}
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-[#0B4A82] border-2 border-[#E6F0FA] flex items-center justify-center text-white font-bold text-lg shadow-lg">
                          {teacher.teacherName.charAt(0)}
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-slate-800">
                            {teacher.teacherName}
                          </h3>
                          <div className="flex items-center gap-4 mt-1">
                            <div className="flex items-center gap-2">
                              <Calendar size={14} className="text-slate-500" />
                              <span className="text-sm text-slate-600">
                                {teacher.termStartDate} -{" "}
                                {teacher.vacationDate || "Present"}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <CheckCircle
                                size={14}
                                className="text-emerald-600"
                              />
                              <span className="text-sm font-semibold text-emerald-700">
                                {teacher.overallAttendance}% Overall Attendance
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Monthly Breakdown */}
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
                        Monthly Attendance Breakdown
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {teacher.monthlyBreakdown.map((month) => (
                          <div
                            key={month.month}
                            className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-semibold text-slate-800">
                                {month.month}
                              </span>
                              {getTrendIcon(month.trend)}
                            </div>

                            <div className="space-y-2">
                              <div className="flex justify-between text-sm">
                                <span className="text-slate-600">
                                  Working Days:
                                </span>
                                <span className="font-medium">
                                  {month.totalWorkingDays}
                                </span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-slate-600">Present:</span>
                                <span className="font-medium text-emerald-700">
                                  {month.presentDays}
                                </span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-slate-600">Absent:</span>
                                <span className="font-medium text-[#0B4A82]">
                                  {month.absentDays}
                                </span>
                              </div>

                              {/* Attendance Rate Bar */}
                              <div className="mt-3">
                                <div className="flex justify-between items-center mb-1">
                                  <span className="text-xs text-slate-500">
                                    Attendance Rate
                                  </span>
                                  <span
                                    className={`text-xs font-bold px-2 py-0.5 rounded ${getTrendColor(month.trend)}`}
                                  >
                                    {month.attendanceRate}%
                                  </span>
                                </div>
                                <div className="w-full bg-slate-200 rounded-full h-2">
                                  <div
                                    className={`h-2 rounded-full transition-all duration-500 ${
                                      month.attendanceRate >= 90
                                        ? "bg-emerald-500"
                                        : month.attendanceRate >= 70
                                          ? "bg-amber-400"
                                          : "bg-[#1160A8]"
                                    }`}
                                    style={{
                                      width: `${month.attendanceRate}%`,
                                    }}
                                  ></div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Critical Alert for Low Attendance */}
                    {teacher.overallAttendance < 70 && (
                      <div className="mt-4 bg-[#E6F0FA] border border-[#E6F0FA] rounded-lg p-4 flex items-center gap-3">
                        <AlertTriangle className="text-[#0B4A82]" size={20} />
                        <div>
                          <p className="text-sm font-semibold text-[#0B4A82]">
                            Critical Attendance Alert
                          </p>
                          <p className="text-xs text-[#1160A8]">
                            This teacher has below 70% overall attendance and
                            may need intervention.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default TeacherAttendanceStats;

