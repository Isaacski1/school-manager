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

const NVIDIA_API_KEY = getEnvValue("NVIDIA_API_KEY") || process.env.NVIDIA_API_KEY || "";
const FIREBASE_SERVICE_ACCOUNT_KEY = getEnvValue("FIREBASE_SERVICE_ACCOUNT_KEY");
const FIREBASE_API_KEY = getEnvValue("FIREBASE_API_KEY") || "AIzaSyCt11AcFi9JbwedTdOGRBNOsG-h_0psGBo";
const PROJECT_ID = getEnvValue("FIREBASE_PROJECT_ID") || "school-manager-gh";

if (!NVIDIA_API_KEY) {
  console.error("NVIDIA_API_KEY not found");
  process.exit(1);
}

const serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT_KEY);
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: PROJECT_ID,
  });
}

const db = admin.firestore();
const schoolId = "benchmark-school";
const uid = `benchmark-user-${Date.now()}`;

await db.collection("schools").doc(schoolId).set({
  name: "Benchmark School",
  status: "active",
  featurePlan: "standard",
}, { merge: true });

await db.collection("users").doc(uid).set({
  uid,
  email: `benchmark-${Date.now()}@test.com`,
  role: "school_admin",
  schoolId,
  schoolName: "Benchmark School",
}, { merge: true });

const customToken = await admin.auth().createCustomToken(uid, {
  email: `benchmark-${Date.now()}@test.com`,
  role: "school_admin",
  schoolId,
});

const tokenResponse = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${FIREBASE_API_KEY}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ token: customToken, returnSecureToken: true }),
});

const tokenData = await tokenResponse.json();
const idToken = tokenData.idToken;

const BACKEND_URL = "http://localhost:3002";

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

const questions = [
  { name: "Hello", message: "Hello" },
  { name: "Informational", message: "What can you help me with?" },
  { name: "Student", message: "Find student John" },
  { name: "Attendance", message: "What is the attendance today?" },
  { name: "Fees", message: "Show me fee balances" },
  { name: "Multi-tool", message: "Find student John and show their attendance and fees" },
];

const results = {};

for (const q of questions) {
  console.log(`\n--- Test: ${q.name} ---`);
  const startTime = Date.now();

  try {
    const response = await request("/api/admin/school-assistant/chat", {
      method: "POST",
      token: idToken,
      body: {
        message: q.message,
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

    results[q.name] = { status: response.status, totalTime, answer: response.data.answer };
  } catch (error) {
    console.error(`Error: ${error.message}`);
    results[q.name] = { error: error.message };
  }

  await new Promise(resolve => setTimeout(resolve, 2000));
}

console.log("\n=== Summary ===");
for (const [name, result] of Object.entries(results)) {
  if (result.error) {
    console.log(`${name}: ERROR - ${result.error}`);
  } else {
    console.log(`${name}: ${result.totalTime}ms (status: ${result.status})`);
  }
}

console.log("\nCheck server logs for AI_TIMING entries");
