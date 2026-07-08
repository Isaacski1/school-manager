import React, { useEffect, useMemo, useRef, useState } from "react";
import Layout from "../../components/Layout";
import { showToast } from "../../services/toast";
import { firestore } from "../../services/firebase";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import {
  CalendarDays,
  Download,
  MessageSquare,
  Phone,
  Plus,
  Search,
  Trash2,
} from "lucide-react";

type OutreachStatus =
  | "not_contacted"
  | "contacted"
  | "demo_scheduled"
  | "demo_done"
  | "signed_up"
  | "not_interested";

type OutreachSchool = {
  id: string;
  name: string;
  phone: string;
  location: string;
  contactName: string;
  status: OutreachStatus;
  followup: string;
  notes: string;
  createdAt: number;
  updatedAt: number;
};

const STORAGE_KEY = "school_manager_gh_outreach_tracker_v1";
const COLLECTION_NAME = "outreachSchools";

const STATUS_META: Record<
  OutreachStatus,
  { label: string; tone: string; rank: number }
> = {
  not_contacted: {
    label: "Not contacted",
    tone: "bg-slate-100 text-slate-700",
    rank: 0,
  },
  contacted: {
    label: "Contacted",
    tone: "bg-blue-50 text-blue-700",
    rank: 1,
  },
  demo_scheduled: {
    label: "Demo scheduled",
    tone: "bg-amber-50 text-amber-700",
    rank: 2,
  },
  demo_done: {
    label: "Demo done",
    tone: "bg-violet-50 text-violet-700",
    rank: 3,
  },
  signed_up: {
    label: "Signed up",
    tone: "bg-emerald-50 text-emerald-700",
    rank: 4,
  },
  not_interested: {
    label: "Not interested",
    tone: "bg-red-50 text-red-700",
    rank: 5,
  },
};

const EMPTY_FORM = {
  name: "",
  phone: "",
  location: "",
  contactName: "",
  status: "not_contacted" as OutreachStatus,
  followup: "",
  notes: "",
};

const formatDate = (value: string) => {
  if (!value) return "No follow-up";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const normalizePhone = (value: string) => value.replace(/[^\d+]/g, "");

const makeId = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const csvEscape = (value: string | number) =>
  `"${String(value ?? "").replace(/"/g, '""')}"`;

const toMillis = (value: any) => {
  if (!value) return Date.now();
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? Date.now() : parsed;
};

const toFirestorePayload = (
  school: Omit<OutreachSchool, "id" | "createdAt" | "updatedAt">,
) => ({
  name: school.name,
  phone: school.phone,
  location: school.location,
  contactName: school.contactName,
  status: school.status,
  followup: school.followup,
  notes: school.notes,
});

const OutreachTracker: React.FC = () => {
  const [schools, setSchools] = useState<OutreachSchool[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | OutreachStatus>(
    "all",
  );
  const [loading, setLoading] = useState(true);
  const [syncError, setSyncError] = useState("");
  const migratedLocalRef = useRef(false);

  useEffect(() => {
    const localSchools = (() => {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return [] as OutreachSchool[];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as OutreachSchool[]) : [];
      } catch (error) {
        console.warn("Failed to load outreach tracker data", error);
        return [] as OutreachSchool[];
      }
    })();
    if (localSchools.length > 0) setSchools(localSchools);

    const unsubscribe = onSnapshot(
      collection(firestore, COLLECTION_NAME),
      async (snapshot) => {
        setSyncError("");
        const firebaseSchools = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            name: String(data.name || ""),
            phone: String(data.phone || ""),
            location: String(data.location || ""),
            contactName: String(data.contactName || ""),
            status: (data.status || "not_contacted") as OutreachStatus,
            followup: String(data.followup || ""),
            notes: String(data.notes || ""),
            createdAt: toMillis(data.createdAt),
            updatedAt: toMillis(data.updatedAt),
          };
        });

        if (
          firebaseSchools.length === 0 &&
          localSchools.length > 0 &&
          !migratedLocalRef.current
        ) {
          migratedLocalRef.current = true;
          try {
            const batch = writeBatch(firestore);
            localSchools.forEach((school) => {
              const ref = doc(collection(firestore, COLLECTION_NAME));
              batch.set(ref, {
                ...toFirestorePayload(school),
                createdAt: Timestamp.fromMillis(school.createdAt || Date.now()),
                updatedAt: Timestamp.fromMillis(school.updatedAt || Date.now()),
                migratedFromLocal: true,
              });
            });
            await batch.commit();
            showToast("Local outreach tracker records synced to Firebase.", {
              type: "success",
            });
          } catch (error: any) {
            console.error("Failed to migrate local outreach records", error);
            setSyncError(
              error?.message ||
                "Could not sync local outreach records to Firebase.",
            );
          }
          setLoading(false);
          return;
        }

        setSchools(firebaseSchools);
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(firebaseSchools),
        );
        setLoading(false);
      },
      (error) => {
        console.error("Failed to sync outreach tracker", error);
        setSyncError(error.message || "Failed to sync outreach tracker.");
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(schools));
    } catch {
      // Firebase remains the source of truth if local cache is unavailable.
    }
  }, [schools]);

  const stats = useMemo(() => {
    return schools.reduce(
      (acc, school) => {
        acc.total += 1;
        if (school.status !== "not_contacted") acc.contacted += 1;
        if (["demo_scheduled", "demo_done"].includes(school.status)) {
          acc.demoStage += 1;
        }
        if (school.status === "signed_up") acc.signedUp += 1;

        const todayKey = new Date().toISOString().slice(0, 10);
        if (
          school.followup &&
          school.followup <= todayKey &&
          !["signed_up", "not_interested"].includes(school.status)
        ) {
          acc.dueToday += 1;
        }
        return acc;
      },
      { total: 0, contacted: 0, demoStage: 0, signedUp: 0, dueToday: 0 },
    );
  }, [schools]);

  const filteredSchools = useMemo(() => {
    const search = query.trim().toLowerCase();
    return [...schools]
      .filter((school) => {
        const matchesStatus =
          statusFilter === "all" || school.status === statusFilter;
        const searchable = [
          school.name,
          school.phone,
          school.location,
          school.contactName,
          school.notes,
        ]
          .join(" ")
          .toLowerCase();
        return matchesStatus && (!search || searchable.includes(search));
      })
      .sort((left, right) => {
        const leftFollowup = left.followup || "9999-12-31";
        const rightFollowup = right.followup || "9999-12-31";
        if (leftFollowup !== rightFollowup) {
          return leftFollowup.localeCompare(rightFollowup);
        }
        return STATUS_META[right.status].rank - STATUS_META[left.status].rank;
      });
  }, [query, schools, statusFilter]);

  const updateForm = (key: keyof typeof EMPTY_FORM, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleAddSchool = (event: React.FormEvent) => {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) {
      showToast("Enter the school name before adding it.", { type: "warning" });
      return;
    }

    const payload = {
      name,
      phone: form.phone.trim(),
      location: form.location.trim(),
      contactName: form.contactName.trim(),
      status: form.status,
      followup: form.followup,
      notes: form.notes.trim(),
    };

    addDoc(collection(firestore, COLLECTION_NAME), {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
      .then(() => {
        setForm(EMPTY_FORM);
        showToast(`${name} added to outreach tracker.`, { type: "success" });
      })
      .catch((error: any) => {
        console.error("Failed to add outreach school", error);
        const now = Date.now();
        setSchools((current) => [
          {
            id: makeId(),
            ...payload,
            createdAt: now,
            updatedAt: now,
          },
          ...current,
        ]);
        setForm(EMPTY_FORM);
        showToast(
          "Saved locally, but Firebase sync failed. Check your connection or Firestore rules.",
          { type: "warning" },
        );
      });
  };

  const updateSchool = (
    id: string,
    updates: Partial<Omit<OutreachSchool, "id" | "createdAt">>,
  ) => {
    setSchools((current) =>
      current.map((school) =>
        school.id === id
          ? { ...school, ...updates, updatedAt: Date.now() }
          : school,
      ),
    );
    updateDoc(doc(firestore, COLLECTION_NAME, id), {
      ...updates,
      updatedAt: serverTimestamp(),
    }).catch((error) => {
      console.error("Failed to update outreach school", error);
      showToast("Could not sync that update to Firebase.", { type: "error" });
    });
  };

  const removeSchool = (id: string) => {
    setSchools((current) => current.filter((school) => school.id !== id));
    deleteDoc(doc(firestore, COLLECTION_NAME, id)).catch((error) => {
      console.error("Failed to delete outreach school", error);
      showToast("Could not delete that school from Firebase.", {
        type: "error",
      });
    });
  };

  const exportCsv = () => {
    const rows = [
      [
        "School",
        "Phone",
        "Location",
        "Contact",
        "Status",
        "Follow up",
        "Notes",
      ],
      ...filteredSchools.map((school) => [
        school.name,
        school.phone,
        school.location,
        school.contactName,
        STATUS_META[school.status].label,
        school.followup,
        school.notes,
      ]),
    ];
    const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `school-manager-gh-outreach-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Layout title="Outreach Tracker">
      <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#0B4A82]">
              School Manager GH
            </p>
            <h1 className="mt-2 text-2xl font-bold text-slate-950 sm:text-3xl">
              Outreach Tracker
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Track schools you contact, demo progress, next follow-up dates,
              and conversion into signed-up clients.
            </p>
            <p className="mt-2 text-xs font-semibold text-slate-500">
              {loading
                ? "Syncing outreach records from Firebase..."
                : syncError
                  ? "Firebase sync needs attention. Showing cached records where available."
                  : "Synced with Firebase."}
            </p>
          </div>
          <button
            type="button"
            onClick={exportCsv}
            disabled={filteredSchools.length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Download size={17} />
            Export CSV
          </button>
        </div>

        {syncError ? (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            {syncError}
          </div>
        ) : null}

        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ["Total schools", stats.total],
            ["Contacted", stats.contacted],
            ["Demo stage", stats.demoStage],
            ["Signed up", stats.signedUp],
            ["Follow-up due", stats.dueToday],
          ].map(([label, value]) => (
            <div
              key={String(label)}
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="text-2xl font-bold text-slate-950">{value}</div>
              <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {label}
              </div>
            </div>
          ))}
        </div>

        <form
          onSubmit={handleAddSchool}
          className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr]">
            <input
              value={form.name}
              onChange={(event) => updateForm("name", event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-[#0B4A82] focus:ring-2 focus:ring-[#0B4A82]/15"
              placeholder="School name"
            />
            <input
              value={form.phone}
              onChange={(event) => updateForm("phone", event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-[#0B4A82] focus:ring-2 focus:ring-[#0B4A82]/15"
              placeholder="Phone number"
            />
            <select
              value={form.status}
              onChange={(event) =>
                updateForm("status", event.target.value as OutreachStatus)
              }
              className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-[#0B4A82] focus:ring-2 focus:ring-[#0B4A82]/15"
            >
              {Object.entries(STATUS_META).map(([status, meta]) => (
                <option key={status} value={status}>
                  {meta.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1fr_1fr]">
            <input
              value={form.location}
              onChange={(event) => updateForm("location", event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-[#0B4A82] focus:ring-2 focus:ring-[#0B4A82]/15"
              placeholder="Town / area"
            />
            <input
              value={form.contactName}
              onChange={(event) =>
                updateForm("contactName", event.target.value)
              }
              className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-[#0B4A82] focus:ring-2 focus:ring-[#0B4A82]/15"
              placeholder="Contact person"
            />
            <input
              type="date"
              value={form.followup}
              onChange={(event) => updateForm("followup", event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-[#0B4A82] focus:ring-2 focus:ring-[#0B4A82]/15"
            />
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto]">
            <input
              value={form.notes}
              onChange={(event) => updateForm("notes", event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-[#0B4A82] focus:ring-2 focus:ring-[#0B4A82]/15"
              placeholder="Notes, next action, best time to call"
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#0B4A82] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#083a66]"
            >
              <Plus size={17} />
              Add school
            </button>
          </div>
        </form>

        <div className="mb-4 flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm lg:flex-row">
          <label className="relative flex-1">
            <Search
              size={17}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full rounded-lg border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-[#0B4A82] focus:ring-2 focus:ring-[#0B4A82]/15"
              placeholder="Search school, location, contact, notes"
            />
          </label>
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as "all" | OutreachStatus)
            }
            className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-[#0B4A82] focus:ring-2 focus:ring-[#0B4A82]/15"
          >
            <option value="all">All statuses</option>
            {Object.entries(STATUS_META).map(([status, meta]) => (
              <option key={status} value={status}>
                {meta.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-3">
          {filteredSchools.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              No schools match this view yet.
            </div>
          ) : (
            filteredSchools.map((school) => {
              const phone = normalizePhone(school.phone);
              const whatsappPhone = phone.startsWith("+")
                ? phone.slice(1)
                : phone.startsWith("0")
                  ? `233${phone.slice(1)}`
                  : phone;
              return (
                <article
                  key={school.id}
                  className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-base font-bold text-slate-950">
                          {school.name}
                        </h2>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_META[school.status].tone}`}
                        >
                          {STATUS_META[school.status].label}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                        {school.contactName ? (
                          <span>{school.contactName}</span>
                        ) : null}
                        {school.location ? <span>{school.location}</span> : null}
                        {school.phone ? <span>{school.phone}</span> : null}
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays size={15} />
                          {formatDate(school.followup)}
                        </span>
                      </div>
                      {school.notes ? (
                        <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">
                          {school.notes}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                      <select
                        value={school.status}
                        onChange={(event) =>
                          updateSchool(school.id, {
                            status: event.target.value as OutreachStatus,
                          })
                        }
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-[#0B4A82] focus:ring-2 focus:ring-[#0B4A82]/15"
                      >
                        {Object.entries(STATUS_META).map(([status, meta]) => (
                          <option key={status} value={status}>
                            {meta.label}
                          </option>
                        ))}
                      </select>
                      {phone ? (
                        <a
                          href={`tel:${phone}`}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-100"
                          title="Call"
                        >
                          <Phone size={17} />
                        </a>
                      ) : null}
                      {whatsappPhone ? (
                        <a
                          href={`https://wa.me/${whatsappPhone}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-200 text-emerald-700 transition hover:bg-emerald-50"
                          title="WhatsApp"
                        >
                          <MessageSquare size={17} />
                        </a>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => removeSchool(school.id)}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-red-200 text-red-600 transition hover:bg-red-50"
                        title="Delete"
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>
    </Layout>
  );
};

export default OutreachTracker;
