# Backend Server Setup Guide

## Overview

Since your Firebase project is on the Spark (free) plan and doesn't support Cloud Functions, we've created a simple Node.js Express backend server that handles teacher creation. This is production-ready and can be hosted for FREE on services like Render.com or Railway.

## Local Development Setup

### 1. Install Dependencies

```bash
npm install
npm install --save-dev nodemon
```

### 2. Get Firebase Service Account Key

1. Go to Firebase Console: https://console.firebase.google.com
2. Select your project: `noble-care-management-system`
3. Settings (gear icon) → Service Accounts
4. Click "Generate New Private Key"
5. Save the JSON file securely

### 3. Create `server/.env` file (backend only)

```bash
# Server configuration
PORT=3001
REQUEST_BODY_LIMIT=1mb

# Firebase credentials (from service account JSON)
FIREBASE_PROJECT_ID=noble-care-management-system
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"noble-care-management-system",...}
```

**Important:** Replace the JSON value with your actual service account key content (keep it as a single line or properly escaped).

### 4. Run Backend Server

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

The server will run on `http://API_BASE_URL`

### 5. Run Frontend (in another terminal)

```bash
npm run dev
```

The frontend will run on `http://localhost:3000`

---

## Production Deployment (Free)

### Option 1: Render.com (Recommended)

1. Go to https://render.com and sign up (free)
2. Click "New +" → "Web Service"
3. Connect your GitHub repo
4. Configure:
   - **Name:** noble-care-academy-backend
   - **Runtime:** Node
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Instance type:** Free
5. Add Environment Variables:
   - `PORT=3001` (Render assigns this automatically)
   - `FIREBASE_PROJECT_ID=noble-care-management-system`
   - `FIREBASE_SERVICE_ACCOUNT_KEY={...paste full JSON...}`
6. Deploy!

Your backend URL will be something like:
`https://noble-care-academy-backend.onrender.com`

### Option 2: Railway.app

1. Go to https://railway.app and sign up (free $5/month credits)
2. Create new project → Deploy from GitHub
3. Connect your repo and select the project folder
4. Add variables (same as above)
5. Deploy!

### Option 3: Replit

1. Go to https://replit.com
2. Import from GitHub
3. Run `npm install && npm start`
4. Replit gives you a public URL automatically

---

## Update Frontend for Production

Once your backend is deployed, update `.env.local` (frontend):

```env
VITE_BACKEND_URL=https://your-backend-url.onrender.com
```

For example:

```env
VITE_BACKEND_URL=https://noble-care-academy-backend.onrender.com
```

---

## How It Works

1. **Frontend Flow:**
   - Admin fills teacher form
   - Frontend gets ID token from Firebase Auth
   - Sends request to backend with: fullName, email, password, idToken

2. **Backend Flow:**
   - Verifies ID token (user is authenticated)
   - Checks if caller is school_admin or super_admin
   - Validates input data
   - Creates Auth user
   - Creates Firestore document
   - Logs activity
   - Returns password/reset link

3. **Security:**
   - ID token verification ensures user is authenticated
   - Firestore security rules still apply
   - Role-based access control (only admins can create teachers)
   - All validations happen server-side

---

## Testing

### Local Test

```bash
# Terminal 1: Backend
npm run dev

# Terminal 2: Frontend
npm run dev

# Terminal 3: Test in browser at http://localhost:3000
```

### Production Test

1. Deploy backend to Render/Railway
2. Update `.env.local` with backend URL
3. Build and deploy frontend
4. Test teacher creation in production environment

---

## Environment Variables Reference

| Variable                       | Value                                           | Notes                 |
| ------------------------------ | ----------------------------------------------- | --------------------- |
| `PORT`                         | 3001                                            | Backend server port   |
| `FIREBASE_PROJECT_ID`          | noble-care-management-system                    | Your Firebase project |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Service account JSON                            | From Firebase console |
| `VITE_BACKEND_URL`             | http://API_BASE_URL (dev) or https://... (prod) | Frontend uses this    |

---

## Troubleshooting

### "Cannot find module 'firebase-admin'"

```bash
npm install firebase-admin
```

### Backend URL not working

- Check if backend is running: `curl http://API_BASE_URL/health`
- Check `VITE_BACKEND_URL` in `.env.local`
- Check CORS is enabled (it is in server.js)

### Teacher creation fails with "Invalid token"

- Ensure user is logged in
- Token might be expired (getting new one handles this)
- Check server logs for actual error

### Firebase credentials not found

- Verify `.env` file has `FIREBASE_SERVICE_ACCOUNT_KEY`
- Ensure it's valid JSON
- Use single line or properly escaped JSON

---

## Cost

✅ **Completely FREE**

- Render.com: Free tier with unlimited requests
- Railway.app: $5/month free credit (more than enough)
- Replit: Free hosting
- No additional Firebase costs (still Spark plan compatible)

---

## Next Steps

1. ✅ Set up local backend
2. ✅ Get Firebase service account key
3. ✅ Create `.env` file with credentials
4. ✅ Test locally
5. ✅ Deploy to Render/Railway
6. ✅ Update `VITE_BACKEND_URL` for production
7. ✅ Test in production

**Status:** Ready to use! 🚀
