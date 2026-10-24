import { test, expect, type CDPSession, type BrowserContext } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { electAnchor, establishDensitySource, restoreDensitySource, selectDensity, scrubDensityTo,
  prepareDensityMaintenance, scrollToDensityTail, waitForDensityEviction, waitForPlacement,
  waitForDensityMaintenanceCooldown, scrollAtSpeed,
  prepareDensityRecovery, measureDensityRecovery } from "../density-browser";
import { DENSITY_SCENARIOS, validateDensityRecord } from "../density-reporting.mjs";
import { createRequestProbe } from "../network-probe.mjs";
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
            const source = await response.text();
            const original = "rangeStartMatchesViewport && startIndex <= EXTEND_THRESHOLD && offset > 0";
            expect(source.split(original)).toHaveLength(2);
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
