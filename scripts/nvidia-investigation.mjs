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

if (!NVIDIA_API_KEY) {
  console.error("NVIDIA_API_KEY not found");
  process.exit(1);
}

const ENDPOINT = "https://integrate.api.nvidia.com/v1/chat/completions";

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

async function httpsRequest(requestBody, stream = false) {
  const body = JSON.stringify(requestBody);
  const payloadBytes = Buffer.byteLength(body, "utf8");
  
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let firstByteTime = null;
    let firstTokenTime = null;
    let httpStatus = null;
    let finishReason = null;
    let fullText = "";
    let chunks = [];
    
    const req = https.request(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${NVIDIA_API_KEY}`,
      },
    }, (res) => {
      httpStatus = res.statusCode;
      
      res.on("headers", () => {
        firstByteTime = Date.now() - startTime;
      });
      
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
            totalTime,
            firstByteTime,
            firstTokenTime,
            payloadBytes,
            httpStatus,
            finishReason,
            text: fullText.substring(0, 200),
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
          finishReason = parsed?.choices?.[0]?.finish_reason || "unknown";
          
          resolve({
            totalTime,
            firstByteTime,
            firstTokenTime: firstByteTime,
            payloadBytes,
            httpStatus,
            finishReason,
            text: text.substring(0, 200),
            reasoning: reasoning.substring(0, 200),
            streamed: false,
          });
        });
      }
    });
    
    req.on("error", (error) => {
      const totalTime = Date.now() - startTime;
      reject({ totalTime, error: error.message });
    });
    
    req.write(body);
    req.end();
  });
}

async function benchmark(name, requestBody, runs = 2, stream = false) {
  const timings = [];
  
  for (let i = 0; i < runs; i++) {
    try {
      const result = await httpsRequest(requestBody, stream);
      timings.push(result);
      console.log(`  ${name} Run ${i + 1}: ${result.totalTime}ms (status: ${result.httpStatus}, finish: ${result.finishReason || "stream"})`);
      if (result.reasoning) {
        console.log(`    Reasoning: ${result.reasoning.substring(0, 100)}...`);
      }
    } catch (error) {
      const totalTime = error.totalTime || 0;
      timings.push({ totalTime, error: error.error });
      console.log(`  ${name} Run ${i + 1}: ERROR - ${error.error} (${totalTime}ms)`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  const successful = timings.filter(t => !t.error);
  const avg = successful.length ? Math.round(successful.reduce((s, t) => s + t.totalTime, 0) / successful.length) : 0;
  const min = successful.length ? Math.min(...successful.map(t => t.totalTime)) : 0;
  const max = successful.length ? Math.max(...successful.map(t => t.totalTime)) : 0;
  const avgFirstByte = successful.length && successful[0].firstByteTime ? Math.round(successful.reduce((s, t) => s + (t.firstByteTime || 0), 0) / successful.length) : 0;
  
  console.log(`  ${name} SUMMARY: avg=${avg}ms, min=${min}ms, max=${max}ms, avg_first_byte=${avgFirstByte}ms (${successful.length}/${runs} successful)\n`);
  
  return { name, timings, avg, min, max, avgFirstByte };
}

async function run() {
  console.log("NVIDIA Model Investigation");
  console.log(`Current model: ${CURRENT_MODEL}`);
  console.log(`API key: ${NVIDIA_API_KEY.substring(0, 10)}...`);
  console.log();
  
  const results = {};
  
  // 4A: Current configuration
  console.log("=== 4A: Current Configuration ===");
  results.current = await benchmark("Current config", {
    model: CURRENT_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: "Hello" },
    ],
    temperature: 0.25,
    max_tokens: 3000,
    tools: TOOL_DEFINITIONS,
    tool_choice: "required",
  }, 2);
  
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // 4B: Streaming test
  console.log("=== 4B: Streaming Test ===");
  results.streaming = await benchmark("Streaming", {
    model: CURRENT_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: "Hello" },
    ],
    temperature: 0.25,
    max_tokens: 3000,
    tools: TOOL_DEFINITIONS,
    tool_choice: "required",
    stream: true,
  }, 2, true);
  
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // 4C: Reasoning test - try with reasoning disabled
  console.log("=== 4C: Reasoning Configuration ===");
  results.noReasoning = await benchmark("No reasoning", {
    model: CURRENT_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: "Hello" },
    ],
    temperature: 0.25,
    max_tokens: 3000,
    tools: TOOL_DEFINITIONS,
    tool_choice: "required",
    reasoning: { enabled: false },
  }, 2);
  
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // 4D: Test alternative models
  console.log("=== 4D: Alternative Models ===");
  const candidateModels = [
    "nvidia/nemotron-3.5-lightning-30b-a3b", // current
    "nvidia/llama-3.3-nemotron-70b-instruct", // alternative
    "meta/llama-3.3-70b-instruct", // fallback candidate
  ];
  
  for (const model of candidateModels) {
    const result = await benchmark(`Model: ${model}`, {
      model: model,
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hello" },
      ],
      temperature: 0.2,
      max_tokens: 300,
    }, 2);
    results[`model_${model.replace(/\//g, "_")}`] = result;
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  console.log("\n=== FINAL SUMMARY ===");
  console.log("Current config:", results.current ? `${results.current.avg}ms` : "N/A");
  console.log("Streaming:", results.streaming ? `${results.streaming.avg}ms (TTFT: ${results.streaming.avgFirstByte}ms)` : "N/A");
  console.log("No reasoning:", results.noReasoning ? `${results.noReasoning.avg}ms` : "N/A");
  for (const [key, result] of Object.entries(results)) {
    if (key.startsWith("model_") && result) {
      console.log(`${key}: ${result.avg}ms`);
    }
  }
}

run().catch((error) => {
  console.error("Benchmark failed:", error);
  process.exit(1);
});
