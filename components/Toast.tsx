import React, { useEffect, useState } from "react";
import { X, AlertCircle, User, CheckCircle2 } from "lucide-react";

type Toast = {
  id: number;
  message: string;
  type: "success" | "error" | "info" | "warning" | "duplicate";
  duration: number;
  title?: string;
  description?: string;
};

const ToastItem: React.FC<{ toast: Toast; onClose: (id: number) => void }> = ({
  toast,
  onClose,
}) => {
  useEffect(() => {
    const t = setTimeout(() => onClose(toast.id), toast.duration);
    return () => clearTimeout(t);
  }, [toast, onClose]);

  const getToastConfig = () => {
    switch (toast.type) {
      case "success":
        return {
          bg: "bg-emerald-50",
          border: "border-emerald-200",
          text: "text-emerald-800",
          icon: <CheckCircle2 size={18} className="text-emerald-500" />,
          iconBg: "bg-emerald-100",
        };
      case "error":
        return {
          bg: "bg-red-50",
          border: "border-red-200",
          text: "text-red-800",
          icon: <AlertCircle size={18} className="text-red-500" />,
          iconBg: "bg-red-100",
        };
      case "duplicate":
        return {
          bg: "bg-amber-50",
          border: "border-amber-200",
          text: "text-amber-800",
          icon: <User size={18} className="text-amber-500" />,
          iconBg: "bg-amber-100",
        };
      case "warning":
        return {
          bg: "bg-orange-50",
          border: "border-orange-200",
          text: "text-orange-800",
          icon: <AlertCircle size={18} className="text-orange-500" />,
          iconBg: "bg-orange-100",
        };
      default:
        return {
          bg: "bg-[#E6F0FA]",
          border: "border-[#E6F0FA]",
          text: "text-[#0B4A82]",
          icon: <AlertCircle size={18} className="text-[#0B4A82]" />,
          iconBg: "bg-[#E6F0FA]",
        };
    }
  };

  const config = getToastConfig();

  return (
    <div
      className={`max-w-sm w-full rounded-xl border shadow-lg ${config.bg} ${config.border} ${config.text} transform transition-all duration-300 ease-out animate-slide-in-right hover:shadow-xl`}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={`flex-shrink-0 w-8 h-8 rounded-full ${config.iconBg} flex items-center justify-center`}>
            {config.icon}
          </div>
          <div className="flex-1 min-w-0">
            {toast.title ? (
              <h4 className="font-semibold text-sm mb-1">{toast.title}</h4>
            ) : null}
            <p className="text-sm leading-tight">{toast.message}</p>
            {toast.description ? (
              <p className="text-xs mt-1 opacity-80">{toast.description}</p>
            ) : null}
          </div>
          <button
            onClick={() => onClose(toast.id)}
            className="text-slate-400 hover:text-slate-600 ml-2 flex-shrink-0"
            aria-label="Close notification"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      {/* Progress bar */}
      <div className="h-1 bg-black/5 rounded-b-xl overflow-hidden">
        <div
          className="h-full bg-current opacity-50 transition-all ease-linear"
          style={{ width: "100%", animation: `shrink ${toast.duration}ms linear forwards` }}
        />
      </div>
    </div>
  );
};

const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => {
    let nextId = 1;
    const handler = (e: Event) => {
      // @ts-ignore
      const { message, type, duration, title, description } = e.detail || {};
      const id = nextId++;
      setToasts((prev) => [{ id, message, type, duration, title, description }, ...prev]);
    };

    window.addEventListener("app-toast", handler as EventListener);
    return () =>
      window.removeEventListener("app-toast", handler as EventListener);
  }, []);

  const handleClose = (id: number) =>
    setToasts((prev) => prev.filter((t) => t.id !== id));

  if (toasts.length === 0) return null;

  return (
    <div className="fixed right-4 top-20 z-[9999] flex flex-col gap-3">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onClose={handleClose} />
      ))}
    </div>
  );
};

export default ToastContainer;
