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

import { test, expect, waitForStableNthImageId } from "../shared/helpers";

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

async function waitForSelectionPersisted(
  page: Parameters<typeof test>[1]["page"],
  expectedIds: string[],
): Promise<void> {
  await expect.poll(() => page.evaluate(() => {
    const raw = sessionStorage.getItem("kupua-selection");
    if (!raw) return [];
    try {
      return (JSON.parse(raw)?.state?.selectedIds ?? []).sort();
    } catch {
      return [];
    }
  })).toEqual([...expectedIds].sort());
}

async function getSignedUsablePlacement(
  page: Parameters<typeof test>[1]["page"],
  imageId: string,
): Promise<number | null> {
  return page.evaluate((id) => {
    const container = document.querySelector('[aria-label="Image results grid"]');
    const cell = document.querySelector(`[data-image-id="${CSS.escape(id)}"]`);
    if (!container || !cell) return null;
    const containerRect = container.getBoundingClientRect();
    const cellRect = cell.getBoundingClientRect();
    if (cellRect.top < containerRect.top || cellRect.bottom > containerRect.bottom) return null;
    const usableCenter = containerRect.top + containerRect.height / 2;
    return (cellRect.top + cellRect.height / 2 - usableCenter) / containerRect.height;
  }, imageId);
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

  test("selection anchor outranks older focus during sort", async ({ kupua }) => {
    await kupua.gotoWithParams("since=2026-03-15&until=2026-03-20");
    await clearSelection(kupua.page);

    await kupua.focusNthItem(0);
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).not.toBeNull();

    const selectionAnchorId = await waitForStableNthImageId(
      kupua.page,
      "[data-grid-cell]",
      8,
    );
    expect(selectionAnchorId).not.toBe(focusedId);
    const selectionCell = kupua.page.locator(
      `[data-grid-cell][data-image-id="${selectionAnchorId}"]`,
    );
    await selectionCell.hover();
    await selectionCell.locator('button[aria-label="Select image"]').click();
    expect(await getSelectionIds(kupua.page)).toEqual([selectionAnchorId]);

    const placementBefore = await getSignedUsablePlacement(kupua.page, selectionAnchorId);
    expect(placementBefore).not.toBeNull();

    const generationBefore = await kupua.page.evaluate(() =>
      (window as any).__kupua_store__.getState().sortAroundFocusGeneration,
    );
    const paintedStateCount = kupua.page.evaluate(async (previousGeneration) => {
      const signatures = new Set<string>();
      let settledAt: number | null = null;
      await new Promise<void>((resolve) => {
        const sample = () => {
          const container = document.querySelector('[aria-label="Image results grid"]');
          const store = (window as any).__kupua_store__.getState();
          if (container) {
            const containerRect = container.getBoundingClientRect();
            const signature = Array.from(container.querySelectorAll('[data-grid-cell][data-image-id]'))
              .map((element) => {
                const rect = element.getBoundingClientRect();
                return {
                  value: `${element.getAttribute("data-image-id")}:${Math.round(rect.top - containerRect.top)}`,
                  visible: rect.bottom > containerRect.top && rect.top < containerRect.bottom,
                };
              })
              .filter(({ visible }) => visible)
              .map(({ value }) => value)
              .join("|");
            signatures.add(signature);
          }
          if (
            store.sortAroundFocusGeneration > previousGeneration &&
            !store.loading &&
            !store.sortAroundFocusStatus
          ) {
            settledAt ??= performance.now();
          }
          if (settledAt != null && performance.now() - settledAt >= 700) {
            resolve();
          } else {
            requestAnimationFrame(sample);
          }
        };
        requestAnimationFrame(sample);
      });
      return signatures.size;
    }, generationBefore);

    await kupua.toggleSortDirection();
    await kupua.waitForSortAroundFocus(15_000);
    expect(await paintedStateCount, "sort must paint only pre and final states").toBe(2);

    expect(await kupua.getFocusedImageId()).toBe(focusedId);
    const placementAfter = await getSignedUsablePlacement(kupua.page, selectionAnchorId);
    expect(placementAfter, "selection anchor B must remain fully visible after sort").not.toBeNull();
    expect(
      Math.abs(placementAfter! - placementBefore!),
      `selection anchor B moved: before=${placementBefore}, after=${placementAfter}`,
    ).toBeLessThan(0.05);

    const scrollBeforeClear = await kupua.getScrollTop();
    await kupua.page.locator('button[aria-label="Clear selection"]').click();
    await kupua.page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));

    expect(await getSelectionCount(kupua.page)).toBe(0);
    expect(await kupua.getFocusedImageId()).toBe(focusedId);
    expect(await kupua.getScrollTop()).toBe(scrollBeforeClear);
  });
});

// ===========================================================================
// Table — selection column
// ===========================================================================

test.describe("Table — selection column", () => {
  test("selection column is present (leftmost) in table view", async ({ kupua }) => {
    await kupua.goto();
    await kupua.switchToTable();

    const firstHeader = kupua.page.locator('[aria-label="Image results table"] [role="columnheader"]').first();
    await expect(firstHeader).toHaveAttribute("aria-label", "Selection");
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

  test("shift+click on field-value cell ranges instead of searching in selection mode", async ({ kupua }) => {
    await kupua.goto();
    await kupua.switchToTable();
    await clearSelection(kupua.page);

    const rows = kupua.page.locator('[aria-label="Image results table"] [role="row"][class*="cursor-pointer"]');

    // Enter selection mode.
    await rows.nth(0).hover();
    await rows.nth(0).locator('button[aria-label="Select image"]').click();
    expect(await getSelectionCount(kupua.page)).toBe(1);

    const expectedRangeIds = await rows.evaluateAll((visibleRows) =>
      visibleRows.slice(0, 3)
        .map((row) => row.getAttribute("data-image-id"))
        .filter((id): id is string => id !== null),
    );
    expect(expectedRangeIds).toHaveLength(3);
    const queryBefore = await kupua.page.evaluate(
      () => new URL(location.href).searchParams.get("query"),
    );

    // Local mock data guarantees a Credit value on every row. In selection
    // mode, modifier field-cell search is intentionally suppressed. The click
    // bubbles to the row, where Shift retains its range-selection meaning.
    const creditCell = rows.nth(2).locator(
      '[role="gridcell"][data-cql-cell][style*="--col-metadata_credit"]',
    );
    await expect(creditCell).toHaveCount(1);
    expect(await creditCell.getAttribute("title")).toBeTruthy();
    await creditCell.click({ modifiers: ["Shift"] });

    expect(await getSelectionIds(kupua.page)).toEqual(expectedRangeIds);
    expect(await kupua.page.evaluate(
      () => new URL(location.href).searchParams.get("query"),
    )).toBe(queryBefore);
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

    const cells = kupua.page.locator('[data-grid-cell]');

    // Select first two images via tickbox
    await cells.nth(0).hover();
    await cells.nth(0).locator('button[aria-label="Select image"]').click();
    await cells.nth(1).hover();
    await cells.nth(1).locator('button[aria-label="Select image"]').click();

    expect(await getSelectionCount(kupua.page)).toBe(2);
    await waitForReconcile(kupua.page);

    // MultiImageMetadata must render an actual combined metadata field.
    await expect(
      kupua.page.locator('text=Focus an image to see its metadata'),
    ).not.toBeVisible({ timeout: 5000 });
    await expect(kupua.page.locator("dt", { hasText: "File type" })).toBeVisible();
    // Status bar confirms the count
    const statusBar = kupua.page.locator('[role="status"]', { hasText: "selected" });
    await expect(statusBar).toContainText("2");
  });

  test("partial chips have data-partial attribute in the panel", async ({ kupua }) => {
    await kupua.goto();
    await clearSelection(kupua.page);

    // Open the Details panel (closed by default)
    await kupua.page.locator('button[aria-label*="Details panel"]').click();

    const cells = kupua.page.locator('[data-grid-cell]');
    const selectedIds = await cells.evaluateAll((visibleCells) =>
      visibleCells.slice(0, 2)
        .map((cell) => cell.getAttribute("data-image-id"))
        .filter((id): id is string => id !== null),
    );
    expect(selectedIds).toHaveLength(2);

    // Preserve the real getByIds path while enriching only this deterministic
    // fixture with one shared and one partial keyword.
    await kupua.page.evaluate((electedIds) => {
      const store = (window as any).__kupua_selection_store__;
      const source = store.getState().dataSource;
      store.setState({
        dataSource: {
          ...source,
          getByIds: async (requestedIds: string[], signal?: AbortSignal) => {
            const images = await source.getByIds(requestedIds, signal);
            return images.map((image: any) => ({
              ...image,
              metadata: {
                ...image.metadata,
                keywords: image.id === electedIds[0] ? ["shared", "partial"] : ["shared"],
              },
            }));
          },
        },
      });
    }, selectedIds);

    for (const id of selectedIds) {
      const cell = kupua.page.locator(`[data-grid-cell][data-image-id="${id}"]`);
      await cell.hover();
      await cell.locator('button[aria-label="Select image"]').click();
    }
    expect(await getSelectionIds(kupua.page)).toEqual(selectedIds);

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

    const sharedChip = kupua.page.getByRole("button", { name: "shared" });
    const partialChip = kupua.page.getByRole("button", { name: "partial" });
    await expect(sharedChip).not.toHaveAttribute("data-partial", "true");
    await expect(partialChip).toHaveAttribute("data-partial", "true");
  });

  test("clearing selection removes MultiImageMetadata and restores focus placeholder", async ({ kupua }) => {
    await kupua.goto();
    await clearSelection(kupua.page);

    // Open the Details panel (closed by default)
    await kupua.page.locator('button[aria-label*="Details panel"]').click();

    const cells = kupua.page.locator('[data-grid-cell]');

    await cells.nth(0).hover();
    await cells.nth(0).locator('button[aria-label="Select image"]').click();
    await cells.nth(1).hover();
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

  test("File type click-to-search uses CQL form (jpeg) not raw MIME (image/jpeg)", async ({ kupua }) => {
    // Regression: multi-image panel was passing the raw accessor value "image/jpeg"
    // to ValueLink instead of the formatter output "jpeg", so click produced
    // fileType:image%2Fjpeg instead of fileType:jpeg.
    await kupua.goto();
    await clearSelection(kupua.page);

    // Open Details panel
    await kupua.page.locator('button[aria-label*="Details panel"]').click();

    const cells = kupua.page.locator('[data-grid-cell]');

    await cells.nth(0).hover();
    await cells.nth(0).locator('button[aria-label="Select image"]').click();
    await cells.nth(1).hover();
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
    await kupua.page.waitForURL((nextUrl) => {
      const href = nextUrl.href;
      return href.includes("fileType%3Ajpeg") || href.includes("fileType:jpeg");
    });

    const url = kupua.page.url();
    // Must contain "fileType:jpeg" (or similar short form), NOT "fileType:image"
    // The colon may appear encoded (%3A) or unencoded in the query string.
    expect(url.includes("fileType%3Ajpeg") || url.includes("fileType:jpeg")).toBe(true);
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
    const selectedIds = await selectNGridCells(kupua.page, 2);
    expect(selectedIds).toHaveLength(2);

    // SPA navigate with only orderBy changing → isSortOnly=true → no clear.
    await spaNavigateSearch(kupua.page, { orderBy: "-lastModified" });
    await kupua.waitForResults();

    expect(await getSelectionCount(kupua.page)).toBe(2);
    expect(await getSelectionIds(kupua.page)).toEqual(selectedIds);
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

    expect(await getSelectionIds(kupua.page)).toEqual(ids);

    // Close image detail (remove image param).
    await kupua.page.evaluate(() => {
      const router = (window as any).__kupua_router__;
      if (!router) throw new Error("__kupua_router__ not exposed");
      const url = new URL(window.location.href);
      const search: Record<string, string> = {};
      url.searchParams.forEach((v, k) => { if (k !== "image") search[k] = v; });
      router.navigate({ to: url.pathname, search });
    });
    await kupua.waitForDetailClosed();

    expect(await getSelectionIds(kupua.page)).toEqual(ids);
  });

  test("reload preserves selection and populates multi-panel", async ({ kupua }) => {
    await kupua.goto();
    await clearSelection(kupua.page);

    // Select 2 images.
    const ids = await selectNGridCells(kupua.page, 2);
    expect(ids.length).toBe(2);

    await waitForSelectionPersisted(kupua.page, ids);

    // Full page reload.
    await kupua.page.reload();
    await kupua.waitForResults();

    // Selection should survive via persist middleware with exact identities.
    await expect.poll(async () => (await getSelectionIds(kupua.page)).sort()).toEqual(
      [...ids].sort(),
    );

    // hydrate() must fetch metadata, complete reconciliation and render the
    // multi-image panel rather than merely restoring the status count.
    await waitForReconcile(kupua.page);
    await kupua.page.locator('button[aria-label*="Details panel"]').click();
    await expect(
      kupua.page.locator('text=Focus an image to see its metadata'),
    ).not.toBeVisible({ timeout: 5000 });
    expect(await getSelectionIds(kupua.page)).toEqual(ids);
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
