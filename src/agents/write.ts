export interface Outline {
  title: string;
  sections: string[];
  wordCountTarget: number;
}

export interface ModelConfig {
  name: string;
  provider: string;
  apiKey?: string;
  baseUrl?: string;
  modelId?: string;
  speed?: string;
  bestFor?: string[];
}

export const generateOutline = async (
  ctx: unknown, 
  topic: string, 
  research: string,
  model: ModelConfig
): Promise<Outline> => {
  const apiKey = model.apiKey;
  
  if (!apiKey) {
    console.warn(`⚠️ ${model.name} key not set, using heuristic outline`);
    return {
      title: topic.split(" ").slice(0, 4).join(" "),
      sections: ["Introduction", "Key Developments", "Technical Analysis", "Implications"],
      wordCountTarget: 800,
    };
  }
  
  const baseUrl = model.baseUrl || "https://api.haimaker.ai/v1";
  const url = `${baseUrl}/chat/completions`;
  
  let lastError: any = null;
  
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 (compatible; WritingAgent/1.0)"
        },
        body: JSON.stringify({
          model: model.modelId || "haimaker/auto",
          temperature: 0.7,
          messages: [
            { role: "system", content: "You generate structured outlines for blog posts." },
            { role: "user", content: `Create a thoughtful outline for a blog post about: ${topic}\n\nResearch context:\n${research}\n\nReturn JSON: {title: string, sections: string[], wordCountTarget: number}` }
          ]
        })
      });
      
      if (response.status === 524) {
        console.log(`⏳ Attempt ${attempt + 1}: Cloudflare timeout. Retrying...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
        continue;
      }
      
      const text = await response.text();
      if (text.startsWith("<!DOCTYPE") || text.startsWith("<html")) {
        console.error(`❌ ERROR: API returned HTML. Status: ${response.status}`);
        throw new Error(`API returned HTML error page: ${response.status}`);
      }
      
      const data = JSON.parse(text);
      const content = data.choices?.[0]?.message?.content || "";
      
      try {
        const parsed = JSON.parse(content);
        return parsed;
      } catch {
        return {
          title: topic,
          sections: ["Intro", "Key Points", "Analysis", "Conclusion"],
          wordCountTarget: 800,
        };
      }
    } catch (error) {
      lastError = error;
      console.log(`⚠️ Attempt ${attempt + 1} failed: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  console.error("❌ ERROR: All attempts failed.");
  throw lastError;
};

export interface Draft {
  style: "conversational" | "professional" | "analytical";
  content: string;
}

export const generateDrafts = async (
  ctx: unknown, 
  outline: Outline,
  model: ModelConfig
): Promise<Draft[]> => {
  const apiKey = model.apiKey;
  
  if (!apiKey) {
    console.warn(`⚠️ ${model.name} key not set, using stub drafts`);
    return [
      { style: "conversational", content: `Draft 1 for ${outline.title}` },
      { style: "professional", content: `Draft 2 for ${outline.title}` },
      { style: "analytical", content: `Draft 3 for ${outline.title}` },
    ];
  }
  
  const baseUrl = model.baseUrl || "https://api.haimaker.ai/v1";
  const url = `${baseUrl}/chat/completions`;
  
  const styles: Array<{ name: string; instruction: string }> = [
    { name: "conversational", instruction: "Write in a friendly, conversational tone" },
    { name: "professional", instruction: "Write in a professional, business-appropriate tone" },
    { name: "analytical", instruction: "Write in an analytical, data-focused tone" },
  ];
  
  const drafts: Draft[] = [];
  
  for (const { name, instruction } of styles) {
    let lastError: any = null;
    
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (compatible; WritingAgent/1.0)"
          },
          body: JSON.stringify({
            model: model.modelId || "haimaker/auto",
            temperature: 0.8,
            messages: [
              { role: "system", content: "You write blog post drafts." },
              { role: "user", content: `Write a ${instruction} draft about: ${outline.title}\n\nOutline:\n${JSON.stringify(outline.sections)}\n\nTarget: 200-300 words` }
            ]
          })
        });
        
        if (response.status === 524) {
          console.log(`⏳ Draft attempt ${attempt + 1}: Cloudflare timeout. Retrying...`);
          await new Promise(resolve => setTimeout(resolve, 5000));
          continue;
        }
        
        const text = await response.text();
        if (text.startsWith("<!DOCTYPE") || text.startsWith("<html")) {
          console.error(`❌ Draft error: ${response.status}`);
          throw new Error(`API returned HTML: ${response.status}`);
        }
        
        const data = JSON.parse(text);
        const content = data.choices?.[0]?.message?.content || "Draft content placeholder";
        
        drafts.push({ style: name as Draft["style"], content });
        break;
      } catch (error) {
        lastError = error;
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    if (drafts.length === 0) {
      throw lastError;
    }
  }
  
  return drafts;
};

export const selectBestDraft = async (ctx: unknown, drafts: Draft[]): Promise<Draft> => {
  return drafts.find(d => d.style === "professional") ?? drafts[0];
};
