# API-only ordinary-operation mode: revised implementation workplan

> **Archived, 15 September 2026: reference assessment, implementation not approved.** Preserve
> the workflow inventory, defects and test ideas. Its Dynamo/session/interlock architecture,
> stronger guarantees, deployment/caller uncertainty and phase gates are not current obligations.
> The operator has resolved the sole-caller/deployment question; use current source for behavior.
> Current scope: [media-api index](../../../03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/media-api-00-index.md).

**Date:** 2026-09-15  
**Status:** Implementation workplan. Source and tests were read; no product code, tests, builds,
profiling, live requests or real systems were used.  
**Decision served:** the smallest coherent implementation that preserves accepted current Kupua
workflows while Firefox makes no direct Elasticsearch requests in ordinary, non-migration use.

This document replaces the planning function of `../../../03 Ce n'est pas une pipe dream/media-api-work/media-api-01-capability-inventory.md` for
the reduced mode. That older file remains an amended historical inventory. Current source is the
authority for behavior and ownership; the newer migration, production-impact and source-audit
findings supply already-traced defects, not a substitute for current source.

## 1. Decision card

**The premise passes.** Every accepted current workflow has an additive backend boundary. Search
already depends on `ImageDataSource`; selection and collection counts are the two separate owners
that bypass it, and both can be injected from one mode composition root
(`kupua/src/stores/search-store.ts:1870-1877`,
`kupua/src/stores/selection-store.ts:357-369,423-434`,
`kupua/src/stores/collection-store.ts:110-143`). No accepted workflow requires a change to legacy
`GET /images`, Kahuna sorting, existing authorization defaults, mappings, writes or migration read
policy.

**Selected architecture:** media-api owns a semantic, state-backed browse session. Creation opens a
PIT on the one concrete physical index recorded by an open admission generation and returns page
one, its exact total, initial ticker counts, enriched hits and authoritative tuples. Continuation,
reverse paging, position map, exact locate/rank, range selection and exact seek are serialized
operations on that session. Live polling, contextual aggregations, collection counts and
presentation distributions are separate generation-gated operations and cannot mint session
coordinates. The current route's raw PIT and raw Elasticsearch sort become internal implementation
details (`media-api/app/lib/elasticsearch/ElasticSearchModel.scala:90-139`,
`media-api/app/lib/elasticsearch/ElasticSearch.scala:748-889`).

**Migration guarantee:** choose **atomic exclusion**, narrowly scoped to API-only read admission.
Official Thrall migration start conditionally changes a durable gate from `open(g)` to
`closing(g+1)`, rejects new API-only leases, drains already admitted API-only operations, then and
only then creates or aliases the migration index. It remains closed through `InProgress`, `Paused`
and `CompletionPreview`; completion keeps it closed through the existing alias action and reopens
only after fresh `NotRunning` plus a stable current-index name and UUID. This interlock does not
fence writes, change progressive legacy reads, alter alias actions, define cutover readiness or
change Kahuna. Current migration start creates the new index before assigning the migration alias,
and current completion performs the alias action without any Kupua admission step, so both methods
need the narrow hook (`thrall/app/lib/elasticsearch/ThrallMigrationClient.scala:78-118`).

A five-second media-api availability poll and the existing five-second migration-status refresh
are defense in depth, not the atomic mechanism. Official lifecycle closure is immediate at the
gate; visible clients clear invalidated state within a provisional five-second availability poll.
If an out-of-band migration or alias mutation bypasses the coordinator, the status monitor closes
the server gate within at most ten seconds and a visible client clears within at most twenty
seconds. Production enablement is blocked until the alias-mutator inventory proves official
migration cannot bypass the interlock; polling alone is not called atomic
(`common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/MigrationStatusProvider.scala:36-80`,
`scripts/src/main/scala/com/gu/mediaservice/scripts/EsScript.scala:146-176`).

**Acceptance floor:** ordinary search, all three browse tiers, both extension directions, seek,
sort-around-focus, detail/traversal, history/re-anchor, facets, typeahead, collection counts,
selection hydration and out-of-buffer range selection, exact counts, position maps, distributions,
enrichment and health-gated AI all remain. Exact list coordinates share one PIT. Current optional
service absence remains optional, and populated multi-valued special-date histograms remain
explicitly approximate. No other user-visible reduction is approved
(`kupua/AGENTS.md:102-149,184-199`).

**Largest risks:** shared session lineage and cleanup; the narrow Thrall interlock and complete
alias-mutator inventory; faithful server query/sort authorization; high-cardinality exact seek;
final Argo/enrichment cost; and unknown production ingress, capacity and fleet shape. Unknown load
blocks production traffic, not disabled implementation
(`production-impact-01-findings.md:435-489,565-602`).

**First implementation phase:** add the language-neutral semantic fixtures, typed protocol models,
disabled durable admission/session store and its fake-clock/CAS contract tests. Do not add another
Strangler override first. That phase proves query/sort identity, cross-instance state and migration
exclusion before a route can publish coordinates.

## 2. Target mode contract

### 2.1 Meaning of API-only

In **API-only ordinary-operation mode**, API-only means zero browser-to-Elasticsearch traffic. The
browser receives no ES URL or index name, opens no PIT, and sends no `_search`, `_count`, `_mget`,
aggregation or alias request. No runtime owner constructs `ElasticsearchDataSource`. The current
factory always constructs it and the Strangler delegates all but qualifying cursor pages, so the
new mode must be a separate closed branch rather than a larger Strangler
(`kupua/src/dal/index.ts:29-41`, `kupua/src/dal/strangler-adapter.ts:13-67`).

The name does **not** promise one production URL or remove every non-ES browser path. Current
thumbnails use `/s3`, full images use `/imgproxy`, collection trees use their optional service, and
AI health/embedding use a development proxy (`kupua/src/lib/image-urls.ts:45-54,193-245`,
`kupua/src/stores/collection-store.ts:172-208`,
`kupua/src/lib/bedrock-proxy-client.ts:18-39`). The implementation replaces the AI ES/Bedrock
browser path with media-api, but may retain checked-in S3/imgproxy and satellite proxy paths. Final
production media routing and signed-URL consumption are separate reachability/load gates. This is
deliberately smaller than the original one-URL API-first proposal
(`integration-plan-api-first.md:1-11,125-139`).

### 2.2 Core failure and mode separation

Core browse creation or continuation failure is not data absence. `migration-unavailable`, stale
gate state, session expiry, unknown lineage, timeout, incomplete shards, malformed response or
transport uncertainty produces an unavailable/retry/re-anchor state. Already committed images may
remain read-only while a new session is created; no failure becomes an empty result and no API-only
call invokes ES. This is the required API-only exception to the development-phase graceful API
absence rule: optional-service enrichment and presentation distributions may disappear, and collections or
AI may follow their existing underlying health/service absence; required facets, typeahead, counts
and core search cannot pretend to have an ES baseline. Implementation must update `kupua/AGENTS.md`,
`kupua/exploration/docs/deviations.md` and the copied agent directive when that behavior lands.
Current cursor search throws on non-2xx while direct ES retries an expired PIT live, demonstrating both sides
that must be replaced (`kupua/src/dal/grid-api-search-adapter.ts:131-163`,
`kupua/src/dal/es-adapter.ts:1043-1098`).

Direct-ES development mode remains a separate supported mode. A session records its mode when the
application starts; mode cannot change on retry, refresh or feature rollback. API-only rollback
shows unavailable and closes its generation. It never selects direct ES. Existing direct-mode unit,
special-sort and habitual E2E tests remain regression evidence.

### 2.3 Ordinary indexing and migration

Ordinary indexing, metadata projection and deletion continue while a browse session is open. The
PIT fixes membership and order for page one, total, continuation, map, rank and range. Deliberately
live counts and facets may observe later writes but only signal freshness or presentation data;
they do not insert results or supply exact cursors. Current page one, rank, map and range use live
or independent snapshots, which is inconsistent even outside migration
(`kupua/src/stores/search-store.ts:2196-2249`,
`kupua/src/dal/es-adapter.ts:1278-1439,1982-2009,2251-2282`).

Active migration is unsupported. Gate closure invalidates all old generations before official
migration creation begins. Paused and completion preview remain unavailable. A pre-migration handle
cannot resume after completion because reopening keeps the incremented generation and records the
new concrete current-index identity. Direct-ES mode is independent and is never an API-only
fallback. This plan does not change Thrall write behavior, current C+M legacy reads, M-first legacy
getters, completion alias semantics or rollback.

### 2.4 Non-goals

- No browsing through migration and no import of decision 04's canonical read/write epoch, global
  mutation fence, `CutoverReady`, progressive-read replacement or canonical getter programme.
- No change to legacy `GET /images`, `sorts.createSort`, shared exclusive date behavior, mappings,
  aliases, writes or existing machine-principal method policy.
- No delete, edit, upload or other writable Kupua scope.
- No endpoint merely to mirror an unused interface method.
- No production-capacity verdict before the complete disabled mode exists.

## 3. Source and status map

| State | Current evidence | Planning consequence |
|---|---|---|
| Built direct mode | `ImageDataSource` exposes search, count, aggregate, PIT, page, coordinate, distribution and selection methods; direct ES implements them (`kupua/src/dal/types.ts:259-531`). | Retain as behavioral oracle, not API wire design. |
| Built hybrid | `createDataSource()` wraps ES only when `VITE_USE_MEDIA_API=true`; the wrapper overrides qualifying `searchAfter` calls (`kupua/src/dal/index.ts:29-41`, `kupua/src/dal/strangler-adapter.ts:47-67`). | It is not API-only and is not the final composition root. |
| Cursor search (D3) | Route, controller, model and ES method exist (`media-api/conf/routes:12-17`, `media-api/app/controllers/MediaApi.scala:824-889`). | Keep mechanics, replace public contract before review. |
| Cursor-search review/deployment | PR record says implemented and not entered review; repository source cannot prove deployment (`../../../03 Ce n'est pas une pipe dream/media-api-work/d3-search-after-02-pr.md:1-17`). | Record deployed SHA/callers before deleting old wire; expected action is in-place replacement with no dual contract. |
| Planned only | No current media-api routes serve browse sessions, map/rank/range, contextual aggregate, batch read or Kupua AI (`media-api/conf/routes:5-35`). | Build additive Kupua-only paths behind false flags. |
| Historical/superseded | The old findings correction banner supersedes its standalone PIT, count, mget and coordinate details (`../../../03 Ce n'est pas une pipe dream/media-api-work/media-api-01-capability-inventory.md:12-139`). | Use for coverage only. |
| Strong migration architecture | Decision 04 changes canonical reads/writes and cutover; scope reassessment rejects making it a prototype prerequisite (`grid-index-migration-04-architecture-proposal.md:14-75`, `grid-index-migration-05-scope-reassessment.md:1-20,205-218`). | Do not import it; use only ordinary snapshot invariants. |
| Deployment/runtime | Riff-Raff identifies autoscaling services, while effective config, fleet, IAM, ingress and deployed ES version are external (`riff-raff.yaml:7-59`, `common-lib/src/main/scala/com/gu/mediaservice/lib/config/GridConfigLoader.scala:14-48`). | Mark Unknown and resolve through named gates. |

## 4. Current browser-to-ES escape matrix

Every `ImageDataSource` method and every separate owner is represented. "Session" means the
selected browse PIT; "live" means generation-gated but intentionally outside it.

| Workflow | Browser caller | Current ES operation | Observable requirement | Trigger | Backend owner | Existing route | Consistency | Client change | Zero-ES proof |
|---|---|---|---|---|---|---|---|---|---|
| Datasource creation | Search store module init (`search-store.ts:1872-1875`) | Constructs full ES adapter | One unmixed mode | App load | Composition root | No | Mode | Closed API-only branch | Static constructor test |
| Selection owner | Selection store (`selection-store.ts:357-369,423-434`) | Separate ES adapter | Hydration/range parity | Select/reload | Common composition root | No | Mixed today | Inject API-only source | Selection journey network guard |
| Collection count owner | Collection store (`collection-store.ts:116-151`) | Separate terms agg | Optional subtree counts | App load | Live aggregate route | No | Live | Inject API-only source | Collection journey guard |
| First page | Search (`search-store.ts:2198-2295`) | Live page + PIT open + ticker query | One page/total snapshot | Every search | Session create | Cursor route partial | Session | Replace three calls | Search-start guard |
| Small-result fill | Store fill (`search-store.ts:993-1058`) | Repeated `search_after` | Complete <=1k order | Search | Session pages | Cursor route partial | Session | Opaque handle | Scroll-tier guard |
| Forward extension | Store (`search-store.ts:2494-2525`) | PIT `search_after` | No gaps/duplicates | Edge scroll/traversal | Session page | Cursor route partial | Session | Issued cursor | Forward guard |
| Backward extension | Store (`search-store.ts:2619-2653`) | Reversed PIT page | Stable reverse order | Edge scroll/traversal | Session page | Cursor route partial | Session | Serialize | Backward guard |
| Shallow seek | Store (`search-store.ts:2853-2864`) | Cursorless `from` direct fallback | Requested position | Seek | Session seek | No | Live today | Remove offset escape | Forced-seek guard |
| End seek | Store (`search-store.ts:2833-2851`) | Reverse/end PIT page | True null-zone tail | End action | Session page | Cursor route partial | Session | Semantic anchor | End guard |
| Indexed seek | Store (`search-store.ts:2865-2933`) | Map tuple + paired pages | Exact global landing | 1k-65k seek | Session map/page | No | Mixed today | Session entries | Indexed-tier guard |
| Deep scalar seek | Store (`search-store.ts:2957-3165`) | Percentile + page + live rank | Exact corrected landing | >65k seek | Session seek | No | Mixed today | Server orchestration | Seek-tier guard |
| Deep keyword seek | Store (`search-store.ts:3238-3390`) | Composite walk + page + live rank | Deep landing, no `from` cap | Keyword seek | Session seek | No | Mixed today | Opaque progress | Keyword guard |
| Sort around focus | Store (`search-store.ts:1497-1660`) | Live probes/rank + PIT pages | Preserve logical image/rank | Sort change | Session locate/page | No | Mixed today | Send image ID | Sort/focus guard |
| History/re-anchor | URL/detail/store (`useUrlSearchSync.ts:271-325`, `search-store.ts:3788-3823`) | Live probe/rank + pages | New-snapshot logical anchor | Back/reload/detail | Create + locate | No | New session | Drop old tuple authority | History guard |
| Detail traversal | Traversal hook (`useImageTraversal.ts:137-157`) | Extension through store | Adjacent displayed order | Near buffer edge | Session page | Cursor route partial | Session | No direct owner | Detail journey guard |
| PIT close/expiry | Store/adapter (`search-store.ts:2084-2089`, `es-adapter.ts:1043-1098`) | Browser PIT delete/live retry | Idempotent close; re-anchor on expiry | Supersede/idle | Session service | No | Session | Remove PIT IDs | Expiry guard |
| Poll count/tickers | Store (`search-store.ts:705-775`) | `size:0` exact total + filters | New count and named sub-counts | 10s visible/30s hidden | Live count route | No | Live | Nullable optional result | Poll guard |
| `count` | No application caller; contract test (`dal-contract.test.ts:26-30`) | `_count` wrapper | None currently | Reserved | None | No | Unused | Remove/reserve | Compile contract |
| Exact rank | Seek/focus/restore (`es-adapter.ts:1278-1439`) | Live `_count` predicate | Rank in displayed snapshot | Coordinate operations | Session locate | No | Session | ID/issued tuple | Rank guard |
| Percentile estimate | Deep seek (`es-adapter.ts:1441-1493`) | Live percentile agg | Approximate anchor only | Deep scalar seek | Session seek internal | No | Session | Remove public method | Seek guard |
| Keyword target walk | Deep seek (`es-adapter.ts:1500-1635`) | Live composite pages | Continue until target/cancel | Deep keyword seek | Session seek internal | No | Session | Remove public method | Seek guard |
| Position map | Store (`search-store.ts:1215-1257`) | Dedicated PIT full tuple walk | Complete exact map <=65k | Background once/search | Session map chunks | No | Separate PIT today | Same session | Indexed-tier guard |
| Keyword distribution | Route/store (`routes/search.tsx:176-195`) | Bounded composite agg | Valued/represented/completion | First scrubber use | Live distribution | No | Live presentation | Nullable capability | Scrubber guard |
| Date distribution | Route/store (`routes/search.tsx:197-205`) | Stats + histogram | Exact scalar or labelled evidence | First scrubber use | Live distribution | Partial legacy | Live presentation | Provenance response | Scrubber guard |
| Context facets | Route/store (`routes/search.tsx:107-132`, `search-store.ts:3960-4015`) | Terms/filter/nested aggs | Current context and parent counts | Filters panel | Live aggregate route | No | Live | Semantic requests | Facet guard |
| Typeahead | CQL helpers (`typeahead-fields.ts:191-220,564-590`) | Query-scoped terms agg | Fully qualified allowed fields | `:` resolver | Live aggregate route | Legacy insufficient | Live | One API capability | Typeahead guard |
| Corpus `getAggregation` | Fallback only; current CQL supplies params (`CqlSearchInput.tsx:174-212`) | Match-all terms agg | No current application need | Reserved | None | Legacy narrow | Unused | Defer | Contract test |
| Single image | Detail miss (`ImageDetail.tsx:242-271`) | One-ID `_mget` | Hidden=missing, enriched image | Direct detail URL | Guarded batch route | GET semantically close | Live/gated | Batch of one | Detail guard |
| Multi-image hydration | Selection (`selection-store.ts:612-672`) | Parallel 1,000-ID `_mget` | Visible found IDs; complete fields | Select/reload | Guarded batch route | No | Live/gated | 200 chunks, concurrency 2 | Selection guard |
| Out-of-buffer range | Range hook (`useRangeSelection.ts:118-272`) | No-PIT ID walk, cap 5k | Exact displayed range | Shift click | Session range chunks | No | Live today | IDs, not rebuilt tuples | Range guard |
| AI | Store/adapter (`search-store.ts:2092-2181`, `es-adapter.ts:1131-1268`) | Browser Bedrock then ES KNN/hybrid | Current filters/blend/cap/sorts | Health-gated AI query | Gated Kupua AI route | Legacy differs | Live bounded | API health/search | AI guard |
| Media assets | URL builder/prefetch (`image-urls.ts:45-54,193-245`, `image-prefetch.ts:220-242`) | No ES; S3/imgproxy fetch | Current image rendering | Grid/detail/traversal | Existing media paths | Yes/proxies | Live media | Preserve initially | Allowlisted non-ES traffic |
| `searchRange` | No application caller (`es-adapter.ts:692-700`) | Cursor page without PIT | None currently | Reserved | None | Legacy offset | Unused | Defer | Compile contract |

## 5. What is wrong with the old endpoint plan

| Suspected flaw | Verdict and current evidence | Replacement rule |
|---|---|---|
| One ordered result was split across live endpoints | **Confirmed.** Page one, rank, map and range use four views (`search-store.ts:2196-2249`, `es-adapter.ts:1278-1439,1982-2009,2251-2282`). | Exact page/total/map/rank/range/seek share one session PIT. |
| Standalone public PIT open/close | **Confirmed.** The old plan exposes raw PIT before page one; current cursor search accepts it (`ElasticSearchModel.scala:90-139`). | Session creation owns open plus page one; close is semantic/idempotent. |
| Current cursor search is review-ready | **Confirmed false.** It is review-held and still exposes raw sort/PIT (`../../../03 Ce n'est pas une pipe dream/media-api-work/d3-search-after-02-pr.md:1-17,50-65`). | Revise before review as Section 7 specifies. |
| Two initial exact-count owners | **Confirmed.** Page one and parallel `countWithTickers` both count (`search-store.ts:2202-2240`). | Session create is sole owner; live count starts only after publication. |
| Multi-image fetch was a simple uncapped mget | **Confirmed flaw.** Selection bypasses Strangler and full enrichment is expensive (`selection-store.ts:423-434`, `../../../03 Ce n'est pas une pipe dream/media-api-work/d3-search-after-04-performance.md:190-258`). | Guarded visible batch, provisional 200 cap, client chunks, one commit owner. |
| Context aggregation was generic terms proxying | **Confirmed flaw.** Current facets include named and nested usage parent counts (`search-store.ts:3960-3983`, `es-adapter.ts:775-865`). | One semantic allowlisted route supports terms, named filters and nested/reverse-nested counts. |
| Every distribution could publish exact positions | **Modified.** Scalar dates can; multi-valued special dates cannot, and keyword prefixes can be incomplete (`es-adapter.ts:1640-1943`). | Return provenance; presentation evidence never becomes session authority. |
| Historical existing-route items all mapped cleanly | **Confirmed flaw.** `searchRange`, `count` and corpus aggregation have no application caller, and legacy metadata aggregation prefixes `metadata.` (`typeahead-fields.ts:191-220`). | Defer unused methods; route all live aggregation through the semantic endpoint. |
| Strangler overrides migrate the whole app | **Confirmed flaw.** Selection and collection construct ES directly (`selection-store.ts:423-434`, `collection-store.ts:116-136`). | One injected composition root owns every runtime caller. |
| Route measurements prove complete mode capacity | **Confirmed flaw.** Cursor-page evidence covers a page, not maps, polling, range, batch, AI or concurrency (`../../../03 Ce n'est pas une pipe dream/media-api-work/d3-search-after-04-performance.md:118-130,190-258`). | Instrument while building; decide capacity only on the aggregate disabled workload. |
| Migration exclusion was executable | **Confirmed false.** Current status is process-local and Thrall start/complete has no client gate (`MigrationStatusProvider.scala:36-80`, `ThrallMigrationClient.scala:78-118`). | Durable generation plus operation leases and a narrow Thrall close/drain hook. |
| Detailed historical bodies remained safe after banners | **Confirmed false.** The old companion workplan says none of its three routes is implementation-ready while retaining old route sketches (`../../../03 Ce n'est pas une pipe dream/media-api-work/media-api-02-next-endpoints-d7-d8-d9-workplan.md:1-45`). | This document is the implementation authority for the reduced mode. |

No suspected flaw was refuted. The scalar-date qualification modifies, rather than contradicts,
the distribution finding.

## 6. Selected ordinary-operation architecture

### 6.1 One semantic session, one shared state store

Use a shared compare-and-set session store, not process memory, sticky routing or a client-held raw
PIT. media-api is deployed as an autoscaling service and no repository evidence establishes
stickiness (`riff-raff.yaml:10-14,55-57`). One DynamoDB table is the concrete default because both
media-api and Thrall already use AWS-configured asynchronous clients and Scanamo-backed tables
(`common-lib/src/main/scala/com/gu/mediaservice/lib/metadata/SoftDeletedMetadataTable.scala:12-38`,
`thrall/app/lib/ThrallConfig.scala:35-42`). A new common-lib store owns two item kinds:

- the singleton admission item: phase, generation, concrete current index name/UUID, observed
  migration state, observation time, active-operation count and coordinator lease;
- session items: random handle digest, principal/tier binding, generation, concrete target,
  normalized semantic request and sort version, latest PIT ID, revision, operation lease, last
  request fingerprint/result digest, idle and absolute expiry, and terminal reason.

Tokens sent to the browser are random opaque handles. Raw PIT IDs, principal identity and queries
are never logged or embedded in URLs. Storage encryption, TTL and least-privilege IAM are
production enablement gates. Process-local implementations exist only as deterministic test fakes.

### 6.2 Create, operate, expire and recover

`POST /images/browse-sessions` acquires a generation operation lease, resolves the recorded
physical target, opens a PIT, writes a provisional session, searches page one inside that PIT and
CAS-publishes the latest returned PIT before releasing the gate lease. Publication rechecks gate
phase/generation/target. Any failure closes the PIT best-effort and publishes nothing. Page one is
the sole exact-total owner and includes initial ticker aggregations. This removes the current
parallel live-page/PIT/count race (`search-store.ts:2198-2240`).

The client has a priority FIFO per session: interactive pages/locate first, range/seek next,
position-map chunks last. Server CAS is the cross-instance backstop. Each call carries an operation
ID; one operation claims the session revision, uses the latest PIT, records its successor and digest,
then releases. `session-busy` is retryable. A duplicate/lost-response retry reruns the same immutable
request against the latest head and must reproduce the recorded digest; mismatch terminates the
session. This is simpler than storing full page bodies and must be falsified by the exact-version
lost-response test before review. No concurrent branch chooses a head by response arrival; current
paired calls do exactly that incorrectly (`search-store.ts:1308-1384,2478-2754`).

Use configurable provisional lifetimes: two-minute idle expiry, 30-minute absolute expiry,
two-minute PIT keepalive renewed only by session operations, and a 30-second cleanup sweep. Close
is idempotent. Dynamo TTL is a safety net, not prompt cleanup. After expiry, history retains semantic
search plus logical anchor only; create a new session and locate the anchor. Post-build tests compare
one-, two- and five-minute idle values. Owners pre-register acceptable re-anchor rate, PIT/context,
retained-segment and cleanup budgets; accept the shortest value meeting all budgets.

### 6.3 Snapshot and live boundaries

Page one, forward/backward pages, End, centered focus/restore pages, position map, locate/exact rank,
range and exact seek use the session. Position-map and range protocols return bounded chunks and
opaque continuation so interactive calls can run between chunks. Public per-hit tuples omit PIT's
implicit `_shard_doc` and end in unique `id`; the server-issued tuple is retained by image ID for
the session lifetime. The existing truncation is retained because a unique explicit tiebreaker
already gives a total order, tests prove the single-index walk, and no API-only cursor survives
session expiry (`media-api/app/lib/elasticsearch/ElasticSearch.scala:858-889`,
`media-api/test/lib/elasticsearch/ElasticSearchTest.scala:1116-1204`).

New-image polling, facets/typeahead, collection counts and distributions are deliberately live but
must acquire the open generation lease and query its concrete target. AI and guarded image batches
are bounded live operations under the same gate. None mutates an existing session's membership,
total, tuple map or rank.

### 6.4 Why this is proportionate

The architecture adds one table, one narrow migration admission hook and Kupua-only read routes. It
does not alter existing reads or writes. Serialization is required because current callers issue
parallel forward/backward/map work while Elasticsearch can return refreshed PIT IDs, and no checked-
in affinity makes process state sufficient. A state-bearing token is rejected for this mode because
lost responses and concurrent position work would leave the client choosing lineage and cleanup,
the ownership defect being removed. Decision 04's canonical epoch and global mutation fence solve
migration-transparent operation; they are intentionally absent here
(`grid-index-migration-04-architecture-proposal.md:220-267,372-441`).

## 7. Revise the existing cursor-search implementation

Cursor search is implemented on the working branch, review-held and not proven deployed. It becomes an
internal page executor under session creation/continuation; the reviewed public route is the
semantic browse-session resource. Deployment proof is a cheap entry gate. If it confirms no live
deployment caller, the checked-in hybrid client still reaches `POST /images/search-after` through
`StranglerAdapter` (`kupua/src/dal/index.ts:34-41`,
`kupua/src/dal/strangler-adapter.ts:47-65`,
`kupua/src/dal/grid-api-search-adapter.ts:131-139`). Therefore delete the old route only after the
hybrid flag, adapter and tests are retired in the same rollout. Otherwise retain it as an explicitly
versioned compatibility route until hybrid is retired; API-only Kupua never uses it. If deployment
evidence finds another caller, stop this slice and define its bounded compatibility window
(`../../../03 Ce n'est pas une pipe dream/media-api-work/d3-search-after-02-pr.md:1-17`).

| Current cursor-search behavior/code path | Verdict | Reason | Replacement contract | Server files/tests | Kupua files/tests | Rollout compatibility |
|---|---|---|---|---|---|---|
| `POST /images/search-after` JSON | Change | Right transport, wrong resource | Create/page routes | `conf/routes`, `MediaApi.scala` | API transport tests | Replace before review |
| Client raw `sort` | Remove | Leaks ES and duplicates authority (`grid-api-search-adapter.ts:99-106`) | Semantic `orderBy` | New `KupuaSemanticSorts.scala`, fixtures | Stop sending clause | No legacy GET effect |
| Client raw `pitId` | Remove | Unbound ES capability (`ElasticSearchModel.scala:93-107`) | Opaque session handle | Session service/store tests | Session lifecycle tests | No dual unless deployment proves need |
| Permissive booleans/types | Remove | `asOpt` silently defaults (`ElasticSearchModel.scala:110-190`) | Strict Play `Reads` and Zod | Model/controller tests | Response validation tests | Invalid old bodies fail |
| Null-zone/reverse mechanics | Keep internally | Correct nested exists/remap behavior (`media-api/app/lib/elasticsearch/ElasticSearch.scala:787-813,869-883`) | Semantic direction/anchor | Existing plus fixture tests | Direct-mode oracle | Internal only |
| Lean source projection | Keep | Drops three giants, retains alias leaves (`media-api/app/lib/elasticsearch/ElasticSearch.scala:728-856`) | Browse projection version | Projection tests | Consumed-field fixtures | Endpoint-local |
| Per-hit Argo enrichment | Keep, then measure | Current UI consumes authoritative overlay (`grid-api-search-adapter.ts:52-78`) | Enriched hit payload | `ImageResponseTest` | Atomic commit tests | Existing writer unchanged |
| `_shard_doc` truncation | Keep | Explicit unique ID already orders one physical snapshot (`media-api/app/lib/elasticsearch/ElasticSearch.scala:858-864`) | Public semantic tuple | Full-walk tests | Tuple-retention tests | No live replay |
| Live/no-PIT first page | Remove | Splits page and continuation (`search-store.ts:2202-2225`) | PIT page one at create | Session integration test | Store create test | API-only only |
| Client PIT expiry fallback | Remove | Changes corpus (`es-adapter.ts:1051-1079`) | `410 snapshot-expired` | Expiry/cleanup tests | Unavailable/re-anchor tests | Direct mode unchanged |

### 7.1 Query, authorization and disclosure

Create one endpoint-local `KupuaSearchSemantics` mapper. It receives raw semantic CQL and current
URL fields, parses defaults on the server exactly once, and produces the immutable query bound to
the session. Remove the client's `-is:deleted -usages@status:replaced` injection; current client and
server both add defaults (`grid-api-search-adapter.ts:91-110`,
`media-api/app/lib/querysyntax/Parser.scala:3-15`). Empty query must still pass through the default
parser rather than become an empty condition list.

Detect a positive deleted predicate from parsed conditions. When the principal lacks blanket
delete permission, bind `uploadedBy` to that principal exactly as legacy `GET /images` does. Apply
the bound query to hits, total, map, rank, range, seek and session probes; hidden existence must not
appear in counts or error distinctions (`MediaApi.scala:570-574,744-752`). Preserve syndication
tier filtering in the query and verify every returned hit before enrichment; hidden IDs are omitted
like missing. The intended browser principal is cookie-authenticated `Internal`. Existing ReadOnly
and Syndication API keys remain GET-only; do not weaken that policy for these POST routes
(`common-lib/src/main/scala/com/gu/mediaservice/lib/auth/ApiAccessor.scala:20-33`,
`rest-lib/src/main/scala/com/gu/mediaservice/lib/auth/Authentication.scala:45-93`).

Map every effective current search field:

| Field | Session meaning |
|---|---|
| `query` | Raw CQL; server parses defaults and named conditions. |
| `ids` | Allowlisted ID membership, capped and bound to session. |
| `since`/`until`, taken and modified pairs | Inclusive `gte`/`lte`, matching direct Kupua, not shared legacy exclusive helpers (`es-adapter.ts:496-515`, `common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/filters.scala:24-49`). |
| `nonFree` | Endpoint mapper owns the current inverse `free` mapping. |
| `uploadedBy`, `hasRightsAcquired`, `hasCrops`, `syndicationStatus` | Preserve current cursor-adapter mappings (`grid-api-search-adapter.ts:99-129`). |
| `orderBy` | One recognized ordinary semantic sort; server owns clause and tuple. |
| `aiQuery`/`useAISearch` | Rejected on browse create; handled by the AI route. |
| `dateField` | Client routing selector only; concrete date bounds above are authoritative (`DateFilter.tsx:123-143,265-281`). |
| `payType` | Reserved current no-op; current API adapter omits it. Do not invent filtering. |
| `persisted` | Reserved current no-op; direct ES intentionally ignores it (`es-adapter.ts:566-567`). |
| pinboard, `image`, density/display fields | Client navigation/presentation only; excluded from server identity. |
| `offset` | Rejected on session create/page. Shallow and deep offsets become semantic session seek operations. |
| `length` | Maps to strict `pageSize` in the range 1-200. |
| `trackTotalHits` | Client execution hint removed from the wire. Session creation always owns one exact total; later pages do not recount. |

Strict request validation rejects unknown sort/filter fields, wrong JSON types, invalid dates,
duplicate/over-cap IDs and page sizes outside 1-200. It never silently drops a live filter.

### 7.2 Sort and cursor authority

Add a new media-api-only semantic builder. Never call or modify legacy `sorts.createSort`, whose
field resolution and fallback differ and which serves Kahuna
(`media-api/app/lib/elasticsearch/sorts.scala:16-97`,
`../../../03 Ce n'est pas une pipe dream/media-api-work/d3-search-after-03-sort-options.md:18-52,108-125`). The builder accepts both
directions for:

- upload time: primary direction plus `id asc`;
- taken and modified: primary date, upload-time fallback in the same direction, `id asc`;
- Last used and Added to collection: nested/object `mode:max`, `missing:_last`, same-direction
  upload fallback, `id asc`, with the collection `pathHierarchy` companion filter;
- category, image type, credit, source, uploader, width, height and MIME type: resolved primary,
  `uploadTime desc`, `id asc`;
- configured display aliases (`editStatus`, `colourProfile`, `colourModel`, `cutout`,
  `bitsPerSample`, `digitalSourceType`, `sceneCode`): configured path, null/missing zone,
  `uploadTime desc`, `id asc`.

These clauses mirror current observable Kupua behavior
(`kupua/src/dal/adapters/elasticsearch/sort-builders.ts:64-204`,
`kupua/src/lib/grid-config.ts:159-244`). `relevance` is AI-only and is rejected by ordinary browse.

Create one source of truth at `kupua/test-fixtures/api-only-search-semantics.json`. Each case carries
semantic request fields, forward/reverse ES clause, sample source values, expected public tuple,
null-zone phase and collection companion filter. Scala and TypeScript tests load the same cases.
Runtime configured aliases are compared with fixture declarations so two implementations cannot
agree only with their own hand-written expectations.

Every hit is committed with the server tuple keyed by image ID. API-only eviction, detail, history
and range paths must never call `extractSortValues`; configured aliases are returned under
`image.aliases` while current reconstruction follows the dropped raw path
(`image-offset-cache.ts:65-124`, `field-registry.tsx:965-980`). Stable tuples remain recovery hints
after expiry, not exact continuation authority.

### 7.3 Snapshot, count and exact coordinates

Session creation owns page one and exact total. It also requests the initial ticker aggregations in
the same PIT query, so the current parallel `countWithTickers` call is removed. Live polling starts
after publication. The only allowed count-shape experiment changes how that one PIT-bound creation
query computes or serializes its total/tickers; it may issue a second server-side search only against
the already-open session PIT and join it before publication. The live count route can never supply
the initial total. Both experiment branches run the ordinary insert/update/delete same-snapshot
test. Before comparison, owners record first-page p95/p99, ES work and total settle budgets; switch
only if the alternate improves the primary interaction budget without violating any shared-resource
budget.

Position map, exact locate/rank and ID range use the session PIT. Focus and restore probes that can
publish a target also use it. Page/map/rank/range responses are rejected if Elasticsearch timed
out, any shard failed, successful shards are incomplete, a projected hit fails parsing, or hit/
tuple cardinality differs. Current cursor search flat-maps invalid hits and does not reject timeout/partial
results (`media-api/app/lib/elasticsearch/ElasticSearch.scala:858-889`). Leave legacy GET's partial-result behavior unchanged.

### 7.4 Result and failure contract

Use stable semantic outcomes:

- `400 invalid-json-type` for structurally wrong JSON;
- `422 invalid-search`, `unsupported-sort`, `unsupported-field`, `limit-exceeded`;
- indistinguishable `404 hidden-or-missing-image` on singleton/batch lookups;
- `409 session-busy` or `stale-operation` for CAS/operation conflicts;
- `410 snapshot-expired`, `session-closed`, `generation-invalid`;
- `503 migration-unavailable`, `status-unknown`, `incomplete-search`, `core-unavailable`.

Cancellation publishes nothing. Retry is allowed for a request that never acquired/committed an
operation and for `session-busy`; committed-but-lost requests use the operation-ID replay check.
Expiry, generation change, response-integrity failure or unknown lineage creates a new session and
logical-ID re-anchor. No outcome invokes browser ES.

### 7.5 Projection, enrichment and media response

Retain the schema-derived lean projection: all `Image` fields except `embedding`,
`originalMetadata` and bulk `fileMetadata`, plus configured alias leaves. Complete `usages` and
`collections` arrays remain because Last used/Added to collection display and selected-max
semantics require them (`media-api/app/lib/elasticsearch/ElasticSearch.scala:728-856`,
`common-lib/src/main/scala/com/gu/mediaservice/model/Image.scala:27-31`). Explicitly reject
`include=fileMetadata` with 422 on browse and batch routes. If a future caller needs full file
metadata, use a separately gated semantic contract; do not accidentally return an empty embedded
value. Current `ImageResponse.create` would otherwise include the projected empty/default value
(`ImageResponse.scala:68-71,389-392`).

Keep cost, validity, invalid reasons, persistence, rights, actions, usages and syndication status in
the server-authoritative enrichment channel. Do not optimize signing or links until the fields
actually consumed by API-only mode are captured in fixtures and final Argo cost is measured;
current visual media still uses `/s3` and `/imgproxy`, not API `secureUrl`
(`grid-api-search-adapter.ts:52-78`, `image-urls.ts:45-54,193-245`).

Add one atomic `commitApiPage`/`commitApiImages` boundary. It commits images, tuples and enrichment
together; fresh search/seek/restore replaces, extension merges and eviction prunes. Cover fresh,
small fill, forward, backward, paired seek, fallback first page, sort-around target and restore.
Current fallback and target-probe paths omit or only partly merge enrichment
(`search-store.ts:1353-1429,1504-1588,2939-2955,3793-3846`). Discarded probes remain side-effect
free.

### 7.6 Existing tests affected and failing-first coverage

Before behavior changes, classify these old expectations:

- `media-api/test/lib/elasticsearch/ElasticSearchTest.scala:774-841,1116-1204,1423-1474`:
  replace raw request/PIT assertions, retain null-zone/full-walk/projection mechanics;
- `media-api/test/lib/elasticsearch/SortsTest.scala:7-94`: remove cursor-route raw JSON sort tests, retain
  legacy `createSort` tests and add the separate semantic fixture suite;
- `kupua/src/dal/grid-api-search-adapter.test.ts:304-429`: replace raw sort/PIT wire cases;
- `kupua/src/dal/strangler-adapter.test.ts:10-88`: retain hybrid/direct tests, do not make them the
  API-only contract;
- `kupua/src/stores/search-store-pit.test.ts:81-184`: direct mode keeps fail-open behavior, API-only
  gains fail-closed session tests;
- `kupua/src/stores/search-store-eviction-cursor.test.ts:104-205`: replace API tuple reconstruction
  with retained server authority.

Every confirmed defect gets a failing test first and confirmation that it fails for the stated
reason. Required new coverage is: admin/uploader/other/syndication deleted-query hits and totals;
all six inclusive date boundaries; every static/configured/special sort in both directions and
null zones; page one plus continuation under ordinary insert/update/delete; serialized page/map/
rank/range; timeout/incomplete shard/invalid hit; strict wrong JSON types; expiry, close, duplicate
and lost response; tuple and enrichment retention across every commit/eviction/focus/restore path;
and API-only failure proving no ES fallback.

### 7.7 Review can resume when

1. Deployment/caller evidence has selected in-place replacement or a demonstrated compatibility
   window.
2. Raw `sort`, `pitId`, `countAll` and permissive booleans are absent from the reviewed contract.
3. The shared fixture proves every semantic query/date/sort/cursor case in Scala and TypeScript;
   legacy `GET /images` and `createSort` regression tests are unchanged.
4. Page one, total, continuation, map, rank, range and seek use one session and reject partial work.
5. Deleted authorization and hidden-ID tests cover hits, totals and errors.
6. CAS, lost-response, expiry, cleanup, migration generation and cross-instance tests pass.
7. Every committed image has enrichment and authoritative tuple; no probe mutates global state.
8. Firefox API-only acceptance proves all retained workflows and zero browser ES.

Rewrite the old PR description's What, Cursor contract, Containment, Review points and Validation
sections. Historical passing counts and cursor-route-only measurements are implementation evidence, not
acceptance.

## 8. Corrected capability and endpoint matrix

The endpoint boundary follows workflows and consistency, not one route per TypeScript method.

| Capability | Decision | Public boundary | Snapshot/live | Old lookup | Product consequence |
|---|---|---|---|---|---|
| Browse creation and cursor pages | **Revise/build** | Browse-session create/page/close | Snapshot | D3, D8 | All three tiers retain stable pages; raw PIT disappears. |
| Initial total and tickers | **Fold into browse session** | Session-create response | Snapshot | D7 | Exactly one initial exact count. |
| New-image and ticker polling | **Build new** | Live counts | Live | D7 | Existing 10/30-second refresh remains. |
| Contextual facets and typeahead | **Build new** | Context aggregations | Live | C1, C2 | Full paths, named filters and parent usage counts remain. |
| Collection counts | **Reuse context aggregation** | Same aggregation route | Live | C1 | Tree stays optional; its direct ES owner is removed. |
| Position map | **Fold into browse session** | Position chunks | Snapshot | D1 | Exact map remains for the 1k-65k tier. |
| Exact locate/rank | **Fold into browse session** | Locate | Snapshot | D4 | Focus, restore and corrected seeks retain exact rank. |
| Out-of-buffer ID range | **Fold into browse session** | Range chunks | Snapshot | D2 | Current 5,000-selection cap remains. |
| Scalar/keyword deep seek | **Fold into browse session** | Seek progress/final page | Snapshot | D5 and percentile item | No capped browser offset fallback. |
| Keyword/date distributions | **Keep deliberately live** | Distribution route | Live presentation | D6, C3 | Optional labels retain explicit coverage/exactness. |
| Single image | **Reuse shaping, use guarded batch of one** | Batch-image route | Live/generation | A `getById` | Existing `GET /images/:id` response/auth helpers are reused; ungated M-first lookup is not. |
| Multi-image selection hydration | **Build new** | Batch-image route | Live/generation | D9 | Hidden/missing IDs are indistinguishable; client chunks at 200. |
| AI search and health | **Build Kupua-specific route** | AI health/search | Live/generation | Historical A item | Current filter/blend/cap behavior stays reachable without browser ES/Bedrock. |
| Signed/media delivery | **Preserve, then client-only rewire where proven** | Existing response fields and proxies | Live media | None | Zero-ES does not wait for one-URL deployment. |
| `searchRange` | **Defer unused** | None | None | Historical A item | No current product behavior changes. |
| Standalone `count` | **Remove/reserve** | None | None | Historical B2 item | Poll and session total have explicit owners. |
| Corpus-wide `getAggregation` fallback | **Remove/reserve** | None | None | Historical A item | Current CQL always has contextual params; no endpoint is built. |
| Public PIT open/close, percentile and keyword walk | **Internalize** | Session internals | Snapshot | D8, D5 | Browser cannot compose an inconsistent result. |

Existing `GET /images/:id` is sufficient for response shape, visibility and enrichment
(`media-api/app/controllers/MediaApi.scala:151-176,759-785`). It is not sufficient as the API-only
transport because its getter follows current migration-aware precedence and does not acquire the
admission generation (`media-api/app/lib/elasticsearch/ElasticSearch.scala:103-149`). The new
batch-image route calls a target-specific lookup plus the same visibility and `ImageResponse`
helpers; legacy callers and output remain unchanged.

## 9. Endpoint and client contracts

All new read-via-POST routes use `auth.async(parse.json)`, strict Play JSON readers, Argo image
entities where images are returned, and structured log markers. These match the established cursor
route and controller conventions (`media-api/app/controllers/MediaApi.scala:840-879`,
`../../../03 Ce n'est pas une pipe dream/media-api-work/media-api-90-conventions.md:1-84,307-363`). Route paths are specific and precede
`GET /images/:id` (`media-api/conf/routes:5-20`).

| Method and route | Request | Success response | Typed non-success | Provisional limits and owner |
|---|---|---|---|---|
| `GET /images/api-only/availability` | No body | `{available,generation,observedAt,retryAfter?}` | `503 migration-unavailable/status-unknown` | No ES query; cache disabled; polled every 5s. |
| `POST /images/browse-sessions` | Semantic filters, `orderBy`, `pageSize`, optional `anchorId` | `{session,generation,revision,expiresAt,total,tickers,hits:[{image,cursor}]}` | 400/422/503 | Page 1-200; sole initial total owner. |
| `POST /images/browse-sessions/:handle/pages` | `{operationId,direction,anchor,cursor?,pageSize}` where anchor is start, end or cursor | New revision, expiry, enriched paired hits, boundary flags | 409/410/503 | 1-200; serialized. |
| `POST .../:handle/positions` | `{operationId,continuation?}` | `{entries:[{id,cursor}],continuation?,walked,complete}` | 409/410/422/503 | 5,000 entries/response; total operation allowed only when total <=65,000. |
| `POST .../:handle/locate` | `{operationId,imageId,includePage?,radius?}` | `{found,rank?,cursor?,page?}` | 409/410/503 | One ID; optional centered page <=200. |
| `POST .../:handle/ranges` | `{operationId,anchorId,targetId,continuation?}` | `{ids,continuation?,walked,truncated,complete}` | 404/409/410/503 | 1,000 IDs/chunk; 5,000 plus one-hit truncation proof overall. |
| `POST .../:handle/seek` | `{operationId,position,pageSize,continuation?}` | Progress or `{rank,page}` | 409/410/422/503 | One composite/percentile work chunk per request; no false approximate completion. |
| `DELETE /images/browse-sessions/:handle` | No body | Idempotent close acknowledgement | Authentication only | Closes latest known PIT; unknown/already closed succeeds. |
| `POST /images/api-only/counts` | Semantic context and inclusive `since` | `{count,tickers,asOf}` | Optional absence or 503 gate | One exact live count; client cadence remains 10s visible/30s hidden. |
| `POST /images/api-only/context-aggregations` | Semantic context and one named shape: facets, typeahead or collection-counts | Fields, named counts, usage parent counts, completeness | 400/422/503 | Facets/typeahead: <=24 fields, <=100 buckets/field, <=2,400 returned buckets. Collection-counts: only `collections.pathId`, <=6,000 buckets. Configurable. |
| `POST /images/api-only/distributions` | Semantic context, `orderBy`, kind | Provenance-rich keyword/date distribution | 422/503 | Keyword pages remain 10,000 buckets, at most five presentation pages; configurable. |
| `POST /images/api-only/images` | `{ids,projection}` where projection is selection or detail | Visible enriched entities in request order where found | 400/422/503 | 200 unique IDs/request; browser concurrency 2. |
| `GET /images/api-only/ai-search/health` | No body | `{available}` | Ordinary absence returns `available:false` | No browser Bedrock health call. |
| `POST /images/api-only/ai-search` | AI text, lexical filters, `vecWeight`, requested display order | <=200 enriched hits and `total===hits.length` | 400/422/503 | 200 results; generation gated. |

The literal limits above are conservative implementation safeguards, not capacity conclusions.
They derive from current page size 200, position-map horizon 65,000, range hard cap 5,000 and
selection behavior (`kupua/src/constants/tuning.ts:25-30,76-103,270-297`). Post-build experiments
may lower or raise route caps only after budgets are recorded and the same functional cases pass.
For batch images, measure 1/50/200/500/1,000 IDs and accept the largest server cap whose p99,
allocation, payload, signing and abort behavior pass; client chunking then changes to match. For
session lifetime, use the experiment and decision rule in Section 6.2.

### 9.1 Browse and coordinate response rules

The normalized query, principal/tier, semantic sort version, concrete target and generation are
stored once at creation; continuation requests cannot resubmit or widen them. Cursors are scalar
arrays issued by the server and validated for arity and type. `positions`, `ranges` and `seek` are
chunked so each request releases the session lease and lets pages run. Partial map output stays in
a client-local accumulator and is published only at `complete:true`, preserving current all-or-
nothing behavior (`kupua/src/stores/search-store.ts:1214-1269`). Range progress may be displayed;
selection changes only after a complete response or a deliberate truncated-at-5,000 response,
matching the current hook (`kupua/src/hooks/useRangeSelection.ts:190-300`). A range request resolves
both IDs inside the stored result query and visibility scope. If either endpoint is absent from that
snapshot it returns one indistinguishable `range-endpoint-unavailable` result; it does not query
outside the result filter or infer a boundary from a stale image tuple.

The keyword seek operation owns the current composite-walk idea but removes its absolute browser
replay and deep-offset fallback. Each chunk returns opaque progress bound to the browse session,
cumulative represented documents and target. It continues until the target bucket is proven, then
uses a PIT page and exact rank predicate to land. Expiry or capacity failure returns unavailable;
the server never calls the last observed bucket an exact requested position. Current direct code
walks up to 50 ten-thousand-bucket pages and eight seconds, then may return an approximate last
value (`kupua/src/dal/es-adapter.ts:1500-1635`,
`kupua/src/stores/search-store.ts:3238-3390`). If the complete implementation cannot meet the
pre-registered interaction/load budget, API-only remains dark until the algorithm or product
boundary is explicitly changed.

### 9.2 Live aggregations, counts and distributions

Context aggregation fields are fully qualified, server-allowlisted aggregatable paths. Never
prefix `metadata.`: current callers include `fileMetadata.*`, `usageRights.category`,
`collections.pathId`, `source.mimeType`, `userMetadata.labels` and `uploadedBy`
(`kupua/src/lib/typeahead-fields.ts:191-220`,
`../../../03 Ce n'est pas une pipe dream/media-api-work/media-api-01-capability-inventory.md:934-963,1070-1088`). Named `is:` values compile through
the server registry; usage platform/status uses one nested aggregation with `reverse_nested` parent
image counts. Search context, visibility, cancellation, field count and cardinality limits apply
to the whole request. Expanded facets and superseded typeahead calls abort without publishing.
The `collection-counts` shape is a separate allowlist entry: it accepts no arbitrary fields and
permits the current provisional 6,000 `collections.pathId` buckets. It returns `complete:false` if
the cap is reached, and the collection store then shows its optional tree without counts rather
than presenting a truncated map as complete. Current startup explicitly requests 6,000 buckets and
already treats aggregation failure as tree-without-counts
(`kupua/src/stores/collection-store.ts:116-151`).

Live counts preserve server ticker names and supplier sub-counts. Session creation includes the
same ticker definitions at snapshot time; polling returns deltas against its inclusive `since`.
The client merges only named ticker values and treats failure as absent, not zero. Current visible,
hidden and visibility-return timing remains (`kupua/src/stores/search-store.ts:705-775`,
`kupua/src/constants/tuning.ts:196-207`).

Keyword distributions report `valuedDocumentCount`, `representedDocumentCount` and `complete`.
Scalar-date distributions may report exact parent-rank boundaries. Last used and Added to
collection report exact parent coverage but child-date histogram buckets as
`approximate-evidence`; no bucket cursor or exact rank is returned. Current types already separate
coverage/completion and direct code shows repeated child dates for special fields
(`kupua/src/dal/types.ts:197-229`, `kupua/src/dal/es-adapter.ts:1640-1943`).

### 9.3 Image reads, enrichment and AI

Batch images deduplicate IDs, query only the gate's concrete target, preserve request order among
found results and omit hidden/missing IDs without separate counts or per-ID errors. The client
chunks abort-aware with concurrency two. The selection store owns the only commit: a successful
response writes metadata and enrichment together; transport/core failure retains existing
selection, while a successful omission follows current hydration reconciliation. Direct ES
currently chunks 1,000 IDs in parallel and silently omits missing documents, but that number does
not account for Argo enrichment (`kupua/src/dal/es-adapter.ts:2195-2249`,
`kupua/src/stores/selection-store.ts:606-711`,
`../../../03 Ce n'est pas une pipe dream/media-api-work/d3-search-after-04-performance.md:190-258`). Preserve complete usages, collections and alias
values.

The AI route is additive and Kupua-specific. Current browser AI gets an embedding through Vite,
then direct ES returns a bounded in-memory result set; media-api's existing AI path has a different
default blend, total/filter-pool behavior and public GET contract
(`kupua/src/lib/bedrock-proxy-client.ts:18-39`,
`kupua/src/dal/es-adapter.ts:1118-1268`,
`media-api/app/controllers/MediaApi.scala:597-740`). Reuse `Embedder` and `ElasticSearch.hybridSearch`
only for the pure semantic branch where its query shape is demonstrably identical. For weight zero
and intermediate weights, implement new Kupua-only ES helpers that reproduce the current TypeScript
BM25 fields/operator/fuzziness, max-score probe, boost calculation, bool query, pre-filter and
candidate count exactly; media-api's parallel fusion/rerank algorithm is not equivalent
(`media-api/app/lib/elasticsearch/ElasticSearch.scala:220-360`). Default weight remains 1.0, cap 200
and `total===hits.length`. The response also includes ticker counts computed over the returned ID set,
matching the current post-search decorated count call; it does not start new-image polling
(`kupua/src/stores/search-store.ts:2092-2191`). Preserve current client-side Relevance/Uploaded
ordering after validated hits. Ordinary health-gated absence remains; when health says available,
no AI path may use browser ES or Bedrock.

## 10. Migration-exclusion gate

### 10.1 Durable state and official lifecycle

Add `ApiOnlyReadAdmissionStore` in common-lib with DynamoDB and in-memory test implementations.
`MediaApiComponents` and `ThrallComponents` construct the same table from new config; the table and
least-privilege grants are provisioned for local/TEST/PROD before either feature flag can be true.
The existing shared table pattern is asynchronous and configuration-driven
(`common-lib/src/main/scala/com/gu/mediaservice/lib/metadata/SoftDeletedMetadataTable.scala:12-38`,
`common-lib/src/main/scala/com/gu/mediaservice/lib/config/CommonConfig.scala:59`).

The singleton gate has `open`, `closing`, `closed` and `reopening` phases. Generation is monotonic.
Every API-only request transactionally acquires a short operation lease only when phase is open,
the observed state is fresh, target name/UUID matches and generation is unchanged. The request
renews while executing, checks the generation before each ES work chunk and CAS-publishes only
under the same generation. A close moves to `closing`, increments generation and rejects all new
leases immediately; previous-generation responses can no longer publish.

Change `ThrallMigrationClient.startMigration` from discarded asynchronous work behind `Unit` to a
composed `Future[Unit]`. Its first operation calls `closeAndDrain("migration-start")`; only after
closure succeeds and prior leases finish does it call `createImageIndex` and assign
`Images_Migration`. `MessageProcessor.createMigrationIndex` currently wraps the synchronous method
in `Future`, so it must compose the returned future instead
(`thrall/app/lib/kinesis/MessageProcessor.scala:217-228`,
`thrall/app/lib/elasticsearch/ThrallMigrationClient.scala:78-91`). Gate failure fails the migration
message; it never starts migration with API-only admission open.

The gate stays closed through pause, resume, preview and unpreview. `completeMigration` verifies it
is closed before its existing alias operation. The successful alias response is the migration
message's commit point: persist durable `reopening` state with the incremented generation, then
return success so `CompleteMigrationMessage` is never replayed against the now-`NotRunning` state.
An idempotent elected gate monitor owns all post-cutover work. It retries status observations twice
five seconds apart, resolves exactly one current target with the same name/UUID on both observations,
opens/searches/closes a probe PIT on that physical target, and finally CAS-opens the existing
generation. Failure or process death alerts and leaves admission closed in `reopening`; another
monitor resumes from durable state without repeating the alias action. The alias action itself is
unchanged (`thrall/app/lib/elasticsearch/ThrallMigrationClient.scala:50-75,93-118`,
`thrall/app/lib/kinesis/ThrallEventConsumer.scala:20-24,38-74`). A pre-migration session therefore
cannot resume after completion.

### 10.2 State mapping and honest bounds

| Observed state | Gate decision | Client/server behavior |
|---|---|---|
| Fresh `NotRunning`, stable one-target current alias | Open or reopening candidate | Admit only after target probe and generation publication. |
| `InProgress` | Closed | Reject create and every live/session operation. |
| `Paused` | Closed | Pause is still active migration; no exception. |
| `CompletionPreview` | Closed | Preview is diagnostic, never ordinary API-only authority. |
| `StatusRefreshError(previous)` | Closed | Previous state cannot authorize admission. |
| Observation older than 10s | Closed | Return `status-unknown`; monitor increments generation once. |
| Alias missing/multiple/UUID changed while open | Closed | Increment generation; require stable recovery sequence. |

Current status refresh is process-local every five seconds and waits up to five seconds
(`common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/MigrationStatusProvider.scala:36-80`).
The shared gate monitor elects one conditional leader, writes an observation at least every five
seconds and treats a ten-second-old observation as closed. These are provisional bounds validated
with a fake clock and failure injection.

**Guarantee level:** official migration start and API-only admission are atomically ordered by the
durable generation. The close linearization point makes every loaded session server-unusable
immediately; migration index creation waits for earlier operation leases to drain. Use a
provisional 15-second operation lease with two-second renewal and a 30-second drain deadline.
Expired/unreachable workers lose publish authority even if an already-issued ES read later returns.
The coordinator may proceed only after the store proves no publish-capable old lease remains.

For an out-of-band alias/migration change, atomic ordering is **not** promised. Server admission
closes within ten seconds of a healthy monitor schedule; an open request remains on its recorded
physical index and cannot publish after generation closure, so it cannot cross cutover. A visible
Firefox tab polls availability every five seconds and clears local authority within five seconds
of shared closure, or within twenty seconds of an out-of-band true start under the stated monitor
bound. A suspended tab has no wall-clock timer guarantee, but its server handle is already invalid;
`pageshow`, focus, `visibilitychange` and every operation synchronously check availability before
use. Production enablement requires proof that official migration/alias credentials cannot bypass
the hook. If that inventory fails, this design cannot be called atomic and implementation stops for
a product/architecture decision rather than claiming polling equivalence.

### 10.3 Cancellation, clearing and tests

Gate closure causes media-api to reject new chunks and final CAS publication. Kupua aborts fetches,
stops polling/map/range/seek work, closes the logical handle best-effort and clears images, total,
map, authoritative tuples and enrichment for that session. History keeps only semantic search and
logical anchor for post-migration re-anchor. The UI shows migration unavailable with retry disabled
until a new open generation is observed; it never offers direct mode.

Required tests cover start during create/page/map/range/count; pause/resume; preview/unpreview;
every prior state wrapped by status error; stale monitor; fast start/complete; alias UUID change;
failed completion; browser reload; suspended/resumed tab; cross-instance create/page; worker death;
lease expiry; and reopening. The oracle is no response published after close generation, no new
session before reopen, no old handle accepted after reopen and no fallback request.

## 11. Zero-direct-ES client wiring and enforcement

### 11.1 Composition root and capability types

Replace the binary factory comment and flag with `VITE_DATA_MODE=direct-es|hybrid|api-only` while
the existing hybrid remains a transition/debug mode. `createDataSources()` returns a discriminated
application source. Its API-only branch imports and constructs only `ApiOnlyDataSource`; a static
test fails if that module imports `es-adapter` or `strangler-adapter`. Search, selection, collection
counts and detail receive the same object rather than constructing their own sources. Current
selection and collection constructors are the proven bypasses
(`kupua/src/dal/index.ts:29-41`, `kupua/src/stores/selection-store.ts:423-434`,
`kupua/src/stores/collection-store.ts:110-143`).

Replace the application-facing ES-shaped methods with semantic capabilities:
`createSession/page/positions/locate/range/seek/close`, `liveCounts`,
`contextAggregations`, `distribution`, `getImages`, `aiHealth/search`. A direct-mode facade adapts
the existing ES methods so direct mode need not be rewritten at once. `openPit`, raw `searchAfter`,
`countBefore`, percentile and composite walkers remain private to that facade. Optional
capabilities are explicit `{kind:"available", call}` or `{kind:"absent"}` values, not undefined
methods that can fall through to ES. Core API errors are a separate unavailable state.

### 11.2 Startup and transport

Add `start.sh --api-only`. It requires a media-api base but does not start Docker ES, open an ES
tunnel, discover an index, set `KUPUA_ES_URL`/`VITE_ES_INDEX`, or run an ES health request. Current
`--use-media-api` implies TEST and still performs those steps
(`kupua/scripts/start.sh:13-31,421-475`). Checked-in development and browser acceptance use the
same-origin `/api` Vite proxy. Production enablement requires a checked-in same-origin ingress (or
proved CORS/CSRF equivalent) for cookie-authenticated Internal users; Vite's spoofed Kahuna origin
is development evidence only (`kupua/vite.config.ts:140-177`).

In API-only mode, omit the `/es` proxy entirely and install a terminal middleware returning 410 for
`/es`. Add a development fetch guard that rejects all configured ES origins and URL/body signatures
`_search`, `_count`, `_mget`, `_pit`, `_cat/aliases` before network dispatch. This is diagnostic
defense, not the acceptance oracle. The current proxy merely allowlists these ES operations and is
therefore the opposite behavior (`kupua/vite.config.ts:10-48,99-108`).

Replace prefix matching in `GRID_API_READ_VIA_POST` with exact method/path templates. Permit only
the routes in Section 9, including dynamic session-handle paths after strict parsing. `DELETE` is
read-session cleanup only for the exact browse-session route. All unrelated writes remain blocked
unless the separate global write flag is deliberately enabled. Current `startsWith` permits only
cursor search but would be too broad when more paths arrive (`kupua/vite.config.ts:57-94`).

### 11.3 Maintained browser proof

Add `playwright.api-only.config.ts` with a Firefox project, no direct-ES global setup and an API-only
Vite server. Backend setup may load deterministic local ES through server-side fixtures; the
browser receives no ES proxy or URL. Do not reuse the habitual fixture that turns `/api/**` into
503, because it proves direct mode only (`kupua/e2e/shared/helpers.ts:18-38`,
`kupua/playwright.config.ts:18-92`).

The fixture installs a context-wide request listener before navigation. It fails on every configured
ES origin, `/es` under any origin, and Elasticsearch API signatures in URL or known JSON request
shape, including background calls. A terminal route on `/es/**` records and fails rather than
silently fulfilling. The acceptance journey covers search starts, <=1k scroll, 1k-65k indexed
scroll, >65k seek, both extensions, End, all sort families, focus, history/reload, facets,
typeahead, collection count, detail/traversal, selection hydration, out-of-buffer range, polling,
distributions and available AI. It also tests core outage, expiry and migration closure and asserts
that none causes ES traffic. Firefox is required because the production-sensitive scrolling paths
already have Firefox-specific containment concerns (`kupua/AGENTS.md:153-169`).

## 12. Implementation sequence

Each phase is independently reviewable, stays disabled by default and begins with the named failing
test. Implementation sessions must identify old-behavior tests before editing and must not weaken a
failure without deciding whether code, test or intended behavior is wrong.

### Phase 0 - Prove the isolation prerequisites

**Capability:** no user-visible change. Establish that the selected narrow interlock is implementable.

**Work:** platform/media-api owners record cursor-route deployment/callers; migration owners inventory every
creator/remover of `Images_Migration` and retargeter of `Images_Current`; auth/platform chooses the
Internal same-origin production transport; service owners confirm a shared Dynamo table can be
granted to media-api and Thrall. Current source proves at least Thrall and an administrative script
can change aliases (`ThrallMigrationClient.scala:78-118`,
`scripts/src/main/scala/com/gu/mediaservice/scripts/EsScript.scala:146-176`).

**Tests/exit:** a review record names every official migration entry and proves each reaches
`ThrallMigrationClient.startMigration/completeMigration`. Any unhookable path is a premise failure
for atomic exclusion and stops product implementation. Deployment evidence chooses one cursor-route
transition. Unknown load does not block exit.

### Phase 1 - Semantic fixtures and durable gate/session foundation

**Capability:** disabled protocol foundation; migration start can close API-only admission without
changing ordinary writes or legacy reads.

**Server work:** add the shared fixture JSON; strict request/result models; new common-lib admission
store interface/Dynamo implementation; media-api and Thrall config; test fake; table provisioning;
gate metrics. Change migration start to compose `closeAndDrain` before index creation and completion
to durably commit `reopening` after alias success; the elected monitor reopens after stable
postcondition. Wire through `MediaApiComponents`, `ThrallComponents`,
`MessageProcessor.createMigrationIndex` and tests. Do not change current search/getter/cutover
queries.

**Failing-first/focused:** fake-clock tests for every state/age/generation; Dynamo contract tests for
CAS, leases, duplicate close, TTL and cross-instance claims; Thrall tests proving no index creation
before drain, alias success is acknowledged exactly once, and failure after each status read, target
resolution and PIT-probe step leaves resumable `reopening` rather than replaying completion. Run
focused common-lib/Thrall suites, then full
`sbt "common-lib/test" "thrall/test"`. Flag `kupua.apiOnly.admission.enabled=false`; rollback keeps
the gate closed and bypasses it only while all API-only serving flags remain false.

**Done:** official start and completion share the generation; old operations cannot publish; legacy
migration tests and behavior after a disabled gate remain unchanged. This unblocks all routes.

### Phase 2 - Revise cursor search into session create/page

**Capability:** disabled stable search, all three page directions and one exact total through APIs.

**Server work:** add `KupuaSearchSemantics`, `KupuaSemanticSorts`, session service/controller and
target-specific PIT/page methods. Revise `ElasticSearch.searchAfter` into an internal operation;
reject partial results and invalid projected hits. Add create/page/close routes and metrics. Keep
legacy `imageSearch`, `prepareSearch`, `sorts.createSort` and `ImageResponse.create` behavior intact.

**Kupua work:** add semantic types, Zod response schemas, `ApiOnlyDataSource`, application
composition root, API-only start mode and store session lifecycle. Add atomic page/tuple/enrichment
commit. Remove API-only raw PIT and raw sort use; retain direct facade.

**Failing-first/focused:** deleted principal matrix; inclusive dates; shared sort fixtures; strict
types; page-one/continuation under insert/update/delete; partial response; duplicate/lost request;
all commit paths. Run focused Scala/session and Vitest files, then full `sbt "media-api/test"` and
`npm --prefix kupua test`. Because the store/scroll lifecycle changes, run full habitual direct E2E
and a focused API-only Firefox search journey after the required port warning. Run the guarded local
special-sort oracle after sort/cursor changes.

**Flags/exit:** `kupua.browse.enabled=false`, client `VITE_DATA_MODE=api-only` development-only.
Rollback closes the generation; no direct fallback. Done when Section 7 review criteria for page
behavior pass. This unblocks exact coordinate operations.

### Phase 3 - Exact map, locate, range and deep seek

**Capability:** indexed scroll, exact focus/history rank, out-of-buffer range and deep seek all use
the displayed snapshot.

**Server work:** add chunked position, locate, range and seek operations using the session's stored
query/sort/PIT and CAS scheduler. Port current null-zone, lexicographic rank, selected-maximum and
overshoot semantics; disable exact totals on map chunks. Return progress/continuation and typed
expiry. Current direct implementations identify the algorithms
(`kupua/src/dal/es-adapter.ts:1278-1635,1982-2193,2251-2338`).

**Kupua work:** route all seek tiers, sort-around-focus, restore and selection range through IDs and
server-issued tuples. Add low-priority map accumulation and cancellation. Inject the composition
root into selection; remove API tuple reconstruction.

**Failing-first/focused:** ordinary mutations during page/map/rank/range; every sort and null zone;
5,000 range plus truncation proof; 65,000 map completeness; high-cardinality keyword continuation;
page priority amid map/range; cancellation/expiry. Update position-map, keyword-seek, range,
history and eviction tests before behavior changes. Run full media-api, Kupua unit, habitual E2E,
API-only Firefox coordinate journey and special-sort oracle.

**Flags/exit:** independent server flags for positions, locate, range and seek, all false. A required
feature flag may aid rollback while the whole API-only mode remains dark; it cannot be disabled in
an enabled complete mode. Done when all three tiers and range/history journeys pass with zero ES.

### Phase 4 - Live counts, contextual aggregation and distributions

**Capability:** polling, facets, typeahead, collection counts and scrubber labels leave browser ES.

**Server work:** add generation-gated live counts, contextual aggregations and provenance-rich
distributions, with endpoint-local semantic filters, verbatim field allowlist, nested usage parent
counts and caps. Reuse ticker definitions and query semantics; do not change legacy aggregation or
GET search routes.

**Kupua work:** route search-store polling/facets/typeahead/distributions and collection-store
counts through the shared source. Preserve optional absence and request supersession. Remove the
collection ES constructor.

**Failing-first/focused:** one initial count; ticker names/sub-counts; visible/hidden timing;
fully-qualified paths; named deleted/under-quota filters; nested usage parent counts; expanded cap;
typeahead abort; collection optional absence; scalar and special-date provenance; incomplete keyword
coverage. Run full media-api and Kupua unit; habitual and API-only Firefox filters/scrubber/
collections journeys.

**Flags/exit:** separate counts, aggregations and distributions dark-build flags, false. For the
complete-mode acceptance gate they are all true. A runtime distribution request may still fail as
the existing optional presentation absence, but deliberately disabling the implemented capability
does not satisfy functional completion. Counts and contextual facets cannot be absent. Done when
background traffic also passes the zero-ES listener.

### Phase 5 - Guarded image reads and selection hydration

**Capability:** direct detail URLs, selection hydration and metadata refresh use API responses.

**Server work:** add target-specific batch lookup with visibility filtering, strict cap, lean
projection and existing `ImageResponse.create` shaping. Do not use legacy migration-aware getter or
alter `GET /images/:id`.

**Kupua work:** implement abort-aware chunks/concurrency two; route detail and selection through
`getImages`; commit metadata/enrichment once; inventory and optionally consume signed media URLs
without removing existing S3/imgproxy paths prematurely.

**Failing-first/focused:** ordered visible/missing/hidden mixtures, cap rejection, complete special
arrays/aliases, server fields, detail 404, selection reload/omission/core failure, cost summary and
abort. Existing direct `_mget` tests remain direct-mode; selection store tests gain the injected
API source. Run full media-api/Kupua unit and both E2E surfaces.

**Flags/exit:** `kupua.multiRead.enabled=false`; rollback makes required detail/selection unavailable
and therefore keeps complete API-only mode dark. Done when no detail or selection path constructs ES.

### Phase 6 - AI parity and complete zero-ES acceptance

**Capability:** health-gated AI leaves browser Bedrock/ES; the full mode is functionally complete.

**Server work:** add health and Kupua-semantic AI routes using existing embedder/cache and search
primitives with explicit filters, default blend, cap, total and failure behavior. Keep legacy AI GET
unchanged.

**Kupua work:** switch API-only health/search, keep current ordinary absence, remove API-only
Bedrock proxy reachability, finish terminal ES middleware/fetch guard and the full Firefox journey.

**Failing-first/focused:** direct-versus-server fixture for filters, weight 0/default/1, ordering,
cap, total and unavailable health; complete journey plus request listener. Run full media-api and
Kupua units, full direct habitual E2E and full API-only Firefox E2E. No performance test is run as a
correctness substitute.

**Flags/exit:** `kupua.ai.enabled=false` is a dark-build and emergency rollback flag only. It must be
true for complete-mode acceptance whenever the underlying AI health dependency is available; the
new health route cannot report false merely because the route flag is off and let the journey skip
parity. Ordinary underlying health absence remains an accepted optional state.
`kupua.apiOnly.enabled=false` remains the aggregate production gate. Done when every acceptance-floor
journey works and Firefox records zero ES under all configured origins/signatures.

### Phase 7 - Aggregate load, ingress proof and canary

**Capability:** production enablement decision, not new functionality.

Complete production ingress/auth evidence, run the pre-registered aggregate workload in a permitted
non-production environment, set route caps/lifetimes, then canary Internal users. Enable server
route flags before clients but leave admission/API-only aggregate flags closed until compatibility
and capacity pass. Rollback closes/increments the gate and turns off API-only ingress; it never
restores browser ES. A required workflow failing capacity keeps the full mode dark until fixed or a
new product decision explicitly changes the floor.

## 13. Test migration and parity plan

| Layer | Existing tests affected | New falsifiable evidence | Full surface |
|---|---|---|---|
| Shared semantics | Direct sort/CQL/date tests | One JSON fixture loaded by Scala/TS; deliberate mutation makes one side fail | Scala and Vitest fixture suites |
| ES/session integration | `ElasticSearchTest` cursor/projection blocks | Real local ES page/map/rank/range/seek under insert/update/delete; timeout/partial/expiry | `sbt "media-api/test"` |
| Controller/auth | No current cursor controller suite | Internal principals, deleted scope, hidden/missing, strict JSON, typed outcomes, migration gate | Full media-api tests |
| Gate/store/Thrall | `MigrationStatusProviderTest`, Thrall migration tests | Fake clock, Dynamo CAS/TTL, official start/complete, cross-instance/restart | `sbt "common-lib/test" "thrall/test"` |
| Kupua DAL/store | Grid API, Strangler, PIT, map, seek, range, history, selection, collection tests | Mode routing, session lifecycle, atomic publication, cancellation, unavailable/re-anchor | `npm --prefix kupua test` |
| Direct browser | Habitual API-blocked Chromium suite | Proves direct mode unchanged | `npm --prefix kupua run test:e2e` |
| API-only browser | None; current fixture blocks API (`e2e/shared/helpers.ts:18-38`) | Firefox full journey and all-origin/signature ES rejection | New `npm --prefix kupua run test:e2e:api-only` |
| Special sort | Existing opt-in local oracle (`integration/special-sort-es.test.ts:1-18`) | Same order/tuple/map/rank/range after server clause changes | Guarded `test:special-sort-es` |

Existing direct assumptions have explicit dispositions:

- `e2e/global-setup.ts:29-62,119-170`, `e2e/local/scrubber.spec.ts:40-61` and
  `e2e/local/collections.spec.ts:1-10` remain direct-mode fixtures; API-only gets a backend fixture
  and API assertions instead of browser/local-ES probes.
- `e2e/local/ui-features.spec.ts:500-528` remains a direct-mode raw-sort assertion. Shared semantic
  fixtures and API request assertions cover the API-only sort contract.
- `src/dal/es-adapter.test.ts:83-87,492-566` and
  `src/dal/selections-dal.test.ts:72-76,161-281` retain direct adapter expiry, `_mget` and no-PIT
  range behavior; API-only session/batch/range suites are separate.
- `e2e-perf/perf.spec.ts:92-104,1818-1840` and
  `e2e-perf/harness-validation.test.mjs:59-63` currently classify selection hydration only by direct
  `/_mget`. Keep their existing metric as a direct baseline and add an API-only route classifier;
  do not silently relabel the old metric as aggregate API-only evidence.
- `e2e/local/selections-mobile.spec.ts:34-39` loses its redundant per-file API block only in the
  API-only counterpart; habitual direct mode keeps the shared API-absence fixture.

Every implementation session writes the failing test first, runs it to confirm the intended failure,
makes the smallest change, reruns it, then runs the full relevant surface. For any `kupua/src`
change, full unit tests are mandatory. For component, hook, store, scroll/focus or selection changes,
full habitual E2E is mandatory. Before either Playwright surface, warn that ports 3000 and 3030
must be free and ask whether a server is running. Commands stream through bare `tee` with
`set -o pipefail`, per repository directives.

The API-only final journey is one maintained acceptance specification, not a path-only smoke test.
It searches each size tier, extends both ways, seeks shallow/deep/End, exercises static/configured/
special sorts and focus/history reload, opens facets and typeahead, reads collection counts, opens
detail and traverses, hydrates/reloads selection, selects an out-of-buffer range, triggers polling
and distributions, and runs AI when health is available. It repeats core failure, expiry and
migration closure. The test asserts no configured ES origin, `/es` path or Elasticsearch operation
signature was requested at any point.

## 14. Instrumentation and aggregate load plan

### 14.1 During implementation

Instrument every route from its first disabled build. Record bounded dimensions only: route,
outcome, status, duration, ES `took`, hit/bucket/work count, response bytes, timeout/partial result,
cap/truncation and cancellation. Session metrics record create/page/operation/close/expiry,
generation rejection, active sessions, operation lease/CAS conflict, cleanup count and age, PIT
renew/close failure and return to baseline. Map/range/seek report chunks and work; batch reports ID
count and payload; image routes report aggregate enrichment/signing/serialization duration. Never
log query text, image IDs, raw handles/PITs or principal identity. Current metrics expose only one ES
timer plus search type, so these are additive metric families
(`media-api/app/lib/MediaApiMetrics.scala:11-18`).

Retain current cursor-search measurements as component evidence: a 200-hit lean ES response and
Argo enrichment/signing costs are real, but not a whole-mode verdict
(`../../../03 Ce n'est pas une pipe dream/media-api-work/d3-search-after-04-performance.md:118-130,190-258`). All server capabilities remain false by
default and independently reversible where the acceptance floor permits.

### 14.2 After functional completion

Before observing results, media-api, ES, SRE and Kupua owners record numeric budgets. Replay a
representative aggregate interaction model derived from browser traces: search starts; short and
long page extension; visible/hidden polling; facet opens, expanded facets and typeahead bursts;
map build; shallow, scalar and high-cardinality keyword seek; locate/range; detail/traversal;
selection hydration at 1/50/200/500/1,000; distributions; available AI; multiple tabs; and a
projected concurrent-user curve. Run route-isolated and combined workloads with ordinary
insert/update/delete activity.

Budgets cover existing Kahuna/media-api p95/p99 and errors; media-api CPU, allocation, active work,
GC, post-GC heap and autoscaling recovery; ES `took`, queue/rejections, heap, disk, file descriptors,
open contexts and retained segments; final Argo raw/compressed bytes, serialization, enrichment and
signing; session table latency/conflict/TTL and cleanup return; feature interaction latency; and
S3/imgops/Bedrock/satellite load where used. Any legacy bound breach, ES rejection, unbounded PIT/
segment retention, missed cleanup or required-feature interaction failure rejects production
enablement.

Canary in increasing, pre-agreed cohorts with automatic gate closure on core error/resource budgets.
Route flags remain useful for dark build and emergency rollback, but the complete-mode gate requires
every acceptance-floor capability enabled. AI may be absent only when its underlying health
dependency is genuinely unavailable; a distribution request may degrade as current optional
presentation does, but a capacity-failed or deliberately disabled implementation keeps aggregate
API-only mode dark. Failure of browse, exact coordinates, contextual facets, polling, detail or
selection likewise keeps it off. A separate service/fleet is a measurement-triggered mitigation,
not the default architecture.

## 15. Production and Kahuna isolation argument

Kahuna follows existing root search/image links and `GET /images`; it does not know the new
session/API-only paths (`kahuna/public/js/services/api/media-api.js:34-108`). All new browser
capabilities use new routes and false flags. Existing GET request parsing, exclusive dates, partial
result policy, progressive migration search, M-first getter, response fields and legacy sort remain
unchanged.

| Shared production-reachable file | Planned change | Isolation proof required |
|---|---|---|
| `media-api/app/controllers/MediaApi.scala` | Add handlers or extract byte-equivalent image helper | Existing controller tests/fixtures show legacy GET output unchanged. Prefer new controller class if constructor size/reachability makes isolation clearer. |
| `media-api/app/lib/elasticsearch/ElasticSearch.scala` | Add target-specific methods; internalize cursor primitive | New methods never call/alter `prepareSearch` for legacy paths; full legacy integration suite. |
| `ElasticSearchModel.scala` | Add strict new protocol models; remove unreviewed raw model if undeployed | Existing `SearchParams` and GET parser unchanged. |
| `ImageResponse.scala` | Reuse unchanged initially | Any later one-pass optimization requires byte-equivalent fixture and separate review; not an API-only prerequisite. |
| `MediaApiComponents.scala`, config, metrics | Wire additive services/flags/metrics | Flags false gives current object graph behavior except inert resources. |
| Common-lib new admission store | New types/table only | No existing caller or config key changes. |
| `ThrallMigrationClient.scala` and message processor | Close/drain API-read admission before start; reopen after completion | Existing migration ES ordering/alias actions unchanged; disabled aggregate mode cannot block current migration. Enabled mode fails start closed rather than bypassing gate. |
| Auth/common filters/sorts | No semantic change | New routes call existing registries or endpoint-local helpers; `sorts.createSort` and shared date helper stay untouched. |

The narrow interlock is the only production migration-path change. Its independent safety value is
preventing an explicitly unsupported client from entering migration, but it must not be portrayed
as migration hardening: it does not correct current progressive duplicate/stale reads, fence writes,
or validate cutover. Rollback disables API-only admission before removing the hook. Production
enablement also requires cookie/CSRF/preflight proof through the intended ingress; repository source
shows common CORS/CSRF filters but not effective deployment values
(`rest-lib/src/main/scala/com/gu/mediaservice/lib/play/GridComponents.scala:29-44`,
`common-lib/src/main/scala/com/gu/mediaservice/lib/config/Services.scala:78-86`).

## 16. Discarded and deferred old-plan items

| Item discarded/deferred | Why | Exact consequence |
|---|---|---|
| Extend legacy `GET /images` with raw cursor/PIT | Risks existing contract and exposes wrong abstraction | New session routes carry pagination; Kahuna unchanged. |
| Standalone PIT routes | Allow page one outside snapshot and browser lineage | PIT exists only inside session service. |
| Raw client sort/filter DSL | Duplicates server authority and leaks ES | Semantic request plus shared fixtures. |
| One endpoint per interface method | Current methods form one ordered result | Map/rank/range/seek fold into session; internals are not routes. |
| `searchRange`, standalone `count`, corpus `getAggregation` | No current application caller (`dal-contract.test.ts:12-31`, `typeahead-fields.ts:191-220`) | Types are removed/reserved; no visible reduction. |
| Independent exact rank/map/range endpoints | A later live corpus is not the displayed order | Session subresources only. |
| Separate percentile and keyword-target public routes | They are navigation mechanics, not user contracts | Session seek owns progress and final exact landing. |
| Old incomplete keyword continuation token shared with distribution | Tied presentation to exact navigation and replayed work | Distribution stays live; session seek has its own opaque progress. |
| Uncapped 1,000-image public mget | Direct chunk size ignores enrichment/payload | 200 provisional cap plus measured replacement rule. |
| Existing media-api AI as "equivalent" | Defaults, totals and browser ownership differ | Additive Kupua-specific mapping; legacy AI unchanged. |
| Full decision-04 migration programme | Solves migration-transparent Grid, not this reduced mode | Migration remains unavailable; only admission interlock is built. |
| Mandatory one-URL/S3/imgproxy removal | Zero browser ES does not require it | Preserve current media delivery until ingress/load evidence supports rewire. |
| Shared `ImageResponse.create` optimization | Potential value, insufficient output/load proof | Measure final mode; pursue separately with byte-equivalence tests if triggered. |

## 17. File and service footprint

This is the expected footprint; exact new filenames may change only if local ownership is preserved.

| Area | Files/symbols |
|---|---|
| Kupua DAL | `src/dal/types.ts`, `index.ts`, new `api-only-data-source.ts` and transport/Zod modules; direct facade; `grid-api-search-adapter.ts` retired from API-only. |
| Kupua stores/hooks | `search-store.ts`, `selection-store.ts`, `collection-store.ts`, `enrichment-store.ts`, `useRangeSelection.ts`, `useUrlSearchSync.ts`, detail/traversal call sites and tuple cache. |
| Kupua startup/config | `vite.config.ts`, `scripts/start.sh`, `package.json`, new API-only Playwright config/global setup/fixture. |
| Kupua tests/fixtures | New `test-fixtures/api-only-search-semantics.json`; DAL/store tests; Firefox journey; existing special-sort oracle. |
| media-api new paths | New `KupuaBrowseController`, `KupuaBrowseService`, `KupuaSemanticSorts`, `KupuaSearchSemantics`, admission/session models/store adapter; routes and tests. |
| media-api shared files | Additive methods/types/wiring in `ElasticSearch.scala`, `ElasticSearchModel.scala`, `MediaApiComponents.scala`, `MediaApiConfig.scala`, `MediaApiMetrics.scala`; reuse `ImageResponse.scala`. |
| Common-lib/Thrall | New admission store/config types; `ThrallMigrationClient.startMigration/completeMigration`, `MessageProcessor.createMigrationIndex`, `ThrallComponents` wiring and migration tests. |
| Infrastructure | Dynamo table, TTL/encryption, media-api/Thrall IAM, local dev table/config, same-origin ingress and feature configuration. Effective production templates are currently Unknown. |
| Elasticsearch | No mapping/alias/write-policy change. New PIT, page, aggregation and target-specific read workload only. |
| Optional services | Existing S3/imgops/collections remain; Bedrock moves behind media-api for API-only AI. |
| Documentation | `AGENTS.md`, changelog, worklog, deviations, media-api agent rules and API-only run/test docs when implementation lands. |

## 18. Residual decisions and evidence gates

The architecture and endpoint boundary are decided. Residual items choose verified values or
enablement, not competing designs.

| Evidence/decision | Owner and cheapest resolution | Blocks |
|---|---|---|
| Cursor route deployed/callers | Platform records deployed SHA and route metrics without user data | Contract replacement implementation/review |
| Complete migration/alias entry inventory | Migration/platform static credential and code-path review | Any product implementation that claims atomic exclusion |
| Shared table provisioning and grants | Platform proves media-api+Thrall conditional/TTL access in local/TEST | Gate implementation integration |
| Exact ES/PIT lineage under loss | media-api runs local exact-version concurrent/lost-response/CAS oracle | Browse-session review, not initial scaffolding |
| POST-read convention sign-off | media-api team reviews established cursor precedent | Route review |
| Semantic fixture completeness | Kupua/media-api owners enumerate current dynamic aliases/tickers and mutate each side once | Cursor/aggregation review |
| Principal binding across login renewal | Auth owner defines stable Internal identity/tier claims; replay tests | Browse review |
| Production same-origin ingress, CORS/CSRF/cookie | Auth/platform config review plus one HTTP preflight/cookie POST test | Production enablement only |
| Fleet, JVM, ES version/headroom | Platform records non-secret deployment facts | Production load plan/enablement only |
| Session lifetime and route caps | Post-build experiments with budgets set first | Production enablement only |
| Final Argo fields/bytes/signing and media origin | Browser response-consumption fixture plus aggregate measurements | Production enablement; may trigger optimization |
| High-cardinality keyword seek budget | Disabled full-mode workload on representative cardinality | Production enablement; failure keeps complete mode dark |
| Aggregate workload and canary budgets | media-api/ES/SRE/Kupua pre-register numbers, then measure | Production enablement only |

If the alias inventory finds an official path that cannot share the gate, the atomic premise fails
and work stops under the prompt's Section 0 rule; do not fall back to a polling claim. If capacity
or ingress evidence fails after functional completion, keep the implementation dark and correct it;
that is not retroactive premise failure and does not justify browser ES.

## 19. Source coverage and untraced surfaces

Read in full: repository directives, `AGENTS.md`, worklog, active media-api index, both media-api
guides, the revised-assessment prompt, newer production-impact/migration decision/scope documents,
the complete performance source audit, the three current cursor-search documents, old companion
workplan, historical findings and original API-first plan. The expressly permitted archived
`_shard_doc` analysis was incorporated through current documents and source.

Current code traced: all `ImageDataSource` methods and direct constructors; search, selection,
collection, detail, traversal, history, facets/typeahead, distributions and AI owners; Vite/start/
Playwright mode wiring; media-api routes/controller/model/ES/query/sort/response/auth/component/
metrics and representative tests; migration status, Thrall start/complete/message paths; shared
Dynamo patterns; deployment outline and config boundary.

Intentionally untraced: unrelated writes and rendering internals; live logs; TEST/CODE/PROD;
credentials; real responses/user data; remotes; effective production infrastructure; and broad
archive designs. Actual cursor-route deployment, alias credentials, ingress, fleet, IAM, production ES version
and capacity remain named gates rather than inferred facts.

## 20. What done looks like

- [x] The reduced premise passes from current ownership; no accepted workflow lacks an additive
  backend boundary.
- [x] API-only means zero browser Elasticsearch and does not silently expand into mandatory one-URL
  media deployment.
- [x] Official migration start and every API-only request share one narrow durable generation;
  polling bounds and out-of-band non-guarantee are explicit.
- [x] Page one, total, continuation, map, rank, range and exact seek share one snapshot; live data
  cannot mint coordinates.
- [x] Every current datasource method, direct constructor and workflow has a build/reuse/fold/live/
  rewire/defer decision.
- [x] Cursor search has a concrete pre-review replacement covering auth, inclusive dates, semantic
  sort, tuple authority, integrity, count, enrichment, projection, failures and tests.
- [x] Polling, contextual facets/typeahead, nested usage counts, collections, guarded image reads,
  distributions and AI have implementable contracts and caps.
- [x] One composition root reaches search, selection, collections and detail; API-only cannot import
  or fall through to the ES adapter.
- [x] Startup, exact Vite read-via-POST allowances, terminal ES guards and a Firefox all-origin/
  signature network oracle make zero ES mechanically testable.
- [x] Implementation phases name files/symbols, old tests, failing-first evidence, full regressions,
  flags, rollback, prerequisites and exit criteria.
- [x] Instrumentation ships with disabled code; aggregate load and numeric budgets occur only after
  functional completion and before traffic.
- [x] Existing Kahuna/search/sort/date/auth/mapping/write/migration-read behavior remains unchanged;
  every shared production file and the one narrow Thrall hook are called out.
- [x] Discarded old endpoints and unused methods state their exact product consequence.
- [x] Residual gates distinguish implementation/review blockers from production enablement evidence.
- [x] No product code, tests, builds, profiling, live systems, credentials or private data were used
  to produce this workplan.