import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as validation from "./harness-validation.mjs";
import { severeRateIsReportable } from "./p14-metrics.mjs";

const runner = readFileSync(join(import.meta.dirname, "run-audit.mjs"), "utf8");
const html = readFileSync(join(import.meta.dirname, "results/audit-graphs.html"), "utf8");
const dashboard = html.slice(html.indexOf("const KNOWN_METRICS"), html.lastIndexOf("</script>"));

function declarations(source, names) {
  const parsed = ts.createSourceFile("fixture.js", source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
  return names.map((name) => {
    const node = parsed.statements.find((statement) => statement.name?.text === name
      || (ts.isVariableStatement(statement) && statement.declarationList.declarations.some((declaration) => declaration.name.getText(parsed) === name)));
    assert.ok(node, `Missing actual declaration: ${name}`);
    return node.getText(parsed);
  }).join("\n");
}

function runnerFunctions(names) {
  return runInNewContext(`${declarations(runner, names)}\n({${names.join(",")}})`, { ...validation, severeRateIsReportable });
}

const { aggregateMetrics } = runnerFunctions(["median", "aggregateMetrics"]);
const { buildBaselineTable, buildAuditMarkdown } = runnerFunctions([
  "METRIC_COLS", "METRIC_LABELS", "METRIC_UNITS", "formatValue", "buildBaselineTable", "buildAuditMarkdown",
  "buildDiffTable", "formatDelta", "REGRESSION_MIN_ABSOLUTE_DELTA", "formatEnvironment",
]);
const base = { id: "P2", cls: 0, clsMax: 0, maxFrame: 12, severe: 0, severeRate: 0, p95Frame: 10, domChurn: 2, loafBlocking: 0, frameCount: 100 };
const captured = { ...base, networkCaptureRevision: 1, networkTransport: "direct-es", networkRequests: 2,
  networkBytes: 100, networkAvgBytes: 50, networkAvgDurationMs: 10, networkZeroTransferRequests: 0 };
const empty = { ...captured, networkRequests: 0, networkBytes: 0, networkAvgBytes: null, networkAvgDurationMs: null };
const unavailable = { ...captured, networkRequests: null, networkBytes: null, networkAvgBytes: null,
  networkAvgDurationMs: null, networkZeroTransferRequests: null };
const aggregate = (...entries) => aggregateMetrics(entries.map((entry) => [entry])).P2;

test("main aggregation preserves historical absence and jank values", () => {
  const old = aggregate(base);
  assert.equal("networkRequests" in old, false);
  assert.equal("esRequests" in old, false);
  assert.deepEqual(JSON.parse(JSON.stringify(aggregate(captured))), { ...JSON.parse(JSON.stringify(old)),
    networkCaptureRevision: 1, networkTransport: "direct-es", networkRequests: 2, networkBytes: 100,
    networkAvgBytes: 50, networkAvgDurationMs: 10, networkZeroTransferRequests: 0 });
});

test("network aggregation retains zeros, nulls and fractional per-run medians", () => {
  assert.equal(aggregate(empty).networkBytes, 0);
  assert.equal(aggregate(empty).networkAvgDurationMs, null);
  assert.equal(aggregate(captured, { ...captured, networkRequests: 3 }).networkRequests, 2.5);
  for (const key of ["networkRequests", "networkBytes", "networkAvgBytes", "networkAvgDurationMs", "networkZeroTransferRequests"]) {
    assert.equal(aggregate(unavailable)[key], null);
    assert.equal(aggregate(captured, unavailable)[key], null);
  }
  const restricted = { ...captured, networkBytes: null, networkAvgBytes: null, networkZeroTransferRequests: 1 };
  assert.equal(aggregate(captured, restricted).networkBytes, null);
  assert.equal(aggregate(captured, restricted).networkRequests, 2);
});

test("network aggregation rejects partial presence and inconsistent capture identity", () => {
  assert.throws(() => aggregate(captured, base), /networkCaptureRevision/);
  const missing = { ...captured };
  delete missing.networkBytes;
  assert.throws(() => aggregate(captured, missing), /networkBytes/);
  assert.throws(() => aggregate(missing, missing), /networkBytes/);
  for (const changed of [{ networkCaptureRevision: 2 }, { networkTransport: "media-api" }, { networkTransport: "other" }]) {
    assert.throws(() => aggregate(captured, { ...captured, ...changed }), /network/);
    if (changed.networkTransport !== "media-api") assert.throws(() => aggregate({ ...captured, ...changed }), /contract/);
  }
});

for (const key of ["networkRequests", "networkBytes", "networkAvgBytes", "networkAvgDurationMs", "networkZeroTransferRequests"]) {
  test(`${key} rejects non-finite, negative and nonnumeric samples without filtering`, () => {
    for (const value of [-1, Infinity, NaN, "0", undefined, false]) {
      assert.throws(() => aggregate(captured, { ...captured, [key]: value }), new RegExp(key));
    }
  });
}

test("network capture validates empty, unavailable and restricted-byte semantics", () => {
  assert.throws(() => aggregate({ ...empty, networkBytes: null }), /empty/);
  assert.throws(() => aggregate({ ...empty, networkAvgDurationMs: 0 }), /empty/);
  assert.throws(() => aggregate({ ...unavailable, networkBytes: 0 }), /unavailable/);
  assert.throws(() => aggregate({ ...captured, networkZeroTransferRequests: 1 }), /restricted/);
  assert.throws(() => aggregate({ ...captured, networkBytes: null, networkAvgBytes: null, networkZeroTransferRequests: 3 }), /coverage/);
});

function element() {
  return { children: [], innerHTML: "", appendChild(child) { this.children.push(child); },
    querySelector() { return { getContext: () => ({}) }; } };
}

function dashboardFixture(metric = "networkRequests", entries = []) {
  const controls = { yscale: { value: "linear" }, hideQuiet: { checked: true }, comparableOnly: { checked: false }, showLabels: { checked: false } };
  const grid = element();
  const metricSel = { ...element(), value: metric };
  const configs = [];
  const context = { ENTRIES: entries, TESTS: ["P2"], metricSel, grid, charts: new Map(),
    document: { createElement: element, getElementById: (key) => controls[key],
      querySelectorAll: () => [{ value: "direct-es" }, { value: "media-api" }] },
    Chart: function Chart(_context, config) { configs.push(config); this.destroy = () => {}; } };
  const names = ["KNOWN_METRICS", "MODE_STYLES", "isNetworkMetric", "pickValue", "metricUnit", "metricLabel", "formatMetricValue",
    "environmentKey", "metricsComparable", "networkSeriesKey", "entryMode", "sourceMatchLabel", "pairedModeSummary",
    "visibleModeSet", "buildCharts", "buildMetricDropdown"];
  const functions = runInNewContext(`${declarations(dashboard, names)}\n({${names.join(",")}})`, context);
  return { ...functions, grid, metricSel, controls, configs };
}

const entry = (metric, mode = "direct-es", topology = "none") => ({ label: "fixture", timestamp: "2026-10-04", gitSha: "fixture",
  runs: 1, environment: { dataMode: mode, apiTopology: topology, os: { platform: "fixture", architecture: "fixture", release: "fixture" },
    viewport: { width: 800, height: 600 }, screen: { width: 800, height: 600 } }, metrics: { P2: metric } });

test("dashboard network values preserve zero and treat absent/null/invalid capture as gaps", () => {
  const fixture = dashboardFixture();
  for (const metric of [base, unavailable, { ...captured, networkRequests: -1 }, { ...captured, networkRequests: Infinity },
    { ...captured, networkCaptureRevision: 2 }, { ...captured, networkTransport: "other" }]) {
    assert.equal(fixture.pickValue("networkRequests", metric), null);
  }
  assert.equal(fixture.pickValue("networkRequests", empty), 0);
});

test("dashboard has one Network optgroup, explicit units and no lower-better claims", () => {
  const fixture = dashboardFixture();
  fixture.buildMetricDropdown(new Set());
  const groups = fixture.metricSel.children.filter((child) => child.label === "Network");
  assert.equal(groups.length, 1);
  assert.equal(groups[0].children.length, 5);
  assert.ok(groups[0].children.every((child) => !child.textContent.includes("lower better")));
  assert.equal(fixture.metricUnit("networkRequests"), " requests");
  assert.equal(fixture.metricUnit("networkBytes"), " bytes");
  assert.equal(fixture.metricUnit("networkAvgDurationMs"), "ms");
});

test("network series separate topology and transport, preserve gaps and show zero under hide-quiet", () => {
  const api = { ...captured, networkTransport: "media-api" };
  const entries = [entry(empty), entry(base), entry(unavailable), entry(captured), entry(api, "media-api", "local"),
    entry(api, "media-api", "deployed-test")];
  const fixture = dashboardFixture("networkRequests", entries);
  fixture.buildCharts();
  const datasets = fixture.configs[0].data.datasets;
  assert.equal(datasets.length, 3);
  assert.deepEqual(Array.from(datasets[0].data), [0, null, null, 2, null, null]);
  assert.ok(datasets.every((dataset) => dataset.spanGaps === false));
  assert.match(datasets[1].label, /media-api\/local/);
  assert.match(datasets[2].label, /media-api\/deployed-test/);
  assert.doesNotMatch(fixture.grid.children[0].innerHTML, /API − direct/);
  const zero = dashboardFixture("networkRequests", [entry(empty)]);
  zero.buildCharts();
  assert.equal(zero.configs.length, 1);
});

test("network comparability includes topology and capture contract; cross-transport subtraction is disabled", () => {
  const fixture = dashboardFixture();
  const local = entry(captured, "media-api", "local");
  const deployed = entry(captured, "media-api", "deployed-test");
  assert.equal(fixture.environmentKey(local), fixture.environmentKey(deployed));
  assert.equal(fixture.metricsComparable(local, captured, deployed, captured, "networkBytes"), false);
  const legacy = entry(captured, "media-api", undefined);
  delete legacy.environment.apiTopology;
  assert.equal(fixture.metricsComparable(local, captured, legacy, captured, "maxFrame"), true);
  for (const changed of [{ networkTransport: "media-api" }, { networkCaptureRevision: 2 }]) {
    assert.equal(fixture.metricsComparable(entry(captured), captured, entry(captured), { ...captured, ...changed }, "networkBytes"), false);
  }
  assert.equal(fixture.pairedModeSummary([{ mode: "direct-es", latestValue: 2 }, { mode: "media-api", latestValue: 1 }], "networkRequests"), "");
  const ordinary = dashboardFixture("maxFrame", [entry(captured, "media-api", "local"), entry(captured, "media-api", "deployed-test")]);
  ordinary.buildCharts();
  assert.equal(ordinary.configs[0].data.datasets.length, 1);
  assert.equal(ordinary.configs[0].data.datasets[0].spanGaps, true);
  assert.equal(ordinary.configs[0].data.datasets[0].label, "media-api");
});

test("baseline and diff markdown each include exactly one diagnostic Network table with no deltas", () => {
  const current = { ...entry(aggregate(empty), "direct-es", "none"), stableUntil: 100, gitDirty: false };
  const table = buildBaselineTable(current);
  assert.match(table, /### Network/);
  assert.match(table, /Transport \| API topology \| Capture revision/);
  assert.match(table, /Zero-transfer requests \(coverage\)/);
  assert.match(table, /\| P2 \| 1 \| direct-es \| none \| 1 \| 0 \| 0 \| unavailable \| unavailable \| 0 \|/);
  assert.match(table, /Lower is not necessarily better/);
  assert.equal(buildBaselineTable(entry(aggregate(base))).includes("### Network"), false);
  for (const previous of [null, current]) {
    const markdown = buildAuditMarkdown("", current, previous);
    assert.equal(markdown.split("### Network").length - 1, 1);
    const network = markdown.split("### Network")[1];
    assert.doesNotMatch(network, /\(Δ\)|API − direct/);
  }
  assert.match(buildBaselineTable(entry(aggregate(unavailable)), true), /unavailable/);
});