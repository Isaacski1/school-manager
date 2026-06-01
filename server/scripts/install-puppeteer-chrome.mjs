import { spawnSync } from "child_process";
import { mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const serverDir = dirname(scriptDir);
const cacheDir = join(serverDir, ".cache", "puppeteer");

mkdirSync(cacheDir, { recursive: true });

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(
  command,
  ["puppeteer", "browsers", "install", "chrome"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      PUPPETEER_CACHE_DIR: cacheDir,
    },
  },
);

if (result.error) {
  console.error("[WhatsApp] Failed to install Puppeteer Chrome:", result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 0);
