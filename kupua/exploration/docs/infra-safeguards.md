# Kupua — Elasticsearch Safeguards

> These safeguards protect shared ES clusters (TEST/CODE) when kupua
> connects to real infrastructure instead of its local docker ES.
> They're deliberately conservative for Phase 2. As we gain confidence,
> individual safeguards can be relaxed or removed — document any changes here.

## Overview

| # | Safeguard | Where | Status |
|---|---|---|---|
| 1 | `_source` includes (allowlist) | `es-config.ts` → `es-adapter.ts` | ✅ Active |
| 2 | Request coalescing (AbortController) | `es-adapter.ts` | ✅ Active |
| 3 | Write protection (path + method + proxy) | `es-adapter.ts` + `es-config.ts` + `vite.config.ts` + `load-sample-data.sh` | ✅ Active |
| 4 | S3 proxy — read-only | `scripts/s3-proxy.mjs` | ✅ Active |
| 5 | imgproxy — read-only | docker compose + Vite proxy | ✅ Active |
| 6 | Aggregation load control | `search-store.ts` + `FacetFilters.tsx` | ✅ Active |
| 7 | E2E test real-cluster gate | `e2e/global-setup.ts` | ✅ Active |

---

## 1. `_source` excludes — reduce response size

**Problem:** Real ES documents contain full EXIF, XMP, ICC, Getty, and
embedding data in `fileMetadata` and `embedding`. A single document can
be 50–100KB. At 50 docs per page, that's 2.5–5MB per search response.

**Safeguard:** The search request includes `_source.excludes` to strip
fields kupua never displays:

```
fileMetadata.exif       — raw EXIF tags (camera settings, GPS, etc.)
fileMetadata.exifSub    — EXIF sub-IFD data
fileMetadata.getty       — Getty-specific metadata
embedding              — 1024-dim Cohere float vector
```

We keep `fileMetadata.colourModel`, `fileMetadata.colourModelInformation`,
and specific sub-fields of `fileMetadata.iptc`, `fileMetadata.icc`, and
`fileMetadata.xmp` that are used by config-driven alias columns.

**Config:** `SOURCE_EXCLUDES` array in `src/dal/es-config.ts`.

**To relax:** Add fields to `SOURCE_EXCLUDES` to strip more, or remove
entries to include more. If a new column needs a currently-excluded field,
remove it from the excludes list.

---

## 2. Request coalescing (AbortController)

**Problem:** Fast typing in the CQL input fires multiple debounced
searches. If the user types "london" quickly, searches for "l", "lo",
"lon", "lond", "londo", "london" may all be in-flight simultaneously.
Against a shared cluster, this multiplies load needlessly.

**Safeguard:** Each new `search()` call aborts the previous in-flight
request via `AbortController.abort()`. The browser cancels the TCP
connection, and the adapter returns an empty result for the aborted
request (not an error).

This means at most **one** search request is in-flight at any time.
`loadMore()` (pagination) is not coalesced — it uses a different code
path and shouldn't be cancelled by a new search.

**Config:** Built into `ElasticsearchDataSource.search()`.

**To relax:** Remove the abort logic if request coalescing causes issues
(e.g. if we add parallel search channels). The debounce on the CQL input
(~300ms) already provides some protection.

---

## 3. Write protection

**Problem:** The SSH tunnel to TEST ES is read/write. A mistyped `curl`
command, a script run against the wrong port, or a code bug could create,
modify, or delete indices on the shared cluster.

Three independent layers enforce read-only access on non-local ES:

**Layer 1 — Adapter path allowlist:** `assertReadOnly()` in `es-adapter.ts`
checks every request path against `ALLOWED_ES_PATHS`. Only `_search`,
`_count`, `_cat/aliases`, `_pit`, and `_mget` are permitted. Any other path (e.g.
`_bulk`, `_doc`, `_delete_by_query`) throws an error. `_pit` is needed
for Point In Time lifecycle operations (open/close) — these are read-only
snapshot operations, not data mutations. `_mget` is a read-only multi-get
used by the selections feature (Phase S0) to batch-fetch image metadata.

Path matching is strict: `path === p || path.startsWith(p + "?") ||
path.startsWith(p + "/")` — prevents prefix collisions (e.g. a
hypothetical `_search_shards` won't match `_search`).

**Layer 2 — Adapter HTTP method allowlist:** `ALLOWED_ES_METHODS` in
`es-config.ts` restricts methods to `GET`, `POST`, and `DELETE`.
`DELETE` is further restricted to `_pit` paths only (closing a PIT
snapshot). All `_search` and `_count` requests use POST because the
browser Fetch API does not allow request bodies on GET, and every ES
query requires a JSON body. `PUT` and `PATCH` are blocked.

**Layer 3 — Vite proxy guard:** The `esProxyGuard()` middleware plugin
in `vite.config.ts` validates paths at the proxy boundary *before*
requests reach ES. This catches any request that bypasses the adapter
(e.g. a raw `fetch('/es/_bulk')` from DevTools or a bug in non-adapter
code). Uses the same strict path matching as Layer 1.

All three layers are **bypassed on local ES** (`IS_LOCAL_ES === true` /
dev mode on port 9220) because `load-sample-data.sh` needs to create
indices and bulk-load data.

**Safeguard (script level):** `load-sample-data.sh` refuses to run if
the target ES URL is not on port 9220 (kupua's local docker port).
This prevents accidentally bulk-loading sample data into a TEST/PROD
cluster.

**Config:**
- `ALLOWED_ES_PATHS` in `src/dal/es-config.ts` — path allowlist
- `ALLOWED_ES_METHODS` in `src/dal/es-config.ts` — HTTP method allowlist
- `IS_LOCAL_ES` in `src/dal/es-config.ts` — derived from `VITE_ES_IS_LOCAL` env var (defaults to `"true"`)
- `esProxyGuard()` in `vite.config.ts` — proxy-level path guard (mirrors `ALLOWED_ES_PATHS`)

**To relax:** Add paths to `ALLOWED_ES_PATHS` (and the duplicated list
in `vite.config.ts`) if new read operations are needed (e.g. `_analyze`,
`_explain`). Do NOT add write paths (`_bulk`, `_doc`, `_update`,
`_delete`) without explicit discussion. When adding a path, also update
this doc's Layer 1 description above.

---

## 4. S3 proxy — read-only thumbnails

**Problem:** To display real image thumbnails from the Grid S3 buckets,
kupua needs to authenticate with AWS. Putting credentials in client-side
code or committing them to the repo would be a security risk.

**Safeguard:** The S3 proxy (`scripts/s3-proxy.mjs`) is a local-only
Node.js server that:

- Uses the developer's existing `media-service` AWS credentials
  (from `~/.aws/credentials`) — nothing committed to the repo
- Only performs `GetObject` — no write operations
- Binds to `127.0.0.1` only — not accessible from the network
- Runs only in `--use-TEST` mode, not in local mock mode
- Is proxied through Vite (`/s3/*` → `localhost:3001`) so credentials
  never reach the browser

**Config:** Environment variables set by `start.sh`:
- `KUPUA_THUMB_BUCKET` — thumbnail bucket name (auto-discovered from ES)
- `KUPUA_IMAGE_BUCKET` — image bucket name (auto-discovered from ES)
- `VITE_S3_PROXY_ENABLED` — feature flag for the UI

**To replace:** In Phase 3, delete the proxy and use Grid API signed URLs.
See `kupua/exploration/docs/00 Architecture and philosophy/s3-proxy.md` for full migration instructions.

---

## 5. imgproxy — read-only full-size image resizing

**Problem:** Full-size originals in S3 can be 50MB+ TIFFs or large JPEGs.
Serving them raw to the browser is impractical. Server-side resize and
format conversion is needed.

**Safeguard:** imgproxy (`darthsim/imgproxy`) runs as a Docker container that:

- Only performs `GetObject` from S3 — read-only, no write operations
- Uses the developer's existing `~/.aws/credentials` via a read-only
  volume mount (`~/.aws:/root/.aws:ro`) — nothing committed to the repo
- Runs only in `--use-TEST` mode (docker compose profile `imgproxy`)
- Is proxied through Vite (`/imgproxy/*` → `localhost:3002`) so
  credentials never reach the browser
- Uses `insecure` mode (no HMAC signing) — local dev only

**Tuning (`docker-compose.yml` environment):**

- `IMGPROXY_MAX_SRC_RESOLUTION: 510` — max source image resolution in
  megapixels. Default is 16.8MP, which rejects large press panoramas and
  hi-res scans (422 "Source image resolution is too big"). 510MP covers the
  largest known test image. libvips streams in tiles so actual RAM is far
  below width×height×4; one slow request won't block others (each request
  occupies one concurrency slot — `IMGPROXY_CONCURRENCY` defaults to
  CPU count × 2).
- `IMGPROXY_DOWNLOAD_TIMEOUT: 10` — seconds to wait for S3 download.
  Default is 5s; the 510MP test image takes ~5.1s to download.

See `kupua/exploration/docs/01 Research/imgproxy-research.md` for full background.

---

## 6. Aggregation load control

**Problem:** Facet filters require terms aggregations — one per aggregatable
field — on every search. This is a new class of ES load that didn't exist
in Kahuna (which has almost no aggregations). With 50+ concurrent users,
naively running aggs on every keystroke could strain the cluster.

**Risk assessment (PROD numbers from 2026-03):**

- 7 aggregatable fields (credit, source, category, image type, uploader,
  MIME type, plus config-driven alias fields)
- Each terms agg scans all matching documents to build the top-N buckets
- Unfiltered search matches ~9M docs; even filtered searches often match
  millions (e.g. `credit:"Getty Images"` → 1M+)
- 50+ concurrent users × aggs on every search = significant extra load

**Safeguards (all in `search-store.ts` + `FacetFilters.tsx`):**

| Control | Implementation | Effect |
|---|---|---|
| **Lazy fetch** | Aggs only fire when the Filters accordion section is expanded (Decision #9). Most users will have Collections expanded, not Filters. | Only power users who actively want facets pay the ES cost. |
| **Section state persisted** | Open/closed state in localStorage (Decision #13). | New users default to Filters collapsed = zero agg load. |
| **Batched request** | All N field aggs in a single `_search` with `size:0` — no hits returned. | 1 ES request, not N. Minimal response payload. |
| **Query-keyed cache** | `aggCacheKey()` hashes only the params that affect the result set (query, filters, dates — not pagination or sort). Skips fetch if cache key unchanged. | Scrolling, sorting, or paging never triggers agg re-fetch. |
| **500ms debounce** | Separate from the ~300ms search debounce. | During rapid typing, at most 1 agg request fires per 500ms window. |
| **Abort on re-query** | `AbortController` cancels the previous agg request when a new one starts. | Stale agg requests don't waste connections or ES time. |
| **Circuit breaker (2s)** | If the wall-clock time of an agg response exceeds 2000ms, `aggCircuitOpen` is set. Auto-fetch is disabled until the user clicks a manual "Refresh" button (which bypasses the breaker). | If ES is slow, kupua stops piling on. The user sees "Refresh (slow)" and can decide whether to retry. |
| **Small bucket size** | Default 10 buckets per field in the batch. "Show more" fires a separate single-field request at 100 buckets — not mixed into the recurring batch. Expanded state is component-level (cleared on new search, not persisted). | Batch stays cheap (13 × 10 = 130 buckets). Expansion is on-demand, per-field, and transient. Cap at 100 prevents runaway requests. |
| **`took` tracking** | Agg response `took` time is stored in `aggTook` and displayed in the Filters panel. | Developer and user can see how long aggs take. Visible monitoring. |
| **Hover prefetch** | When the user hovers over the Browse panel toggle, aggs are prefetched — but only if (a) the panel is closed and (b) the Filters section is already expanded in localStorage (i.e. a "Filters person"). | By the time the user clicks, data is already in flight or cached. Casual users (Filters collapsed) never trigger a prefetch on hover. The cache key check prevents duplicate requests. This is intentionally invisible ("magic") — documented here because it's non-obvious. |

**What to observe in CloudWatch (when connected to TEST/PROD):**

- **ES `SearchRate`** — should not noticeably increase when one developer
  opens the Filters panel. If it does, the debounce or cache is broken.
- **ES `SearchLatency` (p99)** — agg requests should appear as a separate
  population. If p99 spikes, the aggs are too heavy.
- **ES `JVMMemoryPressure`** — terms aggs build in-memory maps. If this
  climbs, reduce bucket count or add `execution_hint: "map"`.
- **ES `CPUUtilization`** — sustained increase during normal use would
  indicate aggs are too expensive for the cluster size.

**Future considerations:**

- If agg load is problematic at scale, consider: (a) server-side agg
  caching in a lightweight proxy, (b) `sampler` aggregation to approximate
  counts on large result sets, (c) reducing default fields to top 3-4
  most-used, (d) `execution_hint: "global_ordinals"` (default) vs `"map"`
  tuning.
- The `took` display in the Filters panel is the first line of monitoring.
  If users report slowness, the time is right there.

---

## 7. E2E test real-cluster gate — refuse to run against non-local ES

**Problem:** Playwright's `reuseExistingServer: true` means `npx playwright test`
will happily use an already-running Vite dev server on port 3000. If the developer
previously ran `start.sh --use-TEST`, that server is proxying to a real ES cluster.
Running 63 e2e tests against TEST fires hundreds of search/count/agg requests,
triggers CloudWatch alarms, and produces meaningless test failures (the tests expect
10k local docs, not 1.3M).

**Safeguard:** `e2e/global-setup.ts` runs a pre-flight check before any test
execution. It queries the Vite proxy (`/es/images/_count` then `/es/_count`) and
checks the document count. If the count exceeds `LOCAL_MAX_DOCS` (50,000), the
test run is aborted with a clear error message explaining the cause and fix.

The check runs as the very first step of `globalSetup()`, before Docker ES
auto-start or index verification. If Vite is not running on port 3000, the
check silently passes (Playwright will start its own Vite instance later,
which defaults to local ES on port 9220).

**Why doc count, not env var:** The `VITE_ES_IS_LOCAL` flag exists in the app
code but is a build-time Vite env var — not accessible to the Playwright global
setup (which runs in Node.js, not in the browser). Querying the actual data
through the Vite proxy is the only reliable way to detect the connection target.

---

## Configuration

### Environment variables

| Variable | Default | Where set | Description |
|---|---|---|---|
| `KUPUA_ES_URL` | `http://localhost:9220` | Shell / `.env` | ES target for Vite proxy (server-side only, not exposed to browser) |
| `VITE_ES_BASE` | `/es` | `.env` | Vite proxy path prefix (client-side) |
| `VITE_ES_INDEX` | `images` | `.env` | ES index or alias to query |
| `VITE_ES_IS_LOCAL` | `true` | `.env` | Set to `false` when connecting to non-local ES (enables write protection) |
| `VITE_S3_PROXY_ENABLED` | `false` | `start.sh` | Set to `true` when S3 thumbnail proxy is running |
| `VITE_IMGPROXY_ENABLED` | `false` | `start.sh` | Set to `true` when imgproxy container is running |
| `VITE_IMAGE_BUCKET` | (none) | `start.sh` | S3 bucket for full-size images (for imgproxy URL generation) |
| `KUPUA_THUMB_BUCKET` | (none) | `start.sh` | S3 bucket for thumbnails (auto-discovered) |
| `KUPUA_IMAGE_BUCKET` | (none) | `start.sh` | S3 bucket for full images (auto-discovered) |
| `S3_PROXY_PORT` | `3001` | `start.sh` | Port for the S3 proxy server |

### Connecting to TEST ES

```bash
# 1. Establish SSH tunnel (requires media-service AWS profile)
SSH_COMMAND=$(ssm ssh --profile media-service -t elasticsearch-data,media-service,TEST --newest --raw)
eval $SSH_COMMAND -f -N -o ExitOnForwardFailure=yes -L 9200:localhost:9200

# 2. Find the index alias
curl -s 'http://localhost:9200/_cat/aliases?v' | grep images

# 3. Create .env (or .env.local) in kupua/
cat > .env.local << 'EOF'
KUPUA_ES_URL=http://localhost:9200
VITE_ES_INDEX=images_current
VITE_ES_IS_LOCAL=false
EOF

# 4. Start kupua
npm run dev
```

### Switching back to local ES

Delete or rename `.env.local`, or set:

```bash
KUPUA_ES_URL=http://localhost:9220
VITE_ES_INDEX=images
VITE_ES_IS_LOCAL=true
```

---

## Future considerations

- **Rate limiting:** If needed, add a minimum interval between searches
  (e.g. 500ms). Currently the CQL debounce (~300ms) + AbortController
  provide sufficient protection.

- **Query complexity limits:** Could add a max clause count or query
  depth check to prevent accidentally complex CQL from generating
  expensive ES queries. Not needed yet.
