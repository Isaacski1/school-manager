import React from "react";
import { AlertTriangle, RefreshCw, UserRound } from "lucide-react";

export interface StudentAttentionItem {
  studentId: string;
  studentName: string;
  className: string;
  reasons: string[];
}

interface StudentsNeedingAttentionProps {
  items: StudentAttentionItem[];
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
}

const StudentsNeedingAttention: React.FC<StudentsNeedingAttentionProps> = ({
  items,
  loading,
  error,
  onRetry,
}) => {
  return (
    <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-slate-100 min-w-0">
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h3 className="font-bold text-slate-800 flex items-center text-base sm:text-[1.625rem]">
          <AlertTriangle className="mr-2 h-5 w-5 text-amber-500" />
          Students Needing Attention
        </h3>
        <span className="self-start sm:self-auto rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-500">
          {items.length} flagged
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-slate-500">
          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          <span className="text-sm">Analyzing class signals...</span>
        </div>
      ) : error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <p>{error}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-2 rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
            >
              Retry
            </button>
          )}
        </div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center text-sm italic text-slate-400">
          No flagged students right now.
        </div>
      ) : (
        <div className="max-h-none sm:max-h-[280px] space-y-3 overflow-y-visible sm:overflow-y-auto pr-0 sm:pr-1">
          {items.map((item) => (
            <div
              key={item.studentId}
              className="rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <UserRound className="h-4 w-4 text-amber-600" />
                <p className="text-sm font-semibold text-slate-800 break-words">
                  {item.studentName}
                </p>
                <span className="text-[10px] text-slate-500 whitespace-nowrap">
                  {item.className}
                </span>
              </div>
              <div className="mt-1 text-xs text-slate-600 break-words">
                {item.reasons.join(" | ")}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default StudentsNeedingAttention;
