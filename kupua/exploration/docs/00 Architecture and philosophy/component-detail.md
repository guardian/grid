# Kupua — Component Detail Reference

> This file contains detailed descriptions of every major component/subsystem.
> It is NOT loaded at session start. Agents read it on demand when working on
> a specific area. For the bootstrap summary, see `kupua/AGENTS.md`.
>
> **Last updated: 25 May 2026.**.

---

# Data Layer

## DAL (`src/dal/`)

`ImageDataSource` interface (`dal/types.ts`) → `ElasticsearchDataSource` (`es-adapter.ts`). 12 methods spanning search, cursor-based pagination (PIT with 404/410 fallback), aggregations (terms + IS-filter in one request), percentile estimation, composite keyword walk, and date/keyword distributions (adaptive interval selection). Selection-era additions: `getByIds` (mget, 1k-chunk parallel) and `getIdRange` (search_after walk, hard cap 5k). Write protection on non-local ES. `MockDataSource` for tests (supports `sparseFields` + `extraFilter` for null-zone testing). `PositionMap` (`position-map.ts`) — lightweight cursor index for scrubber fast-path seek (avoids percentile when total ≤ POSITION_MAP_THRESHOLD).

ES-specific code in `dal/adapters/elasticsearch/`: CQL→ES translator, sort clause builders (universal `uploadTime` fallback). Null-zone helpers in `dal/null-zone.ts` (`detectNullZoneCursor`, `remapNullZoneSortValues`) — shared across seek, extend, fill, and getIdRange paths.

**Gotchas:**
- **`DATE_SORT_FIELDS`** (exported set) — ES sort values are epoch ms; `_source` values are ISO strings. Callers must convert ISO→epoch before comparing.
- **`ALLOWED_ES_PATHS`** lives in **both** `es-config.ts` and `vite.config.ts` (separate hardcoded arrays that must be kept manually in sync).

## Grid API Adapter (`src/dal/grid-api/`, ~450 lines across 5 files)

`GridApiDataSource` — HATEOAS service discovery (`service-discovery.ts`) against the Grid API root. `getImageDetail(id)`: fetches full Argo-envelope single-image response, unwraps `EmbeddedEntity`. Error hierarchy: `AuthError`, `SessionExpiredError`, `ArgoError`, `WriteGuardBlockedError`. Argo helpers in `argo.ts`. All fetches are best-effort enrichment: network failure or non-2xx → `null` → caller degrades gracefully. Image rendering is never gated on API data (ES + S3 proxy + own imgproxy path is always the baseline). Write protection: `gridApiWriteGuard()` Vite plugin blocks all non-GET methods on `/api` proxy prefixes (returns 403), unless `VITE_GRID_API_WRITES_ENABLED=true`. Module singleton at `lib/grid-api-instance.ts` — `initGridApi()` called once on search route mount; serves intent-driven single-image fetches only (no polling loop).

## Enrichment System (`lib/cost/`, `stores/enrichment-store.ts`, `lib/derive-enriched-image.ts`)

Three-layer merge model:

1. **ES baseline** — `SOURCE_INCLUDES` in `es-config.ts` fetches cost/validity/rights/leases/usages/labels/syndicationRights/XMP fields. Always available.
2. **TS cost+validity calculation** — `calculateCost` (port of Scala `CostCalculator`), `buildValidityMap` + `deriveValid` (mirrors Scala's two-pass override model), `isImagePotentiallyGraphic` (TS port, replaces Painless script field not in `_source`), quota-store (`fetchQuotas()` at startup, graceful absence). `guardian-config.json` is a vendored config snapshot.
3. **Optional API overlay** — `enrichment-store` (Zustand, no persistence) populated by single-image Grid API fetch on detail open. `deriveImage(image, overlay?)` is the single merge point; API wins field-by-field; `undefined` overlay returns full baseline.

**Consuming enriched data:** Components use `useEnrichedImage(image)` — subscribes per-id to enrichment-store (O(1) `Map.get`), no search-store subscription. Non-React callers use `deriveImage` directly.

## State (`src/stores/search-store.ts`, 3,750 lines)

Zustand. Windowed buffer (max 1000, cursor-based extend/evict/seek) — shared by all three scroll tiers (`03-scroll-architecture.md` §2). Scroll-mode fill (`_fillBufferForScrollMode`) loads all results when total ≤ SCROLL_MODE_THRESHOLD (1000). Background `positionMap` fetch (for SCROLL_MODE_THRESHOLD < total ≤ POSITION_MAP_THRESHOLD = 65k) enables indexed scroll tier. Above 65k, the scrubber falls back to seek-only. Bidirectional seek: deep paths add a backward `search_after` after the forward fetch, placing the user in the buffer middle. `imagePositions: Map` for O(1) lookup. Sort-around-focus ("Never Lost"). PIT lifecycle with generation counter (`_pitGeneration` — seek/extend skip stale PITs to avoid 404 round-trips, keepalive 1m). New-images ticker. Aggregation cache + circuit breaker (expanded agg requests have abort controllers). Sort distribution (`sortDistribution`) + null-zone uploadTime distribution (`nullZoneDistribution`) for scrubber labels/ticks. Separate `column-store` + `panel-store` (localStorage-persisted).

## Field Registry (`lib/field-registry.tsx`, ~920 lines — renamed `.ts`→`.tsx` for JSX in `cellRenderer`)

Single source of truth for all image fields. 37+ hardcoded + config-driven aliases. Fields carry `multiSelectBehaviour` (`"scalar" | "chip-array" | "summary" | "always-suppress"`), `showWhenEmpty` (renders `<Dash />` placeholder), `visibleWhen` (config gate, e.g. `imageTypes?.length`), `summariser`. `RECONCILE_FIELDS` exported (non-`always-suppress` fields). Drives table columns, sort dropdown, facet filters, detail panel, multi-image metadata panel. `detailLayout`/`detailGroup`/`detailClickable` hints for metadata display. `pillVariant?: "default" | "accent"` for field-specific pill styling (accent = Guardian blue, used by `labels`). Exports `SORT_DROPDOWN_OPTIONS` and `DESC_BY_DEFAULT` set for sort controls. `cost` field added (Cluster 1); `labels` field added (`userMetadata.labels`, `pillVariant: "accent"`).

## URL Sync

Single source of truth. `useUrlSearchSync` → store → search. Zod-validated params (`search-params-schema.ts`). `resetSearchSync()` for forced re-search. Custom `URLSearchParams`-based serialisation. Sort-only change detection triggers `sortAroundFocusId` when only `orderBy` changes while an image is focused. Sort-around-focus falls back to `anchorId` when `focusedImageId` is null and selection mode is active (so sort changes in selection mode preserve position). `useDocumentTitle` hook sets `document.title` to `{query} | the Grid`, with `(N new)` prefix from the new-images ticker. Selections clear-on-navigation hook wired here (gated on `SELECTIONS_PERSIST_ACROSS_NAVIGATION` in `tuning.ts`, skips sort-only and first-mount).

## CQL

`@guardian/cql` parser + custom CQL→ES translator (in `dal/adapters/elasticsearch/`). `<cql-input>` Web Component. `LazyTypeahead` (`lazy-typeahead.ts`) for non-blocking suggestions. `typeahead-fields.ts` configures which fields support typeahead and how suggestions are fetched — resolvers read from the search store's aggregation cache first (via a ref-based getter to avoid rebuilding the typeahead on every render), falling back to single-field ES calls. CQL's native `TextSuggestionOption.count` renders document counts flush-right in the dropdown. Structured queries, `fileType:jpeg` → MIME, `is:GNM-owned`, `is:agency-pick`, `is:under-quota` (wired to quota-store's `getOverQuotaSuppliers()`). `is:` resolver enriches the static option list with document counts: ticker-backed values from `tickerCounts` store, `gnm-owned-photo`/`gnm-owned-illustration` from category agg buckets, `deleted`/`under-quota`/photo/illustration from direct `getAggregations(..., [], undefined, filterRequests)` when store cache is cold. `IS_OPTIONS` hoisted to module level (built once from `buildIsOptions()`). `parseCql` used to derive filter agg queries — single source of truth in `cql.ts`.

## Image URLs (`lib/image-urls.ts`, ~250 lines)

URL builders for thumbnails and full-size images. Thumbnails served from S3 via local proxy (`/s3/thumb/<id>`). Full-size images served via imgproxy: AVIF format by default, DPR-aware sizing (two-tier: 1× for standard displays, 1.5× for HiDPI > 1.3), EXIF orientation → explicit `rotate:N` (auto_rotate disabled), native-resolution cap to prevent upscale. `getFullImageUrl()` builds imgproxy processing URLs; `getThumbnailUrl()` returns proxied S3 paths. Both return `undefined` when the respective service is unavailable (local mode).

## Grid Config (`lib/grid-config.ts`)

Hardcoded mock of Grid's runtime config (image types, usage rights categories, CQL typeahead field lists). Derived from `exploration/mock/grid-config.conf`. CQL parser and typeahead resolvers depend on this. **Known tech debt:** will be replaced by a real config endpoint in Phase 3 (Grid API integration).

---

# Hooks & Coordination

## Data Window (`hooks/useDataWindow.ts`)

Bridge between the search store and view components (ImageTable, ImageGrid, ImageDetail). Provides buffer-aware data access (`getImage(index)`), edge detection + extend triggers (`reportVisibleRange`), and a density-independent API. Two hook modes: **normal** (buffer-local indices, virtualiserCount = results.length) and **two-tier** (global indices 0..total-1, skeleton cells outside buffer, scrubber drag directly scrolls). Normal mode serves both the scroll tier (≤1k, full buffer) and the seek tier (>65k, windowed buffer); two-tier mode serves the indexed scroll tier (1k–65k). Viewport anchor tracking (always the centre image) for density-focus and sort-around-focus fallback. Scroll-seek debounce (200ms) for two-tier mode.

## Scroll Effects (`hooks/useScrollEffects.ts`)

Shared hook for all scroll lifecycle — parameterised by `ScrollGeometry` descriptor. Handles: scroll reset orchestration, prepend/forward-evict compensation, seek scroll-to-target (reverse-compute + lastVisibleRow buffer-shrink preservation + headroom-zone sub-row pixel preservation), sort-around-focus scroll, density-focus save/restore (with edge clamping), bufferOffset→0 guard.

**Scope by tier:** Prepend compensation and eviction compensation apply only in the **scroll** (≤1k) and **seek** (>65k) tiers where the virtualizer count equals the buffer length and items are inserted/removed. In the **indexed scroll** tier (1k–65k), the virtualizer always spans `total` items — items are replaced at fixed global positions, not inserted or removed. Swimming does not exist in indexed scroll mode. The timing chain below still applies to seek cooldowns.

**Key invariants:**
- **Seek cooldowns** (constants in `tuning.ts`): post-arrival extend block, deferred scroll timer (fires synthetic scroll to trigger extends without causing swimming), search-fetch cooldown (blocks extends during in-flight search/abort).
- **Post-extend cooldown:** prevents cascading prepend compensations (swimming).
- **`seekGeneration` ref guard:** on seek, skips one stale `handleScroll` to prevent spurious `extendBackward`.
- **End-seek focus guard:** `_pendingFocusAfterSeek: "last"` always set; actual `focusedImageId` write conditional on existing focus.
- Module-level bridges for density-focus and sort-focus.

## List Navigation (`hooks/useListNavigation.ts`)

Shared keyboard navigation for all density views, parameterised by `ListNavigationConfig`. Two modes: **no focus** (Arrow Up/Down scroll one row, PageUp/Down scroll one page, Home/End go to absolute start/end — none set focus) and **has focus** (arrows move focus by ±columnsPerRow, PageUp/Down move focus by one page of rows, Home/End focus first/last image, Enter opens detail). Table passes `columnsPerRow: 1`, grid passes `columnsPerRow: N`. CQL input propagates ArrowUp/Down/PageUp/Down/Home/End; native inputs excluded via `isNativeInputTarget`. Home key: two-branch scroll-reset (eager `scrollTop=0` when `bufferOffset=0`, deferred otherwise). End key: uses `virtualizer.scrollToIndex` (not raw `scrollHeight` — that overshoots by sticky header height). In selection mode: arrow keys are scroll-only; table Left/Right scroll container horizontally. Alt+arrow combos fall through to browser defaults.

## Image Traversal (`hooks/useImageTraversal.ts`)

Shared prev/next navigation for ImageDetail and FullscreenPreview. Works uniformly across all three scroll modes (buffer, two-tier, seek). If the adjacent image is in the buffer → navigate immediately; if near buffer edge → trigger extend, store pending navigation, resolve when buffer grows; if at absolute boundary → no-op. All logic in global indices. Fires `prefetchNearbyImages` on every successful navigation (direction-aware). Traversal is disabled while `usePinchZoom` reports scale > 1×.

## Return from Detail (`hooks/useReturnFromDetail.ts`)

Restores focus and scroll position when the image detail overlay closes (the other half of architecture decision #7). When the `image` URL param transitions present → absent, scrolls the list to the previously-viewed image and restores keyboard focus. Extracted from duplicated logic in ImageTable and ImageGrid.

## Prefetch Pipeline (`lib/image-prefetch.ts`)

Cadence-aware prefetch shared by ImageDetail, FullscreenPreview, and the swipe carousel. Organised around a **TraversalSession** — a module-level singleton that tracks the user's navigation burst (held arrow key, chain-swipe). EMA-smoothed cadence determines prefetch radius: fast bursts → narrow (i±1 + far lookahead); stable cadence → full radius. Post-burst debounce fires a full-radius fill around the resting position. Stale in-flight requests cancelled via `img.src = ""`. `fetchPriority` hints keep the most-likely-next image at the front of the browser's connection queue. On mobile, thumbnails are issued before full-res within each batch. All thresholds tunable at runtime via `localStorage` keys (`kupua.prefetch.<key>`) — no rebuild needed.

## Prepend Transform — DEAD CODE

> **`lib/prepend-transform.ts` is dead code** (~140 lines, zero importers). Created for
> the A+T CSS-transform experiment (April 2026), reverted, never deleted. See
> `scroll-audit.md` §Q4 and `dead-code-audit-findings.md` #1. Delete when convenient.

## Orchestration (`lib/orchestration/search.ts`)

Imperative coordination functions extracted from UI components and hooks. Holds: debounce cancellation (`cancelSearchDebounce`, `getCqlInputGeneration`), go-home preparation (`resetScrollAndFocusSearch`), URL sync reset (`resetSearchSync`), fullscreen preview registration (`registerEnterPreview` / `enterFullscreenPreview` — used by middle-click handler in ImageGrid/ImageTable, same pattern as `scrollToFocused`). Called by SearchBar, ImageTable, ImageMetadata, ImageDetail, useScrollEffects, useUrlSearchSync. Dependency direction: components → hooks → lib → dal.

## Reset-to-Home (`lib/reset-to-home.ts`)

Single `resetToHome()` function deduplicating the reset sequence from SearchBar and ImageDetail logo click handlers. Clears `focusedImageId`, density-focus saved state, and selection (`selection.clear()`) **before** navigation — prevents the table unmount from saving a stale viewport ratio and the grid mount from restoring it (which would fight the go-home scroll-to-top intent).

## Keyboard Shortcuts (`lib/keyboard-shortcuts.ts`)

Centralised shortcut registry. Single-character shortcuts: bare key when not in an editable field, Alt+key when editing (Alt chosen to avoid Cmd/Ctrl browser conflicts). One `keydown` listener on `document` (capture phase). Components register via `registerShortcut()`/`unregisterShortcut()` or `useKeyboardShortcut` hook. `shortcutTooltip()` formats hints for button titles. `isNativeInputTarget()` guards against firing in date inputs and other native controls. Elements with `data-grid-nav-input` attribute are excluded from native-input detection (opt-in to grid navigation while remaining an `<input>`).

## Bedrock Proxy Client (`lib/bedrock-proxy-client.ts`)

`getEmbedding(query): Promise<number[]>` and `checkBedrockHealth(): Promise<boolean>`. Plain `fetch()` to Vite middleware endpoints (`/bedrock/embed?q=...`, `/bedrock/health`). Called by `es-adapter.ts:searchByAi()` and `main.tsx` (startup health check). Graceful: network error → returns `false` / throws (caught by store).

## AI Search Params (`lib/ai-search-params.ts`)

`decorateParamsForAggregations(params, resultIds)`: when `params.aiQuery` is present, injects `params.ids = resultIds` so ES aggregation/ticker queries scope to the ≤200 AI result set. No-op when AI inactive. Used by `fetchAggregations`, `fetchExpandedAgg`, and the AI branch's ticker call in `search-store.ts`.

## Browser History (`lib/orchestration/history-key.ts`, `lib/history-snapshot.ts`, `lib/build-history-snapshot.ts`)

`kupuaKey` scheme attaches a per-entry UUID to every `pushState`/`replaceState`. `history-snapshot.ts` stores/retrieves `HistorySnapshot` (scroll position, buffer state, focus, etc.) in sessionStorage keyed by `kupuaKey`. `build-history-snapshot.ts` constructs the snapshot from current store state. `useUrlSearchSync.ts` popstate handler restores the snapshot (if present) rather than doing a fresh search. Full architecture: `exploration/docs/00 Architecture and philosophy/04-browser-history-architecture.md`.

## Touch Gesture Hooks

- **`hooks/useSwipeCarousel.ts`** — visual slide-in carousel for prev/next on mobile touch. Velocity-aware commit, `commitStripReset`. Used by ImageDetail.
- **`hooks/useSwipeDismiss.ts`** — pull-down-to-dismiss image detail. Spring-back, fade+scale. Mobile, non-fullscreen only.
- **`hooks/useLongPress.ts`** — 500ms threshold, movement cancel, contextmenu suppress, Android `pointercancel` fix via committed-state guard. First long-press enters selection mode; second long-press dispatches full `add-range` (same buffer/server path as desktop shift-click). `handleLongPressStart.ts` is the shared helper extracted from grid+table.
- **`hooks/usePinchZoom.ts`** — fullscreen-only. Touch: two-finger pinch 1×–5×, single-finger pan, double-tap 1×↔2×. Desktop: click-to-zoom 1×↔2×, wheel zoom 1×–4×, drag-to-pan with momentum (rAF decay, relaxed overflow clamp), keyboard zoom (Space toggle, arrows pan, Home/End snap to corners). Rapid second click exits fullscreen (double-click window). **Ghost-click guard:** `lastTouchTime` gate prevents mouse handlers firing after `touchend`. **`onScaleChange` callback** notifies traversal hook to disable nav while zoomed. Zoom resets on image change.

---

# Selection System

## Selection Store (`stores/selection-store.ts`)

Zustand with `persist` middleware → sessionStorage, debounced 250ms. State: `selectedIds: Set<string>`, `anchorId: string | null`, `metadataCache: LRU<id, Image>` (cap 5000), lazy-computed `reconciledView`. Cohesion rules enforced in store: `toggle()` and `setAnchor()` both call `ensureMetadata()` (batched mget via `getByIds`). After mget resolves, reconciliation is enqueued if any fetched IDs overlap `selectedIds` — callers do NOT do `.then(enqueueReconcile)`. `electFallbackAnchor()` re-elects anchor on deselect/remove to the last remaining `Set` entry, keeping `anchorId` always pointing at a selected image (or null). `add(ids[])` is atomic (one persist write per call). `hydrate()` called on `/search` route mount — passes `fullRecompute: true` to prevent count inflation on top of persisted view. Hydration-drop toast fires when ES no longer returns stored IDs (deduplicated via module-level `_hydrationToastShown`, reset on `clear()`). `SELECTIONS_PERSIST_ACROSS_NAVIGATION = false` in `tuning.ts` gates clear-on-search.

## Click Interpreter (`lib/interpretClick.ts`)

Pure function `interpretClick(ctx) → ClickEffect[]`. Six-row rule table is the contract: plain click = focus only; tickbox/cmd+click = toggle + set anchor; shift+click = `add-range` effect (polarity computed in `useRangeSelection` from `selectedIds.has(anchorId)` — not from `targetIsSelected`). `ClickEffect` union: `focus`, `toggle`, `set-anchor`, `add-range`. `dispatchClickEffects.ts` executes `ClickEffect[]` against store + navigation.

## Reconciliation (`lib/reconcile.ts`)

`recomputeAll(cache, selectedIds)` — O(N×F) full recompute, called on hydrate/clear/fullRecompute. Incremental: `reconcileAdd(view, image)` O(F) and `reconcileRemove(view, id)` O(F) with dirty-field marker on `mixed` remove. `chip-array` type uses `applyChipArrayAdd` (incremental, avoids O(N²)). `mixed` type stores `topValues: Array<{value, count}>` sorted by count desc (built via frequency `Map` during recomputeAll — zero extra iteration). `MultiValue.tsx` tooltip shows top 5 with counts (`Getty (31/47)`, `(+N others)` when >5). Idle-frame chunked scheduler in selection-store (~500 items/chunk via `requestIdleCallback`).

## Range Selection (`hooks/useRangeSelection.ts`)

Orchestrates shift-click range selection. In-buffer fast path: walks `imagePositions` directly. Out-of-buffer: server walk via `getIdRange`. AbortController + generation counter prevents stale results racing. `extractSortValues` converts ISO date strings to epoch ms for `DATE_SORT_FIELDS` — ES sort values are epoch ms while `_source` values are ISO strings; callers must not compare them directly. Toasts on hard-cap truncation (warning at 5000) and soft-cap (info at 2000, non-destructive). Mounted once in `routes/search.tsx`; `handleRange` passed as prop to ImageGrid/ImageTable. Image cell + row whitespace dispatch range; field cells (`data-cql-cell`) keep click-to-search.

## Selection UI

- **`components/Tickbox.tsx`** — absolute-positioned overlay (grid) + 32px leftmost column (table). `hooks/useIsSelected.ts` — per-id Zustand selector, prevents mass re-render on toggle. CSS-driven mode-flip via `[data-selection-mode="true"]` on container — zero React reconciliations on first tick. Blue cell overlay via CSS `:has(.tickbox[aria-checked="true"])`. Focus ring suppressed in selection mode.
- **`components/SelectionFab.tsx`** — coarse-pointer only. Count + X button. StatusBar count/clear hidden on coarse pointer.

---

# UI Components — Search & Toolbar

## SearchBar (`components/SearchBar.tsx`)

Top-level header: logo (click → `resetToHome()`), `CqlSearchInput` with 300ms debounce, `AiSearchInput` (gated by Bedrock availability), clear button, `SearchFilters` (middle + right), `SettingsMenu`. Manages CQL input generation for stale-debounce detection. Reads `searchParams.aiQuery` and passes to `AiSearchInput`; AI text changes propagate to URL via `updateSearch({ aiQuery })` with 600ms debounce. Cancels pending debounce on unmount to prevent navigation bouncing.

## AI Search Input (`components/AiSearchInput.tsx`)

Expandable semantic search widget inside the search bar border. Gated by `bedrockAvailable` (reactive subscription via `subscribeBedrockAvailable()`). Architecture:

- **Toggle:** Sparkles icon. Click collapsed → expand + autofocus. Click expanded → stash text to module-level `_stashedAiText`, collapse, clear `aiQuery` from URL. Click collapsed with stash → restore.
- **Local state decoupled from URL:** `localText` is not the URL param — prevents debounce from clobbering mid-keystroke. `selfCausedRef` guards against external changes overwriting local edits.
- **Content-based ch sizing:** Width computed from text length (focused: up to 28ch, blurred: up to 16ch, collapsed: max-width 0). CSS `transition-all duration-200`.
- **Auto-collapse on blur when empty:** If user opens widget but doesn't type, clicking away collapses it.
- **Grid navigation opt-in:** `data-grid-nav-input` attribute on the `<input>` makes `isNativeInputTarget()` return false → Up/Down/PgUp/PgDown/Home/End pass through to grid nav. Left/Right stopped via `stopPropagation` to keep text editing.
- **Escape:** Stashes text, collapses, clears AI from URL.
- **Inner ✕ button:** Clears text without collapsing (stays expanded + re-focused). Uses `onMouseDown + preventDefault` to prevent blur-triggered collapse.

URL param: `?aiQuery=<text>`. Store branch: `!!params.aiQuery` → `dal.searchByAi()` → Bedrock embed → KNN query → ≤200 results in-memory. No PIT, no pagination, no new-images poll. Sort auto-switches to `-relevance` on activation (mirrors collection auto-sort pattern). Client-side re-sort via `resortAiBuffer()` when user changes sort while AI active.

## Settings Menu (`components/SettingsMenu.tsx`)

Three-dot menu in SearchBar. Click mode toggle (explicit ⇔ phantom focus). Coarse pointer auto-detection (`stores/ui-prefs-store.ts` — `focusMode` + `pointer: coarse` detection, localStorage-persisted) disables explicit mode on touch devices.

## Search Filters (`components/SearchFilters.tsx`)

Split into two layout slots: **FilterControls** (middle — "Free to use only" toggle + `DateFilter`) and **SortControls** (right — sort field dropdown from `SORT_DROPDOWN_OPTIONS`, direction toggle, secondary sort with shift-click). Hidden on small screens (`< sm`). Sort via column header clicks still works on any screen size.

## Date Filter (`components/DateFilter.tsx`)

Dropdown for date range filtering. Mirrors kahuna's `gu-date-range`. Field selector (Upload time / Date taken / Last modified), preset buttons (Anytime, Today, Past 24h, Past week, Past 6 months, Past year), two date inputs (From / To) for custom ranges. Preset matching uses 2-hour tolerance for relative presets (survives stale tabs). Collapsed state shows "Anytime" or a summary label with accent dot. Timezone: picker is always local time; URL is always UTC. `toDateInputValue` uses `format(parseISO(iso), "yyyy-MM-dd")` (date-fns, local-time) — not `iso.slice(0, 10)` (which returns UTC date, wrong for timezones ahead of UTC).

## Status Bar (`components/StatusBar.tsx`)

Thin strip between toolbar and views. Left-panel toggle (with hover-prefetch for aggregations when the Filters section is localStorage-expanded), result count, new-images ticker (click clears selection before `reSearch()` to prevent flicker of old reconciled state), sort-around-focus indicator, density toggle, right-panel toggle. Selection count + Clear button (fine-pointer only — coarse uses FAB). Container queries for responsive label display.

Ticker badges: one per `gridConfig.tickerDefinitions` entry. Hidden when count = 0 or count = total. Background colour from definition. Click appends the `searchClause` to the current query. Native `title=` tooltip shows "last updated X ago" (from `tickersLastUpdated` store state) plus a `count  SupplierName` table for agency-pick subCounts. `buildTickerTooltip()` constructs the tooltip string.

## CQL Search Input (`components/CqlSearchInput.tsx`)

Wraps the `<cql-input>` Web Component from `@guardian/cql`. Bridges React ↔ Web Component lifecycle. `LazyTypeahead` provides non-blocking suggestions.

---

# UI Components — Views

## Table View (`components/ImageTable.tsx`)

TanStack Table + Virtual. Column defs from field-registry (37+ hardcoded + config-driven alias fields). `EnrichedTableRow` wrapper reads enriched data via `useEnrichedImage`. Badges column (cost badge), staff-photographer left border. Resize (CSS-variable injection avoids React re-renders during drag), auto-fit, visibility context menu (`ColumnContextMenu.tsx`, rendered outside scroll container to avoid `contain: strict` breaking `position: fixed`), sort on header click (shift for secondary), auto-reveal hidden columns on sort. Click-to-search (shift/alt modifiers, AST-based polarity flip) — field cells flagged with `data-cql-cell`; image cell + row whitespace dispatch range selection. Row focus, double-click to detail. Middle-click (`auxclick`, `button===1`) opens FullscreenPreview via `enterFullscreenPreview()`. ARIA roles (`grid`, `row`, `columnheader`, `gridcell`). Horizontal scrollbar via proxy div; vertical hidden (Scrubber replaces it). In selection mode: Left/Right arrows scroll container horizontally.

## Grid View (`components/ImageGrid.tsx`)

Responsive columns (`floor(width/280)`), 303px row height, S3 thumbnails, focus ring + keyboard nav. `ResizeObserver` with `captureAnchor` mechanism for scroll anchoring on column count change. Sort-aware date label (Uploaded/Taken/Modified adapts to primary sort field). Cluster 1 overlays: cost badge, graphic blur (`isImagePotentiallyGraphic`), image border (`lib/image-borders.ts` `getImageBorderColour()` — staff/contract/commissioned photographer: `#005689`; agency-pick: `#7d006880`), print/digital/syndication/persisted usage icons (via `useEnrichedImage`). Label pills rendered in a fixed-height (`h-6`) strip between thumbnail and description (`flex-nowrap overflow-hidden`, click-to-search with `stopPropagation`). Middle-click opens FullscreenPreview.

## Image Detail (`components/ImageDetail.tsx`)

Overlay within search route (search page stays mounted with `opacity-0 pointer-events-none`). Counter, prev/next (`NavStrip` + `useImageTraversal`), cadence-aware prefetch pipeline (shared `image-prefetch.ts` session model). Desktop zoom/pan via `usePinchZoom` (click/wheel/drag/keyboard). Touch swipe via `useSwipeCarousel` (velocity-aware prev/next) + `useSwipeDismiss` (pull-down dismiss). Fullscreen survives between images. Position cache in sessionStorage (`image-offset-cache.ts`: offset + sort cursor + search fingerprint) for reload restoration at any depth via `restoreAroundCursor`. Full-size images via imgproxy (AVIF, DPR-aware sizing). Stacked layout on mobile (flex-col, image top, metadata below). Middle-click exits fullscreen. Bug note: auxclick effect deps include `image` — prevents null-ref on reload when placeholder renders before `containerRef` div.

## Fullscreen Preview (`components/FullscreenPreview.tsx`)

Lightweight fullscreen peek — press `f` or middle-click to view focused image edge-to-edge via Fullscreen API (`useFullscreen` hook). No route change, no metadata. Arrow keys traverse images via `useImageTraversal`, updating `focusedImageId`; exit (Esc/Backspace/f/middle-click) scrolls list to centered focused image. Shares prefetch pipeline and `usePinchZoom` (desktop zoom) with ImageDetail. Phantom pulse animation fires on exit when in phantom focus mode. Another density of the same ordered list.

## Image Metadata (`components/ImageMetadata.tsx`)

Single-image metadata display — used in ImageDetail sidebar and right side panel. Registry-driven field order. `showWhenEmpty: true` fields render `<Dash />` placeholder; `visibleWhen` gate applied. Section breaks on group change. Fields with `detailLayout: "stacked"` render label above value; others render inline (key 30% / value 70%). Click-to-search on values (shift = AND, alt = exclude). Location sub-parts as individual search links. List fields (keywords, subjects, people, labels) as `SearchPill` components. Rights section: cost badge, validity disclosure (red/amber/teal states), lease list with relative dates, restrictions banner. Phantom mode: single-selected image falls back to `metadataCache.get(singleSelectedId)` when buffer lookup misses.

## Multi-Image Metadata (`components/MultiImageMetadata.tsx`)

Shown in right panel when 2+ images selected. Dispatches per `multiSelectBehaviour` from field-registry. `metadata-primitives.tsx` shares `MetadataSection`, `MetadataRow`, `FieldValue`, `groupFieldsIntoSections`, `useMetadataSearch`, `Dash` between single and multi panels. `MultiValue.tsx` renders "Multiple {noun}" with tooltip showing top 5 values + counts. `MultiSearchPill` (in `SearchPill.tsx`) — partial (hollow) vs full (solid) chip state. Location sub-fields collapsed into one composite "Location" row. Cost summary section at top (bucket counts + leased-fraction gradient pills). Denominator for counts is `selectedIds.size`.

## Cost Badge (`components/CostBadge.tsx`)

5 cost variants (free/pay/conditional/overquota/no-rights), 3 sizes (sm/md/lg). CSS custom property colours from `index.css` cost colour tokens.

## Toast System (~350 lines: `stores/toast-store.ts`, `hooks/useToast.ts`, `components/ToastContainer.tsx`)

Queue-backed toast notifications. BBC PR #4253 vocabulary (`ToastCategory`, `ToastLifespan`). `addToast()` imperative export for non-React callers (selection-store hydration drop, range-cap warnings). Single `<ToastContainer />` mounted in `routes/__root.tsx`. `toast-store.ts` has `typeof window !== "undefined"` guard at top level (Vitest compatibility).

## Panels (`components/PanelLayout.tsx`)

Left (facet filters) / right (metadata). Resize handles, `[`/`]` keyboard shortcuts, `AccordionSection` with persisted state (via `panel-store`). Right panel: "Combined metadata…" placeholder for count=0; single-image metadata for count=1; `MultiImageMetadata` for count≥2. Phantom mode: single-selection falls back to `metadataCache` (not `focusedImageId`).

## Facet Filters (`components/FacetFilters.tsx`)

Left panel content. Batched aggregation fetch via store. Click → set CQL chip, alt-click → exclude. "Show more" expands per-field agg counts. Agg timing display (`AggTiming` component). `Is` section: all valid `is:` values from `buildIsOptions()` (config-gated); counts from `tickerCounts` store (ticker-backed values), category agg buckets (photo/illustration), or `isFilterCounts` store (deleted/under-quota). Zero-count entries hidden unless active or excluded. Coloured dot right of label for ticker-backed values (matching badge colour).

## Collection Tree (`components/CollectionTree.tsx`)

Left panel, above Facet Filters. Reads tree + subtree counts from `collection-store`. Click a node → injects `collection:pathId` into CQL query (exclusive — replaces any existing collection filter). Active node click is a no-op. Depth-0 expanded nodes are `position: sticky`. Expand state is local `useState<Set>`, collapsed by default, not persisted. Row click target is the full-height div (not the text span). Colour stripe from `node.data.cssColour`. Auto-sort handled atomically by `useUpdateSearchParams()` (not by this component). See `06-collections.md` for full architecture.

## Collection Store (`stores/collection-store.ts`)

Zustand + persist (sessionStorage). Loads tree from collections service + unfiltered ES agg at boot (`main.tsx`). `buildSubtreeCounts` uses pathId-splitting (not tree walk) to handle orphan subcollections. `buildColourMap` exported for grid cell badge colours. Graceful-absence: fetch failure → `status: 'absent'` → panel section hidden.

---

# UI Components — Scrubber & Sort

## Scrubber (`components/Scrubber.tsx`, 1,222 lines)

Vertical track, proportional thumb. Three modes, auto-selected by result count (see `03-scroll-architecture.md` §2):

| Mode | Total | Behaviour |
|---|---|---|
| **Scroll** | ≤1k | Real scrollbar — thumb tracks container scroll directly. All data in buffer. |
| **Indexed scroll** | 1k–65k | Real scrollbar — position map enables instant cursor lookup. Buffer slides via extends + scroll-triggered seeks. Skeleton cells fill outside the buffer. |
| **Seek** | >65k | Seek control — dragging shows tooltip, releasing triggers `seek()`. Deep seek via percentile estimation (date/numeric) or composite aggregation (keyword). |

Deep seek details: direction-aware `search_after` cursor anchors (`buildSeekCursorAnchors` in `search-store.ts` — desc fields get `MAX_SAFE_INTEGER`, asc get `0`, id gets `""`). Binary search refinement on the `id` tiebreaker when keyword bucket drift exceeds PAGE_SIZE. End key fast path: reverse `search_after` when target is within PAGE_SIZE of total, guaranteeing the buffer covers the last items. Null-zone seek uses the null-zone uploadTime distribution (fetched with `must_not:exists` filter for accuracy) for direct position→date mapping — no percentile needed, ~0.6% position accuracy. Sort-aware tooltip with adaptive date granularity. Keyword distribution binary search (O(log n), zero network during drag). Track tick marks with label decimation + hover animation; ticks are positioned by doc count (not time), so their spacing functions as a density map — dense clusters spread wide, sparse gaps compress. This is an explicit design choice: never linearise ticks by time. Null-zone UX: red boundary tick with vertical "No {field}" label (edge-clamped to track bounds), red-tinted uploadTime-based ticks in the null zone, italic "Uploaded: {date}" tooltip labels for null-zone positions. Seek cooldown (`SEEK_COOLDOWN_MS` at data arrival; deferred scroll timer `SEEK_DEFERRED_SCROLL_MS` fires after cooldown to trigger extends without causing swimming — see `tuning.ts`).

Scrubber also handles the all-null-zone edge case: `getDateDistribution` returns `{ buckets: [], coveredCount: 0 }` (not `null`) when `stats.count === 0`; `computeTrackTicksWithNullZone` emits boundary tick at `position: 0`; top-edge overflow clamp renders it correctly.

## Sort Context (`lib/sort-context.ts`, 1,038 lines)

Sort-aware label computation for the scrubber tooltip and track ticks. `SORT_LABEL_MAP` maps sort keys to image field accessors and display formatters (date, keyword, numeric). Adaptive date granularity: total span < 28 days → show time (d Mon H:mm); ≥ 28 days → d Mon yyyy; viewport > 28 days → Mon yyyy. Fixed-width `<span>` elements prevent tooltip jitter during drag. `interpolateNullZoneSortLabel` handles null-zone tooltip labels (italic "Uploaded: {date}"). `computeTrackTicksWithNullZone` builds tick arrays with null-zone boundary and red-tinted null ticks. O(log n) binary search on distributions — zero network during drag.

---

# Null-Zone System

## Null-Zone Seek for Sparse Sort Fields

When sorting by fields with many missing values (e.g. `lastModified`, `dateTaken`), scrubber seek correctly positions within the "null zone" (docs without the field). Uses filtered `search_after` (narrowed to missing-field docs, sorted by uploadTime fallback) + null-aware `countBefore`. Sort clause builder injects universal `uploadTime` fallback for meaningful null-zone ordering. Null-zone cursor detection is shared across seek, extendForward, extendBackward, scroll-mode fill, and buffer-around-image via `detectNullZoneCursor` + `remapNullZoneSortValues` helpers. **Critical invariant:** when a null-zone filter is active, `result.total` from ES is the filtered count (only null-zone docs), not the full corpus — all four write sites (`seek`, `extendForward`, `extendBackward`, `_fillBufferForScrollMode`) preserve `state.total` instead of overwriting with `result.total`.

## Null-Zone Scrubber UX

Visual feedback when the user enters the null zone: red boundary tick with vertical "No {field}" label (edge-clamped to track bounds), red-tinted uploadTime-based ticks, italic "Uploaded: {date}" tooltip. The boundary label uses a ref callback (`offsetHeight` measurement + pad) for overflow clamping. UX code split across `sort-context.ts` (`interpolateNullZoneSortLabel`, `computeTrackTicksWithNullZone`), `Scrubber.tsx` (rendering), `search.tsx` (wiring), `search-store.ts` (`fetchNullZoneDistribution`).

---

# Testing & Instrumentation

Test counts and surfaces: see `kupua/AGENTS.md` Testing Summary (single source of truth for numbers).

**Notable test strategies:** null-zone seek/extend with sparse `MockDataSource` (50k images, 20% coverage), reverse-compute edge cases (cold-start, sub-row, End key, buffer-shrink), selection reconciliation (chip-array, summary, mixed frequency, inflation bugs), cost/validity/graphic-blur. E2E: scrubber flash-prevention golden table with **0px scroll-drift tolerance**, **0 items CLS** settle-window, **rAF scrollTop monotonicity**, selections (desktop + mobile Pixel 5 emulation), browser history.

Full reference: `e2e/README.md` (8 test modes, decision tree, env vars). npm scripts: `test`, `test:e2e`, `test:e2e:full`, `test:smoke`, `test:perf`, `test:experiment`, `test:diag`.

## Perceived-Performance Instrumentation (`lib/perceived-trace.ts`)

Lightweight action-boundary tracer. **Zero production cost** — tree-shaken via `import.meta.env.DEV` guard. Off by default in dev; enabled via `localStorage.setItem("kupua_perceived_perf", "1")`. Playwright harness sets the flag before navigation.

Usage: `trace("sort-around-focus", "t_0", { sort, focusedId })` / `trace("sort-around-focus", "t_settled")`. Reading: `await page.evaluate(() => window.__perceivedTrace__)`. ~10 call sites across stores/hooks/components. Action names and phase conventions in `e2e-perf/README.md`.

**Logging:** use `devLog()` from `src/lib/dev-log.ts` (DCE'd in prod, readable in E2E via `KupuaHelpers.getConsoleLogs()`). Reserve bare `console.warn` for genuine error paths only.

