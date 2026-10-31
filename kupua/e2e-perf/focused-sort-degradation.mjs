// Degraded focused-sort samples: PP3/PP4 record the store's sort-around-focus
// fallback (focus abandoned after a timeout or failed lookup) as an explicit
// degraded outcome with browser-side diagnostics, rather than a failed
// campaign. Ordinary diagnostics retain timing and operation categories, not
// media identities, queries, ES index names, hosts, request bodies or error text.
// Ordinary console/run reports receive redacted details; history keeps counts and reasons.

import { appendFileSync, closeSync, constants, fstatSync, lstatSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const FOCUSED_SORT_DEGRADATION_REVISION = 2;
export const DEGRADABLE_PERCEIVED_IDS = Object.freeze(["PP3", "PP4"]);

const WARNING_CATEGORIES = [
  ["timeout", /^\[sort-around-focus\] Timed out after\b/],
  ["find-error", /^\[sort-around-focus\] Failed to find image\b/],
  ["offset-lookup-error", /^\[sort-around-focus\] exact offset lookup failed\b/],
  ["neighbour-check-error", /^\[sort-around-focus\] neighbour batch check failed\b/],
];

const STALLED_REQUEST_MS = 1_000;
const EARLY_SENT_LIMIT = 1_000;
const ES_OPERATIONS = new Set(["_search", "_count", "_mget", "_pit"]);
const API_OPERATIONS = new Set(["rank", "search-after", "aggregations", "count"]);
const REPOSITORY_ROOT = realpathSync(fileURLToPath(new URL("../..", import.meta.url)));
const PRIVATE_PP3_LIMIT_BYTES = 16_384;

function outsideRepository(path) {
  const target = realpathSync(path);
  const fromRepository = relative(REPOSITORY_ROOT, target);
  if (!isAbsolute(fromRepository) && fromRepository !== ".." && !fromRepository.startsWith(`..${sep}`)) {
    throw new Error("Private PP3 diagnostics must stay outside the repository");
  }
  return target;
}

export function assertPrivatePp3OutputFile(file) {
  outsideRepository(file);
  const info = lstatSync(file);
  if (!info.isFile() || (info.mode & 0o077) !== 0) throw new Error("PP3 diagnostic output must be a private regular file");
}

function privatePp3Record(sample) {
  if (sample?.id !== "PP3" || typeof sample.focusedImageId !== "string"
    || !/^[a-zA-Z0-9_-]{1,128}$/.test(sample.focusedImageId)
    || typeof sample.actionStartedAt !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(sample.actionStartedAt)) {
    throw new Error("Invalid private PP3 diagnostic");
  }
  return { id: "PP3", focusedImageId: sample.focusedImageId, actionStartedAt: sample.actionStartedAt };
}

export function createPrivatePp3Diagnostics(directory = tmpdir()) {
  const folder = mkdtempSync(resolve(outsideRepository(directory), "kupua-pp3-"));
  const file = resolve(folder, "debug.jsonl");
  writeFileSync(file, "", { flag: "wx", mode: 0o600 });
  let removed = false;
  return {
    file,
    readAndRemove() {
      if (removed) return [];
      try {
        assertPrivatePp3OutputFile(file);
        const descriptor = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
          if (fstatSync(descriptor).size > PRIVATE_PP3_LIMIT_BYTES) throw new Error("Private PP3 diagnostic limit exceeded");
          return readFileSync(descriptor, "utf8").split("\n").filter(Boolean).map(line => privatePp3Record(JSON.parse(line)));
        } finally {
          closeSync(descriptor);
        }
      } catch {
        throw new Error("Invalid private PP3 diagnostic handoff");
      } finally {
        removed = true;
        rmSync(folder, { recursive: true, force: true });
      }
    },
  };
}

export function recordPrivatePp3Diagnostic(file, sample) {
  if (!file || sample.id !== "PP3") return false;
  const record = `${JSON.stringify(privatePp3Record(sample))}\n`;
  assertPrivatePp3OutputFile(file);
  const descriptor = openSync(file, constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW);
  try {
    if (fstatSync(descriptor).size + Buffer.byteLength(record) > PRIVATE_PP3_LIMIT_BYTES) {
      throw new Error("Private PP3 diagnostic limit exceeded");
    }
    appendFileSync(descriptor, record);
  } finally {
    closeSync(descriptor);
  }
  return true;
}

export function classifySortAroundFocusWarning(text) {
  if (typeof text !== "string") return null;
  return WARNING_CATEGORIES.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}

export function sanitizeDataOperation(method, rawUrl, route) {
  const safeMethod = typeof method === "string" && /^[A-Z]{3,7}$/.test(method) ? method : "?";
  let pathname;
  try {
    pathname = new URL(rawUrl).pathname;
  } catch {
    return `${safeMethod} :unparseable`;
  }
  const pathSegments = pathname.split("/").filter(Boolean);
  const segments = pathSegments.map((segment, index) => {
    if (route === "direct-es") {
      if (index === 0 && segment === "es") return segment;
      return index === pathSegments.length - 1 && ES_OPERATIONS.has(segment) ? segment : ":index";
    }
    if (index === 0 && segment === "api") return segment;
    if (index === 1 && pathSegments[0] === "api" && segment === "images") return segment;
    if (index === 2 && pathSegments[0] === "api" && pathSegments[1] === "images"
      && API_OPERATIONS.has(segment)) return segment;
    return ":id";
  });
  return `${safeMethod} /${segments.join("/")}`;
}

function redactRecordedOperation(request) {
  const match = typeof request.operation === "string" && /^([A-Z]{3,7}) (\/\S*)$/.exec(request.operation);
  if (!match) return "? :unparseable";
  try {
    return sanitizeDataOperation(match[1], new URL(match[2], "https://diagnostic.invalid").href, request.route);
  } catch {
    return "? :unparseable";
  }
}

function sanitizeFailure(errorText) {
  return typeof errorText === "string" && /^net::[A-Z0-9_]{1,64}$/.test(errorText) ? errorText : "other";
}

const finite = (value) => typeof value === "number" && Number.isFinite(value);

export function createDataRequestRecorder(session, { classifyUrl, limit = 200 } = {}) {
  if (typeof classifyUrl !== "function") throw new Error("Data request recorder requires classifyUrl");
  if (!Number.isInteger(limit) || limit < 1 || limit > 1_000) throw new Error("Invalid data request limit");
  const records = new Map();
  const sentBeforeStart = new Set();
  let overflow = 0;
  let stopped = false;

  const listeners = {
    requestWillBeSent(event) {
      if (stopped || records.has(event.requestId)) return;
      const sentEarly = sentBeforeStart.delete(event.requestId);
      let route = null;
      try { route = classifyUrl(event.request?.url); } catch { route = null; }
      if (route !== "media-api" && route !== "direct-es") return;
      if (records.size >= limit) { overflow++; return; }
      records.set(event.requestId, {
        route,
        operation: sanitizeDataOperation(event.request?.method, event.request?.url, route),
        startedEpochMs: finite(event.wallTime) ? event.wallTime * 1_000 : null,
        startedMonoS: finite(event.timestamp) ? event.timestamp : null,
        sent: sentEarly,
        headersMonoS: null,
        endedMonoS: null,
        status: null,
        outcome: "pending",
        failure: null,
      });
    },
    // Chromium reports raw request headers only once the request is written to
    // a connection. It may arrive before or after requestWillBeSent; early IDs
    // wait here until their requestWillBeSent (of any route) releases them.
    requestWillBeSentExtraInfo(event) {
      if (stopped) return;
      const record = records.get(event.requestId);
      if (record) record.sent = true;
      else if (sentBeforeStart.size < EARLY_SENT_LIMIT) sentBeforeStart.add(event.requestId);
    },
    responseReceived(event) {
      const record = records.get(event.requestId);
      if (stopped || !record) return;
      record.status = finite(event.response?.status) ? event.response.status : null;
      record.headersMonoS = finite(event.timestamp) ? event.timestamp : null;
    },
    loadingFinished(event) {
      const record = records.get(event.requestId);
      if (stopped || !record || record.outcome !== "pending") return;
      record.endedMonoS = finite(event.timestamp) ? event.timestamp : null;
      record.outcome = record.status != null && record.status >= 400 ? "http-error" : "ok";
    },
    loadingFailed(event) {
      const record = records.get(event.requestId);
      if (stopped || !record || record.outcome !== "pending") return;
      record.endedMonoS = finite(event.timestamp) ? event.timestamp : null;
      record.outcome = event.canceled ? "cancelled" : "failed";
      record.failure = sanitizeFailure(event.errorText);
    },
  };
  for (const [name, callback] of Object.entries(listeners)) session.on(`Network.${name}`, callback);

  const elapsedMs = (fromS, toS) => finite(fromS) && finite(toS) && toS >= fromS
    ? Math.round((toS - fromS) * 1_000) : null;

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      for (const [name, callback] of Object.entries(listeners)) session.off(`Network.${name}`, callback);
    },
    snapshot({ originEpochMs, captureEpochMs }) {
      const requests = [...records.values()]
        .sort((first, second) => (first.startedEpochMs ?? Infinity) - (second.startedEpochMs ?? Infinity))
        .map((record) => {
          const startedMs = finite(record.startedEpochMs) && finite(originEpochMs)
            ? Math.round(record.startedEpochMs - originEpochMs) : null;
          const durationMs = record.outcome === "pending"
            ? (finite(record.startedEpochMs) && finite(captureEpochMs)
              ? Math.max(0, Math.round(captureEpochMs - record.startedEpochMs)) : null)
            : elapsedMs(record.startedMonoS, record.endedMonoS);
          return {
            route: record.route,
            operation: record.operation,
            startedMs,
            durationMs,
            sent: record.sent,
            headersMs: elapsedMs(record.startedMonoS, record.headersMonoS),
            outcome: record.outcome,
            ...(record.status != null && { status: record.status }),
            ...(record.failure != null && { failure: record.failure }),
          };
        });
      return { requests, requestCaptureOverflow: overflow };
    },
  };
}

export function summarizeFocusedSortDegradation({
  focus,
  fallbackMs,
  phases,
  originEpochMs,
  warnings,
  network,
}) {
  const categories = warnings.map((warning) => warning.category);
  const reason = categories.includes("timeout") ? "timeout"
    : categories.includes("find-error") ? "find-error"
      : "focus-cleared-without-warning";
  return {
    degradationRevision: FOCUSED_SORT_DEGRADATION_REVISION,
    reason,
    focusedImageId: null,
    focus,
    actionStartedAt: finite(originEpochMs) ? new Date(originEpochMs).toISOString() : null,
    fallbackMs: finite(fallbackMs) ? fallbackMs : null,
    phaseReached: phases.includes("t_seeking") ? "seeking" : "finding",
    warnings: warnings.map((warning) => ({
      category: warning.category,
      atMs: finite(warning.epochMs) && finite(originEpochMs) ? Math.round(warning.epochMs - originEpochMs) : null,
    })),
    requests: network.requests.map((request) => ({
      route: request.route,
      operation: redactRecordedOperation(request),
      startedMs: request.startedMs,
      durationMs: request.durationMs,
      sent: request.sent,
      headersMs: request.headersMs,
      outcome: request.outcome,
      ...(request.status != null && { status: request.status }),
      ...(request.failure != null && { failure: sanitizeFailure(request.failure) }),
    })),
    requestCaptureOverflow: network.requestCaptureOverflow,
  };
}

// Degraded samples never enter latency medians; their count and reasons stay
// explicit so a smaller sample is never silent.
export function partitionDegradedSamples(entries, scenarioId) {
  const degraded = entries.filter((entry) => entry.degraded != null);
  if (degraded.length === 0) return { healthy: entries, summary: null };
  if (!DEGRADABLE_PERCEIVED_IDS.includes(scenarioId)) {
    throw new Error(`${scenarioId} cannot record degraded samples`);
  }
  const degradedReasons = {};
  for (const entry of degraded) {
    const reason = entry.degraded.reason;
    if (typeof reason !== "string" || reason.length === 0) {
      throw new Error(`${scenarioId} degraded sample has no reason`);
    }
    degradedReasons[reason] = (degradedReasons[reason] ?? 0) + 1;
  }
  return {
    healthy: entries.filter((entry) => entry.degraded == null),
    summary: { degradedCount: degraded.length, degradedReasons },
  };
}

function isStalled(request) {
  return request.headersMs == null && finite(request.durationMs) && request.durationMs >= STALLED_REQUEST_MS;
}

function formatRequest(request) {
  const start = request.startedMs == null ? "+?" : `+${request.startedMs}ms`;
  const duration = request.durationMs == null ? "?" : `${request.durationMs}ms`;
  const outcome = request.outcome === "pending" ? `still pending after ${duration}`
    : request.outcome === "cancelled" || request.outcome === "failed"
      ? `${request.outcome}${request.failure ? ` ${sanitizeFailure(request.failure)}` : ""} after ${duration}`
      : `${request.status ?? "?"} in ${duration}`;
  const headers = request.headersMs == null ? "no response headers" : `headers ${request.headersMs}ms`;
  const sent = request.sent ? "sent" : "not reported sent";
  const stalled = isStalled(request) ? "  <-- STALLED" : "";
  return `      ${start.padEnd(9)} ${redactRecordedOperation(request).padEnd(36)} ${outcome} · ${headers} · ${sent}${stalled}`;
}

export function formatFocusedSortDegradation(sample) {
  const where = sample.runLabel ? ` — ${sample.runLabel}` : "";
  const fallback = sample.fallbackMs == null ? "unknown" : `${sample.fallbackMs}ms`;
  const warnings = sample.warnings.length === 0
    ? "none"
    : sample.warnings.map((warning) => `${warning.category} @${warning.atMs ?? "?"}ms`).join(", ");
  const lines = [
    `  ${sample.id} ${sample.label ?? ""}${where}`,
    `    DEGRADED: ${sample.reason} — store abandoned the focused image (focus ${sample.focus}) after ${fallback}; reached ${sample.phaseReached}`,
    "    focused image: redacted (identity not retained)",
    `    action t_0 (UTC): ${sample.actionStartedAt ?? "unknown"}`,
    `    sort-around-focus warnings: ${warnings}`,
    `    data requests from t_0 (${sample.requests.length}${sample.requestCaptureOverflow ? `, ${sample.requestCaptureOverflow} not recorded` : ""}):`,
    ...(sample.requests.length === 0 ? ["      none recorded"] : sample.requests.map(formatRequest)),
  ];
  const stalled = sample.requests.filter(isStalled);
  if (stalled.length > 0) {
    const completedDuring = sample.requests.filter((request) => !isStalled(request)
      && request.outcome !== "pending"
      && finite(request.startedMs) && finite(request.durationMs)
      && stalled.some((target) => finite(target.startedMs)
        && request.startedMs >= target.startedMs
        && request.startedMs + request.durationMs <= target.startedMs + target.durationMs));
    lines.push(`    ${stalled.length} stalled without response headers; ${completedDuring.length} other data request(s) started and finished meanwhile`);
  }
  return lines;
}
