/**
 * WhatsApp Broadcast Service
 * Uses whatsapp-web.js (CommonJS) via createRequire inside an ESM server.
 */

import { createRequire } from "module";
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

// Utility functions for safety and timing
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const BROADCAST_BATCH_SIZE = 25;
const BROADCAST_BATCH_PAUSE_MS = 10 * 60 * 1000;
const BROADCAST_MIN_DELAY_MS = 45 * 1000;
const BROADCAST_MAX_DELAY_MS = 120 * 1000;

const waitForReady = async (timeoutMs = 45000) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (clientStatus === "ready") return true;
    if (clientStatus === "qr_ready") return false;
    await sleep(1000);
  }
  return clientStatus === "ready";
};

export const ensureWhatsAppReady = async () => {
  if (clientStatus === "ready") {
    return { ready: true, status: clientStatus };
  }

  if (!client || clientStatus === "error" || clientStatus === "disconnected") {
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
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  if (puppeteerExecutablePath) {
    return puppeteerExecutablePath;
  }
  try {
    const puppeteer = require("puppeteer");
    puppeteerExecutablePath = puppeteer.executablePath();
    return puppeteerExecutablePath;
  } catch (err) {
    console.warn("[WhatsApp] Could not resolve Puppeteer Chrome path:", err?.message || err);
    return null;
  }
};

export const initWhatsAppClient = () => {
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
    puppeteer: {
      headless: true,
      ...(executablePath ? { executablePath } : {}),
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
        "--disable-extensions",
        "--disable-software-rasterizer",
        "--mute-audio",
        "--disable-background-networking",
        "--disable-background-timer-throttling",
        "--disable-client-side-phishing-detection",
        "--disable-default-apps",
        "--disable-hang-monitor",
        "--disable-popup-blocking",
        "--disable-prompt-on-repost",
        "--disable-sync",
        "--disable-translate",
        "--metrics-recording-only",
        "--safebrowsing-disable-auto-update"
      ],
    },
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

  client.on("ready", () => {
    initializing = false;
    clientStatus = "ready";
    currentQrBase64 = null;
    console.log("[WhatsApp] ✅ Client ready.");
  });

  client.on("auth_failure", (msg) => {
    initializing = false;
    clientStatus = "error";
    lastError = `Authentication failed: ${msg}`;
    console.error("[WhatsApp] Auth failure:", msg);
  });

  client.on("disconnected", (reason) => {
    initializing = false;
    clientStatus = "disconnected";
    client = null;
    currentQrBase64 = null;
    console.warn("[WhatsApp] Disconnected:", reason);
  });

  client.initialize().catch((err) => {
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
  if (client) {
    try { await client.destroy(); } catch (_) {}
    client = null;
  }
  initializing = false;
  clientStatus = "disconnected";
  currentQrBase64 = null;
};

export const requestPairingCode = async (phone) => {
  if (!client || (clientStatus !== "qr_ready" && clientStatus !== "connecting")) {
    console.warn(`[WhatsApp] Cannot request pairing code: Client is ${clientStatus}`);
    throw new Error("WhatsApp client must be initializing to request a code.");
  }
  try {
    const digits = normalizePhone(phone);
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
