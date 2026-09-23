import https from "node:https";

const API_KEY = process.env.NVIDIA_API_KEY || "";
const MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b";

async function test() {
  const body = JSON.stringify({
    model: MODEL,
    messages: [
      { role: "user", content: "Hi" },
    ],
    max_tokens: 10,
  });

  const startTime = Date.now();
  console.log(`Starting at ${new Date().toISOString()}...`);

  return new Promise((resolve, reject) => {
    const req = https.request(
      "https://integrate.api.nvidia.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
      },
      (res) => {
        console.log(`Status: ${res.statusCode}`);
        console.log(`Headers: ${JSON.stringify(res.headers)}`);
        
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const totalTime = Date.now() - startTime;
          const data = Buffer.concat(chunks).toString();
          console.log(`Complete: ${totalTime}ms`);
          console.log(`Body: ${data.substring(0, 200)}`);
          resolve({ totalTime, status: res.statusCode, body: data.substring(0, 200) });
        });
      }
    );

    req.on("error", (error) => {
      const totalTime = Date.now() - startTime;
      console.log(`Error after ${totalTime}ms: ${error.message}`);
      reject({ totalTime, error: error.message });
    });

    req.write(body);
    req.end();
  });
}

test().catch(console.error);
