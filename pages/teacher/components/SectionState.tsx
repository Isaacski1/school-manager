import React from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";

interface SectionStateProps {
  loading: boolean;
  error?: string | null;
  loadingLabel?: string;
  emptyLabel?: string;
  isEmpty?: boolean;
  onRetry?: () => void;
}

const SectionState: React.FC<SectionStateProps> = ({
  loading,
  error,
  loadingLabel = "Loading...",
  emptyLabel = "No records found.",
  isEmpty = false,
  onRetry,
}) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-slate-500">
        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
        <span className="text-sm">{loadingLabel}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            <span>{error}</span>
          </div>
          {onRetry && (
            <button
              onClick={onRetry}
              className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  if (isEmpty) {
    return <div className="py-8 text-center text-sm italic text-slate-400">{emptyLabel}</div>;
  }

  return null;
};

export default SectionState;

