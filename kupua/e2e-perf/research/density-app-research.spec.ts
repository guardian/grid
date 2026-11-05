import { test, expect, type CDPSession, type BrowserContext, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { KupuaHelpers } from "../../e2e/shared/helpers";
import { electAnchor, establishDensitySource, restoreDensitySource, selectDensity, scrubDensityTo,
  prepareDensityMaintenance, scrollToDensityTail, waitForDensityEviction, waitForPlacement,
  waitForDensityMaintenanceCooldown, scrollAtSpeed,
  prepareDensityRecovery, measureDensityRecovery } from "../density-browser";
import { DENSITY_SCENARIOS, validateDensityRecord } from "../density-reporting.mjs";
import { createRequestProbe, installNetworkProbe } from "../network-probe.mjs";
import { installThumbnailProbe } from "../thumbnail-probe.mjs";
import { heldImageServer } from "../../e2e/shared/held-image-fixture";
import * as densityDrivers from "../density-browser";
import type { ImageBox, JustifiedLayout } from "../../src/lib/justified-layout";
import type { LayoutRow } from "../../src/lib/scroll-geometry-ref";

function retainKnownBoundaryRows(packed: JustifiedLayout, start: number, count: number, width: number,
  dimensions: ReadonlyMap<number, { id: string; ratio: number }>,
  pack: (ratios: number[], width: number, balanced: boolean) => JustifiedLayout): JustifiedLayout {
  const state = (globalThis as any).__b2TrueRatioBoundary;
  if (!state || state.start !== start || state.width !== width || count !== 48) return packed;
  const actual = Array.from({ length: count }, (_, index) => dimensions.get(start + index));
  if (actual.some(value => !value) || state.known.some((value: { index: number; id: string }) =>
    actual[value.index]?.id !== value.id)) return packed;
  const first = state.known[0].index;
  const last = state.known.at(-1).index;
  if (last - first + 1 !== state.known.length) throw new Error("Fragment fixture requires contiguous known images");
  const original = pack(state.ratios, width, true);
  const retained = original.boxes.slice(first, last + 1);
  const retainedTop = retained[0].top;
  const parts: { boxes: ImageBox[]; height: number }[] = [];
  if (first > 0) parts.push(pack(actual.slice(0, first).map(value => value!.ratio), width, true));
  parts.push({ boxes: retained.map(box => ({ ...box, top: box.top - retainedTop })),
    height: retained.at(-1)!.top + retained.at(-1)!.height - retainedTop });
  if (last + 1 < count) parts.push(pack(actual.slice(last + 1).map(value => value!.ratio), width, true));
  const boxes: ImageBox[] = [];
  let height = 0;
  for (const part of parts) {
    boxes.push(...part.boxes.map(box => ({ ...box, top: box.top + height })));
    height += part.height + 4;
  }
  height -= 4;
  const rows: LayoutRow[] = [];
  const itemRows: LayoutRow[] = [];
  for (const [index, box] of boxes.entries()) {
    let row = rows.at(-1);
    if (!row || row.top !== box.top) {
      row = { index: rows.length, top: box.top, height: box.height, firstItemIndex: index, lastItemIndex: index };
      rows.push(row);
    }
    row.lastItemIndex = index;
    itemRows.push(row);
  }
  for (const [index, row] of rows.entries()) row.height = (rows[index + 1]?.top ?? height) - row.top;
  state.applications++;
  return { boxes, rows, height, rowCount: rows.length,
    getBox: index => boxes[index], getRow: index => rows[index], getItemRow: index => itemRows[index],
    rowAtOffset: offset => rows.findLast(row => row.top <= offset) ?? rows[0],
    neighbour(index, rowIndex) {
      const box = boxes[index];
      const row = rows[Math.max(0, Math.min(rows.length - 1, rowIndex))];
      if (!box || !row) return index;
      let best = row.firstItemIndex;
      let distance = Infinity;
      for (let candidate = row.firstItemIndex; candidate <= row.lastItemIndex; candidate++) {
        const next = boxes[candidate];
        const delta = Math.abs(next.left + next.width / 2 - box.left - box.width / 2);
        if (delta < distance) { best = candidate; distance = delta; }
      }
      return best;
    },
  };
}

async function installB2AcceptanceRoutes(context: BrowserContext, productPolicy = false) {
  await context.route("**/*", async route => {
    const url = new URL(route.request().url());
    const local = url.origin === "http://127.0.0.1:3041";
    if (local && url.pathname.startsWith("/b2-thumbnail/")) {
      return route.fulfill({ contentType: "image/svg+xml", body:
        '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><path fill="#567" d="M0 0h400v300H0z"/></svg>' });
    }
    if (local && url.pathname === "/src/hooks/useDataWindow.ts") {
      const response = await route.fetch();
      const source = await response.text();
      const original = "rangeStartMatchesViewport && startIndex <= backwardThreshold && offset > 0";
      expect(source.split(original)).toHaveLength(2);
      if (productPolicy) return route.fulfill({ response, body: source });
      return route.fulfill({ response, body: source.replace(original,
        "rangeStartMatchesViewport && startIndex <= (globalThis.__b2AcceptanceCandidate === true ? forwardExtendThreshold(-_velocityEma) : EXTEND_THRESHOLD) && offset > 0") });
    }
    if (local && url.pathname === "/src/lib/image-urls.ts") {
      const response = await route.fetch();
      const source = await response.text();
      const original = "if (!S3_PROXY_ENABLED) return undefined;";
      const enabled = "S3_PROXY_ENABLED || SYNTHETIC_PREVIEW_ENABLED";
      expect(source.split(original)).toHaveLength(2);
      expect(source.split(enabled)).toHaveLength(2);
      return route.fulfill({ response, body: source.replace(original, 'return "/b2-thumbnail/" + image.id;')
        .replace(enabled, "true") });
    }
    const asset = local && !/^\/(es|api|grid-|s3|imgproxy|bedrock)/.test(url.pathname);
    return asset ? route.continue() : route.fulfill({ status: 404, body: "isolated fixture" });
  });
}

async function prepareB2AcceptancePage(context: BrowserContext, density: "grid" | "justified" | "table", capacity: boolean) {
  const page = await context.newPage();
  await page.goto("/search?nonFree=true");
  await page.waitForFunction(() => Boolean((window as any).__kupua_store__));
  await page.evaluate(async () => {
    const path = "/src/dal/mock-data-source.ts";
    const { MockDataSource } = await import(path);
    const store = (window as any).__kupua_store__;
    store.setState({ dataSource: new MockDataSource(70000) });
    await store.getState().search();
  });
  await selectDensity(page, density);
  await page.evaluate(async () => (window as any).__kupua_store__.getState().seek(42000));
  await waitForDensityMaintenanceCooldown(page);
  if (capacity) await prepareDensityMaintenance(page, density);
  await page.evaluate(async ({ density, capacity }) => {
    const path = "/src/lib/scroll-geometry-ref.ts";
    const { getLayoutGeometry, getItemLayoutRow } = await import(path);
    const region = document.querySelector<HTMLElement>(`[aria-label="Image results ${density}"]`)!;
    region.scrollTop = getItemLayoutRow(getLayoutGeometry(), capacity ? 300 : 90).top;
  }, { density, capacity });
  await waitForPlacement(page, density, false);
  const ready = await densityDrivers.visibleMediaReadiness(page, density, await page.evaluate(() => performance.now()));
  expect(ready.mediaCensored).toBe(0);
  return page;
}

async function installPublicationRoutes(context: BrowserContext, retainRows: boolean, stableKeys: boolean, originalAdmission = true,
  stableThumbnailKey = false) {
    if (originalAdmission) await context.route("**/src/hooks/useDataWindow.ts*", async route => {
      if (new URL(route.request().url()).origin !== "http://127.0.0.1:3041") return route.fallback();
      const response = await route.fetch();
      const source = await response.text();
      const original = "rangeStartMatchesViewport && startIndex <= backwardThreshold && offset > 0";
      expect(source.split(original)).toHaveLength(2);
      return route.fulfill({ response, body: source.replace(original,
        "rangeStartMatchesViewport && startIndex <= EXTEND_THRESHOLD && offset > 0") });
    });
    if (stableKeys) {
      await context.route("**/src/lib/windowed-justified-layout.ts*", async route => {
        if (new URL(route.request().url()).origin !== "http://127.0.0.1:3041") return route.fallback();
        const response = await route.fetch();
        const source = await response.text();
        const firstItem = "firstItemIndex: Math.max(0, toItem(block.start + row.firstItemIndex)),";
        expect(source.split(firstItem)).toHaveLength(2);
        return route.fulfill({ response, body: source.replace(firstItem,
          `__retentionPackedStart: block.start + row.firstItemIndex,\n${firstItem}`) });
      });
    }
    const loads = { grid: 0, table: 0, effects: 0 };
    for (const component of ["ImageGrid", "ImageTable"] as const) {
      await context.route(`**/src/components/${component}.tsx*`, async route => {
        if (new URL(route.request().url()).origin !== "http://127.0.0.1:3041") return route.fallback();
        const response = await route.fetch();
        let source = await response.text();
        const hook = "useScrollEffects({";
        const items = "const virtualItems = virtualizer.getVirtualItems();";
        expect(source.split(hook)).toHaveLength(2);
        expect(source.split(items)).toHaveLength(2);
        const view = component === "ImageTable" ? '"table"' : 'justified ? "justified" : "grid"';
        const rowForIndex = component === "ImageTable" ? "index => index"
          : "index => justifiedLayout?.getItemRow(index).index ?? getItemLayoutRow(fixedGeometry, index).index";
        if (retainRows) {
          const imported = "import { useVirtualizer }";
          const options = "const virtualizer = useVirtualizer({";
          expect(source.split(imported)).toHaveLength(2);
          expect(source.split(options)).toHaveLength(2);
          source = source.replace(imported, "import { useVirtualizer, defaultRangeExtractor as __retentionDefaultRange }")
            .replace(options, `${options}\nrangeExtractor: range => {
              const defaults = __retentionDefaultRange(range);
              return globalThis.__retentionDiagnostic?.extractRows(defaults, range, bufferOffset, results.length, ${rowForIndex}) ?? defaults;
            },`);
        }
        if (stableKeys && component === "ImageGrid") {
          const options = "const virtualizer = useVirtualizer({";
          const rowKey = "virtualRow.key";
          const cellKey = "justified ? imageIdx : getItemColumn(fixedGeometry, imageIdx)";
          const rowClass = 'className: "absolute left-0 right-0 flex",';
          expect(source.split(options)).toHaveLength(2);
          expect(source.split(rowKey)).toHaveLength(2);
          expect(source.split(cellKey)).toHaveLength(2);
          expect(source.split(rowClass)).toHaveLength(2);
          source = source.replace(options, `const __retentionRowKey = index => {
            if (!justifiedLayout) return JSON.stringify(["fixture-grid", searchParams, columns,
              twoTier ? index : Math.floor(bufferOffset / columns) + index]);
            const row = justifiedLayout.getRow(index);
            if (!Number.isInteger(row.__retentionPackedStart)) throw new Error("Missing unclamped packed-row identity");
            return JSON.stringify(["fixture-justified", justifiedLayout.searchKey, twoTier,
              justifiedLayout.window.width, row.__retentionPackedStart]);
          };\n${options}`)
            .replace(rowKey, "__retentionRowKey(virtualRow.index)")
            .replace(cellKey, 'justified ? (image?.id ?? "fixture-placeholder:" + imageIdx) : getItemColumn(fixedGeometry, imageIdx)')
            .replace(rowClass, `${rowClass}\n"data-retention-row-key": __retentionRowKey(virtualRow.index),`);
          if (stableThumbnailKey) {
            const innerKey = /animationClass\s*\?\s*image\.id\s*:\s*(?:undefined|void 0)/g;
            expect(source.match(innerKey)).toHaveLength(1);
            source = source.replace(innerKey, "image.id");
          }
        }
        const measuredItems = stableKeys && component === "ImageGrid"
          ? "virtualItems.map(item => ({ ...item, key: __retentionRowKey(item.index) }))" : "virtualItems";
        loads[component === "ImageTable" ? "table" : "grid"]++;
        return route.fulfill({ response, body: source.replace(hook,
          `const __retentionFrame = globalThis.__retentionDiagnostic?.beginRender({ density: ${view}, offset: bufferOffset, count: results.length, rowForIndex: ${rowForIndex} });\n${hook}\n__retentionFrame,`)
          .replace(items, `${items}\nglobalThis.__retentionDiagnostic?.finishRender(__retentionFrame, ${measuredItems}, virtualizer.range, virtualizer);`) });
      });
    }
    await context.route("**/src/hooks/useScrollEffects.ts*", async route => {
      if (new URL(route.request().url()).origin !== "http://127.0.0.1:3041") return route.fallback();
      const response = await route.fetch();
      const source = await response.text();
      const marker = "committedLayout.current = layoutPublication;";
      expect(source.split(marker)).toHaveLength(2);
      loads.effects++;
      return route.fulfill({ response, body: source.replace(marker,
        `globalThis.__retentionDiagnostic?.commit(config.__retentionFrame, parentRef.current);\n${marker}`) });
    });
    return loads;
}

for (const { density, retainRows, stableKeys } of [
  { density: "table", retainRows: false, stableKeys: false },
  { density: "grid", retainRows: false, stableKeys: false },
  { density: "justified", retainRows: false, stableKeys: false },
  { density: "table", retainRows: true, stableKeys: false },
  { density: "grid", retainRows: true, stableKeys: false },
  { density: "justified", retainRows: true, stableKeys: false },
  { density: "grid", retainRows: true, stableKeys: true },
  { density: "justified", retainRows: true, stableKeys: true },
] as const) {
  test(retainRows ? `Publication retention ${density === "table" ? "Table" : density} ${stableKeys ? "CK" : "C"}` : `Publication identity current ${density}`, async ({ context }) => {
    await installB2AcceptanceRoutes(context);
    const loads = await installPublicationRoutes(context, retainRows, stableKeys);
    const page = await prepareB2AcceptancePage(context, density, false);
    try {
      const setup = await page.evaluate(async ({ density, retainRows, stableKeys }) => {
        const path = "/src/hooks/useDataWindow.ts";
        const module = await import(path);
        if (module.useDataWindow.toString().includes("__b2AcceptanceCandidate")) {
          throw new Error("Identity diagnostic must use the original admission policy");
        }
        const store = (window as any).__kupua_store__;
        const state = store.getState();
        const region = document.querySelector<HTMLElement>(`[aria-label="Image results ${density}"]`)!;
        const selector = density === "table" ? '[role="row"][data-image-id]' : '[data-grid-cell][data-image-id]';
        const cells = () => [...region.querySelectorAll<HTMLElement>(selector)];
        const visible = (cell: HTMLElement) => {
          const bounds = region.getBoundingClientRect();
          const header = density === "table" ? region.querySelector("[data-table-header]")?.getBoundingClientRect().bottom : undefined;
          const box = cell.getBoundingClientRect();
          return box.bottom > Math.max(bounds.top, header ?? bounds.top) && box.top < bounds.bottom;
        };
        const targets = cells().filter(visible).map(cell => {
          const image = cell.querySelector<HTMLImageElement>("img")!;
          return { id: cell.dataset.imageId!, image, source: image.getAttribute("src"), removed: false, sourceChanged: false,
            initialRowKey: image.closest("[data-retention-row-key]")?.getAttribute("data-retention-row-key") ?? null,
            publicationRemoved: false,
            publicationImage: null as HTMLImageElement | null };
        });
        if (!targets.length || targets.length > 128 || targets.some(target => !target.image?.complete || target.image.naturalWidth === 0)) {
          throw new Error("Identity diagnostic requires a bounded loaded visible cohort");
        }
        if (stableKeys && targets.some(target => target.initialRowKey === null)) {
          throw new Error("CK requires the same fixture row-key policy from setup onward");
        }
        let lastFrame: any;
        const facts = (frame: any) => {
          const current = new Map(cells().map(cell => [cell.dataset.imageId, cell]));
          return targets.map(target => {
            const cell = current.get(target.id);
            const image = cell?.querySelector<HTMLImageElement>("img");
            const rank = store.getState().imagePositions.get(target.id);
            const row = frame && rank !== undefined ? frame.rowForIndex(rank - frame.offset) : null;
            return { present: Boolean(cell), visible: Boolean(cell && visible(cell)),
              sameElement: image === target.image, originalConnected: target.image.isConnected,
              samePublicationElement: Boolean(image && image === target.publicationImage),
              stableParentKey: stableKeys && Boolean(image && target.initialRowKey ===
                image.closest("[data-retention-row-key]")?.getAttribute("data-retention-row-key") &&
                frame?.rows.find((item: { index: number }) => item.index === row)?.key === target.initialRowKey),
              originalStillSamePhoto: target.image.closest<HTMLElement>(selector)?.dataset.imageId === target.id,
              originalSourceSame: target.image.getAttribute("src") === target.source,
              currentSourceSame: image?.getAttribute("src") === target.source,
              loaded: Boolean(image?.complete && image.naturalWidth > 0),
              expectedRow: row, inChosenRows: row === null ? null : frame.rows.some((item: any) => item.index === row) };
          });
        };
        const probe: any = { density, stableKeys, phase: "baseline", targets, initialCount: state.results.length,
          initialOffset: state.bufferOffset, initialResults: state.results, initialTotal: state.total,
          initialParams: JSON.stringify(state.params), frames: 0, commits: [], reads: 0, publications: 0,
          mutationRecords: 0, overflow: false, held: false, release: () => {}, restore: () => {}, pending: null,
          retention: { enabled: retainRows, status: "armed", releases: 0, calls: [], maxAdded: 0 },
          extractRows(defaults: number[], range: { count: number }, offset: number, count: number,
            rowForIndex: (index: number) => number) {
            if (probe.controlRows) return probe.controlRows;
            const plan = probe.retention;
            const required = [...new Set(targets.map(target => rowForIndex(store.getState().imagePositions.get(target.id) - offset)))];
            if (offset !== probe.initialOffset && plan.status === "armed") plan.status = "active";
            if (plan.status === "active" && required.every(index => defaults.includes(index))) {
              plan.status = "released";
              plan.releases++;
            }
            const added = plan.status === "active" ? required.filter(index => !defaults.includes(index)) : [];
            if (required.some(index => !Number.isInteger(index) || index < 0 || index >= range.count) ||
              count !== store.getState().results.length) throw new Error("Retention fixture requires bounded mapped cohort rows");
            const selected = [...new Set([...defaults, ...added])].sort((first, second) => first - second);
            plan.maxAdded = Math.max(plan.maxAdded, added.length);
            if (plan.calls.length >= 128) throw new Error("Retention extractor capture overflow");
            plan.calls.push({ status: plan.status, offsetDelta: offset - probe.initialOffset,
              count, defaultCount: defaults.length, added: added.length, selected: selected.length,
              requiredCovered: required.every(index => selected.includes(index)) });
            return selected;
          },
          beginRender(frame: any) {
            if (frame.density !== density) return undefined;
            if (++probe.frames > 128) probe.overflow = true;
            return { ...frame, render: probe.frames, rows: [], range: null };
          },
          finishRender(frame: any, items: any[], range: any, virtualizer: any) {
            if (!frame) return;
            probe.virtualizer = virtualizer;
            frame.rows = items.map(item => ({ index: item.index, key: item.key }));
            if (stableKeys && new Set(frame.rows.map((item: { key: string }) => item.key)).size !== frame.rows.length) {
              throw new Error("Fixture row keys must be unique across sparse selection");
            }
            frame.range = range ? { start: range.startIndex, end: range.endIndex } : null;
          },
          commit(frame: any, element: HTMLElement) {
            if (!frame || element !== region) return;
            if (probe.commits.length >= 128) { probe.overflow = true; return; }
            lastFrame = frame;
            probe.lastFrame = frame;
            if (frame.offset !== probe.initialOffset) {
              const current = new Map(cells().map(cell => [cell.dataset.imageId, cell]));
              for (const target of targets) {
                target.publicationImage ??= current.get(target.id)?.querySelector<HTMLImageElement>("img") ?? null;
              }
            }
            probe.commits.push({ render: frame.render, phase: probe.phase, offset: frame.offset,
              count: frame.count, scrollTop: region.scrollTop, rows: frame.rows, range: frame.range, facts: facts(frame) });
          },
          sample: () => facts(lastFrame),
        };
        const observer = new MutationObserver(records => {
          if (probe.phase === "calibration") return;
          probe.mutationRecords += records.length;
          if (probe.mutationRecords > 4096) { probe.overflow = true; observer.disconnect(); return; }
          for (const record of records) {
            for (const removed of record.removedNodes) {
              for (const target of targets) {
                if (removed === target.image || removed.contains(target.image)) target.removed = true;
                if (target.publicationImage && (removed === target.publicationImage || removed.contains(target.publicationImage))) {
                  target.publicationRemoved = true;
                }
              }
            }
            if (record.type === "attributes") {
              for (const target of targets) if (record.target === target.image &&
                (record.oldValue !== target.source || target.image.getAttribute("src") !== target.source)) target.sourceChanged = true;
            }
          }
        });
        observer.observe(region, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"], attributeOldValue: true });
        const unsubscribe = store.subscribe((next: any, previous: any) => {
          if (next.results !== previous.results) { probe.publications++; probe.phase = "publication"; }
        });
        probe.cleanup = () => { probe.release(); probe.restore(); observer.disconnect(); unsubscribe(); };
        (window as any).__retentionDiagnostic = probe;
        const source = state.dataSource;
        const original = source.searchAfter;
        let release!: () => void;
        const gate = new Promise<void>(resolve => { release = resolve; });
        probe.release = release;
        probe.restore = () => { source.searchAfter = original; };
        source.searchAfter = async (...args: unknown[]) => {
          if (++probe.reads !== 1 || !args[4]) throw new Error("Identity diagnostic admits exactly one backward read");
          probe.held = true;
          await gate;
          return original.apply(source, args);
        };
        probe.phase = "held";
        probe.pending = store.getState().extendBackward();
        return { initialCount: state.results.length, visible: targets.length,
          regime: document.querySelector("[data-scrubber-mode]")?.getAttribute("data-scrubber-mode") };
      }, { density, retainRows, stableKeys });
      expect(setup.regime).toBe("seek");
      expect(loads.effects).toBeGreaterThan(0);
      expect(loads[density === "table" ? "table" : "grid"]).toBeGreaterThan(0);
      await page.waitForFunction(() => (window as any).__retentionDiagnostic.held);
      expect(await page.evaluate(() => (window as any).__retentionDiagnostic.sample().every((item: any) => item.present && item.sameElement))).toBe(true);
      await page.evaluate(() => { (window as any).__retentionDiagnostic.phase = "released"; (window as any).__retentionDiagnostic.release(); });
      await page.waitForFunction(() => {
        const probe = (window as any).__retentionDiagnostic;
        const state = (window as any).__kupua_store__.getState();
        return probe.publications > 0 && !state._extendBackwardInFlight;
      });
      await waitForPlacement(page, density, false);
      const ready = await densityDrivers.visibleMediaReadiness(page, density, await page.evaluate(() => performance.now()));
      expect(ready.mediaCensored).toBe(0);
      const result = await page.evaluate(() => {
        const probe = (window as any).__retentionDiagnostic;
        const state = (window as any).__kupua_store__.getState();
        const final = probe.sample();
        const shared = final.flatMap((item: any, index: number) => item.visible ? [index] : []);
        const summarise = (items: any[]) => ({ present: items.filter(item => item.present).length,
          sameElement: items.filter(item => item.sameElement).length,
          samePublicationElement: items.filter(item => item.samePublicationElement).length,
          stableParentKeys: items.filter(item => item.stableParentKey).length,
          originalConnected: items.filter(item => item.originalConnected).length,
          originalStillSamePhoto: items.filter(item => item.originalStillSamePhoto).length,
          originalSourceSame: items.filter(item => item.originalSourceSame).length,
          currentSourceSame: items.filter(item => item.currentSourceSame).length,
          loaded: items.filter(item => item.loaded).length,
          inChosenRows: items.filter(item => item.inChosenRows).length });
        const summary = { density: probe.density, stableKeys: probe.stableKeys,
          initialCount: probe.initialCount, finalCount: state.results.length,
          offsetDelta: state.bufferOffset - probe.initialOffset, initialVisible: probe.targets.length,
          sharedVisible: shared.length, reads: probe.reads, publications: probe.publications,
          scopeUnchanged: state.total === probe.initialTotal && JSON.stringify(state.params) === probe.initialParams,
          overflow: probe.overflow, framesCreated: probe.frames, mutationRecords: probe.mutationRecords,
          commits: probe.commits.map((commit: any) => ({ render: commit.render, phase: commit.phase,
            offsetDelta: commit.offset - probe.initialOffset, count: commit.count, scrollTop: commit.scrollTop,
            rowMin: commit.rows[0]?.index, rowMax: commit.rows.at(-1)?.index, range: commit.range,
            expectedRowMin: Math.min(...shared.map((index: number) => commit.facts[index].expectedRow)),
            expectedRowMax: Math.max(...shared.map((index: number) => commit.facts[index].expectedRow)),
            ...summarise(shared.map((index: number) => commit.facts[index])) })),
          final: summarise(shared.map((index: number) => final[index])),
          originalsRemoved: shared.filter((index: number) => probe.targets[index].removed).length,
          publicationImgsRemoved: shared.filter((index: number) => probe.targets[index].publicationRemoved).length,
          originalSourcesMutated: shared.filter((index: number) => probe.targets[index].sourceChanged).length,
          retention: { ...probe.retention },
          calibration: { absentDetected: false, sameNodeReturnDetected: false, replacementDetected: false } };
        probe.phase = "calibration";
        const target = probe.targets[shared[0]];
        const selector = probe.density === "table" ? '[role="row"][data-image-id]' : '[data-grid-cell][data-image-id]';
        const region = document.querySelector(`[aria-label="Image results ${probe.density}"]`)!;
        const find = () => [...region.querySelectorAll<HTMLElement>(selector)].find(cell => cell.dataset.imageId === target.id);
        const cell = find()!;
        const image = cell.querySelector("img")!;
        const parent = cell.parentNode!;
        const next = cell.nextSibling;
        parent.removeChild(cell);
        summary.calibration.absentDetected = !find() && !image.isConnected;
        parent.insertBefore(cell, next);
        summary.calibration.sameNodeReturnDetected = find()?.querySelector("img") === image && image.isConnected;
        const replacement = image.cloneNode(true);
        image.replaceWith(replacement);
        summary.calibration.replacementDetected = find()?.querySelector("img") === replacement && !image.isConnected;
        return summary;
      });
      console.log(JSON.stringify({ fixture: "publication-identity-current", ...result }));
      expect(result.reads).toBe(1);
      expect(result.publications).toBe(1);
      expect(result.finalCount - result.initialCount).toBe(200);
      expect(result.offsetDelta).toBe(-200);
      expect(result.scopeUnchanged).toBe(true);
      expect(result.overflow).toBe(false);
      expect(result.sharedVisible).toBeGreaterThan(0);
      expect(result.final.present).toBe(result.sharedVisible);
      expect(result.final.currentSourceSame).toBe(result.sharedVisible);
      expect(result.final.loaded).toBe(result.sharedVisible);
      expect(result.commits.some((commit: { offsetDelta: number }) => commit.offsetDelta === -200)).toBe(true);
      expect(result.calibration).toEqual({ absentDetected: true, sameNodeReturnDetected: true, replacementDetected: true });
      if (retainRows) {
        expect(result.sharedVisible).toBe(result.initialVisible);
        for (const commit of result.commits.filter((commit: { offsetDelta: number }) => commit.offsetDelta === -200)) {
          expect(commit.present).toBe(result.sharedVisible);
          expect(commit.samePublicationElement).toBe(result.sharedVisible);
          expect(commit.currentSourceSame).toBe(result.sharedVisible);
          expect(commit.inChosenRows).toBe(result.sharedVisible);
          if (density === "table" || stableKeys) {
            expect(commit.sameElement).toBe(result.sharedVisible);
            expect(commit.loaded).toBe(result.sharedVisible);
          }
          if (stableKeys) expect(commit.stableParentKeys).toBe(result.sharedVisible);
        }
        if (density === "table" || stableKeys) expect(result.originalsRemoved).toBe(0);
        expect(result.publicationImgsRemoved).toBe(0);
        expect(result.originalSourcesMutated).toBe(0);
        expect(result.retention.status).toBe("released");
        expect(result.retention.releases).toBe(1);
        expect(result.retention.maxAdded).toBeGreaterThan(0);
        expect(result.retention.maxAdded).toBeLessThanOrEqual(result.initialVisible);
        expect(result.retention.calls.filter((call: { status: string }) => call.status === "active")
          .every((call: { requiredCovered: boolean }) => call.requiredCovered)).toBe(true);
        await page.evaluate(async () => {
          const path = "/src/lib/scroll-geometry-ref.ts";
          const { getLayoutGeometry, getItemLayoutRow } = await import(path);
          const probe = (window as any).__retentionDiagnostic;
          probe.phase = "after-release-scroll";
          document.querySelector<HTMLElement>(`[aria-label="Image results ${probe.density}"]`)!.scrollTop =
            getItemLayoutRow(getLayoutGeometry(), 180).top;
        });
        await waitForPlacement(page, density, false);
        const afterScroll = await page.evaluate(() => {
          const probe = (window as any).__retentionDiagnostic;
          const state = (window as any).__kupua_store__.getState();
          return { status: probe.retention.status, releases: probe.retention.releases,
            finalCall: probe.retention.calls.at(-1), reads: probe.reads, publications: probe.publications,
            pending: state._extendBackwardInFlight || state._extendForwardInFlight,
            retainedPresent: probe.sample().filter((item: { present: boolean }) => item.present).length };
        });
        console.log(JSON.stringify({ fixture: `publication-retention-${density}-after-scroll`, ...afterScroll }));
        expect(afterScroll.status).toBe("released");
        expect(afterScroll.releases).toBe(1);
        expect(afterScroll.finalCall.added).toBe(0);
        expect(afterScroll.retainedPresent).toBe(0);
        expect(afterScroll.reads).toBe(1);
        expect(afterScroll.publications).toBe(1);
        expect(Boolean(afterScroll.pending)).toBe(false);
        if (density !== "table") return;
        const invalidation = await page.evaluate(() => {
          const probe = (window as any).__retentionDiagnostic;
          const Constructor = probe.virtualizer.constructor;
          let chosen = [180, 181, 183, 185];
          const extractor = () => chosen;
          const virtualizer = new Constructor({ ...probe.virtualizer.options, count: 500,
            getScrollElement: () => null, initialOffset: 0, initialRect: { width: 100, height: 100 },
            rangeExtractor: extractor, onChange: () => {} });
          const initial = virtualizer.getVirtualItems().map((item: { index: number }) => item.index);
          chosen = [180, 182, 184, 185];
          const hiddenChange = virtualizer.getVirtualItems().map((item: { index: number }) => item.index);
          virtualizer.setOptions({ ...virtualizer.options, rangeExtractor: () => chosen });
          const refreshed = virtualizer.getVirtualItems().map((item: { index: number }) => item.index);
          return { initial, hiddenChange, refreshed };
        });
        expect(invalidation.initial).toEqual([180, 181, 183, 185]);
        expect(invalidation.hiddenChange).toEqual(invalidation.initial);
        expect(invalidation.refreshed).toEqual([180, 182, 184, 185]);
        const cacheControls = [];
        for (const indices of [[180, 181, 183, 185], [180, 182, 184, 185]]) {
          await page.evaluate(indices => {
            const probe = (window as any).__retentionDiagnostic;
            probe.cleanup();
            probe.phase = "sparse-cache-control";
            probe.controlRows = indices;
            const store = (window as any).__kupua_store__;
            store.setState({ results: [...store.getState().results] });
          }, indices);
          await page.waitForFunction(indices => {
            const probe = (window as any).__retentionDiagnostic;
            return JSON.stringify(probe.lastFrame.rows.map((row: { index: number }) => row.index)) === JSON.stringify(indices);
          }, indices);
          cacheControls.push(await page.evaluate(indices => {
            const state = (window as any).__kupua_store__.getState();
            const expected = indices.map(index => state.results[index].id);
            const rows = [...document.querySelectorAll<HTMLElement>('[aria-label="Image results table"] [role="row"][data-image-id]')];
            return { selected: indices.length, present: expected.filter(id => rows.some(row => row.dataset.imageId === id)).length,
              withImage: expected.filter(id => rows.some(row => row.dataset.imageId === id && row.querySelector("img"))).length };
          }, indices));
        }
        console.log(JSON.stringify({ fixture: "publication-retention-table-dependency-controls", invalidation, cacheControls }));
        expect(cacheControls).toEqual([
          { selected: 4, present: 4, withImage: 4 },
          { selected: 4, present: 2, withImage: 2 },
        ]);
      }
    } finally {
      await page.evaluate(() => { (window as any).__retentionDiagnostic?.cleanup(); delete (window as any).__retentionDiagnostic; }).catch(() => {});
      await page.close();
    }
  });
}

function installRetentionValueProbe({ density, retain, candidate, metadataDelay }:
  { density: "grid" | "justified"; retain: boolean; candidate: boolean; metadataDelay: number }) {
  const store = (window as any).__kupua_store__;
  const initial = store.getState();
  const region = document.querySelector<HTMLElement>(`[aria-label="Image results ${density}"]`)!;
  const cells = () => [...region.querySelectorAll<HTMLElement>("[data-grid-cell][data-image-id]")];
  const visible = () => {
    const bounds = region.getBoundingClientRect();
    return cells().filter(cell => {
      const box = cell.getBoundingClientRect();
      return box.bottom > bounds.top && box.top < bounds.bottom;
    });
  };
  const source = initial.dataSource;
  const original = source.searchAfter;
  const decoded = new WeakMap<HTMLImageElement, { source: string; ready: boolean }>();
  const probe: any = { density, retain, initialOffset: initial.bufferOffset, initialTotal: initial.total,
    initialParams: JSON.stringify(initial.params), reads: 0, pending: 0, peak: 0, maxRetained: initial.results.length,
    frames: 0, commits: 0, samples: [], events: [], releases: 0, maxAdded: 0,
    plan: null, overflow: false, frame: 0, cohortPaths: new Set<string>(),
    beginRender(frame: any) {
      if (++probe.frames > 4096) throw new Error("Value render bound exceeded");
      return { ...frame, rows: [], range: null };
    },
    finishRender(frame: any, items: any[], range: any) {
      frame.rows = items.map(item => ({ index: item.index, key: item.key }));
      frame.range = range;
    },
    extractRows(defaults: number[], range: { count: number }, offset: number, count: number,
      rowForIndex: (index: number) => number) {
      const plan = probe.plan;
      if (!plan || plan.status !== "active") return defaults;
      if (count !== store.getState().results.length) throw new Error("Value extraction publication mismatch");
      const required = [...new Set<number>(plan.targets.map((target: any) => {
        const rank = store.getState().imagePositions.get(target.id);
        if (rank === undefined) throw new Error("Value cohort left measured buffer");
        return rowForIndex(rank - offset);
      }))];
      if (required.some(index => !Number.isInteger(index) || index < 0 || index >= range.count)) {
        throw new Error("Value cohort row outside measured layout");
      }
      if (required.every(index => defaults.includes(index))) {
        plan.status = "released";
        probe.releases++;
        return defaults;
      }
      const added = required.filter(index => !defaults.includes(index));
      probe.maxAdded = Math.max(probe.maxAdded, added.length);
      return [...new Set([...defaults, ...added])].sort((first, second) => first - second);
    },
    commit(frame: any, element: HTMLElement) {
      if (element !== region || !frame) return;
      probe.commits++;
      const plan = probe.plan;
      if (!plan || plan.captureFinished) return;
      const current = new Map(cells().map(cell => [cell.dataset.imageId, cell]));
      const present = plan.targets.filter((target: any) => current.has(target.id)).length;
      const same = plan.targets.filter((target: any) => current.has(target.id) &&
        current.get(target.id)?.querySelector("img") === target.image.deref()).length;
      const sameCells = plan.targets.filter((target: any) => current.has(target.id) && current.get(target.id) === target.cell.deref()).length;
      const stableParents = plan.targets.filter((target: any) => target.parentKey !== null &&
        current.get(target.id)?.closest("[data-retention-row-key]")?.getAttribute("data-retention-row-key") === target.parentKey).length;
      const animationChanges = plan.targets.filter((target: any) => current.has(target.id) &&
        current.get(target.id)!.classList.contains("anim-arriving") !== target.arriving).length;
      const innerLosses = plan.targets.filter((target: any) => current.get(target.id) === target.cell.deref() &&
        target.parentKey !== null && current.get(target.id)?.closest("[data-retention-row-key]")?.getAttribute("data-retention-row-key") === target.parentKey &&
        current.get(target.id)?.querySelector("img") !== target.image.deref()).length;
      plan.minPresent = Math.min(plan.minPresent, present);
      plan.minOriginal = Math.min(plan.minOriginal, same);
      plan.minSameCells = Math.min(plan.minSameCells, sameCells);
      plan.minStableParents = Math.min(plan.minStableParents, stableParents);
      plan.maximumAnimationChanges = Math.max(plan.maximumAnimationChanges, animationChanges);
      plan.stableCellThumbnailLosses = Math.max(plan.stableCellThumbnailLosses, innerLosses);
      plan.observedCommits++;
      if ((!retain || plan.status === "released") && present === plan.targets.length) {
        plan.captureFinished = true;
        plan.recoveredAt = performance.now();
      }
    },
  };
  source.searchAfter = async (...args: unknown[]) => {
    if (++probe.reads > 8) throw new Error("Value metadata-read budget exceeded");
    probe.peak = Math.max(probe.peak, ++probe.pending);
    try {
      await new Promise(resolve => setTimeout(resolve, metadataDelay));
      return await original.apply(source, args);
    } finally { probe.pending--; }
  };
  const unsubscribe = store.subscribe((state: any, previous: any) => {
    probe.maxRetained = Math.max(probe.maxRetained, state.results.length);
    if (state.results === previous.results) return;
    if (probe.events.length >= 8) throw new Error("Value publication bound exceeded");
    const targets = visible().map(cell => {
      const image = cell.querySelector<HTMLImageElement>("img");
      if (!image) throw new Error("Value publication cohort lacks an image element");
      probe.cohortPaths.add(new URL(image.src).pathname);
      return { id: cell.dataset.imageId!, image: new WeakRef(image), cell: new WeakRef(cell),
        pending: !image.complete || image.naturalWidth === 0,
        parentKey: cell.closest("[data-retention-row-key]")?.getAttribute("data-retention-row-key") ?? null,
        arriving: cell.classList.contains("anim-arriving") };
    });
    if (!targets.length || targets.length > 128) throw new Error("Value publication cohort outside bounds");
    const plan = { targets, at: performance.now(), status: retain ? "active" : "observing",
      minPresent: targets.length, minOriginal: targets.length, observedCommits: 0,
      minSameCells: targets.length, minStableParents: targets.length, maximumAnimationChanges: 0,
      stableCellThumbnailLosses: 0,
      captureFinished: false, recoveredAt: null };
    probe.plan = plan;
    probe.events.push(plan);
  });
  let previousTime = performance.now();
  const sample = (time: number) => {
    if (probe.samples.length >= 4096) { probe.overflow = true; return; }
    const bounds = region.getBoundingClientRect();
    let area = 0;
    let pendingArea = 0;
    let loadedPendingArea = 0;
    const identities: string[] = [];
    for (const cell of visible()) {
      const image = cell.querySelector<HTMLImageElement>("img");
      const box = cell.getBoundingClientRect();
      const exposed = Math.max(0, Math.min(box.right, bounds.right) - Math.max(box.left, bounds.left)) *
        Math.max(0, Math.min(box.bottom, bounds.bottom) - Math.max(box.top, bounds.top));
      identities.push(cell.dataset.imageId!);
      area += exposed;
      let ready = false;
      if (image) {
        let state = decoded.get(image);
        const currentSource = image.getAttribute("src") ?? "";
        if (!state || state.source !== currentSource) {
          state = { source: currentSource, ready: false };
          decoded.set(image, state);
          const captured = state;
          void image.decode().then(() => { captured.ready = true; }, () => {});
        }
        ready = state.ready && image.complete && image.naturalWidth > 0;
      }
      if (!ready) pendingArea += exposed;
      if (!image?.complete || image.naturalWidth === 0) loadedPendingArea += exposed;
    }
    probe.samples.push({ time, frame: time - previousTime, pending: area ? pendingArea / area : 1,
      loadedPending: area ? loadedPendingArea / area : 1,
      cohort: identities.sort().join("|") });
    previousTime = time;
    probe.frame = requestAnimationFrame(sample);
  };
  (window as any).__b2AcceptanceCandidate = candidate;
  (window as any).__retentionDiagnostic = probe;
  probe.frame = requestAnimationFrame(sample);
  probe.dispose = () => {
    cancelAnimationFrame(probe.frame);
    unsubscribe();
    source.searchAfter = original;
    (window as any).__b2AcceptanceCandidate = false;
    delete (window as any).__retentionDiagnostic;
  };
}

for (const density of ["grid", "justified"] as const) {
  for (const workload of ["loaded-short-stop", "pending-short-stop", "pressure", "pressure-inner"] as const) {
    for (const reverseOrder of [false, true]) {
      test(`Retention value ${density} ${workload} ${reverseOrder ? "ck-first" : "current-first"}`, async ({ context }) => {
        let reference: unknown;
        const comparisons: { policy: string; walls: number; reads: number; pendingMean: number;
          loadedPendingMean: number; firstReadyMs: number | null; frameP95Ms: number | null;
          starts: number | null; cancellations: number | null }[] = [];
        const order = workload === "pressure-inner"
          ? reverseOrder ? ["ck-inner", "ck", "b2", "current"] as const : ["current", "b2", "ck", "ck-inner"] as const
          : reverseOrder ? ["ck", "b2", "current"] as const : ["current", "b2", "ck"] as const;
        for (const policy of order) {
          let activeMedia = false;
          const mediaDelay = workload === "pending-short-stop" ? 1200 : workload.startsWith("pressure") ? 120 : 0;
          const server = await heldImageServer({ hold: () => activeMedia && mediaDelay > 0,
            releaseDelayMs: mediaDelay, limit: 4096,
            imageBody: () => '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><path fill="#567" d="M0 0h400v300H0z"/></svg>' });
          let page: Page | undefined;
          let session: CDPSession | undefined;
          let requests: ReturnType<typeof createRequestProbe> | undefined;
          try {
            await installB2AcceptanceRoutes(context);
            await context.route(`${server.origin}/**`, route => route.continue());
            await context.route("**/src/lib/image-urls.ts*", async route => {
              if (new URL(route.request().url()).origin !== "http://127.0.0.1:3041") return route.fallback();
              const response = await route.fetch();
              const source = await response.text();
              const marker = "if (!S3_PROXY_ENABLED) return undefined;";
              expect(source.split(marker)).toHaveLength(2);
              return route.fulfill({ response, body: source.replace(marker,
                `return ${JSON.stringify(server.origin)} + "/image/" + image.id + ".svg";`)
                .replace("S3_PROXY_ENABLED || SYNTHETIC_PREVIEW_ENABLED", "true") });
            });
            await installPublicationRoutes(context, policy.startsWith("ck"), policy.startsWith("ck"), false, policy === "ck-inner");
            page = await prepareB2AcceptancePage(context, density, false);
            const initial = await page.evaluate(density => {
              const state = (window as any).__kupua_store__.getState();
              const region = document.querySelector<HTMLElement>(`[aria-label="Image results ${density}"]`)!;
              const bounds = region.getBoundingClientRect();
              const visible = [...region.querySelectorAll<HTMLElement>("[data-grid-cell][data-image-id]")].filter(cell => {
                const box = cell.getBoundingClientRect();
                return box.bottom > bounds.top && box.top < bounds.bottom;
              }).map(cell => ({ id: cell.dataset.imageId, top: Math.round((cell.getBoundingClientRect().top - bounds.top) * 10) / 10,
                width: cell.getBoundingClientRect().width, height: cell.getBoundingClientRect().height }));
              return { ids: state.results.map((image: any) => image?.id), offset: state.bufferOffset,
                count: state.results.length, total: state.total, scrollTop: region.scrollTop,
                width: region.clientWidth, height: region.clientHeight, visible };
            }, density);
            if (reference === undefined) reference = initial;
            else expect(initial, "matched metadata, viewport and loaded starting cohort").toEqual(reference);
            session = await context.newCDPSession(page);
            await session.send("Network.enable");
            requests = createRequestProbe(session);
            requests.beginPhase();
            const firstRequest = server.requests.length;
            activeMedia = true;
            await page.evaluate(installRetentionValueProbe, { density, retain: policy.startsWith("ck"), candidate: policy !== "current", metadataDelay: 900 });
            const result = await page.evaluate(async ({ density, workload }) => {
              const driverPath = "/e2e-perf/density-browser.ts";
              const velocityPath = "/src/hooks/useDataWindow.ts";
              const drivers = await import(driverPath);
              (await import(velocityPath))._resetForwardVelocity();
              const localPage = { evaluate: (callback: any, argument: any) => callback(argument) };
              const probe = (window as any).__retentionDiagnostic;
              let metrics: any;
              let stoppedAt: number;
              if (workload.startsWith("pressure")) {
                const capture = await drivers.captureDensityJourney({ density, direction: -1, durationMs: 3000,
                  resultsPerSecond: 200, loadSteps: [200, 200, 200], recoveryTimeoutMs: 4000,
                  reverseDurationMs: 0, networkConstrained: false });
                metrics = capture.metrics;
                stoppedAt = capture.stoppedEpoch - performance.timeOrigin;
              } else {
                const motion = await drivers.scrollAtSpeed(localPage, density, -4000, 1500,
                  { measureBounds: true, maxDistancePx: 600 });
                metrics = motion;
                stoppedAt = motion.stoppedAtPerformanceMs;
              }
              const observationLimitMs = workload === "pending-short-stop" ? 6000 : 3000;
              const observationEnd = stoppedAt + observationLimitMs;
              const remaining = observationEnd - performance.now();
              if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
              await new Promise(requestAnimationFrame);
              const stopped = probe.samples.filter((sample: any) => sample.time >= stoppedAt && sample.time <= observationEnd);
              if (stopped.length < 2) throw new Error("Value stopped observation missing");
              const percentile = (values: number[], fraction: number) => {
                const sorted = values.slice().sort((first, second) => first - second);
                return sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] : null;
              };
              let anyPendingMs = 0;
              let weightedPending = 0;
              let weightedLoadedPending = 0;
              let observedMs = 0;
              for (let index = 0; index < stopped.length - 1; index++) {
                const delta = stopped[index + 1].time - stopped[index].time;
                observedMs += delta;
                weightedPending += stopped[index].pending * delta;
                weightedLoadedPending += stopped[index].loadedPending * delta;
                if (stopped[index].pending > 0) anyPendingMs += delta;
              }
              const publicationFrames = probe.samples.filter((sample: any) =>
                probe.events.some((event: any) => sample.time >= event.at && sample.time <= event.at + 200));
              const lastPublication = probe.events.at(-1)?.at ?? stoppedAt;
              const afterPublication = stopped.filter((sample: any) => sample.time >= lastPublication);
              const lastPending = stopped.findLast((sample: any) => sample.pending > 0);
              const firstReady = stopped.find((sample: any) => sample.pending === 0);
              const cohortChanged = stopped.some((sample: any) => sample.cohort !== stopped[0].cohort);
              const state = (window as any).__kupua_store__.getState();
              return { metrics, stopped: { observationLimitMs, samples: stopped.length, observedMs,
                firstSampleLagMs: stopped[0].time - stoppedAt,
                meanPendingArea: weightedPending / observedMs,
                meanLoadedPendingArea: weightedLoadedPending / observedMs,
                maximumLoadedPendingArea: Math.max(...stopped.map((sample: any) => sample.loadedPending)),
                maximumPendingArea: Math.max(...stopped.map((sample: any) => sample.pending)), anyPendingMs,
                firstReadyMs: firstReady && !cohortChanged && stopped.at(-1).pending === 0 ? firstReady.time - stoppedAt : null,
                rawFirstReadyMs: firstReady ? firstReady.time - stoppedAt : null,
                lastPendingMs: lastPending ? lastPending.time - stoppedAt : null,
                finalPendingArea: stopped.at(-1).pending,
                finalLoadedPendingArea: stopped.at(-1).loadedPending,
                cohortChanged,
                postPublicationPendingSamples: afterPublication.filter((sample: any) => sample.pending > 0).length },
                publicationFrames: { samples: publicationFrames.length,
                  p95Ms: percentile(publicationFrames.map((sample: any) => sample.frame), 0.95),
                  worstMs: percentile(publicationFrames.map((sample: any) => sample.frame), 1) },
                reads: probe.reads, pending: probe.pending, peak: probe.peak, maxRetained: probe.maxRetained,
                releases: probe.releases, maxAdded: probe.maxAdded, overflow: probe.overflow,
                scopeUnchanged: state.total === probe.initialTotal && JSON.stringify(state.params) === probe.initialParams,
                activePlan: probe.plan?.status === "active",
                events: probe.events.map((event: any) => ({ relativeToStopMs: event.at - stoppedAt,
                  cohort: event.targets.length, pendingAtPublication: event.targets.filter((target: any) => target.pending).length,
                  minPresent: event.minPresent, minOriginal: event.minOriginal,
                  minSameCells: event.minSameCells, minStableParents: event.minStableParents,
                  maximumAnimationChanges: event.maximumAnimationChanges,
                  stableCellThumbnailLosses: event.stableCellThumbnailLosses,
                  observedCommits: event.observedCommits, recoveredMs: event.recoveredAt === null ? null : event.recoveredAt - event.at })),
                cohortPaths: [...probe.cohortPaths] as string[] };
            }, { density, workload });
            const { cohortPaths, ...safe } = result;
            const measured = server.requests.slice(firstRequest);
            const cohorts = measured.filter(request => cohortPaths.includes(request.path));
            const native = { starts: measured.length, aborted: measured.filter(request => request.aborted).length,
              finished: measured.filter(request => request.finished).length,
              pending: measured.filter(request => !request.aborted && !request.finished).length,
              cohortStarts: cohorts.length, cohortAborts: cohorts.filter(request => request.aborted).length,
              cohortUnique: new Set(cohorts.map(request => request.path)).size,
              cohortRepeatedStarts: cohorts.length - new Set(cohorts.map(request => request.path)).size };
            const requestSummary = requests.snapshot();
            console.log(JSON.stringify({ fixture: "retention-value", density, workload, reverseOrder, policy,
              metadataDelayMs: 900, mediaDelayMs: mediaDelay, initialCount: initial.count,
              ...safe, native, requests: requestSummary }));
            const walls = workload.startsWith("pressure")
              ? ["early", "middle", "late"].reduce((sum, prefix) => sum + (result.metrics[prefix + "BufferEdgeBlockedMs"] ?? 0), 0)
              : result.metrics.bufferEdgeBlockedMs;
            comparisons.push({ policy, walls, reads: result.reads, pendingMean: result.stopped.meanPendingArea,
              loadedPendingMean: result.stopped.meanLoadedPendingArea, firstReadyMs: result.stopped.firstReadyMs,
              frameP95Ms: result.publicationFrames.p95Ms, starts: requestSummary.mediaRequestStarts,
              cancellations: requestSummary.mediaRequestCancellations });
            expect(result.scopeUnchanged).toBe(true);
            expect(result.overflow).toBe(false);
            expect(result.pending).toBe(0);
            expect(result.maxRetained).toBeLessThanOrEqual(1000);
            expect(result.peak).toBeLessThanOrEqual(2);
            expect(requestSummary.requestCaptureOverflow).toBe(0);
            expect(result.stopped.observedMs).toBeGreaterThan(result.stopped.observationLimitMs - 100);
            expect(result.stopped.firstSampleLagMs).toBeLessThanOrEqual(25);
            if (workload === "pending-short-stop" && policy !== "current") {
              expect(result.events.length).toBeGreaterThan(0);
              expect(result.events.some((event: { pendingAtPublication: number }) => event.pendingAtPublication > 0)).toBe(true);
            }
            if (policy.startsWith("ck")) {
              expect(result.activePlan).toBe(false);
              expect(result.releases).toBe(result.events.length);
              console.log(JSON.stringify({ fixture: "retention-value-mechanism-outcome", density, workload, reverseOrder,
                policy,
                originalSurvival: result.events.every((event: { minOriginal: number; cohort: number }) => event.minOriginal === event.cohort),
                failedCohorts: result.events.filter((event: { minOriginal: number; cohort: number }) => event.minOriginal !== event.cohort).length }));
              if (policy === "ck-inner") {
                for (const event of result.events) expect(event.stableCellThumbnailLosses).toBe(0);
              }
            }
          } finally {
            await page?.evaluate(() => (window as any).__retentionDiagnostic?.dispose()).catch(() => {});
            requests?.dispose();
            await session?.detach().catch(() => {});
            await page?.close();
            await server.close();
          }
        }
        console.log(JSON.stringify({ fixture: "retention-value-comparison", density, workload, reverseOrder, comparisons }));
        if (workload.startsWith("pressure")) {
          const current = comparisons.find(value => value.policy === "current")!;
          const b2 = comparisons.find(value => value.policy === "b2")!;
          expect(current.walls, "current-policy blocking must be observed in this workload").toBeGreaterThan(0);
          expect(b2.walls, "B2 must reduce observed blocking before retention value is interpreted").toBeLessThan(current.walls);
        }
      });
    }
  }
}

for (const density of ["grid", "table", "justified"] as const) {
  test(`B2 acceptance product short-stop ${density}`, async ({ context }) => {
    await installB2AcceptanceRoutes(context, true);
    const page = await prepareB2AcceptancePage(context, density, false);
    try {
      const result = await page.evaluate(async density => {
        const store = (window as any).__kupua_store__;
        const source = store.getState().dataSource;
        const original = source.searchAfter;
        const before = store.getState();
        let reads = 0;
        let readsAfterStop = 0;
        let stopped = false;
        source.searchAfter = async function (...args: any[]) {
          reads++;
          if (stopped) readsAfterStop++;
          if (reads > 2) throw new Error("Product short-stop read budget exceeded");
          await new Promise(resolve => setTimeout(resolve, 900));
          return original.apply(this, args);
        };
        try {
          const driverPath = "/e2e-perf/density-browser.ts";
          const drivers = await import(driverPath);
          const localPage = { evaluate: (callback: any, argument: any) => callback(argument) };
          const motion = await drivers.scrollAtSpeed(localPage, density, -4000, 1500,
            { measureBounds: true, maxDistancePx: 600 });
          stopped = true;
          const region = document.querySelector<HTMLElement>(`[aria-label="Image results ${density}"]`)!;
          const anchorId = (window as any).__kupua_getViewportAnchorId__();
          const anchorTop = () => {
            const element = [...region.querySelectorAll<HTMLElement>("[data-image-id]")]
              .find(cell => cell.dataset.imageId === anchorId);
            if (!element) return null;
            const translation = Number.parseFloat(getComputedStyle(element).translate.split(/\s+/)[1] ?? "0");
            return element.getBoundingClientRect().top - region.getBoundingClientRect().top -
              (Number.isFinite(translation) ? translation : 0);
          };
          const initialTop = anchorTop();
          let maxAnchorDisplacement = 0;
          let missingAnchorSamples = 0;
          const deadline = performance.now() + 1600;
          while (performance.now() < deadline) {
            await new Promise(requestAnimationFrame);
            const top = anchorTop();
            if (top === null) missingAnchorSamples++;
            else if (initialTop !== null) maxAnchorDisplacement = Math.max(maxAnchorDisplacement, Math.abs(top - initialTop));
          }
          const media = await drivers.visibleMediaReadiness(localPage, density, motion.stoppedAtPerformanceMs, 4000);
          const after = store.getState();
          return { reads, readsAfterStop, distance: motion.drivenDistancePx,
            anchorPresent: initialTop !== null && anchorTop() !== null, maxAnchorDisplacement, missingAnchorSamples,
            pending: Number(after._extendBackwardInFlight) + Number(after._extendForwardInFlight),
            mediaCensored: media.mediaCensored, countDelta: after.results.length - before.results.length,
            offsetDelta: after.bufferOffset - before.bufferOffset };
        } finally { source.searchAfter = original; }
      }, density);
      expect(result.distance).toBe(-600);
      expect(result.reads).toBe(density === "justified" ? 0 : 1);
      expect(result.readsAfterStop).toBe(0);
      expect(result.pending).toBe(0);
      expect(result.mediaCensored).toBe(0);
      expect(result.anchorPresent).toBe(true);
      expect(result.missingAnchorSamples).toBe(0);
      expect(result.maxAnchorDisplacement).toBeLessThanOrEqual(1);
      expect(result.countDelta).toBe(density === "justified" ? 0 : 200);
      expect(result.offsetDelta).toBe(density === "justified" ? 0 : -200);
    } finally { await page.close(); }
  });
}

for (const workload of ["short-stop", "negative-control", "fast", "slow-reversal"] as const) {
  for (const candidateFirst of [false, true]) {
    test(`B2 acceptance Table ${workload} ${candidateFirst ? "candidate-first" : "current-first"}`, async ({ context }) => {
      await installB2AcceptanceRoutes(context);
      let reference: unknown;
      const readCounts: number[] = [];
      for (const candidate of candidateFirst ? [true, false] : [false, true]) {
        const page = await prepareB2AcceptancePage(context, "table", workload !== "short-stop");
        try {
          const initial = await page.evaluate(() => {
            const state = (window as any).__kupua_store__.getState();
            const region = document.querySelector<HTMLElement>('[aria-label="Image results table"]')!;
            return { ids: state.results.map((image: any) => image?.id), offset: state.bufferOffset,
              total: state.total, scrollTop: region.scrollTop, width: region.clientWidth, height: region.clientHeight };
          });
          if (reference === undefined) reference = initial;
          else expect(initial, "matched Table window and starting placement").toEqual(reference);
          const result = await page.evaluate(async ({ candidate, workload }) => {
            const driverPath = "/e2e-perf/density-browser.ts";
            const thumbnailPath = "/e2e-perf/thumbnail-probe.mjs";
            const velocityPath = "/src/hooks/useDataWindow.ts";
            const drivers = await import(driverPath);
            const thumbnails = await import(thumbnailPath);
            const velocity = await import(velocityPath);
            const store = (window as any).__kupua_store__;
            const source = store.getState().dataSource;
            const original = source.searchAfter;
            const reads: { backward: boolean; durationMs: number | null }[] = [];
            let retainedMax = store.getState().results.length;
            const unsubscribe = store.subscribe((state: any) => { retainedMax = Math.max(retainedMax, state.results.length); });
            source.searchAfter = async function (...args: any[]) {
              if (reads.length >= 8) throw new Error("Table acceptance read budget exceeded");
              const read = { backward: Boolean(args[4]), durationMs: null as number | null };
              reads.push(read);
              const started = performance.now();
              try {
                await new Promise(resolve => setTimeout(resolve, workload === "short-stop" ? 100 : workload === "slow-reversal" ? 900 : 350));
                return await original.apply(this, args);
              } finally { read.durationMs = performance.now() - started; }
            };
            const localPage = { evaluate: (callback: any, argument: any) => callback(argument) };
            velocity._resetForwardVelocity();
            (window as any).__b2AcceptanceCandidate = candidate;
            try {
              if (workload !== "short-stop") {
                const rate = workload === "negative-control" ? 100 : 200;
                const capture = await drivers.captureDensityJourney({ density: "table", direction: -1,
                  durationMs: 3000, resultsPerSecond: rate, loadSteps: [rate, rate, rate],
                  recoveryTimeoutMs: 4000, reverseDurationMs: workload === "slow-reversal" ? 1500 : 0,
                  networkConstrained: false });
                const endpointUnfinishedReads = reads.filter(read => read.durationMs === null).length;
                const region = document.querySelector<HTMLElement>('[aria-label="Image results table"]')!;
                const anchorId = (window as any).__kupua_getViewportAnchorId__();
                const anchorElement = () => [...region.querySelectorAll<HTMLElement>("[data-image-id]")]
                  .find(cell => cell.dataset.imageId === anchorId);
                const anchor = () => {
                  const element = anchorElement();
                  if (!element) return null;
                  const rawTop = element.getBoundingClientRect().top - region.getBoundingClientRect().top;
                  const parsedTranslate = Number.parseFloat(getComputedStyle(element).translate.split(/\s+/)[1] ?? "0");
                  const translateY = Number.isFinite(parsedTranslate) ? parsedTranslate : 0;
                  return { rawTop, translateY, layoutTop: rawTop - translateY,
                    arriving: element.classList.contains("anim-arriving"), scrollTop: region.scrollTop };
                };
                const anchorInitial = anchor();
                const calibrationElement = anchorElement();
                let layoutCalibrationPx: number | null = null;
                if (calibrationElement) {
                  const saved = { value: calibrationElement.style.getPropertyValue("transform"),
                    priority: calibrationElement.style.getPropertyPriority("transform") };
                  const before = anchor();
                  try {
                    calibrationElement.style.setProperty("transform", `${saved.value} translateY(8px)`, "important");
                    const shifted = anchor();
                    if (before && shifted) layoutCalibrationPx = shifted.layoutTop - before.layoutTop;
                  } finally {
                    if (saved.value) calibrationElement.style.setProperty("transform", saved.value, saved.priority);
                    else calibrationElement.style.removeProperty("transform");
                  }
                }
                const stoppedAt = capture.stoppedEpoch - performance.timeOrigin;
                const remaining = 1500 - (performance.now() - stoppedAt);
                if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
                const postStopMedia = await drivers.visibleMediaReadiness(localPage, "table", stoppedAt, 4000);
                const readsAtIdle = reads.length;
                await new Promise(resolve => setTimeout(resolve, 500));
                const anchorFinal = anchor();
                return { metrics: { ...capture.metrics, endpointUnfinishedReads,
                  postStopMediaCensored: postStopMedia.mediaCensored,
                  postStopMediaReadyMs: postStopMedia.mediaReadyMs,
                  postStopRefillsPending: Number(store.getState()._extendBackwardInFlight) + Number(store.getState()._extendForwardInFlight),
                  idleReadStarts: reads.length - readsAtIdle,
                  postStopAnchorRetained: Number(Boolean(anchorInitial && anchorFinal)),
                  postStopAnchorDisplacementPx: anchorInitial && anchorFinal ? Math.abs(anchorFinal.layoutTop - anchorInitial.layoutTop) : null,
                  postStopAnchorRawDisplacementPx: anchorInitial && anchorFinal ? Math.abs(anchorFinal.rawTop - anchorInitial.rawTop) : null,
                  postStopAnchorInitialTranslatePx: anchorInitial?.translateY ?? null,
                  postStopAnchorFinalTranslatePx: anchorFinal?.translateY ?? null,
                  postStopAnchorInitiallyArriving: Number(anchorInitial?.arriving ?? false),
                  postStopAnchorScrollDeltaPx: anchorInitial && anchorFinal ? anchorFinal.scrollTop - anchorInitial.scrollTop : null,
                  postStopAnchorLayoutCalibrationPx: layoutCalibrationPx },
                  reads, retainedMax };
              }
              const starts: number[] = [];
              const stopListening = store.subscribe((state: any, previous: any) => {
                if (state._extendBackwardInFlight && !previous._extendBackwardInFlight) starts.push(performance.now());
              });
              try {
                thumbnails.installThumbnailProbe({ density: "table" });
                const motion = await drivers.scrollAtSpeed(localPage, "table", -4000, 1500,
                  { measureBounds: true, maxDistancePx: 600 });
                const exposure = (window as any).__kupua_thumbnailProbe.stop();
                const media = await drivers.visibleMediaReadiness(localPage, "table", motion.stoppedAtPerformanceMs, 4000);
                const remaining = 1500 - (performance.now() - motion.stoppedAtPerformanceMs);
                if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
                return { metrics: { ...exposure, ...motion, stopMediaCensored: media.mediaCensored,
                  stopMediaReadyMs: media.mediaReadyMs, readStartsAfterStop: starts.filter(time => time >= motion.stoppedAtPerformanceMs).length,
                  refillsPendingAtEnd: Number(store.getState()._extendBackwardInFlight) + Number(store.getState()._extendForwardInFlight) },
                  reads, retainedMax };
              } finally { stopListening(); }
            } finally {
              (window as any).__b2AcceptanceCandidate = false;
              source.searchAfter = original;
              unsubscribe();
              (window as any).__densityJourney?.dispose();
              (window as any).__kupua_thumbnailProbe?.dispose();
            }
          }, { candidate, workload });
          console.log(JSON.stringify({ fixture: "B2-Table-acceptance", workload, candidateFirst, candidate,
            initialCount: initial.ids.length, ...result }));
          expect(result.retainedMax).toBeLessThanOrEqual(1000);
          readCounts[Number(candidate)] = result.reads.length;
          if (workload === "short-stop") {
            expect(result.metrics.stopMediaCensored).toBe(0);
            expect(result.metrics.refillsPendingAtEnd).toBe(0);
            expect(result.metrics.readStartsAfterStop).toBe(0);
            expect(result.metrics.drivenDistancePx).toBe(-600);
            expect(result.reads.length).toBeLessThanOrEqual(candidate ? 1 : 0);
          } else {
            expect(result.metrics.postStopMediaCensored).toBe(0);
            expect(result.metrics.postStopRefillsPending).toBe(0);
            expect(result.metrics.idleReadStarts).toBe(0);
            expect(result.metrics.postStopAnchorRetained).toBe(1);
            expect(result.metrics.postStopAnchorLayoutCalibrationPx).toBeCloseTo(8, 1);
            expect(result.metrics.postStopAnchorDisplacementPx).toBeLessThanOrEqual(1);
            expect(result.metrics.peakRefillsInFlight).toBeLessThanOrEqual(2);
            expect(result.metrics.initialBufferCount).toBe(1000);
            if (workload === "negative-control") {
              for (const prefix of ["early", "middle", "late"]) expect(result.metrics[prefix + "BufferEdgeBlockedMs"]).toBe(0);
            }
          }
        } finally { await page.close(); }
      }
      expect(readCounts[1]).toBeLessThanOrEqual(readCounts[0] + 1);
    });
  }
}

for (const density of ["grid", "justified", "table"] as const) {
  test(`B2 acceptance settled far seek ${density}`, async ({ context }) => {
    await installB2AcceptanceRoutes(context);
    let reference: unknown;
    for (const candidate of [false, true]) {
      const page = await prepareB2AcceptancePage(context, density, false);
      try {
        const result = await page.evaluate(async ({ density, candidate }) => {
          const store = (window as any).__kupua_store__;
          const extensions = { forward: 0, backward: 0 };
          const unsubscribe = store.subscribe((state: any, previous: any) => {
            if (state._extendForwardInFlight && !previous._extendForwardInFlight) extensions.forward++;
            if (state._extendBackwardInFlight && !previous._extendBackwardInFlight) extensions.backward++;
          });
          (window as any).__b2AcceptanceCandidate = candidate;
          try {
            const generation = store.getState()._seekGeneration;
            await store.getState().seek(52000);
            const driverPath = "/e2e-perf/density-browser.ts";
            const drivers = await import(driverPath);
            const localPage = { evaluate: (callback: any, argument: any) => callback(argument) };
            const media = await drivers.visibleMediaReadiness(localPage, density, performance.now(), 4000);
            await new Promise(resolve => setTimeout(resolve, 1500));
            const state = store.getState();
            const region = document.querySelector<HTMLElement>(`[aria-label="Image results ${density}"]`)!;
            const bounds = region.getBoundingClientRect();
            return { generationAdvanced: state._seekGeneration > generation, error: Boolean(state.error),
              count: state.results.length, offset: state.bufferOffset, ids: state.results.map((image: any) => image?.id),
              scrollTop: region.scrollTop, visible: [...region.querySelectorAll<HTMLElement>("[data-image-id]")].filter(cell => {
                const box = cell.getBoundingClientRect();
                return box.bottom > bounds.top && box.top < bounds.bottom;
              }).map(cell => cell.dataset.imageId), extensions, mediaCensored: media.mediaCensored };
          } finally { unsubscribe(); (window as any).__b2AcceptanceCandidate = false; }
        }, { density, candidate });
        expect(result.generationAdvanced).toBe(true);
        expect(result.error).toBe(false);
        expect(result.mediaCensored).toBe(0);
        expect(result.extensions).toEqual({ forward: 0, backward: 0 });
        if (reference === undefined) reference = result;
        else expect(result, "same far destination, placement and extension demand").toEqual(reference);
        console.log(JSON.stringify({ fixture: "B2-settled-far-seek", density, candidate,
          count: result.count, visibleCount: result.visible.length, extensions: result.extensions,
          mediaCensored: result.mediaCensored, generationAdvanced: result.generationAdvanced }));
      } finally { await page.close(); }
    }
  });
}

function installGridCellCounter() {
  const counter: any = { active: false, stats: null,
    wrapMemo(memo: any, component: any) {
      function CountedGridCell(props: any) {
        if (counter.active && props.image) {
          counter.stats.renders++;
          counter.stats.unique.add(props.image.id);
        }
        return component(props);
      }
      return memo(CountedGridCell, (previous: any, next: any) => {
        const keys = Object.keys(previous);
        const same = keys.length === Object.keys(next).length && keys.every(key => Object.is(previous[key], next[key]));
        if (counter.active && previous.image && previous.image === next.image) {
          counter.stats.retainedComparisons++;
          if (same) counter.stats.retainedSkipped++;
          for (const key of keys) {
            if (!Object.is(previous[key], next[key])) counter.stats.changes[key] = (counter.stats.changes[key] ?? 0) + 1;
          }
        }
        return same;
      });
    },
  };
  (window as any).__gridCellCounter = counter;
}

for (const density of ["grid", "justified"] as const) {
  for (const workload of [
    { name: "short-stop", delay: 100, backwardDurationMs: 1500, backwardDistancePx: 600, forwardDurationMs: 0, capacity: false },
    { name: "sustained-fast-delivery", delay: 350, backwardDurationMs: 3000, forwardDurationMs: 0, capacity: false },
    { name: "sustained", delay: 900, backwardDurationMs: 3000, forwardDurationMs: 0, capacity: false },
    { name: "reversal", delay: 900, backwardDurationMs: 3000, forwardDurationMs: 1500, capacity: false },
    { name: "capacity-reversal", delay: 900, backwardDurationMs: 3000, forwardDurationMs: 1500, capacity: true },
    { name: "latency-runway", delay: 900, backwardDurationMs: 6000, forwardDurationMs: 0, capacity: false },
    { name: "latency-forward", delay: 900, backwardDurationMs: 0, forwardDurationMs: 6000, capacity: false },
    { name: "latency-entry", delay: 900, backwardDurationMs: 3000, forwardDurationMs: 0, capacity: false },
    { name: "latency-short-stop", delay: 100, backwardDurationMs: 1500, backwardDistancePx: 600, forwardDurationMs: 0, capacity: false },
  ]) {
    const latencyForward = workload.name === "latency-forward";
    const latencyRunway = workload.name === "latency-runway" || latencyForward;
    const latencyResearch = workload.name.startsWith("latency-");
    if (latencyResearch && !latencyRunway && density === "grid") continue;
    for (const candidateFirst of [false, true]) {
      test(`B2 local ${density} ${workload.name} ${candidateFirst ? "candidate-first" : "current-first"}`, async ({ context }) => {
        let policy = "current";
        let policyLoads = 0;
        let mediaLoads = 0;
        await context.route("**/*", async route => {
          const url = new URL(route.request().url());
          const local = url.origin === "http://127.0.0.1:3041";
          if (local && url.pathname.startsWith("/b2-thumbnail/")) {
            return route.fulfill({ contentType: "image/svg+xml", body:
              '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><path fill="#567" d="M0 0h400v300H0z"/></svg>' });
          }
          if (local && url.pathname === "/src/hooks/useDataWindow.ts") {
            const response = await route.fetch();
            const served = await response.text();
            const shipped = "rangeStartMatchesViewport && startIndex <= backwardThreshold && offset > 0";
            expect(served.split(shipped)).toHaveLength(2);
            const original = "rangeStartMatchesViewport && startIndex <= EXTEND_THRESHOLD && offset > 0";
            const source = served.replace(shipped, original);
            policyLoads++;
            if (latencyForward) {
              const forward = "Math.max(0, velocityEma) * VELOCITY_LOOKAHEAD_MS";
              expect(source.split(forward)).toHaveLength(2);
              return route.fulfill({ response, body: policy === "current" ? source : source.replace(forward,
                "Math.max(0, velocityEma) * (globalThis.__b2Local?.active === true ? 1000 : VELOCITY_LOOKAHEAD_MS)") });
            }
            const threshold = latencyResearch && policy === "candidate"
              ? "Math.min(PAGE_SIZE, EXTEND_THRESHOLD + Math.max(0, -_velocityEma) * 1000)"
              : "forwardExtendThreshold(-_velocityEma)";
            return route.fulfill({ response, body: policy === "current" && !latencyResearch ? source : source.replace(original,
              `rangeStartMatchesViewport && startIndex <= (globalThis.__b2Local?.active === true ? ${threshold} : EXTEND_THRESHOLD) && offset > 0`) });
          }
          if (local && url.pathname === "/src/lib/image-urls.ts") {
            const response = await route.fetch();
            const source = await response.text();
            const original = "if (!S3_PROXY_ENABLED) return undefined;";
            expect(source.split(original)).toHaveLength(2);
            const enabled = "S3_PROXY_ENABLED || SYNTHETIC_PREVIEW_ENABLED";
            expect(source.split(enabled)).toHaveLength(2);
            mediaLoads++;
            return route.fulfill({ response, body: source.replace(original, 'return "/b2-thumbnail/" + image.id;')
              .replace(enabled, "true") });
          }
          const asset = local && !/^\/(es|api|grid-|s3|imgproxy|bedrock)/.test(url.pathname);
          return asset ? route.continue() : route.fulfill({ status: 404, body: "isolated fixture" });
        });
        let reference: unknown;
        const measurements: Record<string, Record<string, number | null>> = {};
        for (policy of candidateFirst ? ["candidate", "current"] : ["current", "candidate"]) {
          const page = await context.newPage();
          const previousLoads = { policyLoads, mediaLoads };
          await page.goto("/search?nonFree=true");
          await page.waitForFunction(() => Boolean((window as any).__kupua_store__));
          await page.evaluate(async () => {
            const path = "/src/dal/mock-data-source.ts";
            const { MockDataSource } = await import(path);
            const store = (window as any).__kupua_store__;
            store.setState({ dataSource: new MockDataSource(70000) });
            await store.getState().search();
            const setup = { phase: "source", overflow: false,
              events: [] as { phase: string; backward: boolean; published: boolean; count: number; offset: number }[],
              unsubscribe: () => {} };
            setup.unsubscribe = store.subscribe((state: any, previous: any) => {
              const backward = state._extendBackwardInFlight && !previous._extendBackwardInFlight;
              const published = state.results !== previous.results;
              if (!backward && !published) return;
              if (setup.events.length >= 32) { setup.overflow = true; return; }
              setup.events.push({ phase: setup.phase, backward, published,
                count: state.results.length, offset: state.bufferOffset });
            });
            (window as any).__b2Setup = setup;
          });
          expect(policyLoads).toBeGreaterThan(previousLoads.policyLoads);
          expect(mediaLoads).toBeGreaterThan(previousLoads.mediaLoads);
          await establishDensitySource(page);
          await page.evaluate(() => { (window as any).__b2Setup.phase = "density"; });
          await selectDensity(page, density);
          await page.evaluate(() => { (window as any).__b2Setup.phase = "recovery"; });
          await prepareDensityRecovery(page, density);
          if (workload.capacity) await prepareDensityMaintenance(page, density);
          if (latencyRunway) {
            await page.evaluate(async forward => {
              (window as any).__b2Setup.phase = "ready-runway";
              const state = (window as any).__kupua_store__.getState();
              await (forward ? state.extendForward() : state.extendBackward());
            }, latencyForward);
            await waitForPlacement(page, density, true);
            await waitForDensityMaintenanceCooldown(page);
          }
          const setup = await page.evaluate(() => {
            const setup = (window as any).__b2Setup;
            setup.unsubscribe();
            delete (window as any).__b2Setup;
            return { events: setup.events, overflow: setup.overflow };
          });
          expect(setup.overflow).toBe(false);
          const initial = await page.evaluate(density => {
            const state = (window as any).__kupua_store__.getState();
            const region = document.querySelector<HTMLElement>(`[aria-label="Image results ${density}"]`)!;
            const bounds = region.getBoundingClientRect();
            const visible = [...region.querySelectorAll<HTMLElement>("[data-image-id]")].map(cell => {
              const rect = cell.getBoundingClientRect();
              const top = rect.top - bounds.top - parseFloat(getComputedStyle(cell).translate.split(/\s+/)[1] ?? "0");
              return { id: cell.dataset.imageId, index: state.imagePositions.get(cell.dataset.imageId) - state.bufferOffset,
                top: Math.round(top * 1000) / 1000, left: rect.left - bounds.left, width: rect.width, height: rect.height };
            }).filter(cell => cell.top < bounds.height && cell.top + cell.height > 0);
            return { ids: state.results.map((image: any) => image?.id), offset: state.bufferOffset,
              total: state.total, params: state.params, visible, scrollTop: region.scrollTop,
              headroom: Math.min(...visible.map(cell => cell.index)), viewport: [bounds.width, bounds.height],
              dpr: devicePixelRatio, focused: state.focusedImageId };
          }, density);
          console.log(JSON.stringify({ fixture: "B2-setup", density, policy, workload: workload.name,
            initialCount: initial.ids.length, headroom: initial.headroom, ...setup }));
          if (reference === undefined) reference = initial;
          else {
            const changed = Object.keys(initial).filter(key => JSON.stringify(initial[key as keyof typeof initial]) !==
              JSON.stringify((reference as typeof initial)[key as keyof typeof initial]));
            expect(changed, "exact paired window and geometry (translated positions rounded to 0.001px)").toEqual([]);
          }
          const ready = await densityDrivers.visibleMediaReadiness(page, density,
            await page.evaluate(() => performance.now()));
          expect(ready.mediaCensored).toBe(0);
          await page.evaluate(async ({ density, delay, traceStability }) => {
            const store = (window as any).__kupua_store__;
            const source = store.getState().dataSource;
            const original = source.searchAfter;
            const probe = { active: false, publications: [] as Set<string>[], exposed: new Set<string>(),
              maxRetained: store.getState().results.length, minRetained: store.getState().results.length,
              reads: 0, pending: 0, peak: 0, overflow: false, frame: 0, unsubscribe: () => {},
              stability: { frames: 0, sharedImages: 0, maxHorizontalPx: 0, maxSizePx: 0,
                maxRelativeVerticalPx: 0, sourceChanges: 0, ratioSamples: 0, maxVisibleAspectError: 0 },
              calibration: null as { horizontalPx: number; sizePx: number } | null,
              restore: () => { source.searchAfter = original; } };
            source.searchAfter = async (...args: unknown[]) => {
              if (++probe.reads > 12) { probe.overflow = true; throw new Error("Bounded B2 read budget exceeded"); }
              probe.peak = Math.max(probe.peak, ++probe.pending);
              try {
                await new Promise(resolve => setTimeout(resolve, delay));
                return await original.apply(source, args);
              } finally { probe.pending--; }
            };
            probe.unsubscribe = store.subscribe((state: any, previous: any) => {
              probe.maxRetained = Math.max(probe.maxRetained, state.results.length);
              probe.minRetained = Math.min(probe.minRetained, state.results.length);
              if (state.results === previous.results) return;
              const previousIds = new Set(previous.results.map((image: any) => image?.id));
              probe.publications.push(new Set<string>(state.results
                .filter((image: any) => image && !previousIds.has(image.id)).map((image: any) => image.id)));
              if (probe.publications.length > 12) probe.overflow = true;
            });
            let previousGeometry = new Map<string, { top: number; left: number; width: number; height: number; source: string | null }>();
            const sample = () => {
              const region = document.querySelector(`[aria-label="Image results ${density}"]`)!;
              const bounds = region.getBoundingClientRect();
              const currentState = store.getState();
              const geometry = new Map<string, { top: number; left: number; width: number; height: number; source: string | null }>();
              for (const cell of region.querySelectorAll<HTMLElement>("[data-image-id]")) {
                const rect = cell.getBoundingClientRect();
                if (rect.bottom > bounds.top && rect.top < bounds.bottom) {
                  probe.exposed.add(cell.dataset.imageId!);
                  if (traceStability) geometry.set(cell.dataset.imageId!, {
                    top: rect.top - parseFloat(getComputedStyle(cell).translate.split(/\s+/)[1] ?? "0"),
                    left: rect.left, width: rect.width, height: rect.height,
                    source: cell.querySelector("img")?.getAttribute("src") ?? null,
                  });
                  if (traceStability) {
                    const image = cell.querySelector("img");
                    const record = currentState.results[currentState.imagePositions.get(cell.dataset.imageId) - currentState.bufferOffset];
                    const dimensions = record?.source.orientedDimensions ?? record?.source.dimensions;
                    if (image?.complete && image.naturalWidth > 0 && dimensions) {
                      const imageBox = density === "justified" ? rect : image.getBoundingClientRect();
                      const expectedRatio = density === "justified" ? dimensions.width / dimensions.height : image.naturalWidth / image.naturalHeight;
                      probe.stability.ratioSamples++;
                      probe.stability.maxVisibleAspectError = Math.max(probe.stability.maxVisibleAspectError,
                        Math.abs(imageBox.width / imageBox.height - expectedRatio));
                    }
                  }
                }
              }
              if (traceStability) {
                if (geometry.size > 128 || ++probe.stability.frames > 2048) { probe.overflow = true; return; }
                const shared = [...geometry].filter(([id]) => previousGeometry.has(id));
                const translation = shared.length ? shared[0][1].top - previousGeometry.get(shared[0][0])!.top : 0;
                for (const [id, current] of shared) {
                  const previous = previousGeometry.get(id)!;
                  probe.stability.sharedImages++;
                  probe.stability.maxHorizontalPx = Math.max(probe.stability.maxHorizontalPx, Math.abs(current.left - previous.left));
                  probe.stability.maxSizePx = Math.max(probe.stability.maxSizePx,
                    Math.abs(current.width - previous.width), Math.abs(current.height - previous.height));
                  probe.stability.maxRelativeVerticalPx = Math.max(probe.stability.maxRelativeVerticalPx,
                    Math.abs(current.top - previous.top - translation));
                  probe.stability.sourceChanges += Number(current.source !== previous.source);
                }
                previousGeometry = geometry;
              }
              if (probe.exposed.size > 4096) { probe.overflow = true; return; }
              probe.frame = requestAnimationFrame(sample);
            };
            sample();
            (window as any).__b2Local = probe;
            if (traceStability) {
              const region = document.querySelector(`[aria-label="Image results ${density}"]`)!;
              const bounds = region.getBoundingClientRect();
              const target = [...region.querySelectorAll<HTMLElement>("[data-image-id]")].find(cell => {
                const rect = cell.getBoundingClientRect();
                return rect.bottom > bounds.top && rect.top < bounds.bottom;
              })!;
              const saved = ["left", "width"].map(property => ({ property,
                value: target.style.getPropertyValue(property), priority: target.style.getPropertyPriority(property) }));
              try {
                target.style.setProperty("left", "8px", "important");
                target.style.setProperty("width", `${target.getBoundingClientRect().width + 8}px`, "important");
                await new Promise(requestAnimationFrame);
                await new Promise(requestAnimationFrame);
                probe.calibration = { horizontalPx: probe.stability.maxHorizontalPx, sizePx: probe.stability.maxSizePx };
                if (probe.calibration.horizontalPx < 7 || probe.calibration.sizePx < 7) {
                  throw new Error("Retained geometry calibration did not detect the injected displacement/resize");
                }
              } finally {
                for (const savedStyle of saved) {
                  if (savedStyle.value) target.style.setProperty(savedStyle.property, savedStyle.value, savedStyle.priority);
                  else target.style.removeProperty(savedStyle.property);
                }
              }
              await new Promise(requestAnimationFrame);
              await new Promise(requestAnimationFrame);
              previousGeometry = new Map();
              Object.assign(probe.stability, { frames: 0, sharedImages: 0, maxHorizontalPx: 0, maxSizePx: 0,
                maxRelativeVerticalPx: 0, sourceChanges: 0, ratioSamples: 0, maxVisibleAspectError: 0 });
            }
            const path = "/src/hooks/useDataWindow.ts";
            (await import(path))._resetForwardVelocity();
            probe.active = true;
          }, { density, delay: workload.delay, traceStability: latencyResearch });
          try {
            const metrics = await measureDensityRecovery(page, density,
              { ...workload, postStopObservationMs: 1500 });
            const cost = await page.evaluate(() => {
              const probe = (window as any).__b2Local;
              return { reads: probe.reads, pending: probe.pending, peak: probe.peak,
                maxRetained: probe.maxRetained, minRetained: probe.minRetained,
                overflow: Number(probe.overflow), publications: probe.publications.length,
                unexposedPages: probe.publications.filter((ids: Set<string>) =>
                  ![...ids].some(id => probe.exposed.has(id))).length };
            });
            expect(cost.overflow).toBe(0);
            expect(cost.maxRetained).toBeLessThanOrEqual(1000);
            expect(cost.peak).toBeLessThanOrEqual(2);
            expect(cost.pending).toBe(0);
            if (latencyResearch && (metrics.stopDataCensored || metrics.stopMediaCensored)) {
              console.log(JSON.stringify({ fixture: "B2-runway-censored", density, policy, candidateFirst,
                metrics, cost, stability: await page.evaluate(() => (window as any).__b2Local.stability) }));
            }
            if (!latencyResearch || (workload.name === "latency-runway" && (density === "grid" || policy === "candidate"))) {
              expect(metrics.stopDataCensored).toBe(0);
              expect(metrics.stopMediaCensored).toBe(0);
            } else {
              expect([0, 1]).toContain(metrics.stopDataCensored);
              expect([0, 1]).toContain(metrics.stopMediaCensored);
              if (metrics.stopDataCensored) expect(metrics.stopDataReadyMs).toBeNull();
              if (metrics.stopMediaCensored) expect(metrics.stopMediaReadyMs).toBeNull();
            }
            expect(metrics.refillsPendingAtEnd).toBe(0);
            expect(metrics.peakRefillsInFlight).toBeLessThanOrEqual(2);
            if (workload.name === "short-stop") {
              expect(metrics.drivenDistancePx).toBe(600);
              expect(cost.reads).toBeLessThanOrEqual(policy === "candidate" ? 1 : 0);
              expect(metrics.readStartsAfterStop).toBe(0);
            }
            if (workload.name === "latency-short-stop") {
              expect(metrics.drivenDistancePx).toBe(600);
              expect(cost.reads).toBeLessThanOrEqual(1);
              expect(metrics.readStartsAfterStop).toBe(0);
            }
            if (workload.capacity) expect(cost.minRetained).toBeGreaterThanOrEqual(995);
            if (latencyResearch) {
              const stability = await page.evaluate(() => (window as any).__b2Local.stability);
              expect(stability.sharedImages).toBeGreaterThan(0);
              expect(stability.sourceChanges).toBe(0);
              expect(stability.ratioSamples).toBeGreaterThan(0);
              expect(stability.maxVisibleAspectError).toBeLessThan(0.001);
              if (workload.name === "latency-runway" && (density === "grid" || policy === "candidate")) {
                expect(stability.maxHorizontalPx).toBeLessThanOrEqual(1);
                expect(stability.maxSizePx).toBeLessThanOrEqual(1);
                expect(stability.maxRelativeVerticalPx).toBeLessThanOrEqual(1);
              }
              console.log(JSON.stringify({ fixture: "B2-runway-stability", density, policy, candidateFirst,
                workload: workload.name, observerRevision: 2,
                calibration: await page.evaluate(() => (window as any).__b2Local.calibration),
                predictionMs: policy === "candidate" ? 1000 : 400, initialCount: initial.ids.length,
                initialHeadroom: initial.headroom, readyRunwayPages: latencyRunway ? 1 : 0,
                initialDirectionalRunway: latencyForward ? initial.ids.length - 1 - Math.max(...initial.visible.map(cell => cell.index)) : initial.headroom,
                stableGeometry: Number(stability.maxHorizontalPx <= 1 && stability.maxSizePx <= 1 && stability.maxRelativeVerticalPx <= 1),
                endpointSupported: Number(metrics.stopDataCensored === 0 && metrics.stopMediaCensored === 0), stability }));
            }
            measurements[policy] = { ...metrics, ...cost };
            console.log(JSON.stringify({ fixture: "B2-local", density, workload: workload.name,
              candidateFirst, policy, delayMs: workload.delay, initialCount: initial.ids.length,
              headroom: initial.headroom, metrics: measurements[policy] }));
          } finally {
            await page.evaluate(() => {
              const probe = (window as any).__b2Local;
              probe?.unsubscribe();
              probe?.restore();
              if (probe) cancelAnimationFrame(probe.frame);
              delete (window as any).__b2Local;
            });
            await page.close();
          }
        }
        console.log(JSON.stringify({ fixture: "B2-local-pair", density, workload: workload.name, candidateFirst,
          blockingDeltaMs: measurements.candidate.bufferEdgeBlockedMs! - measurements.current.bufferEdgeBlockedMs!,
          drivenDeltaPx: measurements.candidate.drivenDistancePx! - measurements.current.drivenDistancePx!,
          readDelta: measurements.candidate.reads! - measurements.current.reads! }));
      });
    }
  }
}

async function installJourneyFixtureRoutes(context: BrowserContext) {
  await context.route("**/*", async route => {
    const url = new URL(route.request().url());
    const local = url.origin === "http://127.0.0.1:3041";
    if (local && url.pathname === "/src/lib/image-urls.ts") {
      const response = await route.fetch();
      const source = await response.text();
      const original = "if (!S3_PROXY_ENABLED) return undefined;";
      expect(source.split(original)).toHaveLength(2);
      return route.fulfill({ response, body: source.replace(original,
        'return "data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'40\' height=\'30\'%3E%3Cpath fill=\'blue\' d=\'M0 0h40v30H0z\'/%3E%3C/svg%3E#" + image.id;')
        .replace("S3_PROXY_ENABLED || SYNTHETIC_PREVIEW_ENABLED", "true") });
    }
    return local && !/^\/(es|api|grid-|s3|imgproxy|bedrock)/.test(url.pathname)
      ? route.continue() : route.fulfill({ status: 404, body: "isolated fixture" });
  });
}

const f2DeliveryMatches = new Map<number, unknown>();

async function prepareRenderWorkWindow(page: Page, density: "grid" | "table" | "justified") {
  await page.goto("/search?nonFree=true");
  await page.waitForFunction(() => Boolean((window as any).__kupua_store__));
  await page.evaluate(async () => {
    const path = "/src/dal/mock-data-source.ts";
    const { MockDataSource } = await import(path);
    const store = (window as any).__kupua_store__;
    store.setState({ dataSource: new MockDataSource(70000) });
    await store.getState().search();
  });
  await selectDensity(page, density);
  await waitForDensityMaintenanceCooldown(page);
  await page.evaluate(async () => {
    await (window as any).__kupua_store__.getState().extendForward();
    const path = "/src/lib/image-urls.ts";
    const { getThumbnailUrl } = await import(path);
    const images = (window as any).__kupua_store__.getState().results.slice(0, 200);
    const retained: HTMLImageElement[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.all(images.map(async (image: any) => {
          const element = new Image();
          retained.push(element);
          element.src = getThumbnailUrl(image);
          await element.decode();
        })),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Warm media cap")), 10000); }),
      ]);
    } finally { clearTimeout(timer); }
    (window as any).__renderWorkWarm = retained;
  });
  await page.bringToFront();
  const ready = await densityDrivers.visibleMediaReadiness(page, density, await page.evaluate(() => performance.now()));
  expect(ready.mediaCensored).toBe(0);
}

function gridDetailCallbackPolicy(source: string, stable: boolean) {
  const syntax = ts.createSourceFile("ImageGrid.js", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let declaration: ts.VariableDeclaration | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(syntax) === "enterDetail") declaration = node;
    ts.forEachChild(node, visit);
  };
  visit(syntax);
  expect(declaration).toBeTruthy();
  const call = declaration!.initializer as ts.CallExpression;
  const callback = call.arguments[0] as ts.ArrowFunction;
  const body = callback.body as ts.Block;
  const dependencies = call.arguments[1] as ts.ArrayLiteralExpression;
  const hasRouteDependency = dependencies.elements.some(element => element.getText(syntax) === "searchParams");
  if (stable === !hasRouteDependency) return source;
  if (!stable) {
    const currentParams = body.statements.find(statement => ts.isVariableStatement(statement)
      && statement.declarationList.declarations.some(declaration => declaration.name.getText(syntax) === "currentParams"));
    expect(currentParams).toBeTruthy();
    const edits = [{ start: currentParams!.getStart(syntax), end: currentParams!.getEnd(), text: "" },
      { start: dependencies.getStart(syntax), end: dependencies.getEnd(),
        text: `[${dependencies.elements.map(element => element.getText(syntax)).join(", ")}, searchParams]` }];
    const references = (node: ts.Node) => {
      if (ts.isIdentifier(node) && node.text === "currentParams") edits.push({ start: node.getStart(syntax), end: node.getEnd(), text: "searchParams" });
      ts.forEachChild(node, references);
    };
    for (const statement of body.statements.filter(statement => statement !== currentParams)) references(statement);
    expect(edits).toHaveLength(4);
    let result = source;
    for (const edit of edits.sort((left, right) => right.start - left.start)) result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
    return result;
  }
  const edits = [{ start: body.getStart(syntax) + 1, end: body.getStart(syntax) + 1,
    text: "\nconst currentParams = searchParamsRef.current;\n" },
  { start: dependencies.getStart(syntax), end: dependencies.getEnd(),
    text: `[${dependencies.elements.filter(element => element.getText(syntax) !== "searchParams").map(element => element.getText(syntax)).join(", ")}]` }];
  const references = (node: ts.Node) => {
    if (ts.isIdentifier(node) && node.text === "searchParams") edits.push({ start: node.getStart(syntax), end: node.getEnd(), text: "currentParams" });
    ts.forEachChild(node, references);
  };
  references(body);
  expect(edits).toHaveLength(4);
  let result = source;
  for (const edit of edits.sort((left, right) => right.start - left.start)) result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  return result;
}

function loadReturnResearchControls() {
  const source = readFileSync(new URL("../perf.spec.ts", import.meta.url), "utf8");
  const syntax = ts.createSourceFile("perf.spec.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const names = ["injectPerfProbes", "resetPerfProbes", "collectPerfSnapshot", "waitForFocusedReturnStability"];
  const functions = names.map(name => {
    const declaration = syntax.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
    expect(declaration, `Existing P13b control ${name}`).toBeTruthy();
    let code = declaration!.getText(syntax);
    if (name === "waitForFocusedReturnStability") {
      expect(code.split("return;")).toHaveLength(2);
      code = code.replace("return;", `{ const clock = (window as any).__p13bResearch;
        if (clock) { clock.completedAt = performance.now(); performance.mark("p13b-research-complete"); }
        return; }`);
    }
    return code;
  });
  const compiled = ts.transpileModule(functions.join("\n"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return new Function("installNetworkProbe", `${compiled}\nreturn {${names.join(",")}};`)(installNetworkProbe) as {
    injectPerfProbes: (helpers: { page: Page }) => Promise<void>;
    resetPerfProbes: (helpers: { page: Page }) => Promise<void>;
    collectPerfSnapshot: (helpers: { page: Page }) => Promise<any>;
    waitForFocusedReturnStability: (page: Page, target: string, timeout?: number) => Promise<void>;
  };
}

function returnTraceSummary(events: any[], profile?: any) {
  const start = events.find(event => event.name === "p13b-research-start");
  const end = events.find(event => event.name === "p13b-research-complete");
  expect(start).toBeTruthy();
  expect(end).toBeTruthy();
  const first = start.ts, last = end.ts;
  const intervals = (names: string[]) => events.filter(event => event.pid === start.pid && event.tid === start.tid
    && event.ph === "X" && names.includes(event.name) && event.ts < last && event.ts + event.dur > first)
    .map(event => [Math.max(first, event.ts), Math.min(last, event.ts + event.dur)] as [number, number]);
  const union = (ranges: [number, number][]) => {
    let total = 0, right = -Infinity;
    for (const [left, end] of ranges.sort((left, right) => left[0] - right[0])) {
      total += Math.max(0, end - Math.max(left, right));
      right = Math.max(right, end);
    }
    return total / 1000;
  };
  const script = intervals(["FunctionCall", "EvaluateScript", "RunMicrotasks", "EventDispatch"]);
  const layout = intervals(["Layout", "UpdateLayoutTree", "RecalculateStyles"]);
  const paint = intervals(["Paint", "PrePaint", "Layerize", "CompositeLayers", "UpdateLayerTree"]);
  const decode = intervals(["Decode Image", "ImageDecodeTask", "ImageDecode"]);
  const overlap = script.flatMap(([left, right]) => [...layout, ...paint, ...decode]
    .filter(([otherLeft, otherRight]) => otherLeft < right && otherRight > left)
    .map(([otherLeft, otherRight]) => [Math.max(left, otherLeft), Math.min(right, otherRight)] as [number, number]));
  const layoutStacks = new Map<string, { count: number; ms: number; maxMs: number }>();
  const scriptCalls = new Map<string, { count: number; ms: number; maxMs: number }>();
  for (const event of events.filter(event => event.pid === start.pid && event.tid === start.tid
    && event.ph === "X" && event.name === "FunctionCall" && event.ts < last && event.ts + event.dur > first)) {
    const data = event.args?.data ?? {};
    const source = String(data.url ?? "").split("/").at(-1)?.split("?")[0] || "evaluated script";
    const key = `${data.functionName || "anonymous"} (${source})`;
    const record = scriptCalls.get(key) ?? { count: 0, ms: 0, maxMs: 0 };
    const duration = (Math.min(last, event.ts + event.dur) - Math.max(first, event.ts)) / 1000;
    record.count++;
    record.ms += duration;
    record.maxMs = Math.max(record.maxMs, duration);
    scriptCalls.set(key, record);
  }
  for (const event of events.filter(event => event.pid === start.pid && event.tid === start.tid
    && event.ph === "X" && ["Layout", "UpdateLayoutTree"].includes(event.name)
    && event.ts >= first && event.ts <= last)) {
    const frames = event.args?.beginData?.stackTrace ?? event.args?.data?.stackTrace ?? [];
    const stack = frames.slice(0, 4).map((frame: any) => frame.functionName || "anonymous").join(" > ") || "no synchronous stack";
    const key = `${event.name}: ${stack}`;
    const record = layoutStacks.get(key) ?? { count: 0, ms: 0, maxMs: 0 };
    record.count++;
    record.ms += event.dur / 1000;
    record.maxMs = Math.max(record.maxMs, event.dur / 1000);
    layoutStacks.set(key, record);
  }
  const cpuSelf = new Map<string, number>();
  const cpuStacks = new Map<string, number>();
  if (profile) {
    expect(profile.nodes.length).toBeLessThan(50000);
    expect(profile.samples.length).toBeLessThan(100000);
    const nodes = new Map<number, any>(profile.nodes.map((node: any) => [node.id, node]));
    const parents = new Map<number, number>();
    for (const node of profile.nodes) for (const child of node.children ?? []) parents.set(child, node.id);
    const label = (node: any) => `${node.callFrame.functionName || "anonymous"} (${String(node.callFrame.url ?? "").split("/").at(-1)?.split("?")[0] || "native/evaluated"})`;
    let time = profile.startTime;
    for (const [index, sample] of profile.samples.entries()) {
      const duration = profile.timeDeltas[index];
      time += duration;
      if (time < first || time > last) continue;
      const leaf = nodes.get(sample);
      const self = label(leaf);
      cpuSelf.set(self, (cpuSelf.get(self) ?? 0) + duration / 1000);
      const stack = [self];
      let ancestor = parents.get(sample);
      while (ancestor !== undefined && stack.length < 10) {
        stack.push(label(nodes.get(ancestor)));
        ancestor = parents.get(ancestor);
      }
      const key = stack.join(" > ");
      cpuStacks.set(key, (cpuStacks.get(key) ?? 0) + duration / 1000);
    }
    expect(cpuSelf.size).toBeGreaterThan(0);
  }
  return { boundaryMs: (last - first) / 1000, scriptInclusiveMs: union(script),
    scriptExcludingLayoutPaintDecodeMs: union(script) - union(overlap),
    layoutMs: union(layout), paintMs: union(paint), mainThreadDecodeMs: union(decode),
    classifiedMainThreadUnionMs: union([...script, ...layout, ...paint, ...decode]),
    scriptCalls: [...scriptCalls.entries()].sort((left, right) => right[1].ms - left[1].ms).slice(0, 8)
      .map(([callback, timing]) => ({ callback, ...timing })),
    cpuSelf: [...cpuSelf.entries()].sort((left, right) => right[1] - left[1]).slice(0, 12)
      .map(([callback, sampledMs]) => ({ callback, sampledMs })),
    cpuStacks: [...cpuStacks.entries()].sort((left, right) => right[1] - left[1]).slice(0, 8)
      .map(([stack, sampledMs]) => ({ stack, sampledMs })),
    layoutStacks: [...layoutStacks.entries()].sort((left, right) => right[1].ms - left[1].ms).slice(0, 8)
      .map(([stack, timing]) => ({ stack, ...timing })) };
}

const returnResearchCases = [
  ...[false, true, true, false, false, true, true, false].map((probes, index) => ({ name: `probe-comparison-${index + 1}`,
    probes, profiled: false, warmupReturns: 0, countCells: false, stable: false, regression: false })),
  { name: "cpu-diagnostic", probes: false, profiled: true, warmupReturns: 0, countCells: false, stable: false, regression: false },
  { name: "warm-diagnostic", probes: false, profiled: false, warmupReturns: 2, countCells: false, stable: false, regression: false },
  { name: "retained-cells-first", probes: false, profiled: false, warmupReturns: 0, countCells: true, stable: false, regression: false },
  { name: "retained-cells-warm", probes: false, profiled: false, warmupReturns: 2, countCells: true, stable: false, regression: false },
  { name: "stable-cells-first", probes: false, profiled: false, warmupReturns: 0, countCells: true, stable: true, regression: false },
  { name: "stable-cells-warm", probes: false, profiled: false, warmupReturns: 2, countCells: true, stable: true, regression: false },
  { name: "production-regression", probes: false, profiled: false, warmupReturns: 0, countCells: true, stable: true, regression: true },
  ...Array.from({ length: 4 }, (_, index) => ({ name: `production-remeasure-${index + 1}`,
    probes: true, profiled: false, warmupReturns: 0, countCells: false, stable: true, regression: false })),
  { name: "untraced-historical", probes: true, profiled: false, warmupReturns: 0, countCells: false, stable: false, regression: false },
  { name: "untraced-production", probes: true, profiled: false, warmupReturns: 0, countCells: false, stable: true, regression: false },
];
for (const [repetition, scenario] of returnResearchCases.entries()) {
  const { probes, profiled, warmupReturns, countCells, stable: stabilizeEnterDetail, regression: productionRegression } = scenario;
  const traced = !scenario.name.startsWith("untraced-");
  test(`P13b resident return attribution ${scenario.name} probes=${probes} repetition=${repetition + 1}`, async ({ browser }) => {
    const context = await browser.newContext({ baseURL: "http://127.0.0.1:3041",
      viewport: { width: 1720, height: 960 }, deviceScaleFactor: 2 });
    const page = await context.newPage();
    const helpers = new KupuaHelpers(page);
    const controls = loadReturnResearchControls();
    const session = await context.newCDPSession(page);
    let tracing = false;
    let remoteRequests = 0;
    let blockedRemoteRequests = 0;
    const remoteResourceTypes: Record<string, number> = {};
    page.on("request", request => { if (/^https?:/.test(request.url())
      && new URL(request.url()).origin !== "http://127.0.0.1:3041") {
        remoteRequests++;
        remoteResourceTypes[request.resourceType()] = (remoteResourceTypes[request.resourceType()] ?? 0) + 1;
      } });
    try {
      await installJourneyFixtureRoutes(context);
      await context.route("**/*", route => {
        if (new URL(route.request().url()).origin === "http://127.0.0.1:3041") return route.fallback();
        blockedRemoteRequests++;
        return route.fulfill({ status: 404, body: "isolated fixture" });
      });
      await context.route("**/src/lib/image-urls.ts*", async route => {
        const response = await route.fetch();
        const source = await response.text();
        const thumbnail = "if (!S3_PROXY_ENABLED) return undefined;";
        const full = "if (!IMGPROXY_ENABLED || !IMAGE_BUCKET) return undefined;";
        expect(source.split(thumbnail)).toHaveLength(2);
        expect(source.split(full)).toHaveLength(2);
        await route.fulfill({ response, body: source.replace(thumbnail,
          'return "data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'400\' height=\'300\'%3E%3Cpath fill=\'blue\' d=\'M0 0h400v300H0z\'/%3E%3C/svg%3E#" + image.id;')
          .replace(full, "return getThumbnailUrl(image);")
          .replace("S3_PROXY_ENABLED || SYNTHETIC_PREVIEW_ENABLED", "true") });
      });
      await context.route("**/src/components/ImageGrid.tsx*", async route => {
        const response = await route.fetch();
        let source = await response.text();
        if (!productionRegression) source = gridDetailCallbackPolicy(source, stabilizeEnterDetail);
        if (countCells) {
          const marker = /const GridCell = (_s\d*)\(memo\(/;
          expect(Array.from(source.matchAll(/const GridCell = (_s\d*)\(memo\(/g)).length).toBe(1);
          source = `(${installGridCellCounter.toString()})();\n`
            + source.replace(marker, "const GridCell = $1(globalThis.__gridCellCounter.wrapMemo(memo,");
        }
        await route.fulfill({ response, body: source });
      });
      await page.addInitScript(() => sessionStorage.setItem("kupua-density", "grid"));
      await prepareRenderWorkWindow(page, "grid");
      await helpers.ensureExplicitMode();
      const region = page.getByRole("region", { name: "Image results grid", exact: true });
      const bounds = await region.boundingBox();
      await page.mouse.move(bounds!.x + 200, bounds!.y + 200);
      for (let index = 0; index < 5; index++) {
        await page.mouse.wheel(0, 600);
        await page.waitForTimeout(50);
      }
      await page.waitForTimeout(500);
      const media = await densityDrivers.visibleMediaReadiness(page, "grid", await page.evaluate(() => performance.now()));
      expect(media.mediaCensored).toBe(0);
      const target = await page.evaluate(() => (window as any).__kupua_getViewportAnchorId__());
      expect(target).toBeTruthy();
      const cell = region.locator(`[data-image-id="${target}"]`);
      const before = await cell.evaluate(element => {
        const region = element.closest('[aria-label="Image results grid"]')!;
        const bounds = region.getBoundingClientRect(), rect = element.getBoundingClientRect();
        return { top: rect.top - bounds.top, left: rect.left - bounds.left, scrollTop: region.scrollTop };
      });
      const listUrl = page.url();
      await cell.dblclick();
      await helpers.waitForDecodedDetailImage(target);
      for (let warmup = 0; warmup < warmupReturns; warmup++) {
        await helpers.closeDetailViaBackspace();
        await controls.waitForFocusedReturnStability(page, target);
        await cell.dblclick();
        await helpers.waitForDecodedDetailImage(target);
      }
      if (probes) { await controls.injectPerfProbes({ page }); await page.waitForTimeout(300); }
      await page.evaluate(() => {
        const store = (window as any).__kupua_store__;
        const original = store.getState();
        const record: any = { startedAt: null, completedAt: null, samples: [], active: true, publications: 0,
          originalResults: original.results, originalOffset: original.bufferOffset, frame: 0 };
        let previous = performance.now();
        const sample = (now: number) => {
          if (!record.active) return;
          record.samples.push({ start: previous, end: now, duration: now - previous });
          previous = now;
          if (record.samples.length > 128) throw new Error("Return frame bound exceeded");
          record.frame = requestAnimationFrame(sample);
        };
        record.frame = requestAnimationFrame(sample);
        record.unsubscribe = store.subscribe((state: any, previous: any) => {
          if (record.startedAt !== null && record.completedAt === null && state.results !== previous.results) record.publications++;
        });
        document.addEventListener("keydown", function start(event) {
          if (event.key !== "Backspace") return;
          document.removeEventListener("keydown", start, true);
          record.startedAt = performance.now();
          performance.mark("p13b-research-start");
        }, true);
        (window as any).__p13bResearch = record;
        const cells = (window as any).__gridCellCounter;
        if (cells) {
          cells.stats = { renders: 0, unique: new Set(), retainedComparisons: 0, retainedSkipped: 0, changes: {} };
          cells.active = true;
        }
      });
      if (traced) {
        await session.send("Tracing.start", { categories: "devtools.timeline,blink.user_timing,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.stack",
          transferMode: "ReturnAsStream" });
        tracing = true;
      }
      if (profiled) {
        await session.send("Profiler.enable");
        await session.send("Profiler.setSamplingInterval", { interval: 100 });
        await session.send("Profiler.start");
      }
      if (probes) await controls.resetPerfProbes({ page });
      await helpers.closeDetailViaBackspace();
      await controls.waitForFocusedReturnStability(page, target);
      const snapshot = probes ? await controls.collectPerfSnapshot({ page }) : null;
      const observed = await page.evaluate(target => {
        const record = (window as any).__p13bResearch;
        record.active = false;
        cancelAnimationFrame(record.frame);
        record.unsubscribe();
        const state = (window as any).__kupua_store__.getState();
        const region = document.querySelector('[aria-label="Image results grid"]')!;
        const cell = region.querySelector(`[data-image-id="${CSS.escape(target)}"]`)!;
        const bounds = region.getBoundingClientRect(), rect = cell.getBoundingClientRect();
        const intervals = record.samples.filter((sample: any) => sample.end > record.startedAt && sample.start < record.completedAt)
          .map((sample: any) => sample.duration);
        const cells = (window as any).__gridCellCounter;
        if (cells) cells.active = false;
        return { boundaryMs: record.completedAt - record.startedAt, intervals,
          cellWork: cells ? { renders: cells.stats.renders, unique: cells.stats.unique.size,
            retainedComparisons: cells.stats.retainedComparisons, retainedSkipped: cells.stats.retainedSkipped,
            changedProps: cells.stats.changes } : null,
          publications: record.publications, sameData: record.originalResults === state.results,
          sameOffset: record.originalOffset === state.bufferOffset, focused: state.focusedImageId === target,
          top: rect.top - bounds.top, left: rect.left - bounds.left, scrollTop: region.scrollTop,
          visible: rect.bottom > bounds.top && rect.top < bounds.bottom,
          foreground: document.visibilityState === "visible",
          mountedImages: region.querySelectorAll("img").length,
          decodedMountedImages: [...region.querySelectorAll<HTMLImageElement>("img")].filter(image => image.complete && image.naturalWidth > 0).length };
      }, target);
      const profile = profiled ? (await session.send("Profiler.stop")).profile : undefined;
      let trace = null;
      if (traced) {
        const completed = new Promise<any>(resolve => session.once("Tracing.tracingComplete", resolve));
        await session.send("Tracing.end");
        tracing = false;
        const { stream } = await completed;
        let data = "";
        try {
          for (let chunk = 0; chunk < 128; chunk++) {
            const result = await session.send("IO.read", { handle: stream, size: 65536 });
            data += result.data;
            if (data.length > 8 * 1024 * 1024) throw new Error("Return trace bound exceeded");
            if (result.eof) break;
            if (chunk === 127) throw new Error("Return trace chunk bound exceeded");
          }
        } finally { await session.send("IO.close", { handle: stream }); }
        const events = JSON.parse(data).traceEvents;
        trace = returnTraceSummary(events, profile);
      }
      expect(page.url()).toBe(listUrl);
      expect(observed.foreground).toBe(true);
      expect(observed.focused).toBe(true);
      expect(observed.visible).toBe(true);
      expect(observed.sameData).toBe(true);
      expect(observed.sameOffset).toBe(true);
      expect(observed.publications).toBe(0);
      expect(Math.abs(observed.top - before.top)).toBeLessThanOrEqual(1);
      expect(Math.abs(observed.left - before.left)).toBeLessThanOrEqual(1);
      expect(observed.scrollTop).toBe(before.scrollTop);
      expect(blockedRemoteRequests).toBe(remoteRequests);
      if (productionRegression) {
        expect(observed.cellWork?.changedProps).toEqual({});
        expect(observed.cellWork?.renders).toBe(0);
        expect(observed.cellWork?.retainedSkipped).toBe(observed.cellWork?.retainedComparisons);
      }
      console.log(JSON.stringify({ fixture: "p13b-return-attribution", scenario: scenario.name, probes, traced, profiled, warmupReturns, countCells, stabilizeEnterDetail, repetition: repetition + 1,
        boundaryMs: observed.boundaryMs, observedFrameCount: observed.intervals.length,
        observedMaxFrameMs: observed.intervals.length ? Math.max(...observed.intervals) : null,
        probeFrameCount: snapshot?.jank.frameCount ?? null, probeFrameP95Ms: snapshot?.jank.p95FrameMs ?? null,
        probeMaxFrameMs: snapshot?.jank.maxFrameMs ?? null, probeLoafBlockingMs: snapshot?.loaf.totalBlockingMs ?? null,
        mountedImages: observed.mountedImages, decodedMountedImages: observed.decodedMountedImages,
        publications: observed.publications, cellWork: observed.cellWork, blockedRemoteRequests, remoteResourceTypes, trace }));
    } finally {
      if (tracing) await session.send("Tracing.end").catch(() => {});
      await page.evaluate(() => { const record = (window as any).__p13bResearch;
        if (record) { record.active = false; cancelAnimationFrame(record.frame); record.unsubscribe(); }
        (window as any).__perfProbes?.stop(); }).catch(() => {});
      await session.detach();
      await context.close();
    }
  });
}

function installTableRowCounter() {
  const shallow = (left: Record<string, unknown>, right: Record<string, unknown>) => {
    if (Object.is(left, right)) return true;
    const keys = Object.keys(left);
    return keys.length === Object.keys(right).length
      && keys.every(key => Object.prototype.hasOwnProperty.call(right, key) && Object.is(left[key], right[key]));
  };
  const probe: any = {
    mode: "native", active: false, stats: null, endpoint: null,
    reset() {
      probe.stats = { renders: 0, titleReads: 0, comparisons: 0, semanticEligible: 0,
        skips: 0, sameImageNewRow: 0, changes: {}, unique: new Set<string>() };
    },
    wrapMemo(memo: any, component: any) {
      function CountedTableRow(props: any) {
        if (probe.active) {
          probe.stats.renders++;
          probe.stats.unique.add(props.image.id);
        }
        return component(props);
      }
      return memo(CountedTableRow, (previous: any, next: any) => {
        const native = shallow(previous, next);
        const keys = Object.keys(previous);
        const semantic = keys.length === Object.keys(next).length && keys.every(key =>
          key === "row" ? previous.row.original === next.row.original
            : key === "virtualRow" ? shallow(previous.virtualRow, next.virtualRow)
              : Object.is(previous[key], next[key]));
        const reuse = probe.mode === "semantic" ? semantic : native;
        if (probe.active) {
          const stats = probe.stats;
          stats.comparisons++;
          if (semantic && !native) stats.semanticEligible++;
          if (previous.image === next.image && previous.row !== next.row) stats.sameImageNewRow++;
          if (reuse) stats.skips++;
          for (const key of keys) {
            if (!Object.is(previous[key], next[key])) stats.changes[key] = (stats.changes[key] ?? 0) + 1;
          }
        }
        return reuse;
      });
    },
  };
  (window as any).__tableRowCounter = probe;
}

test("Table retained-row reference churn: bounded semantic reuse control", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: "http://127.0.0.1:3041",
    viewport: { width: 1720, height: 960 }, deviceScaleFactor: 2 });
  try {
    await installJourneyFixtureRoutes(context);
    let intercepted = 0;
    await context.route("**/src/components/ImageTable.tsx*", async route => {
      const response = await route.fetch();
      const source = await response.text();
      const marker = "const EnrichedTableRow = _s(memo(";
      expect(source.split(marker)).toHaveLength(2);
      intercepted++;
      return route.fulfill({ response, body: `(${installTableRowCounter.toString()})();\n`
        + source.replace(marker, "const EnrichedTableRow = _s(globalThis.__tableRowCounter.wrapMemo(memo,") });
    });
    const page = await context.newPage();
    await prepareRenderWorkWindow(page, "table");
    expect(intercepted).toBe(1);
    const records = [];
    for (const mode of ["native", "semantic", "semantic", "native", "native", "semantic"] as const) {
      const record = await page.evaluate(async mode => {
        const path = "/e2e-perf/density-browser.ts";
        const driver = await import(path);
        const mediaPath = "/e2e-perf/thumbnail-probe.mjs";
        const { installThumbnailProbe } = await import(mediaPath);
        const store = (window as any).__kupua_store__;
        const counter = (window as any).__tableRowCounter;
        const region = document.querySelector<HTMLElement>('[aria-label="Image results table"]')!;
        const fieldsPath = "/src/lib/field-registry.tsx";
        const { FIELDS_BY_ID } = await import(fieldsPath);
        const titleField = FIELDS_BY_ID.get("metadata_title");
        const titleAccessor = titleField.accessor;
        titleField.accessor = (image: any) => {
          if (counter.active) counter.stats.titleReads++;
          return titleAccessor(image);
        };
        counter.mode = mode;
        region.scrollTop = 0;
        region.scrollLeft = 0;
        for (let index = 0; index < 3; index++) await new Promise(resolve => requestAnimationFrame(resolve));
        driver.installDensityJourney({ density: "table", direction: 1, resultsPerSecond: 100 });
        const calibration = (window as any).__densityJourney.snapshot();
        const before = store.getState();
        if (before.loading || before._extendForwardInFlight || before._extendBackwardInFlight) {
          throw new Error("Overlapping metadata work");
        }
        counter.reset();
        counter.active = true;
        installThumbnailProbe({ density: "table" });
        let movement;
        let exposure;
        let journey;
        try {
          movement = await driver.scrollAtSpeed({ evaluate: (callback: any, argument: any) => callback(argument) },
            "table", calibration.commandedSpeedPxPerSec, 1000, { measureBounds: true, maxDistancePx: 2560 });
          exposure = (window as any).__kupua_thumbnailProbe.stop();
          journey = (window as any).__densityJourney.snapshot();
        } finally {
          counter.active = false;
          titleField.accessor = titleAccessor;
          (window as any).__kupua_thumbnailProbe?.dispose();
          (window as any).__densityJourney?.dispose();
        }
        await new Promise(resolve => requestAnimationFrame(resolve));
        const endpoint = JSON.stringify(Array.from(region.querySelectorAll<HTMLElement>('[role="row"][data-image-id]'))
          .map(row => ({ id: row.dataset.imageId, text: row.textContent, style: row.getAttribute("style"),
            titles: Array.from(row.querySelectorAll("[title]")).map(cell => cell.getAttribute("title")) })));
        counter.endpoint ??= endpoint;
        return { mode, viewport: [innerWidth, innerHeight, devicePixelRatio],
          container: [region.clientWidth, region.clientHeight],
          resident: before.results.length, runway: calibration.initialRunwayResults,
          initialVisible: calibration.initialVisibleImages, appliedPx: movement.drivenDistancePx,
          durationMs: movement.drivenDurationMs,
          appliedResultsPerSecond: movement.drivenDistancePx * calibration.resultsPerPixel * 1000 / movement.drivenDurationMs,
          frameP95Ms: exposure.frameP95Ms, maxFrameMs: exposure.frameMaxMs, frames: exposure.frameCount,
          observerTotalMs: exposure.observerSampleTotalMs, observerMaxMs: exposure.observerSampleMaxMs,
          journeyObserverMaxMs: journey.stabilitySampleMaxMs, mediaPending: exposure.pendingAtEnd,
          publications: journey.appendPublications + journey.prependPublications,
          sameData: before.results === store.getState().results, sameEndpoint: endpoint === counter.endpoint,
          foreground: document.visibilityState === "visible", renders: counter.stats.renders,
          uniqueRows: counter.stats.unique.size, titleReads: counter.stats.titleReads, comparisons: counter.stats.comparisons,
          semanticEligible: counter.stats.semanticEligible, skips: counter.stats.skips,
          sameImageNewRow: counter.stats.sameImageNewRow, changes: counter.stats.changes };
      }, mode);
      console.log(JSON.stringify({ fixture: "table-retained-row-control", ...record }));
      records.push(record);
      expect(record.foreground).toBe(true);
      expect(record.publications).toBe(0);
      expect(record.sameData).toBe(true);
      expect(record.resident).toBe(400);
      expect(record.appliedPx).toBe(2560);
      expect(record.sameEndpoint).toBe(true);
      expect(record.mediaPending).toBe(0);
      expect(record.viewport).toEqual([1720, 960, 2]);
      expect(record.titleReads).toBeLessThanOrEqual(record.uniqueRows * 3);
      expect(record.renders).toBeLessThanOrEqual(record.uniqueRows * 3);
    }
    const native = records.filter(record => record.mode === "native");
    const semantic = records.filter(record => record.mode === "semantic");
    expect(native.every(record => record.sameImageNewRow === 0 && record.semanticEligible === 0)).toBe(true);
    expect(semantic.every(record => record.sameImageNewRow === 0)).toBe(true);
  } finally {
    await context.close();
  }
});

for (const density of ["grid", "justified"] as const) {
  test(`Grid date work stays behind the cell memo boundary: ${density}`, async ({ browser }) => {
    const context = await browser.newContext({ baseURL: "http://127.0.0.1:3041",
      viewport: { width: 1720, height: 960 }, deviceScaleFactor: 2 });
    try {
      await installJourneyFixtureRoutes(context);
      await context.route("**/src/components/ImageGrid.tsx*", async route => {
        const response = await route.fetch();
        const source = await response.text();
        const marker = /const GridCell = (_s\d*)\(memo\(/;
        expect(Array.from(source.matchAll(/const GridCell = (_s\d*)\(memo\(/g)).length).toBe(1);
        return route.fulfill({ response, body: `(${installGridCellCounter.toString()})();\n`
          + source.replace(marker, "const GridCell = $1(globalThis.__gridCellCounter.wrapMemo(memo,") });
      });
      await context.route("**/src/lib/format-grid-date.ts*", async route => {
        const response = await route.fetch();
        const source = await response.text();
        expect(source).toContain("function formatGridDate(iso)");
        return route.fulfill({ response, body: source + `\n
const originalRenderWorkDate = formatGridDate;
globalThis.__gridDateCounter = { active: false, calls: 0, ms: 0 };
formatGridDate = function(iso) {
  const counter = globalThis.__gridDateCounter;
  if (!counter.active) return originalRenderWorkDate(iso);
  const started = performance.now();
  counter.calls++;
  try { return originalRenderWorkDate(iso); }
  finally { counter.ms += performance.now() - started; }
};` });
      });
      const page = await context.newPage();
      await prepareRenderWorkWindow(page, density);
      for (let repetition = 0; repetition < 2; repetition++) {
        const record = await page.evaluate(async density => {
          const path = "/e2e-perf/density-browser.ts";
          const driver = await import(path);
          const mediaPath = "/e2e-perf/thumbnail-probe.mjs";
          const { installThumbnailProbe } = await import(mediaPath);
          const store = (window as any).__kupua_store__;
          const counter = (window as any).__gridDateCounter;
          const cells = (window as any).__gridCellCounter;
          const region = document.querySelector<HTMLElement>(`[aria-label="Image results ${density}"]`)!;
          region.scrollTop = 0;
          for (let index = 0; index < 3; index++) await new Promise(resolve => requestAnimationFrame(resolve));
          driver.installDensityJourney({ density, direction: 1, resultsPerSecond: 100 });
          const calibration = (window as any).__densityJourney.snapshot();
          const before = store.getState();
          counter.calls = 0;
          counter.ms = 0;
          counter.active = true;
          cells.stats = { renders: 0, unique: new Set(), retainedComparisons: 0, retainedSkipped: 0, changes: {} };
          cells.active = true;
          installThumbnailProbe({ density });
          let movement;
          let exposure;
          let journey;
          const distance = Math.round(80 / calibration.resultsPerPixel);
          try {
            movement = await driver.scrollAtSpeed({ evaluate: (callback: any, argument: any) => callback(argument) },
              density, calibration.commandedSpeedPxPerSec, 1000, { measureBounds: true, maxDistancePx: distance });
            exposure = (window as any).__kupua_thumbnailProbe.stop();
            journey = (window as any).__densityJourney.snapshot();
          } finally {
            counter.active = false;
            cells.active = false;
            (window as any).__kupua_thumbnailProbe?.dispose();
            (window as any).__densityJourney?.dispose();
          }
          return { density, dateCalls: counter.calls, dateMs: counter.ms, frameP95Ms: exposure.frameP95Ms,
            cellRenders: cells.stats.renders, uniqueCells: cells.stats.unique.size,
            retainedComparisons: cells.stats.retainedComparisons, retainedSkipped: cells.stats.retainedSkipped,
            retainedPropChanges: cells.stats.changes,
            maxFrameMs: exposure.frameMaxMs, mediaPending: exposure.pendingAtEnd,
            appliedPx: movement.drivenDistancePx, requestedDistance: distance, durationMs: movement.drivenDurationMs,
            appliedResultsPerSecond: movement.drivenDistancePx * calibration.resultsPerPixel * 1000 / movement.drivenDurationMs,
            publications: journey.appendPublications + journey.prependPublications,
            sameData: before.results === store.getState().results, resident: before.results.length,
            foreground: document.visibilityState === "visible", viewport: [innerWidth, innerHeight, devicePixelRatio] };
        }, density);
        console.log(JSON.stringify({ fixture: "grid-date-work", repetition, ...record }));
        expect(record.foreground).toBe(true);
        expect(record.viewport).toEqual([1720, 960, 2]);
        expect(record.resident).toBe(400);
        expect(record.publications).toBe(0);
        expect(record.sameData).toBe(true);
        expect(record.appliedPx).toBe(record.requestedDistance);
        expect(record.mediaPending).toBe(0);
        expect(record.dateCalls).toBeLessThanOrEqual(density === "grid" ? 550 : 0);
        expect(record.cellRenders).toBeLessThanOrEqual(record.uniqueCells * 2);
        expect(record.retainedComparisons).toBeGreaterThan(0);
        expect(record.retainedSkipped).toBe(record.retainedComparisons);
      }
    } finally { await context.close(); }
  });
}

async function installTableLifetimeRoutes(context: BrowserContext, origin: string, cleanup: boolean) {
  await installJourneyFixtureRoutes(context);
  await context.route(`${origin}/**`, route => route.continue());
  await context.route("**/src/lib/image-urls.ts*", async route => {
    const response = await route.fetch();
    const source = await response.text();
    const marker = "if (!S3_PROXY_ENABLED) return undefined;";
    expect(source.split(marker)).toHaveLength(2);
    await route.fulfill({ response, body: source.replace(marker,
      `return image.thumbnail?.secureUrl ?? ${JSON.stringify(origin)} + "/image/" + image.id + ".svg";`)
      .replace("S3_PROXY_ENABLED || SYNTHETIC_PREVIEW_ENABLED", "true") });
  });
  if (!cleanup) await context.route("**/src/components/TableRowCells.tsx*", async route => {
    const response = await route.fetch();
    const source = await response.text();
    const start = source.indexOf("function TableThumbnail(");
    const end = source.indexOf("\n}", start) + 2;
    expect(start).toBeGreaterThanOrEqual(0);
    const original = source.slice(start, end);
    const effectStart = original.indexOf("const thumbnailRef = useRef(null);");
    const effectEnd = original.indexOf("return url ?");
    expect(effectStart).toBeGreaterThanOrEqual(0);
    expect(effectEnd).toBeGreaterThan(effectStart);
    expect(original.split("ref: thumbnailRef,")).toHaveLength(2);
    const historical = (original.slice(0, effectStart) + original.slice(effectEnd)).replace("ref: thumbnailRef,", "");
    await route.fulfill({ response, body: source.slice(0, start) + historical + source.slice(end) });
  });
}

for (const cleanup of [false, true]) {
test(`F2 Table detached pending thumbnail releases native request ${cleanup ? "candidate" : "baseline"}`, async ({ page, context }) => {
  const targetPath = "/image/img-6.svg";
  let holdTarget = true;
  const server = await heldImageServer({ hold: path => holdTarget && path === targetPath, limit: 2048 });
  try {
    await installTableLifetimeRoutes(context, server.origin, cleanup);
    await page.addInitScript(() => sessionStorage.setItem("kupua-density", "table"));
    await page.goto("/search?nonFree=true");
    await page.waitForFunction(() => Boolean((window as any).__kupua_store__));
    await page.evaluate(async () => {
      const path = "/src/dal/mock-data-source.ts";
      const { MockDataSource } = await import(path);
      const store = (window as any).__kupua_store__;
      store.setState({ dataSource: new MockDataSource(343) });
      await store.getState().search();
      await store.getState().extendForward();
    });
    const region = page.getByRole("region", { name: "Image results table", exact: true });
    const requests = () => server.requests.filter(request => request.path === targetPath);
    await expect.poll(() => requests().length).toBe(1);
    const target = await region.locator('[data-image-id="img-6"] img').elementHandle();
    expect(await target!.evaluate(image => (image as HTMLImageElement).complete)).toBe(false);
    const source = (await target!.getAttribute("src"))!;
    await page.getByRole("button", { name: "Show Browse panel", exact: true }).click();
    await page.evaluate(async () => { await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); });
    expect(await target!.evaluate(image => image.isConnected)).toBe(true);
    expect(await target!.getAttribute("src")).toBe(source);
    expect(requests()).toHaveLength(1);
    expect(requests()[0].aborted).toBe(false);
    await region.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await page.waitForFunction(image => !image.isConnected, target!);
    await page.evaluate(async () => { await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); });
    console.log(JSON.stringify({ fixture: "f2-table-detached", cleanup, detached: await target!.evaluate(image => !image.isConnected),
      sourceRetained: await target!.getAttribute("src") !== null, requestAborted: requests()[0].aborted,
      requestFinished: requests()[0].finished }));
    if (!cleanup) {
      expect(await target!.getAttribute("src")).toBe(source);
      expect(requests()[0].aborted).toBe(false);
      expect(requests()[0].finished).toBe(false);
      await target!.dispose();
      return;
    }
    expect(await target!.getAttribute("src")).toBeNull();
    await expect.poll(() => requests()[0].aborted).toBe(true);
    await region.evaluate(element => { element.scrollTop = 0; });
    await expect.poll(() => requests().length).toBe(2);
    const replacement = await region.locator('[data-image-id="img-6"] img').elementHandle();
    expect(await replacement!.getAttribute("src")).toBe(source);
    const consumer = await page.evaluateHandle(source => {
      const image = new Image(100, 100);
      image.src = source;
      document.body.append(image);
      return image;
    }, source);
    await region.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await page.waitForFunction(image => !image.isConnected && !image.hasAttribute("src"), replacement!);
    await page.waitForTimeout(200);
    expect(requests()).toHaveLength(2);
    expect(requests()[1].aborted).toBe(false);
    holdTarget = false;
    requests()[1].release();
    await consumer.evaluate(image => image.decode());
    expect(await consumer.evaluate(image => image.naturalWidth)).toBe(100);
    await region.evaluate(element => { element.scrollTop = 0; });
    const completed = await region.locator('[data-image-id="img-6"] img').elementHandle();
    await completed!.evaluate(image => (image as HTMLImageElement).decode());
    await region.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await page.waitForFunction(image => !image.isConnected, completed!);
    expect(await completed!.getAttribute("src")).toBe(source);
    expect(await completed!.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBe(100);
    expect(requests()).toHaveLength(2);
    expect(requests()[1].finished).toBe(true);
    console.log(JSON.stringify({ fixture: "f2-table-lifecycle-safety", connectedRerenderAndStrictMode: true,
      reentry: true, sharedConsumer: true, completedSourcePreserved: true, targetRequests: requests().length }));
    await consumer.evaluate(image => image.remove());
    await consumer.dispose();
    await completed!.dispose();
    await replacement!.dispose();
    await target!.dispose();
  } finally { await server.close(); }
});
}

const tableLifetimeMatches = new Map<number, unknown>();
for (const [cleanup, block] of [[false, 1], [true, 1], [true, 2], [false, 2], [false, 3], [true, 3]] as const) {
  test(`F2 Table pressure ownership ${cleanup ? "candidate" : "baseline"} block=${block}`, async ({ browser }) => {
    const context = await browser.newContext({ baseURL: "http://127.0.0.1:3041",
      viewport: { width: 1720, height: 960 }, deviceScaleFactor: 2 });
    const page = await context.newPage();
    const body = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="blue"/></svg><!--'
      + "x".repeat(24 * 1024) + "-->");
    const server = await heldImageServer({ hold: () => false, limit: 2048, imageBody: () => body });
    const session = await context.newCDPSession(page);
    await session.send("Network.enable");
    const requests = createRequestProbe(session);
    const ownedRequests = new Map<object, { path: string; pending: boolean }>();
    page.on("request", request => {
      const url = new URL(request.url());
      if (url.origin === server.origin && request.resourceType() === "image") {
        if (ownedRequests.size >= 1024) throw new Error("Table ownership request bound exceeded");
        ownedRequests.set(request, { path: url.pathname, pending: true });
      }
    });
    const finishRequest = (request: object) => {
      const record = ownedRequests.get(request);
      if (record) record.pending = false;
    };
    page.on("requestfinished", finishRequest);
    page.on("requestfailed", finishRequest);
    try {
      await installTableLifetimeRoutes(context, server.origin, cleanup);
      await page.addInitScript(() => sessionStorage.setItem("kupua-density", "table"));
      await page.goto("/search?nonFree=true");
      await page.waitForFunction(() => Boolean((window as any).__kupua_store__));
      await page.evaluate(async () => {
        const path = "/src/dal/mock-data-source.ts";
        const { MockDataSource } = await import(path);
        const store = (window as any).__kupua_store__;
        store.setState({ dataSource: new MockDataSource(70000) });
        await store.getState().search();
      });
      await waitForDensityMaintenanceCooldown(page);
      await page.evaluate(async () => { await (window as any).__kupua_store__.getState().extendForward(); });
      expect(await page.evaluate(() => (window as any).__kupua_store__.getState().results.length)).toBe(400);
      const initialReady = await densityDrivers.visibleMediaReadiness(page, "table", await page.evaluate(() => performance.now()));
      expect(initialReady.mediaCensored).toBe(0);
      await expect.poll(() => requests.snapshot().mediaRequestsPending, { timeout: 10000 }).toBe(0);
      ownedRequests.clear();
      await page.evaluate(() => {
        const region = document.querySelector('[aria-label="Image results table"]')!;
        const seen = new Map<HTMLImageElement, string>();
        const scan = () => {
          for (const image of region.querySelectorAll<HTMLImageElement>("[data-image-id] img")) {
            if (!seen.has(image)) seen.set(image, new URL(image.src).pathname);
          }
          if (seen.size > 1024) throw new Error("Table ownership element bound exceeded");
        };
        scan();
        const observer = new MutationObserver(scan);
        observer.observe(region, { childList: true, subtree: true });
        (window as any).__f2TableOwnership = { seen, observer,
          results: (window as any).__kupua_store__.getState().results };
      });
      await session.send("Network.emulateNetworkConditions", { offline: false, latency: 80,
        downloadThroughput: 4 * 1024 * 1024 / 8, uploadThroughput: 4 * 1024 * 1024 / 8 });
      requests.beginPhase();
      await page.evaluate(densityDrivers.installDensityJourney, { density: "table" as const, direction: 1 as const, resultsPerSecond: 100 });
      await page.evaluate(installThumbnailProbe, { density: "table" as const });
      const initial = await page.evaluate(() => (window as any).__densityJourney.snapshot());
      const distance = Math.round(initial.commandedSpeedPxPerSec! * 2);
      const forward = await scrollAtSpeed(page, "table", initial.commandedSpeedPxPerSec!, 2500,
        { measureBounds: true, maxDistancePx: distance });
      expect(forward.drivenDistancePx).toBe(distance);
      const reverseDistance = block === 3 ? distance / 4 : 0;
      const movement = reverseDistance ? await scrollAtSpeed(page, "table", -initial.commandedSpeedPxPerSec!, 1000,
        { measureBounds: true, maxDistancePx: reverseDistance }) : forward;
      expect(movement.drivenDistancePx).toBe(reverseDistance ? -reverseDistance : distance);
      const observed = await page.evaluate(() => {
        const region = document.querySelector('[aria-label="Image results table"]')!;
        const bounds = region.getBoundingClientRect();
        const top = Math.max(bounds.top, region.querySelector("[data-table-header]")!.getBoundingClientRect().bottom);
        const ownership = (window as any).__f2TableOwnership;
        const mounted = [...region.querySelectorAll<HTMLImageElement>("[data-image-id] img")];
        const visible = mounted.filter(image => {
          const rect = image.closest("[data-image-id]")!.getBoundingClientRect();
          return rect.bottom > top && rect.top < bounds.bottom;
        });
        const journey = (window as any).__densityJourney.snapshot();
        const thumbnails = window.__kupua_thumbnailProbe!.stop();
        (window as any).__densityJourney.dispose();
        window.__kupua_thumbnailProbe!.dispose();
        return { journey, thumbnails,
          sameData: ownership.results === (window as any).__kupua_store__.getState().results,
          visible: visible.map(image => new URL(image.src).pathname).sort(),
          mounted: mounted.map(image => new URL(image.src).pathname),
          detached: [...ownership.seen.entries()].filter(([image]: [HTMLImageElement, string]) => !image.isConnected)
            .map(([, path]: [HTMLImageElement, string]) => path) };
      });
      const atStop = requests.snapshot();
      const visible = new Set(observed.visible), mounted = new Set(observed.mounted), detached = new Set(observed.detached);
      const pending = [...ownedRequests.values()].filter(request => request.pending);
      const ownershipCounts = {
        pending: pending.length,
        visiblePending: pending.filter(request => visible.has(request.path)).length,
        mountedOffscreenPending: pending.filter(request => mounted.has(request.path) && !visible.has(request.path)).length,
        detachedOnlyPending: pending.filter(request => detached.has(request.path) && !mounted.has(request.path)).length,
        unassociatedPending: pending.filter(request => !mounted.has(request.path) && !detached.has(request.path)).length,
      };
      const recovered = await densityDrivers.visibleMediaReadiness(page, "table", movement.stoppedAtPerformanceMs!, 4000);
      const after = requests.snapshot();
      const matching = { initialCount: initial.initialBufferCount, runway: initial.initialRunwayResults,
        speed: initial.commandedSpeedPxPerSec, distance, reverseDistance, visible: observed.visible };
      if (tableLifetimeMatches.has(block)) expect(matching).toEqual(tableLifetimeMatches.get(block));
      else tableLifetimeMatches.set(block, matching);
      expect(observed.sameData).toBe(true);
      expect(observed.journey.journeyOverflow).toBe(0);
      expect(ownershipCounts.unassociatedPending).toBe(0);
      expect(recovered.failedMediaCount).toBe(0);
      console.log(JSON.stringify({ fixture: "f2-table-pressure", cleanup, block, payloadBytes: body.length,
        viewport: [1720, 960, 2], initialCount: initial.initialBufferCount, runway: initial.initialRunwayResults,
        distance, reverseDistance, forwardDurationMs: forward.drivenDurationMs,
        reverseDurationMs: reverseDistance ? movement.drivenDurationMs : 0,
        achievedResultsPerSecond: observed.journey.achievedResultsPerSecond,
        stoppedUsableSlots: visible.size, ownershipCounts,
        mediaReadyMs: recovered.mediaReadyMs, mediaCensored: recovered.mediaCensored,
        observedMedia: recovered.visibleMediaCount, decodedMedia: recovered.decodedMediaCount,
        failedMedia: recovered.failedMediaCount, pendingAfter: after.mediaRequestsPending,
        cancellationsAtStop: atStop.mediaRequestCancellations, cancellationsAfter: after.mediaRequestCancellations,
        requestFailures: after.mediaRequestFailures, httpErrors: after.mediaHttpErrors,
        requestStarts: after.mediaRequestStarts, completedBytes: after.mediaCompletedBytes,
        repeatedRequestStarts: ownedRequests.size - new Set([...ownedRequests.values()].map(request => request.path)).size,
        frameP95Ms: observed.thumbnails.frameP95Ms, frameMaxMs: observed.thumbnails.frameMaxMs,
        pendingVisibleRatioMean: observed.thumbnails.pendingVisibleRatioMean,
        blockedMs: movement.bufferEdgeBlockedMs, retainedDisplacementMaxPx: observed.journey.retainedDisplacementMaxPx,
        retainedResizeMaxPx: observed.journey.retainedResizeMaxPx }));
    } finally {
      await page.evaluate(() => { (window as any).__f2TableOwnership?.observer.disconnect();
        (window as any).__densityJourney?.dispose(); window.__kupua_thumbnailProbe?.dispose(); }).catch(() => {});
      requests.dispose();
      await session.detach();
      await context.close();
      await server.close();
    }
  });
}

function withoutThumbnailCleanup(source: string): string {
  const start = source.indexOf("function GridThumbnail(props)");
  const end = source.indexOf("\n}", start) + 2;
  expect(start).toBeGreaterThanOrEqual(0);
  const original = source.slice(start, end);
  expect(original).toContain("...props,");
  const renderStart = original.lastIndexOf("return ");
  expect(renderStart).toBeGreaterThan(0);
  return source.slice(0, start) + `function GridThumbnail(props) {
    const loading = useContext(ThumbnailLoadingContext);
    const thumbnailRef = useRef(null);
    ${original.slice(renderStart)}` + source.slice(end);
}

for (const { density, cleanup, action, block } of [
  { density: "justified", cleanup: false, action: "journey", block: 1 },
  { density: "justified", cleanup: true, action: "journey", block: 1 },
  { density: "justified", cleanup: true, action: "journey", block: 2 },
  { density: "justified", cleanup: false, action: "journey", block: 2 },
] as const) {
  test(`F2 unmount ownership ${density} ${cleanup ? "production" : "historical"} ${action} block=${block}`, async ({ page, context }) => {
    let holdTarget = true;
    const targetPath = "/image/img-6.svg";
    const replacementPath = "/image/replacement.svg";
    const server = await heldImageServer({ hold: path => action === "journey"
      || (holdTarget && (path === targetPath || path === replacementPath)),
      limit: 2048, releaseDelayMs: action === "journey" ? 120 : undefined });
    let cdp: CDPSession | undefined;
    let requests: ReturnType<typeof createRequestProbe> | undefined;
    try {
      await installJourneyFixtureRoutes(context);
      await context.route(`${server.origin}/**`, route => route.continue());
      await context.route("**/src/lib/image-urls.ts*", async route => {
        const response = await route.fetch();
        const source = await response.text();
        const marker = "if (!S3_PROXY_ENABLED) return undefined;";
        expect(source.split(marker)).toHaveLength(2);
        await route.fulfill({ response, body: source.replace(marker,
          `return image.thumbnail?.secureUrl ?? ${JSON.stringify(server.origin)} + "/image/" + image.id + ".svg";`)
          .replace("S3_PROXY_ENABLED || SYNTHETIC_PREVIEW_ENABLED", "true") });
      });
      if (!cleanup) await context.route("**/src/components/ImageGrid.tsx*", async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: withoutThumbnailCleanup(await response.text()) });
      });
      await page.addInitScript(density => {
        sessionStorage.setItem("kupua-density", density);
      }, density);
      await page.goto("/search?nonFree=true");
      await page.waitForFunction(() => Boolean((window as any).__kupua_store__));
      if (action === "journey") {
        cdp = await context.newCDPSession(page);
        await cdp.send("Network.enable");
        requests = createRequestProbe(cdp);
      }
      await page.evaluate(async total => {
        const path = "/src/dal/mock-data-source.ts";
        const { MockDataSource } = await import(path);
        const store = (window as any).__kupua_store__;
        store.setState({ dataSource: new MockDataSource(total) });
        await store.getState().search();
        if (total <= 1000) await store.getState().extendForward();
      }, action === "journey" ? 70000 : 343);
      const region = page.getByRole("region", { name: `Image results ${density}`, exact: true });
      await region.waitFor();
      if (action === "journey") {
        await establishDensitySource(page);
        await selectDensity(page, density);
        await prepareDensityRecovery(page, density);
        const ready = await densityDrivers.visibleMediaReadiness(page, density, await page.evaluate(() => performance.now()));
        expect(ready.mediaCensored).toBe(0);
        await expect.poll(() => requests!.snapshot().mediaRequestsPending, { timeout: 10000 }).toBe(0);
        requests!.beginPhase();
        await page.evaluate(densityDrivers.installDensityJourney, { density, direction: 1 as const, resultsPerSecond: 100 });
        await page.evaluate(installThumbnailProbe, { density });
        const initial = await page.evaluate(() => (window as any).__densityJourney.snapshot());
        expect(initial.initialBufferCount).toBe(201);
        const initialOffset = await page.evaluate(() => (window as any).__kupua_store__.getState().bufferOffset);
        const targetDistancePx = Math.round(initial.commandedSpeedPxPerSec! * 6) + 50;
        const movement = await scrollAtSpeed(page, density, initial.commandedSpeedPxPerSec!, 7000,
          { measureBounds: true, maxDistancePx: targetDistancePx });
        expect(movement.drivenDistancePx).toBe(targetDistancePx);
        const observed = await page.evaluate(() => {
          const journey = (window as any).__densityJourney.snapshot();
          const thumbnails = window.__kupua_thumbnailProbe!.stop();
          (window as any).__densityJourney.dispose();
          window.__kupua_thumbnailProbe!.dispose();
          return { journey, thumbnails };
        });
        const motionRequests = requests!.snapshot();
        const stopped = await densityDrivers.visibleMediaReadiness(page, density, movement.stoppedAtPerformanceMs!);
        const recoveredRequests = requests!.snapshot();
        expect(observed.journey.refillCoverageComplete).toBe(1);
        expect(observed.journey.progressedResults).toBeGreaterThan(500);
        expect(observed.thumbnails.failedCount).toBe(0);
        expect(stopped.mediaCensored).toBe(0);
        const stoppedRanks = await page.evaluate(density => {
          const region = document.querySelector<HTMLElement>(`[aria-label="Image results ${density}"]`)!;
          const bounds = region.getBoundingClientRect();
          const positions = (window as any).__kupua_store__.getState().imagePositions;
          return [...region.querySelectorAll<HTMLElement>('[data-grid-cell][data-image-id]')].filter(cell => {
            const rect = cell.getBoundingClientRect();
            return rect.bottom > bounds.top && rect.top < bounds.bottom;
          }).map(cell => positions.get(cell.dataset.imageId)).sort((left, right) => left - right);
        }, density);
        const matching = { initialOffset, initialCount: initial.initialBufferCount, runway: initial.initialRunwayResults,
          speed: initial.commandedSpeedPxPerSec, targetDistancePx, stoppedRanks };
        if (f2DeliveryMatches.has(block)) expect(matching).toEqual(f2DeliveryMatches.get(block));
        else f2DeliveryMatches.set(block, matching);
        console.log(JSON.stringify({ fixture: "f2-unmount-delivery", density, policy: cleanup ? "production" : "historical", block, delayMs: 120,
          initialCount: initial.initialBufferCount, runway: initial.initialRunwayResults,
          targetDistancePx, drivenDistancePx: movement.drivenDistancePx, matchedStoppedRankCount: stoppedRanks.length,
          achievedResultsPerSecond: observed.journey.achievedResultsPerSecond, progressedResults: observed.journey.progressedResults,
          appendPublications: observed.journey.appendPublications, evictionPublications: observed.journey.evictionPublications,
          blockedMs: movement.bufferEdgeBlockedMs, frameP95Ms: observed.thumbnails.frameP95Ms,
          pendingVisibleRatioMean: observed.thumbnails.pendingVisibleRatioMean,
          stoppedMediaReadyMs: stopped.mediaReadyMs, stoppedVisibleCount: stopped.visibleMediaCount,
          stoppedDecodedCount: stopped.decodedMediaCount,
          mediaStarts: motionRequests.mediaRequestStarts, mediaPendingAtStop: motionRequests.mediaRequestsPending,
          mediaCancelledAtStop: motionRequests.mediaRequestCancellations,
          mediaPendingAtReady: recoveredRequests.mediaRequestsPending,
          serverRequests: server.requests.length, serverAborted: server.requests.filter(request => request.aborted).length,
          retainedDisplacementMaxPx: observed.journey.retainedDisplacementMaxPx,
          retainedResizeMaxPx: observed.journey.retainedResizeMaxPx,
          retainedSourceChanges: observed.journey.retainedSourceChanges }));
        return;
      }
    } finally {
      await page.evaluate(() => { (window as any).__densityJourney?.dispose(); window.__kupua_thumbnailProbe?.dispose(); }).catch(() => {});
      requests?.dispose();
      await cdp?.detach();
      await server.close();
    }
  });
}

test("F2 imperative source removal needs explicit re-admission on actual Justified reversal", async ({ page, context }) => {
  await installJourneyFixtureRoutes(context);
  await page.goto("/search?nonFree=true");
  await page.waitForFunction(() => Boolean((window as any).__kupua_store__));
  await page.evaluate(async () => {
    const path = "/src/dal/mock-data-source.ts";
    const { MockDataSource } = await import(path);
    const store = (window as any).__kupua_store__;
    store.setState({ dataSource: new MockDataSource(343) });
    await store.getState().search();
    await store.getState().extendForward();
  });
  await establishDensitySource(page);
  await selectDensity(page, "justified");
  await page.evaluate(() => (window as any).__kupua_store__.getState().setFocusedImageId(null));
  const media = await densityDrivers.visibleMediaReadiness(page, "justified", await page.evaluate(() => performance.now()));
  expect(media.mediaCensored).toBe(0);
  const snapshot = await page.evaluateHandle(() => {
    const region = document.querySelector<HTMLElement>('[aria-label="Image results justified"]')!;
    const bounds = region.getBoundingClientRect();
    const cell = [...region.querySelectorAll<HTMLElement>('[data-grid-cell][data-image-id]')].find(cell => {
      const rect = cell.getBoundingClientRect();
      return rect.top >= bounds.top + 20 && rect.bottom < bounds.bottom - 20;
    })!;
    const image = cell.querySelector("img")!;
    return { region, cell, image, source: image.getAttribute("src")!, scrollTop: region.scrollTop,
      distance: cell.getBoundingClientRect().bottom - bounds.top + 40 };
  });
  try {
    await snapshot.evaluate(snapshot => { snapshot.region.scrollTop += snapshot.distance; });
    await page.waitForFunction(snapshot => snapshot.cell.isConnected
      && snapshot.cell.getBoundingClientRect().bottom < snapshot.region.getBoundingClientRect().top, snapshot);
    await snapshot.evaluate(snapshot => { snapshot.image.removeAttribute("src"); snapshot.region.scrollTop = snapshot.scrollTop; });
    await page.waitForFunction(snapshot => {
      const rect = snapshot.cell.getBoundingClientRect();
      const bounds = snapshot.region.getBoundingClientRect();
      return rect.top >= bounds.top && rect.bottom <= bounds.bottom;
    }, snapshot);
    await page.evaluate(async () => { await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); });
    const reentry = await snapshot.evaluate(snapshot => ({ sameElement: snapshot.cell.querySelector("img") === snapshot.image,
      sourceAbsent: !snapshot.image.hasAttribute("src"), naturalWidth: snapshot.image.naturalWidth }));
    expect(reentry).toEqual({ sameElement: true, sourceAbsent: true, naturalWidth: 0 });
    await snapshot.evaluate(snapshot => { snapshot.image.src = snapshot.source; });
    await page.waitForFunction(snapshot => snapshot.image.complete && snapshot.image.naturalWidth > 0, snapshot);
    console.log(JSON.stringify({ fixture: "f2-actual-renderer-reentry", ...reentry, explicitReadmissionRecovered: true }));
  } finally {
    await snapshot.evaluate(snapshot => { snapshot.image.src = snapshot.source; });
    await snapshot.dispose();
  }
});

for (const density of ["grid", "justified"] as const) {
  for (const [direction, atCapacity, moving, media, pixelCheck, interior = false, transport = "normal", freezeBoundary = false, retainKnownRows = false] of [
    ["forward", false, false, "svg", false], ["backward", false, false, "svg", false],
    ["backward", true, false, "svg", false], ["backward", true, true, "svg", false],
    ["backward", true, false, "jpeg", false], ["backward", true, true, "jpeg", false],
    ["backward", true, false, "jpeg", true],
    ["backward", true, false, "identity", false],
    ["backward", true, false, "identity", false, true],
    ["backward", true, false, "identity", false, true, "inline"],
    ["backward", true, false, "identity", false, true, "held-repeat"],
    ["backward", true, false, "identity", false, false, "normal", true],
    ["backward", true, false, "identity", false, false, "normal", false, true],
  ] as const) {
    if ((freezeBoundary || retainKnownRows) && density === "grid") continue;
    test(`${density} ${direction}${atCapacity ? " at capacity" : ""}${moving ? " during motion" : ""}${media === "jpeg" ? " raster" : ""}${pixelCheck ? " pixel-check" : ""}${media === "identity" ? " identity-filmstrip" : ""}${interior ? " interior" : ""}${transport === "normal" ? "" : ` ${transport}`}${freezeBoundary ? " frozen-boundary" : ""}${retainKnownRows ? " true-ratio-boundary" : ""}: held refill measures blocking and preserves the stopped position`, async ({ page }) => {
      const capturePublication = direction === "backward";
      const palette = Array.from({ length: 512 }, (_, index) =>
        [32 + ((index >> 6) & 7) * 30, 32 + ((index >> 3) & 7) * 30, 32 + (index & 7) * 30]);
      const identityImages = media === "identity" ? (await page.evaluate(palette => {
        const canvas = document.createElement("canvas");
        canvas.width = 400;
        canvas.height = 300;
        const context = canvas.getContext("2d")!;
        return palette.map(color => {
          context.fillStyle = `rgb(${color.join(",")})`;
          context.fillRect(0, 0, 400, 300);
          context.fillStyle = `rgb(${color.map(channel => 255 - channel).join(",")})`;
          context.fillRect(200, 0, 200, 300);
          context.fillStyle = "black";
          context.fillRect(198, 0, 4, 300);
          context.fillRect(0, 148, 400, 4);
          return canvas.toDataURL("image/png").split(",")[1];
        });
      }, palette)).map(data => Buffer.from(data, "base64")) : [];
      if (transport === "inline") await page.addInitScript(sources => {
        (window as any).__b2IdentitySources = sources;
      }, identityImages.map(data => `data:image/png;base64,${data.toString("base64")}`));
      const retainedPaths = new Set<string>();
      const originalBufferPaths = new Set<string>();
      const publicationImagePaths = new Set<string>();
      const repeatedImages = new Set<string>();
      const repeatWaits = new Set<() => void>();
      let repeatHoldActive = false;
      let publicationActive = false;
      let repeatRequestCount = 0;
      let filmstrip: { session: CDPSession; frames: { data: string; epochMs: number }[];
        reference: Parameters<typeof densityDrivers.analyzeIdentityFrames>[2];
        overflow: boolean; ackFailed: boolean; bytes: number; active: boolean;
        pendingAcks: Set<Promise<unknown>>; windows: { wrongStart: number; wrongEnd: number; shiftStart: number; shiftEnd: number };
        stopEpoch: number; stop: () => Promise<void> } | undefined;
      let pixelControl: { session: CDPSession; clip: { x: number; y: number; width: number; height: number; scale: number };
        baseline: string; blank: string } | undefined;
      let publicationPixels: { data: string; pendingThroughout: boolean; pendingBefore: boolean; pendingAfter: boolean;
        decodeStartedAfterPublicationMs: number; nativeDecodeMs: number | null } | undefined;
      let requestSession: CDPSession | undefined;
      let requests: ReturnType<typeof createRequestProbe> | undefined;
      let baselineRequests: Record<string, number | null> | undefined;
      await page.route("**/*", async route => {
        const url = new URL(route.request().url());
        if (retainKnownRows && url.origin === "http://127.0.0.1:3041" && url.pathname === "/src/lib/windowed-justified-layout.ts") {
          const response = await route.fetch();
          const source = await response.text();
          expect(source.split("const packed =")).toHaveLength(2);
          expect(source.split("const first = context.indexed")).toHaveLength(2);
          return route.fulfill({ response, body: source.replace("const packed =", "let packed =")
            .replace("const first = context.indexed", "packed = __b2RetainKnownRows(packed, start, count, width, dimensions, buildRatioLayout);\nconst first = context.indexed")
            + `\nconst __b2RetainKnownRows = (${retainKnownBoundaryRows.toString()});\n` });
        }
        if (freezeBoundary && url.origin === "http://127.0.0.1:3041" && url.pathname === "/src/lib/windowed-justified-layout.ts") {
          const response = await route.fetch();
          const source = await response.text();
          const original = "ratio: imageRatio(image)";
          expect(source.split(original)).toHaveLength(2);
          return route.fulfill({ response, body: source.replace(original,
            "ratio: globalThis.__b2FrozenBoundary?.get(origin + index) ?? imageRatio(image)") });
        }
        if (capturePublication && url.origin === "http://127.0.0.1:3041" && url.pathname.startsWith("/b2-thumbnail/")) {
          if (media === "identity") {
            const index = Number(url.pathname.match(/img-(\d+)$/)?.[1]);
            if (!Number.isInteger(index)) throw new Error("Invalid synthetic image identity");
            if (publicationActive) {
              publicationImagePaths.add(url.pathname);
              if (publicationImagePaths.size > 512) throw new Error("Publication-image association bound exceeded");
            }
            if (repeatHoldActive && retainedPaths.has(url.pathname)) {
              if (++repeatRequestCount > 256) throw new Error("Repeat-image request bound exceeded");
              repeatedImages.add(url.pathname);
              await new Promise<void>(resolve => {
                const release = () => { clearTimeout(timer); repeatWaits.delete(release); resolve(); };
                const timer = setTimeout(release, 200);
                repeatWaits.add(release);
              });
            }
            return route.fulfill({ contentType: "image/png", body: identityImages[index % palette.length] });
          }
          if (media === "jpeg") return route.fulfill({ contentType: "image/jpeg",
            path: fileURLToPath(new URL("../../../image-loader/test/resources/guardian-turner.jpg", import.meta.url)) });
          return route.fulfill({ contentType: "image/svg+xml", body:
            '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><path fill="#567" d="M0 0h400v300H0z"/></svg>' });
        }
        if (capturePublication && url.origin === "http://127.0.0.1:3041" && url.pathname === "/src/lib/image-urls.ts") {
          const response = await route.fetch();
          const source = await response.text();
          const original = "if (!S3_PROXY_ENABLED) return undefined;";
          const enabled = "S3_PROXY_ENABLED || SYNTHETIC_PREVIEW_ENABLED";
          expect(source.split(original)).toHaveLength(2);
          expect(source.split(enabled)).toHaveLength(2);
          return route.fulfill({ response, body: source.replace(original, transport === "inline"
            ? 'return globalThis.__b2IdentitySources[Number(image.id.replace("img-", "")) % 512];'
            : 'return "/b2-thumbnail/" + image.id;')
            .replace(enabled, "true") });
        }
        const localAsset = url.origin === "http://127.0.0.1:3041" &&
          !/^\/(es|api|grid-|s3|imgproxy|bedrock)/.test(url.pathname);
        return localAsset ? route.continue() : route.fulfill({ status: 404, body: "isolated fixture" });
      });
      await page.goto("/search?nonFree=true");
      await page.waitForFunction(() => Boolean((window as any).__kupua_store__));
      await page.evaluate(async () => {
        const path = "/src/dal/mock-data-source.ts";
        const { MockDataSource } = await import(path);
        const store = (window as any).__kupua_store__;
        store.setState({ dataSource: new MockDataSource(70000) });
        await store.getState().search();
      });
      await establishDensitySource(page);
      await selectDensity(page, density);
      await waitForPlacement(page, density, true);
      await waitForDensityMaintenanceCooldown(page);
      if (atCapacity) await prepareDensityMaintenance(page, density);
      await page.evaluate(async ({ density, direction, interior }) => {
        const state = (window as any).__kupua_store__.getState();
        const source = state.dataSource;
        const original = source.searchAfter;
        let release!: () => void;
        const gate = new Promise<void>(resolve => { release = resolve; });
        const probe = { reads: 0, forwardReads: 0, backwardReads: 0, held: false, length: state.results.length,
          offset: state.bufferOffset, tailId: state.results.at(-1)?.id, release,
          restore: () => { source.searchAfter = original; }, anchor: "", top: 0,
          phase: "held", phases: [] as string[] };
        (window as any).__heldRefill = probe;
        source.searchAfter = async (...args: unknown[]) => {
          probe.reads++;
          probe.phases.push(probe.phase);
          if (args[4]) probe.backwardReads++;
          else probe.forwardReads++;
          if (Boolean(args[4]) === (direction === "backward")) {
            probe.held = true;
            await gate;
          }
          return original.apply(source, args);
        };
        const region = document.querySelector<HTMLElement>(`[aria-label="Image results ${density}"]`)!;
        if (interior) {
          const path = "/src/lib/scroll-geometry-ref.ts";
          const { getLayoutGeometry, getItemLayoutRow } = await import(path);
          region.scrollTop = getItemLayoutRow(getLayoutGeometry(), 96).top;
          void state.extendBackward();
        } else region.scrollTop = direction === "forward" ? region.scrollHeight - region.clientHeight : 0;
      }, { density, direction, interior });
      try {
        await page.waitForFunction(() => (window as any).__heldRefill.held);
        const speed = direction === "forward" ? 1000 : -1000;
        const held = await scrollAtSpeed(page, density, interior ? 0 : speed, 200, { measureBounds: true });
        if (interior) expect(held.bufferEdgeBlockedMs).toBe(0);
        else expect(held.bufferEdgeBlockedMs).toBeGreaterThan(150);
        expect(held.drivenDistancePx).toBe(0);
        expect(await page.evaluate(() => (window as any).__heldRefill.reads)).toBe(1);
        if (capturePublication) {
          const ready = await densityDrivers.visibleMediaReadiness(page, density, await page.evaluate(() => performance.now()));
          expect(ready.mediaCensored).toBe(0);
          requestSession = await page.context().newCDPSession(page);
          await requestSession.send("Network.enable");
          requests = createRequestProbe(requestSession);
          await page.evaluate(installThumbnailProbe, { density });
          await page.evaluate(async ({ density, pixelCheck }) => {
            const probe = (window as any).__heldRefill;
            const store = (window as any).__kupua_store__;
            const path = "/src/lib/scroll-geometry-ref.ts";
            const geometry = (await import(path)).getLayoutGeometry();
            const region = document.querySelector<HTMLElement>(`[aria-label="Image results ${density}"]`)!;
            const bounds = region.getBoundingClientRect();
            const cohort = [...region.querySelectorAll<HTMLElement>("[data-image-id]")].filter(cell => {
              const rect = cell.getBoundingClientRect();
              return rect.bottom > bounds.top && rect.top < bounds.bottom;
            }).map(cell => ({ id: cell.dataset.imageId!, cell, image: cell.querySelector("img")!,
              source: cell.querySelector("img")!.getAttribute("src"),
              top: cell.getBoundingClientRect().top - bounds.top -
                parseFloat(getComputedStyle(cell).translate.split(/\s+/)[1] ?? "0") }));
            if (cohort.length === 0 || cohort.length > 128) throw new Error("Publication cohort outside bound");
            const capture = { cohortCount: cohort.length, publishedAt: null as number | null,
              initialCount: store.getState().results.length, initialOffset: store.getState().bufferOffset,
              columns: "layout" in geometry ? null : geometry.columns,
              samples: [] as { at: number; after: boolean; missing: number; replacedCells: number;
                replacedImages: number; changedSources: number; unloaded: number; minDeltaPx: number;
                maxDeltaPx: number; anchorDeltaPx: number | null }[],
              frame: 0, overflow: false, calibrating: false, unsubscribe: () => {}, restoreDecode: () => {},
              anchorId: "", anchorDecode: null as { pending: boolean; startedAt: number; finishedAt: number | null } | null };
            const anchorId = (window as any).__kupua_getViewportAnchorId__();
            capture.anchorId = anchorId;
            if (pixelCheck) {
              const originalDecode = HTMLImageElement.prototype.decode;
              const originalImage = cohort.find(item => item.id === anchorId)!.image;
              const observedDecode = function(this: HTMLImageElement) {
                const promise = originalDecode.call(this);
                if (this !== originalImage && this.closest<HTMLElement>("[data-image-id]")?.dataset.imageId === anchorId) {
                  const call = { pending: true, startedAt: performance.now(), finishedAt: null as number | null };
                  capture.anchorDecode = call;
                  const finish = () => { call.pending = false; call.finishedAt = performance.now(); };
                  void promise.then(finish, finish);
                }
                return promise;
              };
              HTMLImageElement.prototype.decode = observedDecode;
              capture.restoreDecode = () => {
                if (HTMLImageElement.prototype.decode === observedDecode) HTMLImageElement.prototype.decode = originalDecode;
              };
            }
            const initialGeneration = store.getState()._prependGeneration;
            capture.unsubscribe = store.subscribe((state: any) => {
              if (state._prependGeneration > initialGeneration && capture.publishedAt === null) capture.publishedAt = performance.now();
            });
            const sample = () => {
              if (capture.calibrating) { capture.frame = requestAnimationFrame(sample); return; }
              if (capture.samples.length >= 512) { capture.overflow = true; return; }
              const bounds = region.getBoundingClientRect();
              const row = { at: performance.now(), after: capture.publishedAt !== null,
                missing: 0, replacedCells: 0, replacedImages: 0, changedSources: 0, unloaded: 0,
                minDeltaPx: Infinity, maxDeltaPx: -Infinity, anchorDeltaPx: null as number | null };
              for (const original of cohort) {
                const cell = region.querySelector<HTMLElement>(`[data-image-id="${CSS.escape(original.id)}"]`);
                if (!cell) { row.missing++; continue; }
                const image = cell.querySelector("img");
                row.replacedCells += Number(cell !== original.cell);
                row.replacedImages += Number(image !== original.image);
                row.changedSources += Number(image?.getAttribute("src") !== original.source);
                row.unloaded += Number(!image?.complete || image.naturalWidth === 0);
                const top = cell.getBoundingClientRect().top - bounds.top -
                  parseFloat(getComputedStyle(cell).translate.split(/\s+/)[1] ?? "0");
                row.minDeltaPx = Math.min(row.minDeltaPx, top - original.top);
                row.maxDeltaPx = Math.max(row.maxDeltaPx, top - original.top);
                if (original.id === anchorId) row.anchorDeltaPx = top - original.top;
              }
              capture.samples.push(row);
              capture.frame = requestAnimationFrame(sample);
            };
            probe.capture = capture;
            sample();
          }, { density, pixelCheck });
          await page.waitForTimeout(300);
          await page.evaluate(() => {
            (window as any).__heldRefill.capture.baseline = (window as any).__kupua_thumbnailProbe.stop();
          });
          baselineRequests = requests.snapshot();
          if (media === "identity") {
            const reference = await page.evaluate(async ({ density, palette }) => {
              const capture = (window as any).__heldRefill.capture;
              const path = "/src/lib/scroll-geometry-ref.ts";
              const geometry = (await import(path)).getLayoutGeometry();
              capture.identityLayout = "layout" in geometry ? geometry.layout : null;
              const state = (window as any).__kupua_store__.getState();
              const region = document.querySelector<HTMLElement>(`[aria-label="Image results ${density}"]`)!;
              const bounds = region.getBoundingClientRect();
              const identityTargets = [...region.querySelectorAll<HTMLElement>("[data-image-id]")].map(cell => {
                const rect = cell.querySelector("img")!.getBoundingClientRect();
                return { id: cell.dataset.imageId!, source: cell.querySelector("img")!.getAttribute("src"),
                  localIndex: state.imagePositions.get(cell.dataset.imageId) - state.bufferOffset,
                  x: rect.left + rect.width / 4, checkX: rect.left + rect.width * 3 / 4,
                  y: rect.top + rect.height / 4,
                  paletteIndex: Number(cell.dataset.imageId!.replace("img-", "")) % palette.length };
              }).filter(target => target.x > bounds.left && target.x < bounds.right && target.y > bounds.top && target.y < bounds.bottom);
              capture.identityTargets = identityTargets;
              const targets = identityTargets.map(({ id: _identity, source: _source, localIndex: _local, ...target }) => target);
              const image = region.querySelector(`[data-image-id="${CSS.escape(capture.anchorId)}"] img`)!;
              const rect = image.getBoundingClientRect();
              return { width: innerWidth, height: innerHeight, palette, targets,
                anchor: { centerX: rect.left + rect.width / 2, centerY: rect.top + rect.height / 2,
                  sampleX: rect.left + rect.width / 4, sampleY: rect.top + rect.height / 4 } };
            }, { density, palette });
            const association = await page.evaluate(() => ({
              visible: (window as any).__heldRefill.capture.identityTargets.map((target: { id: string }) => `/b2-thumbnail/${target.id}`),
              buffer: (window as any).__kupua_store__.getState().results.map((image: any) => `/b2-thumbnail/${image.id}`),
            }));
            for (const path of association.visible) retainedPaths.add(path);
            for (const path of association.buffer) originalBufferPaths.add(path);
            const session = await page.context().newCDPSession(page);
            const capture = { session, reference, frames: [] as { data: string; epochMs: number }[],
              overflow: false, ackFailed: false, bytes: 0, active: true, pendingAcks: new Set<Promise<unknown>>(),
              windows: { wrongStart: 0, wrongEnd: 0, shiftStart: 0, shiftEnd: 0 }, stopEpoch: 0,
              stop: async () => {} };
            const receive = (event: { data: string; sessionId: number; metadata: { timestamp?: number } }) => {
              if (capture.active) {
                if (capture.frames.length >= 128 || capture.bytes + event.data.length > 16 * 1024 * 1024) capture.overflow = true;
                else {
                  capture.bytes += event.data.length;
                  capture.frames.push({ data: event.data, epochMs: (event.metadata.timestamp ?? NaN) * 1000 });
                }
              }
              const acknowledgment = session.send("Page.screencastFrameAck", { sessionId: event.sessionId })
                .catch(() => { capture.ackFailed = true; });
              capture.pendingAcks.add(acknowledgment);
              void acknowledgment.finally(() => capture.pendingAcks.delete(acknowledgment));
            };
            capture.stop = async () => {
              if (!capture.active) return;
              await session.send("Page.stopScreencast");
              capture.active = false;
              await Promise.all(capture.pendingAcks);
              session.off("Page.screencastFrame", receive);
              capture.stopEpoch = await page.evaluate(() => performance.timeOrigin + performance.now());
            };
            filmstrip = capture;
            session.on("Page.screencastFrame", receive);
            await session.send("Page.startScreencast", { format: "png", everyNthFrame: 1,
              maxWidth: reference.width, maxHeight: reference.height });
            await expect.poll(() => capture.frames.length).toBeGreaterThan(0);
            capture.windows.wrongStart = await page.evaluate(async () => {
              const capture = (window as any).__heldRefill.capture;
              capture.calibrating = true;
              const image = document.querySelector<HTMLImageElement>(`[data-image-id="${CSS.escape(capture.anchorId)}"] img`)!;
              capture.originalSource = image.getAttribute("src");
              const start = performance.timeOrigin + performance.now();
              image.src = `/b2-thumbnail/img-${Number(capture.anchorId.replace("img-", "")) + 1}`;
              await image.decode();
              return start;
            });
            await page.waitForTimeout(150);
            capture.windows.wrongEnd = await page.evaluate(async () => {
              const capture = (window as any).__heldRefill.capture;
              const image = document.querySelector<HTMLImageElement>(`[data-image-id="${CSS.escape(capture.anchorId)}"] img`)!;
              const end = performance.timeOrigin + performance.now();
              image.src = capture.originalSource;
              await image.decode();
              return end;
            });
            await page.waitForTimeout(100);
            const shift = await page.evaluate(() => {
              const capture = (window as any).__heldRefill.capture;
              const cell = document.querySelector<HTMLElement>(`[data-image-id="${CSS.escape(capture.anchorId)}"]`)!;
              capture.originalTranslate = cell.style.translate;
              capture.originalTranslatePriority = cell.style.getPropertyPriority("translate");
              const before = cell.getBoundingClientRect().top;
              const start = performance.timeOrigin + performance.now();
              cell.style.setProperty("translate", "0 8px", "important");
              return { start, actualDy: cell.getBoundingClientRect().top - before };
            });
            capture.windows.shiftStart = shift.start;
            console.log(JSON.stringify({ fixture: "B2-filmstrip-shift-control", density, actualDy: shift.actualDy }));
            expect(shift.actualDy).toBeCloseTo(8, 2);
            await page.waitForTimeout(150);
            capture.windows.shiftEnd = await page.evaluate(() => {
              const capture = (window as any).__heldRefill.capture;
              const cell = document.querySelector<HTMLElement>(`[data-image-id="${CSS.escape(capture.anchorId)}"]`)!;
              const end = performance.timeOrigin + performance.now();
              cell.style.setProperty("translate", capture.originalTranslate, capture.originalTranslatePriority);
              return end;
            });
            await page.waitForTimeout(100);
            await page.evaluate(() => { (window as any).__heldRefill.capture.calibrating = false; });
          }
          if (pixelCheck) {
            const clip = await page.evaluate(() => {
              const capture = (window as any).__heldRefill.capture;
              const image = document.querySelector(`[data-image-id="${CSS.escape(capture.anchorId)}"] img`)!;
              const rect = image.getBoundingClientRect();
              return { x: Math.ceil(rect.left + rect.width * 0.1), y: Math.ceil(rect.top + rect.height * 0.1),
                width: Math.floor(rect.width * 0.8), height: Math.floor(rect.height * 0.8), scale: 1 };
            });
            expect(clip.width * clip.height).toBeGreaterThan(100);
            expect(clip.width * clip.height).toBeLessThan(250000);
            const session = await page.context().newCDPSession(page);
            pixelControl = { session, clip, baseline: "", blank: "" };
            pixelControl.baseline = (await session.send("Page.captureScreenshot", { format: "png", clip })).data;
            await page.evaluate(() => {
              const capture = (window as any).__heldRefill.capture;
              const image = document.querySelector<HTMLImageElement>(`[data-image-id="${CSS.escape(capture.anchorId)}"] img`)!;
              image.style.visibility = "hidden";
            });
            pixelControl.blank = (await session.send("Page.captureScreenshot", { format: "png", clip })).data;
            await page.evaluate(() => {
              const capture = (window as any).__heldRefill.capture;
              document.querySelector<HTMLImageElement>(`[data-image-id="${CSS.escape(capture.anchorId)}"] img`)!.style.removeProperty("visibility");
            });
          }
          requests.beginPhase();
          await page.evaluate(installThumbnailProbe, { density });
        }
        repeatHoldActive = transport === "held-repeat";
        publicationActive = true;
        if (media === "svg") await page.evaluate(densityDrivers.installDensityJourney,
          { density, direction: direction === "forward" ? 1 as const : -1 as const });
        if (retainKnownRows) {
          const knownCount = await page.evaluate(() => {
            const capture = (window as any).__heldRefill.capture;
            const layout = capture.identityLayout;
            const ordinal = layout.origin + capture.identityTargets[0].localIndex;
            const start = Math.floor(ordinal / 48) * 48;
            const known = Array.from({ length: 48 }, (_, index) => ({ index, ...layout.dimensions.get(start + index) }))
              .filter(value => value.id);
            (window as any).__b2TrueRatioBoundary = { start, known, width: layout.window.width, applications: 0,
              ratios: Array.from({ length: 48 }, (_, index) => layout.dimensions.get(start + index)?.ratio ?? 1) };
            return known.length;
          });
          expect(knownCount).toBe(4);
        }
        if (freezeBoundary) {
          const count = await page.evaluate(() => {
            const capture = (window as any).__heldRefill.capture;
            const layout = capture.identityLayout;
            const ordinal = layout.origin + capture.identityTargets[0].localIndex;
            const start = Math.floor(ordinal / 48) * 48;
            (window as any).__b2FrozenBoundary = new Map(Array.from({ length: 48 }, (_, index) =>
              [start + index, layout.dimensions.get(start + index)?.ratio ?? 1]));
            return (window as any).__b2FrozenBoundary.size;
          });
          expect(count).toBe(48);
        }
        await page.evaluate(({ density, moving }) => {
          const probe = (window as any).__heldRefill;
          const region = document.querySelector(`[aria-label="Image results ${density}"]`)!;
          probe.anchor = (window as any).__kupua_getViewportAnchorId__();
          const cell = region.querySelector(`[data-image-id="${CSS.escape(probe.anchor)}"]`)!;
          probe.top = cell.getBoundingClientRect().top - region.getBoundingClientRect().top -
            parseFloat(getComputedStyle(cell).translate.split(/\s+/)[1] ?? "0");
          probe.phase = "released";
          if (moving) probe.releaseTimer = setTimeout(probe.release, 80);
          else probe.release();
        }, { density, moving });
        if (pixelControl) {
          await page.waitForFunction(() => Boolean((window as any).__heldRefill.capture.anchorDecode));
          const before = await page.evaluate(() => ({ ...(window as any).__heldRefill.capture.anchorDecode,
            publishedAt: (window as any).__heldRefill.capture.publishedAt }));
          const screenshot = await pixelControl.session.send("Page.captureScreenshot", { format: "png", clip: pixelControl.clip });
          const after = await page.evaluate(() => ({ ...(window as any).__heldRefill.capture.anchorDecode }));
          publicationPixels = { data: screenshot.data,
            pendingThroughout: before.pending && after.pending && before.startedAt === after.startedAt,
            pendingBefore: before.pending, pendingAfter: after.pending,
            decodeStartedAfterPublicationMs: before.startedAt - before.publishedAt,
            nativeDecodeMs: before.startedAt === after.startedAt && after.finishedAt !== null
              ? after.finishedAt - after.startedAt : null };
        }
        const publicationMotion = moving
          ? await scrollAtSpeed(page, density, speed, 400, { measureBounds: true, captureSteps: true }) : null;
        const publicationReversal = moving
          ? await scrollAtSpeed(page, density, -speed, 400, { measureBounds: true, captureSteps: true }) : null;
        const drivenOffset = (publicationMotion?.drivenDistancePx ?? 0) + (publicationReversal?.drivenDistancePx ?? 0);
        await page.waitForFunction(() => {
          const state = (window as any).__kupua_store__.getState();
          const probe = (window as any).__heldRefill;
          return (state.results.length > probe.length || state.bufferOffset < probe.offset) &&
            !state._extendForwardInFlight && !state._extendBackwardInFlight;
        });
        if (atCapacity) {
          const retention = await page.evaluate(async () => {
            const path = "/src/constants/tuning.ts";
            const { BUFFER_CAPACITY, PAGE_SIZE } = await import(path);
            const state = (window as any).__kupua_store__.getState();
            const probe = (window as any).__heldRefill;
            return { before: probe.length, after: state.results.length,
              capacity: BUFFER_CAPACITY, expectedPrepend: PAGE_SIZE,
              prepend: probe.offset - state.bufferOffset,
              tailRetained: state.results.some((image: any) => image?.id === probe.tailId) };
          });
          expect(retention.before).toBe(retention.capacity);
          expect(retention.after).toBe(retention.capacity);
          expect(retention.prepend).toBe(retention.expectedPrepend);
          expect(retention.tailRetained).toBe(false);
        }
        await expect.poll(() => page.evaluate(({ density, drivenOffset }) => {
          const probe = (window as any).__heldRefill;
          const region = document.querySelector(`[aria-label="Image results ${density}"]`)!;
          const cell = region.querySelector(`[data-image-id="${CSS.escape(probe.anchor)}"]`);
          return cell ? Math.abs(cell.getBoundingClientRect().top - region.getBoundingClientRect().top -
            parseFloat(getComputedStyle(cell).translate.split(/\s+/)[1] ?? "0") - probe.top + drivenOffset) : Infinity;
        }, { density, drivenOffset })).toBeLessThanOrEqual(1);
        if (capturePublication) {
          await page.evaluate(async () => {
            const capture = (window as any).__heldRefill.capture;
            while (capture.publishedAt === null || performance.now() - capture.publishedAt < 500) {
              await new Promise(requestAnimationFrame);
            }
            cancelAnimationFrame(capture.frame);
            capture.unsubscribe();
          });
          if ((publicationMotion && !publicationMotion.steps) ||
              (publicationReversal && (!publicationReversal.steps || !publicationMotion))) {
            throw new Error("Moving publication requires captured input steps");
          }
          const steps = [...publicationMotion?.steps ?? [], ...publicationReversal?.steps?.map(step =>
            ({ ...step, drivenDistancePx: step.drivenDistancePx + publicationMotion!.drivenDistancePx })) ?? []];
          const attribution = await page.evaluate(steps => {
            const capture = (window as any).__heldRefill.capture;
            const samples = capture.samples.map((sample: any) => {
              const applied = steps.findLast(step => step.at <= sample.at)?.drivenDistancePx ?? 0;
              return { ...sample, shiftPx: Number.isFinite(sample.minDeltaPx)
                ? Math.max(Math.abs(sample.minDeltaPx + applied), Math.abs(sample.maxDeltaPx + applied)) : null,
                anchorShiftPx: sample.anchorDeltaPx === null ? null : Math.abs(sample.anchorDeltaPx + applied) };
            });
            const maxima = (samples: typeof capture.samples) => Object.fromEntries(
              ["missing", "replacedCells", "replacedImages", "changedSources", "unloaded", "shiftPx", "anchorShiftPx"].map(key =>
                [key, Math.max(0, ...samples.map((sample: any) => sample[key] ?? 0))]));
            const firstReplacement = samples.find((sample: any) => sample.after && sample.replacedImages > 0);
            const firstLoaded = samples.find((sample: any) => sample.after &&
              sample.replacedImages === capture.cohortCount && sample.missing === 0 && sample.unloaded === 0);
            return { cohortCount: capture.cohortCount, overflow: capture.overflow,
              publishedAt: capture.publishedAt,
              firstReplacementAfterPublicationMs: firstReplacement ? firstReplacement.at - capture.publishedAt : null,
              firstLoadedReplacementCohortAfterPublicationMs: firstLoaded ? firstLoaded.at - capture.publishedAt : null,
              initialCount: capture.initialCount, columns: capture.columns,
              initialColumnRemainder: capture.columns === null ? null : capture.initialOffset % capture.columns,
              prependCount: capture.initialOffset - (window as any).__kupua_store__.getState().bufferOffset,
              beforeFrames: samples.filter((sample: any) => !sample.after).length,
              afterFrames: samples.filter((sample: any) => sample.after).length,
              before: maxima(samples.filter((sample: any) => !sample.after)),
              after: maxima(samples.filter((sample: any) => sample.after)),
              anchorMissingFrames: samples.filter((sample: any) => sample.anchorDeltaPx === null).length,
              baseline: capture.baseline,
              motion: (window as any).__kupua_thumbnailProbe.stop() };
          }, steps);
          expect(attribution.overflow).toBe(false);
          expect(attribution.beforeFrames).toBeGreaterThan(0);
          expect(attribution.afterFrames).toBeGreaterThan(0);
          expect(attribution.before.missing).toBe(0);
          expect(attribution.before.unloaded).toBe(0);
          const publicationRequests = requests!.snapshot();
          expect(publicationRequests.requestCaptureOverflow).toBe(0);
          if (filmstrip) {
            publicationActive = false;
            await filmstrip.stop();
            expect(filmstrip.overflow).toBe(false);
            expect(filmstrip.ackFailed).toBe(false);
            const analyzed = await densityDrivers.analyzeIdentityFrames(page, filmstrip.frames, filmstrip.reference);
            const windows = filmstrip.windows;
            const wrong = analyzed.filter(frame => frame.epochMs >= windows.wrongStart && frame.epochMs <= windows.wrongEnd);
            const shifted = analyzed.filter(frame => frame.epochMs >= windows.shiftStart && frame.epochMs <= windows.shiftEnd);
            console.log(JSON.stringify({ fixture: "B2-filmstrip-calibration", density,
              shiftWindowMs: windows.shiftEnd - windows.shiftStart,
              frames: analyzed.filter(frame => frame.epochMs >= windows.shiftStart - 100 && frame.epochMs <= windows.shiftEnd + 100)
                .map(frame => ({ atMs: frame.epochMs - windows.shiftStart, dx: frame.anchorDx, dy: frame.anchorDy })) }));
            expect(wrong.some(frame => frame.wrongIdentities > 0)).toBe(true);
            expect(shifted.some(frame => frame.anchorDy !== null && frame.anchorDy >= 7 && frame.anchorDy <= 9)).toBe(true);
            const publicationEpoch = await page.evaluate(() => performance.timeOrigin + (window as any).__heldRefill.capture.publishedAt);
            const publication = analyzed.filter(frame => frame.epochMs >= publicationEpoch);
            expect(publication.length).toBeGreaterThan(0);
            const affected = [...new Set(publication.flatMap(frame => [
              ...frame.wrongTargets.map(target => target.index), ...frame.unknownTargets]).concat(freezeBoundary || retainKnownRows ? [0] : []))];
            const witnesses = await page.evaluate(async indices => {
              const capture = (window as any).__heldRefill.capture;
              const path = "/src/lib/scroll-geometry-ref.ts";
              const geometry = (await import(path)).getLayoutGeometry();
              const currentLayout = "layout" in geometry ? geometry.layout : null;
              const state = (window as any).__kupua_store__.getState();
              const snapshot = (layout: any, index: number) => {
                if (!(layout?.dimensions instanceof Map)) return null;
                const ordinal = layout.origin + index;
                const blockStart = Math.floor(ordinal / 48) * 48;
                const box = layout.getBox(index);
                return { origin: layout.origin, ordinal, blockStart,
                  knownDimensions: Array.from({ length: 48 }, (_, offset) => layout.dimensions.has(blockStart + offset)).filter(Boolean).length,
                  ratios: Array.from({ length: 48 }, (_, offset) => layout.dimensions.get(blockStart + offset)?.ratio ?? 1),
                  left: box.left, width: box.width, height: box.height };
              };
              return indices.map(index => {
                const target = capture.identityTargets[index];
                const cell = document.querySelector<HTMLElement>(`[data-image-id="${CSS.escape(target.id)}"]`)!;
                const image = cell.querySelector("img")!;
                const rect = image.getBoundingClientRect();
                const occupant = document.elementFromPoint(target.x, target.y)?.closest<HTMLElement>("[data-image-id]");
                const before = snapshot(capture.identityLayout, target.localIndex);
                const after = snapshot(currentLayout, state.imagePositions.get(target.id) - state.bufferOffset);
                return { index, expectedPaletteIndex: target.paletteIndex,
                  pointDx: rect.left + rect.width / 4 - target.x, pointDy: rect.top + rect.height / 4 - target.y,
                  sourceMatches: image.getAttribute("src") === target.source,
                  loaded: image.complete && image.naturalWidth > 0,
                  geometryBefore: before, geometryAfter: after,
                  originalPointStillOwned: occupant?.dataset.imageId === target.id,
                  occupantPaletteIndex: occupant ? Number(occupant.dataset.imageId!.replace("img-", "")) % 512 : null };
              });
            }, affected);
            if (freezeBoundary || retainKnownRows) {
              expect(publication.every(frame => frame.wrongIdentities === 0 && frame.unknownPixels === 0)).toBe(true);
              expect(Math.abs(witnesses[0].pointDx)).toBeLessThanOrEqual(1);
              expect(Math.abs(witnesses[0].pointDy)).toBeLessThanOrEqual(1);
            }
            if (retainKnownRows) {
              const ratios = await page.evaluate(async () => {
                const path = "/src/lib/scroll-geometry-ref.ts";
                const geometry = (await import(path)).getLayoutGeometry();
                const state = (window as any).__kupua_store__.getState();
                const errors = state.results.map((image: any, index: number) => {
                  const box = geometry.layout.getBox(index);
                  const dimensions = image.source.orientedDimensions ?? image.source.dimensions;
                  return Math.abs(box.width / box.height - dimensions.width / dimensions.height);
                });
                return { count: errors.length, maxError: Math.max(...errors),
                  applications: (window as any).__b2TrueRatioBoundary.applications };
              });
              expect(ratios.count).toBe(1000);
              expect(ratios.applications).toBeGreaterThan(0);
              expect(ratios.maxError).toBeLessThan(0.00001);
              console.log(JSON.stringify({ fixture: "B2-true-ratio-audit", density, ...ratios }));
            }
            const mounted = new Set(await page.evaluate(density => {
              const region = document.querySelector(`[aria-label="Image results ${density}"]`)!;
              return [...region.querySelectorAll<HTMLElement>("[data-image-id]")].map(cell => `/b2-thumbnail/${cell.dataset.imageId}`);
            }, density));
            const times = [publicationEpoch, ...publication.map(frame => frame.epochMs), filmstrip.stopEpoch];
            console.log(JSON.stringify({ fixture: "B2-identity-filmstrip", density, interior, transport, freezeBoundary, retainKnownRows, classifierRevision: 2,
              targetCount: filmstrip.reference.targets.length, totalFrames: analyzed.length,
              repeatRequestCount, repeatedImageCount: repeatedImages.size,
              repeatHoldExercised: transport === "held-repeat" ? repeatRequestCount > 0 : null,
              requestedImages: publicationImagePaths.size,
              requestedVisibleTargets: [...publicationImagePaths].filter(path => retainedPaths.has(path)).length,
              requestedOutsideOriginalBuffer: [...publicationImagePaths].filter(path => !originalBufferPaths.has(path)).length,
              requestedOutsideFinalMounted: [...publicationImagePaths].filter(path => !mounted.has(path)).length,
              wrongCalibrationFrames: wrong.filter(frame => frame.wrongIdentities > 0).length,
              shiftCalibrationFrames: shifted.filter(frame => frame.anchorDy !== null && frame.anchorDy >= 7).length,
              witnesses,
              maxCaptureGapMs: Math.max(...times.slice(1).map((time, index) => time - times[index])),
              publicationFrames: publication.map(frame => ({ ...frame, epochMs: frame.epochMs - publicationEpoch })) }));
          }
          if (moving) {
            expect(attribution.publishedAt).toBeGreaterThan(publicationMotion!.startedAtPerformanceMs!);
            expect(attribution.publishedAt).toBeLessThan(publicationMotion!.stoppedAtPerformanceMs!);
            expect(publicationMotion!.drivenDistancePx).toBeLessThan(-150);
            expect(publicationReversal!.drivenDistancePx).toBeGreaterThan(300);
            expect(publicationReversal!.bufferEdgeBlockedMs).toBe(0);
          }
          if (pixelControl && publicationPixels) {
            const pixels = await page.evaluate(async ({ baseline, blank, publication }) => {
              const read = async (data: string) => {
                const blob = await (await fetch(`data:image/png;base64,${data}`)).blob();
                const bitmap = await createImageBitmap(blob);
                const canvas = document.createElement("canvas");
                canvas.width = bitmap.width;
                canvas.height = bitmap.height;
                const context = canvas.getContext("2d")!;
                context.drawImage(bitmap, 0, 0);
                bitmap.close();
                return context.getImageData(0, 0, canvas.width, canvas.height).data;
              };
              const reference = await read(baseline);
              const compare = async (data: string) => {
                const current = await read(data);
                if (current.length !== reference.length) throw new Error("Pixel-control dimensions changed");
                let total = 0;
                let different = 0;
                for (let index = 0; index < reference.length; index += 4) {
                  const delta = (Math.abs(current[index] - reference[index]) + Math.abs(current[index + 1] - reference[index + 1]) +
                    Math.abs(current[index + 2] - reference[index + 2])) / 3;
                  total += delta;
                  if (delta > 32) different++;
                }
                return { meanChannelDifference: total / (reference.length / 4), differentPixelRatio: different / (reference.length / 4) };
              };
              return { hidden: await compare(blank), publication: await compare(publication) };
            }, { baseline: pixelControl.baseline, blank: pixelControl.blank, publication: publicationPixels.data });
            expect(pixels.hidden.meanChannelDifference).toBeGreaterThan(10);
            const { data: _pixels, ...timing } = publicationPixels;
            console.log(JSON.stringify({ fixture: "B2-publication-pixels", density,
              ...timing, ...pixels }));
          }
          console.log(JSON.stringify({ fixture: "B2-publication", density, atCapacity, moving, media, pixelCheck, interior, transport,
            drivenBackwardPx: publicationMotion?.drivenDistancePx ?? 0,
            drivenReversalPx: publicationReversal?.drivenDistancePx ?? 0, attribution,
            baselineRequests, publicationRequests }));
        }
        if (media === "svg") {
          const journey = await page.evaluate(() => {
            const result = (window as any).__densityJourney.snapshot();
            (window as any).__densityJourney.dispose();
            return result;
          });
          expect(journey[direction === "forward" ? "appendPublications" : "prependPublications"]).toBe(1);
          expect(journey.retainedComparisons).toBeGreaterThan(0);
          expect(journey.journeyOverflow).toBe(0);
          if (atCapacity) expect(journey.evictionPublications).toBe(1);
          if (moving) expect(journey.appliedInputDistancePx).toBeGreaterThan(450);
          console.log(JSON.stringify({ fixture: "journey-held-publication", density, direction, atCapacity, moving, journey }));
        }
        await page.evaluate(() => { (window as any).__heldRefill.phase = "resumed"; });
        const resumed = await scrollAtSpeed(page, density, speed, 200, { measureBounds: true });
        expect(resumed.bufferEdgeBlockedMs).toBe(0);
        expect(Math.abs(resumed.drivenDistancePx)).toBeGreaterThan(150);
        if (atCapacity) {
          const reversed = await scrollAtSpeed(page, density, -speed, 200, { measureBounds: true, captureSteps: true });
          expect(reversed.bufferEdgeBlockedMs).toBe(0);
          expect(reversed.drivenDistancePx, JSON.stringify({ resumed, reversed })).toBeGreaterThan(150);
        }
        console.log(JSON.stringify(await page.evaluate(() => {
          const probe = (window as any).__heldRefill;
          return { heldReadDirections: { forward: probe.forwardReads, backward: probe.backwardReads }, phases: probe.phases };
        })));
        expect(await page.evaluate(() => (window as any).__heldRefill.reads)).toBe(1);
        console.log(JSON.stringify({ fixture: "held-refill", density, direction,
          heldMs: held.bufferEdgeBlockedMs, resumedBlockedMs: resumed.bufferEdgeBlockedMs }));
      } finally {
        for (const release of repeatWaits) release();
        await filmstrip?.stop();
        await filmstrip?.session.detach();
        requests?.dispose();
        await requestSession?.detach();
        await page.evaluate(() => {
          const probe = (window as any).__heldRefill;
          probe?.release();
          probe?.restore();
          clearTimeout(probe?.releaseTimer);
          if (probe?.capture) { cancelAnimationFrame(probe.capture.frame); probe.capture.unsubscribe(); probe.capture.restoreDecode(); }
          (window as any).__kupua_thumbnailProbe?.dispose();
          (window as any).__densityJourney?.dispose();
          delete (window as any).__heldRefill;
          delete (window as any).__b2FrozenBoundary;
          delete (window as any).__b2TrueRatioBoundary;
        });
        await pixelControl?.session.detach();
      }
    });
  }
}
