import { test, expect, type Dialog, type JSHandle, type Page } from "@playwright/test";
import { createServer as createHttpServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { build, createServer } from "vite";
import type * as Commands from "../../src/lib/grid-commands";
import type { labelEditorFixture } from "../shared/label-editor-fixture";
import { GRID_API_READ_VIA_POST } from "../../src/dal/grid-api/read-via-post";
import { labelEditorPlugin, virtualEntry } from "../shared/label-editor-plugin";
import { getDensityChangeButton } from "../shared/density-selection";
import { waitForFixtureSetup } from "../shared/helpers";
import type { useSearchStore } from "../../src/stores/search-store";
import type { useSelectionStore } from "../../src/stores/selection-store";

type CommandWindow = typeof window & { commandFixture: typeof Commands; editorFixture: typeof labelEditorFixture;
  __kupua_store__: typeof useSearchStore; __kupua_selection_store__: typeof useSelectionStore };
const fixturePlugin = labelEditorPlugin();

async function runReadbackAction(page: Page, action: "holdReadbackSearch" | "releaseReadbackSearch") {
  const handle = await page.evaluateHandle(action => {
    const job = { complete: false, error: null as string | null, pending: Promise.resolve() };
    job.pending = (window as CommandWindow).editorFixture[action]().then(
      () => { job.complete = true; },
      error => { job.error = String(error); },
    );
    return job;
  }, action);
  await waitForFixtureSetup(page, handle);
}

test.describe("Unit B isolated continuation", () => {
  let vite: Awaited<ReturnType<typeof createServer>>;
  let origin: string;
  const env = { VITEST: "true", VITE_USE_MEDIA_API: "true", VITE_HOSTED: "false", VITE_MEDIA_API_BASE_URL: "/api",
    VITE_MEDIA_DELIVERY: "canonical", VITE_COLLECTIONS_URL: "/fixture-collections",
    VITE_GRID_METADATA_ORIGIN: "https://metadata.example.test" };
  let previous: Record<string, string | undefined>;
  const counts = (page: Page) => page.evaluate(async () => (await fetch("/__readback-control")).json()) as Promise<{
    pageReads: number; rankReads: number; countReads: number; mapReads: number; held: number; aborted: number; unexpected: string[];
    mgetReads: number; fullReads: number; fakeDispatches: number; staleDelivered: number;
  }>;
  test.beforeAll(async ({}, testInfo) => {
    previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
    Object.assign(process.env, env);
    vite = await createServer({ configFile: resolve("vite.config.ts"), cacheDir: testInfo.outputPath("vite-cache"),
      plugins: [labelEditorPlugin("continuation")], server: { host: "127.0.0.1", port: 0 } });
    await vite.listen();
    origin = vite.resolvedUrls!.local[0].replace(/\/$/, "");
  });
  test.afterAll(async () => {
    await vite?.close();
    for (const [key, value] of Object.entries(previous ?? {})) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  test.beforeEach(async ({ page }) => {
    await page.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.request.post(`${origin}/__readback-control`, { data: { action: "reset", total: 9_000_000 } });
  });
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => (window as Partial<CommandWindow>).editorFixture?.disposeReadback()).catch(() => {});
    await page.goto("about:blank");
    await page.unrouteAll({ behavior: "wait" });
  });

  test("Unit D End reacquires a tail window and Home recovers observed bodies", async ({ page }) => {
    await page.request.post(`${origin}/__readback-control`, { data: { action: "reset", total: 120 } });
    await page.goto(`${origin}/__readback?density=grid`);
    const region = page.getByRole("region", { name: "Image results grid", exact: true });
    await expect(region.locator('[data-cell-id="local-0"]')).toBeVisible();
    expect(await page.evaluate(() => (window as CommandWindow).editorFixture.simulateReadback(["local-0"], "unknown"))).toBe(true);
    await expect.poll(() => page.evaluate(() => (window as CommandWindow).editorFixture.readbackSnapshot().receipts[0]?.items[0].observation)).toBe("observed");
    const seek = await page.evaluateHandle(() => {
      const job = { complete: false, error: null as string | null, pending: Promise.resolve() };
      job.pending = (window as CommandWindow).__kupua_store__.getState().seek(119).then(
        () => { job.complete = true; },
        error => { job.error = String(error); },
      );
      return job;
    });
    await waitForFixtureSetup(page, seek);
    await expect(region.locator('[data-cell-id="local-119"]')).toBeVisible();
    expect(await page.evaluate(() => {
      const state = (window as CommandWindow).__kupua_store__.getState();
      return { offset: state.bufferOffset, ids: state.results.map(image => image?.id), total: state.total };
    })).toEqual({ offset: 19, ids: Array.from({ length: 101 }, (_, index) => `local-${index + 19}`), total: 120 });
    await page.keyboard.press("Home");
    await expect(region.locator('[data-cell-id="local-0"]')).toBeVisible();
    await expect(region.locator('[data-cell-id="local-0"]')).toContainText("Readback local-0");
    expect(await page.evaluate(() => (window as CommandWindow).editorFixture.readbackSnapshot().receipts[0].items[0].state)).toBe("unknown");
    expect((await counts(page)).unexpected).toEqual([]);
  });

  for (const seed of [17, 43, 101, 211]) {
    test(`Unit D bounded sequence seed ${seed}`, async ({ page }) => {
      await page.request.post(`${origin}/__readback-control`, { data: { action: "reset", total: 120 } });
      await page.goto(`${origin}/__readback?density=grid`);
      let density: "grid" | "table" | "justified" = "grid";
      const region = () => page.getByRole("region", { name: `Image results ${density}`, exact: true });
      await expect(region().locator('[data-cell-id="local-0"]')).toBeVisible();
      await expect.poll(() => page.evaluate(() => (window as CommandWindow).__kupua_store__.getState().results.length)).toBe(120);
      const expectedIds = Array.from({ length: 120 }, (_, index) => `local-${index}`);
      let selected: string[] = [];
      const published: string[] = [];
      const trace: string[] = [];
      let exactActions = 0;
      let random = seed;
      const next = (limit: number) => { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; return random % limit; };
      const initialReads = await counts(page);
      try {
        for (let cycle = 0; cycle < 4; cycle++) {
          const actions = ["scroll", "edge", "selection", "density", "publication", "history"];
          for (let index = actions.length - 1; index > 0; index--) {
            const swap = next(index + 1);
            [actions[index], actions[swap]] = [actions[swap], actions[index]];
          }
          for (const action of actions) {
            trace.push(`${trace.length + 1}:${action}`);
            if (action === "scroll") {
              const box = (await region().boundingBox())!;
              await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
              await page.mouse.wheel(0, next(2) ? 420 : -420);
            } else if (action === "edge") {
              await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
              const key = next(2) ? "Home" : "End";
              trace[trace.length - 1] += `:${key}`;
              await page.keyboard.press(key);
              exactActions++;
              await expect.poll(() => page.evaluate(() => (window as CommandWindow).__kupua_store__.getState().loading)).toBe(false);
              await expect(region().locator(`[data-cell-id="local-${key === "Home" ? 0 : 119}"]`)).toBeInViewport();
            } else if (action === "selection") {
              selected = [`local-${100 + next(10)}`, `local-${110 + next(10)}`];
              trace[trace.length - 1] += `:${selected.join(",")}`;
              await page.evaluate(ids => (window as CommandWindow).editorFixture.select(ids), selected);
              await expect.poll(() => page.evaluate(() => (window as CommandWindow).__kupua_selection_store__.getState().isReconciling)).toBe(false);
            } else if (action === "density") {
              density = (["grid", "table", "justified"] as const)[next(3)];
              const button = await getDensityChangeButton(page, density);
              if (button) await button.click();
              await expect(region()).toBeVisible();
            } else if (action === "publication") {
              const id = `local-${60 + cycle}`;
              trace[trace.length - 1] += `:${id}`;
              await runReadbackAction(page, "holdReadbackSearch");
              await expect.poll(async () => (await counts(page)).held).toBe(1);
              const beforeReads = await counts(page);
              const before = await page.evaluateHandle(() => {
                const state = (window as CommandWindow).__kupua_store__.getState();
                const region = document.querySelector('[role="region"][aria-label^="Image results"]')!;
                const bounds = region.getBoundingClientRect();
                return { results: state.results, positions: state.imagePositions, offset: state.bufferOffset,
                  seek: state._seekGeneration, reset: state._scrollReset, focus: state.focusedImageId,
                  boxes: [...region.querySelectorAll<HTMLElement>("[data-cell-id]")].filter(cell => {
                    const box = cell.getBoundingClientRect(); return box.bottom > bounds.top && box.top < bounds.bottom;
                  }).map(cell => ({ id: cell.dataset.cellId!, box: cell.getBoundingClientRect().toJSON() })) };
              });
              try {
                expect(await page.evaluate(id => (window as CommandWindow).editorFixture.simulateReadback([id], "unknown"), id)).toBe(true);
                await expect.poll(() => page.evaluate(() => (window as CommandWindow).editorFixture.readbackSnapshot().receipts.at(-1)?.items[0].observation)).toBe("observed");
                const stable = await before.evaluate((before, id) => {
                  const state = (window as CommandWindow).__kupua_store__.getState();
                  return { references: before.results.every((image, index) => image?.id === id || image === state.results[index]),
                    positions: state.imagePositions === before.positions, offset: state.bufferOffset === before.offset,
                    seek: state._seekGeneration === before.seek, reset: state._scrollReset === before.reset,
                    focus: state.focusedImageId === before.focus,
                    boxes: before.boxes.length > 0 && before.boxes.every(({ id, box }) => {
                      const current = document.querySelector(`[data-cell-id="${id}"]`)?.getBoundingClientRect();
                      return current && ["x", "y", "width", "height"].every(axis => Math.abs(current[axis as "x"] - box[axis]) <= 1);
                    }) };
                }, id);
                expect(stable).toEqual({ references: true, positions: true, offset: true, seek: true, reset: true, focus: true, boxes: true });
                const afterReads = await counts(page);
                const observerBudget = (reads: typeof afterReads) => expect([
                  reads.mgetReads - beforeReads.mgetReads, reads.fakeDispatches - beforeReads.fakeDispatches,
                  reads.fullReads - beforeReads.fullReads, reads.pageReads - beforeReads.pageReads,
                  reads.rankReads - beforeReads.rankReads, reads.mapReads - beforeReads.mapReads,
                  reads.countReads - beforeReads.countReads,
                ]).toEqual([1, 1, 0, 0, 0, 0, 0]);
                observerBudget(afterReads);
                if (cycle === 0) expect(() => observerBudget({ ...afterReads, mgetReads: afterReads.mgetReads + 1 })).toThrow();
              } finally { await before.dispose(); }
              await runReadbackAction(page, "releaseReadbackSearch");
              await expect.poll(() => page.evaluate(() => (window as CommandWindow).__kupua_store__.getState().loading)).toBe(false);
              expect((await counts(page)).staleDelivered - beforeReads.staleDelivered).toBe(1);
              published.push(id);
            } else {
              await page.evaluate(() => (window as CommandWindow).__kupua_selection_store__.getState().clear());
              selected = [];
              const target = region().locator('[data-cell-id] img').first();
              await target.scrollIntoViewIfNeeded();
              const id = await target.evaluate(image => image.closest<HTMLElement>("[data-cell-id]")!.dataset.cellId!);
              await region().locator(`[data-cell-id="${id}"] img`).locator("..").dblclick();
              await expect(page.locator("[data-detail-image-id]")).toHaveAttribute("data-detail-image-id", id);
              await page.goBack();
              await expect(page.locator("[data-detail-image-id]")).toHaveCount(0);
              await expect(region()).toBeVisible();
            }
            await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
            const actual = await page.evaluate(() => {
              const app = window as CommandWindow;
              const state = app.__kupua_store__.getState();
              return { offset: state.bufferOffset, ids: state.results.map(image => image?.id), positions: state.results.map(image => image && state.imagePositions.get(image.id)),
                total: state.total, selected: [...app.__kupua_selection_store__.getState().selectedIds],
                published: state.results.filter(image => image?.userMetadata?.labels?.includes("A3 observed label")).map(image => image!.id),
                receipts: app.editorFixture.readbackSnapshot().receipts.map(receipt => receipt.items.map(item => ({ id: item.imageId, state: item.state, observation: item.observation }))) };
            });
            expect([0, 19]).toContain(actual.offset);
            expect(actual).toEqual({ offset: actual.offset, ids: expectedIds.slice(actual.offset), positions: expectedIds.map((_, index) => index).slice(actual.offset), total: 120, selected,
              published, receipts: published.map(id => [{ id, state: "unknown", observation: "observed" }]) });
            const reads = await counts(page);
            expect(reads.unexpected).toEqual([]);
            expect(reads.held).toBe(0);
            expect(reads.pageReads - initialReads.pageReads).toBeGreaterThanOrEqual(published.length);
            expect(reads.pageReads - initialReads.pageReads).toBeLessThanOrEqual(published.length + exactActions * 2);
            expect([reads.rankReads, reads.mapReads]).toEqual([0, 0]);
            expect(reads.countReads - initialReads.countReads).toBeLessThanOrEqual(published.length + exactActions);
          }
        }
        console.log(`Unit D seed ${seed}: ${trace.join(" | ")}`);
      } catch (error) {
        console.error(`Unit D failed seed ${seed}: ${trace.join(" | ")}`);
        throw error;
      }
    });
  }

  test("Unit C T3 removes explicit deletion from five images fitting the viewport", async ({ page }) => {
    await page.request.post(`${origin}/__readback-control`, { data: { action: "reset", total: 5 } });
    await page.goto(`${origin}/__continuation?density=grid`);
    const region = page.getByRole("region", { name: "Image results grid", exact: true });
    await expect(region.locator("[data-cell-id]")).toHaveCount(5);
    await expect.poll(() => region.evaluate(region => {
      const bounds = region.getBoundingClientRect();
      return region.scrollHeight <= region.clientHeight && [...region.querySelectorAll("[data-cell-id]")].every(cell => {
        const box = cell.getBoundingClientRect();
        const image = cell.querySelector("img");
        return box.top >= bounds.top && box.bottom <= bounds.bottom && image?.complete && image.naturalWidth > 0;
      });
    })).toBe(true);
    await region.locator('[data-cell-id="local-3"] div[title^="Original "]').click();
    await expect.poll(() => page.evaluate(() => (window as CommandWindow).__kupua_store__.getState().focusedImageId)).toBe("local-3");
    const before = await counts(page);
    const retained = (await region.locator('[data-cell-id="local-2"]').boundingBox())!;
    await page.evaluate(() => (window as CommandWindow).editorFixture.publish("local-2", "reviewed"));
    await expect(region.locator('[data-cell-id="local-2"]')).toContainText("A2 published description");
    await expect(region.locator("[data-cell-id]")).toHaveCount(5);
    expect(await region.locator('[data-cell-id="local-2"]').boundingBox()).toEqual(retained);
    await page.evaluate(() => (window as CommandWindow).editorFixture.publishUnavailable("local-1"));
    await expect(region.locator("[data-cell-id]")).toHaveCount(4);
    expect(await page.evaluate(() => {
      const state = (window as CommandWindow).__kupua_store__.getState();
      return { ids: state.results.map(image => image?.id), total: state.total, focus: state.focusedImageId };
    })).toEqual({ ids: ["local-0", "local-2", "local-3", "local-4"], total: 4, focus: "local-3" });
    expect(await counts(page)).toEqual(before);
    await page.evaluate(() => (window as CommandWindow).editorFixture.publishUnavailable("local-3"));
    await expect(region.locator("[data-cell-id]")).toHaveCount(3);
    expect(await page.evaluate(() => {
      const state = (window as CommandWindow).__kupua_store__.getState();
      return { total: state.total, focus: state.focusedImageId };
    })).toEqual({ total: 3, focus: null });
    expect(await counts(page)).toEqual(before);
  });

  for (const density of ["grid", "table", "justified"] as const) {
    test(`Unit C retains unavailable slot geometry in ${density}`, async ({ page }) => {
      await page.request.post(`${origin}/__readback-control`, { data: { action: "reset", total: 120 } });
      await page.goto(`${origin}/__continuation?density=${density}`);
      const region = page.getByRole("region", { name: `Image results ${density}`, exact: true });
      const target = region.locator('[data-cell-id="local-1"]');
      await expect(target.locator("img")).toBeVisible();
      expect(await region.evaluate(region => region.scrollHeight > region.clientHeight)).toBe(true);
      const beforeReads = await counts(page);
      const boxes = await region.evaluate(region => {
        const bounds = region.getBoundingClientRect();
        return [...region.querySelectorAll<HTMLElement>("[data-cell-id]")].filter(cell => {
          const box = cell.getBoundingClientRect();
          return box.bottom > bounds.top && box.top < bounds.bottom;
        }).map(cell => ({ id: cell.dataset.cellId!, box: cell.getBoundingClientRect().toJSON() }));
      });
      if (density === "grid") {
        const original = (await target.boundingBox())!;
        await target.evaluate(target => { target.style.transform = "translateX(4px)"; });
        expect(Math.abs((await target.boundingBox())!.x - original.x)).toBeGreaterThan(1);
        await target.evaluate(target => { target.style.transform = ""; });
      }
      await page.evaluate(() => (window as CommandWindow).editorFixture.publishUnavailable("local-1", "unavailable"));
      await expect(target).toContainText("Image unavailable");
      await expect(target.locator("img, button, input, [data-loading-placeholder]")).toHaveCount(0);
      for (const retained of boxes) {
        const actual = (await region.locator(`[data-cell-id="${retained.id}"]`).boundingBox())!;
        for (const axis of ["x", "y", "width", "height"] as const) expect(Math.abs(actual[axis] - retained.box[axis])).toBeLessThanOrEqual(1);
      }
      expect(await page.evaluate(() => {
        const state = (window as CommandWindow).__kupua_store__.getState();
        return { total: state.total, length: state.results.length, position: state.imagePositions.get("local-1") };
      })).toEqual({ total: 120, length: 120, position: 1 });
      expect(await counts(page)).toEqual(beforeReads);
    });
  }

  test("Unit C keeps detail truthful and density stable across held reacquisition", async ({ page }) => {
    await page.request.post(`${origin}/__readback-control`, { data: { action: "reset", total: 120 } });
    await page.goto(`${origin}/__continuation?density=grid`);
    const grid = page.getByRole("region", { name: "Image results grid", exact: true });
    await expect(grid.locator('[data-cell-id="local-0"]')).toBeVisible();
    await grid.locator('[data-cell-id="local-0"] div[title^="Original "]').dblclick();
    await expect(page.locator("[data-detail-image-id]")).toHaveAttribute("data-detail-image-id", "local-0");
    await page.evaluate(() => {
      const fixture = (window as CommandWindow).editorFixture;
      fixture.publishUnavailable("local-0", "deleted");
      fixture.publishUnavailable("local-1", "unavailable");
    });
    const detail = page.locator("[data-detail-image-id]");
    await expect(detail.getByText("Image deleted", { exact: true })).toBeVisible();
    await expect(detail.getByTestId("detail-image-container").locator("img")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Crop image", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Next image", exact: true }).click();
    await expect(detail).toHaveAttribute("data-detail-image-id", "local-2");
    await expect(detail.getByTestId("detail-image-container").locator("img")).toBeVisible();
    await page.getByRole("button", { name: "Back to search", exact: true }).click();
    await runReadbackAction(page, "holdReadbackSearch");
    await expect.poll(async () => (await counts(page)).held).toBe(1);
    const tableButton = await getDensityChangeButton(page, "table");
    await tableButton!.click();
    const table = page.getByRole("region", { name: "Image results table", exact: true });
    await expect(table.locator('[data-cell-id="local-3"]')).toBeVisible();
    await page.evaluate(() => (window as CommandWindow).editorFixture.publishUnavailable("local-3", "unavailable"));
    await expect(table.locator('[data-cell-id="local-3"]')).toContainText("Image unavailable");
    await page.getByRole("button", { name: "Release old search", exact: true }).click();
    await expect.poll(async () => (await counts(page)).held).toBe(0);
    await expect.poll(() => page.evaluate(() => (window as CommandWindow).__kupua_store__.getState().loading)).toBe(false);
    await expect(table.locator('[data-cell-id="local-3"]')).toContainText("Image unavailable");
    await expect(table.locator('[data-cell-id="local-0"]')).toContainText("Image deleted");
    const justified = await getDensityChangeButton(page, "justified");
    await justified!.click();
    await expect(page.getByRole("region", { name: "Image results justified", exact: true }).locator('[data-cell-id="local-3"]')).toContainText("Image unavailable");
    expect((await counts(page)).unexpected).toEqual([]);
  });

  for (const arm of ["unchanged", "distant edit", "interrupted detector"] as const) {
    test(`preserves active lookahead: ${arm}`, async ({ page }) => {
      await page.goto(`${origin}/__continuation?density=grid`);
      const region = page.getByRole("region", { name: "Image results grid", exact: true });
      await expect(region.locator('[data-cell-id="local-0"]')).toBeVisible();
      await page.evaluate(() => (window as CommandWindow).editorFixture.seedContinuation());
      await expect(region.locator('[data-cell-id="local-4000650"]')).toBeVisible();
      const box = (await region.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      const before = await counts(page);
      const probe = await page.evaluateHandle(async () => {
        const path = "/src/lib/scroll-geometry-ref.ts";
        const { getLayoutGeometry } = await import(path);
        const store = (window as CommandWindow).__kupua_store__;
        const retained = store.getState();
        const region = document.querySelector<HTMLElement>('[aria-label="Image results grid"]')!;
        let frames = 0;
        let comparisons = 0;
        let jumps = 0;
        let frameId = 0;
        let prior = new Map<string, { x: number; y: number; width: number; height: number }>();
        const deadline = performance.now() + 30_000;
        const sample = () => {
          frames++;
          const geometry = getLayoutGeometry();
          const offset = Math.floor(store.getState().bufferOffset / geometry.columns) * geometry.rowHeight;
          const bounds = region.getBoundingClientRect();
          const current = new Map<string, { x: number; y: number; width: number; height: number }>();
          for (const cell of region.querySelectorAll<HTMLElement>("[data-cell-id]")) {
            const box = cell.getBoundingClientRect();
            if (box.bottom <= bounds.top || box.top >= bounds.bottom) continue;
            const next = { x: box.x, y: box.y + region.scrollTop + offset, width: box.width, height: box.height };
            const previous = prior.get(cell.dataset.cellId!);
            if (previous) {
              comparisons++;
              if (Object.keys(next).some(key => Math.abs(next[key as keyof typeof next] - previous[key as keyof typeof next]) > 1)) jumps++;
            }
            current.set(cell.dataset.cellId!, next);
          }
          prior = current;
          if (performance.now() < deadline) frameId = requestAnimationFrame(sample);
        };
        frameId = requestAnimationFrame(sample);
        return { stop() {
          cancelAnimationFrame(frameId);
          const current = store.getState();
          return { frames, comparisons, jumps, expired: performance.now() >= deadline,
            survivors: retained.results.slice(400).every(image => image && current.results.includes(image)
              && current.imagePositions.get(image.id) === retained.imagePositions.get(image.id)) };
        } };
      });
      const wheelUntil = async (ready: () => Promise<boolean>, delta: number) => {
        for (let step = 0; step < 40; step++) {
          if (await ready()) return;
          await page.mouse.wheel(0, delta);
          await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        }
        throw new Error("Bounded wheel journey did not reach its boundary");
      };
      try {
        await page.request.post(`${origin}/__readback-control`, { data: { action: "hold" } });
        await wheelUntil(async () => (await counts(page)).held === 1, 1200);
        expect(await page.evaluate(() => (window as CommandWindow).__kupua_store__.getState()._extendForwardInFlight)).toBe(true);
        if (arm !== "unchanged") {
          await page.evaluate(interrupt => (window as CommandWindow).editorFixture.simulateContinuation(1, interrupt), arm === "interrupted detector");
          await page.mouse.wheel(0, 120);
          await expect.poll(() => page.evaluate(() => (window as CommandWindow).editorFixture.readbackSnapshot().receipts.at(-1)?.items[0].observation)).toBe("observed");
        }
        const atPublication = await counts(page);
        const useful = atPublication.held === 1 && atPublication.aborted === 0;
        expect(useful).toBe(arm !== "interrupted detector");
        if (arm !== "unchanged") expect(await page.evaluate(() => (window as CommandWindow).editorFixture.readbackSnapshot().dispatchHadLookahead)).toBe(useful);
        if (arm === "interrupted detector") return;
        await page.request.post(`${origin}/__readback-control`, { data: { action: "release" } });
        await expect.poll(() => page.evaluate(() => (window as CommandWindow).__kupua_store__.getState().bufferOffset)).toBe(4_000_200);
        await wheelUntil(() => page.evaluate(() => (window as CommandWindow).__kupua_store__.getState().bufferOffset >= 4_000_400), 1200);
        await wheelUntil(() => page.evaluate(() => (window as CommandWindow).__kupua_store__.getState().bufferOffset < 4_000_400), -2400);
        const result = await probe.evaluate(probe => probe.stop());
        expect(result).toMatchObject({ expired: false, survivors: true, jumps: 0 });
        expect(result.comparisons).toBeGreaterThan(12);
        const after = await counts(page);
        expect(after.pageReads - before.pageReads).toBe(3);
        expect([after.rankReads - before.rankReads, after.countReads - before.countReads, after.mapReads - before.mapReads]).toEqual([0, 0, 0]);
        expect(after.unexpected).toEqual([]);
        expect(await page.evaluate(() => {
          const state = (window as CommandWindow).__kupua_store__.getState();
          return { length: state.results.length, total: state.total, offset: state.bufferOffset };
        })).toEqual({ length: 1000, total: 9_000_000, offset: 4_000_200 });
      } finally { await probe.evaluate(probe => probe.stop()); await probe.dispose(); }
    });
  }

  for (const total of [1000, 65000]) {
    test(`discovers new tail matches without switching the ${total} tier`, async ({ page }) => {
      const density = total === 1000 ? "grid" : "justified";
      await page.request.post(`${origin}/__readback-control`, { data: { action: "reset", total: total + 1, matching: total } });
      await page.goto(`${origin}/__continuation?density=${density}&tail`);
      const region = page.getByRole("region", { name: `Image results ${density}`, exact: true });
      await expect(region.locator('[data-cell-id="local-0"]')).toBeVisible();
      await expect.poll(() => page.evaluate(() => {
        const state = (window as CommandWindow).__kupua_store__.getState();
        return !state.loading && !state.positionMapLoading && !state._extendForwardInFlight &&
          (state.total > 1000 || state.results.length === state.total);
      })).toBe(true);
      await page.evaluate(total => (window as CommandWindow).editorFixture.seedContinuation(total - 1000, total - 1000, 1000, 999), total);
      const last = region.locator(`[data-cell-id="local-${total - 1}"]`);
      await expect(last).toBeVisible();
      await page.evaluate(total => (window as CommandWindow).editorFixture.simulateContinuation(1, false, total), total);
      await expect.poll(() => page.evaluate(() => (window as CommandWindow).editorFixture.readbackSnapshot().receipts.at(-1)?.items[0].observation)).toBe("observed");
      const pollSince = await page.evaluate(() => (window as CommandWindow).__kupua_store__.getState().newCountSince);
      let arrivalPolls = 0;
      await page.route("**/api/images/count", async route => {
        if (pollSince && route.request().postDataJSON().since === pollSince) {
          arrivalPolls++;
          await route.fulfill({ json: { total: 0 } });
        } else await route.fallback();
      });
      const before = await counts(page);
      const retainedBox = (await last.boundingBox())!;
      await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
      await expect.poll(() => arrivalPolls).toBeGreaterThan(0);
      if (total === 1000) {
        await last.locator('div[title^="Readback "]').dblclick();
        await expect(page.locator("[data-detail-image-id]")).toHaveAttribute("data-detail-image-id", `local-${total - 1}`);
        await page.getByRole("button", { name: "Next image", exact: true }).click();
        await expect(page.locator("[data-detail-image-id]")).toHaveAttribute("data-detail-image-id", `local-${total}`);
        await page.getByRole("button", { name: "Back to search", exact: true }).click();
      } else {
        const box = (await region.boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.wheel(0, 1);
      }
      await expect.poll(() => page.evaluate(total => (window as CommandWindow).__kupua_store__.getState().imagePositions.get(`local-${total}`), total)).toBe(total);
      await expect(page.getByTestId("scrubber-track")).toHaveAttribute("data-scrubber-mode", total === 1000 ? "buffer" : "indexed");
      if (total === 65000) {
        const afterBox = (await last.boundingBox())!;
        for (const axis of ["x", "y", "width", "height"] as const) expect(Math.abs(afterBox[axis] - retainedBox[axis])).toBeLessThanOrEqual(1);
        await page.mouse.wheel(0, 800);
      }
      await expect(region.locator(`[data-cell-id="local-${total}"] img`)).toBeVisible();
      expect(await page.evaluate(() => {
        const state = (window as CommandWindow).__kupua_store__.getState();
        return { total: state.total, length: state.results.length, extent: state._displayEnd };
      })).toEqual({ total, length: 1000, extent: total + 1 });
      const after = await counts(page);
      expect(after.pageReads - before.pageReads).toBeGreaterThanOrEqual(1);
      expect(after.pageReads - before.pageReads).toBeLessThanOrEqual(2);
      expect([after.rankReads - before.rankReads, after.countReads - before.countReads, after.mapReads - before.mapReads]).toEqual([0, 0, 0]);
      expect(after.unexpected).toEqual([]);
      if (total === 65000) {
        const target = region.locator(`[data-cell-id="local-${total}"]`);
        await target.locator('div[title^="Readback "]').click();
        const departure = (await target.boundingBox())!;
        for (const density of ["table", "grid", "justified"] as const) {
          const button = await getDensityChangeButton(page, density);
          if (button) await button.click();
          await expect(page.getByRole("region", { name: `Image results ${density}`, exact: true })
            .locator(`[data-cell-id="local-${total}"]`)).toBeVisible();
        }
        const restored = (await target.boundingBox())!;
        for (const axis of ["x", "y", "width", "height"] as const) expect(Math.abs(restored[axis] - departure[axis])).toBeLessThanOrEqual(1);
        expect(await page.evaluate(() => (window as CommandWindow).__kupua_store__.getState().focusedImageId)).toBe(`local-${total}`);
      }
    });
  }

  test("restores history identity and placement despite an invalid hint, then refuses a missing anchor", async ({ page }) => {
    await page.goto(`${origin}/__continuation?density=grid`);
    const region = page.getByRole("region", { name: "Image results grid", exact: true });
    await expect(region.locator('[data-cell-id="local-0"]')).toBeVisible();
    await page.evaluate(() => (window as CommandWindow).editorFixture.seedContinuation());
    const target = region.locator('[data-cell-id="local-4000650"]');
    await expect(target).toBeVisible();
    await target.locator('div[title^="Original local-4000650"]').click();
    await expect.poll(() => page.evaluate(() => (window as CommandWindow).__kupua_store__.getState().focusedImageId)).toBe("local-4000650");
    await page.evaluate(() => (window as CommandWindow).editorFixture.simulateContinuation());
    await expect.poll(() => page.evaluate(() => (window as CommandWindow).editorFixture.readbackSnapshot().receipts.at(-1)?.items[0].observation)).toBe("observed");
    const beforeTop = (await target.boundingBox())!.y - (await region.boundingBox())!.y;
    const destinationKey = await page.evaluate(async () => {
      const path = "/src/lib/orchestration/search.ts";
      const { pushNavigate } = await import(path);
      const key = history.state.kupuaKey as string;
      const app = window as CommandWindow & { __kupua_router__: { navigate: (options: unknown) => unknown } };
      pushNavigate(app.__kupua_router__.navigate, { to: "/search", search: { nonFree: "true" } });
      return key;
    });
    await expect.poll(() => page.evaluate(() => {
      const state = (window as CommandWindow).__kupua_store__.getState();
      return state.params.query === undefined && !state.loading && state.sortAroundFocusStatus === null;
    })).toBe(true);
    await page.keyboard.press("Home");
    await expect(region.locator('[data-cell-id="local-0"]')).toBeVisible();
    await page.evaluate(async key => {
      const path = "/src/lib/history-snapshot.ts";
      const { snapshotStore } = await import(path);
      const snapshot = snapshotStore.get(key);
      if (snapshot?.anchorImageId !== "local-4000650") throw new Error("Destination snapshot was not captured");
      snapshotStore.set(key, { ...snapshot, anchorOffset: Number.MAX_SAFE_INTEGER });
    }, destinationKey);
    const beforeBack = await counts(page);
    await page.goBack();
    await expect.poll(() => page.evaluate(() => (window as CommandWindow).__kupua_store__.getState()._searchContinuity?.phase)).toBe("placed");
    await expect(target).toBeVisible();
    expect(Math.abs((await target.boundingBox())!.y - (await region.boundingBox())!.y - beforeTop)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => {
      const state = (window as CommandWindow).__kupua_store__.getState();
      return { focus: state.focusedImageId, position: state.imagePositions.get("local-4000650"), query: state.params.query };
    })).toEqual({ focus: "local-4000650", position: 4_000_649, query: "-label:reviewed" });
    expect((await counts(page)).rankReads - beforeBack.rankReads).toBe(1);
    await page.goForward();
    await expect(region.locator('[data-cell-id="local-0"]')).toBeVisible();
    await page.evaluate(() => (window as CommandWindow).editorFixture.simulateContinuation(1, false, 4_000_650));
    await expect.poll(() => page.evaluate(() => (window as CommandWindow).editorFixture.readbackSnapshot().receipts.at(-1)?.items[0].observation)).toBe("observed");
    await page.goBack();
    await expect.poll(() => page.evaluate(() => {
      const state = (window as CommandWindow).__kupua_store__.getState();
      return state.params.query === "-label:reviewed" && !state.loading && state.sortAroundFocusStatus === null;
    })).toBe(true);
    await expect(region.locator('[data-cell-id="local-0"]')).toBeVisible();
    expect(await page.evaluate(() => (window as CommandWindow).__kupua_store__.getState().focusedImageId)).toBeNull();
    expect((await counts(page)).unexpected).toEqual([]);
  });

  for (const scenario of [{ density: "table", direction: "start" }, { density: "grid", direction: "end" }, { density: "justified", direction: "end" }] as const) {
    test(`presents the ${scenario.direction} boundary in ${scenario.density} without loading holes`, async ({ page }) => {
      await page.request.post(`${origin}/__readback-control`, { data: { action: "reset", total: 12_000 } });
      await page.goto(`${origin}/__continuation?density=${scenario.density}`);
      const region = page.getByRole("region", { name: `Image results ${scenario.density}`, exact: true });
      await expect(region.locator('[data-cell-id="local-0"]')).toBeVisible();
      await page.request.post(`${origin}/__readback-control`, { data: { action: "exclude-prefix", count: 332 } });
      await page.evaluate(direction => (window as CommandWindow).editorFixture.seedContinuation(
        direction === "start" ? 332 : 10_800, direction === "start" ? 332 : 11_132, 1000, direction === "start" ? 5 : 800), scenario.direction);
      const box = (await region.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, scenario.direction === "start" ? -500 : 1000);
      await expect.poll(() => page.evaluate(direction => {
        const state = (window as CommandWindow).__kupua_store__.getState();
        return direction === "start" ? Boolean(state._terminalStart) : Boolean(state._terminalEnd);
      }, scenario.direction)).toBe(true);
      await page.mouse.wheel(0, scenario.direction === "start" ? -100_000 : 100_000);
      await expect(region.getByRole("status")).toHaveText(scenario.direction === "start" ? "Start of results" : "End of results");
      expect(await region.locator("[data-loading-placeholder]").count()).toBe(0);
      expect(await page.evaluate(() => (window as CommandWindow).__kupua_store__.getState().total)).toBe(12_000);
      expect((await counts(page)).unexpected).toEqual([]);
    });
  }
});

test("A3 canonical readback survives a released stale API page across all densities", async ({ page }, testInfo) => {
  const env = { VITEST: "true", VITE_USE_MEDIA_API: "true", VITE_HOSTED: "false", VITE_MEDIA_API_BASE_URL: "/api",
    VITE_MEDIA_DELIVERY: "canonical", VITE_COLLECTIONS_URL: "/fixture-collections" };
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  const vite = await createServer({ configFile: resolve("vite.config.ts"), cacheDir: testInfo.outputPath("vite-cache"),
    plugins: [labelEditorPlugin("readback")], server: { host: "127.0.0.1", port: 0 } });
  const escaped: string[] = [];
  try {
    await vite.listen();
    const origin = vite.resolvedUrls!.local[0].replace(/\/$/, "");
    await page.route("**/*", route => {
      const url = new URL(route.request().url());
      if (url.origin === origin) return route.continue();
      escaped.push(url.pathname);
      return route.abort();
    });
    await page.goto(`${origin}/__readback`);
    const grid = page.getByRole("region", { name: "Image results grid", exact: true });
    await expect(grid.locator('[data-cell-id="local-0"]')).toBeVisible();
    await page.evaluate(() => (window as CommandWindow).editorFixture.select(["local-0", "local-offscreen"]));
    const snapshot = () => page.evaluate(() => (window as CommandWindow).editorFixture.readbackSnapshot());
    await expect.poll(async () => (await snapshot()).selected.map(image => image.labels)).toEqual([["original label"], ["original label"]]);
    await expect.poll(() => page.evaluate(() => (window as CommandWindow).__kupua_selection_store__.getState().isReconciling)).toBe(false);
    await page.getByRole("button", { name: "Hold old search", exact: true }).click();
    const counts = () => page.evaluate(async () => (await fetch("/__readback-control")).json()) as Promise<{
      searchReads: number; mgetReads: number; fakeDispatches: number; staleDelivered: number; held: number; unexpected: string[];
    }>;
    await expect.poll(async () => (await counts()).held).toBe(1);
    const beforeReads = (await counts()).mgetReads;
    const publication = await page.evaluate(async () => {
      const app = window as CommandWindow;
      const source = app.__kupua_store__;
      const selected = app.__kupua_selection_store__;
      const before = source.getState();
      const selection = selected.getState();
      const geometryPath = "/src/lib/scroll-geometry-ref.ts";
      const { getLayoutGeometry } = await import(geometryPath);
      const geometry = getLayoutGeometry();
      const region = document.querySelector<HTMLElement>('[aria-label="Image results grid"]')!;
      const bounds = region.getBoundingClientRect();
      const visible = [...region.querySelectorAll<HTMLElement>("[data-cell-id]")].filter(cell => {
        const box = cell.getBoundingClientRect();
        return box.top >= bounds.top && box.bottom <= bounds.bottom;
      }).map(cell => ({ id: cell.dataset.cellId!, box: cell.getBoundingClientRect() }));
      let copies = 0;
      let displacement = 0;
      const unsubscribe = source.subscribe((next, previous) => { if (next.results !== previous.results) copies++; });
      try {
        if (!app.editorFixture.simulateReadback()) throw new Error("Simulation refused");
        const deadline = performance.now() + 12_000;
        let observed = false;
        while (!observed && performance.now() < deadline) {
          await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
          for (const { id, box } of visible) {
            const cell = region.querySelector(`[data-cell-id="${id}"]`);
            if (!cell) throw new Error("Visible cell disappeared");
            const next = cell.getBoundingClientRect();
            displacement = Math.max(displacement, Math.abs(next.x - box.x), Math.abs(next.y - box.y), Math.abs(next.width - box.width), Math.abs(next.height - box.height));
          }
          observed = app.editorFixture.readbackSnapshot().receipts[0]?.items.every(item => item.observation === "observed") ?? false;
        }
        return { observed, copies, displacement, visible: visible.length, geometryRetained: getLayoutGeometry() === geometry,
          unchangedReferences: before.results.every((image, index) => image?.id === "local-0" || source.getState().results[index] === image),
          selectedRevision: selected.getState().metadataRevision - selection.metadataRevision,
          membershipRetained: selected.getState().selectedIds === selection.selectedIds && selected.getState().anchorId === selection.anchorId };
      } finally { unsubscribe(); }
    });
    expect(publication).toMatchObject({ observed: true, copies: 1, geometryRetained: true, unchangedReferences: true, selectedRevision: 1, membershipRetained: true });
    expect(publication.visible).toBeGreaterThan(1);
    expect(publication.displacement).toBeLessThanOrEqual(1);
    await page.getByRole("button", { name: "Release old search", exact: true }).click();
    await expect.poll(async () => (await counts()).staleDelivered).toBe(1);
    await expect.poll(() => page.evaluate(() => (window as CommandWindow).__kupua_store__.getState().loading)).toBe(false);
    expect((await snapshot()).selected.map(image => image.labels)).toEqual([["A3 observed label"], ["A3 observed label"]]);
    for (const density of ["grid", "table", "justified"] as const) {
      await (await getDensityChangeButton(page, density))?.click();
      const region = page.getByRole("region", { name: `Image results ${density}`, exact: true });
      await expect(region.locator('[data-cell-id="local-0"]')).toBeVisible();
      if (density === "justified") await expect(region.locator('[data-cell-id="local-0"] [title]').first()).toHaveAttribute("title", /Readback local-0/);
      else await expect(region.locator('[data-cell-id="local-0"]')).toContainText("Readback local-0");
      await expect(page.getByRole("button", { name: "Remove A3 observed label from all selected images", exact: true })).toBeDisabled();
    }
    const after = await counts();
    expect(after.fakeDispatches).toBe(2);
    expect(after.mgetReads - beforeReads).toBeGreaterThanOrEqual(1);
    expect(after.mgetReads - beforeReads).toBeLessThanOrEqual(3);
    expect(after.held).toBe(0);
    expect(after.unexpected).toEqual([]);
    expect(escaped).toEqual([]);
    expect(await page.evaluate(async () => (await fetch("/es/_search", { method: "POST", body: "{}" })).status)).toBe(403);
    expect((await counts()).unexpected).toEqual(["POST /es/_search"]);
  } finally {
    await page.evaluate(() => (window as Partial<CommandWindow>).editorFixture?.disposeReadback()).catch(() => {});
    await page.goto("about:blank");
    await page.unrouteAll({ behavior: "wait" });
    await vite.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

async function isolatePublicationFixture(page: Page, origin: string) {
  const escaped: string[] = [];
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin === origin && url.pathname === "/fixture-collections/collections" && route.request().method() === "GET") {
      return route.fulfill({ json: { data: { basename: "root", children: [] } } });
    }
    if (url.origin === origin && ["/api", "/api/", "/api/usage/quotas"].includes(url.pathname) && route.request().method() === "GET") {
      return route.fulfill({ json: { data: {}, links: [] } });
    }
    if (url.origin === origin && !/^\/(es|api|bedrock|grid-metadata|grid-auth)(\/|$)/.test(url.pathname)) return route.continue();
    escaped.push(url.pathname);
    return route.abort();
  });
  return escaped;
}

test("buffer publication uses the normal API app without fixture transforms", async ({ page }, testInfo) => {
  const env = { VITEST: "true", VITE_USE_MEDIA_API: "true", VITE_HOSTED: "false", VITE_MEDIA_API_BASE_URL: "/api",
    VITE_MEDIA_DELIVERY: "canonical", VITE_COLLECTIONS_URL: "/fixture-collections" };
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  const vite = await createServer({ configFile: resolve("vite.config.ts"), cacheDir: testInfo.outputPath("vite-cache"),
    server: { host: "127.0.0.1", port: 0 } });
  const escaped: string[] = [];
  let pageReads = 0;
  try {
    await vite.listen();
    const origin = vite.resolvedUrls!.local[0].replace(/\/$/, "");
    const media = await readFile(resolve("../e2e-tests/fixtures/images/test.jpg"));
    const images = Array.from({ length: 120 }, (_, index) => ({
      uri: `${origin}/api/images/local-${index}`, links: [{ rel: "optimised", href: `${origin}/__trial-media.jpg` }],
      data: { id: `local-${index}`, uploadTime: new Date(Date.UTC(2026, 0, 1) - index * 1000).toISOString(),
        metadata: { description: `Original local image ${index}`, credit: "Fixture" },
        cost: "free", valid: true, invalidReasons: {}, usageRights: { category: "staff-photographer" },
        userMetadata: { data: { labels: { data: [{ data: "original label" }] }, archived: { data: false },
          metadata: {}, usageRights: {}, photoshoot: {} } },
        source: { dimensions: { width: 700, height: 576 }, mimeType: "image/jpeg" },
        thumbnail: { secureUrl: `${origin}/__trial-media.jpg`, dimensions: { width: 700, height: 576 } },
        usages: { data: [] }, leases: { data: { leases: [] } }, collections: [] },
    }));
    await page.route("**/*", async route => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      if (url.origin === origin) {
        if (request.method() === "POST" && path === "/api/images/search-after") {
          pageReads++;
          return route.fulfill({ json: { data: images, total: images.length,
            sortValues: images.map(image => [Date.parse(image.data.uploadTime), image.data.id]) } });
        }
        if (request.method() === "POST" && path === "/api/images/count") {
          return route.fulfill({ json: { total: images.length } });
        }
        if (request.method() === "POST" && path === "/api/images/aggregations") {
          return route.fulfill({ json: { fields: {}, isFilterCounts: {} } });
        }
        if (request.method() === "GET") {
          if (path === "/__trial-media.jpg") return route.fulfill({ contentType: "image/jpeg", body: media });
          if (["/api", "/api/", "/api/usage/quotas"].includes(path)) return route.fulfill({ json: { data: {}, links: [] } });
          if (path === "/fixture-collections/collections") return route.fulfill({ json: { data: { basename: "root", children: [] } } });
          if (!/^\/(es|api|bedrock|grid-metadata|grid-auth)(\/|$)/.test(path)) return route.continue();
        }
      }
      escaped.push(`${request.method()} ${path}`);
      return route.abort();
    });
    await page.goto(`${origin}/search`);
    const region = page.getByRole("region", { name: "Image results grid", exact: true });
    await expect(region.locator("[data-cell-id]").first()).toBeVisible();
    expect(await page.evaluate(async () => {
      const path = "/src/dal/api-data-source.ts";
      const { ApiDataSource } = await import(path);
      return (window as CommandWindow).__kupua_store__.getState().dataSource instanceof ApiDataSource
        && !(window as Partial<CommandWindow>).editorFixture;
    })).toBe(true);
    await expect.poll(() => region.locator("img").first().evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth === 700)).toBe(true);
    await page.evaluate(async () => {
      const path = "/src/lib/image-publication.ts";
      const { publishImage } = await import(path);
      const image = (window as CommandWindow).__kupua_store__.getState().results[0]!;
      publishImage({ ...image, metadata: { ...image.metadata, description: "Published API image" } }, { resource: { links: [] } });
    });
    await expect(region.getByText("Published API image", { exact: true })).toBeVisible();
    await page.reload();
    await expect(region.locator("[data-cell-id]").first()).toBeVisible();
    await expect(region.getByText("Published API image", { exact: true })).toHaveCount(0);
    expect(pageReads).toBe(2);
    expect(escaped).toEqual([]);
  } finally {
    await page.goto("about:blank");
    await page.unrouteAll({ behavior: "wait" });
    await vite.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test.describe("buffer publication", () => {
  let vite: Awaited<ReturnType<typeof createServer>>;
  let origin: string;
  const env = { VITEST: "true", VITE_USE_MEDIA_API: "true", VITE_HOSTED: "false", VITE_MEDIA_API_BASE_URL: "/api",
    VITE_GRID_METADATA_ORIGIN: "https://metadata.example.test", VITE_MEDIA_DELIVERY: "canonical",
    VITE_COLLECTIONS_URL: "/fixture-collections" };
  let previous: Record<string, string | undefined>;

  test.beforeAll(async ({}, testInfo) => {
    previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
    Object.assign(process.env, env);
    vite = await createServer({ configFile: resolve("vite.config.ts"), cacheDir: testInfo.outputPath("vite-cache"), plugins: [labelEditorPlugin(true)],
      server: { host: "127.0.0.1", port: 0 } });
    await vite.listen();
    origin = vite.resolvedUrls!.local[0].replace(/\/$/, "");
  });
  test.afterAll(async () => {
    await vite?.close();
    for (const [key, value] of Object.entries(previous ?? {})) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });

  for (const density of ["grid", "table", "justified"] as const) {
      test(`in ${density}: stable boxes and current consumers`, async ({ page }) => {
        const escaped = await isolatePublicationFixture(page, origin);
        try {
          await page.goto(`${origin}/__publication?density=${density}`);
          const region = page.getByRole("region", { name: `Image results ${density}`, exact: true });
          await expect(region).toBeVisible();
          await expect(region.locator("[data-cell-id]").first()).toBeVisible();
          await region.evaluate(element => { element.scrollTop = 1800; });
          await expect.poll(() => region.evaluate(element => element.scrollTop)).toBeGreaterThan(1000);
          let imageId = "";
          await expect.poll(async () => {
            imageId = await region.evaluate(element => {
              const bounds = element.getBoundingClientRect();
              const topInset = element.getAttribute("aria-label") === "Image results table" ? 40 : 0;
              const cell = [...element.querySelectorAll<HTMLElement>("[data-cell-id]")].find(cell => {
                const box = cell.getBoundingClientRect();
                return box.top >= bounds.top + topInset && box.bottom < bounds.bottom - 8;
              });
              return cell?.dataset.cellId ?? "";
            });
            return imageId;
          }).not.toBe("");
          await page.evaluate(imageId => (window as CommandWindow).editorFixture.select([imageId]), imageId);
          const snapshot = () => page.evaluate(imageId => (window as CommandWindow).editorFixture.publicationSnapshot(imageId), imageId);
          await expect.poll(async () => (await snapshot()).selected).toBe(`Original ${imageId}`);
          await expect.poll(async () => (await snapshot()).reconciling).toBe(false);
          const cell = region.locator(`[data-cell-id="${imageId}"]`);
          await cell.scrollIntoViewIfNeeded();
          const observation = await page.evaluate(async ({ imageId, density }) => {
            const fixture = (window as CommandWindow).editorFixture;
            const path = "/src/lib/scroll-geometry-ref.ts";
            const { getLayoutGeometry } = await import(path);
            const region = document.querySelector<HTMLElement>(`[aria-label="Image results ${density}"]`)!;
            const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
            for (let count = 0; count < 8; count++) await frame();
            const regionBox = region.getBoundingClientRect();
            const visible = [...region.querySelectorAll<HTMLElement>("[data-cell-id]")].filter(cell => {
              const box = cell.getBoundingClientRect();
              return box.bottom > regionBox.top + 40 && box.top < regionBox.bottom;
            }).map(cell => cell.dataset.cellId!);
            const boxes = () => visible.map(id => {
              const cell = region.querySelector(`[data-cell-id="${CSS.escape(id)}"]`);
              if (!cell) throw new Error("A visible cell disappeared");
              const { x, y, width, height } = cell.getBoundingClientRect();
              return { id, x, y, width, height };
            });
            const before = boxes();
            const geometry = getLayoutGeometry();
            fixture.publish(imageId);
            const frames = [];
            for (let count = 0; count < 12; count++) { await frame(); frames.push(boxes()); }
            const deadline = performance.now() + 3000;
            while (fixture.publicationSnapshot(imageId).reconciling && performance.now() < deadline) {
              await frame();
              frames.push(boxes());
            }
            if (fixture.publicationSnapshot(imageId).reconciling) throw new Error("Publication reconciliation did not finish");
            return { before, frames, retainedGeometry: getLayoutGeometry() === geometry };
          }, { imageId, density });
          expect(observation.before.length).toBeGreaterThan(1);
          for (const frame of observation.frames) expect(frame).toEqual(observation.before);
          expect(observation.retainedGeometry).toBe(true);
          if (density === "justified") await expect(cell.locator("[title]").first()).toHaveAttribute("title", /A2 published description/);
          else await expect(cell).toContainText("A2 published description");
          await expect.poll(async () => (await snapshot()).selected).toBe("A2 published description");
          expect((await snapshot()).selectedIds).toEqual([imageId]);
          expect((await snapshot()).links).toBe(0);
          await expect(page.getByRole("button", { name: "Remove A2 published label", exact: true })).toBeDisabled();
          await cell.dblclick();
          await expect(page.getByText("Back to search", { exact: true })).toBeVisible();
          await expect(page.getByText("A2 published description", { exact: true }).filter({ visible: true }).first()).toBeVisible();
          await page.getByText("Back to search", { exact: true }).click();
          await page.evaluate(imageId => (window as CommandWindow).editorFixture.revealPublicationTarget(imageId), imageId);
          await page.keyboard.press("f");
          await page.waitForFunction(() => document.fullscreenElement !== null);
          await expect(page.locator('[data-fullscreen-preview="active"] img')).toHaveAttribute("alt", "A2 published description");
          await page.evaluate(() => document.exitFullscreen());
          await expect(page.locator('[data-fullscreen-preview="active"]')).toHaveCount(0);
          const destination = density === "grid" ? "table" : "grid";
          const densityButton = await getDensityChangeButton(page, destination);
          await densityButton?.click();
          const nextRegion = page.getByRole("region", { name: `Image results ${destination}`, exact: true });
          await expect(nextRegion.locator(`[data-cell-id="${imageId}"]`)).toContainText("A2 published description");
          await page.evaluate(imageId => (window as CommandWindow).editorFixture.select([imageId]), imageId);
          await page.evaluate(imageId => (window as CommandWindow).editorFixture.acceptNewerPage(imageId), imageId);
          await expect.poll(async () => (await snapshot()).resident).toBe("A2 newer page description");
          await expect.poll(async () => (await snapshot()).selected).toBe("A2 newer page description");
          await expect.poll(async () => (await snapshot()).reconciling).toBe(false);
          expect((await snapshot()).links).toBe(1);
          await expect(page.getByRole("button", { name: "Remove A2 newer page label", exact: true })).toBeEnabled();
          expect((await snapshot()).selectedIds).toEqual([imageId]);
          const newerCell = nextRegion.locator(`[data-cell-id="${imageId}"]`);
          await page.evaluate(imageId => (window as CommandWindow).editorFixture.revealPublicationTarget(imageId), imageId);
          await expect(newerCell).toContainText("A2 newer page description");
          await newerCell.dblclick();
          await expect(page.getByText("Back to search", { exact: true })).toBeVisible();
          await expect(page.getByText("A2 newer page description", { exact: true }).filter({ visible: true }).first()).toBeVisible();
          await page.getByText("Back to search", { exact: true }).click();
          await page.evaluate(imageId => (window as CommandWindow).editorFixture.select([imageId, "img-0"]), imageId);
          await expect.poll(async () => (await snapshot()).reconciling).toBe(false);
          await expect(page.getByRole("button", { name: "Remove A2 newer page label from all selected images", exact: true })).toBeEnabled();
          expect(escaped).toEqual([]);
        } finally {
          await page.evaluate(async () => { if (document.fullscreenElement) await document.exitFullscreen(); }).catch(() => {});
          await page.unrouteAll({ behavior: "wait" });
        }
      });
  }

  for (const density of ["grid", "table", "justified"] as const) {
    test(`preserves ${density} browsing during publication`, async ({ page }) => {
      const escaped = await isolatePublicationFixture(page, origin);
      let probe: JSHandle<{ published: () => boolean; stop: () => unknown }> | undefined;
      try {
        await page.goto(`${origin}/__publication?density=${density}`);
        const region = page.getByRole("region", { name: `Image results ${density}`, exact: true });
        await expect(region.locator("[data-cell-id]").first()).toBeVisible();
        await region.evaluate(element => { element.scrollTop = 1600; });
        await expect.poll(() => region.evaluate(element => {
          const bounds = element.getBoundingClientRect();
          const images = [...element.querySelectorAll("img")].filter(image => {
            const box = image.getBoundingClientRect();
            return box.bottom > bounds.top && box.top < bounds.bottom;
          });
          return images.length > 0 && images.every(image => image.complete && image.naturalWidth >= 700);
        })).toBe(true);
        const bounds = (await region.boundingBox())!;
        await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        const initialScroll = await region.evaluate(element => element.scrollTop);
        await page.mouse.wheel(0, 200);
        await expect.poll(() => region.evaluate(element => element.scrollTop)).toBeGreaterThan(initialScroll);
        probe = await page.evaluateHandle(density => {
          const region = document.querySelector<HTMLElement>(`[aria-label="Image results ${density}"]`)!;
          const store = (window as CommandWindow).__kupua_store__;
          const startScroll = region.scrollTop;
          let frames = 0;
          let comparisons = 0;
          let jumps = 0;
          let wheelEvents = 0;
          let publicationRequested = false;
          let publicationObserved = false;
          let publicationDuringScroll = false;
          let movementAfterPublication = false;
          let scrollWrites = 0;
          let reverseMovement = 0;
          let lastMovement = -Infinity;
          let lastScroll = startScroll;
          const ownTop = Object.getOwnPropertyDescriptor(region, "scrollTop");
          const ownScrollTo = Object.getOwnPropertyDescriptor(region, "scrollTo");
          const nativeTop = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop")!;
          const nativeScrollTo = region.scrollTo;
          Object.defineProperty(region, "scrollTop", { configurable: true,
            get: () => nativeTop.get!.call(region) as number,
            set: (value: number) => { scrollWrites++; nativeTop.set!.call(region, value); } });
          region.scrollTo = (...args: unknown[]) => { scrollWrites++; Reflect.apply(nativeScrollTo, region, args); };
          region.scrollTop = startScroll;
          region.scrollTo({ top: startScroll });
          if (scrollWrites !== 2) throw new Error("Scroll-write detector missed its controls");
          scrollWrites = 0;
          let frameId = 0;
          let previous = new Map<string, { x: number; y: number; width: number; height: number }>();
          const wheel = () => { wheelEvents++; };
          region.addEventListener("wheel", wheel, { passive: true });
          const unsubscribe = store.subscribe((state, prior) => {
            if (!publicationObserved && state.results !== prior.results
              && state.results.some(image => image?.id === targetId && image.metadata.description === "A2 published description")) {
              publicationObserved = true;
              publicationDuringScroll = wheelEvents > 2 && region.scrollTop > startScroll && performance.now() - lastMovement < 200;
            }
          });
          const sample = () => {
            frames++;
            const scroll = region.scrollTop;
            const movedForward = scroll > lastScroll;
            if (movedForward) {
              lastMovement = performance.now();
              if (publicationObserved) movementAfterPublication = true;
            }
            if (scroll < lastScroll - 1) reverseMovement++;
            lastScroll = scroll;
            const bounds = region.getBoundingClientRect();
            const current = new Map<string, { x: number; y: number; width: number; height: number }>();
            for (const cell of region.querySelectorAll<HTMLElement>("[data-cell-id]")) {
              const box = cell.getBoundingClientRect();
              if (box.bottom <= bounds.top || box.top >= bounds.bottom) continue;
              const next = { x: box.x + region.scrollLeft, y: box.y + region.scrollTop, width: box.width, height: box.height };
              const before = previous.get(cell.dataset.cellId!);
              if (before) {
                comparisons++;
                if (Math.abs(next.x - before.x) > 1 || Math.abs(next.y - before.y) > 1
                  || Math.abs(next.width - before.width) > 1 || Math.abs(next.height - before.height) > 1) jumps++;
              }
              current.set(cell.dataset.cellId!, next);
            }
            previous = current;
            if (!publicationRequested && wheelEvents > 2 && movedForward) {
              publicationRequested = true;
              (window as CommandWindow).editorFixture.publish(targetId);
            }
            frameId = requestAnimationFrame(sample);
          };
          frameId = requestAnimationFrame(sample);
          const bounds = region.getBoundingClientRect();
          const target = [...region.querySelectorAll<HTMLElement>("[data-cell-id]")].find(cell => {
            const box = cell.getBoundingClientRect();
            return box.top >= bounds.top && box.bottom <= bounds.bottom;
          });
          if (!target) throw new Error("Visible publication target unavailable");
          const targetId = target.dataset.cellId!;
          return { published: () => publicationObserved, stop() {
            cancelAnimationFrame(frameId);
            unsubscribe();
            region.removeEventListener("wheel", wheel);
            if (ownTop) Object.defineProperty(region, "scrollTop", ownTop);
            else delete (region as Partial<HTMLElement>).scrollTop;
            if (ownScrollTo) Object.defineProperty(region, "scrollTo", ownScrollTo);
            else delete (region as Partial<HTMLElement>).scrollTo;
            return { frames, comparisons, jumps, wheelEvents, publicationDuringScroll, movementAfterPublication, scrollWrites, reverseMovement };
          } };
        }, density);
        await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        for (let step = 0; step < 8; step++) {
          await page.mouse.wheel(0, 40);
          // Observe publication during real movement before driving the remaining scroll.
          if (step === 2) await expect.poll(() => probe!.evaluate(probe => probe.published())).toBe(true);
          await page.waitForTimeout(80);
        }
        const result = await probe.evaluate(probe => probe.stop()) as { frames: number; comparisons: number; jumps: number;
          publicationDuringScroll: boolean; movementAfterPublication: boolean; scrollWrites: number; reverseMovement: number };
        await probe.dispose();
        probe = undefined;
        expect(result.frames).toBeGreaterThan(12);
        expect(result.comparisons).toBeGreaterThan(12);
        expect(result.jumps).toBe(0);
        expect(result.publicationDuringScroll, JSON.stringify(result)).toBe(true);
        expect(result.movementAfterPublication, JSON.stringify(result)).toBe(true);
        expect(result.scrollWrites).toBe(0);
        expect(result.reverseMovement).toBe(0);
        expect(escaped).toEqual([]);
      } finally {
        await probe?.evaluate(probe => probe.stop()).catch(() => {});
        await probe?.dispose();
        await page.unrouteAll({ behavior: "wait" });
      }
    });
  }

  test("buffer publication preserves mounted Justified early demand", async ({ page }) => {
    for (const retainGeometry of [true, false]) {
      const escaped = await isolatePublicationFixture(page, origin);
      let probe: JSHandle<{ delta: number; snapshot: () => { reads: number[]; published: boolean; publicationHeadroom: number };
        stop: () => Promise<void> }> | undefined;
      try {
        await page.goto(`${origin}/__publication?density=justified`);
        const region = page.getByRole("region", { name: "Image results justified", exact: true });
        await expect(region.locator('[data-cell-id="img-0"]')).toBeVisible();
        await page.waitForFunction(() => !(window as CommandWindow).__kupua_store__.getState().loading);
        await region.hover();
        for (let step = 0; step < 3; step++) {
          const before = await region.evaluate(element => element.scrollTop);
          await page.mouse.wheel(0, 100);
          await expect.poll(() => region.evaluate(element => element.scrollTop)).toBeGreaterThan(before);
        }
        probe = await page.evaluateHandle(async retainGeometry => {
          const path = "/src/lib/scroll-geometry-ref.ts";
          const { getLayoutGeometry, getItemLayoutRow } = await import(path);
          const store = (window as CommandWindow).__kupua_store__;
          const state = store.getState();
          if (state.results.length !== 200 || state._extendForwardInFlight) throw new Error("Early-demand setup already extended");
          const container = document.querySelector<HTMLElement>('[aria-label="Image results justified"]')!;
          const source = state.dataSource;
          const original = source.searchAfter;
          const ownSearch = Object.getOwnPropertyDescriptor(source, "searchAfter");
          const reads: number[] = [];
          const pending: Promise<unknown>[] = [];
          let release!: () => void;
          const held = new Promise<void>(resolve => { release = resolve; });
          const headroom = () => {
            const geometry = getLayoutGeometry();
            const row = "layout" in geometry && geometry.window?.rowAtOffset(container.scrollTop + container.clientHeight - 0.01);
            if (!row) throw new Error("Mounted Justified viewport unavailable");
            return store.getState().bufferOffset + store.getState().results.length - row.lastItemIndex - 1;
          };
          source.searchAfter = (...args) => {
            reads.push(headroom());
            const work = held.then(() => original.apply(source, args));
            pending.push(work);
            return work;
          };
          let published = false;
          let publicationHeadroom = 0;
          const publish = () => {
            publicationHeadroom = headroom();
            (window as CommandWindow).editorFixture.publish("img-0");
            if (!retainGeometry) store.setState({ results: [...store.getState().results] });
            published = true;
          };
          container.addEventListener("scroll", publish, { capture: true, once: true });
          const destination = getItemLayoutRow(getLayoutGeometry(), 120).top - container.clientHeight;
          return { delta: destination - container.scrollTop, snapshot: () => ({ reads, published, publicationHeadroom }),
            async stop() {
              container.removeEventListener("scroll", publish, true);
              if (ownSearch) Object.defineProperty(source, "searchAfter", ownSearch);
              else delete (source as Partial<typeof source>).searchAfter;
              release();
              await Promise.all(pending);
            } };
        }, retainGeometry);
        const delta = await probe.evaluate(probe => probe.delta);
        expect(delta).toBeGreaterThan(0);
        await page.mouse.wheel(0, delta);
        await expect.poll(() => probe!.evaluate(probe => probe.snapshot().published)).toBe(true);
        const result = await probe.evaluate(async probe => {
          for (let frame = 0; frame < 8; frame++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
          return probe.snapshot();
        });
        expect(result.publicationHeadroom).toBeGreaterThan(50);
        if (retainGeometry) {
          expect(result.reads).toHaveLength(1);
          expect(result.reads[0]).toBeGreaterThan(50);
        } else expect(result.reads).toEqual([]);
        expect(escaped).toEqual([]);
      } finally {
        await probe?.evaluate(probe => probe.stop());
        await probe?.dispose();
        await page.unrouteAll({ behavior: "wait" });
      }
    }
  });

  test("buffer publication still rebuilds genuine Justified geometry", async ({ page }) => {
    const escaped = await isolatePublicationFixture(page, origin);
    try {
      await page.goto(`${origin}/__publication?density=justified`);
      const region = page.getByRole("region", { name: "Image results justified", exact: true });
      await expect(region.locator('[data-cell-id="img-0"]')).toBeVisible();
      const result = await page.evaluate(async () => {
        const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        for (let count = 0; count < 8; count++) await frame();
        const fixture = (window as CommandWindow).editorFixture;
        const path = "/src/lib/scroll-geometry-ref.ts";
        const { getLayoutGeometry } = await import(path);
        const cell = document.querySelector('[data-cell-id="img-0"]')!;
        const before = cell.getBoundingClientRect().width;
        const geometry = getLayoutGeometry();
        fixture.publishGeometryChange("img-0");
        for (let count = 0; count < 12; count++) await frame();
        return { before, after: cell.getBoundingClientRect().width, changedGeometry: getLayoutGeometry() !== geometry };
      });
      expect(result.after).not.toBe(result.before);
      expect(result.changedGeometry).toBe(true);
      expect(escaped).toEqual([]);
    } finally {
      await page.unrouteAll({ behavior: "wait" });
    }
  });
});

function labelCommand(origin: string) {
  return { operation: "add-labels", imageId: "fixture", labels: ["fixture label"],
    resource: { links: [{ rel: "edits", href: `${origin}/metadata/fixture` }] } };
}

async function exerciseLabelEditor(page: Page) {
  const aggregationBodies: Record<string, unknown>[] = [];
  const suggestionsRoute = "**/images/aggregations";
  const suggestionsHandler: Parameters<Page["route"]>[1] = async route => {
    if (route.request().method() === "POST") aggregationBodies.push(route.request().postDataJSON());
    await route.fulfill({ json: { fields: { "userMetadata.labels": { buckets: [
      { key: "News", count: 9 }, { key: "News agency", count: 4 }, { key: "Football", count: 2 },
    ] } }, isFilterCounts: {} }, headers: {
      "Access-Control-Allow-Origin": new URL(page.url()).origin,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
    } });
  };
  await page.route(suggestionsRoute, suggestionsHandler);
  try {
  await page.evaluate(() => (window as CommandWindow).editorFixture.mount());
  const input = page.getByRole("combobox", { name: "Add label", exact: true });
  const plus = page.getByRole("button", { name: "Add label", exact: true, includeHidden: true });
  await expect(input).toHaveCount(0);
  const plusBounds = await plus.evaluate(element => element.getBoundingClientRect().toJSON());
  await plus.click();
  await expect(input).toHaveAttribute("placeholder", "label1, label2, label3\u2026");
  await expect(plus).toBeHidden();
  expect(await plus.evaluate(element => element.getBoundingClientRect().toJSON())).toEqual(plusBounds);
  await expect(page.getByText("Target images", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/selected:.*eligible/)).toHaveCount(0);
  const pill = page.getByRole("button", { name: "news", exact: true });
  const applyToAll = page.getByRole("button", { name: "Apply news to all selected images", exact: true });
  const removeLabel = page.getByRole("button", { name: "Remove news from all selected images", exact: true });
  const geometry = await pill.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const group = element.closest("[data-editable-pill]") ?? element.parentElement!.parentElement!;
    const buttons = [...group.querySelectorAll("button")].map(button => button.getBoundingClientRect());
    return { height: bounds.height, lineHeight: parseFloat(getComputedStyle(element).lineHeight),
      gaps: buttons.slice(1).map((button, index) => button.left - buttons[index].right) };
  });
  expect(geometry.height).toBeCloseTo(geometry.lineHeight, 0);
  expect(geometry.gaps).toEqual([0, 0]);
  await expect(applyToAll).toHaveAttribute("title", "Apply label to all");
  await expect(removeLabel).toHaveAttribute("title", "Remove label");
  await expect(pill.locator("xpath=../..")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(pill).toHaveCSS("color", "rgb(0, 173, 238)");
  await expect(applyToAll).toHaveCSS("color", "rgb(0, 173, 238)");
  await expect(removeLabel).toHaveCSS("color", "rgb(0, 173, 238)");
  await expect(applyToAll).toHaveCSS("cursor", "pointer");
  await expect(removeLabel).toHaveCSS("cursor", "pointer");
  await applyToAll.hover();
  await expect(applyToAll).toHaveCSS("background-color", "rgb(179, 229, 252)");
  await expect(applyToAll.locator("svg")).toHaveCSS("color", "rgb(0, 86, 137)");
  await expect(pill).toHaveCSS("color", "rgb(0, 173, 238)");
  await removeLabel.hover();
  await expect(removeLabel.locator("svg")).toHaveCSS("color", "rgb(0, 86, 137)");
  await page.mouse.move(0, 0);
  await page.getByRole("region", { name: "Label editor fixture" }).screenshot({ path: test.info().outputPath("pill-partial.png") });
  await page.evaluate(() => (window as CommandWindow).editorFixture.targets(["fixture"]));
  await expect(applyToAll).toHaveCount(0);
  const removeFullLabel = page.getByRole("button", { name: "Remove news", exact: true });
  await expect(removeFullLabel).toHaveAttribute("title", "Remove label");
  await expect(pill.locator("xpath=../..")).toHaveCSS("background-color", "rgb(0, 173, 238)");
  expect((await pill.boundingBox())?.height).toBeCloseTo(geometry.height, 0);
  await expect(pill).toHaveCSS("color", "rgb(255, 255, 255)");
  await pill.hover();
  await expect(pill).toHaveCSS("background-color", "rgb(179, 229, 252)");
  await expect(pill).toHaveCSS("color", "rgb(0, 86, 137)");
  await expect(removeFullLabel).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(pill.locator("xpath=../..")).toHaveCSS("background-color", "rgb(0, 173, 238)");
  await removeFullLabel.hover();
  await expect(removeFullLabel).toHaveCSS("background-color", "rgb(179, 229, 252)");
  await expect(removeFullLabel.locator("svg")).toHaveCSS("color", "rgb(0, 86, 137)");
  await expect(pill).toHaveCSS("color", "rgb(255, 255, 255)");
  await page.mouse.move(0, 0);
  await page.getByRole("region", { name: "Label editor fixture" }).screenshot({ path: test.info().outputPath("pill-full.png") });
  await page.evaluate(() => (window as CommandWindow).editorFixture.targets(["fixture", "other"]));
  await input.fill("no matching popular label");
  await expect(input).toHaveAttribute("aria-busy", "false");
  const fixture = page.getByRole("region", { name: "Label editor fixture" });
  const closedSuggestionsHeight = (await fixture.boundingBox())!.height;
  await input.fill("first, nE, last");
  for (let offset = 0; offset < 6; offset++) await input.press("ArrowLeft");
  const options = page.getByRole("option");
  await expect(options.locator("span:first-child")).toHaveText(["News", "News agency"]);
  expect((await fixture.boundingBox())!.height).toBe(closedSuggestionsHeight);
  await options.first().click();
  await expect(input).toHaveValue("first, News, last");
  await expect(page.getByText("Not sent - dry run", { exact: true })).toHaveCount(0);
  await input.fill("first, News, last, fO");
  await expect(options.locator("span:first-child")).toHaveText(["Football"]);
  await input.press("ArrowDown");
  await input.press("Enter");
  await expect(input).toHaveValue("first, News, last, Football");
  expect(aggregationBodies.length).toBeGreaterThan(0);
  for (const body of aggregationBodies) expect(body).toEqual({ q: "", fields: [{ field: "userMetadata.labels", size: 50 }] });
  await input.press("Escape");
  await expect(input).toHaveCount(0);
  await expect(plus).toBeFocused();
  await plus.click();
  await expect(input).toHaveValue("");
  await input.fill("retained label");
  await page.evaluate(() => (window as CommandWindow).editorFixture.show(false));
  await expect(input).toHaveCount(0);
  await page.evaluate(() => (window as CommandWindow).editorFixture.show());
  await plus.click();
  await expect(input).toHaveValue("retained label");
  await input.press("Enter");
  await expect(page.getByText("Not sent - dry run", { exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Remove news from all selected images", exact: true }).click();
  await expect(page.getByText("Not sent - dry run", { exact: true })).toHaveCount(2);
  expect((await page.evaluate(() => (window as CommandWindow).editorFixture.snapshot())).receipts.map(receipt => receipt.intent.action)).toEqual(["add", "remove"]);
  await page.evaluate(() => (window as CommandWindow).editorFixture.mount(true));
  const apply = page.getByRole("button", { name: "Apply news to all selected images", exact: true });
  await apply.dblclick();
  const snapshot = () => page.evaluate(() => (window as CommandWindow).editorFixture.snapshot());
  await expect.poll(async () => (await snapshot()).calls).toBe(2);
  expect((await snapshot()).receipts[0].items.map(item => item.state)).toEqual(["submitted", "unknown"]);
  await page.evaluate(() => {
    (window as CommandWindow).editorFixture.targets(["new-selection"], true);
    (window as CommandWindow).editorFixture.release({ outcome: "acknowledged" });
  });
  await expect.poll(async () => (await snapshot()).receipts[0].items[0].state).toBe("accepted-awaiting-visibility");
  expect((await snapshot()).receipts[0].intent.targetIds).toEqual(["fixture", "other"]);
  await expect(page.getByRole("button", { name: "Remove news", exact: true })).toBeDisabled();
  } finally {
    await page.unroute(suggestionsRoute, suggestionsHandler);
  }
}

async function exerciseObservedEditor(page: Page) {
  const reads: string[][] = [];
  let observing = false;
  const routePattern = "**/images/mget";
  await page.route(routePattern, async route => {
    const ids = route.request().postDataJSON().ids as string[];
    if (observing) reads.push(ids);
    if (reads.length > 1) {
      await route.fulfill({ status: 503, json: { error: "synthetic-required-read-failure" } });
      return;
    }
    await route.fulfill({ json: { data: ids.map(id => ({
      uri: `https://api.example.test/images/${id}`, links: [], actions: [],
      data: { id, uploadTime: "2026-01-01T00:00:00Z", lastModified: "2026-11-07T00:00:00Z",
        metadata: { description: `Observed ${id}` }, cost: "free", valid: true, invalidReasons: {},
        usageRights: { category: "staff-photographer" }, source: { dimensions: { width: 800, height: 600 } },
        userMetadata: { data: { lastModified: observing ? "2026-11-07T00:00:00Z" : "2026-11-01T00:00:00Z", labels: { data: [{ data: observing && id === "fixture" ? "Unit D label" : "news" }] },
          metadata: {}, usageRights: {}, archived: { data: false }, photoshoot: {} } },
        usages: { data: [] }, leases: { data: { leases: [] } }, collections: [] },
    })) } });
  });
  try {
    await page.evaluate(() => (window as CommandWindow).editorFixture.select(["fixture", "other"]));
    await expect.poll(() => page.evaluate(() => (window as CommandWindow).editorFixture.readbackSnapshot().selected.map(image => image.labels))).toEqual([["news"], ["news"]]);
    observing = true;
    await page.evaluate(() => (window as CommandWindow).editorFixture.mount(true, true));
    const fixture = page.getByRole("region", { name: "Label editor fixture", exact: true });
    await fixture.getByRole("button", { name: "Add label", exact: true }).click();
    const input = fixture.getByRole("combobox", { name: "Add label", exact: true });
    await input.fill("Unit D label");
    await input.press("Enter");
    const snapshot = () => page.evaluate(() => (window as CommandWindow).editorFixture.snapshot());
    await expect.poll(async () => (await snapshot()).calls).toBe(2);
    await page.evaluate(() => (window as CommandWindow).editorFixture.targets(["new-selection"], true));
    await expect.poll(async () => (await snapshot()).receipts[0]?.items.map(item => item.observation)).toEqual(["observed", "unavailable"]);
    const receipt = (await snapshot()).receipts[0];
    expect(receipt.intent.targetIds).toEqual(["fixture", "other"]);
    expect(receipt.items.map(item => ({ id: item.imageId, state: item.state }))).toEqual([
      { id: "fixture", state: "accepted-awaiting-visibility" }, { id: "other", state: "unknown" },
    ]);
    expect(reads).toEqual([["fixture", "other"], ["other"]]);
    expect((await snapshot()).calls).toBe(2);
    expect((await snapshot()).commands.map(command => ({ operation: command.operation, id: command.imageId, labels: command.operation === "add-labels" ? command.labels : undefined }))).toEqual([
      { operation: "add-labels", id: "fixture", labels: ["Unit D label"] },
      { operation: "add-labels", id: "other", labels: ["Unit D label"] },
    ]);
    expect(await page.evaluate(() => (window as CommandWindow).editorFixture.readbackSnapshot().selected)).toEqual([
      { id: "fixture", labels: ["Unit D label"] }, { id: "other", labels: ["news"] },
    ]);
    await expect(fixture).toBeVisible();
  } finally {
    await page.evaluate(() => (window as CommandWindow).editorFixture.release({ outcome: "unknown" }));
    await page.unroute(routePattern);
  }
}

async function exerciseObservedRemoval(page: Page, outcome: "acknowledged" | "unknown") {
  const reads: string[][] = [];
  let observing = false;
  const routePattern = "**/images/mget";
  await page.route(routePattern, async route => {
    const ids = route.request().postDataJSON().ids as string[];
    if (observing) reads.push(ids);
    await route.fulfill({ json: { data: ids.map(id => ({
      uri: `https://api.example.test/images/${id}`, links: [], actions: [],
      data: { id, uploadTime: "2026-01-01T00:00:00Z", lastModified: "2026-11-07T00:00:00Z",
        metadata: { description: `Removal ${id}` }, cost: "free", valid: true, invalidReasons: {},
        usageRights: { category: "staff-photographer" }, source: { dimensions: { width: 800, height: 600 } },
        userMetadata: { data: { lastModified: observing ? "2026-11-07T00:00:00Z" : "2026-11-01T00:00:00Z",
          labels: { data: (reads.length >= 2 ? ["news suffix"] : ["news"]).map(data => ({ data })) },
          metadata: {}, usageRights: {}, archived: { data: false }, photoshoot: {} } },
        usages: { data: [] }, leases: { data: { leases: [] } }, collections: [] },
    })) } });
  });
  try {
    await page.evaluate(() => (window as CommandWindow).editorFixture.select(["fixture"]));
    await expect.poll(() => page.evaluate(() => (window as CommandWindow).editorFixture.readbackSnapshot().selected.map(image => image.labels))).toEqual([["news"]]);
    await page.evaluate(() => {
      const fixture = (window as CommandWindow).editorFixture;
      fixture.mount(true, true, true);
      fixture.targets(["fixture"]);
    });
    observing = true;
    const fixture = page.getByRole("region", { name: "Label editor fixture", exact: true });
    await fixture.getByRole("button", { name: "Remove news", exact: true }).dblclick();
    const snapshot = () => page.evaluate(() => (window as CommandWindow).editorFixture.snapshot());
    expect((await snapshot()).calls).toBe(1);
    expect((await snapshot()).receipts[0].items[0].state).toBe("submitted");
    expect(reads).toEqual([]);
    await page.evaluate(outcome => {
      const fixture = (window as CommandWindow).editorFixture;
      fixture.targets(["new-selection"], true);
      fixture.release({ outcome });
    }, outcome);
    await expect.poll(async () => (await snapshot()).receipts[0].items[0].observation).toBe("observed");
    expect((await snapshot()).commands).toEqual([{ operation: "remove-label", imageId: "fixture", label: "news",
      resource: { links: [{ rel: "edits", href: "https://metadata.example.test/metadata/fixture" }] } }]);
    expect((await snapshot()).receipts[0]).toMatchObject({ intent: { action: "remove", label: "news", targetIds: ["fixture"] },
      items: [{ imageId: "fixture", state: outcome === "unknown" ? "unknown" : "accepted-awaiting-visibility", observation: "observed" }] });
    expect(reads).toEqual([["fixture"], ["fixture"]]);
    expect(await page.evaluate(() => (window as CommandWindow).editorFixture.readbackSnapshot().selected)).toEqual([{ id: "fixture", labels: ["news suffix"] }]);
    expect((await snapshot()).calls).toBe(1);
  } finally {
    await page.evaluate(() => (window as CommandWindow).editorFixture.release({ outcome: "unknown" }));
    await page.unroute(routePattern);
  }
}

async function exerciseConnectedEditor(page: Page, beforeDispatch: () => void) {
  await page.evaluate(() => (window as CommandWindow).editorFixture.select(["fixture"]));
  await expect.poll(() => page.evaluate(() => (window as CommandWindow).__kupua_selection_store__.getState().metadataCache.has("fixture"))).toBe(true);
  const original = await page.evaluate(() => (window as CommandWindow).editorFixture.readbackSnapshot().selected[0].labels);
  await expect.poll(() => page.evaluate(() => (window as CommandWindow).editorFixture.readbackSnapshot().loading)).toBe(false);
  await page.evaluate(() => {
    const fixture = (window as CommandWindow).editorFixture;
    fixture.focus("fixture");
    fixture.select(["fixture"]);
  });
  const cell = page.getByRole("region", { name: "Image results grid", exact: true }).locator('[data-cell-id="fixture"]');
  await expect(cell).toBeVisible();
  const originalBox = await cell.boundingBox();
  await page.getByRole("button", { name: "Add label", exact: true }).click();
  const input = page.getByRole("combobox", { name: "Add label", exact: true });
  await input.fill("connected fixture label");
  beforeDispatch();
  await input.press("Enter");
  const activity = page.getByRole("complementary", { name: "Label activity", exact: true });
  await expect(activity.getByText("Label change", { exact: true })).toHaveCount(1);
  await expect(activity.locator("pre")).toContainText('"observation": "observed"');
  await expect.poll(() => page.evaluate(() => (window as CommandWindow).editorFixture.readbackSnapshot().selected[0].labels)).toEqual([...original!, "connected fixture label"]);
  const remove = page.getByRole("button", { name: "Remove connected fixture label", exact: true });
  await expect(remove).toBeEnabled();
  await remove.click();
  await expect(activity.getByText("Label change", { exact: true })).toHaveCount(2);
  await expect(activity.locator("pre").first()).toContainText('"observation": "observed"');
  await expect.poll(() => page.evaluate(() => (window as CommandWindow).editorFixture.readbackSnapshot().selected[0].labels)).toEqual(original);
  await expect(remove).toHaveCount(0);
  expect(await cell.boundingBox()).toEqual(originalBox);
}

async function exerciseBulkEditor(page: Page) {
  const ids = ["fixture", "other"];
  await page.evaluate(ids => (window as CommandWindow).editorFixture.select(ids), ids);
  await expect(page.getByRole("button", { name: "Add label", exact: true })).toBeEnabled();
  const cell = page.getByRole("region", { name: "Image results grid", exact: true }).locator('[data-cell-id="fixture"]');
  const box = await cell.boundingBox();
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let observedRequest = false;
  const holdReadback = async (route: import("@playwright/test").Route) => {
    if (!observedRequest && route.request().postDataJSON().ids.includes("fixture")) {
      observedRequest = true;
      await held;
    }
    await route.fallback();
  };
  await page.route(/\/images\/mget$/, holdReadback);
  const activity = page.getByRole("complementary", { name: "Label activity", exact: true });
  const add = async (label: string) => {
    await page.getByRole("button", { name: "Add label", exact: true }).click();
    const input = page.getByRole("combobox", { name: "Add label", exact: true });
    await input.fill(label);
    await input.press("Enter");
  };
  const receipt = (label: string, action = "add") => activity.locator("pre")
    .filter({ hasText: `"label": "${label}"` }).filter({ hasText: `"action": "${action}"` }).first();
  try {
    await add("batch fixture label");
    await expect.poll(() => observedRequest).toBe(true);
    await page.evaluate(() => (window as CommandWindow).editorFixture.select(["queued"]));
    await expect(page.getByRole("button", { name: "Add label", exact: true })).toBeEnabled();
    await add("queued fixture label");
    await expect(receipt("queued fixture label")).toContainText('"state": "queued"');
    await receipt("queued fixture label").locator("..").locator("..")
      .getByRole("button", { name: "Stop remaining", exact: true }).click();
    await expect(receipt("queued fixture label")).toContainText('"state": "stopped"');
    await add("queued fixture label");
    await expect(receipt("queued fixture label")).toContainText('"state": "queued"');
    await page.evaluate(() => (window as CommandWindow).editorFixture.navigate("fixture"));
    await expect(page.locator("[data-detail-image-id]")).toHaveAttribute("data-detail-image-id", "fixture");
    release();
    await expect.poll(async () => JSON.parse((await receipt("batch fixture label").textContent())!).items
      .map((item: { observation: string }) => item.observation)).toEqual(["superseded", "observed"]);
    expect(JSON.parse((await receipt("batch fixture label").textContent())!).targets).toEqual(ids);
    await expect(receipt("queued fixture label")).toContainText('"observation": "observed"');
    await page.evaluate(() => (window as CommandWindow).editorFixture.navigate());
    await page.evaluate(ids => (window as CommandWindow).editorFixture.select(ids), ids);
    await expect.poll(() => page.evaluate(() => (window as CommandWindow).editorFixture.readbackSnapshot().selected
      .map(image => image.labels?.includes("batch fixture label")))).toEqual([true, true]);
    await page.getByRole("button", { name: "Remove batch fixture label from all selected images", exact: true }).click();
    await expect.poll(async () => JSON.parse((await receipt("batch fixture label", "remove").textContent())!).items
      .map((item: { observation: string }) => item.observation)).toEqual(["observed", "observed"]);
    expect(await page.evaluate(() => (window as CommandWindow).editorFixture.publicationSnapshot("fixture").selectedIds)).toEqual(ids);
    expect(await cell.boundingBox()).toEqual(box);
    await page.evaluate(() => (window as CommandWindow).editorFixture.select(["other"]));
    await expect(page.getByRole("button", { name: "Add label", exact: true })).toBeEnabled();
    await add("partial fixture label");
    await expect(receipt("partial fixture label")).toContainText('"observation": "observed"');
    await page.evaluate(ids => (window as CommandWindow).editorFixture.select(ids), ids);
    await expect.poll(() => page.evaluate(() => (window as CommandWindow).editorFixture.readbackSnapshot().selected
      .map(image => image.labels?.includes("partial fixture label")))).toEqual([false, true]);
    await page.getByRole("button", { name: "Remove partial fixture label from all selected images", exact: true }).click();
    const partial = receipt("partial fixture label", "remove");
    await expect.poll(async () => JSON.parse((await partial.textContent())!).items
      .map((item: { observation: string }) => item.observation)).toEqual(["observed", "observed"]);
    expect(JSON.parse((await partial.textContent())!).items.map((item: { result: { outcome: string } }) => item.result.outcome))
      .toEqual(["unchanged", "acknowledged"]);
    await expect(partial.locator("..").locator("..")).toContainText("1 unchanged");
    await expect.poll(() => page.evaluate(() => (window as CommandWindow).editorFixture.readbackSnapshot().selected
      .map(image => image.labels?.includes("partial fixture label")))).toEqual([false, false]);
    expect(await page.evaluate(() => (window as CommandWindow).editorFixture.publicationSnapshot("fixture").selectedIds)).toEqual(ids);
    expect(await cell.boundingBox()).toEqual(box);
  } finally { release(); await page.unroute(/\/images\/mget$/, holdReadback); }
}

async function exerciseRecoveryEditor(page: Page, holdProjection: (hold: boolean) => void) {
  const ids = ["fixture", "other"];
  const label = "recovery fixture label";
  await page.evaluate(ids => (window as CommandWindow).editorFixture.select(ids), ids);
  const add = async () => {
    await page.getByRole("button", { name: "Add label", exact: true }).click();
    const input = page.getByRole("combobox", { name: "Add label", exact: true });
    await input.fill(label);
    await input.press("Enter");
  };
  const receipts = page.getByRole("complementary", { name: "Label activity", exact: true }).locator("pre")
    .filter({ hasText: `"label": "${label}"` }).filter({ hasText: '"action": "add"' });
  holdProjection(true);
  try {
    await add();
    await expect.poll(async () => JSON.parse((await receipts.first().textContent())!).items
      .map((item: { observation: string }) => item.observation), { timeout: 12_000 }).toEqual(["deadline", "observed"]);
    await expect(page.getByRole("button", { name: "Add label", exact: true })).toBeDisabled();
    holdProjection(false);
    await page.getByRole("button", { name: "Clear selection", exact: true }).click();
    const cell = page.getByRole("region", { name: "Image results grid", exact: true }).locator('[data-cell-id="fixture"]');
    await cell.hover();
    await cell.getByRole("button", { name: "Select image", exact: true }).click();
    await expect(page.getByRole("button", { name: "Remove recovery fixture label", exact: true })).toBeEnabled();
    await page.evaluate(ids => (window as CommandWindow).editorFixture.select(ids), ids);
    await add();
    await expect(receipts).toHaveCount(2);
    await expect.poll(async () => JSON.parse((await receipts.first().textContent())!).items
      .map((item: { observation: string }) => item.observation)).toEqual(["observed", "observed"]);
  } finally { holdProjection(false); }
}

async function discardOnNavigation(page: Page, navigate: () => Promise<unknown>) {
  const accept = (dialog: Dialog) => dialog.accept();
  page.on("dialog", accept);
  try { await navigate(); }
  finally { page.off("dialog", accept); }
}

async function applyEditingFromPanel(page: Page, allowed: boolean, shortcut = false, screenshot?: string) {
  if (shortcut) await page.keyboard.press("Shift+F12");
  else {
    await page.getByRole("button", { name: "Settings", exact: true }).filter({ visible: true }).first().click();
    await page.getByRole("menuitem", { name: "Hi, Joshua", exact: true }).click();
  }
  const panel = page.getByRole("dialog", { name: "Hi, Joshua", exact: true });
  await expect(panel).toBeVisible();
  await panel.getByRole("checkbox", { name: "Allow editing", exact: true }).setChecked(allowed);
  const apply = panel.getByRole("button", { name: "Apply and reload", exact: true });
  await apply.focus();
  await page.keyboard.press("Tab");
  await expect(panel.getByRole("button", { name: "Close Hi, Joshua", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(apply).toBeFocused();
  if (screenshot) await page.screenshot({ path: screenshot });
  await discardOnNavigation(page, () => Promise.all([
    page.waitForEvent("load"), panel.getByRole("button", { name: "Apply and reload", exact: true }).click(),
  ]));
  await page.waitForFunction(() => Boolean((window as CommandWindow).commandFixture));
}

test("local commands cross the guarded Vite proxy using the saved startup preference", async ({ page }, testInfo) => {
  const received: Array<{ method: string; path: string; body: string }> = [];
  let origin = "";
  const labelsById = new Map(["fixture", "other", "queued"].map(imageId => [imageId, ["fixture label"]]));
  let version = 0;
  const imageEntity = (imageId: string) => ({
    uri: `${origin}/images/${imageId}`, links: [{ rel: "edits", href: `${origin}/metadata/${imageId}` }], actions: [],
    data: { id: imageId, uploadTime: "2026-01-01T00:00:00Z", metadata: {},
      source: { dimensions: { width: 800, height: 600 } },
      userMetadata: { data: { lastModified: new Date(Date.UTC(2026, 10, 7) + version * 1000).toISOString(),
        labels: { data: labelsById.get(imageId)!.map(data => ({ data })) }, archived: { data: false },
        metadata: {}, usageRights: {}, photoshoot: {} } } },
  });
        let heldProjection: ReturnType<typeof imageEntity> | undefined;
  const upstream = createHttpServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    received.push({ method: request.method ?? "", path: request.url ?? "", body });
    const imageId = request.url?.match(/^\/(?:metadata|images)\/(fixture|other|queued)(?:\/|$)/)?.[1];
    const labels = labelsById.get(imageId ?? "") ?? [];
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/") response.end(JSON.stringify({ links: [{ rel: "edits", href: origin }, { rel: "session", href: `${origin}/session` }] }));
    else if (request.url === "/session") response.end(JSON.stringify({ data: { user: { permissions: {} } } }));
    else if (request.url === "/images/search-after") response.end(JSON.stringify({ data: [imageEntity("fixture")], total: 1,
      sortValues: [[Date.UTC(2026, 0, 1), "fixture"]] }));
    else if (request.url === "/images/count") response.end(JSON.stringify({ total: JSON.parse(body).since ? 0 : 1 }));
    else if (request.url === "/images/mget") response.end(JSON.stringify({ data: (JSON.parse(body).ids as string[])
      .filter(imageId => labelsById.has(imageId)).map(imageId => imageId === "fixture" && heldProjection ? heldProjection : imageEntity(imageId)) }));
    else if (imageId && request.url === `/images/${imageId}`) response.end(JSON.stringify(imageEntity(imageId)));
    else if (imageId && request.url === `/metadata/${imageId}` && request.method === "GET") {
      response.end(JSON.stringify({ data: { labels: { uri: `${origin}/metadata/${imageId}/labels`,
        data: labels.map(label => ({ uri: `${origin}/metadata/${imageId}/labels/${new URLSearchParams({ label }).toString().slice(6)}`, data: label })) } } }));
    } else if (imageId && request.url === `/metadata/${imageId}/labels` && request.method === "POST") {
      labelsById.set(imageId, [...new Set([...labels, ...(JSON.parse(body).data as string[])])]);
      version++;
      response.end("{}");
    } else if (imageId && request.url?.startsWith(`/metadata/${imageId}/labels/`) && request.method === "DELETE") {
      const label = decodeURIComponent(request.url.slice(`/metadata/${imageId}/labels/`.length).replace(/\+/g, " "));
      labelsById.set(imageId, labels.filter(value => value !== label));
      version++;
      response.end("{}");
    }
    else { response.statusCode = 404; response.end("{}"); }
  });
  await new Promise<void>((done) => upstream.listen(0, "127.0.0.1", done));
  const address = upstream.address();
  if (!address || typeof address === "string") throw new Error("No fixture address");
  origin = `http://127.0.0.1:${address.port}`;
  const env = {
    VITEST: "true", VITE_USE_MEDIA_API: "true", VITE_HOSTED: "false", VITE_MEDIA_API_BASE_URL: "/api",
    VITE_GRID_METADATA_ORIGIN: origin, VITE_GRID_AUTH_ORIGIN: origin,
  };
  const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  let vite: Awaited<ReturnType<typeof createServer>> | undefined;
  try {
    vite = await createServer({
      configFile: resolve("vite.config.ts"), cacheDir: testInfo.outputPath("vite-cache"), plugins: [fixturePlugin],
      server: { host: "127.0.0.1", port: 0, proxy: { "/api": { target: origin, secure: true } } },
    });
    await vite.listen();
    const localOrigin = vite.resolvedUrls!.local[0].replace(/\/$/, "");
    await page.route("**/*", (route) => new URL(route.request().url()).origin === localOrigin ? route.continue() : route.abort());
    await page.goto(`${localOrigin}/__commands`);
    await page.waitForFunction(() => Boolean((window as CommandWindow).commandFixture));
    await exerciseLabelEditor(page);
    await exerciseObservedEditor(page);
    await discardOnNavigation(page, () => page.reload());
    await page.waitForFunction(() => Boolean((window as CommandWindow).commandFixture));
    await exerciseObservedRemoval(page, "acknowledged");
    expect(received).toEqual([]);
    expect((await page.evaluate(command => (window as CommandWindow).commandFixture.executeGridCommand(command), labelCommand(origin))).outcome).toBe("blocked");
    await page.evaluate(() => localStorage.setItem("kupua-allow-editing", "true"));
    await discardOnNavigation(page, () => page.reload());
    await page.waitForFunction(() => Boolean((window as CommandWindow).commandFixture));
    const result = await page.evaluate((command) => (window as CommandWindow).commandFixture.executeGridCommand(command), labelCommand(origin));
    expect(result.outcome).toBe("acknowledged");
    expect(received).toEqual([
      { method: "GET", path: "/", body: "" }, { method: "GET", path: "/session", body: "" },
      { method: "GET", path: "/metadata/fixture", body: "" },
      { method: "POST", path: "/metadata/fixture/labels", body: JSON.stringify({ data: ["fixture label"] }) },
    ]);
    const refused = await page.evaluate(async () => Promise.all([
      ["/grid-metadata/metadata/fixture/labels", "DELETE"],
      ["/grid-metadata/metadata/fixture/labels/extra", "POST"],
      ["/grid-auth/session", "POST"], ["/api/images/fixture", "DELETE"],
    ].map(async ([path, method]) => (await fetch(path, { method })).status)));
    expect(refused).toEqual([403, 403, 403, 403]);
    const removal = { operation: "remove-label", imageId: "fixture", label: "fixture label", resource: labelCommand(origin).resource };
    expect((await page.evaluate(command => (window as CommandWindow).commandFixture.executeGridCommand(command), removal)).outcome).toBe("acknowledged");
    expect(received.slice(4)).toEqual([{ method: "GET", path: "/metadata/fixture", body: "" },
      { method: "DELETE", path: "/metadata/fixture/labels/fixture+label", body: "" }]);
    expect(received).toHaveLength(6);
    await discardOnNavigation(page, () => page.goto(`${localOrigin}/__connected`));
    await page.waitForFunction(() => Boolean((window as CommandWindow).editorFixture));
    let beforeConnected = received.length;
    await exerciseConnectedEditor(page, () => { beforeConnected = received.length; });
    expect(received.slice(beforeConnected).filter(request => request.path.startsWith("/metadata/") && request.method !== "GET")).toEqual([
      { method: "POST", path: "/metadata/fixture/labels", body: JSON.stringify({ data: ["connected fixture label"] }) },
      { method: "DELETE", path: "/metadata/fixture/labels/connected+fixture+label", body: "" },
    ]);
    expect(received.slice(beforeConnected).filter(request => request.path === "/images/mget")).toHaveLength(2);
    const beforeBulk = received.length;
    await exerciseBulkEditor(page);
    expect(received.slice(beforeBulk).filter(request => request.path.startsWith("/metadata/") && request.method !== "GET")
      .map(({ method, path }) => ({ method, path }))).toEqual([
      { method: "POST", path: "/metadata/fixture/labels" }, { method: "POST", path: "/metadata/other/labels" },
      { method: "POST", path: "/metadata/queued/labels" },
      { method: "DELETE", path: "/metadata/fixture/labels/batch+fixture+label" }, { method: "DELETE", path: "/metadata/other/labels/batch+fixture+label" },
      { method: "POST", path: "/metadata/other/labels" }, { method: "DELETE", path: "/metadata/other/labels/partial+fixture+label" },
    ]);
    await page.screenshot({ path: testInfo.outputPath("bulk-labels-local.png") });
    const beforeRecovery = received.length;
    await exerciseRecoveryEditor(page, hold => { heldProjection = hold ? imageEntity("fixture") : undefined; });
    expect(received.slice(beforeRecovery).filter(request => request.method === "POST" && request.path.startsWith("/metadata/"))
      .map(request => request.path)).toEqual(["/metadata/fixture/labels", "/metadata/other/labels", "/metadata/fixture/labels", "/metadata/other/labels"]);
    await applyEditingFromPanel(page, false, true, testInfo.outputPath("hi-joshua-desktop.png"));
    expect((await page.evaluate(command => (window as CommandWindow).commandFixture.executeGridCommand(command), labelCommand(origin))).outcome).toBe("blocked");
    const writesBeforeReload = received.filter(request => ["POST", "DELETE"].includes(request.method) && request.path.startsWith("/metadata/")).length;
    await applyEditingFromPanel(page, true);
    expect(await page.evaluate(() => (window as CommandWindow).commandFixture.gridLabelEditingEnabled())).toBe(true);
    expect(received.filter(request => ["POST", "DELETE"].includes(request.method) && request.path.startsWith("/metadata/"))).toHaveLength(writesBeforeReload);
  } finally {
    await page.unrouteAll({ behavior: "wait" });
    await vite?.close();
    await new Promise<void>((done, reject) => upstream.close((error) => error ? reject(error) : done()));
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test("built hosted commands fail closed, use direct service origins and stop after expiry", async ({ page, context }, testInfo) => {
  test.setTimeout(90_000);
  const outDir = testInfo.outputPath("hosted");
  await build({
    configFile: resolve("vite.config.ts"), mode: "hosted", plugins: [fixturePlugin],
    build: { outDir, emptyOutDir: true, rollupOptions: {
      input: { index: resolve("index.html"), commands: virtualEntry },
      output: { entryFileNames: "assets/[name].js" },
    } },
  });
  const appOrigin = "https://app.example.test";
  const metadataOrigin = "https://metadata.example.test";
  const authOrigin = "https://auth.example.test";
  const config = { mediaApiUri: "https://api.example.test" };
  const requests: Array<{ method: string; origin: string; path: string; cookie: string }> = [];
  let writeStatus = 200;
  let connected = false;
  let connectedLabels = ["news"];
  const otherLabels = new Map<string, string[]>();
  let connectedVersion = 0;
  let releaseMetadata: (() => void) | undefined;
  let heldMetadata: Promise<void> | undefined;
  const imageEntity = (imageId: string) => ({
    uri: `${config.mediaApiUri}/images/${imageId}`,
    links: [{ rel: "edits", href: `${metadataOrigin}/metadata/${imageId}` }],
    data: { id: imageId, uploadTime: "2026-01-01T00:00:00Z", lastModified: "2026-01-01T00:00:00Z",
      metadata: { title: `Fixture ${imageId}`, credit: "Fixture", description: "Synthetic image" },
      cost: "free", valid: true, invalidReasons: {}, usageRights: { category: "staff-photographer" },
      userMetadata: { data: { lastModified: new Date(Date.UTC(2026, 10, 7) + connectedVersion * 1000).toISOString(),
        labels: { data: (connected ? imageId === "fixture" ? connectedLabels : otherLabels.get(imageId) ?? ["news"] : ["news"]).map(data => ({ data })) }, archived: { data: false },
        metadata: {}, usageRights: {}, photoshoot: {} } },
      source: { dimensions: { width: 800, height: 600 }, mimeType: "image/jpeg" },
      thumbnail: { secureUrl: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", dimensions: { width: 1, height: 1 } },
      usages: { data: [] }, leases: { data: { leases: [] } }, collections: [],
    },
  });
  let heldProjection: ReturnType<typeof imageEntity> | undefined;
  const escaped: string[] = [];
  const assertEditorReads = () => expect(requests.filter(request => !(request.origin === metadataOrigin && request.method === "GET" && request.path === "/") && !(request.origin === config.mediaApiUri
    && ((request.method === "GET" && ["/", "/usage/quotas", "/images/fixture", "/images/other"].includes(request.path))
      || (request.method === "POST" && GRID_API_READ_VIA_POST.includes(request.path)))))).toEqual([]);
  await context.addCookies([{ name: "fixture-session", value: "synthetic", domain: ".example.test", path: "/", secure: true, sameSite: "None" }]);
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === appOrigin) {
      if (url.pathname === "/" || url.pathname === "/search") {
        const html = (await readFile(resolve(outDir, "index.html"), "utf8"))
          .replace("<head>", `<head><script>window.__KUPUA_CONFIG__=${JSON.stringify(config)}</script>`)
          .replace("</body>", '<script type="module" src="/assets/kupua/assets/commands.js"></script></body>');
        await route.fulfill({ contentType: "text/html", body: html, headers: {
          "Content-Security-Policy": `default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://api.example.test ${metadataOrigin} ${authOrigin}`,
        } });
      } else if (url.pathname.startsWith("/assets/kupua/")) {
        const file = resolve(outDir, url.pathname.slice("/assets/kupua/".length));
        if (!file.startsWith(`${outDir}/`)) { await route.abort(); return; }
        const contentType = extname(file) === ".css" ? "text/css" : extname(file) === ".wasm" ? "application/wasm" : extname(file) === ".svg" ? "image/svg+xml" : "text/javascript";
        await route.fulfill({ body: await readFile(file), contentType });
      } else { escaped.push(url.pathname); await route.abort(); }
      return;
    }
    if (![config.mediaApiUri, metadataOrigin, authOrigin].includes(url.origin)) { escaped.push(url.origin); await route.abort(); return; }
    requests.push({ method: request.method(), origin: url.origin, path: url.pathname, cookie: (await request.allHeaders()).cookie ?? "" });
    let body: unknown = { data: [], total: 0 };
    if (url.origin === config.mediaApiUri && url.pathname === "/") body = { links: [{ rel: "edits", href: metadataOrigin }, { rel: "session", href: `${authOrigin}/session` }] };
    if (connected && url.origin === config.mediaApiUri && url.pathname === "/images/search-after") body = {
      data: [imageEntity("fixture")], total: 1, sortValues: [[Date.UTC(2026, 0, 1), "fixture"]],
    };
    if (connected && url.origin === config.mediaApiUri && url.pathname === "/images/count") body = { total: request.postDataJSON().since ? 0 : 1 };
    if (url.origin === config.mediaApiUri && /^\/images\/(fixture|other|queued)$/.test(url.pathname)) body = imageEntity(url.pathname.split("/").at(-1)!);
    if (url.origin === config.mediaApiUri && url.pathname === "/images/mget") {
      if (heldMetadata) await heldMetadata;
      body = { data: (request.postDataJSON().ids as string[])
        .map(imageId => imageId === "fixture" && heldProjection ? heldProjection : imageEntity(imageId)) };
    }
    if (url.origin === authOrigin) body = { data: { user: { permissions: {} } } };
    const imageId = url.pathname.split("/")[2];
    const labels = connected ? imageId === "fixture" ? connectedLabels : otherLabels.get(imageId) ?? ["news"] : ["fixture label"];
    if (url.origin === metadataOrigin) body = { data: { labels: { uri: `${metadataOrigin}/metadata/${imageId}/labels`,
      data: labels.map(label => ({
        uri: `${metadataOrigin}/metadata/${imageId}/labels/${new URLSearchParams({ label }).toString().slice(6)}`, data: label,
      })) } } };
    const status = url.origin === metadataOrigin && ["POST", "DELETE"].includes(request.method()) ? writeStatus : 200;
    if (connected && url.origin === metadataOrigin && status === 200 && ["POST", "DELETE"].includes(request.method())) {
      const updated = request.method() === "POST"
        ? [...new Set([...labels, ...(request.postDataJSON().data as string[])])]
        : labels.filter(label => label !== decodeURIComponent(url.pathname.split("/").at(-1)!.replace(/\+/g, " ")));
      if (imageId === "fixture") connectedLabels = updated;
      else otherLabels.set(imageId, updated);
      connectedVersion++;
    }
    await route.fulfill({ status, json: status === 419 ? { errorKey: "authentication-expired" } : body,
      headers: { "Access-Control-Allow-Origin": appOrigin, "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS", "Access-Control-Allow-Headers": "content-type" } });
  });
  try {
    await page.goto(appOrigin);
    await page.waitForFunction(() => Boolean((window as CommandWindow).commandFixture));
    await expect(page.locator("#root")).not.toBeEmpty();
    const execute = () => page.evaluate((command) => (window as CommandWindow).commandFixture.executeGridCommand(command), labelCommand(metadataOrigin));
    expect((await execute()).outcome).toBe("blocked");
    expect(requests.filter((request) => request.origin === authOrigin || (request.origin === metadataOrigin && (request.method !== "GET" || request.path !== "/")))).toEqual([]);
    await page.evaluate(() => (window as CommandWindow).editorFixture.navigate("fixture"));
    const realInput = page.getByRole("combobox", { name: "Add label", exact: true }).filter({ visible: true });
    const realPlus = page.getByRole("button", { name: "Add label", exact: true });
    await realPlus.click();
    await expect(realInput).toBeVisible();
    await realInput.fill("cold-detail");
    await realInput.press("Enter");
    await expect(page.getByText("Not sent - dry run", { exact: true })).toBeVisible();
    await realPlus.click();
    await realInput.fill("keep this input");
    await page.evaluate(() => (window as CommandWindow).editorFixture.navigate());
    await page.evaluate(() => (window as CommandWindow).editorFixture.select(["fixture"]));
    await realPlus.click();
    await expect(realInput).toHaveValue("keep this input");
    await expect(page.getByRole("button", { name: "Add label to images", exact: true })).toBeEnabled();
    heldMetadata = new Promise<void>(resolve => { releaseMetadata = resolve; });
    await page.evaluate(() => (window as CommandWindow).editorFixture.select(["other"]));
    await expect(page.getByRole("button", { name: "Add label to images", exact: true })).toBeDisabled();
    await expect(realInput).toHaveValue("");
    releaseMetadata!();
    heldMetadata = undefined;
    await realInput.fill("off-screen");
    await expect(page.getByRole("button", { name: "Add label to images", exact: true })).toBeEnabled();
    await realInput.press("Enter");
    await expect(page.getByText("Not sent - dry run", { exact: true })).toHaveCount(2);
    await page.evaluate(() => (window as CommandWindow).editorFixture.focus("fixture"));
    const keyboardRemove = page.getByRole("button", { name: "Remove news", exact: true });
    await keyboardRemove.focus();
    await keyboardRemove.press("Enter");
    await expect(page).not.toHaveURL(/image=/);
    await expect(page.getByText("Not sent - dry run", { exact: true })).toHaveCount(3);
    await page.screenshot({ path: testInfo.outputPath("label-editor-desktop.png") });
    assertEditorReads();
    const warning = page.waitForEvent("dialog");
    const navigation = page.goto(appOrigin);
    const dialog = await warning;
    expect(dialog.type()).toBe("beforeunload");
    await dialog.accept();
    await navigation;
    await page.waitForFunction(() => Boolean((window as CommandWindow).commandFixture));
    await exerciseLabelEditor(page);
    assertEditorReads();
    await exerciseObservedEditor(page);
    assertEditorReads();
    await discardOnNavigation(page, () => page.goto(appOrigin));
    await page.waitForFunction(() => Boolean((window as CommandWindow).commandFixture));
    await exerciseObservedRemoval(page, "unknown");
    assertEditorReads();
    await discardOnNavigation(page, () => page.goto(appOrigin));
    await page.waitForFunction(() => Boolean((window as CommandWindow).commandFixture));
    await page.setViewportSize({ width: 390, height: 844 });
    const touch = await context.newCDPSession(page);
    await touch.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
    await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    await page.evaluate(() => (window as CommandWindow).editorFixture.select(["fixture", "other"]));
    const sheet = page.getByRole("region", { name: "Details", exact: true });
    const remove = page.getByRole("button", { name: "Remove news from all selected images", exact: true });
    await expect(remove).toHaveAttribute("title", "Remove label from all");
    await remove.scrollIntoViewIfNeeded();
    const bounds = await remove.boundingBox();
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: bounds!.x + bounds!.width / 2, y: bounds!.y + bounds!.height / 2 }] });
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    const activity = sheet.getByRole("complementary", { name: "Label activity" });
    await expect(activity.getByText("Not sent - dry run", { exact: true })).toBeVisible();
    await expect(activity).toContainText('"action": "remove"');
    await expect(activity).toContainText('"label": "news"');
    await expect(activity).toContainText('"fixture"');
    await expect(activity).toContainText('"other"');
    const activityToggle = activity.locator(":scope > details > summary");
    await remove.focus();
    for (let step = 0; step < 20 && !await activityToggle.evaluate(element => element === document.activeElement); step++) {
      await page.keyboard.press("Tab");
    }
    await expect(activityToggle).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath("label-editor-mobile.png") });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    assertEditorReads();
    await touch.detach();
    await applyEditingFromPanel(page, true, false, testInfo.outputPath("hi-joshua-compact.png"));
    expect((await execute()).outcome).toBe("acknowledged");
    const writes = () => requests.filter((request) => request.origin === metadataOrigin && request.method === "POST");
    expect(writes()).toEqual([{ method: "POST", origin: metadataOrigin, path: "/metadata/fixture/labels", cookie: "fixture-session=synthetic" }]);
    const removal = { operation: "remove-label", imageId: "fixture", label: "fixture label", resource: labelCommand(metadataOrigin).resource };
    const executeRemoval = () => page.evaluate(command => (window as CommandWindow).commandFixture.executeGridCommand(command), removal);
    expect((await executeRemoval()).outcome).toBe("acknowledged");
    writeStatus = 503;
    expect((await executeRemoval()).outcome).toBe("unknown");
    expect(requests.filter(request => request.method === "DELETE")).toEqual(Array.from({ length: 2 }, () => ({
      method: "DELETE", origin: metadataOrigin, path: "/metadata/fixture/labels/fixture+label", cookie: "fixture-session=synthetic",
    })));
    writeStatus = 419;
    expect((await execute()).outcome).toBe("rejected");
    const afterExpiry = requests.length;
    expect((await execute()).outcome).toBe("blocked");
    expect(requests).toHaveLength(afterExpiry);
    expect(writes()).toHaveLength(2);
    expect(escaped).toEqual([]);
    connected = true;
    writeStatus = 200;
    await page.evaluate(() => (window as CommandWindow).editorFixture.select([]));
    await page.setViewportSize({ width: 1280, height: 900 });
    const desktop = await context.newCDPSession(page);
    await desktop.send("Emulation.setTouchEmulationEnabled", { enabled: false });
    await desktop.detach();
    await discardOnNavigation(page, () => page.goto(appOrigin));
    await page.waitForFunction(() => Boolean((window as CommandWindow).editorFixture));
    let beforeConnected = requests.length;
    await exerciseConnectedEditor(page, () => { beforeConnected = requests.length; });
    expect(requests.slice(beforeConnected).filter(request => request.origin === metadataOrigin && ["POST", "DELETE"].includes(request.method)))
      .toEqual(["POST", "DELETE"].map(method => ({ method, origin: metadataOrigin, cookie: "fixture-session=synthetic",
        path: method === "POST" ? "/metadata/fixture/labels" : "/metadata/fixture/labels/connected+fixture+label" })));
    expect(requests.slice(beforeConnected).filter(request => request.path === "/images/mget")).toHaveLength(2);
    expect(connectedLabels).toEqual(["news"]);
    const beforeBulk = requests.length;
    await exerciseBulkEditor(page);
    expect(requests.slice(beforeBulk).filter(request => request.origin === metadataOrigin && ["POST", "DELETE"].includes(request.method))
      .map(({ method, path }) => ({ method, path }))).toEqual([
      { method: "POST", path: "/metadata/fixture/labels" }, { method: "POST", path: "/metadata/other/labels" },
      { method: "POST", path: "/metadata/queued/labels" },
      { method: "DELETE", path: "/metadata/fixture/labels/batch+fixture+label" }, { method: "DELETE", path: "/metadata/other/labels/batch+fixture+label" },
      { method: "POST", path: "/metadata/other/labels" }, { method: "DELETE", path: "/metadata/other/labels/partial+fixture+label" },
    ]);
    expect(connectedLabels).toEqual(["news"]);
    expect(otherLabels.get("other")).toEqual(["news"]);
    const beforeRecovery = requests.length;
    await exerciseRecoveryEditor(page, hold => { heldProjection = hold ? imageEntity("fixture") : undefined; });
    expect(requests.slice(beforeRecovery).filter(request => request.origin === metadataOrigin && request.method === "POST")
      .map(request => request.path)).toEqual(["/metadata/fixture/labels", "/metadata/other/labels", "/metadata/fixture/labels", "/metadata/other/labels"]);
    await page.screenshot({ path: testInfo.outputPath("bulk-labels-hosted.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    const compact = await context.newCDPSession(page);
    try {
      await compact.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
      await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
      const compactActivity = page.getByRole("region", { name: "Details", exact: true })
        .getByRole("complementary", { name: "Label activity" });
      await compactActivity.scrollIntoViewIfNeeded();
      await expect(compactActivity).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath("bulk-labels-compact.png") });
    } finally { await compact.detach(); }
    expect(escaped).toEqual([]);
  } finally {
    releaseMetadata?.();
    await page.unrouteAll({ behavior: "wait" });
  }
});