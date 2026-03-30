# Kupua Development Changelog

> Detailed development history extracted from AGENTS.md. This is the blow-by-blow
> record of what was built, how bugs were found and fixed, and the reasoning behind
> implementation choices. Useful for archaeology; not needed for day-to-day agent work.
>
> For current capabilities and architecture, see `kupua/AGENTS.md`.

## Phase 2 — Live Elasticsearch (Read-Only)

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
- ✅ Image detail offset cache — `sessionStorage` cache for image offset + search fingerprint. Survives page reload.
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

### Rendering Performance Experiments (29 Mar 2026)

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

### E2E Tests (64 tests, all passing)

- `scripts/run-e2e.sh` orchestrates Docker ES + data + Playwright
- `e2e/global-setup.ts` auto-starts Docker ES, verifies data
- `KupuaHelpers` fixture class: `seekTo()`, `dragScrubberTo()`, `assertPositionsConsistent()`, `getStoreState()`, `startConsoleCapture()`, etc.
- 10 smoke tests for TEST cluster (`manual-smoke-test.spec.ts`) — S1–S5, S9–S10 pass as of 2026-03-29. Auto-skip on local ES.
- Coverage: ARIA, seek accuracy, drag, scroll, buffer extension, density switch, sort change, sort tooltip, sort-around-focus, keyboard, metadata panel, 3 full workflows, bug regressions (#1, #3, #7, #9, #11–15, #18)

### List Scroll Smoothness — Tried and Reverted

Goal: make table view feel as smooth as grid. Tried: page size 50→100, throttle, overscan 100. No improvement, introduced hover-colour regression. Reverted. Bottleneck may be React reconciliation or placeholder flash — needs profiling.

### Scrubber Scroll Mode — Bug Fixes and Buffer Fill (2026-03-28)

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
  1001+ results, it never activated. A user with 700 results could grab the
  scrubber and nothing would happen.

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

### Scrubber Visual Polish — Unified Scrollbar Look (2026-03-28)

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

### Bug E — Scrubber Desync at Top/Bottom (2026-03-28)

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

### 2026-03-29 — Scrubber tooltip fixes and keyword distribution

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

### 2026-03-29 — Bug #18: Keyword sort seek drift + PIT race + binary search refinement

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

### Width/Height replace Dimensions script sort (2026-03-29)

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

### Field Registry Canonical Ordering + Registry-Driven Details Panel + Horizontal Scrollbar Fix (29 Mar 2026)

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

### Scrubber tick visual polish + isolation-based promotion (29 Mar 2026)

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

### Width/Height sort tooltip fix — distribution-based labels (29 Mar 2026)

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

### Removed Filename sort (29 Mar 2026)

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

### Bug #18 — Scrubber thumb stuck at top in scroll mode after density switch (30 Mar 2026)

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

### Colour token consolidation — grid-panel → grid-bg/grid-cell (30 Mar 2026)

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

### Escape to blur search box (30 Mar 2026)

Pressing Escape in the CQL search input now blurs the search box (removing
focus), but only when the CQL typeahead popup is not visible. When suggestions
are showing, CQL's internal handler dismisses the popup — we don't interfere.
Uses capture phase on keydown to check `data-isvisible` before CQL flips it.

**Files changed:** `CqlSearchInput.tsx`.

### Grid cell gap increased 4→8px (30 Mar 2026)

Slightly more breathing room between grid view image cells. Matches kahuna's
visual density more closely.

**Files changed:** `ImageGrid.tsx` (`CELL_GAP` constant).

### Density-focus saves localIndex (30 Mar 2026)

`saveFocusRatio` now stores the buffer-local index alongside the viewport ratio.
This prevents a stale lookup when `imagePositions` evicts the focused image between
the unmount click and the new density's mount (async extend can complete in between).
Both `ImageGrid` and `ImageTable` updated to save/consume the new shape.

**Files changed:** `density-focus.ts`, `density-focus.test.ts`, `ImageGrid.tsx`,
`ImageTable.tsx`.

### Native input guard for keyboard navigation (30 Mar 2026)

`useListNavigation` now checks `isNativeInputTarget()` and bails out when focus
is inside a native `<input>`, `<textarea>`, or `<select>` (e.g. the date filter's
`<input type="date">`). Previously, arrow keys inside the date picker would also
move the grid/table focus. The CQL custom element is deliberately excluded from
this guard — it already lets navigation keys propagate by design.

**Files changed:** `keyboard-shortcuts.ts` (new `isNativeInputTarget` export),
`useListNavigation.ts` (guard added to bubble handler).

### Browser theme-color meta tag (30 Mar 2026)

Added `<meta name="theme-color" content="#333333">` to `index.html` to tint the
browser tab bar / status bar on Chrome (desktop + Android), Safari 15+ (iOS + macOS),
and Edge. Firefox ignores it — harmless. Matches `--color-grid-bg`.

**Files changed:** `index.html`.

