import { ComputedGrade, Assessment } from "./types";
import type { ClassRoom } from "./types";

export const ACADEMIC_YEAR = "2023-2024";
export const CURRENT_TERM = 1;

const DEFAULT_CLASS_DEFINITIONS: Array<
  Pick<ClassRoom, "id" | "name" | "level">
> = [
  { id: "c_creche", name: "Creche", level: "CRECHE" },
  { id: "c_n1", name: "Nursery 1", level: "NURSERY" },
  { id: "c_n2", name: "Nursery 2", level: "NURSERY" },
  { id: "c_kg1", name: "KG 1", level: "KG" },
  { id: "c_kg2", name: "KG 2", level: "KG" },
  { id: "c_p1", name: "Class 1", level: "PRIMARY" },
  { id: "c_p2", name: "Class 2", level: "PRIMARY" },
  { id: "c_p3", name: "Class 3", level: "PRIMARY" },
  { id: "c_p4", name: "Class 4", level: "PRIMARY" },
  { id: "c_p5", name: "Class 5", level: "PRIMARY" },
  { id: "c_p6", name: "Class 6", level: "PRIMARY" },
  { id: "c_jhs1", name: "JHS 1", level: "JHS" },
  { id: "c_jhs2", name: "JHS 2", level: "JHS" },
  { id: "c_jhs3", name: "JHS 3", level: "JHS" },
  { id: "c_shs1", name: "SHS 1", level: "SHS" },
  { id: "c_shs2", name: "SHS 2", level: "SHS" },
  { id: "c_shs3", name: "SHS 3", level: "SHS" },
];

const DEFAULT_CLASSES_LIST: ClassRoom[] = DEFAULT_CLASS_DEFINITIONS.map(
  (classRoom, index) => ({
  ...classRoom,
  schoolId: "",
  baseClassId: classRoom.id,
  section: "",
  nextClassId: null,
  sortOrder: index,
  isActive: true,
  }),
);

export const CLASSES_LIST: ClassRoom[] = DEFAULT_CLASSES_LIST.map((classRoom) => ({
  ...classRoom,
}));

export const setRuntimeClasses = (classRooms?: ClassRoom[]) => {
  const next = classRooms?.length ? classRooms : DEFAULT_CLASSES_LIST;
  CLASSES_LIST.splice(
    0,
    CLASSES_LIST.length,
    ...next
      .filter((classRoom) => classRoom.isActive !== false)
      .sort(
        (a, b) =>
          (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
          a.name.localeCompare(b.name),
      )
      .map((classRoom) => ({ ...classRoom })),
  );
};

export const getDefaultFilteredClasses = (schoolType?: string) => {
  if (!schoolType) return DEFAULT_CLASSES_LIST.map((classRoom) => ({ ...classRoom }));

  const type = schoolType.toLowerCase();
  const levels = type.includes("junior high")
    ? ["JHS"]
    : type.includes("primary school")
      ? ["PRIMARY"]
      : type.includes("senior high")
        ? ["SHS"]
        : type.includes("basic school")
          ? ["CRECHE", "NURSERY", "KG", "PRIMARY", "JHS"]
          : type.includes("nursery") || type.includes("kindergarten")
            ? ["CRECHE", "NURSERY", "KG"]
            : null;

  return DEFAULT_CLASSES_LIST.filter(
    (classRoom) => !levels || levels.includes(classRoom.level),
  ).map((classRoom) => ({ ...classRoom }));
};

export const CLASS_PROMOTION_MAP: Record<string, string | null> = {
  c_creche: "c_n1",
  c_n1: "c_n2",
  c_n2: "c_kg1",
  c_kg1: "c_kg2",
  c_kg2: "c_p1",
  c_p1: "c_p2",
  c_p2: "c_p3",
  c_p3: "c_p4",
  c_p4: "c_p5",
  c_p5: "c_p6",
  c_p6: "c_jhs1",
  c_jhs1: "c_jhs2",
  c_jhs2: "c_jhs3",
  c_jhs3: "c_shs1",
  c_shs1: "c_shs2",
  c_shs2: "c_shs3",
  c_shs3: null,
};

/**
 * Filter the global CLASSES_LIST based on the school type.
 * @param schoolType The type of school (e.g., "Primary School", "Junior High School")
 * @returns A filtered array of classes
 */
export const getFilteredClasses = (schoolType?: string) => {
  if (!schoolType) return CLASSES_LIST;

  const type = schoolType.toLowerCase();

  if (type.includes("junior high")) {
    return CLASSES_LIST.filter(c => c.level === "JHS");
  }
  if (type.includes("primary school")) {
    return CLASSES_LIST.filter(c => c.level === "PRIMARY");
  }
  if (type.includes("senior high")) {
    return CLASSES_LIST.filter(c => c.level === "SHS");
  }
  if (type.includes("basic school")) {
    // Basic School usually includes Creche through JHS
    return CLASSES_LIST.filter(c => ["CRECHE", "NURSERY", "KG", "PRIMARY", "JHS"].includes(c.level));
  }
  if (type.includes("nursery") || type.includes("kindergarten")) {
    return CLASSES_LIST.filter(c => ["CRECHE", "NURSERY", "KG"].includes(c.level));
  }

  return CLASSES_LIST;
};

export const DEFAULT_SUBJECTS = [
  "Mathematics",
  "English Language",
  "Integrated Science",
  "Social Studies",
  "ICT",
  "RME",
  "Ghanaian Language",
  "Creative Arts",
];

export const crecheSubjects = [
  "Language & Literacy",
  "Numeracy",
  "Environmental Studies",
  "Creative Arts",
  "Physical Development",
  "Social & Emotional Development",
  "Rhymes, Songs & Storytelling",
];

export const nurserySubjects = [
  "Language & Literacy",
  "Numeracy",
  "Environmental Studies",
  "Creative Arts",
  "Physical Development",
  "Social & Emotional Development",
  "Rhymes, Songs & Storytelling",
];

export const kgSubjects = [
  "Literacy & Language",
  "Numeracy",
  "OWOP",
  "Creative Art",
  "Physical Education",
];

export const primarySubjects = [
  "English Language",
  "Mathematics",
  "Science",
  "ICT",
  "Religious & Moral Education (RME)",
  "Ghanaian Language",
  "Our World Our People (OWOP)",
  "Creative Arts",
  "Physical Education",
];

export const jhsSubjects = [
  "English Language",
  "Mathematics",
  "Integrated Science",
  "Social Studies",
  "Religious & Moral Education (RME)",
  "ICT",
  "French",
  "Ghanaian Language",
  "Creative Arts & Design",
  "Physical Education",
  "Career Technology",
  "Computing / Coding",
];

export const calculateGrade = (
  total: number,
  scale?: { A: number; B: number; C: number; D: number },
): ComputedGrade => {
  const gradingScale = scale || { A: 80, B: 70, C: 60, D: 45 };
  if (total >= gradingScale.A)
    return { total, grade: "A", remark: "Excellent" };
  if (total >= gradingScale.B)
    return { total, grade: "B", remark: "Very Good" };
  if (total >= gradingScale.C) return { total, grade: "C", remark: "Good" };
  if (total >= gradingScale.D) return { total, grade: "D", remark: "Pass" };
  return { total, grade: "F", remark: "Fail" };
};

export const calculateTotalScore = (a: Partial<Assessment>): number => {
  // CA (50 Marks) + Exam (100 Marks scaled to 50%) = 100%
  const ca =
    (a.testScore || 0) + (a.homeworkScore || 0) + (a.projectScore || 0);
  const examScaled = (a.examScore || 0) * 0.5;
  return Math.round(ca + examScaled);
};

export const getGradeColor = (grade: string) => {
  switch (grade) {
    case "A":
      return "text-green-600 bg-green-100";
    case "B":
      return "text-blue-600 bg-blue-100";
    case "C":
      return "text-yellow-600 bg-yellow-100";
    case "D":
      return "text-orange-600 bg-orange-100";
    default:
      return "text-red-600 bg-red-100";
  }
};
