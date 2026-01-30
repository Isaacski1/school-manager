# 🚀 Production-Ready Backend Setup (No Blaze Upgrade Needed)

## What's New?

Instead of using Cloud Functions (which require Blaze plan), we now use a **simple Node.js Express backend** that:

- ✅ Works on Spark (free) Firebase plan
- ✅ Handles teacher creation with all security checks
- ✅ Runs locally for development
- ✅ Deploys FREE to Render/Railway for production
- ✅ Is production-ready and scalable

---

## Quick Start (5 minutes)

### Step 1: Get Firebase Service Account Key

1. Go to https://console.firebase.google.com
2. Click your project: `noble-care-management-system`
3. Click ⚙️ Settings → Service Accounts tab
4. Click "Generate New Private Key"
5. A JSON file downloads - **keep it safe!**

### Step 2: Create `.env` file

Create a file named `.env` in the root directory (same level as server.js):

```env
PORT=3001
FIREBASE_PROJECT_ID=noble-care-management-system
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"noble-care-management-system","private_key_id":"...","private_key":"...","client_email":"...","client_id":"...","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"..."}
```

**To get the JSON content:**

- Open the downloaded service account JSON file
- Copy the entire content (everything inside the `{}`)
- Paste it as the value for `FIREBASE_SERVICE_ACCOUNT_KEY`
- Keep it on a single line

### Step 3: Install Dependencies

```bash
npm install
```

### Step 4: Run Backend (New Terminal)

```bash
npm run server:dev
```

You should see:

```
Server running on port 3001
```

### Step 5: Run Frontend (Another Terminal)

```bash
npm run dev
```

Open http://localhost:3000 in your browser

### Step 6: Test Teacher Creation

1. Log in as school admin
2. Go to Manage Teachers
3. Fill in: Full Name, Email, (optional) Password
4. Click "Create Teacher"
5. ✅ Should work now!

---

## For Production (Deploy FREE)

### Option 1: Render.com (Recommended)

1. **Create Render account:** https://render.com (free)
2. **Push code to GitHub** (if not already)
3. **In Render Dashboard:**
   - Click "New +" → "Web Service"
   - Select your GitHub repo
   - Choose `noble-care-academy` folder
   - Settings:
     - **Name:** noble-care-academy-backend
     - **Branch:** main
     - **Build Command:** `npm install`
     - **Start Command:** `npm start`
     - **Instance Type:** Free
4. **Add Environment Variables:**
   - Click "Add Environment Variable"
   - `FIREBASE_PROJECT_ID` = `noble-care-management-system`
   - `FIREBASE_SERVICE_ACCOUNT_KEY` = (paste your full JSON key)
5. **Deploy!** Click "Deploy Service"
6. **Get URL:** Render gives you something like `https://noble-care-academy-backend.onrender.com`

### Option 2: Railway.app

1. **Create Railway account:** https://railway.app (free $5/month credits)
2. **New Project** → **Deploy from GitHub**
3. **Add Environment Variables:**
   - Same as above
4. **Deploy!**

### Option 3: Heroku / Replit / Vercel

All support free Node.js hosting. Follow similar steps.

---

## Update Frontend for Production

After deploying backend to Render/Railway:

**Edit `.env.local`:**

```env
VITE_BACKEND_URL=https://noble-care-academy-backend.onrender.com
```

(Replace with your actual Render/Railway URL)

---

## Architecture

```
Frontend (React)
     ↓ (fetch with ID token)
Backend Server (Express.js)
     ↓ (verify token + create user)
Firebase Auth + Firestore
```

### Flow:

1. Admin enters teacher details
2. Frontend gets ID token from Firebase Auth
3. Frontend sends request to backend with token + details
4. Backend verifies token (user is authenticated)
5. Backend checks if user is school_admin or super_admin
6. Backend creates Auth user + Firestore document
7. Backend returns password/reset link
8. Frontend shows success modal

---

## Files Changed

- ✅ `server.js` - New backend server
- ✅ `pages/admin/ManageTeachers.tsx` - Updated to call backend
- ✅ `.env.local` - Added backend URL
- ✅ `package.json` - Added backend dependencies + scripts

---

## Troubleshooting

### Backend won't start

```bash
# Check if port 3001 is in use
netstat -ano | findstr :3001

# Kill process
taskkill /PID <PID> /F

# Try again
npm run server:dev
```

### "Cannot find module" error

```bash
npm install
```

### "Invalid token" error

- Make sure user is logged in
- Check browser console for full error
- Verify `.env` file exists and has correct credentials

### Teacher creation fails with error message

- Check backend console for logs
- Verify Firebase credentials in `.env`
- Check .env file syntax (JSON must be valid)

### Backend URL not working

- If local: http://localhost:3001/health should return `{"status":"ok"}`
- If production: check Render/Railway deployment logs
- Verify `VITE_BACKEND_URL` in `.env.local` matches your actual backend URL

---

## Security Notes

✅ **This is production-ready because:**

- ID token verification ensures user is authenticated
- Role checks prevent non-admins from creating teachers
- All validations happen server-side
- Firebase Firestore security rules still apply
- Password validation (min 6 chars)
- Activity logging for all creations
- Atomic operations (Auth + Firestore together)

🔒 **Sensitive Data:**

- `.env` file should NEVER be committed to git
- Service account key is sensitive - keep it private
- Use GitHub Secrets for production environment variables

---

## Next Steps

1. ✅ Create `.env` file with Firebase credentials
2. ✅ Run `npm install`
3. ✅ Start backend: `npm run server:dev`
4. ✅ Start frontend: `npm run dev`
5. ✅ Test teacher creation
6. ✅ Deploy backend to Render/Railway
7. ✅ Update `VITE_BACKEND_URL` in `.env.local`
8. ✅ Deploy frontend to Firebase Hosting

---

## Cost

💰 **Completely FREE!**

- Render.com: Free tier (unlimited requests)
- Railway.app: $5/month free credits (more than enough)
- No Firebase costs (Spark plan compatible)
- Your app can handle thousands of users without extra cost

---

## Support

If you run into issues:

1. Check backend console logs: `npm run server:dev`
2. Check browser console (F12): Network tab for API calls
3. Verify `.env` file exists and is readable
4. Make sure Firebase credentials are correct
5. Check that ports 3000 (frontend) and 3001 (backend) are available

**You're all set!** 🎉
