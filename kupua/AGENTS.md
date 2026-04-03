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

**Local mode** starts Docker ES, loads sample data, runs Vite. **`--use-TEST` mode** establishes an SSH tunnel, auto-discovers index alias + S3 buckets, starts S3 proxy + imgproxy. Both modes are fully independent of Grid's own `dev/script/start.sh`.

## Design Documents

| Doc | Path | Summary |
|---|---|---|
| Migration plan | `exploration/docs/migration-plan.md` | Phased plan (1–6), kahuna feature inventory, data model |
| Frontend philosophy | `exploration/docs/frontend-philosophy.md` | Density continuum, "Never Lost", click-to-search, discovery |
| Deviations log | `exploration/docs/deviations.md` | Intentional departures from Grid/kahuna — **update when adding a new deviation** |
| Image optimisation | `exploration/docs/image-optimisation-research.md` | AVIF selected (q63/s8). Format analysis, encode benchmarks, DPR-aware sizing |
| Performance analysis | `exploration/docs/performance-analysis.md` | 36 findings, action plan, imgproxy bench, Lighthouse audit |
| `search_after` plan | `exploration/docs/search-after-plan.md` | Windowed buffer, PIT, scrubber, sort-around-focus. 13-step plan |
| Scrubber dual-mode | `exploration/docs/scrubber-dual-mode-ideation.md` | Scroll mode vs seek mode, tooltip ideation, visual philosophy |
| Rendering perf plan | `exploration/docs/rendering-perf-plan.md` | Systematic audit — baselines, issue taxonomy (A–F), quantitative gates |
| Perf measurement report | `exploration/docs/perf-measurement-report.md` | Phases 0–C measured results |
| Traversal perf | `exploration/docs/traversal-perf-investigation.md` | Era 2→3 prefetch regression, direction-aware pipeline fix |
| Panels plan | `exploration/docs/panels-plan.md` | Left (filters) / right (metadata), resize, keyboard, agg safeguards |
| Metadata display plan | `exploration/docs/metadata-display-plan.md` | Kahuna analysis, field visibility, click-to-search, phased build |
| Changelog | `exploration/docs/changelog.md` | Full development history — every feature, bug fix, and decision |
| Directives (human copy) | `exploration/docs/copilot-instructions-copy-for-humans.md` | Identical to `.github/copilot-instructions.md` |
| **Structural work plan** | **`exploration/docs/04-kupua-structural-work-plan.md`** | **Full 5-phase rearchitecture plan (10–14 days). Reference architecture — not being executed directly.** |
| **Realistic work plan** | **`exploration/docs/05-kupua-realistic-work-plan.md`** | **3 safe sessions: (1) test harness, (2) extract orchestration, (3) DAL boundary cleanup. Copy-pasteable agent prompts.** |

## Current Phase: Phase 2 — Live Elasticsearch (Read-Only)

**Goal:** Connect kupua to real ES clusters (TEST/CODE) via SSH tunnel to validate against ~9M images. Still read-only, no auth, no Grid API. Phase 1 (local sample data) is complete.

### What's Done

> Full build-by-build history in `exploration/docs/changelog.md`.

**Infrastructure:** Docker ES 8.18.3 on port 9220, `start.sh` (local + `--use-TEST`), S3 thumbnail proxy, imgproxy (port 3002), sample data pipeline. Grid colour tokens (`grid-bg` #333, `grid-cell` #393939).

**DAL** (`src/dal/`, ~2,550 lines across 5 files): `ImageDataSource` interface → `ElasticsearchDataSource`. Core: `search`, `searchAfter` (+ PIT with 404/410 fallback), `count`, `getById`, batched `getAggregations`. Advanced: `countBefore`, `estimateSortValue` (percentile), `findKeywordSortValue` (composite walk), `getKeywordDistribution`, `getDateDistribution`. Write protection on non-local ES. `MockDataSource` for tests. ES-specific code in `dal/adapters/elasticsearch/`: CQL→ES translator, sort clause builders. Tuning constants in `constants/tuning.ts`.

**State** (`src/stores/search-store.ts`, ~1,810 lines): Zustand. Windowed buffer (max 1000, cursor-based extend/evict/seek). Scroll-mode fill for small result sets. `imagePositions: Map` for O(1) lookup. Sort-around-focus ("Never Lost"). PIT lifecycle, new-images ticker. Aggregation cache + circuit breaker. Separate `column-store` + `panel-store` (localStorage-persisted).

**URL sync:** Single source of truth. `useUrlSearchSync` → store → search. Zod-validated params. `resetSearchSync()` for forced re-search. Custom `URLSearchParams`-based serialisation.

**CQL:** `@guardian/cql` parser + custom CQL→ES translator (in `dal/adapters/elasticsearch/`). `<cql-input>` Web Component. `LazyTypeahead` for non-blocking suggestions. Structured queries, `fileType:jpeg` → MIME, `is:GNM-owned`.

**Table view** (`ImageTable.tsx`, ~1,260 lines): TanStack Table + Virtual. Column defs from field-registry (23 hardcoded + config-driven alias fields). Resize, auto-fit, visibility context menu, sort on header click (shift for secondary), auto-reveal hidden columns on sort. Click-to-search (shift/alt modifiers, AST-based polarity flip). Row focus, double-click to detail. ARIA roles. Horizontal scrollbar via proxy div; vertical hidden (Scrubber replaces it).

**Grid view** (`ImageGrid.tsx`, ~520 lines): Responsive columns (`floor(width/280)`), 303px row height, S3 thumbnails, focus ring + keyboard nav, scroll anchoring on column count change.

**Scroll effects** (`useScrollEffects.ts`, ~640 lines): Shared hook for all scroll lifecycle — parameterised by `ScrollGeometry` descriptor. Handles: scroll reset orchestration, prepend/forward-evict compensation, seek scroll-to-target, sort-around-focus scroll, density-focus save/restore (with edge clamping), bufferOffset→0 guard. Module-level bridges for density-focus and sort-focus.

**Orchestration** (`lib/orchestration/search.ts`): Imperative coordination functions extracted from UI components and hooks. Holds: debounce cancellation (`cancelSearchDebounce`, `getCqlInputGeneration`), scroll-reset orchestration (`resetScrollAndFocusSearch`, `registerVirtualizerReset`), URL sync reset (`resetSearchSync`). Called by SearchBar, ImageTable, ImageMetadata, ImageDetail, useScrollEffects, useUrlSearchSync. Dependency direction: components → hooks → lib → dal.

**Reset-to-home** (`lib/reset-to-home.ts`): Single `resetToHome()` function deduplicating the reset sequence from SearchBar and ImageDetail logo click handlers.

**Scrubber** (`Scrubber.tsx`, ~1,010 lines): Vertical track, proportional thumb. Two modes: **scroll mode** (total ≤ threshold, direct scroll) and **seek mode** (windowed buffer, seek on pointer-up). Deep seek via percentile estimation (date/numeric) or composite aggregation (keyword). Sort-aware tooltip with adaptive date granularity. Keyword distribution binary search (O(log n), zero network during drag). Track tick marks with label decimation + hover animation. Seek cooldown (500ms).

**Panels** (`PanelLayout.tsx`): Left (facet filters) / right (focused-image metadata). Resize handles, `[`/`]` keyboard shortcuts, `AccordionSection` with persisted state. Facet filters: batched aggs, click/alt-click for CQL chips, "Show more" per field. Right panel: registry-driven `ImageMetadata`.

**Image detail** (`ImageDetail.tsx`): Overlay within search route (search page stays mounted with `opacity-0`). Counter, prev/next, direction-aware prefetch pipeline (T=150ms throttle gate), fullscreen survives between images. Position cache in sessionStorage (offset + sort cursor + search fingerprint) for reload restoration at any depth via `restoreAroundCursor`. AVIF format, DPR-aware sizing.

**Field registry** (`field-registry.ts`): Single source of truth for all image fields. 23 hardcoded + config-driven aliases. Drives table columns, sort dropdown, facet filters, detail panel. `detailLayout`/`detailGroup`/`detailClickable` hints for metadata display.

**Testing:** 171 Vitest unit/integration tests (~5s). 77 Playwright E2E tests (~70s) — scrubber, buffer corruption regression suite, density-focus drift, visual baselines. Safety gate refuses real ES. 19 perf tests + experiment infrastructure (16 scenarios). Corpus pinned via `PERF_STABLE_UNTIL`.

### What's Next

- [ ] **P8 domChurn ~57k** — virtualiser DOM churn at ~57k mutations/session (see perf report §5)
- [ ] **Scrubber scroll-mode visual polish** (Step 3 of `scrubber-dual-mode-ideation.md`) — native overlay scrollbar look
- [ ] **Raise scroll-mode threshold** (Step 4) — increase beyond 1000, validate with real data
- [ ] Column reordering via drag-and-drop

### Known Performance Issues

> Full data: `exploration/docs/perf-measurement-report.md`.

- **P8 (table fast scroll):** p95=50ms, domChurn=~57k, LoAF=~870ms. Root cause is virtualiser DOM churn. Requires skeleton rows or alternative approach.
- **P6 focusDrift — fixed.** Sort-around-focus uses ratio preservation.
- **P4b focusDrift — partially fixed.** Table unmount save includes HEADER_HEIGHT. May have secondary cause.

### Deferred to Later Phases

- [ ] Non-linear scrubber drag — explored and rejected (`scrubber-nonlinear-research.md`). Revisit when scrubber is stable + E2E comprehensive.
- [ ] Distribution-aware scrubber mapping — ES histogram warping. Phase 6.
- [ ] Quicklook — Cmd/Ctrl hold for large preview. ~100-150 lines. Blocked by imgproxy latency.
- [ ] `GridApiDataSource` (Phase 3 — replaces ES adapter, adds auth, uses Grid media-api)
- [ ] Row grouping, discovery features (date histograms, geographic clustering, visual similarity)

## Tech Stack

| Concern | Choice |
|---|---|
| UI | React 19 + TypeScript |
| Table | TanStack Table v8 (headless, virtualised) |
| Virtual Scroll | TanStack Virtual |
| State | Zustand |
| Routing | TanStack Router (Zod-validated search params) |
| Styling | Tailwind CSS 4 |
| Build | Vite 8 (Rolldown) |
| Data Layer | `ImageDataSource` interface → `ElasticsearchDataSource` (local or tunnelled) |
| Validation | Zod 4 |
| Testing | Vitest (unit/integration) + Playwright (E2E) |
| Dates | date-fns |

## Key Architecture Decisions

1. **Separate ES on port 9220** — kupua's Docker is independent of Grid's.

2. **DAL** — `ImageDataSource` interface with 15 methods (search, count, getById, aggregations, searchAfter, PIT, countBefore, estimateSortValue, findKeywordSortValue, distributions). Implemented by `ElasticsearchDataSource`. Deep seek: percentile estimation (date/numeric) or composite walk (keyword) + binary search refinement on `id` tiebreaker (hex interpolation). PIT 404/410 fallback retries without PIT. Phase 3+: dual-path (ES for reads, Grid API for writes).

3. **Scripts in `kupua/scripts/`** — self-contained, independent of Grid's `dev/` hierarchy.

4. **sample-data.ndjson not in git** — 115MB, kept locally or in S3.

5. **All views are one page** — table, grid, detail are density levels of the same ordered list. URL reflects full state. Browser back/forward restores position.

6. **Routes match kahuna** — `/search?query=...`, `/images/:imageId`, `/upload`, `/` → `/search?nonFree=true`.

   **`/search` URL params** (all optional): `query`, `ids`, `since`, `until`, `nonFree`, `payType`, `uploadedBy`, `orderBy`, `useAISearch`, `dateField`, `takenSince`, `takenUntil`, `modifiedSince`, `modifiedUntil`, `hasRightsAcquired`, `hasCrops`, `syndicationStatus`, `persisted`, `expandPinboard`, `pinboardId`, `pinboardItemId`, `image` (display-only), `density` (display-only). `nonFree=true` → API `free=undefined`; `hasCrops` → API `hasExports`.

7. **Column config in localStorage** — visibility, widths via `useColumnStore` with zustand/persist.

8. **Windowed buffer + Scrubber** — fixed-capacity buffer (max 1000) with `bufferOffset`. `search_after` + PIT for cursor-based pagination. Extend at edges, evict to keep memory bounded. Seek: shallow (<10k) via `from/size`, deep (≥10k) via percentile estimation + `search_after` + `countBefore`. Native scrollbar hidden; Scrubber is sole visible scrollbar with two modes (scroll/seek). Full design: `search-after-plan.md`.

9. **Local dev on localhost:3000** — future: add to nginx-mappings for Grid integration.

10. **URL is single source of truth for search state** — `useUpdateSearchParams` → URL → `useUrlSearchSync` → store → search. `resetSearchSync()` (in `lib/orchestration/search.ts`) for forced re-search.

11. **Sort system** — `orderBy` supports comma-separated multi-sort. `buildSortClause` in `dal/adapters/elasticsearch/sort-builders.ts` expands aliases per-part. Column headers, sort dropdown, URL all use the same sort keys.

12. **TanStack Table column ID** — dot-path accessors get dots→underscores in IDs. Any map keyed by column ID must use underscores.

13. **Custom URL parse/stringify** — not TanStack's `parseSearchWith` (which converts `"true"` → boolean). Uses `URLSearchParams` directly, all values stay strings.

14. **CQL chips via `@guardian/cql` Web Component** — `<cql-input>` handles chip rendering, editing, typeahead. Typeahead resolvers from DAL.

15. **Mock config** — `exploration/mock/grid-config.conf` (sanitised PROD config). Will be replaced by live config fetch in Phase 3.

16. **Start script** — validates Node version, Docker, port availability before starting.

17. **`@/*` path alias** — resolves to `src/`. Configured in both `tsconfig.json` and `vite.config.ts`.

18. **`App.tsx` deleted** — dead code after layout moved to `routes/__root.tsx`.

19. **Font standardisation** — Open Sans via `--font-sans`. Three-tier scale: `text-sm` (14px), `text-xs` (13px override), `text-2xs` (12px custom token).

20. **Shared popup styling** — `popup-menu`/`popup-item` in `index.css` `@layer components`.

21. **Auto-reveal hidden columns on sort** — column auto-shown via `toggleVisibility()`.

22. **Fullscreen survives between images** — React reconciles same `ImageDetail` component, fullscreened DOM element persists.

23. **Image detail is an overlay** — renders within search route (`opacity-0 pointer-events-none`). Scroll/virtualizer state preserved. `image` is display-only URL param excluded from store sync.

24. **"Never Lost" context preservation** — focus, selection, scroll survive density/view changes. Adjacent-item snap when focused item leaves result set.

25. **Actions written once, context-adaptive** — `ActionBar` derives `targetImages` from state. Labels/enabled adapt to count. Core logic identical across densities.

26. **Field Definition Registry** — `field-registry.ts`: identity, data access, search, sort, display, detail panel hints, type metadata. Config-driven aliases spliced in. Canonical array ordering drives all surfaces.

27. **Panels always in-flow** — visible or hidden (no overlay). Resizable, width persisted. Facet aggs lazy + debounced + circuit-breaker. Section state persisted to localStorage.

28. **Grid view scroll anchoring on width change** — focused-image ratio captured before column count change, restored in `useLayoutEffect`.

29. **CSS containment on scroll containers** — `contain: strict` on `.hide-scrollbar`. Critical for Firefox. Horizontal scrollbar is a proxy div with bidirectional `scrollLeft` sync.

## Project Structure

```
kupua/
  docker-compose.yml          # Standalone ES on port 9220
  index.html                  # SPA entry
  package.json
  vite.config.ts              # /es proxy to ES:9220, @ alias
  tsconfig.json               # @ path alias
  AGENTS.md                   # This file
  public/
    fonts/                    # Open Sans woff2
    images/                   # grid-logo.svg, grid-favicon.svg
  exploration/
    mock/                     # mapping.json, sample-data.ndjson (not in git), grid-config.conf
    docs/                     # Design docs, changelog, plans (see Design Documents table above)
  scripts/
    start.sh                  # One-command startup
    run-e2e.sh                # E2E orchestration (Docker ES + data + Playwright)
    run-smoke.mjs             # Manual smoke test runner. MANUAL ONLY.
    load-sample-data.sh       # Index creation + bulk load
    s3-proxy.mjs              # Local S3 thumbnail proxy (temporary)
  src/                        # ~16,300 lines total
    main.tsx                  # React entry — mounts RouterProvider
    router.ts                 # TanStack Router — custom URL serialisation
    index.css                 # Tailwind + Open Sans + Grid colour theme + shared component classes
    constants/
      layout.ts               # TABLE_ROW_HEIGHT (32), TABLE_HEADER_HEIGHT (45), GRID_ROW_HEIGHT (303), GRID_MIN_CELL_WIDTH (280), GRID_CELL_GAP (8)
      tuning.ts               # Buffer/aggregation tuning constants (BUFFER_CAPACITY, PAGE_SIZE, thresholds, poll intervals, agg sizing)
    routes/
      __root.tsx              # Root route — minimal shell
      index.tsx               # / → /search?nonFree=true
      search.tsx              # Search route — Zod-validated params, renders search + ImageDetail overlay
      image.tsx               # /images/$imageId → /search?image=...
    lib/
      orchestration/
        search.ts             # Imperative coordination: debounce cancel, scroll-reset, URL sync reset
        README.md             # Pattern documentation
      reset-to-home.ts        # Deduplicated logo-click reset sequence
      field-registry.ts       # Field Definition Registry (~644 lines, 23 hardcoded + config aliases)
      field-registry.test.ts  # 34 tests
      grid-config.ts          # Mock Grid config parser
      lazy-typeahead.ts       # Deferred CQL typeahead resolution
      search-params-schema.ts # Zod schema for URL search params
      scroll-container-ref.ts # Module-level ref for active scroll container
      keyboard-shortcuts.ts   # Centralised shortcut registry (single document listener, Alt+key in editable fields)
      sort-context.ts         # Sort-context labels for scrubber tooltip (~795 lines). Adaptive date granularity, keyword binary search, track tick generation.
      image-urls.ts           # URL builders — thumbnails via S3 proxy, full via imgproxy
      image-offset-cache.ts   # sessionStorage cache for image position (offset + sort cursor + search fingerprint)
      image-offset-cache.test.ts # 15 tests
      typeahead-fields.ts     # CQL typeahead field definitions from DAL
    dal/
      types.ts                # ImageDataSource interface + types (~345 lines)
      es-adapter.ts           # ES implementation (~1,035 lines, sort builders extracted)
      mock-data-source.ts     # MockDataSource for testing (~273 lines)
      es-config.ts            # ES connection config
      index.ts                # Barrel export
      adapters/
        elasticsearch/
          cql.ts              # CQL→ES query translator (~478 lines, moved from lib/)
          cql-query-edit.ts   # CQL AST manipulation (toggle/upsert chips, moved from lib/)
          sort-builders.ts    # buildSortClause, reverseSortClause, parseSortField (extracted from es-adapter.ts)
          sort-builders.test.ts # Sort builder tests (15 tests)
    components/
      SearchBar.tsx            # Toolbar: logo + CQL input + clear (no imperative exports — those are in lib/orchestration/search.ts)
      CqlSearchInput.tsx       # @guardian/cql <cql-input> wrapper
      SearchFilters.tsx        # FilterControls + SortControls
      DateFilter.tsx           # Date range filter dropdown
      StatusBar.tsx            # Count + ticker + timing + density toggle
      ImageTable.tsx           # TanStack Table + Virtual (~1,260 lines)
      ImageGrid.tsx            # Thumbnail grid (~520 lines)
      Scrubber.tsx             # Position scrubber (~1,010 lines)
      ImageDetail.tsx          # Single-image overlay with fullscreen + prev/next
      ImageMetadata.tsx        # Registry-driven metadata display (~325 lines)
      PanelLayout.tsx          # Panel system: flex row, resize, AccordionSection
      FacetFilters.tsx         # Facet filter panel (~275 lines)
      ColumnContextMenu.tsx    # Column header context menu
      SearchPill.tsx           # Shared pill component for list values
      ErrorBoundary.tsx        # React error boundary
    stores/
      search-store.ts          # Main store — windowed buffer, seek, extend/evict, PIT, sort-around-focus, aggs (~1,810 lines)
      search-store.test.ts     # 34 integration tests with MockDataSource
      column-store.ts          # Column visibility + widths (localStorage)
      panel-store.ts           # Panel visibility + widths (localStorage)
    types/
      image.ts                 # Image document types from ES mapping
    hooks/
      useDataWindow.ts         # Data window — buffer-aware interface for views (~215 lines)
      useScrollEffects.ts      # Shared scroll lifecycle hook (~640 lines, no imperative exports)
      useUrlSearchSync.ts      # URL↔store sync (no imperative exports — resetSearchSync is in lib/orchestration/search.ts)
      useListNavigation.ts     # Keyboard nav (arrow/page/home/end, ~327 lines)
      useFullscreen.ts         # Fullscreen API wrapper
      useKeyboardShortcut.ts   # React hook for keyboard-shortcuts.ts
      useHeaderHeight.ts       # ResizeObserver for table header height
      useReturnFromDetail.ts   # Scroll-to-focused on return from image detail
  e2e/
    global-setup.ts            # Safety gate + ES health check
    helpers.ts                 # KupuaHelpers fixture class
    scrubber.spec.ts           # 64 E2E tests
    buffer-corruption.spec.ts  # 10 regression tests
    visual-baseline.spec.ts    # 4 visual regression baselines (screenshot comparison)
    manual-smoke-test.spec.ts  # Real ES smoke tests (MANUAL ONLY)
  e2e-perf/
    perf.spec.ts               # 16 perf tests (P1–P16)
    experiments.spec.ts        # A/B tuning experiments (E1–E6)
    run-audit.mjs              # Perf audit harness
    results/                   # Audit logs + experiment results

```
