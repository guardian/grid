import { test, expect } from "@playwright/test";
import { createServer as createHttpServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { build, createServer, type Plugin } from "vite";
import type * as Commands from "../../src/lib/grid-commands";

type CommandWindow = typeof window & { commandFixture: typeof Commands };
const virtualEntry = "virtual:kupua-commands";
const fixturePlugin: Plugin = {
  name: "isolated-command-fixture",
  resolveId(id) { if (id === virtualEntry) return id; },
  load(id) {
    if (id === virtualEntry) return `import * as commands from ${JSON.stringify(resolve("src/lib/grid-commands.ts"))}; window.commandFixture = commands;`;
  },
  configureServer(server) {
    server.middlewares.use("/__commands", (_request, response) => {
      response.setHeader("Content-Type", "text/html");
      response.end(`<html><head></head><body><script type="module" src="/@id/${virtualEntry}"></script></body></html>`);
    });
  },
};

function labelCommand(origin: string) {
  return { operation: "add-labels", imageId: "fixture", labels: ["fixture label"],
    resource: { links: [{ rel: "edits", href: `${origin}/metadata/fixture` }] } };
}

test("local commands cross the actual guarded Vite proxy only for the selected operation", async ({ page }) => {
  const received: Array<{ method: string; path: string; body: string }> = [];
  let origin = "";
  const upstream = createHttpServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    received.push({ method: request.method ?? "", path: request.url ?? "", body });
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/") response.end(JSON.stringify({ links: [{ rel: "session", href: `${origin}/session` }] }));
    else if (request.url === "/session") response.end(JSON.stringify({ data: { user: { permissions: {} } } }));
    else if (request.url === "/metadata/fixture" && request.method === "GET") {
      response.end(JSON.stringify({ data: { labels: { uri: `${origin}/metadata/fixture/labels` } } }));
    } else if (request.url === "/metadata/fixture/labels" && request.method === "POST") response.end("{}");
    else { response.statusCode = 404; response.end("{}"); }
  });
  await new Promise<void>((done) => upstream.listen(0, "127.0.0.1", done));
  const address = upstream.address();
  if (!address || typeof address === "string") throw new Error("No fixture address");
  origin = `http://127.0.0.1:${address.port}`;
  const env = {
    VITEST: "true", VITE_USE_MEDIA_API: "true", VITE_HOSTED: "false", VITE_MEDIA_API_BASE_URL: "/api",
    VITE_GRID_METADATA_ORIGIN: origin, VITE_GRID_AUTH_ORIGIN: origin,
    VITE_GRID_API_WRITES_ENABLED: "true", VITE_GRID_API_OPERATIONS: "add-labels",
  };
  const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  let vite: Awaited<ReturnType<typeof createServer>> | undefined;
  try {
    vite = await createServer({
      configFile: resolve("vite.config.ts"), plugins: [fixturePlugin],
      server: { host: "127.0.0.1", port: 0, proxy: { "/api": { target: origin, secure: true } } },
    });
    await vite.listen();
    const localOrigin = vite.resolvedUrls!.local[0].replace(/\/$/, "");
    await page.route("**/*", (route) => new URL(route.request().url()).origin === localOrigin ? route.continue() : route.abort());
    await page.goto(`${localOrigin}/__commands`);
    await page.waitForFunction(() => Boolean((window as CommandWindow).commandFixture));
    const result = await page.evaluate((command) => (window as CommandWindow).commandFixture.executeGridCommand(command), labelCommand(origin));
    expect(result.outcome).toBe("acknowledged");
    expect(received).toEqual([
      { method: "GET", path: "/", body: "" }, { method: "GET", path: "/session", body: "" },
      { method: "GET", path: "/metadata/fixture", body: "" },
      { method: "POST", path: "/metadata/fixture/labels", body: JSON.stringify({ data: ["fixture label"] }) },
    ]);
    const refused = await page.evaluate(async () => Promise.all([
      ["/grid-metadata/metadata/fixture/labels", "DELETE"],
      ["/grid-metadata/metadata/fixture/labels/extra", "POST"],
      ["/grid-auth/session", "POST"], ["/api/images/fixture", "DELETE"],
    ].map(async ([path, method]) => (await fetch(path, { method })).status)));
    expect(refused).toEqual([403, 403, 403, 403]);
    process.env.VITE_GRID_API_WRITES_ENABLED = "false";
    expect(await page.evaluate(async () => (await fetch("/grid-metadata/metadata/fixture/labels", { method: "POST" })).status)).toBe(403);
    expect(received).toHaveLength(4);
  } finally {
    await page.unrouteAll({ behavior: "wait" });
    await vite?.close();
    await new Promise<void>((done, reject) => upstream.close((error) => error ? reject(error) : done()));
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test("built hosted commands fail closed, use direct service origins and stop after expiry", async ({ page, context }, testInfo) => {
  test.setTimeout(90_000);
  const outDir = testInfo.outputPath("hosted");
  await build({
    configFile: resolve("vite.config.ts"), mode: "hosted", plugins: [fixturePlugin],
    build: { outDir, emptyOutDir: true, rollupOptions: {
      input: { index: resolve("index.html"), commands: virtualEntry },
      output: { entryFileNames: "assets/[name].js" },
    } },
  });
  const appOrigin = "https://app.example.test";
  const metadataOrigin = "https://metadata.example.test";
  const authOrigin = "https://auth.example.test";
  const config = { mediaApiUri: "https://api.example.test", metadataEditorUri: metadataOrigin, authUri: authOrigin };
  const requests: Array<{ method: string; origin: string; path: string; cookie: string }> = [];
  let writeStatus = 200;
  const escaped: string[] = [];
  await context.addCookies([{ name: "fixture-session", value: "synthetic", domain: ".example.test", path: "/", secure: true, sameSite: "None" }]);
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === appOrigin) {
      if (url.pathname === "/") {
        const html = (await readFile(resolve(outDir, "index.html"), "utf8"))
          .replace("<head>", `<head><script>window.__KUPUA_CONFIG__=${JSON.stringify(config)}</script>`)
          .replace("</body>", '<script type="module" src="/assets/kupua/assets/commands.js"></script></body>');
        await route.fulfill({ contentType: "text/html", body: html, headers: {
          "Content-Security-Policy": `default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://api.example.test ${metadataOrigin} ${authOrigin}`,
        } });
      } else if (url.pathname.startsWith("/assets/kupua/")) {
        const file = resolve(outDir, url.pathname.slice("/assets/kupua/".length));
        if (!file.startsWith(`${outDir}/`)) { await route.abort(); return; }
        const contentType = extname(file) === ".css" ? "text/css" : extname(file) === ".wasm" ? "application/wasm" : "text/javascript";
        await route.fulfill({ body: await readFile(file), contentType });
      } else { escaped.push(url.pathname); await route.abort(); }
      return;
    }
    if (![config.mediaApiUri, metadataOrigin, authOrigin].includes(url.origin)) { escaped.push(url.origin); await route.abort(); return; }
    requests.push({ method: request.method(), origin: url.origin, path: url.pathname, cookie: (await request.allHeaders()).cookie ?? "" });
    let body: unknown = { data: [], total: 0 };
    if (url.origin === config.mediaApiUri && url.pathname === "/") body = { links: [{ rel: "session", href: `${authOrigin}/session` }] };
    if (url.origin === authOrigin) body = { data: { user: { permissions: {} } } };
    if (url.origin === metadataOrigin) body = { data: { labels: { uri: `${metadataOrigin}/metadata/fixture/labels` } } };
    const status = url.origin === metadataOrigin && request.method() === "POST" ? writeStatus : 200;
    await route.fulfill({ status, json: status === 419 ? { errorKey: "authentication-expired" } : body,
      headers: { "Access-Control-Allow-Origin": appOrigin, "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "content-type" } });
  });
  try {
    await page.goto(appOrigin);
    await page.waitForFunction(() => Boolean((window as CommandWindow).commandFixture));
    await expect(page.locator("#root")).not.toBeEmpty();
    const execute = () => page.evaluate((command) => (window as CommandWindow).commandFixture.executeGridCommand(command), labelCommand(metadataOrigin));
    expect((await execute()).outcome).toBe("blocked");
    expect(requests.filter((request) => request.origin === metadataOrigin || request.origin === authOrigin)).toEqual([]);
    await page.evaluate(() => { window.__KUPUA_CONFIG__!.mutations = { enabled: true, operations: ["add-labels"] }; });
    expect((await execute()).outcome).toBe("acknowledged");
    const writes = () => requests.filter((request) => request.origin === metadataOrigin && request.method === "POST");
    expect(writes()).toEqual([{ method: "POST", origin: metadataOrigin, path: "/metadata/fixture/labels", cookie: "fixture-session=synthetic" }]);
    writeStatus = 419;
    expect((await execute()).outcome).toBe("rejected");
    const afterExpiry = requests.length;
    expect((await execute()).outcome).toBe("blocked");
    expect(requests).toHaveLength(afterExpiry);
    expect(writes()).toHaveLength(2);
    expect(escaped).toEqual([]);
  } finally {
    await page.unrouteAll({ behavior: "wait" });
  }
});