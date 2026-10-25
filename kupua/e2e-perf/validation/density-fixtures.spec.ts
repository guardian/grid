import { test, expect, type Page, type CDPSession } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { heldImageServer } from "../../e2e/shared/held-image-fixture";
import { KupuaHelpers } from "../../e2e/shared/helpers";
import { getDensityChangeButton } from "../../e2e/shared/density-selection";
import { installThumbnailProbe } from "../thumbnail-probe.mjs";
import { selectDensity, electAnchor, waitForPlacement, visibleMediaReadiness, scrollAtSpeed, withDensityScrollNetwork, measureDensityRecovery } from "../density-browser";
import { DENSITY_SCENARIOS, validateDensityRecord } from "../density-reporting.mjs";
import { createRequestProbe } from "../network-probe.mjs";
import * as densityDrivers from "../density-browser";
import { DENSITY_PRESSURE_STEPS, summarizeDensityPressure } from "../density-pressure.mjs";
import { AUTH_REQUIRED_MARKER, createPerfAuthGuard } from "../auth-failure.mjs";

for (const failure of [401, 419, "login"] as const) {
  test(`perf authentication guard recognizes routed browser ${failure}`, async ({ page }) => {
    let apiStatus = 502;
    let redirectToLogin = false;
    const server = createServer((request, response) => {
      const path = new URL(request.url ?? "/", "http://fixture.invalid").pathname;
      if (path === "/api/images") {
        response.writeHead(apiStatus, { "Content-Type": "application/json" });
        response.end("{}");
      } else if (path === "/search" && redirectToLogin) {
        response.writeHead(302, { location: "/login?private-marker=1" });
        response.end();
      } else {
        response.writeHead(200, { "Content-Type": "text/html" });
        response.end("<!doctype html><title>Auth fixture</title>");
      }
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Auth fixture did not bind loopback");
    const origin = `http://127.0.0.1:${address.port}`;
    await page.route("**/*", route => {
      const url = new URL(route.request().url());
      return url.origin === origin ? route.continue() : route.abort();
    });
    const notices: string[] = [];
    const guard = createPerfAuthGuard(page, {
      appBaseUrl: origin, mediaApiBaseUrl: "https://api.fixture.invalid",
    }, marker => notices.push(marker));
    try {
      await page.goto(`${origin}/search`);
      await page.evaluate(() => fetch("/api/images").then(response => response.status));
      guard.assertAuthenticated();
      expect(notices).toEqual([]);
      if (failure === "login") {
        redirectToLogin = true;
        await page.goto(`${origin}/search`);
      } else {
        apiStatus = failure;
        await page.evaluate(() => fetch("/api/images").then(response => response.status));
      }
      await expect.poll(() => notices.length).toBe(1);
      expect(notices).toEqual([AUTH_REQUIRED_MARKER]);
      expect(() => guard.assertAuthenticated()).toThrow("Perf authentication required");
    } finally {
      guard.dispose();
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
}

const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="blue"/></svg>';

test("F2 native pending image cancellation and same-element re-admission", async ({ page }) => {
  const server = await heldImageServer();
  try {
    await page.goto(server.origin);
    await page.evaluate(() => {
      const image = new Image(100, 100);
      const probe = { image, errors: 0, loads: 0 };
      image.onerror = () => { probe.errors++; image.style.display = "none"; };
      image.onload = () => { probe.loads++; };
      image.src = "/image/native.svg";
      document.querySelector("#images")!.append(image);
      (window as any).__nativeCancel = probe;
    });
    await expect.poll(() => server.requests.length).toBe(1);
    await page.evaluate(() => (window as any).__nativeCancel.image.removeAttribute("src"));
    await expect.poll(() => server.requests[0].aborted, { timeout: 3000 }).toBe(true);
    await page.evaluate(() => { (window as any).__nativeCancel.image.src = "/image/native.svg"; });
    await expect.poll(() => server.requests.length).toBe(2);
    server.requests[1].release();
    await page.waitForFunction(() => {
      const image = (window as any).__nativeCancel.image;
      return image.complete && image.naturalWidth === 100;
    });
    const result = await page.evaluate(() => {
      const probe = (window as any).__nativeCancel;
      return { errors: probe.errors, loads: probe.loads, decodedSize: probe.image.naturalWidth,
        hiddenAfterReload: getComputedStyle(probe.image).display === "none" };
    });
    expect(result).toEqual({ errors: 0, loads: 1, decodedSize: 100, hiddenAfterReload: false });
    expect(server.requests[0].finished).toBe(false);
    expect(server.requests[1].finished).toBe(true);
    console.log(JSON.stringify({ fixture: "f2-native-cancel", cancelled: server.requests[0].aborted,
      requestCount: server.requests.length, ...result }));
  } finally { await server.close(); }
});

test("F2 native shared ownership and completed cache survive consumer release", async ({ page }) => {
  const server = await heldImageServer();
  try {
    await page.goto(server.origin);
    await page.evaluate(() => {
      const old = new Image(100, 100);
      const current = new Image(100, 100);
      old.src = current.src = "/image/shared.svg";
      document.querySelector("#images")!.append(old, current);
      (window as any).__sharedCancel = { old, current };
    });
    await expect.poll(() => server.requests.length).toBe(1);
    await page.evaluate(() => { (window as any).__sharedCancel.old.remove(); });
    await page.waitForTimeout(200);
    expect(server.requests[0].aborted).toBe(false);
    await page.evaluate(() => { (window as any).__sharedCancel.old.removeAttribute("src"); });
    await page.waitForTimeout(200);
    expect(server.requests).toHaveLength(1);
    expect(server.requests[0].aborted).toBe(false);
    server.requests[0].release();
    await page.waitForFunction(() => (window as any).__sharedCancel.current.naturalWidth === 100);
    await page.evaluate(() => {
      const probe = (window as any).__sharedCancel;
      probe.old.src = "/image/shared.svg";
      document.querySelector("#images")!.append(probe.old);
    });
    await page.waitForFunction(() => (window as any).__sharedCancel.old.naturalWidth === 100);
    expect(server.requests).toHaveLength(1);
    console.log(JSON.stringify({ fixture: "f2-native-shared", networkRequests: server.requests.length,
      sharedRequestAborted: server.requests[0].aborted, bothConsumersLoaded: true, completedCacheReused: true }));
  } finally { await server.close(); }
});

test("F2 stale cancellation decisions yield to demand source generation and completion", async ({ page }) => {
  const server = await heldImageServer();
  try {
    await page.goto(server.origin);
    await page.evaluate(() => {
      const image = new Image(100, 100);
      image.src = "/image/old.svg";
      document.querySelector("#images")!.append(image);
      const probe = { image, current: false, generation: 0, decision: { source: image.src, generation: 0 },
        decide: () => ({ source: image.src, generation: probe.generation }),
        cancel: () => {
          if (probe.current) return "current-demand";
          if (probe.decision.generation !== probe.generation) return "generation";
          if (probe.decision.source !== image.src) return "source";
          if (image.complete) return "completed";
          image.removeAttribute("src");
          return "cancelled";
        } };
      (window as any).__cancelRace = probe;
    });
    await expect.poll(() => server.requests.length).toBe(1);
    const vetoes = await page.evaluate(() => {
      const probe = (window as any).__cancelRace;
      probe.current = true;
      const demand = probe.cancel();
      probe.current = false;
      probe.generation++;
      const generation = probe.cancel();
      probe.decision = probe.decide();
      probe.image.src = "/image/current.svg";
      return [demand, generation, probe.cancel()];
    });
    expect(vetoes).toEqual(["current-demand", "generation", "source"]);
    await expect.poll(() => server.requests.length).toBe(2);
    const oldAbortedBeforeReplacement = server.requests[0].aborted;
    expect(server.requests[1].aborted).toBe(false);
    await page.evaluate(() => { const probe = (window as any).__cancelRace; probe.decision = probe.decide(); });
    server.requests[1].release();
    await page.waitForFunction(() => (window as any).__cancelRace.image.naturalWidth === 100);
    expect(await page.evaluate(() => (window as any).__cancelRace.cancel())).toBe("completed");
    expect(server.requests).toHaveLength(2);
    console.log(JSON.stringify({ fixture: "f2-cancel-races", vetoes: [...vetoes, "completed"],
      oldAbortedBeforeReplacement, oldAbortedAfterReplacement: server.requests[0].aborted,
      currentRequestAborted: server.requests[1].aborted, requestCount: server.requests.length }));
  } finally { await server.close(); }
});

test("F2 native cancellation releases HTTP1 capacity for visible media and metadata", async ({ page }) => {
  const server = await heldImageServer();
  try {
    await page.goto(server.origin);
    await page.evaluate(() => {
      const background = Array.from({ length: 6 }, (_, index) => {
        const image = new Image(100, 100);
        image.src = `/image/background-${index}.svg`;
        return image;
      });
      (window as any).__capacity = { background, dataReady: false, current: null, error: false };
    });
    await expect.poll(() => server.requests.length).toBe(6);
    await page.evaluate(() => {
      const probe = (window as any).__capacity;
      const current = new Image(100, 100);
      current.fetchPriority = "high";
      current.src = "/image/current.svg";
      document.querySelector("#images")!.append(current);
      probe.current = current;
      fetch("/data/current").then(response => response.json()).then(() => { probe.dataReady = true; })
        .catch(() => { probe.error = true; });
    });
    await page.waitForTimeout(200);
    expect(server.requests).toHaveLength(6);
    expect(await page.evaluate(() => (window as any).__capacity.current.complete)).toBe(false);
    await page.evaluate(() => {
      for (const image of (window as any).__capacity.background.slice(0, 2)) image.removeAttribute("src");
    });
    await expect.poll(() => server.requests.length).toBe(8);
    expect(server.requests.slice(0, 6).filter(request => request.aborted)).toHaveLength(2);
    for (const request of server.requests.slice(6)) request.release();
    await page.waitForFunction(() => {
      const probe = (window as any).__capacity;
      return probe.current.naturalWidth === 100 && probe.dataReady && !probe.error;
    });
    expect(server.requests.slice(0, 6).filter(request => !request.aborted && !request.finished)).toHaveLength(4);
    console.log(JSON.stringify({ fixture: "f2-http1-capacity", occupiedConnections: 6,
      noCancellationObservationMs: 200, cancelled: 2, remainingHeld: 4, visibleReady: true, metadataReady: true }));
  } finally { await server.close(); }
});

test("F2 reserved HTTP1 capacity admits visible media and metadata without cancellation", async ({ page }) => {
  const server = await heldImageServer();
  try {
    await page.goto(server.origin);
    await page.evaluate(() => {
      const background = Array.from({ length: 4 }, (_, index) => {
        const image = new Image(100, 100);
        image.src = `/image/background-${index}.svg`;
        return image;
      });
      (window as any).__reservedCapacity = { background, current: null, dataReady: false };
    });
    await expect.poll(() => server.requests.length).toBe(4);
    await page.evaluate(() => {
      const probe = (window as any).__reservedCapacity;
      probe.current = new Image(100, 100);
      probe.current.fetchPriority = "high";
      probe.current.src = "/image/current.svg";
      document.querySelector("#images")!.append(probe.current);
      fetch("/data/current").then(response => response.json()).then(() => { probe.dataReady = true; });
    });
    await expect.poll(() => server.requests.length).toBe(6);
    for (const request of server.requests.slice(4)) request.release();
    await page.waitForFunction(() => {
      const probe = (window as any).__reservedCapacity;
      return probe.current.naturalWidth === 100 && probe.dataReady;
    });
    expect(server.requests.some(request => request.aborted)).toBe(false);
    expect(server.requests.slice(0, 4).every(request => !request.finished)).toBe(true);
    console.log(JSON.stringify({ fixture: "f2-http1-reserved", backgroundLimit: 4, remainingHeld: 4,
      visibleReady: true, metadataReady: true, cancellations: 0 }));
  } finally { await server.close(); }
});

test("F2 explicit fetch abort owns body consumption and blob display waits for completion", async ({ page }) => {
  const server = await heldImageServer();
  try {
    await page.goto(server.origin);
    await page.evaluate(() => {
      const controller = new AbortController();
      const probe = { controller, headers: false, abortName: null as string | null, blobReady: false, image: new Image(100, 100) };
      fetch("/image/fetch.svg", { signal: controller.signal }).then(response => {
        probe.headers = true;
        return response.blob();
      }).then(() => { probe.blobReady = true; }).catch(error => { probe.abortName = error.name; });
      (window as any).__fetchCancel = probe;
    });
    await expect.poll(() => server.requests.length).toBe(1);
    await page.waitForFunction(() => (window as any).__fetchCancel.headers);
    expect(await page.evaluate(() => (window as any).__fetchCancel.blobReady)).toBe(false);
    await page.evaluate(() => (window as any).__fetchCancel.controller.abort());
    await expect.poll(() => server.requests[0].aborted).toBe(true);
    await page.waitForFunction(() => (window as any).__fetchCancel.abortName === "AbortError");
    await page.evaluate(() => {
      const probe = (window as any).__fetchCancel;
      probe.headers = false;
      fetch("/image/fetch.svg").then(response => {
        probe.headers = true;
        return response.blob();
      }).then(blob => {
        probe.blobReady = true;
        probe.objectUrl = URL.createObjectURL(blob);
        probe.image.src = probe.objectUrl;
        document.querySelector("#images")!.append(probe.image);
      });
    });
    await expect.poll(() => server.requests.length).toBe(2);
    await page.waitForFunction(() => (window as any).__fetchCancel.headers);
    expect(await page.evaluate(() => (window as any).__fetchCancel.image.hasAttribute("src"))).toBe(false);
    server.requests[1].release();
    await page.waitForFunction(() => (window as any).__fetchCancel.image.naturalWidth === 100);
    await page.evaluate(() => URL.revokeObjectURL((window as any).__fetchCancel.objectUrl));
    console.log(JSON.stringify({ fixture: "f2-fetch-abort", aborted: true, bodyRejected: "AbortError",
      requestCount: server.requests.length, displayWaitedForBody: true, reacquired: true, objectUrlRevoked: true }));
  } finally { await server.close(); }
});

test("F2 native cross-origin media works where opaque fetch blobs cannot display", async ({ page }) => {
  const host = await heldImageServer();
  const media = await heldImageServer();
  try {
    await page.goto(host.origin);
    await page.evaluate(origin => {
      const image = new Image(100, 100);
      image.src = `${origin}/image/cross-origin.svg`;
      document.querySelector("#images")!.append(image);
      (window as any).__crossOrigin = { image, opaqueBlobSize: null, opaqueType: null };
    }, media.origin);
    await expect.poll(() => media.requests.length).toBe(1);
    media.requests[0].release();
    await page.waitForFunction(() => (window as any).__crossOrigin.image.naturalWidth === 100);
    await page.evaluate(origin => {
      fetch(`${origin}/image/opaque.svg`, { mode: "no-cors" }).then(async response => {
        const probe = (window as any).__crossOrigin;
        probe.opaqueType = response.type;
        probe.opaqueBlobSize = (await response.blob()).size;
      });
    }, media.origin);
    await expect.poll(() => media.requests.length).toBe(2);
    media.requests[1].release();
    await page.waitForFunction(() => (window as any).__crossOrigin.opaqueBlobSize !== null);
    const result = await page.evaluate(() => {
      const probe = (window as any).__crossOrigin;
      return { nativeWidth: probe.image.naturalWidth, opaqueType: probe.opaqueType, opaqueBlobSize: probe.opaqueBlobSize };
    });
    expect(result).toEqual({ nativeWidth: 100, opaqueType: "opaque", opaqueBlobSize: 0 });
    console.log(JSON.stringify({ fixture: "f2-cross-origin", ...result }));
  } finally { await host.close(); await media.close(); }
});

test("F2 current S3 proxy continues upstream work and duplicates an uncached reacquisition", async ({ page }) => {
  const host = await heldImageServer();
  const source = readFileSync(new URL("../../scripts/s3-proxy.mjs", import.meta.url), "utf8");
  const start = source.indexOf("async function handleRequest(req, res)");
  const end = source.indexOf("\nconst server = createServer(handleRequest);", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  const upstream: { release: () => void; bodyCompleted: boolean; abortSignalSupplied: boolean }[] = [];
  const cache = new Map();
  const s3 = { send: async (_command: unknown, options?: { abortSignal?: AbortSignal }) => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const request = { release, bodyCompleted: false, abortSignalSupplied: Boolean(options?.abortSignal) };
    upstream.push(request);
    return { ContentType: "image/svg+xml", Body: (async function* () {
      await gate;
      request.bodyCompleted = true;
      yield Buffer.from(svg);
    })() };
  } };
  const handler = new Function("s3", "GetObjectCommand", "cache", "THUMB_BUCKET", "IMAGE_BUCKET", "PORT", "CACHE_TTL_MS", "evictStale", "idToS3Key",
    `${source.slice(start, end)}\nreturn handleRequest;`)(s3, class {}, cache, "fixture-thumb", "fixture-image", 0, 600000, () => {}, (identity: string) => identity);
  let clientClosedBeforeCompletion = 0;
  const proxy = createServer((request, response) => {
    response.on("close", () => { if (!response.writableFinished) clientClosedBeforeCompletion++; });
    void handler(request, response);
  });
  await new Promise<void>(resolve => proxy.listen(0, "127.0.0.1", resolve));
  const address = proxy.address();
  if (!address || typeof address === "string") throw new Error("Fixture proxy has no address");
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    await page.goto(host.origin);
    await page.evaluate(origin => {
      const image = new Image(100, 100);
      image.src = `${origin}/s3/thumb/abcdef`;
      document.querySelector("#images")!.append(image);
      (window as any).__proxyCancel = { image, source: image.src };
    }, origin);
    await expect.poll(() => upstream.length).toBe(1);
    await page.evaluate(() => (window as any).__proxyCancel.image.removeAttribute("src"));
    await expect.poll(() => clientClosedBeforeCompletion).toBe(1);
    expect(upstream[0].abortSignalSupplied).toBe(false);
    expect(upstream[0].bodyCompleted).toBe(false);
    await page.evaluate(() => { const probe = (window as any).__proxyCancel; probe.image.src = probe.source; });
    await expect.poll(() => upstream.length).toBe(2);
    upstream[0].release();
    await expect.poll(() => cache.size).toBe(1);
    expect(upstream[0].bodyCompleted).toBe(true);
    upstream[1].release();
    await page.waitForFunction(() => (window as any).__proxyCancel.image.naturalWidth === 100);
    const cached = await fetch(`${origin}/s3/thumb/abcdef`);
    expect(cached.headers.get("x-cache")).toBe("HIT");
    await cached.arrayBuffer();
    expect(upstream).toHaveLength(2);
    console.log(JSON.stringify({ fixture: "f2-proxy-boundary", clientClosedBeforeCompletion,
      upstreamCalls: upstream.length, abortSignalSupplied: false, abortedClientStillPopulatedCache: true,
      reacquisitionDuplicatedPendingWork: true, completedCacheHit: true }));
  } finally {
    for (const request of upstream) request.release();
    proxy.closeAllConnections();
    await new Promise<void>((resolve, reject) => proxy.close(error => error ? reject(error) : resolve()));
    await host.close();
  }
});

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

async function mountDensityDashboard(page: Page, entries: unknown[], measurements = true) {
  await page.route("**/*", route => route.abort());
  await page.route("https://fixture.invalid/campaign-comparison.js", route => route.fulfill({ contentType: "text/javascript", body: readFileSync(new URL("../results/campaign-comparison.js", import.meta.url), "utf8") }));
  await page.route("https://fixture.invalid/density-log.js", route => route.fulfill({ contentType: "text/javascript", body: `window.__DENSITY_LOG__=${JSON.stringify({ entries })}` }));
  await page.route("https://fixture.invalid/density-dashboard.js", route => route.fulfill({ contentType: "text/javascript", body: readFileSync(new URL("../results/density-dashboard.js", import.meta.url), "utf8") }));
  await page.route("https://fixture.invalid/dashboard", route => route.fulfill({ contentType: "text/html", body: readFileSync(new URL("../results/density-graphs.html", import.meta.url), "utf8") }));
  await page.goto("https://fixture.invalid/dashboard");
  if (measurements) {
    await page.getByRole("button", { name: "Measurements", exact: true }).click();
    await page.getByLabel("Campaign", { exact: true }).selectOption("");
  }
}

async function sampleFrames(page: Page, count = 4) {
  await page.evaluate(async count => { for (let i = 0; i < count; i++) await new Promise(requestAnimationFrame); }, count);
}

for (const density of ["grid", "justified", "table"] as const) {
  test(`${density}: journey calibration detects common motion, resize, source and hidden media`, async ({ page }) => {
    await fixture(page, density);
    await page.evaluate(({ density, svg }) => {
      const region = document.querySelector<HTMLElement>(`[aria-label="Image results ${density}"]`)!;
      region.dataset.scrubberMode = "seek";
      region.innerHTML = `<div id="cohort" style="position:relative;height:10000px">${Array.from({ length: 100 }, (_, index) =>
        `<div ${density === "table" ? 'role="row"' : 'data-grid-cell'} data-image-id="fixture-${index}" style="position:absolute;left:${index % 2 * 120}px;top:${Math.floor(index / 2) * 100}px;width:100px;height:100px"><div class="slot"><img src="data:image/svg+xml,${encodeURIComponent(svg)}"></div></div>`).join("")}</div>`;
      const state = { params: {}, results: Array(200), bufferOffset: 1000, total: 70000,
        imagePositions: new Map(Array.from({ length: 100 }, (_, index) => [`fixture-${index}`, 1000 + index])) };
      (window as any).__kupua_store__ = { getState: () => state, subscribe: () => () => { (window as any).__journeyUnsubscribed = true; } };
    }, { density, svg });
    await sampleFrames(page);
    await page.evaluate(densityDrivers.installDensityJourney, { density, direction: 1 as const });
    let metrics = await page.evaluate(() => (window as any).__densityJourney.snapshot());
    expect(metrics.resultsPerPixel).toBeCloseTo(0.02, 5);
    await scrollAtSpeed(page, density, 300, 120, { measureBounds: true });
    await sampleFrames(page);
    metrics = await page.evaluate(() => (window as any).__densityJourney.snapshot());
    expect(metrics.retainedDisplacementMaxPx).toBeLessThan(1);
    expect(metrics.appliedInputDistancePx).toBeGreaterThan(20);
    await page.evaluate(() => {
      const region = document.querySelector<HTMLElement>('[role="region"]')!;
      const cohort = document.querySelector<HTMLElement>("#cohort")!;
      cohort.style.top = "20px";
      region.scrollTop += 20;
    });
    await sampleFrames(page);
    metrics = await page.evaluate(() => (window as any).__densityJourney.snapshot());
    expect(metrics.retainedDisplacementMaxPx).toBeLessThan(1);
    expect(metrics.compensationDistancePx).toBeGreaterThanOrEqual(20);
    await page.evaluate(() => { document.querySelector<HTMLElement>("#cohort")!.style.transform = "translateY(8px)"; });
    await sampleFrames(page);
    metrics = await page.evaluate(() => (window as any).__densityJourney.snapshot());
    expect(metrics.retainedDisplacementMaxPx).toBeGreaterThanOrEqual(7.9);
    await page.evaluate(() => {
      const cell = document.querySelector<HTMLElement>('[data-image-id="fixture-2"]')!;
      cell.style.width = "108px";
      const image = cell.querySelector("img")!;
      image.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10'/%3E";
      image.style.visibility = "hidden";
      image.style.transform = "translateX(16px)";
    });
    await sampleFrames(page);
    metrics = await page.evaluate(() => {
      const result = (window as any).__densityJourney.snapshot();
      (window as any).__densityJourney.dispose();
      return result;
    });
    expect(metrics.retainedResizeMaxPx).toBeGreaterThanOrEqual(8);
    expect(metrics.retainedDisplacementMaxPx).toBeGreaterThanOrEqual(16);
    expect(metrics.retainedSourceChanges).toBe(1);
    expect(metrics.retainedUnreadySamples).toBeGreaterThan(0);
    expect(metrics.refillCoverageComplete).toBe(0);
    expect(metrics.paintCaptureAvailable).toBe(0);
    expect(metrics.paintMismatchCount).toBeNull();
    expect(await page.evaluate(() => !(window as any).__densityJourney && (window as any).__journeyUnsubscribed)).toBe(true);
  });
}

test("request collector observes real CDP starts and carries an unfinished image across a phase", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/*", route => route.fulfill({ status: 404, body: "fixture only" }));
  await page.route("https://fixture.invalid/blank", route => route.fulfill({ contentType: "text/html", body: "<body></body>" }));
  await page.route("https://fixture.invalid/held.svg", async route => {
    await gate;
    await route.fulfill({ contentType: "image/svg+xml", body: svg });
  });
  await page.goto("https://fixture.invalid/blank");
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  const requests = createRequestProbe(cdp);
  try {
    await page.evaluate(() => { const image = new Image(); image.src = "/held.svg"; document.body.append(image); });
    await expect.poll(() => requests.snapshot().mediaRequestStarts).toBe(1);
    const actionEpoch = await page.evaluate(() => performance.timeOrigin + performance.now());
    requests.beginPhase();
    release();
    await expect.poll(() => requests.snapshot().mediaRequestsPending).toBe(0);
    const metrics = requests.snapshot();
    expect(metrics.mediaRequestsCarryIn).toBe(1);
    expect(metrics.mediaRequestStarts).toBe(0);
    expect(metrics.mediaRequestsCompleted).toBe(1);
    expect(requests.pendingAt("media", actionEpoch)).toBe(1);
    expect(JSON.stringify(metrics)).not.toContain("fixture.invalid");
  } finally { release(); requests.dispose(); await cdp.detach(); }
});

test("D10 records consecutive phase metrics and disposes its observers", async ({ page }) => {
  await fixture(page);
  const source = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  await page.getByRole("region").evaluate((region, source) => {
    region.setAttribute("data-scrubber-mode", "seek");
    region.innerHTML = Array.from({ length: 200 }, (_, index) =>
      `<div data-grid-cell data-image-id="fixture-${index}" style="height:100px"><div class="slot"><img src="${source}"></div></div>`).join("");
    region.scrollTop = 1000;
    const state = { loading: false, _browseNavigation: null, results: Array(1000), bufferOffset: 1000,
      total: 70000, _extendForwardInFlight: false, _extendBackwardInFlight: false };
    (window as any).__kupua_store__ = { getState: () => state };
  }, source);
  await sampleFrames(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  const requests = createRequestProbe(cdp);
  try {
    const metrics = await densityDrivers.measureDensityEndurance(page, "grid", requests, { phaseDurationMs: 120 });
    expect(metrics.endurancePhaseCount).toBe(3);
    expect(metrics.enduranceInterrupted).toBe(0);
    for (const prefix of ["early", "middle", "late"]) {
      expect(metrics[`${prefix}DrivenDistancePx`]).toBeGreaterThan(100);
      expect(metrics[`${prefix}RequestCaptureRevision`]).toBe(1);
      expect(metrics[`${prefix}MediaRequestsPending`]).toBe(0);
      expect(metrics[`${prefix}FrameP95Ms`]).toBeGreaterThan(0);
      expect(metrics[`${prefix}BoundsCaptureRevision`]).toBe(1);
      expect(metrics[`${prefix}BufferEdgeEpisodeCount`]).toBe(0);
      expect(metrics[`${prefix}BufferEdgeEpisodeCompletedMaxMs`]).toBeNull();
    }
    expect(await page.evaluate(() => Boolean((window as any).__kupua_thumbnailProbe))).toBe(false);
  } finally { requests.dispose(); await cdp.detach(); }
});

test("D11 clocks its own publication, placement and visible decode", async ({ page }) => {
  await fixture(page);
  await page.locator("img").evaluateAll((images, source) => {
    for (const image of images) image.setAttribute("src", source);
  }, `data:image/svg+xml,${encodeURIComponent(svg)}`);
  await page.evaluate(() => {
    const listeners = new Set<(next: any, previous: any) => void>();
    let state: any;
    const update = (next: any) => { const previous = state; state = next; for (const callback of listeners) callback(state, previous); };
    state = { loading: false, _browseNavigation: null, results: [{ id: "fixture-a" }], search: async () => {
      update({ ...state, loading: true });
      await new Promise(resolve => setTimeout(resolve, 40));
      update({ ...state, loading: false, results: [{ id: "fixture-a" }] });
    } };
    (window as any).__kupua_store__ = { getState: () => state, subscribe: (callback: (next: any, previous: any) => void) => {
      listeners.add(callback);
      return () => { listeners.delete(callback); (window as any).__refreshUnsubscribed = true; };
    } };
  });
  const result = await densityDrivers.measureSearchRefresh(page, "grid");
  expect(result.dataReadyMs).toBeGreaterThanOrEqual(30);
  expect(result.placementMs).toBeGreaterThanOrEqual(result.dataReadyMs);
  expect(result.mediaReadyMs).toBeGreaterThanOrEqual(result.placementMs);
  expect(result.mediaCensored).toBe(0);
  expect(await page.evaluate(() => (window as any).__refreshUnsubscribed && !(window as any).__densityRefresh)).toBe(true);
});

test("D11 rejects a refresh without publication and still releases its subscription", async ({ page }) => {
  await fixture(page);
  await page.evaluate(() => {
    const state = { loading: false, results: ["old"], search: async () => {} };
    (window as any).__kupua_store__ = { getState: () => state,
      subscribe: () => () => { (window as any).__refreshUnsubscribed = true; } };
  });
  await expect(densityDrivers.measureSearchRefresh(page, "grid")).rejects.toThrow("Refresh did not publish");
  expect(await page.evaluate(() => (window as any).__refreshUnsubscribed && !(window as any).__densityRefresh)).toBe(true);
});

test("visible-wait dashboard supports phase/action metrics and unavailable historical values", async ({ page }) => {
  const value = (median: number | null) => ({ median, p95: median, sampleCount: median === null ? 0 : 4 });
  await mountDensityDashboard(page, [{ label: "Measurement fixture", timestamp: "2026-10-18", environmentCompatibilityKey: "fixture",
    metrics: { "D10-grid": { id: "D10-grid", scenarioRevision: 1, density: "grid", workload: "scroll-endurance",
      profile: "density-v1-1200pxs-3x8s-endurance", cacheClass: "fixture", resultRegime: "seek", completionBoundary: "fixture",
      contractKey: "fixture-endurance", sampleCount: 4, metrics: { lateMediaRequestsPending: value(3),
        thumbnailVisibleWaitCompletedMaxMs: value(null), thumbnailVisibleWaitCensoredCount: value(2), busyDataReadyMs: value(125),
        lateDataBeforeSendMaxMs: value(250), busyDataSendToHeadersMaxMs: value(600),
        dataHeadersToCompleteMaxMs: value(null),
        refreshDataDeltaMs: value(-25), refreshComparisonCensored: value(0) } },
      "D1-grid": { id: "D1-grid", scenarioRevision: 3, density: "grid", workload: "scroll-forward",
        profile: "density-v3-100resultsps-10s-3phases-stability", cacheClass: "fixture", resultRegime: "seek",
        completionBoundary: "fixture", contractKey: "fixture-journey", sampleCount: 4,
        metrics: { achievedResultsPerSecond: value(98), retainedDisplacementMaxPx: value(8),
          paintMismatchCount: value(null), latePendingVisibleRatioMean: value(0.5),
          stabilitySampleTotalMs: value(20), refillCoverageComplete: value(1) } } } }]);
  await page.getByLabel("Metric", { exact: true }).selectOption("mediaRequestsPending");
  await expect(page.getByLabel("Phase", { exact: true })).toHaveValue("late");
  await expect(page.locator("#metric-title")).toContainText("Late");
  await expect(page.locator("#metric-title")).toContainText("Image requests still in flight");
  await page.getByText("Refine selection & diagnostics", { exact: true }).click();
  await page.getByLabel("Include all recorded diagnostic metrics").check();
  await page.getByLabel("Metric", { exact: true }).selectOption("thumbnailVisibleWaitCompletedMaxMs");
  await expect(page.locator("#metric-caution")).toContainText("censored");
  await expect(page.locator("#cards")).toContainText("unavailable");
  await page.getByLabel("Metric", { exact: true }).selectOption("dataReadyMs");
  await expect(page.getByLabel("Phase", { exact: true })).toHaveValue("busy");
  await expect(page.locator("#metric-title")).toContainText("Media-active");
  await expect(page.locator("#cards")).toContainText("125 ms");
  await page.getByLabel("Metric", { exact: true }).selectOption("refreshDataDeltaMs");
  await expect(page.locator("#cards")).toContainText("-25 ms");
  await expect(page.locator("#metric-caution")).toContainText("not a difference of campaign medians");
  await page.getByLabel("Metric", { exact: true }).selectOption("dataBeforeSendMaxMs");
  await expect(page.getByLabel("Phase", { exact: true })).toHaveValue("late");
  await expect(page.locator("#metric-title")).toContainText("Late");
  await expect(page.locator("#metric-caution")).toContainText("not pure queue time");
  await expect(page.locator("#cards")).toContainText("250 ms");
  await page.getByLabel("Metric", { exact: true }).selectOption("dataSendToHeadersMaxMs");
  await expect(page.getByLabel("Phase", { exact: true })).toHaveValue("busy");
  await expect(page.locator("#metric-title")).toContainText("Media-active");
  await expect(page.locator("#cards")).toContainText("600 ms");
  await expect(page.getByLabel("Metric", { exact: true }).locator('option[value="dataHeadersToCompleteMaxMs"]')).toHaveCount(0);
  await page.getByLabel("Include all recorded diagnostic metrics").uncheck();
  await page.getByLabel("Metric", { exact: true }).selectOption("achievedResultsPerSecond");
  await expect(page.locator("#cards")).toContainText("98 results/s");
  await page.getByLabel("Metric", { exact: true }).selectOption("retainedDisplacementMaxPx");
  await expect(page.locator("#metric-explanation")).toContainText("common-mode");
  await expect(page.locator("#cards")).toContainText("8 px");
  await page.getByLabel("Metric", { exact: true }).selectOption("pendingVisibleRatioMean");
  await expect(page.getByLabel("Phase", { exact: true })).toHaveValue("late");
  await expect(page.locator("#metric-caution")).toContainText("Table");
  await expect(page.getByLabel("Metric", { exact: true }).locator('option[value="paintMismatchCount"]')).toHaveCount(0);
});

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
  expect(metrics).toMatchObject({ boundsCaptureRevision: 1, bufferEdgeEpisodeCount: 1,
    bufferEdgeEpisodeCompletedCount: 0, bufferEdgeEpisodeCompletedMaxMs: null,
    bufferEdgeEpisodeCensoredCount: 1 });
  expect(await page.evaluate(() => (window as any).__recoveryUnsubscribed && !(window as any).__densityRecovery)).toBe(true);
});

test("D9 recovery and request cost are first-class dashboard metrics", async ({ page }) => {
  const value = (median: number) => ({ median, p95: median, sampleCount: 4 });
  await mountDensityDashboard(page, [{ label: "Recovery fixture", timestamp: "2026-10-17", environmentCompatibilityKey: "fixture",
    metrics: { "D9-grid": { id: "D9-grid", scenarioRevision: 1, density: "grid", workload: "burst-recovery",
      profile: "density-v1-4000pxs-3s-back-1.5s-forward-10s-recovery", cacheClass: "fixture", resultRegime: "seek",
      completionBoundary: "fixture", contractKey: "fixture-grid", sampleCount: 4,
      metrics: { bufferEdgeBlockedMs: value(250), stopDataReadyMs: value(20), stopMediaReadyMs: value(125),
        bufferEdgeEpisodeMaxMs: value(175), bufferEdgeEpisodeCensoredCount: value(1),
        placeholderAreaRatioMean: value(0.25),
        stopMediaCensored: value(0), backwardReadStarts: value(3), readStartsAfterStop: value(1) } } } }]);
  await page.getByLabel("Metric", { exact: true }).selectOption("bufferEdgeBlockedMs");
  await expect(page.locator("#metric-title")).toContainText("Input blocked at buffer edges");
  await expect(page.locator("#cards")).toContainText("D9");
  await expect(page.locator("#cards")).toContainText("250 ms");
  await page.getByLabel("Metric", { exact: true }).selectOption("stopMediaReadyMs");
  await expect(page.locator("#metric-explanation")).toContainText("Last commanded scroll");
  await expect(page.locator("#cards")).toContainText("125 ms");
  await page.getByText("Refine selection & diagnostics", { exact: true }).click();
  await page.getByLabel("Include all recorded diagnostic metrics").check();
  await page.getByLabel("Metric", { exact: true }).selectOption("readStartsAfterStop");
  await expect(page.locator("#metric-caution")).toContainText("not automatically wasted");
  await page.getByLabel("Include all recorded diagnostic metrics").uncheck();
  await page.getByLabel("Metric", { exact: true }).selectOption("bufferEdgeEpisodeMaxMs");
  await expect(page.locator("#metric-title")).toContainText("Longest observed buffer wall");
  await expect(page.locator("#metric-caution")).toContainText("censored");
  await expect(page.locator("#cards")).toContainText("175 ms");
  await page.getByLabel("Metric", { exact: true }).selectOption("placeholderAreaRatioMean");
  await expect(page.locator("#metric-title")).toContainText("Missing result-data area");
  await expect(page.locator("#cards")).toContainText(/25(?:\.0+)?\s*%/);
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

for (const failure of ["container", "anchor", "focus", "loading", "navigation", "pending-focus", "offscreen", "geometry"] as const) {
  test(`placement timeout witness distinguishes ${failure} without private data`, async ({ page }) => {
    await fixture(page);
    await page.evaluate(failure => {
      const anchor = "private-media-identity";
      (window as any).__densityAnchor = anchor;
      (window as any).__densitySource = { id: anchor, params: "private-query" };
      const state = { loading: failure === "loading", _browseNavigation: failure === "navigation" ? "private-navigation" : null,
        _pendingFocusDelta: failure === "pending-focus" ? 1 : null,
        focusedImageId: failure === "focus" ? "other-private-identity" : anchor,
        imagePositions: new Map([[anchor, 123]]), error: "https://private.invalid/signed?Signature=secret" };
      (window as any).__kupua_store__ = { getState: () => state };
      const container = document.querySelector('[aria-label="Image results grid"]')!;
      const cell = container.querySelector<HTMLElement>('[data-image-id="fixture-a"]')!;
      cell.dataset.imageId = anchor;
      if (failure === "container") container.remove();
      if (failure === "anchor" || failure === "focus") cell.remove();
      if (failure === "offscreen") cell.style.transform = "translateY(10000px)";
      if (failure === "geometry") {
        const original = cell.getBoundingClientRect.bind(cell);
        let reads = 0;
        cell.getBoundingClientRect = () => {
          const rect = original();
          const shift = Math.floor(++reads / 2) % 2 * 8;
          return new DOMRect(rect.x, rect.y + shift, rect.width, rect.height);
        };
      }
    }, failure);
    const message = await waitForPlacement(page, "grid", true, undefined, 150, {
      workload: "scroll-backward", repetition: 2, destination: "justified", seekRequested: true,
    }).then(() => "unexpected success", error => String(error.message));
    expect(message).toContain("required identity before deadline");
    expect(message).toContain("; witness=");
    const witness = JSON.parse(message.split("; witness=")[1].split("\n")[0]);
    expect(witness.context).toMatchObject({ workload: "scroll-backward", repetition: 2, destination: "justified", seekRequested: true });
    expect(witness.sourceMatchesAnchor).toBe(true);
    expect(witness.focusMatchesAnchor).toBe(failure !== "focus");
    expect(witness.anchorInBuffer).toBe(true);
    expect(witness.containerPresent).toBe(failure !== "container");
    expect(witness.anchorInDom).toBe(!["container", "anchor", "focus"].includes(failure));
    expect(witness.loading).toBe(failure === "loading");
    expect(witness.navigationPending).toBe(failure === "navigation");
    expect(witness.focusDeltaPending).toBe(failure === "pending-focus");
    expect(witness.anchorIntersects).toBe(!["container", "anchor", "focus", "offscreen"].includes(failure));
    expect(witness.stableObservations).toBeLessThan(2);
    if (failure === "offscreen") expect(witness.anchorTop).toBeGreaterThan(witness.viewportHeight);
    expect(message).not.toMatch(/private|secret|Signature|https:|123/);
  });
}

test("placement timeout witness rejects unbounded context and success skips witness reads", async ({ page }) => {
  await fixture(page);
  await page.evaluate(() => {
    const state = { loading: false, _browseNavigation: null };
    Object.defineProperty(state, "focusedImageId", { get() { throw new Error("timeout-only field read during success"); } });
    (window as any).__kupua_store__ = { getState: () => state };
  });
  expect(await waitForPlacement(page, "grid", true, undefined, 1000)).toBeGreaterThanOrEqual(0);
  await page.evaluate(() => {
    (window as any).__kupua_store__ = { getState: () => ({ loading: false }) };
    (window as any).__densityAnchor = "missing-private-identity";
  });
  const message = await waitForPlacement(page, "grid", true, undefined, 150, {
    workload: "private-query", repetition: Infinity, destination: "https://private.invalid",
    stage: "private-stage", seekRequested: "private-identity", scrollRequested: "private-url",
  } as any).then(() => "unexpected success", error => String(error.message));
  const witness = JSON.parse(message.split("; witness=")[1].split("\n")[0]);
  expect(witness.context).toEqual({ workload: null, repetition: null, destination: null, stage: null,
    seekRequested: null, scrollRequested: null });
  expect(message).not.toMatch(/private|https:|Infinity/);
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
    expect(movement).toMatchObject({
      boundsCaptureRevision: 1,
      bufferEdgeEpisodeCount: scenario.blocked ? 1 : 0,
      bufferEdgeEpisodeCompletedCount: 0,
      bufferEdgeEpisodeCompletedMaxMs: null,
      bufferEdgeEpisodeCensoredCount: scenario.blocked ? 1 : 0,
      bufferEdgeEpisodeMaxMs: scenario.blocked ? expect.any(Number) : 0,
    });
  });
}

test("controlled scroll bounds close a released wall before thumbnails load", async ({ page }) => {
  await fixture(page);
  await page.evaluate(() => {
    const region = document.querySelector<HTMLElement>('[role="region"]')!;
    region.dataset.scrubberMode = "seek";
    region.scrollTop = region.scrollHeight - region.clientHeight;
    (window as any).__kupua_store__ = { getState: () => ({
      bufferOffset: 10000, results: Array(1000).fill(null), total: 70000,
    }) };
    (window as any).__releaseBoundary = setTimeout(() => {
      region.lastElementChild!.setAttribute("style", "height:2000px");
    }, 100);
  });
  try {
    const movement = await scrollAtSpeed(page, "grid", 1000, 300, { measureBounds: true });
    expect(movement).toMatchObject({ boundsCaptureRevision: 1, bufferEdgeEpisodeCount: 1,
      bufferEdgeEpisodeCompletedCount: 1, bufferEdgeEpisodeCensoredCount: 0,
      bufferEdgeEpisodeCompletedMaxMs: expect.any(Number) });
    expect(movement.bufferEdgeBlockedMs).toBeGreaterThan(0);
    expect(movement.drivenDistancePx).toBeGreaterThan(50);
    expect(await page.locator("img").evaluateAll(images => images.every(image =>
      image instanceof HTMLImageElement && image.naturalWidth === 0))).toBe(true);
  } finally {
    await page.evaluate(() => { clearTimeout((window as any).__releaseBoundary); delete (window as any).__releaseBoundary; });
  }
});

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

test("controlled scroll distance endpoint stops exactly in either direction without changing the deadline", async ({ page }) => {
  await fixture(page);
  await page.getByRole("region").evaluate(element => {
    element.dataset.scrubberMode = "indexed";
    element.scrollTop = 200;
  });
  const options = { measureBounds: true, maxDistancePx: 100 };
  for (const speed of [1000, -1000]) {
    const movement = await scrollAtSpeed(page, "grid", speed, 300, options);
    expect(movement.drivenDistancePx).toBe(Math.sign(speed) * 100);
    expect(movement.bufferEdgeBlockedMs).toBe(0);
  }
  await page.getByRole("region").evaluate(element => { element.scrollTop = 0; });
  const clipped = await scrollAtSpeed(page, "grid", -1000, 100, options);
  expect(clipped.drivenDistancePx).toBe(0);
  expect(clipped.physicalClampMs).toBeGreaterThan(0);
});

test("identity filmstrip detects wrong thumbnails and an eight-pixel displacement", async ({ page }) => {
  const palette = [[62, 32, 32], [32, 62, 32], [32, 32, 62]];
  const frames = await page.evaluate(palette => {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 100;
    const context = canvas.getContext("2d")!;
    return [0, 1, 2, 3].map(phase => {
      context.fillStyle = "white";
      context.fillRect(0, 0, 200, 100);
      for (const index of [0, 1]) {
        if (phase === 3 && index === 1) continue;
        const top = phase === 2 && index === 0 ? 8 : 0;
        const color = palette[phase === 1 && index === 1 ? 2 : index];
        context.fillStyle = `rgb(${color.join(",")})`;
        context.fillRect(index * 100, top, 80, 80);
        context.fillStyle = `rgb(${color.map(channel => 255 - channel).join(",")})`;
        context.fillRect(index * 100 + 40, top, 40, 80);
        context.fillStyle = "black";
        context.fillRect(index * 100 + 39, top, 3, 80);
        context.fillRect(index * 100, top + 39, 80, 3);
      }
      return { epochMs: phase, data: canvas.toDataURL("image/png").split(",")[1] };
    });
  }, palette);
  const result = await densityDrivers.analyzeIdentityFrames(page, frames, {
    width: 200, height: 100, palette,
    targets: [{ x: 20, checkX: 60, y: 20, paletteIndex: 0 }, { x: 120, checkX: 160, y: 20, paletteIndex: 1 }],
    anchor: { centerX: 40, centerY: 40, sampleX: 20, sampleY: 20 },
  });
  expect(result[0]).toMatchObject({ wrongIdentities: 0, unknownPixels: 0, anchorDx: 0, anchorDy: 0 });
  expect(result[1]).toMatchObject({ wrongIdentities: 1, unknownPixels: 0, anchorDx: 0, anchorDy: 0 });
  expect(result[1].wrongTargets).toEqual([{ index: 1, observedPaletteIndex: 2 }]);
  expect(result[2]).toMatchObject({ wrongIdentities: 0, unknownPixels: 0, anchorDx: 0, anchorDy: 8 });
  expect(result[3]).toMatchObject({ wrongIdentities: 0, unknownPixels: 1, unknownTargets: [1], anchorDx: 0, anchorDy: 0 });
});

test("controlled scroll step capture records applied input, not external compensation", async ({ page }) => {
  await fixture(page);
  await page.getByRole("region").evaluate(element => {
    element.dataset.scrubberMode = "indexed";
    element.scrollTop = 200;
    requestAnimationFrame(() => requestAnimationFrame(() => { element.scrollTop += 80; }));
  });
  const options = { measureBounds: true, maxDistancePx: 100, captureSteps: true };
  const movement = await scrollAtSpeed(page, "grid", 1000, 300, options);
  expect(movement.drivenDistancePx).toBe(100);
  const steps = (movement as typeof movement & { steps: { at: number; drivenDistancePx: number }[] }).steps;
  expect(steps).toHaveLength(movement.drivenFrames);
  expect(steps.at(-1)?.drivenDistancePx).toBe(100);
  expect(steps.every((step, index) => index === 0 || step.at >= steps[index - 1].at)).toBe(true);
  expect(await page.getByRole("region").evaluate(element => element.scrollTop)).toBe(380);
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
  await expect(page.locator("#measurements tr")).toHaveCount(1);
  await expect(page.locator("#cards")).not.toContainText("Other environment");
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
  const { scrollToDensityTail } = await import("../density-browser");
  await page.route("**/*", route => route.abort());
  await page.route("https://fixture.invalid/src/constants/tuning.ts", route => route.fulfill({ contentType: "text/javascript", body: "export const EXTEND_THRESHOLD = 50;" }));
  await page.route("https://fixture.invalid/src/lib/scroll-geometry-ref.ts", route => route.fulfill({ contentType: "text/javascript",
    body: `export function getLayoutGeometry(){return window.fixtureDensity === 'justified'
      ? {layout:{getItemRow:index=>({top:index*100})}}
      : {rowHeight:100,columns:4,itemOffset:window.fixtureRegime === 'indexed' ? 0 : window.fixtureOffset};}
      export function getItemLayoutRow(geometry,index){return 'layout' in geometry ? geometry.layout.getItemRow(index)
        : {top:Math.floor((index + geometry.itemOffset % geometry.columns) / geometry.columns) * geometry.rowHeight};}` }));
  await page.route("https://fixture.invalid/admission", route => route.fulfill({ contentType: "text/html",
    body: '<div data-scrubber-mode="seek"></div><div role="region" aria-label="Image results grid" style="height:300px;overflow:auto"><div style="height:500000px"></div></div>' }));
  for (const regime of ["indexed", "seek"]) for (const density of ["grid", "justified"] as const) for (const phase of [0, 1, 2, 3]) {
    const offset = 2000 + phase;
    await page.goto("https://fixture.invalid/admission");
    await page.evaluate(({ regime, density, offset }) => {
      (window as any).fixtureDensity = density;
      (window as any).fixtureRegime = regime;
      (window as any).fixtureOffset = offset;
      document.querySelector("[data-scrubber-mode]")!.setAttribute("data-scrubber-mode", regime);
      const el = document.querySelector('[role="region"]')!;
      el.setAttribute("aria-label", `Image results ${density}`);
      const state = { results: Array(1000), bufferOffset: offset, _forwardEvictGeneration: 0 };
      (window as any).__kupua_store__ = { getState: () => state };
      el.addEventListener("scroll", () => {
        const columns = density === "grid" ? 4 : 1;
        const origin = regime === "indexed" ? 0 : Math.floor(offset / columns) * columns;
        const lastVisible = Math.ceil((el.scrollTop + el.clientHeight) / 100) * columns - 1 + origin;
        if (lastVisible >= offset + 1000 - 50) state._forwardEvictGeneration++;
      });
    }, { regime, density, offset });
    await scrollToDensityTail(page, density);
    const columns = density === "grid" ? 4 : 1;
    const expectedRow = Math.floor((offset + 975) / columns) - (regime === "indexed" ? 0 : Math.floor(offset / columns));
    expect(await page.locator('[role="region"]').evaluate(el => el.scrollTop), `${regime}/${density}/phase ${phase}`).toBe(expectedRow * 100);
    await expect.poll(() => page.evaluate(() => (window as any).__kupua_store__.getState()._forwardEvictGeneration),
      { timeout: 1000, message: `${regime}/${density}/phase ${phase}: tail must enter minimum admission band` }).toBeGreaterThan(0);
  }
});

test("maintenance setup fills the exact capacity instead of accepting a column-short window", async ({ page }) => {
  const { prepareDensityMaintenance } = await import("../density-browser");
  await page.route("**/*", route => route.abort());
  await page.route("https://fixture.invalid/src/constants/tuning.ts", route => route.fulfill({ contentType: "text/javascript",
    body: "export const BUFFER_CAPACITY = 1000, PAGE_SIZE = 200, SEARCH_FETCH_COOLDOWN_MS = 0;" }));
  await page.route("https://fixture.invalid/src/lib/scroll-geometry-ref.ts", route => route.fulfill({ contentType: "text/javascript",
    body: "export function getLayoutGeometry(){return {rowHeight:100,columns:4,itemOffset:2001};}" }));
  await page.route("https://fixture.invalid/capacity", route => route.fulfill({ contentType: "text/html",
    body: '<div role="region" aria-label="Image results grid" style="height:300px"><div data-image-id="fixture" style="height:100px;width:100px"></div></div>' }));
  await page.goto("https://fixture.invalid/capacity");
  await page.evaluate(() => {
    let state = { results: Array(998), bufferOffset: 2001, reads: 0, extendForward: async (): Promise<void> => {
      state = { ...state, reads: state.reads + 1, results: Array(1000), bufferOffset: state.bufferOffset + 198 };
    } };
    (window as any).__kupua_store__ = { getState: () => state };
  });
  await prepareDensityMaintenance(page, "grid");
  expect(await page.evaluate(() => {
    const state = (window as any).__kupua_store__.getState();
    return { count: state.results.length, reads: state.reads };
  })).toEqual({ count: 1000, reads: 1 });
});

function northStarEntry() {
  const configurations = { grid: { rate: 100, pending: 0.2, frame: 1000 / 30, shift: 1, unready: 0 },
    justified: { rate: 100, pending: 0.1, frame: 1000 / 60, shift: 8, unready: 0 },
    table: { rate: 50, pending: 0, frame: 50, shift: 0, unready: 10 } };
  const metrics = Object.fromEntries(Object.entries(configurations).flatMap(([density, values]) =>
    ["scroll-forward", "scroll-backward"].map(workload => {
      const scenario = DENSITY_SCENARIOS.find(item => item.density === density && item.workload === workload)!;
      const raw: Record<string, number | null> = { journeyCaptureRevision: 1, journeyOverflow: 0,
        enduranceInterrupted: 0, refillCoverageComplete: 1, requestedResultsPerSecond: 100,
        achievedResultsPerSecond: values.rate, retainedDisplacementMaxPx: values.shift, retainedResizeMaxPx: 0,
        retainedComparisons: 100, retainedUnreadySamples: values.unready, stabilityCaptureRevision: 1,
        retainedSourceChanges: 0, stabilityObservationGapMaxMs: 32, paintCaptureAvailable: 0, paintMismatchCount: null,
        initialBufferCount: 201, initialRunwayResults: 90, resultsPerPixel: 0.02, priorJourneyVisibleRevisits: 4 };
      for (const prefix of ["early", "middle", "late"]) Object.assign(raw, {
        [`${prefix}PendingVisibleRatioMean`]: values.pending, [`${prefix}DrivenDurationMs`]: 3333,
        [`${prefix}BufferEdgeBlockedMs`]: 0, [`${prefix}FrameP95Ms`]: values.frame,
        [`${prefix}SevereFrameCount`]: 0, [`${prefix}FrameCount`]: 100, [`${prefix}TrackingOverflow`]: 0,
        [`${prefix}RegionDetached`]: 0, [`${prefix}FailedCount`]: 0, [`${prefix}MissingThumbnailAreaRatioMean`]: 0,
      });
      return [scenario.id, { ...scenario, scenarioRevision: 3,
        profile: "density-v3-100resultsps-10s-3phases-stability",
        cacheClass: "browser-cache-disabled-during-endurance-renderer-warm-proxy-uncontrolled",
        completionBoundary: "fresh-window-ten-second-directional-journey-three-phases", resultRegime: "seek", sampleCount: 4,
        pairedContractKey: workload, contractKey: `${workload}-${density}`,
        metrics: Object.fromEntries(Object.entries(raw).map(([key, value]) => [key,
          { median: value, p95: value, sampleCount: value === null ? 0 : 4 }])) }];
    })));
  return { label: "Revised fixture", timestamp: "2026-10-22T12:00:00Z", runs: 4,
    environmentCompatibilityKey: "fixture-environment", environment: { dataMode: "media-api", apiTopology: "local" }, metrics };
}

function pressureEntry() {
  const entry = northStarEntry();
  entry.label = "Pressure fixture";
  for (const record of Object.values(entry.metrics)) {
    const scenario = DENSITY_SCENARIOS.find(item => item.id === record.id)!;
    Object.assign(record, scenario);
    const raw: Record<string, number | null> = Object.fromEntries(Object.entries(record.metrics)
      .map(([key, value]) => [key, value.median]));
    Object.assign(raw, { timingCaptureRevision: 2, observerStopLagMs: 1, recoveryStartLagMs: 1, controllerReturnLagMs: 200,
      requestWindowCaptureRevision: 1, requestClockMissingCount: 0, stopDataCensored: 0, stopDataReadyMs: 50,
      stopMediaCensored: 0, stopMediaReadyMs: 800, stopVisibleMediaCount: 32, stopDecodedMediaCount: 32, stopFailedMediaCount: 0,
      postReadyCohortStable: 1, stopCohortChanged: 0, recoveryLimitMs: 4000, networkConstrained: 0 });
    for (const [index, prefix] of ["early", "middle", "late"].entries()) Object.assign(raw, {
      [prefix + "RequestedResultsPerSecond"]: DENSITY_PRESSURE_STEPS[index],
      [prefix + "AchievedResultsPerSecond"]: DENSITY_PRESSURE_STEPS[index] * raw.achievedResultsPerSecond! / 100,
      [prefix + "RequestWindowCaptureRevision"]: 1, [prefix + "RequestClockMissingCount"]: 0,
    });
    if (record.workload === "scroll-backward") {
      for (const key of ["pendingVisibleRatioMean", "drivenDurationMs", "bufferEdgeBlockedMs", "frameP95Ms", "severeFrameCount",
        "frameCount", "trackingOverflow", "regionDetached", "failedCount", "missingThumbnailAreaRatioMean"]) {
        raw["reversal" + key[0].toUpperCase() + key.slice(1)] = raw["middle" + key[0].toUpperCase() + key.slice(1)];
      }
      for (const key of ["requestedResultsPerSecond", "achievedResultsPerSecond", "retainedDisplacementMaxPx", "retainedResizeMaxPx",
        "retainedComparisons", "retainedUnreadySamples", "stabilityCaptureRevision", "retainedSourceChanges", "stabilityObservationGapMaxMs"]) {
        raw["reversal" + key[0].toUpperCase() + key.slice(1)] = raw[key];
      }
    }
    Object.assign(raw, summarizeDensityPressure(raw));
    record.pairedContractKey = "pressure-" + record.workload;
    record.contractKey = record.pairedContractKey + "-" + record.density;
    record.metrics = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key,
      { median: value, p95: value, sampleCount: value === null ? 0 : 4 }]));
  }
  for (const density of ["grid", "justified", "table"]) {
    const scenario = DENSITY_SCENARIOS.find(item => item.density === density && item.workload === "scroll-constrained")!;
    const record = { ...structuredClone(entry.metrics[`D1-${density}`]), ...scenario,
      pairedContractKey: "pressure-constrained", contractKey: `pressure-constrained-${density}` };
    record.metrics.networkConstrained = { median: 1, p95: 1, sampleCount: 4 };
    entry.metrics[scenario.id] = record;
  }
  return entry;
}

test("overview compares only matching contracts and retains exact historical context", async ({ page }) => {
  const baseline = pressureEntry();
  baseline.label = "Before";
  const current = structuredClone(baseline);
  current.label = "After";
  current.timestamp = "2026-10-23T12:00:00Z";
  current.metrics["D1-grid"].metrics.stopMediaReadyMs = { median: 400, p95: 500, sampleCount: 4 };
  current.metrics["D8-table"].contractKey = "new-contract";
  await mountDensityDashboard(page, [baseline, current], false);
  await expect(page.getByLabel("Compare with", { exact: true })).toHaveValue("0");
  await expect(page.locator("#comparison-status")).toContainText("8/9 comparable records");
  await expect(page.locator("#comparison-rows")).toContainText("-400 ms");
  await expect(page.locator("#comparison-rows tr")).toHaveCount(8);
  await page.locator("#comparison-rows button").first().click();
  await expect(page.getByRole("button", { name: "History", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Compare with", { exact: true })).toHaveValue("0");
  await expect(page.getByLabel("Workload", { exact: true })).toHaveValue("scroll-forward");
  await expect(page.locator("#cards")).toContainText("Before · comparison baseline");
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.getByLabel("Campaign", { exact: true }).selectOption("0");
  await expect(page.locator("#comparison-status")).toContainText("No earlier campaign selected");
  await expect(page.getByLabel("Compare with", { exact: true })).toHaveValue("");
});

test("density dashboard compares explicit delivery treatments without joining their histories", async ({ page }) => {
  const baseline = { ...pressureEntry(), gitSha: "fixture", environmentCompatibilityKey: "proxy", environment: {
    dataMode: "media-api", apiTopology: "deployed-test", mediaDelivery: "proxy", appBaseUrl: "https://fixture.invalid",
    browserName: "chromium", browserVersion: "fixture", os: { platform: "fixture", release: "fixture", architecture: "fixture" },
    viewport: { width: 1720, height: 960 }, screen: { width: 1720, height: 960 }, deviceScaleFactor: 2,
    headed: true, cpuThrottle: 0, cacheClass: "fixture", workers: 1, stableUntil: "2026-02-15", appSourceDirtyStateHash: "fixture",
  } };
  baseline.label = "Proxy baseline";
  const current = structuredClone(baseline);
  current.label = "Canonical candidate";
  current.environment.mediaDelivery = "canonical";
  current.environmentCompatibilityKey = "canonical";
  current.metrics["D1-grid"].metrics.stopMediaReadyMs = { median: 400, p95: 500, sampleCount: 4 };
  const incompatible = structuredClone(baseline);
  incompatible.label = "Different viewport";
  incompatible.environment.deviceScaleFactor = 1;
  incompatible.environmentCompatibilityKey = "different";
  await mountDensityDashboard(page, [incompatible, baseline, current], false);
  await expect(page.locator("#campaign-context")).toContainText("TEST API / canonical");
  await expect(page.locator("#comparison-status")).toContainText("9/9 comparable records");
  await expect(page.locator("#comparison-status")).toContainText("Changed mediaDelivery; recorded source fingerprints match; identical source not verified (untracked file contents not covered)");
  await expect(page.locator("#comparison-rows")).toContainText("-400 ms");
  await page.locator("#comparison-rows button").first().click();
  await expect(page.locator("#cards .selected-comparison").first()).toContainText("-400 ms");
  await expect(page.locator("#cards .series-line")).toHaveCount(0);
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.getByLabel("Compare with", { exact: true }).selectOption("0");
  await expect(page.locator("#comparison-status")).toContainText("0/9 comparable records");
  await expect(page.locator("#comparison-status")).toContainText("Different deviceScaleFactor");
});

test("dashboard excludes unmeasured probes but retains censored landing outcomes", async ({ page }) => {
  const entry = pressureEntry();
  const metrics = entry.metrics["D8-table"].metrics;
  metrics.stopMediaReadyMs = { median: null, p95: null, sampleCount: 0 };
  metrics.stopMediaCensored = { median: 1, p95: 1, sampleCount: 4 };
  metrics.recoveryObservationMs = { median: 4000, p95: 4005, sampleCount: 4 };
  await mountDensityDashboard(page, [entry], false);
  await expect(page.getByLabel("Constrained landing outcomes")).toContainText("Table: 0/4 stable landings");
  await expect(page.getByLabel("Constrained landing outcomes")).toContainText("Not decoded within 4,000 ms");
  await page.getByRole("button", { name: "Inspect load and landing for Table forward constrained", exact: true }).click();
  await expect(page.getByLabel("Metric", { exact: true })).toHaveValue("stopMediaReadyMs");
  await expect(page.locator("#cards svg")).toHaveCount(0);
  await expect(page.locator("#cards")).toContainText("0/4 observed");
  await expect(page.getByLabel("Metric", { exact: true }).locator('option[value="paintMismatchCount"]')).toHaveCount(0);
  await page.getByLabel("Find a measurement", { exact: true }).fill("paintMismatchCount");
  await expect(page.getByLabel("Metric", { exact: true }).locator("option")).toHaveCount(0);
});

test("overview puts rankings before diagnostics and uses Kupua theme", async ({ page }) => {
  await mountDensityDashboard(page, [pressureEntry()], false);
  await page.setViewportSize({ width: 1720, height: 960 });
  const appearance = await page.evaluate(() => {
    const theme = getComputedStyle(document.documentElement);
    return { background: theme.getPropertyValue("--bg").trim(), accent: theme.getPropertyValue("--accent").trim(),
      font: theme.fontFamily, rankings: document.querySelector("#overview-scores")!.getBoundingClientRect().top,
      pressure: document.querySelector("#pressure-panel")!.getBoundingClientRect().top };
  });
  expect(appearance.background).toBe("#333333");
  expect(appearance.accent).toBe("#00adee");
  expect(appearance.font).toContain("Open Sans");
  expect(appearance.rankings).toBeLessThan(500);
  expect(appearance.rankings).toBeLessThan(appearance.pressure);
  await expect(page.locator('#overview-scores section[aria-label="Useful progress"] li').first()).toHaveAttribute("id", "score-justified-progress");
});

test("north-star drilldown opens the exact limiting reversal", async ({ page }) => {
  const entry = pressureEntry();
  entry.metrics["D2-table"].metrics.reversalFrameP95Ms = { median: 100, p95: 120, sampleCount: 4 };
  await mountDensityDashboard(page, [entry], false);
  await page.getByRole("button", { name: "Inspect smooth movement for Table", exact: true }).click();
  await expect(page.getByLabel("Metric", { exact: true })).toHaveValue("frameP95Ms");
  await expect(page.getByLabel("Phase", { exact: true })).toHaveValue("reversal");
  await expect(page.getByLabel("Workload", { exact: true })).toHaveValue("scroll-backward");
  await expect(page.locator("#cards .card")).toHaveCount(1);
  await expect(page.locator("#cards")).toContainText("100 ms");
});

test("pressure overview shows fixed load bands and ordinary/constrained landing without inventing a winner", async ({ page }) => {
  await mountDensityDashboard(page, [pressureEntry()], false);
  await expect(page.getByRole("heading", { name: "Load and landing", exact: true })).toBeVisible();
  await expect(page.locator("#pressure-rows tr")).toHaveCount(9);
  const grid = page.locator("#pressure-grid-scroll-forward");
  await expect(grid).toContainText("30");
  await expect(grid).toContainText("100");
  await expect(grid).toContainText("200");
  await expect(grid).toContainText("4/4 stable decoded landings");
  await expect(grid).toContainText("Ready: 80%");
  await expect(grid).toContainText("Decode median: 800 ms");
  await expect(grid).not.toContainText("results/s ms");
  await expect(grid).toContainText("No progress breach through 200");
  await expect(page.locator("#pressure-table-scroll-constrained")).toContainText("Constrained");
  await expect(page.locator("#pressure-table-scroll-forward")).toContainText("Progress: gentle 30");
  await expect(page.locator("#score-grid-progress")).toHaveAttribute("data-score", "80");
  await expect(page.locator("#pressure-costs button").first()).toBeDisabled();
  await page.getByRole("button", { name: "Inspect load and landing for Grid forward ordinary", exact: true }).click();
  await expect(page.getByLabel("Metric", { exact: true })).toHaveValue("stopMediaReadyMs");
  await expect(page.getByLabel("Workload", { exact: true })).toHaveValue("scroll-forward");
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(grid).toContainText("Ready: 80%");
  await expect(grid).toContainText("Decode median: 800 ms");
});

test("pressure overview retains censored endpoints invalid clock tails and responsive layout", async ({ page }) => {
  const entry = pressureEntry();
  entry.metrics["D8-grid"].metrics.stopMediaCensored.p95 = 1;
  entry.metrics["D8-grid"].metrics.stopMediaReadyMs.sampleCount = 3;
  entry.metrics["D1-justified"].metrics.requestClockMissingCount.p95 = 1;
  await mountDensityDashboard(page, [entry], false);
  await expect(page.locator("#pressure-grid-scroll-constrained")).toContainText("3/4 stable decoded landings");
  await expect(page.locator("#pressure-grid-scroll-constrained")).toContainText("Censored");
  await expect(page.locator("#pressure-justified-scroll-forward")).toContainText("Invalid timing");
  await expect(page.locator("#score-justified-progress")).toHaveAttribute("data-score", "unavailable");
  for (const width of [390, 1720]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  }
});

test("north-star overview computes separate composites and opens scoped evidence", async ({ page }) => {
  await mountDensityDashboard(page, [northStarEntry()], false);
  await expect(page.getByLabel("North-star overview")).toBeVisible();
  await expect(page.getByLabel("Measurement explorer")).toBeHidden();
  for (const [density, progress, smoothness, stability] of [
    ["grid", "80", "50", "100"], ["justified", "90", "100", "12.5"], ["table", "50", "33.3", "90"],
  ]) {
    for (const [star, score] of [["progress", progress], ["smoothness", smoothness], ["stability", stability]]) {
      await expect(page.locator(`#score-${density}-${star}`)).toHaveAttribute("data-score", score);
    }
  }
  await expect(page.locator("#score-justified-progress")).toHaveAttribute("data-rank", "1");
  await expect(page.locator("#score-grid-stability")).toHaveAttribute("data-rank", "1");
  await expect(page.locator("#score-grid-stability")).toContainText("paint unmeasured");
  await page.getByRole("button", { name: "Inspect useful progress for Grid", exact: true }).click();
  await expect(page.getByLabel("Measurement explorer")).toBeVisible();
  await expect(page.getByLabel("Metric", { exact: true })).toHaveValue("pendingVisibleRatioMean");
  await expect(page.getByLabel("Phase", { exact: true })).toHaveValue("early");
  await expect(page.getByLabel("Density", { exact: true })).toHaveValue("grid");
  await expect(page.getByLabel("Workload", { exact: true })).toHaveValue("scroll-forward");
  await expect(page.locator("#cards .card")).toHaveCount(1);
  await page.getByLabel("Find a measurement", { exact: true }).fill("initialBufferCount");
  await expect(page.getByLabel("Metric", { exact: true })).toHaveValue("initialBufferCount");
  await expect(page.locator("#cards")).toContainText("201");
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(page.getByLabel("North-star overview")).toBeVisible();
});

test("north-star overview keeps incomplete, incompatible and sparse evidence unranked", async ({ page }) => {
  const entry = northStarEntry();
  entry.metrics["D1-grid"].metrics.latePendingVisibleRatioMean.sampleCount = 3;
  entry.metrics["D1-justified"].metrics.stabilityObservationGapMaxMs = { median: 300, p95: 300, sampleCount: 4 };
  entry.metrics["D1-table"].resultRegime = "indexed";
  await mountDensityDashboard(page, [entry], false);
  await expect(page.locator("#score-grid-progress")).toHaveAttribute("data-score", "unavailable");
  await expect(page.locator("#score-grid-smoothness")).toHaveAttribute("data-score", "50");
  await expect(page.locator("#score-justified-stability")).toHaveAttribute("data-score", "unavailable");
  await expect(page.locator("#score-justified-stability")).toContainText("Sampling gaps exceed 250ms");
  await expect(page.locator("#score-table-progress")).toHaveAttribute("data-rank", "unranked");
  await expect(page.locator("#score-table-progress")).toHaveAttribute("data-score", "50");
  await expect(page.locator("#score-justified-progress")).toHaveAttribute("data-rank", "unranked");
});

test("north-star overview preserves ties and rejects invalid capture tails", async ({ page }) => {
  const entry = northStarEntry();
  for (const prefix of ["D1", "D2"]) entry.metrics[`${prefix}-justified`].metrics = structuredClone(entry.metrics[`${prefix}-grid`].metrics);
  entry.metrics["D1-table"].metrics.journeyOverflow.p95 = 1;
  await mountDensityDashboard(page, [entry], false);
  await expect(page.locator("#score-grid-progress")).toContainText("Joint #1 of 2");
  await expect(page.locator("#score-justified-progress")).toContainText("Joint #1 of 2");
  for (const star of ["progress", "smoothness", "stability"]) await expect(page.locator(`#score-table-${star}`)).toHaveAttribute("data-score", "unavailable");
});

test("north-star overview never hides media or sampling failures behind medians", async ({ page }) => {
  const entry = northStarEntry();
  entry.metrics["D1-grid"].metrics.lateFailedCount.p95 = 1;
  entry.metrics["D1-justified"].metrics.retainedSourceChanges.p95 = 1;
  entry.metrics["D1-table"].metrics.stabilityObservationGapMaxMs.p95 = 300;
  await mountDensityDashboard(page, [entry], false);
  await expect(page.locator("#score-grid-progress")).toHaveAttribute("data-score", "unavailable");
  await expect(page.locator("#score-justified-stability")).toHaveAttribute("data-score", "unavailable");
  await expect(page.locator("#score-table-stability")).toHaveAttribute("data-score", "unavailable");
  await expect(page.locator("#score-grid-smoothness")).toHaveAttribute("data-score", "50");
});

test("north-star overview fits mobile and desktop and links observations precisely", async ({ page }) => {
  await mountDensityDashboard(page, [northStarEntry()], false);
  for (const width of [390, 1720]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth,
      cells: [...document.querySelectorAll<HTMLElement>("#overview-scores li")].map(cell => {
        const box = cell.getBoundingClientRect();
        return box.width > 0 && box.left >= 0 && box.right <= innerWidth && cell.scrollWidth <= cell.clientWidth + 1;
      }) }));
    expect(layout.overflow).toBe(false);
    expect(layout.cells).toHaveLength(9);
    expect(layout.cells.every(Boolean)).toBe(true);
  }
  await page.getByRole("button", { name: "Inspect Table slow-frame interval, worst phase", exact: true }).click();
  await expect(page.getByLabel("Metric", { exact: true })).toHaveValue("frameP95Ms");
  await expect(page.getByLabel("Workload", { exact: true })).toHaveValue("scroll-forward");
  await expect(page.getByLabel("Density", { exact: true })).toHaveValue("table");
  await expect(page.locator("#cards .card")).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 900 });
  expect(await page.evaluate(() => {
    const controls = [...document.querySelectorAll<HTMLElement>("#measurements-panel select, #measurements-panel input, #measurements-panel button")]
      .map(element => element.getBoundingClientRect()).filter(box => box.width > 0 && box.height > 0);
    return controls.some((box, index) => box.left < 0 || box.right > innerWidth || controls.slice(index + 1).some(other =>
      Math.min(box.right, other.right) - Math.max(box.left, other.left) > 1
      && Math.min(box.bottom, other.bottom) - Math.max(box.top, other.top) > 1));
  })).toBe(false);
});

test("north-star overview does not backfill legacy campaigns with revised scores", async ({ page }) => {
  const current = northStarEntry();
  const legacy = { ...structuredClone(current), label: "Legacy", timestamp: "2026-10-21T12:00:00Z" };
  for (const record of Object.values(legacy.metrics)) { record.scenarioRevision = 2; record.workload = "scroll-cold" as typeof record.workload; }
  await mountDensityDashboard(page, [legacy, current], false);
  await page.getByLabel("Campaign", { exact: true }).selectOption("0");
  await expect(page.locator("#overview-status")).toContainText("Rankings unavailable");
  await expect(page.locator("#score-grid-progress")).toHaveAttribute("data-score", "unavailable");
  await expect(page.locator("#overview-observations")).toContainText("Slow-frame interval");
  await page.getByLabel("Campaign", { exact: true }).selectOption("1");
  await expect(page.locator("#score-grid-progress")).toHaveAttribute("data-score", "80");
});

test("dashboard groups phase variants into one metric choice", async ({ page }) => {
  const value = (median: number) => ({ median, p95: median, sampleCount: 4 });
  await mountDensityDashboard(page, [{ label: "Grouped phases", timestamp: "2026-10-22", runs: 4,
    environmentCompatibilityKey: "fixture", metrics: {
      "D1-grid": { id: "D1-grid", density: "grid", workload: "scroll-forward", sampleCount: 4,
        pairedContractKey: "fixture", metrics: {
          earlyFrameP95Ms: value(17), middleFrameP95Ms: value(25), lateFrameP95Ms: value(40),
        } },
    } }]);
  await expect(page.getByLabel("Metric", { exact: true }).locator("option")).toHaveCount(1);
  await expect(page.getByLabel("Metric", { exact: true })).toHaveValue("frameP95Ms");
  await page.getByLabel("Phase", { exact: true }).selectOption("late");
  await expect(page.locator("#cards")).toContainText("40 ms");
  await page.getByLabel("Phase", { exact: true }).selectOption("early");
  await expect(page.locator("#cards")).toContainText("17 ms");
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
  await page.getByRole("heading", { name: /Density comparisons/ }).click();
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
