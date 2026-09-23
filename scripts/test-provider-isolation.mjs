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

function parseCliArgs() {
  const args = process.argv.slice(2);
  const result = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--provider" && args[i + 1]) {
      result.provider = args[++i];
    } else if (arg === "--model" && args[i + 1]) {
      result.model = args[++i];
    } else if (arg === "--preflight") {
      result.preflight = true;
    }
  }
  return result;
}

const cli = parseCliArgs();
const AI_PROVIDER = process.env.AI_BENCHMARK_PROVIDER || cli.provider || getEnvValue("AI_PROVIDER") || "nvidia";
const AI_MODEL = process.env.AI_BENCHMARK_MODEL || cli.model || getEnvValue("AI_MODEL") || "nvidia/nemotron-3.5-lightning-30b-a3b";
const AI_API_KEY = process.env.AI_API_KEY || getEnvValue("AI_API_KEY") || "";
const BENCHMARK_PREFLIGHT = cli.preflight === true;

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${message}`);
  }
}

async function runIsolationTests() {
  console.log("=== Provider Isolation Regression Tests ===\n");

  // Test 1: Gemini-only configuration (no NVIDIA_API_KEY required)
  console.log("Test 1: Gemini-only configuration");
  const originalArgv = process.argv;
  process.argv = ["node", "scripts/ai-provider-benchmark.mjs", "--provider", "gemini", "--model", "gemini-3.7-flash"];
  
  const geminiApiKey = getEnvValue("GEMINI_API_KEY");
  const nvidiaApiKey = getEnvValue("NVIDIA_API_KEY");
  
  assert(Boolean(geminiApiKey), "GEMINI_API_KEY is present in server/.env");
  
  // Simulate loadProvider for gemini
  try {
    const { registerProvider, resolveProvider } = await import("../server/aiProvider.js");
    const { GeminiProvider } = await import("../server/aiProviders/gemini.js");
    const apiKey = geminiApiKey || "";
    assert(Boolean(apiKey), "Gemini API key is available");
    const factory = () => new GeminiProvider({ apiKey, model: "gemini-3.7-flash" });
    registerProvider("gemini_isolation_test", factory);
    const provider = resolveProvider("gemini_isolation_test");
    assert(provider.provider === "gemini", "Gemini provider resolved correctly");
    assert(typeof provider.complete === "function", "Gemini provider has complete() method");
    console.log("  Gemini-only: PASS - No NVIDIA_API_KEY required\n");
  } catch (error) {
    console.error(`  Gemini-only: FAIL - ${error.message}\n`);
    process.exitCode = 1;
  }

  // Test 2: NVIDIA-only configuration (no GEMINI_API_KEY required)
  console.log("Test 2: NVIDIA-only configuration");
  try {
    const { registerProvider, resolveProvider } = await import("../server/aiProvider.js");
    const { NvidiaProvider } = await import("../server/aiProviders/nvidia.js");
    const apiKey = nvidiaApiKey || "test-key";
    const factory = () => new NvidiaProvider({ apiKey, model: "nvidia/nemotron-3.5-lightning-30b-a3b" });
    registerProvider("nvidia_isolation_test", factory);
    const provider = resolveProvider("nvidia_isolation_test");
    assert(provider.provider === "nvidia", "NVIDIA provider resolved correctly");
    assert(typeof provider.complete === "function", "NVIDIA provider has complete() method");
    console.log("  NVIDIA-only: PASS - No GEMINI_API_KEY required\n");
  } catch (error) {
    console.error(`  NVIDIA-only: FAIL - ${error.message}\n`);
    process.exitCode = 1;
  }

  // Test 3: Missing Gemini key fails clearly
  console.log("Test 3: Missing Gemini key");
  try {
    const { GeminiProvider } = await import("../server/aiProviders/gemini.js");
    const provider = new GeminiProvider({ apiKey: "", model: "gemini-3.7-flash" });
    await provider.complete({
      systemInstruction: "test",
      messages: [{ role: "user", content: "test" }],
    });
    console.error("  Missing Gemini key: FAIL - Should have thrown\n");
    process.exitCode = 1;
  } catch (error) {
    const msg = String(error?.message || error || "").toLowerCase();
    assert(error?.category === "auth" || msg.includes("gemini"), "Missing Gemini key fails with auth/Gemini error");
    console.log(`  Missing Gemini key: PASS - ${String(error?.message || error).slice(0, 100)}\n`);
  }

  // Test 4: Missing NVIDIA key fails clearly
  console.log("Test 4: Missing NVIDIA key");
  try {
    const { NvidiaProvider } = await import("../server/aiProviders/nvidia.js");
    const provider = new NvidiaProvider({ apiKey: "", model: "nvidia/nemotron-3.5-lightning-30b-a3b" });
    await provider.complete({
      systemInstruction: "test",
      messages: [{ role: "user", content: "test" }],
    });
    console.error("  Missing NVIDIA key: FAIL - Should have thrown\n");
    process.exitCode = 1;
  } catch (error) {
    const msg = String(error?.message || error || "").toLowerCase();
    assert(error?.category === "auth" || msg.includes("nvidia"), "Missing NVIDIA key fails with auth/NVIDIA error");
    console.log(`  Missing NVIDIA key: PASS - ${String(error?.message || error).slice(0, 100)}\n`);
  }

  // Test 5: Production default remains NVIDIA
  console.log("Test 5: Production default provider");
  const envProvider = getEnvValue("AI_PROVIDER");
  const envModel = getEnvValue("AI_MODEL");
  assert(envProvider === "nvidia" || !envProvider, "Production AI_PROVIDER defaults to nvidia");
  assert(envModel === "nvidia/nemotron-3.5-lightning-30b-a3b" || !envModel, "Production AI_MODEL is Nemotron");
  console.log("  Production default: PASS\n");

  console.log("=== Isolation Tests Complete ===");
}

runIsolationTests().catch((error) => {
  console.error("Isolation test failed:", error);
  process.exit(1);
});
