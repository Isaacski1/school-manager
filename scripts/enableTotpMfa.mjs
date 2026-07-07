import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import admin from "firebase-admin";

dotenv.config({ path: path.join(process.cwd(), "server", ".env.local") });
dotenv.config({ path: path.join(process.cwd(), "server", ".env") });
dotenv.config({ path: path.join(process.cwd(), ".env") });

const DRY_RUN = process.argv.includes("--dry-run");
const ADJACENT_INTERVALS = Number(
  process.env.FIREBASE_TOTP_ADJACENT_INTERVALS || 5,
);

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

const uniqueFactors = (factorIds) =>
  Array.from(new Set((factorIds || []).filter(Boolean)));

const main = async () => {
  if (
    !Number.isInteger(ADJACENT_INTERVALS) ||
    ADJACENT_INTERVALS < 0 ||
    ADJACENT_INTERVALS > 10
  ) {
    throw new Error(
      "FIREBASE_TOTP_ADJACENT_INTERVALS must be an integer from 0 to 10.",
    );
  }

  initializeFirebaseAdmin();

  const auth = admin.auth();
  const manager = auth.projectConfigManager();
  const currentConfig = await manager.getProjectConfig();
  const currentMfa = currentConfig.multiFactorConfig || {};
  const factorIds = uniqueFactors(currentMfa.factorIds || []);
  const existingProviderConfigs = currentMfa.providerConfigs || [];
  const providerConfigs = [
    ...existingProviderConfigs.filter(
      (provider) => !provider?.totpProviderConfig,
    ),
    {
      state: "ENABLED",
      totpProviderConfig: {
        adjacentIntervals: ADJACENT_INTERVALS,
      },
    },
  ];

  const nextConfig = {
    multiFactorConfig: {
      state: "ENABLED",
      providerConfigs,
      ...(factorIds.length ? { factorIds } : {}),
    },
  };

  console.log("Firebase project:", admin.app().options.projectId || "(default)");
  console.log("Current MFA config:", JSON.stringify(currentMfa, null, 2));
  console.log("Next MFA config:", JSON.stringify(nextConfig.multiFactorConfig, null, 2));

  if (DRY_RUN) {
    console.log("Dry run only. No Firebase settings were changed.");
    return;
  }

  const updatedConfig = await manager.updateProjectConfig(nextConfig);
  console.log(
    "TOTP MFA enabled:",
    JSON.stringify(updatedConfig.multiFactorConfig, null, 2),
  );
};

main().catch((error) => {
  console.error("Failed to enable TOTP MFA:", error?.message || error);
  process.exitCode = 1;
});
