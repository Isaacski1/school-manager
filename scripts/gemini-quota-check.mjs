import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.resolve(__dirname, "..", "server", ".env");

function getEnvValue(key) {
  const content = fs.readFileSync(ENV_PATH, "utf8");
  const regex = new RegExp(`^${key}=(.*)$`, "m");
  const match = content.match(regex);
  return match ? match[1].trim() : null;
}

const apiKey = getEnvValue("GEMINI_API_KEY");
const model = getEnvValue("GEMINI_MODEL") || "gemini-3.7-flash";

if (!apiKey) {
  console.error("GEMINI_API_KEY is not set in server/.env");
  process.exit(1);
}

const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

const body = JSON.stringify({
  contents: [{ role: "user", parts: [{ text: "hi" }] }],
  generationConfig: { temperature: 0.2, maxOutputTokens: 16 },
});

const start = Date.now();
try {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  const firstByteMs = Date.now() - start;
  const responseText = await response.text();

  if (response.status === 200) {
    console.log(`STATUS: 200 OK`);
    console.log(`First byte: ${firstByteMs}ms`);
    console.log(`Quota appears reset.`);
  } else if (response.status === 429) {
    console.log(`STATUS: 429 QUOTA EXCEEDED`);
    console.log(`First byte: ${firstByteMs}ms`);

    const retryMatch = responseText.match(/Please retry in ([0-9.]+)s/i);
    const quotaMatch = responseText.match(/Quota exceeded for metric: ([^,]+), limit: ([0-9]+)/i);
    if (retryMatch) {
      console.log(`Retry-after: ${retryMatch[1]}s`);
    }
    if (quotaMatch) {
      console.log(`Quota metric: ${quotaMatch[1]}`);
      console.log(`Quota limit: ${quotaMatch[2]}`);
    }

    const bodySlice = responseText.slice(0, 600);
    console.log(`Response body (first 600 chars): ${bodySlice}`);
  } else {
    console.log(`STATUS: ${response.status}`);
    console.log(`First byte: ${firstByteMs}ms`);
    console.log(`Response body (first 600 chars): ${responseText.slice(0, 600)}`);
  }
} catch (error) {
  console.error(`Network error: ${error.message}`);
}
