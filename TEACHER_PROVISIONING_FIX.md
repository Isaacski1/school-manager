# Teacher Provisioning Fix

## Overview

Fixed a critical bug where teachers created by school_admin could not log in due to missing `schoolId` in their Firestore profile.

## Changes Made

### 1. Cloud Function: `createTeacherAccount` (functions/index.js)

**What it does:**

- Called by school_admin only
- Reads caller's schoolId from their Firestore profile
- Creates Firebase Auth user with temp password
- Creates Firestore users/{uid} document with:
  - fullName, email, role="teacher"
  - schoolId (inherited from caller)
  - status="active"
  - createdAt=serverTimestamp
- Sends password reset email
- Logs activity to activityLogs collection
- Returns temp password and resetLink

**Security:**

- Only school_admin can call (permission-denied error otherwise)
- Uses Admin SDK, bypassing Firestore rules
- Atomically creates Auth + Firestore doc

### 2. Service Wrapper (services/functions.ts)

**Added:**

```typescript
export const createTeacherAccount = httpsCallable(
  functions,
  "createTeacherAccount",
);
```

### 3. Updated "Add Teacher" Flow (pages/admin/ManageTeachers.tsx)

**Changes:**

- Removed direct Firebase Auth creation with secondary app
- Form now only requires: fullName, email
- No password field (Cloud Function generates temp password)
- Calls `createTeacherAccount()` Cloud Function
- Shows success modal with temp password for sharing with teacher
- Copy-to-clipboard buttons for email & temp password

**User Experience:**

1. Admin clicks "Add Teacher"
2. Enters full name and email
3. Clicks "Create Teacher"
4. Success modal shows:
   - Teacher's email
   - Temporary password
   - Note: Password reset link sent to email
5. Admin can copy credentials and share with teacher

### 4. Enhanced AuthContext (context/AuthContext.tsx)

**No changes needed** — already properly handles teachers.

### 5. Enhanced authProfile.ts (services/authProfile.ts)

**Added validation:**

- Checks that teacher/school_admin has schoolId
- For missing schoolId: throws descriptive error
- Teachers get clear message: "Teacher account is incomplete: missing schoolId"
- Validates school is active (for both admin and teacher)

### 6. SchoolContext (context/SchoolContext.tsx)

**Already correct** — Shows "No school assigned to your account" when schoolId missing.

## Field Naming Consistency

All files use consistent naming:

- `schoolId` (camelCase, not schoolID)
- `fullName` (camelCase)
- role values: "super_admin", "school_admin", "teacher"

## Test Checklist

### ✅ Test A: Teacher Account Creation

**Steps:**

1. Log in as school_admin
2. Go to "Manage Teachers"
3. Click "Add Teacher"
4. Enter:
   - Full Name: "John Smith"
   - Email: "john.smith@school.com"
5. Click "Create Teacher"

**Expected Result:**

- ✓ Success modal appears
- ✓ Modal shows email & temp password
- ✓ Copy buttons work
- ✓ Firestore: `users/{uid}` doc created with role="teacher", schoolId=admin's schoolId
- ✓ Firebase Auth user created with email
- ✓ Activity logged in activityLogs collection
- ✓ Password reset email sent to john.smith@school.com

**Verify Firestore:**

```
users/{newUid} should contain:
{
  fullName: "John Smith",
  email: "john.smith@school.com",
  role: "teacher",
  schoolId: "actual_school_id",
  status: "active",
  createdAt: <server timestamp>
}
```

### ✅ Test B: Teacher Login

**Steps:**

1. Open login page
2. Enter email: john.smith@school.com
3. Enter temp password (from success modal)
4. Click Sign In

**Expected Result:**

- ✓ Teacher authenticates (Firebase Auth)
- ✓ loadUserProfile finds Firestore users/{uid} doc
- ✓ User profile loads with correct schoolId
- ✓ SchoolContext loads school data
- ✓ Teacher redirects to teacher dashboard
- ✓ Teacher sees classes/attendance/assessment sections

### ✅ Test C: School Isolation

**Prerequisites:**

- School A (with admin & teacher)
- School B (with different admin & teacher)

**Steps:**

1. Log in as Teacher from School A
2. Check browser console: user.schoolId should be School A's id
3. Log out
4. Log in as Teacher from School B
5. Check browser console: user.schoolId should be School B's id

**Expected Result:**

- ✓ Each teacher has correct schoolId
- ✓ Data fetch queries filtered by schoolId
- ✓ Teacher A cannot view School B attendance/students/etc.

### ✅ Test D: Error Handling

**Scenario 1: Teacher without schoolId in Firestore**

- Manually edit users/{uid} to remove schoolId
- Try to log in

**Expected Result:**

- ✓ Clear error: "Teacher account is incomplete: missing schoolId"
- ✓ User signed out automatically
- ✓ Error message displayed

**Scenario 2: Inactive School**

- Create teacher for School A
- Mark School A as status="inactive" in Firestore
- Try teacher login

**Expected Result:**

- ✓ Clear error: "Your school has been deactivated"
- ✓ User signed out

**Scenario 3: Non-admin tries to create teacher**

- Log in as teacher
- Try to call createTeacherAccount function

**Expected Result:**

- ✓ Error: "Only school_admin can create teachers"
- ✓ No teacher created

**Scenario 4: Duplicate email**

- Create teacher with email "test@school.com"
- Try to create another teacher with same email

**Expected Result:**

- ✓ Error: "A user with this email already exists"
- ✓ No second user created

### ✅ Test E: Firestore Rules

**Current recommendation:** Cloud Functions use Admin SDK, so rules don't block them.

**Rules should prevent:**

- ❌ school_admin from directly creating users/{uid} docs
- ✓ Cloud Function can create users docs

## Deployment Checklist

- [ ] Deploy `functions/index.js` to Firebase Functions
- [ ] Verify function is live: `firebase functions:list`
- [ ] Deploy client code (updated ManageTeachers.tsx)
- [ ] Test all scenarios above
- [ ] Monitor Cloud Functions logs for errors
- [ ] Verify activity logs in Firestore: activityLogs collection

## Firestore Rules Recommendation

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Super admin full access
    match /{document=**} {
      allow read, write: if request.auth.uid == "SUPER_ADMIN_UID";
    }

    // Teachers cannot create users docs
    match /users/{uid} {
      allow read: if request.auth.uid == uid || request.auth.uid == "SUPER_ADMIN_UID";
      allow write: if false; // Cloud Function only (uses Admin SDK)
    }

    // Rest of rules...
  }
}
```

## Troubleshooting

**Teacher created but can't log in:**

1. Check Firestore: `users/{uid}` doc exists with schoolId
2. Check Cloud Functions logs for errors
3. Verify schoolId matches admin's schoolId

**"No school assigned to your account" error:**

1. Check Firestore: users/{uid}.schoolId exists
2. Check Firestore: schools/{schoolId} exists and status="active"
3. Check password reset email was sent

**Cloud Function not found:**

1. Verify `exports.createTeacherAccount` in functions/index.js
2. Run `firebase deploy --only functions`
3. Check Firebase Console > Cloud Functions for `createTeacherAccount`

## Files Modified

- `functions/index.js` — Added createTeacherAccount callable
- `services/functions.ts` — Added createTeacherAccount export
- `pages/admin/ManageTeachers.tsx` — Complete rewrite of form logic
- `services/authProfile.ts` — Enhanced validation for teachers

## Backward Compatibility

- Super admin role unchanged
- School admin creation unchanged
- Existing teachers still work (if they have schoolId)
- No breaking changes to API
