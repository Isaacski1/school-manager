import { School, User, UserRole } from "../types";

export type FeatureKey =
  | "admin_dashboard"
  | "teacher_dashboard"
  | "student_management"
  | "teacher_management"
  | "class_subject_management"
  | "attendance"
  | "teacher_attendance"
  | "basic_exam_reports"
  | "academic_year"
  | "basic_analytics"
  | "billing"
  | "fees_payments"
  | "backups"
  | "activity_monitor"
  | "student_history"
  | "timetable";

export type FeaturePlan = "starter" | "standard";

export const PLAN_FEATURES: Record<FeaturePlan, FeatureKey[]> = {
  starter: [
    "admin_dashboard",
    "teacher_dashboard",
    "student_management",
    "teacher_management",
    "class_subject_management",
    "attendance",
    "teacher_attendance",
    "basic_exam_reports",
    "academic_year",
    "basic_analytics",
    "billing",
  ],
  standard: [
    "admin_dashboard",
    "teacher_dashboard",
    "student_management",
    "teacher_management",
    "class_subject_management",
    "attendance",
    "teacher_attendance",
    "basic_exam_reports",
    "academic_year",
    "basic_analytics",
    "billing",
    "fees_payments",
    "backups",
    "activity_monitor",
    "student_history",
    "timetable",
  ],
};

export const DEFAULT_FEATURE_PLAN: FeaturePlan = "starter";

export const resolveFeaturePlan = (school?: School | null): FeaturePlan => {
  const plan = (school as any)?.featurePlan as FeaturePlan | undefined;
  return plan && plan in PLAN_FEATURES ? plan : DEFAULT_FEATURE_PLAN;
};

export const hasFeature = (
  schoolPlan: FeaturePlan | undefined,
  featureName: FeatureKey,
): boolean => {
  if (!schoolPlan) return false;
  const allowed = PLAN_FEATURES[schoolPlan] || [];
  return allowed.includes(featureName);
};

export const canAccessFeature = (
  user: User | null,
  school: School | null | undefined,
  featureName: FeatureKey,
): boolean => {
  if (!user) return false;
  if (user.role === UserRole.SUPER_ADMIN) return true;
  const plan = resolveFeaturePlan(school);
  return hasFeature(plan, featureName);
};

export const requireFeatureAccess = (
  user: User | null,
  school: School | null | undefined,
  featureName: FeatureKey,
): void => {
  if (!canAccessFeature(user, school, featureName)) {
    throw new Error("FEATURE_ACCESS_DENIED");
  }
};
