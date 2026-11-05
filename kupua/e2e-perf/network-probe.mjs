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

export function createRequestProbe(session, { limit = 10000, dataOrigins = [], localProxyOrigins = [] } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 10000) throw new Error("Invalid request tracking limit");
  const proxyOrigins = new Set(localProxyOrigins);
  const isLocalProxy = value => {
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) && proxyOrigins.has(url.origin) && url.pathname.startsWith("/s3/");
    } catch { return false; }
  };
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
    if (!failed && record.timing && record.started !== null && Number.isFinite(event.timestamp)) {
      const phases = [record.timing.sendAt - record.started * 1000,
        record.timing.headersAt - record.timing.sendAt, event.timestamp * 1000 - record.timing.headersAt];
      if (phases.every(value => Number.isFinite(value) && value >= 0)) record.timingPhases = phases;
    }
  };
  const listeners = {
    requestWillBeSent(event) {
      if (disposed) return;
      const existing = records.get(event.requestId);
      if (existing) {
        if (event.redirectResponse) {
          existing.redirects++;
          existing.proxyCache = null;
        }
        return;
      }
      const kind = classify(event);
      if (!kind) return;
      if (records.size >= limit) { overflow = 1; return; }
      records.set(event.requestId, { kind, startPhase: phase, endPhase: null,
        started: Number.isFinite(event.timestamp) ? event.timestamp : null,
        startedEpoch: Number.isFinite(event.wallTime) ? event.wallTime * 1000 : null, endedEpoch: null,
        bytes: null, duration: null, redirects: 0, cached: false, httpError: false,
        timing: null, timingPhases: null, proxyCache: null, localProxy: kind === "media" && isLocalProxy(event.request.url),
        failed: false, cancelled: false });
      inFlight[kind]++;
      peak[kind] = Math.max(peak[kind], pending(kind));
    },
    responseReceived(event) {
      const record = records.get(event.requestId);
      if (!record || disposed) return;
      record.cached ||= Boolean(event.response.fromDiskCache || event.response.fromServiceWorker || event.response.fromPrefetchCache);
      record.httpError ||= event.response.status >= 400;
      const cache = Object.entries(event.response.headers ?? {}).find(([name]) => name.toLowerCase() === "x-cache")?.[1];
      record.proxyCache = record.localProxy && record.redirects === 0 && isLocalProxy(event.response.url)
        && ["HIT", "MISS"].includes(cache) ? cache : null;
      const timing = event.response.timing;
      if (record.kind === "data" && timing && [timing.requestTime, timing.sendStart, timing.receiveHeadersStart]
        .every(value => Number.isFinite(value) && value >= 0) && timing.receiveHeadersStart >= timing.sendStart) {
        record.timing = { sendAt: timing.requestTime * 1000 + timing.sendStart,
          headersAt: timing.requestTime * 1000 + timing.receiveHeadersStart };
      }
    },
    requestServedFromCache(event) {
      const record = records.get(event.requestId);
      if (record && !disposed) record.cached = true;
    },
    loadingFinished(event) { finish(event, false); },
    loadingFailed(event) { finish(event, true); },
  };
  for (const [name, callback] of Object.entries(listeners)) session.on(`Network.${name}`, callback);
  const probe = {
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
    snapshot(bounds) {
      if (disposed) throw new Error("Request probe disposed");
      const result = { requestCaptureRevision: 1, requestTimingCaptureRevision: 1,
        requestCaptureOverflow: overflow, requestCaptureTracked: records.size,
        requestClockMissingCount: [...records.values()].filter(record => record.startedEpoch === null
          || (record.endPhase !== null && record.endedEpoch === null)).length };
      if (bounds) result.requestWindowCaptureRevision = 1;
      for (const kind of ["media", "data"]) {
        const selected = [...records.values()].filter(record => record.kind === kind
          && (!bounds || record.startedEpoch !== null && record.startedEpoch < bounds.end));
        const ended = selected.filter(record => bounds ? record.endPhase !== null && record.endedEpoch !== null
          && record.endedEpoch >= bounds.start && record.endedEpoch < bounds.end : record.endPhase === phase);
        const starts = selected.filter(record => bounds ? record.startedEpoch >= bounds.start : record.startPhase === phase).length;
        const carryCount = bounds ? selected.filter(record => record.startedEpoch < bounds.start
          && (record.endPhase === null || record.endedEpoch === null || record.endedEpoch >= bounds.start)).length : carry[kind];
        const pendingCount = bounds ? selected.filter(record => record.endPhase === null
          || record.endedEpoch === null || record.endedEpoch >= bounds.end).length : pending(kind);
        let peakCount = peak[kind];
        if (bounds) {
          const changes = selected.filter(record => record.startedEpoch >= bounds.start)
            .map(record => ({ time: record.startedEpoch, delta: 1 }));
          changes.push(...ended.map(record => ({ time: record.endedEpoch, delta: -1 })));
          let count = carryCount;
          peakCount = count;
          for (const change of changes.sort((left, right) => left.time - right.time || right.delta - left.delta)) {
            count += change.delta;
            peakCount = Math.max(peakCount, count);
          }
        }
        const completed = ended.filter(record => !record.failed);
        const knownBytes = completed.filter(record => record.bytes !== null && record.redirects === 0);
        const unknownBytes = completed.length - knownBytes.length;
        const bytes = knownBytes.reduce((sum, record) => sum + record.bytes, 0);
        const durations = completed.map(record => record.duration).filter(Number.isFinite);
        Object.assign(result, {
          [`${kind}RequestsCarryIn`]: carryCount,
          [`${kind}RequestStarts`]: starts,
          [`${kind}RequestsCompleted`]: completed.length,
          [`${kind}RequestFailures`]: ended.filter(record => record.failed).length,
          [`${kind}RequestCancellations`]: ended.filter(record => record.cancelled).length,
          [`${kind}RequestsPending`]: pendingCount,
          [`${kind}RequestsPeak`]: peakCount,
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
        if (kind === "media") Object.assign(result, {
          mediaProxyCacheHits: ended.filter(record => record.proxyCache === "HIT").length,
          mediaProxyCacheMisses: ended.filter(record => record.proxyCache === "MISS").length,
          mediaProxyCacheUnknown: ended.filter(record => record.proxyCache === null).length,
        });
        if (kind === "data") {
          const timings = completed.filter(record => record.timingPhases !== null && record.redirects === 0 && !record.cached);
          result.dataTimingCompletions = timings.length;
          result.dataTimingUnavailableCompletions = completed.length - timings.length;
          for (const [index, name] of ["BeforeSend", "SendToHeaders", "HeadersToComplete"].entries()) {
            const values = timings.map(record => record.timingPhases[index]);
            result[`data${name}MaxMs`] = values.length ? Math.max(...values) : null;
            result[`data${name}MeanMs`] = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
          }
        }
      }
      return result;
    },
    snapshotBetween(start, end) {
      if (disposed) throw new Error("Request probe disposed");
      if (![start, end].every(Number.isFinite) || end <= start) throw new Error("Invalid request window");
      return probe.snapshot({ start, end });
    },
    async flush() {
      if (disposed) throw new Error("Request probe disposed");
      if (typeof session.send === "function") await session.send("Runtime.evaluate", { expression: "0", returnByValue: true });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const [name, callback] of Object.entries(listeners)) session.off(`Network.${name}`, callback);
      records.clear();
    },
  };
  return probe;
}