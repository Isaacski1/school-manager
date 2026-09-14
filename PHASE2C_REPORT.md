# Phase 2C Firestore Quota Remediation Report

## PHASE 2C RESULT
STATUS: STOPPED

FILES CHANGED: NONE

## VERIFIED fetchStats() DEPENDENCIES
fetchStats() consumes the following values from getDashboardStats():
- studentsCount → used for stats state update (line 2017) and sessionStorage caching (line 2031)
- teachersCount → used for stats state update (line 2018) and sessionStorage caching (line 2032)
- gender.male → used for stats state update (line 2020) and sessionStorage caching (line 2034)
- gender.female → used for stats state update (line 2021) and sessionStorage caching (line 2035)
- classAttendance → used for stats state update (line 2022) and sessionStorage caching (line 2036)

## CHANGE MADE
No changes were made. The optimization cannot be safely implemented because fetchStats() requires detailed data beyond simple counts.

## FIRESTORE READ PATH
BEFORE:
```
fetchStats()
→ getDashboardStats()
→ full students read (for studentsCount, gender, recent students, etc.)
→ full users read (for teachersCount, teacher details, etc.)
→ other dashboard reads (attendance, etc.)
```

AFTER (would be if safe):
```
fetchStats()
→ getDashboardSummary()
→ count aggregations only
```

However, this change is NOT SAFE because fetchStats() requires gender and classAttendance data.

## BEHAVIOR PRESERVED
All existing behavior is preserved since no changes were made:
- Student count remains correct
- Teacher count remains correct
- Gender statistics remain correct
- Class attendance remains correct
- School isolation unchanged
- Polling interval unchanged (30000ms)
- Cache behavior unchanged
- Error handling unchanged
- UI formatting unchanged

## VALIDATION
* Typecheck: No new errors introduced (pre-existing unrelated errors remain)
* Build: No new errors introduced (build succeeds as before)
* New errors: None
* Pre-existing errors: Unrelated TypeScript errors in codebase (not caused by this change)

## READ REDUCTION
No reduction achieved as the optimization was blocked by dependencies. Architectural analysis shows that if fetchStats() only needed counts, we could eliminate:
- Full students collection read (replaced with student count aggregation)
- Full users collection read (replaced with teacher count aggregation)
But this is not possible due to gender and classAttendance dependencies.

## REMAINING HOTSPOTS
1. Full students collection read in getDashboardStats() (required for gender statistics and class attendance calculations)
2. Full users collection read in getDashboardStats() (required for teacher details in attendance mapping)
3. All attendance-related queries
4. Platform broadcasts queries
5. Payments queries
6. Assessments queries

## NEXT PHASE RECOMMENDATION
Phase 2D: Separate gender statistics calculation
- Investigate whether gender counts can be obtained via a lightweight query (e.g., filtering students by gender field)
- Determine if this can be decoupled from the full student read while preserving exact same behavior
- Do not implement - audit only