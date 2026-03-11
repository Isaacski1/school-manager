import React from "react";
import { Link } from "react-router-dom";
import { AlertCircle, CheckCircle2, Clock, Target } from "lucide-react";

export type PriorityTone = "high" | "medium" | "normal";

export interface PriorityItem {
  id: string;
  title: string;
  description: string;
  tone: PriorityTone;
  actionLabel?: string;
  actionTo?: string;
  onAction?: () => void;
  disabled?: boolean;
}

interface TodayPrioritiesStripProps {
  items: PriorityItem[];
}

const toneClasses: Record<
  PriorityTone,
  { card: string; iconBg: string; icon: React.ReactNode }
> = {
  high: {
    card: "border-rose-200 bg-rose-50",
    iconBg: "bg-rose-100 text-rose-700",
    icon: <AlertCircle className="h-4 w-4" />,
  },
  medium: {
    card: "border-amber-200 bg-amber-50",
    iconBg: "bg-amber-100 text-amber-700",
    icon: <Clock className="h-4 w-4" />,
  },
  normal: {
    card: "border-emerald-200 bg-emerald-50",
    iconBg: "bg-emerald-100 text-emerald-700",
    icon: <CheckCircle2 className="h-4 w-4" />,
  },
};

const TodayPrioritiesStrip: React.FC<TodayPrioritiesStripProps> = ({ items }) => {
  if (!items.length) {
    return (
      <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
        <div className="flex items-center gap-2 font-semibold">
          <CheckCircle2 className="h-4 w-4" />
          All clear for today.
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
        <Target className="h-4 w-4 text-[#1160A8]" />
        Today's Priorities
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {items.map((item) => {
          const tone = toneClasses[item.tone];
          return (
            <div key={item.id} className={`rounded-xl border p-3 ${tone.card}`}>
              <div className="flex items-start gap-2">
                <span
                  className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full ${tone.iconBg}`}
                >
                  {tone.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                  <p className="mt-1 text-xs text-slate-600">{item.description}</p>
                </div>
              </div>
              {item.actionLabel &&
                (item.actionTo ? (
                  <Link
                    to={item.actionTo}
                    onClick={(event) => {
                      if (!item.disabled) return;
                      event.preventDefault();
                    }}
                    className={`mt-3 inline-flex rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      item.disabled
                        ? "cursor-not-allowed bg-slate-200 text-slate-500"
                        : "bg-white text-[#1160A8] hover:bg-slate-50"
                    }`}
                  >
                    {item.actionLabel}
                  </Link>
                ) : (
                  <button
                    onClick={item.onAction}
                    disabled={item.disabled}
                    className={`mt-3 inline-flex rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      item.disabled
                        ? "cursor-not-allowed bg-slate-200 text-slate-500"
                        : "bg-white text-[#1160A8] hover:bg-slate-50"
                    }`}
                  >
                    {item.actionLabel}
                  </button>
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TodayPrioritiesStrip;

