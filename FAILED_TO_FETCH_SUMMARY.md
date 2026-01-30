# "Failed to Fetch" Error Fix

## Problem

When trying to create a teacher, you get an error that says **"Failed to fetch"**.

## Root Cause

This error happens when the frontend can't reach the backend server. Most common reasons:

1. Backend server is NOT running
2. Backend URL is incorrect in `.env.local`
3. Port 3001 is already in use
4. `.env` file is missing Firebase credentials

## Quick Fix (Try This First)

### Step 1: Make Sure Backend is Running

```bash
npm run server:dev
```

You should see:

```
Server running on port 3001
```

### Step 2: Check `.env` File Exists

The file must be in your project root (same level as `server.js`) with:

```env
PORT=3001
FIREBASE_PROJECT_ID=noble-care-management-system
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
```

### Step 3: Check `.env.local`

Should have:

```env
VITE_BACKEND_URL=http://localhost:3001
```

### Step 4: Restart Frontend

```bash
# Kill frontend (Ctrl+C)
# Then:
npm run dev
```

### Step 5: Try Again

Try to create a teacher. The error message should now be more helpful!

---

## Better Error Messages (What You'll See Now)

Instead of just "Failed to fetch", you'll now see:

- **"Cannot connect to backend at http://localhost:3001..."** → Backend isn't running
- **"Invalid or expired authentication token"** → User not logged in
- **"A user with this email already exists"** → Email already used
- **Actual error message** → From the backend

---

## Diagnostic Tools

### Option 1: Automatic Diagnosis (Windows)

```powershell
.\diagnose.ps1
```

### Option 2: Automatic Diagnosis (Mac/Linux)

```bash
bash diagnose.sh
```

### Option 3: Manual Check

```bash
# Test backend is responding
curl http://localhost:3001/health
# Should return: {"status":"ok"}
```

---

## What Was Changed

✅ **Improved error handling** in `pages/admin/ManageTeachers.tsx`:

- Shows specific error message when "Failed to fetch" occurs
- Tells user to check if backend is running
- Shows the backend URL being used

✅ **Created troubleshooting guides**:

- `FAILED_TO_FETCH_FIX.md` - Detailed troubleshooting
- `diagnose.ps1` - Windows automatic diagnosis
- `diagnose.sh` - Mac/Linux automatic diagnosis

---

## Checklist

Before trying to create a teacher, verify:

- [ ] `.env` file exists with all 3 variables
- [ ] Backend running: `npm run server:dev` shows "Server running on port 3001"
- [ ] `.env.local` has `VITE_BACKEND_URL=http://localhost:3001`
- [ ] Frontend running: `npm run dev`
- [ ] No errors in browser console (F12)

---

## Still Having Issues?

1. **Read:** `FAILED_TO_FETCH_FIX.md` - Complete troubleshooting guide
2. **Run:** `diagnose.ps1` (Windows) or `diagnose.sh` (Mac/Linux)
3. **Check:**
   - Backend console for errors
   - Browser console (F12) for errors
   - `.env` file has correct credentials
   - Port 3001 is available

---

## Status: ✅ Fixed

The error message is now more helpful and points you to the actual problem!
