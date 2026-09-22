/**
 * Feature specification tests — "this UI feature does X."
 *
 * Unlike the bug-regression tests in scrubber.spec.ts and
 * buffer-corruption.spec.ts, these tests specify what features SHOULD DO,
 * not what bugs they fixed. They protect against regressions in core user
 * interactions that aren't covered by the scroll/seek/buffer test suite.
 *
 * Run:
 *   npx playwright test e2e/local/ui-features.spec.ts
 *   npx playwright test e2e/local/ui-features.spec.ts --headed
 */

import { test, expect } from "../shared/helpers";

// Pin to explicit focus mode — tests validate focus ring, Enter-to-open,
// return-from-detail with focus, and fullscreen entry which are explicit-only.
test.beforeEach(async ({ kupua }) => {
  await kupua.ensureExplicitMode();
});

test("top-level date bounds exclude equality from results, counts and ranks", async ({ kupua }) => {
  const initialSearch = kupua.page.waitForRequest((request) =>
    request.method() === "POST" &&
    new URL(request.url()).pathname === "/es/images/_search" &&
    request.postDataJSON()?.size > 0,
  );
  await kupua.goto();
  const query = (await initialSearch).postDataJSON().query;

  for (const [field, lower, upper] of [
    ["uploadTime", "since", "until"],
    ["metadata.dateTaken", "takenSince", "takenUntil"],
    ["lastModified", "modifiedSince", "modifiedUntil"],
  ] as const) {
    const samples = await kupua.page.evaluate(async ({ field, query }) => {
      const response = await fetch("/es/images/_search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          size: 0,
          query,
          aggs: {
            dates: {
              terms: { field, size: 3, order: { _key: "asc" } },
              aggs: { image: { top_hits: { size: 1, _source: ["id"] } } },
            },
          },
        }),
      });
      if (!response.ok) throw new Error(`Date fixture lookup failed: ${response.status}`);
      const data = await response.json() as {
        aggregations: {
          dates: {
            buckets: Array<{
              key: number;
              image: { hits: { hits: Array<{ _source: { id: string } }> } };
            }>;
          };
        };
      };
      return data.aggregations.dates.buckets.map((bucket) => ({
        id: bucket.image.hits.hits[0]._source.id,
        date: new Date(bucket.key).toISOString(),
      }));
    }, { field, query });

    expect(samples, `${field} needs before/equal/after samples`).toHaveLength(3);
    for (const [parameter, expectedId] of [
      [lower, samples[2].id],
      [upper, samples[0].id],
    ]) {
      await kupua.gotoWithParams(new URLSearchParams({
        ids: samples.map((sample) => sample.id).join(","),
        orderBy: "uploadTime",
        [parameter]: samples[1].date,
      }).toString());

      const result = await kupua.page.evaluate(async () => {
        const state = (window as any).__kupua_store__.getState();
        return {
          ids: state.results.filter(Boolean).map((image: { id: string }) => image.id),
          total: state.total,
          count: await state.dataSource.count(state.params),
          rank: await state.dataSource.countBefore(state.params, state.startCursor),
          error: state.error,
        };
      });
      expect(result, parameter).toEqual({
        ids: [expectedId], total: 1, count: 1, rank: 0, error: null,
      });
    }
  }
});

test.describe("API-shaped cursors", () => {
  for (const view of ["grid", "table"] as const) {
    test(`${view}: retains range anchors and detail history across cache eviction`, async ({ kupua }) => {
      await kupua.goto();
      const alias = await kupua.page.evaluate(async () => {
        const mockPath = "/src/dal/mock-data-source.ts";
        const configPath = "/src/lib/grid-config.ts";
        const [{ MockDataSource }, { gridConfig }] = await Promise.all([
          import(mockPath), import(configPath),
        ]);
        const alias = gridConfig.fieldAliases.find((field: { elasticsearchPath: string }) =>
          field.elasticsearchPath.startsWith("fileMetadata."),
        );
        if (!alias) throw new Error("Fixture requires a fileMetadata alias");
        const source = new MockDataSource(10_000);
        const searchAfter = source.searchAfter.bind(source);
        source.searchAfter = async (...args: any[]) => {
          const result = await searchAfter(...args);
          return {
            ...result,
            hits: result.hits.map((image: any) => ({
              ...image,
              fileMetadata: undefined,
              aliases: { [alias.alias]: "fixture-alias-value" },
            })),
            sortValues: result.hits.map((image: any) => [
              "fixture-alias-value", Date.parse(image.uploadTime), image.id,
            ]),
          };
        };
        source.getByIds = async () => { throw new Error("fixture metadata unavailable"); };
        const rangeCursors: any[] = [];
        const getIdRange = source.getIdRange.bind(source);
        source.getIdRange = async (...args: any[]) => {
          rangeCursors.push({ from: args[1], to: args[2] });
          return getIdRange(...args);
        };
        (window as any).__c1_range_cursors__ = rangeCursors;
        const store = (window as any).__kupua_store__;
        const selection = (window as any).__kupua_selection_store__;
        selection.getState().clear();
        selection.setState({ dataSource: source });
        store.getState().setFocusedImageId(null);
        store.setState({ dataSource: source });
        (window as any).__kupua_markUserNav__();
        (window as any).__kupua_router__.navigate({
          to: "/search",
          search: { nonFree: "true", orderBy: alias.alias },
          replace: true,
        });
        return alias.alias;
      });
      await kupua.page.waitForFunction((orderBy) => {
        const state = (window as any).__kupua_store__.getState();
        return state.params.orderBy === orderBy && !state.loading && state.results[0]?.id === "img-0";
      }, alias);
      if (view === "table") await kupua.switchToTable();
      await kupua.waitForResults();

      const anchorCell = kupua.page.locator('[data-image-id="img-0"]').first();
      await anchorCell.hover();
      await anchorCell.locator('button[aria-label="Select image"]').click();
      await expect.poll(() => kupua.page.evaluate(() =>
        (window as any).__kupua_selection_store__.getState().anchorId,
      )).toBe("img-0");

      await kupua.page.evaluate(async () => {
        const store = (window as any).__kupua_store__;
        for (let offset = 200; offset <= 2400; offset += 200) {
          await store.getState().seek(offset);
        }
      });
      await kupua.seekTo(0.27);
      const target = await kupua.page.evaluate(() => {
        const state = (window as any).__kupua_store__.getState();
        const id = (window as any).__kupua_getViewportAnchorId__();
        if (!id) throw new Error("Fixture viewport anchor is unavailable");
        return { id, position: state.imagePositions.get(id) };
      });
      expect(target.position).toBeGreaterThan(2000);
      const targetCell = kupua.page.locator(`[data-image-id="${target.id}"]`).first();
      await targetCell.locator('button[aria-label="Select image"]').click({ modifiers: ["Shift"] });
      await expect.poll(() => kupua.page.evaluate(() =>
        (window as any).__kupua_selection_store__.getState().selectedIds.size,
      )).toBe(target.position + 1);
      const ranges = await kupua.page.evaluate(() => (window as any).__c1_range_cursors__);
      expect(ranges).toHaveLength(1);
      expect(ranges[0].from).toEqual(["fixture-alias-value", expect.any(Number), "img-0"]);
      expect(ranges[0].to).toEqual(["fixture-alias-value", expect.any(Number), target.id]);

      await kupua.page.evaluate(() => (window as any).__kupua_selection_store__.getState().clear());
      await targetCell.dblclick();
      expect(await kupua.getDetailImageId()).toBe(target.id);
      const readCursor = () => kupua.page.evaluate(() => {
        const id = new URL(location.href).searchParams.get("image");
        const cached = JSON.parse(sessionStorage.getItem(`kupua:imgOffset:${id}`) ?? "null");
        return { id, cursor: cached?.cursor };
      });
      expect((await readCursor()).cursor)
        .toEqual(["fixture-alias-value", expect.any(Number), target.id]);
      await kupua.detailNextAndWait();
      const traversed = await readCursor();
      expect(traversed.id).not.toBe(target.id);
      expect(traversed.cursor).toEqual(["fixture-alias-value", expect.any(Number), traversed.id]);
      await kupua.assertPositionsConsistent();
    });
  }
});

// ===========================================================================
// Image detail — opening
// ===========================================================================

test.describe("Image detail — opening", () => {
  test("double-click on grid cell opens image detail with correct image", async ({ kupua }) => {
    await kupua.goto();

    // Note the ID of the image at position 2 (third cell)
    const targetImage = await kupua.page.evaluate(() => {
      const store = (window as any).__kupua_store__;
      return store?.getState().results[2]?.id ?? null;
    });
    expect(targetImage).not.toBeNull();

    // Double-click to open detail
    const imageId = await kupua.openDetailForNthItem(2);

    // The URL should contain ?image=<id>
    const urlImageParam = await kupua.getDetailImageId();
    expect(urlImageParam).toBe(targetImage);
    expect(imageId).toBe(targetImage);
    // The rendered image must also match (not just the URL param)
    expect(await kupua.getRenderedDetailImageId()).toBe(targetImage);

    // The "Back to search" button should be visible
    const backButton = kupua.page.locator("button", { hasText: "Back to search" });
    await expect(backButton).toBeVisible();
  });

  test("double-click on table row opens image detail with correct image", async ({ kupua }) => {
    await kupua.goto();
    await kupua.switchToTable();

    // Note the ID of the image at position 2
    const targetImage = await kupua.page.evaluate(() => {
      const store = (window as any).__kupua_store__;
      return store?.getState().results[2]?.id ?? null;
    });
    expect(targetImage).not.toBeNull();

    // Double-click to open detail
    const imageId = await kupua.openDetailForNthItem(2);

    // The URL should contain ?image=<id>
    const urlImageParam = await kupua.getDetailImageId();
    expect(urlImageParam).toBe(targetImage);
    expect(imageId).toBe(targetImage);
    // The rendered image must also match (not just the URL param)
    expect(await kupua.getRenderedDetailImageId()).toBe(targetImage);

    // The "Back to search" button should be visible
    const backButton = kupua.page.locator("button", { hasText: "Back to search" });
    await expect(backButton).toBeVisible();
  });
});

// ===========================================================================
// Image detail — closing and focus preservation
// ===========================================================================

test.describe("Image detail — closing", () => {
  test("Back to search button returns to grid with opened image focused and in view", async ({ kupua }) => {
    await kupua.goto();

    // Scroll down a bit so the focused image isn't at scrollTop=0
    await kupua.scrollBy(600);
    await kupua.page.waitForTimeout(200);

    // Open image detail for the 5th item
    await kupua.focusNthItem(4);
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).not.toBeNull();
    await kupua.openDetailForNthItem(4);

    // Click "Back to search"
    await kupua.closeDetailViaButton();

    // URL should no longer have ?image=
    const imageParam = await kupua.getDetailImageId();
    expect(imageParam).toBeNull();

    // The same image should still be focused
    expect(await kupua.getFocusedImageId()).toBe(focusedId);

    // The focused image should be visible in the viewport (not scrolled out of view)
    const isVisible = await kupua.page.evaluate((fid) => {
      const store = (window as any).__kupua_store__;
      if (!store) return false;
      const s = store.getState();
      const globalPos = s.imagePositions.get(fid);
      if (globalPos == null) return false;
      const localIdx = globalPos - s.bufferOffset;

      const grid = document.querySelector('[aria-label="Image results grid"]') as HTMLElement;
      if (!grid) return false;

      const cols = Math.max(1, Math.floor(grid.clientWidth / 280));
      const rowTop = Math.floor(localIdx / cols) * 303;
      const viewportTop = grid.scrollTop - 303;
      const viewportBottom = grid.scrollTop + grid.clientHeight + 303;
      return rowTop >= viewportTop && rowTop <= viewportBottom;
    }, focusedId);

    expect(isVisible, "focused image should be visible in viewport after returning from detail").toBe(true);
  });

  test("Backspace key returns to search with image focused", async ({ kupua }) => {
    await kupua.goto();

    await kupua.openDetailForNthItem(3);
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).not.toBeNull();

    // Press Backspace to close detail
    await kupua.closeDetailViaBackspace();

    // Back on the search page, same image focused
    const imageParam = await kupua.getDetailImageId();
    expect(imageParam).toBeNull();
    expect(await kupua.getFocusedImageId()).toBe(focusedId);
  });
});

// ===========================================================================
// Image detail — arrow key navigation
// ===========================================================================

test.describe("Image detail — navigation", () => {
  test("arrow keys navigate between images in detail view", async ({ kupua }) => {
    await kupua.goto();
    await kupua.openDetailForNthItem(2);

    // Note the starting image
    const firstImageId = await kupua.getDetailImageId();
    expect(firstImageId).not.toBeNull();
    expect(await kupua.getRenderedDetailImageId()).toBe(firstImageId);

    // ArrowRight → next image
    await kupua.detailNextAndWait();
    const secondImageId = await kupua.getDetailImageId();
    expect(secondImageId).not.toBe(firstImageId);
    expect(await kupua.getRenderedDetailImageId()).toBe(secondImageId);

    // ArrowRight again → third image
    await kupua.detailNextAndWait();
    const thirdImageId = await kupua.getDetailImageId();
    expect(thirdImageId).not.toBe(secondImageId);
    expect(await kupua.getRenderedDetailImageId()).toBe(thirdImageId);

    // ArrowLeft → back to second image
    await kupua.detailPrevAndWait();
    const backToSecond = await kupua.getDetailImageId();
    expect(backToSecond).toBe(secondImageId);
    expect(await kupua.getRenderedDetailImageId()).toBe(backToSecond);
  });
});

// ===========================================================================
// Keyboard — Enter opens detail from search
// ===========================================================================

test.describe("Keyboard — Enter", () => {
  test("Enter key on focused image opens detail view", async ({ kupua }) => {
    await kupua.goto();

    // Click an image to focus it (moves focus out of the search input)
    await kupua.focusNthItem(3);
    const focusedId = await kupua.getFocusedImageId();
    expect(focusedId).not.toBeNull();

    // Press Enter to open detail
    await kupua.page.keyboard.press("Enter");
    await kupua.page.waitForFunction(
      () => new URL(window.location.href).searchParams.has("image"),
      { timeout: 5000 },
    );

    // The detail view should show the focused image
    const detailImageId = await kupua.getDetailImageId();
    expect(detailImageId).toBe(focusedId);
    expect(await kupua.getRenderedDetailImageId()).toBe(focusedId);

    // "Back to search" should be visible
    const backButton = kupua.page.locator("button", { hasText: "Back to search" });
    await expect(backButton).toBeVisible();
  });
});


// ===========================================================================
// Image detail — position counter
// ===========================================================================

test.describe("Image detail — position counter", () => {
  test("detail header shows correct position (N of total)", async ({ kupua }) => {
    await kupua.goto();

    const store = await kupua.getStoreState();
    const total = store.total;

    // Open the 3rd image (index 2, so position = 3)
    await kupua.openDetailForNthItem(2);

    // The header should show "3 of 10,000" (or whatever the total is)
    const positionText = kupua.page.locator("header").locator("span", {
      hasText: new RegExp(`3 of ${total.toLocaleString()}`),
    });
    await expect(positionText).toBeVisible();

    // Navigate to the next image
    await kupua.detailNextAndWait();

    // Position should update to "4 of ..."
    const updatedText = kupua.page.locator("header").locator("span", {
      hasText: new RegExp(`4 of ${total.toLocaleString()}`),
    });
    await expect(updatedText).toBeVisible();
  });
});

// ===========================================================================
// Panels — toggle visibility
// ===========================================================================

test.describe("Panel toggles", () => {
  for (const focusSetup of ["no focus", "older focus"] as const) {
    test(`keeps the selected anchor through panel and window resizing (${focusSetup})`, async ({ kupua }) => {
      await kupua.page.setViewportSize({ width: 1720, height: 960 });
      await kupua.goto();
      await kupua.waitForPositionMap();

      const targetPosition = 257;
      await kupua.page.evaluate((position) => {
        const grid = document.querySelector('[aria-label="Image results grid"]') as HTMLElement;
        const cells = Array.from(grid.querySelectorAll<HTMLElement>("[data-grid-cell]"));
        const tops = [...new Set(cells.map((cell) => Math.round(cell.getBoundingClientRect().top)))].sort((left, right) => left - right);
        const columns = cells.filter((cell) => Math.round(cell.getBoundingClientRect().top) === tops[0]).length;
        const targetTop = grid.clientHeight - cells[0].getBoundingClientRect().height - 30;
        grid.scrollTop = Math.floor(position / columns) * (tops[1] - tops[0]) - targetTop;
      }, targetPosition);
      await kupua.page.waitForFunction((position) => {
        const state = (window as any).__kupua_store__.getState();
        return Array.from(document.querySelectorAll<HTMLElement>("[data-grid-cell]")).some(
          (cell) => state.imagePositions.get(cell.dataset.imageId) === position,
        );
      }, targetPosition);

      const { targetId, olderFocusId } = await kupua.page.evaluate((position) => {
        const state = (window as any).__kupua_store__.getState();
        const target = Array.from(document.querySelectorAll<HTMLElement>("[data-grid-cell]")).find(
          (cell) => state.imagePositions.get(cell.dataset.imageId) === position,
        );
        if (!target?.dataset.imageId) throw new Error("Selection resize target unavailable");
        return { targetId: target.dataset.imageId, olderFocusId: (window as any).__kupua_getViewportAnchorId__() as string };
      }, targetPosition);
      expect(olderFocusId).not.toBe(targetId);

      if (focusSetup === "older focus") {
        await kupua.page.locator(`[data-grid-cell][data-image-id="${olderFocusId}"]`).click({ force: true });
      }
      const expectedFocus = focusSetup === "older focus" ? olderFocusId : null;
      expect(await kupua.getFocusedImageId()).toBe(expectedFocus);

      const target = kupua.page.locator(`[data-grid-cell][data-image-id="${targetId}"]`);
      await target.hover();
      await target.getByRole("button", { name: "Select image", exact: true }).click();
      await kupua.page.waitForFunction((imageId) => {
        const selection = (window as any).__kupua_selection_store__.getState();
        return selection.selectedIds.has(imageId) && selection.anchorId === imageId
          && selection.pendingFetchIds.size === 0 && !selection.isReconciling;
      }, targetId);

      const readTarget = (imageId = targetId) => kupua.page.evaluate((imageId) => {
        const grid = document.querySelector('[aria-label="Image results grid"]') as HTMLElement;
        const cell = grid.querySelector(`[data-image-id="${CSS.escape(imageId)}"]`);
        if (!cell) return null;
        const viewport = grid.getBoundingClientRect();
        const rect = cell.getBoundingClientRect();
        return {
          top: rect.top - viewport.top,
          fullyVisible: rect.top >= viewport.top && rect.bottom <= viewport.bottom,
        };
      }, imageId);
      const before = await readTarget();
      if (!before) throw new Error("Selected anchor is not rendered before resize");
      expect(before.fullyVisible).toBe(true);

      const assertPreserved = async (label: string, imageId = targetId, expectedTop = before.top) => {
        await expect.poll(async () => {
          const after = await readTarget(imageId);
          return after ? Math.abs(after.top - expectedTop) : Number.POSITIVE_INFINITY;
        }, { message: `${label}: selected anchor must keep its vertical position` }).toBeLessThanOrEqual(1);
        expect((await readTarget(imageId))?.fullyVisible, `${label}: selected anchor must remain fully visible`).toBe(true);
        expect(await kupua.getFocusedImageId()).toBe(expectedFocus);
      };

      for (const button of ["Show Details panel", "Show Browse panel", "Hide Details panel", "Hide Browse panel"]) {
        await kupua.page.getByRole("button", { name: button, exact: true }).click();
        await kupua.page.waitForTimeout(250);
        await assertPreserved(button);
      }
      for (const width of [1123, 1720]) {
        await kupua.page.setViewportSize({ width, height: 960 });
        await kupua.page.waitForTimeout(250);
        await assertPreserved(`window width ${width}`);
      }

      const nextAnchorId = await kupua.page.evaluate((imageId) => {
        const grid = document.querySelector('[aria-label="Image results grid"]')!;
        const target = grid.querySelector(`[data-image-id="${CSS.escape(imageId)}"]`)!;
        const targetTop = target.getBoundingClientRect().top;
        const row = Array.from(grid.querySelectorAll<HTMLElement>("[data-grid-cell]")).filter(
          (cell) => Math.abs(cell.getBoundingClientRect().top - targetTop) <= 1,
        ).sort((left, right) => left.getBoundingClientRect().left - right.getBoundingClientRect().left);
        return row[0].dataset.imageId!;
      }, targetId);
      expect(nextAnchorId).not.toBe(targetId);
      const nextAnchor = kupua.page.locator(`[data-grid-cell][data-image-id="${nextAnchorId}"]`);
      await nextAnchor.hover();
      await nextAnchor.getByRole("button", { name: "Select image", exact: true }).click();
      await kupua.page.waitForFunction((imageId) => {
        const selection = (window as any).__kupua_selection_store__.getState();
        return selection.selectedIds.size === 2 && selection.anchorId === imageId
          && selection.pendingFetchIds.size === 0 && !selection.isReconciling;
      }, nextAnchorId);
      const nextBefore = await readTarget(nextAnchorId);
      if (!nextBefore) throw new Error("New selection anchor is not rendered");
      expect(nextBefore.fullyVisible).toBe(true);
      for (const button of ["Show Details panel", "Show Browse panel", "Hide Details panel", "Hide Browse panel"]) {
        await kupua.page.getByRole("button", { name: button, exact: true }).click();
        await kupua.page.waitForTimeout(250);
        await assertPreserved(`new selection: ${button}`, nextAnchorId, nextBefore.top);
      }

      const scrollBeforeClear = await kupua.getScrollTop();
      await kupua.page.getByRole("button", { name: "Clear selection", exact: true }).click();
      expect(await kupua.getFocusedImageId()).toBe(expectedFocus);
      expect(await kupua.getScrollTop()).toBe(scrollBeforeClear);
    });
  }

  test("Browse and Details buttons independently toggle their panels", async ({ kupua }) => {
    await kupua.goto();

    const leftSeparator = kupua.page.locator('[aria-label*="Resize left panel"]');
    const rightSeparator = kupua.page.locator('[aria-label*="Resize right panel"]');
    const browseButton = kupua.page.locator('button[aria-label*="Browse panel"]');
    const detailsButton = kupua.page.locator('button[aria-label*="Details panel"]');

    await expect(leftSeparator).not.toBeVisible();
    await expect(rightSeparator).not.toBeVisible();

    await browseButton.click();
    await expect(leftSeparator).toBeVisible();
    await expect(rightSeparator).not.toBeVisible();

    await browseButton.click();
    await expect(leftSeparator).not.toBeVisible();
    await expect(rightSeparator).not.toBeVisible();

    await detailsButton.click();
    await expect(leftSeparator).not.toBeVisible();
    await expect(rightSeparator).toBeVisible();

    await detailsButton.click();
    await expect(leftSeparator).not.toBeVisible();
    await expect(rightSeparator).not.toBeVisible();
  });

  test("[ and ] keyboard shortcuts toggle panels", async ({ kupua }) => {
    await kupua.goto();

    const leftSeparator = kupua.page.locator('[aria-label*="Resize left panel"]');
    const rightSeparator = kupua.page.locator('[aria-label*="Resize right panel"]');

    // Click the grid to move focus out of the search input
    await kupua.focusNthItem(0);

    // Press [ to open left panel
    await kupua.page.keyboard.press("[");
    await expect(leftSeparator).toBeVisible();

    // Press [ again to close
    await kupua.page.keyboard.press("[");
    await expect(leftSeparator).not.toBeVisible();

    // Press ] to open right panel
    await kupua.page.keyboard.press("]");
    await expect(rightSeparator).toBeVisible();

    // Press ] again to close
    await kupua.page.keyboard.press("]");
    await expect(rightSeparator).not.toBeVisible();
  });

  test("explicit Filters expansion requests aggregations immediately", async ({ kupua }) => {
    await kupua.goto();

    await kupua.page.evaluate(() => {
      const globalObject = window as any;
      const store = globalObject.__kupua_store__;
      const original = store.getState().fetchAggregations;
      globalObject.__aggregationFetchModes__ = [];
      store.setState({
        fetchAggregations: async (mode?: "debounced" | "immediate" | "force") => {
          globalObject.__aggregationFetchModes__.push(mode ?? "debounced");
          if (mode === "immediate") return;
          return original(mode);
        },
      });
    });

    await kupua.page.locator('button[aria-label*="Browse panel"]').click();
    await kupua.page.getByRole("button", { name: "Filters", exact: true }).click();

    await expect.poll(() => kupua.page.evaluate(
      () => (window as any).__aggregationFetchModes__,
    )).toEqual(["immediate"]);
  });

  // ---------------------------------------------------------------------
  // Regression (2026-08-01): repeated panel toggles without explicit focus
  // used to progressively shift the grid viewport — see
  // wandering-findings/W-2026-08-01-panel-toggle-progressive-shift.md.
  // Root cause: the phantom (no-focus) scroll anchor was a synthetic
  // row-index recomputed from scrollTop at every resize instead of a real,
  // stable image identity — a full open+close round trip didn't cancel out.
  // ---------------------------------------------------------------------
  test("repeated panel toggles without explicit focus do not progressively shift the viewport", async ({ kupua }) => {
    await kupua.goto();

    // No click — no explicit focus. Scroll down so there's room to drift.
    await kupua.scrollBy(1500);
    await kupua.page.waitForTimeout(300);
    expect(await kupua.getFocusedImageId()).toBeNull();

    const readAnchor = () =>
      kupua.page.evaluate(() => {
        const store = (window as any).__kupua_store__;
        const getAnchor = (window as any).__kupua_getViewportAnchorId__;
        const s = store.getState();
        const anchorId = typeof getAnchor === "function" ? getAnchor() : null;
        const el = document.querySelector('[aria-label="Image results grid"]');
        return {
          anchorId,
          globalIdx: anchorId ? (s.imagePositions.get(anchorId) ?? null) : null,
          scrollTop: el ? (el as HTMLElement).scrollTop : 0,
        };
      });

    const initial = await readAnchor();
    expect(initial.anchorId).not.toBeNull();

    const detailsButton = kupua.page.locator('button[aria-label*="Details panel"]');
    const browseButton = kupua.page.locator('button[aria-label*="Browse panel"]');

    for (let i = 0; i < 3; i++) {
      await detailsButton.click(); // open RHS
      await kupua.page.waitForTimeout(200);
      await detailsButton.click(); // close RHS
      await kupua.page.waitForTimeout(200);
      await browseButton.click(); // open LHS
      await kupua.page.waitForTimeout(200);
      await browseButton.click(); // close LHS
      await kupua.page.waitForTimeout(200);

      const after = await readAnchor();
      expect(after.anchorId, `cycle ${i}: anchor identity must not drift`).toBe(initial.anchorId);
      expect(after.scrollTop, `cycle ${i}: scrollTop must not progressively shift`).toBe(initial.scrollTop);
    }
  });
});

// ===========================================================================
// Sort — toolbar dropdown
// ===========================================================================

test.describe("Sort dropdown", () => {
  test("sort dropdown opens, shows options, and selecting one changes results", async ({ kupua }) => {
    await kupua.goto();

    // Note the first image under the default sort (Upload time)
    const store1 = await kupua.getStoreState();
    const firstImageBefore = store1.firstImageId;

    // Click the sort button to open dropdown
    const sortButton = kupua.page.locator('button[aria-haspopup="listbox"]');
    await sortButton.click();

    // Dropdown should appear with sort options
    const dropdown = kupua.page.locator('[role="listbox"][aria-label="Sort field"]');
    await expect(dropdown).toBeVisible();

    // It should contain multiple options
    const options = dropdown.locator('[role="option"]');
    const count = await options.count();
    expect(count).toBeGreaterThan(3);

    // Select "Credit" (a different sort field)
    await options.filter({ hasText: "Credit" }).click();

    // Dropdown should close
    await expect(dropdown).not.toBeVisible();

    await expect.poll(async () => {
      const state = await kupua.getStoreState();
      return state.orderBy?.replace(/^-/, "") === "credit"
        && !state.loading
        && state.sortAroundFocusStatus === null;
    }).toBe(true);

    // The first image should be different (different sort order)
    const store2 = await kupua.getStoreState();
    expect(store2.firstImageId).not.toBe(firstImageBefore);
    expect(store2.error).toBeNull();
  });
});

// ===========================================================================
// Sort — table column header click (primary + secondary)
// ===========================================================================

test.describe("Table column header sort", () => {
  test("clicking a sortable column header changes the primary sort", async ({ kupua }) => {
    await kupua.goto();
    await kupua.switchToTable();

    // The default sort is "Upload time" descending.
    // Find the "Credit" column header and click it.
    const creditHeader = kupua.page.locator('[role="columnheader"]', { hasText: "Credit" });
    await expect(creditHeader).toBeVisible();

    const store1 = await kupua.getStoreState();
    const firstImageBefore = store1.firstImageId;

    // Click to sort by Credit — has a 250ms delay (distinguishes from double-click)
    await creditHeader.click();
    await expect.poll(async () => {
      const state = await kupua.getStoreState();
      return state.orderBy?.replace(/^-/, "") === "credit"
        && !state.loading
        && state.sortAroundFocusStatus === null;
    }).toBe(true);

    // The Credit header should now show a sort indicator (SVG arrow icon)
    const sortIndicator = creditHeader.locator('span[aria-hidden="true"] svg');
    await expect(sortIndicator).toBeVisible();

    // aria-sort should be ascending or descending (not "none")
    const ariaSort = await creditHeader.getAttribute("aria-sort");
    expect(ariaSort === "ascending" || ariaSort === "descending").toBe(true);

    // Results should have changed
    const store2 = await kupua.getStoreState();
    expect(store2.firstImageId).not.toBe(firstImageBefore);
    expect(store2.error).toBeNull();
  });

  test("shift-clicking sort controls selects one primary and comma URLs are canonicalized", async ({ kupua }) => {
    await kupua.goto();
    await kupua.switchToTable();

    // First, sort by Credit (primary)
    const creditHeader = kupua.page.locator('[role="columnheader"]', { hasText: "Credit" });
    await creditHeader.click();
    await expect.poll(async () => {
      const state = await kupua.getStoreState();
      return state.orderBy?.replace(/^-/, "") === "credit"
        && !state.loading
        && state.sortAroundFocusStatus === null;
    }).toBe(true);

    // Shift+click behaves exactly like a normal primary selection.
    const sourceHeader = kupua.page.locator('[role="columnheader"]', { hasText: "Source" });
    await sourceHeader.click({ modifiers: ["Shift"] });
    await expect.poll(async () => {
      const state = await kupua.getStoreState();
      return state.orderBy === "source"
        && !state.loading
        && state.sortAroundFocusStatus === null;
    }).toBe(true);

    const sourceIndicator = sourceHeader.locator('span[aria-hidden="true"] svg');
    expect(await sourceIndicator.count()).toBe(1);
    expect(await creditHeader.locator('span[aria-hidden="true"] svg').count()).toBe(0);

    // The toolbar has the same primary-only Shift+click semantics.
    await kupua.page.locator('button[aria-haspopup="listbox"]').click();
    const creditOption = kupua.page.locator('[role="option"][data-sort-key="credit"]');
    await creditOption.click({ modifiers: ["Shift"] });
    await expect.poll(async () => {
      const state = await kupua.getStoreState();
      return state.orderBy === "credit"
        && !state.loading
        && state.sortAroundFocusStatus === null;
    }).toBe(true);

    const searchSorts: unknown[][] = [];
    kupua.page.on("request", (request) => {
      if (request.method() !== "POST" || !request.url().includes("/_search")) return;
      const body = request.postDataJSON() as { sort?: unknown[] } | null;
      if (body?.sort) searchSorts.push(body.sort);
    });

    // Pasted comma URLs keep only a valid first token and replace in place.
    await kupua.gotoWithParams("orderBy=credit,dateAddedToCollection");
    await expect.poll(async () => {
      const state = await kupua.getStoreState();
      return state.orderBy === "credit" && !state.loading;
    }).toBe(true);
    await expect(kupua.page).toHaveURL(/orderBy=credit(?:&|$)/);
    expect(kupua.page.url()).not.toContain(",");

    expect(searchSorts.length).toBeGreaterThan(0);
    expect(searchSorts).toContainEqual([
      { "metadata.credit": "asc" },
      { uploadTime: "desc" },
      { id: "asc" },
    ]);

    const store = await kupua.getStoreState();
    expect(store.error).toBeNull();
  });
});

// ===========================================================================
// URL state — pasting a URL with filters loads correct results
// ===========================================================================

test.describe("URL state", () => {
  test("navigating to a URL with query and sort loads the correct results", async ({ kupua }) => {
    // Navigate directly to a URL with query + custom sort
    await kupua.gotoWithParams("query=london&orderBy=credit");

    const store = await kupua.getStoreState();

    // Should have loaded results (query "london" should match something in sample data)
    expect(store.resultsLength).toBeGreaterThan(0);
    expect(store.error).toBeNull();

    // The result count should be less than the full 10k (filtered by query)
    expect(store.total).toBeLessThan(10000);
    expect(store.total).toBeGreaterThan(0);

    // The sort should be "credit" (ascending — no minus prefix)
    expect(store.orderBy).toBe("credit");

    // The status bar should reflect the filtered count
    const statusBar = kupua.page.locator('[role="status"]');
    const text = await statusBar.textContent();
    expect(text).toContain("matches");
    const displayedCount = parseInt(text!.replace(/[^0-9]/g, ""), 10);
    expect(displayedCount).toBe(store.total);
  });
});

// ===========================================================================
// Fullscreen preview — arrow navigation (Bug: skip-one-image)
// ===========================================================================

test.describe("KUP-019 mounted traversal consumers", () => {
  test.beforeEach(async ({ kupua, page }) => {
    await page.route("**/src/lib/image-urls.ts", (route) => route.fulfill({
      contentType: "application/javascript",
      body: `export const thumbnailsEnabled = true;
        export const getThumbnailUrl = image => "/__traversal_media/" + image.id + ".gif";
        export const getFullImageUrl = getThumbnailUrl;
        export const getZoomImageUrl = getThumbnailUrl;`,
    }));
    await page.route("**/*", (route) => route.request().resourceType() === "image"
      ? route.fulfill({ contentType: "image/gif", body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64") })
      : route.fallback());
    await kupua.goto();
    await page.waitForFunction(() => !(window as any).__kupua_store__.getState().loading);
    await page.evaluate(() => {
      const store = (window as any).__kupua_store__;
      const state = store.getState();
      const source = state.dataSource;
      const original = source.searchAfter;
      const fixture = {
        source, original, hold: true, release: null as null | (() => void),
        origin: state.results.at(-1).id, previous: state.results.at(-2).id,
        destination: state.results[10].id, size: state.results.length, next: null as string | null,
      };
      (window as any).__traversalWindow = fixture;
      source.searchAfter = async function(...args: any[]) {
        const result = await original.apply(this, args);
        if (!fixture.hold) return result;
        fixture.hold = false;
        fixture.next = result.hits[0]?.id ?? null;
        await new Promise<void>((resolve) => { fixture.release = resolve; });
        const signal = args.find((value) => value instanceof AbortSignal);
        if (signal?.aborted) throw new DOMException("superseded", "AbortError");
        return result;
      };
    });
  });

  test.afterEach(async ({ page }) => {
    await page.evaluate(async () => {
      const fixture = (window as any).__traversalWindow;
      if (fixture) {
        fixture.release?.();
        fixture.source.searchAfter = fixture.original;
        delete (window as any).__traversalWindow;
      }
      if (document.fullscreenElement) await document.exitFullscreen();
    });
  });

  async function openConsumer(page: import("@playwright/test").Page, consumer: "detail" | "fullscreen") {
    await page.evaluate(async (kind) => {
      const fixture = (window as any).__traversalWindow;
      const store = (window as any).__kupua_store__;
      store.getState().setFocusedImageId(fixture.origin);
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      if (kind === "detail") {
        const modulePath = "/src/lib/orchestration/search.ts";
        const { pushNavigate } = await import(modulePath);
        const router = (window as any).__kupua_router__;
        pushNavigate(router.navigate, { to: "/search", search: { nonFree: "true", image: fixture.origin } });
      }
    }, consumer);
    if (consumer === "detail") {
      await expect(page.locator("[data-detail-image-id]")).toHaveAttribute("data-detail-image-id", await page.evaluate(() => (window as any).__traversalWindow.origin));
    } else {
      await page.keyboard.press("f");
      await page.waitForFunction(() => document.fullscreenElement !== null);
      await expect(page.locator('[data-fullscreen-preview="active"] [aria-label="Previous image"]')).toBeVisible();
    }
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(() => (window as any).__traversalWindow.release !== null);
  }

  async function releaseWindow(page: import("@playwright/test").Page) {
    await page.evaluate(() => (window as any).__traversalWindow.release());
    await page.waitForFunction(() => (window as any).__kupua_store__.getState().results.length > (window as any).__traversalWindow.size);
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  }

  for (const consumer of ["detail", "fullscreen"] as const) {
    test(`${consumer}: newer resident intent survives a held extension`, async ({ page }) => {
      await openConsumer(page, consumer);
      if (consumer === "detail") {
        await page.evaluate(() => {
          const router = (window as any).__kupua_router__;
          router.navigate({ to: "/search", search: { nonFree: "true", image: (window as any).__traversalWindow.destination }, replace: true });
        });
        await expect(page.locator("[data-detail-image-id]")).toHaveAttribute("data-detail-image-id", await page.evaluate(() => (window as any).__traversalWindow.destination));
      } else {
        await page.keyboard.press("ArrowLeft");
        await page.waitForFunction(() => (window as any).__kupua_store__.getState().focusedImageId === (window as any).__traversalWindow.previous);
      }
      const rendered = consumer === "fullscreen" ? await page.locator('[data-fullscreen-preview="active"] img').getAttribute("src") : null;
      await releaseWindow(page);
      if (consumer === "detail") {
        const expected = await page.evaluate(() => (window as any).__traversalWindow.destination);
        expect(new URL(page.url()).searchParams.get("image")).toBe(expected);
        await expect(page.locator("[data-detail-image-id]")).toHaveAttribute("data-detail-image-id", expected);
      } else {
        expect(await page.evaluate(() => (window as any).__kupua_store__.getState().focusedImageId === (window as any).__traversalWindow.previous)).toBe(true);
        expect(await page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
        await expect(page.locator('[data-fullscreen-preview="active"] img')).toHaveAttribute("src", rendered!);
      }
    });

    test(`${consumer}: ordinary held extension advances exactly once`, async ({ page }) => {
      await openConsumer(page, consumer);
      await releaseWindow(page);
      const next = await page.evaluate(() => (window as any).__traversalWindow.next);
      expect(next).not.toBeNull();
      if (consumer === "detail") {
        expect(new URL(page.url()).searchParams.get("image")).toBe(next);
        await expect(page.locator("[data-detail-image-id]")).toHaveAttribute("data-detail-image-id", next);
      } else {
        expect(await page.evaluate(() => (window as any).__kupua_store__.getState().focusedImageId)).toBe(next);
        expect(await page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
        await expect(page.locator('[data-fullscreen-preview="active"] img')).toBeVisible();
      }
    });
  }
});

test.describe("Fullscreen preview — navigation", () => {
  test("ArrowLeft in fullscreen preview moves focus by exactly one image (no skip)", async ({ kupua }) => {
    await kupua.goto();
    await kupua.seekTo(0.5);

    // Focus an image in the middle of the grid (not the edge — avoids boundary issues)
    await kupua.focusNthItem(5);
    const beforeId = await kupua.getFocusedImageId();
    expect(beforeId).not.toBeNull();

    // Get the global position and the expected prev image
    const beforeState = await kupua.page.evaluate(() => {
      const store = (window as any).__kupua_store__;
      const s = store.getState();
      const gIdx = s.imagePositions.get(s.focusedImageId);
      const prevLocalIdx = (gIdx - 1) - s.bufferOffset;
      return {
        globalIdx: gIdx,
        expectedPrevId: s.results[prevLocalIdx]?.id ?? null,
      };
    });
    expect(beforeState.expectedPrevId).not.toBeNull();

    const fullscreenCapability = await kupua.page.evaluate(() => ({
      enabled: document.fullscreenEnabled,
      requestAvailable: typeof Element.prototype.requestFullscreen === "function",
    }));
    expect(fullscreenCapability).toEqual({ enabled: true, requestAvailable: true });

    // Press 'f' to enter fullscreen preview
    await kupua.page.keyboard.press("f");
    // Configured headless Chromium supports the API, so failure to enter is
    // an application regression rather than an environment skip.
    await kupua.page.waitForFunction(
      () => document.fullscreenElement !== null,
      { timeout: 3000 },
    );

    // Press ArrowLeft — should move focus to exactly the previous image
    await kupua.page.keyboard.press("ArrowLeft");
    await expect.poll(() => kupua.getFocusedImageId()).toBe(beforeState.expectedPrevId);

    // The focused image should be exactly one position back — not two
    const afterId = await kupua.getFocusedImageId();
    expect(afterId).toBe(beforeState.expectedPrevId);
    expect(afterId).not.toBe(beforeId); // sanity: it did move

    // Press ArrowRight — should return to the original image
    await kupua.page.keyboard.press("ArrowRight");
    await expect.poll(() => kupua.getFocusedImageId()).toBe(beforeId);

    // Exit on a traversed identity so FullscreenPreview's return-centering
    // branch runs; returning to the entry identity intentionally preserves
    // the unchanged underlying scroll position.
    await kupua.page.keyboard.press("ArrowLeft");
    await expect.poll(() => kupua.getFocusedImageId()).toBe(beforeState.expectedPrevId);

    // Use the app-owned exit command; browser-native Escape can be swallowed
    // by Chromium's fullscreen permission overlay.
    await kupua.page.keyboard.press("Backspace");
    await kupua.page.waitForFunction(() =>
      document.fullscreenElement === null
      && document.querySelector('[data-fullscreen-preview="active"]') === null,
    );
    const placement = await kupua.waitForUsableViewportPlacement(beforeState.expectedPrevId!);
    expect(placement).toMatchObject({ imageId: beforeState.expectedPrevId, visible: true });
    expect(Math.abs(placement.signedCenterDistance)).toBeLessThan(50);
  });

  test("table fullscreen preview returns the last-viewed image to usable centre", async ({ kupua }) => {
    await kupua.goto();
    await kupua.switchToTable();
    await kupua.focusNthItem(8);
    const startId = await kupua.getFocusedImageId();
    expect(startId).not.toBeNull();

    await kupua.page.keyboard.press("f");
    await kupua.page.waitForFunction(() => document.fullscreenElement !== null);
    await kupua.page.keyboard.press("ArrowRight");
    await expect.poll(() => kupua.getFocusedImageId()).not.toBe(startId);
    const lastViewedId = await kupua.getFocusedImageId();
    expect(lastViewedId).not.toBeNull();

    await kupua.page.keyboard.press("Backspace");
    await kupua.page.waitForFunction(() =>
      document.fullscreenElement === null
      && document.querySelector('[data-fullscreen-preview="active"]') === null,
    );
    const placement = await kupua.waitForUsableViewportPlacement(lastViewedId!);
    expect(placement).toMatchObject({ imageId: lastViewedId, visible: true });
    expect(Math.abs(placement.signedCenterDistance)).toBeLessThan(50);
  });

});

test.describe("Table image detail — return placement", () => {
  test("table detail returns the last-viewed image to usable centre", async ({ kupua }) => {
    await kupua.goto();
    await kupua.switchToTable();
    const entryId = await kupua.openDetailForNthItem(8);
    await kupua.detailNextAndWait();
    const lastViewedId = await kupua.getDetailImageId();
    expect(lastViewedId).not.toBeNull();
    expect(lastViewedId).not.toBe(entryId);

    await kupua.closeDetailViaBackspace();
    const placement = await kupua.waitForUsableViewportPlacement(lastViewedId!);
    expect(placement).toMatchObject({ imageId: lastViewedId, visible: true });
    expect(Math.abs(placement.signedCenterDistance)).toBeLessThan(50);
  });
});

// ===========================================================================
// Image detail — traversal past buffer boundary
// ===========================================================================

test.describe("Image detail — buffer boundary traversal", () => {
  /**
   * Proves that arrow-key traversal in image detail works across buffer
   * boundaries — the bug that `hasNavigatedRef` was added to fix.
   *
   * Mechanism: after a seek, the buffer starts at a non-zero offset.
   * Navigating backward via ArrowLeft should trigger `extendBackward`
   * when we approach the buffer start, and pending navigation should
   * resolve when the extend completes.
   *
   * The forward direction uses the same code path (extendForward) and
   * is covered by 21 useImageTraversal unit tests. E2E only tests the
   * backward direction because it's easy to position near the backward
   * edge after a seek (seekTargetLocalIndex ≈ 100, so local index 5
   * is only 5 items from the backward edge). The forward edge is at
   * local index ~200 which requires 200 keyboard steps to reach — not
   * practical in an E2E test.
   */
  test("arrow-left past backward buffer edge triggers extend and continues navigation", async ({ kupua }) => {
    await kupua.goto();

    // Seek to ~50% so bufferOffset > 0
    await kupua.seekTo(0.5);

    const state0 = await kupua.getStoreState();
    expect(state0.bufferOffset).toBeGreaterThan(100);
    const startOffset = state0.bufferOffset;

    // Programmatically focus an image near the backward edge of the buffer
    // (local index ~5, i.e. 5 items from bufferOffset).
    const nearBackEdge = await kupua.page.evaluate(() => {
      const store = (window as any).__kupua_store__;
      const s = store.getState();
      const localIdx = 5;
      const img = s.results[localIdx];
      if (!img) return null;
      store.getState().setFocusedImageId(img.id);
      return {
        id: img.id,
        globalPos: s.imagePositions.get(img.id) ?? -1,
      };
    });
    expect(nearBackEdge).not.toBeNull();

    // Open image detail via URL navigation
    await kupua.page.goto(
      `/search?nonFree=true&image=${nearBackEdge!.id}`,
    );
    await kupua.page.waitForFunction(
      () => new URL(window.location.href).searchParams.has("image"),
      { timeout: 5000 },
    );
    await kupua.page.waitForFunction(
      () => {
        const store = (window as any).__kupua_store__;
        return store && store.getState().results.length > 0;
      },
      { timeout: 10_000 },
    );
    await kupua.page.waitForTimeout(500);

    // Navigate backward with waited steps to cross bufferOffset
    for (let i = 0; i < 15; i++) {
      try {
        await kupua.detailPrevAndWait(5000);
      } catch {
        break; // Hit dataset start or navigation stalled
      }
    }

    await kupua.page.waitForTimeout(1000);

    // Read final state
    const state1 = await kupua.page.evaluate(() => {
      const store = (window as any).__kupua_store__;
      const s = store.getState();
      return {
        bufferOffset: s.bufferOffset,
        resultsLength: s.results.length,
        focusedGlobalPos: s.focusedImageId
          ? s.imagePositions.get(s.focusedImageId) ?? -1
          : -1,
        error: s.error,
      };
    });

    // The focused image should have moved backward past the original offset
    expect(state1.focusedGlobalPos).toBeLessThan(startOffset);
    // The buffer should have extended backward
    expect(state1.bufferOffset).toBeLessThan(startOffset);
    expect(state1.error).toBeNull();
    await kupua.assertPositionsConsistent();
  });
});

// ===========================================================================
// Stability — no infinite restoreAroundCursor loop on reload
// ===========================================================================

test.describe("Stability — image detail reload", () => {
  test("restores distinct cached detail images without repeating a handled image", async ({ kupua }) => {
    await kupua.goto();
    await kupua.page.waitForFunction(() => (window as any).__kupua_store__.getState().positionMap !== null);
    await kupua.page.evaluate(async () => {
      const mockPath = "/src/dal/mock-data-source.ts";
      const cachePath = "/src/lib/image-offset-cache.ts";
      const [{ MockDataSource }, { buildSearchKey, storeImageOffset }] = await Promise.all([
        import(mockPath), import(cachePath),
      ]);
      const source = new MockDataSource(3);
      const images = await source.getByIds(["img-0", "img-1", "img-2"]);
      const searchKey = buildSearchKey(Object.fromEntries(new URL(location.href).searchParams));
      storeImageOffset("img-1", 1_001, searchKey, [123, "img-1"]);
      storeImageOffset("img-2", 2_002, searchKey, [456, "img-2"]);
      const restores: unknown[] = [];
      (window as any).__f4_restores__ = restores;
      (window as any).__f4_images__ = images;
      const store = (window as any).__kupua_store__;
      store.getState().abortExtends();
      store.setState({
        dataSource: source,
        results: [images[0]],
        bufferOffset: 0,
        total: 100_000,
        positionMap: null,
        imagePositions: new Map([["img-0", 0]]),
        focusedImageId: null,
        loading: false,
        extendForward: async () => {},
        extendBackward: async () => {},
        seek: async () => {},
        restoreAroundCursor: async (...args: unknown[]) => { restores.push(args); },
      });
    });
    await expect(kupua.page.locator('[data-image-id="img-0"]').first()).toBeVisible();
    await kupua.openDetailForNthItem(0);
    expect(await kupua.getRenderedDetailImageId()).toBe("img-0");

    const navigateDetail = (image: string) => kupua.page.evaluate((image) => {
      const router = (window as any).__kupua_router__;
      return router.navigate({
        to: "/search",
        search: { ...router.state.location.search, image },
        replace: true,
        state: { ...history.state },
      });
    }, image);
    const readRestores = () => kupua.page.evaluate(() => (window as any).__f4_restores__);

    await navigateDetail("img-1");
    await expect.poll(readRestores).toEqual([["img-1", [123, "img-1"], 1_001, true]]);
    await expect.poll(() => kupua.getRenderedDetailImageId()).toBe("img-1");

    for (const imageIndex of [1, 0]) {
      await kupua.page.evaluate((imageIndex) => {
        const image = (window as any).__f4_images__[imageIndex];
        const offset = imageIndex === 1 ? 1_001 : 0;
        (window as any).__kupua_store__.setState({
          results: [image],
          bufferOffset: offset,
          imagePositions: new Map([[image.id, offset]]),
        });
      }, imageIndex);
      await expect(kupua.page.locator(`[data-image-id="img-${imageIndex}"]`).first()).toBeAttached();
    }

    await navigateDetail("img-2");
    await expect.poll(readRestores).toEqual([
      ["img-1", [123, "img-1"], 1_001, true],
      ["img-2", [456, "img-2"], 2_002, true],
    ]);
    await expect.poll(() => kupua.getRenderedDetailImageId()).toBe("img-2");
  });

  test("reload in image detail does not cause restoreAroundCursor flood", async ({ kupua }) => {
    await kupua.goto();

    // Seek to ~50% to get a deep bufferOffset
    await kupua.seekTo(0.5);
    const preSeek = await kupua.getStoreState();
    expect(preSeek.bufferOffset).toBeGreaterThan(100);

    // Open image detail for an item at this deep position
    await kupua.openDetailForNthItem(3);
    const detailImageId = await kupua.getDetailImageId();
    expect(detailImageId).toBeTruthy();

    // Wait for things to settle before reload
    await kupua.page.waitForTimeout(1000);

    // Start console capture BEFORE reload so we catch all post-reload logs
    kupua.startConsoleCapture();

    // Reload the page — this is the scenario that triggered the infinite loop
    await kupua.page.reload({ waitUntil: "load" });

    // Wait for the page to recover: image detail should appear (URL has ?image=)
    await kupua.page.waitForFunction(
      () => new URL(window.location.href).searchParams.has("image"),
      { timeout: 10_000 },
    );

    // Wait for data to load and stabilise
    await kupua.page.waitForFunction(
      () => {
        const store = (window as any).__kupua_store__;
        if (!store) return false;
        const s = store.getState();
        return s.results.length > 0 && !s.loading;
      },
      { timeout: 15_000 },
    );

    // Give the system time to either stabilise or start looping
    await kupua.page.waitForTimeout(3000);

    // Count restoreAroundCursor log entries — should be small, not flooding.
    // A healthy reload has 1-3 restoreAroundCursor calls (initial restore +
    // possible position map reload). The infinite loop bug produced 50+ in 3s.
    const restoreLogs = kupua.getConsoleLogs(/\[restoreAroundCursor]/);
    const seekAdjustLogs = kupua.getConsoleLogs(/\[effect6-seek] ADJUSTING/);

    // Threshold: ≤10 is healthy. >15 indicates a loop.
    expect(restoreLogs.length).toBeLessThanOrEqual(10);
    expect(seekAdjustLogs.length).toBeLessThanOrEqual(10);

    // The page should still be functional — image detail should show the image
    const postReloadImageId = await kupua.getDetailImageId();
    expect(postReloadImageId).toBe(detailImageId);
    expect(await kupua.getRenderedDetailImageId()).toBe(detailImageId);

    // Verify no error in the store
    const finalState = await kupua.getStoreState();
    expect(finalState.error).toBeNull();
    expect(finalState.resultsLength).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Click-to-search — metadata values and subsequent CQL input editing
// ===========================================================================

test.describe("Click-to-search", () => {
  test("metadata and table click-to-search leave the CQL input editable", async ({ kupua }) => {
    // This tests for a bug where cancelSearchDebounce() set _externalQuery
    // which was never cleared, permanently blocking debounced CQL input
    // updates. Affected: metadata clicks, table cell clicks (plain, Shift, Alt).
    await kupua.goto();

    // Open image detail to see metadata
    await kupua.openDetailForNthItem(0);

    // Find the first clickable metadata value (ValueLink or SearchPill).
    // Both have title containing "Shift+click to add".
    const metadataButton = kupua.page
      .locator('button[title*="Shift+click to add"]')
      .first();
    await expect(metadataButton).toBeVisible({ timeout: 5000 });

    // Read the button's text — this becomes part of the search query
    const clickedValue = (await metadataButton.textContent())!.trim();
    expect(clickedValue.length).toBeGreaterThan(0);

    // Click the metadata value — this triggers cancelSearchDebounce + updateSearch
    await metadataButton.click();

    // Should navigate back to search results (image param stripped)
    await kupua.waitForDetailClosed();
    await kupua.waitForResults();

    // Verify the URL now has a query from the metadata click
    const queryAfterClick = await kupua.page.evaluate(
      () => new URL(window.location.href).searchParams.get("query"),
    );
    expect(queryAfterClick).toBeTruthy();
    expect(queryAfterClick).toContain(clickedValue.split(" ")[0]);

    await kupua.switchToTable();

    // Shift+click a "By" (byline) cell to append by:value to the query.
    // The "By" column cells have style containing --col-metadata_byline.
    // Find the first row's byline cell that has a non-empty title (= has data).
    const bylineCells = kupua.page.locator(
      '[aria-label="Image results table"] [role="gridcell"][style*="--col-metadata_byline"]',
    );
    let targetCell: ReturnType<typeof bylineCells.nth> | null = null;
    const count = await bylineCells.count();
    for (let i = 0; i < Math.min(count, 20); i++) {
      const title = await bylineCells.nth(i).getAttribute("title");
      if (title && title !== "—" && title.trim().length > 0) {
        targetCell = bylineCells.nth(i);
        break;
      }
    }
    expect(targetCell, "Need at least one image with a byline in local data").not.toBeNull();

    // Shift+click triggers handleCellClick → cancelSearchDebounce → updateSearch
    await targetCell!.click({ modifiers: ["Shift"] });
    await kupua.waitForResults();

    const queryAfterTableClick = await kupua.page.evaluate(
      () => new URL(window.location.href).searchParams.get("query"),
    );
    expect(queryAfterTableClick).toContain(queryAfterClick);
    expect(queryAfterTableClick).toContain("by:");

    // Both click paths share the external-query latch. One real edit after
    // both interactions proves the latch was cleared for subsequent typing.
    const searchArea = kupua.page.locator('[role="search"]');
    await searchArea.click();
    await kupua.page.waitForTimeout(100);
    await kupua.page.keyboard.press("Meta+a");
    await kupua.page.keyboard.type("nonFree:true", { delay: 30 });

    // Wait for the 300ms debounce + buffer for URL to update
    await kupua.page.waitForFunction(
      (prevQuery) => {
        const q = new URL(window.location.href).searchParams.get("query");
        return q !== prevQuery && q !== null;
      },
      queryAfterTableClick,
      { timeout: 3000 },
    );

    const queryAfterEdit = await kupua.page.evaluate(
      () => new URL(window.location.href).searchParams.get("query"),
    );
    expect(queryAfterEdit).toContain("nonFree");
  });
});

