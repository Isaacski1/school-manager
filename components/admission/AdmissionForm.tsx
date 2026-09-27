import React, { useMemo } from "react";
import { HelpCircle, AlertCircle, CheckCircle2 } from "lucide-react";
import type { AdmissionCustomField, AdmissionCustomization } from "../../types";

interface AdmissionFormProps {
  customization: AdmissionCustomization;
  values: Record<string, any>;
  onChange: (key: string, value: any) => void;
  errors?: Record<string, string>;
}

const FIELD_ICONS: Record<string, string> = {
  text: "📝",
  number: "🔢",
  date: "📅",
  select: "📋",
  multiselect: "☑️",
  checkbox: "✅",
  file: "📎",
};

const FIELD_COMPONENTS: Record<
  string,
  React.FC<{ field: AdmissionCustomField; value: any; onChange: (value: any) => void; error?: string }>
> = {
  text: ({ field, value, onChange, error }) => (
    <input
      type="text"
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder}
      className={`w-full border ${error ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"} p-2.5 rounded-xl focus:ring-2 focus:ring-indigo-200 outline-none text-sm transition-colors`}
    />
  ),
  number: ({ field, value, onChange, error }) => (
    <input
      type="number"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder}
      className={`w-full border ${error ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"} p-2.5 rounded-xl focus:ring-2 focus:ring-indigo-200 outline-none text-sm transition-colors`}
    />
  ),
  date: ({ field, value, onChange }) => (
    <input
      type="date"
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      className="w-full border border-slate-200 bg-white p-2.5 rounded-xl focus:ring-2 focus:ring-indigo-200 outline-none text-sm transition-colors"
    />
  ),
  select: ({ field, value, onChange }) => (
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      className="w-full border border-slate-200 bg-white p-2.5 rounded-xl focus:ring-2 focus:ring-indigo-200 outline-none text-sm transition-colors"
    >
      <option value="">Select an option</option>
      {(field.options || []).map((option) => (
        <option key={option} value={option}>{option}</option>
      ))}
    </select>
  ),
  multiselect: ({ field, value, onChange }) => {
    const selected = Array.isArray(value) ? value : [];
    const toggle = (option: string) => {
      const next = selected.includes(option)
        ? selected.filter((item) => item !== option)
        : [...selected, option];
      onChange(next);
    };
    return (
      <div className="flex flex-wrap gap-2">
        {(field.options || []).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => toggle(option)}
            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
              selected.includes(option)
                ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                : "bg-white text-slate-700 border-slate-300 hover:border-indigo-400 hover:bg-indigo-50"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    );
  },
  checkbox: ({ field, value, onChange }) => (
    <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
      <div className="relative">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only peer"
        />
        <div className="w-5 h-5 border-2 border-slate-300 rounded peer-checked:bg-indigo-600 peer-checked:border-indigo-600 transition-all"></div>
        <svg
          className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 text-white pointer-events-none transition-opacity ${value ? "opacity-100" : "opacity-0"}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      {field.helpText || "Yes"}
    </label>
  ),
  file: ({ field, value, onChange }) => (
    <div className="space-y-2">
      <input
        type="file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = () => onChange(reader.result);
            reader.readAsDataURL(file);
          }
        }}
        className="w-full border border-slate-200 p-2.5 rounded-xl text-sm text-slate-700 bg-white"
      />
      {value && (
        <div className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg">
          <CheckCircle2 size={14} />
          File uploaded
        </div>
      )}
    </div>
  ),
};

const evaluateCondition = (field: AdmissionCustomField, values: Record<string, any>): boolean => {
  if (!field.conditionalShow) return true;
  const { fieldKey, operator, value: conditionValue } = field.conditionalShow;
  const fieldValue = values[fieldKey];
  if (operator === "equals") return fieldValue === conditionValue;
  if (operator === "not_equals") return fieldValue !== conditionValue;
  if (operator === "contains") return String(fieldValue || "").includes(conditionValue);
  return true;
};

const AdmissionForm: React.FC<AdmissionFormProps> = ({ customization, values, onChange, errors }) => {
  const grouped = useMemo(() => {
    const map = new Map<string, AdmissionCustomField[]>();
    (customization.fields || [])
      .filter((field) => field.active)
      .sort((a, b) => a.order - b.order)
      .forEach((field) => {
        const list = map.get(field.section) || [];
        list.push(field);
        map.set(field.section, list);
      });
    return map;
  }, [customization.fields]);

  const visibleSections = useMemo(() => {
    return (customization.sections || [])
      .filter((section) => section.visible)
      .sort((a, b) => a.order - b.order);
  }, [customization.sections]);

  if (visibleSections.length === 0 || grouped.size === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-slate-500">No additional fields configured for this form.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {visibleSections.map((section) => {
        const fields = grouped.get(section.id) || [];
        if (fields.length === 0) return null;
        return (
          <div key={section.id} className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                {section.title}
              </h4>
              <span className="text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                {fields.length}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {fields.map((field) => {
                if (!evaluateCondition(field, values)) return null;
                const FieldComponent = FIELD_COMPONENTS[field.type] || FIELD_COMPONENTS.text;
                return (
                  <div key={field.id} className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                      <span>{FIELD_ICONS[field.type] || "📄"}</span>
                      {field.label}
                      {field.required && <span className="text-red-500 ml-0.5">*</span>}
                    </label>
                    {field.helpText && (
                      <p className="text-[11px] text-slate-500 flex items-center gap-1">
                        <HelpCircle size={10} />
                        {field.helpText}
                      </p>
                    )}
                    <FieldComponent
                      field={field}
                      value={values[field.key]}
                      onChange={(value) => onChange(field.key, value)}
                      error={errors?.[field.key]}
                    />
                    {errors?.[field.key] && (
                      <p className="text-xs text-red-600 flex items-center gap-1">
                        <AlertCircle size={10} />
                        {errors[field.key]}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default AdmissionForm;
