# Bug Backlog: Kupua and Grid

Documentation consolidated 20 September 2026; query status updated 23 October after merged [Grid PR #4957](https://github.com/guardian/grid/pull/4957) and local client alignment. P30 remains historical design evidence; P31's separately completed current-client restore repairs retain their existing scope.
Derived from P01-P33, [evidence 07][evidence] and [candidate 11][candidate]. Dated browser observations
below distinguish controlled live checks from source-only findings; later client fixes are explicitly scoped per ID. This is the
canonical bug index, not another migration plan or an assignment of work. P28 remains the technical
query evidence. This record grants no new implementation, fuzzy-search or stronger-failure-policy authority.
The [reproduction queue and evidence](bug-reproduction-evidence.md) accounts for the original 35 IDs,
including conditional browser cases and bugs better checked outside the browser. The ten P32/P33
integration additions were source-supported at intake; later execution, including KUP-030's
synthetic U6z characterization, is recorded per entry. GRID-014
(24 September, API build U2) has its server side confirmed by a local ES test. KUP-033 and KUP-034
(25 September, API build U5 review) have their server mechanism shown by local ES tests.
KUP-033 was reproduced by live media-api wheel scrolling and repaired in the shared store on
26 September; post-fix wheel checks passed in both modes. KUP-034 is also repaired;
synthetic direct-TEST reproduction and verification passed, but natural-workflow incidence is unproved.

## At a Glance

**Current recorded status: 11 November 2026.** The tables below list open defects,
approval/integration/review tasks or explicit residuals; completed bounded repairs and verification are listed separately.
A remaining task does not undo a completed sub-fix. Source-only findings still need their proposed
discriminating checks; they are not observed production incidents. PR status is as last documented,
not a fresh remote check. The 12 October update added GRID-017; the 19 October update adds
KUP-041's API cancellation/resource-lifetime gap. The 21 October update records KUP-042's
fixed-grid row-membership repair and reconciles the totals with the listed dispositions.
The 23 October update closes GRID-001/002/008/015 for merged Grid repairs; remaining
direct-to-ES parser divergence belongs to KUP-011 and does not reopen Grid work.
The 1 November update extends KUP-044's shared capability scope, records KUP-045/046
as source-verified shared-display findings awaiting review, and defers crop notices
and eligibility under KUP-047 until the reviewed common wiring is implemented.
The 2 November step-1 implementation repairs KUP-044's image-level URI/edits/crops
retention. Nested write resources and KUP-047's crop consumer remain deferred.
The 5 November validation investigation records KUP-048's reproduced table
render-time update warning and KUP-049's unresolved Settings-click timeout.
These are separate from the optional obsolete-read cancellation follow-up.
The 7 November update closes KUP-043 for the operator-accepted Step-4 simulated
contract after integrated validation and independent review. Live activation and
the real Delete workflow remain separately gated.
The 11 November update adds GRID-021's operator-observed local index loss during
local/TEST mode switching; the intended developer-data lifetime awaits engineer confirmation.
It also records KUP-051's missing Subjects editing workflow: the existing backend
supports Subjects overrides through metadata-editor, Dynamo and indexed metadata refresh.
Other dispositions have not been revalidated.
Update this overview when a detailed disposition changes.

**Migration relevance:** a prerequisite blocks its named slice's acceptance, not all migration work.
Related obligations matter to the selected integration but do not automatically mandate a standalone
repair. Independent work has no current migration gate; unresolved coupling needs a scoped decision.
The detailed entries below remain authoritative for evidence, permissions and limits.

### Open Kupua Work and Residuals

| ID | Topic | Current status | Migration relevance |
| --- | --- | --- | --- |
| [KUP-011](#kup-011) | Parsed intent versus automatic defaults | Defaults aligned locally in both modes; open direct-to-ES grammar divergence | Remaining cross-mode syntax scope |
| [KUP-041](#kup-041) | API cancellation does not reach outgoing Elasticsearch reads | Open; cancellation handle is not retained, backend work observed after browser cancellation | Independent resource-lifetime follow-up; not a proven PP3 cause or migration gate |
| [KUP-044](#kup-044) | Image-level capabilities and future nested write resources | Image URI/edits/crops retention repaired; nested controls deferred to their consumers | Shared facts available; no write activation |
| [KUP-045](#kup-045) | Lease summary has consumers but no current producer | Source-verified display gap; review and composed witness pending | Independent shared-display correction |
| [KUP-046](#kup-046) | Known validity reasons replace server wording with local copy | Source-verified; previously unselected B3, review pending | Independent display-copy correction |
| [KUP-047](#kup-047) | Crop notices and server eligibility are not wired | Deferred consumer; common image-capability wiring now available | Read-only crop follow-up, not a mock-cropping commit gate |
| [KUP-048](#kup-048) | Table column sizing writes store state during React update | Reproduced warning with current and committed scrolling modules; unfixed | Independent table-state defect; does not require the scrolling repair |
| [KUP-049](#kup-049) | Detail Settings click stalls during browser validation | One full-run timeout; click reached menu, cause unestablished | Full browser acceptance remains unresolved; relation to scrolling unproved |
| [KUP-050](#kup-050) | Existing label pills briefly show partial-membership colour after submission | Operator-observed local add-label flash; final labels/readback correct, cause unestablished | Independent presentation follow-up; not a Step-5 persistence blocker |
| [KUP-051](#kup-051) | Subjects editing is absent despite existing backend support | Source-verified UI/workflow gap; no live write trial | Independent editing follow-up; no backend schema extension identified |
| [KUP-052](#kup-052) | Incidental keys reveal unwanted focus rings on pointer-used controls | Operator-observed; UX policy/options pending, no implementation | Independent app-wide interaction polish; preserve keyboard focus visibility |

KUP-011 has no closure evidence from continuity work and remains separately scoped.

Usage Rights compatibility (30 October): Kupua now reads Grid's configured categories
from metadata-editor, with a refreshed local fallback for direct-ES/laptop modes. Its additive
`legacyCategories` field (live on TEST) gives exact `category:` typeahead counts and lets the
Filters panel fold replaced values into their category. The vendored cost configuration is now
a fallback only in media-api mode (search, detail and selections carry server cost); direct-ES
legacy-category expansion remains accepted lag.

### Optional Performance Follow-ups

#### Earlier Cancellation of Obsolete Window Reads

- **Candidate, recorded 4 November 2026:** cancel already-dispatched window reads
  earlier once their boundary becomes obsolete, rather than merely rejecting their
  eventual response. The [scroll integrity contract](00%20Architecture%20and%20philosophy/03-scroll-architecture.md)
  and [extension owners](../../src/stores/search-store.ts) remain authoritative.
- **Evidence limit:** controlled opposite-eviction cases establish obsolete
  responses, not production incidence, material decoding cost or measured savings.
  The current repair prevents invalid publication and restores useful demand;
  more aggressive cancellation is optional, not a remaining acceptance blocker.
- **Before implementation:** identify the exact retiring request and demonstrate
  avoidable work or useful-image delay in the relevant deployment topology. Compare
  useful-image arrival and recovery as well as request counts; preserve current
  viewport demand, separate request owners, cooldowns and valid concurrent growth.
  Do not weaken integrity or replay obsolete work to reduce request counts.
- **Boundary:** browser abort cannot undo completed work or prove that upstream ES
  stopped. [KUP-041](#kup-041) separately owns API-to-ES cancellation propagation.
  Any broader transport/backend or decoding optimization requires its own evidence
  and authorization; performance campaigns remain operator-run.

### Open Grid Work

| ID | Topic | Current status | Migration relevance |
| --- | --- | --- | --- |
| [GRID-003](#grid-003) | Unknown syndication-status decoding | Parked; source-only | Independent; unsafe decoding must not be inherited by a new slice |
| [GRID-004](#grid-004) | Failed SQS entries counted as sent | Parked; source-only | Independent producer reliability |
| [GRID-005](#grid-005) | Zero-width narrow-image resize | Parked; source-only | Independent image-processing robustness |
| [GRID-006](#grid-006) | Local imgops timestamp stripping | Parked; local configuration finding, unexecuted | Independent unless selected deployment reuses it |
| [GRID-007](#grid-007) | Cleanup reads only the first page | Parked; conditional source finding | Independent operational script |
| [GRID-009](#grid-009) | Detached syndication source/publication work | Open; source-only | Independent Grid reliability; useful future-editing contract |
| [GRID-010](#grid-010) | Reordered delete/undelete projection | Open; source-only | Independent Grid lifecycle; useful future-editing contract |
| [GRID-011](#grid-011) | Collection membership lost update | Open; source-only | Independent Grid concurrency; useful future-editing contract |
| [GRID-012](#grid-012) | Premature soft-delete acknowledgement | Open; source-only | Independent Grid handoff; useful future-editing contract |
| [GRID-013](#grid-013) | Unawaited Thrall syndication updates | Open; source-only | Independent Grid consumer reliability |
| [GRID-014](#grid-014) | `GET /images` ignores the rights-acquired filter | Open; legacy GET confirmed, U9-A explicit AI deliberately inherits it | Independent Grid fix; new POST endpoints already honor the filter |
| [GRID-016](#grid-016) | Search results use a weaker syndication visibility rule than single-image reads | Open; source-only (U9-A cold review); private triage | Independent Grid data-exposure fix; same deployment caveat as GRID-015 |
| [GRID-017](#grid-017) | Kahuna startup probes before the effective default scope settles | Open; recorded local browser evidence and source assessment | Independent frontend request efficiency; not a Kupua migration gate |
| [GRID-018](#grid-018) | Upload dropped by a dynamic `fileMetadata` mapping conflict | Open; PROD log evidence (30 October) | Independent Grid ingest reliability; images invisible in search |
| [GRID-019](#grid-019) | `Edits` DynamoDB table at a fixed 20 WCU, auto-scaling off | Open; operator-read PROD configuration | Independent capacity risk for any batch write (Kahuna, scripts, future Kupua) |
| [GRID-020](#grid-020) | Metadata override replacement can lose a concurrent edit | Open; source-level contract limitation | Accepted single-operator prototype risk; no new UI gate |
| [GRID-021](#grid-021) | Switching local Grid to TEST removes nonpersistent local ES data | Operator-observed; teardown/storage mechanism verified, intended behavior to confirm | Independent local-development issue; ask engineers, not a transport rollout gate |
| [GRID-022](#grid-022) | Repeated crop saves regenerate shared assets and append duplicate export identities | Operator-reported UI repeat; source and read-only record inspection confirmed | Independent crop refresh/idempotency decision; local UI filtering is not a backend repair |
| [GRID-023](#grid-023) | Distinguish unavailable saved crops from an empty crop list | Potential UX improvement; source-backed current behaviour | Preserve existing access policy; explanatory presentation not selected |

<details>
<summary>Completed bounded repairs and verification: 45 IDs</summary>

| Group | Completed IDs |
| --- | --- |
| Selection, detail, AI, facets, polling and maps | [KUP-001](#kup-001), [KUP-002](#kup-002), [KUP-003](#kup-003), [KUP-004](#kup-004), [KUP-005](#kup-005), [KUP-006](#kup-006), [KUP-007](#kup-007), [KUP-008](#kup-008), [KUP-009](#kup-009) |
| Scalar accounting, prefetch, fallback and query handling | [KUP-012](#kup-012), [KUP-020](#kup-020), [KUP-021](#kup-021), [KUP-022](#kup-022), [KUP-023](#kup-023) |
| Input, Home, indexed timer and pending traversal | [KUP-014](#kup-014), [KUP-015](#kup-015), [KUP-016](#kup-016), [KUP-019](#kup-019) |
| Saved density, original detail return and cross-preview centering | [KUP-017](#kup-017), [KUP-018](#kup-018), [KUP-027](#kup-027) |
| Restore coordinates and selected-tuple rank | [KUP-024](#kup-024), [KUP-025](#kup-025) |
| Backward null-boundary crossing | [KUP-033](#kup-033) |
| Near-top centred paging | [KUP-034](#kup-034) |
| Default-collapsed multi-image chip rendering; intentional large expansion remains costly | [KUP-035](#kup-035) |
| Explicitly incomplete API image pages | [KUP-036](#kup-036) |
| Non-AI API recovery and fixed-mode CQL initialization, closed by U6z verification | [KUP-010](#kup-010), [KUP-026](#kup-026) |
| Date recovery, measurement trust and latest keyboard-edge ownership | [KUP-013](#kup-013), [KUP-028](#kup-028), [KUP-031](#kup-031), [KUP-032](#kup-032) |
| Post-U6z ordinary effective-rights mismatch refuted | [KUP-029](#kup-029) |
| Same-ID AI overlay retention, closed by U9-B replacement | [KUP-030](#kup-030) |
| Search discovery versus density/keyboard browsing, covered by ledger B8/L37/B17 | [KUP-038](#kup-038) |
| Startup defaults resolved before search admission | [KUP-039](#kup-039) |
| Impossible upload-arrival intervals suppressed | [KUP-040](#kup-040) |
| Collection counts follow the current rights checkbox | [KUP-037](#kup-037) |
| Globally stable fixed-grid row membership | [KUP-042](#kup-042) |
| Accepted simulated readback, freshness and stable publication | [KUP-043](#kup-043) |
| Grid independent usage exclusions and print-field resolution | [GRID-001](#grid-001), [GRID-008](#grid-008) |
| Grid ordinary/AI deleted-search admission | [GRID-002](#grid-002), [GRID-015](#grid-015) |

DONE refers to the repaired or verified scope, not every adjacent behavior or future API acceptance.
In particular, no-saved density fallback and wider native-fullscreen timing remain uncertified,
not automatically known bugs. S1 normalization is complete and is not one of these bug IDs.

**KUP-029/030 (rights display versus server data): resolved, 27 September.** They were deferred
on 23 September until after a working API-backed app; that deferral is spent. KUP-029 (rights
label and no-rights badge disagreeing) was refuted: ordinary API images carry one consistent set
of rights. KUP-030 (AI results reusing an earlier search's server cost/validity for the same
image) was fixed by U9-B: AI results replace that data with their own. On 30 October selections
also gained server cost and validity; off-screen selected images previously used local rules.

**Operator amendment, 26 September:** U6z covered non-AI media-api reads, including recovery;
AI was then the deliberate ES exception, since converged by U9. KUP-033/034/036 are DONE as
separate repairs; KUP-010/026 are closed at their demonstrated scope, not as absolute API-only
completion.

KUP-038 is closed against the ledger's completed B8/L37/B17 repairs, not a new fix.
KUP-042 is repaired locally with globally stable fixed-grid rows; Justified packing,
thumbnail arrival and B2 prediction remain separate work.
KUP-037 is DONE (30 October, counts follow the checkbox).
KUP-035 is DONE for default-collapsed chip rendering; intentional large expansion remains
an accepted cost, not an open repair requirement.

### Completed Kupua Details

<a id="dependency-unresolved"></a>

#### KUP-001
**Hydration can overwrite a newer selection**
- **Component / responsibility:** selection-store hydration and metadata publication; human owner-to-confirm.
- **Trigger:** hydration captures a selected set; clear/navigation or another selection changes it before a successful response omits one captured ID.
- **Expected / actual:** omission repair should affect the current owned selection only. Before the fix, `hydrate` reconstructed captured membership after newer intent. It now requires the same selected Set and anchor before omission/anchor/toast publication; late metadata still enters the mutable cache and can reconcile current selection. `generationCounter` is not an ownership token.
- **Evidence / reproduction:** [hydrate](../../src/stores/selection-store.ts#L591), [P21 F2][p21]. **20 September historical synthetic mounted-selection reproduction; hydration reads mocked:** successful omission restored cleared membership and a selected checkbox; complete-success and failed-read controls preserved clear. The later [deferred regressions](../../src/stores/selection-store.test.ts) cover clear, newer selection/anchor, overlap, retained cursor/toast ownership and late cache reuse. [Executed validation and limits](bug-reproduction-evidence.md#kup-001). No new live/browser race reproduction or natural-incidence claim.
- **Smallest test:** gate a mocked hydration response; clear or select another set, then release a legitimate partial success and assert current membership/anchor stay owned by the newer action. Separately distinguish failed/item-error/aborted chunks from confirmed omission.
- **Dependency / resolution:** before **S6b activation**, because visible bulk results otherwise cannot safely authorize membership repair. Define logical success and selection-session ownership; a nullable transport alone is insufficient.
- **Disposition: DONE for the bounded current-client ownership fix.** Implemented/tested, independently cold-reviewed and operator-accepted after a brief app check on 20 September; committed as `ff932f3020d3cf08de1a70d5da0851aa9ae3ac36`. S6b is not complete: item-error/partial logical reads, future API omission/failure semantics and migrated-owner acceptance remain unresolved. Metadata freshness between overlapping reads is not a new guarantee.

#### KUP-002
**Range completion outlives selection context and can finalize another request**
- **Distinct repair:** [ledger B3/L22](zz%20Archive/not-yet-another-audit-ledger.md#b3) closes long-press self-cancellation within local/live API limits, retaining this external-supersession contract rather than reopening it.
- **Component / responsibility:** useRangeSelection, route selection owner and busy-state publication; human owner-to-confirm.
- **Trigger:** clear/search/sort or a newer range occurs while a server range is pending; an old success or rejection arrives afterwards.
- **Expected / actual:** membership and busy finalization must belong to the current range/context. The former range-only generation missed clear/search/unmount and stale catch/fast-path finalization. Request-local cancellation now covers membership/anchor intent, query/order, supersession and unmount, without clearing surviving selection; only the current request publishes success/failure/timing.
- **Evidence / reproduction:** [range owner](../../src/hooks/useRangeSelection.ts), [P21 F3][p21]. **20 September historical synthetic mounted range-owner reproduction; range reads mocked:** clear did not abort the pending signal; valid success restored IDs and visible selected checkboxes. Ordinary completion passed. Later [actual mounted-hook regressions](../../src/hooks/useRangeSelection.test.ts) cover add/remove cancellation, scope changes, successor success/rejection, fast-path takeover, failures, reverse-retry cancellation and unmount. [Executed validation and limits](bug-reproduction-evidence.md#kup-002). Natural pending-walk UI timing and reverse-retry rejection after a successor are not separately executed variants.
- **Smallest test:** defer one add/remove walk, change selection context, then resolve/reject it; also start a second walk and release the first rejection. Assert membership and busy state separately.
- **Dependency / resolution:** before **S3b range integration** claims guarded publication. Bind result and finalization to the selected context while preserving legitimate same-search density/detail transitions; do not require a snapshot.
- **Disposition: DONE for the bounded current-client ownership fix.** Implemented/tested, independently cold-reviewed and operator-accepted after a brief app check on 20 September; committed as `ff932f3020d3cf08de1a70d5da0851aa9ae3ac36`. Operator approved cancelling pending ranges on actual membership/anchor changes, not no-op actions or metadata-only notifications. KUP-003's later bounded retry repair is also DONE as recorded below; S3b API integration and future failure presentation remain open, and current-owner failure toasts are unchanged.

#### KUP-003
**Unknown-direction range retry disagrees with producer overshoot**
- **Component / responsibility:** useRangeSelection retry contract and ES/key-page range collector; human owner-to-confirm.
- **Trigger:** neither endpoint has a known relative position, the first guessed direction is reversed, and a hit is observed beyond the requested end.
- **Expected / actual:** an empty unknown-order walk now permits one swapped attempt even when overshoot examined a hit. Previously `walked === 0` suppressed that attempt and lost an interior image. Progress stays truthful; the collector/result shape and full tuple comparator are unchanged.
- **Evidence / reproduction:** [mounted real-collector tests](../../src/hooks/useRangeSelection.test.ts), [collector](../../src/dal/es-adapter.ts), [P21 F3][p21]. The historical browser fixture established only the retry mismatch; later failing-first mounted-hook/transport fixtures prove omitted interior add and retained interior remove, with correct-direction and empty controls. [Current validation and preserved history](bug-reproduction-evidence.md#kup-003).
- **Smallest test:** real reversed-endpoint walk overshoots with `{ids: [], walked: 1}`, then the swapped walk includes an interior image; assert final add/remove membership, endpoints, anchor and exactly two page reads.
- **Dependency / resolution:** current-client retry contract resolved; **S3b** must preserve it through the migrated collector. No unbounded server range job or universal snapshot follows.
- **Disposition: DONE (20 September)** for the bounded current-client retry. [Shared gates and independent review](bug-reproduction-evidence.md#bounded-client-repairs-kup-003006009) cover tied/null tuples, reverse cancellation and successor ownership. No extra successful-range reads, retry loop, backend change, live incidence or measured performance claim.
- **Commit:** `4ae4f337bc4b63392fe97fcd2fd441969a4b8bbb` (KUP-003 only).

#### KUP-004
**Standalone detail can retain image A under a pending or absent image B**
- **Component / responsibility:** ImageDetail singleton state and eventual image/overlay commit; human owner-to-confirm.
- **Trigger:** standalone A has loaded; the same component requests a nonresident B; B is pending, missing or fails.
- **Expected / actual:** displayed standalone data must match the requested ID. Before repair, cancellation rejected old callbacks but retained stored A under B. Data, absence and delayed loading are now identity-bound before the transition render; resident results still win and the detail shell remains mounted.
- **Evidence / reproduction:** [standalone state](../../src/components/ImageDetail.tsx#L238), [P20 F3][p20], [P25 F4][p25]. **20 September controlled SPA-router reproduction in Kupua UI, direct Elasticsearch, TEST cluster:** A loaded outside a zero-result search; navigation to absent B returned a real missing result, but decoded A and A's image ID/metadata remained visible under B's URL. No response injection or data mutation; natural-click incidence was not established.
- **Smallest test:** load A, switch to B, defer then fail/omit B; assert A is not rendered or enriched as B and return remains usable.
- **Dependency / resolution:** before **S6a** claims a correct singleton GET integration. Key/reset publication by requested identity and retain quiet absence; transport failure does not prove B nonexistent or change selection membership.
- **Disposition: DONE (20 September)** for current-client singleton identity. [Eight mounted regressions and shared gates](bug-reproduction-evidence.md#bounded-client-repairs-kup-004005007008) cover transitions, null/undefined/rejected absence, successful B, obsolete/rapid changes, resident precedence and stable containers/Back. Native fullscreen and future normalized GET/overlay composition are not newly certified; KUP-021 remains separate.
- **Commit:** `e613e3f34f7a93eeb55317434f63e03510647c51` (KUP-004 only).

#### KUP-005
**Empty AI membership becomes no ID restriction**
- **Component / responsibility:** AI query decoration and count/facet callers; human owner-to-confirm.
- **Trigger:** an AI search returns zero loaded images and dependent counts/aggregates are requested.
- **Expected / actual:** loaded-result-scoped data must describe an empty set. Before repair, decoration produced `ids: ""` and truthy filtering omitted the restriction. Explicit known-empty membership now publishes empty counts/facets locally and invalidates pending forced aggregation work; nonempty keys and exploratory suggestions retain their scope.
- **Evidence / reproduction:** [decorator](../../src/lib/ai-search-params.ts#L16), [ID filter](../../src/dal/es-adapter.ts#L493), [P22 F2][p22], [P28 Q16][p28]. **20 September mixed synthetic/live reproduction:** Kupua's synthetic empty AI result triggered a real direct-ES/TEST count of 13,257 and nonzero ticker rendering; one-image control counted one. [Evidence](bug-reproduction-evidence.md#kup-005). No naturally empty model result or specific zero-state label was verified; current hybrid counts remain ES-owned.
- **Smallest test:** empty, nonempty and absent membership through the real decorating count/facet caller with mocked transport; assert effective scope, not just the empty string.
- **Dependency / resolution:** before **S8 AI-scoped aggregates or S9 activation**, not ordinary-only count work. Distinguish empty membership from omitted restriction, possibly without making a request for known-empty work.
- **Disposition: DONE (20 September)** for current-client empty AI membership. [Twelve composed caller/transport regressions](bug-reproduction-evidence.md#bounded-client-repairs-kup-004005007008) cover counts, ordinary/dynamic/expanded facets, membership transitions, stale data and forced-refresh completion. No global empty-ID reinterpretation, ranking change or exploratory-scope restriction. S8/S9 API composition remains open.
- **Commit:** `8980056c684f7461f76c882e875e1ce5ed2879e1` (KUP-005, including forced-refresh invalidation).

#### KUP-006
**Polling repeatedly adds a cumulative category count**
- **Component / responsibility:** new-images polling and ticker/subcount publication; human owner-to-confirm.
- **Trigger:** two polls cover the same unchanged arrivals since the fixed browse boundary; same-generation requests can also overlap.
- **Expected / actual:** category/subcounts now equal the captured browse baseline plus the latest accepted cumulative arrival contribution. Repeating a response is idempotent; changed/decreased/zero contributions replace earlier ones. A local accepted-response sequence rejects older completions; the existing poll lifetime rejects responses from replaced baselines.
- **Evidence / reproduction:** [poll](../../src/stores/search-store.ts), [deferred/fake-timer tests](../../src/stores/search-store.test.ts), [P22 F6][p22]. Historical synthetic browser publication showed 105 -> 107 -> 109 for identical contributions. Later local regressions cover response order, failure, baseline replacement, late baseline, omitted buckets, unavailable versus zero and scheduling. [Evidence](bug-reproduction-evidence.md#kup-006).
- **Smallest test:** repeat an identical cumulative contribution, then decrease/zero it and release overlapping responses out of order; assert exact category/subcounts and unchanged browse boundary/membership.
- **Dependency / resolution:** the operator-authorized current accounting contract is implemented; **S7** still needs migrated producer/consumer acceptance. Frozen `newCountSince`, scheduling, AI no-poll and request counts are unchanged.
- **Disposition: DONE (20 September)** for bounded current-client accounting. [Shared gates and independent review](bug-reproduction-evidence.md#bounded-client-repairs-kup-003006009). Unavailable baseline remains `null`; no metadata immutability, historical snapshot, natural arrival-rate or performance guarantee.
- **Commit:** `d99ef3edcaae19c69f54385b960dfe0b6058603a` (KUP-006 only).

#### KUP-007
**Expanded facet results and finalization are not scope-owned**
- **Component / responsibility:** expanded aggregation requests/cache/loading state; human owner-to-confirm.
- **Trigger:** search/base-fetch reset or collapse occurs before an expanded response; alternatively an old rejection or response missing the requested field arrives.
- **Expected / actual:** only the active field/scope request may publish/finalize. Before repair, old results could repopulate cache, old catches affected new loading and an omitted field left loading set. Request-local identity now guards all outcomes; collapse/search/base reset invalidate ownership while retaining single-request concurrency and ordinary-facet presentation.
- **Evidence / reproduction:** [expanded fetch](../../src/stores/search-store.ts), [P22 F3][p22]. **20 September historical controlled real-read cache-publication reproduction, Kupua/direct-ES/TEST:** an un-aborted gated response repopulated the collapsed cache; ordinary completion passed. [Evidence](bug-reproduction-evidence.md#kup-007). That browser check did not establish expanded UI, reset/abort, missing-field or successor-finalization consequences; later deferred store regressions cover the latter ownership cases.
- **Smallest test:** gate an abort-ignoring expanded result across reset/collapse and a successor request; cover missing-field success and late rejection, checking data and loading separately.
- **Dependency / resolution:** before **S8 expanded-facet activation** can claim current-scope API publication. Resolve result/finalization ownership and absent-field outcome, not a new generic cache framework.
- **Disposition: DONE (20 September)** for current-client expanded-facet ownership. [Twelve deferred regressions](bug-reproduction-evidence.md#bounded-client-repairs-kup-004005007008) cover abort-ignoring success/failure, collapse/reset, same/cross-field successors, omitted fields and cache reuse. Ordinary-facet presentation is unchanged; S8 API composition remains separate.
- **Commit:** `2d5a58147317e4978bcfafef25c1353fbe58aefb` (KUP-007 only).

#### KUP-008
**A pending AI result can restore an older sort and params**
- **Component / responsibility:** URL AI sort transition, in-memory reorder and AI search completion; human owner-to-confirm.
- **Trigger:** Relevance/Uploaded changes while an AI search is pending, including history navigation between those sorts.
- **Expected / actual:** the completed buffer must honor current URL intent. Before repair, pending completion could restore captured sort/params after a no-request sort-only change. It now adopts the current supported sort only for the same query scope, retains other captured parameters/relevance, and completes the existing lifecycle without a second search.
- **Evidence / reproduction:** [sort transition](../../src/hooks/useUrlSearchSync.ts#L376), [AI completion](../../src/stores/search-store.ts), [P22 F5][p22]. **20 September historical synthetic Kupua browser reproduction:** a pending AI result restored old store params/order while URL and visible sort control retained Uploaded; settled reorder passed without another AI call. [Evidence](bug-reproduction-evidence.md#kup-008). That check did not independently verify rendered order; later local router/browser regressions do, without establishing natural incidence.
- **Smallest test:** gate AI completion, change sort without a new query, then release; assert URL/store order and params agree while preserving zero-request settled reordering.
- **Dependency / resolution:** before **S9 publication** claims current bounded AI behavior through the new transport. Resolve the existing owner interaction, not the ranking algorithm.
- **Disposition: DONE (20 September)** for current-client pending AI sort. [Four store and four local browser cases](bug-reproduction-evidence.md#bounded-client-repairs-kup-004005007008) cover repeated sorts/history, rendered order, positions, completion, superseding queries, focus/selection and settled zero-request reordering. No extra AI request or ranking redesign; S9 producer/API acceptance remains open.
- **Commit:** `e3722e5b8b74d6b9e690627ca6c53ba1fd4367d7` (KUP-008 only).

#### KUP-009
**HTTP-200 incomplete execution can be accepted as a position map (E033)**
- **Component / responsibility:** Kupua position-map collector/publication; eventual Grid key-page contract is a participating component, not a duplicate bug. Human owner-to-confirm.
- **Trigger:** any map page, including full-sized or empty terminal pages in either phase, explicitly reports timeout or failed shards.
- **Expected / actual:** the collector now discards the whole accumulated map before accepting hits or normal exhaustion when `timed_out === true` or `_shards.failed > 0`. It returns existing `null` absence and closes the latest refreshed PIT, including on abort. Omitted execution metadata is not newly rejected.
- **Evidence / reproduction:** [collector and transport tests](../../src/dal/es-adapter.test.ts), [store fallback tests](../../src/stores/search-store-position-map.test.ts), [report 04 F1/R6][r04], [historical fixture](../experiments/api-boundary/api-boundary-04-e01.ts#L15), E033. Historical synthetic browser publication is preserved; later local fixtures prove whole-map discard and actual deep no-map seek at 15,000/30,000. [Evidence](bug-reproduction-evidence.md#kup-009). No live failure was induced or incidence inferred.
- **Smallest test:** incomplete first/later/terminal pages in both phases, short/empty/full-sized, must stop reads, close the latest PIT and never publish a map; then exercise the existing deep fallback with unchanged indexed total.
- **Dependency / resolution:** current collector correction complete; **S4** still requires endpoint-local execution/lifecycle policy and migrated acceptance. Grid's shared execution policy and future API schema are unchanged.
- **Disposition: DONE (20 September)** for explicit-incompleteness handling. [Shared gates and independent review](bug-reproduction-evidence.md#bounded-client-repairs-kup-003006009). E033 needs the bounded coordinator qualification in that evidence, not unconditional snapshot/whole-file verification. No automatic retry or fallback redesign; fallback cost/parity is unmeasured.
- **Commit:** `0efb6e225ea62a5bc33c7fdf9cd92726ccda7196` (KUP-009 only).

#### KUP-010
**Restore recovery can bypass the intended refusal boundary (E017)**
- **Historical finding:** a refusal in the former transitional hybrid adapter could reach another store operation whose dispatch chose ES. P18 F3 / E017 was qualified source inference, not observed unauthorized access, a deployed incident or an exploit demonstration. The earlier [permission boundary](bug-reproduction-evidence.md#permission-blocked-routes) remains historical; expanded security investigation still requires private maintainer triage.
- **Why closed now:** U5 removed the ordinary page fallback and U6a-d migrated the remaining non-AI methods. The current `ApiDataSource` has no non-AI ES rescue. Legitimate recovery through another admitted API read remains supported; no new refusal policy or store repair is needed.
- **Executed evidence (U6z, 26 September):** [real store/adapter/mapper tests](../../src/stores/search-store-api-mode.test.ts) cover refusal, unavailable transport and 503 incomplete execution during search, seek and restore rank/target/forward/backward reads, successful and failed follow-up API windows, empty-target success and superseding searches. They assert final buffers, coordinates, errors, publication ownership and zero non-AI delegation. Deliberate wrong results fail the checks and are removed. Unit/build/direct-ES E2E gates, bounded ordinary API browsing and operator-reported API dry-run preflights passed; [the build plan](03%20Ce%20n'est%20pas%20une%20pipe%20dream/api-build/api-build-00-plan.md) records the evidence and limits.
- **Disposition: CLOSED by verification (26 September).** The boundary is the current application's non-AI media-api-mode recovery, not absolute API-only operation: `searchByAi` remains the sole deliberate ES delegation. No runtime datasource switching, historical security-triage closure, live refusal probing or new authorization guarantee is claimed. U6z changes tests only; existing recovery behavior is preserved.

#### KUP-012
**Incremental scalar reconciliation disagrees with full recomputation**
- **Component / responsibility:** selection reconciliation; human owner-to-confirm.
- **Trigger:** a cached nonzero all-empty cohort receives one image with a scalar value.
- **Expected / actual:** incremental and full reconciliation should describe the same cohort. Before repair, incremental add produced all-same with count one while full recompute produced mixed including empty members; cached adds did not require a correcting full recompute.
- **Evidence / reproduction:** [incremental add](../../src/lib/reconcile.ts#L231), [P21 F4][p21]. **20 September synthetic helper and mounted cached-panel reproduction in Kupua:** incremental all-same/count 1 persisted with three selected IDs and a rendered value; full recomputation returned mixed with two empty members. [Evidence](bug-reproduction-evidence.md#kup-012). No backend for the fixture; the existing zero-count test does not cover it.
- **Regression coverage:** independent full-recompute oracle, zero/all-empty/all-same/mixed and add-order controls, empty versus false/zero/arrays, removal and unchanged pending/dirty/chip/summary paths; cached add/toggle and real panel publication without later hydration.
- **Disposition: DONE (22 September), committed as `2d2a1d369`** within incremental scalar accounting. [Batch validation and limits](bug-reproduction-evidence.md#bounded-client-repairs-kup-022023026012020021). The responsible algorithm is not bulk transport; no full-selection scan, cache ownership change or API reconciliation guarantee is introduced.

#### KUP-013
**Windowed End can mutate deliberately retained hidden focus**
- **Component / responsibility:** list keyboard owner and post-seek focus consumer; human owner-to-confirm.
- **Trigger:** stored focus exists but selection/phantom mode suppresses effective focus, and End needs a seek rather than resident scrolling.
- **Expected / actual:** retain hidden explicit focus and required tail scrolling. Before repair, resident End used effective focus but the pending consumer tested stored focus only. Phantom position still follows the new viewport; it is not an old position to preserve.
- **Evidence / reproduction:** [End owner](../../src/hooks/useListNavigation.ts), [consumer](../../src/hooks/useScrollEffects.ts), [P19 F4][p19], [P21 F5][p21]. The historical 20 September direct-ES/TEST witness is retained. A fresh 22 September trusted-key comparison in the shared non-local direct-ES app again retained focus for 820 resident results but replaced it at the indexed 13252-result tail. [Evidence](bug-reproduction-evidence.md#kup-013).
- **Regression coverage:** actual mounted producer/store/consumer across resident, indexed and seek-tier coordinates; explicit, retained-hidden, phantom and no focus; pending mode/focus changes, newer seek/Home, failure/abort cleanup, native-input/fullscreen exclusions and actual grid/table End-selection-Clear placement.
- **Disposition: DONE (22 September), committed as `4bb055c66`**, for initiating focus permission and pending-End ownership. [Validation and limits](bug-reproduction-evidence.md#bounded-focus-repairs-kup-013017018027). No focus clearing on selection entry or new data read is introduced; this is not a symmetric Home/End closure.
- **Follow-up disposition: DONE (27 September).** The 22 September controlled browser reproduction remains the original witness. Windowed Home now records edge ownership independently from focus permission; resident End aborts and clears older edge/loading ownership before applying the already-resident tail. Mounted producer/store/consumer coverage first reproduced the explicit-focus signal and stuck-loading failures, then six selection/phantom/no-focus failures across indexed and seek coordinates. The settled 33-case slice retains hidden-focus policy, both supersession directions, failure/abort cleanup, input/fullscreen exclusions and zero successor reads. Three fresh reviews found and drove the loading and non-explicit repairs before a clean final review. [Current evidence](bug-reproduction-evidence.md#kup-013-reverse-edge-follow-up-repair). No generic navigation epoch, extra request or live after-check follows.

#### KUP-014
**Deferred query actions can replace a newer history intent**
- **Component / responsibility:** SearchBar CQL/AI debounce, delayed table-header sort and URL update helper; human owner-to-confirm. One action-ownership finding with distinct producer cases, not a new framework requirement.
- **Trigger:** Back/Home or another navigation completes while an originating editor/header timer is pending.
- **Expected / actual:** superseded query intent must not alter a destination entry. Before repair, timers invoked the current update function/key without originating-entry ownership; child remount and table unmount cleanup did not cover all producer lifetimes.
- **Evidence / reproduction:** [SearchBar](../../src/components/SearchBar.tsx#L78), [table callback](../../src/components/ImageTable.tsx#L1146), [P18 F4][p18], [P19 F4][p19], [P22 F5][p22]. **20 September Kupua browser reproductions:** CQL/AI typing after Back and delayed header sort changed newer URL/store/rendered intent. CQL/header used direct-ES/TEST; AI reads were synthetic. [Evidence and control limits](bug-reproduction-evidence.md#kup-014). Header has an ordinary control; CQL/AI have no separate settled-typing controls.
- **Regression coverage:** actual mounted CQL, AI and header producers cover Back/Home/newer navigation, departure/return, unmount, late callbacks with successors, ordinary edits, Clear and double-click; existing shared typing-entry and KUP-008 assertions remain.
- **Disposition: DONE (22 September), committed as `abfd06c45`** within the current client. [Validation and limits](bug-reproduction-evidence.md#bounded-ux-repairs-kup-014015016019) include live after-checks for all three producers, synthetic AI completion, full local gates and independent review. No global navigation framework, extra requests or delay changes; migration acceptance and measured performance remain separate.

#### KUP-015
**Home's post-await navigation can supersede a newer action**
- **Distinct follow-up:** [ledger B11/L13](zz%20Archive/not-yet-another-audit-ledger.md#b11) concerns the thumb remaining at top after cancelled Home, not obsolete Home navigation winning.
- **Component / responsibility:** reset-to-home orchestration; human owner-to-confirm.
- **Trigger:** Home awaits a search; a newer navigation supersedes it and the old search resolves normally.
- **Expected / actual:** an obsolete Home action must not navigate after newer intent. Before repair, post-await navigation was unconditional; search result guards did not own that later action.
- **Evidence / reproduction:** [Home sequence](../../src/lib/reset-to-home.ts#L131), [P18 F4][p18]. **20 September controlled real-data reproduction, Kupua/direct-ES/TEST:** a newer query aborted the held Home read; releasing its AbortError still let old Home navigate and erase the newer rendered query. Ordinary Home passed. [Evidence](bug-reproduction-evidence.md#kup-015). No late successful response was forced after abort.
- **Regression coverage:** deferred resolve/abort/reject, overlapping Home, both logo callers, initial and post-await focus, scoped suppression cleanup, current failure and awaited density-switch controls.
- **Disposition: DONE (22 September), committed as `9b7e5b8a9`** within the Home lifetime and immediate callers. [Validation and limits](bug-reproduction-evidence.md#bounded-ux-repairs-kup-014015016019) retain one search, defaults, mobile no-keyboard behavior and the anti-flash await. Live cancelled-read and ordinary Home controls passed; no wider request/history redesign or measured performance claim.

#### KUP-016
**An old indexed-scroll timer can issue a seek in a new context**
- **Component / responsibility:** useDataWindow module timer and range/reset callers; human owner-to-confirm.
- **Trigger:** a distant indexed range schedules a seek; search/Home or a tier change occurs without a later indexed range cancelling that timer.
- **Expected / actual:** old coordinate intent must not target new membership. Before repair, the timer retained an old offset but invoked the current seek reference; normal-mode reporting and reset paths did not cancel it.
- **Evidence / reproduction:** [timer](../../src/hooks/useDataWindow.ts#L413), [P19 F3][p19]. **20 September controlled real-data reproduction, Kupua/direct-ES/TEST:** a cancellation-preserving timer gate let an old indexed offset seek into the new search, with a visible jump; same-context control passed. [Evidence](bug-reproduction-evidence.md#kup-016). A failed setup was discarded; this is not a timing/performance measurement.
- **Regression coverage:** real mounted reporters cover query/order and same-query restart, reset, tier exit, owner/unrelated-consumer disposal, newer ranges, late callbacks, buffer/pagination updates and coordinate/velocity controls.
- **Disposition: DONE (22 September), committed as `e7bd0c426`** for indexed-scroll timer ownership. [Validation and limits](bug-reproduction-evidence.md#bounded-ux-repairs-kup-014015016019) include zero obsolete seeks in the live cross-context check and one valid same-context seek. The 200ms delay, map-independent coordinates and extensions remain; no per-frame serialization or measured performance claim.

#### KUP-017
**Density restoration can apply an old ordinal to new membership**
- **Distinct follow-up:** [ledger B4/L23](zz%20Archive/not-yet-another-audit-ledger.md#b4) covers newer-focus overwrite and a latent no-saved fallback; this completed repair covers saved-state search/wheel supersession.
- **Component / responsibility:** useScrollEffects density state and deferred frames; human owner-to-confirm.
- **Trigger:** a same-mounted search or newer scroll changes intent before the scheduled second restoration frame.
- **Expected / actual:** preserve valid fresh geometry/origin calculations, not an old search or superseded scroll action. Before repair, the saved ordinal/ratio closure lacked that ownership. Existing unmount cancellation was real and remains intact.
- **Evidence / reproduction:** [density frames](../../src/hooks/useScrollEffects.ts), [P19 F3][p19]. The historical unsuccessful 20 September attempt remains unchanged. Correct leaf-frame gating in local Chromium on 22 September demonstrated query placement from 0 to 2564 and newer wheel position from 320 to 165029, with an ordinary deep-density control passing. [Evidence](bug-reproduction-evidence.md#kup-017).
- **Regression coverage:** queued mounted geometry/header/viewport/prepend/extrema, Strict Mode, no-map indexed coordinates, disposal and key exclusions; real query/order/wheel interleavings and ordinary density workflows. Independent review's no-op Left/Right cancellation finding was reproduced and corrected with real no-focus and focused-arrow controls.
- **Disposition: DONE (22 September), committed as `4124967e3`**, for saved-density restoration. [Validation and limits](bug-reproduction-evidence.md#bounded-focus-repairs-kup-013017018027). The no-saved-state mount fallback is not newly certified. Geometry formulas, two-frame settling, cooldown and coordinate regime remain; no S2-S5 or API guarantee follows.

#### KUP-018
**Detail-return centring retains a row across newer entry or geometry changes**
- **Distinct completed repairs:** [B9/L27](zz%20Archive/not-yet-another-audit-ledger.md#b9) owns return before list readiness; [B12/L11](zz%20Archive/not-yet-another-audit-ledger.md#b12) unifies swipe/final-return session identity after reload. Both are Done within the [detail-return unit's local limits](zz%20Archive/not-yet-another-audit-ledger.md#detail-return-unit), separately from this deferred-frame certificate.
- **Component / responsibility:** useReturnFromDetail and grid/table callback owners; human owner-to-confirm.
- **Trigger:** close schedules a frame; reopen, query, columns/header or buffer origin changes before it executes.
- **Expected / actual:** preserve unchanged-entry native placement and centre the original valid traversed image using current geometry. Before repair, a precomputed row/virtualizer outlived its entry; an unmounted mock alone was not enough to establish the consequence.
- **Evidence / reproduction:** [return frame](../../src/hooks/useReturnFromDetail.ts), [P19 F3][p19], [P20 F2][p20]. The blocked 20 September attempt is retained. On 22 September a real local close/traverse/reopen moved the same retained table from 0 to 644; the ordinary centering control passed. [Evidence](bug-reproduction-evidence.md#kup-018).
- **Regression coverage:** queued reopen/disposal/query/history/focus cancellation, current columns/header/buffer-origin lookup, missing original target, valid rerenders and callbacks; actual browser reopen/query/resize plus existing native close, phantom, Home and immutable-entry controls.
- **Disposition: DONE (22 September), committed as `2c060f9de`**, for deferred return ownership and fresh geometry. [Validation and limits](bug-reproduction-evidence.md#bounded-focus-repairs-kup-013017018027). No forced centering on every close, latest-focus redirection, synchronous rendering or transport change; broader API/availability composition remains separate.

#### KUP-019
**Pending traversal direction can attach to a different current image/context**
- **Component / responsibility:** useImageTraversal pending-neighbour state; human owner-to-confirm.
- **Trigger:** an off-buffer neighbour is pending while the current ID/search changes in the mounted hook; a later window makes a neighbour resolvable.
- **Expected / actual:** navigation must remain owned by its originating intent. Before repair, pending state stored direction only and resolved against the latest ID/callback. Missing IDs, immediate navigation, null inactivity and unmount already cleared some paths; not every reopen failed.
- **Evidence / reproduction:** [pending resolution](../../src/hooks/useImageTraversal.ts#L189), [P20 F2][p20]. **20 September controlled real-data reproduction, Kupua/direct-ES/TEST:** one held off-buffer read advanced the newer mounted image from index 10 to 11 in URL and rendered identity; resident control passed. [Evidence](bug-reproduction-evidence.md#kup-019). Signal remained active; the null-separated reopen assertion covers a different case.
- **Regression coverage:** origin/query/order/history supersession, inactivity/unmount, successors, forward/backward completion, prepend/origin movement, far seek and repeated arrows; actual detail and native-fullscreen held-extension controls use local media isolation.
- **Disposition: DONE (22 September), committed as `00d92b54e`** for pending traversal ownership. [Validation and limits](bug-reproduction-evidence.md#bounded-ux-repairs-kup-014015016019) include live mounted-detail supersession and ordinary pending completion. Shared store work is not aborted; resident traversal/prefetch remain. Native fullscreen interleaving is local-E2E evidence, not a new live fullscreen or return-centering claim.

#### KUP-020
**Old prefetch completion can remove a newer same-ID request's tracking**
- **Component / responsibility:** image-prefetch session and in-flight map; human owner-to-confirm.
- **Trigger:** an old loader completes after a new session has installed a same-image-ID loader.
- **Expected / actual:** completion should finalize its own loader/session. Before repair, deleting by ID from the current map could remove tracking for a newer loader. This is resource tracking, not ordered-image/tuple publication.
- **Evidence / reproduction:** [prefetch owner](../../src/lib/image-prefetch.ts#L244), [P20 F4][p20], [P25 F4][p25]. **20 September controlled native-loader tracking reproduction in Kupua:** a delayed old error handler removed newer same-ID tracking; cancellation control passed. [Evidence](bug-reproduction-evidence.md#kup-020). Synthetic identities made real TEST-media requests that returned errors; no successful-media, visible-defect, bandwidth or frame-performance claim.
- **Regression coverage:** late load/error/decode success/failure across session replacement and same-session cancellation/reissue, newer-loader cancellation, current completion and legitimate late decoded-cache usefulness.
- **Disposition: DONE (22 September), committed as `74a49305f`** for issuing-map/loader tracking ownership. [Batch validation and limits](bug-reproduction-evidence.md#bounded-client-repairs-kup-022023026012020021). Cadence, radius, priorities and cache policy remain; S10 rendition identity/renewal and measured bandwidth/jank are not certified.

#### KUP-021
**Detail's failed-thumbnail termination check compares different URL forms**
- **Component / responsibility:** ImageDetail media error fallback; human owner-to-confirm.
- **Trigger:** full image fails, then a relative development thumbnail URL also fails.
- **Expected / actual:** fallback should terminate in usable unavailable-media presentation. Before repair, comparing absolute element `src` with a relative helper result could fail to recognize the already-tried thumbnail.
- **Evidence / reproduction:** [error handler](../../src/components/ImageDetail.tsx#L820), [P20 F3][p20], [P25 F4][p25]. **20 September locally fault-injected visible reproduction in Kupua:** failed full/thumbnail reads repeated fallback without terminal unavailable UI; stopped at the third main-image error. A decoding thumbnail control passed. [Evidence](bug-reproduction-evidence.md#kup-021). All failed media reads were intercepted locally; no infinite-loop or backend-failure claim.
- **Regression coverage:** real Chromium relative/absolute URL witness, full/thumbnail successes, exact two main-image errors, terminal unavailable presentation, fresh successor identity and obsolete responses; component layout/captured-callback controls retain stable containers and current decoded-load behavior.
- **Disposition: DONE (22 September), committed as `31ff3ea46`** for ImageDetail fallback and media lifetime. [Batch validation and limits](bug-reproduction-evidence.md#bounded-client-repairs-kup-022023026012020021). All failed media were intercepted locally before rendering. Preview redesign, URL renewal and S10 delivery acceptance remain outside scope.

#### KUP-022
**Configured aliases are not resolved by direct-mode has queries**
- **Component / responsibility:** Kupua CQL has-field resolver; human owner-to-confirm.
- **Trigger:** `has:cutout` with the configured cutout leaf present and no root field of that name.
- **Expected / actual:** a supported alias should identify the same field as its raw-path spelling. Before repair, the direct has branch used only static path resolution; ordinary alias matching and a correspondingly configured server path resolved the leaf.
- **Evidence / reproduction:** [has branch](../../src/dal/adapters/elasticsearch/cql.ts#L295), [P28 Q6][p28]. **20 September controlled DAL reproduction, Kupua/direct-ES/TEST:** the effective alias was confirmed; raw-leaf count was 1,094,891 versus alias count zero, with differing actual predicates. [Evidence](bug-reproduction-evidence.md#kup-022). Two reads established a populated-leaf witness; no mounted result-grid claim or server-alias conclusion.
- **Regression coverage:** synthetic configured precedence, positive/negative alias/raw predicates, static/direct/unknown controls, actual count callers and deduplicated facet targets. Already-configured `colourProfile` also passed bounded direct-TEST before/after counts and a visible editor/result-grid after-check.
- **Disposition: DONE (22 September), committed as `14f4fddb1`** at direct-client scope. [Batch validation and limits](bug-reproduction-evidence.md#bounded-client-repairs-kup-022023026012020021). No config copy, server-parity claim, named-field expansion/default change or false-versus-absent reinterpretation follows.

#### KUP-023
**Static typeahead self-exclusion can alter quoted literal text**
- **Component / responsibility:** registered typeahead field stripping; human owner-to-confirm.
- **Trigger:** live CQL contains field-like text inside a quoted phrase and a genuine chip for the same field.
- **Expected / actual:** self-exclusion should remove the chip, not rewrite the phrase. Before repair, static regex removal was not AST-scoped; dynamic AST removal also normalized whitespace inside retained literals.
- **Evidence / reproduction:** [static removal](../../src/lib/typeahead-fields.ts#L115), [P23 F2][p23], [P22 F4][p22]. **20 September synthetic actual-resolver reproduction in Kupua, no backend:** quoted field-like text was removed in both orderings; ordinary-chip control passed. [Evidence](bug-reproduction-evidence.md#kup-023). This establishes resolver behavior, not a mounted menu consequence or failure of every quoted value.
- **Regression coverage:** actual aggregation scopes for literal-before/after-chip, literal-only cache controls, repeated/negative/quoted/empty chips, boundaries and incomplete input; quoted arbitrary deep fields retain literal spacing. Visible editor/menu selection and quoted-value/deep-key URL round-trips were also checked with synthetic suggestion data.
- **Disposition: DONE (22 September), committed as `489bf05a3`** for shared AST-scoped self-exclusion. [Batch validation and limits](bug-reproduction-evidence.md#bounded-client-repairs-kup-022023026012020021). Existing double-quote grammar, cache/abort/absence and visible editor composition remain; no second parser, mapping repair or backend query-policy change.

#### KUP-024
**Restore placement uses a page total while publishing the session total (E013)**
- **Component / responsibility:** centred-window result, restore target selection and indexed view; human owner-to-confirm.
- **Trigger:** retained indexed-tier total with nonempty continuation pages whose total is zero/untracked or subset-sized.
- **Expected / historical defect:** placement uses the coordinate regime of the published session. Before the repair, restore chose its global/local target from the forward-page total while retaining the session total, leaving the scroll consumer a wrong buffer-local target.
- **Evidence / reproduction:** [centred result](../../src/stores/search-store.ts#L1393), [restore](../../src/stores/search-store.ts#L3919), [P18 F3][p18], [P29 C3][p29], E013. **20 September controlled store reproduction in Kupua UI, direct Elasticsearch, TEST cluster:** a real cached cursor, total 4,166, rank 2,343 and zero-total neighbour pages published global target -1/local target 99; the grid settled at offset 0 with the target absent. A fresh-PIT control also reproduced with successful responses. Ordinary detail reload/close passed; the failing probe explicitly invoked `restoreAroundCursor`, so natural-workflow incidence and an infinite loop remain unproved.
- **Validation:** failing-first coordinate regressions reproduced eight failures with four controls; all 12 pass after correction. Zero/subset/misleading page totals, both map states, non-indexed tiers, actual identity/ordinal and clamp placement are covered in [store tests](../../src/stores/search-store.test.ts). Edge/column/map-arrival and existing fill tests also pass. [Gates and limits](bug-reproduction-evidence.md#restore-repair-kup-024-and-kup-025).
- **Dependency / resolution:** current-client placement is repaired. The S3a/S5-connected consumer and S10 must preserve this contract under their selected APIs; no standalone rank/window gate or per-page counting requirement follows.
- **Disposition:** **DONE (20 September), committed as `3975f07f6`.** Restore samples the retained total once, reuses `isTwoTierFromTotal` and targets `bufferStart + targetLocalIndex`, including explicit focus. No extra request; helper geometry, page-count policy and map authority are unchanged.

#### KUP-025
**Saved-tuple rank and refreshed-tuple neighbours can describe different landings (E014)**
- **Component / responsibility:** restoreAroundCursor rank/target/neighbour composition; human owner-to-confirm.
- **Trigger:** sorted metadata changes between the saved cursor and current target lookup.
- **Expected / historical defect:** rank and neighbours refer to the selected landing tuple. Before the repair, rank used the saved tuple while neighbours could use a refreshed tuple; ordinary live drift itself is not the defect.
- **Evidence / reproduction:** [restore composition](../../src/stores/search-store.ts#L3877), [saved-cursor assertion](../../src/stores/search-store.test.ts#L2408), [P18 F3][p18], [P29 C3][p29], E014. **20 September synthetic read-boundary reproduction through Kupua's real restore action:** changed tuple used refreshed neighbours but published the saved rank; unchanged control passed. [Evidence](bug-reproduction-evidence.md#kup-025). No metadata mutation or visible-mislanding claim. Media was not isolated and made real proxy reads; those denials are a probe-isolation issue, not an application authorization finding.
- **Validation:** clean failing-first run reproduced 46 failures with 18 controls; deferred full-tuple/null/suffix, concurrency, missing-target, selected/obsolete failure and supersession regressions now pass. The full restore/PIT slice passes 120 checks. A bounded real-read TEST diagnostic reproduced wrong ordinal 783 versus 802 before and correct 802 after, without metadata mutation. [Measurements, gates and limits](bug-reproduction-evidence.md#restore-repair-kup-024-and-kup-025).
- **Dependency / resolution:** current-client composition is repaired. Future S3a/S5/S10 integration must retain selected-query/tuple/ownership contracts; standalone rank algorithms and KUP-010's composed API-only recovery gate remain separate.
- **Disposition:** **DONE (20 September), committed as `3975f07f6`.** Parallel saved-rank/lookup and full-tuple comparison preserve four primary calls when unchanged; changed tuples take exactly one additional rank before parallel neighbours and one landing. Immediately handled obsolete outcomes cannot delay/recover/publish. The operator accepted the measured changed-path trade-off (about 68 ms higher median completion in four-sample direct-TEST diagnostics), with variability and topology limits; this is not a fixed cost or wider performance approval.

#### KUP-026
**CQL remount can retain the first resolver's callbacks and datasource**
- **Historical repair:** the once-registered resolver retained wrapper-owned cache callbacks after Home/Clear unmounted that wrapper. The 20 September mounted reproduction and [bounded repair evidence](bug-reproduction-evidence.md#bounded-client-repairs-kup-022023026012020021) remain valid. Commit `384855da3` (22 September) fixed cache callbacks with live-store getters; it did not implement datasource rebinding.
- **Closure boundary:** the mode is selected before app/store initialization, so the September fixed-mode startup verification remains valid. It did not certify absence of reset-time suggestion work. The separately authorized [S4b repair](api-request-lifetime-and-performance-parity.md#s4b-repair-validation-20-october) later replaces first-owner capture with mounted-owner forwarding and explicit retirement; it does not add a runtime mode-switching workflow.
- **Executed evidence (U6z, 26 September):** [cold-start tests](../../src/main.test.tsx) execute real main-module initialization with API mode selected before imports, preserving the first real CQL registration across keyed wrapper remounts. Cold registered, alias and dotted-field suggestions assert returned values/counts and API requests; cache counts change between remounts. The top-level app render is held back in this unit fixture. The fully mounted browser separately exercised cold credit/alias/dotted suggestions and current `is:` counts through Clear -> Home -> Clear in one document, with the same registered constructor and no ES traffic. The deliberate wrong aggregation route failed the tests before restoration; full gates and operator API preflights passed.
- **Disposition: CLOSED for fixed-mode API initialization and remounts (26 September).** S4b additionally gives mounted suggestion owners explicit lifetimes and scope-bound reuse. Runtime switching is neither a supported workflow nor certified here. This is not proof of every resolver's backend policy, every failure combination or eventual removal of AI's ES dependency.

#### KUP-027
**Preview-exit centering can move a newer session's retained list**
- **Component / responsibility:** FullscreenPreview exit promise/resize/frame work and centring callback; human owner-to-confirm.
- **Trigger:** a new preview session begins while the older exit's centering frame is pending.
- **Expected / actual:** preserve the new session's native list placement. Before repair, the old frame could center under the new preview. Fresh focus/geometry within the same valid exit is intentional and passed its control; it is not itself an actionable defect.
- **Evidence / reproduction:** [exit work](../../src/components/FullscreenPreview.tsx), [P20 F2][p20]. The blocked 20 September integrated-browser attempt is retained. On 22 September native Chromium with isolated local media separated promise delivery from centering: the old frame moved a new preview's retained list from 0 to 100 while native preview, history and focus stayed correct. [Evidence](bug-reproduction-evidence.md#kup-027).
- **Regression coverage:** ordinary/latest-focus settlement, different/same-image reentry, resize, native-event exit and rejected/non-traversed retry in real Chromium; explicitly mocked mounted disposal, resize quiet period, safety cap and duplicate completion controls.
- **Dependency / resolution:** pre-native-entry promise timing, physical Esc/macOS animation and wider S10/gesture composition remain uncertified. The tested late-promise/new-active-preview path was already safe; no wholesale exit-lifecycle refutation or session-manager redesign is claimed.
- **Disposition: DONE (22 September), committed as `6718aebd0`**, for centering crossing preview sessions. [Validation and limits](bug-reproduction-evidence.md#bounded-focus-repairs-kup-013017018027). Existing native finalization, fresh-focus resolution and settling delays remain.

#### KUP-028
**Malformed URL dates can throw when the date dropdown opens**
- **Component / owner:** DateFilter and URL date admission; human owner-to-confirm.
- **Trigger / expected / actual:** an active bound contains an invalid ISO string and the user opens the dropdown. It should remain usable or reject the value safely; unguarded `format(parseISO(...))` throws. The closed button has a catch, so this is not an unconditional initial-page crash.
- **Evidence:** P32-A2; [date formatter and input](../../src/components/DateFilter.tsx), [string-valued schema](../../src/lib/search-params-schema.ts#L29). The original failure remained source-confirmed rather than executed because the regression and guard appeared together. The shared running UI then demonstrated the repaired state at `since=not-a-date`: a red `Uploaded: from Invalid date` label, empty native date inputs, usable recovery controls and Cancel preserving the URL. No response interception or server mutation occurred.
- **Regression coverage:** six mounted cases cover malformed upload/taken/modified start/end bounds, empty calendar presentation, red and accessible invalid state, explicit Clear recovery and valid local-calendar values. The accessibility assertion failed before `aria-invalid` was added. Valid timezone serialization and top-level exclusive/CQL inclusive policies are unchanged.
- **Dependency / disposition: DONE (27 September), committed as `2875bec44`.** Invalid raw bounds remain in URL/search state until explicit replacement or clearing; they are not silently discarded into a wider search. This is independent client robustness, not a global date-policy rewrite or migration prerequisite.

#### KUP-029
**Effective overlay rights and the no-rights badge can disagree**
- **Component / owner:** deriveImage and grid/field badge consumers; human owner-to-confirm.
- **Trigger / expected / actual:** baseline rights differ from supplied overlay rights with non-free cost. The effective rights label and badge should describe the same state; `usageRights` uses the overlay but `noRights` uses the baseline. Hiding a free-cost badge is ordinary behavior, not itself this defect.
- **Historical source finding:** P32-B1; [merge](../../src/lib/derive-enriched-image.ts#L93), [baseline-only assertion](../../src/lib/derive-enriched-image.test.ts#L193), [badge consumer](../../src/components/CostBadge.tsx#L179). The pure merge can still express opposing baseline/overlay rights, but this does not establish a current producer of that pair.
- **Post-U6z reachability:** ordinary search/window pages map `Image.usageRights` and overlay `usageRights` from the same media-api entity; standalone detail does the same from one GET response. Direct ES and selection mget supply no overlay. A bounded real media-api-mode check found identical baseline/overlay rights for 100/100 ordinary images and 20/20 controlled same-ID images. After a real AI transition, retained overlays changed rights and cost presentation for 0/20 sampled images.
- **Dependency / disposition: CLOSED/REFUTED for the independent current ordinary path (27 September).** Differently sourced or retained overlays can still make the pure inconsistency reachable, but that cross-provenance lifetime is owned by KUP-030. No badge repair, authorization conclusion or universal data-parity claim follows.

#### KUP-030
**Same-ID AI results can retain enrichment from an earlier ordinary API result**
- **Component / owner:** search-store publication, enrichment-store and [per-ID consumption](../../src/hooks/useEnrichedImage.ts#L26); human owner-to-confirm.
- **Original trigger removed:** P32-B3 described unavailable ordinary API reads falling back to ES without an overlay. U5 deleted `StranglerAdapter` in `3fdfeece2`; current ordinary pages never rescue through ES. Failure now preserves the committed state instead of publishing a new overlay-less page. That historical trigger no longer applies.
- **Executed residual (U6z, 26 September):** [the composed ordinary/AI/ordinary test](../../src/stores/search-store-api-mode.test.ts) uses the real store, mapper, `ApiDataSource` and existing ES AI delegate over controlled transport. An ordinary same-ID API result publishes `overquota`; a subsequent AI image whose derived baseline is `free` still derives `overquota` through the retained shared overlay. Returning to ordinary API search replaces it with the new response's `pay` overlay. This is synthetic effective-display evidence, not a live policy mismatch or authorization failure.
- **Real-route reproduction (27 September):** in a read-only TEST media-api-mode tab, one real AI query used Bedrock/direct ES. Twenty of its IDs were then loaded through ordinary media-api reads and the same query was re-entered through the visible AI control. All 20 matching AI results retained and consumed their ordinary overlays. For this sample, overlay rights/cost matched the saved AI baseline and rendered presentation changed 0/20; natural incidence of wrong display remains unproved. The ID scope was controlled setup, no responses were intercepted, and Home cleanup removed the page-only probe.
- **Selection boundary:** at closure, bulk hydration had no enrichment and left the shared overlay map untouched. Since 30 October it attaches server enrichment to each selected image object instead, still leaving the shared map untouched.
- **Disposition: OPEN evidence, resolution owned by U9 AI convergence (27 September).** The original ordinary fallback is gone, but real same-ID AI retention prevents broad closure. Incorrect effective display, other overlay fields, selection consequences and naturally incidental overlap remain unproved. Do not investigate or repair KUP-030 separately: U9-B's canonical media-api AI response must publish the current result's complete enrichment map, eliminating cross-provenance retention by construction. Close this ID only with that composed evidence. It remains separate from U6z's non-AI milestone and U8 deployment preparation.
- **Closure evidence (U9-B, 27 September):** accepted AI publication replaces the shared enrichment map with the result's own map (empty in direct mode and for an absent API result) before publishing hits. [The composed test](../../src/stores/search-store-api-mode.test.ts) now runs ordinary -> media-api AI -> ordinary over the real store, mapper and `ApiDataSource`: the AI step derives the AI response's overlay, not the retained `overquota`, and the return step derives the new ordinary overlay. Successful-empty, forbidden, conflict, unavailable and unreachable AI results leave an empty map; cancelled/superseded AI work changes nothing. Replacing with an upsert fails 6 tests. Selection hydration is unchanged and still supplies no overlay.
- **Disposition: CLOSED (27 September, U9-B).** The scope is AI publication in both modes. No live rendered-divergence check was run, and selection-overlay freshness remains outside this ID.

#### KUP-031
**Acknowledgement metric is described as DOM-visible latency**
- **Component / owner:** perceived-short metric documentation and trace consumers; human owner-to-confirm.
- **Trigger / expected / actual:** interpreting `dt_ack_ms` using the spec's first-DOM-visible definition. The label should describe its producer boundary; search emits `t_ack` before loading publication/render, while visible-frame latency is separately observed.
- **Evidence:** P32-C1; [metric description](../../e2e-perf/perceived-short.spec.ts#L20), [producer ordering](../../src/stores/search-store.ts#L2110), [separate outputs](../../e2e-perf/perceived-metrics.mjs#L46). High-confidence source semantic mismatch; not a measured slowdown or corrupt canonical campaign.
- **Executed discriminator:** the source ordering establishes `t_ack` as synchronous producer acknowledgement before loading publication/render, while the calculator fixture retains separate ack, store-ready, first-visible and settled outputs. A new harness guard failed against the old first-DOM-visible wording, then passed after the active short-suite header and perf handbook were corrected. Both dashboards' contract checks remained green.
- **Dependency / disposition: DONE (27 September), committed as `c0a5ff76f`.** This is a terminology correction only. Trace sites, metric names, historical rows and campaign interpretation limits are unchanged; no campaign or parity claim follows.

#### KUP-032
**Correlated metrics can accept invalid phase timestamps and negative durations**
- **Component / owner:** perceived-metrics calculator and validation boundary; human owner-to-confirm.
- **Trigger / expected / actual:** a correlated required phase precedes its start, a terminal precedes its status, or a non-start timestamp is non-finite. Such timing is not valid elapsed evidence; the calculator validates finite `t_0` and phase cardinality only, then subtracts other timestamps without those guards.
- **Evidence:** P32-C2, qualified: [calculator](../../e2e-perf/perceived-metrics.mjs#L24), [existing correlation assertions](../../e2e-perf/validation/harness-validation.test.mjs#L737). High-confidence source mechanism; no canonical row is alleged affected and no arbitrary total ordering of independent phases is required.
- **Executed discriminator:** pure calculator fixtures first failed because non-finite required/optional timestamps, phase-before-start and terminal-before-status intervals were accepted. The calculator now rejects those rows after existing correlation/cardinality checks. Zero durations, cross-document timestamps and intentionally independent phase ordering remain accepted; missing/duplicate controls are unchanged.
- **Dependency / disposition: DONE (27 September), committed as `c0a5ff76f`.** The emitted metric fields and both dashboard contracts are unchanged. No historical row is alleged corrupt, no total ordering is imposed, and this neither explains PP6c/P8 nor authorizes a campaign.

#### KUP-033
**Backward paging from the first null-tail image cannot reach the valued images before it**
- **Component / owner:** the store's [extendBackward](../../src/stores/search-store.ts#L2715), consuming null-confined pages from media-api `cursorRead` and direct-ES `_searchAfterImpl`; human owner-to-confirm.
- **Trigger:** a sort whose primary field is missing on some images (e.g. `-lastModified`, `-taken`, `-credit`) in the seek tier (over 65k results); the buffer starts inside the null tail (for example after a deep seek landing just past the boundary), and the user scrolls up across the boundary.
- **Expected / former behavior:** scrolling up should continue into the last valued images. A null-primary cursor reads only images lacking the primary value, in both directions. Previously, `extendBackward` prepended only that page and stopped at its exhaustion although `bufferOffset > 0`. Coordinates stayed correct; the scrubber and Home still reached the valued part.
- **Historical evidence:** [media-api cursorRead](../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L862), [direct-ES read](../../src/dal/es-adapter.ts#L927), and [null-zone filter](../../src/dal/null-zone.ts#L87). On 25 September the local-ES recorded-body replay showed a reverse `-taken` page confined to nulls. That assertion remains unchanged: it describes the endpoint's page contract, not the composed browsing contract. The earlier background-tab/deep-seek live probe was inconclusive, not a refutation.
- **26 September live reproduction and repair check:** with session-authorized read-only TEST access, Last modified ascending -> focus first rendered image -> descending landed across the boundary. Five real foreground downward wheels evicted the valued images; upward wheels then stopped at `scrollTop = 0`, buffer offset 127704, null-primary start, without an error. After the fix and reload, real upward wheels crossed into visible valued images in media-api and direct-ES modes. Each ended with 9 visible valued cells and 1000 unique, position-coherent buffered images; all 399 API-mode / 200 direct-mode overlap positions matched the pre-scroll references. API mode recorded 3 API pages and no ES reads; direct mode recorded 3 ES reads and no API pages. The live boundaries differed (127704 / 127726); this is not a cross-mode membership or timing comparison. Identities remained inside browser memory and probe state was removed.
- **Implemented contract:** after a short null-primary backward page, request only the remainder with a cursor-less reverse read, offset 0, no `seekToEnd`, no exact count, the same search scope and cancellation signal, and the effective PIT. Reverse nulls-last order starts at the valued end. The existing `min(PAGE_SIZE, bufferOffset)` cap prevents requesting beyond the known prefix, including all-null results. Combine images, authoritative tuples and enrichment before the existing alignment, retention, eviction and one prepend publication. Cancellation or failure during either read publishes neither partial page. Ordinary full/valued pages keep one read; crossing adds at most one bounded serial read, not a walk, rank or profile query.
- **Regression evidence:** [composed store suite](../../src/stores/search-store-api-mode.test.ts#L196) uses both real adapters over controlled transport responses, with the mock corpus only as an order/rank oracle. Four initial ascending/descending x mode regressions failed at runtime (24000 instead of 23840). The 38 added cases cover exact/partial/full null pages, within-zone/all-null/no-null controls, both sort directions, forward crossing, tied primary/secondary values, exact order/rank/positions, retained tuples, focus, enrichment, full-buffer aligned eviction, cancellation at either read and failed boundary reads. Existing assertions were preserved. Full gates: 1987 unit tests, build and 299 E2E tests passed; the normal E2E suite is direct-ES, not API-mode proof.
- **Disposition / limits:** DONE (26 September), implemented and verified locally; fresh read-only subagent cold review accepted with no material findings, and the operator approved completion and commit. The reviewer inspected code/diff, not new test or live executions. Section 5 operator API preflights were not run in this session. No adapter/server contract, AI, PIT policy, useful limit, KUP-034/036 or U6z change. Live checks cover the Last modified seek-tier grid, not every sort/tier/device or concurrent metadata mutation. Existing incomplete-page and live-snapshot limitations remain; no universal exactness or measured latency guarantee is added. API preflights are a separate regression check, not a repeat of accepted M1.

#### KUP-034
**The restore/focus backward page is not capped at the target's offset**
- **Defect:** [the centred loader](../../src/stores/search-store.ts#L1358), shared by restore and sort-around-focus, always requested 100 predecessors. Below rank 100, reverse nulls-last ordering could pull null-tail images ahead of the beginning. KUP-033 changed only `extendBackward` and did not fix this path.
- **Evidence:** local ES replay established the mechanism. A synthetic direct-TEST `restoreAroundCursor` call at rank 5 returned 95 nulls plus five real predecessors, published rank 100, and showed nine null-primary cells at the false beginning. Ordinary near-top detail/reload/close passed before and after; natural-workflow incidence remains unproved.
- **Fix:** known ranks cap backward reads at `min(100, rank)`, skipping zero. Provisional focus retains parallel rank/pages and removes excess predecessors with their tuples before alignment/publication. No added request or serial wait; selected-tuple ranking, retained totals, enrichment and ownership are preserved.
- **Validation:** [34 composed tests](../../src/stores/search-store-api-mode.test.ts#L194), both adapters, sparse sort directions and ranks 0/5/99/100/500; exact order/positions/tuples, alignment, enrichment, deferred rank and cancellation. Failing-first: 20 ordering failures, 14 controls passed; all pass after repair. Two old assertions now require the zero-rank request skip and supplied-rank prefix cap. Full unit/build/E2E gates passed (2,021/299 tests). Direct-TEST restores at 0/5 now preserve exact order and visible placement without leading nulls; ordinary reload also passes.
- **Disposition / limits:** DONE (26 September), cold review found no material issues; its formatting-only S3 is corrected. No API-mode live checks or operator preflights were run; ordinary E2E is direct/local. No broader snapshot guarantee, performance campaign, server change or AI/U6z/U7 work follows.

#### KUP-035
**Large-selection Details rendering stalls**
- **Scope:** separate from [ledger B3's range-gesture ownership](zz%20Archive/not-yet-another-audit-ledger.md#b3). Selection computation and rendering are different costs; do not assume the full reducer owns the observed long task.
- **Decision assessment and attribution, 7-8 October:** [model comparison and executed discriminator](zz%20Archive/not-yet-another-audit-ledger.md#kup-035-reconciliation-decision-assessment). The proposed reconciliation models remain unselected; the API DEV capture identifies post-publication pill rendering as the dominant blocking work.
- **Component / owner:** selection-summary publication and its [multi-image renderer](../../src/components/MultiImageMetadata.tsx#L195), including [MultiSearchPill](../../src/components/SearchPill.tsx#L126); human owner-to-confirm.
- **Trigger:** metadata arrives for a large selection (range select, reload hydration) while Details is open.
- **Expected / former behavior:** correct multi-image summaries should become usable without a large main-thread stall. The synchronous reducer published a view whose rendering mounted a pill for every distinct chip value; the measured dataset produced 4,238 partial-value pills, including 4,125 keywords.
- **Historical evidence:** 26 September two-run P19 preflights reported 358-367ms max frames/API and 358-363ms/direct, with roughly 318/319ms attributed to an idle task. Canonical four-run records subsequently show 338/354ms frames with only 8/7ms wrapped idle callbacks; later API evidence is 338ms/8ms. The [scheduler](../../src/stores/selection-store.ts#L199) is unchunked, as the [13 September audit](zz%20Archive/performance-first-dry-consolidation-audit-2026-09-13.md#L232) noted, but that does not establish it as the dominant CPU cost. The [catalogue](zz%20Archive/performance-harness-1-interaction-catalogue.md#L149) keeps 2,000-5,000 selections product-gated.
- **Executed attribution, 8 October:** one operator-authorised API-backed DEV P19-shaped action, visible 1720x960/DPR1, 1,000 selected, cold metadata except the anchor. Wrapped callback 8.8ms; enclosing browser idle task 316.6ms includes a 307.5ms post-publication React render. CPU samples lead through synchronous React work to `MultiSearchPill`/`jsxDEV`, including DEV repeated rendering. Maximum observed frame 375.1ms; action to stable nonempty panel 2,344.6ms. Four served raw-source hashes match workspace. This is one instrumented capture, not a production benchmark, direct-ES attribution or proof of every summary value; network wait was not separately recovered. Guard blocked no writes; selection, panel, wrappers and probes were cleaned up.
- **Implemented repair / operator clarification, 8 October:** Details initially mounts 20 frequency-ordered chips per field; Show more… reveals the complete field, Show fewer unmounts the remainder and scroll-anchors the header within physical scroll limits. Lists ≤20 have no control. `FieldDisclosure` replaces Filters' duplicated controls/collapse handler and supplies shared labels, styling, expanded/controlled-region accessibility and focus recovery. The operator explicitly retains Filters' existing 10 initial rows/≥10 possibly-more heuristic and bounded 100-bucket request. Fetch/loading/cancellation/stale ownership stays unchanged; Details expansion is request-free and retained across refreshed/pending/empty reconciled views. Full counts, stable ties, partial/full meaning and search modifiers remain intact. No reconciliation, aggregation-limit or number-formatting redesign.
- **Proof / review:** mounted renderer regression failed before repair (26 versus 20 keyword pills). Eleven new mounted cases cover exact values/counts, the 20-value boundary, independent fields, metadata/pending/empty refresh, no expansion requests, modifiers and native focus/cancellation; retained KUP-007 ownership checks pass. Two existing browser cases are strengthened in place, preserving small-chip and immediate-aggregation proof. One scoped read-only reviewer found a cancelled-field focus race; its failing-first regression and focus-retirement fix are accepted on re-review. Final gates: `npm --prefix kupua test` 2,936/85 files; `npm --prefix kupua run build` passed; `npm --prefix kupua run test:e2e -- --retries 0` 440 passed, one pre-existing conditional table-eviction setup skip, no failures/retries.
- **Bounded live performance, 8 October:** one foreground API DEV pair at 1720x960/DPR1, cold metadata except rank-zero anchor, same 1,000-image cohort and chip frequencies. An in-memory served-module intervention removes only the render bound; it is not a historical-HEAD benchmark. Keywords/people/subjects/labels cardinalities are 4,125/97/16/0; independent raw-metadata counts, ordered visible values and partial/full tooltips match. Default mounted pills fall 4,238 -> 56; maximum observed frame 334.1 -> 16.7ms, detected LoAF blocking 244 -> 0ms, summary-publication to stable panel 415.5 -> 22.4ms. Total readiness 2,164.4 -> 1,451.6ms includes unequal request-header wait unions (1,713.4/1,393.6ms), not just rendering. Large keyword expansion mounts all 4,125, issues zero requests and takes 378.6ms to stable geometry with a 316.7ms maximum frame. Event-start exclusion undercounts expansion task/LoAF blocking; no stall-free claim follows. Both panels pass real keyboard/focus, physical collapse anchoring, adjacent-field and filter/pill actions; four served-source hashes match. Invalid setup/oracle attempts and every valid numeric observation are retained with the [ignored attribution record](../../.vite/kup035-attribution-20261008/disclosure.json); probes/routes/cache override and transient selection are cleaned up.
- **Deferred collapse-focus follow-up, 8 October:** coordinator source review identified a distinct next-frame focus risk. Two mounted regressions reproduce theft of newer focus with retained/removed disclosure controls before the guard; both pass after rechecking active focus in that frame. Header fallback and scroll anchoring remain intact. Full unit/build gates pass (2,940 tests/85 files); the two focused Filters/Details browser cases pass retry-free. This is controlled mounted reproduction, not a live timing reproduction; no new performance claim.
- **Dependency / disposition:** DONE within default-collapsed local/API DEV limits; deliberate expanded rendering remains unbounded and can stall. Both datasources and selection/data semantics are preserved. No reconciliation-engine simplification, production-build magnitude, direct-ES performance equivalence or universal summary-semantic audit is claimed. The shared-disclosure repair includes the deferred collapse-focus follow-up.

#### KUP-036
**New API image-page endpoints can publish incomplete Elasticsearch execution as success**
- **Component / responsibility:** branch-added media-api `searchAfterQuery` and `imageWindowQuery`, their controller outcomes and Kupua's page consumers; human owner-to-confirm. This is Kupua migration work even though the repair is primarily Scala, not an independent legacy Grid defect.
- **Trigger:** Elasticsearch returns an otherwise successful search response with `timed_out: true` or one or more failed shards. These flags describe incomplete execution, not an individual undecodable image.
- **Former behavior:** both methods checked request success, then decoded and returned surviving hits without checking explicit execution incompleteness. A short page could be mistaken for exhaustion or incomplete hits assigned consecutive positions. Window's `rawHitCount` neither establishes completeness nor is consumed by the client. This was a source finding, not an observed live incident.
- **Repair:** [search-after and window](../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L921) now call the existing `requireCompleteExecution` after `requireSuccessfulRead`, before decoding. [Controller-local mappings](../../../media-api/app/controllers/ImageQueryController.scala#L34) return HTTP 503 with `search-after-incomplete` / `window-incomplete`, without page data, tuples or totals. Complete responses and non-fatal individual decode omission remain; window still reports raw hits. No client production change was needed.
- **Synthetic evidence:** [Scala matrix](../../../media-api/test/lib/elasticsearch/ElasticSearchTest.scala#L878) injects ES responses through the actual page methods and controllers: timeout alone and failed shard alone, empty/short/full pages, counted and uncounted. Failing-first produced 24 HTTP 200-versus-503 failures with 12 complete controls passing. All 38 final cases pass, including two complete-but-undecodable controls. Temporarily omitting each flag check on each endpoint caused the corresponding failures (12 per paired run); removing both controller mappings caused 24 failures. Both source files were restored byte-identically. Existing PIT-expiry/malformed-PIT, sort admission and omission assertions remain unchanged.
- **Client evidence:** [seven composed tests](../../src/stores/search-store-api-mode.test.ts#L744) use the real adapter and store over controlled 503 responses. Failed startup is not empty success; forward/backward/window failure retains the committed buffer, coordinates, tuples and enrichment. Restore target/forward/backward failures publish only the successful API-window recovery, never the partial neighbourhood; no migrated method reaches the ES fallback. Full gates passed: 742 Scala tests, 2,028 Kupua unit tests, build and 299 local/direct-ES E2E tests.
- **Ordinary live check (26 September):** operator-authorized read-only TEST through the modified local media-api and `--use-media-api`: pinned initial search, real scrubber deep navigation, resident detail traversal/return, bounded store-driven shallow navigation and wheel scrolling remained error-free and position-consistent. Shallow navigation used window (200); deep navigation used two search-after pages plus rank/profiles. The traversed image remained visible on return; observed image-data requests used media-api, with no browser ES traffic. This is bounded ordinary-behavior evidence, not a live failure reproduction, whole-workflow certification or performance comparison. No synthetic browser failure, induced ES timeout/shard failure or load campaign was run.
- **Disposition / limits:** DONE (26 September), implemented and verified locally. Fresh read-only subagent cold review found no S1/S2 issues; its sole S3 changelog-formatting finding is corrected. The reviewer inspected source, tests and recorded Scala summaries, not new test/live executions. Separate migration repair before final U6z verification, with media-api edit permission confirmed. Legacy `GET /images`, shared Grid execution, timeout settings, targets, PIT policy/expiry, sort/tuples, decode omission, retries, AI and other parked issues are unchanged. M1 remains accepted; U7 and operator API perf preflights remain separate, not run here.

#### KUP-037
**Collection membership badges silently apply the free-only default scope**
- **Component / responsibility:** collection-store startup count request and the shared direct/API request mappers; human owner-to-confirm.
- **Trigger / expected / actual:** `loadCollections()` requests `getAggregations({})` for `collections.pathId` and describes the result as unfiltered membership volume. Missing `nonFree=true` activates Kupua's ordinary free-only default, so both direct ES and media-api requests count only free-eligible images. If the badges mean total collection membership, they undercount; if free-only counts are intended, the UI/comments do not disclose that scope.
- **Evidence:** [collection request](../../src/stores/collection-store.ts#L123), [API mapper default](../../src/dal/grid-api-search-adapter.ts#L129), [direct builder](../../src/dal/es-adapter.ts#L548), and the [cold-start request assertion](../../src/main.test.tsx#L78), which explicitly requires `free: true`. This is source/test confirmation, not a browser comparison or measured user impact.
- **Smallest discriminator:** create one free and one non-free image in the same collection, load counts through each datasource, and assert the intended badge total. First decide whether the product label means all membership or free-only membership; do not weaken direct/API parity.
- **Dependency / disposition:** DONE (30 October). Operator decision: counts follow the "Free to use only" checkbox, not the user's default (silently using a default some users don't have looked buggy). Counts now load lazily when Collections is shown or hover-prefetched, once per scope per tab session; startup loads only the tree. Failing-first store, `CollectionTree` and Browse-hover tests; startup assertions updated to require no count request. Direct-ES and media-api share the store path. PROD request cost remains unmeasured; the change reduces how often it runs.

#### KUP-038
**Density switch and Home/End keys cancel an in-flight search without replacing it**
- **Historical finding:** shared range cancellation could abandon ordinary/AI initial reads and strand loading; keyboard navigation could also use predecessor-query totals. Source-only at intake on 27 September.
- **Current contract:** density cancels obsolete maintenance, not current query discovery. Home/End may retire initial placement while retaining current-query discovery; an old first page must not overwrite the newer destination. New search/Home-logo supersedes the prior query; finite AI retains its own membership.
- **Resolution:** covered by [B8/L37](zz%20Archive/not-yet-another-audit-ledger.md#b8) and [B17](zz%20Archive/not-yet-another-audit-ledger.md#b17), not another repair. [Search-store](../../src/stores/search-store.ts) now separates search, browsing and maintenance owners and settles only owned completion.
- **Maintained proof:** [mounted density/search tests](../../src/hooks/useScrollEffects.test.ts), [keyboard/discovery tests](../../src/hooks/useListNavigation.test.ts) and [API/store controls](../../src/stores/search-store-api-mode.test.ts) cover delayed reads, current totals, newer destinations, finite AI and supersession in both adapters. Recorded gates and bounded live-checkpoint limits remain with the linked ledger entries.
- **Disposition: DONE (3 October, reconciled at `7b82b13f8`).** This is a closure against existing repairs and verification, not a new test/live run or a claim that every density/keyboard defect is fixed.

#### KUP-039
**Bare startup dispatches an obsolete search before defaults settle**
- **Component / responsibility:** [URL/default producer](../../src/hooks/useUrlSearchSync.ts#L121), before search-store admission; not a datasource-wide duplicate-request policy.
- **Trigger / expected / actual:** a bare `/search` entry should resolve existing Home defaults before dispatching its first search. In two local API DEV controls, an absent rights flag dispatched a provisional free-only page/count before `nonFree=true` replacement dispatched the accepted all-rights pair. The provisional pages were browser-cancelled and their counts completed; neither supplied accepted rows, total or ticker publication in those controls.
- **Evidence / limits:** [startup timeline and conclusion](zz%20Archive/not-yet-another-audit-L19-network-measurmenets.md#kupua-api-startup-scope-and-polling), 5 October at `31d5deda0`. The one-time ref is marked before asynchronous navigation settles; DEV effect replay supplies a source explanation consistent with the capture. Individual React transitions, production incidence, backend cancellation and ES cost are not certified. Explicit all-rights/free-only and actual in-session Home supplied useful reads; Home did not reproduce this sequence.
- **Operator compatibility requirement, 6 October:** fix default-resolution ordering, not a hard-coded transition to `nonFree=true`. Kupua will derive defaults from permissions later. A resolved free-only default is valid; unresolved defaults are not a free-only search. Reuse the existing defaults owner and preserve explicit URL intent and authorization. Both direct ES and media-api must obey the same admission contract. Do not implement permission fetching, add an optional-service dependency or invent new failure/fallback policy in this repair.
- **Smallest discriminator:** mount the real URL-sync owner with bare params and hold default replacement pending through effect replay; assert no provisional search is admitted, then one effective resolved search. Confirm failure on current code and compare Strict Mode with ordinary mounting. Substitute resolved free-only/all-rights defaults at the existing boundary and cover both datasource routes. Preserve explicit rights, nonempty query, later deliberately empty navigation, Home, history/detail and useful count/ticker discovery; identify existing expectations before editing.
- **Repair / proof (6 October):** the real URL-sync owner now distinguishes unresolved/pending/resolved defaults. Canonical-empty free-only defaults need no replacement; pending replacement does not admit still-bare params. Existing explicit intent, later empty navigation, Home and history/detail ownership remain. Nine owner cases replace the preliminary two-case proof with actual direct-ES/media-api page/count/ticker composition and compact defaults/intent controls. Failing-first established Strict Mode initial replay admission and ordinary-mount admission only after a separate pending rerender; the full owning suite passes.
- **Live verification (6 October, operator-shared browser):** visible `ApiDataSource` DEV tab, served URL-sync SHA-256 equal to workspace and Strict Mode retained. Bare entry issued one successful all-rights page/count pair, no provisional free-only read, and one 200-row publication. Explicit all-rights/free-only controls and actual Home from free-only each supplied one intended pair/publication; projected baseline ticker values matched the count response in all four controls. Pass-through pre-navigation observation did not hold or replace responses; cleanup removed activation/probe/subscription and restored fetch/store-global ownership. This extends proof to the served native API path only; no live direct-ES, production, backend-cancellation or late-router supersession certificate follows.
- **Validation / disposition: DONE locally (6 October), based on `31d5deda06844904991a9bccba419747ef765500`.** Full local gates pass: 2,920 unit tests/83 files, TypeScript/Vite build and 453 retry-free E2E including forced-seek. Two independent complete-snapshot cold reviews and final proof re-reviews accept without findings. This replaces premature default authority, not a code-subtraction exercise: production grows three lines; tests grow 138 lines/nine cases. The preliminary two cases were replaced, with no redundant baseline proof found to delete. No polling, rights-policy, permissions fetching, optional-service wait, tiers, Kahuna, global suppression or new measurement campaign is included. Local composed adapters do not certify native media-api, backend cancellation, production incidence/savings or actual late-router transition supersession; the explicit-intent control models observed owner intent only.

#### KUP-040
**Arrival polling dispatches even when its effective upload interval is empty**
- **Component / responsibility:** [arrival poll admission](../../src/stores/search-store.ts#L924), independent of KUP-006's completed cumulative accounting repair and ledger B20's retained-arrivals repair.
- **Trigger / expected / actual:** effective lower upload bound `max(params.since, newCountSince)` is at or after `params.until`. The shared date predicate is strictly after/before, so no image can match. Nevertheless, the historical local API control issued four such reads in 35 seconds. They supplied zero arrival deltas and advanced the ticker timestamp, but did not refresh rows, deletions or browse totals.
- **Evidence / limits:** [historical polling eligibility](zz%20Archive/not-yet-another-audit-L19-network-measurmenets.md#historical-polling-eligibility), 5 October at `31d5deda0`, and [strict date bounds](../../../common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/filters.scala#L42). This establishes useless requests for the measured contradictory interval, not broken ordinary arrival detection or quantified server load. Kahuna's related findings remain separately scoped in the report.
- **User contract:** preserve foreground/background polling for searches that can receive arrivals, the tab title/icon and badge notifications, useful baseline/cumulative tickers, and already-known arrivals restored with their matching browse boundary. Do not disable polling merely because a tab is hidden, has an upper date bound or returned zero. A future upper bound, or a restored freeze earlier than the upper bound, can still leave an eligible interval. These upload-arrival polls do not promise detection of later metadata edits to older pictures.
- **Smallest discriminator:** use existing fake-timer/store fixtures to compare lower-before-upper, equal and lower-after-upper instants; only impossible intervals should issue no datasource count. Retain open-ended/future-bound positive arrivals, visibility transitions, restored count/boundary, query replacement and stale-publication controls. Compare date instants, including supported timezone representations; do not weaken invalid-date handling.
- **Repair / disposition (20 October):** repaired locally with a four-line poll-admission guard comparing `max(since, newCountSince)` and `until` as date instants. Invalid dates fall through; request construction, scheduling, restored state and stale guards are unchanged. Five impossible cases failed first on redundant reads; nine compact interval cases and existing polling controls pass. Full unit/build gates pass; all 485 E2E cases have passing evidence across the interrupted run (467 completed) and the operator-approved remaining-case run (18 passed without retries), not one uninterrupted full run. Two independent cold code/test reviews found no issues. No live-system access or server change; this remains request-efficiency work, not a new refresh guarantee.

#### KUP-042
**Fixed-grid buffer realignment moved retained visible images**
- **Component / responsibility:** fixed-row Grid presentation and its shared data-window boundary. Owners: [row geometry](../../src/lib/scroll-geometry-ref.ts), [ImageGrid](../../src/components/ImageGrid.tsx), [resize anchors](../../src/lib/grid-scroll-anchor.ts), [scroll effects](../../src/hooks/useScrollEffects.ts) and [search-store publication](../../src/stores/search-store.ts). Not a Kahuna or backend ordering defect.
- **Original evidence:** the 21 October isolated seek-mode fixture used 70,000 in-memory results at 1720x960. A six-column, 300-image window with remainder one received a 199-image aligned prepend: the 18-image cohort moved by up to 303 px vertically while its elected anchor stayed still. These observations describe the pre-repair code, not the new policy. [Research scope and campaign interpretation](scroll-horizons-thumbs-and-blocking.md#fixed-grid-continuity) remain separate from the geometry contract.
- **Ordinary trigger confirmed:** shared TEST browsing reproduced the defect after a deep-position landing followed by a panel or width change and backward refill, with width fixed during publication. An aligned four-column control stayed still. The three-column panel case moved six of nine visible images by a 303 px row; an unheld five-column refill moved nine of fifteen by a row. All retained IDs, global positions and sources remained correct. The elected anchor also moved in those live variants, so its stability in the original fixture was not universal.
- **Selected contract:** at unchanged query/order and width, maintenance preserves every surviving visible fixed-grid box. Rows keep global membership while their bounded vertical origin moves. Partial leading layout space is accepted instead of packing the window left and later regrouping it. Resize/density/history retain their existing anchor policies. See the [owning policy](00%20Architecture%20and%20philosophy/03-scroll-architecture.md#fixed-row-window-policy).
- **Repair:** shared origin-aware rendering/navigation/seek arithmetic; net-origin prepend/eviction compensation; complete pages and exact-capacity eviction instead of column trimming. Resize captures the last committed fixed geometry and resolves the surviving identity in the destination, including same-commit publication. Explicit stale-end evidence blocks the forward-refill chain exposed by capacity controls, without changing horizons, indexed admission or valid programmatic demand. True-start correction, cursors, selection and cancellation remain.
- **Regression coverage:** [existing browser suite](../../e2e/local/density-controls.spec.ts) asserts retained boxes from publication onward across aligned/density/panel setups, capacity in both directions, shrinking extent, true start, indexed coordinates and in-flight resize. Controlled same-commit delivery verifies committed columns/offset and twelve actual anchor samples. Existing unit suites cover row phases, coalesced origins, partial-row paging/seek, full pages, exact capacity and authoritative tuples. Obsolete modulo-alignment assertions were replaced, not relaxed to tolerate displacement.
- **Validation / limits:** final 21 October local gates passed: 3,134 unit tests, application build and 495 retry-free E2E tests. Three complete-patch reviews found no material correctness, performance/design or test-adequacy findings. Geometry observations are bounded and animation-adjusted, not every-frame compositor or media-readiness proof; this is not a measured speed claim or a fix for Justified boundary repacking.
- **Dependency / disposition:** DONE (21 October 2026), fixed-grid geometry scope. Independent repair, not a migration gate or adoption of a B2 predictor, larger buffer, global key rewrite or Justified freeze.

To rerun the focused contract, follow the [local E2E setup/port rules](../../e2e/README.md#local-projects-and-ports), then from the repository root:

```sh
set -o pipefail; npm --prefix kupua run test:e2e -- --project=chromium density-controls.spec.ts --grep 'fixed-row publication' --retries=0 2>&1 | tee "$TMPDIR/kupua-test-output.txt"
```

#### KUP-043
**Image refresh and enrichment after a write (future edits/deletions)**
- **Scope:** authoritative image refresh, stale-read exclusion, selection/detail ownership and stable browsing after writes. KUP-030's closure covers the AI overlay lifetime, not this contract. The [Step-4 plan](gradually-growing-teeth.step-4-publication-plan.md) owns the selected policy and remaining execution gates; its current decisions supersede the original October design sketch.
- **Implemented foundation, A1 (6 November):** incoming extension duplicates are excluded with their paired tuples and overlays while raw scan frontiers advance. Resident slots are preserved; duplicate-only progress can resume viewport or pending traversal demand through existing ownership/cooldowns. This is bounded retained-window exclusion, not exactly-once enumeration of a changing catalogue.
- **Implemented foundation, A2 (6 November):** the operator selected same-slot buffer replacement after a normal-media trial. The shared publisher replaces resident bodies, retained authority and selected/cached metadata without moving membership or coordinates. Unchanged effective image ratios preserve Justified packing and scrolling prediction. Per-cell alternatives and temporary trial/counter machinery are removed; normal editing remains disconnected.
- **Evidence:** the [A2 checkpoint](gradually-growing-teeth.step-4-publication-plan.md#a2-comparison-checkpoint) records failing-first regressions, consumer/geometry checks, operator and agent trials, final full validation and the explicitly accepted unresolved table-sort timeout. That timeout is not classified as a post-write publication defect. No measured speed win or deployed write behavior is certified.
- **Implemented A3-C:** bounded simulated readback, touched-ID freshness and omission protection, selected metadata/full standalone delivery, stable retained-coordinate continuation and action-owned exact acquisition, plus explicit unavailable/deleted slots and complete-fitting-set compaction. Final checkpoints in the publication plan own evidence and limits. Root `lastModified` is not a universal freshness version; frozen upload bounds do not exclude later edits. Touched facts retain variable-sized exact comparison metadata within a 1,000-ID cap, not a byte bound.
- **Unit D evidence:** integrated gates, seeded sequences, local/compiled-hosted observer composition, foreground rehearsal and independent reviews are complete at the [operator checkpoint](gradually-growing-teeth.step-4-publication-plan.md#unit-d-evidence-and-review). Review reproduced and repaired nonmatching-read authority withdrawal and empty cold-detail failure settlement; normal editing remains disconnected.
- **Disposition:** CLOSED for the Step-4 simulated contract after explicit operator acceptance on 7 November. The documented approximation/resource limits remain. This does not certify deployed writes, authorize Step 5 or implement the real Delete workflow; live activation remains separately gated.

### Completed Query Repairs

#### GRID-001
**Usage exclusions can weaken one another**
- **Component / responsibility:** media-api QueryBuilder and default insertion, with Kupua request-mapper participation; human owner-to-confirm. One canonical cross-component entry, distinct from raw intent detection in [KUP-011](#kup-011).
- **Trigger:** negative usage conditions are combined with other user exclusions or automatic replaced suppression. The 20 September direct-Kupua comparison worked for the single print exclusion; that is not proof that its deliberate multiple-negative grouping already matches the selected contract.
- **Expected / actual:** every negative usage condition independently excludes an image if any usage matches it; positive conditions must still match the same usage record. Both the integrated upstream builder and direct-ES builder now follow that rule for supported syntax.
- **Evidence / reproduction:** **20 September controlled live-data reproduction on Kahuna -> media-api GET -> TEST and Kupua -> local media-api D3 -> TEST:** a known positive witness survived platform and published-status exclusions. GET rendered one match; D3 also rendered the witness cell. [GET evidence](bug-reproduction-evidence.md#grid-001-kahuna-get), [D3 evidence](bug-reproduction-evidence.md#grid-001-and-grid-008-kupua-d3). [Grouping source](../../../media-api/app/lib/elasticsearch/QueryBuilder.scala#L120) and [P28 Q3][p28] support the proposed cause, not the deployed revision. The earlier direct-Kupua check was comparison only; not every usage field or production deployment was tested.
- **Current status, 23 October:** [PR #4957](https://github.com/guardian/grid/pull/4957) is merged. API requests preserve original q and direct ES emits independent negative nested queries. Local fixture replays of both clients distinguish independent exclusions from grouped negatives and retain positive same-record controls. [Earlier evidence](01%20Research/grid-usage-search-investigation.md) describes the pre-merge characterization.
- **Smallest test:** after merge, verify the accepted contract through actual mapper/D3 bodies, exact IDs and totals, then the affected positional consumers. Preserve positive correlation and intentionally replace grouped-negative expectations with independent image-level exclusions. The standalone Grid regressions do not establish this prototype join.
- **Dependency / resolution:** preserve independent exclusion and positive same-record correlation in Grid's shared builder and callers. Kupua composition and parser compatibility are client responsibilities, tracked separately under KUP-011.
- **Disposition: DONE (Grid repair).** PR #4957 supplies the merged exclusion rule, covered by local server regressions. The client paths are also aligned locally for supported syntax; their residual grammar differences do not reopen this Grid item. No deployed or universal grammar-parity claim follows.

#### GRID-002
**Equivalent deleted-read intent is not consistently admitted by legacy GET**
- **Component / responsibility:** media-api legacy search admission; human owner-to-confirm. **Private maintainer/security triage** before additional reproduction detail or public issue.
- **Trigger:** equivalent supported query formulations under an authenticated ordinary principal subject to deleted-read restrictions.
- **Expected / historical defect:** the same query-dependent authorization scope should apply before hits/totals. The old legacy condition recognized a narrower formulation than the parsed D3 path. Main now supplies parsed admission for both ordinary and AI search; this was not a missing-authentication defect.
- **Evidence / reproduction:** [legacy admission](../../../media-api/app/controllers/MediaApi.scala#L584), [P28 Q5 and complementary guards][p28]; **qualified production-source inference only**. The browser campaign did not have private principal/security-test scope and made no probe. [Blocker](bug-reproduction-evidence.md#permission-blocked-routes). No deployed revision, disclosure or live reproduction established; details are not expanded here.
- **Smallest test:** private/isolated controller and ES authorization contract for equivalent intent and principal classes, checking hits/totals and no unauthorized dispatch; no live probing.
- **Upstream disposition, 23 October:** accepted [PR #4957](https://github.com/guardian/grid/pull/4957) now includes parsed deleted-intent admission for ordinary and AI searches. The local integration retains that implementation and reuses its scope helper for POST reads, with isolated ordinary/privileged-principal and explicit-AI controls. No live probe or deployed validation is claimed. KUP-011's remaining direct-parser syntax scope is separate from the upstream authorization repair.
- **Disposition: DONE (Grid repair).** The merged parsed admission and local authorization controls close the server defect. Direct mode's missing user-permission context remains its existing prototype limitation, not an open Grid defect.

#### GRID-008
**Supported nested print-usage keys resolve to different leaves**
- **Component / responsibility:** media-api CQL field resolution/QueryBuilder and mapped usage vocabulary; human owner-to-confirm.
- **Trigger:** currently supported code-valued section/publication input against the populated print-usage leaf; include the selected orderedBy path in the discriminator.
- **Expected / historical defect:** preserve the admitted mapped attribute. The integrated upstream resolver and direct client now use print section code/name and publication name/code leaves. Direct nested orderedBy honors configured usages paths, falling back to the canonical print leaf for absent or unrelated aliases; ordinary top-level alias resolution is unchanged.
- **Evidence / reproduction:** [client fields](../../src/dal/adapters/elasticsearch/cql.ts#L250), [nested fields](../../../media-api/app/lib/querysyntax/QuerySyntax.scala#L142), [P28 Q10][p28], [P29 C2][p29]. **20 September controlled live-data reproduction on Kahuna/GET/TEST and Kupua/local-D3/TEST:** populated section/publication-code witnesses returned zero; positive platform/status controls returned them. [GET](bug-reproduction-evidence.md#grid-008-kahuna-get), [D3](bug-reproduction-evidence.md#grid-001-and-grid-008-kupua-d3). This tests positive resolution, not exclusion or production incidence. Per [P30][p30], orderedBy still depends on its SingleField alias path; no universal orderedBy failure or effective-alias conclusion.
- **Current status, 23 October:** merged [PR #4957](https://github.com/guardian/grid/pull/4957) supplies the accepted field resolution. API mode forwards those queries unchanged; direct mode aligns section leaves and nested orderedBy alias precedence. Local fixture replays check code/name membership and unit controls distinguish absent, canonical, nested and unrelated aliases. Section-name support is intentional; digital section IDs are not added.
- **Smallest test:** after merge, verify the accepted mapped fields through actual mapper/admission/D3 and the selected new path, asserting emitted fields and exact IDs/totals. Retain independent code-only/name-only witnesses, positive/negative controls, same-record correlation and absent/canonical/conflicting orderedBy aliases.
- **Dependency / resolution:** preserve the accepted mapped leaves and alias precedence in Grid; client grammar compatibility belongs to KUP-011 rather than this completed server repair.
- **Disposition: DONE (Grid repair).** PR #4957 supplies the merged field-resolution fix, covered by code/name and alias controls. API/direct clients are aligned locally for supported syntax. This supersedes P30's browse-only normalization; no deployed or whole-grammar parity is claimed.

#### GRID-015
**AI search did not apply the deleted-search admission that ordinary GET applied**
- **Component / owner:** media-api `MediaApi.imageSearch` AI branch, including legacy and explicit `aiQuery` requests. Historical authorization finding; no deployed incident was established.
- **Historical defect:** AI ranking and pool counting bypassed the uploader restriction applied to ordinary deleted-image searches. This is distinct from GRID-002's recognition of equivalent query forms.
- **Repair / evidence:** merged [PR #4957](https://github.com/guardian/grid/pull/4957) applies parsed uploader scoping before ordinary/AI dispatch. [AI controller/ES controls](../../../media-api/test/controllers/MediaApiAiSearchTest.scala) cover ordinary/privileged principals, legacy/explicit ranking, pool responses and malformed input including zero-length requests. These passed against disposable local Elasticsearch; no live probe or deployment claim follows.
- **Disposition: DONE (Grid deleted-search admission).** Server authorization and query-syntax validation are applied before AI work. This does not claim that every ordinary-search parameter-validation rule applies to AI, or that direct ES has Grid's permission context.

</details>

## Reading and Disposition Rules

- IDs are stable: retain them when an entry moves, is corrected or is closed; never reuse an ID.
  Cross-component findings have one canonical entry. Links from another section are not extra issues.
- **Migration prerequisite** means the named candidate slice cannot claim its stated behavior until
  the listed defect/contract is resolved. It is not a requirement to fix it now, or before every slice.
  Resolution can be an approved implementation, a scoped containment, or characterization that
  refutes the suspected defect. Characterization alone does not certify a known-broken final path.
- **Independent backlog** is parked and may remain so indefinitely. Relevance to migration does not
  establish a dependency. **Dependency unresolved** explicitly leaves validity or slice coupling open.
- Expected behavior below comes from the existing caller contract or stated slice obligation, not
  an invented universal snapshot, freshness guarantee or performance target. Candidate slices remain
  provisional. A prerequisite classification does not approve its proposed behavior or implementation.
- Source-supported and test-read evidence is not an executed reproduction. Unless explicitly noted,
  no listed failure has been runtime-reproduced by this research or observed in a deployed system.
  Historical S1 gates and report 04's synthetic check have their narrower stated scope.
- Every human owner is **owner-to-confirm**. Responsible components below identify code ownership,
  not invented people, teams or deadlines. Linked PRs record actual upstream work, not merge,
  deployment or whole-ID resolution.
- Access-control-sensitive entries require **private maintainer/security triage** before expanding
  reproduction details or publishing an issue. This document does not authorize new contact,
  publication or live checks.

### Slice-Local Resolution Index

| Slice / claimed behavior | Canonical prerequisite | Resolution boundary |
| --- | --- | --- |
| S2 admitted query/default composition | [KUP-011](#kup-011); completed [GRID-001](#grid-001), [GRID-008](#grid-008) | Grid repairs and supported client-query alignment are implemented locally; preserve common read scope and mapped fields. Remaining direct-parser syntax scope belongs to KUP-011, not an open Grid gate. |
| Migrated restore consumer using S3a/S5, and S10 restore acceptance | [KUP-024](#kup-024), [KUP-025](#kup-025) | Current-client repairs DONE; preserve retained-total placement and selected-tuple composition when connecting new APIs. Migrated acceptance remains open, not a gate on standalone rank/window methods. |
| S3b live range selection | [KUP-002](#kup-002), [KUP-003](#kup-003) | Current-client ownership and bounded unknown-order retry are DONE; migrated collector acceptance remains open. |
| S4 complete-or-absent map | [KUP-009](#kup-009) | Current-client explicit-incompleteness discard is DONE; migrated execution contract and acceptance remain open, not universal snapshots. |
| S6a singleton detail | [KUP-004](#kup-004) | Current-client identity repair DONE; retain ID-bound image/overlay publication through future singleton GET composition. |
| S6b hydration | [KUP-001](#kup-001) | Current client ownership fix DONE, accepted and committed; complete-logical-read/API omission policy remains open. |
| S7 polling | [KUP-006](#kup-006) | Current-client baseline-plus-latest cumulative accounting is DONE; preserve lifetime/response ownership in API composition. |
| S8 expanded / AI-scoped aggregates | [KUP-007](#kup-007), [KUP-005](#kup-005) | Current-client ownership/empty-membership repairs DONE; future API composition must preserve them. Ordinary-only work is not gated by AI. |
| S9 AI publication | [KUP-005](#kup-005), [KUP-008](#kup-008) | Current-client loaded-set scope/current-sort repairs DONE; migrated producer and caller acceptance remain open. |
| S10 current non-AI API recovery | [KUP-010](#kup-010) | CLOSED by U6z composition tests and existing API wiring; AI remains the sole ES exception, not absolute API-only completion. |

CQL fixed-mode initialization is closed by U6z; runtime rebinding is not supported. Preview-exit
ownership retains its explicit limits below. P29's
source-backed C2/C3 assessment narrows GRID-008 and E013/E014 to the activation gates named above;
those gates remain open. The current usage-search dispositions below supersede P30's grouped-negative
and browse-only repair direction; they do not approve wider API implementation or activation.

## Kupua

### Migration Prerequisites

#### KUP-011
**Parsed query defaults and remaining direct-to-ES grammar divergence**
- **Component / responsibility:** direct Kupua query defaults, D3 request mapper and analogous legacy Grid Parser default construction; one cross-component entry. Human owner-to-confirm. Visibility-sensitive forms warrant private maintainer/security triage before expanded public detail.
- **Trigger:** supported quoted/case-varied positive intent, or ordinary literal text containing a special query substring.
- **Expected / historical defect:** automatic defaults should follow actual parsed intent. Raw substring checks added contradictory exclusions or omitted intended defaults. API mode now forwards original q (absent becomes empty); direct mode derives intent from its parsed fields before grouping, without reparsing. Predicate-only ticker parsing remains default-free.
- **Evidence / reproduction:** [direct defaults](../../src/dal/es-adapter.ts#L470), [mapper](../../src/dal/grid-api-search-adapter.ts#L115), [P28 Q2/Q4][p28], E047. **20 September synthetic direct-builder reproduction in Kupua:** non-sensitive replaced-intent and literal-text cases produced wrong predicates at a capturing transport boundary. [Evidence](bug-reproduction-evidence.md#kup-011). A later one-hit live D3 read found no replaced witness, leaving that comparison inconclusive; no deleted/visibility probe or mounted result claim.
- **Current status, 23 October:** [PR #4957](https://github.com/guardian/grid/pull/4957) is merged. API mapper and direct-default repairs are implemented locally, with failing-first transport regressions and synthetic local-ES membership checks. Actual API bodies were replayed across search/window/rank/profile/keys/count/aggregation reads. [Earlier investigation](01%20Research/grid-usage-search-investigation.md) records pre-merge evidence, not the current contract.
- **Remaining direct-to-ES divergence (operator accepted):** `@guardian/cql` treats single quotes as literal value characters, unlike media-api's parser. For example, `usages@status:'replaced'` differs from its double-quoted form in direct mode. Preserve the existing parser/editor grammar for now; [adapter regressions](../../src/dal/es-adapter.test.ts) pin this limitation. API forwarding is not a promise of whole-editor or whole-grammar parity, and direct malformed-input handling has not been aligned with the server's structured 422 rejection.
- **Smallest test:** after the Grid merge, pair actual mapper bodies with the accepted D3 intent/membership/total contract, retaining separate authorization controls. The Grid-only tests are not execution credit for this composed prototype path; do not expand visibility-sensitive examples here.
- **Dependency / resolution:** preserve shared admitted meaning across API first pages, continuations and positional reads. Grid's parser/admission, exclusion and field repairs are complete under GRID-001/002/008/015. This Kupua item owns the remaining direct-parser divergence; it does not reopen those Grid fixes or grant broader parser-work approval.
- **Disposition: OPEN for remaining cross-mode syntax scope.** Substring-default insertion is removed from both adapters. Single-quote compatibility and wider grammar parity require a separate decision; direct mode's lack of per-user server authorization remains the existing prototype compromise, not a query-default guarantee.

### Independent Backlog: Parked

#### KUP-041
**API cancellation does not reach outgoing Elasticsearch reads**
- **Component / responsibility:** Kupua's API-backed read lifecycle across [browser signals](../../src/dal/grid-api-search-adapter.ts), [ordered-read controllers](../../../media-api/app/controllers/ImageQueryController.scala), and the [shared ES execution/client](../../../common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/ElasticSearchExecutions.scala). API integration ownership, with shared-client changes requiring explicit permission and review of other Grid consumers.
- **Trigger / actual:** a search, focus operation or aggregation is superseded, times out or loses its browser context after media-api has started an ES read. The browser request is aborted, but the Play action returns a Scala Future and the installed elastic4s `JavaClient.send(...): Unit` discards the Java REST client's `Cancellable` handle. No examined incoming-disconnect path cancels that upstream read. Independent frontend controllers and generation guards still protect current UI state; they do not establish backend resource release.
- **Expected direction, not a stronger guarantee:** explicitly own the lifetime of supported read-only API work and provide best-effort cancellation or a justified bounded-work alternative when its consumer disappears. Direct-to-ES mode has no intervening Play/Future boundary, but closing its browser request is not proof that every ES task immediately stops. Do not promise universal server cancellation or change accepted presentation semantics.
- **Evidence / limits:** [transport investigation and cancellation evidence](../experiments/es-transport/README.md#separate-issues-not-this-transport-diagnosis), 19 October. Captured focus reads continued until a roughly 30-second backend socket timeout after browser cancellation at about eight seconds. This demonstrates continued upstream request lifetime, not 22 seconds of proven ES computation. Aggregation cancellation was also present in passing campaigns, and no direct path from one aggregation abort to a different Java request was found. The facet-specific backend savings and production incidence are unmeasured. **This is not an established cause of PP3's incomplete-request failures.**
- **Smallest discriminator:** isolate the actual API/Future/client boundary with a held synthetic ES response, cancel the incoming consumer, and observe the outgoing handle/connection lifetime. Cover cancellation before dispatch, during send, while awaiting response, and after completion, plus an unrelated concurrent read and a successor using the same client. Mocked browser `signal.aborted` alone is insufficient. Preserve noncancelled success, refusal/error behavior, response compression, routing/authentication and stale-publication guards; verify callback cleanup and no shared-pool shutdown or cross-request cancellation.
- **20 October investigation:** [request-lifetime and performance-parity assessment](api-request-lifetime-and-performance-parity.md) inventories datasource operations, retained optimisations, Kahuna applicability and Scala boundaries. Its bounded authorized local-API browser follow-up reproduces equal-body facet replacement on hover/open and repeated suggestion reads during value typing, including already-completed reads. These establish client-side request-efficiency candidates, not measured backend savings. Server cancellation remains unproved and unfixed; no product implementation follows.
- **20 October S4a repair:** equivalent dispatched base-facet reads now survive hover/open handoff in Kupua; force refresh and changed-scope cancellation remain. See the [assessment's repair validation](api-request-lifetime-and-performance-parity.md#s4a-repair-validation-20-october). This removes the reproduced redundant client dispatch, not KUP-041's server-lifetime gap; S4b and KUP-040 remain separate work.
- **Scope decision before implementation:** identify an appropriate Play disconnect/cancellation hook and the narrow set of owned read operations; assess whether retaining client handles or a bounded alternative is worth the complexity. Exclude writes and unrelated legacy consumers by default. Do not add a global cancellation manager, retries, new failure UI or longer timeouts as substitutes. If upstream cancellation is supported, describe its actual boundary rather than infer ES task termination from a closed socket.
- **Dependency / disposition:** OPEN as an independent performance/resource-lifetime follow-up, recorded at operator request on 19 October. Not an initial API migration gate, a production incident claim, or permission to change shared/server code. Investigate and fix this scope separately from the unresolved transport failure.

#### KUP-044
**Kupua drops per-image resource capabilities, including `edits` and `crops` (extended 1 November)**
- **Component / owner:** Kupua API mapper ([`mapApiImageToImage`](../../src/dal/grid-api-search-adapter.ts#L53))
  and shared enriched-image/capability consumers; human owner-to-confirm.
- **Correction:** an earlier version of this entry said the new endpoints expose no write
  capabilities. That was wrong. `search-after`, `window` and `mget` build every hit through
  `hitToImageEntity` and `imageResponse.create`
  ([controller](../../../media-api/app/controllers/ImageQueryController.scala#L253)).
  Each hit therefore carries the same `links`/`actions` as `GET /images/:id` for Internal-tier
  callers: the `edits` link when the caller has write permission, `delete` when `canBeDeleted`
  (no usages or exports) holds *and* the caller is the uploader or has `DeleteImage`,
  `add-lease`, `add-collection`, `delete-usages` and others.
- **Original gap (client-only, image-level loss repaired below):** Kupua already retains per-image `actions` in enrichment for
  search/window pages *and* selection `mget`
  ([`extractEnrichment`](../../src/dal/grid-api-search-adapter.ts#L91),
  [mget](../../src/dal/grid-api-search-adapter.ts#L195)), so delete capability is available.
  `mapApiImageToImage` keeps only the media links (`optimised`, `optimisedPng`). It discards the
  `edits` link, which is the server's per-image edit permission, and normalization flattens the
  nested metadata resources' links, as [grid-api README](../../src/dal/grid-api/README.md)
  already warns.
- **Original related loss, not a second capability bug:** the validity-gated `crops` link and envelope
  URI were also discarded. Singleton URI is optional; `ui:image` points to Kahuna, not the
  media-api source. The image `crops` relation is not the crop-creation POST endpoint.
- **Selected shared direction (implemented below):** retain relevant resource links/URI,
  including `edits` and `crops`, alongside existing actions through the common normalizer
  and enriched view. Preserve guarded page publication, requested-ID-owned standalone
  enrichment and attached selection enrichment. Future edit UI may also need nested
  resource links. No Scala change is presently indicated. Keep the README rule:
  absence of an action is not permission to construct a write URL.
- **Related, no new endpoint needed:** convergence after a write can use existing
  `POST /images/count` with `ids` plus a predicate.
- **Performance coupling:** these links and actions are produced by the Argo envelope, the main
  per-request server cost (parity §8). Any lean browse writer must keep them.
- **Review and dependencies:** [Hosted rights and capabilities review](hosted-rights-and-capabilities-review.md)
  retains the source findings, UI ownership map, proposed boundary and open decisions.
  The operator selected image-level common wiring as step 1. KUP-047 can now consume
  those facts; KUP-045/046 are separate selectable repairs, not automatic prerequisites.
- **Repair / disposition (2 November):** DONE for image-level source URI and edits/crops
  link retention. `resource: { uri?, links }` follows existing search, standalone and
  attached-selection enrichment; authoritative empty links replace older capabilities.
  A failing-first extract/derive regression and amended real page/singleton/mget and
  hook-ownership tests cover retention, replacement and own-overlay priority. No transport,
  publication or media-link behavior changes. Nested write resources remain deferred to
  their actual consumers, not an implemented general envelope cache. The separate on-demand
  user-session helper retains only explicit permission flags and never grants image edit access.
  No writes, new endpoint, live-system verification or crop consumer activation follows.

#### KUP-045
**Lease summary has consumers but no current producer**
- **Component / owner:** shared enrichment/lease-display derivation, grid/table cost
  badges and multi-image cost summary; human owner-to-confirm.
- **Expected / actual:** the same returned active allow-use lease should have consistent
  lease presentation across these consumers. Badges and multi-cost use only
  `leasesSummary.hasActiveAllowLease`, but the current API extractor never supplies it.
  Single metadata falls back to returned lease records instead. Absence of the summary
  is not authoritative absence of a lease.
- **Evidence:** [extractor](../../src/dal/grid-api-search-adapter.ts#L87),
  [summary pass-through](../../src/lib/derive-enriched-image.ts#L114),
  [grid badge](../../src/components/ImageGrid.tsx#L394),
  [table badge](../../src/lib/field-registry.tsx#L387),
  [multi-cost](../../src/components/MultiImageMetadata.tsx#L339) and
  [single-image fallback](../../src/components/ImageMetadata.tsx#L223).
  The archived ownership matrix row 13 and P22 F7 record the same split;
  [review note](hosted-rights-and-capabilities-review.md#6-findings-and-review-dependency)
  reconciles it with current producers. No live rendered incidence was measured.
- **Smallest discriminating check:** feed a canonical API image with an allow-use lease
  through the real mapper/derive path and render the affected existing consumers.
  A manually injected `leasesSummary` fixture does not prove producer wiring.
- **Scope:** review a common display summary using the existing lease-date policy,
  not a new permission engine, server scalar or lease refresh system. Keep server
  validity/crop capabilities authoritative; a lease tint is not authorization.
- **Disposition:** OPEN, source-verified and awaiting review/composed regression.
  Independent shared-display work; not a crop-mock or API-migration gate.

#### KUP-046
**Known validity reasons replace server wording with local copy**
- **Component / owner:** ImageMetadata reason presentation; human owner-to-confirm.
- **Expected / actual:** supplied server custom descriptions should survive display,
  with local wording available when no description is supplied. The current renderer
  uses `VALIDITY_DESCRIPTIONS[key]` before the returned description, replacing server
  wording for recognized keys. The extractor/merge already retain the server strings.
- **Evidence:** [reason renderer](../../src/components/ImageMetadata.tsx#L293),
  [server custom description precedence](../../../media-api/app/lib/ImageExtras.scala#L79),
  and [archived B3 finding](zz%20Archive/runtime-configuration-and-data-sources.md#L511).
  Source-verified, not a measured production incident; see the
  [review note](hosted-rights-and-capabilities-review.md#6-findings-and-review-dependency).
- **Smallest discriminating check:** mount real metadata with a known key whose server
  description differs, an unknown key and local-only fallback. Explicitly choose empty
  description behavior. A stubbed detail metadata component cannot witness this.
- **Scope:** wording precedence only; no changes to valid/reasons membership, warning
  severity, server authorization, requests or direct-mode costing.
- **Disposition:** OPEN, review pending; the previously unselected B3 correction is now
  indexed, not approved for implementation or made a new migration prerequisite.

#### KUP-047
**Crop rights notices and server eligibility are not wired**
- **Component / owner:** crop presentation and its shared enriched-image handoff from
  detail; human owner-to-confirm.
- **Current state:** detail now hands its accepted enriched image to the editor, including
  standalone/deep-link ownership. Shared crop access gates preparation using existing
  validity, capability, deletion, freshness and session facts; no crop-only fetch or polling.
  Pay/Restricted use/Overquota notices survive fullscreen, and withheld preparation retains
  the frame. Requests remain displayed/logged only and are never submitted.
- **Evidence:** [crop handoff](../../src/components/ImageDetail.tsx#L696),
  [mock editor](../../src/components/crop/CropEditor.tsx#L35),
  [Kahuna notices](../../../kahuna/public/js/crop/view.html#L64) and the
  [shared research/review note](hosted-rights-and-capabilities-review.md).
- **Dependency / sequencing:** [KUP-044](#kup-044)'s image-level shared wiring is now
  implemented under the operator-approved read-only step 1. This crop consumer was
  separately selected for UI wiring. Use that shared path across search, detail and crop;
  do not add a crop-only API fetch, rights store or local permission calculation.
  KUP-045/046 are related, separately selectable shared repairs, not automatic gates.
- **Acceptance:** reuse server cost/restrictions and reviewed crop
  capability, including standalone/deep-link ownership; notices remain visible in
  normal and fullscreen layouts. Do not infer eligibility from cost, nonempty reasons,
  lease tint or EditMetadata alone. Choose explicitly whether ineligible images may
  still be framed in the read-only mock; the selected UI keeps the existing frame while
  disabling preparation when the shared creation checks withhold it.
- **Boundary:** creation/saving/export and all service writes remain out of scope.
  Keep current write guards. Direct-ES approximation is deferred with no added API
  calls. Mock cropping can be committed before this follow-up is selected.
- **Disposition:** RESOLVED at the disconnected UI boundary. Existing detail/editor suites
  cover notices, canonical source, withheld authority/session and preserved frame. This does
  not complete live crop creation, export readback/publication or external picking acceptance.

#### KUP-048
**Table column sizing updates shared state inside a React state updater**
- **Component / responsibility:** [column-sizing callback](../../src/components/ImageTable.tsx#L742)
  calls `setWidths(next)` inside `table.setState`'s updater. React can execute that
  updater during rendering, notifying another subscriber while rendering is active.
- **Observed behavior (5 November):** the existing
  [header double-click case](../../e2e/local/browser-history.spec.ts#L694) emits
  `Cannot update a component (ImageTable) while rendering a different component (ImageTable)`.
  The behavioral assertions still pass; they do not assert absence of this warning.
- **Causal check / limits:** reproduced in focused current-source and committed-HEAD
  controls for `search-store`, `useScrollEffects` and `useDataWindow`. Other worktree
  code and the toolchain were retained. The scrolling repair is not necessary for
  the warning; this does not date its first occurrence or quantify user-visible cost.
- **Next discriminator:** retain column-fit, resize persistence and semantic-sort
  assertions while checking that column sizing produces no render-time store write.
  Keep persistence out of the render-executed updater; do not silence the warning
  or change column-fit behavior merely to make the test green.
- **Disposition:** OPEN, separately scoped. No table implementation change has been
  made for this finding, and no connection to KUP-049 has been established.

#### KUP-049
**Detail Settings click times out after becoming actionable**
- **Component / responsibility:** [detail Settings interaction](../../e2e/local/ui-features.spec.ts#L379)
  and its browser action lifecycle; application versus automation ownership remains
  unestablished. [SettingsMenu](../../src/components/SettingsMenu.tsx) opens by toggling
  local React state. The failing action precedes entry into the crop editor.
- **Observed behavior (5 November):** one unretried full local E2E run timed out at
  the existing 10-second click deadline. The button was visible, enabled and stable;
  the trace stopped reporting action progress after `performing click action`.
  The failure snapshot showed Settings expanded and its menu visible, so input
  reached the application. Recorded frames and application logs have a roughly
  ten-second gap around the action, resuming near the timeout.
- **Evidence limits:** a browser/main-thread stall is a hypothesis, not an established
  cause. The same case passed in one focused current-source run and one focused run
  with the three scrolling modules loaded from committed HEAD. Neither reproduces
  the stall, proves it unrelated to scrolling or constitutes a fix. This is distinct
  from the repaired B8 setup-promise collection failure. The original full-run log
  and extracted trace observations were retained; subsequent normal test runs replaced
  the Playwright trace artifacts.
- **Next discriminator:** capture input dispatch/completion, main-thread responsiveness
  and relevant browser lifecycle events in this exact interaction. Preserve the
  existing action, deadline and menu/history assertions; no retries, forced clicks,
  timeout increase or passing-rerun acceptance. Do not infer causation from a coincident
  warning or broaden into crop-editor changes without evidence.
- **Disposition:** OPEN observed validation failure, cause unresolved. No Settings or
  crop implementation/test change was made. The full browser gate remains unaccepted;
  recording this item does not waive it or establish a production incident.

#### KUP-050
**Existing labels briefly display partial-membership styling after label submission**
- **Observed behavior (7 November):** during the operator-driven one-image local
  label trial, existing pills changed colour as though absent from part of the
  selection, then corrected when the new label rendered.
- **Evidence limits:** operator observation, not a captured frame sequence or proven
  cause. All additions/removals had acknowledged and observed receipts; local Grid
  confirmed exact restoration of the original labels. No persistence loss was observed.
- **Next discriminator:** reproduce one ordinary label addition while observing pill
  count/total props through submission and grouped publication. Preserve selection
  identity, pending-edit admission and the canonical observation contract; do not mask
  stale capability or unavailable states merely to stabilize colour.
- **Disposition:** OPEN, separate presentation follow-up. No implementation repair
  attempted and no shared-system reproduction authorized by this record.

#### KUP-051
**Subjects can be displayed and searched but cannot be edited in Kupua**
- **Observed gap (11 November):** Subjects renders searchable pills without the
  add/remove/apply-to-all preparation controls offered for Keywords and People.
  The operator requested this follow-up; it is not a claim of a Kahuna regression.
  [The field registry](../../src/lib/field-registry.tsx#L724) retains Subjects, but
  [the pill editor's field set](../../src/components/MetadataPillEditor.tsx#L10)
  excludes it.
- **Classification: KUP, not GRID.** The existing backend contract supports
  Subjects overrides. [ImageMetadata](../../../common-lib/src/main/scala/com/gu/mediaservice/model/ImageMetadata.scala#L27)
  includes `subjects: Option[List[String]]`, reads/writes its JSON representation
  and retains it when merging overrides, including an explicitly empty list.
  [metadata-editor's authorized handler](../../../metadata-editor/app/controllers/EditsController.scala#L155)
  accepts that model and serializes the full metadata map; its special filtering
  concerns configured domain metadata, not Subjects.
- **Persistence and publication evidence:** [EditsStore](../../../metadata-editor/app/lib/EditsStore.scala#L6)
  uses the shared [Dynamo map writer](../../../common-lib/src/main/scala/com/gu/mediaservice/lib/aws/DynamoDB.scala#L152),
  whose [JSON conversion](../../../common-lib/src/main/scala/com/gu/mediaservice/lib/aws/DynamoDB.scala#L229)
  supports string arrays as Dynamo lists without a Subjects exclusion.
  [Thrall](../../../thrall/app/lib/kinesis/MessageProcessor.scala#L140) applies
  the edits through [the metadata override operation](../../../thrall/app/lib/elasticsearch/ElasticSearch.scala#L242);
  [effective-metadata refresh](../../../thrall/app/lib/elasticsearch/ElasticSearch.scala#L766)
  overlays the full user metadata map onto original metadata without a field whitelist.
- **Evidence limits:** source-verified capability, not an authenticated live
  add/remove/clear round-trip or deployment certification. No write, backend
  change or edit activation was performed for this entry. Kahuna not exposing an
  editor does not imply missing persistence support.
- **Follow-up:** add the operator-approved Subjects preparation/editor workflow
  using existing owners; any save connection remains separately authorized.
  Preserve unrelated metadata overrides, server authorization, explicit mode
  safeguards and partial-selection semantics. A later authorized local trial
  should confirm add/remove/empty-list readback through the normal write path;
  existing [GRID-020](#grid-020) whole-override concurrency limits still apply.
- **Disposition:** OPEN Kupua editing gap. No new backend schema requirement or
  migration-wide gate identified; recording this item authorizes no implementation.

#### KUP-052
**Incidental keyboard input reveals focus rings after pointer interaction**
- **Observed behavior (11 November):** after clicking/tapping controls, Escape,
  Space, arrows and other keys can reveal a conspicuous focus outline, including
  metadata pencils, density buttons and Settings. The operator wants this removed
  without losing useful Tab/Shift+Tab navigation feedback. Screenshots establish
  the complaint, not a complete browser/device behavior matrix.
- **Source mechanism:** the [global CSS](../../src/index.css#L444) suppresses
  `:focus:not(:focus-visible)`, leaving browser focus-visible heuristics in charge.
  [Settings dismissal](../../src/components/SettingsMenu.tsx#L95),
  [metadata-editor dismissal](../../src/components/MetadataTextEditor.tsx#L76) and
  [focus-trap cleanup](../../src/hooks/useFocusTrap.ts#L24) restore DOM focus.
  Restoring focus is useful and must not be confused with requiring a visible ring.
  Selected/pressed state is also distinct: the active density and the keyboard's
  current target can be different controls.
- **Option A, CSS-only alternative indicator:** retain native focus-visible
  behavior, but replace rings on selected button families with a sufficiently
  distinguishable background/underline or other treatment. No input listener is
  needed, but incidental keys can still reveal the replacement indicator. Existing
  selected-state styling alone cannot identify an independently focused target;
  an app-wide design needs control-family review, not one universal background rule.
- **Option B, explicit visibility policy:** use a shared input/focus-navigation
  policy to show indicators for Tab/Shift+Tab and actual arrow-driven menu navigation,
  without letting typing, Space, Page Up or unrelated keys summon them. Whether
  dismissal/activation should hide an existing indicator, even after keyboard
  navigation, remains a UX decision. A small listener implementation can avoid
  polling, per-keystroke React updates and layout reads; this is not a measured
  performance result. Merely remembering pointer versus keyboard modality does
  not resolve the operator's concern about rings after keyboard-origin dismissal.
- **Option C, blanket suppression:** global outline/ring overrides are less work,
  but without an alternative visible keyboard-focus indicator they remove target
  feedback and fail WCAG 2.4.7 Focus Visible (AA). Do not misrepresent this as an
  accessibility-neutral cleanup or use blur to discard keyboard position.
- **Preservation and verification:** keep DOM focus restoration, Tab order,
  keyboard menu navigation, text-entry feedback and image/selection indicators.
  Compare pointer-open/dismiss, pointer-use followed by incidental keys, sequential
  Tab/Shift+Tab and real menu focus movement. Include unselected and already-selected
  controls so state is not mistaken for focus. Any final visual treatment needs UX
  judgment and representative browser checks; no solution or global timing claim
  has been approved by this entry.
- **Disposition:** OPEN UX/interaction issue, recorded for operator/UX review.
  No focus styling, listener or keyboard behavior was changed. This is not a
  backend defect or a migration-wide gate.

## Grid

### Independent Backlog: Parked

#### GRID-003
**Unknown syndication status escapes fallible parameter decoding**
- **Component / responsibility:** SyndicationStatus model and GET/POST parameter decoders; human owner-to-confirm.
- **Trigger:** an unknown status string reaches the shared lowercasing, non-exhaustive match.
- **Expected / actual:** invalid input should produce the selected controlled decoder outcome, not an uncaught MatchError. Direct mode's no-filter fallback and uppercase handling are different contracts, not automatically the desired fix.
- **Evidence / reproduction:** [model](../../../common-lib/src/main/scala/com/gu/mediaservice/model/SyndicationStatus.scala#L16), [P28 Q14][p28]; source-derived exception only. GET/D3 apps later became available, but invalid-status probing was not authorized or attempted. [Current blocker](bug-reproduction-evidence.md#permission-blocked-routes). No captured HTTP status or deployed incident.
- **Smallest test:** invalid GET/POST status with no ES call, plus valid lower/uppercase controls; agree error/casing policy before implementation.
- **Dependency / disposition:** parked independently. S2 can validate its own admitted values without an automatic global model/GET repair; unresolved coupling arises only if it delegates unsafe decoding unchanged.

#### GRID-004
**SQS batch entry failures are reported as successful backfill delivery**
- **Component / responsibility:** image-embedder backfill queue and caller accounting; human owner-to-confirm.
- **Trigger:** a successful HTTP SendMessageBatch response contains both Successful and Failed entries.
- **Expected / actual:** unsuccessful entries must remain explicit failed/retriable work, not be counted as delivered. The send helper discards the response and the caller reports the complete count sent.
- **Evidence / reproduction:** [send helper](../../../image-embedder-lambda/src/backfiller/embedderQueue.ts#L15), [P27 independent bugs][p27]; source-supported, no runtime/deployed reproduction. [Backend-only mixed-entry mock](bug-reproduction-evidence.md#non-browser-alternatives) remains unexecuted. Future resampling may recover an image; permanent loss is not proved.
- **Smallest test:** mixed success/failure mock in the existing queue test; require explicit failure or agreed failed-entry retry and honest caller accounting.
- **Dependency / disposition:** parked independent producer reliability bug. Existing read migration does not require backfill activation or complete corpus vectors; no S2-S10 blanket prerequisite or retry policy is approved.

#### GRID-005
**Narrow-image resize computes an invalid zero width**
- **Component / responsibility:** image-embedder resize policy; human owner-to-confirm.
- **Trigger:** a valid decodable 1 x 40,000 image is within byte limits but above the 30,000-pixel cap.
- **Expected / actual:** produce positive bounded dimensions or an explicit supported-eligibility rejection. The floored pixel-ratio width becomes zero and is passed to Sharp; item processing then treats decode/resize failure as retryable failure.
- **Evidence / reproduction:** [resize](../../../image-embedder-lambda/src/embedder/resizeImage.ts#L26), [P27 independent bugs][p27]; arithmetic/source inference only. [Local Sharp alternative](bug-reproduction-evidence.md#non-browser-alternatives) remains unexecuted; no asset generation/upload or prevalence claim.
- **Smallest test:** a tiny synthetic narrow image in the existing resize test, confirming current failure then a positive size within the cap. Width clamping alone can leave the pixel bound violated.
- **Dependency / disposition:** parked independent image-processing robustness work. No new image eligibility restriction, producer replacement or migration prerequisite is selected.

#### GRID-006
**Local imgops timestamp stripping tests the rotation parameter again**
- **Component / responsibility:** development imgops nginx configuration; human owner-to-confirm.
- **Trigger:** an upstream query includes a client timestamp cache-buster after rendition parameters have been stripped.
- **Expected / actual:** remove the timestamp while preserving upstream parameters. The map named for timestamp removal matches rotation again, so timestamp survives forwarding.
- **Evidence / reproduction:** [local nginx maps](../../../dev/imgops/nginx.conf#L16), [P26 C1][p26]; source defect for that input only. Required local nginx/capturing-upstream setup was neither authorized nor established. [Blocker](bug-reproduction-evidence.md#permission-blocked-routes). No nginx/S3 execution or observed signature rejection; Kupua imgproxy and deployed imgops cannot stand in for this local file.
- **Smallest test:** isolated local nginx and capturing mock upstream with synthetic non-secret parameters; assert only intended upstream fields survive.
- **Dependency / disposition:** parked local-development correction. Not a deployed delivery prerequisite unless the selected deployment actually reuses this configuration; do not alter production imgops by inference.

#### GRID-007
**Alamy cleanup reads only the first matching page before its operation**
- **Component / responsibility:** Alamy cleanup script's read/operation boundary; human owner-to-confirm.
- **Trigger:** one supplier reference has more than the default ten visible matching images.
- **Expected / actual:** collect all intended matches or explicitly reject incomplete input before proceeding. The script ignores next/total and consumes one page; later matches would be omitted.
- **Evidence / reproduction:** [P26 C2][p26] records the original `AlamyCleanUp.scala` read phase; that file is absent from the current checkout, so this is historical source evidence requiring revalidation of the current workflow, not a current-script certificate. [Read-phase pagination mock](bug-reproduction-evidence.md#non-browser-alternatives) remains unexecuted; no such live dataset or operational reproduction observed.
- **Smallest test:** mock two nested-Argo pages (10+1) and assert full read or explicit incompleteness before any operation. Never run the operational mutation loop to reproduce this.
- **Dependency / disposition:** parked independently and conditional on current use/cardinality. Owner-to-confirm must establish any enforced uniqueness invariant. Additive Kupua reads need not migrate this script or change shared GET page size.

#### GRID-009
**Syndication writes and publication do not share one awaited outcome**
- **Component / owner:** metadata-editor Syndication source/event composition; human owner-to-confirm.
- **Trigger / expected / actual:** delayed or failed syndication persistence/publication. Completion should include the owned source write and publication; set returns its store future while dropping the direct publish future, and delete drops the store future while returning publication. The outer photoshoot recomputation does not repair those detached outcomes.
- **Evidence:** P33-GRID-001; [set/delete and outer composition](../../../metadata-editor/app/lib/Syndication.scala#L28), [asynchronous publisher](../../../metadata-editor/app/lib/Syndication.scala#L164), [existing pure-helper tests](../../../metadata-editor/test/lib/SyndicationTest.scala#L12). High-confidence source defect, not executed or deployed incidence.
- **Smallest discriminator:** deferred mocked store/publisher outcomes, asserting source-before-publish and failure/completion propagation for set/delete plus photoshoot/no-photoshoot controls. Proposed, not run.
- **Dependency / disposition:** OPEN, independent Grid-only reliability defect. No present read-migration prerequisite; future editing must not assume these responses certify both stages. Distinct from Thrall's downstream [GRID-013](#grid-013).

#### GRID-010
**Reordered delete/undelete events can overwrite newer lifecycle state**
- **Component / owner:** Kinesis producer and Thrall soft-delete projection; human owner-to-confirm.
- **Trigger / expected / actual:** an older same-image lifecycle event is delivered after a newer one. Final state should follow the newer operation; random partition keys provide no per-image order and marker set/removal has no lifecycle-version guard. The root modification timestamp is not a guard around those mutations.
- **Evidence:** P33-GRID-002; [partition key](../../../common-lib/src/main/scala/com/gu/mediaservice/lib/aws/Kinesis.scala#L36), [marker scripts](../../../thrall/app/lib/elasticsearch/ElasticSearch.scala#L289), [root timestamp helper](../../../thrall/app/lib/elasticsearch/ElasticSearch.scala#L800). Medium-high-confidence source race, not observed delivery or a live incident. Keep any sensitive follow-up private.
- **Smallest discriminator:** isolated reversed old/new lifecycle messages with ordinary-order controls, checking final marker and operation ownership. Proposed, not run; no live deletion.
- **Dependency / disposition:** OPEN, independent Grid-only lifecycle defect. No migration interlock, snapshot, index-migration support or immediate repair is required for Kupua's current read-only scope.

#### GRID-011
**Collection removal can overwrite a concurrent membership change**
- **Component / owner:** collections image-membership controller/store; human owner-to-confirm.
- **Trigger / expected / actual:** removal reads a membership list, another add/remove completes, then the first removal replaces the list from its stale read. Removing one path should retain independently completed changes to other paths; unconditional list `SET` can lose them.
- **Evidence:** P33 section C1 (not included in its bug table), independently checked [read/filter/write](../../../collections/app/controllers/ImageCollectionsController.scala#L46) and [append versus replacement](../../../collections/app/store/ImageCollectionsStore.scala#L43). High-confidence source interleaving; [existing ES assertion](../../../thrall/test/lib/elasticsearch/ElasticSearchTest.scala#L217) tests replacement, not Dynamo concurrency.
- **Smallest discriminator:** deferred remove read, complete an add of a different path, then release the removal and assert the addition survives; ordinary removal/control alongside it. Proposed, not run.
- **Dependency / disposition:** OPEN, independent Grid-only lost-update defect, not the undecided tree-cascade policy and not a collection-wide transaction requirement. No change to current Kupua approximate counts or read migration. On 10 November the operator accepted this existing concurrency limitation for prototype editing; it must not silently disable the commissioned UI. No server repair or live write follows from that acceptance.

#### GRID-021
**Switching Grid to TEST can discard the local Elasticsearch index without `--clean`**
- **Component / responsibility:** Grid's development launcher and root Docker Compose Elasticsearch storage; engineer ownership and intended behavior to confirm.
- **Trigger:** populate local Grid, start Grid with `--use-TEST`, then return to local mode. The TEST branch removes the local Compose containers before using port 9200 for the TEST tunnel.
- **Expected / actual:** switching the backing environment should not silently discard a reusable local corpus unless that lifetime is intentional and documented. The launcher uses `docker compose down`, while the ES service has no data mount; removing its container therefore removes the index in its writable layer. Ordinary setup without `--clean` does not itself request this teardown, but cannot restore an already removed index.
- **Evidence / reproduction:** operator reported the corpus missing after local/TEST switching and setup without `--clean` on 11 November. [TEST teardown](../../../dev/script/start.sh#L109), [ES Compose definition](../../../docker-compose.yml#L2), [setup cleanup versus ordinary startup](../../../dev/script/setup.sh#L47). Read-only Docker inspection confirmed no `/usr/share/elasticsearch/data` mount in Grid's replacement container and no image-declared data volume in ES 8.18.3. The teardown was introduced by `b985df7662` (14 October 2022); the later ES8 Compose change updated the image tag, not storage. This is not evidence that losing developer data was an explicit design decision, nor that every historical image behaved identically.
- **Smallest check / engineer question:** in a disposable local fixture, distinguish container stop/start from removal/recreation and check whether a sentinel document survives. Should `--use-TEST` preserve local data, or is disposable local state intentional? Do not reproduce against a valued corpus or by connecting to shared TEST.
- **Disposition:** open engineer question; no Grid launcher/storage changes commissioned. Persistence or lifecycle changes require separate approval and would prevent future loss, not recover an already removed writable layer. Original image objects/backups were not assessed. Not a Kupua migration or transport-commit gate.

#### GRID-022
**Repeated crop saves regenerate shared assets and append duplicate export identities**
- **Component / owner:** cropper export processing/storage and Thrall export projection; Grid maintainer ownership and refresh policy to confirm.
- **Trigger / actual:** submit the same source and crop rectangle again. Ordinary crop UI blocks concurrent submission in one form, not a later identical save; a whole-image rectangle becomes a full-frame export. The service reruns source download, crop, metadata embedding, resizing and uploads. Crop IDs and output paths are based on bounds, and uploads overwrite those paths, while Thrall appends another export record without deduplicating by ID.
- **Evidence / limits:** on 12 November the operator reported creating another full frame through ordinary Kahuna UI for an image already having one. Read-only inspection found repeated full-frame records sharing one ID, specification and asset-path set but different saved times; Kahuna's reconstructed crop list displayed one group. Source: [submission guard](../../../kahuna/public/js/crop/controller.js#L209), [whole-image conversion](../../../cropper/app/model/ExportRequest.scala#L57), [identity](../../../common-lib/src/main/scala/com/gu/mediaservice/model/Crop.scala#L15), [processing and metadata embedding](../../../cropper/app/lib/Crops.scala#L34), [overwrite and bounds grouping](../../../cropper/app/lib/CropStore.scala#L16), [append script and deduplication TODO](../../../thrall/app/lib/elasticsearch/ElasticSearch.scala#L723). No agent crop submission, live fault exercise, resource-cost measurement or published-content damage was established. The actor does not identify whether a historical save used UI or automation.
- **Expected / decision:** duplicate search identities should not accumulate. Maintainers must separately decide when an existing export should be reused, have embedded metadata refreshed, or be regenerated because source metadata/output configuration changed. Repeated bounds alone do not prove that all effective inputs are unchanged; metadata-only refresh is not an agreed shortcut. Same-path overwrites mean this is not classified as benign without that review.
- **Smallest discriminator:** isolated repeated equivalent requests with mocked image processing/storage, plus duplicate export-message delivery into the existing projection suite; check stable identity, admitted processing work and projection cardinality. Include a source-metadata change before selecting reuse semantics. Proposed backend checks, not run.
- **Disposition:** OPEN, independent backend efficiency/idempotency finding, not a new Kupua browsing gate. Kupua filters repeated display identities locally using the newest save metadata and hides full-frame creation for already-covered images; neither changes stored data nor repairs export processing. Backend repair, asset refresh and live mutations require separate authorization.

#### GRID-023
**Potential improvement: explain unavailable saved crops instead of implying there are none**
- **Component / owner:** Kahuna image crop rail and Kupua saved-crop presentation; frontend UX ownership to confirm.
- **Current behaviour:** Kahuna loads saved crops through the advertised `crops` relation; without it the list does not populate, including a saved-crop deep link. Kupua preserves that boundary. An unavailable list can therefore look like a successful empty list. Missing relation is not itself evidence of a particular user permission failure: server validity also controls whether the relation is advertised.
- **Evidence / limits:** [governing UI reference](gradually-growing-teeth.kahuna-editing-ui-reference.md#58-cropping-full-frame-and-saved-results), [Kahuna list lookup](../../../kahuna/public/js/image/controller.js#L270), [server crop relation](../../../media-api/app/lib/ImageResponse.scala#L149), [Kupua access boundary](../../src/lib/crop/crop-policy.ts). Source-backed presentation concern and operator request, not a new live-system reproduction or an authorization defect.
- **Potential improvement:** show a restrained unavailable/disabled explanation distinct from a genuinely empty saved list. Greyed presentation is an option, not an approved design. Do not fetch or reveal withheld exports, infer a specific denial reason without authoritative facts, relax creation/selection policy or add polling.
- **Smallest acceptance check if selected:** distinguish an admitted empty list from a withheld list and from pending/failed data; keep Original inspectable and preserve the existing deep-link access boundary. Reuse existing detail fixtures without extra permission requests.
- **Disposition:** POTENTIAL IMPROVEMENT, independently parked; no implementation or policy change authorized by recording it.

#### GRID-020
**Metadata override replacement can lose a concurrent edit**
- **Component / owner:** metadata-editor override replacement contract; human owner-to-confirm.
- **Trigger / expected / actual:** two editors read the same override object, change different fields, then submit replacement objects. The later replacement can discard the other editor's field change. A fresh read immediately before saving reduces the window but cannot close it.
- **Evidence:** [metadata read and setter](../../../metadata-editor/app/controllers/EditsController.scala#L146) accept and write the metadata object without a request-level version condition. The existing [Step 8 contract](gradually-growing-teeth.kupua-edits-steps.md#step-8-editable-metadata-including-configured-domain-fields) already records the residual GET/PUT race. Source-level limitation, not a newly observed incident or a claim that unrelated label operations share the same contract.
- **Smallest discriminator:** isolated interleaved override reads and writes to different fields, asserting whether both survive. Proposed, not run; no live mutation.
- **Dependency / disposition:** OPEN; the operator explicitly accepts this existing limitation for the single-operator prototype (10 November). Preserve fresh reads and same-client serialization on hookup, but do not claim concurrent-editor protection or make a new conflict API a blanket UI gate. Any server repair remains separately authorized.

#### GRID-012
**Soft-delete acknowledgement is detached from status persistence/publication**
- **Component / owner:** media-api deleteImage; human owner-to-confirm.
- **Trigger / expected / actual:** status persistence or its publication fails/is pending after image admission. The action's returned future should account for its owned handoff; it starts `setStatus(...).map(publish)` inside an outer `map`, discards that future and returns `Accepted` immediately. This is earlier than P33's claimed persistence-and-publication completion, not merely eventual ES visibility.
- **Evidence:** coordinator correction to P33 section B; [controller](../../../media-api/app/controllers/MediaApi.scala#L370). High-confidence source defect only. Undelete's composed future and hard-delete's synchronous handoff are separate controls, not identical defects.
- **Smallest discriminator:** isolated controller with deferred/failed status store and publisher, asserting returned completion/failure and no premature success; no live data or delete call. Proposed, not run.
- **Dependency / disposition:** OPEN, independent Grid-only handoff reliability. Read-only migration unchanged; future editing cannot treat 202 as persistence proof. No general transaction guarantee proposed.

#### GRID-013
**Thrall syndication processing finishes before its ES update futures**
- **Component / owner:** Thrall MessageProcessor syndication consumer; human owner-to-confirm.
- **Trigger / expected / actual:** image lookup succeeds and a syndication ES update remains pending or fails. Processing completion/retry should include that update; `getImage(...).map` returns a list of futures as its value without sequencing them. The outer consumer can report completion and acknowledge while ES work is unresolved.
- **Evidence:** coordinator check of P33's actual syndication path; [consumer](../../../thrall/app/lib/kinesis/MessageProcessor.scala#L203), [acknowledgement](../../../thrall/app/lib/ThrallStreamProcessor.scala#L108), [ES method](../../../thrall/app/lib/elasticsearch/ElasticSearch.scala#L201). High-confidence source defect, no runtime failure or message-loss incidence claimed.
- **Smallest discriminator:** mock a successful lookup and deferred/failed ES futures; assert process completion remains pending/fails until the selected updates finish, retaining missing-image and successful controls. Proposed, not run.
- **Dependency / disposition:** OPEN, independent Grid-only consumer reliability, distinct from metadata-editor [GRID-009](#grid-009). No new retry policy, durable outbox or current read-migration prerequisite.

#### GRID-014
**`GET /images` ignores the `hasRightsAcquired` filter**
- **Component / owner:** media-api `SearchParams.apply(request)` (shared GET search parsing), including legacy AI and U9-A's future explicit-`aiQuery` branch; human owner-to-confirm.
- **Trigger / expected / actual:** either app supplies `hasRightsAcquired=true|false` in a manually constructed or external search URL. Legacy Kahuna GET and the future U9-A explicit-AI path ignore it, so membership, AI pool total and tickers are unfiltered. Ordinary Kupua POST reads and all other new image-query endpoints already honor the boolean through request bodies; direct-ES Kupua also honors it.
- **Evidence:** Kahuna [state param](../../../kahuna/public/js/search/index.js#L191), [results](../../../kahuna/public/js/search/results.js#L592), [API client](../../../kahuna/public/js/services/api/media-api.js#L63); Kupua retains the same URL field but neither app exposes a normal search control. The branch's [GET parsing](../../../media-api/app/lib/elasticsearch/ElasticSearchModel.scala#L748) deliberately passes `None`, while [body parsing](../../../media-api/app/lib/elasticsearch/ElasticSearchModel.scala#L578) and [filter construction](../../../media-api/app/lib/elasticsearch/QueryBuilder.scala#L180) support the field. The [ES test](../../../media-api/test/lib/elasticsearch/ElasticSearchTest.scala#L872) proves POST true/false filtering and GET non-effect, including mixed rights. No manually supplied URL usage or user impact is measured; this is a correctness/parity issue only.
- **History:** abandoned PR #4849 (commit `b52d027da`) fixed it on Kahuna's path as a side effect of making `GET /images` and D3 agree. That part was removed on 24 September (API build U2) rather than ported, because #4849 is being closed.
- **Smallest fix:** read the parameter once in shared `SearchParams.apply`, so ordinary GET, legacy AI and explicit-`aiQuery` AI receive the same value; avoid a U9-only branch. Flip the GET assertions and add explicit-AI omitted/true/false coverage while retaining the POST endpoints as controls. This needs its own Grid PR stating the Kahuna/Kupua URL-visible change.
- **Dependency / disposition:** OPEN, independent Grid-only fix. U9-A deliberately does not repair it, and U9-B accepts the media-api/direct-mode discrepancy for manually supplied URLs. It is not a migration or M2a prerequisite; if selected later, fix all shared GET modes together.

#### GRID-016
**Search results admit syndication images that single-image reads reject**
- **Component / owner:** media-api tier search filter and `MediaApi` search responses (AI and apparently ordinary GET); human owner-to-confirm. **Private maintainer/security triage** before additional reproduction detail or public issue.
- **Trigger / expected / actual:** a syndication-tier caller searches while an image has acquired rights and an allow lease but no syndication publication date. Single-image reads reject it (`isVisibleToAccessor` requires a past publication date); the search-side filter treats a missing date as allowed, and search responses apply no per-image check, so the image and its signed URLs can be returned.
- **Evidence:** [tier filter](../../../media-api/app/lib/elasticsearch/SyndicationFilter.scala#L75), [single-image rule](../../../media-api/app/controllers/MediaApi.scala#L172), [AI response](../../../media-api/app/controllers/MediaApi.scala#L659). U9-A cold-review source reading, repeated by the U9-B review; not executed, no deployed incident claimed. Whether a missing date is intended to mean "published" needs maintainer confirmation.
- **Smallest test:** syndication-tier search fixture with acquired rights, an allow lease and no publication date, for ordinary and AI search, plus past/future-date controls. Proposed, not run.
- **Dependency / disposition:** OPEN, independent Grid data-exposure fix, deliberately deferred (operator, 27 September). Make search and single-image visibility agree; assess before deployment serving users beyond TEST. GRID-015's separate repair does not resolve this rule mismatch.

#### GRID-017
**Kahuna startup dispatches a superseded probe before the effective default scope settles**
- **Component / responsibility:** Kahuna query/default initialization, search routing and counted-search admission; human owner-to-confirm. This is the legacy frontend counterpart to, not a reopening of, [KUP-039](#kup-039).
- **Trigger / expected / actual:** an initial search entry has no explicit rights flag and retained/default resolution subsequently selects all-rights. The first counted probe should use the resolved scope. In two recorded local controls with `showPaid=true` and `usePermissionsFilter=false`, bare entry first sent a free-only probe, then an all-rights probe; both completed, while the observed active display accepted all-rights metadata and one 90-row viewport. With the OFF default applied, the single bare-entry control sent only one free-only probe. This is a bounded startup finding, not duplication on every search or a failure of the intentional counted-probe-plus-viewport protocol.
- **Evidence / limits:** [L19 Kahuna startup controls](zz%20Archive/not-yet-another-audit-L19-network-measurmenets.md#kahuna-startup-scope-and-polling), 5 October at `31d5deda06844904991a9bccba419747ef765500`, used local Kahuna/media-api against operator-authorized TEST data. The report preserves permission, cache, instrumentation and sampled-publication limits; deployed revisions, exact controller ownership, server cost and user-visible speed-up were not established. PR #4710 was present and addressed a different routing-state defect; this is not evidence that it failed. The 12 October read-only assessment found the controlling source unchanged from that revision in the `grid` checkout; no new browser check or test was run. That comparison does not certify the separate `grid-pre-o3` checkout.
- **Source mechanism:** [results initialization](../../../kahuna/public/js/search/results.js#L312) starts the probe independently of [session/filter initialization](../../../kahuna/public/js/search/query.js#L683); the [request builder](../../../kahuna/public/js/search/results.js#L577) interprets absent `nonFree` as free-only. The session callback resolves retained rights/uploader state and calls the navigation helper. The [AI initialization watcher](../../../kahuna/public/js/search/query.js#L623) can also navigate before that callback completes. Waiting for the already-memoized [session promise](../../../kahuna/public/js/services/api/media-api.js#L101) alone does not establish that effective params and route corrections have settled. In legacy mode, absent `nonFree` also represents an intentional free-only selection, so filling every missing flag from `showPaid` would change behavior.
- **Proposed smallest repair, not implementation approval:** establish one explicit initial-default-resolution boundary before counted-search admission, keeping URL, controls and request scope aligned. Likely work is in [query initialization](../../../kahuna/public/js/search/query.js) and [search routing](../../../kahuna/public/js/search/index.js), with a results-admission change only if resolution cannot finish before controller construction: roughly two or three frontend production files plus regression tests, not a confirmed patch size. Preserve existing explicit-URL/retained-setting/default precedence and later deliberate free-only navigation. No backend, endpoint, cache or probe/viewport redesign appears necessary. Fixed delays, post-dispatch cancellation and request-only default substitution do not establish the required ordering.
- **Smallest discriminator / preservation:** hold session/default resolution pending through real initialization and its watcher passes; assert zero provisional counted probes, then one probe for the effective scope and the useful viewport read. Cover paid/free defaults, retained rights/uploader settings, explicit true/false, keyword-bearing entry, both filter modes, failure and newer navigation before resolution. Preserve settled filter actions, Home, history/detail return, position and useful total/ticker publication. Existing Kahuna helper unit tests and service-availability E2E do not prove this lifecycle. A bounded browser producer trace could select the exact coordination mechanism; it is not permission for a new live experiment or performance campaign.
- **Scope / disposition: OPEN, independently parked (12 October).** A universal one-probe guarantee across Home and normalization would require broader coordination: [Home navigation](../../../kahuna/public/js/search/index.js#L112), the [sort listener](../../../kahuna/public/js/components/gr-sort-control/gr-sort-control.tsx#L58) and [timed default reapplication](../../../kahuna/public/js/search/query.js#L187) have separate navigation roles. That larger repair, explicit-false normalization duplicates, retired-controller polling and empty-interval polling are excluded from this item. No code change, implementation authorization, production-incidence claim or Kupua migration gate follows.

#### GRID-018
**Upload dropped by a dynamic `fileMetadata` mapping conflict**
- **Component / owner:** ES image mapping (`fileMetadata.*` dynamic templates) and Thrall image
  indexing; human owner-to-confirm.
- **Trigger / expected / actual:** an uploaded file's XMP contains a key whose shape (scalar
  versus object) differs from the type fixed by the first document that introduced that key.
  Expected: the image is indexed, perhaps with the conflicting metadata omitted. Actual: ES
  rejects the whole document (`document_parsing_exception: object mapping for
  [fileMetadata.xmp.avm:Distance] tried to parse field [null] as object, but found a concrete
  value`). Thrall makes two attempts and then logs `message will be ignored`. The image stays
  out of search, and its embedding update then fails with `ElasticNotFoundException`.
- **Evidence:** PROD Kibana, 30 October 2026, operator-run. There were five `ImageMessage`
  failures for four images and four `UpdateEmbeddingMessage` failures for the same IDs:
  `cc8fc914d8f1694675952618c0ef500e94af6297`, `9a4865f934301c5d37572a97d24204bfaa420cc7`,
  `8533a736cfe90dafa756b2c4145718a68ec0754c`, `4fb77af82701f5c286500093e51420d636f620ac`.
  Mechanism: [dynamic templates](../../../common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/Mappings.scala#L14),
  [drop after retry](../../../thrall/app/lib/kinesis/ThrallEventConsumer.scala#L36). These were
  the only drops in the 10-day window apart from their embedding consequences.
- **Smallest discriminator:** index two fixture documents with `fileMetadata.xmp.<key>` as an
  object, then as a scalar, against the production mapping; assert the second is accepted. Proposed, not run.
- **Candidate fixes (not approved):** normalize XMP values to one shape in image-loader, or map
  `fileMetadata.xmp` as `flattened`/non-indexed. On a parse error, retry once with the offending
  subtree stripped rather than dropping the image. Alert on `message will be ignored`.
  Reingestion currently fails the same way.
- **Disposition:** OPEN, independent Grid ingest reliability. Not a Kupua migration gate.

#### GRID-019
**`Edits` DynamoDB table at a fixed 20 WCU with auto-scaling off**
- **Component / owner:** metadata-editor `Edits` table capacity (infrastructure); human owner-to-confirm.
- **Facts (operator-read, PROD, 31 October 2026):** provisioned at 20 RCU/20 WCU with auto-scaling
  off; the `Photoshoots` GSI is 4/4, also off. There are about 6.68M items in 1.7 GB (about 250
  bytes each, so 1 WCU per edit). No throttling appeared in the two-week metric window.
- **Risk:** sustained capacity is 20 edits/s for the whole organisation. Burst credit (about
  300 s of unused capacity) absorbs roughly 3,000–7,500 writes from a 30-way client batch. After
  that, writes throttle for **all** users, not only the batch. Batch photoshoot edits are capped
  by the 4 WCU GSI, whose throttling also blocks base-table writes. Kahuna batches, hand-run
  scripts (for example `SupplierCleanUp` at 50-way concurrency) and any future Kupua batch share
  this ceiling.
- **Smallest fix (proposal):** on-demand capacity, or auto-scaling with a sensible maximum, for
  the table and the GSI. The cost is a few dollars a month at current volume
  ([batch editing at scale §11](batch-editing-at-scale.md#11-costs)).
- **Disposition:** OPEN, independent operational capacity risk; precondition for any batch write
  feature. Not a code defect.

Cross-component raw default intent is canonical at [KUP-011](#kup-011), not duplicated here.
Cross-layer recovery is canonical at [KUP-010](#kup-010), distinct from the legacy GET policy finding.

## Completed, Excluded and Decision-Only Records

- **P32/P33 coordinator dispositions, 23 September:** originals are preserved at [P32][p32] and
  [P33][p33]. P32-A2/B1/B3/C1/C2 map to KUP-028/029/030/031/032 with the narrower triggers above.
  P33-GRID-001/002 map to GRID-009/010; section C1's lost-update mechanism is GRID-011;
  independent corrections to the claimed soft-delete/Thrall completion boundaries are GRID-012/013.
  These are source-supported findings, not new executions, assigned fixes or changes to existing IDs.
- **P32-A1 mandatory-UTC defect framing rejected.** [DateFilter](../../src/components/DateFilter.tsx#L329)
  explicitly serializes local calendar instants; [the builder](../../src/dal/es-adapter.ts#L457)
  normalizes date-only strings to UTC midnight and passes timestamp strings unchanged. They are
  different inputs, not a proved contradiction. Preserve exclusivity and separate inclusive CQL
  usage dates. Local-day versus UTC-day picker policy and exact end-of-day inclusion require a
  product decision before any change; no canonical bug ID or automatic UTC conversion requirement.
- **P32-B2 qualified as existing freshness policy, not a new defect.** Stable-reference memoization
  and one-shot quota state are source facts; a required periodic/clock invalidation boundary is not
  established. Retain the existing quota/lease-clock question without an ID, timer, subscription,
  per-image fetch or performance concession. Decide whether startup quota arrival or a lease boundary
  must update already-mounted cells before proposing the corresponding mounted check.
- **P33-GRID-003 stays unresolved/private.** Source admission and advertised capability differ;
  the intended permission contract needs maintainer/security confirmation before a defect ID or
  expanded reproduction. No probe or disclosure established. Existing GRID-002 is not this write
  question and remains unchanged. P33-GRID-004/005 are decision-only: whether tree removal cascades
  and whether membership may reference a missing/invalid tree path; neither is a proved defect.
- **S1 is done, not reopened.** Accepted commit `61f4b0f2c5c006f78ddfc527cae4d73e9fd9a5b0`
  fixed valid canonical edits/file-metadata normalization and alias typing/display conversion.
  [Candidate section 7][candidate] retains its actual failing-first, unit/build/local-E2E and cold-review
  evidence. E054 is superseded within that scope; no broader legacy-data guarantee follows.
- **Refuted query claims are not active bugs:** top-level exclusivity versus inclusive CQL compares
  different inputs; term/phrase JSON alone does not prove keyword platform/status drift; legacy GET
  sort direction is not current Option-B A/B drift; dormant/current-hybrid-AI differences are not
  automatic query defects. [P28][p28] retains the concrete technical dispositions.
- **Other refutations:** no active-service projection-host defect was established in P26; optimized
  TIFF handling and deliberate vector-prefix dimensions refute the corresponding blanket P27 suspicions.
- **Later dispositions supersede P30/P31 proposals:** the submitted Grid repair intentionally replaces
  grouped usage negatives with independent exclusions, preserves positive same-record matching and
  includes selected print code/name fields with alias-preserving orderedBy fallback. Prototype issue
  IDs remain open until their actual alignment/acceptance; no new ID or whole-ID refutation follows.
  KUP-024/025 are now repaired within current-client scope, including selected-work ownership and the
  specifically accepted measured trade-off. Original reports remain unchanged. No runtime restore loop
  or separate speculative-error defect is inferred; completed bounded repairs do not establish wider guarantees.
- **Unimplemented capabilities are not bugs:** new endpoints/PIT admission, pre-import bootstrap,
  deployed health, rendition renewal and API-only datasource wiring remain candidate work. Missing
  tests alone, current vector coverage, no declared periodic backfill rule and unselected hosting
  infrastructure are not new defect entries.
- **Policy/improvement questions stay separate:** identifier/fuzzy settings, calendar/unknown-name
  admission, ID whitespace/storage assumptions, accepted live drift/approximate presentation, range
  walk versus total-selection limits, optional-service absence, retained ordinary-facet presentation,
  overlay TTL/LRU/provenance and quota/lease-clock freshness need their own explicit contracts.
  No general fuzzy-search, stronger-failure-policy, snapshot or performance concession is approved
  by this record; the bounded restore trade-off above was separately accepted.
- **Performance investigations remain evidence, not invented bug causes.** Existing jank and traversal
  records retain topology/scenario/cache limits; this document does not turn request counts, cache
  growth or a possible optimization into an observed regression or commission a new campaign.
- **D033 stays separate and nonblocking.** The approved external credential arrangement is not a bug.
  Its wording/operational questions remain in the existing dependency record; no credential access,
  setup change or repair is authorized. Completed review-tooling repairs are not open product bugs.

## Fix Grouping Assessment

The assessment below preceded the authorized KUP-001/002 implementation. Those two local fixes are
now DONE, tested, cold-reviewed, operator-accepted and committed together as `ff932f302` at the
operator's request; no shared cancellation abstraction was needed. KUP-024/025's separately authorized
bounded repairs are also DONE, with their measured conditional-rank trade-off accepted. KUP-014/015/016/019
are now DONE as separately owned current-client repairs; their records above retain validation limits.
Other families and migrated-consumer integration gates remain unchanged.

20 September: bounded source and test inspection, not implementation approval or new behavioral
execution. These four families answer the shared-fix question; they are not a new audit of all 35
entries. Share a mechanism only when its owner, lifetime and invalidation rule actually agree.

| Family | Existing ownership and reusable mechanism | Grouping decision |
| --- | --- | --- |
| KUP-001/002: selection publication | Normal [membership actions](../../src/stores/selection-store.ts#L352) replace the selected Set; [metadata completion](../../src/stores/selection-store.ts#L529) retains it. `generationCounter` also advances on metadata/reconciliation and is a selector key, not a membership-only token. The [single route-owned range hook](../../src/routes/search.tsx#L63) already has its own [generation/controller](../../src/hooks/useRangeSelection.ts#L85). | **Recommended first bounded batch.** Reuse a selection-context validity rule where possible, but hydration omission/anchor/toast publication and range query/order/cancellation/busy finalization remain distinct. Captured Set identity is a cheap candidate, not an approved rule for every mid-flight gesture; do not add a global cancellation manager. |
| KUP-024/025: restore correctness | Both use [restoreAroundCursor](../../src/stores/search-store.ts#L3842), existing search/range ownership and centred geometry. [P31][p31]'s total predicate and local tuple selection are now implemented. | **DONE as separable fixes:** KUP-024 adds no request; KUP-025 adds one conditional rank whose observed cost the operator separately accepted. No geometry rewrite, global owner or wider migration followed. |
| KUP-014/015/016/019: superseded navigation | [SearchBar](../../src/components/SearchBar.tsx#L78) and [header](../../src/components/ImageTable.tsx#L1146) own different timers; [Home](../../src/lib/reset-to-home.ts#L131) owns a post-await navigation; [indexed scroll](../../src/hooks/useDataWindow.ts#L413) owns a timer; [traversal](../../src/hooks/useImageTraversal.ts#L189) owns a pending direction against the current image. | Share the invariant that obsolete actions cannot redirect newer intent, **not one universal clock or controller**. Characterize each originating entry/search/image lifetime before extracting a callback guard. Do not create a broad navigation rewrite or include these in the selection batch. |
| KUP-004: standalone detail identity | [ImageDetail](../../src/components/ImageDetail.tsx#L238) now binds accepted data/absence/loading to the requested identity as well as cancelling obsolete callbacks. | **DONE** as a separate identity-bound correction, without a request manager or whole-detail remount. KUP-021 media fallback has a different cause and stays separate. |

### First Batch Boundaries

- Start KUP-001/002 with deferred regressions proving clear/newer work wins and ordinary completion
  still works. Preserve legitimate late metadata caching and reconciliation of the current selection;
  stale omission repair must not restore membership, change a newer anchor or consume its toast dedup.
- Range validity additionally needs current request, mounted owner and search/order scope. The
  [selection survival contract](00%20Architecture%20and%20philosophy/05-selections.md#L143) preserves
  selected IDs across sort/detail/density changes; query/order invalidation of a pending range must
  not clear that selection. Do not broaden ordinary add/remove cancellation policy without a stated
  test expectation and operator decision where the existing contract is ambiguous.
- Prefer an existing membership/context signal or small owner-local guard over another counter or
  shared module. Any new signal must explain why current Set identity, search scope and range refs
  are insufficient. Metadata revision and display/reconciliation generation are not substitutes.
- Preserve [metadata revision/dedup tests](../../src/stores/selection-store.test.ts#L433),
  [current hydration/anchor tests](../../src/stores/selection-store.test.ts#L499) and
  [coalesced reconciliation](../../src/stores/selection-store.test.ts#L645). The current
  [range test file](../../src/hooks/useRangeSelection.test.ts#L1) tests only the pure in-buffer helper;
  add actual mounted-hook deferred cases there rather than claiming it already covers cancellation.
  Retain desktop/mobile selection E2E behavior. No existing success assertion is preapproved to weaken.
- No extra read, retry, serial network dependency, per-frame work, eager cache scan or persistence
  payload is justified by these ownership fixes. Keep synchronous cached selection and the in-buffer
  range path. These are proposed structural budgets, not measured performance guarantees.
- KUP-003 ordering/retry and KUP-012 reconciliation are neighboring preservation context, not automatic
  repair scope. If the two selected fixes cannot share a clean validity mechanism, keep local fixes
  separable; do not extract an abstraction merely to make the batch look unified. If an essential
  interaction policy remains unclear, ask before changing it; KUP-004 is the simpler independent fallback.

### Completion Recording

Use one **DONE** status for a completed bounded repair, with its verification and important limits.
Otherwise name the concrete unresolved issue; do not create a completion-status ladder. Record actual
commit hashes only after separately authorized commits. No automatic staging or commit follows.

| Record | Required update after an authorized fix |
| --- | --- |
| This backlog, repaired IDs | Amend current evidence and disposition, linking the regression and exact fixed scope. Preserve stable IDs, historical browser limits and any remaining variants; do not append a contradictory second status. |
| [Reproduction evidence](bug-reproduction-evidence.md) | Add a compact automated-regression/post-fix acceptance result and test location to the relevant cases; reconcile the outcome index without erasing the original reproduction or claiming a new browser run. Keep detailed validation/cold-review results here rather than in the changelog. |
| [Changelog](changelog.md) | Add the implementation/fix and rationale under the current phase immediately after its instruction comment. Follow its native format: no routine pass counts, timing tables or session narrative. |
| [AGENTS](../../AGENTS.md) and [selection guide](00%20Architecture%20and%20philosophy/05-selections.md) | Record an actual new ownership rule/state contract where introduced; retain selection survival, cache reuse and performance invariants. Keep AGENTS lean and avoid unrelated guide cleanup. |
| [Candidate 11][candidate] and [active API index](03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/media-api-00-index.md) | Coordinate current-status/gate amendments with their owner. A fixed client race is not S3b/S6b implementation, API-only completion or acceptance of future omission policy. Change only statements made stale by the fix; historical reports/P30/P31 remain intact. |
| [Evidence 07][evidence] and [coverage 06](03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-06-coverage.json) | Coordinator-owned: provide exact changed-path and qualification requests. E077 mixes hydration ownership with future omission semantics; E078 also covers KUP-003 retry and failure presentation. Qualify only the fixed parts, not the whole claims. Preserve historical receipts; changed fingerprints do not mean whole-file verification or global dependency closure. E055's unchanged datasource/failure contract may need only source revalidation. |
| [Session worklog](worklog-current.md) and final handoff | Record actual checks, cold-review findings/resolution, acceptance state, pending coordinator updates and final commit reference when one exists. Preserve other sessions' notes; never stage the active log or invent a commit hash. |

The fresh agent must report outstanding documentation-owner actions explicitly. Inspect pre-existing
staged/unstaged work before editing. Stage only approved fix hunks after operator approval; if a required
record is untracked or inseparable from unrelated changes, ask how to handle it rather than including
the whole research document. Completion recording must not become an unrelated project-wide commit.

## Handoff

**P32/P33 addition, 23 September:** bounded source characterization is integrated with the explicit
corrections above and candidate section 14. Ten new source-only IDs are parked independently; the
original 35 IDs and all their execution/completion states remain intact. No future editing slice,
product fix, metric rewrite or new measurement is authorized. The reproduction evidence file remains
the historical 35-ID record, not execution evidence for these additions.

**Current handoff, 27 September:** KUP-013's reproduced reverse keyboard Home -> resident End race
is repaired at the existing edge-intent boundary, and KUP-028/031/032 are complete at their bounded
date-presentation and measurement-contract scopes. Their entries above retain execution, review and
verification limits. No migration implementation, Grid fix, campaign, deferred display repair or
additional bug selection follows. Those repairs are committed as `2875bec44`, `c0a5ff76f` and
`ace53ac75`. The later KUP-029 refutation and KUP-030 real-route retention evidence are documentation
only and remain unstaged pending operator review.

**Historical handoff, 23 September:** Batch A/B's bounded outcomes and coordinator requests were integrated
into existing 06/07, candidate/index and current routing, without repeating the earlier reconciliation.
All 35 IDs, original reports and execution histories remain. The completed End-initiated repair does
not at that time close the controlled-live-data reproduced reverse keyboard Home -> resident End case
under KUP-013; its remote stage was not independently reidentified. CQL current cache callbacks were
repaired, but first-registration datasource/API-only initialization remains unresolved. Saved-density,
original-return and cross-preview centering repairs retain no-saved fallback, pre-native-entry,
physical Esc/macOS and broader availability/API/deployment limits; uncertified does not mean known broken.
PR #4957's documented pending review/merge and prototype separation are unchanged. Neither batch ran
a new performance campaign or explains/resolves PP6c/P8; the specifically accepted restore trade-off
remains separately bounded. Everything stays unstaged; no next fix, audit, upstream or Git action follows.

[candidate]: 03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-11-candidate-plan.md#L1
[evidence]: 03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-07-evidence.json#L1
[r04]: 03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-04-reconciled-recommendation.md#L25
[p18]: 03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-09-p18-history-identity.md#L1
[p19]: 03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-09-p19-position-interaction.md#L1
[p20]: 03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-09-p20-detail-traversal.md#L1
[p21]: 03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-09-p21-selection-collections.md#L1
[p22]: 03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-09-p22-query-ui-owners.md#L1
[p23]: 03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-09-p23-query-mapping-s1.md#L1
[p25]: 03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-09-p25-delivery-satellites.md#L1
[p26]: 03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-09-p26-configuration-evidence.md#L1
[p27]: 03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-09-p27-ai-producer-build.md#L1
[p28]: 03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-09-p28-concrete-query-discrepancies.md#L20
[p29]: 03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-12-plan-challenge.md#L1
[p30]: 03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-09-p30-common-admission-d3-design.md#L1
[p31]: 03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-09-p31-restore-correctness-design.md#L1
[p32]: 03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-09-p32-kupua-interaction-and-measurement-contracts.md#L1
[p33]: 03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-09-p33-grid-edit-delete-collection-lifecycles.md#L1