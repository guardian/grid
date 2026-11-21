# API Boundary 10: Provisional Integration Review

**PROVISIONAL. 19 September 2026. Coordinator-owned operator checkpoint.**
This is a migration recommendation from bounded evidence, not comprehensive review closure,
the candidate plan, implementation approval or a deployment verdict. P01-P17 are preserved and
accepted as their declared reading packets; acceptance does not verify every resulting contract.
Coverage, stale inputs and unresolved dependencies remain visible below. **Stop here for operator
review: no further dispatch, candidate 11 or challenge 12 is authorized by this report.**

Authority: the amended [protocol 05](api-boundary-05-review-protocol.md#L13) and
[prompt 08](api-boundary-08-review-prompt.md). The [active index](media-api-00-index.md),
[capability inventory](media-api-01-capability-inventory.md#L17),
[endpoint workplan](media-api-02-next-endpoints-d7-d8-d9-workplan.md#L1) and original reports
remain unchanged. Their current banners, not superseded historical sketches, control scope.

## 1. Recommendation: What We Would Build Differently

Keep Kupua's navigation, bounded buffers, background collectors, generation guards, focus/history,
image traversal and density continuum in the client. Move admitted data operations behind Grid,
reusing its policy and image authorities. Do not move the interaction state machine into Grid or
build an endpoint for every old DAL method. Smooth browsing from arbitrary positions among millions
is the purpose; sorting, maps and counts support it rather than replacing it as the priority.

The substantive changes to the preserved sketches are:

1. **A small additive query boundary, not assumed GET equivalence.** Reuse D3's parsed defaults,
   deleted-uploader authorization and shared filter builder together. Add compatible bounded shallow
   windows and contextual aggregates where existing GET does not satisfy the actual caller.
2. **Source-free positional reads, with collectors initially retained in Kupua.** Typed key pages
   serve dedicated-PIT maps and live bounded ranges; port exact live rank separately. Do not fetch
   enriched images to construct a 65k map or introduce a universal snapshot/session programme.
3. **Canonical image normalization as real migration work.** Reuse singleton GET for detail, add
   bounded visible bulk hydration, and return normalized images plus enrichment/delivery metadata.
   Publish overlays at guarded caller commits, not from inside adapters.
4. **Explicit completion and progress for new exact operations.** HTTP 200, a short enriched page,
   and `track_total_hits:true` are not proofs of complete execution. Keep this endpoint-local;
   do not change shared GET failure handling or reopen the completed D3 amendment batch by default.
5. **AI and deployed delivery are separate compatibility decisions.** Existing server AI is not
   the client algorithm. Removing browser ES does not replace development S3/imgproxy/bootstrap.

These recommendations preserve useful limits and accepted approximation: small scrolling through
1,000, indexed coordinates through 65,000 independently of map readiness, deeper seek, bounded image
buffers, live range selection through 5,000, one semantic sort and approximate deep landing/date
presentation. No index migration, durable sessions, Dynamo, Thrall interlock or stronger universal
snapshot guarantee is selected. No new performance cost is accepted merely because transport moves.

## 2. Evidence and Decision Strength

[P15](api-boundary-09-p15-grid-query-policy.md) examined Grid query/filter/sort/authorization and
actual GET callers; [P16](api-boundary-09-p16-image-response.md) examined canonical image responses,
normalization, hydration, delivery and shared callers; [P17](api-boundary-09-p17-paging-lifecycle.md)
examined ordinary paging, lifecycle and completion. They join the store/view/producer originals
already examined in [P09](api-boundary-09-p09-core-store.md),
[P10](api-boundary-09-p10-core-view.md) and [P13](api-boundary-09-p13-data-producers.md).

The coordinator checked assignment accounting, receipt/source hashes and decisive originals,
including D3 admission/result assembly, machine-method restrictions, the image writer, nested
edits and the client mapper. Integration added 124 application-scope receipts across 98 paths and
15 claims (E045-E059); P17's API-total premise instead qualifies existing E013. All earlier packet
records, receipts, classifications, dependency statuses and stale states were preserved.
The [evidence register](api-boundary-07-evidence.json) contains original paths, ranges/pointers,
fingerprints and limitations. The packets' administrative/context reads are not new application
coverage, and none of these receipts is independent verification or a newly executed product test.

**Supported facts** include distinct GET/POST policy, machine POST denial, incomplete client image
normalization, real shared response consumers, current raw/decoded cardinality differences and
operation-specific lifecycle. **Recommendations** below choose reuse/addition boundaries from those
facts. Exact wire shapes, handle transport, caps, deployment policy and unresolved compatibility
choices remain proposals, not implemented guarantees.

## 3. Old-Plan Consequences

### Queries, Counts and Ordering

| Item | Keep / Reuse / Change | Necessary Grid Work | Kupua Work and Remaining Decision |
| --- | --- | --- | --- |
| D3 shared foundation | Keep completed cursor/reverse/End/null mechanics and Option B. Reuse both parser and controller authorization, not parser alone. | New query-bearing reads apply principal tier, parsed defaults, positive-deleted uploader restriction, shared filters and required syndication runtime mapping before hits/counts/buckets. No legacy parser or global auth rewrite. | Send consistent query intent. Remove duplicate substring-based POST default injection only in a separately authorized compatibility change; preserve direct mode explicitly. Resolve quoted/uppercase intent, aliases, IDs, dates, free-text and configuration parity. E045-E047; P15 F01-F04. |
| Shallow paging; historical A `searchRange` | Change the claim that GET offsets are an exact client-only replacement. Preserve actual shallow-seek callers, not an unused wrapper. | Add a bounded Kupua-order image window with authoritative tuples. D3 currently rejects nonzero offset; keep that behavior unless a compatible extension is separately chosen. No deep-offset replacement for browsing millions. | Replace the positive-offset ES bypass while retaining global origin and shallow/deep choice. Legacy GET's sort/envelope does not supply the needed contract. P15 F05-F06; P17 F1-F2. |
| D7 count/tickers | Keep dedicated polling/count capability; reuse size-zero exact counting and configured ticker/subcounts. | Apply the same admitted policy as hits, including runtime prerequisites. Failed/incomplete counts must not be successful zero. No route solely for unused standalone `count`. | Recommend initially retaining first-page ownership of session total and current parallel page/open/ticker timing. Polls use D7; startup fusion is optional later work, not a gate. Untracked/subset totals never replace session total. E013, E048; P17 F2. |
| C1/C2 contextual terms, named filters, nested counts; collection counts | Change blind reuse of corpus GET aggregates. Existing aggregate parameters are CQL-only and their total is bucket count. | Add full-context admitted terms/named/nested-parent counts with allowed fully qualified/configured fields and bounded sizes. Reuse server named-filter policy, not browser DSL. | Route facets/typeahead and the collection store's separate datasource. Retain parent usage counts, cancellation and optional-data absence. Field/configuration parity and dynamic/expanded facet composition remain open. E048; P15 F03-F04; P13 C08. |
| D3 and D1-D6 sort contract | Keep one semantic token, deterministic physical suffixes, selected-max special dates, null tail and authoritative tuples. | Retain D3 Option B now. If positional additions need server-owned semantic expansion, use a Kupua-specific admitted builder; never change Kahuna's `sorts.createSort`. | Preserve URL policy and saved tuples; do not synthesize cursors from projected display values when server tuples exist. Prove configured expansion/null/reverse/End agreement on the selected surface. E049; P13 C03. |

Original anchors: [POST admission](../../../../../media-api/app/controllers/MediaApi.scala#L867),
[filter scope](../../../../../media-api/app/lib/elasticsearch/QueryBuilder.scala#L154),
[POST parser](../../../../../media-api/app/lib/elasticsearch/ElasticSearchModel.scala#L145),
[aggregate path](../../../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L630),
[shallow bypass](../../../../src/dal/strangler-adapter.ts#L47),
[GET caller](../../../../../kahuna/public/js/services/api/media-api.js#L41).
New POST reads do not cover restricted machines automatically: [ApiAccessor](../../../../../common-lib/src/main/scala/com/gu/mediaservice/lib/auth/ApiAccessor.scala#L29)
permits only GET for ReadOnly and qualifying GET for Syndication. Retain that policy. Naming the
intended deployed principal audience precedes any endpoint-scoped change; never globally allow POST.

### Positional Reads and Ordinary Lifecycle

| Item | Keep / Reuse / Change | Necessary Grid Work | Kupua Work and Remaining Decision |
| --- | --- | --- | --- |
| D8 ordinary PIT lifecycle | Replace the obsolete multi-index migration sketch, not the accepted parallel startup model. | Server chooses the ordinary current target; open a single-target context, apply timeout/keep-alive, return refreshed continuation, close accepted contexts idempotently. Reauthorize and admit target/continuation safely. | Move open/close off browser ES; retain PIT-less first page in parallel, generation guards and bounded browse expiry-to-live recovery. Decide overlap, refreshed-ID adoption, lost responses and close/refusal distinction. E058; P17 F3/F6. |
| D1 position maps | Keep dedicated-context, valued/missing phases and client collection/publication. Correct unconditional completeness claim. | Source-free typed key pages with bounded work, explicit execution status, raw continuation and phase exhaustion. Dedicated map context must not resume live after expiry. | Publish only an entire successfully completed attempt; discard incomplete/expired attempts. Preserve 65k eligibility, yields and internal-versus-public tuples. Raw/frozen filter relationship and aggregate admission remain unresolved. E033, E057; P17 F4. |
| D2 range selection | Keep current live `(from, to]` semantics, null crossing and 5k cap plus one qualifying lookahead. Remove compulsory snapshot/ID-resolution interpretation. | The typed key capability can serve live range pages with distinct completion, cancellation, refusal and cap outcomes. No image enrichment needed. | Keep collector and authoritative endpoint tuples; route selection's own datasource and retain commit guards. Do not substitute an older map slice or treat `truncated:false` as complete execution. E035; P13 C07; P17 F4. |
| D4 exact rank | Port existing scalar/null/selected-max lexicographic predicate; do not impose same-snapshot rank universally. | Live admitted exact-count operation with execution/shard checks. Any separately needed PIT rank would use a PIT size-zero search, not `_count`. | Rank the actual landing tuple. Disposition restore's saved-rank/refreshed-neighbour and page-total issues separately; exact predicate is not immutable membership. E013/E014; P13 C04; P17 F4/F6. |
| D5 deep seek; D6/C3 profiles | Keep typed scalar/composite/profile work and accepted approximation, separate from exact key enumeration. | Preserve exact parent coverage/null boundaries and explicit completeness/provenance; bounded approximate anchors/buckets need no universal exact histogram. | Retain traversal/seek orchestration and presentation interpretation. Do not make special-date child buckets exact selected-max ranks or promote estimated landing to an exact ordinal. Configuration, collation and work/capacity limits remain open. P13 C06; report 04 F2. |

Original anchors: [parallel startup](../../../../src/stores/search-store.ts#L2252),
[D3 PIT and result assembly](../../../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L809),
[map collector](../../../../src/dal/es-adapter.ts#L1986),
[live range](../../../../src/dal/es-adapter.ts#L2254),
[rank](../../../../src/dal/es-adapter.ts#L1282),
[profiles](../../../../src/dal/es-adapter.ts#L1443).

P17's integrity-protected, principal/purpose/target/expiry-bound **stateless handle is an option**,
not an approved requirement or a reason to introduce shared session storage. The required decision
is how the selected boundary authenticates and admits continuation without trusting arbitrary client
targets. Encoding, key distribution, multi-instance validation and overlap/loss behavior remain
unresolved. Do not silently replace raw D3 PIT transport. Preserve deliberate public `_shard_doc`
truncation and distinguish malformed/foreign refusal from ordinary expiry. A map cannot use browse's
expiry-to-live fallback. Request abort and a per-search timeout do not prove ES task cancellation
or an aggregate scan/concurrency budget.

### Images, AI and API-Only Completion

| Item | Keep / Reuse / Change | Necessary Grid Work | Kupua Work and Remaining Decision |
| --- | --- | --- | --- |
| A `getById`; D9 singleton-through-bulk sketch | Reuse visible canonical `GET /images/:id`; compulsory fusion is unnecessary. | No new singleton endpoint. Preserve existing full metadata, visibility and migration-aware getter behavior. | Normalize GET for standalone detail; retain wrapper actions/delivery links and publish overlay after identity/cancellation guard. Detail field/projection and successful-missing versus unavailable need explicit handling. P16 F3-F5. |
| D9 bulk hydration | Keep additive bounded visible image batches, not pinned search or unchecked helper reuse. | Ordinary-target bulk lookup, shared lean projection/strip-before-validation, per-image visibility and canonical output. Hidden/missing are indistinguishable; item/decode/request failure is not confirmed absence. | Inject selection datasource, use ID matching, abort-aware bounded chunks/concurrency, preserve membership on incomplete reads. Choose cap without reducing total useful selection size. E052/E055; P16 F2/F4. |
| Response normalization / old removed Gap 11 | Change the assertion that envelope work is finished. Reuse canonical semantics, not a second serializer. | Retain original projected source for alias extraction and complete usages/collections. No global flattening or lean GET substitution. | Shared normalizer handles nested edits/labels, optional expanded file metadata, usages/leases/collections and actual alias JSON types. DAL results carry image(s), overlays and needed delivery data; callers publish. Do not fabricate required asset values. E053-E054; P16 F2-F3. |
| AI historical A/client-only item | Refute algorithm equivalence; reuse infrastructure only with an explicit behavioral decision. | Preserve Grid AI for existing callers. A bounded Kupua compatibility operation is the default direction if retaining current ranking is required; deliberate adoption of server semantics needs operator acceptance. | Preserve health gate, flat result bound, loaded-hit total/tickers, relevance/uploaded reorder, cancellation and no ordinary PIT/paging. Embedding/health and ranking-quality consequences remain unexamined. E050; P15 F07. |
| API-only routing and delivery | Keep hybrid development separately; no-browser-ES alone is not deployed completion. | Reuse approved secure image/service links and policy; agree reachable deployment/configuration. No automatic new image-policy service. | Remove every ES constructor/bypass/fallback in API-only mode, including selection/collection and refusal recovery. Wire media transforms/URLs, expiry/refresh and startup config while preserving orientation, DPR/zoom and traversal. E017/E056/E059; P16 F8; P17 F6. |

Original anchors: [singleton visibility/response](../../../../../media-api/app/controllers/MediaApi.scala#L775),
[canonical writer](../../../../../media-api/app/lib/ImageResponse.scala#L58),
[nested edits](../../../../../common-lib/src/main/scala/com/gu/mediaservice/model/Edits.scala#L57),
[current mapper](../../../../src/dal/grid-api-search-adapter.ts#L31),
[selection ownership](../../../../src/stores/selection-store.ts#L344),
[detail commit](../../../../src/components/ImageDetail.tsx#L238),
[Grid AI](../../../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L186),
[Kupua AI](../../../../src/dal/es-adapter.ts#L1134),
[media helpers](../../../../src/lib/image-urls.ts#L195),
[discovery](../../../../src/dal/grid-api/service-discovery.ts#L33).

The AI difference is concrete: Grid uses OR lexical matching and separate fusion, default weight
0.85, filter-pool totals, and embedding before its zero-weight branch. Kupua uses AND lexical
matching with a max-score blend, default weight 1, skips embedding at zero, and publishes loaded-hit
totals with hit-ID-scoped tickers. Similar endpoint names are not a compatibility argument.

## 4. Completion, Absence and Existing Source Risks

**E033 is reconciled, not erased.** [Report 04 F1](api-boundary-04-reconciled-recommendation.md#L25)
and [R6](api-boundary-04-reconciled-recommendation.md#L226) record the previously executed synthetic
control/HTTP-200-timeout/failed-shard cases. All returned the same non-null one-entry map.
The [existing fixture](../../../experiments/api-boundary/api-boundary-04-e01.ts#L15) and current
collector support this exception: thrown errors/observed aborts discard arrays, but short pages
with incomplete-execution flags can count as exhaustion. P13's blanket complete-map wording is
withdrawn centrally in E033; both original reports remain historical evidence. No rerun, live
incidence estimate, UI reproduction or product fix occurred in this stage.

For proposed exact counts/keys/rank, inspect applicable execution/shard outcomes before asserting
completion. For image windows, keep raw scan progress, decoded entities, tuple alignment, authorized
membership and session total distinct. D3 currently drops invalid image/tuple pairs and derives
continuation from survivors; the client can also skip entity data without compacting tuples.
The recommended initial strict-window choice is an explicit incomplete/unavailable result on a
decode/alignment defect. A bounded skip/fill alternative needs an approved coordinate/progress
contract; unbounded refill or silent compaction is not an acceptable implicit design.

These are proposed new-boundary contracts, not a change to existing D3/GET defaults or the shared
[ES execution wrapper](../../../../../common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/ElasticSearchExecutions.scala#L12).
Optional Grid enrichment/satellites retain graceful absence with no new error toasts or warnings.
For future primary API reads, absence must preserve prior selection/window state rather than
masquerading as confirmed missing IDs, zero count or complete map. The exact result representation
and caller treatment must be agreed for each capability; this report does not override the current
development-phase absence directive or silently introduce a new user-facing error policy.

Separate source-only findings remain unresolved: E013 now has both direct and API untracked-total
premises; E014 ranks a saved tuple while paging around a refreshed tuple; E017's generic restore
catch can reach shallow direct ES after refusal in hybrid mode. P17 also found inconsistent adoption
of refreshed IDs by fill/backward consumers. These are not reproduced UI failures, observed auth
exploits or evidence that predecessor PIT IDs failed in deployment. They require focused disposition,
not a universal session redesign. No repairs are authorized here.

## 5. Shared Callers and Performance

Kahuna actively consumes GET offsets/count suppression, nested labels/leases/collections,
actions and image/download links. Cropper requests expanded file metadata. Those are concrete
compatibility boundaries, not hypothetical callers: [Kahuna paging](../../../../../kahuna/public/js/search/results.js#L330),
[accessors](../../../../../kahuna/public/js/services/image-accessor.js#L11),
[downloads](../../../../../kahuna/public/js/services/image/downloads.js#L43),
[cropper read](../../../../../cropper/app/controllers/CropperController.scala#L189).
Keep GET parsing/sorting/envelopes, canonical image semantics, restricted-machine method policy,
shared ES success handling, migration routing/getters and satellite links unchanged. Additive routes
still share JVM/ES resources; additive does not mean zero load risk. Download handlers can record
usage, so replacing a download with a direct asset request is not automatically behavior-neutral.

| Existing Evidence | Decision It Supports | Limit Retained |
| --- | --- | --- |
| Canonical 12 September direct-ES/media-api short, long and jank campaigns, four runs each; E002-E004/E006 | The working seek/focus/density/traversal core has measurements. Preserve and use them, not a new baseline campaign by default. | Local media-api over TEST tunnel, differing origins/source identities, uncontrolled cache and mixed direct/API routes. Not API-only completion or production capacity. |
| D3 investigation: lean projection and shipped gzip; E005 | Reuse shipped compression/projection. Do not claim the old uncompressed transport penalty persists or mandate a new writer. | Historical query/topology-specific measurements, not current deployed throughput. |
| Historical 200-image envelope: about 129ms creation plus 8ms serialization, including about 29ms signing | Avoid enriching key/count/rank results and blindly inheriting direct-ES 1,000-image/all-parallel batching for D9. | No linear extrapolation to bulk latency or accepted cap. The reverted 68-81ms writer bundled link removal; transform-only savings were not isolated. |
| Current source signs before creating the link list | Keep delivery requirements explicit before optimizing envelope fields. | A link-list gate alone does not demonstrate removal of signing cost; source inspection is not timing. |

Original evidence: [canonical perceived history](../../../../e2e-perf/results/perceived-log.json)
entries 54-57; [canonical jank history](../../../../e2e-perf/results/audit-log.json) entries 43-44;
[handbook topology](../../../../e2e-perf/README.md#L167);
[D3 investigation](d3-search-after-04-performance.md#L222). Historical/generated views are not
independent confirmations. P14's remaining schema/scenario/comparer limits still apply.

No experiment is requested now. Later decisions may need genuinely new evidence: D9's chosen
enriched batch/concurrency cost; typed-key payload and API overhead without image work; the selected
API-only media/auth topology and multi-user admission. Existing records cannot measure those
unimplemented combinations. Each needs a precise deciding question and separate authorization;
none justifies repeating the established core because this review did not read every campaign.

## 6. Proposed Preparation Order and Operator Decisions

Retain the active plan's **D7, then D9** preparation order. For D7, keep initial-total ownership and
parallel startup unless an explicit alternative is selected. For D9, settle singleton GET reuse,
normalizer/result ownership, hidden/missing semantics and bounded batch policy together. Resolve
ordinary D8 before its map-dependent reads; shallow windows and admitted key/rank/profile operations
then form bounded capability slices, not one endpoint-per-method implementation batch. Contextual
facets/collection ownership, AI compatibility and deployed delivery remain required for completion,
not optional feature cuts. No slice is authorized for implementation by this ordering.

| Decision / Blocker | Recommendation at This Checkpoint | Owner Before Implementation |
| --- | --- | --- |
| Intended principals and query/config parity | Start from existing human-user auth policy; no restricted-machine expansion by implication. Explicitly disposition differing defaults, aliases, IDs, free-text, ignored fields and runtime configuration. | Operator and Grid policy/config maintainers; D018/D024/D029. |
| Counts and image-read ownership | Retain session-total owner; use canonical singleton GET and result-carried caller-published overlays. Preserve membership on incomplete bulk reads. | Operator, then bounded DAL/caller contract review; D017/D030/D031. |
| Exact completion and ordered-image omission | Endpoint-local execution checks; prefer failure/absence over silent coordinate compaction for the initial exact-window contract. Keep legacy defaults intact. | Operator and Grid API maintainers; D027/D029/D031. |
| Ordinary target and continuation transport | No migration/durable-store scope. Choose admission integrity, overlap/loss, refresh and close semantics; signed stateless handles remain an option. | Operator and Grid auth/deployment maintainers; D018/D027. |
| Work bounds and performance | Preserve useful 65k/5k limits and parallel first-visible work. Choose batch/key admission and concurrency from the actual proposed operation, not historical source comments. | Operator and Grid service owners; D002/D019/D027. |
| AI semantics | Preserve current user-visible contract by default; reuse a different ranking only with explicit acceptance. | Operator, then AI producer/caller owners; D026/D030. |
| Deployed delivery and API-only behavior | Treat media/config reachability, expiry and all datasource owners as explicit completion work; hybrid remains separate. | Operator and deployment/client owners; D017/D018/D023-D025. |

Future verification should follow the selected change: cross-layer query/principal fixtures;
tuple and coordinate agreement across reverse/null/End/shallow reads; partial-execution refusal;
bulk omission versus failure and guarded overlay publication; ordinary PIT overlap/expiry/cleanup;
and actual API-only owner routing. Existing assertions must first be checked for old-behavior
expectations. These are verification criteria, not permission to run suites, live work or a new
campaign now. Required regression surfaces still apply to any separately authorized code changes.

## 7. Honest Coverage and Checkpoint

After P15-P17 integration there are **1,559 review-required files: 207 read, 35 partial and 1,317
inventoried**. Three entries remain stale, overlapping those reading states; none is verified.
There are **1,317 unassigned required files and 20 unresolved dependencies**. No scope-pending files
remain, but classification is not reading. All application dispositions and prior receipts were
preserved; new review reports are excluded administration, not a way to improve coverage.
The unchanged enumerated validator reports **zero errors, `readyForSynthesis: false`**.

The exact manifest and remaining ranges live in [register 06](api-boundary-06-coverage.json).
For scale, Kupua has 61 read / 15 partial / 469 inventoried required files; media-api has
38 / 1 / 12; common-lib 17 / 2 / 192; Kahuna 12 / 4 / 313; rest-lib 10 / 0 / 20.
These counts describe inspected content, not risk rankings or proof of complete workflows.

| Outstanding Work | Explicit Gaps and Dependency Records |
| --- | --- |
| Core composition and assertions | D016/D027/D028/D031/D032: ordinary restore assertions, URL/history/cache/orchestration joins, traversal publication, remaining navigation/Scrubber/geometry sections, map raw/frozen scope and range/selection assertions. Full store/view reads do not close every caller join. |
| Independent owners and query/configuration | D017/D018/D023/D024/D025/D029/D030: partial selection/detail/field-registry/config/API-type reads; collection and AI composition; deployed mapping/config semantics; bootstrap and retained script callers. |
| Producer/build and shared services | D018/D026: AI producer/native packaging/deployment and broad remaining shared-model/mapping/service coverage. Source constraints, including the recorded Node/locked-jsdom engine mismatch, are not observed runtime failure. |
| Existing evidence and old-plan coverage | D001-D003/D019-D021: remaining canonical entries/methodology/history and preserved-plan sections. P15-P17 compare the relevant decision items, not every item in every historical plan. Nine lock families remain partial; no peripheral closure campaign follows. |
| Stale records | AGENTS, the human directive copy and changelog retain stale states. Research routing changes do not silently recredit their application coverage. The user's changelog rollback remains untouched. |
| D033 | Separately scoped, open and nonblocking. The operator-approved external-file link remains untouched; no credential access, link inspection, runner edit or operational workflow occurred. |

The coordinator retains these integration dependencies pending operator review; any future
delegation requires a new bounded assignment. Earlier queue wording is not authority to resume a
comprehensive campaign. The comprehensive completion standard has not changed and has not passed.

**Checkpoint outcome:** mandate amended; E033 reconciled against original executed evidence;
P15-P17 completed and integrated; this provisional recommendation delivered. Product source,
original plans/reports, review tooling and the credential runner are unchanged by this stage.
No product tests, live systems, new performance campaign or Git mutation. Stop for operator review.