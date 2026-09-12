# Kupua Dead and Stray Code Hunt

**Status:** Complete — all 37 actionable entries executed
**Date:** 11 September 2026
**Executed:** 12 September 2026
**Audited revision:** `29efda5553bdffffa1130d88f4920d1dae1bc86c`
**Deliverable:** Current-tree evidence and a safe workplan for later removal agents

## 0. Decision and conclusion

This audit answers one question:

> What can Kupua remove now without destabilising the working direct-Elasticsearch
> application or deleting an intentional part of the media-api migration?

The premise is valid, but the result is not a broad abandoned-code graveyard. The
April and May audits already removed most obvious unused files and exports. Kupua's
subsequent growth created a different residue profile:

- small unreachable branches and return fields inside live modules;
- copied tests that exercise local replicas rather than production code;
- old experiment scripts and active documentation for retired harnesses;
- DAL contract members left behind by method fusion;
- a legacy Grid API island whose ownership now conflicts with the D9 Strangler plan;
- currently unused APIs that are intentional migration reserves rather than dead code.

This report contains **37 actionable entries**. Most are small; copied test suites
account for the majority of removable lines. The report deliberately leaves API
narrowing, product-policy choices, safety-guard changes and migration ownership in
decision sections instead of presenting them as deletion work.

Execution removed all 37 actionable entries. Decision gates, migration reserves and
refuted/live surfaces remain untouched. The final tree passed 1,223 unit tests, the
production build, 35 performance-harness tests and 206 habitual Playwright tests.
Focused checks passed throughout; source diagnostics and `git diff --check` were
clean. No performance browser suite or live TEST/media-api system was run.

### 0.1 Execution ledger

| Status | IDs |
|---|---|
| `DONE` | P01–P14 |
| `DONE` | D01–D06 |
| `DONE` | T01–T17 |
| `PRESERVED` | Q01–Q16 decision gates |
| `PRESERVED` | All Section 5 migration reserves and Section 6 live traps |

## 1. Safety model

### 1.1 Classifications

| Class | Meaning | Executor authority |
|---|---|---|
| `DELETE-NOW` | No current producer, consumer or supported indirect root survived adversarial review. | May remove after revalidation. |
| `DELETE-ATOMIC` | Dead only when its code, tests, types, comments or callers move together. | May remove only as the stated boundary. |
| `DECISION` | Current reachability is absent, but removal changes a deliberate API, compatibility promise or product/debug policy. | Do not remove without a user decision. |
| `MIGRATION-RESERVE` | No current caller, but an exact active migration contract names the surface. | Do not remove until that contract is revised or completed. |
| `REFUTED/LIVE` | Looked suspicious and was proven live or intentionally test-only. | Preserve; this prevents repeat audits. |

`DELETE-NOW` does not mean "delete without looking." Kupua has grown since every
prior report. Before editing, the executor must repeat the candidate's exact symbol
and path searches. If a new caller exists, stop and reclassify the entry.

### 1.2 Runtime roots treated as live

Static import absence was never sufficient. The audit traced these roots:

| Root | Evidence | Consequence |
|---|---|---|
| React startup and side effects | [`main.tsx`](../../src/main.tsx#L15-L70) | Startup fetches, browser listeners and DEV globals count as consumers. |
| Explicit route tree | [`router.ts`](../../src/router.ts#L12-L20) | `/`, `/search` and `/images/:imageId` are roots even without file-based routing. |
| Local and TEST direct ES | [`dal/index.ts`](../../src/dal/index.ts#L27-L40) | Direct-ES algorithms and source fields remain live. |
| TEST media-api mode | [`strangler-adapter.ts`](../../src/dal/strangler-adapter.ts#L14-L65) | The Strangler delegates all but qualifying `searchAfter` calls to ES. |
| Vite middleware and proxies | [`vite.config.ts`](../../vite.config.ts#L13-L120) | Guards, proxy routes and plugin entry points are live outside the browser import graph. |
| Shell and Node entry points | [`package.json`](../../package.json#L10-L38), [`start.sh`](../../scripts/start.sh#L1-L28) | A script can be live through an npm command, documentation or direct operator use. |
| Unit, integration, E2E and perf configs | [`vite.config.ts`](../../vite.config.ts#L126-L132), [`playwright.config.ts`](../../playwright.config.ts#L20-L90) | Filename globs, Playwright projects and manual configs are roots. |
| Browser test/diagnostic globals | [`main.tsx`](../../src/main.tsx#L57-L65), [`search-store.ts`](../../src/stores/search-store.ts#L4164-L4188) | `window.__kupua_*` consumers were traced through E2E, perf and operator docs. |
| CSS, HTML and naming conventions | [`index.html`](../../index.html#L7), [`index.css`](../../src/index.css#L1-L35) | Dynamic classes, `toHaveScreenshot` names, font URLs and public assets count. |

### 1.3 Migration authority

Authority was applied in this order:

1. live code at the audited revision;
2. correction and status banners in the active Phase 3 findings and workplans;
3. current architecture and deviations documents;
4. archived plans as historical evidence only.

The post-D3 status banner says B2 method fusion is complete, D3 is shipped, D7-D9
are not shipped, and the A items remain unstarted
([`phase-3-minimal-gap-derivation-findings.md`](03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/phase-3-minimal-gap-derivation-findings.md#L14-L82)).
The D9 amendment also says D9 is not implementation-ready
([`phase-3-d7-d8-d9-workplan.md`](03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/phase-3-d7-d8-d9-workplan.md#L1-L14)).
Those facts constrain deletion below.

## 2. Methodology and coverage

Seven independent read-only discovery agents covered:

1. components, hooks, routes and UI reachability;
2. stores, orchestration, scroll, history and large-module internals;
3. direct-ES DAL methods, builders and contracts;
4. media-api, Strangler, enrichment and migration reserves;
5. unit, integration, E2E, perf and test-only production seams;
6. scripts, dependencies, configuration, CSS and assets;
7. Git history, abandoned experiments and both archived dead-code audits.

Three separate reviewers then tried to refute the deduplicated ledger:

- runtime reachability and dynamic/test consumers;
- migration ownership and active-plan authority;
- test, tooling, generated-file and manual-entry roots.

A finding appears in Section 3 only when it survived that challenge and a final
local triangulation. Contradicted findings were moved to Sections 4-6; the original
claim was not retained alongside its refutation.

The audit covered 542 tracked Kupua files at the pinned revision: 208 under `src`,
23 E2E, 26 perf, 9 scripts, 19 assets, 243 exploration documents and 14 other
files. Generated outputs and ignored local logs were excluded. A pre-existing
user modification to `package-lock.json` was left untouched.

## 3. Actionable inventory

Line links identify the audited revision. Executors must anchor on symbols and
surrounding behavior because line numbers will drift as earlier batches land.

### 3.1 Product runtime

| ID | Class | Candidate and proof | Exact removal boundary | Risk and focused check |
|---|---|---|---|---|
| P01 | `DELETE-ATOMIC` | `Tickbox.disabled` and `TableTickbox.disabled` only return `null` ([definition](../../src/components/Tickbox.tsx#L27-L40), [table variant](../../src/components/Tickbox.tsx#L84-L91)). Grid skeletons return before constructing a tickbox, and both live constructors omit the prop ([grid](../../src/components/ImageGrid.tsx#L220-L282), [table](../../src/components/ImageTable.tsx#L307-L315)). | Remove both props/guards, stale skeleton wording, and the disabled-only tests in [`Tickbox.test.tsx`](../../src/components/Tickbox.test.tsx#L49-L52). Preserve all selection behavior. | Low runtime risk. Run Tickbox units, then selection E2E. |
| P02 | `DELETE-ATOMIC` | `DataSearchPill.partial` has no caller; the sole table constructor omits it ([definition](../../src/components/SearchPill.tsx#L72-L100), [caller](../../src/components/ImageTable.tsx#L68-L78)). Real partial-chip behavior belongs to `MultiSearchPill` ([component](../../src/components/SearchPill.tsx#L102-L128), [consumer](../../src/components/MultiImageMetadata.tsx#L192-L220)). | Remove only the `DataSearchPill` prop, `data-partial` attribute and stale comments. Preserve `PILL_PARTIAL`, `MultiSearchPill.partial` and selection E2E. | Low, but names are easy to confuse. Run unit/build and the partial-chip E2E. |
| P03 | `DELETE-ATOMIC` | `useImageTraversal` returns `direction` and `pending`, maintains `directionRef`, and passes callback direction that both consumers ignore ([contract](../../src/hooks/useImageTraversal.ts#L63-L77), [callback](../../src/hooks/useImageTraversal.ts#L108-L113), [return](../../src/hooks/useImageTraversal.ts#L278-L285), [detail](../../src/components/ImageDetail.tsx#L292-L317), [preview](../../src/components/FullscreenPreview.tsx#L108-L122)). | Remove the two outward fields, `directionRef` and its writes, and the callback's unused direction argument. Preserve `pendingRef` resolution and the direction argument used by prefetch. | Medium because traversal is interaction-heavy. Run traversal units and full E2E. |
| P04 | `DELETE-NOW` | `TraversalSession.direction` is initialized and assigned but never read; live direction is passed directly to desired-set and burst helpers ([shape](../../src/lib/image-prefetch.ts#L159-L178), [update](../../src/lib/image-prefetch.ts#L260-L293)). | Remove only the session field, initializer and assignment. Do not remove direction-aware prefetch behavior. Prefer landing with P03. | Low if boundary is respected. Run image-prefetch units. |
| P05 | `DELETE-ATOMIC` | `useDataWindow` exposes `error`, `extendForward` and `extendBackward`, but no hook consumer reads them ([contract/subscriptions](../../src/hooks/useDataWindow.ts#L247-L320), [return](../../src/hooks/useDataWindow.ts#L491-L501), [grid](../../src/components/ImageGrid.tsx#L439-L445), [table](../../src/components/ImageTable.tsx#L509-L515), [detail](../../src/components/ImageDetail.tsx#L79-L80)). | Remove only the three outward fields and the now-unused `error` subscription. Preserve internal extend subscriptions used by `reportVisibleRange`, `loadMore`, store `error`, and `_resetForwardVelocity`. | Medium; a careless edit breaks scrolling. Run data-window units and full E2E. Suggest perceived-perf validation, but do not run it automatically. |
| P06 | `DELETE-ATOMIC` | `HistorySnapshot.anchorCursor` is captured, stored and forwarded but search consumes only `snapshotHints.anchorOffset` ([shape](../../src/lib/history-snapshot.ts#L18-L47), [builder](../../src/lib/build-history-snapshot.ts#L62-L107), [forwarder](../../src/hooks/useUrlSearchSync.ts#L244-L302), [consumer](../../src/stores/search-store.ts#L2275-L2283)). | Remove the field from snapshot and hint types, cursor extraction, forwarding, fixtures/assertions and current docs. Old session JSON may contain an extra field and should remain readable. Preserve `anchorOffset`, ratio, freeze time and both snapshot stores. | Medium-high due to browser history. Run history units and full browser-history E2E. Suggest perceived-perf validation. |
| P07 | `DELETE-ATOMIC` | Enrichment `loading`, `setLoading` and `getForImage` have only self-owning tests; production selects `data` directly. Derived `hasEnrichment` is returned but unread ([store](../../src/stores/enrichment-store.ts#L45-L93), [live hook](../../src/hooks/useEnrichedImage.ts#L16-L28), [derived field](../../src/lib/derive-enriched-image.ts#L57-L73), [assignment](../../src/lib/derive-enriched-image.ts#L115-L130)). | Remove those four members and only their tests/comments. **Preserve `setEnrichment`**: fresh search uses it to replace stale overlays ([search-store](../../src/stores/search-store.ts#L2328-L2345)). Preserve `upsertEnrichment`, data, overlay fields and commit-to-view ownership. | Medium because migration enrichment is live. Run enrichment, derive and API-adapter units plus full E2E. |
| P08 | `DELETE-ATOMIC` | `ScrollGeometry.isTable` is written by both views and never read; history uses `rowHeight` and `columns` ([shape](../../src/lib/scroll-geometry-ref.ts#L15-L30), [writer](../../src/hooks/useScrollEffects.ts#L143-L154), [consumer](../../src/lib/build-history-snapshot.ts#L91-L99)). | Remove it from both geometry types, defaults, grid/table hook arguments and test literals. Preserve every pixel/column/header value. | Medium because geometry drives restore. Run geometry/history units and full grid/table E2E. |
| P09 | `DELETE-NOW` | `startNewImagesPoll(skipInitialTick)` contains a false branch, but both callers pass `true` ([function](../../src/stores/search-store.ts#L675-L752), [normal caller](../../src/stores/search-store.ts#L2269-L2271), [AI caller](../../src/stores/search-store.ts#L2400-L2402)). | Remove the parameter, initial `tick()` branch, both arguments and obsolete comments. Preserve interval and visibility-triggered ticks. | Low-medium store change. Run ticker/search units and full E2E. |
| P10 | `DELETE-NOW` | `twoTierRef` in `useScrollEffects` is assigned but never read; direct `twoTier` guards remain live ([ref](../../src/hooks/useScrollEffects.ts#L330-L344), [live guards](../../src/hooks/useScrollEffects.ts#L416-L491)). | Delete only the ref declaration/assignment and stale claim. | Low, but hook change still requires units and E2E. |
| P11 | `DELETE-ATOMIC` | `SORT_KEY_ALIASES` is empty, so both lookups are identity operations ([map](../../src/lib/sort-context.ts#L113-L145), [uses](../../src/lib/sort-context.ts#L269-L274)). Current short names are direct keys, not aliases. | Remove the map and identity lookups; correct test wording that calls direct key `taken` an alias. Preserve sort mappings and labels. | Low. Run sort-context units. |
| P12 | `DELETE-ATOMIC` | Collection cancellation cannot fire: the `loading || ready` guard returns before controller rotation, and startup is the sole production caller ([store](../../src/stores/collection-store.ts#L118-L141), [startup](../../src/main.tsx#L24-L30)). | Remove the module controller, abort/new calls and signal argument together. Preserve graceful absence, loading/ready guards and fetch behavior. | Medium store/API-absence path. Run collection units and full E2E. |
| P13 | `DELETE-NOW` | `LruMap.delete`, `size` and `values` have no named production or test caller; selection uses `get`, `set` and `has` ([implementation](../../src/stores/selection-store.ts#L50-L96), [live cache paths](../../src/stores/selection-store.ts#L458-L622)). | Remove only the three methods. Preserve the cache, capacity, ordering and `addGroup`/`removeGroup`. | Low. Run selection units and full E2E because a store is touched. |
| P14 | `DELETE-ATOMIC` | Direct-ES `_source` asks for raw `cost`, `valid`, `invalidReasons`, `actions` and `collections.description` ([projection](../../src/dal/es-config.ts#L115-L138)). The first four are not `Image` fields and `deriveImage` computes/overwrites them; collection UI uses path/pathId ([image type](../../src/types/image.ts#L132-L183), [derivation](../../src/lib/derive-enriched-image.ts#L101-L134), [grid collection use](../../src/components/ImageGrid.tsx#L330-L345)). Media-api enrichment uses a separate overlay ([adapter](../../src/dal/grid-api-search-adapter.ts#L60-L79)). | Remove only those five direct-ES projection entries and stale claims. Preserve `usageRights`, leases, usages, API overlay fields, `syndicationRights.isInferred`, collection path/pathId/action date and graphic-warning metadata. | High relative to other findings. One executor, one change. Run adapter/cost/collection units, build and full local E2E. Do not validate against real ES without explicit permission. |

### 3.2 DAL and query contracts

| ID | Class | Candidate and proof | Exact removal boundary | Risk and focused check |
|---|---|---|---|---|
| D01 | `DELETE-ATOMIC` | `ImageDataSource.search()` has no production caller; bootstrap uses first-page `searchAfter` ([interface](../../src/dal/types.ts#L269-L273), [ES wrapper](../../src/dal/es-adapter.ts#L684-L690), [store](../../src/stores/search-store.ts#L2189-L2205), [contract-only tests](../../src/dal/dal-contract.test.ts#L10-L29)). B2 is marked complete in the active status banner. | Remove interface member, ES/Strangler/mock wrappers and `search` contract tests. Rehome any mock implementation needed by `searchRange`; do not remove `searchRange` or `SearchResult` in this batch. | Medium contract change. Run DAL/store units and build immediately after the edit. |
| D02 | `DELETE-ATOMIC` | `SearchParams.countAll` has no reader; `apiSearchAfter` derives its wire `countAll` independently ([type](../../src/dal/types.ts#L73-L82), [wire body](../../src/dal/grid-api-search-adapter.ts#L98-L107), [cache stripping](../../src/lib/image-offset-cache.ts#L32-L40)). | Remove only the DAL input member, cache strip/comment and its test. Preserve the media-api request field. | Low. Run image-offset-cache and API-adapter units. |
| D03 | `DELETE-NOW` | `SearchResult.tickerCounts` has no producer/reader; live ticker data has its own `CountWithTickersResult` ([legacy field](../../src/dal/types.ts#L85-L108), [live result](../../src/dal/types.ts#L124-L133)). | Remove the optional property and misleading comment. Do not touch ticker polling or any future AI result design. | Low; typecheck/build and DAL units. |
| D04 | `DELETE-ATOMIC` | `IdRangeResult.fetchDuration` is produced but never read; the caller measures elapsed time independently, and active D2 specifies IDs/truncation/walked ([type](../../src/dal/types.ts#L251-L267), [producer](../../src/dal/es-adapter.ts#L2310-L2325), [caller](../../src/hooks/useRangeSelection.ts#L219-L276)). | Remove the field and all assignments. Preserve `walked`, `truncated`, IDs and caller timing. | Medium range-selection path. Run DAL/range units and full selection E2E. |
| D05 | `DELETE-ATOMIC` | `SOURCE_EXCLUDES` is permanently empty and guards two false spread branches ([constant](../../src/dal/es-config.ts#L24-L34), [search use](../../src/dal/es-adapter.ts#L989-L1000), [AI use](../../src/dal/es-adapter.ts#L1250-L1260)). | Remove export/import, conditions and empty spreads; update the stale embedding comment in [`grid-api/types.ts`](../../src/dal/grid-api/types.ts#L326-L333) to say the field is absent from `SOURCE_INCLUDES`. Preserve `SOURCE_INCLUDES` exactly. | Low mechanical query-body cleanup. Run adapter units and build. |
| D06 | `DELETE-ATOMIC` | Both DAL CQL parser instances set `groups:false`, so their `CqlGroup` branches cannot be emitted ([query parser/branch](../../src/dal/adapters/elasticsearch/cql.ts#L24-L34), [translator branch](../../src/dal/adapters/elasticsearch/cql.ts#L465-L480), [edit parser](../../src/dal/adapters/elasticsearch/cql-query-edit.ts#L20-L34), [term collector](../../src/dal/adapters/elasticsearch/cql-query-edit.ts#L238-L251), [facet collector](../../src/dal/adapters/elasticsearch/cql-query-edit.ts#L303-L318)). | Remove all DAL group cases and narrow the local parser-result types. Preserve parentheses-as-string behavior, every field/value branch, and the separate live group serializer in [`cql-ast-serialize.ts`](../../src/lib/cql-ast-serialize.ts#L48-L73). | Medium parser contract. Run all CQL/query-edit units and build. |

### 3.3 Tests, tooling, CSS and active documentation

| ID | Class | Candidate and proof | Exact removal boundary | Risk and focused check |
|---|---|---|---|---|
| T01 | `DELETE-ATOMIC` | [`debug-scroll.mjs`](../../scripts/debug-scroll.mjs#L1-L37) has no script, config or documentation root and implements an obsolete fixed buffer-fill probe. | Delete the file. | Residual private-manual-use risk only. Re-run filename search. |
| T02 | `DELETE-ATOMIC` | [`run-overscan-experiment.sh`](../../scripts/run-overscan-experiment.sh#L21-L75) aborts unless table overscan is `5`; production is `15` ([ImageTable](../../src/components/ImageTable.tsx#L735)). The maintained experiment spec remains live. | Delete only the broken wrapper. Preserve experiment config/spec/results. | Low. Re-run path search and ensure experiment discovery still works when that surface is next run. |
| T03 | `DELETE-NOW` | `s3-proxy.mjs` computes unused `prefix`; `dirPrefix` is the live key path ([function](../../scripts/s3-proxy.mjs#L85-L105)). | Remove the dead local and obsolete paired-character comment. Preserve proxy, route and AWS code. | Low. `node --check`. |
| T04 | `DELETE-NOW` | `ALL_LABELS` is initialized/appended and never read ([declaration/use](../../scripts/bench-formats.sh#L202-L233)). | Remove both statements only. | Low. `bash -n`. |
| T05 | `DELETE-NOW` | `--color-grid-placeholder`, `--color-grid-accent-shadow` and `--color-grid-error-dark` occur only in the theme declaration ([CSS](../../src/index.css#L20-L35)). | Remove only the three variables. | Low. Exact-name search and build. |
| T06 | `DELETE-NOW` | [`results/.gitkeep`](../../e2e-perf/results/.gitkeep#L1-L2) is obsolete because the directory has tracked logs, dashboards and its own `.gitignore`. | Delete `.gitkeep` only. | None. Verify tracked children remain. |
| T07 | `DELETE-ATOMIC` | `EXPERIMENT_LOG`/`appendToLog` are definition-only, and traversal speed `glacial` is explicitly omitted by all loops ([log declarations](../../e2e-perf/experiments.spec.ts#L65-L80), [unused function](../../e2e-perf/experiments.spec.ts#L638-L640), [unused tier](../../e2e-perf/experiments.spec.ts#L181-L202)). | Remove the constant, unused function, its now-unused `appendFileSync` import, and the `glacial` entry/comment. Preserve human-maintained experiment logs and four used tiers. | Low. Perf TypeScript diagnostics; do not run perf automatically. |
| T08 | `DELETE-NOW` | `.env.development` retains a commented `VITE_ENRICHMENT_MAX_IDS_PER_REQUEST` knob after its implementation was removed ([comment](../../.env.development#L15-L18)). | Remove the obsolete comment block. | None. Exact-name search in active code/config; historical docs may retain it. |
| T09 | `DELETE-NOW` | Deprecated `IMAGE_BORDERS` is definition-only; both views call `getImageBorderColour` ([alias](../../src/lib/image-borders.ts#L81-L86), [grid](../../src/components/ImageGrid.tsx#L171-L242), [table](../../src/components/ImageTable.tsx#L41-L283)). | Delete alias and its compatibility JSDoc only. | Low. Image-border units and build. |
| T10 | `DELETE-NOW` | Exported `serviceDiscovery` singleton has no consumer; the live Grid API instance constructs a separate private object ([dead singleton](../../src/dal/grid-api/service-discovery.ts#L122-L129), [live owner](../../src/lib/grid-api-instance.ts#L16-L20)). | Remove singleton docblock/export. Preserve the class, private instance and tests. | Low. Service-discovery units and build. |
| T11 | `DELETE-ATOMIC` | [`sort-only.test.ts`](../../src/lib/orchestration/sort-only.test.ts#L1-L163) tests a local copy of `computeIsSortOnly`, not production's inline calculation ([production](../../src/hooks/useUrlSearchSync.ts#L172-L189)). It cannot detect production drift. | Delete the copied suite, or first extract/import the production predicate if its contract still merits direct tests. Do not claim equivalent coverage unless a real production seam is tested. | Coverage risk, no runtime risk. Run full unit suite and record the intentional count reduction. |
| T12 | `DELETE-ATOMIC` | The first ~420 lines of [`useDataWindow.test.ts`](../../src/hooks/useDataWindow.test.ts#L1-L423) copy private data-window algorithms and even use an obsolete `positionMap !== null` two-tier rule. The velocity tail imports real production functions. | Remove/rewrite only copied helpers and their describe blocks. Preserve the real velocity tests from the later section. Migrate unique contracts to `renderHook(useDataWindow)` where still valuable. | High test-coverage judgment. Run focused data-window tests and full units. |
| T13 | `DELETE-ATOMIC` | The first major block of [`useImageTraversal.test.ts`](../../src/hooks/useImageTraversal.test.ts#L93-L311) exercises local copies of `getImageAtGlobal`/`globalIndexOf`; the final lifecycle test renders the real hook ([real test](../../src/hooks/useImageTraversal.test.ts#L313-L342)). | Remove/rewrite only the copied section. Preserve the production-hook lifecycle test and needed fixtures. | Coverage risk. Run focused traversal tests and full units. |
| T14 | `DELETE-ATOMIC` | [`W-2026-07-30-seek-idempotence.spec.ts`](W-2026-07-30-seek-idempotence.spec.ts#L1-L31) declares itself outside configured test roots and its sole premise is retracted in the file. | Delete the unexecutable spec; preserve its findings document as history. | None at runtime. Path/reference search only. |
| T15 | `DELETE-NOW` | Nine fixture methods are definition-only in [`e2e/shared/helpers.ts`](../../e2e/shared/helpers.ts#L331-L331): `getImageAtLocalIndex`, `getScrubberTooltip`, `isScrollMode`, `getSortDirection`, `pageUp`, `scrollDeep`, `detailPrev`, `detailNext`, `gotoWithQuery` (later definitions continue through [the query helper](../../e2e/shared/helpers.ts#L1459-L1459)). | Delete complete methods and their own docblocks only. Preserve adjacent live replacements and fixture state. | Medium test-infrastructure risk. Typecheck/discover E2E, then run full E2E. |
| T16 | `DELETE-ATOMIC` | Active [`e2e/README.md`](../../e2e/README.md#L197-L425) still prescribes retired smoke/tier-matrix workflows and names deleted `drift-flash-probes.ts`, despite the 11 September retirement. | Rewrite that region around current habitual E2E, forced-seek, diagnostic and perf roots. Remove retired reporter/results/probe instructions; preserve still-current store inspection, overscan and manual-diagnostic guidance. | Documentation correctness. Link/path search and `git diff --check`. |
| T17 | `DELETE-ATOMIC` | Pure tombstones describe removed tests in [`buffer-corruption.spec.ts`](../../e2e/local/buffer-corruption.spec.ts#L551-L558) and [`scrubber.spec.ts`](../../e2e/local/scrubber.spec.ts#L962-L966). Active comments still name deleted `resetSearchSync` in [`reset-to-home.ts`](../../src/lib/reset-to-home.ts#L48-L52) and [`orchestration/search.ts`](../../src/lib/orchestration/search.ts#L237-L240). | Delete removed-test narratives and rewrite only stale symbol references to describe current behavior. Preserve comments explaining live assertions and the strict history policy. | No behavior change. Unit only because two `src` files are touched; no E2E needed for comments alone. |

## 4. Decision gates - not removal instructions

These surfaces are currently unused or partially inert, but deleting them would be
an API/product/compatibility choice rather than proof-driven dead-code removal.
Resolve each in a design session, update the controlling docs, then create a separate
executor task.

| ID | Decision | Current evidence | Why this audit does not authorize deletion |
|---|---|---|---|
| Q01 | Make range-selection handlers required? | The sole route always supplies the handler through grid/table/dispatch/long-press ([root](../../src/routes/search.tsx#L60-L61), [fallback](../../src/lib/handleLongPressStart.ts#L23-L40)). | Absence has deliberate tested toggle behavior. This is API narrowing, not unreachable implementation. |
| Q02 | Narrow `usePinchZoom` to external `scaleRef` and `void`? | Both callers pass a ref and ignore the return ([detail](../../src/components/ImageDetail.tsx#L342-L370), [preview](../../src/components/FullscreenPreview.tsx#L283-L290)). | The internal fallback/return form a coherent standalone hook API ([hook](../../src/hooks/usePinchZoom.ts#L46-L66)). |
| Q03 | Remove `useFullscreen.enterFullscreen/exitFullscreen`? | The sole caller reads state/toggle only ([caller](../../src/components/ImageDetail.tsx#L188-L194)). | The hook intentionally wraps the complete Fullscreen API ([hook](../../src/hooks/useFullscreen.ts#L18-L56)). |
| Q04 | Remove custom `ErrorBoundary.fallback`? | Root and tests use built-in UI ([root](../../src/routes/__root.tsx#L18-L24)). | It is an explicit reusable component contract with a real render branch ([component](../../src/components/ErrorBoundary.tsx#L12-L51)). |
| Q05 | Retire generic `summary-only` reconciliation? | No field currently produces `kind: "summary"`; cost/lease summaries are bespoke ([registry](../../src/lib/field-registry.tsx#L245-L275), [renderer](../../src/components/MultiImageMetadata.tsx#L224-L239)). | Current selection architecture/catalogue still claim this mechanism for lease/cost summary fields. Resolve that contradiction first. |
| Q06 | Collapse generalized `CostBadge` API? | Live callers render only non-free `sm` badges ([grid](../../src/components/ImageGrid.tsx#L402-L413), [registry](../../src/lib/field-registry.tsx#L362-L391)). | Current component/integration docs retain larger variants for detail surfaces. |
| Q07 | Remove `Shortcut.label` metadata? | No registration supplies it and registry never reads it ([interface/registry](../../src/lib/keyboard-shortcuts.ts#L26-L62)). | It reserves shortcut-help/tooltip ownership. Decide whether presentation metadata belongs in the registry. |
| Q08 | Drop no-op `payType` URL compatibility? | Both adapters ignore it; media-api mapping deliberately omits it ([schema](../../src/lib/search-params-schema.ts#L30-L41), [adapter](../../src/dal/grid-api-search-adapter.ts#L116-L123)). | Removing accepted Kahuna URLs is a compatibility decision. |
| Q09 | Drop or implement `persisted` filtering? | Direct ES cannot implement it and currently only cache identity observes it ([schema](../../src/lib/search-params-schema.ts#L53-L59), [ES note](../../src/dal/es-adapter.ts#L560-L569)). | Media-api can filter it. Choose parity, media-api-only semantics, or removal. Preserve output `persisted`. |
| Q10 | Remove pinboard input members? | `expandPinboard`, `pinboardId`, `pinboardItemId` exist only in `SearchParams` ([type](../../src/dal/types.ts#L67-L72)); current URL schema does not accept them. | `AGENTS.md` still lists pinboard compatibility intent. Resolve the route contract instead of saving three lines blindly. |
| Q11 | Retire the old `GridApiDataSource` seam? | `getImageDetail`, exported `gridApi` and eager root discovery have no data consumer; current detail uses DAL `getById` ([adapter](../../src/dal/grid-api/grid-api-adapter.ts#L25-L103), [instance](../../src/lib/grid-api-instance.ts#L16-L28), [detail](../../src/components/ImageDetail.tsx#L247-L269)). D9 now proposes Strangler `getById/getByIds`. | Active HATEOAS satellite/write architecture still assigns responsibilities to ServiceDiscovery and generic Argo helpers, while D9 itself requires review. Decide ownership first. A later cleanup may delete `getImageDetail`, eager init, custom errors and retired GET-search envelope without deleting reserved HATEOAS pieces. |
| Q12 | Remove or populate `leasesSummary` overlay? | UI reads it, but no current production adapter sets it; detail has raw-lease fallback ([field](../../src/stores/enrichment-store.ts#L34-L41), [fallback](../../src/components/ImageMetadata.tsx#L205-L220)). | This is a producer/contract decision for D9, not dead UI while readers exist. |
| Q13 | Keep direct-config Playwright JSON reporter? | Harness overrides it and reads metrics JSONL, but manual config invocation genuinely emits `.playwright-report.json` ([config](../../e2e-perf/playwright.perf.config.ts#L36-L42), [harness](../../e2e-perf/run-audit.mjs#L693-L754)). | Decide whether undocumented direct-run JSON is supported. |
| Q14 | Make positional DAL methods required and remove absence guards? | Every current factory result supplies keyword/date distribution, position-index and fallback methods ([interface](../../src/dal/types.ts#L428-L499), [Strangler](../../src/dal/strangler-adapter.ts#L17-L46)). | This narrows future implementation flexibility; methods themselves are live. |
| Q15 | Remove semantic comma/multi-sort builder support? | URL canonicalization keeps one semantic token and current aliases are single paths ([canonicalizer](../../src/lib/search-params-schema.ts#L126-L161), [builder](../../src/dal/adapters/elasticsearch/sort-builders.ts#L141-L169)). | The exported builder accepts direct inputs. Treat as a sort-contract decision, not dead branch removal. |
| Q16 | Remove `_cat/aliases` from browser/DAL safeguards? | Browser code has no call; startup/perf scripts query ES directly ([DAL allowlist](../../src/dal/es-config.ts#L145-L153), [Vite allowlist](../../vite.config.ts#L18-L23), [startup](../../scripts/start.sh#L435-L452)). | This changes safeguard configuration. It would tighten, not weaken, access, but still requires explicit safety review and approval. |

## 5. Migration reserves

These are dormant on purpose. Absence of current callers is recorded so future work
can reassess them, but they must not enter mechanical deletion batches.

| Surface | Exact reserve |
|---|---|
| `ImageDataSource.count()` | D7 explicitly serves `countWithTickers` and degenerate `count` ([D7 plan](03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/phase-3-d7-d8-d9-workplan.md#L18-L23), [client step](03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/phase-3-d7-d8-d9-workplan.md#L146-L187)). Reconsider after D7 lands. |
| `searchRange()` | The authoritative status banner still lists this A item as not started, and the original active section reserves offset range fills ([status](03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/phase-3-minimal-gap-derivation-findings.md#L43-L54), [method](03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/phase-3-minimal-gap-derivation-findings.md#L159-L180)). Update the plan explicitly if the shipped Strangler offset fallback supersedes it. |
| `getAggregation()` | Also listed as an unstarted A item. The current UI always has scoped params, but the active plan retains corpus-wide aggregation and field-alias routing ([status](03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/phase-3-minimal-gap-derivation-findings.md#L43-L54), [method](03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/phase-3-minimal-gap-derivation-findings.md#L267-L289)). |
| URL/DAL `useAISearch` | Active More Like This work requires a Kahuna-compatible `similar:<id>` chip plus `useAISearch=true` ([AI workplan](ai-search-catching-up-workplan.md#L107-L155)). |
| API overlay `actions` and generic HATEOAS helpers | D3 already produces `actions`; Phase C names them for permission-gated writes. Preserve `unwrapEntity`, `findLink`, `findAction` and the minimal Argo/D9 entity types until ownership is resolved ([adapter](../../src/dal/grid-api-search-adapter.ts#L60-L79), [integration workplan](03%20Ce%20n'est%20pas%20une%20pipe%20dream/integration-workplan-bread-and-butter.md#L1310-L1333)). |
| `SELECTIONS_PERSIST_ACROSS_NAVIGATION` | Explicit Clipboard migration escape hatch ([constant](../../src/constants/tuning.ts#L324-L343), [architecture](00%20Architecture%20and%20philosophy/05-selections.md#L142-L149)). |
| Toast announcement/session/persistent vocabulary | Reserved for BBC/Grid notification and authentication integration ([store](../../src/stores/toast-store.ts#L1-L53), [component detail](00%20Architecture%20and%20philosophy/component-detail.md#L238-L240)). |
| `SortDistribution.complete` | D6 needs natural-exhaustion provenance for bounded keyword enumeration ([type](../../src/dal/types.ts#L223-L235), [gap contract](03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/phase-3-minimal-gap-derivation-findings.md#L618-L630)). |
| `AggregationResult.total` | No current UI reader, but the unbuilt C1 multi-aggregation response still includes per-field totals ([type](../../src/dal/types.ts#L164-L172), [C1 response contract](03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/phase-3-minimal-gap-derivation-findings.md#L318-L324)). Reassess when C1's response is final rather than deleting ahead of it. |
| `searchByAi` no-`aiQuery` fallback | It is unreachable under today's store gate, but active More Like This work broadens engagement to `aiQuery || similar:` while retaining direct-ES AI fallback ([current guard](../../src/dal/es-adapter.ts#L1139-L1148), [MLT plan](ai-search-catching-up-workplan.md#L132-L155)). Resolve direct-ES `similar:` behavior before narrowing it. |
| `syndicationRights.isInferred` | No current renderer, but current syndication UX architecture explicitly retains it for inferred-rights presentation ([projection](../../src/dal/es-config.ts#L123-L130), [architecture](00%20Architecture%20and%20philosophy/07-syndication-and-leases.md#L218-L291)). |

## 6. Refuted and live traps

Do not reopen these in removal sessions unless new evidence changes their status.

| Surface | Why it stays |
|---|---|
| `search-store` PIT, seek, null-zone, reverse and position-map paths | All have concrete store/hook consumers across the three scroll tiers. Direct ES is also the migration algorithm oracle. |
| `loadMore` | Grid/table/navigation currently call it. Renaming it to `extendForward` is a refactor, not dead-code deletion ([store](../../src/stores/search-store.ts#L481-L491), [grid](../../src/components/ImageGrid.tsx#L438-L446)). |
| `MapSnapshotStore` and the fixed-true persistence selector | Current architecture explicitly supports source-flipping to isolate storage-tier bugs ([implementation](../../src/lib/history-snapshot.ts#L52-L113), [architecture](00%20Architecture%20and%20philosophy/04-browser-history-architecture.md#L173-L188)). |
| `_resetForwardVelocity` | Real rendered-hook tests use it to isolate module state ([seam](../../src/hooks/useDataWindow.ts#L112-L117), [test](../../src/hooks/useDataWindow-anchor.test.ts#L44-L49)). |
| Toast `_clearAll`, `getSortContextLabel`, prefetch stats/reset and `MockDataSource` | These exercise or isolate real production implementations. They may be test-design choices, but are not dead code. |
| Graphic-image blur module/tests | Now imported and called by `ImageGrid` ([import](../../src/components/ImageGrid.tsx#L49-L49), [call](../../src/components/ImageGrid.tsx#L239-L247)). Old audit findings are obsolete. |
| Selection/toast browser globals | Configured E2E uses them. Making them DEV-only is production hardening, not dead-code cleanup. |
| `setEnrichment` | Fresh search must replace previous-query overlays; extends/seeks upsert ([store](../../src/stores/enrichment-store.ts#L77-L88), [commit](../../src/stores/search-store.ts#L2328-L2345)). |
| API overlay `actions` | Produced by the shipped media-api path and reserved for Phase C permission gating. Do not confuse it with unused raw direct-ES `_source.actions`. |
| S3 proxy and AWS S3 dependency | Current TEST direct-ES and media-api modes still use `/s3`; signed-URL migration has not replaced it ([proxy](../../scripts/s3-proxy.mjs#L20-L36), [URL builder](../../src/lib/image-urls.ts#L1-L27)). |
| `run-perf-smoke.mjs` | Deliberate compatibility CLI advertised by the live perf spec ([script](../../scripts/run-perf-smoke.mjs#L1-L46), [reference](../../e2e-perf/perf.spec.ts#L7-L14)). |
| `perceived-log.js` | Generated sidecar is loaded by the dashboard under `file://` and regenerated by the harness ([loader](../../e2e-perf/results/perceived-graphs.html#L151-L152), [generator](../../e2e-perf/run-audit.mjs#L637-L645)). |
| Manual Playwright configs, diagnostic globals, PNG baselines, fonts and SVGs | Package scripts/config roots, screenshot naming and CSS/HTML URLs prove them live. No direct dependency is currently removable. |

## 7. Removal workplan

### 7.1 Rules for every executor

1. Read this report, `AGENTS.md`, the current worklog and any migration document
   cited by the assigned batch.
2. Re-run exact symbol/path searches before editing. If a new production caller,
   config root or active plan appears, stop and report; do not force the deletion.
3. Inspect `git status --short -- kupua`. Preserve all user changes, especially the
   pre-existing lockfile change. Never edit outside `kupua/`.
4. Touch only the assigned IDs. Decision and reserve entries are explicit anti-goals.
5. Dead-code removal has no meaningful failing behavioral test: the behavior is
   absence. The pre-edit falsification check is reachability. After the first edit,
   run the narrowest relevant executable check immediately.
6. If deleting copied tests, identify unique asserted contracts before removal. Move
   valuable contracts onto a real production seam; do not claim copied tests were
   coverage merely because they were green.
7. After any `src` change, run the full unit suite. After component, hook, store,
   selection, scroll or focus changes, run full habitual E2E too.
8. Before Playwright, warn the user that ports `3000` and `3030` must be free and
   wait for confirmation. Never run performance suites automatically.
9. Use the mandated live-output form:

   ```sh
   set -o pipefail; npm --prefix kupua test 2>&1 | tee "$TMPDIR/kupua-test-output.txt"
   set -o pipefail; npm --prefix kupua run test:e2e 2>&1 | tee "$TMPDIR/kupua-test-output.txt"
   ```

10. Update this report's batch status, `AGENTS.md` if architecture/file routing
    changed, and append implementation detail to `changelog.md`. Do not commit unless
    the user explicitly authorizes it.

### 7.2 Batch order

The batches are intentionally smaller than the discovery categories. A cluster is
context, not permission to clean everything nearby.

| Status | Batch | IDs | Scope and stop condition | Required validation |
|---|---|---|---|---|
| `DONE` | A1 - obsolete standalone tools | T01-T04 | Delete the two orphan/broken runners; remove only the two script locals. Stop if any current package/config/doc root appears. | `node --check` for retained/changed `.mjs`, `bash -n` for changed shell, exact path/symbol searches, `git diff --check`. |
| `DONE` | A2 - perf/config residue | T06-T08 | Remove `.gitkeep`, unused experiment declarations/tier and obsolete env comments. Do not alter durable logs, dashboards or experiment results. | Perf TypeScript diagnostics if available; `npm --prefix kupua run test:perf-harness`; static references; no perf browser run. |
| `DONE` | A3 - active docs and tombstones | T16-T17 | Rewrite only retired harness instructions and stale narratives. Stop if a named workflow still has a config/package root. | Link/path searches, source diagnostics, full unit suite because T17 touches `src`, and `git diff --check`. Comment-only edits do not require E2E. |
| `DONE` | B1 - copied sort/orphan tests | T11, T14 | Remove the production-disconnected sort suite and unconfigured spec. If sort-only semantics still need direct coverage, extract the production predicate first in a separate approved task. | Focused then full unit suite; record intentional test-count change. |
| `DONE` | B2 - copied data-window tests | T12 | Remove/rewrite copied section only; preserve velocity tests. Stop if a unique contract cannot be expressed through the real hook without design work. | Focused data-window tests, then full units. |
| `DONE` | B3 - copied traversal tests | T13 | Remove/rewrite copied section only; preserve real hook lifecycle test. | Focused traversal tests, then full units. |
| `DONE` | B4 - unused E2E fixture API | T15 | Remove the nine named methods only. Stop on any computed/string consumer. | `kupua/node_modules/.bin/tsc -p kupua/e2e/tsconfig.json --noEmit`, Playwright discovery, then full E2E after port confirmation. |
| `DONE` | C1 - leaf production declarations | T05, T09, T10, P10, P11 | CSS tokens, two true aliases/singletons, one unused ref and empty sort alias layer. No neighboring cleanup. | Focused units, full units, build and full E2E after port confirmation because P10 touches `useScrollEffects`; suggest perceived-perf validation but do not run it automatically. |
| `DONE` | C2 - UI prop contracts | P01-P02 | Tickbox disabled contract and DataSearchPill partial contract. Keep real skeleton and `MultiSearchPill` behavior. | Focused component tests, full units, full E2E. |
| `DONE` | C3 - traversal dead state | P03-P04 | Remove ignored traversal output/callback state and prefetch session copy together; preserve live pending and direction-aware prefetch. | Traversal/prefetch units, full units, full E2E. |
| `DONE` | C4 - data-window return contract | P05 | One hook only. Do not rename/remove `loadMore` or internal extends. | Focused data-window tests immediately, full units, full E2E; suggest perceived-perf run to user. |
| `DONE` | C5 - history snapshot schema | P06 | One schema migration. Extra fields in old JSON must remain harmless. | History/build-snapshot units, full units, full browser-history E2E; suggest perceived-perf run. |
| `DONE` | C6 - enrichment dead state | P07 | Remove four named members only. Stop if `setEnrichment` is touched or D9 has landed with a new consumer. | Enrichment/derive/API-adapter units, full units, full E2E. |
| `DONE` | C7 - scroll geometry field | P08 | Remove only `isTable` across producer/type/fixtures. | Focused geometry/history units, full units, full E2E. |
| `DONE` | C8 - store leaf branches | P09, P12, P13 | Prefer three sequential edits with focused validation after each: poll parameter, collection controller, LRU methods. Do not combine failures across stores. | Relevant focused units after each edit, then full units and full E2E. |
| `DONE` | D1 - fused search method | D01 | Remove `search()` only. Preserve `searchRange`, `count`, `SearchResult` and every live cursor method. | DAL contract/store units immediately, full units, build. |
| `DONE` | D2 - dead DAL result/input fields | D02-D04 | Remove `countAll` input, `SearchResult.tickerCounts`, `IdRangeResult.fetchDuration`. Preserve wire `countAll`, ticker result types and caller timing. | Focused adapter/cache/range units, full units, build; full E2E because range hook is affected. |
| `DONE` | D3 - false query branches | D05-D06 | Empty source excludes and DAL parser groups only. Preserve the AI no-query fallback reserved in Section 5. | Focused adapter/CQL units after each edit, full units, build. |
| `DONE` | D4 - direct-ES projection | P14 | Highest-risk deletion batch; remove only five proven-discarded projection fields. No media-api/server edits. | Focused adapter/cost/collection units, full units, build, full local E2E. Real-ES checks require separate user permission. |

### 7.3 Baseline and completion gates

Before the first product-code batch, establish a green baseline on the unchanged
runtime tree. If units or habitual E2E fail, stop and separate baseline failures from
cleanup work. Do not weaken tests to keep a deletion moving.

Removal is complete only when:

- every executed ID is marked done or explicitly reclassified in this document;
- every decision/reserve ID remains untouched unless its controlling decision was
  separately approved and documented;
- focused checks and the full required test surfaces pass after the final batch;
- current direct-ES and media-api ownership statements remain internally consistent;
- no root-level test artifacts were created by an incorrect command;
- `AGENTS.md`, the changelog and current worklog describe the resulting tree;
- `git diff --check -- kupua` is clean and the user's unrelated lockfile work remains.

## 8. Coverage gaps and residual risk

- Static analysis cannot observe private shell aliases or undocumented direct script
  invocation. T01/T02 survived because their mechanics are also obsolete or broken.
- No runtime bundle inspection was performed. Supported DEV globals and Vite roots
  were traced from source/config instead.
- No real TEST/PROD service was queried. Migration classifications rely on live code
  and checked-in active plans.
- Ignored generated output and local logs were excluded. No sensitive log content is
  reproduced in this report.
- The active integration docs disagree about ownership of the old Grid API adapter,
  D9 and some HATEOAS pieces. Q11 is intentionally a halt point, not a compromise.
- This report expires as code changes. Every executor must revalidate its assigned
  symbols against the then-current revision.
