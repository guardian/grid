import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname } from "node:path";
import test from "node:test";
import * as focusedSortDiagnostics from "../focused-sort-degradation.mjs";

import {
  DEGRADABLE_PERCEIVED_IDS,
  classifySortAroundFocusWarning,
  createDataRequestRecorder,
  formatFocusedSortDegradation,
  partitionDegradedSamples,
  sanitizeDataOperation,
  summarizeFocusedSortDegradation,
} from "../focused-sort-degradation.mjs";

const HEX_ID = "0123456789abcdef0123456789abcdef01234567";

function classifyUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (url.pathname.startsWith("/api/")) return "media-api";
  if (url.pathname.startsWith("/es/")) return "direct-es";
  return null;
}

function recorderFixture(options = {}) {
  const session = new EventEmitter();
  const recorder = createDataRequestRecorder(session, { classifyUrl, ...options });
  const emit = (name, event) => session.emit(`Network.${name}`, event);
  const start = (requestId, path, { method = "POST", atS = 100, wallS = 1_000 } = {}) => emit("requestWillBeSent", {
    requestId, timestamp: atS, wallTime: wallS, request: { method, url: `https://fixture.invalid${path}` },
  });
  return { session, recorder, emit, start };
}

test("sort-around-focus warnings map to fixed categories", () => {
  assert.equal(classifySortAroundFocusWarning("[sort-around-focus] Timed out after 8s"), "timeout");
  assert.equal(classifySortAroundFocusWarning("[sort-around-focus] Failed to find image: TypeError: private"), "find-error");
  assert.equal(classifySortAroundFocusWarning("[sort-around-focus] exact offset lookup failed: x"), "offset-lookup-error");
  assert.equal(classifySortAroundFocusWarning("[sort-around-focus] neighbour batch check failed: x"), "neighbour-check-error");
  assert.equal(classifySortAroundFocusWarning("[sort-around-focus] position map hit"), null);
  assert.equal(classifySortAroundFocusWarning("unrelated Timed out after 8s"), null);
  assert.equal(classifySortAroundFocusWarning(undefined), null);
});

test("data operations retain known operation categories but redact identities and URL details", () => {
  assert.equal(sanitizeDataOperation("POST", "https://fixture.invalid/api/images/rank?q=private", "media-api"), "POST /api/images/rank");
  assert.equal(sanitizeDataOperation("GET", `https://fixture.invalid/api/images/${HEX_ID}`, "media-api"), "GET /api/images/:id");
  assert.equal(sanitizeDataOperation("GET", "https://fixture.invalid/api/images/private-marker", "media-api"), "GET /api/images/:id");
  assert.equal(sanitizeDataOperation("GET", "https://fixture.invalid/api/images/%70rivate-marker/metadata", "media-api"), "GET /api/images/:id/:id");
  assert.equal(sanitizeDataOperation("GET", "https://fixture.invalid/api/images/private%20segment", "media-api"), "GET /api/images/:id");
  assert.equal(sanitizeDataOperation("POST", "https://fixture.invalid/es/private-index/_search?x=1", "direct-es"), "POST /es/:index/_search");
  assert.equal(sanitizeDataOperation("POST", "https://fixture.invalid/es/_private/_search", "direct-es"), "POST /es/:index/_search");
  assert.equal(sanitizeDataOperation("post", "not a url", "media-api"), "? :unparseable");
});

test("recorder separates sent, answered, cancelled and pending data requests", () => {
  const { recorder, emit, start } = recorderFixture();
  emit("requestWillBeSentExtraInfo", { requestId: "early-sent" });
  start("early-sent", "/api/images/search-after?private=1", { atS: 100, wallS: 1_000 });
  emit("responseReceived", { requestId: "early-sent", timestamp: 100.2, response: { status: 200 } });
  emit("loadingFinished", { requestId: "early-sent", timestamp: 100.25 });

  start("stalled", "/api/images/rank", { atS: 100.3, wallS: 1_000.3 });
  emit("requestWillBeSentExtraInfo", { requestId: "stalled" });
  emit("loadingFailed", { requestId: "stalled", timestamp: 108.3, canceled: true, errorText: "net::ERR_ABORTED" });

  start("pending", `/api/images/${HEX_ID}`, { method: "GET", atS: 101, wallS: 1_001 });
  start("server-error", "/api/images/search-after", { atS: 100.4, wallS: 1_000.4 });
  emit("responseReceived", { requestId: "server-error", timestamp: 100.5, response: { status: 502 } });
  emit("loadingFinished", { requestId: "server-error", timestamp: 100.5 });
  start("thumbnail", "/s3/private.jpg");
  emit("loadingFailed", { requestId: "odd-failure", timestamp: 1, errorText: "private service text" });

  recorder.stop();
  emit("requestWillBeSent", { requestId: "late", timestamp: 102, wallTime: 1_002, request: { method: "POST", url: "https://fixture.invalid/api/late" } });
  const snapshot = recorder.snapshot({ originEpochMs: 999_900, captureEpochMs: 1_009_000 });

  assert.equal(snapshot.requestCaptureOverflow, 0);
  assert.deepEqual(snapshot.requests, [
    { route: "media-api", operation: "POST /api/images/search-after", startedMs: 100, durationMs: 250, sent: true, headersMs: 200, outcome: "ok", status: 200 },
    { route: "media-api", operation: "POST /api/images/rank", startedMs: 400, durationMs: 8_000, sent: true, headersMs: null, outcome: "cancelled", failure: "net::ERR_ABORTED" },
    { route: "media-api", operation: "POST /api/images/search-after", startedMs: 500, durationMs: 100, sent: false, headersMs: 100, outcome: "http-error", status: 502 },
    { route: "media-api", operation: "GET /api/images/:id", startedMs: 1_100, durationMs: 8_000, sent: false, headersMs: null, outcome: "pending" },
  ]);
  assert.doesNotMatch(JSON.stringify(snapshot), new RegExp(`fixture\\.invalid|private|${HEX_ID}`));
});

test("recorder sanitizes failure text, bounds records and removes its listeners", () => {
  const { session, recorder, emit, start } = recorderFixture({ limit: 1 });
  start("first", "/api/images/rank");
  emit("loadingFailed", { requestId: "first", timestamp: 101, canceled: false, errorText: "private service detail" });
  start("second", "/api/images/rank");
  const snapshot = recorder.snapshot({ originEpochMs: 1_000_000, captureEpochMs: 1_000_000 });
  assert.equal(snapshot.requests[0].failure, "other");
  assert.equal(snapshot.requests[0].outcome, "failed");
  assert.equal(snapshot.requestCaptureOverflow, 1);
  recorder.stop();
  assert.equal(session.eventNames().length, 0);
  assert.throws(() => createDataRequestRecorder(session, {}), /classifyUrl/);
  assert.throws(() => createDataRequestRecorder(session, { classifyUrl, limit: 0 }), /limit/);
});

test("early headers-sent reports for media cannot crowd out later data requests", () => {
  const { recorder, emit, start } = recorderFixture();
  for (let index = 0; index < 1_200; index += 1) {
    emit("requestWillBeSentExtraInfo", { requestId: `thumb-${index}` });
    start(`thumb-${index}`, `/s3/private-${index}.jpg`);
  }
  emit("requestWillBeSentExtraInfo", { requestId: "rank" });
  start("rank", "/api/images/rank");
  const [request] = recorder.snapshot({ originEpochMs: 1_000_000, captureEpochMs: 1_000_000 }).requests;
  assert.equal(request.operation, "POST /api/images/rank");
  assert.equal(request.sent, true);
});

test("degradation summary prefers the store's own timeout witness and records the reached phase", () => {
  const network = { requests: [], requestCaptureOverflow: 0 };
  const base = { focusedImageId: HEX_ID, focus: "cleared", fallbackMs: 8_012, originEpochMs: Date.UTC(2026, 9, 23, 2, 13, 40), network };
  const timeout = summarizeFocusedSortDegradation({
    ...base,
    phases: ["t_0", "t_ack", "t_status_visible", "t_seeking", "t_store_ready"],
    warnings: [{ category: "offset-lookup-error", epochMs: base.originEpochMs + 300 }, { category: "timeout", epochMs: base.originEpochMs + 8_004 }],
  });
  assert.equal(timeout.reason, "timeout");
  assert.equal(timeout.focusedImageId, null);
  assert.equal(timeout.degradationRevision, 2);
  assert.doesNotMatch(JSON.stringify(timeout), new RegExp(HEX_ID));
  assert.equal(timeout.phaseReached, "seeking");
  assert.equal(timeout.actionStartedAt, "2026-10-23T02:13:40.000Z");
  assert.deepEqual(timeout.warnings.map((warning) => warning.atMs), [300, 8_004]);
  assert.equal(summarizeFocusedSortDegradation({
    ...base, phases: ["t_0"], warnings: [{ category: "find-error", epochMs: base.originEpochMs }],
  }).reason, "find-error");
  const silent = summarizeFocusedSortDegradation({ ...base, focusedImageId: "", phases: ["t_0", "t_store_ready"], warnings: [] });
  assert.equal(silent.reason, "focus-cleared-without-warning");
  assert.equal(silent.focusedImageId, null);
  assert.equal(silent.phaseReached, "finding");
});

test("formatted diagnostics flag stalled requests and count work that completed meanwhile", () => {
  const sample = summarizeFocusedSortDegradation({
    focusedImageId: HEX_ID,
    focus: "cleared",
    fallbackMs: 8_012,
    phases: ["t_seeking"],
    originEpochMs: 0,
    warnings: [{ category: "timeout", epochMs: 8_004 }],
    network: {
      requestCaptureOverflow: 0,
      requests: [
        { route: "media-api", operation: "POST /api/images/search-after", startedMs: 0, durationMs: 300, sent: true, headersMs: 290, outcome: "ok", status: 200 },
        { route: "media-api", operation: "POST /api/images/rank", startedMs: 320, durationMs: 7_690, sent: true, headersMs: null, outcome: "cancelled", failure: "net::ERR_ABORTED" },
        { route: "media-api", operation: "POST /api/images/search-after", startedMs: 330, durationMs: 150, sent: true, headersMs: 140, outcome: "ok", status: 200 },
        { route: "media-api", operation: "POST /api/images/aggregations", startedMs: 400, durationMs: 9_000, sent: true, headersMs: 120, outcome: "pending" },
      ],
    },
  });
  const lines = formatFocusedSortDegradation({ ...sample, id: "PP3", label: "sort-around-focus (Credit)", runLabel: "perceived (short) run 4 of 4" });
  const text = lines.join("\n");
  assert.match(lines[0], /PP3 sort-around-focus \(Credit\) — perceived \(short\) run 4 of 4/);
  assert.match(text, /DEGRADED: timeout .* after 8012ms; reached seeking/);
  assert.match(text, /focused image: redacted \(identity not retained\)/);
  assert.doesNotMatch(text, new RegExp(HEX_ID));
  assert.match(text, /timeout @8004ms/);
  assert.match(text, /POST \/api\/images\/rank\s+cancelled net::ERR_ABORTED after 7690ms · no response headers · sent {2}<-- STALLED/);
  assert.equal((text.match(/STALLED$/gm) ?? []).length, 1);
  assert.match(text, /1 stalled without response headers; 1 other data request\(s\) started and finished meanwhile/);
});

test("summaries and formatted legacy diagnostics cannot re-emit identity-bearing operations", () => {
  const sample = summarizeFocusedSortDegradation({
    focusedImageId: HEX_ID, focus: "cleared", fallbackMs: 8_012,
    phases: ["t_seeking"], originEpochMs: 0, warnings: [],
    network: { requestCaptureOverflow: 2, requests: [{
      route: "media-api", operation: `GET /api/images/${HEX_ID}?private-marker=1`,
      startedMs: 100, durationMs: 8_000, sent: true, headersMs: null, outcome: "pending",
    }] },
  });
  assert.doesNotMatch(JSON.stringify(sample), new RegExp(`${HEX_ID}|private-marker`));
  const text = formatFocusedSortDegradation({
    ...sample, id: "PP3", focusedImageId: HEX_ID,
    requests: [{ ...sample.requests[0], operation: "GET /api/images/private-marker" }],
  }).join("\n");
  assert.doesNotMatch(text, new RegExp(`${HEX_ID}|private-marker`));
  assert.match(text, /action t_0 \(UTC\): 1970-01-01T00:00:00\.000Z/);
  assert.match(text, /GET \/api\/images\/:id/);
  assert.match(text, /still pending after 8000ms/);
  assert.match(text, /2 not recorded/);
  assert.match(text, /1 stalled without response headers/);
});

test("legacy failure text and malformed operation URLs stay redacted without breaking reports", () => {
  const base = {
    focusedImageId: HEX_ID, focus: "cleared", fallbackMs: 8_012,
    phases: ["t_seeking"], originEpochMs: 0, warnings: [],
  };
  for (const operation of ["GET /api/images/private-marker", "GET //%ZZ/api/images/private-marker", "GET //%25ZZ/api/images/private-marker"]) {
    const request = {
      route: "media-api", operation, startedMs: 100, durationMs: 8_000,
      sent: true, headersMs: null, outcome: "failed", failure: "private-marker /api/images/private-marker",
    };
    const sample = summarizeFocusedSortDegradation({
      ...base, network: { requestCaptureOverflow: 0, requests: [request] },
    });
    assert.doesNotMatch(JSON.stringify(sample), /private-marker|%ZZ|%25ZZ/);
    const text = formatFocusedSortDegradation({ ...sample, id: "PP3", requests: [request] }).join("\n");
    assert.doesNotMatch(text, /private-marker|%ZZ|%25ZZ/);
    assert.match(text, /failed other after 8000ms/);
    assert.match(text, /1 stalled without response headers/);
  }
});

test("PP3 debug identities use a private external handoff that is removed after collection", () => {
  assert.equal(typeof focusedSortDiagnostics.createPrivatePp3Diagnostics, "function");
  const handoff = focusedSortDiagnostics.createPrivatePp3Diagnostics();
  try {
    assert.equal(statSync(dirname(handoff.file)).mode & 0o777, 0o700);
    assert.equal(statSync(handoff.file).mode & 0o777, 0o600);
    assert.equal(focusedSortDiagnostics.recordPrivatePp3Diagnostic(undefined, { id: "PP3", focusedImageId: HEX_ID, actionStartedAt: "1970-01-01T00:00:00.000Z" }), false);
    assert.equal(focusedSortDiagnostics.recordPrivatePp3Diagnostic(handoff.file, { id: "PP4", focusedImageId: "private-pp4-marker", actionStartedAt: "1970-01-01T00:00:00.000Z" }), false);
    assert.equal(readFileSync(handoff.file, "utf8"), "");
    assert.equal(focusedSortDiagnostics.recordPrivatePp3Diagnostic(handoff.file, { id: "PP3", focusedImageId: HEX_ID, actionStartedAt: "1970-01-01T00:00:00.000Z" }), true);
    assert.deepEqual(handoff.readAndRemove(), [{ id: "PP3", focusedImageId: HEX_ID, actionStartedAt: "1970-01-01T00:00:00.000Z" }]);
    assert.equal(existsSync(dirname(handoff.file)), false);
  } finally {
    handoff.readAndRemove();
  }
});

test("private PP3 handoffs reject repository locations and malformed identity records", () => {
  assert.equal(typeof focusedSortDiagnostics.createPrivatePp3Diagnostics, "function");
  assert.throws(() => focusedSortDiagnostics.createPrivatePp3Diagnostics(new URL("..", import.meta.url)), /outside the repository/);
  const handoff = focusedSortDiagnostics.createPrivatePp3Diagnostics();
  try {
    assert.throws(() => focusedSortDiagnostics.recordPrivatePp3Diagnostic(handoff.file, { id: "PP3", focusedImageId: "private-marker\nextra-line", actionStartedAt: "1970-01-01T00:00:00.000Z" }), /Invalid private PP3 diagnostic/);
    assert.equal(readFileSync(handoff.file, "utf8"), "");
  } finally {
    handoff.readAndRemove();
  }
});

test("only focused-sort scenarios may exclude degraded samples, each with a reason", () => {
  assert.deepEqual([...DEGRADABLE_PERCEIVED_IDS], ["PP3", "PP4"]);
  const healthy = { id: "PP3", dt_ack_ms: 10 };
  const degraded = { id: "PP3", degraded: { reason: "timeout" } };
  assert.deepEqual(partitionDegradedSamples([healthy], "PP3"), { healthy: [healthy], summary: null });
  assert.deepEqual(partitionDegradedSamples([healthy, degraded, degraded], "PP3"), {
    healthy: [healthy], summary: { degradedCount: 2, degradedReasons: { timeout: 2 } },
  });
  assert.throws(() => partitionDegradedSamples([degraded], "PP2"), /PP2 cannot record degraded samples/);
  assert.throws(() => partitionDegradedSamples([{ degraded: {} }], "PP4"), /PP4 degraded sample has no reason/);
});
