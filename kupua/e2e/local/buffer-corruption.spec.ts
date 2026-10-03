/**
 * E2E tests for the buffer corruption bug and its fix.
 *
 * Bug: after seeking to a deep position via the scrubber and then performing
 * any action that resets scroll to the top (logo click, metadata click-to-
 * search, CQL query change), a rogue `extendBackward` prepends stale data
 * from the deep-seek position, corrupting the buffer.
 *
 * Symptoms:
 *   - Buffer grows to 400 items (should be 200)
 *   - imagePositions map has collisions
 *   - scrollTop jumps to ~6969 (prepend scroll compensation)
 *   - Grid shows images from the wrong position
 *
 * The fix has 5 layers (see exploration/docs/zz Archive/Scrolling bonanza/buffer-corruption-fix.md):
 *   Layer 1: resetScrollAndFocusSearch() calls abortExtends() (primary)
 *   Layer 2: search() sets a 2-second extend cooldown
 *   Layer 3: Seek cooldown refreshed at data arrival
 *   Layer 4: Abort check before PIT-404 retry (es-adapter)
 *   Layer 5: abortExtends() exposed on the store
 *
 * These tests exercise the user-visible scenarios. Each would fail without
 * the fix: the buffer would have >200 items, position maps would be
 * inconsistent, and scrollTop/bufferOffset would be non-zero.
 *
 * Run:
 *   npx playwright test e2e/local/buffer-corruption.spec.ts
 *   npx playwright test e2e/local/buffer-corruption.spec.ts --headed
 */

import { test, expect } from "../shared/helpers";
import type { Route } from "@playwright/test";

// ---------------------------------------------------------------------------
// Safety: require enough data for seeks to be meaningful.
// Local sample data has ~10k docs; real clusters have 100k+.
// We need at least ~500 results for a seek to produce a deep offset.
// ---------------------------------------------------------------------------

const MIN_TOTAL_FOR_SEEK = 500;

test.describe("B8 pending sort survives saved density", () => {
  for (const transport of ["direct-ES", "media-api-fixture"] as const) {
    for (const focusMode of ["explicit", "phantom"] as const) {
      for (const sourceView of ["grid", "table"] as const) {
        test(`${transport}, ${focusMode}, ${sourceView} preserves the pending search`, async ({ kupua }) => {
          const page = kupua.page;
          await kupua.startSearch("", sourceView);
          await page.waitForFunction(() => !(window as any).__kupua_store__.getState().loading);
          const initial = await kupua.getStoreState();
          expect(initial.total).toBeGreaterThan(1000);
          await page.evaluate(async ({ transport, focusMode }) => {
            const configPath = "/src/dal/es-config.ts";
            if (!(await import(configPath)).IS_LOCAL_ES) throw new Error("B8 fixture requires local ES");
            const prefsPath = "/src/stores/ui-prefs-store.ts";
            const { useUiPrefsStore, getEffectiveFocusMode } = await import(prefsPath);
            useUiPrefsStore.getState().setFocusMode(focusMode);
            if (getEffectiveFocusMode() !== focusMode) throw new Error("B8 focus mode mismatch");
            const store = (window as any).__kupua_store__;
            const originalSource = store.getState().dataSource;
            const apiPath = "/src/dal/api-data-source.ts";
            const source = transport === "media-api-fixture"
              ? new (await import(apiPath)).ApiDataSource() : originalSource;
            const originalPage = source.searchAfter;
            const ownPage = Object.getOwnPropertyDescriptor(source, "searchAfter");
            const originalAbort = store.getState().cancelWindowMaintenance;
            const probe = { originalSource, rangeAborts: 0, emptyPublications: 0,
              signal: null as AbortSignal | null, cleanup: () => {} };
            source.searchAfter = function (...args: any[]) {
              if (args[0].trackTotalHits && !args[1]) probe.signal = args[3];
              return originalPage.apply(this, args);
            };
            store.setState({ dataSource: source, cancelWindowMaintenance: () => {
              probe.rangeAborts += 1;
              originalAbort();
            } });
            const unsubscribe = store.subscribe((state: any) => {
              if (!state.loading && state.error === null && state.total === 0 && state.results.length === 0) {
                probe.emptyPublications += 1;
              }
            });
            probe.cleanup = () => {
              unsubscribe();
              if (ownPage) Object.defineProperty(source, "searchAfter", ownPage);
              else delete source.searchAfter;
              store.setState({ dataSource: originalSource, cancelWindowMaintenance: originalAbort });
            };
            (window as any).__b8 = probe;
          }, { transport, focusMode });

          let release!: () => void;
          const held = new Promise<void>(resolve => { release = resolve; });
          let finish!: () => void;
          const finished = new Promise<void>(resolve => { finish = resolve; });
          let called = false;
          let routeFailure: unknown;
          let expectedIds: string[] = [];
          let expectedTotal = 0;
          let expectedCursors: unknown[] = [];
          const pattern = transport === "direct-ES" ? "**/es/**/_search" : "**/api/images/search-after";
          const handler = async (route: Route) => {
            const body = route.request().postDataJSON();
            const firstPage = transport === "direct-ES"
              ? body.size === 200 && body.track_total_hits === true && !body.search_after
              : body.countAll === true && !body.sortValues && !body.ids;
            if (!firstPage || called) { await route.continue(); return; }
            called = true;
            try {
              const upstream = transport === "direct-ES" ? await route.fetch() : null;
              const reply = upstream ? await upstream.json() : await page.evaluate(async body => {
                const result = await (window as any).__b8.originalSource.searchAfter({
                  query: body.q, orderBy: body.orderBy, nonFree: body.free ? undefined : "true",
                  length: body.length, trackTotalHits: body.countAll,
                }, body.sortValues ?? null, null, undefined, body.reverse, body.seekToEnd);
                return { data: result.hits.map((data: unknown) => ({ data })), total: result.total, sortValues: result.sortValues };
              }, body);
              expectedIds = transport === "direct-ES"
                ? reply.hits.hits.map((hit: any) => hit._id) : reply.data.map((entity: any) => entity.data.id);
              expectedTotal = transport === "direct-ES" ? reply.hits.total.value : reply.total;
              expectedCursors = transport === "direct-ES" ? reply.hits.hits.map((hit: any) => hit.sort) : reply.sortValues;
              expect(body.sort).toEqual([{ uploadTime: "asc" }, { id: "asc" }]);
              expect(expectedIds).toHaveLength(200);
              await held;
              await route.fulfill({ ...(upstream ? { response: upstream } : {}), json: reply });
            } catch (error) {
              routeFailure = error;
            } finally {
              finish();
            }
          };
          await page.route(pattern, handler);
          try {
            const before = await page.evaluate(() => ({
              started: (window as any).__kupua_getSearchLifecycle__().started,
              density: (window as any).__kupua_getDensityRestoreGeneration__(),
            }));
            await page.getByRole("button", { name: "Sort descending, click to sort ascending", exact: true }).click();
            await expect.poll(() => expectedIds.length).toBe(200);
            const pending = await page.evaluate(() => ({
              started: (window as any).__kupua_getSearchLifecycle__().started,
              loading: (window as any).__kupua_store__.getState().loading,
            }));
            expect(pending.started).toBeGreaterThan(before.started);
            expect(pending.loading).toBe(true);
            const targetView = sourceView === "grid" ? "table" : "grid";
            await page.getByRole("button", { name: `Switch to ${targetView} view`, exact: true }).click();
            await page.waitForFunction(previous =>
              (window as any).__kupua_getDensityRestoreGeneration__() > previous, before.density);
            const during = await page.evaluate(() => ({
              rangeAborts: (window as any).__b8.rangeAborts,
              aborted: (window as any).__b8.signal?.aborted,
              started: (window as any).__kupua_getSearchLifecycle__().started,
              loading: (window as any).__kupua_store__.getState().loading,
            }));
            expect(during.rangeAborts).toBeGreaterThan(0);
            expect(during).toMatchObject({ aborted: false, started: pending.started, loading: true });
            release();
            await finished;
            expect(routeFailure).toBeUndefined();
            await page.waitForFunction(() => {
              const state = (window as any).__kupua_store__.getState();
              const lifecycle = (window as any).__kupua_getSearchLifecycle__();
              return !state.loading && lifecycle.started === lifecycle.settled;
            });
            const final = await page.evaluate(() => {
              const state = (window as any).__kupua_store__.getState();
              return { ids: state.results.map((image: any) => image.id), total: state.total,
                offset: state.bufferOffset, orderBy: state.params.orderBy, error: state.error,
                firstCursor: state.startCursor, lastCursor: state.endCursor,
                emptyPublications: (window as any).__b8.emptyPublications };
            });
            expect(final).toEqual({ ids: expectedIds, total: expectedTotal, offset: 0,
              orderBy: "uploadTime", error: null, firstCursor: expectedCursors[0],
              lastCursor: expectedCursors.at(-1), emptyPublications: 0 });
            await kupua.assertPositionsConsistent();
            await expect(page.getByRole("button", { name: `Switch to ${sourceView} view`, exact: true })).toBeVisible();
          } finally {
            release();
            if (called) await finished;
            await page.unroute(pattern, handler);
            await page.evaluate(() => { (window as any).__b8?.cleanup(); delete (window as any).__b8; });
          }
        });
      }
    }
  }
});

test.describe("L37 End supersedes pending initial sort", () => {
  for (const focusMode of ["explicit", "phantom"] as const) {
    for (const sourceView of ["grid", "table"] as const) {
      test(`${focusMode}, ${sourceView} retains End after late first-page success`, async ({ kupua }) => {
        const page = kupua.page;
        await kupua.startSearch("", sourceView);
        await page.waitForFunction(() => !(window as any).__kupua_store__.getState().loading);
        const before = await page.evaluate(async focusMode => {
          const configPath = "/src/dal/es-config.ts";
          if (!(await import(configPath)).IS_LOCAL_ES) throw new Error("L37 fixture requires local ES");
          const prefsPath = "/src/stores/ui-prefs-store.ts";
          const { useUiPrefsStore } = await import(prefsPath);
          useUiPrefsStore.getState().setFocusMode(focusMode);
          const store = (window as any).__kupua_store__;
          store.getState().setFocusedImageId(null);
          const source = store.getState().dataSource;
          const original = source.searchAfter;
          const own = Object.getOwnPropertyDescriptor(source, "searchAfter");
          let release!: () => void;
          const held = new Promise<void>(resolve => { release = resolve; });
          const probe = { ready: false, called: false, signal: null as AbortSignal | null,
            work: null as Promise<unknown> | null, release: () => release(), cleanup: async () => {},
            tail: null as any, positions: null as any, start: null as any, end: null as any,
            offset: 0, scrollTop: 0, reset: 0 };
          source.searchAfter = function (...args: any[]) {
            if (probe.called || !args[0].trackTotalHits || args[1]) return original.apply(this, args);
            probe.called = true;
            probe.signal = args[3];
            probe.work = (async () => {
              const result = await original.apply(this, args);
              probe.ready = true;
              await held;
              return result;
            })();
            return probe.work;
          };
          probe.cleanup = async () => {
            probe.release();
            await probe.work?.catch(() => {});
            if (own) Object.defineProperty(source, "searchAfter", own);
            else delete source.searchAfter;
            delete (window as any).__l37;
          };
          (window as any).__l37 = probe;
          return { seek: store.getState()._seekGeneration, total: store.getState().total };
        }, focusMode);
        try {
          expect(before.total).toBeGreaterThan(1000);
          await page.getByRole("button", { name: "Sort descending, click to sort ascending", exact: true }).click();
          await page.waitForFunction(() => (window as any).__l37.ready && (window as any).__kupua_store__.getState().loading);
          await page.keyboard.press("End");
          await page.waitForFunction(previous => {
            const state = (window as any).__kupua_store__.getState();
            return state._seekGeneration > previous && !state.loading && !state.error &&
              state.bufferOffset > 0 && state.bufferOffset + state.results.length === state.total;
          }, before.seek);
          const end = await page.evaluate(() => {
            const state = (window as any).__kupua_store__.getState();
            const probe = (window as any).__l37;
            const container = document.querySelector<HTMLElement>('[aria-label="Image results grid"], [aria-label="Image results table"]')!;
            probe.tail = state.results;
            probe.positions = state.imagePositions;
            probe.start = state.startCursor;
            probe.end = state.endCursor;
            probe.offset = state.bufferOffset;
            probe.scrollTop = container.scrollTop;
            probe.reset = state._scrollReset.gen;
            return { aborted: probe.signal.aborted, offset: state.bufferOffset, scrollTop: container.scrollTop };
          });
          expect(end.aborted).toBe(true);
          expect(end.offset).toBeGreaterThan(0);
          expect(end.scrollTop).toBeGreaterThan(0);
          await page.evaluate(async () => {
            const probe = (window as any).__l37;
            probe.release();
            await probe.work;
            await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
          });
          const final = await page.evaluate(() => {
            const state = (window as any).__kupua_store__.getState();
            const probe = (window as any).__l37;
            const container = document.querySelector<HTMLElement>('[aria-label="Image results grid"], [aria-label="Image results table"]')!;
            return { sameTail: state.results === probe.tail, samePositions: state.imagePositions === probe.positions,
              sameCursors: JSON.stringify([state.startCursor, state.endCursor]) === JSON.stringify([probe.start, probe.end]),
              sameOffset: state.bufferOffset === probe.offset, sameReset: state._scrollReset.gen === probe.reset,
              sameScroll: container.scrollTop === probe.scrollTop, tailReached: state.bufferOffset + state.results.length === state.total,
              loading: state.loading, error: state.error, focus: state.focusedImageId, order: state.params.orderBy };
          });
          expect(final).toEqual({ sameTail: true, samePositions: true, sameCursors: true, sameOffset: true,
            sameReset: true, sameScroll: true, tailReached: true, loading: false, error: null, focus: null, order: "uploadTime" });
          await kupua.assertPositionsConsistent();
        } finally {
          await page.evaluate(async () => { await (window as any).__l37?.cleanup(); });
        }
      });
    }
  }
});

/**
 * Shared assertion: after any "return to top" action, the buffer must be
 * clean — no stale prepends, consistent positions, scrolled to top.
 */
async function assertCleanTopState(kupua: any, label: string) {
  // Give the app time to settle — search + render + any rogue extends
  await kupua.page.waitForTimeout(1500);

  const state = await kupua.getStoreState();

  // bufferOffset must be 0 — we're at the top of results
  expect(state.bufferOffset, `${label}: bufferOffset`).toBe(0);

  // Buffer must not be bloated by stale prepends.
  // A clean first page is exactly PAGE_SIZE (200) or total if total < 200.
  expect(
    state.resultsLength,
    `${label}: resultsLength (should be ≤ 200, got ${state.resultsLength})`,
  ).toBeLessThanOrEqual(
    // Scroll-mode fill may have loaded all results if total < threshold.
    // Allow up to total, but it must not exceed total.
    Math.max(200, state.total),
  );

  // NO stale prepends: resultsLength must not be double the page size.
  // The bug's signature is exactly 400 items (200 stale + 200 correct).
  if (state.total >= 200) {
    expect(
      state.resultsLength,
      `${label}: resultsLength should not be double PAGE_SIZE (stale prepend)`,
    ).not.toBe(400);
  }

  // scrollTop must be at or very near 0
  const scrollTop = await kupua.getScrollTop();
  expect(scrollTop, `${label}: scrollTop`).toBeLessThan(50);

  // Scrubber thumb must be at or near the top — a stuck thumb after
  // Home/reset was a regression (flash guard blocked legitimate resets).
  const thumbTop = await kupua.getScrubberThumbTop();
  expect(thumbTop, `${label}: scrubber thumb`).toBeLessThan(10);

  // Position map must be consistent
  await kupua.assertPositionsConsistent();

  // No errors
  expect(state.error, `${label}: error`).toBeNull();
}

// ---------------------------------------------------------------------------
// Scenario A: Logo click from grid view after deep seek
//
// This is the original bug repro. The logo click calls
// resetScrollAndFocusSearch() which dispatches a synthetic scroll event
// on a deep-offset buffer, triggering extendBackward.
// ---------------------------------------------------------------------------

test.describe("Buffer corruption — logo click after deep seek", () => {

  test("grid: logo click returns to clean top state after deep seek", async ({ kupua }) => {
    await kupua.startSearch();
    const initial = await kupua.getStoreState();
    test.skip(initial.total < MIN_TOTAL_FOR_SEEK, `Total ${initial.total} too small for seek`);

    // Remember the first image at position 0
    const firstImageBefore = initial.firstImageId;

    // Seek deep — 50% into the result set
    await kupua.seekTo(0.5);
    const afterSeek = await kupua.getStoreState();
    expect(afterSeek.bufferOffset).toBeGreaterThan(0);

    // Click the Home logo
    await kupua.page.locator('a[title="Grid — clear all filters"]').first().click();
    await kupua.waitForResults();

    await assertCleanTopState(kupua, "grid logo click");

    // The first image in the buffer should be from the top of results,
    // not from the deep-seek position
    const afterLogo = await kupua.getStoreState();
    expect(afterLogo.firstImageId).toBe(firstImageBefore);
  });

  test("repeated logo clicks always return to top", async ({ kupua }) => {
    await kupua.startSearch();
    const initial = await kupua.getStoreState();
    test.skip(initial.total < MIN_TOTAL_FOR_SEEK, `Total ${initial.total} too small for seek`);

    for (let i = 0; i < 3; i++) {
      // Seek deep (vary the depth slightly each time)
      await kupua.seekTo(0.3 + i * 0.2);
      const afterSeek = await kupua.getStoreState();
      expect(afterSeek.bufferOffset).toBeGreaterThan(0);

      // Click logo
      await kupua.page.locator('a[title="Grid — clear all filters"]').first().click();
      await kupua.waitForResults();

      await assertCleanTopState(kupua, `iteration ${i + 1}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario B: Logo click from ImageDetail after deep seek
//
// Same bug, different code path: the user is in the image detail overlay
// (ImageDetail.tsx) and clicks the logo there.
// ---------------------------------------------------------------------------

test.describe("Buffer corruption — logo click from ImageDetail after deep seek", () => {

  test("logo click from detail view returns to clean top state", async ({ kupua }) => {
    await kupua.startSearch();
    const initial = await kupua.getStoreState();
    test.skip(initial.total < MIN_TOTAL_FOR_SEEK, `Total ${initial.total} too small for seek`);

    const firstImageBefore = initial.firstImageId;

    // Seek deep
    await kupua.seekTo(0.5);

    // Open image detail via the store — in two-tier mode, DOM clicking
    // cursor-pointer elements can time out because the viewport shows
    // skeletons at the seek position. Instead, focus an image via the
    // store and navigate to detail view via URL.
    const detailImageId = await kupua.page.evaluate(() => {
      const store = (window as any).__kupua_store__;
      if (!store) return null;
      const s = store.getState();
      const img = s.results[2];
      if (img) {
        s.setFocusedImageId(img.id);
        return img.id;
      }
      return null;
    });
    expect(detailImageId).not.toBeNull();
    // Navigate to detail overlay via URL
    await kupua.page.evaluate((id: string) => {
      const router = (window as any).__kupua_router__;
      if (!router) throw new Error("Router not exposed on window");
      const url = new URL(window.location.href);
      const search: Record<string, string> = {};
      url.searchParams.forEach((v, k) => { search[k] = v; });
      search.image = id;
      router.navigate({ to: url.pathname, search });
    }, detailImageId!);
    await kupua.page.waitForFunction(
      () => new URL(window.location.href).searchParams.has("image"),
      { timeout: 5000 },
    );

    // Click the logo from within the detail view.
    // Two logo <a> elements match the selector: one in the SearchBar
    // (hidden behind opacity-0 overlay) and one in the ImageDetail header.
    // Use .locator(':visible') to target the one actually clickable.
    const logos = kupua.page.locator('a[title="Grid — clear all filters"]');
    // Click the last visible one (ImageDetail's is rendered after SearchBar's)
    await logos.last().click();
    await kupua.waitForResults();
    await kupua.waitForDetailClosed();

    await assertCleanTopState(kupua, "detail logo click");

    const afterLogo = await kupua.getStoreState();
    expect(afterLogo.firstImageId).toBe(firstImageBefore);
    // focusedImageId must be null after Home — useReturnFromDetail must
    // not re-set it to the deep image when resetToHome cleared it.
    expect(afterLogo.focusedImageId, "focusedImageId should be null after Home from detail").toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Scenario C: Metadata click from ImageDetail after deep seek
//
// Layer 2 of the fix: search() sets the cooldown, which protects the
// useLayoutEffect scroll-reset path (no synthetic scroll event here).
// ---------------------------------------------------------------------------

test.describe("Buffer corruption — metadata click from ImageDetail after deep seek", () => {

  test("metadata click triggers new search with clean buffer", async ({ kupua }) => {
    await kupua.startSearch();
    const initial = await kupua.getStoreState();
    test.skip(initial.total < MIN_TOTAL_FOR_SEEK, `Total ${initial.total} too small for seek`);

    // Seek deep
    await kupua.seekTo(0.5);

    // Open image detail — use store-based approach because in two-tier mode
    // the viewport shows skeletons at the seek position
    const detailId = await kupua.page.evaluate(() => {
      const store = (window as any).__kupua_store__;
      if (!store) return null;
      const s = store.getState();
      const img = s.results[2];
      if (img) { s.setFocusedImageId(img.id); return img.id; }
      return null;
    });
    expect(detailId).not.toBeNull();
    await kupua.page.evaluate((id: string) => {
      const router = (window as any).__kupua_router__;
      if (!router) throw new Error("Router not exposed on window");
      const url = new URL(window.location.href);
      const search: Record<string, string> = {};
      url.searchParams.forEach((v, k) => { search[k] = v; });
      search.image = id;
      router.navigate({ to: url.pathname, search });
    }, detailId!);
    await kupua.page.waitForFunction(
      () => new URL(window.location.href).searchParams.has("image"),
      { timeout: 5000 },
    );

    // Find and click a metadata value link in the detail sidebar.
    // These are <button> elements inside the <aside> with the underline style.
    // We click the first clickable metadata value we find.
    const metadataButton = kupua.page.locator(
      'aside button.underline',
    ).first();
    const hasMetadata = await metadataButton.count() > 0;
    if (!hasMetadata) {
      // No clickable metadata in the sidebar — skip
      test.skip();
      return;
    }

    // Click the metadata value — this triggers a new search via URL update
    await metadataButton.click();

    // Wait for detail to close and results to load.
    // Use a relaxed wait: metadata clicks on local sample data can match
    // as few as 1 image, so the standard waitForResults (which checks for
    // >4 grid cells) would time out. Instead wait for the store to finish.
    await kupua.waitForDetailClosed();
    await kupua.page.waitForFunction(
      () => {
        const store = (window as any).__kupua_store__;
        if (!store) return false;
        const s = store.getState();
        return !s.loading && s.results.length > 0;
      },
      { timeout: 15_000 },
    );

    // Give the app time to settle (search + potential rogue extends)
    await kupua.page.waitForTimeout(1500);

    const state = await kupua.getStoreState();

    // bufferOffset must be 0 — this is a fresh search
    expect(state.bufferOffset, "metadata click: bufferOffset").toBe(0);

    // Buffer must not be bloated
    expect(
      state.resultsLength,
      "metadata click: resultsLength",
    ).toBeLessThanOrEqual(Math.max(200, state.total));

    // Positions consistent — proves buffer is not corrupted.
    // Note: scrollTop is intentionally not asserted here. When the focused image
    // lands in the first page of the new results (sort-around-focus fires),
    // scrollTop is legitimately non-zero (centred on the image). The buffer
    // cleanliness invariant is already covered by bufferOffset=0 + positions
    // consistent above.
    await kupua.assertPositionsConsistent();
    expect(state.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Scenario D: Buffer integrity monitoring during logo click
//
// This test installs a Zustand subscriber BEFORE clicking the logo to
// record every buffer state transition. It detects the corruption in
// real-time: if extendBackward prepends stale data, results.length would
// spike to 400 before or after the search() result arrives.
// ---------------------------------------------------------------------------

test.describe("Buffer corruption — real-time integrity monitoring", () => {

  test("no transient buffer corruption during logo click after deep seek", async ({ kupua }) => {
    await kupua.startSearch();
    const initial = await kupua.getStoreState();
    test.skip(initial.total < MIN_TOTAL_FOR_SEEK, `Total ${initial.total} too small for seek`);

    // Seek deep
    await kupua.seekTo(0.5);
    const afterSeek = await kupua.getStoreState();
    expect(afterSeek.bufferOffset).toBeGreaterThan(0);

    // Install a buffer state recorder BEFORE clicking the logo.
    // Records every (resultsLength, bufferOffset) pair.
    await kupua.page.evaluate(() => {
      const store = (window as any).__kupua_store__;
      const snapshots: Array<{
        len: number;
        offset: number;
        ts: number;
      }> = [];
      let prevLen = store.getState().results.length;
      let prevOff = store.getState().bufferOffset;
      const unsub = store.subscribe((s: any) => {
        if (s.results.length !== prevLen || s.bufferOffset !== prevOff) {
          prevLen = s.results.length;
          prevOff = s.bufferOffset;
          snapshots.push({
            len: prevLen,
            offset: prevOff,
            ts: Date.now(),
          });
        }
      });
      (window as any).__buf_snapshots__ = snapshots;
      (window as any).__buf_unsub__ = unsub;
    });

    // Click logo
    await kupua.page.locator('a[title="Grid — clear all filters"]').first().click();
    await kupua.waitForResults();
    await kupua.page.waitForTimeout(1500);

    // Read and clean up the recorder
    const snapshots = await kupua.page.evaluate(() => {
      const snaps = (window as any).__buf_snapshots__ as Array<{
        len: number;
        offset: number;
        ts: number;
      }>;
      const unsub = (window as any).__buf_unsub__ as () => void;
      if (unsub) unsub();
      delete (window as any).__buf_snapshots__;
      delete (window as any).__buf_unsub__;
      return snaps;
    });

    // Once Home begins, abortExtends() runs before the fresh search. Every
    // subsequent buffer mutation must therefore publish at offset 0; any
    // nonzero offset is stale deep-buffer work racing the reset.
    for (const snap of snapshots) {
      expect(
        snap.offset,
        `Transient corruption at +${snap.ts}ms: resultsLength=${snap.len}, offset=${snap.offset}`,
      ).toBe(0);
    }

    // Final state must be clean
    await assertCleanTopState(kupua, "monitored logo click");
  });
});

// ---------------------------------------------------------------------------
// Scenario E: CQL query change after deep seek (Layer 2)
//
// Changing the query via URL (e.g. typing in the CQL input) goes through
// useUrlSearchSync → search(). The useLayoutEffect in ImageGrid resets
// scrollTop = 0 on searchParams change. Layer 2 protects this path.
// ---------------------------------------------------------------------------

test.describe("Buffer corruption — query change after deep seek", () => {

  test("CQL query change returns to clean top state after deep seek", async ({ kupua }) => {
    await kupua.startSearch();
    const initial = await kupua.getStoreState();
    test.skip(initial.total < MIN_TOTAL_FOR_SEEK, `Total ${initial.total} too small for seek`);

    // Seek deep
    await kupua.seekTo(0.5);
    const afterSeek = await kupua.getStoreState();
    expect(afterSeek.bufferOffset).toBeGreaterThan(0);

    const targetQuery = "credit:PA";
    const searchArea = kupua.page.locator('[role="search"]');
    await searchArea.click();
    await kupua.page.keyboard.press("Meta+a");
    await kupua.page.keyboard.type(targetQuery, { delay: 20 });
    await kupua.page.waitForFunction(
      (expectedQuery) => {
        const state = (window as any).__kupua_store__?.getState();
        return new URL(location.href).searchParams.get("query") === expectedQuery
          && state
          && state.params.query === expectedQuery
          && !state.loading
          && state.bufferOffset === 0
          && state.results.length > 0;
      },
      targetQuery,
      { timeout: 15_000 },
    );

    const state = await kupua.getStoreState();
    expect(state.bufferOffset, "query change: bufferOffset").toBe(0);
    expect(
      state.resultsLength,
      "query change: resultsLength",
    ).toBeLessThanOrEqual(Math.max(200, state.total));

    const scrollTop = await kupua.getScrollTop();
    expect(scrollTop, "query change: scrollTop").toBeLessThan(50);

    await kupua.assertPositionsConsistent();
    expect(state.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Scenario F: Extends still work AFTER the cooldown expires
//
// The fix sets a 2-second cooldown. We need to verify that normal buffer
// extension (scrolling to load more) still works after the cooldown.
// This guards against the cooldown being too aggressive.
// ---------------------------------------------------------------------------

test.describe("Extends recover after cooldown", () => {

  test("extendForward works after logo click + cooldown expiry", async ({ kupua }) => {
    await kupua.startSearch();
    const initial = await kupua.getStoreState();
    test.skip(initial.total < MIN_TOTAL_FOR_SEEK, `Total ${initial.total} too small for seek`);
    test.skip(
      initial.total <= 200,
      `Total ${initial.total} fits in first page — no extend possible`,
    );

    // Seek deep, then click logo to trigger the cooldown
    await kupua.seekTo(0.5);
    await kupua.page.locator('a[title="Grid — clear all filters"]').first().click();
    await kupua.waitForResults();

    // Wait for the 2-second cooldown to expire
    await kupua.page.waitForTimeout(2500);

    const beforeScroll = await kupua.getStoreState();

    // Scroll down to trigger extendForward
    for (let i = 0; i < 5; i++) {
      await kupua.page.evaluate(async (bufferEnd) => {
        const geometryPath = "/src/lib/scroll-geometry-ref.ts";
        const { getScrollGeometry } = await import(geometryPath);
        const { columns, rowHeight } = getScrollGeometry();
        const grid = document.querySelector('[aria-label="Image results grid"]');
        const table = document.querySelector('[aria-label="Image results table"]');
        const el = grid ?? table;
        if (!el) throw new Error("Results viewport is not mounted");
        el.scrollTop = Math.max(0, Math.ceil(bufferEnd / columns) * rowHeight - el.clientHeight);
      }, beforeScroll.bufferOffset + beforeScroll.resultsLength);
      await kupua.page.waitForTimeout(500);
    }

    await kupua.page.waitForFunction((previousLength) => {
      const state = (window as any).__kupua_store__?.getState();
      return state && !state._extendForwardInFlight && state.results.length > previousLength;
    }, beforeScroll.resultsLength, { timeout: 10_000 });

    const afterScroll = await kupua.getStoreState();

    // If total > 200, the buffer should have grown via extendForward
    expect(afterScroll.seekGeneration, "Scrolling should extend the resident buffer, not seek").toBe(beforeScroll.seekGeneration);
    if (beforeScroll.total > 200) {
      expect(
        afterScroll.resultsLength,
        "Buffer should grow after cooldown expires",
      ).toBeGreaterThan(beforeScroll.resultsLength);
    }

    // Positions must remain consistent
    await kupua.assertPositionsConsistent();
    expect(afterScroll.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Scenario G: Seek cooldown at data arrival (Layer 3)
//
// After a seek completes, the virtualizer needs time to settle at the
// correct scroll position. Without the cooldown refresh at data arrival,
// extendBackward fires immediately because the initial cooldown (set at
// seek start) has already expired by the time data arrives.
// ---------------------------------------------------------------------------

test.describe("Seek data arrival — no rogue extends", () => {

  test("buffer is stable immediately after seek completes", async ({ kupua }) => {
    await kupua.startSearch();
    const initial = await kupua.getStoreState();
    test.skip(initial.total < MIN_TOTAL_FOR_SEEK, `Total ${initial.total} too small for seek`);

    // Seek to 50%
    await kupua.seekTo(0.5);
    const afterSeek = await kupua.getStoreState();

    // Record the results length immediately after seek
    const lenAfterSeek = afterSeek.resultsLength;

    // Wait just 300ms — enough for a rogue extendBackward to fire
    // (without the Layer 3 fix, extendBackward would fire immediately
    // because the cooldown from seek start has expired)
    await kupua.page.waitForTimeout(300);

    const afterSettle = await kupua.getStoreState();

    // Buffer should not have changed significantly.
    // Allow one extend (±200), but the bug would show as a second
    // extend that corrupts the buffer.
    const lenDelta = Math.abs(afterSettle.resultsLength - lenAfterSeek);
    expect(
      lenDelta,
      `Buffer changed by ${lenDelta} in 300ms after seek — possible rogue extend`,
    ).toBeLessThanOrEqual(200);

    await kupua.assertPositionsConsistent();
    expect(afterSettle.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Scenario I: Logo click resets scroll when already at bufferOffset 0
//
// Regression test for the bug introduced by the "Home/logo flash elimination"
// (commit 61b042101): resetScrollAndFocusSearch() stopped resetting scrollTop
// entirely, relying on effect #8 (BufferOffset→0 guard). But effect #8 only
// fires when bufferOffset transitions from >0 to 0. When the user is scrolled
// down within the first page (bufferOffset already 0), nothing resets scroll.
//
// The fix: eager scrollTop=0 in resetScrollAndFocusSearch() when bufferOffset
// is already 0 (safe — buffer has correct data, no flash). Same logic as the
// Home key handler in useListNavigation.ts.
// ---------------------------------------------------------------------------

test.describe("Logo click resets scroll without prior deep seek", () => {

  test("grid: logo click scrolls to top when scrolled within first page", async ({ kupua }) => {
    await kupua.startSearch();
    const initial = await kupua.getStoreState();
    expect(initial.bufferOffset).toBe(0);

    // Scroll down a meaningful amount within the first page
    await kupua.scrollBy(1500);
    const scrollBefore = await kupua.getScrollTop();
    expect(scrollBefore, "should have scrolled down").toBeGreaterThan(500);

    // Click the Home logo
    await kupua.page.locator('a[title="Grid — clear all filters"]').first().click();
  await expect.poll(() => kupua.getScrollTop()).toBeLessThan(50);

    // Scroll must be at or very near 0
    const scrollAfter = await kupua.getScrollTop();
    expect(scrollAfter, "scrollTop after logo click").toBeLessThan(50);

    // Buffer must still be healthy
    const state = await kupua.getStoreState();
    expect(state.bufferOffset).toBe(0);
    expect(state.error).toBeNull();
    await kupua.assertPositionsConsistent();
  });

  test("table: logo click scrolls to top when scrolled within first page", async ({ kupua }) => {
    await kupua.startSearch();
    await kupua.switchToTable();
    const initial = await kupua.getStoreState();
    expect(initial.bufferOffset).toBe(0);

    // Scroll down within the first page
    await kupua.scrollBy(1500);
    const scrollBefore = await kupua.getScrollTop();
    expect(scrollBefore, "should have scrolled down").toBeGreaterThan(500);

    // Click the Home logo
    await kupua.page.locator('a[title="Grid — clear all filters"]').first().click();
  await expect.poll(() => kupua.getScrollTop()).toBeLessThan(50);

    const scrollAfter = await kupua.getScrollTop();
    expect(scrollAfter, "scrollTop after logo click").toBeLessThan(50);

    const state = await kupua.getStoreState();
    expect(state.bufferOffset).toBe(0);
    expect(state.error).toBeNull();
    await kupua.assertPositionsConsistent();
  });
});

// ---------------------------------------------------------------------------
// Scenario J: Home logo from deep table — no flash of wrong grid content
//
// This is the definitive test for the "Home logo flash" bug.
//
// When clicking the Home logo from a deep-seeked TABLE view, the old code
// would: (1) fire search() async, (2) switch layout immediately,
// (3) grid mounts with stale deep-offset buffer
// → flash of wrong images for ~50-200ms. The fix makes resetToHome() async
// — it awaits search() completion before navigating, so the grid only
// mounts after fresh page-1 data is in the store.
//
// This test installs a MutationObserver on the grid container to catch the
// exact moment the grid mounts, then reads the store's bufferOffset. If
// the grid ever renders while bufferOffset > 0, that's the flash.
// ---------------------------------------------------------------------------

test.describe("Home logo from deep table — no flash of wrong grid content", () => {

  test("grid never mounts with stale deep-offset data during Home from table", async ({ kupua }) => {
    await kupua.startSearch();
    await kupua.switchToTable();
    const initial = await kupua.getStoreState();
    test.skip(initial.total < MIN_TOTAL_FOR_SEEK, `Total ${initial.total} too small for seek`);

    const firstImageBefore = initial.firstImageId;

    // Seek deep in table view
    await kupua.seekTo(0.5);
    const afterSeek = await kupua.getStoreState();
    expect(afterSeek.bufferOffset, "should be at a deep offset").toBeGreaterThan(0);

    await kupua.page.evaluate(() => {
      const store = (window as any).__kupua_store__;
      const source = store.getState().dataSource;
      const original = source.searchAfter;
      const own = Object.getOwnPropertyDescriptor(source, "searchAfter");
      let release!: () => void;
      const held = new Promise<void>(resolve => { release = resolve; });
      const probe = { ready: false, held: false, released: false, done: false,
        departure: store.getState().results, samples: [] as { grid: boolean; offset: number; fresh: boolean }[],
        release: () => { probe.released = true; release(); }, cleanup: () => {} };
      source.searchAfter = async function (...args: any[]) {
        const result = await original.apply(this, args);
        if (!probe.held && args[0].trackTotalHits && !args[1]) {
          probe.held = true;
          probe.ready = true;
          await held;
        }
        return result;
      };
      const sample = () => {
        const state = store.getState();
        probe.samples.push({ grid: !!document.querySelector('[aria-label="Image results grid"]'),
          offset: state.bufferOffset, fresh: state.results !== probe.departure && !state.loading });
      };
      const observer = new MutationObserver(sample);
      observer.observe(document, { childList: true, subtree: true });
      const frame = () => { sample(); if (!probe.done) requestAnimationFrame(frame); };
      requestAnimationFrame(frame);
      probe.cleanup = () => {
        probe.release();
        probe.done = true;
        observer.disconnect();
        if (own) Object.defineProperty(source, "searchAfter", own);
        else delete source.searchAfter;
      };
      (window as any).__homeData = probe;
    });
    try {
      await kupua.page.locator('a[title="Grid — clear all filters"]').first().click();
      await kupua.page.waitForFunction(() => (window as any).__homeData.ready);
      await kupua.assertDensity("table");
      const pending = await kupua.page.evaluate(async () => {
        for (let frame = 0; frame < 12; frame++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        const probe = (window as any).__homeData;
        const state = (window as any).__kupua_store__.getState();
        return { sameResults: state.results === probe.departure, loading: state.loading,
          prematureGrid: probe.samples.some((sample: any) => sample.grid), offset: state.bufferOffset };
      });
      expect(pending).toEqual({ sameResults: true, loading: true, prematureGrid: false, offset: afterSeek.bufferOffset });
      await kupua.page.evaluate(() => (window as any).__homeData.release());
      await kupua.assertDensity("grid");
      await kupua.waitForResults();
      const samples = await kupua.page.evaluate(() => (window as any).__homeData.samples);
      expect(samples.some((sample: any) => sample.grid)).toBe(true);
      for (const sample of samples.filter((sample: any) => sample.grid)) {
        expect(sample).toEqual({ grid: true, offset: 0, fresh: true });
      }
    } finally {
      await kupua.page.evaluate(() => { (window as any).__homeData?.cleanup(); delete (window as any).__homeData; });
    }

    // Final state: clean top, first image matches
    await assertCleanTopState(kupua, "Home from deep table — no flash");
    const afterHome = await kupua.getStoreState();
    expect(afterHome.firstImageId).toBe(firstImageBefore);
  });
});


