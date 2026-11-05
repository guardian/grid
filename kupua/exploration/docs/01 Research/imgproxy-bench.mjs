#!/usr/bin/env node
/**
 * Imgproxy latency benchmark — measures how fast imgproxy serves images
 * when hit with rapid-fire requests (simulating fast arrow-key traversal).
 *
 * Uses real image IDs from the running ES instance and real imgproxy URLs
 * matching what the app generates in ImageDetail.tsx.
 *
 * Usage:
 *   node kupua/exploration/imgproxy-bench.mjs [--width=W] [--height=H] [--count=N]
 *                                             [--dpr=D] [--appWidth=W] [--appHeight=H]
 *                                             [--quality=Q]
 *
 * All values have sensible defaults (see DEFAULTS below). Override any via CLI.
 */

// ─── Configuration ──────────────────────────────────────────────────────────
// All tunables in one place. CLI args override these defaults.
const DEFAULTS = {
  // CSS viewport dimensions of the developer's browser window
  cssWidth: 2013,
  cssHeight: 1176,
  dpr: 1.2,
  // What the app currently requests (no DPR scaling — see perf analysis finding #7)
  appWidth: 1200,
  appHeight: 1200,
  // imgproxy encoding quality
  quality: 80,
  // Number of images to benchmark
  count: 70,
};

const IMGPROXY_BASE = "http://localhost:3002"; // Direct to imgproxy, skip Vite proxy overhead
const VITE_PROXY_BASE = "http://localhost:3000/imgproxy"; // Via Vite proxy (like the real app)
const ES_BASE = "http://localhost:3000/es";
const BUCKET = "media-service-test-imagebucket <...>";

// Parse CLI args — any DEFAULTS key can be overridden via --key=value
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v];
  }),
);
const CSS_WIDTH = parseInt(args.width ?? args.cssWidth ?? DEFAULTS.cssWidth, 10);
const CSS_HEIGHT = parseInt(args.height ?? args.cssHeight ?? DEFAULTS.cssHeight, 10);
const DPR = parseFloat(args.dpr ?? DEFAULTS.dpr);
// Physical pixels — what imgproxy should ideally resize to for sharp rendering
const PHYS_WIDTH = Math.round(CSS_WIDTH * DPR);
const PHYS_HEIGHT = Math.round(CSS_HEIGHT * DPR);
// What the app currently requests
const APP_WIDTH = parseInt(args.appWidth ?? DEFAULTS.appWidth, 10);
const APP_HEIGHT = parseInt(args.appHeight ?? DEFAULTS.appHeight, 10);
const COUNT = parseInt(args.count ?? DEFAULTS.count, 10);
const QUALITY = parseInt(args.quality ?? DEFAULTS.quality, 10);

/** Convert image ID to S3 key (same as image-urls.ts:idToS3Key) */
function idToS3Key(imageId) {
  const dirPrefix = imageId.slice(0, 6).split("").join("/");
  return `${dirPrefix}/${imageId}`;
}

/** Build imgproxy URL path */
function buildImgproxyPath(imageId, orientation, w, h) {
  const s3Key = idToS3Key(imageId);
  const s3Source = `s3://${BUCKET}/${s3Key}`;
  const rotation =
    orientation === 6 ? 90 : orientation === 3 ? 180 : orientation === 8 ? 270 : 0;
  const segments = [
    "/insecure",
    "auto_rotate:false",
    "strip_metadata:true",
    "strip_color_profile:true",
    `resize:fit:${w}:${h}`,
    `quality:${QUALITY}`,
  ];
  if (rotation !== 0) segments.push(`rotate:${rotation}`);
  segments.push(`plain/${s3Source}@webp`);
  return segments.join("/");
}

/** Fetch real image IDs from ES */
async function fetchImageIds(count) {
  const catRes = await fetch(`${ES_BASE}/_cat/indices?format=json`);
  const indices = await catRes.json();
  const realIndex = indices
    .filter((i) => i.index.startsWith("images_") && parseInt(i["docs.count"]) > 1000)
    .sort((a, b) => b.index.localeCompare(a.index))[0];
  if (!realIndex) throw new Error("No populated images index found");
  console.log(`Using index: ${realIndex.index} (${realIndex["docs.count"]} docs)`);

  const searchRes = await fetch(`${ES_BASE}/${realIndex.index}/_search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      size: count,
      _source: ["id", "source.orientationMetadata.exifOrientation"],
      sort: [{ uploadTime: "desc" }],
    }),
  });
  const data = await searchRes.json();
  return data.hits.hits.map((h) => ({
    id: h._id,
    orientation: h._source?.source?.orientationMetadata?.exifOrientation,
  }));
}

/** Measure a single fetch */
async function timedFetch(base, path, index) {
  const url = base + path;
  const start = performance.now();
  try {
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    const ms = performance.now() - start;
    return { index, status: res.status, bytes: buf.byteLength, ms };
  } catch (err) {
    const ms = performance.now() - start;
    return { index, status: 0, bytes: 0, ms, error: err.message };
  }
}

function stats(times) {
  const sorted = [...times].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const len = sorted.length;
  return {
    min: sorted[0],
    p25: sorted[Math.floor(len * 0.25)],
    median: sorted[Math.floor(len * 0.5)],
    p75: sorted[Math.floor(len * 0.75)],
    p95: sorted[Math.floor(len * 0.95)],
    max: sorted[len - 1],
    mean: sum / len,
  };
}

function fmt(ms) {
  return ms.toFixed(0) + "ms";
}

function printStats(label, results) {
  const times = results.map((r) => r.ms);
  const bytes = results.map((r) => r.bytes);
  const s = stats(times);
  const totalBytes = bytes.reduce((a, b) => a + b, 0);
  const failed = results.filter((r) => r.status !== 200).length;

  console.log(`\n${label}`);
  console.log("─".repeat(60));
  console.log(`  Requests:  ${results.length} (${failed} failed)`);
  console.log(
    `  Data:      ${(totalBytes / 1024 / 1024).toFixed(1)} MB total, ${(totalBytes / results.length / 1024).toFixed(0)} KB avg`,
  );
  console.log(`  Min:       ${fmt(s.min)}`);
  console.log(`  P25:       ${fmt(s.p25)}`);
  console.log(`  Median:    ${fmt(s.median)}`);
  console.log(`  P75:       ${fmt(s.p75)}`);
  console.log(`  P95:       ${fmt(s.p95)}`);
  console.log(`  Max:       ${fmt(s.max)}`);
  console.log(`  Mean:      ${fmt(s.mean)}`);
}

// ─── 60fps traversal simulation ─────────────────────────────────────────────
// Simulates pressing arrow-key so fast that a new image is requested every
// frame (16.67ms). Each "frame" fires a fetch; we record when the response
// arrives and check: was it ready by the NEXT frame? By 2 frames? etc.
//
// This tells us: "if we could traverse at 60fps, how much does imgproxy lag?"

async function simulate60fps(base, paths, label) {
  const FRAME_MS = 1000 / 60; // 16.67ms
  const count = paths.length;

  console.log(`\n▶ 60fps traversal simulation — ${label}`);
  console.log(`  Firing 1 request every ${FRAME_MS.toFixed(1)}ms (${count} images)`);

  const simStart = performance.now();

  // Fire requests at 60fps intervals
  const promises = paths.map((path, i) => {
    return new Promise((resolve) => {
      const scheduledAt = i * FRAME_MS; // when this "frame" happens
      const delay = scheduledAt - (performance.now() - simStart);
      const fire = async () => {
        const fireTime = performance.now() - simStart;
        const result = await timedFetch(base, path, i);
        const arrivedAt = performance.now() - simStart;
        resolve({
          ...result,
          frame: i,
          scheduledAt,
          firedAt: fireTime,
          arrivedAt,
          // How many frames late? (0 = ready by next frame = perfect)
          framesLate: Math.max(0, Math.floor((arrivedAt - scheduledAt) / FRAME_MS) - 1),
        });
      };
      if (delay > 0) {
        setTimeout(fire, delay);
      } else {
        fire();
      }
    });
  });

  const allResults = await Promise.all(promises);
  const simTime = performance.now() - simStart;

  // Categorise results
  const onTime = allResults.filter((r) => r.framesLate === 0);
  const slight = allResults.filter((r) => r.framesLate > 0 && r.framesLate <= 5);
  const late = allResults.filter((r) => r.framesLate > 5 && r.framesLate <= 30);
  const veryLate = allResults.filter((r) => r.framesLate > 30);

  const latencies = allResults.map((r) => r.ms);
  const s = stats(latencies);

  console.log("─".repeat(60));
  console.log(`  Wall time:     ${fmt(simTime)} for ${count} images`);
  console.log(`  Latency:       min ${fmt(s.min)} / median ${fmt(s.median)} / P95 ${fmt(s.p95)} / max ${fmt(s.max)}`);
  console.log();
  console.log(`  On time (≤1 frame / ≤17ms):    ${onTime.length}/${count}  (${(onTime.length / count * 100).toFixed(0)}%)`);
  console.log(`  Slightly late (2-5 frames):     ${slight.length}/${count}  (${(slight.length / count * 100).toFixed(0)}%)`);
  console.log(`  Late (6-30 frames / ~0.5s):     ${late.length}/${count}  (${(late.length / count * 100).toFixed(0)}%)`);
  console.log(`  Very late (30+ frames / >0.5s): ${veryLate.length}/${count}  (${(veryLate.length / count * 100).toFixed(0)}%)`);

  // Show a timeline — first 20 images
  console.log();
  console.log("  Timeline (first 20):");
  console.log("  Frame  Scheduled  Arrived    Latency  Frames late");
  for (const r of allResults.slice(0, 20)) {
    const marker = r.framesLate === 0 ? "✅" : r.framesLate <= 5 ? "🟡" : "🔴";
    console.log(
      `  ${String(r.frame).padStart(3)}    ${fmt(r.scheduledAt).padStart(7)}  ${fmt(r.arrivedAt).padStart(7)}    ${fmt(r.ms).padStart(6)}  ${String(r.framesLate).padStart(3)} ${marker}`,
    );
  }

  return allResults;
}

async function main() {
  console.log("=".repeat(60));
  console.log("  Imgproxy Latency Benchmark");
  console.log(`  Window: ${CSS_WIDTH}×${CSS_HEIGHT} CSS px @ ${DPR}x DPR`);
  console.log(`  Physical: ${PHYS_WIDTH}×${PHYS_HEIGHT} px`);
  console.log(`  App currently requests: ${APP_WIDTH}×${APP_HEIGHT} (no DPR scaling)`);
  console.log(`  Quality: ${QUALITY}, Format: WebP`);
  console.log(`  Images: ${COUNT}`);
  console.log("=".repeat(60));

  // 1. Fetch real image IDs
  console.log("\nFetching image IDs from ES...");
  const images = await fetchImageIds(COUNT);
  console.log(`Got ${images.length} images.`);

  // Build paths at the size the app currently uses (1200×1200)
  const appPaths = images.map((img) =>
    buildImgproxyPath(img.id, img.orientation, APP_WIDTH, APP_HEIGHT),
  );
  // Build paths at what the app SHOULD use (DPR-scaled)
  const dprPaths = images.map((img) =>
    buildImgproxyPath(img.id, img.orientation, PHYS_WIDTH, PHYS_HEIGHT),
  );

  // 2. Warm-up: hit a couple of images to wake up imgproxy
  console.log("\nWarm-up: fetching 3 images...");
  for (let i = 0; i < 3; i++) {
    const w = await timedFetch(IMGPROXY_BASE, appPaths[i], i);
    console.log(`  ${w.status} | ${(w.bytes / 1024).toFixed(0)} KB | ${fmt(w.ms)}`);
  }

  // 3. SEQUENTIAL — baseline: one request at a time, no overlap
  console.log("\n▶ Sequential test (one at a time — pure imgproxy latency)...");
  const seqResults = [];
  const seqWallStart = performance.now();
  for (let i = 0; i < appPaths.length; i++) {
    const r = await timedFetch(IMGPROXY_BASE, appPaths[i], i);
    seqResults.push(r);
  }
  const seqWallTime = performance.now() - seqWallStart;
  printStats(`Sequential @ ${APP_WIDTH}×${APP_HEIGHT} (current app size)`, seqResults);
  console.log(`  Wall:      ${fmt(seqWallTime)} total for ${COUNT} images`);
  console.log(`  Per image: ~${fmt(seqWallTime / COUNT)}`);

  // 4. PREFETCH BATCH of 5 — the real-world pattern the app uses
  console.log("\n▶ Prefetch batch (5 at a time — real app pattern)...");
  const batchResults = [];
  const batchWallStart = performance.now();
  for (let i = 0; i < Math.min(appPaths.length, 25); i += 5) {
    const batch = appPaths.slice(i, i + 5);
    const batchStart = performance.now();
    const results = await Promise.all(
      batch.map((p, j) => timedFetch(IMGPROXY_BASE, p, i + j)),
    );
    const batchTime = performance.now() - batchStart;
    const maxInBatch = Math.max(...results.map((r) => r.ms));
    console.log(
      `  Batch ${i / 5 + 1}: ${fmt(batchTime)} wall (slowest: ${fmt(maxInBatch)})`,
    );
    batchResults.push(...results);
  }
  const batchWallTime = performance.now() - batchWallStart;
  printStats(`Prefetch batches of 5 (direct to imgproxy)`, batchResults);
  console.log(`  Wall:      ${fmt(batchWallTime)} for 5 batches`);

  // 5. Vite proxy overhead — batch of 5 via Vite proxy
  console.log("\n▶ Vite proxy overhead (5 at a time, via :3000)...");
  const viteBatchResults = [];
  for (let i = 0; i < 10; i += 5) {
    const batch = appPaths.slice(i, i + 5);
    const results = await Promise.all(
      batch.map((p, j) => timedFetch(VITE_PROXY_BASE, p, i + j)),
    );
    viteBatchResults.push(...results);
  }
  printStats(`Vite proxy batch of 5 (for overhead comparison)`, viteBatchResults);

  // 6. 60fps simulation — the main event
  const fps60results = await simulate60fps(
    IMGPROXY_BASE,
    appPaths,
    `current app size (${APP_WIDTH}×${APP_HEIGHT})`,
  );

  // 7. 60fps at DPR-scaled size — what if we requested sharper images?
  const fps60dpr = await simulate60fps(
    IMGPROXY_BASE,
    dprPaths,
    `DPR-scaled (${PHYS_WIDTH}×${PHYS_HEIGHT})`,
  );

  // 8. Summary
  console.log("\n" + "=".repeat(60));
  console.log("  SUMMARY");
  console.log("=".repeat(60));

  const seqS = stats(seqResults.map((r) => r.ms));
  const fps60s = stats(fps60results.map((r) => r.ms));
  const fps60dprS = stats(fps60dpr.map((r) => r.ms));

  console.log(`\n  Sequential per-image latency (${APP_WIDTH}×${APP_HEIGHT}):`);
  console.log(`    Median: ${fmt(seqS.median)} | P95: ${fmt(seqS.p95)} | Max: ${fmt(seqS.max)}`);
  console.log(`    → Max traversal rate: ~${Math.floor(1000 / seqS.median)} images/sec`);

  console.log(`\n  60fps simulation (${APP_WIDTH}×${APP_HEIGHT}):`);
  const onTime = fps60results.filter((r) => r.framesLate === 0).length;
  console.log(`    ${onTime}/${COUNT} on time (${(onTime / COUNT * 100).toFixed(0)}%)`);
  console.log(`    Median latency: ${fmt(fps60s.median)} | P95: ${fmt(fps60s.p95)}`);

  console.log(`\n  60fps simulation DPR-scaled (${PHYS_WIDTH}×${PHYS_HEIGHT}):`);
  const onTimeDpr = fps60dpr.filter((r) => r.framesLate === 0).length;
  console.log(`    ${onTimeDpr}/${COUNT} on time (${(onTimeDpr / COUNT * 100).toFixed(0)}%)`);
  console.log(`    Median latency: ${fmt(fps60dprS.median)} | P95: ${fmt(fps60dprS.p95)}`);

  if (seqS.median > 16.67) {
    console.log(`\n  ⚠️  Median latency (${fmt(seqS.median)}) exceeds 1 frame (17ms).`);
    console.log(`     Imgproxy IS a bottleneck for instant traversal.`);
    console.log(`     Prefetching is essential — current 3-ahead covers`);
    console.log(`     ~${(3 * seqS.median / 16.67).toFixed(0)} frames of key-repeat.`);
  } else {
    console.log(`\n  ✅ Imgproxy is fast enough for 60fps traversal!`);
  }

  const viteOverhead =
    stats(viteBatchResults.map((r) => r.ms)).median -
    stats(batchResults.slice(0, 10).map((r) => r.ms)).median;
  console.log(`\n  Vite proxy overhead: ~${fmt(Math.max(0, viteOverhead))} per request`);

  console.log();
}

main().catch((err) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});

