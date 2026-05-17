/**
 * Throwaway diagnostic: measure actual centering offset after various exit paths.
 * Run via: npx playwright test --config kupua/playwright.smoke.config.ts kupua/e2e/smoke/centering-diag.spec.ts --headed
 */

import { test, expect } from "../shared/helpers";

// Match user's real browser viewport (innerWidth/innerHeight, not screen size)
test.use({ viewport: { width: 1775, height: 994 } });

/** Shared measurement helper — finds the focused image element in the DOM
 *  and computes offsets relative to the scroll container center. */
async function measureCentering(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const grid = document.querySelector('[aria-label="Image results grid"]') as HTMLElement;
    const table = document.querySelector('[aria-label="Image results table"]') as HTMLElement;
    const container = grid ?? table;
    if (!container) return { error: "no container" };
    const isGrid = !!grid;
    const containerRect = container.getBoundingClientRect();

    // Find sticky header (table only)
    const header = !isGrid
      ? (container.querySelector("[data-table-header]") as HTMLElement ??
         Array.from(container.querySelectorAll("*")).find(
           (el) => getComputedStyle(el).position === "sticky"
         ) as HTMLElement)
      : null;
    const headerH = header ? header.getBoundingClientRect().height : 0;

    const store = (window as any).__kupua_store__;
    const focusedId = store?.getState().focusedImageId;
    if (!focusedId) return { error: "no focusedImageId in store" };

    // Find focused element by data-image-id
    const focusedEl = container.querySelector(`[data-image-id="${focusedId}"]`);
    if (!focusedEl) return { error: `no element with data-image-id="${focusedId}"`, focusedId };

    const fRect = focusedEl.getBoundingClientRect();
    const fCenter = fRect.top + fRect.height / 2;
    const containerCenter = containerRect.top + containerRect.height / 2;
    const usableCenter = containerRect.top + headerH + (containerRect.height - headerH) / 2;

    return {
      isGrid,
      containerTop: Math.round(containerRect.top),
      containerBot: Math.round(containerRect.bottom),
      containerH: Math.round(containerRect.height),
      clientH: container.clientHeight,
      headerH: Math.round(headerH),
      scrollTop: Math.round(container.scrollTop * 10) / 10,
      focusedTop: Math.round(fRect.top * 10) / 10,
      focusedH: Math.round(fRect.height),
      focusedCenter: Math.round(fCenter * 10) / 10,
      containerCenter: Math.round(containerCenter * 10) / 10,
      usableCenter: Math.round(usableCenter * 10) / 10,
      offsetFromContainerCenter: Math.round((fCenter - containerCenter) * 10) / 10,
      offsetFromUsableCenter: Math.round((fCenter - usableCenter) * 10) / 10,
      windowH: window.innerHeight,
      focusedId,
    };
  });
}

function printMeasurements(label: string, m: any) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${label}`);
  console.log("═".repeat(60));
  console.log(JSON.stringify(m, null, 2));
  if (m.error) { console.log(`  ERROR: ${m.error}`); return; }
  console.log(`  → OFFSET FROM CONTAINER CENTER: ${m.offsetFromContainerCenter}px`);
  console.log(`  → OFFSET FROM USABLE CENTER:     ${m.offsetFromUsableCenter}px`);
  console.log("═".repeat(60) + "\n");
}

// ───────────────────────────────────────────────────────────────
// 1. GRID — fullscreen preview exit (Alt+F → traverse → Escape)
// ───────────────────────────────────────────────────────────────

test("DIAG 1: grid fullscreen preview exit", async ({ kupua }) => {
  const page = kupua.page;
  kupua.startConsoleCapture();
  await kupua.goto();
  await page.waitForTimeout(1000);

  await kupua.scrollBy(5000);
  await page.waitForTimeout(500);
  await kupua.focusNthItem(5);
  await page.waitForTimeout(300);

  await page.keyboard.press("Alt+f");
  await page.waitForTimeout(1500);

  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(300);
  }

  await page.keyboard.press("Backspace");
  await page.waitForTimeout(3000);

  const m = await measureCentering(page);
  printMeasurements("GRID — fullscreen preview exit", m);

  const centerLogs = kupua.getConsoleLogs(/\[center/);
  console.log(`  [center] logs (${centerLogs.length}):`);
  for (const l of centerLogs) console.log(`    ${l}`);

  expect(Math.abs((m as any).offsetFromContainerCenter ?? 999)).toBeLessThan(50);
});

// ───────────────────────────────────────────────────────────────
// 2. TABLE — image detail exit (dblclick → traverse → Backspace)
// ───────────────────────────────────────────────────────────────

test("DIAG 2: table image detail exit", async ({ kupua }) => {
  const page = kupua.page;
  kupua.startConsoleCapture();
  await kupua.goto();
  await page.waitForTimeout(500);

  await kupua.switchToTable();
  await page.waitForTimeout(1000);

  // Focus first row, then End to jump to last, then up a bit to land ~middle
  await kupua.focusNthItem(0);
  await page.waitForTimeout(200);
  await page.keyboard.press("End");
  await page.waitForTimeout(500);
  for (let i = 0; i < 50; i++) { await page.keyboard.press("ArrowUp"); }
  await page.waitForTimeout(300);

  // Open detail from keyboard, traverse, close
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
  for (let i = 0; i < 5; i++) { await kupua.detailNext(); await page.waitForTimeout(200); }
  await kupua.closeDetailViaBackspace();
  await page.waitForTimeout(2000);

  const m = await measureCentering(page);
  printMeasurements("TABLE — image detail exit", m);

  // Pause so user can screenshot the browser
  await page.waitForTimeout(5000);

  const centerLogs = kupua.getConsoleLogs(/\[center/);
  console.log(`  [center] logs (${centerLogs.length}):`);
  for (const l of centerLogs) console.log(`    ${l}`);

  expect(Math.abs((m as any).offsetFromUsableCenter ?? 999)).toBeLessThan(50);
});

// ───────────────────────────────────────────────────────────────
// 3. TABLE — fullscreen preview exit (Alt+F → traverse → Escape)
// ───────────────────────────────────────────────────────────────

test("DIAG 3: table fullscreen preview exit", async ({ kupua }) => {
  const page = kupua.page;
  kupua.startConsoleCapture();
  await kupua.goto();
  await page.waitForTimeout(500);

  await kupua.switchToTable();
  await page.waitForTimeout(1000);

  // Scroll deep via direct scrollTop (scrollBy/PageDown go horizontal on table)
  await page.evaluate(() => {
    const table = document.querySelector('[aria-label="Image results table"]') as HTMLElement;
    if (table) table.scrollTop = 5000;
  });
  await page.waitForTimeout(500);
  await kupua.focusNthItem(10);
  await page.waitForTimeout(300);

  await page.keyboard.press("Alt+f");
  await page.waitForTimeout(1500);

  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(300);
  }

  await page.keyboard.press("Backspace");
  await page.waitForTimeout(3000);

  const m = await measureCentering(page);
  printMeasurements("TABLE — fullscreen preview exit", m);

  const centerLogs = kupua.getConsoleLogs(/\[center/);
  console.log(`  [center] logs (${centerLogs.length}):`);
  for (const l of centerLogs) console.log(`    ${l}`);

  expect(Math.abs((m as any).offsetFromUsableCenter ?? 999)).toBeLessThan(50);
});

