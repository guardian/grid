# Kupua — Component Detail Reference

> This file contains detailed descriptions of every major component/subsystem.
> It is NOT loaded at session start. Agents read it on demand when working on
> a specific area. For the bootstrap summary, see `kupua/AGENTS.md`.

## DAL (`src/dal/`, ~2,550 lines across 5 files)

`ImageDataSource` interface → `ElasticsearchDataSource`. Core: `search`, `searchAfter` (+ PIT with 404/410 fallback, optional `sortOverride` + `extraFilter` for null-zone seek), `count`, `getById`, batched `getAggregations`. Advanced: `countBefore` (null-aware via `exists`/`must_not:exists`), `estimateSortValue` (percentile), `findKeywordSortValue` (composite walk), `getKeywordDistribution`, `getDateDistribution` (adaptive interval: month / day / hour / 30m / 10m / 5m via `calendar_interval` or `fixed_interval`). Write protection on non-local ES. `MockDataSource` for tests (supports `sparseFields` config and `extraFilter` for null-zone testing). ES-specific code in `dal/adapters/elasticsearch/`: CQL→ES translator, sort clause builders (with universal `uploadTime` fallback). Tuning constants in `constants/tuning.ts`.

## State (`src/stores/search-store.ts`, ~2,540 lines)

Zustand. Windowed buffer (max 1000, cursor-based extend/evict/seek). Bidirectional seek: deep paths add a backward `search_after` after the forward fetch, placing the user in the buffer middle. Scroll-mode fill for small result sets. `imagePositions: Map` for O(1) lookup. Sort-around-focus ("Never Lost"). PIT lifecycle with generation counter (`_pitGeneration` — seek/extend skip stale PITs to avoid 404 round-trips, keepalive 1m). New-images ticker. Aggregation cache + circuit breaker (expanded agg requests have abort controllers). Sort distribution (`sortDistribution`) + null-zone uploadTime distribution (`nullZoneDistribution`) for scrubber labels/ticks. Separate `column-store` + `panel-store` (localStorage-persisted).

## URL Sync

Single source of truth. `useUrlSearchSync` → store → search. Zod-validated params. `resetSearchSync()` for forced re-search. Custom `URLSearchParams`-based serialisation. `useDocumentTitle` hook sets `document.title` to `{query} | the Grid` (mirrors kahuna's `ui-title` directive), with `(N new)` prefix from the new-images ticker.

## CQL

`@guardian/cql` parser + custom CQL→ES translator (in `dal/adapters/elasticsearch/`). `<cql-input>` Web Component. `LazyTypeahead` for non-blocking suggestions. Structured queries, `fileType:jpeg` → MIME, `is:GNM-owned`.

## Table View (`ImageTable.tsx`, ~1,260 lines)

TanStack Table + Virtual. Column defs from field-registry (23 hardcoded + config-driven alias fields). Resize, auto-fit, visibility context menu (rendered outside the scroll container to avoid `contain: strict` breaking `position: fixed`), sort on header click (shift for secondary), auto-reveal hidden columns on sort. Click-to-search (shift/alt modifiers, AST-based polarity flip). Row focus, double-click to detail. ARIA roles. Horizontal scrollbar via proxy div; vertical hidden (Scrubber replaces it).

## Grid View (`ImageGrid.tsx`, ~520 lines)

Responsive columns (`floor(width/280)`), 303px row height, S3 thumbnails, focus ring + keyboard nav, scroll anchoring on column count change. Sort-aware date label (Uploaded/Taken/Modified adapts to primary sort field).

## Scroll Effects (`useScrollEffects.ts`, ~700 lines)

Shared hook for all scroll lifecycle — parameterised by `ScrollGeometry` descriptor. Handles: scroll reset orchestration, prepend/forward-evict compensation, seek scroll-to-target (effect #6: reverse-compute + lastVisibleRow buffer-shrink preservation + `_seekSubRowOffset` for headroom-zone sub-row pixel preservation), sort-around-focus scroll, density-focus save/restore (with edge clamping), bufferOffset→0 guard. Seek timing constants in `tuning.ts`: `SEEK_COOLDOWN_MS` (100ms, post-arrival extend block — tuned down from 700ms, floor at 65–80ms), `SEEK_DEFERRED_SCROLL_MS` (derived: cooldown + 50ms = 150ms, fires synthetic scroll to trigger extends), `SEARCH_FETCH_COOLDOWN_MS` (2000ms, blocks extends during in-flight search/abort). Post-extend cooldown: each `extendBackward` completion sets a 50ms cooldown (tuned down from 200ms, floor at 32ms) to prevent cascading prepend compensations (swimming). Full timing chain: seek data → 100ms cooldown → 150ms deferred scroll → first extends fire (was 700ms → 800ms, 5.3× faster). The old `_postSeekBackwardSuppress` flag in `useDataWindow.ts` has been removed — it prevented swimming but also prevented scrolling up after seek. Module-level bridges for density-focus and sort-focus.

## Orchestration (`lib/orchestration/search.ts`)

Imperative coordination functions extracted from UI components and hooks. Holds: debounce cancellation (`cancelSearchDebounce`, `getCqlInputGeneration`), go-home preparation (`resetScrollAndFocusSearch` — aborts extends, resets scroll when safe, resets visible range + scrubber thumb, focuses CQL input; scroll-reset uses a two-branch strategy: **eager `scrollTop = 0` when `bufferOffset === 0`** (buffer has correct first-page data, no flash risk) or **deferred via effect #8** when `bufferOffset > 0` (prevents flash of stale deep-offset content) — same logic as the Home key handler in `useListNavigation.ts`), URL sync reset (`resetSearchSync`). Called by SearchBar, ImageTable, ImageMetadata, ImageDetail, useScrollEffects, useUrlSearchSync. Dependency direction: components → hooks → lib → dal.

## Reset-to-Home (`lib/reset-to-home.ts`)

Single `resetToHome()` function deduplicating the reset sequence from SearchBar and ImageDetail logo click handlers. Clears `focusedImageId` and density-focus saved state **before** navigation — prevents the table unmount from saving a stale viewport ratio and the grid mount from restoring it (which would fight the go-home scroll-to-top intent).

## Scrubber (`Scrubber.tsx`, ~1,010 lines)

Vertical track, proportional thumb. Two modes: **scroll mode** (total ≤ threshold, direct scroll) and **seek mode** (windowed buffer, seek on pointer-up). Deep seek via percentile estimation (date/numeric) or composite aggregation (keyword) with direction-aware `search_after` cursor anchors (`buildSeekCursorAnchors` — desc fields get `MAX_SAFE_INTEGER`, asc get `0`, id gets `""`). Binary search refinement on the `id` tiebreaker when keyword bucket drift exceeds PAGE_SIZE. End key fast path: reverse `search_after` when target is within PAGE_SIZE of total, guaranteeing the buffer covers the last items. Null-zone seek uses the null-zone uploadTime distribution (fetched with `must_not:exists` filter for accuracy) for direct position→date mapping — no percentile needed, ~0.6% position accuracy. Sort-aware tooltip with adaptive date granularity. Keyword distribution binary search (O(log n), zero network during drag). Track tick marks with label decimation + hover animation; ticks are positioned by doc count (not time), so their spacing functions as a density map — dense clusters spread wide, sparse gaps compress. This is an explicit design choice: never linearise ticks by time. Null-zone UX: red boundary tick with vertical "No {field}" label (edge-clamped to track bounds), red-tinted uploadTime-based ticks in the null zone, italic "Uploaded: {date}" tooltip labels for null-zone positions. Seek cooldown (`SEEK_COOLDOWN_MS` at data arrival; deferred scroll timer `SEEK_DEFERRED_SCROLL_MS` fires after cooldown to trigger extends without causing swimming — see `tuning.ts`).

## Panels (`PanelLayout.tsx`)

Left (facet filters) / right (focused-image metadata). Resize handles, `[`/`]` keyboard shortcuts, `AccordionSection` with persisted state. Facet filters: batched aggs, click/alt-click for CQL chips, "Show more" per field. Right panel: registry-driven `ImageMetadata`.

## Image Detail (`ImageDetail.tsx`)

Overlay within search route (search page stays mounted with `opacity-0`). Counter, prev/next, direction-aware prefetch pipeline (shared `image-prefetch.ts`, T=150ms throttle gate), fullscreen survives between images. Position cache in sessionStorage (offset + sort cursor + search fingerprint) for reload restoration at any depth via `restoreAroundCursor`. AVIF format, DPR-aware sizing.

## Fullscreen Preview (`FullscreenPreview.tsx`)

Lightweight fullscreen peek from grid/table — press `f` to view focused image edge-to-edge via Fullscreen API. No route change, no metadata. Arrow keys traverse images, updating `focusedImageId`; exit (Esc/Backspace/f) scrolls list to centered focused image. Shares prefetch pipeline with ImageDetail. Another density of the same ordered list.

## Field Registry (`field-registry.ts`)

Single source of truth for all image fields. 23 hardcoded + config-driven aliases. Drives table columns, sort dropdown, facet filters, detail panel. `detailLayout`/`detailGroup`/`detailClickable` hints for metadata display.

## Null-Zone Seek for Sparse Sort Fields

When sorting by fields with many missing values (e.g. `lastModified`, `dateTaken`), scrubber seek correctly positions within the "null zone" (docs without the field). Uses filtered `search_after` (narrowed to missing-field docs, sorted by uploadTime fallback) + null-aware `countBefore`. Sort clause builder injects universal `uploadTime` fallback for meaningful null-zone ordering. Null-zone cursor detection is shared across seek, extendForward, extendBackward, scroll-mode fill, and buffer-around-image via `detectNullZoneCursor` + `remapNullZoneSortValues` helpers. **Critical invariant:** when a null-zone filter is active, `result.total` from ES is the filtered count (only null-zone docs), not the full corpus — all four write sites (`seek`, `extendForward`, `extendBackward`, `_fillBufferForScrollMode`) preserve `state.total` instead of overwriting with `result.total`.

## Null-Zone Scrubber UX

Visual feedback when the user enters the null zone. A red boundary tick with a vertical "No {field}" label marks the transition. Null-zone ticks are rendered in red (from a separate uploadTime `date_histogram` distribution, auto-fetched when the primary distribution reveals `coveredCount < total`). Tooltip labels in the null zone show italic "Uploaded: {date}" using the null-zone distribution. The boundary label is edge-clamped via a ref callback (`offsetHeight` measurement + 5px pad) so it never overflows the track bounds. All null-zone UX is in `sort-context.ts` (`interpolateNullZoneSortLabel`, `computeTrackTicksWithNullZone`) + `Scrubber.tsx` (boundary tick rendering) + `search.tsx` (wiring) + `search-store.ts` (`fetchNullZoneDistribution`).

## Testing

203 Vitest unit/integration tests (~5s) — includes 7 null-zone seek/extend tests + 3 total-corruption regression tests using sparse `MockDataSource` (50k images, 20% `lastModified` coverage) + **17 reverse-compute unit tests** (`computeScrollTarget` edge cases: cold-start headroom, sub-row preservation, End key, fractional boundary, buffer-shrink clamping). 90 Playwright E2E tests (~70s) — scrubber (including flash-prevention golden table with **0px scroll-drift tolerance**, bidirectional buffer verification, scroll-up-after-seek grid+table with headroom-adjusted wheel events, settle-window visible content stability — **0 items content shift** with bidirectional seek, headroom-zone swim regression test, **scrollTop=0 cold-start seek test**, **rAF scrollTop monotonicity test** using frame-accurate `sampleScrollTopAtFrameRate` helper), buffer corruption regression suite (including Home logo scroll-reset without prior deep seek), density-focus drift, visual baselines. Safety gate refuses real ES. 19 perf tests + experiment infrastructure (16 scenarios). Corpus pinned via `PERF_STABLE_UNTIL`. 11 smoke tests for TEST cluster (`manual-smoke-test.spec.ts`). 14 scroll stability smoke tests (`smoke-scroll-stability.spec.ts`, S12-S25) including headroom-zone position preservation (S24), **rAF-enhanced settle-window with CLS capture (S23)**, and **fresh-app cold-start seek (S25)**. Shared `smoke-report.ts` writes structured JSON report to `test-results/smoke-report.json` for agent consumption; all 25 passed on real data (1.3M docs, except 2 pre-existing Credit sort failures S2/S6). `CPU_THROTTLE` env var enables CDP CPU throttle on any test mode for slow-hardware experiments (e.g. `CPU_THROTTLE=4`).

**Test suite reference:** `e2e/README.md` — 7 test modes, decision tree, file map, full env var / runner flag documentation.

**npm scripts:** `test`, `test:e2e`, `test:e2e:full`, `test:smoke`, `test:perf`, `test:experiment`, `test:diag`.

**Logging pattern:** all diagnostic `console.log` calls use `devLog()` from `src/lib/dev-log.ts` — a thin wrapper guarded by `import.meta.env.DEV` so Vite DCEs them in prod. E2E tests can still read these messages via `KupuaHelpers.getConsoleLogs()` because Playwright runs against the dev server. Use `devLog` for all new diagnostic logging; reserve bare `console.warn` for genuine error paths only.

