import { streamChat } from "./src/complete.ts";
import { briefBlock, topicBrief } from "./src/agents/write.ts";

const apiKey = Deno.env.get("HAIMAKER_API_KEY");
if (!apiKey) {
  console.error("Set HAIMAKER_API_KEY");
  Deno.exit(1);
}

const topic = Deno.args[0] || "Mercury 2.5: 1107 tokens/s, diffusion LLM";
const content = (await streamChat({
  name: "HaiMaker",
  apiKey,
  baseUrl: "https://api.haimaker.ai/v1",
  modelId: Deno.env.get("HAIMAKER_MODEL_ID") || "google/gemini-3.1-flash-lite",
}, [
  {
    role: "system",
    content:
      `${briefBlock(topicBrief(topic))}\n\nYou are an expert technical writer. Write in the Economist style: direct, active voice, omits needless words.`,
  },
  { role: "user", content: "Write the essay the brief asks for." },
], { temperature: 0.7, label: "write" })).content;

await Deno.writeTextFile(
  "Mercury2.5_economist.md",
  `# ${topic}\n\n---\n\n${content}`,
);
console.log(content);
