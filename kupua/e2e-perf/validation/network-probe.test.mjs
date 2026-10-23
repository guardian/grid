import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { installNetworkProbe } from "../network-probe.mjs";
import * as networkProbe from "../network-probe.mjs";

function fixture(unsupported = false) {
  let deliver;
  let disconnected = 0;
  const globals = {
    URL,
    location: { origin: "https://fixture.invalid" },
    window: {},
    PerformanceObserver: class {
      constructor(callback) { deliver = (entries) => callback({ getEntries: () => entries }); }
      observe(options) {
        assert.deepEqual(JSON.parse(JSON.stringify(options)), { type: "resource", buffered: true });
        if (unsupported) throw new Error("unsupported");
      }
      disconnect() { disconnected += 1; }
    },
  };
  runInNewContext(`(${installNetworkProbe.toString()})()`, globals);
  return { probe: globals.window.__perfNetwork, deliver, disconnected: () => disconnected };
}

test("serialized network probe separates ES, local API and deployed API without retaining URLs", () => {
  const { probe, deliver } = fixture();
  deliver([
    { name: "https://fixture.invalid/es/index/_search?secret=fixture", transferSize: 100, duration: 10 },
    { name: "https://fixture.invalid/api/images/search-after", transferSize: 200, duration: 20 },
    { name: "https://fixture.invalid/api", transferSize: 300, duration: 30 },
    { name: "https://api.media.test.dev-gutools.co.uk/images/private-id", transferSize: 400, duration: 40 },
    ...["https://other.invalid/api/images", "https://fixture.invalid/s3/image", "https://fixture.invalid/__kupua/perf-environment",
      "https://fixture.invalid/grid-usage/images", "https://fixture.invalid/asset?next=/es/"].map((name) => ({ name, transferSize: 999, duration: 999 })),
  ]);
  const direct = probe.snapshot("direct-es");
  const api = probe.snapshot("media-api");
  assert.equal(direct.networkRequests, 1);
  assert.equal(direct.networkBytes, 100);
  assert.equal(api.networkRequests, 3);
  assert.equal(api.networkBytes, 900);
  assert.equal(api.networkAvgDurationMs, 30);
  assert.equal(api.esRequests, 1);
  assert.equal(api.esBytes, 100);
  assert.doesNotMatch(JSON.stringify(api), /secret|private-id|https/);
});

test("zero transfer reports ambiguous byte evidence, not zero traffic", () => {
  const { probe, deliver } = fixture();
  deliver([{ name: "https://fixture.invalid/api/images", transferSize: 0, duration: 12 }]);
  const api = probe.snapshot("media-api");
  assert.equal(api.networkRequests, 1);
  assert.equal(api.networkBytes, null);
  assert.equal(api.networkAvgBytes, null);
  assert.equal(api.networkZeroTransferRequests, 1);
  assert.equal(api.networkAvgDurationMs, 12);
});

test("reset preserves the existing callback window and true zero request evidence", () => {
  const { probe, deliver } = fixture();
  deliver([{ name: "https://fixture.invalid/es/index/_search", transferSize: 100, duration: 10 }]);
  probe.reset();
  const empty = probe.snapshot("direct-es");
  assert.equal(empty.networkRequests, 0);
  assert.equal(empty.networkBytes, 0);
  assert.equal(empty.networkAvgDurationMs, null);
  assert.equal(empty.esRequests, 0);
  deliver([{ name: "https://fixture.invalid/es/index/_search", transferSize: 50, duration: 5 }]);
  assert.equal(probe.snapshot("direct-es").networkRequests, 1);
  probe.stop();
  assert.equal(deliver !== undefined, true);
});

test("unsupported resource timing is unavailable instead of measured zero", () => {
  const { probe, disconnected } = fixture(true);
  const api = probe.snapshot("media-api");
  for (const key of ["networkRequests", "networkBytes", "networkAvgBytes", "networkAvgDurationMs", "networkZeroTransferRequests"]) {
    assert.equal(api[key], null);
  }
  assert.equal(disconnected(), 1);
});

function requestFixture(options) {
  const listeners = new Map();
  const session = {
    on(name, callback) { listeners.set(name, callback); },
    off(name, callback) { if (listeners.get(name) === callback) listeners.delete(name); },
  };
  return {
    probe: networkProbe.createRequestProbe(session, options),
    emit(name, event) { listeners.get(`Network.${name}`)?.(event); },
    listenerCount: () => listeners.size,
  };
}

test("timestamp windows recover carry-in completion cancellation and pending work after controller delay", () => {
  const fixture = requestFixture();
  const start = (requestId, timestamp, wallTime) => fixture.emit("requestWillBeSent", {
    requestId, type: "Image", timestamp, wallTime,
    request: { url: "https://fixture.invalid/image" },
  });
  start("carry", 0.9, 999.9);
  fixture.probe.beginPhase();
  start("cancelled", 1.1, 1000.1);
  fixture.emit("loadingFinished", { requestId: "carry", timestamp: 1.2, encodedDataLength: 40 });
  start("pending-at-cutoff", 1.25, 1000.25);
  fixture.emit("loadingFailed", { requestId: "cancelled", timestamp: 1.3, canceled: true });
  fixture.probe.beginPhase();
  start("later", 1.6, 1000.6);
  fixture.emit("loadingFinished", { requestId: "pending-at-cutoff", timestamp: 1.7, encodedDataLength: 80 });
  const result = fixture.probe.snapshotBetween(1000000, 1000400);
  assert.equal(result.requestWindowCaptureRevision, 1);
  assert.equal(result.requestClockMissingCount, 0);
  assert.equal(result.mediaRequestsCarryIn, 1);
  assert.equal(result.mediaRequestStarts, 2);
  assert.equal(result.mediaRequestsCompleted, 1);
  assert.equal(result.mediaRequestCancellations, 1);
  assert.equal(result.mediaRequestFailures, 1);
  assert.equal(result.mediaRequestsPending, 1);
  assert.equal(result.mediaRequestsPeak, 2);
  assert.equal(result.mediaCompletedBytes, 40);
  assert.doesNotMatch(JSON.stringify(result), /fixture|requestId|https/);
  const recovery = fixture.probe.snapshotBetween(1000400, 1000800);
  assert.equal(recovery.mediaRequestsCarryIn, 1);
  assert.equal(recovery.mediaRequestStarts, 1);
  assert.equal(recovery.mediaRequestsCompleted, 1);
  assert.equal(recovery.mediaRequestsPending, 1);
  assert.equal(recovery.mediaCompletedBytes, 80);
});

test("timestamp windows use half-open boundaries and retain missing-clock diagnostics", () => {
  const fixture = requestFixture();
  fixture.emit("requestWillBeSent", { requestId: "edge", type: "Image", timestamp: 1, wallTime: 1000,
    request: { url: "https://fixture.invalid/image" } });
  fixture.emit("loadingFinished", { requestId: "edge", timestamp: 1.1, encodedDataLength: 10 });
  assert.equal(fixture.probe.snapshotBetween(1000000, 1000100).mediaRequestsPending, 1);
  assert.equal(fixture.probe.snapshotBetween(1000100, 1000200).mediaRequestsCompleted, 1);
  fixture.emit("requestWillBeSent", { requestId: "missing", type: "Image", timestamp: 2,
    request: { url: "https://fixture.invalid/image" } });
  assert.equal(fixture.probe.snapshotBetween(1000000, 1000200).requestClockMissingCount, 1);
  assert.throws(() => fixture.probe.snapshotBetween(2, 1), /window/i);
  fixture.probe.dispose();
  assert.throws(() => fixture.probe.snapshotBetween(1000000, 1000200), /disposed/i);
});

test("request windows separate allowlisted proxy HIT MISS and unknown from browser cache", () => {
  const fixture = requestFixture({ localProxyOrigins: ["https://fixture.invalid"] });
  for (const [index, cache] of ["HIT", "MISS", "unrecognized-private-value"].entries()) {
    fixture.emit("requestWillBeSent", { requestId: String(index), type: "Image", timestamp: 1, wallTime: 1000,
      request: { url: "https://fixture.invalid/s3/thumb/image" } });
    fixture.emit("responseReceived", { requestId: String(index), response: { status: 200, url: "https://fixture.invalid/s3/thumb/image",
      headers: { "X-Cache": cache }, fromDiskCache: false } });
    fixture.emit("loadingFinished", { requestId: String(index), timestamp: 1.1, encodedDataLength: 10 });
  }
  const result = fixture.probe.snapshotBetween(1000000, 1000200);
  assert.equal(result.mediaProxyCacheHits, 1);
  assert.equal(result.mediaProxyCacheMisses, 1);
  assert.equal(result.mediaProxyCacheUnknown, 1);
  assert.equal(result.mediaCacheResponses, 0);
  assert.doesNotMatch(JSON.stringify(result), /private|X-Cache|fixture/);
});

test("proxy cache attribution requires configured origin and path through redirects", () => {
  const origin = "https://fixture.invalid";
  const local = `${origin}/s3/thumb/image`;
  const remote = "https://cdn.invalid/s3/thumb/image";
  for (const [name, requestUrl, responseUrl, redirectUrl, configured] of [
    ["remote", remote, remote, null, true],
    ["wrong-path", `${origin}/images/image`, `${origin}/images/image`, null, true],
    ["origin-lookalike", "https://fixture.invalid.cdn.invalid/s3/thumb/image", local, null, true],
    ["response-origin", local, remote, null, true],
    ["response-path", local, `${origin}/images/image`, null, true],
    ["redirect-away", local, remote, remote, true],
    ["redirect-roundtrip", local, local, remote, true],
    ["unconfigured", local, local, null, false],
  ]) {
    const fixture = requestFixture({ localProxyOrigins: configured ? [origin] : [] });
    fixture.emit("requestWillBeSent", { requestId: name, type: "Image", timestamp: 1, wallTime: 1000,
      request: { url: requestUrl } });
    if (redirectUrl) fixture.emit("requestWillBeSent", { requestId: name, type: "Image", timestamp: 1.02,
      redirectResponse: { status: 302 }, request: { url: redirectUrl } });
    fixture.emit("responseReceived", { requestId: name, response: { status: 200, url: responseUrl,
      headers: { "X-Cache": "HIT" } } });
    fixture.emit("loadingFinished", { requestId: name, timestamp: 1.1, encodedDataLength: 10 });
    const result = fixture.probe.snapshotBetween(1000000, 1000200);
    assert.equal(result.mediaProxyCacheHits, 0, name);
    assert.equal(result.mediaProxyCacheMisses, 0, name);
    assert.equal(result.mediaProxyCacheUnknown, 1, name);
    assert.equal(result.mediaRequestsCompleted, 1, name);
    assert.doesNotMatch(JSON.stringify(result), /https|fixture|cdn|X-Cache/);
    fixture.probe.dispose();
  }
});

test("request accounting observes starts, completions and numeric-only API/media summaries", () => {
  const fixture = requestFixture();
  fixture.emit("requestWillBeSent", { requestId: "image-private", type: "Image", timestamp: 1,
    request: { url: "https://fixture.invalid/s3/thumb/private?Signature=secret" } });
  fixture.emit("requestWillBeSent", { requestId: "query-private", type: "Fetch", timestamp: 1.01,
    request: { url: "https://fixture.invalid/api/images?query=private" } });
  fixture.emit("requestWillBeSent", { requestId: "font", type: "Font", timestamp: 1.01,
    request: { url: "https://fixture.invalid/font.woff" } });
  let result = fixture.probe.snapshot();
  assert.equal(result.mediaRequestStarts, 1);
  assert.equal(result.mediaRequestsPending, 1);
  assert.equal(result.dataRequestStarts, 1);
  fixture.emit("loadingFinished", { requestId: "image-private", timestamp: 1.03, encodedDataLength: 120 });
  result = fixture.probe.snapshot();
  assert.equal(result.requestCaptureRevision, 1);
  assert.equal(result.mediaRequestsCompleted, 1);
  assert.equal(result.mediaRequestsPending, 0);
  assert.equal(result.mediaCompletedBytes, 120);
  assert.equal(Math.round(result.mediaRequestDurationMaxMs), 30);
  assert.equal(result.dataRequestsPending, 1);
  assert.doesNotMatch(JSON.stringify(result), /private|secret|Signature|https/);
  assert.ok(Object.values(result).every(value => value === null || Number.isFinite(value)));
});

test("data timing separates browser send and response phases without inventing missing timings", () => {
  const fixture = requestFixture();
  fixture.emit("requestWillBeSent", { requestId: "timed", type: "Fetch", timestamp: 10,
    request: { url: "https://fixture.invalid/api/images/search-after?private=secret" } });
  fixture.emit("responseReceived", { requestId: "timed", response: { status: 200,
    timing: { requestTime: 10.1, sendStart: 200, receiveHeadersStart: 700 } } });
  assert.equal(fixture.probe.snapshot().dataTimingCompletions, 0);
  fixture.probe.beginPhase();
  fixture.emit("loadingFinished", { requestId: "timed", timestamp: 10.85, encodedDataLength: 100 });
  const result = fixture.probe.snapshot();
  assert.equal(result.requestTimingCaptureRevision, 1);
  assert.equal(result.dataTimingCompletions, 1);
  assert.equal(result.dataTimingUnavailableCompletions, 0);
  assert.equal(result.dataBeforeSendMaxMs, 300);
  assert.equal(result.dataSendToHeadersMaxMs, 500);
  assert.equal(result.dataHeadersToCompleteMaxMs, 50);
  assert.equal(result.dataBeforeSendMeanMs, 300);
  assert.doesNotMatch(JSON.stringify(result), /private|secret|https/);
  fixture.probe.dispose();
});

test("data timing excludes redirects, cached responses and invalid or absent clocks", () => {
  for (const variation of ["missing", "negative", "late-send", "late-headers", "redirect", "cached"]) {
    const fixture = requestFixture();
    const request = { requestId: "data", type: "Fetch", timestamp: 10,
      request: { url: "https://fixture.invalid/api/images/search-after" } };
    fixture.emit("requestWillBeSent", request);
    if (variation === "redirect") fixture.emit("requestWillBeSent", { ...request, redirectResponse: { status: 302 } });
    fixture.emit("responseReceived", { requestId: "data", response: { status: 200,
      fromDiskCache: variation === "cached",
      ...(variation === "missing" ? {} : { timing: { requestTime: 10,
        sendStart: variation === "negative" ? -1 : variation === "late-send" ? 600 : 100,
        receiveHeadersStart: variation === "late-headers" ? 1000 : 500 } }) } });
    fixture.emit("loadingFinished", { requestId: "data", timestamp: 10.8, encodedDataLength: 100 });
    const result = fixture.probe.snapshot();
    assert.equal(result.dataTimingCompletions, 0, variation);
    assert.equal(result.dataTimingUnavailableCompletions, 1, variation);
    assert.equal(result.dataBeforeSendMaxMs, null, variation);
    assert.equal(result.dataSendToHeadersMeanMs, null, variation);
    assert.equal(result.dataHeadersToCompleteMaxMs, null, variation);
    fixture.probe.dispose();
  }
});

test("phase checkpoints retain carry-in work and account for failures without claiming completed bytes", () => {
  const fixture = requestFixture();
  fixture.emit("requestWillBeSent", { requestId: "first", type: "Image", timestamp: 1,
    request: { url: "https://fixture.invalid/first.jpg" } });
  fixture.probe.beginPhase();
  fixture.emit("requestWillBeSent", { requestId: "second", type: "Image", timestamp: 2,
    request: { url: "https://fixture.invalid/second.jpg" } });
  fixture.emit("loadingFinished", { requestId: "first", timestamp: 2.1, encodedDataLength: 100 });
  let result = fixture.probe.snapshot();
  assert.equal(result.mediaRequestsCarryIn, 1);
  assert.equal(result.mediaRequestStarts, 1);
  assert.equal(result.mediaRequestsCompleted, 1);
  assert.equal(result.mediaRequestsPending, 1);
  assert.equal(result.mediaRequestsPeak, 2);
  fixture.emit("loadingFailed", { requestId: "second", timestamp: 2.2, canceled: true });
  result = fixture.probe.snapshot();
  assert.equal(result.mediaRequestFailures, 1);
  assert.equal(result.mediaRequestCancellations, 1);
  assert.equal(result.mediaRequestsPending, 0);
  assert.equal(result.mediaCompletedBytes, 100);
});

test("redirect bytes remain incomplete and cache-served zero transfer stays explicit", () => {
  const fixture = requestFixture();
  for (const redirect of [false, true]) fixture.emit("requestWillBeSent", {
    requestId: "redirect", type: "Image", timestamp: redirect ? 2 : 1,
    request: { url: `https://fixture.invalid/${redirect ? "final" : "initial"}.jpg` },
    ...(redirect ? { redirectResponse: { status: 302 } } : {}),
  });
  fixture.emit("loadingFinished", { requestId: "redirect", timestamp: 3, encodedDataLength: 80 });
  fixture.emit("requestWillBeSent", { requestId: "cached", type: "Image", timestamp: 3,
    request: { url: "https://fixture.invalid/cached.jpg" } });
  fixture.emit("requestServedFromCache", { requestId: "cached" });
  fixture.emit("loadingFinished", { requestId: "cached", timestamp: 3.01, encodedDataLength: 0 });
  const result = fixture.probe.snapshot();
  assert.equal(result.mediaRequestStarts, 2);
  assert.equal(result.mediaRequestRedirects, 1);
  assert.equal(result.mediaRequestsCompleted, 2);
  assert.equal(result.mediaCompletedBytes, null);
  assert.equal(result.mediaUnknownByteRequests, 1);
  assert.equal(result.mediaCacheResponses, 1);
});

test("request tracking is bounded and disposal removes all owned listeners", () => {
  const fixture = requestFixture({ limit: 1 });
  for (const requestId of ["first", "overflow"]) fixture.emit("requestWillBeSent", {
    requestId, type: "Image", timestamp: 1, request: { url: "https://fixture.invalid/image.jpg" },
  });
  assert.equal(fixture.probe.snapshot().requestCaptureOverflow, 1);
  fixture.probe.dispose();
  assert.equal(fixture.listenerCount(), 0);
});

test("action timestamps correlate pending work and unavailable clocks remain unknown", () => {
  const fixture = requestFixture();
  fixture.emit("requestWillBeSent", { requestId: "image", type: "Image", timestamp: 20, wallTime: 1000,
    request: { url: "https://fixture.invalid/image.jpg" } });
  fixture.emit("loadingFinished", { requestId: "image", timestamp: 20.5, encodedDataLength: 100 });
  assert.equal(fixture.probe.pendingAt("media", 999999), 0);
  assert.equal(fixture.probe.pendingAt("media", 1000200), 1);
  assert.equal(fixture.probe.pendingAt("media", 1000500), 0);
  fixture.emit("requestWillBeSent", { requestId: "unknown-clock", type: "Image", timestamp: 21,
    request: { url: "https://fixture.invalid/unknown.jpg" } });
  assert.equal(fixture.probe.pendingAt("media", 1000600), null);
  assert.equal(fixture.probe.snapshot().requestClockMissingCount, 1);
});