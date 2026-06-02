/**
 * WhatsApp Broadcast Service
 * Uses whatsapp-web.js (CommonJS) via createRequire inside an ESM server.
 */

import { createRequire } from "module";
import { existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
const require = createRequire(import.meta.url);

const serverDir = dirname(fileURLToPath(import.meta.url));
const puppeteerCacheDir = join(serverDir, ".cache", "puppeteer");
process.env.PUPPETEER_CACHE_DIR ||= puppeteerCacheDir;

const configuredWebVersionRemotePath = String(
  process.env.WHATSAPP_WEB_VERSION_REMOTE_PATH || "",
).trim();
const configuredUserAgent = String(
  process.env.WHATSAPP_USER_AGENT || "",
).trim();

const SYSTEM_CHROME_PATHS =
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

let Client, LocalAuth, MessageMedia, qrcode;
let dependencyError = null;
try {
  const wwjs = require("whatsapp-web.js");
  Client = wwjs.Client;
  LocalAuth = wwjs.LocalAuth;
  MessageMedia = wwjs.MessageMedia;
  qrcode = require("qrcode");
  console.log("[WhatsApp] whatsapp-web.js loaded successfully.");
} catch (err) {
  dependencyError = err?.message || String(err);
  console.error("[WhatsApp] Failed to require whatsapp-web.js or qrcode:", err.message);
}

let client = null;
let clientStatus = "disconnected";
let currentQrBase64 = null;
let lastError = null;
let initializing = false;
let puppeteerExecutablePath = null;
let reconnectTimeout = null;
let initWatchdog = null;

// Utility functions for safety and timing
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clearReconnectTimeout = () => {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
};
const clearInitWatchdog = () => {
  if (initWatchdog) {
    clearTimeout(initWatchdog);
    initWatchdog = null;
  }
};
const BROADCAST_BATCH_SIZE = 25;
const BROADCAST_BATCH_PAUSE_MS = 10 * 60 * 1000;
const BROADCAST_MIN_DELAY_MS = 45 * 1000;
const BROADCAST_MAX_DELAY_MS = 120 * 1000;

const waitForReady = async (timeoutMs = 45000) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (clientStatus === "ready") {
      console.log("[WhatsApp] Client became ready while waiting.");
      return true;
    }
    if (clientStatus === "qr_ready") {
      console.log("[WhatsApp] Client requested QR while waiting.");
      return false;
    }
    await sleep(1000);
  }
  console.warn("[WhatsApp] waitForReady timed out after", timeoutMs, "ms. Current status:", clientStatus);
  return clientStatus === "ready";
};

export const ensureWhatsAppReady = async () => {
  if (clientStatus === "ready") {
    return { ready: true, status: clientStatus };
  }

  if (clientStatus === "connecting" || clientStatus === "qr_ready") {
    console.log(`[WhatsApp] Waiting for existing connection attempt. Current status: ${clientStatus}`);
    const ready = await waitForReady();
    return {
      ready,
      status: clientStatus,
      qr: currentQrBase64,
      lastError,
    };
  }

  if (!client || clientStatus === "disconnected" || clientStatus === "error") {
    console.log(`[WhatsApp] Auto-reconnect requested from status: ${clientStatus}`);
    await disconnectWhatsApp();
    initWhatsAppClient();
  }

  const ready = await waitForReady();
  return {
    ready,
    status: clientStatus,
    qr: currentQrBase64,
    lastError,
  };
};

export const getWhatsAppStatus = () => ({
  status: clientStatus,
  qr: currentQrBase64,
  available: Boolean(Client && LocalAuth && qrcode),
  lastError: lastError || dependencyError,
});

export const clearWhatsAppSession = async () => {
  await disconnectWhatsApp();
  try {
    const fs = await import("fs/promises");
    await fs.rm("./whatsapp-session", { recursive: true, force: true });
    console.log("[WhatsApp] Session folder cleared.");
    lastError = null;
    return { success: true };
  } catch (err) {
    console.error("[WhatsApp] Failed to clear session folder:", err.message);
    return { success: false, error: err.message };
  }
};

export const testPuppeteer = async () => {
  try {
    const puppeteer = require("puppeteer");
    const executablePath = resolvePuppeteerExecutablePath();
    console.log("[WhatsApp] Testing Puppeteer launch...");
    const browser = await puppeteer.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
    const version = await browser.version();
    await browser.close();
    return { success: true, version };
  } catch (err) {
    console.error("[WhatsApp] Puppeteer Test Failed:", err.message);
    return { success: false, error: err.message };
  }
};

const resolvePuppeteerExecutablePath = () => {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    if (existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
      console.log("[WhatsApp] Using PUPPETEER_EXECUTABLE_PATH from environment.");
      return process.env.PUPPETEER_EXECUTABLE_PATH;
    }
    lastError = `PUPPETEER_EXECUTABLE_PATH is set but the file does not exist: ${process.env.PUPPETEER_EXECUTABLE_PATH}`;
    console.warn("[WhatsApp]", lastError);
  }
  if (puppeteerExecutablePath) {
    return puppeteerExecutablePath;
  }

  try {
    const puppeteer = require("puppeteer");
    const bundledPath = puppeteer.executablePath();
    if (existsSync(bundledPath)) {
      console.log("[WhatsApp] Using Puppeteer bundled browser executable.");
      puppeteerExecutablePath = bundledPath;
      return puppeteerExecutablePath;
    }
    console.warn("[WhatsApp] Puppeteer bundled executable path not found:", bundledPath);
  } catch (err) {
    console.warn("[WhatsApp] Could not load puppeteer for bundled executable path:", err?.message || err);
  }

  const systemChromePath = SYSTEM_CHROME_PATHS.find((chromePath) =>
    existsSync(chromePath),
  );
  if (systemChromePath) {
    console.log("[WhatsApp] Falling back to system Chrome executable.");
    puppeteerExecutablePath = systemChromePath;
    return puppeteerExecutablePath;
  }

  lastError = "Chrome executable could not be resolved from PUPPETEER_EXECUTABLE_PATH, puppeteer bundle, or system installations.";
  console.warn("[WhatsApp]", lastError);
  return null;
};

export const initWhatsAppClient = () => {
  clearReconnectTimeout();
  if (!Client || !LocalAuth) {
    console.error("[WhatsApp] Client/LocalAuth not available.");
    clientStatus = "error";
    return;
  }
  if (initializing) {
    console.log("[WhatsApp] Initialization already in progress.");
    return;
  }
  if (client && (clientStatus === "ready" || clientStatus === "connecting" || clientStatus === "qr_ready")) {
    return;
  }

  initializing = true;
  clientStatus = "connecting";
  currentQrBase64 = null;
  lastError = null;
  console.log("[WhatsApp] Initializing client...");
  const executablePath = resolvePuppeteerExecutablePath();
  console.log("[WhatsApp] Puppeteer executable path:", executablePath || "(default bundle or environment default)");

  const puppeteerOptions = {
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    defaultViewport: null,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--window-size=1280,1024",
    ],
    ignoreDefaultArgs: ["--enable-automation"],
    waitForInitialPage: false,
  };

  console.log("[WhatsApp] Puppeteer options:", {
    executablePath: puppeteerOptions.executablePath ? "provided" : "default",
    args: puppeteerOptions.args,
  });

  client = new Client({
    authStrategy: new LocalAuth({ dataPath: "./whatsapp-session" }),
    ...(configuredWebVersionRemotePath
      ? {
          webVersionCache: {
            type: "remote",
            remotePath: configuredWebVersionRemotePath,
          },
        }
      : {}),
    ...(configuredUserAgent ? { userAgent: configuredUserAgent } : {}),
    puppeteer: puppeteerOptions,
  });

  client.on("qr", async (qr) => {
    try {
      clientStatus = "qr_ready";
      currentQrBase64 = await qrcode.toDataURL(qr);
      console.log("[WhatsApp] QR code ready. Please scan in the Admin Panel.");
    } catch (err) {
      console.error("[WhatsApp] QR error:", err.message);
    }
  });

  client.on("authenticated", () => {
    console.log("[WhatsApp] Session authenticated successfully.");
  });

  client.on("loading_screen", (percent, message) => {
    console.log(`[WhatsApp] Loading: ${percent}% - ${message}`);
  });

  client.on("change_state", (state) => {
    console.log(`[WhatsApp] State changed: ${state}`);
  });

  client.on("ready", () => {
    clearInitWatchdog();
    initializing = false;
    clientStatus = "ready";
    currentQrBase64 = null;
    console.log("[WhatsApp] ✅ Client ready.");
  });

  client.on("auth_failure", (msg) => {
    clearInitWatchdog();
    initializing = false;
    clientStatus = "error";
    lastError = `Authentication failed: ${msg}`;
    console.error("[WhatsApp] Auth failure:", msg);
  });

  client.on("disconnected", (reason) => {
    clearInitWatchdog();
    initializing = false;
    clientStatus = "disconnected";
    client = null;
    currentQrBase64 = null;
    console.warn("[WhatsApp] Disconnected:", reason);

    if (existsSync("./whatsapp-session")) {
      clearReconnectTimeout();
      reconnectTimeout = setTimeout(() => {
        console.log("[WhatsApp] Disconnected. Attempting auto-reconnect...");
        initWhatsAppClient();
      }, 20000);
    }
  });

  const initTimeoutMs = Number(process.env.WHATSAPP_INIT_TIMEOUT_MS || 60000);
  const initTimeout = setTimeout(() => {
    if (clientStatus === "connecting") {
      console.warn(
        `[WhatsApp] Initialization is still pending after ${initTimeoutMs}ms. Current status=${clientStatus}. ` +
          "If this continues, check Chrome/Puppeteer environment and the server process.",
      );
    }
  }, initTimeoutMs);

  initWatchdog = setTimeout(() => {
    if (clientStatus === "connecting") {
      console.warn(
        `[WhatsApp] Initialization watchdog triggered after ${initTimeoutMs}ms. ` +
          `Current status still=${clientStatus}. Destroying client and marking as error.`,
      );
      if (client) {
        client.destroy().catch(() => {});
      }
      client = null;
      initializing = false;
      clientStatus = "error";
      lastError = "Initialization timed out waiting for WhatsApp client readiness.";
    }
  }, initTimeoutMs);

  client.initialize()
    .then(() => {
      clearTimeout(initTimeout);
      clearInitWatchdog();
      console.log("[WhatsApp] client.initialize() promise resolved.");
    })
    .catch((err) => {
      clearTimeout(initTimeout);
      clearInitWatchdog();
      initializing = false;
      clientStatus = "error";
      client = null;
      const message = err?.message || String(err);
      lastError = /browser is already running/i.test(message)
        ? "WhatsApp session is already open in another server/browser process. Stop the old Node/Chrome process, then connect again."
        : `Initialization error: ${message}`;
      console.error("[WhatsApp] Init error:", message);
    });
};

export const disconnectWhatsApp = async () => {
  clearReconnectTimeout();
  clearInitWatchdog();
  if (client) {
    try { await client.destroy(); } catch (_) {}
    client = null;
  }
  initializing = false;
  clientStatus = "disconnected";
  currentQrBase64 = null;
};

export const requestPairingCode = async (phone) => {
  try {
    const digits = normalizePhone(phone);
    if (!/^233\d{9}$/.test(digits)) {
      throw new Error("Enter a valid Ghana WhatsApp number, for example 0201008784 or +233201008784.");
    }

    const startedAt = Date.now();
    while (
      (!client || !["qr_ready", "connecting"].includes(clientStatus)) &&
      Date.now() - startedAt < 15000
    ) {
      await sleep(500);
    }

    if (!client || !["qr_ready", "connecting"].includes(clientStatus)) {
      console.warn(`[WhatsApp] Cannot request pairing code: Client is ${clientStatus}`);
      throw new Error(
        `WhatsApp client is ${clientStatus}. Click Start Pairing, wait for the QR code, then request a phone pairing code.`,
      );
    }

    console.log(`[WhatsApp] Requesting Pairing Code for: ${digits}`);
    const code = await client.requestPairingCode(digits);
    console.log(`[WhatsApp] ✅ Pairing Code generated: ${code}`);
    return code;
  } catch (err) {
    console.error(`[WhatsApp] Pairing Code Error:`, err.message);
    throw err;
  }
};

/**
 * Normalize a Ghana phone number to international digits.
 *  0241234567  → 233241234567
 *  +233241234567 → 233241234567
 *  233241234567  → 233241234567
 */
const normalizePhone = (phone) => {
  let digits = String(phone).replace(/[^\d]/g, "");
  if (digits.startsWith("0") && digits.length === 10) {
    digits = "233" + digits.slice(1);
  }
  if (digits.length === 9) {
    digits = "233" + digits;
  }
  return digits;
};

const applySpintax = (text) => {
  if (!text) return text;
  return text.replace(/{([^{}]+)}/g, (match, contents) => {
    const choices = contents.split('|');
    return choices[Math.floor(Math.random() * choices.length)];
  });
};

export const sendWhatsAppMessage = async (phone, message) => {
  if (!client || clientStatus !== "ready") {
    return { success: false, phone, error: "WhatsApp client not connected." };
  }
  try {
    const digits = normalizePhone(phone);
    if (digits.length < 10) {
      return { success: false, phone, error: `Invalid number: ${phone}` };
    }

    const chatId = `${digits}@c.us`;
    console.log(`[WhatsApp] Sending → ${chatId}`);

    // Simulate Human Behavior: Typing duration based on message length (approx 40 chars per second, max 10s)
    const typeDuration = Math.min(10000, Math.max(2000, (message.length / 40) * 1000));
    try {
      const chat = await client.getChatById(chatId);
      await chat.sendStateTyping();
      await sleep(typeDuration + Math.random() * 1000); 
    } catch (_) {
      // Fallback if chat state fails
      await sleep(2000);
    }

    await client.sendMessage(chatId, message);
    console.log(`[WhatsApp] ✅ Sent to ${chatId}`);
    return { success: true, phone, message };
  } catch (err) {
    const msg = err?.message || String(err);
    console.error(`[WhatsApp] ❌ ${phone}: ${msg}`);
    return { success: false, phone, error: msg, message };
  }
};

export const sendWhatsAppMedia = async (phone, caption, base64Data, filename, mimetype) => {
  if (!client || clientStatus !== "ready") {
    console.warn(`[WhatsApp] ⚠️ Cannot send media: Client is ${clientStatus}`);
    return { success: false, phone, error: `WhatsApp client is not ready (Status: ${clientStatus}). Please connect via Admin Panel.` };
  }
  if (!MessageMedia) {
    return { success: false, phone, error: "MessageMedia not available." };
  }

  try {
    const digits = normalizePhone(phone);
    console.log(`[WhatsApp] Raw phone: "${phone}", Normalized digits: "${digits}"`);
    if (digits.length < 10) {
      return { success: false, phone, error: `Invalid number: ${phone}` };
    }

    const chatId = `${digits}@c.us`;
    console.log(`[WhatsApp] Sending Media → ${chatId} (${filename}), Status: ${clientStatus}`);

    // Simulate Human Behavior: Typing...
    try {
      const chat = await client.getChatById(chatId);
      await chat.sendStateTyping();
      await sleep(3000 + Math.random() * 2000); // Type/Upload for 3-5 seconds
    } catch (_) {
      await sleep(3000);
    }

    const media = new MessageMedia(mimetype, base64Data, filename);
    await client.sendMessage(chatId, media, { caption });
    
    console.log(`[WhatsApp] ✅ Media sent to ${chatId}`);
    return { success: true, phone };
  } catch (err) {
    const msg = err?.message || String(err);
    console.error(`[WhatsApp] ❌ Media to ${phone}: ${msg}`);
    return { success: false, phone, error: msg };
  }
};

export const sendWhatsAppToSelf = async (message) => {
  if (!client || clientStatus !== "ready") {
    console.warn(`[WhatsApp] Cannot send to self. Client status is ${clientStatus}`);
    return { success: false, error: "WhatsApp client not ready." };
  }
  if (!client.info || !client.info.wid) {
    console.warn(`[WhatsApp] Cannot send to self. client.info is missing or incomplete:`, client.info);
    return { success: false, error: "Client info missing." };
  }
  try {
    const chatId = client.info.wid._serialized;
    console.log(`[WhatsApp] Attempting to send Admin notification to self (${chatId})...`);
    await client.sendMessage(chatId, message);
    console.log(`[WhatsApp] ✅ Admin notification sent to self (${chatId})`);
    return { success: true };
  } catch (err) {
    console.error(`[WhatsApp] ❌ Admin notification error: ${err.message}`);
    return { success: false, error: err.message };
  }
};

export const broadcastWhatsAppMessages = async (phones, message, progressCallback) => {
  const results = [];
  let count = 0;
  
  for (const phone of phones) {
    count++;
    
    // 1. Spintax parsing for anti-spam message variation
    const spintaxedMessage = applySpintax(message);
    
    // 2. Send the message
    const result = await sendWhatsAppMessage(phone, spintaxedMessage);
    results.push(result);
    if (progressCallback) await progressCallback({ ...result, count, total: phones.length });
    
    // 3. Batching & Pacing Logic
    if (count < phones.length) {
      if (count % BROADCAST_BATCH_SIZE === 0) {
        console.log(`[WhatsApp] Batch limit reached. Pausing for 10 minutes to reduce ban risk...`);
        if (progressCallback) await progressCallback({ type: "pause", duration: BROADCAST_BATCH_PAUSE_MS });
        await sleep(BROADCAST_BATCH_PAUSE_MS);
      } else {
        const delay = BROADCAST_MIN_DELAY_MS + Math.random() * (BROADCAST_MAX_DELAY_MS - BROADCAST_MIN_DELAY_MS);
        await sleep(delay);
      }
    }
  }
  return results;
};
