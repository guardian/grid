import { test, expect } from "../shared/helpers";

for (const direction of [1, -1]) {
  test(`Table retains row and thumbnail identity when scrolling ${direction > 0 ? "forward" : "backward"}`, async ({ kupua, page }) => {
    await page.route("**/src/lib/image-urls.ts*", async route => {
      const response = await route.fetch();
      const source = await response.text();
      const marker = "if (!S3_PROXY_ENABLED) return undefined;";
      expect(source.split(marker)).toHaveLength(2);
      await route.fulfill({ response, body: source.replace(marker,
        'return "data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'40\' height=\'30\'%3E%3Cpath fill=\'blue\' d=\'M0 0h40v30H0z\'/%3E%3C/svg%3E#" + image.id;')
        .replace("S3_PROXY_ENABLED || SYNTHETIC_PREVIEW_ENABLED", "true") });
    });
    await kupua.startSearch("", "table");
    await page.evaluate(async () => {
      const configPath = "/src/dal/es-config.ts";
      if (!(await import(configPath)).IS_LOCAL_ES) throw new Error("Table identity fixture requires local ES");
      const path = "/src/dal/mock-data-source.ts";
      const { MockDataSource } = await import(path);
      const store = (window as any).__kupua_store__;
      store.setState({ dataSource: new MockDataSource(343) });
      await store.getState().search();
      await store.getState().extendForward();
      store.getState().setFocusedImageId(null);
    });
    await page.waitForFunction(() => {
      const state = (window as any).__kupua_store__.getState();
      return state.results.length === 343 && !state.loading && !state._extendForwardInFlight;
    });
    const region = page.getByRole("region", { name: "Image results table", exact: true });
    await region.evaluate(element => { element.scrollTop = 1600; });
    await page.waitForFunction(() => {
      const region = document.querySelector<HTMLElement>('[aria-label="Image results table"]')!;
      const first = region.querySelector<HTMLElement>('[role="row"][data-image-id]');
      return Number(first?.getAttribute("aria-rowindex")) > 20;
    });
    const snapshot = await region.evaluateHandle(region => {
      const bounds = region.getBoundingClientRect();
      const rows = [...region.querySelectorAll<HTMLElement>('[role="row"][data-image-id]')];
      const state = (window as any).__kupua_store__.getState();
      return { region, results: state.results, offset: state.bufferOffset, scrollTop: region.scrollTop,
        firstMountedId: rows[0].dataset.imageId,
        cells: rows.filter(row => {
          const rect = row.getBoundingClientRect();
          return rect.top > bounds.top + 64 && rect.bottom < bounds.bottom - 64;
        }).map(row => ({ row, id: row.dataset.imageId!, image: row.querySelector("img"),
          source: row.querySelector("img")?.getAttribute("src"), index: row.getAttribute("aria-rowindex") })) };
    });
    try {
      expect(await snapshot.evaluate(snapshot => snapshot.cells.length)).toBeGreaterThan(10);
      expect(await snapshot.evaluate(snapshot => snapshot.cells.every(cell => cell.image && cell.source))).toBe(true);
      await snapshot.evaluate((snapshot, direction) => { snapshot.region.scrollTop += direction * 32; }, direction);
      await page.waitForFunction(snapshot => snapshot.region.querySelector<HTMLElement>('[role="row"][data-image-id]')
        ?.dataset.imageId !== snapshot.firstMountedId, snapshot);
      const result = await snapshot.evaluate(snapshot => {
        const state = (window as any).__kupua_store__.getState();
        return { sameBuffer: state.results === snapshot.results && state.bufferOffset === snapshot.offset,
          distance: snapshot.region.scrollTop - snapshot.scrollTop,
          cells: snapshot.cells.map(cell => {
            const row = snapshot.region.querySelector<HTMLElement>(`[data-image-id="${CSS.escape(cell.id)}"]`);
            const image = row?.querySelector("img");
            return { present: Boolean(row), sameRow: row === cell.row, sameImage: image === cell.image,
              sameSource: image?.getAttribute("src") === cell.source, sameIndex: row?.getAttribute("aria-rowindex") === cell.index };
          }) };
      });
      expect(result.sameBuffer).toBe(true);
      expect(result.distance).toBe(direction * 32);
      for (const cell of result.cells) {
        expect(cell.present).toBe(true);
        expect(cell.sameSource).toBe(true);
        expect(cell.sameIndex).toBe(true);
        expect(cell.sameRow, "Retained image must keep its row when the visible slice shifts").toBe(true);
        expect(cell.sameImage, "Retained image must keep its thumbnail element").toBe(true);
      }
    } finally {
      await snapshot.dispose();
    }
  });
}

for (const { setup, capacity, direction, target, indexed } of [
  { setup: "aligned", target: 706 },
  { setup: "density", target: 707 },
  { setup: "panel", target: 706 },
  { setup: "density", target: 707, capacity: true },
  { setup: "density", target: 707, capacity: true, direction: "forward" },
  { setup: "shrinking extent", target: 709, capacity: true, direction: "forward" },
  { setup: "true start", target: 102 },
  { setup: "indexed", target: 707, indexed: true },
  { setup: "in-flight resize", target: 707 },
  { setup: "same-commit resize", target: 707 },
] satisfies { setup: string; target: number; capacity?: boolean; direction?: string; indexed?: boolean }[]) {
  test(`fixed-row publication preserves ${setup === "same-commit resize" ? "the resize anchor" : "every visible image"} after ${setup} setup${capacity ? " at capacity" : ""}${direction === "forward" ? " forward" : ""}`, async ({ kupua, page }) => {
    if (setup === "same-commit resize") {
      await page.addInitScript(() => {
        const descriptor = Object.getOwnPropertyDescriptor(window, "ResizeObserver")!;
        const NativeObserver = window.ResizeObserver;
        const probe = { hold: false, observe: false, delivered: false, pending: [] as (() => void)[],
          commits: [] as { columns: number; offset: number }[], cleanup: () => {} };
        window.ResizeObserver = class extends NativeObserver {
          constructor(callback: ResizeObserverCallback) {
            super((entries, observer) => {
              if (probe.hold && entries.some(entry => entry.target.getAttribute("aria-label") === "Image results grid")) {
                probe.pending.push(() => callback(entries, observer));
              } else callback(entries, observer);
            });
          }
        };
        probe.cleanup = () => {
          probe.hold = false;
          probe.pending.splice(0).forEach(deliver => deliver());
          Object.defineProperty(window, "ResizeObserver", descriptor);
        };
        (window as any).__fixedRowResize = probe;
      });
      await page.route("**/src/components/ImageGrid.tsx*", async route => {
        const response = await route.fetch();
        const source = await response.text();
        const marker = "const [columns, setColumns] = useState(4);";
        expect(source.split(marker)).toHaveLength(2);
        await route.fulfill({ response, body: source.replace(marker, `${marker}\nuseLayoutEffect(() => {
          const probe = window.__fixedRowResize;
          if (probe?.observe && probe.commits.length < 16) probe.commits.push({ columns, offset: bufferOffset });
        });`) });
      });
    }
    await page.setViewportSize({ width: 1720, height: 960 });
    await kupua.startSearch("", "table");
    await page.evaluate(async indexed => {
      const configPath = "/src/dal/es-config.ts";
      if (!(await import(configPath)).IS_LOCAL_ES) throw new Error("Fixed-row fixture requires local ES");
      const path = "/src/dal/mock-data-source.ts";
      const { MockDataSource } = await import(path);
      const store = (window as any).__kupua_store__;
      store.setState({ dataSource: new MockDataSource(indexed ? 12000 : 70000) });
      await store.getState().search();
    }, indexed ?? false);
    const table = page.getByRole("button", { name: "Table view", exact: true });
    if (await table.getAttribute("aria-pressed") !== "true") await table.click();
    await page.getByRole("region", { name: "Image results table", exact: true }).waitFor();
    await page.evaluate(async target => {
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      const state = (window as any).__kupua_store__.getState();
      const id = `img-${target}`;
      const page = await state.dataSource.searchAfter({ ...state.params, ids: id, length: 1 }, null);
      await state.restoreAroundCursor(id, page.sortValues[0], target, true);
    }, target);
    await page.waitForFunction(() => {
      const state = (window as any).__kupua_store__.getState();
      return !state.loading && !state._browseNavigation;
    });
    await page.evaluate(() => {
      const state = (window as any).__kupua_store__.getState();
      state.setFocusedImageId(state.results[100].id);
    });
    const generation = await page.evaluate(() => (window as any).__kupua_getDensityRestoreGeneration__());
    await page.getByRole("button", { name: "Grid view", exact: true }).click();
    await page.waitForFunction(generation => (window as any).__kupua_getDensityRestoreGeneration__() > generation, generation);
    if (setup === "panel") await page.getByRole("button", { name: "Show Browse panel", exact: true }).click();
    const cooldown = await page.evaluate(async () => {
      const path = "/src/constants/tuning.ts";
      return (await import(path)).SEARCH_FETCH_COOLDOWN_MS;
    });
    await page.waitForTimeout(cooldown + 50);
    if (capacity) {
      await page.evaluate(async () => {
        const store = (window as any).__kupua_store__;
        for (let count = 0; count < 4; count++) await store.getState().extendForward();
      });
      await page.waitForFunction(() => (window as any).__kupua_store__.getState().results.length === 1000);
    }
    const before = await page.evaluate(async ({ forward, indexed, sameCommit }) => {
      const reactDomPath = "/node_modules/.vite/deps/react-dom.js";
      const reactDom = sameCommit ? await import(reactDomPath) : null;
      const flushSync = reactDom?.flushSync ?? reactDom?.default?.flushSync;
      const store = (window as any).__kupua_store__;
      const state = store.getState();
      const region = document.querySelector<HTMLElement>('[aria-label="Image results grid"]')!;
      const columns = Math.floor(region.clientWidth / 280);
      const source = state.dataSource;
      const original = source.searchAfter;
      const own = Object.getOwnPropertyDescriptor(source, "searchAfter");
      let release!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      const probe = { held: false, closed: false, reads: 0, release, cleanup: () => {}, startObservation: () => {}, cohort: [] as any[], columns,
        publications: [] as { offset: number; count: number; seek: number; prepend: number; evict: number; top: number }[],
        generationField: forward ? "_forwardEvictGeneration" : "_prependGeneration",
        generation: forward ? state._forwardEvictGeneration : state._prependGeneration, initialOffset: state.bufferOffset,
        initialIds: state.results.map((image: any) => image.id), width: region.clientWidth };
      source.searchAfter = async function (...args: any[]) {
        probe.reads += 1;
        const result = await original.apply(this, args);
        if (Boolean(args[4]) !== forward) { probe.held = true; await gate; }
        return result;
      };
      const unsubscribe = store.subscribe((next: any, previous: any) => {
        if (next.results !== previous.results && probe.publications.length < 16) {
          probe.publications.push({ offset: next.bufferOffset, count: next.results.length,
            seek: next._seekGeneration, prepend: next._prependGeneration, evict: next._forwardEvictGeneration, top: region.scrollTop });
        }
        if (next[probe.generationField] > probe.generation) {
          const resize = (window as any).__fixedRowResize;
          if (sameCommit && !resize.delivered) {
            resize.delivered = true;
            resize.observe = true;
            flushSync(() => {
              resize.hold = false;
              resize.pending.splice(0).forEach((deliver: () => void) => deliver());
            });
          }
          probe.startObservation();
        }
      });
      probe.cleanup = () => {
        probe.closed = true;
        unsubscribe();
        release();
        if (own) Object.defineProperty(source, "searchAfter", own);
        else delete source.searchAfter;
      };
      (window as any).__fixedRowPublication = probe;
      region.scrollTop = forward ? region.scrollHeight - region.clientHeight
        : indexed ? Math.floor(state.bufferOffset / columns) * 303 : 0;
      region.dispatchEvent(new Event("scroll"));
      return { columns, remainder: state.bufferOffset % columns, count: state.results.length, offset: state.bufferOffset };
    }, { forward: direction === "forward", indexed: indexed ?? false, sameCommit: setup === "same-commit resize" });
    try {
      expect(before.columns).toBe(setup === "panel" ? 5 : 6);
      expect(before.offset, JSON.stringify(before)).toBe(target - 100 + (capacity ? 1 : 0));
      if (setup === "aligned") expect(before.remainder).toBe(0);
      else expect(before.remainder).toBeGreaterThan(0);
      expect(before.count).toBeGreaterThanOrEqual(200);
      await page.waitForFunction(() => (window as any).__fixedRowPublication.held);
      if (setup === "same-commit resize") {
        await page.evaluate(() => {
          const id = (window as any).__kupua_getViewportAnchorId__();
          if (!id) throw new Error("No resize anchor");
          (window as any).__fixedRowPublication.anchorId = id;
          (window as any).__kupua_store__.getState().setFocusedImageId(id);
          (window as any).__fixedRowResize.hold = true;
        });
        await page.getByRole("button", { name: "Show Browse panel", exact: true }).click();
        await page.waitForFunction(() => (window as any).__fixedRowResize.pending.length > 0);
      }
      if (setup === "in-flight resize") {
        await page.getByRole("button", { name: "Show Browse panel", exact: true }).click();
        await page.waitForFunction(() => Math.floor(document.querySelector<HTMLElement>('[aria-label="Image results grid"]')!.clientWidth / 280) === 5);
      }
      await page.evaluate(async () => {
        await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
        const probe = (window as any).__fixedRowPublication;
        const region = document.querySelector<HTMLElement>('[aria-label="Image results grid"]')!;
        const bounds = region.getBoundingClientRect();
        probe.columns = Math.floor(region.clientWidth / 280);
        probe.width = region.clientWidth;
        probe.scrollHeight = region.scrollHeight;
        const position = (cell: HTMLElement) => {
          const rect = cell.getBoundingClientRect();
          const style = getComputedStyle(cell);
          const translate = style.translate === "none" ? [0, 0] : style.translate.split(/\s+/).map(parseFloat);
          const transform = style.transform === "none" ? new DOMMatrixReadOnly() : new DOMMatrixReadOnly(style.transform);
          return { left: rect.left - bounds.left - (translate[0] || 0) - transform.m41,
            top: rect.top - bounds.top - (translate[1] || 0) - transform.m42, width: rect.width, height: rect.height };
        };
        probe.position = position;
        probe.cohort = [...region.querySelectorAll<HTMLElement>("[data-image-id]")].filter(cell => {
          const rect = cell.getBoundingClientRect();
          return rect.bottom > bounds.top && rect.top < bounds.bottom;
        }).map(cell => ({ id: cell.dataset.imageId, box: position(cell) }));
        if (probe.anchorId && !probe.cohort.some((item: { id: string }) => item.id === probe.anchorId)) {
          throw new Error("Resize anchor is outside the measured cohort");
        }
        probe.startObservation = () => {
          if (probe.observation) return;
          probe.observation = (async () => {
            let maxDisplacement = 0;
            let missing = 0;
            let anchorSamples = 0;
            for (let frame = 0; frame < 12; frame++) {
              await new Promise(requestAnimationFrame);
              if (probe.closed) return;
              if (document.visibilityState !== "visible") throw new Error("Fixed-row observation backgrounded");
              for (const item of probe.cohort) {
                const cell = document.querySelector<HTMLElement>(`[data-image-id="${CSS.escape(item.id)}"]`);
                if (!cell) { missing++; continue; }
                const box = probe.position(cell);
                if (item.id === probe.anchorId) anchorSamples++;
                for (const key of probe.anchorId ? (item.id === probe.anchorId ? ["top"] : []) : ["left", "top", "width", "height"]) {
                  maxDisplacement = Math.max(maxDisplacement, Math.abs(box[key] - item.box[key]));
                }
              }
            }
            const state = (window as any).__kupua_store__.getState();
            const prepend = probe.initialOffset - state.bufferOffset;
            const region = document.querySelector<HTMLElement>('[aria-label="Image results grid"]')!;
            probe.result = { maxDisplacement, missing, anchorSamples, cohort: probe.cohort.length, reads: probe.reads, prepend, publications: probe.publications,
              retainedOrder: probe.initialIds.every((id: string, index: number) => {
                const next = index + prepend;
                return next < 0 || next >= state.results.length ||
                  (state.results[next]?.id === id && state.imagePositions.get(id) === probe.initialOffset + index);
              }), count: state.results.length, offset: state.bufferOffset,
              extentDelta: region.scrollHeight - probe.scrollHeight,
              widthUnchanged: region.clientWidth === probe.width,
              columns: Math.floor(region.clientWidth / 280), measuredColumns: probe.columns,
              resizeCommits: (window as any).__fixedRowResize?.commits,
              anchorRetained: !probe.anchorId || state.focusedImageId === probe.anchorId };
          })().catch(error => { probe.error = String(error); }).finally(() => { probe.done = true; });
        };
        probe.release();
      });
      await page.waitForFunction(() => (window as any).__fixedRowPublication.done);
      const result = await page.evaluate(() => {
        const probe = (window as any).__fixedRowPublication;
        if (probe.error) throw new Error(probe.error);
        return probe.result;
      });
      if (direction === "forward") expect(result.prepend, JSON.stringify(result)).toBe(-200);
      else expect(result.prepend).toBe(Math.min(200, before.offset));
      if (capacity) expect(result.count).toBe(1000);
      if (setup === "true start") expect(result.offset).toBe(0);
      if (setup === "shrinking extent") expect(result.extentDelta).toBe(-303);
      expect(result.reads).toBe(1);
      expect(result.cohort).toBeGreaterThan(before.columns);
      expect(result.missing).toBe(0);
      expect(result.retainedOrder).toBe(true);
      expect(result.widthUnchanged).toBe(true);
      expect(result.columns).toBe(result.measuredColumns);
      if (setup === "same-commit resize") {
        expect(result.anchorSamples).toBe(12);
        expect(result.resizeCommits.length).toBeGreaterThan(0);
        expect(result.resizeCommits.every((commit: { columns: number; offset: number }) =>
          commit.columns === 5 && commit.offset === before.offset - 200), JSON.stringify(result.resizeCommits)).toBe(true);
        expect(result.anchorRetained).toBe(true);
      }
      expect(result.maxDisplacement).toBeLessThan(1);
    } finally {
      await page.evaluate(() => {
        (window as any).__fixedRowPublication?.cleanup();
        delete (window as any).__fixedRowPublication;
        (window as any).__fixedRowResize?.cleanup();
        delete (window as any).__fixedRowResize;
      });
    }
  });
}

test("independent density icons select views, toggle back to grid and keep grid idempotent", async ({ kupua, page }) => {
  await kupua.startSearch();
  const controls = page.getByRole("group", { name: "Image layout" });
  await expect(controls.getByRole("button")).toHaveCount(3);
  expect(await controls.getByRole("button").evaluateAll(buttons => buttons.every(button => button.getAttribute("type") === "button"))).toBe(true);
  expect(await controls.getByRole("button").evaluateAll(buttons => buttons.map(button => button.getAttribute("aria-label"))))
    .toEqual(["Table view", "Grid view", "Justified view"]);
  await expect(page.getByRole("note")).toHaveCount(0);
  const painted = await controls.locator("svg").evaluateAll(icons => icons.map(icon => {
    const svg = icon as SVGSVGElement;
    const box = svg.getBBox();
    const matrix = svg.getScreenCTM()!;
    return { width: box.width * Math.hypot(matrix.a, matrix.b), height: box.height * Math.hypot(matrix.c, matrix.d) };
  }));
  for (const icon of painted) {
    expect(Math.abs(icon.width - 14)).toBeLessThan(0.02);
    expect(Math.abs(icon.height - painted[1].height)).toBeLessThan(0.02);
  }
  const before = await page.evaluate(async () => {
    const path = "/src/stores/ui-prefs-store.ts";
    return (await import(path)).useUiPrefsStore.getState()._densityIntent;
  });
  await controls.getByRole("button", { name: "Grid view", exact: true }).click();
  expect(await page.evaluate(async () => {
    const path = "/src/stores/ui-prefs-store.ts";
    return (await import(path)).useUiPrefsStore.getState()._densityIntent;
  })).toBe(before);
  for (const name of ["Table", "Justified"]) {
    const button = controls.getByRole("button", { name: `${name} view`, exact: true });
    await button.click();
    await expect(page.getByRole("region", { name: `Image results ${name.toLowerCase()}`, exact: true })).toBeVisible();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await button.click();
    await expect(page.getByRole("region", { name: "Image results grid", exact: true })).toBeVisible();
    await expect(controls.getByRole("button", { name: "Grid view", exact: true })).toHaveAttribute("aria-pressed", "true");
  }
  await controls.getByRole("button", { name: "Justified view", exact: true }).click();
  await controls.getByRole("button", { name: "Table view", exact: true }).click();
  await controls.getByRole("button", { name: "Grid view", exact: true }).click();
  await expect(page.getByRole("region", { name: "Image results grid", exact: true })).toBeVisible();
});

for (const width of [320, 393]) {
  test(`native toolbar tabbing never shifts the app shell at ${width}px, with and without selection`, async ({ kupua, page }) => {
    await page.setViewportSize({ width, height: 852 });
    await kupua.startSearch();
    for (const selected of [false, true]) {
      if (selected) {
        const point = await kupua.waitForHitTestedImagePoint({ view: "grid" });
        const cell = page.locator(`[data-image-id="${point.imageId}"]`);
        await cell.hover();
        await cell.getByRole("button", { name: "Select image", exact: true }).click();
      }
      await page.getByRole("button", { name: "Show Browse panel", exact: true }).focus();
      const reached: string[] = [];
      for (let step = 0; step < 20; step++) {
        await page.keyboard.press("Tab");
        const observation = await page.evaluate(() => {
          const shell = document.querySelector(".h-dvh.w-screen")!;
          const results = document.querySelector('[aria-label="Image results grid"]')!;
          const active = document.activeElement as HTMLElement;
          const rect = active.getBoundingClientRect();
          const x = Math.max(1, Math.min(innerWidth - 1, rect.left + rect.width / 2));
          const hit = document.elementFromPoint(x, rect.top + rect.height / 2);
          return { shellScroll: shell.scrollLeft, resultsLeft: results.getBoundingClientRect().left,
            rootScroll: scrollX, label: active.getAttribute("aria-label"),
            hit: active.contains(hit), right: rect.right, left: rect.left };
        });
        expect(observation.shellScroll).toBe(0);
        expect(observation.rootScroll).toBe(0);
        expect(observation.resultsLeft).toBe(0);
        if (observation.label?.endsWith(" view") || observation.label === "Clear selection") reached.push(observation.label);
        if (observation.label?.endsWith(" view") || observation.label === "Clear selection") {
          expect(observation.left).toBeGreaterThanOrEqual(0);
          expect(observation.right).toBeLessThanOrEqual(width);
          expect(observation.hit).toBe(true);
        }
        // Below 500px only the active density shows; the Details toggle is hidden on phones.
        if (observation.label?.endsWith(" view")) break;
      }
      expect(reached).toEqual([...(selected ? ["Clear selection"] : []), "Grid view"]);
      if (selected) await page.getByRole("button", { name: "Clear selection", exact: true }).click();
    }
  });
}
