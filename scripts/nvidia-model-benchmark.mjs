import https from "node:https";
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

const NVIDIA_API_KEY = getEnvValue("NVIDIA_API_KEY") || process.env.NVIDIA_API_KEY || "";
const CURRENT_MODEL = getEnvValue("NVIDIA_MODEL") || "nvidia/nemotron-3.5-lightning-30b-a3b";
const CANDIDATE_MODEL = "openai/gpt-oss-20b";

if (!NVIDIA_API_KEY) {
  console.error("NVIDIA_API_KEY not found");
  process.exit(1);
}

const ENDPOINT = "https://integrate.api.nvidia.com/v1/chat/completions";
const RESULTS_PATH = path.resolve(__dirname, "benchmark-results.json");

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
  {
    type: "function",
    function: {
      name: "getStudentAttendance",
      description: "Get attendance records for a student.",
      parameters: {
        type: "object",
        properties: {
          studentId: { type: "string", description: "Student ID" },
          startDate: { type: "string", description: "Start date" },
          endDate: { type: "string", description: "End date" },
        },
        required: ["studentId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getDailyAttendanceSummary",
      description: "Get daily attendance summary.",
      parameters: {
        type: "object",
        properties: {
          classId: { type: "string", description: "Class ID" },
          date: { type: "string", description: "Date" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getStudentFeeBalance",
      description: "Get fee balance for a student.",
      parameters: {
        type: "object",
        properties: {
          studentId: { type: "string", description: "Student ID" },
        },
        required: ["studentId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getStudentAssessmentResults",
      description: "Get assessment results.",
      parameters: {
        type: "object",
        properties: {
          studentId: { type: "string", description: "Student ID" },
          classId: { type: "string", description: "Class ID" },
        },
        required: [],
      },
    },
  },
];

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

let allResults = {};
if (fs.existsSync(RESULTS_PATH)) {
  try {
    allResults = JSON.parse(fs.readFileSync(RESULTS_PATH, "utf8"));
  } catch {}
}

function saveResults() {
  fs.writeFileSync(RESULTS_PATH, JSON.stringify(allResults, null, 2));
}

async function singleRequest(model, requestBody, stream = false) {
  const body = JSON.stringify(requestBody);
  const payloadBytes = Buffer.byteLength(body, "utf8");
  const startTime = Date.now();
  
  return new Promise((resolve, reject) => {
    let firstByteTime = null;
    let firstTokenTime = null;
    let httpStatus = null;
    let finishReason = null;
    let fullText = "";
    let providerRequestId = null;
    
    const req = https.request(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${NVIDIA_API_KEY}`,
      },
    }, (res) => {
      httpStatus = res.statusCode;
      providerRequestId = res.headers["nvcf-reqid"] || null;
      firstByteTime = Date.now() - startTime;
      
      if (stream && res.statusCode === 200) {
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          if (firstTokenTime === null) {
            firstTokenTime = Date.now() - startTime;
          }
          fullText += chunk;
        });
        res.on("end", () => {
          const totalTime = Date.now() - startTime;
          resolve({
            model,
            totalTime,
            firstByteTime,
            firstTokenTime,
            payloadBytes,
            httpStatus,
            providerRequestId,
            finishReason: "stream",
            text: fullText.substring(0, 500),
            streamed: true,
          });
        });
      } else {
        const resChunks = [];
        res.on("data", (chunk) => resChunks.push(chunk));
        res.on("end", () => {
          const totalTime = Date.now() - startTime;
          const data = Buffer.concat(resChunks).toString();
          const parsed = data ? JSON.parse(data) : {};
          const text = parsed?.choices?.[0]?.message?.content || "";
          const reasoning = parsed?.choices?.[0]?.message?.reasoning_content || "";
          const toolCalls = parsed?.choices?.[0]?.message?.tool_calls || [];
          finishReason = parsed?.choices?.[0]?.finish_reason || "unknown";
          
          resolve({
            model,
            totalTime,
            firstByteTime,
            firstTokenTime: firstByteTime,
            payloadBytes,
            httpStatus,
            providerRequestId,
            finishReason,
            text: text.substring(0, 500),
            reasoning: reasoning ? reasoning.substring(0, 200) : null,
            toolCalls,
            streamed: false,
          });
        });
      }
    });
    
    req.on("error", (error) => {
      const totalTime = Date.now() - startTime;
      reject({ model, totalTime, error: error.message });
    });
    
    req.write(body);
    req.end();
  });
}

async function runTest(key, model, messages, options = {}, runs = 2) {
  const results = [];
  const toolOptions = options.tools ? { tools: TOOL_DEFINITIONS, toolChoice: options.toolChoice ?? "auto" } : {};
  
  for (let i = 0; i < runs; i++) {
    try {
      const requestBody = {
        model,
        messages,
        temperature: options.temperature ?? 0.25,
        max_tokens: options.maxTokens ?? 3000,
        ...toolOptions,
      };
      if (options.stream) requestBody.stream = true;
      if (options.reasoning !== undefined) requestBody.reasoning = options.reasoning;
      
      const result = await singleRequest(model, requestBody, options.stream);
      results.push(result);
      const toolNames = result.toolCalls?.map(tc => tc.function?.name || tc.name).join(", ");
      console.log(`  [${key}] ${model} Run ${i + 1}: ${result.totalTime}ms | finish=${result.finishReason} | tools=${toolNames || "none"} | reasoning=${result.reasoning ? "YES" : "NO"}`);
    } catch (error) {
      results.push({ model, totalTime: error.totalTime, error: error.error });
      console.log(`  [${key}] ${model} Run ${i + 1}: ERROR - ${error.error}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  const successful = results.filter(r => !r.error);
  const avg = successful.length ? Math.round(successful.reduce((s, r) => s + r.totalTime, 0) / successful.length) : 0;
  const min = successful.length ? Math.min(...successful.map(r => r.totalTime)) : 0;
  const max = successful.length ? Math.max(...successful.map(r => r.totalTime)) : 0;
  const avgFirstByte = successful.length ? Math.round(successful.reduce((s, r) => s + (r.firstByteTime || 0), 0) / successful.length) : 0;
  const timeouts = results.filter(r => r.finishReason === "length" || (r.error && r.totalTime >= 29000)).length;
  
  const summary = {
    key,
    model,
    avg,
    min,
    max,
    avgFirstByte,
    timeouts,
    successCount: successful.length,
    totalRuns: runs,
    results: results.map(r => ({
      totalTime: r.totalTime,
      finishReason: r.finishReason,
      error: r.error,
      toolCalls: r.toolCalls?.map(tc => tc.function?.name || tc.name),
      reasoning: !!r.reasoning,
    })),
  };
  
  allResults[key] = summary;
  saveResults();
  console.log(`  [${key}] SUMMARY: avg=${avg}ms, min=${min}ms, max=${max}ms, first_byte=${avgFirstByte}ms, timeouts=${timeouts}/${runs}\n`);
  
  return summary;
}

async function run() {
  console.log("NVIDIA Model Benchmark: Nemotron vs GPT-OSS 20B");
  console.log(`Current model: ${CURRENT_MODEL}`);
  console.log(`Candidate model: ${CANDIDATE_MODEL}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Results file: ${RESULTS_PATH}`);
  console.log();
  
  const workloads = [
    { key: "simple", name: "Simple conversation", messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: "Hello, what can you help me with?" }], tools: false },
    { key: "student", name: "Student lookup", messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: "Find student John" }], tools: true, toolChoice: "required" },
    { key: "attendance", name: "Attendance", messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: "What is the attendance today?" }], tools: true, toolChoice: "auto" },
    { key: "fees", name: "Fees", messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: "Show me fee balances" }], tools: true, toolChoice: "auto" },
    { key: "minimal", name: "Minimal prompt", messages: [{ role: "system", content: "You are a helpful assistant." }, { role: "user", content: "Say hello." }], tools: false, maxTokens: 300 },
  ];
  
  for (const workload of workloads) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Workload: ${workload.name}`);
    console.log(`${"=".repeat(60)}`);
    
    const options = {
      tools: workload.tools,
      toolChoice: workload.toolChoice,
      maxTokens: workload.maxTokens,
    };
    
    console.log(`\n--- Current Model: ${CURRENT_MODEL} ---`);
    await runTest(`current_${workload.key}`, CURRENT_MODEL, workload.messages, options, 2);
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log(`\n--- Candidate Model: ${CANDIDATE_MODEL} ---`);
    await runTest(`candidate_${workload.key}`, CANDIDATE_MODEL, workload.messages, options, 2);
    
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  // Streaming test
  console.log(`\n${"=".repeat(60)}`);
  console.log("Streaming Test");
  console.log(`${"=".repeat(60)}`);
  
  const streamMessages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: "Hello" },
  ];
  
  console.log(`\n--- Current Model: ${CURRENT_MODEL} ---`);
  await runTest("current_streaming", CURRENT_MODEL, streamMessages, { stream: true, tools: TOOL_DEFINITIONS, toolChoice: "required" }, 1);
  
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  console.log(`\n--- Candidate Model: ${CANDIDATE_MODEL} ---`);
  await runTest("candidate_streaming", CANDIDATE_MODEL, streamMessages, { stream: true, tools: TOOL_DEFINITIONS, toolChoice: "required" }, 1);
  
  console.log(`\n${"=".repeat(60)}`);
  console.log("BENCHMARK COMPLETE");
  console.log(`Results saved to: ${RESULTS_PATH}`);
  console.log(`${"=".repeat(60)}`);
}

run().catch((error) => {
  console.error("Benchmark failed:", error);
  process.exit(1);
});
