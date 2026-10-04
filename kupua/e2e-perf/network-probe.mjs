export function installNetworkProbe() {
  window.__perfNetwork?.stop();
  const buckets = { "direct-es": [], "media-api": [] };
  let observer;
  let available = false;
  const record = (entries) => {
    for (const entry of entries) {
      const url = new URL(entry.name, location.origin);
      const sameOrigin = url.origin === location.origin;
      const transport = sameOrigin && url.pathname.startsWith("/es/") ? "direct-es"
        : (sameOrigin && (url.pathname === "/api" || url.pathname.startsWith("/api/")))
          || url.origin === "https://api.media.test.dev-gutools.co.uk" ? "media-api" : null;
      if (!transport) continue;
      buckets[transport].push({ transferSize: entry.transferSize, duration: entry.duration });
    }
  };
  try {
    observer = new PerformanceObserver((list) => record(list.getEntries()));
    observer.observe({ type: "resource", buffered: true });
    available = true;
  } catch {
    observer?.disconnect();
  }
  window.__perfNetwork = {
    snapshot(transport) {
      const entries = buckets[transport];
      const zeroTransfer = entries.filter((entry) => !(entry.transferSize > 0)).length;
      const bytes = entries.reduce((total, entry) => total + (entry.transferSize ?? 0), 0);
      const byteEvidence = available && zeroTransfer === 0;
      const esEntries = buckets["direct-es"];
      return {
        networkCaptureRevision: 1,
        networkTransport: transport,
        networkRequests: available ? entries.length : null,
        networkBytes: byteEvidence ? bytes : null,
        networkAvgBytes: byteEvidence && entries.length ? bytes / entries.length : null,
        networkAvgDurationMs: available && entries.length
          ? entries.reduce((total, entry) => total + entry.duration, 0) / entries.length : null,
        networkZeroTransferRequests: available ? zeroTransfer : null,
        esRequests: esEntries.length,
        esBytes: esEntries.reduce((total, entry) => total + (entry.transferSize ?? 0), 0),
      };
    },
    reset() {
      buckets["direct-es"].length = 0;
      buckets["media-api"].length = 0;
    },
    stop() {
      observer?.disconnect();
    },
  };
}