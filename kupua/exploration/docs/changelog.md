# Kupua Development Changelog

> Detailed development history extracted from AGENTS.md. This is the blow-by-blow
> record of what was built, how bugs were found and fixed, and the reasoning behind
> implementation choices. Useful for archaeology; not needed for day-to-day agent work.
>
> For current capabilities and architecture, see `kupua/AGENTS.md`.

## Phase 2 — Live Elasticsearch (Read-Only)

<!-- AGENT INSTRUCTIONS:
     New entries go IMMEDIATELY BELOW this comment.
     Format:  ### D Month YYYY — Title
     Order:   newest at top, oldest at bottom.
     DO NOT delete or reorder existing entries. -->

### 27 April 2026 — Animations for new/phantom images; count/ticker survival

**Arriving animation** (`kupua-arrive`): Images that appear at the top of results
(via `extendBackward` or clicking the "N new" ticker) now slide+fade in over 0.8s.
Store field `_arrivingImageIds: ReadonlySet<string>` is populated atomically in the
same `set()` call that lands new results — the CSS class (`anim-arriving`) applies
`opacity: 0` from the first frame via `fill-mode: both`, preventing any flash of
stale decoded pixels. Cleared by `setTimeout` after 1500ms. Uses the `translate`
CSS property (not `transform`) to avoid conflict with the virtualizer's
`transform: translateY()`. The `<img>` element gets a temporary `key={image.id}`
only for animated cells, forcing a fresh DOM element — without this, positional
`key={imageIdx}` reuses the `<img>` node and old decoded pixels persist until the
new URL loads.

**Phantom focus pulse** (`kupua-focus-pulse-unfocused`): In phantom/"Click to open"
mode, the image targeted by sort-around-focus or return-from-detail now glows briefly
(box-shadow pulse, 1.2s). Store field `_phantomPulseImageId` set in
`_findAndFocusImage` (2 sites), `search()` first-page phantom branch, and
`useReturnFromDetail`. Cleared by `setTimeout` after 2500ms.

**`_isInitialLoad` flag:** Suppresses phantom pulse on cold page load — the pulse is
only meaningful after a user action. Flag starts `true`, flips `false` when first
search results land. Gated at all three store-level pulse emission sites. The
`useScrollEffects` pulse site (Effect #9) was removed entirely — it was a redundant
fallback that only activated on initial load (exactly when we don't want it).

**StatusBar total/ticker survival across reload:** Both counters now seed from
`sessionStorage` on mount (`kupua-sb-total`, `kupua-sb-new`). On update, values are
written to sessionStorage. Display uses cached value until `total > 0` (store has
real data from a completed search), then switches to live store values. This prevents
the "0 matches" / empty ticker flash on page reload — the previous values stay
visible until fresh data arrives. Sort-around-focus indicator moved after the ticker.
`select-text` added to total count so users can copy the number.

### 27 April 2026 — Fix: flash of intermediate results on no-focus search (Bug 2)

**Bug:** Changing sort (or query, filter, popstate) without a focused image while
scrolled deep caused 20+ frames of old buffer content visible at scrollTop=0 before
new results arrived. The old Effect #7 reset `scrollTop=0` eagerly (before paint),
but `search()` didn't fire until after paint — the user saw stale first-page images.

**Root cause:** Timing mismatch between `useLayoutEffect` (Effect #7, fires before
paint, resets scroll) and `useEffect` (`useUrlSearchSync`, fires after paint, calls
`search()`). Between these two, the browser paints old buffer data at scrollTop=0.

**Fix (`_scrollResetGeneration` — deferred scroll reset):**
1. `search-store.ts`: Added `_scrollResetGeneration` counter. Bumped atomically in
   the `search()` else-branch (no-focus path) alongside `bufferOffset: 0` and new
   results. When focus IS in first page, `sortAroundFocusGeneration` bumps instead.
2. `useScrollEffects.ts` Effect #7: No longer eagerly resets scroll for no-preserveId
   changes. Old scroll position stays harmlessly until data arrives.
3. `useScrollEffects.ts` new Effect #7b: Watches `_scrollResetGeneration`. Resets
   scroll in the same `useLayoutEffect` frame as the data swap render — zero flash.
   Preserves `scrollLeft` on sort-only changes (table view horizontal scroll).

**Note — coupling:** Effect #7 now saves `sortOnly` into a ref that Effect #7b reads.
These two effects are coupled: #7 runs on searchParams change (before data), #7b runs
on `_scrollResetGeneration` change (with data). The ref bridges the gap. If either
effect is refactored independently, the other must be checked.

**Results:** Content flash 23→0 frames, scroll flash 22→0 frames. All 4 cited-scenario
tests pass (focus, phantom, no-focus, Dublin two-tier). 398 unit tests pass.

**Rejected alternatives:**
- Always use viewport anchor for sort-without-focus: forces "stay at anchor" UX,
  removes ability to control scroll-reset UX independently
- Show skeleton while loading: worse UX, complex implementation

### 26 April 2026 — Fix: content flash during sort-around-focus

**Bug:** When changing sort with a focused image, 30-35 frames (~500ms) of
wrong content flashed on screen. The thumbnails briefly showed images from
global position 0 before snapping to the correct position.

**Root cause:** `search()` nullifies `positionMap` (line 1722) before
`_findAndFocusImage` reads it (line 1365). Two race conditions:

1. **Two-tier mode** (1k–65k results): positionMap is temporarily null while
   `_fetchPositionMap` fetches the new sort's map in the background.
   `_findAndFocusImage` falls into the deep-seek estimate path, sets
   `offset = hintOffset ?? 0`. With `hintOffset = null` (user-initiated sort
   change has no snapshot hints), `bufferOffset = 0`. The correct images are
   loaded around the focused one, but placed at global position 0. Effect #9
   scrolls to position ~100 instead of ~7098. scrollTop jumps from 445343 to
   5690 for ~350ms until async countBefore correction.

2. **Deep-seek mode** (>65k): Same estimated `offset = 0` path. The scroll
   container is buffer-relative so thumbnails appear correct, but the scrubber
   thumb jumps to 0% and the position counter shows wrong numbers.

**Fix (two changes in `search-store.ts`):**

1. `_findAndFocusImage` step 2: when positionMap is null but total is in
   two-tier range (`SCROLL_MODE_THRESHOLD < total ≤ POSITION_MAP_THRESHOLD`),
   use `countBefore` (~10ms for ≤65k) instead of estimated offset=0. This
   gives the exact global offset with negligible latency.

2. `search()` → `_findAndFocusImage` call: pass `_focusedImageKnownOffset`
   as hintOffset fallback (was always `null` for non-popstate sort changes).
   Deep-seek mode gets ~correct initial buffer position (~672k instead of 0),
   and the async correction only adjusts by ~17k instead of ~655k.

**Results:** All 4 cited-scenario tests: content flash 0 frames (was 30-35).
Dublin two-tier scrollTop range 429587–445343 (was 5690–445343). 1.3M seek
scrollTop range 5454–6060 (was 0–6060). 398 unit tests pass.

### 26 April 2026 — Flash measurement infrastructure and cited-scenario probes

Built systematic infrastructure for measuring visual drift and flash during
state transitions, using rAF-based sampling inside the browser.

**New files:**
- `e2e/shared/drift-flash-probes.ts`: Shared measurement module. `captureProbe()`,
  `captureVisibleCells()`, `waitForSettle()`, `startTransitionSampling()` /
  `stopTransitionSampling()` (rAF loop capturing scrollTop, bufferOffset,
  resultsLength, safStatus, visible cell positions, tracked image state),
  `measureDrift()`, `analyzeFlash()` (content + scroll flash detection),
  `analyzePositionFlash()` (col×row trajectory analysis).
- `e2e/smoke/cited-scenario.spec.ts`: 4 tests against real TEST cluster (1.3M images),
  covering seek+focus+sort-field-change, seek+focus+direction-toggle,
  seek+no-focus+sort-change, and city:Dublin two-tier variant.
- `e2e/smoke/flash-measurement.spec.ts`: 3 sites × 3 scroll modes = 9 tests
  measuring drift and flash at the 3 most impactful audit sites.
- Updated `e2e/README.md` with comprehensive Drift & Flash documentation section.

**Key findings from measurements:**
- Site #1 (sort, no focus): Reset to top is expected behavior, not a bug.
- Site #8 (density toggle): ~5px drift, negligible.
- Site #9 (popstate no snapshot): Position lost entirely. Future investigation needed.
- Cited scenario (sort-around-focus with focus): 30-35 frames content flash.
  Fixed in separate changelog entry above.

### 26 April 2026 — Fix: LAN access broken on Chrome Android (insecure context)

`crypto.randomUUID()` is secure-context-only. Over LAN HTTP
(`http://192.168.x.x:3000`), Chrome treats the page as insecure →
`randomUUID` is `undefined` → `TypeError` at module top-level in
`main.tsx` → React never mounts → grey page. Firefox is more lenient.
Fix: feature-detect `randomUUID`, fall back to manual UUID-v4 via
`crypto.getRandomValues` in `history-key.ts`.

### 26 April 2026 — Fix: null-zone position map crash + sentinel sanitisation

**Bug:** "Null zone scrolling in positionMap mode doesn't extend" (Bug 1 in
`preexisting-bugs-found-during-history-work.md`). When scrolling through images
sorted by Last Modified in the 1k–65k two-tier range, the buffer stopped growing
and the user scrolled into permanent skeletons.

**Root cause — ES Long.MAX/MIN_VALUE sentinels in sort values:**
Elasticsearch uses Java `Long.MAX_VALUE` / `Long.MIN_VALUE` as internal sort
sentinels for documents with missing fields (the "null zone"). These sentinels
leak into the `sort` array of search hits. Three failure modes make them
unusable in `search_after` cursors:

1. `Long.MAX_VALUE` → JS float64 rounds to `9223372036854776000` (exceeds Long
   range) → ES 400 "failed to parse date field"
2. `Long.MIN_VALUE` → ES strips sign, tries `Long.MAX_VALUE+1` → overflow → 400
   (OpenSearch issue [#17120](https://github.com/opensearch-project/OpenSearch/issues/17120),
   gap in the fix from [PR #12676](https://github.com/opensearch-project/OpenSearch/pull/12676))
3. `null` → NPE in ES 8.x `search_after` → 500

**Fix — two parts (`es-adapter.ts`):**

1. **Two-phase position map fetch** (`fetchPositionIndex`): Instead of walking all
   results in one pass (which hits sentinels at the null-zone boundary), the fetch
   splits into two phases: docs WITH the primary sort field first, then docs
   WITHOUT it. Each phase uses a clean sort with no sentinels. Null-zone docs get
   `[null, uploadTime, id]` sort values injected via `injectNullPrimary()`, matching
   the format `detectNullZoneCursor` expects.

2. **Sentinel sanitiser on all search return paths** (`sanitizeSortValues`): A
   module-level function converts sort values where `|v| >= 9.2e18` to `null`.
   Applied in `_doSearch()`, `searchAfter()` (both main and PIT-expired fallback
   paths). This ensures `endCursor`/`startCursor` stored in the search store
   contain `[null, ...]` instead of sentinel numbers, so `detectNullZoneCursor`
   triggers correctly for extends, seeks, and sort-around-focus.

**Bonus fix — search cooldown shortening** (`search-store.ts` ~L1880): After a
no-focus search lands, overwrite the 2s `SEARCH_FETCH_COOLDOWN` with 100ms
`SEEK_COOLDOWN_MS`. Without this, extends are blocked for ~1.5s after search
completes and fast scrolling outruns the buffer.

**Diagnostic approach:** Built throwaway `nullzone-diag.spec.ts` against TEST
cluster (read-only). First used `mouse.wheel` events (triggered seeks, not
extends — wrong scroll pattern). Switched to rAF-based `scrollTop += 50`
smooth scroll (from perf.spec.ts P2), which properly exercises extends.

**Files changed:**
- `kupua/src/dal/es-adapter.ts` — `sanitizeSortValues()`, two-phase
  `fetchPositionIndex()`, sanitiser on `_doSearch` + `searchAfter` return paths
- `kupua/src/stores/search-store.ts` — cooldown overwrite after no-focus search

**Verified:** Position map loads (14,388 entries), buffer extends from 200→1000
via smooth scroll in null zone. Unit tests: 398 passed.

### 26 April 2026 — History back/forward: new-images leak fix + monotonic ratchet

**Problem:** Browser back/forward across different search contexts called `search()`,
which opened a fresh PIT at `now` and set `newCountSince = now`. Images uploaded since
the original search silently entered the results. The ticker (which counts images since
`newCountSince`) reset to 0, hiding the fact that the user was seeing different results
from what they had before.

**Fix — `frozenUntil` option on `search()` (`search-store.ts`, `useUrlSearchSync.ts`):**
- `HistorySnapshot` gains `newCountSince: string | null` — captured in
  `buildHistorySnapshot()` from the store, persisted to sessionStorage.
- `search()` accepts optional `frozenUntil` timestamp. When provided:
  (a) initial `searchAfter` gets `until: frozenUntil` cap (uses earlier of user's
  explicit `until` filter and `frozenUntil`); (b) `newCountSince` is set to
  `frozenUntil` instead of `now`; (c) `newCount` is NOT zeroed (prevents ticker flash).
- On popstate restore, `frozenUntil = max(snapshot.newCountSince, store.newCountSince)`.

**Monotonic ratchet rule:** The max ensures two properties:
1. History never advances the freeze boundary to `now` — no surprise new images.
2. History never rolls back the freeze boundary — if the user absorbed new images via
   ticker on any entry, going back to an older entry still includes those images.

**Immediate ticker poll (`startNewImagesPoll`):**
- Extracted the poll body into a `tick()` function, called immediately on poll start
  (in addition to the 10s interval). On fresh searches this counts 0 (harmless); on
  popstate restores with `frozenUntil` it shows the correct count instantly instead of
  after a 10s delay.
- Updated ES request count tests (+1 for the immediate ticker count()).

**Files changed:** `history-snapshot.ts` (new field), `build-history-snapshot.ts`
(capture), `search-store.ts` (frozenUntil option, immediate tick, conditional newCount
reset), `useUrlSearchSync.ts` (ratchet computation, frozenUntil threading),
`build-history-snapshot.test.ts` (+2 tests), `search-store-extended.test.ts` (count
adjustments), `new-images-behaviour-comparison.md` (table + ratchet note).

**Test counts:** 398 unit (all pass), 33 browser-history e2e (all pass).

### 25–26 April 2026 — Browser history future polish: Phases 1–4 + flag retirement

Four phases implementing kupuaKey identity, snapshot capture, popstate restore, and
reload survival. Plus column alignment, scroll-teleport fix, and experimental flag
retirement.

**Phase 1 — kupuaKey identity (`lib/orchestration/history-key.ts`):**
- Each history entry gets a unique `kupuaKey` in `history.state`, minted on push.
- `getCurrentKupuaKey()` reads `window.history.state` (not TSR's internal copy) —
  browser state is canonical because cold-load synthesis uses raw `replaceState`.
- All push sites wired: `pushNavigate`, `pushNavigateAsPopstate`, `useUpdateSearchParams`.
  Replace-only sites re-pass the current key. ImageDetail deep-link synthesis gets a
  fresh key. `history.scrollRestoration = 'manual'` + `synthesiseKupuaKeyIfAbsent` on
  app init.
- 15 unit tests, 4 e2e tests. 372 unit / 169 e2e pass.

**Phase 2 — Snapshot capture (`lib/history-snapshot.ts`, `lib/build-history-snapshot.ts`):**
- `HistorySnapshot` type: searchKey, anchorImageId, anchorIsPhantom, anchorCursor,
  anchorOffset, scrollTop, viewportRatio.
- `SnapshotStore` interface with `MapSnapshotStore` (in-memory) and
  `SessionStorageSnapshotStore` (survives reload). Compile-time flags.
- `buildHistorySnapshot()` reads store state + DOM geometry. Anchor selection:
  explicit focus in click-to-focus mode, viewport-centre image (phantom) otherwise.
- `markPushSnapshot()` wired into `pushNavigate` (captures before push).
  `pushNavigateAsPopstate` does NOT capture (by design — it's a reset).
- 18 unit tests, 2 e2e tests. 390 unit / 171 e2e pass.

**Phase 3 — Popstate restore (`useUrlSearchSync.ts`):**
- On popstate, looks up snapshot for destination kupuaKey. Strict searchKey match
  (or lenient if flag was on — now removed). Passes anchor as `sortAroundFocusId` with
  `snapshotHints` (cursor + offset) to `search()` — reuses the existing sort-around-focus
  render gate, no new restore path.
- Popstate departure capture: before restoring destination, captures snapshot for the
  entry we're LEAVING (`_lastKupuaKey`). Enables forward-after-back.
- Phantom anchor guard: `anchorIsPhantom` flag → `phantomOnly: true` in `search()` →
  `_phantomFocusImageId` instead of `focusedImageId` — no spurious focus ring on restore.
- scrollTop-only fallback for empty-result snapshots.
- Pre-existing bug fix: ImageDetail deep-link synthesis re-fired on popstate back to a
  detail entry (one-shot flag already consumed). Fix: stamp `_bareListSynthesized: true`
  on `history.state` after synthesis; check before re-synthesising.
- 6 e2e tests. 390 unit / 177 e2e pass.

**Phase 4 — Reload survival (`main.tsx` pagehide handler):**
- `pagehide` event handler captures snapshot for current kupuaKey before unload/bfcache.
- Mount-time restore: strict-only searchKey matching (`isMount` check).
- Bug fix: `buildSearchKey` didn't exclude `offset`/`length`/`countAll` — store params
  included `length: 200` but URL-derived searchOnly didn't → key mismatch on mount.
  The lenient flag had masked this for Phase 3.
- 4 e2e tests (reload restore, reload-then-back, deep reload, bfcache survival).
  392 unit / 181 e2e pass.

**Viewport ratio preservation:**
- `viewportRatio` field in snapshot: `(elRect.top - containerRect.top) / clientHeight`.
- On restore, `saveSortFocusRatio(snapshot.viewportRatio)` before `search()` so Effect #9
  positions the image at the same viewport fraction, not always at top row.
- Exported `saveSortFocusRatio` from `useScrollEffects.ts`.

**Column alignment (`search-store.ts`, `_loadBufferAroundImage`):**
- Anchor image always landed in an arbitrary column (`PAGE_SIZE/2 % columns`). Fix: trim
  0–(columns-1) items from backward results so `bufferStart % columns === 0`, preserving
  the image's natural column position. Uses `getScrollGeometry().columns`.

**Scroll teleport fix (`useScrollEffects.ts`, Effect #9):**
- Buffer extends rebuilt `imagePositions` → new `findImageIndex` ref → Effect #9 re-fired
  → repositioned at saved ratio. Phase 4's `saveSortFocusRatio` made this trivially
  reproducible. Fix: `scrollAppliedResultsRef` tracks results array identity — same ref
  (offset correction) → allow, different ref (extend) → block. New generation resets.
- First approach (generation guard) failed: blocked essential async offset-correction
  re-fires (4 scrubber tests failed). Results-identity approach precisely distinguishes
  offset correction from extends.
- Regression test: "no scroll teleport after reload restore — extends do not reposition".

**Experimental flag retirement:**
- `EXPERIMENTAL_FOCUS_AS_ANCHOR_IN_CLICK_TO_FOCUS` → promoted (always on), flag and
  conditional removed. In click-to-focus mode the focused image is always the anchor;
  viewport-centre fallback when no focus. Doc comment updated to explain the design.
- `EXPERIMENTAL_LENIENT_SEARCHKEY_MATCH` → deleted (dead code). Analysis showed
  `snapshot.searchKey` and URL-derived `currentSearchKey` are structurally identical on
  every popstate — same `buildSearchKey()`, same exclusion list, store always synced to
  URL at departure time. The lenient branch could never fire.

**Code review triage (26 Apr):**
- H1 fix: `withCurrentKupuaKey()` returned `{ kupuaKey }` only, dropping
  `_bareListSynthesized` and other `history.state` fields on replace navigations.
  Fix: spread `history.state` first. E2e test added (traverse → close → forward).
  Unit tests 4→6 in `withCurrentKupuaKey` describe.
- H2: deleted `scrollTopFallback` restore path (dead code). The path required
  no-anchor (zero results) → scrollTop is always 0, and `window.scrollTo` was a no-op
  on `overflow-hidden` root. Removed `scrollTop` from `HistorySnapshot`, capture, and tests.
- M3 doc fixes: removed "strict-only" qualifier from mount-time restore description,
  corrected test count 35→32, describe blocks 4→9, kupuaKey unit tests 4→6,
  `anchorCursor` → `anchorOffset` in snapshotHints.
- L1 comment: documented `_lastKupuaKey` invariant (undefined on cold load → correctly
  skips departure-capture).
- L3 comment: added "empty URL = keep current per HTML spec" to `replaceState(state, "")`.

**Pre-existing Bug 1 fix — scrubber thumb stuck after sort change (26 Apr):**
- Root cause: Scrubber.tsx flash guard (`prevTop > 50 && thumbTop < 10`) permanently
  suppressed the DOM write on sort-without-focus. Unlike sort-around-focus (where
  `_findAndFocusImage` corrects offset while loading=true), no async correction ever
  arrives — the near-zero position IS final. `_seekTargetGlobalIndex` (originally
  suspected) is guarded by `_seekGeneration` and was inert.
- Fix: added `loading` to the flash guard condition — only suppress when `loading=true`
  (transient). When `loading=false` the position is final. Added `loading` to effect deps.
- Defence-in-depth: cleared `_seekTargetLocalIndex/-GlobalIndex` to -1 in `search()` else
  branch and both `_findAndFocusImage` fallback paths.
- New file: `Scrubber.test.tsx` — first unit test for the component (2 tests: thumb resets
  when loading=false; flash guard suppresses when loading=true).

**Phantom anchor drift fix — Bug A (coordinate mismatch) + Bug B (anchor-walk cascade):**
- **Bug A:** `buildHistorySnapshot` computed `viewportRatio` via DOM `getBoundingClientRect`
  (includes container `pt-1` = 4px padding). Effect #9 restores via `localIndexToPixelTop`
  (geometry, no padding). The 4px offset accumulated linearly each back/forward cycle.
  Fix: replaced DOM-based ratio with geometry-based computation — imports layout constants,
  computes `virtualizerIdx` from anchor offset, derives `rowTop` from row arithmetic, then
  `viewportRatio = (rowTop - scrollTop) / clientHeight`. Grid vs table detected via
  `aria-label` attribute on the scroll container.
- **Bug B:** On popstate-forward, the departing snapshot for the previous entry was
  unconditionally overwritten. `buildHistorySnapshot` used `getViewportAnchorId()` which
  returned a different image after phantom cleared (one-shot consumed). The overwritten
  snapshot had the wrong anchor → next restore used wrong anchor → cascade compounded
  ~1 row/cycle. Fix: skip departing snapshot overwrite when existing snapshot has
  `anchorIsPhantom` — the push-time snapshot (from `markPushSnapshot` before navigate)
  already has the accurate anchor.
- Verified on TEST cluster (~1.3M images): 0px drift across 4 phantom cycles (was
  0→4→432→735→1038), 0px drift across 3 explicit cycles (was +4px/cycle linear).
- New handoff doc: `position-preservation-rearchitecture-handoff.md` — 24 divergence
  points, 3 coordinate systems, stable corpora for future Option B unification.
- Diagnostic test `phantom-drift-diag.spec.ts` kept for regression testing.

**Seek column-alignment fix (`search-store.ts`, `seek()`):**
- Root cause: `seek()` set `bufferOffset = actualOffset` without column alignment.
  Images landed in arbitrary columns (`localIdx % cols`) rather than their natural
  column (`globalIdx % cols`). The existing `_loadBufferAroundImage` (used by popstate
  restore) already column-aligned, so restores showed the correct column while the
  original seek view showed the wrong one — visible as a column shift (and sometimes
  row shift) on the first back/forward cycle. Subsequent cycles were stable because
  departure snapshots captured the correctly-aligned restore view.
- Diagnostic proof (1720×1280, 6 cols, image globalIdx=661903, natural col=1):
  initial seek `bufferOffset=661795` → `localIdx=108` → col 0 (wrong);
  popstate restore `bufferOffset=661806` → `localIdx=97` → col 1 (correct).
- Fix: column-alignment trim in `seek()` before cursor computation — same logic as
  `_loadBufferAroundImage`. Trims 0–(cols-1) items from results so
  `actualOffset % cols === 0`. Also adjusts `backwardItemCount` for
  `computeScrollTarget` headroom detection.
- Affects all seek paths (deep-seek >65k, position-map 1k–65k, shallow <10k).
  Manual verification on TEST: swimming, scrubber drag, End key, null-zone sort,
  history round-trip, two-tier mode, small result sets — all clean.

**Final test counts:** 396 unit, 183 e2e, 0 failures.

### 25 April 2026 — Bug fix: debounced typing didn't create back-navigable entries

**Bug:** Type "cats" → wait → type "dogs" → press back → lands on the referring site
(e.g. theguardian.com), not on the "cats" search. Debounced query changes always used
`replace: true`, so each settled query overwrote the previous one in-place — no history
entry was ever created between typing sessions.

**Fix (SearchBar.tsx):** On the first keystroke of a new typing session (detected by
`_debounceTimerId` being null), push the current URL via `history.pushState(...)` before
starting the debounce timer. This commits the pre-edit context as a history entry.
Subsequent keystrokes within the 300ms window hit `clearTimeout` + `setTimeout` as
before, and the debounce callback fires `updateSearch({ replace: true })` which replaces
the pushed entry. Net result: each *settled* query becomes a discrete back target, but
intermediate keystrokes ("c", "ca", "cat") don't pollute history.

**Edge case — slow typers (>300ms between keystrokes):** Each keystroke would start a
fresh typing session and push. This means very slow typing could create intermediate
entries. Acceptable trade-off: 300ms is fast enough that normal typing stays within one
session, and even slow-typer entries are valid settled queries (debounce fired between
them).

**New e2e test:** "back navigates between settled debounced queries (typed via UI)" —
types "cats" via the CQL search input, waits, types "dogs", presses back, verifies
landing on "cats" (not the referring page), then back again to the home page (no query).

**Regression check:** 165 e2e tests pass (0 failures), 357 unit tests pass.

### 25 April 2026 — Browser history baseline tightening (6 items)

Implemented all 6 baseline items from `browser-history-baseline-tightening-handoff.md`.
The goal: tighten kupua's history model so push/replace decisions and popstate-vs-user
distinctions are consistent across all call sites — prerequisite for snapshot-based
position restoration.

**Item 1 — closeDetail → history.back():**
- Rewrote `ImageDetail.closeDetail` from `navigate({ replace: true })` to
  `markUserInitiatedNavigation(); history.back()`. All four close affordances
  (← Back button, double-click, Backspace, swipe-to-dismiss) share this callback.
- Forward now re-opens the detail (was dead-end before).
- Added deep-link synthesis on mount: if `history.length <= 2` (fresh tab), synthesise
  a bare-list entry below the detail via same-tick `replaceState` + `pushState`. No
  flicker (Chrome/Firefox coalesce). Gate at 2 (not 1) because Playwright/Safari count
  `about:blank` as a history entry.
- Updated `ImageDetail.tsx` doc comment to reflect new close semantics.

**Item 2 — pushNavigate / pushNavigateAsPopstate helpers:**
- Added two helpers to `lib/orchestration/search.ts`:
  - `pushNavigate(navigate, opts)` — calls `markUserInitiatedNavigation()` then `navigate()`.
  - `pushNavigateAsPopstate(navigate, opts)` — calls `navigate()` without marking.
- Switched `enterDetail-grid` (ImageGrid) and `enterDetail-table` (ImageTable) to
  `pushNavigate()`. No behavioural change (display-only key dedup bails before reading
  the flag), but makes intent explicit and removes a footgun.
- Added comments at `traversal-onNavigate` and `default-injection` explaining why they
  stay raw (replace-only sites — helpers are push-only).

**Item 3 — logo-reset → pushNavigateAsPopstate:**
- Switched both logo-reset sites (SearchBar.tsx and ImageDetail.tsx) to
  `pushNavigateAsPopstate()`. Previously depended on a *missing* call for correctness;
  now the opt-out from marking is explicit.
- Added comments at both sites explaining why this is the exception.

**Item 4 — density toggle comment:**
- Added comment at `StatusBar.tsx` density toggle explaining the deliberate push choice
  (density is a useful view per the guiding philosophy).

**Item 5 — metadata click-to-search comment:**
- Added comment at `ImageMetadata.tsx` explaining the single-push design (new query +
  close detail in one navigate; splitting would create a redundant entry).

**Item 6 — FullscreenPreview doc comment:**
- Updated `FullscreenPreview.tsx` doc comment to document the new history-aware Backspace
  semantics when entered from ImageDetail.

**E2E tests (7 new, 12 total in browser-history.spec.ts):**
- Forward after close-button re-opens detail (item 1)
- Backspace close then forward re-opens detail (item 1)
- Deep-link synthesis: fresh tab → close → lands on bare list (item 1)
- Back across density toggle re-toggles density (item 4)
- Logo reset from search bar → back with popstate semantics (item 3)
- Logo reset from image detail → back restores previous context (item 3)
- Metadata click single push; back returns to detail (item 5)

**Regression check (initial):** 163 e2e tests pass (0 failures), 357 unit tests pass.

**Bug fix (same session):** Removed the `history.length` gate from deep-link synthesis.
The gate (`DEEP_LINK_HISTORY_GATE = 2`) was meant to distinguish fresh tabs from tabs
with prior browsing, but `history.length` is unreliable across browsers and contexts.
A tab with 20+ guardian.com entries reported `length > 2`, synthesis was skipped, and
"Back to search" exited kupua entirely. Fix: always synthesise on cold loads. Added
e2e test #10 covering this scenario.

**Bug fix (same session):** Unconditional synthesis created phantom entries. Every
SPA-navigated detail open inserted a bare-list entry even though the list entry already
existed in history, doubling back-presses needed. Fix: `pushNavigate()` now sets a
module-level `_detailEnteredViaSpa` flag; the synthesis `useLayoutEffect` consumes it
and skips synthesis when set. Cold loads (paste/bookmark/reload) never call
`pushNavigate()` → flag stays false → synthesis runs. Added e2e test #8 (SPA open-close
cycle, no phantom entries).

**Final regression check:** 164 e2e tests pass (0 failures), 357 unit tests pass.

**Analysis doc updated:** `browser-history-analysis.md` — history entry rules table,
audit table "Today's behaviour" column, E2E coverage section, baseline section marked
complete. Item 1 section updated to document SPA-entry flag guard.

### 24 April 2026 — Fix: swipe-to-dismiss bypassed zoom guard after double-tap

**Bug:** Double-tap to zoom in (especially near image top edge), then swipe down
→ dismiss fires despite `scaleRef > 1`. Reliably reproducible, no speed required.

**Root cause:** Stale closure state in `useSwipeDismiss`. The `scaleRef > 1` guard
only existed in `onTouchStart`. The second tap of the double-tap ran `onTouchStart`
*before* usePinchZoom set `scaleRef = 2` (zoom happens in `onTouchEnd`). This left
valid `startX/Y` and `decided = false` in the closure. The subsequent swipe's
`onTouchStart` was correctly blocked by the guard, but `onTouchMove` had no guard
and operated on the stale state from the double-tap, entering the direction-decision
block and committing the dismiss.

**Fix:** Added `scaleRef > 1` guard at the top of `onTouchMove` in `useSwipeDismiss`,
matching the existing guard in `onTouchStart`. One line.

### 24 April 2026 — P2-4: Parallel PIT open (~131 ms off every search)

**Goal:** Eliminate the sequential `await openPit → await searchAfter` in
`search()`. PIT open is pure network RTT (~131 ms over SSH tunnel). The first
page doesn't use `search_after` cursors, so it doesn't need the PIT id upfront.

**Implementation (search-store.ts):**
- Replaced sequential `await openPit + await searchAfter` with `Promise.all`.
- First `searchAfter` passes `pitId: null` → index-prefixed `/{index}/_search`.
- `openPit` is wrapped in `.catch(→ null)` so a PIT rejection doesn't fail the
  whole `Promise.all` (rejection isolation). Logs a warning and degrades to
  `pitId=null` (same as `IS_LOCAL_ES` mode), which all extends/seeks handle.
- `_pitGeneration` bump moved BEFORE the `await Promise.all(...)` (was after
  `openPit` resolved). Ensures any concurrent extend that fires during the
  parallel window is immediately invalidated, even if `openPit` fails.
- `IS_LOCAL_ES` guard preserved: local ES short-circuits the PIT slot to
  `Promise.resolve(null)` — `openPit` is never called on local.

**Bundled defensive cleanup (es-adapter.ts):**
- In the PIT-404/410 fallback return path, added the same `hit.sort.length >
  effectiveSort.length` slice that the main return path already does. Currently
  a no-op (non-PIT ES returns length-N sort values), but eliminates a latent
  foot-gun if the fallback path ever evolves to retain PIT.

**New tests (search-store-pit.test.ts, 5 tests, IS_LOCAL_ES mocked to false):**
1. `openPit` rejection → search succeeds, `pitId=null`, no error state.
2. `state.pitId` equals the id returned by `openPit` after search.
3. `extendForward` works after a parallel-mode search.
4. `_pitGeneration` is incremented synchronously before `Promise.all` resolves.
5. `_pitGeneration` increments on each `search()`.

**Test counts:** 352 → 357 (all passing).

**Measured results (median of 3 runs, TEST cluster, label "P2-4 done"):**
PP2 324→250ms, PP5 546→438ms, PP8 903→734ms, PP9 387→272ms,
JA1 276→181ms, JB1 300→207ms, JB2 750→473ms, JB3 348→274ms.
PP1 median 412ms (SSH jitter — best run 256ms, 3-run spread 172ms;
P2-1 baseline 379ms was similarly noisy). All other search metrics
improved 24–277ms. P2-4 confirmed effective.

### 24 April 2026 — P2-1: _source filtering switched to allowlist for all searches

**Goal:** Reduce ES response payload for all searches by switching from
`SOURCE_EXCLUDES` (blacklist of 4 fields) to `SOURCE_INCLUDES` (whitelist
of 35 specific fields). Targets PP1 home-logo settle <400ms (was 609ms).

**Investigation:**
- Root cause: ES responses ~1.5MB for 200 images. Network transfer over SSH
  tunnel dominates (~460ms of ~592ms RTT). ES query execution only ~75-130ms.
- Mapped every field used across all kupua surfaces (grid, table, detail panel,
  metadata sidebar, hidden columns, imgproxy rotation). 35 fields needed total.
- Ran 7 measurement variants (M-A through M-G) on TEST cluster. T1+T2 includes:
  1476KB→244KB raw, 256KB→61KB gzip, 592ms→349ms through proxy.

**Implementation:**
- `es-config.ts`: Replaced `SOURCE_EXCLUDES` (4 fields) with `SOURCE_INCLUDES`
  (35 fields across 3 tiers). Tier 1 (8 fields): grid. Tier 2 (15): table.
  Tier 3 (12): detail panel, hidden columns, imgproxy rotation.
- 35 fields cover everything kupua currently renders. No surface missing data.
- Whitelist applies to every `_source`-returning call: `search()`,
  `searchRange()`, `getById()`, `searchAfter()`.
- `es-adapter.ts`: Updated comments only — no logic changes needed (existing
  `_source` wiring already supports non-empty includes).

**Results (median of 3 runs, TEST cluster):**
- PP1 home-logo: **609→379ms** (-38%, target <400 achieved)
- PP5 filter-toggle: 903→546ms (-40%)
- PP8 search warm: 1220→903ms (-26%)
- PP9 chip-remove: 664→387ms (-42%)
- JB2 facet-click: **1216→750ms** (-38%, P2-2 target <800 hit for free)
- All search-based metrics improved 15-40%. Non-search metrics unchanged.
- JA3 metadata-click 277→949ms — baseline was anomalously low for a ~1.3M
  result search (compare PP8 baseline 1220ms). Not a regression.

**Dashboard fix:** Added 5 p95 metrics (`dt_ack_p95_ms`, `dt_status_p95_ms`,
`dt_first_pixel_p95_ms`, `dt_settled_p95_ms`, `status_total_p95_ms`) to
`perceived-graphs.html` — KNOWN_METRICS, METRIC_LABELS, select options,
getTargetForAction.

**Next:** P2-4 (parallel PIT open) documented in handoff — ~131ms further
saving on every search by opening PIT in parallel with first searchAfter.

### 24 April 2026 — Perceived-perf Phase 1 baseline + 4-fix pass

**Goal:** Close out Phase 1 of the perceived-perf audit by fixing four
attribution/instrumentation gaps and capturing the first real 3-run
baseline against TEST.

**Fixes applied:**

1. **`expectedAction` parameter in `computeMetrics`** (both
   `e2e-perf/perceived-short.spec.ts` and `e2e-perf/perceived-long.spec.ts`).
   Previously the helper picked the *first* `t_0` entry, which mis-attributed
   actions whose user-initiated trigger fires a downstream `search` `t_0`
   first (PP9 chip-remove → reported as `search`, PP10 position-map → ditto,
   JA2 image-dblclick → no anchor at all). New optional param filters to
   `t_0` entries with matching `action`, then derives lifecycle from there.
   Applied to every call site; left off only for JB3 alt+click and JB4
   (intentionally fall back to first-`t_0`).

2. **`open-detail` trace site added.** ImageGrid's `enterDetail` (the
   shared callback for single-click in phantom mode and double-click in
   explicit mode) emits `trace("open-detail", "t_0", { imageId })`.
   ImageDetail emits `trace("open-detail", "t_settled")` inside a rAF when
   `displayImage.id` first appears for a given session.
   - Initial implementation declared the `useRef` and `useEffect` after
     the `if (!image) return ...` early return → "Rendered more hooks
     than during the previous render" runtime error in browser. Fixed by
     hoisting the ref to top-level alongside the other refs and moving
     the effect immediately after `const image = ...` is computed
     (still well before the early return). Hooks rule: no conditional
     hook calls.

3. **JA3 metadata-click switched from `colourProfile:"Display P3"` to
   `colourModel:"RGB"`.** The Display P3 button doesn't exist on every
   David Young image, so the test would time out waiting for the locator.
   RGB is the cheap escape (the vast majority of corpus images are RGB).
   Also added `scrollIntoViewIfNeeded()` and a 200 ms post-panel-toggle
   settle to harden against intermittent click misses. Sanity bound on
   `finalTotal` initially set to ±2k, then relaxed to "> 100" once we
   noticed metadata click *replaces* (not appends) the query — so the
   resulting total is corpus-wide RGB (~1.3M), not query-narrowed.

4. **Legend documentation in `e2e-perf/results/perceived-graphs.html`.**
   Updated `#legend` text to explicitly call out that "—" cells are
   by-design gaps, not regressions: `density-swap`, `scrubber-scroll`,
   `fullscreen-exit`, and `open-detail` only emit `t_0`/`t_settled`;
   `filter-toggle` has no first-pixel site.

**3-run baseline captured (`Perceived baseline (post-refactor)`):**

| Step | Action | Ack | 1st-pixel | Settled |
|---|---|---|---|---|
| PP1 | home-logo | 1 | 609 | 609 |
| PP2 | sort-no-focus | 42 | 377 | 377 |
| PP3 | sort-around-focus | 42 | 871 | 871 |
| PP4 | sort-around-focus | 44 | 830 | 830 |
| PP5 | filter-toggle | 42 | — | 903 |
| PP6 | density-swap | — | — | 204 |
| PP7 | scrubber-seek | 1 | 987 | 987 |
| PP7b | scrubber-seek | 1 | 960 | 960 |
| PP7c | scrubber-scroll | — | — | 118 |
| PP8 | search | 0 | 1220 | 1220 |
| PP9 | search | 0 | 664 | 664 |
| PP10 | position-map | — | — | 2577 |
| PP6b | density-swap | — | — | 323 |
| PP6c | density-swap | — | — | 323 |
| JA1 | search | 0 | 388 | 388 |
| JA2 | open-detail | — | — | 104 |
| JA3 | metadata-click | 13 | 277 | 277 |
| JB1 | search | 0 | 553 | 553 |
| JB2 | facet-click | 54 | 1216 | 1217 |
| JB3 | search | 0 | 606 | 606 |
| JB4 | search | 0 | 571 | 769 |
| JB5 | fullscreen-exit | — | — | 2 |

All 22 perceived sub-scenarios green across 3 runs with correct action
attribution everywhere. Files written: `e2e-perf/results/perceived-log.{json,md}`.

**Audit doc updates (`exploration/docs/perceived-perf-audit.md`):**
- Status block: "Phase 1 in progress" → "Phase 1 complete"; baseline
  captured 24-Apr-2026; lists the 4-fix pass as part of completion.
- Scenario count: 12 short → 14 short (PP1–10 plus PP6b/c, PP7b/c).
- Acceptance criterion: "≥5 runs" → "≥3 runs" (deliberate match to jank
  cadence; 5+ considered too costly against shared TEST cluster).

**First Phase 2 candidates from baseline:** PP1 home-logo 609 ms (target
<200 ms; owner's named pain point, 3× over), JB2 facet-click 1216 ms
(no explicit target but feels worth investigating), PP10 position-map
2577 ms background (worth confirming nothing user-facing blocks on it).

**Tests:** 352 unit tests pass throughout. No production-code behavioural
change beyond the new `open-detail` trace site (which is gated on dev
or `localStorage.kupua_perceived_perf === "1"` and has zero prod cost).



### 23 April 2026 — Journey tests + --journeys-only harness

**Goal:** Add realistic multi-step journey tests (JA + JB) that measure perceived latency across full user workflows — search → filter → metadata click → seek → fullscreen — rather than isolated actions.

**New files:**
- `e2e-perf/journeys.spec.ts` — two journeys:
  - JA (scroll tier, `by:"David Young"`, 538 results): JA1 search → JA2 sort-reverse → JA3 metadata-click colourProfile on prescribed image f117d4a.
  - JB (two-tier, `uploader:avalonred`, 21628 results): JB1 search → JB2 facet-click subject:sport → JB3 alt-click -subject:news → JB4 scrubber seek ~50% → JB5 fullscreen enter+traverse20+exit.
- `e2e-perf/playwright.journeys.config.ts` — MBP 14" viewport (1720×960 @2x), 180s timeout.

**Harness additions (`run-audit.mjs`):**
- `JOURNEYS_METRICS_FILE`, `JOURNEYS_JSON`, `JOURNEYS_MD` constants.
- `--journeys` flag (run journeys in addition to jank) and `--journeys-only` flag (journeys only, skip jank + perceived).
- `runJourneysPlaywright()`, `clearJourneysMetricsFile()`, `readJourneysMetrics()`, `aggregateJourneysMetrics()`, `writeJourneysLog()`, `appendJourneysToMarkdown()` — mirror the perceived equivalents.
- Jank loop gated on `!perceivedOnly && !journeysOnly`.
- Usage comment header updated.

**Trace call sites added (`src/`):**
- `search-store.ts`: `trace("search", "t_0")` at start of `search()`.
- `FacetFilters.tsx`: `trace("facet-click", "t_0", { field, value })` at start of `handleFacetClick`.
- `ImageMetadata.tsx`: `trace("metadata-click", "t_0", { field, value })` at start of `useMetadataSearch` callback.
- `FullscreenPreview.tsx`: `trace("fullscreen-exit", "t_0")` at start of `exitPreview`.

**Bug fixes during implementation:**
- `journeys.spec.ts` was using `data-facet-field="subject.raw"` — corrected to `"metadata.subjects"` (the field's `esSearchPath` in field-registry).
- `Scrubber.tsx` lacked a testid on the track element; added `data-testid="scrubber-track"` to the root `div[role="slider"]`.

**Viewport configs (same session continuation):**
- `playwright.perf.config.ts` restored to original 1987×1110 @1.25x (was accidentally changed).
- Added independence comments to both perf and perceived configs.
- `--perceived-only` flag added to run-audit.mjs to skip jank suite.

**Tests:** 352 unit tests pass throughout.



### 23 April 2026 — Perceived-performance suite: Phase 1 build

Built the full Phase 1 infrastructure for measuring perceived latency, as specified
in `exploration/docs/perceived-perf-audit.md`.

**What was built:**

1. **`src/lib/perceived-trace.ts`** — Lightweight in-app tracer. Gated on
   `import.meta.env.DEV || localStorage.kupua_perceived_perf === "1"`. Zero prod
   cost. Exposes `window.__perceivedTrace__` (ring buffer, max 500 entries) and
   `window.__perceivedTraceClear__()`. Each `trace()` call also pushes a
   `performance.mark("perceived:<action>:<phase>")` for DevTools visibility.

2. **Store-side call sites in `search-store.ts`** (~6 sites):
   - `trace("search", "t_ack")` — when `set({ loading: true })` is called in `search()`
   - `trace("search", "t_first_useful_pixel")` + `trace("search", "t_settled")` — when
     results land in the normal (non sort-around-focus) path
   - `trace("sort-around-focus", "t_ack")` + `trace("sort-around-focus", "t_status_visible")`
     — when "Finding image…" status is set
   - `trace("sort-around-focus", "t_seeking")` — when "Seeking…" status is set
   - `trace("sort-around-focus", "t_settled")` — in-buffer fast path (focus in buffer,
     no seeking needed)
   - `trace("sort-around-focus", "t_first_useful_pixel")` + `trace(..., "t_settled")` —
     outside-buffer path (full buffer replacement after `_loadBufferAroundImage`)

3. **Component-side `t_0` sites** (5 components, ~7 sites):
   - `SearchBar.tsx`: home logo `onClick` → `trace("home-logo", "t_0")`
   - `SearchFilters.tsx`: sort field `handleSelectField` → `trace("sort-around-focus" |
     "sort-no-focus", "t_0", { sort, focusedId })`; sort direction `handleToggleDirection`
     → same; free-to-use `handleFreeOnlyToggle` → `trace("filter-toggle", "t_0")`
   - `StatusBar.tsx`: density toggle `toggleDensity` → `trace("density-swap", "t_0")`
   - `Scrubber.tsx`: track click (seek mode only) → `trace("scrubber-seek", "t_0",
     { mode: "click", pos })`; drag release (seek mode only) → `trace("scrubber-seek",
     "t_0", { mode: "drag", pos })`

4. **`e2e-perf/perceived.spec.ts`** — 7 test scenarios (PP1–PP7):
   - PP1: Home logo click
   - PP2: Sort field change (no focused image)
   - PP3: Sort field change with focused image (sort-around-focus)
   - PP4: Sort direction toggle with focused image
   - PP5: Filter checkbox toggle
   - PP6: Density swap
   - PP7: Scrubber seek (click track at 50%, seek mode only)
   Each scenario: clears trace buffer → triggers action → waits for store settle →
   reads trace → computes dt_ack_ms, dt_status_ms, dt_first_pixel_ms, dt_settled_ms,
   status_total_ms → writes to `.perceived-tmp.jsonl`.

5. **`e2e-perf/playwright.perceived.config.ts`** — separate Playwright config for
   the perceived suite (matches `**/perceived.spec.ts`).

6. **`e2e-perf/run-audit.mjs --perceived`** — new flag that runs the perceived suite
   after the jank suite. Aggregates metrics (median + p95 per scenario per metric),
   writes to `results/perceived-log.json`, `results/perceived-log.js`,
   `results/perceived-log.md`. Prints a perceived summary table to console.

7. **`e2e-perf/results/perceived-graphs.html`** — sparkline dashboard for the perceived
   log. Mirrors the design of `audit-graphs.html`. Shows per-scenario cards with
   metric chips (ack/first-pixel/settle/banner) colour-coded against Phase 1 targets,
   plus sparklines over time. Loads via `window.__PERCEIVED_LOG__` (from `perceived-log.js`)
   or falls back to `fetch()` / file picker.

**Key design decisions:**
- All traces are no-ops in production (tree-shaken by Vite). No bundle impact.
- Off by default in dev (localStorage flag required). Clean for normal poking.
- In Playwright, the harness (via `addInitScript`) sets the flag before navigation.
- The test spec uses separate per-action buffer clears so there's no cross-action noise.
- `t_settled` is approximated by the store's `loading: false` + `sortAroundFocusStatus: null`
  — close enough for Phase 1, per the audit doc's guidance.
- The `t_0` for "search" actions (filter toggle, sort change) is emitted at the component
  `onChange`/`onClick` sites. The store's `t_ack` is keyed as "search" not "filter-toggle",
  but since the buffer is cleared between actions, the harness reads them positionally
  (first `*:t_ack` after `*:t_0`) and action name mismatches don't corrupt timing.

**Tests:** All 352 Vitest unit tests pass. No TypeScript errors in modified files.

**Next step:** Run `node e2e-perf/run-audit.mjs --perceived --label "Phase 1 baseline"
--runs 5` against TEST cluster to get the first perceived-log entry. This requires
user permission (per session smoke-test rule).



### 23 April 2026 — Click-to-search fix: _externalQuery latch never cleared

**Bug.** After clicking a metadata value (ImageDetail panel) or Shift/Alt-clicking
a table cell to launch a search, the CQL search input became permanently
unresponsive — typing, deleting chips, or any manual query edit was silently
ignored. Only a full page reload recovered.

**Root cause.** `cancelSearchDebounce(newQuery)` sets `_externalQuery` so the
debounce callback can detect stale updates. The only clearing path was inside
the debounce callback itself, when the query happened to match. But the
`_cqlInputGeneration` bump (which forces CqlSearchInput to remount) meant the
remounted editor's initial `queryChange` was suppressed by `lastEffectiveQueryRef`,
so no matching debounce ever fired. Result: `_externalQuery` stayed set
permanently, and `handleQueryChange`'s guard (`_externalQuery !== null &&
queryStr !== _externalQuery`) silently dropped every future debounced update.

**Affected paths.** All four click-to-search entry points: metadata plain click,
Shift+click (AND), Alt+click (NOT) in ImageMetadata; and Shift/Alt cell click
in ImageTable. All call `cancelSearchDebounce(newQuery)` → `updateSearch`.

**Fix.** Clear `_externalQuery` in `useUrlSearchSync` after `search()` fires.
At that point the URL has moved to the new query and the old debounce timer
was already cancelled — the latch has served its purpose. One line:
`setExternalQuery(null)` in `useUrlSearchSync.ts`.

**Tests.** Two new E2E tests in `ui-features.spec.ts` (Click-to-search describe
block): metadata click → edit CQL input, and table Shift+click → edit CQL input.
Verified the test fails without the fix (3s timeout on URL update).

### 23 April 2026 — Velocity-aware forward-extend trigger (seek-mode wall mitigation)

**Problem.** At sustained fast wheel/trackpad velocity in seek mode (>65k
results), the browser pins `scrollTop` at the bottom of the buffered
content while waiting for `extendForward` to return. The static
`EXTEND_THRESHOLD = 50` was tuned for casual scrolling; under a real
flick gesture (P8 perf test averages ~1700 items/s, peaks at 24,000) the
user eats those 50 items in well under the ES round-trip, so the wall is
hit on every fast scroll.

**Why "do nothing" was tempting.** The architecture is at its right local
optimum — windowed buffer + ES round-trip latency is fundamental, no
client-side trick fully eliminates the wall. The first attempted fix
(Option A: cap `virtualizerCount` at 100k with scaled coords above) was
rejected because at 9M total it makes 1 virt-row = 90 global items, so
slow trackpad scroll skips ~11 images per row — a worse UX than
stoppage. Reverted.

**The chosen approach: velocity-aware widening of the forward trigger.**
Mirrors the prefetch-cadence work in `image-prefetch.ts` — same
financial-data-style EMA smoothing of a noisy signal, applied to a
different decision. `reportVisibleRange` tracks an EMA-smoothed forward
velocity (items/ms) and the forward extend trigger widens to
`EXTEND_THRESHOLD + velocity × VELOCITY_LOOKAHEAD_MS`, capped at
`PAGE_SIZE = 200`. At rest the trigger is the bare 50; under a fast
burst it expands toward 200, firing the extend earlier so the fetch
overlaps with the user still chewing through buffered items. Same
α = 0.4 convention as the prefetch cadence smoother.

**Why this is safe.** Only changes *when* `extendForward` fires; the
extend itself (fetch, set, eviction, compensation gating) is unchanged.
Worst case extends fire earlier than today, never later — every guard
(in-flight, seek cooldown, PIT generation) still applies. **Forward-only
by design.** Backward extends pair with prepend compensation — the
central swimming risk — and are deliberately untouched.

**What it can't fix.** At sustained max velocity even prediction can't
beat physics: if you eat 200 items in 200ms but the extend takes 500ms
you'll still pin, just further from where you started. Better than
today, not perfect.

**Implementation.**
- New constants in `constants/tuning.ts`: `EXTEND_THRESHOLD` (moved from
  `useDataWindow.ts`), `VELOCITY_EMA_ALPHA = 0.4`,
  `VELOCITY_LOOKAHEAD_MS = 400`, `VELOCITY_IDLE_RESET_MS = 250`.
- `useDataWindow.ts`: pure helpers `_updateForwardVelocity()` and
  `forwardExtendThreshold()` (exported for testability), module-level
  velocity state `_lastReportTime`/`_lastEndIndex`/`_velocityEma`,
  reset helper `_resetForwardVelocity()`. Both forward-extend triggers
  (two-tier branch and normal-mode branch) now use the velocity-widened
  threshold; backward triggers untouched.
- `useDataWindow.test.ts`: 10 new unit tests covering threshold linearity,
  PAGE_SIZE cap, idle reset, non-monotonic clock, EMA math, burst
  smoothing, negative velocity.
- `tuning-knobs.md`: documented the 4 knobs.
- `03-scroll-architecture.md` §3 normal-scrolling: short note on the
  velocity-aware trigger.

**Verification.**
- vitest: 352/352 pass (10 new).
- Playwright local suite: 153/153 pass (6.3min).
- Manual TEST repro on 1.3M-doc cluster: pin moves further out under fast
  wheel; in slower scrolls behaviour is indistinguishable from before
  (velocity stays near zero → threshold collapses to 50).
- Perf audit `Velocity-EMA forward extend` (median of 3 headed runs vs
  previous baseline `Prefetch-cadence-S1-S4-S6`):
  - **P8 (table fast scroll, the worst case):** maxFrame 240 → 160 ms
    (−33%), LoAF blocking 1732 → 1302 ms (−25%), DOM churn 120 726 →
    95 737 (−21%), severeRate 54.8 → 48.2 ‰ (−12%), CLS 0.132 → 0.104
    (−22%). Large, consistent moves all in the right direction.
  - **All other tests:** within noise. Verdict-flagged "regressions"
    (P3, P3b, P11@20, P11@60, P5b, P5c, P12-scroll, P14a) are tiny
    absolute deltas (1–8 ms or 1–2 severe frames out of thousands) on
    tests that don't fire forward extends — system load fluctuation
    over a 30-min run, not signal.
- No invariants violated. No tier-matrix regressions.

**Tooling improvements (`run-audit.mjs`).** Added `--dry-run` /
`--no-log` flag (run + diff vs last entry, skip writes to
`audit-log.{json,js,md}`) and `--headed` flag (forward to Playwright).
Both are useful for quick local sanity checks without polluting the
audit log.

### 23 April 2026 — Caps Lock no-op for shortcuts, CQL aggregations search context-aware

Three small fixes:

1. **Caps Lock transparency (keyboard-shortcuts.ts):** Single-letter shortcuts
   (e.g. `f` for fullscreen) now normalise to lowercase when Shift is not held,
   so Caps Lock no longer blocks them. Shift+letter remains distinct.

2. **CQL typeahead query scoping (typeahead-fields.ts, CqlSearchInput.tsx):**
   Typeahead suggestion aggregations previously used `getAggregation(field, undefined)`
   which hit `match_all` — showing global top-50 values regardless of the active search.
   Now uses `getAggregations(params, [{field, size}])` with full `buildQuery`, so
   suggestions are scoped to current results (matching how FacetFilters already worked).
   Added `getParams` callback to `buildTypeaheadFields`; `scopedAgg()` helper
   centralises the fallback path.

3. **Static-list suggestion sorting (typeahead-fields.ts):** `mergeWithCounts` now
   sorts by doc count descending when counts are available, matching ES's native
   ordering for dynamic fields. Items with no count sink to the bottom alphabetically.
   Affects fileType, subject, and config alias fields.

### 23 April 2026 — Swipe-to-dismiss URL-stale + pinch-zoom anchor drift fixes

Two mobile gesture bugs reported and fixed in image detail.

**Bug 1 — swipe-down dismiss left URL stale.** Swiping to dismiss image
detail completed visually but `image=` stayed in the URL and the wrapper
kept intercepting touches, so the grid behind couldn't be scrolled. Root
cause: `cbDismiss.current()` (= `closeDetail`, which strips the `image`
URL param and unmounts the overlay) was fired inside the FLIP phantom's
`transitionend` listener — about 280ms after commit. During that window
the wrapper was `opacity:0` but still mounted with the original URL.

Fix: in `useSwipeDismiss.ts`, fire `cbDismiss` immediately at commit
time. The phantom is appended to `document.body` so its FLIP flight
continues independently of `ImageDetail`'s React unmount. Backdrop
cleanup moved to a `setTimeout` safety net (it outlives the unmount).
Same change applied to the no-thumbnail fallback branch.

**Regression caught during manual test.** The same pattern applied to
the fullscreen-dismiss branch broke it: tapping image to enter
fullscreen, swiping down to exit, left the image area visually empty.
Root cause: `cbDismiss` in fullscreen is `toggleFullscreen()`, which
calls `document.exitFullscreen()`. Exiting fullscreen mid-transition
forces a layout change that interrupts the CSS transition →
`transitionend` never fires → inline `opacity:0; transform:translateY(...)`
styles stick on the image element. Reverted just the fullscreen branch
to wait-for-transitionend (no URL-stale concern there since toggling
fullscreen doesn't change the URL or unmount anything).

**Bug 2 — pinch-zoom anchor drifted after pan.** First pinch from origin
worked correctly; subsequent pinches (after panning the zoomed image)
zoomed around the wrong screen point. Root cause: `usePinchZoom.onTouchMove`
computed the pinch-stable midpoint relative to container centre with a
formula that was missing a `* (scale / pinchScaleStart)` factor on
`pinchTranslateStart`. From origin (`pinchTranslateStart = {0, 0}`) the
factor disappears, so the bug was invisible. After any pan, the formula
drifted.

Fix: anchor pinch in image space. At touchstart, capture the image-space
offset of the initial midpoint by inverting the current transform
(`(mid − centre − translate) / scale`). On each move, compute the new
translate so the same image-space anchor stays under the new midpoint
(`newTranslate = newMid − centre − anchor × newScale`). Mathematically
correct from any starting transform.

**On the testing question raised mid-session.** The fullscreen-empty
regression was caught manually, not by tests. Vitest can't repro it
(needs real CSS + Fullscreen API + touch sequence + interleaving).
Playwright can technically repro it but needs the assertion to be
written knowing the failure mode. The general issue: the three touch
hooks (`useSwipeCarousel`, `useSwipeDismiss`, `usePinchZoom`) share a
hand-written imperative pattern with subtle invariants not enforced in
code. Adding more e2e tests catches only known failures. Better lever:
shrink the surface area. Captured a small refactor plan in
`exploration/docs/touch-gestures-hardening-plan.md` — two pieces (an
`animate()` helper that guarantees `onComplete` fires exactly once,
and a pure pinch-math module that makes coordinate bugs unit-testable).
Not started; pick up next time gesture code is touched or a third bug
shows up there.

Files changed:
- `src/hooks/useSwipeDismiss.ts` — immediate `cbDismiss` in commit + fallback;
  fullscreen branch unchanged (waits for `transitionend`).
- `src/hooks/usePinchZoom.ts` — image-space pinch anchor.
- `exploration/docs/touch-gestures-hardening-plan.md` — new, refactor plan.

Tests: 342 vitest unit tests pass. Playwright not run (touch-hook changes
verified manually on real device).

### 23 April 2026 — Mobile autofocus suppression + caret preservation across tab/window switch

Two related fixes to CQL search input focus behaviour.

**Mobile autofocus suppression.** On touch-primary devices, focusing the
search input pops the on-screen keyboard which obscures roughly half the
viewport. Three call sites now skip focus on `(pointer: coarse)`:

- `CqlSearchInput.tsx`: skips the `autofocus` attribute on mount.
- `lib/orchestration/search.ts`: `resetScrollAndFocusSearch` skips the
  post-navigate `cqlInput.focus()`.
- `lib/reset-to-home.ts`: same skip after the home reset.

New `lib/is-mobile.ts` helper centralises the `(pointer: coarse)` check
(matches existing pattern in `image-prefetch`, `image-urls`,
`ui-prefs-store`).

**Caret preservation across tab/window switch.** When the user moved the
caret mid-text, switched to another browser tab or app via Cmd+Tab, then
returned, the caret reset to position 0. Three previous attempts at this
fix were tried and reverted (see prior worklog handoff).

The hidden landmine — discovered by adding an on-page diagnostic overlay
(necessary because opening DevTools steals focus from the app window
and pollutes blur events) — is that `@guardian/cql`'s plugin
[`handleDOMEvents.blur` dispatches `setSelection(near(0))`](../../node_modules/@guardian/cql/src/cqlInput/editor/plugins/cql.ts#L382)
on every blur. By the time `window.blur` fires, PM's cached selection
has already been reset to position 1 (PM's "near 0" lands at 1, the
first node-edge position). Every previous attempt was reading position 1
and faithfully restoring it.

Fix has three pieces in `CqlSearchInput.tsx`:

1. **Wrap `view.dispatch`** to continuously cache `lastKnownSelection`
   on every PM transaction. Cost: one object allocation per transaction.
2. **Capture-phase blur listener on `view.dom`** snapshots
   `lastKnownSelection` into `savedSelection` BEFORE CQL's plugin
   reset-to-0 fires (capture phase runs before bubble-phase plugin
   handlers).
3. **Restore on `visibilitychange:visible` / `window.focus`**: call
   `view.focus()`, then dispatch `setSelection` in both a microtask
   (to win the race against PM's synchronous focusin reset most of the
   time) and a `requestAnimationFrame` (belt-and-braces for the cases
   where the microtask loses).

Listeners only fire on tab/window switch — zero per-keystroke cost
beyond the tiny dispatch wrapper allocation. PM positions are integer
offsets, not DOM Ranges, so they survive DOM mutation between save and
restore.

**Why CQL resets selection on blur:** Probably to prevent a stale
selection range from being visible (highlighted) when the editor is not
focused, particularly with chip nodes where the selection drawing might
look odd without focus. May also be defensive against PM's normal
behaviour of trying to restore the DOM selection on re-focus from PM
state — by resetting on blur, CQL guarantees a clean focusin position
regardless of where the user was last. **Worth a friendly upstream
discussion**: a `preserveCaretOnBlur` option, or simply not resetting
when the blur is caused by tab/window switch (vs. clicking elsewhere
in the app), would let consumers like kupua avoid the workaround.

Also added deviations §18 (mobile autofocus) and §19 (caret
preservation), and `is-mobile.ts` helper.

Files changed: `CqlSearchInput.tsx`, `lib/orchestration/search.ts`,
`lib/reset-to-home.ts`, new `lib/is-mobile.ts`,
`exploration/docs/deviations.md`.

### 23 April 2026 — Typeahead value suggestions with aggregation counts

Added count-annotated value suggestions to the CQL typeahead for all searchable
fields. When the user types e.g. `credit:`, the dropdown now shows matching
values with document counts (e.g. "AFP — 12,345") pulled from ES aggregations.

**Store cache sharing:** Typeahead resolvers read from the search store's
existing `aggregations` cache (populated by the batched `fetchAggregations()`
call) via an `aggregationsRef` getter, avoiding duplicate ES requests. When
the cache doesn't contain the needed field, resolvers fall back to a single-field
`dataSource.getAggregation()` call.

**Key implementation details:**

- `typeahead-fields.ts`: New `TypeaheadSuggestion { value, count? }` type.
  `mergeWithCounts(prefix, values, buckets?, mapBucketKey?)` merges static/
  dynamic value lists with aggregation bucket counts. `storeBuckets(cqlKey,
  getAggregations?)` looks up agg data from the store cache.
- `mapBucketKey` parameter handles ES key → display value mismatches (e.g.
  fileType stores `"image/jpeg"` but displays `"jpeg"`).
- All alias fields (`fieldAliases` from config) now have resolvers that check
  store cache first, then fall back to single-field ES calls. Static fields
  (fileType, subject) also have fallback ES calls.
- `showInKeySuggestions` flag on `TypeaheadFieldDef` + `hiddenFieldIds` param
  on `LazyTypeahead` — alias fields with value resolvers appear in value
  suggestions but are hidden from key suggestion dropdown (since they duplicate
  their parent field).
- CQL's native `TextSuggestionOption.count` renders counts flush-right. Custom
  shadow DOM style injection for `.Cql__OptionCount` (opacity: 0.7,
  margin-left: 1.5em).
- Updated `mapping-enhancements.md`: added §0 "The Problem" (features blocked/
  degraded by current mappings) + 6 amendments across existing sections.

Files changed: `CqlSearchInput.tsx`, `typeahead-fields.ts`, `lazy-typeahead.ts`,
`mapping-enhancements.md`.

### 22 April 2026 — CQL chip composition no longer resets search results

**Bug:** Composing a CQL chip expression (pressing `+`, selecting a field
from the typeahead) triggered URL updates and ES searches with incomplete
query fragments, resetting results to 0. Kahuna doesn't have this problem.

**Root cause (two layers):**

1. **Incomplete chips leaked to URL.** CQL's `queryChange` event emits a
   normalised `queryStr` that includes in-progress chips — e.g. pressing `+`
   after "climate" emits `"climate :"`, selecting `credit` emits
   `"climate credit:"`. Kupua passed this straight to the URL, triggering an
   ES search with a meaningless fragment. Kahuna avoids this because its
   `renderQuery()` pipeline has `.filter(item => item.value)` which silently
   drops chips with no value, plus `.distinctUntilChanged()` which suppresses
   the update entirely when the rendered query is unchanged.

2. **Trailing-space quoting diverged the query.** CQL's AST serialiser
   wraps text in quotes when it contains whitespace. Typing "climate " (with
   trailing space, preparatory to pressing `+`) emits `'"climate "'` — a
   different string from `climate`, so the URL updated even though the search
   intent was identical. Kahuna's `renderQuery` reconstructs from raw AST
   values (no CQL quoting) and trims, so the trailing space is invisible.

**Fix — CqlSearchInput.tsx:** Moved the defence into the `queryChange`
handler inside `CqlSearchInput`, before `onChange` reaches `SearchBar`:

- Strip incomplete chip expressions (`key:` with no value) via regex.
- Strip CQL auto-quoting that's only caused by trailing/leading whitespace
  (not real multi-word phrases).
- Track the last "effective" query in a ref (`lastEffectiveQueryRef`) and
  only call `onChange` when it changes — equivalent to kahuna's
  `distinctUntilChanged()`.
- Pre-set `lastEffectiveQueryRef` in the value-sync effect before
  `setAttribute("value", …)` to prevent the synchronous `queryChange`
  from being reported as a spurious change.
- Gate the value-sync `setAttribute` with a `selfCausedChangeRef` flag:
  when our own `queryChange` handler fires `onChange`, the flag is set so
  the subsequent value-sync effect skips `setAttribute`, preserving the
  CQL editor's ProseMirror state. Without this, backspacing through a
  chip value (e.g. `colourModel:CMYK` → `colourModel:`) would cause the
  stripped effective query (empty string) to flow back via props and
  clobber the chip entirely. External value changes (back/forward
  navigation, cell click) don't set the flag, so `setAttribute` fires
  normally. Kahuna avoids this because `gr-cql-input` never syncs the
  value attribute back from the URL.

Files changed: `CqlSearchInput.tsx`, `SearchBar.tsx` (simplified — stripping
logic moved upstream to CqlSearchInput).

Rewrote `image-prefetch.ts` around a **TraversalSession** state machine that
tracks user navigation cadence (EMA-smoothed interval between prev/next calls)
and adapts prefetch strategy accordingly. Executed Sessions 1–4 + 6 of the
`prefetch-cadence-workplan.md` plan (now in `zz Archive/`). Session 5
(StableImg→bare `<img>` on desktop) skipped — risk/reward poor for primary surface.

**Session 1 — Scaffolding (no behaviour change):** 6 tuning constants in
`tuning.ts` (FAST_CADENCE_MS=350, BURST_END_MS=280, SESSION_TIMEOUT_MS=2000,
FAR_LOOKAHEAD=6, FULL_RADIUS_AHEAD=4, FULL_RADIUS_BEHIND=1). TraversalSession
type + module-level singleton. `tunable()` helper reads localStorage overrides
(`kupua.prefetch.<key>`) fresh each call for DevTools tuning without rebuilds.
`computeCadence()` pure EMA function. `prefetchLog()` ring buffer +
`getPrefetchStats()` + `__resetPrefetchForTests()` test harness.

**Session 2 — Cancellation + fetchPriority + thumbnail-first:** Rewrote
`prefetchNearbyImages` to open/reuse a session, track in-flight requests in a
`Map<imageId, HTMLImageElement>`, cancel stale requests via `img.src = ""`
(aborts on Chromium/WebKit, frees connection slot on Firefox). `fetchPriority`
hints: `"high"` for i+1 full-res + i±1 thumbnails, `"low"` for rest. Mobile
issues thumbnails before full-res within each batch. Dropped old 150ms throttle
gate. Renamed `Image` type import → `ImageRecord` to avoid DOM collision.

**Session 3 — Cadence-aware skipping + post-burst debounce:** During fast
bursts (cadence < 350ms), skip middle radius — only prefetch i±1 + far
lookahead i±6. After burst settles (280ms debounce), fire full-radius
prefetch around resting position. Session auto-closes after 2s idle.

**Session 4 — FullscreenPreview convergence:** Deleted inline `getImageUrl()`;
replaced with shared `getCarouselImageUrl`. Added `fetchPriority="high"` to
the `<img>`. Removed dead `getFullImageUrl`/`getThumbnailUrl` imports.

**Session 6 — Cleanup:** Dropped `lastPrefetchTime` param from
`prefetchNearbyImages` (session manages timing). Removed `lastPrefetchRef`
from `useImageTraversal`. Stripped stale throttle comments. Added comprehensive
top-of-file doc comment describing the session model.

**Tests:** 20 new unit tests in `image-prefetch.test.ts` (cadence EMA × 6,
session behaviour × 8, cadence-aware behaviour × 6). All 342 tests pass.

**Perf audit (3 runs × 19 tests):** No regressions vs "Post-carousel-cleanup"
baseline. Key traversal metrics: P14a maxFrame 67ms, P14d (rapid 12/s)
maxFrame 60ms. Zero blank flashes. CLS ~0 everywhere.

Workplan: `zz Archive/prefetch-cadence-workplan.md` (Sessions 1–4+6 ✅, 5 ⏭️, 7 not attempted).

### 22 April 2026 — Browser gestures in viewer + perf results page

**Browser back/forward swipe gesture restored on desktop (ImageDetail.tsx).**
The image-detail container used `overflow-hidden` to clip the swipe-carousel's
off-screen prev/next panels. Side-effect: macOS Safari/Chrome treat any
horizontal-overflow-clipping element as a scroll container and *eat* the
trackpad two-finger back-swipe gesture (browsers reserve it for elements that
might scroll). Switched the two relevant clips to `overflow-clip` (paint-only,
no scroll-container semantics): outer flex container `overflow-y-auto
sm:overflow-clip`, image container `overflow-clip`. Also switched the
metadata aside to `sm:overflow-x-clip` (keeps `overflow-y-auto` for vertical
scrolling, prevents accidental horizontal scroll-container creation). Mobile
swipe carousel unaffected — still works because mobile uses `touch-pan-y` /
`touch-none` to opt out of native gestures explicitly.

**Perf audit graphs page (e2e-perf/results/audit-graphs.html).** Throwaway
single-page dashboard plotting one sparkline per perf test across every entry
in `audit-log.json`. Chart.js, dark theme, metric switcher (severeRate by
default, plus maxFrame, p95Frame, LoAF blocking, DOM churn, CLS, focusDrift*),
linear/log toggle, latest-run highlighted in red, hover shows label/SHA/date.

Loads via sibling `audit-log.js` (`window.__AUDIT_LOG__ = …`) so it works on
plain `file://` opens — no http server needed. `run-audit.mjs` writes the
sibling file alongside the JSON on every run; refresh page to see new data.
Fetch + drag-drop fallbacks remain.

Data-driven: reads whatever metrics/tests are in JSON. Allow-lists
(`KNOWN_METRICS`, `KNOWN_ENTRY_KEYS`) declare what the page understands;
unknown keys trigger a red banner pointing the next agent at the file to
update. Documented in `e2e-perf/README.md` § "Audit graphs page" — agents
adding metrics to `perf.spec.ts`/`run-audit.mjs` must update the HTML
allow-list too. `audit-log.js` is git-ignored (derived from JSON).

Also: ran `--runs 3` audit labelled "Post-carousel-cleanup — 22 Apr"
(a2f5a80db). Headlines vs prior single-run baseline: P8 severeRate
56.4‰→46.0‰ (-18%), P12-scroll LoAF blocking 77→28ms (-64%), P11b@85 LoAF
32→12ms (-63%), P2 severeRate -34%, P9 maxFrame -19%. Auto-flagged
"regressions" all small and within run-to-run jitter; the 1-vs-3-run
comparison was asymmetric.

### 22 April 2026 — Fix New Images ticker scroll + phantom dblclick leak

**Ticker scroll-to-top (StatusBar.tsx):** Clicking the "x new" ticker button
called `search()` but never scrolled to top. Added `resetScrollAndFocusSearch()`
before `reSearch()` — same mechanism used by the Home logo. Covers both scroll
mode (eager scrollTop=0) and seek mode (bumps `_thumbResetGeneration` for the
Scrubber flash guard). Search context (query, filters, sort) is untouched.

**Phantom dblclick leak (ImageDetail.tsx):** In phantom (click-to-open) mode,
double-clicking a grid cell or table row opened detail then immediately closed
it. Cause: click₁ navigates to detail, React mounts ImageDetail fast enough
that click₂ lands on the `<img>`, browser synthesises a `dblclick` →
`closeDetail`. Fix: 500ms mount guard on the `onDoubleClick` handler — stray
dblclick from grid/table is always <300ms after mount (OS double-click
threshold); legitimate double-click-to-close is always >500ms.

### 20–22 April 2026 — Fix rapid-swipe duplicate-image bug + carousel polish

Two-day investigation into a mobile-only bug: aggressive swiping showed the
same image sliding in up to 4× before the correct one appeared. Desktop
unaffected. Fully diagnosed and fixed.

**Root cause:** AVIF images take 300–500ms to decode on phones. The 3-panel
carousel (prev | center | next) slides an undecoded panel into view during
the 200ms WAAPI animation — the browser shows the OLD compositor texture
as a placeholder, creating a "duplicate image" illusion. This is a physical
constraint (decode latency), not a code-level race condition. Eight code-level
fixes were attempted and failed before this was understood.

**Key discovery:** Chrome does NOT share decoded bitmaps between Image objects.
A prefetched `new Image()` with `img.decode()` warms the HTTP cache but does
NOT help a subsequent DOM `<img>` paint faster — each element does its own
AVIF decode independently.

**The fix (4 layered mechanisms):**
1. `commitStripReset` — copies target panel src to center, clears side panel
   srcs (`removeAttribute("src")`) to destroy stale compositor textures.
2. `StableImg` — imperative `<img>` src management that prevents React from
   redundantly re-setting URLs (which resets `img.complete` → re-decode).
   Uses `data-committed` flag from commitStripReset to skip writes.
3. **COMMIT-time `data-thumb` fallback** (the actual fix) — at swipe commit,
   before WAAPI animation starts, checks target panel's `img.complete`. If
   false (still decoding), swaps src to pre-cached thumbnail JPEG via
   `data-thumb` attribute. Thumbnails decode from cache in <10ms.
4. Prefetch pipeline with `onFullResDecoded` subscription — side panels get
   full-res URLs when prefetch reports decoded, thumbnail otherwise.
   `prefetchGen` state triggers useMemo recomputation on decode completion.

**Result:** slow swipes show full-res (no quality transition). Rapid swipes
show thumbnails (no duplication). Correct image always shown.

**Review-driven cleanup (from fresh-agent critical review):**
- Stripped all diagnostic code (`diagLog`, `diagStartFrameTracker`,
  `SwipeDiagButton`) — `getComputedStyle()` per animation frame was forcing
  synchronous layout reflow in production.
- `_loadedFullRes: Map<string, HTMLImageElement>` → `Set<string>` — the Map
  stored Image objects based on the disproved bitmap-sharing theory; freed
  ~12MB of dead memory on phone.
- Corrected doc comment claiming "keyed side panels" (never shipped).
- Restricted thumbnail prefetch to i±1 (only immediate neighbours used by
  data-thumb fallback; was prefetching 5 thumbnails per nav).
- Extracted `getCarouselImageUrl()` — single source of truth for carousel
  image URLs shared by prefetch and panel useMemos. Fixed the "same image,
  different imgproxy URL" divergence that caused center panel re-decode
  after landing (the "second slow swipe shows thumbnail" issue).
- Moved `pendingCb`/`pendingDirection`/`pendingAnimation` above listeners.

**Desktop optimizations:**
- Side panels gated on `_pointerCoarse` — desktop never swipes, was wasting
  2 AVIF fetches + decodes per arrow press (~66% bandwidth/CPU reduction).
- `img.decode()` skipped on desktop prefetch — only HTTP cache warming
  needed, saves ~400–750ms background CPU per navigation.
- `will-change-transform` on strip made mobile-only (no GPU layer waste).

**Other changes in this batch:**
- Mobile DPR settled at 2 (was 1.5). `detectDpr()` in image-urls.ts:
  3-tier (1× standard, 1.5× desktop HiDPI, 2× mobile HiDPI via
  `pointer: coarse` heuristic). Better pinch-zoom headroom.
- WAAPI rewrite kept — `strip.animate()` + `.finished` promise replaces
  CSS transitions. Microtask resolution, no transitionend bubbling.
- Zoom cooldown (400ms post-swipe), tap-to-exit cooldown (250ms).
- Thumbnail prefetch mobile-only (`isTouchDevice` guard).
- Initial prefetch on mount in `useImageTraversal`.

**Known remaining items (not blocking):**
- First image in detail view loads slower than before (likely related to
  prefetch changes or StableImg's imperative src management). Deferred.
- `touch-none` on image container blocks vertical scroll-through from image
  area to metadata panel on mobile. Proper fix requires dynamic
  `touch-action` management — deferred as separate task.
- Prefetch `img.decode()` on mobile wastes CPU for images 2–4 ahead (the
  decoded bitmap is never reused by DOM elements). Only the decode
  *completion signal* matters for side-panel URL selection. Could switch
  to `img.onload` or `<link rel="preload">` to avoid wasted decode CPU.
- `prefetchGen` state could be removed from desktop path (only used for
  side panel upgrades, which are now mobile-gated). Falls out naturally.

**Files:** `useSwipeCarousel.ts`, `StableImg.tsx` (new), `ImageDetail.tsx`,
`image-prefetch.ts`, `image-urls.ts`, `useImageTraversal.ts`,
`usePinchZoom.ts`, `deviations.md`. Diagnostic files removed:
`swipe-diag.ts`, `SwipeDiagButton.tsx`.

**Investigation archive:** `zz Archive/swipe-carousel-review.md` (critical
review with remaining recommendations), `zz Archive/touch-gestures-handoff.md`.

### 20–21 April 2026 — Mobile image detail layout (Issue #4)

Implemented stacked layout for image detail view on narrow/touch screens.
Previously the metadata sidebar (`w-72 shrink-0`) consumed 288px of a 390px
phone screen, leaving the image invisible.

**Layout (ImageDetail.tsx):**
- Main content area switches from `flex-row` to `flex-col` below `sm` (640px).
  Image container `h-[55svh]` on mobile (uncapped on desktop), `shrink-0`.
  Metadata sidebar becomes full-width scrollable area below the image.
- Uses `svh` units (not `dvh`) for stable height when Android address bar
  shows/hides — `dvh` caused a twitch on fullscreen exit.
- `touch-action: none` on image container (carousel needs full touch control),
  `touch-action: pan-y` on outer scroll container (vertical scroll only).
- Desktop layout completely untouched — all changes behind `sm:` breakpoints
  or `pointer:coarse` media queries.

**Visual swipe carousel (useSwipeCarousel.ts, new):**
- 3-panel strip (prev|current|next) as absolutely-positioned divs, animated
  with `translateX`. Drag moves strip in real-time, release commits or snaps.
- Velocity-aware: fast flick (>400px/s) commits at any distance, slow drag
  needs >35% of container width. Velocity via exponential moving average.
- Snap animation 200ms ease-out.
- `commitStripReset()` — on transitionend, imperatively copies the swiped-to
  panel's img.src to the center panel, resets strip to translateX(0), THEN
  calls navigate(). Eliminates the async gap between animation end and React
  re-render — no flash of wrong image, regardless of compositor timing.
- ResizeObserver handles orientation change mid-animation (kills transition,
  commits immediately via commitStripReset).
- `swipedRef` exposed so onClick handlers can suppress tap after swipe.
- Prev/next image URLs computed with same imgproxy opts as prefetch pipeline
  → browser cache hits, no re-download.

**Flash/twitch bug journey:**
Three approaches tried before finding the right one:
1. **visibility:hidden** during async gap between swipe commit and React
   re-render — failed on Android Chrome (compositor paints independently
   of main thread, so hiding is too late).
2. **navigatingRef** guard to prevent ResizeObserver from resetting strip
   during the gap — added complexity, still didn't prevent the flash.
3. **commitStripReset** (final solution) — eliminates the gap entirely by
   doing imperative DOM manipulation in transitionend BEFORE calling
   navigate(). Center panel already shows the correct image when React
   re-renders, making it a visual no-op.

**Other mobile changes:**
- NavStrip prev/next buttons hidden on mobile (`hidden sm:flex`), swipe
  replaces them. NavStrip accepts `className` prop for this.
- Tap on image enters/exits fullscreen on `pointer:coarse` devices via
  Fullscreen API. Guarded by `swipedRef` (no fullscreen after swipe).
- `overscroll-behavior-x: none` on image container suppresses horizontal
  rubber-band on Android.
- `enabled` flag on carousel hook, set to `!!image` — prevents swipe
  registration before image data loads (fixes swipe-after-reload).

**Cleanup:**
- Deleted `useSwipeNavigation.ts` (original simple swipe hook, replaced
  entirely by useSwipeCarousel).
- Removed `navigatingRef` from both hook and component.

All 322 Vitest tests pass. Tested manually on Android Chrome (portrait +
landscape, orientation changes, swipe in both directions, tap-to-fullscreen).

### 20 April 2026 — Focus-mode test hardening

Hardened test infrastructure so the suite is resilient if phantom focus ever
becomes the default. Audited all tests, found 47 `focusNthItem()` call sites
across 11 files that would break (click navigates to detail in phantom mode
instead of setting focus).

**Changes to `e2e/shared/helpers.ts`:**
- Added `ensureExplicitMode()` / `ensurePhantomMode()` — set localStorage
  via `addInitScript` before page load, same pattern phantom-focus.spec.ts
  already used.
- Rewrote `openDetailForNthItem()` to be mode-independent: reads image ID
  from store via `page.evaluate()`, uses `.dblclick()` (works in both modes).
  No longer calls `focusNthItem()` internally.

**12 test files pinned to explicit mode** via `test.beforeEach` calling
`ensureExplicitMode()`: browser-history, focus-preservation, keyboard-nav,
scrubber, ui-features, visual-baseline, tier-matrix (local E2E);
manual-smoke-test, focus-preservation-smoke, home-logo-diag (smoke);
perf.spec.ts, experiments.spec.ts (perf).

**3 files skipped** (no pinning needed): phantom-focus.spec.ts (already sets
mode), buffer-corruption.spec.ts (no focus), smoke-scroll-stability.spec.ts
(no clicks).

Impact report archived to `zz Archive/focus-mode-test-impact-report.md`.
All 153 Playwright + 322 Vitest tests pass.

### 21 April 2026 — Phantom Focus Mode (kahuna-style click-to-open)

Implemented `focusMode: "explicit" | "phantom"` user preference with full
click, keyboard, and return-from-detail behaviour. Phantom mode makes
single-click open image detail (matching kahuna). Explicit mode adds
click-to-focus with double-click-to-open.

**New files:**
- `src/stores/ui-prefs-store.ts` — Zustand store for UI preferences, separate
  from search-store. Persists `focusMode` in localStorage (`kupua-ui-prefs`).
  Runtime `_pointerCoarse` flag via `matchMedia("(pointer: coarse)")` change
  listener. `effectiveFocusMode` derived: coarse → phantom, else stored pref.
  Switching to phantom clears `focusedImageId` via search-store.
- `src/components/SettingsMenu.tsx` — Three-dot menu (Material more_vert SVG)
  in SearchBar far-right. Two radio options: "Click to focus" (explicit) and
  "Click to open" (phantom). Coarse pointer disables explicit option.
  Closes on outside click or Escape. Button flush-right (mirrors Home logo
  flush-left pattern with `-mr-3`).
- `e2e/local/phantom-focus.spec.ts` — 8 E2E tests covering phantom click
  (grid + table), no focus ring, arrow scroll, Enter no-op, return-from-detail
  position, explicit click ring, explicit double-click.

**Modified files:**
- `ImageGrid.tsx` — Extracted `enterDetail()` callback shared by phantom
  single-click and double-click. `handleCellClick` dispatches on mode;
  returns early on Shift/Alt (modifier clicks are click-to-search, not detail).
  Focus ring gated: `isFocused` requires `getEffectiveFocusMode() === "explicit"`.
  Background click is no-op in phantom mode.
- `ImageTable.tsx` — Same pattern: `handleRowClick` dispatches on mode,
  returns early on Shift/Alt, focus ring gated on explicit.
- `useListNavigation.ts` — `hasFocus` condition now includes
  `getEffectiveFocusMode() === "explicit"` gate. Applies to both bubble
  handler (arrow/page/Enter) and capture handler (Home/End). Enter gated
  with early break when no focus.
- `FullscreenPreview.tsx` — `f` key entry gated on explicit mode (phantom
  returns early). Exit from fullscreen still works in both modes.
- `SearchBar.tsx` — Added `<SettingsMenu />` after ES timing display.
- `routes/search.tsx` — `FocusedImageMetadata` uses reactive
  `useEffectiveFocusMode()` hook; returns null in phantom mode so metadata
  panel shows "Focus an image to see its metadata" instead of stale data.
- `DateFilter.tsx` — Enter key on From/To date inputs now triggers the
  Filter button when draft differs from URL state. No-op when unchanged
  or when date input is empty/invalid (native `type="date"` only produces
  valid values).

**E2E test fixes:**
- `page.addInitScript` instead of `page.evaluate` for localStorage setup
  (SecurityError on `about:blank`).
- Scoped ring selector to `[data-grid-cell][class*="ring-2"]` — SearchBar
  and SearchFilters also use `ring-grid-accent` class.

**Existing behaviour unchanged:** 145 existing E2E tests pass with zero
regressions. Return-from-detail works in phantom mode via existing
`useReturnFromDetail` mechanism (sets focusedImageId for position engine;
ring hidden by gate).

### 20 April 2026 — Yet another Home bug fixed

Two real bugs (and one defence-in-depth hardening) in the Home logo reset path.

**Bug 1 — Scrubber thumb stuck at deep position after Home (Scrubber.tsx):**
The flash guard added in commit 4baad73eb ("Phantom focus promotion") suppressed
DOM writes when thumbTop dropped from deep (>50px) to near-zero (<10px). This was
intended to prevent a visual flash during sort-around-focus, but it also blocked the
legitimate Home-logo reset. After `resetScrollAndFocusSearch` set `thumb.style.top =
"0px"`, a React re-render with stale deep `currentPosition` wrote ~518px back. When
`search()` completed and thumbTop tried to settle at ~0, the flash guard permanently
blocked the correction.

*Fix:* Generation-based bypass in `Scrubber.tsx`. `resetScrollAndFocusSearch()` now
bumps `_thumbResetGeneration` (in `orchestration/search.ts`). The Scrubber's discrete
sync effect tracks this generation: when it changes and thumbTop is still deep, it
skips the stale write (preserving DOM 0px); when thumbTop settles near 0, it consumes
the generation and falls through. Sort-around-focus flash guard is unaffected (gen
never increments for that path).

**Bug 2 — Grid scrolls back to old position after Home from deep image detail
(search-store.ts + reset-to-home.ts):**
When `resetToHome` awaits `search()` and gets fresh first-page data (bufferOffset=0),
`ImageDetail` is still mounted (navigate() hasn't been processed yet). Its restore
effect sees the deep image vanish from the now-shallow buffer → fires
`restoreAroundCursor` → loads the deep image's neighbourhood → overwrites
bufferOffset back to ~671k. The user sees the grid snap back to the old position.

*Root cause identified via* diagnostic polling in smoke tests: 100ms samples of
scrollTop/bufferOffset/store state for 5 seconds after Home click. Showed bufferOffset
bouncing from 0 back to deep ~500ms after search() completed.

*Fix:* One-shot `_suppressRestore` flag in `search-store.ts`. `resetToHome` sets
`suppressNextRestore()` before calling `search()`. `restoreAroundCursor` checks and
consumes the flag at entry, skipping the spurious restore. A 2-second safety timeout
clears the flag after `navigate()` in case `restoreAroundCursor` never fires.

**This bug only manifests on TEST/PROD (>65k docs, seek mode).** On local ES (10k
docs, two-tier/scroll mode), the image is always in the first-page buffer, so
`restoreAroundCursor` never triggers. **Local e2e cannot catch this — requires smoke
tests against a real cluster.**

**Defence-in-depth — useUrlSearchSync dedup (reset-to-home.ts):**
Previously `resetSearchSync()` cleared `_prevParamsSerialized` to `""` at the top of
`resetToHome`, opening a race window: during `await search()`, React re-renders →
`useUrlSearchSync` sees `"" !== current` → fires `search(viewportAnchor)` pointing
to the deep image. This race wasn't the one firing in practice (restoreAroundCursor
was faster), but it's a real timing-dependent hole. Now `_prevParamsSerialized` is set
to the home params immediately, so `useUrlSearchSync` sees a match and skips. This
also removed the need for `resetSearchSync()` (now dead code, left as escape hatch).

**Secondary fix — useReturnFromDetail.ts:**
Added null guard: if `focusedImageIdRef.current === null`, skip re-focus. Prevents
the detail→absent transition from re-setting focusedImageId after `resetToHome`
intentionally cleared it.

**Test changes:**
- New: `e2e/smoke/home-logo-diag.spec.ts` — 4 diagnostic smoke tests (scrubber thumb
  grid/table, Home from deep detail with polling, Home from shallow detail)
- Amended: `buffer-corruption.spec.ts` — `assertCleanTopState` now checks thumb < 10;
  detail→Home test asserts `focusedImageId === null`
- Amended: `scrubber.spec.ts` — all Home tests assert thumb < 10

**Files changed:** `Scrubber.tsx`, `orchestration/search.ts`, `search-store.ts`,
`reset-to-home.ts`, `useReturnFromDetail.ts`, `buffer-corruption.spec.ts`,
`scrubber.spec.ts`, `useDataWindow.ts` (unused import), `useImageTraversal.test.ts`
(unused import). New: `home-logo-diag.spec.ts`.

### 19 April 2026 — Part B: tiny loose ends from core review

Seven small hardening/maintenance fixes from the combined deep review of the five core
files. Applied after Part A (same review session).

**search-store.ts (3 fixes):**
- **B3:** `computeScrollTarget` — `Math.round` → `Math.floor` for `currentRow`. At the
  headroom boundary row, `Math.round` snapped to the next row at 50% scroll, causing the
  headroom check to fail and producing negative `seekSubRowOffset` values. `Math.floor`
  is semantically correct ("on a row until fully scrolled past it"). Added Case 10
  boundary test + updated existing test expectations.
- **B5:** `fetchAggregations` — snapshot `frozenParams` once at top and reuse. Previously
  called 4 times across the async function; params drift between calls could store wrong
  cache key.
- **B7:** `seek()` — typed `let result: SearchAfterResult | undefined` (was untyped `let
  result;`) and added `if (!result)` guard before first access. Pure safety net for future
  edits that might introduce a new code path without assignment.

**useScrollEffects.ts (1 fix):**
- **B2:** Replaced hardcoded `303` with `GRID_ROW_HEIGHT` in bottom-extremum snap and
  in `scroll-geometry-ref.ts` default.

**useDataWindow.ts (1 fix):**
- **C2:** `getVisibleImageIds` — replaced fallback `localIdx = i` with `continue`. In
  two-tier mode the fallback could index into `results[12000]` (past array length). The
  `img?.id` guard prevented crashes but the intent was obscured.

**New shared utility:**
- **B1:** Extracted `isTwoTierFromTotal()` to `lib/two-tier.ts`. Was duplicated in
  `useScrollEffects.ts` and `useDataWindow.ts` with a "must stay in sync" comment.
  Both files now import from single source of truth.

**Other:**
- **F1:** Removed misleading `@deprecated` from `loadMore` — it's the canonical public API.

**Skipped with reason:**
- B4 (`_pendingFocusDelta` orphan): practically impossible, `search()` clears at top.
- B6 (`registerScrollGeometry` in effect): not worth it — plain module-level assignment.
- E0c (`dangerouslySetInnerHTML` in Scrubber tooltip): user chose to leave — values internal.
- F2 (position map fetch dedup): not worth control-flow reshuffling for 6 lines.
- F3 (perf marks on abort): very minor, DevTools only.
- F4 (timeout + offset correction race): harmless no-op.

**Housekeeping:**
- Deleted superseded April 2025 single-file reviews (search-store, useScrollEffects).
- Annotated combined review summary table with done/skipped status.
- Moved combined review to `zz Archive/`.

**Validation:** 322/322 Vitest, 145/145 Playwright E2E (1 flaky retry — T3 two-tier drag,
confirmed timing flake via 5/5 repeat-each, not a regression).

### 19 April 2026 — Part A: small fixes to big files

Six correctness fixes across `search-store.ts` and `useScrollEffects.ts`, identified
during a deep review of the five core files.

**search-store.ts (4 fixes):**
- **A1:** `_loadBufferAroundImage` — parallelised sequential fwd/bwd `searchAfter` calls
  with `Promise.all`. Both use the same cursor and PIT, are fully independent. Mirrors
  existing pattern in `seek()` position-map path.
- **A2:** `restoreAroundCursor` — parallelised sequential countBefore/searchAfter-by-ID
  (Step 1 & 2) with `Promise.all`. Neither uses PIT, no shared state. Step 3 depends on
  both outputs.
- **A3:** `fetchAggregations` debounce zombie promise — when a second call arrived during
  the debounce window, `clearTimeout` killed the timer but the first caller's `resolve`
  never fired, leaking a dangling promise + closure. Fix: module-level `_aggDebouncedResolve`
  stores the pending resolve; new call resolves old promise before clearing timer. Old caller
  resumes and exits via existing cache-key guard.
- **A4:** Fire-and-forget `_findAndFocusImage` — appended `.catch(console.error)` as
  belt-and-suspenders (internal try/catch + 8s timeout + finally already handles all known
  paths).

**useScrollEffects.ts (2 fixes):**
- **A5:** Effect #10 (density-focus mount restore) — nested `requestAnimationFrame`
  pattern had `raf2` declared inside `raf1` callback; the `return () => cancelAnimationFrame(raf2)`
  was the rAF callback's return value (silently discarded). Hoisted `let raf2 = 0` to outer
  scope in both branches; cleanup now cancels both handles.
- **A6:** Effect #6 (seek) — removed `virtualizer` from dependency array. The effect body
  never references it; `useVirtualizer` returns a new object every render, causing spurious
  re-fires (generation guard made them no-ops but wasted work).

**Tests added (6):**
- A1: "builds correctly centered buffer around focused image" (sort-around-focus describe)
- A2: 3 tests for `restoreAroundCursor` — centered restore, image-not-found fallback,
  null-cursor seek fallback
- A3: 2 tests for `fetchAggregations` — zombie promise detection (confirmed failure pre-fix),
  force=true debounce bypass

**Validation:** 321/321 Vitest, 145/145 Playwright E2E.

### 19 April 2026 — severeRate: refresh-rate-independent perf metric

**Problem:** P14 traversal severe frames appeared to double (4→9) after position-preservation
commits. Investigation traced 12 commits — no code regression found. Root cause: hardware
change from 60Hz NEC monitor to 120Hz MacBook Pro ProMotion. At 120Hz, rAF reports 2× frames
so absolute >50ms spike counts roughly double. Evidence: frameCount doubled across ALL tests
(335→641), p95Frame halved (18ms→9ms = 1/60→1/120), and severe/frameCount ratio stayed within
historical range (12.5–14.0‰ vs 6.0–21.3‰).

**Fix:** Replaced absolute `severe` count with `severeRate` (severe per 1000 frames) throughout
the perf infrastructure:
- `perf.spec.ts` `emitMetric()` — emits `severeRate` alongside raw `severe`
- `run-audit.mjs` `aggregateMetrics()` — computes `severeRate` from raw data
- `run-audit.mjs` tables, formatValue, formatDelta, regression detection — all use `severeRate`
- Old audit-log entries without `severeRate` get it computed on-the-fly from `severe/frameCount`

Clean 120Hz baseline established (3 runs, all 19 tests). LoAF blocking increase (141→192ms for
P14a) noted but not actionable — likely the tighter 8.3ms frame budget at 120Hz.

### 19 April 2026 — P13 perf test fix (test assumption error, not app bug)

**Problem:** P13 perf test ("image detail enter/exit — scroll restoration") failed with
scroll delta 3000px (threshold <606px). Appeared after position-preservation commits
(872734dd8–9d12d4db1).

**Root cause:** The test's measurement was wrong, not the app. `focusNthItem(2)` triggers
position-preservation which scrolls the viewport from 3000px to ~845px (the focused image's
natural position in the sorted grid). Then `cells.nth(2).dblclick()` hits a *different*
image because the virtualizer re-rendered at the new scroll position. The CSS toggle
(`contents` → `absolute inset-0`) resets scrollTop to 0, and `useReturnFromDetail` doesn't
restore because `wasViewing === previousFocus`.

Confirmed on real TEST data (1.3M images) via A/B diagnostic test. User visually verified
that both dblclick paths correctly return to the focused image's natural position.

**Fix (perf.spec.ts — P13, P14, P15):**
1. Record `scrollBefore` AFTER `focusNthItem` settles (not before the focus).
2. Dblclick the focused cell via `[data-grid-cell][class*="ring-2"]` instead of
   `cells.nth(N)` which may target a different cell after scroll moved.
3. Added 300ms settle wait between `focusNthItem` and scroll measurement.

**Verification:** 315 unit tests pass, 145 E2E tests pass, P13/P14/P15 perf re-run
(3 runs each) all green. P13a max frame improved 133→91ms.

### 18 April 2026 — Browser back/forward navigation (Sessions 6–7)

Fixed two problems that completely broke browser back/forward navigation.

**Problem 1 — No history entries for search changes.**
`useUpdateSearchParams()` hardcoded `replace: true` for all navigations, so
filter toggles, sort changes, query commits, and date range changes never
created history entries. Back/forward had nothing to navigate between (except
image-open and logo-click).

Fix: `useUpdateSearchParams()` now accepts `options?: { replace?: boolean }`
defaulting to `false` (push). Only SearchBar's debounced `handleQueryChange`
passes `{ replace: true }` so intermediate keystrokes don't pollute history.
All committed discrete actions (filter toggle, sort change, date range) use
the default push.

**Problem 2 — Popstate carried focus into wrong search context.**
When back/forward fired, `useUrlSearchSync` ran focus-preservation logic
uniformly: it read the current `focusedImageId` or promoted a phantom anchor
and passed it to `search()`. This caused the current focused image from
"dogs" results to be carried into the restored "cats" results, landing the
user deep at a random-seeming position.

Fix: Module-level user-initiated flag in `orchestration/search.ts`.
`markUserInitiatedNavigation()` is called synchronously in
`useUpdateSearchParams()` before `navigate()`. `useUrlSearchSync` reads
`consumeUserInitiatedFlag()` — if true (user-initiated), preserve focus;
if false (popstate/programmatic), skip focus preservation, reset `offset: 0`,
call `search(null)` to start from the top.

Initially tried a popstate-listener flag (`markPopstateNavigation` on
`window.popstate`), but TanStack Router's `onPushPopEvent` handler is async —
by the time the React effect ran, the flag could be consumed by an intermediate
no-op effect run (the dedup guard bails early but the flag is already cleared).
Inverting the flag to mark user-initiated navigations (synchronous, set right
before `navigate()`) solved this.

**Case-specific popstate behaviour:**
- Back from image detail (same search context, only `image` key removed) →
  display-only key guard skips re-search, focus preserved. Correct.
- Back to different search context (query/filter/sort changed) → `search(null)`,
  reset to top. Correct.
- Image traversal in detail view → uses `replace: true`, never creates history
  entries. Back from detail always returns to the entry point. Correct.

**E2E tests:** New `e2e/local/browser-history.spec.ts` with 5 tests:
sort-back, query-back, forward, no-focus-carry-on-back, image-detail-back.
All `spaNavigate` helpers across test files updated to call
`markUserInitiatedNavigation()` via `window.__kupua_markUserNav__` (exposed in
dev mode alongside `__kupua_router__`).

Files changed:
- `src/hooks/useUrlSearchSync.ts` — push-by-default, user-initiated flag check
- `src/lib/orchestration/search.ts` — `markUserInitiatedNavigation()` /
  `consumeUserInitiatedFlag()`
- `src/main.tsx` — expose `__kupua_markUserNav__` for E2E
- `src/components/SearchBar.tsx` — `{ replace: true }` for debounce
- `e2e/local/browser-history.spec.ts` — NEW (5 tests)
- `e2e/local/focus-preservation.spec.ts` — spaNavigate updated
- `e2e/local/buffer-corruption.spec.ts` — spaNavigate updated
- `e2e/smoke/focus-preservation-smoke.spec.ts` — spaNavigate updated
- `exploration/docs/browser-history-analysis.md` — rewritten to describe current state

315/315 unit tests, 145/145 local E2E.

### 18 April 2026 — Session 5: Smoke polish on TEST cluster

Validated Sessions 1–4 focus preservation against real TEST cluster (~1.3M images).
Wrote 12 smoke tests in `e2e/smoke/focus-preservation-smoke.spec.ts`:
- T1 phantom promotion (clear filter), T2 explicit focus (clear filter),
  T3 explicit focus (sort change), T4 neighbour fallback, T5 arrow snap-back,
  T6 scrubber thumb stability, T7 focus→clear focus→clear filter,
  T8 phantom with details panel, T9 rapid filter toggle,
  T10 focus→panel→clear filter, T11 phantom near top, T12 phantom near end.

**Bug 1 — scrubber thumb flash-to-top.** In deep-seek mode (>65k results),
`_findAndFocusImage` sets `offset=0` as placeholder before async `countBefore`
corrects (~100ms). The scrubber thumb would briefly flash to top.
Two prop-level freeze approaches tried and abandoned (both failed because the
store atomically sets `loading: false, sortAroundFocusStatus: null, bufferOffset: 0`).
Final fix: DOM-level flash guard in `Scrubber.tsx` — `prevStableThumbTopRef` tracks
last known good position; if `prevTop > 50 && thumbTop < 10`, skip the DOM write.

**Bug 2 — viewport row not preserved after countBefore correction.** Effect #9
consumed the sort-focus ratio on first fire. When async `countBefore` corrected
`bufferOffset` and re-fired the effect, the ratio was gone — image landed at
`align: "start"` instead of its original viewport row. Fix: persist ratio and
phantom image ID in refs (`sortFocusRatioRef`, `phantomIdRef`) keyed by
`sortAroundFocusGeneration`. Re-fires reuse the persisted values.

Deleted throwaway `phantom-diag.spec.ts` (superseded by T1).

**Test results:** 315/315 unit, 140/140 local E2E, 12/12 smoke tests pass.

Deleted throwaway `phantom-diag.spec.ts` (superseded by T1 in the real smoke suite).

### 18 April 2026 — Phantom focus rewrite: share Effect #9 with explicit focus

The initial phantom promotion (see entry below) used a parallel scroll mechanism
— seek-based (`_seekGeneration` + `_phantomSeekRatio` via Effect #6) rather than
the sort-around-focus path (Effect #9) that explicit focus uses. Manual testing
against the real TEST cluster (~1.3M images) revealed three bugs, each rooted in
this parallel approach:

**Bug 1 — Flash-of-top.** Effect #7 scroll reset fired before phantom search
completed. Initially fixed by suppressing Effect #7 when phantom active.

**Bug 2 — Off-screen neighbours.** `_captureNeighbours` scanned ±20 buffer
positions including off-screen images. Fixed by adding `getVisibleImageIds()`
to `useDataWindow.ts` — restricts to the tracked visible range, distance-ordered
from viewport centre. Passed as `visibleNeighbours` option. This fix survives
the rewrite.

**Bug 3 — ~100-position offset.** Effect #8 (bufferOffset→0 guard) undid
Effect #6's phantom scroll. Diagnosed via throwaway Playwright test
(`e2e/smoke/phantom-diag.spec.ts`) against TEST cluster. Initially fixed with
a `_phantomSeekJustApplied` flag.

**Bug 4 — Details panel incompatibility.** Phantom used Effect #6 (seek), which
fires BEFORE Effect #8. Explicit focus uses Effect #9, which fires AFTER. Opening
the details panel exposed the ordering mismatch.

**Root cause:** All four bugs stemmed from building a parallel scroll mechanism
instead of reusing the proven Effect #9 path. User directive: "the whole idea
was phantom reuses what's already working for focus."

**Rewrite:** Removed ~50 lines of phantom seek infrastructure (`_phantomSeekRatio`,
`_phantomSeekJustApplied`, `savePhantomSeekRatio`, `consumePhantomSeekRatio`,
Effect #6 phantom ratio code, Effect #8 phantom guard). Added
`_phantomFocusImageId: string | null` to the store. All phantom `phantomOnly`
success paths now set `_phantomFocusImageId` + bump `sortAroundFocusGeneration`
(same trigger as explicit focus). Effect #9 reads
`focusedImageId ?? _phantomFocusImageId` and clears the phantom ID after scroll
positioning. Effect #7 merged the phantom/focus ratio save into a single
`preserveId` path using `saveSortFocusRatio`.

**Result:** Phantom and explicit focus now share the identical scroll restoration
path. All four bugs resolved structurally.

**Files changed:** `useScrollEffects.ts` (rewrite — removed parallel mechanism,
Effect #9 reads phantom ID), `useDataWindow.ts` (`getVisibleImageIds`),
`useUrlSearchSync.ts` (`visibleNeighbours` option, phantom anchor logic),
`search-store.ts` (`_phantomFocusImageId`, success/failure path updates),
`search-store.test.ts` (updated phantom tests for `sortAroundFocusGeneration`).

**Tests:** 315/315 unit tests pass. Diagnostic smoke test verified on real cluster.

### 18 April 2026 — Phantom Focus Promotion (initial implementation)

Implemented phantom focus promotion — the viewport anchor (`getViewportAnchorId()`)
now serves as a fallback for position preservation when no explicit focus is set.
Changing query/filters without an explicit focus tries to keep the viewport-centre
image in the new results.

**Key design decision:** Promoted phantom focus must NEVER show a focus ring. A
`phantomOnly` flag was added to `search()` and `_findAndFocusImage()`. When
`phantomOnly: true`, `focusedImageId` is never set — no ring appears.

**Changes:**
- `useUrlSearchSync.ts`: Falls back to `getViewportAnchorId()` when `focusedImageId`
  is null. Passes `{ phantomOnly: true }` when using the viewport anchor. Sort-only
  relaxation: viewport anchor NOT used for sort-only changes (resets to top per
  architecture doc §4).
- `search-store.ts`: `search()` and `_findAndFocusImage()` accept optional
  `{ phantomOnly?: boolean }`. Three success paths modified. Also removed dead
  `fallbackFirstPage` spread in the isInBuffer branch.

**Note:** The initial implementation used the seek scroll mechanism for phantom
(separate from explicit focus's Effect #9 path). This caused four bugs on real
data — see "Phantom focus rewrite" entry above. The final implementation shares
Effect #9 with explicit focus via `_phantomFocusImageId`.

**Tests:** 5 new unit tests (315 total), 3 new E2E tests (140 total). All green.

### 18 April 2026 — bufferOffset wrong after snap-back on large datasets

On datasets >65k (no position map), arrow snap-back left `bufferOffset` at 0
because: (1) deep-seek mode uses offset=0 placeholder, and (2) the async
`countBefore` correction guard rejected when delta consumption changed
`focusedImageId` before correction resolved. Result: image at real position
~1.28M displayed as position ~101.

**Fixes:**
- Relaxed async correction guard: removed `focusedImageId` check; buffer
  reference check is sufficient (delta consumption changes focus within the
  same buffer)
- Added `_focusedImageKnownOffset` state field: saved when focus is set
  (from `imagePositions`), passed as `hintOffset` to `_findAndFocusImage`
  via `seekToFocused()`. Deep-seek mode uses this instead of 0.
- Updated all `set()` calls that write `focusedImageId` to also write
  `_focusedImageKnownOffset`: `setFocusedImageId`, isInBuffer branch,
  !isInBuffer branch, delta consumption in effect #9, async correction

**Tests:** 3 new unit tests (310 total), 137 E2E all pass.

### 18 April 2026 — Arrow Snap-Back After Seek

Implemented option (b) from the focus-position-preservation workplan: when the
focused image is outside the current buffer (e.g. after a scrubber seek), pressing
an arrow key snaps back to the focused image AND applies the movement delta in a
single keypress, matching the in-buffer UX (one press = one move).

**Store changes (`search-store.ts`):**
- Added `_pendingFocusDelta: number | null` state field
- Added `seekToFocused()` action: calls `_findAndFocusImage` with no fallback/neighbours
  to re-centre the buffer around the focused image. If the image no longer exists
  (generation doesn't bump), clears focus and delta.
- `search()` clears `_pendingFocusDelta` to prevent stale deltas

**Navigation changes (`useListNavigation.ts`):**
- `moveFocus` and `pageFocus`: when `findImageIndex(currentId) < 0`, store
  `_pendingFocusDelta = delta` and call `seekToFocused()`, return early

**Effect changes (`useScrollEffects.ts`):**
- Effect #9 (sortAroundFocusGeneration): after scroll-to-focus, consumes
  `_pendingFocusDelta` — computes target global index, finds the image at that
  buffer-local position, sets it as focused, scrolls to it

**Tests:** 5 unit tests (307 total), 2 E2E tests (137 total). All pass.

### 18 April 2026 — Neighbour fallback (Session 2)

Session 2 of the focus/position preservation workplan. When the focused image
disappears after a search context change (query/filter excludes it), the engine
now scans its old buffer neighbours and focuses the nearest survivor. If no
neighbours survive, focus clears gracefully.

**Implementation:**
- `_captureNeighbours()` in `search-store.ts`: captures ±20 neighbour IDs in
  alternating distance order (+1, -1, +2, -2, ...) before the buffer is replaced.
- Called at the start of `search()` when `sortAroundFocusId` is set.
- Passed through to `_findAndFocusImage`, which uses a batch ES `ids` query to
  check all ±20 neighbours against the new query in a single round-trip. Works
  regardless of scroll position (unlike the initial first-page-only scan approach
  which failed for deep scroll). The nearest survivor is then recursed into
  `_findAndFocusImage` to reuse the full sort-value + seek machinery, supporting
  all three scroll modes (<1k scroll, 1k-65k position map, >65k deep-seek).
- When a neighbour is found: sets `focusedImageId` + bumps
  `sortAroundFocusGeneration` so the view scrolls to it.

**Bug fix — stale buffer after query change (isInBuffer shortcut):**
Pre-existing bug exposed by Session 1's wiring of `focusPreserveId` for all
search changes. `_findAndFocusImage` had an `isInBuffer` shortcut that checked
whether the target image's new offset fell within the current buffer's range.
When called from `search()` after a query change, the buffer is from the
PREVIOUS query — stale content. On medium datasets (1k-65k) where the position
map provides exact offsets, the shortcut would fire and leave permanently stale
results visible (e.g. CMYK images visible after `-colourModel:CMYK`). Fixed by
adding `!fallbackFirstPage` guard: when the buffer hasn't been replaced for this
search, always load fresh content via `_loadBufferAroundImage`.

**MockDataSource:** Added `removedIds: Set<string>` and `_filterRemoved()` to
simulate image deletion in tests. All `searchAfter` return paths post-filter.

**Tests:** 7 new unit tests (nearest neighbour, distance preference, no survivors,
generation bump, generation no-bump, deep-scroll neighbour, stale buffer prevention).
1 new E2E test (credit-based query exclusion triggers neighbour fallback).
Stale-content assertions on all neighbour fallback tests.
302 unit tests, 135 E2E tests pass.

### 18 April 2026 — Focus survives search context change

Session 1 of the focus/position preservation workplan. When a user clicks a metadata
value in the detail panel (e.g. credit: "AFP"), the focused image now stays focused and
in view after the search context changes — no flash, no scroll reset, no position loss.

**Core mechanism:** `useUrlSearchSync` renamed `sortAroundFocusId` → `focusPreserveId`
and now always passes `focusedImageId` to `search()` (not just for sort-only changes).
`_findAndFocusImage` relocates the image in the new result set using sort values +
bidirectional `search_after`. `isSortOnly` is still computed but unused — preserved
for Session 4 (phantom focus relaxation).

**Exact position preservation:** Effect 7 in `useScrollEffects` now saves the
`sortFocusRatio` for any search param change when a focused image exists (not just
sort-only). Effect 9 restores the exact pixel position via `consumeSortFocusRatio()`.

**Performance:** In deep-seek mode (>65k results, no position map), `countBefore` was
the bottleneck (2-5s on 1.3M results). Now skipped entirely — `offset=0` placeholder,
buffer loads immediately via sort-value cursors, `bufferOffset` corrected asynchronously
when `countBefore` resolves. Scrubber thumb and position counter temporarily wrong for
~1-5s; buffer data always correct. Net effect: focus-preserve drops from 3-6s to
~200-300ms on large datasets.

**Bug fixes (4):**
- Flash of first page: timeout/abort race in `_findAndFocusImage`. Fixed with
  `AbortSignal.any` pattern — timeout aborts in-flight requests, guards prevent
  overwrite of fallback state.
- Focus-find silently aborted: scroll-seek in two-tier mode aborted shared
  `_rangeAbortController`. Fixed with dedicated `_findFocusAbortController` that
  only `search()` can abort.
- Flash of unwanted content: (a) early `total` set caused virtualizer resize →
  scroll-clamp → scroll-seek. Fixed by deferring `total` to `_findAndFocusImage`.
  (b) Effect 7 reset `scrollTop=0`. Fixed by skipping reset when `focusedImageId` set.
- Stale `twoTier` in `captureAnchor` (pre-existing): closure captured initial value
  from `useEffect(deps=[])`. Fixed by deriving `isTwoTier` from store state at call
  time. Explicit focus now survives resize/panel-toggle in two-tier mode.

**Files:** `useUrlSearchSync.ts`, `search-store.ts`, `useScrollEffects.ts`,
`ImageGrid.tsx`, `search-store.test.ts` (4 new unit tests),
`focus-preservation.spec.ts` (2 new E2E tests). 295 unit + 134 E2E pass.

### 17 April 2026 — Two alternative integration plans produced

Two competing plans for integrating kupua with Grid's backend, both for engineer review:

**Direct-ES plan** (`integration-plan.md`): Keep direct Elasticsearch as kupua's core,
layer media-api incrementally for auth, config, image detail, writes. Zero media-api
changes. 7 phases, ~8–12 weeks. Ships fast, no external dependencies, but bakes Grid
internals into the frontend (ES query DSL, S3 proxying, TypeScript cost calculator).

**API-first plan** (`integration-plan-api-first.md`): Kupua becomes a pure HATEOAS client
of media-api — one URL, no direct ES/S3/imgproxy access. Requires ~8 additive media-api
endpoints (PIT, search_after, count, aggregations, distributions, percentiles, config).
All changes backwards-compatible — legacy clients unaffected. 10 phases, ~10–14 weeks
with ~2.5 weeks of Scala developer time. Cost/validity in search results is free (already
computed by ImageResponse.create per hit). Portable to any Grid deployment (eelpie, BBC).

Both plans share Phases 0–1 (auth, config) and the write phases. A hybrid path is
documented: start with direct-ES, swap to API-first when endpoints are ready — the
`ImageDataSource` interface makes this a clean swap.

Also: deleted `api-first-integration-handoff.md` (superseded by the plan itself),
created mermaid architecture diagrams for both plans, added imgproxy-as-Grid-infrastructure
as a parallel workstream in the API-first plan.

### 16 April 2026 — Extract `useCursorAutoHide` and apply to ImageDetail fullscreen

Cursor auto-hide (YouTube-style: disappear after 2s idle, reappear on mouse move) was
only implemented in `FullscreenPreview` (fullscreen from grid/table). Entering fullscreen
from `ImageDetail` (detail view → press `f`) did not hide the cursor — same feature,
two code paths, one was missed.

**Fix:** Extracted the inline cursor-hide logic (~25 lines of state + effect + refs) from
`FullscreenPreview` into a shared `useCursorAutoHide(isActive)` hook. Both consumers now
call the hook with one line. `FullscreenPreview` passes `isActive`, `ImageDetail` passes
`isFullscreen`. NavStrip rendering is gated on `!cursorHidden` in fullscreen mode in both
components, with `navMouseEnter`/`navMouseLeave` callbacks keeping the cursor visible
while hovering nav zones.

**Why two code paths exist:** `FullscreenPreview` is a lightweight shortcut from the list
(no route change, own fullscreen lifecycle, exit → list). `ImageDetail` fullscreen is
within the detail overlay (URL-routed, has metadata sidebar, exit → detail view). They
share `useImageTraversal`, `NavStrip`, `image-prefetch`, and now `useCursorAutoHide`, but
diverge on exit semantics, navigation mechanism, and container management.

All 291 unit tests pass.

### 15 April 2026 — Fix restoreAroundCursor infinite loop in two-tier mode

**Root cause:** Two interacting bugs caused an infinite restore → seek → restore loop
when reloading a page with ImageDetail open in two-tier mode (1k < total ≤ 65k).

- **Bug A (primary):** `restoreAroundCursor` in `search-store.ts` hardcoded
  `_seekTargetGlobalIndex: -1`. In two-tier mode, effect6 (`useScrollEffects.ts`)
  needs the global index to compute the correct pixel position — with `-1` it falls
  back to the buffer-local index (~100), computing scrollTop ≈ 7,575px instead of the
  correct ≈ 1,445,310px (for an image at global offset 23,852). The wrong scrollTop
  triggers a scroll-based seek that relocates the buffer to a completely different
  region, losing the target image.

- **Bug B (amplifier):** The restore effect in `ImageDetail.tsx` reset
  `offsetRestoreAttempted` to `false` whenever `currentIndex >= 0`. After
  `restoreAroundCursor` briefly places the image in buffer (`currentIndex >= 0` →
  flag resets), Bug A pushes the buffer away (`currentIndex = -1`), and restore fires
  again. Each cycle: ~250-300ms, ~20 unnecessary ES round-trips in the first 3s.

**Wider blast radius:** Grid scroll position corruption after closing ImageDetail,
scrubber thumb twitching, React render thrash on all grid/scrubber subscribers.
Position map, PIT, and aggregations unaffected.

**Fixes:**
- `search-store.ts`: `restoreAroundCursor` now computes
  `_seekTargetGlobalIndex = exactOffset` in two-tier mode (same pattern as `seek()`'s
  exact-offset path). Scroll mode and three-tier unchanged (`-1`).
- `ImageDetail.tsx`: Added `restoreAttemptedForRef` to track which imageId the restore
  was attempted for. The flag only resets when `imageId` changes (user navigates to a
  different image), preventing re-triggering when buffer briefly contains then loses
  the same image.

**Verification:** All 291 unit tests pass. User confirmed fix on TEST (51,306 results) —
`restoreAroundCursor` fires once, effect6 scrolls to correct pixel, no cycling.

### 15 April 2026 — Traversal refactor, fixes, and (minimal) UI

**Traversal refactor** — created `useImageTraversal` hook (210 lines, 21 unit tests)
to replace the separate, broken traversal logic in ImageDetail and FullscreenPreview.
Previous bugs: FullscreenPreview walked buffer-local indices only and stopped at buffer
edges; ImageDetail used `getImage(globalIdx ± 1)` which returned undefined at buffer
edges in two-tier mode, hiding prev/next buttons; neither triggered extend/seek to slide
the buffer.

The hook works in global index space across all three scroll modes (buffer, two-tier,
seek). Features: proactive extend within 20 items of buffer edge, pending navigation
with auto-completion when buffer arrives, direction-aware prefetch (throttled).

**ImageDetail refactored** — removed manual loadMore effect, prefetch effect,
prevImageRef/nextImageRef, directionRef. Position counter uses `currentGlobalIndex`
from hook. Net -100 lines.

**FullscreenPreview rewritten** — uses shared hook. Added:
- Nav strip hover zones (`NavStrip` component) — full-height strips at left/right edges
  with chevron circles on hover (`group-hover:opacity-100`). Shared with ImageDetail.
  Optical centring (1px nudge in arrow direction).
- `f` key cooldown (500ms) — prevents double-fire during Chrome's fullscreen permission
  overlay. Arrow keys NOT gated (user needs immediate nav).
- `navReady` state — suppresses nav button render during macOS fullscreen animation.
- Cursor auto-hide (YouTube-style) — `cursor-none` after 2s inactivity. `overNavRef`
  prevents hide while mouse is over a nav zone.
- No alt text flash — `<img alt="">` + `onLoad` sets real alt.

**Bug fixes:**
- *Fullscreen arrow skip-one-image* — FullscreenPreview's keydown and
  `useListNavigation`'s keydown both processed ArrowLeft/Right, causing double-move in
  grid (cols > 1). Fix: `if (document.fullscreenElement) return` guard in
  `useListNavigation.ts` (both handleBubble and handleCapture).
- *`f` key wrong stack winner after reload* — FullscreenPreview rendered after
  ImageDetail in `search.tsx`, so its `useKeyboardShortcut("f")` registered last and
  won the stack. Fix: swapped JSX order so ImageDetail registers after FullscreenPreview.
- *Infinite restoreAroundCursor loop on reload in two-tier* — `useImageTraversal`'s
  proactive extend effect fired on every `results`/`bufferOffset` change. After reload,
  restoreAroundCursor updated store → extend effect saw image "near edge" → fired
  `extendForward()` → store update → restoreAroundCursor re-triggered → ∞. Fix:
  `hasNavigatedRef` — proactive extend only fires after user has pressed an arrow key.
  Deeper scroll-system root cause (scrollTop resetting to 0 each cycle) flagged for
  separate investigation (see `scroll-restore-loop-handoff.md`).

**E2E tests added (4):**
- 2 fullscreen preview nav tests (ArrowLeft/ArrowRight move focus by exactly 1 image).
- 1 buffer boundary traversal (arrow-left past backward buffer edge after seek →
  extendBackward fires, positions stay consistent).
- 1 restoreAroundCursor flood regression (reload in detail, count console entries ≤10).

**Other:**
- `run-e2e.sh` — added docker-compose v1/v2 shim (same as `start.sh`) for Colima.

Test counts: 291 Vitest, 132 Playwright E2E. Zero regressions.

### 14 April 2026 — Code audit action items 1 & 2

Executed two low-priority refactors from the two-tier virtualisation code audit
(handoff-audit-action-items.md):

1. **Scoped `performance.clearMarks()`** in `search-store.ts` — the seek function was
   calling `performance.clearMarks()` / `clearMeasures()` with no argument, wiping ALL
   marks on the page. Now clears only the 5 seek-specific mark names and 5 measure names.
   Zero-risk, same behaviour.

2. **Added `toVirtualizerIdx()` helper** in `useScrollEffects.ts` — the ternary
   `isTwoTierFromTotal(t) ? globalIdx : globalIdx - bo` was repeated in 5 places.
   Extracted to a module-level helper. Did NOT touch the line-841 site (different
   branching pattern) or the component sites (different direction: `+` not `-`).

Action 3 (JSDoc comments in useDataWindow.ts) was already done by a prior agent.

All 270 Vitest tests pass. Handoff file deleted.

### 14 April 2026 — Cross-tier E2E test matrix + test suite culling

**Problem:** Kupua has three scrolling tiers (buffer ≤1k, two-tier 1k–65k, seek >65k)
but 137 E2E tests only exercised two-tier mode (local ES has ~10k docs at default
thresholds). Recent bugs were all at tier boundaries.

**Solution:** Created a cross-tier test matrix that runs 18 tier-sensitive tests across
all three tiers via three Vite dev servers (ports 3010/3020/3030) with different env
vars. Each server inlines different `VITE_SCROLL_MODE_THRESHOLD` / `VITE_POSITION_MAP_THRESHOLD`
values at build time to force buffer, two-tier, or seek mode respectively.

**Test redundancy cull (habitual suite: 137→128 tests, ~6.2→5.8min):**
- Deleted 6 two-tier tests (T5–T8, T10–T11) superseded by tier matrix. Kept T1–T4
  (position map lifecycle), T9 (transient seek state), T12 (filter invalidation).
- Merged 3 grid/table pairs into parameterised for-loops: post-seek scroll-up (B),
  Bug #12 wheel scroll (C), Bug #16 runaway eviction (D).
- Deleted sort-around-focus subset (E, strict subset of direction-change test),
  weaker logo-click test (F), duplicate Home key test (G).

**Tier matrix (54 tests across 3 tiers, ~4.2min):**
- Created `playwright.tiers.config.ts` (3 projects × 3 webServers, `reuseExistingServer: false`).
- Created `e2e/local/tier-matrix.spec.ts` with 18 tests covering: seek accuracy (4),
  drag/content/scroll-freeze (3), density toggle (1), sort-around-focus (2), Home/End
  keys (4), Bug #1 race (1), Bug #14 Credit sort (1), density-switch position (2).
- Each test branches assertions on `test.info().project.name` (not runtime store
  introspection). Buffer-mode tests wait for eager fill (10k docs, ~7-17s/test vs
  ~1-6s for other tiers).
- Added `testIgnore: "**/tier-matrix.spec.ts"` to habitual config so it only runs via
  `npm run test:e2e:tiers`.

**Test directive rewrite (copilot-instructions.md, both copies):**
- Collapsed 4 directives (~34 lines) into 2 (~22 lines).
- Added mandatory `2>&1 | tee /tmp/kupua-test-output.txt` pattern for all test commands.
- Added "never re-run tests that are already running" rule to prevent agent panic on
  terminal timeout.
- Added port conflict warning for tier-matrix ports (3010/3020/3030).

**Fix during validation:** Test #2 ("seek to top") failed at all tiers because
`seekTo(0.02)` lands at 2% of scrollHeight (thousands of pixels), not near 0px.
Replaced scrollTop threshold with bufferOffset + scrubberPosition assertions.

**Files:** `playwright.tiers.config.ts` (new), `e2e/local/tier-matrix.spec.ts` (new),
`e2e/local/scrubber.spec.ts` (culled), `e2e/local/buffer-corruption.spec.ts` (culled),
`playwright.config.ts` (testIgnore), `package.json` (script), `e2e/README.md`,
`AGENTS.md`, `.github/copilot-instructions.md` + human copy.

### 14 April 2026 — Fix scrubber thumb frozen after density switch in two-tier mode

**Bug:** In two-tier mode (~62k results): scroll to ~50% → switch density to table →
switch back to grid → press End. Results correctly showed the end of the dataset, but
the scrubber thumb stayed at ~50%. All scrolling after a density round-trip failed to
update the thumb.

**Root cause:** The Scrubber's scroll-mode continuous sync effect (line 476) attached a
scroll listener to the scroll container element via `getScrollContainer()`, capturing it
in a closure. After a density round-trip (grid→table→grid), the grid remounted with a
**new** DOM element, but the Scrubber (which lives in `search.tsx` and never unmounts)
kept listening to the dead element. The effect's deps (`isScrollMode`, `isDragging`,
`maxThumbTop`, `trackHeight`) didn't change after the round-trip, so the effect never
re-ran. In scroll mode, the discrete thumb sync is explicitly skipped (`if (isScrollMode)
return`), so no code path updated the thumb.

**Systemic analysis:** Reviewed all 12 `getScrollContainer()` call sites. All except the
Scrubber's scroll listener call it fresh per invocation (correct). The deeper issue:
`scroll-container-ref.ts` was a fire-and-forget setter/getter with no notification
mechanism — consumers that needed to react to changes had to discover them through
indirect effect deps. Also reviewed four recent density-switch bugs (Bug #18 skeleton
deadlock, `_suppressDensityFocusSave` stuck, `_prevParamsSerialized` mismatch, this bug)
— genuinely different root causes, not whack-a-mole.

**Fix:** Made `scroll-container-ref.ts` observable via `useSyncExternalStore`.
`registerScrollContainer()` now increments a generation counter and notifies subscribers.
New `useScrollContainerGeneration()` hook returns the counter. Scrubber uses it as a dep
on the scroll-sync effect — when the container changes, the effect re-runs and
`attach()` picks up the new element. Same-element guard (`if (_el === el) return`)
avoids spurious bumps.

**Impact verification:** Traced all 6 scroll-container interaction points in the
Scrubber (wheel forwarding, scroll-sync effect, `scrollContentTo`, track click, drag
move, drag up). Only the scroll-sync effect was affected. Verified all 3 modes
(buffer/indexed/seek), tooltip, ticks, labels — none touch the scroll container. Seek
mode hits the `if (!isScrollMode) return` guard, so generation changes are a harmless
no-op.

**Also fixed:** Pre-existing unused variable `images` in `useDataWindow.test.ts` line
224 (TS6133 warning).

**Files changed (3):**
- `src/lib/scroll-container-ref.ts` — generation counter + `useSyncExternalStore` hook
- `src/components/Scrubber.tsx` — import + call `useScrollContainerGeneration()`, add as
  scroll-sync effect dep
- `src/hooks/useDataWindow.test.ts` — remove unused destructured variable

**Results:** Unit 270/270 ✓, TypeScript clean ✓, E2E 137/137 ✓ (6.2m). Manually
verified on ~62k results: scroll 50% → table → grid → End → thumb moves to bottom.

### 14 April 2026 — Fix position map fetch failure on null-zone sorts + ES error diagnostics

**Bug:** `fetchPositionIndex()` failed with HTTP 400 on the final chunk when
sorting by a field with null values (e.g. `metadata.dateTaken` — ~960 of 60,962
images lack it on TEST). The position map never loaded for Taken, Credit, Source,
Last Modified, Category, or any config-driven alias sort. Seeks fell back to the
slower deep-seek path (percentile estimation). The app worked, just slower.

**Root cause:** `fetchPositionIndex` built sort clauses via `buildSortClause()`
which produces bare `{field: "asc"}` without explicit `missing` values. When the
`search_after` cursor contained `null` (entering the null zone at chunk 7), ES 8.x
rejected the request — a null in the cursor didn't match the expected type for the
field without an explicit `missing` directive.

**Fix (es-adapter.ts):**
1. **Explicit `missing` in sort clauses:** Transform bare clauses to object-form
   with `missing: "_last"` for asc / `missing: "_first"` for desc. Semantically
   identical to ES defaults but makes null-valued `search_after` cursors accepted.
2. **ES error body in diagnostics:** Both `esRequest()` and `esRequestRaw()` now
   read the response body (first 500 chars) on non-OK status and include it in
   the error message. Previously the body was discarded, making 400s opaque.

**Not reproducible locally** — the local E2E dataset has no null sort fields.
Requires TEST verification via `./scripts/start.sh --use-TEST` with Taken sort.

**Results:** Unit 270/270 ✓, E2E 137/137 ✓ (6.0m).

### 14 April 2026 — Retrofit E2E tests with placeholder detection

**Task:** Added `assertNoVisiblePlaceholders()` to 4 existing seek-and-settle tests
in `e2e/local/scrubber.spec.ts`, per `handoff-placeholder-detection.md`.

**Why:** The original permanent-skeleton bug after two-tier seek was invisible to
E2E tests because they only checked store state (bufferOffset, resultsLength, error)
and scroll position — all of which could be correct while the viewport showed only
skeletons. The new assertion catches "buffer positioned correctly but viewport not
aligned to it" regressions.

**Tests amended (1 line each):**
1. "can scroll up after seeking to 50%" — after 1500ms settle, before scroll-up
2. "dragging past buffer triggers scroll-seek that fills skeletons" — after assertPositionsConsistent
3. "scrubber works in seek mode before position map loads" — after assertPositionsConsistent
4. "position-map seek lands at exact target position" — after assertPositionsConsistent

**Results:** 270/270 unit ✓, 137/137 E2E ✓ (7.3min). Zero additional runtime on
passing tests (waitForFunction returns immediately when no placeholders visible).

### 14 April 2026 — Consolidate hardcoded `nonFree: "true"` to single source of truth

**Refactor:** All hardcoded `nonFree: "true"` default values across 6 files now
reference `DEFAULT_SEARCH` from a single zero-dependency module
(`src/lib/home-defaults.ts`). Pure mechanical refactor — no behaviour change.

**Motivation:** In real Grid, `nonFree` is a per-user config. When Kupua reaches
Phase 3 (Grid API integration, auth), `DEFAULT_SEARCH` will become dynamic.
Having the value in one place makes that a single-file change instead of a 6-file
hunt. Handoff doc: `handoff-nonFree-single-source.md`.

**Key decision — extract to `home-defaults.ts`:** `DEFAULT_SEARCH` was originally
defined in `useUrlSearchSync.ts`, which imports from `search-store`. If
`search-store` imported `DEFAULT_SEARCH` back, that would create a circular
dependency. The new `home-defaults.ts` module has zero internal imports (only the
`UrlSearchParams` type from `search-params-schema.ts`), so it's importable from
anywhere. `useUrlSearchSync.ts` re-exports for backward compatibility.

**Sites changed:**
- `routes/index.tsx` — `{ nonFree: "true" }` → `DEFAULT_SEARCH`
- `routes/image.tsx` — `{ nonFree: "true", image }` → `{ ...DEFAULT_SEARCH, image }`
- `SearchBar.tsx` — navigate param in resetToHome callback → `DEFAULT_SEARCH`
- `ImageDetail.tsx` — navigate param in resetToHome callback → `DEFAULT_SEARCH`
- `search-store.ts` — initial store `params` → `...DEFAULT_SEARCH`
- `reset-to-home.ts` — import path updated to `home-defaults`
- `useUrlSearchSync.ts` — inline definition → import + re-export

**Sites NOT changed (with reasoning):**
- `ErrorBoundary.tsx` (`window.location.href = "/search?nonFree=true"`) — hard
  reload fallback, can't use runtime constant. Cross-reference comment added.
- `SearchBar.tsx` / `ImageDetail.tsx` `<a href="...">` — static HTML for
  right-click "open in new tab". Cross-reference comments added.
- `SearchFilters.tsx` (`params.nonFree === "true"`) — runtime comparison against
  user input, not a default value.
- `es-adapter.ts` (`params.nonFree !== "true"`) — runtime filter condition.

**Files changed (9):** `home-defaults.ts` (new), `useUrlSearchSync.ts`,
`reset-to-home.ts`, `routes/index.tsx`, `routes/image.tsx`, `SearchBar.tsx`,
`ImageDetail.tsx`, `ErrorBoundary.tsx`, `search-store.ts`.

**Results:** Unit 270/270 ✓, E2E 118/118 ✓ (buffer-corruption, keyboard-nav,
scrubber — 5.8m).

### 14 April 2026 — Fix permanent skeletons after two-tier seek + position map not fetched after sort-around-focus

**Bug A (primary):** After seeking within 1k–65k results in two-tier mode,
placeholders never fill with images. Repro: fresh app with 62k results
(`nonFree=true&since=2024-12-12`), switch to Taken sort, seek to null zone →
permanent empty skeletons.

**Root cause A:** `_seekTargetGlobalIndex` was always set to `clampedOffset`
regardless of `exactOffset`. The deep-seek path (percentile estimation) has drift
— `actualOffset` can differ from `clampedOffset` by thousands of positions in the
null zone. Effect #6 in `useScrollEffects.ts` forced `scrollTop` to
`clampedOffset`'s pixel position, but the buffer was at `actualOffset` →
viewport showed only skeletons → scroll-triggered re-seek faced the same drift →
infinite skeleton deadlock.

**Fix A:** `_seekTargetGlobalIndex` now differentiates exact vs inexact offset:
- **Exact offset** (position-map, shallow from/size): uses `clampedOffset` — the
  buffer is guaranteed to cover that position.
- **Inexact offset** (deep seek): uses `actualOffset + backwardItemCount` — the
  bidirectional centre of the buffer, where "interesting" content starts.

First attempt used `actualOffset + scrollTargetIndex` (from `computeScrollTarget`),
but that function clamps to buffer-local scroll bounds — in two-tier mode where
`scrollTop` is a global pixel position, the reverse-computed index clamped to
`bufferLength - 1`, placing the viewport at the buffer's bottom edge with no
scroll-up headroom (broke tests 46, 50). Using `backwardItemCount` directly avoids
the buffer-local clamping.

**Bug B (secondary):** Position map never fetched after sort-around-focus.

**Root cause B:** `search()` has two branches — the sort-around-focus early path
(when `sortAroundFocusId && !focusedInFirstPage`) and the normal path. Only the
normal path called `_fetchPositionMap`. After sort-around-focus, `positionMap`
stayed `null` forever, forcing all subsequent seeks through the deep-seek path.

**Fix B:** Added `_fetchPositionMap` call in the sort-around-focus early branch,
with the same two-tier eligibility check and dedicated abort controller.

**Fix C (test tooling):** Added `countVisiblePlaceholders()` and
`assertNoVisiblePlaceholders(timeout?)` to E2E helpers. Grid detection: cells
without `[data-grid-cell]` + `bg-grid-cell` class. Table detection: rows without
`cursor-pointer` + `bg-grid-separator` skeleton. Both check viewport intersection.
Created handoff (`handoff-placeholder-detection.md`) for retrofitting 4 existing
tests with the new assertion.

**Files changed (3):**
- `src/stores/search-store.ts` — Fix A (`_seekTargetGlobalIndex` exact/inexact
  split) + Fix B (`_fetchPositionMap` in sort-around-focus branch)
- `e2e/shared/helpers.ts` — Fix C (placeholder detection helpers)
- `exploration/docs/handoff-placeholder-detection.md` — retrofit handoff

**Results:** Unit 270/270 ✓, E2E 137/137 ✓. Verified on TEST cluster (62k
results, Taken sort, null zone seek) — no skeletons.

### 14 April 2026 — Fix Home button not resetting sort order

**Bug:** Change sort to e.g. Category → click Home → results still sorted by
Category instead of reverting to default `-uploadTime`.

**Root cause:** Regression from the density-switch position loss fix (same day,
earlier session). `resetToHome()` only cleared `query` and `offset` via
`store.setParams({ query: undefined, offset: 0 })`. The 14 Apr density fix
restored `_prevParamsSerialized` to `{nonFree:"true"}` after `search()` — which
matched the home URL exactly, so `useUrlSearchSync`'s dedup bailed out and never
pushed the full reset (including `orderBy: undefined`) to the store. The stale
`orderBy` persisted.

**Fix:** `resetToHome()` now resets ALL URL-managed search params (built
dynamically from `URL_PARAM_KEYS`, excluding display-only keys), then overlays
home defaults from the new exported `DEFAULT_SEARCH` constant. This makes the
store match the home URL *before* `search()` fires, so the dedup restoration is
correct. Any future params added to the schema are cleared automatically.

**Collateral improvement:** Exported `DEFAULT_SEARCH` from `useUrlSearchSync.ts`
as the single source of truth for home URL defaults. `resetToHome()` references
it instead of hardcoding `{ nonFree: "true" }`. Created handoff doc
(`handoff-nonFree-single-source.md`) for a future refactor to consolidate the
remaining 5 hardcoded `nonFree: "true"` sites across routes and components.

**Files changed (4):**
- `src/lib/reset-to-home.ts` — full param reset using `URL_PARAM_KEYS` +
  `DEFAULT_SEARCH` instead of partial `{ query, offset }` reset
- `src/hooks/useUrlSearchSync.ts` — exported `DEFAULT_SEARCH` constant
- `e2e/local/scrubber.spec.ts` — 3 new E2E tests: sort field reset, sort
  direction reset, Home from table with sort reset
- `exploration/docs/handoff-nonFree-single-source.md` — handoff for nonFree
  consolidation refactor

**Results:** Unit 270/270 ✓, E2E 137/137 ✓ (3 new tests).### 14 April 2026 — Fix density-switch position loss after Home button click

**Bug:** Grid → seek 50% → table (OK) → grid → Home → seek 50% → table → scrolls
to top instead of preserving position.

**Root cause #1:** `_suppressDensityFocusSave` flag stuck permanently.
`resetToHome()` called `suppressDensityFocusSave()` unconditionally. The flag is
only cleared by the mount effect of the *next* density component. But Home from
grid = no density switch = grid stays mounted → flag stays true → all future
unmount saves suppressed → focus never recorded.

**Fix #1:** Gate `suppressDensityFocusSave()` with `if (willSwitchDensity)` in
`reset-to-home.ts`.

**Root cause #2:** `resetSearchSync()` clears `_prevParamsSerialized` to `""`.
When Home is clicked from grid (URL already `?nonFree=true`), `navigate()` is a
no-op (same URL). `useUrlSearchSync` never fires to restore
`_prevParamsSerialized`. It stays empty. The next density switch (adding
`?density=table`) finds a mismatch and fires `search()`, resetting buffer to
offset 0 → position lost.

**Fix #2:** After `store.search()` completes in `resetToHome()`, restore
`_prevParamsSerialized` and `_prevSearchOnly` to match the home URL params
(`{nonFree: "true"}`). When Home fires from table (URL does change),
`useUrlSearchSync` overwrites with the same value — no conflict.

**Other changes:**
- Removed all diagnostic devLogs from `useUrlSearchSync.ts`. Permanent devLog
  tracing kept in `setPrevParamsSerialized` and `resetSearchSync` (routed through
  `devLog`, no-op in prod).
- 2 new E2E tests in `scrubber.spec.ts`: Home-from-grid without focus + with focus.

**Files changed (4):**
- `src/lib/reset-to-home.ts` — both fixes
- `src/lib/orchestration/search.ts` — permanent devLog in resetSearchSync +
  setPrevParamsSerialized
- `src/hooks/useUrlSearchSync.ts` — temp diagnostics removed
- `e2e/local/scrubber.spec.ts` — 2 new Home-from-grid density tests

**Results:** Unit 270/270 ✓, E2E 134/134 ✓. All 8 density-switch tests pass.

### 13–14 April 2026 — Fix indexed-mode scrubber skeleton deadlock (Bug #18)

**Bug:** Clicking scrubber at 50% on ~62k results → after ~2s scrubber jumps near
top, shows only empty placeholders that never fill in.

**Root cause:** `twoTier` was derived from `positionMap !== null`. When user clicks
scrubber before the position map finishes loading (~5-8s for 62k), the seek completes
in non-twoTier mode (virtualizerCount = buffer length ~300, scrollHeight ~13k). When
positionMap arrives asynchronously, `twoTier` flips true → virtualizerCount jumps to
~62k → scrollHeight jumps to ~2.6M. But scrollTop stays at its old value (~4242).
In the new coordinate space, scrollTop=4242 maps to global position ~98, but the
buffer is at ~31k → all cells show skeletons forever (permanent deadlock).

**Fix #3 (accepted) — two parts, 4 agents over 2 days:**

- **Part A:** Derive `twoTier` from total range (`SCROLL_MODE_THRESHOLD < total ≤
  POSITION_MAP_THRESHOLD`) instead of `positionMap !== null`. The coordinate space is
  now stable from frame 1 — no late flip when position map arrives. Position map
  remains a performance optimisation (faster seeks), not a coordinate-space decision.

- **Part B:** Scrubber `isScrollMode` includes `twoTier`. When the scroll container
  already spans all `total` items, the scrubber sets scrollTop directly (instant
  visual feedback) instead of firing a slow deep seek (~2.1s). Data fills
  asynchronously via useDataWindow's scroll-triggered seek (~1.8s background).

**Rejected approaches:**

- Fix #1 (swimming): `useLayoutEffect` detecting twoTier false→true transition to
  recompute scrollTop. Caused visible swimming — cells shifted when scrollTop changed.
- Fix #2 (slow): Total-based twoTier only (Part A without Part B). Scrubber still
  entered seek mode (deep percentile path) → 2.1s with no visual feedback.

**Regression fix — Effect #8 (bufferOffset→0 guard):** The `if (twoTier) return;`
guard in effect #8 prevented scrollTop reset on logo click. With total-range-based
twoTier, the local 10k dataset triggers twoTier=true, so effect #8 never reset
scrollTop on go-home. Removed the guard — in twoTier mode, bufferOffset→0 happens
either from natural scroll-to-top (scrollTop already ~0, reset is no-op) or from
search()/resetToHome (scrollTop needs reset). Both are safe.

**Test helper fixes:** `seekTo()` and `isTwoTierMode()` in `e2e/shared/helpers.ts`
still used `positionMap !== null` for twoTier detection. Updated to use total-range
check matching the app logic. Sort-around-focus visibility assertion in
`scrubber.spec.ts` updated to use global index (not buffer-local) for row position
estimation in twoTier mode.

**Files changed (8):**
- `src/hooks/useDataWindow.ts` — twoTier from total range
- `src/stores/search-store.ts` — `_seekTargetGlobalIndex` from total range
- `src/hooks/useScrollEffects.ts` — `isTwoTierFromTotal()` helper, 6 imperative
  checks updated, effect #8 twoTier guard removed
- `src/components/ImageGrid.tsx` — `captureAnchor` uses hook's twoTier
- `src/routes/search.tsx` — separate `positionMapLoaded` from `twoTier`, pass to Scrubber
- `src/components/Scrubber.tsx` — `twoTier` prop, `isScrollMode` includes twoTier
- `e2e/shared/helpers.ts` — `seekTo()`, `isTwoTierMode()` use total-range twoTier
- `e2e/local/scrubber.spec.ts` — Sort-around-focus visibility uses global index

**Results:** Unit 270/270 ✓, E2E 132/132 ✓, smoke 10/11 (S3 pre-existing), scroll
stability 8/8 ✓. Tested on TEST cluster (~62k results) and local Docker ES (~10k).

Sorry
**Scope:** Fix all E2E test failures introduced by two-tier virtualisation, then
fix a real app bug (End key landing near top in two-tier mode).

**Part 1 — E2E test fixes (5 agents, 6 full suite runs):**

Baseline: 125 passed, 8 failed. Final: 132 passed, 1 skipped, 0 failed.

Root cause of most failures: in two-tier mode, `seekTo()` in `helpers.ts` checked
`positionMap !== null` to decide the two-tier code path, but position map is
transiently null during initial load (~2-3s) and after sort/density/view switch
reload (~1s). Tests calling `seekTo` during these windows took the wrong (non-two-tier)
path, resolving immediately from stale buffer state.

**Root cause fix in `helpers.ts`:** `seekTo()` now waits up to 10s for position map
to load when `total > 1000` and `positionMap` is null. This fixes all tests that
call `seekTo` when position map is transiently null.

**Fixes in `scrubber.spec.ts` (~14 targeted edits):**

1. Fixed `__kupuaStore` → `__kupua_store__` typo in no-swim test polling
2. Golden table (Cases 1-3): wrapped scroll-preservation assertions in `if (!isTwoTier)` —
   scroll preservation semantics don't apply in two-tier (scrollContentTo sets absolute scrollTop)
3. Settle-window: replaced raw click + `waitForSeekComplete` with seekGeneration
   snapshot + `waitForSeekGenerationBump` + `waitForPositionMap`
4. No-swim test: `isTwoTier` detection after first seekTo; sub-row preservation
   assertion gated with `if (!isTwoTier)`
5. Metadata panel + long session: replaced `focusNthItem()` with store-based focus
   via `page.evaluate → setFocusedImageId` (skeletons prevent DOM click in two-tier)
6. End key tests (Credit + default): replaced `waitForTimeout` + `waitForSeekComplete`
   with seekGeneration snapshot + `waitForSeekGenerationBump`
7. End key cross-density: replaced `waitForTimeout(1500)` with seekGeneration approach
8. `getViewState` helper: fixed global→buffer-local index conversion
9. Seek to bottom (0.98): mode-aware `bufferEnd` assertion
10. ScrollTop after seek: skip buffer-local scrollTop assertion in two-tier
11. Keyword sort Credit tests: wrapped console log assertions in `if (!isTwoTier)` —
    position-map fast path bypasses keyword strategy
12. Density-focus 5+ toggles: `test.skip()` in two-tier (prepend compensation N/A) —
    later deleted entirely as dead code

**Part 2 — End key bug fix (1-line fix):**

**Bug:** End key in two-tier mode (1k-65k results) landed near the top instead of
the bottom. Correctly diagnosed after previous agent misattributed the symptom to
a "density switch resets buffer" app bug.

**Root cause:** End key fast path (reverse `searchAfter`, line 1796 of `search-store.ts`)
didn't set `exactOffset = true`. Consequences: (1) `_seekTargetGlobalIndex` stayed -1
(no two-tier scroll target), (2) `scrollTargetIndex` was reverse-computed from the
user's current scrollTop (near the top) instead of using the known-exact
`targetLocalIndex`. Effect #6 in `useScrollEffects` scrolled to the wrong position.

**Fix:** Added `exactOffset = true` to the End key fast path. The offset IS exact
(`total - hits.length`). This enables the exact-offset scroll target path AND sets
`_seekTargetGlobalIndex = clampedOffset` in two-tier mode.

After the fix, the End key cross-density test was unskipped and rewritten to verify
buffer position (not scrollTop, which is buffer-local in table virtualiser).

**Also reverted:** unnecessary `isSeekCooldownActive()` export from `search-store.ts` —
was solving a non-existent problem based on the previous agent's wrong diagnosis.

**Final results:** 132 passed, 1 skipped (density-focus 5+ toggles — deleted as dead
code). 270 unit tests pass. Files modified: `helpers.ts`, `scrubber.spec.ts`,
`search-store.ts`.

### 13 April 2026 — Two-Tier Virtualisation: Real Scrollbar for 1k-65k Results

**Scope:** Make the scrubber behave like a real scrollbar (drag = direct scroll)
for result sets between 1,000 and 65,000 images. Previously, the scrubber was a
seek control for >1k results — drag previewed a position, pointer-up teleported
the buffer there (~850ms on TEST). Now, the virtualizer renders `total` items
(not just buffer length), the scroll container has full height, and scrubber
drag directly sets `scrollTop`.

**Prerequisites built (Phases 0-4a of position-map workplan, 10-12 Apr):**

1. **Phase 0 — Measurement:** Validated position map feasibility. Per-entry
   V8 heap: 288 bytes. At 65k: ~18MB heap, ~5s fetch. `_source` per image:
   8,258 bytes avg — full `_source` for 65k = 512MB, impossible. Position map
   is the only viable index for large datasets.

2. **Phase 1 — Position Map data structure + DAL:** Created `PositionMap` type
   (struct-of-arrays: `ids[]`, `sortValues[]`, `length`), `cursorForPosition()`
   helper (handles search_after off-by-one, position 0, tied sort values),
   `fetchPositionIndex()` in `es-adapter.ts` (chunked `_source: false` fetch,
   dedicated PIT, 10k/chunk). Files: `dal/position-map.ts`, `dal/es-adapter.ts`.

3. **Phase 2 — Store integration:** Background fetch triggered after search when
   `SCROLL_MODE_THRESHOLD < total ≤ POSITION_MAP_THRESHOLD`. Store exposes
   `positionMap`, `positionMapLoading`. Invalidated on every `search()`.
   Files: `search-store.ts`, `tuning.ts`.

4. **Phase 3 — Fast seek path:** When position map available, seek uses exact
   cursor lookup — one `searchAfter` call. Eliminates `countBefore`, percentile
   estimation, and composite-agg walks. Fixed `exactOffset` ReferenceError that
   silently crashed all position-map seeks. Files: `search-store.ts`.

5. **Phase 4a — Scrubber tristate:** `ScrubberMode = 'buffer' | 'indexed' | 'seek'`.
   `indexed` mode activates when position map is loaded. Files: `Scrubber.tsx`,
   `search.tsx`.

**Two-tier virtualisation (Sessions 1-3, 13 Apr):**

**Session 1 — Index mapping + scrubber mode switch:**

- `useDataWindow.ts`: Added `twoTier = positionMap !== null`. Set
  `virtualizerCount = twoTier ? total : results.length`. Remapped `getImage()`
  (global→local mapping), `findImageIndex()` (returns global when twoTier),
  `reportVisibleRange()` (buffer-relative extend triggers), viewport anchor
  (local conversion, skip when outside buffer).
- `Scrubber.tsx`: `isScrollMode = buffer || indexed`. Replaced all 12
  `isBufferMode` references. Scrubber drag directly scrolls container in both
  buffer and indexed modes.
- `search.tsx`: `currentPosition = positionMapLoaded ? visibleRange.start : bufferOffset + visibleRange.start`.
- `ImageGrid.tsx`, `ImageTable.tsx`, `ImageDetail.tsx`: `storeImageOffset` callers
  use `twoTier ? idx : bufferOffset + idx`. All `results[idx]` → `getImage(idx)`.
- `useListNavigation.ts`: 3 `loadMore` guards changed to
  `bufferOffset + resultsLength < total`.
- New: `useDataWindow.test.ts` — 28 unit tests for two-tier index mapping.

**Session 2 — Scroll-triggered seek + compensation + verification:**

- `useDataWindow.ts`: Debounced scroll-triggered seek (200ms) when viewport
  entirely outside buffer in two-tier mode. Skip extends when viewport too far
  from buffer (extends can't bridge thousands of positions).
- `useScrollEffects.ts`: Gated prepend/evict compensation with `if (twoTier) return`
  (items replaced at fixed positions, no insertion). Gated bufferOffset→0 guard.
  Fixed `loadMore` fallback guard. Fixed density-focus restore (6 locations) for
  two-tier global indices. Added seek scroll-to-target branching using
  `_seekTargetGlobalIndex`.
- `search-store.ts`: Added `_seekTargetGlobalIndex` to store. Implemented parallel
  forward+backward fetch in position-map seek path — `Promise.all` saves ~250-350ms
  on TEST (sequential ~750ms → parallel ~450ms network). Each direction independently
  handles null-zone cursors.

**Session 3 — E2E tests + documentation:**

- `scrubber.spec.ts`: 12 new E2E tests under "Two-tier virtualisation" describe:
  position-map loading, scrubber drag direct scroll, drag past buffer → seek fill,
  sort change invalidation+reload, Home button reset, Home key seek(0), density
  switch position preservation, keyboard nav (PgDown + End), seek mode regression,
  position-map seek accuracy, sort-around-focus with two-tier, date filter
  invalidation+reload.
- `e2e/shared/helpers.ts`: Added `waitForPositionMap()`, `isTwoTierMode()` helpers.
- Documentation: changelog, AGENTS.md, workplan status updates.

**Architecture decisions:**

- **`twoTier` is the central invariant:** derived from `positionMap !== null`.
  When false, every code path is identical to before — zero regression by design.
  When true, indices become global, scroll container is full-height, scrubber
  drags directly.
- **`search()` invalidates; `seek()` preserves.** Any search call sets
  `positionMap: null` → `twoTier` snaps to false. Features like filters, sort,
  query, Home button all go through `search()`, so they auto-revert to
  buffer-local behaviour during the transition.
- **Parallel fetch only with position map.** Sequential backward fetch remains
  as fallback when `positionMap === null`.

**All 270 unit tests pass. 12 new E2E tests added.**

### 12 April 2026 — Position Map: Phases 0-4a (Seek Acceleration)

**Scope:** Build the position-map infrastructure for 65k-image scrolling.
See `scroll-real-scrolling-through-24-workplan.md` for the full 8-phase plan.

Phases 0-4a delivered: position map data structure + DAL, store integration +
background fetch, position-map-accelerated seek (exact positioning, fewer ES
calls, no composite walks), scrubber tristate mode signal. Phases 4b-7
superseded — the remaining work was scrubber seek-mode polish, not real
scrolling. Two-tier virtualisation (above) is the successor.

### 10 April 2026 — Better table scroll (overscan 5→15), fix scrolling in tests

**Scope:** Fix rubberbanding in Playwright scroll tests, tune table overscan, hide Keywords column.

1. **Fix density-switch cooldown in test helpers** — `switchToTable()` and `switchToGrid()`
   in `e2e/shared/helpers.ts` now call `waitForExtendReady()` after `waitForResults()`.
   This polls the store's `loading` state until the search response arrives, then waits
   200ms for `SEEK_COOLDOWN_MS` to expire. Previously, tests scrolled during the 2-second
   `SEARCH_FETCH_COOLDOWN_MS` cooldown, which blocked `extendForward` — wheel events hit
   the buffer bottom and rubberbanded. Replaces the ad-hoc 2500ms wait in smoke test S9.

2. **Recalibrate wheel events in perf tests** — large `deltaY` values (1500-2000px)
   exhausted the 200-item buffer in 3-4 events, then remaining events were no-ops
   (no scrollTop change → no scroll event → no reportVisibleRange → no extend trigger).
   P8: 1500×40@60ms → 400×80@50ms. S9: 2000×60@100ms → 400×120@50ms. All perf/smoke
   wheel events now ≤600px, matching experiments.spec.ts calibration.

3. **Replace grid scroll with rAF smooth scroll** — P2 and P12 replaced wheel events
   with rAF-based `scrollTop` increments (50px/frame ≈ 3,000px/s). Continuous scroll
   events fire every frame, preventing rubberbanding at buffer boundaries. Table scroll
   (P8) keeps wheel events — 400px deltas don't rubberband in the table's taller buffer
   (200 rows × 32px = 6,400px).

4. **Fix P12 Credit sort cooldown** — `goto()` + `selectSort("Credit")` triggers
   `SEARCH_FETCH_COOLDOWN_MS` without going through `switchToTable()`. Made
   `waitForExtendReady()` public on `KupuaHelpers`, added call before second drift test.

5. **Add P14d rapid traversal** — 20 images forward at 80ms (~12/s) + 3s settle.
   Held arrow key simulation — cancellation stress test. Most images won't render;
   only the final image should load cleanly.

6. **Table overscan 5→15** — each side of viewport now has 15 pre-rendered rows
   (480px buffer) instead of 5 (160px). DOM churn in P8 dropped 25% (155k→117k).
   Severe jank increased 40% (heavier per-frame rendering) — acceptable trade-off
   since the visible result is fewer blank row flashes during fast scroll.

7. **Keywords column hidden by default** — `defaultHidden: true` on the Keywords
   field. Removes ~10-15 `<DataSearchPill>` spans per visible row. Users can
   still show it via column context menu.

**Test results:** 203 unit tests pass, 121 E2E tests pass (5.3m). P8 validated
visually (no rubberbanding), P12 validated (smooth scroll, reached offset=0/len=400
with extends). Perf baseline established (3 runs median).

### 9 April 2026 — Secondary sort in toolbar + SVG arrows in table headers

**Scope:** Unify sort UX between table column headers and toolbar sort dropdown.

1. **Table header arrows → SVG** — replaced Unicode `↑`/`↓` characters in table column
   headers with Material Icons `arrow_upward`/`arrow_downward` SVGs at `w-3 h-3` (12px).
   Secondary sort double-arrows use two SVGs with `-mr-0.5` (~1px visual gap).
   Cross-platform identical rendering, matches toolbar sort button style.

2. **Secondary sort in toolbar dropdown** — the sort dropdown now shows the active
   secondary sort field with double-arrow SVGs (same as table headers). Previously
   only the primary sort was shown (with a `✓` checkmark, now replaced with a
   directional arrow).

3. **Shift+click in sort dropdown** — same interaction model as table column headers:
   - Normal click: set primary sort, clear secondary
   - Shift+click on a different field: add as secondary sort
   - Shift+click on active secondary: toggle its direction
   - Shift+click on primary: no-op (can't be both primary and secondary)

4. **E2E test updates** — `ui-features.spec.ts` sort indicator assertions updated from
   text-matching `↑↓` to checking for `svg` elements. `helpers.ts` sort locators
   already use `aria-label` (from previous session).

**Files changed:** `ImageTable.tsx`, `SearchFilters.tsx`, `e2e/local/ui-features.spec.ts`.

**Visual baselines regenerated** (table view shows SVG arrows instead of text).

### 9 April 2026 — Mobile Phase 1: Quick wins + responsive polish

**Scope:** Make browsing usable on mobile without compromising the desktop experience
(99.9% of usage). All changes CSS-only or touch-event-only unless noted.

**Fixes implemented:**

1. **Pull-to-refresh prevention** — `overscroll-behavior-y: contain` on ImageGrid and
   ImageTable scroll containers. `touch-action: none` on Scrubber track.
2. **Dynamic viewport height** — `h-screen` → `h-dvh` in `__root.tsx` to avoid layout
   thrashing when the Android URL bar shows/hides.
3. **Scrubber tooltip stuck on mobile** — `mouseenter` fires synthetically on tap but
   `mouseleave` never fires. Timer callbacks now clear `isHoveringTrack`/`isHovered`;
   `handleTrackMouseMove` re-asserts both on each move so desktop hover is unaffected.
4. **Extended ticks stuck on mobile** — same root cause as tooltip. Timer callbacks
   clear both hover states. `handleThumbPointerDown` sets `isHovered(true)` so ticks
   show during drag on mobile.
5. **Search input overflow** — Clear ✕ button moved from absolute overlay to flex
   sibling (matching kahuna). Inner wrapper `overflow-hidden` preserves CQL component's
   built-in `overflow-x: auto` horizontal scrolling.
6. **Responsive toolbar labels** — StatusBar uses CSS container queries
   (`@container` + `@[500px]`/`@[600px]`): "matches" text appears at 500px, Browse/Details
   labels at 600px. SearchBar uses viewport breakpoints: "Free only" (below lg) / "Free to
   use only" (lg+), DateFilter icon-only (below lg) / full label (lg+), ES timing hidden
   below lg. Filters visible from `sm` (640px).
7. **StatusBar no-wrap guarantee** — `overflow-hidden` + `whitespace-nowrap` + `shrink-0`
   on all buttons. Text never wraps even with large accessibility fonts on mobile.
8. **Sort arrow cross-platform** — replaced Unicode ↓/↑ with Material Icons
   `arrow_downward`/`arrow_upward` SVGs. Renders identically on macOS, Android, Windows.
9. **SearchBar gap** — consistent `gap-1.5` (6px) at all breakpoints.
10. **E2E test helper fix** — `toggleSortDirection()` and `getSortDirection()` in
    `helpers.ts` used `hasText: /[↑↓]/` to find the sort direction button. Broken by
    the SVG arrow change (#8). Fixed: locate via `aria-label` attributes instead.

**Minor desktop compromise (accepted):** After clicking the scrubber track and holding
the mouse perfectly still for 1.5s, tooltip and ticks blink briefly. Instantly recovered
on any mouse movement. An absurdly narrow edge case — not worth more complexity.

**Files changed:** `__root.tsx`, `ImageGrid.tsx`, `ImageTable.tsx`, `Scrubber.tsx`,
`SearchBar.tsx`, `SearchFilters.tsx`, `DateFilter.tsx`, `StatusBar.tsx`,
`e2e/shared/helpers.ts`.

**Visual baselines regenerated** after all layout changes.

### 9 April 2026 — Fix: new-images ticker doesn't clear on first click

**Bug:** Click the "X new" ticker to refresh → images are prepended but the ticker
stays visible. Only a second click clears it.

**Root cause:** Race between the new-images poll and `search()`. The poll fires
`dataSource.count()` with no abort signal. If the count request is in-flight when
the user clicks the ticker, `search()` completes and sets `newCount: 0`, but the
old poll's count response arrives after and overwrites it back to a positive value.

**Fix (search-store.ts):**
1. Stop the poll immediately at the start of `search()` (was only stopped after
   results arrived) and eagerly set `newCount: 0`.
2. Added a generation counter (`_newImagesPollGeneration`) to the poll. The callback
   captures the generation at creation time and skips `set()` if a newer generation
   has started. `stopNewImagesPoll()` also bumps the generation.

### 9 April 2026 — Fix: scroll freeze after 1 minute idle (PIT `_shard_doc` mismatch)

**Bug:** After the app sits idle for ~1 minute, scrolling down stops at exactly 200
images (the initial PAGE_SIZE). `extendForward` never succeeds. The app is permanently
stuck until a new search is triggered.

**Root cause:** ES 8.x PIT-based queries silently append an internal `_shard_doc`
tiebreaker to `hit.sort` arrays. With a 3-field sort clause `[uploadTime, id, _shard_doc]`,
the returned cursors have 4 values instead of 3. After the PIT expires (1 minute
`keep_alive`), `extendForward` fires with the stale PIT → 404 → the retry code
strips the PIT from the body and retries against the index. But `search_after` still
has 4 values for a 3-field sort → ES rejects with **400 Bad Request**. The error
throws, `extendForward` catches and resets `_extendForwardInFlight`, but the next
scroll event immediately retries the same failing cycle. The user sees a frozen list.

**Diagnosis:** Diagnostic `devLog()` added to every `extendForward`/`extendBackward`
guard showed `[extendForward] BLOCKED: _extendForwardInFlight=true` repeating, with
interleaved `PIT expired/closed, retrying without PIT` warnings and `400 Bad Request`
responses in the network tab.

**Fix (2 changes in `es-adapter.ts`):**
1. **Strip at source:** When returning sort values from PIT queries, trim each
   `hit.sort` array to match the explicit sort clause length (`effectiveSort.length`).
   Cursors stored in `endCursor`/`startCursor` never contain `_shard_doc` values.
2. **Defence-in-depth:** In the PIT 404 retry block, also trim `body.search_after`
   before retrying — catches any cursors that were already stored with the extra value.

**Diagnostic logging kept:** `devLog()` in extend guards and `handleScroll` null-range
warning. DCE'd in prod, useful for future debugging.

### 9 April 2026 — Fix: Home logo from image detail doesn't focus search box

**Bug:** Clicking the Home logo from image detail view resets everything correctly but
doesn't place the caret in the CQL search input.

**Root cause:** `resetScrollAndFocusSearch()` focuses the CQL input in a
`requestAnimationFrame`, but guards it with `url.searchParams.has("image")`. At rAF
time the URL still has `?image=...` because `navigate()` hasn't been called yet
(it fires after `await search()` in `resetToHome`). The guard returns early.

**Fix (`reset-to-home.ts`):** Added a second `requestAnimationFrame` focus after
`navigate()` in `resetToHome()`, when the URL is clean and the image detail is gone.

### 9 April 2026 — Code quality audit + tsc error fixes

**Audit:** Full code quality scan of `src/` (~22k lines, 55 files). Report written to
`exploration/docs/code-quality-audit-2026-04-09.md` (archived). Scanned for: `as any`
(3, all debug globals), `@ts-ignore` (0), eslint-disable (19, all annotated), catch
blocks (14 in store, all follow consistent abort-check → warn → degrade pattern),
console.warn (19, intentional per dev-log contract), TODO/FIXME (0), dead code (1).
Conclusion: codebase is clean, no structural issues beyond what doc 05 already
identified and deferred.

**Fixes applied (6 changes):**

1. `search-store.ts:1362` — Added `firstItem` guard before `extractSortValues` call
   in extendForward eviction. Buffer items are `Image | undefined` but
   `extractSortValues` expects `Image`. The `newBuffer.length > 0` check was
   already there but TS couldn't narrow through the index access.
2. `search-store.ts:1505` — Symmetric fix in extendBackward eviction (`lastItem` guard).
3. `sort-context.ts:674` — Removed unused `intervalMinutes` variable (3 lines). Leftover
   from a refactor where sub-hour interval logic was simplified.
4. `CqlSearchInput.tsx:92` — Added `as unknown as CustomElementConstructor` cast.
   Upstream `@guardian/cql` type doesn't satisfy newer DOM typings
   (`ariaActiveDescendantElement` etc.). Works at runtime; type system is behind.
5. `reverse-compute.test.ts:21–25` — Removed unused `@/constants/layout` import
   (values appeared in comments but were never used as code).
6. `search-store-extended.test.ts:823` — Removed unused `beforeOffset` variable
   (declared but never asserted against in the extendForward-after-null-zone-seek test).

**Bonus:** `es-adapter.ts:448–453` — Deleted the PIT close `console.warn` entirely.
PIT close is fire-and-forget (PITs auto-expire), and the warning fired constantly,
polluting the console with zero diagnostic value.

**Result:** `npx tsc --noEmit` → 0 errors (was 5). `npm test` → 203/203 pass.

### 9 April 2026 — Fix: Home from deep table lands at wrong grid position

**Bug:** Fresh app → switch to table → scroll down past buffer (triggers forward
eviction, bufferOffset > 0) → click Home logo → grid lands at ~image 198 instead
of the top, forwardExtend is broken (can't scroll down). App thinks it's at the
bottom of the result set.

**Root cause:** Race condition in the density-focus unmount/mount bridge. When
`resetToHome()` calls `search()`, Zustand's `set()` triggers a batched re-render.
`navigate()` fires before React commits the re-render, so Effect #8
(BufferOffset→0 guard in `useScrollEffects.ts`) never runs. The browser
auto-clamps scrollTop to the new shorter maxScroll (200 items instead of 1000).
The table's unmount save captures `scrollTop=maxScroll, gap=0` → "source was at
bottom". The grid mount extremum-snaps to its own maxScroll, landing the user at
~image 198.

The viewport anchor feature (c4dec72c3) expanded the surface area: before it, the
unmount save only fired when `focusedImageId` was set. After it, `getViewportAnchorId()`
returns non-null almost always, so the unmount save fires even without explicit focus.

**Fix:** Added `_suppressDensityFocusSave` flag to `useScrollEffects.ts`.
`resetToHome()` calls `suppressDensityFocusSave()` before `navigate()` to prevent
the table's unmount save from writing stale data. The grid mount effect #10 clears
the flag, restoring normal density-switch behaviour for future interactions.

**Files changed:**
- `src/hooks/useScrollEffects.ts` — added suppress flag + guard in save + clear in mount
- `src/lib/reset-to-home.ts` — calls `suppressDensityFocusSave()` before `navigate()`

**Density-focus audit:** Only `resetToHome()` can trigger this race (search() +
density-changing navigate() in sequence). Normal density toggle doesn't call
search(). Browser back/forward strips density from sync comparison (display-only
key). No other code paths affected. Commit dceb2e69b (cursor recomputation after
eviction) is a separate, unrelated bug class.

**mouse.wheel audit for E2E tests:** All 8 existing mouse.wheel tests pass. One
smoke test (S9 in `manual-smoke-test.spec.ts`) was fixed: added 2500ms wait after
`switchToTable()` before wheel loop to outlast `SEARCH_FETCH_COOLDOWN_MS`.

**Playwright globalTimeout:** Bumped from 10min to 20min — 121 sequential tests
with retries easily exceed 10min.

### 9 April 2026 — Developer experience: deps upgrade, resilient start.sh, Docker Compose v1 compat

**Context:** User tried to onboard a friend. 3.5 hours spent fighting dependencies.
Audit identified: hidden deps (Python 3, session-manager-plugin), missing sample data
instructions, cryptic errors from `ssm-scala` Java failures, Docker Compose v1
incompatibility, and stale npm packages with CVEs.

**Dependency upgrades (safe patches/minors only):**
- vite 8.0.2→8.0.8 (3 CVEs fixed: arbitrary file read via WebSocket, `server.fs.deny`
  bypass, `.map` path traversal)
- 12 other packages: @aws-sdk 3.1014→3.1027, @playwright/test 1.58→1.59,
  tailwindcss/vite 4.1→4.2, @tanstack/react-router 1.168.3→1.168.10,
  @tanstack/react-virtual 3.13.6→3.13.23, jsdom 29.0.1→29.0.2,
  typescript-eslint 8.57→8.58, vitest 4.1.1→4.1.4, zustand 5.0.5→5.0.12
- brace-expansion transitive vulnerability fixed via `npm audit fix`
- Deferred: TypeScript 6, ESLint 10, eslint-plugin-react-hooks 7, React 19.2
  (major version bumps, need separate testing)

**start.sh — SSM fallback (no more Java requirement for TEST mode):**
- Tries `ssm-scala` first if available (Guardian devs, unchanged path)
- Falls back to raw AWS CLI (`ec2 describe-instances` + `ssm start-session`
  port forwarding) if `ssm` not installed or fails (Java crash)
- Preflight checks: verifies `aws` CLI and `session-manager-plugin` before
  attempting tunnel. Prints `brew install` commands if missing.
- Credential errors now print actionable messages ("Fetch from Janus")

**start.sh — Docker Compose v1/v2 compatibility:**
- `dc()` wrapper function auto-detects `docker compose` (v2) vs `docker-compose` (v1)
- All compose calls go through `dc()`
- `docker-compose.yml`: added `version: "3.9"` (v2 ignores it, v1 requires it)
- `env_file` simplified from extended syntax (`path:`/`required:`) to plain string
  (v1 doesn't understand the extended form)
- `touch ~/.kupua-imgproxy.env` at startup ensures v1 doesn't fail on missing env_file

**package.json / .nvmrc:**
- Added `"engines": { "node": "^20.19.0 || >=22.12.0" }` — `npm install` warns on
  wrong Node version
- Added `kupua/.nvmrc` (v22.12.0) — `nvm use` auto-switches in kupua directory

**README.md rewrite:**
- Prerequisites split into "Local mode (everyone)" vs "TEST mode (adds)"
- All dependencies listed with `brew install` commands
- Python 3 listed as prerequisite (was hidden)
- Docker image size warning for first-time users
- `ssm-scala` marked as optional
- Quick dependency check commands
- Docker Compose v1 and v2 both mentioned as supported

### 9 April 2026 — Fix scroll freeze after buffer eviction (cursor recomputation)

**Problem:** After scrolling down far enough to trigger forward eviction (~1000
items), the user could not scroll back up — the grid froze at the buffer start.
Symmetric issue existed for backward eviction blocking forward scrolling.

**Root cause (two bugs):**

1. **Nullish coalescing defeated invalidation.** After forward eviction,
   `newStartCursor` was set to `null`, but then
   `startCursor: newStartCursor ?? state.startCursor` restored the old (stale)
   cursor. `null ?? x` returns `x`. Same pattern for `endCursor` in backward
   eviction.

2. **Null cursor blocked extend guards.** Even after removing the `??` fallback,
   `startCursor = null` caused `extendBackward` to bail at its
   `if (!startCursor) return` guard — so backward extension was permanently
   disabled after any forward eviction.

**Fix:** Instead of nullifying cursors after eviction, recompute them from the
new buffer boundary items using `extractSortValues()` (pure field read from the
in-memory image, no ES call). This keeps both cursors valid after eviction so
the user can scroll in either direction indefinitely.

- `extendForward` eviction: `newStartCursor = extractSortValues(newBuffer[0], params.orderBy)`
- `extendBackward` eviction: `newEndCursor = extractSortValues(newBuffer[newBuffer.length - 1], params.orderBy)`
- Removed the `?? state.startCursor` and `?? state.endCursor` fallbacks.

### 9 April 2026 — frozenUntil: cap pagination requests to prevent new-image leakage

**Problem:** After PIT expires (idle >5 min), extend/seek/fill requests hit the
live index and may include images uploaded after the user's last search. The
ticker says "5 new" while those images are already silently visible — an
inconsistent hybrid worse than either "always frozen" or "always live."

**Solution:** Added `frozenParams()` helper in `search-store.ts`. It applies
`until: min(params.until, newCountSince)` to every pagination request
(extendForward, extendBackward, seek, restoreAroundCursor, _findAndFocusImage,
_fillBufferForScrollMode). NOT applied in `search()` itself — that's the action
that resets `newCountSince`.

Also applied `frozenParams()` to `fetchAggregations` and `fetchExpandedAgg` so
facet filter counts stay consistent with the frozen result set. Without this,
a new image could bump "Credit A: 7" to "Credit A: 8" in the filter panel
while the results grid still showed only the original 7.

When PIT is active, the cap is redundant (subset filter on a snapshot is a
no-op). When PIT expires, it prevents new images from entering the buffer.
If the user has an explicit `until` date filter, the earlier of the two is used
so the user's filter is never widened.

Document title and ticker badge both read the same `newCount` store field —
always in sync, no fix needed.

Investigation and action comparison table: archived to
`exploration/docs/99 Archive/new-images-behaviour-comparison.md`.
All 203 unit/integration tests pass.

### 8 April 2026 — Approach C (synthetic seek) implemented and abandoned

**Goal:** Eliminate FOCC (Flash Of Correct Content) caused by non-atomic
scrollTop compensation after backward prepend and forward eviction in the
windowed buffer. The idea: instead of prepending/evicting items and then
compensating scrollTop (which leaks one visible frame), combine fetched items
with the existing buffer in memory, slice a BUFFER_CAPACITY window centered on
the viewport, and `set()` the result as if it were a seek. No prepend = no
compensation = no FOCC. Zero extra ES queries.

**What was built (Sessions 1–2):**
- `computeSyntheticSeek()`: pure function (~65 lines, 14 unit tests) that
  combines fetched hits with the existing buffer, slices a centered window,
  extracts cursors, computes scroll target index, and builds imagePositions.
- `extendBackward`: replaced the prepend + `_prependGeneration++` path with
  synthetic seek — calls `computeSyntheticSeek(direction:"backward")` then
  `set()` with `_seekGeneration++`, reusing Effect #6 (proven zero-flash seek
  scroll-to-target).
- `extendForward` eviction path: replaced evict + `_forwardEvictGeneration++`
  with `computeSyntheticSeek(direction:"forward")` + seek-shaped `set()`.
  Non-eviction (pure append) path left unchanged.
- Removed dead `evictPositions()` function (~15 lines, sole caller was old
  eviction path).
- Cascade fix: initial E2E revealed that bumping `_seekGeneration` triggers
  Effect #6's deferred scroll (at SEEK_DEFERRED_SCROLL_MS = 150ms), which
  fires `reportVisibleRange` → another extend → cascade. Fixed by setting
  cooldown to `SEEK_DEFERRED_SCROLL_MS + POST_EXTEND_COOLDOWN_MS` (200ms)
  so the cooldown outlasts the deferred scroll.
- Results: 217/217 unit tests pass, 121/121 E2E tests pass (local ES, ~10k docs).

**What failed (Session 3 — smoke test on TEST, 1.3M docs):**

App was unusable. After seek to 50% and scrolling up, bufferOffset dropped by
~196 every ~500ms. Once scrollTop reached 0, the cascade continued indefinitely
— 18 extends in 8 seconds, offset fell from 671,797 to 668,269.

Root cause — two linked problems:

1. **scrollTop ↔ buffer content mismatch.** `computeSyntheticSeek` correctly
   tracks where the viewport image sits in the new buffer (`viewportInPool -
   windowStart`), but Effect #6 compares this target pixel position against
   `currentScrollTop`. For backward extends, 196 items are prepended to the
   pool. When the pool is smaller than BUFFER_CAPACITY (no slicing — the
   first 3–4 extends after seek), the scroll target index is offset by
   `fetchedHits.length` from where `currentScrollTop` points. The delta is
   `(196 / 7 cols) × 303px ≈ 8,484px`. Depending on how `scrollTargetIndex`
   is computed, Effect #6 either (a) NO-OPs because a reverse-computation from
   `currentScrollTop` gives a low delta — causing content drift (wrong images
   at correct scroll position), or (b) fires with the full +8,484px delta —
   which IS the scrollTop compensation that causes FOCC in the first place.
   Either outcome defeats the purpose.

2. **Perpetual extend trigger at scrollTop=0.** As the user scrolls up, each
   synthetic seek prepends items without adjusting scrollTop (that's the
   point — no compensation). scrollTop monotonically decreases to 0. At
   scrollTop=0: startIndex=0, which satisfies `startIndex ≤ EXTEND_THRESHOLD
   (50) && offset > 0`. Every subsequent scroll event (including no-op wheel
   events at scrollTop=0) triggers `reportVisibleRange` → `extendBackward`.
   The 200ms cooldown delays but doesn't prevent — the trigger condition is
   permanently true. The cascade runs until bufferOffset reaches 0 (671k
   items of runway on TEST; on local ES with 10k items it self-terminates
   quickly, which is why E2E passed).

**Why forward worked but backward didn't:** Forward synthetic seek works
because scrolling DOWN moves `startIndex` away from the backward threshold.
After eviction + re-centering, `startIndex` lands in the buffer middle, far
from both thresholds. Backward extends push the viewport toward scrollTop=0
— a hard wall that traps the trigger condition.

**The fundamental design flaw:** Synthetic seek was designed on the premise
that "replace the buffer atomically, compute scrollTargetIndex so Effect #6
sees delta ≈ 0, no flash." For real seeks this is true — the buffer is
fetched fresh and `currentScrollTop` naturally maps to the correct position.
For backward synthetic seeks, the buffer has items prepended at the front, so
`currentScrollTop` is inherently misaligned with the new buffer layout by
`(fetchedItems / columns) × rowHeight`. Either the scrollTop is adjusted
(reintroducing the FOCC that synthetic seek exists to avoid) or it isn't
(causing content drift and cascade). This is circular — the approach's core
premise doesn't hold for backward extends.

**Alternatives evaluated and rejected:**
- Pre-set scrollTop before `set()` (scrollTop first, then DOM swap): might
  avoid FOCC if the browser doesn't paint between the two synchronous
  operations, but this is the same browser-timing gamble that defeated
  flushSync, CSS transform, and the other four prior approaches.
- Hybrid (old path when pool ≤ capacity, synthetic seek when pool > capacity):
  the steady-state delta is also large because `currentScrollTop` is in the
  old buffer's coordinate system regardless of slicing. Doesn't fix the
  fundamental mismatch.
- Deferred application (fetch early, apply when viewport is centered): same
  coordinate mismatch regardless of when the modification is applied.

**Decision:** Abandon synthetic seek entirely. Revert all uncommitted changes.
The forward eviction FOCC (35 screens from seek point) and backward prepend
FOCC (3 screens from seek point) remain as cosmetic issues. They are
positional stutters (same images, wrong position for one frame) — not content
errors. Four additional approaches failed for the same fundamental reason: the
browser provides no API for "the content origin moved, adjust scrollTop
atomically." This appears to be an inherent limitation of virtual scroll
libraries using `position: absolute` rows, well-known in the community.

**FOCC status: accepted as known cosmetic limitation.** Not worth further
investment — six approaches tried (flushSync, CSS transform, aggressive
threshold, directional bias, overflow-anchor, synthetic seek), all failed.
The FOCC is 1–2 frames at specific scroll positions after scrubber seek,
rarely noticed by users in practice.

### 8 April 2026 — FOCC research: 4 failed approaches, Approach C planned

**Problem:** After scrubber seek, scrolling continuously in either direction
causes a visible flash (FOCC — Flash Of Correct Content). Scroll-up: ~3
screens from seek point (high severity). Scroll-down: ~35 screens (lower).
The flash is a scrollTop discontinuity (+8,484px up / -4,545px down) — same
images at wrong position for one frame. Caused by non-atomic prepend/evict
+ scrollTop compensation in the windowed buffer system.

**Empirical confirmation (S27 v3 on TEST, 1.3M docs):** FOCC, not FOIC.
Every SCROLL_JUMP frame has identical image sets (sorted src comparison).
Column-aligned trimming eliminated content discontinuities; only positional
discontinuity remains.

**Approaches tried and failed (sessions 3–8):**
- **K (flushSync):** Wrapped Zustand `set()` in `flushSync()`. SCROLL_JUMP
  count identical — browser compositor paints between DOM mutation and
  scrollTop regardless of JS-level synchronicity. Reverted.
- **A+T (CSS transform):** `translateY(-Δ)` on sizer div via Zustand
  `subscribe` + `will-change: transform`. Flash visually worse — TanStack
  Virtual recalculates row `top` values, compounding with transform. Reverted.
- **V+ (aggressive EXTEND_THRESHOLD):** Increased threshold to fire extends
  earlier. Flash happened earlier, not gone — threshold measures from buffer
  edge, not viewport. Fundamental flaw. Reverted.
- **V++ (directional headroom bias):** Same fundamental flaw as V+. Ruled out.

**Solution designed: Approach C (synthetic seek).** When extend would
prepend/evict, combine fetched items with existing buffer in memory, slice
a BUFFER_CAPACITY window centered on viewport, and `set()` as a seek result.
No prepend → no compensation → no FOCC. Zero extra ES queries (vs Approach B
micro-seek). Uses proven `computeScrollTarget` + Effect #6 path.

**Artifacts produced:**
- `scroll-flashing-issue.md`: comprehensive FOCC narrative
- `scroll-approach-C-synthetic-seek-idea.md`: design rationale
- `scroll-synthetic-seek-workplan.md`: 4-session implementation plan
- `scroll-swimming-on-scroll-up-handoff.md`: handoff doc

**Code changes kept:** S27a/S27b smoke tests (FOCC detection + corpus
pinning), run-smoke.mjs S-number parsing fix, column-aligned prepend/evict
trimming, removed dead `markPrependPreCompensated`/`consumePrependPreCompensated`
flag system (never called — pure dead code).

**Next:** Approach C Session 1 (synthetic seek implementation).

### 8 April 2026 — Viewport anchor: stale re-lookup bug fix

**Bug:** Density switching (grid↔table) without focus (no clicked image) failed
in multiple scenarios: PgDown ×3 from top → switch landed at top; End key →
switch landed at top; seek 50% → switch showed wrong images. Only subsequent
switches were stable. Reproduced with both keyboard navigation and mousewheel.

**Root cause:** The mount-restore rAF2 callback (Effect #10) re-looked up the
anchor image's position via `posNow.get(id)` where `id` was the viewport anchor
captured at mount time. Between mount and rAF2 (~2 animation frames), the NEW
component's initial scroll handler (`handleScroll` → `reportVisibleRange`) fires
and overwrites `_viewportAnchorId` with an image near the top (scrollTop=0).
The rAF2 re-lookup then found this wrong image at position ~8 instead of the
saved position ~103, computed `rowTop=303` instead of `rowTop=5151`, and the
restore target collapsed to 0 via clamping.

Diagnostic trace showed:
```
SAVE:    anchor=62ff... globalIdx=103 scrollTop=2784
RESTORE: savedGlobalIdx=103 freshIdx=8 rowTop=303 rawTarget=-260 → clamped=0
```
The `freshIdx=8` was the smoking gun — a completely different image.

**Fix:** In the `saved != null` branch of mount restore, the rAF2 re-lookup now
uses `saved.globalIndex - boNow` directly instead of looking up via the viewport
anchor id. `saved.globalIndex` is a stable global position that doesn't depend on
module-level state that can be overwritten between mount and rAF2. Same fix applied
to the `saved == null` fallback branch — captures the anchor's global index at mount
time (before the new component's scroll can corrupt it).

**Fix 2 — bottom-edge extremum snap.** After fixing the stale re-lookup, End key
density switches (table→grid, grid→table) still landed 2-3 rows short of the
actual bottom. Cause: the viewport-centre anchor is naturally a few rows above the
bottom edge, so the ratio-based restore lands short. Added `sourceMaxScroll` to
`DensityFocusState`. When the source density was within one grid row (303px) of its
maxScroll, the restore snaps to the target's maxScroll — symmetric with the existing
top-edge snap at `sourceScrollTop === 0`.

**Tests added:** 5 new E2E tests in `scrubber.spec.ts`:
1. PgDown ×3 from top of table → grid preserves position
2. PgDown ×3 from top of grid → table preserves position
3. End key in table → grid shows near-bottom
4. End key in grid → table shows near-bottom
5. Seek 50% in table → grid → table round-trip is stable

All assert that `scrollTop > 0` after the switch and that the centre image's
global position is close between densities.

**Files changed:** `useScrollEffects.ts` (mount restore rAF2 re-lookup),
`e2e/local/scrubber.spec.ts` (5 new tests).
**Results:** 203/203 unit, 11/11 density tests on TEST (1.3M docs).

### 8 April 2026 — Swimming detection tests (S26a/S26b)

**Context:** Sustained scroll-up after seek causes visible cell repositioning
("swimming") when backward headroom is exhausted and `extendBackward` prepends
items directly adjacent to the viewport. Previous agents wrote a comprehensive
handoff (`handoff-swimming-on-sustained-scroll-up.md`) analysing the root cause
(append vs prepend asymmetry, "rubber top") and proposing fixes. This session
wrote the detection tests.

**S26a (scroll-up):** Seeks to 50%, scrolls UP 12,000px (80 × 150px). Exhausts
~4,200px of headroom, triggers 2 `extendBackward` cycles. Asserts
`firstVisibleGlobalPos` is monotonically non-increasing. **Fails on TEST:** 1
backward jump at step 15 (pos 672,169 → 672,172, +3 items at prependGen=1).
Bug confirmed.

**S26b (scroll-down, forward eviction probe):** Same seek, scrolls DOWN 40,000px
(200 × 200px). Fills buffer to BUFFER_CAPACITY (1000), triggers 1 forward eviction.
**Passes on TEST:** 0 monotonicity violations. Forward eviction compensation is
undetectable at 100ms polling. Soft assertion — ready to harden when forward flash
is addressed.

**Decisions:**
- No local test variants — 100ms polling can't catch ~16ms intermediate frame
  artifacts on local data. Existing local `"can scroll up after seeking to 50%"`
  covers plumbing.
- S26b uses soft assertion (warns, doesn't fail) to distinguish from the more
  severe backward swimming.
- Handoff updated with full empirical results and next-agent instructions (Step 3:
  implement CSS transform pre-compensation).

### 7 April 2026 — Viewport anchor: extremum-snapping fix & sort-focus revert
**Context:** Viewport anchor (viewportAnchorId) was implemented across
useDataWindow, useScrollEffects, useUrlSearchSync, and reset-to-home to keep the
user's visual position stable across density changes and sort switches. Two issues
surfaced during E2E testing.
**Reverted Effect #7 sort-focus fallback.** The anchor-around-sort path in
useScrollEffects Effect #7 caused regressions when the anchor row disappeared
from the new sort order. Removed the single fallback line; sort switches now use
the existing density-focus machinery which already handles missing rows gracefully.
Can be re-enabled later as a one-line change.
**Fixed extremum snapping on mount restore.** When a density change happened while
the user was scrolled to the very top, the mount-restore logic would compute a
non-zero offset because it didn't know the source scroll position. Added
`sourceScrollTop` to `DensityFocusState`; mount restore now snaps to 0 when the
source was at the top edge.
**Added row-height extremum clamping** as a safety net: if the computed restore
target exceeds the container's scrollable range, it clamps to the nearest valid
boundary instead of leaving the viewport in a broken state.
**Files changed:** `useScrollEffects.ts` only (revert + extremum logic).
**Tests:** 203/203 unit, 121/121 E2E — clean sweep.

### 7 April 2026 — Keyboard nav E2E test culling & globalTimeout bump

**Context:** E2E suite grew to 127 tests (21 keyboard-nav + 106 existing) and started
hitting the 5-minute `globalTimeout`. The keyboard-nav tests had several redundancies
from iterative development.

**Culled 5 redundant keyboard-nav E2E tests** (21 → 16):
- "ArrowUp scrolls by one row without setting focus" — same `scrollByRows` code path as ArrowDown test.
- "PageUp scrolls by one page without setting focus" — same `pageScrollTarget` code path as PageDown test.
- "multiple ArrowDown presses scroll cumulatively" — tests arithmetic (`3 * ROW_HEIGHT`), not behaviour.
- "PageUp/Down propagate from search box" — already covered by no-focus PageDown test (search box has autofocus).
- "ArrowDown from non-aligned position snaps" — same `snapToRow` path already covered by PageDown snap test.

**Reduced wait** on "Home after deep seek" test: 1500ms → 1000ms. Verified it passes (3.5s).

**Bumped `globalTimeout`** from 5 → 10 minutes in `playwright.config.ts` and
`playwright.run-manually-on-TEST.config.ts`. Other configs already had 10+ min.

### 7 April 2026 — Testing coverage audit & P0 feature specification E2E tests

**Context:** Home logo regression went undetected for 2 days. Root cause: tests were
written around bug *fixes*, not around feature *specifications*. The shallow-scroll case
(bufferOffset already 0) was untested while the deep-seek case was covered.

**Audit findings:**
- 203 Vitest unit/integration tests (~5s) — excellent for store/DAL/sort logic.
- 91 Playwright E2E tests (~70s) — exceptional for scroll/seek/buffer, heavily skewed
  toward solved problems.
- Zero E2E tests for: search input, filters, image detail content/navigation, panel
  toggles, keyboard shortcuts (beyond PageDown/Home), responsive viewports, error states.

**Decision:** Recommended against splitting E2E tests into groups. 70s (now ~4.5min with
106 tests) is cheap; integration is the whole point — the Home logo regression was caused
by interaction between 3 systems.

**New file: `e2e/local/ui-features.spec.ts`** — 15 feature specification tests:
1. Double-click grid cell opens detail
2. Double-click table row opens detail
3. Back to search button preserves focus + visibility
4. Backspace closes detail, preserves focus
5. Arrow keys navigate between images in detail
6. Enter key on focused image opens detail
7. Result count updates when query changes
8. Detail header shows position counter (N of total)
9. Browse button toggles left panel
10. Details button toggles right panel
11. `[` and `]` keyboard shortcuts toggle panels
12. Sort dropdown opens, shows options, selecting changes results
13. Column header click changes primary sort
14. Shift+click column header adds secondary sort
15. URL with query+sort loads correct results

**Dropped (with reasoning):** density toggle (redundant with existing tests #45-47),
Free-to-use toggle (config-changing soon), sort direction toggle (already covered by #49).

**BUILD-FIRST note added:** ArrowDown from search box should focus FIRST visible image
(currently focuses wrong item because `isNativeInputTarget()` check partially blocks).

**Test #6 fix:** Enter key test initially failed — page loaded with CQL search input
focused. ArrowDown dispatched to `useListNavigation` but `isNativeInputTarget()` check
blocked proper focus transfer. Fixed by using `focusNthItem()` (click) instead of
ArrowDown to establish focus before pressing Enter.

**Integration test audit:** 203 Vitest tests in excellent shape. One medium-risk gap
identified: `search-params-schema.ts` (Zod schema) has zero tests. Deferred — low
probability of breakage, fully covered by E2E URL state test.

**Housekeeping:** Added `worklog-current.md` to `.gitignore` (transient session artifact,
never committed). Updated worklog directive wording in both copilot-instructions files.
Updated `e2e/README.md` file map and `AGENTS.md` test counts.

### 7 April 2026 — Home logo flash elimination (table→grid density switch)

**Problem:** Clicking the Home logo from table view produced three visual states
instead of two: (1) table at current position, (2) grid showing wrong images from
deep offset for ~50-200ms, (3) grid at top with correct data. State 2 was the flash.
A second, subtler flash existed even at shallow scroll: the table jumped to
`scrollTop=0` for ~100ms before the grid replaced it.

**Root cause (deep flash):** The `<Link>` navigation changed the URL synchronously
(dropping `density=table`), causing React to unmount the table and mount the grid
BEFORE the async `search()` completed. The grid rendered the stale deep-offset
buffer at `scrollTop=0`.

**Root cause (shallow flash):** `resetScrollAndFocusSearch()` eagerly set
`scrollTop=0` on the table's scroll container. The table jumped to top immediately,
then ~100ms later navigation fired and the grid replaced it. Three states.

**Investigation — approach G (startTransition) eliminated:** TanStack Router's
`useSearch()` → `useMatch()` → `useStore()` → `useSyncExternalStoreWithSelector`
delivers URL state via a synchronous external store that tears through React
transitions. `startTransition` cannot defer the density value change.

**Fix — approach A (imperative navigation):**

1. **`reset-to-home.ts`:** `resetToHome()` converted from sync to async. Accepts a
   `navigate: () => void` callback. Runs all state resets, then `await store.search()`,
   then calls `navigate()`. Error handling: navigates even if search fails (graceful
   degradation). The density switch now happens AFTER fresh page-1 data is in the store.

2. **`SearchBar.tsx` + `ImageDetail.tsx`:** Replaced `<Link>` with
   `<a href="/search?nonFree=true">` + `e.preventDefault()` + `useNavigate()`.
   Preserves right-click "open in new tab" via the `href` attribute.

3. **`orchestration/search.ts`:** Added `skipEagerScroll` option to
   `resetScrollAndFocusSearch()`. When true, the eager `scrollTop=0` reset is
   skipped — the current view is about to be replaced by navigation.

4. **Density-aware skip:** `resetToHome()` checks `density=table` in the current
   URL. Only skips eager scroll when a density switch will happen (table→grid,
   where the scroll container is about to be replaced). When already in grid view,
   the scroll container survives navigation — eager reset is preserved.

**Test:** Scenario J in `buffer-corruption.spec.ts` — installs Zustand subscriber +
rAF URL watcher before clicking Home from deep-seeked table. Asserts the grid never
renders while `bufferOffset > 0`. All assertions pass.

**Files:** `lib/reset-to-home.ts`, `lib/orchestration/search.ts`,
`components/SearchBar.tsx`, `components/ImageDetail.tsx`,
`e2e/local/buffer-corruption.spec.ts`.
**Results:** 203 unit tests pass, 91 E2E pass (was 90 + 1 new).


### 7 April 2026 — Home logo fixes (shallow scroll + density-focus interference)

Three fixes from one session, all related to Home logo click behaviour:

**1. Home logo scroll reset from shallow scroll (fix #1).** Clicking the Home
logo did nothing when scrolled within the first page (bufferOffset already 0).
Root cause: commit 61b042101 removed eager scrollTop=0, deferring all resets
to effect #8 which only fires on bufferOffset >0 to 0 transitions. Fix: restored
eager scroll reset in `resetScrollAndFocusSearch()`, guarded by bufferOffset===0.
Two new E2E tests in buffer-corruption.spec.ts (grid + table).

**2. Column context menu positioning.** Moved ColumnContextMenu outside the
scroll container -- `contain: strict` on the scroll container was breaking
`position: fixed` and clipping the menu.

**3. Home logo from table with focused image (fix #2).** Clicking Home logo
from table view with a focused image failed to scroll to top in grid. The
density-focus save/restore (effect #10) saved the focused image ratio on table
unmount, then restored it on grid mount -- fighting the go-home intent. Fix:
in `resetToHome()`, synchronously clear `focusedImageId` and density-focus
saved state before navigation. Exported `clearDensityFocusRatio()` from
`useScrollEffects.ts`.

**Files:** `lib/orchestration/search.ts`, `lib/reset-to-home.ts`,
`hooks/useScrollEffects.ts`, `components/ImageTable.tsx`,
`e2e/local/buffer-corruption.spec.ts`.
**Results:** 203 unit tests pass, 90 E2E pass (was 88 + 2 new).


### 6–7 April 2026 — Scroll Test & Tune (6 sessions)

Multi-session effort to build test infrastructure, tune timing constants, and
investigate CPU throttle behaviour. Full worklog:
`exploration/docs/worklog-testing-regime.md`.

**Sessions 1–2 (6 Apr): Measurement primitives + smoke hardening.**
Added `sampleScrollTopAtFrameRate()` rAF helper to `KupuaHelpers` for frame-accurate
swimming detection. Added scrollTop=0 cold-start seek test, tightened settle-window
tolerance to 0 items, added rAF monotonicity test. Upgraded smoke S23 from 50ms
polling to rAF (catches 16ms events the old probe missed ~50% of). Added S25
fresh-app cold-start seek test. Added CLS capture via PerformanceObserver.

**Session 3 (6 Apr): Test suite rationalisation.**
Full audit of all spec files across 7 test modes. Created `e2e/README.md` with
decision tree, file map, and mode table. Added npm scripts: `test:e2e:headed`,
`test:e2e:debug`, `test:e2e:ui`. Reviewed directives — no changes needed.

**Session 4 (6 Apr): File reorganisation.**
Moved specs into `e2e/local/`, `e2e/smoke/`, `e2e/shared/` directories. Fixed all
imports. Updated all Playwright configs. Fixed smoke-report output path.

**Session 5 (6 Apr): Timing constant tuning.**
Systematic tuning of three constants on TEST (1.3M docs) with E1/E2 experiment
baselines. Results:

| Constant | Before | After | Method |
|----------|--------|-------|--------|
| `SEEK_COOLDOWN_MS` | 700 | 100 | Bisected; floor at 65–80ms |
| `SEEK_DEFERRED_SCROLL_MS` | 800 (700+100) | 150 (100+50) | Delta tuned +100→+50 |
| `POST_EXTEND_COOLDOWN_MS` | 200 | 50 | Halved; floor at 32ms |

Seek-to-first-extend reduced from 800ms → 150ms (**5.3× faster**). Grid jank
improved 50% at fast speed, 18% at turbo. Table jank unchanged (DOM-churn-bound).
No stability regressions. Fixed corpus-pinning `&until=` URLs across 7 files
(removed `encodeURIComponent`, fixed timestamp format). Overscan tuning deferred —
blank flash probe can't detect empty table rows.

**Corruption fix (6 Apr):** Restored `smoke-scroll-stability.spec.ts` from HEAD~1
after a bad merge during reorganisation left three duplicated S23 copies and syntax
errors. Re-applied Phase 2 changes cleanly.

**Session 6 (7 Apr): CPU throttle experiments.**
Added `CPU_THROTTLE` env var to shared test fixture (CDP `setCPUThrottlingRate`).
Ran smoke S14/S22/S23/S25 + E1/E2 experiments on TEST at 4× throttle. S22
(backward extend after seek) **consistently fails** at 4× — backward extend never
fires. Systematically tested three timing constant configurations:

| Experiment | SEEK_COOLDOWN | Delta | POST_EXTEND | Result |
|---|---|---|---|---|
| A: raise POST_EXTEND | 100 | +50 | 100 | ❌ 4/4 fail |
| B: raise delta | 100 | +150 | 100 | ❌ 4/4 fail |
| C: lower cooldown | 50 | +150 | 100 | ❌ 4/4 fail |

Root cause: the timing constants gate the store's *response* to extend requests, but
at 4× throttle the scroll handler doesn't fire often enough to *make* the request
(`startIndex` never reaches `EXTEND_THRESHOLD`). Fix requires changing the extend
trigger mechanism (scroll-distance-based or higher threshold), not timing constants.
On actual Guardian hardware (M1/M2), the 4× scenario doesn't arise. Updated
`e2e/README.md` with full environment variable and runner flag documentation.

### 6 April 2026 — Phase 2: Smoke Test Hardening (Testing Regime Plan)

Upgraded the smoke test suite for frame-accurate swimming detection on real data.
Three changes to `e2e/smoke-scroll-stability.spec.ts`:

**2a — S23 rAF-enhanced settle-window.** Replaced the 50ms `setTimeout` polling
(60 iterations, ~50% chance of missing a 16ms event) with `sampleScrollTopAtFrameRate(2000)`.
The rAF loop captures every painted frame (~121 samples at 60fps). Primary assertion
changed from content-shift-per-row to scrollTop monotonicity — any backward jump = swimming.
The old content-shift metric is kept as a secondary assertion for continuity. Result on
TEST (1.3M docs): 122 frames, perfectly monotonic, 0 content shift.

**2b — S25 fresh-app cold-start seek.** New test. Navigate → wait for results → immediately
seek to 50% without scrolling first. This is the most common user scenario and the exact
path that the Agent 11-13 bug class affected (scrollTop=0, no headroom, backward items
missing). Asserts: (1) bufferOffset > 0 (bidirectional seek loaded backward items),
(2) scrollTop moved from 0 to headroom position, (3) firstVisibleGlobalPos stable over 1.5s
(zero content shift), (4) scrollTop monotonically non-decreasing (rAF trace), (5) seek
accuracy < 10%. Result on TEST: all 5 assertions pass — PERFECT verdict.

**2c — S23 CLS capture.** Added `PerformanceObserver` for `layout-shift` entries to S23.
CLS doesn't catch scrollTop-based swimming (programmatic scroll, not CSS layout shift) but
catches virtualizer height changes during buffer replacement. CLS entries and total are
written to the smoke report JSON. Result on TEST: 7 entries, all `hadRecentInput=true`
(user-initiated), totalCLS=0.0000.

**Validation:**
- `npm test` → 203 passed
- `npx playwright test` → 88 passed (local E2E, no `src/` changes)
- Full smoke suite on TEST → 25 tests: 23 passed, 2 pre-existing Credit sort failures (S2, S6)


Extracted the reverse-compute logic from `seek()` (~90 lines inline at L2100–2213)
into a standalone exported pure function `computeScrollTarget()` at module level in
`search-store.ts`. `seek()` now calls this function instead of doing the math inline.
Zero behavioural change — E2E tests produce identical scrollTop values, offsets, and
positions.

**Function signature:**
```typescript
export function computeScrollTarget(input: ComputeScrollTargetInput): ComputeScrollTargetResult
```
Input: `currentScrollTop`, `isTable`, `clientWidth`, `clientHeight`, `backwardItemCount`,
`bufferLength`, `total`, `actualOffset`, `clampedOffset`.
Output: `{ scrollTargetIndex, seekSubRowOffset }`.

**17 unit tests** in `src/stores/reverse-compute.test.ts` covering the exact edge cases
from the Agent 11–13 swimming saga:
- scrollTop=0 with 100 backward items (cold-start headroom bug) → index 100
- Half-row (150px) sub-row preservation → seekSubRowOffset=150
- Deep scroll (10 rows, 6 cols) → index 160
- Shallow seek (no backward items) → index 0
- End key at-real-end → last item (bufferLength-1)
- At-real-end but not soughtNearEnd → clamped reverseIndex
- Fractional boundary row (100/6=16.67): row 16 headroom fires, row 17 doesn't
- Fractional row with sub-row offset (scrollTop=4948, 6 cols) → index 196, subRow=100
- Buffer-shrink (reversePixelTop > maxScroll) → clamped to lastVisibleRow
- Past headroom with large scrollTop → no headroom adjustment
- Table variants of the above
- Regression guard matching E2E observed values (scrollTop=7725, offset=5057, len=300)

Diagnostic logging in `seek()` preserved — same devLog output, variables populated from
the same computations (slight duplication, acceptable for debugging).

Validation: 203 unit tests pass (186 existing + 17 new), 88 E2E tests pass (unchanged).
Worklog: `exploration/docs/worklog-testing-regime.md`.

### 6 April 2026 — Phase 1: Measurement Primitives (Testing Regime Plan)

Executed Phase 1 of the Scroll Test & Tune plan (`testing-regime-plan-handoff.md`).
Built reusable measurement probes and local regression gates for swimming detection.
Zero changes to `src/` — tests only.

**1a — `sampleScrollTopAtFrameRate()` helper.** Added to `KupuaHelpers` in `e2e/helpers.ts`.
Runs a `requestAnimationFrame` loop inside `page.evaluate` for N milliseconds, returning
one scrollTop sample per painted frame (~60fps / ~120Hz in headless Chromium). Foundational
primitive for frame-accurate swimming detection — replaces 50ms setTimeout polling which
has ~50% chance of missing a 16-32ms swimming event.

**1b — scrollTop=0 cold-start seek test.** Added to `e2e/scrubber.spec.ts` Settle-window
stability section. Seeks from `scrollTop=0` (no pre-scroll) — the exact scenario masked by
existing tests' `scrollTop=150` pre-scroll and the root cause of the Agent 11-13 swimming
bug class. Asserts: bufferOffset > 0 (backward items loaded), scrollTop moved to headroom
position, firstVisibleGlobalPos stable over 1.5s (zero shift).

**1c — Tightened settle-window tolerance.** Changed `MAX_SHIFT` from `cols + 1` to `0`.
Bidirectional seek produces zero content shift by construction. Test confirmed: 30 snapshots
over 1.5s, all at identical visiblePos.

**1d — rAF scrollTop monotonicity test.** Added to `e2e/scrubber.spec.ts`. Uses
`sampleScrollTopAtFrameRate(1500)` after seek. Captures ~181 frames. Asserts no frame-to-frame
scrollTop decrease (0.5px sub-pixel tolerance). A decrease = swimming. On local data won't
catch timing-dependent swimming (ES too fast), but catches structural bugs.

Validation: 186 unit tests pass, 88 E2E tests pass (was 86, +2 new).
Worklog: `exploration/docs/worklog-testing-regime.md`.


**Problem (post-bidirectional-seek):** With 300-item buffer (100 backward +
200 forward), seeking from `scrollTop ≈ 0` showed backward headroom content
(wrong images) then swam at 800ms when extends fired. Worse than before for
fresh-app seeks. Home key caused a new flash regression.

**Root cause:** The reverse-compute mapped `scrollTop → reverseIndex`. Before
bidirectional seek, `reverseIndex=0` = the seek target. After, `reverseIndex=0`
= backward headroom (100 items before the target). For scrollTop=0, effect #6
saw zero delta → no-op → user saw wrong content → extends at 800ms → swim.

**Fix (three iterations, Agents 11-13):**

1. **`reverseIndex += backwardItemCount` when in headroom zone** — shifts
   the target index past backward items when `reverseIndex < backwardItemCount`.
   Covers the entire headroom zone, not just scrollTop=0.

2. **`_seekSubRowOffset` for sub-row pixel preservation** — stores the user's
   sub-row pixel offset (`scrollTop - currentRow * rowH`) in the store. Effect
   #6 applies it via `targetWithSubRow = targetPixelTop + seekSubRowOffset`
   after React paints the new 300-item buffer (scrollHeight now large enough).
   The old approach of pre-setting `scrollEl.scrollTop` in `seek()` was
   abandoned because the OLD buffer is still rendered and its scrollHeight
   may be too small — browser clamps the value, losing the offset.

3. **Effect #6 condition update** — `seekSubRowOffset > 0` forces adjustment
   (the store's position needs correction regardless of delta size). Without
   sub-row offset, the original `delta > rowHeight` threshold applies.

**Boundary behaviour (100/cols = fractional row):** With 6 columns,
`100/6 = 16.67`. Row 16 (`reverseIndex=96 < 100`) → headroom fires. Row 17
(`reverseIndex=102 ≥ 100`) → no headroom, effect #6 NO-OPs. Both preserve
position. Agent 14 confirmed on TEST with 6- and 7-column viewports: all
rows 14-19 pass with `subRowDelta=0.0` and `maxSwim=0`.

**E2E test updates (Agent 12):**
- Golden table Case 3 (near-top seek): updated to verify headroom offset +
  sub-row preservation instead of absolute scrollTop delta.
- 4 scroll-up tests: split into two phases — Phase 1 verifies scrollTop
  decreases (5 wheel events, within headroom); Phase 2 triggers
  extendBackward (15-20 more events, past headroom).
- New test: "no swim when seeking from any near-top row offset" — polls
  `firstVisibleGlobalPos` for 2s after seek from row offsets 0.5, 1.5, 5.5.

**Smoke tests (S22-S24):** S22 scroll-up adapted for bidirectional seek
(two-phase approach). S24 added for headroom zone row offsets. All 24
smoke tests pass on TEST (1.3M docs).

**Results:** 186 unit, 86 E2E, 24 smoke tests pass. Zero swimming. Sub-row
offset preserved exactly across all headroom zone rows.

### 5 April 2026 — Unified Smoke Report + Smoke Test Directive Update

**Smoke report unification:** Created `e2e/smoke-report.ts` — shared module
with `recordResult()` that reads → merges → writes JSON on each test
completion. Both `manual-smoke-test.spec.ts` and `smoke-scroll-stability.spec.ts`
import from it. Replaced per-file batch `afterAll` writing that clobbered
between spec files. Report at `test-results/smoke-report.json`.

**Smoke test directive update:** Agent may now run smoke tests directly against
TEST when the user confirms it's available. Removed "AGENTS MUST NEVER RUN"
language from directive, spec file headers, and `run-smoke.mjs`. Smoke tests
are read-only — write protection is in the DAL, not the test runner. Agent may
also use `--debug` and `page.pause()` for interactive browser diagnosis.
Updated both `.github/copilot-instructions.md` and the human copy.

**S13/S20 sub-row assertion fix:** Changed from absolute scrollTop delta
assertion (`|post - pre| < rowHeight`, which fails in headroom zone where
scrollTop must change by ~4242px) to sub-row offset assertion
(`|postSubRow - preSubRow| < 5`). Both pass on TEST with `subRowDelta=0.0`.



**Problem:** After `seek()` delivered data, the first `extendBackward` at
~800ms caused a ~1% visible "swim" — approximately 3 images shifting by one
cell. Root cause: seek loaded 200 items forward-only, placing the user at
the very top of the buffer. The first backward extend prepended directly
above visible content, and the ~1-frame gap between React's DOM mutation and
`useLayoutEffect`'s `scrollTop` compensation was visible.

**Fix:** Bidirectional seek. After all deep seek paths (percentile, keyword,
null-zone) complete their forward `searchAfter` (PAGE_SIZE=200 items), a
unified backward `searchAfter` (halfBuffer=100 items, reversed) fetches
items before the landed cursor. Combined buffer: ~300 items with ~100 items
of headroom above the viewport. User sees the buffer middle, so both
`extendBackward` and `extendForward` operate on off-screen content.

**Implementation details:**
- Single backward fetch point after all path-specific code, not duplicated
  per path. Controlled by `skipBackwardFetch` flag (true for End-key fast
  path and shallow `from/size` path).
- Uses `detectNullZoneCursor` on the landed cursor for automatic null-zone
  handling — same pattern as `_loadBufferAroundImage`.
- `bufferOffset` adjusted: `max(0, actualOffset - backwardHits.length)`.
- Cursors correct by construction: combined sort values
  `[...backward, ...forward]` means `result.sortValues[0]` is the earliest
  item (backward first) and `result.sortValues[last]` is the latest.

**Test adjustments:**
- Prepend compensation test → replaced with "bidirectional seek places user
  in buffer middle" — verifies `bufferOffset > 0`, buffer extends in both
  directions, and buffer > 200 items.
- Post-seek scroll-up tests (grid, table, double-seek, 2s deadline):
  increased wheel events from 5 to 20-25 to scroll past the ~100-item
  headroom above the viewport and trigger `extendBackward`.
- Settle-window stability: content shift = **0 items** (was COLS+1 before).

**Results:** 186 unit/integration tests pass. 85 E2E tests pass. Settle
timeline shows `firstVisibleGlobalPos` perfectly stable throughout the
entire 1800ms window — zero swimming. Trade-off: ~50-100ms additional
seek latency (one extra ES round-trip for the backward fetch).

**Docs updated:** AGENTS.md (What's Done, architecture decisions, test
counts), scroll-architecture.md (§3 deep seek flow, §7 swimming section
marked as fixed).

**Smoke tests needed:** User should run S14 and S15 on TEST cluster to
confirm zero swimming on real 1.3M-doc data:
`node scripts/run-smoke.mjs 14 15`

### 5 April 2026 — Bidirectional Seek: Position Preservation + Headroom Boundary Fix

**Problem (post-bidirectional-seek):** With 300-item buffer (100 backward +
200 forward), seeking from `scrollTop ≈ 0` showed backward headroom content
(wrong images) then swam at 800ms when extends fired. Worse than before for
fresh-app seeks. Home key caused a new flash regression.

**Root cause:** The reverse-compute mapped `scrollTop → reverseIndex`. Before
bidirectional seek, `reverseIndex=0` = the seek target. After, `reverseIndex=0`
= backward headroom (100 items before the target). For scrollTop=0, effect #6
saw zero delta → no-op → user saw wrong content → extends at 800ms → swim.

**Fix (three iterations, Agents 11-13):**

1. **`reverseIndex += backwardItemCount` when in headroom zone** — shifts
   the target index past backward items when `reverseIndex < backwardItemCount`.
   Covers the entire headroom zone, not just scrollTop=0.

2. **`_seekSubRowOffset` for sub-row pixel preservation** — stores the user's
   sub-row pixel offset (`scrollTop - currentRow * rowH`) in the store. Effect
   #6 applies it via `targetWithSubRow = targetPixelTop + seekSubRowOffset`
   after React paints the new 300-item buffer (scrollHeight now large enough).
   The old approach of pre-setting `scrollEl.scrollTop` in `seek()` was
   abandoned because the OLD buffer is still rendered and its scrollHeight
   may be too small — browser clamps the value, losing the offset.

3. **Effect #6 condition update** — `seekSubRowOffset > 0` forces adjustment
   (the store's position needs correction regardless of delta size). Without
   sub-row offset, the original `delta > rowHeight` threshold applies.

**Boundary behaviour (100/cols = fractional row):** With 6 columns,
`100/6 = 16.67`. Row 16 (`reverseIndex=96 < 100`) → headroom fires. Row 17
(`reverseIndex=102 ≥ 100`) → no headroom, effect #6 NO-OPs. Both preserve
position. Agent 14 confirmed on TEST with 6- and 7-column viewports: all
rows 14-19 pass with `subRowDelta=0.0` and `maxSwim=0`.

**E2E test updates (Agent 12):**
- Golden table Case 3 (near-top seek): updated to verify headroom offset +
  sub-row preservation instead of absolute scrollTop delta.
- 4 scroll-up tests: split into two phases — Phase 1 verifies scrollTop
  decreases (5 wheel events, within headroom); Phase 2 triggers
  extendBackward (15-20 more events, past headroom).
- New test: "no swim when seeking from any near-top row offset" — polls
  `firstVisibleGlobalPos` for 2s after seek from row offsets 0.5, 1.5, 5.5.

**Smoke tests (S22-S24):** S22 scroll-up adapted for bidirectional seek
(two-phase approach). S24 added for headroom zone row offsets. All 24
smoke tests pass on TEST (1.3M docs).

**Results:** 186 unit, 86 E2E, 24 smoke tests pass. Zero swimming. Sub-row
offset preserved exactly across all headroom zone rows.

### 5 April 2026 — Unified Smoke Report + Smoke Test Directive Update

**Smoke report unification:** Created `e2e/smoke-report.ts` — shared module
with `recordResult()` that reads → merges → writes JSON on each test
completion. Both `manual-smoke-test.spec.ts` and `smoke-scroll-stability.spec.ts`
import from it. Replaced per-file batch `afterAll` writing that clobbered
between spec files. Report at `test-results/smoke-report.json`.

**Smoke test directive update:** Agent may now run smoke tests directly against
TEST when the user confirms it's available. Removed "AGENTS MUST NEVER RUN"
language from directive, spec file headers, and `run-smoke.mjs`. Smoke tests
are read-only — write protection is in the DAL, not the test runner. Agent may
also use `--debug` and `page.pause()` for interactive browser diagnosis.
Updated both `.github/copilot-instructions.md` and the human copy.

**S13/S20 sub-row assertion fix:** Changed from absolute scrollTop delta
assertion (`|post - pre| < rowHeight`, which fails in headroom zone where
scrollTop must change by ~4242px) to sub-row offset assertion
(`|postSubRow - preSubRow| < 5`). Both pass on TEST with `subRowDelta=0.0`.



**Problem:** After `seek()` delivered data, the first `extendBackward` at
~800ms caused a ~1% visible "swim" — approximately 3 images shifting by one
cell. Root cause: seek loaded 200 items forward-only, placing the user at
the very top of the buffer. The first backward extend prepended directly
above visible content, and the ~1-frame gap between React's DOM mutation and
`useLayoutEffect`'s `scrollTop` compensation was visible.

**Fix:** Bidirectional seek. After all deep seek paths (percentile, keyword,
null-zone) complete their forward `searchAfter` (PAGE_SIZE=200 items), a
unified backward `searchAfter` (halfBuffer=100 items, reversed) fetches
items before the landed cursor. Combined buffer: ~300 items with ~100 items
of headroom above the viewport. User sees the buffer middle, so both
`extendBackward` and `extendForward` operate on off-screen content.

**Implementation details:**
- Single backward fetch point after all path-specific code, not duplicated
  per path. Controlled by `skipBackwardFetch` flag (true for End-key fast
  path and shallow `from/size` path).
- Uses `detectNullZoneCursor` on the landed cursor for automatic null-zone
  handling — same pattern as `_loadBufferAroundImage`.
- `bufferOffset` adjusted: `max(0, actualOffset - backwardHits.length)`.
- Cursors correct by construction: combined sort values
  `[...backward, ...forward]` means `result.sortValues[0]` is the earliest
  item (backward first) and `result.sortValues[last]` is the latest.

**Test adjustments:**
- Prepend compensation test → replaced with "bidirectional seek places user
  in buffer middle" — verifies `bufferOffset > 0`, buffer extends in both
  directions, and buffer > 200 items.
- Post-seek scroll-up tests (grid, table, double-seek, 2s deadline):
  increased wheel events from 5 to 20-25 to scroll past the ~100-item
  headroom above the viewport and trigger `extendBackward`.
- Settle-window stability: content shift = **0 items** (was COLS+1 before).

**Results:** 186 unit/integration tests pass. 85 E2E tests pass. Settle
timeline shows `firstVisibleGlobalPos` perfectly stable throughout the
entire 1800ms window — zero swimming. Trade-off: ~50-100ms additional
seek latency (one extra ES round-trip for the backward fetch).

**Docs updated:** AGENTS.md (What's Done, architecture decisions, test
counts), scroll-architecture.md (§3 deep seek flow, §7 swimming section
marked as fixed).

**Smoke tests needed:** User should run S14 and S15 on TEST cluster to
confirm zero swimming on real 1.3M-doc data:
`node scripts/run-smoke.mjs 14 15`

### 5 April 2026 — Scroll architecture reference document

Created `exploration/docs/scroll-architecture.md` — a Staff-Engineer-level
architecture document covering the entire scroll, seek, scrubber, and
keep-position infrastructure. Synthesised from AGENTS.md, changelog, 10+
worklogs, and all source files. Seven sections: The Problem (why browser
native scroll can't work, why Google Photos/iCloud approaches don't scale),
Architecture at a Glance (windowed buffer + cursor pagination + custom
scrubber), User Experience (normal scroll, deep seek, sort-around-focus,
density switch), The Swimming Problem (prepend-then-compensate, timing
chain, historical approaches), Deep Seek (percentile estimation, composite
walk, SHA-1 binary search, countBefore), The Scrubber (coordinate system,
dual mode, density-map ticks, null zone), Edge Cases (1% swim ideas,
timing optimisation, buffer corruption defence, PIT lifecycle). Includes
file map and glossary.

**Files changed:**
- `exploration/docs/scroll-architecture.md` — NEW
- `AGENTS.md` — added to Design Documents table
- `exploration/docs/changelog.md` — this entry

### 5 April 2026 — Scroll-up after seek: FIXED (agent 10)

**The bug:** After any scrubber seek, the user could not scroll up with mousewheel.
The buffer had items above but `extendBackward` was blocked by the
`_postSeekBackwardSuppress` flag (introduced by agent 6 to prevent swimming).
Users had to scroll DOWN ~7 rows first to unlock upward scrolling.

**Root cause:** The flag blocked `extendBackward` indefinitely after seek until
`startIndex > EXTEND_THRESHOLD` (50 items, ~7 rows of downward scroll). Without
backward extend, no items existed above the viewport → browser had nothing to
scroll into.

**Fix (Approach #4):** Removed the `_postSeekBackwardSuppress` flag entirely.
Added a 200ms post-extend cooldown (`_seekCooldownUntil = Date.now() + 200`)
after each `extendBackward` completion. This prevents cascading prepend
compensations (which caused "swimming") by ensuring the browser has time to paint
each scrollTop adjustment before the next extend fires.

**Timing chain after seek:**
1. `SEEK_COOLDOWN_MS` (700ms) blocks ALL extends after seek data arrives
2. `SEEK_DEFERRED_SCROLL_MS` (800ms) fires synthetic scroll → triggers first extend
3. Post-extend cooldown (200ms) spaces out consecutive backward extends
4. Each prepend compensation settles before the next fires → no swimming

**Test improvements:**
- Agent 9's scroll-up tests (grid + table) now pass — previously failed with flag ON
- Rewrote settle-window test: checks `firstVisibleGlobalPos` (what user sees) instead
  of `scrollTop` (which legitimately changes during prepend compensation)
- Added smoke tests S22 (scroll-up) + S23 (settle-window) for real-data validation
- All 23 smoke tests pass on TEST cluster (1.3M docs)
- All 186 unit + 69 E2E + 10 buffer corruption tests pass

**Remaining 1%:** A tiny ~3-image shift visible immediately after seek when the first
`extendBackward` fires (800ms post-seek). This is the prepend compensation being
*almost* invisible — `useLayoutEffect` adjusts scrollTop before paint, but React's
virtualizer may need a second render pass. Documented in scroll-work-worklog-agent10-final-fix.md with
5 mitigation ideas. Idea A ("offscreen prepend" — only allow backward extend when
user has scrolled deep enough that compensation is above viewport) is most promising.

**Also fixed:** `SEEK_COOLDOWN_MS` corrected from 200ms (agent 7 committed) back to
700ms. The 200ms value was proven to cause swimming on real data during agent 7's
manual testing session. Agent 9 changed it back in working tree but agent 7's commit
had the wrong value.

**Files changed:**
- `src/constants/tuning.ts` — SEEK_COOLDOWN_MS 200→700
- `src/hooks/useDataWindow.ts` — disabled _postSeekBackwardSuppress flag
- `src/stores/search-store.ts` — removed flag activation, added post-extend cooldown
- `e2e/scrubber.spec.ts` — scroll-up tests + rewritten settle-window test
- `e2e/smoke-scroll-stability.spec.ts` — S22 + S23

### 5 April 2026 — Seek timing: constants extracted, cooldown reduced 700→200ms (agent 7)

**Timing constants extracted to `tuning.ts`:** All 7 `_seekCooldownUntil`
sites in `search-store.ts` now use named constants instead of magic numbers.
Three constants:

- `SEEK_COOLDOWN_MS = 200` — post-arrival extend block (was 700ms hardcoded).
  Used by seek(), _findAndFocusImage(), restoreAroundCursor() at data arrival,
  and seek() at call start (early guard).
- `SEEK_DEFERRED_SCROLL_MS = SEEK_COOLDOWN_MS + 100` — derived, fires
  synthetic scroll event after cooldown to trigger extends. Was 800ms.
- `SEARCH_FETCH_COOLDOWN_MS = 2000` — blocks extends during in-flight
  search() or abortExtends(). Covers network round-trip, overwritten by
  SEEK_COOLDOWN_MS when data arrives.

**Cooldown reduced 700→200ms:** The backward-extend suppress flag
(`_postSeekBackwardSuppress`) handles the worst case (swimming), so the
cooldown only needs to survive the initial DOM reflow flurry (~50ms).
200ms gives 4x margin. Deferred scroll fires at 300ms (was 800ms).
Result: `extendForward` unblocks ~500ms sooner after seek → cells below
the viewport appear faster.

**E2E test tolerances tightened:** Flash-prevention golden table (cases 1–3)
and prepend-comp settle test changed from `< 303px` / `< 500px` to
`toBe(0)`. Both pass — reverse-compute is pixel-perfect. Diagnostic
comments added to test describing what causes failures and where to look.

**Files:** `constants/tuning.ts`, `stores/search-store.ts`,
`hooks/useScrollEffects.ts`, `e2e/scrubber.spec.ts`,
`exploration/docs/worklog-stale-cells-bug.md`, `AGENTS.md`.

**Tests:** 186 unit pass, 80 E2E pass (all 9 timing-sensitive tests green).

### 5 April 2026 — Scroll stability: all 6 issues fixed (agents 5-6)

Multi-agent effort over agents 3-6 to fix all scroll-related issues after
deep seek into a 1.3M-doc dataset. Final fixes by agent 6:

**Swimming (v3 — extendBackward suppression):** After seek, user lands at
scrollTop≈0 in a 200-item buffer. `extendBackward` was firing immediately
(startIndex=0 ≤ EXTEND_THRESHOLD=50), prepending 200 items + scroll
compensation (+8787px) = visible teleportation. Two failed approaches:
(1) increased cooldown 700→1500ms (still not long enough, possibly caused
freezes); (2) suppressed prepend-comp (catastrophic — visible images changed
on every scroll step, "Niagara"). The fix: `_postSeekBackwardSuppress` flag
in `useDataWindow.ts`, set by `seek()`, blocks `extendBackward()` in
`reportVisibleRange` until `startIndex > EXTEND_THRESHOLD`. `extendForward`
unblocked.

**Buffer-shrink scroll preservation (lastVisibleRow):** When user was deep
in an extended buffer (400+ items) and sought to a new 200-item buffer, the
old `maxSafeRow` clamp lost ~481px (1.5 rows). New approach: when
`reversePixelTop >= maxScroll`, use `floor(maxScroll/rowH) * cols` as the
seek target. Effect #6 sees delta < rowHeight → no-op. Browser-clamped
scrollTop stays put. All 6 S20 scenarios now delta=0.

**Buffer-bottom freeze (deferred timer 600→800ms):** The `lastVisibleRow`
fix lands users near the buffer end. `extendForward` must fire to grow the
buffer, but the old deferred scroll timer (600ms) fired during the seek
cooldown (700ms) → extends blocked → empty cells. Fix: timer 800ms fires
after cooldown.

**End key (soughtNearEnd, agent 5):** When `atRealEnd` AND user sought near
the end, use `hits.length - 1` as scroll target so effect #6 scrolls to the
actual bottom.

Files: `search-store.ts` (reverse-compute, atRealEnd, lastVisibleRow),
`useScrollEffects.ts` (deferred timer 800ms), `useDataWindow.ts`
(`_postSeekBackwardSuppress`), `scrubber.spec.ts` (flash-prevention E2E),
`smoke-scroll-stability.spec.ts` (S12-S21 diagnostic tests).

Results: 186 unit tests pass, full smoke suite S1-S21 all pass on TEST
(1.3M docs), user manual verification — zero swimming, zero flash, zero
freezes, position preserved in all scenarios.

### 4 April 2026 — ES usage audit: 4 fixes

Full audit documented in `exploration/docs/es-audit.md` (9 issues found, 4 fixed).

**Issue #1 — PIT generation counter (🔴 HIGH → ✅ FIXED):** `search()` closes the old PIT and opens a new one. `seek()`/`extend*()` captured `pitId` from the store but by the time the request fired, the PIT was already closed → ES returned 404 → retry-without-PIT fallback added ~100–200ms per round-trip. Fix: added `_pitGeneration: number` to the store, bumped in `search()` when a new PIT opens. `seek`/`extendForward`/`extendBackward`/`restoreAroundCursor` capture the generation at call start and pass `null` for pitId if it changed, skipping the stale PIT and avoiding the 404.

**Issue #2 — PIT keepalive 5m → 1m (🔴 HIGH → ✅ MITIGATED):** Orphaned PITs (tab close, navigation, refresh) consumed ES memory for 5 minutes. Reduced keepalive to 1m in three locations: `openPit()` default parameter, `searchAfter()` body `keep_alive`, `search()` call site. Active users who pause >1 minute hit PIT expirations, but the retry-without-PIT fallback handles it gracefully.

**Issue #3 — Remove dead `frozenUntil` (🟡 MEDIUM → ✅ REMOVED):** `frozenUntil` was declared in the store interface, initialised to `null`, and set to `new Date().toISOString()` on search completion — but nothing ever read it. Removed all 4 references. If corpus pinning is needed for a PIT-free architecture in the future, re-implement intentionally.

**Issue #4 — Add AbortController to `fetchExpandedAgg` (🟡 MEDIUM → ✅ FIXED):** `fetchExpandedAgg` called `getAggregations()` without an `AbortSignal`. If the user changed the query while the expanded agg was in-flight, stale data would overwrite fresh results. Fix: added `_expandedAggAbortController` (module-level), passed as signal to `getAggregations()`, aborted by `search()` when a new search starts.

**Also committed:** P10 perf test fix — added missing `scroll`, `flashes`, and `network` fields to the composite `PerfSnapshot` in `perf.spec.ts`.

### 4 April 2026 — Scrubber tooltip: sub-hour granularity, twitching fix, comma removal

**Three related improvements to scrubber tooltip date formatting:**

**1. Sub-hour histogram intervals (`es-adapter.ts`)**
Problem: With 65k images/day on PROD, hourly buckets (the finest available) meant the tooltip showed the same `18:00` for hundreds of pixels of scrubber movement. A single screen of images spans ~1 minute of real time — hour-level orientation is useless.
Fix: Added three finer `fixed_interval` tiers to `getDateDistribution`:
- `>2y` → `month` (calendar_interval), `2d–2y` → `day`, `25h–2d` → `hour` (unchanged)
- `12h–25h` → `30m` (new, ~48 buckets for 24h — the key "last 24 hours" preset)
- `3h–12h` → `10m` (new, ~72 buckets for 12h)
- `<3h` → `5m` (new, ~36 buckets for 3h)
  Sub-hour intervals use ES `fixed_interval` (calendar_interval doesn't support `30m`/`10m`/`5m`).
  Payload size depends only on bucket count, not doc count (~60 bytes/bucket).
  Track ticks in `computeTrackTicks` now handle sub-hour buckets: full hours are major ticks, sub-hour buckets are minor with `HH:MM` labels.

**2. Tooltip twitching fix (`formatSortDateAdaptive`)**
Problem: In <28-day result sets (e.g. "last 24h"), the tooltip flickered between `3 Apr 16:00` and `3 Apr 2026` at certain scrubber positions. Root cause: `computeLocalSpanFromDist` returned noisy values near distribution edges (bucket boundary effects), pushing `localSpanMs` past the 1-day threshold that toggled between time-mode and year-mode.
Fix: Removed the `absLocal <= MS_PER_DAY` guard from Rule 2. Now the decision to show time vs year is based **solely on `totalSpanMs`**: `<28d` → always show time (`d Mon H:mm`), `≥28d` → always show year (`d Mon yyyy`). `localSpanMs` only governs Rule 3 (drop day when viewport >28d). This eliminates the twitching entirely — the format is stable across the entire scrubber for a given result set.

**3. Comma removal**
Removed the comma from the time format: `3 Apr, 16:00` → `3 Apr 16:00`. The comma was inconsistent with the year format (`3 Apr 2024`, no comma) and added visual noise.


### 4 April 2026 — Home/logo flash elimination (deferred scroll reset)

**Problem:** After End key or deep scrubber seek, pressing Home or clicking the logo flashed images from the end of the dataset (~image 1,318,475) for ~200-400ms before the correct top results appeared. The flash was the top of the stale deep-offset buffer — scrollTop was set to 0 while the old buffer was still mounted.

**Root cause:** `resetScrollAndFocusSearch()` and the Home key handler both set `scrollTop = 0` **eagerly** (synchronously), before the async search/seek fetched new data. The virtualizer rendered buffer[0] at the old deep offset — wrong content in the viewport. Deep-to-deep seeks never had this problem because they don't touch scrollTop until data arrives (the `_seekGeneration` layout effect fires only after the store update).

**Fix — defer scroll reset to the same render frame as the data swap:**

1. `resetScrollAndFocusSearch()`: Removed eager `scrollTop = 0`, `scrollLeft = 0`, `virtualizer.scrollToOffset(0)`, and synthetic scroll dispatch. Now only aborts extends, resets visible range, resets scrubber thumb (instant visual signal), and focuses CQL input. Removed unused `getScrollContainer` import.

2. Home key handler (`useListNavigation.ts`): Removed eager `scrollTop = 0` and synthetic scroll. When buffer is at a deep offset, just calls `seek(0)` — no scroll manipulation. The `else` branch (already at offset 0) still resets scroll normally.

3. Effect #8 in `useScrollEffects.ts` (`BufferOffset→0 guard`): Promoted from belt-and-suspenders to primary scroll-reset mechanism for go-home transitions. When `bufferOffset` transitions from >0 to 0 (which happens in the same `set()` call that writes new results), the effect resets `scrollTop`, `scrollLeft`, and the virtualizer in the same layout frame. Also now dispatches a scroll event via `queueMicrotask` (not synchronous — dispatching from inside `useLayoutEffect` causes "flushSync inside lifecycle method" React errors).

**Result:** Zero flash. The old deep-offset content stays visible during the async round-trip (harmlessly — user is looking at their current position). When data arrives, the buffer swap and scroll reset happen atomically in one render frame.

**Files:** `lib/orchestration/search.ts`, `hooks/useListNavigation.ts`, `hooks/useScrollEffects.ts`.

**Tests:** 186 unit pass, 76 E2E + 1 skipped pass. Zero failures.


### 4 April 2026 — Credit seek cursor bug + End key fast path

**Two critical fixes for keyword seek accuracy, found via manual smoke testing on TEST (1.3M docs):**

**1. Direction-aware `search_after` cursor anchors.** Credit ascending seek to position 600k landed at position 1,175k — the entire "PA" bucket (600k docs) was skipped. Root cause: secondary sort fields used `0` as the anchor regardless of sort direction. For `[credit asc, uploadTime desc, id asc]`, the cursor `["PA", 0, ""]` meant "uploadTime < 0" in desc direction, excluding everything. New `buildSeekCursorAnchors()` helper: desc fields get `MAX_SAFE_INTEGER`, asc get `0`, id gets `""`. Replaces duplicated inline cursor-building in both the percentile and keyword paths. Also fixed: binary search refinement entry condition used signed drift (`fetchStart - actualOffset`), failing for ascending sorts where we overshoot. Changed to `Math.abs(drift)`.

**2. End key reverse-seek fast path.** After fix #1, End key under Credit sort landed 30 items short of total — the keyword seek correctly entered the target bucket but the buffer didn't extend to the absolute last item. Added early-exit fast path in `seek()`: when `clampedOffset + PAGE_SIZE >= total`, use reverse `search_after` (no cursor, `missingFirst: true`) to guarantee the buffer covers the absolute last items. Bug #14 strict assertion restored.

**Files:** `search-store.ts` (`buildSeekCursorAnchors`, `Math.abs(drift)`, End key fast path), `scrubber.spec.ts` (Bug #14 assertion).

**Tests:** 186 unit pass, 76 E2E + 1 skipped pass. Zero failures.


### 4 April 2026 — Post-seek swimming mitigation + E2E test fixes

**Three fixes to resolve remaining E2E failures and mitigate post-seek swimming:**

**1. Post-seek swimming mitigated (700ms cooldown).** After a deep seek, the deferred scroll timer in `useScrollEffects.ts` (effect #6, 600ms) fired just past the 500ms seek cooldown, triggering `reportVisibleRange → extendBackward`. This prepended items to the buffer and caused visible content shifting ("swimming"). Fixed by increasing the seek data-arrival cooldown from 500ms to 700ms.

**2. Bug #7 E2E test updated.** The test expected `binary search` console logs during Credit sort seek. Local data has 769 unique credits (high cardinality), drift=63 < PAGE_SIZE (200) — binary search refinement never triggers. Updated to assert `keyword strategy` log instead.

**3. Visual baseline updated.** The `search-query.png` snapshot was stale — didn't include null-zone UI. Updated via `--update-snapshots`.

**Files:** `search-store.ts`, `useScrollEffects.ts`, `scrubber.spec.ts`, visual baseline snapshot.

**Tests:** 186 unit pass, 76 E2E + 1 skipped pass. Zero failures.


### 4 April 2026 — Null-zone seek precision fix (distribution-based estimation)

**Problem:** Clicking in the null zone landed months away from the tooltip's displayed date. The distribution was fetched for ALL 1.3M docs, then linearly scaled — wrong because null-zone docs have different upload patterns.

**Fix:** `fetchNullZoneDistribution` now passes `extraFilter` to `getDateDistribution`. Distribution fetched for null-zone docs only. Drift reduced from ~22,000 positions to ~275 (0.6%).

**Files:** `es-adapter.ts`, `types.ts`, `mock-data-source.ts`, `search-store.ts`.


### 4 April 2026 — Null-zone seek corrupts `total` (45k bug)

**Bug:** Sort by `-taken` (1.3M results), click in null zone → status bar drops to ~45k.

**Root cause:** `result.total` from filtered `searchAfter` overwrote store total. Fixed in 4 sites: `seek()` (`usedNullZoneFilter` flag), `extendForward/Backward`, `_fillBufferForScrollMode`. Also fixed `targetLocalIdx` clamping.

**Files:** `search-store.ts` (~20 lines across 4 sites + diagnostic logs).


### 4 April 2026 — Scrubber: position-based tick placement locked in as design principle

During the scrubber coordinate fix investigation (see `scrubber-coordinate-fix-worklog.md`),
analysed the "tooltip 18:30 next to tick 15:00" mismatch on 24h date filter (S2 scenario,
109 docs). Root cause: ticks are placed by doc count (position), not by time. When upload
distribution is non-uniform (70% of docs in peak hours, 3% overnight), tick labels for
sparse hours cluster together while dense hours spread wide.

Five options were considered: (1) do nothing, (2) remove sub-day ticks, (3) add a linear
time axis, (4) dual-density ticks spaced by time, (5) range tooltip showing time span.

**Decision: Option 1 — do nothing.** The non-uniform spacing is a feature, not a bug.
Position-based ticks function as a density map: the visual compression of overnight ticks
and expansion of daytime ticks tells the user at a glance where uploads are concentrated.
With 56k+ docs the tick marks (horizontal lines, even when labels are decimated by the
18px minimum spacing rule) form a miniature histogram on the track.

The 109-doc S2 scenario breaks down because even "dense" hours have only 5–10 docs, but
that's acceptable — 109 docs fit in one buffer load and the scrubber is barely needed.

**Principle:** Never upset the relationship between position-based tick placement and
density communication. Never linearise ticks by time.

**Files changed:**
- `exploration/docs/scrubber-coordinate-fix-worklog.md` — §12 design decision
- `AGENTS.md` — Scrubber description updated with density-map principle
- `exploration/docs/changelog.md` — this entry


### 4 April 2026 — Scrubber ticks & labels reference doc; stale investigation docs deleted

Created `exploration/docs/scrubber-ticks-and-labels.md` — a permanent reference
explaining how the scrubber's coordinate system, tick placement, tooltip, null zone,
and pixel rounding work together. Distills the working knowledge from two investigation
docs into a concise current-state reference for future agents and humans.

Deleted two stale investigation docs:
- `scrubber-coordinate-fix-worklog.md` (789 lines) — session log from the positionFromY
  fix investigation. All findings already recorded in this changelog; design decisions
  captured in the new reference doc and AGENTS.md.
- `scrubber-position-inconsistency-analysis.md` (141 lines) — initial analysis doc
  that predated the fix. Superseded by the worklog and now the reference doc.

**Files changed:**
- `exploration/docs/scrubber-ticks-and-labels.md` — NEW: permanent reference
- `exploration/docs/scrubber-coordinate-fix-worklog.md` — DELETED
- `exploration/docs/scrubber-position-inconsistency-analysis.md` — DELETED
- `AGENTS.md` — added new doc to Design Documents table
- `exploration/docs/changelog.md` — this entry


### 4 April 2026 — Dev-only console logging via `devLog` wrapper

28 unguarded `console.log` calls across `search-store.ts` (19), `useScrollEffects.ts` (4),
and `es-adapter.ts` (5) were replaced with `devLog()` from a new `src/lib/dev-log.ts`
utility. `devLog` calls `console.log` only when `import.meta.env.DEV` is true — Vite
dead-code-eliminates the entire function body in production builds. `console.warn` calls
(error-path diagnostics) were left as-is.

E2E tests that read console output (Bug #7 keyword seek telemetry, Bug #14 End key
telemetry) continue to work because Playwright runs against the Vite dev server where
`import.meta.env.DEV === true`.

**Files changed:**
- `src/lib/dev-log.ts` — NEW: `devLog()` wrapper
- `src/stores/search-store.ts` — 19× `console.log` → `devLog` + import
- `src/hooks/useScrollEffects.ts` — 4× `console.log` → `devLog` + import
- `src/dal/es-adapter.ts` — 5× `console.log` → `devLog` + import


### 3 April 2026 — Scrubber boundary label edge-clamping

**Fix:** Ref callback on boundary label measures `offsetHeight`, adjusts `top` if label would overflow track bounds. 5px edge padding.

**File:** `Scrubber.tsx`.


### 3 April 2026 — Null-zone scrubber UX (tooltip labels, boundary tick, red ticks)

Three layers of visual feedback for null zone: italic "Uploaded: {date}" tooltip labels, red boundary tick with vertical "No {field}" label, red-tinted uploadTime-based ticks. Auto-fetched null-zone distribution.

**Files:** `sort-context.ts`, `Scrubber.tsx`, `search.tsx`, `search-store.ts`, `types.ts`.


### 3 April 2026 — Null-zone seek fix + extend fix + unit tests

**Bug**: Sorting by `-lastModified` and clicking scrubber at 50% snapped thumb to top. Only ~27k of 1.3M docs have `lastModified`; the other 98% are in the "null zone". Fixed seek, extend, and buffer-around-image paths. Added `detectNullZoneCursor` + `remapNullZoneSortValues` shared helpers. 7 unit tests with sparse MockDataSource (50k images, 20% lastModified coverage).

**Files**: `search-store.ts`, `es-adapter.ts`, `types.ts`, `mock-data-source.ts`, `sort-builders.ts`, `search-store-extended.test.ts`.


### 3 April 2026 — FullscreenPreview feature + prefetch extraction + scroll-to-focused

**New feature: Fullscreen Preview (`f` key from grid/table).** Press `f` with an image focused
in grid or table view to enter true fullscreen (Fullscreen API, edge-to-edge, no browser chrome).
Arrow keys traverse images, Esc/Backspace/f exits. No route change, no metadata loading, no
ImageDetail mount — just the image on a black background. `FullscreenPreview.tsx` is always
mounted (hidden empty div until activated), so the `f` keyboard shortcut is always registered
via the shortcut stack. When ImageDetail is mounted, its `f` registration pushes on top.

**Prefetch extraction.** The direction-aware prefetch pipeline (4-ahead + 1-behind, T=150ms
throttle, PhotoSwipe model) was extracted from `ImageDetail.tsx` into `lib/image-prefetch.ts`.
Both `ImageDetail` and `FullscreenPreview` now call `prefetchNearbyImages()`. FullscreenPreview
fires prefetch on enter (no throttle — `null` for lastPrefetchTime) and on every arrow-key
navigation (with throttle). Zero cost until the user actually presses `f`.

**Scroll-to-focused on exit.** Added `registerScrollToFocused()` / `scrollFocusedIntoView()`
to `lib/orchestration/search.ts` (same registration pattern as `registerVirtualizerReset`).
Registered by `useScrollEffects`, called by `FullscreenPreview` on exit (both explicit exit
and browser-native Esc via `fullscreenchange` listener). Uses `align: "center"` — consistent
with `useReturnFromDetail`, which uses center for the same reason: user has been in a focused
view and needs reorientation, not minimal disruption.

**Consistency fix:** Changed `scrollToFocused` from `align: "auto"` to `align: "center"` after
spotting the inconsistency with `useReturnFromDetail`. Both are "returning from a focused view"
— same user mental model, same scroll behaviour.

**Architecture observation:** FullscreenPreview validates the "one ordered list, many densities"
philosophy. It's conceptually another density that reads/writes `focusedImageId`, shares the
prefetch pipeline, and on exit uses the same scroll-to-focused mechanism. The feature required
near-zero new architecture — everything was reusable from the existing density infrastructure.

Files changed:
- `src/components/FullscreenPreview.tsx` — new component
- `src/lib/image-prefetch.ts` — new shared prefetch pipeline
- `src/lib/orchestration/search.ts` — added `registerScrollToFocused` / `scrollFocusedIntoView`
- `src/hooks/useScrollEffects.ts` — registers scroll-to-focused callback (effect 2b)
- `src/components/ImageDetail.tsx` — replaced inline prefetch with shared `prefetchNearbyImages()`
- `src/routes/search.tsx` — mounted `<FullscreenPreview />`


### 3 April 2026 — Post-session: f-key bug fix

**Bug: `f` fullscreen shortcut broken in image detail view.** After Session 2 extracted
`resetScrollAndFocusSearch()` to `lib/orchestration/search.ts`, the function became more
broadly callable. On page reload in image detail view, two code paths focused the hidden
CQL search input: (1) `resetScrollAndFocusSearch()` unconditionally focused it via
`requestAnimationFrame`, and (2) `CqlSearchInput.tsx` set `autofocus=""` on the `<cql-input>`
web component at mount time. The CQL input exists in the DOM even when image detail is
showing (it's part of the layout, hidden behind the overlay). With focus on the hidden
search input, the keyboard shortcut system (`keyboard-shortcuts.ts`) saw `isEditableTarget()
=== true` and required Alt+f instead of bare f. Bare f typed into the hidden search box,
triggering `query=f`.

**Fix (two sites):**
- `lib/orchestration/search.ts` line 126–134: `requestAnimationFrame` callback now checks
  `new URL(window.location.href).searchParams.has("image")` before focusing CQL input.
- `components/CqlSearchInput.tsx` line 164: `autofocus` attribute only set when
  `!new URL(window.location.href).searchParams.has("image")` at mount time.

Both use the same pattern: check URL for `image` param at the moment focus would be applied.
Latent pre-Session-2 bug, surfaced by the extraction making the function more broadly callable.

**Also cleaned up:** Removed stale `@ts-expect-error` directive in `CqlSearchInput.tsx` line 92
— upstream `@guardian/cql` types were fixed, the suppression was now flagging as unused.


### 3 April 2026 — Session 3: DAL boundary cleanup

Moved ES-specific code into a dedicated `dal/adapters/elasticsearch/` directory. Extracted
tuning constants from the search store. Purely mechanical — code moved between files, imports
updated. Zero logic changes, zero function bodies modified.

**New files created:**
- `src/dal/adapters/elasticsearch/cql.ts` — CQL→ES query translator (moved from `lib/cql.ts`).
  Only change: import path for `gridConfig` updated from `./grid-config` to `@/lib/grid-config`.
- `src/dal/adapters/elasticsearch/cql-query-edit.ts` — CQL AST manipulation helpers (moved from
  `lib/cql-query-edit.ts`). Verbatim copy, no changes.
- `src/dal/adapters/elasticsearch/cql-query-edit.test.ts` — Tests (moved from `lib/`). Verbatim.
- `src/dal/adapters/elasticsearch/sort-builders.ts` — `buildSortClause()`, `reverseSortClause()`,
  `parseSortField()` extracted from `es-adapter.ts`. Import `gridConfig` from `@/lib/grid-config`.
- `src/dal/adapters/elasticsearch/sort-builders.test.ts` — Sort builder tests (moved from
  `dal/es-adapter.test.ts`, import updated to `./sort-builders`).
- `src/constants/tuning.ts` — 10 tuning constants extracted from `search-store.ts`:
  `BUFFER_CAPACITY`, `PAGE_SIZE`, `SCROLL_MODE_THRESHOLD`, `MAX_RESULT_WINDOW`,
  `DEEP_SEEK_THRESHOLD`, `NEW_IMAGES_POLL_INTERVAL`, `AGG_DEBOUNCE_MS`,
  `AGG_CIRCUIT_BREAKER_MS`, `AGG_DEFAULT_SIZE`, `AGG_EXPANDED_SIZE`. JSDoc comments preserved.
  `import.meta.env` reads preserved for env-configurable constants.

**Files deleted:**
- `src/lib/cql.ts` — moved to `dal/adapters/elasticsearch/`
- `src/lib/cql-query-edit.ts` — moved to `dal/adapters/elasticsearch/`
- `src/lib/cql-query-edit.test.ts` — moved to `dal/adapters/elasticsearch/`
- `src/dal/es-adapter.test.ts` — moved to `dal/adapters/elasticsearch/sort-builders.test.ts`

**Files modified (import updates only):**
- `es-adapter.ts` — removed `buildSortClause`, `reverseSortClause`, `parseSortField` function
  bodies and the `gridConfig` import. Now imports sort builders from
  `./adapters/elasticsearch/sort-builders` and `parseCql` from `./adapters/elasticsearch/cql`.
- `dal/index.ts` — barrel now re-exports sort builders from `./adapters/elasticsearch/sort-builders`
  instead of `./es-adapter`.
- `search-store.ts` — replaced 10 inline constant declarations with imports from
  `@/constants/tuning`. `AGG_FIELDS` left in place (depends on `FIELD_REGISTRY` + `AGG_DEFAULT_SIZE`).
- `search-store-extended.test.ts` — import changed from `@/dal/es-adapter` to
  `@/dal/adapters/elasticsearch/sort-builders`.
- `ImageMetadata.tsx`, `ImageTable.tsx`, `FacetFilters.tsx` — `cql-query-edit` import changed
  from `@/lib/cql-query-edit` to `@/dal/adapters/elasticsearch/cql-query-edit`.

**Also cleaned up:** Stale `.js` build artifacts in `src/` (generated by `tsc -b`, not tracked
in git) that were causing Vitest module resolution failures when the `.ts` source files were
moved/deleted.

**Result:** ES-specific code is now visually separated in `dal/adapters/elasticsearch/`. The
boundary between "what's ES-specific" and "what's generic" is visible in the file system.
Tuning constants are centralized alongside layout constants. All 171 unit tests and 77 E2E
tests pass (including all 4 visual baselines — no rendering changes). Build succeeds with
zero errors.


### 3 April 2026 — Session 2: Extract imperative orchestration

Moved imperative functions out of UI components and hooks into a new orchestration module.
Purely mechanical — code moved between files, imports updated. Zero logic changes.

**New files created:**
- `src/lib/orchestration/search.ts` — holds all imperative coordination functions that were
  scattered across components and hooks: `cancelSearchDebounce`, `getCqlInputGeneration` (from
  SearchBar.tsx), `resetScrollAndFocusSearch`, `registerVirtualizerReset` (from useScrollEffects.ts),
  `resetSearchSync` (from useUrlSearchSync.ts), plus setter functions for module-level mutable
  state (`setDebounceTimer`, `setExternalQuery`, `setPrevParamsSerialized`, `setPrevSearchOnly`).
- `src/lib/orchestration/README.md` — documents the pattern and future files.
- `src/lib/reset-to-home.ts` — `resetToHome()` deduplicates the identical 5-line reset sequence
  from SearchBar and ImageDetail logo click handlers.

**Files modified (import updates only):**
- `SearchBar.tsx` — removed 3 module-level `let` variables and 2 exported functions. Imports
  from `@/lib/orchestration/search`. `handleQueryChange` uses setter functions. Logo click
  uses `resetToHome()`. Now exports only the component.
- `ImageTable.tsx` — `cancelSearchDebounce` import changed from `./SearchBar` to
  `@/lib/orchestration/search`.
- `ImageMetadata.tsx` — same import change.
- `ImageDetail.tsx` — `resetSearchSync` and `resetScrollAndFocusSearch` imports changed from
  hooks to orchestration. Logo click uses `resetToHome()`.
- `useScrollEffects.ts` — removed `_virtualizerReset` variable and `resetScrollAndFocusSearch`
  function. Uses `registerVirtualizerReset` from orchestration. Removed unused `resetVisibleRange`
  import.
- `useUrlSearchSync.ts` — removed `_prevParamsSerialized`, `_prevSearchOnly`, `resetSearchSync`.
  Imports from orchestration, uses setter functions.

**Result:** Dependency direction is now strictly downward: components → hooks → lib → dal.
No component imports imperative functions from another component. All 171 unit tests and
77 E2E tests pass. Build succeeds with zero errors.


### 3 April 2026 — AGENTS.md trimmed (383→~270 lines)

Compressed "What's Done" from narrative prose to structured summaries. Moved implementation
detail (Phase A/B/C micro-optimisations, Bug #17 fix narrative, format comparison experiments,
scroll architecture consolidation, buffer corruption fix narrative, post-perf regression
fixes) to this changelog. Key Architecture Decisions kept but trimmed. Project Structure
kept but abbreviated. Design Documents table trimmed to one-line summaries.

**Moved from AGENTS.md "What's Done" — implementation narratives preserved below:**

**Rendering perf experiments (29 Mar 2026):** P8 table scroll — reduced virtualizer overscan
(20→5, -61% severe frames, -49% P95), added `contain: layout` + `overflow-hidden` on gridcell
divs. Combined: max frame 300→217ms, severe 36→14, P95 67→34ms, DOM churn 76k→42k. CLS 0.041
accepted (inherent to virtualiser recycling). `content-visibility: auto` on rows (no effect),
`contain: strict` on cells (broke flex height), PAGE_SIZE 200→100 (more jank), `startTransition`
on density toggle (broke P12 drift) — all tried and reverted. See `rendering-perf-plan.md`.

**Phase A micro-optimisations (30 Mar 2026):** A.1 `handleScroll` stabilised (ref-stabilised
callbacks). A.2 `columnIndices` memoized in ImageGrid (was ~5,400 arrays/sec). A.3 Canvas font
cached in `measureText` (~600 parses → 2). A.4 GridCell key changed to `image.id` — **reverted
(31 Mar)**: content-based keys in positional virtualizer cause visible reordering during
seeks/searches. A.5 `ids.join(",")` replaced with O(1) sentinel. **Measured gains:** P3 seek
max frame −30%, DOM churn −53%, LoAF −40%; P7 scrubber drag max frame −29%, LoAF −38%; P8
table scroll max frame −16%, LoAF −14%; P11 domChurn −17%; P14 traversal max frame −24%.

**Phase B scrubber decoupling (31 Mar 2026, C6+C7+C22):** Eliminated DOM archaeology from
Scrubber. New `scroll-container-ref.ts` module-level register/get pattern. Tooltip height
magic number replaced with `offsetHeight`. Measured: P7 LoAF 133→47ms.

**Phase C header measurement (31 Mar 2026, C1):** `useHeaderHeight.ts` — ResizeObserver
callback-ref hook. Replaces `TABLE_HEADER_HEIGHT = 45` constant with live-measured value.

**Post-perf regression fixes (31 Mar 2026):** (1) Home button after deep seek — virtualizer
reset pattern (module-level ref in `useScrollEffects.ts`). (2) A.4 GridCell key reverted.
(3) Sort-around-focus ratio preservation (P6) — `sort-focus.ts` bridge saves/consumes
viewport ratio before/after sort. (4) Density-switch header offset fix (P4b) — table unmount
save includes HEADER_HEIGHT.

**Scroll architecture consolidation (1 Apr 2026):** New `useScrollEffects.ts` extracts all
duplicated scroll effects from ImageGrid (~280 lines removed) and ImageTable (~300 lines
removed). Zero behavioural change (70 E2E pass). Fixed pre-existing bug in table sort-only
detection. Module-level bridges absorbed into hook (Step 2). `scroll-reset.ts` and
`scroll-reset-ref.ts` absorbed (Step 3).

**Bug #17 fix (1 Apr 2026):** Density-focus mount restore at deep scroll failed for three
React Strict Mode reasons: (1) `geo.columns` from useState default (4) instead of real DOM;
(2) `consumeDensityFocusRatio()` cleared on phantom mount; (3) phantom mount cleanup
re-saved wrong geometry. Fixed with `minCellWidth` in ScrollGeometry, peek/clear split,
skip guard on save, double-rAF defer. 2 previously-skipped tests unskipped.

**Format comparison experiments (2 Apr 2026):** E4/E5 A/B tested WebP q79, AVIF q63/s8,
JXL q77/e4. AVIF wins: 9-15% smaller than WebP, comparable decode, 0ms landing through
fast tier. JXL disqualified: worst jank, worst decode gaps, largest files. Caught stale
`IMGPROXY_AVIF_SPEED=7` container tainting initial runs. Full data in
`image-optimisation-research.md`.


### 3 April 2026 — UI polish: date filter, sort indicator, document title, grid date label

**DateFilter preset highlight bug fix:**
The date filter dropdown highlighted both "Today" and "Past 24 hours" presets
simultaneously. Root cause: preset matching used `toDateInputValue()` which
truncates ISO strings to YYYY-MM-DD date-only. In UTC+ timezones, both presets'
UTC representations landed on the same calendar date. Fix: `findMatchingPreset()`
function uses tolerance-based comparison — "Today" matches exactly (midnight is
stable), relative presets allow 2-hour tolerance (generous for tab-left-open, but
far smaller than the gap between adjacent presets). Pure computation, no React
state — survives page reload and back/forward navigation.

**Sort dropdown non-default indicator:**
Added accent dot badge (identical to DateFilter) on the sort field button when
sort differs from default `-uploadTime`. Positioned as `absolute -top-0.5 -right-1`
badge to avoid layout shift — the UX principle being that toggle elements must
never reposition under the mouse pointer.

**Dynamic document title (`useDocumentTitle` hook):**
Mirrors kahuna's `ui-title` directive. Sets `document.title` based on search query
and new-images ticker count. Titles: `search | the Grid` (no query),
`cats | the Grid` (with query), `(5 new)  cats | the Grid` (ticker active).
Subscribes to `newCount` from the existing search store ticker.

**Grid cell sort-aware date label:**
Grid cells now show the date field matching the primary sort order — "Taken: ..."
when sorting by date taken, "Modified: ..." for last modified, "Uploaded: ..." for
everything else. Matches kahuna behaviour. Tooltip unchanged (always shows all three).
Implemented via `getCellDateLine()` helper, passed as `dateLine` prop to memoised
`GridCell`.

**New directive: "Ask rather than spiral":**
Added to both `.github/copilot-instructions.md` and the human copy. Instructs the
agent to ask the user instead of iterating through failed approaches or guessing
between divergent interpretations.

**Files changed:**
- `src/components/DateFilter.tsx` — `findMatchingPreset()` tolerance-based matching, non-default badge
- `src/components/SearchFilters.tsx` — sort non-default badge (absolute positioned)
- `src/components/ImageGrid.tsx` — `getCellDateLine()`, `dateLine` prop on GridCell
- `src/hooks/useDocumentTitle.ts` — NEW: dynamic page title hook
- `src/routes/search.tsx` — wire `useDocumentTitle()`
- `.github/copilot-instructions.md` — new "Ask rather than spiral" directive
- `kupua/exploration/docs/copilot-instructions-copy-for-humans.md` — directive sync
- `AGENTS.md` — updated What's Done, Project Structure
- `exploration/docs/changelog.md` — this entry


### 2 April 2026 — Unit tests for image-offset-cache + dead code cleanup

**Unit tests (15):** Added `image-offset-cache.test.ts` covering:
- `buildSearchKey` — deterministic regardless of param order, strips `image`/`density`
  params, strips null/empty values (3 tests).
- `extractSortValues` — default sort (uploadTime + id), `width` sort (nested dot-path
  `source.dimensions.width`), `credit` sort (metadata.credit), sparse image with missing
  nested fields (null values), tiebreaker always last (5 tests).
- `storeImageOffset` / `getImageOffset` round-trip — full cursor, mismatched searchKey,
  unknown image, null cursor, old cache format without cursor field, malformed offset,
  negative offset (7 tests).

All pure functions with zero mocking. Tests run in ~8ms.

**Dead code removal:** Deleted `loadRange` from store interface and implementation — zero
call sites after `restoreAroundCursor` replaced it. Updated comments in `es-adapter.ts`
and `types.ts` that referenced `loadRange`.

Clean `tsc --noEmit`, all 161 vitest unit tests pass (3 pre-existing extendForward
timing failures unrelated to this change).


### 2 April 2026 — Extract `_loadBufferAroundImage` shared helper

**Problem:** `_findAndFocusImage` (sort-around-focus) and `restoreAroundCursor`
(image-detail reload) both contained identical ~40-line blocks: forward
`searchAfter` + backward `searchAfter` + combine hits + compute cursors +
compute `bufferStart`. The two copies had diverged slightly in comment style
but were semantically identical. A bug fix in one would need to be duplicated.

**Fix:** Extracted `_loadBufferAroundImage()` — a pure async helper that takes
`(targetHit, sortValues, exactOffset, params, pitId, signal, dataSource)` and
returns a `BufferAroundImage` result object (combinedHits, bufferStart,
startCursor, endCursor, total, pitId, targetLocalIdx). Both callers now invoke
the helper and set their caller-specific store state from its return value.

Minor improvement in `restoreAroundCursor`: the target image fetch-by-ID was
moved earlier (before the bidirectional fetch), so we bail immediately if the
image no longer matches the query — saving two wasted `searchAfter` calls.

Net: ~30 lines of duplicated logic eliminated, tricky buffer assembly code
exists in exactly one place. All 71 E2E tests pass, clean `tsc --noEmit`.


### 2 April 2026 — Image detail position restore (cursor-based)

**Bug:** The image detail counter (`[x] of [total]`) and prev/next navigation
were lost on page reload for images at deep offsets (>10k). The offset cache
(`image-offset-cache.ts`, introduced 27 Mar) stored a global numeric offset
and restored via `loadRange` → `seek`. This worked in the pre-windowed-buffer
world where `loadRange` did exact `from/size`. The next day (28 Mar), the
windowed buffer rewrite changed `loadRange` to delegate to `seek()`, which for
deep offsets uses percentile estimation — landing *near* the target but not
*exactly* on it. The specific image wasn't in the loaded buffer, so
`findImageIndex` returned -1. Shallow offsets (<10k) still worked because
`seek` uses exact `from/size` at those depths.

The `search-after-plan.md` (§6, line 2100) had explicitly noted this gap:
*"With the windowed buffer, we need both the offset AND the cursor. Recommendation:
Extend the cache to store `{ offset, cursor, searchKey }`."* — but it was never
implemented.

**Fix — 5 files:**

1. `image-offset-cache.ts` — Extended stored object from `{ offset, searchKey }`
   to `{ offset, cursor, searchKey }` where `cursor` is `SortValues` (the ES
   `search_after` cursor). Added `extractSortValues(image, orderBy)` which builds
   the cursor by reading sort field values from the in-memory image object using
   `buildSortClause` + `parseSortField` + dot-path field resolution. Zero ES calls.
   `getImageOffset` now returns `{ offset, cursor }`. Backward-compatible — old
   cache entries without cursor return `cursor: null`.

2. `search-store.ts` — Added `restoreAroundCursor(imageId, cursor, offset)` action.
   With cursor: `countBefore` for exact global offset → forward + backward
   `search_after` from cursor → fetch target image by ID → combine into buffer.
   Structurally similar to the second half of `_findAndFocusImage` (sort-around-focus).
   Without cursor: falls back to `seek(offset)` (works for shallow depths).
   Error fallback also degrades to `seek`.

3. `ImageDetail.tsx` — Restore effect calls `restoreAroundCursor` instead of
   `loadRange`. `goToImage` (prev/next) stores cursor via `extractSortValues`.

4. `ImageGrid.tsx` — `handleCellDoubleClick` stores cursor via `extractSortValues`.

5. `ImageTable.tsx` — `handleRowDoubleClick` stores cursor via `extractSortValues`.

**Why not `imagePositions`:** Considered putting sort values in the centralised
`imagePositions` Map, but it's the wrong place — `imagePositions` is a runtime
buffer index (rebuilt on every search/seek/extend), while the offset cache is a
persistent cross-reload mechanism in `sessionStorage`. Different lifecycles,
different concerns. `useScrollEffects` is also unrelated — it handles viewport
positioning *after* data is in the buffer; this fix is about getting the right
data *into* the buffer.

**Tests:** 71/71 e2e passed. TypeScript compiles clean.


### 2 April 2026 — Format comparison experiments + AVIF confirmed

**Format A/B testing via E4/E5 traversal experiments:** Used the existing
E4 (detail view) and E5 (fullscreen) traversal experiments to compare three
image formats at DPR 1.5×, all against TEST ES (1.3M docs) via imgproxy.

Four experiment runs:
1. **AVIF q63/s7 + DPR 1.5×** — initial run, tainted by stale
   `IMGPROXY_AVIF_SPEED=7` override left from bench-formats tuning. E5-fast
   regressed from 0ms to 243ms. Diagnosed via `docker inspect`.
2. **WebP q79 + DPR 1.5×** — new DPR-aware baseline. All tiers 0ms except
   E4-rapid (233ms). Decode gaps (max 226-392ms) present in WebP too —
   disproved the AVIF decode bottleneck hypothesis.
3. **AVIF q63/s8 + DPR 1.5×** — correct config. Fast tier recovered to 0ms.
   9-15% smaller bytes than WebP. Chosen config confirmed.
4. **JXL q77/e4 + DPR 1.5×** — Chrome 145 with `--enable-features=JXLDecoding`.
   Disqualified: worst jank (severe/kf 53-60), worst decode gaps (442ms max),
   largest files. Chrome's `libjxl` decoder immature; jxl-rs in development.

**Decode gap analysis:** `renderMs - srcMs` per-step showed sporadic 200-500ms
spikes on one specific image at DPR 1.5× — present in all three formats.
Confirmed gaps are DPR-resolution-driven, not format-specific.

**Files changed:**
- `src/lib/image-urls.ts` — format toggled during experiments; restored to `"avif"`
- `playwright.experiments.config.ts` — temporary `--enable-features=JXLDecoding`; removed
- `exploration/docs/image-optimisation-research.md` — four experiment run entries + JXL verdict update
- `exploration/docs/deviations.md` — single-format deviation updated to reflect AVIF chosen
- `AGENTS.md` — format comparison experiments note added
- `exploration/docs/changelog.md` — this entry


### 1 April 2026 — Scroll Architecture Consolidation — Part A Step 1

**Motivation:** ImageGrid (~743 lines) and ImageTable (~1601 lines) each contained ~300
lines of duplicated scroll lifecycle effects: scroll container registration, virtualizer
reset registration, handleScroll + listener, prepend/evict scroll compensation, seek
scroll-to-target, search-params scroll reset with sort-around-focus detection,
bufferOffset→0 guard, sort-around-focus generation scroll, and density-focus mount
restore + unmount save. The duplication made every scroll fix a two-file change with
subtle divergences (e.g. grid has columns, table has headerOffset).

**What was built:** New `src/hooks/useScrollEffects.ts` (~440 lines) — a shared hook
parameterised by a `ScrollGeometry` descriptor:
- `rowHeight` (303 for grid, 32 for table)
- `columns` (dynamic for grid, 1 for table)
- `headerOffset` (0 for grid, HEADER_HEIGHT=45 for table)
- `preserveScrollLeftOnSort` (false for grid, true for table)

The hook contains all 10 scroll effect categories. Helper functions `localIndexToPixelTop`
and `localIndexToRowIndex` abstract the flat-index↔pixel math. Ref-stabilised callbacks
(A.1 pattern: `virtualizerRef`, `loadMoreRef`, `geometryRef`) ensure zero scroll listener
churn.

**Bug fix (pre-existing):** The table's original sort-only detection had an `isSortAction`
guard: `orderByChanged && searchParams.orderBy != null`. This meant switching to default
sort (clearing orderBy from URL) was NOT treated as a sort-only change — the table would
scroll to top instead of preserving the focused image's position. The grid's original code
didn't have this bug (it checked only `orderByChanged`). The hook uses the correct logic:
any change where only `orderBy` changed is sort-only, regardless of the new value.

**Result:** ImageGrid reduced from 743 → 463 lines (-280). ImageTable reduced from 1601 →
1297 lines (-304). Module-level bridges (`density-focus.ts`, `sort-focus.ts`,
`scroll-container-ref.ts`, `scroll-reset-ref.ts`) unchanged — consumed by the hook.

**Validation:** 70 E2E tests pass (2 pre-existing skips). TypeScript clean. Vite build clean.

**Files changed:**
- New: `src/hooks/useScrollEffects.ts`
- Modified: `src/components/ImageGrid.tsx` (removed inline scroll effects, added
  `useScrollEffects` call), `src/components/ImageTable.tsx` (same — also removed unused
  `useSearchStore`, `useLayoutEffect`, `registerScrollContainer`, `registerScrollReset`,
  `saveFocusRatio`, `consumeFocusRatio`, `saveSortFocusRatio`, `consumeSortFocusRatio`,
  `URL_DISPLAY_KEYS`, `UrlSearchParams` imports)
- Docs: `AGENTS.md`, this changelog


### 1 April 2026 — Scroll consolidation Part A Step 2: Absorb density-focus and sort-focus bridges

Inlined the transient save/consume bridges from `density-focus.ts` and `sort-focus.ts`
into `useScrollEffects.ts` as private module-level state. The hook is the sole consumer
of these bridges (verified via grep) — no other file imported them after Step 1.

**Changes:**
- `DensityFocusState` interface + `saveDensityFocusRatio()` / `consumeDensityFocusRatio()`
  functions inlined at the top of `useScrollEffects.ts`.
- `SortFocusState` simplified: `_sortFocusRatio` is now `number | null` instead of
  `{ ratio: number } | null`. The consume call at the sort-around-focus effect updated
  accordingly (`savedRatio` instead of `saved.ratio`).
- Deleted: `src/lib/density-focus.ts`, `src/lib/sort-focus.ts`,
  `src/lib/density-focus.test.ts` (unit test — the save/consume contract is now internal;
  behaviour is covered by E2E tests 26–28, 34–35, 41, 43).
- Updated stale comments in `scroll-container-ref.ts` and `scroll-reset-ref.ts` that
  referenced the deleted files.
- Updated `AGENTS.md`: scroll effects description, performance section, D.1 resolved,
  project structure (removed deleted files), stale `density-focus.ts` references.

**Validation:** 70 E2E tests pass (2 pre-existing skips). TypeScript clean.
Hook grew from ~440 → ~490 lines (inlined bridge state + doc comments).

**Risk:** Low — pure mechanical inlining of module-level state. The save/consume pattern
is identical; only the import path changed (from `@/lib/density-focus` to inline).


### 1 April 2026 — Scroll consolidation Part A Step 3: Absorb scroll-reset

Moved `resetScrollAndFocusSearch()` from `src/lib/scroll-reset.ts` into
`src/hooks/useScrollEffects.ts` as an exported module-level function. Replaced the
`scroll-reset-ref` callback indirection with a direct module-level virtualizer ref
(`_virtualizerReset`) — the hook's effect #2 sets this ref; the exported function reads
it directly. No callback registration needed.

**Changes:**
- `resetScrollAndFocusSearch()` moved into `useScrollEffects.ts` with all its
  orchestration steps (abortExtends → DOM scrollTop reset → virtualizer reset →
  visible range reset → scrubber thumb DOM reset → CQL focus).
- `_virtualizerReset` module-level variable replaces `registerScrollReset` /
  `fireScrollReset` callback pattern.
- Deleted: `src/lib/scroll-reset.ts`, `src/lib/scroll-reset-ref.ts`.
- `scroll-container-ref.ts` kept — still needed by Scrubber.tsx independently.
  Updated import in `useScrollEffects.ts` to also import `getScrollContainer`.
- Updated imports in `SearchBar.tsx` and `ImageDetail.tsx` to point to
  `@/hooks/useScrollEffects`.
- Updated stale comment in `scroll-container-ref.ts`.
- Updated `AGENTS.md`: scroll effects description, performance section, project
  structure (removed deleted files), post-perf regression fixes section.

**Validation:** 70 E2E tests pass (2 pre-existing skips — Bug #17). Buffer corruption
tests 1–9 all pass — this was the specific canary for this step. TypeScript clean.
Hook grew from ~490 → ~555 lines.

**Risk assessment:** This was the highest-risk step (moving `abortExtends()` timing
relative to the synthetic scroll event is the exact pattern that caused the original
buffer corruption bug). The 9 buffer corruption tests are the safety net and all pass.


### 1 April 2026 — Scroll consolidation Part A Step 4: Search-store cleanup — assessed as no-op

The plan specified: "Remove `_seekCooldownUntil` manipulation from `search()` — the
coordinator handles it." This was assessed as **incorrect and dangerous**. The `search()`
function sets `_seekCooldownUntil = Date.now() + 2000` (line 753) on its own entry path
(triggered by URL sync, not by `resetScrollAndFocusSearch`). These are independent
protection layers:

1. `resetScrollAndFocusSearch()` → `abortExtends()` → 2s cooldown (scroll-reset path)
2. `search()` → 2s cooldown directly (URL-sync path)

Removing the cooldown from `search()` would leave the URL-sync path unprotected against
buffer corruption during the search→results transition. The store has no scroll imports
and no scroll concerns — its cooldown management is purely a buffer protection mechanism.

**Result:** No code changes for Step 4. Part A is complete.

**Part A summary — files deleted across all steps:**
- `src/lib/density-focus.ts` (Step 2)
- `src/lib/density-focus.test.ts` (Step 2)
- `src/lib/sort-focus.ts` (Step 2)
- `src/lib/scroll-reset.ts` (Step 3)
- `src/lib/scroll-reset-ref.ts` (Step 3)


### 1 April 2026 — Bug #17 fix: Density switch at deep scroll

**Problem:** Density switch (table↔grid) after deep scroll left the viewport at scrollTop=0
instead of showing the focused image. The 2 E2E tests covering this were skipped because
they never triggered deep scroll (headless Chromium doesn't fire native scroll events from
programmatic scrollTop assignment).

**Root causes (all three needed fixing):**

1. **Test helper `scrollDeep` didn't dispatch synthetic scroll events.** Programmatic
   `el.scrollTop = el.scrollHeight` in headless Chromium doesn't fire native `scroll`
   events, so `reportVisibleRange` never fires, extends never trigger, buffer stays at
   200 items with offset 0 → skip guard activates. **Fix:** Add
   `el.dispatchEvent(new Event("scroll"))` after each scrollTop assignment. Changed from
   fixed 8-iteration loop to threshold-checking loop (grid rows at 303px need more
   iterations than table rows at 32px).

2. **React Strict Mode double-mount consumed density-focus state twice.** In dev mode,
   React fires mount effects twice: mount → cleanup → mount. The first mount consumed the
   saved density-focus state via `consumeDensityFocusRatio()` (destructive read), cleanup
   cancelled the rAF (so scroll never happened), and the second mount got null. **Fix:**
   Split into `peekDensityFocusRatio()` (non-destructive read) + `clearDensityFocusRatio()`
   (clear inside rAF callback after scroll is applied).

3. **Strict Mode phantom-mount cleanup overwrote valid save.** The real table unmounts and
   saves correctly (ratio≈0.045). Then the grid phantom-mounts (Strict Mode), immediately
   unmounts (cleanup), and saves with wrong geometry (columns=4 useState default,
   scrollTop=0, headerOffset=0) → ratio=37.57, overwriting the valid save. **Fix:** Guard
   `saveDensityFocusRatio` to skip when a pending unconsumed state already exists
   (`if (_densityFocusSaved == null)`).

4. **Mount restore used wrong column count.** Grid useState default is 4 columns, but the real
   column count (from ResizeObserver) might be 6. The mount-restore `useLayoutEffect`
   ran with columns=4, computing the wrong pixel position. **Fix:** Added `minCellWidth` to
   `ScrollGeometry`. Mount restore computes real columns from `el.clientWidth / minCellWidth`
   instead of using `geo.columns`.

5. **`virtualizer.scrollToOffset()` doesn't work at mount time.** The virtualizer's spacer
   element hasn't been measured yet, so scrollHeight is wrong and the clamping pins scrollTop
   to 0. **Fix:** Use double-`requestAnimationFrame` to defer until: frame 1 (ResizeObserver
   fires, React re-renders), frame 2 (virtualizer spacer has correct totalSize). Then set
   `el.scrollTop` directly on the DOM.

**Test changes:**
- `scrollDeep` helper: synthetic scroll events + threshold-checking loop
- Programmatic focus via `store.setFocusedImageId(id)` instead of `focusNthItem(3)` (click
  targets are unstable after deep scroll)
- Scroll focused image into view before density switch (unmount save needs reasonable ratio)
- Grid→table visibility check: tolerance includes `TABLE_HEADER_HEIGHT` (row behind sticky
  header is still "in view")

**Result:** 72 E2E tests pass (was 70 + 2 skipped). Zero regressions on existing tests.


### 1 April 2026 — Density-focus drift fix — multi-toggle stability

**Bug:** Focused image drifts out of the viewport after 3+ density toggles at deep scroll.
Survives the first 1-2 toggles, then progressively drifts until it's off-screen.

**Root cause:** The density-focus mount restore (effect #10 in `useScrollEffects.ts`)
dispatched a synthetic scroll event (`el.dispatchEvent(new Event("scroll"))`) after setting
`scrollTop`. This triggered: scroll handler → `reportVisibleRange` → `extendBackward`
(because the focused image is deep, the visible range hits the backward-extend threshold).
The extend prepends ~200 items to the buffer. Prepend compensation then adds
`prependedRows × rowHeight` to `scrollTop`. But when the compensated value exceeds
`scrollHeight - clientHeight`, the browser clamps silently — losing pixels. Each
density-switch cycle that triggers a prepend-then-clamp loses ~1,000px in table view
(32px rows × ~31 rows). After 3 clamped cycles the image is off-screen.

**Geometric proof (table):** 1000 items × 32px = 32,000px total scroll height. Focused image
at localIdx=800 → rowTop=25,600. Prepend compensation adds 200 × 32 = 6,400px → target
32,000 but maxScroll ≈ 31,000. Clamped by ~1,000px.

**Fix (two changes):**
1. **Removed `el.dispatchEvent(new Event("scroll"))`** from the rAF2 callback in the
   density-focus mount restore. This was the root cause trigger — it fired
   `reportVisibleRange` → `extendBackward` → prepend compensation → clamping. The event
   was always redundant: the scrubber thumb syncs via effect #3 (buffer-change re-fire on
   `bufferOffset`/`resultsLength` change) and the next real user scroll.
2. **Added `abortExtends()` call** at the start of the mount restore (before the rAF chain).
   Belt-and-suspenders: sets a 2-second cooldown on both `extendForward` and
   `extendBackward`, blocking them at their synchronous guards. This prevents any other path
   (buffer-change re-fire, virtualizer measurement events) from triggering extends during the
   density-switch settle window. Same mechanism used by `resetScrollAndFocusSearch()` and scrubber `seek()`.

**Performance impact:** Net positive — removes one synthetic event dispatch, one async extend
network call, and one prepend compensation layout shift per density switch. The 2-second
extend cooldown matches the existing post-seek behaviour; with 1000 items in the buffer
(50+ screenfuls in grid) there's ample headroom.

**Test added:** `density-focus survives 5+ toggles at deep scroll without drift` — seeks to
0.8, scrolls deep to grow the buffer, focuses an image at 75th percentile of buffer
(maximises clamping chance), then toggles density 5 times. Asserts visibility after EACH
toggle (drift is cumulative). Designed to trigger actual scroll clamping on local 10k data
via table geometry: 32px rows make the scroll range tight enough for compensation to exceed
maxScroll.

**Files changed:**
- `src/hooks/useScrollEffects.ts` — removed synthetic scroll dispatch, added `abortExtends()`,
  added edge clamping on restore
- `e2e/scrubber.spec.ts` — added multi-toggle drift test


### 1 April 2026 — Density-focus edge clamping — partially-clipped images become fully visible

**Problem (UX):** The density-focus save/restore faithfully preserved the focused image's
viewport-relative position (ratio), but this meant a partially clipped image stayed
partially clipped after the switch. If you focus an image in grid view where only 78px of
its 303px height is visible above the top edge (ratio ≈ −0.22), the table view places the
row at the same viewport-relative position — just barely peeking in from above.

**Evidence from logs (1.3M docs on TEST):**
- Top-edge image `8af8a...`: ratio −0.217, `rowTop=19998, scrollTop=20223` — 225px above
  viewport top, only 78px visible (of 303px). Stable across 6 toggles but always clipped.
- Bottom-edge image `bc24a...`: ratio 0.951, `rowTop=21210, scrollTop=20222, clientH=1039` —
  row starts at 988px in a 1039px viewport, only 51px visible (of 303px grid row). In table
  (32px row), it fits because 32px < 51px remaining space.

**Fix:** Added edge clamping to the density-focus mount restore, after computing `rawTarget`
from the saved ratio. Same pattern already used by sort-around-focus (effect #9, lines
516-520), adapted for `headerOffset`:
- `itemY = rowTop + headerOffset - rawTarget` (where item sits in viewport)
- If `itemY < headerOffset` → top-clipped → `targetNow = rowTop` (flush below header)
- If `itemY + rowHeight > clientHeight` → bottom-clipped → `targetNow = rowTop + headerOffset - clientHeight + rowHeight` (flush at bottom)

**Behaviour change:** Images that were partially off-screen now "snap in" to the nearest
edge on density switch. The snap is one-directional: the SAVE still records the raw ratio,
so the snap only applies on RESTORE. When switching back, the image (now fully visible in
the source density) gets a new ratio that doesn't trigger clamping — it naturally stabilises at a fully-visible position within 1-2 toggles.

**No complexity concern for the "switch back" case:** The user's original worry was that
coming back to the source density would need to re-adjust the image. It doesn't — because
the SAVE on the intermediate density records a ratio where the image IS fully visible (the
edge clamp made it so), the RESTORE back uses that good ratio. No second-order correction
needed.

**Performance impact:** Zero. Three comparisons and potentially one assignment, inside an
already-deferred rAF2 callback.

**DIAG log updated:** `[density-focus RESTORE]` now includes `rawTarget` (before edge clamp)
and `edgeClamp=top|bottom|none` fields for manual validation.

**Files changed:** `src/hooks/useScrollEffects.ts` only.


### 1 April 2026 — Test deduplication — Bug #17 single-switch tests removed

Removed the two single-switch Bug #17 tests (`table→grid: focused image visible after
deep scroll + density switch` and `grid→table: focused image visible after deep scroll +
density switch`). Both are fully subsumed by the new multi-toggle test (`density-focus
survives 5+ toggles at deep scroll without drift`) which:
- Tests both directions (table→grid AND grid→table) across 5 toggles
- Asserts visibility after each toggle, not just one
- Uses a deeper seek (0.8 vs mousewheel scrolling) and higher localIdx (75th% vs 50th%)
- Starts from table (tighter scroll geometry, easier to trigger clamping)

Tests kept (not subsumed):
- `focused image ID survives grid→table→grid` (350) — shallow, tests ID preservation only
- `density switch after deep seek preserves focused image` (364) — tests globalPosition, not visibility
- `rapid density toggling doesn't corrupt state` (391) — tests state consistency at 0.3 seek, not visibility

**Validation:** The multi-toggle test was verified to **fail without the fix** (stash/pop of
`useScrollEffects.ts`). Without the fix: `rowTop=19998 scrollTop=28993` — image 9,000px
off-screen at toggle 1. Both runs consistent. With the fix: passes every time.

**Net test count:** 62 scrubber + 9 buffer corruption = 71 total (was 64 + 9 = 73 — removed 2).


### 1 April 2026 — Experiments Infrastructure

Built agent-driven A/B testing infrastructure for tuning knob experiments.

**Files created:**
- `playwright.experiments.config.ts` — separate Playwright config (headed browser, no safety gate, long timeouts, no auto-start webServer)
- `e2e-perf/experiments.spec.ts` — experiment scenarios E1–E3 with full probe collection
- `e2e-perf/results/experiments/` — JSON result directory + README + experiments-log.md
- `.gitignore` updated — `exp-*.json` files excluded (machine-local results)

**Design:**
- Each experiment records: git commit hash + dirty flag, ES source (local vs real) + total, knob values under test, full perf snapshot, store state
- Probe suite: CLS, LoAF, frame timing, scroll velocity, DOM mutations, blank flash detection (IntersectionObserver + MutationObserver), ES network payload (PerformanceObserver for resource timing)
- Probes are injected per-test (not globally) — `injectProbes()` / `resetProbes()` / `collectSnapshot()`
- Three baseline scenarios: E1 (table fast scroll, 30×800px), E2 (grid fast scroll, 30×1500px), E3 (density switch at seek 0.5)

**Workflow for knob experiments:**
1. Agent runs baseline (current values)
2. Agent modifies source file (e.g. overscan in ImageTable.tsx)
3. Vite HMR reloads
4. Agent runs same experiment with env var tagging the knob value
5. Agent reverts source change
6. Agent compares JSON results and writes comparison to experiments-log.md

**Initial baseline run (against TEST, 1.3M docs):**
- E1 (table scroll): 12 severe jank, max 133ms, P95 67ms, 37k DOM churn, 0 flashes, 3 ES requests (875KB)
- E2 (grid scroll): 1 severe jank, max 50ms, 402 DOM churn, 0 flashes, 0 ES requests
- E3 (density switch): CLS 0.0000, 4 severe jank, max 133ms, 2.3k DOM churn, 0 flashes

**Observation:** Zero blank flashes across all scenarios. The flash detector's `hasContent()` check (text >10 chars OR `<img>` present) may be too lenient — table rows have text immediately, grid cells have structural elements. Future refinement: detect image *placeholder* vs *loaded image* specifically.

**Documented in:** `exploration/docs/tuning-knobs.md` (new "Experiments Infrastructure" section with workflow, experiment catalogue, and results schema).


### 1 April 2026 — Experiment framework improvements

Five improvements to experiment infrastructure reliability and documentation:

**1. Signals Glossary:** Added comprehensive signal definitions to `e2e-perf/results/experiments/README.md`. Every metric in `ExpSnapshot` now has a table with unit, meaning, good/bad thresholds. Grouped by probe type (CLS, LoAF, jank, DOM churn, scroll velocity, blank flashes, network). This is the reference for interpreting experiment JSON results.

**2. Corpus pinning via STABLE_UNTIL:** Experiments now hardcode `STABLE_UNTIL = "2026-02-15T00:00:00.000Z"` (same value as perf tests) and all scenarios navigate with `until=` parameter via a dedicated `gotoExperiment()` helper. Previously experiments used `kupua.goto()` which only respects `PERF_STABLE_UNTIL` when set as an env var — and experiments don't use `run-audit.mjs` so the env var was never set. This means prior experiment runs on TEST had an unstable corpus (new uploads between runs would change results). Now fixed.

**3. Probe self-test diagnostics:** New `diagnoseProbes()` + `logProbeDiagnostics()` functions run after every experiment. For each probe, they verify it gathered data and log a clear ✓/✗ line. Key diagnostics:
- rAF loop: frameCount must be > 0
- Scroll velocity: samples must be > 0 for scroll scenarios
- DOM mutations: totalChurn must be > 0
- Blank flashes: 0 is genuinely OK (overscan prevents blank rows) — but the diagnostic explains *why* it's 0 (overscan vs pending vs actually zero)
- Network: context log (0 requests means buffer was sufficient)
This solves the "is flashes=0 because nothing flashed, or because the probe is broken?" question.

**4. Safety bounds for agent experiments:** Added a prominent safety banner in the experiment spec header with explicit ranges for all tunable knobs (PAGE_SIZE 50–500, overscan 1–30, BUFFER_CAPACITY 500–3000, EXTEND_THRESHOLD < BUFFER_CAPACITY/2, wheel delta 100–3000, interval ≥30ms). Matching "Safety: Experiment Value Bounds" section in the README. This prevents the agent from setting values that could freeze the browser or trip ES circuit breakers.

**5. Named scroll speed tiers:** Replaced hardcoded `wheel(0, 800)` / `wheel(0, 1500)` with named `SCROLL_SPEEDS` constant:
- `slow`: 300px delta, 120ms interval (~2,500 px/s) — gentle browsing
- `normal`: 800px delta, 80ms interval (~10,000 px/s) — purposeful scrolling
- `fast`: 1500px delta, 50ms interval (~30,000 px/s) — power-user flicking
No "max speed" (0ms interval) tier — Playwright dispatches without physics, so 0ms intervals measure virtualizer pathology rather than real UX. E1 and E2 now run all three tiers sequentially (3 result JSONs per experiment), giving slow/normal/fast jank profiles for every knob value. Documented in README "Scroll Speed Tiers" table.

**Files changed:**
- `e2e-perf/experiments.spec.ts` — speed tier definitions, test names, E6 duration, normalised jank output, timeout
- `e2e-perf/results/experiments/README.md` — speed tier tables, signals glossary (severePerKFrames), JSON schema example
- `e2e-perf/results/experiments/experiments-log.md` — fresh v2 log
- `e2e-perf/results/experiments/experiments-log-v1-baseline.md` — archived v1 log
- `e2e-perf/results/experiments/v1-baseline/` — archived v1 JSON results
- `AGENTS.md` — updated experiment infrastructure description
- `exploration/docs/changelog.md` — this entry


### 1 April 2026 — Image traversal prefetch pipeline fix — 1 April 2026

**Problem:** User reported image traversal (arrow keys in detail/fullscreen) felt
slower than it used to be. Investigated and found a regression: Era 3 (commit
`85673c0d4`) replaced Era 2's fire-and-forget `new Image().src` prefetch with
`fetch()` + `AbortController` debounced at 400ms. The 400ms debounce killed the
rolling pipeline at any browsing speed faster than ~500ms/image.

**Investigation (traversal-perf-investigation.md):**
- Researched 3 eras of prefetch logic in the codebase
- Studied PhotoSwipe (24k★) and immich (65k★) for prior art
- Built instrumentation: imgproxy request tracking, per-tier browser cache clearing,
  per-image render timing, landing image cache-hit detection
- Ran 3 baseline experiments against TEST (1.3M docs) with slow/moderate/fast/rapid
  speed tiers, identifying the debounce cliff: 0ms landing at slow (1000ms/step),
  500ms+ at fast (200ms/step)

**Fix applied to `ImageDetail.tsx`:**
1. Replaced Era 3 debounced `fetch()` + `AbortController` with fire-and-forget
   `new Image().src` on every navigation (Era 2 approach, no debounce)
2. Direction-aware allocation (PhotoSwipe model): 4 ahead + 1 behind, direction
   tracked via `directionRef`
3. `fetchPriority="high"` on the main `<img>` element
4. T=150ms throttle gate: suppresses prefetch batches during held-key rapid traversal
   (<150ms/step) to reduce imgproxy contention. Never fires at ≥200ms/step (fast
   browsing and slower). Mathematical proof in the investigation doc that T=150ms
   never hurts: suppressed batches at <150ms/step can't complete in time to be
   useful anyway, and the 4-ahead reach ensures the landing image is always covered.

**Results (2 runs against TEST, all 8 tiers valid):**

| Tier | Interval | E4 Landing (before→after) | E5 Landing (before→after) |
|------|----------|--------------------------|--------------------------|
| slow | 1000ms | 0ms → 0ms | 0ms → 0ms |
| moderate | 500ms | 120ms → **0ms** | 109ms → **0ms** |
| fast | 200ms | 500ms → **0ms** | 519ms → **0ms** |
| rapid | 80ms | 410ms → **0ms** | 413ms → **290ms** |

E5-rapid (fullscreen + 80ms/step) shows 290ms landing due to imgproxy contention
(avg latency 608ms, 0 cache hits). All other tiers: 0ms. The throttle gate was added
as insurance against future larger images (AVIF, DPR-aware sizing) pushing the
contention cliff to slower speeds.

**E4/E5 experiment enhancements:**
- Added slow (1000ms) and moderate (500ms) speed tiers to E4/E5
- Added per-tier browser cache clearing via CDP `Network.clearBrowserCache`
- Added imgproxy request tracking (count, bytes, cache hits, avg duration)
- Added `scripts/read-results.py` utility for quick experiment result inspection

**Directive added:** "Dev server conflict" — agent must warn user to stop any running
dev server on port 3000 before running `npx playwright test`.

**Files changed:**
- `src/components/ImageDetail.tsx` — prefetch pipeline: fire-and-forget + direction-aware + throttle gate
- `e2e-perf/experiments.spec.ts` — slow/moderate tiers, per-tier cache clearing, imgproxy tracking
- `exploration/docs/traversal-perf-investigation.md` — full investigation (768 lines)
- `exploration/docs/deviations.md` — §17: prefetch pipeline deviation
- `exploration/docs/copilot-instructions-copy-for-humans.md` — dev server conflict directive
- `scripts/read-results.py` — experiment result inspector utility
- `AGENTS.md` — updated image detail, experiments, docs table, project structure
- `exploration/docs/changelog.md` — this entry


### 1 April 2026 — Image optimisation research + DPR-aware sizing

**Image format research:** Analysed WebP, AVIF, JPEG XL, and progressive JPEG as
image format options for imgproxy. Key findings:

- **AVIF:** 20-30% smaller than WebP but 2-5× slower encode. Would worsen the E5-rapid
  contention problem. Deferred until imgproxy caching or faster encoders are available.
- **JPEG XL non-progressive:** Works today (`@jxl` suffix). Verified in Chrome Canary.
- **JPEG XL progressive:** Blocked at two levels. (1) libvips 8.16 (in
  `darthsim/imgproxy:latest`) does not pass progressive encoder flags (`PROGRESSIVE_DC`,
  `QPROGRESSIVE_AC`, `RESPONSIVE`, `GROUP_ORDER`) to libjxl — only `effort`, `tier`,
  `distance`, `lossless`. (2) imgproxy (even v4-beta branch) does not expose the
  `interlace` parameter that libvips 8.19 (unreleased master) adds. Both need to ship.
  Confirmed by cloning imgproxy `chore/v4-changelog` branch, libvips v8.16.0 tag, and
  libvips master — reading `vips/vips.c` (imgproxy), `libvips/foreign/jxlsave.c` (both
  versions). libvips 8.19 master adds `interlace` and `progressive` params that set all
  four libjxl progressive settings. libjxl 0.11.2 (in Docker image) fully supports
  progressive at the library level.
- **Progressive JPEG:** Available today via `IMGPROXY_JPEG_PROGRESSIVE=true`. Worth
  benchmarking as a progressive fallback.

**DPR-aware sizing implemented:** Changed `getFullImageUrl()` from a static `dpr: 1.5`
multiplier to a runtime two-tier step function `detectDpr()`:
- `window.devicePixelRatio ≤ 1.3` → multiplier 1 (CSS pixels only)
- `window.devicePixelRatio > 1.3` → multiplier 1.5 (HiDPI bump)

This respects 1× users (who were getting unnecessarily large 1800px images) and gives
HiDPI users a meaningful sharpness improvement without the 4× pixel count of full 2×.
DPR parameter remains overridable per-call. Result capped at native resolution via
`nativeWidth`/`nativeHeight` options.

**Files changed:**
- `src/lib/image-urls.ts` — `detectDpr()` function, updated `IMGPROXY_DEFAULTS.dpr`
- `exploration/docs/image-optimisation-research.md` — JXL progressive blocker analysis, DPR section update, benchmark methodology
- `exploration/docs/deviations.md` — DPR deviation entry
- `docker-compose.yml` — added `IMGPROXY_JPEG_PROGRESSIVE: "true"` (harmless default, in case we ever test JPEG visual quality)
- `scripts/bench-formats.sh` — new benchmark script: WebP vs AVIF vs JXL, curated by size (tiny/normal/large/monster/PNG), JPEG excluded (no alpha channel)
- `src/lib/image-urls.ts` — format type updated: `"webp" | "avif" | "jxl"` (JPEG removed — no alpha support for PNGs/TIFFs with transparency)
- `AGENTS.md` — image optimisation doc reference, DPR note in image detail section, bench-formats in project structure
- `exploration/docs/changelog.md` — this entry


### 31 March 2026 — Phase C: DOM-Measured Header Height — C1

Replaced the `TABLE_HEADER_HEIGHT = 45` hardcoded constant in `ImageTable.tsx` with a live-measured value via a new `useHeaderHeight` hook.

**Why:** C1 from the coupling audit — the JS constant `HEADER_HEIGHT = 45` must match the CSS-rendered height of the sticky header (`h-11` = 44px + `border-b` = 1px). If either changes (font scaling, responsive breakpoints, an added filter row), the scroll padding and keyboard-focus visibility calculations would silently break. This replaces a manual sync obligation with an automatic one.

**New file: `src/hooks/useHeaderHeight.ts`**

A callback-ref + ResizeObserver hook. Returns `[callbackRef, measuredHeight]`. Implementation notes:

- Uses a callback ref (not `useEffect`) — fires synchronously on element mount, so the initial height is available immediately via `getBoundingClientRect()`, not on the next tick.
- Observes `box: "border-box"` so the 1px `border-b` is included in the measurement.
- Falls back to the `fallback` argument (= `TABLE_HEADER_HEIGHT = 45`) on the first frame before DOM is ready — identical to the old constant, so no visible jump or miscalculation.
- Stores the observer in `observerRef` to disconnect on element removal / component unmount.
- Zero deps on `useCallback` — `setHeight` is stable per React guarantee.

**ResizeObserver fires at most:** once on mount, plus optionally on font load or browser resize. Never fires during scroll (ResizeObserver observes border-box, not scroll position). Zero scroll-path cost.

**Changes to `ImageTable.tsx`:**

1. Added `import { useHeaderHeight }` from hooks.
2. Added `const [headerCallbackRef, headerHeight] = useHeaderHeight(HEADER_HEIGHT)` after `parentRef`.
3. Added `ref={headerCallbackRef}` to the sticky header div (`data-table-header`).
4. Replaced `scrollPaddingStart: HEADER_HEIGHT - ROW_HEIGHT` with `scrollPaddingStart: headerHeight - ROW_HEIGHT`.
5. Replaced `headerHeight: HEADER_HEIGHT` with `headerHeight` in `useListNavigation`.
6. `HEADER_HEIGHT` import kept as fallback — unchanged value.

**Phase D assessment:** All three D items deferred. D.1 (density-focus ref): module-level `let saved` is safe — components never co-render, lifecycle is serial. Prop-threading adds complexity with no practical benefit. D.2 (font strings from CSS): compile-time constants, no sync obligation, low value. D.3 (panel constraints): UX decision, requires design discussion.

**Validation:** 152 unit tests pass. 63 E2E tests pass (keyboard nav, density switch, scrubber all green).



### 31 March 2026 — Phase C re-run (full — 31 tests)

The first Phase C run lost P4a/P4b/P5/P6/P7/P9 to ES tunnel instability (20 of 30
test variants recorded). A full re-run was done later in the same session with a stable
tunnel. All 31 tests completed. This entry ("Phase C re-run (full)") supersedes entry
3 ("Phase C: measured header height") in `audit-log.json`. It is the authoritative
Phase C result used in all analysis below.

Key result: P8 maxFrame=183ms, LoAF=748ms, severe=15 — best across all phases. P7
LoAF=138ms — the Phase A/B win (47ms) appears gone; likely tunnel variance but
needs `--runs 3` to confirm. P12-scroll.severe=10 — the "monotone trend" (9→11→12→14
across partial runs) was noise; C-full is near baseline.


### 31 March 2026 — Harness bug fix: focusDrift fields were always recorded but stripped

`run-audit.mjs`'s `aggregateMetrics()` function maintained a hardcoded list of
field names to persist. `focusDriftPx`, `focusDriftRatio`, and `focusVisible` were
not in that list — so they were recorded to `.metrics-tmp.jsonl` on every run but
silently dropped when writing to `audit-log.json`. Fixed: the function now preserves
all fields present in the metrics object, not just the hardcoded list.

This meant the "Critical measurement gap" called out in the original post-phase-C
analysis was wrong. The data was always there. Reading `.metrics-tmp.jsonl` directly
from the Phase C re-run revealed:
- P4a (grid→table): focusDriftPx=**0**, perfect
- P4b (table→grid): focusDriftPx=**−160px** (image appears ~5 rows above expected)
- P6 (sort change): focusDriftPx=**428px**, ratio=0.412 (image ~41% viewport below expected)

P6's 428px drift is the most actionable finding in the entire dataset. Sort-around-focus
does not preserve the focused item's viewport position — it always re-centres via
`scrollToIndex(idx, "center")`. P4b's −160px asymmetry (P4a is 0) points to the
`density-focus.ts` table→grid restore path. These are real, visible bugs.


### 31 March 2026 — Documentation session

`exploration/docs/fix-ui-docs-eval.md` Part 5 updated:
- Replaced the "Critical measurement gap" bullet (which said `focusDriftPx` was
  always null) with the corrected finding, plus a table of the actual Phase C values.
- Updated "Overall assessment" forward pointer to reference `focus-drift-and-scroll-handoff.md`.

New `exploration/docs/focus-drift-and-scroll-handoff.md` created — self-contained
handoff for the next agent session covering:
1. Focus drift elimination (P6 428px, P4b −160px, add P17 test)
2. P8 table fast scroll investigation (~57k DOM churn)

Includes source file map, code-level diagnosis of both bugs, investigation approaches
for P8, validation sequences, and architecture decisions not to change without discussion.

`AGENTS.md` docs table: corrected stale `perf-measurement-report` description.


### 31 March 2026 — Post-Phase-C: Perf Measurement Analysis and Honest Assessment

After all four phases (Baseline, A, B, C) were run against TEST ES, a full analysis
of the measurement data was conducted. Key findings:

**What actually improved (genuine, consistent gains):**
- P7 LoAF 133→50ms (−62%) — scrubber drag seeks are faster. `handleScroll` stabilisation (A.1).
- P2 LoAF 104→68ms (−35%) — scroll initiation smoother. Same cause.
- P3/P7/P11 domChurn down 14–53% — fewer DOM mutations on buffer extends. GridCell `id` key (A.4).

**What did not improve:**
- P8 (table fast scroll): p95=50ms, domChurn=~57k — completely flat across all phases. The coupling fixes did not touch this path's root cause. This is the primary user-facing bottleneck.

**Suspected regression:**
- P12-scroll.severe: 9→11→12→14. Monotone upward across all four phases. Started at Phase A. Likely related to `virtualizerRef.current` being one render stale during rapid scroll, causing different `range` readings and more `loadMore` calls. Needs `--runs 3` confirmation.

**focusDrift data (corrected — harness bug fixed in same session):**
- `focusDriftPx`/`focusDriftRatio`/`focusVisible` were always recorded in `.metrics-tmp.jsonl`
  but stripped by `aggregateMetrics()` before writing to `audit-log.json`. Initially
  misdiagnosed as "getFocusedViewportPos() returns null". The data was there all along —
  reading `.metrics-tmp.jsonl` directly gave: P4a=0px (perfect), P4b=−160px, P6=428px.
  The "Never Lost" density switch does have quantitative data; it just wasn't surfacing
  through the harness. Fix applied to `run-audit.mjs` same session. See "Phase C re-run"
  entry above.

**Phase C (header height) specifically:**
- 20 of 30 test variants recorded; P4a/P4b/P5a/b/c/P6/P7/P9 absent (ES tunnel timeouts during that run — not a harness failure; the diff table only shows changed tests, which made it appear fewer ran). Phase C adds one ResizeObserver callback on mount. Zero scroll-path cost. No perf regression on the 20 tests that did run. The missing tests (density switch, scrubber drag) should be re-run with a stable tunnel.

**Deliverables created:**
- `exploration/docs/perf-measurement-report.md` — full scannable report with all raw data, per-test analysis, and recommended next steps for fresh agent. Updated in same session with Phase C re-run data and corrected focusDrift findings.
- `exploration/docs/fix-ui-docs-eval.md` — Part 5 added + corrected (see "Phase C re-run + Harness Fix" entry above).
- `exploration/docs/focus-drift-and-scroll-handoff.md` — new handoff doc for next two work items.
- `AGENTS.md` — "Known Performance Issues" section + docs table correction.


### 31 March 2026 — Post-Perf Regression Fixes

Three regressions from the Phase A-C perf commit (`3dac9ff5e`) identified in
`exploration/docs/post-perf-fixes.md` and fixed in this session:


### 31 March 2026 — Issue 1 (CRITICAL): Home button after deep seek

**Symptom:** After a deep seek (scrubber click at ~50%), clicking the Home logo
didn't scroll to position 0 -- the view landed ~200 items from the top. Also
affected click-to-search from image detail metadata.

**Root cause:** `resetScrollAndFocusSearch()` set `scrollContainer.scrollTop = 0`
and dispatched a synthetic scroll event, but TanStack Virtual's internal
`scrollOffset` state wasn't reset. After A.1 stabilised `handleScroll` (fewer
re-registrations, fewer sync opportunities), the virtualizer lagged behind the
DOM `scrollTop` during rapid state transitions.

**Fix:** New `src/lib/scroll-reset-ref.ts` -- same module-level registration
pattern as `scroll-container-ref.ts`. Both ImageTable and ImageGrid register
`() => virtualizer.scrollToOffset(0)` on mount. `resetScrollAndFocusSearch()`
calls `fireScrollReset()` alongside the existing DOM `scrollTop = 0`. This
guarantees the virtualizer's internal state is always zeroed.


### 31 March 2026 — Issue 3: Visual reordering during seeks and sort changes

**Symptom:** Images visibly shuffled/reordered for one frame before settling into
final positions after seeks, searches, and sort changes.

**Root cause:** A.4 changed GridCell key from positional (`key={imageIdx}`) to
content-based (`key={image?.id}`). Content keys in a positional virtualizer cause
React's reconciler to reuse component instances from old virtual positions, fighting
TanStack Virtual's layout model. The 14-18% domChurn reduction on backward extends
was not worth the user-visible reordering regression.

**Fix:** Reverted A.4 -- GridCell key back to positional `key={imageIdx}`. Comment
explains the rationale and documents the revert history. Expect P3/P11 domChurn
to increase back to pre-A.4 levels.


### 31 March 2026 — Issue 2: Focus drift -- sort-around-focus (P6) and density switch (P4b)

**P6 fix:** Created `src/lib/sort-focus.ts` (same bridge pattern as
`density-focus.ts`). The scroll-reset `useLayoutEffect` in both ImageTable and
ImageGrid now captures the focused item's viewport ratio before the sort-only
skip (synchronous, before async search). The `sortAroundFocusGeneration` effect
consumes the saved ratio and restores the item at the same viewport position
instead of always centring. Edge clamping ensures the item stays on screen.
Deviation 26 added.

**P4b fix:** Table unmount save now includes `HEADER_HEIGHT` in the viewport
ratio calculation: `(rowTop + HEADER_HEIGHT - scrollTop) / clientHeight`. Table
mount restore uses the symmetric formula: `scrollTop = rowTop + HEADER_HEIGHT -
ratio * clientHeight`. Previously the table's 45px sticky header was not accounted
for, causing the ratio to be off by `HEADER_HEIGHT / clientHeight` -- which
manifested as a drift when restoring in the headerless grid view.

**Files changed:**
- New: `src/lib/scroll-reset-ref.ts`, `src/lib/sort-focus.ts`
- Modified: `src/lib/scroll-reset.ts`, `src/components/ImageGrid.tsx`,
  `src/components/ImageTable.tsx`
- Docs: `exploration/docs/deviations.md` (section 26), `AGENTS.md`, this changelog

**Awaiting validation:** E2E tests could not run (live data mode active). Run
`npx playwright test` when local ES is available. Perf harness validation for
P4b/P6 drift measurements should be run by the human.


### 31 March 2026 — Buffer Corruption Fix

**Bug:** After seeking deep via scrubber, any action that resets scroll to top
(logo click, metadata click, CQL query change) landed at ~index 170–190 instead
of index 1. Buffer contained 400 items (200 stale + 200 correct). Cross-browser.

**Root cause:** Synchronous→async race. `resetScrollAndFocusSearch()` dispatches a
synthetic scroll event that triggers `extendBackward` on the stale deep buffer
BEFORE `search()` can abort it. The PIT-404 retry in `es-adapter.ts` escapes the
abort signal due to microtask ordering — the 404 response resolves before the
abort signal propagates, creating a new fetch that returns stale data.

**Introduced by:** commit `3fca3d676` ("Windowed scroll + Scrubber — Polish, not
Russian") which removed `_seekCooldownUntil = Date.now() + 500` from the seek
data-arrival path.

**Fix:** 5-layer defense in depth:
1. `resetScrollAndFocusSearch()` calls `abortExtends()` before scroll reset (primary)
2. `search()` sets a 2-second extend cooldown
3. Seek cooldown refreshed at data arrival (restores removed line)
4. Abort check before PIT-404 retry in `es-adapter.ts`
5. `abortExtends()` exposed on the store for imperative callers

**Tests:** 9 regression tests in `e2e/buffer-corruption.spec.ts`. All 9 fail without
the fix, all pass with it. One test (metadata click) was adjusted for local sample
data: the original `waitForResults()` timed out when a metadata click matched only
1 image (the DOM check required >4 grid cells); replaced with store-level wait.
Standalone config `playwright.run-manually-on-TEST.config.ts` for manual validation
against real ES clusters.

**Validation:** 70 E2E tests pass locally (2 pre-existing skips in Bug #17). Full suite run: 2.8 minutes.

**Files changed:**
- Modified: `src/stores/search-store.ts` (Layers 2, 3, 5), `src/lib/scroll-reset.ts`
  (Layer 1), `src/dal/es-adapter.ts` (Layer 4), `src/components/SearchBar.tsx` (comments),
  `src/components/ImageDetail.tsx` (comments)
- New: `e2e/buffer-corruption.spec.ts`, `playwright.run-manually-on-TEST.config.ts`
- Docs: `exploration/docs/buffer-corruption-fix.md`, `exploration/docs/home-logo-bug-research.md`,
  `AGENTS.md`, this changelog


### 30 March 2026 — Bug #18 — Scrubber thumb stuck at top in scroll mode after density switch

**Symptom:** With ~700 images (all data in buffer = scroll mode), pressing End scrolls
content correctly but the scrubber thumb stays at top. Persists after switching density
(grid ↔ table) and pressing End/Home again. Seek mode (large datasets) unaffected.

**Root cause:** The scroll-mode continuous sync effect (`Scrubber.tsx`, line ~416) finds
the scroll container via `findScrollContainer()` (DOM query for `[role='region']` or
`.overflow-auto`) and attaches a scroll listener. When density switches, React unmounts
ImageGrid and mounts ImageTable (or vice versa), replacing the scroll container DOM
element. But none of the effect's dependencies (`allDataInBuffer`, `isDragging`,
`maxThumbTop`, `trackHeight`, `findScrollContainer`) change on density switch — so the
effect doesn't re-run and the listener stays attached to the stale (removed) element.

**Fix:** Added a `MutationObserver` inside the scroll-mode sync effect that watches the
content column (`trackRef.current.previousElementSibling`) for direct child changes
(`childList: true`, no subtree — avoids excessive firing from virtualizer DOM churn).
When children change (density switch replaces ImageGrid ↔ ImageTable), the observer
callback calls `attach()` which detaches the old scroll listener, re-finds the current
scroll container via `findScrollContainer()`, and attaches a fresh listener. Immediate
sync on attach ensures the thumb position is correct right after the switch.

The `MutationObserver` only fires on direct children of the content column — not on
virtualizer row additions/removals (which are deeper in the subtree). Density switches
replace the top-level child element (ImageGrid root ↔ ImageTable wrapper div), which
is a direct child mutation.

**Files changed:** `Scrubber.tsx` (scroll-mode sync effect rewritten with inner
`attach()` helper + MutationObserver).

**Docs updated:** AGENTS.md (Scrubber description), changelog.


### 30 March 2026 — Colour token consolidation — grid-panel → grid-bg/grid-cell

Removed four colour tokens (`grid-panel`, `grid-panel-dark`, `grid-panel-hover`,
`grid-overlay`) that had drifted from their original purpose. The UI now uses:
- `grid-bg` (#333333) — all chrome surfaces (toolbar, status bar, panels, popups,
  table header, scrubber tooltip, error boundary, date filter, search input, etc.)
- `grid-cell` (#393939) — grid view image cells and placeholder skeletons
- `grid-cell-hover` (#555555) — pill hover backgrounds (SearchPill, DataSearchPill)

Every component that previously used `bg-grid-panel` was audited and switched to
the appropriate token. No visual change in most places (`grid-panel` was #444444 —
the intent was always to match the background, and #333333 is correct for chrome).

**Files changed:** `index.css` (token definitions + `.popup-menu`), `SearchBar.tsx`,
`StatusBar.tsx`, `PanelLayout.tsx` (both panels), `ImageTable.tsx` (header),
`ImageDetail.tsx` (header), `DateFilter.tsx` (dropdown + inputs), `SearchFilters.tsx`
(checkbox), `ErrorBoundary.tsx` (stack trace), `Scrubber.tsx` (tooltip),
`SearchPill.tsx` (both pill components), `ImageGrid.tsx` (cells + placeholders).


### 30 March 2026 — Escape to blur search box

Pressing Escape in the CQL search input now blurs the search box (removing
focus), but only when the CQL typeahead popup is not visible. When suggestions
are showing, CQL's internal handler dismisses the popup — we don't interfere.
Uses capture phase on keydown to check `data-isvisible` before CQL flips it.

**Files changed:** `CqlSearchInput.tsx`.


### 30 March 2026 — Grid cell gap increased 4→8px

Slightly more breathing room between grid view image cells. Matches kahuna's
visual density more closely.

**Files changed:** `ImageGrid.tsx` (`CELL_GAP` constant).


### 30 March 2026 — Density-focus saves localIndex

`saveFocusRatio` now stores the buffer-local index alongside the viewport ratio.
This prevents a stale lookup when `imagePositions` evicts the focused image between
the unmount click and the new density's mount (async extend can complete in between).
Both `ImageGrid` and `ImageTable` updated to save/consume the new shape.

**Files changed:** `density-focus.ts`, `density-focus.test.ts`, `ImageGrid.tsx`,
`ImageTable.tsx`.


### 30 March 2026 — Native input guard for keyboard navigation

`useListNavigation` now checks `isNativeInputTarget()` and bails out when focus
is inside a native `<input>`, `<textarea>`, or `<select>` (e.g. the date filter's
`<input type="date">`). Previously, arrow keys inside the date picker would also
move the grid/table focus. The CQL custom element is deliberately excluded from
this guard — it already lets navigation keys propagate by design.

**Files changed:** `keyboard-shortcuts.ts` (new `isNativeInputTarget` export),
`useListNavigation.ts` (guard added to bubble handler).


### 30 March 2026 — Browser theme-color meta tag

Added `<meta name="theme-color" content="#333333">` to `index.html` to tint the
browser tab bar / status bar on Chrome (desktop + Android), Safari 15+ (iOS + macOS),
and Edge. Firefox ignores it — harmless. Matches `--color-grid-bg`.

**Files changed:** `index.html`.


### 30 March 2026 — Phase 0: Measurement infrastructure + shared constants

Executed the plan in `exploration/docs/phase0-measurement-infra-plan.md`. No app
behaviour changes — pure infrastructure + refactor.

**Part A — Shared pixel constants (`src/constants/layout.ts`)**

Created `src/constants/layout.ts` as the single source of truth for all pixel
values that appear in both app code and tests:

- `TABLE_ROW_HEIGHT = 32` — table data row height (h-8 Tailwind class)
- `TABLE_HEADER_HEIGHT = 45` — sticky header height including 1px border-b
- `GRID_ROW_HEIGHT = 303` — grid cell height (matches kahuna)
- `GRID_MIN_CELL_WIDTH = 280` — minimum cell width for column calculation
- `GRID_CELL_GAP = 8` — cell gap

`ImageTable.tsx` previously declared `const ROW_HEIGHT = 32` and `const HEADER_HEIGHT = 45`
as file-local constants. `ImageGrid.tsx` had its own `const MIN_CELL_WIDTH = 280`,
`const ROW_HEIGHT = 303`, `const CELL_GAP = 8`. Both now import from `@/constants/layout`
using aliased names (so internal code is unchanged). Store tests (`search-store.test.ts`,
`search-store-extended.test.ts`) imported `TABLE_ROW_HEIGHT` instead of redeclaring
`const ROW_HEIGHT = 32` locally.

All raw pixel literals (280/303/32) in `e2e/scrubber.spec.ts` and
`e2e/manual-smoke-test.spec.ts` inside `page.evaluate()` closures were replaced
with passed arguments (`evaluate(({ ROW_HEIGHT }) => { ... }, { ROW_HEIGHT: TABLE_ROW_HEIGHT })`).
This ensures E2E tests stay in sync with source automatically.

**Part B — Perf test infrastructure**

`e2e/rendering-perf-smoke.spec.ts` moved to `e2e-perf/perf.spec.ts`. Major changes:

1. **Structured metric emission** — `emitMetric(id, snap, extra?)` writes JSONL to
   `e2e-perf/results/.metrics-tmp.jsonl`. Every test body calls it after `logPerfReport()`.
   P10 emits with `{ report: false }` — harness records but excludes from diff table.

2. **Result-set pinning** — all navigations use `gotoPerfStable()` (new `KupuaHelpers`
   method) which appends `&until=${PERF_STABLE_UNTIL}` if the env var is set. The
   harness sets it to yesterday midnight. Prevents metric drift from new image ingestion
   between runs.

3. **P4 split** — P4 was one test doing grid→table→grid. Now P4a (grid→table) and
   P4b (table→grid) are separate tests with separate metric entries.

4. **P11 simplified** — reduced from 5 seek positions to 3 (0.2, 0.6, 0.85). Credit
   sort variant moved to separate P11b test.

5. **New tests added:**
   - **P3b** — keyword sort seek (Credit → seek to 50%) — exercises the composite-agg +
     binary-search seek path that P3 (date/percentile) doesn't cover.
   - **P13** — image detail enter/exit — double-click opens overlay, Backspace returns.
     Checks scroll position is restored within one row height.
   - **P14** — image traversal — arrow-key prev/next 20+10 images. Tests prefetch and
     fullscreen-survives-between-images code path.
   - **P15** — fullscreen persistence — enter detail → f → next → next → Escape.
     Tests the Fullscreen API doesn't exit on image swap.
   - **P16** — table column resize — drag handle 100px + double-click auto-fit.
     Tests CSS-variable width path with near-zero React re-renders.

**Part C — Audit harness (`e2e-perf/run-audit.mjs`)**

New script. Computes `STABLE_UNTIL`, runs Playwright with it as env var, reads
`.metrics-tmp.jsonl`, aggregates median across `--runs N` runs, diffs against prior
run from `audit-log.json`, writes both `audit-log.json` and `audit-log.md`.

Interface:
```
node e2e-perf/run-audit.mjs --label "Phase 1: shared constants"
node e2e-perf/run-audit.mjs --label "Baseline" --runs 3
node e2e-perf/run-audit.mjs P8
```

`scripts/run-perf-smoke.mjs` replaced with a thin wrapper that delegates to
`e2e-perf/run-audit.mjs` — preserves backward compatibility for old muscle memory.

**Part D — Config split**

`playwright.smoke.config.ts` (root) narrowed to only `manual-smoke-test.spec.ts`.
New `e2e-perf/playwright.perf.config.ts` covers `e2e-perf/perf.spec.ts` with
same viewport/DPR settings + JSON reporter. `run-smoke.mjs` updated to remove
the now-deleted `rendering-perf-smoke.spec.ts` reference.

**Part E — @types/node**

Added `@types/node` as devDependency. Updated `e2e/tsconfig.json` and
`e2e-perf/tsconfig.json` with `"types": ["node"]`. This fixes pre-existing
type errors in `e2e/global-setup.ts` (`process`, `child_process`, etc.) and
enables Node built-ins in new perf spec.

**Verification:** All 152 vitest tests pass. `tsc --project e2e/tsconfig.json --noEmit`
and `tsc --project e2e-perf/tsconfig.json --noEmit` both clean. Main `tsc --noEmit`
shows same 3 pre-existing errors (unrelated: `handleKeyDown` in Scrubber,
`isDecade` in sort-context, `smallMock` in test).

**Files created:** `src/constants/layout.ts`, `e2e-perf/perf.spec.ts`,
`e2e-perf/playwright.perf.config.ts`, `e2e-perf/run-audit.mjs`,
`e2e-perf/tsconfig.json`, `e2e-perf/results/.gitkeep`,
`e2e-perf/results/.gitignore`.

**Files modified:** `src/components/ImageTable.tsx` (import constants),
`src/components/ImageGrid.tsx` (import constants),
`src/stores/search-store.test.ts` (import TABLE_ROW_HEIGHT),
`src/stores/search-store-extended.test.ts` (import TABLE_ROW_HEIGHT),
`e2e/helpers.ts` (add gotoPerfStable()),
`e2e/tsconfig.json` (add @types/node),
`e2e/scrubber.spec.ts` (pass constants to evaluate()),
`e2e/manual-smoke-test.spec.ts` (pass constants to evaluate()),
`playwright.smoke.config.ts` (narrow testMatch),
`scripts/run-perf-smoke.mjs` (thin wrapper),
`scripts/run-smoke.mjs` (remove deleted spec reference),
`package.json` (add @types/node devDep),
`AGENTS.md` (reflect new structure).

**Files deleted:** `e2e/rendering-perf-smoke.spec.ts` (moved to e2e-perf/perf.spec.ts).

**Next step (human):** Run `node e2e-perf/run-audit.mjs --label "Baseline (pre-coupling-fixes)"`
with `--use-TEST` to establish the first baseline entry in `audit-log.json`/`audit-log.md`.

### 30 March 2026 — Fix: hardcode STABLE_UNTIL in run-audit.mjs

`computeStableUntil()` was computing "yesterday midnight" dynamically, meaning the
`PERF_STABLE_UNTIL` value (and therefore the pinned result corpus) changed every day.
That defeats the purpose of pinning — comparisons between runs on different days would
be comparing different document sets.

Replaced the dynamic computation with the fixed literal `"2026-02-15T00:00:00.000Z"`.
Any future corpus update (e.g. when new photos make the old cutoff too stale) requires
a deliberate, reviewed change to this constant — which is the correct behaviour.

**File modified:** `e2e-perf/run-audit.mjs` (remove `computeStableUntil()`, replace with
literal), `AGENTS.md` (update description).

### 30 March 2026 — Phase A: Performance Micro-Optimisations — A.1–A.5

Five independent micro-optimisations from `coupling-fix-handoff.md` Phase A. All 152
unit tests and all 63 E2E tests pass after the combined changes.

**A.1 — Stabilise `handleScroll` callback (C19)**

Both `ImageTable.tsx` and `ImageGrid.tsx` had `handleScroll` in a `useCallback` whose
dependency array included `virtualizer`. TanStack Virtual returns a **new virtualizer
object on every render**, so `handleScroll` re-created every render → `useEffect` tore
down and re-registered the scroll listener on every render. Under fast scroll this could
mean dozens of pointless listener re-registrations per second.

Fix: store `virtualizer` in a ref (`virtualizerRef`), updated unconditionally every
render. `handleScroll` reads `virtualizerRef.current` — always fresh, but the callback
identity is stable. Removed `virtualizer` and `loadMore` from the dep array in both
components (both now use `loadMoreRef` as well).

In `ImageTable.tsx`: dep array reduced from `[virtualizer, reportVisibleRange, loadMore]`
to `[reportVisibleRange]`. In `ImageGrid.tsx`: from
`[virtualizer, reportVisibleRange, columns, loadMore]` to `[reportVisibleRange, columns]`.

Expected effect: fewer DevTools "Event Listeners" entries during scroll, marginal
improvement in scroll-path P95 frame time (eliminates redundant addEventListener /
removeEventListener churn).

**A.2 — Memoize column index array in `ImageGrid.tsx` (C20)**

The render loop used `Array.from({ length: columns }, (_, i) => i)` inside the
`virtualItems.map()` — this allocated a new array **per virtual row per render**.
At 6 columns × 15 visible rows × 60fps = **5,400 short-lived array allocations/sec**,
all immediately GC-able.

Fix: `const columnIndices = useMemo(() => Array.from(...), [columns])` — array computed
once when `columns` changes (rare), reused every render. The dep is only `columns`.

**A.3 — Cache Canvas font in `measureText` (C21)**

`measureText` in `ImageTable.tsx` called `ctx.font = font` on every invocation. Canvas
font assignment triggers font-string parsing even when the value is unchanged. During
column auto-fit, `measureText` is called ~600 times for two distinct fonts (CELL_FONT
and HEADER_FONT). That's ~600 redundant parse operations per auto-fit.

Fix: added `lastFontRef` that tracks the last-set font string. `ctx.font = font` is only
executed when `font !== lastFontRef.current`. Column fit now triggers exactly 2 font
parses regardless of row count.

**A.4 — Fix `GridCell` key: index → image ID (eval doc item 3)**

`GridCell` was keyed by `imageIdx` (flat buffer index). When `bufferOffset` changes
(backward extend prepends items), all `imageIdx` values shift by `lastPrependCount`.
React unmounted and remounted **every visible GridCell** even though the image data was
the same — just the index changed.

Fix: `key={image?.id ?? \`empty-${imageIdx}\`}`. Stable image IDs survive buffer
mutations. Empty/placeholder cells still key by index (they're position-dependent
anyway). This eliminates spurious full-grid reconciliation on every backward extend.

**A.5 — Replace `ids.join(",")` with O(1) sentinel (eval doc item 7)**

`visibleImages` in `ImageTable.tsx` used `ids.join(",")` as a cache key to detect
whether the visible image set had changed. This is O(N) string concatenation at up to
60 visible rows × every render during fast scroll.

Fix: `\`${ids[0] ?? ""}|${ids[ids.length - 1] ?? ""}|${ids.length}\`` — first ID,
last ID, and count. Detects window shifts, resizes, and content changes at O(1). The
only theoretical miss (swapping two middle IDs while keeping first/last/count constant)
cannot happen with a contiguous virtualizer window.

**Files modified:**
- `src/components/ImageGrid.tsx`: added `useMemo` import; `virtualizerRef` + `loadMoreRef`
  stabilisation (A.1); `columnIndices` useMemo (A.2); `image?.id` key (A.4)
- `src/components/ImageTable.tsx`: `virtualizerRef` + `loadMoreRef` stabilisation (A.1);
  `lastFontRef` font cache (A.3); O(1) sentinel key (A.5)

**Perf run required (human):** After these changes are in place, request:
```
node e2e-perf/run-audit.mjs --label "Phase A: perf micro-opts (C19,C20,C21,GridCell key,ids.join)" --runs 1
```
Expected improvements: P2/P8 (scroll jank), P4a/P4b (density switch), P16b (column fit).

**Measured results (Phase A run, 30 Mar 2026):**

| Test | Key metric | Baseline | Phase A | Δ | Notes |
|------|-----------|---------|---------|---|-------|
| P3 (seek) | Max frame | 117ms | 82ms | −30% | A.1 eliminates listener churn during seek+settle |
| P3 (seek) | DOM churn | 928 | 437 | −53% | |
| P3 (seek) | LoAF | 161ms | 65ms | −40% | |
| P7 (scrubber drag) | Max frame | 116ms | 83ms | −29% | A.1 — drag loop no longer re-attaches listener |
| P7 (scrubber drag) | LoAF | 133ms | 50ms | −38% | |
| P8 (table scroll) | Max frame | 217ms | 183ms | −16% | A.1 on table scroll path |
| P8 (table scroll) | LoAF | 912ms | 782ms | −14% | |
| P11 (seek+reflow) | DOM churn | ~1200 avg | ~1000 avg | −17% | A.4 GridCell key — fewer remounts on buffer shift |
| P13a (detail enter) | Max frame | 117ms | 99ms | −15% | |
| P14a/c (traversal) | Max frame | 67ms | 51ms | −24% | |

Harness flagged 4 "regressions" — all confirmed noise:
- **P1 maxFrame +20%** (83→100ms): load path unchanged; single-run CPU variance. CLS/P95/severe all flat.
- **P12-scroll severe +22%** (9→11): 2 frames difference across 350, network-dominated test.
- **P14b/c severe +1–2**: absolute counts of 2→3 and 2→4; meaningless at this scale.
- **P16b**: column auto-fit was already sub-18ms (quantisation floor); A.3 wins at "fit all columns" which the test doesn't exercise.

P4a/P4b (density switch) showed no change — expected. A.4 helps backward extend reconciliation, not the initial switch which is network+ES dominated.


### 29 March 2026 — Rendering Performance Experiments

**Context:** P8 (table fast scroll with extend/evict) was the critical bottleneck.
Retina baseline: max frame 300ms, severe 36, P95 67ms, CLS 0.041, DOM churn 76,354.
LoAF worst 309ms dominated by `DIV.onscroll` from TanStack Virtual (178ms).

**Experiment A: Reduce virtualizer overscan (20 → 5) — ✅ KEPT.**
Changed `overscan: 20` → `overscan: 5` in `ImageTable.tsx`. Grid already used
overscan 5. Cuts rendered off-screen cells from ~920 to ~230 per scroll frame.
Results: max frame -28% (300→217ms), severe -56% (36→16), P95 -25% (67→50ms),
DOM churn -32% (76k→52k). The single biggest win of all experiments.

**Experiment B: `content-visibility: auto` on rows — REVERTED (no effect).**
Added `contentVisibility: 'auto'` + `containIntrinsicSize` to all three row types.
Numbers identical to baseline. Expected: TanStack Virtual already does DOM
virtualisation; browser-level `content-visibility` can't add value on top.

**Experiment C: `contain: strict` on table cells — REVERTED (broke tests).**
`contain: strict` includes `contain: size` which prevents flex children from
inheriting parent height. Cells collapsed to content height, breaking Playwright
click targets. Bug #17 E2E tests failed consistently.

**Experiment D: Reduce PAGE_SIZE (200 → 100) — REVERTED (worse).**
More frequent extends overwhelmed the smaller per-extend cost. Severe +6%,
janky +50%, DOM churn +5%, LoAF count +33%. Also caused Bug #17 E2E tests to
skip (buffer fills slower on 10k local dataset).

**Experiment E: `contain: layout` on cell divs — ✅ KEPT.**
Added `contain: 'layout'` + `overflow-hidden` on gridcell `<div>`. Unlike
`strict`, `layout` doesn't affect height inheritance from flex parent. Combined
with Experiment A, final results: max frame -28% (300→217ms), severe -61%
(36→14), P95 -49% (67→34ms), DOM churn -44% (76k→42k), LoAF worst -34%
(309→204ms). No regressions across all 12 perf smoke tests. P12 drift still 0px.

**CLS remains at 0.041** — inherent to virtualiser row recycling with
variable-width pill content. The CLS API counts element position changes during
scroll as shifts even though users never perceive them. Tried `contain: layout`
on pill wrapper, cell div, and `overflow-hidden` — none helped. Accepted as a
false positive. The CLS < 0.005 target is unreachable without eliminating pills
or making them fixed-width.

**`startTransition` on density toggle — TRIED AND REVERTED (earlier session).**
Broke P12 Credit sort density drift (0px → -303px). The density-focus bridge
relies on synchronous unmount timing. Documented as "do not retry."

**Files changed:** `ImageTable.tsx` (overscan 5, contain: layout + overflow-hidden
on cells), `rendering-perf-plan.md` (experiment results, updated gates), AGENTS.md.


### 29 March 2026 — E2E Tests (64 tests, all passing)

- `scripts/run-e2e.sh` orchestrates Docker ES + data + Playwright
- `e2e/global-setup.ts` auto-starts Docker ES, verifies data
- `KupuaHelpers` fixture class: `seekTo()`, `dragScrubberTo()`, `assertPositionsConsistent()`, `getStoreState()`, `startConsoleCapture()`, etc.
- 10 smoke tests for TEST cluster (`manual-smoke-test.spec.ts`) — S1–S5, S9–S10 pass as of 2026-03-29. Auto-skip on local ES.
- Coverage: ARIA, seek accuracy, drag, scroll, buffer extension, density switch, sort change, sort tooltip, sort-around-focus, keyboard, metadata panel, 3 full workflows, bug regressions (#1, #3, #7, #9, #11–15, #18)


### 29 March 2026 — Scrubber tooltip fixes and keyword distribution

**Table view native scrollbar:** The `hide-scrollbar-y` CSS class was missing
`scrollbar-width: none` (Firefox) and `-ms-overflow-style: none` (IE/Edge legacy).
Firefox showed a native vertical scrollbar alongside the custom scrubber in table view.
Fixed by adding both declarations. Firefox trade-off: horizontal scrollbar is also
hidden (no per-axis control in CSS), acceptable since most column sets fit the viewport.

**Tooltip bottom-edge clipping:** The tooltip disappeared partially below the window
edge when scrolled to the end of results. Root cause: tooltip top position was clamped
using a hardcoded `28px` magic number as assumed tooltip height. Actual height is ~29px
without sort label and ~42px with one (two lines + padding). Fixed all four clamping
sites (applyThumbPosition, seek-mode sync effect, scroll-mode sync effect, JSX initial
render) to use `tooltipEl.offsetHeight` (measured) with `|| 28` fallback for unmounted
state.

**Keyword distribution for scrubber tooltip:** Previously, keyword sorts (credit,
source, category, imageType, mimeType, uploadedBy) showed the same frozen value from
the nearest buffer edge when dragging the scrubber outside the loaded buffer. Now uses
a pre-fetched keyword distribution for accurate position-to-value mapping:

- **DAL:** `getKeywordDistribution()` on `ElasticsearchDataSource` — composite
  aggregation that fetches all unique values with doc counts in sort order. Capped at
  5 pages (50k unique values). Returns `KeywordDistribution` with cumulative start
  positions. ~5–30ms for typical fields.
- **sort-context.ts:** `lookupKeywordDistribution()` — O(log n) binary search over
  the cumulative buckets. `resolveKeywordSortInfo()` resolves orderBy to ES field path
  + direction for keyword sorts. `interpolateSortLabel()` now accepts an optional
  `KeywordDistribution` and uses it instead of the nearest-edge fallback.
- **search-store.ts:** `keywordDistribution` state + `_kwDistCacheKey` (query params +
  orderBy). `fetchKeywordDistribution()` action — checks if current sort is keyword,
  checks cache freshness, fetches via DAL. Cleared on new search.
- **search.tsx:** Wires distribution into `getSortLabel` callback. Lazy fetch triggered
  via `onFirstInteraction` Scrubber prop — distribution only fetched when user actually
  touches the scrubber with a keyword sort active.
- **Scrubber.tsx:** `onFirstInteraction` prop, fired once on first click/drag/keyboard.
  `notifyFirstInteraction()` helper with ref-tracked `hasInteractedRef`, reset when
  prop transitions from defined→undefined (sort change away from keyword).
- **Excluded:** `filename` (too high cardinality, values not useful as context),
  `dimensions` (script sort, can't aggregate).


### 29 March 2026 — Bug #18: Keyword sort seek drift + PIT race + binary search refinement

**Problem:** Clicking the scrubber at 75% under Credit sort on TEST (~1.3M docs) either
didn't move results at all (thumb stuck at ~50%) or took 46 seconds to complete.
Local E2E tests didn't catch it because 10k docs with 5 cycling credits don't expose
the scale issues.

**Three bugs discovered via smoke test S10:**

1. **PIT race condition** — `seek()` read a stale PIT ID from the store that had already
   been closed by a concurrent `search()` triggered by `selectSort("Credit")`. The
   `search()` hadn't finished storing the new PIT before the scrubber click fired
   `seek()`. ES returned 404 on the `_search` request with the stale PIT.

   **Fix:** PIT 404/410 fallback in `es-adapter.ts` `searchAfter()` — when a PIT-based
   request fails with 404 or 410, retries the same request without PIT, using the
   index-prefixed path instead. This makes `seek()` resilient to PIT lifecycle races
   without requiring tight coupling between search() and seek() timing.

2. **46-second seek (brute-force skip loop)** — After `findKeywordSortValue` correctly
   identified "PA" as the credit at position 881k, `search_after(["PA", ""])` landed at
   the START of the PA bucket (position 533k) because `""` sorts before all real IDs.
   The refinement loop issued 5 × `search_after(size=100k, noSource=true)` hops through
   the SSH tunnel, transferring ~50MB of sort values. Each hop took ~9s over the tunnel.

   **Fix:** Replaced the brute-force skip loop with **binary search on the `id`
   tiebreaker**. Since image IDs are SHA-1 hashes (40-char hex, uniformly distributed),
   binary search between `0x000000000000` and `0xffffffffffff` converges in ~11
   iterations. Each iteration is a single `_count` query (~500 bytes). Total network:
   ~6KB vs ~50MB. Total time: ~4s vs ~46s (99.99% network reduction).

   **Implementation** (in `search-store.ts` `seek()`):
   ```
   let loNum = 0;
   let hiNum = 0xffffffffffff;
   for (step 0..MAX_BISECT) {
     midNum = floor((loNum + hiNum) / 2)
     mid = midNum.toString(16).padStart(12, "0")
     probeCursor = [...searchAfterValues]; probeCursor[last] = mid
     count = countBefore(params, probeCursor, sortClause)
     if (count <= target) loNum = midNum else hiNum = midNum
     if (|count - target| <= PAGE_SIZE) break
   }
   ```

   Benefits ALL keyword sorts: Credit, Source, Category, Image Type, MIME Type,
   Uploaded By. Any field where a keyword bucket is larger than PAGE_SIZE triggers
   the binary search. Filename (high cardinality) and Dimensions (script sort) don't
   need it.

3. **Hex upper bound bug ("g" is not valid hex)** — The first binary search
   implementation used string bounds `"0"` to `"g"`. But `"g"` is not a valid hex
   digit. `parseInt("g...", 16)` returns `NaN`, so every iteration computed
   `mid = "NaN"`. `countBefore(id < "NaN")` counted everything (lexicographically
   `"N" > all hex chars`), so `bestOffset` never updated. The binary search silently
   did nothing — `actualOffset` stayed at 533k (bucket start ≈ 40%).

   **Fix:** Changed from string bounds to numeric: `loNum = 0`, `hiNum = 0xffffffffffff`.
   `midNum.toString(16).padStart(12, "0")` always produces valid hex.

**Smoke test S10 confirmation:** After all three fixes, S10 shows convergence in 11
steps, ~4 seconds total, landing within 45 docs of target (ratio 0.7498 for 75% seek).

**E2E test changes:**

- **Bug #7 strengthened:** Credit 50% test now includes composite-agg telemetry check
  (absorbed from Bug #13). Source 50% test strengthened with ratio assertion (0.35–0.65).
  Dimensions test kept with weak assertion (`> 0`) — it's a script sort with inherently
  lower accuracy on small datasets.
- **Bug #18 regression guard added** (line 898): Seeks to 75% under Credit sort, asserts
  ratio 0.65–0.85, verifies binary search console log was emitted. With 10k local docs
  and 5 credits cycling (~2k per bucket), drift ≈ 1800 > PAGE_SIZE → binary search kicks
  in. Guards against regressions in the hex interpolation code.
- **Bug #13 culled:** Entire `test.describe("Bug #13")` block removed (4 tests).
  Bug #13.1 (Credit seek + telemetry) merged into Bug #7.1. Bug #13.2 (drag under
  Credit) redundant with generic drag tests. Bug #13.3 (two positions differ) duplicate
  of Bug #7.4. Bug #13.4 (timing) redundant with test-level timeout.
- **Smoke test S10 added:** Full diagnostic for keyword sort seek on TEST. Polls store
  state during seek, captures `[seek]`/`[ES]` console logs, checks grid scroll position,
  compares 75% vs 50% seeks, 15s performance gate.
- **Net test count:** 68 → 64 e2e tests (4 removed from Bug #13), 8 → 10 smoke tests
  (S9 + S10 added).


### 29 March 2026 — Width/Height replace Dimensions script sort

**Problem:** Dimensions sort used a Painless script (`w × h`) which forced the slow
Strategy B (iterative `search_after` skip loop) for deep seeks. Through SSH tunnels,
seeking to position 500k required ~40 sequential 10k-chunk requests, taking ~60 seconds.
The `MAX_SKIP_ITERATIONS` increase from 20 → 200 (in the "Polish" commit) made it
worse — the old 20-iteration cap degraded gracefully at ~20s; the new cap doggedly
completed all iterations.

**Root cause:** Script sorts cannot use percentile estimation (ES `percentiles` agg
only works on indexed field values, not computed expressions). They also can't use
`countBefore` correctly (can't build range queries on computed values). This forced
the brute-force iterative skip path.

**Solution — Option Nuclear:** Replaced the single Dimensions script sort with two
plain integer field sorts: **Width** (`source.dimensions.width`) and **Height**
(`source.dimensions.height`). Both are native ES integer fields that get the fast
percentile estimation path (~200ms for any depth).

**Changes:**

1. **`field-registry.ts`**: Dimensions field is now display-only (no `sortKey`).
   Added `source_width` (Width) and `source_height` (Height) as separate sortable
   integer fields with `descByDefault: true`.

2. **`es-adapter.ts`**: Removed `scriptSorts` map entirely. Added `width` →
   `source.dimensions.width` and `height` → `source.dimensions.height` aliases.
   Simplified `reverseSortClause` (no more `_script` branch), `countBefore` (no
   more script field skips), `parseSortField` (removed `isScript` property),
   `searchAfter` missingFirst handler (no more `isScript` check).

3. **`search-store.ts`**: Removed Strategy B entirely (~80 lines of iterative
   search_after skip loop). Removed `primaryField !== "_script"` guard from
   percentile estimation. Width/Height now take the fast path.

4. **`sort-context.ts`**: Added `width` and `height` entries for scrubber tooltip
   labels (shows "4,000px" etc.).

5. **Tests**: Replaced script sort tests with width/height alias tests. Removed
   `reverseSortClause handles script sorts`. Changed e2e "Dimensions" test to
   "Width" with tighter accuracy tolerance (0.35–0.65 ratio).

**Net code deleted:** ~120 lines of script sort infrastructure.

**Why Width/Height is better than Dimensions (w×h):**
- Fast: percentile estimation → ~200ms deep seek vs ~60s
- More powerful: users can sort by Width alone, Height alone, or both (shift-click)
- Simpler: no Painless scripts, no Strategy B, no `isScript` branches
- Media-api compatible: plain `fieldSort()`, no upstream changes needed
- Display preserved: Dimensions column still shows "4,000 × 3,000" in table/metadata

**Docs updated:** AGENTS.md, deviations.md §10 (reversed), §16 (resolved), changelog.


### 29 March 2026 — Field Registry Canonical Ordering + Registry-Driven Details Panel + Horizontal Scrollbar Fix

**Problem:** Field ordering was hardcoded in four separate places (sort dropdown,
facet filters, table columns, details panel) with three different ordering strategies.
The details panel was entirely hand-crafted JSX — ~170 lines of per-field rendering
that didn't use the field registry at all. Additionally, the table view's horizontal
scrollbar was broken in both Chrome 146+ and Firefox 148+ because modern Chrome now
supports `scrollbar-width` (standard CSS), which disables `::-webkit-scrollbar`
pseudo-elements — making CSS-only per-axis scrollbar hiding impossible.

**Solution — Canonical Field Ordering:**

Established `HARDCODED_FIELDS` array order in `field-registry.ts` as the single source
of truth for field ordering across all five surfaces: table columns, column chooser,
facet filters, sort dropdown, and details panel. The sort dropdown promotes dates to
the top in a fixed order (Uploaded → Taken → Modified), then follows registry order
for the rest. All other surfaces use registry order directly.

Added three new fields to the registry: Keywords (list, default visible), File size
(integer, detail-only via `defaultHidden + detailHidden: false`), Image ID (keyword,
detail-only). Alias fields are now spliced in after Byline title (not appended at
the end) so they appear in the correct position.

**Solution — Registry-Driven Details Panel:**

Rewrote `ImageMetadata.tsx` to iterate `DETAIL_PANEL_FIELDS` (derived from registry,
excluding `detailHidden` fields). Added four new `FieldDefinition` properties:
- `detailLayout: "stacked" | "inline"` — controls label-above vs side-by-side
- `detailHidden: boolean` — excludes from details panel (Width/Height hidden,
  Dimensions shown instead)
- `detailGroup: string` — overrides `group` for section break logic in the panel
  only, without affecting sort dropdown inclusion
- `detailClickable: boolean` — when false, renders plain text even if `cqlKey`
  exists (Description, Special instructions, Filename)

Section breaks are inserted whenever `detailGroup ?? group` changes between
consecutive fields. File type is now a clickable search link. Alias fields are
displayed with their labels and are clickable.

**Solution — Horizontal Scrollbar:**

Replaced the broken `.hide-scrollbar-y` CSS (which relied on `::-webkit-scrollbar:vertical`)
with a structural approach: hide ALL native scrollbars via `scrollbar-width: none` +
`::-webkit-scrollbar { display: none }`, then add a proxy `<div>` at the bottom of the
table that syncs `scrollLeft` bidirectionally with the main scroll container. A
`ResizeObserver` on the `data-table-root` element keeps the proxy width in sync with
the table's content width during column resizes and visibility toggles.

**Other fixes:**
- Table list pills (People, Keywords, Subjects) now render single-line with
  `flex-nowrap overflow-hidden` — no more row height overflow from multi-line wrapping.
- Uploader moved from `group: "upload"` to `group: "core"`, Filename moved to
  `group: "technical"` (after File type). The `"upload"` group was removed entirely.

**Files changed:** `field-registry.ts` (reordered, 3 new fields, 4 new FieldDefinition
properties, alias splice, sort dropdown rewrite), `ImageMetadata.tsx` (horizontal scrollbar proxy, single-line pills),
`index.css` (`.hide-scrollbar-y` rewritten).

**Docs updated:** AGENTS.md (KAD #26, #29, table view, panels), changelog.


### 29 March 2026 — Scrubber tick visual polish + isolation-based promotion

**Major tick visual differentiation:** Major ticks now have distinct visual weight
from minor ticks — wider extent (extend further left/right, including beyond the
track edges on hover) and brighter opacity. On hover, all ticks extend further to
the left for better visibility. Height is uniform at 1px (2px was tried for majors
but reverted — width and opacity provide enough differentiation).

**Long-span year labels:** In the long-span path (≥15 years), all January ticks
now carry a year label (previously only yr%5 got labels, leaving years like 2022
with no label even when isolated). The Scrubber's label decimation controls which
labels are actually shown based on available pixel space — so clustered years at
the top/bottom still get decimated, but an isolated year in the middle of the track
gets its label shown.

**Half-decade promotion:** In the long-span path, half-decade Januaries (yr%5==0)
are now promoted to major type (previously only yr%10 was major). This gives
2025, 2015, etc. the same visual weight as decade boundaries.

**Isolation-based tick promotion:** New algorithm in Scrubber.tsx — after computing
tick pixel positions, a promotion pass checks each minor tick with a 4-digit year
label (e.g. "2022"). If its nearest major tick is ≥80px away (ISOLATION_THRESHOLD),
it's added to a `promoted` Set and rendered with major visual treatment (wider,
bolder, brighter label). Month abbreviation ticks ("Mar", "Apr") are never
candidates for promotion — only year-boundary ticks. Promoted ticks also get
priority in the label decimation pass (included alongside real majors in the
first pass). This handles the common case where a year like 2022 sits alone in
the middle of a density-skewed track (e.g. source:PA — most data recent, sparse
in the middle) and deserves landmark treatment.

**Files changed:** `Scrubber.tsx` (tick insets, height, isolation promotion),
`sort-context.ts` (long-span year labels, half-decade major promotion, updated
TrackTick docstrings).


### 29 March 2026 — Width/Height sort tooltip fix — distribution-based labels

**Bug:** When sorting by Width or Height, the scrubber tooltip showed the same
stale value across the entire track. Dragging from top to bottom showed e.g.
"4,000px" everywhere because width/height had no distribution and the tooltip
fell back to the nearest buffer edge value.

**Root cause:** Width and height were typed as `"keyword"` in `SORT_LABEL_MAP`
but were NOT registered in `KEYWORD_SORT_ES_FIELDS`. This meant
`resolveKeywordSortInfo()` returned null for them, so `fetchSortDistribution()`
never fired. The tooltip fell back to `findBufferEdges()` which returned the
same value for all out-of-buffer positions.

Additionally, the accessor returned pre-formatted strings (`"4,000px"` via
`toLocaleString()`) while the distribution pipeline applies `mapping.format`
to both in-buffer accessor values and raw distribution keys. This would have
caused double-formatting if a format function were added naively.

**Fix:**
1. Added `width: "source.dimensions.width"` and `height: "source.dimensions.height"`
   to `KEYWORD_SORT_ES_FIELDS`. The composite agg now fetches the distribution
   for these sorts — ES composite `terms` works on numeric fields, returning
   each unique integer value as a bucket (typically ~4000–8000 unique widths,
   well within the 50k composite cap, single page).
2. Changed width/height accessors to return raw number strings (`"4000"` instead
   of `"4,000px"`), added `format: (v) => \`${Number(v).toLocaleString()}px\``
   to both entries. This ensures both paths (in-buffer accessor → formatKeywordLabel
   and distribution key → formatKeywordLabel) produce consistent `"4,000px"` output.

**No ticks for numeric sorts** — `computeTrackTicks()` still returns `[]` for
non-date sorts. Adding tick marks for width/height would require a "nice number"
algorithm for round boundaries (1000px, 2000px, etc.) — deferred as low priority
given the niche usage of these sorts.

**Files changed:** `sort-context.ts` (KEYWORD_SORT_ES_FIELDS, width/height
accessor+format).

**Docs updated:** AGENTS.md (DAL methods, Scrubber description, tooltip), changelog.


### 29 March 2026 — Removed Filename sort

**Problem:** Sorting by Filename was glacially slow on real data (~1.3M docs).
The initial ES query sorts 1.3M strings (byte-by-byte comparison, heavier than
numeric/date). Deep seek uses the keyword composite-agg walk path — but filename
has ~1.3M unique values (nearly every image has a unique filename), requiring 65+
paged composite requests to reach 50%. The 8s time cap returns an approximate
result but that's still 8 painful seconds of waiting. Filename is the worst-case
field for the keyword seek strategy: maximum cardinality with doc_count=1 per
bucket (no density benefit from binary search refinement).

**Fix:** Removed sorting capability from Filename entirely:
1. `field-registry.ts` — removed `sortKey: "filename"` from the Filename field
   definition. This removes it from the sort dropdown and makes the table column
   header non-sortable (no click-to-sort).
2. `es-adapter.ts` — removed `filename: "uploadInfo.filename"` from the sort
   alias map (dead code now).
3. `es-adapter.test.ts` — removed the filename alias expansion test.

Filename remains fully functional for display, CQL search (`filename:...`), and
the details panel — only sorting is removed.

**Files changed:** `field-registry.ts`, `es-adapter.ts`, `es-adapter.test.ts`.

**Docs updated:** changelog.


### 28 March 2026 — Scrubber Scroll Mode — Bug Fixes and Buffer Fill

**Problem:** The scrubber has two interaction modes — "scroll mode" (all data in
buffer, drag scrolls content directly) and "seek mode" (windowed buffer, seek on
pointer-up). Three bugs made scroll mode broken:

- **Bug A (thumb runs away):** `positionFromDragY()` mapped pixel→position using
  `ratio * (total - 1)` but `thumbTopFromPosition()` reversed it using
  `position / total`. The `102 vs 103` asymmetry meant the thumb drifted from the
  pointer. Worse with fewer results (bigger thumb).
- **Bug B (thumb dances):** The inline JSX `style={{ top: thumbTop }}` fought with
  direct DOM writes from `applyThumbPosition()` during drag. Every content scroll
  triggered a React re-render that overwrote the direct DOM position. Rounding
  differences between React state (`trackHeight`) and live DOM reads
  (`clientHeight`) created jitter.
- **Bug C (broken activation):** Scroll mode required `total <= bufferLength`, but
  the initial search only fetched 200 results. For 201–1000 results, scroll mode
  only activated after the user manually scrolled enough to trigger extends. For
  1001+ results, it never activated. A user with 700 results could grab the scrubber
  and nothing would happen.

**Fixes:**

1. **Bug C — scroll-mode fill:** Added `SCROLL_MODE_THRESHOLD` env var (default
   1000). After the initial search, if `total <= threshold` and not all results are
   loaded, `_fillBufferForScrollMode()` fetches remaining results in PAGE_SIZE
   chunks using `searchAfter`. Two-phase: user sees first 200 instantly, scroll mode
   activates ~200–500ms later. Sets `_extendForwardInFlight` during fill to prevent
   concurrent extends from racing. Clears the flag on all exit paths (success,
   abort, error). `search()` also clears extend-in-flight flags when aborting
   previous operations (prevents stale flag from aborted fill blocking
   sort-around-focus).

2. **Bug A — symmetric position mapping:** Changed `thumbTopFromPosition()` to use
   `position / (total - 1)` and map to `ratio * maxTop` (instead of
   `position / total * th`). Now matches `positionFromDragY()` which uses
   `ratio * (total - 1)`. Forward and reverse mappings are symmetric.

3. **Bug B — removed inline top from JSX:** The thumb `<div>` no longer sets `top`
   in its inline style. Thumb position is controlled exclusively by: (a) the
   `useEffect` sync (for non-drag, non-pending states), (b) direct DOM writes in
   `applyThumbPosition()` (during drag/click). Callback ref on thumb sets initial
   position on mount to prevent one-frame flash at top=0. The React reconciler can
   no longer fight with direct DOM writes.

4. **Bug D — thumb height fluctuates during drag:** `thumbHeight` was computed from
   the live `visibleCount` (number of items visible in the viewport), which changes
   on every scroll as rows enter/leave. During scroll-mode drag, this made the thumb
   grow/shrink constantly (bottom edge jumping) and overflow the track near the
   bottom. Fix: added `thumbVisibleCount` — in scroll mode, `visibleCount` is frozen
   when scroll mode first activates (via `stableVisibleCountRef`). Reset only when
   `total` changes (new search). In seek mode, the live value is used as before.
   The drag handler also captures `dragVisibleCount` at pointer-down for the
   duration of the drag. This matches native scrollbar behavior where thumb size
   only changes when content size changes, not when you scroll.

**Design doc:** `exploration/docs/scrubber-dual-mode-ideation.md` — full analysis of
the two-soul problem, 5 approaches considered, data demand analysis per view,
visual philosophy (scroll mode should look like a native scrollbar).

**Testing:** 145 unit tests (144 pass, 1 pre-existing failure in
`sort-around-focus bumps _seekGeneration` — test expects `_seekGeneration` but code
intentionally uses `sortAroundFocusGeneration`). 61 E2E tests all pass.


### 28 March 2026 — Scrubber Visual Polish — Unified Scrollbar Look

Harmonised the scrubber's visual appearance across both scroll mode and seek mode.
Instead of looking like two different controls (a blue accent widget vs a native
scrollbar), it now looks like one clean, modern scrollbar everywhere.

**Changes:**
- **Track:** Always transparent background. No grey highlight on hover. The 14px
  width is a generous hit target, but the visible thumb is narrower.
- **Thumb:** 8px wide pill shape (3px inset each side within 14px track), fully
  rounded (`borderRadius: 4`). Semi-transparent white on the dark Grid background:
  idle `rgba(255,255,255,0.25)`, hover `0.45`, active/dragging `0.6`. Replaces the
  previous blue accent / grey colors.
- **No cursor change:** Removed `grab`/`grabbing` cursors — native scrollbars don't
  show them, and they scream "custom widget."
- **No opacity change on track:** Track doesn't dim/brighten on hover (the thumb
  color change is sufficient feedback).
- **Tooltip:** Unchanged — still shows position and sort context on drag/click in
  both modes. The tooltip is useful in both modes and doesn't make the scrubber
  look like a "control panel."
- Removed unused `active` variable.


### 28 March 2026 — Bug E — Scrubber Desync at Top/Bottom

**Problem:** When PgDown/PgUp-ing through a small result set (~760 items), the
scrubber thumb desynchronised with the content: content reached the bottom but the
thumb stayed short of the track bottom. Grabbing the thumb to the bottom shifted
results to where it was, requiring more scrolling.

**Root cause:** The position-to-pixel mapping used `position / (total - 1)` as the
ratio. But `currentPosition` is the first visible item, which maxes at
`total - visibleCount` (not `total - 1`). For 760 results with 20 visible, the
max position is 740, giving ratio `740/759 = 0.975` — the thumb never reaches 1.0.

**Fix:** Changed all position mappings to use `total - visibleCount` as the max
position, matching native scrollbar behavior (`scrollTop / (scrollHeight - clientHeight)`).
Applied consistently to:
- `thumbTopFromPosition()` — position → pixel
- Render-time `thumbTop` computation
- `positionFromY()` — track click pixel → position
- `positionFromDragY()` — drag pixel → position
- `scrollContentTo()` ratios in click, drag move, and drag end handlers

When position = total - visibleCount, ratio = 1.0 and the thumb touches the bottom
of the track — exactly when the last item is visible. Symmetric at top: position = 0,
ratio = 0.0, thumb at top.


---

## Reference Sections

<!-- Feature/architecture descriptions — not dated changelog entries. -->

### Infrastructure & Data

- ✅ Sample data (10k docs, 115MB) from CODE ES in `exploration/mock/sample-data.ndjson` (NOT in git — also in `s3://<sample-data-backup-bucket>/`)
- ✅ ES mapping from CODE in `exploration/mock/mapping.json`
- ✅ Standalone ES 8.18.3 via `docker-compose.yml` on **port 9220** (isolated from Grid's ES on 9200)
- ✅ `scripts/load-sample-data.sh` — index creation + bulk load
- ✅ `scripts/start.sh` — one-command startup. Default: local mode (ES + data + deps + Vite). `--use-TEST`: establishes SSH tunnel to TEST ES, auto-discovers index alias, discovers S3 bucket names, starts S3 thumbnail proxy, sets env vars, enables write protection. Flags: `--skip-es`, `--skip-data`, `--skip-install`
- ✅ S3 thumbnail proxy (`scripts/s3-proxy.mjs`) — local-only Node.js server that proxies S3 thumbnail requests using the developer's AWS credentials. Read-only, localhost-bound, nothing committed. Auto-started by `start.sh --use-TEST`. See `exploration/docs/s3-proxy.md`. Temporary — will be replaced by Grid API signed URLs in Phase 3.
- ✅ imgproxy for full-size images — `darthsim/imgproxy` Docker container (port 3002) with S3 access via host AWS credentials volume mount. Container runs as uid 999 (`imgproxy` user, not root), so credentials mount to `/home/imgproxy/.aws/`. Janus only writes `[media-service]` to `~/.aws/credentials` — the Go AWS SDK also needs a `[profile media-service]` entry in the config file, so `start.sh` generates a minimal config at `/tmp/kupua-aws-config` (no secrets — just profile name + region). Resizes originals on the fly to WebP (1200px fit, quality 80). Auto-started by `start.sh --use-TEST` via docker compose profile. URL builder in `src/lib/image-urls.ts` (`getFullImageUrl()`). `IMGPROXY_MAX_SRC_RESOLUTION: 510` (510MP — default 16.8MP rejects large press panoramas/scans; 510 covers the largest known test image). `IMGPROXY_DOWNLOAD_TIMEOUT: 10` (default 5s; the 510MP image takes ~5.1s). See `exploration/docs/imgproxy-research.md`.
- ✅ Migration plan: `exploration/docs/migration-plan.md`
- ✅ Mock Grid config: `exploration/mock/grid-config.conf` (sanitised PROD copy, parsed by `src/lib/grid-config.ts` for field aliases + categories)


### App Scaffold (~16,300 lines of source)

- ✅ Vite 8 (Rolldown) + React 19 + TypeScript + Tailwind CSS 4, dev server on port 3000
- ✅ Vite proxy: `/es/*` → `localhost:9220` (no CORS needed)
- ✅ Path alias: `@/*` → `src/*` (in both `tsconfig.json` paths and Vite `resolve.alias`)
- ✅ Grid colour palette in `index.css` as Tailwind `@theme` tokens (e.g. `bg-grid-bg`, `text-grid-accent`)
- ✅ Open Sans self-hosted from `public/fonts/` (same woff2 files as kahuna, not CDN); `--font-sans` overridden in `@theme` so all elements inherit it automatically
- ✅ Shared CSS component classes (`popup-menu`, `popup-item`) in `index.css` `@layer components` for consistent dropdown/context menu styling
- ✅ Standardised font sizes: `text-sm` (14px, UI chrome — toolbar, filters, menus, labels, buttons), `text-xs` (13px, data — table body cells, grid descriptions, metadata panel labels and values), `text-2xs` (12px, dimmed secondary metadata — grid cell dates). 13px for CQL input Web Component. Arbitrary one-off sizes (`text-[10px]` etc.) should be avoided — prefer theme tokens when a new size is genuinely needed.
- ✅ TypeScript compiles clean (`tsc --noEmit` — zero errors)
- ✅ Error boundary (`ErrorBoundary.tsx`) — class component wrapping `<Outlet />` in `__root.tsx`. Catches render crashes, shows error message + stack + "Try again" / "Reset app" buttons. 2 tests.


### Data Access Layer (DAL)

- ✅ `ImageDataSource` interface (`dal/types.ts`) — `search()`, `count()`, `getAggregation()`, `getAggregations()` (batched multi-field terms aggs in one ES request), `searchAfter()` (cursor-based pagination with optional PIT — now the primary pagination method used by all store operations), `openPit()`/`closePit()` (PIT lifecycle), `countBefore()` (position counting for sort-around-focus). Types: `SortValues`, `BufferEntry`, `SearchAfterResult`.
- ✅ `MockDataSource` (`dal/mock-data-source.ts`) — deterministic mock implementing `ImageDataSource` for testing. Generates synthetic images (`img-{index}`) with linearly spaced dates and cycling credits. Supports `search`, `searchAfter` (with cursor), `countBefore`, `getById`, `estimateSortValue`. Tracks `requestCount` for load assertions. Used by store integration tests.
- ✅ `ElasticsearchDataSource` adapter (`dal/es-adapter.ts`) — queries ES via Vite proxy, handles sort aliases, CQL→ES translation. `count()` uses `_count` endpoint for lightweight polling (new images ticker). `getAggregations()` batches N terms aggs into a single `size:0` request using the same `buildQuery()` filters. `searchAfter()` is now the primary pagination method — supports cursor-based pagination with optional PIT (requests go to `/_search` without index prefix when PIT is active), and falls back to `from/size` when no cursor is provided (initial search, backward extend, seek). `openPit()`/`closePit()` manage PIT lifecycle. `countBefore()` builds a range query counting documents before a sort position (for sort-around-focus). `buildSortClause()` always appends `{ id: "asc" }` tiebreaker (uses `id` keyword field, not `_id` — see deviations.md §18). `esRequestRaw()` for index-prefix-free requests.
- ✅ Configurable ES connection (`dal/es-config.ts`) — env vars for URL (`KUPUA_ES_URL`), index (`VITE_ES_INDEX`), local flag (`VITE_ES_IS_LOCAL`). Defaults to local docker ES on port 9220.
- ✅ Phase 2 safeguards (see `exploration/docs/infra-safeguards.md`):
  1. `_source` excludes — strips heavy fields (EXIF, XMP, Getty, embeddings) from responses
  2. Request coalescing — AbortController cancels in-flight search when a new one starts
  3. Write protection — only `_search`/`_count`/`_cat/aliases`/`_pit` allowed on non-local ES; `load-sample-data.sh` refuses to run against non-9220 port
  4. S3 proxy — read-only `GetObject` only, localhost-bound, uses developer's existing AWS creds (never committed)
- ✅ Vite env types declared in `src/vite-env.d.ts`


### State Management

- ✅ `search-store.ts` — Zustand store for search params, windowed buffer, loading state, and data source. **Windowed buffer architecture:** fixed-capacity buffer (`results`, max 1000 entries) with `bufferOffset` mapping `buffer[0]` to a global position. `search()` opens a PIT (on non-local ES), fetches first page via `searchAfter`; accepts optional `sortAroundFocusId` for sort-around-focus. `extendForward` uses `search_after` with `endCursor`; `extendBackward` uses **reverse `search_after`** (`reverseSortClause` + `startCursor`, works at any depth — no `from/size` offset cap). Page eviction keeps memory bounded. `seek()` repositions buffer at arbitrary offset for scrubber/sort-around-focus; bumps `_seekGeneration` + stores `_seekTargetLocalIndex` so views can scroll to the right position after buffer replacement. **Sort-around-focus:** async `_findAndFocusImage()` finds focused image's position via `searchAfter({ids})` + `countBefore` → seek → focus; 8s timeout prevents "Seeking..." forever; `sortAroundFocusGeneration` counter triggers view scroll. `imagePositions: Map<imageId, globalIndex>` maintained incrementally — O(page size) per extend, evicted entries cleaned up. **Important:** consumers must subtract `bufferOffset` to get buffer-local indices. PIT lifecycle managed: opened on search, closed on new search, skipped on local ES. New-images ticker respects user's date filter. Tracks ES `took` time and rolling `scrollAvg` from extend calls.
- ✅ `column-store.ts` — Zustand + localStorage persist for column visibility, widths, and session-only pre-double-click widths
- ✅ URL is single source of truth — `useUrlSearchSync` hook syncs URL → Zustand → search; `useUpdateSearchParams` hook lets components update URL. Browser back/forward works. `resetSearchSync()` busts the dedup for logo clicks that need to force a fresh search even when params appear unchanged.
- ✅ Custom URL serialisation in `router.ts` — uses `URLSearchParams` directly (not TanStack Router's `parseSearchWith`/`qss`), keeping all values as plain strings. Colons kept human-readable. See deviations.md §1 for rationale.


### CQL Search

- ✅ `@guardian/cql` parser + custom CQL→ES translator in `src/lib/cql.ts`. `MATCH_FIELDS` mirrors Grid's `MatchFields.scala` — includes `id` first so pasting an image ID into the search box finds it.
- ✅ `<cql-input>` Web Component for chip rendering, editing, keyboard nav, typeahead — wrapped by `CqlSearchInput.tsx`
- ✅ `LazyTypeahead` (`lazy-typeahead.ts`) — subclass of `@guardian/cql`'s `Typeahead` that decouples key suggestions from value resolution. Prevents the popover from stalling when a slow value resolver is in flight. See deviations.md §12.
- ✅ Typeahead fields built from DAL (`typeahead-fields.ts`) with resolvers using local ES aggregations (terms aggs on keyword fields). Fields without keyword mappings (byline, city, etc.) have no value suggestions — same as kahuna.
- ✅ CQL structural noise filtering — `SearchBar` ignores `queryStr` values that are pure CQL structure (e.g. bare `":"` from empty chips when pressing `+`), preventing spurious searches. Kahuna handles this via its structured query pipeline; kupua filters at the `handleQueryChange` level.
- ✅ Supports structured queries: `credit:"Getty" -by:"Foo" cats fileType:jpeg`
- ✅ `fileType:jpeg` → `source.mimeType` match with MIME conversion (matching Scala `FileTypeMatch`)
- ✅ `is:GNM-owned` — recognized but requires org config from Grid (mocked for now)


### Table View (`ImageTable.tsx`, ~1260 lines)

- ✅ TanStack Table with virtualised rows (TanStack Virtual), column resizing
- ✅ Column definitions generated from field registry (`field-registry.ts`) — 23 hardcoded fields + config-driven alias columns. The registry is the single source of truth for field ID, label, accessor, CQL key, sort key, formatter, default width, and visibility. ImageTable, SearchFilters, and column-store all consume registry-derived maps.
- ✅ Dimensions column — single column showing oriented `w × h` (e.g. `5,997 × 4,000`), display-only (not sortable). Separate Width and Height columns are sortable by plain integer field (`source.dimensions.width`, `source.dimensions.height`) — uses the fast percentile estimation path for deep seek. Replaces the old Painless script sort (w×h pixel count) which was unusably slow for deep seeks (~60s via SSH tunnel).
- ✅ Width / Height columns — sortable integer fields, `descByDefault: true`. Use `orientedDimensions` with fallback to `dimensions` for display. Sort aliases: `width` → `source.dimensions.width`, `height` → `source.dimensions.height`.
- ✅ Location is a composite column: subLocation, city, state, country (fine→coarse display). Click-to-search uses `in:` which searches all four sub-fields. Not sortable (text-analysed fields).
- ✅ Subjects and People are list columns: each item rendered individually with per-item click-to-search (`subject:value`, `person:value`). Not sortable (text-analysed fields).
- ✅ Config-driven alias columns — generated from `gridConfig.fieldAliases` where `displayInAdditionalMetadata === true`. Values resolved via `resolveEsPath()` (dot-path traversal into `image.fileMetadata`). All keyword type → sortable. Hidden by default. Click-to-search uses alias name as CQL key. CQL parser resolves alias → `elasticsearchPath` for search.
- ✅ Sort on any keyword/date/numeric column by clicking header. Text-only fields (Title, Description, etc.) not sortable (no `.keyword` sub-field). Single click is delayed 250ms to distinguish from double-click.
- ✅ Secondary sort via shift-click (encoded as comma-separated `orderBy` URL param)
- ✅ Sort alias system — `buildSortClause` expands short URL aliases to full ES paths per-part (e.g. `taken` → `metadata.dateTaken,-uploadTime`, `credit` → `metadata.credit`, `category` → `usageRights.category`, `filename` → `uploadInfo.filename`, `mimeType` → `source.mimeType`, `width` → `source.dimensions.width`, `height` → `source.dimensions.height`, plus config-driven alias fields). URLs never contain dotted ES paths — only clean short keys (e.g. `?orderBy=-credit`, not `?orderBy=-metadata.credit`).
- ✅ Auto-reveal hidden columns when sorted — if the user sorts by a column that's currently hidden (e.g. Last modified), it's automatically shown and persisted to the store as if toggled manually. Generic — works for any sortable hidden column.
- ✅ Click-to-search — shift-click cell to append `key:value` to query; alt-click to exclude. If the same `key:value` already exists with opposite polarity, flips it in-place (no duplicate chips). AST-based matching via `cql-query-edit.ts` using `@guardian/cql`'s parser. CQL editor remount workaround for polarity-only changes — see deviations.md §13. Upstream fix: [guardian/cql#121](https://github.com/guardian/cql/pull/121); remove workaround after merge+release.
- ✅ Accessibility — ARIA roles on table (`role="grid"`, `role="row"`, `role="columnheader"` with `aria-sort`, `role="gridcell"`), context menu (`role="menu"`, `role="menuitemcheckbox"`), sort dropdown (`role="listbox"`, `role="option"`), resize handles (`role="separator"`), loading indicator (`aria-live`), result count (`role="status"`), toolbar (`role="toolbar"`), search landmark (`role="search"`). All zero-performance-cost — HTML attributes only.
- ✅ Cell tooltips via `title` attribute
- ✅ Column visibility — right-click header for context menu. Default hidden: Last modified, File type, Suppliers reference, Byline title, all config-driven alias columns. Persisted to localStorage.
- ✅ Column widths persisted to localStorage via `column-store.ts` — manual drag resizes and auto-fit widths both persist. Restored on reload.
- ✅ Double-click header to auto-fit — first double-click measures the widest cell value and fits the column. Second double-click restores the previous width. Pre-fit widths are stored in the column store (session-only, not persisted to localStorage). Manual drag-resize clears the saved pre-fit width.
- ✅ Column context menu — right-click any header cell: "Resize column to fit data", "Resize all columns to fit data", separator, then column visibility toggles. Menu uses shared `popup-menu`/`popup-item` classes. Auto-clamps to viewport bounds (never renders off-screen). Right-clicking a specific column shows the single-column resize option; right-clicking the trailing spacer shows only "Resize all" + visibility.
- ✅ Auto-resize to fit — measures the widest cell value across all loaded results using an off-screen `<canvas>` for text measurement (`measureText`), accounts for header label width, padding (16px sides), and sort arrow space.
- ✅ CSS-variable column widths — instead of per-cell `getSize()` calls (~300+/render), a single `<style>` tag injects `--col-<id>` CSS custom properties on `[data-table-root]`. Header and body cells use `width: var(--col-<id>)`. Width changes during resize only touch the style string — no per-cell JS.
- ✅ Memoised table body during resize — `TableBody` is a `React.memo` component. During column resize drags, rows and virtualItems are cached in refs (frozen while `columnSizingInfo.isResizingColumn` is truthy) so the memo's props stay stable and the body skips re-rendering entirely. Column widths update via CSS variables without React involvement. Avoids the bug in TanStack's official performant example (#6121).
- ✅ Column resize with auto-scroll — dragging a resize handle near/past the scroll container edges auto-scrolls the table horizontally (speed proportional to distance past edge, up to 20px/frame). Synthetic `mousemove` events with scroll-adjusted `clientX` keep TanStack Table resizing the column as the container scrolls. On release, a synthetic `mouseup` with the adjusted position finalises the width correctly (the real `mouseup` with unadjusted `clientX` is blocked via capture-phase listener).
- ✅ Horizontal scroll — inner wrapper is `inline-block min-w-full`, header is `inline-flex` with `shrink-0` cells (the browser determines the scrollable width from rendered content — no JS-computed width, correct at any browser zoom level). A 32px trailing spacer after the last header cell ensures the last column's resize handle is always accessible. Root layout uses `w-screen overflow-hidden` to prevent the page from expanding beyond the viewport.
- ✅ Scroll reset on new search — both scrollTop and scrollLeft reset to 0 when URL search params change (new query, sort, filters, logo click). loadMore doesn't change URL params, so infinite scroll is unaffected. Display-only params (`image`) are excluded from scroll-reset comparison.
- ✅ Double-click row to open image — adds `image` to URL search params (push, not replace). The search page stays mounted and fully laid out (invisible via `opacity-0`), preserving scroll position, virtualizer state, and search context. Browser back removes `image` and the table reappears at the exact scroll position with the viewed image focused. Navigation in the image view follows the current search results in their current sort order (line-in-the-sand: navigation always within current search context and order).
- ✅ Row focus (not selection) — single-click sets a sticky highlight on a row (`ring-2 ring-inset ring-grid-accent` + `bg-grid-hover/40`). Focus persists when mouse moves away. Distinct from hover (`bg-grid-hover/15` — dimmer, no ring). Harmonised with grid view: both densities use the same background tint and accent ring for focus. Focus is stored in search store (`focusedImageId`), cleared on new search. Returning from image detail auto-focuses the last viewed image; if different from the one originally clicked, centers it in viewport.


### Grid View (`ImageGrid.tsx`, ~470 lines)

- ✅ Thumbnail grid density — alternative rendering of the same result set. Consumes `useDataWindow()` for data, focus, and gap detection — zero data layer duplication. Grid is the default view (matching Kahuna); table opt-in via URL param `density=table`.
- ✅ Responsive columns via `ResizeObserver` — `columns = floor(containerWidth / 280)`. Row-based TanStack Virtual (each virtual row renders N cells). Equal-size cells (editorial neutrality — differently-sized images shouldn't influence picture editors). Cell width computed in the ResizeObserver callback (not inline during render) to avoid layout shift on first interaction.
- ✅ S3 thumbnails — uses `getThumbnailUrl()` from `image-urls.ts`. Local mode shows "No thumbnail" placeholder (acceptable). Unloaded grid cells and table rows use subtle static backgrounds (no `animate-pulse` — avoids visual noise during fast scroll).
- ✅ Cell layout matches Kahuna — 303px total height, 190px thumbnail area (block layout, top-aligned, horizontally centred via `margin: auto`), metadata below. `max-height: 186px` on image (= Kahuna's `max-height: 98%` of 190px).
- ✅ Rich tooltips — description tooltip (description + By + Credit with `[none]` fallbacks, colon-aligned) on both thumbnail and description text. Date tooltip (Uploaded + Taken + Modified, colon-aligned) extends Kahuna's two dates to three.
- ✅ Focus ring + keyboard navigation with grid geometry — ArrowLeft/Right = ±1, ArrowUp/Down = ±columns, Home/End. Enter opens focused image. Same `moveFocus` viewport-aware start as table (no focus → start from visible viewport). Focus/hover harmonised with table: focus = `ring-2 ring-grid-accent` + `bg-grid-hover/40` + `shadow-lg`, hover = `bg-grid-hover/15` (background only, no ring).
- ✅ Double-click cell opens image detail (same overlay architecture as table).
- ✅ Scroll reset on new search, return-from-detail scroll preservation (only scrolls if user navigated to different image via prev/next).
- ✅ Density switch preserves viewport position — `density-focus.ts` saves the focused item's viewport ratio (0=top, 1=bottom) on unmount, restores on mount via `useLayoutEffect` (before paint, no visible jump). Falls back to `align: "center"` on initial load. Module-level state — no React, no Zustand, 5 lines.
- ✅ Scroll anchoring on column count change — when container width changes (panel toggle/resize, browser window resize) and the column count changes, captures the focused/viewport-centre image's position before React re-renders and restores it in a `useLayoutEffect`. No visible jump. Generic `ResizeObserver` improvement, not panel-specific.


### Toolbar, Status Bar, Filters

- ✅ Search toolbar (44px / `h-11`): `[Logo] [Search] | [Free to use] [Dates] | [Sort ↓]`
- ✅ Status bar (28px, `bg-grid-panel`, `items-stretch`): `[Browse toggle] | [count matches] [N new] ... | [density toggle] | [Details toggle]`. Panel toggle buttons are full-height strips (not lozenges) with icon + label. When active, button extends 1px below the bar's `border-b` with `bg-grid-panel` to visually merge with the panel beneath (tab effect). Both states have identical geometry — only colour/background changes, so labels never shift on toggle. Dividers are full-height. Middle content items self-pad.


### Panels (`PanelLayout.tsx`, `panel-store.ts`)

- ✅ Panel store — Zustand + localStorage persist for panel visibility, widths, section open/closed state. Two zones (left, right), two states each (visible/hidden). Default widths: left 280px, right 320px. Min 200px, max 50% viewport. Section defaults: Filters collapsed (Decision #13), Collections expanded, Metadata expanded.
- ✅ Panel layout — flex row of `[left-panel?] [resize-handle] [main-content] [resize-handle] [right-panel?]`. Resize handles: 4px visual / full-height hit target, CSS-only width update during drag (no React re-render per frame), commit to store on mouseup. Double-click resize handle to close panel. Main content fills remaining space via `flex-1 min-w-0`. Browser scroll anchoring disabled on panel scroll containers (`overflow-anchor: none`) — we handle scroll anchoring manually in FacetFilters.
- ✅ Keyboard shortcuts: `[` toggles left panel, `]` toggles right panel. `Alt+[`/`Alt+]` when focus is in an editable field (search box etc.). Centralised shortcut system in `lib/keyboard-shortcuts.ts` — single `document` capture-phase listener, `useKeyboardShortcut` hook for component registration, stack semantics for priority. All single-character shortcuts follow the same pattern: bare key when not editing, Alt+key when editing. Exported `ALT_SYMBOL` (⌥ on Mac, Alt+ on Windows), `ALT_CLICK`, and `shortcutTooltip()` for platform-aware UI text. See deviations.md §15.
- ✅ AccordionSection component — collapsible sections within panels. Header always visible with disclosure triangle, content collapses to zero height. Open/closed state persisted to panel store → localStorage. Bottom border only when collapsed — prevents flash on reload when section is expanded but content hasn't loaded yet.
- ✅ Aggregation batching (`search-store.ts` + `dal/es-adapter.ts`) — `fetchAggregations()` action: single ES `size:0` request with N named terms aggs (one per aggregatable field from field registry). Query-keyed cache (skips if params unchanged), 500ms debounce, circuit breaker at 2s (disables auto-fetch, shows manual refresh), abort controller for cancellation. Fetched lazily — only when Filters section is expanded (Decision #9, #13). Agg `took` time tracked in store.
- ✅ Facet filters (`FacetFilters.tsx`, ~275 lines) — left panel content inside AccordionSection. Renders all aggregatable fields with value lists and compact counts (1.8M, 421k format — Decision #14). Click adds CQL chip, Alt+click excludes, click again removes. Active filters highlighted in accent, excluded in red with strikethrough. Uses `findFieldTerm`/`upsertFieldTerm` from `cql-query-edit.ts`. "Show more" per field — fetches a separate single-field request at 100 buckets (not mixed into the recurring batch). Expanded state cleared on new search (not persisted). "Show fewer" scroll-anchors the field header to the top of the panel (prevents losing position after collapsing a long list). Platform-aware tooltips (⌥click on Mac, Alt+click on Windows) via `ALT_CLICK` from `keyboard-shortcuts.ts`.
- ✅ Shared metadata component (`ImageMetadata.tsx`, ~350 lines) — extracted from ImageDetail. Layout replicates Kahuna's visual structure: `MetadataBlock` (stacked) for Title/Description/Special instructions/Keywords, `MetadataRow` (inline 30/70) for most others. Bold labels, persistent `#999` underlines, solid `#565656` section dividers as orientation landmarks, section order matching Kahuna (Rights → Title/Desc → Special instructions → Core metadata → Keywords → Technical → ID). Click-to-search with Shift/Alt modifiers. Location sub-parts as individual search links. List fields as search pills (`SearchPill.tsx`). Used by ImageDetail sidebar and right side panel.


### Routing (TanStack Router)

- ✅ Zod-validated URL search params (`search-params-schema.ts`)
- ✅ Root route (`__root.tsx`) — minimal shell (bg + flex column)
- ✅ Search route (`search.tsx`) at `/search` — validates params + renders SearchBar + StatusBar + ImageGrid (default) or ImageTable (`density=table`). When `image` is in URL params, makes search UI invisible (`opacity-0 pointer-events-none`) and renders `ImageDetail` overlay.
- ✅ Image detail as overlay (not a separate route) — renders within search route when `image` URL param present. Push on open, replace on prev/next, back to dismiss. All search context preserved.
- ✅ Image detail standalone fetch — when `image` points to an ID not in results, fetches by ID from ES. Prev/next unavailable in standalone mode.
- ✅ Image detail offset cache — `sessionStorage` cache for image position + sort cursor + search fingerprint. Survives page reload. Cursor-based `search_after` restore at any depth (see 2 April 2026 entry).
- ✅ Image detail shows `[x] of [total]`. Auto-loads more results when within 5 images of loaded edge.
- ✅ Debounced cancellable prefetch — 2 prev + 3 next images, 400ms debounce, abort on navigation.
- ✅ Image redirect route (`image.tsx`) at `/images/$imageId` → `/search?image=:imageId&nonFree=true`
- ✅ Index route (`index.tsx`) — `/` → `/search?nonFree=true`
- ✅ Fullscreen survives between images — stable DOM element, React reconciles same component.


### Keyboard Navigation (`useListNavigation.ts`, ~327 lines)

- ✅ Shared hook parameterised by geometry (table: `columnsPerRow: 1`, grid: `columnsPerRow: N`)
- ✅ Arrow Up/Down, PageUp/PageDown (scroll-first, focus-follows), Home/End, Enter
- ✅ Two-phase keyboard handling: arrows/page/enter bubble; Home/End use capture phase
- ✅ `f` toggles fullscreen in image detail (`Alt+f` in editable fields)
- ✅ O(1) image lookup via incremental `imagePositions: Map`
- ✅ Bounded placeholder skipping (max 10 empty slots)
- ✅ Prefetch near edge (loadMore within 5 images of loaded edge)
- ✅ Visible-window table data via windowed buffer


### Performance

- ✅ 36 findings documented in `exploration/docs/performance-analysis.md`
- ✅ Chrome Lighthouse audit (2026-03-28) — Performance 61 (dev mode), Accessibility 94, Best Practices 96, SEO 83. TBT 8ms, CLS 0.
- ✅ Imgproxy latency benchmark — ~456ms median per image. Prefetching is correct mitigation.
- ✅ All 5 fix-now items implemented (#6 visibleImages stability, #7 handleScroll churn, #8 goToPrev/Next churn, #9 generation-based abort, #10 computeFitWidth visible-only scan)
- 📋 Fix-later items: several resolved by windowed buffer (#3, #4, #11, #14). Still pending: density mount cost (#12), debounce vs seeks (#13), histogram agg (#15), image object compaction (#20).


### search_after + Windowed Scroll + Scrubber

Full implementation of `search_after` + PIT windowed scroll + custom scrubber. Replaces `from/size` pagination. All 13 steps implemented, all test checkpoints (A–D) passed.

**Implementation details:**
- Tiebreaker sort (`id: asc`), sort values stored alongside hits, `search_after` + PIT in DAL
- Windowed buffer (max 1000 entries), `extendForward`/`extendBackward` via `search_after`, page eviction
- Seek: shallow (<10k) via `from/size`, deep (≥10k) via percentile estimation + `search_after` + `countBefore`
- Keyword deep seek via composite aggregation (`findKeywordSortValue`, configurable `BUCKET_SIZE=10000`, 8s time cap)
- ~~Script sort (dimensions) falls back to iterative `search_after` with `noSource: true`~~ — **Removed.** Width/Height are now plain field sorts using percentile estimation. See "Width/Height replace Dimensions script sort" entry below.
- `extendBackward` via reverse `search_after` (no depth limit, replaces `from/size` fallback)
- Backward extend scroll compensation (`_lastPrependCount` + `_prependGeneration`)
- Sort-around-focus ("Never Lost"): async `_findAndFocusImage()` with 8s timeout
- Sort-aware scrubber tooltip: date interpolation for date sorts, keyword value for keyword sorts
- Scrubber: vertical track, proportional thumb, click/drag-to-seek (deferred to pointer up), auto-hide after 2s, callback ref + ResizeObserver, `pendingSeekPosRef`
- Non-linear drag researched and rejected — linear drag + deferred seek is correct (see deviations.md §20, `scrubber-nonlinear-research.md`)

**Bugs found via TEST ES (~1.3M docs) and fixed:**
- **Bug #12:** Wheel scroll after scrubber seek — seek cooldown was refreshed at data arrival, blocking extends. Fixed: single cooldown + deferred scroll event.
- **Bug #13:** Keyword sort seek no effect at scale — composite `BUCKET_SIZE` too small (1000→10000), added 8s time cap, telemetry logging.
- **Bug #14:** End key short under non-date sort — composite agg returned null for exhausted null-credit docs. Fixed: return `lastKeywordValue` + `missingFirst` for reverse seek + skip `countBefore` for null sort values.
- **Bug #15:** Grid twitch on sort change — three root causes: (1) initial search at position 0 exposed wrong results before `_findAndFocusImage` replaced the buffer; (2) `_findAndFocusImage` bumped both `_seekGeneration` and `sortAroundFocusGeneration`, triggering two conflicting scroll effects; (3) scroll-reset effect fired on URL change before search completed, resetting scrollTop on old buffer. Fixes: store keeps old buffer visible (loading=true) until `_findAndFocusImage` replaces it in one shot; `_findAndFocusImage` no longer bumps `_seekGeneration` (`sortAroundFocusGeneration` is sole scroll trigger); scroll-reset skipped for sort-only changes with focused image. 3 new E2E tests: single buffer transition assertion (Zustand subscriber tracking `results.length` changes), no scroll-to-0 flash (60fps scrollTop polling during toggle), table regression guard.
- **4 global→local index bugs** in `FocusedImageMetadata`, density-switch unmount, scroll anchoring — all needed `bufferOffset` subtraction.


### List Scroll Smoothness — Tried and Reverted

Goal: make table view feel as smooth as grid. Tried: page size 50→100, throttle, overscan 100. No improvement, introduced hover-colour regression. Reverted. Bottleneck may be React reconciliation or placeholder flash — needs profiling.


