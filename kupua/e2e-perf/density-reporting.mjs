// Pure campaign contracts: importing this module never starts a browser or writes history.
export const DENSITY_WORKLOADS = Object.freeze([
  "scroll-cold", "scroll-warm", "table-transition", "detail-return", "seek", "reflow", "window-maintenance", "scroll-constrained", "burst-recovery", "scroll-endurance", "refresh-contention",
]);
export const REQUIRED_SCROLL_METRICS = Object.freeze([
  "pendingAreaRatioMean", "pendingAreaRatioMax", "blankViewportMs", "exposureAreaMs",
  "decodedCount", "pendingAtEnd", "failedCount",
  "imageIdentityChanges", "scrollDistancePx", "actualSpeedPxPerSec", "frameP95Ms", "elapsedMs",
]);
export const DENSITY_PROFILE = "density-v2-1200pxs-unthrottled";
export const DENSITY_CONSTRAINED_PROFILE = "density-v2-1200pxs-80ms-4mbps-scroll-only";
export const DENSITY_RECOVERY_PROFILE = "density-v1-4000pxs-3s-back-1.5s-forward-10s-recovery";
export const DENSITY_ENDURANCE_PROFILE = "density-v1-1200pxs-3x8s-endurance";
export const DENSITY_CONTENTION_PROFILE = "density-v1-refresh-media-overlap-80ms-4mbps";
export const REQUIRED_DENSITY_METRICS = Object.freeze(Object.fromEntries(DENSITY_WORKLOADS.map((workload) => [
  workload, workload === "scroll-endurance" ? Object.freeze([
    "endurancePhaseCount", "enduranceMaxGapMs", "enduranceInterrupted",
    ...["early", "middle", "late"].flatMap(prefix => ["ThumbnailPendingAreaRatioMean", "FrameP95Ms",
      "DrivenDistancePx", "DrivenDurationMs", "RequestCaptureRevision", "MediaRequestStarts",
      "MediaRequestsPending", "MediaRequestsCarryIn", "DataRequestStarts"].map(name => prefix + name)),
  ]) : workload === "refresh-contention" ? Object.freeze([
    "refreshComparisonCensored", ...["quiet", "busy"].flatMap(prefix => ["DataReadyMs", "PlacementMs",
      "MediaCensored", "VisibleMediaCount", "DecodedMediaCount", "FailedMediaCount"].map(name => prefix + name)),
  ]) : workload === "burst-recovery" ? Object.freeze([...REQUIRED_SCROLL_METRICS,
    "physicalClampMs", "bufferEdgeBlockedMs", "clampedDistancePx", "drivenDurationMs", "drivenDistancePx",
    "forwardReadStarts", "backwardReadStarts", "readStartsAfterStop", "peakRefillsInFlight", "refillsPendingAtEnd",
    "stopDataCensored", "stopMediaCensored", "stopVisibleMediaCount", "stopDecodedMediaCount", "stopFailedMediaCount",
  ]) : workload === "window-maintenance"
    ? Object.freeze([...REQUIRED_SCROLL_METRICS, "evictionCount", "prependCount"])
    : workload.startsWith("scroll-") ? REQUIRED_SCROLL_METRICS : Object.freeze([
      "placementMs", "mediaCensored", "visibleMediaCount", "decodedMediaCount", "failedMediaCount",
    ]),
])));
// Entries are directly spreadable into JSONL records. Required-metric metadata is
// separate so the manifest never introduces non-contract record fields.
export const DENSITY_SCENARIOS = Object.freeze(DENSITY_WORKLOADS.flatMap((workload, index) =>
  (["scroll-cold", "scroll-warm", "scroll-constrained"].includes(workload)
    ? ["grid", "justified", "table"] : ["grid", "justified"]).map((density) => Object.freeze({
    id: `D${index + 1}-${density}`,
    scenarioRevision: ["burst-recovery", "scroll-endurance", "refresh-contention"].includes(workload) ? 1 : workload === "window-maintenance" ? 3 : 2,
    density,
    workload,
    profile: workload === "scroll-endurance" ? DENSITY_ENDURANCE_PROFILE
      : workload === "refresh-contention" ? DENSITY_CONTENTION_PROFILE
      : workload === "burst-recovery" ? DENSITY_RECOVERY_PROFILE
      : workload === "scroll-constrained" ? DENSITY_CONSTRAINED_PROFILE : DENSITY_PROFILE,
    // Cold media requests are an observation-window condition, never cold startup.
    cacheClass: workload === "scroll-endurance" ? "browser-cache-disabled-during-endurance-renderer-warm-proxy-uncontrolled"
      : workload === "refresh-contention" ? "browser-cache-disabled-during-prime-and-refresh-renderer-warm-proxy-uncontrolled"
      : workload === "burst-recovery" ? "browser-cache-disabled-during-burst-and-recovery-renderer-warm-proxy-uncontrolled"
      : workload === "scroll-cold" || workload === "scroll-constrained"
      ? "browser-cache-disabled-during-scroll-renderer-warm-proxy-uncontrolled"
      : workload === "scroll-warm" ? "browser-repeat-path" : "browser-session-setup-renderer-warm-proxy-uncontrolled",
    completionBoundary: workload === "scroll-endurance" ? "three-consecutive-eight-second-controlled-scroll-segments"
      : workload === "refresh-contention" ? "same-query-refresh-dispatch-to-publication-placement-and-visible-decode"
      : workload === "burst-recovery" ? "burst-dispatch-to-motion-end-and-stopped-viewport-recovery"
      : workload.startsWith("scroll-") ? "four-second-controlled-scroll"
      : workload === "window-maintenance" ? "tail-admission-first-forward-eviction-visible-anchor" : "driver-dispatch-to-observed-placement-and-visible-decode",
    ...(workload === "window-maintenance" ? { geometryScope: "loaded-window" } : {}),
  })),
));
export const DENSITY_METRIC_IDS = Object.freeze(DENSITY_SCENARIOS.map(({ id }) => id));

export function parseDensitySuiteArgs(args) {
  const remainingArgs = [];
  let suite = "existing";
  let seen = false;
  let full = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    // Preserve values owned by the legacy parser, even if a label resembles a flag.
    if (["--label", "--runs"].includes(arg)) {
      remainingArgs.push(arg);
      if (index + 1 >= args.length) throw new Error(`${arg} requires a value`);
      remainingArgs.push(args[++index]);
    } else if (arg === "--full") {
      if (full) throw new Error("--full may only be specified once");
      full = true;
    } else if (arg === "--suite") {
      if (seen) throw new Error("--suite may only be specified once");
      seen = true;
      suite = args[++index];
      if (!["existing", "justified", "combined"].includes(suite)) {
        throw new Error("--suite must be existing, justified or combined");
      }
    } else remainingArgs.push(arg);
  }
  if (full) {
    if (seen && suite !== "combined") throw new Error("--full requires the combined suite");
    let perceived = false;
    for (let index = 0; index < remainingArgs.length; index++) {
      const arg = remainingArgs[index];
      if (["--label", "--runs"].includes(arg)) { index++; continue; }
      if (["--perceived-only", "--short-perceived-only", "--long-perceived-only"].includes(arg) || !arg.startsWith("--")) {
        throw new Error("--full cannot be combined with partial-suite flags or scenario filters");
      }
      if (arg === "--perceived") perceived = true;
    }
    suite = "combined";
    if (!perceived) remainingArgs.push("--perceived");
  }
  if (suite !== "existing") {
    for (let index = 0; index < remainingArgs.length; index++) {
      if (remainingArgs[index] === "--label") index++;
      else if (remainingArgs[index] === "--runs") {
        const value = remainingArgs[++index];
        if (!/^[1-9][0-9]*$/.test(value ?? "") || !Number.isSafeInteger(Number(value))) {
          throw new Error("Density campaigns require a positive integer --runs count");
        }
      }
    }
  }
  return { suite, args: remainingArgs };
}

export function resolveSuiteSelection({ suite = "existing", grepArg = "", perceivedFull = false,
  perceivedOnly = false, shortOnly = false, longOnly = false,
  pruneHistory = false, rebuildHistory = false } = {}) {
  if (!["existing", "justified", "combined"].includes(suite)) {
    throw new Error("--suite must be existing, justified or combined");
  }
  const modes = [perceivedFull, perceivedOnly, shortOnly, longOnly];
  if (modes.filter(Boolean).length > 1) throw new Error("Perceived mode flags are mutually exclusive");
  // Legacy positional filters have no meaning for D* records. In combined mode they
  // select only existing tests; the additive density suite always runs its full manifest.
  if (suite === "justified" && (grepArg || modes.some(Boolean))) {
    throw new Error("--suite justified cannot use legacy positional filters or perceived flags");
  }
  if (suite !== "existing" && (pruneHistory || rebuildHistory)) {
    throw new Error("Legacy history maintenance requires --suite existing");
  }
  return {
    runJank: suite !== "justified" && !perceivedOnly && !shortOnly && !longOnly,
    runShort: suite !== "justified" && (perceivedFull || perceivedOnly || shortOnly),
    runLong: suite !== "justified" && (perceivedFull || perceivedOnly || longOnly),
    runDensity: suite !== "existing",
  };
}

const identityFields = ["id", "scenarioRevision", "density", "workload", "profile", "cacheClass",
  "completionBoundary", "resultRegime", "geometryScope"];
const recordFields = new Set([...identityFields, "metrics"]);
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const token = (value) => typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_.:/ -]{0,159}$/.test(value);
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  return isObject(value) ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
}
const keyFor = (value) => JSON.stringify(stable(value));

export function refreshComparisonMetrics(metrics) {
  const usable = metrics.quietMediaPendingAtDispatch === 0 && metrics.busyMediaPendingAtDispatch > 0
    && metrics.quietDataPendingAtDispatch === 0 && metrics.busyDataPendingAtDispatch === 0
    && metrics.quietPrimingMediaCensored === 0 && metrics.quietDataRequestStarts > 0 && metrics.busyDataRequestStarts > 0
    && metrics.quietDataHttpErrors === 0 && metrics.busyDataHttpErrors === 0
    && metrics.quietDataRequestFailures === 0 && metrics.busyDataRequestFailures === 0
    && [metrics.quietDataReadyMs, metrics.busyDataReadyMs, metrics.quietPlacementMs, metrics.busyPlacementMs].every(Number.isFinite);
  const mediaUsable = usable && metrics.quietMediaCensored === 0 && metrics.busyMediaCensored === 0
    && Number.isFinite(metrics.quietMediaReadyMs) && Number.isFinite(metrics.busyMediaReadyMs);
  return {
    refreshComparisonCensored: usable ? 0 : 1,
    refreshDataDeltaMs: usable ? metrics.busyDataReadyMs - metrics.quietDataReadyMs : null,
    refreshPlacementDeltaMs: usable ? metrics.busyPlacementMs - metrics.quietPlacementMs : null,
    refreshMediaDeltaMs: mediaUsable ? metrics.busyMediaReadyMs - metrics.quietMediaReadyMs : null,
  };
}

export function validateDensityRecord(record) {
  if (!isObject(record)) throw new Error("Density record must be an object");
  const scenario = DENSITY_SCENARIOS.find(({ id }) => id === record.id);
  if (!scenario) throw new Error(`Unexpected density scenario: ${record.id}`);
  for (const key of Object.keys(record)) {
    if (!recordFields.has(key)) throw new Error(`${record.id}: unexpected field ${key}`);
  }
  for (const key of ["scenarioRevision", "density", "workload", "profile", "cacheClass", "completionBoundary", "geometryScope"]) {
    if (record[key] !== scenario[key]) throw new Error(`${record.id}: mismatched ${key}`);
  }
  if (!["buffer", "indexed", "seek"].includes(record.resultRegime)) {
    throw new Error(`${record.id}: invalid resultRegime`);
  }
  if (!isObject(record.metrics)) throw new Error(`${record.id}: metrics must be an object`);
  for (const [name, value] of Object.entries(record.metrics)) {
    if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(name) || (value !== null && !Number.isFinite(value))) {
      throw new Error(`${record.id}: invalid numeric metric ${name}`);
    }
    // Leads are signed: negative means readiness arrived after viewport entry.
    // The remaining capture metrics are nonnegative counts, durations, distances
    // or exposure/shift magnitudes; normalized ratios additionally have an upper bound.
    if (value !== null && value < 0 && !/^(?:early|middle|late|quiet|busy)?(?:decoded)?readinessLeadPx/i.test(name)
      && !/^refresh(?:Data|Placement|Media)DeltaMs$/.test(name)) {
      throw new Error(`${record.id}: negative metric ${name}`);
    }
    if (value !== null && /Ratio/.test(name) && (value < 0 || value > 1)) {
      throw new Error(`${record.id}: ratio outside 0..1: ${name}`);
    }
  }
  for (const name of Object.keys(record.metrics)) {
    if (/(trackingOverflow|regionDetached|requestCaptureOverflow)$/i.test(name) && record.metrics[name] !== 0) {
      throw new Error(`${record.id}: observer invalidated capture (${name})`);
    }
  }
  for (const name of REQUIRED_DENSITY_METRICS[scenario.workload]) {
    if (!Number.isFinite(record.metrics[name])) throw new Error(`${record.id}: missing finite ${name}`);
  }
  for (const prefix of ["", "early", "middle", "late", "quiet", "busy"]) {
    const metrics = prefix ? Object.fromEntries(Object.entries(record.metrics)
      .filter(([name]) => name.startsWith(prefix) && /^[A-Z]/.test(name.slice(prefix.length)))
      .map(([name, value]) => [name[prefix.length].toLowerCase() + name.slice(prefix.length + 1), value])) : record.metrics;
    if (metrics.thumbnailWaitCaptureRevision !== undefined) {
    const counts = [metrics.thumbnailVisibleWaitCount, metrics.thumbnailVisibleWaitCompletedCount,
      metrics.thumbnailVisibleWaitCensoredCount];
    if (metrics.thumbnailWaitCaptureRevision !== 1 || !counts.every(value => Number.isInteger(value) && value >= 0)
      || counts[0] !== counts[1] + counts[2] || !Number.isFinite(metrics.thumbnailVisibleWaitMaxMs)
      || (counts[0] === 0 && metrics.thumbnailVisibleWaitMaxMs !== 0)
      || (counts[1] === 0 ? metrics.thumbnailVisibleWaitCompletedMaxMs !== null
        : !Number.isFinite(metrics.thumbnailVisibleWaitCompletedMaxMs)
          || metrics.thumbnailVisibleWaitCompletedMaxMs > metrics.thumbnailVisibleWaitMaxMs)) {
      throw new Error(`${record.id}: invalid visible thumbnail wait accounting`);
    }
    }
    if (metrics.requestCaptureRevision !== undefined) {
      if (metrics.requestCaptureRevision !== 1 || metrics.requestCaptureOverflow !== 0
        || !Number.isInteger(metrics.requestCaptureTracked) || metrics.requestCaptureTracked < 0
        || metrics.requestCaptureTracked > 10000) throw new Error(`${record.id}: invalid request capture`);
      for (const kind of ["media", "data"]) {
        const counts = ["RequestsCarryIn", "RequestStarts", "RequestsCompleted", "RequestFailures",
          "RequestCancellations", "RequestsPending", "RequestsPeak", "UnknownByteRequests",
          "RequestRedirects", "CacheResponses", "HttpErrors", "TimedCompletions"];
        const value = name => metrics[kind + name];
        if (!counts.every(name => Number.isInteger(value(name)) && value(name) >= 0)
          || value("RequestsCarryIn") + value("RequestStarts") !== value("RequestsCompleted") + value("RequestFailures") + value("RequestsPending")
          || value("RequestsPeak") < Math.max(value("RequestsCarryIn"), value("RequestsPending"))
          || value("RequestsPeak") > value("RequestsCarryIn") + value("RequestStarts")
          || value("RequestCancellations") > value("RequestFailures")
          || value("UnknownByteRequests") > value("RequestsCompleted")
          || value("CacheResponses") > value("RequestsCompleted")
          || value("TimedCompletions") > value("RequestsCompleted")
          || !Number.isFinite(value("KnownCompletedBytes"))
          || (value("UnknownByteRequests") > 0 ? value("CompletedBytes") !== null : value("CompletedBytes") !== value("KnownCompletedBytes"))
          || (value("TimedCompletions") === 0
            ? value("RequestDurationMaxMs") !== null || value("RequestDurationMeanMs") !== null
            : !Number.isFinite(value("RequestDurationMaxMs")) || !Number.isFinite(value("RequestDurationMeanMs"))
              || value("RequestDurationMeanMs") > value("RequestDurationMaxMs") + 0.000001)) {
          throw new Error(`${record.id}: invalid request cohort accounting`);
        }
      }
    }
  }
  if (record.metrics.layoutShiftSupported !== undefined) {
    if (![0, 1].includes(record.metrics.layoutShiftSupported)
      || (record.metrics.layoutShiftSupported === 0 && ["layoutShiftValue", "thumbnailShiftValue"]
        .some((name) => record.metrics[name] != null))) {
      throw new Error(`${record.id}: unsupported layout shifts must remain unavailable`);
    }
  }
  // Placement and media readiness are distinct: optional media can remain absent,
  // but a timeout must be explicitly censored, never a deadline-valued success.
  if (record.workload === "scroll-endurance") {
    if (record.metrics.endurancePhaseCount !== 3 || record.metrics.enduranceInterrupted !== 0
      || record.metrics.enduranceMaxGapMs >= 250) throw new Error(`${record.id}: interrupted endurance observation`);
  } else if (record.workload === "refresh-contention") {
    const metrics = record.metrics;
    for (const prefix of ["quiet", "busy"]) {
      const value = name => metrics[prefix + name];
      if (![0, 1].includes(value("MediaCensored")) || value("PlacementMs") < value("DataReadyMs")
        || !["VisibleMediaCount", "DecodedMediaCount", "FailedMediaCount"].every(name => Number.isInteger(value(name)) && value(name) >= 0)
        || value("DecodedMediaCount") + value("FailedMediaCount") > value("VisibleMediaCount")
        || (value("MediaCensored") ? value("MediaReadyMs") !== null
          : !Number.isFinite(value("MediaReadyMs")) || value("MediaReadyMs") < value("PlacementMs")
            || value("VisibleMediaCount") === 0 || value("DecodedMediaCount") !== value("VisibleMediaCount"))) {
        throw new Error(`${record.id}: invalid refresh readiness`);
      }
    }
    if (Object.entries(refreshComparisonMetrics(metrics)).some(([name, value]) => metrics[name] !== value)) {
      throw new Error(`${record.id}: invalid refresh overlap evidence`);
    }
  } else if (record.workload === "burst-recovery") {
    const metrics = record.metrics;
    const counts = ["forwardReadStarts", "backwardReadStarts", "readStartsAfterStop", "peakRefillsInFlight",
      "refillsPendingAtEnd", "stopVisibleMediaCount", "stopDecodedMediaCount", "stopFailedMediaCount"];
    if (!counts.every(name => Number.isInteger(metrics[name]) && metrics[name] >= 0)
      || metrics.peakRefillsInFlight > 2 || metrics.refillsPendingAtEnd > metrics.peakRefillsInFlight
      || metrics.readStartsAfterStop > metrics.forwardReadStarts + metrics.backwardReadStarts
      || metrics.bufferEdgeBlockedMs > metrics.physicalClampMs || metrics.physicalClampMs > metrics.drivenDurationMs + 1
      || ![0, 1].includes(metrics.stopDataCensored) || ![0, 1].includes(metrics.stopMediaCensored)
      || (metrics.stopDataCensored ? metrics.stopDataReadyMs !== null
        : !Number.isFinite(metrics.stopDataReadyMs) || metrics.stopDataReadyMs < 0)
      || metrics.stopDecodedMediaCount + metrics.stopFailedMediaCount > metrics.stopVisibleMediaCount
      || (metrics.stopMediaCensored ? metrics.stopMediaReadyMs !== null
        : metrics.stopDataCensored !== 0 || !Number.isFinite(metrics.stopMediaReadyMs)
          || metrics.stopMediaReadyMs < metrics.stopDataReadyMs || metrics.stopVisibleMediaCount === 0
          || metrics.stopDecodedMediaCount !== metrics.stopVisibleMediaCount)) {
      throw new Error(`${record.id}: invalid recovery readiness or request accounting`);
    }
  } else if (record.workload === "window-maintenance") {
    if (!token(record.geometryScope) || record.metrics.evictionCount < 1 || record.metrics.prependCount < 0
      || !Number.isInteger(record.metrics.evictionCount) || !Number.isInteger(record.metrics.prependCount)) {
      throw new Error(`${record.id}: missing window-maintenance evidence/geometryScope`);
    }
  } else if (!record.workload.startsWith("scroll-")) {
    const { mediaReadyMs, mediaCensored, placementMs, visibleMediaCount, decodedMediaCount, failedMediaCount } = record.metrics;
    if (![0, 1].includes(mediaCensored) || placementMs < 0
      || ![visibleMediaCount, decodedMediaCount, failedMediaCount].every((value) => Number.isInteger(value) && value >= 0)
      || decodedMediaCount + failedMediaCount > visibleMediaCount
      || (mediaCensored === 1 ? mediaReadyMs !== null
        : !Number.isFinite(mediaReadyMs) || mediaReadyMs < 0 || visibleMediaCount === 0 || decodedMediaCount !== visibleMediaCount)) {
      throw new Error(`${record.id}: invalid media readiness/censor contract`);
    }
  }
  return record;
}

export function validateDensityRun(records) {
  if (!Array.isArray(records)) throw new Error("Density run must be an array");
  const seen = new Set();
  for (const record of records) {
    validateDensityRecord(record);
    if (seen.has(record.id)) throw new Error(`Duplicate density scenario: ${record.id}`);
    seen.add(record.id);
  }
  const missing = DENSITY_METRIC_IDS.filter((id) => !seen.has(id));
  if (missing.length) throw new Error(`Missing density scenarios: ${missing.join(", ")}`);
  return records;
}

export function densityContractKey(record, { paired = false } = {}) {
  return keyFor(Object.fromEntries(identityFields.filter((field) =>
    !paired || !["id", "density"].includes(field)).map((field) => [field, record[field]])));
}

const environmentFields = ["dataMode", "apiTopology", "appBaseUrl", "browserName", "browserVersion",
  "os", "viewport", "screen", "deviceScaleFactor", "headed", "cpuThrottle", "cacheClass",
  "workers", "stableUntil"];
export function densityEnvironmentKey(environment) {
  if (!isObject(environment) || environmentFields.some((field) => environment[field] == null)) return null;
  if (["dataMode", "apiTopology", "appBaseUrl", "browserName", "browserVersion", "cacheClass", "stableUntil"]
    .some((field) => typeof environment[field] !== "string" || !environment[field] || environment[field] === "unknown")
    || !["platform", "release", "architecture"].every((field) => typeof environment.os?.[field] === "string" && environment.os[field])
    || ![environment.viewport, environment.screen].every((size) => [size?.width, size?.height].every((value) => Number.isFinite(value) && value > 0))
    || !Number.isFinite(environment.deviceScaleFactor) || environment.deviceScaleFactor <= 0
    || !Number.isFinite(environment.cpuThrottle) || environment.cpuThrottle < 0
    || !Number.isInteger(environment.workers) || environment.workers < 1 || typeof environment.headed !== "boolean") return null;
  // Git/source identity remains provenance, not an environment dimension: deliberate
  // before/after code comparisons are possible, but never across missing fingerprints.
  return keyFor(Object.fromEntries(environmentFields.map((field) => [field, environment[field]])));
}

export function densityRecordsComparable(left, right, leftEnvironment, rightEnvironment, { paired = false } = {}) {
  const environment = densityEnvironmentKey(leftEnvironment);
  if (!environment || environment !== densityEnvironmentKey(rightEnvironment)) return false;
  if (identityFields.filter((field) => field !== "geometryScope")
    .some((field) => left?.[field] == null || right?.[field] == null)) return false;
  if ([left, right].some((record) => !DENSITY_SCENARIOS.some((scenario) =>
    ["id", "scenarioRevision", "density", "workload", "profile", "cacheClass", "completionBoundary", "geometryScope"]
      .every((field) => record[field] === scenario[field])) || !["buffer", "indexed", "seek"].includes(record.resultRegime))) return false;
  if (paired && new Set([left.density, right.density]).size !== 2) return false;
  if (paired && ![left.density, right.density].every((density) => ["grid", "justified"].includes(density))) return false;
  return densityContractKey(left, { paired }) === densityContractKey(right, { paired });
}

export function aggregateDensityRuns(runs) {
  if (!Array.isArray(runs) || runs.length === 0) throw new Error("No density runs to aggregate");
  runs.forEach(validateDensityRun);
  return Object.fromEntries(DENSITY_METRIC_IDS.map((id) => {
    const records = runs.map((run) => run.find((record) => record.id === id));
    const first = records[0];
    const contractKey = densityContractKey(first);
    if (records.some((record) => densityContractKey(record) !== contractKey)) {
      throw new Error(`${id}: contract changed across repetitions`);
    }
    const names = new Set(records.flatMap((record) => Object.keys(record.metrics)));
    const metrics = Object.fromEntries([...names].map((name) => {
      const values = records.map((record) => record.metrics[name]).filter(Number.isFinite).sort((a, b) => a - b);
      const complete = values.length === records.length;
      const middle = Math.floor(values.length / 2);
      return [name, {
        median: complete ? (values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2) : null,
        p95: complete ? values[Math.ceil(values.length * 0.95) - 1] : null,
        sampleCount: values.length,
        unavailableCount: records.length - values.length,
      }];
    }));
    return [id, { ...Object.fromEntries(identityFields.map((field) => [field, first[field]])),
      contractKey, pairedContractKey: densityContractKey(first, { paired: true }), sampleCount: records.length, metrics }];
  }));
}

export function pairedDensityComparisons(metrics, environment) {
  const records = Object.values(metrics);
  return records.filter((record) => record.density === "justified").flatMap((justified) => {
    const grid = records.find((candidate) => densityRecordsComparable(candidate, justified, environment, environment, { paired: true }));
    if (!grid) return [];
    const deltas = Object.fromEntries(Object.entries(justified.metrics).flatMap(([name, value]) => {
      const control = grid.metrics[name];
      return Number.isFinite(value.median) && Number.isFinite(control?.median)
        ? [[name, value.median - control.median]] : [];
    }));
    return [{ controlId: grid.id, candidateId: justified.id, contractKey: justified.pairedContractKey, deltas }];
  });
}

export function buildDensityMarkdown(history) {
  const escape = (value) => String(value).replaceAll("|", "\\|").replace(/[\r\n]/g, " ");
  return ["# Density comparison history", "", "Independent revisioned scenarios; no legacy baseline or combined score. Optional/sparse metrics remain unavailable. Paired deltas are Justified minus matched Grid medians, not regression verdicts.", "",
    ...history.entries.flatMap((entry) => [
      `## ${escape(entry.label)} (${escape(entry.timestamp)})`, "",
      `Git: ${escape(entry.gitSha)} | Runs: ${entry.runs} | Environment: ${escape(entry.environmentCompatibilityKey ?? "unavailable")}`, "",
      "| Scenario | Workload | Cache | Regime | Boundary | Metric | Median | p95 | Samples |",
      "|---|---|---|---|---|---|---|---|---|",
      ...Object.values(entry.metrics).flatMap((record) => Object.entries(record.metrics).map(([name, value]) =>
        `| ${record.id} | ${record.workload} | ${escape(record.cacheClass)} | ${escape(record.resultRegime)} | ${escape(record.completionBoundary)} | ${name} | ${value.median ?? "unavailable"} | ${value.p95 ?? "unavailable"} | ${value.sampleCount}/${record.sampleCount} |`)), "",
    ]), ""].join("\n").trimEnd() + "\n";
}
