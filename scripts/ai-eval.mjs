#!/usr/bin/env node

/**
 * Lightweight AI assistant evaluation script.
 *
 * Usage (PowerShell):
 *   $env:AI_EVAL_BASE_URL="http://localhost:4000"
 *   $env:AI_EVAL_TOKEN="<firebase-id-token>"
 *   node scripts/ai-eval.mjs
 */

const baseUrl = (process.env.AI_EVAL_BASE_URL || "http://localhost:4000").replace(
  /\/$/,
  "",
);
const token = process.env.AI_EVAL_TOKEN || "";

if (!token) {
  console.error(
    "Missing AI_EVAL_TOKEN. Provide a valid super-admin Firebase ID token.",
  );
  process.exit(1);
}

const cases = [
  {
    name: "Greeting",
    prompt: "Hi",
    shouldNotContain: [
      "prepare create school actions",
      "prepare school admin actions",
    ],
  },
  {
    name: "Capabilities",
    prompt: "What can you do?",
    shouldContain: ["summarize", "revenue"],
  },
  {
    name: "Finance summary",
    prompt: "How much profit have I gained this month?",
    shouldContain: ["revenue"],
  },
];

const runCase = async (testCase) => {
  const startedAt = Date.now();
  const response = await fetch(`${baseUrl}/api/superadmin/ai-chat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: [{ role: "user", content: testCase.prompt }],
    }),
  });

  const payload = await response.json();
  const latencyMs = Date.now() - startedAt;
  const reply = String(payload?.reply || "");
  const lowerReply = reply.toLowerCase();

  let pass = response.ok;
  const reasons = [];

  for (const keyword of testCase.shouldContain || []) {
    if (!lowerReply.includes(String(keyword).toLowerCase())) {
      pass = false;
      reasons.push(`Missing keyword: "${keyword}"`);
    }
  }

  for (const keyword of testCase.shouldNotContain || []) {
    if (lowerReply.includes(String(keyword).toLowerCase())) {
      pass = false;
      reasons.push(`Contains forbidden phrase: "${keyword}"`);
    }
  }

  return {
    name: testCase.name,
    prompt: testCase.prompt,
    status: pass ? "PASS" : "FAIL",
    latencyMs,
    responseOk: response.ok,
    mode: payload?.mode || "unknown",
    responseMs: payload?.responseMs ?? null,
    reply,
    reasons,
  };
};

const main = async () => {
  const results = [];
  for (const testCase of cases) {
    try {
      const result = await runCase(testCase);
      results.push(result);
    } catch (error) {
      results.push({
        name: testCase.name,
        prompt: testCase.prompt,
        status: "FAIL",
        latencyMs: 0,
        responseOk: false,
        mode: "error",
        responseMs: null,
        reply: "",
        reasons: [String(error?.message || error)],
      });
    }
  }

  const passCount = results.filter((item) => item.status === "PASS").length;
  const avgLatency = results.length
    ? Math.round(
        results.reduce((sum, item) => sum + Number(item.latencyMs || 0), 0) /
          results.length,
      )
    : 0;

  console.log(`AI eval target: ${baseUrl}`);
  console.log(`Passed: ${passCount}/${results.length}`);
  console.log(`Average latency: ${avgLatency} ms`);
  console.log("");

  for (const result of results) {
    console.log(`[${result.status}] ${result.name}`);
    console.log(`Prompt: ${result.prompt}`);
    console.log(`Latency: ${result.latencyMs} ms`);
    console.log(`Mode: ${result.mode}`);
    console.log(`Reply: ${result.reply}`);
    if (result.reasons.length) {
      console.log(`Reasons: ${result.reasons.join(" | ")}`);
    }
    console.log("");
  }

  if (passCount !== results.length) {
    process.exit(2);
  }
};

main().catch((error) => {
  console.error("AI eval script failed:", error);
  process.exit(1);
});
