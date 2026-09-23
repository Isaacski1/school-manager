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

async function singleRequest(name, requestBody) {
  const body = JSON.stringify(requestBody);
  const payloadBytes = Buffer.byteLength(body, "utf8");
  const startTime = Date.now();
  
  console.log(`\n${name}:`);
  console.log(`  Payload: ${payloadBytes} bytes`);
  console.log(`  Starting request at ${new Date().toISOString()}...`);
  
  return new Promise((resolve, reject) => {
    const req = https.request(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${NVIDIA_API_KEY}`,
      },
    }, (res) => {
      const firstByteTime = Date.now() - startTime;
      console.log(`  First byte: ${firstByteTime}ms (status: ${res.statusCode})`);
      
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const totalTime = Date.now() - startTime;
        const data = Buffer.concat(chunks).toString();
        const parsed = data ? JSON.parse(data) : {};
        const text = parsed?.choices?.[0]?.message?.content || "";
        const finishReason = parsed?.choices?.[0]?.finish_reason || "unknown";
        
        console.log(`  Complete: ${totalTime}ms`);
        console.log(`  Finish reason: ${finishReason}`);
        console.log(`  Response length: ${text.length} chars`);
        console.log(`  Response preview: ${text.substring(0, 100)}...`);
        
        resolve({
          name,
          totalTime,
          firstByteTime,
          payloadBytes,
          httpStatus: res.statusCode,
          finishReason,
          responseLength: text.length,
        });
      });
    });
    
    req.on("error", (error) => {
      const totalTime = Date.now() - startTime;
      console.log(`  ERROR after ${totalTime}ms: ${error.message}`);
      reject({ name, totalTime, error: error.message });
    });
    
    req.write(body);
    req.end();
  });
}

async function run() {
  console.log("NVIDIA Direct Single-Request Benchmark");
  console.log(`Model: ${MODEL}`);
  console.log(`Key: ${NVIDIA_API_KEY.substring(0, 10)}...`);
  
  const results = {};
  
  // Test 1: Minimal
  results.minimal = await singleRequest("Minimal prompt", {
    model: MODEL,
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Hello" },
    ],
    temperature: 0.2,
    max_tokens: 300,
  });
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test 2: Production-like
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
  
  results.production = await singleRequest("Production prompt", {
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: "Hello" },
    ],
    temperature: 0.25,
    max_tokens: 3000,
  });
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test 3: Same but with tools
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
  ];
  
  results.productionWithTools = await singleRequest("Production with tools", {
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
    if (result.error) {
      console.log(`${key}: ERROR - ${result.error}`);
    } else {
      console.log(`${key}: total=${result.totalTime}ms, firstByte=${result.firstByteTime}ms, payload=${result.payloadBytes}B`);
    }
  }
}

run().catch(console.error);
