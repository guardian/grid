import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { installNetworkProbe } from "./network-probe.mjs";

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