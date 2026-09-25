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
} from "./harness-validation.mjs";
import {
  commitFileTransaction,
  parseHistoryLog,
  pruneAuditHistory,
} from "./history-files.mjs";
import { computeCorrelatedMetrics, ownsDataRoute } from "./perceived-metrics.mjs";
import TeardownReporter from "./teardown-reporter.mjs";
import {
  classifyImageLookup,
  comparisonEvidenceClass,
  metricsAreComparable,
  severeRateIsReportable,
} from "./p14-metrics.mjs";

function dashboardFunction(filename, name) {
  const html = readFileSync(join(import.meta.dirname, "results", filename), "utf8");
  const source = html.slice(html.indexOf(`function ${name}(`));
  const parsed = ts.createSourceFile("dashboard.js", source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
  const declaration = parsed.statements[0];
  assert.equal(declaration.name?.text, name);
  return source.slice(declaration.pos, declaration.end);
}

function runnerFunction(name) {
  const source = readFileSync(join(import.meta.dirname, "run-audit.mjs"), "utf8");
  const tail = source.slice(source.indexOf(`function ${name}(`));
  const parsed = ts.createSourceFile("runner.js", tail, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
  const declaration = parsed.statements[0];
  assert.equal(declaration.name?.text, name);
  return tail.slice(declaration.pos, declaration.end);
}

function waitForFunctionDefects() {
  const files = [
    "perf.spec.ts", "perceived-short.spec.ts", "perceived-long.spec.ts",
    "helpers.ts", "../e2e/shared/helpers.ts",
  ];
  const defects = [];
  for (const relativePath of files) {
    const file = join(import.meta.dirname, relativePath);
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
    const source = readFileSync(join(import.meta.dirname, filename), "utf8");
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
  ]);
  const runner = readFileSync(join(import.meta.dirname, "run-audit.mjs"), "utf8");
  assert.match(runner, /appSourceDirtyStateHash/);
  assert.match(runner, /generatedHistoryExclusions\(\)/);
});

test("both dashboards qualify paired mode deltas by application-source identity", () => {
  for (const filename of ["audit-graphs.html", "perceived-graphs.html"]) {
    const sourceMatchLabel = runInNewContext(
      `${dashboardFunction(filename, "sourceMatchLabel")}\nsourceMatchLabel`,
    );
    const base = { gitSha: "abc", environment: { appSourceDirtyStateHash: "same" } };
    assert.equal(sourceMatchLabel(base, base), "app source matched");
    assert.equal(sourceMatchLabel(base, { ...base, environment: { appSourceDirtyStateHash: "other" } }), "app source differs");
    assert.equal(sourceMatchLabel(base, { ...base, environment: {} }), "app source unverified");
    assert.equal(sourceMatchLabel(base, { ...base, gitSha: "def" }), "commit differs");
    const source = readFileSync(join(import.meta.dirname, "results", filename), "utf8");
    assert.match(source, /API − direct/);
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
      requireConsistentPresence, aggregateSettledTotal, assertConsistentNames,
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
  const source = readFileSync(join(import.meta.dirname, "run-audit.mjs"), "utf8");
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
    const source = readFileSync(join(import.meta.dirname, "results", filename), "utf8");
    for (const field of ["imageLookupCount", "detailLookupMs", "detailMetadataReadyMs", "detailImageReadyMs"]) {
      assert.ok(source.includes(field), `${filename}: ${field}`);
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
  const audit = readFileSync(join(import.meta.dirname, "results/audit-graphs.html"), "utf8");
  assert.match(audit, /imageLookupCount:[^\n]+quietThreshold: 0/);
  const perceived = readFileSync(join(import.meta.dirname, "results/perceived-graphs.html"), "utf8");
  assert.match(perceived, /script src="audit-log.js"/);
  assert.match(perceived, /auditImageReadEntries\(window\.__AUDIT_LOG__\)/);
  const unit = runInNewContext(`${dashboardFunction("perceived-graphs.html", "metricUnit")}\nmetricUnit`);
  assert.equal(unit("imageLookupCount"), "");
  assert.equal(unit("detailImageReadyMs"), "ms");
});

test("replacing perceived history removes stale charts before rendering shared probes", () => {
  const elements = { grid: { innerHTML: "old cards" }, diagnosticGrid: { innerHTML: "old diagnostics" } };
  let destroyed = 0;
  const charts = new Map([["old", { destroy: () => destroyed++ }]]);
  let rendered = false;
  const ingest = runInNewContext(`${dashboardFunction("perceived-graphs.html", "ingestLog")}\ningestLog`, {
    window: { __AUDIT_LOG__: { entries: [] } },
    auditImageReadEntries: () => [],
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

function standaloneProbeHarness({ route = "direct-es", expectedRoute = route, resident = false, becomesResident = false, requestCount = 1, changedMedia = false, wrongTarget = false, wrongTargetIndex = -1, mixedRoute = false } = {}) {
  const source = readFileSync(join(import.meta.dirname, "perf.spec.ts"), "utf8");
  const helper = source.slice(source.indexOf("function captureImageLookups("), source.indexOf("// Guard: per-test cluster checks"));
  const { outputText } = ts.transpileModule(helper, { compilerOptions: { target: ts.ScriptTarget.ES2022 } });
  let now = 0;
  const listeners = new Map();
  const target = "fixture-target";
  const response = { ok: () => true, finished: async () => null };
  const requests = Array.from({ length: requestCount }, (_, index) => {
    const actualRoute = mixedRoute && index > 0 ? "media-api" : route;
    const requestedId = wrongTarget || wrongTargetIndex === index ? "different-target" : target;
    return {
      method: () => actualRoute === "direct-es" ? "POST" : "GET",
      url: () => actualRoute === "direct-es" ? "https://example.invalid/es/images/_mget" : `https://example.invalid/api/images/${requestedId}`,
      response: async () => response,
      postDataJSON: () => ({ docs: [{ _id: requestedId }] }),
      timing: () => ({ startTime: 1000, responseEnd: 40 + index * 20 }),
    };
  });
  const image = {
    get complete() { return now >= 60; }, naturalWidth: 400,
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
    requestAnimationFrame: (callback) => { now += 16; queueMicrotask(callback); },
    document: { querySelector: () => now >= 40 ? owner : null },
    window: {
      __perfStandaloneMedia__: "/warm-rendition",
      __kupua_store__: { getState: () => ({ results: resident ? [{ id: target }] : [{ id: "other" }], imagePositions: { has: () => becomesResident } }) },
      __kupua_router__: { navigate: async () => {
        for (const request of requests) listeners.get("request")?.(request);
      } },
    },
  });
  return { run: () => measure({ page }, target, expectedRoute), listeners };
}

function geometryWaitFunctions(context) {
  const source = readFileSync(join(import.meta.dirname, "perf.spec.ts"), "utf8");
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
      assert.equal(result.scenarioRevision, 2);
      assert.equal(result.routes[0], route);
      assert.equal(result.imageLookupCount, requestCount);
      assert.equal(result.detailLookupMs, 40 + (requestCount - 1) * 20);
      assert.ok(result.detailImageReadyMs >= result.detailMetadataReadyMs);
      assert.equal(harness.listeners.size, 0);
      assert.equal(JSON.stringify(result).includes("fixture-target"), false);
    }
  }
});

test("actual standalone probe rejects excess, missing or mismatched reads and resident shortcuts", async () => {
  for (const options of [{ resident: true }, { becomesResident: true }, { requestCount: 3 }, { requestCount: 0 }, { expectedRoute: "media-api" }, { changedMedia: true }, { wrongTarget: true },
    { requestCount: 2, wrongTargetIndex: 0 }, { requestCount: 2, wrongTargetIndex: 1 },
    { requestCount: 2, mixedRoute: true }]) {
    const harness = standaloneProbeHarness(options);
    await assert.rejects(harness.run());
    assert.equal(harness.listeners.size, 0);
  }
});

function decodedDetailHarness({ readyAt = 64, wrongIdentity = false, moving = false, decodeFails = false } = {}) {
  const source = readFileSync(join(import.meta.dirname, "../e2e/shared/helpers.ts"), "utf8");
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

test("manifests account for all 56 maintained unique metric IDs", () => {
  const jankIds = expectedJankMetricIds("");

  assert.equal(jankIds.length, 33);
  assert.equal(new Set(jankIds).size, 33);
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