export const ESSAY_LENGTHS = [
  500,
  700,
  900,
  1200,
  1500,
  2000,
  2500,
  3000,
  3500,
  4000,
  4500,
  5000,
] as const;
export const DEFAULT_ESSAY_LENGTH = 900;
export const LENGTH_FLOOR_RATIO = 0.85;
export const LENGTH_CEILING_RATIO = 1.15;
export const PROMPT_OPENING = "What should this essay be about?";

export function essayLengthFloor(words: number): number {
  return Math.round(words * LENGTH_FLOOR_RATIO);
}

export function essayLengthCeiling(words: number): number {
  return Math.round(words * LENGTH_CEILING_RATIO);
}

export function lengthRange(target: number): string {
  return `Keep it between ${essayLengthFloor(target)} and ${
    essayLengthCeiling(target)
  } words. Do not guess the count.`;
}

export function isEssayLength(
  value: number,
): value is (typeof ESSAY_LENGTHS)[number] {
  return (ESSAY_LENGTHS as readonly number[]).includes(value);
}

export const WRITE_STAGES = [
  { id: "brief", label: "Brief" },
  { id: "research", label: "Research" },
  { id: "plan", label: "Plan" },
  { id: "draft", label: "Draft" },
  { id: "critic", label: "Critic" },
] as const;

export type StageId = (typeof WRITE_STAGES)[number]["id"];
export type StageStatus = "pending" | "active" | "done" | "warning" | "error";

export type Piece = {
  id: string;
  label: string;
  filename: string;
  markdown: string;
};

export function notesPiece(slug: string, markdown: string): Piece {
  return {
    id: "notes",
    label: "Notes",
    filename: `${slug}.notes.md`,
    markdown,
  };
}

export function essayPiece(
  slug: string,
  markdown: string,
  words?: number,
): Piece {
  return {
    id: "essay",
    label: words === undefined ? "Essay" : `Essay · ${words} words`,
    filename: `${slug}.md`,
    markdown,
  };
}

export function planPiece(slug: string, markdown: string): Piece {
  return {
    id: "plan",
    label: "Plan",
    filename: `${slug}.plan.md`,
    markdown,
  };
}

export function draftPiece(
  slug: string,
  markdown: string,
): Piece {
  return {
    id: "draft",
    label: "Draft",
    filename: `${slug}.draft.md`,
    markdown: `# Draft\n\n${markdown.trim()}\n`,
  };
}

export function criticPiece(slug: string, markdown: string): Piece {
  return {
    id: "critic",
    label: "Critic",
    filename: `${slug}.critic.md`,
    markdown,
  };
}

export function pieceRank(id: string): number {
  if (id === "notes") return 0;
  if (id === "plan") return 1;
  if (id === "draft") return 2;
  if (id === "critic") return 3;
  if (id === "essay") return 4;
  return 5;
}

export type WriteEvent =
  | {
    type: "stage";
    id: StageId;
    status: "active" | "done" | "warning" | "error";
    detail?: string;
  }
  | { type: "piece"; piece: Piece }
  | { type: "essay"; markdown: string; filename: string }
  | { type: "error"; stage: StageId; error: string };
