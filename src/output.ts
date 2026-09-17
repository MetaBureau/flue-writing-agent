export function topicSlug(topic: string): string {
  const sixWords = topic.trim().split(/\s+/).slice(0, 6).join(" ");
  return sixWords
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function writeOutputFile(
  path: string,
  body: string,
): Promise<void> {
  await Deno.mkdir("output", { recursive: true });
  const tempPath = `${path}.tmp`;
  await Deno.writeTextFile(tempPath, body);
  await Deno.rename(tempPath, path);
}
