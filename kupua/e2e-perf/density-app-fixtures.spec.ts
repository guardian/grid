import { test, expect } from "@playwright/test";
import { electAnchor, establishDensitySource, restoreDensitySource, selectDensity, scrubDensityTo,
  prepareDensityMaintenance, scrollToDensityTail, waitForDensityEviction, waitForPlacement } from "./density-browser";

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
  });
}
