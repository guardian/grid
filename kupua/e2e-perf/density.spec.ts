/** Operator-only measurements. Local observer validation lives in validation/density-fixtures.spec.ts. */
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { test, expect } from "./helpers";
import type { KupuaHelpers } from "../e2e/shared/helpers";
import { selectDensity, electAnchor, establishDensitySource, restoreDensitySource, prepareDensityMaintenance, waitForDensityMaintenanceCooldown, withDensityScrollNetwork, scrollToDensityTail, waitForDensityEviction, scrubDensityTo, waitForPlacement, visibleMediaReadiness, scrollAtSpeed, prepareDensityRecovery, measureDensityJourney, measureDensityRefreshContention, type Density } from "./density-browser";
import { installThumbnailProbe } from "./thumbnail-probe.mjs";
import { createRequestProbe } from "./network-probe.mjs";
import { DENSITY_SCENARIOS, DENSITY_WORKLOADS, validateDensityRecord } from "./density-reporting.mjs";

const runIndex = Number(process.env.KUPUA_DENSITY_RUN_INDEX ?? 0);
const output = resolve(import.meta.dirname, "results/.density-tmp.jsonl");

async function prepare(kupua: KupuaHelpers) {
  await kupua.ensureExplicitMode();
  await kupua.startSearch("", "table");
  const page = kupua.page;
  await page.waitForFunction(() => {
    const s = (window as any).__kupua_store__.getState();
    return !s.loading && !s._browseNavigation && s.results.length > 0;
  });
  const validWindow = await page.evaluate(() => {
    const s = (window as any).__kupua_store__.getState();
    return s.total > s.results.length && !["MockDataSource", "ResidentSampleDataSource"].includes(s.dataSource.constructor.name);
  });
  if (!validWindow) throw new Error("Density campaigns require the normal windowed datasource, not a resident fixture");
  return establishDensitySource(page);
}

for (const workload of DENSITY_WORKLOADS) {
  test(`density ${workload}: matched layouts with explicit media boundary`, async ({ kupua, page, baseURL }) => {
    if (workload === "refresh-contention") test.setTimeout(180000);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    const requests = ["scroll-constrained", "scroll-forward", "scroll-backward", "refresh-contention"].includes(workload)
      ? createRequestProbe(cdp, { localProxyOrigins: baseURL ? [new URL(baseURL).origin] : [] }) : null;
    const options: Density[] = DENSITY_SCENARIOS.filter(scenario => scenario.workload === workload).map(scenario => scenario.density);
    const order = runIndex % options.length;
    const densities = [...options.slice(order), ...options.slice(0, order)];
    try {
      await prepare(kupua);
      await page.evaluate(() => { (window as any).__densityJourneyHistory = new Set<string>(); });
      for (const density of densities) {
        await cdp.send("Network.setCacheDisabled", { cacheDisabled: false });
        await page.setViewportSize({ width: 1720, height: 960 });
        const start = await restoreDensitySource(page);
        const scenario = DENSITY_SCENARIOS.find(item => item.density === density && item.workload === workload);
        if (!scenario) throw new Error("Missing density scenario contract");
        let metrics: Record<string, number | null>;
        if (workload === "refresh-contention") {
          if (density === "table") throw new Error("D11 requires an image layout");
          metrics = await measureDensityRefreshContention(page, density, cdp, requests!, runIndex);
        } else if (["scroll-forward", "scroll-backward", "scroll-constrained"].includes(workload)) {
          await selectDensity(page, density);
          await prepareDensityRecovery(page, density);
          const constrained = workload === "scroll-constrained";
          const initial = constrained ? await visibleMediaReadiness(page, density, await page.evaluate(() => performance.now())) : null;
          await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
          try {
            const observe = () => measureDensityJourney(page, density, workload === "scroll-backward" ? -1 : 1, requests!, {
              durationMs: constrained ? 6000 : 9000, reverseDurationMs: workload === "scroll-backward" ? 1500 : 0,
              networkConstrained: constrained,
            });
            metrics = constrained ? await withDensityScrollNetwork(cdp, "scroll-constrained", observe) : await observe();
            if (initial) metrics.initialMediaCensored = initial.mediaCensored;
            if (metrics.requestCaptureTracked! < 1) throw new Error("Journey requires positive request capture in the campaign document");
            expect(metrics.pressureCaptureRevision, "All fixed load steps must be observed, including adverse low-progress runs").toBe(1);
          }
          finally { await cdp.send("Network.setCacheDisabled", { cacheDisabled: false }); }
        } else if (workload.startsWith("scroll") || workload === "window-maintenance") {
          await selectDensity(page, density);
          await waitForPlacement(page, density, true);
          if (workload === "window-maintenance") {
            await prepareDensityMaintenance(page, density);
          }
          const initial = await visibleMediaReadiness(page, density, await page.evaluate(() => performance.now()));
          if (workload !== "window-maintenance") await waitForDensityMaintenanceCooldown(page);
          const publication = await page.evaluate(() => {
            const state = (window as any).__kupua_store__.getState();
            return { eviction: state._forwardEvictGeneration, prepend: state._prependGeneration };
          });
          const maintenance = workload === "window-maintenance";
          let movement: Partial<Awaited<ReturnType<typeof scrollAtSpeed>>> = {};
          metrics = await withDensityScrollNetwork(cdp, workload, async () => {
            await page.evaluate(installThumbnailProbe, { density });
            if (maintenance) {
              await scrollToDensityTail(page, density);
              await waitForDensityEviction(page, density, publication.eviction);
              await waitForPlacement(page, density, false);
            } else movement = await scrollAtSpeed(page, density, 1200, 4000);
            return page.evaluate(() => (window as any).__kupua_thumbnailProbe.stop());
          });
          const changes = await page.evaluate(previous => {
            const state = (window as any).__kupua_store__.getState();
            return { evictionCount: state._forwardEvictGeneration - previous.eviction,
              prependCount: state._prependGeneration - previous.prepend };
          }, publication);
          Object.assign(metrics, movement, changes, { initialMediaCensored: initial.mediaCensored });
          if (workload === "window-maintenance" && changes.evictionCount < 1) {
            throw new Error("Maintenance workload observed no eviction; reject incomplete coverage");
          }
          if (!maintenance && (movement.drivenDistancePx ?? 0) < 1200) throw new Error("Controlled scroll did not traverse a meaningful distance");
        } else {
          await selectDensity(page, density);
          await waitForPlacement(page, density, true);
          if (workload === "table-transition") {
            // Both destination renderers are warm; cold lazy-module loading is not this comparison.
            await selectDensity(page, "table");
            await waitForPlacement(page, "table", true);
          }
          if (workload === "detail-return") {
            const point = await electAnchor(page, density, true);
            await page.mouse.dblclick(point.x, point.y);
            await page.waitForFunction(() => Boolean(document.querySelector('[data-detail-image-id]')));
          }
          const epoch = await page.evaluate(() => performance.now());
          if (workload === "table-transition") await selectDensity(page, density);
          if (workload === "detail-return") await page.keyboard.press("Backspace");
          if (workload === "seek") await scrubDensityTo(page, density, 0.6, false);
          if (workload === "reflow") await page.setViewportSize({ width: 1100, height: 960 });
          const placementMs = await waitForPlacement(page, density, workload !== "seek", epoch);
          metrics = { placementMs, ...await visibleMediaReadiness(page, density, epoch) };
          await page.setViewportSize({ width: 1720, height: 960 });
        }
        const regime = await page.locator('[data-scrubber-mode]').first().getAttribute("data-scrubber-mode");
        expect(["indexed", "seek", "buffer"]).toContain(regime);
        const record = validateDensityRecord({ ...scenario, resultRegime: regime,
          metrics: { ...metrics, sourceTotal: start.total } });
        appendFileSync(output, JSON.stringify(record) + "\n");
        await page.evaluate(() => {
          (window as any).__kupua_thumbnailProbe?.dispose();
          delete (window as any).__kupua_thumbnailProbe;
          delete (window as any).__densityAnchor;
        });
      }
    } finally {
      requests?.dispose();
      await page.evaluate(() => {
        (window as any).__kupua_thumbnailProbe?.dispose();
        (window as any).__densityJourney?.dispose();
        delete (window as any).__kupua_thumbnailProbe;
        delete (window as any).__densityAnchor;
        delete (window as any).__densitySource;
        delete (window as any).__densityJourneyHistory;
      }).catch(() => {});
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      await cdp.send("Network.setCacheDisabled", { cacheDisabled: false });
      await cdp.detach();
    }
  });
}
