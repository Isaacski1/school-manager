import React, { useEffect, useState } from "react";
import { X, User, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { Student } from "../types";

interface DuplicateAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingStudent: Student | null;
  attemptedName: string;
  attemptedClass?: string;
}

const DuplicateAlertModal: React.FC<DuplicateAlertModalProps> = ({
  isOpen,
  onClose,
  existingStudent,
  attemptedName,
  attemptedClass,
}) => {
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setAnimate(false);
      // Trigger animation on next frame
      const timer = setTimeout(() => setAnimate(true), 10);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isOpen || !existingStudent) return null;

  const classLabel =
    attemptedClass ||
    (existingStudent as any).className ||
    existingStudent.classId ||
    "N/A";

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm transition-opacity duration-300 ${
        isOpen ? "opacity-100" : "opacity-0"
      }`}
    >
      <div
        className={`w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl transition-all duration-300 ease-out ${
          animate ? "scale-100 translate-y-0" : "scale-95 translate-y-4"
        }`}
      >
        {/* Header with gradient */}
        <div className="relative bg-gradient-to-br from-amber-500 via-orange-500 to-amber-600 px-6 py-8 text-white">
          <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute -bottom-6 -left-6 h-24 w-24 rounded-full bg-white/5 blur-xl" />
          <div className="relative flex flex-col items-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm animate-pulse">
              <AlertCircle size={32} className="text-white" />
            </div>
            <h2 className="text-xl font-bold">Student Already Exists</h2>
            <p className="mt-1 text-sm text-white/90">
              This student is already enrolled in the system
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-6">
          <div className="mb-5 rounded-xl bg-amber-50 border border-amber-200 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-100">
                <User size={20} className="text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-amber-900 truncate">
                  {existingStudent.name}
                </p>
                <p className="mt-0.5 text-xs text-amber-700">
                  Already enrolled in {classLabel}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2 text-slate-600">
              <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" />
              <span><strong>Name:</strong> {existingStudent.name}</span>
            </div>
            {existingStudent.dob && (
              <div className="flex items-center gap-2 text-slate-600">
                <Clock size={16} className="text-slate-400 flex-shrink-0" />
                <span><strong>Date of Birth:</strong> {existingStudent.dob}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-slate-600">
              <User size={16} className="text-slate-400 flex-shrink-0" />
              <span><strong>Class:</strong> {classLabel}</span>
            </div>
            {existingStudent.fatherPhone && (
              <div className="flex items-center gap-2 text-slate-600">
                <span className="ml-5"><strong>Parent Phone:</strong> {existingStudent.fatherPhone}</span>
              </div>
            )}
          </div>

          <div className="mt-5 rounded-lg bg-slate-50 border border-slate-200 p-3">
            <p className="text-xs text-slate-600">
              <strong className="text-slate-800">No duplicate was created.</strong> The student{" "}
              <strong>{existingStudent.name}</strong> is already in the school database.
              You can search for them to update their information instead of creating a new record.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Close
          </button>
          <button
            onClick={() => {
              onClose();
              // Optionally navigate to the existing student's page
              window.location.href = `/admin/students?search=${encodeURIComponent(existingStudent.name)}`;
            }}
            className="flex-1 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-700"
          >
            View Student
          </button>
        </div>
      </div>
    </div>
  );
};

export default DuplicateAlertModal;