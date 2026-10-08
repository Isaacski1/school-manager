import { AttendanceRecord } from '../types';

/**
 * Utility for persisting student attendance drafts to localStorage
 * Ensures teacher attendance entry data survives page refreshes, navigation, and browser restarts
 */
export class StudentAttendanceDraftStorage {
  private static readonly DRAFT_PREFIX = 'school-manager-student-attendance-draft-';

  /**
   * Generates a storage key for a student attendance draft
   * @param schoolId The school ID
   * @param classId The class ID
   * @param date The date in YYYY-MM-DD format
   * @returns Storage key for localStorage
   */
  static getDraftKey(
    schoolId: string,
    classId: string,
    date: string
  ): string {
    const tuple = JSON.stringify([schoolId, classId, date]);
    return this.DRAFT_PREFIX + tuple;
  }

  /**
   * Saves a student attendance draft to localStorage
   * @param schoolId The school ID
   * @param classId The class ID
   * @param date The date in YYYY-MM-DD format
   * @param presentStudentIds Array of student IDs marked as present
   * @param isHoliday Whether the date is marked as holiday
   * @param holidayReason Reason for holiday (if applicable)
   * @returns True if successfully saved, false otherwise
   */
  static saveDraft(
    schoolId: string,
    classId: string,
    date: string,
    presentStudentIds: string[],
    isHoliday: boolean,
    holidayReason: string,
    version?: number
  ): boolean {
    try {
      if (typeof window === 'undefined') return false;

      const draft = {
        schoolId,
        classId,
        date,
        presentStudentIds,
        isHoliday,
        holidayReason,
        lastModified: Date.now(),
        version: version || 1
      };

      const key = this.getDraftKey(schoolId, classId, date);
      localStorage.setItem(key, JSON.stringify(draft));
      return true;
    } catch (error) {
      console.warn('Failed to save student attendance draft to localStorage:', error);
      return false;
    }
  }

  /**
   * Loads a student attendance draft from localStorage
   * @param schoolId The school ID
   * @param classId The class ID
   * @param date The date in YYYY-MM-DD format
   * @returns The draft data if found and valid, null otherwise
   */
  static loadDraft(
    schoolId: string,
    classId: string,
    date: string
  ): {
    schoolId: string;
    classId: string;
    date: string;
    presentStudentIds: string[];
    isHoliday: boolean;
    holidayReason: string;
    lastModified: number;
    version: number;
  } | null {
    try {
      if (typeof window === 'undefined') return null;

      const key = this.getDraftKey(schoolId, classId, date);
      const json = localStorage.getItem(key);
      
      if (!json) return null;

      const draft = JSON.parse(json);
      
      // Validate draft structure
      if (
        !draft ||
        typeof draft !== 'object' ||
        !draft.schoolId ||
        !draft.classId ||
        !draft.date ||
        !Array.isArray(draft.presentStudentIds) ||
        typeof draft.isHoliday !== 'boolean' ||
        typeof draft.holidayReason !== 'string' ||
        typeof draft.lastModified !== 'number' ||
        typeof draft.version !== 'number'
      ) {
        // Invalid draft structure, remove it
        localStorage.removeItem(key);
        return null;
      }

      // Additional validation: ensure schoolId/classId/date match
      if (
        draft.schoolId !== schoolId ||
        draft.classId !== classId ||
        draft.date !== date
      ) {
        // Context mismatch, don't use this draft
        return null;
      }

      return draft;
    } catch (error) {
      console.warn('Failed to load student attendance draft from localStorage:', error);
      return null;
    }
  }

  /**
   * Deletes a student attendance draft from localStorage
   * @param schoolId The school ID
   * @param classId The class ID
   * @param date The date in YYYY-MM-DD format
   * @returns True if successfully deleted, false otherwise
   */
  static deleteDraft(
    schoolId: string,
    classId: string,
    date: string
  ): boolean {
    try {
      if (typeof window === 'undefined') return false;

      const key = this.getDraftKey(schoolId, classId, date);
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.warn('Failed to delete student attendance draft from localStorage:', error);
      return false;
    }
  }

  /**
   * Clears all student attendance drafts for a given school (useful on logout)
   * @param schoolId The school ID
   * @returns Number of drafts cleared
   */
  static clearAllDraftsForSchool(schoolId: string): number {
    try {
      if (typeof window === 'undefined') return 0;

      let count = 0;
      const prefix = this.getDraftKey(schoolId, '', '');

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
          localStorage.removeItem(key);
          count++;
        }
      }

      return count;
    } catch (error) {
      console.warn('Failed to clear student attendance drafts from localStorage:', error);
      return 0;
    }
  }
}