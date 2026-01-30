# Fix for "Internal" Error in Teacher Repair

## Problem

When repairing a teacher account, the error message displayed was just "Internal" instead of the actual error details.

## Root Cause

The error handling in the `repairUserSchoolId` Cloud Function had a faulty check:

```javascript
// ❌ WRONG: error.code never contains "HttpsError"
if (error.code && error.code.includes("HttpsError")) {
  throw error;
}
```

This logic failed to re-throw HttpsError objects, causing them to be wrapped in a generic "internal" error instead.

## Solution Implemented

### 1. Fixed Cloud Function Error Handling

**File:** `functions/index.js` (line 756-765)

Changed from:

```javascript
catch (error) {
  console.error("Error repairing user schoolId:", error);
  if (error.code && error.code.includes("HttpsError")) {  // ❌ Never true
    throw error;
  }
  throw new functions.https.HttpsError(
    "internal",
    "Failed to repair user account.",
    error.message,
  );
}
```

To:

```javascript
catch (error) {
  console.error("Error repairing user schoolId:", error);
  // If it's already an HttpsError, re-throw it
  if (error instanceof functions.https.HttpsError) {  // ✅ Correct check
    throw error;
  }
  // Otherwise, wrap it in an HttpsError with details
  throw new functions.https.HttpsError(
    "internal",
    `Failed to repair user account: ${error.message || error.toString()}`,  // ✅ Include actual error
  );
}
```

### 2. Enhanced UI Error Message Display

**File:** `pages/admin/ManageTeachers.tsx` (line 165-191)

Updated error handling to properly extract and display error messages:

```typescript
} catch (error: any) {
  console.error("Error repairing teacher:", error);
  // Extract error message from Firebase function error
  let errorMsg = "Failed to repair teacher account.";
  if (error.details) {
    errorMsg = error.details;
  } else if (error.message) {
    errorMsg = error.message;
  }
  showToast(errorMsg, { type: "error", duration: 6000 });
}
```

## Result

Now when teacher repair fails, users see the **actual error message** instead of just "Internal":

### Before ❌

```
⚠️ Internal
```

### After ✅

```
⚠️ Failed to repair user account: Target user is not a teacher.
⚠️ Failed to repair user account: You can only repair teachers in your own school.
⚠️ Failed to repair user account: Target user not found.
```

## Files Modified

- `functions/index.js` - Fixed error instanceof check
- `pages/admin/ManageTeachers.tsx` - Enhanced error message extraction

## Testing

The fix provides clear, actionable error messages for all repair failure scenarios:

- ✅ User not found
- ✅ User not a teacher
- ✅ Cross-school permission denied
- ✅ Firestore update failed (with details)

## Deployment

Simply deploy the updated Cloud Functions:

```bash
firebase deploy --only functions
```

No client-side deployment required (but update hosted code if using the improved error display).
