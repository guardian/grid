import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { join } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

import {
  assertBalancedLongRuns,
  assertCompleteMetricIds,
  assertConsistentNames,
  assertEnvironmentMatches,
  assertFiniteFields,
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
  REQUIRED_JANK_NUMERIC_FIELDS,
  generatedHistoryExclusions,
  requireSingleEnvironment,
  requireConsistentPresence,
} from "../harness-validation.mjs";
import {
  appendCampaignManifest,
  buildCampaignManifest,
  commitFileTransaction,
  parseHistoryLog,
  pruneAuditHistory,
} from "../history-files.mjs";
import { computeCorrelatedMetrics, ownsDataRoute } from "../perceived-metrics.mjs";
import { createPrivatePp3Diagnostics, formatFocusedSortDegradation, partitionDegradedSamples, recordPrivatePp3Diagnostic, summarizeFocusedSortDegradation } from "../focused-sort-degradation.mjs";
import TeardownReporter from "../teardown-reporter.mjs";
import { parseDensitySuiteArgs, resolveSuiteSelection } from "../density-reporting.mjs";
import {
  classifyImageLookup,
  comparisonEvidenceClass,
  metricsAreComparable,
  severeRateIsReportable,
} from "../p14-metrics.mjs";

test("requested media delivery must match the app, including missing evidence", () => {
  const requested = { dataMode: "media-api", apiTopology: "deployed-test", mediaDelivery: "canonical" };
  for (const mediaDelivery of ["proxy", undefined]) {
    assert.throws(() => assertEnvironmentMatches({ ...requested, mediaDelivery }, requested), /media delivery mismatch/i);
  }
  assert.deepEqual(assertEnvironmentMatches(requested, requested), requested);
});

test("runner accepts canonical API modes, defaults to proxy and refuses canonical direct ES", () => {
  const source = readFileSync(new URL("../run-audit.mjs", import.meta.url), "utf8");
  const parser = source.slice(source.indexOf("let suiteArgs;"), source.indexOf("// Stable-until:"));
  const parse = args => runInNewContext(`${parser}\n({ mediaDelivery, apiTopology, useMediaApi })`, {
    process: { argv: ["node", "runner", ...args] }, parseDensitySuiteArgs, resolveSuiteSelection, assertBalancedLongRuns,
    failCli(message) { throw new Error(message); },
  });
  for (const flag of ["--use-media-api", "--use-deployed-media-api"]) {
    assert.equal(parse([flag]).mediaDelivery, "proxy");
    assert.equal(parse([flag, "--canonical-media"]).mediaDelivery, "canonical");
  }
  assert.equal(parse(["--use-deployed-media-api"]).apiTopology, "deployed-test");
  assert.equal(parse([]).mediaDelivery, "proxy");
  assert.throws(() => parse(["--canonical-media"]), /requires/);
  assert.throws(() => parse(["--use-media-api", "--use-deployed-media-api"]), /mutually exclusive/);
  assert.equal(source.match(/KUPUA_PERF_MEDIA_DELIVERY: mediaDelivery/g)?.length, 3);
});

test("perf fixture rejects delivery mismatch before workload and checks configuration stability", async () => {
  const source = readFileSync(new URL("../helpers.ts", import.meta.url), "utf8");
  const fixtureSource = source.slice(source.indexOf("export const test ="), source.indexOf("export function isMediaApiUrl"));
  const code = ts.transpileModule(fixtureSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  for (const deliveries of [["proxy", "proxy"], [undefined, undefined], ["canonical", "proxy"], ["canonical", "canonical"]]) {
    let executed = false, reads = 0;
    const writes = [];
    const context = { exports: {}, process: { env: { KUPUA_PERF_ENV_FILE: "fixture", KUPUA_PERF_MEDIA_DELIVERY: "canonical" } },
      sharedTest: { extend: fixtures => fixtures }, writeFileSync: (_file, value) => writes.push(JSON.parse(value)) };
    runInNewContext(code, context);
    const page = { request: { get: async () => {
      const mediaDelivery = deliveries[reads++];
      return { ok: () => true, json: async () => ({ dataMode: "media-api", apiTopology: "deployed-test", mediaDelivery }) };
    } }, context: () => ({ browser: () => ({ version: () => "fixture" }) }), evaluate: async () => ({ appBaseUrl: "https://fixture.invalid" }) };
    const run = () => context.exports.test.perfEnvironment[0]({ kupua: { page }, browserName: "chromium" }, async () => { executed = true; });
    if (deliveries[0] !== "canonical") {
      await assert.rejects(run, /media delivery mismatch/);
      assert.equal(executed, false);
    } else if (deliveries[1] !== "canonical") {
      await assert.rejects(run, /environment changed/);
      assert.equal(executed, true);
    } else {
      await run();
      assert.equal(writes[0].mediaDelivery, "canonical");
      assert.equal(writes[0].apiTopology, "deployed-test");
    }
  }
});

test("campaign configurations do not retain live failure artifacts", () => {
  for (const name of ["perf", "perceived-short", "perceived-long"]) {
    const source = readFileSync(new URL(`../playwright.${name}.config.ts`, import.meta.url), "utf8");
    assert.match(source, /PLAYWRIGHT_NO_COPY_PROMPT = "1"/);
    for (const artifact of ["trace", "screenshot", "video"]) assert.match(source, new RegExp(`${artifact}: "off"`));
  }
});

test("explicit campaign comparisons isolate treatments and reject unverified environments", () => {
  const context = {};
  runInNewContext(readFileSync(new URL("../results/campaign-comparison.js", import.meta.url), "utf8"), context);
  const comparison = context.KupuaPerfComparison;
  const before = { gitSha: "fixture", environment: {
    dataMode: "media-api", apiTopology: "deployed-test", mediaDelivery: "proxy", appBaseUrl: "https://fixture.invalid",
    browserName: "chromium", browserVersion: "1", os: { platform: "fixture" }, viewport: { width: 1720, height: 960 },
    screen: { width: 1720, height: 960 }, deviceScaleFactor: 2, headed: true, cpuThrottle: 0, cacheClass: "fixture",
    workers: 1, stableUntil: "2026-02-15", appSourceDirtyStateHash: "fixture",
  } };
  const after = { ...before, environment: { ...before.environment, mediaDelivery: "canonical" } };
  assert.notEqual(comparison.key(before), comparison.key(after));
  assert.notEqual(comparison.variant(before), comparison.variant(after));
  assert.equal(comparison.compare(after, before).compatible, true);
  assert.match(comparison.compare(after, before).reason, /Changed mediaDelivery; recorded source fingerprints match; identical source not verified \(untracked file contents not covered\)/);
  assert.match(comparison.label(after), /TEST API \/ canonical/);
  for (const overrides of [{ deviceScaleFactor: 1 }, { browserVersion: "2" }, { mediaDelivery: undefined }]) {
    assert.equal(comparison.compare({ ...after, environment: { ...after.environment, ...overrides } }, before).compatible, false);
  }
  assert.match(comparison.compare({ ...after, gitSha: "different" }, before).reason, /recorded source fingerprints differ \(untracked file contents not covered\)/);
  const missingSource = { ...after, environment: { ...after.environment, appSourceDirtyStateHash: undefined } };
  assert.equal(comparison.compare(missingSource, before).compatible, true);
  assert.match(comparison.compare(missingSource, before).reason, /recorded source fingerprints unavailable; identical source not verified \(untracked file contents not covered\)/);
  assert.equal(comparison.compare({ ...after, gitSha: "different" }, before).compatible, true);
  assert.equal(before.environment.mediaDelivery, "proxy");
});

const declarations = new Map();
const compiledFunctions = new Map();

function functionSource(filename, name) {
  if (!declarations.has(filename)) {
    let source = readFileSync(new URL(`../${filename}`, import.meta.url), "utf8");
    if (filename.endsWith(".html")) source = source.slice(source.indexOf("<script>") + "<script>".length, source.lastIndexOf("</script>"));
    const parsed = ts.createSourceFile(filename, source, ts.ScriptTarget.ES2022, true);
    declarations.set(filename, new Map(parsed.statements.filter(ts.isFunctionDeclaration)
      .map(node => [node.name?.text, node.getText(parsed)])));
  }
  const source = declarations.get(filename).get(name);
  assert.ok(source, `${filename}: missing actual function ${name}`);
  return source;
}

function compiledFunction(filename, name) {
  const key = `${filename}:${name}`;
  if (!compiledFunctions.has(key)) compiledFunctions.set(key, ts.transpileModule(functionSource(filename, name), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText);
  return compiledFunctions.get(key);
}

const dashboardFunction = (filename, name) => functionSource(`results/${filename}`, name);
const runnerFunction = name => functionSource("run-audit.mjs", name);

function metadataSearchObserverFixture(refreshRate, readyAt = 4_000, options = {}) {
  const source = compiledFunction("perceived-long.spec.ts", "appendMetadataSearchVisualPhases");
  let now = 0;
  let nextHandle = 0;
  const frames = new Set();
  const timers = new Map();
  const entries = [];
  const query = "field:fixture";
  const rect = () => ({ top: 0, left: options.moving || now < (options.movingUntil ?? 0) ? now : 0, width: 800, height: 600 });
  const item = { getBoundingClientRect: rect };
  const container = { getBoundingClientRect: rect, querySelector: () => options.missingItem ? null : item };
  const globals = {
    URL,
    performance: { now: () => now },
    location: { href: `https://fixture.invalid/search?query=${encodeURIComponent(options.wrongUrl ? "other-query" : query)}${options.imageRoute ? "&image=private-fixture-id" : ""}` },
    document: { querySelector: selector => {
      if (selector === '[data-detail-image-id]') return options.detailOpen ? {} : null;
      return selector === '[aria-label="Image results grid"]' && !options.missingContainer ? container : null;
    } },
    window: {
      __kupua_store__: { getState: () => ({ loading: now < readyAt,
        error: options.error ? new Error("private fixture failure") : null, total: 42 }) },
      __kupua_getSearchLifecycle__: () => ({ query: options.wrongLifecycleQuery ? "other-query" : query,
        started: 1, settled: !options.unsettledLifecycle && now >= readyAt ? 1 : 0 }),
      __perceivedTrace__: entries,
    },
    requestAnimationFrame: callback => {
      const handle = ++nextHandle;
      frames.add(handle);
      queueMicrotask(() => {
        if (!frames.delete(handle)) return;
        now += 1000 / refreshRate;
        for (const [timer, scheduled] of timers) {
          if (scheduled.at <= now) { timers.delete(timer); scheduled.callback(); }
        }
        callback(now);
      });
      return handle;
    },
    cancelAnimationFrame: handle => frames.delete(handle),
    setTimeout: (callback, delay) => {
      const handle = ++nextHandle;
      timers.set(handle, { at: now + delay, callback });
      return handle;
    },
    clearTimeout: handle => timers.delete(handle),
  };
  const observe = runInNewContext(`${source}\nappendMetadataSearchVisualPhases`, globals);
  return {
    entries, frames, timers,
    elapsed: () => now,
    run: () => observe({ page: { evaluate: (callback, args) => callback(args) } },
      "fixture-interaction", query, "search", "JB2-control"),
  };
}

for (const refreshRate of [60, 240]) {
  test(`long-journey search readiness budget is elapsed time at ${refreshRate} Hz`, async () => {
    const fixture = metadataSearchObserverFixture(refreshRate);
    const result = await fixture.run();
    assert.equal(result.settledTotal, 42);
    assert.equal(result.resultRegime, "buffer");
    assert.equal(fixture.entries.length, 2);
    assert.equal(fixture.entries[0].phase, "t_first_visible_frame");
    assert.equal(fixture.entries[1].phase, "t_visual_settled");
    assert.ok(fixture.entries[0].t >= 4_000);
    assert.ok(fixture.entries[1].t > fixture.entries[0].t);
    assert.equal(fixture.timers.size, 0);
  });
}

test("long-journey search observer adds no wait after two ready frames", async () => {
  const fixture = metadataSearchObserverFixture(120, 0);
  await fixture.run();
  assert.ok(fixture.elapsed() < 20);
  assert.equal(fixture.entries.length, 2);
});

test("long-journey search observer still waits for stable geometry", async () => {
  const fixture = metadataSearchObserverFixture(120, 0, { movingUntil: 7_000 });
  await fixture.run();
  assert.ok(fixture.entries[0].t >= 7_000);
  assert.ok(fixture.entries[1].t > fixture.entries[0].t);
});

for (const [condition, expectedFlag, expectedValue] of [
  ["wrongUrl", "urlQueryMatches", false],
  ["wrongLifecycleQuery", "lifecycleQueryMatches", false],
  ["unsettledLifecycle", "settled", 0],
  ["error", "error", true],
  ["imageRoute", "listRoute", false],
  ["detailOpen", "detailClosed", false],
  ["missingContainer", "containerPresent", false],
  ["missingItem", "itemPresent", false],
  ["moving", "geometryStable", false],
]) {
  test(`long-journey search observer rejects ${condition} with sanitized step diagnostics`, async () => {
    const fixture = metadataSearchObserverFixture(120, 0, { [condition]: true });
    await assert.rejects(fixture.run(), error => {
      assert.match(error.message, /^JB2-control exact search did not visibly settle within 30000ms:/);
      const diagnostics = JSON.parse(error.message.slice(error.message.indexOf("{")));
      assert.equal(diagnostics[expectedFlag], expectedValue);
      assert.ok(diagnostics.elapsedMs >= 30_000 && diagnostics.elapsedMs <= 30_010);
      assert.ok(diagnostics.sampledFrames > 3_000);
      assert.doesNotMatch(error.message, /field:fixture|other-query|private fixture failure|private-fixture-id|fixture\.invalid/);
      return true;
    });
    assert.equal(fixture.entries.length, 0);
    assert.equal(fixture.timers.size, 0);
  });
}

test("long-journey search observer rejects data arriving after its elapsed deadline", async () => {
  const fixture = metadataSearchObserverFixture(240, 31_000);
  await assert.rejects(fixture.run(), error => {
    const diagnostics = JSON.parse(error.message.slice(error.message.indexOf("{")));
    assert.equal(diagnostics.loading, true);
    assert.ok(diagnostics.elapsedMs >= 30_000 && diagnostics.elapsedMs <= 30_005);
    return true;
  });
  assert.equal(fixture.entries.length, 0);
});


function waitForFunctionDefects() {
  const files = [
    "perf.spec.ts", "perceived-short.spec.ts", "perceived-long.spec.ts",
    "helpers.ts", "../e2e/shared/helpers.ts",
  ];
  const defects = [];
  for (const relativePath of files) {
    const file = join(fileURLToPath(new URL("..", import.meta.url)), relativePath);
    const text = readFileSync(file, "utf8");
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const visit = (node) => {
      if (ts.isCallExpression(node)
        && ts.isPropertyAccessExpression(node.expression)
        && node.expression.name.text === "waitForFunction") {
        const predicate = node.arguments[0];
        const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        if ((ts.isArrowFunction(predicate) || ts.isFunctionExpression(predicate))
          && predicate.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword)) {
          defects.push(`${relativePath}:${line} async predicate`);
        }
        if ((ts.isArrowFunction(predicate) || ts.isFunctionExpression(predicate))
          && predicate.parameters.length === 0) {
          node.arguments.forEach((argument, index) => {
            if (!ts.isObjectLiteralExpression(argument)) return;
            const keys = argument.properties.map((property) => property.name?.getText(source));
            if ((keys.includes("timeout") || keys.includes("polling")) && index !== 2) {
              defects.push(`${relativePath}:${line} options in argument slot`);
            }
          });
        }
        if (node.arguments.length > 3) {
          defects.push(`${relativePath}:${line} too many waitForFunction arguments`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return defects;
}

test("performance polling uses synchronous predicates and real option slots", () => {
  assert.deepEqual(waitForFunctionDefects(), []);
});

test("store timings belong only to actions that own a data route", () => {
  assert.equal(ownsDataRoute(["direct-es"]), true);
  assert.equal(ownsDataRoute(["media-api"]), true);
  assert.equal(ownsDataRoute(["direct-es", "media-api"]), true);
  assert.equal(ownsDataRoute(["client-only"]), false);
  assert.equal(ownsDataRoute(undefined), false);
  for (const filename of ["perceived-short.spec.ts", "perceived-long.spec.ts"]) {
    const source = readFileSync(join(fileURLToPath(new URL("..", import.meta.url)), filename), "utf8");
    const calls = [...source.matchAll(/readStoreTiming\(([^)]*)\)/g)].slice(1);
    assert.ok(calls.length > 0, filename);
    for (const call of calls) assert.match(call[1], /,\s*(?:metrics|m)\.routes$/, filename);
  }
  const perceivedMetricValue = runInNewContext(
    `${dashboardFunction("perceived-graphs.html", "perceivedMetricValue")}\nperceivedMetricValue`,
    { STORE_TIMING_METRICS: new Set(["took", "fetchDuration", "seekTime", "aggTook", "aggFetchDuration"]) },
  );
  assert.equal(perceivedMetricValue({ routes: ["client-only"], fetchDuration: 900 }, "fetchDuration"), null);
  assert.equal(perceivedMetricValue({ routes: ["direct-es"], fetchDuration: 900 }, "fetchDuration"), 900);
});

test("application-source fingerprint excludes only generated perf histories", () => {
  assert.deepEqual(generatedHistoryExclusions(), [
    ":(exclude)e2e-perf/results/audit-log.json",
    ":(exclude)e2e-perf/results/audit-log.js",
    ":(exclude)e2e-perf/results/audit-log.md",
    ":(exclude)e2e-perf/results/perceived-log.json",
    ":(exclude)e2e-perf/results/perceived-log.js",
    ":(exclude)e2e-perf/results/perceived-log.md",
    ":(exclude)e2e-perf/results/density-log.json",
    ":(exclude)e2e-perf/results/density-log.js",
    ":(exclude)e2e-perf/results/density-log.md",
    ":(exclude)e2e-perf/results/campaign-log.json",
    ":(exclude)e2e-perf/results/campaign-log.js",
    ":(exclude)e2e-perf/results/.density-tmp.jsonl",
    ":(exclude)e2e-perf/results/.density-playwright-report.json",
    ":(exclude)e2e-perf/results/.environment-tmp.json",
    ":(exclude)e2e-perf/results/.latest-report-path",
    ":(exclude)e2e-perf/kupua-perf-*.log",
    ":(exclude)e2e-perf/results/kupua-perf-*.log",
  ]);
  const runner = readFileSync(join(fileURLToPath(new URL("..", import.meta.url)), "run-audit.mjs"), "utf8");
  assert.match(runner, /appSourceDirtyStateHash/);
  assert.match(runner, /generatedHistoryExclusions\(\)/);
});

test("both dashboards qualify recorded source fingerprints without verifying identical source", () => {
  for (const filename of ["audit-graphs.html", "perceived-graphs.html"]) {
    const sourceMatchLabel = runInNewContext(
      `${dashboardFunction(filename, "sourceMatchLabel")}\nsourceMatchLabel`,
    );
    const base = { gitSha: "abc", environment: { appSourceDirtyStateHash: "same" } };
    assert.equal(sourceMatchLabel(base, base), "recorded source fingerprints match; identical source not verified (untracked file contents not covered)");
    assert.equal(sourceMatchLabel(base, { ...base, environment: { appSourceDirtyStateHash: "other" } }), "recorded source fingerprints differ (untracked file contents not covered)");
    assert.equal(sourceMatchLabel(base, { ...base, environment: {} }), "recorded source fingerprints unavailable; identical source not verified (untracked file contents not covered)");
    assert.equal(sourceMatchLabel(base, { ...base, gitSha: "def" }), "commit differs");
  }
});

test("required jank fields must be finite in every repetition", () => {
  const fields = ["maxFrame", "frameCount"];
  assert.doesNotThrow(() => assertFiniteFields([{ maxFrame: 10, frameCount: 60 }, { maxFrame: 12, frameCount: 60 }], fields, "P2"));
  assert.throws(
    () => assertFiniteFields([{ maxFrame: 10, frameCount: 60 }, { maxFrame: undefined, frameCount: 60 }], fields, "P2"),
    /P2 missing numeric maxFrame/,
  );
});

test("actual jank aggregation rejects missing base numerics", () => {
  const aggregateMetrics = runInNewContext(`${runnerFunction("aggregateMetrics")}\naggregateMetrics`, {
    assertFiniteFields, REQUIRED_JANK_NUMERIC_FIELDS,
    requireConsistentPresence, aggregateScenarioFields, JANK_SCENARIO_AGGREGATION,
    median: (values) => values[0],
  });
  const base = {
    id: "P2", cls: 0, clsMax: 0, maxFrame: 20, severe: 0, severeRate: 0,
    p95Frame: 9, domChurn: 10, loafBlocking: 0, frameCount: 100,
  };
  assert.doesNotThrow(() => aggregateMetrics([[base], [{ ...base }]]));
  assert.throws(
    () => aggregateMetrics([[base], [{ ...base, maxFrame: undefined }]]),
    /P2 missing numeric maxFrame/,
  );
});

test("actual perceived aggregation does not require jank fields", () => {
  const aggregatePerceivedMetrics = runInNewContext(
    `${runnerFunction("aggregatePerceivedMetrics")}\naggregatePerceivedMetrics`,
    {
      requireConsistentPresence, aggregateSettledTotal, assertConsistentNames, partitionDegradedSamples,
      median: (values) => values[0],
    },
  );
  const metric = {
    id: "PP2", label: "fixture", action: "home-logo", scenarioRevision: 2,
    dt_ack_ms: 20, routes: ["direct-es"],
  };
  const result = aggregatePerceivedMetrics([[metric], [{ ...metric, dt_ack_ms: 30 }]]);
  assert.equal(result.PP2.sampleCount, 2);
  assert.equal(result.PP2.dt_ack_ms, 25);
  assert.equal(result.PP2.degradedCount, undefined);
});

test("actual perceived aggregation excludes degraded focused-sort samples explicitly", () => {
  const aggregatePerceivedMetrics = runInNewContext(
    `${runnerFunction("aggregatePerceivedMetrics")}\naggregatePerceivedMetrics`,
    {
      requireConsistentPresence, aggregateSettledTotal, assertConsistentNames, partitionDegradedSamples,
      median: (values) => values[0],
    },
  );
  const healthy = {
    id: "PP3", label: "fixture", action: "sort-around-focus", scenarioRevision: 3, interactionId: "a",
    dt_ack_ms: 20, dt_store_ready_ms: 1_000, dt_visual_settled_ms: 1_200,
    settledTotal: 1_000_000, resultRegime: "seek", routes: ["media-api"],
  };
  const degraded = {
    id: "PP3", label: "fixture", action: "sort-around-focus", scenarioRevision: 3, interactionId: "b",
    routes: ["media-api"],
    degraded: {
      reason: "timeout", focusedImageId: "history-must-not-keep-this-id",
      requests: [{ operation: "GET /api/images/history-must-not-keep-this-id" }],
    },
  };
  const result = aggregatePerceivedMetrics([[healthy], [degraded], [{ ...healthy, dt_visual_settled_ms: 1_400 }]]);
  assert.equal(result.PP3.sampleCount, 2);
  assert.equal(result.PP3.degradedCount, 1);
  assert.deepEqual({ ...result.PP3.degradedReasons }, { timeout: 1 });
  assert.equal(JSON.stringify(result).includes("history-must-not-keep-this-id"), false);
  assert.equal(result.PP3.dt_visual_settled_ms, 1_300);
  assert.equal(result.PP3.dt_store_ready_ms, 1_000);
  assert.equal(result.PP3.scenarioRevision, 3);

  const allDegraded = aggregatePerceivedMetrics([[degraded], [degraded]]);
  assert.equal(allDegraded.PP3.sampleCount, 0);
  assert.equal(allDegraded.PP3.degradedCount, 2);
  assert.equal(allDegraded.PP3.dt_visual_settled_ms, null);
  assert.equal(allDegraded.PP3.scenarioRevision, 3);
  assert.throws(
    () => aggregatePerceivedMetrics([[healthy], [{ ...degraded, scenarioRevision: 2 }]]),
    /PP3 changed scenarioRevision across repetitions/,
  );
  assert.throws(
    () => aggregatePerceivedMetrics([[{ ...degraded, id: "PP8" }]]),
    /PP8 cannot record degraded samples/,
  );
});

test("perceived history notes degraded exclusions and the campaign reports diagnostics last", () => {
  const degradedSampleNote = runInNewContext(`${runnerFunction("degradedSampleNote")}\ndegradedSampleNote`);
  const note = degradedSampleNote({
    PP2: { id: "PP2", sampleCount: 4 },
    PP3: { id: "PP3", sampleCount: 3, degradedCount: 1, degradedReasons: { timeout: 1 } },
  });
  assert.equal(note, "Degraded samples excluded from medians: PP3 1 of 4 (timeout: 1).");
  assert.equal(degradedSampleNote({ PP2: { id: "PP2", sampleCount: 4 } }), null);

  const buildPerceivedMarkdown = runInNewContext(`${runnerFunction("buildPerceivedMarkdown")}\nbuildPerceivedMarkdown`, {
    degradedSampleNote, formatEnvironment: () => "environment",
  });
  const markdown = buildPerceivedMarkdown("", {
    kind: "short", label: "fixture", gitSha: "abc", gitDirty: false, timestamp: "2026-10-23T00:00:00.000Z",
    stableUntil: "2026-02-15", runs: 4,
    perceived: { PP3: { id: "PP3", action: "sort-around-focus", sampleCount: 3, degradedCount: 1, degradedReasons: { timeout: 1 } } },
  });
  assert.match(markdown, /\| PP3 \| sort-around-focus \| 3 \|/);
  assert.match(markdown, /Degraded samples excluded from medians: PP3 1 of 4 \(timeout: 1\)\./);

  const printed = [];
  const reported = [];
  const degradedSamples = [];
  const context = {
    degradedSamples,
    formatFocusedSortDegradation,
    console: { log: (text) => printed.push(text) },
    appendRunReport: (text) => reported.push(text),
  };
  const collect = runInNewContext(`${runnerFunction("collectDegradedSamples")}\ncollectDegradedSamples`, context);
  const report = runInNewContext(`${runnerFunction("reportDegradedSamples")}\nreportDegradedSamples`, context);
  report();
  assert.deepEqual(printed, []);
  collect([
    { id: "PP2", label: "healthy" },
    {
      id: "PP3", label: "sort-around-focus (Credit)",
      degraded: {
        reason: "timeout", focusedImageId: "fixture-media-id", focus: "cleared", fallbackMs: 8_012, phaseReached: "seeking",
        actionStartedAt: "2026-10-23T02:13:40.000Z", warnings: [{ category: "timeout", atMs: 8_004 }],
        requests: [
          { route: "media-api", operation: "GET /api/images/fixture-media-id?private-marker=1", startedMs: 100, durationMs: 8000, sent: true, headersMs: null, outcome: "failed", failure: "private-marker failure" },
          { route: "media-api", operation: "GET //%ZZ/api/images/private-marker", startedMs: 200, durationMs: 8000, sent: true, headersMs: null, outcome: "pending" },
        ], requestCaptureOverflow: 0,
      },
    },
  ], "perceived (short) run 4 of 4");
  report();
  assert.equal(degradedSamples.length, 1);
  assert.match(printed[0], /DEGRADED SAMPLES: 1 \(excluded from medians; campaign continued\)/);
  assert.match(printed[0], /PP3 sort-around-focus \(Credit\) — perceived \(short\) run 4 of 4/);
  assert.match(printed[0], /action t_0 \(UTC\): 2026-10-23T02:13:40\.000Z/);
  assert.match(printed[0], /focused image: redacted \(identity not retained\)/);
  assert.match(printed[0], /GET \/api\/images\/:id/);
  assert.match(printed[0], /failed other after 8000ms/);
  assert.match(printed[0], /\? :unparseable/);
  assert.doesNotMatch(printed[0], /fixture-media-id|private-marker/);
  assert.equal(reported[0], `${printed[0]}\n`);
  assert.doesNotMatch(reported[0], /fixture-media-id|private-marker/);

  const runner = readFileSync(join(fileURLToPath(new URL("..", import.meta.url)), "run-audit.mjs"), "utf8");
  assert.match(runner, /collectDegradedSamples\(m, `\$\{kindLabel\} run \$\{run\} of \$\{runs\}`\);/);
});

test("PP3 private identities print only in the final debug section, including campaign failure", async () => {
  const printed = [];
  const reported = [];
  const privatePp3Diagnostics = [{ id: "PP3", focusedImageId: "private-pp3-marker", actionStartedAt: "1970-01-01T00:00:00.000Z", runLabel: "short run 1 of 4" }];
  const report = runInNewContext(`${runnerFunction("reportPrivatePp3Diagnostics")}\nreportPrivatePp3Diagnostics`, {
    privatePp3Diagnostics, console: { log: text => printed.push(text) }, appendRunReport: text => reported.push(text),
  });
  report();
  assert.match(printed[0], /PP3 PRIVATE DEBUG/);
  assert.match(printed[0], /private-pp3-marker/);
  assert.match(printed[0], /1970-01-01T00:00:00\.000Z/);
  assert.match(printed[0], /short run 1 of 4/);
  assert.equal(reported[0], `${printed[0]}\n`);
  privatePp3Diagnostics.length = 0;
  report();
  assert.equal(printed.length, 1);
  const runner = readFileSync(new URL("../run-audit.mjs", import.meta.url), "utf8");
  const start = runner.lastIndexOf("\nmain().then(");
  assert.ok(start > 0);
  for (const failed of [false, true]) {
    const events = [];
    const error = new Error("fixture failure");
    const completion = runInNewContext(runner.slice(start), {
      main: () => failed ? Promise.reject(error) : Promise.resolve(),
      reportDegradedSamples: () => events.push("redacted"),
      reportPrivatePp3Diagnostics: () => events.push("private"),
      reportCampaignError: observed => { assert.equal(observed, error); events.push("failure"); },
    });
    assert.deepEqual(events, [], "nothing is reported before campaign completion");
    await completion;
    assert.deepEqual(events, failed ? ["redacted", "private", "failure"] : ["redacted", "private"]);
  }
});

test("short-suite emitter hands off PP3 identity without adding it to ordinary metrics or output", async () => {
  const filename = fileURLToPath(new URL("../perceived-short.spec.ts", import.meta.url));
  const parsed = ts.createSourceFile(filename, readFileSync(filename, "utf8"), ts.ScriptTarget.ES2022, true);
  const declaration = parsed.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "emitDegradedFocusedSort");
  assert.ok(declaration);
  const code = ts.transpileModule(declaration.getText(parsed), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  for (const id of ["PP3", "PP4"]) {
    const handoff = createPrivatePp3Diagnostics();
    const metrics = [];
    const printed = [];
    const emit = runInNewContext(`${code}\nemitDegradedFocusedSort`, {
      process: { env: { KUPUA_PERF_PP3_DEBUG_FILE: handoff.file } },
      computeCorrelatedMetrics: () => ({ interactionId: "fixture", dt_store_ready_ms: 8012 }),
      recordPrivatePp3Diagnostic, summarizeFocusedSortDegradation, formatFocusedSortDegradation,
      console: { log: line => printed.push(line) }, emitMetrics: sample => metrics.push(sample),
    });
    try {
      await emit({ page: { evaluate: async () => 0 } }, {
        id, label: "fixture", focusedImageId: "private-pp3-marker",
        entries: [{ phase: "t_0", t: 0, interactionId: "fixture" }], observation: { focus: "cleared" },
        diagnostics: { warnings: [], snapshot: () => ({ requests: [], requestCaptureOverflow: 0 }) }, routes: ["media-api"],
      });
      assert.doesNotMatch(JSON.stringify(metrics), /private-pp3-marker/);
      assert.equal(metrics[0].degraded.focusedImageId, null);
      assert.doesNotMatch(printed.join("\n"), /private-pp3-marker/);
      const records = handoff.readAndRemove();
      assert.equal(records.length, id === "PP3" ? 1 : 0);
      if (id === "PP3") assert.equal(records[0].focusedImageId, "private-pp3-marker");
    } finally {
      handoff.readAndRemove();
    }
  }
});

test("private PP3 handoff is collected and removed for successful, failing and errored children", async () => {
  for (const outcome of ["success", "failure", "error", "long"]) {
    const privatePp3Diagnostics = [];
    const ordinaryOutput = [];
    let privateFile = "";
    const run = runInNewContext(`${runnerFunction("runPerceivedPlaywright")}\nrunPerceivedPlaywright`, {
      PERCEIVED_KINDS: { short: { config: "fixture", label: "short" }, long: { config: "fixture", label: "long" } },
      expectedPerceivedMetricIds: () => ["PP3"], grepArg: "", headed: false,
      ROOT: "/fixture", STABLE_UNTIL: "2026-02-15", ENVIRONMENT_TMP: "/fixture-env", mediaDelivery: "proxy",
      useMediaApi: false, runs: 4, LATEST_RUN_REPORT: "/private-report",
      assertPrivatePp3OutputFile: file => assert.equal(file, "/private-report"), createPrivatePp3Diagnostics,
      privatePp3Diagnostics, console: { log() {} }, appendRunReport: text => ordinaryOutput.push(String(text)),
      campaignOutput: { authRequired: false }, finishCampaignOutput() {},
      forwardCampaignOutput: chunk => ordinaryOutput.push(String(chunk)),
      process: { env: { KUPUA_PERF_PP3_DEBUG_FILE: "inherited-must-not-survive" }, stdout: { write() {} }, stderr: { write() {} } },
      spawn: (_command, _args, options) => {
        const child = new EventEmitter();
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        privateFile = options.env.KUPUA_PERF_PP3_DEBUG_FILE;
        queueMicrotask(() => {
          if (outcome === "long") assert.equal(privateFile, "");
          else recordPrivatePp3Diagnostic(privateFile, { id: "PP3", focusedImageId: "private-pp3-marker", actionStartedAt: "1970-01-01T00:00:00.000Z" });
          child.stdout.emit("data", Buffer.from("ordinary child output\n"));
          if (outcome === "error") child.emit("error", new Error("synthetic process failure"));
          else child.emit("close", outcome === "failure" ? 1 : 0);
        });
        return child;
      },
    });
    if (outcome === "error") await assert.rejects(run("short", 1), /synthetic process failure/);
    else assert.equal(await run(outcome === "long" ? "long" : "short", 1), outcome === "failure" ? 1 : 0);
    assert.doesNotMatch(ordinaryOutput.join(""), /private-pp3-marker/);
    assert.equal(privatePp3Diagnostics.length, outcome === "long" ? 0 : 1);
    if (outcome !== "long") {
      assert.equal(privatePp3Diagnostics[0].runLabel, "short run 1 of 4");
      assert.equal(existsSync(privateFile), false);
    }
  }
});

test("totals, regimes, and seek-measure names cannot be partial across repetitions", () => {
  assert.throws(
    () => aggregateSettledTotal([
      { settledTotal: 100, resultRegime: "indexed" },
      { resultRegime: "indexed" },
    ], "JB1"),
    /JB1 changed settledTotal presence/,
  );
  assert.doesNotThrow(() => assertConsistentNames([
    { seekMeasures: [{ name: "seek:rank" }] },
    { seekMeasures: [{ name: "seek:rank" }] },
  ], "seekMeasures", "PP7"));
  assert.throws(
    () => assertConsistentNames([
      { seekMeasures: [{ name: "seek:rank" }] },
      { seekMeasures: [{ name: "seek:page" }] },
    ], "seekMeasures", "PP7"),
    /PP7 changed seekMeasures names/,
  );
});

test("audit verdict reports one-off threshold crossings as watchpoints", () => {
  const source = readFileSync(join(fileURLToPath(new URL("..", import.meta.url)), "run-audit.mjs"), "utf8");
  const reporting = source.slice(
    source.indexOf("const METRIC_COLS ="),
    source.indexOf("function buildAuditMarkdown("),
  );
  const buildDiffTable = runInNewContext(`${reporting}\nbuildDiffTable`, {
    comparisonEvidenceClass, metricsAreComparable, severeRateIsReportable,
  });
  const metric = (sampleCount, maxFrame) => ({
    sampleCount, maxFrame, severeRate: 1, severe: 1, p95Frame: 9,
    frameCount: 100, cls: 0, clsMax: 0, domChurn: 10, loafBlocking: 0,
    scenarioRevision: 2, cacheClass: "fixture",
  });
  const previous = { metrics: { P14b: metric(4, 100) } };
  const watchpoint = buildDiffTable({ metrics: { P14b: metric(1, 120) } }, previous);
  assert.match(watchpoint, /Single-sample watchpoints \(not a regression verdict\): P14b\.maxFrame/);
  assert.match(watchpoint, /Verdict: No repeated regression detected\./);
  assert.doesNotMatch(watchpoint, /Possible regressions/);
  const repeated = buildDiffTable({ metrics: { P14b: metric(2, 120) } }, previous);
  assert.match(repeated, /Verdict: ⚠️ Possible regressions: P14b\.maxFrame/);
  assert.doesNotMatch(repeated, /Single-sample watchpoints/);
});

test("perceived dashboard imports only real image-read evidence from audit history", () => {
  const project = runInNewContext(`${dashboardFunction("perceived-graphs.html", "auditImageReadEntries")}\nauditImageReadEntries`);
  const entries = ["direct-es", "media-api"].map((mode) => ({
    label: mode, environment: { dataMode: mode }, timestamp: "2026-09-25T00:00:00Z",
    metrics: {
      P13c: { imageLookupCount: 1, detailLookupMs: 45, detailMetadataReadyMs: 60, detailImageReadyMs: 80,
        routes: [mode], scenarioRevision: 1, cacheClass: "nonresident-metadata-warm-media", privateIdentity: "never-copy" },
      P14a: { imageLookupCount: 0, lookupGuardRevision: 1, scenarioRevision: 2, cacheClass: "fresh-browser-context" },
      P14b: { landingRenderMs: 100 },
      P18: { metadataSettleMs: 150 },
    },
  }));
  const projected = JSON.parse(JSON.stringify(project({ entries })));
  assert.equal(projected.length, 2);
  assert.deepEqual(projected.map((entry) => entry.environment.dataMode), ["direct-es", "media-api"]);
  for (const entry of projected) {
    assert.equal(entry.kind, "jank-probes");
    assert.deepEqual(Object.keys(entry.perceived), ["P13c", "P14a"]);
    assert.equal(entry.perceived.P14a.imageLookupCount, 0);
    assert.equal(entry.perceived.P13c.detailImageReadyMs, 80);
    assert.equal(entry.perceived.P13c.dt_visual_settled_ms, undefined);
    assert.equal(entry.metrics, undefined);
  }
  assert.equal(JSON.stringify(projected).includes("never-copy"), false);
  assert.equal(project({ entries: [{ metrics: { P14a: { landingRenderMs: 80 } } }] }).length, 0);
});

test("both dashboards expose lookup metrics without conflating fallback and API transport", () => {
  for (const filename of ["audit-graphs.html", "perceived-graphs.html"]) {
    const source = readFileSync(new URL(`../results/${filename}`, import.meta.url), "utf8");
    for (const field of ["imageLookupCount", "detailLookupMs", "detailMetadataReadyMs", "detailImageReadyMs"]) {
      assert.ok(source.includes(field), `${filename}: supported legacy metric ${field}`);
      if (filename === "perceived-graphs.html") assert.ok(source.includes(`value="${field}"`));
    }
    const comparable = runInNewContext(`${dashboardFunction(filename, "metricsComparable")}\nmetricsComparable`, {
      environmentKey: (entry) => entry.environment.dataMode,
    });
    const entry = { environment: { dataMode: "media-api" } };
    const metric = {
      routes: ["direct-es"], scenarioRevision: 1, cacheClass: "nonresident-metadata-warm-media",
      resultRegime: "seek", completionBoundary: "stable-detail",
    };
    assert.equal(comparable(entry, metric, entry, metric), true);
    assert.equal(comparable(entry, metric, entry, { ...metric, routes: ["media-api"] }), false);
    assert.equal(comparable(entry, metric, entry, { ...metric, resultRegime: "indexed" }), false);
    assert.equal(comparable(entry, metric, entry, { ...metric, completionBoundary: "fixed-wait" }), false);
    assert.equal(comparable(entry, {}, entry, metric), false);
  }
  const audit = readFileSync(join(fileURLToPath(new URL("..", import.meta.url)), "results/audit-graphs.html"), "utf8");
  assert.match(audit, /imageLookupCount:[^\n]+quietThreshold: 0/);
  const perceived = readFileSync(new URL("../results/perceived-graphs.html", import.meta.url), "utf8");
  assert.match(perceived, /<script\b[^>]*\bsrc="audit-log\.js"/);
  const unit = runInNewContext(`${dashboardFunction("perceived-graphs.html", "metricUnit")}\nmetricUnit`);
  assert.equal(unit("imageLookupCount"), "");
  assert.equal(unit("detailImageReadyMs"), "ms");
});

test("DEV centering bridge belongs to the registered app instance, not an imported module", () => {
  const filename = fileURLToPath(new URL("../../src/lib/orchestration/search.ts", import.meta.url));
  const parsed = ts.createSourceFile(filename, readFileSync(filename, "utf8"), ts.ScriptTarget.ES2022, true);
  const declaration = parsed.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "registerScrollToFocused");
  assert.ok(declaration);
  const sharedWindow = {};
  const load = (dev = true, browser = sharedWindow) => {
    const source = declaration.getText(parsed).replaceAll("import.meta.env.DEV", String(dev));
    const code = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText;
    return runInNewContext(`let _scrollToFocused = null;\n${code}\nregisterScrollToFocused`, {
      exports: {}, ...browser === null ? {} : { window: browser },
    });
  };
  let calls = 0;
  const active = load();
  const first = () => { calls++; };
  active(first);
  assert.equal(sharedWindow.__kupua_scrollFocusedIntoView__, first);
  sharedWindow.__kupua_scrollFocusedIntoView__();
  assert.equal(calls, 1);
  const replacement = load();
  assert.equal(sharedWindow.__kupua_scrollFocusedIntoView__, first);
  const second = () => { calls += 10; };
  replacement(second);
  active(null);
  assert.equal(sharedWindow.__kupua_scrollFocusedIntoView__, second);
  sharedWindow.__kupua_scrollFocusedIntoView__();
  assert.equal(calls, 11);
  load(false)(first);
  assert.equal(sharedWindow.__kupua_scrollFocusedIntoView__, second);
  replacement(null);
  assert.equal(sharedWindow.__kupua_scrollFocusedIntoView__, undefined);
  load(false)(first);
  assert.equal(sharedWindow.__kupua_scrollFocusedIntoView__, undefined);
  assert.doesNotThrow(() => load(true, null)(first));
});

test("both density centering sites call the active binding and reject absence without importing a fallback", () => {
  const filename = fileURLToPath(new URL("../density-browser.ts", import.meta.url));
  const parsed = ts.createSourceFile(filename, readFileSync(filename, "utf8"), ts.ScriptTarget.ES2022, true);
  const callbacks = [];
  for (const name of ["restoreDensitySource", "prepareDensityRecovery"]) {
    const declaration = parsed.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
    function visit(node) {
      if (ts.isCallExpression(node) && node.expression.getText(parsed) === "page.evaluate"
        && node.arguments[0]?.getText(parsed).includes("__kupua_scrollFocusedIntoView__")) callbacks.push(node.arguments[0].getText(parsed));
      ts.forEachChild(node, visit);
    }
    visit(declaration);
  }
  assert.equal(callbacks.length, 2);
  for (const callback of callbacks) {
    assert.doesNotMatch(callback, /import\s*\(/);
    const code = ts.transpileModule(`const invoke = ${callback};\ninvoke`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
    }).outputText;
    let calls = 0;
    const active = runInNewContext(code, { window: { __kupua_scrollFocusedIntoView__: () => { calls++; } } });
    active();
    assert.equal(calls, 1);
    const absent = runInNewContext(code, { window: {} });
    assert.throws(absent, /Density scroll-to-focus callback unavailable/);
  }
});

test("density campaign witness uses the runner's one-based repetition unchanged", () => {
  const filename = fileURLToPath(new URL("../density.spec.ts", import.meta.url));
  const parsed = ts.createSourceFile(filename, readFileSync(filename, "utf8"), ts.ScriptTarget.ES2022, true);
  const contexts = [];
  let runIndex;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(parsed) === "runIndex") runIndex = node.initializer.getText(parsed);
    if (ts.isCallExpression(node) && ["prepare", "restoreDensitySource"].includes(node.expression.getText(parsed))) {
      contexts.push(node.arguments[1].getText(parsed));
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  assert.equal(contexts.length, 2);
  for (const repetition of [1, 4]) {
    for (const context of contexts) {
      const value = runInNewContext(`const runIndex = ${runIndex}; (${context})`, {
        process: { env: { KUPUA_DENSITY_RUN_INDEX: String(repetition) } }, workload: "scroll-backward", density: "grid",
      });
      assert.equal(value.repetition, repetition);
    }
  }
});

test("density restoration forwards bounded context and actual seek choice without changing placement guard", async () => {
  const filename = fileURLToPath(new URL("../density-browser.ts", import.meta.url));
  const parsed = ts.createSourceFile(filename, readFileSync(filename, "utf8"), ts.ScriptTarget.ES2022, true);
  const declaration = parsed.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "restoreDensitySource");
  assert.ok(declaration);
  const code = ts.transpileModule(declaration.getText(parsed), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  for (const resident of [true, false]) {
    const events = [];
    const source = { id: "fixture-anchor", offset: 123, total: 1000, params: "{}" };
    const state = { total: source.total, params: {}, imagePositions: new Map(resident ? [[source.id, source.offset]] : []),
      setFocusedImageId: value => { assert.equal(value, source.id); events.push("focus"); },
      seekToFocused: async () => { events.push("seek"); } };
    const context = { workload: "scroll-backward", repetition: 2, destination: "justified" };
    let placement;
    const restore = runInNewContext(`${code}\nrestoreDensitySource`, {
      exports: {}, window: { __densitySource: source, __kupua_store__: {
        getState: () => state, setState: patch => { assert.equal(patch._focusedImageKnownOffset, source.offset); },
      } },
      selectDensity: async (_page, density) => { assert.equal(density, "table"); events.push("table"); },
      waitForWindowIdle: async () => { events.push("idle"); },
      waitForPlacement: async (...args) => { placement = args; events.push("placement"); },
    });
    let evaluations = 0;
    const page = { evaluate: async callback => {
      if (++evaluations === 2) { events.push("scroll"); return; }
      return callback();
    } };
    assert.equal((await restore(page, context)).total, source.total);
    assert.deepEqual(events, ["table", "idle", "focus", ...resident ? [] : ["seek"], "idle", "scroll", "placement"]);
    assert.equal(placement[0], page);
    assert.equal(placement[1], "table");
    assert.equal(placement[2], true);
    assert.equal(placement[3], undefined);
    assert.equal(placement[4], undefined);
    assert.deepEqual(JSON.parse(JSON.stringify(placement[5])), {
      ...context, stage: "restore-source", seekRequested: !resident, scrollRequested: true,
    });
  }
});

test("replacing perceived history removes stale charts before rendering shared probes", () => {
  const elements = { grid: { innerHTML: "old cards" }, diagnosticGrid: { innerHTML: "old diagnostics" } };
  let destroyed = 0;
  const charts = new Map([["old", { destroy: () => destroyed++ }]]);
  let rendered = false;
  const ingest = runInNewContext(`${dashboardFunction("perceived-graphs.html", "auditImageReadEntries")}\n${dashboardFunction("perceived-graphs.html", "ingestLog")}\ningestLog`, {
    window: { __AUDIT_LOG__: { entries: [{ timestamp: "fixture", metrics: { P14a: { imageLookupCount: 0 } } }] } },
    KupuaPerfComparison: { populate(entries) {
      assert.equal(entries.length, 1, "saved audit evidence must join perceived history");
      assert.equal(entries[0].perceived.P14a.imageLookupCount, 0);
    } },
    document: { getElementById: (id) => elements[id] },
    charts,
    render: () => {
      assert.equal(charts.size, 0);
      assert.equal(elements.grid.innerHTML, "");
      assert.equal(elements.diagnosticGrid.innerHTML, "");
      rendered = true;
    },
  });
  ingest({ entries: [] });
  assert.equal(destroyed, 1);
  assert.equal(rendered, true);
});

test("P14 observes actual slow landings for 15 seconds without inventing completion", async () => {
  const source = readFileSync(new URL("../perf.spec.ts", import.meta.url), "utf8");
  const helper = source.slice(source.indexOf("async function waitForLandingImage("), source.indexOf("async function prepareP14Scenario("));
  const { outputText } = ts.transpileModule(helper, { compilerOptions: { target: ts.ScriptTarget.ES2022 } });
  for (const [readyMs, evaluationDelayMs] of [[0, 0], [8_300, 0], [14_980, 0], [Infinity, 0], [15_010, 30], [0, 15_001]]) {
    let now = 0;
    let identityChangesAt = Infinity;
    const image = { get complete() { return now >= readyMs; }, naturalWidth: 400, naturalHeight: 300, src: "/fixture-image" };
    const owner = { getAttribute: () => now >= identityChangesAt ? "different-target" : "fixture-target" };
    const wait = runInNewContext(`${outputText}\nwaitForLandingImage`, {
      Date: { now: () => now }, landingElapsedMs: (commit, current) => Math.max(0, current - commit),
      document: { querySelector: selector => selector === "[data-detail-image-id]" ? owner : image },
      getImageNetworkTiming: async () => ({ networkMs: readyMs, cacheHit: false }),
    });
    const page = { evaluate: (callback, argument) => { now += evaluationDelayMs; return callback(argument); }, waitForTimeout: async delay => { now += delay; } };
    const result = await wait(page, { expectedId: "fixture-target", committedEpochMs: 0 });
    const completesWithinWindow = Number.isFinite(readyMs) && readyMs <= 15_000 && evaluationDelayMs <= 15_000;
    assert.equal(result.rendered, completesWithinWindow);
    assert.equal(result.renderMs, completesWithinWindow ? readyMs : 15_000);
    if (completesWithinWindow) assert.equal(now, readyMs);
    else assert.ok(now >= 15_000);
    if (!Number.isFinite(readyMs)) {
      for (const changedAt of [0, 1_000]) {
        now = 0;
        identityChangesAt = changedAt;
        await assert.rejects(wait(page, { expectedId: "fixture-target", committedEpochMs: 0 }), /identity changed/);
      }
    }
  }
});

test("P14 aggregation separates completed landing times from observation limits", () => {
  const source = readFileSync(new URL("../run-audit.mjs", import.meta.url), "utf8");
  const helper = source.slice(source.indexOf("function median("), source.indexOf("// Read/write audit log"));
  const aggregate = runInNewContext(`${helper}\naggregateMetrics`, {
    assertFiniteFields, REQUIRED_JANK_NUMERIC_FIELDS, requireConsistentPresence,
    JANK_SCENARIO_AGGREGATION, aggregateScenarioFields,
  });
  const base = {
    ...Object.fromEntries(REQUIRED_JANK_NUMERIC_FIELDS.map(field => [field, 0])),
    id: "P14b", scenarioRevision: 3, lookupGuardRevision: 1, imageLookupCount: 0,
    cacheClass: "fresh-browser-context", startRank: 3, committedSteps: 15, traversals: 15,
    cadenceMs: 200, speed: "fast", direction: "forward", clsEvents: [],
    landingRendered: false, landingRenderMs: 15_000, landingNetworkMs: 0,
  };
  const incomplete = aggregate([[base], [base]]).P14b;
  assert.equal(incomplete.scenarioRevision, 3);
  assert.equal(incomplete.landingRenderMs, null);
  assert.equal(incomplete.landingNetworkMs, null);
  assert.equal(incomplete.landingRenderedCount, 0);
  assert.equal(incomplete.landingCensoredCount, 2);
  const ready = { ...base, landingRendered: true, landingRenderMs: 8_300, landingNetworkMs: 8_200 };
  const mixed = aggregate([[base], [ready]]).P14b;
  assert.equal(mixed.landingRenderMs, 8_300);
  assert.equal(mixed.landingNetworkMs, 8_200);
  assert.equal(mixed.landingRenderedCount, 1);
  assert.equal(mixed.landingCensoredCount, 1);
  assert.throws(() => aggregate([[base], [{ ...ready, scenarioRevision: 2 }]]), /changed.*scenario/);
  const standalone = {
    ...base, id: "P13c", cacheClass: "nonresident-metadata-returned-media",
    completionBoundary: "singleton-response-and-bounded-returned-media",
    routes: ["media-api"], imageLookupCount: 1,
    detailLookupMs: 40, detailMetadataReadyMs: 60, detailImageReadyMs: null,
    detailImageReady: false, detailImageFailed: false, detailObservationLimitMs: 15_000, mediaResourceReused: false,
  };
  const standaloneMixed = aggregate([[standalone], [{ ...standalone, detailImageReadyMs: 8_300, detailImageReady: true }]]).P13c;
  assert.equal(standaloneMixed.detailImageReadyMs, 8_300);
  assert.equal(standaloneMixed.detailImageReadyCount, 1);
  assert.equal(standaloneMixed.detailImageCensoredCount, 1);
  assert.equal(standaloneMixed.mediaResourceNotReusedCount, 2);
  const standaloneIncomplete = aggregate([[standalone]]).P13c;
  assert.equal(standaloneIncomplete.detailImageReadyMs, null);
  assert.equal(standaloneIncomplete.detailImageCensoredCount, 1);
});

test("P14 preserves an unready landing as a measurement instead of failing the campaign", async () => {
  const source = readFileSync(new URL("../perf.spec.ts", import.meta.url), "utf8");
  const workload = source.slice(source.indexOf("  for (const scenario of p14Scenarios)"), source.indexOf("  // ─── P15:"));
  const { outputText } = ts.transpileModule(workload, { compilerOptions: { target: ts.ScriptTarget.ES2022 } });
  const callbacks = [], metrics = [];
  const landing = { rendered: false, renderMs: 15_000, networkMs: 0, alreadyRendered: false, cacheHit: false };
  runInNewContext(outputText, {
    p14Scenarios: [{ id: "P14b", label: "fast forward", direction: "forward", steps: 15, cadenceMs: 200, speed: "fast" }],
    test: (_name, callback) => callbacks.push(callback),
    prepareP14Scenario: async () => ({ expectedSequence: [], startRank: 3 }),
    captureImageLookups: () => ({ requests: [], stop() {} }),
    traverseExpectedSequence: async () => ({ timings: Array.from({ length: 15 }, () => ({})), finalCommit: { committedEpochMs: 0 } }),
    waitForLandingImage: async () => landing, Date: { now: () => 15_000 },
    collectPerfSnapshot: async () => ({ cls: { shiftDetails: [] } }),
    logTraversalSummary() {}, logPerfReport() {},
    emitMetric: (_id, _snapshot, metric) => metrics.push(metric),
    summariseTraversal: () => ({ landingRendered: false, landingRenderMs: 15_000 }),
    expect: value => ({ toBe: expected => assert.equal(value, expected), toHaveLength: expected => assert.equal(value.length, expected) }),
  });
  await callbacks[0]({ kupua: { page: {} } });
  assert.equal(metrics[0].landingRendered, false);
  assert.equal(metrics[0].scenarioRevision, 3);
});

function standaloneProbeHarness({ route = "direct-es", expectedRoute = route, resident = false, becomesResident = false, requestCount = 1, changedMedia = false, readyAt = 60, mediaFails = false, wrongTarget = false, wrongTargetIndex = -1, mixedRoute = false, failedIndex = -1, failureText = "net::ERR_ABORTED" } = {}) {
  const source = readFileSync(join(fileURLToPath(new URL("..", import.meta.url)), "perf.spec.ts"), "utf8");
  const helper = source.slice(source.indexOf("function captureImageLookups("), source.indexOf("// Guard: per-test cluster checks"));
  const { outputText } = ts.transpileModule(helper, { compilerOptions: { target: ts.ScriptTarget.ES2022 } });
  let now = 0;
  const listeners = new Map();
  const mediaListeners = new Map();
  let failureDispatched = false;
  const target = "fixture-target";
  const response = { ok: () => true, finished: async () => null };
  const requests = Array.from({ length: requestCount }, (_, index) => {
    const actualRoute = mixedRoute && index > 0 ? "media-api" : route;
    const requestedId = wrongTarget || wrongTargetIndex === index ? "different-target" : target;
    return {
      method: () => actualRoute === "direct-es" ? "POST" : "GET",
      url: () => actualRoute === "direct-es"
        ? "https://example.invalid/es/images/_mget"
        : `https://kupua.media.local.dev-gutools.co.uk/api/images/${requestedId}`,
      response: async () => failedIndex === index ? null : response,
      failure: () => failedIndex === index ? { errorText: failureText } : null,
      postDataJSON: () => ({ docs: [{ _id: requestedId }] }),
      timing: () => ({ startTime: 1000, responseEnd: 40 + index * 20 }),
    };
  });
  const image = {
    tagName: "IMG", fetchPriority: "high",
    get complete() { return now >= readyAt; }, naturalWidth: 400,
    currentSrc: changedMedia ? "/new-rendition" : "/warm-rendition",
    getBoundingClientRect: () => ({ top: 10, left: 0, width: 400, height: 300, bottom: 310 }),
    decode: async () => {},
  };
  const owner = { getAttribute: () => target, querySelector: () => image };
  const page = {
    on: (event, listener) => listeners.set(event, listener),
    off: (event) => listeners.delete(event),
    evaluate: (callback, argument) => callback(argument),
  };
  const expect = (value) => ({
    toHaveLength: (length) => assert.equal(value.length, length),
    toBe: (expected) => assert.equal(value, expected),
    toBeGreaterThanOrEqual: (minimum) => assert.ok(value >= minimum),
  });
  const measure = runInNewContext(`${outputText}\nmeasureStandaloneDetail`, {
    URL, expect, classifyImageLookup, innerHeight: 900,
    Date: { now: () => 1000 }, performance: { now: () => now },
    location: { href: `https://example.invalid/search?image=${target}` },
    requestAnimationFrame: (callback) => {
      now += 16;
      if (mediaFails && now >= 60 && !failureDispatched) {
        failureDispatched = true;
        mediaListeners.get("error")?.({ target: image });
      }
      queueMicrotask(callback);
    },
    document: {
      querySelector: () => now >= 40 ? owner : null,
      addEventListener: (name, callback) => mediaListeners.set(name, callback),
      removeEventListener: name => mediaListeners.delete(name),
    },
    window: {
      setTimeout, clearTimeout,
      __perfStandaloneMedia__: "/warm-rendition",
      __kupua_store__: { getState: () => ({ results: resident ? [{ id: target }] : [{ id: "other" }], imagePositions: { has: () => becomesResident } }) },
      __kupua_router__: { navigate: async () => {
        for (const request of requests) listeners.get("request")?.(request);
      } },
    },
  });
  return { run: () => measure({ page }, target, expectedRoute), listeners, mediaListeners };
}

function geometryWaitFunctions(context) {
  const source = readFileSync(join(fileURLToPath(new URL("..", import.meta.url)), "perf.spec.ts"), "utf8");
  const helpers = source.slice(
    source.indexOf("async function waitForResultsWidthGrowth("),
    source.indexOf("// Guard: per-test cluster checks"),
  );
  const { outputText } = ts.transpileModule(helpers, { compilerOptions: { target: ts.ScriptTarget.ES2022 } });
  return runInNewContext(`${outputText}\n({ waitForResultsWidthGrowth, waitForFocusedReturnStability })`, context);
}

test("P5c geometry wait requires real width growth and two stable frames", async () => {
  for (const outcome of ["settled", "never-grows", "keeps-moving"]) {
    let now = 0;
    const element = {
      isConnected: true,
      getBoundingClientRect: () => ({
        width: outcome === "never-grows" ? 500 : now >= 48 ? 700 + (outcome === "keeps-moving" ? now : 0) : 500,
        left: outcome === "keeps-moving" ? now : 100,
      }),
    };
    const context = {
      performance: { now: () => now },
      requestAnimationFrame: (callback) => { now += 16; queueMicrotask(callback); },
      document: { querySelector: () => element },
    };
    const { waitForResultsWidthGrowth } = geometryWaitFunctions(context);
    const page = { evaluate: (callback, argument) => callback(argument) };
    if (outcome === "settled") {
      await waitForResultsWidthGrowth(page, 500, 160);
      assert.ok(now >= 64);
    } else {
      await assert.rejects(waitForResultsWidthGrowth(page, 500, 160));
      assert.ok(now >= 160);
    }
  }
});

test("P13b return wait requires current focus, visibility and stable geometry", async () => {
  for (const outcome of ["settled", "wrong-focus", "invisible", "keeps-moving"]) {
    let now = 0;
    const rect = () => ({
      top: outcome === "invisible" ? 1_200 : outcome === "keeps-moving" ? now : 100,
      left: outcome === "keeps-moving" ? now : 40,
      width: 200, height: 100,
      bottom: outcome === "invisible" ? 1_300 : outcome === "keeps-moving" ? now + 100 : 200,
    });
    const container = { isConnected: true, getBoundingClientRect: () => ({ top: 0, left: 0, bottom: 900 }) };
    const cell = { isConnected: true, getBoundingClientRect: rect };
    const store = { getState: () => ({ focusedImageId: outcome === "wrong-focus" ? "other" : "target" }) };
    const context = {
      CSS: { escape: (value) => value },
      performance: { now: () => now },
      requestAnimationFrame: (callback) => { now += 16; queueMicrotask(callback); },
      document: { querySelector: (selector) => selector.includes("data-image-id") ? cell : container },
      window: { __kupua_store__: store },
    };
    const { waitForFocusedReturnStability } = geometryWaitFunctions(context);
    const page = { evaluate: (callback, argument) => callback(argument) };
    if (outcome === "settled") {
      await waitForFocusedReturnStability(page, "target", 160);
      assert.ok(now >= 32);
    } else {
      await assert.rejects(waitForFocusedReturnStability(page, "target", 160));
      assert.ok(now >= 160);
    }
  }
});

test("actual standalone probe records single reads and Strict Mode replay in both transports", async () => {
  for (const route of ["direct-es", "media-api"]) {
    for (const requestCount of [1, 2]) {
      const harness = standaloneProbeHarness({ route, requestCount });
      const result = await harness.run();
      assert.equal(result.scenarioRevision, 3);
      assert.equal(result.cacheClass, "nonresident-metadata-returned-media");
      assert.equal(result.mediaResourceReused, true);
      assert.equal(result.detailImageReady, true);
      assert.equal(result.routes[0], route);
      assert.equal(result.imageLookupCount, requestCount);
      assert.equal(result.detailLookupMs, 40 + (requestCount - 1) * 20);
      assert.ok(result.detailImageReadyMs >= result.detailMetadataReadyMs);
      assert.equal(harness.listeners.size, 0);
      assert.equal(JSON.stringify(result).includes("fixture-target"), false);
    }
  }
});

test("standalone returned-media probe records changed resources and slow or censored readiness", async () => {
  for (const readyAt of [60, 8_300, 14_900, Infinity]) {
    const harness = standaloneProbeHarness({ changedMedia: true, readyAt });
    const result = await harness.run();
    assert.equal(result.mediaResourceReused, false);
    assert.equal(result.detailImageReady, Number.isFinite(readyAt));
    assert.equal(result.detailObservationLimitMs, 15_000);
    assert.ok(result.detailMetadataReadyMs >= 0);
    if (Number.isFinite(readyAt)) assert.ok(result.detailImageReadyMs >= readyAt);
    else assert.equal(result.detailImageReadyMs, null);
    assert.equal(harness.listeners.size, 0);
  }
});

test("actual standalone probe rejects excess, missing or mismatched reads and resident shortcuts", async () => {
  for (const options of [{ resident: true }, { becomesResident: true }, { requestCount: 3 }, { requestCount: 0 }, { expectedRoute: "media-api" }, { wrongTarget: true },
    { requestCount: 2, wrongTargetIndex: 0 }, { requestCount: 2, wrongTargetIndex: 1 },
    { requestCount: 2, mixedRoute: true }]) {
    const harness = standaloneProbeHarness(options);
    await assert.rejects(harness.run());
    assert.equal(harness.listeners.size, 0);
  }
});

test("standalone thumbnail fallback cannot satisfy full-media readiness", async () => {
  const harness = standaloneProbeHarness({ mediaFails: true });
  const result = await harness.run();
  assert.equal(result.detailImageReady, false);
  assert.equal(result.detailImageReadyMs, null);
  assert.equal(result.detailImageFailed, true);
  assert.equal(harness.mediaListeners.size, 0);
});

test("actual standalone probe accepts one cancelled Strict Mode replay before a successful read", async () => {
  for (const route of ["direct-es", "media-api"]) {
    const harness = standaloneProbeHarness({ route, requestCount: 2, failedIndex: 0 });
    const result = await harness.run();
    assert.equal(result.imageLookupCount, 2);
    assert.equal(result.routes[0], route);
    assert.equal(result.detailLookupMs, 60);
    assert.equal(harness.listeners.size, 0);
  }
});

test("actual standalone probe rejects a cancelled only, last or non-abort failed read", async () => {
  for (const options of [{ requestCount: 1, failedIndex: 0 }, { requestCount: 2, failedIndex: 1 },
    { requestCount: 2, failedIndex: 0, failureText: "net::ERR_CONNECTION_REFUSED" },
    { requestCount: 2, failedIndex: 0, wrongTargetIndex: 0 }]) {
    const harness = standaloneProbeHarness(options);
    await assert.rejects(harness.run());
    assert.equal(harness.listeners.size, 0);
  }
});

function decodedDetailHarness({ readyAt = 64, wrongIdentity = false, moving = false, decodeFails = false } = {}) {
  const source = readFileSync(join(fileURLToPath(new URL("..", import.meta.url)), "../e2e/shared/helpers.ts"), "utf8");
  const method = source.slice(source.indexOf("  async waitForDecodedDetailImage("), source.indexOf("  /** Wait for native fullscreen state"));
  const { outputText } = ts.transpileModule(`class DetailHelper { constructor(public page: any) {} ${method} }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  });
  let now = 0;
  let decodes = 0;
  const rect = () => ({ top: moving ? now : 10, left: 10, width: 400, height: 300, bottom: 310, right: 410 });
  const image = {
    get complete() { return now >= readyAt; }, naturalWidth: 400, naturalHeight: 300,
    currentSrc: "https://example.invalid/fixture-image", isConnected: true,
    getBoundingClientRect: rect,
    decode: async () => { decodes++; if (decodeFails) throw new Error("fixture decode failure"); },
  };
  const detail = { querySelector: () => image, getBoundingClientRect: rect, getAttribute: () => "fixture-target", isConnected: true };
  const page = {
    waitForFunction: async (callback, argument) => {
      const result = callback(argument);
      if (result) return await result;
      throw new Error("fixture synchronous predicate not satisfied");
    },
    evaluate: (callback, argument) => callback(argument),
  };
  const Helper = runInNewContext(`${outputText}\nDetailHelper`, {
    URL, CSS: { escape: (value) => value }, innerHeight: 900, innerWidth: 1200,
    performance: { now: () => now },
    requestAnimationFrame: (callback) => { now += 16; queueMicrotask(callback); },
    location: { href: "https://example.invalid/search?image=fixture-target" },
    document: { querySelector: () => wrongIdentity ? null : detail },
  });
  return { run: () => new Helper(page).waitForDecodedDetailImage("fixture-target", 160), elapsed: () => now, decodes: () => decodes };
}

function densityInitializationHarness() {
  const source = readFileSync(join(fileURLToPath(new URL("..", import.meta.url)), "../e2e/shared/helpers.ts"), "utf8");
  const start = source.indexOf("  async initializeDensity(");
  assert.ok(start >= 0, "shared helpers must expose independent-case density initialization");
  const method = source.slice(start, source.indexOf("  /** Navigate to the search page", start));
  const { outputText } = ts.transpileModule(`class DensityHelper { constructor(public page: any) {} ${method} }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  });
  let values = new Map();
  const scripts = [];
  let sequence = 0;
  let currentUrl = "about:blank";
  const chosen = [];
  const page = {
    url: () => currentUrl,
    addInitScript: async (callback, argument) => { scripts.push({ identifier: String(++sequence), run: () => callback(argument) }); },
    context: () => ({ newCDPSession: async () => ({
      enabled: false,
      send: async function (method, params) {
        if (method === "Page.enable") { this.enabled = true; return {}; }
        if (method === "Page.addScriptToEvaluateOnNewDocument") {
          assert.equal(this.enabled, true, "the external Page domain must be enabled before seeding a document");
          const identifier = String(++sequence);
          scripts.push({ identifier, run: () => runInNewContext(params.source, globals) });
          return { identifier };
        }
        if (method === "Page.removeScriptToEvaluateOnNewDocument") {
          const index = scripts.findIndex(script => script.identifier === params.identifier);
          assert.ok(index >= 0, "remove only the owned density seed");
          scripts.splice(index, 1);
          return {};
        }
        throw new Error(`Unexpected initializer method ${method}`);
      },
      detach: async () => {},
    }) }),
    evaluate: async (_callback, density) => { chosen.push(density); values.set("kupua-density", density); },
  };
  const globals = { crypto: { randomUUID: () => String(++sequence) }, sessionStorage: {
    getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value),
  } };
  const Helper = runInNewContext(`${outputText}\nDensityHelper`, globals);
  const helper = new Helper(page);
  return { helper, scripts, chosen, storage: () => values, load: (reverse = false) => {
    const pending = reverse ? [...scripts].reverse() : [...scripts];
    pending.forEach(script => script.run());
  }, setUrl: (url) => { currentUrl = url; }, changeOrigin: (next) => { values = next; } };
}

test("shared density initialization is deliberate and cannot overwrite navigation/reload persistence", async () => {
  const harness = densityInitializationHarness();
  const { helper, scripts, chosen } = harness;
  const values = harness.storage();
  await helper.initializeDensity("table");
  harness.load();
  assert.equal(values.get("kupua-density"), "table");
  values.set("kupua-density", "grid");
  harness.load();
  assert.equal(values.get("kupua-density"), "grid", "reload must retain the actual later choice");
  harness.setUrl("http://localhost:3000/search");
  await helper.initializeDensity("table");
  assert.deepEqual(chosen, ["table"], "reused cases initialize through production preference storage");
  assert.equal(scripts.length, 0, "a storage-only initialization must retire its old document seed");
  harness.setUrl("about:blank");
  await helper.initializeDensity("grid");
  harness.load();
  assert.equal(values.get("kupua-density"), "grid", "independent initialization must override a reused blank tab's choice");
  values.set("kupua-density", "table");
  harness.load();
  assert.equal(values.get("kupua-density"), "table", "the newly initialized case must still preserve later reload choices");
});

for (const reverse of [false, true]) {
  test(`latest pending density initialization wins with ${reverse ? "reversed" : "registration"} script order and new origin storage`, async () => {
    const harness = densityInitializationHarness();
    await harness.helper.initializeDensity("grid");
    await harness.helper.initializeDensity("table");
    harness.load(reverse);
    assert.equal(harness.storage().get("kupua-density"), "table");
    assert.equal(harness.scripts.length, 1, "obsolete density registrations cannot remain eligible");
    const secondOrigin = new Map([["kupua-density", "grid"], ["unrelated", "keep"]]);
    harness.changeOrigin(secondOrigin);
    harness.load(reverse);
    assert.equal(secondOrigin.get("kupua-density"), "table");
    assert.equal(secondOrigin.get("unrelated"), "keep");
    secondOrigin.set("kupua-density", "grid");
    harness.load(reverse);
    assert.equal(secondOrigin.get("kupua-density"), "grid", "reload retains the actual choice on each origin");
  });
}

test("independent case starts retain the existing corpus-pinned navigation path", async () => {
  const source = readFileSync(join(fileURLToPath(new URL("..", import.meta.url)), "../e2e/shared/helpers.ts"), "utf8");
  const method = source.slice(source.indexOf("  async startSearch("), source.indexOf("  async assertDensity("));
  const { outputText } = ts.transpileModule(`class StartHelper { ${method} }`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } });
  const Helper = runInNewContext(`${outputText}\nStartHelper`);
  const calls = [];
  const helper = new Helper();
  helper.initializeDensity = async choice => calls.push(["initialize", choice]);
  helper.gotoWithParams = async params => calls.push(["un-pinned", params]);
  helper.gotoPerfStable = async params => calls.push(["pinned", params]);
  helper.assertDensity = async choice => calls.push(["rendered", choice]);
  await helper.startSearch("query=fixture", "table");
  assert.deepEqual(calls, [["initialize", "table"], ["pinned", "query=fixture"], ["rendered", "table"]]);
});

test("perf grid readiness rejects a rendered table, including PP7c and PP10 starts", async () => {
  const source = readFileSync(join(fileURLToPath(new URL("..", import.meta.url)), "../e2e/shared/helpers.ts"), "utf8");
  const method = source.slice(source.indexOf("  async waitForResults("), source.indexOf("  // Store state", source.indexOf("  async waitForResults(")));
  const { outputText } = ts.transpileModule(`class ReadyHelper { constructor(public page: any) {} ${method} }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  });
  for (const rendered of ["grid", "table"]) {
    const rect = { top: 0, bottom: 600 };
    const container = { getBoundingClientRect: () => rect, querySelectorAll: () => [{ getBoundingClientRect: () => ({ top: 20, bottom: 50 }) }] };
    const Helper = runInNewContext(`${outputText}\nReadyHelper`, { document: {
      querySelector: selector => selector.includes(rendered) ? container : null,
    } });
    let diagnosticReads = 0;
    const page = {
      waitForFunction: async (callback, density) => { assert.equal(callback(density), true, "wrong rendered density"); },
      evaluate: async () => { diagnosticReads++; throw new Error("fixture page unavailable"); },
    };
    const operation = new Helper(page).waitForResults(15_000, "grid");
    if (rendered === "table") await assert.rejects(operation, /wrong rendered density/);
    else await operation;
    assert.equal(diagnosticReads, rendered === "table" ? 1 : 0);
  }
  const short = readFileSync(join(fileURLToPath(new URL("..", import.meta.url)), "perceived-short.spec.ts"), "utf8");
  for (const id of ["PP7c", "PP10"]) {
    const start = short.indexOf(`test("${id}:`);
    const scenario = short.slice(start, short.indexOf("\n  test(", start + 1));
    assert.match(scenario, /waitForResults\(15_000, "grid"\)/, `${id} must guard its effective grid startup`);
  }
});

test("detail readiness cannot pass on an async predicate resolving false before image load", async () => {
  const harness = decodedDetailHarness();
  await harness.run();
  assert.ok(harness.elapsed() >= 80, "must wait for load and a following stable frame");
  assert.ok(harness.decodes() > 0, "must actually await image decode");
});

test("detail readiness rejects missing, undecodable and unstable images at its deadline", async () => {
  for (const options of [{ readyAt: 1000 }, { wrongIdentity: true }, { moving: true }, { decodeFails: true }]) {
    const harness = decodedDetailHarness(options);
    await assert.rejects(harness.run());
    assert.ok(harness.elapsed() >= 160);
  }
});

test("perf campaigns and direct configs retain teardown diagnostics", () => {
  const runner = readFileSync(join(fileURLToPath(new URL("..", import.meta.url)), "run-audit.mjs"), "utf8");
  const overrides = [...runner.matchAll(/"--reporter=([^"]+)"/g)];
  assert.equal(overrides.length, 2);
  for (const [, reporters] of overrides) {
    assert.ok(reporters.split(",").includes("./e2e-perf/teardown-reporter.mjs"));
  }
  for (const config of ["playwright.perf.config.ts", "playwright.perceived-short.config.ts", "playwright.perceived-long.config.ts"]) {
    const source = readFileSync(join(fileURLToPath(new URL("..", import.meta.url)), config), "utf8");
    assert.ok(source.includes('["./teardown-reporter.mjs"]'), config);
  }
  const { scripts } = JSON.parse(readFileSync(join(fileURLToPath(new URL("..", import.meta.url)), "..", "package.json"), "utf8"));
  for (const [name, command] of Object.entries(scripts)) {
    if (name.startsWith("test:perf:")) assert.doesNotMatch(command, /--reporter=list(?:\s|$)/, name);
  }
});

test("perf auth classification distinguishes missing authorization from ordinary failures", async () => {
  const { AUTH_RENEWAL_COMMAND, isPerfAuthResponse } = await import("../auth-failure.mjs");
  assert.equal(AUTH_RENEWAL_COMMAND, 'kupua/node_modules/.bin/playwright codegen --save-storage="[enter path to your cookie file]" https://kupua.media.local.dev-gutools.co.uk');
  assert.ok(readFileSync(new URL("../README.md", import.meta.url), "utf8").includes(AUTH_RENEWAL_COMMAND));
  assert.ok(readFileSync(new URL("../campaign-setup.md", import.meta.url), "utf8").includes(AUTH_RENEWAL_COMMAND));
  const targets = { appBaseUrl: "https://app.fixture.invalid", mediaApiBaseUrl: "https://api.fixture.invalid" };
  for (const status of [401, 419]) {
    assert.equal(isPerfAuthResponse({ url: "https://api.fixture.invalid/images", status }, targets), true);
    assert.equal(isPerfAuthResponse({ url: "https://app.fixture.invalid/api/images", status }, targets), true);
    assert.equal(isPerfAuthResponse({ url: "https://app.fixture.invalid/__kupua/perf-environment", status }, targets), true);
    assert.equal(isPerfAuthResponse({ url: "https://app.fixture.invalid/search", status, navigation: true }, targets), true);
    assert.equal(isPerfAuthResponse({ url: "https://images.fixture.invalid/image", status }, targets), false);
    assert.equal(isPerfAuthResponse({ url: "https://app.fixture.invalid/imgproxy/image", status }, targets), false);
  }
  for (const status of [200, 403, 404, 429, 500, 502, 504]) {
    assert.equal(isPerfAuthResponse({ url: "https://api.fixture.invalid/images", status }, targets), false);
  }
  assert.equal(isPerfAuthResponse({ url: "https://api.fixture.invalid/images", status: 302, location: "https://auth.fixture.invalid/login?private=1" }, targets), true);
  assert.equal(isPerfAuthResponse({ url: "https://app.fixture.invalid/search", status: 303, location: "/login", navigation: true }, targets), true);
  assert.equal(isPerfAuthResponse({ url: "https://api.fixture.invalid/images", status: 307, location: "/images/next" }, targets), false);
  assert.equal(isPerfAuthResponse({ url: "https://api.fixture.invalid/images", status: 302 }, targets), false);
  assert.equal(isPerfAuthResponse({ url: "not-a-url", status: 401 }, targets), false);
});

test("perf reporter stops once on a split auth marker and prints the exact copyable command", async () => {
  const { AUTH_REQUIRED_MARKER, AUTH_RENEWAL_COMMAND } = await import("../auth-failure.mjs");
  const lines = [];
  let interrupts = 0;
  const reporter = new TeardownReporter({ write: line => lines.push(line), interrupt: () => interrupts++ });
  assert.equal(typeof reporter.onStdOut, "function");
  reporter.onStdOut(Buffer.from("ordinary timeout HTTP 502\n"));
  assert.equal(interrupts, 0);
  reporter.onStdOut(Buffer.from(AUTH_REQUIRED_MARKER.slice(0, 8)));
  reporter.onStdOut(Buffer.from(AUTH_REQUIRED_MARKER.slice(8)));
  reporter.onStdOut(AUTH_REQUIRED_MARKER);
  assert.equal(interrupts, 1);
  assert.ok(lines.includes(AUTH_RENEWAL_COMMAND));
  assert.doesNotMatch(lines.join("\n"), /umask|private-marker/);
});

test("missing auth stops before workload and prints the copyable renewal command", async () => {
  const { AUTH_RENEWAL_COMMAND } = await import("../auth-failure.mjs");
  const lines = [];
  const gate = runInNewContext(`${runnerFunction("enforceClusterGate")}\nenforceClusterGate`, {
    useMediaApi: true, PANDA_AUTH_FILE: "/fixture/missing.json", STABLE_UNTIL: "2026-02-15", existsSync: () => false,
    AUTH_RENEWAL_COMMAND, console: { error: line => lines.push(line), log() {} },
    process: { exit: code => { throw new Error(`exit ${code}`); } },
  });
  assert.throws(gate, /exit 2/);
  assert.ok(lines.includes(AUTH_RENEWAL_COMMAND));
});

test("perf authentication guard observes existing responses, reports safely and disposes its listener", async () => {
  const { AUTH_REQUIRED_MARKER, createPerfAuthGuard } = await import("../auth-failure.mjs");
  assert.equal(typeof createPerfAuthGuard, "function");
  const page = new EventEmitter();
  const notices = [];
  const guard = createPerfAuthGuard(page, { appBaseUrl: "https://app.fixture.invalid", mediaApiBaseUrl: "https://api.fixture.invalid" }, marker => notices.push(marker));
  const response = status => ({ url: () => "https://api.fixture.invalid/images?private-marker=1", status: () => status, headers: () => ({}), request: () => ({ isNavigationRequest: () => false }) });
  try {
    page.emit("response", response(502));
    guard.assertAuthenticated();
    assert.deepEqual(notices, []);
    page.emit("response", response(419));
    page.emit("response", response(401));
    assert.deepEqual(notices, [AUTH_REQUIRED_MARKER]);
    assert.throws(() => guard.assertAuthenticated(), /Perf authentication required/);
    assert.doesNotMatch(notices.join(""), /private-marker|fixture\.invalid/);
  } finally {
    guard.dispose();
  }
  assert.equal(page.listenerCount("response"), 0);
});

test("perf auth fixture is installed only for authenticated runs and cleans up on failure", async () => {
  const { createPerfAuthGuard } = await import("../auth-failure.mjs");
  const source = readFileSync(new URL("../helpers.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source.slice(source.indexOf("export const test ="), source.indexOf("export function isMediaApiUrl")), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  for (const authenticated of [false, true]) {
    const page = new EventEmitter();
    const notices = [];
    const context = {
      exports: {}, sharedTest: { extend: fixtures => fixtures }, createPerfAuthGuard,
      DEPLOYED_TEST_MEDIA_API_BASE_URL: "https://api.fixture.invalid",
      process: { env: authenticated ? { KUPUA_PERF_AUTH_FILE: "/private-state", KUPUA_PERF_BASE_URL: "https://app.fixture.invalid" } : {} },
      console: { log: line => notices.push(line) },
    };
    runInNewContext(code, context);
    assert.ok(context.exports.test.perfAuth);
    const run = () => context.exports.test.perfAuth[0]({ kupua: { page } }, async guard => {
      if (!authenticated) assert.equal(guard, null);
      else page.emit("response", { url: () => "https://api.fixture.invalid/images", status: () => 401, headers: () => ({}), request: () => ({ isNavigationRequest: () => false }) });
    });
    if (authenticated) await assert.rejects(run, /Perf authentication required/);
    else await run();
    assert.equal(page.listenerCount("response"), 0);
    assert.equal(notices.length, authenticated ? 1 : 0);
  }
});

test("actual Playwright reporter interrupts an auth-blocked synthetic run before the next test", async () => {
  const { AUTH_REQUIRED_MARKER, AUTH_RENEWAL_COMMAND, createPerfAuthOutputFilter } = await import("../auth-failure.mjs");
  const require = createRequire(import.meta.url);
  const folder = mkdtempSync(join(tmpdir(), "kupua-auth-stop-"));
  try {
    const spec = `const { test } = require(${JSON.stringify(require.resolve("@playwright/test"))});\ntest('auth blocked', async () => { console.log(${JSON.stringify(AUTH_REQUIRED_MARKER)}); await new Promise(() => {}); });\ntest('must not run', async () => { console.log('UNEXPECTED_SECOND_TEST'); });\n`;
    writeFileSync(join(folder, "auth-stop.spec.cjs"), spec);
    writeFileSync(join(folder, "playwright.config.cjs"), `module.exports = ${JSON.stringify({
      testDir: folder, testMatch: "auth-stop.spec.cjs", outputDir: join(folder, "results"),
      timeout: 2000, globalTimeout: 5000, retries: 0, workers: 1,
      reporter: [["list"], [fileURLToPath(new URL("../teardown-reporter.mjs", import.meta.url))]],
    })};\n`);
    const result = spawnSync(process.execPath, [require.resolve("@playwright/test/cli"), "test", `--config=${join(folder, "playwright.config.cjs")}`], { encoding: "utf8", timeout: 10000 });
    assert.ifError(result.error);
    assert.notEqual(result.status, 0);
    assert.ok(result.stdout.includes(AUTH_RENEWAL_COMMAND), result.stderr);
    assert.doesNotMatch(result.stdout + result.stderr, /UNEXPECTED_SECOND_TEST/);
    const campaignOutput = createPerfAuthOutputFilter();
    const visible = [campaignOutput.push(result.stdout, "stdout"), campaignOutput.push(result.stderr, "stderr")];
    const report = runInNewContext(`${runnerFunction("reportCampaignError")}\nreportCampaignError`, {
      campaignOutput, AUTH_RENEWAL_COMMAND, finishCampaignOutput() {}, appendRunReport() {},
      console: { error: text => visible.push(text) },
      process: { exit: code => { throw new Error(`exit ${code}`); } },
    });
    assert.throws(() => report(new Error("Playwright exited with code 130")), /exit 2/);
    assert.equal(visible.join("\n").trim().split("\n").at(-1), AUTH_RENEWAL_COMMAND);
    assert.doesNotMatch(visible.join("\n"), /Test was interrupted|Error:|code 130|at assertAuthenticated/);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test("auth output filtering drops interruption noise without losing prior progress or ordinary errors", async () => {
  const { AUTH_REQUIRED_MARKER, createPerfAuthOutputFilter } = await import("../auth-failure.mjs");
  assert.equal(typeof createPerfAuthOutputFilter, "function");
  for (const cut of [1, 8, AUTH_REQUIRED_MARKER.length - 1, AUTH_REQUIRED_MARKER.length]) {
    const filter = createPerfAuthOutputFilter();
    let output = filter.push("normal progress\n", "stdout");
    output += filter.push(AUTH_REQUIRED_MARKER.slice(0, cut), "stdout");
    output += filter.push(`${AUTH_REQUIRED_MARKER.slice(cut)}\nError: page.waitForFunction: Test ended.`, "stdout");
    output += filter.push("Error: Playwright exited with code 130", "stderr");
    output += filter.flush("stdout") + filter.flush("stderr");
    assert.equal(output, "normal progress\n");
    assert.equal(filter.authRequired, true);
  }
  const ordinary = createPerfAuthOutputFilter();
  const output = ordinary.push("real failure [", "stderr") + ordinary.flush("stderr");
  assert.equal(output, "real failure [");
  assert.equal(ordinary.authRequired, false);
});

test("auth output filter preserves split UTF-8 independently in both streams", async () => {
  const { createPerfAuthOutputFilter } = await import("../auth-failure.mjs");
  const progress = Buffer.from("progress \u2192 \u00e9\n");
  const diagnostic = Buffer.from("failure \u2014 details\n");
  for (let cut = 1; cut < progress.length; cut++) {
    const filter = createPerfAuthOutputFilter();
    let stdout = filter.push(progress.subarray(0, cut), "stdout");
    let stderr = filter.push(diagnostic.subarray(0, 10), "stderr");
    stdout += filter.push(progress.subarray(cut), "stdout");
    stderr += filter.push(diagnostic.subarray(10), "stderr");
    assert.equal(stdout + filter.flush("stdout"), progress.toString());
    assert.equal(stderr + filter.flush("stderr"), diagnostic.toString());
    assert.equal(filter.authRequired, false);
  }
});

test("campaign auth failure ends with the renewal command while ordinary failures retain their stack", async () => {
  const { AUTH_RENEWAL_COMMAND } = await import("../auth-failure.mjs");
  for (const authRequired of [false, true]) {
    const printed = [];
    const reported = [];
    const error = new Error("synthetic unrelated failure");
    const report = runInNewContext(`${runnerFunction("reportCampaignError")}\nreportCampaignError`, {
      campaignOutput: { authRequired }, AUTH_RENEWAL_COMMAND,
      finishCampaignOutput() {},
      console: { error: value => printed.push(value) }, appendRunReport: text => reported.push(text),
      process: { exit: code => { throw new Error(`exit ${code}`); } },
    });
    assert.throws(() => report(error), new RegExp(`exit ${authRequired ? 2 : 1}`));
    if (authRequired) {
      assert.equal(String(printed[0]).trim().split("\n").at(-1), AUTH_RENEWAL_COMMAND);
      assert.doesNotMatch(String(printed[0]), /synthetic unrelated failure|at report|code 130/);
      assert.ok(reported[0].includes(AUTH_RENEWAL_COMMAND));
    } else {
      assert.equal(printed[0], error);
      assert.ok(reported[0].includes(error.stack));
    }
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

function shortScenario(id) {
  const filename = join(fileURLToPath(new URL("..", import.meta.url)), "perceived-short.spec.ts");
  const parsed = ts.createSourceFile(filename, readFileSync(filename, "utf8"), ts.ScriptTarget.ES2022, true);
  let callback;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(parsed) === "test"
      && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text.startsWith(`${id}:`)) {
      callback = node.arguments[1];
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  assert.ok(callback, `${id} scenario must exist`);
  return { parsed, callback };
}

function queryCompletionWait({ startAt = 300, readyAt = 1_500, unrelatedReadyAt = Infinity, expectedQuery = true } = {}) {
  const { parsed, callback } = shortScenario("PP8");
  let waitCall;
  function visit(node) {
    if (!waitCall && ts.isCallExpression(node)
      && node.expression.getText(parsed) === "kupua.page.waitForFunction") waitCall = node;
    ts.forEachChild(node, visit);
  }
  visit(callback);
  assert.ok(waitCall);
  const { outputText } = ts.transpileModule(`(async () => { await ${waitCall.getText(parsed)}; })()`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  });
  let now = 0;
  const entries = [];
  const add = (phase, interactionId, time) => {
    if (now >= time && !entries.some(entry => entry.phase === phase && entry.interactionId === interactionId)) {
      entries.push({ action: "search", phase, interactionId, t: time });
    }
  };
  const state = () => ({
    loading: now >= startAt && now < readyAt,
    error: null, sortAroundFocusStatus: null, aggLoading: false,
    params: { query: now >= startAt && expectedQuery ? "sport" : undefined },
  });
  return {
    run: () => runInNewContext(outputText, {
      window: { __perceivedTrace__: entries, __kupua_store__: { getState: state } },
      kupua: { page: { waitForFunction: async (predicate, arg, { timeout }) => {
        while (now < timeout) {
          add("t_0", "fixture-search", startAt);
          add("t_store_ready", "fixture-search", readyAt);
          add("t_store_ready", "unrelated-search", unrelatedReadyAt);
          if (predicate(arg)) return;
          now += 16;
        }
        throw new Error("synthetic readiness deadline");
      } } },
    }),
    elapsed: () => now,
  };
}

for (const [condition, options] of [
  ["delayed startup", {}],
  ["completion between polls", { startAt: 5, readyAt: 8 }],
  ["already-completed search", { startAt: 0, readyAt: 0 }],
  ["unrelated completion", { unrelatedReadyAt: 0 }],
]) {
  test(`PP8 waits for correlated search completion with ${condition}`, async () => {
    const fixture = queryCompletionWait(options);
    await fixture.run();
    const readyAt = options.readyAt ?? 1_500;
    assert.ok(fixture.elapsed() >= readyAt);
    assert.ok(fixture.elapsed() < readyAt + 16);
  });
}

for (const [condition, options] of [
  ["missing completion", { readyAt: Infinity, unrelatedReadyAt: 0 }],
  ["missing start", { startAt: Infinity, readyAt: 0 }],
  ["wrong query", { expectedQuery: false }],
]) {
  test(`PP8 rejects ${condition} instead of accepting old idle state`, async () => {
    await assert.rejects(queryCompletionWait(options).run(), /synthetic readiness deadline/);
  });
}

test("PP4 uses the action-aware shared direction helper", () => {
  const { parsed, callback } = shortScenario("PP4");
  assert.match(callback.getText(parsed), /await kupua\.toggleSortDirection\(\)/);
});

for (const [condition, startAt, readyAt] of [
  ["delayed startup", 500, 1_500],
  ["completion between polls", 5, 8],
  ["immediate completion", 0, 0],
]) {
  test(`shared direction helper handles ${condition} without requiring a loading pulse`, async () => {
    const filename = join(fileURLToPath(new URL("..", import.meta.url)), "../e2e/shared/helpers.ts");
    const parsed = ts.createSourceFile(filename, readFileSync(filename, "utf8"), ts.ScriptTarget.ES2022, true);
    const declaration = parsed.statements.find(node => ts.isClassDeclaration(node)
      && node.members.some(member => member.name?.getText(parsed) === "toggleSortDirection"));
    assert.ok(declaration);
    const method = declaration.members.find(member => member.name?.getText(parsed) === "toggleSortDirection");
    const { outputText } = ts.transpileModule(`(class { ${method.getText(parsed)} })`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    });
    let now = 0;
    let clicked = false;
    const state = () => ({
      params: { orderBy: clicked && now >= startAt ? "uploadTime" : "-uploadTime" },
      loading: clicked && now >= startAt && now < readyAt,
      sortAroundFocusStatus: null, results: [{}],
    });
    const Helper = runInNewContext(outputText, { window: { __kupua_store__: { getState: state } } });
    const helper = new Helper();
    helper.page = {
      evaluate: async callback => callback(),
      locator: () => ({ click: async () => { clicked = true; } }),
      waitForFunction: async (predicate, arg) => {
        while (!predicate(arg)) {
          now += 16;
          assert.ok(now < 30_000, "direction helper must complete");
        }
      },
    };
    await helper.toggleSortDirection();
    assert.ok(now >= readyAt && now < readyAt + 16);
  });
}

test("repaired short scenarios version their observation boundary without comparing old samples", () => {
  const comparable = runInNewContext(`${dashboardFunction("perceived-graphs.html", "metricsComparable")}\nmetricsComparable`, {
    environmentKey: () => "fixture-environment",
  });
  for (const id of ["PP3", "PP4", "PP8"]) {
    const { parsed, callback } = shortScenario(id);
    assert.match(callback.getText(parsed), /scenarioRevision: 3/);
    const revised = { scenarioRevision: 3 };
    assert.equal(comparable({}, revised, {}, revised), true);
    assert.equal(comparable({}, revised, {}, { scenarioRevision: 2 }), false);
  }
});

const shortVisualObservers = [
  ["PP2", "appendNoFocusSortVisualPhases", "sort-no-focus"],
  ["PP4", "appendFocusedSortVisualPhases", "sort-around-focus"],
  ["PP5", "appendFilterVisualPhases", "filter-toggle"],
  ["PP6", "appendDensityVisualPhases", "density-swap"],
  ["PP7c", "appendBufferScrollVisualPhases", "scrubber-scroll"],
  ["PP8", "appendQueryVisualPhases", "search"],
  ["PP9", "appendChipRemovalVisualPhases", "chip-remove"],
  ["JA1", "navigateAndMeasure", "navigation-search"],
  ["JA2", "appendDetailVisualPhases", "open-detail"],
  ["JB4", "appendIndexedScrollVisualPhases", "scrubber-scroll"],
  ["JB5", "appendFullscreenExitVisualPhases", "fullscreen-exit"],
];

function createShortVisualHarness(name, {
  refreshRate = 120,
  readyAt = 1_500,
  startsAt = 0,
  storeReadyAt = readyAt,
  unrelatedCompletion = false,
  movingUntil = 0,
  missingContainer = false,
  missingItem = false,
  stateMissing = false,
  stateError = false,
  sorting = false,
  wrongContext = false,
  focusCleared = false,
} = {}) {
  const isJourney = ["navigateAndMeasure", "appendDetailVisualPhases", "appendIndexedScrollVisualPhases", "appendFullscreenExitVisualPhases"].includes(name);
  const outputText = compiledFunction(isJourney ? "perceived-long.spec.ts" : "perceived-short.spec.ts", name);
  let now = 0;
  const entries = [];
  const stableUntil = "2026-02-15";
  const isFocused = name === "appendFocusedSortVisualPhases";
  let completionEmitted = false;
  if (isFocused && unrelatedCompletion) entries.push({
    action: "sort-around-focus", phase: "t_store_ready", t: 0, interactionId: "unrelated-interaction",
  });
  const isDensity = name === "appendDensityVisualPhases";
  const isFilter = name === "appendFilterVisualPhases";
  const isQuery = name === "appendQueryVisualPhases";
  const isChip = name === "appendChipRemovalVisualPhases";
  const isDetail = name === "appendDetailVisualPhases";
  const isNavigation = name === "navigateAndMeasure";
  const isIndexed = name === "appendIndexedScrollVisualPhases";
  const total = isIndexed ? 10_001 : 101;
  let evictGeneration = 0;
  const rect = { top: 0, left: 0, width: 600, height: 400, bottom: 400 };
  const item = {
    getBoundingClientRect: () => ({ ...rect, left: now < movingUntil ? now : 0 }),
    getAttribute: () => "private-fixture-id",
    get complete() { return now >= readyAt; },
    naturalWidth: 600,
    naturalHeight: 400,
  };
  const container = {
    scrollTop: 0,
    scrollHeight: 1_400,
    clientHeight: 400,
    dispatchEvent: () => {},
    getBoundingClientRect: () => rect,
    getAttribute: () => "private-fixture-id",
    querySelector: () => missingItem ? null : item,
    querySelectorAll: () => missingItem ? [] : [item],
  };
  const observe = runInNewContext(`${outputText}\n${name}`, {
    URL,
    Event,
    Date: { now: () => now },
    CSS: { escape: value => value },
    STABLE_UNTIL: stableUntil,
    captureSuccessfulDataRoutes: () => () => ["client-only"],
    location: { origin: "https://fixture.invalid", href: `https://fixture.invalid/search?nonFree=true&until=${stableUntil}${isDetail ? "&image=private-fixture-id" : ""}` },
    performance: { now: () => now, timeOrigin: 0, getEntriesByType: () => [] },
    requestAnimationFrame: callback => {
      now += 1_000 / refreshRate;
      if (isFocused && !completionEmitted && now >= storeReadyAt) {
        completionEmitted = true;
        entries.push({ action: "sort-around-focus", phase: "t_store_ready", t: now, interactionId: "fixture-interaction" });
      }
      queueMicrotask(() => callback(now));
    },
    document: {
      fullscreenElement: null,
      querySelector: selector => {
        if (selector === '[data-fullscreen-preview]') return { getAttribute: () => wrongContext ? "active" : "inactive" };
        if (selector === '[data-detail-image-id]') return missingContainer ? null : container;
        if (selector === 'label input[type="checkbox"]') return { checked: !wrongContext };
        if (selector === "cql-input") return { shadowRoot: { querySelectorAll: () => wrongContext ? [{}] : [] } };
        if (selector === '[data-testid="scrubber-track"]') {
          return { getAttribute: attribute => attribute === "data-scrubber-mode"
            ? (wrongContext ? "seek" : isIndexed ? "indexed" : "buffer")
            : now < movingUntil ? String(now) : "50" };
        }
        if (selector.startsWith('[data-image-id=')) return missingItem ? null : item;
        if (missingContainer) return null;
        if (isDensity) {
          if (selector === '[aria-label="Image results grid"]') return now < readyAt || wrongContext ? container : null;
          return now >= readyAt ? container : null;
        }
        return selector === '[aria-label="Image results grid"]' ? container : null;
      },
    },
    window: {
      __perceivedTrace__: entries,
      __kupua_getSearchLifecycle__: () => ({ started: 1, settled: now >= readyAt ? 1 : 0, query: wrongContext ? "private query" : "fixture-query" }),
      __kupua_store__: {
        getState: () => stateMissing ? null : ({
          loading: now >= startsAt && now < readyAt,
          error: stateError ? new Error("private fixture error") : null,
          sortAroundFocusStatus: sorting ? "pending" : null,
          params: {
            orderBy: wrongContext ? "height" : "width",
            nonFree: isFilter ? (wrongContext ? "true" : undefined) : "true",
            query: isQuery ? (wrongContext ? "private query" : "sport") : undefined,
            until: stableUntil,
          },
          total,
          focusedImageId: isFocused && focusCleared ? null
            : isFocused && wrongContext ? "wrong-fixture-id" : "private-fixture-id",
          results: [item],
          bufferOffset: 10,
          _forwardEvictGeneration: evictGeneration,
          _lastForwardEvictCount: 10,
          _extendForwardInFlight: false,
          _extendBackwardInFlight: false,
          extendForward: async () => { evictGeneration++; },
        }),
      },
    },
  });
  const kupua = {
    initializeDensity: async () => {},
    getStoreState: async () => ({ forwardEvictGeneration: 0 }),
    page: {
      goto: async () => {},
      evaluate: (callback, args) => callback(args),
      waitForFunction: async () => {},
    },
  };
  return {
    run: async () => {
      if (isNavigation) {
        const result = await observe(kupua, "fixture-query", "buffer", "JA1");
        entries.push(...result.entries.filter(entry => entry.phase.startsWith("t_first") || entry.phase === "t_visual_settled")
          .map(entry => ({ ...entry, t: entry.epochMs })));
        return result;
      }
      if (isFocused) return observe(kupua, "fixture-interaction", "PP4", "private-fixture-id");
      return observe(kupua, "fixture-interaction",
        isChip ? { imageId: "private-fixture-id", top: 0, viewportHeight: 400 } : 50);
    },
    get entries() { return entries.filter(entry => entry.phase !== "t_store_ready"); },
    elapsed: () => now,
  };
}

for (const [condition, options] of [
  ["old idle state before search starts", { startsAt: 500 }],
  ["an unrelated interaction completing first", { startsAt: 500, unrelatedCompletion: true }],
  ["store idle before correlated completion", { readyAt: 0, storeReadyAt: 1_500 }],
]) {
  const refreshRate = 120;
  test(`focused-sort observer rejects ${condition} at ${refreshRate} Hz`, async () => {
    const fixture = createShortVisualHarness("appendFocusedSortVisualPhases", { refreshRate, ...options });
    await fixture.run();
    assert.ok(fixture.entries[0].t >= 1_500);
    assert.ok(fixture.elapsed() < 1_500 + 3_000 / refreshRate);
  });
}

test("focused-sort observer never emits visual phases without its correlated completion", async () => {
  const fixture = createShortVisualHarness("appendFocusedSortVisualPhases", {
    readyAt: 0, storeReadyAt: Infinity, unrelatedCompletion: true,
  });
  await assert.rejects(fixture.run(), /PP4.*within 30000ms:.*"storeReady":false/);
  assert.equal(fixture.entries.length, 0);
});

for (const refreshRate of [60, 240]) {
  test(`focused-sort observer reports the store's focus fallback as degraded without waiting at ${refreshRate} Hz`, async () => {
    const fixture = createShortVisualHarness("appendFocusedSortVisualPhases", { refreshRate, focusCleared: true });
    const result = await fixture.run();
    assert.deepEqual(JSON.parse(JSON.stringify(result)), { degraded: { focus: "cleared" } });
    assert.equal(fixture.entries.length, 0);
    assert.ok(fixture.elapsed() >= 1_500);
    assert.ok(fixture.elapsed() < 1_500 + 3_000 / refreshRate);
  });
}

for (const [condition, options, diagnostic] of [
  ["before its correlated completion", { readyAt: 0, storeReadyAt: Infinity, unrelatedCompletion: true }, /"storeReady":false/],
  ["while the sort is still pending", { readyAt: 0, sorting: true }, /"sorting":true/],
  ["with a store error", { readyAt: 0, stateError: true }, /"error":true/],
]) {
  test(`focused-sort observer does not report cleared focus as degraded ${condition}`, async () => {
    const fixture = createShortVisualHarness("appendFocusedSortVisualPhases", { ...options, focusCleared: true });
    await assert.rejects(fixture.run(), error => {
      assert.match(error.message, /PP4 focused cell did not become visibly stable within 30000ms:/);
      assert.match(error.message, diagnostic);
      return true;
    });
    assert.equal(fixture.entries.length, 0);
  });
}

for (const [scenario, name, action] of shortVisualObservers) {
  for (const refreshRate of [60, 240]) {
    test(`${scenario} short observer waits for delayed readiness at ${refreshRate} Hz`, async () => {
      const fixture = createShortVisualHarness(name, { refreshRate });
      const result = await fixture.run();
      assert.equal(result.settledTotal, scenario === "JB4" ? 10_001 : 101);
      assert.equal(result.resultRegime, scenario === "JB4" ? "indexed" : "buffer");
      assert.deepEqual(fixture.entries.map(entry => entry.phase), ["t_first_visible_frame", "t_visual_settled"]);
      assert.ok(fixture.entries.every(entry => entry.action === action && entry.interactionId === (scenario === "JA1" ? "ja1-navigation" : "fixture-interaction")));
      assert.ok(fixture.entries[0].t >= 1_500);
      assert.ok(fixture.entries[1].t > fixture.entries[0].t);
      assert.ok(fixture.elapsed() < 1_500 + 3_000 / refreshRate);
    });
  }

  test(`${scenario} short observer adds no wait after two ready frames`, async () => {
    const fixture = createShortVisualHarness(name, { readyAt: 0 });
    await fixture.run();
    assert.ok(fixture.elapsed() < 20);
  });

  test(`${scenario} short observer waits for geometry to stop moving`, async () => {
    const fixture = createShortVisualHarness(name, { readyAt: 0, movingUntil: 2_000 });
    await fixture.run();
    assert.ok(fixture.entries[0].t >= 2_000);
  });

  for (const [condition, options, diagnostic] of [
    ["late readiness", { readyAt: 31_000 }, scenario === "PP6" ? /"tablePresent":false/ : scenario === "JA2" ? /"imageReady":false/ : /"loading":true/],
    ["missing container", { missingContainer: true }, /"(?:container|table|detail)Present":false/],
    ["missing item", { missingItem: true }, /"(?:item|row|image|focused)Present":false/],
    ...(scenario === "JA2" ? [] : [["wrong context", { wrongContext: true }, /"contextMatches":false/]]),
    ["moving geometry", { movingUntil: Infinity }, /"geometryStable":false/],
    ...(["PP6", "JA1", "JA2"].includes(scenario) ? [] : [
      ["missing store", { stateMissing: true }, /"storePresent":false/],
      ["store error", { stateError: true }, /"error":true/],
    ]),
    ...(["PP2", "PP4", "PP5", "PP8", "PP9"].includes(scenario) ? [
      ["pending sort", { sorting: true }, /"sorting":true/],
    ] : []),
  ]) {
    test(`${scenario} short observer rejects ${condition} with sanitized diagnostics`, async () => {
      const fixture = createShortVisualHarness(name, { readyAt: 0, ...options });
      await assert.rejects(fixture.run(), error => {
        assert.ok(error.message.startsWith(scenario));
        assert.match(error.message, /within 30000ms:/);
        assert.match(error.message, diagnostic);
        assert.doesNotMatch(error.message, /private fixture error|private query|private-fixture-id|fixture\.invalid/);
        return true;
      });
      assert.equal(fixture.entries.length, 0);
      assert.ok(fixture.elapsed() >= 30_000 && fixture.elapsed() < 30_010);
    });
  }
}

for (const name of ["settleMidBufferSetup", "settlePostEvictionSetup"]) {
  for (const refreshRate of [60, 240]) {
    test(`${name} waits for delayed setup readiness at ${refreshRate} Hz`, async () => {
      const fixture = createShortVisualHarness(name, { refreshRate });
      const result = await fixture.run();
      assert.equal(result.setupGlobalPosition, 50);
      assert.equal(result.setupBufferOffset, 10);
      assert.ok(fixture.elapsed() >= 1_500);
      assert.ok(fixture.elapsed() < 1_500 + 3_000 / refreshRate);
    });
  }
  for (const [condition, options, diagnostic] of [
    ["unfinished loading", { readyAt: 31_000 }, /"loading":true/],
    ["moving position", { movingUntil: Infinity }, /"positionStable":false/],
  ]) {
    test(`${name} rejects ${condition} at its elapsed deadline`, async () => {
      const fixture = createShortVisualHarness(name, options);
      await assert.rejects(fixture.run(), error => {
        assert.match(error.message, /within 30000ms:/);
        assert.match(error.message, diagnostic);
        return true;
      });
      assert.ok(fixture.elapsed() >= 30_000 && fixture.elapsed() < 30_010);
    });
  }
}

function createSelectionPanelHarness({ refreshRate = 120, readyAt = 1_500, moving = false, missingPanel = false } = {}) {
  const filename = join(fileURLToPath(new URL("..", import.meta.url)), "perf.spec.ts");
  const source = readFileSync(filename, "utf8");
  const parsed = ts.createSourceFile(filename, source, ts.ScriptTarget.ES2022, true);
  let callback;
  const findObserver = node => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === "evaluate"
      && node.arguments[0]?.getText(parsed).includes("let previousGeometry")) {
      callback = node.arguments[0];
    }
    ts.forEachChild(node, findObserver);
  };
  findObserver(parsed);
  assert.ok(callback);
  const { outputText } = ts.transpileModule(`const observe = ${callback.getText(parsed)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  });
  let now = 0;
  let unsubscribed = false;
  const selectedIds = new Set(["private-first", "private-second"]);
  const globalObject = {
    __selectionRangeProbe__: {
      timings: { actionStart: 0, selectionPublished: 0, metadataSettled: 0, reconcileSettled: 0, idleCallbacks: [] },
      unsubscribe: () => { unsubscribed = true; },
    },
    __kupua_selection_store__: {
      getState: () => ({
        selectedIds,
        pendingFetchIds: now < readyAt ? selectedIds : new Set(),
        isReconciling: false,
        reconciledView: {},
        metadataCache: selectedIds,
        rangeWalkTime: null,
      }),
    },
  };
  const observe = runInNewContext(`${outputText}\nobserve`, {
    window: globalObject,
    performance: { now: () => now },
    requestAnimationFrame: next => {
      now += 1_000 / refreshRate;
      queueMicrotask(() => next(now));
    },
    document: { querySelector: () => missingPanel ? null : {
      nextElementSibling: {
        scrollHeight: 400,
        getBoundingClientRect: () => ({ width: moving ? now : 300, height: 400 }),
      },
    } },
  });
  return {
    run: () => observe({ label: "selection-fixture", expectedCount: 2 }),
    elapsed: () => now,
    cleanedUp: () => unsubscribed && !globalObject.__selectionRangeProbe__,
  };
}

for (const refreshRate of [60, 240]) {
  test(`selection panel waits for delayed readiness at ${refreshRate} Hz`, async () => {
    const fixture = createSelectionPanelHarness({ refreshRate });
    const result = await fixture.run();
    assert.equal(result.selectedCount, 2);
    assert.ok(result.selectionVisualSettledMs >= 1_500);
    assert.ok(result.selectionVisualSettledMs < 1_500 + 3_000 / refreshRate);
    assert.equal(fixture.cleanedUp(), true);
  });
}

for (const options of [{ readyAt: 31_000 }, { moving: true }, { missingPanel: true }]) {
  test(`selection panel rejects unsettled state ${JSON.stringify(options)}`, async () => {
    const fixture = createSelectionPanelHarness(options);
    await assert.rejects(fixture.run(), error => {
      assert.match(error.message, /selection-fixture Details panel did not become visibly stable within 30000ms:/);
      assert.doesNotMatch(error.message, /private-first|private-second/);
      return true;
    });
    assert.ok(fixture.elapsed() >= 30_000 && fixture.elapsed() < 30_010);
  });
}

test("performance readiness loops cannot use frame-count deadlines", () => {
  for (const filename of ["perceived-short.spec.ts", "perceived-long.spec.ts", "perf.spec.ts"]) {
    const source = readFileSync(join(fileURLToPath(new URL("..", import.meta.url)), filename), "utf8");
    const parsed = ts.createSourceFile(filename, source, ts.ScriptTarget.ES2022, true);
    const inspectBrowserCallback = node => {
      if (ts.isForStatement(node) && node.statement.getText(parsed).includes("requestAnimationFrame")) {
        assert.fail(`${filename}: frame-count readiness loop: ${node.condition?.getText(parsed)}`);
      }
      ts.forEachChild(node, inspectBrowserCallback);
    };
    const inspect = node => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
        && ["evaluate", "evaluateHandle"].includes(node.expression.name.text)
        && node.arguments[0]) {
        inspectBrowserCallback(node.arguments[0]);
      }
      ts.forEachChild(node, inspect);
    };
    inspect(parsed);
  }
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
  const outputText = compiledFunction("perceived-short.spec.ts", "appendHomeVisualPhases");
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

test("P18/P19 route ownership includes only the selection metadata request in either mode", () => {
  const source = readFileSync(join(fileURLToPath(new URL("..", import.meta.url)), "perf.spec.ts"), "utf8");
  assert.match(source, /const isSelectionMetadataPath = \(path: string\) =>/);
  assert.match(source, /\(path\.startsWith\("\/es\/"\) && path\.endsWith\("\/_mget"\)\)[\s\S]*path === "\/api\/images\/mget"[\s\S]*path === "\/images\/mget"/);
  assert.match(source, /captureSuccessfulDataRoutes\(\s*kupua,\s*isSelectionMetadataPath/);
  assert.equal(source.match(/expect\(routes\)\.toEqual\(\[await selectionMetadataRoute\(kupua\)\]\)/g)?.length, 2);
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

test("optional aggregate fields must be present in every repetition or none", () => {
  assert.deepEqual(requireConsistentPresence([{ value: 10 }, { value: 20 }], "value", "P14a"), [10, 20]);
  assert.deepEqual(requireConsistentPresence([{}, {}], "value", "P14a"), []);
  assert.throws(
    () => requireConsistentPresence([{ value: 10 }, {}], "value", "P14a"),
    /P14a changed value presence across repetitions/,
  );
  assert.throws(
    () => requireConsistentPresence([{ routes: ["direct-es"] }, { routes: null }], "routes", "PP3"),
    /PP3 changed routes presence across repetitions/,
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
    "P5a", "P5b", "P5c", "P13a", "P13b", "P13c",
  ]);
});

test("selects one isolated P14 cadence by title", () => {
  assert.deepEqual(expectedJankMetricIds("P14b"), ["P14b"]);
});

test("manifests account for all 57 maintained unique metric IDs", () => {
  const jankIds = expectedJankMetricIds("");

  assert.equal(jankIds.length, 34);
  assert.equal(new Set(jankIds).size, 34);
  assert.equal(PERCEIVED_METRIC_IDS.short.length, 15);
  assert.equal(new Set(PERCEIVED_METRIC_IDS.short).size, 15);
  assert.equal(PERCEIVED_METRIC_IDS.long.length, 8);
  assert.equal(new Set(PERCEIVED_METRIC_IDS.long).size, 8);
});

test("image-read aggregation retains route, cache condition and zero lookup evidence", () => {
  const standalone = {
    scenarioRevision: 1, cacheClass: "nonresident-metadata-warm-media",
    completionBoundary: "singleton-response-and-decoded-stable-detail",
    routes: ["direct-es"], imageLookupCount: 1,
    detailLookupMs: 40, detailMetadataReadyMs: 60, detailImageReadyMs: 80,
  };
  const aggregated = aggregateScenarioFields([
    standalone, { ...standalone, detailLookupMs: 60, detailMetadataReadyMs: 80, detailImageReadyMs: 100 },
  ], "P13c", JANK_SCENARIO_AGGREGATION.P13c);
  assert.equal(aggregated.detailLookupMs, 50);
  assert.equal(aggregated.detailMetadataReadyMs, 70);
  assert.equal(aggregated.detailImageReadyMs, 90);
  assert.deepEqual(aggregated.routes, ["direct-es"]);
  assert.throws(() => aggregateScenarioFields([
    standalone, { ...standalone, routes: ["media-api"] },
  ], "P13c", JANK_SCENARIO_AGGREGATION.P13c), /changed routes/);
  for (const id of ["P14a", "P14b", "P14c", "P14d"]) {
    const valid = { lookupGuardRevision: 1, imageLookupCount: 0 };
    assert.deepEqual(aggregateScenarioFields([valid, valid], id, JANK_SCENARIO_AGGREGATION[id]), valid);
    assert.throws(() => aggregateScenarioFields([valid, {}], id, JANK_SCENARIO_AGGREGATION[id]), /missing/);
  }
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

test("rejects a media-api topology that differs from the requested topology", () => {
  assert.throws(
    () => assertEnvironmentMatches(
      { dataMode: "media-api", apiTopology: "local" },
      { dataMode: "media-api", apiTopology: "deployed-test" },
    ),
    /API topology.*requested deployed-test.*observed local/i,
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
        P13a: { maxFrame: 65, scenarioRevision: 3 },
        P15b: { maxFrame: 75, scenarioRevision: 3 },
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
  assert.deepEqual(Object.keys(result.history.entries[1].metrics), ["P1", "P7", "P13a", "P15b"]);
  assert.equal(result.history.entries[1].metrics.P1.scenarioRevision, 2);
  assert.equal(result.history.entries[1].metrics.P13a.scenarioRevision, 3);
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

test("rejects non-finite correlated phase timestamps", () => {
  const base = {
    id: "PP4",
    label: "focused direction",
    action: "sort-around-focus",
    requiredPhases: ["t_store_ready"],
  };

  for (const [phase, timestamp] of [
    ["t_store_ready", Number.NaN],
    ["t_status_visible", Number.POSITIVE_INFINITY],
  ]) {
    assert.throws(
      () => computeCorrelatedMetrics({
        ...base,
        entries: [
          { action: "sort-around-focus", phase: "t_0", t: 10, interactionId: "sort-1" },
          { action: "sort-around-focus", phase: "t_store_ready", t: 20, interactionId: "sort-1" },
          ...(phase === "t_store_ready" ? [] : [
            { action: "sort-around-focus", phase, t: timestamp, interactionId: "sort-1" },
          ]),
        ].map((entry) => entry.phase === phase ? { ...entry, t: timestamp } : entry),
      }),
      new RegExp(`PP4.*${phase}.*finite`, "i"),
    );
  }
});

test("rejects negative correlated elapsed intervals", () => {
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
        { action: "sort-around-focus", phase: "t_store_ready", t: 9, interactionId: "sort-1" },
      ],
    }),
    /PP4.*t_store_ready.*before.*t_0/i,
  );

  assert.throws(
    () => computeCorrelatedMetrics({
      ...base,
      entries: [
        { action: "sort-around-focus", phase: "t_0", t: 10, interactionId: "sort-1" },
        { action: "sort-around-focus", phase: "t_status_visible", t: 30, interactionId: "sort-1" },
        { action: "sort-around-focus", phase: "t_store_ready", t: 20, interactionId: "sort-1" },
      ],
    }),
    /PP4.*t_store_ready.*before.*t_status_visible/i,
  );
});

test("accepts zero durations without ordering independent phases", () => {
  const metrics = computeCorrelatedMetrics({
    id: "PP4",
    label: "focused direction",
    action: "sort-around-focus",
    requiredPhases: ["t_ack", "t_store_ready", "t_first_visible_frame", "t_visual_settled"],
    entries: [
      { action: "sort-around-focus", phase: "t_0", t: 10, interactionId: "sort-1" },
      { action: "sort-around-focus", phase: "t_ack", t: 10, interactionId: "sort-1" },
      { action: "sort-around-focus", phase: "t_first_visible_frame", t: 20, interactionId: "sort-1" },
      { action: "sort-around-focus", phase: "t_store_ready", t: 30, interactionId: "sort-1" },
      { action: "sort-around-focus", phase: "t_status_visible", t: 40, interactionId: "sort-1" },
      { action: "sort-around-focus", phase: "t_visual_settled", t: 40, interactionId: "sort-1" },
    ],
  });

  assert.equal(metrics.dt_ack_ms, 0);
  assert.equal(metrics.dt_first_visible_frame_ms, 10);
  assert.equal(metrics.dt_store_ready_ms, 20);
  assert.equal(metrics.status_total_ms, 0);
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

test("campaign manifest is complete only with every requested suite, full repetitions and no filter", () => {
  const entry = (family, kind, runs = 4) => ({ family, kind, timestamp: `t-${kind}`, runs, scenarios: ["A"] });
  const base = { campaignId: "c1", label: "L", runs: 4, grep: "", apiTopology: "local", mediaDelivery: "proxy", completedAt: "t" };
  const requested = { jank: true, short: true, long: false, density: true };
  const all = [entry("audit", "rendering"), entry("perceived", "short"), entry("density", "density")];
  const complete = buildCampaignManifest({ ...base, requested, entries: all });
  assert.equal(complete.complete, true);
  assert.deepEqual(complete.requestedSuites, ["jank", "short", "density"]);
  const missing = buildCampaignManifest({ ...base, requested, entries: all.slice(0, 2) });
  assert.deepEqual([missing.complete, missing.missingSuites], [false, ["density"]]);
  const short = buildCampaignManifest({ ...base, requested, entries: [...all.slice(0, 2), entry("density", "density", 3)] });
  assert.deepEqual([short.complete, short.shortRepetitions], [false, ["density/density"]]);
  assert.equal(buildCampaignManifest({ ...base, grep: "P8", requested, entries: all }).complete, false);
  const log = appendCampaignManifest({ entries: [] }, complete);
  assert.throws(() => appendCampaignManifest(log, complete), /already published/);
});