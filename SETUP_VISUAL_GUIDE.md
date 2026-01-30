# 📋 Teacher Creation - Step-by-Step Setup

## Step 1: Get Firebase Credentials (2 minutes)

```
Go to: https://console.firebase.google.com
    ↓
Click your project (noble-care-management-system)
    ↓
Click ⚙️ Settings icon (top-left)
    ↓
Click "Service Accounts" tab
    ↓
Click "Generate New Private Key" button
    ↓
✅ JSON file downloads automatically
    ↓
Keep it safe!
```

---

## Step 2: Create .env File (1 minute)

In your project root (same folder as `server.js`), create a file named `.env`

```env
PORT=3001
FIREBASE_PROJECT_ID=noble-care-management-system
FIREBASE_SERVICE_ACCOUNT_KEY=
```

Open the downloaded JSON file and copy everything between `{` and `}`

Paste it after `FIREBASE_SERVICE_ACCOUNT_KEY=`

**Final result:**

```env
PORT=3001
FIREBASE_PROJECT_ID=noble-care-management-system
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"noble-care-management-system",...}
```

---

## Step 3: Install Dependencies (1 minute)

```bash
npm install
```

This installs both frontend and backend dependencies.

---

## Step 4: Start Backend (30 seconds)

**Open Terminal 1:**

```bash
npm run server:dev
```

You should see:

```
Server running on port 3001
```

---

## Step 5: Start Frontend (30 seconds)

**Open Terminal 2:**

```bash
npm run dev
```

You should see:

```
  ➜  Local:   http://localhost:3000/...
```

---

## Step 6: Test Teacher Creation (1 minute)

1. Open http://localhost:3000 in browser
2. Log in as school admin
3. Go to Admin Dashboard → Manage Teachers
4. Click "Add Teacher" button
5. Fill in:
   - Full Name: `John Doe`
   - Email: `john@example.com`
   - Password: (leave empty or enter optional password)
6. Click "Create Teacher"
7. ✅ Should see success modal!

---

## Step 7: Deploy to Production (5 minutes)

### Deploy Backend to Render.com

1. **Create Account:** https://render.com (free)
2. **Click "New +" → "Web Service"**
3. **Connect GitHub:** Select your repo
4. **Configure:**
   - Name: `noble-care-academy-backend`
   - Runtime: `Node`
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Instance: `Free`
5. **Environment Variables:** Add
   - `FIREBASE_PROJECT_ID=noble-care-management-system`
   - `FIREBASE_SERVICE_ACCOUNT_KEY={...paste JSON...}`
6. **Deploy!**
7. **Copy the URL:** Something like `https://noble-care-academy-backend.onrender.com`

### Update Frontend

Edit `.env.local`:

```env
VITE_BACKEND_URL=https://noble-care-academy-backend.onrender.com
```

---

## Verification Checklist

### Local Setup

- [ ] .env file created with Firebase credentials
- [ ] `npm install` completed
- [ ] Backend running: `npm run server:dev`
- [ ] Frontend running: `npm run dev`
- [ ] Teacher creation works at http://localhost:3000
- [ ] Teacher appears in teacher list
- [ ] Success modal shows password or reset link

### Production

- [ ] Backend deployed to Render/Railway
- [ ] VITE_BACKEND_URL updated in .env.local
- [ ] Frontend deployed to Firebase Hosting
- [ ] Teacher creation works in production
- [ ] No errors in browser console (F12)
- [ ] No errors in backend server logs

---

## Common Issues & Fixes

| Issue                       | Fix                                       |
| --------------------------- | ----------------------------------------- |
| `.env` not found            | Create file named `.env` in project root  |
| Port 3001 in use            | Kill process or use different port        |
| Teacher not created         | Check backend console for error details   |
| "Cannot find module"        | Run `npm install`                         |
| Backend URL not working     | Verify `VITE_BACKEND_URL` in `.env.local` |
| 404 on `/api/createTeacher` | Ensure backend is running                 |

---

## Commands Cheat Sheet

```bash
# Install everything
npm install

# Local development
npm run server:dev    # Terminal 1: Backend on :3001
npm run dev           # Terminal 2: Frontend on :3000

# Production
npm run build         # Build frontend
npm run server        # Run backend in production mode

# Debugging
npm run server:dev -- --inspect  # Debug backend with inspector
```

---

## File Locations

```
noble-care-academy/
├── .env                          ← Create this with credentials
├── server.js                      ← Backend server
├── pages/admin/ManageTeachers.tsx ← Updated frontend
├── package.json                   ← Updated with scripts
└── PRODUCTION_BACKEND_GUIDE.md   ← Full documentation
```

---

## Architecture Diagram

```
┌─────────────────────────────────────┐
│  Browser (localhost:3000)           │
│  React App - Admin creates teacher  │
└────────────────┬────────────────────┘
                 │ POST /api/createTeacher
                 │ {fullName, email, password, idToken}
                 ↓
┌─────────────────────────────────────┐
│  Backend Server (localhost:3001)    │
│  Express.js - Teacher creation API  │
│  • Verify token                     │
│  • Check permissions                │
│  • Create Auth user                 │
│  • Create Firestore doc             │
└────────────────┬────────────────────┘
                 │ Create user
                 ↓
        ┌────────────────┐
        │ Firebase Auth  │
        └────────────────┘
                 │ Create document
                 ↓
       ┌──────────────────┐
       │ Firebase         │
       │ Firestore        │
       └──────────────────┘
```

---

## What Happens Behind Scenes

```
User clicks "Create Teacher"
    ↓
Frontend gets ID token from Firebase
    ↓
Frontend sends POST to backend
    ↓
Backend verifies ID token is valid
    ↓
Backend checks user is school_admin or super_admin
    ↓
Backend validates email and password format
    ↓
Backend checks email doesn't already exist
    ↓
Backend creates Firebase Auth user
    ↓
Backend creates Firestore document
    ↓
Backend generates password reset link (if needed)
    ↓
Backend logs activity for audit trail
    ↓
Backend returns password/reset link
    ↓
Frontend shows success modal
    ↓
✅ Teacher is created and ready to log in!
```

---

## Security Summary

✅ User must be logged in (ID token verified)
✅ User must be admin (role checked)
✅ Email must be valid format
✅ Password validated on server
✅ Auth and Firestore transactions are atomic
✅ Activity logged for compliance
✅ No sensitive data in logs

---

## Cost Summary

| Service        | Free Tier        |
| -------------- | ---------------- |
| Render.com     | Unlimited        |
| Railway.app    | $5/month credits |
| Firebase Spark | Included         |
| **Total**      | **$0/month**     |

---

## Success Indicators

✅ Backend starts without errors
✅ Frontend connects to backend
✅ Teacher creation completes quickly
✅ Success modal shows password or reset link
✅ Teacher appears in list immediately
✅ Firestore has teacher document
✅ Activity log has entry

---

## Next Steps

1. ✅ Follow steps 1-7 above
2. ✅ Verify all checks pass
3. ✅ Deploy to production
4. ✅ Test in production
5. ✅ Share with users!

---

## You're Ready! 🚀

Your teacher creation is now working on the Spark plan (free)!

For more info, check:

- `PRODUCTION_BACKEND_GUIDE.md` - Full guide
- `GET_SERVICE_ACCOUNT_KEY.md` - Credentials help
- `QUICK_REFERENCE_BACKEND.md` - Command reference

**Questions?** Check those docs! They have answers. 📖
