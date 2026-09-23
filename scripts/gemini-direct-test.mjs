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
  contents: [{ role: "user", parts: [{ text: "Hello" }] }],
  generationConfig: { temperature: 0.2, maxOutputTokens: 50 },
});

console.log(`Endpoint: ${endpoint.replace(apiKey, "[REDACTED]")}`);
console.log(`Model: ${model}`);
console.log(`Request body size: ${Buffer.byteLength(body)} bytes\n`);

const start = Date.now();
try {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  const firstByteMs = Date.now() - start;
  const responseBody = await response.text();

  console.log(`HTTP status: ${response.status}`);
  console.log(`First byte: ${firstByteMs}ms`);
  console.log(`Response body (first 1000 chars):`);
  console.log(responseBody.slice(0, 1000));
} catch (error) {
  console.error(`Network error: ${error.message}`);
}
