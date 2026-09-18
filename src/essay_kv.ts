const PART = 48_000;

type BlobMeta = { v: 1; parts: number };
type EssayKind = "md" | "notes" | "job";

let cached: Deno.Kv | undefined;
let cachedId: string | undefined;

export function onDeploy(): boolean {
  if (Deno.env.get("DENO_DEPLOYMENT_ID")) return true;
  const flag = Deno.env.get("DENO_DEPLOY");
  return flag === "true" || flag === "1";
}

export function flueSqliteFile(): string {
  const explicit = Deno.env.get("FLUE_SQLITE_PATH");
  if (explicit) return explicit;
  if (onDeploy()) return "/tmp/flue.db";
  return "./data/flue.db";
}

function kvLocation(): string | undefined {
  const explicit = Deno.env.get("ESSAY_KV_PATH");
  if (explicit) return explicit;
  if (onDeploy()) return undefined;
  return "./data/essays.kv";
}

export function closeEssayKv(): void {
  cached?.close();
  cached = undefined;
  cachedId = undefined;
}

async function essayKv(): Promise<Deno.Kv> {
  const location = kvLocation();
  const id = location ?? ":deploy:";
  if (cached && cachedId === id) return cached;
  cached?.close();
  if (location === undefined) {
    cached = await Deno.openKv();
  } else {
    if (location !== ":memory:" && !location.startsWith(":")) {
      const slash = location.lastIndexOf("/");
      if (slash > 0) {
        await Deno.mkdir(location.slice(0, slash), { recursive: true });
      }
    }
    cached = await Deno.openKv(location);
  }
  cachedId = id;
  return cached;
}

export function parseEssayPath(path: string): {
  dir: string;
  stem: string;
  kind: EssayKind;
} {
  const slash = path.lastIndexOf("/");
  const dir = slash >= 0 ? path.slice(0, slash) : ".";
  const file = slash >= 0 ? path.slice(slash + 1) : path;
  if (file.endsWith(".job.json")) {
    return { dir, stem: file.slice(0, -".job.json".length), kind: "job" };
  }
  if (file.endsWith(".notes.md")) {
    return { dir, stem: file.slice(0, -".notes.md".length), kind: "notes" };
  }
  if (file.endsWith(".md")) {
    return { dir, stem: file.slice(0, -3), kind: "md" };
  }
  return { dir, stem: file, kind: "md" };
}

function metaKey(dir: string, stem: string, kind: EssayKind): Deno.KvKey {
  return ["essay", dir, stem, kind];
}

function partKey(
  dir: string,
  stem: string,
  kind: EssayKind,
  i: number,
): Deno.KvKey {
  return ["essay", dir, stem, kind, i];
}

function chunks(text: string): string[] {
  if (text.length === 0) return [""];
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += PART) {
    parts.push(text.slice(i, i + PART));
  }
  return parts;
}

export async function putEssayBlob(path: string, text: string): Promise<void> {
  const { dir, stem, kind } = parseEssayPath(path);
  const kv = await essayKv();
  const parts = chunks(text);
  const old = await kv.get<BlobMeta>(metaKey(dir, stem, kind));
  const op = kv.atomic();
  for (let i = 0; i < parts.length; i++) {
    op.set(partKey(dir, stem, kind, i), parts[i]);
  }
  op.set(metaKey(dir, stem, kind), { v: 1, parts: parts.length });
  if (old.value) {
    for (let i = parts.length; i < old.value.parts; i++) {
      op.delete(partKey(dir, stem, kind, i));
    }
  }
  const result = await op.commit();
  if (!result.ok) {
    throw new Error(`Failed to store ${path} in Deno KV.`);
  }
}

export async function getEssayBlob(path: string): Promise<string | undefined> {
  const { dir, stem, kind } = parseEssayPath(path);
  const kv = await essayKv();
  const meta = await kv.get<BlobMeta>(metaKey(dir, stem, kind));
  if (!meta.value || meta.value.parts < 1) return undefined;
  const parts: string[] = [];
  for (let i = 0; i < meta.value.parts; i++) {
    const part = await kv.get<string>(partKey(dir, stem, kind, i));
    if (part.value === null || part.value === undefined) return undefined;
    parts.push(part.value);
  }
  return parts.join("");
}

export async function essayBlobExists(path: string): Promise<boolean> {
  const { dir, stem, kind } = parseEssayPath(path);
  const kv = await essayKv();
  const meta = await kv.get<BlobMeta>(metaKey(dir, stem, kind));
  return Boolean(meta.value && meta.value.parts >= 1);
}
