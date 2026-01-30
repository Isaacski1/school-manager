import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { firestore } from "./firebase";

export type ActivityEvent = {
  schoolId: string | null;
  actorUid: string | null;
  actorRole: string | null;
  eventType: string;
  entityId?: string | null;
  meta?: Record<string, any> | null;
};

export const logActivity = async (event: ActivityEvent) => {
  try {
    const docRef = await addDoc(collection(firestore, "activity_logs"), {
      schoolId: event.schoolId || null,
      actorUid: event.actorUid || null,
      actorRole: event.actorRole || null,
      eventType: event.eventType,
      entityId: event.entityId || null,
      meta: event.meta || null,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (err) {
    console.error("Failed to log activity", err);
    throw err;
  }
};

export default logActivity;
