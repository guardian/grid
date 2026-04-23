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
| **Two-tier virtualisation (real scrolling 12k-65k)** | `scroll-two-tier-virtualisation-workplan.md`, `two-tier-virtualisation-handoff.md`, `useDataWindow.ts`, `dal/position-map.ts` |
| **Image traversal (prev/next in detail + fullscreen)** | `useImageTraversal.ts`, `ImageDetail.tsx`, `FullscreenPreview.tsx`, `image-prefetch.ts`, `image-prefetch.test.ts` |
| **Touch gestures (swipe carousel, dismiss, pinch-zoom)** | `useSwipeCarousel.ts`, `useSwipeDismiss.ts`, `usePinchZoom.ts`, `StableImg.tsx`, `image-prefetch.ts`, `ImageDetail.tsx`, `zz Archive/swipe-carousel-review.md`, `zz Archive/prefetch-cadence-workplan.md` |
| **Scrubber (seek, ticks, tooltip, null zone)** | `Scrubber.tsx`, `sort-context.ts`, `scrubber-dual-mode-ideation.md`, `scrubber-ticks-and-labels.md` |
| **Data layer / ES queries** | `dal/` directory, `dal/types.ts` (interface), `es-adapter.ts`, `es-audit.md` |
| **CQL / search input** | `dal/adapters/elasticsearch/cql.ts`, `cql-query-edit.ts`, `CqlSearchInput.tsx`, `lazy-typeahead.ts`, `typeahead-fields.ts` |
| **Sort system** | `dal/adapters/elasticsearch/sort-builders.ts`, `search-store.ts` (sort-around-focus), `field-registry.ts` |
| **Table view** | `ImageTable.tsx`, `useDataWindow.ts`, `ColumnContextMenu.tsx`, `column-store.ts` |
| **Grid view** | `ImageGrid.tsx`, `useDataWindow.ts`, `image-urls.ts` |
| **Keyboard navigation** | `useListNavigation.ts`, `CqlSearchInput.tsx` (keysToPropagate), `keyboard-shortcuts.ts`, `keyboard-navigation.md`, `e2e/local/keyboard-nav.spec.ts` |
| **Focus / phantom focus / position preservation** | `02-focus-and-position-preservation.md`, `focus-position-preservation-workplan.md`, `search-store.ts` (focusedImageId, sortAroundFocus), `ui-prefs-store.ts` (focusMode), `useDataWindow.ts` (viewportAnchor), `useScrollEffects.ts` (DensityFocusState), `useListNavigation.ts`, `useUrlSearchSync.ts` (sort-around-focus wiring) |
| **Image detail / fullscreen** | `ImageDetail.tsx`, `FullscreenPreview.tsx`, `image-prefetch.ts`, `image-offset-cache.ts` |
| **Panels / facets / metadata** | `PanelLayout.tsx`, `FacetFilters.tsx`, `ImageMetadata.tsx`, `panel-store.ts`, `panels-plan.md` |
| **URL / routing** | `search-params-schema.ts`, `useUrlSearchSync.ts`, `router.ts`, `routes/search.tsx`, `home-defaults.ts` |
| **Field registry** | `field-registry.ts` (~644 lines, 23 fields + config aliases) |
| **Testing** | `e2e/README.md` (comprehensive reference), `e2e/shared/helpers.ts`, `playwright.tiers.config.ts` |
| **Performance** | `perf-measurement-report.md`, `rendering-perf-plan.md`, `e2e-perf/` (incl. `results/audit-graphs.html` — sparkline dashboard) |
| **Architecture / philosophy** | `exploration/docs/00 Architecture and philosophy/`, `component-detail.md` |

## Current Phase: Phase 2 — Live Elasticsearch (Read-Only)

**Goal:** Connect kupua to real ES clusters (TEST/CODE) via SSH tunnel to validate against ~9M images. Still read-only, no auth, no Grid API.

### Component Summary

| Component | Key files | ~Lines | Purpose |
|---|---|---|---|
| DAL | `dal/types.ts`, `es-adapter.ts`, `adapters/elasticsearch/*` | 2,700 | `ImageDataSource` interface → ES. 15 methods. Write protection. |
| Position Map | `dal/position-map.ts` | 80 | `PositionMap` struct-of-arrays (ids + sortValues), `cursorForPosition()` helper |
| Store | `stores/search-store.ts` | 3,580 | Windowed buffer (max 1000), seek, extend/evict, PIT, sort-around-focus, frozenUntil, position map, parallel seek |
| Data Window | `hooks/useDataWindow.ts` | 460 | Buffer↔view bridge. Two-tier mode (`virtualizerCount=total`), scroll-triggered seek, extend triggers |
| Table | `components/ImageTable.tsx` | 1,300 | TanStack Table + Virtual. Column defs from field-registry. |
| Grid | `components/ImageGrid.tsx` | 510 | Responsive thumbnails, scroll anchoring on width change |
| Scrubber | `components/Scrubber.tsx`, `lib/sort-context.ts` | 1,150 + 1,040 | Scroll/seek/indexed modes, ticks, tooltip, null-zone support |
| Scroll | `hooks/useScrollEffects.ts` | 985 | Shared scroll lifecycle. Seek, prepend compensation, density-focus, two-tier gates. |
| Detail | `components/ImageDetail.tsx` | — | Overlay (search stays mounted). Fullscreen, position cache. Uses `useImageTraversal`. Stacked layout on mobile (flex-col, image top, metadata below). |
| Fullscreen | `components/FullscreenPreview.tsx` | — | `f` key peek. Uses `useImageTraversal`. Nav buttons. |
| Traversal | `hooks/useImageTraversal.ts` | 210 | Shared prev/next for detail + fullscreen. Proactive extend, pending nav, prefetch. All scroll modes. |
| Swipe Carousel | `hooks/useSwipeCarousel.ts` | ~290 | Visual slide-in carousel for prev/next on mobile touch. Velocity-aware commit, commitStripReset. |
| Swipe Dismiss | `hooks/useSwipeDismiss.ts` | ~140 | Pull-down-to-dismiss image detail. Spring-back, fade+scale. Mobile, non-fullscreen only. |
| Pinch Zoom | `hooks/usePinchZoom.ts` | ~260 | Two-finger pinch 1x–5x, single-finger pan, double-tap 1x↔2x. Fullscreen-only. Exposes scaleRef. |
| Panels | `components/PanelLayout.tsx`, `FacetFilters.tsx`, `ImageMetadata.tsx` | — | Left (filters) / right (metadata). Resize, persisted state. |
| Fields | `lib/field-registry.ts` | 755 | 23 hardcoded + config aliases. Drives all surfaces. |
| Orchestration | `lib/orchestration/search.ts`, `lib/reset-to-home.ts` | — | Imperative coordination. Debounce, scroll-reset, go-home. |
| URL sync | `hooks/useUrlSearchSync.ts`, `lib/search-params-schema.ts` | — | URL = single source of truth. Zod-validated. |
| UI Prefs | `stores/ui-prefs-store.ts` | 75 | `focusMode` preference (explicit/phantom), `pointer: coarse` auto-detection, localStorage-persisted |
| Settings | `components/SettingsMenu.tsx` | 115 | Three-dot menu in SearchBar. Click mode toggle (explicit↔phantom). Coarse pointer disables explicit. |
| CQL | `dal/adapters/elasticsearch/cql.ts`, `CqlSearchInput.tsx` | 478 | `@guardian/cql` Web Component + CQL→ES translator |

> Detailed descriptions of each: `exploration/docs/00 Architecture and philosophy/component-detail.md`

### Testing Summary

- **342 Vitest** unit/integration tests (~37s) — `npm test`
- **153 Playwright E2E** tests (~6min) — `npx playwright test`
- **18 × 3 tier-matrix** tests (~10min) — `npm run test:e2e:tiers` (buffer/two-tier/seek, manual)
- **20 perf tests** + experiment infrastructure — `npm run test:perf`
- **27 smoke tests** against TEST cluster — `npm run test:smoke`
- Full reference: **`e2e/README.md`** (8 test modes, decision tree, env vars)
- Logging: use `devLog()` from `src/lib/dev-log.ts` (DCE'd in prod, readable in E2E)

### Known Issues

- **P8 (table fast scroll):** p95=83ms, severe=66, domChurn=~117k (overscan 15). Root cause: virtualiser DOM churn. Needs skeleton rows.
- **P4b focusDrift:** Partially fixed. May have secondary cause.
- ~~**Scrubber thumb flash-to-top:**~~ Fixed. DOM guard in Scrubber.tsx.

### Backlog

- [ ] P8 domChurn ~117k (overscan 15, down from ~155k; see perf report §5)
- [ ] Scrubber scroll-mode visual polish (Step 3 of `scrubber-dual-mode-ideation.md`)
- [x] ~~Raise scroll-mode threshold beyond 1000~~ → Position map Phases 0-4a complete
- [x] ~~Two-tier virtualisation: real scrolling 12k-65k~~ → Complete
- [ ] Column reordering via drag-and-drop
- [x] ~~Consolidate hardcoded `nonFree: "true"` to `DEFAULT_SEARCH`~~ → `home-defaults.ts`
- [x] ~~Phantom focus mode (click-to-open, settings menu, coarse pointer)~~ → `ui-prefs-store.ts`, `SettingsMenu.tsx`

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
| Integration plan (direct-ES) | `exploration/docs/03 Ce n'est pas une pipe dream/integration-plan.md` | Phased plan for Grid backend integration (direct-ES + media-api hybrid) |
| API-first plan | `exploration/docs/03 Ce n'est pas une pipe dream/integration-plan-api-first.md` | Detailed API-first integration plan: additive media-api endpoints, phased rollout, elastic4s specs |
| Frontend philosophy | `exploration/docs/00 Architecture and philosophy/01-frontend-philosophy.md` | Density continuum, "Never Lost", click-to-search |
| Focus & position preservation | `exploration/docs/00 Architecture and philosophy/02-focus-and-position-preservation.md` | Focus, phantom focus, position engine, relaxation model, mobile |
| Focus workplan | `exploration/docs/focus-position-preservation-workplan.md` | 6-session implementation plan: search-context survival → phantom mode |
| Deviations log | `exploration/docs/deviations.md` | Intentional departures from Grid/kahuna |
| `search_after` plan | `exploration/docs/search-after-plan.md` | Windowed buffer, PIT, scrubber, sort-around-focus |
| Scrubber dual-mode | `exploration/docs/zz Archive/Scrolling bonanza/scrubber-dual-mode-ideation.md` | Scroll mode vs seek mode, tooltip, visual philosophy |
| Scrubber ticks & labels | `exploration/docs/00 Architecture and philosophy/scrubber-ticks-and-labels.md` | Coordinate system, tick placement, null zone |
| Panels plan | `exploration/docs/zz Archive/panels-plan.md` | Left/right panels, resize, keyboard, agg safeguards |
| ES audit | `exploration/docs/es-audit.md` | 9 issues found, 4 fixed |
| Performance | `exploration/docs/zz Archive/perf-measurement-report.md` | Phases 0–C measured results |
| Rendering perf plan | `exploration/docs/zz Archive/rendering-perf-plan.md` | Issue taxonomy (A–F), quantitative gates |
| Position map workplan | `exploration/docs/zz Archive/Scrolling bonanza/scroll-real-scrolling-through-24-workplan.md` | 8-phase plan for 65k scroll-like scrubber (Phases 0-4a done, 4b-7 superseded) |
| Two-tier virtualisation | `exploration/docs/zz Archive/Scrolling bonanza/scroll-real-scrolling-two-tier-virtualisation-workplan.md` | 4-session plan: real scrolling through 12k-65k via two-tier virtualisation |
| Position map measurements | `exploration/docs/zz Archive/Scrolling bonanza/scroll-real-position-map-measurements.md` | Phase 0 results + decisions |
| Prefetch cadence workplan | `exploration/docs/zz Archive/prefetch-cadence-workplan.md` | Traversal session model, cadence EMA, 7-session plan (1–4+6 done, 5 skipped) |
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

12. **Two-tier virtualisation** — When total is in the position-map-eligible range (1k < total ≤ 65k), `virtualizerCount = total`, indices become global, scrubber drag directly scrolls the container. `twoTier` is derived from total range (not `positionMap !== null`) so the coordinate space is stable from frame 1. Position map is a background performance optimisation (faster seeks), not a coordinate-space decision. Buffer slides via extends and scroll-triggered seeks. `search()` invalidates the map (→ reverts to buffer-local); `seek()` preserves it. Parallel forward+backward fetch saves ~250-350ms. Full design: `scroll-two-tier-virtualisation-workplan.md`.