import admin from "firebase-admin";
import path from "path";
import dotenv from "dotenv";

const cwd = process.cwd();
dotenv.config({ path: path.resolve(cwd, "server", ".env") });
dotenv.config({ path: path.resolve(cwd, ".env") });

const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
console.log("rawKey length:", rawKey?.length);
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
  console.error("Failed to parse service account key:", e);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const idToken = "eyJhbGciOiJSUzI1NiIsImtpZCI6IjY2MmQ3YTBkNGVlZmQzNDMyNjFjYWRkZmZhZWM2MjNkYzZjYTlmZjAiLCJ0eXAiOiJKV1QifQ.eyJyb2xlIjoic2Nob29sX2FkbWluIiwic2Nob29sSWQiOiJzY2hvb2wxIiwiaXNzIjoiaHR0cHM6Ly9zZWN1cmV0b2tlbi5nb29nbGVhcGlzLmNvbS9zY2hvb2wtbWFuYWdlci1naCIsImF1ZCI6InNjaG9vbC1tYW5hZ2VyLWdoIiwiYXV0aF90aW1lIjoxNzg5NDU5MjgxLCJ1c2VyX2lkIjoiU20xV0lJNVNDR2cyMzdQOGZjOVlqWktnUkdHMiIsInN1YiI6IlNtMVdJSTVTQ0dnMjM3UDhmYzlZalpLZ1JHRzIiLCJpYXQiOjE3ODk0NTkyODEsImV4cCI6MTc4OTQ2Mjg4MSwiZW1haWwiOiJ0ZXN0LWRlYnVnQGV4YW1wbGUuY29tIiwiZW1haWxfdmVyaWZpZWJpdHkiOnRydWUsImZpcmViYXNlIjp7ImlkZW50aXRpZXMiOnsiZW1haWwiOlsiInRlc3QtZGVidWdAZXhhbXBsZS5jb20iXX0sInNpZ25faW5fcHJvdmlkZXIiOiJwYXNzd29yZCJ9fQ.ZNl4Se16CHMdWe70eis6IwU0ai2_o2t_XuZxXkdcyxHWAZ5BFntO9IkT9ViSdFitqsb3Wdh98-yK5at9OGF8Lh5Pk-C1NmjQtU0NSYd93PQ_U0YbvzKudeHK1M7YQfYPlRxzw3345Ph3rom1xRpZQkswGo_rzMORjzAWlt3maag5ZsdnMy8p-8vsXHT_AJXGRVK7XO6w2YtB0kxy_DO39iN-QJf5rJqWVKNLK1L9TzWIv37WUhvQJU_hQ4chTewGnWmV6rZ97CxpOKC1erVXXuRydztfiCtDrC2GhbA_iBy0pSb9mAArFKYNDPImAkbgIrlUnST0TnWzHyP-pTzqfA";

console.log("idToken length:", idToken.length);

// Decode payload manually
const payload = idToken.split(".")[1];
const json = Buffer.from(payload, "base64url").toString("utf8");
console.log("Payload JSON:", json);

try {
  const decoded = await admin.auth().verifyIdToken(idToken);
  console.log("Token verified successfully:", decoded);
} catch (error) {
  console.error("Token verification failed:", error.code, error.message);
}
