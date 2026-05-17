/**
 * One-shot script: sets CORS on your Firebase Storage bucket.
 * Uses the service account from server/.env — no gsutil or gcloud needed.
 *
 * Run with:  node set-storage-cors.mjs
 */

import { readFileSync } from 'fs';
import { createSign } from 'crypto';

// ── Load service account from server/.env ─────────────────────────────────────
const envRaw = readFileSync('./server/.env', 'utf8');
const match = envRaw.match(/FIREBASE_SERVICE_ACCOUNT_KEY=(.+)/);
if (!match) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY not found in server/.env');
const serviceAccount = JSON.parse(match[1].trim());

const PROJECT_ID = serviceAccount.project_id; // school-manager-gh

// ── CORS rules ────────────────────────────────────────────────────────────────
const corsConfig = [
  {
    origin: [
      'http://localhost:5173',
      'http://localhost:3000',
      'https://school-manager-gh.web.app',
      'https://school-manager-gh.firebaseapp.com',
      'https://schoolmanager.gh',
    ],
    method: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'],
    maxAgeSeconds: 3600,
    responseHeader: [
      'Content-Type',
      'Authorization',
      'Content-Length',
      'User-Agent',
      'x-goog-resumable',
    ],
  },
];

// ── Get an OAuth2 access token using a signed JWT ─────────────────────────────
async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  ).toString('base64url');

  const signingInput = `${header}.${payload}`;
  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  const signature = sign.sign(serviceAccount.private_key, 'base64url');
  const jwt = `${signingInput}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  const data = await res.json();
  if (!data.access_token) throw new Error(`Failed to get token: ${JSON.stringify(data)}`);
  return data.access_token;
}

// ── List all buckets in the project to find the correct name ─────────────────
async function listBuckets(token) {
  const url = `https://storage.googleapis.com/storage/v1/b?project=${PROJECT_ID}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!res.ok) throw new Error(`List buckets failed (${res.status}): ${JSON.stringify(data)}`);
  return (data.items || []).map(b => b.id || b.name);
}

// ── Patch the bucket CORS via Cloud Storage JSON API ─────────────────────────
async function setCors(token, bucketName) {
  const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucketName)}?fields=cors`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ cors: corsConfig }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`PATCH failed (${res.status}): ${JSON.stringify(data)}`);
  return data;
}

// ── Run ───────────────────────────────────────────────────────────────────────
console.log('🔑 Getting access token...');
const token = await getAccessToken();
console.log('✅ Token obtained.\n');

// Discover all buckets in the project
console.log(`🔍 Listing buckets in project "${PROJECT_ID}"...`);
const buckets = await listBuckets(token);
console.log('Found buckets:', buckets);

if (buckets.length === 0) {
  console.error('❌ No buckets found. Make sure the service account has Storage Admin role.');
  process.exit(1);
}

// Try each bucket — apply CORS to all (or change logic to target specific one)
for (const bucket of buckets) {
  console.log(`\n🌐 Setting CORS on: ${bucket}`);
  try {
    const result = await setCors(token, bucket);
    console.log(`✅ CORS set on "${bucket}":`, JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(`❌ Failed for "${bucket}": ${err.message}`);
  }
}

console.log('\n🎉 Done! Hard-refresh your browser (Ctrl+Shift+R) and try uploading again.');

