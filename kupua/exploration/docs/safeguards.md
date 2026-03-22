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

## Configuration

### Environment variables

| Variable | Default | Where set | Description |
|---|---|---|---|
| `KUPUA_ES_URL` | `http://localhost:9220` | Shell / `.env` | ES target for Vite proxy (server-side only, not exposed to browser) |
| `VITE_ES_BASE` | `/es` | `.env` | Vite proxy path prefix (client-side) |
| `VITE_ES_INDEX` | `images` | `.env` | ES index or alias to query |
| `VITE_ES_IS_LOCAL` | `true` | `.env` | Set to `false` when connecting to non-local ES (enables write protection) |

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

