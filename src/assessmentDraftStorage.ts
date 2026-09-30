import { Assessment, Student } from '../types';

/**
 * Utility for persisting assessment drafts to localStorage
 * Ensures teacher mark entry data survives page refreshes, navigation, and browser restarts
 */
export class AssessmentDraftStorage {
  private static readonly DRAFT_PREFIX = 'school-manager-assessment-draft-';

  /**
   * Generates a storage key for an assessment draft
   * @param schoolId The school ID
   * @param classId The class ID
   * @param subject The subject name
   * @param term The term number (1, 2, or 3)
   * @param academicYear The academic year string
   * @returns Storage key for localStorage
   */
  static getDraftKey(
    schoolId: string,
    classId: string,
    subject: string,
    term: number,
    academicYear: string
  ): string {
    const tuple = JSON.stringify([schoolId, classId, subject, term, academicYear]);
    return this.DRAFT_PREFIX + tuple;
  }

  /**
   * Saves an assessment draft to localStorage
   * @param schoolId The school ID
   * @param classId The class ID
   * @param subject The subject name
   * @param term The term number (1, 2, or 3)
   * @param academicYear The academic year string
   * @param assessments Map of studentId to partial assessment data
   * @returns True if successfully saved, false otherwise
   */
  static saveDraft(
    schoolId: string,
    classId: string,
    subject: string,
    term: number,
    academicYear: string,
    assessments: Record<string, Partial<Assessment>>,
    version?: number
  ): boolean {
    try {
      if (typeof window === 'undefined') return false;

      const draft = {
        schoolId,
        classId,
        subject,
        term,
        academicYear,
        assessments,
        lastModified: Date.now(),
        version: version || 1
      };

      const key = this.getDraftKey(schoolId, classId, subject, term, academicYear);
      localStorage.setItem(key, JSON.stringify(draft));
      return true;
    } catch (error) {
      console.warn('Failed to save assessment draft to localStorage:', error);
      return false;
    }
  }

  /**
   * Loads an assessment draft from localStorage
   * @param schoolId The school ID
   * @param classId The class ID
   * @param subject The subject name
   * @param term The term number (1, 2, or 3)
   * @param academicYear The academic year string
   * @returns The draft data if found and valid, null otherwise
   */
  static loadDraft(
    schoolId: string,
    classId: string,
    subject: string,
    term: number,
    academicYear: string
  ): {
    schoolId: string;
    classId: string;
    subject: string;
    term: number;
    academicYear: string;
    assessments: Record<string, Partial<Assessment>>;
    lastModified: number;
    version: number;
  } | null {
    try {
      if (typeof window === 'undefined') return null;

      const key = this.getDraftKey(schoolId, classId, subject, term, academicYear);
      const json = localStorage.getItem(key);
      
      if (!json) return null;

      const draft = JSON.parse(json);
      
      // Validate draft structure
      if (
        !draft ||
        typeof draft !== 'object' ||
        !draft.schoolId ||
        !draft.classId ||
        !draft.subject ||
        typeof draft.term !== 'number' ||
        !draft.academicYear ||
        !draft.assessments ||
        typeof draft.lastModified !== 'number' ||
        typeof draft.version !== 'number'
      ) {
        // Invalid draft structure, remove it
        localStorage.removeItem(key);
        return null;
      }

      // Additional validation: ensure schoolId/classId/subject/term/academicYear match
      if (
        draft.schoolId !== schoolId ||
        draft.classId !== classId ||
        draft.subject !== subject ||
        draft.term !== term ||
        draft.academicYear !== academicYear
      ) {
        // Context mismatch, don't use this draft
        return null;
      }

      return draft;
    } catch (error) {
      console.warn('Failed to load assessment draft from localStorage:', error);
      return null;
    }
  }

  /**
   * Deletes an assessment draft from localStorage
   * @param schoolId The school ID
   * @param classId The class ID
   * @param subject The subject name
   * @param term The term number (1, 2, or 3)
   * @param academicYear The academic year string
   * @returns True if successfully deleted, false otherwise
   */
  static deleteDraft(
    schoolId: string,
    classId: string,
    subject: string,
    term: number,
    academicYear: string
  ): boolean {
    try {
      if (typeof window === 'undefined') return false;

      const key = this.getDraftKey(schoolId, classId, subject, term, academicYear);
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.warn('Failed to delete assessment draft from localStorage:', error);
      return false;
    }
  }

  /**
   * Clears all assessment drafts for a given school (useful on logout)
   * @param schoolId The school ID
   * @returns Number of drafts cleared
   */
  static clearAllDraftsForSchool(schoolId: string): number {
    try {
      if (typeof window === 'undefined') return 0;

      let count = 0;
      const prefix = this.getDraftKey(schoolId, '', '', 0, '');

      for (let i = 0; i < localStorage.length; i++) {
        if (localStorage.key(i) && localStorage.key(i).startsWith(prefix)) {
          localStorage.removeItem(localStorage.key(i));
          count++;
        }
      }

      return count;
    } catch (error) {
      console.warn('Failed to clear assessment drafts from localStorage:', error);
      return 0;
    }
  }
}