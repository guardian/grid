# Kupua — Agent Context

> This file is read at the start of each session. Keep it **lean** — every line
> here costs context window on every task. Detailed component descriptions live in
> `exploration/docs/00 Architecture and philosophy/component-detail.md` (read on demand).

> **Directives** live in `.github/copilot-instructions.md` (auto-loaded by Copilot).
> Human-readable copy: `exploration/docs/00 Architecture and philosophy/copilot-instructions-copy-for-humans.md`.
> The two files must stay identical — see the "Directive sync rule" inside them.

## What is Kupua?

Kupua is a **new React-based frontend** for [Grid](https://github.com/guardian/grid), the Guardian's image DAM (Digital Asset Management) system. It replaces the existing **kahuna** frontend (AngularJS 1.8).

Grid manages ~9 million images stored in S3, with metadata indexed in **Elasticsearch 8.x**. Kupua lives inside the Grid monorepo at `kupua/`.

## Running Kupua

Single entry point: `kupua/scripts/start.sh`. Two modes:

| Mode | Command | ES source |
|---|---|---|
| **Local** (default) | `./kupua/scripts/start.sh` | Docker ES on port 9220 |
| **TEST** | `./kupua/scripts/start.sh --use-TEST` | SSH tunnel to TEST ES on port 9200 |

Local mode starts Docker ES + sample data + Vite. TEST mode establishes SSH tunnel (via `ssm-scala` if available, falls back to raw AWS CLI + session-manager-plugin), auto-discovers index alias + S3 buckets, starts S3 proxy + imgproxy. Both independent of Grid's `dev/script/start.sh`. Docker Compose v1 and v2 supported.

## Context Routing — What to Read for What Task

| Working on… | Read these files |
|---|---|
| **Scroll behaviour / swimming / position preservation** | `useScrollEffects.ts`, `search-store.ts` (seek/extend), `constants/tuning.ts`, `e2e/local/scrubber.spec.ts` |
| **Two-tier virtualisation (real scrolling 1k-65k)** | `03-scroll-architecture.md`, `useDataWindow.ts`, `dal/position-map.ts`, `lib/two-tier.ts` |
| **Image traversal (prev/next in detail + fullscreen)** | `useImageTraversal.ts`, `ImageDetail.tsx`, `FullscreenPreview.tsx`, `image-prefetch.ts`, `image-prefetch.test.ts` |
| **Touch & desktop gestures (swipe, dismiss, zoom)** | `useSwipeCarousel.ts`, `useSwipeDismiss.ts`, `usePinchZoom.ts` (touch + mouse + wheel + keyboard zoom), `StableImg.tsx`, `image-prefetch.ts`, `ImageDetail.tsx`, `FullscreenPreview.tsx` |
| **Scrubber (seek, ticks, tooltip, null zone)** | `Scrubber.tsx`, `sort-context.ts`, `search-store.ts` (seek paths, `buildSeekCursorAnchors`, `fetchNullZoneDistribution`), `dal/null-zone.ts`, `scrubber-ticks-and-labels.md` |
| **Data layer / ES queries** | `dal/` directory, `dal/types.ts` (interface), `es-adapter.ts`, `dal/null-zone.ts`, `es-audit.md` |
| **Grid API adapter / bread-and-butter integration** | `dal/grid-api/` directory, `exploration/docs/03 Ce n'est pas une pipe dream/integration-workplan-bread-and-butter.md`, `exploration/docs/01 Research/grid-api-contract-audit-findings.md`, `exploration/docs/00 Architecture and philosophy/enrichment-strategy.md` |
| **CQL / search input** | `dal/adapters/elasticsearch/cql.ts`, `cql-query-edit.ts`, `CqlSearchInput.tsx`, `lazy-typeahead.ts`, `typeahead-fields.ts` |
| **Sort system** | `dal/adapters/elasticsearch/sort-builders.ts`, `search-store.ts` (sort-around-focus), `field-registry.tsx` |
| **Table view** | `ImageTable.tsx`, `useDataWindow.ts`, `ColumnContextMenu.tsx`, `column-store.ts`, `field-registry.tsx` |
| **Grid view** | `ImageGrid.tsx`, `useDataWindow.ts`, `image-urls.ts` |
| **Keyboard navigation** | `useListNavigation.ts`, `CqlSearchInput.tsx` (keysToPropagate), `keyboard-shortcuts.ts`, `keyboard-navigation.md`, `e2e/local/keyboard-nav.spec.ts` |
| **Focus / phantom focus / position preservation** | `02-focus-and-position-preservation.md`, `search-store.ts` (focusedImageId, sortAroundFocus), `ui-prefs-store.ts` (focusMode), `useDataWindow.ts` (viewportAnchor), `useScrollEffects.ts` (DensityFocusState), `useListNavigation.ts`, `useUrlSearchSync.ts` (sort-around-focus wiring) |
| **Image detail / fullscreen / zoom** | `ImageDetail.tsx`, `FullscreenPreview.tsx`, `usePinchZoom.ts`, `image-prefetch.ts`, `image-offset-cache.ts`, `useReturnFromDetail.ts` |
| **Panels / facets / metadata** | `PanelLayout.tsx`, `FacetFilters.tsx`, `ImageMetadata.tsx`, `panel-store.ts` |
| **URL / routing** | `search-params-schema.ts`, `useUrlSearchSync.ts`, `router.ts`, `routes/search.tsx`, `home-defaults.ts` |
| **Browser history** | `04-browser-history-architecture.md`, `lib/orchestration/history-key.ts`, `lib/history-snapshot.ts`, `lib/build-history-snapshot.ts`, `useUrlSearchSync.ts` (popstate restore), `e2e/local/browser-history.spec.ts` |
| **Field registry** | `field-registry.tsx` (33 static fields + config aliases) |
| **Selections (multi-image, S6 done)** | `stores/selection-store.ts`, `lib/interpretClick.ts`, `lib/reconcile.ts`, `components/Tickbox.tsx`, `hooks/useIsSelected.ts`, `hooks/useRangeSelection.ts`, `hooks/useLongPress.ts`, `lib/dispatchClickEffects.ts`, `lib/handleLongPressStart.ts`, `components/MultiImageMetadata.tsx`, `components/metadata-primitives.tsx`, `components/MultiValue.tsx`, `components/SelectionFab.tsx`, `components/ToastContainer.tsx`, `hooks/useToast.ts`, `stores/toast-store.ts`, `exploration/docs/00 Architecture and philosophy/05-selections.md`, `exploration/docs/00 Architecture and philosophy/field-catalogue.md` |
| **Collections panel** | `stores/collection-store.ts`, `components/CollectionTree.tsx`, `exploration/docs/00 Architecture and philosophy/06-collections.md`, `dal/adapters/elasticsearch/cql.ts` (`~` shorthand already present), `lib/typeahead-fields.ts` (collection resolver) |
| **Testing** | `e2e/README.md` (comprehensive reference), `e2e/shared/helpers.ts`, `playwright.tiers.config.ts` |
| **Performance** | `e2e-perf/` (incl. `results/audit-graphs.html` — jank dashboard, `results/perceived-graphs.html` — perceived-perf dashboard) |
| **Perceived performance** | `lib/perceived-trace.ts`, `e2e-perf/perceived-short.spec.ts` (single-action), `e2e-perf/perceived-long.spec.ts` (multi-step journeys), `e2e-perf/results/perceived-{log,graphs}.{json,js,md,html}` |
| **Architecture / philosophy** | `exploration/docs/00 Architecture and philosophy/`, `component-detail.md` |

## Current Phase: Phase 2 — Live Elasticsearch (Read-Only)

**Goal:** Connect kupua to real ES clusters (TEST/CODE) via SSH tunnel to validate against ~9M images. Still read-only, no auth, no Grid API.

### System Summary

| System | Key entry points | What it does |
|---|---|---|
| DAL | `dal/types.ts`, `es-adapter.ts`, `dal/adapters/elasticsearch/*` | `ImageDataSource` interface → ES adapter. Search, pagination (PIT + `search_after`), aggregations, distributions. Write protection on non-local ES. `DATE_SORT_FIELDS` gotcha: ES sort values are epoch ms, `_source` is ISO. |
| Store | `stores/search-store.ts` | Centre of gravity (~3,900 lines). Windowed buffer (max 1000) shared by all three scroll tiers (see KAD #2). Seek/extend/evict, PIT lifecycle, sort-around-focus, position map, two-tier coordination, aggregation cache. |
| Data Window | `hooks/useDataWindow.ts` | Buffer↔view bridge. Two hook modes: **normal** (buffer-local indices — serves scroll tier ≤1k and seek tier >65k) and **two-tier** (global indices, skeleton cells — serves indexed tier 1k–65k). Viewport anchor tracking for density-focus and sort-around-focus. |
| Scroll & Scrubber | `hooks/useScrollEffects.ts`, `components/Scrubber.tsx`, `lib/sort-context.ts` | Shared scroll lifecycle (seek, prepend compensation, density-focus, swimming prevention). Prepend compensation only in scroll/seek tiers — indexed tier replaces items at fixed global positions (no swimming). Scrubber: three modes matching the three tiers (see KAD #2). Null-zone support, tick density map. |
| Collections | `stores/collection-store.ts`, `components/CollectionTree.tsx` | Collection tree from port 9010. Graceful-absent when service unavailable. Subtree counts from ES agg. Click → `collection:pathId` in CQL query. Auto-sort to `dateAddedToCollection`. |
| Field Registry | `lib/field-registry.tsx` | Single source of truth for all image fields (33 static + config aliases). Drives table columns, sort, filters, detail panel, multi-image panel. `multiSelectBehaviour`, `detailLayout`, `pillVariant`. |
| URL & Routing | `hooks/useUrlSearchSync.ts`, `lib/search-params-schema.ts`, `router.ts`, `lib/orchestration/history-key.ts`, `lib/history-snapshot.ts` | URL = single source of truth. Zod-validated params. Sort-around-focus detection. Selection clear-on-navigation. `kupuaKey` per-entry identity → sessionStorage snapshots → popstate/reload restore. |
| CQL | `dal/adapters/elasticsearch/cql.ts`, `CqlSearchInput.tsx` | `@guardian/cql` Web Component + CQL→ES translator. Typeahead from agg cache. Structured queries (`is:`, `fileType:`). `is:` resolver enriches suggestions with counts from ticker store, category aggs, and `getFilterAggregations`. |
| Selection | `stores/selection-store.ts`, `lib/interpretClick.ts`, `lib/reconcile.ts`, `hooks/useRangeSelection.ts` | Multi-image selection: Set-based state, LRU metadata cache, lazy reconciliation, sessionStorage persist. `interpretClick` pure function owns click policy. Range selection (in-buffer fast path + server walk). |
| Enrichment | `lib/cost/`, `stores/enrichment-store.ts`, `lib/derive-enriched-image.ts`, `lib/syndication/` | Three-layer merge: ES baseline → TS cost/validity/syndication calculation → optional Grid API overlay. `deriveImage()` is the single merge point. Syndication status computed client-side from `syndicationRights`, `leases`, `usages` (SY-0–SY-5). |
| Orchestration | `lib/orchestration/search.ts`, `lib/reset-to-home.ts` | Imperative coordination: debounce, scroll-reset, go-home, fullscreen preview registration. Prevents components from reimplementing coordination logic. |

> Full component inventory (views, gesture hooks, panels, toast, etc.): `exploration/docs/00 Architecture and philosophy/component-detail.md`

### Testing Summary

- **856 Vitest** unit/integration tests (~40s) -- `npm test`
- **239 Playwright E2E** tests (~8min) -- `npx playwright test`
- **18 × 3 tier-matrix** tests (~10min) — `npm run test:e2e:tiers` (buffer/two-tier/seek, manual)
- **20 perf tests** + experiment infrastructure — `npm run test:perf`
- **27 smoke tests** against TEST cluster — `npm run test:smoke`
- **12 perceived-perf short tests** against TEST cluster — `node e2e-perf/run-audit.mjs --short-perceived-only --label "..."` (manual, real ES required)
- **2 perceived-perf long tests (journeys JA + JB, 8 steps total)** against TEST cluster — `node e2e-perf/run-audit.mjs --long-perceived-only --label "..."` (manual, real ES required)
- Full reference: **`e2e/README.md`** (8 test modes, decision tree, env vars)
- Logging: use `devLog()` from `src/lib/dev-log.ts` (DCE'd in prod, readable in E2E)

## Design Documents

| Doc | Path | Summary |
|---|---|---|
| Frontend philosophy | `exploration/docs/00 Architecture and philosophy/01-frontend-philosophy.md` | Density continuum, "Never Lost", click-to-search |
| Focus & position preservation | `exploration/docs/00 Architecture and philosophy/02-focus-and-position-preservation.md` | Focus, phantom focus, position engine, relaxation model, mobile |
| Scroll architecture | `exploration/docs/00 Architecture and philosophy/03-scroll-architecture.md` | Windowed buffer, search_after + PIT, seek, extend/evict, two-tier, swimming |
| Browser history architecture | `exploration/docs/00 Architecture and philosophy/04-browser-history-architecture.md` | kupuaKey, snapshot capture, popstate restore, reload survival |
| Selections architecture | `exploration/docs/00 Architecture and philosophy/05-selections.md` | Multi-image selection: state shape, click semantics, lazy reconciliation, survival matrix |
| Selections field catalogue | `exploration/docs/00 Architecture and philosophy/field-catalogue.md` | Per-field reference: multi-select behaviour, ES presence, Kupua/Kahuna parity (46 fields) |
| Keyboard navigation | `exploration/docs/00 Architecture and philosophy/keyboard-navigation.md` | Focus modes, page-scroll math, arrow key behaviour |
| Scrubber ticks & labels | `exploration/docs/00 Architecture and philosophy/scrubber-ticks-and-labels.md` | Coordinate system, tick placement, null zone |
| Tuning knobs | `exploration/docs/00 Architecture and philosophy/tuning-knobs.md` | Master reference for every configurable constant |
| Collections feature | `exploration/docs/00 Architecture and philosophy/06-collections.md` | Architecture: decisions, data flow, store, CQL, auto-sort, ES mechanics, component |
| Deviations log | `exploration/docs/deviations.md` | Intentional departures from Grid/kahuna |
| ES audit | `exploration/docs/es-audit.md` | 9 issues found, 4 fixed |
| Integration workplan | `exploration/docs/03 Ce n'est pas une pipe dream/integration-workplan-bread-and-butter.md` | Active workplan for Grid API integration (API-first hybrid) |
| API-first architecture | `exploration/docs/03 Ce n'est pas une pipe dream/integration-plan-api-first.md` | HATEOAS/API-first integration plan: endpoints, phased rollout, elastic4s specs |
| Enrichment strategy | `exploration/docs/00 Architecture and philosophy/enrichment-strategy.md` | ES-baseline + Grid API optional enrichment |
| Changelog | `exploration/docs/changelog.md` | Full development history |

> Archived workplans, audits, and handoffs: `exploration/docs/zz Archive/`. Docs inventory: `exploration/docs/docs-inventory-2026-05-07.md`.

## Stable Test Corpora (TEST cluster, pinned via `until`)

| Mode | Total | URL search params |
|---|---|---|
| Scroll (<1k) | 958 | `nonFree=true&query=keyword:"mid length half celebration"&until=2026-03-04T00:00:00Z` |
| Two-tier (1k–65k) | 14,399 | `nonFree=true&until=2026-03-04T00:00:00Z&query=city:Dublin` |
| Seek (>65k) | 1,304,298 | `nonFree=true&until=2026-03-04T00:00:00Z` |

## Tech Stack

| Concern | Choice |
|---|---|
| UI | React 19 + TypeScript |
| Table | TanStack Table v8 + TanStack Virtual |
| State | Zustand |
| Routing | TanStack Router (Zod-validated search params) |
| Styling | Tailwind CSS 4 |
| Build | Vite 8 (Rolldown) |
| Data Layer | `ImageDataSource` interface → `ElasticsearchDataSource` |
| Testing | Vitest + Playwright |

## Key Architecture Decisions

1. **All views are one page** — table, grid, image detail, and fullscreen preview are density levels of the same ordered list. URL reflects full state. Browser back/forward restores position. ("Never Lost")

2. **Three-tier scroll architecture** — all tiers share a windowed buffer (max 1000, `search_after` + PIT). Tier is auto-selected by result count:

   | Tier | Total | Scrubber | Key mechanism |
   |---|---|---|---|
   | **Scroll** | ≤1,000 | Real scrollbar (buffer = full result set) | Simplest path: no position map, no skeletons |
   | **Indexed scroll** | 1k–65k | Real scrollbar (position map + sliding buffer) | Two-tier virtualisation (KAD #12). Skeleton cells outside buffer. No swimming (items replaced at fixed global positions). |
   | **Seek** | >65k | Seek control (teleport on pointer-up) | Deep seek via percentile estimation or composite walk. Bidirectional seek places user in buffer middle. |

   Extend at edges, evict to keep bounded. Full design: `03-scroll-architecture.md`.

3. **DAL interface** — `ImageDataSource` with 13 methods. `ElasticsearchDataSource` for Phase 2, `GridApiDataSource` planned for Phase 3. Write protection on non-local ES.

4. **URL is single source of truth** — `useUpdateSearchParams` → URL → `useUrlSearchSync` → store → search. Custom `URLSearchParams` serialisation (not TanStack's, which coerces `"true"` → boolean).

5. **Routes match kahuna** — `/search?query=...`, `/images/:imageId`, `/` → `/search?nonFree=true`. Full param list: `query`, `ids`, `since`, `until`, `nonFree`, `payType`, `uploadedBy`, `orderBy`, `useAISearch`, `dateField`, `takenSince`, `takenUntil`, `modifiedSince`, `modifiedUntil`, `hasRightsAcquired`, `hasCrops`, `syndicationStatus`, `persisted`, `expandPinboard`, `pinboardId`, `pinboardItemId`, `image` (display-only), `density` (display-only).

6. **Field Definition Registry** — `field-registry.tsx`: single source of truth for identity, data access, search, sort, display, detail hints, type metadata. Config-driven aliases. Drives all UI surfaces.

7. **Image detail is an overlay** — renders within search route (`opacity-0 pointer-events-none`). Scroll/virtualizer state preserved underneath.

8. **Sort system** — comma-separated multi-sort via `orderBy`. Universal `uploadTime` fallback for null-zone ordering.

9. **CSS containment** — `contain: strict` on `.hide-scrollbar`. Critical for Firefox. Horizontal scrollbar is a proxy div.

10. **Separate infrastructure** — Docker ES on port 9220, scripts in `kupua/scripts/`, sample data (115MB) not in git.

11. **TanStack Table column ID caveat** — dot-path accessors get dots→underscores in IDs. Maps keyed by column ID must use underscores.

12. **Two-tier virtualisation (indexed scroll tier)** — `twoTier` is derived from total range (not `positionMap !== null`) so the coordinate space is stable from frame 1. Position map is a background perf optimisation (faster seeks), not a coordinate-space decision. `search()` invalidates the map; `seek()` preserves it.