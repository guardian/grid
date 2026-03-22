# Kupua — Elasticsearch Safeguards

> These safeguards protect shared ES clusters (TEST/CODE) when kupua
> connects to real infrastructure instead of its local docker ES.
> They're deliberately conservative for Phase 2. As we gain confidence,
> individual safeguards can be relaxed or removed — document any changes here.

## Overview

| # | Safeguard | Where | Status |
|---|---|---|---|
| 1 | `_source` excludes | `es-config.ts` → `es-adapter.ts` | ✅ Active |
| 2 | Request coalescing (AbortController) | `es-adapter.ts` | ✅ Active |
| 3 | Write protection | `es-adapter.ts` + `load-sample-data.sh` | ✅ Active |
| 4 | S3 proxy — read-only | `scripts/s3-proxy.mjs` | ✅ Active |

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

**Safeguard (adapter level):** `assertReadOnly()` in `es-adapter.ts`
checks every request path against `ALLOWED_ES_PATHS`. Only `_search`,
`_count`, and `_cat/aliases` are permitted. Any other path (e.g.
`_bulk`, `_doc`, `_delete_by_query`) throws an error.

This check is **bypassed on local ES** (`IS_LOCAL_ES === true`) because
`load-sample-data.sh` needs to create indices and bulk-load data.

**Safeguard (script level):** `load-sample-data.sh` refuses to run if
the target ES URL is not on port 9220 (kupua's local docker port).
This prevents accidentally bulk-loading sample data into a TEST/PROD
cluster.

**Config:**
- `ALLOWED_ES_PATHS` in `src/dal/es-config.ts` — whitelist of read-only paths
- `IS_LOCAL_ES` in `src/dal/es-config.ts` — derived from `VITE_ES_IS_LOCAL` env var (defaults to `"true"`)

**To relax:** Add paths to `ALLOWED_ES_PATHS` if new read operations
are needed (e.g. `_analyze`, `_explain`). Do NOT add write paths
(`_bulk`, `_doc`, `_update`, `_delete`) without explicit discussion.

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
See `kupua/exploration/docs/s3-proxy.md` for full migration instructions.

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

See `kupua/exploration/docs/imgproxy-research.md` for full background.

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

- **`search_after` pagination:** Phase 2 should replace `from/size` with
  `search_after` for deep pagination. This is more efficient for ES and
  avoids the 10,000-result default window limit.

- **`_source` includes (allowlist):** Currently we use excludes (blocklist).
  If response sizes are still too large, switch to explicit includes —
  only fetch the exact fields displayed in columns. This is more
  restrictive but guarantees minimal payloads.

- **Query complexity limits:** Could add a max clause count or query
  depth check to prevent accidentally complex CQL from generating
  expensive ES queries. Not needed yet.

