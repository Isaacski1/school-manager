import React, { useState, useEffect } from "react";
import {
  X,
  Plus,
  Trash2,
  GripVertical,
  Save,
  ChevronDown,
  ChevronUp,
  Settings2,
  Globe,
  AlertCircle,
  CheckCircle2,
  Type,
  Hash,
  Calendar,
  List,
  CheckSquare,
  Upload,
  Wand2,
} from "lucide-react";
import type { AdmissionCustomField, AdmissionCustomSection, AdmissionCustomization } from "../../types";

interface FieldEditorModalProps {
  field?: AdmissionCustomField | null;
  sections: AdmissionCustomSection[];
  onSave: (field: AdmissionCustomField) => void;
  onClose: () => void;
}

const FIELD_TYPES = [
  { value: "text", label: "Text", icon: Type, color: "text-blue-600", bg: "bg-blue-50", description: "Single-line text input" },
  { value: "number", label: "Number", icon: Hash, color: "text-purple-600", bg: "bg-purple-50", description: "Numeric input" },
  { value: "date", label: "Date", icon: Calendar, color: "text-green-600", bg: "bg-green-50", description: "Date picker" },
  { value: "select", label: "Dropdown", icon: List, color: "text-amber-600", bg: "bg-amber-50", description: "Single selection from list" },
  { value: "multiselect", label: "Multi-select", icon: CheckSquare, color: "text-indigo-600", bg: "bg-indigo-50", description: "Multiple selections" },
  { value: "checkbox", label: "Checkbox", icon: CheckSquare, color: "text-emerald-600", bg: "bg-emerald-50", description: "Boolean yes/no" },
  { value: "file", label: "File Upload", icon: Upload, color: "text-rose-600", bg: "bg-rose-50", description: "Document or image upload" },
] as const;

const SUGGESTED_FIELDS: Record<string, Array<{ label: string; key: string; type: string; required?: boolean; regionSpecific?: boolean; region?: string[]; helpText?: string; options?: string[] }>> = {
  ghana_basic: [
    { label: "Region", key: "region", type: "select", required: true, regionSpecific: true, region: ["GH"], helpText: "Select the student's region" },
    { label: "Hometown", key: "homeTown", type: "text", required: false, regionSpecific: true, region: ["GH"] },
    { label: "Digital / GPS Address", key: "digitalAddress", type: "text", required: false, regionSpecific: true, region: ["GH"], helpText: "e.g. GA-123-4567" },
    { label: "Previous School Name", key: "previousSchool", type: "text", required: false, regionSpecific: true, region: ["GH"] },
    { label: "Residential Address", key: "residentialAddress", type: "text", required: false },
    { label: "Emergency Contact", key: "emergencyContact", type: "text", required: false, helpText: "Alternative contact number" },
  ],
  default: [
    { label: "Nationality", key: "nationality", type: "text", required: false },
    { label: "Place of Birth", key: "placeOfBirth", type: "text", required: false },
    { label: "Previous School", key: "previousSchool", type: "text", required: false },
    { label: "Reason for Leaving", key: "reasonForLeaving", type: "text", required: false },
  ],
};

const FieldEditorModal: React.FC<FieldEditorModalProps> = ({ field, sections, onSave, onClose }) => {
  const [formData, setFormData] = useState<Partial<AdmissionCustomField>>(
    field || {
      id: `field_${Date.now()}`,
      key: "",
      label: "",
      type: "text",
      required: false,
      regionSpecific: false,
      order: 1,
      section: sections[0]?.id || "personal",
      active: true,
    },
  );
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const selectedTypeInfo = FIELD_TYPES.find((t) => t.value === formData.type) || FIELD_TYPES[0];

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.label?.trim()) newErrors.label = "Label is required";
    if (!formData.key?.trim()) newErrors.key = "Field key is required";
    else if (!/^[a-z][a-z0-9_]*$/.test(formData.key)) newErrors.key = "Key must start with a letter and contain only lowercase letters, numbers, and underscores";
    if ((formData.type === "select" || formData.type === "multiselect") && (!formData.options || formData.options.length === 0)) {
      newErrors.options = "At least one option is required";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    onSave(formData as AdmissionCustomField);
  };

  const applySuggestion = (suggestion: typeof SUGGESTED_FIELDS[string][0]) => {
    setFormData({
      ...formData,
      label: suggestion.label,
      key: suggestion.key,
      type: suggestion.type as any,
      required: suggestion.required || false,
      regionSpecific: suggestion.regionSpecific || false,
      region: suggestion.region,
      helpText: suggestion.helpText,
      options: suggestion.options,
    });
    setShowSuggestions(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-800">
              {field ? "Edit Field" : "Add New Field"}
            </h3>
            <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
              Configure the field properties and behavior
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X size={18} className="text-slate-400" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Field Label <span className="text-red-500">*</span>
              </label>
              <input
                value={formData.label || ""}
                onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                placeholder="e.g., Region"
                className={`w-full border ${errors.label ? "border-red-300" : "border-slate-200"} p-2.5 rounded-xl bg-white text-slate-800 focus:ring-2 focus:ring-indigo-200 outline-none`}
              />
              {errors.label && <p className="text-xs text-red-600 mt-1">{errors.label}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Field Key <span className="text-red-500">*</span>
              </label>
              <input
                value={formData.key || ""}
                onChange={(e) => setFormData({ ...formData, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })}
                placeholder="e.g., region"
                className={`w-full border ${errors.key ? "border-red-300" : "border-slate-200"} p-2.5 rounded-xl bg-white text-slate-800 focus:ring-2 focus:ring-indigo-200 outline-none font-mono text-sm`}
              />
              {errors.key && <p className="text-xs text-red-600 mt-1">{errors.key}</p>}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-2">
              Field Type
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {FIELD_TYPES.map((typeInfo) => {
                const Icon = typeInfo.icon;
                const isSelected = formData.type === typeInfo.value;
                return (
                  <button
                    key={typeInfo.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, type: typeInfo.value as any })}
                    className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                      isSelected
                        ? "border-indigo-500 bg-indigo-50 shadow-md scale-[1.02]"
                        : "border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <div className={`p-2 rounded-lg ${isSelected ? typeInfo.bg : "bg-slate-100"}`}>
                      <Icon size={20} className={isSelected ? typeInfo.color : "text-slate-500"} />
                    </div>
                    <span className={`text-xs font-semibold ${isSelected ? "text-indigo-900" : "text-slate-700"}`}>
                      {typeInfo.label}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5">{selectedTypeInfo.description}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Section
              </label>
              <select
                value={formData.section}
                onChange={(e) => setFormData({ ...formData, section: e.target.value })}
                className="w-full border border-slate-200 p-2.5 rounded-xl bg-white text-slate-800 focus:ring-2 focus:ring-indigo-200 outline-none"
              >
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Placeholder Text
              </label>
              <input
                value={formData.placeholder || ""}
                onChange={(e) => setFormData({ ...formData, placeholder: e.target.value })}
                placeholder="e.g., Enter your region"
                className="w-full border border-slate-200 p-2.5 rounded-xl bg-white text-slate-800 focus:ring-2 focus:ring-indigo-200 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Help Text
            </label>
            <input
              value={formData.helpText || ""}
              onChange={(e) => setFormData({ ...formData, helpText: e.target.value })}
              placeholder="Optional hint shown below the field"
              className="w-full border border-slate-200 p-2.5 rounded-xl bg-white text-slate-800 focus:ring-2 focus:ring-indigo-200 outline-none"
            />
          </div>

          {(formData.type === "select" || formData.type === "multiselect") && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Options <span className="text-red-500">*</span>
              </label>
              <textarea
                value={(formData.options || []).join("\n")}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    options: e.target.value.split("\n").filter((opt) => opt.trim()),
                  })
                }
                placeholder="Enter one option per line"
                rows={4}
                className={`w-full border ${errors.options ? "border-red-300" : "border-slate-200"} p-2.5 rounded-xl bg-white text-slate-800 focus:ring-2 focus:ring-indigo-200 outline-none font-mono text-sm`}
              />
              {errors.options && <p className="text-xs text-red-600 mt-1">{errors.options}</p>}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-700">Required Field</p>
                <p className="text-[11px] text-slate-500">Mark this field as mandatory</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.required || false}
                  onChange={(e) => setFormData({ ...formData, required: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-700">Region Specific</p>
                <p className="text-[11px] text-slate-500">Show only for specific regions</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.regionSpecific || false}
                  onChange={(e) => setFormData({ ...formData, regionSpecific: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>
          </div>

          {formData.regionSpecific && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Regions
              </label>
              <input
                value={(formData.region || []).join(", ")}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    region: e.target.value.split(",").map((r) => r.trim()).filter(Boolean),
                  })
                }
                placeholder="e.g., GH, NG, KE"
                className="w-full border border-slate-200 p-2.5 rounded-xl bg-white text-slate-800 focus:ring-2 focus:ring-indigo-200 outline-none"
              />
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-slate-100 px-4 sm:px-6 py-3 sm:py-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2"
          >
            <CheckCircle2 size={16} />
            Save Field
          </button>
        </div>
      </div>
    </div>
  );
};

export default FieldEditorModal;
