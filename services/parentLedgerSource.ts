// Parent ledger source.
//
// Parent only data path. It loads the fee ledgers of one student from both
// storage layouts and hands them to the verified financial engine
// (services/parentFees.js).
//
// The shared storage abstraction (services/mockDb.ts) reads the canonical
// layout and the alternate layout and merges the two lists by document id,
// keeping the canonical copy. A school that lives in both layouts can
// therefore hold the same ledger twice, and the copy the term rollover wrote
// its carry-forward entry into can be the one that is dropped.
//
// This module restores only the carry-forward entries the canonical copy is
// missing (see mergeParentLedgers). It never resurrects an ordinary fee, it
// never duplicates a fee and it never writes anything.
//
// The administrator workflow is not touched: it keeps using the shared
// abstraction.

import { collection, getDocs, query, where } from "firebase/firestore";
import { firestore } from "./firebase";
import { db } from "./mockDb";
import { mergeParentLedgers } from "./parentFeeData";
import { FeeTerm, StudentFeeLedger } from "../types";

export interface ParentLedgerQuery {
  schoolId?: string;
  studentId?: string;
  academicYear?: string;
  classId?: string;
  term?: FeeTerm;
}

/**
 * Read the ledger copy that lives in the layout the school is not using
 * any more. A failure here must never break the Parent Dashboard, the
 * canonical copy is enough to render the page.
 */
const readAlternateLedgers = async (
  schoolId: string,
  studentId: string,
): Promise<StudentFeeLedger[]> => {
  const settings = await db.getFinanceSettings(schoolId);
  const alternateCollection =
    settings.financeVersion === "v2"
      ? collection(firestore, "student_ledgers")
      : collection(firestore, "schools", schoolId, "feeLedgers");

  const snapshot = await getDocs(
    query(
      alternateCollection,
      where("schoolId", "==", schoolId),
      where("studentId", "==", studentId),
    ),
  );

  return snapshot.docs.map((doc) => ({
    ...(doc.data() as Omit<StudentFeeLedger, "id">),
    id: doc.id,
  }));
};

/**
 * Fee ledgers of one student, ready for the financial engine.
 */
export const loadParentLedgers = async (
  params: ParentLedgerQuery,
): Promise<StudentFeeLedger[]> => {
  const canonical = await db.getStudentLedgers(params);
  const schoolId = params.schoolId;
  const studentId = params.studentId;

  if (!schoolId || !studentId) return canonical;

  try {
    const alternate = await readAlternateLedgers(schoolId, studentId);
    return mergeParentLedgers(canonical, alternate) as StudentFeeLedger[];
  } catch (error) {
    console.warn(
      "[parentLedgerSource] alternate layout ledger read failed, using canonical copy",
      error,
    );
    return canonical;
  }
};

export default loadParentLedgers;
