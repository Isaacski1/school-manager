import admin from "firebase-admin";
import path from "path";
import dotenv from "dotenv";

const cwd = process.cwd();
dotenv.config({ path: path.resolve(cwd, "server", ".env") });
dotenv.config({ path: path.resolve(cwd, ".env") });

const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!rawKey) {
  console.error("FIREBASE_SERVICE_ACCOUNT_KEY is not set");
  process.exit(1);
}
let serviceAccount;
try {
  serviceAccount = JSON.parse(rawKey);
  if (typeof serviceAccount.private_key === "string") {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
  }
} catch (e) {
  console.error("Failed to parse service account key", e);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const email = "test-debug@example.com";
const password = "TestPassword123!";

async function main() {
  let uid;
  try {
    const user = await admin.auth().getUserByEmail(email);
    uid = user.uid;
    console.log("User already exists:", uid);
  } catch (e) {
    const userRecord = await admin.auth().createUser({
      email,
      password,
      emailVerified: true,
    });
    uid = userRecord.uid;
    console.log("Created user:", uid);
  }

  // Set custom claims
  await admin.auth().setCustomUserClaims(uid, {
    role: "school_admin",
    schoolId: "school1",
  });
  console.log("Set custom claims for", uid);
}

main().catch(console.error);
