// Simulates the browser's traffic to the backend: a persistent Firestore
// long-polling channel plus periodic REST reads. Used to reproduce the
// backend crash seen during the E2E runs.
import { spawn } from "child_process";
import { setTimeout as sleep } from "timers/promises";

const BACKEND = "http://127.0.0.1:3001/health";
const FIRESTORE_LISTEN =
  "https://firestore.googleapis.com/v1/projects/school-manager-gh/databases/(default)/documents/listen";

const backend = spawn("cmd.exe", ["/d", "/s", "/c", "npm.cmd", "run", "dev"], {
  cwd: "server",
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
const out = [];
backend.stdout.on("data", (d) => out.push(d.toString()));
backend.stderr.on("data", (d) => out.push(d.toString()));
backend.on("exit", (code) => console.log(`BACKEND EXITED code=${code}`));

const tick = async () => {
  for (let i = 0; i < 30; i += 1) {
    await Promise.allSettled([
      fetch(BACKEND).catch(() => {}),
      fetch(FIRESTORE_LISTEN, { method: "POST", body: "{}" }).catch(() => {}),
    ]);
    await sleep(3000);
  }
  console.log("load done");
};
await tick();
await sleep(10000);
backend.kill();
console.log("killed");