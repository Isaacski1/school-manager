import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const token = fs.readFileSync(path.join(__dirname, "test-id-token.txt"), "utf-8").trim();
const parts = token.split(".");
const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
console.log("UID=" + payload.sub);
console.log("EMAIL=" + payload.email);
console.log("ROLE=" + payload.role);
console.log("SCHOOL_ID=" + payload.schoolId);
