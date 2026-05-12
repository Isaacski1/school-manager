/**
 * WhatsApp Broadcast Service
 * Uses whatsapp-web.js (CommonJS) via createRequire inside an ESM server.
 */

import { createRequire } from "module";
const require = createRequire(import.meta.url);

let Client, LocalAuth, MessageMedia, qrcode;
try {
  const wwjs = require("whatsapp-web.js");
  Client = wwjs.Client;
  LocalAuth = wwjs.LocalAuth;
  MessageMedia = wwjs.MessageMedia;
  qrcode = require("qrcode");
  console.log("[WhatsApp] whatsapp-web.js loaded successfully.");
} catch (err) {
  console.error("[WhatsApp] Failed to require whatsapp-web.js or qrcode:", err.message);
}

let client = null;
let clientStatus = "disconnected";
let currentQrBase64 = null;

const RATE_LIMIT_MS = 1200;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const getWhatsAppStatus = () => ({
  status: clientStatus,
  qr: currentQrBase64,
  available: Boolean(Client && LocalAuth && qrcode),
});

export const initWhatsAppClient = () => {
  if (!Client || !LocalAuth) {
    console.error("[WhatsApp] Client/LocalAuth not available.");
    clientStatus = "error";
    return;
  }
  if (client && (clientStatus === "ready" || clientStatus === "connecting" || clientStatus === "qr_ready")) {
    return;
  }

  clientStatus = "connecting";
  currentQrBase64 = null;
  console.log("[WhatsApp] Initializing client...");

  client = new Client({
    authStrategy: new LocalAuth({ dataPath: "./whatsapp-session" }),
    puppeteer: {
      headless: true,
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
    clientStatus = "ready";
    currentQrBase64 = null;
    console.log("[WhatsApp] ✅ Client ready.");
  });

  client.on("auth_failure", (msg) => {
    clientStatus = "error";
    console.error("[WhatsApp] Auth failure:", msg);
  });

  client.on("disconnected", (reason) => {
    clientStatus = "disconnected";
    client = null;
    currentQrBase64 = null;
    console.warn("[WhatsApp] Disconnected:", reason);
  });

  client.initialize().catch((err) => {
    clientStatus = "error";
    console.error("[WhatsApp] Init error:", err.message);
  });
};

export const disconnectWhatsApp = async () => {
  if (client) {
    try { await client.destroy(); } catch (_) {}
    client = null;
  }
  clientStatus = "disconnected";
  currentQrBase64 = null;
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

    // Send directly without isRegisteredUser check (avoids timeout issues)
    await client.sendMessage(chatId, message);
    console.log(`[WhatsApp] ✅ Sent to ${chatId}`);
    return { success: true, phone };
  } catch (err) {
    const msg = err?.message || String(err);
    console.error(`[WhatsApp] ❌ ${phone}: ${msg}`);
    return { success: false, phone, error: msg };
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
  for (const phone of phones) {
    const result = await sendWhatsAppMessage(phone, message);
    results.push(result);
    if (progressCallback) progressCallback(result);
    await sleep(RATE_LIMIT_MS);
  }
  return results;
};
