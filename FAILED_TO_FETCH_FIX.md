# "Failed to fetch" Error - Troubleshooting Guide

## What This Error Means

**"Failed to fetch"** means your frontend can't reach the backend server. This happens when:

1. ❌ Backend server is NOT running
2. ❌ Backend URL is incorrect
3. ❌ Port 3001 is in use by another process
4. ❌ Firewall is blocking the connection
5. ❌ Backend crashed due to missing credentials

---

## Quick Fix (Most Common)

### Step 1: Check if Backend is Running

**In a terminal, run:**

```bash
npm run server:dev
```

You should see:

```
Server running on port 3001
```

If you see an error, continue to Step 2.

### Step 2: Check .env File

Your `.env` file MUST exist in the project root with:

```env
PORT=3001
FIREBASE_PROJECT_ID=noble-care-management-system
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
```

✅ Make sure:

- File is named exactly `.env` (with the dot)
- It's in the root directory (same level as server.js)
- All three variables are present
- `FIREBASE_SERVICE_ACCOUNT_KEY` is valid JSON

### Step 3: Kill Process on Port 3001

If port 3001 is already in use:

**Windows (PowerShell):**

```powershell
netstat -ano | findstr :3001
taskkill /PID <PID> /F
```

**Mac/Linux:**

```bash
lsof -i :3001
kill -9 <PID>
```

Then try: `npm run server:dev` again

### Step 4: Install Dependencies

```bash
npm install
npm run server:dev
```

---

## Detailed Troubleshooting

### Scenario 1: Backend Not Starting

**Error:** Backend won't start or shows error

**Fix:**

```bash
# 1. Check .env exists and has correct credentials
cat .env

# 2. Check Firebase credentials are valid JSON
# (Copy the value and paste into https://jsonlint.com)

# 3. Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# 4. Try again
npm run server:dev
```

### Scenario 2: Backend Running But Still "Failed to fetch"

**Check backend URL in `.env.local`:**

```env
VITE_BACKEND_URL=http://localhost:3001
```

**Then test backend is responding:**

```bash
curl http://localhost:3001/health
```

Should return: `{"status":"ok"}`

### Scenario 3: Backend Starts But Crashes

**Look for errors in the backend terminal**

Common errors:

- `Firebase initialization error` → Check .env credentials
- `EADDRINUSE` → Port 3001 is in use (kill it)
- `Cannot find module` → Run `npm install`

---

## Testing Backend Connectivity

### Test 1: Health Check

```bash
curl http://localhost:3001/health
```

Expected: `{"status":"ok"}`

### Test 2: Check in Browser Console

1. Open http://localhost:3000
2. Open Developer Tools (F12)
3. Go to Console tab
4. Paste:

```javascript
fetch("http://localhost:3001/health")
  .then((r) => r.json())
  .then((data) => console.log("✅ Backend works!", data))
  .catch((e) => console.error("❌ Backend error:", e.message));
```

Should print: `✅ Backend works! {status: "ok"}`

### Test 3: Check in Network Tab

1. Open http://localhost:3000
2. Open Developer Tools (F12)
3. Go to Network tab
4. Try to create a teacher
5. Look for request to `/api/createTeacher`
6. Check response (should have error or success)

---

## Checklist for "Failed to fetch" Fix

- [ ] Backend server running: `npm run server:dev`
- [ ] `.env` file exists in project root
- [ ] `.env` has all three required variables
- [ ] `FIREBASE_SERVICE_ACCOUNT_KEY` is valid JSON
- [ ] `VITE_BACKEND_URL` in `.env.local` is correct
- [ ] Port 3001 is available (not in use)
- [ ] Browser can reach backend: `curl http://localhost:3001/health` returns ok
- [ ] No errors in backend console
- [ ] No errors in browser console (F12)

---

## Full Debugging Steps

If the above doesn't work:

### Step 1: Verify Backend is Actually Running

```bash
# Terminal 1
npm run server:dev
# Should print: Server running on port 3001
```

### Step 2: Verify Backend Responds

**In a different terminal:**

```bash
curl http://localhost:3001/health
# Should return: {"status":"ok"}
```

### Step 3: Check Frontend Config

```bash
# In project root
cat .env.local
# Should show: VITE_BACKEND_URL=http://localhost:3001
```

### Step 4: Check Browser Console (F12)

1. Open Developer Tools
2. Go to Console tab
3. Create a teacher
4. Look for errors
5. Take screenshot

### Step 5: Check Backend Console

1. Look at terminal running backend
2. Look for any error messages
3. Copy full error message

---

## Manual Testing with cURL

### Test Authentication Flow

```bash
# Get your Firebase ID token (from browser console):
# After logging in, run: firebase.auth().currentUser.getIdToken()
# Copy the token

# Then test backend:
curl -X POST http://localhost:3001/api/createTeacher \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "Test Teacher",
    "email": "test@example.com",
    "password": "TestPass123",
    "idToken": "YOUR_ID_TOKEN_HERE"
  }'
```

---

## Environment Variable Issues

### Issue: Firebase credentials not found

**Check:**

```bash
# Make sure file exists
ls -la .env

# Make sure it's readable
cat .env
```

### Issue: VITE variable not loading

**Check:**

```bash
# Restart frontend for .env changes to take effect
# Kill running frontend (Ctrl+C)
npm run dev
```

---

## Network & Firewall Issues

If backend is running but still can't fetch:

### Check Firewall (Windows)

1. Windows Defender Firewall
2. Allow app through firewall
3. Allow Node.js

### Check Antivirus

Some antivirus blocks localhost connections:

1. Try disabling temporarily
2. Or add exception for Node.js

### Check VPN

If on VPN, localhost might not work:

1. Disconnect VPN
2. Or configure VPN to allow localhost

---

## Common Error Messages & Fixes

| Error                               | Cause                      | Fix                                    |
| ----------------------------------- | -------------------------- | -------------------------------------- |
| "Failed to fetch"                   | Backend not running        | `npm run server:dev`                   |
| Port 3001 in use                    | Another process using port | Kill process: `taskkill /PID <PID> /F` |
| Firebase initialization error       | Bad .env credentials       | Check .env file, verify JSON           |
| Cannot find module 'firebase-admin' | Missing dependency         | `npm install`                          |
| Invalid or expired token            | Token issue                | Ensure user is logged in               |
| ENOENT: no such file '.env'         | .env file missing          | Create .env with credentials           |

---

## Still Not Working?

### Get More Info

1. **Check backend console:** Look for error messages
2. **Check browser console (F12):** Look for network errors
3. **Check Network tab (F12):** See the failed request details
4. **Test health endpoint:** `curl http://localhost:3001/health`

### Collect Info & Share

When asking for help, share:

1. Full error message from browser console
2. Full error message from backend console
3. Output of: `cat .env` (hide actual keys)
4. Output of: `npm run server:dev` startup messages

---

## Success Indicators

✅ Backend running: `Server running on port 3001`
✅ Health check works: `curl localhost:3001/health` returns ok
✅ Can create teacher: Success modal appears
✅ No errors in console: F12 shows no red errors

---

## Quick Reference

```bash
# Start backend
npm run server:dev

# Check if running
curl http://localhost:3001/health

# Kill port 3001
netstat -ano | findstr :3001
taskkill /PID <PID> /F

# Check .env file
cat .env

# Reinstall if needed
npm install
```

---

**Still getting "Failed to fetch"?**

Follow the checklist above. 99% of the time it's:

1. Backend not running
2. .env file missing
3. Port 3001 in use

Check those three things first!
