import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), "server", ".env") });

let rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY.trim();
if ((rawKey.startsWith('"') && rawKey.endsWith('"')) || (rawKey.startsWith("'") && rawKey.endsWith("'"))) {
  rawKey = rawKey.slice(1, -1);
}
let serviceAccount = JSON.parse(rawKey);
if (typeof serviceAccount === "string") {
  serviceAccount = JSON.parse(serviceAccount);
}
if (serviceAccount.private_key) {
  serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

async function run() {
  try {
    const backupsSnap = await admin.firestore().collection("backups").orderBy("timestamp", "desc").limit(5).get();
    console.log(`Found ${backupsSnap.size} backups`);
    
    for (const doc of backupsSnap.docs) {
      const data = doc.data();
      console.log(`Backup: ${doc.id}`);
      console.log(`  School: ${data.schoolId}`);
      console.log(`  Type: ${data.backupType}`);
      console.log(`  Data size: ${JSON.stringify(data.data || {}).length} bytes`);
    }
  } catch (err) {
    console.error(err);
  }
}

run();
