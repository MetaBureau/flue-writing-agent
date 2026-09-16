import { streamChat } from "./src/complete.ts";

const apiKey = Deno.env.get("HAIMAKER_API_KEY");
if (!apiKey) {
  console.error("Set HAIMAKER_API_KEY");
  Deno.exit(1);
}

const topic = Deno.args[0] || "Mercury 2.5: 1107 tokens/s, diffusion LLM";
const content = await streamChat({
  name: "HaiMaker",
  apiKey,
  baseUrl: "https://api.haimaker.ai/v1",
  modelId: Deno.env.get("HAIMAKER_MODEL_ID") || "google/gemini-3.1-flash-lite",
}, [
  {
    role: "system",
    content: "You are an expert technical writer. Write in the Economist style: direct, active voice, omits needless words.",
  },
  { role: "user", content: `Write a blog post about: ${topic}` },
], { temperature: 0.7, label: "write" });

await Deno.writeTextFile("Mercury2.5_economist.md", `# ${topic}\n\n---\n\n${content}`);
console.log(content);
