/// <reference lib="deno.ns" />
import { assertEquals, assertStringIncludes, assertFalse } from "jsr:@std/assert";
import { outlineUserPrompt, pickDraft, type Draft } from "../src/agents/write.ts";
import { countWords, topicSlug } from "../src/main.ts";

Deno.test("pickDraft selects analytical draft for economist style", () => {
  const drafts: Draft[] = [
    { style: "conversational", content: "conversational body" },
    { style: "professional", content: "professional body" },
    { style: "analytical", content: "analytical body" },
  ];
  const selected = pickDraft(drafts, "economist");
  assertEquals(selected.content, "analytical body");
});

Deno.test("topicSlug keeps the first six words", () => {
  assertEquals(
    topicSlug("Write an 800 word blog post about flue agent extra"),
    "write-an-800-word-blog-post",
  );
});

Deno.test("countWords ignores extra spaces", () => {
  assertEquals(countWords("one two  three"), 3);
});

Deno.test("outlineUserPrompt includes notes without OpenCall", () => {
  const notes = "The Flue agent is a Deno CLI.";
  const prompt = outlineUserPrompt(notes);
  assertStringIncludes(prompt, notes);
  assertFalse(prompt.includes("OpenCall"));
});
