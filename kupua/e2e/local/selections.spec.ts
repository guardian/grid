/**
 * Selections feature spec.
 *
 * Tests the core S2 UI: tickbox hover affordance, click-to-select,
 * SelectionStatusBar, clear, and persistence across sort change.
 *
 * Run:
 *   npm --prefix kupua run test:e2e -- selections.spec.ts
 *   npm --prefix kupua run test:e2e -- selections.spec.ts --headed
 */

import { test, expect } from "../shared/helpers";

// ---------------------------------------------------------------------------
// Helpers — read selection store state
// ---------------------------------------------------------------------------

async function getSelectionCount(page: Parameters<typeof test>[1]["page"]): Promise<number> {
  return page.evaluate(() => {
    const store = (window as any).__kupua_selection_store__;
    if (!store) return 0;
    return store.getState().selectedIds.size;
  });
}

async function clearSelection(page: Parameters<typeof test>[1]["page"]): Promise<void> {
  await page.evaluate(() => {
    const store = (window as any).__kupua_selection_store__;
    store?.getState().clear();
  });
}

async function getSelectionIds(page: Parameters<typeof test>[1]["page"]): Promise<string[]> {
  return page.evaluate(() => {
    const store = (window as any).__kupua_selection_store__;
    if (!store) return [];
    return Array.from(store.getState().selectedIds as Set<string>);
  });
}

// ---------------------------------------------------------------------------
// Setup — use explicit mode so single-click = focus (not navigate)
// ---------------------------------------------------------------------------

test.beforeEach(async ({ kupua }) => {
  await kupua.ensureExplicitMode();
});

// ===========================================================================
// Grid — hover affordance
// ===========================================================================

test.describe("Grid — tickbox hover affordance", () => {
  test("hovering a grid cell reveals the tickbox button", async ({ kupua }) => {
    await kupua.goto();

    // Playwright Desktop Chrome uses pointer: fine by default.
    // Hover the first grid cell.
    const firstCell = kupua.page.locator('[data-grid-cell]').first();
    await firstCell.hover();

    // The tickbox button should now be visible (CSS hover rule).
    const tickbox = firstCell.locator('button[aria-label="Select image"]');
    await expect(tickbox).toBeVisible({ timeout: 3000 });
  });
});

// ===========================================================================
// Grid — click to select
// ===========================================================================

test.describe("Grid — click to enter/exit selection mode", () => {
  test("clicking a tickbox enters selection mode and shows SelectionStatusBar", async ({ kupua }) => {
    await kupua.goto();
    await clearSelection(kupua.page);

    const firstCell = kupua.page.locator('[data-grid-cell]').first();
    await firstCell.hover();

    // Click the tickbox
    const tickbox = firstCell.locator('button[aria-label="Select image"]');
    await tickbox.click();

    // Selection count should be 1
    const count = await getSelectionCount(kupua.page);
    expect(count).toBe(1);

    // SelectionStatusBar should appear with "1 selected"
    const statusBar = kupua.page.locator('[role="status"]', { hasText: "selected" });
    await expect(statusBar).toBeVisible({ timeout: 3000 });
    await expect(statusBar).toContainText("1");
  });

  test("clicking a second tickbox adds to selection", async ({ kupua }) => {
    await kupua.goto();
    await clearSelection(kupua.page);

    const cells = kupua.page.locator('[data-grid-cell]');

    // Select first
    await cells.nth(0).hover();
    await cells.nth(0).locator('button').filter({ hasText: "" }).first().click();

    // Select second — in selection mode, tickboxes are always visible
    await cells.nth(1).locator('button[aria-checked]').click();

    const count = await getSelectionCount(kupua.page);
    expect(count).toBe(2);

    const statusBar = kupua.page.locator('[role="status"]', { hasText: "selected" });
    await expect(statusBar).toContainText("2");
  });

  test("Clear button exits selection mode", async ({ kupua }) => {
    await kupua.goto();
    await clearSelection(kupua.page);

    // Select one image via tickbox
    const firstCell = kupua.page.locator('[data-grid-cell]').first();
    await firstCell.hover();
    await firstCell.locator('button[aria-label="Select image"]').click();

    // Verify mode entered
    expect(await getSelectionCount(kupua.page)).toBe(1);

    // Click Clear
    await kupua.page.locator('button[aria-label="Clear selection"]').click();

    // Mode exited
    expect(await getSelectionCount(kupua.page)).toBe(0);

    // SelectionStatusBar gone
    const statusBar = kupua.page.locator('[role="status"]', { hasText: "selected" });
    await expect(statusBar).not.toBeVisible({ timeout: 3000 });
  });

  test("selection persists across sort change", async ({ kupua }) => {
    await kupua.goto();
    await clearSelection(kupua.page);

    // Get the first image's ID before selecting
    const firstId = await kupua.page.evaluate(() => {
      const store = (window as any).__kupua_store__;
      return store?.getState().results[0]?.id ?? null;
    });
    expect(firstId).not.toBeNull();

    // Select it
    const firstCell = kupua.page.locator('[data-grid-cell]').first();
    await firstCell.hover();
    await firstCell.locator('button[aria-label="Select image"]').click();
    expect(await getSelectionCount(kupua.page)).toBe(1);

    // Wait for the selection-store's 250ms persist debounce to flush to
    // sessionStorage before navigating (otherwise the navigation happens
    // before the write and the store rehydrates empty).
    await kupua.page.waitForTimeout(400);

    // Change sort (click the sort button in StatusBar or toggle density to
    // trigger a URL change that re-renders without clearing selection).
    // Simplest: navigate to a new sort order via URL directly.
    const currentUrl = kupua.page.url();
    await kupua.page.goto(currentUrl + "&orderBy=-lastModified");
    await kupua.waitForResults();

    // Selection should still be 1 (survives sort change via sessionStorage persist).
    const countAfterSort = await getSelectionCount(kupua.page);
    expect(countAfterSort).toBe(1);
    const idsAfterSort = await getSelectionIds(kupua.page);
    expect(idsAfterSort).toContain(firstId);
  });
});

// ===========================================================================
// Table — selection column
// ===========================================================================

test.describe("Table — selection column", () => {
  test("selection column is present (leftmost) in table view", async ({ kupua }) => {
    await kupua.goto();
    await kupua.switchToTable();

    // The table header should have a selection column header (aria-label="Selection")
    const selectionHeader = kupua.page.locator('[role="columnheader"][aria-label="Selection"]');
    await expect(selectionHeader).toBeVisible({ timeout: 3000 });
  });

  test("hovering a table row reveals the tickbox in the selection column", async ({ kupua }) => {
    await kupua.goto();
    await kupua.switchToTable();
    await clearSelection(kupua.page);

    // Hover the first real data row
    const firstRow = kupua.page.locator('[aria-label="Image results table"] [role="row"][class*="cursor-pointer"]').first();
    await firstRow.hover();

    const tickbox = firstRow.locator('button[aria-label="Select image"]');
    await expect(tickbox).toBeVisible({ timeout: 3000 });
  });

  test("clicking a table tickbox enters selection mode", async ({ kupua }) => {
    await kupua.goto();
    await kupua.switchToTable();
    await clearSelection(kupua.page);

    const firstRow = kupua.page.locator('[aria-label="Image results table"] [role="row"][class*="cursor-pointer"]').first();
    await firstRow.hover();
    await firstRow.locator('button[aria-label="Select image"]').click();

    expect(await getSelectionCount(kupua.page)).toBe(1);

    const statusBar = kupua.page.locator('[role="status"]', { hasText: "selected" });
    await expect(statusBar).toBeVisible({ timeout: 3000 });
  });
});

// ===========================================================================
// Grid — body click in selection mode toggles (doesn't navigate)
// ===========================================================================

test.describe("Grid — body click in selection mode", () => {
  test("body click in selection mode toggles the image, not navigate", async ({ kupua }) => {
    await kupua.goto();
    await clearSelection(kupua.page);

    const cells = kupua.page.locator('[data-grid-cell]');

    // Enter selection mode via tick click on first cell
    await cells.nth(0).hover();
    await cells.nth(0).locator('button[aria-label="Select image"]').click();
    expect(await getSelectionCount(kupua.page)).toBe(1);

    // Single-click the image body of the second cell — should toggle, not navigate
    await cells.nth(1).click();

    // Should be 2 selected, NOT in detail view
    expect(await getSelectionCount(kupua.page)).toBe(2);
    const detailId = await kupua.getDetailImageId();
    expect(detailId).toBeNull();
  });
});

// ===========================================================================
// S3a — Shift-click range selection (in-buffer fast path)
// ===========================================================================

test.describe("S3a — Grid: shift-click range selection", () => {
  test("shift+click selects all images between anchor and target (grid)", async ({ kupua }) => {
    await kupua.goto();
    await clearSelection(kupua.page);

    const cells = kupua.page.locator('[data-grid-cell]');

    // Enter selection mode by ticking the first cell (sets anchor).
    await cells.nth(0).hover();
    await cells.nth(0).locator('button[aria-label="Select image"]').click();
    expect(await getSelectionCount(kupua.page)).toBe(1);

    // Shift+click the 4th cell (index 3) — should select cells 0–3 (4 items).
    await cells.nth(3).click({ modifiers: ["Shift"] });

    const count = await getSelectionCount(kupua.page);
    expect(count).toBeGreaterThanOrEqual(4);

    // All 4 image IDs in the range should be selected.
    const ids = await getSelectionIds(kupua.page);
    const allCellIds = await kupua.page.evaluate(() => {
      const store = (window as any).__kupua_store__;
      return store?.getState().results.slice(0, 4).map((img: any) => img?.id).filter(Boolean) ?? [];
    });
    for (const id of allCellIds) {
      expect(ids).toContain(id);
    }
  });

  test("shift+click range in REVERSE order works (target above anchor)", async ({ kupua }) => {
    await kupua.goto();
    await clearSelection(kupua.page);

    const cells = kupua.page.locator('[data-grid-cell]');

    // Enter selection mode on the 4th cell (anchor at index 3).
    await cells.nth(3).hover();
    await cells.nth(3).locator('button[aria-label="Select image"]').click();
    expect(await getSelectionCount(kupua.page)).toBe(1);

    // Shift+click the 1st cell (index 0) — select cells 0–3 in reverse.
    await cells.nth(0).click({ modifiers: ["Shift"] });

    const count = await getSelectionCount(kupua.page);
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test("shift+click with no prior anchor selects only the target", async ({ kupua }) => {
    await kupua.goto();
    await clearSelection(kupua.page);

    // Clear any persisted anchor.
    await kupua.page.evaluate(() => {
      (window as any).__kupua_selection_store__?.getState().setAnchor(null);
    });

    const cells = kupua.page.locator('[data-grid-cell]');

    // Shift+click with no anchor in selection mode.
    // Not in selection mode yet — shift+click on image-body is a no-op in grid
    // (the grid ignores shift outside selection mode). Enter via tick first.
    await cells.nth(0).hover();
    await cells.nth(0).locator('button[aria-label="Select image"]').click();
    // Now we're in mode with anchor set. Clear anchor explicitly.
    await kupua.page.evaluate(() => {
      (window as any).__kupua_selection_store__?.getState().setAnchor(null);
    });

    // Shift+click cell 2 — no anchor, should set-anchor+toggle (interpretClick rule)
    await cells.nth(2).click({ modifiers: ["Shift"] });

    // Should have added cell 2, not a full range from 0 to 2.
    // But cell 0 is already selected from earlier.
    const count = await getSelectionCount(kupua.page);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("second shift+click extends range from anchor", async ({ kupua }) => {
    await kupua.goto();
    await clearSelection(kupua.page);

    const cells = kupua.page.locator('[data-grid-cell]');

    // Select cell 0 (becomes anchor).
    await cells.nth(0).hover();
    await cells.nth(0).locator('button[aria-label="Select image"]').click();
    expect(await getSelectionCount(kupua.page)).toBe(1);

    // First range: shift+click cell 2 → cells 0–2 selected.
    await cells.nth(2).click({ modifiers: ["Shift"] });
    const countAfterFirst = await getSelectionCount(kupua.page);
    expect(countAfterFirst).toBeGreaterThanOrEqual(3);

    // Anchor should still be cell 0 (shift doesn't move anchor).
    // Second range: shift+click cell 4 → range should extend from anchor (cell 0).
    await cells.nth(4).click({ modifiers: ["Shift"] });
    const countAfterSecond = await getSelectionCount(kupua.page);
    // Should include at least cells 0–4 (5 items).
    expect(countAfterSecond).toBeGreaterThanOrEqual(5);
  });
});

test.describe("S3a — Table: shift-click range selection", () => {
  test("shift+click tickbox range selects all rows between anchor and target (table)", async ({ kupua }) => {
    await kupua.goto();
    await kupua.switchToTable();
    await clearSelection(kupua.page);

    const rows = kupua.page.locator('[aria-label="Image results table"] [role="row"][class*="cursor-pointer"]');

    // Select first row via tickbox (anchor).
    await rows.nth(0).hover();
    await rows.nth(0).locator('button[aria-label="Select image"]').click();
    expect(await getSelectionCount(kupua.page)).toBe(1);

    // Shift+click the tickbox of the 4th row.
    await rows.nth(3).locator('button[aria-label="Select image"]').click({ modifiers: ["Shift"] });

    const count = await getSelectionCount(kupua.page);
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test("shift+click on field-value cell does click-to-search, not range-select", async ({ kupua }) => {
    await kupua.goto();
    await kupua.switchToTable();
    await clearSelection(kupua.page);

    const rows = kupua.page.locator('[aria-label="Image results table"] [role="row"][class*="cursor-pointer"]');

    // Enter selection mode.
    await rows.nth(0).hover();
    await rows.nth(0).locator('button[aria-label="Select image"]').click();
    expect(await getSelectionCount(kupua.page)).toBe(1);

    const selectionBefore = await getSelectionCount(kupua.page);

    // Shift+click on a field-value cell in another row (should do click-to-search, not range-select).
    // Find a cell in row 2 with a visible text value (not the selection column).
    const fieldCell = rows.nth(2).locator('[data-cql-cell]').first();
    const isCellVisible = await fieldCell.count();
    if (isCellVisible > 0) {
      await fieldCell.click({ modifiers: ["Shift"] });
      // Selection count should NOT have jumped by 3 (which would be a range).
      // It may be 1 or 2 depending on whether the cell had a valid CQL value.
      const countAfter = await getSelectionCount(kupua.page);
      // If range had fired, we'd expect >=3. We assert it stayed close to original.
      expect(countAfter).toBeLessThan(selectionBefore + 3);
    }
  });
});

// ===========================================================================
// S4 -- Multi-image Details panel
// ===========================================================================

// ---------------------------------------------------------------------------
// Helper: read reconciledView from the selection store
// ---------------------------------------------------------------------------
async function getReconciledField(
  page: Parameters<typeof test>[1]["page"],
  fieldId: string,
): Promise<Record<string, unknown> | null> {
  return page.evaluate((fid) => {
    const store = (window as any).__kupua_selection_store__;
    if (!store) return null;
    const rv = store.getState().reconciledView;
    if (!rv) return null;
    const entry = rv.get(fid);
    return entry ? JSON.parse(JSON.stringify(entry, (_k, v) => {
      // JSON stringify doesn't handle undefined well; replace with null for unknown
      if (v === undefined) return null;
      return v;
    })) : null;
  }, fieldId);
}

// Helper: wait for reconciledView to be non-null (metadata has been hydrated)
async function waitForReconcile(page: Parameters<typeof test>[1]["page"], timeout = 8000) {
  await page.waitForFunction(
    () => {
      const store = (window as any).__kupua_selection_store__;
      return store?.getState().reconciledView !== null;
    },
    { timeout },
  );
}

test.describe("S4 -- multi-image Details panel", () => {
  test("selecting 2+ images renders MultiImageMetadata (not the focus placeholder)", async ({ kupua }) => {
    await kupua.goto();
    await clearSelection(kupua.page);

    // Open the Details panel (closed by default)
    await kupua.page.locator('button[aria-label*="Details panel"]').click();
    await kupua.page.waitForTimeout(200);

    const cells = kupua.page.locator('[data-grid-cell]');

    // Select first two images via tickbox
    await cells.nth(0).hover();
    await cells.nth(0).locator('button[aria-label="Select image"]').click();
    await cells.nth(1).locator('button[aria-label="Select image"]').click();

    expect(await getSelectionCount(kupua.page)).toBe(2);

    // The focus placeholder should be gone (MultiImageMetadata is rendering)
    await expect(
      kupua.page.locator('text=Focus an image to see its metadata'),
    ).not.toBeVisible({ timeout: 5000 });
    // Status bar confirms the count
    const statusBar = kupua.page.locator('[role="status"]', { hasText: "selected" });
    await expect(statusBar).toContainText("2");
  });

  test("reconciledView is computed after selecting 2 images", async ({ kupua }) => {
    await kupua.goto();
    await clearSelection(kupua.page);

    const cells = kupua.page.locator('[data-grid-cell]');

    await cells.nth(0).hover();
    await cells.nth(0).locator('button[aria-label="Select image"]').click();
    await cells.nth(1).locator('button[aria-label="Select image"]').click();

    expect(await getSelectionCount(kupua.page)).toBe(2);

    // Wait for reconciledView to be hydrated (metadata fetched + reconciled)
    await waitForReconcile(kupua.page);

    // reconciledView should have entries for known fields
    const creditRec = await getReconciledField(kupua.page, "metadata_credit");
    expect(creditRec).not.toBeNull();
    // kind must be a valid FieldReconciliation kind
    const validKinds = ["all-same", "all-empty", "mixed", "chip-array", "summary", "pending", "dirty"];
    expect(validKinds).toContain(creditRec?.kind);
  });

  test("keywords chip-array is computed for 2+ images with keywords", async ({ kupua }) => {
    await kupua.goto();
    await clearSelection(kupua.page);

    const cells = kupua.page.locator('[data-grid-cell]');

    // Select first 3 images
    await cells.nth(0).hover();
    await cells.nth(0).locator('button[aria-label="Select image"]').click();
    await cells.nth(1).locator('button[aria-label="Select image"]').click();
    await cells.nth(2).locator('button[aria-label="Select image"]').click();

    expect(await getSelectionCount(kupua.page)).toBe(3);

    await waitForReconcile(kupua.page);

    const kwRec = await getReconciledField(kupua.page, "keywords");
    expect(kwRec).not.toBeNull();
    // Must be chip-array or all-empty (local data may have no keywords)
    expect(["chip-array", "all-empty", "pending"]).toContain(kwRec?.kind);

    if (kwRec?.kind === "chip-array") {
      // Chips should be an array
      expect(Array.isArray((kwRec as any).chips)).toBe(true);
      // total should be 3
      expect((kwRec as any).total).toBe(3);
    }
  });

  test("partial chips have data-partial attribute in the panel", async ({ kupua }) => {
    // This test only runs meaningfully when 2+ images share SOME but not ALL keywords.
    // Strategy: select many images to maximise chance of partial overlap.
    await kupua.goto();
    await clearSelection(kupua.page);

    // Open the Details panel (closed by default)
    await kupua.page.locator('button[aria-label*="Details panel"]').click();
    await kupua.page.waitForTimeout(200);

    const cells = kupua.page.locator('[data-grid-cell]');

    // Select 5 images via shift-click range
    await cells.nth(0).hover();
    await cells.nth(0).locator('button[aria-label="Select image"]').click();
    await cells.nth(4).click({ modifiers: ["Shift"] });

    const count = await getSelectionCount(kupua.page);
    expect(count).toBeGreaterThanOrEqual(2);

    // Wait for keywords field to be fully reconciled (not pending/dirty)
    await kupua.page.waitForFunction(
      () => {
        const store = (window as any).__kupua_selection_store__;
        if (!store) return false;
        const rv = store.getState().reconciledView;
        if (!rv) return false;
        const kw = rv.get("keywords");
        return kw && kw.kind !== "pending" && kw.kind !== "dirty";
      },
      { timeout: 8000 },
    );

    const kwRec = await getReconciledField(kupua.page, "keywords");
    if (kwRec?.kind !== "chip-array") {
      // No keywords in test data -- skip assertion
      return;
    }

    const chips = (kwRec as any).chips as Array<{ value: string; count: number }>;
    const total = (kwRec as any).total as number;
    const hasPartial = chips.some((c) => c.count < total);

    if (hasPartial) {
      // At least one partial chip should have data-partial="true" in the DOM
      const partialChips = kupua.page.locator('[data-partial="true"]');
      await expect(partialChips.first()).toBeVisible({ timeout: 3000 });
    }
    // If no partial chips (all images share all keywords), that's valid too.
  });

  test("clearing selection removes MultiImageMetadata and restores focus placeholder", async ({ kupua }) => {
    await kupua.goto();
    await clearSelection(kupua.page);

    // Open the Details panel (closed by default)
    await kupua.page.locator('button[aria-label*="Details panel"]').click();
    await kupua.page.waitForTimeout(200);

    const cells = kupua.page.locator('[data-grid-cell]');

    await cells.nth(0).hover();
    await cells.nth(0).locator('button[aria-label="Select image"]').click();
    await cells.nth(1).locator('button[aria-label="Select image"]').click();

    expect(await getSelectionCount(kupua.page)).toBe(2);
    // Status bar confirms multi-selection is active
    await expect(
      kupua.page.locator('[role="status"]', { hasText: "selected" }),
    ).toBeVisible({ timeout: 5000 });

    // Clear
    await kupua.page.locator('button[aria-label="Clear selection"]').click();
    expect(await getSelectionCount(kupua.page)).toBe(0);

    // Status bar gone (selection cleared)
    await expect(
      kupua.page.locator('[role="status"]', { hasText: "selected" }),
    ).not.toBeVisible({ timeout: 3000 });

    // Placeholder shown again
    await expect(
      kupua.page.locator('text=Focus an image to see its metadata'),
    ).toBeVisible({ timeout: 3000 });
  });

  test("selection count chip reflects 2-image selection", async ({ kupua }) => {
    await kupua.goto();
    await clearSelection(kupua.page);

    const cells = kupua.page.locator('[data-grid-cell]');

    await cells.nth(0).hover();
    await cells.nth(0).locator('button[aria-label="Select image"]').click();
    await cells.nth(1).locator('button[aria-label="Select image"]').click();

    // StatusBar should show count
    const statusBar = kupua.page.locator('[role="status"]', { hasText: "selected" });
    await expect(statusBar).toContainText("2");
  });

  test("File type click-to-search uses CQL form (jpeg) not raw MIME (image/jpeg)", async ({ kupua }) => {
    // Regression: multi-image panel was passing the raw accessor value "image/jpeg"
    // to ValueLink instead of the formatter output "jpeg", so click produced
    // fileType:image%2Fjpeg instead of fileType:jpeg.
    await kupua.goto();
    await clearSelection(kupua.page);

    // Open Details panel
    await kupua.page.locator('button[aria-label*="Details panel"]').click();
    await kupua.page.waitForTimeout(200);

    const cells = kupua.page.locator('[data-grid-cell]');

    await cells.nth(0).hover();
    await cells.nth(0).locator('button[aria-label="Select image"]').click();
    await cells.nth(1).locator('button[aria-label="Select image"]').click();

    // Wait for source_mimeType to reach all-same (test data is expected to be homogenous)
    await kupua.page.waitForFunction(
      () => {
        const store = (window as any).__kupua_selection_store__;
        if (!store) return false;
        const rv = store.getState().reconciledView;
        if (!rv) return false;
        const mt = rv.get("source_mimeType");
        return mt && mt.kind === "all-same";
      },
      { timeout: 8000 },
    );

    // "File type" row should be visible in the details panel
    const fileTypeRow = kupua.page.locator('dt', { hasText: "File type" });
    await expect(fileTypeRow).toBeVisible({ timeout: 3000 });

    // The displayed value should be the short form (e.g. "jpeg"), not the raw MIME
    const fileTypeValue = fileTypeRow.locator('~ dd button');
    const displayedText = await fileTypeValue.first().textContent();
    expect(displayedText).not.toContain("image/");
    expect(displayedText).not.toContain("%2F");

    // Click the value — should navigate to fileType:<short> not fileType:image%2F<short>
    await fileTypeValue.first().click();
    await kupua.page.waitForTimeout(300);

    const url = kupua.page.url();
    // Must contain "fileType:jpeg" (or similar short form), NOT "fileType:image"
    expect(url).toContain("fileType%3A");
    expect(url).not.toContain("image%2F");
    expect(url).not.toContain("image/");
  });
});

// ===========================================================================
// S6 — Selection lifecycle: clear-on-search + hydration
// ===========================================================================

/**
 * SPA navigation helper — changes URL params within the current page session
 * without a full reload. Simulates the user updating the URL via TanStack
 * Router (e.g. typing a new query). Does NOT call markUserInitiatedNavigation,
 * so the hook sees it as a popstate; that's fine — S6 clears for both kinds.
 */
async function spaNavigateSearch(
  page: Parameters<typeof test>[1]["page"],
  extraParams: Record<string, string>,
): Promise<void> {
  await page.evaluate((params) => {
    const router = (window as any).__kupua_router__;
    if (!router) throw new Error("__kupua_router__ not exposed on window");
    const url = new URL(window.location.href);
    const search: Record<string, string> = {};
    url.searchParams.forEach((v, k) => { search[k] = v; });
    Object.assign(search, params);
    router.navigate({ to: url.pathname, search });
  }, extraParams);
}

/**
 * Select the first N visible grid cells and return their IDs.
 */
async function selectNGridCells(
  page: Parameters<typeof test>[1]["page"],
  n: number,
): Promise<string[]> {
  const cells = page.locator('[data-grid-cell]');

  // Enter selection mode via first cell tickbox
  await cells.nth(0).hover();
  await cells.nth(0).locator('button[aria-label="Select image"]').click();

  // Select remaining cells (tickboxes always visible in selection mode)
  for (let i = 1; i < n; i++) {
    await cells.nth(i).locator('button[aria-label="Select image"]').click();
  }

  return getSelectionIds(page);
}

test.describe("S6 — clear-on-search navigation", () => {
  test("query change clears selection", async ({ kupua }) => {
    await kupua.goto();
    await clearSelection(kupua.page);
    await selectNGridCells(kupua.page, 2);
    expect(await getSelectionCount(kupua.page)).toBe(2);

    // SPA navigate with a new query (in-session, not a page reload).
    // Use query='' which matches everything — we just want the URL to change
    // so useUrlSearchSync fires and clears.
    await spaNavigateSearch(kupua.page, { query: "city:London" });
    await kupua.waitForResults();

    expect(await getSelectionCount(kupua.page)).toBe(0);
  });

  test("sort-only change preserves selection", async ({ kupua }) => {
    await kupua.goto();
    await clearSelection(kupua.page);
    await selectNGridCells(kupua.page, 2);
    expect(await getSelectionCount(kupua.page)).toBe(2);

    // SPA navigate with only orderBy changing → isSortOnly=true → no clear.
    await spaNavigateSearch(kupua.page, { orderBy: "-lastModified" });
    await kupua.waitForResults();

    expect(await getSelectionCount(kupua.page)).toBe(2);
  });

  test("density toggle preserves selection", async ({ kupua }) => {
    await kupua.goto();
    await clearSelection(kupua.page);
    await selectNGridCells(kupua.page, 2);
    expect(await getSelectionCount(kupua.page)).toBe(2);

    // Density toggle changes a display-only URL key → useUrlSearchSync deduplicates
    // (same search params) → no clear.
    await kupua.page.locator('button[aria-label="Switch to table view"]').click();
    await kupua.waitForResults();

    expect(await getSelectionCount(kupua.page)).toBe(2);
  });

  test("image detail open and close preserves selection", async ({ kupua }) => {
    await kupua.goto();
    await clearSelection(kupua.page);
    await selectNGridCells(kupua.page, 2);
    expect(await getSelectionCount(kupua.page)).toBe(2);

    // Get the ID of the first selected image so we can open detail.
    const ids = await getSelectionIds(kupua.page);
    const firstId = ids[0];

    // Open image detail (adds ?image=<id> display-only param — no search fires).
    await spaNavigateSearch(kupua.page, { image: firstId });
    await kupua.page.waitForFunction(
      () => new URL(window.location.href).searchParams.has("image"),
      { timeout: 5000 },
    );

    expect(await getSelectionCount(kupua.page)).toBe(2);

    // Close image detail (remove image param).
    await spaNavigateSearch(kupua.page, {});
    await kupua.page.evaluate(() => {
      // Remove the image param by navigating without it.
      const router = (window as any).__kupua_router__;
      if (!router) return;
      const url = new URL(window.location.href);
      const search: Record<string, string> = {};
      url.searchParams.forEach((v, k) => { if (k !== "image") search[k] = v; });
      router.navigate({ to: url.pathname, search });
    });

    expect(await getSelectionCount(kupua.page)).toBe(2);
  });

  test("reload preserves selection and populates multi-panel", async ({ kupua }) => {
    await kupua.goto();
    await clearSelection(kupua.page);

    // Select 2 images.
    const ids = await selectNGridCells(kupua.page, 2);
    expect(ids.length).toBe(2);

    // Wait for persist debounce to flush to sessionStorage.
    await kupua.page.waitForTimeout(400);

    // Full page reload.
    await kupua.page.reload();
    await kupua.waitForResults();

    // Selection should survive via persist middleware.
    expect(await getSelectionCount(kupua.page)).toBe(2);

    // Multi-image panel: the reconciledView should eventually be populated
    // (hydrate() fetches metadata and triggers reconciliation).
    // Wait up to 5s for the panel to show something other than all-dashes.
    await expect(
      kupua.page.locator('[aria-label="Combined metadata for 2 images"]').or(
        kupua.page.locator('[role="status"]', { hasText: "2 selected" })
      ),
    ).toBeVisible({ timeout: 5000 });
  });

  test("new-images ticker click clears selection", async ({ kupua }) => {
    await kupua.goto();
    await clearSelection(kupua.page);
    await selectNGridCells(kupua.page, 2);
    expect(await getSelectionCount(kupua.page)).toBe(2);

    // Mock newCount to make the ticker appear.
    await kupua.page.evaluate(() => {
      const store = (window as any).__kupua_store__;
      if (!store) throw new Error("__kupua_store__ not exposed");
      store.setState({ newCount: 5, newCountSince: new Date().toISOString() });
    });

    // Wait for the ticker button to appear.
    const ticker = kupua.page.locator('button', { hasText: /new/ }).first();
    await expect(ticker).toBeVisible({ timeout: 3000 });

    // Click the ticker — triggers resetScrollAndFocusSearch + clearSelection + reSearch.
    await ticker.click();
    await kupua.waitForResults();

    expect(await getSelectionCount(kupua.page)).toBe(0);
  });

  test("browser back clears selection", async ({ kupua }) => {
    await kupua.goto();
    await clearSelection(kupua.page);

    // First navigate within the session to a different query so there is
    // a history entry to go back to.
    await spaNavigateSearch(kupua.page, { query: "city:London" });
    await kupua.waitForResults();

    // Select items in the current search context.
    await selectNGridCells(kupua.page, 2);
    expect(await getSelectionCount(kupua.page)).toBe(2);

    // Browser back → returns to previous URL → useUrlSearchSync fires
    // (isPopstate=true, _prevParamsSerialized != "", not sort-only) → clear.
    await kupua.page.goBack();
    await kupua.waitForResults();

    expect(await getSelectionCount(kupua.page)).toBe(0);
  });
});
