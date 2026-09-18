import {
  essayBlobExists,
  getEssayBlob,
  onDeploy,
  putEssayBlob,
} from "./essay_kv.ts";

export function topicSlug(topic: string): string {
  const sixWords = topic.trim().split(/\s+/).slice(0, 6).join(" ");
  return sixWords
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function essayStem(path: string): string {
  return path.replace(/^.*\//, "").replace(/\.md$/, "");
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

async function taken(path: string): Promise<boolean> {
  if (await pathExists(path)) return true;
  return await essayBlobExists(path);
}

export async function unusedEssayPath(path: string): Promise<string> {
  if (!await taken(path)) return path;
  const base = path.replace(/\.md$/, "");
  for (let n = 2; n < 10000; n++) {
    const candidate = `${base}-${n}.md`;
    if (!await taken(candidate)) return candidate;
  }
  throw new Error(`No free path for ${path}`);
}

async function writeFileAtomic(path: string, body: string): Promise<void> {
  const slash = path.lastIndexOf("/");
  const dir = slash > 0 ? path.slice(0, slash) : ".";
  await Deno.mkdir(dir, { recursive: true });
  const tempPath = `${path}.tmp`;
  await Deno.writeTextFile(tempPath, body);
  await Deno.rename(tempPath, path);
}

export async function writeOutputFile(
  path: string,
  body: string,
): Promise<void> {
  await putEssayBlob(path, body);
  try {
    await writeFileAtomic(path, body);
  } catch (error) {
    if (onDeploy()) return;
    throw error;
  }
}

export async function readOutputFile(
  path: string,
): Promise<string | undefined> {
  const fromKv = await getEssayBlob(path);
  if (fromKv !== undefined) return fromKv;
  try {
    return await Deno.readTextFile(path);
  } catch {
    return undefined;
  }
}
