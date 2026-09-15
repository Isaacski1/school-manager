import https from "https";
import http from "http";
import { URL } from "url";

const BACKEND = "http://localhost:3001";
const FIREBASE_API_KEY = "AIzaSyCt11AcFi9JbwedTdOGRBNOsG-h_0psGBo";

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BACKEND);
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(url, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = data;
        }
        resolve({ status: res.statusCode, data: parsed });
      });
    });
    req.on("error", (err) => {
      console.error(`Request error for ${path}:`, err);
      reject(err);
    });
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

async function getValidIdToken() {
  const identityUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`;
  const res = await request(identityUrl, {
    method: "POST",
    body: {
      email: "test-debug@example.com",
      password: "TestPassword123!",
      returnSecureToken: true,
    },
  });
  if (res.status !== 200) {
    throw new Error(`Failed to sign in: ${JSON.stringify(res.data)}`);
  }
  return res.data.idToken;
}

async function main() {
  console.log("Getting valid ID token...");
  const idToken = await getValidIdToken();
  console.log("ID token obtained, length:", idToken.length);

  // Decode payload to verify it's valid JSON
  const payload = idToken.split(".")[1];
  const json = Buffer.from(payload, "base64url").toString("utf8");
  console.log("Payload JSON:", json);

  const endpoints = [
    { name: "platform-broadcasts/inbox", path: "/api/platform-broadcasts/inbox", method: "GET" },
    { name: "admin-mfa-policy", path: "/api/auth/admin-mfa-policy", method: "GET" },
    { name: "term-rollover/check", path: "/api/schools/term-rollover/check", method: "POST" },
  ];

  for (const ep of endpoints) {
    console.log(`\n=== ${ep.name} ===`);
    try {
      const res = await request(ep.path, {
        method: ep.method,
        headers: { Authorization: `Bearer ${idToken}` },
      });
      console.log(`Status: ${res.status}`);
      console.log(`Response: ${JSON.stringify(res.data, null, 2)}`);
    } catch (error) {
      console.log(`Error: ${error.message}`);
    }
  }
}

main();
