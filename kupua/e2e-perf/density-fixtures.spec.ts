import { test, expect, type Page, type CDPSession } from "@playwright/test";
import { readFileSync } from "node:fs";
import { KupuaHelpers } from "../e2e/shared/helpers";
import { getDensityChangeButton } from "../e2e/shared/density-selection";
import { installThumbnailProbe } from "./thumbnail-probe.mjs";
import { selectDensity, electAnchor, waitForPlacement, visibleMediaReadiness, scrollAtSpeed, withDensityScrollNetwork, measureDensityRecovery } from "./density-browser";
import { DENSITY_SCENARIOS, validateDensityRecord } from "./density-reporting.mjs";

const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="blue"/></svg>';

async function fixture(page: Page, density = "grid") {
  await page.route("**/*", route => route.fulfill({ status: 404, body: "fixture only" }));
  const cell = (id: string) => `<div ${density === "table" ? 'role="row"' : 'data-grid-cell'} data-image-id="fixture-${id}"><div class="slot" ${density === "table" ? 'role="gridcell"' : ''}><img src="https://fixture.invalid/${id}.svg"></div></div>`;
  await page.setContent(`<style>body{margin:0} [role=region]{height:300px;width:400px;overflow:auto} .slot{height:100px;width:100px} img{width:100px;height:100px}</style>
    <div role="region" aria-label="Image results ${density}">${density === "table" ? '<div role="row" data-table-header><div role="columnheader">Pic</div></div>' : ''}${cell("a")}<div style="height:300px"></div>${cell("b")}<div style="height:1000px"></div></div>`);
  await page.evaluate(() => {
    (window as any).__kupua_store__ = { getState: () => ({ loading: false, _browseNavigation: null }) };
    (window as any).__densityAnchor = "fixture-a";
  });
}

async function mountDensityDashboard(page: Page, entries: unknown[]) {
  await page.route("**/*", route => route.abort());
  await page.route("https://fixture.invalid/density-log.js", route => route.fulfill({ contentType: "text/javascript", body: `window.__DENSITY_LOG__=${JSON.stringify({ entries })}` }));
  await page.route("https://fixture.invalid/density-dashboard.js", route => route.fulfill({ contentType: "text/javascript", body: readFileSync(new URL("./results/density-dashboard.js", import.meta.url), "utf8") }));
  await page.route("https://fixture.invalid/dashboard", route => route.fulfill({ contentType: "text/html", body: readFileSync(new URL("./results/density-graphs.html", import.meta.url), "utf8") }));
  await page.goto("https://fixture.invalid/dashboard");
}

async function sampleFrames(page: Page, count = 4) {
  await page.evaluate(async count => { for (let i = 0; i < count; i++) await new Promise(requestAnimationFrame); }, count);
}

for (const searchStarted of [null, 0, 1]) {
  test(`results readiness timeout exposes sanitized bootstrap state (${searchStarted ?? "unavailable"})`, async ({ page }) => {
    await fixture(page);
    await page.getByRole("region").evaluate(element => { element.replaceChildren(); });
    await page.evaluate(started => {
      (window as any).__kupua_store__ = { getState: () => ({
        loading: false, _isInitialLoad: true, total: 0, results: [], error: "fixture-private-error",
        params: { query: "fixture-private-query" }, focusedImageId: "fixture-private-identity",
      }) };
      (window as any).__kupua_getSearchLifecycle__ = started === null ? undefined : () => ({
        started, settled: 0, query: "fixture-private-query", orderBy: "fixture-private-sort",
      });
    }, searchStarted);
    const error = await new KupuaHelpers(page).waitForResults(100, "grid").catch(error => error as Error);
    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error)) throw new Error("Expected readiness timeout");
    expect(error.message).toContain("Results readiness state:");
    expect(error.message).toContain('"initialLoad":true');
    expect(error.message).toContain('"loading":false');
    expect(error.message).toContain('"hasError":true');
    expect(error.message).toContain('"resultsLength":0');
    expect(error.message).toContain(`"searchStarted":${searchStarted}`);
    expect(error.message).toContain(`"searchSettled":${searchStarted === null ? null : 0}`);
    expect(error.message).not.toContain("fixture-private");
  });
}

test("D9 observes decoded stopped content without waiting for unrelated refills", async ({ page }) => {
  await page.route("**/*", route => route.fulfill({ status: 404, body: "fixture only" }));
  const source = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  const cells = Array.from({ length: 200 }, (_, index) =>
    `<div data-grid-cell data-image-id="fixture-${index}"><div><img src="${source}"></div></div>`).join("");
  await page.setContent(`<style>body{margin:0}[role=region]{height:300px;width:400px;overflow:auto}[data-grid-cell],img{height:100px;width:100px}</style>
    <div role="region" aria-label="Image results grid" data-scrubber-mode="seek">${cells}</div>`);
  await page.evaluate(() => {
    const region = document.querySelector<HTMLElement>('[role="region"]')!;
    region.scrollTop = 10000;
    let state = { params: {}, total: 70000, bufferOffset: 1000, results: Array(1000).fill(null),
      imagePositions: new Map(Array.from({ length: 200 }, (_, index) => [`fixture-${index}`, index])),
      loading: false, _browseNavigation: null, _extendForwardInFlight: false, _extendBackwardInFlight: false };
    (window as any).__kupua_store__ = { getState: () => state, subscribe: (callback: (next: unknown, previous: unknown) => void) => {
      const start = () => {
        const previous = state;
        state = { ...state, _extendForwardInFlight: true };
        callback(state, previous);
      };
      region.addEventListener("scroll", start, { once: true });
      return () => { region.removeEventListener("scroll", start); (window as any).__recoveryUnsubscribed = true; };
    } };
  });
  await sampleFrames(page);
  const metrics = await measureDensityRecovery(page, "grid");
  const scenario = DENSITY_SCENARIOS.find(item => item.id === "D9-grid")!;
  validateDensityRecord({ ...scenario, resultRegime: "seek", metrics });
  expect(metrics.stopDataCensored).toBe(0);
  expect(metrics.stopMediaCensored).toBe(0);
  expect(metrics.stopMediaReadyMs).toBeGreaterThanOrEqual(metrics.stopDataReadyMs!);
  expect(metrics.refillsPendingAtEnd).toBe(1);
  expect(metrics.forwardReadStarts).toBe(1);
  expect(await page.evaluate(() => (window as any).__recoveryUnsubscribed && !(window as any).__densityRecovery)).toBe(true);
});

test("D9 recovery and request cost are first-class dashboard metrics", async ({ page }) => {
  const value = (median: number) => ({ median, p95: median, sampleCount: 4 });
  await mountDensityDashboard(page, [{ label: "Recovery fixture", timestamp: "2026-10-17", environmentCompatibilityKey: "fixture",
    metrics: { "D9-grid": { id: "D9-grid", scenarioRevision: 1, density: "grid", workload: "burst-recovery",
      profile: "density-v1-4000pxs-3s-back-1.5s-forward-10s-recovery", cacheClass: "fixture", resultRegime: "seek",
      completionBoundary: "fixture", contractKey: "fixture-grid", sampleCount: 4,
      metrics: { bufferEdgeBlockedMs: value(250), stopDataReadyMs: value(20), stopMediaReadyMs: value(125),
        stopMediaCensored: value(0), backwardReadStarts: value(3), readStartsAfterStop: value(1) } } } }]);
  await page.getByLabel("Metric", { exact: true }).selectOption("bufferEdgeBlockedMs");
  await expect(page.locator("#metric-title")).toContainText("Input blocked at buffer edges");
  await expect(page.locator("#cards")).toContainText("D9");
  await expect(page.locator("#cards")).toContainText("250 ms");
  await page.getByLabel("Metric", { exact: true }).selectOption("stopMediaReadyMs");
  await expect(page.locator("#metric-explanation")).toContainText("Last commanded scroll");
  await expect(page.locator("#cards")).toContainText("125 ms");
  await page.getByLabel("Metric", { exact: true }).selectOption("readStartsAfterStop");
  await expect(page.locator("#metric-caution")).toContainText("not automatically wasted");
  await expect(page.locator("#all-metrics")).not.toBeChecked();
});

for (const density of ["grid", "justified", "table"] as const) {
  test(`${density}: delayed thumbnails create blank exposure and late-readiness evidence`, async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await fixture(page, density);
    await page.route("https://fixture.invalid/held.svg", async route => { await gate; await route.fulfill({ contentType: "image/svg+xml", body: svg }); });
    try {
      await page.locator("img").first().evaluate((img: HTMLImageElement) => { img.src = "https://fixture.invalid/held.svg"; });
      await page.evaluate(installThumbnailProbe, { density });
      await sampleFrames(page, 6);
      await page.getByRole("region").evaluate(el => { el.scrollTop = 10; });
      release();
      await expect.poll(() => page.locator("img").first().evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
      await sampleFrames(page);
      const metrics = await page.evaluate(() => (window as any).__kupua_thumbnailProbe.stop());
      expect(metrics.blankViewportMs).toBeGreaterThan(0);
      expect(metrics.exposureAreaMs).toBeGreaterThan(0);
      expect(metrics.pendingAreaRatioMax).toBeGreaterThan(0);
      expect(metrics.decodedCount).toBeGreaterThan(0);
      expect(metrics.lateReadyCount).toBeGreaterThan(0);
      expect(JSON.stringify(metrics)).not.toContain("fixture-a");
      expect(JSON.stringify(metrics)).not.toContain("fixture.invalid");
    } finally {
      release();
      await page.evaluate(() => (window as any).__kupua_thumbnailProbe?.dispose());
    }
  });
}

test("source reuse cannot credit an obsolete decode to the replacement identity", async ({ page }) => {
  await fixture(page);
  await page.route("https://fixture.invalid/ready.svg", route => route.fulfill({ contentType: "image/svg+xml", body: svg }));
  await page.locator("img").first().evaluate((img: HTMLImageElement) => { img.src = "https://fixture.invalid/ready.svg"; });
  await expect.poll(() => page.locator("img").first().evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await page.evaluate(() => {
    const img = document.querySelector("img")!;
    img.decode = () => new Promise<void>(resolve => { (window as any).__releaseDecode = resolve; });
  });
  await page.evaluate(installThumbnailProbe, { density: "grid" } as const);
  await sampleFrames(page);
  await page.locator("img").first().evaluate((img: HTMLImageElement) => {
    img.closest<HTMLElement>("[data-image-id]")!.dataset.imageId = "fixture-replacement";
    img.src = "https://fixture.invalid/missing.svg";
    (window as any).__releaseDecode?.();
  });
  await sampleFrames(page);
  const metrics = await page.evaluate(() => (window as any).__kupua_thumbnailProbe.stop());
  expect(metrics.imageIdentityChanges).toBeGreaterThan(0);
  expect(metrics.failedCount).toBeGreaterThan(0);
  expect(metrics.decodedCount).toBe(0);
  await page.evaluate(() => (window as any).__kupua_thumbnailProbe.dispose());
});

test("wrong density fails, observer cleanup is repeatable and cached media is not a new lead event", async ({ page }) => {
  await fixture(page);
  await expect(page.evaluate(installThumbnailProbe, { density: "table" } as const)).rejects.toThrow();
  await page.route("https://fixture.invalid/cached.svg", route => route.fulfill({ contentType: "image/svg+xml", body: svg }));
  await page.locator("img").evaluateAll((imgs: HTMLImageElement[]) => imgs.forEach(img => { img.src = "https://fixture.invalid/cached.svg"; }));
  await expect.poll(() => page.locator("img").evaluateAll((imgs: HTMLImageElement[]) => imgs.every(img => img.complete && img.naturalWidth > 0))).toBe(true);
  await page.locator("img").evaluateAll(async (imgs: HTMLImageElement[]) => { await Promise.all(imgs.map(img => img.decode())); });
  await page.evaluate(installThumbnailProbe, { density: "grid" } as const);
  await sampleFrames(page);
  const metrics = await page.evaluate(() => (window as any).__kupua_thumbnailProbe.stop());
  expect(metrics.readinessLeadPxMedian).toBeNull();
  expect(metrics.thumbnailPendingAreaRatioMean).toBe(0);
  expect(metrics.thumbnailBlankViewportMs).toBe(0);
  await page.evaluate(() => { const probe = (window as any).__kupua_thumbnailProbe; probe.dispose(); probe.dispose(); });
});

test("placement requires elected identity; media failure is censored, never ready", async ({ page }) => {
  await fixture(page);
  const epoch = await page.evaluate(() => performance.now());
  expect(await waitForPlacement(page, "grid", true, epoch)).toBeGreaterThanOrEqual(0);
  await page.evaluate(() => { (window as any).__densityAnchor = "not-present"; });
  await expect(waitForPlacement(page, "grid", true, epoch, 150)).rejects.toThrow("required identity");
  await expect(waitForPlacement(page, "justified", false, epoch, 150)).rejects.toThrow("required identity");
  const media = await visibleMediaReadiness(page, "grid", epoch, 100);
  expect(media.mediaReadyMs).toBeNull();
  expect(media.mediaCensored).toBe(1);
  expect(media.failedMediaCount).toBeGreaterThan(0);
  const movement = await scrollAtSpeed(page, "grid", 1000, 100);
  expect(movement.drivenDistancePx).toBeGreaterThan(0);
  expect(movement.drivenDistancePx).toBeLessThan(300);
});

test("Table shift attribution separates movement from image-node recycling", async ({ page }) => {
  await fixture(page, "table");
  await page.route("https://fixture.invalid/table.svg", route => route.fulfill({ contentType: "image/svg+xml", body: svg }));
  await page.locator("img").first().evaluate((img: HTMLImageElement) => { img.src = "https://fixture.invalid/table.svg"; });
  await expect.poll(() => page.locator("img").first().evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await page.evaluate(installThumbnailProbe, { density: "table" } as const);
  await sampleFrames(page);
  await page.locator("img").first().evaluate((img: HTMLImageElement) => { img.style.marginLeft = "80px"; });
  await sampleFrames(page, 6);
  const metrics = await page.evaluate(() => (window as any).__kupua_thumbnailProbe.stop());
  expect(metrics.layoutShiftSupported).toBe(1);
  expect(metrics.thumbnailShiftRawValue).toBeGreaterThan(0);
  expect(metrics.thumbnailShiftRawValue).toBeLessThanOrEqual(metrics.layoutShiftRawValue);
  expect(metrics.imageIdentityChanges).toBe(0);
  expect(metrics.logicalOrderChanges).toBe(0);
  await page.evaluate(() => (window as any).__kupua_thumbnailProbe.dispose());
});

for (const scenario of [
  { name: "temporary forward edge", mode: "seek", speed: 1000, offset: 10000, blocked: true },
  { name: "temporary backward edge", mode: "seek", speed: -1000, offset: 10000, blocked: true },
  { name: "true result end", mode: "seek", speed: 1000, offset: 69000, blocked: false },
  { name: "true result start", mode: "seek", speed: -1000, offset: 0, blocked: false },
  { name: "indexed physical edge", mode: "indexed", speed: 1000, offset: 10000, blocked: false },
]) {
  test(`controlled scroll bounds distinguish ${scenario.name}`, async ({ page }) => {
    await fixture(page);
    await page.evaluate(({ mode, speed, offset }) => {
      const region = document.querySelector<HTMLElement>('[role="region"]')!;
      region.dataset.scrubberMode = mode;
      region.scrollTop = speed > 0 ? region.scrollHeight - region.clientHeight : 0;
      (window as any).__kupua_store__ = { getState: () => ({
        bufferOffset: offset, results: Array(1000).fill(null), total: 70000,
      }) };
    }, scenario);
    const movement = await scrollAtSpeed(page, "grid", scenario.speed, 150, { measureBounds: true });
    expect(movement.physicalClampMs).toBeGreaterThanOrEqual(100);
    expect(movement.clampedDistancePx).toBeGreaterThanOrEqual(100);
    expect(movement.drivenDistancePx).toBe(0);
    if (scenario.blocked) expect(movement.bufferEdgeBlockedMs).toBeGreaterThanOrEqual(100);
    else expect(movement.bufferEdgeBlockedMs).toBe(0);
  });
}

test("controlled scroll bounds exclude free movement and idle input; default contract stays unchanged", async ({ page }) => {
  await fixture(page);
  await page.getByRole("region").evaluate(element => { element.dataset.scrubberMode = "indexed"; });
  const moving = await scrollAtSpeed(page, "grid", 500, 150, { measureBounds: true });
  expect(moving.physicalClampMs).toBe(0);
  expect(moving.bufferEdgeBlockedMs).toBe(0);
  expect(moving.drivenDistancePx).toBeGreaterThan(0);
  await page.getByRole("region").evaluate(element => { element.scrollTop = element.scrollHeight; });
  const idle = await scrollAtSpeed(page, "grid", 0, 150, { measureBounds: true });
  expect(idle.physicalClampMs).toBe(0);
  expect(idle.bufferEdgeBlockedMs).toBe(0);
  const existing = await scrollAtSpeed(page, "grid", 500, 50);
  expect(Object.keys(existing).sort()).toEqual([
    "commandedSpeedPxPerSec", "drivenDistancePx", "drivenDurationMs", "drivenFrames",
  ]);
});

test("controlled scroll bounds count only clipped travel and reject missing context", async ({ page }) => {
  await fixture(page);
  await expect(scrollAtSpeed(page, "grid", 1000, 150, { measureBounds: true })).rejects.toThrow("scroll regime");
  await page.getByRole("region").evaluate(element => {
    element.dataset.scrubberMode = "indexed";
    element.scrollTop = element.scrollHeight - element.clientHeight - 50;
    const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop")!;
    let clipped = 0;
    Object.defineProperty(element, "scrollTop", { configurable: true,
      get() { return descriptor.get!.call(element); },
      set(value: number) {
        clipped += Math.max(0, value - (element.scrollHeight - element.clientHeight));
        element.dataset.clippedInput = String(clipped);
        descriptor.set!.call(element, value);
      },
    });
  });
  const partial = await scrollAtSpeed(page, "grid", 1000, 150, { measureBounds: true });
  expect(partial.drivenDistancePx).toBeCloseTo(50, 0);
  const clipped = await page.getByRole("region").evaluate(element => {
    const value = Number(element.dataset.clippedInput);
    Reflect.deleteProperty(element, "scrollTop");
    return value;
  });
  expect(partial.clampedDistancePx).toBeCloseTo(clipped, 5);
  expect(partial.physicalClampMs).toBeCloseTo(clipped, 5);
  expect(partial.bufferEdgeBlockedMs).toBe(0);
  await page.getByRole("region").evaluate(element => { element.dataset.scrubberMode = "seek"; });
  await expect(scrollAtSpeed(page, "grid", 1000, 150, { measureBounds: true })).rejects.toThrow("buffer coverage");
});

for (const density of ["grid", "justified"] as const) {
  for (const mediaOrigin of ["https://fixture.invalid", "https://media.fixture.invalid"]) {
    test(`${density}: stopped viewport readiness ignores obsolete media at ${mediaOrigin}`, async ({ page }) => {
      await page.route("https://fixture.invalid/app", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><html></html>" }));
      await page.goto("https://fixture.invalid/app");
      await fixture(page, density);
      let releaseOld!: () => void;
      let releaseDestination!: () => void;
      const oldGate = new Promise<void>(resolve => { releaseOld = resolve; });
      const destinationGate = new Promise<void>(resolve => { releaseDestination = resolve; });
      let oldRequests = 0;
      let destinationRequests = 0;
      await page.route("https://fixture.invalid/obsolete.svg", async route => {
        oldRequests++;
        await oldGate;
        await route.fulfill({ contentType: "image/svg+xml", body: svg });
      });
      await page.route(`${mediaOrigin}/destination.svg`, async route => {
        destinationRequests++;
        await destinationGate;
        await route.fulfill({ contentType: "image/svg+xml", body: svg });
      });
      try {
        const stoppedAt = await page.evaluate(mediaOrigin => {
          const images = document.querySelectorAll("img");
          images[0].src = "https://fixture.invalid/obsolete.svg";
          images[1].src = `${mediaOrigin}/destination.svg`;
          document.querySelector('[role="region"]')!.scrollTop = 400;
          return performance.now();
        }, mediaOrigin);
        await expect.poll(() => oldRequests).toBe(1);
        await expect.poll(() => destinationRequests).toBe(1);
        const held = await visibleMediaReadiness(page, density, stoppedAt, 100);
        expect(held.mediaCensored).toBe(1);
        expect(held.mediaReadyMs).toBeNull();
        expect(held.failedMediaCount).toBe(0);
        expect(held.visibleMediaCount).toBe(1);
        releaseDestination();
        const ready = await visibleMediaReadiness(page, density, stoppedAt, 2000);
        expect(ready.mediaCensored).toBe(0);
        expect(ready.decodedMediaCount).toBe(1);
        expect(ready.mediaReadyMs).toBeGreaterThanOrEqual(100);
        expect(await page.locator("img").first().evaluate((image: HTMLImageElement) => image.complete)).toBe(false);
        expect(await page.locator("img").last().evaluate(image => image.closest("[data-image-id]")?.getAttribute("data-image-id"))).toBe("fixture-b");
        expect(destinationRequests).toBe(1);
      } finally {
        releaseDestination();
        releaseOld();
      }
    });
  }
}

test("dashboard distinguishes incompatible environments, sparse metrics and matched pairs", async ({ page }) => {
  const record = (density: string, value: number | null) => ({
    id: `D1-${density}`, density, workload: "scroll-cold", cacheClass: "fixture", resultRegime: "seek",
    profile: "fixture", completionBoundary: "fixture", scenarioRevision: 1, sampleCount: 4,
    contractKey: `fixture-${density}`, pairedContractKey: "fixture-pair",
    metrics: { pendingAreaRatioMean: { median: value, p95: value, sampleCount: value === null ? 0 : 4 } },
  });
  const entries = [
    { label: "Fixture <script>not executable</script>", timestamp: "2026-01-01", gitSha: "fixture", environmentCompatibilityKey: "first",
      metrics: { "D1-grid": record("grid", 0.1), "D1-justified": record("justified", 0.2) },
      pairs: [{ controlId: "D1-grid", candidateId: "D1-justified", contractKey: "fixture-pair" }] },
    { label: "Other environment", timestamp: "2026-01-02", gitSha: "fixture", environmentCompatibilityKey: "second",
      metrics: { "D1-grid": record("grid", null), "D1-justified": record("justified", 0.3) },
      pairs: [{ controlId: "D1-grid", candidateId: "D1-justified", contractKey: "incompatible" }] },
  ];
  await mountDensityDashboard(page, entries);
  await page.getByLabel("Environment", { exact: true }).selectOption("");
  await expect(page.locator("#measurements tr")).toHaveCount(4);
  await expect(page.locator("#measurements")).toContainText("unavailable");
  await expect(page.locator("#pairs tr")).toHaveCount(1);
  await expect(page.locator("#pairs")).toContainText("+10 pp");
  await expect(page.locator("#cards .card")).toHaveCount(2);
  await expect(page.locator("#cards .mark")).toHaveCount(3);
  await expect(page.locator("#cards")).toContainText("30%");
  const point = page.locator("#cards .mark").first();
  await point.hover();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await expect(page.getByRole("tooltip")).toContainText("10%");
  await expect(page.getByRole("tooltip")).toContainText("4/4 repetitions");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toBeHidden();
  await point.focus();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await expect(page.locator("#measurements script")).toHaveCount(0);
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(page.locator("#cards .series-line")).toHaveCount(0);
  await expect(page.locator("#cards")).toContainText("One campaign: baseline only, no trend yet");
  await page.getByText("Refine selection & diagnostics", { exact: true }).click();
  await page.getByLabel("Density", { exact: true }).selectOption("grid");
  await expect(page.locator("#measurements tr")).toHaveCount(2);
  await expect(page.locator("#cards .mark")).toHaveCount(1);
});

test("offscreen readiness has positive lead; no-data placeholders are not thumbnail downloads", async ({ page }) => {
  await fixture(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("https://fixture.invalid/offscreen.svg", async route => { await gate; await route.fulfill({ contentType: "image/svg+xml", body: svg }); });
  await page.locator("img").nth(1).evaluate((img: HTMLImageElement) => { img.src = "https://fixture.invalid/offscreen.svg"; });
  try {
    await page.evaluate(installThumbnailProbe, { density: "grid" } as const);
    await page.getByRole("region").evaluate(el => { el.scrollTop = 1; });
    await sampleFrames(page);
    release();
    await expect.poll(() => page.locator("img").nth(1).evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    await sampleFrames(page);
    const metrics = await page.evaluate(() => (window as any).__kupua_thumbnailProbe.stop());
    expect(metrics.readinessLeadPxMedian).toBeGreaterThan(0);
    expect(metrics.decodedReadinessLeadPxMedian).toBeGreaterThan(0);
    expect(metrics.lateReadyCount).toBe(0);
    await page.evaluate(() => (window as any).__kupua_thumbnailProbe.dispose());
    await page.getByRole("region").evaluate(el => {
      el.scrollTop = 0;
      el.innerHTML = '<div><div><div style="width:100px;height:100px"></div></div></div>';
    });
    await page.evaluate(installThumbnailProbe, { density: "grid" } as const);
    await sampleFrames(page);
    const placeholders = await page.evaluate(() => (window as any).__kupua_thumbnailProbe.stop());
    expect(placeholders.pendingAreaRatioMean).toBeGreaterThan(0);
    expect(placeholders.placeholderAreaRatioMean).toBeGreaterThan(0);
    expect(placeholders.thumbnailPendingAreaRatioMean).toBe(0);
    expect(placeholders.thumbnailExposureAreaMs).toBe(0);
  } finally {
    release();
    await page.evaluate(() => (window as any).__kupua_thumbnailProbe?.dispose());
  }
});

for (const active of [false, true]) {
  for (const density of ["grid", "table", "justified"] as const) {
    test(`density selection preserves caller operation order (${density}, active=${active})`, async () => {
      const operations: string[] = [];
      const button = {
        getAttribute: async (attribute: string) => {
          expect(attribute).toBe("aria-pressed");
          operations.push("read-pressed");
          return String(active);
        },
        click: async () => { operations.push("click"); },
      };
      const page = {
        getByRole: (role: string, options: { name: string; exact: boolean }) => {
          expect(role).toBe("button");
          expect(options).toEqual({ name: `${density[0].toUpperCase()}${density.slice(1)} view`, exact: true });
          operations.push("lookup");
          return button;
        },
        evaluate: async () => { operations.push("capture-generation"); return 7; },
        waitForFunction: async () => { operations.push("wait"); },
      } as unknown as Page;
      expect(await getDensityChangeButton(page, density)).toBe(active ? null : button);
      expect(operations).toEqual(["lookup", "read-pressed"]);
      operations.length = 0;
      await selectDensity(page, density);
      expect(operations).toEqual(["lookup", "read-pressed", ...(active ? [] : ["click"]), "wait"]);
      if (density === "justified") return;
      operations.length = 0;
      const helpers = new KupuaHelpers(page);
      helpers.waitForResults = async () => { operations.push("results"); };
      helpers.waitForExtendReady = async () => { operations.push("extend-ready"); };
      await (density === "grid" ? helpers.switchToGrid() : helpers.switchToTable());
      expect(operations).toEqual(["lookup", "read-pressed", ...(active ? []
        : ["capture-generation", "click", "wait", "results", "extend-ready"])]);
    });
  }
}

test("density selection guard rejects a missing exact control", async ({ page }) => {
  await fixture(page);
  await page.evaluate(() => {
    const button = document.createElement("button");
    button.setAttribute("aria-label", "Justified view extra");
    button.setAttribute("aria-pressed", "true");
    document.body.append(button);
  });
  page.setDefaultTimeout(150);
  await expect(getDensityChangeButton(page, "justified")).rejects.toThrow(/Timeout/);
});

for (const multiple of [false, true]) {
  test(`density selection retains region rejection (multiple=${multiple})`, async ({ page }) => {
    await fixture(page, "table");
    await page.evaluate(multiple => {
      const button = document.createElement("button");
      button.setAttribute("aria-label", "Justified view");
      button.setAttribute("aria-pressed", "true");
      document.body.append(button);
      if (multiple) {
        const region = document.createElement("div");
        region.setAttribute("role", "region");
        region.setAttribute("aria-label", "Image results justified");
        document.body.append(region);
      }
    }, multiple);
    page.setDefaultTimeout(150);
    expect(await getDensityChangeButton(page, "justified")).toBeNull();
    await expect(selectDensity(page, "justified")).rejects.toThrow(/Timeout/);
  });
}

test("density selection awaits caller-owned region acknowledgement", async () => {
  let release!: () => void;
  let notifyWaiting!: () => void;
  const acknowledgement = new Promise<void>(resolve => { release = resolve; });
  const waiting = new Promise<void>(resolve => { notifyWaiting = resolve; });
  const page = {
    getByRole: () => ({ getAttribute: async () => "true" }),
    waitForFunction: async () => { notifyWaiting(); await acknowledgement; },
  } as unknown as Page;
  let completed = false;
  const selection = selectDensity(page, "justified").then(() => { completed = true; });
  try {
    await waiting;
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(completed).toBe(false);
  } finally {
    release();
    await selection;
  }
  expect(completed).toBe(true);
});

test("density selection is idempotent and detail setup retains the paired identity", async ({ page }) => {
  await fixture(page);
  await page.evaluate(() => {
    const region = document.querySelector('[role="region"]')!;
    const old = region.innerHTML;
    region.innerHTML = '<div style="height:70px"></div>' + old;
    const toolbar = document.createElement("div");
    for (const density of ["grid", "table", "justified"]) {
      const button = document.createElement("button");
      button.setAttribute("aria-label", `${density[0].toUpperCase()}${density.slice(1)} view`);
      button.setAttribute("aria-pressed", String(density === "grid"));
      button.onclick = () => {
        (window as any).__clicks = ((window as any).__clicks ?? 0) + 1;
        const chosen = density !== "grid" && button.getAttribute("aria-pressed") === "true" ? "grid" : density;
        region.setAttribute("aria-label", `Image results ${chosen}`);
        for (const sibling of toolbar.children) {
          sibling.setAttribute("aria-pressed", String(sibling.getAttribute("aria-label") ===
            `${chosen[0].toUpperCase()}${chosen.slice(1)} view`));
        }
      };
      toolbar.append(button);
    }
    document.body.append(toolbar);
  });
  for (const density of ["table", "grid", "justified"] as const) {
    await selectDensity(page, density);
    await selectDensity(page, density);
    await expect(page.getByRole("region", { name: `Image results ${density}`, exact: true })).toBeVisible();
  }
  expect(await page.evaluate(() => (window as any).__clicks)).toBe(3);
  await electAnchor(page, "justified", true);
  expect(await page.evaluate(() => (window as any).__densityAnchor)).toBe("fixture-a");
  await page.evaluate(() => { (window as any).__densityAnchor = "not-present"; });
  await expect(electAnchor(page, "justified", true)).rejects.toThrow("No fully visible anchor");
});

test("only automatic constrained scrolling throttles, and failure restores transport/cache", async () => {
  for (const workload of ["scroll-cold", "scroll-warm", "table-transition", "detail-return", "seek", "reflow", "window-maintenance", "scroll-constrained"]) {
    let latency = 0;
    let cacheDisabled = false;
    const commands: string[] = [];
    const cdp = { send: async (command: string, options: { latency?: number; cacheDisabled?: boolean }) => {
      commands.push(command);
      if (options.latency !== undefined) latency = options.latency;
      if (options.cacheDisabled !== undefined) cacheDisabled = options.cacheDisabled;
    } } as unknown as CDPSession;
    expect(latency).toBe(0);
    await expect(withDensityScrollNetwork(cdp, workload, async () => {
      expect(latency).toBe(workload === "scroll-constrained" ? 80 : 0);
      expect(cacheDisabled).toBe(workload === "scroll-cold" || workload === "scroll-constrained");
      throw new Error("fixture observation failure");
    })).rejects.toThrow("fixture observation failure");
    expect(latency).toBe(0);
    expect(cacheDisabled).toBe(false);
    expect(commands).not.toContain("Network.clearBrowserCache");
  }
});

test("maintenance tail enters the base admission band without velocity lookahead", async ({ page }) => {
  const { scrollToDensityTail } = await import("./density-browser");
  await page.route("**/*", route => route.abort());
  await page.route("https://fixture.invalid/src/constants/tuning.ts", route => route.fulfill({ contentType: "text/javascript", body: "export const EXTEND_THRESHOLD = 50;" }));
  await page.route("https://fixture.invalid/src/lib/scroll-geometry-ref.ts", route => route.fulfill({ contentType: "text/javascript",
    body: "export function getLayoutGeometry(){return window.fixtureDensity === 'justified' ? {layout:{getItemRow:index=>({top:index*100})}} : {rowHeight:100,columns:1};}" }));
  await page.route("https://fixture.invalid/admission", route => route.fulfill({ contentType: "text/html",
    body: '<div data-scrubber-mode="seek"></div><div role="region" aria-label="Image results grid" style="height:300px;overflow:auto"><div style="height:500000px"></div></div>' }));
  for (const regime of ["indexed", "seek"]) for (const density of ["grid", "justified"] as const) {
    await page.goto("https://fixture.invalid/admission");
    await page.evaluate(({ regime, density }) => {
      (window as any).fixtureDensity = density;
      document.querySelector("[data-scrubber-mode]")!.setAttribute("data-scrubber-mode", regime);
      const el = document.querySelector('[role="region"]')!;
      el.setAttribute("aria-label", `Image results ${density}`);
      const state = { results: Array(1000), bufferOffset: 2000, _forwardEvictGeneration: 0 };
      (window as any).__kupua_store__ = { getState: () => state };
      el.addEventListener("scroll", () => {
        const lastVisible = Math.ceil((el.scrollTop + el.clientHeight) / 100) - 1;
        const end = (regime === "indexed" ? 2000 : 0) + 1000;
        if (lastVisible >= end - 50) state._forwardEvictGeneration++;
      });
    }, { regime, density });
    await scrollToDensityTail(page, density);
    await expect.poll(() => page.evaluate(() => (window as any).__kupua_store__.getState()._forwardEvictGeneration),
      { timeout: 1000, message: `${regime}/${density}: tail must enter minimum admission band` }).toBeGreaterThan(0);
  }
});

test("dashboard handles empty history and exposes curated keyboard navigation with units", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await mountDensityDashboard(page, []);
  await expect(page.getByRole("status")).toContainText("No density history");
  await expect(page.getByRole("button", { name: "Next metric", exact: true })).toBeDisabled();
  const value = (median: number) => ({ median, p95: median, sampleCount: 4 });
  const makeRecord = (density: string) => ({ id: `D1-${density}`, density, workload: "scroll-cold", cacheClass: "fixture", resultRegime: "seek",
    profile: "density-v2-1200pxs-unthrottled", scenarioRevision: 2, completionBoundary: "fixture", sampleCount: 4,
    contractKey: `same-${density}`, pairedContractKey: "same-pair", metrics: {
      thumbnailPendingAreaRatioMean: value(.02), thumbnailPendingAreaRatioMax: value(.08),
      decodedReadinessLeadPxMedian: value(-120), diagnosticExampleCount: value(3),
    } });
  const metrics = { "D1-grid": makeRecord("grid"), "D1-justified": makeRecord("justified") };
  const entries = ["2026-01-01T12:00:00Z", "2026-01-02T12:00:00Z"].map(timestamp => ({
    timestamp, label: "Fixture", runs: 4, environmentCompatibilityKey: "same-env", environment: { dataMode: "direct-es", apiTopology: "none" }, metrics,
  }));
  await page.unrouteAll();
  await mountDensityDashboard(page, entries);
  await expect(page.getByLabel("Metric", { exact: true })).toHaveValue("thumbnailPendingAreaRatioMean");
  await expect(page.getByLabel("Metric guide")).toContainText("Average blank thumbnail area");
  await expect(page.locator("#cards")).toContainText("2%");
  await page.getByRole("button", { name: "Next metric", exact: true }).click();
  await expect(page.getByLabel("Metric", { exact: true })).toHaveValue("thumbnailPendingAreaRatioMax");
  await page.getByRole("heading", { name: "Density comparisons", exact: true }).click();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByLabel("Metric", { exact: true })).toHaveValue("decodedReadinessLeadPxMedian");
  await expect(page.locator("#cards")).toContainText("-120 px");
  await expect(page.getByLabel("Metric guide")).toContainText("Negative: already inside");
  await page.getByLabel("Environment", { exact: true }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByLabel("Metric", { exact: true })).toHaveValue("decodedReadinessLeadPxMedian");
  await page.getByRole("button", { name: "Previous metric", exact: true }).click();
  await expect(page.getByLabel("Metric", { exact: true })).toHaveValue("thumbnailPendingAreaRatioMax");
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(page.locator("#cards .series-line")).toHaveCount(2);
  await page.getByText("Refine selection & diagnostics", { exact: true }).click();
  await page.getByLabel("Include all recorded diagnostic metrics").check();
  await expect(page.getByLabel("Metric", { exact: true }).locator('option[value="diagnosticExampleCount"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("history keeps zero values but never bridges missing measurements", async ({ page }) => {
  const entries = [0, null, .03].map((value, index) => ({
    label: `Fixture ${index}`, timestamp: `2026-01-0${index + 1}T12:00:00Z`, runs: 4,
    environmentCompatibilityKey: "same", environment: { dataMode: "direct-es", apiTopology: "none" },
    metrics: { "D1-grid": { id: "D1-grid", density: "grid", workload: "scroll-cold", cacheClass: "fixture",
      resultRegime: "seek", profile: "density-v2-1200pxs-unthrottled", scenarioRevision: 2,
      completionBoundary: "fixture", sampleCount: 4, contractKey: "same-grid", pairedContractKey: "same-pair",
      metrics: value === null ? {} : { thumbnailPendingAreaRatioMean: { median: value, p95: value, sampleCount: 4 } },
    } },
  }));
  await mountDensityDashboard(page, entries);
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(page.locator("#cards .mark")).toHaveCount(2);
  await expect(page.locator("#cards .series-line")).toHaveCount(0);
  await expect(page.locator('#cards .mark[aria-label^="Grid: 0%"]')).toHaveCount(1);
  await expect(page.locator("#measurements")).toContainText("unavailable");
});
