# Smoke Tests (Core Flows)

Run these after local setup or before deploying.

## 1) Backend health

```bash
curl http://localhost:3001/health
curl http://localhost:3001/version
```

Expected:

- `health` returns `{ "status": "ok" }`
- `version` returns `{ "version": "...", "environment": "..." }`

## 2) Super Admin: create school

From the UI:

1. Log in as super_admin.
2. Go to `/super-admin/schools`.
3. Create a school.
4. Verify Firestore `schools/{id}` exists.
5. Check `activity_logs` for `school_created`.

## 3) Super Admin: create school admin

1. Open the school details page.
2. Use “Create School Admin”.
3. Verify Firebase Auth user exists.
4. Verify `users/{uid}` has `role: school_admin`, `schoolId`.
5. Check `activity_logs` for `school_admin_created`.

## 4) School Admin: create teacher

1. Log in as school_admin.
2. Go to “Manage Teachers”.
3. Create a teacher.
4. Verify `users/{uid}` has `role: teacher`, `schoolId`.
5. Check `activity_logs` for `teacher_created`.

## 5) Billing

1. Go to Billing.
2. Initiate payment.
3. Verify `payments/{reference}` created.
4. Check `activity_logs` for `billing_initiated`.

## 6) Backups

1. Go to System Settings.
2. Create a term backup.
3. Verify `backups/{id}` exists.
4. Check `activity_logs` for `backup_created`.
