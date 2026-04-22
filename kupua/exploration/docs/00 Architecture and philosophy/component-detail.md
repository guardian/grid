# Kupua — Component Detail Reference

> This file contains detailed descriptions of every major component/subsystem.
> It is NOT loaded at session start. Agents read it on demand when working on
> a specific area. For the bootstrap summary, see `kupua/AGENTS.md`.

---

# Data Layer

## DAL (`src/dal/`, ~3,270 lines across 9 files)

`ImageDataSource` interface → `ElasticsearchDataSource`. Core: `search`, `searchAfter` / `searchRange` (+ PIT with 404/410 fallback, optional `sortOverride` + `extraFilter` for null-zone seek), `count`, `getById`, batched `getAggregations`. Advanced: `countBefore` (null-aware via `exists`/`must_not:exists`), `estimateSortValue` (percentile), `findKeywordSortValue` (composite walk), `getKeywordDistribution`, `getDateDistribution` (adaptive interval: month / day / hour / 30m / 10m / 5m via `calendar_interval` or `fixed_interval`). Write protection on non-local ES. `MockDataSource` for tests (supports `sparseFields` config and `extraFilter` for null-zone testing). `PositionMap` (`position-map.ts`) — lightweight cursor index mapping global position → sort values for scrubber fast-path seek (avoids percentile estimation when total ≤ POSITION_MAP_THRESHOLD). ES-specific code in `dal/adapters/elasticsearch/`: CQL→ES translator, sort clause builders (with universal `uploadTime` fallback). Tuning constants in `constants/tuning.ts`.

## State (`src/stores/search-store.ts`, ~3,200 lines)

Zustand. Windowed buffer (max 1000, cursor-based extend/evict/seek). Bidirectional seek: deep paths add a backward `search_after` after the forward fetch, placing the user in the buffer middle. Scroll-mode fill for small result sets. `imagePositions: Map` for O(1) lookup. Background `positionMap` fetch (for SCROLL_MODE_THRESHOLD < total ≤ POSITION_MAP_THRESHOLD) enables fast-path scrubber seek without percentile estimation. Sort-around-focus ("Never Lost"). PIT lifecycle with generation counter (`_pitGeneration` — seek/extend skip stale PITs to avoid 404 round-trips, keepalive 1m). New-images ticker. Aggregation cache + circuit breaker (expanded agg requests have abort controllers). Sort distribution (`sortDistribution`) + null-zone uploadTime distribution (`nullZoneDistribution`) for scrubber labels/ticks. Separate `column-store` + `panel-store` (localStorage-persisted).

## Field Registry (`field-registry.ts`, ~760 lines)

Single source of truth for all image fields. 26 hardcoded + config-driven aliases. Drives table columns, sort dropdown, facet filters, detail panel. `detailLayout`/`detailGroup`/`detailClickable` hints for metadata display. Exports `SORT_DROPDOWN_OPTIONS` and `DESC_BY_DEFAULT` set for the sort controls.

## URL Sync

Single source of truth. `useUrlSearchSync` → store → search. Zod-validated params (`search-params-schema.ts`). `resetSearchSync()` for forced re-search. Custom `URLSearchParams`-based serialisation. Sort-only change detection triggers `sortAroundFocusId` when only `orderBy` changes while an image is focused. `useDocumentTitle` hook sets `document.title` to `{query} | the Grid` (mirrors kahuna's `ui-title` directive), with `(N new)` prefix from the new-images ticker.

## CQL

`@guardian/cql` parser + custom CQL→ES translator (in `dal/adapters/elasticsearch/`). `<cql-input>` Web Component. `LazyTypeahead` (`lazy-typeahead.ts`) for non-blocking suggestions. `typeahead-fields.ts` configures which fields support typeahead and how suggestions are fetched. Structured queries, `fileType:jpeg` → MIME, `is:GNM-owned`.

## Image URLs (`lib/image-urls.ts`, ~250 lines)

URL builders for thumbnails and full-size images. Thumbnails served from S3 via local proxy (`/s3/thumb/<id>`). Full-size images served via imgproxy: AVIF format by default, DPR-aware sizing (two-tier: 1× for standard displays, 1.5× for HiDPI > 1.3), EXIF orientation → explicit `rotate:N` (auto_rotate disabled), native-resolution cap to prevent upscaling. `getFullImageUrl()` builds imgproxy processing URLs; `getThumbnailUrl()` returns proxied S3 paths. Both return `undefined` when the respective service is unavailable (local mode).

---

# Hooks & Coordination

## Data Window (`useDataWindow.ts`, ~430 lines)

Bridge between the search store and view components (ImageTable, ImageGrid, ImageDetail). Provides buffer-aware data access (`getImage(index)`), edge detection + extend triggers (`reportVisibleRange`), and a density-independent API. Two modes: **normal** (buffer-local indices, virtualiserCount = results.length) and **two-tier** (global indices 0..total-1, skeleton cells outside buffer, scrubber drag directly scrolls). Viewport anchor tracking (always the centre image) for density-focus and sort-around-focus fallback. Scroll-seek debounce (200ms) for two-tier mode.

## Scroll Effects (`useScrollEffects.ts`, ~910 lines)

Shared hook for all scroll lifecycle — parameterised by `ScrollGeometry` descriptor. Handles: scroll reset orchestration, prepend/forward-evict compensation, seek scroll-to-target (effect #6: reverse-compute + lastVisibleRow buffer-shrink preservation + `_seekSubRowOffset` for headroom-zone sub-row pixel preservation), sort-around-focus scroll, density-focus save/restore (with edge clamping), bufferOffset→0 guard. Seek timing constants in `tuning.ts`: `SEEK_COOLDOWN_MS` (100ms, post-arrival extend block — tuned down from 700ms, floor at 65–80ms), `SEEK_DEFERRED_SCROLL_MS` (derived: cooldown + 50ms = 150ms, fires synthetic scroll to trigger extends), `SEARCH_FETCH_COOLDOWN_MS` (2000ms, blocks extends during in-flight search/abort). Post-extend cooldown: each `extendBackward` completion sets a 50ms cooldown (tuned down from 200ms, floor at 32ms) to prevent cascading prepend compensations (swimming). Full timing chain: seek data → 100ms cooldown → 150ms deferred scroll → first extends fire (was 700ms → 800ms, 5.3× faster). The old `_postSeekBackwardSuppress` flag in `useDataWindow.ts` has been removed — it prevented swimming but also prevented scrolling up after seek. Module-level bridges for density-focus and sort-focus.

## List Navigation (`useListNavigation.ts`, ~540 lines)

Shared keyboard navigation for all density views, parameterised by `ListNavigationConfig`. Two modes: **no focus** (Arrow Up/Down scroll one row, PageUp/Down scroll one page, Home/End go to absolute start/end — none set focus) and **has focus** (arrows move focus by ±columnsPerRow, PageUp/Down move focus by one page of rows, Home/End focus first/last image, Enter opens detail). Table passes `columnsPerRow: 1`, grid passes `columnsPerRow: N`. CQL input propagates ArrowUp/Down/PageUp/Down/Home/End; native inputs are excluded via `isNativeInputTarget`. Home key uses the same two-branch scroll-reset strategy as orchestration (eager when `bufferOffset === 0`, deferred otherwise).

## Image Traversal (`useImageTraversal.ts`, ~260 lines)

Shared prev/next navigation for ImageDetail and FullscreenPreview. Works uniformly across all three scroll modes (buffer, two-tier, seek). If the adjacent image is in the buffer → navigate immediately; if near buffer edge → trigger extend, store pending navigation, resolve when buffer grows; if at absolute boundary → no-op. All logic in global indices. Fires `prefetchNearbyImages` on every successful navigation (direction-aware).

## Prefetch Pipeline (`image-prefetch.ts`, ~470 lines)

Cadence-aware prefetch shared by ImageDetail, FullscreenPreview, and the swipe carousel. Organised around a **TraversalSession** — a module-level singleton that tracks the user's navigation burst (held arrow key, chain-swipe). The session records an EMA-smoothed cadence (interval between `prefetchNearbyImages` calls, weight 0.4). During fast bursts (cadence < 350ms), only i±1 + far lookahead i±6 are prefetched; at stable cadence, the full radius (i+4 ahead, i-1 behind) is issued. A 280ms post-burst debounce fires a full-radius fill around the resting position. Stale in-flight requests are cancelled via `img.src = ""` when they leave the desired set. `fetchPriority` hints (`"high"` for i+1 full-res and i±1 thumbnails, `"low"` for the rest) keep the most-likely-next image at the front of the browser's connection queue. On mobile, thumbnails are issued before full-res within each batch. Session auto-closes after 2s idle. All thresholds are tunable at runtime via `localStorage` keys (`kupua.prefetch.<key>`) — no rebuild needed.

## Prepend Transform (`prepend-transform.ts`, ~140 lines)

CSS `translateY` pre-compensation for backward extends and forward eviction. Eliminates the intermediate frame between React's DOM mutation and the `useLayoutEffect` scroll compensation. Zustand `subscribe` fires synchronously on `set()`, applies GPU-composited transform to the spacer div, removed in the same frame by `useLayoutEffect`. Zero ongoing overhead.

## Orchestration (`lib/orchestration/search.ts`, ~200 lines)

Imperative coordination functions extracted from UI components and hooks. Holds: debounce cancellation (`cancelSearchDebounce`, `getCqlInputGeneration`), go-home preparation (`resetScrollAndFocusSearch` — aborts extends, resets scroll when safe, resets visible range + scrubber thumb, focuses CQL input; scroll-reset uses a two-branch strategy: **eager `scrollTop = 0` when `bufferOffset === 0`** (buffer has correct first-page data, no flash risk) or **deferred via effect #8** when `bufferOffset > 0` (prevents flash of stale deep-offset content) — same logic as the Home key handler in `useListNavigation.ts`), URL sync reset (`resetSearchSync`). Called by SearchBar, ImageTable, ImageMetadata, ImageDetail, useScrollEffects, useUrlSearchSync. Dependency direction: components → hooks → lib → dal.

## Reset-to-Home (`lib/reset-to-home.ts`, ~160 lines)

Single `resetToHome()` function deduplicating the reset sequence from SearchBar and ImageDetail logo click handlers. Clears `focusedImageId` and density-focus saved state **before** navigation — prevents the table unmount from saving a stale viewport ratio and the grid mount from restoring it (which would fight the go-home scroll-to-top intent).

## Keyboard Shortcuts (`lib/keyboard-shortcuts.ts`, ~180 lines)

Centralised shortcut registry. Single-character shortcuts: bare key when not in an editable field, Alt+key when editing (Alt chosen to avoid Cmd/Ctrl browser conflicts). One `keydown` listener on `document` (capture phase). Components register via `registerShortcut()`/`unregisterShortcut()` or `useKeyboardShortcut` hook. `shortcutTooltip()` formats hints for button titles. `isNativeInputTarget()` guards against firing in date inputs and other native controls.

---

# UI Components — Search & Toolbar

## SearchBar (`SearchBar.tsx`, ~180 lines)

Top-level header: logo (click → `resetToHome()`), `CqlSearchInput` with 300ms debounce, clear button, `SearchFilters` (middle + right). Manages CQL input generation for stale-debounce detection. Cancels pending debounce on unmount to prevent navigation bouncing.

## Search Filters (`SearchFilters.tsx`, ~270 lines)

Split into two layout slots: **FilterControls** (middle — "Free to use only" toggle + `DateFilter`) and **SortControls** (right — sort field dropdown from `SORT_DROPDOWN_OPTIONS`, direction toggle, secondary sort with shift-click). Hidden on small screens (`< sm`). Sort via column header clicks still works on any screen size.

## Date Filter (`DateFilter.tsx`, ~520 lines)

Dropdown for date range filtering. Mirrors kahuna's `gu-date-range`. Field selector (Upload time / Date taken / Last modified), preset buttons (Anytime, Today, Past 24h, Past week, Past 6 months, Past year), two date inputs (From / To) for custom ranges. Preset matching uses 2-hour tolerance for relative presets (survives stale tabs). Collapsed state shows "Anytime" or a summary label with accent dot.

## Status Bar (`StatusBar.tsx`, ~170 lines)

Thin strip between toolbar and views. Left-panel toggle (with hover-prefetch for aggregations when the Filters section is localStorage-expanded), result count, new-images ticker, sort-around-focus indicator, density toggle (grid/table icons), right-panel toggle. Container queries for responsive label display.

## CQL Search Input (`CqlSearchInput.tsx`)

Wraps the `<cql-input>` Web Component from `@guardian/cql`. Bridges React ↔ Web Component lifecycle. `LazyTypeahead` provides non-blocking suggestions.

---

# UI Components — Views

## Table View (`ImageTable.tsx`, ~1,330 lines)

TanStack Table + Virtual. Column defs from field-registry (26 hardcoded + config-driven alias fields). Resize (CSS-variable injection avoids React re-renders during drag), auto-fit, visibility context menu (`ColumnContextMenu.tsx`, rendered outside scroll container to avoid `contain: strict` breaking `position: fixed`), sort on header click (shift for secondary), auto-reveal hidden columns on sort. Click-to-search (shift/alt modifiers, AST-based polarity flip). Row focus, double-click to detail. ARIA roles (`grid`, `row`, `columnheader`, `gridcell`). Horizontal scrollbar via proxy div; vertical hidden (Scrubber replaces it).

## Grid View (`ImageGrid.tsx`, ~520 lines)

Responsive columns (`floor(width/280)`), 303px row height, S3 thumbnails, focus ring + keyboard nav. `ResizeObserver` with `captureAnchor` mechanism for scroll anchoring on column count change. Sort-aware date label (Uploaded/Taken/Modified adapts to primary sort field).

## Image Detail (`ImageDetail.tsx`, ~440 lines)

Overlay within search route (search page stays mounted with `opacity-0 pointer-events-none`). Counter, prev/next (`NavStrip` + `useImageTraversal`), cadence-aware prefetch pipeline (shared `image-prefetch.ts` session model), fullscreen survives between images. Position cache in sessionStorage (`image-offset-cache.ts`: offset + sort cursor + search fingerprint) for reload restoration at any depth via `restoreAroundCursor`. Full-size images via imgproxy (AVIF, DPR-aware sizing).

## Fullscreen Preview (`FullscreenPreview.tsx`, ~270 lines)

Lightweight fullscreen peek from grid/table — press `f` to view focused image edge-to-edge via Fullscreen API (`useFullscreen` hook). No route change, no metadata. Arrow keys traverse images via `useImageTraversal`, updating `focusedImageId`; exit (Esc/Backspace/f) scrolls list to centered focused image. Shares prefetch pipeline with ImageDetail. Another density of the same ordered list.

## Image Metadata (`ImageMetadata.tsx`, ~320 lines)

Shared metadata display for focused image — used in both ImageDetail sidebar and right side panel. Registry-driven field order via `DETAIL_PANEL_FIELDS`. Section breaks on group change. Fields with `detailLayout: "stacked"` render label above value; others render inline (key 30% / value 70%). Click-to-search on values (shift = AND, alt = exclude). Location sub-parts as individual search links. List fields (keywords, subjects, people) as `SearchPill` components.

## Panels (`PanelLayout.tsx`, ~250 lines)

Left (facet filters) / right (focused-image metadata). Resize handles, `[`/`]` keyboard shortcuts, `AccordionSection` with persisted state (via `panel-store`).

## Facet Filters (`FacetFilters.tsx`, ~330 lines)

Left panel content. Batched aggregation fetch via store. Click → set CQL chip, alt-click → exclude. "Show more" expands per-field agg counts. Agg timing display (`AggTiming` component).

## Scrubber (`Scrubber.tsx`, ~1,170 lines)

Vertical track, proportional thumb. Two modes: **scroll mode** (total ≤ threshold, direct scroll) and **seek mode** (windowed buffer, seek on pointer-up). Deep seek via percentile estimation (date/numeric) or composite aggregation (keyword) with direction-aware `search_after` cursor anchors (`buildSeekCursorAnchors` in `search-store.ts` — desc fields get `MAX_SAFE_INTEGER`, asc get `0`, id gets `""`). Binary search refinement on the `id` tiebreaker when keyword bucket drift exceeds PAGE_SIZE. End key fast path: reverse `search_after` when target is within PAGE_SIZE of total, guaranteeing the buffer covers the last items. Null-zone seek uses the null-zone uploadTime distribution (fetched with `must_not:exists` filter for accuracy) for direct position→date mapping — no percentile needed, ~0.6% position accuracy. Sort-aware tooltip with adaptive date granularity. Keyword distribution binary search (O(log n), zero network during drag). Track tick marks with label decimation + hover animation; ticks are positioned by doc count (not time), so their spacing functions as a density map — dense clusters spread wide, sparse gaps compress. This is an explicit design choice: never linearise ticks by time. Null-zone UX: red boundary tick with vertical "No {field}" label (edge-clamped to track bounds), red-tinted uploadTime-based ticks in the null zone, italic "Uploaded: {date}" tooltip labels for null-zone positions. Seek cooldown (`SEEK_COOLDOWN_MS` at data arrival; deferred scroll timer `SEEK_DEFERRED_SCROLL_MS` fires after cooldown to trigger extends without causing swimming — see `tuning.ts`).

## Sort Context (`lib/sort-context.ts`, ~1,030 lines)

Sort-aware label computation for the scrubber tooltip and track ticks. `SORT_LABEL_MAP` maps sort keys to image field accessors and display formatters (date, keyword, numeric). Adaptive date granularity: total span < 28 days → show time (d Mon H:mm); ≥ 28 days → d Mon yyyy; viewport > 28 days → Mon yyyy. Fixed-width `<span>` elements prevent tooltip jitter during drag. `interpolateNullZoneSortLabel` handles null-zone tooltip labels (italic "Uploaded: {date}"). `computeTrackTicksWithNullZone` builds tick arrays with null-zone boundary and red-tinted null ticks. O(log n) binary search on distributions — zero network during drag.

---

# Null-Zone System

## Null-Zone Seek for Sparse Sort Fields

When sorting by fields with many missing values (e.g. `lastModified`, `dateTaken`), scrubber seek correctly positions within the "null zone" (docs without the field). Uses filtered `search_after` (narrowed to missing-field docs, sorted by uploadTime fallback) + null-aware `countBefore`. Sort clause builder injects universal `uploadTime` fallback for meaningful null-zone ordering. Null-zone cursor detection is shared across seek, extendForward, extendBackward, scroll-mode fill, and buffer-around-image via `detectNullZoneCursor` + `remapNullZoneSortValues` helpers. **Critical invariant:** when a null-zone filter is active, `result.total` from ES is the filtered count (only null-zone docs), not the full corpus — all four write sites (`seek`, `extendForward`, `extendBackward`, `_fillBufferForScrollMode`) preserve `state.total` instead of overwriting with `result.total`.

## Null-Zone Scrubber UX

Visual feedback when the user enters the null zone. A red boundary tick with a vertical "No {field}" label marks the transition. Null-zone ticks are rendered in red (from a separate uploadTime `date_histogram` distribution, auto-fetched when the primary distribution reveals `coveredCount < total`). Tooltip labels in the null zone show italic "Uploaded: {date}" using the null-zone distribution. The boundary label is edge-clamped via a ref callback (`offsetHeight` measurement + 5px pad) so it never overflows the track bounds. All null-zone UX is in `sort-context.ts` (`interpolateNullZoneSortLabel`, `computeTrackTicksWithNullZone`) + `Scrubber.tsx` (boundary tick rendering) + `search.tsx` (wiring) + `search-store.ts` (`fetchNullZoneDistribution`).

---

# Testing

291 Vitest unit/integration tests (~5s) — includes 10 null-zone seek/extend tests + 3 total-corruption regression tests using sparse `MockDataSource` (50k images, 20% `lastModified` coverage) + **17 reverse-compute unit tests** (`computeScrollTarget` edge cases: cold-start headroom, sub-row preservation, End key, fractional boundary, buffer-shrink clamping). 147 Playwright E2E tests — scrubber (including flash-prevention golden table with **0px scroll-drift tolerance**, bidirectional buffer verification, scroll-up-after-seek grid+table with headroom-adjusted wheel events, settle-window visible content stability — **0 items content shift** with bidirectional seek, headroom-zone swim regression test, **scrollTop=0 cold-start seek test**, **rAF scrollTop monotonicity test** using frame-accurate `sampleScrollTopAtFrameRate` helper), buffer corruption regression suite (including Home logo scroll-reset without prior deep seek), density-focus drift, visual baselines. Safety gate refuses real ES. 19 perf scenarios + 6 experiment scenarios. Corpus pinned via `PERF_STABLE_UNTIL`. 11 smoke tests for TEST cluster (`manual-smoke-test.spec.ts`). 18 scroll stability smoke tests (`smoke-scroll-stability.spec.ts`, S12-S27b) including headroom-zone position preservation (S24), **rAF-enhanced settle-window with CLS capture (S23)**, and **fresh-app cold-start seek (S25)**. Shared `smoke-report.ts` writes structured JSON report to `test-results/smoke-report.json` for agent consumption; all 29 passed on real data (1.3M docs, except 2 pre-existing Credit sort failures S2/S6). `CPU_THROTTLE` env var enables CDP CPU throttle on any test mode for slow-hardware experiments (e.g. `CPU_THROTTLE=4`).

**Test suite reference:** `e2e/README.md` — 8 test modes, decision tree, file map, full env var / runner flag documentation.

**npm scripts:** `test`, `test:e2e`, `test:e2e:full`, `test:smoke`, `test:perf`, `test:experiment`, `test:diag`.

**Logging pattern:** all diagnostic `console.log` calls use `devLog()` from `src/lib/dev-log.ts` — a thin wrapper guarded by `import.meta.env.DEV` so Vite DCEs them in prod. E2E tests can still read these messages via `KupuaHelpers.getConsoleLogs()` because Playwright runs against the dev server. Use `devLog` for all new diagnostic logging; reserve bare `console.warn` for genuine error paths only.

