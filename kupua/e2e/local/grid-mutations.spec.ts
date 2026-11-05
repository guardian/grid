import { test, expect, type Page } from "@playwright/test";
import { createServer as createHttpServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { build, createServer, type Plugin } from "vite";
import type * as Commands from "../../src/lib/grid-commands";
import type { labelEditorFixture } from "../shared/label-editor-fixture";
import { GRID_API_READ_VIA_POST } from "../../src/dal/grid-api/read-via-post";

type CommandWindow = typeof window & { commandFixture: typeof Commands; editorFixture: typeof labelEditorFixture };
const virtualEntry = "virtual:kupua-commands";
const fixturePlugin: Plugin = {
  name: "isolated-command-fixture",
  resolveId(id) { if (id === virtualEntry) return id; },
  load(id) {
    if (id === virtualEntry) return `import * as commands from ${JSON.stringify(resolve("src/lib/grid-commands.ts"))}; window.commandFixture = commands;
      import {labelEditorFixture} from ${JSON.stringify(resolve("e2e/shared/label-editor-fixture.tsx"))}; window.editorFixture = labelEditorFixture;`;
  },
  configureServer(server) {
    server.middlewares.use("/__commands", async (_request, response) => {
      response.setHeader("Content-Type", "text/html");
      response.end(await server.transformIndexHtml("/__commands", `<html><head></head><body><script type="module" src="/@id/${virtualEntry}"></script></body></html>`));
    });
  },
};

function labelCommand(origin: string) {
  return { operation: "add-labels", imageId: "fixture", labels: ["fixture label"],
    resource: { links: [{ rel: "edits", href: `${origin}/metadata/fixture` }] } };
}

async function exerciseLabelEditor(page: Page) {
  const aggregationBodies: Record<string, unknown>[] = [];
  const suggestionsRoute = "**/images/aggregations";
  const suggestionsHandler: Parameters<Page["route"]>[1] = async route => {
    if (route.request().method() === "POST") aggregationBodies.push(route.request().postDataJSON());
    await route.fulfill({ json: { fields: { "userMetadata.labels": { buckets: [
      { key: "News", count: 9 }, { key: "News agency", count: 4 }, { key: "Football", count: 2 },
    ] } }, isFilterCounts: {} }, headers: {
      "Access-Control-Allow-Origin": new URL(page.url()).origin,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
    } });
  };
  await page.route(suggestionsRoute, suggestionsHandler);
  try {
  await page.evaluate(() => (window as CommandWindow).editorFixture.mount());
  const input = page.getByRole("combobox", { name: "Add label", exact: true });
  const plus = page.getByRole("button", { name: "Add label", exact: true, includeHidden: true });
  await expect(input).toHaveCount(0);
  const plusBounds = await plus.evaluate(element => element.getBoundingClientRect().toJSON());
  await plus.click();
  await expect(input).toHaveAttribute("placeholder", "label1, label2, label3\u2026");
  await expect(plus).toBeHidden();
  expect(await plus.evaluate(element => element.getBoundingClientRect().toJSON())).toEqual(plusBounds);
  await expect(page.getByText("Target images", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/selected:.*eligible/)).toHaveCount(0);
  const pill = page.getByRole("button", { name: "news", exact: true });
  const applyToAll = page.getByRole("button", { name: "Apply news to all selected images", exact: true });
  const removeLabel = page.getByRole("button", { name: "Remove news from all selected images", exact: true });
  const geometry = await pill.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const group = element.closest("[data-editable-pill]") ?? element.parentElement!.parentElement!;
    const buttons = [...group.querySelectorAll("button")].map(button => button.getBoundingClientRect());
    return { height: bounds.height, lineHeight: parseFloat(getComputedStyle(element).lineHeight),
      gaps: buttons.slice(1).map((button, index) => button.left - buttons[index].right) };
  });
  expect(geometry.height).toBeCloseTo(geometry.lineHeight, 0);
  expect(geometry.gaps).toEqual([0, 0]);
  await expect(applyToAll).toHaveAttribute("title", "Apply label to all");
  await expect(removeLabel).toHaveAttribute("title", "Remove label");
  await expect(pill.locator("xpath=../..")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(pill).toHaveCSS("color", "rgb(0, 173, 238)");
  await expect(applyToAll).toHaveCSS("color", "rgb(0, 173, 238)");
  await expect(removeLabel).toHaveCSS("color", "rgb(0, 173, 238)");
  await expect(applyToAll).toHaveCSS("cursor", "pointer");
  await expect(removeLabel).toHaveCSS("cursor", "pointer");
  await applyToAll.hover();
  await expect(applyToAll).toHaveCSS("background-color", "rgb(179, 229, 252)");
  await expect(applyToAll.locator("svg")).toHaveCSS("color", "rgb(0, 86, 137)");
  await expect(pill).toHaveCSS("color", "rgb(0, 173, 238)");
  await removeLabel.hover();
  await expect(removeLabel.locator("svg")).toHaveCSS("color", "rgb(0, 86, 137)");
  await page.mouse.move(0, 0);
  await page.getByRole("region", { name: "Label editor fixture" }).screenshot({ path: test.info().outputPath("pill-partial.png") });
  await page.evaluate(() => (window as CommandWindow).editorFixture.targets(["fixture"]));
  await expect(applyToAll).toHaveCount(0);
  const removeFullLabel = page.getByRole("button", { name: "Remove news", exact: true });
  await expect(removeFullLabel).toHaveAttribute("title", "Remove label");
  await expect(pill.locator("xpath=../..")).toHaveCSS("background-color", "rgb(0, 173, 238)");
  expect((await pill.boundingBox())?.height).toBeCloseTo(geometry.height, 0);
  await expect(pill).toHaveCSS("color", "rgb(255, 255, 255)");
  await pill.hover();
  await expect(pill).toHaveCSS("background-color", "rgb(179, 229, 252)");
  await expect(pill).toHaveCSS("color", "rgb(0, 86, 137)");
  await expect(removeFullLabel).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(pill.locator("xpath=../..")).toHaveCSS("background-color", "rgb(0, 173, 238)");
  await removeFullLabel.hover();
  await expect(removeFullLabel).toHaveCSS("background-color", "rgb(179, 229, 252)");
  await expect(removeFullLabel.locator("svg")).toHaveCSS("color", "rgb(0, 86, 137)");
  await expect(pill).toHaveCSS("color", "rgb(255, 255, 255)");
  await page.mouse.move(0, 0);
  await page.getByRole("region", { name: "Label editor fixture" }).screenshot({ path: test.info().outputPath("pill-full.png") });
  await page.evaluate(() => (window as CommandWindow).editorFixture.targets(["fixture", "other"]));
  await input.fill("no matching popular label");
  await expect(input).toHaveAttribute("aria-busy", "false");
  const fixture = page.getByRole("region", { name: "Label editor fixture" });
  const closedSuggestionsHeight = (await fixture.boundingBox())!.height;
  await input.fill("first, nE, last");
  for (let offset = 0; offset < 6; offset++) await input.press("ArrowLeft");
  const options = page.getByRole("option");
  await expect(options.locator("span:first-child")).toHaveText(["News", "News agency"]);
  expect((await fixture.boundingBox())!.height).toBe(closedSuggestionsHeight);
  await options.first().click();
  await expect(input).toHaveValue("first, News, last");
  await expect(page.getByText("Not sent - dry run", { exact: true })).toHaveCount(0);
  await input.fill("first, News, last, fO");
  await expect(options.locator("span:first-child")).toHaveText(["Football"]);
  await input.press("ArrowDown");
  await input.press("Enter");
  await expect(input).toHaveValue("first, News, last, Football");
  expect(aggregationBodies.length).toBeGreaterThan(0);
  for (const body of aggregationBodies) expect(body).toEqual({ q: "", fields: [{ field: "userMetadata.labels", size: 50 }] });
  await input.press("Escape");
  await expect(input).toHaveCount(0);
  await expect(plus).toBeFocused();
  await plus.click();
  await expect(input).toHaveValue("");
  await input.fill("retained label");
  await page.evaluate(() => (window as CommandWindow).editorFixture.show(false));
  await expect(input).toHaveCount(0);
  await page.evaluate(() => (window as CommandWindow).editorFixture.show());
  await plus.click();
  await expect(input).toHaveValue("retained label");
  await input.press("Enter");
  await expect(page.getByText("Not sent - dry run", { exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Remove news from all selected images", exact: true }).click();
  await expect(page.getByText("Not sent - dry run", { exact: true })).toHaveCount(2);
  expect((await page.evaluate(() => (window as CommandWindow).editorFixture.snapshot())).receipts.map(receipt => receipt.intent.action)).toEqual(["add", "remove"]);
  await page.evaluate(() => (window as CommandWindow).editorFixture.mount(true));
  const apply = page.getByRole("button", { name: "Apply news to all selected images", exact: true });
  await apply.dblclick();
  const snapshot = () => page.evaluate(() => (window as CommandWindow).editorFixture.snapshot());
  await expect.poll(async () => (await snapshot()).calls).toBe(2);
  expect((await snapshot()).receipts[0].items.map(item => item.state)).toEqual(["submitted", "unknown"]);
  await page.evaluate(() => {
    (window as CommandWindow).editorFixture.targets(["new-selection"], true);
    (window as CommandWindow).editorFixture.release({ outcome: "acknowledged" });
  });
  await expect.poll(async () => (await snapshot()).receipts[0].items[0].state).toBe("accepted-awaiting-visibility");
  expect((await snapshot()).receipts[0].intent.targetIds).toEqual(["fixture", "other"]);
  await expect(page.getByRole("button", { name: "Remove news", exact: true })).toBeDisabled();
  } finally {
    await page.unroute(suggestionsRoute, suggestionsHandler);
  }
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
    await exerciseLabelEditor(page);
    expect(received).toEqual([]);
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
  let releaseMetadata: (() => void) | undefined;
  let heldMetadata: Promise<void> | undefined;
  const imageEntity = (imageId: string) => ({
    uri: `${config.mediaApiUri}/images/${imageId}`,
    links: [{ rel: "edits", href: `${metadataOrigin}/metadata/${imageId}` }],
    data: { id: imageId, uploadTime: "2026-01-01T00:00:00Z", lastModified: "2026-01-01T00:00:00Z",
      metadata: { title: `Fixture ${imageId}`, credit: "Fixture", description: "Synthetic image" },
      cost: "free", valid: true, invalidReasons: {}, usageRights: { category: "staff-photographer" },
      userMetadata: { data: { labels: { data: [{ data: "news" }] }, archived: { data: false },
        metadata: {}, usageRights: {}, photoshoot: {} } },
      source: { dimensions: { width: 800, height: 600 }, mimeType: "image/jpeg" },
      thumbnail: { secureUrl: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", dimensions: { width: 1, height: 1 } },
      usages: { data: [] }, leases: { data: { leases: [] } }, collections: [],
    },
  });
  const escaped: string[] = [];
  const assertEditorReads = () => expect(requests.filter(request => !(request.origin === config.mediaApiUri
    && ((request.method === "GET" && ["/", "/usage/quotas", "/images/fixture", "/images/other"].includes(request.path))
      || (request.method === "POST" && GRID_API_READ_VIA_POST.includes(request.path)))))).toEqual([]);
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
        const contentType = extname(file) === ".css" ? "text/css" : extname(file) === ".wasm" ? "application/wasm" : extname(file) === ".svg" ? "image/svg+xml" : "text/javascript";
        await route.fulfill({ body: await readFile(file), contentType });
      } else { escaped.push(url.pathname); await route.abort(); }
      return;
    }
    if (![config.mediaApiUri, metadataOrigin, authOrigin].includes(url.origin)) { escaped.push(url.origin); await route.abort(); return; }
    requests.push({ method: request.method(), origin: url.origin, path: url.pathname, cookie: (await request.allHeaders()).cookie ?? "" });
    let body: unknown = { data: [], total: 0 };
    if (url.origin === config.mediaApiUri && url.pathname === "/") body = { links: [{ rel: "session", href: `${authOrigin}/session` }] };
    if (url.origin === config.mediaApiUri && /^\/images\/(fixture|other)$/.test(url.pathname)) body = imageEntity(url.pathname.split("/").at(-1)!);
    if (url.origin === config.mediaApiUri && url.pathname === "/images/mget") {
      if (heldMetadata) await heldMetadata;
      body = { data: (request.postDataJSON().ids as string[]).map(imageEntity) };
    }
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
    await page.evaluate(() => (window as CommandWindow).editorFixture.navigate("fixture"));
    const realInput = page.getByRole("combobox", { name: "Add label", exact: true }).filter({ visible: true });
    const realPlus = page.getByRole("button", { name: "Add label", exact: true });
    await realPlus.click();
    await expect(realInput).toBeVisible();
    await realInput.fill("cold-detail");
    await realInput.press("Enter");
    await expect(page.getByText("Not sent - dry run", { exact: true })).toBeVisible();
    await realPlus.click();
    await realInput.fill("keep this input");
    await page.evaluate(() => (window as CommandWindow).editorFixture.navigate());
    await page.evaluate(() => (window as CommandWindow).editorFixture.select(["fixture"]));
    await realPlus.click();
    await expect(realInput).toHaveValue("keep this input");
    await expect(page.getByRole("button", { name: "Add label to images", exact: true })).toBeEnabled();
    heldMetadata = new Promise<void>(resolve => { releaseMetadata = resolve; });
    await page.evaluate(() => (window as CommandWindow).editorFixture.select(["other"]));
    await expect(page.getByRole("button", { name: "Add label to images", exact: true })).toBeDisabled();
    await expect(realInput).toHaveValue("");
    releaseMetadata!();
    heldMetadata = undefined;
    await realInput.fill("off-screen");
    await expect(page.getByRole("button", { name: "Add label to images", exact: true })).toBeEnabled();
    await realInput.press("Enter");
    await expect(page.getByText("Not sent - dry run", { exact: true })).toHaveCount(2);
    await page.evaluate(() => (window as CommandWindow).editorFixture.focus("fixture"));
    const keyboardRemove = page.getByRole("button", { name: "Remove news", exact: true });
    await keyboardRemove.focus();
    await keyboardRemove.press("Enter");
    await expect(page).not.toHaveURL(/image=/);
    await expect(page.getByText("Not sent - dry run", { exact: true })).toHaveCount(3);
    await page.screenshot({ path: testInfo.outputPath("label-editor-desktop.png") });
    assertEditorReads();
    const warning = page.waitForEvent("dialog");
    const navigation = page.goto(appOrigin);
    const dialog = await warning;
    expect(dialog.type()).toBe("beforeunload");
    await dialog.accept();
    await navigation;
    await page.waitForFunction(() => Boolean((window as CommandWindow).commandFixture));
    await page.evaluate(() => { window.__KUPUA_CONFIG__!.mutations = { enabled: true, operations: ["add-labels"] }; });
    await exerciseLabelEditor(page);
    assertEditorReads();
    page.once("dialog", dialog => dialog.accept());
    await page.goto(appOrigin);
    await page.waitForFunction(() => Boolean((window as CommandWindow).commandFixture));
    await page.evaluate(() => { window.__KUPUA_CONFIG__!.mutations = { enabled: true, operations: ["add-labels"] }; });
    await page.setViewportSize({ width: 390, height: 844 });
    const touch = await context.newCDPSession(page);
    await touch.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
    await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    await page.evaluate(() => (window as CommandWindow).editorFixture.select(["fixture", "other"]));
    const sheet = page.getByRole("region", { name: "Details", exact: true });
    const remove = page.getByRole("button", { name: "Remove news from all selected images", exact: true });
    await expect(remove).toHaveAttribute("title", "Remove label from all");
    await remove.scrollIntoViewIfNeeded();
    const bounds = await remove.boundingBox();
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: bounds!.x + bounds!.width / 2, y: bounds!.y + bounds!.height / 2 }] });
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    const activity = sheet.getByRole("complementary", { name: "Label activity" });
    await expect(activity.getByText("Not sent - dry run", { exact: true })).toBeVisible();
    await expect(activity).toContainText('"action": "remove"');
    await expect(activity).toContainText('"label": "news"');
    await expect(activity).toContainText('"fixture"');
    await expect(activity).toContainText('"other"');
    const activityToggle = activity.locator(":scope > details > summary");
    await remove.focus();
    for (let step = 0; step < 20 && !await activityToggle.evaluate(element => element === document.activeElement); step++) {
      await page.keyboard.press("Tab");
    }
    await expect(activityToggle).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath("label-editor-mobile.png") });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    assertEditorReads();
    await touch.detach();
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
    releaseMetadata?.();
    await page.unrouteAll({ behavior: "wait" });
  }
});