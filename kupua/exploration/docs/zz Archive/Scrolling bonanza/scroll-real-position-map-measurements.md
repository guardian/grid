# Phase 0 — Position Map Measurements

> **Date:** 2026-04-10
> **Cluster:** TEST (via SSH tunnel, localhost:9200)
> **Index:** Images_Current
> **Query:** `uploadTime ∈ [2024-08-01T23:00:00.000Z, 2026-02-10T23:59:59.999Z]` → **65,100 docs**
> **Script:** `kupua/scripts/scroll-real-measure-position-map.mjs`
> **V8 heap page:** `kupua/public/measure-heap.html` (served at `/measure-heap.html`)

---

## 1. Response Shape (Step 2 of workplan)

With `_source: false`, ES returns:

```json
{
  "_index": "images_2026-02-12_16-22-48_1e6eb09",
  "_id": "c6543b050bbb7400cc141a42ab6deae98563bbb8",
  "_score": null,
  "sort": [1770766945073, "c6543b050bbb7400cc141a42ab6deae98563bbb8", 447671]
}
```

**Key findings:**
- `_id` **present** ✓ — always returned regardless of `_source` setting
- `_source` **absent** ✓ — not in the response at all (not `null`, just missing)
- `sort` **present** ✓ — includes PIT's implicit `_shard_doc` tiebreaker as 3rd element
- **`_id` is always 40 characters** (hex SHA-1 hash) — consistent across all 65,100 docs
- Sort values trimmed to 2 elements after stripping `_shard_doc` (matches sort clause length)

**Implication for Phase 1:** `searchAfter` currently maps `hit._source` → will be `undefined`.
The workplan correctly recommends a new `fetchPositionIndex` method that reads `hit._id` +
`hit.sort` directly, not modifying the existing `searchAfter` return path.

---

## 2. Wire Size per Document

| Sort | Per-doc (bytes) | 65k wire total | Notes |
|------|-----------------|----------------|-------|
| `uploadTime desc` | **186.6** | 11.58 MB | Sort values: [number, string] |
| `credit asc` | **204.5** | 12.70 MB | Sort values: [string, number, string] — keyword adds ~18B |

**vs estimate:** Workplan estimated ~200 bytes/doc. Actual is **187–205** — spot on.

**Breakdown (date sort):**
- JSON overhead per hit: `{"_index":"...","_id":"...","_score":null,"sort":[...]}` ≈ 40 bytes structural
- `_index` value: ~43 bytes (index name)
- `_id` value: 40 bytes (hex hash) + 2 bytes quotes
- `sort` array: epoch number (~13 digits = 13 bytes) + id string (42 bytes) = ~57 bytes
- Total per hit: ~182 bytes (matches measured 187 with JSON array separators)

**Note:** `_index` is unnecessary for the position map — it's ~43 bytes of waste per doc
(~2.7MB at 65k). ES 8.x doesn't have a way to exclude it. Not worth worrying about.

---

## 3. Fetch Times — Chunk Size Comparison

| Chunk Size | Chunks | Total Wire | Wall-clock | Avg Chunk | Parse Time | Network Time |
|------------|--------|------------|------------|-----------|------------|--------------|
| **5,000** | 14 | 11.59 MB | **6,292ms** | 449ms | 3,139ms (50%) | ~3,153ms |
| **10,000** | 7 | 11.58 MB | **5,266ms** | 752ms | 3,329ms (63%) | ~1,937ms |
| **20,000** | 4 | 11.58 MB | **4,867ms** | 1,217ms | 3,459ms (71%) | ~1,408ms |

**Key observation:** Parse time is roughly constant (~3.3s) regardless of chunk size —
it's proportional to total data, not chunk count. Network time scales linearly with
chunks (SSH tunnel round-trip latency ~200-330ms per chunk). Larger chunks reduce total
time by reducing network overhead.

**20k chunks save ~400ms over 10k** at cost of larger per-chunk GC pressure. The
per-chunk parse time at 20k (~1,060ms) means a single chunk blocks the main thread
for >1s — bad for browser responsiveness. **10k is the sweet spot:** ~530ms parse per
chunk is borderline but manageable with `scheduler.yield()` between chunks.

**All configurations exceed the hoped-for ~2-3s target.** 5.3s (10k chunks) is
borderline on the 5s retreat threshold. See Decision section below.

### Keyword sort (credit asc) at 10k chunks

| Metric | Value |
|--------|-------|
| Total fetched | 65,100 |
| Chunks | 7 |
| Wire size | 12.70 MB |
| Wall-clock | **5,667ms** |
| Parse time | 3,629ms |
| Per-doc | 204.5 bytes |

~400ms slower than date sort (larger per-doc payloads from keyword string values).

---

## 4. Keyword Sort Behaviour (Step 3)

**Verdict: works perfectly.** ✓

Sort values come through cleanly with `_source: false`:

```json
sort: ["Getty Images", 1724856789000, "abc123...", 12345]
```

- String keyword values present as first sort element
- No multi-valued fields (no arrays-within-arrays)
- No null primary sort values in first 100 (the query filters by uploadTime range,
  and credit is populated for most images in this range)
- Empty string (`""`) appears for some images — this is valid (ES treats empty
  string as a value, not null)

**Implication for Phase 1:** Keyword sorts are in scope for v1. No special handling
needed beyond the existing null-zone cursor detection.

---

## 5. PIT Stability (Step 7)

**1m keepalive is sufficient.** ✓

- 7 sequential 10k-chunk requests completed without PIT expiry
- 2-second idle period after the last chunk: PIT still alive
- Each chunk's `pit: { keep_alive: "1m" }` refreshes the keepalive timer

Total fetch time (~5.3s) is well within the 1m window. Even with SSH tunnel
latency spikes, a 5× safety margin (1m vs 5.3s) is comfortable.

**PIT-sharing decision (Step 7):** Cannot test in this script (concurrent
seek/extend requires the browser app). Deferring to the in-browser heap test
session. However, the fetch takes ~5s — during which a user is likely to
interact. **Preliminary recommendation: dedicated PIT** for the position map
fetch, to decouple its lifecycle from seek/extend. One extra `_pit` open call
(~5ms, measured) is negligible.

---

## 6. V8 Heap Measurement (Step 6)

### In-browser measurement (Chrome, `/measure-heap.html`)

**Fetch confirmed in-browser:** 65,100 entries, 5,389ms wall-clock (matching Node
script). JSON.stringify of the position map = **6.33 MB** (lower bound — serialised
wire format with no V8 overhead).

**Object count:** 260,403 JS objects in the position map structure:
- 65,100 ID strings (in `ids` array)
- 65,100 inner sort arrays (in `sortValues`)
- 65,100 ID strings within sort arrays (duplicated by V8 — not interned)
- 65,100 HeapNumber objects (timestamps > 2³¹)
- 3 large arrays + 1 outer object

**Structural estimate** (walking actual data, applying known V8 per-object costs):
- **17.88 MB total** (~288 bytes/entry)

**Three-way cross-check:**

| Method | Total | Per-entry | Confidence |
|--------|-------|-----------|------------|
| JSON serialised (lower bound) | 6.33 MB | 97 B | Certain — floor |
| Structural code estimate | **17.88 MB** | **288 B** | High — based on known V8 sizes |
| Workplan theoretical | 19.3 MB | 312 B | Upper estimate |

**Verdict: ~18 MB heap at 65k.** Comfortably under the 50 MB ceiling. Even with the
windowed buffer (~5-10 MB), total is ~23-28 MB — well within budget.

**Per-entry cost: ~288 bytes.** ~1.5× the wire-format estimate of 187 bytes.
Workplan estimated 250-350 bytes — actual is in the middle of that range.

### Updated memory budget table (replacing estimates with actuals)

| Component | Wire size | V8 heap (actual) | Notes |
|-----------|-----------|-------------------|-------|
| Position map (65k) | 11.6 MB | **~18 MB** | 288 bytes/entry |
| Windowed buffer (1000 docs) | ~5-10 MB | ~5-10 MB | Unchanged |
| **Total** | **~17-22 MB** | **~23-28 MB** | Comfortable |

### Retreat thresholds (with actual per-entry cost)

| Threshold | Heap (position map) | Total (+ buffer) |
|-----------|-------------------|-------------------|
| 65,000 | 18 MB | ~23-28 MB |
| 40,000 | 11 MB | ~16-21 MB |
| 20,000 | 5.5 MB | ~10-16 MB |
| 10,000 | 2.8 MB | ~8-13 MB |

---

## 7. Summary & Go/No-Go Inputs

| Metric | Estimate | Actual | Status |
|--------|----------|--------|--------|
| Per-doc wire size | ~200B | **187B** (date), **205B** (keyword) | ✅ On target |
| 65k wire total | ~13MB | **11.6MB** (date), **12.7MB** (keyword) | ✅ Under estimate |
| Fetch time (65k, 10k chunks) | ~2-3s | **5.3s** | ⚠️ Above target |
| Fetch time (65k, 20k chunks) | — | **4.9s** | ⚠️ Marginal improvement |
| PIT stability (1m) | Should hold | **Holds fine** | ✅ |
| Keyword sort | Should work | **Works perfectly** | ✅ |
| V8 heap (65k) | ~20-25MB | **~18MB** (288 B/entry, structural estimate) | ✅ Under estimate |
| `_id` + `sort` in response | Should be present | **Confirmed** | ✅ |

### Key Issue: Fetch Time

The 5.3s wall-clock at 65k is borderline. The workplan's 5s retreat threshold was
intended as a "seriously consider retreating" line. Analysis:

**Why it's slow:** Not ES — ES `took` times are 23-451ms. The bottleneck is:
1. **SSH tunnel latency**: ~200-330ms round-trip per chunk (network)
2. **JSON.parse in Node**: ~500ms per 10k-chunk (CPU-bound)

**In-browser expectations:** JSON.parse is likely similar or faster (V8 in Chrome
is optimized for JSON). Network via Vite proxy adds a small overhead (~5ms per
chunk). Total in-browser: likely **5-6s** — similar to Node.

**Would a lower threshold help?** Yes:

| Threshold | Estimated fetch time | Use case |
|-----------|---------------------|----------|
| 65,000 | ~5.3s | Full day on PROD |
| 40,000 | ~3.2s | Most filtered day queries |
| 20,000 | ~1.6s | Comfortably under 2s |
| 10,000 | ~0.8s | Borderline with raising SCROLL_MODE_THRESHOLD |

---

## Decisions for Post-Phase-0 Session

Decided 2026-04-10 with user:

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| **A** | Threshold | **65k** (configurable via `VITE_POSITION_MAP_THRESHOLD`) | Memory well under budget (18MB vs 50MB ceiling). 5.3s is a one-time background fetch — user sees results instantly, map loads silently. Seek with map = ~50ms vs ~500ms without. |
| **B** | PIT | **Dedicated PIT** for position map fetch | 5s fetch is long enough for user interaction conflicts. One extra `_pit` open call (~5ms) is negligible. |
| **C** | Chunk size | **10k** | Sweet spot: ~530ms parse per chunk is browser-tolerable. 20k risks >1s jank. 5k adds too many round-trips. |
| **D** | Keyword sorts | **Yes, in scope for v1** | Works perfectly — no issues found. |
| **E** | Memory | **18MB — confirmed OK** | 288 bytes/entry. Total with buffer: ~23-28MB. Comfortable. |
| **F** | Loading UX | **Essential** — Phase 5 is not optional | 5.3s background fetch means scrubber starts in seek mode, transitions to indexed mode after ~5s. |

---

## Raw Data

Full measurement output saved in the script's terminal output.
Script: `kupua/scripts/scroll-real-measure-position-map.mjs`
V8 heap page: `kupua/public/measure-heap.html`





