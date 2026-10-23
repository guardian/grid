import { test, expect, type CDPSession, type BrowserContext, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { electAnchor, establishDensitySource, restoreDensitySource, selectDensity, scrubDensityTo,
  prepareDensityMaintenance, scrollToDensityTail, waitForDensityEviction, waitForPlacement,
  waitForDensityMaintenanceCooldown, scrollAtSpeed,
  prepareDensityRecovery, measureDensityRecovery } from "../density-browser";
import { DENSITY_SCENARIOS, validateDensityRecord } from "../density-reporting.mjs";
import { createRequestProbe } from "../network-probe.mjs";
import { installThumbnailProbe } from "../thumbnail-probe.mjs";
import { heldImageServer } from "../../e2e/shared/held-image-fixture";
import * as densityDrivers from "../density-browser";
import type { ImageBox, JustifiedLayout } from "../../src/lib/justified-layout";
import type { LayoutRow } from "../../src/lib/scroll-geometry-ref";

async function installJourneyFixtureRoutes(context: BrowserContext) {
  await context.route("**/*", async route => {
    const url = new URL(route.request().url());
    const local = url.origin === "http://127.0.0.1:3041";
    if (local && url.pathname === "/src/lib/image-urls.ts") {
      const response = await route.fetch();
      const source = await response.text();
      const original = "if (!S3_PROXY_ENABLED) return undefined;";
      expect(source.split(original)).toHaveLength(2);
      return route.fulfill({ response, body: source.replace(original,
        'return "data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'40\' height=\'30\'%3E%3Cpath fill=\'blue\' d=\'M0 0h40v30H0z\'/%3E%3C/svg%3E#" + image.id;')
        .replace("S3_PROXY_ENABLED || SYNTHETIC_PREVIEW_ENABLED", "true") });
    }
    return local && !/^\/(es|api|grid-|s3|imgproxy|bedrock)/.test(url.pathname)
      ? route.continue() : route.fulfill({ status: 404, body: "isolated fixture" });
  });
}

async function installNativeJourneyRoutes(context: BrowserContext, origin: string) {
  await installJourneyFixtureRoutes(context);
  await context.route(`${origin}/**`, route => route.continue());
  await context.route("**/src/lib/image-urls.ts*", async route => {
    const response = await route.fetch();
    const source = await response.text();
    const marker = "if (!S3_PROXY_ENABLED) return undefined;";
    expect(source.split(marker)).toHaveLength(2);
    await route.fulfill({ response, body: source.replace(marker,
      `return ${JSON.stringify(origin)} + "/image/" + image.id + ".svg";`)
      .replace("S3_PROXY_ENABLED || SYNTHETIC_PREVIEW_ENABLED", "true") });
  });
}

for (const controllerDelayMs of [0, 250]) {
  test(`atomic journey clocks exclude controller return delay ${controllerDelayMs}ms`, async ({ page, context }) => {
    await installJourneyFixtureRoutes(context);
    await page.goto("/search?nonFree=true");
    await page.waitForFunction(() => Boolean((window as any).__kupua_store__));
    await page.evaluate(async () => {
      const path = "/src/dal/mock-data-source.ts";
      const { MockDataSource } = await import(path);
      const store = (window as any).__kupua_store__;
      store.setState({ dataSource: new MockDataSource(343) });
      await store.getState().search();
      await store.getState().extendForward();
    });
    await selectDensity(page, "grid");
    const ready = await densityDrivers.visibleMediaReadiness(page, "grid", await page.evaluate(() => performance.now()));
    expect(ready.mediaCensored).toBe(0);
    const delayedPage = { evaluate: async (callback: any, argument: any) => {
      const result = await page.evaluate(callback, argument);
      if (result && typeof result === "object" && "timingCaptureRevision" in result
        && result.timingCaptureRevision === 2 && controllerDelayMs) await page.waitForTimeout(controllerDelayMs);
      return result;
    } } as Page;
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    const requests = createRequestProbe(cdp);
    try {
      const result = await densityDrivers.measureDensityJourney(delayedPage, "grid", 1, requests,
        { durationMs: 240, loadSteps: [5, 10, 20], recoveryTimeoutMs: 800 });
      expect(result.timingCaptureRevision).toBe(2);
      expect(result.pressureCaptureRevision).toBe(1);
      expect(result.earlyRequestedResultsPerSecond).toBe(5);
      expect(result.middleRequestedResultsPerSecond).toBe(10);
      expect(result.lateRequestedResultsPerSecond).toBe(20);
      expect(result.observerStopLagMs).toBeLessThanOrEqual(25);
      expect(result.recoveryStartLagMs).toBeLessThanOrEqual(25);
      expect(result.stopDataCensored).toBe(0);
      expect(result.stopMediaCensored).toBe(0);
      expect(result.stopMediaReadyMs).toBeLessThan(200);
      expect(result.requestClockMissingCount).toBe(0);
      if (controllerDelayMs) expect(result.controllerReturnLagMs).toBeGreaterThanOrEqual(controllerDelayMs);
      expect(await page.evaluate(() => !(window as any).__densityJourney && !window.__kupua_thumbnailProbe)).toBe(true);
    } finally { requests.dispose(); await cdp.detach(); }
  });
}

test("atomic journey rejects a transient background interruption even after visibility returns", async ({ page, context }) => {
  await installJourneyFixtureRoutes(context);
  await page.goto("/search?nonFree=true");
  await page.waitForFunction(() => Boolean((window as any).__kupua_store__));
  await page.evaluate(async () => {
    const path = "/src/dal/mock-data-source.ts";
    const { MockDataSource } = await import(path);
    const store = (window as any).__kupua_store__;
    store.setState({ dataSource: new MockDataSource(343) });
    await store.getState().search();
    await store.getState().extendForward();
  });
  await selectDensity(page, "grid");
  await page.evaluate(() => {
    const own = Object.getOwnPropertyDescriptor(document, "visibilityState");
    let hidden = false;
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => hidden ? "hidden" : "visible" });
    const region = document.querySelector('[aria-label="Image results grid"]')!;
    const interrupt = () => {
      hidden = true;
      document.dispatchEvent(new Event("visibilitychange"));
      hidden = false;
      document.dispatchEvent(new Event("visibilitychange"));
    };
    region.addEventListener("scroll", interrupt, { once: true });
    (window as any).__restorePressureVisibility = () => {
      region.removeEventListener("scroll", interrupt);
      if (own) Object.defineProperty(document, "visibilityState", own);
      else delete (document as any).visibilityState;
      delete (window as any).__restorePressureVisibility;
    };
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  const requests = createRequestProbe(cdp);
  try {
    await expect(densityDrivers.measureDensityJourney(page, "grid", 1, requests,
      { durationMs: 600, loadSteps: [30, 100, 200], recoveryTimeoutMs: 800 })).rejects.toThrow(/uninterrupted foreground/);
  } finally {
    await page.evaluate(() => (window as any).__restorePressureVisibility?.());
    requests.dispose();
    await cdp.detach();
  }
});

for (const held of [false, true]) {
  test(`pressure journey distinguishes ${held ? "held then arriving" : "predecoded"} native images`, async ({ page, context }) => {
    let hold = held;
    const server = await heldImageServer({ hold: () => hold, limit: 2048 });
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    const requests = createRequestProbe(cdp);
    try {
      await installNativeJourneyRoutes(context, server.origin);
      await page.goto("/search?nonFree=true");
      await page.waitForFunction(() => Boolean((window as any).__kupua_store__));
      await page.evaluate(async () => {
        const path = "/src/dal/mock-data-source.ts";
        const { MockDataSource } = await import(path);
        const store = (window as any).__kupua_store__;
        store.setState({ dataSource: new MockDataSource(343) });
        await store.getState().search();
        await store.getState().extendForward();
      });
      await selectDensity(page, "grid");
      if (!held) await page.evaluate(async origin => {
        const images = (window as any).__kupua_store__.getState().results.map((item: { id: string }) => {
          const image = new Image();
          image.src = origin + "/image/" + item.id + ".svg";
          return image;
        });
        (window as any).__pressureWarmImages = images;
        await Promise.all(images.map((image: HTMLImageElement) => image.decode()));
      }, server.origin);
      const result = await densityDrivers.measureDensityJourney(page, "grid", 1, requests,
        { durationMs: 900, recoveryTimeoutMs: 600 });
      expect(result.stopDataCensored).toBe(0);
      expect(result.stopFailedMediaCount).toBe(0);
      expect(result.requestClockMissingCount).toBe(0);
      expect(result.stopMediaCensored).toBe(Number(held));
      if (held) {
        expect(result.stopMediaReadyMs).toBeNull();
        expect(result.latePendingVisibleRatioMean).toBeGreaterThan(0.9);
        expect(result.firstProgressStruggleStep).toBe(1);
        expect(result.mediaRequestsPending).toBeGreaterThan(0);
        hold = false;
        for (const request of server.requests) request.release();
        const recovered = await densityDrivers.visibleMediaReadiness(page, "grid", await page.evaluate(() => performance.now()));
        expect(recovered.mediaCensored).toBe(0);
        expect(recovered.decodedMediaCount).toBe(recovered.visibleMediaCount);
      } else {
        expect(result.stopDecodedMediaCount).toBe(result.stopVisibleMediaCount);
        expect(result.postReadyCohortStable).toBe(1);
      }
    } finally {
      await page.evaluate(() => { delete (window as any).__pressureWarmImages; }).catch(() => {});
      requests.dispose();
      await cdp.detach();
      await server.close();
    }
  });
}

test("constrained pressure profile records native traffic and a versioned current-image endpoint", async ({ page, context }) => {
  const server = await heldImageServer({ hold: () => false, limit: 2048 });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  const requests = createRequestProbe(cdp);
  try {
    await installNativeJourneyRoutes(context, server.origin);
    await page.goto("/search?nonFree=true");
    await page.waitForFunction(() => Boolean((window as any).__kupua_store__));
    await page.evaluate(async () => {
      const path = "/src/dal/mock-data-source.ts";
      const { MockDataSource } = await import(path);
      const store = (window as any).__kupua_store__;
      store.setState({ dataSource: new MockDataSource(70000) });
      await store.getState().search();
    });
    await establishDensitySource(page);
    await selectDensity(page, "grid");
    await prepareDensityRecovery(page, "grid");
    const initial = await densityDrivers.visibleMediaReadiness(page, "grid", await page.evaluate(() => performance.now()));
    expect(initial.mediaCensored).toBe(0);
    const result = await densityDrivers.withDensityScrollNetwork(cdp, "scroll-constrained", () =>
      densityDrivers.measureDensityJourney(page, "grid", 1, requests, { durationMs: 6000, networkConstrained: true }));
    expect(result.networkConstrained).toBe(1);
    expect(result.mediaRequestStarts).toBeGreaterThan(0);
    expect(result.requestClockMissingCount).toBe(0);
    expect(result.earlyRequestedResultsPerSecond).toBe(30);
    expect(result.middleRequestedResultsPerSecond).toBe(100);
    expect(result.lateRequestedResultsPerSecond).toBe(200);
    const scenario = DENSITY_SCENARIOS.find(item => item.id === "D8-grid")!;
    validateDensityRecord({ ...scenario, resultRegime: "seek", metrics: result });
  } finally {
    requests.dispose();
    await cdp.detach();
    await server.close();
  }
});

for (const [density, direction, total, mapPresent] of [
  ["grid", 1, 70000, false], ["grid", -1, 70000, false],
  ["justified", 1, 70000, false], ["justified", -1, 70000, false],
  ["table", 1, 70000, false], ["table", -1, 70000, false],
  ["grid", 1, 12000, true], ["justified", -1, 12000, false],
  ["table", 1, 12000, false], ["table", -1, 343, false],
] as const) {
  const deviceScaleFactor = density === "justified" && direction === 1 && total === 70000 ? 2 : 1;
  const journeyTest = test.extend({ deviceScaleFactor });
  journeyTest(`normalized journey ${density} ${direction} total=${total} map=${mapPresent} DPR=${deviceScaleFactor}`, async ({ page, context }) => {
    await installJourneyFixtureRoutes(context);
    await page.goto("/search?nonFree=true");
    await page.waitForFunction(() => Boolean((window as any).__kupua_store__));
    await page.evaluate(async total => {
      const path = "/src/dal/mock-data-source.ts";
      const { MockDataSource } = await import(path);
      const store = (window as any).__kupua_store__;
      store.setState({ dataSource: new MockDataSource(total) });
      await store.getState().search();
      if (total <= 1000) {
        await store.getState().extendForward();
      }
    }, total);
    await establishDensitySource(page);
    await selectDensity(page, density);
    if (total > 1000) await prepareDensityRecovery(page, density);
    else await page.evaluate(() => (window as any).__kupua_store__.getState().setFocusedImageId(null));
    if (total > 1000 && total <= 65000) {
      await page.waitForFunction(() => !(window as any).__kupua_store__.getState().positionMapLoading);
      if (!mapPresent) await page.evaluate(() => (window as any).__kupua_store__.setState({ positionMap: null }));
      expect(await page.evaluate(() => Boolean((window as any).__kupua_store__.getState().positionMap))).toBe(mapPresent);
    }
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    const requests = createRequestProbe(cdp);
    try {
      const result = await densityDrivers.measureDensityJourney(page, density, direction, requests,
        { durationMs: 9000, reverseDurationMs: direction === -1 ? 1500 : 0 });
      expect(result.enduranceInterrupted).toBe(0);
      expect(result.retainedComparisons).toBeGreaterThan(0);
      expect(result.journeyOverflow).toBe(0);
      expect(result.resultsPerPixel).toBeGreaterThan(0);
      expect(result.devicePixelRatio).toBe(deviceScaleFactor);
      expect(result.initialRunwayMs).toBeGreaterThanOrEqual(0);
      expect(result.stabilitySampleTotalMs).toBeLessThan(result.journeyDurationMs!);
      expect(result.stopDataCensored).toBe(0);
      expect(result.stopMediaCensored).toBe(0);
      expect(result.postReadyCohortStable).toBe(1);
      expect(result.earlyRequestedResultsPerSecond).toBe(30);
      expect(result.middleRequestedResultsPerSecond).toBe(100);
      expect(result.lateRequestedResultsPerSecond).toBe(200);
      if (direction === -1) expect(result.reversalDrivenDurationMs).toBeGreaterThan(0);
      if (total > 1000) {
        expect(result.refillCoverageComplete).toBe(1);
        expect(result[direction > 0 ? "appendPublications" : "prependPublications"]).toBeGreaterThanOrEqual(2);
        expect(result.progressedResults).toBeGreaterThan(200);
        if (total > 65000) expect(result.evictionPublications).toBeGreaterThanOrEqual(1);
        const scenario = DENSITY_SCENARIOS.find(item => item.density === density
          && item.workload === (direction > 0 ? "scroll-forward" : "scroll-backward"))!;
        validateDensityRecord({ ...scenario, resultRegime: total > 65000 ? "seek" : "indexed", metrics: result });
      } else {
        expect(result.refillCoverageComplete).toBe(0);
        expect(result.lateBufferEdgeBlockedMs).toBe(0);
        expect(result.latePhysicalClampMs).toBeGreaterThan(0);
      }
      expect(await page.evaluate(() => !(window as any).__densityJourney && !window.__kupua_thumbnailProbe)).toBe(true);
      console.log(JSON.stringify({ fixture: "normalized-journey", density, direction, total, mapPresent,
        progressedResults: result.progressedResults, refillCoverageComplete: result.refillCoverageComplete,
        stoppedMediaReadyMs: result.stopMediaReadyMs, boundaryLagMs: result.recoveryStartLagMs,
        firstProgressStruggleStep: result.firstProgressStruggleStep, firstFrameStruggleStep: result.firstFrameStruggleStep }));
    } finally { requests.dispose(); await cdp.detach(); }
  });
}

test("Table observer matched on/off fidelity and cost", async ({ context }) => {
  await installJourneyFixtureRoutes(context);
  const arms: Record<string, number | null>[] = [];
  for (const enabled of [false, true, true, false]) {
    const page = await context.newPage();
    try {
      await page.goto("/search?nonFree=true");
      await page.waitForFunction(() => Boolean((window as any).__kupua_store__));
      await page.evaluate(async () => {
        const path = "/src/dal/mock-data-source.ts";
        const { MockDataSource } = await import(path);
        const store = (window as any).__kupua_store__;
        store.setState({ dataSource: new MockDataSource(70000) });
        await store.getState().search();
      });
      await establishDensitySource(page);
      await selectDensity(page, "table");
      await prepareDensityRecovery(page, "table");
      const media = await densityDrivers.visibleMediaReadiness(page, "table", await page.evaluate(() => performance.now()));
      expect(media.mediaCensored).toBe(0);
      await page.evaluate(() => {
        const region = document.querySelector('[aria-label="Image results table"]')!;
        const seen = new WeakMap<Element, { id: string; image: Element | null }>();
        let changes = 0;
        let replacements = 0;
        let frames = 0;
        let maximum = 0;
        let previous = performance.now();
        let raf = 0;
        const sample = (now: number) => {
          maximum = Math.max(maximum, now - previous);
          previous = now;
          frames++;
          for (const row of region.querySelectorAll('[role="row"][data-image-id]')) {
            const id = row.getAttribute("data-image-id")!;
            const image = row.querySelector("img");
            const old = seen.get(row);
            if (old && old.id !== id) changes++;
            if (old && old.image !== image) replacements++;
            seen.set(row, { id, image });
          }
          raf = requestAnimationFrame(sample);
        };
        sample(previous);
        (window as any).__tableControl = () => {
          cancelAnimationFrame(raf);
          delete (window as any).__tableControl;
          return { independentIdentityChanges: changes, independentImageReplacements: replacements,
            independentFrames: frames, independentFrameMaxMs: maximum };
        };
      });
      if (enabled) {
        await page.evaluate(densityDrivers.installDensityJourney, { density: "table" as const, direction: 1 as const });
        await page.evaluate(installThumbnailProbe, { density: "table" } as const);
      }
      const movement = await scrollAtSpeed(page, "table", 1200, 1500, { maxDistancePx: 1200, measureBounds: true });
      expect(movement.drivenDistancePx).toBeGreaterThanOrEqual(1199);
      const metrics = await page.evaluate(enabled => {
        const independent = (window as any).__tableControl();
        const probe = enabled ? window.__kupua_thumbnailProbe!.stop() : {};
        const stability = enabled ? (window as any).__densityJourney.snapshot() : {};
        window.__kupua_thumbnailProbe?.dispose();
        (window as any).__densityJourney?.dispose();
        return { ...independent, ...probe, ...stability, observerEnabled: Number(enabled) };
      }, enabled);
      expect(metrics.independentFrames).toBeGreaterThan(1);
      if (enabled) {
        expect(metrics.trackingOverflow).toBe(0);
        expect(metrics.observerSampleCount).toBeGreaterThan(1);
        expect(metrics.observerSampleTotalMs + metrics.stabilitySampleTotalMs).toBeLessThan(metrics.elapsedMs);
        expect(metrics.imageIdentityChanges).toBeGreaterThanOrEqual(metrics.independentIdentityChanges);
        expect(metrics.imageIdentityChanges).toBeLessThanOrEqual(metrics.independentIdentityChanges + metrics.trackedEntriesMax);
      }
      arms.push({ ...metrics, drivenDistancePx: movement.drivenDistancePx, drivenDurationMs: movement.drivenDurationMs });
    } finally { await page.close(); }
  }
  console.log(JSON.stringify({ fixture: "table-observer-matched", arms }));
});

for (const density of ["grid", "justified"] as const) {
  test(`${density}: endurance and refresh workload orchestration stays isolated`, async ({ page }) => {
    await page.route("**/*", route => {
      const url = new URL(route.request().url());
      const asset = url.origin === "http://127.0.0.1:3041" && !/^\/(es|api|grid-|s3|imgproxy|bedrock)/.test(url.pathname);
      return asset ? route.continue() : route.fulfill({ status: 404, body: "isolated fixture" });
    });
    await page.goto("/search?nonFree=true");
    await page.waitForFunction(() => Boolean((window as any).__kupua_store__));
    await page.evaluate(async () => {
      const path = "/src/dal/mock-data-source.ts";
      const { MockDataSource } = await import(path);
      const store = (window as any).__kupua_store__;
      store.setState({ dataSource: new MockDataSource(70000) });
      await store.getState().search();
    });
    await establishDensitySource(page);
    await selectDensity(page, density);
    await prepareDensityRecovery(page, density);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    const requests = createRequestProbe(cdp);
    try {
      const endurance = await densityDrivers.measureDensityEndurance(page, density, requests, { phaseDurationMs: 120 });
      expect(endurance.endurancePhaseCount).toBe(3);
      expect(endurance.enduranceInterrupted).toBe(0);
      const refresh = await densityDrivers.measureDensityRefreshContention(page, density, cdp, requests, 0);
      const scenario = DENSITY_SCENARIOS.find(item => item.id === `D11-${density}`)!;
      validateDensityRecord({ ...scenario, resultRegime: "seek", metrics: refresh });
      expect(refresh.quietDataReadyMs).toBeGreaterThanOrEqual(0);
      expect(refresh.busyDataReadyMs).toBeGreaterThanOrEqual(0);
      expect(refresh.refreshComparisonCensored).toBe(1);
      expect(refresh.refreshDataDeltaMs).toBe(null);
      expect(await page.evaluate(() => !(window as any).__densityRefresh && !(window as any).__kupua_thumbnailProbe)).toBe(true);
    } finally { requests.dispose(); await cdp.detach(); }
  });
}

for (const [regime, total] of [["indexed", 12000], ["seek", 70000]] as const) {
  test(`${regime}: repeated native setup, paired recovery and cooldown-aware maintenance`, async ({ page }) => {
    await page.route("**/*", route => {
      const url = new URL(route.request().url());
      const localAsset = url.origin === "http://127.0.0.1:3041" &&
        !/^\/(es|api|grid-|s3|imgproxy|bedrock)/.test(url.pathname);
      return localAsset ? route.continue() : route.fulfill({ status: 404, body: "isolated fixture" });
    });
    await page.goto("/search?nonFree=true");
    await page.waitForFunction(() => Boolean((window as any).__kupua_store__));
    await page.evaluate(async total => {
      const path = "/src/dal/mock-data-source.ts";
      const { MockDataSource } = await import(path);
      const store = (window as any).__kupua_store__;
      store.setState({ dataSource: new MockDataSource(total) });
      await store.getState().search();
    }, total);
    await expect(page.locator("[data-scrubber-mode]")).toHaveAttribute("data-scrubber-mode", regime);
    await establishDensitySource(page);
    // Repeat at the current thumb: setup must not wait forever for an ignored track click.
    await scrubDensityTo(page, "table", 0.4);
    await restoreDensitySource(page);
    for (const density of ["justified", "grid"] as const) {
      await selectDensity(page, density);
      await waitForPlacement(page, density, true);
      await page.setViewportSize({ width: 1100, height: 960 });
      await waitForPlacement(page, density, true);
      await page.setViewportSize({ width: 1720, height: 960 });
      await waitForPlacement(page, density, true);
      const point = await electAnchor(page, density, true);
      await page.mouse.dblclick(point.x, point.y);
      await page.waitForFunction(() => Boolean(document.querySelector('[data-detail-image-id]')));
      await page.keyboard.press("Backspace");
      await waitForPlacement(page, density, true);
      await scrubDensityTo(page, density, 0.75);
      await restoreDensitySource(page);
      expect(await page.evaluate(() => {
        const state = (window as any).__kupua_store__.getState();
        return state.focusedImageId === (window as any).__densitySource.id &&
          state.imagePositions.has((window as any).__densitySource.id);
      })).toBe(true);
    }
    for (const density of ["grid", "justified"] as const) {
      await selectDensity(page, density);
      await prepareDensityMaintenance(page, density);
      const before = await page.evaluate(() => {
        const s = (window as any).__kupua_store__.getState();
        return { count: s.results.length, eviction: s._forwardEvictGeneration };
      });
      expect(before.count).toBeLessThanOrEqual(1000);
      if (density === "justified") expect(before.count).toBe(1000);
      else expect(before.count).toBeGreaterThanOrEqual(995); // Six-column grid may discard up to five extra items.
      await scrollToDensityTail(page, density);
      await waitForDensityEviction(page, density, before.eviction);
      await waitForPlacement(page, density, false);
      expect(await page.evaluate(() => (window as any).__kupua_store__.getState()._forwardEvictGeneration)).toBeGreaterThan(before.eviction);
      await restoreDensitySource(page);
    }
    for (const density of ["grid", "justified"] as const) {
      await selectDensity(page, density);
      await prepareDensityRecovery(page, density);
      const metrics = await measureDensityRecovery(page, density);
      const scenario = DENSITY_SCENARIOS.find(item => item.workload === "burst-recovery" && item.density === density)!;
      validateDensityRecord({ ...scenario, resultRegime: regime, metrics });
      expect(metrics.stopDataCensored).toBe(0);
      expect(metrics.stopMediaCensored).toBe(1);
      expect(metrics.stopVisibleMediaCount).toBe(0);
      expect(await page.evaluate(() => (window as any).__densityRecovery === undefined)).toBe(true);
      await restoreDensitySource(page);
    }
  });
}
