import React, { useEffect, useState } from "react";
import { X } from "lucide-react";

type Toast = {
  id: number;
  message: string;
  type: "success" | "error" | "info";
  duration: number;
};

const ToastItem: React.FC<{ toast: Toast; onClose: (id: number) => void }> = ({
  toast,
  onClose,
}) => {
  useEffect(() => {
    const t = setTimeout(() => onClose(toast.id), toast.duration);
    return () => clearTimeout(t);
  }, [toast, onClose]);

  const colorClass =
    toast.type === "success"
      ? "bg-emerald-50 border-emerald-200 text-emerald-800"
      : toast.type === "error"
        ? "bg-red-50 border-red-200 text-red-800"
        : "bg-[#E6F0FA] border-[#E6F0FA] text-[#0B4A82]";

  return (
    <div
      className={`max-w-sm w-full px-4 py-3 rounded-lg border shadow-md ${colorClass} transform transition-all`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 text-sm leading-tight">{toast.message}</div>
        <button
          onClick={() => onClose(toast.id)}
          className="text-slate-400 hover:text-slate-600 ml-2"
          aria-label="Close notification"
        >
          <X size={14} />
        </button>
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
      const { message, type, duration } = e.detail || {};
      const id = nextId++;
      setToasts((prev) => [{ id, message, type, duration }, ...prev]);
    };

    window.addEventListener("app-toast", handler as EventListener);
    return () =>
      window.removeEventListener("app-toast", handler as EventListener);
  }, []);

  const handleClose = (id: number) =>
    setToasts((prev) => prev.filter((t) => t.id !== id));

  if (toasts.length === 0) return null;

  return (
    <div className="fixed right-4 top-20 z-60 flex flex-col gap-3">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onClose={handleClose} />
      ))}
    </div>
  );
};

export default ToastContainer;
