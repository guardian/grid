# Kupua Bug-Hunt Audit Findings

**Date:** 28 April 2026
**Status:** Batch A complete (28 April 2026). Bugs #1, #2, #19, #20 fixed. Bug #13 confirmed not a real bug — see note. Batch B in progress: Bug #9 fixed (28 April 2026).

---

## Section 1 — Methodology actually used

**Files read end-to-end:**
- `src/stores/search-store.ts` (3,580 lines)
- `src/hooks/useScrollEffects.ts` (985 lines)
- `src/hooks/useDataWindow.ts` (460 lines)
- `src/hooks/useUrlSearchSync.ts`
- `src/lib/orchestration/search.ts`
- `src/lib/build-history-snapshot.ts`
- `src/hooks/useImageTraversal.ts`
- `src/hooks/useListNavigation.ts`
- `src/lib/reset-to-home.ts`
- `src/hooks/useReturnFromDetail.ts`
- `src/lib/image-offset-cache.ts`
- `src/lib/history-snapshot.ts`
- `src/dal/es-adapter.ts` (all 1,440 lines)
- `src/types/image.ts`
- `src/components/ImageDetail.tsx` (first ~440 lines — JSX render skipped)
- `src/components/Scrubber.tsx` (targeted: seek, scroll mode, pending seek)
- `src/dal/adapters/elasticsearch/sort-builders.ts` (first 60 lines)

**Files scanned/sampled:**
- `src/components/ImageGrid.tsx`, `src/components/ImageTable.tsx` — searched for `arrivingImageIds`, `enterDetail`.
- `AGENTS.md`, `deviations.md`, `preexisting-bugs-found-during-history-work.md`, `changelog.md` — full read for context.

**Heuristic for "is a bug":** code path exists (provable from source), triggers on a user-reachable condition, would produce observable wrong behaviour (wrong data, wrong scroll position, lost user state, broken interaction, infinite loop). Intentional deviations per `deviations.md` excluded. Fixes documented in `changelog.md` verified before listing.

**Could not assess without running the app:**
- Whether seek drift in deep percentile paths exceeds PAGE_SIZE.
- Race window sizes for timing-dependent bugs.
- Whether ES returns consistent sort value lengths for null-zone edge cases on real data.

---

## Section 2 — Bug inventory

| # | Title (≤8 words) | File:line(s) | Severity | Frequency-class | Trigger conditions | User-visible symptom | Affected scroll modes | Confidence | Repro hypothesis |
|---|---|---|---|---|---|---|---|---|---|
| 1 ✅ FIXED | `_pendingFocusAfterSeek` not cleared on `search()` | `search-store.ts:1749` | S1 | F-Edge | Explicit focus + Home/End seeks + user changes query/sort before seek completes | After query/sort change, first or last image of new results is auto-focused — user cannot remove the phantom focus intent | scroll, seek, two-tier | High | Focus image → press End (triggers seek) → immediately change query before seek arrives → observe first/last image of new results being auto-focused |
| 2 ✅ FIXED | `_pendingFocusDelta` not cleared in `seek()` | `search-store.ts` (seek path) | S1 | F-Edge | Arrow key on focused image outside buffer (snap-back seek) + scrubber seek issued before snap-back arrives | `seek()` sets `loading: true` and replaces buffer. `_pendingFocusDelta` is only cleared in `search()` (line 1749) and `seekToFocused()` (line 1696). Effect #9 consumes the stale delta after the scrubber seek lands, jumping focus to a wrong image | all | Medium | Focus → scrubber-seek → immediately press arrow key → during the snap-back, scrubber-seek again → observe focus delta applied at wrong global position |
| 3 | Scrubber `pendingSeekPosRef` not cleared on aborted seek | `Scrubber.tsx:371-375` | S2 | F-Edge | Seek mode, two rapid scrubber drags — second drag starts before first seek's data arrives | `pendingSeekPosRef.current` is cleared only when `positionChanged || loadingFinished`. On abort, `loading` does not transition true→false (`search-store.ts:3425` returns without setting it). Thumb stays frozen at the first target until the second seek completes | seek | High | Seek mode + drag scrubber rapidly to two different positions: thumb frozen at first position instead of tracking second drag |
| 4 | Two-tier `_viewportAnchorId` stale when fully in skeleton zone | `useDataWindow.ts:435-465` | S2 | F-Common | Two-tier mode + phantom focus + user scrolled fully into skeleton zone | Viewport-centre global index falls outside the buffer; `localIdx < 0 || localIdx >= results.length` skips every iteration; `_viewportAnchorId` stays at its last valid value. That stale anchor then drives snapshot capture, sort-around-focus fallback, and density-focus | two-tier | High | Two-tier + phantom → scroll fully into skeleton zone → change query → observe position restored to old anchor (deep in buffer) instead of current scroll position |
| 5 | `_scrollSeekTimer` never cleared on component unmount | `useDataWindow.ts:197` (module-level `let _scrollSeekTimer`) | S2 | F-Edge | Two-tier mode + rapid navigation away from search page within 200 ms + scroll position in skeleton zone | Module-level `setTimeout` (line ~350) fires after 200 ms even if the component unmounted. `seekRef.current` points to the current seek function — fires a seek in the wrong context | two-tier | Medium | Two-tier → scroll to skeleton zone → immediately navigate to image detail and back within 200 ms → observe spurious seek |
| 6 | Density-switch rAF chain not cancelled when `saved == null` | `useScrollEffects.ts:~983` | S2 | F-Common | Table→grid density switch with no saved density-focus state, followed by rapid unmount | `useLayoutEffect` returns a cleanup that cancels rAF1/rAF2 only in the `saved != null` branch. The `else` branch schedules rAFs without a cleanup, so they may fire on a dead virtualizer | all | Medium | Rapidly toggle table↔grid; observe console errors from virtualizer calls after unmount |
| 7 ✅ FIXED | `restoreAroundCursor` reset by image traversal mid-restore | `ImageDetail.tsx:200-204` | S2 | F-Edge | Detail view on reload: `restoreAroundCursor` in flight + user presses arrow key before it completes | `offsetRestoreAttempted.current` resets when `restoreAttemptedForRef.current !== imageId`. Arrow key changes `imageId` → flag resets → after the async restore completes and `currentIndex` briefly goes -1, another `restoreAroundCursor` fires for the new imageId with potentially-stale cursor. Double ES request; may land at the wrong position | all | Medium | Deep-link image detail → during loading, quickly press arrow key → observe duplicate `restoreAroundCursor` calls |
| 8 | `useReturnFromDetail` early-returns in phantom mode | `useReturnFromDetail.ts:76-80` | S2 | F-Common | Phantom mode + user opens detail without an explicit focus + closes detail | `previousFocus = focusedImageIdRef.current` is null in phantom mode (the click does not set focus). The guard `if (previousFocus === null) return` (line 79) fires → `setFocusedImageId(wasViewing)` never called → list never scrolls to centre the image just viewed | all (phantom) | High | Phantom mode → click image (opens detail) → close detail → observe scroll position NOT centred on the viewed image |
| 9 ✅ FIXED | `extendBackward` column-trim may produce empty result | `search-store.ts:2231-2239` | S2 | F-Edge | Backward fetch returns fewer than `PAGE_SIZE` items AND the count is not a multiple of `geo.columns` | Example: `bufferOffset=2`, `columns=3`, server returns 2 items → `excess = 2 % 3 = 2` → `result.hits.slice(2)` = `[]` → guard returns early. The first 2 items are permanently inaccessible via backward extend (only Home seek can reach them) | scroll, two-tier | High | 3-column grid + small result set near start with `bufferOffset=2` → trigger `extendBackward` → observe items 0-1 never appearing |
| 10 | `aria-label` string used as table/grid geometry discriminator | `search-store.ts:3271, 3291`, `build-history-snapshot.ts:98` | S3 | F-Common | The `aria-label` `"Image results table"` ever changes (i18n, accessibility refactor) | `seek()` and `buildHistorySnapshot()` detect table mode via `scrollEl.getAttribute("aria-label")?.includes("table")`. A label change silently degrades to grid heuristics; row height computed as 303 px instead of 32 px → `scrollTargetIndex` orders of magnitude off → permanent skeletons or jump to wrong position | all | High | Foot-gun, not current breakage. Trigger by renaming the aria-label |
| 11 | `seek()` `_seekTargetGlobalIndex` may overflow with large null-zone drift | `search-store.ts:3360-3376` | S2 | F-Edge | Inexact deep seek (percentile estimation) + two-tier mode + null-zone filter active + large drift | When `usedNullZoneFilter = true`, `effectiveTotal = get().total` is used for the `inTwoTier` check (line 3364). Large drift between estimated and actual offset places `_seekTargetGlobalIndex` far from the window's scrollTop. Effect #6 sets a clamped scrollTop → skeletons | two-tier | Medium | Null-zone seek in two-tier mode (rare) + large estimated/actual drift → observe Effect #6 setting scroll to wrong position |
| 12 | `fallbackFirstPage` does not reset scroll position | `search-store.ts:1894-1900` (sort-around-focus path) | S2 | F-Edge | Sort-around-focus search + image not found AND no neighbours found → falls back to first page | When `_findAndFocusImage` falls back to `fallbackFirstPage`, it sets new buffer + `loading: false` without bumping `_scrollReset`. Scroll stays at the old deep position while new first-page results are shown | all | Medium | Focus image → change query to a completely different one (image and neighbours both filtered out) → observe scroll position stays deep while new first-page results show at the top |
| 13 ❌ NOT A BUG | `fetchSortDistribution` not inside `seek()` try/catch | `search-store.ts:2555-2562, 3420` | S2 | F-Common | First scrubber seek on a non-uploadTime sort (credit, lastModified) when the agg fails | `seek()` awaits `get().fetchSortDistribution()` (line 2556) before computing the percentile. Throws from `fetchSortDistribution` escape the seek error boundary at line 3420 — the seek is lost rather than degrading gracefully. (The success path also adds a 200-1000 ms hang on first click — by design per the comment, but undegradable on failure) | seek | High | First scrubber click on credit/lastModified sort → if the agg request fails, observe lost seek and uncaught throw rather than fallback |
| 14 | `extractSortValues` returning null blocks subsequent extends | `search-store.ts:2139-2148` (extendForward), `2279-2284` (extendBackward) | S2 | F-Edge | Extend + eviction + the new boundary item has missing/undefined sort fields | After eviction, the cursor for the opposite direction is recomputed via `extractSortValues`. If it returns `null` (sort field path undefined on the boundary image), the cursor becomes `null` and the opposite-direction extend is permanently blocked (`if (!startCursor) return`) until the next seek/search | scroll, seek | Medium | Fill buffer past 1000 items with a sort field that is undefined on the boundary image → scroll in opposite direction → observe stall |
| 15 | `_scrollSeekTimer` fires with stale `globalStart` after fast scroll | `useDataWindow.ts:~353` | S2 | F-Edge | Two-tier mode: user scrolls fast through the skeleton zone, viewport keeps moving during the 200 ms debounce | The debounced timer captures `globalStart` at creation. If the user keeps scrolling past it, the seek fires at the original position — viewport may be hundreds of items further down. User sees a jump-back | two-tier | High | Two-tier + fast scroll into skeleton zone → observe seek landing behind current viewport |
| 16 | `restoreAroundCursor` does not re-focus the image | `search-store.ts:~3540` | S2 | F-Common | Reload of a deep image detail → `restoreAroundCursor` fires → image enters buffer | `restoreAroundCursor` sets seek-related fields but never sets `focusedImageId`. Image visible but no focus ring (explicit) / no phantom pulse. On detail close, `useReturnFromDetail` reads `previousFocus = null` → early return → no centring. User left at random scroll position | all | High | Reload page on deep image detail → close detail → observe no scroll centring on the previously-viewed image |
| 17 ❌ NOT A BUG | `search()` and `seekToFocused()` may both write the buffer | `search-store.ts:1201, 1425, 1698, 1788` | S2 | F-Edge | Arrow snap-back (`seekToFocused`) in flight + `search()` triggered by URL param change at the same time | **Not a bug.** `_findFocusAbortController` (line 484) isolates `seekToFocused` from `search()`. `search()` aborts `_findFocusAbortController` (line 1771), killing all stages of `seekToFocused`'s `_findAndFocusImage` call — including step 3 (buffer load via `combinedSignal`). JS single-threading prevents post-await/pre-`set()` interleaving. `search()` always wins; no double buffer write is possible. | all | Medium | N/A — confirmed non-issue |
| 18 | `_prevSearchOnly` sort-only detection misclassifies key-removal | `orchestration/search.ts:215`, `useUrlSearchSync.ts:181` | S2 | F-Common | Sort change combined with filter clearing (key disappearing from the URL) | The `every()` check treats a key missing from `searchOnly` but present in `prev` as `undefined === undefined` (equal). A combined "sort + filter clear" is misclassified as sort-only, triggering the sort-only-reset path in phantom mode when it should preserve the phantom anchor | all | Medium | Clear a filter AND change sort simultaneously → observe phantom anchor lost |
| 19 ✅ FIXED | PIT retry regex `/40[04]/` doesn't match 410 | `es-adapter.ts:602` | S2 | F-Edge | `searchAfter` (extend or seek) where the PIT has expired and the proxy/ES returns HTTP 410 | Comment says "PIT 404/410" but `[04]` is the character class `0` or `4` — matches 400 and 404 only. 410 (canonical for an expired/closed resource) bubbles up to `seek()`'s catch (`search-store.ts:3420`) → `error: "Seek failed"`. User's scrubber drag produces no navigation | seek, scroll | Medium | Slow connection + extend/seek just after PIT expiry returning 410 → observe "Seek failed" instead of transparent retry |
| 20 ✅ FIXED | `findKeywordSortValue` discards approximation on mid-walk error | `es-adapter.ts:945` | S2 | F-Edge | Keyword sort (credit, source, imageType) + deep seek + transient network error during composite agg page walk (page ≥ 2) | On non-abort errors, the catch logs `console.warn` and `return null` — discarding `lastKeywordValue`. `seek()` (`search-store.ts:3046`) treats null as "field not aggregatable" → fallback to capped from/size at ≈ 9,800. A target at position 200,000 lands at ~9,800. Fix: `return lastKeywordValue` after the warn | seek | High | Keyword sort + seek to position > 100k + simulate transient fetch failure mid-seek → observe seek landing at ~9,800 |
| 21 | `searchAfter` PIT-expiry fallback returns no `pitId`; degraded extends cascade | `es-adapter.ts:629` | S2 | F-Edge | PIT keep-alive (1 min) exceeded during an active scrolling session | Fallback returns `{ hits, total, sortValues }` with no `pitId`. Store keeps the stale expired pitId. Every subsequent extend re-sends the expired PIT → another 404 → another fallback. Cascade continues until the next `search()`. On live ES, degraded extends lack snapshot isolation — newly-indexed images can appear mid-scroll | scroll, two-tier | High | Leave app idle > 1 min → scroll slowly → observe multiple `"PIT expired/closed, retrying without PIT"` warnings |
| 22 | `getVisibleImageIds` empty when viewport is fully in skeleton zone | `useDataWindow.ts:173-195` | S2 | F-Common | Two-tier mode + phantom + viewport centre is in skeleton zone + any query/filter change | When `centre = round((_visibleStart + _visibleEnd) / 2)` is outside the buffer, every `localIdx` is skipped → empty `visibleNeighbours` → `search()` falls back to a more expensive ES query for neighbours. Degraded fallback, not corruption | two-tier | High | Two-tier + phantom + scrolled into skeleton zone → change query → observe extra ES round-trip from neighbour batch-check |
| 23 | `computeScrollTarget` row math sensitive to rendered row-height drift | `search-store.ts:129` | S3 | F-Rare | Grid view + seek + retina display where rendered row height differs from `GRID_ROW_HEIGHT = 303` by ~1 px | `Math.floor(scrollTop / 303)` produces `currentRow` off-by-one when rendered rows are 302 or 304 px (CSS gap rounding, sub-pixel borders). Resulting `reverseIndex` is off by `cols`; Effect #6 fires a correction. Net: 1-row visible jump after seek | scroll, seek | Low | Difficult to repro without retina + specific scroll position |
| 24 | `_scrollReset` gen=0 guard is dead after first search | `search-store.ts:1651`, `useScrollEffects.ts:~627` | S3 | F-Always (latent) | Any state after the first search of a session | `_scrollReset.gen` starts at 0; Effect #7b guards `if (scrollReset.gen === 0) return`. Every search bumps gen, so after the first search the guard is permanently inactive. Foot-gun: any future code that resets the value to gen 0 expecting "no scroll reset" will silently still trigger one | scroll, seek | High | Inspect only; not currently user-visible |
| 25 | `_isInitialLoad` not reset by `resetToHome` | `search-store.ts:1953`, `resetToHome` | S3 | F-Common | After `resetToHome`, the very first sort-around-focus result of the new session | `_isInitialLoad` is set to `false` on first results and never reset. Phantom pulse fires on the first sort-around-focus result of a new session, contradicting the documented "pulse only after a user action" intent. Brief glow; not destructive | all (phantom) | High | Cosmetic |
| 26 | `_lastKupuaKey` survives across non-search routes | `useUrlSearchSync.ts:45` (module-level) | S3 | F-Edge | Future: kupua adds a non-`/search` route, user navigates from there into `/search` via fresh nav (not Back) | `_lastKupuaKey` is module-level, never cleared. On returning via fresh nav (not Back), it captures snapshots against the wrong entry. Latent: no non-search routes exist today | all | Low | Future foot-gun; revisit when new routes added |
| 27 | `ImageDetail` synthesis re-fires if browser clears `history.state` | `ImageDetail.tsx:132-133` | S3 | F-Edge | Browser aggressively clears `history.state` (some iOS Safari PWA scenarios) | If `history.state?._bareListSynthesized` is undefined (state cleared), the synthesis check passes → duplicate bare-list entry inserted → user needs an extra Back press to exit kupua | all | Low | Needs investigation on real iOS Safari |
| 28 | `fetchPositionIndex` uses wrong `missing` direction for desc fields | `es-adapter.ts:1218-1225` | S3 | F-Rare | Any sort with a nullable secondary field (currently uploadTime/id are never null — latent) | `phase1Sort` produces `missing: "_first"` for desc clauses, contradicting ES's default of `missing: "_last"`. Position-map ordering would diverge from main search ordering, causing seeks to land at wrong images | all | High | Latent: add a nullable secondary sort field and observe position-map seek errors |
| 29 | `frozenParams` not effective in `seek()` no-PIT path | `search-store.ts:857, ~2420` | S3 | F-Edge | Local ES (no PIT) + new images arriving + user seeks during fill | On local ES, `frozenParams` caps `until` but ES does not enforce snapshot isolation. New images may appear if they sort into the current window. Known deviation per `deviations.md` §5; non-issue in production | all (local) | Low | Local ES only |

---

## Section 3 — Bug clusters

| Cluster name | Bug #s | Suspected shared root cause | File:line of suspected root |
|---|---|---|---|
| **Stale "pending intent" state not cleared on `search()`** | 1, 2 | `search()` clears `_pendingFocusDelta` but not `_pendingFocusAfterSeek`; `seek()` clears neither. Both are pending focus intents that leak across unrelated search contexts | `search-store.ts:1749` |
| **Module-level state across route/density/unmount transitions** | 5, 26 | Module-level timers and flags (`_scrollSeekTimer`, `_lastKupuaKey`) are never reset on route transitions — singletons used for per-session state | `useDataWindow.ts:197`, `useUrlSearchSync.ts:45` |
| **`extractSortValues` returning null blocks extends** | 14 | Both `extendForward` and `extendBackward` recompute the opposite-direction cursor via `extractSortValues`; null cursors block the next extend | `search-store.ts:2139, 2280` |
| **`aria-label` string as geometry discriminator** | 10 | `seek()` and `buildHistorySnapshot()` both detect table vs grid by checking if `aria-label` includes "table" on the scroll container | `search-store.ts:3271`, `build-history-snapshot.ts:98` |
| **PIT lifecycle handled inconsistently** | 19, 21 | `searchAfter` PIT-expiry path: regex misses 410, and the fallback path returns no `pitId` so the store keeps the expired one | `es-adapter.ts:602, 629` |
| **Skeleton-zone viewport math** | 4, 15, 22 | Three independent symptoms (stale anchor, stale debounced seek, empty neighbours) all stem from viewport indices being valid globally but invalid as `localIdx` once the buffer slides away | `useDataWindow.ts` |

---

## Section 4 — Areas not audited

| Area | File(s) | Reason |
|---|---|---|
| Touch gesture hooks | `useSwipeCarousel.ts`, `useSwipeDismiss.ts`, `usePinchZoom.ts` | Time budget; mobile-only; low expected bug density |
| Scrubber JSX/tick math | `Scrubber.tsx` (render path) | ~600 lines of tick/label math; display-layer |
| `sort-context.ts` | `lib/sort-context.ts` | ~1,030 lines of label/distribution math; display-only risk |
| CQL translator | `dal/adapters/elasticsearch/cql.ts` | Query construction; bugs would show wrong results but are hard to detect without running against ES |
| Facet panel | `FacetFilters.tsx` | Aggregation display; deprioritised |
| Metadata click-to-search | `ImageMetadata.tsx` | Partially audited via orchestration coupling |
| Fullscreen-specific paths | `FullscreenPreview.tsx` | Shares `useImageTraversal` (audited) |
| E2E coverage gap analysis | `e2e/` | Tests not run; coverage gaps not assessed |

---

## Section 5 — Suggested verification steps (S1 bugs)

**Bug #1** (`_pendingFocusAfterSeek` not cleared on `search`):
- Vitest: in `search-store.test.ts`, set `_pendingFocusAfterSeek: "first"`, call `search()`, assert it is null afterwards.
- E2E: extend `e2e/local/keyboard-nav.spec.ts` — focus image → End → change query within 100 ms → assert no auto-focus.

**Bug #2** (`_pendingFocusDelta` not cleared in `seek`):
- Vitest: set `_pendingFocusDelta`, call `seek()`, assert delta is null afterwards.
- E2E: focus → scrubber-seek → arrow key → scrubber-seek again → assert focus matches the final scrubber target.

---

## Appendix A — Out-of-scope observations

1. **`getScrollContainer()` called imperatively from a Zustand action (`seek()`)** — accessing a DOM ref from inside a store action is an architectural coupling; pass scroll geometry as a parameter instead.
2. **`aria-label` used as geometry discriminator in two places** (see bug #10) — should be an explicit boolean/enum prop through the render tree.
3. **`_prevParamsSerialized` and `_prevSearchOnly` are exported module state** (`orchestration/search.ts:214,217`) — exported only for `resetToHome` / `resetSearchSync`; implicit contract.
4. **`computeScrollTarget` is pure but unused by `restoreAroundCursor`** — `restoreAroundCursor` uses `buf.targetLocalIndex` directly without reverse-compute. May produce thumb jump after reload restore in seek mode.
5. **`storeImageOffset` called with `replace: true` URL navigations** in `ImageDetail.tsx` — every image visited during prev/next traversal overwrites sessionStorage. Correct but chatty.
6. **`hasSynthesizedRef` never reset when `imageId` changes** in a mounted `ImageDetail`. If sort-around-focus moves through detail, synthesis is permanently skipped for subsequent images in that component instance.
7. **`_positionMapAbortController` not reset on error** in `_fetchPositionMap` (~line 1037). Holds a reference to a resolved controller; subsequent `abort()` is a no-op but blocks GC until next search.
8. **`getVisibleImageIds` reads `useSearchStore.getState()` directly inside a function called from a hook** — not a React violation but a hidden coupling between hook render context and module-level state.
9. **`SCROLL_SEEK_DEBOUNCE_MS = 200` is a file-local constant** (`useDataWindow.ts:~102`) — should be in `tuning.ts`.
10. **`_findAndFocusImage` 8s timeout is hard-coded** (~line 1196) — should be in `tuning.ts`.
11. **`_aggDebounce*` and `_expandedAgg*` abort controllers are module-level** but logically belong to the store; invisible to tests that reset store state.
12. **`useReturnFromDetail` calls `virtualizer.scrollToIndex` directly**, not the registered `scrollFocusedIntoView()` callback. Inconsistency with `FullscreenPreview` exit path.
13. **`countBefore` uses `range: {gte: v, lte: v}` for keyword equality** (`es-adapter.ts:718`) — a `term` query would be more semantically precise.
14. **`searchAfter` PIT retry matches HTTP 400** (`es-adapter.ts:602`) — the `/40[04]/` regex also retries on Bad Request, wasting a round-trip on a non-recoverable error.
15. **`restoreAroundCursor` two-tier loop guard is fragile** (`ImageDetail.tsx:193-216`, `search-store.ts:~3447`) — the loop is currently blocked by `offsetRestoreAttempted` staying true once set, but the guard depends on `imageId` not changing during the cycle. Worth restructuring.

---

## Appendix B — Fix sequencing

Clusters are useful as background context but a poor unit of work. Cluster fixes tend to be refactors (cluster #2 = "redesign where session state lives"), have varying scope (cluster #1 is two trivial fixes; cluster #6 is three different bugs sharing one cause), and concentrate risk in hot files. Fix per bug, batched by risk/value.

### Batch A — Free wins (single session, one PR, one commit per fix)

**Model:** Sonnet 4.6 Medium.

Mechanical, ≤5 lines each, easy unit test:

- **#19** — PIT regex `/40[04]/` → matches 410 too. One char-class fix.
- **#20** — `findKeywordSortValue` return `lastKeywordValue` not `null`. One-line.
- **#1** — clear `_pendingFocusAfterSeek` in `search()`. One line.
- **#2** — clear `_pendingFocusDelta` in `seek()`. One line.
- **#13** ❌ NOT A BUG — `fetchSortDistribution` already has its own `try/catch` that swallows all non-abort errors (`console.warn` + return). It never re-throws to `seek()`. Degradation already happens gracefully. No fix needed.

Highest value-per-minute in the doc.

### Batch B — Real bugs, contained (one bug per session, branch per bug)

**Model:** Sonnet 4.6 High.

Need thought but scoped to one symptom. No cross-contamination if a fix regresses:

- **#9** — `extendBackward` column-trim empty result. Probably: skip trim when `total < PAGE_SIZE`.
- **#16** — `restoreAroundCursor` should set focus. Touches explicit/phantom mode question — verify intended behaviour in both modes first.
- **#8** — `useReturnFromDetail` phantom early-return. Same — verify mode semantics first.
- **#12** — `fallbackFirstPage` not resetting scroll. Adds one `_scrollReset` bump.
- **#14** — `extractSortValues` null cursor. Symmetric pair; fix once, apply twice.
- **#18** — sort-only misclassification on key-removal. Needs the right comparator semantics.

### Batch C — Needs design thinking (don't start until A and B are done)

**Model:** Opus 4.6.

Either touches architecture or has real UX trade-offs:

- **#4, #15, #22** (cluster #6, skeleton-zone viewport math) — likely fix is "always-meaningful `_visibleStart/_visibleEnd` via clamping," but verify intent first; could be argued these are by design.
- **#10** (`aria-label` discriminator) — fix is a refactor. Schedule as standalone, not a bug-fix.
- **#21** (PIT cascade) — needs PIT lifecycle redesign so the store reopens on degraded fallback.
- **#7, #17** (race conditions) — define what "winning" means in each race before patching.

### Defer / skip

- **#10, #23-#29** (all S3) — only revisit if the foot-gun fires or you're already in the area.
- **Appendix A** items — refactor candidates; commission a separate "highest-value refactor" audit when the bug list is drained.

### Anti-pattern to avoid

"Fix everything in `search-store.ts` in one session because I'm already in the file." Same trap as cluster-fixing — each bug is a separate hypothesis; mixing them mixes the evidence.

### Example prompts

**Batch A (one prompt for the whole batch):**

> Read `kupua/exploration/docs/bug-hunt-audit-findings.md`. You are doing **Batch A only** — bugs #1, #2, #13, #19, #20. Each is a small mechanical fix.
>
> For each bug, in this order:
> 1. Read the cited file:line and surrounding ~50 lines to confirm the bug as described.
> 2. **Write a failing test first** that reproduces the bug on the current code. Run it, confirm it fails for the right reason.
> 3. Make the minimal fix. Run the test, confirm it passes. Run the full unit suite (`npm --prefix kupua test`), confirm no regressions.
> 4. One commit per bug, message format: `fix(<area>): <one-line summary> (audit #N)`.
>
> Do **not**: refactor adjacent code, fix anything outside Batch A, or batch multiple bugs into one commit.
>
> If any bug turns out to not be a real bug on closer reading, stop and say so — do not invent a fix to keep momentum. Push back if the audit was wrong about something.
>
> Follow `kupua/AGENTS.md` directives throughout (especially: never commit without asking; warn before any Playwright run).

**Batch B — shared template (then per-bug specifics below):**

> Read `kupua/exploration/docs/bug-hunt-audit-findings.md`, then focus **only on the bug named below**.
>
> Before any code:
> 1. Read the cited file:line and surrounding ~100-200 lines.
> 2. Read any cross-referenced files listed in the per-bug block.
> 3. State your understanding of intended vs actual behaviour. If they don't diverge as the audit claims, stop and say so.
>
> Then:
> 1. Write a failing test first (Vitest for pure logic, Playwright if it needs real DOM). Test must fail on current code for the right reason.
> 2. Minimal fix.
> 3. Run the relevant unit suite + any e2e spec covering the affected area.
> 4. One commit. Message: `fix(<area>): <one-line summary> (audit #N)`.
>
> Do **not**: touch other audit bugs, refactor adjacent code, expand scope. If a fix turns out to require touching another audit bug, stop and report back.
>
> Follow `AGENTS.md` directives. Warn before any Playwright run.

**Per-bug specifics for Batch B:**

> **#9 — `extendBackward` column-trim empty result.** Read `extendBackward` in `search-store.ts:2200-2280`, plus the `geo.columns` reference in `useDataWindow.ts`. Verify the trim is intended for `>= PAGE_SIZE` returns only. Test: mock backward fetch returning 2 items in a 3-column grid with `bufferOffset=2`; assert items appear in results. Beware: trim logic may exist for a real reason in normal-size returns — preserve that.

> **#8 — `useReturnFromDetail` phantom early-return.** Read `useReturnFromDetail.ts` end-to-end and `ImageDetail.tsx` mount/unmount path. Read `02-focus-and-position-preservation.md` to confirm intended phantom-mode behaviour. Test: phantom mode → open detail → close → assert `setFocusedImageId(wasViewing)` was called and centring fired. Mode-semantics-sensitive; do not change explicit-mode behaviour.

> **#16 — `restoreAroundCursor` doesn't focus image.** Read `restoreAroundCursor` in `search-store.ts:~3540` and the deep-link reload path through `ImageDetail.tsx:130-220`. Decide explicitly: should restore set `focusedImageId` always, or only in explicit mode? Document the choice in the commit message. Test: deep-link an image deep in results → close detail → assert scroll centred on it.

> **#12 — `fallbackFirstPage` doesn't reset scroll.** Read `_findAndFocusImage` fallback path and `_scrollReset` consumers in `useScrollEffects.ts` Effect #7b. The fix is to bump `_scrollReset.gen` when falling back. Test: focus image → search for query that excludes both image and neighbours → assert scroll position is at top, not stale-deep.

> **#14 — `extractSortValues` null cursor blocks extends.** Read `extractSortValues` in (find via grep), plus `extendForward:2139-2148` and `extendBackward:2279-2284`. Symmetric pair — apply the same fix to both. Decide: skip cursor update when null (preserve last good cursor), or fall back to a different field. Test: simulate eviction with a boundary image whose primary sort field is undefined; assert opposite-direction extend is not blocked.

> **#18 — Sort-only misclassification on key-removal.** Read `_prevSearchOnly` in `orchestration/search.ts:215` and the comparator at `useUrlSearchSync.ts:181`. The fix is making the `every()` check distinguish "key absent" from "key equal." Test: simulate `prev = {orderBy: "date", filter: "X"}` and `next = {orderBy: "credit"}` (filter cleared) → assert NOT classified as sort-only. Phantom-mode behaviour is the user-facing symptom — verify with a Playwright test if practical.

**Batch C — shared template:**

> Read `kupua/exploration/docs/bug-hunt-audit-findings.md` end-to-end. You are tackling the bug(s) named below. This is a **design session, not a fix session**.
>
> First turn deliverable: a short proposal (≤1 page) covering:
> 1. Confirm or refute the audit's claim. Cite file:line.
> 2. Propose 2-3 candidate fixes with trade-offs.
> 3. For your recommended option: which tests would break? what new tests are needed? what's the perf risk?
> 4. Argue against the change — is there a case for status quo?
>
> Wait for user approval before writing any code. Once approved: failing tests first, minimal implementation, one commit per bug if separable.
>
> Do **not**: start coding before approval; expand scope to other audit bugs; bundle refactors with the fix.
>
> Follow `AGENTS.md` directives. This area is performance-sensitive — flag any change likely to affect frame budget.

**Per-bug specifics for Batch C:**

> **Cluster #6 (#4, #15, #22) — Skeleton-zone viewport math.** Three symptoms (stale `_viewportAnchorId`, stale debounced seek, empty `getVisibleImageIds`) all stem from `_visibleStart/_visibleEnd` being valid global indices but useless once the buffer slides away from them. Candidate fixes: (a) clamp `_visibleStart/_visibleEnd` to nearest valid global index in skeleton zone; (b) make each consumer skeleton-zone-aware with its own fallback; (c) accept status quo if the symptoms are by-design degraded modes. Read `useDataWindow.ts:170-465` end-to-end before proposing.

> **#10 — `aria-label` as geometry discriminator.** This is a **refactor**, not a bug fix — the audit places it in Batch C deliberately. Proposal must include: how to plumb `densityMode` (or a `geometry` object) from `ImageGrid`/`ImageTable` down to `seek()` and `buildHistorySnapshot()`. Decide whether to pass via store, via a context, or via direct argument. The store route is consistent with current code but adds state; the argument route is cleanest but changes function signatures across the call sites. Read both call sites and `search-store.ts:3271, 3291` and `build-history-snapshot.ts:98`.

> **#21 — PIT cascade on expiry.** The store needs to know to reopen the PIT when the adapter falls back to no-PIT mode. Read `es-adapter.ts:600-640` (PIT retry path) and the `pitId` consumers in `search-store.ts` (extends, seek). Proposal must answer: where does the "PIT was force-closed" signal live? Options: (a) adapter returns `{ pitId: null, pitExpired: true }` and store opens a new one before next extend; (b) adapter transparently opens a new PIT mid-call; (c) store catches a sentinel error type. Each has different snapshot-isolation implications — discuss.

> **#7 + #17 — Race conditions (`restoreAroundCursor` mid-traversal; `search()` vs `seekToFocused()` buffer write).** These are two separate races; consider whether to do them in one session or split. Proposal must define: what does "winning" mean for each race? (Newer wins? Most-specific wins? User-initiated wins over auto?) Read `_rangeAbortController` lifecycle in `search-store.ts:1201, 1425, 1788` and `offsetRestoreAttempted` in `ImageDetail.tsx:193-216`. Likely fix is a generation counter à la `sortAroundFocusGeneration`. Beware: adding a third race-coordination primitive without consolidating the existing two (see Appendix A point #11) increases entropy — flag in proposal.
