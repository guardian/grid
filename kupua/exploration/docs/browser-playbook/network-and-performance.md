# Browser Network and Performance

[Entry point and mandatory rules](../embedded-browser-playbook.md).
Read the [performance handbook](../../../e2e-perf/README.md) before automated
measurement. Browser diagnostics do not authorise campaigns or live load tests.

## Request Observation

Choose a collector for the required boundary and validate it on a known operation.
Empty Playwright event output can reflect bridge/classifier failure; Resource Timing
can omit cross-origin or overflowed entries. Neither proves zero requests. Outer
event callbacks can lack globals available inside `page.evaluate`.

| Collector | Useful for | Limits |
|---|---|---|
| Playwright request/response events | Starts, matched responses, safe status/headers | Validate delivery/classifier; never emit URLs/payloads |
| Resource Timing | Browser-facing timings/sizes/route classes | Finite buffer, cache/cross-origin restrictions, completion-only view |
| Owned in-page fetch/XHR wrapper | Scope flags, status, action attribution | Preserve receivers/contracts; headers-time is not body/backend completion |
| CDP Network | Cross-origin/cache transfers and failures | Owned session/cache restoration; sanitize before readback |

Increase Resource Timing capacity **before** action; cap collectors and report overflow.
Use action boundaries and latest matching current source, not `entries[0]` from prior
reuse. A buffered observer installed after navigation commit captures earlier startup
only if retained; assert the intended boundary. Init scripts observe pre-initialization
but persist across navigation and require owned disposal.

Classify by route plus operation flags, not path alone. One endpoint can serve first,
cursor, reverse, null, End or multiple profile operations. Retain only necessary safe
flags: operation, size, reverse, count intent and cursor/null presence. Never emit
bodies/tuples. Exclude the probe's verification reads from app accounting.

Current API mode sends ordinary and AI reads through media-api and constructs no ES
datasource. Verify identity **and** observed routes; `/es` or `/bedrock` reads there
are unexpected. Historical hybrid expectations are obsolete. Local proxy and deployed
API are different topologies; record UI, transport and backend stage separately.
Client-source verification does not identify the server binary.

## Bytes, Cache and Completion

- Separate starts, pending work, failures, cancellations and completions. Request
  starts are not transfers; status zero is not successful response proof.
- Encoded body bytes exclude headers; wire bytes can include them; decoded bytes
  are after HTTP decompression, not heap/bitmap memory. Cached data can have decoded
  size without equivalent transfer.
- Zero cross-origin timing sizes do not prove cache hits; CDP or selected safe
  response headers can provide a control.
- Browser-facing gzip does not prove compression on the internal ES hop. Browser
  wall-clock/header intervals are not backend CPU/full HTTP duration. Label boundaries.
- Temporary CDP `Network.setCacheDisabled` bypasses browser HTTP cache, not API/ES/
  proxy/CDN/app caches. Restore normal caching/detach in `finally`; never clear login.
- Separate reload/startup, typing, suggestions, resident navigation, media and idle
  work rather than one undifferentiated request total.
- Attribute aggregation consumers: Filters, collection counts, own-chip suggestions
  and tickers differ. One small response does not prove little ES work or waste.

Keep bodies/headers/identities/signed URLs ephemeral. Do not save raw HARs/traces/
profiles for convenience; summarize safe operation names and numeric metrics in
memory before readback/persistence.

## Performance Comparisons

1. Check foreground immediately before recording and after reload. `bringToFront()`
   may not make integrated tabs visible. Sanity-check input wall time/rAF cadence;
   discard background-throttled frame percentiles.
2. Match query/admission, topology, viewport/DPR, columns, panels, effective focus
   mode, cache and diagnostic overhead. Recheck DPR after viewport resize; CSS size
   is not physical-pixel size.
3. Define useful-screen, media decode/paint, background and idle boundaries. Loaded
   `complete/naturalWidth` is not decoding or unobscured paint.
4. Separate functional witnesses, controlled races, CPU attribution and matched
   benchmarks. Holds/tool overhead invalidate natural latency claims; a profiler
   on only one variant invalidates numeric comparison.
5. Development Strict Mode can replay hydration/effects and alter counts/debounce
   observation. Compare a single action or authorised representative build before
   making production claims.

CDP profiling plus in-memory timing/timeline marks can distinguish a wrapped callback
from its enclosing browser task, including subsequent React microtasks. This is
ownership attribution, not a lightweight benchmark. Clear marks/disconnect observers
and restore wrappers.

Do not build live production previews ad hoc. Build-time alias/media settings must
match the guarded topology; local defaults can create plausible data or missing-media
branches that invalidate comparison. Coordinate setup and keep discovered settings private.

Static dashboards can be checked without app/TEST reads: open HTML and inject synthetic
aggregate histories through the current ingest interface. Check mode series, units,
zeros and warnings; reload to discard fixtures. Do not write canonical campaign history.
Local Playwright trace viewing need not upload traces; select the visible snapshot
iframe and inspect settling snapshots, not just a wheel's immediate After state.
Coordinate/stop the owned viewer process.

## Bounded DAL Probes

Use the running datasource/existing guarded transport within approved live scope.
Inspect current methods/signatures: removed `dataSource.search()` and historical
count routes are not current APIs. Direct calls do not prove UI orchestration,
gesture behaviour or request counts.

- Name a question and encode request/iteration/time bounds. Run diagnostic reads
  sequentially, not parallel bursts. Prefer cached evidence or one discriminating
  read to walks/bisections; stop when answered.
- Count does not identify backend. `IS_LOCAL_ES=false` establishes the adapter guard,
  not remote stage; never emit index/environment values.
- Keyword walks/deep counts can be expensive. Budget round trips, not historical
  milliseconds/ES-only timing. An unscoped count control is not automatically cheap.
- Check exact position with same-scope `countBefore(params, startCursor) === bufferOffset`.
  Contiguous page shape can hide mislabeled offsets. Keep tuples/IDs in page memory.
- Use a fresh same-scope target tuple for rank/map comparisons; check visible geometry
  separately. Approximate special-date bucket positions are not exact rank oracles.
- Reverse/End buffers can be column-trimmed. Compare raw pages with composed store
  buffers before calling this dropped data.
- Cursorless window, cursor/reverse and End paths have different constraints; inspect
  current endpoint contracts. Store `seek(N)` is synthetic exact-target setup, not
  a track click on a million-item slider.
- A hand-probed date estimate may require integral epoch milliseconds for count/
  range parsing even when search-after accepts fractions. Preserve authoritative tuples.

A 2xx is not intended-query proof: require canonical scope/positive controls.
Configured tickers or duplicate index copies can explain small path differences;
do not broaden into unsupported index-migration work without separate approval.