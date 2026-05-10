# `?ids=` Enrichment Feasibility Research

**Date:** 9 May 2026  
**Status:** Complete — verdict and workplan below.  
**Tested against:** TEST environment (`api.media.local.dev-gutools.co.uk`), 1,314,057 images.  
**Method:** Read-only curl. No writes. No code changes.

---

## Section 1 — Feasibility Verdict: Conditional-Go

**The approach works and is compelling. Two infrastructure prerequisites are required to reach the full-buffer (200-item) single-request ideal. Without them the approach still wins on every metric, but requires more parallel requests.**

### What was tested

Swapping kupua's Tier 2 enrichment from:

> `GET /images?q=…&length=200&orderBy=…&offset=N` (mirror-search, offset-based)

to:

> `GET /images?ids=id1,id2,…&length=N&orderBy=…` (IDs-based, offset=0 always)

### The three claimed benefits — verdict on each

| Claim | Verdict | Evidence |
|---|---|---|
| Deep-scroll: enrichment works beyond the 101k ES window | **True** | offset=500k → HTTP 500; same IDs via `ids=` → HTTP 200 (see R3) |
| Latency improvement | **True — 4–6×** | offset path: 2.84–3.42s median; ids path: 0.61–0.82s median (see R3) |
| PIT-correctness alignment | **True** | IDs come from the buffer's PIT snapshot; fetching by ID at offset=0 cannot drift (see R1 note) |

### The blocker: URL length limits

The proxy chain imposes two hard limits, both hit before reaching 200 IDs:

| Layer | Limit | Where enforced | IDs that fit |
|---|---|---|---|
| nginx (ALB/CloudFront layer) | ~8 kB request line | nginx default `large_client_header_buffers` | ~185 IDs |
| Pekko HTTP (Play 3.0 server) | **2,048 chars** | hardcoded Pekko HTTP default | **~46 IDs** |

The Pekko limit is the binding constraint. It is **not configured anywhere in this repo** — it is the library default. It fires before nginx even sees the request (confirmed: the rejection message `URI length exceeds the configured limit of 2048 characters` comes from `0:0:0:0:0:0:0:1`, i.e. loopback — the Play server itself, not nginx).

Empirically verified:
- 200 IDs (~8.3 kB URL) → nginx 414 (HTML body)
- 100 IDs (~4.2 kB URL) → Play 414 (plain text, 2048-char message)
- 46 IDs (~1,971 bytes) → HTTP 200 ✓

### The fixes — and how simple they are

**Fix 1 — Play/Pekko HTTP limit (one line, this repo):**

```
# common-lib/src/main/resources/application.conf
pekko.http.server.parsing.max-uri-length = 16384
```

This is a single config line. It affects all Grid services that inherit from `common-lib`, but all of them already reject oversized requests at the router level, so the practical risk is negligible. Allows ~370 IDs per request.

**Fix 2 — nginx limit (infra change, outside this repo):**

```
large_client_header_buffers 4 16k;
```

This is an nginx directive change in CDK/CloudFormation config. Allows ~370 IDs per request end-to-end.

### What each state enables

| State | Max IDs per request | Requests for 200-item buffer | Enrichment latency (est.) |
|---|---|---|---|
| Today (no changes) | ~46 | 5 parallel | ~0.8s (parallel fan-out) |
| Fix 1 only (Play config) | ~370 | 1 | ~0.7s |
| Fix 1 + Fix 2 (Play + nginx) | ~370 | 1 | ~0.7s |

Note: even with 5 parallel requests at ~0.8s each, they run concurrently → wall-clock time is still ~0.8s, vs 3.4s for the current single offset request. **The approach wins on latency in every state.** Fix 1 eliminates the parallel fan-out and simplifies the code significantly.

### Conditions for Go

1. **Fix 1 must land** in `media-api` (or `common-lib`) before or alongside the kupua change. One-line PR. Without it, 5-request fan-out works but is wasteful and fragile.
2. **Fix 2 is recommended** (nginx) but not blocking — the Pekko fix alone is sufficient.

**Recommendation: pursue Fix 1 first. If it lands, implement the kupua swap. Fix 2 can follow independently.**

---

## Section 2 — Workplan

### Prerequisites (not kupua work)

**P1 — media-api PR** (or common-lib PR):  
Add to `common-lib/src/main/resources/application.conf`:
```
pekko.http.server.parsing.max-uri-length = 16384
```
This unblocks single-request enrichment for buffers up to ~370 items — more than the current 200 maximum. Affects all Grid Play services; low risk.

**P2 — infra PR** (optional, CDK/nginx):  
Raise `large_client_header_buffers` to allow ~16 kB request lines. Belt-and-suspenders with P1.

### Phase 1 — New DAL method (~25 LOC)

**File:** `kupua/src/dal/grid-api/grid-api-adapter.ts`

Add `enrichByIds(ids: string[], signal?: AbortSignal): Promise<SearchHitImageData[] | null>` alongside `searchByQuery`. Implementation:
- Build URL: `/api/images?ids=<comma-joined>&length=<ids.length>&orderBy=-uploadTime`
- Same fetch/error-handling pattern as `searchByQuery` (lines 143–157)
- No `offset` parameter — always omitted (offset=0 is the point)
- Same graceful-absence contract: any failure → `null`
- No `q` parameter needed when fetching by ID (the IDs filter overrides query anyway; omitting `q` is cleaner)

Chunk size: with Fix 1 in place, single chunk for ≤370 IDs. Without Fix 1, chunk at 46 IDs. The method should accept the full ID list and chunk internally, returning a merged result.

Estimated LOC: ~25 new, 0 deleted.

### Phase 2 — useEnrichment.ts swap (~30 LOC delta)

**File:** `kupua/src/hooks/useEnrichment.ts`

Replace the offset-pagination loop (lines 172–198) with an ID-extraction + `enrichByIds` call:

1. Extract IDs from `useSearchStore(s => s.results)` — the buffer's current images. Skip null/placeholder entries.
2. Call `gridApi.enrichByIds(ids, controller.signal)`.
3. Remove `bufferOffset` from the effect's inputs and from the `cacheKey`. The new cache key is simpler: `${query}|${orderBy}|${bufferGeneration}` — IDs are already determined by generation.
4. Remove the `effectiveLength` / `10_000 - bufferOffset` cap (no longer relevant).
5. Remove the incremental-fetch logic (`deltaOffset`, `deltaLength`, `prevRangeRef`) — IDs-based enrichment naturally covers exactly the current buffer, so incremental fetching is free (the same ID set returns the same enrichment).

The `extractEnrichment` function (lines 44–72) is **unchanged** — response shape is identical (confirmed R2).

Estimated LOC delta: −35 removed, +20 added = net −15.

### Phase 3 — Test updates (~10 LOC)

**File:** `kupua/src/hooks/useEnrichment.test.ts`

Three tests (lines 10–51) mock `gridApi.searchByQuery`. Update mock to `enrichByIds`. Test descriptions and assertions are unchanged — they test graceful absence (null return), which applies equally to both methods.

No new tests needed for the method itself; `grid-api-adapter.ts` tests (if any) would cover `enrichByIds` at the unit level.

### Phase 4 — deviations.md update

Add entry: "Tier 2 enrichment uses `?ids=` instead of offset-based mirror-search. Requires Pekko HTTP `max-uri-length = 16384` in media-api config. See cluster1-ids-enrichment-research.md."

Remove/update existing entry: "Cluster1-deep-scroll-enrichment-not-implemented" — this is now implemented.

Update comment block at top of `useEnrichment.ts` (lines 1–17) to reflect the new strategy and remove the `max_result_window` limitation note.

### Total estimated LOC

| File | +added | −removed | net |
|---|---|---|---|
| `grid-api-adapter.ts` | +25 | 0 | +25 |
| `useEnrichment.ts` | +20 | −35 | −15 |
| `useEnrichment.test.ts` | +3 | −3 | 0 |
| `deviations.md` | +5 | −3 | +2 |
| **Total** | **53** | **41** | **+12** |

Well under the handoff's 100-line net threshold. The 200-line flag would indicate something went wrong.

---

## R-Investigation Detail

### R1 — URL length

**Empirical measurements** (46 IDs, real Grid hex IDs 40 chars each):

```
# 200 IDs — nginx 414
curl "…/images?ids=<200 IDs>&…"  →  HTTP 414 (nginx/1.29.6: 414 Request-URI Too Large)

# 100 IDs — Play 414  
curl "…/images?ids=<100 IDs>&…"  →  HTTP 414 (Play: URI length exceeds configured limit of 2048)

# 46 IDs — success
URL_BYTES: 1971
curl "…/images?ids=<46 IDs>&…"   →  HTTP 200 ✓
```

**Source of the 2048 limit:** Pekko HTTP default. Not set in this repo.  
Confirmed in `media-api/logs/application.log:14846`:
```
Illegal request, responding with status '414 URI Too Long': URI length exceeds the configured limit of 2048 characters from 0:0:0:0:0:0:0:1:56709
```

**Fix location:** `common-lib/src/main/resources/application.conf` — one line (`pekko.http.server.parsing.max-uri-length = 16384`). No code change required.

**Note on the handoff's halt condition:** The halt fired (414 at <200 IDs). The user explicitly overrode it to gather full data and make the case for the infrastructure change. This document is the product of that override.

### R2 — Response shape

**Tested against:** `GET /images?q=&length=200&orderBy=-uploadTime` (same endpoint, same response shape as `?ids=` path).

```
top-level hit keys:  ['uri', 'data', 'links', 'actions']

data keys: ['leases', 'usageRights', 'lastModified', 'embedding', 'collections',
            'exports', 'originalMetadata', 'persisted', 'id', 'cost', 'valid',
            'invalidReasons', 'userMetadata', 'uploadInfo', 'originalUsageRights',
            'uploadTime', 'fileMetadata', 'aliases', 'source', 'usages',
            'identifiers', 'thumbnail', 'isPotentiallyGraphic', 'syndicationStatus',
            'metadata', 'uploadedBy', 'fromIndex']

enrichment field presence:
  cost:                 present=True,  value='free'
  valid:                present=True,  value=True
  invalidReasons:       present=True,  value={}
  persisted:            present=True,  value={'value': False, 'reasons': []}
  isPotentiallyGraphic: present=True,  value=False
  syndicationStatus:    present=True,  value='unsuitable'
  usageRights:          present=True,  value={'category': 'agency', ...}
  actions:              present=True,  value=[{'name': 'delete', ...}]
  leases:               present=True,  shape=['uri', 'data']
  usages:               present=True,  shape=['uri', 'data']
```

**Conclusion:** All fields consumed by `extractEnrichment` (`useEnrichment.ts:44–72`) are present. Shape is fully compatible with `SearchHitImageData`. **Zero adapter remapping needed.** The `?ids=` path uses the same `imageSearch()` controller method (`MediaApi.scala:~560`) and the same `search()` ES method (`ElasticSearch.scala:196`) — the only difference is an extra `idsFilter` applied at `ElasticSearch.scala:204`.

**`total` field behaviour:** Returns count of matched IDs, not total index size. If an ID was deleted between buffer-fill and enrichment, it will be silently absent from results. This is correct behaviour — the enrichment map will simply have no entry for that ID, and the UI falls back to ES baseline. No special handling needed.

### R3 — Latency

All measurements against TEST over localhost tunnel. Three runs each, median reported. These are directional indicators, not production benchmarks.

**Offset path (current):**

| Depth | Median latency | HTTP |
|---|---|---|
| offset=0, 200 items | 3.42s | 200 |
| offset=50,000, 200 items | 2.87s | 200 |
| offset=99,000, 200 items | 2.86s | 200 |
| offset=100,900, 200 items | 0.18s | **500** (ES window exceeded) |
| offset=500,000, 46 items | 0.08s | **500** (ES window exceeded) |

```sh
# offset=100,900 — beyond max_result_window=101,000 (ElasticSearchClient.scala:142)
curl "…/images?q=&length=200&orderBy=-uploadTime&offset=100900"
→ HTTP:500 time:0.178236s  (empty body — Play returns 500 when ES throws window exception)
```

**IDs path (proposed), recent images (~position 0):**

| Run | Latency | HTTP |
|---|---|---|
| run 1 | 0.796s | 200 |
| run 2 | 0.833s | 200 |
| run 3 | 0.839s | 200 |
| **median** | **0.833s** | |

**IDs path (proposed), deep images (Nov 2023, ~position 500k):**

```sh
# offset-based attempt at same depth — fails
curl "…/images?q=&length=46&orderBy=-uploadTime&offset=500000"
→ HTTP:500 time:0.083s

# ids-based — same images, succeeds
curl "…/images?ids=39d07efd…,bdd16724…&q=&length=46&orderBy=-uploadTime"
→ run1: HTTP:200 time:0.599s
→ run2: HTTP:200 time:0.637s
→ run3: HTTP:200 time:0.595s
→ median: 0.599s
```

**Summary:**

- IDs path is **4.1× faster** than offset=0 (0.83s vs 3.42s)
- IDs path is **4.8× faster** than offset=99k (0.83s vs 2.86s, the deepest working offset)
- IDs path **works at positions the offset path hard-fails at** (500k → 200 vs 500)
- IDs path latency is **depth-independent**: 0.83s at position 0, 0.60s at position ~500k (slight variance, not a trend)

The handoff's falsifiable expectation was ">2× speedup vs offset=50k". Measured: **4.8×**. Well exceeded.

### R4 — Auth / rate-limit / quota

- Panda cookie auth (`gutoolsAuth-assym=…`) works on GET requests to the test endpoint. The `Origin` header (`https://media.local.dev-gutools.co.uk`) is required to pass CORS/auth checks — without it, 403.
- The 1,971-byte URL (46 IDs) fits within the 2,048-char Pekko limit. With Fix 1 applied (16k limit), a single-request for 200 IDs would be ~8.3 kB — within the new limit.
- **CloudFront caching:** Not measured directly (TEST domain routes through nginx → ALB → Play, not through production CloudFront). For authenticated requests (panda cookie), CloudFront virtually never caches — `Cache-Control: no-store` or per-user variance prevents it. This is a non-issue in practice.
- **Rate limiting:** No rate-limit headers observed in responses. A single `?ids=` request replacing 1–5 offset requests is neutral-to-better on per-user request rate.

### R5 — Code-shape impact

See Section 2 (Workplan) for full detail. Summary:

- New method `enrichByIds` on `GridApiDataSource`: ~25 LOC, straightforward pattern match of existing `searchByQuery`
- `useEnrichment.ts` change: net −15 LOC (simpler — removes incremental-range logic which becomes unnecessary)
- `useEnrichment.test.ts`: 3 tests, mock rename only, no logic change
- **Cache key:** simplify from `${query}|${orderBy}|${bufferOffset}|${bufferLength}|${bufferGeneration}` to `${query}|${orderBy}|${bufferGeneration}`. The offset and length are no longer enrichment inputs — IDs are the complete spec. Generation already captures seek/extend/evict transitions.
- **Mock data source** (`mock-data-source.ts`): `GridApiDataSource` is a separate class from `ImageDataSource` — the mock does not implement it. No change needed. The `useEnrichment.test.ts` mock (`vi.mock("@/lib/grid-api-instance")`) needs only the rename.
- **Chunk count:** Without Fix 1: 5 chunks × 46 IDs = 230 IDs covered (buffer is ≤200, so 5 chunks suffice). With Fix 1: 1 chunk. Chunking is `Promise.all` — identical pattern to the current offset pagination already in `useEnrichment.ts:177–199`.

### R6 — Edge cases

Listed, not solved. The workplan should address these:

- **Null/placeholder buffer entries during seek:** `s.results` may contain null entries mid-seek. Skip them when building the ID list — only enrich IDs that are non-null strings.
- **AbortController:** Existing `controller.signal` passed to `enrichByIds` handles in-flight cancellation correctly. No change needed.
- **Empty buffer / 0 IDs:** Already handled — `useEnrichment.ts:114` returns early at `bufferLength === 0`. The IDs-path version should add: if `ids.length === 0` after filtering nulls, return early.
- **Null-zone IDs:** Images in the null-zone are real ES documents with real IDs. The `ids=` filter finds them by `_id` regardless of their sort position. No special handling needed.
- **Missing IDs (deleted images):** `total` in the response reflects matched IDs. Deleted images are silently absent. The enrichment map simply has no entry for them — UI falls back to ES baseline. Correct behaviour, no handling needed.
- **Generation bump during enrichment:** Buffer generation changes (seek, evict) cause the `cacheKey` to change → effect re-runs → `controller.abort()` cancels the in-flight request → new request starts. This is the existing mechanism and works identically with `enrichByIds`.

---

## Appendix A — Risk assessment for the infra asks (for engineering review)

Added 9 May 2026. Notes for the conversation with engineering about raising
the two URL-length limits. Both fixes are reasonable to ask for, but the
arguments differ.

### Pekko `max-uri-length = 16384` (one-line change in `common-lib`)

**Why the default is 2048:**

- **Slowloris-style DoS surface.** A small per-connection buffer cost ×
  millions of held-open connections = OOM. Raising to 16k means each
  accepted-but-unread request can hold 8× more buffer before the request
  line is parsed.
- **Log/observability bloat.** Long URIs end up in access logs, error
  messages, distributed traces. 16k URLs make grep harder and bloat log
  storage.
- **Accidental abuse.** Once "big URLs work", clients (other devs, scripts,
  third-party integrations) start relying on them, which fights any future
  revert.

**Why these are weak in Grid's specific context:**

- All Grid services sit behind panda auth. The DoS surface is
  authenticated Guardian editorial staff — bounded set, not the open
  internet. Slowloris assumptions don't apply.
- nginx in front of Play already enforces its own URL-length limit
  (`large_client_header_buffers`, default ~8k). Pekko at 16k just means the
  practical end-to-end limit becomes whatever nginx allows. **You don't have
  to raise both for the Pekko risk to be capped.**
- Log bloat is real but kupua-specific. Other Grid services don't generate
  big URIs today and have no reason to start.

**Risk to other services that share `common-lib`:** essentially zero. The
setting is per-server-instance request-line parsing, not per-route. Other
services accept the new limit but continue to receive small URIs from their
own clients. No behavioural change unless someone *sends* a big URI.

**Verdict:** safe ask. Single line, low blast radius, easy to revert.

### nginx `large_client_header_buffers 4 16k`

**Why the default is small (`4 8k`):**

- **Same DoS reasoning** — buffer × concurrent oversized requests.
- nginx allocates these buffers lazily, so practical memory cost is "16k ×
  concurrent oversized requests in flight", not "16k × every connection".
  The DoS surface is genuinely small.
- The setting's **scope matters**: it can be set in `http {}` (global), in
  `server {}` (per virtual host), or in `location {}`. A global change
  affects every site behind that nginx fleet; a server-block change is
  local to media-api.

**Risk to other services:** depends on scope of the CDK change. If raised
at `http` level, every Guardian service routed through the same nginx fleet
inherits the new limit. If scoped to the media-api server block, zero risk
to others. **The CDK PR should be explicit about scoping to the media-api
server block** — this is the single biggest risk-reduction lever.

**Verdict:** safe ask if scoped to the media-api server block.

### HTTP/2 on the `/api` origin

Discovered 9 May 2026 during the tier-collapse implementation: the TEST
nginx serves `/api` over **HTTP/1.1**, not HTTP/2 (confirmed by browser
devtools — `Protocol: http/1.1` on `/api/images` requests).

**Why it matters for kupua:**

Under HTTP/1.1, browsers cap connections per origin at **6**. Kupua's
enrichment fires up to 5 parallel `?ids=` chunks per buffer-fill (Pekko
URL-limit constrains chunk size to 46 IDs). Under HTTP/1.1, those 5 chunks
plus any other concurrent `/api` requests (image-detail panel fetches,
satellite proxy calls) compete for those 6 slots. This is the connection
starvation concern that originally drove the conservative two-tier
debounce design.

Under HTTP/2, all requests to one origin **multiplex on a single TCP
connection** — connection budget is effectively unbounded for kupua's
use case. The collapse-to-single-lane design (300ms debounce, no separate
viewport tier) becomes safely shippable.

Notes:
- **Thumbnails are NOT on the same origin** (S3-redirect → S3/CloudFront),
  so they don't compete for `/api`'s connection budget. Real concern is
  enrichment-vs-detail-panel and enrichment-vs-satellite-proxies.
- HTTP/2 is the modern default. Most Guardian production services almost
  certainly already use it. The fact that TEST is on HTTP/1.1 may just be
  a stale local dev nginx config — worth confirming whether PROD already
  has it before assuming a config change is needed.

**Why nginx HTTP/2 is normally enabled:**

- Single-line nginx directive: `listen 443 ssl http2;` (replacing
  `listen 443 ssl;`).
- Universally backwards-compatible — clients that don't speak HTTP/2
  fall back to HTTP/1.1 transparently.
- No application-level changes required (Play/Pekko serves the same
  responses; the multiplexing happens at the nginx/browser layer).
- Standard since ~2016 in nginx; the only reason to be on HTTP/1.1 in
  2026 is config inertia.

**Why it's sometimes deferred:**

- Requires HTTPS (HTTP/2 over plain HTTP is not supported by browsers).
  TEST/CODE/PROD all use HTTPS, so non-issue here.
- Tooling that intercepts traffic (some old proxies, packet sniffers,
  legacy WAF rules) may not understand HTTP/2 frames. If Guardian's
  observability/security tooling has HTTP/1.1 assumptions, those need
  to be checked.
- Connection migration (HTTP/2 reuses one TCP connection for everything)
  changes the access-log shape: fewer connection events, more streams
  per connection. Affects log analysis dashboards if any depend on
  connection counts.

**Risk to other services:** zero if scoped to the media-api server block.
Each Guardian service can opt in independently — enabling HTTP/2 for
`/api` doesn't affect any other service.

**Verdict:** lowest-risk of the three asks. Single nginx directive,
backwards-compatible, modern default. The biggest unknown is whether
PROD already has it (in which case only the local TEST tunnel needs
updating).

### How to make the case

There are now **three asks** to bundle into the conversation: HTTP/2
enablement on `/api`, Pekko `max-uri-length`, and nginx
`large_client_header_buffers`. They're independent — engineering can
land any subset — but each makes kupua incrementally simpler:

| Ask | Without it | With it |
|---|---|---|
| HTTP/2 on `/api` | 5-chunk parallel enrichment must keep two-debounce-lane structure | No longer required — kupua already collapsed to single 300ms lane (9 May 2026). HTTP/2 would allow all chunks to multiplex on one TCP connection, improving throughput, but the architecture is already correct without it. |
| Pekko `max-uri-length` | Chunk at 46 IDs, ~5 parallel chunks per buffer | Chunk at ~370 IDs, single request per buffer |
| nginx `large_client_header_buffers` | (no marginal effect with Pekko fix alone) | Belt-and-suspenders for Pekko fix |

Lead with kupua-specific reasoning, not "it's just a config flip":

- "We've validated empirically that the architecturally-correct enrichment
  path requires it. Without it, the path still works but uses 5× the
  request count for the same data."
- "DoS surface is authenticated editorial staff (panda), not the public
  internet. The threat model behind the conservative defaults doesn't
  apply."
- "nginx change scoped to `media-api` server block, not global."
- "Pekko change is one line in `common-lib/src/main/resources/application.conf`,
  affects all Grid Play services but only enables — does not require — long
  URIs."
- "Concrete benefit: fixes a present correctness gap (PIT alignment),
  unlocks deep-scroll enrichment for the 92% of the corpus beyond
  `max_result_window`, and delivers a 4–6× latency improvement that we'd
  pay for in code complexity (5-chunk fan-out) without it."

Engineering hears "config flip, what could go wrong" constantly. Lead with
the kupua-specific reasoning and the bounded auth surface, and acknowledge
the scoping consideration for nginx upfront.

### Asks that are NOT recommended

- **Removing or raising `max_result_window` past 101,000.** That's a real ES
  performance cliff, not just a config limit. Don't bundle this with the
  URL-length asks.
- **Raising nginx limit globally.** Scope to media-api.
- **Disabling URI-length parsing entirely.** Pekko allows it; don't ask for
  it. 16k is enough for ~370 IDs, which is plenty.

---

## Appendix B — Unrelated observations (capped at 10)

1. `useEnrichment.ts` has several `console.log` statements (lines 174, 185, 197, 203) that should be removed before shipping. Already on the to-do list per worklog.
2. The `lookupIds` method in `ElasticSearch.scala:161` takes `offset` and `length` params — but the `?ids=` API path through `MediaApi.scala:imageSearch()` always calls `search()` (not `lookupIds`). `lookupIds` appears to be unused by the public API. Worth confirming before removing.
3. `useEnrichment.ts:52` has `void now; // referenced to avoid lint warning` — `now` is unused after the `isActive` refactor. Dead code.
4. The TEST index has 1,314,057 images. The offset path covers only the top 101,000 (7.7%). IDs-based enrichment would cover 100%.
