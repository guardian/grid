import {
  existsSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { basename } from "node:path";

const HISTORY_GLOBALS = { audit: "__AUDIT_LOG__", perceived: "__PERCEIVED_LOG__", density: "__DENSITY_LOG__", campaign: "__CAMPAIGN_LOG__" };

function historyFamily(file) {
  return Object.keys(HISTORY_GLOBALS).find(family => [`${family}-log.json`, `${family}-log.js`].includes(basename(file)));
}

export function formatHistoryScript(log, family) {
  if (!HISTORY_GLOBALS[family] || !Array.isArray(log?.entries)) throw new Error("Invalid dashboard history");
  const fields = Object.entries(log).map(([key, value]) => `${JSON.stringify(key)}:${key === "entries"
    ? `[\n${value.map(entry => JSON.stringify(entry)).join(",\n")}\n]` : JSON.stringify(value)}`);
  return `window.${HISTORY_GLOBALS[family]} = {\n${fields.join(",\n")}\n};\n`;
}

export function parseHistoryLog(contents, sourcePath) {
  let log;
  try {
    if (sourcePath.endsWith(".js")) {
      const family = historyFamily(sourcePath);
      const prefix = `window.${HISTORY_GLOBALS[family]} = `;
      const script = contents.trim();
      if (!family || !script.startsWith(prefix) || !script.endsWith(";")) throw new Error("Expected a single history JSON assignment");
      contents = script.slice(prefix.length, -1);
    }
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
  const family = historyFamily(file);
  if (family) {
    const script = file.replace(/\.(json|js)$/, ".js");
    if (!existsSync(script)) throw new Error(`Missing canonical history: ${script}`);
    file = script;
  }
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
  const acquisitionKnown = entries.length > 0 && entries.every(entry => entry.acquisition?.revision === 1);
  const counts = acquisitionKnown ? Object.fromEntries([...new Set(entries.flatMap(entry => Object.keys(entry.acquisition.counts)))].map(key =>
    [key, entries.every(entry => Number.isFinite(entry.acquisition.counts[key]))
      ? entries.reduce((sum, entry) => sum + entry.acquisition.counts[key], 0) : null])) : null;
  const incompleteEntries = entries.filter(entry => entry.acquisition && entry.acquisition.status !== "complete");
  const complete = missingSuites.length === 0 && shortRepetitions.length === 0 && !grep && incompleteEntries.length === 0;
  return {
    campaignId, label, completedAt, runs, grep: grep || null, requestedSuites, apiTopology, mediaDelivery,
    entries, complete, outcomeRevision: acquisitionKnown ? 1 : null, counts,
    status: entries.some(entry => entry.acquisition?.status === "invalid") ? "invalid" : complete ? "complete" : "incomplete",
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
