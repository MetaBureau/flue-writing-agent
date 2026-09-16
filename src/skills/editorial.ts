import { ResolvedProvider } from "../providers.ts";

export interface StyleRules {
  name: string;
  rules: string[];
  transformation: string;
}

export const styles: Record<string, StyleRules> = {
  economist: {
    name: "Economist",
    rules: ["active voice", "omits needless words", "direct", "no passive voice", "strong verbs"],
    transformation: "Remove hedging words (very, really, quite), eliminate passive voice, replace weak verbs with strong ones",
  },
  "strunk-white": {
    name: "Strunk & White",
    rules: ["active voice", "positive form", "specific", "omit needless words"],
    transformation: "Convert to active voice, remove unnecessary adjectives, make abstract concepts concrete",
  },
  monocle: {
    name: "Monocle",
    rules: ["optimistic", "solutions-oriented", "forward-looking"],
    transformation: "Emphasize opportunities over problems, use forward-looking language, add constructive framing",
  },
  professional: {
    name: "Professional",
    rules: ["formal", "precise", "objective"],
    transformation: "Maintain formal tone, use precise terminology, avoid colloquialisms",
  },
};

export const applyEditorialStyle = async (
  text: string, 
  styleName: string,
  model: ResolvedProvider
): Promise<string> => {
  const style = styles[styleName] || styles.professional;
  let result = text;
  
  if (model.apiKey) {
    const response = await fetch(`${model.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${model.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: model.modelId,
        temperature: 0.3,  // Lower temp for more consistent editing
        messages: [
          { role: "system", content: `Apply ${style.name} style rules: ${style.rules.join(", ")}. Transformation goal: ${style.transformation}` },
          { role: "user", content: `Edit this text to match the style:\n\n${text}` }
        ]
      })
    });
    
    const data = await response.json();
    result = data.choices?.[0]?.message?.content || result;
    console.log(`   📝 Applied ${style.name} style using ${model.name}`);
  } else {
    // Fallback: basic heuristic transformations
    result = applyHeuristicTransformations(text, styleName);
    console.log(`   📝 Applied ${style.name} style (basic heuristics)`);
  }
  
  return result;
};

function applyHeuristicTransformations(text: string, style: string): string {
  let result = text;
  
  // Remove common hedging words
  const hedging = ["very", "really", "quite", "somewhat", "perhaps", "maybe", "sort of", "kind of"];
  for (const h of hedging) {
    result = result.replace(new RegExp(`\\b${h}\\b`, "gi"), "");
  }
  
  // Remove weak verbs where possible
  const weakVerbs = [
    ["is", "was", "were"],
    ["seems", "appears"],
    ["could be", "might be", "may be"],
  ];
  for (const [weak, strong] of weakVerbs) {
    result = result.replace(new RegExp(`\\b${weak}\\b`, "gi"), strong);
  }
  
  if (style === "economist" || style === "strunk-white") {
    // Passive voice detection (basic)
    result = result.replace(/was\s+\w+ed/gi, (match) => match.replace(/\bwas\b/, ""));
    result = result.replace(/were\s+\w+ed/gi, (match) => match.replace(/\bwere\b/, ""));
  }
  
  return result.trim();
}
