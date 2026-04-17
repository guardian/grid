# Kupua Tuning Knobs — Configuration & Constants Reference

> Master reference for every tuning parameter that affects performance,
> visual stability, and data flow in kupua. Grouped by system, with
> coupling analysis and corpus-scaling notes.
>
> **How to use this doc:** When debugging a behaviour or planning a change,
> find the relevant system below and understand which knobs are involved,
> what they're coupled to, and whether they need corpus-dependent tuning.

---

## 1. Buffer & Pagination (constants/tuning.ts)

These are the core knobs controlling how much data lives in memory and how
fast it flows in and out.

| Knob | Value | Env var | Location |
|---|---|---|---|
| `BUFFER_CAPACITY` | **1000** | — | constants/tuning.ts:27 |
| `PAGE_SIZE` | **200** | — | constants/tuning.ts:33 |
| `EXTEND_THRESHOLD` | **50** | — | useDataWindow.ts:49 |

### BUFFER_CAPACITY (1000)

**What it does:** Maximum number of images held in the buffer at any time.
When a forward extend would push the buffer past this, items are evicted
from the start; when a backward extend would push past this, items are
evicted from the end. Scroll compensation adjusts scrollTop to prevent
visible jumps.

**Performance impact:** Higher = more memory, fewer evictions, larger
virtualizer DOM. Lower = more frequent evictions (each triggers scroll
compensation → potential jank), tighter scroll range (the density-focus
drift bug was caused by compensation exceeding maxScroll — tighter buffers
make this worse).

**Coupled to:**
- `PAGE_SIZE` — must be smaller (currently 200 < 1000). If PAGE_SIZE ≥
  BUFFER_CAPACITY, each extend replaces the entire buffer.
- `EXTEND_THRESHOLD` — triggers extends when visible range is within 50
  items of buffer edge. With 1000 capacity, that's 5% of the buffer.
- **Scroll range geometry** — table: 1000 × 32px = 32,000px. Grid:
  1000/6cols × 303px ≈ 50,500px. Affects how soon scroll compensation
  hits maxScroll clamps.
- `SCROLL_MODE_THRESHOLD` — if set equal to BUFFER_CAPACITY (both 1000),
  scroll mode fills the buffer completely when total ≤ 1000.

**Corpus scaling:**
- 10k local: buffer = 10% of total. Comfortable.
- 1.3M TEST: buffer = 0.077%. Works fine — deep seek puts you anywhere.
- 9M PROD: same ratio, no change needed. Buffer is a sliding window, not
  a percentage of total.
- **Verdict: does NOT need corpus-dependent tuning.** The buffer is a
  viewport-relative concept, not a corpus-relative one.

### PAGE_SIZE (200)

**What it does:** Number of images fetched per extend (forward or backward)
and per initial search. Also the chunk size for scroll-mode buffer fill.

**Performance impact:** Higher = fewer network round-trips but larger
per-request payload and more DOM churn per extend. Lower = more frequent
extends (more network, more scroll compensation events). Experiment D
(200→100) showed: severe jank +6%, janky frames +50%, DOM churn +5%,
LoAF count +33%. **200 is the sweet spot.**

**Coupled to:**
- `BUFFER_CAPACITY` — 5 pages fill the buffer.
- Binary search convergence — the bisect loop breaks when
  `|count - target| <= PAGE_SIZE`. Larger PAGE_SIZE = coarser landing.
- Scroll-mode fill — fetches `ceil((total - 200) / PAGE_SIZE)` chunks.
- Prepend compensation — each backward extend prepends PAGE_SIZE items.
  Compensation = `ceil(PAGE_SIZE / columns) × rowHeight` pixels.

**Corpus scaling:** Not corpus-dependent. Network payload scales with
PAGE_SIZE × per-doc size, not with total docs.

### EXTEND_THRESHOLD (50)

**What it does:** When the visible range's start index ≤ 50 (near buffer
start), triggers `extendBackward`. When end index ≥ bufferLength - 50
(near buffer end), triggers `extendForward`.

**Performance impact:** Higher = extends trigger earlier (more headroom
before user sees placeholder gaps). Lower = extends trigger later (less
network but higher risk of visible gaps during fast scroll).

**Coupled to:**
- `PAGE_SIZE` — a single extend fetches 200 items, giving 200/50 = 4×
  the threshold as headroom.
- Virtualizer overscan — with overscan 5, the rendered range is ~5 rows
  beyond visible. In table that's 5 extra items; in grid, 5 × columns.

**Corpus scaling:** Not corpus-dependent.

---

## 2. Seek Strategy (constants/tuning.ts)

Controls how the scrubber/keyboard seeks to arbitrary positions.

| Knob | Value | Env var | Location |
|---|---|---|---|
| `MAX_RESULT_WINDOW` | **500** (local) / **100,000** (TEST/PROD) | `VITE_MAX_RESULT_WINDOW` | constants/tuning.ts:83, .env, start.sh |
| `DEEP_SEEK_THRESHOLD` | **200** (.env.development) / **500** (.env) / **10,000** (TEST/PROD) | `VITE_DEEP_SEEK_THRESHOLD` | constants/tuning.ts:95 |
| `MAX_BISECT` | **50** | — | search-store.ts:2377 |

### MAX_RESULT_WINDOW (500 local / 100,000 real)

**What it does:** Mirrors the ES index's `index.max_result_window` setting.
The store uses `from/size` pagination up to this limit for shallow seeks.
Beyond it, seeks fail with ES errors.

**Performance impact:** On real clusters, `from/size` at offsets >10k is
slow (~1-3s) because ES must score and skip all preceding docs. The window
exists as a hard cap, not a performance target.

**Coupled to:**
- `DEEP_SEEK_THRESHOLD` — should be ≤ MAX_RESULT_WINDOW. The deep path
  bypasses from/size entirely.
- Local ES Docker setting — `load-sample-data.sh` sets
  `max_result_window: 500` on the local index to force deep seek path
  exercise with only 10k docs.

**Corpus scaling:**
- Local: 500 (deliberate — forces deep seek testing).
- TEST/PROD: 100,000 (real ES setting).
- **Set by infrastructure, not tuned per corpus size.**

### DEEP_SEEK_THRESHOLD (200 .env.development / 500 .env / 10,000 real)

**What it does:** When a seek targets a position above this threshold, the
store uses the deep path (percentile estimation + search_after +
countBefore) instead of from/size. Below it, uses simple from/size.

**Performance impact:** Deep path is ~20-70ms regardless of depth. From/size
at 10k offset is ~1-3s on real clusters. Locally it doesn't matter (10k
docs, no network latency).

**Why the local value is low (200/500):** Forces E2E tests to exercise the
deep seek path even with 10k sample docs. A seek to 50% (position ~5000)
is deep. Without this, the deep path would only activate for seeks past
position 10,000 — impossible with 10k docs.

**Coupled to:**
- `MAX_RESULT_WINDOW` — must be ≤ MAX_RESULT_WINDOW.
- Keyword binary search — only activates on the deep path.

**Corpus scaling:** The default (10,000) is correct for any real cluster.
The local override (200-500) is test infrastructure, not a tuning knob.

### MAX_BISECT (50)

**What it does:** Maximum iterations for the binary search on the `id`
tiebreaker field during keyword sort deep seek. Converges in ~11 iterations
for SHA-1 hashes (48-bit search space). 50 is a safety cap.

**Performance impact:** Each iteration is one `_count` query (~500 bytes,
~50ms via SSH tunnel). 11 iterations = ~550ms. At 50 iterations: ~2.5s.

**Corpus scaling:** Not corpus-dependent. SHA-1 hash distribution is
uniform regardless of corpus size.

---

## 3. Keyword Seek (es-adapter.ts)

Controls the composite aggregation walk for keyword sort seeking.

| Knob | Value | Env var | Location |
|---|---|---|---|
| `BUCKET_SIZE` (findKeywordSortValue) | **10,000** | `VITE_KEYWORD_SEEK_BUCKET_SIZE` | es-adapter.ts:804 |
| `MAX_PAGES` (findKeywordSortValue) | **50** | — | es-adapter.ts:807 |
| `TIME_CAP_MS` (findKeywordSortValue) | **8,000** | — | es-adapter.ts:808 |
| `BUCKET_SIZE` (getKeywordDistribution) | **10,000** | — | es-adapter.ts:934 |
| `MAX_PAGES` (getKeywordDistribution) | **5** | — | es-adapter.ts:935 |

### BUCKET_SIZE (10,000)

**What it does:** Number of unique keyword values per composite aggregation
page. ES allows up to 65,536. At 10k per page, even 100k unique values
(e.g. credits) need only 10 pages.

**Performance impact:** Larger = fewer network round-trips but bigger
per-page payload. 10k is the sweet spot — each page is ~100-500KB,
completes in ~5-30ms on real clusters.

**Coupled to:** `MAX_PAGES` and `TIME_CAP_MS` — together they cap total
work. 50 pages × 10k = 500k unique values maximum.

**Corpus scaling:**
- 10k local (5 cycling credits): 1 page, ~5ms. Trivial.
- 1.3M TEST: Credit has ~50k unique values → 5 pages. ~150ms total.
- 9M PROD: Credit might have ~200k unique values → 20 pages. ~600ms.
  Still within the 8s time cap. **No change needed, but monitor.**

### TIME_CAP_MS (8,000)

**What it does:** If the composite agg walk exceeds 8s, returns the
best-known value so far (approximate position). Better than returning null
(which falls back to capped from/size).

**Corpus scaling:** May need increasing for 9M PROD if SSH tunnel
latency is high. **Monitor actual seek times before changing.**

### getKeywordDistribution limits (BUCKET_SIZE=10k, MAX_PAGES=5)

**What it does:** Fetches up to 50k unique values for the scrubber tooltip
keyword lookup. More conservative than findKeywordSortValue (5 pages vs 50)
because this runs lazily on first scrubber interaction and the tooltip only
needs approximate values.

**Corpus scaling:** At 9M PROD with 200k unique credits, this would only
fetch the first 50k. The tooltip would show "?" for positions beyond 50k.
**May need increasing MAX_PAGES to 20 for PROD.** Or: accept that tooltip
accuracy degrades gracefully for very high-cardinality fields.

---

## 4. Virtualizer (TanStack Virtual)

| Knob | Value | Location |
|---|---|---|
| `overscan` (table) | **15** | ImageTable.tsx:488 |
| `overscan` (grid) | **5** | ImageGrid.tsx:306 |

### overscan (table: 15, grid: 5)

**What it does:** Number of rows rendered beyond the visible viewport in
each direction. Table renders ~15 extra rows (15 items); grid renders
~5 extra rows (5 × columns items).

**Performance history:** The original reduction from 20→5 was the single
biggest rendering win: severe jank −61% (36→14), P95 −49% (67→34ms), DOM
churn −44% (76k→42k). At overscan 20, React reconciled ~40 off-screen
rows per scroll frame — in grid that's 240 extra DOM elements. The table
was subsequently bumped from 5→15 because table rows are cheap (32px,
minimal DOM per row) and the extra headroom significantly reduces blank
flashes during fast scroll. The grid stays at 5 because grid rows are
heavy (303px, thumbnail + metadata) and 5 already provides ~1,515px of
headroom.

**The trade-off (jank vs flashes):** Lower overscan = less work per
frame = smoother scrolling, but new rows enter the viewport before React
has rendered their content → brief blank flashes (1-2 frames, ~16-32ms).
Higher overscan = rows pre-rendered further ahead = fewer flashes, but
each frame does proportionally more DOM work → stuttery scrolling.

**Pixel headroom per view:**
- **Table:** overscan 15 × 32px = **480px** beyond viewport. Comfortable
  headroom even during fast scroll.
- **Grid:** overscan 5 × 303px = **1,515px** beyond viewport. That's
  ~1.5 viewports of headroom. Very generous — flashes rare.

**Coupled to:**
- `EXTEND_THRESHOLD` — extends trigger based on buffer-local indices, not
  virtualizer indices. Overscan doesn't affect extend timing.
- Content paint speed — flashes are really "time between row entering
  the viewport and React rendering its content." Overscan buys time by
  rendering rows earlier.

**Corpus scaling:** Not corpus-dependent. Overscan is viewport-relative.
(ES payload size is unaffected — overscan only controls how many
already-buffered items are rendered in the DOM, not how many are fetched.)

---

## 5. Scroll Mode & Position Map (constants/tuning.ts)

| Knob | Value | Env var | Location |
|---|---|---|---|
| `SCROLL_MODE_THRESHOLD` | **1000** | `VITE_SCROLL_MODE_THRESHOLD` | constants/tuning.ts:49 |
| `POSITION_MAP_THRESHOLD` | **65,000** | `VITE_POSITION_MAP_THRESHOLD` | constants/tuning.ts:67 |

Three tiers based on total result count:
- **total ≤ SCROLL_MODE_THRESHOLD (1000):** scroll mode — all results
  in buffer, scrubber drag directly scrolls.
- **1000 < total ≤ POSITION_MAP_THRESHOLD (65,000):** two-tier mode —
  position map built in background, scrubber seeks via exact
  position→sortValues lookup (one search_after call).
- **total > 65,000:** seek mode — scrubber uses percentile estimation
  or composite aggregation walks.

### SCROLL_MODE_THRESHOLD (1000)

**What it does:** When `total ≤ 1000`, the store eagerly fetches ALL
results after the initial page. The scrubber enters "scroll mode" (drag
directly scrolls content, no seek-on-pointer-up).

**Performance impact:** For small result sets, eliminates all seek
complexity. For large result sets (>1000), no effect.

**Coupled to:**
- `BUFFER_CAPACITY` — when threshold = capacity (both 1000), the buffer
  holds the entire result set. If threshold > capacity, the buffer would
  overflow and evict — which defeats scroll mode.
- `PAGE_SIZE` — fill fetches `ceil((total - 200) / 200)` chunks.
- `POSITION_MAP_THRESHOLD` — defines the boundary between two-tier and
  seek mode. Must be < POSITION_MAP_THRESHOLD (otherwise there's no
  two-tier range).

**Corpus scaling:** This is a threshold on `total` (search result count),
not corpus size. A query that returns 500 results uses scroll mode
regardless of whether the corpus is 10k or 9M. **Not corpus-dependent.**

### POSITION_MAP_THRESHOLD (65,000)

**What it does:** When `SCROLL_MODE_THRESHOLD < total ≤ 65,000`, the store
builds a lightweight position map in the background after the initial
search. The map stores id + sort values (~288 bytes/entry) for every
document via `_source: false` search_after walks. Once loaded, any
scrubber seek resolves via exact position→sortValues lookup — one
`search_after` call instead of percentile estimation or composite walks.

The virtualizer in this range uses "two-tier mode": it spans all `total`
items (not just the buffer), showing skeleton cells outside the loaded
window. The scrubber drag directly scrolls the container (like a real
scrollbar) rather than seeking on pointer-up.

**Performance impact:**
- At 65k: ~18MB V8 heap, ~5s background fetch. Acceptable.
- At 100k: ~28MB heap, ~8s fetch. Marginal.
- Set to 0 to disable the position map entirely.

**Coupled to:**
- `SCROLL_MODE_THRESHOLD` — defines the lower boundary.
- `useDataWindow` — switches between normal and two-tier mode based
  on whether total is in the position-map range.
- `SCROLL_SEEK_DEBOUNCE_MS` (200ms in useDataWindow.ts) — debounces
  scroll-triggered seeks in two-tier mode when scrolling past the buffer.

**Corpus scaling:** The threshold is on `total` (search result count).
A broad query on a 9M corpus returns 9M total → seek mode (no map).
A filtered query returning 40k → two-tier mode. **Not corpus-dependent.**

---

## 6. Timing & Cooldowns (constants/tuning.ts, useScrollEffects.ts)

| Knob | Value | Location | Purpose |
|---|---|---|---|
| `SEEK_COOLDOWN_MS` (seek data arrival) | **100ms** | constants/tuning.ts:115 | Prevent extends during seek settle |
| `SEEK_DEFERRED_SCROLL_MS` (after seek) | **150ms** (cooldown + 50) | constants/tuning.ts:125 | Re-fire reportVisibleRange after cooldown expires |
| `POST_EXTEND_COOLDOWN_MS` | **50ms** | constants/tuning.ts:144 | Space out backward extends to prevent cascading compensation |
| `SEARCH_FETCH_COOLDOWN_MS` (search/abort) | **2000ms** | constants/tuning.ts:156 | Prevent extends during search/reset |
| Density-switch cooldown | **2000ms** | useScrollEffects.ts:737 (via abortExtends) | Prevent extends during density settle |
| `AGG_DEBOUNCE_MS` | **500ms** | constants/tuning.ts:163 | Debounce aggregation fetches |
| `AGG_CIRCUIT_BREAKER_MS` | **2000ms** | constants/tuning.ts:166 | Disable auto-fetch if aggs are slow |
| `NEW_IMAGES_POLL_INTERVAL` | **10,000ms** | constants/tuning.ts:159 | Ticker poll interval |
| `SCROLL_SEEK_DEBOUNCE_MS` | **200ms** | useDataWindow.ts:61 | Debounce scroll-triggered seeks in two-tier mode |
| `EXTEND_AHEAD` (detail/fullscreen) | **20** | useImageTraversal.ts:57 | Proactive extend trigger during image traversal |
| Search query debounce | **300ms** | SearchBar.tsx:60 | Debounce CQL input → URL update |
| Prefetch throttle gate | **150ms** | image-prefetch.ts:60 | Skip prefetch batches at held-key speed |
| Tooltip flash suppression | **1500ms** | Scrubber.tsx:323 | Tooltip fade after seek |

**Corpus scaling:** The timing values are UI-feel constants, not
corpus-dependent. The only exception is `AGG_CIRCUIT_BREAKER_MS` — if
aggregations on 9M PROD take >2s, the circuit breaker trips and disables
auto-fetch. **Monitor agg response times on PROD.**

---

## 7. Layout Constants (constants/layout.ts)

| Knob | Value | Location |
|---|---|---|
| `TABLE_ROW_HEIGHT` | **32px** | constants/layout.ts:15 |
| `TABLE_HEADER_HEIGHT` | **45px** | constants/layout.ts:18 |
| `GRID_ROW_HEIGHT` | **303px** | constants/layout.ts:21 |
| `GRID_MIN_CELL_WIDTH` | **280px** | constants/layout.ts:24 |
| `GRID_CELL_GAP` | **8px** | constants/layout.ts:28 |
| Fallback loadMore threshold | **500px** | useScrollEffects.ts:357 |

**These are design constants, not tuning knobs.** They define the visual
grid and are coupled to Tailwind classes (h-8, h-11, etc). Changing them
requires coordinated CSS changes.

**Coupled to:** Everything. The density-focus save/restore math, scroll
compensation, virtualizer row height, column count calculation, and all
E2E test assertions use these values.

---

## 8. Aggregation (constants/tuning.ts)

| Knob | Value | Location |
|---|---|---|
| `AGG_DEFAULT_SIZE` | **10** | constants/tuning.ts:169 |
| `AGG_EXPANDED_SIZE` | **100** | constants/tuning.ts:172 |

### AGG_DEFAULT_SIZE (10)

**What it does:** Number of buckets returned per field in the batched
facet filter aggregation request. Showing top 10 values per field.

**Corpus scaling:** At 9M PROD, the top 10 values cover a larger share
of the corpus (power law). The values themselves may be different. **No
change needed — the "Show more" button fetches 100.**

---

## 9. Source Filtering (es-config.ts)

| Knob | Value | Location |
|---|---|---|
| `SOURCE_EXCLUDES` | `["fileMetadata.exif", "fileMetadata.exifSub", "fileMetadata.getty", "embedding"]` | dal/es-config.ts:46 |
| `SOURCE_INCLUDES` | `[]` (empty) | dal/es-config.ts:66 |

**What it does:** Strips heavy fields from ES responses. EXIF metadata,
Getty metadata, and the 1024-dim embedding vector are never displayed.
Each excluded field can be 2-50KB per document.

**Performance impact:** Critical. Without excludes, each document is
~50-100KB (per es-config.ts measurements). With excludes, ~5-10KB.
At PAGE_SIZE=200, that's **10-20MB** vs **1-2MB** per request — a 10×
reduction. Over SSH tunnel this is the difference between 2s and 200ms.

**Corpus scaling:** Not corpus-dependent — per-document size is constant.

---

## 10. Docker ES Settings (load-sample-data.sh)

| Setting | Value | Location |
|---|---|---|
| `max_result_window` | **500** | load-sample-data.sh:155 |
| ES port | **9220** | docker-compose.yml |

**Purpose:** Forces E2E tests to exercise the deep seek path. Real
clusters use the default 100,000 (overridden by `start.sh --use-TEST`).

---

## Coupling Map — What Breaks What

```
BUFFER_CAPACITY ─────┬── scroll range geometry (density-focus drift)
                     ├── SCROLL_MODE_THRESHOLD (must be ≤)
                     ├── PAGE_SIZE (must be <)
                     └── EXTEND_THRESHOLD (% of capacity)

PAGE_SIZE ───────────┬── prepend compensation magnitude
                     ├── binary search convergence tolerance
                     ├── scroll-mode fill chunk count
                     └── network payload per extend

overscan ────────────┬── DOM churn per scroll frame
                     ├── blank flash frequency (inversely)
                     └── jank severity

MAX_RESULT_WINDOW ───── DEEP_SEEK_THRESHOLD (must be ≤)
                     └── ES index setting (must match)

DEEP_SEEK_THRESHOLD ─── seek path selection (shallow vs deep)

SCROLL_MODE_THRESHOLD ── POSITION_MAP_THRESHOLD (must be <)
                      └── BUFFER_CAPACITY (must be ≤)

POSITION_MAP_THRESHOLD ── two-tier vs seek mode boundary
                        ├── useDataWindow mode selection
                        └── position map memory budget

Seek cooldowns ──────── extend suppression window
                     └── scroll handler re-fire timing
```

---

## Dynamic Changeability

| Category | Can change at runtime? | Should we? |
|---|---|---|
| Buffer/page sizes | No (constants, need rebuild) | Could make env-var-driven. Low value — these are stable. |
| Seek thresholds | Yes (env vars, need restart) | Already done for local vs real. |
| Scroll/position-map thresholds | Yes (env vars, need restart) | Already done — `VITE_SCROLL_MODE_THRESHOLD`, `VITE_POSITION_MAP_THRESHOLD`. |
| Overscan | No (constant, need rebuild) | Table was tuned to 15 empirically. Grid at 5 is optimal. Stable. |
| Timing/cooldowns | No (constants) | No reason to. These are UI-feel values. |
| Layout constants | No (tied to CSS) | No. Design decisions. |
| Source excludes | No (constant) | Could be env-driven. Low value. |

---

## Recommendations for PROD (9M docs)

1. **No buffer/page changes needed.** The windowed buffer is position-
   independent — it works identically at 10k, 1.3M, and 9M.

2. **Monitor keyword seek times.** With potentially 200k unique credits,
   the composite walk needs 20 pages. If SSH tunnel latency is high,
   the 8s TIME_CAP may need increasing.

3. **Monitor agg circuit breaker.** If batched aggs on 9M take >2s,
   the filter panel will show "Refresh" instead of auto-updating.
   Consider increasing AGG_CIRCUIT_BREAKER_MS or reducing AGG_FIELDS.

4. **Monitor getKeywordDistribution coverage.** With MAX_PAGES=5 and
   BUCKET_SIZE=10k, only 50k unique values are fetched for the tooltip.
   High-cardinality fields may show "?" beyond that. Increase MAX_PAGES
   if needed.

5. **The overscan/flash trade-off is view-specific.** Table overscan
   was bumped from 5→15 because table rows are cheap (32px, minimal
   DOM). Grid stays at 5 (303px rows with thumbnails are expensive).
   The grid's 5 × 303px = 1,515px headroom is already generous.

---

## Experiments Infrastructure

Automated A/B testing of tuning knobs. Agent-driven, human-supervised.

### Files

| File | Purpose |
|---|---|
| `playwright.experiments.config.ts` | Playwright config — headed browser, no safety gate, long timeouts |
| `e2e-perf/experiments.spec.ts` | Experiment scenarios (E1–E6) with full probe collection |
| `e2e-perf/results/experiments/` | JSON result files, one per run |
| `e2e-perf/results/experiments/experiments-log.md` | Human-readable comparison tables |

### How to run (agent workflow)

```bash
# 1. Human starts the app (local or TEST)
./scripts/start.sh                # local, 10k docs
./scripts/start.sh --use-TEST    # real, 1.3M docs

# 2. Agent runs baseline
npx playwright test --config playwright.experiments.config.ts --reporter=list

# 3. Agent modifies a knob (e.g. overscan in ImageTable.tsx)
# 4. Vite HMR reloads
# 5. Agent sets env var and runs again
EXP_OVERSCAN_TABLE=8 npx playwright test --config playwright.experiments.config.ts -g "E1" --reporter=list

# 6. Agent reverts the source change
# 7. Agent compares JSON files and writes to experiments-log.md
```

### What each experiment measures

| Experiment | Scenario | Key metrics |
|---|---|---|
| **E1** | Table scroll — slow/fast/turbo | flashes, severe jank, maxFrame, domChurn, scroll velocity |
| **E2** | Grid scroll — slow/fast/turbo | flashes, severe jank, maxFrame, domChurn, scroll velocity |
| **E3** | Density switch baseline (seek + toggle 4×) | CLS, flashes, severe jank, extend counts |
| **E4** | Image detail traversal — slow/moderate/fast/rapid | traversal latency, prefetch timing, extend counts |
| **E5** | Fullscreen traversal — slow/moderate/fast/rapid | traversal latency, prefetch timing |
| **E6** | Smooth autoscroll — brisk/fast/turbo | flashes, jank, CLS, scroll velocity |

### Every result records

- Git commit hash + dirty flag (what code was running)
- ES source + total (local 10k vs TEST 1.3M)
- Knob values under test
- Full perf snapshot (CLS, LoAF, jank, DOM, scroll velocity, flashes, network)
- Store state (buffer offset, extend/evict counts)

### Experiment catalogue

| ID | Scenario | Status |
|---|---|---|
| E1 | Table scroll — slow/fast/turbo | Implemented |
| E2 | Grid scroll — slow/fast/turbo | Implemented |
| E3 | Density switch baseline | Implemented |
| E4 | Image detail traversal — slow/moderate/fast/rapid | Implemented |
| E5 | Fullscreen traversal — slow/moderate/fast/rapid | Implemented |
| E6 | Smooth autoscroll — brisk/fast/turbo | Implemented |

