import { test, expect, type JSHandle, type Page } from "@playwright/test";
import { createServer as createHttpServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { build, createServer } from "vite";
import type * as Commands from "../../src/lib/grid-commands";
import type { labelEditorFixture } from "../shared/label-editor-fixture";
import { GRID_API_READ_VIA_POST } from "../../src/dal/grid-api/read-via-post";
import { labelEditorPlugin, virtualEntry } from "../shared/label-editor-plugin";
import { getDensityChangeButton } from "../shared/density-selection";
import type { useSearchStore } from "../../src/stores/search-store";

type CommandWindow = typeof window & { commandFixture: typeof Commands; editorFixture: typeof labelEditorFixture;
  __kupua_store__: typeof useSearchStore };
const fixturePlugin = labelEditorPlugin();

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
    VITE_MEDIA_DELIVERY: "canonical", VITE_COLLECTIONS_URL: "/fixture-collections", VITE_GRID_API_WRITES_ENABLED: "false" };
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
    VITE_COLLECTIONS_URL: "/fixture-collections", VITE_GRID_API_WRITES_ENABLED: "false" };
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
      let probe: Awaited<ReturnType<typeof page.evaluateHandle<{ stop: () => unknown }>>> | undefined;
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
          let publicationDuringScroll = false;
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
            if (state.results !== prior.results && state.results.some(image => image?.metadata.description === "A2 published description")) {
              publicationDuringScroll = wheelEvents > 2 && region.scrollTop > startScroll && performance.now() - lastMovement < 200;
            }
          });
          const sample = () => {
            frames++;
            const scroll = region.scrollTop;
            if (scroll > lastScroll) lastMovement = performance.now();
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
            frameId = requestAnimationFrame(sample);
          };
          frameId = requestAnimationFrame(sample);
          const bounds = region.getBoundingClientRect();
          const target = [...region.querySelectorAll<HTMLElement>("[data-cell-id]")].find(cell => {
            const box = cell.getBoundingClientRect();
            return box.top >= bounds.top && box.bottom <= bounds.bottom;
          });
          if (!target) throw new Error("Visible publication target unavailable");
          const timer = setTimeout(() => (window as CommandWindow).editorFixture.publish(target.dataset.cellId!), 400);
          return { stop() {
            clearTimeout(timer);
            cancelAnimationFrame(frameId);
            unsubscribe();
            region.removeEventListener("wheel", wheel);
            if (ownTop) Object.defineProperty(region, "scrollTop", ownTop);
            else delete (region as Partial<HTMLElement>).scrollTop;
            if (ownScrollTo) Object.defineProperty(region, "scrollTo", ownScrollTo);
            else delete (region as Partial<HTMLElement>).scrollTo;
            return { frames, comparisons, jumps, wheelEvents, publicationDuringScroll, scrollWrites, reverseMovement };
          } };
        }, density);
        await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        for (let step = 0; step < 8; step++) {
          await page.mouse.wheel(0, 40);
          await page.waitForTimeout(80);
        }
        const result = await probe.evaluate(probe => probe.stop()) as { frames: number; comparisons: number; jumps: number;
          publicationDuringScroll: boolean; scrollWrites: number; reverseMovement: number };
        await probe.dispose();
        probe = undefined;
        expect(result.frames).toBeGreaterThan(12);
        expect(result.comparisons).toBeGreaterThan(12);
        expect(result.jumps).toBe(0);
        expect(result.publicationDuringScroll).toBe(true);
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

test("local commands cross the actual guarded Vite proxy only for the selected operation", async ({ page }, testInfo) => {
  const received: Array<{ method: string; path: string; body: string }> = [];
  let origin = "";
  const upstream = createHttpServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    received.push({ method: request.method ?? "", path: request.url ?? "", body });
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/") response.end(JSON.stringify({ links: [{ rel: "session", href: `${origin}/session` }] }));
    else if (request.url === "/session") response.end(JSON.stringify({ data: { user: { permissions: {} } } }));
    else if (request.url === "/metadata/fixture" && request.method === "GET") {
      response.end(JSON.stringify({ data: { labels: { uri: `${origin}/metadata/fixture/labels` } } }));
    } else if (request.url === "/metadata/fixture/labels" && request.method === "POST") response.end("{}");
    else { response.statusCode = 404; response.end("{}"); }
  });
  await new Promise<void>((done) => upstream.listen(0, "127.0.0.1", done));
  const address = upstream.address();
  if (!address || typeof address === "string") throw new Error("No fixture address");
  origin = `http://127.0.0.1:${address.port}`;
  const env = {
    VITEST: "true", VITE_USE_MEDIA_API: "true", VITE_HOSTED: "false", VITE_MEDIA_API_BASE_URL: "/api",
    VITE_GRID_METADATA_ORIGIN: origin, VITE_GRID_AUTH_ORIGIN: origin,
    VITE_GRID_API_WRITES_ENABLED: "true", VITE_GRID_API_OPERATIONS: "add-labels",
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
    expect(received).toEqual([]);
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
    process.env.VITE_GRID_API_WRITES_ENABLED = "false";
    expect(await page.evaluate(async () => (await fetch("/grid-metadata/metadata/fixture/labels", { method: "POST" })).status)).toBe(403);
    expect(received).toHaveLength(4);
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
  const config = { mediaApiUri: "https://api.example.test", metadataEditorUri: metadataOrigin, authUri: authOrigin };
  const requests: Array<{ method: string; origin: string; path: string; cookie: string }> = [];
  let writeStatus = 200;
  let releaseMetadata: (() => void) | undefined;
  let heldMetadata: Promise<void> | undefined;
  const imageEntity = (imageId: string) => ({
    uri: `${config.mediaApiUri}/images/${imageId}`,
    links: [{ rel: "edits", href: `${metadataOrigin}/metadata/${imageId}` }],
    data: { id: imageId, uploadTime: "2026-01-01T00:00:00Z", lastModified: "2026-01-01T00:00:00Z",
      metadata: { title: `Fixture ${imageId}`, credit: "Fixture", description: "Synthetic image" },
      cost: "free", valid: true, invalidReasons: {}, usageRights: { category: "staff-photographer" },
      userMetadata: { data: { labels: { data: [{ data: "news" }] }, archived: { data: false },
        metadata: {}, usageRights: {}, photoshoot: {} } },
      source: { dimensions: { width: 800, height: 600 }, mimeType: "image/jpeg" },
      thumbnail: { secureUrl: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", dimensions: { width: 1, height: 1 } },
      usages: { data: [] }, leases: { data: { leases: [] } }, collections: [],
    },
  });
  const escaped: string[] = [];
  const assertEditorReads = () => expect(requests.filter(request => !(request.origin === config.mediaApiUri
    && ((request.method === "GET" && ["/", "/usage/quotas", "/images/fixture", "/images/other"].includes(request.path))
      || (request.method === "POST" && GRID_API_READ_VIA_POST.includes(request.path)))))).toEqual([]);
  await context.addCookies([{ name: "fixture-session", value: "synthetic", domain: ".example.test", path: "/", secure: true, sameSite: "None" }]);
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === appOrigin) {
      if (url.pathname === "/") {
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
    if (url.origin === config.mediaApiUri && url.pathname === "/") body = { links: [{ rel: "session", href: `${authOrigin}/session` }] };
    if (url.origin === config.mediaApiUri && /^\/images\/(fixture|other)$/.test(url.pathname)) body = imageEntity(url.pathname.split("/").at(-1)!);
    if (url.origin === config.mediaApiUri && url.pathname === "/images/mget") {
      if (heldMetadata) await heldMetadata;
      body = { data: (request.postDataJSON().ids as string[]).map(imageEntity) };
    }
    if (url.origin === authOrigin) body = { data: { user: { permissions: {} } } };
    if (url.origin === metadataOrigin) body = { data: { labels: { uri: `${metadataOrigin}/metadata/fixture/labels` } } };
    const status = url.origin === metadataOrigin && request.method() === "POST" ? writeStatus : 200;
    await route.fulfill({ status, json: status === 419 ? { errorKey: "authentication-expired" } : body,
      headers: { "Access-Control-Allow-Origin": appOrigin, "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "content-type" } });
  });
  try {
    await page.goto(appOrigin);
    await page.waitForFunction(() => Boolean((window as CommandWindow).commandFixture));
    await expect(page.locator("#root")).not.toBeEmpty();
    const execute = () => page.evaluate((command) => (window as CommandWindow).commandFixture.executeGridCommand(command), labelCommand(metadataOrigin));
    expect((await execute()).outcome).toBe("blocked");
    expect(requests.filter((request) => request.origin === metadataOrigin || request.origin === authOrigin)).toEqual([]);
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
    await page.evaluate(() => { window.__KUPUA_CONFIG__!.mutations = { enabled: true, operations: ["add-labels"] }; });
    await exerciseLabelEditor(page);
    assertEditorReads();
    page.once("dialog", dialog => dialog.accept());
    await page.goto(appOrigin);
    await page.waitForFunction(() => Boolean((window as CommandWindow).commandFixture));
    await page.evaluate(() => { window.__KUPUA_CONFIG__!.mutations = { enabled: true, operations: ["add-labels"] }; });
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
    expect((await execute()).outcome).toBe("acknowledged");
    const writes = () => requests.filter((request) => request.origin === metadataOrigin && request.method === "POST");
    expect(writes()).toEqual([{ method: "POST", origin: metadataOrigin, path: "/metadata/fixture/labels", cookie: "fixture-session=synthetic" }]);
    writeStatus = 419;
    expect((await execute()).outcome).toBe("rejected");
    const afterExpiry = requests.length;
    expect((await execute()).outcome).toBe("blocked");
    expect(requests).toHaveLength(afterExpiry);
    expect(writes()).toHaveLength(2);
    expect(escaped).toEqual([]);
  } finally {
    releaseMetadata?.();
    await page.unrouteAll({ behavior: "wait" });
  }
});