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
    <div className="bg-white p-8 rounded-2xl shadow-md border border-slate-100 h-full flex flex-col overflow-hidden">
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

      {/* Attendance Chart Container */}
      <div className="flex-1 flex flex-col min-h-0 w-full mt-4 relative px-4 pb-4">
        <div className="flex-1 relative w-full min-h-[200px]">
          {/* Y-Axis Grid Lines (Background) */}
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
            {[100, 75, 50, 25, 0].map((level) => (
              <div key={level} className="flex items-center w-full h-0">
                <span className="text-[10px] text-slate-400 w-10 text-right pr-3 font-medium">
                  {level}%
                </span>
                <div className="flex-1 border-t border-slate-100 border-dashed"></div>
              </div>
            ))}
          </div>

          {/* Bars Container */}
          <div className="absolute inset-0 left-10 flex items-end justify-center gap-3 sm:gap-6 md:gap-10 overflow-x-auto no-scrollbar">
            {data.map((item) => {
              // Colors and gradients based on percentage
              let barGradient = "from-amber-400 to-amber-600";
              if (item.percentage < 50) barGradient = "from-rose-400 to-rose-600";
              else if (item.percentage >= 80) barGradient = "from-emerald-400 to-emerald-600";

              return (
                <div
                  key={item.id}
                  className="group relative flex flex-col items-center justify-end h-full flex-shrink-0"
                  style={{ 
                    width: data.length > 10 ? "30px" : data.length > 5 ? "45px" : "60px",
                    maxWidth: "80px"
                  }}
                >
                  {/* Tooltip */}
                  <div className="absolute -top-10 left-1/2 transform -translate-x-1/2 bg-slate-900 text-white text-[10px] font-bold py-1.5 px-2.5 rounded-xl opacity-0 group-hover:opacity-100 transition-all duration-300 whitespace-nowrap z-20 shadow-2xl scale-75 group-hover:scale-100">
                    <div className="flex flex-col items-center">
                      <span>{item.className}</span>
                      <span className="text-emerald-400">{item.percentage}%</span>
                    </div>
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900 rotate-45"></div>
                  </div>

                  {/* The Bar Track (Skeleton) */}
                  <div className="w-full h-full bg-slate-50/50 rounded-t-xl relative overflow-hidden border border-slate-100/30 group-hover:bg-slate-100/50 transition-colors">
                    {/* The Actual Colored Bar */}
                    <div
                      className={`absolute bottom-0 w-full bg-gradient-to-t ${barGradient} rounded-t-lg transition-all duration-1000 ease-out shadow-sm group-hover:brightness-110`}
                      style={{ height: `${item.percentage}%` }}
                    >
                      <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Labels Area */}
        <div className="mt-4 ml-10 flex items-start justify-center gap-3 sm:gap-6 md:gap-10 overflow-x-auto no-scrollbar">
          {data.map((item) => (
            <div 
              key={item.id} 
              className="text-center flex-shrink-0"
              style={{ 
                width: data.length > 10 ? "30px" : data.length > 5 ? "45px" : "60px",
                maxWidth: "80px"
              }}
            >
              <span className="text-[11px] font-bold text-slate-500 hover:text-slate-900 transition-colors whitespace-nowrap block">
                {data.length > 8 ? item.className.replace("JHS ", "J").replace("Class ", "P") : item.className}
              </span>
            </div>
          ))}
        </div>
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
