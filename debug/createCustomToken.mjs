import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

const cwd = process.cwd();
console.log("cwd:", cwd);
const serverEnvPath = path.resolve(cwd, "server", ".env");
const rootEnvPath = path.resolve(cwd, ".env");
console.log("server .env path:", serverEnvPath);
console.log("root .env path:", rootEnvPath);
dotenv.config({ path: serverEnvPath });
dotenv.config({ path: rootEnvPath });
console.log("FIREBASE_SERVICE_ACCOUNT_KEY set:", !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

let serviceAccount;
const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!rawKey) {
  console.error("FIREBASE_SERVICE_ACCOUNT_KEY is not set");
  process.exit(1);
}
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

const testUid = "test-debug-user-001";
const customToken = await admin.auth().createCustomToken(testUid, {
  role: "school_admin",
  schoolId: "school1",
});
console.log("Custom token:", customToken);
