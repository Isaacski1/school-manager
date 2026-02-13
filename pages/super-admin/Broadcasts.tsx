import React, { useEffect, useMemo, useState } from "react";
import Layout from "../../components/Layout";
import { showToast } from "../../services/toast";
import { firestore } from "../../services/firebase";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { PlatformBroadcast, School } from "../../types";

const Broadcasts: React.FC = () => {
  const [broadcasts, setBroadcasts] = useState<PlatformBroadcast[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [form, setForm] = useState({
    title: "",
    message: "",
    type: "GENERAL" as PlatformBroadcast["type"],
    priority: "NORMAL" as PlatformBroadcast["priority"],
    targetType: "ALL" as PlatformBroadcast["targetType"],
    targetSchoolIds: [] as string[],
    sendNow: true,
    publishAt: "",
    expiresAt: "",
    version: "",
    whatsNew: "",
    effectiveDate: "",
    maintenanceStart: "",
    maintenanceEnd: "",
    maintenanceDowntime: false,
  });

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [broadcastSnap, schoolsSnap] = await Promise.all([
          getDocs(
            query(
              collection(firestore, "platformBroadcasts"),
              orderBy("createdAt", "desc"),
            ),
          ),
          getDocs(collection(firestore, "schools")),
        ]);
        setBroadcasts(
          broadcastSnap.docs.map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as PlatformBroadcast),
          })),
        );
        setSchools(
          schoolsSnap.docs.map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as School),
          })),
        );
      } catch (error: any) {
        console.error("Failed to load broadcasts", error);
        showToast(error?.message || "Failed to load broadcasts.", {
          type: "error",
        });
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const filteredBroadcasts = useMemo(() => {
    return broadcasts.filter((b) => {
      const matchType =
        filterType === "all" || b.type.toLowerCase() === filterType;
      const matchStatus =
        filterStatus === "all" || b.status.toLowerCase() === filterStatus;
      return matchType && matchStatus;
    });
  }, [broadcasts, filterStatus, filterType]);

  const handleToggleSchool = (schoolId: string) => {
    setForm((prev) => {
      const next = prev.targetSchoolIds.includes(schoolId)
        ? prev.targetSchoolIds.filter((id) => id !== schoolId)
        : [...prev.targetSchoolIds, schoolId];
      return { ...prev, targetSchoolIds: next };
    });
  };

  const handleSubmit = async (status: PlatformBroadcast["status"]) => {
    if (!form.title.trim() || !form.message.trim()) {
      showToast("Title and message are required.", { type: "error" });
      return;
    }
    if (form.targetType === "SCHOOLS" && form.targetSchoolIds.length === 0) {
      showToast("Select at least one school.", { type: "error" });
      return;
    }

    const publishAt = form.sendNow
      ? Date.now()
      : form.publishAt
        ? new Date(form.publishAt).getTime()
        : null;
    const expiresAt = form.expiresAt
      ? new Date(form.expiresAt).getTime()
      : null;
    const maintenanceStart = form.maintenanceStart
      ? new Date(form.maintenanceStart).toISOString()
      : null;
    const maintenanceEnd = form.maintenanceEnd
      ? new Date(form.maintenanceEnd).toISOString()
      : null;

    try {
      const payload: Omit<PlatformBroadcast, "id"> = {
        title: form.title.trim(),
        message: form.message.trim(),
        type: form.type,
        priority: form.priority,
        targetType: form.targetType,
        targetSchoolIds:
          form.targetType === "SCHOOLS" ? form.targetSchoolIds : [],
        createdAt: Date.now(),
        createdBy: "super_admin",
        publishAt,
        expiresAt,
        status,
        ...(form.version ? { version: form.version } : {}),
        ...(form.whatsNew
          ? {
              whatsNew: form.whatsNew
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean),
            }
          : {}),
        ...(form.effectiveDate ? { effectiveDate: form.effectiveDate } : {}),
        ...(maintenanceStart ? { maintenanceStart } : {}),
        ...(maintenanceEnd ? { maintenanceEnd } : {}),
        ...(form.maintenanceDowntime
          ? { maintenanceDowntime: form.maintenanceDowntime }
          : {}),
      };

      const docRef = await addDoc(collection(firestore, "platformBroadcasts"), {
        ...payload,
      });
      setBroadcasts((prev) => [{ id: docRef.id, ...payload }, ...prev]);
      showToast("Broadcast saved.", { type: "success" });
      setForm((prev) => ({
        ...prev,
        title: "",
        message: "",
        targetSchoolIds: [],
        sendNow: true,
        publishAt: "",
        expiresAt: "",
        version: "",
        whatsNew: "",
        effectiveDate: "",
        maintenanceStart: "",
        maintenanceEnd: "",
        maintenanceDowntime: false,
      }));
    } catch (error: any) {
      console.error("Failed to save broadcast", error);
      showToast(error?.message || "Failed to save broadcast.", {
        type: "error",
      });
    }
  };

  const handlePublishNow = async (id: string) => {
    try {
      await updateDoc(doc(firestore, "platformBroadcasts", id), {
        status: "PUBLISHED",
        publishAt: Timestamp.now(),
      });
      setBroadcasts((prev) =>
        prev.map((b) =>
          b.id === id
            ? { ...b, status: "PUBLISHED", publishAt: Date.now() }
            : b,
        ),
      );
      showToast("Broadcast published.", { type: "success" });
    } catch (error: any) {
      console.error("Publish failed", error);
      showToast(error?.message || "Failed to publish broadcast.", {
        type: "error",
      });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(firestore, "platformBroadcasts", id));
      setBroadcasts((prev) => prev.filter((b) => b.id !== id));
      showToast("Broadcast deleted.", { type: "success" });
    } catch (error: any) {
      console.error("Delete failed", error);
      showToast(error?.message || "Failed to delete broadcast.", {
        type: "error",
      });
    }
  };

  return (
    <Layout title="Broadcast & Communication">
      <div className="p-6 space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">
            Broadcast & Communication
          </h1>
          <p className="text-slate-600">
            Send announcements to all schools or targeted schools.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
            <h2 className="text-lg font-semibold text-slate-800">
              New Broadcast
            </h2>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Title
              </label>
              <input
                className="w-full border border-slate-300 p-3 rounded-lg focus:ring-2 focus:ring-[#1160A8] focus:border-transparent outline-none"
                value={form.title}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder="Broadcast title"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Message
              </label>
              <textarea
                className="w-full border border-slate-300 p-3 rounded-lg focus:ring-2 focus:ring-[#1160A8] focus:border-transparent outline-none"
                rows={4}
                value={form.message}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, message: e.target.value }))
                }
                placeholder="Write your broadcast message"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Category/Type
                </label>
                <select
                  className="w-full border border-slate-300 p-3 rounded-lg"
                  value={form.type}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      type: e.target.value as PlatformBroadcast["type"],
                    }))
                  }
                >
                  <option value="GENERAL">General Announcement</option>
                  <option value="SYSTEM_UPDATE">System Update</option>
                  <option value="MAINTENANCE">Maintenance</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Priority
                </label>
                <select
                  className="w-full border border-slate-300 p-3 rounded-lg"
                  value={form.priority}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      priority: e.target.value as PlatformBroadcast["priority"],
                    }))
                  }
                >
                  <option value="NORMAL">Normal</option>
                  <option value="IMPORTANT">Important</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>
            </div>

            {form.type === "SYSTEM_UPDATE" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Version
                  </label>
                  <input
                    className="w-full border border-slate-300 p-3 rounded-lg"
                    value={form.version}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, version: e.target.value }))
                    }
                    placeholder="v1.2.0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Effective Date
                  </label>
                  <input
                    type="date"
                    className="w-full border border-slate-300 p-3 rounded-lg"
                    value={form.effectiveDate}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        effectiveDate: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    What’s New (one per line)
                  </label>
                  <textarea
                    className="w-full border border-slate-300 p-3 rounded-lg"
                    rows={3}
                    value={form.whatsNew}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, whatsNew: e.target.value }))
                    }
                    placeholder="- New reports\n- Improved dashboard"
                  />
                </div>
              </div>
            )}

            {form.type === "MAINTENANCE" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Maintenance Start
                  </label>
                  <input
                    type="datetime-local"
                    className="w-full border border-slate-300 p-3 rounded-lg"
                    value={form.maintenanceStart}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        maintenanceStart: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Maintenance End
                  </label>
                  <input
                    type="datetime-local"
                    className="w-full border border-slate-300 p-3 rounded-lg"
                    value={form.maintenanceEnd}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        maintenanceEnd: e.target.value,
                      }))
                    }
                  />
                </div>
                <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={form.maintenanceDowntime}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        maintenanceDowntime: e.target.checked,
                      }))
                    }
                  />
                  System will be unavailable
                </label>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Target
                </label>
                <select
                  className="w-full border border-slate-300 p-3 rounded-lg"
                  value={form.targetType}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      targetType: e.target
                        .value as PlatformBroadcast["targetType"],
                    }))
                  }
                >
                  <option value="ALL">All Schools</option>
                  <option value="SCHOOLS">Specific Schools</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Publish Options
                </label>
                <div className="flex items-center gap-3">
                  <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      checked={form.sendNow}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          sendNow: e.target.checked,
                        }))
                      }
                    />
                    Send now
                  </label>
                </div>
              </div>
            </div>

            {form.targetType === "SCHOOLS" && (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Target Schools
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-40 overflow-y-auto border border-slate-200 rounded-lg p-3">
                  {schools.map((school) => (
                    <label
                      key={school.id}
                      className="inline-flex items-center gap-2 text-sm text-slate-600"
                    >
                      <input
                        type="checkbox"
                        checked={form.targetSchoolIds.includes(school.id)}
                        onChange={() => handleToggleSchool(school.id)}
                      />
                      {school.name}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {!form.sendNow && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Schedule Publish
                  </label>
                  <input
                    type="datetime-local"
                    className="w-full border border-slate-300 p-3 rounded-lg"
                    value={form.publishAt}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        publishAt: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Expiry Date
                  </label>
                  <input
                    type="date"
                    className="w-full border border-slate-300 p-3 rounded-lg"
                    value={form.expiresAt}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        expiresAt: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() =>
                  handleSubmit(form.sendNow ? "PUBLISHED" : "SCHEDULED")
                }
                className="px-4 py-2 bg-[#0B4A82] text-white rounded-lg"
              >
                {form.sendNow ? "Publish Now" : "Schedule Broadcast"}
              </button>
              <button
                type="button"
                onClick={() => handleSubmit("DRAFT")}
                className="px-4 py-2 border border-slate-200 text-slate-700 rounded-lg"
              >
                Save Draft
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
            <h2 className="text-lg font-semibold text-slate-800">Filters</h2>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Type
              </label>
              <select
                className="w-full border border-slate-300 p-3 rounded-lg"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
              >
                <option value="all">All</option>
                <option value="general">Updates</option>
                <option value="system_update">System Updates</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Status
              </label>
              <select
                className="w-full border border-slate-300 p-3 rounded-lg"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="all">All</option>
                <option value="published">Published</option>
                <option value="scheduled">Scheduled</option>
                <option value="draft">Draft</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-800">Broadcasts</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-slate-700 font-semibold">
                <tr>
                  <th className="px-6 py-4">Title</th>
                  <th className="px-6 py-4">Type</th>
                  <th className="px-6 py-4">Target</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Created</th>
                  <th className="px-6 py-4">Expires</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-6 text-slate-500">
                      Loading broadcasts...
                    </td>
                  </tr>
                ) : filteredBroadcasts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-6 text-slate-500">
                      No broadcasts yet.
                    </td>
                  </tr>
                ) : (
                  filteredBroadcasts.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 font-medium text-slate-900">
                        {b.title}
                      </td>
                      <td className="px-6 py-4">{b.type}</td>
                      <td className="px-6 py-4">
                        {b.targetType === "ALL"
                          ? "All Schools"
                          : `${b.targetSchoolIds?.length || 0} school(s)`}
                      </td>
                      <td className="px-6 py-4">{b.status}</td>
                      <td className="px-6 py-4">
                        {b.createdAt
                          ? new Date(b.createdAt as any).toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="px-6 py-4">
                        {b.expiresAt
                          ? new Date(b.expiresAt as any).toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        {b.status !== "PUBLISHED" && (
                          <button
                            onClick={() => handlePublishNow(b.id)}
                            className="text-xs text-emerald-600 hover:underline"
                          >
                            Publish
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(b.id)}
                          className="text-xs text-red-600 hover:underline"
                        >
                          Delete
                        </button>
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

export default Broadcasts;
