import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { firestore } from "./firebase";

export type AnalyticsEventType =
  | "USER_LOGIN"
  | "STUDENT_CREATED"
  | "TEACHER_CREATED"
  | "ATTENDANCE_MARKED"
  | "TEACHER_ATTENDANCE_MARKED"
  | "REPORT_GENERATED"
  | "ASSESSMENT_UPDATED";

export type AnalyticsEventPayload = {
  schoolId: string | null;
  actionType: AnalyticsEventType;
  userRole: string | null;
  userId: string | null;
  metadata?: Record<string, any> | null;
};

export const logAnalyticsEvent = async (payload: AnalyticsEventPayload) => {
  const { schoolId, actionType, userRole, userId, metadata } = payload;
  return addDoc(collection(firestore, "analyticsEvents"), {
    schoolId: schoolId || null,
    actionType,
    userRole: userRole || null,
    userId: userId || null,
    metadata: metadata || null,
    createdAt: serverTimestamp(),
  });
};

export const safeLogAnalyticsEvent = async (payload: AnalyticsEventPayload) => {
  try {
    await logAnalyticsEvent(payload);
  } catch (error) {
    console.warn("Failed to log analytics event", error);
  }
};

export default logAnalyticsEvent;
