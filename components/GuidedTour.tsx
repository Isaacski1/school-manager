import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, Check, Compass, X } from "lucide-react";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { firestore } from "../services/firebase";

type TourRole = "school_admin" | "teacher" | "parent";

type TourStep = {
  title: string;
  body: string;
  selector?: string;
};

const TOUR_VERSION = 1;

const ROLE_STEPS: Record<TourRole, TourStep[]> = {
  school_admin: [
    {
      title: "Welcome to School Manager GH",
      body: "Let’s take a quick tour of the tools you’ll use to run your school. You can skip now and replay this tour from Help at any time.",
    },
    {
      title: "Your school at a glance",
      body: "The dashboard brings together subscription status, school activity, academic information, and important reminders.",
      selector: '[data-tour="dashboard-content"]',
    },
    {
      title: "Manage students",
      body: "Add learners, update their records, assign classes, and review student information here.",
      selector: '[data-tour="/admin/students"]',
    },
    {
      title: "Manage teachers",
      body: "Create teacher accounts, assign responsibilities, and manage your teaching staff.",
      selector: '[data-tour="/admin/teachers"]',
    },
    {
      title: "Track attendance",
      body: "Review daily student attendance and attendance trends from this section.",
      selector: '[data-tour="/admin/attendance"]',
    },
    {
      title: "Fees and payments",
      body: "Set up school fees, record payments, and monitor outstanding balances.",
      selector: '[data-tour="/admin/fees"]',
    },
    {
      title: "Subscription and billing",
      body: "See your current plan, renewal date, payment history, and renew your subscription.",
      selector: '[data-tour="/admin/billing"]',
    },
    {
      title: "Your School Assistant",
      body: "Ask for help finding features or understanding common school-management workflows.",
      selector: '[data-tour="school-assistant"]',
    },
  ],
  teacher: [
    {
      title: "Welcome to your teacher dashboard",
      body: "Here’s a quick look at the tools for your classes and daily teaching work.",
    },
    {
      title: "Your teaching overview",
      body: "Use the dashboard to review your classes, notices, timetable, and recent activity.",
      selector: '[data-tour="dashboard-content"]',
    },
    {
      title: "Take attendance",
      body: "Record and review attendance for the students assigned to your classes.",
      selector: '[data-tour="/teacher/attendance"]',
    },
    {
      title: "Enter assessments",
      body: "Record scores and maintain assessment results for your subjects.",
      selector: '[data-tour="/teacher/assessment"]',
    },
    {
      title: "Write student remarks",
      body: "Add meaningful teacher remarks that can appear in student reports.",
      selector: '[data-tour="/teacher/write-remarks"]',
    },
    {
      title: "Review performance",
      body: "Explore student performance and identify learners who may need support.",
      selector: '[data-tour="/teacher/student-performance"]',
    },
  ],
  parent: [
    {
      title: "Welcome to the parent portal",
      body: "Let’s quickly show you where to follow your child’s school progress.",
    },
    {
      title: "Your child’s overview",
      body: "The dashboard summarizes school notices and the information available for your selected child.",
      selector: '[data-tour="dashboard-content"]',
    },
    {
      title: "Attendance",
      body: "Review your child’s attendance records and school-day history.",
      selector: '[data-tour="/parent?view=attendance"]',
    },
    {
      title: "Fees and bills",
      body: "Check school fees, balances, and available payment information.",
      selector: '[data-tour="/parent?view=fees"]',
    },
    {
      title: "Report cards",
      body: "Open published academic reports and review your child’s results.",
      selector: '[data-tour="/parent?view=report"]',
    },
    {
      title: "Teacher remarks",
      body: "Read comments and feedback shared by your child’s teachers.",
      selector: '[data-tour="/parent?view=remarks"]',
    },
  ],
};

const getStorageKey = (userId: string, role: TourRole) =>
  `school_manager_tour:${TOUR_VERSION}:${role}:${userId}`;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

interface GuidedTourProps {
  role: TourRole;
  userId: string;
  userName?: string;
  autoStart: boolean;
  restartSignal: number;
  darkMode: boolean;
  onOpenSidebar: () => void;
  onCloseSidebar: () => void;
  onCompletionStateChange: (completed: boolean) => void;
}

const GuidedTour: React.FC<GuidedTourProps> = ({
  role,
  userId,
  userName,
  autoStart,
  restartSignal,
  darkMode,
  onOpenSidebar,
  onCloseSidebar,
  onCompletionStateChange,
}) => {
  const steps = ROLE_STEPS[role];
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  const closeTour = useCallback(
    (status: "completed" | "skipped") => {
      const completion = {
        version: TOUR_VERSION,
        role,
        status,
        completedAt: new Date().toISOString(),
      };
      localStorage.setItem(getStorageKey(userId, role), JSON.stringify(completion));
      onCompletionStateChange(true);
      void setDoc(
        doc(firestore, "users", userId),
        {
          onboardingTours: {
            [role]: {
              dashboard: {
                version: TOUR_VERSION,
                status,
                completedAt: serverTimestamp(),
              },
            },
          },
        },
        { merge: true },
      ).catch((error) => {
        console.error("Failed to save guided tour completion", error);
      });
      setOpen(false);
      setStepIndex(0);
      setTargetRect(null);
      onCloseSidebar();
    },
    [onCloseSidebar, onCompletionStateChange, role, userId],
  );

  useEffect(() => {
    if (!userId) return;
    const saved = localStorage.getItem(getStorageKey(userId, role));
    if (saved) {
      onCompletionStateChange(true);
      return;
    }
    let cancelled = false;
    let timer: number | null = null;

    const checkCompletion = async () => {
      try {
        const profile = await getDoc(doc(firestore, "users", userId));
        const cloudState = profile.data()?.onboardingTours?.[role]?.dashboard;
        if (
          Number(cloudState?.version || 0) >= TOUR_VERSION &&
          ["completed", "skipped"].includes(String(cloudState?.status || ""))
        ) {
          localStorage.setItem(
            getStorageKey(userId, role),
            JSON.stringify({
              version: cloudState.version,
              role,
              status: cloudState.status,
            }),
          );
          onCompletionStateChange(true);
          return;
        }
      } catch (error) {
        console.error("Failed to load guided tour completion", error);
      }

      if (!cancelled) {
        onCompletionStateChange(false);
        if (autoStart) {
          timer = window.setTimeout(() => setOpen(true), 500);
        }
      }
    };

    void checkCompletion();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [autoStart, onCompletionStateChange, role, userId]);

  useEffect(() => {
    if (!restartSignal) return;
    setStepIndex(0);
    setOpen(true);
  }, [restartSignal]);

  const currentStep = steps[stepIndex];

  const updateTarget = useCallback(() => {
    if (!open || !currentStep?.selector) {
      setTargetRect(null);
      return;
    }
    const element = document.querySelector<HTMLElement>(currentStep.selector);
    if (!element) {
      setTargetRect(null);
      return;
    }
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    setTargetRect(element.getBoundingClientRect());
  }, [currentStep?.selector, open]);

  useEffect(() => {
    if (!open) return;
    if (
      currentStep?.selector?.includes('data-tour="/admin') ||
      currentStep?.selector?.includes('data-tour="/teacher') ||
      currentStep?.selector?.includes('data-tour="/parent')
    ) {
      onOpenSidebar();
    } else {
      onCloseSidebar();
    }
    const timer = window.setTimeout(updateTarget, 180);
    window.addEventListener("resize", updateTarget);
    window.addEventListener("scroll", updateTarget, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", updateTarget);
      window.removeEventListener("scroll", updateTarget, true);
    };
  }, [
    currentStep?.selector,
    onCloseSidebar,
    onOpenSidebar,
    open,
    updateTarget,
  ]);

  const goNext = useCallback(() => {
    if (stepIndex >= steps.length - 1) {
      closeTour("completed");
      return;
    }
    setStepIndex((current) => current + 1);
  }, [closeTour, stepIndex, steps.length]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeTour("skipped");
      if (event.key === "ArrowRight" || event.key === "Enter") goNext();
      if (event.key === "ArrowLeft") {
        setStepIndex((current) => Math.max(0, current - 1));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeTour, goNext, open]);

  const tooltipStyle = useMemo<React.CSSProperties>(() => {
    if (!targetRect) {
      return {
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
      };
    }
    const width = Math.min(368, window.innerWidth - 32);
    const left = clamp(targetRect.left, 16, window.innerWidth - width - 16);
    const placeBelow = targetRect.bottom + 270 < window.innerHeight;
    const top = placeBelow
      ? targetRect.bottom + 16
      : Math.max(16, targetRect.top - 250);
    return { left, top, width };
  }, [targetRect]);

  if (!open || typeof document === "undefined") return null;

  const paddedRect = targetRect
    ? {
        left: Math.max(0, targetRect.left - 6),
        top: Math.max(0, targetRect.top - 6),
        right: Math.min(window.innerWidth, targetRect.right + 6),
        bottom: Math.min(window.innerHeight, targetRect.bottom + 6),
      }
    : null;

  return createPortal(
    <div className="fixed inset-0 z-[100]" aria-live="polite">
      {paddedRect ? (
        <>
          <div className={`fixed inset-x-0 top-0 ${darkMode ? "bg-black/30" : "bg-slate-950/60"}`} style={{ height: paddedRect.top }} />
          <div className={`fixed inset-x-0 bottom-0 ${darkMode ? "bg-black/30" : "bg-slate-950/60"}`} style={{ top: paddedRect.bottom }} />
          <div className={`fixed left-0 ${darkMode ? "bg-black/30" : "bg-slate-950/60"}`} style={{ top: paddedRect.top, width: paddedRect.left, height: paddedRect.bottom - paddedRect.top }} />
          <div className={`fixed right-0 ${darkMode ? "bg-black/30" : "bg-slate-950/60"}`} style={{ top: paddedRect.top, left: paddedRect.right, height: paddedRect.bottom - paddedRect.top }} />
          <div
            className="pointer-events-none fixed rounded-2xl border-2 border-cyan-300 shadow-[0_0_0_4px_rgba(34,211,238,0.2),0_18px_50px_rgba(15,23,42,0.3)]"
            style={{
              left: paddedRect.left,
              top: paddedRect.top,
              width: paddedRect.right - paddedRect.left,
              height: paddedRect.bottom - paddedRect.top,
            }}
          />
        </>
      ) : (
        <div className={`fixed inset-0 ${darkMode ? "bg-black/40" : "bg-slate-950/60"}`} />
      )}

      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="guided-tour-title"
        className={`fixed w-[calc(100vw-2rem)] max-w-[23rem] rounded-[24px] border p-5 shadow-2xl sm:p-6 ${
          darkMode
            ? "border-slate-700 bg-slate-900 text-slate-100"
            : "border-slate-200 bg-white text-slate-900"
        }`}
        style={tooltipStyle}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E6F0FA] text-[#0B4A82]">
            <Compass size={20} />
          </div>
          <button
            type="button"
            onClick={() => closeTour("skipped")}
            className={`rounded-lg p-1.5 text-slate-400 transition ${
              darkMode
                ? "hover:bg-slate-800 hover:text-white"
                : "hover:bg-slate-100 hover:text-slate-700"
            }`}
            aria-label="Skip guided tour"
          >
            <X size={18} />
          </button>
        </div>

        <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-700">
          {stepIndex + 1} of {steps.length}
        </p>
        <h2 id="guided-tour-title" className={`mt-2 text-xl font-bold ${darkMode ? "text-white" : "text-slate-950"}`}>
          {stepIndex === 0 && userName
            ? `${currentStep.title}, ${userName.split(" ")[0]}`
            : currentStep.title}
        </h2>
        <p className={`mt-2 text-sm leading-6 ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
          {currentStep.body}
        </p>

        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#0B4A82] to-cyan-500 transition-all"
            style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }}
          />
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => closeTour("skipped")}
            className={`text-sm font-semibold ${darkMode ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-800"}`}
          >
            Skip
          </button>
          <div className="flex items-center gap-2">
            {stepIndex > 0 ? (
              <button
                type="button"
                onClick={() => setStepIndex((current) => current - 1)}
                className={`inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-sm font-semibold ${
                  darkMode
                    ? "border-slate-700 text-slate-200 hover:bg-slate-800"
                    : "border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}
              >
                <ArrowLeft size={15} />
                Back
              </button>
            ) : null}
            <button
              type="button"
              onClick={goNext}
              className="inline-flex items-center gap-1 rounded-xl bg-[#0B4A82] px-4 py-2 text-sm font-semibold text-white hover:bg-[#083b69]"
            >
              {stepIndex === steps.length - 1 ? (
                <>
                  Finish <Check size={15} />
                </>
              ) : (
                <>
                  Next <ArrowRight size={15} />
                </>
              )}
            </button>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
};

export default GuidedTour;
