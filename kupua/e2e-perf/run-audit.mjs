/**
 * Audit harness for rendering performance smoke tests.
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  MANUAL INVOCATION ONLY — NEVER RUN BY CI, SCRIPTS, OR AGENTS.    ║
 * ║  Only a human developer should run this from their IDE terminal.   ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * Two measurement systems:
 *   1. Jank             — what the browser reports (frame drops, CLS,
 *                         DOM churn). No app cooperation required.
 *   2. Perceived        — what the app reports via trace() phase markers.
 *                         Comes in two flavours, sharing one trace API and
 *                         one results format:
 *                           short — single-action tests (perceived-short.spec.ts)
 *                           long  — multi-step journey tests (perceived-long.spec.ts)
 *
 * Flag matrix:
 *                              Jank   Perceived (short)   Perceived (long)
 *   (no flag)                  ✓      —                   —
 *   --perceived                ✓      ✓                   ✓
 *   --perceived-only           —      ✓                   ✓
 *   --short-perceived-only     —      ✓                   —
 *   --long-perceived-only      —      —                   ✓
 *
 * Other flags:
 *   --label "..."   Required-ish. Tags this run in the log. Defaults to
 *                   "Quick check" / "Unnamed run".
 *   --runs N        Repeat each suite N times; metrics are aggregated as
 *                   median + p95.
 *   --dry-run       Run everything, print summaries, but write nothing.
 *   --headed        Show the browser window (otherwise headless).
 *   <P-id list>     Positional jank-test filter (e.g. "P3,P8").
 *
 * Output files (under e2e-perf/results/):
 *   audit-log.{json,js,md}      — jank suite results, append-only.
 *   perceived-log.{json,js,md}  — perceived suite results (short + long
 *                                  share this file; each entry has a
 *                                  kind: "short"|"long" field).
 *   audit-graphs.html           — dashboard for jank suite.
 *   perceived-graphs.html       — dashboard for perceived suite (filters
 *                                  by kind).
 *
 * Prerequisites:
 *   Terminal 1: ./scripts/start.sh --use-TEST
 *   Terminal 2: node e2e-perf/run-audit.mjs --label "..."
 */

import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { execSync } from "node:child_process";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// Jank suite paths
const METRICS_FILE = resolve(__dirname, "results/.metrics-tmp.jsonl");
const AUDIT_JSON = resolve(__dirname, "results/audit-log.json");
const AUDIT_MD = resolve(__dirname, "results/audit-log.md");

// Perceived suite paths (short + long share one log file).
// The per-spec temp files differ so a single run can capture both kinds
// without trampling each other's output.
const PERCEIVED_JSON = resolve(__dirname, "results/perceived-log.json");
const PERCEIVED_MD = resolve(__dirname, "results/perceived-log.md");
const PERCEIVED_SHORT_TMP = resolve(__dirname, "results/.perceived-short-tmp.jsonl");
const PERCEIVED_LONG_TMP = resolve(__dirname, "results/.perceived-long-tmp.jsonl");

// Per-kind config + temp + spec metadata, indexed by kind.
const PERCEIVED_KINDS = {
  short: {
    config: "e2e-perf/playwright.perceived-short.config.ts",
    tmp: PERCEIVED_SHORT_TMP,
    label: "perceived (short)",
  },
  long: {
    config: "e2e-perf/playwright.perceived-long.config.ts",
    tmp: PERCEIVED_LONG_TMP,
    label: "perceived (long)",
  },
};

// ---------------------------------------------------------------------------
// Parse CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
let label = "";
let runs = 1;
let grepArg = "";
let dryRun = false;
let headed = false;

// Mode flags. Resolved into runJank / runShort / runLong below.
let perceivedFull = false;     // --perceived             jank + short + long
let perceivedOnly = false;     // --perceived-only        short + long
let shortOnly = false;         // --short-perceived-only  short
let longOnly = false;          // --long-perceived-only   long

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--label" && args[i + 1]) {
    label = args[++i];
  } else if (a === "--runs" && args[i + 1]) {
    runs = parseInt(args[++i], 10);
  } else if (a === "--dry-run" || a === "--no-log") {
    dryRun = true;
  } else if (a === "--headed") {
    headed = true;
  } else if (a === "--perceived") {
    perceivedFull = true;
  } else if (a === "--perceived-only") {
    perceivedOnly = true;
  } else if (a === "--short-perceived-only") {
    shortOnly = true;
  } else if (a === "--long-perceived-only") {
    longOnly = true;
  } else if (!a.startsWith("--")) {
    // Positional arg: jank test filter (e.g. "P8" or "P3,P8")
    const parts = a.split(",").map((s) => s.trim()).filter(Boolean);
    grepArg = parts.join("|");
  } else {
    console.error(`Unknown flag: ${a}`);
    process.exit(2);
  }
}

// Validate: at most one of the four perceived modes.
const perceivedModeCount = [perceivedFull, perceivedOnly, shortOnly, longOnly]
  .filter(Boolean).length;
if (perceivedModeCount > 1) {
  console.error(
    "Error: --perceived / --perceived-only / --short-perceived-only / " +
    "--long-perceived-only are mutually exclusive.",
  );
  process.exit(2);
}

// Resolve to three booleans.
const runJank  = !perceivedOnly && !shortOnly && !longOnly;
const runShort = perceivedFull || perceivedOnly || shortOnly;
const runLong  = perceivedFull || perceivedOnly || longOnly;

if (!label) {
  label = grepArg ? `Quick check: ${grepArg}` : "Unnamed run";
}

// ---------------------------------------------------------------------------
// Stable-until: fixed cutoff so the result corpus is the same on every run.
// Do not compute from "yesterday" — that changes daily and makes metrics drift.
// ---------------------------------------------------------------------------

const STABLE_UNTIL = "2026-02-15T00:00:00.000Z";

// ---------------------------------------------------------------------------
// Git info
// ---------------------------------------------------------------------------

function getGitInfo() {
  try {
    const sha = execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim();
    let dirty = false;
    try {
      execSync("git diff --quiet", { cwd: ROOT });
    } catch {
      dirty = true;
    }
    return { sha, dirty };
  } catch {
    return { sha: "unknown", dirty: false };
  }
}

// ---------------------------------------------------------------------------
// Clear metrics file
// ---------------------------------------------------------------------------

function clearMetricsFile() {
  if (existsSync(METRICS_FILE)) {
    unlinkSync(METRICS_FILE);
  }
}

// ---------------------------------------------------------------------------
// Cluster probe — global gate for both jank and perceived suites.
//
// Replaces the per-test requireRealData() helper that used to live in every
// spec file. Doing this once at harness startup is correct because:
//   - "are we on real ES?" is a property of the run, not of any test
//   - "is PERF_STABLE_UNTIL set?" is set BY this harness, asserting it
//     inside tests was tautological
//   - per-test guards forced workarounds when CQL filters changed
//     store.total mid-test, masking the actual measurement intent
//
// Direct `npx playwright test` invocations bypass this probe — by design.
// Anyone running specs directly is debugging and accepts the responsibility.
// ---------------------------------------------------------------------------

async function probeCluster() {
  console.log("  Probing cluster size at http://localhost:3000/search?nonFree=true …");
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto("http://localhost:3000/search?nonFree=true", { waitUntil: "networkidle", timeout: 15_000 });
    // Wait for the store to populate `total` (search resolves async).
    await page.waitForFunction(
      () => {
        const s = window.__kupua_store__?.getState();
        return s && typeof s.total === "number" && !s.loading;
      },
      { timeout: 15_000 },
    );
    const total = await page.evaluate(() => window.__kupua_store__.getState().total);
    return total;
  } finally {
    if (browser) await browser.close();
  }
}

async function enforceClusterGate() {
  let total;
  try {
    total = await probeCluster();
  } catch (err) {
    console.error(`  ERROR: cluster probe failed — is the dev server running?`);
    console.error(`         ${err.message}`);
    console.error(`         Start it with: ./scripts/start.sh --use-TEST`);
    process.exit(2);
  }
  if (total < 100_000) {
    console.error(`  ERROR: connected to local ES (total=${total}). Perf suites require real ES.`);
    console.error(`         Restart with: ./scripts/start.sh --use-TEST`);
    process.exit(2);
  }
  if (!STABLE_UNTIL) {
    // Defensive — STABLE_UNTIL is a const at the top of this file. If someone
    // ever makes it conditional, this prevents accidental unpinned runs.
    console.error(`  ERROR: PERF_STABLE_UNTIL is empty. The corpus would drift between runs.`);
    process.exit(2);
  }
  console.log(`  Cluster OK: total=${total.toLocaleString()} corpus images, pinned to until=${STABLE_UNTIL}`);
}

// ---------------------------------------------------------------------------
// Perceived suite (short + long share these helpers, parameterized by kind)
// ---------------------------------------------------------------------------

function clearPerceivedTmp(kind) {
  const tmp = PERCEIVED_KINDS[kind].tmp;
  if (existsSync(tmp)) unlinkSync(tmp);
}

function runPerceivedPlaywright(kind) {
  const { config, label: kindLabel } = PERCEIVED_KINDS[kind];
  return new Promise((resolve) => {
    const pwArgs = [
      "playwright", "test",
      `--config=${config}`,
      "--reporter=list",
    ];
    if (headed) pwArgs.push("--headed");

    console.log(`\n  Running ${kindLabel}: npx ${pwArgs.join(" ")}`);
    console.log(`  PERF_STABLE_UNTIL=${STABLE_UNTIL}`);
    console.log();

    const child = spawn("npx", pwArgs, {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        FORCE_COLOR: "0",
        PERF_STABLE_UNTIL: STABLE_UNTIL,
      },
    });

    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);

    child.on("close", (code) => {
      console.log(`\n  ${kindLabel} Playwright exited with code ${code}`);
      resolve(code ?? 1);
    });
  });
}

function readPerceivedTmp(kind) {
  const tmp = PERCEIVED_KINDS[kind].tmp;
  if (!existsSync(tmp)) return [];
  const lines = readFileSync(tmp, "utf8")
    .split("\n").map((l) => l.trim()).filter(Boolean);
  return lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

function aggregatePerceivedMetrics(allRunMetrics) {
  // allRunMetrics: Array<Array<{id, label, action, dt_ack_ms, dt_status_ms, dt_first_pixel_ms, dt_settled_ms, status_total_ms}>>
  const byId = new Map();
  for (const runMetrics of allRunMetrics) {
    for (const m of runMetrics) {
      if (!byId.has(m.id)) byId.set(m.id, []);
      byId.get(m.id).push(m);
    }
  }

  const result = {};
  const FIELDS = ["dt_ack_ms", "dt_status_ms", "dt_first_pixel_ms", "dt_settled_ms", "status_total_ms"];

  for (const [id, entries] of byId) {
    const agg = { id, label: entries[0].label, action: entries[0].action };
    for (const f of FIELDS) {
      const values = entries.map((e) => e[f]).filter((v) => v != null);
      if (values.length === 0) {
        agg[f] = null;
        agg[f.replace("_ms", "_p95_ms")] = null;
      } else {
        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        agg[f] = sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
        agg[f.replace("_ms", "_p95_ms")] = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
      }
    }
    result[id] = agg;
  }
  return result;
}

function readPerceivedLog() {
  if (!existsSync(PERCEIVED_JSON)) return { entries: [] };
  try { return JSON.parse(readFileSync(PERCEIVED_JSON, "utf8")); } catch { return { entries: [] }; }
}

function writePerceivedLog(log) {
  writeFileSync(PERCEIVED_JSON, JSON.stringify(log, null, 2) + "\n");
  const PERCEIVED_JS = PERCEIVED_JSON.replace(/\.json$/, ".js");
  writeFileSync(PERCEIVED_JS, `window.__PERCEIVED_LOG__ = ${JSON.stringify(log)};\n`);
}

function appendPerceivedToMarkdown(entry) {
  const date = new Date(entry.timestamp).toISOString().split("T")[0];
  const dirty = entry.gitDirty ? " (dirty)" : "";
  const heading = `## [${entry.kind}] ${entry.label} (${entry.gitSha}${dirty}, ${date})`;
  const meta = `Stable until: ${entry.stableUntil} | Runs: ${entry.runs}`;

  const COLS = ["dt_ack_ms", "dt_status_ms", "dt_first_pixel_ms", "dt_settled_ms", "status_total_ms"];
  const LABELS = { dt_ack_ms: "Ack (ms)", dt_status_ms: "Status (ms)", dt_first_pixel_ms: "First pixel (ms)", dt_settled_ms: "Settled (ms)", status_total_ms: "Banner total (ms)" };

  const ids = Object.keys(entry.perceived);
  const stepHdr = entry.kind === "long" ? "Step" : "Test";
  const header = `| ${stepHdr} | Action | ${COLS.map((c) => LABELS[c]).join(" | ")} |`;
  const sep = `|------|--------|${COLS.map(() => "---").join("|")}|`;
  const rows = ids.map((id) => {
    const m = entry.perceived[id];
    const cells = COLS.map((c) => m[c] != null ? `${m[c]}` : "—");
    return `| ${id} | ${m.action} | ${cells.join(" | ")} |`;
  });

  const table = [header, sep, ...rows].join("\n");
  const section = [heading, "", meta, "", table].join("\n");

  let existing = "";
  if (existsSync(PERCEIVED_MD)) {
    existing = readFileSync(PERCEIVED_MD, "utf8");
  } else {
    existing = "# Perceived Performance Log\n\nGenerated by `e2e-perf/run-audit.mjs`. Each section is one run; `kind` is `short` (single-action tests) or `long` (multi-step journeys).\n";
  }
  writeFileSync(PERCEIVED_MD, existing + "\n---\n\n" + section + "\n");
}

/**
 * Run one perceived kind end-to-end: run Playwright `runs` times, aggregate,
 * append a log entry tagged with `kind`, print summary.
 *
 * Side effects: appends to perceived-log.{json,js,md} unless `dryRun`.
 */
async function runPerceivedKind(kind, git) {
  const { label: kindLabel } = PERCEIVED_KINDS[kind];

  console.log();
  console.log("+" + "=".repeat(66) + "+");
  console.log(`        Perceived suite — ${kindLabel.padEnd(40)}`);
  console.log("+" + "=".repeat(66) + "+");
  console.log();

  const allRunMetrics = [];

  for (let run = 1; run <= runs; run++) {
    if (runs > 1) {
      console.log(`\n${"─".repeat(60)}`);
      console.log(`  ${kindLabel} run ${run} of ${runs}`);
      console.log(`${"─".repeat(60)}`);
    }

    clearPerceivedTmp(kind);
    await runPerceivedPlaywright(kind);
    const m = readPerceivedTmp(kind);
    allRunMetrics.push(m);

    if (runs > 1) {
      console.log(`  ${kindLabel} run ${run}: captured ${m.length} metric entries`);
    }
  }

  const aggregated = aggregatePerceivedMetrics(allRunMetrics);
  console.log(`\n  ${kindLabel}: ${Object.keys(aggregated).length} scenarios captured`);

  if (Object.keys(aggregated).length === 0) {
    console.log(`  No ${kindLabel} metrics captured — were tests skipped? (Requires --use-TEST)`);
    return;
  }

  const entry = {
    kind,
    label,
    gitSha: git.sha,
    gitDirty: git.dirty,
    timestamp: new Date().toISOString(),
    stableUntil: STABLE_UNTIL,
    runs,
    perceived: aggregated,
  };

  if (!dryRun) {
    const log = readPerceivedLog();
    log.entries.push(entry);
    writePerceivedLog(log);
    console.log(`  Written: ${PERCEIVED_JSON} (kind=${kind})`);
    appendPerceivedToMarkdown(entry);
    console.log(`  Written: ${PERCEIVED_MD} (kind=${kind})`);
  } else {
    console.log(`  Dry run: skipping writes to perceived-log.{json,js,md}`);
  }

  // Print summary
  console.log();
  console.log("─".repeat(70));
  console.log(`  ${kindLabel.toUpperCase()} SUMMARY: ${label}`);
  console.log("─".repeat(70));
  const COLS = ["dt_ack_ms", "dt_first_pixel_ms", "dt_settled_ms", "status_total_ms"];
  const HDRS = { dt_ack_ms: "Ack", dt_first_pixel_ms: "1st pixel", dt_settled_ms: "Settled", status_total_ms: "Banner" };
  const idCol = kind === "long" ? "Step" : "Test";
  const actionWidth = kind === "long" ? 40 : 20;
  const header = `  ${idCol.padEnd(8)} ${"Action".padEnd(actionWidth)} ${COLS.map((c) => HDRS[c].padEnd(12)).join(" ")}`;
  console.log(header);
  console.log("  " + "─".repeat(header.length - 2));
  for (const id of Object.keys(aggregated)) {
    const m = aggregated[id];
    const cells = COLS.map((c) => m[c] != null ? `${m[c]}ms`.padEnd(12) : "—".padEnd(12));
    console.log(`  ${id.padEnd(8)} ${(m.action ?? "?").padEnd(actionWidth)} ${cells.join(" ")}`);
  }
  console.log();
}

// ---------------------------------------------------------------------------
// Run Playwright
// ---------------------------------------------------------------------------

function runPlaywright(grepPattern) {
  return new Promise((resolve) => {
    const pwArgs = [
      "playwright", "test",
      "--config=e2e-perf/playwright.perf.config.ts",
      "--reporter=list",
    ];

    if (grepPattern) {
      pwArgs.push(`--grep=${grepPattern}`);
    }
    if (headed) {
      pwArgs.push("--headed");
    }

    console.log(`\n  Running: npx ${pwArgs.join(" ")}`);
    console.log(`  PERF_STABLE_UNTIL=${STABLE_UNTIL}`);
    console.log();

    const child = spawn("npx", pwArgs, {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        FORCE_COLOR: "0",
        PERF_STABLE_UNTIL: STABLE_UNTIL,
      },
    });

    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);

    child.on("close", (code) => {
      console.log(`\n  Playwright exited with code ${code}`);
      resolve(code ?? 1);
    });
  });
}

// ---------------------------------------------------------------------------
// Read metrics from temp file
// ---------------------------------------------------------------------------

function readMetrics() {
  if (!existsSync(METRICS_FILE)) return [];
  const lines = readFileSync(METRICS_FILE, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Aggregate metrics across runs (median)
// ---------------------------------------------------------------------------

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function aggregateMetrics(allRunMetrics) {
  // allRunMetrics: Array<Array<{id, cls, clsMax, maxFrame, severe, p95Frame, domChurn, loafBlocking, frameCount, report?}>
  // Group by test ID, compute median across runs
  const byId = new Map();
  for (const runMetrics of allRunMetrics) {
    for (const m of runMetrics) {
      if (!byId.has(m.id)) byId.set(m.id, []);
      byId.get(m.id).push(m);
    }
  }

  const result = {};
  for (const [id, entries] of byId) {
    const agg = {
      cls: median(entries.map((e) => e.cls)),
      clsMax: median(entries.map((e) => e.clsMax)),
      maxFrame: Math.round(median(entries.map((e) => e.maxFrame))),
      severe: Math.round(median(entries.map((e) => e.severe))),
      // severeRate = severe per 1000 frames — refresh-rate-independent.
      // Computed from raw data when available, falls back to severe/frameCount.
      severeRate: (() => {
        const rates = entries.map((e) =>
          e.severeRate != null ? e.severeRate
            : e.frameCount > 0 ? Math.round(e.severe / e.frameCount * 1000 * 10) / 10
            : 0);
        return Math.round(median(rates) * 10) / 10;
      })(),
      p95Frame: Math.round(median(entries.map((e) => e.p95Frame))),
      domChurn: Math.round(median(entries.map((e) => e.domChurn))),
      loafBlocking: Math.round(median(entries.map((e) => e.loafBlocking))),
      frameCount: Math.round(median(entries.map((e) => e.frameCount))),
      report: entries[0].report !== false, // default true
    };
    // Preserve focus drift fields when present (P4a, P4b, P6).
    // These measure "Never Lost" accuracy — how far the focused item drifts
    // in the viewport during density switches and sort changes.
    const driftValues = entries.map((e) => e.focusDriftPx).filter((v) => v != null);
    if (driftValues.length > 0) agg.focusDriftPx = Math.round(median(driftValues));
    const ratioValues = entries.map((e) => e.focusDriftRatio).filter((v) => v != null);
    if (ratioValues.length > 0) agg.focusDriftRatio = Math.round(median(ratioValues) * 1000) / 1000;
    const visValues = entries.map((e) => e.focusVisible).filter((v) => v != null);
    if (visValues.length > 0) agg.focusVisible = visValues.filter(Boolean).length >= visValues.length / 2;
    result[id] = agg;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Read/write audit log
// ---------------------------------------------------------------------------

function readAuditLog() {
  if (!existsSync(AUDIT_JSON)) return { entries: [] };
  try {
    return JSON.parse(readFileSync(AUDIT_JSON, "utf8"));
  } catch {
    return { entries: [] };
  }
}

function writeAuditLog(log) {
  writeFileSync(AUDIT_JSON, JSON.stringify(log, null, 2) + "\n");
  // Also emit a sibling JS file so audit-graphs.html can load the data over
  // file:// (browsers block fetch() on file:// URLs). The HTML loads this via
  // <script src="audit-log.js">, which has no such restriction.
  const AUDIT_JS = AUDIT_JSON.replace(/\.json$/, ".js");
  writeFileSync(AUDIT_JS, `window.__AUDIT_LOG__ = ${JSON.stringify(log)};\n`);
}

// ---------------------------------------------------------------------------
// Markdown generation
// ---------------------------------------------------------------------------

const METRIC_COLS = ["cls", "maxFrame", "severeRate", "p95Frame", "domChurn", "loafBlocking"];
const METRIC_LABELS = {
  cls: "CLS",
  maxFrame: "Max frame",
  severeRate: "Severe/1k frames",
  p95Frame: "P95 frame",
  domChurn: "DOM churn",
  loafBlocking: "LoAF blocking",
};
const METRIC_UNITS = {
  cls: "",
  maxFrame: "ms",
  severeRate: "‰",
  p95Frame: "ms",
  domChurn: "",
  loafBlocking: "ms",
};

function formatValue(key, value) {
  const unit = METRIC_UNITS[key] ?? "";
  if (key === "cls") return value.toFixed(4);
  if (key === "severeRate") return `${value.toFixed(1)}${unit}`;
  return `${value}${unit}`;
}

function formatDelta(key, delta) {
  const unit = METRIC_UNITS[key] ?? "";
  if (Math.abs(delta) < 0.0001 && (key === "cls" || key === "severeRate")) return "(0)";
  if (delta === 0) return "(0)";
  const sign = delta > 0 ? "+" : "";
  if (key === "cls") return `(${sign}${delta.toFixed(4)})`;
  if (key === "severeRate") return `(${sign}${delta.toFixed(1)}${unit})`;
  return `(${sign}${delta}${unit})`;
}

function buildBaselineTable(entry) {
  const ids = Object.keys(entry.metrics).filter((id) => entry.metrics[id].report !== false);
  if (ids.length === 0) return "";

  const header = `| Test | ${METRIC_COLS.map((k) => METRIC_LABELS[k]).join(" | ")} |`;
  const sep = `|------|${METRIC_COLS.map(() => "---").join("|")}|`;
  const rows = ids.map((id) => {
    const m = entry.metrics[id];
    const cells = METRIC_COLS.map((k) => {
      const val = m[k] ?? (k === "severeRate" && m.frameCount > 0
        ? Math.round(m.severe / m.frameCount * 1000 * 10) / 10 : 0);
      return formatValue(k, val);
    });
    return `| ${id} | ${cells.join(" | ")} |`;
  });

  return [header, sep, ...rows].join("\n");
}

function buildDiffTable(current, previous) {
  const ids = Object.keys(current.metrics).filter((id) => current.metrics[id].report !== false);
  if (ids.length === 0) return "";

  const header = `| Test | ${METRIC_COLS.map((k) => `${METRIC_LABELS[k]} (Δ)`).join(" | ")} |`;
  const sep = `|------|${METRIC_COLS.map(() => "---").join("|")}|`;
  const rows = ids.map((id) => {
    const cur = current.metrics[id];
    const prev = previous.metrics[id];
    const cells = METRIC_COLS.map((k) => {
      // For severeRate: compute from severe/frameCount if not stored directly
      const curVal = cur[k] ?? (k === "severeRate" && cur.frameCount > 0
        ? Math.round(cur.severe / cur.frameCount * 1000 * 10) / 10 : 0);
      const val = formatValue(k, curVal);
      if (!prev) return val;
      const prevVal = prev[k] ?? (k === "severeRate" && prev.frameCount > 0
        ? Math.round(prev.severe / prev.frameCount * 1000 * 10) / 10 : 0);
      const delta = k === "cls"
        ? parseFloat((curVal - prevVal).toFixed(4))
        : k === "severeRate"
          ? Math.round((curVal - prevVal) * 10) / 10
          : Math.round(curVal - prevVal);
      return `${val} ${formatDelta(k, delta)}`;
    });
    return `| ${id} | ${cells.join(" | ")} |`;
  });

  // Verdict: any metric worse by >10%?
  // Use severeRate (per-1000-frames) instead of raw severe count for
  // refresh-rate-independent comparison. Falls back to computing from
  // severe/frameCount for old entries that lack severeRate.
  let verdict = "No regression detected.";
  const regressions = [];
  for (const id of ids) {
    const cur = current.metrics[id];
    const prev = previous.metrics[id];
    if (!prev) continue;
    for (const k of ["maxFrame", "severeRate", "p95Frame"]) {
      const curVal = cur[k] ?? (k === "severeRate" && cur.frameCount > 0
        ? Math.round(cur.severe / cur.frameCount * 1000 * 10) / 10 : 0);
      const prevVal = prev[k] ?? (k === "severeRate" && prev.frameCount > 0
        ? Math.round(prev.severe / prev.frameCount * 1000 * 10) / 10 : 0);
      if (prevVal > 0 && (curVal - prevVal) / prevVal > 0.1) {
        const label = k === "severeRate" ? `${id}.severeRate` : `${id}.${k}`;
        const fmt = k === "severeRate"
          ? `${prevVal.toFixed(1)}‰ → ${curVal.toFixed(1)}‰`
          : `${prevVal} → ${curVal}`;
        regressions.push(`${label}: ${fmt} (+${(((curVal - prevVal) / prevVal) * 100).toFixed(0)}%)`);
      }
    }
  }
  if (regressions.length > 0) {
    verdict = `⚠️ Possible regressions: ${regressions.join(", ")}`;
  }

  return [...[header, sep, ...rows], "", `Verdict: ${verdict}`].join("\n");
}

function appendToMarkdown(entry, previousEntry) {
  const date = new Date(entry.timestamp).toISOString().split("T")[0];
  const dirty = entry.gitDirty ? " (dirty)" : "";
  const heading = `## ${entry.label} (${entry.gitSha}${dirty}, ${date})`;
  const meta = `Stable until: ${entry.stableUntil} | Runs: ${entry.runs}`;

  let section;
  if (!previousEntry) {
    section = [heading, "", meta, "", buildBaselineTable(entry)].join("\n");
  } else {
    section = [heading, "", meta, "", buildDiffTable(entry, previousEntry)].join("\n");
  }

  let existing = "";
  if (existsSync(AUDIT_MD)) {
    existing = readFileSync(AUDIT_MD, "utf8");
  } else {
    existing = "# Perf Audit Log\n\nGenerated by `e2e-perf/run-audit.mjs`.\n";
  }

  writeFileSync(AUDIT_MD, existing + "\n---\n\n" + section + "\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const git = getGitInfo();

  console.log();
  console.log("+" + "=".repeat(66) + "+");
  console.log("        Kupua Rendering Performance Audit Harness            ");
  console.log("+" + "=".repeat(66) + "+");
  console.log();
  console.log(`  Label:        ${label}`);
  console.log(`  Git SHA:      ${git.sha}${git.dirty ? " (dirty)" : ""}`);
  console.log(`  Runs:         ${runs}`);
  console.log(`  Stable until: ${STABLE_UNTIL}`);
  console.log(`  Grep:         ${grepArg || "(all tests)"}`);
  if (dryRun) console.log(`  Dry run:      no log files will be written`);
  if (headed) console.log(`  Headed:       browser will be visible`);
  console.log(`  Suites:       jank=${runJank} short=${runShort} long=${runLong}`);
  console.log();

  // Cluster gate: ensures we're on real ES with a pinned corpus before
  // running any spec. Replaces the old per-test requireRealData() guards.
  await enforceClusterGate();
  console.log();

  const allRunMetrics = [];

  if (runJank) for (let run = 1; run <= runs; run++) {
    if (runs > 1) {
      console.log(`\n${"─".repeat(60)}`);
      console.log(`  Run ${run} of ${runs}`);
      console.log(`${"─".repeat(60)}`);
    }

    clearMetricsFile();
    await runPlaywright(grepArg);
    const metrics = readMetrics();
    allRunMetrics.push(metrics);

    if (runs > 1) {
      console.log(`  Run ${run}: captured ${metrics.length} metric entries`);
    }
  }

  if (runJank) {
  const aggregated = aggregateMetrics(allRunMetrics);
  const reportableCount = Object.values(aggregated).filter((m) => m.report !== false).length;
  console.log(`\n  Captured metrics: ${Object.keys(aggregated).length} total, ${reportableCount} reportable`);

  if (Object.keys(aggregated).length === 0) {
    console.log("  No metrics captured — were the tests skipped? (Requires --use-TEST)");
    if (!runShort && !runLong) process.exit(0);
  }

  // Build audit entry
  const entry = {
    label,
    gitSha: git.sha,
    gitDirty: git.dirty,
    timestamp: new Date().toISOString(),
    stableUntil: STABLE_UNTIL,
    runs,
    metrics: aggregated,
  };

  // Read existing log
  const log = readAuditLog();
  const previousEntry = log.entries.length > 0 ? log.entries[log.entries.length - 1] : null;

  if (dryRun) {
    console.log(`  Dry run: skipping writes to audit-log.{json,js,md}`);
    if (previousEntry) {
      console.log();
      console.log("─".repeat(70));
      console.log(`  DIFF vs previous entry: ${previousEntry.label} (${previousEntry.gitSha}${previousEntry.gitDirty ? " dirty" : ""})`);
      console.log("─".repeat(70));
      console.log(buildDiffTable(entry, previousEntry));
    } else {
      console.log("  No previous entry to diff against.");
    }
  } else {
    // Append to log
    log.entries.push(entry);
    writeAuditLog(log);
    console.log(`  Written: ${AUDIT_JSON}`);

    // Append to markdown
    appendToMarkdown(entry, previousEntry);
    console.log(`  Written: ${AUDIT_MD}`);
  }

  // Print summary
  console.log();
  console.log("─".repeat(70));
  console.log(`  SUMMARY: ${entry.label}`);
  console.log("─".repeat(70));
  const ids = Object.keys(aggregated).filter((id) => aggregated[id].report !== false);
  const header = `  ${"Test".padEnd(8)} ${"CLS".padEnd(8)} ${"Max frame".padEnd(12)} ${"Severe".padEnd(8)} ${"P95".padEnd(8)} ${"DOM churn".padEnd(12)} LoAF`;
  console.log(header);
  console.log("  " + "─".repeat(header.length - 2));
  for (const id of ids) {
    const m = aggregated[id];
    const line = `  ${id.padEnd(8)} ${m.cls.toFixed(4).padEnd(8)} ${`${m.maxFrame}ms`.padEnd(12)} ${String(m.severe).padEnd(8)} ${`${m.p95Frame}ms`.padEnd(8)} ${String(m.domChurn).padEnd(12)} ${m.loafBlocking}ms`;
    console.log(line);
  }
  console.log();
  } // end if (runJank)

  // ---------------------------------------------------------------------------
  // Perceived suites (short + long)
  // ---------------------------------------------------------------------------

  if (runShort) await runPerceivedKind("short", git);
  if (runLong)  await runPerceivedKind("long", git);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

