import http from "node:http";

const mockServer = http.createServer((req, res) => {
  if (req.url === "/v1/chat/completions" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const parsed = JSON.parse(body || "{}");
      const response = {
        choices: [
          {
            message: {
              content: "Hello from mock provider!",
              tool_calls: [],
            },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(response));
    });
  } else {
    res.writeHead(404);
    res.end("Not Found");
  }
});

async function runTest() {
  await new Promise((resolve) => mockServer.listen(9876, resolve));
  console.log("Mock server listening on port 9876");

  try {
    const { registerProvider, resolveProvider } = await import("../server/aiProvider.js");

    const mockProvider = {
      provider: "mock",
      async complete({ systemInstruction, messages, temperature, maxOutputTokens, timeoutMs, tools, toolChoice, telemetryContext }) {
        const requestStartedAt = Date.now();
        const providerRequestId = `mock_${Date.now().toString(36)}`;
        
        const response = await new Promise((resolve, reject) => {
          const req = http.request("http://localhost:9876/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          }, (res) => {
            const chunks = [];
            res.on("data", (chunk) => chunks.push(chunk));
            res.on("end", () => resolve({ ok: res.statusCode < 400, status: res.statusCode, data: JSON.parse(Buffer.concat(chunks).toString()) }));
          });
          req.on("error", reject);
          req.write(JSON.stringify({ model: "mock-model", messages: [] }));
          req.end();
        });

        if (!response.ok) {
          throw new Error(`Mock provider failed: ${response.status}`);
        }

        const payload = response.data;
        const text = String(payload?.choices?.[0]?.message?.content || "").trim();
        const toolCalls = payload?.choices?.[0]?.message?.tool_calls || [];
        const finishReason = payload?.choices?.[0]?.finish_reason || "stop";
        const usage = payload?.usage || {};

        return {
          content: text,
          toolCalls,
          finishReason,
          usage: { promptTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens, totalTokens: usage.total_tokens },
          providerRequestId,
          timing: { totalMs: Date.now() - requestStartedAt, firstByteMs: 50 },
        };
      },
    };

    registerProvider("mock_test", () => mockProvider);
    const provider = resolveProvider("mock_test");

    const result = await provider.complete({
      systemInstruction: "You are a helpful assistant.",
      messages: [{ role: "user", content: "Say hello." }],
      temperature: 0.2,
      maxOutputTokens: 100,
      timeoutMs: 5000,
    });

    console.log("Provider abstraction test result:");
    console.log(JSON.stringify(result, null, 2));

    if (result.content === "Hello from mock provider!" && result.providerRequestId && result.timing) {
      console.log("\n✅ Provider abstraction works correctly");
      console.log(`   - content: "${result.content}"`);
      console.log(`   - provider: ${result.provider}`);
      console.log(`   - providerRequestId: ${result.providerRequestId}`);
      console.log(`   - timing: ${JSON.stringify(result.timing)}`);
      console.log(`   - usage: ${JSON.stringify(result.usage)}`);
    } else {
      console.log("\n❌ Provider abstraction test failed");
      process.exitCode = 1;
    }
  } finally {
    mockServer.close();
  }
}

runTest().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
