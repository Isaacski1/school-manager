# Authentication Failed - Debugging Guide

## Quick Fix ✅

**Your session has expired.** The Firebase ID token you received when you logged in is no longer valid.

### Solution:

1. **Log Out** - Click your profile/settings and log out
2. **Log Back In** - Log in again with your Super Admin credentials
3. **Try Again** - Now create the school admin again

The new login will give you a fresh ID token that's valid for use with the backend.

---

## Why This Happens

When you logged in, Firebase gave you an ID token (normally valid for ~1 hour). This token is sent to the backend for verification. If you've been logged in for a while (or closed/reopened the browser), the token expires.

### Error Flow:

1. You click "Create Admin" → Frontend gets your ID token
2. Token is expired → Backend rejects it
3. Error message: "Authentication failed: Firebase ID token has expired"

### Current Behavior:

- Frontend now shows clearer message: "Your session has expired. Please log out and log back in, then try again."

---

## Technical Details

### What Changed:

✅ Better error messages in `backendApi.ts`
✅ Better error handling in `SchoolDetails.tsx`
✅ Backend logs detailed token errors for debugging

### Error Messages You'll See:

- **"Your session has expired..."** → Log out and log back in
- **"Cannot connect to backend..."** → Backend server not running
- **"Only super admins can perform this action"** → Wrong user role

### Backend Logs:

If you check the backend terminal, you'll see detailed errors like:

```
Super admin verification failed: Firebase ID token has expired...
```

---

## Step-by-Step Fix

### 1. Log Out

- Click your name/avatar in top-right
- Click "Logout" or "Sign Out"

### 2. Verify You're Logged Out

- You should be redirected to login page
- Or see login screen instead of dashboard

### 3. Log Back In

- Enter your Super Admin email and password
- Click "Login"
- Wait for dashboard to load

### 4. Navigate to School

- Click the school you just created
- Go to "School Administration" section

### 5. Create Admin

- Click "Create School Admin" button
- Enter Full Name and Email
- Click "Create Admin"
- Should work now! ✅

---

## Prevention

To prevent this in the future:

1. **Don't leave browser open for too long** - ID tokens expire after ~1 hour
2. **Refresh token before creating** - Currently happens automatically but may be improved
3. **Watch for warnings** - Future UI could show "Session expiring in 5 minutes..."

---

## Testing Checklist

- [ ] Logged out completely
- [ ] Logged back in with fresh session
- [ ] Navigated to school details
- [ ] Clicked "Create School Admin"
- [ ] Filled in name and email
- [ ] Clicked "Create Admin"
- [ ] Success toast appears OR clear error message
- [ ] Check network tab to see request succeeded

---

## Still Getting Error?

If you still get "Authentication failed" after logging out/in:

### Check Backend:

1. Look at backend terminal output
2. Should NOT see "Firebase ID token has expired"
3. Should see: `Received POST /api/superadmin/create-school-admin`

### Check Permissions:

1. Verify your account has `role: "super_admin"` in Firestore
2. Check `users/{your-uid}` document exists with correct role

### Check Network:

1. Open DevTools (F12)
2. Go to Network tab
3. Click "Create Admin"
4. Look for POST request to `http://localhost:3001/api/superadmin/create-school-admin`
5. Check the response for error details

### Contact Support:

If none of above work, share:

- Backend console output (last 20 lines)
- Network request/response details
- Your user role in Firestore
