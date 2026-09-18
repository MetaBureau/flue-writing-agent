export interface EvalBrief {
  id: string;
  title: string;
  file: string;
  text: string;
  words: number;
}

export const EVAL_BRIEFS: EvalBrief[] = [
  {
    id: "contested-long",
    title: "Contested, long",
    file: "evals/briefs/contested-long.txt",
    text:
      "Elites and politics in Australia in 2026. Readers are people who do not understand the concept of elites. Purpose: an introductory overview of how these elites operate. Claim: politics in Australia is defined by elites rather than by democracy. 2000 words.",
    words: 2000,
  },
  {
    id: "simple-short",
    title: "Simple, short",
    file: "evals/briefs/simple-short.txt",
    text:
      "Pet frogs are small amphibians. Write 500 words for a general reader explaining whether they make good pets.",
    words: 500,
  },
  {
    id: "no-claim",
    title: "No claim given",
    file: "evals/briefs/no-claim.txt",
    text:
      "Australian housing affordability in 2026. 1200 words for a general reader.",
    words: 1200,
  },
  {
    id: "tone-required",
    title: "Tone required",
    file: "evals/briefs/tone-required.txt",
    text:
      "A 900-word comic essay for office workers on why meetings multiply.",
    words: 900,
  },
];
