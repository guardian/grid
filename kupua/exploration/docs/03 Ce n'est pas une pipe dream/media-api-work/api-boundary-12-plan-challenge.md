# P29: Provisional Plan Challenge

20 September 2026. Role `candidate-challenge`; execution class `strong-independent`.
Fresh independent reviewer, explicitly invoked by the operator. Report only.
Finding labels C1-C3 below are local to P29, not reopened D3 amendment labels.

## 1. Decision

**Verdict: suitable basis with named conditions.** Candidate 11 is a defensible provisional
migration direction, not yet an implementation brief whose independently described slices can
all be enabled unchanged. C1-C3 below require precise activation dependencies and backlog
dispositions. They do not justify replacing its architecture or reopening the whole review.

The important choices are sound: retain Kupua's bounded buffer and interaction machinery;
move admitted data operations to Grid; retain Option B with bounded server admission; use
source-free keys and client collectors; reuse singleton GET, canonical image creation and
existing hosting/signing/embedding facilities. Do not restore secondary sorting, impose a
5,000-total-selection ceiling, or introduce migration support, durable sessions or universal
snapshots. API-only must remove ES datasource construction and traffic across every active owner,
not merely rename the current hybrid adapter.

This is **review acceptance with conditions, not implementation or deployment authorization**.
S1 remains accepted at `61f4b0f2c5c006f78ddfc527cae4d73e9fd9a5b0`, also confirmed as current HEAD.
Its recorded regression evidence and candidate section 7 are untouched. Whole-corpus readiness
remains false; no necessary unread first-party dependency was found that requires restarting
primary inspection to decide this bounded challenge.

## 2. Material Findings and Bounded Alternatives

### C1. Join New Query Admission to D3 Before Activating a Shared Browse Path

**Candidate claim challenged:** [common admission](api-boundary-11-candidate-plan.md#L109)
corrects automatic-default composition for new reads, while the
[D3 row](api-boundary-11-candidate-plan.md#L143) retains the existing endpoint and
[S2](api-boundary-11-candidate-plan.md#L297) introduces shallow dispatch. The candidate allows
separately approved existing-path corrections, but its sequence does not explicitly make their
query compatibility an activation dependency. Preserving the completed D3 amendment scope is
not evidence that unchanged D3 and corrected new reads will describe one membership set.

**Original evidence:** the [current mapper](../../../../src/dal/grid-api-search-adapter.ts#L115)
injects negative defaults. The [POST decoder](../../../../../media-api/app/lib/elasticsearch/ElasticSearchModel.scala#L160)
also supplies defaults, and [QueryBuilder](../../../../../media-api/app/lib/elasticsearch/QueryBuilder.scala#L113)
groups negative nested conditions by parent before applying one negation. For P28 Q3's ordinary
negative usage-platform input, this composes as `NOT nested(print AND replaced)`, not independent
user exclusion and automatic replaced suppression. The
[direct builder](../../../../src/dal/es-adapter.ts#L461) adds its automatic suppression separately;
[existing assertions](../../../../src/dal/adapters/elasticsearch/cql.test.ts#L118) distinguish a
single negative from deliberately grouped multiple user negatives. Decoder-only
[intent assertions](../../../../../media-api/test/lib/elasticsearch/ElasticSearchTest.scala#L957)
do not exercise the browser mapper. Removing mapper injection alone still leaves server default
composition to resolve.

This matters at the real consumer: [startup](../../../../src/stores/search-store.ts#L2252)
obtains the retained session total and first page through D3;
[shallow seek](../../../../src/stores/search-store.ts#L2928) then selects the operation S2 replaces.
Corrected window/key/rank membership could therefore exclude a print/published witness that
unchanged D3 includes, even with an unchanging index. A complete individual response would not
make the combined total, cursor neighbourhood and ordinal coherent. This is a source-derived
contract counterexample, not a newly executed query or an observed UI failure.

**Smallest correction:** make shared admitted query meaning an explicit dependency of each
activated ordered-read path, including its D3 first page and continuations. Authorize the narrow
shared default-composition correction, or an explicitly selected D3 compatibility path for the
migrated consumer, before claiming that join complete. Do not change legacy GET, generic nested
negation or machine permissions automatically. A server-only S2 addition can land inactive;
transitional hybrid development need not become API-only immediately. But the final API-only
path cannot permanently mix the two predicates. This joins KUP-011/GRID-001 to their consumers;
it does not commission all P28 corrections or a general direct-mode repair.

**Discriminator still needed:** one composed fixture through the actual mapper/admission and
the selected D3/window/key/rank paths, covering Q3's witnesses, an ordinary control and multiple
explicit user negatives. Check membership, total and rank together, with separate parsed-intent
and authorization controls for Q2/Q4/Q5. No fixture was executed here. Ordinary fuzzy/identifier
settings remain named behavior/cost/approval choices: [the server switch](../../../../../media-api/app/lib/elasticsearch/QueryBuilder.scala#L45)
and [its assertions](../../../../../media-api/test/lib/elasticsearch/QueryBuilderTest.scala#L137)
are not evidence of an accepted direct-Kupua ordinary fuzzy-search feature.

### C2. GRID-008 Has a Known S2 Dependency for the Code-Valued Inputs

**Candidate claim challenged:** [preserve all current filters](api-boundary-11-candidate-plan.md#L86)
and reuse the server query machinery, while leaving
[GRID-008's admitted-field coupling unresolved](api-boundary-11-candidate-plan.md#L568).
That condition is already satisfied for the currently supported publication/section-code inputs.
The separate section-name vocabulary question can remain unresolved.

**Original evidence:** [client usage matching](../../../../src/dal/adapters/elasticsearch/cql.ts#L250)
targets `usages.printUsageMetadata.sectionCode` and the corresponding publication/orderedBy
leaves. The [server grammar](../../../../../media-api/app/lib/querysyntax/QuerySyntax.scala#L104)
accepts these keys, but [resolution](../../../../../media-api/app/lib/querysyntax/QuerySyntax.scala#L142)
produces unprefixed publication/section multiple fields. Neither
[normalisation](../../../../../media-api/app/lib/querysyntax/Parser.scala#L24) nor
[nested query construction](../../../../../media-api/app/lib/elasticsearch/QueryBuilder.scala#L125)
adds the missing absolute prefix. The
[mapping](../../../../../common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/Mappings.scala#L289)
places those attributes under print usage metadata. The existing
[nested assertion](../../../../../media-api/test/lib/elasticsearch/QueryBuilderTest.scala#L172)
tests status, not these leaves. Configured SingleField alias handling does not repair the
MultipleField branch.

**Consequence and smallest correction:** classify the known mapped code cases as a resolution
gate for S2's promised query admission and its dependent reads, not an optional future feature.
Use the existing GRID-008 ID. Agree the narrow field resolution used by the migrated path,
including its D3 join under C1; keep broader vocabulary decisions separate. Do not silently drop
supported syntax or turn this into a shared grammar rewrite. A deliberately isolated endpoint
implementation is not blocked from being written, but activation cannot claim those filters
preserved while delegating them unchanged.

**Discriminator still needed:** valid mapped print-usage fixtures for sectionCode,
publicationCode and orderedBy through the actual composed request path, asserting emitted paths
and IDs/totals. Agree sectionName versus sectionId separately. This is a source-supported
dependency, not a claim of an executed ES witness or a deployed empty-search incident.

### C3. Resolve Restore Coupling at the Consumer, Not by Strengthening Every API

**Candidate claim challenged:** [S3a's effective-tuple rank promise](api-boundary-11-candidate-plan.md#L298)
already determines the relevant acceptance boundary more precisely than the unresolved
KUP-024/KUP-025 classification in section 11. Retain their runtime qualifications, but name
the restore-consumer gate rather than leaving the dependency open-ended.

**Original evidence:** [the centred helper](../../../../src/stores/search-store.ts#L1393)
returns the forward page total. [Restore](../../../../src/stores/search-store.ts#L3919)
chooses global targeting from that total but publishes the retained session total.
[D3](../../../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L890) returns zero when
counting is disabled; [direct paging](../../../../src/dal/es-adapter.ts#L1040) also permits
nonempty untracked pages. [The view](../../../../src/hooks/useDataWindow.ts#L343) remains indexed
from the session total, while [the scroll consumer](../../../../src/hooks/useScrollEffects.ts#L482)
falls back to a buffer-local index when the global target is negative. There is no inspected
downstream conversion that repairs that mismatch. An infinite loop or runtime incidence is not
established; ImageDetail has a per-image attempted-restore guard.

Separately, [restore composition](../../../../src/stores/search-store.ts#L3877) ranks the saved
tuple while loading neighbours around a refreshed tuple. The
[special-sort assertion](../../../../src/stores/search-store.test.ts#L2430) checks saved-tuple
forwarding, not changed-metadata coherence; the
[centred assertion](../../../../src/stores/search-store.test.ts#L2455) uses a small stable corpus.
Ordinary live drift is legitimate, but two deliberately different input tuples within one
claimed exact landing are a separate contract issue.

**Smallest correction:** make KUP-024 a retained-total placement gate when the migrated restore
consumer is activated. Make KUP-025 an effective-landing-tuple gate under the candidate's chosen
promise. Neither blocks a standalone rank method or isolated offset transport. Use the published
coordinate regime; do not count every page. Preserve the unchanged-tuple parallel path where
possible; a conditional rank correction after detecting a changed tuple is a smaller candidate
than always serializing lookup then rank or adding a server locate round trip. Its behavior and
exceptional cost still need approval. No snapshot or historical-membership guarantee follows.

**Discriminator still needed:** retained indexed total with nonempty zero-total continuation
pages, map absent/present, then a changed saved/current tuple. Assert the published image's
global target and the tuple actually ranked. Preserve or intentionally revise the existing
forwarding assertion according to the selected fast path; do not weaken it to hide the mismatch.

### Capability Disposition

| Capability | Disposition and smallest justified boundary |
| --- | --- |
| D3 and shallow window | Keep D3 and S1. A bounded offset capability is justified: [legacy GET execution](../../../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L380) chooses legacy sorts and its [response](../../../../../media-api/app/controllers/MediaApi.scala#L570) lacks Kupua's paired tuple contract. Reuse admitted query, projection and image-writing helpers; a separate thin window action is reasonable. Gate activation on C1/C2 and `offset + length` fitting the actual result-window budget, not just offset below a threshold. No deep-offset promise. |
| Source-free keys | Keep one page capability for both client map and live range collectors, not separate server-complete map/range jobs. [The collectors](../../../../src/dal/es-adapter.ts#L1986) need phase/progress/context distinctions without image validation/signing. Preserve current useful page bounds; do not apply [the image decoder's 200 cap](../../../../../media-api/app/lib/elasticsearch/ElasticSearchModel.scala#L402) to key work by accident. |
| Live rank | Necessary lexicographic count-before behavior; [the existing producer](../../../../src/dal/es-adapter.ts#L1283) includes selected-max and null predicates. A generic total count does not supply it. Port the supported algorithm and keep the client-owned effective tuple; no compulsory PIT or ID re-resolution. C3 is a consumer gate. |
| PIT open/close and map lifecycle | Necessary to remove browser lifecycle traffic. Keep separate browse/map contexts, overlapping successor reads and explicit expiry/lost-response/close behavior. Raw D3 transport is current behavior, not proof of new target admission. Select the required target/principal/purpose rule before choosing a stateless wrapper; signing/key distribution requires approval, durable storage is not implied. Any selected transport must also work at D3, not only keys. |
| Sort profiles | Keep the fixed scalar/composite/stats/bucket operations. [Client algorithms](../../../../src/dal/es-adapter.ts#L1446) justify them; [legacy monthly aggregation](../../../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L630) is not equivalent. Retain bounded client walks, stats-before-buckets and exact parent coverage versus approximate child-date evidence. No generic aggregation DSL or universally exact histogram. |
| Count/tickers | Keep a body-based admitted wrapper for actual polling/startup callers, not a second counting algorithm. Existing [ticker construction/mapping](../../../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L437) is reusable. GET with length zero proves counting already exists, not that its admission/envelope is the selected new contract. Share typed size-zero execution ingredients with contextual aggregates; separate thin actions are reasonable. Do not force startup fusion. |
| Contextual aggregates | New full-context admission is justified: [legacy aggregate execution](../../../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L654) uses structured q alone and returns bucket cardinality as total. Preserve qualified fields, named filters, nested parent counts, empty allowed sets and distinct warm/cold/collection scopes. No endpoint for an unused corpus fallback. |
| Singleton and bulk | Existing [singleton GET](../../../../../media-api/app/controllers/MediaApi.scala#L173) is the smallest singleton solution. Bulk remains a separate ID-only capability with lean parsing and per-found-image visibility; [lookupIds](../../../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L165) is a search path, not the proposed projected mget contract. Preserve caller-owned image/overlay/link publication and logical-success omission rules. No singleton-through-bulk requirement. |
| AI search and capability discovery | A compatibility query operation is justified: [client AND/max-score blending](../../../../src/dal/es-adapter.ts#L1135) differs from [Grid fusion/pool totals](../../../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L210), and [Grid embedding](../../../../../media-api/app/controllers/MediaApi.scala#L678) precedes zero-weight execution. Reuse the producer/query primitives and existing pipeline, not Grid's algorithm by substitution. Consider the smaller capability-discovery alternative below. |
| Bootstrap, media and API-only | Keep these as real client/host work. [Aliases are built at module evaluation](../../../../src/lib/field-registry.tsx#L969); [current discovery](../../../../src/dal/grid-api/service-discovery.ts#L49) supplies no config. [Kahuna serialization](../../../../../kahuna/app/controllers/KahunaController.scala#L52), [declared origins](../../../../../common-lib/src/main/scala/com/gu/mediaservice/lib/config/Services.scala#L83) and [canonical signing/templates](../../../../../media-api/app/lib/ImageResponse.scala#L77) are reuse, not deployment. Current [URL helpers](../../../../src/lib/image-urls.ts#L195) still require development proxies. No new host service, signer or thumbnail-only downgrade is justified. |

**Conditional simplification, not a new requirement:** candidate S9 proposes non-embedding
capability health. If the approved meaning is only configured/admitted availability, advertise a
principal-appropriate AI link/capability on the existing
[authenticated media-api root](../../../../../media-api/app/controllers/MediaApi.scala#L110),
and consume it through discovery, instead of adding a separate health route and startup request.
Keep a separate readiness action only if it answers a genuinely different question. Current
[development health actually embeds](../../../../scripts/bedrock-embed-proxy.mjs#L106), and
[browser health](../../../../src/lib/bedrock-proxy-client.ts#L30) is a separate quiet probe.
A configuration flag is not equivalent to that probe, live model permission or operational
availability. Either replacement requires explicit behavior approval; this alternative is not
implemented and must not serialize ordinary page-one publication behind AI readiness.

**Shared callers stay protected.** [Kahuna](../../../../../kahuna/public/js/services/api/media-api.js#L41)
uses GET filters and its own sort-token convention; [cropper](../../../../../cropper/app/controllers/CropperController.scala#L189)
requests expanded file metadata and decodes its response. Keep their handlers, canonical response,
links/actions and legacy sorting unchanged unless a separately justified correction is approved.
[Restricted machine methods](../../../../../common-lib/src/main/scala/com/gu/mediaservice/lib/auth/ApiAccessor.scala#L29)
do not become POST-capable merely because a read uses POST. Additive routing still shares JVM/ES
capacity; it is not a no-production-impact proof.

### Sequencing and Gates

Keep S2 as the first new Grid contract exercise, subject to C1/C2; D7-first has no necessary
dependency advantage. S3a and S3b remain separately reviewable. S4 gates map lifecycle, not live
rank/ranges or independent S5 work. S6a may proceed independently using GET. S7/S8/S9 share
settled admission but need their own caller acceptance. Prepare S10 alongside these slices;
activate API-only only after all active owners and delivery paths are covered.

| Gate class | Required disposition, not an automatic repair batch |
| --- | --- |
| Whole-plan | No architectural rejection or new primary-reading campaign. Incorporate C1/C2 and C3's precise dependency scope before treating the candidate as an implementation brief. Effective deployment answers and false whole-corpus readiness do not block this provisional review verdict. |
| Exact-operation slices | Agree endpoint-local incomplete/omission outcomes. [Shared ES execution](../../../../../common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/ElasticSearchExecutions.scala#L22) accepting a successful response is not execution-completeness validation; [map collection](../../../../src/dal/es-adapter.ts#L2133) still treats a short HTTP-success page as exhaustion. Preserve E033's historical synthetic exception. Do not impose a global GET/D3 failure policy or refill until success. |
| Range and bulk integration | KUP-002/003 and KUP-001 are real owner gates: [range retry/finalization](../../../../src/hooks/useRangeSelection.ts#L211) and [captured-set hydration](../../../../src/stores/selection-store.ts#L591) cannot be cured by transport cancellation alone. Preserve legitimate late cache reuse in ensureMetadata, `(from,to]`, cap-plus-one and total selection beyond 5k. Whole-read/item/decode failure must not authorize omission repair. |
| Singleton, counts and AI/facets | KUP-004/006/007/005/008 belong to the named consumers. [Singleton stored identity](../../../../src/components/ImageDetail.tsx#L238), [cumulative polling](../../../../src/stores/search-store.ts#L717), [expanded publication](../../../../src/stores/search-store.ts#L4119) and [empty AI IDs](../../../../src/lib/ai-search-params.ts#L16) support scoped acceptance. A nullable transport is not a drop-in caller fix. Keep quiet optional absence distinct from zero, confirmed omission and primary-read refusal. |
| Work budgets | Preserve 1k buffer, 65k indexed coordinates and 5k range walks. The proposed 200-image/two-in-flight bulk setting is only an evaluation candidate, not an accepted cap or latency concession. Validate new envelope/heap/payload/concurrency costs at useful selection sizes; do not extrapolate historical per-200 costs linearly. Key and image budgets are different. |
| API-only/deployment | Verify no ES construction/traffic/recovery in the [factory](../../../../src/dal/index.ts#L34), [selection](../../../../src/stores/selection-store.ts#L344), [collections](../../../../src/stores/collection-store.ts#L116) or captured CQL resolver, including composed refusal recovery. Then establish actual bootstrap/base URLs, credentials/origins/CSP/CORS, rendition renewal/quality and shared capacity. Existing declarations and hybrid tests do not establish these facts. |

## 3. Actual Reading Scope and Receipts

All 38 registered starting paths are accounted for below. Candidate, backlog and active index
were read completely. Prior reports were used to locate originals; receipt arrays are not
substituted for source reasoning. The five decisive prior-reading projections have current
`read`, non-stale entries; their existence is not independent semantic verification.

Ranges are inclusive and deliberately conservative. **For every line-range receipt, every line
outside the listed union is uninspected in P29. For JSON, every unlisted field is uncredited.**
This states the unread complement without duplicating long files or histories. Additional
incidental output/search snippets confer no broader credit. Prior packets' wider receipts remain
intact. Hashes identify current regular-file bytes; administrative inputs and installed CQL stay
outside new application-coverage promotion. No file is proposed as globally `verified`.

### Assigned Inputs

```json
[
  {"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-11-candidate-plan.md","sha256":"92e8d495276cb643348227697e97fb2a7d73581efe11e376b6bd434a5920e634","method":"full-text","ranges":[[1,615]],"note":"Complete candidate, including protected S1 and sections 10-11; no edits."},
  {"path":"kupua/exploration/docs/bug-backlog.md","sha256":"e448912d58d181b1ee2b244993a99aaf9d85ad766f83e055544e7ebbbf23e9a9","method":"full-text","ranges":[[1,445]],"note":"Complete classifications; parked bugs not re-audited as a batch."},
  {"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/media-api-00-index.md","sha256":"a8409c8c847b1aff3e5c4912db25b1fa3890630bb3f556bc7c88285abc7e2666","method":"full-text","ranges":[[1,99]],"note":"Current authority and historical limits."},
  {"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/media-api-01-capability-inventory.md","sha256":"c16cc0be5448393df78978cd962b7b60ab953f2c74804f06e7ae9ed57794f83e","method":"line-ranges","ranges":[[1,286]],"note":"Current checklist, corrections and historical matrix; remaining per-method history not reread."},
  {"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/media-api-02-next-endpoints-d7-d8-d9-workplan.md","sha256":"86dbaa4406fd0c75402487922b9b1e32cb1e4803e6b7e7929716b5a7bdcf9220","method":"line-ranges","ranges":[[1,439]],"note":"Banner, D7/D8/D9 contracts and obsolete execution instructions read as history, never executed."},
  {"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-06-coverage.json","sha256":"f47d1bb63fad897eb3d0d41859904c40c2fbaec18a961e76b06992c118cde808","method":"json-pointers","pointers":["/packets/28","/files/1319/status","/files/1319/stale","/files/1394/status","/files/1394/stale","/files/1472/status","/files/1472/stale","/files/1512/status","/files/1512/stale","/files/1519/status","/files/1519/stale"],"note":"Also explicit structural projections: packetId/method/ranges of receipts for those five files; id/status/nextAction for dependencies 15,16,17,22,23,24,25,26,27,28,29,30,31; current assigned hashes and checker summary. No whole-register semantic reading or closure."},
  {"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-07-evidence.json","sha256":"61652faf451f435cec437b392a1f8fc5c7b9c84e1d01e434c5706ef85eaf7c33","method":"json-pointers","pointers":[
    "/claims/12/statement","/claims/12/scope","/claims/12/limits","/claims/13/statement","/claims/13/scope","/claims/13/limits","/claims/16/statement","/claims/16/scope","/claims/16/limits","/claims/32/statement","/claims/32/scope","/claims/32/limits",
    "/claims/46/statement","/claims/46/scope","/claims/46/limits","/claims/49/statement","/claims/49/scope","/claims/49/limits","/claims/53/status","/claims/53/statement","/claims/53/scope","/claims/53/limits","/claims/55/statement","/claims/55/scope","/claims/55/limits",
    "/claims/90/statement","/claims/90/scope","/claims/90/limits","/claims/91/statement","/claims/91/scope","/claims/91/limits","/claims/92/statement","/claims/92/scope","/claims/92/limits","/claims/93/statement","/claims/93/scope","/claims/93/limits","/claims/94/statement","/claims/94/scope","/claims/94/limits",
    "/claims/95/statement","/claims/95/scope","/claims/95/limits","/claims/96/statement","/claims/96/scope","/claims/96/limits","/claims/97/statement","/claims/97/scope","/claims/97/limits","/claims/98/statement","/claims/98/scope","/claims/98/limits"
  ],"note":"Selected E013/E014/E017/E033/E047/E050/E054/E056/E091-E099, including integrated P26-P28 limits. Source arrays and unrelated claims not reread wholesale."},
  {"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-09-p18-history-identity.md","sha256":"a60fa69fb3b2b112a7da3dbc536b2bf25e03f058df2948f93c395037846dcdc2","method":"line-ranges","ranges":[[1,71],[191,221]],"note":"Material history/restore claims, integration requests and limits."},
  {"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-09-p20-detail-traversal.md","sha256":"ab0d5c4879ef8dd27e68e007471adc3cabd075bf3897f85938c60e019435b713","method":"line-ranges","ranges":[[1,92],[155,160],[212,240]],"note":"Traversal/exit/media findings, exact performance selectors and integration limits."},
  {"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-09-p21-selection-collections.md","sha256":"3bff9450fc2452586e624c88a677deaea1d2b94ed452bdb0e83c9f35dc09f2e4","method":"line-ranges","ranges":[[1,98],[229,254]],"note":"Owner/membership/collection findings and integration requests."},
  {"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-09-p22-query-ui-owners.md","sha256":"a337bbd94273664adacccb72e94f354f8e2c6dd38debd0e50964424bdf2ac23d","method":"line-ranges","ranges":[[1,103],[227,250]],"note":"Count/facet/AI/typeahead/overlay findings and integration limits."},
  {"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-09-p26-configuration-evidence.md","sha256":"570e1711cee59e02c0348ebb82cd9fe162e7d66bc6815404789ed69d00ab56d2","method":"line-ranges","ranges":[[1,64],[141,143],[159,178]],"note":"Source versus effective-config/hosting/signing/script conclusions; no new generator or script audit."},
  {"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-09-p27-ai-producer-build.md","sha256":"adf5a96353440bd3987bb825667a68ceda6ddd09f982cad57b9fd3c9323f816a","method":"line-ranges","ranges":[[1,78],[168,172],[186,200]],"note":"Producer/query/build reuse and external limits, independent bugs kept separate."},
  {"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-09-p28-concrete-query-discrepancies.md","sha256":"f15acb8d3022be04ec9f7d2289545b07afb3fbdeca03c19eb6f6e9c13ed104e9","method":"line-ranges","ranges":[[1,70],[155,159],[178,221]],"note":"Complete concrete table and prose dispositions/integration; long machine-readable claim arrays are not credited."},
  {"path":"kupua/src/dal/types.ts","sha256":"eee76d90dd39062b25aa85de9f27df1fdd777093c4ea13ef4893d2d8680c809d","method":"full-text","ranges":[[1,530]],"note":"Current params, total/tuple/result and selection contracts."},
  {"path":"kupua/src/dal/strangler-adapter.ts","sha256":"530547cf2430d174e84693b3a705a18e5dbee1edd1bb8e90a692cbb0963fa7f3","method":"full-text","ranges":[[1,85]],"note":"Hybrid dispatch, optional methods, expiry/refusal/unavailability and signal checks."},
  {"path":"kupua/src/dal/grid-api-search-adapter.ts","sha256":"39ef336ef8bc666979692d3c48c8e693da786c4dae4266ef892435a1e1ff8d73","method":"full-text","ranges":[[1,210]],"note":"Request/default/count composition and result-owned tuples/overlay; accepted S1 not reopened."},
  {"path":"kupua/src/stores/search-store.ts","sha256":"f1e85ce469d9aaa54f365f950a273aecfc4ebb22ef6dbcd63ddfb105b540b872","method":"line-ranges","ranges":[[717,847],[1220,1460],[2150,2480],[2880,3075],[3835,4220]],"note":"Poll/freeze, map and centred helpers, startup/AI, shallow/map routing, restore and facet publication. Remaining full lifecycle relies on prior packets, not new P29 credit."},
  {"path":"kupua/src/dal/es-adapter.ts","sha256":"7ddcd36711bd5fc5a8edd6e2e35270bd51a554e210bf7ace8db2b194ed4573f5","method":"line-ranges","ranges":[[70,132],[450,2340]],"note":"Comparator plus continuous query/transport/page/AI/rank/profile/map/bulk/range producers. Earlier policy constants not reread."},
  {"path":"kupua/src/hooks/useDataWindow.ts","sha256":"a9ffe7106e04b64312ec6def9ca4ee8ac0f7be206368e728f57a327e88269df6","method":"line-ranges","ranges":[[270,490]],"note":"Total-based coordinate/access and deferred range-seek consumer."},
  {"path":"kupua/src/hooks/useScrollEffects.ts","sha256":"7b0fe8dbd43ac314b9fedbcc2599a36fb84b138f46420bcce8728d5bb8f07a2e","method":"line-ranges","ranges":[[245,375],[395,700]],"note":"Current-focus exit resolver, seek targeting and nearby coordinate effects; not a whole geometry review."},
  {"path":"kupua/src/stores/selection-store.ts","sha256":"0a4585831e65de79eb69de17a9d725dc771470013ffb26c5352bf66bc37c8394","method":"line-ranges","ranges":[[335,696]],"note":"Constructor, membership/clear/anchor, ensureMetadata, hydrate and persistence merge."},
  {"path":"kupua/src/hooks/useRangeSelection.ts","sha256":"9c637f8cb904d8d1a9fe62fabbd8a43be605c59d62809b95d61cfe08f93288d3","method":"full-text","ranges":[[1,307]],"note":"Complete endpoint order, cap, publication/finalization and current error handling."},
  {"path":"kupua/src/components/ImageDetail.tsx","sha256":"96ef263e395375da1c0939ca8f613e6a403e1b551934de80c0cae1abb41ee71b","method":"line-ranges","ranges":[[195,345]],"note":"Cached restore guard, singleton identity and traversal/close caller; other gesture/media paths reused from P20/P25 only."},
  {"path":"media-api/app/controllers/MediaApi.scala","sha256":"859610f8fa50e925082125cb9c7a19f92941725add7a87e771619c160e4f7a26","method":"line-ranges","ranges":[[100,232],[550,595],[677,731],[750,912]],"note":"Discovery/singleton visibility, GET response/policy, AI embedding order and D3 admission/response; intervening actions not reread."},
  {"path":"media-api/app/lib/elasticsearch/ElasticSearchModel.scala","sha256":"4a46deb66ea728cdf93ae16e1cb83bd4fb030cde29558fb5bd6e1778e4a45fbb","method":"full-text","ranges":[[1,429]],"note":"Body/GET/default/sort decoders and length/offset validation; no parser execution."},
  {"path":"media-api/app/lib/elasticsearch/QueryBuilder.scala","sha256":"d973848aa988c7a050afd2395c084d2329eff653a4b6d6a0cc4003df8aaee321","method":"full-text","ranges":[[1,239]],"note":"Complete actual query/filter/nested/fuzzy/alias composition."},
  {"path":"media-api/app/lib/elasticsearch/ElasticSearch.scala","sha256":"c563114420f0297cd5c61566258d45608886759a0cee167840a14e0899ce052d","method":"line-ranges","ranges":[[100,465],[550,933]],"note":"Getter/lookup/AI, GET/tickers, aggregates, target routing and complete D3 execution. Supplier quota middle and construction prefix not reread."},
  {"path":"media-api/test/lib/elasticsearch/ElasticSearchTest.scala","sha256":"b17c50aba7054d1f7b880d410ea4274c558d18245d6b07fd61b95ad5c67aa1a1","method":"line-ranges","ranges":[[815,1175]],"note":"Selected controller-policy/date/intent, decoder and ordinary/null continuation assertions; no full fixture/harness or execution credit."},
  {"path":"kupua/src/stores/search-store.test.ts","sha256":"fb57d7a1cf1fb4f582e61648852b55e30b9e61749af475fa4880dc59457340e1","method":"line-ranges","ranges":[[2260,2505]],"note":"Nearby focus and actual saved-cursor/centred restore assertions, not the whole suite or runtime."},
  {"path":"kahuna/app/controllers/KahunaController.scala","sha256":"7454077e025280dbb4a8013e3a489ee477692ad16a714f3d0f9df094f067537f","method":"full-text","ranges":[[1,100]],"note":"Actual host/login/config serialization facility, not Kupua packaging."},
  {"path":"common-lib/src/main/scala/com/gu/mediaservice/lib/config/Services.scala","sha256":"7b7dd02e05b9f359ad1406eb2bdaa1e7a129b30e48cc7c9bbccbecc17c4ef772","method":"full-text","ranges":[[1,91]],"note":"Declared service origins, override and CORS set, not effective browser policy."},
  {"path":"cdk/lib/image-embedder-lambda.ts","sha256":"af271830c1ad63870a26500b38235e19b9e387c3688ec3d72bd747824dba74eb","method":"full-text","ranges":[[1,236]],"note":"Existing resources/artifact/IAM/network/schedule declarations; no synth, config or deployment access."},
  {"path":"image-embedder-lambda/src/embedder/thrallEventPublisher.ts","sha256":"46331348be412fd94a6f0f0aa208257f4cbb81886a9b81cde2f54db48e401364","method":"full-text","ranges":[[1,133]],"note":"Vector-prefix and message publication mechanism, not vector quality or deployed state."},
  {"path":"kupua/e2e-perf/results/audit-log.json","sha256":"418ce79282cb4aa3f1fe9b5e56a342c44704e1cc144c0f5c587cb7d32de18325","method":"json-pointers","pointers":[
    "/entries/43/label","/entries/43/timestamp","/entries/43/runs","/entries/43/environment","/entries/43/baseline_rtt_ms","/entries/43/metrics/P14a","/entries/43/metrics/P15b",
    "/entries/43/metrics/P14b/committedSteps","/entries/43/metrics/P14b/renderedCount","/entries/43/metrics/P14b/landingRenderMs","/entries/43/metrics/P14b/scenarioRevision","/entries/43/metrics/P14c/committedSteps","/entries/43/metrics/P14c/renderedCount","/entries/43/metrics/P14c/landingRenderMs","/entries/43/metrics/P14c/clsOccurrenceRate","/entries/43/metrics/P14c/clsConditionalMagnitude","/entries/43/metrics/P14d/committedSteps","/entries/43/metrics/P14d/renderedCount","/entries/43/metrics/P14d/landingRenderMs","/entries/43/metrics/P14d/clsOccurrenceRate","/entries/43/metrics/P14d/clsConditionalMagnitude",
    "/entries/44/label","/entries/44/timestamp","/entries/44/runs","/entries/44/environment/dataMode","/entries/44/environment/appBaseUrl","/entries/44/environment/cacheClass","/entries/44/environment/gitSha","/entries/44/environment/gitDirty","/entries/44/environment/gitDirtyStateHash",
    "/entries/44/metrics/P14a/committedSteps","/entries/44/metrics/P14a/renderedCount","/entries/44/metrics/P14a/landingRenderMs","/entries/44/metrics/P14a/scenarioRevision","/entries/44/metrics/P14b/committedSteps","/entries/44/metrics/P14b/renderedCount","/entries/44/metrics/P14b/landingRenderMs","/entries/44/metrics/P14c/committedSteps","/entries/44/metrics/P14c/renderedCount","/entries/44/metrics/P14c/landingRenderMs","/entries/44/metrics/P14c/clsOccurrenceRate","/entries/44/metrics/P14d/committedSteps","/entries/44/metrics/P14d/renderedCount","/entries/44/metrics/P14d/landingRenderMs","/entries/44/metrics/P14d/clsOccurrenceRate","/entries/44/metrics/P15b/committedSteps","/entries/44/metrics/P15b/completionBoundary","/entries/44/metrics/P15b/scenarioRevision","/entries/44/metrics/P15b/maxFrame"
  ],"note":"Exact selected paired resident-traversal evidence. Other metrics, raw samples and historical entries not credited; projection/hash is not a new measurement."},
  {"path":"kupua/e2e-perf/results/perceived-log.json","sha256":"6e05f5bfcf3721dd1e330fe4714a9ad288c87d01fcb125a1dfc611ea34b8b517","method":"json-pointers","pointers":[
    "/entries/54/label","/entries/54/runs","/entries/54/environment/dataMode","/entries/54/environment/appBaseUrl","/entries/54/environment/cacheClass","/entries/54/environment/gitSha","/entries/54/environment/gitDirty","/entries/54/environment/gitDirtyStateHash",
    "/entries/55/label","/entries/55/runs","/entries/55/environment","/entries/55/baseline_rtt_ms","/entries/55/perceived/JB5",
    "/entries/56/label","/entries/56/runs","/entries/56/environment/dataMode","/entries/56/environment/appBaseUrl","/entries/56/environment/cacheClass","/entries/56/environment/gitSha","/entries/56/environment/gitDirty","/entries/56/environment/gitDirtyStateHash",
    "/entries/57/label","/entries/57/runs","/entries/57/environment/dataMode","/entries/57/environment/appBaseUrl","/entries/57/environment/cacheClass","/entries/57/environment/gitSha","/entries/57/environment/gitDirty","/entries/57/environment/gitDirtyStateHash","/entries/57/perceived/JB5/sampleCount","/entries/57/perceived/JB5/dt_visual_settled_ms","/entries/57/perceived/JB5/dt_visual_settled_p95_ms","/entries/57/perceived/JB5/settledTotal","/entries/57/perceived/JB5/routes","/entries/57/perceived/JB5/scenarioRevision"
  ],"note":"Paired metadata and exit-only JB5; short-action metrics and the rest of the history not reread."},
  {"path":"kupua/e2e-perf/perf.spec.ts","sha256":"cd815510687e6789eddf1be63c036cf59d15c9714e0922b99469eb321f22abe4","method":"line-ranges","ranges":[[871,1120],[2192,2350]],"note":"P14 preparation/identity/landing and P14/P15 scenarios; incidental P16 prefix not used as evidence. Never imported or run."},
  {"path":"kupua/e2e-perf/perceived-long.spec.ts","sha256":"c5cb35ab70eb964055d1f657c10f84b445a97e905224f95f2b4cf273f8d38e07","method":"line-ranges","ranges":[[352,403],[1014,1092]],"note":"JB5 observer plus trace reset/start and exit block only; no scenario execution."}
]
```

### Supplemental Originals

```json
[
  {"path":"kupua/src/components/CqlSearchInput.tsx","sha256":"2fb096586b2f479ad7c9954a4655301405ce030a2eea1e4933e8b41c5e91dab7","method":"line-ranges","ranges":[[1,320]],"note":"Registration, captured resolver/datasource and cache refs."},
  {"path":"kupua/src/components/FullscreenPreview.tsx","sha256":"6dfb3490d200dd4ae306195c3b2c2fa80307b6936c218b72e85fecad1d3a358f","method":"line-ranges","ranges":[[175,305]],"note":"Conditional exit settlement/session question, not a gesture audit."},
  {"path":"kupua/src/dal/adapters/elasticsearch/cql.ts","sha256":"636a39cd8f0767f0a44f19fc5b494b6fd412df5e6ee3c0c480e4af2c571cb165","method":"line-ranges","ranges":[[110,312]],"note":"Ordinary free-text, alias and concrete usage-field producers."},
  {"path":"kupua/src/dal/adapters/elasticsearch/cql.test.ts","sha256":"71ac5f00d04fd0184894b70103d0fd5d71b847b32362cc323a9242d79640d908","method":"line-ranges","ranges":[[88,199]],"note":"Existing single/grouped negative and usage assertions, not run."},
  {"path":"kupua/src/dal/index.ts","sha256":"4c9b5395ad937e15f08a8f29c12cfb3be060a6157fbb2b17a37e72d74f768b0a","method":"full-text","ranges":[[1,41]],"note":"Actual factory construction in both current modes."},
  {"path":"kupua/src/stores/collection-store.ts","sha256":"069fecb6ba3a05dda598da3cf1dac181b9faf71a7241046886c0e0c391c8e30f","method":"line-ranges","ranges":[[100,207]],"note":"Independent datasource, boot count scope and complete tree absence handler."},
  {"path":"kupua/src/main.tsx","sha256":"1f9cfdf75880d66dc596e82f3c922e59ad394d7035eac0e61e7c0279cefa47a7","method":"full-text","ranges":[[1,72]],"note":"Static import graph and independent startup reads."},
  {"path":"kupua/src/lib/image-urls.ts","sha256":"34d20901d4be59f39a25c2792f167e9e7a678bc28290ac0618a0f44fc69ecc57","method":"full-text","ranges":[[1,282]],"note":"Current proxy gates, transforms, formats, DPR/native limits and zoom URLs."},
  {"path":"kupua/src/lib/bedrock-proxy-client.ts","sha256":"b56b62c2f7e3366aafcfa21d065652b93dd55f2206c1934b3b57c8bd8aeddc13","method":"full-text","ranges":[[1,40]],"note":"Separate browser embedding and quiet health outcomes."},
  {"path":"kupua/src/lib/ai-search-params.ts","sha256":"a698be1b76348d5c515c1ba8decc6cbcf9bf14d19686111d191d3cfeeafd248f","method":"full-text","ranges":[[1,27]],"note":"Empty versus absent membership decoration."},
  {"path":"kupua/src/dal/grid-api/service-discovery.ts","sha256":"863c7f3fbc345262b7b1e31a5fea53a0de4466018dfa1c258c9a173852e4a240","method":"full-text","ranges":[[1,121]],"note":"Root discovery and unimplemented config handoff; not effective deployment."},
  {"path":"kupua/scripts/bedrock-embed-proxy.mjs","sha256":"cf738c37acaa734d2402be8a4f18206f23b36c3d9d3df2dbc1e8aa0f2f9827f6","method":"line-ranges","ranges":[[90,143]],"note":"Actual embedding health probe and development-only registration, never imported."},
  {"path":"kupua/e2e-perf/README.md","sha256":"431d4623d2b3b502507a31a3a04bf71f5b092fc9ce226b8f7db79aa5019fa203","method":"line-ranges","ranges":[[140,210]],"note":"Methodology/topology limits; operational examples not executed."},
  {"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/d3-search-after-04-performance.md","sha256":"ac51c521c307c9fb8b5b7d2583b193b431e27ee2b80ca5f43038ada7e32b5394","method":"line-ranges","ranges":[[215,301]],"note":"Historical envelope/projection/tunnel findings and retractions, not new capacity proof."},
  {"path":"kupua/node_modules/@guardian/cql/src/cqlInput/CqlInput.ts","sha256":"cb4ab875c4f040aa539869a454766a51cad546ff151f290202f00f94d2747c06","method":"line-ranges","ranges":[[1,145]],"note":"Immediate installed dependency: registered class closes over supplied typeahead. Remains excluded from application inventory; no library-wide audit."},
  {"path":"kupua/src/lib/grid-config.ts","sha256":"228b010e13d07e71e63d8007c8ea509ed48cbf9d3fc42452799e1135a95db380","method":"line-ranges","ranges":[[128,267]],"note":"Current alias/ticker declarations and reactive Bedrock flag, not target configuration."},
  {"path":"kupua/src/lib/field-registry.tsx","sha256":"1f8a9c529477254c3a91a43ac03a18dcf29e675e74aa8e98265318734600fe41","method":"line-ranges","ranges":[[960,1035]],"note":"Module-time alias registry and derived maps; S1 accessor not reopened."},
  {"path":"media-api/app/lib/querysyntax/QuerySyntax.scala","sha256":"17bd6ea1f5f8052b923a3da6788eea3ee7f2397167bde94d8bdff8b4ad62bfa7","method":"line-ranges","ranges":[[1,190]],"note":"Actual accepted nested keys, condition construction and named-field resolution."},
  {"path":"media-api/app/lib/querysyntax/Parser.scala","sha256":"5ee61b322086852bbffb31d341f52e4449b486c03317c0e661bb35233db97b22","method":"full-text","ranges":[[1,34]],"note":"Default injection and complete normalizer, no parser execution."},
  {"path":"common-lib/src/main/scala/com/gu/mediaservice/lib/ImageFields.scala","sha256":"4d629da6f62257b5613211b0d633a9f9b5fc5d090ca3a99628ed9c41278b33f9","method":"full-text","ranges":[[1,72]],"note":"Static field namespace resolution for C2."},
  {"path":"common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/Mappings.scala","sha256":"46838d64c30c8fdc03ca2bb7b21fd5bbf705c312d7a5d9fe8106bc2f268ee933","method":"line-ranges","ranges":[[265,352]],"note":"Declared nested print-usage leaves, not a live mapping observation."},
  {"path":"media-api/app/lib/ImageResponse.scala","sha256":"a90a092a2283b3cee9267b7820da9908ada5a51f4f338a4a1bc95508db27d5c9","method":"line-ranges","ranges":[[50,120],[230,288]],"note":"Canonical creation/signing/aliases and transform-template reuse; other writer branches reuse prior reports."},
  {"path":"media-api/test/lib/elasticsearch/QueryBuilderTest.scala","sha256":"393d0f1939193580c3c709d00b67f3207b2df2b5d0acffe29b58ce39dac40de2","method":"line-ranges","ranges":[[1,205]],"note":"Actual query-builder setup and default/fuzzy/nested assertion meanings; no execution."},
  {"path":"kahuna/public/js/services/api/media-api.js","sha256":"694f4f981a46c5e6772403da636f43792bc569aca40565cf3f2ed2d03b59f9f0","method":"line-ranges","ranges":[[30,111]],"note":"Actual legacy GET, sort and singleton/discovery caller contract."},
  {"path":"cropper/app/controllers/CropperController.scala","sha256":"84d64046b0168f4e3edde4f55115b986cca0d3eac0150146920c7c6f6381a98d","method":"line-ranges","ranges":[[175,222]],"note":"Expanded file-metadata read and SourceImage decoding; no crop operation invoked."},
  {"path":"common-lib/src/main/scala/com/gu/mediaservice/lib/auth/ApiAccessor.scala","sha256":"53c8829943797c8a898af56f237f2cc89d71d5dbc4e6f3b0fbb7d410cda8f87e","method":"full-text","ranges":[[1,34]],"note":"Existing machine method/tier restrictions retained."},
  {"path":"common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/ElasticSearchExecutions.scala","sha256":"8c05282152492cdf3776f65d034a92f48ff614d0e433044f89bf9ce9fd2a701d","method":"full-text","ranges":[[1,63]],"note":"Transport-success wrapper is not per-operation completeness validation."},
  {"path":"image-embedder-lambda/src/embedder/constants.ts","sha256":"b8f9a8e152b3f1b1ce6efbc3dbe7db53f18642dc274f72c2b1f115d7a72da0d7","method":"full-text","ranges":[[1,12]],"note":"Actual 256-component ES prefix constant; no sizing experiment."},
  {"path":"image-embedder-lambda/src/embedder/imageEmbedder.ts","sha256":"1c140581e5d6ec30586ca90de37f51c83f6637c52732d63967cfdc6745a1f00b","method":"line-ranges","ranges":[[40,78]],"note":"Nominal V4 document/float/1536 invocation; no model call."},
  {"path":"common-lib/src/main/scala/com/gu/mediaservice/lib/aws/Bedrock.scala","sha256":"ebbb9a883158a9e6fb769334630a5f0dba04a0ff8e2c1222468f6f1a02b12a00","method":"line-ranges","ranges":[[35,70]],"note":"Nominal V4 query/float/256 invocation, not query-principal permission or quality."}
]
```

### Orientation Inputs

```json
[
  {"path":".github/copilot-instructions.md","sha256":"765de30857a0cc81cff1219d8fad37b4971ccab88c97d2b127f85326eee261c7","method":"full-text","ranges":[[1,154]],"note":"Attached directives; delegated confirmation/single-writer exception and scope limits."},
  {"path":".github/instructions/media-api.instructions.md","sha256":"0bcceb19a34ad34d957c5d3e3065ba7b5e061fa1d3c681d4939bab26be21635b","method":"full-text","ranges":[[1,152]],"note":"Applicable server instructions read; no implementation."},
  {"path":"kupua/AGENTS.md","sha256":"553013e65abdcfa36007e987f190637f20bd456944d8c16a4731f454038abeb0","method":"full-text","ranges":[[1,227]],"note":"Fresh orientation and routing; no handoff-named file referenced."},
  {"path":"kupua/exploration/docs/worklog-current.md","sha256":"d2936bd953073d90da5be1438d84fc227f8e525fb8fd08fb909ff8388f9e9f34","method":"full-text","ranges":[[1,69]],"note":"Coordinator-owned shared notes preserved; no check-in or reset."},
  {"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-05-review-protocol.md","sha256":"49782471745b944f197f96d41d0d85dac2069993bcaa67e227ea233b8d9ea3b5","method":"full-text","ranges":[[1,414]],"note":"Current P29 exception and retained comprehensive gates."},
  {"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-08-review-prompt.md","sha256":"f3df8a8bf61f49c646cf7ea9dfcff1bf74aacf289724e66757d895ef062c12b4","method":"full-text","ranges":[[1,268]],"note":"Explicit assignment, six-section report and stop requirements."}
]
```

## 4. Evidence and Bug-ID Dispositions

| Existing record | P29 disposition |
| --- | --- |
| KUP-011 / GRID-001; E047 / E092 | Retain concrete default findings and P28 refutations. Add C1's cross-operation activation dependency; a parser/helper name or correct new endpoint alone does not settle it. No query difference becomes operator-accepted. |
| GRID-008 | Narrow the unresolved classification: known supported code-valued mapped cases gate S2 admission/activation and dependent query reads; field vocabulary and engine witness execution remain unresolved. No automatic legacy repair. |
| KUP-024 / E013 | Source-qualified coordinate mismatch survives the inspected consumer. Gate migrated restore acceptance on retained-total placement; do not block an isolated server window/rank method or claim a reproduced loop. |
| KUP-025 / E014 | Under the candidate's effective-tuple promise, the restore join needs resolution. Keep changed-metadata/runtime limits and normal live drift. No universal snapshot or always-serial locate requirement. |
| KUP-026 | Keep the cache/remount question conditional. [Registration](../../../../src/components/CqlSearchInput.tsx#L85) closes over the first resolver, including its datasource and wrapper refs; the [installed class](../../../../node_modules/@guardian/cql/src/cqlInput/CqlInput.ts#L36) passes that resolver to each plugin. API-only first registration can satisfy zero ES without a hot-swap feature. S8 needs a mounted warm-cache/remount discriminator if it relies on those callbacks; do not mandate a registration redesign merely to add an aggregate route. |
| KUP-027 | Keep unresolved/parked, not a blanket S10 prerequisite. [Exit work](../../../../src/components/FullscreenPreview.tsx#L196) is delayed, but [its resolver](../../../../src/hooks/useScrollEffects.ts#L289) intentionally uses current focus and geometry. Characterize old exit versus a newer session only when that owner is changed or its guarantee claimed; missing a token alone does not prove wrong settlement. No new server capability follows. |
| KUP-010 / E017 | Retain the qualified composed-recovery gate and private-triage limit. Pure API construction/dispatch may satisfy zero browser ES without a separate general store repair. Adapter-local refusal tests are not the complete chain. No live bypass claim. |
| KUP-001/002/003/004/005/006/007/008 | Retain the named per-consumer gates. These do not become prerequisites to every new server action. Reuse existing owner-specific assertions and add only the discriminating interleavings when that integration is authorized. |
| KUP-009 / E033 | Retain the historical executed synthetic HTTP-200 incomplete-map exception exactly at its stated scope. Current source corroborates the missing execution check, not live incidence. Proposed new exact-operation policy still needs explicit approval. |
| KUP-012 through KUP-023; GRID-002 through GRID-007 | Remain independent/parked unless a selected slice actually changes the controlling owner or promises the disputed behavior. No broad repair, producer/backfill activation, script run or public security issue follows. D033 remains separate and nonblocking. |
| E050 / E098 | Retain non-equivalence and reuse qualifications. Nominal V4 producer/query compatibility, the 256-component publication prefix and existing CDK declarations do not establish model permission, vector coverage, quality or deployment. |
| E054 / S1 | Keep superseded within valid-response normalization scope. No new S1 finding; no regression evidence rerun or broadened to live API acceptance. |
| E056 / E091-E099 | Preserve config/delivery, dormant-field, identity, policy-clock and deployment qualifications. P29's selected originals do not reverify every producer/provider or all 26 query members. No alias label proves mapped type/cardinality or localeCompare parity. |

The selected existing performance records support retention, not a fresh baseline demand.
Audit entries 43/44 contain four-run P14 resident sequences of 10/15/10/20 committed steps;
intermediate decode counts differ, so this is not a claim every fast step decodes. P15b records
two decoded fullscreen commits. P14's [preparation](../../../../e2e-perf/perf.spec.ts#L1042)
captures expected IDs from the resident buffer, and its landing observation can include remaining
cadence time; it is not automatically blank-image duration. Direct P14c/P14d also record nonzero
CLS occurrence despite aggregate CLS zero.

Perceived entries 55/57 record JB5 visual settlement at 136/149 ms (p95 141/152), indexed total
2,928 and `client-only` measured routes. [JB5 resets traces after traversal](../../../../e2e-perf/perceived-long.spec.ts#L1014);
[its observer](../../../../e2e-perf/perceived-long.spec.ts#L352) checks native exit and stable visible
list geometry, not all preceding image identities/decodes. The
[handbook topology](../../../../e2e-perf/README.md#L167), different origins/source fingerprints and
uncontrolled campaign cache remain material limits. These are hybrid/local-media-api/TEST-tunnel
observations, not API-only deployment or shared-load certification. Historical signing/envelope
measurements justify source-free keys and bounded bulk questions, not linear capacity estimates
or resurrecting the reverted writer. No performance concession or new campaign is recommended.

## 5. Exact Coordinator Integration Requests

1. **Candidate 11 sections 1/3/6/8/11:** add C1's D3/new-read query-meaning activation dependency.
   State separately when a server capability may land inactive and when its client path may be
   enabled. Keep common admission as one bounded contract, with existing D3 changes separately
   approved and characterized. Do not rewrite shared GET or original reports; preserve section 7.
2. **Backlog GRID-008 and candidate S2/section 11:** move the known mapped code-valued cases to
   the S2 admitted-query resolution index, retaining the same ID and source-only limits. Keep
   broader section vocabulary unresolved. **KUP-024/KUP-025:** name the affected migrated restore
   acceptance gates from C3, without gating standalone window/rank work or scheduling direct-mode
   repairs. Keep KUP-026/KUP-027 conditional as section 4 states.
3. **Candidate S9:** record capability-in-discovery as a smaller alternative to the proposed
   standalone non-embedding health route, conditional on an approved meaning. Do not call either
   option live model readiness, implement it, or substitute an unverified Kahuna flag for the
   query service's capability.
4. **Evidence/registers:** after review, integrate P29's 38 assigned, 30 supplemental and six
   orientation receipts at these exact hashes/scopes. Add C1/C2/C3 as scoped qualifications to
   E047/E092, E013/E014 and the existing backlog links, not duplicate bug IDs or new observed
   failures. Preserve E017/E033/S1 history, exclusions, stale entries, P01-P28 and false readiness.
   Administrative and installed-dependency receipts do not promote application coverage. Do not
   infer whole-file independent verification from selected-line checks or accept P29 automatically.
5. **Dependency next actions:** D029 should explicitly own the D3/new-read admission join and
   mapped print fields; D027/D031 should name the retained-total/effective-tuple restore checks.
   D017/D030 keep independent-owner/publication and conditional resolver obligations. Preserve
   D023-D026's completed-source versus effective-deployment distinction and all existing statuses;
   no new packet, tooling extension or recursive corpus campaign is requested.

**Smallest sensible next task to authorize:** coordinator-only integration of these bounded
corrections, then a narrow common-admission/D3 compatibility brief with the composed Q2-Q4 and
mapped-print-field discriminators in existing test homes, before activating S2. That is not an
instruction to implement a new endpoint or run those tests now. If that contract decision is
blocked, S6a remains an independently reviewable reuse slice; it does not require PIT/bulk design
or a new Grid singleton endpoint. No competing migration sequence is proposed.

## 6. Checks, Limits and Remaining Blockers

Executed only file/search reads, standard filesystem/JSON/SHA-256 metadata projections,
read-only HEAD inspection, scoped document diagnostics and the existing administrative checker.
The checker command was `node kupua/exploration/experiments/api-boundary/api-boundary-review.mjs check`.
Its intake result was **zero errors, nine warnings, `readyForSynthesis:false`**: existing AGENTS/index
receipt staleness, four stale document inventory entries and E054's historical source hashes.
There are 1,560 required files, 506 read, 29 partial and 1,025 inventoried; 20 dependencies remain
open. These numbers are bookkeeping, not proof of comprehension. The check is non-enumerating;
the coordinator owns subsequent report inventory/integration.

Remaining gates are the selected query/landing contracts and their unexecuted discriminators;
endpoint-local outcomes and PIT admission/lifecycle; bulk/key resource acceptance; and the named
effective host/ingress/auth/transform/model/artifact/capacity answers. No broader source blocker
was established. Prior provider/build/script/gesture inspection is reused with its limits, not
independently recertified by this report. Assets, lockfiles, exhaustive history, deployed/private
configuration and unlisted original remainders remain outside this challenge's actual reading.

No product tests, tooling suites, experiments, builds, performance runs, app/browser/live requests,
credentials, operational imports, Git mutations, new tooling or delegation were performed.
Only this assigned report was written. Candidate, backlog, registers, shared worklog, routing,
changelog, S1 and other product files remain untouched by P29. Tool-managed output captures are
administrative output, not repository deliverables. Sensitive findings retain restrained
private-triage routing; no issue publication, contact or expanded reproduction was undertaken.

**Post-write integrity validation passed:** three receipt arrays, six report sections, exact
38-path assignment accounting, all 74 current receipt hashes, declared range bounds, 147 JSON
pointers and 77 resolving local links with line citations contained in the declared reading.
Receipted protected inputs remain byte-identical to their captured fingerprints. Scoped editor
diagnostics found no report errors. The unchanged register checker again returned zero errors,
the same nine warnings and `readyForSynthesis:false`; P29 remains `ready` pending coordinator
integration. The first metadata command failed before validation because the sandbox escaped a
JavaScript operator; the equivalent sandbox-safe rerun passed without a report or tooling repair.

These are administrative checks, not execution of the proposed discriminators, semantic proof,
comprehensive closure or implementation authorization. Stop at this coordinator handoff.