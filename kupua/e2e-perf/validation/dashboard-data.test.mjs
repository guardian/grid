import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { expectedJankMetricIds, expectedPerceivedMetricIds } from "../harness-validation.mjs";
import { DENSITY_METRIC_IDS } from "../density-reporting.mjs";

const root = new URL("../", import.meta.url);
const histories = Object.fromEntries(["audit", "perceived", "density"].map(family =>
  [family, JSON.parse(readFileSync(new URL(`results/${family}-log.json`, root), "utf8"))]));

function load() {
  const context = vm.createContext({ URLSearchParams });
  vm.runInContext(readFileSync(new URL("results/campaign-comparison.js", root), "utf8"), context);
  vm.runInContext(readFileSync(new URL("results/dashboard-data.js", root), "utf8"), context);
  return context.KupuaDashboardData;
}

test("canonical checkpoint retains all 78 exact records and explicit four-entry membership", () => {
  const api = load();
  const data = api.build(histories);
  const checkpoint = data.checkpoints.recorded;
  assert.equal(checkpoint.members.length, 4);
  assert.equal(checkpoint.completed, 78);
  assert.equal(checkpoint.planned, 78);
  assert.equal(checkpoint.members.flatMap(id => data.entries[id].records).length, 78);
  for (const record of Object.values(data.records)) {
    const entry = data.entries[record.entry];
    assert.ok(entry.sourceRecord);
    assert.equal(record.raw, entry.sourceRecord[entry.sourceCollection][record.scenario]);
    assert.match(record.id, new RegExp(`/r${record.raw.scenarioRevision ?? "unknown"}$`));
  }
  const detail = Object.values(data.records).find(record => record.scenario === "P13c");
  assert.equal(detail.raw.detailImageReadyMs, 1374);
  assert.equal(detail.raw.detailImageReadyCount, 4);
  assert.ok(detail.raw.completionBoundary);
  const traversal = Object.values(data.records).find(record => record.scenario === "P14b");
  assert.equal(traversal.raw.landingRenderMs, 6653);
  const recovery = Object.values(data.records).find(record => record.scenario === "D8-table");
  assert.equal(api.read(recovery, "stopMediaReadyMs"), null);
  assert.equal(api.population(recovery, "stopMediaReadyMs").available, 0);
});

test("checkpoint source comparison uses verified member consensus", () => {
  const context = loadPresentation(), api = context.KupuaDashboardData;
  const campaigns = JSON.parse(readFileSync(new URL("results/campaign-log.json", root), "utf8"));
  const registry = [...api.definitions, ...api.campaignDefinitions(campaigns)];
  const data = api.build(histories, registry);
  const current = data.checkpoints[`campaign:${campaigns.entries.at(-1).campaignId}`];
  for (const checkpoint of [data.checkpoints.recorded, data.checkpoints["proxy-baseline"], current]) {
    const entries = checkpoint.members.map(id => data.entries[id]);
    assert.equal(checkpoint.gitSha, entries[0].gitSha);
    assert.ok(entries.every(entry => entry.gitSha === checkpoint.gitSha));
  }
  assert.match(context.KupuaPerfComparison.compare(current, data.checkpoints.recorded).reason, /source fingerprints differ/);
  for (const patch of [{ gitSha: "different" }, { gitSha: undefined },
    { environment: { ...histories.audit.entries.find(entry => entry.timestamp === api.members.audit).environment, appSourceDirtyStateHash: "different" } }]) {
    const changed = structuredClone(histories);
    Object.assign(changed.audit.entries.find(entry => entry.timestamp === api.members.audit), patch);
    const checkpoint = api.build(changed).checkpoints.recorded;
    assert.match(context.KupuaPerfComparison.compare(checkpoint, data.checkpoints.recorded).reason, /source fingerprints unavailable/);
  }
  const missing = api.build({ ...histories, audit: { entries: [] } }).checkpoints.recorded;
  assert.equal(missing.gitSha, null, "incomplete membership cannot verify source consensus");
});

test("sidecars equal canonical JSON and checkpoint scenarios match maintained manifests", () => {
  const api = load(), data = api.build(histories);
  const expected = { rendering: expectedJankMetricIds(), short: expectedPerceivedMetricIds("short"), long: expectedPerceivedMetricIds("long"), density: [...DENSITY_METRIC_IDS] };
  for (const family of ["audit", "perceived", "density"]) {
    const context = vm.createContext({});
    context.window = context;
    vm.runInContext(readFileSync(new URL(`results/${family}-log.js`, root), "utf8"), context);
    assert.ok(JSON.stringify(context[`__${family.toUpperCase()}_LOG__`]) === JSON.stringify(histories[family]), `${family} sidecar matches canonical JSON`);
  }
  for (const member of api.definitions[0].members) {
    assert.deepEqual([...member.scenarios].sort(), expected[member.kind].sort());
    const actual = [...data.checkpoints.recorded.members].flatMap(id => data.entries[id].records.map(recordId => data.records[recordId])).filter(record => record.kind === member.kind).map(record => record.scenario).sort();
    assert.deepEqual(actual, expected[member.kind]);
  }
});

test("missing family is not replaced by a same-labelled or latest entry", () => {
  const api = load();
  const missing = { ...histories, audit: { entries: histories.audit.entries.filter(entry => entry.timestamp !== api.members.audit) } };
  const data = api.build(missing);
  assert.equal(data.checkpoints.recorded.completed, 44);
  assert.equal(data.checkpoints.recorded.missing.length, 1);
  assert.equal([...data.checkpoints.recorded.members].flatMap(id => [...data.entries[id].records]).some(id => data.records[id].scenario === "P13c"), false);
});

test("proxy baseline registers only the three operator-confirmed entries and leaves long absent", () => {
  const api = load(), data = api.build(histories), baseline = data.checkpoints["proxy-baseline"];
  assert.equal(baseline.members.length, 3);
  assert.equal(baseline.completed, 70);
  assert.equal(baseline.planned, 70);
  assert.deepEqual([...baseline.absentFamilies], ["Long responsiveness"]);
  assert.match(baseline.note, /not one atomic campaign/);
  const membership = Array.from(baseline.members, id => {
    const entry = data.entries[id];
    return [entry.family, entry.kind, entry.timestamp];
  });
  assert.deepEqual(membership, [
    ["audit", "rendering", "2026-10-24T00:14:11.263Z"],
    ["perceived", "short", "2026-10-23T23:29:50.826Z"],
    ["density", "density", "2026-10-24T04:32:34.673Z"]
  ]);
  assert.equal(baseline.members.flatMap(id => data.entries[id].records).some(id => data.records[id].kind === "long"), false);
  const withoutShort = { ...histories, perceived: { entries: histories.perceived.entries.filter(entry => entry.timestamp !== "2026-10-23T23:29:50.826Z") } };
  const partial = api.build(withoutShort).checkpoints["proxy-baseline"];
  assert.equal(partial.completed, 55);
  assert.equal(partial.members.length, 2);
  assert.equal(partial.missing.length, 1);
});

test("real baseline retains descriptive compatible deltas, revision refusals and null endpoints", () => {
  const api = load(), data = api.build(histories);
  const get = (checkpoint, scenario) => data.checkpoints[checkpoint].members.flatMap(id => data.entries[id].records.map(recordId => data.records[recordId])).find(record => record.scenario === scenario);
  const compare = scenario => {
    const current = get("recorded", scenario), baseline = get("proxy-baseline", scenario);
    return { current, baseline, result: api.recordPair(current, baseline, data.entries[current.entry], data.entries[baseline.entry]) };
  };
  for (const [id, delta] of [["PP3", -43], ["PP7", -46]]) {
    const { current, baseline, result } = compare(id);
    assert.equal(result.ok, true);
    assert.equal(api.measure(current, current.primary) - api.measure(baseline, current.primary), delta);
    assert.match(result.reason, /source fingerprints differ/);
    assert.match(result.reason, /content\/cache warmth uncontrolled/);
  }
  for (const id of ["P13c", "P14a", "P14b", "P14c", "P14d"]) {
    const { current, baseline, result } = compare(id);
    assert.equal(current.raw.scenarioRevision, 3);
    assert.equal(baseline.raw.scenarioRevision, 2);
    assert.equal(result.ok, false);
    assert.match(result.reason, /scenarioRevision/);
    assert.notEqual(api.measure(current, current.primary), null);
  }
  assert.match(compare("P2").result.reason, /unverified contract/);
  const recovery = compare("D8-table");
  assert.equal(recovery.result.ok, true);
  assert.equal(api.measure(recovery.current, "stopMediaReadyMs"), null);
  assert.equal(api.measure(recovery.baseline, "stopMediaReadyMs"), null);
  assert.equal(get("proxy-baseline", "JA2"), undefined);
  assert.equal(get("proxy-baseline", "JB5"), undefined);
  const { current, baseline } = compare("D1-grid");
  const partial = { ...baseline, raw: structuredClone(baseline.raw) };
  Object.assign(partial.raw.metrics.middleFrameP95Ms, { sampleCount: 3, unavailableCount: 1 });
  assert.equal(api.recordPair(current, partial, data.entries[current.entry], data.entries[baseline.entry], "middleFrameP95Ms").ok, false);
});

test("evidence routes preserve checkpoint/baseline direction for every workflow", () => {
  const api = load();
  for (const view of ["images", "search", "scroll"]) {
    const route = api.route({ cp: "recorded", base: "earlier", view, evidence: "stable/id", metric: "field", side: "baseline", group: "detail" });
    const params = new URLSearchParams(route.slice(1));
    assert.equal(params.get("checkpoint"), "recorded");
    assert.equal(params.get("baseline"), "earlier");
    assert.equal(params.get("side"), "baseline");
    assert.equal(params.get("evidence"), "stable/id");
  }
});

test("healthy timing count is not the all-outcome denominator", () => {
  const api = load();
  for (const [healthy, degraded] of [[3, 0], [2, 3], [0, 5]]) {
    const record = { scenario: "PP3", raw: { sampleCount: healthy, degradedCount: degraded, dt_visual_settled_ms: healthy ? 100 : null } };
    const completion = api.completion(record);
    assert.equal(completion.total, healthy + degraded);
    assert.equal(completion.ready, healthy);
    assert.equal(api.population(record, "dt_visual_settled_ms").available, healthy);
    assert.equal(api.population(record, "dt_visual_settled_ms").total, healthy + degraded);
  }
});

test("null, zero, false, absent, partial, unsupported and invalid stay distinct", () => {
  const api = load();
  const record = { scenario: "D8-table", raw: { sampleCount: 5, zero: 0, visible: false, empty: null, metrics: { stopMediaReadyMs: { median: null, sampleCount: 2, unavailableCount: 3 } } } };
  assert.equal(api.read(record, "zero"), 0);
  assert.equal(api.read(record, "visible"), false);
  assert.equal(api.population(record, "empty").state, "null");
  assert.equal(api.population(record, "missing").state, "absent");
  assert.equal(api.population(record, "stopMediaReadyMs").state, "partial");
  record.raw.supported = false;
  assert.equal(api.population(record, "zero").state, "unsupported");
  record.raw.captureValid = false;
  assert.equal(api.population(record, "zero").state, "invalid");
});

test("comparison verifies actual environments, routes, revisions and density contracts", () => {
  const api = load(), data = api.build(histories);
  for (const scenario of ["P13c", "PP3", "D1-grid"]) {
    const current = Object.values(data.records).find(record => record.scenario === scenario);
    const entry = data.entries[current.entry];
    const before = { ...current, raw: structuredClone(current.raw) };
    const baseline = { ...entry, environment: structuredClone(entry.environment) };
    assert.equal(api.recordPair(current, before, entry, baseline).ok, true);
    baseline.environment.mediaDelivery = "proxy";
    assert.equal(api.recordPair(current, before, entry, baseline).ok, true);
    baseline.environment.cpuThrottle = null;
    assert.equal(api.recordPair(current, before, entry, baseline).ok, false);
    baseline.environment.cpuThrottle = entry.environment.cpuThrottle;
    before.raw.scenarioRevision = 99;
    assert.equal(api.recordPair(current, before, entry, baseline).ok, false);
    before.raw.scenarioRevision = current.raw.scenarioRevision;
    if (scenario.startsWith("D")) before.raw.contractKey = "changed";
    else before.raw.routes = ["unrelated-route"];
    assert.equal(api.recordPair(current, before, entry, baseline).ok, false);
  }
});

test("density assessments retain capture gates and field-specific complete populations", () => {
  const api = load(), data = api.build(histories);
  const original = Object.values(data.records).find(record => record.scenario === "D1-grid");
  const observed = original.raw.metrics.middleFrameP95Ms.median;
  assert.equal(api.measure(original, "middleFrameP95Ms"), observed);
  for (const [field, patch] of [
    ["timingCaptureRevision", { median: 1, p95: 1 }],
    ["observerStopLagMs", { p95: 26 }],
    ["recoveryStartLagMs", { p95: 26 }],
    ["middleTrackingOverflow", { p95: 1 }],
    ["middleFrameP95Ms", { sampleCount: 3, unavailableCount: 1 }]
  ]) {
    const record = { ...original, raw: structuredClone(original.raw) };
    Object.assign(record.raw.metrics[field], patch);
    assert.equal(api.measure(record, "middleFrameP95Ms"), null, field);
    assert.equal(api.read(record, "middleFrameP95Ms"), observed, "raw observation retained");
  }
});

test("image ownership and every primary field are grounded in real records", () => {
  const api = load(), data = api.build(histories);
  for (const record of Object.values(data.records)) {
    assert.ok(Object.hasOwn(record.raw, record.primary) || Object.hasOwn(record.raw.metrics ?? {}, record.primary), `${record.scenario}: ${record.primary}`);
    if (/^P(5|13|14|15|18|19)/.test(record.scenario) || ["JA2", "JB5"].includes(record.scenario)) assert.equal(record.area, "images", record.scenario);
  }
});

test("p95 wording uses the contributing population rather than an assumed four", () => {
  const api = load();
  for (const [available, expected] of [[0, "Recorded p95"], [3, "Observed maximum"], [4, "Observed maximum"], [5, "Observed maximum"], [40, "Recorded p95"]]) {
    const record = { scenario: "JA2", raw: { sampleCount: available, dt_visual_settled_p95_ms: available ? 100 : null } };
    assert.equal(api.tailLabel(record, "dt_visual_settled_p95_ms"), expected);
  }
});

function loadPresentation() {
  const context = vm.createContext({ URLSearchParams });
  context.window = context;
  for (const file of ["results/campaign-comparison.js", "results/dashboard-data.js", "results/assessment.js", "results/overview.js"]) {
    vm.runInContext(readFileSync(new URL(file, root), "utf8"), context);
  }
  return context;
}

test("real registered checkpoints tolerate absent historical completion contracts", () => {
  const context = loadPresentation(), api = context.KupuaDashboardData, data = api.build(histories);
  for (const name of ["recorded", "proxy-baseline"]) {
    const records = data.checkpoints[name].members.flatMap(id => data.entries[id].records.map(id => data.records[id]));
    const detail = records.find(r => r.scenario === "P13c");
    if (name === "proxy-baseline") assert.equal(api.completion(detail), null);
    assert.doesNotThrow(() => context.ASSESSMENT.findings(records), name);
    if (name === "proxy-baseline") assert.equal(context.ASSESSMENT.findings(records).some(f => f.key === "detail"), false);
  }
});

function renderTraversalOverview(context, record) {
  const api = context.KupuaDashboardData;
  return context.renderEngineeringOverview({
    cp: { synthetic: true, note: "Synthetic regression" }, rs: [record], base: null,
    read: api.measure, stat: api.statistic, format: (value, unit = "") => value == null ? "Unavailable" : `${value}${unit ? ` ${unit}` : ""}`,
    esc: String, find: id => id === record.scenario ? record : null,
    assess: (record, type) => type === "traversal" ? context.ASSESSMENT.traversalGrade(record) : ({ label: "Unrated", why: "No action control" }), pair: () => ({ ok: false }),
    href: (r, key) => `#evidence=${r.id}&metric=${key}`, summaryLink: (_group, text) => text, rules: "Rules"
  });
}

test("invalid or unsupported traversal cannot produce a finding, percentage or raw-count summary", () => {
  const context = loadPresentation(), api = context.KupuaDashboardData;
  const source = Object.values(api.build(histories).records).find(record => record.scenario === "P14b");
  for (const patch of [{ captureValid: false }, { supported: false }]) {
    const record = { ...source, raw: { ...structuredClone(source.raw), ...patch } };
    assert.equal(api.measure(record, "renderedCount"), null);
    const findings = context.ASSESSMENT.findings([record]);
    assert.equal(findings.some(finding => finding.key === "traversal"), false, "no assessable cadence/outcome conclusion");
    assert.equal(findings.some(finding => finding.priority > 0), false, "no performance priority from rejected evidence");
    assert.doesNotMatch(context.ASSESSMENT.actionSummary(record), /3\/15|final landings/);
    const html = renderTraversalOverview(context, record);
    const strip = html.match(/<section class="workflow-strip"[\s\S]*?<\/section>/)[0];
    assert.doesNotMatch(strip, /20 %|3\/15/, "no reassuring numerical traversal summary");
    assert.doesNotMatch(html, /3\/15 loaded|3\/15 images/, "no raw-count conclusion anywhere in the overview");
    assert.match(html, /Invalid|Unsupported/i);
    assert.ok(html.includes(record.id), "raw evidence remains reachable");
  }
});

test("traversal grading shares the evidence gate for empty or inconsistent cadence populations", () => {
  const context = loadPresentation(), api = context.KupuaDashboardData;
  const source = Object.values(api.build(histories).records).find(record => record.scenario === "P14b");
  for (const patch of [
    { renderedTotal: 0 },
    { renderedCount: 16, renderedTotal: 15 },
    { renderedCount: -1 },
    { sampleCount: 0, landingRenderedCount: 0, landingCensoredCount: 0, renderedCount: 15, renderedTotal: 15 }
  ]) {
    const record = { ...source, raw: { ...structuredClone(source.raw), ...patch } };
    assert.equal(context.ASSESSMENT.traversalEvidence(record).usable, false);
    const grade = context.ASSESSMENT.traversalGrade(record);
    assert.equal(grade.label, "Unrated");
    assert.doesNotMatch(grade.why, /3\/0|16\/15|15\/15/);
    const html = renderTraversalOverview(context, record);
    assert.doesNotMatch(html, /3\/0 loaded|16\/15 loaded|15\/15 loaded/);
    assert.doesNotMatch(html.match(/<section class="workflow-strip"[\s\S]*?<\/section>/)[0], /100 %/);
  }
});

test("valid traversal zero, poor and censored outcomes retain their distinct findings", () => {
  const context = loadPresentation(), api = context.KupuaDashboardData;
  const source = Object.values(api.build(histories).records).find(record => record.scenario === "P14b");
  for (const patch of [{ renderedCount: 0 }, {}, { landingRenderedCount: 0, landingCensoredCount: 4, landingRenderMs: null }]) {
    const record = { ...source, raw: { ...structuredClone(source.raw), ...patch } };
    assert.equal(api.validity(record), true);
    const finding = context.ASSESSMENT.findings([record]).find(item => item.key === "traversal");
    assert.ok(finding);
    assert.ok(finding.priority > 0);
    assert.equal(context.ASSESSMENT.traversalGrade(record).label, patch.landingCensoredCount ? "Adverse outcome" : "Far below proposed band");
    assert.match(finding.title, patch.landingCensoredCount ? /0\/4 final landings/ : patch.renderedCount === 0 ? /0\/15 images/ : /3\/15 images/);
  }
});

test("absent declared readiness never falls back to unrelated frame timing", () => {
  const api = load(), source = structuredClone(histories);
  const entry = source.audit.entries.find(entry => entry.timestamp === api.members.audit);
  delete entry.metrics.P13c.detailImageReadyMs;
  const record = Object.values(api.build(source).records).find(record => record.scenario === "P13c");
  assert.equal(record.primary, "detailImageReadyMs");
  assert.equal(api.measure(record, record.primary), null);
  assert.equal(api.population(record, record.primary).state, "absent");
});

function loadScroll() {
  const context = vm.createContext({ URLSearchParams });
  for (const file of ["results/campaign-comparison.js", "results/dashboard-data.js", "results/scroll-model.js"]) {
    vm.runInContext(readFileSync(new URL(file, root), "utf8"), context);
  }
  const api = context.KupuaDashboardData, model = context.KupuaScrollModel, data = api.build(histories);
  const entry = data.entries[data.checkpoints.recorded.members.find(id => data.entries[id].family === "density")];
  const records = entry.records.map(id => data.records[id]);
  return { api, model, data, entry, records, get: scenario => records.find(record => record.scenario === scenario) };
}

function renderScrollCheckpoint(baseline = "recorded") {
  const context = vm.createContext({ URLSearchParams });
  context.window = context;
  for (const file of ["campaign-comparison", "dashboard-data", "scroll-model", "scroll-summary"]) {
    vm.runInContext(readFileSync(new URL(`results/${file}.js`, root), "utf8"), context);
  }
  const api = context.KupuaDashboardData;
  const campaigns = JSON.parse(readFileSync(new URL("results/campaign-log.json", root), "utf8"));
  const data = api.build(histories, [...api.definitions, ...api.campaignDefinitions(campaigns)]);
  const checkpoint = data.checkpoints[`campaign:${campaigns.entries.at(-1).campaignId}`];
  const recordsFor = checkpoint => checkpoint.members.flatMap(id => data.entries[id].records.map(id => data.records[id]));
  const records = recordsFor(checkpoint), base = data.checkpoints[baseline], baseRecords = recordsFor(base);
  const densityEntry = checkpoint => data.entries[checkpoint.members.find(id => data.entries[id].family === "density")];
  const linked = (_record, _key, text) => text;
  return context.renderScrollSummary({ rs: records, base, baseRecords, densityEntry: densityEntry(checkpoint),
    baselineDensityEntry: densityEntry(base), find: scenario => records.find(record => record.scenario === scenario),
    esc: String, format: (value, unit = "") => `${value}${unit ? ` ${unit}` : ""}`, href: () => "#evidence",
    pair: () => ({ ok: false, reason: "Test keeps baseline values separate" }), scrollGroupLink: (_group, text) => text,
    state: { density: "all", direction: "forward", phase: "middle", workload: "ordinary", statistic: "median" }
  }, { linked, lane: () => "", axis: () => "" });
}

test("image frame context keeps observations, frame populations and boundaries distinct", () => {
  const context = loadPresentation();
  vm.runInContext(readFileSync(new URL("results/image-summary.js", root), "utf8"), context);
  const api = context.KupuaDashboardData, data = api.build(histories);
  const records = Object.values(data.records).filter(record => ["P13b", "P15b"].includes(record.scenario));
  const html = context.renderImageWorkflowSummary({ cp: { synthetic: false }, rs: records, base: null,
    find: () => null, read: api.measure, format: String, esc: String, groupLink: (_group, text) => text
  }, { linked: (_record, _field, text) => text, actions: () => "", traversal: () => "" });
  assert.match(html, /Frames per observation · median/);
  assert.match(html, /Frame p95 · median/);
  assert.match(html, /Worst frame · median/);
  assert.match(html, /LoAF blocking · median/);
  assert.match(html, /visible-stable-focused-destination/);
  assert.match(html, /two-decoded-fullscreen-commits/);
  assert.match(html, /not action latency/);
  assert.match(html, /not pooled frame samples/);
});

test("scroll coverage follows the selected baseline's actual long membership", () => {
  const canonical = renderScrollCheckpoint();
  assert.match(canonical, /Baseline long responsiveness is included/);
  assert.doesNotMatch(canonical, /Baseline long responsiveness remains absent/);
  const proxy = renderScrollCheckpoint("proxy-baseline");
  assert.match(proxy, /Baseline long responsiveness is absent/);
  assert.match(proxy, /no older long run is borrowed/i);
});

test("recovery shows adverse tails and saved demand without inventing censor causes", () => {
  const html = renderScrollCheckpoint();
  const constrained = html.slice(html.indexOf('aria-label="Constrained stopped recovery"'));
  const justified = constrained.match(/<tr><th scope="row">Justified[\s\S]*?<\/tr>/)[0];
  assert.match(justified, /Cohort changed: median 0 · observed maximum 1/);
  assert.match(justified, /3\/4 complete · 1\/4 unavailable · partial/);
  assert.match(justified, /Visible \/ decoded/);
  assert.match(constrained, /Request carry-in \/ pending/);
  assert.match(constrained, /314.5/);
  assert.match(constrained, /172.5/);
  assert.match(constrained, /global requests, not current-visible ownership/i);
  assert.doesNotMatch(constrained, /4,000 ms delivery timeout/);
});

function legacySummary() {
  const source = readFileSync(new URL("results/density-dashboard.js", root), "utf8");
  const context = vm.createContext({});
  vm.runInContext(`const fieldFor = (key, phase) => phase ? phase + key[0].toUpperCase() + key.slice(1) : key;\n${source.slice(source.indexOf("  function completeValue("), source.indexOf("  function renderPressure("))}\n${source.slice(source.indexOf("  function summarizeDensity("), source.indexOf("  function openMeasurement("))}`, context);
  return context.summarizeDensity;
}
const plain = value => JSON.parse(JSON.stringify(value));
const limits = summary => Object.fromEntries(Object.entries(summary.components).map(([star, components]) => [star, components.map(({ name, fraction, key, phase }) => ({ name, fraction, key, phase }))]));

test("scroll v1 canonical and proxy scores, reasons and every limiting formula match legacy", () => {
  const { api, model, data } = loadScroll(), legacy = legacySummary();
  for (const checkpoint of ["recorded", "proxy-baseline"]) {
    const entry = data.entries[data.checkpoints[checkpoint].members.find(id => data.entries[id].family === "density")];
    const records = entry.records.map(id => data.records[id]);
    for (const density of ["grid", "justified", "table"]) {
      const actual = model.summarize(entry, records, density), expected = legacy(entry.sourceRecord, density);
      assert.deepEqual(plain(actual.scores), plain(expected.scores), `${checkpoint}/${density} scores`);
      assert.deepEqual(plain(actual.reasons), plain(expected.reasons), `${checkpoint}/${density} reasons`);
      assert.equal(actual.compatibility, expected.compatibility);
      assert.deepEqual(plain(limits(actual)), plain(limits(expected)), `${checkpoint}/${density} limits`);
      for (const components of Object.values(actual.components)) for (const component of components) {
        assert.ok(records.includes(component.record), "component owns an adapted canonical record");
        assert.equal(model.field(component.key, component.phase), api.phaseField(component.key, component.phase));
      }
      const reverse = records.find(record => record.raw.density === density && record.raw.workload === "scroll-backward");
      assert.equal(api.read(reverse, "reversalRequestedResultsPerSecond"), 100, "recorded reverse demand is not an invented gap");
      assert.ok(api.read(reverse, "reversalAchievedResultsPerSecond") > 0);
    }
  }
});

test("scroll field helpers and routes preserve exact local drilldown state", () => {
  const { api, model, get } = loadScroll();
  assert.equal(model.field("frameP95Ms", "reversal"), "reversalFrameP95Ms");
  assert.equal(model.field("frameP95Ms", ""), "frameP95Ms");
  assert.equal(model.baseField("earlyFrameP95Ms"), "frameP95Ms");
  assert.equal(model.fieldPhase("earlyFrameP95Ms"), "early");
  const record = get("D1-grid");
  assert.equal(model.value(record, "middleFrameP95Ms"), record.raw.metrics.middleFrameP95Ms.median);
  assert.equal(model.value(record, "middleFrameP95Ms", "p95"), record.raw.metrics.middleFrameP95Ms.p95);
  assert.equal(model.value(record, "middleFrameP95Ms", "invented"), null);
  for (const density of ["all", "grid", "justified", "table"]) for (const direction of ["forward", "backward"]) for (const phase of ["early", "middle", "late", "reversal"]) for (const workload of ["ordinary", "constrained"]) for (const statistic of ["median", "p95"]) {
    const state = { cp: "recorded", base: "proxy-baseline", view: "scroll", density, direction, phase, workload, statistic, evidence: record.id, metric: model.field("frameP95Ms", phase), side: "baseline" };
    const params = new URLSearchParams(api.route(state).slice(1));
    for (const key of ["density", "direction", "phase", "workload", "statistic", "evidence", "metric", "side"]) assert.equal(params.get(key), state[key]);
    assert.equal(params.get("checkpoint"), state.cp);
    assert.equal(params.get("baseline"), state.base);
  }
});

test("every density phase rejects invalid scope, frames and unsupported shifts without losing raw evidence", () => {
  const { api, model, get, entry } = loadScroll();
  for (const phase of ["early", "middle", "late", "reversal"]) {
    const original = get(phase === "reversal" ? "D2-grid" : "D1-grid");
    const field = model.field("frameP95Ms", phase);
    for (const [guard, patch, state] of [
      ["trackingOverflow", { p95: 1 }, "invalid"], ["regionDetached", { median: 1 }, "invalid"],
      ["frameSampleCount", { median: 0, p95: 0 }, "invalid"], ["frameCount", { p95: 0 }, "invalid"]
    ]) {
      const record = { ...original, raw: structuredClone(original.raw) };
      Object.assign(record.raw.metrics[model.field(guard, phase)], patch);
      assert.equal(api.population(record, field).state, state, `${phase}/${guard}`);
      assert.equal(model.value(record, field), null);
      assert.equal(model.value(record, field, "p95"), null);
      assert.equal(api.statistic(record, field).median, null);
      assert.equal(api.read(record, field), original.raw.metrics[field].median);
      assert.equal(api.recordPair(record, original, entry, entry, field).ok, false);
      assert.match(model.reason(record, field), /Invalid|unavailable/);
    }
    const record = { ...original, raw: structuredClone(original.raw) };
    record.raw.metrics[model.field("layoutShiftSupported", phase)].p95 = 0;
    const shift = model.field("layoutShiftValue", phase);
    assert.equal(api.population(record, shift).state, "unsupported");
    assert.equal(model.value(record, shift), null);
    assert.equal(api.read(record, shift), original.raw.metrics[shift].median);
    assert.equal(api.recordPair(record, original, entry, entry, shift).ok, false);
  }
});

test("sampled geometry, maintenance and paint obey field-specific support gates", () => {
  const { api, model, get } = loadScroll();
  for (const phase of ["", "reversal"]) {
    const original = get(phase ? "D2-grid" : "D1-grid"), field = model.field("retainedDisplacementMaxPx", phase);
    for (const [guard, patch] of [["stabilityCaptureRevision", { p95: 2 }], ["retainedSourceChanges", { p95: 1 }], ["retainedComparisons", { median: 0, p95: 0 }], ["stabilityObservationGapMaxMs", { p95: 251 }], ["retainedDisplacementMaxPx", { median: -4, p95: -1 }]]) {
      const record = { ...original, raw: structuredClone(original.raw) };
      Object.assign(record.raw.metrics[model.field(guard, phase)], patch);
      assert.equal(model.value(record, field), null, `${phase}/${guard}`);
      assert.equal(api.population(record, field).state, "invalid");
      assert.equal(api.read(record, field), record.raw.metrics[field].median);
    }
  }
  for (const change of [raw => raw.geometryScope = "unknown", raw => raw.metrics.evictionCount.p95 = 0, raw => raw.metrics.prependCount.p95 = -1, raw => raw.metrics.trackingOverflow.p95 = 1]) {
    const original = get("D7-grid"), record = { ...original, raw: structuredClone(original.raw) };
    change(record.raw);
    assert.equal(model.value(record, "frameP95Ms"), null);
    assert.equal(api.population(record, "frameP95Ms").state, "invalid");
  }
  const record = get("D1-grid");
  assert.equal(api.population(record, "paintMismatchCount").state, "unsupported");
  assert.equal(model.value(record, "paintMismatchCount"), null);
  assert.match(model.reason(record, "paintMismatchCount"), /Paint not captured/);
  assert.equal(model.value(record, "paintCaptureAvailable"), 0);
  const signed = { scenario: "P4a", raw: { sampleCount: 4, focusDriftPx: -12 } };
  assert.equal(api.read(signed, "focusDriftPx"), -12);
  assert.equal(api.measure(signed, "focusDriftPx"), -12, "signed displacement is not clamped or silently absolutized");
});

test("partial recovery, absent, null and real zero remain distinct in the shared scroll model", () => {
  const { api, model, get, entry } = loadScroll();
  const original = get("D8-grid"), record = { ...original, raw: structuredClone(original.raw) };
  const metric = record.raw.metrics.stopMediaReadyMs;
  Object.assign(metric, { median: 0, p95: 0, sampleCount: 2, unavailableCount: 2 });
  assert.equal(api.population(record, "stopMediaReadyMs").state, "partial");
  assert.equal(api.read(record, "stopMediaReadyMs"), 0);
  assert.equal(model.value(record, "stopMediaReadyMs"), null);
  assert.equal(model.value(record, "stopMediaReadyMs", "p95"), null);
  assert.match(model.reason(record, "stopMediaReadyMs"), /Partial/);
  assert.equal(api.recordPair(record, original, entry, entry, "stopMediaReadyMs").ok, false);
  Object.assign(metric, { sampleCount: 4, unavailableCount: 0 });
  assert.equal(model.value(record, "stopMediaReadyMs"), 0);
  assert.equal(model.value(record, "stopMediaReadyMs", "p95"), 0);
  Object.assign(metric, { median: null, p95: null, sampleCount: 0, unavailableCount: 4 });
  assert.equal(api.population(record, "stopMediaReadyMs").state, "unavailable");
  delete record.raw.metrics.stopMediaReadyMs;
  assert.equal(api.population(record, "stopMediaReadyMs").state, "absent");
  assert.match(model.reason(record, "stopMediaReadyMs"), /absent/);
  assert.equal(api.recordPair(record, original, entry, entry, "stopMediaReadyMs").ok, false);
});

test("missing phases, rejected journeys and incompatible entry records never create replacement indices", () => {
  const { api, model, get, records, entry, data } = loadScroll();
  const original = get("D1-grid");
  for (const patch of [{ captureValid: false }, { supported: false }]) {
    const record = { ...original, raw: { ...structuredClone(original.raw), ...patch } };
    assert.equal(model.value(record, "middleFrameP95Ms"), null);
    assert.equal(model.value(record, "middleFrameP95Ms", "p95"), null);
    assert.deepEqual(plain(model.summarize(entry, records.map(item => item === original ? record : item), "grid").scores), {});
  }
  const record = { ...original, raw: structuredClone(original.raw) };
  delete record.raw.metrics.lateFrameP95Ms;
  const summary = model.summarize(entry, records.map(item => item === original ? record : item), "grid");
  assert.equal(summary.scores.smoothness, undefined);
  assert.match(summary.reasons.smoothness, /unavailable/);
  assert.equal(model.summarize(entry, records.filter(record => record.scenario !== "D2-grid"), "grid").compatibility, null);
  const baseline = data.entries[data.checkpoints["proxy-baseline"].members.find(id => data.entries[id].family === "density")];
  assert.equal(model.summarize(entry, baseline.records.map(id => data.records[id]), "grid").compatibility, null);
  const before = { ...original, raw: { ...structuredClone(original.raw), profile: "different" } };
  assert.equal(api.recordPair(original, before, entry, entry, "middleFrameP95Ms").ok, false);
});

test("retained v3 contract uses the same v1 formulas without acquiring a reverse leg", () => {
  const { model, entry, records } = loadScroll(), legacy = legacySummary();
  const adapted = records.map(record => {
    if (!["D1-grid", "D2-grid"].includes(record.scenario)) return record;
    const raw = structuredClone(record.raw);
    raw.scenarioRevision = 3;
    raw.profile = "density-v3-100resultsps-10s-3phases-stability";
    raw.metrics.refillCoverageComplete = { median: 1, p95: 1, sampleCount: 4, unavailableCount: 0 };
    return { ...record, raw };
  });
  const source = { ...entry.sourceRecord, metrics: Object.fromEntries(adapted.map(record => [record.scenario, record.raw])) };
  const actual = model.summarize(entry, adapted, "grid"), expected = legacy(source, "grid");
  assert.deepEqual(plain(actual.scores), plain(expected.scores));
  assert.deepEqual(plain(actual.reasons), plain(expected.reasons));
  assert.deepEqual(plain(limits(actual)), plain(limits(expected)));
  assert.equal(actual.components.smoothness.some(component => component.phase === "reversal"), false);
});

test("missing required reverse demand and invalid p95 guards cannot be substituted", () => {
  const { api, model, entry, records, get } = loadScroll();
  const original = get("D2-grid");
  for (const mutate of [raw => delete raw.metrics.reversalRequestedResultsPerSecond, raw => raw.metrics.reversalRequestedResultsPerSecond.p95 = null]) {
    const record = { ...original, raw: structuredClone(original.raw) };
    mutate(record.raw);
    const actual = model.summarize(entry, records.map(item => item === original ? record : item), "grid");
    assert.equal(actual.scores.progress, undefined);
    assert.match(actual.reasons.progress, /unavailable/);
    assert.equal(model.value(record, "reversalRequestedResultsPerSecond"), null);
  }
  for (const [guard, patch] of [["reversalRequestWindowCaptureRevision", { p95: 0 }], ["reversalRequestClockMissingCount", { p95: 1 }], ["reversalJourneyOverflow", { p95: 1 }]]) {
    const record = { ...original, raw: structuredClone(original.raw) };
    Object.assign(record.raw.metrics[guard], patch);
    assert.equal(api.population(record, "reversalFrameP95Ms").state, "invalid");
    assert.equal(api.measure(record, "reversalFrameP95Ms"), null);
  }
  const record = { ...original, raw: structuredClone(original.raw) };
  record.raw.metrics.reversalRetainedDisplacementMaxPx.p95 = -1;
  assert.equal(api.measure(record, "reversalRetainedDisplacementMaxPx"), null);
  assert.equal(model.summarize(entry, records.map(item => item === original ? record : item), "grid").scores.stability, undefined);
});

function loadSearch() {
  const context = vm.createContext({ URLSearchParams });
  for (const file of ["results/campaign-comparison.js", "results/dashboard-data.js", "results/search-model.js"]) {
    vm.runInContext(readFileSync(new URL(file, root), "utf8"), context);
  }
  const api = context.KupuaDashboardData, model = context.KupuaSearchModel, data = api.build(histories);
  const get = (scenario, checkpoint = "recorded") => data.checkpoints[checkpoint].members.flatMap(id => data.entries[id].records.map(id => data.records[id])).find(record => record.scenario === scenario);
  return { api, model, data, get };
}

const cloneRecord = record => ({ ...record, raw: structuredClone(record.raw) });

test("Search owns exactly the operator-confirmed 28 canonical records without duplicating PP9", () => {
  const { api, model, data, get } = loadSearch();
  const expected = {
    startup: ["JA1", "JB1", "P1"], actions: ["PP1", "PP2", "PP3", "PP4", "PP5", "PP8", "PP9", "JA3", "JB2", "JB3", "P6", "P9"],
    seeking: ["PP7", "PP7b", "PP7c", "JB4", "D5-grid", "D5-justified", "P3", "P3b", "P7"],
    restore: ["PP11"], refresh: ["D11-grid", "D11-justified"], background: ["PP10"]
  };
  const records = data.checkpoints.recorded.members.flatMap(id => data.entries[id].records.map(id => data.records[id]));
  assert.equal(records.filter(record => record.area === "search").length, 28);
  for (const [group, ids] of Object.entries(expected)) {
    assert.deepEqual(Array.from(records.filter(record => model.group(record) === group), record => record.scenario).sort(), ids.sort());
    for (const id of ids) assert.equal(get(id).area, "search");
  }
  assert.equal(model.group(get("PP9")), "actions");
  assert.equal(model.group(get("P13c")), null);
  assert.equal(get("PP10").primary, "dt_store_ready_ms");
  assert.equal(get("PP10").metricClass, "background-diagnostic");
  assert.match(get("PP9").limit, /restoration cross-link/);
  for (const id of ["P1", "P3", "P3b", "P7", "P9"]) assert.equal(get(id).primary, "p95Frame");
  assert.equal(get("P6").primary, "focusDriftPx");
  assert.equal(model.value(get("PP3"), "dt_visual_settled_ms"), 1114);
  assert.equal(model.value(get("PP7"), "dt_visual_settled_ms"), 1114);
  assert.equal(model.value(get("PP10"), get("PP10").primary), 1447);
  for (const [id, delta] of [["PP3", -43], ["PP7", -46]]) {
    const current = get(id), before = get(id, "proxy-baseline");
    assert.equal(api.recordPair(current, before, data.entries[current.entry], data.entries[before.entry]).ok, true);
    assert.equal(model.value(current, current.primary) - model.value(before, current.primary), delta);
  }
  assert.equal(get("JA1", "proxy-baseline"), undefined);
  const current = get("PP3"), before = cloneRecord(get("PP3", "proxy-baseline"));
  before.raw.scenarioRevision = 2;
  assert.match(api.recordPair(current, before, data.entries[current.entry], data.entries[before.entry]).reason, /scenarioRevision/);
});

test("focused sorts preserve healthy, mixed and all-degraded populations including optional absent zero", () => {
  const { api, model, data, get } = loadSearch();
  for (const id of ["PP3", "PP4"]) {
    for (const [healthy, degraded] of [[4, undefined], [3, 0], [2, 3], [0, 5], [0, 0]]) {
      const record = cloneRecord(get(id));
      record.raw.sampleCount = healthy;
      if (degraded === undefined) delete record.raw.degradedCount;
      else record.raw.degradedCount = degraded;
      Object.assign(record.raw, { dt_visual_settled_ms: 123, dt_visual_settled_p95_ms: 456, dt_status_ms: null, dt_status_p95_ms: null });
      const result = model.outcomes(record);
      assert.equal(result.healthy, healthy);
      assert.equal(result.degraded, degraded ?? 0);
      assert.equal(result.total, healthy + (degraded ?? 0));
      assert.equal(result.state, result.total === 0 ? "empty" : !healthy ? "degraded" : degraded ? "mixed" : "healthy");
      assert.equal(api.completion(record).total, result.total);
      assert.equal(model.value(record, "dt_visual_settled_ms"), healthy ? 123 : null);
      assert.equal(model.tail(record, "dt_visual_settled_ms").field, "dt_visual_settled_p95_ms");
      assert.equal(model.tail(record, "dt_visual_settled_ms").value, healthy ? 456 : null);
      assert.equal(model.tail(record, "dt_visual_settled_ms").label, healthy ? "Observed maximum" : "Recorded p95");
      assert.equal(api.population(record, "dt_visual_settled_ms").available, healthy);
      assert.equal(api.population(record, "dt_visual_settled_ms").total, result.total);
      assert.equal(model.value(record, "dt_status_ms"), null);
      assert.equal(api.fieldStatus(record, "dt_status_ms").state, healthy ? "null" : "unavailable");
      if (!healthy) {
        assert.equal(api.read(record, "dt_visual_settled_ms"), 123, "stale raw evidence remains exact");
        assert.equal(api.recordPair(record, record, data.entries[record.entry], data.entries[record.entry]).ok, false);
      }
      assert.equal(model.assessmentEvidence(record).usable, id === "PP3" && result.total > 0);
    }
    for (const [patch, state] of [[{ captureValid: false }, "invalid"], [{ supported: false }, "unsupported"], [{ degradedCount: -1 }, "invalid"], [{ degradedCount: null }, "invalid"]]) {
      const record = cloneRecord(get(id)); Object.assign(record.raw, patch);
      assert.equal(model.outcomes(record).state, state);
      assert.equal(model.outcomes(record).total, null);
      assert.equal(model.value(record, "dt_visual_settled_ms"), null);
      assert.equal(model.assessmentEvidence(record).usable, false);
    }
  }
  const optionalStatus = get("PP3");
  assert.equal(api.read(optionalStatus, "dt_status_ms"), null);
  assert.equal(model.value(optionalStatus, "dt_status_ms"), null);
  assert.match(optionalStatus.limit, /status correlation remains unresolved/);
});

test("PP10 withholds synthetic foreground evidence, completion and grades", () => {
  const { api, model, data, get } = loadSearch();
  const record = cloneRecord(get("PP10"));
  Object.assign(record.raw, { dt_ack_ms: 0, dt_first_visible_frame_ms: 10, dt_first_visible_frame_p95_ms: 20, dt_visual_settled_ms: 30, dt_status_ms: 0 });
  assert.equal(api.completion(record), null);
  assert.equal(model.outcomes(record).state, "background");
  assert.equal(model.outcomes(record).total, null);
  for (const field of ["dt_ack_ms", "dt_first_visible_frame_ms", "dt_visual_settled_ms", "dt_status_ms"]) {
    assert.equal(model.value(record, field), null);
    assert.match(model.reason(record, field), /Background diagnostic/);
    assert.equal(api.recordPair(record, record, data.entries[record.entry], data.entries[record.entry], field).ok, false);
  }
  assert.equal(model.tail(record, "dt_first_visible_frame_ms").value, null);
  assert.equal(model.value(record, "dt_store_ready_ms"), 1447);
  assert.equal(model.value(record, "mapEntryCount"), record.raw.mapEntryCount);
  assert.equal(model.assessmentEvidence(record).usable, false);
});

test("saved refresh deltas retain signed per-repetition values and genuine partial contributor counts", () => {
  const { api, model, data, get } = loadSearch();
  for (const id of ["D11-grid", "D11-justified"]) {
    const current = get(id), before = get(id, "proxy-baseline");
    for (const field of ["refreshDataDeltaMs", "refreshPlacementDeltaMs", "refreshMediaDeltaMs"]) {
      assert.equal(model.value(current, field), current.raw.metrics[field].median);
      assert.ok(model.value(current, field) < 0, "negative paired delta is legitimate");
      assert.equal(model.tail(current, field).value, current.raw.metrics[field].p95);
      assert.equal(model.tail(current, field).label, "Observed maximum");
      const all = model.refreshOutcomes(current, field), partial = model.refreshOutcomes(before, field);
      assert.deepEqual([all.state, all.available, all.unavailable, all.total], ["available", 4, 0, 4]);
      assert.deepEqual([partial.state, partial.available, partial.unavailable, partial.total], ["partial", 2, 2, 4]);
      assert.match(partial.reason, /isolation/);
      assert.equal(model.value(before, field), null);
      assert.equal(api.recordPair(current, before, data.entries[current.entry], data.entries[before.entry], field).ok, false);
    }
    assert.notEqual(model.value(current, "refreshMediaDeltaMs"), model.value(current, "busyMediaReadyMs") - model.value(current, "quietMediaReadyMs"), "never subtract arm medians");
  }
});

test("refresh isolation and media censor gates are independent and do not erase valid arm timings", () => {
  const { api, model, data, get } = loadSearch();
  const original = get("D11-grid");
  const patchMetric = (record, field, value) => Object.assign(record.raw.metrics[field], { median: value, p95: value });
  for (const [guard, value] of [["refreshComparisonCensored", 1], ["quietMediaPendingAtDispatch", 1], ["busyMediaPendingAtDispatch", 0], ["quietDataPendingAtDispatch", 1], ["busyDataPendingAtDispatch", 1], ["quietPrimingMediaCensored", 1], ["quietDataRequestStarts", 0], ["busyDataRequestStarts", 0], ["quietDataHttpErrors", 1], ["busyDataRequestFailures", 1]]) {
    const record = cloneRecord(original); patchMetric(record, guard, value);
    for (const field of ["refreshDataDeltaMs", "refreshPlacementDeltaMs", "refreshMediaDeltaMs"]) {
      assert.equal(model.value(record, field), null, guard);
      assert.match(model.reason(record, field), /isolation/);
      assert.equal(api.recordPair(record, original, data.entries[record.entry], data.entries[original.entry], field).ok, false);
    }
    assert.equal(model.value(record, "quietPlacementMs"), original.raw.metrics.quietPlacementMs.median);
    assert.equal(model.value(record, "busyMediaReadyMs"), original.raw.metrics.busyMediaReadyMs.median);
  }
  for (const arm of ["quiet", "busy"]) {
    const record = cloneRecord(original); record.raw.metrics[`${arm}MediaCensored`].p95 = 1;
    assert.equal(model.value(record, "refreshMediaDeltaMs"), null);
    assert.match(model.refreshOutcomes(record, "refreshMediaDeltaMs").reason, /media endpoint censored/);
    assert.equal(model.value(record, "refreshDataDeltaMs"), original.raw.metrics.refreshDataDeltaMs.median);
    assert.equal(model.value(record, "refreshPlacementDeltaMs"), original.raw.metrics.refreshPlacementDeltaMs.median);
    assert.equal(model.value(record, `${arm}MediaReadyMs`), null);
    assert.equal(model.value(record, `${arm}PlacementMs`), original.raw.metrics[`${arm}PlacementMs`].median);
    const other = arm === "quiet" ? "busy" : "quiet";
    assert.equal(model.value(record, `${other}MediaReadyMs`), original.raw.metrics[`${other}MediaReadyMs`].median);
  }
  for (const mutate of [
    record => record.raw.supported = false,
    record => record.raw.captureValid = false,
    record => delete record.raw.sampleCount,
    record => delete record.raw.metrics.refreshMediaDeltaMs.sampleCount,
    record => record.raw.metrics.refreshMediaDeltaMs.unavailableCount = 1,
    record => record.raw.metrics.quietRequestCaptureRevision.p95 = 0,
    record => record.raw.metrics.busyRequestTimingCaptureRevision.p95 = 0,
    record => record.raw.metrics.quietRequestCaptureOverflow.p95 = 1
  ]) {
    const record = cloneRecord(original); mutate(record);
    const outcomes = model.refreshOutcomes(record, "refreshMediaDeltaMs");
    assert.equal(outcomes.available, null);
    assert.equal(outcomes.unavailable, null);
    assert.equal(outcomes.total, null);
    assert.ok(outcomes.reason);
    assert.equal(model.value(record, "refreshMediaDeltaMs"), null);
  }
  const partial = cloneRecord(original);
  Object.assign(partial.raw.metrics.refreshMediaDeltaMs, { median: 99, p95: 100, sampleCount: 2, unavailableCount: 2 });
  assert.equal(model.refreshOutcomes(partial, "refreshMediaDeltaMs").state, "partial");
  assert.equal(model.value(partial, "refreshMediaDeltaMs"), null);
  const zero = cloneRecord(original); patchMetric(zero, "refreshMediaDeltaMs", 0);
  assert.equal(model.value(zero, "refreshMediaDeltaMs"), 0);
});

test("Search keeps signed guards, false visibility, actual tails and independent route controls", () => {
  const { api, model, get } = loadSearch();
  const guard = cloneRecord(get("P6"));
  Object.assign(guard.raw, { focusDriftPx: -12, focusVisible: false });
  assert.equal(model.value(guard, "focusDriftPx"), -12);
  assert.equal(model.value(guard, "focusVisible"), false);
  const record = cloneRecord(get("PP3")); record.raw.sampleCount = 40;
  assert.equal(model.tail(record, "dt_visual_settled_ms").label, "Recorded p95");
  for (const field of ["dt_store_ready_ms", "dt_first_visible_frame_ms", "dt_visual_settled_ms", "dt_ack_ms", "dt_status_ms"]) {
    assert.equal(model.phase(record, field), field);
    for (const regime of ["all", "buffer", "indexed", "seek"]) {
      const route = api.route({ cp: "recorded", base: "proxy-baseline", view: "search", phase: "reversal", workload: "scroll-backward", searchPhase: field, searchRegime: regime });
      const params = new URLSearchParams(route.slice(1));
      assert.equal(params.get("searchPhase"), field);
      assert.equal(params.get("searchRegime"), regime);
      assert.equal(params.get("phase"), "reversal");
      assert.equal(params.get("workload"), "scroll-backward");
    }
  }
});

test("matrix workflow ownership is explicit for scrolling and density cross-links", () => {
  const { data } = loadScroll();
  for (const record of Object.values(data.records)) {
    if (/^D(?:5|11)-/.test(record.scenario)) assert.equal(record.area, "search", record.scenario);
    if (/^D4-/.test(record.scenario)) assert.equal(record.area, "images", record.scenario);
    if (/^(?:P2|P8|P17|P4[ab]|P11b?@\d+|P16[ab]|PP6[bc]?)$/.test(record.scenario)) {
      assert.equal(record.area, "scroll", record.scenario);
      assert.ok(Object.hasOwn(record.raw, record.primary) || Object.hasOwn(record.raw.metrics ?? {}, record.primary));
      assert.match(record.workflow, /Browsing|Transitions & Maintenance/);
    }
  }
});

test("overview trends follow one topology and stop at the first non-comparable campaign", () => {
  const api = load();
  const all = api.buildAll(histories);
  const record = (timestamp, scenario) => Object.values(all.records).find(r => r.entry.endsWith(timestamp) && r.scenario === scenario);
  const trend = (timestamp, scenario, field) => api.trend(all, record(timestamp, scenario), field, r => api.measure(r, field));
  // Canonical TEST checkpoint: too little comparable history to draw (>3 required by the overview).
  assert.equal(trend("2026-10-24T08:33:51.333Z", "PP7", "dt_visual_settled_ms").values.length, 3);
  assert.equal(trend("2026-10-24T08:30:42.035Z", "P13c", "detailImageReadyMs").values.length, 1);
  const local = trend("2026-10-23T03:15:38.419Z", "PP3", "dt_visual_settled_ms");
  assert.equal(local.apiTopology, "local");
  assert.ok(local.values.length > 3);
  assert.equal(local.values.at(-1), api.measure(record("2026-10-23T03:15:38.419Z", "PP3"), "dt_visual_settled_ms"));
  // Density r4 does not reach back into r3/r2 contracts.
  assert.equal(trend("2026-10-23T03:30:04.279Z", "D1-table", "middleFrameP95Ms").values.length, 2);
  assert.equal(api.trend(all, { ...record("2026-10-23T03:15:38.419Z", "PP3"), synthetic: true }, "dt_visual_settled_ms", r => api.measure(r, "dt_visual_settled_ms")), null);
});

test("complete published campaigns become checkpoints; ids must match their entries", () => {
  const api = load();
  const stamped = JSON.parse(JSON.stringify(histories));
  const short = stamped.perceived.entries.find(entry => entry.timestamp === "2026-10-23T03:15:38.419Z");
  short.campaignId = "c-ok";
  const manifest = (campaignId, complete) => ({ campaignId, label: "Local", completedAt: "2026-10-23T03:20:00.000Z", complete,
    entries: [{ family: "perceived", kind: "short", timestamp: short.timestamp, runs: 4, scenarios: Object.keys(short.perceived) }] });
  const definitions = api.campaignDefinitions({ entries: [manifest("c-ok", true), manifest("c-bad", true), manifest("c-partial", false)] });
  assert.deepEqual(definitions.map(d => d.id), ["campaign:c-ok", "campaign:c-bad"]);
  const data = api.build(stamped, definitions);
  assert.equal(data.checkpoints["campaign:c-ok"].missing.length, 0);
  assert.equal(data.checkpoints["campaign:c-ok"].completed, Object.keys(short.perceived).length);
  assert.match(data.checkpoints["campaign:c-bad"].missing[0], /missing/);
});