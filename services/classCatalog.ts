import { CLASSES_LIST, getDefaultFilteredClasses } from "../constants";
import { ClassRoom } from "../types";

export const normalizeClassName = (value: string) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*-\s*/g, "-");

export const createClassRoomId = (baseClassId: string, section: string) => {
  const normalizedSection = normalizeClassName(section)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalizedSection ? `${baseClassId}_${normalizedSection}` : baseClassId;
};

export const getDefaultClassRooms = (
  schoolId: string,
  schoolType?: string,
): ClassRoom[] =>
  getDefaultFilteredClasses(schoolType).map((classRoom, index) => ({
    ...classRoom,
    schoolId,
    baseClassId: classRoom.id,
    section: "",
    nextClassId: null,
    sortOrder: index,
    isActive: true,
  }));

export const getConfiguredClassRooms = (
  schoolId: string,
  schoolType: string | undefined,
  configured?: ClassRoom[],
  includeInactive = false,
) => {
  const source = configured?.length
    ? configured.map((classRoom, index) => ({
        ...classRoom,
        schoolId,
        name: normalizeClassName(classRoom.name),
        baseClassId: classRoom.baseClassId || classRoom.id,
        section: normalizeClassName(classRoom.section || ""),
        sortOrder: classRoom.sortOrder ?? index,
        isActive: classRoom.isActive !== false,
      }))
    : getDefaultClassRooms(schoolId, schoolType);

  return source
    .filter((classRoom) => includeInactive || classRoom.isActive !== false)
    .sort(
      (a, b) =>
        (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
        a.name.localeCompare(b.name),
    );
};

export const getLegacyNextClassId = (classId: string) => {
  const index = CLASSES_LIST.findIndex((classRoom) => classRoom.id === classId);
  return index >= 0 ? CLASSES_LIST[index + 1]?.id || null : null;
};

export const getClassRoomLabel = (
  classRooms: ClassRoom[],
  classId?: string | null,
) => classRooms.find((classRoom) => classRoom.id === classId)?.name || classId || "-";
