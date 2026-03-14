import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const mode = (process.argv[2] || "").trim().toLowerCase();
const validModes = new Set(["test", "prod"]);

if (!validModes.has(mode)) {
  console.error("Usage: node scripts/switch-env.mjs <test|prod>");
  process.exit(1);
}

const targets = [
  {
    source: path.join(root, `.env.${mode}.local`),
    destination: path.join(root, ".env.local"),
    label: "frontend",
  },
  {
    source: path.join(root, "server", `.env.${mode}.local`),
    destination: path.join(root, "server", ".env.local"),
    label: "backend",
  },
];

const missing = targets.filter((item) => !fs.existsSync(item.source));
if (missing.length > 0) {
  missing.forEach((item) => {
    console.error(`[env] Missing ${item.label} profile: ${item.source}`);
  });
  process.exit(1);
}

targets.forEach((item) => {
  fs.copyFileSync(item.source, item.destination);
  console.log(`[env] ${item.label}: ${path.basename(item.source)} -> ${path.basename(item.destination)}`);
});

console.log(`[env] Active mode: ${mode.toUpperCase()}`);
console.log("[env] Restart running dev servers so changes take effect.");
