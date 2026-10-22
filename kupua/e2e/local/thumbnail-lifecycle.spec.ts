import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { heldImageServer } from "../shared/held-image-fixture";

test.use({ viewport: { width: 1720, height: 960 } });

async function prepareThumbnailFixture(page: Page, context: BrowserContext, baseURL: string, origin: string,
  density: "grid" | "justified") {
  const appOrigin = new URL(baseURL).origin;
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    const asset = url.origin === appOrigin && !/^\/(es|api|grid-|s3|imgproxy|bedrock)/.test(url.pathname);
    return asset || url.origin === origin ? route.continue() : route.fulfill({ status: 404, body: "isolated fixture" });
  });
  await context.route("**/src/lib/image-urls.ts*", async route => {
    const response = await route.fetch();
    const source = await response.text();
    const marker = "if (!S3_PROXY_ENABLED) return undefined;";
    expect(source.split(marker)).toHaveLength(2);
    await route.fulfill({ response, body: source.replace(marker,
      `return image.thumbnail?.secureUrl ?? ${JSON.stringify(origin)} + "/image/" + image.id + ".svg";`)
      .replace("S3_PROXY_ENABLED || SYNTHETIC_PREVIEW_ENABLED", "true") });
  });
  await page.addInitScript(density => sessionStorage.setItem("kupua-density", density), density);
  await page.goto("/search?nonFree=true");
  await page.waitForFunction(() => Boolean((window as any).__kupua_store__));
  await page.evaluate(async () => {
    const configPath = "/src/dal/es-config.ts";
    if (!(await import(configPath)).IS_LOCAL_ES) throw new Error("Thumbnail lifetime fixture requires local mode");
    const path = "/src/dal/mock-data-source.ts";
    const { MockDataSource } = await import(path);
    const store = (window as any).__kupua_store__;
    store.setState({ dataSource: new MockDataSource(343) });
    await store.getState().search();
    await store.getState().extendForward();
  });
}

async function expectVisibleThumbnail(page: Page, density: "grid" | "justified", source: string) {
  await page.waitForFunction(({ density, source }) => {
    const region = document.querySelector<HTMLElement>(`[aria-label="Image results ${density}"]`);
    const cell = region?.querySelector<HTMLElement>('[data-image-id="img-6"]');
    const image = cell?.querySelector("img");
    if (!region || !cell || !image || image.src !== source) return false;
    const bounds = region.getBoundingClientRect();
    const rect = cell.getBoundingClientRect();
    return rect.bottom > bounds.top && rect.top < bounds.bottom && getComputedStyle(image).display !== "none";
  }, { density, source });
}

test("Grid thumbnail cancellation recovers on reversal and preserves shared or completed images", async ({ page, context, baseURL }) => {
  let holdTarget = true;
  const targetPath = "/image/img-6.svg";
  const server = await heldImageServer({ hold: path => holdTarget && path === targetPath, limit: 2048 });
  try {
    await prepareThumbnailFixture(page, context, baseURL!, server.origin, "grid");
    const region = page.getByRole("region", { name: "Image results grid", exact: true });
    const targetRequests = () => server.requests.filter(request => request.path === targetPath);
    await expect.poll(() => targetRequests().length).toBe(1);
    const target = await region.locator('[data-image-id="img-6"] img').elementHandle();
    expect(await target!.evaluate(image => (image as HTMLImageElement).complete)).toBe(false);
    const source = (await target!.getAttribute("src"))!;
    await page.getByRole("button", { name: "Show Browse panel", exact: true }).click();
    await expectVisibleThumbnail(page, "grid", source);
    await page.waitForTimeout(200);
    expect(targetRequests()).toHaveLength(1);
    expect(targetRequests()[0].aborted).toBe(false);
    await region.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await page.waitForFunction(image => !image.isConnected && !image.hasAttribute("src"), target!);
    await expect.poll(() => targetRequests()[0].aborted).toBe(true);
    await region.evaluate(element => { element.scrollTop = 0; });
    await expectVisibleThumbnail(page, "grid", source);
    await expect.poll(() => targetRequests().length).toBe(2);
    expect(targetRequests()[0].finished).toBe(false);
    const sharedTarget = await region.locator('[data-image-id="img-6"] img').elementHandle();
    const consumer = await page.evaluateHandle(source => {
      const image = new Image(100, 100);
      image.src = source;
      document.body.append(image);
      return image;
    }, source);
    await region.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await page.waitForFunction(image => !image.isConnected && !image.hasAttribute("src"), sharedTarget!);
    await page.waitForTimeout(200);
    expect(targetRequests()).toHaveLength(2);
    expect(targetRequests()[1].aborted).toBe(false);
    holdTarget = false;
    targetRequests()[1].release();
    await consumer.evaluate(image => image.decode());
    expect(await consumer.evaluate(image => image.naturalWidth)).toBe(100);
    await region.evaluate(element => { element.scrollTop = 0; });
    await expectVisibleThumbnail(page, "grid", source);
    const completed = await region.locator('[data-image-id="img-6"] img').elementHandle();
    await completed!.evaluate(image => (image as HTMLImageElement).decode());
    await region.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await page.waitForFunction(image => !image.isConnected, completed!);
    expect(await completed!.getAttribute("src")).toBe(source);
    expect(await completed!.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBe(100);
    expect(targetRequests()).toHaveLength(2);
    expect(targetRequests()[1].finished).toBe(true);
    await consumer.evaluate(image => image.remove());
    await consumer.dispose();
    await completed!.dispose();
    await sharedTarget!.dispose();
    await target!.dispose();
  } finally { await server.close(); }
});

test("Justified thumbnail survives reflow and density changes and reloads its replacement source", async ({ page, context, baseURL }) => {
  let holdTarget = true;
  const targetPath = "/image/img-6.svg";
  const replacementPath = "/image/replacement.svg";
  const server = await heldImageServer({ hold: path => holdTarget && [targetPath, replacementPath].includes(path), limit: 2048 });
  try {
    await prepareThumbnailFixture(page, context, baseURL!, server.origin, "justified");
    const region = page.getByRole("region", { name: "Image results justified", exact: true });
    const targetRequests = () => server.requests.filter(request => request.path === targetPath);
    await expect.poll(() => targetRequests().length).toBe(1);
    const source = (await region.locator('[data-image-id="img-6"] img').getAttribute("src"))!;
    await page.setViewportSize({ width: 590, height: 960 });
    await expectVisibleThumbnail(page, "justified", source);
    await page.waitForTimeout(200);
    expect(targetRequests()).toHaveLength(1);
    expect(targetRequests()[0].aborted).toBe(false);
    await page.setViewportSize({ width: 1720, height: 960 });
    await expectVisibleThumbnail(page, "justified", source);
    await page.getByRole("button", { name: "Grid view", exact: true }).click();
    await expectVisibleThumbnail(page, "grid", source);
    await page.getByRole("button", { name: "Justified view", exact: true }).click();
    await expectVisibleThumbnail(page, "justified", source);
    await page.waitForTimeout(200);
    expect(targetRequests()).toHaveLength(1);
    expect(targetRequests()[0].aborted).toBe(false);
    const target = await region.locator('[data-image-id="img-6"] img').elementHandle();
    const replacementSource = server.origin + replacementPath;
    await page.evaluate(source => {
      const store = (window as any).__kupua_store__;
      store.setState({ results: store.getState().results.map((image: { id: string; thumbnail?: object }) =>
        image.id === "img-6" ? { ...image, thumbnail: { ...image.thumbnail, secureUrl: source } } : image) });
    }, replacementSource);
    await expect.poll(() => target!.getAttribute("src")).toBe(replacementSource);
    expect(await target!.evaluate(image => image === document.querySelector(
      '[aria-label="Image results justified"] [data-image-id="img-6"] img'))).toBe(true);
    const replacements = () => server.requests.filter(request => request.path === replacementPath);
    await expect.poll(() => replacements().length).toBe(1);
    await page.waitForTimeout(200);
    expect(replacements()[0].aborted).toBe(false);
    expect(await target!.getAttribute("src")).toBe(replacementSource);
    await region.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await page.waitForFunction(image => !image.isConnected && !image.hasAttribute("src"), target!);
    await expect.poll(() => replacements()[0].aborted).toBe(true);
    holdTarget = false;
    for (const request of server.requests) request.release();
    await region.evaluate(element => { element.scrollTop = 0; });
    await expectVisibleThumbnail(page, "justified", replacementSource);
    await region.locator('[data-image-id="img-6"] img').evaluate(image => (image as HTMLImageElement).decode());
    expect(await region.locator('[data-image-id="img-6"] img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBe(100);
    expect(replacements()).toHaveLength(2);
    expect(replacements()[0].finished).toBe(false);
    expect(replacements()[1].finished).toBe(true);
    await target!.dispose();
  } finally { await server.close(); }
});