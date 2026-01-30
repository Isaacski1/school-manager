# How to Get Firebase Service Account Key

## Step-by-Step Guide

### 1. Go to Firebase Console

https://console.firebase.google.com/project/noble-care-management-system

### 2. Click Settings Icon

Click the ⚙️ **Settings** icon (gear) in the top-left corner

### 3. Go to Service Accounts

Click the **Service Accounts** tab

### 4. Generate New Private Key

Click **"Generate New Private Key"** button

A JSON file will automatically download.

### 5. Open the Downloaded File

Open the JSON file in a text editor (Notepad, VS Code, etc.)

### 6. Copy the JSON Content

Select all the content (Ctrl+A) and copy it (Ctrl+C)

### 7. Create .env File

Create a file named `.env` in your project root (same level as `server.js`)

### 8. Paste Service Account Key

```env
PORT=3001
FIREBASE_PROJECT_ID=noble-care-management-system
FIREBASE_SERVICE_ACCOUNT_KEY=
```

Paste the JSON content after `FIREBASE_SERVICE_ACCOUNT_KEY=`

The full line should look like:

```env
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"noble-care-management-system",...}
```

---

## Important Security Notes

⚠️ **NEVER commit `.env` file to Git!**

The `.env` file is already in `.gitignore` to prevent accidental leaks.

⚠️ **Keep the service account key private!**

This key allows full access to your Firebase project. Don't share it with anyone.

---

## File Location

Your `.env` file should be at:

```
noble-care-academy/
├── server.js
├── .env          ← Create here
├── pages/
├── package.json
└── ... other files
```

---

## Troubleshooting

### "ENOENT: no such file or directory, open '.env'"

- Make sure `.env` file exists in the root directory
- The filename should be exactly `.env` (with the dot)
- The file should be in the same directory as `server.js`

### "Firebase initialization error"

- Check that `FIREBASE_SERVICE_ACCOUNT_KEY` is valid JSON
- Make sure you copied the entire content from the downloaded file
- The JSON should start with `{"type":"service_account"...}` and end with `}`

### "Credentials not found"

- Verify all three environment variables are set in `.env`
- Check that `FIREBASE_PROJECT_ID` matches your actual project ID
- Make sure file is named exactly `.env` (lowercase, no extension)

---

## Next Steps

Once `.env` is created:

```bash
npm install
npm run server:dev
```

The backend should start successfully! 🎉
