# Scheduled Jobs (Scaffolding)

This folder is reserved for lightweight background jobs.

Recommended tasks:

- **Billing reconciliation**: nightly check Paystack subscription status and update `schools.billing`.
- **Backup verification**: weekly check for latest term backup per school.

Implementation options:

- **Render/Railway cron**: call a protected API endpoint on a schedule.
- **GitHub Actions**: run a Node script with service account credentials.
- **Cloud Scheduler** (if using GCP): trigger a secured HTTP endpoint.

Suggested endpoints to add later:

- `POST /api/jobs/reconcile-billing`
- `POST /api/jobs/verify-backups`

Security note: secure job endpoints with a shared secret header (e.g., `X-Job-Secret`).
