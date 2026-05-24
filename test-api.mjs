import ModelClient from "@azure-rest/ai-inference";
import { AzureKeyCredential } from "@azure/core-auth";
import dotenv from "dotenv";

dotenv.config();

const ENDPOINT = "https://models.github.ai";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const MODEL_NAME = "meta/Llama-4-Scout-17B-16E-Instruct";

if (!GITHUB_TOKEN) {
  console.error("❌ GITHUB_TOKEN not found in .env");
  process.exit(1);
}

console.log("Token length:", GITHUB_TOKEN.length);
console.log("Endpoint:", ENDPOINT);
console.log("Model:", MODEL_NAME);

try {
  console.log("\n📡 Creating client...");
  const client = ModelClient(ENDPOINT, new AzureKeyCredential(GITHUB_TOKEN));
  
  console.log("✅ Client created");
  
  console.log("\n📤 Sending request...");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  
  const response = await fetch(`${ENDPOINT}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GITHUB_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: MODEL_NAME,
      messages: [{ role: "user", content: "Test" }],
      max_tokens: 3
    }),
    signal: controller.signal
  });
  
  clearTimeout(timeout);
  console.log("✅ Got response, status:", response.status);
  const data = await response.json();
  console.log("Response:", JSON.stringify(data, null, 2));
  
} catch (err) {
  console.error("❌ Error:", err.message);
}
