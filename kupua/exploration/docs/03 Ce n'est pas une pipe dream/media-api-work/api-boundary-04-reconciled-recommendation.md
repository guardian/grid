# API boundary 04: reconciled recommendation

18 September 2026. Review of
[api-boundary-02-code-first-findings.md](api-boundary-02-code-first-findings.md), which remains intact.
Research only. R1-R7 below distinguish source review, executed checks and reused measurements.

## 0. Verdict

**Amend then prove.** Candidate B's preserved-capability design survives: keep navigation and
bounded collectors in Kupua, with authorization and typed, bounded reads in media-api. No examined
counterexample requires abandoning that division or reducing a feature. **Performance is plausible
but unverified**, including whole-journey latency and shared-service cost.

Two narrow amendments are necessary. First, make trustworthy completion a tested property of the
keys boundary: the current map collector can publish incomplete ES results, despite W02's
"all-or-nothing" description. Second, limit the proposed keys-only proof's conclusions to paths
it actually exercises; it cannot establish high-cardinality keyword-seek performance.

Neither this verdict nor a successful first proof authorizes implementation or production rollout.
Candidate A remains the already-assessed fallback if B's admission/continuation work erases its
collector-reuse saving. A is not thereby performance-certified.

## 1. Material findings

### F1. HTTP success is not a complete position map

**Claim:** W02 and Section 3, Ordered keys: an all-or-nothing map; incomplete maps never publish.
**Counterexample:** a short HTTP-200 populated-phase response with `timed_out: true`, or one failed
shard, followed by an empty missing phase. Exact maps require complete enumeration of their
declared view, not a universal snapshot shared with every other operation.

**Observed:** R6 returned the same non-null one-entry map for both incomplete responses and the
complete control. The [collector](../../../../src/dal/es-adapter.ts#L2129) treats a short page as
completion; [publication](../../../../src/stores/search-store.ts#L1269) accepts any returned map.
The collector result was executed; publication was source-traced, not browser-observed.

**Classification:** existing defect, high confidence; occurrence on live ES is unmeasured. This
refutes W02's unconditional current-behavior characterization, not B's feasibility. **Minimum
consequence:** the new keys path must recognize incomplete ES execution and prevent map/range
completion from being reported. Test timeout and shard-failure responses explicitly. The
[completed D3 assessment](d3-search-after-01-readiness-findings.md#L50) already separates partial-result
policy from its finished amendments; do not turn this into a shared GET/D3 repair programme.

### F2. The proposed stress fixture does not exercise a keys-only API

**Claim:** Section 5 proposes a keys-only route, a 70,000-distinct-key fixture and paired seek
completion measurements. **Disproof case:** seek beyond the 50,000 represented buckets, with
no position map. Under the normal 65,000-result map ceiling, that larger corpus takes the
[composite fallback](../../../../src/stores/search-store.ts#L3370), not the map collector.

**Source result:** it needs bucket continuation, image windows and exact landed rank; the cached
path additionally uses a scoped upload-time estimate. Adding only document-key pages does not
move those reads behind the API. E02's complete 8,769-key vocabulary never reached this case.
The [eight-second limit](../../../../src/dal/es-adapter.ts#L1530) is checked between requests, not
an execution deadline.

**Classification:** proof-scope mismatch, high confidence, not an introduced regression or proof
that keyword sorts must disappear. **Minimum consequence:** narrow the first proof's claim to
map/range collection. Keyword performance remains a required, unverified acceptance item until
its actual typed bucket/profile/rank path is exercised. Do not count a larger fixture's mere
presence as coverage or add that entire implementation to the first experiment by default.

### F3. Ordinary continuation is still a real contract decision

**Claim:** Section 3, Views and continuation: principal-associated handles, refreshed identifiers,
parallel callers, bounded recovery and cleanup without durable sessions. **Disproof cases:** two
overlapping pages, a lost refreshed-handle response, expiry during map assembly, and reuse with
another principal or query scope.

Current [D3 accepts a raw PIT identifier](../../../../../media-api/app/lib/elasticsearch/ElasticSearchModel.scala#L136);
the [PIT branch](../../../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L817) uses its
target. R5 verifies existing client expiry/refusal behavior, not the proposed trusted handle.
Map-backed [neighbor reads run concurrently](../../../../src/stores/search-store.ts#L2980).

**Classification:** missing implementation evidence, high confidence on that limit. The report
already acknowledges it. **Minimum consequence:** include admission, overlap, response loss and
expiry in the local proof, preserving concurrency unless its latency cost is explicitly accepted.
No evidence here requires durable coordination, an immutable cross-operation session or migration
support. Any later D3 handle change is separately scoped work, not reopening its completed review.

### F4. Cheap keys do not establish cheap image journeys

**Claim:** Sections 0/3 and W19/W22/W23 retain performance and image-bearing behavior.
**Stress case:** a 65,000-entry map alongside a 5,000-image selection hydration, followed by
detail traversal. Current [hydration transport](../../../../src/dal/es-adapter.ts#L2198) dispatches
1,000-ID chunks concurrently; [image construction](../../../../../media-api/app/lib/ImageResponse.scala#L58)
still computes enrichment, signs URLs and builds envelopes.

**Evidence:** E02 measured one direct-mode seek promise, not rendered settlement or an API pair.
Historical [D3 measurements](d3-search-after-04-performance.md#L222) establish that image response
work matters, not today's batch throughput or deployed capacity. Compression is already recorded
as shipped; the reverted writer is not a prerequisite.

**Classification:** material missing evidence, not a demonstrated slowdown. **Minimum consequence:**
keep batch/enrichment/media parity and whole-journey performance as explicit acceptance gates.
Do not infer a safe batch limit, serialize existing parallel hydration, or revive the writer
rewrite from old per-200-image timings. The 5,000 range/cache bounds are not a global selection cap.

## 2. Claim dispositions

Supported means the stated mechanism or allocation survives review, not that its unimplemented
API has passed integration. First-report W/E identifiers retain their original meanings. R checks
are defined in Section 6; test links below are read-only unless R5 or R6 is named.

| Claim and first-report anchor | Most discriminating case | Disposition, deciding evidence and minimum consequence |
|---|---|---|
| C1. B can retain collectors without downloading full images. Section 3; W02/W20; E01/E03. | A 65k map and capped range, with missing primaries. | **Supported as a mechanism.** [10k source-free chunks](../../../../src/dal/es-adapter.ts#L2118) contrast with the [200-image cap](../../../../../media-api/app/lib/elasticsearch/ElasticSearchModel.scala#L409) and [per-hit enrichment](../../../../../media-api/app/controllers/MediaApi.scala#L899). [Phase/PIT assertions](../../../../src/dal/es-adapter.test.ts#L447) exist. R2; preserve typed phase/tuple semantics, not raw ES requests. |
| C2. Current maps are all-or-nothing. W02; Ordered keys; E01. | Successful HTTP response containing partial ES execution. | **Refuted for the current baseline.** R6 and [map publication](../../../../src/stores/search-store.ts#L1269); amend completion handling in the proposed boundary/proof, not the capability floor. |
| C3. All semantic sorts, null boundaries, End and exact rank can survive. W06/W07/W18; E03. | Ties, configured aliases, nested usages and multi-valued collection maxima in both directions. | **Supported algorithmically.** [Canonical clauses](../../../../src/dal/adapters/elasticsearch/sort-builders.ts#L93), [selected-max rank](../../../../src/dal/es-adapter.ts#L1282), [special-sort oracle](../../../../integration/special-sort-es.test.ts#L367). R2; API parity for configured mappings remains unrun. Do not substitute child histogram counts for ranks or restore secondary-sort controls. |
| C4. B preserves keyword deep-seek performance. W05; E02/E03; Section 5. | Target beyond represented buckets, cold cache, repeated continuation. | **Unverified.** [Five-page profile](../../../../src/dal/es-adapter.ts#L1627) and [fallback walk](../../../../src/dal/es-adapter.ts#L1504) remain real work. R2/R7; keys-only proof cannot settle it. Current approximation is not permission to lower useful navigation limits. |
| C5. New reads share admitted policy; legacy GET is not unconditional count reuse. W13-W16/W19; Section 3. | Compound deleted intent, absent query, ordinary versus privileged user, machine POST denial. | **Supported requirement.** [D3 policy](../../../../../media-api/app/controllers/MediaApi.scala#L879), [query filters](../../../../../media-api/app/lib/elasticsearch/QueryBuilder.scala#L158), [hits/totals assertions](../../../../../media-api/test/lib/elasticsearch/ElasticSearchTest.scala#L828), [method denials](../../../../../media-api/test/controllers/MediaApiTest.scala#L112). R3; apply before keys, counts, facets and ranks, not after image filtering. |
| C6. Trusted handles preserve ordinary lifecycle without durable storage. W01/W03/W12; Section 3. | Overlap, refreshed identifiers, lost response, expiry, cancellation and cleanup. | **Unverified for the proposed handle.** [Parallel page/PIT start](../../../../src/stores/search-store.ts#L2269), [client recovery](../../../../src/dal/strangler-adapter.ts#L68), [concurrent expiry tests](../../../../src/stores/search-store-pit.test.ts#L89). R5 passed for today's client; no new handle/replay fixture exists. |
| C7. All tiers and focus/density/traversal/history stay browser-owned. W01/W03/W04/W08-W12. | Shallow seek despite map availability; End; eviction; detail reload; density change. | **Supported allocation.** [Seek dispatch](../../../../src/stores/search-store.ts#L2914), [URL/focus policy](../../../../src/hooks/useUrlSearchSync.ts#L146), [traversal](../../../../src/hooks/useImageTraversal.ts#L174), [density restore](../../../../src/hooks/useScrollEffects.ts#L866). [End/Home](../../../../e2e/local/forced-seek.spec.ts#L24) and [reload](../../../../e2e/local/browser-history.spec.ts#L1120) assertions were read, not run. R4/R5; bounded shallow windows remain a real backend addition. |
| C8. Selection survives through bounded authorized batch reads and keys. W19/W20. | Out-of-buffer range at cap+1, missing/hidden IDs, failed batch, many concurrent chunks. | **Unverified end-to-end.** [Range collector](../../../../src/dal/es-adapter.ts#L2254), [commit guard](../../../../src/hooks/useRangeSelection.ts#L221), [hydrate](../../../../src/stores/selection-store.ts#L590), [batch/range tests](../../../../src/dal/selections-dal.test.ts#L109). R5 verifies existing transport/bounds; new visibility, completion and enrichment throughput need real API checks. |
| C9. Typed summaries retain distinct scopes and accepted approximations. W14-W18/W24. | Cold self-excluded typeahead, AI-scoped facets, default collection counts, repeated child dates. | **Supported allocation.** [Live typeahead scope](../../../../src/components/CqlSearchInput.tsx#L171), [isolated dynamic fields](../../../../src/lib/typeahead-fields.ts#L564), [parent usage counts](../../../../src/dal/es-adapter.ts#L775), [collection defaults/sums](../../../../src/stores/collection-store.ts#L97). R4; the cross-API scope/count fixture is still missing. Neither exact distinct collection unions nor a universal snapshot is assumed. |
| C10. Existing Grid AI cannot simply replace Kupua AI. W21; Section 3. | Weight zero or mixed weight with multiword text and active filters. | **Supported.** [Kupua AND/ES blending](../../../../src/dal/es-adapter.ts#L1135) differs from [Grid OR/fused ranking](../../../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L217); [store total/polling rules](../../../../src/stores/search-store.ts#L2155) and [health](../../../../src/lib/bedrock-proxy-client.ts#L31) also matter. R4; compatible eligibility/order/total/health fixtures remain required, not disabling AI. |
| C11. Projection/enrichment reuse plus media-link adaptation preserves rendered data. W11/W22-W24. | Standalone image, selected aliases, backward/target/AI commits, rotated zoomed media. | **Unverified across all owners.** [Projection](../../../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L846), [alias assertions](../../../../../media-api/test/lib/elasticsearch/ElasticSearchTest.scala#L1643), [probe nonpublication assertion](../../../../src/dal/grid-api-search-adapter.test.ts#L320), [current local media paths](../../../../src/lib/image-urls.ts#L53). R4; an API-only image/selection/AI commit and media-rendering journey is missing. |
| C12. B reduces justified Grid burden and can complete without browser ES. Sections 0/3/5/6; W17/W19/W21. | All runtime owners and failure paths, with shared resource accounting. | **Unverified as a completed system.** [Strangler delegation/fallback](../../../../src/dal/strangler-adapter.ts#L18), separate [selection](../../../../src/stores/selection-store.ts#L358)/[collection](../../../../src/stores/collection-store.ts#L116) owners, and [habitual API blocking](../../../../e2e/shared/helpers.ts#L28). R1/R4/R7; require real API-only journeys and separate maintainer/operator capacity approval. |

## 3. Reconciled direction

Retain B. Its saving is avoiding duplicate collector orchestration, not eliminating ES scans,
rank construction, policy or image preparation. Required backend capabilities remain image
windows including shallow offsets, ordered keys, exact rank, summaries, seek profiles, authorized
batch images, compatible AI, and ordinary read-context management. No new infrastructure is selected.

| Production impact | Disposition under B |
|---|---|
| Endpoint-local additions | Typed query shapes, admission, key/composite continuation, completion status and handle lifecycle are real new code, even when collectors stay in TypeScript. |
| Existing-caller behavior | B requires no incidental Kahuna, shared authorization or mapping changes. Later D3 contract changes need explicit scope and regression checks; the already-retained GET corrections are not new savings. |
| Shared resources | The same JVM, ES capacity and signing resources remain shared. Per-request caps do not establish safe aggregate concurrency or production isolation. |
| New infrastructure | None selected. Durable storage or a separate service would require a separately justified operator decision. |

The server must own admitted query/sort meaning, configured targets and work limits. Existing
machine-principal method restrictions remain. Caller-side bounds alone do not constrain a trusted
API. Keep any semantic validator/builder separate from Kahuna's legacy sort behavior. "Candidate B"
here is not the identically lettered D3 sort-ownership option; this review does not select a
replacement for the latter.

Kupua retains interpolation, accumulation, geometry, history and guarded publication. Preserve
public tuples, the dedicated map view, live range behavior and explicit companion scopes; do not
slice an older map as an unnoticed range-semantics change. Required reads must distinguish failure
from successful empty data. Only confirmed hidden/missing IDs justify hydration removal; optional
enrichment and satellites remain optional.
Keep D3's deliberate public `_shard_doc` truncation. Image-bearing reads retain aliases, complete
usage/collection arrays and authoritative overlays at commit points; key reads do not prepare images.

Coverage deltas: qualify W02's current completion claim; leave W05 performance pending; require
commit-owner coverage across W11/W19/W21/W22, not adapter-side overlay writes. Other rows remain
required. The [saved-versus-refreshed restore tuple weakness](../../../../src/stores/search-store.ts#L3876)
is an existing, separately scoped issue, not evidence for immutable sessions.

## 4. Hardest-first next action

**Commission one bounded local keys/completion proof**, after operator approval. Its question is
whether policy-checked key reads and ordinary handles preserve map/range correctness and actual
journey completion without extra enumeration, serialization of parallel work, or enough new
coordination to negate B's saving.

Use guarded loopback ES on 9220, a 65,000-result fixture with a small-result subset, and the existing
special-sort oracle's tied/missing/max-date cases plus configured aliases. Use the same source,
query, sort, page limits and fixture in both arms. The proposed temporary surface is the first
report's four media-api files, a narrowly injected client key transport, and an exact Vite read-route
allowlist entry if needed for browser journeys. Scala edits/build outputs outside Kupua require
explicit permission. The operator must arrange isolated services and free the documented app/E2E
ports before applicable runs; do not repurpose the running TEST app. Product edits require the
normal client/server regression gates, even when temporary.

Before substantial coding, maintainers should review the small contract: policy and sort admission,
principal/scope binding, purpose limits, completion status, expiry/lost-response behavior, and
affected D3 calls. That is the earliest useful review, not a production-enable request.

Acceptance: compare ordered IDs/tuples, exact ranks on the declared view, both map phases, range
cap/lookahead and abort nonpublication against the direct oracle. Inject timeout, shard failure,
refusal, expiry and overlapping/lost responses. Assert no image construction/signing for keys and
no larger ES scan/page budget than the control. Include opening/closing, retries, profiles and
duplicate exact counts in that accounting, not just browser HTTP requests.

Run three paired foreground journeys with cold/warm state recorded: first visible results,
map-ready, mapped seek in both directions, End, density/detail traversal, history restore and
out-of-buffer selection. Measure rendered settlement separately from fetch completion, payload,
background work and available CPU/memory evidence. Agree material-slowdown criteria before
interpreting timings; no numerical tolerance is invented here. Label any remaining direct-ES
companions explicitly: this first mixed-mode proof is **not API-only acceptance**, and does not
prove the 70k-key fallback or batch-enrichment capacity.

Stop on semantic mismatch, unexpected work, unaccepted slowdown, or a need for broader shared
behavior/infrastructure changes. If bounded repair cannot preserve the floor or erases the saving,
return to A for a decision. Eventual full local verification must run the entire W01-W24 matrix
against real authenticated API routes, deny all browser ES access, disable hybrid recovery and the
habitual API-blocking fixture, and exercise selection, collections, AI and failures. No mocks or
keys-only success can substitute for that gate. Remove only experiment-owned source changes and
guarded local fixtures after the proof; retain sanitized evidence.

## 5. Decision/document reconciliation

These are proposed amendments after approval, not changes made by this review. The first report
remains the historical proposal; this report owns its dispositions.

| Statement and authority | Current disposition | Existing owner to amend after a decision |
|---|---|---|
| W02's all-or-nothing baseline versus R6; D3 E3 is expressly deferred. | Existing completion defect; retain exact-map requirement. Decide endpoint-local incomplete-result handling without reopening the finished D3 batch. | [media-api-01-capability-inventory.md](media-api-01-capability-inventory.md), D1 status, with R6 evidence. |
| Section 5's keys-only surface versus its high-cardinality seek check. | A proof-design mismatch, not an operator-approved feature reduction. Separate what the first experiment proves from pending keyword acceptance. | This report, Section 4; then [media-api-02-next-endpoints-d7-d8-d9-workplan.md](media-api-02-next-endpoints-d7-d8-d9-workplan.md) only if B is commissioned. |
| Lower endpoint sketches prescribe snapshot dependencies, batch/enrichment details and preparation order. | Their current qualification banner controls. Live ranges do not acquire a universal-PIT requirement; batching needs measurement; publication stays with committing callers. D7-first preparation is not this research's hardest-first mandate. | [media-api-02-next-endpoints-d7-d8-d9-workplan.md](media-api-02-next-endpoints-d7-d8-d9-workplan.md), only the selected capability's contract. |
| Historical sort rationale promises parity "for free" and blanket unchanged shared behavior. | Current supported clauses and authoritative tuples are the baseline; future server admission needs fixtures. Retained GET rights/sort corrections already have explicit D3 dispositions. | [d3-search-after-03-sort-options.md](d3-search-after-03-sort-options.md), if admission/sort ownership changes; do not alter review status. |

**Separate product decision:** none adopted. Removing keyword/alias sorts, weakening selection,
lowering useful limits, dropping AI, changing ranking or accepting slower interaction would be
concessions requiring explicit approval, not implementation savings. No such concession is needed
to formulate the bounded proof above.

## 6. Evidence and limits

R1 verified HEAD `0e79a4dec637e3eaf05bb252c2ec7f95e8e68c8d`, exactly stage 01's source ref, with
no implementation diff in the reviewed paths. Available local main/origin-main remain
`5e3c36422`; the D3 PR branch remains `95a45f4ee`. Its main-to-PR media-api diff still spans ten
files, including shared query/sort code. No fetch, branch switch or other Git mutation occurred.

| Check | Actually checked; controls and limits |
|---|---|
| R1: refs/worktree | Read-only status, ref and scoped diff inspection. Pre-existing changes preserved; no different-tree A/B comparison. |
| R2: positional source | Map/range collectors, sort/null handling, rank and keyword dispatch traced. Map assertions and special-sort oracle read; oracle not executed. Stage 01 E03's 55 passed tests are reused evidence at the identical ref, not a new run. |
| R3: policy source/tests | D3 parser/controller, legacy GET, filters, machine method policy and GET/D3 authorization/date/projection assertions read. No Scala suite or live multi-principal experiment run; fixture image writer is mocked. |
| R4: workflow source/tests | Navigation/publication, standalone detail, summaries/typeahead, all three ES owners, AI and media paths traced; relevant history/End and enrichment assertions read, not rerun. No deployed bootstrap/media equivalence demonstrated. |
| R5: executed baseline | 74/74 tests passed across the three files in the first command below; Vitest 4.1.10, 14.32s. In-memory fetch/adapter mocks; no app topology or cache-performance claim. Includes expiry races, refusal preservation, range bounds and batching, not a server handle test. |
| R6: executed 04-E01 | [Synthetic fixture](../../../experiments/api-boundary/api-boundary-04-e01.ts) and [isolated config](../../../experiments/api-boundary/api-boundary-04-e01.mjs). Three cases, four mocked requests each: PIT open, populated phase, empty missing phase, close. Only timeout/shard flags differ from the complete control. All three return a non-null one-entry map; assertions intentionally characterize that defect. 3/3 passed, 375ms total, not a latency benchmark. No live corpus; cache warmth inapplicable. |
| R7: reused performance | Stage 01 E02: direct/non-local TEST, one pinned-query seek, complete 8,769-key vocabulary; store-promise timing, unknown ES warmth, background requests included. Dated D3 measurements retain their local/tunnel/topology qualifications; no current API-only, production-capacity or high-cardinality conclusion follows. |

Executed from repository root, foreground and unsandboxed:

```sh
set -o pipefail; npm --prefix kupua test -- src/dal/strangler-adapter.test.ts src/dal/selections-dal.test.ts src/stores/search-store-pit.test.ts 2>&1 | tee "$TMPDIR/kupua-test-output.txt"
set -o pipefail; npm --prefix kupua test -- --config exploration/experiments/api-boundary/api-boundary-04-e01.mjs 2>&1 | tee "$TMPDIR/kupua-test-output.txt"
```

The operator reported a running direct-mode app; this session did not inspect or reconfigure it.
No browser, TEST, CODE or PROD experiment, broad suite, formal performance campaign or service
instrumentation was run. B's missing implementation blocks its decisive integration measurement;
switching to today's hybrid mode would not remove that limit. Only this report and the small
synthetic reproducer/config are retained; the session worklog is reset on completion. No raw live
bodies, image identities, credentials or signed media URLs were captured. Source review and prior
bounded TEST observations do not establish production capacity or unknown-caller behavior.

**Operator recommendation:** approve the corrected local keys/completion proof, not the full
migration. Keep every workflow and performance requirement in the acceptance floor.