import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import process from 'process';

let serviceAccount;

// Load service account from environment variables (same as server.js does)
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    const resolvedPath = path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
    const rawJson = fs.readFileSync(resolvedPath, 'utf8');
    serviceAccount = JSON.parse(rawJson);
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    let rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY.trim();
    if ((rawKey.startsWith('"') && rawKey.endsWith('"')) || (rawKey.startsWith("'") && rawKey.endsWith("'"))) {
      rawKey = rawKey.slice(1, -1);
    }
    let parsedKey = JSON.parse(rawKey);
    if (typeof parsedKey === 'string') {
      parsedKey = JSON.parse(parsedKey);
    }
    serviceAccount = parsedKey;
  } else {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_SERVICE_ACCOUNT_KEY is not set');
  }
} catch (error) {
  console.error('Failed to load Firebase service account:', error.message);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id,
});

async function checkVerificationQueue() {
  try {
    const queueRef = admin.firestore().collection('email_verification_queue');
    const snapshot = await queueRef.orderBy('createdAt', 'desc').limit(5).get();
    
    console.log(`\nVerification Queue - Last 5 Items:`);
    console.log('====================================');
    
    if (snapshot.empty) {
      console.log('Queue is empty');
    } else {
      snapshot.forEach(doc => {
        const data = doc.data();
        console.log(`\nDocument ID: ${doc.id}`);
        console.log(`  Email: ${data.email}`);
        console.log(`  Display Name: ${data.displayName}`);
        console.log(`  Reason: ${data.reason}`);
        console.log(`  Attempts: ${data.attempts}`);
        console.log(`  Created: ${data.createdAt?.toDate?.()?.toISOString() || data.createdAt}`);
        console.log(`  Next Attempt: ${data.nextAttemptAt?.toDate?.()?.toISOString() || data.nextAttemptAt}`);
        if (data.lastError) {
          console.log(`  Last Error: ${data.lastError}`);
        }
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error checking queue:', error);
    process.exit(1);
  }
}

checkVerificationQueue();
