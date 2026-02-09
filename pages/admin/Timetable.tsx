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

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

const Timetable = () => {
  const { user } = useAuth();
  const schoolId = requireSchoolId(user);
  const [selectedClass, setSelectedClass] = useState(CLASSES_LIST[0].id);
  const [timetable, setTimetable] = useState<Record<string, TimeSlot[]>>({});
  const [loading, setLoading] = useState(false);
  const [activeDay, setActiveDay] = useState(DAYS[0]);
  const [subjects, setSubjects] = useState<string[]>([]);

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
      }

      setTimetable(schedule);
      setLoading(false);
    };

    loadDataForClass();
  }, [selectedClass, schoolId]);

  const handleAddSlot = () => {
    if (!newSlot.startTime || !newSlot.endTime || !newSlot.subject) return;
    if (newSlot.startTime >= newSlot.endTime) {
      showToast("End time must be after start time", { type: "error" });
      return;
    }

    const slot: TimeSlot = {
      id: Math.random().toString(36).substr(2, 9),
      startTime: newSlot.startTime,
      endTime: newSlot.endTime,
      subject: newSlot.subject,
      type: newSlot.type as
        | "lesson"
        | "break"
        | "worship"
        | "closing"
        | "assembly"
        | "arrival"
        | "lunch"
        | "snack"
        | "cleaning"
        | "games"
        | "nap"
        | "clubs",
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
      updatedAt: Date.now(),
    };
    await db.saveTimetable(data);
    setLoading(false);
    showToast("Timetable saved successfully!", { type: "success" });
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
        <div className="flex flex-1 overflow-y-auto md:overflow-hidden">
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
          <div className="flex-1 flex flex-col overflow-y-auto md:overflow-hidden bg-slate-50/50">
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
                              {slot.type}
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
                    onChange={(e) => {
                      const type = e.target.value as
                        | "lesson"
                        | "break"
                        | "worship"
                        | "closing"
                        | "assembly"
                        | "arrival"
                        | "lunch"
                        | "snack"
                        | "cleaning"
                        | "games"
                        | "nap"
                        | "clubs";
                      let subject = "";
                      if (type === "break") subject = "Break";
                      else if (type === "worship") subject = "Worship";
                      else if (type === "closing") subject = "Closing";
                      else if (type === "assembly") subject = "Assembly";
                      else if (type === "arrival")
                        subject = "Arrival & Free Play";
                      else if (type === "lunch") subject = "Lunch";
                      else if (type === "snack") subject = "Snack";
                      else if (type === "cleaning") subject = "Clean Up";
                      else if (type === "games") subject = "Games";
                      else if (type === "nap") subject = "Nap Time";
                      else if (type === "clubs") subject = "Clubs/Activities";
                      else subject = subjects[0] || "";

                      setNewSlot({ ...newSlot, type, subject });
                    }}
                  >
                    <option value="arrival">Arrival & Free Play</option>
                    <option value="assembly">Morning Assembly</option>
                    <option value="lesson">Lesson</option>
                    <option value="break">Break</option>
                    <option value="snack">Snack</option>
                    <option value="lunch">Lunch</option>
                    <option value="worship">Worship/Devotion</option>
                    <option value="games">Games/Sports</option>
                    <option value="clubs">Clubs/Activities</option>
                    <option value="cleaning">Clean Up</option>
                    <option value="nap">Nap Time</option>
                    <option value="closing">Closing</option>
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
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Timetable;
