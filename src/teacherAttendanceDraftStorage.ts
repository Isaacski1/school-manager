import { TeacherAttendanceRecord } from '../types';

/**
 * Utility for persisting teacher attendance drafts to localStorage
 * Ensures teacher attendance data survives page refreshes, navigation, and browser restarts
 */
export class TeacherAttendanceDraftStorage {
  private static readonly DRAFT_PREFIX = 'school-manager-teacher-attendance-draft-';

  /**
   * Generates a storage key for a teacher attendance draft
   * @param schoolId The school ID
   * @param teacherId The teacher ID
   * @param date The date in YYYY-MM-DD format
   * @returns Storage key for localStorage
   */
  static getDraftKey(
    schoolId: string,
    teacherId: string,
    date: string
  ): string {
    const tuple = JSON.stringify([schoolId, teacherId, date]);
    return this.DRAFT_PREFIX + tuple;
  }

  /**
   * Saves a teacher attendance draft to localStorage
   * @param schoolId The school ID
   * @param teacherId The teacher ID
   * @param date The date in YYYY-MM-DD format
   * @param status The attendance status (present/absent)
   * @param approvalStatus The approval status (pending/approved/rejected)
   * @param isHoliday Whether the date is marked as holiday
   * @param holidayReason Reason for holiday (if applicable)
   * @returns True if successfully saved, false otherwise
   */
  static saveDraft(
    schoolId: string,
    teacherId: string,
    date: string,
    status: 'present' | 'absent',
    approvalStatus: 'pending' | 'approved' | 'rejected',
    isHoliday: boolean,
    holidayReason: string,
    version?: number
  ): boolean {
    try {
      if (typeof window === 'undefined') return false;

      const draft = {
        schoolId,
        teacherId,
        date,
        status,
        approvalStatus,
        isHoliday,
        holidayReason,
        lastModified: Date.now(),
        version: version || 1
      };

      const key = this.getDraftKey(schoolId, teacherId, date);
      localStorage.setItem(key, JSON.stringify(draft));
      return true;
    } catch (error) {
      console.warn('Failed to save teacher attendance draft to localStorage:', error);
      return false;
    }
  }

  /**
   * Loads a teacher attendance draft from localStorage
   * @param schoolId The school ID
   * @param teacherId The teacher ID
   * @param date The date in YYYY-MM-DD format
   * @returns The draft data if found and valid, null otherwise
   */
  static loadDraft(
    schoolId: string,
    teacherId: string,
    date: string
  ): {
    schoolId: string;
    teacherId: string;
    date: string;
    status: 'present' | 'absent';
    approvalStatus: 'pending' | 'approved' | 'rejected';
    isHoliday: boolean;
    holidayReason: string;
    lastModified: number;
    version: number;
  } | null {
    try {
      if (typeof window === 'undefined') return null;

      const key = this.getDraftKey(schoolId, teacherId, date);
      const json = localStorage.getItem(key);
      
      if (!json) return null;

      const draft = JSON.parse(json);
      
      // Validate draft structure
      if (
        !draft ||
        typeof draft !== 'object' ||
        !draft.schoolId ||
        !draft.teacherId ||
        !draft.date ||
        (draft.status !== 'present' && draft.status !== 'absent') ||
        (draft.approvalStatus !== 'pending' && draft.approvalStatus !== 'approved' && draft.approvalStatus !== 'rejected') ||
        typeof draft.isHoliday !== 'boolean' ||
        typeof draft.holidayReason !== 'string' ||
        typeof draft.lastModified !== 'number' ||
        typeof draft.version !== 'number'
      ) {
        // Invalid draft structure, remove it
        localStorage.removeItem(key);
        return null;
      }

      // Additional validation: ensure schoolId/teacherId/date match
      if (
        draft.schoolId !== schoolId ||
        draft.teacherId !== teacherId ||
        draft.date !== date
      ) {
        // Context mismatch, don't use this draft
        return null;
      }

      return draft;
    } catch (error) {
      console.warn('Failed to load teacher attendance draft from localStorage:', error);
      return null;
    }
  }

  /**
   * Deletes a teacher attendance draft from localStorage
   * @param schoolId The school ID
   * @param teacherId The teacher ID
   * @param date The date in YYYY-MM-DD format
   * @returns True if successfully deleted, false otherwise
   */
  static deleteDraft(
    schoolId: string,
    teacherId: string,
    date: string
  ): boolean {
    try {
      if (typeof window === 'undefined') return false;

      const key = this.getDraftKey(schoolId, teacherId, date);
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.warn('Failed to delete teacher attendance draft from localStorage:', error);
      return false;
    }
  }

  /**
   * Clears all teacher attendance drafts for a given school (useful on logout)
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
      console.warn('Failed to clear teacher attendance drafts from localStorage:', error);
      return 0;
    }
  }
}