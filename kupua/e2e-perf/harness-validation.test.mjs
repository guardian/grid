import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

import {
  assertBalancedLongRuns,
  assertCompleteMetricIds,
  assertEnvironmentMatches,
  assertSameEnvironment,
  assertPlaywrightSucceeded,
  aggregateScenarioFields,
  aggregateSettledTotal,
  createDeferredWrites,
  expectedJankMetricIds,
  expectedPerceivedMetricIds,
  parseJsonLines,
  parseSuccessfulRun,
  JANK_SCENARIO_AGGREGATION,
  PERCEIVED_METRIC_IDS,
  requireSingleEnvironment,
} from "./harness-validation.mjs";
import {
  commitFileTransaction,
  parseHistoryLog,
  pruneAuditHistory,
} from "./history-files.mjs";
import { computeCorrelatedMetrics } from "./perceived-metrics.mjs";
import TeardownReporter from "./teardown-reporter.mjs";

test("perf campaigns and direct configs retain teardown diagnostics", () => {
  const runner = readFileSync(join(import.meta.dirname, "run-audit.mjs"), "utf8");
  const overrides = [...runner.matchAll(/"--reporter=([^"]+)"/g)];
  assert.equal(overrides.length, 2);
  for (const [, reporters] of overrides) {
    assert.ok(reporters.split(",").includes("./e2e-perf/teardown-reporter.mjs"));
  }
  for (const config of ["playwright.perf.config.ts", "playwright.perceived-short.config.ts", "playwright.perceived-long.config.ts"]) {
    const source = readFileSync(join(import.meta.dirname, config), "utf8");
    assert.ok(source.includes('["./teardown-reporter.mjs"]'), config);
  }
  const { scripts } = JSON.parse(readFileSync(join(import.meta.dirname, "..", "package.json"), "utf8"));
  for (const [name, command] of Object.entries(scripts)) {
    if (name.startsWith("test:perf:")) assert.doesNotMatch(command, /--reporter=list(?:\s|$)/, name);
  }
});

test("teardown diagnostics report cleanup stages but ignore setup and measured actions", () => {
  const lines = [];
  const reporter = new TeardownReporter({ write: (line) => lines.push(line) });
  const scenario = { title: "P1: initial load" };
  const result = Object.freeze({ status: "passed" });
  const cleanup = { category: "hook", title: "After Hooks", duration: 75 };
  const setup = { category: "hook", title: "Before Hooks" };
  const contextSetup = { category: "fixture", title: 'Fixture "context"', parent: setup };
  reporter.onStepBegin(scenario, result, contextSetup);
  reporter.onStepEnd(scenario, result, contextSetup);
  reporter.onStepBegin(scenario, result, { category: "test.step", title: "Stop perf probes" });
  assert.deepEqual(lines, []);

  reporter.onStepBegin(scenario, result, cleanup);
  for (const [category, title, duration] of [
    ["test.step", "Stop perf probes", 5],
    ["fixture", 'Fixture "perfEnvironment"', 24],
    ["fixture", 'Fixture "context"', 46],
  ]) {
    const step = { category, title, duration, parent: cleanup };
    reporter.onStepBegin(scenario, result, step);
    reporter.onStepEnd(scenario, result, step);
  }
  reporter.onStepEnd(scenario, result, cleanup);
  assert.deepEqual(lines, [
    "[perf cleanup] P1 | Cleanup: started",
    "[perf cleanup] P1 | Stopping probes: started",
    "[perf cleanup] P1 | Stopping probes: completed in 5ms",
    "[perf cleanup] P1 | Capturing environment: started",
    "[perf cleanup] P1 | Capturing environment: completed in 24ms",
    "[perf cleanup] P1 | Closing browser context: started",
    "[perf cleanup] P1 | Closing browser context: completed in 46ms",
    "[perf cleanup] P1 | Cleanup: completed in 75ms",
  ]);
});

test("teardown diagnostics preserve failures without printing private details", () => {
  const lines = [];
  const reporter = new TeardownReporter({ write: (line) => lines.push(line) });
  const scenario = { title: "PP1: private-test-detail" };
  const result = Object.freeze({ status: "failed" });
  const step = Object.freeze({
    category: "fixture",
    title: 'Fixture "perfEnvironment"',
    parent: { category: "hook", title: "After Hooks" },
    duration: 10.6,
    error: { message: "private-test-detail", stack: "private-test-detail" },
  });
  reporter.onStepBegin(scenario, result, step);
  reporter.onStepEnd(scenario, result, step);
  reporter.onStepEnd(scenario, result, step);
  assert.deepEqual(lines, [
    "[perf cleanup] PP1 | Capturing environment: started",
    "[perf cleanup] PP1 | Capturing environment: failed in 11ms",
  ]);
  assert.equal(result.status, "failed");
});

test("unfinished cleanup has a start record without a false completion", () => {
  const lines = [];
  const reporter = new TeardownReporter({ write: (line) => lines.push(line) });
  reporter.onStepBegin({ title: "P1: initial load" }, {}, {
    category: "fixture",
    title: 'Fixture "context"',
    parent: { category: "hook", title: "After Hooks" },
  });
  assert.deepEqual(lines, ["[perf cleanup] P1 | Closing browser context: started"]);
});

test("cleanup records stay scoped to their step and sanitize unknown scenario titles", () => {
  const lines = [];
  const reporter = new TeardownReporter({ write: (line) => lines.push(line) });
  const parent = { category: "hook", title: "After Hooks" };
  const first = { category: "fixture", title: 'Fixture "context"', parent, duration: 20 };
  const second = { ...first, duration: 40 };
  const scenario = { title: "private-test-detail" };
  reporter.onStepBegin(scenario, {}, first);
  reporter.onStepBegin({ title: "JA: journey" }, {}, second);
  reporter.onStepBegin(scenario, {}, { category: "pw:api", title: "private-test-detail", parent });
  reporter.onStepEnd(scenario, {}, second);
  reporter.onStepEnd(scenario, {}, first);
  assert.deepEqual(lines, [
    "[perf cleanup] perf | Closing browser context: started",
    "[perf cleanup] JA | Closing browser context: started",
    "[perf cleanup] JA | Closing browser context: completed in 40ms",
    "[perf cleanup] perf | Closing browser context: completed in 20ms",
  ]);
});

function createHomeVisualHarness({
  refreshRate = 120,
  readyAt = 1_500,
  stateOverrides = {},
  scrollTop = 0,
  scrubberPosition = "0",
  href = "http://localhost/search?nonFree=true",
  moving = false,
  visible = true,
} = {}) {
  const source = readFileSync(join(import.meta.dirname, "perceived-short.spec.ts"), "utf8");
  const helper = source.slice(
    source.indexOf("async function appendHomeVisualPhases("),
    source.indexOf("async function captureChipRemovalAnchor("),
  );
  const { outputText } = ts.transpileModule(helper, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  });
  let now = 0;
  const entries = [];
  const rect = { top: 0, left: 0, width: 600, height: 400, bottom: 400 };
  const item = {
    getBoundingClientRect: () => {
      const top = !visible ? 500 : moving ? Math.round(now * refreshRate / 1_000) % 2 * 4 : 0;
      return { ...rect, top, height: 100, bottom: top + 100 };
    },
  };
  const container = {
    scrollTop,
    getBoundingClientRect: () => rect,
    querySelector: () => item,
  };
  const appendHomeVisualPhases = runInNewContext(`${outputText}\nappendHomeVisualPhases`, {
    URL,
    location: { href },
    CSS: { escape: (value) => value },
    performance: { now: () => now },
    requestAnimationFrame: (callback) => {
      now += 1_000 / refreshRate;
      queueMicrotask(() => callback(now));
    },
    document: {
      querySelector: (selector) => selector.includes("slider")
        ? { getAttribute: () => scrubberPosition }
        : container,
    },
    window: {
      __perceivedTrace__: entries,
      __kupua_store__: {
        getState: () => ({
          params: { nonFree: "true" },
          loading: now < readyAt,
          results: [{ id: "home-first-result" }],
          bufferOffset: 0,
          total: 70_000,
          ...stateOverrides,
        }),
      },
    },
  });

  return {
    wait: () => appendHomeVisualPhases({ page: { evaluate: (callback, value) => callback(value) } }, "home-test"),
    entries,
    elapsed: () => now,
  };
}

for (const refreshRate of [30, 120]) {
  test(`PP1 waits for delayed Home data at ${refreshRate} Hz`, async () => {
    const harness = createHomeVisualHarness({ refreshRate });
    const result = await harness.wait();

    assert.equal(result.settledTotal, 70_000);
    assert.equal(result.resultRegime, "seek");
    assert.deepEqual(harness.entries.map((entry) => entry.phase), ["t_first_visible_frame", "t_visual_settled"]);
    assert.ok(harness.entries[0].t >= 1_500);
    assert.ok(harness.entries[1].t > harness.entries[0].t);
    assert.ok(harness.entries.every((entry) => entry.interactionId === "home-test"));
  });
}

for (const [label, options, diagnostic] of [
  ["unfinished loading", { readyAt: Infinity }, /"loading":true/],
  ["wrong buffer offset", { stateOverrides: { bufferOffset: 1 } }, /"bufferOffset":1/],
  ["nonzero scroll", { scrollTop: 10 }, /"scrollTop":10/],
  ["nonzero scrubber", { scrubberPosition: "1" }, /"scrubberPosition":1/],
  ["pinned URL", { href: "http://localhost/search?nonFree=true&until=2026-02-15" }, /"homeUrl":false/],
  ["filtered store", { stateOverrides: { params: { nonFree: "true", query: "city:Example" } } }, /"homeStore":false/],
  ["invisible first result", { visible: false }, /"firstResultVisible":false/],
  ["moving geometry", { moving: true }, /"firstResultVisible":true/],
]) {
  test(`PP1 still rejects ${label} at its elapsed-time deadline`, async () => {
    const harness = createHomeVisualHarness(options);

    await assert.rejects(harness.wait(), (error) => {
      assert.match(error.message, /within 30000ms/);
      assert.match(error.message, diagnostic);
      return true;
    });
    assert.deepEqual(harness.entries, []);
    assert.ok(harness.elapsed() >= 30_000 && harness.elapsed() < 30_010);
  });
}

test("dashboards compare checked data modes as separate series", () => {
  for (const filename of ["audit-graphs.html", "perceived-graphs.html"]) {
    const source = readFileSync(join(import.meta.dirname, "results", filename), "utf8");

    assert.match(source, /"direct-es": \{ label: "direct ES", color: "#58a6ff"/);
    assert.match(source, /"media-api": \{ label: "media-api", color: "#f2a65a"/);
    assert.match(source, /entryMode\(entry\) === mode/);
    assert.match(source, /comparable within each mode/);
  }
});

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

test("P18 route ownership includes only the direct-ES selection metadata request", () => {
  const source = readFileSync(join(import.meta.dirname, "perf.spec.ts"), "utf8");
  assert.match(source, /const isP18SelectionMetadataPath = \(path: string\) =>/);
  assert.match(source, /path\.startsWith\("\/es\/"\) && path\.endsWith\("\/_mget"\)/);
  assert.match(source, /captureSuccessfulDataRoutes\(\s*kupua,\s*isP18SelectionMetadataPath/);
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

test("allows bounded live-corpus total drift only in the seek regime", () => {
  assert.deepEqual(
    aggregateSettledTotal([
      { settledTotal: 1_226_746, resultRegime: "seek" },
      { settledTotal: 1_226_751, resultRegime: "seek" },
    ], "JA3"),
    { settledTotalMin: 1_226_746, settledTotalMax: 1_226_751 },
  );
  assert.deepEqual(
    aggregateSettledTotal([
      { settledTotal: 531, resultRegime: "buffer" },
      { settledTotal: 531, resultRegime: "buffer" },
    ], "JA1"),
    { settledTotal: 531 },
  );
  assert.throws(
    () => aggregateSettledTotal([
      { settledTotal: 2_928, resultRegime: "indexed" },
      { settledTotal: 2_929, resultRegime: "indexed" },
    ], "JB3"),
    /JB3 changed settledTotal.*2,?928.*2,?929/,
  );
  assert.throws(
    () => aggregateSettledTotal([
      { settledTotal: 1_000_000, resultRegime: "seek" },
      { settledTotal: 999_000, resultRegime: "seek" },
    ], "JA3"),
    /JA3 seek settledTotal drift 1000 exceeds 100/,
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

test("manifests account for all 55 maintained unique metric IDs", () => {
  const jankIds = expectedJankMetricIds("");

  assert.equal(jankIds.length, 32);
  assert.equal(new Set(jankIds).size, 32);
  assert.equal(PERCEIVED_METRIC_IDS.short.length, 15);
  assert.equal(new Set(PERCEIVED_METRIC_IDS.short).size, 15);
  assert.equal(PERCEIVED_METRIC_IDS.long.length, 8);
  assert.equal(new Set(PERCEIVED_METRIC_IDS.long).size, 8);
});

test("preserves P17/P18 scenario contracts and numeric diagnostics across repetitions", () => {
  const p17Entries = [
    {
      scenarioRevision: 4,
      completionBoundary: "prepend-cascade-quiescent",
      routes: ["direct-es"],
      maxInputEvents: 20,
      inputEvents: 12,
      stepIntervalMs: 100,
      settleQuietMs: 200,
      prependGenerationDelta: 2,
      bufferOffsetDelta: -200,
      directionViolations: 0,
    },
    {
      scenarioRevision: 4,
      completionBoundary: "prepend-cascade-quiescent",
      routes: ["direct-es"],
      maxInputEvents: 20,
      inputEvents: 14,
      stepIntervalMs: 100,
      settleQuietMs: 200,
      prependGenerationDelta: 2,
      bufferOffsetDelta: -202,
      directionViolations: 0,
    },
  ];
  assert.deepEqual(
    aggregateScenarioFields(p17Entries, "P17", JANK_SCENARIO_AGGREGATION.P17),
    {
      scenarioRevision: 4,
      completionBoundary: "prepend-cascade-quiescent",
      routes: ["direct-es"],
      maxInputEvents: 20,
      inputEvents: 13,
      stepIntervalMs: 100,
      settleQuietMs: 200,
      prependGenerationDelta: 2,
      bufferOffsetDelta: -201,
      directionViolations: 0,
    },
  );

  const p18Entries = [
    {
      scenarioRevision: 1,
      completionBoundary: "settled",
      cacheClass: "cold-except-anchor",
      routes: ["direct-es"],
      targetIndex: 99,
      selectedAdded: 99,
      metadataCacheWarmBefore: 1,
      selectedCount: 100,
      metadataCacheWarmAfter: 100,
      rangeWalked: false,
      idleCallbackCount: 1,
      selectionPublishMs: 18,
      metadataSettleMs: 170,
      reconcileSettleMs: 180,
      selectionVisualSettledMs: 300,
      idleCallbackMaxMs: 2,
    },
    {
      scenarioRevision: 1,
      completionBoundary: "settled",
      cacheClass: "cold-except-anchor",
      routes: ["direct-es"],
      targetIndex: 99,
      selectedAdded: 99,
      metadataCacheWarmBefore: 1,
      selectedCount: 100,
      metadataCacheWarmAfter: 100,
      rangeWalked: false,
      idleCallbackCount: 1,
      selectionPublishMs: 22,
      metadataSettleMs: 190,
      reconcileSettleMs: 200,
      selectionVisualSettledMs: 340,
      idleCallbackMaxMs: 4,
    },
  ];

  assert.deepEqual(
    aggregateScenarioFields(p18Entries, "P18", JANK_SCENARIO_AGGREGATION.P18),
    {
      scenarioRevision: 1,
      completionBoundary: "settled",
      cacheClass: "cold-except-anchor",
      routes: ["direct-es"],
      targetIndex: 99,
      selectedAdded: 99,
      metadataCacheWarmBefore: 1,
      selectedCount: 100,
      metadataCacheWarmAfter: 100,
      rangeWalked: false,
      idleCallbackCount: 1,
      selectionPublishMs: 20,
      metadataSettleMs: 180,
      reconcileSettleMs: 190,
      selectionVisualSettledMs: 320,
      idleCallbackMaxMs: 3,
    },
  );

  assert.throws(
    () => aggregateScenarioFields(
      [{ ...p18Entries[0] }, { ...p18Entries[1], targetIndex: 98 }],
      "P18",
      JANK_SCENARIO_AGGREGATION.P18,
    ),
    /P18 changed targetIndex across repetitions/,
  );
});

test("derives perceived metric IDs from the requested filter", () => {
  assert.deepEqual(expectedPerceivedMetricIds("short", "PP1"), ["PP1"]);
  assert.deepEqual(expectedPerceivedMetricIds("short", "PP1|PP1[01]"), ["PP1", "PP10", "PP11"]);
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