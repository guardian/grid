export function assertPlaywrightSucceeded(exitCode, suiteLabel) {
  if (exitCode !== 0) {
    throw new Error(`${suiteLabel} Playwright exited with code ${exitCode}`);
  }
}

export function assertBalancedLongRuns({ runLong, runs, dryRun }) {
  if (runLong && runs % 2 !== 0 && (!dryRun || runs > 1)) {
    throw new Error("Long perceived audits require an even --runs count for balanced JB2 AB/BA order");
  }
}

export function generatedHistoryExclusions() {
  return ["audit-log.json", "audit-log.js", "audit-log.md", "perceived-log.json", "perceived-log.js", "perceived-log.md",
    "density-log.json", "density-log.js", "density-log.md", "campaign-log.json", "campaign-log.js", ".density-tmp.jsonl",
    ".density-playwright-report.json", ".environment-tmp.json", ".latest-report-path"]
    .map((name) => `:(exclude)e2e-perf/results/${name}`)
    .concat([":(exclude)e2e-perf/kupua-perf-*.log", ":(exclude)e2e-perf/results/kupua-perf-*.log"]);
}

export const JANK_SCENARIO_AGGREGATION = {
  P13c: {
    invariantFields: ["scenarioRevision", "completionBoundary", "cacheClass", "routes", "imageLookupCount"],
    medianFields: ["detailLookupMs", "detailMetadataReadyMs", "detailImageReadyMs"],
    nullableRevision3Fields: ["detailImageReadyMs"],
  },
  ...Object.fromEntries(["P14a", "P14b", "P14c", "P14d"].map((id) => [id, {
    invariantFields: ["lookupGuardRevision", "imageLookupCount"],
  }])),
  P17: {
    invariantFields: [
      "scenarioRevision", "completionBoundary", "routes", "maxInputEvents", "stepIntervalMs",
      "settleQuietMs",
    ],
    medianFields: [
      "inputEvents", "prependGenerationDelta", "bufferOffsetDelta", "directionViolations",
    ],
  },
  P18: {
    invariantFields: [
      "scenarioRevision", "completionBoundary", "cacheClass", "routes", "targetIndex",
      "selectedAdded", "metadataCacheWarmBefore", "selectedCount",
      "metadataCacheWarmAfter", "rangeWalked", "idleCallbackCount",
    ],
    medianFields: [
      "selectionPublishMs", "metadataSettleMs", "reconcileSettleMs",
      "selectionVisualSettledMs", "idleCallbackMaxMs",
    ],
  },
  P19: {
    invariantFields: [
      "scenarioRevision", "completionBoundary", "cacheClass", "routes", "targetIndex",
      "selectedAdded", "metadataCacheWarmBefore", "selectedCount",
      "metadataCacheWarmAfter", "rangeWalked",
    ],
    medianFields: [
      "rangeWalkMs", "selectionPublishMs", "metadataSettleMs", "reconcileSettleMs",
      "selectionVisualSettledMs", "idleCallbackCount", "idleCallbackMaxMs",
    ],
  },
};

export const REQUIRED_JANK_NUMERIC_FIELDS = [
  "cls", "clsMax", "maxFrame", "severe", "severeRate", "p95Frame",
  "domChurn", "loafBlocking", "frameCount",
];

export function assertFiniteFields(entries, fields, scenarioId) {
  for (const field of fields) {
    if (entries.some((entry) => !Number.isFinite(entry[field]))) {
      throw new Error(`${scenarioId} missing numeric ${field}`);
    }
  }
}

export function assertConsistentNames(entries, field, scenarioId) {
  const fingerprints = new Set(entries.map((entry) =>
    JSON.stringify((entry[field] ?? []).map((value) => value.name).sort())));
  if (fingerprints.size !== 1) {
    throw new Error(`${scenarioId} changed ${field} names across repetitions`);
  }
}

export function aggregateScenarioFields(entries, scenarioId, config) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error(`${scenarioId} has no entries to aggregate`);
  }

  const result = {};
  for (const field of config.invariantFields ?? []) {
    const values = entries.map((entry) => entry[field]);
    if (values.some((value) => value == null)) {
      throw new Error(`${scenarioId} missing ${field}`);
    }
    if (new Set(values.map((value) => JSON.stringify(value))).size !== 1) {
      throw new Error(`${scenarioId} changed ${field} across repetitions`);
    }
    result[field] = values[0];
  }

  for (const field of config.medianFields ?? []) {
    const values = entries.map((entry) => entry[field]);
    const nullable = config.nullableRevision3Fields?.includes(field) && entries.every((entry) => entry.scenarioRevision === 3);
    if (values.some((value) => !Number.isFinite(value) && !(nullable && value === null))) {
      throw new Error(`${scenarioId} missing numeric ${field}`);
    }
    const measured = values.filter((value) => value !== null);
    if (measured.length === 0) { result[field] = null; continue; }
    measured.sort((left, right) => left - right);
    const middle = Math.floor(measured.length / 2);
    const median = measured.length % 2 === 0
      ? (measured[middle - 1] + measured[middle]) / 2
      : measured[middle];
    result[field] = Math.round(median);
  }

  return result;
}

export function parseJsonLines(contents, sourcePath) {
  const rows = [];

  for (const [index, rawLine] of contents.split("\n").entries()) {
    const line = rawLine.trim();
    if (!line) continue;

    try {
      rows.push(JSON.parse(line));
    } catch (error) {
      throw new Error(
        `Malformed JSONL in ${sourcePath} at line ${index + 1}: ${error.message}`,
        { cause: error },
      );
    }
  }

  return rows;
}

export function parseSuccessfulRun({ exitCode, suiteLabel, contents, sourcePath }) {
  assertPlaywrightSucceeded(exitCode, suiteLabel);
  return parseJsonLines(contents, sourcePath);
}

export function metricIdsForTest(title, kind) {
  if (kind === "jank") return JANK_METRIC_MANIFEST.find(([prefix]) => title.startsWith(prefix))?.[1] ?? [];
  if (kind === "short") return PERCEIVED_METRIC_IDS.short.filter(id => title.startsWith(`${id}:`));
  if (kind === "long") return PERCEIVED_METRIC_IDS.long.filter(id => title.startsWith(`${id.slice(0, 2)}:`));
  return [];
}

export function admitRunOutcomes({ metrics, expectedIds, report, token, exitCode }) {
  if (report?.revision !== 1 || report.token !== token || !Array.isArray(report.tests)) {
    throw new Error("Missing or mismatched outcome capture token");
  }
  const expected = new Set(expectedIds);
  if (expected.size !== expectedIds.length) throw new Error("Duplicate expected outcome IDs");
  const captured = new Map();
  for (const metric of metrics) {
    if (!expected.has(metric?.id) || captured.has(metric.id)) throw new Error("Unexpected or duplicate metric ID in outcome capture");
    captured.set(metric.id, metric);
  }
  const owners = new Map();
  const reasons = new Set(["performance-budget", "completion-unavailable", "observation-boundary-late", "setup-data-error", "authentication-required", "capture-invalid", "source-changed", "unexpected-reload", "interrupted"]);
  const stages = new Set(["setup", "measurement", "assessment", "validation", "cleanup"]);
  for (const result of report.tests) {
    if (!Array.isArray(result.ids) || !["passed", "failed", "timedOut", "interrupted", "skipped"].includes(result.status)
      || result.reason && !reasons.has(result.reason) || result.stage && !stages.has(result.stage)
      || result.activeId && !result.ids.includes(result.activeId)) throw new Error("Invalid outcome report");
    for (const id of result.ids) {
      if (!expected.has(id) || owners.has(id)) throw new Error("Unexpected or duplicate outcome owner");
      owners.set(id, result);
    }
  }
  if (exitCode === 0 && (report.tests.some(result => !["passed", "skipped"].includes(result.status))
    || expectedIds.some(id => !owners.has(id)))) throw new Error("Successful exit contradicts outcome report");
  const outcomes = expectedIds.map(id => {
    const owner = owners.get(id);
    const metric = captured.get(id);
    if (!owner || owner.status === "skipped") {
      if (metric) throw new Error("Unowned metric in outcome capture");
      return { id, status: "not-attempted", stage: "setup", reason: "not-started" };
    }
    const active = owner.activeId ?? owner.ids.find(candidate => !captured.has(candidate)) ?? owner.ids.at(-1);
    const invalidReason = ["source-changed", "unexpected-reload", "capture-invalid"].includes(owner.reason) ? owner.reason : null;
    if (invalidReason) return metric || id === active || owner.status === "passed"
      ? { id, status: "invalid", stage: "validation", reason: invalidReason }
      : { id, status: "not-attempted", stage: "setup", reason: "preceding-step-failed" };
    const failingActive = owner.status !== "passed" && id === active;
    if (metric && (!failingActive || owner.reason === "performance-budget")) {
      return { id, status: failingActive ? "adverse" : "completed", ...(failingActive ? { stage: "assessment", reason: "performance-budget" } : {}) };
    }
    if (failingActive || owner.status === "passed") return { id,
      status: owner.reason === "capture-invalid" || owner.status === "passed" ? "invalid" : "failed",
      stage: owner.stage ?? "measurement", reason: owner.reason ?? "completion-unavailable", ...(owner.evidence ? { evidence: owner.evidence } : {}) };
    if (metric) throw new Error("Ambiguous partial outcome ownership");
    return { id, status: "not-attempted", stage: "setup", reason: "preceding-step-failed" };
  });
  return {
    metrics: outcomes.filter(row => ["completed", "adverse"].includes(row.status)).map(row => captured.get(row.id)),
    outcomes, exitCode,
    systemic: report.tests.some(result => ["setup-data-error", "authentication-required"].includes(result.reason)),
  };
}

export function summarizeRunOutcomes(runs) {
  const summary = { planned: 0, attempted: 0, completed: 0, adverse: 0, failed: 0, invalid: 0, notAttempted: 0 };
  for (const { outcomes } of runs) for (const outcome of outcomes) {
    summary.planned++;
    if (outcome.status === "not-attempted") summary.notAttempted++;
    else {
      summary.attempted++;
      if (["completed", "adverse"].includes(outcome.status)) summary.completed++;
      if (outcome.status !== "completed") summary[outcome.status]++;
    }
  }
  return summary;
}

export function assertCompleteMetricIds(metrics, expectedIds, runLabel) {
  const counts = new Map();
  for (const metric of metrics) {
    const id = metric?.id;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const expected = new Set(expectedIds);
  const missing = expectedIds.filter((id) => !counts.has(id));
  const duplicates = [...counts]
    .filter(([, count]) => count > 1)
    .map(([id]) => String(id));
  const unexpected = [...counts.keys()]
    .filter((id) => !expected.has(id))
    .map(String);

  if (missing.length || duplicates.length || unexpected.length) {
    const problems = [];
    if (missing.length) problems.push(`missing: ${missing.join(", ")}`);
    if (duplicates.length) problems.push(`duplicates: ${duplicates.join(", ")}`);
    if (unexpected.length) problems.push(`unexpected: ${unexpected.join(", ")}`);
    throw new Error(`${runLabel} metric IDs are incomplete (${problems.join("; ")})`);
  }

  return metrics;
}

export function requireConsistentPresence(entries, field, scenarioId) {
  const values = entries.map((entry) => entry[field]);
  const present = values.filter((value) => value != null);
  if (present.length > 0 && present.length !== entries.length) {
    throw new Error(`${scenarioId} changed ${field} presence across repetitions`);
  }
  return present;
}

export function aggregateSettledTotal(entries, scenarioId) {
  const values = requireConsistentPresence(entries, "settledTotal", scenarioId);
  const regimes = requireConsistentPresence(entries, "resultRegime", scenarioId);
  if (values.length === 0 && regimes.length === 0) return {};
  if (values.length !== regimes.length) {
    throw new Error(`${scenarioId} settledTotal and resultRegime presence differs`);
  }

  const regimeSet = new Set(regimes);
  if (regimeSet.size !== 1) {
    throw new Error(`${scenarioId} changed resultRegime across repetitions`);
  }

  if (regimeSet.has("seek")) {
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const tolerance = Math.max(100, Math.ceil(minimum * 0.0001));
    if (maximum - minimum > tolerance) {
      throw new Error(
        `${scenarioId} seek settledTotal drift ${maximum - minimum} exceeds ${tolerance}: ${values.join(", ")}`,
      );
    }
    return {
      settledTotalMin: minimum,
      settledTotalMax: maximum,
    };
  }

  if (new Set(values).size !== 1) {
    throw new Error(
      `${scenarioId} changed settledTotal across repetitions: ${values.join(", ")}`,
    );
  }
  return { settledTotal: values[0] };
}

const JANK_METRIC_MANIFEST = [
  ["P1: initial load", ["P1"]],
  ["P2: mousewheel scroll", ["P2"]],
  ["P3: scrubber seek", ["P3"]],
  ["P3b: keyword sort seek", ["P3b"]],
  ["P4a: density switch", ["P4a"]],
  ["P4b: density switch", ["P4b"]],
  ["P5: panel toggle", ["P5a", "P5b", "P5c"]],
  ["P6: sort change", ["P6"]],
  ["P7: scrubber drag", ["P7"]],
  ["P8: table scroll", ["P8"]],
  ["P9: sort field change", ["P9"]],
  ["P11: thumbnail reflow", ["P11@20", "P11@60", "P11@85"]],
  ["P11b: thumbnail reflow", ["P11b@20", "P11b@60", "P11b@85"]],
  ["P13: image detail enter/exit", ["P13a", "P13b", "P13c"]],
  ["P14a: image traversal", ["P14a"]],
  ["P14b: image traversal", ["P14b"]],
  ["P14c: image traversal", ["P14c"]],
  ["P14d: image traversal", ["P14d"]],
  ["P15: image detail fullscreen", ["P15a", "P15b", "P15c"]],
  ["P16: table column resize", ["P16a", "P16b"]],
  ["P17: reverse grid scroll", ["P17"]],
  ["P18: selection details", ["P18"]],
  ["P19: selection range", ["P19"]],
];

export const PERCEIVED_METRIC_IDS = {
  short: [
    "PP1", "PP2", "PP3", "PP4", "PP5", "PP6", "PP7", "PP7b", "PP7c",
    "PP8", "PP9", "PP10", "PP11", "PP6b", "PP6c",
  ],
  long: ["JA1", "JA2", "JA3", "JB1", "JB2", "JB3", "JB4", "JB5"],
};

export function expectedPerceivedMetricIds(kind, grepPattern) {
  const ids = PERCEIVED_METRIC_IDS[kind];
  if (!ids) throw new Error(`Unknown perceived metric kind: ${kind}`);
  const selected = grepPattern ? new RegExp(`^(?:${grepPattern})$`) : null;
  return ids.filter((id) => !selected || selected.test(id));
}

export function expectedJankMetricIds(grepPattern) {
  const selected = grepPattern ? new RegExp(grepPattern) : null;
  return JANK_METRIC_MANIFEST
    .filter(([testTitle]) => !selected || selected.test(testTitle))
    .flatMap(([, metricIds]) => metricIds);
}

export function assertEnvironmentMatches(observed, requested) {
  if (observed.dataMode !== requested.dataMode) {
    throw new Error(
      `App data mode mismatch: requested ${requested.dataMode}, observed ${observed.dataMode}`,
    );
  }
  if (requested.apiTopology !== undefined && observed.apiTopology !== requested.apiTopology) {
    throw new Error(
      `App API topology mismatch: requested ${requested.apiTopology}, observed ${observed.apiTopology}`,
    );
  }
  if (requested.mediaDelivery !== undefined && observed.mediaDelivery !== requested.mediaDelivery) {
    throw new Error(
      `App media delivery mismatch: requested ${requested.mediaDelivery}, observed ${observed.mediaDelivery ?? "unknown"}`,
    );
  }
  return observed;
}

export function requireSingleEnvironment(rows, suiteLabel) {
  if (rows.length !== 1) {
    throw new Error(`${suiteLabel} emitted ${rows.length} environment fingerprints; expected 1`);
  }
  return rows[0];
}

export function assertSameEnvironment(expected, observed, runLabel) {
  const expectedJson = JSON.stringify(expected);
  const observedJson = JSON.stringify(observed);
  if (expectedJson !== observedJson) {
    const keys = new Set([...Object.keys(expected), ...Object.keys(observed)]);
    const changed = [...keys].filter(
      (key) => JSON.stringify(expected[key]) !== JSON.stringify(observed[key]),
    );
    throw new Error(`${runLabel} environment changed: ${changed.join(", ")}`);
  }
  return expected;
}

export function createDeferredWrites() {
  const writes = [];

  return {
    defer(write) {
      writes.push(write);
    },
    commit() {
      for (const write of writes) write();
    },
  };
}