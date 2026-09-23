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

async function singleRequest(name, requestBody, stream = false) {
  const body = JSON.stringify(requestBody);
  const payloadBytes = Buffer.byteLength(body, "utf8");
  const startTime = Date.now();
  
  return new Promise((resolve, reject) => {
    let firstByteTime = null;
    let firstTokenTime = null;
    let httpStatus = null;
    let finishReason = null;
    let fullText = "";
    
    const req = https.request(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${NVIDIA_API_KEY}`,
      },
    }, (res) => {
      httpStatus = res.statusCode;
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
            name,
            totalTime,
            firstByteTime,
            firstTokenTime,
            payloadBytes,
            httpStatus,
            finishReason: "stream",
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
            name,
            totalTime,
            firstByteTime,
            firstTokenTime: firstByteTime,
            payloadBytes,
            httpStatus,
            finishReason,
            text: text.substring(0, 200),
            reasoning: reasoning ? reasoning.substring(0, 100) : null,
            streamed: false,
          });
        });
      }
    });
    
    req.on("error", (error) => {
      const totalTime = Date.now() - startTime;
      reject({ name, totalTime, error: error.message });
    });
    
    req.write(body);
    req.end();
  });
}

async function runTest(name, requestBody, stream = false) {
  console.log(`\n${name}:`);
  console.log(`  Starting at ${new Date().toISOString()}...`);
  
  try {
    const result = await singleRequest(name, requestBody, stream);
    console.log(`  Status: ${result.httpStatus}`);
    console.log(`  Total time: ${result.totalTime}ms`);
    console.log(`  First byte: ${result.firstByteTime}ms`);
    if (result.firstTokenTime && result.firstTokenTime !== result.firstByteTime) {
      console.log(`  First token: ${result.firstTokenTime}ms`);
    }
    console.log(`  Finish: ${result.finishReason}`);
    console.log(`  Payload: ${result.payloadBytes} bytes`);
    if (result.reasoning) {
      console.log(`  Reasoning: YES (${result.reasoning.length} chars)`);
    } else {
      console.log(`  Reasoning: NO`);
    }
    console.log(`  Response preview: ${result.text}...`);
    return result;
  } catch (error) {
    console.log(`  ERROR: ${error.error}`);
    return { name, error: error.error, totalTime: error.totalTime };
  }
}

async function run() {
  console.log("NVIDIA Investigation - Focused Tests (Part 2)");
  console.log(`Model: ${CURRENT_MODEL}`);
  console.log(`Key: ${NVIDIA_API_KEY.substring(0, 10)}...`);
  
  const results = {};
  
  // Test: Streaming only
  console.log("\n=== Streaming Test ===");
  results.streaming = await runTest("Streaming", {
    model: CURRENT_MODEL,
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Hi" },
    ],
    temperature: 0.2,
    max_tokens: 300,
    stream: true,
  }, true);
  
  console.log("\n=== SUMMARY ===");
  for (const [key, result] of Object.entries(results)) {
    if (result && !result.error) {
      const reasoning = result.reasoning ? "WITH reasoning" : "NO reasoning";
      console.log(`${key}: ${result.totalTime}ms (${reasoning}, finish: ${result.finishReason})`);
    } else if (result && result.error) {
      console.log(`${key}: ERROR - ${result.error}`);
    }
  }
}

run().catch((error) => {
  console.error("Benchmark failed:", error);
  process.exit(1);
});
