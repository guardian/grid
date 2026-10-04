import { test, expect } from "../shared/helpers";
import { pendingBrowseAcrossDensity } from "../shared/browse-density";
import type { SearchAfterResult, SortValues } from "../../src/dal/types";

test.beforeEach(async ({ kupua }) => {
  await kupua.ensureExplicitMode();
});

for (const transport of ["direct-ES", "media-api-fixture"] as const) {
  for (const view of ["grid", "table"] as const) {
    test(`B10 forced-seek ${transport} ${view} compensates every prepend through zero`, async ({ kupua }) => {
      const page = kupua.page;
      await page.setViewportSize({ width: 1130, height: 886 });
      await kupua.startSearch("", view);
      await expect(kupua.scrubber).toHaveAttribute("data-scrubber-mode", "seek");
      await page.evaluate(async () => {
        const configPath = "/src/dal/es-config.ts";
        if (!(await import(configPath)).IS_LOCAL_ES) throw new Error("B10 requires local ES");
        await (window as any).__kupua_store__.getState().seek(600);
      });
      const point = await kupua.waitForHitTestedImagePoint({ view });
      await page.mouse.click(point.x, point.y);
      const evictions = (await kupua.getStoreState()).forwardEvictGeneration;
      const container = page.locator(`[aria-label="Image results ${view}"]`);
      const bounds = (await container.boundingBox())!;
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      for (let step = 0; step < 60 && (await kupua.getStoreState()).forwardEvictGeneration === evictions; step++) {
        await page.mouse.wheel(0, view === "grid" ? 3000 : 1200);
        await page.evaluate(async () => {
          for (let frame = 0; frame < 12; frame++) await new Promise(requestAnimationFrame);
        });
      }
      await expect.poll(async () => (await kupua.getStoreState()).forwardEvictGeneration).toBeGreaterThan(evictions);
      await page.waitForFunction(() => !(window as any).__kupua_store__.getState()._extendForwardInFlight);
      await page.evaluate(async transport => {
        const store = (window as any).__kupua_store__;
        const originalSource = store.getState().dataSource;
        const originalFetch = window.fetch;
        const params = { ...store.getState().params };
        const corpus = { hits: [] as any[], sortValues: [] as any[] };
        let cursor: SortValues | null = null;
        for (let batch = 0; batch < 15; batch++) {
          const result: SearchAfterResult = await originalSource.searchAfter({ ...params, offset: 0, length: 200 }, cursor);
          corpus.hits.push(...result.hits);
          corpus.sortValues.push(...result.sortValues);
          cursor = result.sortValues.at(-1) ?? null;
        }
        if (corpus.hits.length !== 3000) throw new Error("B10 corpus is too small for eviction");
        const apiPath = "/src/dal/api-data-source.ts";
        const source = transport === "media-api-fixture" ? new (await import(apiPath)).ApiDataSource() : originalSource;
        let httpReads = 0;
        if (transport === "media-api-fixture") window.fetch = async (input, init) => {
          const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.origin);
          if (!url.pathname.endsWith("/api/images/search-after")) return originalFetch(input, init);
          httpReads += 1;
          const body = JSON.parse(init?.body as string);
          const result = await originalSource.searchAfter({ query: body.q, orderBy: body.orderBy,
            nonFree: body.free ? undefined : "true", since: body.since, until: body.until,
            offset: body.offset, length: body.length, trackTotalHits: body.countAll },
          body.sortValues ?? null, null, init?.signal, body.reverse, body.seekToEnd);
          return Response.json({ data: result.hits.map((image: any) => ({ data: { ...image,
            userMetadata: image.userMetadata ? { data: { ...image.userMetadata,
              archived: { data: image.userMetadata.archived }, labels: { data: image.userMetadata.labels?.map((data: unknown) => ({ data })) },
              metadata: { data: image.userMetadata.metadata }, usageRights: { data: image.userMetadata.usageRights }, photoshoot: { data: image.userMetadata.photoshoot } } } : undefined,
            fileMetadata: image.fileMetadata ? { data: image.fileMetadata } : undefined,
            usages: { data: (image.usages ?? []).map((data: unknown) => ({ data })) },
            leases: { data: image.leases ?? { leases: [] } }, collections: (image.collections ?? []).map((data: unknown) => ({ data })) } })),
            total: result.total, sortValues: result.sortValues });
        };
        const originalPage = source.searchAfter;
        const ownPage = Object.getOwnPropertyDescriptor(source, "searchAfter");
        const selectionPath = "/src/stores/selection-store.ts";
        const selection = (await import(selectionPath)).useSelectionStore;
        const bookmark = store.getState().focusedImageId;
        if (!bookmark) throw new Error("B10 bookmark not focused by native click");
        selection.setState({ selectedIds: new Set([bookmark]), anchorId: bookmark });
        const cachePath = "/src/lib/image-offset-cache.ts";
        const cache = await import(cachePath);
        const key = cache.buildSearchKey(params);
        const frames = async (count: number) => {
          for (let frame = 0; frame < count; frame++) {
            await new Promise(requestAnimationFrame);
            if (document.visibilityState !== "visible") throw new Error("B10 backgrounded frame");
          }
        };
        const subscriptions = new Set<() => void>();
        const ownSubscription = (listener: (current: any, previous: any) => void) => {
          const unsubscribe = store.subscribe(listener);
          const stop = () => { unsubscribe(); subscriptions.delete(stop); };
          subscriptions.add(stop);
          return stop;
        };
        const probe = { completed: 0, active: 0, positive: 0, final: false, error: "", reads: 0, closed: false,
          offsets: [] as number[], work: [] as Promise<unknown>[], cleanup: async () => {}, httpReads: () => httpReads,
          ownSubscription, semanticSnapshot: () => {
            const current = store.getState();
            return JSON.stringify({ ids: current.results.map((image: any) => image.id),
              tuples: current.results.map((image: any) => cache.getRetainedSortValues(image.id, key)),
              positions: [...current.imagePositions.entries()].sort(), start: current.startCursor, end: current.endCursor,
              offset: current.bufferOffset, reset: current._scrollReset, seek: current._seekGeneration,
              prepend: current._prependGeneration, eviction: current._forwardEvictGeneration, focus: current.focusedImageId,
              selected: [...selection.getState().selectedIds].sort(), selectionAnchor: selection.getState().anchorId });
          } };
        source.searchAfter = function (...args: any[]) {
          probe.reads += 1;
          const backward = args[4] && args[1];
          if (backward) probe.active += 1;
          const work = (async () => {
            const result = await originalPage.apply(this, args);
            if (transport === "media-api-fixture") {
              const project = (image: any) => ({ metadata: image.userMetadata ? {
                archived: image.userMetadata.archived, labels: image.userMetadata.labels, metadata: image.userMetadata.metadata,
                usageRights: image.userMetadata.usageRights, photoshoot: image.userMetadata.photoshoot, lastModified: image.userMetadata.lastModified } : undefined,
                fileMetadata: image.fileMetadata, usages: image.usages ?? [], leases: image.leases ?? { leases: [] }, collections: image.collections ?? [] });
              for (const image of result.hits) {
                const expected = corpus.hits.find(original => original.id === image.id);
                if (!expected || JSON.stringify(project(image)) !== JSON.stringify(project(expected))) throw new Error("B10 decoded API DTO fields differ from independent ES image");
              }
            }
            if (!backward) return result;
            const before = store.getState();
            const container = document.querySelector<HTMLElement>('[aria-label="Image results grid"], [aria-label="Image results table"]')!;
            const deadline = performance.now() + 1000;
            let previousTop = container.scrollTop;
            let stableFrames = 0;
            while (stableFrames < 3) {
              await frames(1);
              stableFrames = container.scrollTop === previousTop ? stableFrames + 1 : 0;
              previousTop = container.scrollTop;
              if (performance.now() > deadline) throw new Error("B10 native wheel did not stop before held sampling");
            }
            const usableTop = container.querySelector('[data-table-header]')?.getBoundingClientRect().bottom ?? container.getBoundingClientRect().top;
            const cells = Array.from(container.querySelectorAll<HTMLElement>('[data-image-id]'));
            const anchor = cells.find(cell => { const rect = cell.getBoundingClientRect(); return rect.top >= usableTop && rect.bottom <= container.getBoundingClientRect().bottom; });
            if (!anchor) throw new Error("B10 held anchor missing");
            const identity = anchor.dataset.imageId!;
            const animationDeadline = performance.now() + 1000;
            while (getComputedStyle(anchor).animationName === "kupua-arrive" && anchor.getAnimations().some(animation => animation.playState === "running")) {
              await frames(1);
              if (store.getState().results !== before.results) throw new Error("B10 data changed during anchor animation");
              if (performance.now() > animationDeadline) throw new Error("B10 existing arrival animation did not finish");
            }
            const departure = anchor.getBoundingClientRect();
            const describe = (cell: HTMLElement) => {
              const style = getComputedStyle(cell);
              return { top: cell.getBoundingClientRect().top, rowTop: cell.parentElement!.getBoundingClientRect().top,
                containerTop: container.getBoundingClientRect().top, scrollTop: container.scrollTop,
                translate: style.translate, animationName: style.animationName,
                markedArriving: store.getState()._arrivingImageIds.has(identity),
                animations: cell.getAnimations().map(animation => ({ currentTime: animation.currentTime,
                  playState: animation.playState, timing: animation.effect?.getComputedTiming() })) };
            };
            const departureDiagnostic = describe(anchor);
            const columns = cells.filter(cell => Math.abs(cell.getBoundingClientRect().top - departure.top) < 1).length;
            if (container.getAttribute("aria-label")?.endsWith("grid") && columns !== 3) throw new Error(`B10 expected three measured columns, got ${columns}`);
            const checkGeometry = (stage: string) => {
              const cell = container.querySelector<HTMLElement>(`[data-image-id="${CSS.escape(identity)}"]`);
              const rect = cell?.getBoundingClientRect();
              if (!rect || Math.abs(rect.top - departure.top) >= 1 || Math.abs(rect.left - departure.left) >= 1) throw new Error(`B10 ${stage} anchor moved: offset ${before.bufferOffset}->${store.getState().bufferOffset}, dy ${rect ? rect.top - departure.top : "missing"}, dx ${rect ? rect.left - departure.left : "missing"}; ${JSON.stringify({ before: departureDiagnostic, after: cell ? describe(cell) : null })}`);
            };
            for (let frame = 0; frame < 12; frame++) {
              await frames(1);
              if (store.getState().results !== before.results) throw new Error("B10 published before release");
              checkGeometry("pending");
            }
            if (probe.closed) return result;
            const unsubscribe = ownSubscription((after: any) => {
              if (after.results === before.results) return;
              unsubscribe();
              const observation = (async () => {
                for (let frame = 0; frame < 12; frame++) { await frames(1); checkGeometry("published"); }
                const current = store.getState();
                const expected = corpus.hits.slice(current.bufferOffset, current.bufferOffset + current.results.length);
                if (JSON.stringify(current.results.map((image: any) => image.id)) !== JSON.stringify(expected.map((image: any) => image.id))) throw new Error("B10 corpus membership/order mismatch");
                if (current._scrollReset.gen !== before._scrollReset.gen || current.focusedImageId !== bookmark || selection.getState().selectedIds.size !== 1 || !selection.getState().selectedIds.has(bookmark)) throw new Error("B10 reset or bookmark changed");
                for (const [index, image] of current.results.entries()) {
                  const tuple = corpus.sortValues[current.bufferOffset + index];
                  if (current.imagePositions.get(image.id) !== current.bufferOffset + index || JSON.stringify(cache.getRetainedSortValues(image.id, key)) !== JSON.stringify(tuple)) throw new Error("B10 position/retained tuple mismatch");
                }
                if (JSON.stringify(current.startCursor) !== JSON.stringify(corpus.sortValues[current.bufferOffset]) || JSON.stringify(current.endCursor) !== JSON.stringify(corpus.sortValues[current.bufferOffset + current.results.length - 1])) throw new Error("B10 boundary cursor mismatch");
                probe.offsets.push(current.bufferOffset);
                if (current.bufferOffset > 0) probe.positive += 1;
                else probe.final = true;
                probe.completed += 1;
                probe.active -= 1;
              })().catch(error => { probe.error = String(error); probe.active -= 1; });
              probe.work.push(observation);
            });
            return result;
          })().catch(error => { probe.error = String(error); if (backward) probe.active -= 1; throw error; });
          probe.work.push(work);
          return work;
        };
        store.setState({ dataSource: source });
        probe.cleanup = async () => {
          probe.closed = true;
          for (const unsubscribe of subscriptions) unsubscribe();
          if (ownPage) Object.defineProperty(source, "searchAfter", ownPage);
          else delete source.searchAfter;
          await Promise.all(probe.work.map(work => work.catch(() => {})));
          window.fetch = originalFetch;
          store.setState({ dataSource: originalSource });
          delete (window as any).__b10;
        };
        (window as any).__b10 = probe;
      }, transport);
      try {
        for (let step = 0; step < 80; step++) {
          const state = await page.evaluate(() => {
            const probe = (window as any).__b10;
            return { error: probe.error, active: probe.active, final: probe.final };
          });
          expect(state.error).toBe("");
          if (state.final && !state.active) break;
          if (!state.active) await page.mouse.wheel(0, view === "grid" ? -3000 : -800);
          await page.evaluate(async () => { for (let frame = 0; frame < 12; frame++) await new Promise(requestAnimationFrame); });
        }
        const proof = await page.evaluate(() => {
          const probe = (window as any).__b10;
          return { error: probe.error, final: probe.final, positive: probe.positive, completed: probe.completed,
            reads: probe.reads, httpReads: probe.httpReads() };
        });
        expect(proof.error).toBe("");
        expect(proof.final).toBe(true);
        expect(proof.positive).toBeGreaterThan(0);
        expect(proof.completed).toBe(proof.reads);
        if (transport === "media-api-fixture") expect(proof.httpReads).toBe(proof.reads);
        const noReset = await container.evaluate(element => element.scrollTop);
        expect(noReset).toBeGreaterThan(0);
        await page.evaluate(async () => {
          const store = (window as any).__kupua_store__;
          const probe = (window as any).__b10;
          const container = document.querySelector<HTMLElement>('[aria-label="Image results grid"], [aria-label="Image results table"]')!;
          const before = store.getState();
          const top = container.scrollTop;
          const left = container.scrollLeft;
          const semantic = probe.semanticSnapshot();
          const reads = probe.reads;
          const httpReads = probe.httpReads();
          const isPreserved = () => container.scrollTop === top && container.scrollLeft === left
            && probe.reads === reads && probe.httpReads() === httpReads && probe.semanticSnapshot() === semantic
            && store.getState().results === before.results && store.getState().imagePositions === before.imagePositions;
          await store.getState().extendBackward();
          for (let frame = 0; frame < 12; frame++) await new Promise(requestAnimationFrame);
          if (!isPreserved()) throw new Error("B10 no-reset control changed departure");
          const empty = await store.getState().dataSource.searchAfter({ ...before.params, offset: 0, length: 0, trackTotalHits: false }, null);
          if (empty.hits.length !== 0) throw new Error("B10 deliberate empty-read control returned hits");
          if (isPreserved()) throw new Error("B10 no-reset predicate accepted an extra empty read");
          if (probe.error) throw new Error(probe.error);
        });
        await page.keyboard.press("Home");
        await expect.poll(() => container.evaluate(element => element.scrollTop)).toBe(0);
      } finally {
        await page.evaluate(async () => {
          const probe = (window as any).__b10;
          if (!probe) return;
          const store = (window as any).__kupua_store__;
          let lateObservations = 0;
          probe.ownSubscription((current: any, previous: any) => { if (current.results !== previous.results) lateObservations += 1; });
          await probe.cleanup();
          const results = store.getState().results;
          store.setState({ results: [...results] });
          store.setState({ results });
          if (lateObservations !== 0) throw new Error("B10 cleanup retained an unpublished observer");
        });
      }
    });
  }
}

for (const sourceView of ["grid", "table"] as const) {
  test(`B18 forced-seek ${sourceView} preserves pending presentation without density`, async ({ kupua }) => {
    await pendingBrowseAcrossDensity(kupua, "direct-ES", "explicit", sourceView, "pending", false);
  });
}

for (const transport of ["direct-ES", "media-api-fixture"] as const) {
  for (const focusMode of ["explicit", "phantom"] as const) {
    for (const sourceView of ["grid", "table"] as const) {
      test(`B17 forced-seek ${transport} ${focusMode} ${sourceView} retains pending destination`, async ({ kupua }) => {
        await pendingBrowseAcrossDensity(kupua, transport, focusMode, sourceView);
      });
    }
  }
}

test("forced seek preserves identity through the core journey", async ({ kupua }) => {
  test.setTimeout(90_000);
  await kupua.startSearch();

  await test.step("50% track click paints a stable seek identity", async () => {
    await expect(kupua.scrubber).toHaveAttribute("data-scrubber-mode", "seek");
    const generationBefore = (await kupua.getStoreState()).seekGeneration;
    await kupua.seekTo(0.5, undefined, { waitForPositionMap: false });
    const state = await kupua.getStoreState();
    expect(state.seekGeneration).toBeGreaterThan(generationBefore);
    expect(state.error).toBeNull();

    await kupua.focusNthItem(5);
    const focusedId = (await kupua.getFocusedImageId())!;
    expect(focusedId).toBeTruthy();
    await expect(kupua.page.locator(`[data-image-id="${focusedId}"]`)).toBeVisible();
  });

  await test.step("focused End then Home reaches exact boundaries", async () => {
    const endGeneration = (await kupua.getStoreState()).seekGeneration;
    await kupua.page.keyboard.press("End");
    await kupua.waitForSeekGenerationBump(endGeneration);
    const endState = await kupua.getStoreState();
    expect(endState.error).toBeNull();
    expect(await kupua.getFocusedGlobalPosition()).toBe(endState.total - 1);
    expect(await kupua.isFocusedCellVisible()).toBe(true);

    const homeGeneration = endState.seekGeneration;
    await kupua.page.keyboard.press("Home");
    await kupua.waitForSeekGenerationBump(homeGeneration);
    const homeState = await kupua.getStoreState();
    expect(homeState.error).toBeNull();
    expect(homeState.bufferOffset).toBe(0);
    expect(await kupua.getFocusedGlobalPosition()).toBe(0);
    expect(await kupua.isFocusedCellVisible()).toBe(true);
  });
});