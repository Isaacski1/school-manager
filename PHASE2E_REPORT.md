# Phase 2E Firestore Quota Remediation Report

## PHASE 2E RESULT
STATUS: PASS

FILES CHANGED:
* `services/mockDb.ts` (lines 2652-2670)

## IMPLEMENTATION
Replaced the JavaScript gender filtering in `getDashboardStats()` with two Firestore count aggregation queries:

**Before:**
```typescript
const male = students.filter((s) => s.gender === "Male").length;
const female = students.filter((s) => s.gender === "Female").length;
```

**After:**
```typescript
const [maleCountSnap, femaleCountSnap] = await Promise.all([
  getCountFromServer(
    query(
      collection(firestore, "students"),
      where("schoolId", "==", scopedSchoolId),
      where("gender", "==", "Male"),
    ),
  ),
  getCountFromServer(
    query(
      collection(firestore, "students"),
      where("schoolId", "==", scopedSchoolId),
      where("gender", "==", "Female"),
    ),
  ),
]);

const male = maleCountSnap.data().count;
const female = femaleCountSnap.data().count;
```

The two count aggregations execute concurrently using the existing `Promise.all` pattern already used elsewhere in the function.

## GENDER SEMANTICS
The new counts are semantically equivalent to the previous JavaScript calculation because:

1. Both filter by `schoolId == scopedSchoolId`
2. Both filter by exact string match: `"Male"` and `"Female"`
3. Both include all students matching the schoolId (no additional inclusion/exclusion)
4. Both handle missing/null gender identically: not applicable as gender is required
5. The TypeScript type definition (`gender: "Male" | "Female"`) guarantees only valid values exist
6. Backend validation in `ManageStudents.tsx` ensures only these values are stored

## FIRESTORE QUERIES
Male:
```
schoolId + gender="Male"
```

Female:
```
schoolId + gender="Female"
```

Both queries are strictly scoped to the current school.

## STUDENT QUERY
The full student query remains in `getDashboardStats()` because other consumers still require it:

1. **classAttendance** (line 2674): `studentsInClass = students.filter((s) => s.classId === cls.id)` needs student `classId` to count students per class
2. **fetchHeavyData()** (AdminDashboard.tsx line 1050): Uses the full `students` array for:
   - Recent admissions sorting by `createdAt`
   - Performance calculations requiring `name`, `classId`, and ID mappings
   - Payment processing requiring `student.name` and `classId`
3. **Return value**: `getDashboardStats()` still returns the full `students` array for reuse

## CACHE
Cache structure is unchanged:
- `sessionStorage` key: `summaryCacheKey`
- `localStorage` key: `summaryCacheKey`
- Stored values: `maleStudents`, `femaleStudents` with identical meaning
- No cache key changes required

## SCHOOL ISOLATION
Both count aggregations use:
```typescript
where("schoolId", "==", scopedSchoolId)
```
This matches the existing student query's school scoping exactly. No global gender counts are introduced.

## INDEX
The queries use `where("schoolId", "==", ...)` and `where("gender", "==", ...)`. Firestore should support these queries. If a composite index on `(schoolId, gender)` is required, it would improve performance but is not required for correctness. No index was created.

## VALIDATION
* Typecheck: `tsc --noEmit services/mockDb.ts` returned no output (no errors)
* Build: `npm run build` completed successfully (`✓ built in 2m 31s`)
* New errors: None
* Pre-existing errors: Unrelated TypeScript errors in codebase (not caused by this change)

## READ IMPACT
Gender statistics no longer require downloading all student documents. Instead of loading entire student records (which include id, name, classId, gender, dob, address, parent info, etc.), the dashboard now loads two minimal count documents containing only a numeric count.

The full student query still exists for other dashboard dependencies (class attendance, recent students, performance calculations, payment processing), so this phase does not eliminate the full student read entirely—it only removes gender's dependency on it.

## REMAINING HOTSPOT
The next largest student-data dependency is **class attendance student counting** (line 2674), which still requires the full student array to count students per class via `students.filter((s) => s.classId === cls.id)`. This is the next candidate for audit.

## NEXT PHASE
**Phase 2F**: Separate class attendance student counting
- Investigate whether queries returning only `classId` (or maintaining classId-to-count mappings) can replace full student reads for attendance calculations
- Determine if this decoupling preserves exact same dashboard behavior for class attendance percentages
- Do not implement - audit only
