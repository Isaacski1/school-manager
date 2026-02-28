import { addDoc, collection, doc, serverTimestamp } from "firebase/firestore";
import { firestore } from "./firebase";

export type ActivityEvent = {
  schoolId: string | null;
  actorUid: string | null;
  actorRole: string | null;
  eventType: string;
  entityId?: string | null;
  meta?: Record<string, any> | null;
};

const resolveUserName = (event: ActivityEvent) => {
  return (
    event.meta?.actorName ||
    event.meta?.userName ||
    event.meta?.studentName ||
    event.meta?.teacherName ||
    event.meta?.adminName ||
    event.meta?.name ||
    event.meta?.email ||
    null
  );
};

const resolveModule = (event: ActivityEvent) => {
  return (
    event.meta?.module ||
    event.meta?.page ||
    event.meta?.entity ||
    event.meta?.collection ||
    event.meta?.context ||
    null
  );
};

const resolveDescription = (event: ActivityEvent) => {
  return (
    event.meta?.description ||
    event.meta?.details ||
    event.meta?.reason ||
    event.meta?.note ||
    null
  );
};

const resolveStatus = (event: ActivityEvent) => {
  const raw = String(
    event.meta?.status ||
      event.meta?.result ||
      event.meta?.outcome ||
      "success",
  )
    .toLowerCase()
    .trim();
  if (["failed", "error", "denied"].includes(raw)) return "error";
  if (["warning", "warn", "partial"].includes(raw)) return "warning";
  return "success";
};

export const logActivity = async (event: ActivityEvent) => {
  try {
    if (!event.schoolId) {
      throw new Error("Missing schoolId for activity log");
    }
    const docRef = await addDoc(
      collection(doc(firestore, "schools", event.schoolId), "activityLogs"),
      {
        schoolId: event.schoolId,
        userId: event.actorUid || null,
        userName: resolveUserName(event),
        role: event.actorRole || null,
        actionType: event.eventType,
        module: resolveModule(event),
        description: resolveDescription(event),
        status: resolveStatus(event),
        timestamp: serverTimestamp(),
        metadata: event.meta || null,
        entityId: event.entityId || null,
      },
    );
    return docRef.id;
  } catch (err) {
    console.error("Failed to log activity", err);
    throw err;
  }
};

export default logActivity;
