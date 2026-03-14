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
import {
  Building2,
  CheckCircle2,
  Clock3,
  Filter,
  Globe2,
  Info,
  Megaphone,
  RadioTower,
  Save,
  Send,
  Sparkles,
  Trash2,
  Wrench,
} from "lucide-react";

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

  const metrics = useMemo(() => {
    const published = broadcasts.filter((b) => b.status === "PUBLISHED").length;
    const scheduled = broadcasts.filter((b) => b.status === "SCHEDULED").length;
    const draft = broadcasts.filter((b) => b.status === "DRAFT").length;
    return {
      total: broadcasts.length,
      published,
      scheduled,
      draft,
    };
  }, [broadcasts]);

  const toMillis = (
    value?: Date | number | string | Timestamp | null,
  ): number | null => {
    if (!value) return null;
    if (typeof value === "number") return value;
    if (value instanceof Date) return value.getTime();
    if (value instanceof Timestamp) return value.toMillis();
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? null : parsed;
  };

  const formatDate = (value?: Date | number | string | Timestamp | null) => {
    const millis = toMillis(value);
    if (!millis) return "-";
    return new Date(millis).toLocaleString();
  };

  const statusBadgeClass = (status: PlatformBroadcast["status"]) => {
    if (status === "PUBLISHED") {
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    }
    if (status === "SCHEDULED") {
      return "border-amber-200 bg-amber-50 text-amber-700";
    }
    return "border-slate-200 bg-slate-100 text-slate-700";
  };

  const typeBadgeClass = (type: PlatformBroadcast["type"]) => {
    if (type === "MAINTENANCE") {
      return "border-rose-200 bg-rose-50 text-rose-700";
    }
    if (type === "SYSTEM_UPDATE") {
      return "border-cyan-200 bg-cyan-50 text-cyan-700";
    }
    return "border-indigo-200 bg-indigo-50 text-indigo-700";
  };

  const priorityBadgeClass = (priority: PlatformBroadcast["priority"]) => {
    if (priority === "CRITICAL") {
      return "border-rose-200 bg-rose-50 text-rose-700";
    }
    if (priority === "IMPORTANT") {
      return "border-amber-200 bg-amber-50 text-amber-700";
    }
    return "border-slate-200 bg-slate-100 text-slate-700";
  };

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
      <div className="mx-auto max-w-7xl p-3 space-y-6 sm:p-6">
        <div className="relative overflow-hidden rounded-3xl border border-cyan-100 bg-gradient-to-br from-cyan-50 via-white to-indigo-50 p-4 shadow-sm sm:p-6 lg:p-8">
          <div className="absolute -top-24 -right-16 h-48 w-48 rounded-full bg-cyan-200/30 blur-3xl" />
          <div className="absolute -bottom-20 -left-16 h-44 w-44 rounded-full bg-indigo-200/30 blur-3xl" />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-white/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">
                <RadioTower size={14} />
                Super Admin Signal Center
              </div>
              <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
                Broadcast and Communication
              </h1>
              <p className="max-w-2xl text-sm text-slate-600 sm:text-base">
                Send updates, maintenance alerts, and urgent notices to all
                schools or selected campuses.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                {
                  label: "Total",
                  value: metrics.total,
                  tone: "bg-slate-900 text-white",
                },
                {
                  label: "Published",
                  value: metrics.published,
                  tone: "bg-emerald-600 text-white",
                },
                {
                  label: "Scheduled",
                  value: metrics.scheduled,
                  tone: "bg-amber-500 text-white",
                },
                {
                  label: "Drafts",
                  value: metrics.draft,
                  tone: "bg-indigo-600 text-white",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className={`rounded-2xl px-3 py-2 shadow-sm ${item.tone}`}
                >
                  <p className="text-[10px] uppercase tracking-wider text-white/80">
                    {item.label}
                  </p>
                  <p className="mt-1 text-xl font-bold leading-none">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
          <div className="bg-white rounded-3xl border border-slate-200 p-4 shadow-sm space-y-4 sm:p-6">
            <div className="mb-6 flex flex-col gap-2 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 sm:text-xl">
                  New Broadcast
                </h2>
                <p className="text-sm text-slate-500">
                  Compose, target, and publish announcements with precision.
                </p>
              </div>
              <div className="inline-flex w-fit items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
                <Sparkles size={14} className="text-cyan-600" />
                Live composer
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Title
              </label>
              <input
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
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
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
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
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
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
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
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
              <div className="rounded-2xl border border-cyan-200 bg-cyan-50/50 p-4">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-white px-3 py-1 text-xs font-semibold text-cyan-700">
                  <Info size={14} />
                  System update details
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Version
                  </label>
                  <input
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
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
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
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
                    What's New (one per line)
                  </label>
                  <textarea
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                    rows={3}
                    value={form.whatsNew}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, whatsNew: e.target.value }))
                    }
                    placeholder="- New reports\n- Improved dashboard"
                  />
                </div>
              </div>
              </div>
            )}

            {form.type === "MAINTENANCE" && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-4">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-rose-200 bg-white px-3 py-1 text-xs font-semibold text-rose-700">
                  <Wrench size={14} />
                  Maintenance window
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Maintenance Start
                  </label>
                  <input
                    type="datetime-local"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
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
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                    value={form.maintenanceEnd}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        maintenanceEnd: e.target.value,
                      }))
                    }
                  />
                </div>
                <label className="md:col-span-2 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
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
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Target
                </label>
                <select
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
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
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Publish Options
                </label>
                <div className="flex items-center gap-3">
                  <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
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
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Target Schools
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto border border-slate-200 rounded-xl bg-slate-50 p-3">
                  {schools.map((school) => (
                    <label
                      key={school.id}
                      className="inline-flex items-center gap-2 rounded-lg bg-white px-2.5 py-2 text-sm text-slate-700"
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
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
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
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
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

            <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() =>
                  handleSubmit(form.sendNow ? "PUBLISHED" : "SCHEDULED")
                }
                className="inline-flex w-full sm:w-auto items-center justify-center gap-2 px-4 py-2.5 bg-[#0B4A82] text-white rounded-xl transition hover:bg-[#083860]"
              >
                <Send size={16} />
                {form.sendNow ? "Publish Now" : "Schedule Broadcast"}
              </button>
              <button
                type="button"
                onClick={() => handleSubmit("DRAFT")}
                className="inline-flex w-full sm:w-auto items-center justify-center gap-2 px-4 py-2.5 border border-slate-300 bg-white text-slate-700 rounded-xl transition hover:bg-slate-50"
              >
                <Save size={16} />
                Save Draft
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
                <Filter size={18} className="text-cyan-600" />
                Filter Broadcasts
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Type
                  </label>
                  <select
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
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
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                  >
                    <option value="all">All</option>
                    <option value="published">Published</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="draft">Draft</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFilterType("all");
                    setFilterStatus("all");
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  Clear Filters
                </button>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-cyan-50 p-4 shadow-sm sm:p-6">
              <h3 className="mb-4 text-base font-semibold text-slate-900">
                Delivery Snapshot
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <span className="inline-flex items-center gap-2 text-sm text-slate-600">
                    <Globe2 size={14} className="text-indigo-600" />
                    All schools
                  </span>
                  <span className="text-sm font-semibold text-slate-900">
                    {broadcasts.filter((b) => b.targetType === "ALL").length}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <span className="inline-flex items-center gap-2 text-sm text-slate-600">
                    <Building2 size={14} className="text-cyan-600" />
                    Targeted schools
                  </span>
                  <span className="text-sm font-semibold text-slate-900">
                    {broadcasts.filter((b) => b.targetType === "SCHOOLS").length}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <span className="inline-flex items-center gap-2 text-sm text-slate-600">
                    <Clock3 size={14} className="text-amber-600" />
                    Upcoming sends
                  </span>
                  <span className="text-sm font-semibold text-slate-900">
                    {metrics.scheduled}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Broadcast History
              </h2>
              <p className="text-sm text-slate-500">
                {filteredBroadcasts.length} item
                {filteredBroadcasts.length === 1 ? "" : "s"} match your filters.
              </p>
            </div>
          </div>
          {loading ? (
            <div className="space-y-3 p-4 sm:p-6">
              {Array.from({ length: 4 }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-24 rounded-2xl border border-slate-200 bg-slate-50/70"
                />
              ))}
            </div>
          ) : filteredBroadcasts.length === 0 ? (
            <div className="p-8 text-center">
              <Megaphone className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-600">
                No broadcasts found.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-3 p-4 lg:hidden">
                {filteredBroadcasts.map((b) => (
                  <article
                    key={b.id}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-semibold text-slate-900">
                          {b.title}
                        </h3>
                        <p className="mt-1 text-xs text-slate-500">
                          {b.targetType === "ALL"
                            ? "All Schools"
                            : `${b.targetSchoolIds?.length || 0} school(s)`}
                        </p>
                      </div>
                      <span
                        className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusBadgeClass(
                          b.status,
                        )}`}
                      >
                        {b.status}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${typeBadgeClass(
                          b.type,
                        )}`}
                      >
                        {b.type}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${priorityBadgeClass(
                          b.priority,
                        )}`}
                      >
                        {b.priority}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-500">
                      <p>Created: {formatDate(b.createdAt as any)}</p>
                      <p>Expires: {formatDate(b.expiresAt as any)}</p>
                    </div>

                    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                      {b.status !== "PUBLISHED" && (
                        <button
                          onClick={() => handlePublishNow(b.id)}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 sm:w-auto"
                        >
                          <CheckCircle2 size={14} />
                          Publish
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(b.id)}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 sm:w-auto"
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
              </div>

              <div className="overflow-x-auto hidden lg:block">
                <table className="w-full text-left text-sm text-slate-600">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-700 font-semibold">
                    <tr>
                      <th className="px-6 py-4">Title</th>
                      <th className="px-6 py-4">Type</th>
                      <th className="px-6 py-4">Priority</th>
                      <th className="px-6 py-4">Target</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Created</th>
                      <th className="px-6 py-4">Expires</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredBroadcasts.map((b) => (
                      <tr key={b.id} className="hover:bg-slate-50/80">
                        <td className="px-6 py-4 font-medium text-slate-900">
                          {b.title}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${typeBadgeClass(
                              b.type,
                            )}`}
                          >
                            {b.type}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${priorityBadgeClass(
                              b.priority,
                            )}`}
                          >
                            {b.priority}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {b.targetType === "ALL"
                            ? "All Schools"
                            : `${b.targetSchoolIds?.length || 0} school(s)`}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusBadgeClass(
                              b.status,
                            )}`}
                          >
                            {b.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">{formatDate(b.createdAt as any)}</td>
                        <td className="px-6 py-4">{formatDate(b.expiresAt as any)}</td>
                        <td className="px-6 py-4 text-right">
                          <div className="inline-flex items-center justify-end gap-3">
                            {b.status !== "PUBLISHED" && (
                              <button
                                onClick={() => handlePublishNow(b.id)}
                                className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
                              >
                                Publish
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(b.id)}
                              className="text-xs font-semibold text-rose-600 hover:text-rose-700"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default Broadcasts;
