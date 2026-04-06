/**
 * Scrubber position mapping diagnostic — comprehensive.
 *
 * Captures all coordinate-space values at N positions along the scrubber
 * track for multiple scenarios (sorts, date ranges, viewport sizes).
 * Outputs console tables and JSON reports for analysis.
 *
 * NOT a pass/fail test — purely diagnostic.
 *
 * Run:
 *   npx playwright test --config=playwright.debug.config.ts --headed
 *
 * Output: console tables + kupua/test-results/scrubber-diag-all.json
 */

import { test, expect } from "./shared/helpers";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUT_DIR = path.join(__dirname, "..", "test-results");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScrubberDebug {
  ts: number;
  clientY: number;
  trackTop: number;
  trackHeight: number;
  cursorRatio: number;
  cursorTop: number;
  total: number;
  thumbVisibleCount: number;
  maxThumbTop: number;
  thumbHeight: number;
  scrollPos: number;
  dataPos: number;
  tickPos: number;
  scrollLabel: string | null;
  dataLabel: string | null;
  tickLabel: string | null;
  effectivePosition: number;
}

interface SortCtxDebug {
  ts: number;
  inputPosition: number;
  coveredCount: number;
  totalBuckets: number;
  bucketIndex: number;
  bucketKey: string;
  bucketStartPosition: number;
  bucketCount: number;
  bucketEndPosition: number;
  firstBucketKey: string;
  lastBucketKey: string;
}

interface NullZoneDebug {
  ts: number;
  globalPosition: number;
  total: number;
  coveredCount: number;
  nullZoneSize: number;
  hasNullZoneDist: boolean;
  inNullZone: boolean;
  nullZoneLocalPos: number | null;
  nullZoneBuckets: number;
  nullZoneCoveredCount: number;
}

interface TickInfo {
  position: number;
  px: number;
  label: string;
  type: string;
}

interface SamplePoint {
  step: number;
  hoverY: number;
  cursorRatio: number;
  scrubber: ScrubberDebug | null;
  sortCtx: SortCtxDebug | null;
  nullZone: NullZoneDebug | null;
  nearestTick: TickInfo | null;
  nearestTickDistPx: number | null;
}

interface TickHoverResult {
  tickIndex: number;
  tickPosition: number;
  tickPx: number;
  tickLabel: string;
  tickType: string;
  /** Position computed by positionFromY when hovering at the tick's pixel */
  scrollPos: number;
  /** Position delta: scrollPos - tick.position */
  positionDelta: number;
  /** Sort label from the sort-context debug at this hover point */
  sortCtxBucketKey: string | null;
  sortCtxBucketIndex: number | null;  /** The position that was actually fed to lookupSortDistribution */
  sortCtxInputPosition: number | null;
  /** Did the hovered position land in a different bucket than the tick? */
  bucketCrossed: boolean;
  /** The tooltip label shown at this position */
  tooltipLabel: string | null;
  /** clientY recorded by the scrubber debug — verifies hover coords */
  scrubberClientY: number | null;
  /** Track top recorded by the scrubber — verifies rect alignment */
  scrubberTrackTop: number | null;
  /** Timestamp of scrubber debug — detects stale data */
  scrubberTs: number | null;
  /** Timestamp of sort context debug — detects stale data */
  sortCtxTs: number | null;
}

interface ScenarioReport {
  name: string;
  params: string;
  viewport: { width: number; height: number };
  storeState: Record<string, unknown>;
  distribution: Record<string, unknown> | null;
  trackGeometry: { top: number; height: number; width: number };
  ticks: TickInfo[];
  samples: SamplePoint[];
  tickHoverResults: TickHoverResult[];
  summary: {
    totalSamples: number;
    nearTickSamples: number;
    scrollMatchTick: number;
    dataMatchTick: number;
    tickPosMatchTick: number;
    noneMatch: number;
    nullZoneSamples: number;
    /** New: tick-hover metrics */
    ticksHovered: number;
    bucketsCrossed: number;
    avgPositionDelta: number;
    maxPositionDelta: number;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureOutDir() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

async function waitForDistribution(page: any, timeout = 30_000) {
  await page.waitForFunction(
    () => {
      const store = (window as any).__kupua_store__;
      return store && !!store.getState().sortDistribution;
    },
    { timeout },
  );
}

async function readTicks(page: any): Promise<TickInfo[]> {
  return page.evaluate(() => {
    const els = document.querySelectorAll("[data-debug-tick-position]");
    return Array.from(els).map((el: any) => ({
      position: parseInt(el.dataset.debugTickPosition, 10),
      px: parseFloat(el.dataset.debugTickPx),
      label: el.dataset.debugTickLabel || "",
      type: el.dataset.debugTickType || "",
    }));
  });
}

function findNearestTick(ticks: TickInfo[], cursorRelY: number): { tick: TickInfo; dist: number } | null {
  if (ticks.length === 0) return null;
  let best = ticks[0];
  let bestDist = Math.abs(ticks[0].px - cursorRelY);
  for (const t of ticks) {
    const d = Math.abs(t.px - cursorRelY);
    if (d < bestDist) { best = t; bestDist = d; }
  }
  return { tick: best, dist: bestDist };
}

/** Trigger distribution fetch by hovering the scrubber track. */
async function triggerDistribution(kupua: any) {
  const page = kupua.page;
  await kupua.scrubber.waitFor({ state: "visible", timeout: 10_000 });
  const box = await kupua.scrubber.boundingBox();
  if (!box) throw new Error("Scrubber not visible");
  const x = box.x + box.width / 2;
  await page.mouse.move(x, box.y + box.height * 0.4);
  await page.waitForTimeout(1000);
  await page.mouse.move(x, box.y + box.height * 0.6);
  await page.waitForTimeout(500);
  try {
    await waitForDistribution(page, 30_000);
    console.log("  ✓ Distribution loaded");
  } catch {
    console.log("  ⚠ Distribution did not load within 30s");
  }
  await page.waitForTimeout(500);
}

/** Run a scan across the scrubber track and collect samples. */
async function runScan(
  kupua: any,
  scenarioName: string,
  numSamples: number,
): Promise<ScenarioReport> {
  const page = kupua.page;

  const box = await kupua.scrubber.boundingBox();
  if (!box) throw new Error("Scrubber not visible");

  const storeState = await kupua.getStoreState();
  const dist = await page.evaluate(() => {
    const store = (window as any).__kupua_store__;
    if (!store) return null;
    const d = store.getState().sortDistribution;
    if (!d) return null;
    return {
      bucketCount: d.buckets.length,
      coveredCount: d.coveredCount,
      firstKey: d.buckets[0]?.key,
      lastKey: d.buckets[d.buckets.length - 1]?.key,
    };
  });
  const nullZoneDist = await page.evaluate(() => {
    const store = (window as any).__kupua_store__;
    if (!store) return null;
    const d = store.getState().nullZoneDistribution;
    if (!d) return null;
    return {
      bucketCount: d.buckets.length,
      coveredCount: d.coveredCount,
      firstKey: d.buckets[0]?.key,
      lastKey: d.buckets[d.buckets.length - 1]?.key,
    };
  });

  const allTicks = await readTicks(page);
  const samples: SamplePoint[] = [];

  // --- Phase 1: uniform scan (existing) ---
  console.log(`  Scanning ${numSamples} positions...`);

  for (let i = 0; i < numSamples; i++) {
    const ratio = i / (numSamples - 1);
    const y = box.y + ratio * box.height;
    await page.mouse.move(box.x + box.width / 2, y);
    await page.waitForTimeout(40);

    const scrubber: ScrubberDebug | null = await page.evaluate(
      () => (window as any).__scrubber_debug__ ?? null,
    );
    const sortCtx: SortCtxDebug | null = await page.evaluate(
      () => (window as any).__sort_context_debug__ ?? null,
    );
    const nullZone: NullZoneDebug | null = await page.evaluate(
      () => (window as any).__null_zone_debug__ ?? null,
    );

    const cursorRelY = y - box.y;
    const nearest = findNearestTick(allTicks, cursorRelY);

    samples.push({
      step: i,
      hoverY: Math.round(y),
      cursorRatio: ratio,
      scrubber,
      sortCtx,
      nullZone,
      nearestTick: nearest?.tick ?? null,
      nearestTickDistPx: nearest?.dist ?? null,
    });
  }

  // --- Phase 2: tick-hover scan (NEW) ---
  // Hover precisely at each labeled tick's pixel position and measure
  // the position delta + bucket crossing.
  const tickHoverResults: TickHoverResult[] = [];
  const labeledTicks = allTicks.filter(t => t.label && t.label.length > 0);
  // Limit to max 60 ticks to keep test time reasonable
  const ticksToScan = labeledTicks.length > 60
    ? labeledTicks.filter((_, i) => i % Math.ceil(labeledTicks.length / 60) === 0)
    : labeledTicks;
  console.log(`  Tick-hover scan: ${ticksToScan.length} labeled ticks...`);

  for (let ti = 0; ti < ticksToScan.length; ti++) {
    const tick = ticksToScan[ti];
    // Hover at the tick's exact pixel position
    const y = box.y + tick.px;
    await page.mouse.move(box.x + box.width / 2, y);
    await page.waitForTimeout(40);

    const scrubber: ScrubberDebug | null = await page.evaluate(
      () => (window as any).__scrubber_debug__ ?? null,
    );
    // Don't trust __sort_context_debug__ — it gets overwritten by
    // computeLocalSpanFromDist's internal lookupSortDistribution call.
    // Instead, look up the bucket directly from the store distribution.
    const sortCtx: SortCtxDebug | null = await page.evaluate(
      (pos: number) => {
        const store = (window as any).__kupua_store__;
        if (!store) return null;
        const dist = store.getState().sortDistribution;
        if (!dist || dist.buckets.length === 0) return null;
        // Binary search: same logic as lookupSortDistribution
        const buckets = dist.buckets;
        if (pos >= dist.coveredCount || pos < 0) return null;
        let lo = 0, hi = buckets.length - 1;
        while (lo < hi) {
          const mid = (lo + hi + 1) >>> 1;
          if (buckets[mid].startPosition <= pos) lo = mid;
          else hi = mid - 1;
        }
        const bucket = buckets[lo];
        return {
          ts: Date.now(),
          inputPosition: pos,
          coveredCount: dist.coveredCount,
          totalBuckets: buckets.length,
          bucketIndex: lo,
          bucketKey: bucket.key,
          bucketStartPosition: bucket.startPosition,
          bucketCount: bucket.count,
          bucketEndPosition: bucket.startPosition + bucket.count - 1,
          firstBucketKey: buckets[0].key,
          lastBucketKey: buckets[buckets.length - 1].key,
        } as any;
      },
      scrubber?.scrollPos ?? tick.position,
    );

    const scrollPos = scrubber?.scrollPos ?? 0;
    const positionDelta = scrollPos - tick.position;

    // Bucket crossing: did the sort-context resolve to a different bucket
    // than the one the tick represents? The tick's position IS a bucket start,
    // so if sortCtx.bucketStartPosition != tick.position, we crossed.
    const bucketCrossed = sortCtx != null
      ? sortCtx.bucketStartPosition !== tick.position
      : false;

    tickHoverResults.push({
      tickIndex: allTicks.indexOf(tick),
      tickPosition: tick.position,
      tickPx: tick.px,
      tickLabel: tick.label,
      tickType: tick.type,
      scrollPos,
      positionDelta,
      sortCtxBucketKey: sortCtx?.bucketKey ?? null,
      sortCtxBucketIndex: sortCtx?.bucketIndex ?? null,
      sortCtxInputPosition: sortCtx?.inputPosition ?? null,
      bucketCrossed,
      tooltipLabel: scrubber ? stripHtml(scrubber.scrollLabel ?? "") : null,
      scrubberClientY: scrubber?.clientY ?? null,
      scrubberTrackTop: scrubber?.trackTop ?? null,
      scrubberTs: scrubber?.ts ?? null,
      sortCtxTs: sortCtx?.ts ?? null,
    });
  }

  // Compute summary: which candidate position best matches nearest tick?
  let scrollMatchTick = 0;
  let dataMatchTick = 0;
  let tickPosMatchTick = 0;
  let noneMatch = 0;
  let nullZoneSamples = 0;
  let nearTickSamples = 0;

  for (const s of samples) {
    if (!s.scrubber || !s.nearestTick || s.nearestTickDistPx == null) continue;
    if (s.nearestTickDistPx > 5) continue; // only count when very close to a tick
    nearTickSamples++;
    if (s.nullZone?.inNullZone) nullZoneSamples++;

    const tickLabel = s.nearestTick.label;
    if (!tickLabel) continue;
    const scr = stripHtml(s.scrubber.scrollLabel ?? "");
    const dat = stripHtml(s.scrubber.dataLabel ?? "");
    const tkl = stripHtml(s.scrubber.tickLabel ?? "");

    const scrMatch = scr.includes(tickLabel) || tickLabel.includes(scr);
    const datMatch = dat.includes(tickLabel) || tickLabel.includes(dat);
    const tklMatch = tkl.includes(tickLabel) || tickLabel.includes(tkl);

    if (scrMatch) scrollMatchTick++;
    if (datMatch) dataMatchTick++;
    if (tklMatch) tickPosMatchTick++;
    if (!scrMatch && !datMatch && !tklMatch) noneMatch++;
  }

  // Tick-hover summary
  const ticksHovered = tickHoverResults.length;
  const bucketsCrossed = tickHoverResults.filter(r => r.bucketCrossed).length;
  const deltas = tickHoverResults.map(r => Math.abs(r.positionDelta));
  const avgPositionDelta = deltas.length > 0 ? deltas.reduce((a, b) => a + b, 0) / deltas.length : 0;
  const maxPositionDelta = deltas.length > 0 ? Math.max(...deltas) : 0;

  return {
    name: scenarioName,
    params: await page.evaluate(() => window.location.search),
    viewport: await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    })),
    storeState: {
      total: storeState.total,
      bufferOffset: storeState.bufferOffset,
      bufferLength: storeState.resultsLength,
      orderBy: storeState.orderBy,
    },
    distribution: dist ? { ...dist, nullZone: nullZoneDist } : null,
    trackGeometry: { top: box.y, height: box.height, width: box.width },
    ticks: allTicks,
    samples,
    tickHoverResults,
    summary: {
      totalSamples: numSamples,
      nearTickSamples,
      scrollMatchTick,
      dataMatchTick,
      tickPosMatchTick,
      noneMatch,
      nullZoneSamples,
      ticksHovered,
      bucketsCrossed,
      avgPositionDelta: Math.round(avgPositionDelta),
      maxPositionDelta,
    },
  };
}

/** Print a scenario report to console. */
function printReport(r: ScenarioReport) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`SCENARIO: ${r.name}`);
  console.log("=".repeat(80));
  console.log(`Params: ${r.params}`);
  console.log(`Viewport: ${r.viewport.width}×${r.viewport.height}`);
  console.log(`Total: ${(r.storeState as any).total}, OrderBy: ${(r.storeState as any).orderBy ?? "(default)"}`);
  console.log(`Distribution: ${r.distribution ? `${(r.distribution as any).bucketCount} buckets, covered=${(r.distribution as any).coveredCount}` : "NONE"}`);
  if (r.distribution?.nullZone) {
    const nz = r.distribution.nullZone as any;
    console.log(`Null-zone dist: ${nz.bucketCount} buckets, covered=${nz.coveredCount}, first=${nz.firstKey}, last=${nz.lastKey}`);
  }
  console.log(`Track: ${r.trackGeometry.height.toFixed(0)}px, Ticks: ${r.ticks.length}`);

  const s0 = r.samples.find(s => s.scrubber);
  if (s0?.scrubber) {
    console.log(`ThumbVisibleCount: ${s0.scrubber.thumbVisibleCount}, MaxThumbTop: ${s0.scrubber.maxThumbTop.toFixed(1)}, ThumbHeight: ${s0.scrubber.thumbHeight.toFixed(1)}`);
  }

  // Table
  const hdr = [
    "#".padStart(3),
    "Ratio".padStart(6),
    "ScrPos".padStart(8),
    "DatPos".padStart(8),
    "TikPos".padStart(8),
    "ScrollLabel".padStart(18),
    "DataLabel".padStart(18),
    "TickLabel".padStart(18),
    "NearTk".padStart(8),
    "TkDst".padStart(5),
    "NZ".padStart(3),
  ].join(" | ");
  console.log(`\n${hdr}`);
  console.log("-".repeat(hdr.length));

  for (const s of r.samples) {
    if (!s.scrubber) continue;
    const scr = stripHtml(s.scrubber.scrollLabel ?? "—").slice(0, 16);
    const dat = stripHtml(s.scrubber.dataLabel ?? "—").slice(0, 16);
    const tkl = stripHtml(s.scrubber.tickLabel ?? "—").slice(0, 16);
    const near = s.nearestTick?.label?.slice(0, 6) ?? "—";
    const dist = s.nearestTickDistPx != null ? `${Math.round(s.nearestTickDistPx)}` : "—";
    const nz = s.nullZone?.inNullZone ? "NZ" : "";

    console.log([
      `${s.step}`.padStart(3),
      s.cursorRatio.toFixed(3).padStart(6),
      `${s.scrubber.scrollPos}`.padStart(8),
      `${s.scrubber.dataPos}`.padStart(8),
      `${s.scrubber.tickPos}`.padStart(8),
      scr.padStart(18),
      dat.padStart(18),
      tkl.padStart(18),
      near.padStart(8),
      dist.padStart(5),
      nz.padStart(3),
    ].join(" | "));
  }

  // Summary: uniform scan
  console.log(`\n--- TICK-MATCH SUMMARY (${r.summary.nearTickSamples} samples within 5px of a tick) ---`);
  console.log(`scrollPos matches tick label: ${r.summary.scrollMatchTick}`);
  console.log(`dataPos matches tick label:   ${r.summary.dataMatchTick}`);
  console.log(`tickPos matches tick label:   ${r.summary.tickPosMatchTick}`);
  console.log(`none match:                   ${r.summary.noneMatch}`);
  console.log(`null-zone samples:            ${r.summary.nullZoneSamples}`);

  // Summary: tick-hover scan (NEW)
  if (r.tickHoverResults.length > 0) {
    console.log(`\n--- TICK-HOVER SCAN (${r.summary.ticksHovered} ticks hovered directly) ---`);
    console.log(`Bucket crossings:  ${r.summary.bucketsCrossed} / ${r.summary.ticksHovered} (${(100 * r.summary.bucketsCrossed / r.summary.ticksHovered).toFixed(1)}%)`);
    console.log(`Avg position delta: ${r.summary.avgPositionDelta}`);
    console.log(`Max position delta: ${r.summary.maxPositionDelta}`);

    // Print first 10 bucket crossings for inspection
    const crossings = r.tickHoverResults.filter(t => t.bucketCrossed);
    if (crossings.length > 0) {
      console.log(`\nFirst ${Math.min(10, crossings.length)} bucket crossings:`);
      const chdr = [
        "Tick#".padStart(5),
        "TickPos".padStart(9),
        "HoverPos".padStart(9),
        "Delta".padStart(7),
        "TickLbl".padStart(8),
        "HoverBucket".padStart(20),
        "CtxInPos".padStart(9),
        "ScrTs".padStart(6),
        "CtxTs".padStart(6),
      ].join(" | ");
      console.log(chdr);
      console.log("-".repeat(chdr.length));
      for (const c of crossings.slice(0, 10)) {
        console.log([
          `${c.tickIndex}`.padStart(5),
          `${c.tickPosition}`.padStart(9),
          `${c.scrollPos}`.padStart(9),
          `${c.positionDelta}`.padStart(7),
          (c.tickLabel ?? "").slice(0, 6).padStart(8),
          (c.sortCtxBucketKey ?? "").slice(0, 18).padStart(20),
          `${c.sortCtxInputPosition ?? "?"}`.padStart(9),
          // Show last 4 digits of timestamp to detect staleness
          c.scrubberTs ? `${c.scrubberTs % 10000}`.padStart(6) : "  null",
          c.sortCtxTs ? `${c.sortCtxTs % 10000}`.padStart(6) : "  null",
        ].join(" | "));
      }
    }

    // Print ALL tick-hover results for S2 (small dataset) — detailed view
    if (r.tickHoverResults.length <= 30) {
      console.log(`\nFull tick-hover detail (${r.tickHoverResults.length} ticks):`);
      const dhdr = [
        "Tick#".padStart(5),
        "TickPos".padStart(8),
        "HvrPos".padStart(8),
        "Δ".padStart(5),
        "TickLbl".padStart(8),
        "CtxInPos".padStart(8),
        "CtxBktStart".padStart(11),
        "CtxBktKey".padStart(22),
        "Crossed".padStart(7),
        "TickPx".padStart(6),
        "ClientY".padStart(8),
      ].join(" | ");
      console.log(dhdr);
      console.log("-".repeat(dhdr.length));
      for (const c of r.tickHoverResults) {
        console.log([
          `${c.tickIndex}`.padStart(5),
          `${c.tickPosition}`.padStart(8),
          `${c.scrollPos}`.padStart(8),
          `${c.positionDelta}`.padStart(5),
          (c.tickLabel ?? "").slice(0, 6).padStart(8),
          `${c.sortCtxInputPosition ?? "?"}`.padStart(8),
          `${c.sortCtxBucketIndex ?? "?"}`.padStart(11),
          (c.sortCtxBucketKey ?? "?").slice(0, 20).padStart(22),
          c.bucketCrossed ? "  YES" : "   no",
          `${Math.round(c.tickPx)}`.padStart(6),
          `${Math.round(c.scrubberClientY ?? 0)}`.padStart(8),
        ].join(" | "));
      }
    }
  }
}

// ---------------------------------------------------------------------------
// SCENARIOS
// ---------------------------------------------------------------------------

// Stable date: one month ago (static, so results are repeatable)
const STABLE_UNTIL = "2026-03-04T00:00:00";
const STABLE_24H_SINCE = "2026-03-03T00:00:00";
const STABLE_24H_UNTIL = "2026-03-04T00:00:00";
const STABLE_WEEK_SINCE = "2026-02-25T00:00:00";
const STABLE_WEEK_UNTIL = "2026-03-04T00:00:00";

test.describe("Scrubber diagnostic — multi-scenario", () => {
  test.describe.configure({ timeout: 180_000 });

  const allReports: ScenarioReport[] = [];

  // S1: Default sort (uploadTime desc), full dataset, normal viewport
  test("S1 — default sort, full dataset", async ({ kupua }) => {
    console.log("\n[S1] Default sort, full dataset...");
    await kupua.gotoWithParams(`until=${STABLE_UNTIL}`);
    await triggerDistribution(kupua);
    const r = await runScan(kupua, "S1: default sort, full", 50);
    allReports.push(r);
    printReport(r);
  });

  // S2: Default sort, last 24h (sub-hour ticks — original bug report)
  test("S2 — default sort, last 24h", async ({ kupua }) => {
    console.log("\n[S2] Default sort, last 24h...");
    await kupua.gotoWithParams(`since=${STABLE_24H_SINCE}&until=${STABLE_24H_UNTIL}`);
    const state = await kupua.getStoreState();
    if (state.total < 10) { console.log("  SKIP: too few results"); test.skip(); return; }
    await triggerDistribution(kupua);
    const r = await runScan(kupua, "S2: default sort, 24h", 60);
    allReports.push(r);
    printReport(r);
  });

  // S3: Default sort, last week (daily ticks)
  test("S3 — default sort, last week", async ({ kupua }) => {
    console.log("\n[S3] Default sort, last week...");
    await kupua.gotoWithParams(`since=${STABLE_WEEK_SINCE}&until=${STABLE_WEEK_UNTIL}`);
    const state = await kupua.getStoreState();
    if (state.total < 10) { console.log("  SKIP: too few results"); test.skip(); return; }
    await triggerDistribution(kupua);
    const r = await runScan(kupua, "S3: default sort, week", 50);
    allReports.push(r);
    printReport(r);
  });

  // S4: "Taken on" sort — null zone (images without dateTaken)
  test("S4 — taken sort (null zone)", async ({ kupua }) => {
    console.log("\n[S4] Taken on sort (null zone expected)...");
    await kupua.gotoWithParams(`until=${STABLE_UNTIL}&orderBy=-taken`);
    await triggerDistribution(kupua);
    // Extra wait for null-zone distribution to load
    await kupua.page.waitForTimeout(5000);
    const r = await runScan(kupua, "S4: taken sort (null zone)", 50);
    allReports.push(r);
    printReport(r);
  });

  // S5: "Last modified" sort — likely large null zone
  test("S5 — lastModified sort (null zone)", async ({ kupua }) => {
    console.log("\n[S5] Last modified sort (null zone expected)...");
    await kupua.gotoWithParams(`until=${STABLE_UNTIL}&orderBy=-lastModified`);
    await triggerDistribution(kupua);
    await kupua.page.waitForTimeout(5000);
    const r = await runScan(kupua, "S5: lastModified sort (null zone)", 50);
    allReports.push(r);
    printReport(r);
  });

  // S6: Credit sort (keyword — no date ticks, different distribution type)
  test("S6 — credit sort (keyword)", async ({ kupua }) => {
    console.log("\n[S6] Credit sort (keyword)...");
    await kupua.gotoWithParams(`until=${STABLE_UNTIL}&orderBy=-credit`);
    await triggerDistribution(kupua);
    const r = await runScan(kupua, "S6: credit sort (keyword)", 40);
    allReports.push(r);
    printReport(r);
  });

  // S7: Default sort, SMALL viewport (768×600)
  test("S7 — default sort, small viewport 768×600", async ({ kupua }) => {
    console.log("\n[S7] Default sort, small viewport...");
    await kupua.page.setViewportSize({ width: 768, height: 600 });
    await kupua.gotoWithParams(`until=${STABLE_UNTIL}`);
    await triggerDistribution(kupua);
    const r = await runScan(kupua, "S7: default sort, 768×600", 40);
    allReports.push(r);
    printReport(r);
    await kupua.page.setViewportSize({ width: 1987, height: 1110 });
  });

  // S8: Default sort, TALL viewport (1987×1800)
  test("S8 — default sort, tall viewport 1987×1800", async ({ kupua }) => {
    console.log("\n[S8] Default sort, tall viewport...");
    await kupua.page.setViewportSize({ width: 1987, height: 1800 });
    await kupua.gotoWithParams(`until=${STABLE_UNTIL}`);
    await triggerDistribution(kupua);
    const r = await runScan(kupua, "S8: default sort, 1987×1800", 50);
    allReports.push(r);
    printReport(r);
    await kupua.page.setViewportSize({ width: 1987, height: 1110 });
  });

  // Write all reports to one JSON file after all scenarios
  test.afterAll(() => {
    if (allReports.length === 0) return;
    ensureOutDir();
    const outPath = path.join(OUT_DIR, "scrubber-diag-all.json");
    fs.writeFileSync(outPath, JSON.stringify(allReports, null, 2));

    console.log(`\n${"=".repeat(80)}`);
    console.log("CROSS-SCENARIO SUMMARY");
    console.log("=".repeat(80));
    console.log(
      "Scenario".padEnd(40) +
      "NearTk".padStart(7) +
      "Scroll".padStart(7) +
      "Data".padStart(7) +
      "Tick".padStart(7) +
      "None".padStart(7) +
      "NZ".padStart(5),
    );
    console.log("-".repeat(80));
    for (const r of allReports) {
      const s = r.summary;
      console.log(
        r.name.padEnd(40) +
        `${s.nearTickSamples}`.padStart(7) +
        `${s.scrollMatchTick}`.padStart(7) +
        `${s.dataMatchTick}`.padStart(7) +
        `${s.tickPosMatchTick}`.padStart(7) +
        `${s.noneMatch}`.padStart(7) +
        `${s.nullZoneSamples}`.padStart(5),
      );
    }

    // NEW: Tick-hover summary
    console.log(`\n${"=".repeat(80)}`);
    console.log("TICK-HOVER SUMMARY (hover at exact tick pixel → measure bucket crossing)");
    console.log("=".repeat(80));
    console.log(
      "Scenario".padEnd(40) +
      "Ticks".padStart(6) +
      "Crossed".padStart(8) +
      "Cross%".padStart(8) +
      "AvgΔ".padStart(8) +
      "MaxΔ".padStart(8),
    );
    console.log("-".repeat(78));
    for (const r of allReports) {
      const s = r.summary;
      const pct = s.ticksHovered > 0 ? (100 * s.bucketsCrossed / s.ticksHovered).toFixed(1) : "n/a";
      console.log(
        r.name.padEnd(40) +
        `${s.ticksHovered}`.padStart(6) +
        `${s.bucketsCrossed}`.padStart(8) +
        `${pct}%`.padStart(8) +
        `${s.avgPositionDelta}`.padStart(8) +
        `${s.maxPositionDelta}`.padStart(8),
      );
    }

    console.log(`\nReports written to: ${outPath}`);
  });
});







