import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DENSITY_METRIC_IDS, DENSITY_PROFILE, DENSITY_CONSTRAINED_PROFILE, DENSITY_RECOVERY_PROFILE, DENSITY_SCENARIOS, REQUIRED_DENSITY_METRICS,
  aggregateDensityRuns, buildDensityMarkdown, densityContractKey, densityEnvironmentKey,
  densityRecordsComparable, pairedDensityComparisons, parseDensitySuiteArgs,
  resolveSuiteSelection, validateDensityRecord, validateDensityRun,
} from "../density-reporting.mjs";
import { assertSameEnvironment, parseSuccessfulRun } from "../harness-validation.mjs";
import { createRequestProbe } from "../network-probe.mjs";
import * as densityReporting from "../density-reporting.mjs";
import { DENSITY_PRESSURE_STEPS, summarizeDensityPressure } from "../density-pressure.mjs";

function pressureFixture() {
  return Object.fromEntries(["early", "middle", "late"].flatMap((prefix, index) => Object.entries({
    RequestedResultsPerSecond: DENSITY_PRESSURE_STEPS[index], AchievedResultsPerSecond: DENSITY_PRESSURE_STEPS[index],
    PendingVisibleRatioMean: 0.05, BufferEdgeBlockedMs: 0, DrivenDurationMs: 1000, FrameP95Ms: 16.7,
  }).map(([name, value]) => [prefix + name, value])));
}

test("pressure envelope retains comfortable-through-strongest and below-gentlest outcomes", () => {
  const metrics = pressureFixture();
  const comfortable = summarizeDensityPressure(metrics);
  assert.equal(comfortable.firstProgressStruggleStep, 0);
  assert.equal(comfortable.firstFrameStruggleStep, 0);
  assert.equal(comfortable.maximumTestedResultsPerSecond, 200);
  metrics.earlyAchievedResultsPerSecond = 5;
  metrics.earlyFrameP95Ms = 90;
  const regressed = summarizeDensityPressure(metrics);
  assert.equal(regressed.firstProgressStruggleStep, 1);
  assert.equal(regressed.firstFrameStruggleStep, 1);
});

test("pressure envelope catches improvement and regression across all fixed steps", () => {
  const metrics = pressureFixture();
  metrics.latePendingVisibleRatioMean = 0.8;
  assert.equal(summarizeDensityPressure(metrics).firstProgressStruggleStep, 3);
  metrics.middleBufferEdgeBlockedMs = 200;
  assert.equal(summarizeDensityPressure(metrics).firstProgressStruggleStep, 2);
  metrics.earlyAchievedResultsPerSecond = 10;
  assert.equal(summarizeDensityPressure(metrics).firstProgressStruggleStep, 1);
  Object.assign(metrics, pressureFixture());
  assert.equal(summarizeDensityPressure(metrics).firstProgressStruggleStep, 0);
  assert.deepEqual(DENSITY_PRESSURE_STEPS, [30, 100, 200]);
});

test("pressure summaries keep frame struggle separate from progress and reject unavailable evidence", () => {
  const metrics = pressureFixture();
  metrics.middleFrameP95Ms = 50;
  assert.equal(summarizeDensityPressure(metrics).firstFrameStruggleStep, 2);
  assert.equal(summarizeDensityPressure(metrics).firstProgressStruggleStep, 0);
  metrics.latePendingVisibleRatioMean = null;
  assert.throws(() => summarizeDensityPressure(metrics), /complete observed steps/);
});

const emptyRequestProbe = createRequestProbe({ on() {}, off() {} });
const emptyRequestMetrics = emptyRequestProbe.snapshot();
emptyRequestProbe.dispose();

function record(scenario = DENSITY_SCENARIOS[0], value = 10) {
  const metrics = Object.fromEntries([...densityReporting.REQUIRED_SCROLL_METRICS, ...REQUIRED_DENSITY_METRICS[scenario.workload]]
    .map(name => [name, /Ratio/.test(name) ? 0.25 : value]));
  if ("mediaCensored" in metrics) Object.assign(metrics, {
    mediaCensored: 0, mediaReadyMs: value, visibleMediaCount: 2, decodedMediaCount: 2, failedMediaCount: 0,
  });
  if (scenario.workload === "burst-recovery") Object.assign(metrics, {
    stopDataCensored: 0, stopDataReadyMs: value, stopMediaCensored: 0, stopMediaReadyMs: value,
    stopVisibleMediaCount: 2, stopDecodedMediaCount: 2, stopFailedMediaCount: 0,
    peakRefillsInFlight: 1, refillsPendingAtEnd: 0,
    forwardReadStarts: 1, backwardReadStarts: 1, readStartsAfterStop: 0,
  });
  if (["scroll-endurance", "scroll-forward", "scroll-backward", "scroll-constrained"].includes(scenario.workload)) {
    Object.assign(metrics, { endurancePhaseCount: 3, enduranceMaxGapMs: 2, enduranceInterrupted: 0 });
    for (const prefix of ["early", "middle", "late"]) {
      for (const [name, value] of Object.entries(emptyRequestMetrics)) metrics[prefix + name[0].toUpperCase() + name.slice(1)] = value;
    }
  }
  if (["scroll-forward", "scroll-backward", "scroll-constrained"].includes(scenario.workload)) {
    Object.assign(metrics, emptyRequestMetrics, {
    journeyCaptureRevision: 1, stabilityCaptureRevision: 1, journeyOverflow: 0,
    requestedResultsPerSecond: 100, resultsPerPixel: 0.02, refillCoverageComplete: 1,
    forwardReadStarts: 3, backwardReadStarts: 3, appendPublications: 3, prependPublications: 3,
    evictionPublications: 1, retainedComparisons: 20, retainedDisplacementMaxPx: 0, retainedResizeMaxPx: 0,
    retainedSourceChanges: 0, retainedNodeReplacements: 0, retainedUnreadySamples: 0, retainedComparisonCensoredCount: 0,
    stabilitySampleCount: 20, paintCaptureAvailable: 0, paintMismatchCount: null,
      pressureCaptureRevision: 1, struggleReferenceRevision: 1, timingCaptureRevision: 2,
      requestWindowCaptureRevision: 1, requestClockMissingCount: 0, observerStopLagMs: 1, recoveryStartLagMs: 2,
      controllerReturnLagMs: 3, referenceResultsPerSecond: 100, networkConstrained: Number(scenario.workload === "scroll-constrained"),
      plannedMotionDurationMs: scenario.workload === "scroll-constrained" ? 6000 : 9000,
      stopDataCensored: 0, stopDataReadyMs: value, stopMediaCensored: 0, stopMediaReadyMs: value,
      stopVisibleMediaCount: 2, stopDecodedMediaCount: 2, stopFailedMediaCount: 0,
      stopCohortChanged: 0, postReadyCohortStable: 1, recoveryObservationMs: value, recoveryLimitMs: 4000,
      readStartsAfterStop: 0, peakRefillsInFlight: 1, refillsPendingAtEnd: 0,
    });
    for (const [index, prefix] of ["early", "middle", "late"].entries()) Object.assign(metrics, {
      [prefix + "RequestedResultsPerSecond"]: DENSITY_PRESSURE_STEPS[index],
      [prefix + "AchievedResultsPerSecond"]: DENSITY_PRESSURE_STEPS[index],
      [prefix + "PendingVisibleRatioMean"]: 0.05,
      [prefix + "BufferEdgeBlockedMs"]: 0, [prefix + "DrivenDurationMs"]: 1000,
      [prefix + "RequestWindowCaptureRevision"]: 1, [prefix + "RequestClockMissingCount"]: 0,
    });
    for (const [name, entry] of Object.entries(emptyRequestMetrics)) metrics["recovery" + name[0].toUpperCase() + name.slice(1)] = entry;
    metrics.recoveryRequestWindowCaptureRevision = 1;
    if (scenario.workload === "scroll-backward") {
      for (const [name, entry] of Object.entries(emptyRequestMetrics)) metrics["reversal" + name[0].toUpperCase() + name.slice(1)] = entry;
      Object.assign(metrics, { reversalRequestedResultsPerSecond: 100, reversalRequestWindowCaptureRevision: 1, reversalRequestClockMissingCount: 0 });
    }
    Object.assign(metrics, summarizeDensityPressure(metrics));
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
const run = (value = 10) => DENSITY_SCENARIOS.filter(scenario => DENSITY_METRIC_IDS.includes(scenario.id)).map(scenario => record(scenario, value));
const environment = () => ({
  dataMode: "direct-es", apiTopology: "none", appBaseUrl: "http://localhost:3000",
  browserName: "chromium", browserVersion: "1", os: { platform: "test", architecture: "test", release: "1" },
  viewport: { width: 1720, height: 960 }, screen: { width: 1720, height: 960 },
  deviceScaleFactor: 2, headed: true, cpuThrottle: 0, cacheClass: "uncontrolled-browser-cache",
  workers: 1, stableUntil: "2026-02-15T00:00:00.000Z", gitSha: "one",
});

test("device pixel ratio is a positive scale, not a normalized exposure fraction", () => {
  for (const scenario of DENSITY_SCENARIOS.filter(item => ["scroll-forward", "scroll-backward"].includes(item.workload))) {
    const sample = record(scenario);
    for (const prefix of ["reversal", "", "early", "middle", "late", "quiet", "busy", "recovery"]) {
      const name = prefix ? `${prefix}DevicePixelRatio` : "devicePixelRatio";
      for (const devicePixelRatio of [0.5, 1, 1.25, 1.5, 2, 3]) {
        assert.equal(validateDensityRecord({ ...sample, metrics: { ...sample.metrics, [name]: devicePixelRatio } }).metrics[name], devicePixelRatio);
      }
      for (const devicePixelRatio of [0, -1, NaN, Infinity, "2"]) {
        assert.throws(() => validateDensityRecord({ ...sample, metrics: { ...sample.metrics, [name]: devicePixelRatio } }));
      }
    }
    for (const name of ["pendingAreaRatioMean", "earlyPendingVisibleRatioMean", "lateThumbnailPendingAreaRatioMean", "reversalPendingVisibleRatioMean", "recoveryPendingVisibleRatioMean"]) {
      assert.throws(() => validateDensityRecord({ ...sample, metrics: { ...sample.metrics, devicePixelRatio: 2, [name]: 1.01 } }), /ratio outside/);
    }
    assert.equal(validateDensityRecord(sample).metrics.devicePixelRatio, undefined);
  }
  const records = run().map(sample => ({ ...sample, metrics: { ...sample.metrics, devicePixelRatio: 2 } }));
  assert.equal(aggregateDensityRuns([records, records, records, records])["D1-justified"].metrics.devicePixelRatio.median, 2);
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

test("journey contracts reject false coverage, unavailable geometry and invented paint evidence", () => {
  const sample = record();
  validateDensityRecord(sample);
  for (const change of [
    { journeyCaptureRevision: 2 }, { requestedResultsPerSecond: 120 }, { resultsPerPixel: 0 },
    { refillCoverageComplete: 0 }, { appendPublications: 0.5 }, { retainedDisplacementMaxPx: null },
    { retainedComparisons: 0 }, { paintCaptureAvailable: 1 }, { paintMismatchCount: 0 },
    { stabilitySampleCount: 0 }, { stabilitySampleMaxMs: 20, stabilitySampleTotalMs: 10 },
  ]) assert.throws(() => validateDensityRecord({ ...sample, metrics: { ...sample.metrics, ...change } }), /journey/);
  validateDensityRecord({ ...sample, metrics: { ...sample.metrics, retainedComparisons: 0,
    retainedDisplacementMaxPx: null, retainedResizeMaxPx: null, appendPublications: 0, refillCoverageComplete: 0 } });
  const retired = record(DENSITY_SCENARIOS.find(scenario => scenario.id === "D10-grid"));
  validateDensityRecord(retired);
  assert.throws(() => validateDensityRun([...run(), retired]), /Retired/);
  const old = { ...sample, workload: "scroll-cold", scenarioRevision: 2, profile: DENSITY_PROFILE };
  assert.equal(densityRecordsComparable(old, sample, environment(), environment()), false);
});

test("pressure contracts retain severe low-progress runs and reject contaminated clocks or invented recovery", () => {
  const sample = record();
  Object.assign(sample.metrics, { appendPublications: 0, refillCoverageComplete: 0, progressedResults: 0 });
  for (const prefix of ["early", "middle", "late"]) sample.metrics[prefix + "AchievedResultsPerSecond"] = 0;
  Object.assign(sample.metrics, summarizeDensityPressure(sample.metrics));
  validateDensityRecord(sample);
  assert.equal(sample.metrics.firstProgressStruggleStep, 1);
  for (const change of [
    { observerStopLagMs: 26 }, { recoveryStartLagMs: 26 }, { timingCaptureRevision: 1 },
    { requestClockMissingCount: 1 }, { earlyRequestedResultsPerSecond: 31 },
    { firstProgressStruggleStep: 0 }, { stopMediaReadyMs: 4001 },
    { stopMediaCensored: 1 }, { stopCohortChanged: 1 },
  ]) assert.throws(() => validateDensityRecord({ ...sample, metrics: { ...sample.metrics, ...change } }), /pressure/);
  validateDensityRecord({ ...sample, metrics: { ...sample.metrics, stopMediaCensored: 1, stopMediaReadyMs: null } });
  const retired = record(DENSITY_SCENARIOS.find(scenario => scenario.id === "D9-grid"));
  validateDensityRecord(retired);
  assert.throws(() => validateDensityRun([...run(), retired]), /Retired/);
});

test("sampling cost fields preserve unavailable historical records and reject inconsistent captures", () => {
  const sample = record();
  validateDensityRecord(sample);
  const fields = { observerCostCaptureRevision: 1, observerSampleCount: 10, observerSampleTotalMs: 4, observerSampleMaxMs: 1 };
  validateDensityRecord({ ...sample, metrics: { ...sample.metrics, ...fields } });
  for (const change of [{ observerCostCaptureRevision: 2 }, { observerSampleCount: 0 },
    { observerSampleTotalMs: null }, { observerSampleMaxMs: 5 }]) {
    assert.throws(() => validateDensityRecord({ ...sample, metrics: { ...sample.metrics, ...fields, ...change } }), /observer cost/);
  }
});

test("bounds episodes preserve historical records and validate phased censor accounting", () => {
  const scenario = DENSITY_SCENARIOS.find(scenario => scenario.workload === "burst-recovery");
  assert.equal(validateDensityRecord(record(scenario)).metrics.boundsCaptureRevision, undefined);
  const fields = { boundsCaptureRevision: 1, bufferEdgeEpisodeCount: 2,
    bufferEdgeEpisodeMaxMs: 150, bufferEdgeEpisodeCompletedMaxMs: 100,
    bufferEdgeEpisodeCompletedCount: 1, bufferEdgeEpisodeCensoredCount: 1, drivenDurationMs: 200 };
  for (const prefix of ["", "early"]) {
    const sample = record(prefix ? DENSITY_SCENARIOS.find(scenario => scenario.workload === "scroll-endurance") : scenario);
    const names = values => Object.fromEntries(Object.entries(values).map(([name, value]) =>
      [prefix ? prefix + name[0].toUpperCase() + name.slice(1) : name, value]));
    Object.assign(sample.metrics, names(fields));
    validateDensityRecord(sample);
    for (const change of [
      { boundsCaptureRevision: 2 }, { bufferEdgeEpisodeCensoredCount: 0.5 },
      { bufferEdgeEpisodeCount: 3 }, { bufferEdgeEpisodeMaxMs: 50 },
      { bufferEdgeEpisodeCompletedMaxMs: null }, { bufferEdgeEpisodeMaxMs: 300 },
      { bufferEdgeEpisodeCompletedCount: 0, bufferEdgeEpisodeCount: 1 },
    ]) assert.throws(() => validateDensityRecord({ ...sample, metrics: { ...sample.metrics, ...names(change) } }), /buffer edge episode/);
    Object.assign(sample.metrics, names({ bufferEdgeEpisodeCompletedCount: 0,
      bufferEdgeEpisodeCount: 1, bufferEdgeEpisodeCompletedMaxMs: null }));
    validateDensityRecord(sample);
  }
});

test("data request timing validates coverage and unavailable phase values", () => {
  assert.equal(validateDensityRecord(record(DENSITY_SCENARIOS.find(scenario => scenario.id === "D10-grid"))).metrics.requestTimingCaptureRevision, undefined);
  const fields = { ...emptyRequestMetrics, dataRequestStarts: 1, dataRequestsCompleted: 1,
    dataRequestsPeak: 1, dataTimedCompletions: 1, dataRequestDurationMaxMs: 850,
    dataRequestDurationMeanMs: 850, requestTimingCaptureRevision: 1,
    dataTimingCompletions: 1, dataTimingUnavailableCompletions: 0,
    dataBeforeSendMaxMs: 300, dataBeforeSendMeanMs: 300,
    dataSendToHeadersMaxMs: 500, dataSendToHeadersMeanMs: 500,
    dataHeadersToCompleteMaxMs: 50, dataHeadersToCompleteMeanMs: 50 };
  for (const prefix of ["", "early"]) {
    const sample = record(prefix ? DENSITY_SCENARIOS.find(scenario => scenario.workload === "scroll-endurance") : undefined);
    const names = values => Object.fromEntries(Object.entries(values).map(([name, value]) =>
      [prefix ? prefix + name[0].toUpperCase() + name.slice(1) : name, value]));
    Object.assign(sample.metrics, names(fields));
    validateDensityRecord(sample);
    for (const change of [
      { requestTimingCaptureRevision: 2 }, { dataTimingCompletions: 0.5 },
      { dataTimingUnavailableCompletions: 1 }, { dataBeforeSendMeanMs: 301 },
      { dataSendToHeadersMaxMs: null }, { dataHeadersToCompleteMaxMs: 900 },
      { dataTimingCompletions: 0, dataTimingUnavailableCompletions: 1 },
    ]) assert.throws(() => validateDensityRecord({ ...sample, metrics: { ...sample.metrics, ...names(change) } }), /data request timing/);
  }
});

test("active pressure manifest retires standalone burst/endurance without renumbering history", () => {
  assert.equal(DENSITY_SCENARIOS.length, 25);
  assert.equal(new Set(DENSITY_METRIC_IDS).size, 21);
  assert.equal(densityReporting.DENSITY_WORKLOADS.length, 9);
  assert.ok(!densityReporting.DENSITY_WORKLOADS.includes("scroll-endurance"));
  assert.ok(!densityReporting.DENSITY_WORKLOADS.includes("burst-recovery"));
  assert.deepEqual(DENSITY_SCENARIOS.filter(s => s.density === "table").map(s => s.id), ["D1-table", "D2-table", "D8-table"]);
  assert.ok(DENSITY_SCENARIOS.slice(0, 6).every(s => s.scenarioRevision === 4 && s.profile.startsWith("density-v4-30-100-200resultsps")));
  assert.ok(DENSITY_SCENARIOS.slice(6, 21).every(s => s.scenarioRevision === (s.workload === "burst-recovery" ? 1 : s.workload === "window-maintenance" ? 3 : s.workload === "scroll-constrained" ? 4 : 2)));
  assert.ok(DENSITY_SCENARIOS.slice(6, 21).every(s => s.profile === (s.workload === "burst-recovery" ? DENSITY_RECOVERY_PROFILE : s.workload === "scroll-constrained" ? DENSITY_CONSTRAINED_PROFILE : DENSITY_PROFILE)));
  assert.ok(DENSITY_SCENARIOS.every(s => !Object.hasOwn(s, "requiredMetrics")));
  assert.equal(validateDensityRun(run()).length, 21);
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
  const backward = record(DENSITY_SCENARIOS.find(scenario => scenario.id === "D2-grid"));
  backward.metrics.reversalDecodedReadinessLeadPxMedian = -100;
  validateDensityRecord(backward);
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

test("pressure revision separates ordinary and automatically included constrained delivery", () => {
  assert.equal(DENSITY_PROFILE, "density-v2-1200pxs-unthrottled");
  assert.equal(DENSITY_CONSTRAINED_PROFILE, "density-v4-30-100-200resultsps-3x2s-80ms-4mbps-4s-recovery");
  const constrained = DENSITY_SCENARIOS.filter(s => s.workload === "scroll-constrained");
  assert.deepEqual(constrained.map(s => s.id), ["D8-grid", "D8-justified", "D8-table"]);
  assert.ok(constrained.every(s => s.completionBoundary === "load-ladder-motion-reversal-if-backward-and-current-cohort-decode"
    && s.cacheClass === "browser-cache-disabled-during-motion-recovery-renderer-warm-proxy-uncontrolled"));
  assert.ok(DENSITY_SCENARIOS.slice(0, 6).every(s => s.cacheClass === "browser-cache-disabled-during-motion-recovery-renderer-warm-proxy-uncontrolled"));
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
  assert.ok(REQUIRED_DENSITY_METRICS["scroll-constrained"].includes("pressureCaptureRevision"));
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
  const source = readFileSync(new URL("../run-audit.mjs", import.meta.url), "utf8");
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
  const source = readFileSync(new URL("../run-audit.mjs", import.meta.url), "utf8");
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
  const missing = record(); delete missing.metrics.earlyFrameP95Ms;
  assert.throws(() => validateDensityRecord(missing), /earlyFrameP95Ms/);
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
  assert.equal(pairs.length, 9);
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

test("independent dashboard loads only its own history and local presentation scripts", () => {
  const html = readFileSync(new URL("../results/density-graphs.html", import.meta.url), "utf8");
  assert.match(html, /density-log.js/);
  assert.match(html, /density-dashboard.js/);
  assert.doesNotMatch(html, /audit-log.js|perceived-log.js|<script[^>]+https:/);
});
