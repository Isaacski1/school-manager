import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  CircleHelp,
  GraduationCap,
  MessageCircle,
  Send,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import {
  findAssistantTopic,
  getAssistantTopic,
  getContextSuggestions,
  SchoolAssistantTopic,
} from "../services/schoolAssistantKnowledge";
import { showToast } from "../services/toast";
import {
  askSchoolAssistant,
  SchoolAssistantChatMessage,
} from "../services/backendApi";

type Message =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; topic: SchoolAssistantTopic };

interface SchoolAssistantDrawerProps {
  open: boolean;
  onClose: () => void;
}

const routeLabels: Record<string, string> = {
  "/admin": "Dashboard",
  "/admin/students": "Students",
  "/admin/teachers": "Teachers",
  "/admin/attendance": "Attendance",
  "/admin/report-card": "Report Cards",
  "/admin/reports": "Academic Reports",
  "/admin/timetable": "Timetable",
  "/admin/fees": "Fees & Payments",
  "/admin/payroll": "Staff Payroll",
  "/admin/payment-settings": "Online Payment",
  "/admin/activity": "Activity",
  "/admin/reminders": "SMS Reminders",
  "/admin/student-history": "Student History",
  "/admin/billing": "Billing",
  "/admin/backups": "Backups",
  "/admin/settings": "Settings",
};

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const SchoolAssistantDrawer: React.FC<SchoolAssistantDrawerProps> = ({
  open,
  onClose,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [thinking, setThinking] = useState(false);
  const [feedback, setFeedback] = useState<Record<string, "up" | "down">>({});
  const timerRef = useRef<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const pageLabel = routeLabels[location.pathname] || "this page";
  const suggestions = useMemo(
    () => getContextSuggestions(location.pathname),
    [location.pathname],
  );

  useEffect(() => {
    if (open) {
      window.setTimeout(() => inputRef.current?.focus(), 250);
    }
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, thinking]);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const saveUnansweredQuestion = (question: string) => {
    try {
      const key = "schoolAssistantUnanswered";
      const current = JSON.parse(localStorage.getItem(key) || "[]") as Array<{
        question: string;
        path: string;
        createdAt: number;
      }>;
      localStorage.setItem(
        key,
        JSON.stringify([
          { question, path: location.pathname, createdAt: Date.now() },
          ...current,
        ].slice(0, 100)),
      );
    } catch {
      // Local feedback storage should never block the assistant.
    }
  };

  const submitQuestion = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || thinking) return;

    setMessages((current) => [
      ...current,
      { id: makeId(), role: "user", text: trimmed },
    ]);
    setQuery("");
    setThinking(true);

    const topic = findAssistantTopic(trimmed);
    timerRef.current = window.setTimeout(() => {
      setThinking(false);
      if (topic) {
        setMessages((current) => [
          ...current,
          { id: makeId(), role: "assistant", topic },
        ]);
      } else {
        saveUnansweredQuestion(trimmed);
        setMessages((current) => [
          ...current,
          {
            id: makeId(),
            role: "assistant",
            topic: {
              id: `unanswered-${Date.now()}`,
              question: trimmed,
              shortLabel: "Question saved",
              keywords: [],
              steps: [
                "I don’t have a reliable answer for that yet.",
                "I’ve saved your question so School Manager GH support can improve this guide.",
                "Try asking about students, teachers, attendance, fees, reports, reminders, or settings.",
              ],
              relatedIds: ["support", "settings", "features"],
              contexts: [],
            },
          },
        ]);
      }
    }, 650);
  };

  const submitAIQuestion = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || thinking) return;

    const history: SchoolAssistantChatMessage[] = messages.map((message) =>
      message.role === "user"
        ? { role: "user", content: message.text }
        : { role: "assistant", content: message.topic.steps.join("\n") },
    );
    setMessages((current) => [
      ...current,
      { id: makeId(), role: "user", text: trimmed },
    ]);
    setQuery("");
    setThinking(true);

    try {
      const response = await askSchoolAssistant({
        message: trimmed,
        pathname: location.pathname,
        history,
      });
      setMessages((current) => [
        ...current,
        {
          id: makeId(),
          role: "assistant",
          topic: {
            id: `ai-${Date.now()}`,
            question: trimmed,
            shortLabel: "AI answer",
            keywords: [],
            steps: [response.answer],
            path: response.action?.path,
            actionLabel: response.action?.label,
            focusTarget: response.action?.target,
            relatedIds: [],
            contexts: [],
          },
        },
      ]);
    } catch {
      const topic = findAssistantTopic(trimmed);
      if (topic) {
        setMessages((current) => [
          ...current,
          { id: makeId(), role: "assistant", topic },
        ]);
      } else {
        saveUnansweredQuestion(trimmed);
        setMessages((current) => [
          ...current,
          {
            id: makeId(),
            role: "assistant",
            topic: {
              id: `unavailable-${Date.now()}`,
              question: trimmed,
              shortLabel: "Assistant unavailable",
              keywords: [],
              steps: [
                "I couldn’t reach the AI service and don’t have a reliable saved answer for that question yet. Please try again shortly.",
              ],
              relatedIds: ["support"],
              contexts: [],
            },
          },
        ]);
      }
    } finally {
      setThinking(false);
    }
  };

  const openTopic = (topic: SchoolAssistantTopic) => {
    submitAIQuestion(topic.question);
  };

  const handleNavigate = (topic: SchoolAssistantTopic) => {
    if (!topic.path) return;
    onClose();
    const focusTargets: Record<string, string> = {
      "add-student": "students-add",
      "edit-student": "students-list",
      "move-student": "students-list",
      "student-history": "student-history-search",
      "add-teacher": "teachers-add",
      "assign-teacher": "teachers-list",
      "teacher-login": "teachers-list",
      "record-attendance": "attendance-summary",
      "edit-attendance": "attendance-summary",
      "attendance-report": "attendance-summary",
      "teacher-attendance": "teacher-attendance",
      "create-report-card": "report-cards",
      "enter-scores": "academic-reports",
      "teacher-remarks": "report-cards",
      "academic-reports": "academic-reports",
      "create-fee": "fees-setup",
      "record-payment": "fees-record-payment",
      "unpaid-fees": "fees-outstanding",
      "fee-reminder": "sms-reminders",
      "payment-settings": "payment-settings",
      "sms-reminder": "sms-reminders",
      "parent-contact": "students-list",
      timetable: "timetable",
      payroll: "payroll",
      activity: "activity",
      backups: "backups",
      settings: "settings",
      billing: "billing",
      features: "billing",
    };
    const pathTargets: Record<string, string> = {
      "/admin/students": "students-list",
      "/admin/student-history": "student-history-search",
      "/admin/teachers": "teachers-list",
      "/admin/attendance": "attendance-summary",
      "/admin/teacher-attendance": "teacher-attendance",
      "/admin/reports": "academic-reports",
      "/admin/report-card": "report-cards",
      "/admin/fees": "fees-overview",
      "/admin/payment-settings": "payment-settings",
      "/admin/reminders": "sms-reminders",
      "/admin/timetable": "timetable",
      "/admin/payroll": "payroll",
      "/admin/activity": "activity",
      "/admin/backups": "backups",
      "/admin/settings": "settings",
      "/admin/billing": "billing",
    };
    navigate(topic.path, {
      state: {
        assistantGuide: {
          target:
            topic.focusTarget ||
            focusTargets[topic.id] ||
            pathTargets[topic.path],
        },
      },
    });
  };

  const handleFeedback = (messageId: string, value: "up" | "down") => {
    setFeedback((current) => ({ ...current, [messageId]: value }));
    showToast(
      value === "up"
        ? "Thanks! That answer was marked helpful."
        : "Thanks. We’ll use that feedback to improve the guide.",
      { type: "success" },
    );
  };

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label="Close School Assistant"
            className="fixed inset-0 z-[70] bg-slate-950/25 backdrop-blur-[1px] lg:bg-slate-950/10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="School Assistant"
            className="school-assistant-drawer fixed inset-y-0 right-0 z-[80] flex w-full flex-col border-l border-slate-200 bg-[#f8fbff] shadow-[-18px_0_55px_rgba(15,74,130,0.16)] sm:w-[440px]"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
          >
            <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#0B4A82] text-white shadow-sm">
                  <GraduationCap size={23} />
                </div>
                <div>
                  <h2 className="font-poppins text-lg font-bold text-slate-900">
                    School Assistant
                  </h2>
                  <p className="flex items-center gap-1.5 text-xs text-slate-500">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    Ready to help
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0B4A82]/30"
                aria-label="Close assistant"
              >
                <X size={21} />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              {messages.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.12 }}
                >
                  <div className="mb-6">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#0B4A82]">
                      Help for {pageLabel}
                    </p>
                    <h3 className="mt-2 font-poppins text-2xl font-bold leading-tight text-slate-900">
                      Need help with {pageLabel}?
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      Ask how to use School Manager GH, or choose a common question below.
                    </p>
                  </div>

                  <div className="space-y-2">
                    {suggestions.map((topic, index) => (
                      <motion.button
                        key={topic.id}
                        type="button"
                        onClick={() => openTopic(topic)}
                        className="group flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-left text-sm font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#0B4A82]/30"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.18 + index * 0.07 }}
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#0B4A82]">
                          <CircleHelp size={18} />
                        </span>
                        <span className="flex-1">{topic.question}</span>
                        <ChevronRight
                          size={17}
                          className="text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-[#0B4A82]"
                        />
                      </motion.button>
                    ))}
                  </div>

                  <div className="mt-7 border-t border-slate-200 pt-5">
                    <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                      <BookOpen size={17} className="text-[#0B4A82]" />
                      What I can help with
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {["Students", "Attendance", "Fees", "Reports", "Settings"].map(
                        (label) => (
                          <span
                            key={label}
                            className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200"
                          >
                            {label}
                          </span>
                        ),
                      )}
                    </div>
                  </div>
                </motion.div>
              ) : (
                <div className="space-y-5">
                  {messages.map((message) =>
                    message.role === "user" ? (
                      <motion.div
                        key={message.id}
                        className="ml-10 flex justify-end"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                      >
                        <div className="rounded-2xl rounded-br-md bg-[#0B4A82] px-4 py-3 text-sm leading-6 text-white shadow-sm">
                          {message.text}
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div
                        key={message.id}
                        className="flex gap-3"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                      >
                        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0B4A82] text-white">
                          <GraduationCap size={17} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="rounded-2xl rounded-tl-md border border-slate-200 bg-white p-4 shadow-sm">
                            {message.topic.id.startsWith("ai-") ? (
                              <div className="whitespace-pre-line text-sm leading-6 text-slate-700">
                                {message.topic.steps.join("\n")}
                              </div>
                            ) : (
                              <>
                                <p className="font-semibold text-slate-900">
                                  Here’s how:
                                </p>
                                <ol className="mt-3 space-y-2.5">
                                  {message.topic.steps.map((step, index) => (
                                    <li
                                      key={`${message.id}-${index}`}
                                      className="flex gap-3 text-sm leading-6 text-slate-600"
                                    >
                                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-[#0B4A82]">
                                        {index + 1}
                                      </span>
                                      <span>{step}</span>
                                    </li>
                                  ))}
                                </ol>
                              </>
                            )}
                            {message.topic.path ? (
                              <button
                                type="button"
                                onClick={() => handleNavigate(message.topic)}
                                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#0B4A82] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#083a67] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#0B4A82]/30"
                              >
                                {message.topic.actionLabel}
                                <ArrowRight size={16} />
                              </button>
                            ) : null}
                          </div>

                          <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
                            <span>Was this helpful?</span>
                            {feedback[message.id] ? (
                              <span className="ml-1 inline-flex items-center gap-1 font-medium text-emerald-600">
                                <Check size={14} /> Thanks
                              </span>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleFeedback(message.id, "up")}
                                  className="rounded-lg p-1.5 transition hover:bg-blue-50 hover:text-[#0B4A82]"
                                  aria-label="Mark answer helpful"
                                >
                                  <ThumbsUp size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleFeedback(message.id, "down")}
                                  className="rounded-lg p-1.5 transition hover:bg-blue-50 hover:text-[#0B4A82]"
                                  aria-label="Mark answer unhelpful"
                                >
                                  <ThumbsDown size={14} />
                                </button>
                              </>
                            )}
                          </div>

                          {message.topic.relatedIds.length > 0 ? (
                            <div className="mt-4 border-t border-slate-200 pt-3">
                              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                                Related questions
                              </p>
                              <div className="space-y-1">
                                {message.topic.relatedIds
                                  .map(getAssistantTopic)
                                  .filter(
                                    (topic): topic is SchoolAssistantTopic =>
                                      Boolean(topic),
                                  )
                                  .map((topic) => (
                                    <button
                                      key={topic.id}
                                      type="button"
                                      onClick={() => openTopic(topic)}
                                      className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm text-[#0B4A82] transition hover:bg-blue-50"
                                    >
                                      <span>{topic.question}</span>
                                      <ChevronRight size={15} />
                                    </button>
                                  ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </motion.div>
                    ),
                  )}

                  {thinking ? (
                    <motion.div
                      className="flex items-center gap-3"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0B4A82] text-white">
                        <GraduationCap size={17} />
                      </div>
                      <div className="flex gap-1 rounded-2xl rounded-tl-md border border-slate-200 bg-white px-4 py-3 shadow-sm">
                        {[0, 1, 2].map((item) => (
                          <motion.span
                            key={item}
                            className="h-2 w-2 rounded-full bg-[#0B4A82]"
                            animate={{ y: [0, -4, 0], opacity: [0.45, 1, 0.45] }}
                            transition={{
                              duration: 0.8,
                              repeat: Infinity,
                              delay: item * 0.12,
                            }}
                          />
                        ))}
                      </div>
                    </motion.div>
                  ) : null}
                  <div ref={endRef} />
                </div>
              )}
            </div>

            <footer className="border-t border-slate-200 bg-white p-4">
              {messages.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setMessages([])}
                  className="mb-2 text-xs font-medium text-slate-500 transition hover:text-[#0B4A82]"
                >
                  Start over
                </button>
              ) : null}
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  submitAIQuestion(query);
                }}
                className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 transition focus-within:border-blue-300 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-100"
              >
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Ask another question"
                  className="min-h-10 flex-1 bg-transparent px-2 text-sm text-slate-800 outline-none placeholder:text-slate-400"
                />
                <button
                  type="submit"
                  disabled={!query.trim() || thinking}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0B4A82] text-white shadow-sm transition hover:bg-[#083a67] disabled:cursor-not-allowed disabled:opacity-35"
                  aria-label="Send question"
                >
                  <Send size={17} />
                </button>
              </form>
              <p className="mt-2 text-center text-[11px] text-slate-400">
                Free help guide · Answers are based on School Manager GH features
              </p>
            </footer>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
};

export const SchoolAssistantLauncher: React.FC<{ onClick: () => void }> = ({
  onClick,
}) => (
  <motion.button
    type="button"
    onClick={onClick}
    aria-label="Open School Assistant"
    className="fixed bottom-5 right-5 z-[60] flex h-14 w-14 items-center justify-center rounded-full bg-[#0B4A82] text-white shadow-[0_12px_35px_rgba(11,74,130,0.35)] transition hover:bg-[#083a67] focus:outline-none focus:ring-4 focus:ring-blue-200 sm:bottom-7 sm:right-7 sm:h-16 sm:w-16"
    whileHover={{ scale: 1.06 }}
    whileTap={{ scale: 0.94 }}
    initial={{ scale: 0, opacity: 0 }}
    animate={{ scale: 1, opacity: 1 }}
    transition={{ type: "spring", stiffness: 330, damping: 22, delay: 0.25 }}
  >
    <motion.span
      className="absolute inset-0 rounded-full border border-blue-300/50"
      animate={{ scale: [1, 1.28], opacity: [0.6, 0] }}
      transition={{ duration: 2.2, repeat: Infinity, ease: "easeOut" }}
    />
    <MessageCircle size={26} />
  </motion.button>
);

export default SchoolAssistantDrawer;
