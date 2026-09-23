import http from "node:http";
import https from "node:https";

const mockServer = http.createServer((req, res) => {
  if (req.url === "/v1beta/models/gemini-3.7-flash:generateContent" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const parsed = JSON.parse(body || "{}");
      const response = {
        candidates: [
          {
            content: {
              parts: [{ text: "Hello from Gemini mock!" }],
              role: "model",
            },
            finishReason: "STOP",
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 5,
          totalTokenCount: 15,
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
  await new Promise((resolve) => mockServer.listen(9877, resolve));
  console.log("Mock Gemini server listening on port 9877");

  try {
    const { registerProvider, resolveProvider } = await import("../server/aiProvider.js");
    const { GeminiProvider } = await import("../server/aiProviders/gemini.js");

    const geminiProvider = new GeminiProvider({
      apiKey: "test-api-key",
      model: "gemini-3.7-flash",
    });

    registerProvider("gemini_test", () => geminiProvider);
    const provider = resolveProvider("gemini_test");

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init = {}) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("generativelanguage.googleapis.com")) {
        return new Promise((resolve) => {
          const body = init.body ? JSON.parse(init.body) : {};
          const response = {
            candidates: [
              {
                content: {
                  parts: [{ text: "Hello from Gemini mock!" }],
                  role: "model",
                },
                finishReason: "STOP",
              },
            ],
            usageMetadata: {
              promptTokenCount: 10,
              candidatesTokenCount: 5,
              totalTokenCount: 15,
            },
          };
          resolve({
            ok: true,
            status: 200,
            json: async () => response,
            text: async () => JSON.stringify(response),
          });
        });
      }
      return originalFetch(input, init);
    };

    try {
      const result = await provider.complete({
        systemInstruction: "You are a helpful assistant.",
        messages: [{ role: "user", content: "Say hello." }],
        temperature: 0.2,
        maxOutputTokens: 100,
        timeoutMs: 5000,
      });

      console.log("Gemini provider test result:");
      console.log(JSON.stringify(result, null, 2));

      if (result.content === "Hello from Gemini mock!" && result.providerRequestId && result.timing) {
        console.log("\n✅ Gemini provider works correctly");
        console.log(`   - content: "${result.content}"`);
        console.log(`   - finishReason: ${result.finishReason}`);
        console.log(`   - providerRequestId: ${result.providerRequestId}`);
        console.log(`   - timing: ${JSON.stringify(result.timing)}`);
        console.log(`   - usage: ${JSON.stringify(result.usage)}`);
      } else {
        console.log("\n❌ Gemini provider test failed");
        process.exitCode = 1;
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  } finally {
    mockServer.close();
  }
}

runTest().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
