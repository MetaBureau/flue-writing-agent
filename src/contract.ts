export const WRITE_STAGES = [
  { id: "research", label: "Research" },
  { id: "outline", label: "Outline" },
  { id: "drafts", label: "Drafts" },
  { id: "extend", label: "Extend" },
  { id: "style", label: "Style" },
] as const;

export type StageId = (typeof WRITE_STAGES)[number]["id"];
export type StageStatus = "pending" | "active" | "done" | "error";

export type WriteEvent =
  | {
    type: "stage";
    id: StageId;
    status: "active" | "done" | "error";
    detail?: string;
  }
  | { type: "essay"; markdown: string }
  | { type: "error"; stage: StageId; error: string };
