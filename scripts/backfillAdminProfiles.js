/**
 * Backfill Script: Provision existing Auth-only admins with Firestore profiles
 *
 * Usage: node scripts/backfillAdminProfiles.js
 *
 * This script:
 * 1. Lists all Firebase Auth users
 * 2. For each user, checks if Firestore users/{uid} doc exists
 * 3. If missing, prompts to manually provision with role + schoolId
 *
 * IMPORTANT: Do not auto-guess role or schoolId - require manual input from Super Admin
 */

import admin from "firebase-admin";
import fs from "fs";
import path from "path";

const serviceAccountPath = path.join(process.cwd(), ".env");
const envContent = fs.readFileSync(serviceAccountPath, "utf-8");

const match = envContent.match(/FIREBASE_SERVICE_ACCOUNT_KEY=(.*)/);
if (!match) {
  console.error("ERROR: FIREBASE_SERVICE_ACCOUNT_KEY not found in .env");
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(match[1]);
} catch (e) {
  console.error("ERROR: Failed to parse service account JSON:", e.message);
  process.exit(1);
}

try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
  console.log("✓ Firebase Admin SDK initialized");
} catch (error) {
  console.error("Firebase initialization error:", error.message);
  process.exit(1);
}

async function backfillAdminProfiles() {
  console.log("\n📋 Scanning Firebase Auth users...\n");

  let pageToken = undefined;
  let totalUsers = 0;
  let missingProfiles = [];

  try {
    // Paginate through all Auth users
    do {
      const listUsersResult = await admin.auth().listUsers(1000, pageToken);
      totalUsers += listUsersResult.users.length;

      // Check each user's Firestore profile
      for (const user of listUsersResult.users) {
        const userDoc = await admin
          .firestore()
          .collection("users")
          .doc(user.uid)
          .get();

        if (!userDoc.exists) {
          missingProfiles.push({
            uid: user.uid,
            email: user.email || "(no email)",
            displayName: user.displayName || "(no display name)",
          });

          console.log(`❌ Missing profile: ${user.email} (uid: ${user.uid})`);
        } else {
          console.log(`✓ Has profile: ${user.email}`);
        }
      }

      pageToken = listUsersResult.pageToken;
    } while (pageToken);

    console.log(`\n📊 Summary:`);
    console.log(`   Total Auth users: ${totalUsers}`);
    console.log(`   Missing Firestore profiles: ${missingProfiles.length}`);

    if (missingProfiles.length === 0) {
      console.log(
        "\n✅ All Auth users have Firestore profiles! Backfill complete.",
      );
      process.exit(0);
    }

    console.log("\n⚠️  Users needing provisioning:");
    missingProfiles.forEach((user, idx) => {
      console.log(`\n${idx + 1}. ${user.email}`);
      console.log(`   UID: ${user.uid}`);
      console.log(`   Display Name: ${user.displayName}`);
      console.log(
        "\n   To provision, call POST /api/superadmin/provision-user:",
      );
      console.log(`   {`);
      console.log(`     "idToken": "<super_admin_id_token>",`);
      console.log(`     "uid": "${user.uid}",`);
      console.log(
        `     "role": "school_admin",  // or "teacher", "super_admin", etc.`,
      );
      console.log(
        `     "schoolId": "<schoolId>",  // required for school_admin`,
      );
      console.log(`     "fullName": "${user.displayName}",`);
      console.log(`     "email": "${user.email}"`);
      console.log(`   }`);
    });

    console.log(
      "\n💡 TIP: Use the Super Admin panel to provision these users manually.",
    );
  } catch (error) {
    console.error("Error during backfill:", error.message);
    process.exit(1);
  }

  process.exit(0);
}

backfillAdminProfiles();
