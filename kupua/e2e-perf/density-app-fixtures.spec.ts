import { test, expect } from "@playwright/test";
import { electAnchor, establishDensitySource, restoreDensitySource, selectDensity, scrubDensityTo,
  prepareDensityMaintenance, scrollToDensityTail, waitForDensityEviction, waitForPlacement,
  waitForDensityMaintenanceCooldown, scrollAtSpeed,
  prepareDensityRecovery, measureDensityRecovery } from "./density-browser";
import { DENSITY_SCENARIOS, validateDensityRecord } from "./density-reporting.mjs";
import { createRequestProbe } from "./network-probe.mjs";
import * as densityDrivers from "./density-browser";

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

for (const density of ["grid", "justified"] as const) {
  for (const direction of ["forward", "backward"] as const) {
    test(`${density} ${direction}: held refill measures blocking and preserves the stopped position`, async ({ page }) => {
      await page.route("**/*", route => {
        const url = new URL(route.request().url());
        const localAsset = url.origin === "http://127.0.0.1:3041" &&
          !/^\/(es|api|grid-|s3|imgproxy|bedrock)/.test(url.pathname);
        return localAsset ? route.continue() : route.fulfill({ status: 404, body: "isolated fixture" });
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
      await waitForPlacement(page, density, true);
      await waitForDensityMaintenanceCooldown(page);
      await page.evaluate(({ density, direction }) => {
        const state = (window as any).__kupua_store__.getState();
        const source = state.dataSource;
        const original = source.searchAfter;
        let release!: () => void;
        const gate = new Promise<void>(resolve => { release = resolve; });
        const probe = { reads: 0, forwardReads: 0, backwardReads: 0, held: false, length: state.results.length, release,
          restore: () => { source.searchAfter = original; }, anchor: "", top: 0,
          phase: "held", phases: [] as string[] };
        (window as any).__heldRefill = probe;
        source.searchAfter = async (...args: unknown[]) => {
          probe.reads++;
          probe.phases.push(probe.phase);
          if (args[4]) probe.backwardReads++;
          else probe.forwardReads++;
          if (Boolean(args[4]) === (direction === "backward")) {
            probe.held = true;
            await gate;
          }
          return original.apply(source, args);
        };
        const region = document.querySelector<HTMLElement>(`[aria-label="Image results ${density}"]`)!;
        region.scrollTop = direction === "forward" ? region.scrollHeight - region.clientHeight : 0;
      }, { density, direction });
      try {
        await page.waitForFunction(() => (window as any).__heldRefill.held);
        const speed = direction === "forward" ? 1000 : -1000;
        const held = await scrollAtSpeed(page, density, speed, 200, { measureBounds: true });
        expect(held.bufferEdgeBlockedMs).toBeGreaterThan(150);
        expect(held.drivenDistancePx).toBe(0);
        expect(await page.evaluate(() => (window as any).__heldRefill.reads)).toBe(1);
        await page.evaluate(density => {
          const probe = (window as any).__heldRefill;
          const region = document.querySelector(`[aria-label="Image results ${density}"]`)!;
          probe.anchor = (window as any).__kupua_getViewportAnchorId__();
          const cell = region.querySelector(`[data-image-id="${CSS.escape(probe.anchor)}"]`)!;
          probe.top = cell.getBoundingClientRect().top - region.getBoundingClientRect().top;
          probe.phase = "released";
          probe.release();
        }, density);
        await page.waitForFunction(() => {
          const state = (window as any).__kupua_store__.getState();
          return state.results.length > (window as any).__heldRefill.length &&
            !state._extendForwardInFlight && !state._extendBackwardInFlight;
        });
        await expect.poll(() => page.evaluate(density => {
          const probe = (window as any).__heldRefill;
          const region = document.querySelector(`[aria-label="Image results ${density}"]`)!;
          const cell = region.querySelector(`[data-image-id="${CSS.escape(probe.anchor)}"]`);
          return cell ? Math.abs(cell.getBoundingClientRect().top - region.getBoundingClientRect().top - probe.top) : Infinity;
        }, density)).toBeLessThanOrEqual(1);
        await page.evaluate(() => { (window as any).__heldRefill.phase = "resumed"; });
        const resumed = await scrollAtSpeed(page, density, speed, 200, { measureBounds: true });
        expect(resumed.bufferEdgeBlockedMs).toBe(0);
        expect(Math.abs(resumed.drivenDistancePx)).toBeGreaterThan(150);
        console.log(JSON.stringify(await page.evaluate(() => {
          const probe = (window as any).__heldRefill;
          return { heldReadDirections: { forward: probe.forwardReads, backward: probe.backwardReads }, phases: probe.phases };
        })));
        expect(await page.evaluate(() => (window as any).__heldRefill.reads)).toBe(1);
        console.log(JSON.stringify({ fixture: "held-refill", density, direction,
          heldMs: held.bufferEdgeBlockedMs, resumedBlockedMs: resumed.bufferEdgeBlockedMs }));
      } finally {
        await page.evaluate(() => {
          const probe = (window as any).__heldRefill;
          probe?.release();
          probe?.restore();
          delete (window as any).__heldRefill;
        });
      }
    });
  }
}
