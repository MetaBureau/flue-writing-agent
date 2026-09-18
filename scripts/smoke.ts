const PORT = Number(Deno.env.get("SMOKE_PORT") ?? "4175");
const ORIGIN = `http://127.0.0.1:${PORT}`;

try {
  await Deno.stat("_fresh/server.js");
} catch {
  throw new Error("missing _fresh/server.js; run deno task build");
}

const child = new Deno.Command(Deno.execPath(), {
  args: ["serve", "-A", "--unstable-kv", `--port=${PORT}`, "_fresh/server.js"],
  stdout: "inherit",
  stderr: "inherit",
}).spawn();

try {
  const home = await waitFor(`${ORIGIN}/`, 15_000);
  if (home.status !== 200) {
    throw new Error(`GET / returned ${home.status}`);
  }
  const html = await home.text();
  if (!html.includes("Flue writer")) {
    throw new Error("GET / did not include Flue writer");
  }
  const cssHref = html.match(/href="(\/assets\/[^"]+\.css[^"]*)"/)?.[1];
  if (!cssHref) {
    throw new Error("GET / had no client CSS");
  }
  const css = await fetch(new URL(cssHref, ORIGIN));
  if (css.status !== 200) {
    throw new Error(`GET ${cssHref} returned ${css.status}`);
  }
  const type = css.headers.get("content-type") ?? "";
  if (!type.includes("css")) {
    throw new Error(`GET ${cssHref} content-type was ${type}`);
  }
  console.log("smoke ok");
} finally {
  try {
    child.kill("SIGTERM");
  } catch {
    // already exited
  }
  await child.status;
}

async function waitFor(url: string, ms: number): Promise<Response> {
  const start = Date.now();
  let last = "no attempt";
  while (Date.now() - start < ms) {
    try {
      return await fetch(url);
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  throw new Error(`server did not answer ${url}: ${last}`);
}
