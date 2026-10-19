import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { installNetworkProbe } from "./network-probe.mjs";
import * as networkProbe from "./network-probe.mjs";

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