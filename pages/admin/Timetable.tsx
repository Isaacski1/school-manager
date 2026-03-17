import React, { useState, useEffect } from "react";
import Layout from "../../components/Layout";
import { CLASSES_LIST } from "../../constants";
import { db } from "../../services/mockDb";
import { TimeSlot, ClassTimetable } from "../../types";
import {
  Save,
  Plus,
  Trash2,
  Clock,
  Coffee,
  Sparkles,
  DoorOpen,
  Users,
} from "lucide-react";
import { showToast } from "../../services/toast";
import { useAuth } from "../../context/AuthContext";
import { requireSchoolId } from "../../services/authProfile";
import { logActivity } from "../../services/activityLog";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const BUILT_IN_SLOT_TYPES = [
  { value: "arrival", label: "Arrival & Free Play" },
  { value: "assembly", label: "Morning Assembly" },
  { value: "lesson", label: "Lesson" },
  { value: "break", label: "Break" },
  { value: "snack", label: "Snack" },
  { value: "lunch", label: "Lunch" },
  { value: "worship", label: "Worship/Devotion" },
  { value: "games", label: "Games/Sports" },
  { value: "clubs", label: "Clubs/Activities" },
  { value: "cleaning", label: "Clean Up" },
  { value: "nap", label: "Nap Time" },
  { value: "closing", label: "Closing" },
] as const;
const BUILT_IN_SLOT_TYPE_SET: ReadonlySet<string> = new Set<string>(
  BUILT_IN_SLOT_TYPES.map((entry) => entry.value),
);
const DEFAULT_SUBJECT_BY_TYPE: Record<string, string> = {
  arrival: "Arrival & Free Play",
  assembly: "Assembly",
  lesson: "",
  break: "Break",
  snack: "Snack",
  lunch: "Lunch",
  worship: "Worship",
  games: "Games",
  clubs: "Clubs/Activities",
  cleaning: "Clean Up",
  nap: "Nap Time",
  closing: "Closing",
};
const getSlotTypeLabel = (type: string) => {
  const builtIn = BUILT_IN_SLOT_TYPES.find((entry) => entry.value === type);
  if (builtIn) return builtIn.label;
  return type
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};
const normalizeCustomType = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const Timetable = () => {
  const { user } = useAuth();
  const schoolId = requireSchoolId(user);
  const [selectedClass, setSelectedClass] = useState(CLASSES_LIST[0].id);
  const [timetable, setTimetable] = useState<Record<string, TimeSlot[]>>({});
  const [loading, setLoading] = useState(false);
  const [activeDay, setActiveDay] = useState(DAYS[0]);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [customTypes, setCustomTypes] = useState<string[]>([]);
  const [customTypeInput, setCustomTypeInput] = useState("");

  // Form State for new slot
  const [newSlot, setNewSlot] = useState<Partial<TimeSlot>>({
    startTime: "08:00",
    endTime: "09:00",
    subject: "",
    type: "lesson",
  });

  useEffect(() => {
    const loadDataForClass = async () => {
      setLoading(true);

      // 1. Fetch subjects from system settings for selected class
      const currentSubjects = await db.getSubjects(schoolId, selectedClass);

      setSubjects(currentSubjects);
      if (currentSubjects.length > 0) {
        setNewSlot((prev) => ({
          ...prev,
          subject: currentSubjects[0],
          type: "lesson",
        }));
      } else {
        setNewSlot((prev) => ({ ...prev, subject: "", type: "lesson" }));
      }

      // 2. Fetch timetable
      const data = await db.getTimetable(schoolId, selectedClass);

      const schedule = data?.schedule || {};
      DAYS.forEach((day) => {
        if (!schedule[day]) schedule[day] = [];
      });
      const customTypesFromSlots = Object.values(schedule)
        .flatMap((slots) => slots.map((slot) => slot.type))
        .filter((type) => type && !BUILT_IN_SLOT_TYPE_SET.has(type));
      const customTypesFromSavedList = (data?.customTypes || []).filter(
        (type) => type && !BUILT_IN_SLOT_TYPE_SET.has(type),
      );
      const mergedCustomTypes = Array.from(
        new Set([...customTypesFromSavedList, ...customTypesFromSlots]),
      ).sort((a, b) => getSlotTypeLabel(a).localeCompare(getSlotTypeLabel(b)));
      setCustomTypes(mergedCustomTypes);
      setCustomTypeInput("");

      // Reset subjects in existing timetable slots to match system settings
      let hasChanges = false;
      if (currentSubjects.length > 0) {
        Object.keys(schedule).forEach((day) => {
          schedule[day].forEach((slot: TimeSlot) => {
            if (
              slot.type === "lesson" &&
              !currentSubjects.includes(slot.subject)
            ) {
              slot.subject = currentSubjects[0];
              hasChanges = true;
            }
          });
        });
      }

      // If changes were made, save the updated timetable
      if (hasChanges) {
        const updatedData: ClassTimetable = {
          schoolId,
          classId: selectedClass,
          schedule: schedule,
        };
        await db.saveTimetable(updatedData);
        showToast("Timetable subjects updated to match system settings!", {
          type: "success",
        });
        await logActivity({
          schoolId,
          actorUid: user?.id || null,
          actorRole: user?.role || null,
          eventType: "timetable_synced",
          entityId: selectedClass,
          meta: {
            status: "success",
            module: "Timetable",
            classId: selectedClass,
            actorName: user?.fullName || "",
          },
        });
      }

      setTimetable(schedule);
      setLoading(false);
    };

    loadDataForClass();
  }, [selectedClass, schoolId]);

  const setSlotType = (type: string) => {
    const subject =
      type === "lesson"
        ? subjects[0] || ""
        : DEFAULT_SUBJECT_BY_TYPE[type] || getSlotTypeLabel(type);
    setNewSlot((prev) => ({ ...prev, type, subject }));
  };

  const handleAddCustomType = () => {
    const normalized = normalizeCustomType(customTypeInput);
    if (!normalized) {
      showToast("Enter a custom type name first.", { type: "error" });
      return;
    }
    if (BUILT_IN_SLOT_TYPE_SET.has(normalized)) {
      showToast("That type already exists in built-in options.", {
        type: "info",
      });
      setSlotType(normalized);
      setCustomTypeInput("");
      return;
    }
    if (customTypes.includes(normalized)) {
      showToast("Custom type already exists.", { type: "info" });
      setSlotType(normalized);
      setCustomTypeInput("");
      return;
    }

    const nextCustomTypes = [...customTypes, normalized].sort((a, b) =>
      getSlotTypeLabel(a).localeCompare(getSlotTypeLabel(b)),
    );
    setCustomTypes(nextCustomTypes);
    setSlotType(normalized);
    setCustomTypeInput("");
    showToast(`Added custom type: ${getSlotTypeLabel(normalized)}`, {
      type: "success",
    });
  };

  const getCustomTypeUsageCount = (type: string) =>
    Object.values(timetable).reduce(
      (count, daySlots) => count + daySlots.filter((slot) => slot.type === type).length,
      0,
    );

  const handleDeleteCustomType = (typeToDelete: string) => {
    const usageCount = getCustomTypeUsageCount(typeToDelete);
    if (usageCount > 0) {
      showToast(
        `Cannot delete ${getSlotTypeLabel(typeToDelete)}. It is used in ${usageCount} slot${usageCount > 1 ? "s" : ""}.`,
        { type: "error" },
      );
      return;
    }

    setCustomTypes((prev) => prev.filter((type) => type !== typeToDelete));
    if (newSlot.type === typeToDelete) {
      setSlotType("lesson");
    }
    showToast(`Removed custom type: ${getSlotTypeLabel(typeToDelete)}`, {
      type: "success",
    });
  };

  const handleAddSlot = () => {
    if (!newSlot.startTime || !newSlot.endTime || !newSlot.subject) return;
    if (newSlot.startTime >= newSlot.endTime) {
      showToast("End time must be after start time", { type: "error" });
      return;
    }
    const slotType = newSlot.type || "lesson";

    const slot: TimeSlot = {
      id: Math.random().toString(36).substr(2, 9),
      startTime: newSlot.startTime,
      endTime: newSlot.endTime,
      subject: newSlot.subject,
      type: slotType,
    };

    const updatedSchedule = { ...timetable };
    updatedSchedule[activeDay] = [...updatedSchedule[activeDay], slot].sort(
      (a, b) => a.startTime.localeCompare(b.startTime),
    );

    setTimetable(updatedSchedule);
    // Don't reset time for easier consecutive entry
  };

  const handleDeleteSlot = (id: string) => {
    const updatedSchedule = { ...timetable };
    updatedSchedule[activeDay] = updatedSchedule[activeDay].filter(
      (s) => s.id !== id,
    );
    setTimetable(updatedSchedule);
  };

  const handleSave = async () => {
    setLoading(true);
    const data: ClassTimetable = {
      schoolId,
      classId: selectedClass,
      schedule: timetable,
      customTypes,
      updatedAt: Date.now(),
    };
    try {
      await db.saveTimetable(data);
      showToast("Timetable saved successfully!", { type: "success" });
      await logActivity({
        schoolId,
        actorUid: user?.id || null,
        actorRole: user?.role || null,
        eventType: "timetable_saved",
        entityId: selectedClass,
        meta: {
          status: "success",
          module: "Timetable",
          classId: selectedClass,
          actorName: user?.fullName || "",
        },
      });
    } catch (error: any) {
      console.error("Failed to save timetable", error);
      showToast("Failed to save timetable.", { type: "error" });
      await logActivity({
        schoolId,
        actorUid: user?.id || null,
        actorRole: user?.role || null,
        eventType: "timetable_save_failed",
        entityId: selectedClass,
        meta: {
          status: "failed",
          module: "Timetable",
          classId: selectedClass,
          error: error?.message || "Unknown error",
          actorName: user?.fullName || "",
        },
      });
    } finally {
      setLoading(false);
    }
  };

  const getClosingTime = (day: string) => {
    const slots = timetable[day];
    if (!slots || slots.length === 0) return "N/A";
    // Since we sort on add, last one is closing
    return slots[slots.length - 1].endTime;
  };

  const getSlotStyles = (type: string) => {
    switch (type) {
      case "break":
        return {
          bg: "bg-amber-50",
          border: "border-amber-100",
          icon: Coffee,
          iconColor: "text-amber-600",
          badge: "text-amber-600 border-amber-200",
        };
      case "worship":
        return {
          bg: "bg-purple-50",
          border: "border-purple-100",
          icon: Sparkles,
          iconColor: "text-purple-600",
          badge: "text-purple-600 border-purple-200",
        };
      case "assembly":
        return {
          bg: "bg-[#E6F0FA]",
          border: "border-[#E6F0FA]",
          icon: Users,
          iconColor: "text-[#0B4A82]",
          badge: "text-[#0B4A82] border-[#E6F0FA]",
        };
      case "arrival":
        return {
          bg: "bg-green-50",
          border: "border-green-100",
          icon: Users,
          iconColor: "text-green-600",
          badge: "text-green-600 border-green-200",
        };
      case "closing":
        return {
          bg: "bg-slate-100",
          border: "border-slate-200",
          icon: DoorOpen,
          iconColor: "text-slate-600",
          badge: "text-slate-600 border-slate-300",
        };
      default:
        return {
          bg: "bg-white",
          border: "border-slate-100",
          icon: Clock,
          iconColor: "text-emerald-600",
          badge: "text-slate-600 border-slate-200",
        };
    }
  };

  return (
    <Layout title="Manage Timetable">
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 flex flex-col h-auto md:h-[calc(100vh-8rem)]">
        {/* Header Controls */}
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row justify-between md:items-center gap-4 bg-slate-50">
          <div className="flex items-center gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                Select Class
              </label>
              <select
                className="border border-slate-300 rounded-md px-3 py-2 text-sm w-48"
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
              >
                {CLASSES_LIST.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex items-center bg-emerald-600 text-white px-6 py-2 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50"
          >
            <Save size={18} className="mr-2" />
            {loading ? "Saving..." : "Save Schedule"}
          </button>
        </div>

        {/* Main Content Area */}
        <div className="flex flex-1 min-h-0 overflow-y-auto">
          {/* Days Sidebar (Tabs) */}
          <div className="hidden md:flex w-40 border-r border-slate-100 bg-white flex flex-col overflow-y-auto">
            {DAYS.map((day) => {
              const count = timetable[day]?.length || 0;
              return (
                <button
                  key={day}
                  onClick={() => setActiveDay(day)}
                  className={`p-4 text-left border-l-4 transition-colors hover:bg-slate-50 ${activeDay === day ? "border-emerald-500 bg-emerald-50 text-emerald-800 font-medium" : "border-transparent text-slate-600"}`}
                >
                  <span className="block">{day}</span>
                  <span className="text-xs text-slate-400">{count} Slots</span>
                </button>
              );
            })}
          </div>

          {/* Editor Area */}
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto bg-slate-50/50">
            {/* Mobile Day Tabs */}
            <div className="md:hidden flex overflow-x-auto bg-white border-b border-slate-100">
              {DAYS.map((day) => {
                const count = timetable[day]?.length || 0;
                return (
                  <button
                    key={day}
                    onClick={() => setActiveDay(day)}
                    className={`px-4 py-3 text-sm whitespace-nowrap transition-colors hover:bg-slate-50 ${activeDay === day ? "border-b-2 border-emerald-500 bg-emerald-50 text-emerald-800 font-medium" : "border-transparent text-slate-600"}`}
                  >
                    <span>{day}</span>
                    <span className="text-xs text-slate-400 ml-1">
                      ({count})
                    </span>
                  </button>
                );
              })}
            </div>
            {/* Day Header */}
            <div className="p-4 md:p-6 border-b border-slate-100 flex justify-between items-center bg-white">
              <div>
                <h2 className="text-xl font-bold text-slate-800">
                  {activeDay} Schedule
                </h2>
                <p className="text-sm text-slate-500">
                  Closing Time:{" "}
                  <span className="font-semibold text-slate-800">
                    {getClosingTime(activeDay)}
                  </span>
                </p>
              </div>
            </div>

            {/* Slots List */}
            <div className="flex-1 overflow-visible md:overflow-y-auto p-3 md:p-6 space-y-3 md:space-y-4 min-h-[260px]">
              {timetable[activeDay]?.length === 0 ? (
                <div className="text-center w-full min-h-[260px] md:min-h-[320px] py-10 md:py-16 px-6 md:px-10 text-slate-500 border-2 border-dashed border-slate-200 rounded-2xl bg-white flex flex-col items-center justify-center">
                  <div className="text-xl md:text-2xl font-semibold mb-3 text-slate-700">
                    No classes or breaks scheduled
                  </div>
                  <div className="text-base md:text-lg leading-relaxed max-w-md mx-auto">
                    Add time slots for {activeDay} using the form below.
                  </div>
                </div>
              ) : (
                timetable[activeDay]?.map((slot) => {
                  const styles = getSlotStyles(slot.type);
                  const Icon = styles.icon;
                  return (
                    <div
                      key={slot.id}
                      className={`flex items-center p-4 md:p-5 rounded-lg border shadow-sm ${styles.bg} ${styles.border}`}
                    >
                      <div className="flex items-center justify-center w-12 h-12 md:w-14 md:h-14 rounded-full mr-3 md:mr-4 bg-white shadow-sm text-slate-500 flex-shrink-0">
                        <Icon size={20} className={styles.iconColor} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="font-mono text-sm md:text-base font-semibold text-slate-600 bg-slate-100 px-2 py-1 rounded whitespace-nowrap">
                            {slot.startTime} - {slot.endTime}
                          </span>
                          {slot.type !== "lesson" && (
                            <span
                              className={`text-xs uppercase font-bold border px-2 py-0.5 rounded ${styles.badge}`}
                            >
                              {getSlotTypeLabel(slot.type)}
                            </span>
                          )}
                        </div>
                        <p className="text-base md:text-lg font-bold text-slate-800 break-words">
                          {slot.subject}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteSlot(slot.id)}
                        className="text-slate-300 hover:text-[#1160A8] p-2 transition-colors flex-shrink-0"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Add Slot Form */}
            <div className="p-4 md:p-6 bg-white border-t border-slate-200">
              <h4 className="text-sm font-bold text-slate-500 uppercase mb-4">
                Add Time Slot
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
                <div className="sm:col-span-1 lg:col-span-2">
                  <label className="block text-xs text-slate-500 mb-1">
                    Start Time
                  </label>
                  <input
                    type="time"
                    className="w-full border p-3 rounded text-sm md:text-base"
                    value={newSlot.startTime}
                    onChange={(e) =>
                      setNewSlot({ ...newSlot, startTime: e.target.value })
                    }
                  />
                </div>
                <div className="sm:col-span-1 lg:col-span-2">
                  <label className="block text-xs text-slate-500 mb-1">
                    End Time
                  </label>
                  <input
                    type="time"
                    className="w-full border p-3 rounded text-sm md:text-base"
                    value={newSlot.endTime}
                    onChange={(e) =>
                      setNewSlot({ ...newSlot, endTime: e.target.value })
                    }
                  />
                </div>
                <div className="sm:col-span-2 lg:col-span-2">
                  <label className="block text-xs text-slate-500 mb-1">
                    Type
                  </label>
                  <select
                    className="w-full border p-3 rounded text-sm md:text-base"
                    value={newSlot.type}
                    onChange={(e) => setSlotType(e.target.value)}
                  >
                    {BUILT_IN_SLOT_TYPES.map((entry) => (
                      <option key={entry.value} value={entry.value}>
                        {entry.label}
                      </option>
                    ))}
                    {customTypes.length > 0 && (
                      <optgroup label="Custom Types">
                        {customTypes.map((type) => (
                          <option key={type} value={type}>
                            {getSlotTypeLabel(type)}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>
                <div className="sm:col-span-2 lg:col-span-4">
                  <label className="block text-xs text-slate-500 mb-1">
                    Activity/Subject
                  </label>
                  {newSlot.type === "lesson" ? (
                    <select
                      className="w-full border p-3 rounded text-sm md:text-base"
                      value={newSlot.subject}
                      onChange={(e) =>
                        setNewSlot({ ...newSlot, subject: e.target.value })
                      }
                    >
                      {subjects.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                      {subjects.length === 0 && (
                        <option value="">No Subjects Found</option>
                      )}
                    </select>
                  ) : (
                    <input
                      type="text"
                      className="w-full border p-3 rounded text-sm md:text-base"
                      value={newSlot.subject}
                      onChange={(e) =>
                        setNewSlot({ ...newSlot, subject: e.target.value })
                      }
                    />
                  )}
                </div>
                <div className="sm:col-span-2 lg:col-span-2">
                  <button
                    onClick={handleAddSlot}
                    className="w-full bg-[#1160A8] text-white p-3 rounded text-sm md:text-base font-medium hover:bg-[#0B4A82] transition-colors"
                  >
                    <Plus size={16} className="inline mr-1" /> Add Slot
                  </button>
                </div>
              </div>
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <label className="block text-xs font-semibold text-slate-500 uppercase">
                  Create Custom Type
                </label>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    className="w-full border p-3 rounded text-sm md:text-base"
                    value={customTypeInput}
                    onChange={(e) => setCustomTypeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddCustomType();
                      }
                    }}
                    placeholder="e.g. remedial, prep_exam, counselling"
                  />
                  <button
                    onClick={handleAddCustomType}
                    className="whitespace-nowrap rounded bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
                  >
                    Add Type
                  </button>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Added custom types appear in the Type dropdown for this class
                  timetable.
                </p>
                {customTypes.length > 0 && (
                  <div className="mt-3 border-t border-slate-200 pt-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Manage Custom Types
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {customTypes.map((type) => {
                        const usageCount = getCustomTypeUsageCount(type);
                        const inUse = usageCount > 0;
                        return (
                          <div
                            key={type}
                            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm"
                          >
                            <span>{getSlotTypeLabel(type)}</span>
                            {inUse && (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                                {usageCount} used
                              </span>
                            )}
                            <button
                              onClick={() => handleDeleteCustomType(type)}
                              title={
                                inUse
                                  ? "Remove slots using this type before deleting"
                                  : "Delete custom type"
                              }
                              className={`rounded-full p-1 transition-colors ${
                                inUse
                                  ? "cursor-not-allowed text-slate-300"
                                  : "text-rose-500 hover:bg-rose-50 hover:text-rose-600"
                              }`}
                              disabled={inUse}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Timetable;
