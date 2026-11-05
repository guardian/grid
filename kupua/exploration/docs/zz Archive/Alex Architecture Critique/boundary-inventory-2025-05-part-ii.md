# Boundary-tightening inventory, Part II — Orchestration leakage

> Findings document. Research only — no code edits, no test runs, no commits.
> Companion to `boundary-inventory-2025-05.md` (Part I).
> Date: 24 May 2026.

---

## Null finding / push-back check

The codebase does **not** pass the null check. Orchestration leakage is widespread in
`src/stores/search-store.ts`, which acts as a sequencing engine for most of the ES
interaction rather than a thin intent layer. Nine distinct clusters follow.

---

## Clusters

### C1 — PIT lifecycle threading

**Location:** `src/stores/search-store.ts:~1766–1810` (`search()`), referenced in
`extendForward`, `extendBackward`, `seek`, `restoreAroundCursor`, `_loadBufferAroundImage`

**Operation:** Own, refresh, and close the Elasticsearch Point In Time token that
provides snapshot isolation for the duration of one search session.

**DAL calls involved (in order):**
1. `dataSource.closePit(oldPitId)` — fire-and-forget before opening new PIT
2. `dataSource.openPit("1m")` — open new session PIT
3. Every subsequent `dataSource.searchAfter(..., pitId)` call passes the token explicitly

**ES-shaped state crossing the seam:** `pitId: string | null` (stored in Zustand),
`_pitGeneration: number` (staleness guard read by extendForward/extendBackward/seek before
each call to skip a stale PIT after a concurrent `search()`).

**Why it's outside today:** PITs were added incrementally. The store already owned the
session boundary (one search = one buffer session), so PIT lifecycle was attached there.
The generation counter is a non-trivial invariant that arose from a real race (es-audit.md
Issue #1).

**Could it be a single DAL method?** Partial. The DAL could manage a session-scoped PIT
internally, exposing `beginSession()` / `endSession()` — or treating `searchAfter(null)`
as an implicit session start. The store would express intent ("starting a new search")
without holding the PIT token.

**Risk of moving it:** High. All five major store methods explicitly pass `pitId`. The
`_pitGeneration` guard is load-bearing for concurrent-search safety. Any refactor
requires the DAL to expose a session concept that doesn't currently exist in the contract.

**Verdict:** DEFER-TO-BFF. The BFF layer will naturally absorb PIT lifetime into a
server-side session. Moving it client-side now means designing a session abstraction
that will be discarded.

---

### C2 — seek() deep-seek algorithm

**Location:** `src/stores/search-store.ts:~2404–3460`

**Operation:** Given a global position, locate the corresponding ES documents via
multi-step estimation, landing as close to the target as possible.

**DAL calls involved (worst-case, keyword sort with large bucket):**
1. `dataSource.fetchSortDistribution()` (via store method — deferred if not loaded)
2. `dataSource.estimateSortValue(params, field, percentile)` — numeric/date sort path
3. `dataSource.searchAfter(...)` — forward fetch at estimated cursor
4. `dataSource.countBefore(params, sortValues, clause)` — find actual landing position
5. `dataSource.findKeywordSortValue(...)` — keyword sort path: composite agg walk
6. `dataSource.searchAfter(...)` — forward fetch at keyword cursor
7. `dataSource.countBefore(...)` — verify position
8. Loop × up to 50: `dataSource.countBefore(probeCursor, ...)` — binary search
   refinement on large buckets (e.g. 400k docs with same credit)
9. `dataSource.searchAfter(...)` — final fetch at converged cursor
10. `dataSource.searchAfter(... reverse=true)` — sequential backward fetch for
    bidirectional buffer headroom

Also: the End-key fast path uses `searchAfter(... reverse=true, missingFirst=true)`,
and the position-map path runs forward + backward `searchAfter` in parallel via
`Promise.all`.

**ES-shaped state crossing the seam:** intermediate cursor `SortValues` at each step,
`pitId`, `coveredCount` from sortDistribution (determines null-zone routing), `actualOffset`
from `countBefore` (feeds scroll-target computation), `backwardItemCount` (feeds
`computeScrollTarget` for sub-row offset).

**Why it's outside today:** The algorithm grew incrementally from a simple from/size call.
Each new sort type or edge case (null zone, keyword, binary-search refinement, bidirectional
buffer) was added in-place. The function also reads non-DAL state: `positionMap`,
`sortDistribution`, scroll geometry (for backward-fetch size), and emits non-DAL signals
(`_seekTargetLocalIndex`, `_seekSubRowOffset`, `_seekTargetGlobalIndex`).

**Could it be a single DAL method?** Yes in principle: `seekToPosition(params, globalOffset,
opts)` → `{ hits, bufferOffset, startCursor, endCursor }`. But the method would need to
accept `positionMap` and `sortDistribution` as inputs (they may already be loaded, avoiding
redundant fetches), and the scroll-target computation (`computeScrollTarget`) would stay
in the store — it reads scroll geometry and emits virtualizer-facing index signals.

**Risk of moving it:** Very high. The most entangled cluster. Reads five pieces of store
state, emits three scroll signals, uses module-level abort controllers. Requires a
substantial DAL API surface redesign.

**Verdict:** KEEP. Too entangled with scroll geometry and virtualizer signals to move
cleanly without a parallel design document. Worth a dedicated "seekToPosition as DAL
method" design spike, but not a PR without it.

---

### C3 — sort-around-focus (_findAndFocusImage)

**Location:** `src/stores/search-store.ts:~1185–1640`

**Operation:** After a sort change (or filter change with a focused image), asynchronously
locate the focused image's new position and load a buffer centred on it.

**DAL calls involved:**
1. `dataSource.searchAfter({ ids: imageId, length: 1 }, null, null)` — fetch image for
   its sort values in the new context
2. `dataSource.countBefore(fp, imageSortValues, sortClause)` — get exact global offset
   (or positionMap lookup as fast path)
3. *(if image not found)* `dataSource.searchAfter({ ids: neighbours, length: N })` —
   neighbour batch survival check
4. `_loadBufferAroundImage(...)` → two parallel `dataSource.searchAfter()` calls (C5)
5. *(async, deep-seek mode)* `dataSource.countBefore(...)` — background offset correction

**ES-shaped state crossing the seam:** `imageSortValues` from step 1 feeds steps 2 and 4;
`offset` from step 2 feeds step 4; `pitId` flows through all; output sort values from step
4 become `startCursor`/`endCursor`.

**Why it's outside today:** The function distinguishes "explicit focus" (`focusedImageId`)
from "phantom focus" (`_phantomFocusImageId`), and sets `sortAroundFocusStatus`,
`_isInitialLoad`, and `sortAroundFocusGeneration` — all purely UI/scroll concerns. These
can't move to the DAL.

**Could it be a single DAL method?** Partial. Steps 1, 2, 4, and 5 (the pure ES work)
could be `seekToImage(imageId, params)` → `{ hits, bufferOffset, startCursor, endCursor }`.
Step 3 (neighbour fallback with `prevNeighbours` captured from the UI buffer) and all focus
state assignments stay in the store.

**Risk of moving it:** Medium. Step 3's dependency on `prevNeighbours` (a snapshot of the
pre-search buffer captured by `_captureNeighbours`) couples the fallback path to UI state.
The timeout controller and abort semantics would need to be restructured.

**Verdict:** MOVE-TO-DAL (partial). Extract the ES traversal (steps 1, 2, 4, 5) as
`seekToImage`. Store keeps neighbour fallback, focus assignments, and scroll signals.

---

### C4 — restoreAroundCursor

**Location:** `src/stores/search-store.ts:~3640–3720`

**Operation:** Restore the buffer around a specific image using its cached sort cursor —
used by ImageDetail on page reload to recover counter and prev/next neighbours.

**DAL calls involved:**
1. `dataSource.countBefore(params, cursor, sortClause)` — exact global offset
2. `dataSource.searchAfter({ ids: imageId, length: 1 }, null, null)` — fetch fresh image
   hit + updated sort values

Steps 1 and 2 run in parallel via `Promise.all`.

3. `_loadBufferAroundImage(targetHit, targetSortValues, exactOffset, ...)` (C5) →
   two parallel `searchAfter` calls

**ES-shaped state crossing the seam:** `cursor` (from history cache) → all three calls;
`exactOffset` from step 1 → step 3; `targetSortValues` from step 2 → step 3.

**Why it's outside today:** The store manages the buffer; restoring it lived there.
No conceptual reason the ES work can't be in the DAL.

**Could it be a single DAL method?** Yes. `loadBufferAroundCursor(imageId, cursor, params)`
→ `{ hits, bufferOffset, startCursor, endCursor }`. The no-cursor fallback to `seek()`
(one line of store code) stays in the store wrapper.

**Risk of moving it:** Low. No focus state, no scroll signals. The suppress-restore flag
and fallback-to-seek remain in the store as one-liners around the DAL call.

**Verdict:** MOVE-TO-DAL. Clean 3-step sequence with no UI entanglement.

---

### C5 — _loadBufferAroundImage (internal helper)

**Location:** `src/stores/search-store.ts:~1065–1180`

**Operation:** Given a target image and its cursor, fetch a buffer page centred on that
image via parallel forward and backward searchAfter calls.

**DAL calls involved:**
1. `dataSource.searchAfter(params, effectiveCursor, pitId, signal, false)` — forward half-page
2. `dataSource.searchAfter(params, effectiveCursor, pitId, signal, true)` — backward half-page
   (parallel via `Promise.all`)

**ES-shaped state crossing the seam:** target image `sortValues` → both calls; null-zone
derived overrides (sort, filter, strippedCursor) derived and passed through; output combined
`sortValues[]` becomes `startCursor` / `endCursor`.

**Why it's outside today:** Was extracted from sort-around-focus code when
`restoreAroundCursor` needed the same logic. Both callers are store methods, so the
helper stayed in the store file.

**Could it be a single DAL method?** Yes. `loadBufferCenteredAt(cursor, params, pitId,
signal, halfSize)` → `SearchAfterResult`. The null-zone handling (already in `dal/null-zone.ts`)
would be internal. Column-alignment trimming (a layout concern) would remain in the calling
store code.

**Risk of moving it:** Low. The function is already nearly a pure function — it reads only
`getScrollGeometry()` for the column trim, which would stay in the caller.

**Verdict:** MOVE-TO-DAL. This is the cleanest extraction in the codebase. Used by C3 and
C4; a DAL method here would simplify both.

---

### C6 — _fillBufferForScrollMode (scroll-mode page loop)

**Location:** `src/stores/search-store.ts:~862–970`

**Operation:** After initial search on a small result set, loop to fetch all remaining
pages so the entire result set fits in the buffer, activating scroll mode.

**DAL calls involved:** Loop — `detectNullZoneCursor()` + `dataSource.searchAfter()` per
iteration until `fetched >= total`. Number of iterations = `ceil(total / PAGE_SIZE) - 1`.

**ES-shaped state crossing the seam:** `currentCursor` evolves each iteration (previous
page's `endCursor` → next iteration's `searchAfterValues`); `pitId`; null-zone overrides
re-derived each iteration.

**Why it's outside today:** Progressive appends (each chunk calls `set(state => ...)`)
let the user see images appearing incrementally during the fill. The store owns the buffer,
so the append logic is co-located.

**Could it be a single DAL method?** Partial. `fetchAllPages(params, startCursor, total,
pitId, signal)` → `Image[]` would isolate the loop. Store appends in one shot. But the
progressive-display property would be lost unless the DAL accepts an `onChunk` callback
or returns an async iterator.

**Risk of moving it:** Medium. Progressive append is a deliberate UX choice. A `fetchAllPages`
that returns everything at once degrades the "images appear during fill" behaviour. An
async-iterator API preserves it but is a more invasive DAL contract change.

**Verdict:** DEFER. Progressive fill is an intentional UX feature. Not worth complicating
the DAL contract until BFF shapes the streaming story.

---

### C7 — fetchAggregations parallel bundle

**Location:** `src/stores/search-store.ts:~3695–3760`

**Operation:** Fire facet-panel aggregations and `is:` filter counts in a single parallel
round-trip.

**DAL calls involved:**
1. `dataSource.getAggregations(params, AGG_FIELDS, signal)` — facet buckets
2. `dataSource.getFilterAggregations(params, isFilterRequests, signal)` — deleted /
   under-quota counts

Both run via `Promise.all`.

**ES-shaped state crossing the seam:** None — both calls share `params` and an `AbortSignal`
but return independent results. No cursor threading.

**Why it's outside today:** Debounce, circuit-breaker, and cache key are UI/perf concerns
that precede the actual ES calls. The `parseCql("is:deleted")` call (used to build filter
agg requests) was already flagged in Part I.

**Could it be a single DAL method?** Yes. `getFacetsWithFilterCounts(params, aggFields,
filterRequests, signal)` would bundle the two ES requests, sharing one network round-trip.
The debounce and circuit-breaker stay in the store.

**Risk of moving it:** Low. No cursor threading, no abort controller ownership issues.

**Verdict:** MOVE-TO-DAL (partial). Bundle the ES I/O into one DAL method; store keeps
the debounce, circuit-breaker, and cache key. The `parseCql` dependency (Part I Item 2)
should also move at the same time.

---

### C8 — Null-zone distribution auto-trigger

**Location:** `src/routes/search.tsx:~152–157`

**Operation:** After the primary sort distribution loads and reveals a null zone
(`sortDistribution.coveredCount < total`), automatically fire
`fetchNullZoneDistribution()`.

**DAL calls involved (indirectly):**
1. The `useEffect` reads `sortDistribution.coveredCount` (a field in a DAL result)
2. Conditionally fires `fetchNullZoneDistribution()`, which calls
   `dataSource.getDateDistribution(params, "uploadTime", direction, signal, nullZoneFilter)`

**ES-shaped state crossing the seam:** `sortDistribution.coveredCount` (from the DAL's
`getKeywordDistribution` / `getDateDistribution` result) → trigger condition for the
next DAL call.

**Why it's outside today:** The distribution lives in store state; the route component
watches it via a `useEffect`. The trigger was added later, in the most convenient place.

**Could it be a single DAL method?** Yes. `fetchSortDistribution()` could internally fetch
the null-zone distribution when `coveredCount < total`, returning both in a single result.
The route effect becomes unnecessary.

**Risk of moving it:** Low. The trigger condition is a pure read on a DAL result field.
The null-zone distribution is already fetched in `fetchNullZoneDistribution()` inside
the store — the DAL already has `getDateDistribution` with `extraFilter` support.

**Verdict:** MOVE-TO-DAL. Encapsulate in `fetchSortDistribution`. The route-level effect
is an unusual home for a data-fetch trigger — it should not require the route to know
about the `coveredCount` field.

---

### C9 — useRangeSelection swap-and-retry

**Location:** `src/hooks/useRangeSelection.ts:~225–280`

**Operation:** Walk the ES index to collect all image IDs between two cursor positions for
range selection, retrying with swapped cursors when the anchor's sort order is unknown.

**DAL calls involved:**
1. `dataSource.getIdRange(params, fromCursor, toCursor, signal)` — first attempt
2. *(only when direction unknown and step 1 returned 0)* `dataSource.getIdRange(params,
   toCursor, fromCursor, signal)` — retry with swapped cursors

**ES-shaped state crossing the seam:** `result.walked` and `result.ids.length` from step 1
→ decision to fire step 2. `fromCursor` / `toCursor` (SortValues) swapped between calls.

**Why it's outside today:** The swap-and-retry is a recovery pattern for the case where
the shift-click anchor's global index is unknown (not in imagePositions). Historically
the caller accumulated the cursor-order guessing logic.

**Could it be a single DAL method?** Yes. `getIdRange` could accept cursors in any order
and internally attempt both directions, or a `getIdRangeBetween(a, b)` method could
handle direction detection entirely. This is the `selectRange(a, b)` intent Alex proposed
(Part I Item 3).

**Risk of moving it:** Low. The swap-and-retry is purely ES-shaped (cursors, walked count).
No focus state, no scroll state. The `anchorSV` resolution logic before the call (steps
1–3 in the hook) legitimately belongs in the hook (it reads from selectionStore metadata
cache and the effect's context).

**Verdict:** MOVE-TO-DAL. This is the direct implementation of Alex's `selectRange(a, b)`.
Part I already recommended it; this confirms the pattern.

---

## Cross-cutting patterns

### Pattern 1: The store is a sequencing engine, not a state container

Seven of nine clusters live in `search-store.ts`. The store's job should be "hold the
buffer and expose intent methods". Instead it orchestrates multi-step ES dialogues —
counting, estimating, seeking, verifying — with module-level abort controllers, generation
counters, and cooldown timestamps interleaved throughout. The store acts as the scheduler
for a distributed ES workflow.

### Pattern 2: Three pieces of non-DAL state block all clean extractions

Every cluster that touches seek or focus hits the same three blockers:
- **positionMap** (store state, built from a background fetch) — feeds seek routing decisions
- **sortDistribution** (store state, lazy-loaded) — feeds percentile computation in C2 and
  null-zone detection in C8
- **scroll geometry** (module-level `getScrollGeometry()`) — feeds backward-fetch sizing and
  scroll-target computation

Any DAL method that needs these would require them as parameters, making the DAL contract
more complex and coupling it to the store's internal caches.

### Pattern 3: Three missing DAL intent verbs

The clusters map to three compound ES operations the DAL could expose as first-class
methods:

| Missing verb | Clusters it would absorb | Rough scope |
|---|---|---|
| `loadBufferCenteredAt(cursor, params)` | C4, C5 (and part of C3) | ~120 lines |
| `getFacetsWithFilterCounts(params)` | C7 | ~30 lines, reduces ES requests |
| `seekToImage(imageId, params)` | C3 (partial) | ~150 lines, still passes positionMap |

C2 (seek by position) and C1 (PIT lifecycle) are in a different weight class — both need
architectural preconditions (a DAL session concept for C1, or BFF-side seek for C2).

### Pattern 4: Null-zone handling is half in the DAL, half in the store

`detectNullZoneCursor` and `remapNullZoneSortValues` are already in `src/dal/null-zone.ts`,
but every caller (extendForward, extendBackward, seek's deep path, _fillBufferForScrollMode,
_loadBufferAroundImage) imports them directly and applies them manually. This was flagged in
Part I; Part II confirms it appears in at least six distinct call sites in the store alone.
The null-zone logic is DAL-internal plumbing that has leaked upward.

---

## Recommended candidates for Part-II PRs

### Bundle A: Clean extractions (low risk, high coherence)

**C5 → `loadBufferCenteredAt`** + **C4 → `loadBufferAroundCursor`**  
These share the same ES pattern (parallel bidirectional searchAfter), no non-DAL state,
and are used by the same two store methods. Do C5 first (it's the shared primitive), then
C4 is a 20-line store simplification.  
Test surface: `search-store-pit.test.ts`, `search-store-extended.test.ts`.

**C9 → `getIdRangeBetween`** (was Part I Item 3)  
Consolidate the swap-and-retry into the DAL. Single file change + update the relevant
Playwright range-selection spec.

### Bundle B: Needs design-document first

**C3 → `seekToImage`**  
Extracting steps 1, 2, 4, 5 is feasible; step 3 (neighbour fallback with UI-captured IDs)
complicates the DAL signature. Decide: pass `prevNeighbours` as an optional parameter to
the DAL, or keep the fallback in the store? Document before coding.

**C8 → merge into `fetchSortDistribution`**  
Straightforward, but requires the combined distribution result type (`{ primary, nullZone }`
or two separate fields). Define the shape first.

### Bundle C: Wait for architecture

**C7 → `getFacetsWithFilterCounts`**  
Bundling two ES requests is a safe win, but the `parseCql` coupling (Part I Item 2) should
be resolved first — the filter agg request construction currently imports `parseCql` from
the DAL adapter layer directly.

**C1 (PIT lifecycle), C2 (seek by position), C6 (fill loop)**  
All three should wait for BFF architecture. C1 and C6 need a DAL session concept. C2 needs
a DAL `seekToPosition` that accepts positionMap and sortDistribution as inputs — or a BFF
that handles seek server-side.

---

## Appendix — out-of-scope observations (≤ 10 items)

1. `src/stores/collection-store.ts:~168` instantiates `new ElasticsearchDataSource()`
   directly (module-level constant), bypassing any future dataSource injection. It calls
   `dataSource.getAggregations({}, [...], signal)` — a DAL call from a non-search store
   with empty params. This works today but won't survive a Grid API data source swap.

2. `src/hooks/useScrollEffects.ts` imports `registerVirtualizerReset` and
   `registerScrollToFocused` from `src/lib/orchestration/search.ts`, which is a grab-bag
   module holding debounce state, scroll reset logic, URL sync state, and history
   snapshot helpers. That module's name ("orchestration") oversells its current role
   — it's mostly I/O-free coordination helpers, not ES orchestration.

3. `src/stores/selection-store.ts` holds its own `dataSource: ImageDataSource` (a
   separate `new ElasticsearchDataSource()` constructed inside selection-store's factory).
   Two independent dataSource instances exist at runtime (search-store + selection-store).
   For now this is harmless; under BFF it may cause session coherence issues.

4. The `_pitGeneration` counter pattern (a monotonic version number to invalidate stale
   PIT captures in closures) is a sophisticated concurrent-safety pattern that would be
   entirely unnecessary if the DAL owned PIT lifecycle. Worth preserving in any DAL session
   design.

5. `seek()` uses `performance.mark()` / `performance.measure()` instrumentation at eight
   points. This perf tracing would need to survive any extraction of seek logic into the
   DAL — the trace sites are currently at semantically meaningful milestones (forward-done,
   backward-done, set-done, painted).
