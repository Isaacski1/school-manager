# Quick Reference: New Backend Endpoints

## 1️⃣ Create School Admin (Super Admin Only)

```
POST http://localhost:3001/api/superadmin/create-school-admin
Content-Type: application/json

{
  "idToken": "<super_admin_id_token>",
  "schoolId": "school_123",
  "fullName": "John Admin",
  "email": "admin@school.com"
}
```

**Success (200):**

```json
{
  "success": true,
  "uid": "abc123xyz",
  "email": "admin@school.com",
  "resetLink": "https://...",
  "message": "School admin created successfully"
}
```

**Error (403):** Not super admin

```json
{ "error": "Only super admins can perform this action" }
```

**Error (400):** Email already exists

```json
{ "error": "A user with this email already exists" }
```

---

## 2️⃣ Provision Missing User (Super Admin Only)

```
POST http://localhost:3001/api/superadmin/provision-user
Content-Type: application/json

{
  "idToken": "<super_admin_id_token>",
  "uid": "existing_user_uid",
  "role": "school_admin",
  "schoolId": "school_123",
  "fullName": "John Admin",
  "email": "admin@school.com"
}
```

**Success (200):**

```json
{
  "success": true,
  "uid": "existing_user_uid",
  "message": "User profile provisioned successfully"
}
```

**Error (403):** Not super admin

```json
{ "error": "Only super admins can perform this action" }
```

**Error (404):** User not found in Auth

```json
{ "error": "User not found in Firebase Auth" }
```

**Error (400):** Profile already exists

```json
{ "error": "User profile already exists in Firestore" }
```

---

## 3️⃣ Create Teacher (School Admin)

No changes to this endpoint, but error messages improved:

```
POST http://localhost:3001/api/createTeacher
Content-Type: application/json

{
  "idToken": "<admin_id_token>",
  "fullName": "Jane Teacher",
  "email": "teacher@school.com",
  "password": null  // optional
}
```

**NEW Error (403):** Admin not provisioned

```json
{
  "error": "Your admin account is not provisioned in Firestore. Contact your Super Admin to provision your profile."
}
```

---

## TypeScript Example (Frontend)

```typescript
async function createSchoolAdmin() {
  const currentUser = auth.currentUser;
  if (!currentUser) return;

  const idToken = await currentUser.getIdToken(true);
  const BACKEND_URL =
    import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

  try {
    const response = await fetch(
      `${BACKEND_URL}/api/superadmin/create-school-admin`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idToken,
          schoolId: "school_123",
          fullName: "John Admin",
          email: "admin@school.com",
        }),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Error:", data.error);
      return;
    }

    console.log("Success! Admin UID:", data.uid);
    console.log("Reset link:", data.resetLink);
  } catch (error) {
    console.error("Network error:", error.message);
  }
}
```

---

## Shell Example (Testing with curl)

```bash
# Get super admin ID token (manually or via CLI)
SUPER_ADMIN_TOKEN="eyJhbGci..."

# Create school admin
curl -X POST http://localhost:3001/api/superadmin/create-school-admin \
  -H "Content-Type: application/json" \
  -d '{
    "idToken": "'$SUPER_ADMIN_TOKEN'",
    "schoolId": "school_123",
    "fullName": "John Admin",
    "email": "admin@school.com"
  }'
```

---

## Backfill Command

```bash
cd f:\Isaacski's File\My Website Designs\noble-care-academy
node scripts/backfillAdminProfiles.js
```

Output will show missing profiles and instructions for each.
