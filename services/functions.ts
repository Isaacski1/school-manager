import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

export const createSchool = httpsCallable(functions, "createSchool");
export const createSchoolAdmin = httpsCallable(functions, "createSchoolAdmin");
export const deleteSchool = httpsCallable(functions, "deleteSchool");
export const createTeacherAccount = httpsCallable(
  functions,
  "createTeacherAccount",
);
export const repairUserSchoolId = httpsCallable(
  functions,
  "repairUserSchoolId",
);
