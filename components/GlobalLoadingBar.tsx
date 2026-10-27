import React, { useEffect, useState } from "react";

/**
 * Compact global loading indicator.
 *
 * Renders a small spinner + "Loading..." badge in the top-right area of the
 * viewport, positioned underneath the header's corner controls (not hovering
 * over them). The animation is intentionally short and lightweight: a single
 * spin cycle with a quick fade in/out.
 */
export const GlobalLoadingBar: React.FC<{ active: boolean; label?: string }> = ({
  active,
  label = "Loading...",
}) => {
  const [mounted, setMounted] = useState(active);

  useEffect(() => {
    if (active) {
      setMounted(true);
      return;
    }
    const id = window.setTimeout(() => setMounted(false), 250);
    return () => window.clearTimeout(id);
  }, [active]);

  if (!mounted) return null;

  return (
    <div
      className="fixed top-16 right-4 z-[9999] pointer-events-none"
      aria-live="polite"
      aria-busy={active}
    >
      <div
        className={
          "flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-3 py-1.5 " +
          "shadow-md backdrop-blur-md " +
          (active
            ? "animate-loading-fade-in"
            : "animate-loading-fade-out")
        }
      >
        <span className="relative flex h-4 w-4 items-center justify-center">
          <span className="absolute inset-0 rounded-full border-2 border-slate-200" />
          <span className="absolute inset-0 rounded-full border-2 border-t-[#0B4A82] border-r-[#0B4A82] border-b-[#0B4A82] border-l-transparent animate-spin" />
        </span>
        <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">
          {label}
        </span>
      </div>
      <style>{`
        @keyframes loading-fade-in {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes loading-fade-out {
          from { opacity: 1; transform: translateY(0); }
          to   { opacity: 0; transform: translateY(-6px); }
        }
        .animate-loading-fade-in  { animation: loading-fade-in 0.2s ease-out forwards; }
        .animate-loading-fade-out { animation: loading-fade-out 0.25s ease-in forwards; }
      `}</style>
    </div>
  );
};

export default GlobalLoadingBar;