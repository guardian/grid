# Production-impact assessment of the additive Kupua/media-api plan

> **Archived, 15 September 2026: reference, not approved implementation.** Keep authorization,
> isolation and load findings as evidence. Stronger migration/writable horizons and their gates
> are not prerequisites for the current additive read-only prototype scope.
> Current scope: [media-api index](../../../03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/media-api-00-index.md).

**Date:** 2026-09-15  
**Mode:** Read-only compatibility audit. No tests, builds, profiling, live requests or production
systems were used.  
**Scope:** Current source establishes behavior; working-branch presence does not establish
deployment. Archive material is used only for original-scope provenance.

## 1. Decision card

### Verdicts

| Horizon | Exact verdict | Decision basis |
|---|---|---|
| **H0 - current built Kupua** | **3. Viable only with A2 measurements and explicit capacity acceptance.** | The current hybrid can preserve existing production contracts because its only media-api search path is a new route, but the route is not ready as written: deleted-result authorization, inclusive date bounds, partial-result handling and API-absence behavior need endpoint/client-local A0 corrections. Enabling it adds shared media-api, Elasticsearch, signing and payload work, so capacity acceptance is mandatory. **Inferred, high confidence.** |
| **H1 - active backend migration** | **4. Viable only with one or more P-class production programmes.** | Removing normal direct-ES reads while retaining exact pages, totals, maps, ranks and ranges requires the canonical read/write epoch, mutation/session fence and cutover contract already selected by decision 04. That changes production migration reads, getters, writes, aliases and operations. A2 acceptance remains additional, not an alternative. **Proven boundary; Inferred programme verdict, high confidence.** |
| **H2 - credible writable Kupua** | **5. Viable only as a named reduced/deferred mode.** | Kupua can reuse existing single-image commands and Kahuna-style client fan-out unchanged, including metadata, collections, crops, usages, leases, soft delete and soft undelete. The honest mode is asynchronous, non-atomic and last-write-oriented: defer dependable hard delete/recovery, atomic bulk, strong optimistic concurrency and operation-wide idempotency. **Inferred, high confidence.** |

**Overall recommendation:** keep the programme at **H0 hybrid plus bounded A0 hardening and measured
A2 traffic acceptance**. Do not make decision 04's P-class migration redesign a prerequisite for
proving Kupua. Preserve direct ES for session-authoritative H1 methods, and disable media-api
pagination during an active index migration unless a pinned-single-index reduced mode implements
all of the fail-closed gates in the scope reassessment. Add H2 writes by following existing
HATEOAS contracts directly, not by creating a media-api mutation facade. The trigger for the larger
programme is a product commitment either to migration-transparent exact navigation or to strong
cross-service mutation completion; neither is required to validate the current prototype
(`grid-index-migration-05-scope-reassessment.md:84-166,205-218`).

**Largest blockers:** the P-class migration/read-epoch boundary; current D3 authorization and
exactness defects; production browser routing and deployed-version uncertainty; PIT and shared
resource capacity; and H2's absence of transactional bulk, durable command correlation and
dependable hard-delete recovery. **Easiest wins:** endpoint-local D3 parity fixes, one bounded D7
count route, C1/C2 contextual aggregations, reuse of `GET /images/:id`, and reuse of existing
single-image mutation actions. No candidate currently satisfies every A1 criterion.

**Next decision:** accept the contained H0 path and its measurement gate, or explicitly sponsor
decision 04 as a production migration programme. Do not continue to describe H1 as a collection of
small additive endpoint gaps.

### Direct answers

- **Is migration unique?** It is the only **proven unavoidable P-class read redesign**, but not
  the only blocker. D3 security/parity, production routing, partial-result policy and capacity are
  U/A2 gates. Strong hard-delete recovery, atomic bulk and optimistic concurrency are separate
  H2 P-or-R choices. Migration is therefore **one of a small number of blockers**, not evidence
  that additive integration fails broadly.
- **Can H0 run behind media-api without material production change?** The current hybrid can, after
  A0 corrections, but only with A2 capacity acceptance. Fully backend-serving all current exact
  positional behavior is H1, not H0.
- **Can H2 exist under the boundary?** Yes, in the named reduced mode: existing command contracts,
  per-item authorization, asynchronous projection and explicit partial success. No, if “credible”
  is made to mean atomic multi-edit, expected-version writes or recoverable hard delete.

## 2. Constraint definition

This audit applies impact on two independent axes. **Contract/reachability** is A0, A1, P, R or U;
**runtime production impact** is `none evidenced`, A2 or U. A new route can therefore be A0/A2.
Reuse of an unchanged existing contract is labelled **A0 reuse**: the planned change creates no
server contract delta, while new traffic is still assessed separately.

- **A0 - isolated additive:** a new Kupua-only route/path, or unchanged-contract reuse, with no
  change to existing caller semantics, shared defaults, mappings, aliases, authorization or
  topology. Shared extraction is allowed only when behavior-preserving.
- **A1 - bounded shared improvement:** a production-reachable change only after source proves the
  defect, every caller and compatibility expectation, independent production benefit, security and
  availability neutrality, existing performance/capacity neutrality, deterministic rollback and
  one-service ownership without persistent coordination. Unknown evidence prevents A1.
- **A2 - operational production impact:** additive contracts whose enabled traffic adds material
  CPU, allocation, signing, payload, ES queries/aggregations, PIT contexts, retained segments,
  downstream work or failure coupling.
- **P - material production change:** shared semantics, migration/cutover, mappings, aliases,
  durable state, topology, authorization, coordinated writes or operational procedures change.
- **R - reduced/deferred capability:** the boundary survives only by disabling, degrading,
  deferring or retaining direct ES for a named capability.
- **U - unresolved:** current source cannot classify safely. Every U below names a fixture,
  measurement or team decision that resolves it.

“Never worse” is not established by low line count, absence of an obvious caller, or a new route
name. It requires both a reachability argument and resource evidence. Working source proves neither
deployed revision nor traffic. Conversely, touching a shared file is not automatically P when an
extraction is demonstrably behavior-preserving.

### Original-scope provenance

The premise passes. The active API-first plan says Kupua should use one media-api root, that all
media-api changes are additive, and that existing endpoints, responses, behavior and legacy clients
remain unchanged (`../integration-plan-api-first.md:1-11,125-139`). The archived D3 workplan made
that operational: production Kahuna safety forbade changes to legacy sort/search behavior and
allowed shared extraction only when strictly behavior-preserving
(`../../zz Archive/media-api-work/phase-3-d3-searchafter-workplan.md:103-121`). The archived
feasibility record routed cursor search and large mget to new routes specifically to avoid changing
`GET /images` pagination or its 200-item behavior
(`../../zz Archive/media-api-work/ref--media-api-gap-closure-feasibility.md:55-90,324-358`). The
post-review record declined to “fix” a pre-existing GET-path error inside D3 because doing so would
turn an additive PR into an existing-API behavior change
(`../../zz Archive/media-api-work/phase-3-d3-searchafter-post-pr-review.md:45-58`). These archives
establish the promise only; all classifications below use current source.

## 3. Source/deployment status map

| State | What current evidence establishes | What it does not establish |
|---|---|---|
| **Production-reachable existing behavior** | Kahuna follows root `search`, `image`, metadata and mutation relations and calls existing GET/action contracts (`kahuna/public/js/services/api/media-api.js:41-152`). Metadata-editor and Thrall also call stable single-image media-api contracts through `GridClient` (`metadata-editor/app/controllers/EditsController.scala:50-66,146-173`; `thrall/app/controllers/ThrallController.scala:65-79`). | Traffic, current deployed SHA, latency, instance shape or capacity headroom. |
| **Implemented, unreviewed D3** | `POST /images/search-after` is registered and implemented in the working source (`media-api/conf/routes:12-17`; `media-api/app/controllers/MediaApi.scala:823-889`; `media-api/app/lib/elasticsearch/ElasticSearch.scala:748-885`). Kupua hard-codes `/api/images/search-after` for qualifying `searchAfter` calls (`kupua/src/dal/grid-api-search-adapter.ts:81-145`; `kupua/src/dal/strangler-adapter.ts:47-67`). | Deployment or production callers. The active PR record says review is held (`../../../03 Ce n'est pas une pipe dream/media-api-work/d3-search-after-02-pr.md:1-17`). |
| **Current H0 hybrid** | `createDataSource()` selects the Strangler only by `VITE_USE_MEDIA_API`; that adapter delegates every method except qualifying `searchAfter` calls to direct ES (`kupua/src/dal/index.ts:29-41`; `kupua/src/dal/strangler-adapter.ts:13-67`). Selection and collection stores independently construct ES datasources (`kupua/src/stores/selection-store.ts:426-435`; `kupua/src/stores/collection-store.ts:110-143`). | A backend-only deployment or removal of browser ES credentials/routing. |
| **Planned only** | D1/D2/D4-D9 and C1-C3 have no current media-api routes; the active plan marks D1-D9 not started or design-blocked (`../../../03 Ce n'est pas une pipe dream/media-api-work/media-api-01-capability-inventory.md:116-139`; `media-api/conf/routes:9-35`). | Endpoint behavior, rollout, performance or acceptance. |
| **Deployment topology known in outline** | Riff-Raff names media-api, Thrall and satellite services as TEST/PROD autoscaling deployments (`../../../../../riff-raff.yaml:1-59`). | Fleet count/type, JVM heap, scaling policy, routing, affinity, request limits, effective IAM, production ES version or whether D3 is deployed. Runtime config is external to the repository (`common-lib/src/main/scala/com/gu/mediaservice/lib/config/GridConfigLoader.scala:15-48`). |
| **Strong migration decision, scope unaccepted** | Decision 04 selects a canonical read/write epoch, global fence, strict cutover and semantic browse session, and holds D3 review (`grid-index-migration-04-architecture-proposal.md:14-75`). | Approval to implement that production programme. The scope reassessment explicitly recommends containment for the prototype (`grid-index-migration-05-scope-reassessment.md:1-20,205-218`). |

## 4. Capability compatibility matrix

The 40 rows cover every current `ImageDataSource` method, all active A/B/C/D families including
D1-D9, current user-visible workflows, optional services and the minimum H2 write set. “Prod
callers” means checked-in production-reachable callers, not measured deployment traffic.

| # / capability family | Horizon | Kupua source/callers | Production owner/path | Existing contract | Planned gap | Contract impact | Runtime impact | Existing prod callers | Resource evidence/gate | Cheapest valid unblock | Confidence |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **M1 Datasource ownership; B1/B2** | H0/H1 | Factory and search store; B1 shapes and B2 wrappers are complete (`kupua/src/dal/index.ts:29-41`; `kupua/src/dal/types.ts:259-531`) | Client only | No production server contract | Route remaining methods | **A0** | **none evidenced** | None | Static routing only | Keep completed client cleanup; no dossier | **Proven** |
| **M2 Cursor pages; D3/C4** | H0/H1 | Initial, extend, reverse, seek, focus and restore use `searchAfter` (`kupua/src/stores/search-store.ts:1490-1805,2206-2240`) | New media-api POST route | Working D3 accepts raw sort/PIT and enriches hits (`media-api/app/lib/elasticsearch/ElasticSearch.scala:748-885`) | A0 H0 route; semantic session for H1 | **U now; P in H1** | **A2** | No D3 caller proven; Kahuna uses GET | 200-hit envelope/count/signing plus canary | Route-local auth/date/partial fixes; hold H1 | **Proven gaps / Inferred verdict** |
| **M3 PIT lifecycle; D8** | H0/H1 | Store opens PIT beside first page and retries expiry live (`kupua/src/stores/search-store.ts:2203-2245`; `kupua/src/dal/es-adapter.ts:1042-1123`) | ES today; no media-api route | Direct single-index PIT | Same-snapshot session and migration epoch | **P** | **A2** | None through media-api | PIT count, segments, heap, FD, cleanup | R: pinned single-index session or migration-off | **Proven** |
| **M4 Counts/tickers; D7** | H0/H1 | Initial search, AI and 10/30s polling (`kupua/src/stores/search-store.ts:704-753,2167-2181,2220-2240`) | Existing GET search owns tickers; no count route | Existing bundled `extraCounts` | New count-only route; one initial owner | **A0** | **A2** | Kahuna GET | Exact count measured +28ms on one corpus | New capped D7; measure fused vs separate owner | **Proven/A2 measurement-needed** |
| **M5 `searchRange`; A** | H1 | Interface/ES first-page wrapper; no product call found (`kupua/src/dal/types.ts:259-266`; `kupua/src/dal/es-adapter.ts:691-696`) | `GET /images` offset search | Existing production route, max 200 | None if ever used | **R** | **U** | Kahuna | No current Kupua value or rate | Defer until a caller exists | **Proven** |
| **M6 Single image `getById`; A** | H0/H1 | Detail buffer miss (`kupua/src/components/ImageDetail.tsx:235-273`) | `GET /images/:id` | Authenticated, migration-aware, visible, enriched (`media-api/app/controllers/MediaApi.scala:164-176`) | Client routing only | **A0 reuse** | **A2** | Kahuna, metadata-editor | Single-hit rate/payload | Route Strangler call to existing contract | **Proven** |
| **M7 Multi-image `getByIds`; D9** | H0/H1 | Selection hydration/reload, 1,000-ID parallel chunks (`kupua/src/stores/selection-store.ts:606-700`; `kupua/src/dal/es-adapter.ts:2195-2249`) | No public mget; internal lookup is search-based | `GET /images?ids=` capped/ordered as search | New bounded visible mget + owner wiring | **U** | **A2** | Existing GET callers, not mget | 1/200/500/1,000 final envelope, heap, hidden IDs | A0 new route after cap/visibility fixture; H1 epoch remains P | **Proven gaps** |
| **M8 Corpus aggregation `getAggregation`; A** | H1 | Fallback exists, live CQL supplies contextual getter (`kupua/src/lib/typeahead-fields.ts:196-221`; `kupua/src/components/CqlSearchInput.tsx:175-213`) | `GET /images/metadata/:field` prefixes `metadata.` | Narrow single-field, `q` only | None for current caller | **R** | **none evidenced** | Kahuna metadata search | No current product call | Defer; do not force raw paths through legacy route | **Proven** |
| **M9 Contextual facets/typeahead; C1/C2** | H0/H1 | Facets, `is:`, usages, typeahead, collection counts (`kupua/src/stores/search-store.ts:3921-4037`; `kupua/src/stores/collection-store.ts:127-143`) | No batched route | Legacy single-field route lacks full context/tier | New verbatim-path terms/named/nested aggs | **A0** | **A2** | Legacy aggregation callers stay separate | Cardinality, request fields, ES took, caps | New allowlisted/capped route; preserve legacy endpoint | **Proven** |
| **M10 CQL/default hiding** | H0/H1 | TS parser and D3 inject deleted/replaced exclusions (`kupua/src/dal/adapters/elasticsearch/cql.ts:20-42,457-526`; `kupua/src/dal/grid-api-search-adapter.ts:99-110`) | Scala Parser/QueryBuilder | Existing GET hides defaults and restricts deleted search | Differential semantic fixtures | **U** | **A2 via search** | Kahuna GET | Cross-language fixture, access-tier cases | Route-local server semantic contract | **Proven divergence risk** |
| **M11 Structured filters/date bounds** | H0/H1 | IDs, dates, uploader, free, crop, rights, syndication (`kupua/src/dal/grid-api-search-adapter.ts:111-130`) | Shared `SearchParams`/filters | Server dates are exclusive; direct Kupua dates inclusive (`common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/filters.scala:25-48`; `kupua/src/dal/es-adapter.ts:496-515`) | D3 parity | **U** | **A2 via search** | Kahuna uses shared exclusive helper | Boundary fixture | Build inclusive clauses only in Kupua route; do not change shared helper | **Proven** |
| **M12 Sorts/config aliases/null zones** | H0/H1 | Semantic sort expands fallback, ID and nested max (`kupua/src/dal/adapters/elasticsearch/sort-builders.ts:64-204`) | D3 raw clause; legacy `createSort` differs | Current D3 pre-review Option B | New endpoint-only semantic builder | **U now; A0 builder** | **A2 via search** | Kahuna legacy sort | Language-neutral parity fixture | Parallel builder; never alter `createSort` | **Proven** |
| **M13 Exact rank `countBefore`; D4** | H0/H1 | Focus, seek, restore (`kupua/src/stores/search-store.ts:1588-1660,3148-3170`) | No route; direct `_count` live | Exact client predicates, not PIT-bound | Snapshot-bound rank | **P in H1** | **A2** | None | Every sort cost + same-snapshot oracle | R: retain direct/reduce exact focus; P for full H1 | **Proven** |
| **M14 Percentile `estimateSortValue`** | H0/H1 | Deep seek and keyword scope (`kupua/src/stores/search-store.ts:3098-3138,3240-3279`) | No route | Direct percentile aggregation | New bounded estimate | **A0** | **A2** | None | Full-corpus agg by sort/filter | Optional route with allowlist/cap | **Proven** |
| **M15 Keyword target walk; D5** | H0/H1 | Fallback when distribution does not cover target (`kupua/src/stores/search-store.ts:3288-3343`) | No route | Bounded direct composite walk | Server walk/continuation | **R** | **A2** | None | High-cardinality production evidence already challenges value | Defer; retain capped fallback | **Proven reduction** |
| **M16 Keyword distribution; D6** | H0/H1 | Lazy scrubber labels (`kupua/src/stores/search-store.ts:4088-4121`) | No route | Bounded prefix with coverage provenance | New optional route | **A0** | **A2** | None | Composite pages, payload, represented coverage | Capped route only if product value survives measurement | **Proven/A2** |
| **M17 Date distribution; C3** | H0/H1 | Scrubber and null-zone evidence (`kupua/src/stores/search-store.ts:4108-4165`) | Existing monthly `q`-only histogram | Not exact positional parity | New provenance-aware route | **A0** | **A2** | Existing route callers unchanged | Stats/histogram cost and parent/child fixture | Keep presentation approximate; never mint exact cursors | **Proven** |
| **M18 Position map; D1** | H0/H1 | Auto 1k-65k, own PIT and complete walk (`kupua/src/stores/search-store.ts:1215-1269`; `kupua/src/dal/es-adapter.ts:1982-2193`) | No route | Direct dedicated snapshot | Same browse snapshot in H1 | **P in H1** | **A2** | None | Up to 65k tuples, ES/JVM/payload and interactive delay | R: disable map; P session operation for full parity | **Proven** |
| **M19 ID range; D2** | H0/H1 | Shift/long-press selection, cap 5,000 (`kupua/src/hooks/useRangeSelection.ts:190-289`) | No route | Direct live cursor walk | Same browse snapshot and authoritative tuples | **P in H1** | **A2** | None | Chunk walk, cap, concurrent updates | R: in-buffer only; P session operation for exact range | **Proven** |
| **M20 AI search; A** | H0/H1 | Optional, max 200, direct Bedrock+ES (`kupua/src/stores/search-store.ts:2098-2188`) | Existing `GET /images?useAISearch` | Different blend/filter/total semantics (`media-api/app/controllers/MediaApi.scala:665-704`; `kupua/src/dal/es-adapter.ts:1131-1272`) | Client-only claim is stale | **R/U** | **A2** | Kahuna GET | Differential ranking/filter fixture; Bedrock/ES load | Inherit server limitation explicitly or keep direct/disable | **Proven** |
| **M21 Typeahead/completions** | H0/H1 | Query-scoped cached aggs and cancellation (`kupua/src/lib/typeahead-fields.ts:196-420`) | Existing completion routes query current alias directly | Not contextual facet parity | C1 route serves contextual values | **A0** | **A2** | Kahuna completion | Field/cardinality/rate cap | Reuse C1; leave completion routes unchanged | **Proven** |
| **M22 Selection state/reconciliation** | H0/H1 | Client Set/sessionStorage plus D9/D2 (`kupua/src/stores/selection-store.ts:426-700`) | No server selection resource | Client-owned state | D9/D2 only | **A0 client** | **none itself** | None | Charged to D9/D2 | Keep client-owned | **Proven** |
| **M23 Collection browse/tree/counts** | H0/H1 | Optional tree, CQL chip, direct count agg (`kupua/src/stores/collection-store.ts:110-208`) | Collections GET + ES CQL | Tree is stable service; counts optional | Proxy routing + C1 count | **A0 reuse** | **A2/U** | Kahuna | Satellite routing and count load | Preserve graceful absence; use C1 for counts | **Proven/route U** |
| **M24 Detail/fullscreen/traversal** | H0/H1 | Buffer-first detail, global-index traversal and prefetch (`kupua/src/components/ImageDetail.tsx:194-273`; `kupua/src/hooks/useImageTraversal.ts:91-279`) | Single image + media links | Existing getter usable | Client routing/signed media | **A0 reuse** | **A2/U** | Kahuna/detail clients | Getter and media-origin rate | Reuse GET; retain loaded buffer on API absence | **Proven** |
| **M25 History/re-anchor** | H0/H1 | Semantic snapshot stores anchor/offset, then probes/ranks live (`kupua/src/lib/history-snapshot.ts:16-50`; `kupua/src/hooks/useUrlSearchSync.ts:262-390`) | No server history | Client state | New snapshot + rank for exact H1 | **P in H1 / R otherwise** | **A2 via calls** | None | Same-snapshot oracle under updates | Best-effort H0; P session re-anchor for exact H1 | **Proven** |
| **M26 Enrichment/actions/signed media** | H0/H1 | D3 overlay consumes cost/validity/rights/actions; current media builders ignore API secure URL (`kupua/src/dal/grid-api-search-adapter.ts:54-88`; `kupua/src/lib/image-urls.ts:1-55`) | `ImageResponse.create` | Existing enriched output | Client consumption only | **A0 reuse** | **A2** | Kahuna search/detail | 137ms/200 envelope, 29ms signing; final bytes/media origin | Consume only needed fields; measure final response and media | **Proven** |
| **M27 Optional services/deployment modes** | H0/H1 | Discovery/tree/quota/AI degrade; D3 throws (`kupua/src/dal/grid-api/service-discovery.ts:45-69`; `kupua/src/dal/grid-api-search-adapter.ts:131-145`) | Media-api and satellites | No checked-in production Kupua ingress | Routing + absence policy | **U** | **A2/U** | Existing service clients | Effective CORS/origin/proxy/IAM and failure injection | Production ingress decision; Strangler fallback only before session | **Proven source gap** |
| **M28 Permission/action discovery** | H2 | Actions parsed into enrichment but no controls invoke them (`kupua/src/lib/derive-enriched-image.ts:60-69`; `kupua/vite.config.ts:57-94`) | Per-image `ImageResponse` actions | Internal tier only; delete/action predicates (`media-api/app/lib/ImageResponse.scala:123-194`) | Client action executor and satellite proxies | **A0 reuse** | **U/A2** | Kahuna follows actions | Hidden-vs-forbidden fixture; proxy auth | Follow advertised action only; never infer permission from URL | **Proven** |
| **M29 Single metadata edit** | H2 | No mutation DAL/control yet | metadata-editor PUT | Uploader-or-EditMetadata, Dynamo then event (`metadata-editor/app/controllers/EditsController.scala:146-173`) | Client command/poll | **A0 reuse** | **U** | Kahuna | Added request/event rate | Follow existing edit link and semantics | **Proven** |
| **M30 Multi-image metadata** | H2 | Read-only reconciliation | Client fan-out of single edit | Kahuna concurrency 30, all-settled successes (`kahuna/public/js/util/batch-tracking.js:1-64`) | Kupua fan-out | **R** | **A2** | Kahuna | Concurrency, Dynamo/Kinesis/Thrall lag, per-item result | Non-atomic per-item batch only | **Proven** |
| **M31 Collection membership writes** | H2 | Browse only | collections POST/DELETE | Persist then publish; remove is read/rewrite (`collections/app/controllers/ImageCollectionsController.scala:28-72`; `collections/app/store/ImageCollectionsStore.scala:34-53`) | Client action | **A0 reuse** | **U/A2** | Kahuna | Rate and lost-update fixture | Reuse unchanged; disclose last-writer semantics | **Proven** |
| **M32 Crop/export writes** | H2 | Display/filter only | cropper POST/DELETE | Image work/S3 then event; delete store then event (`cropper/app/controllers/CropperController.scala:51-157`) | Client action | **A0 reuse** | **A2** | Kahuna | CPU, S3, payload, partial ordering | Reuse existing action; no atomic batch claim | **Proven** |
| **M33 Usage writes/deletes** | H2 | Read/display/filter only | usage service | Several endpoints enqueue then accept; delete-all publishes and returns apart from deletion future (`usage/app/controllers/UsageApi.scala:171-365`) | Client action | **A0 reuse** | **A2/U** | Kahuna/media-api | Queue/table/event rate and failure fixture | Reuse unchanged; poll projection | **Proven** |
| **M34 Lease writes** | H2 | Read/display only | leases service | Auth-only routes; replace delete+publish+put; HTTP replace does not await it (`leases/app/controllers/MediaLeaseController.scala:52-151`) | Client action | **A0 reuse / U auth** | **A2/U** | Kahuna | Authorization decision and completion fixture | Follow advertised action; do not expose raw route as permission | **Proven** |
| **M35 Rights/syndication writes** | H2 | Read/display only | metadata-editor + media-api + usage | Rights persistence/event and syndication usage publication | Client action | **A0 reuse** | **A2/U** | Kahuna | Photoshoot fan-out and downstream status | Reuse; preserve current async semantics | **Proven** |
| **M36 Single soft delete** | H2 | Deleted display/filter, no command | `DELETE /images/:id` | Visibility, uploader/permission, no crops/usages; `202` before status/event completion (`media-api/app/controllers/MediaApi.scala:361-397`) | Client action | **A0 reuse** | **U/A2** | Kahuna | Controller failure fixture, event lag | Follow advertised delete action and poll | **Proven** |
| **M37 Many-image delete/undelete** | H2 | No command | No bulk server contract | Kahuna per-item fan-out/all-settled | Client fan-out only | **R** | **A2** | Kahuna | Concurrency and per-item outcome | Cap and expose partial results; no atomic claim | **Proven** |
| **M38 Hard delete** | H2 | No command/action | media-api -> Kinesis -> Thrall -> ES/S3 | `202` means accepted; per-index delete; S3 futures unawaited (`media-api/app/controllers/MediaApi.scala:332-359`; `thrall/app/lib/kinesis/MessageProcessor.scala:155-177`) | Dependable completion would be new programme | **R/P** | **A2/U** | Admin script, not advertised action | Completion ledger, cleanup, migration failure | Defer from writable mode | **Proven** |
| **M39 Soft undelete / hard restore** | H2 | Deleted display only | media-api PUT / image-loader admin restore | Soft undelete sequences archive/status/event; replica restore needs upload permission/config and rebuilds satellites (`media-api/app/controllers/MediaApi.scala:399-429`; `image-loader/app/controllers/ImageLoaderController.scala:576-642`) | Client soft action; hard recovery deferred | **A0 reuse / R hard** | **A2/U** | Kahuna soft; admin hard | Permission mismatch fixture; restore load | Support soft undelete only | **Proven** |
| **M40 Concurrency/idempotency/audit** | H2 | No mutation result/version types (`kupua/src/dal/types.ts:77-252`) | Distributed owners + Thrall | `UpdateMessage` has no request ID; random Kinesis partition; Dynamo updates have no condition (`common-lib/src/main/scala/com/gu/mediaservice/lib/aws/ThrallMessageSender.scala:67-90`; `common-lib/src/main/scala/com/gu/mediaservice/lib/aws/Kinesis.scala:35-56`; `common-lib/src/main/scala/com/gu/mediaservice/lib/aws/DynamoDB.scala:197-218`) | Strong semantics | **R/P** | **A2/U** | All writers | Team semantics decision + failure fixtures | Accept last-write/per-item mode or sponsor P programme | **Proven** |

## 5. Material blocker dossiers

Ordered by contract class, then confidence. Matrix row references are authoritative summaries; these
dossiers explain only the conclusions that change a horizon verdict.

### P1 - Canonical migration epoch and cutover

**Classification:** P/A2, H1; **Proven boundary, Inferred resolution, high confidence** (M3, M13,
M18, M19, M25). Current progressive search can see C and M while getters prefer M, and Thrall can
insert M before marking C or reset C's marker while an older M copy remains
(`media-api/app/lib/elasticsearch/ElasticSearch.scala:103-149,699-710`;
`thrall/app/lib/kinesis/MessageProcessor.scala:70-123`). Kupua's page one can therefore come from a
migration-aware no-PIT D3 request while continuation uses a direct C PIT
(`kupua/src/stores/search-store.ts:2196-2249`; `kupua/src/dal/strangler-adapter.ts:47-67`). The
failure mode is two physical copies, stale source selection, or page/total/cursor membership that
changes within one logical browse.

The smallest full unblock is decision 04's one canonical read/write alias, global write and
session-admission fence, readiness proof, strict cutover and semantic browse session. That changes
production reads, getters, Thrall write admission, aliases, rollback and operations, so it cannot
be relabelled A0/A1 (`grid-index-migration-04-architecture-proposal.md:14-75,220-267`). It
benefits production independently because the current migration behavior has duplicate/stale and
unfenced-completion defects, but no A1 claim is possible: the change is multi-service and durable.
Owners are media-api, common-lib migration status, Thrall, every mutation ingress, auth/config and
ES operations. Existing D3 tests prove only a single-index PIT walk
(`media-api/test/lib/elasticsearch/ElasticSearchTest.scala:1116-1204`); Thrall tests prove successful
dual updates, not a globally fenced cutover. The cheapest remaining check is not another code read:
the programme owner must accept the P scope and then close decision 04's ingress/readiness inventory.

### P2 - Exact positional operations require one snapshot

**Classification:** P/A2 in H1; **Proven, high confidence** (M13, M18, M19, M25). `countBefore`
uses live `_count`, the position map opens a different PIT, and ID range walks without a PIT
(`kupua/src/dal/es-adapter.ts:1278-1439,1982-2193,2251-2338`). Yet Kupua consumes them as ranks,
global offsets, exact map entries and ranges in the displayed ordered list
(`kupua/src/stores/search-store.ts:1215-1269,1588-1660,3148-3170`;
`kupua/src/hooks/useRangeSelection.ts:190-289`). Ordinary indexing can therefore make a rank, map or
range describe a corpus the user did not see even outside migration; migration makes target
divergence structural.

The full unblock is to bind D1, D2 and exact D4 to the browse snapshot and semantic sort, as
decision 04 requires (`grid-index-migration-04-architecture-proposal.md:166-194,329-353`).
That is P because it depends on the session and epoch programme; it independently improves exact
navigation consistency but has material PIT/query/load cost. The proportionate reduction is to
retain direct ES and best-effort H0 behavior, disable D1 and out-of-buffer range selection in a
contained mode, and avoid claiming exact restore across ordinary updates. Existing Kupua unit and
special-sort tests prove predicates and static order, not one-snapshot behavior under concurrent
writes; local E2E blocks `/api/**` and therefore does not prove backend parity
(`kupua/e2e/shared/helpers.ts:18-38`). Cheapest check: one deterministic concurrent-update oracle
comparing page, total, map, rank, range and restore to one fixed snapshot, after P scope is accepted.

### P3 - Dependable hard delete and hard recovery

**Classification:** R now, P for strong completion, A2/U runtime, H2; **Proven, high confidence**
(M38-M40). `DELETE /images/:id/hard-delete` publishes a command and returns `202`; Thrall checks and
deletes each active index independently, treats a protected image as consumed success, and starts
original, thumbnail and PNG deletion futures without awaiting them
(`media-api/app/controllers/MediaApi.scala:332-359`;
`thrall/app/lib/elasticsearch/ElasticSearch.scala:469-499`;
`thrall/app/lib/kinesis/MessageProcessor.scala:155-177`). No hard-delete action is advertised in
per-image HATEOAS; the checked-in caller is an administrative mass-deletion script. Replica restore
is an upload-permission, configuration-dependent image-loader form that aggregates satellite data
and redirects to Kahuna, not a product undo contract
(`image-loader/app/controllers/ImageLoaderController.scala:576-642`;
`common-lib/src/main/scala/com/gu/mediaservice/ImageDataMerger.scala:10-54`).

Ignoring this distinction makes HTTP acceptance appear to mean ES/S3 completion and makes “restore”
appear available when only an administrative reconstruction exists. A dependable command would
need durable per-index/delete/cleanup outcomes, retry/idempotency authority, retained-status policy
and a supported restore boundary across Thrall, S3, metadata and satellites: P, not A1. The reaper
proves a stronger but different administrative model: bounded candidate selection, awaited bulk S3
cleanup, cleared deletion status and persisted result JSON
(`thrall/app/controllers/ReaperController.scala:91-186`;
`common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/ReapableEligibility.scala:17-43`).
Thrall tests prove one-index deletion and exports/usages protection only
(`thrall/test/lib/elasticsearch/ElasticSearchTest.scala:163-215`). Cheapest resolution: product
owners accept hard delete/recovery as deferred, or separately sponsor an operation-status and
recovery contract; no further static audit can choose between them.

### U1 - D3 deleted-result authorization

**Classification:** U/A2, H0/H1; **Proven defect, high confidence** (M2, M10). Legacy `GET /images`
detects `is:deleted` and, when the principal lacks blanket delete permission, restricts results to
the current uploader (`media-api/app/controllers/MediaApi.scala:571-573,744-758`). D3 parses the same
query and calls `searchAfter` without that rewrite (`media-api/app/controllers/MediaApi.scala:854-889`).
Kupua direct ES explicitly permits all authenticated users to see all deleted images, so current D3
matches a documented prototype deviation rather than production media-api authorization
(`kupua/src/dal/es-adapter.ts:460-475`). The failure is disclosure of deleted images and counts
beyond the existing production search policy.

This does not require changing production behavior. The smallest valid unblock is an endpoint-local
principal/uploader rewrite or a shared helper whose existing GET output is proven unchanged. It is
A0 only after a controller fixture covers admin, uploader, other internal user and syndication-hidden
cases, including indistinguishable counts/errors. Current search tests cover tier filters but not
this controller branch; no controller-level D3 auth test exists in the inspected suite. Production
benefit is limited to making the new route obey existing policy, not an A1 shared improvement.
Owners: media-api auth/controller/query and D3 tests. Cheapest check: the four-principal fixture.

### U2 - Query, date and sort parity outside migration

**Classification:** U/A2, H0/H1; **Proven date divergence, Inferred broader gate, high confidence**
(M10-M12, M20). Direct Kupua uses inclusive `gte/lte` for upload, taken and modified date bounds;
the shared media-api helper documents and implements exclusive `gt/lt`
(`kupua/src/dal/es-adapter.ts:496-515`;
`common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/filters.scala:25-48`). D3 forwards
the timestamps unchanged (`kupua/src/dal/grid-api-search-adapter.ts:111-119`). Legacy
`createSort` cannot represent Kupua's aliases/fallbacks/nested max sorts, which is why current D3
accepts a raw client clause and decision 04 selects a separate semantic builder
(`../../../03 Ce n'est pas une pipe dream/media-api-work/d3-search-after-03-sort-options.md:18-52,108-125`). Existing server AI also differs
from Kupua's blend/filter/total semantics (`media-api/app/controllers/MediaApi.scala:665-704`;
`kupua/src/dal/es-adapter.ts:1131-1272`).

Changing shared date or legacy sort behavior would be P/U because Kahuna calls it. Route-local
inclusive filters and a parallel semantic sort builder remain A0. AI can coherently inherit the
server limitation only as R; calling it identical is unsupported. Existing D3 tests prove cursor,
reverse, null-zone and one-index PIT mechanics, not cross-language query/date/sort equivalence
(`media-api/test/lib/elasticsearch/ElasticSearchTest.scala:774-1195`). Cheapest checks are a
language-neutral fixture bank covering every effective SearchParams field, inclusive boundary
documents, every static/configured/special sort and AI filters/totals. Owners: Kupua DAL, media-api
QueryBuilder/sort endpoint and tests. Current production benefits only from tests around shared
semantics; the endpoint-local fixes serve Kupua.

### U3 - Partial results, expiry and graceful absence

**Classification:** U/A2, H0/H1; **Proven, high confidence** (M2, M25, M27). media-api allows
partial search results by default, logs a timeout, then maps the returned hits and total; D3 neither
rejects `isTimedOut` nor incomplete shards (`media-api/app/lib/elasticsearch/ElasticSearch.scala:82-99,723-725,847-885`).
Kupua's direct adapter retries expired PIT errors against live data, while the D3 client throws on
network/non-2xx and the store can publish a failed search
(`kupua/src/dal/es-adapter.ts:1051-1124`;
`kupua/src/dal/grid-api-search-adapter.ts:131-145`;
`kupua/src/stores/search-store.ts:2460-2478`). This violates both exact-coordinate claims and the
development-phase graceful-absence directive.

The valid H0 unblock is endpoint-local fail-closed treatment for timed-out/incomplete responses and
a Strangler fallback only before an API session has been established. Once a session publishes
coordinates, expiry or uncertainty must terminate/re-anchor rather than continue live; that latter
boundary joins P1 for H1. Existing D3 integration tests cover successful pages, not timeout/shard
failure; normal E2E blocks API calls and therefore cannot prove the chosen fallback
(`kupua/e2e/shared/helpers.ts:18-38`). No shared production route needs to change. Owners are D3,
Strangler/store and API-mode tests. Cheapest checks: deterministic timeout/incomplete-shard result
fixtures plus network/non-2xx first-page and continuation tests.

### U4 - Production browser routing and authentication transport

**Classification:** U runtime/contract, H0-H2; **Proven source gap, medium-high confidence** (M27,
M28). Current Kupua service discovery says satellite services require separate same-origin proxy
prefixes, but checked-in Vite config guards only `/api` and is development infrastructure
(`kupua/src/dal/grid-api/service-discovery.ts:1-25,93-117`; `kupua/vite.config.ts:57-94`). Common
CORS/CSRF behavior is configured globally, and repository deployment metadata proves autoscaling
services but not a Kupua ingress or effective origin policy
(`rest-lib/src/main/scala/com/gu/mediaservice/lib/play/GridComponents.scala:29-44`;
`../../../../../riff-raff.yaml:7-59`). API-key `ReadOnly` and `Syndication` tiers allow GET only, so
POST D3 is not transport parity for those machine clients; browser Panda users are Internal
(`common-lib/src/main/scala/com/gu/mediaservice/lib/auth/ApiAccessor.scala:8-33`;
`rest-lib/src/main/scala/com/gu/mediaservice/lib/auth/Authentication.scala:103-122`).

The programme needs an explicit intended principal set and checked-in/effective same-origin routing,
CSRF/CORS and satellite proxy design. That can be additive if it introduces a Kupua ingress without
altering existing origins, but source cannot prove it. Failure means browser requests are blocked,
credentials are sent to the wrong origin, or H2 links cannot be invoked. D3 auth-provider tests
prove a limited key is rejected on POST, not browser deployment
(`rest-lib/src/test/scala/com/gu/mediaservice/lib/auth/ApiKeyAuthenticationProviderTest.scala:75-85`).
Cheapest check: platform/auth owners inspect effective ingress configuration and run one HTTP-level
cookie POST plus satellite action test without exposing credentials.

### R1 - Strong bulk and optimistic concurrency

**Classification:** R now, P for stronger semantics, A2, H2; **Proven, high confidence** (M30,
M37, M40). Current Kahuna bulk work is client fan-out with concurrency 30 and `Promise.allSettled`,
returning only fulfilled results (`kahuna/public/js/util/batch-tracking.js:5-64`). Mutation DTOs have
no operation ID or expected version, Kinesis uses a random partition key, and common Dynamo updates
carry no conditional expression (`common-lib/src/main/scala/com/gu/mediaservice/lib/aws/ThrallMessageSender.scala:67-90`;
`common-lib/src/main/scala/com/gu/mediaservice/lib/aws/Kinesis.scala:35-56`;
`common-lib/src/main/scala/com/gu/mediaservice/lib/aws/DynamoDB.scala:197-218`). Collections,
leases, exports and delete state are projected through separate owners with different ordering.

Kupua can reuse this contract as explicit per-item partial success, capped concurrency and
poll/reload completion. It cannot promise atomicity, compare-and-set or safe replay. Those stronger
claims need durable operation/version state across multiple services and are P. They may benefit
production, but source does not establish an agreed defect contract or bounded one-service rollback,
so no A1 candidate exists. Existing Thrall tests prove successful field updates and some stale
metadata rejection, not end-to-end command deduplication or an all-or-nothing batch
(`thrall/test/lib/elasticsearch/ElasticSearchTest.scala:218-267,357-470,617-738`). Cheapest
resolution: one product decision accepting per-item semantics; if rejected, stop H2 planning and
sponsor a separate mutation architecture decision.

### A2-1 - Additive browse traffic is operationally shared

**Classification:** A0/A2 for corrected H0 routes; **Measured in part, otherwise
Measurement-needed, high confidence** (M2, M4, M7, M9, M14-M18, M26). D3 shares media-api's JVM,
ES client, auth, quota cache and `ImageResponse` path with legacy traffic
(`media-api/app/MediaApiComponents.scala:13-45`). A 200-hit page measured about 373KB raw/70KB gzip
on the ES leg, about 137ms to enrich/serialize, about 29ms of signing, and an additional 28ms for
an exact first-page count; the lean writer that reduced envelope work was reverted
(`../../../03 Ce n'est pas une pipe dream/media-api-work/d3-search-after-04-performance.md:118-130,190-258`). D1, D2, D4-D7, C1-C3 and D9 add PIT,
full-corpus counts/aggregations, sequential walks or large enriched envelopes.

No source evidence supplies production rates, ASG/JVM shape, ES headroom, final Argo bytes, active
PITs, retained segments, heap, file descriptors or autoscaling recovery. The failure mode is
unchanged contracts but degraded Kahuna latency/availability or ES resource exhaustion. The
smallest unblock is the exact measurement gates in Section 10, with feature-level rollback. The
shared single-pass `ImageResponse.create` optimization might independently benefit production, but
the current evidence does not prove sustained-load capacity neutrality or deterministic output;
therefore it is not A1. Existing perf evidence measures selected TEST/dev paths, not production
capacity. Owners: media-api, ES/SRE and each optional service.

### R2 - Optional presentation and high-cardinality seek

**Classification:** A0/A2 where retained, R where deferred, H0/H1; **Proven product-safe reduction,
medium-high confidence** (M15-M17, M20, M23). Keyword/date distributions feed scrubber labels and
coarse seek evidence; their methods are optional and callers have fallback behavior
(`kupua/src/dal/types.ts:384-455`; `kupua/src/stores/search-store.ts:3288-3343,4088-4165`). The
active plan records 310,185 distinct credit values and 63,776 sources in production evidence,
making full composite enumeration normally bounded/incomplete rather than an exact universal
primitive (`../../../03 Ce n'est pas une pipe dream/media-api-work/media-api-01-capability-inventory.md:762-779`). Collection tree/counts and AI also
have coherent absent/reduced states (`kupua/src/stores/collection-store.ts:116-208`;
`kupua/src/main.tsx:21-28`).

The safe boundary is to keep exact list coordinates independent of approximate presentation,
defer D5 when cardinality defeats its value, and hide labels/counts/AI when optional services are
absent. Ignoring provenance could let incomplete buckets fabricate null boundaries or ranks. No
existing production contract changes; runtime work is A2 when enabled. Unit tests establish
bounded result/provenance algorithms, not production value or service capacity. Cheapest check:
one pre-agreed value/cost decision using bounded production cardinality and route measurements,
not another endpoint design.

## 6. Easy additive/shared unblocks

“Easy” means bounded ownership and evidence, not low line count. There are **seven easy A0
candidates and zero easy A1 candidates**. Static footprint is stated without effort estimates.

| ID | Class / preserved contract | Why existing callers cannot regress | Static footprint and rollback | Required acceptance evidence |
|---|---|---|---|---|
| **E1 D3 deleted authorization** | **A0.** New route matches legacy per-principal result policy. | No existing production caller reaches D3; GET remains unchanged (`media-api/conf/routes:12-31`; `kahuna/public/js/services/api/media-api.js:41-77`). | media-api controller/query helper + D3 auth tests; remove/disable D3 route to roll back. No persistent state or coordination. | Admin/uploader/other/syndication fixture proving hits, counts and errors leak no hidden existence. |
| **E2 D3 date and failure semantics** | **A0.** Endpoint-local inclusive bounds and fail-closed timeout/shard behavior. | Shared exclusive date helper and legacy partial-result behavior stay untouched (`common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/filters.scala:25-48`; `media-api/app/lib/elasticsearch/ElasticSearch.scala:82-99`). | D3 query/result path and fixtures only; route rollback. | Exact boundary documents plus timed-out/incomplete response fixtures. |
| **E3 Semantic sort builder** | **A0.** New endpoint-only `orderBy` builder; legacy `createSort` preserved. | Kahuna remains on the existing builder; companion plan explicitly forbids modifying it (`../../../03 Ce n'est pas une pipe dream/media-api-work/d3-search-after-03-sort-options.md:108-125`). | media-api sort module/model, D3 request, Kupua adapter and fixture corpus; versioned route/client rollback. | Language-neutral parity for every alias, fallback, direction, nested max and null-zone tuple. |
| **E4 D7 count/tickers** | **A0/A2.** New count-only route reuses existing ticker definitions; GET response unchanged. | New route has no legacy reachability and leaves `GET /images` semantics intact. Existing ticker machinery is server-owned (`media-api/app/lib/elasticsearch/ElasticSearch.scala:65-78,380-437`). | media-api route/model/query, Strangler override and poll tests; feature flag rollback. | Exact one-count-owner fixture and fused-vs-separate CPU/ES/latency measurement. |
| **E5 C1/C2 facets/typeahead** | **A0/A2.** New full-context, tier-aware aggregation route; legacy metadata/completion endpoints unchanged. | Separate path; no need to alter `GET /images/metadata/:field` or completion routes (`media-api/conf/routes:7-35`). | media-api aggregation model/query, Kupua adapter/store wiring; endpoint feature rollback. | Allowlist/caps; verbatim-path, nested/reverse-nested, current-query and hidden-tier fixtures; request-rate measurement. |
| **E6 Existing single-image read** | **A0 reuse/A2.** Kupua calls authenticated `GET /images/:id` unchanged. | No contract modification; current Kahuna and metadata-editor already use it (`kahuna/public/js/services/api/media-api.js:93-108`; `metadata-editor/app/controllers/EditsController.scala:50-66`). | Kupua Strangler/detail and enrichment commit only; client feature rollback. | Adapter 404/hidden/API-absence fixtures and single-hit traffic/payload measurement. |
| **E7 Existing H2 actions** | **A0 reuse/A2/U.** Invoke only HATEOAS-advertised single-image metadata, collection, crop, usage, lease, soft-delete and soft-undelete contracts. | Server contracts and current callers are unchanged; action omission remains the permission gate (`media-api/app/lib/ImageResponse.scala:123-194`). | Kupua action executor, per-service proxy/config and per-item UI state; disable each action independently. No new server facade/state. | HTTP auth/hidden tests, failure/acknowledgement fixtures, capped fan-out and service-specific capacity measures. |

No easy A1 dossier survives the definition. The shared `ImageResponse.create` single-pass rewrite
has measured promise and production benefit, but lacks existing output-contract proof and sustained
capacity evidence (`../../../03 Ce n'est pas une pipe dream/media-api-work/d3-search-after-04-performance.md:222-258`). Soft-delete acknowledgement,
lease replacement, usage deletion and migration completion are demonstrably weak, but each lacks
the full caller, rollback, performance-neutrality or one-service boundary required for A1. They
remain separate production candidates, not hidden Kupua prerequisites.

## 7. Deletion and restore assessment

### Permission and discovery

Per-image response actions are the valid discovery boundary. `ImageResponse` emits actions only to
the Internal tier and advertises soft delete only when the caller is uploader/authorized and the
image has neither exports nor usages (`media-api/app/lib/ImageResponse.scala:123-194`;
`common-lib/src/main/scala/com/gu/mediaservice/model/Image.scala:31-39`). The controller repeats
visibility, deletability and permission checks; syndication-hidden/missing returns 404, forbidden
returns 403 and protected returns 405 (`media-api/app/controllers/MediaApi.scala:332-397`). Root
discovery exposes an undelete template unconditionally, but its controller separately checks
uploader/delete permission or the special reaper case
(`media-api/app/controllers/MediaApi.scala:120-130,399-429`;
`media-api/test/lib/ImageExtrasTest.scala:177-249`). Hard delete is a route, not an advertised image
action. Kupua should therefore never infer permission from route knowledge or root templates.

### Separate verdicts

| Operation | Verdict | Exact semantics Kupua may claim | Limitation / failure behavior |
|---|---|---|---|
| **One-image soft delete** | **A0 reuse, runtime U/A2.** | Invoke the advertised `delete` action. Authorization and no-exports/no-usages checks remain server-owned. Treat `202` as request acceptance and poll/reload. | The controller starts status persistence and subsequent Kinesis publication but returns `Accepted` without composing that future (`media-api/app/controllers/MediaApi.scala:361-397`). A status or publication failure can therefore follow `202`. |
| **Many-image soft delete** | **R/A2.** | Capped client fan-out of the unchanged single-image action, with explicit per-item fulfilled/rejected outcomes. | No bulk contract, transaction or operation status exists. Kahuna's common batch helper uses concurrency 30 and `allSettled`, returning only fulfilled values (`kahuna/public/js/util/batch-tracking.js:5-64`). “Batch complete” cannot mean all succeeded. |
| **One/many soft undelete** | **A0 reuse for one; R/A2 for many.** | Invoke existing PUT after action/permission discovery and treat projection as asynchronous. The one-image controller awaits archive marking and deletion-status update before publishing (`media-api/app/controllers/MediaApi.scala:399-429`). | The archive service has its own authorization boundary, so the broader reaper/uploader predicate does not prove downstream acceptance. Many-image behavior is client fan-out only. Cheapest check: reaper-deleted image, caller without `ArchiveImages`, mocked archive response. |
| **One-image hard delete** | **R now; P for dependable completion.** | Nothing in minimum writable Kupua. An administrative caller may claim only that Kinesis accepted the command. | Thrall can consume a protected-image rejection as success, deletes C/M independently, and does not await S3 cleanup (`thrall/app/lib/elasticsearch/ElasticSearch.scala:469-499`; `thrall/app/lib/kinesis/MessageProcessor.scala:155-177`). |
| **Many-image hard delete** | **R/P.** | Deferred. The reaper remains an administrative eligibility-selected batch, not an arbitrary ID API. | Reaper eligibility excludes retained-value images and caps a request at 1,000; it awaits cleanup and stores results, but that contract cannot be generalized to selected images without a new production programme (`common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/ReapableEligibility.scala:17-43`; `thrall/app/controllers/ReaperController.scala:91-186`). |
| **Restore after soft delete** | **A0 reuse.** | Existing undelete only, preserving archive-first semantics. | Eventual ES projection and the downstream authorization unknown remain. |
| **Restore after hard delete** | **R.** | No end-user promise. | Replica restore requires `UploadImages`, replica configuration, an absent main original, temporary-file/S3 reconstruction, satellite aggregation and a Kahuna redirect (`image-loader/app/controllers/ImageLoaderController.scala:576-642`; `common-lib/src/main/scala/com/gu/mediaservice/ImageDataMerger.scala:10-54`). User hard delete retains metadata/status differently from reaper, so restoration can reconstruct a still-deleted record. |

Deletion touches media-api, soft-delete DynamoDB, metadata-editor/archive, Kinesis, Thrall, both ES
indices during migration, image/thumbnail/PNG S3, and for hard restore image-loader plus collections,
edits, leases, usages, crops and rights. Single soft delete/undelete can reuse current contracts with
no server changes. Bulk and hard operations are not credible under stronger semantics merely by
adding a Kupua button.

## 8. Other write-readiness assessment

The backend-serving strategy is not a write dead end. Existing service owners already expose most
minimum commands, but the viable H2 contract is **per-image, asynchronous and partially successful**.

| Mutation family | Existing command/owner and current callers | Additive viability | Completion and conflict semantics |
|---|---|---|---|
| **Single metadata** | metadata-editor `PUT /metadata/:id/metadata`; Kahuna calls and polls (`metadata-editor/conf/routes:15-22`; `metadata-editor/app/controllers/EditsController.scala:146-173`). | **A0 reuse.** Follow permission-gated edit link. | Uploader-or-`EditMetadata`; Dynamo write precedes synchronous Kinesis publication, then Thrall projection. No expected version. |
| **Labels and usage-right overrides** | metadata-editor authenticated routes (`metadata-editor/conf/routes:11-29`; `metadata-editor/app/controllers/EditsController.scala:102-140,207-226`). | **A0 reuse with auth caution.** Invoke only through advertised/gated UI state. | Some routes authenticate without the uploader/edit filter used by metadata. Preserve current authorization; do not interpret endpoint availability as permission. |
| **Multi-edit** | Kahuna fans out single-image commands and returns fulfilled items. | **R/A2.** Coherent as capped per-item partial success. | No atomicity, rollback or operation-wide retry. A repeated command is a new last-write attempt. |
| **Collections** | collections POST/DELETE; Kahuna follows service links (`collections/conf/routes:4-13`; `collections/app/controllers/ImageCollectionsController.scala:28-72`). | **A0 reuse.** | Add appends in Dynamo. Remove reads a list then writes a replacement without a condition, so concurrent changes can be lost (`collections/app/store/ImageCollectionsStore.scala:34-53`). |
| **Crop/export create/delete** | cropper POST/DELETE actions (`cropper/conf/routes:3-7`; `cropper/app/controllers/CropperController.scala:51-157`). | **A0 reuse/A2.** | Create completes image/S3 work before event publication. Delete removes stored crops before publishing; failure between boundaries can leave ES projection stale. No batch transaction. |
| **Usage record/status/delete** | usage service, with existing media-api/Kahuna callers (`usage/conf/routes:3-13`; `usage/app/controllers/UsageApi.scala:171-365`). | **A0 reuse/A2.** | Several writes enqueue to a process subject then return `202`; single/delete-all table futures and publication are not uniformly awaited. Delete permission is server-owned. |
| **Leases** | lease POST/PUT/DELETE actions (`leases/conf/routes:3-13`; `leases/app/controllers/MediaLeaseController.scala:52-151`). | **A0 reuse, authorization U.** | Routes are authentication-only. Replacement clears old leases/publishes removals, writes replacements, then publishes additions; the HTTP replace path launches that future without awaiting it. |
| **Syndication/rights/photoshoot** | metadata-editor and media-api/usage commands; Kahuna already invokes syndication (`media-api/app/controllers/MediaApi.scala:460-545`; `kahuna/public/js/services/api/media-api.js:127-152`). | **A0 reuse/A2.** | Rights changes and photoshoot propagation can fan out; syndication records a usage asynchronously. No operation status spans all affected images/services. |

**Optimistic concurrency:** absent at the public command boundary. The shared Dynamo update builder
has no condition expression (`common-lib/src/main/scala/com/gu/mediaservice/lib/aws/DynamoDB.scala:197-218`).
Thrall does reject stale timestamps for selected metadata/usage paths, but collections, leases,
exports, rights and deletion do not share one version authority. **Idempotency:** there is no request
ID on `UpdateMessage`, and random Kinesis partition keys do not serialize one image's independently
published commands (`common-lib/src/main/scala/com/gu/mediaservice/lib/aws/ThrallMessageSender.scala:67-90`;
`common-lib/src/main/scala/com/gu/mediaservice/lib/aws/Kinesis.scala:35-56`).

Therefore H2 is credible only if the product accepts visible “pending,” per-item results, polling or
reload confirmation, and last-write outcomes. If it requires compare-and-set, all-or-nothing bulk,
safe automatic retry or durable cross-service audit correlation, stop: that is a separate P-class
mutation programme.

## 9. Read/query/auth/deployment constraints

1. **Semantic parity required for correctness:** default deleted/replaced hiding; per-principal
  deleted search; tier visibility; inclusive Kupua date bounds; every filter; semantic sort and
  authoritative tuple; exact first-page total; page/total/map/rank/range snapshot identity; and
  hidden IDs omitted like missing IDs. These cannot be approximated without changing visible
  membership or disclosing data (M2-M3, M7, M10-M13, M18-M19).
2. **Approximate presentation may remain approximate:** date/keyword tick labels, percentile anchors,
  bounded distribution coverage and live facet/ticker values, provided none mints an exact cursor,
  rank or snapshot claim (M14-M17, M21, M23).
3. **Client-only behavior remains client-side:** selection membership, density/windowing, URL state,
  fullscreen/traversal coordination and optional presentation fallbacks (M1, M22, M24-M25).
4. **Current production limitation Kupua may inherit honestly:** media-api AI ranking/filter/total
  semantics, partial asynchronous mutation projection, and request-local live facets. It may not
  call those identical to direct ES or exact to a browse snapshot (M20, M29-M35).
5. **Production behavior that must change for H1:** canonical migration reads/getters, cutover/write
  admission and same-snapshot D1/D2/D4. Existing GET sorting, date bounds and Kahuna partial-result
  behavior need not change; Kupua routes can stay parallel (P1-P2, E1-E5).
6. **Information disclosure:** single-image and D9 responses must apply tier visibility; bulk must
  omit unauthorized IDs exactly like missing ones. Search counts and errors must not reveal deleted
  or syndication-hidden records. Possession of an action URI is not permission (U1, M7, M28).
7. **Authentication transport:** D3's POST is suitable for cookie-authenticated Internal users, not
  existing GET-only machine tiers. That is acceptable only if those principals are explicitly out
  of the new route's contract (`common-lib/src/main/scala/com/gu/mediaservice/lib/auth/ApiAccessor.scala:20-33`).
8. **Optional/deployment modes:** collections, quota and AI can degrade to absence. D3 is currently a
  hard search dependency once selected and violates the development graceful-absence rule on
  failure. Production same-origin routing, satellite proxying, CORS/CSRF and credentials remain U;
  Vite configuration is not deployment evidence (M23, M27).

Ordinary indexing races are bounded but real outside migration: current page one and PIT open run in
parallel, history stores no snapshot, rank is live and range has no PIT. H0 may state this as
best-effort prototype behavior. H1 cannot, because its purpose is removal of direct ES while
preserving exact positional semantics.

## 10. Operational impact of additive traffic

Current evidence is enough to require measurement, not enough to call capacity a blocker. D3's
200-hit measurements cover ES response size, exact count and envelope/signing cost; they do not
cover production traffic, final Argo payload, route CPU/allocation under concurrency, autoscaling,
PIT retention or the combined companion endpoints (`../../../03 Ce n'est pas une pipe dream/media-api-work/d3-search-after-04-performance.md:118-130,190-258`).
The following gates are the cheapest sufficient decisions; owners set numeric budgets before seeing
results.

| Gate | Scope and required observations | Pass/fail meaning |
|---|---|---|
| **G0 Deployment proof** | Platform owner records deployed SHA, intended principal/origin, route exposure, ASG min/desired/max and instance type, JVM heap/dispatcher, proxy/body/timeout limits, scaling policy, effective IAM and production ES version without exposing secrets. | Any unknown affecting reachability or headroom keeps production enablement U. |
| **G1 Shared-runtime canary** | Replay a pre-registered multiplier of observed production p99 five-minute search starts/pages/seeks/tabs. Record existing Kahuna p95/p99/error rate, media-api CPU/GC/allocation/post-GC heap, ES queue/rejections and scaling recovery. | No ES rejection or pre-registered legacy bound breach. Otherwise isolate/reduce traffic; do not call route A0-safe operationally. |
| **G2 PIT/session capacity** | At projected and stress concurrency under update/delete load: open contexts, segment bytes/count, deleted-doc liveness, ES heap/disk/FD, search rejections, close/expiry cleanup and return-to-baseline time. | Any unbounded context/retention or missed cleanup rejects H1 transport; H0 remains non-PIT/reduced. |
| **G3 Heavy query family** | Every supported sort/filter at 65k map, 5k range, exact rank and bounded composite/date/percentile workloads, interleaved with pages. Record ES `took`, queue delay, media-api CPU/heap and bytes. | Each feature has its own cap and rollback; one failure reduces that feature, not the whole H0 path. |
| **G4 Count ownership/polling** | Compare parallel D3+D7, fused D3 and D7-total/D3-no-count at measured active-tab rates. Verify exactly one initial exact count and correct ticker names/subcounts. | Choose one owner only after latency/CPU/ES bounds pass; D7 polling remains independently required. |
| **G5 D9 multi-read** | 1/200/500/1,000 IDs, mixed hidden/missing/duplicate migration copies and concurrent selections. Record final compressed/raw bytes, signing/enrichment CPU/allocation, peak heap/GC and abort behavior. | Establish one server cap and matching client chunks; no implicit inheritance of direct `_mget` 1,000. |
| **G6 Payload/media delivery** | Final Argo bytes and serialization/signing at 1/50/200 hits; separately browser thumbnail/full-image/prefetch origin requests through the intended production media topology. | ES-leg bytes cannot substitute for final response or S3/imgops/CDN load. |
| **G7 Availability/rollback** | Cross-instance requests, scale/restart, network/non-2xx/timeout/partial shards, lost response and feature rollback. | Before session creation fallback may be allowed; after coordinates publish, uncertainty must terminate/re-anchor. Rollback must be independently executable per route/action. |
| **G8 H2 service load** | Per owner: request rate, Dynamo throttling, Kinesis/Thrall lag/retries, crop CPU/S3, usage/lease queues and per-item completion. | Accept service-specific caps before enabling fan-out. There is no single H2 rollback boundary. |

D3 requires no new proven IAM capability because it reuses media-api's ES and signing dependencies,
but effective grants remain an external check. It has no new instance-local session state today;
future opaque sessions must pass cross-instance/restart tests. Process-local AI/quota caches are
performance optimizations, not authoritative browse state.

## 11. Current migration-plan assessment

| Plan family | Current impact reclassification | Integrity conclusion |
|---|---|---|
| **A: `searchRange`, `getAggregation`, `getById`, AI** | `getById` is genuine A0 reuse/A2. `searchRange` and corpus `getAggregation` have no current product caller and should be R, not migration work. AI is R/U because server semantics differ, not “client-only identical.” | The old “existing endpoint means parity” assumption is stale. Keep only the proven getter win. |
| **B1/B2 completed client work** | A0/none evidenced. No production contract change. | Valid and complete. It reduces client coupling but does not prove any server route safe. |
| **C1/C2 facets/named/usage aggregations** | A0/A2, not “trivial zero-impact.” Needs verbatim fields, nested/reverse-nested parent counts, tier behavior, caps and owner wiring for collections. | Keep, measurement-gated. Collection store routing omission remains material. |
| **C3 date distribution** | A0/A2 presentation only. Special-date populated buckets remain approximate and cannot authorize rank. | Keep optional; response provenance is correctness, not polish. |
| **C4 null-zone D3 behavior** | Endpoint-local A0/A2 after sort/query/auth parity. | Built mechanics are useful, but D3 acceptance remains held. |
| **D1 position map** | P/A2 under H1 because it must use the browse snapshot; R if disabled. | Not an isolated map endpoint after decision 04. |
| **D2 ID range** | P/A2 under H1; selection owns a separate datasource, authoritative tuple/snapshot is required. | Existing plan's standalone operation snapshot is stale; same displayed snapshot wins. |
| **D3 cursor search** | U/A2 for H0 until auth/date/partial/absence corrections; P when folded into H1 semantic session. | “New route” proves reachability isolation, not compatibility or zero runtime impact. |
| **D4 exact rank** | P/A2 in H1. Live `_count` is not exact to the displayed snapshot. | Algorithm existence does not make the endpoint additive. |
| **D5 keyword target walk** | R/A2; production cardinality undermines value. | Defer unless bounded measurement proves a useful horizon. |
| **D6 keyword distribution** | A0/A2 and optional, with explicit incomplete coverage. | Keep only as presentation evidence. |
| **D7 counts/tickers** | A0/A2; polling required, initial count owner unresolved. | Small contract footprint but high-frequency operational gate. |
| **D8 PIT** | P/A2; standalone raw open/close is superseded by semantic session and read epoch. | The workplan's original S-sized framing is invalid. |
| **D9 mget** | U/A2 until visibility, cap, migration source and selection-owner wiring are fixed; P epoch dependency in H1. | Not a simple Strangler override and not “no 200 cap.” |
| **D family estimate/distribution item not numbered** | A0/A2 when approximate; P only if used as exact snapshot coordinate. | Keep semantic distinction explicit rather than hiding it in D numbering. |

Every active plan family maps to M1-M20. The major integrity defect is not missing endpoints; it is
mixing three statements: “new route,” “semantically equivalent” and “operationally harmless.” They
must remain separate. Current source also disproves full Strangler ownership: selection and
collection stores construct ES directly (M1, M7, M9).

## 12. Scoped alternatives

| Path | Contract/runtime shape | Honest capability horizon | Decision |
|---|---|---|---|
| **Full additive A0** | Correct D3 locally; add measured routes; preserve every production path. | H0 hybrid only. Exact H1 session operations and strong H2 semantics remain direct/reduced. | Viable after A2 gates, but do not call it full backend migration. |
| **Additive + A1** | Same as above plus bounded shared fixes. | No additional established horizon because no A1 candidate meets the evidence bar. | Reject as a distinct path today. Promote individual fixes only after all A1 gates pass. |
| **Measured A2** | H0 A0 routes enabled after G0-G7; feature-specific caps/rollback. | Current prototype and selected read enrichments. | **Recommended now.** Best proportionate path. |
| **Contained pinned-C** | One physical C snapshot; strict client fail-closed gates; D1/D2/D4 disabled or aligned; forced cutover reload. | Reduced H1 during migration, not transparent continuity. | Use only if Kupua must run during backfill. Otherwise disable media-api pagination while migration is active (`grid-index-migration-05-scope-reassessment.md:84-166`). |
| **Explicit no-migration support** | A0/A2 ordinary operation; reliable migration gate; known ordinary page/PIT race accepted or pagination reduced. | H0 prototype outside migration. | Smallest backend blast radius and default reduction until P is sponsored. |
| **Decision-04 P programme** | Canonical R epoch, global fence/readiness, semantic session, same-snapshot coordinates and strict cutover. | Full H1 and foundation for stronger read semantics. | Trigger only after product/platform sponsorship for migration-transparent Kupua or independent migration hardening. |
| **H2 existing-contract mode** | HATEOAS actions, per-item partial success, async projection, no hard delete/recovery or strong CAS. | Credible reduced writable Kupua. | Recommended H2 boundary. Do not add a facade that merely renames distributed owners. |
| **H2 strong mutation programme** | Durable operation/version/idempotency/completion across owners. | Atomic bulk, dependable hard delete/recovery and conflict-safe writes. | P-class; trigger only if reduced semantics are rejected. |

The single programme recommendation remains **measured H0 A0 integration plus explicit H1/H2
reductions**. It preserves the original risk constraint and produces usable evidence. The larger
paths have legitimate production value, but hiding them inside Kupua would make approval and
rollback less honest, not safer.

## 13. Microservice footprint

| Viable path | Components that change | Production reachability / ownership |
|---|---|---|
| **Recommended measured H0** | Kupua DAL/store; new media-api D3/D7/C1-C3 route code and endpoint-only query/sort helpers; auth/routing/config; ES capacity observation. Existing GET/search/sort behavior remains unchanged. | New routes have no proven production callers until Kupua is enabled; media-api JVM/ES are shared and therefore A2. |
| **Contained pinned-C H1 reduction** | Kupua search/PIT lifecycle, D3 fail-closed behavior, migration activity gate, client reload/disable operation. Possibly no new Thrall code. | Kupua-only code paths, but operational cutover coordination is production-reachable. Existing migration behavior remains unchanged. |
| **Full H1 P programme** | media-api, common-lib migration status/aliases, Thrall migration/write/delete/reaper/session admission, every mutation ingress, auth/config/infra and ES operations; D1/D2/D4 session operations. Image-loader/metadata/crop/usage/lease/collection owners participate where they can admit mutations. | Directly changes production Kahuna reads/getters, writes, cutover and operations. |
| **Reduced H2 writes** | Kupua action executor/state; production same-origin proxies/config for metadata-editor, collections, cropper, usage, leases and media-api; no owner contract change. Thrall/Kinesis/Dynamo/S3 receive added traffic. | Existing production-reachable commands reused unchanged; runtime A2/U per owner. |
| **Strong H2 P programme** | Above owners plus durable operation/version/audit state, Thrall projection and hard-delete/restore coordination, persistence/S3 and likely auth policy. | Material production contracts and state; no single rollback owner. |

No evidence requires changing image-loader for H0/H1 reads or media-api for ordinary H2 commands.
No evidence supports a centralized media-api write facade: it would add a coordinator without
removing downstream ownership, acknowledgement or failure boundaries.

## 14. Residual unknowns and team decisions

| Unknown / decision | Owner | Cheapest resolution and effect |
|---|---|---|
| Deployed D3 revision and actual callers | media-api/platform | Record deployed SHA and route traffic metadata. Until then source-present remains unreviewed/unknown, not production. |
| Effective Kupua ingress, CORS/CSRF, satellite proxies and intended principals | auth/platform/Kupua | Static config review plus one cookie-authenticated HTTP test per route family. Blocks H0/H2 production reachability. |
| D3 deleted-query policy | media-api/security | Four-principal deterministic fixture. Blocks H0 D3 acceptance. |
| Full query/filter/date/sort parity | media-api/Kupua | Language-neutral differential fixtures. Date inclusivity and semantic sort are known failures; remaining fields stay U until covered. |
| Timeout/partial-shard and API-absence policy | media-api/Kupua | Inject deterministic failed/partial results and network/non-2xx at first page/continuation. Blocks exact-coordinate publication. |
| Production media-api/ES headroom and PIT limits | SRE/ES/media-api | G0-G7 with budgets set before measurement. Blocks traffic enablement, not static route work. |
| D9 cap, hidden-ID behavior and migration source | media-api/Kupua/security | Mixed hidden/missing/C/M fixture plus G5. Blocks D9. |
| Whether reduced H2 semantics are acceptable | product/editorial/security | Approve per-item partial, async, no-CAS mode. A rejection triggers a P-class architecture decision rather than more endpoint work. |
| Soft-delete acknowledgement and undelete archive mismatch | media-api/metadata-editor | Controller fixtures with failed status, publish and archive authorization. Existing contract remains reusable only with its observed semantics. |
| Hard-delete completion/recovery requirement | Thrall/image-loader/SRE/product | Decide defer versus durable operation-status programme. Blocks only strong H2, not current H0 or soft delete. |
| Complete migration mutation/session ingress inventory | Thrall/migration owners | Decision 04 `CutoverReady` inventory. Any unowned principal blocks H1 cutover. |
| Production ES version and session transport mechanism | platform/media-api | Verify deployment metadata without data query; only after P approval run decision 04's exact-version transport research. |

## 15. Appendix A - active-plan inconsistencies

1. `searchRange` remains A-class despite having no current product caller; it should be deferred
   rather than counted as migration progress (`../../../03 Ce n'est pas une pipe dream/media-api-work/media-api-01-capability-inventory.md:153-180`;
   `kupua/src/dal/es-adapter.ts:691-696`).
2. `getAggregation` is described as a direct existing-route match even though the live caller uses
   contextual `getAggregations`, and the legacy route prefixes `metadata.`
   (`../../../03 Ce n'est pas une pipe dream/media-api-work/media-api-01-capability-inventory.md:248-283`;
   `media-api/app/lib/elasticsearch/ElasticSearch.scala:630-677`).
3. AI remains A-class even though the active findings document itself records ignored filters, and
   current client/server algorithms and totals differ (`../../../03 Ce n'est pas une pipe dream/media-api-work/media-api-01-capability-inventory.md:716-748`;
   `kupua/src/dal/es-adapter.ts:1131-1272`).
4. D3's “purely additive” containment is true for reachability but stale as a compatibility verdict:
   its controller omits the existing deleted-query permission rewrite
   (`../../../03 Ce n'est pas une pipe dream/media-api-work/d3-search-after-02-pr.md:50-65`;
   `media-api/app/controllers/MediaApi.scala:571-573,744-758,854-889`).
5. D3 still accepts client-resolved ES sort and raw PIT identity despite decision 04 selecting
   semantic `orderBy` and an opaque session (`media-api/app/lib/elasticsearch/ElasticSearchModel.scala:90-139`;
   `grid-index-migration-04-architecture-proposal.md:45-59`).
6. The D7/D8/D9 workplan's historical table still labels all three S-sized even though its own
   current banner says none is implementation-ready (`../../../03 Ce n'est pas une pipe dream/media-api-work/media-api-02-next-endpoints-d7-d8-d9-workplan.md:1-45`).
7. D9's historical “no 200 cap” contract conflicts with its current requirement to measure and
   enforce one server/client cap (`../../../03 Ce n'est pas une pipe dream/media-api-work/media-api-02-next-endpoints-d7-d8-d9-workplan.md:329-410`).
8. The broad plan describes C1/C2 as trivial while live usage facets require nested and
   reverse-nested parent counts and collection counts have a separate datasource owner
   (`../../../03 Ce n'est pas une pipe dream/media-api-work/media-api-01-capability-inventory.md:934-963`;
   `kupua/src/stores/collection-store.ts:110-143`).
9. The integration plan claims PIT overhead and 200-hit enrichment are negligible without the
   measurements later required by active evidence; the current measured envelope is about 137ms
   and production capacity remains unknown (`../integration-plan-api-first.md:606-647`;
   `../../../03 Ce n'est pas une pipe dream/media-api-work/d3-search-after-04-performance.md:222-258`).

## 16. Appendix B - unrelated production defects

None retained. Every proven production defect encountered either changes a scoped compatibility
verdict and is included above, or was omitted under the anti-goals. No speculative defect is listed.

## 17. Appendix C - source coverage and untraced surfaces

| Source family | Coverage in this audit | Untraced boundary / why it remains |
|---|---|---|
| Governing Kupua context and active media-api plans | Read in full: directives, AGENTS, worklog, `_index`, broad findings, D3 evidence/sort/perf, D7-D9, conventions, decision 04, scope reassessment and API-first plan. | Transport document 05 does not exist and was deliberately not designed; decision 04 delegates it (`grid-index-migration-04-architecture-proposal.md:372-441`). |
| Archive provenance | Only the three prompt-authorized additive/backcompat sections were read. | All archived technical designs remain non-authoritative by instruction. |
| Kupua DAL and ownership | All 18 interface methods, ES/Strangler/API routing, selection and collection owners were traced (`kupua/src/dal/types.ts:259-531`; `kupua/src/dal/strangler-adapter.ts:13-67`). | No exhaustive component inventory; client subfeatures were grouped into capability families. |
| Kupua query/position/history | CQL, filters, sorts, counts, maps, ranks, ranges, distributions, history and traversal call sites were traced to the owning methods. | Rendering/visual quality and unrelated store internals were excluded. |
| media-api reads/auth | Routes, controller, query/search/getter, sort, response/actions, auth tiers and representative tests were traced (`media-api/conf/routes:5-35`; `media-api/app/controllers/MediaApi.scala:151-176,550-889`). | Effective production traffic/config and complete external API-consumer inventory are unavailable in source. |
| Mutation owners | Metadata-editor, collections, cropper, usage, leases, media-api deletion, Thrall projection/delete, reaper and replica restore were traced to first durable/async boundaries. | Upload creation and pure Kahuna features without a scoped minimum-write dependency were excluded. |
| Migration/write coordination | Current C/M updater/delete behavior, decision 04 and cutover readiness were traced. | Complete credential/principal ingress inventory remains an H1 owner task, not inferable from checked-in callers. |
| Deployment/config | Riff-Raff service topology and config-loading boundary were read (`../../../../../riff-raff.yaml:1-59`; `common-lib/src/main/scala/com/gu/mediaservice/lib/config/GridConfigLoader.scala:15-48`). | Fleet shape, scaling, IAM, ingress, production ES version and capacity live outside this repository. |
| Tests | Representative D3 cursor/PIT, auth, deletion, migration mutation and Kupua routing/E2E fixtures were inspected, not run. | No controller failure-injection tests prove D3 deleted auth, partial shards, soft-delete acknowledgement or cross-service H2 completion. |
| External behavior | Decision 04's cited Elasticsearch 8.18 PIT/search/alias semantics were accepted as the active versioned authority. | No new web research was needed; the deployed ES version remains unknown. |
| Live systems and sensitive data | Not accessed. | Traffic, latency, capacity, deployed revisions and effective permissions therefore remain explicit measurement/static-config gates. |

## 18. What done looks like

- [x] The original additive/non-regression premise is supported by active and premise-only archive
  evidence; production-reachable, unreviewed D3, planned-only and unknown states are distinguished.
- [x] H0, H1 and H2 each have exactly one allowed verdict, confidence and an untied overall
  recommendation.
- [x] Contract/reachability and runtime impact are separate on every material capability; no new
  route is called operationally harmless merely because it is additive.
- [x] The 40-row matrix covers all 18 current `ImageDataSource` methods, completed B work, C1-C4,
  D1-D9, current workflows, optional services and minimum H2 mutations.
- [x] Migration is compared with every other proven P/U/R constraint without reopening its selected
  CAS/token mechanism.
- [x] Ten material dossiers state workflow, owner/callers, boundary, failure behavior, smallest
  unblock/reduction, production benefit, services, test limits, evidence and cheapest remaining check.
- [x] Seven bounded easy A0 dossiers prove isolation/reuse and rollback; no unsupported A1 claim is
  made.
- [x] Single soft delete, many-image delete, undelete and hard restore are separate; permission,
  protection, asynchronous acknowledgement, cleanup, migration, idempotency, concurrency and audit
  limits are addressed.
- [x] Metadata, collections, crops/exports, usages, leases and rights/syndication writes are grouped
  by existing command owner and completion semantics.
- [x] Query/filter/sort/date/total/facet/typeahead/AI/detail/position/history, auth/disclosure,
  optional services and deployment constraints are classified.
- [x] Exact A2 gates cover media-api/ES CPU and capacity, PIT resources, counts, heavy queries,
  mget, final payload/media, failure/rollback and H2 service load.
- [x] Every active A/B/C/D and D1-D9 family is reclassified; stale “small/additive” assumptions and
  separate datasource owners are identified.
- [x] Scoped alternatives select measured H0 A0 integration plus explicit H1/H2 reductions, and
  name the trigger for each larger P programme.
- [x] Microservice footprint, residual owners, capped plan inconsistencies and untraced source
  families are explicit.
- [x] No implementation plan, endpoint pseudocode, task estimate, product code, test run, build,
  profiling, live request, runtime log, credential or private response was produced.