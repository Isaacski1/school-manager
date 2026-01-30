import React from "react";
import { CLASSES_LIST } from "../../constants";

interface AttendanceChartProps {
  data: { className: string; percentage: number; id: string }[];
  week: Date | null;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
  onCurrentWeek: () => void;
  schoolReopenDate?: string;
}

const AttendanceChart: React.FC<AttendanceChartProps> = ({
  data,
  week,
  onPreviousWeek,
  onNextWeek,
  onCurrentWeek,
  schoolReopenDate,
}) => {
  // Return placeholder if week hasn't loaded yet
  if (week === null) {
    return (
      <div className="bg-white p-6 rounded-2xl shadow-md border border-slate-100 h-full flex flex-col items-center justify-center">
        <div className="relative w-12 h-12 border-3 border-slate-100 border-t-red-900 rounded-full animate-spin"></div>
        <p className="text-slate-400 text-sm mt-4">
          Loading attendance data...
        </p>
      </div>
    );
  }

  const { monday, friday } = getWeekRange(week);
  const effectiveCurrentWeekStart = getEffectiveCurrentWeekStart();
  const isCurrentWeek =
    effectiveCurrentWeekStart.toDateString() === monday.toDateString();

  // Parse date string safely to avoid timezone shift
  const parseLocalDate = (dateString: string): Date => {
    const parts = dateString.split("-");
    if (parts.length === 3) {
      return new Date(
        parseInt(parts[0]),
        parseInt(parts[1]) - 1,
        parseInt(parts[2]),
      );
    }
    return new Date(dateString);
  };

  // Check if school has reopened
  let schoolStatus = "";
  let reopenDateObj: Date | null = null;
  if (schoolReopenDate) {
    reopenDateObj = parseLocalDate(schoolReopenDate);
    const today = new Date();
    if (reopenDateObj > today) {
      schoolStatus = "School Closed";
    } else {
      schoolStatus = "School Open";
    }
  }

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
    }).format(date);
  };

  return (
    <div className="bg-white p-6 rounded-2xl shadow-md border border-slate-100 h-full flex flex-col">
      {/* Header with Week Navigation */}
      <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
        <div>
          <h3 className="font-bold text-slate-800 text-lg">Class Attendance</h3>
          <p className="text-xs text-slate-500">
            Weekly participation overview
          </p>
        </div>
        {schoolStatus && (
          <div
            className={`text-xs font-bold px-3 py-1 rounded-full ${schoolStatus === "School Closed" ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}
          >
            {schoolStatus}
          </div>
        )}
      </div>

      {/* Beautiful Week Selector */}
      <div className="mb-6 p-4 bg-gradient-to-r from-red-50 to-amber-50 rounded-xl border border-red-100">
        <div className="flex items-center justify-between">
          <button
            onClick={onPreviousWeek}
            className="flex items-center justify-center w-10 h-10 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 hover:border-red-400 transition-colors shadow-sm text-slate-600 hover:text-red-700 font-semibold"
            title="Previous week"
          >
            ←
          </button>

          <div className="flex-1 mx-4 text-center">
            <div className="flex flex-col items-center gap-1">
              <p className="text-sm font-semibold text-slate-800">
                {formatDate(monday)} — {formatDate(friday)}
              </p>
              <p className="text-xs text-slate-500 font-medium">
                {monday.getFullYear()}
              </p>
              {isCurrentWeek && (
                <span className="inline-block px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold rounded-full mt-1 uppercase tracking-wide">
                  Current Week
                </span>
              )}
            </div>
          </div>

          <button
            onClick={onNextWeek}
            disabled={isCurrentWeek}
            className="flex items-center justify-center w-10 h-10 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 hover:border-red-400 transition-colors shadow-sm text-slate-600 hover:text-red-700 font-semibold disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-slate-200 disabled:hover:text-slate-600"
            title={
              isCurrentWeek ? "You are viewing the current week" : "Next week"
            }
          >
            →
          </button>
        </div>

        {!isCurrentWeek && (
          <div className="mt-3 text-center">
            <button
              onClick={onCurrentWeek}
              className="text-xs text-red-700 hover:text-red-800 font-semibold bg-white border border-red-200 px-3 py-1.5 rounded-md hover:bg-red-50 transition-colors"
            >
              Return to Current Week
            </button>
          </div>
        )}
      </div>

      {/* School Closed Notice */}
      {schoolStatus === "School Closed" && reopenDateObj && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800 font-semibold">
            School is currently closed. Attendance records will begin from{" "}
            {formatDate(reopenDateObj)}
          </p>
        </div>
      )}

      {/* Attendance Bars */}
      <div className="flex-1 flex items-end justify-between gap-1 sm:gap-2 px-1 pb-2 h-96 w-full overflow-x-auto">
        {data.map((item) => {
          let barColor = "bg-amber-500"; // Standard Noble Gold
          if (item.percentage < 50)
            barColor = "bg-red-600"; // Warning Red
          else if (item.percentage >= 80) barColor = "bg-emerald-500"; // Excellence

          return (
            <div
              key={item.id}
              className="flex flex-col items-center flex-1 group h-full justify-end min-w-[20px]"
            >
              <div className="w-full max-w-[30px] bg-slate-50 rounded-t-sm relative flex items-end h-full hover:bg-slate-100 transition-colors">
                <div className="absolute -top-10 left-1/2 transform -translate-x-1/2 bg-slate-800 text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">
                  {item.className}: {item.percentage}%
                </div>
                <div
                  className={`w-full ${barColor} rounded-t-sm transition-all duration-1000 ease-out relative`}
                  style={{ height: `${item.percentage}%` }}
                ></div>
              </div>
              <span className="text-[10px] text-slate-400 mt-2 font-medium truncate w-full text-center">
                {item.className
                  .replace("Nursery ", "N")
                  .replace("Class ", "P")
                  .replace("Primary ", "P")
                  .replace("KG ", "K")
                  .replace("JHS ", "J")}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Helper functions (copied from AdminDashboard)
const getWeekRange = (date: Date) => {
  const d = new Date(date);
  const day = d.getDay();
  // Calculate Monday (1st day of week): if Sunday (0), go back 6 days; otherwise go back (day-1) days
  const monday = new Date(d);
  monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));

  // For school schedule use weekdays only: calculate Friday (5th day)
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);

  return { monday, friday };
};

const getEffectiveCurrentWeekStart = () => {
  // If school re-open date is set and is in the future, use it as reference
  // Note: This function assumes schoolReopenDate is passed as prop, but it's not used here.
  // In original, it used schoolConfig.schoolReopenDate, but since not passed, simplified.
  // Actually, in original, it calls getWeekRange(new Date())
  return getWeekRange(new Date()).monday;
};

export default AttendanceChart;
