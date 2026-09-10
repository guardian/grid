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
  ["P13: image detail enter/exit", ["P13a", "P13b"]],
  ["P14a: image traversal", ["P14a"]],
  ["P14b: image traversal", ["P14b"]],
  ["P14c: image traversal", ["P14c"]],
  ["P14d: image traversal", ["P14d"]],
  ["P15: image detail fullscreen", ["P15a", "P15b", "P15c"]],
  ["P16: table column resize", ["P16a", "P16b"]],
];

export const PERCEIVED_METRIC_IDS = {
  short: [
    "PP1", "PP2", "PP3", "PP4", "PP5", "PP6", "PP7", "PP7b", "PP7c",
    "PP8", "PP9", "PP10", "PP6b", "PP6c",
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