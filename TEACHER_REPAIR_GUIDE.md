# Teacher Provisioning Fix - Repair Guide

## Overview

This guide covers the complete teacher provisioning system including:

1. **Creating new teachers** with proper `schoolId`
2. **Repairing broken teacher accounts** that are missing `schoolId`
3. **Verifying teacher login** works after provisioning/repair
4. **Testing school isolation** to prevent cross-school data access

---

## Problem: Teachers Can't Log In

### Symptom

- Teacher created in Firebase Auth ✅
- Firestore `users/{uid}` missing or incomplete ❌
- Login shows error: **"Teacher account is incomplete: missing schoolId"**

### Root Cause

Teacher was created without the `schoolId` field in Firestore, preventing proper authentication and school data access.

---

## Solution: Two Approaches

### Approach A: Create Teacher Correctly (Preferred for New Teachers)

**Use the "Add Teacher" UI** in Admin Dashboard

**Steps:**

1. Log in as school_admin
2. Go to Admin Dashboard → Manage Teachers
3. Click "Add Teacher" button
4. Fill in:
   - Full Name: (e.g., "Alice Johnson")
   - Email: (e.g., "alice@school.com")
5. Click "Create Teacher"
6. Success modal shows temp password and reset link
7. Share credentials with teacher

**What happens:**

- Cloud Function `createTeacherAccount` runs on server
- Creates Firebase Auth user
- Creates Firestore `users/{uid}` with `schoolId` automatically
- Sends password reset email
- Teacher can log in immediately

### Approach B: Repair Existing Broken Teacher

**Use the "Repair Account" button** in Teacher list

**Steps:**

1. Log in as school_admin
2. Go to Admin Dashboard → Manage Teachers
3. Look for teachers with ⚠️ "Missing schoolId" status
4. Click wrench icon (Repair button)
5. Confirm the repair in modal
6. Success message shows

**What happens:**

- Cloud Function `repairUserSchoolId` runs on server
- Updates Firestore `users/{uid}` with missing `schoolId`
- Teacher can now log in

---

## Complete Test Scenarios

### Test A: Create Teacher (New Provisioning)

**Objective:** Verify teacher accounts are created with proper Firestore structure

**Prerequisites:**

- Logged in as school_admin for School A

**Steps:**

```
1. Navigate to: Admin Dashboard > Manage Teachers
2. Click "Add Teacher" button
3. Fill form:
   - Full Name: "John Smith"
   - Email: "john.smith@school.com"
4. Click "Create Teacher"
5. Review success modal:
   - Shows email: john.smith@school.com
   - Shows temp password (e.g., ABC123Def456)
   - Note: "A password reset link has been sent to their email inbox"
6. Click "Done" to close modal
```

**Expected Results:**
✅ Success modal appears without errors
✅ Firestore record created:

- Path: `users/{newTeacherUid}`
- Fields:
  `     {
      fullName: "John Smith",
      email: "john.smith@school.com",
      role: "teacher",
      schoolId: <admin's schoolId>,
      status: "active",
      createdAt: <timestamp>
    }
    `
  ✅ Firebase Auth user created with email `john.smith@school.com`
  ✅ Activity logged in `activityLogs` collection
  ✅ Teacher appears in list with ✓ Complete status

**Verify in Firebase Console:**

```
1. Go to Authentication > Users
2. Find: john.smith@school.com → should exist
3. Go to Firestore > users collection
4. Find doc with email john.smith@school.com
5. Verify schoolId field is populated (not null/undefined)
```

---

### Test B: Repair Broken Teacher (Account Recovery)

**Setup (Simulate Broken Account):**

```
1. Log in as school_admin
2. Go to Manage Teachers
3. Create a teacher normally (Test A completes)
4. Then manually delete the schoolId field:
   - Go to Firestore Console
   - Find users/{teacherUid}
   - Delete the schoolId field (simulate broken account)
   - Save
```

**Now Repair It:**

```
1. Refresh Admin Teachers page (or go back to it)
2. Teacher appears in list with ⚠️ "Missing schoolId" status
3. See wrench icon (Repair button) in Actions column
4. Click the wrench icon
5. Confirmation modal appears:
   "Repair Teacher Account?
    This teacher's account is missing the required schoolId field.
    This action will add your school's ID to their profile..."
6. Click "Repair Account" button
7. Wait for success message
```

**Expected Results:**
✅ Repair modal appears and closes
✅ Toast shows: "Teacher account repaired. schoolId set to <schoolId>"
✅ Teacher list refreshes
✅ Teacher now shows ✓ Complete status (no more warning)
✅ Wrench icon gone (repair successful)
✅ Firestore record updated:

- schoolId field now populated
- updatedAt timestamp added

**Verify in Firebase Console:**

```
1. Go to Firestore > users/{teacherUid}
2. Verify schoolId field is now present and matches admin's schoolId
3. Check activityLogs collection for entry:
   {
     eventType: "teacher_repair_schoolid",
     schoolId: <schoolId>,
     repairedBy: <adminUid>,
     teacherUid: <brokenTeacherUid>,
     ...
   }
```

---

### Test C: Teacher Login After Provisioning/Repair

**Objective:** Verify teacher can successfully log in and access dashboard

**Test C1: New Teacher (From Test A)**

```
1. Log out (if logged in as admin)
2. Go to login page: /login
3. Enter email: john.smith@school.com
4. Enter password: <use temp password from Test A success modal>
5. Click "Sign In"
```

**Expected Results:**
✅ Auth succeeds (no login error)
✅ Redirected to: /teacher dashboard
✅ Teacher Dashboard displays:

- Attendance marking section
- Assessment section
- Class notice board
- Teacher attendance summary
  ✅ Browser console logs: `user.role = "teacher"`, `user.schoolId = <correct>`

**Test C2: Repaired Teacher (From Test B)**

```
1. Log out (if logged in)
2. Go to login page: /login
3. Enter email: <repaired teacher email>
4. Enter password: <temporary password from original Test A>
5. Click "Sign In"
6. System prompts for password reset (Firebase)
7. Enter new password
8. Verify logged in successfully
```

**Expected Results:**
✅ Auth succeeds
✅ Profile loads without error
✅ Redirected to teacher dashboard
✅ Browser console shows: `user.schoolId = <correct schoolId>`
✅ No "School Access Issue" error

**If Login Fails - Debugging Checklist:**

```
[ ] Firestore: users/{teacherUid}.schoolId exists and not null
[ ] Firestore: schools/{schoolId} exists with status="active"
[ ] Firebase Auth: user exists with correct email
[ ] Browser console: Check error message (copy it)
[ ] Cloud Functions log: Check createTeacherAccount/repairUserSchoolId logs
[ ] Network tab: Check response status codes
```

---

### Test D: School Data Isolation (Cross-School Security)

**Objective:** Verify teachers can only see data from their assigned school

**Setup: Create Two Schools**

```
Create via Super Admin panel:
- School A: schoolId = "schoolA123", name = "School A"
- School B: schoolId = "schoolB456", name = "School B"

For each school, create admin accounts:
- School A admin: admin.a@school.com, role = "school_admin", schoolId = "schoolA123"
- School B admin: admin.b@school.com, role = "school_admin", schoolId = "schoolB456"
```

**Create Teachers in Each School:**

```
As admin.a@school.com (School A):
1. Go to Manage Teachers
2. Create teacher: teacher.a@school.com
3. Verify Firestore: users/{teacher.a.uid}.schoolId = "schoolA123"

As admin.b@school.com (School B):
1. Go to Manage Teachers
2. Create teacher: teacher.b@school.com
3. Verify Firestore: users/{teacher.b.uid}.schoolId = "schoolB456"
```

**Test Data Access:**

```
As teacher.a@school.com (School A):
1. Log in
2. Go to Attendance > Mark Attendance
3. Mark attendance for Class A (in School A)
4. Check Firestore: attendance records have schoolId="schoolA123"
5. Verify can only see School A data

As teacher.b@school.com (School B):
1. Log in
2. Go to Attendance > Mark Attendance
3. Mark attendance for Class B (in School B)
4. Check Firestore: attendance records have schoolId="schoolB456"
5. Verify can only see School B data
```

**Expected Results:**
✅ Teacher A has correct schoolId = "schoolA123"
✅ Teacher B has correct schoolId = "schoolB456"
✅ Teacher A cannot see/access School B data
✅ Teacher B cannot see/access School A data
✅ Firestore records tagged with correct schoolId
✅ No data leakage between schools

**Security Verification in Console:**

```
// Teacher A should only see School A data
Query: db.collection('attendance').where('schoolId', '==', 'schoolA123')
Expected: Results for School A only

// Teacher B should only see School B data
Query: db.collection('attendance').where('schoolId', '==', 'schoolB456')
Expected: Results for School B only
```

---

### Test E: Permission Checks (Who Can Create/Repair)

**Test E1: Only school_admin Can Create Teachers**

```
Test:
1. Log in as regular teacher
2. Open browser console
3. Try to call: createTeacherAccount({fullName: "Test", email: "test@x.com"})
```

**Expected Result:**
❌ Error: "permission-denied: Only school_admin or super_admin can create teachers"
❌ No teacher created

**Test E2: Only super_admin Can Create for Other Schools**

```
Setup:
1. Log in as super_admin
2. Get schoolId of School B

Test:
1. Open browser console
2. Call with explicit schoolId:
   createTeacherAccount({
     fullName: "Test",
     email: "test@schoolb.com",
     schoolId: "schoolB456"  // Different school
   })
```

**Expected Result:**
✅ Success: Teacher created for School B
✅ Firestore shows: users/{uid}.schoolId = "schoolB456"

**Test E3: school_admin Cannot Repair Other Schools' Teachers**

```
Setup:
1. Have teacher.a in School A
2. Log in as admin.b (School B)

Test:
1. Open browser console
2. Try to repair teacher.a:
   repairUserSchoolId({ targetUid: "teacher.a.uid" })
```

**Expected Result:**
❌ Error: "permission-denied: You can only repair teachers in your own school"
❌ Teacher not repaired

---

### Test F: Error Scenarios (Edge Cases)

**Test F1: Duplicate Email**

```
Test:
1. Create teacher: alice@school.com ✅
2. Try to create another: alice@school.com
3. Click "Create Teacher"
```

**Expected Result:**
❌ Error toast: "A user with this email already exists"
❌ No second account created

**Test F2: Missing Required Fields**

```
Test:
1. Open "Add Teacher" modal
2. Leave fields empty
3. Click "Create Teacher"
```

**Expected Result:**
❌ Form validation: "Please fill in all fields (full name and email)"
❌ Submit button disabled

**Test F3: Inactive School**

```
Setup:
1. Create teacher in School A (working)
2. Manually mark school as inactive:
   - Firestore > schools/{schoolA123}
   - Set status = "inactive"

Test:
1. Try to log in as teacher
```

**Expected Result:**
❌ Error: "Your school has been deactivated. Please contact administrator"
❌ Auto sign-out

---

## Verification Checklist

### After Creating Teachers

- [ ] Firestore `users/{uid}` document exists
- [ ] Document has fields: fullName, email, role, schoolId, status, createdAt
- [ ] schoolId matches admin's schoolId
- [ ] Firebase Auth user exists with correct email
- [ ] Activity logged in `activityLogs`

### After Repairing Teachers

- [ ] Firestore `users/{uid}` has schoolId field populated
- [ ] updatedAt timestamp added
- [ ] Activity logged as `teacher_repair_schoolid`
- [ ] Teacher list no longer shows ⚠️ warning

### After Teacher Logs In

- [ ] Auth succeeds
- [ ] Profile loads (no error in AuthContext)
- [ ] Dashboard displays (correct role-based UI)
- [ ] Browser console shows correct user.schoolId
- [ ] SchoolContext loads school data correctly

### Security Verification

- [ ] Teachers can't see other schools' data
- [ ] Non-admins can't create teachers
- [ ] Admins can't repair other schools' teachers
- [ ] Super admin can create for any school (optional)

---

## Cloud Functions Status

### Function 1: `createTeacherAccount`

- **Callable by:** school_admin (their own school), super_admin (any school)
- **Input:** { fullName, email, schoolId? (super_admin only) }
- **Output:** { success, teacherUid, tempPassword, resetLink }
- **Side effects:** Creates Auth user, Firestore doc, sends email, logs activity
- **Deployment:** `firebase deploy --only functions`

### Function 2: `repairUserSchoolId`

- **Callable by:** school_admin (their own school), super_admin (any school)
- **Input:** { targetUid, schoolId? (super_admin only) }
- **Output:** { success, message }
- **Side effects:** Updates Firestore doc, logs activity
- **Deployment:** `firebase deploy --only functions`

---

## Troubleshooting

### Issue: Teacher created but can't log in

**Debug:**

```javascript
// Check Firestore doc
db.collection("users").doc(teacherUid).get();
// Verify schoolId field exists

// Check auth user
firebase.auth().getUser(teacherUid);
// Verify email matches
```

**Fix:**

```
1. If schoolId missing: Use Repair function
2. If schoolId wrong: Manually update in Firestore (for now)
3. If status="inactive": Update status to "active"
4. If school missing: Create school in Firestore first
```

### Issue: Repair button not showing

**Causes:**

- Teacher account is complete (has schoolId)
- Page not refreshed after previous repair

**Fix:**

```
1. Verify in Firestore: users/{uid}.schoolId exists
2. If missing: Refresh page and try again
3. If exists: Account is already complete, no repair needed
```

### Issue: "Permission denied" errors

**Causes:**

- Logged in as wrong role (not school_admin)
- Trying to repair teacher from different school

**Fix:**

```
1. Verify you're logged in as school_admin
2. Verify teacher belongs to your school:
   - Check teacher's schoolId in Firestore
   - Should match your admin's schoolId
```

### Issue: Cloud Function errors in logs

**Check:**

```
1. Firebase Console > Cloud Functions > Logs
2. Filter by function: createTeacherAccount OR repairUserSchoolId
3. Look for error messages
4. Check: auth status, role, schoolId, email format
```

---

## Deployment Checklist

- [ ] All code changes completed
- [ ] TypeScript compilation clean: `npm run build`
- [ ] No errors in `get_errors` check
- [ ] Tested locally if possible: `firebase emulators:start`
- [ ] Deploy Cloud Functions: `firebase deploy --only functions`
- [ ] Deploy client code: `npm run build && firebase deploy --only hosting`
- [ ] Verify functions in Firebase Console > Cloud Functions
- [ ] Run full test suite (Tests A-F above)
- [ ] Monitor logs for 24 hours
- [ ] Communication sent to admins about new "Repair Account" feature

---

## Field Name Reference

**IMPORTANT:** Use exact names everywhere

```
Firestore users/{uid} document:
- fullName (NOT: name, full_name, firstName+lastName)
- email
- role: "teacher" | "school_admin" | "super_admin"
- schoolId (NOT: schoolID, school_id, sid)
- status: "active" | "inactive"
- createdAt
- updatedAt (added on repair)

Cloud Function inputs:
- fullName (string)
- email (string)
- schoolId (optional, super_admin only)
- targetUid (repair function only)
```

---

## Success Criteria ✅

This fix is complete when:

1. ✅ Teachers can be created with proper schoolId
2. ✅ Broken teachers can be repaired via UI
3. ✅ Teacher login works after creation/repair
4. ✅ Teachers can only access their school's data
5. ✅ Error messages are clear and helpful
6. ✅ All tests A-F pass
7. ✅ Cloud Functions deployed successfully
8. ✅ No data leakage between schools
9. ✅ Activity logging captures all operations
10. ✅ Production ready with monitoring

---

## Quick Reference

| Action                      | User         | Cloud Function       | UI Location                                       |
| --------------------------- | ------------ | -------------------- | ------------------------------------------------- |
| Create teacher              | school_admin | createTeacherAccount | Admin Dashboard > Manage Teachers > "Add Teacher" |
| Repair teacher              | school_admin | repairUserSchoolId   | Admin Dashboard > Manage Teachers > "Wrench icon" |
| Create teacher (any school) | super_admin  | createTeacherAccount | (API only)                                        |
| Repair teacher (any school) | super_admin  | repairUserSchoolId   | (API only)                                        |

---

## Additional Resources

- Cloud Functions docs: `functions/index.js` (createTeacherAccount, repairUserSchoolId)
- UI component: `pages/admin/ManageTeachers.tsx`
- Auth validation: `services/authProfile.ts`
- Service wrapper: `services/functions.ts`
- Type definitions: `types.ts`
