import https from "node:https";
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

const NVIDIA_API_KEY = getEnvValue("NVIDIA_API_KEY") || process.env.NVIDIA_API_KEY || "";
const MODEL = getEnvValue("NVIDIA_MODEL") || "nvidia/nemotron-3.5-lightning-30b-a3b";

if (!NVIDIA_API_KEY) {
  console.error("NVIDIA_API_KEY not found");
  process.exit(1);
}

const ENDPOINT = "https://integrate.api.nvidia.com/v1/chat/completions";

function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(ENDPOINT, options, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const data = Buffer.concat(chunks).toString();
        resolve({ status: res.statusCode, data: data ? JSON.parse(data) : {} });
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function benchmark(name, requestBody, runs = 3) {
  const timings = [];
  
  for (let i = 0; i < runs; i++) {
    const body = JSON.stringify(requestBody);
    const payloadBytes = Buffer.byteLength(body, "utf8");
    const startTime = Date.now();
    
    try {
      const response = await httpsRequest({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${NVIDIA_API_KEY}`,
        },
      }, body);
      
      const totalTime = Date.now() - startTime;
      const httpStatus = response.status;
      const text = response.data?.choices?.[0]?.message?.content || "";
      const finishReason = response.data?.choices?.[0]?.finish_reason || "unknown";
      
      timings.push({ totalTime, httpStatus, text: text.substring(0, 100), finishReason });
      console.log(`  Run ${i + 1}: ${totalTime}ms (status: ${httpStatus}, finish: ${finishReason})`);
    } catch (error) {
      const totalTime = Date.now() - startTime;
      timings.push({ totalTime, error: error.message });
      console.log(`  Run ${i + 1}: ERROR - ${error.message} (${totalTime}ms)`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  const successful = timings.filter(t => !t.error);
  const avg = successful.length ? Math.round(successful.reduce((s, t) => s + t.totalTime, 0) / successful.length) : 0;
  const min = successful.length ? Math.min(...successful.map(t => t.totalTime)) : 0;
  const max = successful.length ? Math.max(...successful.map(t => t.totalTime)) : 0;
  
  console.log(`  ${name}: avg=${avg}ms, min=${min}ms, max=${max}ms (${successful.length}/${runs} successful)`);
  return { name, timings, avg, min, max };
}

async function run() {
  console.log("NVIDIA Direct Benchmark");
  console.log(`Model: ${MODEL}`);
  console.log(`Key: ${NVIDIA_API_KEY.substring(0, 10)}...`);
  console.log();
  
  const results = {};
  
  // Benchmark A: Minimal prompt
  console.log("Benchmark A: Minimal prompt");
  results.minimal = await benchmark("Minimal", {
    model: MODEL,
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Hello" },
    ],
    temperature: 0.2,
    max_tokens: 300,
  });
  
  // Benchmark B: Current School Manager prompt (without tools)
  console.log("\nBenchmark B: Production prompt without tools");
  const systemPrompt = `You are School Assistant, a personal product guide for a school administrator using School Manager GH.
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
  
  results.productionNoTools = await benchmark("Production without tools", {
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: "Hello" },
    ],
    temperature: 0.25,
    max_tokens: 3000,
  });
  
  // Benchmark C: Current prompt with tool definitions
  console.log("\nBenchmark C: Production prompt with tools");
  const TOOL_DEFINITIONS = [
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
    {
      type: "function",
      function: {
        name: "getStudentProfile",
        description: "Get detailed student profile.",
        parameters: {
          type: "object",
          properties: {
            studentId: { type: "string", description: "Student ID" },
          },
          required: ["studentId"],
        },
      },
    },
  ];
  
  results.productionWithTools = await benchmark("Production with tools", {
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: "Hello" },
    ],
    temperature: 0.25,
    max_tokens: 3000,
    tools: TOOL_DEFINITIONS,
    tool_choice: "required",
  });
  
  console.log("\n=== Summary ===");
  for (const [key, result] of Object.entries(results)) {
    console.log(`${key}: avg=${result.avg}ms, min=${result.min}ms, max=${result.max}ms`);
  }
}

run().catch(console.error);
