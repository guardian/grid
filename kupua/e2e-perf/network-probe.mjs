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

export function createRequestProbe(session, { limit = 10000, dataOrigins = [] } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 10000) throw new Error("Invalid request tracking limit");
  const records = new Map();
  let phase = 0;
  let overflow = 0;
  let disposed = false;
  let carry = { media: 0, data: 0 };
  let peak = { media: 0, data: 0 };
  const inFlight = { media: 0, data: 0 };
  const pending = kind => inFlight[kind];
  const classify = event => {
    try {
      const url = new URL(event.request.url);
      if (!["http:", "https:"].includes(url.protocol)) return null;
      if (event.type === "Image") return "media";
      if (/^\/(api|es)(\/|$)/.test(url.pathname) || dataOrigins.includes(url.origin)
        || url.origin === "https://api.media.test.dev-gutools.co.uk") return "data";
    } catch {}
    return null;
  };
  const finish = (event, failed) => {
    const record = records.get(event.requestId);
    if (disposed || !record || record.endPhase !== null) return;
    inFlight[record.kind]--;
    record.endPhase = phase;
    record.failed = failed;
    record.cancelled = failed && Boolean(event.canceled);
    record.bytes = !failed && Number.isFinite(event.encodedDataLength) && event.encodedDataLength >= 0
      ? event.encodedDataLength : null;
    record.duration = Number.isFinite(record.started) && Number.isFinite(event.timestamp) && event.timestamp >= record.started
      ? (event.timestamp - record.started) * 1000 : null;
    record.endedEpoch = record.startedEpoch !== null && record.duration !== null
      ? record.startedEpoch + record.duration : null;
  };
  const listeners = {
    requestWillBeSent(event) {
      if (disposed) return;
      const existing = records.get(event.requestId);
      if (existing) {
        if (event.redirectResponse) existing.redirects++;
        return;
      }
      const kind = classify(event);
      if (!kind) return;
      if (records.size >= limit) { overflow = 1; return; }
      records.set(event.requestId, { kind, startPhase: phase, endPhase: null,
        started: Number.isFinite(event.timestamp) ? event.timestamp : null,
        startedEpoch: Number.isFinite(event.wallTime) ? event.wallTime * 1000 : null, endedEpoch: null,
        bytes: null, duration: null, redirects: 0, cached: false, httpError: false,
        failed: false, cancelled: false });
      inFlight[kind]++;
      peak[kind] = Math.max(peak[kind], pending(kind));
    },
    responseReceived(event) {
      const record = records.get(event.requestId);
      if (!record || disposed) return;
      record.cached ||= Boolean(event.response.fromDiskCache || event.response.fromServiceWorker || event.response.fromPrefetchCache);
      record.httpError ||= event.response.status >= 400;
    },
    requestServedFromCache(event) {
      const record = records.get(event.requestId);
      if (record && !disposed) record.cached = true;
    },
    loadingFinished(event) { finish(event, false); },
    loadingFailed(event) { finish(event, true); },
  };
  for (const [name, callback] of Object.entries(listeners)) session.on(`Network.${name}`, callback);
  return {
    pendingAt(kind, epoch) {
      if (disposed) throw new Error("Request probe disposed");
      if (!["media", "data"].includes(kind) || !Number.isFinite(epoch)) return null;
      let count = 0;
      for (const record of records.values()) {
        if (record.kind !== kind) continue;
        if (record.startedEpoch === null) return null;
        if (record.startedEpoch > epoch) continue;
        if (record.endPhase === null) count++;
        else if (record.endedEpoch === null) return null;
        else if (record.endedEpoch > epoch) count++;
      }
      return count;
    },
    beginPhase() {
      if (disposed) throw new Error("Request probe disposed");
      phase++;
      carry = { media: pending("media"), data: pending("data") };
      peak = { ...carry };
    },
    snapshot() {
      if (disposed) throw new Error("Request probe disposed");
      const result = { requestCaptureRevision: 1, requestCaptureOverflow: overflow, requestCaptureTracked: records.size,
        requestClockMissingCount: [...records.values()].filter(record => record.startedEpoch === null
          || (record.endPhase !== null && record.endedEpoch === null)).length };
      for (const kind of ["media", "data"]) {
        const selected = [...records.values()].filter(record => record.kind === kind);
        const ended = selected.filter(record => record.endPhase === phase);
        const completed = ended.filter(record => !record.failed);
        const knownBytes = completed.filter(record => record.bytes !== null && record.redirects === 0);
        const unknownBytes = completed.length - knownBytes.length;
        const bytes = knownBytes.reduce((sum, record) => sum + record.bytes, 0);
        const durations = completed.map(record => record.duration).filter(Number.isFinite);
        Object.assign(result, {
          [`${kind}RequestsCarryIn`]: carry[kind],
          [`${kind}RequestStarts`]: selected.filter(record => record.startPhase === phase).length,
          [`${kind}RequestsCompleted`]: completed.length,
          [`${kind}RequestFailures`]: ended.filter(record => record.failed).length,
          [`${kind}RequestCancellations`]: ended.filter(record => record.cancelled).length,
          [`${kind}RequestsPending`]: pending(kind),
          [`${kind}RequestsPeak`]: peak[kind],
          [`${kind}CompletedBytes`]: unknownBytes ? null : bytes,
          [`${kind}KnownCompletedBytes`]: bytes,
          [`${kind}UnknownByteRequests`]: unknownBytes,
          [`${kind}RequestRedirects`]: ended.reduce((sum, record) => sum + record.redirects, 0),
          [`${kind}CacheResponses`]: completed.filter(record => record.cached).length,
          [`${kind}HttpErrors`]: ended.filter(record => record.httpError).length,
          [`${kind}TimedCompletions`]: durations.length,
          [`${kind}RequestDurationMaxMs`]: durations.length ? Math.max(...durations) : null,
          [`${kind}RequestDurationMeanMs`]: durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : null,
        });
      }
      return result;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const [name, callback] of Object.entries(listeners)) session.off(`Network.${name}`, callback);
      records.clear();
    },
  };
}