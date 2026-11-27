# Real Scrolling Through 24 Hours — Multi-Session Workplan

> **Created:** 2026-04-10
> **Status:** Phases 0-4a complete. Remaining phases (4b-7) superseded — see below.
> **Goal:** Enable scroll-like scrubber experience for up to 65,000 images (a full
> day's worth) WITHOUT loading all documents into memory. Lightweight position index
> \+ windowed buffer hybrid.

## The Core Idea

**Current scroll mode** (total ≤ 1000): fetch ALL documents into buffer. Scrubber
drag = direct content scroll. Works perfectly but can't scale past ~5-10k due to
memory/network (65k × 5-10KB = 325-650MB).

**Proposed hybrid** (total ≤ 65,000): fetch only `[id, sortValues]` for all results
(`_source: false`, ~200 bytes/doc × 65k = ~13MB), giving the scrubber exact
position→sortValues mapping. The windowed buffer (1000 items with full `_source`)
continues to handle visible content. Seek becomes trivial: look up sort values at
target position → one `search_after` call → done.

### Memory budget at 65k

| Component | Wire size | V8 heap (estimated) | Notes |
|-----------|-----------|---------------------|-------|
| Position map (ids + sort values) | ~4-6MB | ~15-25MB | Struct-of-arrays layout. V8 strings are 2 bytes/char; arrays have per-element overhead. Wire-format ≠ heap — see Phase 0 step 6. |
| Windowed buffer (full `_source`) | ~5-10MB | ~5-10MB | 1000 docs as today |
| **Total** | **~9-16MB** | **~20-35MB** | Comfortable. Phase 0 will measure actual V8 heap. |

**Note:** The wire-format estimate (~200 bytes/doc) significantly underestimates V8
heap cost. Grid IDs are ~40 char hex = ~80 bytes as JS strings (2 bytes/char) plus
V8 string headers (~40 bytes). Sort value arrays add per-element overhead. Realistic
per-entry heap cost: ~250-350 bytes. At 65k that's 16-23MB for the position map
alone — still very manageable, but Phase 0 must measure actual heap via DevTools
snapshot, not just wire sizes.

vs loading all 65k with full `_source`: 325-650MB (impossible).

### Key insight

Scroll mode isn't about having all data in memory. It's about the scrubber knowing
the exact mapping from thumb position → content position. That only requires sort
values, not full `_source`.

---

## Key Files Referenced Throughout

- Architecture: `AGENTS.md`, `scroll-architecture.md`, `search-after-plan.md`, `scrubber-dual-mode-ideation.md`
- Store: `stores/search-store.ts` (~2783 lines), `constants/tuning.ts`
- DAL: `dal/es-adapter.ts` (~1134 lines), `dal/types.ts`, `dal/es-config.ts`
- Scrubber: `components/Scrubber.tsx` (~1105 lines), `lib/sort-context.ts` (~1035 lines)
- Hooks: `hooks/useDataWindow.ts`, `hooks/useScrollEffects.ts`
- Routes: `routes/search.tsx`
- Tests: `e2e/local/scrubber.spec.ts`, `e2e/README.md`

---

## Phase 0 — Measurement & Validation

> **1 session, ~2-3 hours**

**Goal:** Validate all assumptions about payload sizes, fetch times, memory, and
ES behaviour before writing any production code. Kill the project early if the
numbers don't work.

**Success criteria:**
- Documented measurements for: `_source: false` response size per 10k chunk,
  round-trip time per chunk, total fetch time for 65k docs, JSON parse time,
  memory footprint of the position map, PIT stability over the fetch duration.
- A go/no-go decision with concrete numbers.

**Files to read:** `es-adapter.ts` (searchAfter with `noSource: true`),
`es-config.ts`, `tuning.ts`, `infra-safeguards.md`

**Files to create:**
`kupua/exploration/docs/01 Research/scroll-position-map-measurements.md` — raw
measurement data and analysis

**Steps:**
1. Write a standalone measurement script (e.g. `kupua/scripts/scroll-real-measure-position-map.mjs`)
   that connects to TEST ES via the tunnel and measures:
   - Response size (bytes) for `_source: false` + sort clause at `size: 10000` —
     compare against the ~200 bytes/doc estimate.
   - Round-trip time per 10k-chunk `searchAfter` call (target: <50ms each).
   - Total wall-clock time to fetch 65k positions via ~7 sequential `searchAfter`
     calls.
   - JSON parse time for a 65k-entry response (if batched) or cumulative parse time.
   - PIT keepalive stability — does a 1m PIT survive 7 sequential requests at
     ~50ms each?
2. Validate that ES returns `hit._id` and `hit.sort` when `_source: false`.
   Confirm the response shape — currently `searchAfter` maps `hit._source` which
   will be `undefined` when `noSource: true`. **This is a critical detail for
   Phase 1.**
3. Test with keyword sorts (e.g. `orderBy=credit`) — confirm sort values are
   returned even for keyword fields with `_source: false`.
4. Measure gzip compression ratio on the wire (network tab) — target ~3-5MB for
   65k positions.
5. Document results and retreat thresholds: at what total does fetch time exceed
   5s? 10s? Where does memory exceed 50MB?
6. **V8 heap measurement (critical).** Wire-format sizes underestimate heap cost
   ~2-4×. After building the 65k position map in-browser (struct-of-arrays of
   ids + sortValues), take a DevTools heap snapshot. Measure:
   - Total retained size of the position map arrays.
   - Per-entry cost (divide retained size by entry count).
   - Compare against wire estimate. Update memory budget table with actuals.
   - Target: <50MB total (position map + buffer). If >50MB, evaluate retreat
     thresholds.
7. **PIT-sharing decision.** During the ~2-3s position map fetch, test whether
   user-initiated seeks or extends (which share the same PIT) cause conflicts.
   Specifically: start a position map fetch, then trigger a seek mid-stream.
   Observe: does the seek's `search()` close the PIT and invalidate the in-flight
   fetch? If partial fetches are routinely discarded due to PIT churn, consider
   whether Phase 2 should open a **dedicated PIT** for the position map fetch
   (one extra `_pit` call, ~5ms, fully decoupled lifecycle). Document the decision.

8. **Post-Phase-0 decision session (~30-60 min).** Before starting Phase 1, sit
   down with the measurements and make every decision that downstream phases
   depend on. This is a conversation, not code.

   **What we'll know:**
   - Actual per-entry heap cost (steps 1 + 6) → drives threshold.
   - Total fetch time at 65k (step 1) → drives UX expectations for Phase 5.
   - PIT behaviour under concurrent use (step 7) → drives Phase 2 architecture.
   - Keyword sort behaviour with `_source: false` (step 3) → drives Phase 1 scope.

   **Decisions to make:**

   | # | Question | Depends on | Affects |
   |---|----------|-----------|---------|
   | A | **Go / retreat / adjust threshold?** If heap >50MB at 65k or fetch >5s, pick a retreat level from the Retreat Plan. If heap is ~25MB and fetch ~2s, confirm 65k. If surprisingly cheap, consider raising to 100k. | Steps 1, 5, 6 | `POSITION_MAP_THRESHOLD` in Phase 2; everything downstream. |
   | B | **Shared PIT or dedicated PIT?** If step 7 showed the position map fetch completing without interruption in realistic usage, share. If seeks routinely abort the fetch, dedicate. | Step 7 | Phase 2 `_fetchPositionMap` implementation. |
   | C | **Chunk size?** If 10k chunks work fine, keep them. If GC pauses are visible at 10k, drop to 5k. If round-trip overhead dominates, raise to 20k. | Steps 1, 6 | Phase 1 `fetchPositionIndex` chunk size constant. |
   | D | **Keyword sorts in scope for v1?** If step 3 confirmed keyword sort values come through cleanly with `_source: false`, include them. If there are issues (e.g. multi-valued fields returning arrays), defer keyword sort support to a follow-up. | Step 3 | Phase 1 null-zone handling, Phase 3 keyword seek elimination. |
   | E | **Update memory budget table** with actuals. Recalculate retreat thresholds if per-entry cost differs significantly from estimates. | Steps 1, 6 | Workplan memory budget table, retreat plan. |
   | F | **Loading UX expectations.** If fetch takes ~1s at the chosen threshold, the Phase 5 loading indicator may be unnecessary (map arrives before user interacts with scrubber). If ~3-5s, it's essential. Set expectations now. | Step 1 | Phase 5 scope — could shrink to "nothing needed" or confirm full implementation. |

   **Output:** Updated workplan with concrete numbers replacing all estimates.
   Mark any phases whose scope changed. If retreating, remove or simplify
   phases that no longer apply.

**Risk notes:**
- If `_source: false` still returns large `_id` strings (Grid IDs are ~36-40 char
  hex hashes), per-doc overhead may be higher than 200 bytes. Measure actual.
- PIT keepalive might need extending from 1m to 5m for the full fetch sequence.
- V8 per-entry heap cost is likely 250-350 bytes, not 200 bytes — JS strings use
  2 bytes/char, arrays have per-element overhead, V8 string headers add ~40 bytes.
  Phase 0 measurements should calibrate against heap snapshots, not wire sizes.

---

## Phase 1 — Position Map Data Structure & DAL Method

> **1-2 sessions, ~4-6 hours**

**Goal:** Build the position map data structure and the new DAL method to fetch it.
No UI changes yet — pure data layer work.

**Success criteria:**
- New `PositionMapEntry` type and `PositionMap` structure in the codebase.
- New `cursorForPosition(map, targetPos)` helper that correctly handles the
  `search_after` off-by-one, ties, and position-0 edge case.
- New `fetchPositionIndex` method on `ImageDataSource` /
  `ElasticsearchDataSource` that fetches `[id, sortValues]` for all results using
  `_source: false` + `searchAfter` in 10k chunks.
- Vitest unit tests covering: happy path, abort mid-fetch, PIT expiry recovery,
  empty results, chunking correctness, `cursorForPosition` edge cases.

**Files to read:** `dal/types.ts` (ImageDataSource interface), `es-adapter.ts`
(`searchAfter` implementation, `noSource` param), `search-store.ts`
(`_fillBufferForScrollMode` pattern for chunked background fetch)

**Files to create/modify:**
- **Create:** `kupua/src/dal/position-map.ts` — `PositionMapEntry` type,
  `PositionMap` data structure
- **Modify:** `kupua/src/dal/types.ts` — add `fetchPositionIndex` to
  `ImageDataSource` interface
- **Modify:** `kupua/src/dal/es-adapter.ts` — implement `fetchPositionIndex`
  using `searchAfter` with `noSource: true`
- **Modify:** `kupua/src/dal/mock-data-source.ts` — stub implementation for tests
- **Create:** `kupua/src/dal/position-map.test.ts` — unit tests

**Steps:**
1. Define the data structure. **Recommendation: struct-of-arrays layout:**
   ```ts
   interface PositionMap {
     /** Number of entries in the map. */
     length: number;
     /** Image IDs, indexed by global position. */
     ids: string[];
     /** Sort values per image, indexed by global position. */
     sortValues: SortValues[];
   }
   ```
    Two arrays vs 65k individual objects = single GC root per array, better memory.
2. **Design `cursorForPosition(map, targetPos)` helper.** This encapsulates the
   `search_after` off-by-one: ES returns docs *strictly after* the cursor, so
   seeking to position N requires `sortValues[N-1]` as the cursor. Edge cases:
   - **Position 0:** no predecessor — return `null` (no cursor, fetch from start).
   - **Tied sort values:** if `sortValues[N-1]` equals `sortValues[N]` (common
     with tied dates or keyword sorts), the cursor is still correct because the
     id tiebreaker makes each entry unique. Verify this in unit tests.
   - **Position total-1:** existing end-key fast path may be better. Consider
     delegating to it.
   - Include Vitest tests for all edge cases. **This must be solid before Phase 3
     consumes it.**
3. Fix the `searchAfter` return path for `noSource: true` — currently `hit._source`
   is mapped which will be `undefined`. Two options:
   - (a) Modify `searchAfter` to always return `_id` alongside sort values.
   - (b) Add a new dedicated `fetchPositionIndex` method that extracts `hit._id`
     and `hit.sort` directly.
    - **Recommendation: (b)** — cleaner, less risk of breaking existing callers.
4. Implement `fetchPositionIndex(params, pitId, signal): Promise<PositionMap>`:
   chunked `searchAfter` loop (10k per chunk), same abort/PIT pattern as
   `_fillBufferForScrollMode`.
5. Handle null-zone cursors in the fetch loop (same `detectNullZoneCursor` pattern
   used in `_fillBufferForScrollMode` and seek).
6. Unit tests: fetch against local ES (~10k docs), verify position map entries
   match expected order and count. Include `cursorForPosition` edge case tests.

**Risk notes:**
- The `searchAfter` response parser currently assumes `hit._source` exists. The
  `noSource: true` path must handle `hit._source` being `undefined` or absent.
  Need to check ES 8.x response shape carefully.
- Null-zone handling in the chunk loop adds complexity. Can be deferred to a
  follow-up if keyword sorts aren't needed immediately.

---

## Phase 2 — Store Integration & Background Fetch

> **1-2 sessions, ~4-6 hours**

**Goal:** Wire the position map into `search-store.ts` — fetch it in the background
after initial search, expose it as store state, handle invalidation.

**Success criteria:**
- After a search with `total ≤ POSITION_MAP_THRESHOLD` (new constant, default
  65000), the position map is fetched in the background using the same PIT.
- Store exposes `positionMap: PositionMap | null` and `positionMapLoading: boolean`.
- Position map is invalidated (set to `null`) on: new search, sort change, filter
  change, PIT refresh.
- Race conditions handled: new search cancels in-flight position map fetch.
- Vitest integration tests covering fetch lifecycle, invalidation, abort.

**Files to read:** `search-store.ts` (`search()` method around line 1220,
`_fillBufferForScrollMode`, abort/signal patterns, `_pitGeneration`)

**Files to modify:**
- `kupua/src/constants/tuning.ts` — add `POSITION_MAP_THRESHOLD` (env-configurable
  via `VITE_POSITION_MAP_THRESHOLD`)
- `kupua/src/stores/search-store.ts` — new state fields (`positionMap`,
  `positionMapLoading`, `_positionMapAbort`), new `_fetchPositionMap` background
  function, integration into `search()` completion path

**Steps:**
0. **Verify mutation-path coverage.** Before implementing invalidation, confirm
   that every user action that changes search params (query, filters, sort) goes
   through `search()`. If any path mutates params without calling `search()`,
   the position map would go stale without being invalidated. Audit
   `useUrlSearchSync`, filter handlers, and sort handlers. ~10 minutes of reading.
1. Add `POSITION_MAP_THRESHOLD = 65000` to `tuning.ts` (env-configurable).
2. Add store state: `positionMap: PositionMap | null`,
   `positionMapLoading: boolean`.
3. Create `_fetchPositionMap()` — async function following the exact pattern of
   `_fillBufferForScrollMode`: takes signal, get/set, uses the same PIT (or a
   dedicated PIT — per Phase 0 decision), fetches in chunks, aborts on signal.
   **Partial map policy (v1): all-or-nothing.** If the fetch is aborted or fails
   mid-stream, discard the partial result and set `positionMap = null`. A partial
   map (e.g. 40k of 65k) *could* be used for seeks in the covered range, but the
   complexity of tracking "which positions are covered" isn't worth it for v1.
4. In `search()` completion (around line 1280): if
   `total > SCROLL_MODE_THRESHOLD && total <= POSITION_MAP_THRESHOLD`, trigger
   `_fetchPositionMap()` instead of / in addition to `_fillBufferForScrollMode()`.
   (If `total ≤ SCROLL_MODE_THRESHOLD`, the existing scroll-mode fill already
   handles it.)
5. Ensure the abort controller for the position map fetch is cancelled when
   `search()` is called again (same pattern as `searchAbortController`).
6. **`imagePositions` at 65k — evaluate need before building.** Currently
   `imagePositions` is a `Map<string, number>` used by `findImageIndex` (for
   sort-around-focus). Building 65k entries eagerly is ~3MB + construction cost
   (~50-100ms GC pause from 65k Map insertions). Evaluate: does `findImageIndex`
   actually need all 65k entries, or only the ~1000 buffered items? If the
   position map already provides `id → position` lookup (via linear scan or a
   separate lazy index), the 65k `imagePositions` Map may be unnecessary.
   **Recommendation:** keep `imagePositions` covering only the buffer. For
   sort-around-focus, add a `positionMapIndexOf(id)` helper that scans the
   position map's `ids` array (65k string comparisons ≈ <1ms). Only build a
   full Map if profiling shows the scan is too slow.
7. Add invalidation: `positionMap = null` on every `search()` call (before the new
   search fires).
8. **New-images poll interaction.** `NEW_IMAGES_POLL_INTERVAL` (10s) checks for
   new images and may trigger a refresh. During position map fetch: either
   suppress poll-triggered refreshes, or let the refresh abort the in-flight
   map fetch (via the same abort controller). The latter is simpler and
   consistent with "new search invalidates everything." Document the choice.

**Key decision — relationship to scroll mode fill:**

| Total count | What runs | Scrubber mode |
|-------------|-----------|---------------|
| `≤ SCROLL_MODE_THRESHOLD` (1000) | `_fillBufferForScrollMode` — all data in buffer | Buffer scroll mode |
| `1000 < total ≤ 65000` | `_fetchPositionMap` — lightweight index | Indexed scroll mode |
| `> 65000` | Nothing extra | Seek mode |

**Risk notes:**
- PIT keepalive: the position map fetch takes ~2-3s. The 1m keepalive should be
  fine, but the fetch should refresh keepalive on each chunk.
- The `_pitGeneration` check must be used to skip stale fetches (same as
  seek/extend).

---

## Phase 3 — Modified Seek Path Using Position Map

> **1-2 sessions, ~4-6 hours**

**Goal:** When the position map is available, seek becomes trivial: look up
`sortValues` at the target position, issue `searchAfter` with those exact values.
No percentile estimation, no `countBefore`, no binary search, no composite-agg
walking.

**Success criteria:**
- `seek()` detects when `positionMap` is available and uses the fast path.
- Fast-path seek: `positionMap.sortValues[targetPosition]` → `searchAfter(cursor)`
  → done. **One network call.**
- `countBefore` call eliminated for position-map seeks (position is already known
  exactly).
- Existing deep seek path remains as fallback when position map is null.
- E2E tests pass. Seek speed measurably improved on TEST.

**Files to read:** `search-store.ts` seek method (~line 1900-2445 — the full seek
implementation), `es-adapter.ts` searchAfter, `sort-context.ts`

**Files to modify:**
- `kupua/src/stores/search-store.ts` — add fast-path branch at the top of
  `seek()`: if `positionMap` exists and `targetPosition < positionMap.length`,
  extract sort values and call `searchAfter` directly. Skip the entire deep-seek
  machinery.

**Steps:**
1. At the start of `seek()`, check `get().positionMap`. If available:
   - Clamp target position to `[0, positionMap.length - 1]`.
   - Use `cursorForPosition(positionMap, clampedPosition)` (designed in Phase 1)
     to get the correct `search_after` cursor — handles the off-by-one,
     position-0 (no cursor), and tied sort values.
   - Call `dataSource.searchAfter({ ...params, length: PAGE_SIZE }, cursor,
     pitId, signal)` — single call.
   - Compute `actualOffset = clampedPosition` (exact — no estimation needed).
   - Continue with bidirectional backward fetch (existing code) for headroom.
2. The existing `computeScrollTarget` / reverse-compute logic stays unchanged —
   it operates on the result regardless of how it was fetched.
3. For keyword sorts, this eliminates the `findKeywordSortValue` composite-agg walk
   entirely (currently the slowest seek path — multiple agg pages).
4. Add a `devLog` to distinguish position-map seeks from deep seeks in diagnostics.
5. **Bonus: accelerate `_findAndFocusImage` (sort-around-focus).** When the
   position map is available, `_findAndFocusImage` can skip its `countBefore`
   call — the map already knows the image's global offset via
   `positionMap.ids.indexOf(id)`. This eliminates one ES round-trip from
   sort-around-focus (currently step 2 of `_findAndFocusImage`).

**ES call elimination summary** (position map available vs not):

| Operation | Without position map | With position map | Saved |
|-----------|---------------------|-------------------|-------|
| Scrubber seek (date) | 3-4 calls (percentile + searchAfter + backward + countBefore) | 1-2 calls (searchAfter + backward) | 2-3 calls |
| Scrubber seek (keyword) | 4-15 calls (composite walk + searchAfter + countBefore ± binary search) | 1-2 calls | 3-13 calls |
| Sort-around-focus | 2-4 calls (getById + countBefore + optional bidirectional) | 1-3 calls (getById + optional bidirectional) | 1 call |

**Design detail — cursor edge case:**
The `cursorForPosition` helper (Phase 1) encapsulates `search_after`'s "strictly
after" semantics. Position N uses `sortValues[N-1]` as cursor; position 0 uses
`null` (no cursor). Tied sort values are handled by the id tiebreaker — each
entry's sort tuple is unique. Edge cases are covered by Phase 1 unit tests.

**Risk notes:**
- The position map was built from a PIT snapshot. If the PIT has expired and been
  refreshed since, the sort values may be slightly stale. In practice, PITs are
  refreshed on each search, and the position map is invalidated on search — so this
  shouldn't happen. But add a `_pitGeneration` check.
- Bidirectional backward fetch still works the same — it uses the first result's
  sort values as cursor. No change needed.

---

## Phase 4 — Scrubber "Indexed Scroll Mode"

> **2-3 sessions, ~8-12 hours. This is the UX heart of the feature.**

**Goal:** Make the scrubber behave like scroll mode (continuous drag = live content
update) when the position map is available, even though the buffer is windowed.

**Success criteria:**
- New scrubber mode: "indexed scroll mode" — active when `positionMap != null`.
- Seek-on-pointer-up with optimistic thumb — thumb stays at release position,
  content updates in ~250-450ms (PROD) / ~600-850ms (TEST via SSH tunnel).
  No visible teleport/flash.
- Falls back to seek mode if position map is not yet loaded.
- Visual transition when position map arrives (subtle, not jarring).

**Files to read:** `Scrubber.tsx` (all ~1105 lines), `search.tsx` (scrubber
instantiation), `useDataWindow.ts`, `useScrollEffects.ts`

**Files to modify:**
- `kupua/src/components/Scrubber.tsx` — new mode logic
- `kupua/src/routes/search.tsx` — pass `positionMapLoaded` to scrubber
- Possibly: `kupua/src/hooks/useScrollEffects.ts` — if seek-during-drag needs
  special handling

### Sub-sessions:

**4a — Tristate mode signal (1 session):**
1. Replace the boolean `allDataInBuffer` with a tristate in the Scrubber:
   ```ts
   type ScrubberMode = 'buffer' | 'indexed' | 'seek';
   ```
   - `'buffer'`: all data in buffer (existing scroll mode). `total ≤ bufferLength`.
   - `'indexed'`: position map loaded, buffer is windowed. Scrubber can map any
     position to sort values.
   - `'seek'`: neither. Status quo seek mode.
2. Pass `positionMapLoaded: boolean` as a new Scrubber prop (from `search.tsx`).
3. `scrubberMode = total <= bufferLength ? 'buffer' : positionMapLoaded ? 'indexed' : 'seek'`.

**4b — Indexed scroll mode drag interaction (1-2 sessions):**

**Measured seek latency (DevTools Performance tab, 24k images on TEST):**

| Component | Time | % of total |
|-----------|------|-----------|
| Forward ES fetch (200 hits, `_source: true`) | 450-600ms | 52-57% |
| Backward ES fetch (100 hits, reverse) | 250-350ms | 29-34% |
| Zustand `set()` (synchronous state swap) | 0.4ms | ~0% |
| React render + browser paint (~300 cells) | 90-155ms | 9-15% |
| **Total (to paint)** | **850-1040ms** | — |

Network dominates (82-91%). Store/compute overhead is effectively zero.
On PROD (no SSH tunnel), estimated 250-450ms total.

**Approach: fast pointer-up with optimistic thumb.**

Drag shows thumb + tooltip (like seek mode). On release, position-map seek
fires. Thumb stays at release position (optimistic). Content area shows a
brief loading skeleton while the ~250-450ms (PROD) / ~850ms (TEST) fetch
completes. This feels responsive because the scrubber itself responds
instantly — only the content area has latency.

Live drag-seek (debounced seeks during drag) is **not viable** at these
network latencies — each seek takes ~850ms on TEST, so debounced seeks at
200ms would queue up and jitter.

**Enhancement: parallel forward+backward fetch.**

Currently, the backward fetch waits for the forward result (to get its first
hit's cursor). With the position map, both cursors are known upfront:

```
Sequential (current):  fwd ~450ms → bwd ~300ms  = ~750ms network
Parallel (proposed):   Promise.all([fwd, bwd])   = ~450ms network (max of the two)
```

This saves ~250-350ms on TEST, bringing total-to-paint to ~600-700ms.
On PROD, ~150-250ms total. Only activates when position map is available;
falls back to sequential when `positionMap === null`.

Implementation: in the position-map branch of `seek()`, compute both
cursors from the map, fire `Promise.all([forwardFetch, backwardFetch])`,
combine results. ~20-30 lines changed. Must handle null-zone cursors for
both directions.

**4c — Sensitivity at 65k (considerations, not necessarily code):**

At 65k: ~96 images per pixel of thumb movement. Analysis:

| Mitigation | Complexity | Recommendation |
|------------|------------|---------------|
| Do nothing — scrubber is coarse, wheel/trackpad is fine | Zero | **Start here.** |
| Wider effective drag area | Low | Good polish later |
| Acceleration damping | High | Probably not worth it |
| Two-level interaction (already exists: scrubber + wheel) | Zero | Already works |

**Tooltip note:** At ~96 images/pixel, the tooltip's "X of Y" counter will skip
in visible chunks (~96 per pixel of drag). For date sorts, the date label will
jump by minutes per pixel move. This is expected and acceptable — the scrubber
is a coarse-positioning tool, not a single-image selector. Fine positioning
uses wheel/trackpad scrolling within the buffer. No code needed; just documenting
that this is a conscious tradeoff.

**4d — Keyboard navigation with position map (~2-3 hours):**

Home/End, Page Up/Down use the position map for instant seeks. This is
straightforward once the fast seek path (Phase 3) exists — these keys simply
call `seek()` with the appropriate position, and the position map makes it
instant.

- Home → `seek(0)` (instant via position map).
- End → `seek(total - 1)` (instant via position map).
- Page Up/Down → `seek(current ± screenSize)`.
- Existing arrow-key navigation (within buffer) unaffected.

**Files to read:** `useListNavigation.ts`, `keyboard-shortcuts.ts`, Scrubber
keyboard handler.
**Files to modify:** `Scrubber.tsx` keyboard handler, possibly
`useListNavigation.ts`.

**Risk notes:**
- The scrubber's scroll-listener (for buffer/scroll mode) directly manipulates
  `scrollTop`. In indexed mode, we can't do this — the buffer doesn't contain all
  items. Ensure the scroll listener is only active in `'buffer'` mode.
- At ~850ms per seek on TEST, rapid seeks from keyboard repeat will queue up.
  The existing seek abort pattern handles this (newer seek aborts older), but
  the user may see brief flashes. Debounce keyboard-triggered seeks if needed.

---

## Phase 5 — Transition UX & Loading States

> **1 session, ~3-4 hours**

**Goal:** Handle the ~2-3 second gap between initial search and position map
availability. Smooth visual transition, loading indicator, graceful degradation.

**Success criteria:**
- While position map is loading, scrubber is in seek mode (functional, not broken).
- When position map arrives, scrubber transitions to indexed mode without visual
  jump.
- Subtle loading indicator on the scrubber track (e.g. thin progress bar or pulse).
- If position map fetch fails, scrubber stays in seek mode (graceful fallback).

**Files to modify:**
- `kupua/src/components/Scrubber.tsx` — loading state visual, transition
- `kupua/src/routes/search.tsx` — pass `positionMapLoading` prop

**Steps:**
1. Add `positionMapLoading: boolean` prop to Scrubber.
2. When `positionMapLoading && !positionMapLoaded`, show a subtle indicator — e.g.
   a thin progress bar at the bottom of the scrubber track, or a pulsing track
   opacity. Keep it minimal.
3. When position map arrives: if the user is currently dragging, don't change mode
   mid-drag. If idle, transition immediately.
4. Track ticks/labels: unchanged — they use the sort distribution (independent of
   position map). Tooltip sort labels: also unchanged.

---

## Phase 6 — Testing & Hardening

> **1-2 sessions, ~4-6 hours**

| Layer | What to test | How |
|-------|-------------|-----|
| **Unit (Vitest)** | Position map construction, struct-of-arrays access, abort handling, invalidation | New `position-map.test.ts` |
| **Integration (Vitest)** | Store lifecycle: search → position map fetch → seek fast path → invalidation | Extend `search-store.test.ts` |
| **E2E local** | Scrubber mode transitions (seek → indexed), seek with position map, loading states | Extend `scrubber.spec.ts` — local ES has ~10k docs |
| **E2E smoke (TEST)** | Real 65k-doc result set (e.g. `since:2024-03-14 until:2024-03-15`), verify position map fetch completes, seek works | New smoke spec |
| **Perf** | Measure seek latency with position map vs without on TEST | `e2e-perf` measurement |

**Steps:**
1. Write Vitest unit tests for position map data structure.
2. Write Vitest integration tests for store lifecycle.
3. Extend `scrubber.spec.ts` with E2E tests for indexed scroll mode.
4. Set `VITE_POSITION_MAP_THRESHOLD=5000` for local E2E so the 10k-doc dataset
   exercises the position map path.
5. Add smoke test spec for position map on TEST (date-filtered to ~65k results).
6. Run `npm test` and `npx playwright test` on every phase.

---

## Phase 7 — Documentation & AGENTS.md Updates

> **1 session, ~1-2 hours**

**Files to modify:**
- `kupua/AGENTS.md` — Component Summary, Context Routing, Key Architecture
  Decisions, Backlog
- `exploration/docs/00 Architecture and philosophy/component-detail.md` — position
  map detail
- `exploration/docs/changelog.md` — implementation narrative
- `exploration/docs/scrubber-dual-mode-ideation.md` — mark indexed scroll mode as
  implemented
- `exploration/docs/deviations.md` — if any deviations

---

## Retreat Plan

If 65k turns out to be too ambitious (Phase 0 measurements show unacceptable
numbers):

| Level | Threshold | Position map (wire / heap est.) | Fetch time | Sensitivity | Notes |
|-------|-----------|--------------------------------|------------|-------------|-------|
| **Target** | 65,000 | ~6MB / ~20-25MB | ~3s | ~96 img/px | Full day |
| **Retreat 1** | 20,000 | ~2MB / ~6-8MB | ~1s | ~29 img/px | Most single-day queries |
| **Retreat 2** | 10,000 | ~1MB / ~3-4MB | ~0.5s | ~15 img/px | Filtered day queries. Overlaps with raising `SCROLL_MODE_THRESHOLD`. |
| **Retreat 3** | 5,000-10,000 | N/A | N/A | N/A | Just raise `SCROLL_MODE_THRESHOLD` (full `_source` for all). ~50-100MB at 10k. Simpler but memory-heavy. |
| **Retreat 4** | Keep current | N/A | N/A | N/A | Seek mode works. Polish tooltip + ticks instead. |

The retreat is zero-cost because each phase is independently valuable:
- Phase 0 produces measurements useful for other optimizations.
- Phase 1's `_source: false` fetch can be reused for other lightweight lookups.
- Phase 3's fast seek path benefits any future position-aware feature.

---

## Total Estimated Effort

| Phase | Sessions | Hours | Status |
|-------|----------|-------|--------|
| 0 — Measurement | 1 | 2-3 | ✅ Complete |
| 1 — Position map + DAL | 1-2 | 4-6 | ✅ Complete |
| 2 — Store integration | 1-2 | 4-6 | ✅ Complete |
| 3 — Fast seek path | 1-2 | 4-6 | ✅ Complete (exactOffset bug fixed) |
| 4 — Scrubber UX + keyboard | 2-3 | 10-15 | 4a ✅, 4b-4d pending |
| 5 — Transition UX | 1 | 3-4 | Pending |
| 6 — Testing | 1-2 | 4-6 | Partial (unit tests done) |
| 7 — Documentation | 1 | 1-2 | Pending |
| **Total** | **9-14** | **33-48** | |

---

## Further Considerations

1. **Live drag-seek is not viable at current latencies.** Seek takes ~850ms on
   TEST (~300ms estimated on PROD). Debounced seeks during drag would jitter.
   Fast pointer-up with optimistic thumb is the correct approach. Revisit only if
   PROD latency drops below ~100ms (would require local cache or prefetching).

2. **Mobile memory budget:** 12-19MB total is fine for desktop. On mobile Safari,
   tab memory limits are tighter (~100-200MB). Consider a lower threshold for mobile
   (`navigator.deviceMemory` heuristic). Monitor in Phase 0.

3. **Position map staleness after PIT expiry:** If the user sits idle for >5 minutes
   (PIT expires), the position map's sort values may point to slightly different
   positions. **Accept minor drift** (~±0.1%) rather than re-fetching the entire
   map on PIT refresh.

4. **Interaction with `_fillBufferForScrollMode`:** For `total ≤ SCROLL_MODE_THRESHOLD`,
   the existing scroll-mode fill is strictly better (all data in buffer, direct
   scroll). The position map should only activate for
   `SCROLL_MODE_THRESHOLD < total ≤ POSITION_MAP_THRESHOLD`. No overlap.

5. **Chunk size for position map fetch:** Phase 0 should experiment with chunk sizes
   (5k, 10k, 20k) to find the sweet spot between round-trip overhead and GC
   pressure.

---

## Superseded (2026-04-12)

Phases 0-4a are complete and deliver: position map data structure + DAL,
store integration + background fetch, position-map-accelerated seek (exact
positioning, fewer ES calls, no composite walks), and the scrubber tristate
mode signal.

**Phases 4b-7 are superseded.** After profiling (see N1 below), the
remaining work in this plan was scrubber seek-mode polish — not real
scrolling. The user wants actual wheel/trackpad scrolling through 12k+
images, which requires **two-tier virtualisation** (virtualizer renders
`total` items, buffer provides content for visible window, placeholders
for the rest).

**Two items carried forward to the new workplan:**
1. **Parallel forward+backward fetch** (from Phase 4b / N4 below) — ~20
   lines in `seek()`, saves ~250-350ms. Low risk, high value. Implement
   first in the new plan.
2. **Position map infrastructure** (Phases 0-3) — fully reusable as-is.
   The new plan builds on top of it.

**New workplan:** `scroll-two-tier-virtualisation-workplan.md`

---
---

# Post-Implementation Notes (2026-04-12)

> Phases 0-4a complete. These notes capture findings from measurement and
> profiling sessions that corrected assumptions in the original plan. The
> plan text above has been updated to reflect these findings.

## N1 — Seek Latency: Real Numbers

The original plan assumed position-map seek would be ~50ms. Profiling in
Chrome DevTools (Performance tab, `performance.mark()` instrumentation in
`seek()`) against TEST (24,137 images, SSH tunnel) shows:

| Component | Time | Notes |
|-----------|------|-------|
| Forward ES fetch | 450-600ms | 200 hits, `_source: true`, PIT |
| Backward ES fetch | 250-350ms | 100 hits, reverse, PIT |
| Zustand `set()` | 0.4ms | Synchronous state swap — effectively zero |
| React render + paint | 90-155ms | ~300 image cells replaced in DOM |
| **Total (to paint)** | **850-1040ms** | Network = 82-91% of total |

**Key insight:** There is no "store overhead." The ~450ms overhead reported
by earlier Playwright-based measurements was an artefact of Playwright's
`page.evaluate()` round-trips, not real application cost. Zustand set() is
0.4ms. All time is network + irreducible React rendering.

**On PROD (no SSH tunnel):** estimated 250-450ms total.

## N2 — Full `_source` Threshold

Measured `_source` per image on TEST: avg 8,258 bytes JSON, ~20.6KB V8 heap.
At 65k images = 512MB JSON / 1.3GB V8 — impossible. The position map
(288 bytes/entry, 18MB at 65k) is the only viable index for large datasets.
This validates the project premise.

`BUFFER_CAPACITY=1000` caps `_fillBufferForScrollMode` — raising
`SCROLL_MODE_THRESHOLD` without raising `BUFFER_CAPACITY` is pointless.

## N3 — Bug Fix: `exactOffset` ReferenceError

Phase 3's implementation set `exactOffset = true` without declaring the
variable. Every position-map seek silently crashed (ReferenceError caught
by the catch block). All earlier position-map measurements were measuring
no-ops.

**Fix (2026-04-12):** Added `let exactOffset = false` in `seek()`. When
`exactOffset === true` (position-map or shallow from/size), use
`targetLocalIndex` directly for scroll positioning instead of reverse-
computing from scrollTop. Fixes both the crash and a scrubber thumb-jump
bug. All 242 tests pass.

## N4 — Parallel Forward+Backward Fetch

With the position map, both cursors for bidirectional seek are known upfront
(`cursorForPosition` for forward, `posMap.sortValues[targetPos]` for
backward). This enables `Promise.all` parallelisation:

- Sequential: ~750ms network (450 + 300)
- Parallel: ~450ms network (max of the two)
- Savings: ~250-350ms on TEST

Folded into Phase 4b (not a separate phase). Only activates when position
map is available; sequential fallback when `positionMap === null`.

## N5 — Cleanup

Four throwaway measurement test files deleted (2026-04-12):
`throwaway-seek-timing.spec.ts`, `throwaway-seek-breakdown.spec.ts`,
`throwaway-scroll-threshold.spec.ts`, `throwaway-parallel-seek.spec.ts`.

`performance.mark()` / `performance.measure()` instrumentation remains in
`search-store.ts` (zero-cost, useful for future profiling).

