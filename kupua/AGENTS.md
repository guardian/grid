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

Single entry point: `kupua/scripts/start.sh`. Four modes:

| Mode | Command | ES source |
|---|---|---|
| **Local** (default) | `./kupua/scripts/start.sh` | Docker ES on port 9220 |
| **TEST (direct-ES)** | `./kupua/scripts/start.sh --use-TEST` | SSH tunnel to TEST ES on port 9200 |
| **TEST (media-api)** | `./kupua/scripts/start.sh --use-TEST --use-media-api` | Local media-api → tunnel → TEST ES for ordinary and AI reads |
| **TEST (deployed media-api)** | `./kupua/scripts/start.sh --use-deployed-media-api` | Browser → deployed TEST media-api; local media delivery retained |

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
| **Grid API adapter / media-api integration** | **Active build: [API build plan](exploration/docs/03%20Ce%20n'est%20pas%20une%20pipe%20dream/api-build/api-build-00-plan.md) + its session prompt.** Local-first, PIT-less, split into PRs late; U9-A/B now route AI through media-api too, so API mode constructs no ES datasource. Candidate 11/inventory/workplan are background subject to the build plan's explicit overrides. Reuse sufficient existing endpoints, otherwise keep new reads isolated; existing Grid behavior changes need approval. PR #4957 alignment is parallel P1, not a pause on the build. |
| **Capability-preserving API boundary research** | Candidate 11 sections 12/13 retain P29/P30/P31 and completed restore/accepted-cost limits; section 14 integrates P32 interaction/display/measurement and P33 Grid edit/delete/collection characterization with explicit corrections. Future editing is knowledge only, not scope; ten new source-only bugs are independently parked. Original reports/S1/history remain; whole-corpus readiness is false and no new implementation or campaign follows. |
| **Canonical bugs / migration dependencies** | Start with the [backlog overview](exploration/docs/bug-backlog.md#at-a-glance). KUP-037 parks the free-only collection-count scope; both modes agree, so it is not an M2a routing gate. |
| **CQL / search input** | `dal/adapters/elasticsearch/cql.ts`, `cql-query-edit.ts`, `CqlSearchInput.tsx`, `lazy-typeahead.ts`, `typeahead-fields.ts` |
| **Grid usage-search follow-up** | [Research and handoff](exploration/docs/grid-usage-search-investigation.md): PR #4957's last recorded status is awaiting human review/merge. Its independent negatives, positive same-record matching and print code/name support are P1 integration work; verify current merge state and inherited behavior before changing the prototype. GRID-001/008 remain accepted build limitations until integration, not gates on other units. |
| **Scala / media-api review conventions** | [Reference section 16](exploration/docs/03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/media-api-90-conventions.md#16-reviewable-scala-recent-pr-evidence) and [instruction summary](exploration/docs/03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/media-api-91-instructions-for-agents.md). Tom/Andrew foundation with bounded Lindsey evidence; open versus merged status and review attribution are explicit. The local instruction mirror is synchronized. |
| **AI search** | `AiSearchInput.tsx`, `bedrock-proxy-client.ts`, `scripts/bedrock-embed-proxy.mjs`, `ai-search-params.ts`, `search-store.ts` (AI branch), `es-adapter.ts` (direct `searchByAi`), `grid-api-search-adapter.ts` (`apiSearchByAi`), `grid-api-instance.ts` (`apiAiSearchAvailable`); [post-U6z convergence workplan](exploration/docs/ai-search-catching-up-workplan.md). U9-A is committed (`804ca1191`; PR notes in workplan section 12) and U9-B is built; team review gates Scala merge/PROD. The additive controller-local `aiQuery` contract preserves absent-param Kahuna behavior; U9-C shared MLT remains deferred. |
| **Sort system** | `dal/adapters/elasticsearch/sort-builders.ts`, `search-store.ts` (sort-around-focus), `field-registry.tsx`, `exploration/docs/zz Archive/scroll-and-position-preservation-testing-4.2.1-obscure-sorting-decision.md` |
| **Table view** | `ImageTable.tsx`, `useDataWindow.ts`, `ColumnContextMenu.tsx`, `column-store.ts`, `field-registry.tsx` |
| **Grid view** | `ImageGrid.tsx`, `useDataWindow.ts`, `image-urls.ts` |
| **Keyboard navigation** | `useListNavigation.ts`, `CqlSearchInput.tsx` (keysToPropagate), `keyboard-shortcuts.ts`, `keyboard-navigation.md`, `e2e/local/keyboard-nav.spec.ts` |
| **Position-engine cleanup** | [L7 ledger](exploration/docs/not-yet-another-audit-ledger.md): 38 cases. L8 ordinary search/sort handoff and B6 are delivered with independent review repairs and final local gates. `lib/search-continuity.ts` carries target/placement/focus through existing ownership; AI/history retain compatibility. B18/L40 is an unrepaired pending-seek/density presentation gap: thumb rollback and a third visible neighbourhood despite correct final arrival. No repair unit is selected. B8/L37/B17 evidence limits remain; Q1/Q2/Q7 and no-bookmark AI exit L39 remain separate. [Prompt](exploration/docs/not-yet-another-audit-prompt.md) owns characterisation; 02 is the contract guide. |
| **Focus / phantom focus / position preservation** | `02-focus-and-position-preservation.md` (source-derived behaviour map; ledger items marked *(Lx)*), `search-store.ts` (focusedImageId, sortAroundFocus), `ui-prefs-store.ts` (focusMode), `useDataWindow.ts` (viewportAnchor), `useScrollEffects.ts` (DensityFocusState), `useListNavigation.ts`, `useUrlSearchSync.ts` (sort-around-focus wiring) |
| **Image detail / fullscreen / zoom** | `ImageDetail.tsx` and its mounted identity tests, `FullscreenPreview.tsx`, `lib/fullscreen-exit.ts`, `usePinchZoom.ts`, `image-prefetch.ts`, `image-offset-cache.ts`, `useReturnFromDetail.ts` |
| **Panels / facets / metadata** | `PanelLayout.tsx`, `FacetFilters.tsx`, `ImageMetadata.tsx`, `panel-store.ts` |
| **URL / routing** | `search-params-schema.ts`, `useUrlSearchSync.ts`, `router.ts`, `routes/search.tsx`, `home-defaults.ts` |
| **Browser history** | `04-browser-history-architecture.md`, `lib/orchestration/history-key.ts`, `lib/history-snapshot.ts`, `lib/build-history-snapshot.ts`, `useUrlSearchSync.ts` (popstate restore), `useReturnFromDetail.ts` (detail-entry identity), `search-store.ts` (DEV-only search lifecycle generation), `e2e/local/browser-history.spec.ts` |
| **Deferred navigation ownership** | [Earlier navigation repairs](exploration/docs/bug-reproduction-evidence.md#bounded-ux-repairs-kup-014015016019), [focus/geometry repairs](exploration/docs/bug-reproduction-evidence.md#bounded-focus-repairs-kup-013017018027) and the [reverse-edge follow-up](exploration/docs/bug-reproduction-evidence.md#kup-013-reverse-edge-follow-up-repair) retain distinct lifetimes. End permission and latest Home/End edge ownership, saved-density restore, original detail return and cross-preview centering are bounded repairs, not one epoch. No-saved density fallback, pre-native-entry timing and physical Esc/macOS animation remain uncertified. Same-exit latest-focus centering is valid. |
| **Field registry** | `field-registry.tsx` (33 static fields + config aliases) |
| **Selections (multi-image, S6 done)** | `stores/selection-store.ts`, `lib/interpretClick.ts`, `lib/reconcile.ts`, `components/Tickbox.tsx`, `hooks/useIsSelected.ts`, `hooks/useRangeSelection.ts`, `hooks/useLongPress.ts`, `lib/dispatchClickEffects.ts`, `lib/handleLongPressStart.ts`, `components/MultiImageMetadata.tsx`, `components/metadata-primitives.tsx`, `components/MultiValue.tsx`, `components/SelectionFab.tsx`, `components/ToastContainer.tsx`, `hooks/useToast.ts`, `stores/toast-store.ts`, `exploration/docs/00 Architecture and philosophy/05-selections.md`, `exploration/docs/00 Architecture and philosophy/field-catalogue.md` |
| **Collections panel** | `stores/collection-store.ts`, `components/CollectionTree.tsx`, `exploration/docs/00 Architecture and philosophy/06-collections.md`, `dal/adapters/elasticsearch/cql.ts` (`~` shorthand already present), `lib/typeahead-fields.ts` (collection resolver) |
| **Testing** | `e2e/README.md` (comprehensive reference), `e2e/shared/helpers.ts`, `playwright.config.ts` |
| **Special-date ES oracle** | `integration/special-sort-es.test.ts`, `vitest.special-sort-es.config.ts`, archived obscure-sorting workplan | Opt-in local-ES mutation test. Run after changing special sort clauses, reverse pagination, cursor extraction, position maps, date distributions, `countBefore`, relevant mappings, or Elasticsearch version. Never habitual. |
| **Performance** | `e2e-perf/README.md` (authoritative harness reference), `e2e-perf/results/audit-graphs.html` (jank dashboard), `e2e-perf/results/perceived-graphs.html` (perceived-perf dashboard) |
| **Perceived performance** | `lib/perceived-trace.ts`, `e2e-perf/perceived-short.spec.ts` (single-action), `e2e-perf/perceived-long.spec.ts` (multi-step journeys), `e2e-perf/results/perceived-{log,graphs}.{json,js,md,html}` |
| **Architecture / philosophy** | `exploration/docs/00 Architecture and philosophy/`, `component-detail.md` |

## Current Phase: Phase 3 — Hybrid ES + media-api (in progress)

**Current snapshot: 3 October 2026.** B8/L37 and B17 pending-browse/density are repaired;
the cold-review follow-up preserves query discovery through navigation/replacement,
keeps AI results finite and captures Scrubber-wheel intent. Full local gates pass in
both click modes; paired live checks belong to the earlier B17 checkpoint, not this
follow-up. Pending destinations survive density; settled layout policy is unchanged.
The first ordinary search/sort handoff and B6 are delivered with independent review
repairs and full local gates. Later structural work needs its own scope decision.
Operator policy is revisable, not a wider rewrite mandate.
U1-U5 and U6a-d are built; M1 is operator-accepted.
U6z is complete with tests only; the operator reported a clean cold review. U9-A is committed
locally (`804ca1191`); U9-B is committed locally (`887814ccc`; cold review accepted with fixes). U10-A's
source-only characterization is complete; U10-B's narrow lazy-fallback derivation is built locally
(cold review accepted with fixes). U8 and M2a are complete; U9-C remains deferred and U7 is next.
The [API build plan](exploration/docs/03%20Ce%20n'est%20pas%20une%20pipe%20dream/api-build/api-build-00-plan.md)
owns the sequence, decisions and endpoint contracts. Its progress log and the changelog retain
implementation history; older candidate/research gates do not override it.

**Working paths:** `--use-media-api` uses locally modified media-api against TEST ES via tunnel.
`--use-deployed-media-api` uses the allowlisted absolute TEST API base with the TEST-domain cookie,
retains local `/s3`/`/imgproxy` delivery, and bypasses Vite's Grid API write guard by explicit
temporary measurement decision. This is not a permanent ingress/read-only guarantee.
`ApiDataSource` routes pages/window, rank, profiles, keys/maps/ranges, counts/tickers, aggregations,
standalone detail and selection hydration through it. The new POST reads live in
`ImageQueryController`; detail reuses `GET /images/:id`. Selection and collections use the app's
datasource. These migrated methods never fall back to ES. API mode opens no PIT; existing
direct-ES/local modes and their PIT behavior remain supported.

**AI search in API mode (U9-B):** one `GET /api/images` with `useAISearch=true` and a separate
`aiQuery`; no browser Bedrock or ES call, and no ES datasource is constructed. Capability comes
from the root `ai-search` link. Direct mode keeps Bedrock plus ES KNN. Both modes publish the
prefilter pool total and tickers with the hits. See the
[AI workplan](exploration/docs/ai-search-catching-up-workplan.md) for the owning compatibility
contract; team review still gates Scala merge/PROD and U9-C MLT remains deferred. U6z verified non-AI API coverage, cold startup,
first CQL registration/remounts and recovery. Full local gates, bounded API browser workflows and
operator API preflights passed; no production change or zero-ES-construction requirement followed.

**Boundaries:** keep browsing/position/traversal contracts, authoritative tuples, useful limits,
authorization and accepted approximations. KUP-029's independent ordinary-path premise is refuted;
KUP-030's same-ID AI overlay retention is closed by U9-B's replace-on-publish enrichment.
No enrichment repair is bundled with transport verification. PR #4957 integration is parallel unit P1, not
a pause on API work; GRID-001/008 limitations remain until integration. PR #4849 is abandoned;
its legacy GET changes were removed. Index migrations are unsupported, PIT endpoints deferred
to evidence-driven L1, and stronger snapshots/storage are not migration prerequisites.

### System Summary

| System | Key entry points | What it does |
|---|---|---|
| DAL | `dal/types.ts`, `es-adapter.ts`, `dal/api-data-source.ts`, `dal/index.ts` | `ImageDataSource` interface (17 methods, 5 optional; nullable `openPit`; optional `offsetReadLimit`). Factory selects API or direct ES and constructs only the selected datasource. API mode sends every read, AI included, through `grid-api-search-adapter.ts`; the base stays local `/api` unless only `--use-deployed-media-api` selects TEST. Client walk loops remain and there is no ES fallback. Selection/collections share the app datasource. API mget uses 200-ID chunks/four in flight; standalone lookup returns image plus optional enrichment. Non-local ES write protection remains. Date tuples use epoch ms, source fields ISO. |
| Store | `stores/search-store.ts` | Windowed buffer (max 1000) shared by all three scroll tiers (KAD #2). Seek/extend/evict, PIT lifecycle, sort-around-focus, maps and aggregations. Restore uses current-query total and one selected tuple for rank/pages; saved-rank/lookup stays parallel, with one conditional extra rank. Centred reads cap/trim predecessors. Initial discovery, browsing and maintenance have distinct owners: `_browseNavigation` retains queued/loading/ready destinations across density; navigation retires initial placement but inherits existing count/page discovery, including cursor/focus replacements and owned fallback. AI excludes ordinary window paths. Busy cleanup is owner-checked; fill and focus resolution retain their lifetimes. A short null-tail page gets one bounded valued-end read before atomic prepend. Keyword seeks skip invalid primary percentiles; distribution reads coalesce by scope. Committed tuples remain in `lib/image-offset-cache.ts`. |
| Data Window | `hooks/useDataWindow.ts` | Buffer↔view bridge. Two hook modes: **normal** (buffer-local indices — serves scroll tier ≤1k and seek tier >65k) and **two-tier** (global indices, skeleton cells — serves indexed tier 1k–65k). Visible-neighbour lookup uses that same total-based predicate, independently of map readiness. User input queues a store-owned destination; layout-only refills retain view-owned debounce. Viewport anchor tracking for density-focus and sort-around-focus. |
| Scroll & Scrubber | `hooks/useScrollEffects.ts`, `components/Scrubber.tsx`, `lib/sort-context.ts` | Shared scroll lifecycle (seek, prepend compensation, density-focus, swimming prevention). Small first-page sort clamps retain placement across fill growth unless newer focus, scroll or navigation supersedes it. Prepend compensation only in scroll/seek tiers — indexed tier replaces items at fixed global positions (no swimming). Scrubber: three modes matching the three tiers (see KAD #2). Null-zone support, tick density map memoized by consumed buffer/distribution identities. |
| Collections | `stores/collection-store.ts`, `components/CollectionTree.tsx` | Collection tree from port 9010. Graceful-absent when service unavailable. Subtree counts from an aggregation on the app's data source (media-api in API mode). Click → `collection:pathId` in CQL query. Auto-sort to `dateAddedToCollection`. |
| Field Registry | `lib/field-registry.tsx` | Single source of truth for all image fields (33 static + config aliases). Drives table columns, sort, filters, detail panel, multi-image panel. `multiSelectBehaviour`, `detailLayout`, `pillVariant`. |
| URL & Routing | `hooks/useUrlSearchSync.ts`, `lib/search-continuity.ts`, `lib/search-params-schema.ts`, `router.ts`, `lib/orchestration/history-key.ts`, `lib/history-snapshot.ts` | URL = single source of truth. Ordinary search/sort consumes a pre-passive target/placement/focus capture; the store binds its existing owner and publishes a resolved record for one-shot placement. Selected sort retains focus even at equal identity. AI/history keep legacy compatibility. Selection clear-on-navigation and `kupuaKey` snapshots/dedupe bookkeeping remain; detail entries retain immutable entry-image identity. |
| CQL | `dal/adapters/elasticsearch/cql.ts`, `CqlSearchInput.tsx` | `@guardian/cql` Web Component + CQL→ES translator. Has predicates/facets share configured-alias resolution. Registered and dotted-field typeahead share literal-safe AST self-exclusion and cancellation; live store getters survive wrapper remounts. `is:` enriches suggestions from ticker, category and cold aggregation counts. Datasource remains first-registration-bound. |
| Selection | `stores/selection-store.ts`, `lib/interpretClick.ts`, `lib/reconcile.ts`, `hooks/useRangeSelection.ts` | Set-based membership, unique deltas, revision-tracked mutable LRU, synchronous cached updates and coalesced idle reconciliation. Hydration repairs omissions/anchor/toast only for its captured Set/anchor; late metadata remains reusable. Pending ranges own publication/busy state and cancel on membership/anchor/query/order changes or unmount, not metadata/display updates. Selection survives sort/detail/density. Panel coherence, retained cursor fallback and grid anchor placement remain intact. |
| Enrichment | `lib/cost/`, `stores/enrichment-store.ts`, `lib/derive-enriched-image.ts`, `lib/syndication/` | `deriveImage()` merges baseline inputs, TS-derived policy and optional server overlay. Committed API pages populate the shared enrichment store; standalone ImageDetail owns its requested-ID-bound overlay and passes it to ImageMetadata. Ordinary API baseline/overlay rights share one entity, refuting independent KUP-029 reachability. Accepted AI publication replaces the enrichment map with the result's own (API overlay, or empty in direct mode/absence), closing KUP-030. Selection mget supplies no overlay. |
| AI Search | `components/AiSearchInput.tsx`, `lib/bedrock-proxy-client.ts`, `lib/ai-search-params.ts`, `scripts/bedrock-embed-proxy.mjs`, `dal/grid-api-search-adapter.ts` (`apiSearchByAi`) | Direct: Bedrock KNN, dev-only proxy/health gate. API: media-api `aiQuery`, root `ai-search` capability; failure is quiet empty absence. `?aiQuery=`. All ≤200 hits stay in memory without PIT/pagination; pool total/tickers arrive with them. Completion honors current same-query sort. Known-empty membership publishes empty counts/facets without requests and invalidates pending base work; expanded facets have single-request field/scope ownership. |
| Orchestration | `lib/orchestration/search.ts`, `lib/reset-to-home.ts` | Imperative coordination: debounce, shared CQL/AI typing-entry creation with predecessor capture and fresh keys, scroll-reset, go-home, fullscreen preview registration. Prevents components from reimplementing coordination logic. |

> Full component inventory (views, gesture hooks, panels, toast, etc.): `exploration/docs/00 Architecture and philosophy/component-detail.md`

### Testing Summary

- **2580 Vitest unit/integration tests across 82 files** -- `npm --prefix kupua test`
- **Build gate** -- `npm --prefix kupua run build` (TypeScript plus Vite; editor diagnostics alone are insufficient)
- **1 opt-in special-sort ES oracle** -- `KUPUA_LOCAL_ES_MUTATION_OK=1 npm --prefix kupua run test:special-sort-es` (local loopback 9220 only; never habitual)
- **352 Playwright E2E** cases (~5min, 3 workers) -- `npm --prefix kupua run test:e2e`; final acceptance passed with retries disabled
- **9 forced-seek habitual cases** — isolated port-3030 project inside `npm run test:e2e`; eight B17 density cases plus the core journey
- **22 jank perf tests / 33 metric IDs** + experiment infrastructure — `npm run test:perf`. P13c measures non-resident detail with warm media; P14 guards zero image-hydration reads. Both dashboards show these shared audit records; live two-mode preflight remains operator-run.
- **99 perf-harness validation tests** — `npm run test:perf-harness` (pure Node; no browser). What they enforce:
  - *Static polling/deadline checks* — reject async predicates and misplaced or extra wait arguments.
  - *Long-journey exact-search readiness* — actual observer tests at 60/120/240 Hz, elapsed deadlines, unchanged context/geometry guards and sanitized step-specific failures; no refresh-rate-dependent cutoff.
  - *Evidence contracts* — each rejects invalid evidence of its kind: numeric values, totals, route, regime, revision, cache state, completion boundary, named-measure aggregation, correlated-phase chronology.
  - *Dashboards* — keep missing values as gaps, hide stale client-only store timings, show qualified API-direct deltas, separate incomparable evidence.
  - *Runner* — records full-dirty and generated-history-independent app-source hashes; single-run threshold crossings are watchpoints, not failures.
  - *Revisions* — P5c/P13a-b/P15 are revision 3; P13c revision 2 records bounded development Strict Mode replay. Earlier-revision records remain separate.
- **Retired smoke surface** — 57 direct-config/29 menu cases removed after elected evidence moved or was explicitly dropped
- **15 perceived-perf short tests** against TEST cluster — `node e2e-perf/run-audit.mjs --short-perceived-only --label "..."` (manual, real ES required)
- **2 opt-in restore diagnostics** in the short spec, excluded from campaign history; unchanged existing PP contracts. See the reproduction evidence for setup, accepted cost and limitations.
- **2 perceived-perf long tests (journeys JA + JB, 8 steps total)** against TEST cluster — `node e2e-perf/run-audit.mjs --long-perceived-only --label "..."` (manual, real ES required)
- Full reference: **`e2e/README.md`** (test modes, decision tree, env vars)
- Logging/observability: use `devLog()` and DEV-only window signals (including `__kupua_getSearchLifecycle__`) for E2E; production builds DCE them

## Design Documents

| Doc | Path | Summary |
|---|---|---|
| Frontend philosophy | `exploration/docs/00 Architecture and philosophy/01-frontend-philosophy.md` | Density continuum, "Never Lost", click-to-search |
| Focus & position preservation | `exploration/docs/00 Architecture and philosophy/02-focus-and-position-preservation.md` | Anchors, relaxations, engine map (tiers, store signals, placement), transitions |
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
| Runtime configuration and data | `exploration/docs/runtime-configuration-and-data-sources.md` | U10-A post-U9 evidence; U10-B selects B1 lazy fallback only, under the build plan's unit note. Ticker/copy/config/selection proposals remain future decisions, not the executor's scope. M2a checklist retained. |
| Current migration direction | [API build plan](exploration/docs/03%20Ce%20n'est%20pas%20une%20pipe%20dream/api-build/api-build-00-plan.md) | Active sequence and operator decisions; candidate 11 is background with explicit overrides. P1, U7 and AI remain separately scoped. |
| Historical integration workplan | `exploration/docs/03 Ce n'est pas une pipe dream/integration-workplan-bread-and-butter.md` | Historical integration design; current routing is the media-api index and candidate 11. |
| Historical API-first architecture | `exploration/docs/03 Ce n'est pas une pipe dream/integration-plan-api-first.md` | Historical integration design; current routing is the media-api index and candidate 11. |
| Enrichment strategy | `exploration/docs/00 Architecture and philosophy/enrichment-strategy.md` | ES-baseline + Grid API optional enrichment |
| AI search | `exploration/docs/00 Architecture and philosophy/08-ai-search.md` | KNN semantic search: Bedrock proxy, store branch, UI widget, sort handling, aggregation scoping |
| Embedded browser playbook | `exploration/docs/embedded-browser-playbook.md` | Mode checks, shared-preference preservation, bounded live probes and cleanup. Read before, append after, any browser session |
| Changelog | `exploration/docs/changelog.md` | Full development history |

> Archived workplans, audits, and handoffs: `exploration/docs/zz Archive/`. Docs inventory: `exploration/docs/docs-inventory-2026-05-07.md`.

## Stable Test Corpora (TEST cluster, pinned via `until`)

Totals are examples, not immutable assertions: the date cap does not freeze metadata or deletions.
The two-tier and seek totals below were observed on 17 September 2026.

| Mode | Total | URL search params |
|---|---|---|
| Scroll (<1k) | 958 | `nonFree=true&query=keyword:"mid length half celebration"&until=2026-03-04T00:00:00Z` |
| Two-tier (1k–65k) | 13,260 | `nonFree=true&until=2026-03-04T00:00:00Z&query=city:Dublin` |
| Seek (>65k) | 1,228,619 | `nonFree=true&until=2026-03-04T00:00:00Z` |

## Tech Stack

| Concern | Choice |
|---|---|
| UI | React 19 + TypeScript |
| Table | TanStack Table v8 + TanStack Virtual |
| State | Zustand |
| Routing | TanStack Router (Zod-validated search params) |
| Styling | Tailwind CSS 4 |
| Build | Vite 8 (Rolldown) |
| Data Layer | `ImageDataSource` interface → `ApiDataSource` / `ElasticsearchDataSource` |
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

3. **DAL interface** — `ImageDataSource` with 17 methods (5 optional). `ApiDataSource` sends every read, AI included, through media-api; API mode constructs no ES datasource (U9-B). Selection and the collection store take the app's data source. `GridApiDataSource.getImageDetail` is unused (U6a owns standalone detail). Write protection on non-local ES.

4. **URL is single source of truth** — `useUpdateSearchParams` → URL → `useUrlSearchSync` → store → search. Custom `URLSearchParams` serialisation (not TanStack's, which coerces `"true"` → boolean).

5. **Routes match kahuna** — `/search?query=...`, `/images/:imageId`, `/` → `/search?nonFree=true`. Full param list: `query`, `ids`, `since`, `until`, `nonFree`, `payType`, `uploadedBy`, `orderBy`, `aiQuery`, `useAISearch`, `dateField`, `takenSince`, `takenUntil`, `modifiedSince`, `modifiedUntil`, `hasRightsAcquired`, `hasCrops`, `syndicationStatus`, `persisted`, `expandPinboard`, `pinboardId`, `pinboardItemId`, `image` (display-only), `density` (display-only).

6. **Field Definition Registry** — `field-registry.tsx`: single source of truth for identity, data access, search, sort, display, detail hints, type metadata. Config-driven aliases. Drives all UI surfaces.

7. **Image detail is an overlay** — renders within search route (`opacity-0 pointer-events-none`). Scroll/virtualizer state preserved underneath. Standalone data/absence/loading are requested-ID-bound before rendering; the detail shell stays mounted through pending/absent identities. Media failure/events belong to the current image lifetime; one URL-normalized thumbnail fallback terminates in unavailable presentation. Cached-cursor restoration is guarded per image, not for the overlay's lifetime.

8. **One semantic sort** — ordinary search accepts one recognised `orderBy` token plus automatic `uploadTime` and unique `id` suffixes. Comma URLs retain only a valid first token. AI allows Relevance/Uploaded only; collection filters exclude AI. Special-date null boundaries, maps, ranks, ranges and restore are exact; populated histogram evidence is explicitly approximate presentation only. Bounded keyword distributions separate exact valued-document coverage from represented bucket coverage, so truncation never implies a null zone.

9. **CSS containment** — `contain: strict` on `.hide-scrollbar`. Critical for Firefox. Horizontal scrollbar is a proxy div.

10. **Separate infrastructure** — Docker ES on port 9220, scripts in `kupua/scripts/`, sample data (115MB) not in git.

11. **TanStack Table column ID caveat** — dot-path accessors get dots→underscores in IDs. Maps keyed by column ID must use underscores.

12. **Two-tier virtualisation (indexed scroll tier)** — `twoTier` is derived from total range (not `positionMap !== null`) so the coordinate space is stable from frame 1. Position map is a background perf optimisation (faster seeks), not a coordinate-space decision. `search()` invalidates the map; `seek()` preserves it.

## Known Issues

- **Pending seek/density presentation (B18/L40)** — the thumb returns to start before end, while the new view exposes the beginning of the departure buffer as a third neighbourhood. Confirmed in both media-api seek-tier density directions; no-density control preserves start/end. Source paths predate L8, but the old app was not replayed. See the [ledger](exploration/docs/not-yet-another-audit-ledger.md#b18); no repair implemented.
- **Intermittent P1 post-report hang** — unresolved. The operator closed the tab to release one stalled run; Playwright's subsequent green status does not establish unattended completion. Campaign reports now include automatic cleanup-stage diagnostics via `e2e-perf/teardown-reporter.mjs`; capture the next hung stage before changing app behavior. The separate PP1 refresh-rate-dependent deadline is fixed.
- **Width/Height sort mismatch** — the UI displays oriented dimensions with raw fallback, but sorting uses raw dimensions. A request-time coalescing field was about 2.2× slower at the median on TEST and would need duplication across every positional query path. Prefer canonical backend `effectiveWidth`/`effectiveHeight` fields; see `exploration/docs/materialized-scalars-for-lastUsed-lastAddedToCollection.md` §5.
- **P8 table fast-scroll jank** — the four-run TEST baseline measured 207ms max frame, 59ms p95, 91 severe frames/1k, 121,576 DOM mutations and 1,877ms LoAF blocking. It is the clearest rendering-perf target, but much churn is structural and prior broad scroll fixes regressed behavior. Investigate narrowly from the maintained P8 metric.

## Backlog (architectural)

- **SearchContext abstraction** — archived design reference, not an approved prerequisite for U6z or AI migration. The [AI compatibility workplan](exploration/docs/ai-search-catching-up-workplan.md) discusses smaller alternatives; any ranking/result-scope redesign needs separate agreement.
- **Deferred audit candidates** — F1 prefetch/inactive-preview work and S4 large-selection cache reads need profiling; R1 is optional display-only cleanup. See the [archived dispositions](exploration/docs/zz%20Archive/performance-first-dry-consolidation-audit-2026-09-13.md#independent-candidates). No new batch is selected.