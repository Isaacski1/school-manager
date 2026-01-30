import { ComputedGrade, Assessment } from "./types";

export const ACADEMIC_YEAR = "2023-2024";
export const CURRENT_TERM = 1;

export const CLASSES_LIST = [
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
];

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

export const calculateGrade = (total: number): ComputedGrade => {
  if (total >= 80) return { total, grade: "A", remark: "Excellent" };
  if (total >= 70) return { total, grade: "B", remark: "Very Good" };
  if (total >= 60) return { total, grade: "C", remark: "Good" };
  if (total >= 45) return { total, grade: "D", remark: "Pass" };
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
      return "text-red-600 bg-red-100";
    case "C":
      return "text-yellow-600 bg-yellow-100";
    case "D":
      return "text-orange-600 bg-orange-100";
    default:
      return "text-red-600 bg-red-100";
  }
};
