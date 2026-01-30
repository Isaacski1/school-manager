# Quick Reference - Teacher Provisioning System

## 🎯 Problem Solved

Teachers login fails with: **"Teacher account is incomplete: missing schoolId"**

## ✅ Solution Implemented

### Two Cloud Functions

#### 1️⃣ `createTeacherAccount(data)`

**Use for:** Creating new teachers (preferred approach)

```javascript
Input:  { fullName, email, schoolId? }
Output: { success, teacherUid, tempPassword, resetLink }
Role:   school_admin (own school) | super_admin (any school)
```

#### 2️⃣ `repairUserSchoolId(data)`

**Use for:** Fixing existing broken teachers

```javascript
Input:  { targetUid, schoolId? }
Output: { success, message }
Role:   school_admin (own school) | super_admin (any school)
```

---

## 🖱️ UI Changes

### Teacher List (Manage Teachers Page)

#### Before ❌

```
┌─────────┬────────────┬──────────┬─────────┐
│ Name    │ Email      │ Classes  │ Actions │
├─────────┼────────────┼──────────┼─────────┤
│ John    │ john@...   │ Class A  │   🗑️    │
│ Alice   │ alice@...  │ Class B  │   🗑️    │
└─────────┴────────────┴──────────┴─────────┘
```

#### After ✅

```
┌─────────┬────────────┬─────────────────┬──────────┬─────────┐
│ Name    │ Email      │ Account Status  │ Classes  │ Actions │
├─────────┼────────────┼─────────────────┼──────────┼─────────┤
│ John    │ john@...   │ ✓ Complete      │ Class A  │   🗑️    │
│ Alice   │ alice@...  │ ⚠️ Missing SchID │ Class B  │ 🔧 🗑️   │
└─────────┴────────────┴─────────────────┴──────────┴─────────┘
```

### Status Meanings

- ✅ **✓ Complete** - Has schoolId, can log in
- ⚠️ **⚠️ Missing schoolId** - Cannot log in, needs repair

### Actions

- 🔧 **Wrench** - Repair account (click to fix)
- 🗑️ **Trash** - Delete teacher

---

## 📖 How to Use

### Create Teacher (New)

```
1. Admin Dashboard > Manage Teachers
2. Click "Add Teacher"
3. Enter: Full Name, Email
4. Click "Create Teacher"
5. Share credentials from modal
```

### Repair Teacher (Broken)

```
1. Admin Dashboard > Manage Teachers
2. Find teacher with ⚠️ badge
3. Click wrench icon
4. Confirm in modal
5. Teacher account fixed!
```

### Verify Teacher

```
1. Teacher logs in with temp password
2. Forced to reset password
3. Lands on Teacher Dashboard
4. Can access their school's data
```

---

## 🔒 Who Can Do What

| Action         | school_admin    | super_admin |
| -------------- | --------------- | ----------- |
| Create teacher | Own school only | Any school  |
| Repair teacher | Own school only | Any school  |
| Delete teacher | Yes             | Yes         |

---

## 📋 Firestore Schema

### users/{uid}

```json
{
  "fullName": "John Smith",
  "email": "john@school.com",
  "role": "teacher",
  "schoolId": "school123",        ← KEY FIELD (was missing)
  "status": "active",
  "createdAt": 2026-01-28T12:34Z,
  "updatedAt": 2026-01-28T13:45Z  ← Updated on repair
}
```

### activityLogs

```json
{
  "eventType": "teacher_created" OR "teacher_repair_schoolid",
  "schoolId": "school123",
  "teacherUid": "uid",
  "email": "john@school.com",
  "fullName": "John Smith",
  "createdBy": "adminUid",
  "timestamp": 2026-01-28T12:34Z
}
```

---

## 🚀 Deployment

```bash
# Deploy Cloud Functions
firebase deploy --only functions

# Deploy React app
npm run build && firebase deploy --only hosting
```

---

## ✨ What Changed

| Component               | Change                                                     | Impact                       |
| ----------------------- | ---------------------------------------------------------- | ---------------------------- |
| `functions/index.js`    | Added `repairUserSchoolId`, updated `createTeacherAccount` | Atomic provisioning + repair |
| `services/functions.ts` | Added `repairUserSchoolId` export                          | Accessible from React        |
| `ManageTeachers.tsx`    | Added repair modal, status column, icons                   | Admin UI for repairs         |
| `authProfile.ts`        | Enhanced logging                                           | Better debugging             |

---

## 🐛 Common Issues & Fixes

| Issue                 | Cause               | Fix                 |
| --------------------- | ------------------- | ------------------- |
| Can't log in          | Missing schoolId    | Use repair button   |
| Repair button missing | Account is complete | No action needed    |
| "Permission denied"   | Not school_admin    | Log in as admin     |
| "Teacher not found"   | Wrong UID           | Verify in Firestore |

---

## 📊 Test Checklist

- [ ] Test A: Create teacher → Firestore has schoolId
- [ ] Test B: Repair teacher → Missing field restored
- [ ] Test C: Login → Teacher accesses dashboard
- [ ] Test D: Isolation → Can't see other schools
- [ ] Test E: Permissions → Only admins can create/repair
- [ ] Test F: Errors → Proper error messages shown

**Full details:** See `TEACHER_REPAIR_GUIDE.md`

---

## 📞 Need Help?

| Question                     | Answer                             | Docs                  |
| ---------------------------- | ---------------------------------- | --------------------- |
| How to create teacher?       | Use "Add Teacher" UI               | UI section above      |
| How to fix broken teacher?   | Use wrench icon (repair)           | UI section above      |
| What's wrong with teacher?   | Check "Account Status" column      | Status meanings above |
| How to verify repair worked? | Login should work, check Firestore | Verification section  |

---

## ✅ Success Indicators

Teacher provisioning is working when:

- ✅ New teachers created with schoolId automatically
- ✅ Broken teachers fixed with repair button
- ✅ Teachers can log in after creation/repair
- ✅ Teachers only see their school's data
- ✅ No errors in browser console
- ✅ Firestore docs match schema above

---

## 🔄 Workflow Summary

```
SCENARIO 1: Create New Teacher
┌─────────────────┐
│  Admin clicks   │
│  "Add Teacher"  │
└────────┬────────┘
         │
         ▼
┌──────────────────────┐
│  Fill fullName,      │
│  email in form       │
└────────┬─────────────┘
         │
         ▼
┌──────────────────────────┐
│  Cloud Function runs:    │
│  1. Create Auth user     │
│  2. Create Firestore doc │
│  3. Add schoolId         │
│  4. Send reset email     │
└────────┬─────────────────┘
         │
         ▼
┌──────────────────────┐
│  Modal shows:        │
│  - Email             │
│  - Temp password     │
│  - Reset link info   │
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐
│  Teacher can log in  │
│  ✅ SUCCESS         │
└──────────────────────┘

SCENARIO 2: Repair Broken Teacher
┌─────────────────────────────┐
│ Teacher list shows ⚠️ badge │
│ "Missing schoolId"          │
└────────┬────────────────────┘
         │
         ▼
┌──────────────────┐
│ Click wrench icon│
└────────┬─────────┘
         │
         ▼
┌──────────────────────┐
│  Confirm in modal    │
│  "Repair Account?"   │
└────────┬─────────────┘
         │
         ▼
┌──────────────────────────┐
│  Cloud Function runs:    │
│  1. Update Firestore doc │
│  2. Add schoolId         │
│  3. Log activity         │
└────────┬─────────────────┘
         │
         ▼
┌──────────────────────┐
│  Success toast shown │
│  List refreshes      │
│  Badge gone (fixed)  │
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐
│  Teacher can log in  │
│  ✅ SUCCESS         │
└──────────────────────┘
```

---

**Created:** January 28, 2026
**Status:** ✅ Ready for deployment
**Version:** 1.0 Complete
