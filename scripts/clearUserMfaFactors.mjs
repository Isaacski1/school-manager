import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import admin from "firebase-admin";

dotenv.config({ path: path.join(process.cwd(), "server", ".env.local") });
dotenv.config({ path: path.join(process.cwd(), "server", ".env") });
dotenv.config({ path: path.join(process.cwd(), ".env") });

const DRY_RUN = process.argv.includes("--dry-run");
const getArg = (name) => {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length).trim() : "";
};

const EMAIL = getArg("email");
const UID = getArg("uid");

const normalizeServiceAccount = (account) => {
  if (account && typeof account.private_key === "string") {
    account.private_key = account.private_key.replace(/\\n/g, "\n");
  }
  return account;
};

const parseJsonOrPath = (rawValue) => {
  const trimmed = String(rawValue || "").trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    const resolvedPath = path.isAbsolute(trimmed)
      ? trimmed
      : path.resolve(process.cwd(), trimmed);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(
        "Credential value is neither valid JSON nor an existing file path.",
      );
    }
    return JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
  }
};

const parseServiceAccount = () => {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    return normalizeServiceAccount(
      JSON.parse(
        fs.readFileSync(
          path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH),
          "utf8",
        ),
      ),
    );
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    return normalizeServiceAccount(
      parseJsonOrPath(process.env.FIREBASE_SERVICE_ACCOUNT_KEY),
    );
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return normalizeServiceAccount(
      parseJsonOrPath(process.env.FIREBASE_SERVICE_ACCOUNT_JSON),
    );
  }

  return null;
};

const initializeFirebaseAdmin = () => {
  const serviceAccount = parseServiceAccount();
  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id,
    });
    return;
  }

  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId:
      process.env.FIREBASE_PROJECT_ID ||
      process.env.GCLOUD_PROJECT ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      undefined,
  });
};

const factorSummary = (userRecord) =>
  (userRecord.multiFactor?.enrolledFactors || []).map((factor) => ({
    uid: factor.uid,
    displayName: factor.displayName || null,
    factorId: factor.factorId,
    phoneNumber: factor.phoneNumber || null,
    enrollmentTime: factor.enrollmentTime || null,
  }));

const main = async () => {
  if (!EMAIL && !UID) {
    throw new Error("Pass --email=user@example.com or --uid=firebaseUid.");
  }

  initializeFirebaseAdmin();

  const auth = admin.auth();
  const userRecord = UID
    ? await auth.getUser(UID)
    : await auth.getUserByEmail(EMAIL);
  const before = factorSummary(userRecord);

  console.log("Firebase project:", admin.app().options.projectId || "(default)");
  console.log("Target user:", {
    uid: userRecord.uid,
    email: userRecord.email,
  });
  console.log("Current MFA factors:", JSON.stringify(before, null, 2));

  if (DRY_RUN) {
    console.log("Dry run only. No MFA factors were removed.");
    return;
  }

  const updated = await auth.updateUser(userRecord.uid, {
    multiFactor: {
      enrolledFactors: null,
    },
  });

  console.log(
    "Updated MFA factors:",
    JSON.stringify(factorSummary(updated), null, 2),
  );
  console.log("All MFA factors removed for this user.");
};

main().catch((error) => {
  console.error("Failed to clear MFA factors:", error?.message || error);
  process.exitCode = 1;
});
