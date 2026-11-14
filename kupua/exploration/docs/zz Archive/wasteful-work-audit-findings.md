# Wasteful-Work Audit — Findings

**Audit date:** 2026-06-09  
**Deliverable:** [wasteful-work-audit-handoff.md](wasteful-work-audit-handoff.md)  
**Status:** Report only — no code changes made, no tests run.

> **Reviewer notes applied 2026-05-23.** Section 5 rewritten with a do / verify / skip ranking. Two findings (F-08, F-09) demoted to "skip" with reasoning — see annotations on those items. F-05 split into "do the C5 part after verification, defer the C4 part." Two Appendix-A items (#1, #2) promoted to actionable. No findings deleted; the original numbering and analysis are preserved so any later implementer can revisit.

---

## Section 1 — Methodology

### Files read end-to-end (or near-complete)

| File | Coverage |
|---|---|
| `src/dal/es-adapter.ts` | Full (all methods: `_doSearch`, `countWithTickers`, `getById`, `getAggregation`, `getAggregations`, `getFilterAggregations`, `searchAfter`, `findKeywordSortValue`, `getKeywordDistribution`, `getByIds`) |
| `src/stores/search-store.ts` | Full (all state fields, module-level helpers, `search()`, `seek()`, `extendForward()`, `extendBackward()`, `restoreAroundCursor()`, `_fillBufferForScrollMode`, `_fetchPositionMap`, `_findAndFocusImage`, `_loadBufferAroundImage`, `buildPositions`, `evictPositions`, `buildTickerAggs`, `startNewImagesPoll`) |
| `src/lib/typeahead-fields.ts` | Full (`scopedAgg`, `storeBuckets`, `buildTypeaheadFields` all field resolvers) |
| `src/stores/collection-store.ts` | Full (`loadCollections`, `buildSubtreeCounts`) |
| `src/routes/search.tsx` | Lines 110–210 (scrubber integration, `fetchSortDistribution` / `fetchNullZoneDistribution` triggers) |
| `src/dal/es-config.ts` | Full (SOURCE_INCLUDES/EXCLUDES whitelist) |
| `src/hooks/useEnrichedImage.ts` | Full |
| `src/lib/derive-enriched-image.ts` | Full |
| `src/lib/image-prefetch.ts` | Full |
| `src/lib/image-urls.ts` | Full |
| `src/lib/lazy-typeahead.ts` | Full |
| `src/stores/enrichment-store.ts` | Full |
| `src/dal/null-zone.ts` | Full |

### Files sampled (key sections only)

| File | Sections read |
|---|---|
| `src/hooks/useDataWindow.ts` | Lines 280–350 (imagePositions reactive subscription, findImageIndex) |
| `src/hooks/useScrollEffects.ts` | Lines 100–300, lines 1040–1070 (imagePositions usage) |

### Tier coverage

- **Tier 1 (ES request layer, store actions):** Deep. Every ES-issuing method read.
- **Tier 2 (components, hooks):** Partial. Key subscriptions verified; render bodies not read.
- **Tier 3 (lifecycle/leak hotspots):** Covered via grep results; bodies not fully read.

### Prior context loaded

- `exploration/docs/es-audit.md` — 9 issues, 4 fixed. Issues #5 (composite walk) and #7 (poll) are known-unresolved and appear here as F-07 and F-04.
- `exploration/docs/component-detail.md` — architecture overview.

---

## Section 2 — Findings

Severity: **W1** = large waste on hot path, **W2** = meaningful waste on common path, **W3** = minor polish.  
Frequency: **F-Always** = every session/action, **F-Common** = most search sessions, **F-Edge** = specific conditions only.

---

### ✅ F-01 — `track_total_hits: true` hardcoded in every `searchAfter` call

| Field | Value |
|---|---|
| File:line | `src/dal/es-adapter.ts:950` |
| Category | C1 oversized fetch |
| Severity | **W1** |
| Frequency | **F-Always** (every scroll-triggered extend, seek, restore, scroll-mode fill) |
| Confidence | High |

**Waste:** `track_total_hits: true` forces Elasticsearch to count every matching document (up to 9M) for every `searchAfter` call. After the initial `_doSearch`, the total is already stored in the Zustand store. Subsequent calls — `extendForward`, `extendBackward`, `seek`, `restoreAroundCursor`, `_fillBufferForScrollMode`, and the sort-around-focus steps — all receive and mostly ignore `result.total`.

Concrete code at `es-adapter.ts:950`:
```
const body: Record<string, unknown> = {
  query,
  sort: effectiveSort,
  size: params.length ?? 200,
  track_total_hits: true,   // ← always set, no way to disable
};
```

The total IS used in one legitimate sub-case: `_fillBufferForScrollMode` updates `total: nz ? state.total : result.total` in case it drifted — but this protection is redundant when the frozen-until cap is applied (which it is). `extendForward` and `extendBackward` also write `result.total` back to the store on every extend; with the frozen-until cap these should be identical to the pre-extend total.

On TEST with ~65k images, the count scan overhead is modest. On PROD with 9M images this is measurable per-request overhead on every scroll event that triggers an extend.

**Fix sketch:** Add a `trackTotalHits: boolean` parameter to `searchAfter` (default `false`). Set it to `true` only in `_doSearch` (the initial search). All other callers omit the flag or pass `false`.

---

### ✅ F-02 — `buildFreeFilter(guardianConfig)` rebuilds static ES filter object on every `buildQuery` invocation

| Field | Value |
|---|---|
| File:line | `src/dal/es-adapter.ts:133` (function), `:498` (callsite) |
| Category | C4 redundant recomputation |
| Severity | **W2** |
| Frequency | **F-Always** (every search, extend, seek, count, agg, fill) |
| Confidence | High |

**Waste:** `buildFreeFilter` is called inside `buildQuery`, which is called for every ES request. The function:
1. `Object.entries(config.categoryDefaultCost)` → filter → map → new array
2. `config.freeSuppliers.filter(...)` × 2 → two more new arrays
3. Loop over `suppliersWithExcl` → builds nested `bool.must` objects
4. Constructs the final `{ bool: { should: [...], minimum_should_match: 1 } }` object

All inputs (`config.categoryDefaultCost`, `config.freeSuppliers`, `config.suppliersCollectionExcl`) are from `guardian-config.json` — static JSON imported at module load, never mutated. The result is identical on every invocation.

`buildQuery` is called by: `_doSearch`, `countWithTickers`, `getAggregations`, `getFilterAggregations`, and indirectly by `searchAfter` via `buildQuery`. A typical scroll session with 20 extends, one search, and panel agg = ~22+ calls to `buildQuery` → 22+ full rebuilds of the same filter object.

**Fix sketch:** Move the computation to module scope:
```typescript
// Top of es-adapter.ts, after guardianConfig import
const FREE_FILTER = buildFreeFilter(guardianConfig as GuardianCostConfig);
```
Reference `FREE_FILTER` in `buildQuery` instead of calling `buildFreeFilter(...)`.

---

### ✅ F-03 — `buildTickerAggs()` calls `parseCql(def.searchClause)` on every search and every 10s poll tick

| Field | Value |
|---|---|
| File:line | `src/dal/es-adapter.ts:378` (function), `:693` (`_doSearch` callsite), `:752` (`countWithTickers` callsite) |
| Category | C4 redundant recomputation |
| Severity | **W2** |
| Frequency | **F-Common** (each search) + **F-Always** (each 10s poll) |
| Confidence | High |

**Waste:** `buildTickerAggs` loops over `gridConfig.tickerDefinitions` and calls `parseCql(def.searchClause)` for each ticker. `parseCql` tokenizes and converts a CQL expression string into an Elasticsearch bool query. `gridConfig.tickerDefinitions` is static runtime config. The result of `buildTickerAggs()` never changes between calls.

Called at:
- `_doSearch` (line 693): every `search()` action
- `countWithTickers` (line 752): every 10s poll tick = 6 calls/min/tab

If there are 3 ticker definitions (e.g. "GNM-owned", "agency picks", "under-quota"), that's 3 `parseCql` invocations × 6 poll ticks/min = **18 `parseCql` calls/minute** on static strings, producing the same output every time.

**Fix sketch:**
```typescript
// Module scope, after gridConfig import
const TICKER_AGGS: Record<string, unknown> | null = buildTickerAggs();
```
Replace calls to `buildTickerAggs()` with `TICKER_AGGS`. Function body can remain as a named function for clarity.

---

### ✅ F-04 — New-images poll fires unconditionally — no `document.visibilityState` guard

| Field | Value |
|---|---|
| File:line | `src/stores/search-store.ts:startNewImagesPoll` (the `setInterval` + tick function) |
| Category | C6 polling without lifecycle awareness |
| Severity | **W2** |
| Frequency | **F-Always** (fires 6 requests/min/tab as long as the tab is open) |
| Confidence | High |

**Waste:** `startNewImagesPoll` sets a `setInterval(tick, NEW_IMAGES_POLL_INTERVAL)` with no check for `document.visibilityState`. The `tick` function fires `countWithTickers` — a `_search size:0 + track_total_hits:true + ticker filter aggs` request — every 10 seconds regardless of whether the tab is visible.

An editor with 5 search tabs open generates **30 `_search` requests/minute** to the ES cluster for results they cannot see. Each request includes all ticker aggregations. On TEST, 30 requests/min at ~20ms each = 600ms ES-time per minute serving invisible polls.

This issue was previously identified as es-audit.md Issue #7 ("New-images poll runs unconditionally every 10s on real ES") at severity LOW. It remains unresolved.

The tick correctly checks `if (gen !== _newImagesPollGeneration) return` (stale-gen guard) and silently discards errors, but has no visibility guard.

**Fix sketch:**
```typescript
function startNewImagesPoll(get, set, skipInitialTick = false) {
  stopNewImagesPoll();
  const gen = ++_newImagesPollGeneration;

  const tick = async () => { /* existing logic */ };

  // Pause when tab is hidden, resume when visible
  const handleVisibility = () => {
    if (document.visibilityState === "visible") tick();
    // setInterval continues — next tick will self-abort if still hidden
    // Alternative: clearInterval + restart for strict pause semantics
  };
  document.addEventListener("visibilitychange", handleVisibility);

  // In tick(), add:
  if (document.visibilityState === "hidden") return;

  _newImagesPollTimer = setInterval(tick, NEW_IMAGES_POLL_INTERVAL);
}
```
Simplest version: add `if (document.visibilityState === "hidden") return;` at the top of `tick`. The interval still fires (cheap `if` check) but no ES request is issued for hidden tabs.

---

### ✅ F-05 (C5 only) — `imagePositions` Map rebuilt by full O(n) copy on every extend/seek, triggering re-renders in `useDataWindow` and search route

| Field | Value |
|---|---|
| File:line | `src/stores/search-store.ts:buildPositions` (~line 3950), `evictPositions` (~line 3965); consumers: `src/hooks/useDataWindow.ts:310`, `src/routes/search.tsx:262` |
| Category | C4 redundant recomputation + C5 excess re-renders |
| Severity | **W2** |
| Frequency | **F-Common** (every scroll-triggered extend; ~10–20 per active scroll session) |
| Confidence | High |

**Waste (C4):** `buildPositions` always does `new Map(existing)` — a full copy of up to BUFFER_CAPACITY (1000) entries — then iterates the new hits to add entries. For `extendForward` with eviction, `evictPositions` performs another full copy. Per extend with eviction: **~2,200 Map-entry operations** (copy 1000 + add 200 new + copy again + delete evicted). These create new Map objects (GC pressure) for an operation that only needs to add ~200 entries and remove ~200 entries from the same logical structure.

**Waste (C5):** The new Map reference is written to Zustand state on every extend. Two components subscribe to `imagePositions` reactively:

- `useDataWindow.ts:310`: `const imagePositions = useSearchStore((s) => s.imagePositions)` — reactive selector
- `search.tsx:262`: `const imagePositions = useSearchStore((s) => s.imagePositions)` — reactive selector

Both fire a React re-render every time the Map reference changes (i.e., on every extend, seek, and search). `useDataWindow` is used by `ImageGrid` and `ImageTable` — the two heaviest render paths in the app.

By contrast, all other `imagePositions` consumers in the codebase read it imperatively via `useSearchStore.getState()`:
- `FullscreenPreview.tsx:123`, `useImageTraversal.ts:94`, `ImageGrid.tsx:511`, `useScrollEffects.ts:1054`

These do not cause re-renders. The two reactive subscribers are the outliers.

**Fix sketch (C5, easy win):**  
In `useDataWindow.ts` and `search.tsx`, change:
```typescript
// Before (reactive, re-renders on every extend)
const imagePositions = useSearchStore((s) => s.imagePositions);

// After (imperative, no subscription)
// Read inside the callback only:
const findImageIndex = useCallback((id: string) => {
  return useSearchStore.getState().imagePositions.get(id) ?? null;
}, []); // stable reference — always reads current state
```
Then remove `imagePositions` from the deps array of any downstream `useCallback`/`useMemo` that only needs it inside a callback.

**Fix sketch (C4, harder):** The Map copy could be avoided by maintaining it as mutable module-level state (like `_newImagesPollTimer`), but this requires careful isolation from Zustand's immutability contract for the fields that ARE subscribed to.

> **Reviewer (2026-05-23):** Split this into two pieces of work.
> - **C5 (reactive subscriptions) — do after verification.** Before applying, grep both `useDataWindow.ts` and `search.tsx` for every `imagePositions` reference and confirm each is inside a `useCallback` / event handler / imperative block. If `imagePositions` is read directly in render (e.g. in JSX, in a `useMemo` body that returns rendered data, or in a derived value used by render), switching to `getState()` will silently render stale data. Auditor only sampled lines 280–350 of `useDataWindow.ts`; render body unread. 5-minute check before commit.
> - **C4 (Map copy) — defer.** A Map of ≤1000 entries copied per extend is not the win it sounds like, and the fix conflicts with Zustand's immutability contract. Don't take it on without a measured render-time problem.

---

### F-06 — `getAggregations({}, [{field: "collections.pathId", size: 6000}])` issues `match_all` + 6000-bucket request on every post-reload Collections panel open

| Field | Value |
|---|---|
| File:line | `src/stores/collection-store.ts:135` |
| Category | C1 oversized fetch |
| Severity | **W2** |
| Frequency | **F-Common** (first panel open after each page load; `status` resets to "idle" on reload because it is excluded from `partialize`) |
| Confidence | Medium (actual collection count on PROD unknown) |

**Waste:** `dataSource.getAggregations({}, [{ field: "collections.pathId", size: 6000 }])` runs with empty `{}` params, which `buildQuery({})` converts to `{ match_all: {} }`. ES must scan all 9M images to count document frequency per collection path. The `size: 6000` requests up to 6000 unique `collections.pathId` values.

The actual Guardian collection tree is likely far smaller (hundreds to low thousands of paths). `size: 6000` is a generous ceiling that:
1. Requests a large term-count computation regardless of the actual cardinality
2. Returns a potentially large response payload

On every page reload, when the Collections panel is opened, this full aggregation refires. The tree and counts ARE persisted to sessionStorage, but `status` is not persisted — so `loadCollections` guard `if (status === "loading" || status === "ready") return` never fires on reload.

**Fix sketch:**  
1. Audit actual unique path count on TEST/PROD before changing anything. If count is <500, set `size: 1000`.  
2. Consider persisting `status` across reloads (with a TTL or ETag) to skip the re-fetch when the tree hasn't changed.  
3. If the collection count is legitimately in the thousands, no change to `size` is warranted — but consider whether the re-fetch on every reload is necessary given that collections change rarely.

---

### F-07 — `seek()` deep-path first scrubber drag: up to 50+ sequential ES requests (keyword sort, >65k results)

| Field | Value |
|---|---|
| File:line | `src/stores/search-store.ts:seek()` deep path + `src/dal/es-adapter.ts:findKeywordSortValue` |
| Category | C9 wasted round-trips |
| Severity | **W2** |
| Frequency | **F-Edge** (keyword sort, total > POSITION_MAP_THRESHOLD, first scrubber interaction) |
| Confidence | High |

**Waste:** On first scrubber drag with a keyword sort and >65k results:

1. `seek()` awaits `fetchSortDistribution()` (needed for null-zone detection). This triggers the composite agg walk in `getKeywordDistribution`: up to 5 sequential composite agg pages (50k buckets total). ~5 requests.
2. `findKeywordSortValue`: walks composite agg pages to locate the bucket containing the target position. Up to `MAX_PAGES = 50` sequential composite agg requests (~1 page per 1k unique values). For a field like `credit` with 5k unique values, that's ~5 requests. For `supplier` with 50k+ unique values, this hits the cap.
3. `searchAfter` for the actual page contents. ~1 request.
4. `countBefore` to verify actual landing position. ~1 request.

**Total: 5 + up to 50 + 1 + 1 = up to 57 sequential ES requests.**

On TEST at ~20ms per request, this is up to ~1.1 seconds minimum. On PROD under load, 50 sequential requests could be 2–5 seconds.

Note: `fetchSortDistribution` and the seek itself are currently sequential (await at `seek()` line `await get().fetchSortDistribution()`), even though the distribution is only needed for null-zone detection — it could be parallelized with the composite walk in some cases.

**Fix sketch:** 
- Cap `MAX_PAGES` in `findKeywordSortValue` at a lower value (e.g. 20) and document the behaviour when the cap is hit.
- The distribution fetch and keyword seek could run in parallel when the null-zone boundary is clearly outside the target range.
- Long-term: the position map (which already handles this case efficiently for ≤65k results) is the right solution. For >65k with keyword sorts, consider raising `POSITION_MAP_THRESHOLD` if memory permits.

---

### F-08 — Binary search refinement in `seek()`: up to 50 sequential `countBefore` requests when keyword bucket is large

| Field | Value |
|---|---|
| File:line | `src/stores/search-store.ts:seek()`, binary search block (`MAX_BISECT = 50`) |
| Category | C9 wasted round-trips |
| Severity | **W2** |
| Frequency | **F-Edge** (keyword sort, large uniform bucket such as "credit:PA" with 400k docs) |
| Confidence | High |

**Waste:** After `findKeywordSortValue` returns a cursor and `countBefore` reveals a large drift (`|countBefore - fetchStart| > PAGE_SIZE`), the binary search refines position using the `id` tiebreaker field. Each bisect step fires one `countBefore` (`_count` query to ES) and awaits it before proceeding.

`MAX_BISECT = 50` allows up to 50 sequential `_count` requests. At ~5–10ms each on TEST, this is up to 500ms of serial round-trip latency just for position refinement.

The binary search converges when `|count - fetchStart| <= PAGE_SIZE`. For a 9M-doc index with uniformly distributed 40-char hex IDs, the `id` range [0x000000000000, 0xffffffffffff] (48 bits) achieves PAGE_SIZE (200) granularity in log₂(9,000,000 / 200) ≈ **15 bisect steps**, not 50.

**Fix sketch:** Set `MAX_BISECT = 20`. This is more than sufficient for convergence on any real-world dataset size and halves the worst-case latency. Add a comment explaining the convergence bound calculation.

Alternatively (more complex): run 2–3 parallel `countBefore` probes per bisect iteration, then pick the best.

> **Reviewer (2026-05-23) — skip.** `MAX_BISECT = 50` is a *safety cap*, not a per-call cost. The auditor's own math says convergence happens in ~15 steps in practice, which means the cap doesn't fire in normal operation. Lowering it to 20 saves zero latency unless something is going wrong — in which case you'd want to know about it, not silently hit a lower cap. Better fix: add a `devLog` (or counter) when bisect exceeds 20 steps, so we learn whether real users ever hit it. Until then, no change.

---

### F-09 — `fetchNullZoneDistribution` `useEffect` in search route: condition `sortDistribution.coveredCount < total` persists across renders, risking re-fires on total changes

| Field | Value |
|---|---|
| File:line | `src/routes/search.tsx:152–157` |
| Category | C2 over-fetching by frequency |
| Severity | **W3** |
| Frequency | **F-Common** (any search result with a null zone in the sort) |
| Confidence | Medium |

**Waste:** The `useEffect` in `search.tsx`:
```typescript
useEffect(() => {
  if (sortDistribution && sortDistribution.coveredCount < total) {
    fetchNullZoneDistribution();
  }
}, [sortDistribution, total, fetchNullZoneDistribution]);
```

This fires whenever `total` changes while `sortDistribution` is loaded and has `coveredCount < total`. The `total` can legitimately change when:
- A new search returns a different total
- `extendForward`/`extendBackward` writes `result.total` back to the store (finding F-01 explains this happens even when total hasn't changed)

`fetchNullZoneDistribution` has an internal cache-key guard (`_nullZoneDistCacheKey` compared to `sortDistCacheKey(params)`) that prevents redundant ES requests, so this is unlikely to cause actual duplicate ES calls in practice. The concern is marginal: an ES call guard is present. However, the effect structure makes reasoning about it non-obvious and the guard could be weakened in a future edit.

**Fix sketch:** Add an explicit guard inside the effect before the function call:
```typescript
useEffect(() => {
  if (
    sortDistribution &&
    sortDistribution.coveredCount < total &&
    !nullZoneDistribution  // don't re-fire if already loaded
  ) {
    fetchNullZoneDistribution();
  }
}, [sortDistribution, total, fetchNullZoneDistribution, nullZoneDistribution]);
```
Or: move the null-zone auto-fetch logic into `fetchSortDistribution` in the store (it already has the context), removing the `useEffect` in the route entirely.

> **Reviewer (2026-05-23) — skip.** The auditor said the quiet part out loud: "internal cache-key guard prevents redundant ES requests, so this is unlikely to cause actual duplicate ES calls in practice." That's the answer. The proposed fix is defensive programming for a non-issue and adds a new effect dep (`nullZoneDistribution`) which is itself a re-fire risk. Closing the audit on this one.

---

## Section 3 — Waste Clusters

### Cluster A: `track_total_hits` overuse (F-01 alone, but affects multiple call sites)

F-01 is the only entry but touches the most call sites: `extendForward`, `extendBackward`, `_fillBufferForScrollMode`, `restoreAroundCursor`, `_findAndFocusImage` steps 1–2, and the seek() position-map path. A single parameter addition to `searchAfter` fixes all of them simultaneously. **Highest ROI fix in the codebase.**

### Cluster B: Static config rebuilt on every request (F-02, F-03)

Both `buildFreeFilter` and `buildTickerAggs` take static, never-changing input and produce static, never-changing output. Both are called on every ES request or every 10s poll. Both fixes are mechanical (hoist to module scope). **Should be done together in one commit.**

### Cluster C: Sequential ES round-trips in deep seek (F-07, F-08)

F-07 and F-08 are related: F-07 is the composite-agg walk phase (up to 50 pages) and F-08 is the binary-search refinement phase (up to 50 `_count` requests). Both compound when the user drags the scrubber on a keyword sort with a large, uniform bucket. F-08 fires AFTER F-07 completes. Together they can produce >100 sequential ES requests for a single scrubber drag. **F-08 fix (cap MAX_BISECT at 20) is trivial and should be done immediately. F-07 requires more analysis.**

### Cluster D: Unnecessary re-renders from imagePositions subscription (F-05)

The C5 re-render part of F-05 is isolated to two subscription sites. Converting those two to `getState()` reads is a tiny change with disproportionate impact: it eliminates all re-renders of `ImageGrid` and `ImageTable` caused by `imagePositions` reference changes on every extend/seek.

---

## Section 4 — Files Not Audited (Coverage Gaps)

The following files were not read. Tier 3 file bodies may contain additional wasteful patterns not captured here.

| File | Reason not read | Risk |
|---|---|---|
| `src/components/ImageGrid.tsx` | Body too large; only specific usages confirmed via grep | Medium — ResizeObserver cleanup, render frequency during extends |
| `src/components/ImageTable.tsx` | Not read | Medium — column measurement, ResizeObserver |
| `src/components/Scrubber.tsx` | Not read | Low — tick computation per drag event |
| `src/components/FacetFilters.tsx` | Not read | Low — aggregation trigger patterns |
| `src/components/CqlSearchInput.tsx` | Not read beyond imports | Low — typeahead firing patterns |
| `src/hooks/useDataWindow.ts` | Lines 1–280 not read | Medium — full DataWindow construction logic |
| `src/stores/search-store.ts` — `fetchAggregations` | Lines ~3640–3700 not read | Low — debounce/circuit-breaker logic |
| `src/stores/search-store.ts` — `fetchSortDistribution` / `fetchNullZoneDistribution` bodies | Not read | Low — cache-key logic already confirmed via grep |
| `src/lib/grid-api/` directory | Not read | Low — Grid API proxy calls; graceful-absence architecture limits waste |
| `e2e-perf/` results | Not read | Low — empirical data, not source analysis |

### Empirical regressions not explained by findings (added 2026-05-23, from e2e-perf cross-reference)

The following regressions are visible in the `e2e-perf` historical data but are **not explained by any finding in this audit**. They represent coverage gaps in the audit's scope, not known-benign behaviour.

| Regression | Perf test | Baseline (entry 23, Apr 24) | Current (entry 34, May 23) | Appeared at | Likely unaudited path |
|---|---|---|---|---|---|
| **JA3 metadata-click 3.5× slower** | `perceived-log` long journey `JA3` (action: `metadata-click`) | settled 287ms | settled 988ms | "Mid-cost work" (entry 28–29, May 8) | Detail-panel mount + enrichment render path on metadata tab click. Audit read `useEnrichedImage.ts` and `derive-enriched-image.ts` (data derivation) but NOT the component render tree that fires when `JA3` clicks metadata — likely `ImageDetail` or similar panel component, plus any new cost/syndication/lease overlays added May 8. |
| **P14a/P14b LoAF doubled (selection/facet tests)** | `audit-log` jank tests `P14a`, `P14b` (LoAF blocking) | P14a 150ms, P14b 147ms | P14a 339ms, P14b 403ms | Gradual — grew across entries 26–34 (selections, cost, syndication, leases, tickers) | Ticker-poll-triggered re-renders of the facet panel with heavier render tree. Each 10s poll updates ticker counts → `FacetFilters` re-renders → now includes cost overlays, syndication badges, lease indicators on visible grid cells. G-02 (`findFieldTerm` double-computation) compounds this but auditor couldn't measure `findFieldTerm` cost. The LoAF doubling suggests cumulative render overhead from newly-added enrichment UI, not a single wasteful ES call. |

**Action:** JA3 warrants a focused 30-minute investigation (profile the metadata-click transition, identify what blocks or delays the render that didn't exist before May 8). P14 LoAF should be re-measured after items 1–4 of Section 5 land; if it doesn't improve, read `findFieldTerm` body and profile a ticker-poll-triggered render of `FacetFilters` with all overlays visible.

---

## Section 5 — Suggested action order (reviewer rewrite, 2026-05-23)

Original "first three fixes" replaced with a do / verify / skip ranking. Reasoning per item lives on the finding itself.

### Do now — cheap, safe, high signal

| # | Finding | Why first | Effort | Suggested commit |
|---|---|---|---|---|
| ✅ 1 | **F-01** — `trackTotalHits` param on `searchAfter`, default `false` | The headline finding; 9M-doc count scan on every extend/seek/fill. Default-false means only one call site changes (initial `search()` page passes `true`). | ~10 min | `perf: stop tracking total hits on every searchAfter (audit F-01)` |
| ✅ 2 | **F-02 + F-03** — hoist `buildFreeFilter` and `buildTickerAggs` to module scope | Both take static immutable JSON config and produce static output; both are rebuilt on every ES request / poll tick. Pure mechanical refactor. | ~10 min | `refactor: hoist static ES request fragments to module scope (audit F-02, F-03)` |
| ✅ 3 | **F-04 + App. A #2** — visibility guard on new-images poll + AbortSignal on collection load | F-04: cuts pointless cluster load from hidden tabs (5-tab user = 30 req/min the cluster doesn't need to answer). App. A #2: panel open/close during a 6000-bucket agg currently can't cancel. Both small, both visible to other Guardian editors via cluster load. Use the simple `if (document.visibilityState === "hidden") return` at the top of `tick` — skip the addEventListener variant (lifecycle bugs, no extra value). | ~15 min | `perf: avoid wasted work in hidden tabs and uncancelable collection load (audit F-04, App. A #2)` |

### Do after a 5-minute verification

| # | Finding | Verification |
|---|---|---|
| ✅ 4 | **F-05 (C5 part only) + G-01** — convert `imagePositions` reactive subscriptions to `getState()` | `useDataWindow.ts` is already verified safe by Section 6.3 (auditor read all 543 lines; `imagePositions` only used inside `findImageIndex`). `search.tsx:262` still needs the 5-minute grep before applying there: confirm every `imagePositions` reference is inside a `useCallback`/event handler/imperative block. **Same code change closes G-01 for free** — making `findImageIndex` stable (via `getState()` reads) stops the sort-around-focus `useLayoutEffect` from re-firing on every extend. One commit, both findings. |

### Investigate before deciding

| # | Finding | What to gather |
|---|---|---|
| 5 | **F-06** — 6000-bucket collection request | One TEST query with `size: 1`: read `doc_count_error_upper_bound` and `sum_other_doc_count` to learn the real cardinality. Then decide whether to lower `size`, persist `status` across reloads, both, or neither. Don't change the number blind. |
| 6 | **App. A #1** — `getById` uses `_search` instead of `GET /_doc/{id}` | 30-second grep: is it called from product code? If dead, hand to next dead-code pass. If alive, micro-fix. Either way the open question closes. |
| 7 | **G-02** — `IsSection` double-computes `findFieldTerm` + count per option | Auditor explicitly couldn't measure `findFieldTerm` cost (6.1: "Could not assess: actual cost of `findFieldTerm` CQL string parsing"). Without that, "14 calls instead of 7" is meaningless — could be 14μs or 14ms. **Read `findFieldTerm` body for ~1 minute.** If it's a cheap string scan, skip the fix as noise. If it parses CQL into an AST per call, fix it (7 options × 2 × 6 ticker-polls/min = real CPU on a panel that stays open all session). |

### Skip — reasoning on the findings

- **F-08** (cap `MAX_BISECT` 50→20) — safety cap, doesn't fire in practice. Lowering it is theatre. Add a `devLog` if you want to learn whether the cap is ever hit.
- **F-09** (double-guard `fetchNullZoneDistribution` effect) — the existing cache-key guard already prevents the duplicate ES call. Proposed fix adds a new effect dep that is itself a re-fire risk.
- **G-03** (scrubber tooltip timer cleanup) — auditor's own words: "React 18 ignores it silently, so user impact is nil." Same shape as F-09: defensive hygiene dressed as perf. If you want it, do it under a future "cleanup hygiene" pass, not under wasteful-work.
- **G-04** (`buildIsOptions()` per render) — auditor's own words: "trivial per-call but strictly unnecessary." Don't make a dedicated commit. Drive-by only: if anyone touches `FacetFilters.tsx` or `typeahead-fields.ts` for another reason, fix it then.

### Defer — design work, not a fix

- **F-07** (deep seek — up to 57 sequential ES requests on keyword sort, >65k results, first scrubber drag) — real concern, but the three proposed mitigations (cap `MAX_PAGES`, parallelise distribution + walk, raise `POSITION_MAP_THRESHOLD`) each have tradeoffs the audit didn't weigh. Don't action from this audit. Monitor whether real PROD-scale users actually hit slow scrubber drags here; revisit with profiling data. Worth re-doing as a focused mini-audit if it surfaces in real use.

### Coverage gap to close separately

See Section 4 — `ImageGrid.tsx`, `ImageTable.tsx`, `useDataWindow.ts` lines 1–280, `Scrubber.tsx`, `FacetFilters.tsx` are unread. The most likely hiding place for further findings is render-cost in virtualised list cells (same shape as F-05). A follow-up handoff for that scope exists below the main audit doc.

---

## Section 6 — Gap-close findings (render-cost in virtualised cells)

> **Immediate-action note:** G-01 should be done in the same commit as F-05 C5. Both target `findImageIndex` in `useDataWindow.ts`; fixing F-05 C5 automatically closes G-01 at no extra cost.

### 6.1 Methodology used

Files read end-to-end: `src/hooks/useDataWindow.ts` (lines 1–543, full), `src/components/ImageGrid.tsx` (full, 942 lines), `src/components/ImageTable.tsx` (full, 1626 lines), `src/components/Scrubber.tsx` (full, 1222 lines), `src/components/FacetFilters.tsx` (full, 454 lines), `src/components/CqlSearchInput.tsx` (full, 531 lines). Additionally greps into `src/hooks/useScrollEffects.ts` (to trace `findImageIndex` deps) and `src/lib/typeahead-fields.ts` (to confirm `buildIsOptions` behaviour). No profiling; static analysis only. Could not assess: actual cost of `findFieldTerm` CQL string parsing (would require benchmarking), or render frame impact of `useLayoutEffect` firing in the commit phase (would require profiling).

### 6.2 Findings

Severity: **W1** = large waste on hot path, **W2** = meaningful waste on common path, **W3** = minor polish.
Frequency: **F-Always** = every session/action, **F-Common** = most search sessions, **F-Edge** = specific conditions only.

| # | Title | File:line(s) | Category | Severity | Frequency | What's done today | What's actually needed | Quantified waste | Confidence | Fix shape |
|---|---|---|---|---|---|---|---|---|---|---|
| ✅ G-01 | `findImageIndex` instability fires sort-around-focus `useLayoutEffect` on every extend | `useDataWindow.ts:449–458` (deps), `useScrollEffects.ts:851` (effect) | C5 excess re-renders | **W3** | **F-Always** (every extend/seek) | `findImageIndex` is a `useCallback` with `[imagePositions, bufferOffset, results.length, twoTier]` deps; all four change on extends, so it gets a new reference every extend; `useScrollEffects` has `findImageIndex` in the sort-around-focus `useLayoutEffect` deps | `findImageIndex` should be stable; sort-around-focus effect should only fire when `sortAroundFocusGeneration` changes | ~10–20 spurious synchronous `useLayoutEffect` runs per scroll session (each returns immediately via `if (sortAroundFocusGeneration === 0) return`; the real cost is one `useLayoutEffect` in the React commit phase per extend) | High | Read `imagePositions`, `bufferOffset`, `results`, `twoTier` imperatively via `getState()` inside `findImageIndex`, use `[]` deps (same as F-05 C5 fix sketch) |
| G-02 | `IsSection` re-derives `findFieldTerm` + count for every is: option twice per render | `FacetFilters.tsx:365–391` (filter pass), `FacetFilters.tsx:395–450` (render pass) | C4 redundant recomputation | **W3** | **F-Common** (every 10s ticker-poll re-render; every new search) | `visibleItems` filter pre-computes `findFieldTerm(currentQuery, "is", value)`, `isActive`, `isExcluded`, `tickerDef`, `count` for each option to decide "render section at all"; the render `.map()` over `isOptions` then recomputes all the same values per option before conditionally returning null | Compute each option's derived values once; use them in both the visibility check and the render | 2× `findFieldTerm` + 2× count-derivation per option per render; 7 options → 14 calls instead of 7; fires ~6 times/min when poll ticks with filters open | High | Make `visibleItems` carry `{value, existing, isActive, isExcluded, count, tickerDef}` objects; render uses them directly |
| G-03 | Scrubber tooltip timer (`tooltipTimerRef`) not cleared on component unmount | `Scrubber.tsx:329–340` (isDragging effect), `Scrubber.tsx:313–319` (flashTooltip) | C7 listener/observer leak | **W3** | **F-Edge** (unmount while 1.5s linger timer is running — navigating away after a scrubber drag) | `isDragging` `useEffect` sets `tooltipTimerRef.current = setTimeout(…, 1500)` but returns no cleanup; `flashTooltip` similarly sets the timer with no unmount-time cancel path | Clear the timer on unmount | 1 stale `setState` call per affected unmount; React 18 ignores it silently, so user impact is nil — but the timer closure and its React `setState` binding are retained until 1.5s after unmount | High | Add `return () => { if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current); }` to the `isDragging` `useEffect` |
| G-04 | `buildIsOptions()` called on every `IsSection` render despite module-level `IS_OPTIONS` constant existing in the same source file | `FacetFilters.tsx:365`, `src/lib/typeahead-fields.ts:83` | C4 redundant recomputation | **W3** | **F-Common** (every `FacetFilters` re-render with filters panel open) | `IsSection` calls `buildIsOptions()` in its render body each time; `typeahead-fields.ts` already computes `const IS_OPTIONS = buildIsOptions()` at module scope (line 83) but does not export it | Use the already-computed constant | 1 new array + 5–7 string allocations per render instead of 0; trivial per-call but strictly unnecessary | High | Export `IS_OPTIONS` from `typeahead-fields.ts`; import and use it in `FacetFilters.tsx` instead of calling `buildIsOptions()` per render |

### 6.3 Findings that can be definitively closed

**F-05 C5 — safe to apply in `useDataWindow.ts`.** Read all 543 lines. `imagePositions` is subscribed reactively at `useDataWindow.ts:312` and is used in exactly one place: inside the `findImageIndex` `useCallback` body (lines 449–458). It is **never** read directly in the render body, in a `useMemo` returning rendered data, or in any JSX expression. Converting to `useSearchStore.getState().imagePositions` inside `findImageIndex` and changing the deps to `[]` (or `[bufferOffset, results.length, twoTier]` if those still need refreshing — see note) is safe: the caller always gets the current Map at call time.

**Side effect:** A stable `findImageIndex` (empty or minimal deps) also closes **G-01** at no extra cost — the sort-around-focus `useLayoutEffect` in `useScrollEffects.ts:851` would no longer re-fire on extends.

**Note on the full stable-ref approach:** `bufferOffset`, `results.length`, and `twoTier` are also in `findImageIndex`'s current deps and all change on extends. Reading them via `getState()` too (along with `imagePositions`) would make `findImageIndex` fully stable (`[]` deps), eliminating all extend-triggered callback recreation. The F-05 C5 fix sketch already describes this pattern.

**`search.tsx:262` — not read end-to-end in this session.** Cannot confirm the reactive `imagePositions` usage there is inside a callback. Parent reviewer's 5-minute check instruction stands before applying the fix to `search.tsx`.

---

## Appendix A — Out-of-Scope Observations

(≤30 items, one line each. No refactor proposals. No claim of bugs unless explicitly stated.)

1. `getById` in `es-adapter.ts:771` uses `_search` with `terms:{id:[id]}, size:1` — a direct `_doc` GET would avoid query processing overhead (no call sites found in app code; may be dead).
2. ✅ `getAggregations` in `collection-store.ts` uses no AbortSignal — a rapid panel open/close during loading cannot cancel the in-flight 6000-bucket agg.
3. `_doSearch` (es-adapter.ts line ~688): `track_total_hits: true` is CORRECT here — needed for the initial total count. Not a finding.
4. `countWithTickers` (es-adapter.ts): `track_total_hits: true` is CORRECT here — the ticker needs an exact count. Not a finding.
5. `getAggregation` (es-adapter.ts:807) uses `match_all: {}` when `query` arg is `undefined`. In app usage, `getParams` is always wired in `buildTypeaheadFields`, so `scopedAgg` always provides params. This path is unreachable in normal operation.
6. `AGG_FIELDS` (search-store.ts line ~66) is already correctly hoisted to module scope (computed once). Good practice already applied.
7. `GUARDIAN_COST_CONFIG` in `derive-enriched-image.ts` is module-scoped. Good.
8. `image-prefetch.ts` is well-designed: cadence-aware, cancels out-of-radius in-flight requests, has session timeout cleanup. No waste found.
9. `image-urls.ts`: DPR detection at module load time (not per-request), three-tier step function. Clean.
10. `enrichment-store.ts`: No polling (background loop was removed 2026-05-10 per changelog). Intent-driven only. No waste found.
11. `lazy-typeahead.ts`: Value resolvers fire only after `:` is committed. Properly aborts previous requests. No eager evaluation. No waste found.
12. `useEnrichedImage.ts`: Ref-based memoization prevents recomputation unless image or overlay reference changes. Does not subscribe to search-store. Efficient.
13. `null-zone.ts`: Pure helper functions, no ES calls. No waste.
14. The `_fillBufferForScrollMode` sequential chunk loop sets `_extendForwardInFlight: true` while running — this correctly blocks the virtualizer from triggering overlapping extends. Intentional design.
15. `_fetchPositionMap` uses a dedicated PIT and abort controller, correctly isolated from the main range controller. Not a source of waste.
16. `extendBackward` column-alignment trim logic guards against the zero-result edge case. The guard prevents an infinite-extend-then-discard loop. Correct.
17. `buildPositions` and `evictPositions` create new `Map` objects for Zustand state immutability (finding F-05 covers the performance implication; the immutability requirement is legitimate).
18. `getAggregations` (es-adapter.ts:828) does NOT include `track_total_hits: true` — it reads `hits.total.value` from the default `track_total_hits: 10000` behaviour, which is sufficient for the agg-only purpose (count is not used for pagination). Correct.
19. `_doSearch` opens PIT and fires first search in `Promise.all` — good parallelism already in place.
20. `search()` correctly fires `countWithTickers` in parallel with the first search page via `Promise.all`. This is already optimally parallel.
21. The seek() bidirectional headroom pre-fetch (backward items prepended) is a one-off per seek, not per scroll tick. Not wasteful.
22. `parseSortField` is called many times inside `buildSortClause` and sort-related code. Each call is a small object key lookup. Not worth memoizing given the call frequency and cost ratio.
23. `extractSortValues` in extendForward/extendBackward eviction path: called once per eviction to recompute start/end cursors. Acceptable.
24. The `_aggCacheKey` / `aggCacheKey()` deduplication in `fetchAggregations` prevents redundant panel agg requests. Works correctly as-is.
