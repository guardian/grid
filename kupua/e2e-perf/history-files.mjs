import {
  existsSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";

export function parseHistoryLog(contents, sourcePath) {
  let log;
  try {
    log = JSON.parse(contents);
  } catch (error) {
    throw new Error(`Malformed history JSON in ${sourcePath}: ${error.message}`, { cause: error });
  }
  if (!log || !Array.isArray(log.entries)) {
    throw new Error(`History JSON in ${sourcePath} must contain an entries array`);
  }
  return log;
}

export function readHistoryLog(file) {
  if (!existsSync(file)) return { entries: [] };
  return parseHistoryLog(readFileSync(file, "utf8"), file);
}

const RETIRED_AUDIT_METRIC_IDS = new Set(["P10", "P12-scroll"]);
const REPLACED_AUDIT_METRIC_IDS = new Set([
  "P1",
  "P5c",
  "P7",
  "P13a",
  "P13b",
  "P14a",
  "P14b",
  "P14c",
  "P14d",
  "P15a",
  "P15b",
  "P15c",
  "P16a",
  "P16b",
]);

export function pruneAuditHistory(history) {
  let removedMetricCount = 0;
  const entries = history.entries.map((entry) => {
    const metrics = Object.fromEntries(Object.entries(entry.metrics ?? {}).filter(([id, metric]) => {
      const retired = RETIRED_AUDIT_METRIC_IDS.has(id);
      const replacedLegacy = REPLACED_AUDIT_METRIC_IDS.has(id)
        && (!Number.isInteger(metric.scenarioRevision) || metric.scenarioRevision < 2);
      if (retired || replacedLegacy) removedMetricCount++;
      return !retired && !replacedLegacy;
    }));
    return { ...entry, metrics };
  }).filter((entry) => Object.keys(entry.metrics).length > 0);
  return {
    history: { ...history, entries },
    removedMetricCount,
    removedCampaignCount: history.entries.length - entries.length,
  };
}

const SUITE_FAMILIES = Object.freeze({
  jank: ["audit", "rendering"],
  short: ["perceived", "short"],
  long: ["perceived", "long"],
  density: ["density", "density"],
});

// Membership of one runner invocation, published inside the same history transaction.
export function buildCampaignManifest({ campaignId, label, runs, grep, requested, apiTopology, mediaDelivery, completedAt, entries }) {
  const requestedSuites = Object.keys(SUITE_FAMILIES).filter((suite) => requested[suite]);
  const missingSuites = requestedSuites.filter((suite) => !entries.some((entry) =>
    entry.family === SUITE_FAMILIES[suite][0] && entry.kind === SUITE_FAMILIES[suite][1]));
  const shortRepetitions = entries.filter((entry) => entry.runs !== runs).map((entry) => `${entry.family}/${entry.kind}`);
  return {
    campaignId, label, completedAt, runs, grep: grep || null, requestedSuites, apiTopology, mediaDelivery,
    entries, complete: missingSuites.length === 0 && shortRepetitions.length === 0 && !grep,
    missingSuites, shortRepetitions,
  };
}

export function appendCampaignManifest(log, manifest) {
  if (log.entries.some((entry) => entry.campaignId === manifest.campaignId)) {
    throw new Error(`Campaign ${manifest.campaignId} is already published`);
  }
  return { ...log, entries: [...log.entries, manifest] };
}

export function commitFileTransaction(updates, options = {}) {
  const transactionId = randomUUID();
  const staged = updates.map(({ file, contents }) => ({
    file,
    staged: `${file}.${transactionId}.tmp`,
    backup: `${file}.${transactionId}.bak`,
    existed: existsSync(file),
    contents,
  }));
  let renamed = 0;

  try {
    for (const update of staged) {
      writeFileSync(update.staged, update.contents);
    }
    for (const update of staged) {
      if (update.existed) renameSync(update.file, update.backup);
      renameSync(update.staged, update.file);
      renamed++;
      if (options.failAfterRename === renamed) {
        throw new Error("Simulated history commit failure");
      }
    }
    for (const update of staged) {
      if (update.existed && existsSync(update.backup)) unlinkSync(update.backup);
    }
  } catch (error) {
    for (const update of staged.slice(0, renamed).reverse()) {
      if (existsSync(update.file)) unlinkSync(update.file);
      if (update.existed && existsSync(update.backup)) renameSync(update.backup, update.file);
    }
    for (const update of staged.slice(renamed)) {
      if (update.existed && existsSync(update.backup)) renameSync(update.backup, update.file);
    }
    throw error;
  } finally {
    for (const update of staged) {
      if (existsSync(update.staged)) unlinkSync(update.staged);
      if (existsSync(update.backup)) unlinkSync(update.backup);
    }
  }
}
