import { useCallback } from "react";

const useTeacherWeekUtils = () => {
  const getLocalDateString = useCallback((date: Date = new Date()) => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }, []);

  const getWeekDates = useCallback((offset = 0) => {
    const now = new Date();
    now.setDate(now.getDate() + offset * 7);

    const currentDay = now.getDay();
    const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);

    const dates: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      dates.push(getLocalDateString(date));
    }
    return dates;
  }, [getLocalDateString]);

  const getWeekLabel = useCallback(
    (offset: number) => {
      if (offset === 0) return "This Week";
      const weekDates = getWeekDates(offset);
      const startDate = new Date(`${weekDates[0]}T00:00:00`);
      const endDate = new Date(`${weekDates[4]}T00:00:00`);
      const options = { month: "short" as const, day: "numeric" as const };
      const start = startDate.toLocaleDateString("en-US", options);
      const end = endDate.toLocaleDateString("en-US", options);
      return offset === -1 ? `Last Week (${start} - ${end})` : `${start} - ${end}`;
    },
    [getWeekDates],
  );

  return { getLocalDateString, getWeekDates, getWeekLabel };
};

export default useTeacherWeekUtils;

