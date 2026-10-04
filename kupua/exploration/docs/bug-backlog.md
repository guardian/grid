# Bug Backlog: Kupua and Grid

Documentation consolidated 20 September 2026; usage-search status updated 22 September for [Grid PR #4957](https://github.com/guardian/grid/pull/4957), awaiting human review/merge. P30 remains historical design evidence; P31's separately completed current-client restore repairs retain their existing scope.
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

**Current recorded status: 3 October 2026.** The 19 entries below have an open defect,
approval/integration/review task or explicit residual; 35 additional IDs have completed bounded repairs or verification.
A remaining task does not undo a completed sub-fix. Source-only findings still need their proposed
discriminating checks; they are not observed production incidents. PR status is as last documented,
not a fresh remote check. Update this overview when a detailed disposition changes.

**Operator scheduling decision, 23 September:** KUP-029/030 were deferred until after a working
API-backed app. Post-U6z evidence now refutes KUP-029's independent ordinary-path premise while
KUP-030 remains evidenced but is owned by U9 AI convergence, not a separate repair. Neither blocks
query alignment, core search/scroll/position/traversal or initial image-read integration.
Authorization and data-protection obligations remain.

**Operator amendment, 26 September:** the active API build plan now scopes U6z to non-AI
media-api coverage, including recovery. Existing AI is the sole deliberate ES exception pending
team agreement; M1 is accepted. KUP-010/026 closure must name the demonstrated boundary, not
claim absolute API-only completion. Reassess KUP-030 without changing selection enrichment or
silently broadening its deferred display-repair scope. KUP-033 is DONE as an independent pitstop.
KUP-034 and KUP-036 are DONE as separate repairs. U6z now verifies non-AI routing and recovery
without a production change; KUP-010/026's demonstrated scopes are closed below. KUP-030 retains
a real-route same-ID AI overlay-lifetime residual; effective-value divergence remains synthetic
and rendered divergence is unproved. The
operator reported U6z's cold review clean. **U9-B (27 September)** closed KUP-030: accepted AI
publication now replaces the enrichment map with the current result's own overlay.

**Migration relevance:** a prerequisite blocks its named slice's acceptance, not all migration work.
Related obligations matter to the selected integration but do not automatically mandate a standalone
repair. Independent work has no current migration gate; unresolved coupling needs a scoped decision.
The detailed entries below remain authoritative for evidence, permissions and limits.

### Open Kupua Work and Residuals

| ID | Topic | Current status | Migration relevance |
| --- | --- | --- | --- |
| [KUP-011](#kup-011) | Parsed intent versus automatic defaults | Open; Grid replaced-intent subset in PR #4957, prototype alignment outstanding | Prerequisite: S2 admitted query meaning |
| [KUP-035](#kup-035) | Full selection reconcile blocks one frame | Open; measured by P19 in both modes (about 320 ms task at 1,000 images) | Independent client performance; not caused by media-api |
| [KUP-037](#kup-037) | Collection badges silently use the free-only default scope | Open; source and recorded API body confirm both modes agree | Independent count/label correctness; not an M2a routing gate |

KUP-038 is closed against the ledger's completed B8/L37/B17 repairs, not a new fix.
KUP-011/035/037 have no closure evidence from continuity work and remain separately scoped.

### Open Grid Work

| ID | Topic | Current status | Migration relevance |
| --- | --- | --- | --- |
| [GRID-001](#grid-001) | Usage exclusions weaken one another | PR #4957 locally validated; human review/merge and prototype integration pending | Prerequisite: S2 shared membership |
| [GRID-008](#grid-008) | Print usage field resolution | PR #4957 locally validated; human review/merge and prototype integration pending | Prerequisite: S2 mapped-field support |
| [GRID-002](#grid-002) | Legacy deleted-read admission | Human/private assessment pending; source-only | Independent legacy GET issue; reassess if that admission is reused |
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
| [GRID-015](#grid-015) | AI search skips deleted-search admission | Open; source-only, confirmed by two U9-A reviews; private triage | Independent Grid authorization fix; blocks no local unit, must be assessed before deployment beyond TEST |
| [GRID-016](#grid-016) | Search results use a weaker syndication visibility rule than single-image reads | Open; source-only (U9-A cold review); private triage | Independent Grid data-exposure fix; same deployment caveat as GRID-015 |

<details>
<summary>Completed bounded repairs and verification: 35 other IDs</summary>

| Group | Completed IDs |
| --- | --- |
| Selection, detail, AI, facets, polling and maps | [KUP-001](#kup-001), [KUP-002](#kup-002), [KUP-003](#kup-003), [KUP-004](#kup-004), [KUP-005](#kup-005), [KUP-006](#kup-006), [KUP-007](#kup-007), [KUP-008](#kup-008), [KUP-009](#kup-009) |
| Scalar accounting, prefetch, fallback and query handling | [KUP-012](#kup-012), [KUP-020](#kup-020), [KUP-021](#kup-021), [KUP-022](#kup-022), [KUP-023](#kup-023) |
| Input, Home, indexed timer and pending traversal | [KUP-014](#kup-014), [KUP-015](#kup-015), [KUP-016](#kup-016), [KUP-019](#kup-019) |
| Saved density, original detail return and cross-preview centering | [KUP-017](#kup-017), [KUP-018](#kup-018), [KUP-027](#kup-027) |
| Restore coordinates and selected-tuple rank | [KUP-024](#kup-024), [KUP-025](#kup-025) |
| Backward null-boundary crossing | [KUP-033](#kup-033) |
| Near-top centred paging | [KUP-034](#kup-034) |
| Explicitly incomplete API image pages | [KUP-036](#kup-036) |
| Non-AI API recovery and fixed-mode CQL initialization, closed by U6z verification | [KUP-010](#kup-010), [KUP-026](#kup-026) |
| Date recovery, measurement trust and latest keyboard-edge ownership | [KUP-013](#kup-013), [KUP-028](#kup-028), [KUP-031](#kup-031), [KUP-032](#kup-032) |
| Post-U6z ordinary effective-rights mismatch refuted | [KUP-029](#kup-029) |
| Same-ID AI overlay retention, closed by U9-B replacement | [KUP-030](#kup-030) |
| Search discovery versus density/keyboard browsing, covered by ledger B8/L37/B17 | [KUP-038](#kup-038) |

DONE refers to the repaired or verified scope, not every adjacent behavior or future API acceptance.
In particular, no-saved density fallback and wider native-fullscreen timing remain uncertified,
not automatically known bugs. S1 normalization is complete and is not one of these bug IDs.

#### KUP-010
**Restore recovery can bypass the intended refusal boundary (E017)**
- **Historical finding:** a refusal in the former transitional hybrid adapter could reach another store operation whose dispatch chose ES. P18 F3 / E017 was qualified source inference, not observed unauthorized access, a deployed incident or an exploit demonstration. The earlier [permission boundary](bug-reproduction-evidence.md#permission-blocked-routes) remains historical; expanded security investigation still requires private maintainer triage.
- **Why closed now:** U5 removed the ordinary page fallback and U6a-d migrated the remaining non-AI methods. The current `ApiDataSource` has no non-AI ES rescue. Legitimate recovery through another admitted API read remains supported; no new refusal policy or store repair is needed.
- **Executed evidence (U6z, 26 September):** [real store/adapter/mapper tests](../../src/stores/search-store-api-mode.test.ts) cover refusal, unavailable transport and 503 incomplete execution during search, seek and restore rank/target/forward/backward reads, successful and failed follow-up API windows, empty-target success and superseding searches. They assert final buffers, coordinates, errors, publication ownership and zero non-AI delegation. Deliberate wrong results fail the checks and are removed. Unit/build/direct-ES E2E gates, bounded ordinary API browsing and operator-reported API dry-run preflights passed; [the build plan](03%20Ce%20n'est%20pas%20une%20pipe%20dream/api-build/api-build-00-plan.md) records the evidence and limits.
- **Disposition: CLOSED by verification (26 September).** The boundary is the current application's non-AI media-api-mode recovery, not absolute API-only operation: `searchByAi` remains the sole deliberate ES delegation. No runtime datasource switching, historical security-triage closure, live refusal probing or new authorization guarantee is claimed. U6z changes tests only; existing recovery behavior is preserved.

#### KUP-026
**CQL remount can retain the first resolver's callbacks and datasource**
- **Historical repair:** the once-registered resolver retained wrapper-owned cache callbacks after Home/Clear unmounted that wrapper. The 20 September mounted reproduction and [bounded repair evidence](bug-reproduction-evidence.md#bounded-client-repairs-kup-022023026012020021) remain valid. Commit `384855da3` (22 September) fixed cache callbacks with live-store getters; it did not implement datasource rebinding.
- **Why closed now:** the mode is selected before app/store initialization and does not change during that app lifetime. The first CQL registration therefore captures the correct API datasource. Its continued use after a wrapper remount is valid; no rebinding feature or additional production repair is needed.
- **Executed evidence (U6z, 26 September):** [cold-start tests](../../src/main.test.tsx) execute real main-module initialization with API mode selected before imports, preserving the first real CQL registration across keyed wrapper remounts. Cold registered, alias and dotted-field suggestions assert returned values/counts and API requests; cache counts change between remounts. The top-level app render is held back in this unit fixture. The fully mounted browser separately exercised cold credit/alias/dotted suggestions and current `is:` counts through Clear -> Home -> Clear in one document, with the same registered constructor and no ES traffic. The deliberate wrong aggregation route failed the tests before restoration; full gates and operator API preflights passed.
- **Disposition: CLOSED for fixed-mode API initialization and remounts (26 September).** Together with the earlier callback repair, no current demonstrated defect remains in this scope. Registration is still first-datasource-bound; runtime switching is neither supported nor certified. This is not proof of every resolver's backend policy, every failure combination or eventual removal of AI's ES dependency.

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
| S2 admitted query/default composition | [KUP-011](#kup-011), [GRID-001](#grid-001), [GRID-008](#grid-008) | Before consumer activation, join D3 and new reads on the same admitted meaning and known mapped code fields; inactive server work is distinct. |
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
- **Distinct follow-up:** [ledger B3/L22](not-yet-another-audit-ledger.md#b3) is the long-press producer cancelling its own valid range, not a reopening of this external-supersession repair.
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

#### KUP-011
**Raw substring defaults do not follow parsed query intent**
- **Component / responsibility:** direct Kupua query defaults, D3 request mapper and analogous legacy Grid Parser default construction; one cross-component entry. Human owner-to-confirm. Visibility-sensitive forms warrant private maintainer/security triage before expanded public detail.
- **Trigger:** supported quoted/case-varied positive intent, or ordinary literal text containing a special query substring.
- **Expected / actual:** automatic defaults should follow actual parsed intent. Raw substring checks can add contradictory exclusions or omit an intended default. This affects both current Kupua paths; bare POST decoder tests do not establish the composed mapper path.
- **Evidence / reproduction:** [direct defaults](../../src/dal/es-adapter.ts#L470), [mapper](../../src/dal/grid-api-search-adapter.ts#L115), [P28 Q2/Q4][p28], E047. **20 September synthetic direct-builder reproduction in Kupua:** non-sensitive replaced-intent and literal-text cases produced wrong predicates at a capturing transport boundary. [Evidence](bug-reproduction-evidence.md#kup-011). A later one-hit live D3 read found no replaced witness, leaving that comparison inconclusive; no deleted/visibility probe or mounted result claim.
- **Upstream status, 22 September:** [PR #4957](https://github.com/guardian/grid/pull/4957) implements and locally validates the Grid replaced-intent subset, pending human review/merge. [Recorded scope and validation](grid-usage-search-investigation.md) do not credit prototype integration. Kupua's mapper/direct defaults and the permission-sensitive deleted-intent boundary remain unresolved.
- **Smallest test:** after the Grid merge, pair actual mapper bodies with the accepted D3 intent/membership/total contract, retaining separate authorization controls. The Grid-only tests are not execution credit for this composed prototype path; do not expand visibility-sensitive examples here.
- **Dependency / resolution:** before **S2's shared browse consumer activates**, D3 first page/continuations and selected new reads need the same agreed admitted meaning (P29 C1). A correct new helper alone is insufficient. Mapper-only removal does not fix direct mode; grouping is the distinct [GRID-001](#grid-001) issue. Inactive server work and unrelated direct/legacy repairs remain separate; no blanket repair approval.
- **Disposition: OPEN.** The [current usage-search direction](grid-usage-search-investigation.md#4-proposed-fix-and-compatibility) supersedes P30's browse-only default-composition design. Original q from the mapper remains a follow-up candidate, but first inspect what D3 inherits from the accepted shared Grid code; do not assume a new endpoint-specific patch is needed. Prototype mapper/direct-ES alignment and the hybrid positional join still require approval and validation before activation. The PR deliberately leaves deleted-default/admission handling unchanged pending separate maintainer assessment.

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

### Independent Backlog: Parked

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
- **Distinct follow-up:** [ledger B11/L13](not-yet-another-audit-ledger.md#b11) concerns the thumb remaining at top after cancelled Home, not obsolete Home navigation winning.
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
- **Distinct follow-up:** [ledger B4/L23](not-yet-another-audit-ledger.md#b4) covers newer-focus overwrite and a latent no-saved fallback; this completed repair covers saved-state search/wheel supersession.
- **Component / responsibility:** useScrollEffects density state and deferred frames; human owner-to-confirm.
- **Trigger:** a same-mounted search or newer scroll changes intent before the scheduled second restoration frame.
- **Expected / actual:** preserve valid fresh geometry/origin calculations, not an old search or superseded scroll action. Before repair, the saved ordinal/ratio closure lacked that ownership. Existing unmount cancellation was real and remains intact.
- **Evidence / reproduction:** [density frames](../../src/hooks/useScrollEffects.ts), [P19 F3][p19]. The historical unsuccessful 20 September attempt remains unchanged. Correct leaf-frame gating in local Chromium on 22 September demonstrated query placement from 0 to 2564 and newer wheel position from 320 to 165029, with an ordinary deep-density control passing. [Evidence](bug-reproduction-evidence.md#kup-017).
- **Regression coverage:** queued mounted geometry/header/viewport/prepend/extrema, Strict Mode, no-map indexed coordinates, disposal and key exclusions; real query/order/wheel interleavings and ordinary density workflows. Independent review's no-op Left/Right cancellation finding was reproduced and corrected with real no-focus and focused-arrow controls.
- **Disposition: DONE (22 September), committed as `4124967e3`**, for saved-density restoration. [Validation and limits](bug-reproduction-evidence.md#bounded-focus-repairs-kup-013017018027). The no-saved-state mount fallback is not newly certified. Geometry formulas, two-frame settling, cooldown and coordinate regime remain; no S2-S5 or API guarantee follows.

#### KUP-018
**Detail-return centring retains a row across newer entry or geometry changes**
- **Distinct completed repairs:** [B9/L27](not-yet-another-audit-ledger.md#b9) owns return before list readiness; [B12/L11](not-yet-another-audit-ledger.md#b12) unifies swipe/final-return session identity after reload. Both are Done within the [detail-return unit's local limits](not-yet-another-audit-ledger.md#detail-return-unit), separately from this deferred-frame certificate.
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
- **Selection boundary:** bulk hydration deliberately has no enrichment and leaves the shared overlay map untouched. U6z does not add enrichment, clear selected overlays or introduce freshness policy to manufacture closure.
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
- **Evidence:** P32-C2, qualified: [calculator](../../e2e-perf/perceived-metrics.mjs#L24), [existing correlation assertions](../../e2e-perf/harness-validation.test.mjs#L737). High-confidence source mechanism; no canonical row is alleged affected and no arbitrary total ordering of independent phases is required.
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
**A full selection reconcile runs in one idle callback and blocks a frame at large selections**
- **Scope:** separate from [ledger B3's range-gesture ownership](not-yet-another-audit-ledger.md#b3); fixing that gesture does not address this measured reconciliation cost.
- **Component / owner:** `requestFullReconcile` in the selection store, and `recomputeAll`; human owner-to-confirm.
- **Trigger:** metadata arrives for a large selection (range select, reload hydration) while Details is open.
- **Expected / actual:** the multi-image Details summary should settle without a visible stall. Instead, one idle callback recomputes every field over every selected image. The callback's 2 s timeout lets it run as a single long task.
- **Evidence:** [scheduler](../../src/stores/selection-store.ts#L199), [recomputeAll](../../src/lib/reconcile.ts#L328). **26 September, perf P19 on TEST, `--use-media-api`, 2 runs, 1,000 selected:** max frame about 358-367 ms, from one `IdleRequestCallback` of about 318 ms. P18 (100 selected) peaks at about 100 ms. The archived [13 September consolidation audit](zz%20Archive/performance-first-dry-consolidation-audit-2026-09-13.md#L232) already noted that the full scan is not chunked, and scoped its repair to exclude chunking. The [interaction catalogue L08](zz%20Archive/performance-harness-1-interaction-catalogue.md#L149) records 2,000-5,000 as product-gated. **Direct ES, same day, 2 runs:** max frame about 358-363 ms, from one `IdleRequestCallback` of about 319 ms, the same as media-api mode.
- **Smallest discriminator:** the P19 scenario (`e2e-perf/perf.spec.ts`), comparing its max frame and LoAF blocking before and after a change.
- **Dependency / disposition:** OPEN, independent client performance in both modes. It is not introduced by API build U6d, which only changes where the metadata comes from. A fix would split the scan across idle slices, or keep an incremental view, and needs its own decision and tests.

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
- **Dependency / disposition:** OPEN, independently parked. Both modes currently agree, so this does not block M2a routing or invalidate existing API comparisons. Resolve later as one client intent/label decision with failing-first direct and API tests.

#### KUP-038
**Density switch and Home/End keys cancel an in-flight search without replacing it**
- **Historical finding:** shared range cancellation could abandon ordinary/AI initial reads and strand loading; keyboard navigation could also use predecessor-query totals. Source-only at intake on 27 September.
- **Current contract:** density cancels obsolete maintenance, not current query discovery. Home/End may retire initial placement while retaining current-query discovery; an old first page must not overwrite the newer destination. New search/Home-logo supersedes the prior query; finite AI retains its own membership.
- **Resolution:** covered by [B8/L37](not-yet-another-audit-ledger.md#b8) and [B17](not-yet-another-audit-ledger.md#b17), not another repair. [Search-store](../../src/stores/search-store.ts) now separates search, browsing and maintenance owners and settles only owned completion.
- **Maintained proof:** [mounted density/search tests](../../src/hooks/useScrollEffects.test.ts), [keyboard/discovery tests](../../src/hooks/useListNavigation.test.ts) and [API/store controls](../../src/stores/search-store-api-mode.test.ts) cover delayed reads, current totals, newer destinations, finite AI and supersession in both adapters. Recorded gates and bounded live-checkpoint limits remain with the linked ledger entries.
- **Disposition: DONE (3 October, reconciled at `7b82b13f8`).** This is a closure against existing repairs and verification, not a new test/live run or a claim that every density/keyboard defect is fixed.

### Dependency Unresolved

#### KUP-027
**Preview-exit centering can move a newer session's retained list**
- **Component / responsibility:** FullscreenPreview exit promise/resize/frame work and centring callback; human owner-to-confirm.
- **Trigger:** a new preview session begins while the older exit's centering frame is pending.
- **Expected / actual:** preserve the new session's native list placement. Before repair, the old frame could center under the new preview. Fresh focus/geometry within the same valid exit is intentional and passed its control; it is not itself an actionable defect.
- **Evidence / reproduction:** [exit work](../../src/components/FullscreenPreview.tsx), [P20 F2][p20]. The blocked 20 September integrated-browser attempt is retained. On 22 September native Chromium with isolated local media separated promise delivery from centering: the old frame moved a new preview's retained list from 0 to 100 while native preview, history and focus stayed correct. [Evidence](bug-reproduction-evidence.md#kup-027).
- **Regression coverage:** ordinary/latest-focus settlement, different/same-image reentry, resize, native-event exit and rejected/non-traversed retry in real Chromium; explicitly mocked mounted disposal, resize quiet period, safety cap and duplicate completion controls.
- **Dependency / resolution:** pre-native-entry promise timing, physical Esc/macOS animation and wider S10/gesture composition remain uncertified. The tested late-promise/new-active-preview path was already safe; no wholesale exit-lifecycle refutation or session-manager redesign is claimed.
- **Disposition: DONE (22 September), committed as `6718aebd0`**, for centering crossing preview sessions. [Validation and limits](bug-reproduction-evidence.md#bounded-focus-repairs-kup-013017018027). Existing native finalization, fresh-focus resolution and settling delays remain.

## Grid

### Migration Prerequisites

#### GRID-001
**Usage exclusions can weaken one another**
- **Component / responsibility:** media-api QueryBuilder and default insertion, with Kupua request-mapper participation; human owner-to-confirm. One canonical cross-component entry, distinct from raw intent detection in [KUP-011](#kup-011).
- **Trigger:** negative usage conditions are combined with other user exclusions or automatic replaced suppression. The 20 September direct-Kupua comparison worked for the single print exclusion; that is not proof that its deliberate multiple-negative grouping already matches the selected contract.
- **Expected / actual:** every negative usage condition independently excludes an image if any usage matches it; positive conditions must still match the same usage record. The unchanged prototype's Grid builder groups negatives into one negated conjunction. Direct ES keeps its automatic default separate but still needs deliberate multiple-negative alignment.
- **Evidence / reproduction:** **20 September controlled live-data reproduction on Kahuna -> media-api GET -> TEST and Kupua -> local media-api D3 -> TEST:** a known positive witness survived platform and published-status exclusions. GET rendered one match; D3 also rendered the witness cell. [GET evidence](bug-reproduction-evidence.md#grid-001-kahuna-get), [D3 evidence](bug-reproduction-evidence.md#grid-001-and-grid-008-kupua-d3). [Grouping source](../../../media-api/app/lib/elasticsearch/QueryBuilder.scala#L120) and [P28 Q3][p28] support the proposed cause, not the deployed revision. The earlier direct-Kupua check was comparison only; not every usage field or production deployment was tested.
- **Upstream status, 22 September:** [PR #4957](https://github.com/guardian/grid/pull/4957) implements the selected independent-exclusion rule in the existing Grid builder, with local regression gates passed. It awaits human review/merge; the prototype has not imported the change. [Recorded evidence and limits](grid-usage-search-investigation.md) keep this separate from the earlier unchanged-code characterization.
- **Smallest test:** after merge, verify the accepted contract through actual mapper/D3 bodies, exact IDs and totals, then the affected positional consumers. Preserve positive correlation and intentionally replace grouped-negative expectations with independent image-level exclusions. The standalone Grid regressions do not establish this prototype join.
- **Dependency / resolution:** before **S2's shared ordered consumer activates**, resolve this meaning across D3 first page/continuations and its new window/key/rank reads (P29 C1). A correct new boundary plus unchanged divergent D3 does not resolve the join. An inactive capability may land first. Merge, prototype integration and consumer validation remain separate gates.
- **Disposition: OPEN.** The operator-selected independent-negative rule supersedes P30's preserved-user-grouping/browse-only proposal. Grid-main repair comes first; new D3-specific work waits for acceptance and merge, then checks inheritance before adding code. Direct-ES alignment can be developed independently but should follow the accepted contract. No whole-ID or migration-gate closure follows from the open PR.

#### GRID-008
**Supported nested print-usage keys resolve to different leaves**
- **Component / responsibility:** media-api CQL field resolution/QueryBuilder and mapped usage vocabulary; human owner-to-confirm.
- **Trigger:** currently supported code-valued section/publication input against the populated print-usage leaf; include the selected orderedBy path in the discriminator.
- **Expected / actual:** preserve the admitted mapped attribute. Client paths use absolute print-usage leaves, while server MultipleField resolution does not add that prefix and nested construction does not repair it. SingleField alias configuration does not repair the MultipleField branch.
- **Evidence / reproduction:** [client fields](../../src/dal/adapters/elasticsearch/cql.ts#L250), [nested fields](../../../media-api/app/lib/querysyntax/QuerySyntax.scala#L142), [P28 Q10][p28], [P29 C2][p29]. **20 September controlled live-data reproduction on Kahuna/GET/TEST and Kupua/local-D3/TEST:** populated section/publication-code witnesses returned zero; positive platform/status controls returned them. [GET](bug-reproduction-evidence.md#grid-008-kahuna-get), [D3](bug-reproduction-evidence.md#grid-001-and-grid-008-kupua-d3). This tests positive resolution, not exclusion or production incidence. Per [P30][p30], orderedBy still depends on its SingleField alias path; no universal orderedBy failure or effective-alias conclusion.
- **Upstream status, 22 September:** [PR #4957](https://github.com/guardian/grid/pull/4957) locally validates print section code/name, publication code/name and an alias-preserving orderedBy fallback. Section-name support is an intentional addition; digital section IDs are not added. Human review/merge and prototype alignment remain pending; [scope and validation](grid-usage-search-investigation.md) are recorded separately from historical failures.
- **Smallest test:** after merge, verify the accepted mapped fields through actual mapper/admission/D3 and the selected new path, asserting emitted fields and exact IDs/totals. Retain independent code-only/name-only witnesses, positive/negative controls, same-record correlation and absent/canonical/conflicting orderedBy aliases.
- **Dependency / resolution:** **known S2 activation gate for mapped code-valued cases**, including C1's D3 join and dependent reads. Candidate preservation of current filters already includes these cases; they are not optional future functionality. An isolated inactive endpoint can be developed separately, but enabled admission cannot silently drop the syntax or delegate the wrong path unchanged.
- **Disposition: OPEN.** The selected shared Grid repair supersedes P30's browse-only normalization and deferred section vocabulary. Ordinary top-level fields and configured orderedBy redirects stay unchanged. The accepted upstream implementation must still be integrated and validated across the prototype's API/direct paths; the S2 mapped-field gate remains open. No further implementation is authorized by this status update.

### Independent Backlog: Parked

#### GRID-002
**Equivalent deleted-read intent is not consistently admitted by legacy GET**
- **Component / responsibility:** media-api legacy search admission; human owner-to-confirm. **Private maintainer/security triage** before additional reproduction detail or public issue.
- **Trigger:** equivalent supported query formulations under an authenticated ordinary principal subject to deleted-read restrictions.
- **Expected / actual:** the same query-dependent authorization scope should apply before hits/totals. The legacy condition recognizes a narrower formulation than the parsed D3 path, so equivalent intent can miss the expected restriction. This is not a claim of missing authentication.
- **Evidence / reproduction:** [legacy admission](../../../media-api/app/controllers/MediaApi.scala#L584), [P28 Q5 and complementary guards][p28]; **qualified production-source inference only**. The browser campaign did not have private principal/security-test scope and made no probe. [Blocker](bug-reproduction-evidence.md#permission-blocked-routes). No deployed revision, disclosure or live reproduction established; details are not expanded here.
- **Smallest test:** private/isolated controller and ES authorization contract for equivalent intent and principal classes, checking hits/totals and no unauthorized dispatch; no live probing.
- **Dependency / disposition: OPEN; human assessment pending.** A related pre-existing concern was raised in the automated review of [PR #4957](https://github.com/guardian/grid/pull/4957); the operator has responded and is awaiting human feedback. The PR leaves deleted-default/admission handling unchanged. A parser-only amendment is not an approved authorization repair; isolated permission-aware tests and scoped maintainer assessment remain necessary. No new security reproduction or live probe is claimed. Unchanged legacy GET is not a prerequisite to Kupua's already scoped POST path; reassess if a slice touches/reuses that admission, and never weaken D3 for parity.

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
- **Evidence / reproduction:** [read phase](../../../scripts/src/main/scala/com/gu/mediaservice/scripts/AlamyCleanUp.scala#L42), [P26 C2][p26]; conditional source inference only. [Read-phase pagination mock](bug-reproduction-evidence.md#non-browser-alternatives) remains unexecuted; no such live dataset or operational reproduction observed.
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
- **Dependency / disposition:** OPEN, independent Grid-only lost-update defect, not the undecided tree-cascade policy and not a collection-wide transaction requirement. No change to current Kupua approximate counts or read migration.

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

#### GRID-015
**AI search does not apply the deleted-search admission that ordinary GET applies**
- **Component / owner:** media-api `MediaApi.imageSearch` AI branch (legacy and U9-A explicit `aiQuery`); human owner-to-confirm. **Private maintainer/security triage** before additional reproduction detail or public issue.
- **Trigger / expected / actual:** an ordinary principal without delete permission sends a deleted-image AI search. Ordinary GET narrows such a search to the caller's own uploads before querying; the AI branch dispatches to ranking and pool counting without that narrowing, so hits, totals and tickers are not restricted. It also skips `SearchParams.validate`. Distinct from [GRID-002](#grid-002), which concerns which query forms the ordinary admission recognizes.
- **Evidence:** [ordinary admission](../../../media-api/app/controllers/MediaApi.scala#L789) versus [AI dispatch](../../../media-api/app/controllers/MediaApi.scala#L782). Source reading by the U9-A intake and independently by both U9-A and U9-B cold reviews; not executed and no deployed incident claimed. Pre-existing for legacy AI; U9-A's explicit branch inherits it unchanged by operator decision. Related discussion on [PR #4957](https://github.com/guardian/grid/pull/4957).
- **Smallest test:** controller ES test with an unprivileged principal, another user's deleted image and an owned deleted image, for legacy and explicit AI, asserting hits and pool counts; privileged and ordinary-GET controls. Proposed, not run.
- **Dependency / disposition:** OPEN, independent Grid authorization fix, deliberately deferred (operator, 27 September). Apply the same admission before AI ranking and pool counting. Not a local U9/U10/U8 gate; assess it before any deployment that serves users beyond TEST.

#### GRID-016
**Search results admit syndication images that single-image reads reject**
- **Component / owner:** media-api tier search filter and `MediaApi` search responses (AI and apparently ordinary GET); human owner-to-confirm. **Private maintainer/security triage** before additional reproduction detail or public issue.
- **Trigger / expected / actual:** a syndication-tier caller searches while an image has acquired rights and an allow lease but no syndication publication date. Single-image reads reject it (`isVisibleToAccessor` requires a past publication date); the search-side filter treats a missing date as allowed, and search responses apply no per-image check, so the image and its signed URLs can be returned.
- **Evidence:** [tier filter](../../../media-api/app/lib/elasticsearch/SyndicationFilter.scala#L75), [single-image rule](../../../media-api/app/controllers/MediaApi.scala#L172), [AI response](../../../media-api/app/controllers/MediaApi.scala#L659). U9-A cold-review source reading, repeated by the U9-B review; not executed, no deployed incident claimed. Whether a missing date is intended to mean "published" needs maintainer confirmation.
- **Smallest test:** syndication-tier search fixture with acquired rights, an allow lease and no publication date, for ordinary and AI search, plus past/future-date controls. Proposed, not run.
- **Dependency / disposition:** OPEN, independent Grid data-exposure fix, deliberately deferred (operator, 27 September). Make search and single-image visibility agree. Same deployment caveat as GRID-015.

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
  or separate speculative-error defect is inferred; KUP-010 and GRID-002 retain their open scopes.
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