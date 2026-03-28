# Audit Report: Windowed Scroll + Scrubber Work

**Scope:** 3 unpushed commits + uncommitted changes on `mk-next-next-next`
**Files:** 46 changed, ~10,200 new lines (net: +9,786)

## Line Budget Breakdown

| Category | Lines Added | % |
|---|---:|---:|
| **Feature code** (store, adapter, scrubber, hooks, views, sort-context, types) | ~2,840 | 28% |
| **Tests + test infra** (unit tests, mock data source, E2E specs, helpers, Playwright configs, scripts, env files) | ~4,580 | 45% |
| **Documentation** (search-after-plan, scrubber research, deviations, AGENTS.md) | ~2,770 | 27% |

Test-to-feature ratio is excellent (~1.6:1). The E2E suite alone (1,310 + 480 lines) is nearly half the feature code.

---

## Goal A — Performance

### A1. Render Paths

**[minor] [Scrubber.tsx:187-206] Pending-seek ref clearing runs on every render**
The `pendingSeekPosRef` clearing logic at lines 187-206 runs as part of the render body (not in a `useEffect`). It only mutates a ref, so no re-render cost — but it reads `isDragging` (state) and `currentPosition/total/loading` (props). This is fine because it's O(1), but the logic is unusual (imperative mutation during render). Consider documenting why this is intentional, or moving to `useMemo` for readability.
→ **No fix needed**, cosmetic only.

**[minor] [Scrubber.tsx:256-266] `thumbHeight`/`thumbTop` recomputed on every render**
These are simple arithmetic (~6 multiplications), not memoised. With the scrubber re-rendering only when `currentPosition`, `total`, `visibleCount`, `trackHeight`, or `isDragging` change, this is negligible.
→ **No fix needed.**

**[minor] [search.tsx:64-81] `getSortLabel` callback depends on `results` and `orderBy`**
The callback is recreated whenever `results` or `orderBy` changes. `results` changes on every extend (append/prepend), which creates a new `getSortLabel` function and passes it as a prop to `Scrubber`. However, Scrubber receives it via `getSortLabelRef.current` (ref-stabilised at line 171-172), so the new reference doesn't cause Scrubber re-renders. **Well handled.**
→ **No fix needed.**

**[minor] [search.tsx:51-56] Scrubber data subscribed at SearchPage level**
`total`, `bufferOffset`, `bufferLength`, `loading`, `seek`, and `visibleRange` are subscribed at the SearchPage level. Each `extendForward`/`extendBackward` changes `results.length` which changes `bufferLength`, re-rendering SearchPage, which re-renders both the Scrubber AND potentially the hidden ImageGrid/ImageTable. Since the views are hidden behind `opacity-0 pointer-events-none`, they still re-render in React's tree — they just don't cause layout.
→ **Minor concern** — the children are `ImageGrid` or `ImageTable`, but they subscribe to the store independently via `useDataWindow()`, so the SearchPage re-render only affects the JSX wrapper divs and Scrubber. **No real issue.**

**[moderate] [useDataWindow.ts:137-148] 12 separate `useSearchStore` selectors**
Each selector creates a subscription. Zustand's selector-based subscriptions are efficient (shallow compare per selector), but 12 selectors means 12 equality checks on every store update. For a store that updates frequently during scroll (extend operations update `results`, `bufferOffset`, etc.), this is ~12 reference comparisons per update across all components using `useDataWindow`.
→ **Acceptable**, but consider grouping into 2-3 selectors using `useShallow` if profiling shows churn. Low priority.

**[minor] [useDataWindow.ts:188-193] `getImage` recreated on every `results` change**
The `useCallback` depends on `results`. Since `results` changes on every extend, the callback is recreated. However, `getImage` is passed to the virtualizer's item renderer, and `GridCell` / table row components are `memo`'d — so the new callback reference causes a React comparison but not a re-render (because the cell's other props like `image` and `isFocused` are compared too). Stable enough.
→ **No fix needed.**

### A2. ES Query Paths

**[critical] [search-store.ts:1097-1115] Iterative search_after skip loop — O(N/chunkSize) ES requests for script sorts**
The script sort deep seek (Strategy B) iterates forward in chunks, each requiring a full ES round-trip. For a 1.3M dataset with `MAX_RESULT_WINDOW=101000` and `maxChunk=10000`, seeking to position 500k requires ~50 requests. Each request through an SSH tunnel takes ~50-200ms, totalling 2.5-10 seconds. The `MAX_SKIP_ITERATIONS=200` cap prevents infinite loops but allows up to 200 sequential requests.

This is inherent to the problem — `_script` sorts can't use percentile estimation or composite aggregation. The code correctly uses `noSource: true` to minimise payload. The 200-iteration cap and abort signal provide safety.
→ **Known limitation, well-documented.** No fix needed unless script sort deep seek is common in production. Consider a UI warning ("Dimensions sort: deep positions may be slow") if this becomes a user issue.

**[minor] [search-store.ts:406-411] sort-around-focus: `searchAfter` with `ids` filter**
Step 1 of `_findAndFocusImage` does `searchAfter({ ...params, ids: imageId, length: 1 }, null, null, signal)` — this is a from/size search (no cursor) with an `ids` filter. It works but hits `_doSearch` internally via the adapter, which includes `track_total_hits: true`. For a single-doc lookup, this is slightly wasteful (ES must count all matching docs). Using `getById` would be faster but doesn't return sort values.
→ **Acceptable trade-off** — getting sort values in one request is worth the minor overhead.

**[minor] [search-store.ts:462-478] sort-around-focus: two sequential requests (forward + backward)**
These could be parallelised with `Promise.all`, since both use the same cursor (the target image's sort values) and don't depend on each other. This would halve latency for the common case where the image is outside the buffer.
→ **Suggested fix: `Promise.all([forwardResult, backwardResult])`**. Low priority — sort-around-focus is already async and non-blocking.

**[minor] [es-adapter.ts:534-539] PIT open is a separate request**
`openPit` is always a separate HTTP request before the first search. Could be eliminated by using PIT-less search_after (which works fine for non-snapshot consistency, as already done for local ES). On real clusters, PIT provides snapshot isolation — the current approach is correct.
→ **No fix needed.**

**[moderate] [search-store.ts:602-605] PIT close is fire-and-forget**
Old PITs are closed via `dataSource.closePit(oldPitId)` without awaiting. This is correct (fire-and-forget is the standard pattern — ES auto-expires PITs), but if the user rapidly changes searches, multiple close requests may be in flight simultaneously. No abort signal is passed, so they can't be cancelled.
→ **Acceptable.** ES handles concurrent close requests gracefully.

### A3. DOM/Layout

**[minor] [Scrubber.tsx:381-382] `applyThumbPosition` during drag — direct DOM writes at 60fps**
During pointer drag, `onPointerMove` calls `applyThumbPosition` which writes `style.top` on thumb and tooltip elements directly. This bypasses React — correct pattern for 60fps drag. No forced reflow because `style.top` is a write-only operation (no reads before writes in the same handler). The `thumbTopFromPosition` helper reads `el.clientHeight` once per move event, which triggers layout if it was invalidated — but since nothing in this handler invalidates layout, the cached value is returned instantly.
→ **No fix needed.** Clean implementation.

**[minor] [Scrubber.tsx:225-230] ResizeObserver calls `setTrackHeight`**
Each ResizeObserver callback calls `setTrackHeight(entries[0]?.contentRect.height)`, triggering a React re-render. ResizeObserver fires once per frame at most. This is fine.
→ **No fix needed.**

**[minor] [ImageGrid.tsx:228-234] ResizeObserver for column count**
Same pattern — one state update per resize. The scroll anchor capture (`captureAnchor`) reads `el.scrollTop` and `el.clientHeight` in the ResizeObserver callback, which is safe (ResizeObserver runs between frames, no forced reflow risk).
→ **No fix needed.**

### A4. Memory

**[minor] [search-store.ts:317-330] `buildPositions` creates a new Map on every call**
`buildPositions` with an `existing` map clones it via `new Map(existing)`. For a 1000-entry buffer, this creates a 1000-entry Map on every extend. The old Map is then GC'd.
→ **Acceptable.** Map creation is O(n) with small constant. An in-place mutation alternative would save the clone but sacrifice immutability (Zustand depends on reference identity for change detection).

**[minor] [search-store.ts:336-350] `evictPositions` also clones the Map**
Same pattern — `new Map(map)` then deletes entries. Combined with `buildPositions`, a single `extendForward` creates two Map copies (one for building, one for evicting). Still O(n) and bounded by BUFFER_CAPACITY.
→ **Acceptable.**

**[moderate] [search-store.ts:235-260] Module-level state not cleaned up on HMR**
`_newImagesPollTimer`, `_rangeAbortController`, `_seekCooldownUntil`, `_scrollTookWindow`, `_aggDebounceTimer`, `_aggAbortController` are module-level variables. During Vite HMR, the module is re-executed but old timers/controllers from the previous module instance aren't cleaned up. This could cause leaked intervals in dev mode.
→ **Dev-only issue.** No production impact. Could be fixed with `import.meta.hot?.dispose()` if it becomes annoying during development.

**[minor] [Scrubber.tsx:232-249] Wheel event listener not cleaned up**
The `wheel` listener added in `trackCallbackRef` has no explicit teardown. The comment explains this is intentional — the element is removed from the DOM when total ≤ 0, and the listener is GC'd. This is correct because the callback ref fires with `null` when the element unmounts, at which point the observer is disconnected but the wheel listener on the now-detached element is harmless (never fires).
→ **Acceptable** but slightly impure. Could track and remove in the `if (!el) return` branch for cleanliness.

**PIT cleanup:** `closePit` is called fire-and-forget in `search()` when starting a new search. If the component unmounts without a final search (e.g. navigating away), the PIT stays open until ES expires it (5 min). This is standard practice.
→ **No fix needed.**

**Buffer eviction:** Correctly implemented in both `extendForward` (evict from start, lines 716-728) and `extendBackward` (evict from end, lines 803-811). `evictPositions` keeps the `imagePositions` Map consistent. BUFFER_CAPACITY = 1000 at ~5-10KB/image = 5-10MB. Comfortable.
→ **Well implemented.**

---

## Goal B — Code Quality

### B1. `search-store.ts` (1,332 lines)

**Assessment: Too large but well-organised internally.** The file is a single Zustand store with clearly delineated sections:
- Constants (34-100)
- Interface (106-229)
- Module-level state (232-260)
- Helpers (264-362)
- `_findAndFocusImage` (384-532) — standalone async function
- Store creation (538-1323)

**Extractable modules:**
1. **`_findAndFocusImage`** (148 lines) — already a standalone function. Could live in `sort-around-focus.ts` with `get`/`set` injected. Easy extraction, moderate value.
2. **Deep seek logic** (lines 878-1153 inside `seek()`) — the three seek strategies (shallow from/size, percentile+search_after, keyword composite, script iterative) are 275 lines of algorithmic code. Could be extracted to `seek-strategies.ts`. High value — this is the most complex logic in the store.
3. **Buffer helper functions** (`buildPositions`, `evictPositions`, `updateScrollAvg`) — already pure functions. Could move to `buffer-utils.ts`. Low value — they're short and closely tied to the store.
4. **Aggregation actions** (lines 1233-1322) — 90 lines, self-contained. Could move to a separate store or a slice. Moderate value.

**Recommendation:** Extract #2 (seek strategies) and #1 (sort-around-focus). These are the largest coherent units. The remaining store would be ~900 lines — still large but manageable.

### B2. `Scrubber.tsx` (558 lines)

**Assessment: Well-structured.** The component is a single function with inline logic. The drag handler (lines 343-417) is a self-contained closure — cleanly separated from click (310-328) and keyboard (423-456).

**Extractable hooks:**
1. **`useScrubberDrag`** — the pointer event handler + DOM position tracking. ~75 lines. Moderate value — would clean up the component but add indirection.
2. **`useTrackResize`** — ResizeObserver + wheel forwarding. ~35 lines. Low value — tightly coupled to the component.

**The `pendingSeekPosRef` logic** (lines 174-206) is the most subtle part — it prevents thumb snap-back during in-flight seeks. It's well-commented but unusual (imperative mutation during render). Worth a dedicated comment block explaining the state machine.

**Recommendation:** The file is at the boundary — 558 lines with clear sections. I'd leave it as-is unless it grows further. The drag logic is already self-contained within a single callback closure.

### B3. `useDataWindow.ts` (228 lines)

**Assessment: Clean and minimal.** The API surface is exactly right — it bridges store subscriptions and provides `reportVisibleRange` + `getImage` + `findImageIndex`. The module-level visible-range external store (lines 41-71) is clever — it avoids React re-renders for the high-frequency scroll position updates, exposing them via `useSyncExternalStore` only to the Scrubber.

**Minor concern:** The hook returns ~15 fields as a flat object. Consider grouping into `{ data: { results, bufferOffset, total, ... }, actions: { extendForward, seek, ... } }` for clarity. Very low priority.

### B4. `es-adapter.ts` (950 lines)

**Assessment: Mixed concerns, but acceptable for now.**

The class mixes:
1. **Query building** (`buildQuery`, `buildSortClause`) — pure functions, already extracted as module-level
2. **Sort utilities** (`reverseSortClause`, `parseSortField`) — pure functions, exported
3. **HTTP transport** (`esRequest`, `esRequestRaw`) — instance methods
4. **Domain methods** (`searchAfter`, `countBefore`, `estimateSortValue`, `findKeywordSortValue`) — instance methods that use all of the above

**Separable units:**
1. `buildQuery` + `buildSortClause` + aliases + scriptSorts → `es-query-builder.ts`. These are already pure functions (130 lines). **High value** — they're useful independently for tests and debugging.
2. `parseSortField` + `reverseSortClause` → `sort-utils.ts` (50 lines). Low value.
3. `countBefore` + `estimateSortValue` + `findKeywordSortValue` → These are domain methods that depend on `esRequest`. Extracting them would require passing the transport layer. Low value.

**Recommendation:** Extract query building (#1). The rest is fine as a single class.

### B5. Naming, Comments, Dead Code

**Dead code:**
- **[moderate] `search()` and `searchRange()` on `ElasticsearchDataSource`** (lines 357-421) — the store no longer calls these. Everything goes through `searchAfter()`. The `search()` method includes its own `AbortController` management that's now redundant (the store manages abort controllers). These methods remain on the `ImageDataSource` interface.
→ **Suggested: Remove from interface and implementation** if no other consumer exists. Currently the interface has both `search`/`searchRange` AND `searchAfter` — the former are vestigial.

- **[minor] `SORT_KEY_ALIASES` in `sort-context.ts` line 61** — empty object `{}` with comment "Aliases are no longer needed". Dead code.
→ **Remove it.**

**Naming:**
- `_lastPrependCount` / `_prependGeneration` — the underscore prefix is unconventional for Zustand state that views consume. The intent (private/internal) is clear but it's not enforced. No action needed.
- `noSource` parameter (line 563) — clear but slightly terse. `omitSource` or `fieldsOnly` might be clearer. Very minor.
- `missingFirst` parameter (line 564) — contextually clear given the comment, but only makes sense if you know ES `missing` sort behavior. The inline comment is sufficient.

**Comments:** Excellent throughout. Every function, parameter, and tricky block has explanatory comments. The module-level docstring on `search-store.ts` (lines 1-18) is a perfect entry point. The bug-report test comments in `scrubber.spec.ts` (e.g. lines 744-755 for Bug #11) are exemplary — they document what, why, and the fix.

**No stale comments found.** No TODO/FIXME markers in any source file.

### B6. Test Quality

**Unit tests (`search-store.test.ts` + `search-store-extended.test.ts` + `es-adapter.test.ts` + `field-registry.test.ts`):**

Total: 684 + 759 + 141 + 184 = 1,768 lines of unit tests.

**Strengths:**
- Tests are behavioural, not implementation-coupled. They test observable state (`results`, `bufferOffset`, `imagePositions`) after sequences of actions.
- `assertPositionsConsistent` is called after every mutation — this invariant check would catch the global/local index bug that motivated the test suite.
- Edge cases covered well: empty dataset, single item, concurrent seeks, seek-beyond-total.
- Request counting tests (lines 720-757 in extended test) validate ES efficiency.

**Gaps:**
1. **[moderate] No test for `parseSortField` with expanded object format** — `{ field: { order: "desc", missing: "_first" } }`. `parseSortField` returns `direction: "asc"` for this format (line 945: `typeof val === "string"` fails, defaults to `"asc"`). Not currently a bug because these clauses are only produced by `missingFirst` and go directly to ES, but if `parseSortField` is ever called on them, it would silently return the wrong direction.
→ **Add a `parseSortField` test for expanded format** to prevent future regressions.

2. **[minor] No unit test for `interpolateSortLabel` with keyword sort outside buffer** — the extended tests check it at line 214-221 but only for the `lastVal` edge case (position above buffer). The `firstVal` case (position below buffer after seek) is tested at lines 193-201 but only for date sort.
→ Low priority.

3. **[minor] Shared helper duplication** — `state()`, `actions()`, `flush()`, `waitPastCooldown()`, `waitFor()`, `assertPositionsConsistent()` are duplicated between the two test files. Extract to a shared `test-helpers.ts`.
→ **Easy cleanup, moderate value.**

4. **[minor] No unit test for `findKeywordSortValue` or `estimateSortValue`** — `es-adapter.test.ts` only tests `buildSortClause`. The deep seek paths through these methods are only covered by E2E tests. Unit tests with a mock ES would be valuable.
→ Low priority — the E2E coverage is strong.

**E2E tests (`scrubber.spec.ts` + `helpers.ts`):**

1,310 + 480 = 1,790 lines. Excellent coverage. Tests cover:
- Scrubber visibility, ARIA semantics, position tracking
- Seek accuracy (click, drag, keyboard)
- Buffer extension (forward/backward)
- Density switch (focus preservation, position preservation)
- Sort change (reset, direction toggle, sort-around-focus)
- Bug regression tests (11 named bugs with root-cause documentation)
- Scroll stability (concurrent seeks, wheel forwarding)

**KupuaHelpers** is well-designed — encapsulates all page interactions behind semantic methods. The `assertPositionsConsistent` helper (line 160-178) runs the same invariant check as the unit tests, but in the browser context.

---

## Goal C — Self-Containment / Feature-Switch Feasibility

### C1. What's Entangled?

**Inherently windowed-search-specific (would be removed by feature switch):**
- `search-store.ts`: `seek()`, `extendForward()`, `extendBackward()`, buffer management, `_findAndFocusImage`, PIT lifecycle, cursor management, `_seekGeneration`, `_prependGeneration`, cooldown logic — ~800 lines
- `Scrubber.tsx`: entire component (558 lines)
- `useDataWindow.ts`: `reportVisibleRange`, extend triggers, visible-range external store — ~100 lines
- `es-adapter.ts`: `searchAfter()`, `countBefore()`, `estimateSortValue()`, `findKeywordSortValue()`, `openPit()`, `closePit()` — ~500 lines
- `sort-context.ts`: `interpolateSortLabel` — ~65 lines (label interpolation only matters for scrubber)
- `types.ts`: `SearchAfterResult`, `SortValues`, `BufferEntry`, new methods on `ImageDataSource` — ~90 lines
- `mock-data-source.ts`: entire file (272 lines, mock for search_after)
- View scroll compensation: `_prependGeneration`/`_seekGeneration` effects in ImageGrid (lines 376-411) and ImageTable

**General improvements that exist regardless (keep either way):**
- `buildSortClause` with clean aliases and tiebreaker — already needed for correct pagination
- `reverseSortClause` — needed for any backward pagination
- `parseSortField` — needed by `countBefore`
- `field-registry.ts` enhancements (if any)
- E2E testing infrastructure (Playwright config, helpers, scripts) — useful for any testing
- CSS `hide-scrollbar-y` fix (Bug #9)
- Scroll reset deduplication
- `imagePositions` Map for O(1) ID→index lookup

### C2. What Would a Feature Boundary Look Like?

**Option A: Two store implementations behind an interface.**
The `SearchState` interface (lines 106-229) defines everything — actions, state shape, derived values. A "classic" implementation would use `from/size` pagination, no cursors, no buffer management, no scrubber data. The views already consume `useDataWindow()`, which could abstract over both.

**Coupling points that make this hard:**
1. **View scroll compensation** — `_prependGeneration`, `_seekGeneration`, `_seekTargetLocalIndex` are deeply wired into `ImageGrid.tsx` and `ImageTable.tsx`. The classic mode wouldn't have these, but the views would need to handle their absence.
2. **`useDataWindow` return type** — `reportVisibleRange` only makes sense for windowed mode. Classic mode would need a simpler version that just calls `loadMore` near the bottom.
3. **Scrubber component** — conditionally rendered based on mode. Easy.
4. **`imagePositions` Map** — useful in both modes (for focus-by-ID), but the global/local index distinction only matters in windowed mode (classic: `bufferOffset` is always 0).

**Option B: Single store, conditional paths.**
`seek()` becomes a no-op or falls back to `from/size` in classic mode. `extendForward` becomes `loadMore`. `extendBackward` disappears. The store would need an `isWindowed` flag affecting ~10 code paths.

### C3. Honest Cost/Benefit — Push Back

**The feature switch is not worth the abstraction tax. Here's why:**

1. **The "classic" mode has no users.** Kupua isn't deployed to anyone — it's a prototype. There's no backward-compatibility obligation. The windowed mode is strictly better in every dimension: it handles >10k results (which classic can't), provides position awareness, and enables sort-around-focus.

2. **The abstraction cost is high.** The windowed buffer touches 8+ files with deep integration into view scroll handling. Creating a clean interface boundary would require:
   - A `PaginationStrategy` interface with two implementations
   - Conditional rendering of Scrubber vs. "Load More" button
   - Conditional scroll compensation logic in both views
   - Two `MockDataSource` variants for tests
   - Doubled test surface (every test × 2 modes)

   Estimated: 500-800 lines of pure abstraction code with no user-facing benefit.

3. **The risk of the windowed implementation is already mitigated.** The 1,768 lines of unit tests + 1,310 lines of E2E tests cover the critical paths. The deep seek strategies degrade gracefully (keyword → from/size fallback, script → iterative with caps). PIT is optional (skipped on local ES).

4. **If you ever need to revert, `git revert` the 3 commits.** That's simpler and cheaper than maintaining a feature flag in perpetuity.

**Recommendation: Ship the windowed version. Delete the legacy `search()` / `searchRange()` methods from the interface and adapter. The old code paths are dead weight.**

---

## Summary of Actionable Findings

| # | Severity | File | Finding | Suggested Fix |
|---|----------|------|---------|---------------|
| 1 | **moderate** | `es-adapter.ts:943-945` | `parseSortField` doesn't handle expanded object format `{ field: { order, missing } }` | Add `typeof val === "object"` branch extracting `val.order`. Not currently a bug but latent. |
| 2 | **moderate** | `es-adapter.ts:148` | `reverseSortClause` same issue — defaults to "asc" for non-string values | Same fix as #1. |
| 3 | **moderate** | `es-adapter.ts:357-421` | `search()` and `searchRange()` are dead code — store uses only `searchAfter()` | Remove from interface and implementations. |
| 4 | **moderate** | `search-store.ts` | 1,332 lines — seek strategies + sort-around-focus are extractable | Extract to `seek-strategies.ts` (~275 lines) and `sort-around-focus.ts` (~150 lines). |
| 5 | **minor** | `search-store.ts:462-478` | sort-around-focus forward+backward requests are sequential | Parallelise with `Promise.all`. |
| 6 | **minor** | `sort-context.ts:61` | `SORT_KEY_ALIASES = {}` is dead code | Delete. |
| 7 | **minor** | `search-store.test.ts` / `extended` | Test helper duplication | Extract to shared `test-helpers.ts`. |
| 8 | **minor** | `es-adapter.test.ts` | No test for `parseSortField` with object values | Add test case. |
| 9 | **minor** | none | Feature switch not worth it | Ship windowed, delete legacy methods. |

No critical performance issues found. The architecture is sound, the hot paths are efficient, and the test coverage is excellent for a prototype of this scope.

