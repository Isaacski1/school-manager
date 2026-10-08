# Offline Extension Audit Report

## 1. Assessment Offline Architecture

### Local Storage Keys
- Key format: `school-manager-assessment-draft-[schoolId, classId, subject, term, academicYear]` (JSON stringified tuple)
- Defined in `AssessmentDraftStorage.getDraftKey()`

### Draft Creation & Updates
- On assessment score change (`handleChange`):
  - Updates local React state (`assessments`)
  - Updates `currentDraftRef.current` with new data
  - Increments version in `draftVersionRef`
  - Calls `scheduleDraftSave()` (debounced 1000ms localStorage save)

### Save Operations
- Online: `handleSave()` → `db.saveAssessmentsBatch()` (Firestore batch write)
- Offline: `handleSave()` → `AssessmentDraftStorage.saveDraft()` (localStorage)

### Debounced Saving
- `scheduleDraftSave()` uses `setTimeout` with 1000ms delay to save draft to localStorage during active editing

### Pending Changes Tracking
- `syncStatus` state: `"idle" | "saving" | "syncing" | "error" | "pending"`
- Draft persistence in localStorage indicates pending changes

### Sync Queue
- Single draft per context (schoolId, classId, subject, term, academicYear)
- No explicit queue; system stores latest draft per context

### Connectivity Detection
- `useNetworkStatus()` hook providing `isOnline` state

### Retry Logic
- On online→offline→online transition (useEffect), system:
  1. Loads draft from localStorage
  2. Validates context matches
  3. Attempts Firestore sync via `db.saveAssessmentsBatch()`
  4. On success: deletes local draft
  5. On error: sets `syncStatus="error"` and retains draft

### Synchronization
- Triggered by:
  - Online detection (useEffect monitoring `isOnline`)
  - Manual save when online (attempts immediate sync)
- Uses same Firestore write path as online mode (`db.saveAssessmentsBatch`)

### Conflict Handling
- Multi-tab protection via `storage` event listener
- `hasStoredRevisionChanged()` checks if another tab modified draft
- Before saving/syncing: if external change detected, sets `externalDraftChanged` flag
- On external change notification: offers "Review latest changes" button to reload draft

### Error Handling
- Sync errors caught in try/catch, set `syncStatus="error"`
- Draft preserved in localStorage for retry
- Toast notifications for user feedback

### Loading/Saving/Syncing States
- `loading`: initial data fetch
- `saving`: manual save button active (online)
- `syncStatus`: 
  - `"idle"`: no pending changes
  - `"saving"`: online save in progress
  - `"syncing"`: background sync in progress
  - `"error"`: sync failed
  - `"pending"`: local changes waiting to sync

### Multi-tab Protection
- `storage` event listener monitors draft changes in other tabs
- `loadedDraftRevisionRef` tracks version when draft loaded
- Prevents overwriting newer drafts from other tabs

### Timestamps/Versioning
- Each draft includes:
  - `lastModified`: timestamp of last change
  - `version`: incrementing integer per change

### Firestore Writes
- Uses `db.saveAssessmentsBatch()` for batch writes of assessment records

### Cleanup after Sync
- Successful sync → `AssessmentDraftStorage.deleteDraft()` removes local draft
- Only deletes if draft version matches (race condition protection)

## 2. Student Attendance Architecture (Attendance.tsx)

### Current Online Implementation
- **UI**: `pages/teacher/Attendance.tsx`
- **Data Loading**: 
  - `db.getStudents()` for class roster
  - `db.getAttendance()` for existing attendance record (by date)
- **Data Structure**: 
  - Single document per class per date: `${schoolId}_${selectedClassId}_${date}`
  - Fields: `presentStudentIds` (array), `isHoliday` (boolean), `holidayReason` (string)
- **Save Operation**: 
  - `handleSave()` → `db.saveAttendance()` (single document write)
  - No offline capability
- **Offline Behavior**: 
  - Currently fails silently when offline (no data persistence)
  - UI state lost on page refresh

### Components/Hooks/Services Involved
- `useAuth()`, `useState()`, `useEffect()`
- `db` service (mockDb)
- `logActivity()`, `showToast()`
- Constants: `CLASSES_LIST`

## 3. Teacher Attendance Architecture (TeacherAttendance.tsx)

### Current Online Implementation
- **UI**: `pages/teacher/TeacherAttendance.tsx`
- **Data Loading**: 
  - `db.getTeacherAttendanceByDateRange()` for week's records
- **Data Structure**: 
  - Single document per teacher per date: `${schoolId}_${user.id}_${date}`
  - Fields: `status` (present/absent), `approvalStatus`, `isHoliday`, `holidayReason`, etc.
- **Save Operation**: 
  - `handleMarkAttendance()` / `handleMarkHoliday()` → `db.saveTeacherAttendance()` (single document write)
  - No offline capability
- **Offline Behavior**: 
  - Currently fails when offline (no data persistence)
  - UI state lost on page refresh

### Components/Hooks/Services Involved
- `useAuth()`, `useState()`, `useEffect()`, `useMemo()`, `useCallback()`
- `db` service, `schoolCalendar` service
- `logActivity()`, `showToast()`, `getFriendlyErrorMessage()`
- Constants: none specific

## 4. Remarks Architecture (WriteRemarks.tsx)

### Current Online Implementation
- **UI**: `pages/teacher/WriteRemarks.tsx`
- **Data Loading**: 
  - `db.getStudents()` for class roster
  - `db.getStudentRemarks()` for existing remarks (by class, term, academicYear)
- **Data Structure**: 
  - Single document per student per class per term per academicYear: `${studentId}_${classId}_${dynamicTerm}_${currentAcademicYear}`
  - Fields: `remark` (string), `behaviorTag` (enum), `teacherId`, `dateCreated`, etc.
- **Save Operation**: 
  - `handleSave()` → loops through students, calls `db.saveStudentRemark()` for each
  - No offline capability
- **Offline Behavior**: 
  - Currently fails when offline (no data persistence)
  - UI state lost on page refresh

### Components/Hooks/Services Involved
- `useAuth()`, `useState()`, `useEffect()`
- `db` service
- `logActivity()`, `showToast()`
- Constants: `CLASSES_LIST`, `ACADEMIC_YEAR`, `CURRENT_TERM`

## 5. Skills / Edit Skills Architecture (EditSkills.tsx)

### Current Online Implementation
- **UI**: `pages/teacher/EditSkills.tsx`
- **Data Loading**: 
  - `db.getStudents()` for class roster
  - `db.getStudentSkills()` for existing skills (by class, term, academicYear)
- **Data Structure**: 
  - Single document per student per class per term per academicYear: `${studentId}_${classId}_${dynamicTerm}_${currentAcademicYear}`
  - Fields: six skill dimensions (punctuality, neatness, conduct, etc.) + metadata
- **Save Operation**: 
  - `handleSave()` → loops through students, calls `db.saveStudentSkills()` for each
  - No offline capability
- **Offline Behavior**: 
  - Currently fails when offline (no data persistence)
  - UI state lost on page refresh

### Components/Hooks/Services Involved
- `useAuth()`, `useState()`, `useEffect()`
- `db` service
- `logActivity()`, `showToast()`
- Constants: `CLASSES_LIST`, `ACADEMIC_YEAR`, `CURRENT_TERM`

## 6. Shared Utilities

### Must NOT Modify (Assessment-specific)
- `src/assessmentDraftStorage.ts` (core offline storage for assessments)
- Assessment.tsx offline logic (reference implementation)

### Safe to Use/Extend
- `hooks/useNetworkStatus.ts` (connectivity detection) - already used by Assessment
- `src/` directory for creating similar storage utilities
- Context/AuthContext, context/SchoolContext
- Services: `db` (mockDb), `activityLog`, `toast`, `errorMessages`

### Shared Components
- `components/Layout.tsx` (UI wrapper)
- `lucide-react` icons
- `components/UserAvatar.vue`

## 7. Files That Should Be Modified

1. `pages/teacher/Attendance.tsx` - Add offline support for student attendance
2. `pages/teacher/TeacherAttendance.tsx` - Add offline support for teacher attendance
3. `pages/teacher/WriteRemarks.tsx` - Add offline support for remarks
4. `pages/teacher/EditSkills.tsx` - Add offline support for skills

### Required Changes per Feature
For each feature, we need to:
1. Create a feature-specific storage utility (following AssessmentDraftStorage pattern)
2. Add `useNetworkStatus` hook for connectivity detection
3. Modify save logic to:
   - Save to localStorage when offline
   - Attempt sync when online
   - Show appropriate UI indicators
4. Add multi-tab protection via storage event listener
5. Implement reconnection sync on online detection
6. Add UI indicators for offline/sync states
7. Preserve draft through page reloads

## 8. Files That Should NOT Be Modified

- `src/assessmentDraftStorage.ts` (unless critical bug found)
- `pages/teacher/Assessment.tsx` (reference implementation)
- `hooks/useNetworkStatus.ts`
- Any files unrelated to the four target features
- Backend/Firestore structure (unless absolutely necessary for sync)

## 9. Risks

1. **Data Loss Risk**: If localStorage quota exceeded or corrupted, drafts could be lost
   - Mitigation: Implement defensive parsing and error handling in storage utilities

2. **Multi-tab Conflicts**: Multiple tabs attempting to sync could cause race conditions
   - Mitigation: Use same multi-tab protection pattern as Assessment (storage event listener, version checking)

3. **Sync Duplicates**: Poor retry logic could create duplicate records
   - Mitigation: Only delete local draft after confirmed Firestore success; use version/context matching

4. **UI Inconsistency**: Different offline indicators across features
   - Mitigation: Follow Assessment's UI pattern for consistency

5. **Performance**: Excessive localStorage saves during rapid edits
   - Mitigation: Use debounced saving (1000ms) like Assessment

6. **Storage Key Collisions**: Inadequate scoping could cause data overwrite between contexts
   - Mitigation: Include schoolId, classId, subject/term/academicYear (as applicable) in storage keys

7. **Network Flapping**: Frequent online/offline transitions causing sync thrashing
   - Mitigation: Implement retry backoff and sync cooldown periods

## 10. Recommended Implementation Order

1. **Student Attendance** (Attendance.tsx)
   - Simplest data structure (single record per date)
   - Establish pattern for single-document features

2. **Teacher Attendance** (TeacherAttendance.tsx)
   - Similar to student attendance but per-teacher
   - Reuse patterns from student attendance

3. **Remarks** (WriteRemarks.tsx)
   - Multiple records per class (one per student)
   - Introduce batch saving concepts

4. **Skills / Edit Skills** (EditSkills.tsx)
   - Multiple records per class with multiple fields
   - Most complex but follows same pattern as remarks

This order progresses from simplest to most complex, allowing pattern refinement.
