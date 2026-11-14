# Media-api integration: start here

**Scope agreed with the operator, 15 September 2026.** Continue making the working read-only
Kupua prototype deployable through incremental, additive media-api capabilities. Preserve all
existing workflows and their explicitly accepted compromises. A finding about stronger
correctness is information for a decision, not automatic authorization to implement it.

## Authority and Reading Order

**Current routing, 4 November 2026:** this folder preserves detailed migration research,
not a list of unfinished features. The [hosted guide](../../00%20Architecture%20and%20philosophy/09-deployed-via-Kahuna.md)
describes the implemented deployment/data paths; the [editing plan](../../gradually-growing-teeth.kupua-edits-steps.md)
owns future editing sequence. Its read-only step 1 is complete: image URI/edits/crops
capabilities survive normalization, and user-session permission facts can be read on demand.
See the [shared API contract](../../../../src/dal/grid-api/README.md) for exact limits.
Step 2 adds a separate default-off `add-labels` command boundary, validated session
routing, local guarded proxies and Kahuna-hosted rollout/origin settings. Its labels
resource is read on demand, not retained in a general raw-envelope cache. No UI caller,
live activation, crop notices or post-write publication is implemented.
The September snapshots below do not reopen completed API adoption or authorize writes.

**Active build, 23 September:** executing agents work from the
[API build plan](../api-build/api-build-00-plan.md) and start each session with its
[session prompt](../api-build/api-build-01-session-prompt.md). The operator decided to build locally
first and split into PRs late, not to wait for PR #4957, to build without PIT (added later only
after measurement), and to reshape D3 freely. The build plan owns sequencing; candidate 11 remains
the contracts/invariants reference. Where older text below says implementation is paused or gated
on #4957/section 15, the build plan supersedes it.

This index routes current work. [Candidate 11](api-boundary-11-candidate-plan.md) owns the current
provisional migration direction under explicit operator decisions. [Inventory 01](media-api-01-capability-inventory.md)
is capability reference; [workplan 02](media-api-02-next-endpoints-d7-d8-d9-workplan.md) is historical
design input, not an active work queue. Neither legacy sequencing nor dated reports authorize
implementation. The [backlog overview](../../bug-backlog.md#at-a-glance) owns current issue status;
candidate sections 12-14 qualify earlier reports. Protocol/registers govern commissioned review
administration, not product execution.

**Historical core-first priority, 23 September:** get API-backed search, scrolling, position preservation and
traversal working. KUP-029/030 display/enrichment corrections, deferred at the time, have since
been resolved (refuted/fixed 27 September). Authorization, data protection,
existing workflows and performance safeguards still apply. The next bounded unit is
[post-merge prototype query alignment](api-boundary-11-candidate-plan.md#15-post-merge-prototype-query-alignment-workplan).
Migration implementation remains paused until PR #4957 acceptance/merge and separate operator
authorization; independently authorized fixes or characterization can continue meanwhile.

## Current reality

- API mode covers ordered browsing, detail, selection, counts, facets and AI without constructing
  a direct-ES datasource or using an ES fallback. Direct-ES laptop mode remains separate.
- Kahuna hosts the opt-in Kupua page in DEV/TEST, injects validated settings before modules run,
  and leaves iframe pickers on Kahuna. Hosted media uses canonical entity links. This is not
  approval for PROD, every external integration or stronger migration guarantees.
- The [API build plan](../api-build/api-build-00-plan.md) records implementation and measurement
  boundaries. Do not rebuild its completed endpoints from the inventory's older status tables.
- PR #4957 is recorded as merged and client alignment implemented; KUP-011 retains the accepted
  direct-parser grammar residual. This is the [backlog's recorded status](../../bug-backlog.md),
  not a new remote/deployed check. PR #4849's former draft is historical, not the active build.
- Read-only editing preparation retains image capabilities and provides an on-demand user-session
  reader. The separate step-2 mutation boundary is default-off and fixture-verified;
  it adds no startup command, edit UI, write permission or live activation.

## Research Still Relevant to Editing

Use the named sections for their contracts, with the dated status corrections at each report's
entry. This routing is based on a folder keyword scan and targeted reading, not a fresh whole-codebase
audit, new test execution, deployment check or regenerated coverage register.

| Research | Current consequence for the editing plan |
| --- | --- |
| [P16 F1/F2/F5](api-boundary-09-p16-image-response.md) | Image-level retention is implemented. Keep validity/downloadability/deletability separate; original-metadata edits and cropper cannot assume lean mget equals full GET. Steps 1, 8, 13, 14. |
| [P21 F3/F4](api-boundary-09-p21-selection-collections.md) | 5,000 is a range-walk/cache bound, not a whole-selection ceiling. Count captured IDs and resolve unavailable target metadata before writes. Steps 3, 6. |
| [P22 F7](api-boundary-09-p22-query-ui-owners.md), [P32 B](api-boundary-09-p32-kupua-interaction-and-measurement-contracts.md) | AI/selection enrichment work and KUP-029/030 dispositions supersede old proposals. Cache/clock freshness and missing lease-summary production are not silently solved by capability retention. Steps 2, 4, 9. |
| [P23 F4/F5](api-boundary-09-p23-query-mapping-s1.md) | Root and user-metadata timestamps differ; a newer root clock alone is not proof of the intended edit. Policy/display inputs must not become client authorization. Steps 1, 4, 8. |
| [P24 F2/F3/F5/F8](api-boundary-09-p24-backend-admission.md) | Hosting/read endpoints exist, but principal/service admission and full-GET compatibility remain. Starting a backend can mutate its ES target. Steps 2, 5, 13. |
| [P25 F4-F7](api-boundary-09-p25-delivery-satellites.md) | Hosting/delivery/normalization are implemented, not universal renewal or write-time freshness. Keep distinct satellite absence, lease rules, download side effects and cropper dependencies. Steps 2, 9, 13, 14, 18. |
| [P26 Q2-Q4/C2](api-boundary-09-p26-configuration-evidence.md) | Kahuna bootstrap is no longer speculative. Verify selected write origins/methods; supplier-reference resolution must account for all matching pages before mutation. Steps 2, 15, 21, 22. |
| [P33 A-C](api-boundary-09-p33-grid-edit-delete-collection-lifecycles.md) | Source persistence, publication and ES visibility are separate. Its soft-delete acknowledgement wording is corrected to GRID-012; collections/syndication/lifecycle issues remain slice-local. Steps 8, 12, 16-19. |

Administrative prompts, historical hashes/coverage receipts and performance records are preserved,
not marked newly verified. Unrelated query, geometry and measurement findings remain routed by
their current owners/backlog; this cross-check does not reopen them as editing gates.

## Boundaries

Grid index migration is unsupported by the prototype; the operator may stop using Kupua during
it. Future deployed operation may use maintenance mode. No atomic exclusion, bounded detection
deadline or migration-transparent browsing guarantee is currently promised. A deployable
maintenance mechanism must be agreed before relying on it for other users, not invented here.

Do not make Dynamo-backed sessions, Thrall hooks, canonical read/write changes or the archived
migration programme prerequisites for additive endpoint work. Ordinary PIT lifecycle, authorization,
query/sort parity and request validation still need proportionate decisions and tests. Neither
prototype status nor additive routing excuses data disclosure or unintended changes to Kahuna.

The eventual deployed mode must have no direct browser ES access. Incremental hybrid development
is allowed before that point. Do not describe a hybrid fallback as proof of API-only completion.
Production resource/load acceptance remains necessary; existing measurements should be reused,
not replaced by assumptions or repeated without a specific question.

## Capability-preserving boundary research

For an explicitly commissioned review, use the
[coverage-driven review protocol](api-boundary-05-review-protocol.md). The 00-04 sequence remains
preliminary evidence, not comprehensive coverage or an instruction to repeat those assessments.
The process inventories source, documents and recorded measurements, assigns bounded reviews,
and separates mechanical bookkeeping from semantic verification. Use the
[packet handoff prompt](api-boundary-08-review-prompt.md) only with the coordinator's assigned ID.

The resulting current planning baseline is candidate 11, not a future missing document. Its
recommendations and research acceptance do not grant blanket implementation authority, feature
reductions or another D3 readiness programme. Older capability/endpoint material remains reference.

**Historical handoff, reconciled 23 September:** the following records that checkpoint,
not current issue dispositions; use the backlog and build plan above. Preserve S1 and the earlier client reconciliation;
Batch A's six and Batch B's four additional repairs are DONE only at the scopes recorded in the
[canonical backlog](../../bug-backlog.md) and [completion evidence](../../bug-reproduction-evidence.md).
Registers [06](api-boundary-06-coverage.json)/[07](api-boundary-07-evidence.json) and
[candidate 11](api-boundary-11-candidate-plan.md) now distinguish those completions from future
API composition, logical omission/failure, construction and deployment gates. These remain independent
client improvements, not new migration prerequisites. **Reverse keyboard Home -> resident End is
controlled-live-data reproduced and UNFIXED under KUP-013**, distinct from repaired End-initiated
ownership and logo/resetToHome; its remote stage was not independently reidentified. CQL remount
cache callbacks are repaired, but first-registration datasource/API-only initialization remains open.
Saved-density, original-return and cross-preview-centering repairs do not certify no-saved density
fallback, pre-native-entry fullscreen timing, physical Esc/macOS animation or broader availability.
KUP-010 and future API/deployment acceptance remain. Historical reports, S1 and receipts are preserved.

The [single usage investigation](../../01%20Research/grid-usage-search-investigation.md) records PR #4957 as
implemented/locally validated in a separate main-based checkout, awaiting human review/merge as
documented on 22 September, not freshly checked remotely. Independent usage negatives, positive
same-record matching, print code/name support and alias-preserving orderedBy fallback supersede
P30's older direction. The prototype has not imported it: KUP-011, GRID-001/008 and S2 stay open.
After merge and separate authority, inspect inherited D3 behavior before proposing more code.
The permission-sensitive deleted-intent concern remains separate and awaits human assessment.

The specifically accepted roughly 68 ms changed-tuple restore median increase retains its
four-sample direct-TEST limits. The later operator-run four-repeat direct-ES campaign is also
recorded: PP6c is a slowdown candidate and P8 a watchpoint, not attribution solely to the UX fixes
or blanket performance acceptance. Neither Batch A nor B ran a new campaign or explains/resolves those
measurements. This documentation pass ran no tests/campaigns, queried no live
system/remote PR and made no Git mutation. Whole-corpus readiness remains false; no next task follows.

## What to read next

**P32/P33 integration, 23 September:** [candidate section 14](api-boundary-11-candidate-plan.md#14-p32p33-characterization-integration)
accepts the externally commissioned [interaction/display/measurement report](api-boundary-09-p32-kupua-interaction-and-measurement-contracts.md)
and [Grid edit/delete/collection report](api-boundary-09-p33-grid-edit-delete-collection-lifecycles.md)
with explicit source, receipt and attribution corrections. Ten new source-only canonical bugs are
independently parked; original IDs/repairs and measurements remain. Future-editing knowledge is routed,
not scheduled. Kupua stays read-only; no new write API, metric rewrite, campaign or follow-on task.

| Purpose | Document | Authority |
|---|---|---|
| Implemented reads and historical build sequence | [API build plan](../api-build/api-build-00-plan.md) | Completion/decision record; hosted guide owns current hosting. |
| Editing prerequisites and sequence | [Gradually growing teeth](../../gradually-growing-teeth.kupua-edits-steps.md) | Read-only step 1 complete; subsequent work requires separate approval. |
| Migration contract background | [Candidate 11](api-boundary-11-candidate-plan.md) | Dated planning baseline, superseded by build decisions and current source. |
| Historical query-alignment unit | [Post-merge query alignment](api-boundary-11-candidate-plan.md#15-post-merge-prototype-query-alignment-workplan) | Completed bounded alignment and residuals are recorded in the current backlog. |
| Completed D3 amendments | [Findings and amendment workplan](d3-search-after-01-readiness-findings.md) | Agreed scope complete; Section 6 records the executed plan and Section 7 the verification. |
| Assessment background | [Readiness prompt](d3-search-after-00-readiness-prompt.md) | Background for the completed assessment, not an instruction to restart it. |
| Capability reference | [Capability inventory](media-api-01-capability-inventory.md) | Dated capability reference; not sequencing authority. |
| Earlier endpoint sketches | [D7/D8/D9 workplan](media-api-02-next-endpoints-d7-d8-d9-workplan.md) | Historical design input; not an active work queue. |
| Historical D3 draft | [PR draft](d3-search-after-02-pr.md) | Dated implementation/evidence description, not a current PR-status claim. |
| Usage-search upstream repair and follow-up | [Investigation and handoff](../../01%20Research/grid-usage-search-investigation.md) | Historical evidence; the backlog records the merged repair and bounded client alignment. |
| D3 sort alternatives | [Sort options](d3-search-after-03-sort-options.md) | Trade-offs; no automatic requirement to switch ownership. |
| Existing D3 measurements | [Performance](d3-search-after-04-performance.md) | Dated evidence; distinguish local, deployed TEST and inferred PROD costs. |
| Scala conventions | [Conventions](media-api-90-conventions.md) | Implementation reference. |
| Implementing-agent rules | [Instructions](media-api-91-instructions-for-agents.md) | Safety and repository mechanics; mirrored to the automatic instruction file. |
| Archived audit and deferred evidence | [Completed consolidation audit](../../zz%20Archive/performance-first-dry-consolidation-audit-2026-09-13.md) | Selected queue complete; remaining findings are deferred or endpoint-routed, not build instructions. |

**Amendment status: DONE (17 September).** E2/C1 and E1/N4/C2/C3 are implemented and committed.
Independent written-code reviews, 305 Scala tests, 1,342 client units, 210 habitual E2Es, the
full client build and the guarded local cursor oracle passed. Scoped live direct-ES and locally
modified media-api/TEST checks also passed; findings Section 7 distinguishes them from mocked
fixtures and the injected API-outage check. Scala-only commit `e6485be4b` is isolated for
porting and has been integrated after merging `main` into the PR branch, then pushed as
`95a45f4ee`. All 305 media-api tests also passed on that integrated PR tree. The paired
client/docs amendments remain on the prototype. No known amendments in the agreed batch
remain pending; human review, merge and deployment are separate. Do not restart a general
assessment or equate these checks with production
capacity, whole-hybrid permission consistency or API-only readiness.

## Research Tools and Checkpoints

The two review scripts in [package.json](../../../../package.json) support this research record,
not Kupua's runtime or a mandatory step before each product fix:

| Script | Purpose | When useful |
| --- | --- | --- |
| `review:api-boundary` | Runs the review CLI. `summary`, `packet` and `check` inspect records; `inventory` updates coverage metadata and staleness while preserving prior receipts. | Coordinating new characterization or checking an existing research checkpoint. Follow protocol 05 for exact commands and write ownership. |
| `test:api-boundary` | Runs local Node tests of the review tool's rules and bookkeeping. It does not test the app, Grid or benchmark performance. | Changing or repairing the review tool itself; not automatically after a prose edit. |

Keep these tools available while the records are maintained. Further bounded characterization may
be commissioned before or after any documentation commit. A commit is a recoverable checkpoint,
not final acceptance, a freeze or the end of the review process. Do not remove scripts/dependencies,
archive reports or commit active worklog contents merely to make a checkpoint. No such operation
is authorized by this explanation.

## Historical research

The September index-migration, production-impact and complete API-only assessments preserve
useful findings under stronger requirements than the current scope. Their implementation
sequences, gates and checklists are not active instructions. Do not resume their numbered
research programme without a new explicit decision. Archiving does not refute their findings.

- [Grid index-migration research](../../zz%20Archive/media-api-work/2026-09-migration-assessments/grid-index-migration-00-routing.md): historical sequence and assumptions.
- [API-only assessment](../../zz%20Archive/media-api-work/2026-09-migration-assessments/api-only-assessment-01-workplan.md): workflow coverage and proposed stronger architecture.
- [Production-impact findings](../../zz%20Archive/media-api-work/2026-09-migration-assessments/production-impact-01-findings.md): authorization, isolation, load and broader-horizon evidence.

Earlier D3 build/review evidence remains in `../../zz Archive/media-api-work/`. In particular,
read [the measured tiebreaker review](../../zz%20Archive/media-api-work/phase-3-d3-searchafter-post-pr-review.md)
section D-6 before changing `_shard_doc` handling. Prior proposal prose never outranks current
source, current accepted behavior, or the operator's scope decision above.
