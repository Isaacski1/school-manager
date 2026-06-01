import { createRequire } from "module";
import { spawnSync } from "child_process";
import { existsSync, mkdirSync, rmSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const serverDir = dirname(scriptDir);
const cacheDir = join(serverDir, ".cache", "puppeteer");
const require = createRequire(import.meta.url);
const puppeteerCli = require.resolve("puppeteer/lib/cjs/puppeteer/node/cli.js");

const systemChromePaths =
  process.platform === "win32"
    ? [
        join(process.env.PROGRAMFILES || "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
        join(process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)", "Google", "Chrome", "Application", "chrome.exe"),
      ]
    : [
        "/usr/bin/google-chrome-stable",
        "/usr/bin/google-chrome",
        "/usr/bin/chromium-browser",
        "/usr/bin/chromium",
      ];

mkdirSync(cacheDir, { recursive: true });
rmSync(join(cacheDir, "chrome"), { recursive: true, force: true });

const result = spawnSync(
  process.execPath,
  [puppeteerCli, "browsers", "install", "chrome"],
  {
    stdio: "inherit",
    cwd: serverDir,
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

if ((result.status ?? 0) !== 0) {
  const systemChrome = systemChromePaths.find((chromePath) => existsSync(chromePath));
  if (systemChrome) {
    console.warn(`[WhatsApp] Puppeteer Chrome download failed, but system Chrome is available at: ${systemChrome}`);
    console.warn("[WhatsApp] Local development can continue. Set PUPPETEER_EXECUTABLE_PATH to this path on servers if needed.");
    process.exit(0);
  }
}

process.exit(result.status ?? 0);
