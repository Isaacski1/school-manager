import admin from "firebase-admin";
import fs from "fs";
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

const idToken = "eyJhbGciOiJSUzI1NiIsImtpZCI6IjY2MmQ3YTBkNGVlZmQzNDMyNjFjYWRkZmZhZWM2MjNkYzZjYTlmZjAiLCJ0eXAiOiJKV1QifQ.eyJyb2xlIjoic2Nob29sX2FkbWluIiwic2Nob29sSWQiOiJzY2hvb2wxIiwiaXNzIjoiaHR0cHM6Ly9zZWN1cmV0b2tlbi5nb29nbGVhcGlzLmNvbS9zY2hvb2wtbWFuYWdlci1naCIsImF1ZCI6InNjaG9vbC1tYW5hZ2VyLWdoIiwiYXV0aF90aW1lIjoxNzg5NDM2MTM1LCJ1c2VyX2lkIjoidGVzdC1kZWJ1Zy11c2VyLTAwMSIsInN1YiI6InRlc3QtZGVidWctdXNlci0wMDEiLCJpYXQiOjE3ODk0MzYxMzUsImV4cCI6MTc4OTQzOTczNSwiZmlyZWJhc2UiOnsiaWRlbnRpdGllcyI6e30sInNpZ25faW5fcHJvdmlkZXIiOiJjdXN0b20ifX0.aLFXjeDKuLw5rR4aWocDxYlID9hK6mDehXQyY03LRax3BQ_g1vJbJec7mD7PbfxVpvYUzcGiZrdgvJ7kdAisTZPyQFaDThIImiFTCcaFIXvqVTvd5Mqrywktl0FdUdp6fQMimf5dQ4D9riy7fZvVa9YBrEKIlusMlfiLhybbndNiHjHBrwR3HgzW0o_wxTjFvZbuXBMUEARXRJvml-ApInwd6LqH-BiM89xN_XcuREpjugZQbvZ3FkCLh6GEp4FJk8U6Ewm6wQ3THQkyElaPWEgDGOEVNeVVxWCvIoq7o3RJr3bFwvErWk_Dw95NDtbAVNGhPDHqO62zIm9xsBCt1g";

try {
  const decoded = await admin.auth().verifyIdToken(idToken);
  console.log("Token verified successfully:", decoded);
} catch (error) {
  console.error("Token verification failed:", error.code, error.message);
}
