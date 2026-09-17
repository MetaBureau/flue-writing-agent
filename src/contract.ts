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
export const PROMPT_OPENING = "What should this essay be about?";

export function essayLengthFloor(words: number): number {
  return Math.round(words * LENGTH_FLOOR_RATIO);
}

export function isEssayLength(
  value: number,
): value is (typeof ESSAY_LENGTHS)[number] {
  return (ESSAY_LENGTHS as readonly number[]).includes(value);
}

export const WRITE_STAGES = [
  { id: "research", label: "Research" },
  { id: "outline", label: "Outline" },
  { id: "drafts", label: "Drafts" },
  { id: "synthesis", label: "Synthesis" },
  { id: "extend", label: "Extend" },
  { id: "style", label: "Style" },
  { id: "factcheck", label: "Fact-check" },
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

export function modelSlug(modelId: string): string {
  const slash = modelId.lastIndexOf("/");
  return slash === -1 ? modelId : modelId.slice(slash + 1);
}

export function pieceRank(id: string): number {
  if (id === "notes") return 0;
  if (id.startsWith("draft:")) return 1;
  if (id === "synthesis") return 2;
  if (id === "essay") return 3;
  return 4;
}

export function draftPiece(
  slug: string,
  modelId: string,
  markdown: string,
  label?: string,
): Piece {
  const slugId = modelSlug(modelId);
  const title = label ?? modelId;
  return {
    id: `draft:${slugId}`,
    label: title,
    filename: `${slug}.draft-${slugId}.md`,
    markdown: `# ${title}\n\n${markdown.trim()}\n`,
  };
}

export function synthesisPiece(slug: string, markdown: string): Piece {
  return {
    id: "synthesis",
    label: "Synthesis",
    filename: `${slug}.synthesis.md`,
    markdown: `# Synthesis\n\n${markdown.trim()}\n`,
  };
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
