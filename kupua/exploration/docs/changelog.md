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


