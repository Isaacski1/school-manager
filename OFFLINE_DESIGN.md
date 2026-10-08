# Offline Extension Design Document

## 1. Architecture Overview

The offline extension will follow the proven Assessment offline architecture as the reference implementation, adapting it to each feature's specific data structure and backend operations. The core principles are:

- **Local-first**: UI changes are immediately reflected in local state and persisted to localStorage
- **Background synchronization**: When online, pending local changes are synchronized with Firestore
- **Multi-tab protection**: Uses storage event listeners to prevent overwriting newer changes
- **Versioned drafts**: Each draft includes a version number to detect conflicts
- **Defensive error handling**: Malformed localStorage data doesn't crash the application
- **Activity logging**: Only occurs after successful backend synchronization

The design avoids modifying the Assessment implementation and instead creates parallel systems for each feature.

## 2. Student Attendance Offline Design

### Backend Structure (Reference)
- Document ID: `${schoolId}_${classId}_${date}`
- Fields: `presentStudentIds` (string[]), `isHoliday` (boolean), `holidayReason` (string)
- Save function: `db.saveAttendance(record)`

### Local Data Model
A single draft represents the complete attendance state for a class/date:
```typescript
interface StudentAttendanceDraft {
  schoolId: string;
  classId: string;
  date: string; // YYYY-MM-DD format
  presentStudentIds: string[];
  isHoliday: boolean;
  holidayReason: string;
  lastModified: number;
  version: number;
}
```

### Local Storage Key Format
```
school-manager-student-attendance-draft-[schoolId]-[classId]-[date]
```
Example: `school-manager-student-attendance-draft-sch123-class456-2026-10-08`

### Why Single Draft?
- Backend saves one document per class per date
- All attendance data for that class/date is interdependent
- Prevents fragmented updates that could lead to inconsistent state

### Sync Lifecycle
**Online Edit:**
1. UI updates present/absent status → local React state
2. `handleChange()` updates local state immediately
3. Debounced save (1000ms) persists to localStorage via `StudentAttendanceDraftStorage.saveDraft()`
4. UI shows "Saved locally" indicator

**Offline Edit:**
1. Same as online edit, but data persists only to localStorage
2. UI shows "Offline — changes saved locally" indicator

**Reconnection:**
1. `useNetworkStatus` detects online status change
2. If not already syncing:
   a. Load draft from localStorage
   b. Validates context (schoolId, classId, date) matches current UI
   c. Attempts `db.saveAttendance()` with current draft data
   d. On success: 
      - Delete local draft (if complete sync)
      - Update sync status to idle
      - Show success indicator
   e. On error:
      - Preserve local draft
      - Set sync status to error
      - Show error indicator with retry promise

**Sync Failure Handling:**
- Failed sync preserves local draft
- Retries on subsequent reconnection attempts
- No automatic retry loop to prevent thrashing
- User must manually trigger save or wait for next reconnection

### Multi-tab Strategy
- Storage event listener monitors key changes in other tabs
- `hasStoredRevisionChanged()` compares versions
- Prevents saving if another tab has newer version
- Provides "Review latest changes" button to reload draft from other tab

### Reload/Offline Behavior Flow
1. Edit online → changes saved to localStorage
2. Go offline → UI shows offline indicator
3. Make more changes → updates localStorage draft
4. Refresh while offline → draft loaded from localStorage on mount
5. Reopen browser → draft persists, UI restored
6. Internet returns → automatic sync attempt
7. Sync succeeds → local draft cleared, UI shows success
8. Sync fails → local draft retained, error shown

## 3. Teacher Attendance Offline Design

### Backend Structure (Reference)
- Document ID: `${schoolId}_${teacherId}_${date}`
- Fields: `status` (present/absent), `approvalStatus`, `isHoliday`, `holidayReason`, etc.
- Save function: `db.saveTeacherAttendance(record)`

### Local Data Model
A single draft represents the complete teacher attendance state for a date:
```typescript
interface TeacherAttendanceDraft {
  schoolId: string;
  teacherId: string;
  date: string; // YYYY-MM-DD format
  status: 'present' | 'absent';
  approvalStatus: 'pending' | 'approved' | 'rejected';
  isHoliday: boolean;
  holidayReason: string;
  lastModified: number;
  version: number;
}
```

### Local Storage Key Format
```
school-manager-teacher-attendance-draft-[schoolId]-[teacherId]-[date]
```
Example: `school-manager-teacher-attendance-draft-sch123-teach789-2026-10-08`

### Why Single Draft?
- Backend saves one document per teacher per date
- All fields for that teacher/date are updated together
- Matches the existing backend save function signature

### Sync Lifecycle
Follows the exact same pattern as Student Attendance, adapted for teacher attendance fields.

**Key Difference:** Teacher attendance includes approval workflow, but offline changes are saved with `approvalStatus: "pending"` matching the online behavior.

### Multi-tab Strategy
Identical to Student Attendance: storage event listener with version checking.

## 4. Remarks Offline Design

### Backend Structure (Reference)
- Document ID: `${studentId}_${classId}_${dynamicTerm}_${currentAcademicYear}`
- Fields: `remark` (string), `behaviorTag` (enum), `teacherId`, `dateCreated`, etc.
- Save function: `db.saveStudentRemark(remark)` (called per student)

### Local Data Model
A single draft contains remarks for ALL students in a class/term/academicYear, with explicit dirty tracking:
```typescript
interface RemarkDraft {
  schoolId: string;
  classId: string;
  term: number; // 1, 2, or 3
  academicYear: string;
  remarks: Record<string, {
    remark: string;
    behaviorTag: "Excellent" | "Good" | "Needs Improvement" | "";
  }>;
  dirtyStudentIds: string[]; // Tracks which students have unsynced changes
  lastModified: number;
  version: number;
}
```

### Local Storage Key Format
```
school-manager-remarks-draft-[schoolId]-[classId]-[term]-[academicYear]
```
Example: `school-manager-remarks-draft-sch123-class456-3-2026-2027`

### Why Single Draft Containing All Students?
1. **Efficiency**: One localStorage operation vs. N operations for N students
2. **Atomicity**: Prevents partial updates where some students' remarks are saved and others aren't
3. **Consistency**: Matches the assessment pattern where one draft contains all student data
4. **Backend Alignment**: While backend saves per student, the logical unit of work is the entire class's remarks

### Dirty Tracking Mechanism
- Each student's remark is stored in a map keyed by `studentId`
- When a student's remark is edited, their ID is added to `dirtyStudentIds`
- During sync:
  - For each student ID in `dirtyStudentIds`:
    * Validate context matches
    * Attempt `db.saveStudentRemark()` for that student
    * On success: Remove student ID from `dirtyStudentIds`
    * On error: Keep student ID in `dirtyStudentIds` for retry
  - Only delete the entire draft when `dirtyStudentIds` is empty (all students synced)
- This prevents already-synced students from being unnecessarily rewritten after a partial failure

### Sync Lifecycle
**Online Edit:**
1. UI updates remark for student → local React state
2. `handleRemarkChange()` updates local state immediately and marks student as dirty
3. Debounced save (1000ms) persists complete draft to localStorage
4. When user clicks "Save Remarks":
   - If online: iterate through `dirtyStudentIds`, call `db.saveStudentRemark()` for each
   - If offline: save complete draft to localStorage only
   - UI shows appropriate saving/syncing indicators

**Offline Edit:**
1. Same as online edit, but data persists only to localStorage
2. Individual student changes update the remarks map and mark student as dirty in localStorage draft
3. UI shows "Offline — changes saved locally" indicator

**Reconnection:**
1. System loads complete draft from localStorage
2. For each student ID in `dirtyStudentIds`:
   a. Validates context matches current UI
   b. Attempts `db.saveStudentRemark()` for that student
   c. On success: Removes student ID from `dirtyStudentIds`
   d. On error: Keeps student ID in `dirtyStudentIds`
3. After processing all dirty students:
   - If `dirtyStudentIds` is empty: delete local draft, show success
   - If `dirtyStudentIds` is not empty: retain draft, show partial success/error

### Multi-tab Strategy
- Storage event listener monitors the complete draft key
- Version checking prevents overwriting newer drafts
- When external change detected, system offers to reload the complete draft
- Safe because we use "newer wins" with user confirmation - merging would lose dirty tracking

### Reload/Offline Behavior Flow
Same pattern as Student Attendance but applies to the complete remarks draft with dirty tracking.

## 5. Skills Offline Design

### Backend Structure (Reference)
- Document ID: `${studentId}_${classId}_${dynamicTerm}_${currentAcademicYear}`
- Fields: six skill dimensions (punctuality, neatness, conduct, etc.) + metadata
- Save function: `db.saveStudentSkills(skills)` (called per student)

### Local Data Model
A single draft contains skills for ALL students in a class/term/academicYear, with explicit dirty tracking:
```typescript
interface SkillsDraft {
  schoolId: string;
  classId: string;
  term: number; // 1, 2, or 3
  academicYear: string;
  skills: Record<string, StudentSkills>; // Complete StudentSkills records
  dirtyStudentIds: string[]; // Tracks which students have unsynced changes
  lastModified: number;
  version: number;
}
```

### Local Storage Key Format
```
school-manager-skills-draft-[schoolId]-[classId]-[term]-[academicYear]
```
Example: `school-manager-skills-draft-sch123-class456-3-2026-2027`

### Why Single Draft Containing All Students?
Same reasoning as Remarks:
1. Efficiency: One localStorage operation
2. Atomicity: Prevents partial skill updates
3. Consistency: Matches assessment and remarks patterns
4. Logical unit of work: Teacher typically edits multiple skills for multiple students in one session

### Dirty Tracking Mechanism
- Each student's complete skills record is stored in a map keyed by `studentId`
- When any skill for a student is edited, their ID is added to `dirtyStudentIds` (if not already present)
- During sync:
  - For each student ID in `dirtyStudentIds`:
    * Validate context matches
    * Attempt `db.saveStudentSkills()` with that student's complete record
    * On success: Remove student ID from `dirtyStudentIds`
    * On error: Keep student ID in `dirtyStudentIds` for retry
  - Only delete the entire draft when `dirtyStudentIds` is empty (all students synced)
- This prevents already-synced students from being unnecessarily rewritten after a partial failure

### Important Note on Skills Structure
We store the **complete existing StudentSkills record** (not partial) to ensure:
- No data loss when reconstructing for backend save
- All skill fields are preserved, even those not currently being edited
- Backend contract is preserved exactly
- No risk of overwriting existing values with undefined/null

### Sync Lifecycle
Follows the same pattern as Remarks, adapted for skills data structure.

**Key Difference:** Skills draft stores complete StudentSkills records to preserve all fields and maintain backend contract compatibility.

### Multi-tab Strategy
Identical to Remarks: storage event listener with version checking on the complete draft.

### Reload/Offline Behavior Flow
Same pattern as Remarks.

## 6. Exact LocalStorage Schemas

### StudentAttendanceDraft
```typescript
{
  schoolId: string,        // e.g., "sch123"
  classId: string,         // e.g., "class456"
  date: string,            // "YYYY-MM-DD" format
  presentStudentIds: string[], // Array of student IDs
  isHoliday: boolean,      // true/false
  holidayReason: string,   // Holiday reason if isHoliday=true
  lastModified: number,    // Timestamp
  version: number          // Incrementing integer
}
```

### TeacherAttendanceDraft
```typescript
{
  schoolId: string,        // e.g., "sch123"
  teacherId: string,       // e.g., "teach789"
  date: string,            // "YYYY-MM-DD" format
  status: 'present' | 'absent',
  approvalStatus: 'pending' | 'approved' | 'rejected',
  isHoliday: boolean,
  holidayReason: string,
  lastModified: number,
  version: number
}
```

### RemarkDraft
```typescript
{
  schoolId: string,
  classId: string,
  term: number,           // 1, 2, or 3
  academicYear: string,   // e.g., "2026-2027"
  remarks: Record<string, {
    remark: string,
    behaviorTag: "Excellent" | "Good" | "Needs Improvement" | ""
  }>,
  dirtyStudentIds: string[], // Tracks which students have unsynced changes
  lastModified: number,
  version: number
}
```

### SkillsDraft
```typescript
{
  schoolId: string,
  classId: string,
  term: number,
  academicYear: string,
  skills: Record<string, StudentSkills>, // Complete StudentSkills records
  dirtyStudentIds: string[], // Tracks which students have unsynced changes
  lastModified: number,
  version: number
}
```

## 7. Sync Lifecycle (Unified Pattern)

All features follow this synchronized lifecycle:

### States
- `idle`: No pending changes
- `saving`: Manual save button active (online only)
- `syncing`: Background sync in progress
- `error`: Sync failed, data preserved locally
- `pending`: Local changes waiting to sync (shown when online but not currently syncing)

### Online Edit Flow
1. UI change → update local React state
2. Immediate update to in-memory draft reference
3. Debounced localStorage save (1000ms delay)
4. UI shows "Saved locally" if offline, or attempts immediate sync if online

### Offline Edit Flow
1. UI change → update local React state
2. Immediate update to in-memory draft reference
3. Debounced localStorage save (1000ms delay)
4. UI shows "Offline — changes saved locally"

### Reconnection Flow (Context-Specific)
> Synchronize the pending draft for the currently active feature/context when that context is opened or when the network transitions back to online.

1. `useNetworkStatus` detects transition to online
2. If not already syncing:
   a. Load draft from localStorage
   b. Validate context matches current UI
   c. Attempt backend save using existing functions
   d. On success: 
      - For Student/Teacher Attendance: Delete local draft
      - For Remarks/Skills: Remove successfully synced student IDs from dirtyStudentIds
      - Update sync status to idle
      - Show success indicator
   e. On error:
      - Preserve local draft
      - For Student/Teacher Attendance: Keep draft for retry
      - For Remarks/Skills: Keep failed student IDs in dirtyStudentIds
      - Set sync status to error
      - Show error indicator with retry promise

### Sync Failure Handling
- Local data NEVER deleted on sync failure
- Error state persists until next reconnection attempt
- User can manually trigger save to retry immediately
- No exponential backoff or automatic retry loops to prevent thrashing

### Partial Success Handling (Remarks/Skills Only)
- When some students sync successfully and others fail:
  - Successfully synced students are removed from dirtyStudentIds
  - Failed students remain in dirtyStudentIds
  - Draft is retained for retry of failed students
  - UI shows partial success indication
  - Next sync attempt only processes remaining dirty students

## 8. Conflict Strategy

### Multi-tab Conflict Detection
- Each feature monitors its specific localStorage key via `storage` event
- On storage event:
  1. Parse the new draft value
  2. Compare version with currently loaded draft version
  3. If newer version detected AND context matches:
     - Set `externalDraftChanged` flag
     - Show notification: "This [feature] was changed in another tab."
     - Provide "Review latest changes" button to reload draft

### Draft Loading Protection
- Before saving or syncing, check `hasStoredRevisionChanged()`
- If true, abort operation and set external change flag
- Prevents overwriting newer changes from other tabs

### Versioning
- Every draft save increments version number
- Version stored in localStorage and in-memory refs
- Enables accurate conflict detection

## 9. Multi-tab Strategy

### Core Mechanism (Shared Across Features)
1. Storage event listener on window for `storage` events
2. Handler function:
   - Constructs expected key for current context
   - If event.key matches expected key and event.newValue exists:
     - Attempts to parse new draft
     - Compares version with loaded draft version
     - If newer version and same context: flags external change
3. `hasStoredRevisionChanged()` function for pre-operation checks
4. UI component showing external change notification with action button

### Why Not More Complex Merging?
- Assessment uses "newer wins" with user confirmation
- Merging drafts is complex and error-prone
- For attendance: binary state (present/absent) makes merging difficult
- For remarks/skills: text fields could conflict in complex ways
- Simpler approach: detect conflict, warn user, let them choose to overwrite or keep

## 10. Retry Strategy

### No Automatic Retry Loops
- To prevent network thrashing and excessive Firestore writes
- Sync attempts only on:
  1. Manual save click (when online)
  2. Online→offline→online transition
  3. Page mount/focus (when online)

### Manual Retry
- When in error state, user can click save button to retry immediately
- Save button text changes based on state: "Save", "Saving...", "Retry"

### Sync Cooldown
- After sync attempt (success or failure), brief cooldown before next automatic attempt
- Prevents rapid-fire attempts during unstable connections
- Implemented by only triggering sync on distinct online transitions, not continuous polling

## 11. Error Handling

### localStorage Errors
- **Quota Exceeded**: Catch error, show toast "Unable to save locally — storage limit reached"
- **Malformed JSON**: Catch parse error, delete corrupt key, return null from load function
- **Missing Fields**: Validate all required fields after parse, delete invalid draft if missing
- **Wrong Context**: Validate schoolId/classId/etc. match current context, ignore if mismatch

### Sync Errors
- Network errors: Preserve local draft, set error state
- Permission errors: Preserve local draft, show appropriate error (don't retry automatically)
- Server errors: Preserve local draft, set error state for retry on reconnection
- Validation errors: Preserve local draft, show error (indicates data issue needing user attention)

### Recovery from Corruption
- Any error in loadDraft() returns null
- Component treats null as no draft present
- User starts fresh but doesn't lose UI state (React state remains)
- Next save will create new clean draft

## 12. Activity Logging Behavior

### Recommendation: Log only after successful backend synchronization
**Why this is safest:**
1. **Accuracy**: Logs reflect what was actually saved to backend
2. **No False Records**: Avoids logging "success" when data is only local
3. **Consistency**: Matches existing online-only logging behavior
4. **Audit Trail**: Creates true record of backend operations

### Implementation
- Activity logging calls moved inside successful sync blocks
- Not called during offline saves or localStorage persistence
- Only called after `db.save*` functions resolve successfully
- Maintains same metadata structure as existing online logs

### Per-Feature Logging
- **Student Attendance**: Log after successful `db.saveAttendance()`
- **Teacher Attendance**: Log after successful `db.saveTeacherAttendance()`
- **Remarks**: Log after each successful `db.saveStudentRemark()` (per student)
- **Skills**: Log after each successful `db.saveStudentSkills()` (per student)

## 13. Performance Considerations

### Debounced Persistence
- 1000ms delay on localStorage saves during active editing
- Prevents excessive localStorage writes on rapid changes
- Same pattern as Assessment implementation

### Batch Operations Where Appropriate
- Remarks/Skills: LocalStorage operations are batched (one save for all students)
- Backend operations remain per-student (matching existing API)
- No change to backend call patterns to preserve existing behavior

### Memory Efficiency
- Drafts stored only for active context (school/class/date/term/etc.)
- Old drafts cleaned up on context change or successful sync
- No accumulation of stale drafts

### UI Responsiveness
- LocalState updates immediately for instant UI feedback
- localStorage persistence happens asynchronously
- UI reflects sync status without blocking interactions

## 14. Files to Create

### Storage Utilities (following AssessmentDraftStorage pattern)
1. `src/studentAttendanceDraftStorage.ts`
2. `src/teacherAttendanceDraftStorage.ts`
3. `src/remarkDraftStorage.ts`
4. `src/skillsDraftStorage.ts`

### Each storage utility will contain:
- `getDraftKey()`: Context-specific key generation
- `saveDraft()`: Persist draft to localStorage with validation
- `loadDraft()`: Load and validate draft from localStorage
- `deleteDraft()`: Remove draft from localStorage
- Optional: `clearAllDraftsForSchool()` (on logout)

## 15. Files to Modify

### 1. `pages/teacher/Attendance.tsx`
- Add import for `useNetworkStatus` and new storage utility
- Add `isOnline` state and sync status state
- Modify `handleChange()` to update in-memory draft reference
- Add debounced save logic for localStorage
- Modify `handleSave()` to:
  - Check online status
  - If online: attempt backend save, then clear local draft on success
  - If offline: save to localStorage only
  - Show appropriate UI indicators
- Add useEffect for reconnection sync
- Add multi-tab storage event listener
- Add UI indicators for offline/sync/error states
- Add external change detection and recovery UI

### 2. `pages/teacher/TeacherAttendance.tsx`
- Similar modifications as Attendance.tsx
- Adapted for teacher attendance data structure and functions
- Add offline support to `handleMarkAttendance()` and `handleMarkHoliday()`

### 3. `pages/teacher/WriteRemarks.tsx`
- Add import for `useNetworkStatus` and remark storage utility
- Modify `handleRemarkChange()` to update in-memory draft reference and mark student as dirty
- Add debounced save logic
- Modify `handleSave()` to:
  - Check online status
  - If online: iterate through dirtyStudentIds, call `db.saveStudentRemark()` for each
  - If offline: save complete draft to localStorage
  - Show appropriate saving/syncing indicators
- Add reconnection sync useEffect
- Add multi-tab protection
- Add UI indicators

### 4. `pages/teacher/EditSkills.tsx`
- Similar modifications as WriteRemarks.tsx
- Adapted for skills data structure and `db.saveStudentSkills()` function
- Handle complete StudentSkills records in draft storage
- When skill changed, mark student as dirty if not already

## 16. Files Explicitly Protected (DO NOT MODIFY)

1. `src/assessmentDraftStorage.ts` - Assessment offline storage (reference)
2. `pages/teacher/Assessment.tsx` - Assessment page (reference implementation)
3. `hooks/useNetworkStatus.ts` - Network status hook (already used by Assessment)
4. Any files unrelated to the four target features
5. Backend/Firestore structure (unless critical bug discovered during implementation)

## 17. Risks and Mitigations

### Risk: localStorage Quota Exceeded
- **Mitigation**: Catch quota errors, show user-friendly message, prevent silent failures
- **Monitoring**: Storage utilities return boolean success/failure

### Risk: Multi-tab Sync Conflicts
- **Mitigation**: Use proven Assessment pattern: storage event listener + version checking + user confirmation
- **Testing**: Test with multiple browser tabs open simultaneously

### Risk: Data Loss on Browser Crash
- **Mitigation**: Debounced saving (1000ms) minimizes window of vulnerability
- **Recovery**: Page reload always attempts to load draft from localStorage

### Risk: Stale Drafts After Context Change
- **Mitigation**: Validate context (schoolId, classId, date/term/academicYear) on every load
- **Clear drafts**: When context changes, clear in-memory refs and allow fresh draft

### Risk: Sync Throttling During Network Flapping
- **Mitigation**: Only trigger sync on distinct online transitions, not continuous polling
- **Cooldown**: Implicit cooldown from transition-based triggering

### Risk: Inconsistent UI States
- **Mitigation**: Follow exact same state machine and UI patterns as Assessment
- **Consistency**: Use identical status values and similar UI indicators

### Risk: Performance Degradation with Many Students
- **Mitigation**: 
  - localStorage operations are O(1) for the draft (single read/write)
  - Only changed student records trigger backend saves during sync
  - Debounced saving prevents excessive localStorage writes

## 18. Testing Strategy

### Per Feature Testing Scenarios

#### TEST 1 — NORMAL ONLINE
- [ ] Open feature online
- [ ] Enter data for multiple students/records
- [ ] Save
- [ ] Verify server receives correct data
- [ ] Reload
- [ ] Verify data remains correct

#### TEST 2 — START OFFLINE
- [ ] Disable internet
- [ ] Open feature
- [ ] Enter data
- [ ] Save
- [ ] Confirm no data loss (UI shows saved locally)
- [ ] Confirm local pending state visible

#### TEST 3 — GO OFFLINE DURING USE
- [ ] Start online
- [ ] Open feature
- [ ] Enter some data
- [ ] Disconnect internet
- [ ] Enter more data
- [ ] Confirm all changes remain available in UI

#### TEST 4 — RELOAD OFFLINE
- [ ] Create pending changes
- [ ] Disconnect internet
- [ ] Reload page
- [ ] Confirm pending changes are restored in UI

#### TEST 5 — RECONNECT
- [ ] Create pending changes offline
- [ ] Restore internet
- [ ] Confirm pending records automatically synchronize
- [ ] Confirm successful sync state
- [ ] Confirm local pending record cleared/marked synced only after success

#### TEST 6 — SYNC FAILURE
- [ ] Simulate backend failure (e.g., temporarily invalid credentials)
- [ ] Create changes offline
- [ ] Attempt to sync
- [ ] Confirm:
  - Data remains locally
  - User not forced to re-enter data
  - System shows error state
  - Manual retry works after fixing backend

#### TEST 7 — MULTIPLE PENDING RECORDS
- [ ] Create multiple offline changes across different students/dates
- [ ] Reconnect
- [ ] Confirm all valid pending changes synchronize
- [ ] Verify no duplicate records created

#### TEST 8 — EXISTING ONLINE FUNCTIONALITY
- [ ] Verify Assessment still works completely
- [ ] Verify Student Attendance still works online
- [ ] Verify Teacher Attendance still works online
- [ ] Verify Remarks still work online
- [ ] Verify Skills still work online
- [ ] Verify login still works
- [ ] Verify Teacher Dashboard navigation still works
- [ ] Verify existing filters/date/class/subject selection still work
- [ ] Verify existing Firestore writes still work

## 19. Rollback Strategy

### If Issues Arise During Implementation
1. **Git-based rollback**: Use git to revert to pre-implementation state
2. **Feature flags**: Not implemented - instead, implement one feature at a time with verification
3. **Selective removal**: If one feature causes issues, can disable just that feature by:
   - Not importing its storage utility
   - Reverting its save logic to online-only
   - Keeping UI changes minimal and contained

### Verification Before Moving to Next Feature
After implementing each feature:
1. Run TypeScript compiler: `npm run typecheck`
2. Run linter if configured
3. Manual testing of all 8 test scenarios above
4. Verify Assessment still works completely
5. Only proceed to next feature when current feature passes all tests

## 20. Implementation Order Confirmation

Following the recommended order from audit:
1. **Student Attendance** (Attendance.tsx) - Simplest, establishes pattern
2. **Teacher Attendance** (TeacherAttendance.tsx) - Similar to student attendance
3. **Remarks** (WriteRemarks.tsx) - Introduces multi-record concept
4. **Skills / Edit Skills** (EditSkills.tsx) - Most complex but follows same pattern

This allows pattern refinement and confidence building before moving to more complex features.

## 21. Key Design Decisions Summary

### Assessment Files Remain Untouched
- ✅ `src/assessmentDraftStorage.ts` - NOT MODIFIED
- ✅ `pages/teacher/Assessment.tsx` - NOT MODIFIED
- ✅ `hooks/useNetworkStatus.ts` - NOT MODIFIED

### Backend Contracts Remain Unchanged
- ✅ All offline synchronization uses existing `db.save*` functions exactly as they exist
- ✅ No changes to Firestore collections, document structures, or backend endpoints
- ✅ Local storage structures mirror backend data contracts precisely

### Skills Storage Uses Complete Records
- ✅ `skills: Record<string, StudentSkills>` (complete records, not partial)
- ✅ Preserves all skill fields even when only some are edited
- ✅ Ensures backend contract compatibility
- ✅ Prevents data loss or field corruption

### Explicit Per-Student Dirty Tracking
- ✅ Remarks: `dirtyStudentIds: string[]` tracks which students have unsynced remark changes
- ✅ Skills: `dirtyStudentIds: string[]` tracks which students have unsynced skill changes
- ✅ Enables partial sync success handling
- ✅ Prevents rewriting already-synced students after partial failure

### Context-Specific Synchronization Scope
- ✅ Only synchronizes the pending draft for the currently active feature/context
- ✅ Triggered when context is opened or network transitions back to online
- ✅ No global background queue or school-wide synchronization
- ✅ Simple, predictable sync behavior

### Multi-Tab Protection
- ✅ Storage event listener with version checking
- ✅ Prevents silent overwriting of newer drafts from other tabs
- ✅ User confirmation required to accept external changes
- ✅ Follows proven Assessment pattern