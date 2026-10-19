import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DENSITY_METRIC_IDS, DENSITY_PROFILE, DENSITY_CONSTRAINED_PROFILE, DENSITY_RECOVERY_PROFILE, DENSITY_SCENARIOS, REQUIRED_DENSITY_METRICS,
  aggregateDensityRuns, buildDensityMarkdown, densityContractKey, densityEnvironmentKey,
  densityRecordsComparable, pairedDensityComparisons, parseDensitySuiteArgs,
  resolveSuiteSelection, validateDensityRecord, validateDensityRun,
} from "./density-reporting.mjs";
import { assertSameEnvironment, parseSuccessfulRun } from "./harness-validation.mjs";
import { createRequestProbe } from "./network-probe.mjs";
import * as densityReporting from "./density-reporting.mjs";

const emptyRequestProbe = createRequestProbe({ on() {}, off() {} });
const emptyRequestMetrics = emptyRequestProbe.snapshot();
emptyRequestProbe.dispose();

function record(scenario = DENSITY_SCENARIOS[0], value = 10) {
  const metrics = Object.fromEntries(REQUIRED_DENSITY_METRICS[scenario.workload].map(name => [name, /Ratio/.test(name) ? 0.25 : value]));
  if ("mediaCensored" in metrics) Object.assign(metrics, {
    mediaCensored: 0, mediaReadyMs: value, visibleMediaCount: 2, decodedMediaCount: 2, failedMediaCount: 0,
  });
  if (scenario.workload === "burst-recovery") Object.assign(metrics, {
    stopDataCensored: 0, stopDataReadyMs: value, stopMediaCensored: 0, stopMediaReadyMs: value,
    stopVisibleMediaCount: 2, stopDecodedMediaCount: 2, stopFailedMediaCount: 0,
    peakRefillsInFlight: 1, refillsPendingAtEnd: 0,
    forwardReadStarts: 1, backwardReadStarts: 1, readStartsAfterStop: 0,
  });
  if (scenario.workload === "scroll-endurance") {
    Object.assign(metrics, { endurancePhaseCount: 3, enduranceMaxGapMs: 2, enduranceInterrupted: 0 });
    for (const prefix of ["early", "middle", "late"]) {
      for (const [name, value] of Object.entries(emptyRequestMetrics)) metrics[prefix + name[0].toUpperCase() + name.slice(1)] = value;
    }
  }
  if (scenario.workload === "refresh-contention") {
    Object.assign(metrics, { refreshComparisonCensored: 1, refreshDataDeltaMs: null,
      refreshPlacementDeltaMs: null, refreshMediaDeltaMs: null });
    for (const prefix of ["quiet", "busy"]) Object.assign(metrics, {
      [`${prefix}DataReadyMs`]: value, [`${prefix}PlacementMs`]: value,
      [`${prefix}MediaReadyMs`]: value, [`${prefix}MediaCensored`]: 0,
      [`${prefix}VisibleMediaCount`]: 2, [`${prefix}DecodedMediaCount`]: 2,
      [`${prefix}FailedMediaCount`]: 0, [`${prefix}MediaPendingAtDispatch`]: 0,
      [`${prefix}DataPendingAtDispatch`]: 0,
    });
  }
  return { ...scenario, resultRegime: "seek", metrics };
}
const run = (value = 10) => DENSITY_SCENARIOS.map(scenario => record(scenario, value));
const environment = () => ({
  dataMode: "direct-es", apiTopology: "none", appBaseUrl: "http://localhost:3000",
  browserName: "chromium", browserVersion: "1", os: { platform: "test", architecture: "test", release: "1" },
  viewport: { width: 1720, height: 960 }, screen: { width: 1720, height: 960 },
  deviceScaleFactor: 2, headed: true, cpuThrottle: 0, cacheClass: "uncontrolled-browser-cache",
  workers: 1, stableUntil: "2026-02-15T00:00:00.000Z", gitSha: "one",
});

test("visible-wait metrics preserve old records and validate completed/censored episodes", () => {
  assert.equal(validateDensityRecord(record()).metrics.thumbnailWaitCaptureRevision, undefined);
  const sample = record();
  Object.assign(sample.metrics, {
    thumbnailWaitCaptureRevision: 1, thumbnailVisibleWaitCount: 2,
    thumbnailVisibleWaitMaxMs: 150, thumbnailVisibleWaitCompletedMaxMs: 100,
    thumbnailVisibleWaitCompletedCount: 1, thumbnailVisibleWaitCensoredCount: 1,
  });
  validateDensityRecord(sample);
  for (const change of [
    { thumbnailWaitCaptureRevision: 2 }, { thumbnailVisibleWaitCensoredCount: 0.5 },
    { thumbnailVisibleWaitCount: 3 }, { thumbnailVisibleWaitMaxMs: 50 },
    { thumbnailVisibleWaitCompletedMaxMs: null },
  ]) assert.throws(() => validateDensityRecord({ ...sample, metrics: { ...sample.metrics, ...change } }), /visible thumbnail wait/);
});

test("manifest is additive, directly spreadable and has only the approved Table diagnostics", () => {
  assert.equal(DENSITY_SCENARIOS.length, 25);
  assert.equal(new Set(DENSITY_METRIC_IDS).size, 25);
  assert.deepEqual(DENSITY_SCENARIOS.filter(s => s.density === "table").map(s => s.id), ["D1-table", "D2-table", "D8-table"]);
  assert.ok(DENSITY_SCENARIOS.slice(0, 21).every(s => s.scenarioRevision === (s.workload === "burst-recovery" ? 1 : s.workload === "window-maintenance" ? 3 : 2)));
  assert.ok(DENSITY_SCENARIOS.slice(0, 21).every(s => s.profile === (s.workload === "burst-recovery" ? DENSITY_RECOVERY_PROFILE : s.workload === "scroll-constrained" ? DENSITY_CONSTRAINED_PROFILE : DENSITY_PROFILE)));
  assert.ok(DENSITY_SCENARIOS.every(s => !Object.hasOwn(s, "requiredMetrics")));
  assert.equal(validateDensityRun(run()).length, 25);
});

test("endurance and refresh overlap have separate contracts without extra Table workloads", () => {
  const endurance = DENSITY_SCENARIOS.filter(scenario => scenario.workload === "scroll-endurance");
  const refresh = DENSITY_SCENARIOS.filter(scenario => scenario.workload === "refresh-contention");
  assert.deepEqual(endurance.map(scenario => scenario.id), ["D10-grid", "D10-justified"]);
  assert.deepEqual(refresh.map(scenario => scenario.id), ["D11-grid", "D11-justified"]);
  assert.ok([...endurance, ...refresh].every(scenario => scenario.scenarioRevision === 1));
  assert.ok(endurance.every(scenario => scenario.profile === "density-v1-1200pxs-3x8s-endurance"));
  assert.ok(refresh.every(scenario => scenario.profile === "density-v1-refresh-media-overlap-80ms-4mbps"));
  const sample = record(endurance[0]);
  assert.throws(() => validateDensityRecord({ ...sample, metrics: { ...sample.metrics, enduranceInterrupted: 1 } }), /endurance/);
  const overlap = record(refresh[0]);
  validateDensityRecord(overlap);
  assert.throws(() => validateDensityRecord({ ...overlap, metrics: { ...overlap.metrics,
    refreshComparisonCensored: 0 } }), /refresh/);
});

test("phase readiness leads stay signed while invalid request balances are rejected", () => {
  const sample = record(DENSITY_SCENARIOS.find(scenario => scenario.id === "D10-grid"));
  sample.metrics.earlyDecodedReadinessLeadPxMedian = -100;
  validateDensityRecord(sample);
  assert.throws(() => validateDensityRecord({ ...sample, metrics: { ...sample.metrics,
    earlyMediaRequestsPending: 1 } }), /request cohort/);
});

test("refresh deltas are paired per repetition and unsupported overlap is explicitly censored", () => {
  const metrics = {
    quietMediaPendingAtDispatch: 0, busyMediaPendingAtDispatch: 2,
    quietDataPendingAtDispatch: 0, busyDataPendingAtDispatch: 0, quietPrimingMediaCensored: 0,
    quietDataRequestStarts: 1, busyDataRequestStarts: 1, quietDataHttpErrors: 0, busyDataHttpErrors: 0,
    quietDataRequestFailures: 0, busyDataRequestFailures: 0,
    quietDataReadyMs: 40, busyDataReadyMs: 80, quietPlacementMs: 50, busyPlacementMs: 90,
    quietMediaReadyMs: 100, busyMediaReadyMs: 120, quietMediaCensored: 0, busyMediaCensored: 0,
  };
  assert.deepEqual(densityReporting.refreshComparisonMetrics(metrics), {
    refreshComparisonCensored: 0, refreshDataDeltaMs: 40, refreshPlacementDeltaMs: 40, refreshMediaDeltaMs: 20,
  });
  const faster = densityReporting.refreshComparisonMetrics({ ...metrics, busyDataReadyMs: 30, busyPlacementMs: 40, busyMediaReadyMs: 90 });
  assert.equal(faster.refreshDataDeltaMs, -10);
  for (const change of [{ busyMediaPendingAtDispatch: 0 }, { quietMediaPendingAtDispatch: null },
    { quietPrimingMediaCensored: 1 }, { quietDataHttpErrors: 1 }, { quietDataRequestStarts: 0 }]) {
    assert.deepEqual(densityReporting.refreshComparisonMetrics({ ...metrics, ...change }), {
      refreshComparisonCensored: 1, refreshDataDeltaMs: null, refreshPlacementDeltaMs: null, refreshMediaDeltaMs: null,
    });
  }
  assert.equal(densityReporting.refreshComparisonMetrics({ ...metrics, busyMediaCensored: 1, busyMediaReadyMs: null }).refreshMediaDeltaMs, null);
});

test("revision 2 separates normal workloads from automatically included constrained scroll", () => {
  assert.equal(DENSITY_PROFILE, "density-v2-1200pxs-unthrottled");
  assert.equal(DENSITY_CONSTRAINED_PROFILE, "density-v2-1200pxs-80ms-4mbps-scroll-only");
  const constrained = DENSITY_SCENARIOS.filter(s => s.workload === "scroll-constrained");
  assert.deepEqual(constrained.map(s => s.id), ["D8-grid", "D8-justified", "D8-table"]);
  assert.ok(constrained.every(s => s.completionBoundary === "four-second-controlled-scroll"
    && s.cacheClass === "browser-cache-disabled-during-scroll-renderer-warm-proxy-uncontrolled"));
  assert.ok(DENSITY_SCENARIOS.filter(s => s.workload === "scroll-cold").every(s =>
    s.cacheClass === constrained[0].cacheClass && s.profile === DENSITY_PROFILE));
  assert.ok(DENSITY_SCENARIOS.filter(s => s.workload === "scroll-warm").every(s => s.cacheClass === "browser-repeat-path"));
  const sessionWarm = DENSITY_SCENARIOS.slice(0, 21).filter(s => !s.workload.startsWith("scroll-") && s.workload !== "burst-recovery");
  assert.equal(sessionWarm.length, 10);
  assert.ok(sessionWarm.every(s => s.cacheClass === "browser-session-setup-renderer-warm-proxy-uncontrolled"));
  const maintenance = sessionWarm.filter(s => s.workload === "window-maintenance");
  assert.deepEqual(maintenance.map(s => s.id), ["D7-grid", "D7-justified"]);
  assert.ok(maintenance.every(s => s.completionBoundary === "tail-admission-first-forward-eviction-visible-anchor"));
  assert.throws(() => validateDensityRecord({ ...record(maintenance[0]), scenarioRevision: 2 }), /mismatched scenarioRevision/);
  for (const scenario of sessionWarm) {
    const sample = record(scenario);
    assert.throws(() => validateDensityRecord({ ...sample,
      cacheClass: "browser-cache-reset-setup-renderer-warm-proxy-uncontrolled" }), /mismatched cacheClass/);
  }
  assert.throws(() => validateDensityRecord({ ...record(maintenance[0]),
    completionBoundary: "first-forward-eviction-visible-anchor" }), /mismatched completionBoundary/);
  assert.equal(REQUIRED_DENSITY_METRICS["scroll-constrained"], REQUIRED_DENSITY_METRICS["scroll-cold"]);
  assert.throws(() => validateDensityRun(run().filter(s => s.workload !== "scroll-constrained")), /Missing density scenarios: D8-grid, D8-justified, D8-table/);
  const normal = record(), constrainedRecord = record(constrained[0]);
  assert.notEqual(densityContractKey(normal), densityContractKey(constrainedRecord));
  assert.equal(densityRecordsComparable(normal, constrainedRecord, environment(), environment()), false);
  assert.throws(() => validateDensityRecord({ ...normal, profile: DENSITY_CONSTRAINED_PROFILE }), /mismatched profile/);
  const historical = { ...normal, scenarioRevision: 1, profile: "density-v1-1200pxs-80ms-4mbps",
    cacheClass: "browser-cache-disabled-proxy-uncontrolled" };
  const preserved = structuredClone(historical);
  assert.throws(() => validateDensityRecord(historical), /mismatched scenarioRevision/);
  assert.equal(densityRecordsComparable(normal, historical, environment(), environment()), false);
  assert.deepEqual(historical, preserved);
});

test("runner auth guidance never recommends storing credentials in the repository", () => {
  const source = readFileSync(new URL("./run-audit.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /--save-storage=kupua\//);
  assert.match(source, /private location outside the repository/);
  assert.match(source, /README\.md#authentication-state/);
});

test("full campaign shorthand expands without changing legacy selections or option values", () => {
  assert.deepEqual(parseDensitySuiteArgs(["--full", "--use-media-api", "--runs", "4", "--label", "baseline"]),
    { suite: "combined", args: ["--use-media-api", "--runs", "4", "--label", "baseline", "--perceived"] });
  assert.deepEqual(parseDensitySuiteArgs(["--full", "--suite", "combined", "--perceived"]),
    { suite: "combined", args: ["--perceived"] });
  assert.deepEqual(parseDensitySuiteArgs(["--label", "--full"]), { suite: "existing", args: ["--label", "--full"] });
  assert.throws(() => parseDensitySuiteArgs(["--full", "--label"]), /requires a value/);
  assert.throws(() => parseDensitySuiteArgs(["--full", "--runs"]), /requires a value/);
  const parsed = parseDensitySuiteArgs(["--full"]);
  assert.deepEqual(resolveSuiteSelection({ suite: parsed.suite, perceivedFull: parsed.args.includes("--perceived") }),
    { runJank: true, runShort: true, runLong: true, runDensity: true });
  for (const args of [["--full", "--suite", "existing"], ["--suite", "justified", "--full"],
    ["--full", "--perceived-only"], ["--full", "--short-perceived-only"], ["--full", "--long-perceived-only"],
    ["--full", "P3"], ["--full", "--full"]]) {
    assert.throws(() => parseDensitySuiteArgs(args), /--full/);
  }
});

test("default routing and all legacy perceived modes stay unchanged", () => {
  assert.deepEqual(parseDensitySuiteArgs([]), { suite: "existing", args: [] });
  assert.deepEqual(resolveSuiteSelection(), { runJank: true, runShort: false, runLong: false, runDensity: false });
  for (const [flag, expected] of [
    ["perceivedFull", [true, true, true]], ["perceivedOnly", [false, true, true]],
    ["shortOnly", [false, true, false]], ["longOnly", [false, false, true]],
  ]) {
    const actual = resolveSuiteSelection({ [flag]: true });
    assert.deepEqual([actual.runJank, actual.runShort, actual.runLong], expected);
    assert.equal(actual.runDensity, false);
  }
});

test("justified means additive comparisons, combined routes old flags and filters only to old suites", () => {
  assert.deepEqual(resolveSuiteSelection({ suite: "justified" }), { runJank: false, runShort: false, runLong: false, runDensity: true });
  assert.deepEqual(resolveSuiteSelection({ suite: "combined", shortOnly: true, grepArg: "PP1" }),
    { runJank: false, runShort: true, runLong: false, runDensity: true });
  assert.deepEqual(parseDensitySuiteArgs(["P3,P8", "--suite", "combined", "--runs", "4"]),
    { suite: "combined", args: ["P3,P8", "--runs", "4"] });
  assert.deepEqual(parseDensitySuiteArgs(["--label", "--suite"]), { suite: "existing", args: ["--label", "--suite"] });
});

test("ambiguous/invalid suite routing is rejected before execution", () => {
  for (const args of [["--suite"], ["--suite", "other"], ["--suite", "existing", "--suite", "combined"]]) {
    assert.throws(() => parseDensitySuiteArgs(args));
  }
  for (const flags of [{ grepArg: "P3" }, { perceivedFull: true }, { perceivedOnly: true }, { shortOnly: true }, { longOnly: true }]) {
    assert.throws(() => resolveSuiteSelection({ suite: "justified", ...flags }), /cannot use/);
  }
  for (const value of ["0", "-1", "1.5", "2oops", "NaN", "9007199254740992"]) {
    assert.throws(() => parseDensitySuiteArgs(["--suite", "justified", "--runs", value]), /positive integer/);
  }
  assert.throws(() => resolveSuiteSelection({ suite: "unknown" }), /--suite/);
  assert.throws(() => resolveSuiteSelection({ perceivedOnly: true, shortOnly: true }), /mutually exclusive/);
  assert.throws(() => resolveSuiteSelection({ suite: "combined", pruneHistory: true }), /maintenance/);
  assert.throws(() => resolveSuiteSelection({ suite: "justified", rebuildHistory: true }), /maintenance/);
});

test("runner wiring remains separate and uses atomic deferred writes and shared environment gate", () => {
  const source = readFileSync(new URL("./run-audit.mjs", import.meta.url), "utf8");
  assert.match(source, /parseDensitySuiteArgs\(process.argv.slice\(2\)\)/);
  assert.match(source, /resolveSuiteSelection\(/);
  assert.match(source, /if \(runDensity\) await runDensitySuite/);
  assert.match(source, /KUPUA_DENSITY_RUN_INDEX: String\(runIndex\)/);
  assert.match(source, /playwright.density.config.ts/);
  const section = source.slice(source.indexOf("async function runDensitySuite"), source.indexOf("async function main"));
  assert.match(section, /assertSameEnvironment/);
  assert.match(section, /readEnvironment/);
  assert.match(section, /historyWrites.defer/);
  assert.doesNotMatch(section, /writeFileSync|commitFileTransaction/);
});

test("malformed, missing, duplicate, unexpected and nonfinite records fail closed", () => {
  assert.throws(() => validateDensityRun([]), /Missing/);
  assert.throws(() => validateDensityRun([...run(), run()[0]]), /Duplicate/);
  assert.throws(() => validateDensityRun(run().slice(1)), /Missing/);
  for (const bad of [null, [], {}, { ...record(), id: "P1" }, { ...record(), scenarioRevision: 1 },
    { ...record(), density: "table" }, { ...record(), workload: "seek" }, { ...record(), profile: "other" },
    { ...record(), secret: "not allowed" }, { ...record(), resultRegime: "" }, { ...record(), metrics: [] }]) {
    assert.throws(() => validateDensityRecord(bad));
  }
  for (const value of [NaN, Infinity, -Infinity, "1", true, {}]) {
    assert.throws(() => validateDensityRecord({ ...record(), metrics: { ...record().metrics, optional: value } }), /numeric/);
  }
  const missing = record(); delete missing.metrics.elapsedMs;
  assert.throws(() => validateDensityRecord(missing), /elapsedMs/);
  assert.throws(() => parseSuccessfulRun({ exitCode: 0, suiteLabel: "density", contents: "{broken", sourcePath: "test" }), /Malformed/);
  assert.throws(() => parseSuccessfulRun({ exitCode: 1, suiteLabel: "density", contents: "", sourcePath: "test" }), /exited/);
});

test("fixed revision contracts and supported scrubber regimes fail closed", () => {
  const sample = record();
  for (const field of ["cacheClass", "completionBoundary", "geometryScope"]) {
    assert.throws(() => validateDensityRecord({ ...sample, [field]: "different" }), /mismatched/);
    const records = run().map(item => ({ ...item, [field]: "different" }));
    assert.throws(() => aggregateDensityRuns([records, records]), /mismatched/);
  }
  for (const resultRegime of ["buffer", "indexed", "seek"]) {
    assert.equal(validateDensityRecord({ ...sample, resultRegime }).resultRegime, resultRegime);
  }
  for (const resultRegime of ["unknown", "resident", "", null]) {
    assert.throws(() => validateDensityRecord({ ...sample, resultRegime }), /resultRegime/);
  }
});

test("observer invalidation cannot enter a successful campaign", () => {
  for (const field of ["trackingOverflow", "regionDetached"]) {
    const sample = record();
    assert.equal(validateDensityRecord({ ...sample, metrics: { ...sample.metrics, [field]: 0 } }).metrics[field], 0);
    for (const value of [1, 2, null]) {
      assert.throws(() => validateDensityRecord({ ...sample, metrics: { ...sample.metrics, [field]: value } }), /invalidated capture/);
    }
  }
});

test("durations, counts and exposure stay nonnegative; normalized ratios stay bounded; readiness leads stay signed", () => {
  const sample = record();
  for (const name of ["decodedCount", "pendingAtEnd", "elapsedMs", "exposureAreaMs", "layoutShiftValue", "thumbnailExposureAreaMs"]) {
    assert.throws(() => validateDensityRecord({ ...sample, metrics: { ...sample.metrics, [name]: -0.1 } }), /negative metric/);
  }
  for (const name of ["pendingAreaRatioMean", "pendingAreaRatioMax", "thumbnailPendingAreaRatioMean", "placeholderAreaRatioMean"]) {
    for (const value of [-0.01, 1.01]) {
      assert.throws(() => validateDensityRecord({ ...sample, metrics: { ...sample.metrics, [name]: value } }), /negative metric|ratio outside/);
    }
    for (const value of [0, 1]) {
      assert.equal(validateDensityRecord({ ...sample, metrics: { ...sample.metrics, [name]: value } }).metrics[name], value);
    }
  }
  for (const name of ["readinessLeadPxMedian", "decodedReadinessLeadPxMedian"]) {
    assert.equal(validateDensityRecord({ ...sample, metrics: { ...sample.metrics, [name]: -150 } }).metrics[name], -150);
  }
});

test("all repetition identities are checked including cache, regime, profile, geometry and boundary", () => {
  for (const [field, value] of [["cacheClass", "different"], ["resultRegime", "indexed"],
    ["completionBoundary", "different"], ["geometryScope", "different"]]) {
    const second = run(); second[0][field] = value;
    assert.throws(() => aggregateDensityRuns([run(), second]), /contract changed|mismatched/);
  }
  const second = run(); second[0].profile = "other";
  assert.throws(() => aggregateDensityRuns([run(), second]), /profile/);
  assert.throws(() => aggregateDensityRuns([]), /No density runs/);
});

test("median/p95 metrics preserve decimals and sparse optional fields stay unavailable", () => {
  const first = run(1.5), second = run(4.5);
  // D7 requires integer publication/eviction counters.
  for (const records of [first, second]) for (const item of records.filter(item => item.workload === "window-maintenance")) {
    item.metrics.evictionCount = 1; item.metrics.prependCount = 0;
  }
  first[0].metrics.readinessLeadPxMedian = null;
  first[0].metrics.unsupported = null;
  second[0].metrics.unsupported = null;
  first[0].metrics.sparse = 15;
  const result = aggregateDensityRuns([first, second])[first[0].id];
  assert.deepEqual(result.metrics.elapsedMs, { median: 3, p95: 4.5, sampleCount: 2, unavailableCount: 0 });
  assert.deepEqual(result.metrics.sparse, { median: null, p95: null, sampleCount: 1, unavailableCount: 1 });
  assert.deepEqual(result.metrics.unsupported, { median: null, p95: null, sampleCount: 0, unavailableCount: 2 });
  assert.equal(result.metrics.readinessLeadPxMedian.median, null);
  assert.equal(result.metrics.notReported, undefined);
});

test("optional unobserved readiness and unsupported shifts are not reported as zero", () => {
  const sample = record();
  Object.assign(sample.metrics, { readinessLeadPxMedian: null, layoutShiftValue: null, thumbnailShiftValue: null, layoutShiftSupported: 0 });
  assert.equal(validateDensityRecord(sample), sample);
});

test("media timeout/absence is explicitly censored and never counted as readiness success", () => {
  const scenario = DENSITY_SCENARIOS.find(s => s.workload === "seek");
  const sample = record(scenario);
  Object.assign(sample.metrics, { mediaReadyMs: null, mediaCensored: 1, decodedMediaCount: 1 });
  assert.equal(validateDensityRecord(sample), sample);
  for (const fields of [{ mediaCensored: 0 }, { mediaReadyMs: 10000 }, { mediaReadyMs: undefined }, { mediaCensored: 2 }]) {
    assert.throws(() => validateDensityRecord({ ...sample, metrics: { ...sample.metrics, ...fields } }), /media readiness|numeric metric/);
  }
  const noMedia = { ...sample, metrics: { ...sample.metrics, visibleMediaCount: 0, decodedMediaCount: 0 } };
  assert.equal(validateDensityRecord(noMedia), noMedia);
  const first = run(), second = run();
  const index = first.findIndex(s => s.id === scenario.id); second[index] = sample;
  const aggregated = aggregateDensityRuns([first, second])[scenario.id];
  assert.equal(aggregated.metrics.mediaReadyMs.median, null);
  assert.equal(aggregated.metrics.mediaReadyMs.sampleCount, 1);
  assert.equal(aggregated.metrics.placementMs.sampleCount, 2);
});

test("window-maintenance needs observed eviction and explicit geometry scope", () => {
  const sample = record(DENSITY_SCENARIOS.find(s => s.workload === "window-maintenance"));
  assert.equal(validateDensityRecord(sample), sample);
  assert.throws(() => validateDensityRecord({ ...sample, geometryScope: undefined }), /geometryScope/);
  assert.throws(() => validateDensityRecord({ ...sample, metrics: { ...sample.metrics, evictionCount: 0 } }), /window-maintenance/);
});

test("D9 recovery is automatic, separately versioned and rejects fabricated readiness", () => {
  const scenarios = DENSITY_SCENARIOS.filter(scenario => scenario.workload === "burst-recovery");
  assert.deepEqual(scenarios.map(scenario => scenario.id), ["D9-grid", "D9-justified"]);
  assert.ok(scenarios.every(scenario => scenario.scenarioRevision === 1));
  const sample = record(scenarios[0]);
  Object.assign(sample.metrics, { stopDataCensored: 0, stopDataReadyMs: 25,
    stopMediaCensored: 0, stopMediaReadyMs: 100, stopVisibleMediaCount: 2,
    stopDecodedMediaCount: 2, stopFailedMediaCount: 0, peakRefillsInFlight: 1, refillsPendingAtEnd: 0,
    forwardReadStarts: 1, backwardReadStarts: 1, readStartsAfterStop: 0 });
  assert.equal(validateDensityRecord(sample), sample);
  for (const fields of [
    { stopDataCensored: 1 }, { stopMediaCensored: 1 }, { stopDecodedMediaCount: 1 },
    { stopMediaReadyMs: 10 }, { peakRefillsInFlight: 3 }, { readStartsAfterStop: 3 },
  ]) {
    assert.throws(() => validateDensityRecord({ ...sample, metrics: { ...sample.metrics, ...fields } }), /recovery/);
  }
  const censored = { ...sample, metrics: { ...sample.metrics, stopDataCensored: 1, stopDataReadyMs: null,
    stopMediaCensored: 1, stopMediaReadyMs: null, stopVisibleMediaCount: 0, stopDecodedMediaCount: 0 } };
  assert.equal(validateDensityRecord(censored), censored);
});

test("environment compatibility rejects absent/mixed fingerprints but permits explicit source revisions", () => {
  const env = environment();
  assert.equal(densityEnvironmentKey(null), null);
  assert.equal(densityEnvironmentKey({ dataMode: "direct-es" }), null);
  for (const patch of [{ browserVersion: "unknown" }, { deviceScaleFactor: NaN }, { viewport: {} }, { os: {} }, { headed: "true" }]) {
    assert.equal(densityEnvironmentKey({ ...env, ...patch }), null);
  }
  assert.equal(densityEnvironmentKey(env), densityEnvironmentKey({ ...env, gitSha: "two" }));
  assert.equal(densityEnvironmentKey(env), densityEnvironmentKey(Object.fromEntries(Object.entries(env).reverse())));
  for (const patch of [{ apiTopology: "local" }, { dataMode: "media-api" }, { deviceScaleFactor: 1 },
    { browserVersion: "2" }, { viewport: { width: 1100, height: 960 } }, { cacheClass: "different" },
    { headed: false }, { workers: 2 }, { stableUntil: "other" }, { cpuThrottle: 4 }]) {
    assert.notEqual(densityEnvironmentKey(env), densityEnvironmentKey({ ...env, ...patch }));
    assert.throws(() => assertSameEnvironment(env, { ...env, ...patch }, "density"), /environment changed/);
  }
});

test("pairing requires matched density contracts and environment; never Table or legacy metrics", () => {
  const grid = record(), justified = record(DENSITY_SCENARIOS[1]), table = record(DENSITY_SCENARIOS[2]);
  const env = environment(), options = { paired: true };
  assert.equal(densityRecordsComparable(grid, justified, env, env, options), true);
  assert.equal(densityRecordsComparable(grid, justified, env, env), false);
  assert.equal(densityRecordsComparable(grid, table, env, env, options), false);
  assert.equal(densityRecordsComparable(grid, grid, env, env, options), false);
  assert.equal(densityRecordsComparable(grid, { id: "P1" }, env, env, options), false);
  assert.equal(densityRecordsComparable(grid, { ...justified, id: "P1" }, env, env, options), false);
  assert.equal(densityRecordsComparable(grid, justified, null, env, options), false);
  assert.equal(densityRecordsComparable(grid, justified, env, { ...env, deviceScaleFactor: 1 }, options), false);
  for (const patch of [{ cacheClass: "other" }, { resultRegime: "indexed" }, { completionBoundary: "other" },
    { profile: "other" }, { scenarioRevision: 1 }]) {
    assert.equal(densityRecordsComparable(grid, { ...justified, ...patch }, env, env, options), false);
  }
  assert.notEqual(densityContractKey(grid), densityContractKey(justified));
});

test("paired deltas use only jointly available medians and never synthesize unavailable metrics", () => {
  const records = run(); records[1].metrics.elapsedMs = 17;
  records[1].metrics.readinessLeadPxMedian = null;
  const metrics = aggregateDensityRuns([records]);
  const pairs = pairedDensityComparisons(metrics, environment());
  assert.equal(pairs.length, 11);
  assert.equal(pairs[0].deltas.elapsedMs, 7);
  assert.equal(pairs[0].deltas.readinessLeadPxMedian, undefined);
  metrics[records[1].id].cacheClass = "other";
  assert.equal(pairedDensityComparisons(metrics, environment()).length, pairs.length - 1);
  assert.deepEqual(pairedDensityComparisons(metrics, null), []);
});

test("Markdown keeps unavailable metrics, names the independent contract and avoids legacy comparisons", () => {
  const records = run(); records[0].metrics.readinessLeadPxMedian = null;
  const report = buildDensityMarkdown({ entries: [{ label: "one|two\nthree", timestamp: "date", gitSha: "sha", runs: 1,
    environmentCompatibilityKey: densityEnvironmentKey(environment()), metrics: aggregateDensityRuns([records]) }] });
  assert.match(report, /one\\\|two three/);
  assert.match(report, /readinessLeadPxMedian \| unavailable \| unavailable/);
  assert.match(report, /no legacy baseline or combined score/);
  assert.ok(report.endsWith("\n") && !report.endsWith("\n\n"));
});

test("independent dashboard uses only its own history and local presentation script", () => {
  const html = readFileSync(new URL("./results/density-graphs.html", import.meta.url), "utf8");
  const script = readFileSync(new URL("./results/density-dashboard.js", import.meta.url), "utf8");
  assert.match(html, /density-log.js/);
  assert.match(html, /density-dashboard.js/);
  assert.doesNotMatch(html, /audit-log.js|perceived-log.js|<script[^>]+https:/);
  assert.match(html, /Previous metric/);
  assert.match(html, /role="tooltip"/);
  assert.match(script, /candidate.pairedContractKey !== control.pairedContractKey/);
  assert.match(script, /One campaign: baseline only, no trend yet/);
  assert.doesNotMatch(script, /innerHTML/);
});
