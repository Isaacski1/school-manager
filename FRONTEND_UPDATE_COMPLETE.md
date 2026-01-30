# Frontend Integration Update - Complete ✅

## Summary

The Super Admin frontend UI has been updated to use the new Express backend endpoints instead of client-side Firebase Auth user creation. This ensures atomic creation of both Auth and Firestore profiles.

## Files Modified

### 1. `services/backendApi.ts` (NEW)

**Purpose:** API client for communicating with Express backend

**Features:**

- Automatic Firebase ID token retrieval
- Automatic ID token injection into all requests
- Error handling with helpful messages
- Two main functions:
  - `createSchoolAdmin()` - Create new school admin (Auth + Firestore)
  - `provisionUser()` - Provision existing Auth-only users

**Usage Example:**

```typescript
import { createSchoolAdmin } from "./services/backendApi";

const result = await createSchoolAdmin({
  schoolId: "school123",
  fullName: "John Doe",
  email: "john@school.com",
});
// Returns: { success, uid, email, resetLink, message }
```

**Configuration:**

- Backend URL: Read from `VITE_BACKEND_URL` environment variable
- Fallback: `http://localhost:3001`
- ✅ `.env.local` already has `VITE_BACKEND_URL=http://localhost:3001`

### 2. `pages/super-admin/SchoolDetails.tsx` (MODIFIED)

**Changes:**

#### Removed Imports:

```typescript
// ❌ REMOVED - No longer using client-side Auth
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../services/firebase";
```

#### Added Imports:

```typescript
// ✅ ADDED - Using new backend API
import { createSchoolAdmin } from "../../services/backendApi";
```

#### Function `handleCreateAdmin()` - Completely Rewritten:

**Before:** Client-side Auth user creation + Firestore profile

- Generate temp password locally
- Call `createUserWithEmailAndPassword()`
- Call `setDoc()` for Firestore profile

**After:** Calls backend API endpoint

- Calls `createSchoolAdmin({ schoolId, fullName, email })`
- Backend handles Auth + Firestore atomically
- Backend generates and sends password reset link
- Frontend shows success message with email confirmation

#### Modal UI Updated:

**Note section changed from:**

```
"A temporary password will be generated and a password reset
link will be sent to the email address."
```

**To:**

```
"A password reset link will be sent to the provided email address.
The admin must use this link to set their password before logging in."
```

## How It Works Now

### User Flow:

1. Super Admin opens School Details page
2. Clicks "Create School Admin" button
3. Enters Full Name and Email
4. Clicks "Create Admin" submit button
5. **Frontend:**
   - Gets current user's Firebase ID token
   - Calls `POST /api/superadmin/create-school-admin`
   - Sends: `{ schoolId, fullName, email, idToken }`
6. **Backend:**
   - Verifies caller is super_admin (checks Firestore)
   - Creates Firebase Auth user with secure temp password
   - Creates Firestore `users/{uid}` document with:
     - `role: "school_admin"`
     - `schoolId: {provided}`
     - `fullName, email, status: "active", createdAt`
   - Generates password reset link using Firebase Admin SDK
   - Returns: `{ uid, email, resetLink, message }`
7. **Frontend:**
   - Shows success toast: "School admin created! Email: {email}\nReset link sent to email."
   - Closes modal
   - Clears form
8. **Admin receives email** with password reset link
9. **Admin clicks link** and sets their password
10. **Admin logs in** and can now create teachers (Firestore profile exists!)

## Error Handling

All errors are properly caught and displayed to the user:

### Backend Errors (Examples):

- `"Caller is not super_admin"` - Wrong user role
- `"Email already in use"` - Firebase Auth constraint
- `"Cannot connect to backend at http://localhost:3001"` - Server not running
- `"Session expired. Please log in again."` - User not authenticated

### Frontend Behavior:

- Error messages shown in toast notifications
- Original form data preserved
- Modal stays open for retry
- `setSaving` flag prevents multiple submissions

## Backward Compatibility

✅ **No breaking changes:**

- Other Super Admin functions (school management, plan updates, etc.) unchanged
- Only admin creation flow updated
- Schools.tsx was already using backend for school creation (no changes needed)
- Dashboard.tsx doesn't create users (no changes needed)

## Testing Checklist

### Basic Flow:

- [ ] Log in as Super Admin
- [ ] Go to a school's details page
- [ ] Click "Create School Admin" button
- [ ] Modal appears with form
- [ ] Enter name and email
- [ ] Click "Create Admin"
- [ ] Backend is called (check network tab in DevTools)
- [ ] Success toast appears with email confirmation
- [ ] Modal closes and form clears

### Backend Validation:

- [ ] Check Firebase Auth user created
- [ ] Check Firestore `users/{uid}` document created with correct:
  - `role: "school_admin"`
  - `schoolId: {correct-id}`
  - `fullName, email, status, createdAt`

### Follow-on Steps:

- [ ] Admin receives email with password reset link
- [ ] Admin clicks link and sets password
- [ ] Admin logs in successfully
- [ ] Admin creates a teacher (should NOT get "not provisioned" error)

### Error Cases:

- [ ] Try creating admin with same email twice → See error
- [ ] Stop backend server and try creating admin → See "Cannot connect" error
- [ ] Log out and try creating admin → See "Session expired" error

## Environment Setup

### Required:

✅ **Already configured:**

- `.env.local` has `VITE_BACKEND_URL=http://localhost:3001`
- Backend server running on port 3001
- Fresh Firebase service account credentials in backend

### Optional:

- If backend URL changes, update `VITE_BACKEND_URL` in `.env.local`

## Backend Endpoints Reference

### `POST /api/superadmin/create-school-admin`

Creates a new school admin (Auth + Firestore atomic)

**Request:**

```json
{
  "idToken": "firebase-id-token",
  "schoolId": "school-id-from-firestore",
  "fullName": "John Doe",
  "email": "john@school.com"
}
```

**Response (Success):**

```json
{
  "success": true,
  "uid": "firebase-auth-uid",
  "email": "john@school.com",
  "resetLink": "https://...",
  "message": "School admin created successfully"
}
```

**Response (Error):**

```json
{
  "error": "Email already in use"
}
```

### `POST /api/superadmin/provision-user`

Provisions missing Firestore profile for existing Auth user

**Used for:** Backfilling existing Auth-only accounts

**Request:**

```json
{
  "idToken": "firebase-id-token",
  "uid": "firebase-uid",
  "role": "school_admin",
  "schoolId": "school-id",
  "fullName": "John Doe",
  "email": "john@school.com"
}
```

## Implementation Notes

### Key Design Decision:

- ❌ **NOT:** Using Cloud Functions (Spark plan limitation)
- ✅ **YES:** Using Express.js backend (free tier compatible)
- ✅ **YES:** Atomic operations via Firebase Admin SDK

### Security:

- ID tokens verified server-side before any operations
- Super admin role checked before provisioning
- No passwords/secrets leaked to frontend
- Reset links sent via Firebase (secure)

### Token Management:

- ID tokens auto-refreshed if expired via `getIdToken(true)`
- Session expiration handled gracefully

## Next Steps (Optional Enhancements)

1. **Add "Provision User" UI Component**
   - For backfilling existing Auth-only users
   - Modal similar to "Create Admin"
   - Call `provisionUser()` from `services/backendApi.ts`

2. **Add Reset Link Copy Button**
   - If needed in future, backend returns resetLink
   - Could add UI to copy reset link for manual distribution

3. **Monitor Backend Health**
   - Add health check endpoint call on page load
   - Show warning if backend unreachable

4. **Improve Password Reset Email**
   - Customize Firebase email template
   - Add school name/branding

## Troubleshooting

### "Cannot connect to backend" Error

1. Check backend is running: `npm run dev` in project root
2. Check port 3001 is not in use: `netstat -ano | findstr :3001`
3. Check `.env` has Firebase credentials: `FIREBASE_SERVICE_ACCOUNT_*`
4. Check VITE_BACKEND_URL in `.env.local`

### "Caller is not super_admin" Error

1. Verify logged-in user is actually Super Admin
2. Check Firestore `users/{uid}` has `role: "super_admin"`
3. Check user can view Schools page (proves they're super admin)

### Admin Created But Can't Create Teachers

1. Check Firestore `users/{adminId}` exists
2. Check document has `schoolId` field (not null/empty)
3. Run backend with `NODE_DEBUG=*` for detailed logs
4. Check teacher creation error message for details

### Email Not Received

1. Check Firebase email settings: Firebase Console → Authentication → Templates
2. Check email spam folder
3. Check email is correct in Firestore document
4. Try sending reset link manually via Firebase Admin SDK test

## Rollback Plan

If issues occur, can revert to client-side creation:

1. Restore `createUserWithEmailAndPassword` import in SchoolDetails.tsx
2. Restore original `handleCreateAdmin()` function
3. Would still have "not provisioned" teacher creation error
4. **Note:** This is the original broken state - not recommended

---

**Status:** ✅ Frontend integration complete and ready for testing
**Backend:** ✅ Running on localhost:3001
**Database:** ✅ Connected with fresh credentials
