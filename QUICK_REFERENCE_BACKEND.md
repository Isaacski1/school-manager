# Quick Reference - Teacher Creation Backend

## 🚀 Start Here

### Local Development

```bash
# 1. Create .env file with Firebase credentials
# 2. Install dependencies
npm install

# 3. Terminal 1: Start Backend
npm run server:dev

# 4. Terminal 2: Start Frontend
npm run dev

# 5. Test at http://localhost:3000
```

### Production

```bash
# 1. Deploy backend to Render.com
# 2. Update VITE_BACKEND_URL in .env.local
# 3. Deploy frontend
```

---

## 📋 .env File Template

```env
PORT=3001
FIREBASE_PROJECT_ID=noble-care-management-system
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"..."}
```

Get service account key from:
Firebase Console → ⚙️ Settings → Service Accounts → Generate New Private Key

---

## 🔌 API Endpoint

**POST** `/api/createTeacher`

Request:

```json
{
  "fullName": "John Doe",
  "email": "john@school.com",
  "password": "Optional123",
  "idToken": "firebase-id-token"
}
```

Response:

```json
{
  "success": true,
  "teacherUid": "uid123",
  "tempPassword": "MyPassword123",
  "resetLink": "firebase-reset-link",
  "message": "Teacher account created successfully"
}
```

---

## 📝 Frontend Code

```typescript
// Get ID token
const idToken = await currentUser.getIdToken(true);

// Call backend
const response = await fetch(`${BACKEND_URL}/api/createTeacher`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    fullName,
    email,
    password,
    idToken,
  }),
});

const data = await response.json();
if (!response.ok) throw new Error(data.error);
```

---

## 🛡️ Security

✅ ID token verification
✅ Role-based access control
✅ Server-side validation
✅ Firestore rules still apply
✅ Atomic operations
✅ Activity logging

---

## 🐛 Troubleshooting

| Problem               | Solution                                 |
| --------------------- | ---------------------------------------- |
| Backend won't start   | Check `.env` exists, verify credentials  |
| "Cannot find module"  | Run `npm install`                        |
| 404 Backend not found | Check `VITE_BACKEND_URL` in `.env.local` |
| "Invalid token"       | Ensure user is logged in                 |
| Port in use           | Kill process on port 3001                |

---

## 💻 Commands

```bash
npm install          # Install all dependencies
npm run dev          # Start frontend (port 3000)
npm run server:dev   # Start backend (port 3001)
npm run server       # Start backend (production mode)
npm run build        # Build frontend for production
```

---

## 📦 Deployment Checklist

- [ ] Created `.env` with Firebase credentials
- [ ] Backend runs locally with `npm run server:dev`
- [ ] Frontend can create teachers
- [ ] Deployed backend to Render/Railway
- [ ] Updated `VITE_BACKEND_URL` in `.env.local`
- [ ] Deployed frontend to Firebase Hosting
- [ ] Tested teacher creation in production
- [ ] Checked activity logs

---

## 🐛 "Failed to Fetch" Error?

If you get "Failed to fetch" when creating a teacher:

```bash
# 1. Make sure backend is running
npm run server:dev
# Should show: Server running on port 3001

# 2. Check .env file exists with Firebase credentials
cat .env

# 3. Check .env.local has backend URL
cat .env.local
# Should have: VITE_BACKEND_URL=http://localhost:3001

# 4. Test backend responds
curl http://localhost:3001/health
# Should return: {"status":"ok"}

# 5. Restart frontend
npm run dev
```

**For detailed help:** See `FAILED_TO_FETCH_FIX.md`

**Auto-diagnosis (Windows):** Run `.\diagnose.ps1`

---

## 📚 Documentation

- `PRODUCTION_BACKEND_GUIDE.md` - Full setup guide
- `BACKEND_SETUP.md` - Technical details
- `IMPLEMENTATION_SUMMARY.md` - What was done
- `FAILED_TO_FETCH_FIX.md` - Troubleshooting fetch errors
  **$0/month**

- Render.com: Free tier
- Firebase: Spark plan
- Unlimited requests (free tier)

---

**Ready to go!** 🎉
