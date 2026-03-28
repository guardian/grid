# Kupua — Agent Context

> This file is read automatically by GitHub Copilot at the start of each session.
> It provides essential context about the kupua project so the agent can pick up where it left off.

> **Directives** live in `.github/copilot-instructions.md` (auto-loaded by Copilot).
> Human-readable copy: `exploration/docs/copilot-instructions-copy-for-humans.md`.
> The two files must stay identical — see the "Directive sync rule" inside them.

## What is Kupua?

Kupua is a **new React-based frontend** for [Grid](https://github.com/guardian/grid), the Guardian's image DAM (Digital Asset Management) system. It replaces the existing **kahuna** frontend (AngularJS 1.8).

Grid manages ~9 million images stored in S3, with metadata indexed in **Elasticsearch 8.x**. Kupua lives inside the Grid monorepo at `kupua/`.

## Running Kupua

Single entry point: `kupua/scripts/start.sh`. Two modes:

| Mode | Command | ES source | Needs AWS creds? | Needs sample data? |
|---|---|---|---|---|
| **Local** (default) | `./kupua/scripts/start.sh` | Docker ES on port 9220 | No | Yes — `exploration/mock/sample-data.ndjson` (115MB, not in git) |
| **TEST** | `./kupua/scripts/start.sh --use-TEST` | SSH tunnel to TEST ES on port 9200 | Yes (`media-service` profile) | No — index + S3 buckets discovered at runtime |

**Local mode** starts Docker ES, loads sample data via `scripts/load-sample-data.sh`,
and runs Vite. If `sample-data.ndjson` is missing, startup fails. To get the file you
need access to a Grid ES cluster (CODE/TEST) to extract it — so anyone running local
mode already has credentials and knows the project. There is no credential-free path
to meaningful local development (Grid image metadata is complex; synthetic data would
be misleading).

**`--use-TEST` mode** establishes an SSH tunnel, then auto-discovers the index alias
(via `_cat/aliases`), S3 bucket names (by fetching one document and parsing URLs),
and starts the S3 thumbnail proxy + imgproxy container. Nothing is hardcoded — all
infrastructure names are resolved at runtime.

**Relationship to Grid's scripts:** Grid has its own `dev/script/start.sh` which also
has a `--use-TEST` flag and SSH tunnel logic. Kupua's `start.sh` mirrors the same
patterns (credential check, tunnel establishment, kill-on-mode-switch) but is fully
independent — it manages kupua's own Docker containers (port 9220, imgproxy on 3002)
and never touches Grid's processes. The two scripts can coexist, but both compete for
port 9200 when tunnelling to TEST, so don't run both in `--use-TEST` mode simultaneously.

## Design Documents

| Doc | Path | Summary |
|---|---|---|
| Migration plan | `exploration/docs/migration-plan.md` | Phased plan (1–6), kahuna feature inventory, data model, architecture diagram |
| Frontend philosophy | `exploration/docs/frontend-philosophy.md` | Density continuum, "Never Lost", click-to-search, adjacency algorithm, discovery, prior art (Lightroom/Photos/Finder) |
| Deviations log | `exploration/docs/deviations.md` | Intentional departures from Grid/kahuna/library conventions — **update when adding a new deviation** |
| Performance analysis | `exploration/docs/performance-analysis.md` | 36 findings (fix-now/fix-later/watch), imgproxy benchmark, Lighthouse audit, scrubber prereqs |
| Grid view plan | `exploration/docs/grid-view-plan.md` | Kahuna grid analysis, architecture stress tests, design decisions |
| Kahuna scroll analysis | `exploration/docs/kahuna-scroll-analysis.md` | `gu-lazy-table`, sparse arrays, `from/size`, 100k cap. Lessons for `useDataWindow` |
| `search_after` plan | `exploration/docs/search-after-plan.md` | Windowed buffer, PIT, scrubber, sort-around-focus. 13-step plan, test checkpoints A–D |
| Scrubber nonlinear research | `exploration/docs/scrubber-nonlinear-research.md` | Power curve k=2 recommendation. Tried & rejected — revisit when scrubber is mature |
| Panels plan | `exploration/docs/panels-plan.md` | Left (filters + collections) / right (metadata), resize, keyboard, agg perf/safeguards |
| Metadata display plan | `exploration/docs/metadata-display-plan.md` | Kahuna `gr-image-metadata` analysis, field visibility, click-to-search, phased build |
| Changelog | `exploration/docs/changelog.md` | Blow-by-blow development history extracted from this file. Full detail on every feature, bug fix, and decision |
| Directives (human copy) | `exploration/docs/copilot-instructions-copy-for-humans.md` | Identical to `.github/copilot-instructions.md` — for humans and fresh clones |

## Current Phase: Phase 2 — Live Elasticsearch (Read-Only)

**Goal:** Connect kupua to real ES clusters (TEST/CODE) via SSH tunnel to validate against ~9M images. Still read-only, no auth, no Grid API. Phase 1 (local sample data) is complete.

### What's Done

> Full build-by-build history in `exploration/docs/changelog.md`.

**Infrastructure:** Docker ES 8.18.3 on port 9220, `start.sh` (local + `--use-TEST` modes), S3 thumbnail proxy, imgproxy (port 3002), sample data pipeline, mock Grid config.

**DAL:** `ImageDataSource` interface → `ElasticsearchDataSource` adapter. `searchAfter()` + PIT (primary pagination), `countBefore()`, `estimateSortValue()`, `findKeywordSortValue()`, batched `getAggregations()`. Write protection on non-local ES. `MockDataSource` for tests.

**State:** Zustand `search-store` with windowed buffer (max 1000, `bufferOffset`, cursor-based extend/evict/seek). `imagePositions: Map` maintained incrementally. Sort-around-focus ("Never Lost") via `_findAndFocusImage()`. PIT lifecycle, new-images ticker, aggregation cache + circuit breaker. `column-store` + `panel-store` (both localStorage-persisted).

**URL:** Single source of truth. `useUrlSearchSync` → store → search. Custom `URLSearchParams`-based serialisation (no `qss`). `resetSearchSync()` for forced re-search. `image` param is display-only. All search params Zod-validated.

**CQL:** `@guardian/cql` parser + custom CQL→ES translator. `<cql-input>` Web Component. `LazyTypeahead` for non-blocking suggestions. Supports structured queries (`credit:"Getty" -by:"Foo"`), `fileType:jpeg` → MIME, `is:GNM-owned`.

**Table view** (~1260 lines): TanStack Table + Virtual, column defs from `field-registry.ts` (21 hardcoded + config-driven alias fields). Column resize (auto-scroll at edges, CSS-variable widths, memoised body during drag), auto-fit (double-click header, `<canvas>` measurement), column visibility context menu, sort on header click (shift-click for secondary), sort aliases, auto-reveal hidden columns on sort. Click-to-search (shift/alt modifiers, AST-based polarity flip). Row focus (sticky ring highlight), double-click to open image detail. ARIA roles throughout. Horizontal + vertical scroll, scroll reset on new search.

**Grid view** (~520 lines): Responsive columns (`ResizeObserver`, `floor(width/280)`), row-based TanStack Virtual, S3 thumbnails, cell layout matching kahuna (303px height), rich tooltips, focus ring + grid-geometry keyboard nav, scroll anchoring on column count change, density-switch viewport preservation.

**Scrubber** (~560 lines): Vertical track, proportional thumb, click-to-seek, drag-to-seek (deferred to pointer up, linear). Deep seek via percentile estimation (date/numeric) or composite aggregation (keyword). Sort-aware tooltip (date/keyword context, live during drag). Keyboard (arrows, Shift+arrows for large step). Callback ref for ResizeObserver. Seek cooldown (500ms). Deferred scroll event for post-seek extends.

**Panels:** Left (facet filters + future collections) / right (focused-image metadata). Resize handles (double-click to close), `[`/`]` keyboard shortcuts. AccordionSection with persisted open/closed state. Facet filters: batched aggs, click/alt-click to add/exclude CQL chips, "Show more" per field (100-bucket request), scroll-anchored collapse. Right panel: shared `ImageMetadata.tsx`.

**Image detail:** Overlay within search route (`opacity-0` search page preserves scroll). `[x] of [total]` counter, prev/next with auto-load near edge, debounced prefetch (2+3), fullscreen survives between images. Standalone fetch for direct URLs. Offset cache in sessionStorage.

**Toolbar / Status bar / Filters:** Search bar (logo, CQL input, clear), filter controls (free-to-use, date range dropdown), sort dropdown + direction toggle. Status bar: result count (never replaced by loading), new-images ticker, ES timing, density toggle, panel toggles (tab-merge effect).

**Routing:** TanStack Router. `/search` (main), `/images/$imageId` (redirect), `/` → `/search?nonFree=true`. Image detail as same-route overlay, not separate route.

**Keyboard nav** (~327-line shared hook): Arrow/Page/Home/End, two-phase handling (bubble + capture), `f` for fullscreen, bounded placeholder skipping, prefetch near edge.

**Performance:** 36 findings documented. All 5 fix-now items done. Windowed buffer resolved memory/depth issues. Lighthouse: Perf 61 (dev), A11y 94, BP 96. Imgproxy benchmark confirms prefetch is correct mitigation.

**E2E tests:** 57 Playwright tests (all pass, none skipped). `run-e2e.sh` orchestrates Docker ES + data + cleanup. `KupuaHelpers` fixture class. 8 smoke tests for TEST cluster (manual-only, auto-skip on local). Console telemetry capture for algorithmic assertions.

### What's Next

- [ ] Column reordering via drag-and-drop (extend `column-store.ts` to persist order)

### Deferred to Later Phases
- [ ] **Non-linear scrubber drag** — explored and rejected for now (deviations.md §20, `scrubber-nonlinear-research.md`). Two approaches tried: (A) power-curve position mapping — thumb snaps back on release; (B) velocity-based delta accumulation — position races ahead of visual. Both failed. Current linear drag is correct for seeking; wheel/trackpad handles fine browsing. **Revisit when:** scrubber is fully bug-free AND E2E test coverage is comprehensive enough to catch any regression. The research doc (`scrubber-nonlinear-research.md`) contains full prior art survey, curve analysis, and implementation notes — don't re-derive from scratch.
- [ ] **Distribution-aware scrubber mapping** — different from pure-math nonlinear. Uses ES histogram bucket counts to warp the track so dense date regions get more pixels. Requires histogram aggregation data. Phase 6 work, independent of nonlinear drag.
- [ ] **Quicklook** — hold Cmd/Ctrl to show a large imgproxy preview over the hovered image in grid/table. Moving mouse (still holding) swaps to the hovered image. Release dismisses. Purely transient — no navigation, no state change. ~100-150 lines. Main concern is imgproxy latency (~456ms median); progressive JPEG XL may help long-term. Independent of panels, navigation paradigm, or any other feature.
- [ ] `is:GNM-owned` filter with real org config from Grid (currently recognized in CQL but not filtering)
- [ ] `GridApiDataSource` (Phase 3 — replaces ES adapter, adds auth, uses Grid media-api HATEOAS links)
- [ ] Row grouping (e.g. group by credit, source, date) — TanStack Table has built-in `getGroupedRowModel()` + `getExpandedRowModel()` with aggregation functions. Works client-side on loaded rows; for 9M-scale grouping would need server-side via ES composite/terms aggs with `manualGrouping: true`. Consider alongside facet filters.
- [ ] Discovery features beyond faceted filters — date histograms, geographic clustering, credit/source network visualisation, usage pattern analysis, visual similarity (knn on existing embedding vectors), trending/significant_terms. All read-only ES-native. Some depend on mapping enhancements (`mapping-enhancements.md`). See `frontend-philosophy.md` → "Discovery: Beyond Search".

## Tech Stack

| Concern | Choice |
|---|---|
| UI | React 19 with TypeScript |
| Table | TanStack Table v8 (headless, virtualised, column reorder/resize) |
| Virtual Scroll | TanStack Virtual |
| State | Zustand (lightweight, URL sync middleware) |
| Routing | TanStack Router (search params validated via Zod, pairs with TanStack ecosystem) |
| Styling | Tailwind CSS 4 (utility-first, no runtime overhead, dark mode, `@layer components` for shared classes) |
| Build | Vite 8 (Rolldown engine) |
| Data Layer | Abstracted `ImageDataSource` interface — currently `ElasticsearchDataSource` (local or remote via tunnel). `GridApiDataSource` deferred until auth/writes needed |
| Validation | Zod 4 |
| Testing | Vitest (co-located `*.test.ts` unit/integration tests) + Playwright (E2E in `e2e/`, `run-e2e.sh` orchestrates Docker ES + data + cleanup) |
| Dates | date-fns |

## Key Architecture Decisions

1. **Separate ES instance on port 9220** — kupua's `docker-compose.yml` is independent of Grid's. Container `kupua-elasticsearch`, cluster `kupua`, volume `kupua-es-data`. Grid's `dev/script/start.sh` won't affect it.

2. **Data Access Layer (DAL)** — TypeScript interface `ImageDataSource` with methods: `search()`, `count()`, `getById()`, `getAggregation()`, `searchAfter()`, `openPit()`, `closePit()`, `countBefore()`, `estimateSortValue()`, `findKeywordSortValue()`. Currently implemented by `ElasticsearchDataSource` (direct ES access via ~2,180 lines across 5 files: `es-adapter.ts`, `cql.ts`, `field-registry.ts`, `types.ts`, `es-config.ts`). `searchAfter()` is now the primary pagination method — used by `search()`, `extendForward`/`extendBackward`, and `seek()` in the store. Supports `reverse`, `noSource`, and `missingFirst` flags. `missingFirst` overrides `missing: "_first"` on the primary sort field — needed for reverse-seek-to-end on keyword fields where null-value docs sort last in both asc and desc (ES default). Deep seek uses two strategies: (A) for numeric/date fields, `estimateSortValue()` uses ES percentiles aggregation to estimate the sort value at position N; (B) for keyword fields (credit, source, etc.), `findKeywordSortValue()` uses composite aggregation with `BUCKET_SIZE=10000` (configurable via `VITE_KEYWORD_SEEK_BUCKET_SIZE`) to walk unique values accumulating doc_counts until the target position is reached. When composite exhausts (null/missing-value tail), returns `lastKeywordValue` instead of null. Has an 8s time cap. Structured telemetry logging enables E2E tests to assert algorithmic efficiency. When keyword seek lands far from target near the end, a reverse `search_after` with `missingFirst: true` fetches the true last page; `actualOffset = total - hits.length` (skipping `countBefore` which can't handle null sort values). Script sorts (dimensions) fall back to iterative `search_after` with `noSource: true` and reduced chunk sizes. Phase 3+ architecture: **dual-path** — keep direct ES for reads (fast, supports script sorts and custom aggregations), add `GridApiDataSource` for writes (metadata editing, crops, leases via media-api). Full migration surface analysis in deviations.md §16.

3. **Scripts in `kupua/scripts/`** (not `kupua/dev/scripts/`) — kupua is a self-contained app; no need for Grid's layered `dev/` hierarchy.

4. **sample-data.ndjson must NOT be committed to git** — too large (115MB). Kept locally or in S3.

5. **All views are one page** — table, grid, side-by-side, detail are density levels of the same ordered list. URL reflects full state. Browser back/forward restores position.

6. **Routes match kahuna exactly** — so existing bookmarks and shared URLs work when kupua replaces kahuna:
   - `/search?query=...` — main search route with all filter params
   - `/images/:imageId?crop=...&cropType=...`
   - `/images/:imageId/crop?cropType=...`
   - `/upload`
   - `/` → redirects to `/search?nonFree=true`

   **Complete `/search` URL params** (all optional):
   | Param | Type | Example | Notes |
   |---|---|---|---|
   | `query` | string | `credit:"Getty" -by:"Foo"` | Free-text / CQL query |
   | `ids` | string | `abc123,def456` | Comma-separated image IDs (from Share button) |
   | `since` | ISO date | `2026-03-19T10:54:29.221Z` | Upload time lower bound |
   | `until` | ISO date | | Upload time upper bound |
   | `nonFree` | `true` | `true` | Show paid images (omit = free only) |
   | `payType` | string | `free\|maybe-free\|pay\|all` | Pay type filter |
   | `uploadedBy` | string | `john.doe@guardian.co.uk` | Filter by uploader |
   | `orderBy` | string | `-taken`, `-uploadTime`, `oldest` | Sort order |
   | `useAISearch` | `true` | | Enable semantic/AI search |
   | `dateField` | string | | Which date field for range |
   | `takenSince` | ISO date | | Date taken lower bound |
   | `takenUntil` | ISO date | | Date taken upper bound |
   | `modifiedSince` | ISO date | | Last modified lower bound |
   | `modifiedUntil` | ISO date | | Last modified upper bound |
   | `hasRightsAcquired` | `true\|false` | | Syndication rights filter |
   | `hasCrops` | `true\|false` | | Has exports/crops |
   | `syndicationStatus` | string | | Syndication status filter |
   | `persisted` | `true\|false` | | Is archived or has usages |
   | `expandPinboard` | string | | Pinboard integration (passthrough) |
   | `pinboardId` | string | | Pinboard integration (passthrough) |
   | `pinboardItemId` | string | | Pinboard integration (passthrough) |
   | `image` | string | `abc123` | Image detail overlay (display-only, not synced to search store) |
   | `density` | `table` | | View density — absent=grid (default), `table`=data table (display-only) |

   **Key mapping**: `nonFree=true` → API `free=undefined`; `hasCrops` → API `hasExports`

   Selections are NOT in URL (matching kahuna — only `ids=` from Share button).

7. **Column config in localStorage** (not URL) — visibility and widths are persisted per-client via `useColumnStore` with zustand/persist. Key: `kupua-column-config`. Column IDs use TanStack Table's format (dots→underscores). The store also holds session-only `preDoubleClickWidths` (excluded from localStorage persistence via `partialize`) for the double-click fit/restore toggle. Order and sorting will be added when needed.

8. **Scrollbar strategy** — Now uses a **windowed buffer architecture**: fixed-capacity buffer (max 1000 entries) with `bufferOffset` mapping buffer[0] to a global position. `search_after` with PIT provides cursor-based pagination. `extendForward`/`extendBackward` append/prepend pages as the viewport approaches buffer edges; eviction keeps memory bounded. `seek()` repositions the buffer anywhere in the result set: shallow offsets (<10k) use `from/size`, deep offsets (≥10k) use **percentile estimation** on the primary sort field + `search_after` + `countBefore` for exact offset — no depth limit, ~20-70ms regardless of position (vs 500-2500ms for `from/size` at 50-100k). The `estimateSortValue()` DAL method runs a single ES percentiles aggregation. **Native scrollbar hidden** (`hide-scrollbar` CSS class) — the custom **Scrubber** (`Scrubber.tsx`) is the sole visible scrollbar. Always rendered (even for small result sets). Two modes: **scroll mode** (total ≤ buffer, all data loaded — scrubber scrolls the content container directly) and **seek mode** (total > buffer — scrubber triggers seek to reposition the buffer). Vertical track on the right edge, proportional thumb, click-to-seek/scroll, drag-to-seek/scroll with 200ms debounce in seek mode, keyboard accessible, position tooltip on active interaction. Thumb position uses direct DOM manipulation via ref for 60fps tracking during drag. `pendingSeekPosRef` (a plain ref, not state) holds the user's intended position during async seek — blocks the DOM sync effect from snapping the thumb back until the seek completes; cleared when `currentPosition` changes, `loading` transitions true→false, or `total` changes. Track height measured via **callback ref** + ResizeObserver (not `useEffect([], [])`) because the component returns null when `total ≤ 0` — a mount-time effect would miss the DOM element. Seek abort: aborted seeks do NOT set `loading: false` (the newer seek/search owns loading state); `countBefore` accepts an abort signal; `signal.aborted` guard before `countBefore` call. Seek cooldown (500ms, set synchronously at seek start, NOT refreshed at data arrival) suppresses extend cascades during the fetch. Views dispatch a deferred scroll event 600ms after seek lands to trigger extends once cooldown expires. Logo click explicitly calls `store.search()` to reset the buffer even when URL params haven't changed. `imagePositions: Map<imageId, globalIndex>` maintained incrementally, cleaned on eviction. PIT opened on non-local ES for consistent pagination; local ES skips PIT (stable 10k dataset). Old `loadMore`/`loadRange` kept as deprecated aliases during migration. Previous approach (sparse array + `from/size` + `frozenUntil`) replaced. Kahuna analysis in `kahuna-scroll-analysis.md`. Full design in `search-after-plan.md`.

9. **Local dev domain** — currently `localhost:3000`. Future: add `kupua.media.local.dev-gutools.co.uk` to `dev/nginx-mappings.yml` pointing to port 3000. Trivial change when needed.

10. **URL is single source of truth for search state** — user interactions update the URL via `useUpdateSearchParams`, which triggers `useUrlSearchSync` to push params to the Zustand store and fire a search. When clearing params (e.g. clearing the search box), all URL-managed keys are explicitly reset to `undefined` before applying URL values, so removed params don't survive in the store via spread. `resetSearchSync()` clears the dedup state so a "reset everything" action (logo click) always triggers a fresh search, even when the URL params haven't actually changed (e.g. logo clicked while already at `?nonFree=true`).

11. **Sort system** — `orderBy` URL param supports comma-separated values for multi-sort (e.g. `-uploadTime,-metadata.credit`). The ES adapter's `buildSortClause` expands aliases per-part (e.g. `taken` → `metadata.dateTaken,-uploadTime`). Column headers, sort dropdown, and URL all use the same sort keys. Secondary sort is managed via shift-click.

12. **TanStack Table column ID gotcha** — when using dot-path accessors (e.g. `"metadata.credit"`), TanStack Table auto-generates column IDs with dots replaced by underscores (`"metadata_credit"`). Any map keyed by column ID must use underscores. This bit us once already.

13. **Custom URL parse/stringify (not `parseSearchWith`)** — TanStack Router's built-in `parseSearchWith` delegates to `qss.decode` which calls `toValue()`, converting `"true"` → boolean `true` and `"123"` → number `123`. Our Zod schema expects all values as strings, so booleans/numbers silently fall through `.catch(undefined)` and are lost. We use fully custom `plainParseSearch`/`plainStringifySearch` based on `URLSearchParams` directly, keeping all values as plain strings. This also avoids `JSON.stringify` wrapping strings in quotes (`%22true%22`). Stale quoted values from old bookmarks are stripped.

14. **CQL chips via `@guardian/cql` Web Component** — The `<cql-input>` custom element (from `@guardian/cql`) handles all chip rendering, editing, keyboard navigation, and typeahead. It is registered once globally in `CqlSearchInput.tsx`. The typeahead fields are built from the DAL via `typeahead-fields.ts` with resolvers that query local ES aggregations on keyword fields. When the DAL switches to the Grid API, the resolvers will automatically use live API endpoints with no UI changes needed.

15. **Mock config for Phase 1** — `kupua/exploration/mock/grid-config.conf` is a sanitised copy of PROD Grid config. `src/lib/grid-config.ts` parses it for field aliases and category lists. This avoids hardcoding and will be replaced by live config fetching in Phase 3.

16. **Start script** — `kupua/scripts/start.sh` is the single entry point for local development. It orchestrates ES startup, data loading, npm install, and Vite dev server. Flags allow skipping steps for faster restarts. Validates prerequisites before starting: Node version (Vite 8 requires `^20.19.0 || >=22.12.0`), Docker running, port availability (3000 for Vite, 9220 for ES — uses `lsof -sTCP:LISTEN` to avoid false positives from client connections).

17. **`@/*` path alias** — `@/components/Foo` resolves to `src/components/Foo`. Configured in both `tsconfig.json` (`paths`) and `vite.config.ts` (`resolve.alias`). All imports use this alias.

18. **`App.tsx` deleted** — was dead code after layout moved to `routes/__root.tsx`. Removed during codebase audit.

19. **Font standardisation** — `--font-sans` is overridden in `@theme` to `'Open Sans', ui-sans-serif, system-ui, sans-serif`. This is the Tailwind 4 convention: all elements inherit from `--font-sans` via the base layer, so new elements get Open Sans automatically. Three-tier font scale: `text-sm` (14px, Tailwind default) for UI chrome, `text-xs` (13px via `--text-xs: 0.8125rem` override) for data content, `text-2xs` (12px via custom `--text-2xs: 0.75rem` token) for dimmed secondary text like grid cell dates. 13px for CQL input (Web Component theme). Prefer standardised sizes over arbitrary one-off values (`text-[11px]` etc.) — if a new size is genuinely needed, add a theme token rather than scattering magic numbers.

20. **Shared popup styling via CSS component classes** — `popup-menu` and `popup-item` are defined in `index.css` `@layer components`. All dropdowns and context menus use these classes for consistent appearance (`bg-grid-panel`, `border-grid-border`, `rounded shadow-lg`, hover highlight). New menus inherit the look automatically.

21. **Auto-reveal hidden columns on sort** — when the user sorts by a column that's currently hidden, the column is automatically shown via `toggleVisibility()` (same store action as the context menu), so it persists as a normal user choice. The user can hide it again anytime. Generic — works for any sortable column, not just specific ones.

22. **Fullscreen survives between images** — the Fullscreen API exits fullscreen when the fullscreened element is removed from the DOM. Image detail is rendered as an overlay within the search route (not a separate route), and React reconciles the same `ImageDetail` component when only the `image` prop changes, so the fullscreened `<div ref>` stays in the DOM and fullscreen persists. This is the architectural reason why image detail uses a prop — not a route param. `Escape` only exits fullscreen (never navigates or closes image detail).

23. **Image detail is an overlay, not a separate route** — the image detail view renders within the search route when `image` is present in URL search params (`?image=abc123&nonFree=true&query=...`). The search page stays mounted and fully laid out (`opacity-0 pointer-events-none`, NOT `display:none` — because `display:none` resets `scrollTop` to 0). Scroll position, virtualizer state, and search context are all preserved. Browser back removes `image` from params — the table reappears at the exact scroll position with no re-search. `image` is a display-only URL param: it's excluded from store sync and ES queries via `URL_DISPLAY_KEYS`. Prev/next replaces `image` (so back always returns to the table, not through every viewed image). If the user navigated to a different image via prev/next, the focused row is centered in the viewport on return. `/images/:imageId` redirects to `/search?image=...&nonFree=true` for backward compat. URL param ordering controlled by `URL_PARAM_PRIORITY` — `image` appears first, matching Grid URL style.

24. **"Never Lost" context preservation** — Focus, selection, edit state, and scroll position survive every density/view change (table → grid → single image and back). Views are density levels of the same list, not separate pages. When search context changes and the focused item leaves the result set, kupua snaps focus to the **most adjacent surviving item** from the previous result set (nearest neighbour scan, alternating forward/backward), rather than resetting to the top. Selections that survive the new results are kept; missing ones are silently dropped. Edit state on a displaced image is preserved with a subtle "not in current results" indicator. Full algorithm and rationale in `frontend-philosophy.md` → "Context is Sacred".

25. **Actions written once, context-adaptive** — Action buttons (Crop, Delete, Download, Archive, Share, Add to Collection, Set Rights, etc.) are each implemented as a single component that accepts an `images` array. An `ActionBar` component derives `targetImages` from current state (focused image, selection, or current detail image) and renders all actions. Labels, enabled state, and confirmation dialogs adapt to the image count — but core logic is identical regardless of which view density the user is in. Kahuna already uses `images` arrays for its action components; kupua formalises this into one `ActionBar` mounted in a stable toolbar position, never duplicated per view. See `frontend-philosophy.md` → "Actions are Written Once".

26. **Field Definition Registry** — `src/lib/field-registry.ts` is the single source of truth for every image field kupua can display, search, sort, or aggregate. Each `FieldDefinition` captures: identity (id, label, group), data access (accessor, rawValue), search (cqlKey, esSearchPath), sort (sortKey, descByDefault), display (defaultWidth, defaultHidden, formatter, cellRenderer), and type metadata (fieldType, isList, isComposite, editable, aggregatable). Config-driven alias fields from `grid-config.ts` are merged in automatically. Consumers (`ImageTable`, `SearchFilters.Sort`, `column-store`, future MetadataPanel/grid view) import derived maps (`COLUMN_CQL_KEYS`, `SORTABLE_FIELDS`, `DESC_BY_DEFAULT`, `DEFAULT_HIDDEN_COLUMNS`, `SORT_DROPDOWN_OPTIONS`) and helper functions (`getFieldRawValue`, `getFieldDisplayValue`) — they never hardcode field knowledge. ImageTable generates TanStack column defs from the registry via `fieldToColumnDef()`. **Coupling note:** `fieldType` and `aggregatable` restate the ES mapping — if the mapping changes (e.g. mapping-enhancements.md §2a), these must be updated. When facet filters are built, consider dynamic introspection via `_mapping` at startup instead.

27. **Panels — always-in-flow, no overlay mode** — Two panel zones (left, right) flanking the main content in a flex row. Panels are either visible (in the layout flow, pushing content) or hidden. No kahuna-style overlay/locked distinction, no auto-hide-on-scroll. Resizable via drag handles, width persisted to localStorage. Accordion sections within each panel. Left: Filters + Collections (Phase 4). Right: shared Metadata component (same as image detail). Keyboard: `[` left, `]` right. Panel state in localStorage (not URL — it's user preference, not search context). Facet aggregations are lazy: fetched only when the Filters section is expanded, debounced separately (500ms), cached per query, with a circuit breaker if response exceeds 2s. Section open/closed state persisted to localStorage — most users keep Filters collapsed (no ES agg load); power users who expand Filters self-select into the agg cost. Full plan: `panels-plan.md`. Deviation from kahuna: see `deviations.md` when implemented.

28. **Grid view scroll anchoring on width change** — When `ImageGrid.tsx`'s container width changes (from any cause: panel toggle, panel resize, browser window resize) and the column count changes, the focused (or viewport-centre) image's viewport ratio is captured before the change and restored in a `useLayoutEffect` after React re-renders. No visible jump. Table view doesn't need this — its vertical layout is width-independent. This is a generic `ResizeObserver` improvement, not panel-specific. Same algorithm concept as `density-focus.ts` (density switches) but within the same component lifecycle rather than across unmount→remount.

29. **CSS containment on scroll containers** — `hide-scrollbar` class includes `contain: strict` (= size + layout + paint + style). Critical for Firefox scroll performance: without it, Gecko recalculates full-page layout whenever virtualizer items reposition during scroll. The element's size comes from the flex parent (not content), so `contain: size` is safe. Learned from Immich (`#asset-grid { contain: strict; scrollbar-width: none; }`). Google Photos uses the same pattern. Both only show a virtual scrubber — no native scrollbar — matching kupua's approach.

## Project Structure

```
kupua/
  docker-compose.yml          # Standalone ES on port 9220
  index.html                   # SPA entry HTML
  package.json                 # Dependencies and scripts
  vite.config.ts               # Vite config with /es proxy to ES:9220, @ alias
  tsconfig.json                # TypeScript config, @ path alias
  .gitignore                   # Ignores sample-data.ndjson, node_modules, dist
  AGENTS.md                    # This file — agent context
  README.md                    # Setup instructions, project structure
  public/
    fonts/                     # Open Sans woff2 files (copied from kahuna) + OFL license
    images/
      grid-logo.svg            # Grid 3×3 logo
      grid-favicon.svg         # Grid favicon
  exploration/
    mock/
      mapping.json             # ES mapping from CODE
      sample-data.ndjson       # 10k docs sample data (NOT in git)
      grid-config.conf         # Sanitised copy of PROD Grid config (aliases, categories)
    docs/
      migration-plan.md        # Full phased migration plan
      frontend-philosophy.md   # UX/UI philosophy: density continuum, interaction patterns, comparisons
      grid-view-plan.md        # Grid view plan: kahuna analysis, architecture stress tests, design decisions
      kahuna-scroll-analysis.md # Deep read of kahuna's gu-lazy-table: sparse array, from/size, 100k cap. Lessons for kupua.
      deviations.md            # Intentional differences from Grid/kahuna + library convention bends
      performance-analysis.md  # Performance: 36 findings, action plan, imgproxy bench, scrubber prereqs, Lighthouse audit
      infra-safeguards.md            # Elasticsearch + S3 safety documentation
      kupua-audit-assessment.md # Codebase audit: architecture grades, cleanup opportunities, documentation accuracy
      s3-proxy.md              # S3 thumbnail proxy documentation (temporary)
      imgproxy-research.md     # Research: how eelpie fork replaced nginx imgops with imgproxy
      mapping-enhancements.md  # Proposed ES mapping improvements
      panels-plan.md           # Panels design + implementation plan: layout, facet filters, scroll anchoring, kahuna reference
      search-after-plan.md     # search_after + windowed scroll: analysis, architecture, 13-step implementation plan (~25-35h)
      scrubber-nonlinear-research.md # Non-linear drag mapping: prior art, curve analysis, gotchas, recommendation (power curve k=2)
      copilot-instructions-copy-for-humans.md # Human-readable copy of directives (identical to .github/copilot-instructions.md)
  scripts:
    start.sh                   # One-command startup (ES + data + deps + S3 proxy + imgproxy + dev server)
    run-e2e.sh                 # E2E test orchestration (Docker ES + data check + stale-process cleanup + Playwright)
    run-smoke.mjs              # Interactive runner for manual smoke tests. Lists tests, prompts for selection, runs headed. MANUAL ONLY.
    load-sample-data.sh        # Index creation + bulk load
    s3-proxy.mjs               # Local S3 thumbnail proxy (uses dev AWS creds, temporary)
  src/                         # ~11,180 lines total
    main.tsx                   # React entry point — mounts RouterProvider
    router.ts                  # TanStack Router setup — custom plain-string URL serialisation
    index.css                  # Tailwind CSS import + Open Sans font + Grid colour theme + shared component classes (popup-menu, popup-item)
    routes/
      __root.tsx               # Root route — minimal shell (bg + flex column), no header
      index.tsx                # Index route — redirects `/` → `/search?nonFree=true`
      search.tsx               # Search route — validates URL search params via Zod, renders search page + ImageDetail overlay when image param present
      image.tsx                # Image redirect — `/images/$imageId` → `/search?image=...&nonFree=true`
    lib/
      cql.ts                   # CQL parser + CQL→ES query translator (451 lines)
      field-registry.ts        # Field Definition Registry — single source of truth for all image fields (615 lines)
      field-registry.test.ts   # Registry tests: derived maps match old hardcoded values, accessors, formatters (34 tests)
      grid-config.ts           # Mock Grid config parser (field aliases, org-owned categories)
      lazy-typeahead.ts        # LazyTypeahead — deferred value resolution for CQL typeahead (212 lines)
      search-params-schema.ts  # Zod schema for URL search params — single source of truth
      density-focus.ts         # Transient bridge for viewport-position preservation across density switches (5 lines)
      scroll-reset.ts          # Shared helper — resets scroll position on result containers + focuses CQL input. Used by SearchBar + ImageDetail logo clicks.
      keyboard-shortcuts.ts    # Centralised keyboard shortcut registry — single document listener, Alt+key in editable fields, stack semantics. shortcutTooltip helper.
      sort-context.ts          # Sort-context label utility — maps orderBy + Image → display label (date/keyword) for scrubber tooltip
      image-urls.ts            # Image URL builders — thumbnails via S3 proxy, full images via imgproxy
      image-offset-cache.ts    # sessionStorage cache for image offset in search results — survives page reload
      typeahead-fields.ts      # Builds typeahead field definitions for CQL input from DAL (251 lines)
    dal/
      types.ts                 # ImageDataSource interface + SearchParams + SortValues + BufferEntry + SearchAfterResult + AggregationRequest/AggregationsResult + estimateSortValue types (~245 lines)
      es-adapter.ts            # Elasticsearch implementation (~760 lines — sort aliases, CQL translation, free-to-use filter, batched aggregations, search_after, PIT lifecycle, countBefore, estimateSortValue, tiebreaker sort)
      es-adapter.test.ts       # Unit tests for buildSortClause tiebreaker behaviour (10 tests)
      mock-data-source.ts      # MockDataSource — deterministic mock for testing, generates img-{index} with linear dates (~210 lines)
      es-config.ts             # ES connection config — URL, index, source excludes, allowed paths (_search, _count, _cat/aliases, _pit), local flag
      index.ts                 # Barrel export
    components/
      CqlSearchInput.tsx       # React wrapper around @guardian/cql <cql-input> Web Component (227 lines)
      DateFilter.tsx           # Date range filter dropdown (486 lines)
      ErrorBoundary.tsx        # React error boundary — catches render crashes, shows recovery UI
      ErrorBoundary.test.tsx   # 2 tests: renders children, catches errors
      ImageDetail.tsx          # Single-image view: overlay within search route, fullscreen (black, no UI), prev/next navigation. Uses shared ImageMetadata for sidebar.
      ImageMetadata.tsx        # Shared metadata display (~350 lines) — renders <dl> with section dividers (MetadataSection groups with border-bottom). Clickable values have persistent underlines. Sections: core, credits, location, dates, technical, tags, identity. Empty sections auto-hide. Not shared with table renderers (different layout/interaction models). Used by ImageDetail sidebar and right side panel.
      SearchPill.tsx           # Shared pill component for list field values. SearchPill (direct callback, metadata panel) + DataSearchPill (data-attr delegation, table cells). Click-to-search with Shift/Alt modifiers.
      StatusBar.tsx            # Status bar: count + new images ticker + response time + density toggle (table/grid)
      SearchBar.tsx            # Single-row toolbar: logo + CQL search input + clear button (123 lines)
      SearchFilters.tsx        # Compound component: FilterControls (free-to-use, dates) + SortControls (custom dropdown + direction toggle) (185 lines)
      ColumnContextMenu.tsx    # Column header context menu — visibility toggles, fit-to-data (178 lines). Imperative ref handle, self-contained positioning.
      FacetFilters.tsx          # Facet filter panel content (~275 lines) — aggregatable fields, value lists with compact counts, click adds/removes CQL chips, Alt+click excludes, "Show more" per field (separate single-field 100-bucket request), scroll-anchored "Show fewer"
      PanelLayout.tsx          # Panel system: flex row of [left?] [main] [right?], resize handles (double-click to close), keyboard shortcuts [`/`] (Alt+key in editable fields via keyboard-shortcuts.ts), AccordionSection component (~220 lines)
      ImageTable.tsx           # TanStack Table + Virtual, all table features (~1260 lines — column defs generated from field-registry.ts). Uses useDataWindow for data/pagination.
      ImageGrid.tsx            # Thumbnail grid density (~520 lines). Responsive columns via ResizeObserver, row-based TanStack Virtual, S3 thumbnails, rich tooltips, grid-geometry keyboard nav. Scroll anchoring on column count change. Same useDataWindow as table.
      Scrubber.tsx             # Global position scrubber — vertical track on right edge of content area. Proportional thumb, click-to-seek, drag-to-seek (deferred to pointer up), keyboard accessible (arrows + Shift+arrows for large step). Sort-aware tooltip with date/keyword context. Auto-hide after 2s inactivity, fade in on scroll/hover. Hidden when total ≤ 0. Callback ref for ResizeObserver + wheel event. pendingSeekPosRef for async seek position hold. (~560 lines)
    stores/
      search-store.ts          # Zustand store — windowed buffer (search, extendForward/Backward via reverse search_after, seek, eviction, PIT lifecycle), search params, imagePositions, sort-around-focus (async find-and-seek after sort change), aggregations + fetchAggregations with cache/debounce/circuit-breaker, expandedAggs + fetchExpandedAgg for per-field "show more". View components access data via useDataWindow hook, not directly. (~1020 lines)
      search-store.test.ts     # Integration tests with MockDataSource (34 tests): search, seek, extend, eviction, imagePositions consistency, sort-around-focus lifecycle, density-switch ratio, sort-context label interpolation
      column-store.ts          # Zustand store + localStorage persist (column visibility, widths, pre-double-click widths) (~109 lines)
      panel-store.ts           # Zustand store + localStorage persist (panel visibility, widths, section open/closed) (~140 lines)
    types/
      image.ts                 # Image document types from ES mapping
  e2e/
    global-setup.ts            # Playwright global setup — verifies ES health + sample data before tests run (fail-fast)
    helpers.ts                 # Playwright test fixtures + KupuaHelpers class (scrubber interaction, store state access, sort/density helpers)
    scrubber.spec.ts           # E2E tests: scrubber seek/drag, scroll position after seek, density switch preservation, sort change, sort-around-focus, keyboard nav, full workflows
    manual-smoke-test.spec.ts  # Smoke tests against real ES (TEST cluster). MANUAL ONLY — agent must never run. Auto-skips on local ES (total < 100k). Run via: node scripts/run-smoke.mjs
    tsconfig.json              # TypeScript config for e2e directory (ES2022, bundler resolution)
    hooks/
      useDataWindow.ts       # Data window hook — shared interface between search store and view components (table, grid, detail). Buffer-aware: exposes bufferOffset, reportVisibleRange (triggers extend at edges), seek, getImage (buffer-local), findImageIndex (global→local translation). Exports useVisibleRange() via useSyncExternalStore for Scrubber position tracking. Virtualizer count = buffer length. (~215 lines).
      useListNavigation.ts   # Shared keyboard navigation hook — moveFocus, pageFocus, home, end. Parameterised by geometry (columnsPerRow, flatIndexToRow). Used by ImageTable and ImageGrid (327 lines).
      useUrlSearchSync.ts      # URL↔store sync: useUrlSearchSync (URL→store→search) + useUpdateSearchParams (component→URL)
      useFullscreen.ts         # Fullscreen API wrapper — toggle/enter/exit fullscreen on a stable DOM element
      useKeyboardShortcut.ts   # React hook wrapping keyboard-shortcuts.ts — auto-register on mount, unregister on unmount, ref-stable action
```

## Kahuna Reference

The existing frontend lives at `kahuna/`. Key files to understand:
- `kahuna/public/js/main.js` — AngularJS app bootstrap, routing, config
- `kahuna/public/js/search/results.js` — search results controller (875 lines)
- `kahuna/public/js/search/index.js` — routing config for search states
- `kahuna/public/js/image/controller.js` — single image view (338 lines)
- `kahuna/public/js/services/api/media-api.js` — API client (search, find, session, etc.)
- `kahuna/public/js/services/image-accessor.js` — helpers to read image resource data
- `kahuna/public/js/components/gu-lazy-table/` — virtual scroll grid component
- `kahuna/public/js/edits/service.js` — metadata editing service
- `kahuna/public/js/services/api/collections-api.js` — collections CRUD

## ES Index Details

- **Index name:** `images` (locally); CODE source was `<es-index-name>`
- **Key searchable fields:** `metadata.englishAnalysedCatchAll` (catch-all text), `metadata.credit` (keyword), `metadata.source` (keyword), `metadata.keywords` (keyword array), `uploadedBy` (keyword)
- **Sort fields:** `uploadTime` (date), `lastModified` (date), `metadata.dateTaken` (date), `metadata.credit` (keyword), `metadata.source` (keyword), `uploadedBy` (keyword), `source.dimensions.width` (integer), `source.dimensions.height` (integer), `source.mimeType` (keyword), `usageRights.category` (keyword), `collections.actionData.date` (date). Text fields (`metadata.title`, `metadata.description`, `metadata.byline`) are NOT sortable (no `.keyword` sub-field).
- **Custom analyzers:** `english_s_stemmer` (minimal English stemmer), `hierarchyAnalyzer` (path_hierarchy tokenizer for collection paths)
- **Embeddings:** `embedding.cohereEmbedEnglishV3.image` — 1024-dim dense vector, cosine similarity, int8_hnsw index

