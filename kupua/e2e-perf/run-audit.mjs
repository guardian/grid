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
 *   --use-media-api Route searchAfter through the local media-api server.
 *                   Requires kupua started with: ./scripts/start.sh --use-media-api
 *                   Also requires a panda auth file (one-time setup — see
 *                   enforceClusterGate() for the generation command).
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
import { createHash } from "node:crypto";
import { arch, platform, release } from "node:os";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { appendFileSync, existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import {
  assertBalancedLongRuns,
  assertCompleteMetricIds,
  assertEnvironmentMatches,
  assertPlaywrightSucceeded,
  assertSameEnvironment,
  createDeferredWrites,
  expectedJankMetricIds,
  expectedPerceivedMetricIds,
  parseJsonLines,
  parseSuccessfulRun,
  PERCEIVED_METRIC_IDS,
  requireSingleEnvironment,
} from "./harness-validation.mjs";
import { commitFileTransaction, pruneAuditHistory, readHistoryLog } from "./history-files.mjs";
import { metricsAreComparable, severeRateIsReportable } from "./p14-metrics.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const reportTimestamp = new Date().toISOString().replace(/[:.]/g, "-");
const LATEST_RUN_REPORT = resolve(
  process.env.TMPDIR ?? __dirname,
  `kupua-perf-${reportTimestamp}-${process.pid}.log`,
);
writeFileSync(LATEST_RUN_REPORT, "");
writeFileSync(resolve(__dirname, "results/.latest-report-path"), `${LATEST_RUN_REPORT}\n`);

function appendRunReport(chunk) {
  appendFileSync(LATEST_RUN_REPORT, chunk);
}

function failCli(message, exitCode) {
  const line = `${message}\n`;
  appendRunReport(line);
  console.error(message);
  process.exit(exitCode);
}

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
const ENVIRONMENT_TMP = resolve(__dirname, "results/.environment-tmp.json");

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
let pruneHistory = false;
let rebuildHistory = false;

// Mode flags. Resolved into runJank / runShort / runLong below.
let perceivedFull = false;     // --perceived             jank + short + long
let perceivedOnly = false;     // --perceived-only        short + long
let shortOnly = false;         // --short-perceived-only  short
let longOnly = false;          // --long-perceived-only   long
let useMediaApi = false;       // --use-media-api         route searchAfter through media-api

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
  } else if (a === "--prune-history") {
    pruneHistory = true;
  } else if (a === "--rebuild-history") {
    rebuildHistory = true;
  } else if (a === "--perceived") {
    perceivedFull = true;
  } else if (a === "--perceived-only") {
    perceivedOnly = true;
  } else if (a === "--short-perceived-only") {
    shortOnly = true;
  } else if (a === "--long-perceived-only") {
    longOnly = true;
  } else if (a === "--use-media-api") {
    useMediaApi = true;
  } else if (!a.startsWith("--")) {
    // Positional arg: jank test filter (e.g. "P8" or "P3,P8")
    const parts = a.split(",").map((s) => s.trim()).filter(Boolean);
    grepArg = parts.join("|");
  } else {
    failCli(`Unknown flag: ${a}`, 2);
  }
}

// Validate: at most one of the four perceived modes.
const perceivedModeCount = [perceivedFull, perceivedOnly, shortOnly, longOnly]
  .filter(Boolean).length;
if (perceivedModeCount > 1) {
  failCli(
    "Error: --perceived / --perceived-only / --short-perceived-only / " +
    "--long-perceived-only are mutually exclusive.",
    2,
  );
}

// Resolve to three booleans.
const runJank  = !perceivedOnly && !shortOnly && !longOnly;
const runShort = perceivedFull || perceivedOnly || shortOnly;
const runLong  = perceivedFull || perceivedOnly || longOnly;

try {
  assertBalancedLongRuns({ runLong, runs, dryRun });
} catch (error) {
  failCli(`Error: ${error.message}`, 1);
}

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
    const status = execSync("git status --porcelain -- .", { cwd: ROOT });
    const diff = execSync(
      "git diff --binary HEAD -- .",
      { cwd: ROOT, maxBuffer: 20 * 1024 * 1024 },
    );
    const dirty = status.length > 0;
    const dirtyState = Buffer.concat([status, diff]);
    const dirtyStateHash = createHash("sha256").update(dirtyState).digest("hex").slice(0, 16);
    return { sha, dirty, dirtyStateHash };
  } catch {
    return { sha: "unknown", dirty: false, dirtyStateHash: "unknown" };
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

function clearEnvironmentFile() {
  if (existsSync(ENVIRONMENT_TMP)) unlinkSync(ENVIRONMENT_TMP);
}

function readEnvironment(exitCode, suiteLabel, git) {
  assertPlaywrightSucceeded(exitCode, suiteLabel);
  if (!existsSync(ENVIRONMENT_TMP)) {
    throw new Error(`${suiteLabel} did not emit an environment fingerprint`);
  }
  const rows = parseJsonLines(readFileSync(ENVIRONMENT_TMP, "utf8"), ENVIRONMENT_TMP);
  unlinkSync(ENVIRONMENT_TMP);
  const observed = assertEnvironmentMatches(requireSingleEnvironment(rows, suiteLabel), {
    dataMode: useMediaApi ? "media-api" : "direct-es",
  });
  return {
    ...observed,
    os: { platform: platform(), release: release(), architecture: arch() },
    headed: true,
    cpuThrottle: Number(process.env.CPU_THROTTLE || 0),
    cacheClass: "uncontrolled-browser-cache",
    workers: 1,
    stableUntil: STABLE_UNTIL,
    gitSha: git.sha,
    gitDirty: git.dirty,
    gitDirtyStateHash: git.dirtyStateHash,
  };
}

function formatEnvironment(environment) {
  if (!environment) return "Environment: unavailable";
  return [
    `Mode: ${environment.dataMode}`,
    `Base URL: ${environment.appBaseUrl}`,
    `Browser: ${environment.browserName} ${environment.browserVersion}`,
    `OS: ${environment.os.platform}/${environment.os.architecture} ${environment.os.release}`,
    `Viewport: ${environment.viewport.width}x${environment.viewport.height}`,
    `Screen: ${environment.screen.width}x${environment.screen.height}`,
    `DPR: ${environment.deviceScaleFactor}`,
    `Headed: ${environment.headed}`,
    `CPU throttle: ${environment.cpuThrottle || "none"}`,
    `Cache: ${environment.cacheClass}`,
    `Workers: ${environment.workers}`,
    `Dirty state: ${environment.gitDirtyStateHash}`,
  ].join(" | ");
}

// ---------------------------------------------------------------------------
// ES RTT probe — 5 lightweight pings before any suite, median = baseline_rtt_ms.
// Fires directly against ES (bypassing Vite proxy) so it measures true network
// overhead, not Vite middleware time. Uses KUPUA_ES_URL, same as Vite proxy.
// ---------------------------------------------------------------------------

const ES_DIRECT_URL = process.env.KUPUA_ES_URL ?? "http://localhost:9220";

async function probeRtt() {
  const timings = [];
  for (let i = 0; i < 5; i++) {
    const t0 = Date.now();
    try { await fetch(`${ES_DIRECT_URL}/_cat/aliases`); } catch { /* ignore */ }
    timings.push(Date.now() - t0);
  }
  const sorted = [...timings].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

// Path to the Playwright storageState file for --use-media-api mode.
// Must contain a valid panda session cookie. Not committed — add to
// .git/info/exclude. Generate once with:
//   npx --prefix kupua playwright codegen \
//     --save-storage=kupua/e2e-perf/.panda-auth.json \
//     https://kupua.media.local.dev-gutools.co.uk
const PANDA_AUTH_FILE = resolve(__dirname, ".panda-auth.json");

function enforceClusterGate() {
  // --use-media-api auth check: must have a storageState file so Playwright
  // contexts can authenticate to media-api.
  if (useMediaApi) {
    if (!existsSync(PANDA_AUTH_FILE)) {
      console.error(`  ERROR: --use-media-api requires a panda auth file at:`);
      console.error(`         ${PANDA_AUTH_FILE}`);
      console.error(`  Generate it once (while logged in to kupua) with:`);
      console.error(`    npx --prefix kupua playwright codegen \\`);
      console.error(`      --save-storage=kupua/e2e-perf/.panda-auth.json \\`);
      console.error(`      https://kupua.media.local.dev-gutools.co.uk`);
      console.error(`  Then add kupua/e2e-perf/.panda-auth.json to .git/info/exclude.`);
      process.exit(2);
    }
    console.log(`  Auth:         using storageState from ${PANDA_AUTH_FILE}`);
  }
  if (!STABLE_UNTIL) {
    // Defensive — STABLE_UNTIL is a const at the top of this file. If someone
    // ever makes it conditional, this prevents accidental unpinned runs.
    console.error(`  ERROR: PERF_STABLE_UNTIL is empty. The corpus would drift between runs.`);
    process.exit(2);
  }
}

// ---------------------------------------------------------------------------
// Perceived suite (short + long share these helpers, parameterized by kind)
// ---------------------------------------------------------------------------

function clearPerceivedTmp(kind) {
  const tmp = PERCEIVED_KINDS[kind].tmp;
  if (existsSync(tmp)) unlinkSync(tmp);
}

function runPerceivedPlaywright(kind, runIndex) {
  const { config, label: kindLabel } = PERCEIVED_KINDS[kind];
  const expectedIds = expectedPerceivedMetricIds(kind, grepArg);
  return new Promise((resolve) => {
    const pwArgs = [
      "playwright", "test",
      `--config=${config}`,
      "--reporter=list",
    ];
    if (grepArg) pwArgs.push(`--grep=(?:${expectedIds.join("|")}):`);
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
        KUPUA_PERF_ENV_FILE: ENVIRONMENT_TMP,
        KUPUA_PERF_RUN_INDEX: String(runIndex),
        ...(useMediaApi && {
          KUPUA_PERF_AUTH_FILE: PANDA_AUTH_FILE,
          KUPUA_PERF_BASE_URL: "https://kupua.media.local.dev-gutools.co.uk",
        }),
      },
    });

    child.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
      appendRunReport(chunk);
    });
    child.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
      appendRunReport(chunk);
    });

    child.on("close", (code) => {
      console.log(`\n  ${kindLabel} Playwright exited with code ${code}`);
      resolve(code ?? 1);
    });
  });
}

function readPerceivedTmp(kind, exitCode) {
  const tmp = PERCEIVED_KINDS[kind].tmp;
  const contents = existsSync(tmp) ? readFileSync(tmp, "utf8") : "";
  return parseSuccessfulRun({
    exitCode,
    suiteLabel: PERCEIVED_KINDS[kind].label,
    contents,
    sourcePath: tmp,
  });
}

function aggregatePerceivedMetrics(allRunMetrics) {
  // allRunMetrics contains explicit correlated action boundaries per scenario.
  const byId = new Map();
  for (const runMetrics of allRunMetrics) {
    for (const m of runMetrics) {
      if (!byId.has(m.id)) byId.set(m.id, []);
      byId.get(m.id).push(m);
    }
  }

  const result = {};
  const FIELDS = [
    "dt_ack_ms",
    "dt_status_ms",
    "status_total_ms",
    "dt_native_exit_ms",
    "dt_store_ready_ms",
    "dt_first_visible_frame_ms",
    "dt_visual_settled_ms",
    "matched_control_first_visible_ms",
    "matched_control_settled_ms",
  ];

  for (const [id, entries] of byId) {
    const agg = {
      id,
      label: entries[0].label,
      action: entries[0].action,
      sampleCount: entries.length,
    };
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
    // Store timing fields — only aggregate when present (not all scenarios hit ES).
    for (const f of ["took", "fetchDuration", "seekTime", "aggTook", "aggFetchDuration"]) {
      const values = entries.map((e) => e[f]).filter((v) => v != null);
      if (values.length > 0) {
        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        agg[f] = sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
      }
    }
    for (const field of [
      "interactionId", "scenarioRevision", "settledTotal", "resultRegime", "matchedControlDesign",
      "metricClass", "mapEntryCount",
      "setupGlobalPosition", "setupBufferOffset", "setupBufferLength",
      "setupVisibleRangeRatio", "setupExtended", "setupEvictGeneration",
      "setupEvictedCount",
    ]) {
      const values = entries.map((entry) => entry[field]).filter((value) => value != null);
      if (values.length > 0) {
        if (id === "PP1" && field === "settledTotal") {
          agg.settledTotalMin = Math.min(...values);
          agg.settledTotalMax = Math.max(...values);
          continue;
        }
        if (field !== "interactionId" && new Set(values.map((value) => JSON.stringify(value))).size !== 1) {
          throw new Error(`${id} changed ${field} across repetitions`);
        }
        if (field !== "interactionId") agg[field] = values[0];
      }
    }
    const routeValues = entries.map((entry) => entry.routes).filter(Boolean);
    if (routeValues.length > 0) {
      const routeFingerprints = new Set(routeValues.map((routes) => JSON.stringify(routes)));
      if (routeFingerprints.size !== 1) throw new Error(`${id} changed routes across repetitions`);
      agg.routes = routeValues[0];
    }
    const controlRouteValues = entries.map((entry) => entry.matchedControlRoutes).filter(Boolean);
    if (controlRouteValues.length > 0) {
      const controlRouteFingerprints = new Set(controlRouteValues.map((routes) => JSON.stringify(routes)));
      if (controlRouteFingerprints.size !== 1) throw new Error(`${id} changed matchedControlRoutes across repetitions`);
      agg.matchedControlRoutes = controlRouteValues[0];
    }
    for (const field of ["requestedRatio", "achievedRatio", "anchorDriftPx", "anchorDriftRatio"]) {
      const values = entries.map((entry) => entry[field]).filter((value) => value != null);
      if (values.length > 0) agg[field] = median(values);
    }
    // seekMeasures — aggregate by name, median duration across runs.
    const allSeekMeasures = entries.flatMap((e) => e.seekMeasures ?? []);
    if (allSeekMeasures.length > 0) {
      const byName = new Map();
      for (const m of allSeekMeasures) {
        if (!byName.has(m.name)) byName.set(m.name, []);
        byName.get(m.name).push(m.duration);
      }
      agg.seekMeasures = [...byName.entries()].map(([name, durations]) => {
        const sorted = [...durations].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return { name, duration: sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid] };
      });
    }
    result[id] = agg;
  }
  return result;
}

function buildPerceivedMarkdown(existing, entry) {
  const date = new Date(entry.timestamp).toISOString().split("T")[0];
  const dirty = entry.gitDirty ? " (dirty)" : "";
  const heading = `## [${entry.kind}] ${entry.label} (${entry.gitSha}${dirty}, ${date})`;
  const meta = `Stable until: ${entry.stableUntil} | Runs: ${entry.runs}\n\n${formatEnvironment(entry.environment)}`;

  const COLS = ["dt_ack_ms", "dt_status_ms", "dt_store_ready_ms", "dt_first_visible_frame_ms", "dt_visual_settled_ms", "status_total_ms"];
  const LABELS = { dt_ack_ms: "Ack (ms)", dt_status_ms: "Status (ms)", dt_store_ready_ms: "Store ready (ms)", dt_first_visible_frame_ms: "First visible (ms)", dt_visual_settled_ms: "Visual settled (ms)", status_total_ms: "Banner total (ms)" };

  const ids = Object.keys(entry.perceived).filter(
    (id) => entry.perceived[id].metricClass !== "background-diagnostic",
  );
  const diagnosticIds = Object.keys(entry.perceived).filter(
    (id) => entry.perceived[id].metricClass === "background-diagnostic",
  );
  const stepHdr = entry.kind === "long" ? "Step" : "Test";
  const header = `| ${stepHdr} | Action | Samples | ${COLS.map((c) => LABELS[c]).join(" | ")} |`;
  const sep = `|------|--------|---|${COLS.map(() => "---").join("|")}|`;
  const rows = ids.map((id) => {
    const m = entry.perceived[id];
    const cells = COLS.map((c) => m[c] != null ? `${m[c]}` : "—");
    return `| ${id} | ${m.action} | ${m.sampleCount} | ${cells.join(" | ")} |`;
  });

  const table = [header, sep, ...rows].join("\n");
  const diagnosticRows = diagnosticIds.map((id) => {
    const metric = entry.perceived[id];
    return `| ${id} | ${metric.action} | ${metric.sampleCount} | ${metric.dt_store_ready_ms ?? "—"} | ${metric.mapEntryCount ?? "—"} |`;
  });
  const diagnosticTable = diagnosticRows.length > 0
    ? [
        "### Background diagnostics",
        "",
        "Not ranked against user-action latency targets.",
        "",
        "| Test | Action | Samples | Store ready (ms) | Map entries |",
        "|------|--------|---|---|---|",
        ...diagnosticRows,
      ].join("\n")
    : null;
  const jb2 = entry.perceived.JB2;
  const matchedControl = jb2?.matched_control_settled_ms != null
    ? `JB2 matched no-anchor control: first visible ${jb2.matched_control_first_visible_ms}ms; settled ${jb2.matched_control_settled_ms}ms; design ${jb2.matchedControlDesign}. Do not subtract sequential samples; compare balanced aggregates only.`
    : null;
  const section = [
    heading, "", meta, "", table,
    ...(matchedControl ? ["", matchedControl] : []),
    ...(diagnosticTable ? ["", diagnosticTable] : []),
  ].join("\n");

  if (!existing) {
    existing = "# Perceived Performance Log\n\nGenerated by `e2e-perf/run-audit.mjs`. Each section is one run; `kind` is `short` (single-action tests) or `long` (multi-step journeys).\n";
  }
  return existing + "\n---\n\n" + section + "\n";
}

/**
 * Run one perceived kind end-to-end: run Playwright `runs` times, aggregate,
 * append a log entry tagged with `kind`, print summary.
 *
 * Side effects: appends to perceived-log.{json,js,md} unless `dryRun`.
 */
async function runPerceivedKind(kind, git, baselineRttMs, historyWrites, historyState) {
  const { label: kindLabel } = PERCEIVED_KINDS[kind];

  console.log();
  console.log("+" + "=".repeat(66) + "+");
  console.log(`        Perceived suite — ${kindLabel.padEnd(40)}`);
  console.log("+" + "=".repeat(66) + "+");
  console.log();

  const allRunMetrics = [];
  let environment = null;

  for (let run = 1; run <= runs; run++) {
    if (runs > 1) {
      console.log(`\n${"─".repeat(60)}`);
      console.log(`  ${kindLabel} run ${run} of ${runs}`);
      console.log(`${"─".repeat(60)}`);
    }

    clearPerceivedTmp(kind);
    clearEnvironmentFile();
    const exitCode = await runPerceivedPlaywright(kind, run);
    const runEnvironment = readEnvironment(exitCode, kindLabel, git);
    environment = environment
      ? assertSameEnvironment(environment, runEnvironment, `${kindLabel} run ${run}`)
      : runEnvironment;
    const m = readPerceivedTmp(kind, exitCode);
    assertCompleteMetricIds(m, expectedPerceivedMetricIds(kind, grepArg), `${kindLabel} run ${run}`);
    allRunMetrics.push(m);

    if (runs > 1) {
      console.log(`  ${kindLabel} run ${run}: captured ${m.length} metric entries`);
    }
  }

  const aggregated = aggregatePerceivedMetrics(allRunMetrics);
  console.log(`\n  ${kindLabel}: ${Object.keys(aggregated).length} scenarios captured`);
  console.log(`  ${formatEnvironment(environment)}`);

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
    baseline_rtt_ms: baselineRttMs,
    environment,
    perceived: aggregated,
  };

  if (!dryRun) {
    historyWrites.defer(() => {
      historyState.perceivedLog ??= readHistoryLog(PERCEIVED_JSON);
      historyState.perceivedMarkdown ??= existsSync(PERCEIVED_MD)
        ? readFileSync(PERCEIVED_MD, "utf8")
        : "";
      historyState.perceivedLog.entries.push(entry);
      historyState.perceivedMarkdown = buildPerceivedMarkdown(historyState.perceivedMarkdown, entry);
      historyState.files.set(PERCEIVED_JSON, JSON.stringify(historyState.perceivedLog, null, 2) + "\n");
      historyState.files.set(
        PERCEIVED_JSON.replace(/\.json$/, ".js"),
        `window.__PERCEIVED_LOG__ = ${JSON.stringify(historyState.perceivedLog)};\n`,
      );
      historyState.files.set(PERCEIVED_MD, historyState.perceivedMarkdown);
    });
  } else {
    console.log(`  Dry run: skipping writes to perceived-log.{json,js,md}`);
  }

  // Print summary
  console.log();
  console.log("─".repeat(70));
  console.log(`  ${kindLabel.toUpperCase()} SUMMARY: ${label}`);
  console.log("─".repeat(70));
  const COLS = ["dt_ack_ms", "dt_store_ready_ms", "dt_first_visible_frame_ms", "dt_visual_settled_ms", "status_total_ms"];
  const HDRS = { dt_ack_ms: "Ack", dt_store_ready_ms: "Store", dt_first_visible_frame_ms: "1st visible", dt_visual_settled_ms: "Visual settle", status_total_ms: "Banner" };
  const idCol = kind === "long" ? "Step" : "Test";
  const actionWidth = kind === "long" ? 40 : 20;
  const header = `  ${idCol.padEnd(8)} ${"Action".padEnd(actionWidth)} ${COLS.map((c) => HDRS[c].padEnd(12)).join(" ")}`;
  console.log(header);
  console.log("  " + "─".repeat(header.length - 2));
  for (const id of Object.keys(aggregated).filter(
    (id) => aggregated[id].metricClass !== "background-diagnostic",
  )) {
    const m = aggregated[id];
    const cells = COLS.map((c) => m[c] != null ? `${m[c]}ms`.padEnd(12) : "—".padEnd(12));
    console.log(`  ${id.padEnd(8)} ${(m.action ?? "?").padEnd(actionWidth)} ${cells.join(" ")}`);
  }
  const diagnostics = Object.keys(aggregated).filter(
    (id) => aggregated[id].metricClass === "background-diagnostic",
  );
  if (diagnostics.length > 0) {
    console.log("\n  Background diagnostics (no user-action target):");
    for (const id of diagnostics) {
      const metric = aggregated[id];
      console.log(`  ${id}: store ready=${metric.dt_store_ready_ms ?? "—"}ms, entries=${metric.mapEntryCount ?? "—"}`);
    }
  }
  const jb2 = aggregated.JB2;
  if (jb2?.matched_control_settled_ms != null) {
    console.log(`\n  JB2 matched no-anchor control (${jb2.matchedControlDesign}): first visible=${jb2.matched_control_first_visible_ms}ms settled=${jb2.matched_control_settled_ms}ms`);
    console.log("  Compare balanced aggregates only; do not subtract sequential samples as causal anchor cost.");
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
        KUPUA_PERF_ENV_FILE: ENVIRONMENT_TMP,
        ...(useMediaApi && {
          KUPUA_PERF_AUTH_FILE: PANDA_AUTH_FILE,
          KUPUA_PERF_BASE_URL: "https://kupua.media.local.dev-gutools.co.uk",
        }),
      },
    });

    child.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
      appendRunReport(chunk);
    });
    child.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
      appendRunReport(chunk);
    });

    child.on("close", (code) => {
      console.log(`\n  Playwright exited with code ${code}`);
      resolve(code ?? 1);
    });
  });
}

// ---------------------------------------------------------------------------
// Read metrics from temp file
// ---------------------------------------------------------------------------

function readMetrics(exitCode) {
  const contents = existsSync(METRICS_FILE) ? readFileSync(METRICS_FILE, "utf8") : "";
  return parseSuccessfulRun({
    exitCode,
    suiteLabel: "jank",
    contents,
    sourcePath: METRICS_FILE,
  });
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
      sampleCount: entries.length,
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
    const horizontalDriftValues = entries.map((e) => e.focusHorizontalDriftPx).filter((v) => v != null);
    if (horizontalDriftValues.length > 0) agg.focusHorizontalDriftPx = Math.round(median(horizontalDriftValues));
    if (id === "P1" || id === "P5c" || id === "P7" || id === "P13a" || id === "P13b" || id === "P15a" || id === "P15b" || id === "P15c" || id === "P16a" || id === "P16b") {
      for (const field of ["scenarioRevision", "completionBoundary"]) {
        const values = entries.map((entry) => entry[field]);
        if (new Set(values.map((value) => JSON.stringify(value))).size !== 1) {
          throw new Error(`${id} changed ${field} across repetitions`);
        }
        agg[field] = values[0];
      }
      if (id === "P13a") agg.detailDecoded = entries.every((entry) => entry.detailDecoded === true);
      if (id === "P15b") {
        agg.traversals = entries[0].traversals;
        agg.committedSteps = entries[0].committedSteps;
        if (agg.committedSteps !== agg.traversals) {
          throw new Error(`${id} committed ${agg.committedSteps}/${agg.traversals} fullscreen traversal steps`);
        }
      }
      if (id === "P16a" || id === "P16b") {
        agg.widthDeltaPx = Math.round(median(entries.map((entry) => entry.widthDeltaPx)));
      }
      if (id === "P5c") {
        agg.resultsWidthDeltaPx = Math.round(median(entries.map((entry) => entry.resultsWidthDeltaPx)));
      }
      if (id === "P7") {
        for (const field of ["dragSteps", "stepIntervalMs", "releaseExcluded"]) {
          const values = entries.map((entry) => entry[field]);
          if (new Set(values.map((value) => JSON.stringify(value))).size !== 1) {
            throw new Error(`${id} changed ${field} across repetitions`);
          }
          agg[field] = values[0];
        }
      }
      if (id === "P1") {
        for (const field of ["probeStart", "responseEndMs", "domContentLoadedMs", "loadEventMs", "firstPaintMs", "firstContentfulPaintMs"]) {
          const values = entries.map((entry) => entry[field]);
          if (values.some((value) => value == null)) {
            throw new Error(`${id} missing ${field}`);
          }
          agg[field] = typeof values[0] === "number"
            ? Math.round(median(values))
            : values[0];
        }
      }
    }
    // Traversal image-render fields (P14a–d) — only aggregate when present.
    const landingRenderValues = entries.map((e) => e.landingRenderMs).filter((v) => v != null);
    if (landingRenderValues.length > 0) agg.landingRenderMs = Math.round(median(landingRenderValues));
    const landingNetworkValues = entries.map((e) => e.landingNetworkMs).filter((v) => v != null);
    if (landingNetworkValues.length > 0) agg.landingNetworkMs = Math.round(median(landingNetworkValues));
    const renderedCountValues = entries.map((e) => e.renderedCount).filter((v) => v != null);
    if (renderedCountValues.length > 0) agg.renderedCount = Math.round(median(renderedCountValues));
    const renderedTotalValues = entries.map((e) => e.renderedTotal).filter((v) => v != null);
    if (renderedTotalValues.length > 0) agg.renderedTotal = Math.round(median(renderedTotalValues));
    const swappedValues = entries.map((e) => e.swappedNotRendered).filter((v) => v != null);
    if (swappedValues.length > 0) agg.swappedNotRendered = Math.round(median(swappedValues));
    const landingAlreadyValues = entries.map((e) => e.landingAlreadyRendered).filter((v) => v != null);
    if (landingAlreadyValues.length > 0) agg.landingAlreadyRendered = landingAlreadyValues.filter(Boolean).length >= landingAlreadyValues.length / 2;
    const landingCacheValues = entries.map((e) => e.landingCacheHit).filter((v) => v != null);
    if (landingCacheValues.length > 0) agg.landingCacheHit = landingCacheValues.filter(Boolean).length >= landingCacheValues.length / 2;
    const p14Entries = entries.filter((entry) => entry.scenarioRevision === 2 && entry.id?.startsWith("P14"));
    if (p14Entries.length > 0) {
      for (const field of ["scenarioRevision", "cacheClass", "startRank", "committedSteps", "traversals", "cadenceMs", "speed", "direction"]) {
        const values = p14Entries.map((entry) => entry[field]);
        if (new Set(values.map((value) => JSON.stringify(value))).size !== 1) {
          throw new Error(`${id} changed ${field} across repetitions`);
        }
        agg[field] = values[0];
      }
      if (agg.committedSteps !== agg.traversals) {
        throw new Error(`${id} committed ${agg.committedSteps}/${agg.traversals} traversal steps`);
      }
      agg.clsOccurrenceRate = p14Entries.filter((entry) => (entry.clsEvents?.length ?? 0) > 0).length / p14Entries.length;
      const clsEventValues = p14Entries
        .flatMap((entry) => entry.clsEvents ?? [])
        .map((event) => event.value);
      agg.clsConditionalMagnitude = clsEventValues.length > 0 ? median(clsEventValues) : null;
      agg.clsEvents = p14Entries.map((entry) => entry.clsEvents ?? []);
    }
    result[id] = agg;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Read/write audit log
// ---------------------------------------------------------------------------

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
const REGRESSION_MIN_ABSOLUTE_DELTA = {
  maxFrame: 16,
  severeRate: 5,
  p95Frame: 8,
};

function formatValue(key, value, metric) {
  const unit = METRIC_UNITS[key] ?? "";
  if (key === "severeRate" && !severeRateIsReportable(metric)) return "n/a (<30 frames)";
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

  const header = `| Test | Samples | ${METRIC_COLS.map((k) => METRIC_LABELS[k]).join(" | ")} |`;
  const sep = `|------|---|${METRIC_COLS.map(() => "---").join("|")}|`;
  const rows = ids.map((id) => {
    const m = entry.metrics[id];
    const cells = METRIC_COLS.map((k) => {
      const val = m[k] ?? (k === "severeRate" && m.frameCount > 0
        ? Math.round(m.severe / m.frameCount * 1000 * 10) / 10 : 0);
      return formatValue(k, val, m);
    });
    return `| ${id} | ${m.sampleCount} | ${cells.join(" | ")} |`;
  });

  const p14Rows = ids
    .filter((id) => entry.metrics[id].scenarioRevision === 2 && id.startsWith("P14"))
    .map((id) => {
      const metric = entry.metrics[id];
      const occurrence = `${Math.round((metric.clsOccurrenceRate ?? 0) * 100)}%`;
      const magnitude = metric.clsConditionalMagnitude == null
        ? "—"
        : metric.clsConditionalMagnitude.toFixed(4);
      return `| ${id} | ${metric.cadenceMs}ms ${metric.direction} | ${metric.cacheClass} | ${metric.renderedCount}/${metric.renderedTotal} | ${metric.landingRenderMs}ms | ${metric.landingNetworkMs}ms | ${occurrence} | ${magnitude} |`;
    });
  const p14Table = p14Rows.length > 0
    ? [
        "### P14 traversal interpretation",
        "",
        "| Test | Cadence | Cache class | Rendered | Landing | Network | CLS occurrence | Conditional CLS |",
        "|------|---|---|---|---|---|---|---|",
        ...p14Rows,
      ].join("\n")
    : null;

  return [[header, sep, ...rows].join("\n"), ...(p14Table ? ["", p14Table] : [])].join("\n");
}

function buildDiffTable(current, previous) {
  const ids = Object.keys(current.metrics).filter((id) => current.metrics[id].report !== false);
  if (ids.length === 0) return "";

  const header = `| Test | Samples | ${METRIC_COLS.map((k) => `${METRIC_LABELS[k]} (Δ)`).join(" | ")} |`;
  const sep = `|------|---|${METRIC_COLS.map(() => "---").join("|")}|`;
  const incomparable = [];
  const rows = ids.map((id) => {
    const cur = current.metrics[id];
    const prev = previous.metrics[id];
    const comparable = !cur.scenarioRevision || (prev && metricsAreComparable(cur, prev));
    if (prev && !comparable) incomparable.push(id);
    const cells = METRIC_COLS.map((k) => {
      // For severeRate: compute from severe/frameCount if not stored directly
      const curVal = cur[k] ?? (k === "severeRate" && cur.frameCount > 0
        ? Math.round(cur.severe / cur.frameCount * 1000 * 10) / 10 : 0);
      const val = formatValue(k, curVal, cur);
      if (k === "severeRate" && !severeRateIsReportable(cur)) return val;
      if (!prev) return val;
      if (k === "severeRate" && !severeRateIsReportable(prev)) return `${val} (not comparable)`;
      if (!comparable) return `${val} (not comparable)`;
      const prevVal = prev[k] ?? (k === "severeRate" && prev.frameCount > 0
        ? Math.round(prev.severe / prev.frameCount * 1000 * 10) / 10 : 0);
      const delta = k === "cls"
        ? parseFloat((curVal - prevVal).toFixed(4))
        : k === "severeRate"
          ? Math.round((curVal - prevVal) * 10) / 10
          : Math.round(curVal - prevVal);
      return `${val} ${formatDelta(k, delta)}`;
    });
    return `| ${id} | ${cur.sampleCount} | ${cells.join(" | ")} |`;
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
    if (cur.scenarioRevision && !metricsAreComparable(cur, prev)) continue;
    for (const k of ["maxFrame", "severeRate", "p95Frame"]) {
      if (k === "severeRate" && (!severeRateIsReportable(cur) || !severeRateIsReportable(prev))) continue;
      const curVal = cur[k] ?? (k === "severeRate" && cur.frameCount > 0
        ? Math.round(cur.severe / cur.frameCount * 1000 * 10) / 10 : 0);
      const prevVal = prev[k] ?? (k === "severeRate" && prev.frameCount > 0
        ? Math.round(prev.severe / prev.frameCount * 1000 * 10) / 10 : 0);
      const absoluteDelta = curVal - prevVal;
      if (
        prevVal > 0
        && absoluteDelta >= REGRESSION_MIN_ABSOLUTE_DELTA[k]
        && absoluteDelta / prevVal > 0.1
      ) {
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

  const comparisonNote = incomparable.length > 0
    ? `Not compared across scenario revision/cache changes: ${incomparable.join(", ")}.`
    : null;
  return [...[header, sep, ...rows], ...(comparisonNote ? ["", comparisonNote] : []), "", `Verdict: ${verdict}`].join("\n");
}

function buildAuditMarkdown(existing, entry, previousEntry) {
  const date = new Date(entry.timestamp).toISOString().split("T")[0];
  const dirty = entry.gitDirty ? " (dirty)" : "";
  const heading = `## ${entry.label} (${entry.gitSha}${dirty}, ${date})`;
  const meta = `Stable until: ${entry.stableUntil} | Runs: ${entry.runs}\n\n${formatEnvironment(entry.environment)}`;

  let section;
  if (!previousEntry) {
    section = [heading, "", meta, "", buildBaselineTable(entry)].join("\n");
  } else {
    section = [heading, "", meta, "", buildDiffTable(entry, previousEntry)].join("\n");
  }

  if (!existing) {
    existing = "# Perf Audit Log\n\nGenerated by `e2e-perf/run-audit.mjs`.\n";
  }
  return existing + "\n---\n\n" + section + "\n";
}

function rebuildAuditMarkdown(history) {
  return history.entries.reduce(
    (markdown, entry, index) => buildAuditMarkdown(
      markdown,
      entry,
      index > 0 ? history.entries[index - 1] : null,
    ),
    "",
  );
}

function pruneHistoricalAuditMetrics() {
  const current = readHistoryLog(AUDIT_JSON);
  const { history, removedMetricCount, removedCampaignCount } = pruneAuditHistory(current);
  if (removedMetricCount === 0 && removedCampaignCount === 0) {
    console.log("No retired or legacy replaced audit metrics found.");
    return;
  }
  commitFileTransaction([
    { file: AUDIT_JSON, contents: JSON.stringify(history, null, 2) + "\n" },
    {
      file: AUDIT_JSON.replace(/\.json$/, ".js"),
      contents: `window.__AUDIT_LOG__ = ${JSON.stringify(history)};\n`,
    },
    { file: AUDIT_MD, contents: rebuildAuditMarkdown(history) },
  ]);
  console.log(`Pruned ${removedMetricCount} retired or legacy replaced audit metrics and ${removedCampaignCount} empty campaigns; ${history.entries.length} campaigns remain.`);
}

function rebuildHistoricalAuditFiles() {
  const history = readHistoryLog(AUDIT_JSON);
  commitFileTransaction([
    {
      file: AUDIT_JSON.replace(/\.json$/, ".js"),
      contents: `window.__AUDIT_LOG__ = ${JSON.stringify(history)};\n`,
    },
    { file: AUDIT_MD, contents: rebuildAuditMarkdown(history) },
  ]);
  console.log(`Rebuilt audit JS and Markdown from ${history.entries.length} canonical JSON campaigns.`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (pruneHistory) {
    pruneHistoricalAuditMetrics();
    return;
  }
  if (rebuildHistory) {
    rebuildHistoricalAuditFiles();
    return;
  }
  const git = getGitInfo();
  console.log(`  Durable run report: ${LATEST_RUN_REPORT}`);
  const historyWrites = createDeferredWrites();
  const historyState = { files: new Map() };

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
  if (useMediaApi) console.log(`  Mode:         --use-media-api (searchAfter via local media-api)`);
  console.log(`  Suites:       jank=${runJank} short=${runShort} long=${runLong}`);
  console.log();

  // Pre-flight checks: auth file (--use-media-api) and STABLE_UNTIL guard.
  enforceClusterGate();

  // RTT probe: 5 pings to ES before any suite to establish network baseline.
  const baselineRttMs = await probeRtt();
  console.log(`  Baseline RTT: ${baselineRttMs}ms (median of 5 pings to ${ES_DIRECT_URL}/_cat/aliases)`);
  console.log();

  const allRunMetrics = [];
  const expectedJankIds = expectedJankMetricIds(grepArg);
  let jankEnvironment = null;

  if (runJank) for (let run = 1; run <= runs; run++) {
    if (runs > 1) {
      console.log(`\n${"─".repeat(60)}`);
      console.log(`  Run ${run} of ${runs}`);
      console.log(`${"─".repeat(60)}`);
    }

    clearMetricsFile();
    clearEnvironmentFile();
    const exitCode = await runPlaywright(grepArg);
    const runEnvironment = readEnvironment(exitCode, "jank", git);
    jankEnvironment = jankEnvironment
      ? assertSameEnvironment(jankEnvironment, runEnvironment, `jank run ${run}`)
      : runEnvironment;
    const metrics = readMetrics(exitCode);
    assertCompleteMetricIds(metrics, expectedJankIds, `jank run ${run}`);
    allRunMetrics.push(metrics);

    if (runs > 1) {
      console.log(`  Run ${run}: captured ${metrics.length} metric entries`);
    }
  }

  if (runJank) {
  const aggregated = aggregateMetrics(allRunMetrics);
  const reportableCount = Object.values(aggregated).filter((m) => m.report !== false).length;
  console.log(`\n  Captured metrics: ${Object.keys(aggregated).length} total, ${reportableCount} reportable`);
  console.log(`  ${formatEnvironment(jankEnvironment)}`);

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
    baseline_rtt_ms: baselineRttMs,
    environment: jankEnvironment,
    metrics: aggregated,
  };

  // Read existing log
  const dryRunLog = dryRun ? readHistoryLog(AUDIT_JSON) : null;
  const previousEntry = dryRunLog && dryRunLog.entries.length > 0
    ? dryRunLog.entries[dryRunLog.entries.length - 1]
    : null;

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
    historyWrites.defer(() => {
      const auditLog = readHistoryLog(AUDIT_JSON);
      const auditPrevious = auditLog.entries.length > 0
        ? auditLog.entries[auditLog.entries.length - 1]
        : null;
      const existingMarkdown = existsSync(AUDIT_MD) ? readFileSync(AUDIT_MD, "utf8") : "";
      auditLog.entries.push(entry);
      historyState.files.set(AUDIT_JSON, JSON.stringify(auditLog, null, 2) + "\n");
      historyState.files.set(
        AUDIT_JSON.replace(/\.json$/, ".js"),
        `window.__AUDIT_LOG__ = ${JSON.stringify(auditLog)};\n`,
      );
      historyState.files.set(AUDIT_MD, buildAuditMarkdown(existingMarkdown, entry, auditPrevious));
    });
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
  const p14Ids = ids.filter(
    (id) => aggregated[id].scenarioRevision === 2 && id.startsWith("P14"),
  );
  if (p14Ids.length > 0) {
    console.log("\n  P14 traversal interpretation:");
    for (const id of p14Ids) {
      const metric = aggregated[id];
      const occurrence = Math.round((metric.clsOccurrenceRate ?? 0) * 100);
      const magnitude = metric.clsConditionalMagnitude == null
        ? "—"
        : metric.clsConditionalMagnitude.toFixed(4);
      console.log(`  ${id}: ${metric.cadenceMs}ms ${metric.direction}, rendered ${metric.renderedCount}/${metric.renderedTotal}, landing ${metric.landingRenderMs}ms (network ${metric.landingNetworkMs}ms), CLS ${occurrence}% / ${magnitude} conditional`);
    }
  }
  console.log();
  } // end if (runJank)

  // ---------------------------------------------------------------------------
  // Perceived suites (short + long)
  // ---------------------------------------------------------------------------

  if (runShort) await runPerceivedKind("short", git, baselineRttMs, historyWrites, historyState);
  if (runLong)  await runPerceivedKind("long", git, baselineRttMs, historyWrites, historyState);

  historyWrites.commit();
  if (!dryRun && historyState.files.size > 0) {
    commitFileTransaction(
      [...historyState.files].map(([file, contents]) => ({ file, contents })),
    );
    for (const file of historyState.files.keys()) console.log(`  Written: ${file}`);
  }
}

main().catch((err) => {
  appendRunReport(`\n${err?.stack ?? err}\n`);
  console.error(err);
  process.exit(1);
});

