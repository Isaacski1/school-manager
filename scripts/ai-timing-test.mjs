import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.resolve(__dirname, "..", "server", ".env");
const require = createRequire(import.meta.url);

function getEnvValue(key) {
  const content = fs.readFileSync(ENV_PATH, "utf8");
  const regex = new RegExp(`^${key}=(.*)$`, "m");
  const match = content.match(regex);
  return match ? match[1].trim() : null;
}

const FIREBASE_SERVICE_ACCOUNT_KEY = getEnvValue("FIREBASE_SERVICE_ACCOUNT_KEY");
const PROJECT_ID = getEnvValue("FIREBASE_PROJECT_ID") || "school-manager-gh";
const FIREBASE_API_KEY = getEnvValue("FIREBASE_API_KEY") || "AIzaSyCt11AcFi9JbwedTdOGRBNOsG-h_0psGBo";
const BACKEND_URL = "http://localhost:3002";

if (!FIREBASE_SERVICE_ACCOUNT_KEY) {
  console.error("FIREBASE_SERVICE_ACCOUNT_KEY not found in server/.env");
  process.exit(1);
}

const serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT_KEY);
const admin = require("firebase-admin");

async function request(path, options = {}) {
  const url = new URL(path, BACKEND_URL);
  const body = options.body ? JSON.stringify(options.body) : undefined;

  return new Promise((resolve, reject) => {
    const req = http.request(url, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const data = Buffer.concat(chunks).toString();
        resolve({ status: res.statusCode, data: data ? JSON.parse(data) : {} });
      });
    });

    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function runTests() {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: PROJECT_ID,
    });
  }
  
  const db = admin.firestore();
  const schoolId = "test-school-ai-timing";
  
  console.log("Setting up test user and school...");
  await db.collection("schools").doc(schoolId).set({
    name: "AI Timing Test School",
    status: "active",
    featurePlan: "standard",
    createdAt: Date.now(),
  }, { merge: true });
  
  const uid = `test-admin-${Date.now()}`;
  await db.collection("users").doc(uid).set({
    uid,
    email: `ai-timing-test-${Date.now()}@test.com`,
    role: "school_admin",
    schoolId,
    schoolName: "AI Timing Test School",
    createdAt: Date.now(),
  }, { merge: true });
  
  console.log(`Created test user: ${uid} for school: ${schoolId}`);
  
  console.log("Creating custom token...");
  const customToken = await admin.auth().createCustomToken(uid, {
    email: `ai-timing-test-${Date.now()}@test.com`,
    role: "school_admin",
    schoolId,
  });
  
  console.log("Exchanging for ID token...");
  const tokenResponse = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${FIREBASE_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });
  
  const tokenData = await tokenResponse.json();
  if (!tokenData.idToken) {
    console.error("Failed to get ID token:", JSON.stringify(tokenData, null, 2));
    process.exit(1);
  }
  
  const idToken = tokenData.idToken;
  console.log(`Got ID token: ${idToken.substring(0, 20)}...`);
  
  const tests = [
    { name: "Hello", message: "Hello" },
    { name: "Informational", message: "What can you help me with?" },
    { name: "Student", message: "Find student John" },
    { name: "Attendance", message: "What is the attendance today?" },
    { name: "Fees", message: "Show me fee balances" },
    { name: "Multi-tool", message: "Find student John and show their attendance and fees" },
  ];
  
  for (const test of tests) {
    console.log(`\n--- Test: ${test.name} ---`);
    const startTime = Date.now();
    
    try {
      const response = await request("/api/admin/school-assistant/chat", {
        method: "POST",
        token: idToken,
        body: {
          message: test.message,
          pathname: "/admin",
          history: [],
        },
      });
      
      const totalTime = Date.now() - startTime;
      console.log(`Status: ${response.status}`);
      console.log(`Total time: ${totalTime}ms`);
      
      if (response.data.answer) {
        console.log(`Answer preview: ${response.data.answer.substring(0, 100)}...`);
      } else if (response.data.message) {
        console.log(`Message: ${response.data.message}`);
      } else {
        console.log(`Response: ${JSON.stringify(response.data).substring(0, 200)}`);
      }
    } catch (error) {
      console.error(`Error: ${error.message}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log("\n=== Tests complete ===");
  console.log("Check server logs for AI_TIMING entries");
}

runTests().catch((error) => {
  console.error("Test script failed:", error);
  process.exit(1);
});
