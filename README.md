<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# School Manager GH - School Management System

A multi-tenant SaaS School Management System built with React (Vite), Firebase (Auth + Firestore), supporting multiple schools with Super Admin oversight.

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Run the app:
   `npm run dev`

## Firebase Setup

### Cloud Functions Deployment

The project includes Firebase Cloud Functions for secure school and user creation.

1. Navigate to functions directory:

   ```bash
   cd functions
   npm install
   ```

2. Deploy functions:

   ```bash
   firebase deploy --only functions
   ```

   Or deploy specific functions:

   ```bash
   firebase deploy --only functions:createSchool,functions:createSchoolAdmin
   ```

### Firestore Security Rules

Update your `firestore.rules` file with the provided multi-tenant isolation rules before deploying.

## Features

- **Multi-tenant Architecture**: Each school operates in complete isolation
- **Role-based Access Control**: Super Admin, School Admin, Teacher roles
- **Super Admin Panel**: Create/manage schools, generate school admins
- **School Management**: Students, teachers, attendance, assessments, reports

## Testing Checklist

1. Create a super_admin user document manually in Firestore:

   ```json
   {
     "fullName": "Super Admin",
     "email": "super@noblecare.com",
     "role": "super_admin",
     "status": "active",
     "createdAt": serverTimestamp()
   }
   ```

2. Login as super admin -> Access `/super-admin/schools`
3. Create a new school -> Verify school document created
4. Create school admin -> Verify user created and can login
5. Login as school admin -> Verify can only access school data
6. Deactivate school -> Verify school admin access blocked
