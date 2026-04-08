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

Local mode starts Docker ES + sample data + Vite. TEST mode establishes SSH tunnel, auto-discovers index alias + S3 buckets, starts S3 proxy + imgproxy. Both independent of Grid's `dev/script/start.sh`.

## Context Routing — What to Read for What Task

| Working on… | Read these files |
|---|---|
| **Scroll behaviour / swimming / position preservation** | `useScrollEffects.ts`, `search-store.ts` (seek/extend), `constants/tuning.ts`, `e2e/local/scrubber.spec.ts` |
| **Scrubber (seek, ticks, tooltip, null zone)** | `Scrubber.tsx`, `sort-context.ts`, `scrubber-dual-mode-ideation.md`, `scrubber-ticks-and-labels.md` |
| **Data layer / ES queries** | `dal/` directory, `dal/types.ts` (interface), `es-adapter.ts`, `es-audit.md` |
| **CQL / search input** | `dal/adapters/elasticsearch/cql.ts`, `cql-query-edit.ts`, `CqlSearchInput.tsx`, `lazy-typeahead.ts` |
| **Sort system** | `dal/adapters/elasticsearch/sort-builders.ts`, `search-store.ts` (sort-around-focus), `field-registry.ts` |
| **Table view** | `ImageTable.tsx`, `useDataWindow.ts`, `ColumnContextMenu.tsx`, `column-store.ts` |
| **Grid view** | `ImageGrid.tsx`, `useDataWindow.ts`, `image-urls.ts` |
| **Keyboard navigation** | `useListNavigation.ts`, `CqlSearchInput.tsx` (keysToPropagate), `keyboard-shortcuts.ts`, `keyboard-navigation.md`, `e2e/local/keyboard-nav.spec.ts` |
| **Image detail / fullscreen** | `ImageDetail.tsx`, `FullscreenPreview.tsx`, `image-prefetch.ts`, `image-offset-cache.ts` |
| **Panels / facets / metadata** | `PanelLayout.tsx`, `FacetFilters.tsx`, `ImageMetadata.tsx`, `panel-store.ts`, `panels-plan.md` |
| **URL / routing** | `search-params-schema.ts`, `useUrlSearchSync.ts`, `router.ts`, `routes/search.tsx` |
| **Field registry** | `field-registry.ts` (~644 lines, 23 fields + config aliases) |
| **Testing** | `e2e/README.md` (comprehensive reference), `e2e/shared/helpers.ts` |
| **Performance** | `perf-measurement-report.md`, `rendering-perf-plan.md`, `e2e-perf/` |
| **Architecture / philosophy** | `exploration/docs/00 Architecture and philosophy/`, `component-detail.md` |

## Current Phase: Phase 2 — Live Elasticsearch (Read-Only)

**Goal:** Connect kupua to real ES clusters (TEST/CODE) via SSH tunnel to validate against ~9M images. Still read-only, no auth, no Grid API.

### Component Summary

| Component | Key files | ~Lines | Purpose |
|---|---|---|---|
| DAL | `dal/types.ts`, `es-adapter.ts`, `adapters/elasticsearch/*` | 2,700 | `ImageDataSource` interface → ES. 15 methods. Write protection. |
| Store | `stores/search-store.ts` | 2,650 | Windowed buffer (max 1000), seek, extend/evict, PIT, sort-around-focus |
| Table | `components/ImageTable.tsx` | 1,300 | TanStack Table + Virtual. Column defs from field-registry. |
| Grid | `components/ImageGrid.tsx` | 490 | Responsive thumbnails, scroll anchoring on width change |
| Scrubber | `components/Scrubber.tsx`, `lib/sort-context.ts` | 1,080 + 1,040 | Scroll/seek modes, ticks, tooltip, null-zone support |
| Scroll | `hooks/useScrollEffects.ts` | 720 | Shared scroll lifecycle. Seek, prepend compensation, density-focus. |
| Detail | `components/ImageDetail.tsx` | — | Overlay (search stays mounted). Prefetch, fullscreen, position cache. |
| Fullscreen | `components/FullscreenPreview.tsx` | — | `f` key peek. Another density of the same list. |
| Panels | `components/PanelLayout.tsx`, `FacetFilters.tsx`, `ImageMetadata.tsx` | — | Left (filters) / right (metadata). Resize, persisted state. |
| Fields | `lib/field-registry.ts` | 755 | 23 hardcoded + config aliases. Drives all surfaces. |
| Orchestration | `lib/orchestration/search.ts`, `lib/reset-to-home.ts` | — | Imperative coordination. Debounce, scroll-reset, go-home. |
| URL sync | `hooks/useUrlSearchSync.ts`, `lib/search-params-schema.ts` | — | URL = single source of truth. Zod-validated. |
| CQL | `dal/adapters/elasticsearch/cql.ts`, `CqlSearchInput.tsx` | 478 | `@guardian/cql` Web Component + CQL→ES translator |

> Detailed descriptions of each: `exploration/docs/00 Architecture and philosophy/component-detail.md`

### Testing Summary

- **203 Vitest** unit/integration tests (~5s) — `npm test`
- **106 Playwright E2E** tests (~4.5min) — `npx playwright test`
- **19 perf tests** + experiment infrastructure — `npm run test:perf`
- **27 smoke tests** against TEST cluster — `npm run test:smoke`
- Full reference: **`e2e/README.md`** (7 test modes, decision tree, env vars)
- Logging: use `devLog()` from `src/lib/dev-log.ts` (DCE'd in prod, readable in E2E)

### Known Issues

- **P8 (table fast scroll):** p95=50ms, domChurn=~57k. Root cause: virtualiser DOM churn. Needs skeleton rows.
- **P4b focusDrift:** Partially fixed. May have secondary cause.

### Backlog

- [ ] P8 domChurn ~57k (see perf report §5)
- [ ] Scrubber scroll-mode visual polish (Step 3 of `scrubber-dual-mode-ideation.md`)
- [ ] Raise scroll-mode threshold beyond 1000
- [ ] Column reordering via drag-and-drop

### Deferred to Later Phases

- Non-linear scrubber drag — explored and rejected (`scrubber-nonlinear-research.md`)
- Distribution-aware scrubber mapping — Phase 6
- Quicklook — blocked by imgproxy latency
- `GridApiDataSource` (Phase 3 — replaces ES adapter, adds auth)
- Row grouping, discovery features

## Design Documents

| Doc | Path | Summary |
|---|---|---|
| Migration plan | `exploration/docs/migration-plan.md` | Phased plan (1–6), kahuna feature inventory |
| Frontend philosophy | `exploration/docs/00 Architecture and philosophy/01-frontend-philosophy.md` | Density continuum, "Never Lost", click-to-search |
| Deviations log | `exploration/docs/deviations.md` | Intentional departures from Grid/kahuna |
| `search_after` plan | `exploration/docs/search-after-plan.md` | Windowed buffer, PIT, scrubber, sort-around-focus |
| Scrubber dual-mode | `exploration/docs/scrubber-dual-mode-ideation.md` | Scroll mode vs seek mode, tooltip, visual philosophy |
| Scrubber ticks & labels | `exploration/docs/00 Architecture and philosophy/scrubber-ticks-and-labels.md` | Coordinate system, tick placement, null zone |
| Panels plan | `exploration/docs/panels-plan.md` | Left/right panels, resize, keyboard, agg safeguards |
| ES audit | `exploration/docs/es-audit.md` | 9 issues found, 4 fixed |
| Performance | `exploration/docs/perf-measurement-report.md` | Phases 0–C measured results |
| Rendering perf plan | `exploration/docs/rendering-perf-plan.md` | Issue taxonomy (A–F), quantitative gates |
| Changelog | `exploration/docs/changelog.md` | Full development history |

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

2. **Windowed buffer + Scrubber** — fixed-capacity buffer (max 1000) with `bufferOffset`. `search_after` + PIT for cursor-based pagination. Extend at edges, evict to keep memory bounded. Deep seek via percentile estimation or composite walk. Bidirectional seek places user in buffer middle. Full design: `search-after-plan.md`.

3. **DAL interface** — `ImageDataSource` with 15 methods. `ElasticsearchDataSource` for Phase 2, `GridApiDataSource` planned for Phase 3. Write protection on non-local ES.

4. **URL is single source of truth** — `useUpdateSearchParams` → URL → `useUrlSearchSync` → store → search. Custom `URLSearchParams` serialisation (not TanStack's, which coerces `"true"` → boolean).

5. **Routes match kahuna** — `/search?query=...`, `/images/:imageId`, `/` → `/search?nonFree=true`. Full param list: `query`, `ids`, `since`, `until`, `nonFree`, `payType`, `uploadedBy`, `orderBy`, `useAISearch`, `dateField`, `takenSince`, `takenUntil`, `modifiedSince`, `modifiedUntil`, `hasRightsAcquired`, `hasCrops`, `syndicationStatus`, `persisted`, `expandPinboard`, `pinboardId`, `pinboardItemId`, `image` (display-only), `density` (display-only).

6. **Field Definition Registry** — `field-registry.ts`: single source of truth for identity, data access, search, sort, display, detail hints, type metadata. Config-driven aliases. Drives all UI surfaces.

7. **Image detail is an overlay** — renders within search route (`opacity-0 pointer-events-none`). Scroll/virtualizer state preserved underneath.

8. **Sort system** — comma-separated multi-sort via `orderBy`. Universal `uploadTime` fallback for null-zone ordering.

9. **CSS containment** — `contain: strict` on `.hide-scrollbar`. Critical for Firefox. Horizontal scrollbar is a proxy div.

10. **Separate infrastructure** — Docker ES on port 9220, scripts in `kupua/scripts/`, sample data (115MB) not in git.

11. **TanStack Table column ID caveat** — dot-path accessors get dots→underscores in IDs. Maps keyed by column ID must use underscores.
