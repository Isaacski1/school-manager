import type { AdmissionCustomization, AdmissionCustomField, AdmissionCustomSection } from "../types";

export const DEFAULT_ADMISSION_SECTIONS: AdmissionCustomSection[] = [
  { id: "personal", title: "Personal Information", order: 1, collapsible: false, visible: true },
  { id: "guardian", title: "Guardian / Parent Information", order: 2, collapsible: false, visible: true },
  { id: "academic", title: "Academic Background", order: 3, collapsible: true, visible: true },
  { id: "health", title: "Health Information", order: 4, collapsible: true, visible: true },
];

const DEFAULT_FIELDS: AdmissionCustomField[] = [
  {
    id: "field_full_name",
    key: "fullName",
    label: "Student Full Name",
    type: "text",
    required: true,
    regionSpecific: false,
    order: 1,
    section: "personal",
    active: true,
  },
  {
    id: "field_gender",
    key: "gender",
    label: "Gender",
    type: "select",
    required: true,
    regionSpecific: false,
    options: ["Male", "Female"],
    order: 2,
    section: "personal",
    active: true,
  },
  {
    id: "field_dob",
    key: "dob",
    label: "Date of Birth",
    type: "date",
    required: true,
    regionSpecific: false,
    order: 3,
    section: "personal",
    active: true,
  },
];

const GHANA_BASIC_FIELDS: AdmissionCustomField[] = [
  ...DEFAULT_FIELDS,
  {
    id: "field_region",
    key: "region",
    label: "Region",
    type: "select",
    required: true,
    regionSpecific: true,
    region: ["GH"],
    options: [
      "Greater Accra",
      "Ashanti",
      "Western",
      "Central",
      "Volta",
      "Eastern",
      "Northern",
      "Upper East",
      "Upper West",
      "Savannah",
      "North East",
      "Ahafo",
      "Bono",
      "Bono East",
      "Oti",
      "Western North",
    ],
    order: 4,
    section: "personal",
    active: true,
  },
  {
    id: "field_home_town",
    key: "homeTown",
    label: "Hometown",
    type: "text",
    required: false,
    regionSpecific: true,
    region: ["GH"],
    order: 5,
    section: "personal",
    active: true,
  },
  {
    id: "field_digital_address",
    key: "digitalAddress",
    label: "Digital / GPS Address",
    type: "text",
    required: false,
    regionSpecific: true,
    region: ["GH"],
    order: 6,
    section: "personal",
    active: true,
  },
  {
    id: "field_previous_school",
    key: "previousSchool",
    label: "Previous School Name",
    type: "text",
    required: false,
    regionSpecific: true,
    region: ["GH"],
    order: 7,
    section: "academic",
    active: true,
  },
  {
    id: "field_guardian_name",
    key: "guardianName",
    label: "Guardian Full Name",
    type: "text",
    required: true,
    regionSpecific: false,
    order: 1,
    section: "guardian",
    active: true,
  },
  {
    id: "field_guardian_phone",
    key: "guardianPhone",
    label: "Guardian Phone Number",
    type: "text",
    required: true,
    regionSpecific: false,
    order: 2,
    section: "guardian",
    active: true,
  },
  {
    id: "field_guardian_occupation",
    key: "guardianOccupation",
    label: "Guardian Occupation",
    type: "text",
    required: false,
    regionSpecific: false,
    order: 3,
    section: "guardian",
    active: true,
  },
];

export const DEFAULT_ADMISSION_CUSTOMIZATION: AdmissionCustomization = {
  preset: "default",
  sections: DEFAULT_ADMISSION_SECTIONS,
  fields: DEFAULT_FIELDS,
};

export const ADMISSION_PRESETS: Record<string, AdmissionCustomization> = {
  default: {
    preset: "default",
    sections: DEFAULT_ADMISSION_SECTIONS,
    fields: DEFAULT_FIELDS,
  },
  ghana_basic: {
    preset: "ghana_basic",
    sections: DEFAULT_ADMISSION_SECTIONS,
    fields: GHANA_BASIC_FIELDS,
  },
  custom: {
    preset: "custom",
    sections: DEFAULT_ADMISSION_SECTIONS,
    fields: [],
  },
};

export const resolveAdmissionCustomization = (
  value?: Partial<AdmissionCustomization> | null,
): AdmissionCustomization => {
  const source = value || {};
  const presetKey = source.preset || DEFAULT_ADMISSION_CUSTOMIZATION.preset;
  const preset = ADMISSION_PRESETS[presetKey];
  if (preset) {
    return {
      ...preset,
      fields: source.fields?.length ? source.fields : preset.fields,
      sections: source.sections?.length ? source.sections : preset.sections,
      updatedAt: source.updatedAt,
    };
  }
  return {
    preset: presetKey,
    sections: source.sections?.length ? source.sections : DEFAULT_ADMISSION_CUSTOMIZATION.sections,
    fields: source.fields?.length ? source.fields : DEFAULT_ADMISSION_CUSTOMIZATION.fields,
    updatedAt: source.updatedAt,
  };
};
