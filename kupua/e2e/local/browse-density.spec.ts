import { test, expect } from "../shared/helpers";
import { pendingBrowseAcrossDensity } from "../shared/browse-density";

for (const transport of ["direct-ES", "media-api-fixture"] as const) {
  for (const focusMode of ["explicit", "phantom"] as const) {
    for (const sourceView of ["grid", "table"] as const) {
      test(`B17 indexed ${transport} ${focusMode} ${sourceView} retains pending destination`, async ({ kupua }) => {
        await pendingBrowseAcrossDensity(kupua, transport, focusMode, sourceView);
      });
    }
  }
  for (const sourceView of ["grid", "table"] as const) {
    test(`B17 indexed ${transport} explicit ${sourceView} retains queued destination without focus`, async ({ kupua }) => {
      await pendingBrowseAcrossDensity(kupua, transport, "explicit", sourceView, "queued");
    });
    test(`B17 indexed ${transport} explicit ${sourceView} retains scrubber wheel destination`, async ({ kupua }) => {
      await pendingBrowseAcrossDensity(kupua, transport, "explicit", sourceView, "wheel");
    });
  }
}

for (const focusMode of ["explicit", "phantom"] as const) {
  for (const sourceView of ["grid", "table"] as const) {
    for (const kind of ["ordinary", "AI"] as const) {
      test(`B17 discovery ${kind} ${focusMode} ${sourceView} retains new membership during browsing`, async ({ kupua }) => {
        const page = kupua.page;
        await kupua.startSearch("", sourceView);
        await page.waitForFunction(() => !(window as any).__kupua_store__.getState().loading);
        await page.evaluate(async ({ kind, focusMode }) => {
          const configPath = "/src/dal/es-config.ts";
          if (!(await import(configPath)).IS_LOCAL_ES) throw new Error("B17 fixture requires local ES");
          const prefsPath = "/src/stores/ui-prefs-store.ts";
          const { useUiPrefsStore } = await import(prefsPath);
          useUiPrefsStore.getState().setFocusMode(focusMode);
          const store = (window as any).__kupua_store__;
          const originalSource = store.getState().dataSource;
          const mockPath = "/src/dal/mock-data-source.ts";
          const { MockDataSource } = await import(mockPath);
          const source = new MockDataSource(100);
          const originalPage = source.searchAfter.bind(source);
          const expected = await originalPage({ ...store.getState().params, length: 100 }, null);
          let release!: () => void;
          const held = new Promise<void>(resolve => { release = resolve; });
          const probe = { release: () => release(), work: null as Promise<void> | null, ready: false, ordinaryReads: 0,
            expected: expected.hits.map((image: any) => image.id), owned: null as any, cleanup: async () => {} };
          source.searchAfter = async (...args: any[]) => {
            probe.ordinaryReads += 1;
            const result = await originalPage(...args);
            if (args[0].trackTotalHits) { probe.ready = true; await held; }
            return result;
          };
          source.searchByAi = async () => {
            probe.ready = true;
            await held;
            const hits = expected.hits.map((image: any, index: number) => ({ ...image, __aiScore: 100 - index }));
            return { ...expected, hits, sortValues: hits.map((image: any) => [image.__aiScore, image.id]),
              poolTotal: 500, tickerCounts: {} };
          };
          store.setState({ dataSource: source, focusedImageId: store.getState().results[0].id });
          store.getState().setParams(kind === "AI" ? { aiQuery: "bounded-membership" } : { query: "bounded-membership" });
          probe.work = store.getState().search();
          probe.cleanup = async () => {
            release();
            await probe.work;
            store.setState({ dataSource: originalSource });
            delete (window as any).__b17Membership;
          };
          (window as any).__b17Membership = probe;
        }, { kind, focusMode });
        try {
          await page.waitForFunction(() => (window as any).__b17Membership.ready);
          const container = page.locator(`[aria-label="Image results ${sourceView}"]`);
          await container.press("End");
          if (kind === "AI") {
            const bounds = await kupua.scrubber.boundingBox();
            expect(bounds).not.toBeNull();
            await kupua.scrubber.click({ position: { x: bounds!.width / 2, y: bounds!.height * 0.65 } });
            await page.waitForTimeout(250);
            expect(await page.evaluate(() => (window as any).__b17Membership.ordinaryReads)).toBe(0);
          } else {
            await page.waitForFunction(() => (window as any).__kupua_store__.getState().total === 100 &&
              !(window as any).__kupua_store__.getState().loading);
            const tail = await page.evaluate(() => (window as any).__b17Membership.expected.at(-1));
            await expect(container.locator(`[data-image-id="${tail}"]`)).toBeInViewport();
            await page.evaluate(() => { (window as any).__b17Membership.owned = (window as any).__kupua_store__.getState().results; });
          }
          await page.evaluate(async () => {
            const probe = (window as any).__b17Membership;
            probe.release();
            await probe.work;
          });
          await expect.poll(() => page.evaluate(kind => {
            const state = (window as any).__kupua_store__.getState();
            const probe = (window as any).__b17Membership;
            return { total: state.total, offset: state.bufferOffset, loading: state.loading, error: state.error,
              sameMembership: state.results.length === probe.expected.length &&
                state.results.every((image: any, index: number) => image.id === probe.expected[index]),
              ownerRetained: kind === "AI" ? probe.ordinaryReads === 0 : state.results === probe.owned };
          }, kind)).toEqual({ total: 100, offset: 0, loading: false, error: null, sameMembership: true, ownerRetained: true });
          await expect(container.locator("[data-image-id]").first()).toBeVisible();
          await kupua.assertPositionsConsistent();
        } finally {
          await page.evaluate(async () => { await (window as any).__b17Membership?.cleanup(); });
        }
      });
    }
  }
}