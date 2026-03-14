import React from "react";
import { X } from "lucide-react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  className = "",
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
      <div
        className={`bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col ${className}`}
      >
        {(title || onClose) && (
          <div className="p-4 sm:p-6 border-b border-slate-100 flex items-start justify-between gap-3 bg-slate-50">
            {title && (
              <h2 className="min-w-0 flex-1 text-lg sm:text-xl font-bold text-slate-900 leading-tight break-words">
                {title}
              </h2>
            )}
            {onClose && (
              <button
                onClick={onClose}
                className="shrink-0 text-slate-400 hover:text-slate-700 transition-colors bg-white p-2 rounded-full shadow-sm hover:shadow"
              >
                <X size={20} />
              </button>
            )}
          </div>
        )}
        <div className="p-4 sm:p-6 flex-1">{children}</div>
      </div>
    </div>
  );
};

export default Modal;
