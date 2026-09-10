import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  assertBalancedLongRuns,
  assertCompleteMetricIds,
  assertEnvironmentMatches,
  assertSameEnvironment,
  assertPlaywrightSucceeded,
  createDeferredWrites,
  expectedJankMetricIds,
  expectedPerceivedMetricIds,
  parseJsonLines,
  parseSuccessfulRun,
  PERCEIVED_METRIC_IDS,
  requireSingleEnvironment,
} from "./harness-validation.mjs";
import {
  commitFileTransaction,
  parseHistoryLog,
  pruneAuditHistory,
} from "./history-files.mjs";
import { computeCorrelatedMetrics } from "./perceived-metrics.mjs";

test("rejects a nonzero Playwright exit", () => {
  assert.throws(
    () => assertPlaywrightSucceeded(1, "perceived (short)"),
    /perceived \(short\).*code 1/i,
  );
});

test("rejects unbalanced long audits before suite execution", () => {
  assert.throws(
    () => assertBalancedLongRuns({ runLong: true, runs: 3, dryRun: false }),
    /even --runs count.*JB2 AB\/BA/i,
  );
  assert.doesNotThrow(() => assertBalancedLongRuns({ runLong: true, runs: 4, dryRun: false }));
  assert.doesNotThrow(() => assertBalancedLongRuns({ runLong: false, runs: 3, dryRun: false }));
  assert.doesNotThrow(() => assertBalancedLongRuns({ runLong: true, runs: 1, dryRun: true }));
});

test("rejects a malformed nonblank JSONL row with source and line", () => {
  const sourcePath = "/tmp/perceived-short.jsonl";
  const contents = [
    '{"id":"PP1"}',
    "  ",
    '{"id":',
  ].join("\n");

  assert.throws(
    () => parseJsonLines(contents, sourcePath),
    (error) => {
      assert.match(error.message, /perceived-short\.jsonl/);
      assert.match(error.message, /line 3/i);
      return true;
    },
  );
});

test("parses valid rows and ignores blank rows", () => {
  const contents = ['{"id":"P1"}', "", '  {"id":"P2"}  '].join("\n");

  assert.deepEqual(parseJsonLines(contents, "/tmp/metrics.jsonl"), [
    { id: "P1" },
    { id: "P2" },
  ]);
});

test("checks process success before parsing emitted metrics", () => {
  assert.throws(
    () => parseSuccessfulRun({
      exitCode: 2,
      suiteLabel: "jank",
      contents: '{"id":',
      sourcePath: "/tmp/metrics.jsonl",
    }),
    /jank.*code 2/i,
  );
});

test("does not run deferred history writes before commit", () => {
  const historyWrites = createDeferredWrites();
  let wroteHistory = false;
  historyWrites.defer(() => { wroteHistory = true; });

  assert.throws(
    () => parseSuccessfulRun({
      exitCode: 1,
      suiteLabel: "perceived (long)",
      contents: "",
      sourcePath: "/tmp/perceived-long.jsonl",
    }),
  );
  assert.equal(wroteHistory, false);

  historyWrites.commit();
  assert.equal(wroteHistory, true);
});

test("rejects missing expected metric IDs", () => {
  assert.throws(
    () => assertCompleteMetricIds(
      [{ id: "PP1" }],
      ["PP1", "PP2"],
      "perceived (short) run 2",
    ),
    /perceived \(short\) run 2.*missing.*PP2/i,
  );
});

test("rejects duplicate metric IDs", () => {
  assert.throws(
    () => assertCompleteMetricIds(
      [{ id: "P8" }, { id: "P8" }],
      ["P8"],
      "jank run 1",
    ),
    /jank run 1.*duplicate.*P8/i,
  );
});

test("rejects unexpected metric IDs", () => {
  assert.throws(
    () => assertCompleteMetricIds(
      [{ id: "JA1" }, { id: "JA2" }, { id: "JA4" }],
      ["JA1", "JA2", "JA3"],
      "perceived (long) run 1",
    ),
    /perceived \(long\) run 1.*missing.*JA3.*unexpected.*JA4/i,
  );
});

test("accepts exactly one row for every expected metric ID", () => {
  const metrics = [{ id: "JB2" }, { id: "JB1" }];

  assert.equal(
    assertCompleteMetricIds(metrics, ["JB1", "JB2"], "perceived (long) run 3"),
    metrics,
  );
});

test("derives compound jank metric IDs from the existing title filter", () => {
  assert.deepEqual(expectedJankMetricIds("P5|P13"), [
    "P5a", "P5b", "P5c", "P13a", "P13b",
  ]);
});

test("selects one isolated P14 cadence by title", () => {
  assert.deepEqual(expectedJankMetricIds("P14b"), ["P14b"]);
});

test("manifests account for all 52 maintained unique metric IDs", () => {
  const jankIds = expectedJankMetricIds("");

  assert.equal(jankIds.length, 30);
  assert.equal(new Set(jankIds).size, 30);
  assert.equal(PERCEIVED_METRIC_IDS.short.length, 14);
  assert.equal(new Set(PERCEIVED_METRIC_IDS.short).size, 14);
  assert.equal(PERCEIVED_METRIC_IDS.long.length, 8);
  assert.equal(new Set(PERCEIVED_METRIC_IDS.long).size, 8);
});

test("derives perceived metric IDs from the requested filter", () => {
  assert.deepEqual(expectedPerceivedMetricIds("short", "PP1"), ["PP1"]);
  assert.deepEqual(expectedPerceivedMetricIds("short", "PP1|PP10"), ["PP1", "PP10"]);
  assert.deepEqual(expectedPerceivedMetricIds("long", "JB[34]"), ["JB3", "JB4"]);
});

test("rejects an app data mode that differs from the requested mode", () => {
  assert.throws(
    () => assertEnvironmentMatches(
      { dataMode: "media-api" },
      { dataMode: "direct-es" },
    ),
    /data mode.*requested direct-es.*observed media-api/i,
  );
});

test("rejects an environment change between repetitions", () => {
  const first = {
    dataMode: "direct-es",
    appBaseUrl: "http://localhost:3000",
    browserName: "chromium",
    browserVersion: "140.0.0.0",
    viewport: { width: 1987, height: 1110 },
    deviceScaleFactor: 2,
  };

  assert.throws(
    () => assertSameEnvironment(first, {
      ...first,
      deviceScaleFactor: 1.25,
    }, "jank run 2"),
    /jank run 2.*deviceScaleFactor/i,
  );
});

test("accepts an identical environment across repetitions", () => {
  const environment = {
    dataMode: "direct-es",
    appBaseUrl: "http://localhost:3000",
    browserName: "chromium",
    browserVersion: "140.0.0.0",
    viewport: { width: 1720, height: 960 },
    deviceScaleFactor: 2,
  };

  assert.equal(
    assertSameEnvironment(environment, structuredClone(environment), "short run 2"),
    environment,
  );
});

test("requires exactly one environment fingerprint per suite repetition", () => {
  assert.throws(
    () => requireSingleEnvironment([], "jank run 1"),
    /jank run 1.*0 environment fingerprints.*expected 1/i,
  );
  assert.throws(
    () => requireSingleEnvironment([{}, {}], "short run 1"),
    /short run 1.*2 environment fingerprints.*expected 1/i,
  );
});

test("rejects malformed existing history JSON with its source path", () => {
  assert.throws(
    () => parseHistoryLog('{"entries":', "/tmp/audit-log.json"),
    (error) => {
      assert.match(error.message, /malformed/i);
      assert.match(error.message, /audit-log\.json/);
      return true;
    },
  );
});

test("rejects existing history without an entries array", () => {
  assert.throws(
    () => parseHistoryLog('{"entries":{}}', "/tmp/perceived-log.json"),
    /perceived-log\.json.*entries.*array/i,
  );
});

test("prunes retired and legacy replaced jank metrics without dropping campaigns", () => {
  const history = {
    entries: [{
      label: "old",
      metrics: {
        P2: { maxFrame: 10 },
        P10: { maxFrame: 20 },
        "P12-scroll": { maxFrame: 30 },
        P1: { maxFrame: 40 },
      },
    }, {
      label: "new",
      metrics: {
        P1: { maxFrame: 50, scenarioRevision: 2 },
        P7: { maxFrame: 60, scenarioRevision: 2 },
      },
    }, {
      label: "retired-only",
      metrics: {
        P10: { maxFrame: 70 },
      },
    }],
  };

  const result = pruneAuditHistory(history);

  assert.equal(result.removedMetricCount, 4);
  assert.equal(result.removedCampaignCount, 1);
  assert.deepEqual(result.history.entries.map((entry) => entry.label), ["old", "new"]);
  assert.deepEqual(Object.keys(result.history.entries[0].metrics), ["P2"]);
  assert.deepEqual(Object.keys(result.history.entries[1].metrics), ["P1", "P7"]);
  assert.equal(result.history.entries[1].metrics.P1.scenarioRevision, 2);
});

test("commits every sibling history file together", () => {
  const directory = mkdtempSync(join(tmpdir(), "kupua-history-"));
  try {
    const files = ["log.json", "log.js", "log.md"].map((name) => join(directory, name));
    files.forEach((file, index) => writeFileSync(file, `old-${index}`));

    commitFileTransaction(files.map((file, index) => ({ file, contents: `new-${index}` })));

    assert.deepEqual(files.map((file) => readFileSync(file, "utf8")), [
      "new-0", "new-1", "new-2",
    ]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("restores every sibling when a history commit fails", () => {
  const directory = mkdtempSync(join(tmpdir(), "kupua-history-"));
  try {
    const first = join(directory, "log.json");
    const second = join(directory, "log.js");
    writeFileSync(first, "old-json");
    writeFileSync(second, "old-js");

    assert.throws(
      () => commitFileTransaction([
        { file: first, contents: "new-json" },
        { file: second, contents: "new-js" },
      ], { failAfterRename: 1 }),
      /simulated history commit failure/i,
    );
    assert.equal(readFileSync(first, "utf8"), "old-json");
    assert.equal(readFileSync(second, "utf8"), "old-js");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("leaves existing siblings untouched when staging fails", () => {
  const directory = mkdtempSync(join(tmpdir(), "kupua-history-"));
  try {
    const existing = join(directory, "log.json");
    writeFileSync(existing, "old-json");

    assert.throws(
      () => commitFileTransaction([
        { file: existing, contents: "new-json" },
        { file: join(directory, "missing", "log.js"), contents: "new-js" },
      ]),
    );
    assert.equal(readFileSync(existing, "utf8"), "old-json");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("removes newly created siblings when a history commit rolls back", () => {
  const directory = mkdtempSync(join(tmpdir(), "kupua-history-"));
  try {
    const existing = join(directory, "log.json");
    const created = join(directory, "log.js");
    writeFileSync(existing, "old-json");

    assert.throws(
      () => commitFileTransaction([
        { file: existing, contents: "new-json" },
        { file: created, contents: "new-js" },
      ], { failAfterRename: 2 }),
      /simulated history commit failure/i,
    );
    assert.equal(readFileSync(existing, "utf8"), "old-json");
    assert.throws(() => readFileSync(created, "utf8"), /ENOENT/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("calculates phases only from one correlated interaction", () => {
  const metrics = computeCorrelatedMetrics({
    id: "PP4",
    label: "focused direction",
    action: "sort-around-focus",
    requiredPhases: ["t_ack", "t_store_ready", "t_first_visible_frame", "t_visual_settled"],
    entries: [
      { action: "sort-around-focus", phase: "t_0", t: 10, interactionId: "sort-1" },
      { action: "sort-around-focus", phase: "t_0", t: 11 },
      { action: "search", phase: "t_ack", t: 12, interactionId: "search-1" },
      { action: "sort-around-focus", phase: "t_ack", t: 15, interactionId: "sort-1" },
      { action: "sort-around-focus", phase: "t_status_visible", t: 18, interactionId: "sort-1" },
      { action: "sort-around-focus", phase: "t_store_ready", t: 30, interactionId: "sort-1" },
      { action: "sort-around-focus", phase: "t_first_visible_frame", t: 40, interactionId: "sort-1" },
      { action: "sort-around-focus", phase: "t_visual_settled", t: 50, interactionId: "sort-1" },
    ],
  });

  assert.equal(metrics.interactionId, "sort-1");
  assert.equal(metrics.dt_ack_ms, 5);
  assert.equal(metrics.dt_status_ms, 8);
  assert.equal(metrics.dt_store_ready_ms, 20);
  assert.equal(metrics.dt_first_visible_frame_ms, 30);
  assert.equal(metrics.dt_visual_settled_ms, 40);
  assert.equal("dt_first_pixel_ms" in metrics, false);
  assert.equal("dt_settled_ms" in metrics, false);
  assert.equal(metrics.status_total_ms, 32);
  assert.equal(metrics.raw.length, 8);
});

test("rejects duplicate or missing correlated phases", () => {
  const base = {
    id: "PP4",
    label: "focused direction",
    action: "sort-around-focus",
    requiredPhases: ["t_store_ready"],
  };

  assert.throws(
    () => computeCorrelatedMetrics({
      ...base,
      entries: [
        { action: "sort-around-focus", phase: "t_0", t: 10, interactionId: "sort-1" },
        { action: "sort-around-focus", phase: "t_store_ready", t: 20, interactionId: "sort-1" },
        { action: "sort-around-focus", phase: "t_store_ready", t: 21, interactionId: "sort-1" },
      ],
    }),
    /PP4.*duplicate.*t_store_ready/i,
  );
  assert.throws(
    () => computeCorrelatedMetrics({
      ...base,
      entries: [
        { action: "sort-around-focus", phase: "t_0", t: 10, interactionId: "sort-1" },
      ],
    }),
    /PP4.*missing.*t_store_ready/i,
  );
});

test("reports correlated native fullscreen exit timing", () => {
  const metrics = computeCorrelatedMetrics({
    id: "JB5",
    label: "fullscreen exit",
    action: "fullscreen-exit",
    requiredPhases: ["t_native_exit"],
    entries: [
      { action: "fullscreen-exit", phase: "t_0", t: 100, interactionId: "exit-1" },
      { action: "fullscreen-exit", phase: "t_native_exit", t: 145, interactionId: "exit-1" },
    ],
  });

  assert.equal(metrics.dt_native_exit_ms, 45);
});

test("calculates cross-document navigation phases from browser epoch timestamps", () => {
  const metrics = computeCorrelatedMetrics({
    id: "JA1",
    label: "cold buffer navigation",
    action: "navigation-search",
    requiredPhases: ["t_store_ready", "t_first_visible_frame", "t_visual_settled"],
    timeField: "epochMs",
    entries: [
      { action: "navigation-search", phase: "t_0", epochMs: 1_000, interactionId: "nav-1" },
      { action: "navigation-search", phase: "t_store_ready", epochMs: 1_400, interactionId: "nav-1" },
      { action: "navigation-search", phase: "t_first_visible_frame", epochMs: 1_500, interactionId: "nav-1" },
      { action: "navigation-search", phase: "t_visual_settled", epochMs: 1_520, interactionId: "nav-1" },
    ],
  });

  assert.equal(metrics.dt_store_ready_ms, 400);
  assert.equal(metrics.dt_first_visible_frame_ms, 500);
  assert.equal(metrics.dt_visual_settled_ms, 520);
});