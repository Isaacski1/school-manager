import React, { useEffect, useState } from "react";
import Layout from "../../../components/Layout";
import { firestore } from "../../../services/firebase";
import {
  collection,
  getDocs,
  orderBy,
  query,
  updateDoc,
  doc,
} from "firebase/firestore";
import { SuspiciousEvent } from "../../../types";
import { showToast } from "../../../services/toast";

const SuspiciousEvents: React.FC = () => {
  const [events, setEvents] = useState<SuspiciousEvent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadEvents = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(
          query(
            collection(firestore, "suspiciousEvents"),
            orderBy("createdAt", "desc"),
          ),
        );
        setEvents(
          snap.docs.map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as SuspiciousEvent),
          })),
        );
      } finally {
        setLoading(false);
      }
    };
    loadEvents();
  }, []);

  const handleResolve = async (eventId: string) => {
    try {
      await updateDoc(doc(firestore, "suspiciousEvents", eventId), {
        status: "RESOLVED",
        resolvedAt: Date.now(),
      });
      setEvents((prev) =>
        prev.map((e) => (e.id === eventId ? { ...e, status: "RESOLVED" } : e)),
      );
      showToast("Event resolved.", { type: "success" });
    } catch (error: any) {
      showToast(error?.message || "Failed to resolve event.", {
        type: "error",
      });
    }
  };

  return (
    <Layout title="Suspicious Events">
      <div className="p-6 space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">
            Suspicious Events
          </h1>
          <p className="text-slate-600">
            Automatically flagged login anomalies and security alerts.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-slate-700 font-semibold">
                <tr>
                  <th className="px-6 py-4">Event</th>
                  <th className="px-6 py-4">Severity</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Created</th>
                  <th className="px-6 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td className="px-6 py-6" colSpan={5}>
                      Loading events...
                    </td>
                  </tr>
                ) : events.length === 0 ? (
                  <tr>
                    <td className="px-6 py-6" colSpan={5}>
                      No suspicious events.
                    </td>
                  </tr>
                ) : (
                  events.map((event) => (
                    <tr key={event.id}>
                      <td className="px-6 py-4">
                        <div className="text-slate-900 font-medium">
                          {event.eventType}
                        </div>
                        <div className="text-xs text-slate-500">
                          {event.userId || "—"}
                        </div>
                      </td>
                      <td className="px-6 py-4">{event.severity}</td>
                      <td className="px-6 py-4">{event.status}</td>
                      <td className="px-6 py-4">
                        {new Date(event.createdAt).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {event.status === "OPEN" && (
                          <button
                            onClick={() => handleResolve(event.id)}
                            className="text-xs text-emerald-600 hover:underline"
                          >
                            Resolve
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default SuspiciousEvents;
