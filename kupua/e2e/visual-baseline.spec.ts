/**
 * Visual regression baselines — screenshot tests at 0.1% pixel tolerance.
 *
 * These catch accidental layout breaks during any future work.
 * The first run creates baseline PNGs (committed to git). Subsequent
 * runs compare against the committed baselines.
 *
 * Run with --update-snapshots to regenerate baselines:
 *   npx playwright test e2e/visual-baseline.spec.ts --update-snapshots
 */

import { test, expect } from "./helpers";

test.describe("Visual regression baselines", () => {
  test("grid view baseline", async ({ kupua, page }) => {
    await kupua.goto();
    await page.waitForTimeout(500); // let images settle
    await expect(page).toHaveScreenshot("grid-view.png", {
      maxDiffPixelRatio: 0.001,
    });
  });

  test("table view baseline", async ({ kupua, page }) => {
    await kupua.goto();
    await kupua.switchToTable();
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot("table-view.png", {
      maxDiffPixelRatio: 0.001,
    });
  });

  test("image detail baseline", async ({ kupua, page }) => {
    await kupua.goto();
    await kupua.openDetailForNthItem(0);
    await page.waitForTimeout(1000); // let detail image load
    await expect(page).toHaveScreenshot("image-detail.png", {
      maxDiffPixelRatio: 0.001,
    });
  });

  test("search with query baseline", async ({ kupua, page }) => {
    await kupua.gotoWithParams("query=test&orderBy=-taken");
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot("search-query.png", {
      maxDiffPixelRatio: 0.001,
    });
  });
});

