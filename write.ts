const key = "8a441e898ca48b79985c834553dc91132a08f06947d78bae00249249c52733d9";
const url = "https://api.haimaker.ai/v1/chat/completions";

const topic = Deno.args[0] || "Mercury 2.5: 1107 tokens/s, diffusion LLM";

const response = await fetch(url, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${key}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    model: "haimaker/auto",
    temperature: 0.7,
    messages: [
      { role: "system", content: "You are an expert technical writer. Write in the Economist style: direct, active voice, omits needless words." },
      { role: "user", content: `Write a blog post about: ${topic}` }
    ]
  })
});

const data = await response.json();
const content = data.choices?.[0]?.message?.content || "Error generating content";
await Deno.writeTextFile("Mercury2.5_economist.md", `# ${topic}\n\n---\n\n${content}`);
console.log(content);
