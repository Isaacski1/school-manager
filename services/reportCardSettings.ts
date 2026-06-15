import type { ReportCardSettings } from "../types";

export const DEFAULT_REPORT_CARD_SETTINGS: ReportCardSettings = {
  title: "Terminal Report Card",
  template: "classic",
  primaryColor: "#1160A8",
  accentColor: "#dbeafe",
  headerStyle: "plain",
  logoPosition: "left",
  showSchoolLogo: true,
  showWatermarkLogo: true,
  showStudentPhoto: true,
  showPosition: true,
  showAttendance: true,
  showSkills: true,
  showClassTeacherRemark: true,
  showHeadTeacherRemark: true,
  showGradingScale: false,
  showPromotionStatus: true,
  classTeacherSignatureLabel: "Class Teacher",
  headTeacherSignatureLabel: "Head Teacher",
  stampLabel: "Stamp",
};

export const resolveReportCardSettings = (
  value?: Partial<ReportCardSettings> | null,
): ReportCardSettings => ({
  ...DEFAULT_REPORT_CARD_SETTINGS,
  ...(value || {}),
  title: value?.title?.trim() || DEFAULT_REPORT_CARD_SETTINGS.title,
  primaryColor:
    value?.primaryColor?.trim() || DEFAULT_REPORT_CARD_SETTINGS.primaryColor,
  accentColor:
    value?.accentColor?.trim() || DEFAULT_REPORT_CARD_SETTINGS.accentColor,
  classTeacherSignatureLabel:
    value?.classTeacherSignatureLabel?.trim() ||
    DEFAULT_REPORT_CARD_SETTINGS.classTeacherSignatureLabel,
  headTeacherSignatureLabel:
    value?.headTeacherSignatureLabel?.trim() ||
    DEFAULT_REPORT_CARD_SETTINGS.headTeacherSignatureLabel,
  stampLabel:
    value?.stampLabel?.trim() || DEFAULT_REPORT_CARD_SETTINGS.stampLabel,
});
