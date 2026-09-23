import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.resolve(__dirname, "..", "server", ".env");
const require = createRequire(import.meta.url);

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

let provider = null;
let providerLabel = "";

async function loadProvider() {
  const mod = await import("../server/aiProvider.js");
  if (AI_PROVIDER === "gemini") {
    const geminiMod = await import("../server/aiProviders/gemini.js");
    const apiKey = AI_API_KEY || getEnvValue("GEMINI_API_KEY") || "";
    if (!apiKey) {
      console.error("Gemini API key is not configured. Set GEMINI_API_KEY in server/.env");
      process.exit(1);
    }
    const factory = () => new geminiMod.GeminiProvider({ apiKey, model: AI_MODEL });
    mod.registerProvider("gemini_benchmark", factory);
    provider = mod.resolveProvider("gemini_benchmark");
    providerLabel = `gemini:${AI_MODEL}`;
  } else if (AI_PROVIDER === "openai") {
    const openAiMod = await import("../server/aiProviders/openai.js");
    const apiKey = AI_API_KEY || getEnvValue("OPENAI_API_KEY") || "";
    if (!apiKey) {
      console.error("OpenAI API key is not configured. Set OPENAI_API_KEY in server/.env");
      process.exit(1);
    }
    const factory = () => new openAiMod.OpenAiProvider({ apiKey, model: AI_MODEL });
    mod.registerProvider("openai_benchmark", factory);
    provider = mod.resolveProvider("openai_benchmark");
    providerLabel = `openai:${AI_MODEL}`;
  } else if (AI_PROVIDER === "nvidia") {
    const nvidiaMod = await import("../server/aiProviders/nvidia.js");
    const apiKey = getEnvValue("NVIDIA_API_KEY") || "";
    if (!apiKey) {
      console.error("NVIDIA API key is not configured. Set NVIDIA_API_KEY in server/.env");
      process.exit(1);
    }
    const factory = () => new nvidiaMod.NvidiaProvider({ apiKey, model: AI_MODEL });
    mod.registerProvider("nvidia_benchmark", factory);
    provider = mod.resolveProvider("nvidia_benchmark");
    providerLabel = `nvidia:${AI_MODEL}`;
  } else {
    console.error(`Unknown benchmark provider: ${AI_PROVIDER}`);
    process.exit(1);
  }
}

const SYSTEM_PROMPT = `You are School Assistant, a personal product guide for a school administrator using School Manager GH.
Be warm, concise, practical, and confident. Answer only questions about using School Manager GH or closely related school administration workflows.
Use the current page and conversation history to understand follow-up questions.
Never claim that you performed an action, changed data, sent a message, or saw school records. Never request passwords, API keys, card data, or secrets.
If this guide does not establish a fact, say so instead of inventing a feature. When useful, recommend exactly one approved route.
Current page: /admin
Live school summary (read-only and authoritative):
{"totalStudents":0,"totalTeachers":0,"totalClasses":0}
Approved routes:
/admin/students = Students
/admin/teachers = Teachers
/admin/attendance = Attendance
/admin/report-cards = Report Cards
/admin/academic-reports = Academic Reports
/admin/fees = Fees & Payments
/admin/settings = Settings
When you have enough information to answer, return JSON only: {"answer":"A clear answer, usually 2-5 short sentences or steps.","action":{"label":"Open Students","path":"/admin/students"}}
Use null for action when navigation is unnecessary.`;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "searchStudents",
      description: "Search for students by name or class.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          limit: { type: "number", description: "Max results" },
        },
        required: ["query"],
      },
    },
  },
];

async function runTest(name, request) {
  const startTime = Date.now();
  let firstByteTime = null;
  let finishReason = null;
  let toolCalls = [];
  let text = "";
  let usage = null;
  let providerRequestId = null;
  let error = null;

  try {
    const result = await provider.complete(request);
    text = result.content || "";
    toolCalls = Array.isArray(result.toolCalls) ? result.toolCalls : [];
    finishReason = result.finishReason;
    usage = result.usage;
    providerRequestId = result.providerRequestId;
    firstByteTime = result.timing?.firstByteMs || Date.now() - startTime;
  } catch (err) {
    error = err;
    firstByteTime = Date.now() - startTime;
  }

  const totalTime = Date.now() - startTime;
  return {
    name,
    totalTime,
    firstByteTime,
    finishReason,
    toolCallsCount: toolCalls.length,
    text: text.substring(0, 200),
    usage,
    providerRequestId,
    error: error ? { message: String(error?.message || error).slice(0, 200), code: error?.code, category: error?.category, status: error?.status } : null,
  };
}

async function main() {
  await loadProvider();
  console.log(`Benchmarking provider: ${providerLabel}`);
  console.log(`Time: ${new Date().toISOString()}\n`);

  if (BENCHMARK_PREFLIGHT) {
    console.log("Preflight mode: running single minimal request only.");
    const preflight = await runTest("preflight", {
      systemInstruction: "You are a helpful assistant.",
      messages: [{ role: "user", content: "Hello." }],
      temperature: 0.2,
      maxOutputTokens: 50,
      timeoutMs: 30000,
    });
    if (preflight.error) {
      console.log(`PREFLIGHT FAILED: ${preflight.error.category || 'unknown'} | ${preflight.error.code || 'unknown'} | ${String(preflight.error.message || '').slice(0, 300)}`);
      process.exitCode = 1;
    } else {
      console.log(`PREFLIGHT OK: ${preflight.totalTime}ms | finish=${preflight.finishReason}`);
    }
    return;
  }

  const results = {};
  const tests = [
    { name: "Minimal", request: { systemInstruction: "You are a helpful assistant.", messages: [{ role: "user", content: "Hello. Respond briefly." }], temperature: 0.2, maxOutputTokens: 300, timeoutMs: 30000 } },
    { name: "Informational", request: { systemInstruction: SYSTEM_PROMPT, messages: [{ role: "user", content: "What can School Manager GH help a school administrator manage?" }], temperature: 0.2, maxOutputTokens: 900, timeoutMs: 30000 } },
    { name: "Student", request: { systemInstruction: SYSTEM_PROMPT, messages: [{ role: "user", content: "Find the student named Daniel Mensah and tell me his class." }], temperature: 0.2, maxOutputTokens: 900, timeoutMs: 30000, tools: TOOLS, toolChoice: "auto" } },
  ];

  for (const test of tests) {
    console.log(`\n--- ${test.name} ---`);
    const runs = [];
    for (let i = 0; i < 3; i++) {
      const result = await runTest(`${test.name}-${i + 1}`, test.request);
      runs.push(result);
      console.log(`  Run ${i + 1}: ${result.totalTime}ms | ${result.error ? `ERROR: ${result.error.code}` : `finish=${result.finishReason} tools=${result.toolCallsCount}`}`);
    }
    results[test.name] = runs;
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log("\n=== SUMMARY ===");
  for (const [name, runs] of Object.entries(results)) {
    const times = runs.map(r => r.totalTime).filter(t => Number.isFinite(t));
    const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null;
    const errors = runs.filter(r => r.error);
    const successCount = runs.filter(r => !r.error).length;
    console.log(`${name}: success=${successCount}/${runs.length} avg=${avg}ms errors=${errors.length}`);
    for (const run of runs) {
      const status = run.error ? `ERROR ${run.error.category || 'unknown'} (${run.error.code || 'unknown'})` : `OK finish=${run.finishReason} tools=${run.toolCallsCount}`;
      const detail = run.error ? ` | msg=${String(run.error.message || '').slice(0, 300)}` : '';
      const body = run.error?.cause?.body ? ` | body=${String(run.error.cause.body).slice(0, 500)}` : '';
      console.log(`  Run ${run.name.split('-').pop()}: ${run.totalTime}ms TTFT=${run.firstByteTime}ms | ${status}${detail}${body}`);
    }
  }
}

main().catch((error) => {
  console.error("Benchmark failed:", error);
  process.exit(1);
});
