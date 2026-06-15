import { useCallback, useMemo } from "react";
import { useSchool } from "../context/SchoolContext";
import { getConfiguredClassRooms, getClassRoomLabel } from "../services/classCatalog";

export const useSchoolClasses = (includeInactive = false) => {
  const { school, schoolConfig } = useSchool();

  const allClasses = useMemo(
    () =>
      getConfiguredClassRooms(
        school?.id || schoolConfig?.schoolId || "",
        school?.schoolType,
        schoolConfig?.classRooms,
        true,
      ),
    [school?.id, school?.schoolType, schoolConfig?.schoolId, schoolConfig?.classRooms],
  );
  const classes = useMemo(
    () =>
      includeInactive
        ? allClasses
        : allClasses.filter((classRoom) => classRoom.isActive !== false),
    [allClasses, includeInactive],
  );
  const getClassName = useCallback(
    (classId?: string | null) => getClassRoomLabel(allClasses, classId),
    [allClasses],
  );

  return {
    classes,
    allClasses,
    getClassName,
  };
};
