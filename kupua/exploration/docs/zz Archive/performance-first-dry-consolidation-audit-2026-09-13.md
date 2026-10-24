# Performance-First DRY and Consolidation Audit

**Date:** 2026-09-13
**Status:** Archived 18 September 2026. The selected implementation queue and both
approved follow-ups are complete. Other findings remain deferred, refuted or routed
to separately authorized endpoint decisions; this is not an active workplan.
**Evidence:** Original source findings, bounded 17 September live TEST observations
and 18 September scope corrections are retained alongside completion notes. Pre-fix
descriptions and source-line references are historical evidence, not current defects.
**Primary scope:** The 39 implementation files named in the request. Direct source
call sites and tests were inspected only where needed to establish behavior.

**D3 follow-up status (17 September 2026):** the
[bounded D3 assessment and agreed amendments](../03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/d3-search-after-01-readiness-findings.md)
are complete. References below to feeding findings into D3 readiness are dated inputs to
that completed work, not a pending assessment gate. Other endpoint decisions and independent
refactor recommendations in this audit are not thereby completed or authorized.

## Constraint and execution note

The original 13 September DRY/consolidation assessment was source-only. No architecture, design, README,
historical report, or Git history was used as evidence. Repository protocol required
the agent startup files and current worklog to be read before work began; their
technical descriptions were excluded from that analysis. The 18 September amendments
use the current migration scope, targeted source rechecks and the bounded live evidence
below. This was not a new audit of all 39 files. Source findings, observed runtime
behavior and untested implementation proposals remain distinct.

Current integration scope is in
[the media-api index](../03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/media-api-00-index.md).
This report is not a migration architecture or D3 implementation plan. Audit query/data-access
findings use `Q1–Q6`; `D*` remains reserved for the long-running media-api migration.

## Execution disposition

**Done (18 September 2026):** Q3, S2, W1, T1, H2, F4, H1, S1, S3 plus narrow G3,
S6 (hydration only), Q2 and Q1.
The separately approved first-page sort clamp and coherent selection-panel follow-ups
are also done. The selected implementation queue is complete.
Completed findings retain their pre-fix evidence below; their status and implementation
notes describe the current disposition. Other proposals are not thereby completed or selected.

Mode-independent candidates may be assessed individually without completing API or index-migration
architecture. Endpoint-dependent findings need the relevant local contract decision, not the whole
programme. Findings are source-audit evidence, not authorization for a broad refactor. Confirm each
against current source and existing tests before fixing it; already-fixed/refuted claims stay out
of an implementation queue.

### Two filters for independent work (17 September 2026)

Every proposed fix must answer both questions:

1. **Would this change still be worthwhile if API migration stopped indefinitely?**
2. **Will it help, impede or have zero effect on future API migration?**

Proceed only when the first answer is yes and the second is **helps** or **neutral**,
with a brief reason grounded in the touched code and its callers. Helping means removing
demonstrated coupling or supplying reusable behavior tests, not building speculative API
infrastructure. Neutral means adding no migration obligation, client-only contract or direct-ES
dependency outside its existing owner. An adapter-local fix may be neutral even if that code
is later replaced; future reuse is not required.

If a proposal impedes migration, narrow it, choose another fix or defer it. An unclear effect
needs a targeted boundary check before approval, not a general API architecture assessment.
The narrowed scopes in Section 9 pass these filters on the current evidence. That does
not validate an implementation or authorize a wider refactor; recheck the affected
boundary if a proposed change expands or current source contradicts the finding.

### Reassessment and live evidence (18 September 2026)

The 17 September browser session used the operator's running direct-ES TEST app:
`ElasticsearchDataSource`, `IS_LOCAL_ES === false`, and observed direct search traffic
without media-api search calls. Probes used guarded reads and transient client state;
no indexed data was changed. The source recheck refuted V1's performance premise and
narrowed S1, S6 and Q2 without adding a migration prerequisite. D3 retains Option B;
no replacement semantic-sort builder or stronger session architecture is selected.

The following table records pre-implementation observations, not current completion
status. Subsequent fixes are marked in the findings and Section 9.

| Finding | Evidence from the live session | Limit |
|---|---|---|
| H1 / H2 | Real typing created a new entry with the same key. Home then Back wrote Home's departing snapshot under the previous entry's key. | Snapshot writes were observed without changing their results; this was not exhaustive CQL/AI/history coverage. |
| S1 / S2 | Controlled actions on cached live images produced one selected ID with chip total two; removing the whole selection left 11 dirty fields after reconciliation stopped. | Ordinary three-image range selection settled correctly. Duplicate-remove correctness still needs its own regression; these were store probes, not natural gesture reproductions. |
| S3 | A controlled off-buffer selection fetched real metadata, but Details remained empty until the panel was remounted. | The metadata panel was observed; all usages-panel variants were not independently exercised. |
| W1 | A deep normal-mode grid had six visible images and zero returned neighbours. Table also returned none; the indexed-scroll control returned neighbours. | No live image was deleted to force an end-to-end missing-anchor fallback. |
| T1 | Two real searches with equal totals retained the old four-tick props/markup although the settled inputs required 19 ticks. | The second 20-match search had 21 buffered images after focus preservation. Expected ticks used the actual inputs; this was not a clean 20/20 buffer fixture. |
| Q1 | Three ordinary scrubber pointer movements started two primary distribution calls and aborted one. | Null-zone identity, changed-key races and retries remain regression-test requirements. |
| Q2 | A real deep Credit seek received HTTP 400 for the keyword percentile, then succeeded with scoped `uploadTime` estimation. | Numeric/date and all null-zone variants were not exhaustively exercised. |
| Q3 | The 13,260-image position map used three chunk requests, all with exact totals enabled. | The map completed; disabling totals and unchanged output still require tests. No speedup was measured. |

Ordinary detail traversal/return and table focus preservation also worked. At that
reassessment, F4 and S6's hydration-anchor defect were source-only findings, not claimed
live reproductions. F4 and the selected hydration-only S6 fix have since been completed. These observations strengthened the bounded queue;
they do not prove fixes, production frequency, performance gains or API-only readiness.
Operating technique is retained in [the browser handbook](../embedded-browser-playbook.md);
no live identities, request bodies or traces are needed in this report.

### Feed into the relevant endpoint assessment

| Findings | Use after architecture and transport decisions | Do not implement first |
|---|---|---|
| Q5 | Parity inventory if a future semantic server builder is selected; D3 currently retains Option B. | No new authoritative client sort registry or preselected replacement contract. |
| Q6 | Null-zone, reverse, special-sort and tuple-remapping behavior fixtures. | No TypeScript abstraction treated as the server contract. |
| W6 | D3 enrichment omissions fixed; retain the committed-image publication invariants. | No isolated cold-path DRY refactor. |
| H6 + S5 | Authoritative tuple ownership and the eventual ID-versus-cursor D2 boundary. | No faster image-derived cursor authority or range-intent rewrite. |
| H3 + Q4 | Separation of local cache fingerprints from authenticated server session/continuation identity. | No client fingerprint, raw `after_key` or client cumulative rank as server authority. |

Use these as evidence in the relevant bounded assessment. They do not select server session
storage, universal snapshot exactness or a new public API contract by themselves.

### Independent candidates

Use [Section 9](#9-recommended-work-sequence) for the selected scope, order and current
completion status. There is no unfinished D3 assessment or general architecture gate
for that queue, which is now complete. Additional scope still requires explicit approval.

V1 is refuted and excluded. Retain these candidates for separate consideration, not
as a new implementation queue:

- **F1:** profile duplicate entry-prefetch scheduling and inactive-preview renders
  before changing ownership; duplicate calls do not establish duplicate downloads.
- **S4:** profile large-selection cache reads before adding non-touching access;
  changing recency affects eviction behavior as well as cost.
- **R1:** optional display-only linear maximum scans, preserving date semantics
  without changing authoritative cursor handling. No material speedup is established.

W3/W4, G1/G2, F2/F3 and H4/H5 remain measurement-gated. Neither live browsing nor
proximity to a selected fix authorizes them. The exclusions in Section 9 still apply.

### Do not implement independently in the original form

- Q4: repeated composite work is real; persistent continuation needs a scoped D5/D6 contract
  decision. Neither its storage model nor abandonment is selected by this audit.
- Q5: its inventory feeds semantic-sort fixtures, not a client authority.
- Q6: D3 retained the existing cursor/remapping contract and fixtures; any further consolidation
  is separate work and must preserve that verified behavior.
- S5: range-intent ownership waits for the migration D2 contract.
- H6: image-derived cursors remain fallback only; snapshot/server tuples are authoritative.
- W6: the D3 enrichment omissions are complete; any remaining publication DRY work is separate and unselected.
- H3: local fingerprint consolidation waits until the workplan separates it from server session
  identity.

## Executive assessment

The code does not have a general "too little abstraction" problem. Its largest
parallel surfaces often encode materially different runtime contracts:

- Grid and table virtualize different units and have different render-isolation
  strategies.
- Scroll, indexed-scroll, and seek modes use different index spaces.
- Detail and fullscreen preview have different history, layout-settling, image, and
  lifecycle requirements.
- Selection anchor, explicit focus, and viewport anchor are intentionally different
  identities.

Merging those surfaces would make performance harder to reason about and would likely
increase rerendering, allocations, or branch density in hot paths.

The valuable consolidation opportunities are narrower and more concrete:

1. Put one owner around selection reconciliation scheduling and metadata revisions.
2. Put one in-flight owner around each sort-distribution request.
3. Resolve sort kind once before choosing a percentile or keyword seek strategy.
4. Reuse keyword composite paging privately only where useful; persistent API continuation
  needs a scoped contract decision, not a storage choice made by this audit.
5. Put history entry creation through the existing fresh-key navigation boundary.
6. Make local/global coordinate conversion explicit at the data-window boundary.
7. Reuse existing UI sort-kind descriptors; optional linear display-value helpers must
  not become a second authority for D3's cursor clause or server-returned tuples.

There are also several defects exposed by duplicated ownership. They should be fixed
before broad DRY work because they combine correctness risk with avoidable runtime
cost.

## Evidence classes

| Class | Meaning |
|---|---|
| **Correctness** | Source proves a state, identity, invalidation, or coordinate invariant can be violated. |
| **Confirmed waste** | Source proves avoidable network, full-scan, parsing, layout, allocation, or subscription work occurs. |
| **Measurement-gated** | The algorithm or subscription is plausibly expensive, but source alone does not prove meaningful user-visible cost. |
| **Maintenance-only** | Consolidation reduces drift but has negligible direct runtime benefit. |
| **Do not consolidate** | Similar-looking code has different invariants, or the abstraction would tax a hot path. |

## Priority summary

`Q1–Q6` are this audit's query/data-access findings; `D*` remains reserved for migration.
Priority is relative among confirmed candidates, not an instruction to implement. `Routed` items
belong to the relevant endpoint assessment instead of a broad consolidation batch.
`Done` applies only to the selected scope recorded in Section 9 or the stated prior fix.

| ID | Disposition | Class | Recommendation | Expected performance result | Risk / effort |
|---|---|---|---|---|---|
| S1 | Done | Correctness + confirmed waste | Coalesce private full-recompute requests, including empty selections, without redundant ID queues. | Removes queue-construction waste and closes a stale-state path; full-scan cost itself is not eliminated. | Medium / medium |
| S2 | Done | Correctness + confirmed waste | Deduplicate `add(ids)` and `remove(ids)` within each input batch. | Prevents duplicate reconciliation and metadata/cache work. | Low / small |
| S3 | Done, with narrow G3 | Correctness | Publish metadata-cache revisions reactively without cloning the LRU. | Rerenders only consumers that need newly fetched metadata. | Medium / medium |
| H1 | Done | Correctness | Route coordinated CQL/AI typing-session pushes through fresh-key navigation and predecessor capture. | Removes snapshot-key collisions; not a measured performance gain. | Medium / medium |
| H2 | Done | Correctness | Refresh departing-entry tracking on consumed URL-sync dedupe transitions. | Corrects snapshot attribution without changing Home's search ordering. | Low / small |
| F4 | Done | Correctness | Suppress duplicate restoration per image, not for the component's whole lifetime. | Allows later distinct cached-image restoration; no cursor redesign. | Low-medium / small |
| S6 | Done, hydration only | Correctness | Re-elect a dropped hydration anchor and update the retained-cursor anchor. | Preserves selection integrity; public toggle/action redesign is excluded. | Low-medium / small |
| W1 | Done | Correctness | Convert visible global indices to local indices only in two-tier mode. | Restores deep normal-mode visible-neighbour fallback; neutral cost. | Low / small |
| T1 | Done | Correctness | Key scrubber ticks by actual input identity/content, not only counts. | Prevents stale ticks without adding hot-path work. | Low / small |
| Q1 | Done | Confirmed network waste | Coalesce same-key sort/null-zone distribution requests instead of aborting and restarting them. | Can remove repeated multi-request Elasticsearch work during hover and drag. | Medium / medium |
| Q2 | Done | Confirmed network waste | Resolve keyword versus numeric/date sort before calling percentile estimation. | Removes one known-failing Elasticsearch request from deep keyword seeks. | Low-medium / small |
| Q3 | Done | Confirmed Elasticsearch waste | Set `track_total_hits: false` in position-index chunk requests. | Removes exact total counting from every chunk. | Low / extra small |
| Q4 | Endpoint decision | Confirmed repeated Elasticsearch work | Decide continuation/replay behavior in D5/D6; do not prescribe shared state from this audit. | Potential avoided replay must be checked against correctness and cost. | High / endpoint contract |
| W6 | Done, original omissions | Correctness | Preserve D3's guarded enrichment publication; original omissions are fixed. | No remaining fix or performance gain is claimed here. | No selected work |
| R1 | Optional, outside initial scope | Allocating maximum sorts | Consider a small display-only linear helper separately. | Removes allocating sorts; material responsiveness benefit is unmeasured. | Low-medium / small |
| F1 | Measure | Measurement-gated | Make traversal activation/prefetch single-owner and gate inactive preview subscriptions. | May reduce request scheduling and hidden preview renders. | Medium / medium |
| G1 | Measure | Measurement-gated | Optimize scrubber tick collision/layout passes only after measuring real tick counts. | Potentially changes quadratic scans to linear/log-linear work. | Medium / medium |

## 1. Selection, anchors, and interaction policy

### S1. Full reconciliation is routed through an incremental queue

**Status: Done (18 September 2026).**

**Finding: correctness and confirmed waste.**

`enqueueReconcile(ids, fullRecompute)` always materializes and deduplicates every ID
into an array/set queue before scheduling work. The processor then performs a full
scan of all cached selected images whenever the full flag is set and clears the queue
because the queued items are now redundant
([selection-store.ts](../../../src/stores/selection-store.ts#L204-L258)). All production
call sites that enqueue reconciliation request a full recompute
([selection-store.ts](../../../src/stores/selection-store.ts#L444-L452),
[selection-store.ts](../../../src/stores/selection-store.ts#L556-L566),
[selection-store.ts](../../../src/stores/selection-store.ts#L638-L652),
[selection-store.ts](../../../src/stores/selection-store.ts#L692-L704)).

That means the chunking machinery currently pays queue-construction cost but normally
does not chunk the expensive work. More importantly, `processReconcileChunk()` checks
for an empty chunk before checking `_reconcileNeedsFullRecompute`. A remove-last or
other empty full-recompute request can clear `isReconciling` and return while leaving
the full flag set and the reconciled view stale
([selection-store.ts](../../../src/stores/selection-store.ts#L224-L245)).

**Selected scope:** a private `requestFullReconcile()` should coalesce pending full
requests without constructing an ID queue, including when the selection is empty.
Produce the canonical empty view and clear the scheduling/full-recompute flags.
Preserve current synchronous incremental add/remove behavior. Do not introduce an
incremental scheduling API without a demonstrated caller: all current production
enqueues request a full recompute. This is not a generic scheduler or a promise that
the full-selection scan itself becomes chunked or cheaper.

**Implemented 18 September 2026:** one guarded private full request replaces the
ID queue and handles empty selections, including post-hydration emptiness. Clear
invalidates old callback ownership; cached deltas stay synchronous. Six focused cases
cover the failed-first empty/clear defects and coalescing. All 1,356 units, build and
219 habitual E2Es passed. The full scan remains unchunked; no speedup is claimed.

### S2. Batch add/remove deduplicates against old state, not within the batch

**Status: Done (18 September 2026).**

**Finding: correctness and confirmed waste.**

`add(ids)` filters each input against the original `selectedIds`, so repeated new IDs
survive `newIds`; `remove(ids)` has the symmetric issue for repeated selected IDs
([selection-store.ts](../../../src/stores/selection-store.ts#L492-L526),
[selection-store.ts](../../../src/stores/selection-store.ts#L541-L560)). The final Set is
correct, but reconciliation is occurrence-based: repeated cached images are folded
more than once. `reconcileAdd` increments per-image counts, so this can overcount the
reconciled metadata rather than merely waste CPU
([reconcile.ts](../../../src/lib/reconcile.ts#L164-L187)). The range path can naturally
construct a target-plus-results list containing the same target twice
([useRangeSelection.ts](../../../src/hooks/useRangeSelection.ts#L270-L279)).

**Recommendation:** build `nextIds` and a unique delta in one pass. For add, use the
new Set as the dedupe authority while iterating. For remove, use `delete()`'s boolean
result to form the unique removal delta. Keep one store transaction and one persistence
write.

**Implemented 18 September 2026:** add/remove form unique deltas against the evolving
Set before reconciliation and metadata work. Three failing-first regressions cover
duplicate counts, metadata request inputs and atomic membership/debounced persistence.
All 1,347 units, build and 210 habitual E2Es passed; scheduling and datasource ownership
are unchanged.

### S3. Metadata cache mutation has no targeted reactive contract

**Status: Done, with narrow G3 (18 September 2026).**

**Finding: correctness.**

Fetched images are inserted into the existing mutable `LruMap` instance. The state
update bumps `generationCounter`, but consumers that need cache contents subscribe to
`metadataCache` identity, which does not change
([selection-store.ts](../../../src/stores/selection-store.ts#L619-L650),
[search.tsx](../../../src/routes/search.tsx#L307-L349),
[UsagesSection.tsx](../../../src/components/UsagesSection.tsx#L306-L328)). A separate
rerender may hide the problem, but cache completion itself does not invalidate those
selectors.

**Recommendation:** rename or supplement the generic counter with an explicit
`metadataRevision` and export `useSelectionMetadataRevision()`. Increment it only when
cache contents change; subscribe cache-dependent panel resolvers to it. Do not clone a
cache that can hold thousands of entries merely to change identity.

This is also the right place to consolidate the duplicate focused-or-single-selected
image resolution in the metadata and usages panels
([search.tsx](../../../src/routes/search.tsx#L307-L351),
[search.tsx](../../../src/routes/search.tsx#L377-L417)). Keep the shared resolver narrow
so it does not lift those subscriptions into the entire search page.

**Rechecked 18 September 2026, before S3 implementation:** the current direct-ES
TEST app still left both Details and Usages empty after one cold off-buffer selection's
metadata completed. Cache/buffer identities stayed fixed and no search-store fields
changed. A subsequent panel hide/show revealed the cached data. This was a bounded
store-selection probe after a real seek, not a natural off-screen click. A local
delayed-metadata fixture initially passed unchanged because position-map completion
could trigger an unrelated render; awaiting that completion exposed the failure.

**Implemented 18 September 2026 (S3 plus narrow G3):** changed cache batches publish
one runtime metadata revision without replacing the LRU; panel-local consumers
subscribe, and Details/Usages share their narrow buffer-first/cache-fallback resolver.
No parent-page subscription, persistence or datasource wiring change. Single/multiple
off-buffer rendered regressions and revision/persistence cases pass. All 1,360 units,
build and 224 no-retry E2Es passed after the separately approved clamp fix below.
Post-fix direct-ES TEST verification passed: a cold off-buffer selection after a real
seek updated the mounted description and one usage row with one revision change,
unchanged cache/selection/buffer identities and zero search-store field changes.
Manual performance campaigns remain outstanding.

**Adjacent live finding, 18 September 2026: selection-panel placeholder flash.**
**Status: Done (separately approved follow-up).**

This was separate from missing cache notifications and needed the follow-up below. Ordinary
2-to-3-to-2 UI selection changes exposed 29 pending fields after an uncached add and
19 dirty fields after a cached removal. A subsequent controlled store-toggle probe
confirmed an intermediate rendered frame with 18 "Empty" placeholders on removal,
then the final values. No network fetch was required for that cached removal.
[Uncached additions mark the view pending](../../../src/stores/selection-store.ts#L399);
[mixed-field removals cannot resolve their remaining values incrementally](../../../src/lib/reconcile.ts#L271),
so [idle full reconciliation](../../../src/stores/selection-store.ts#L199) follows.
[The renderer replaces pending/dirty fields](../../../src/components/MultiImageMetadata.tsx#L180)
with the [literal "Empty" placeholder](../../../src/components/metadata-primitives.tsx#L267)
or suppresses show-if-all-same fields. This is an explicit intermediate display state,
not evidence of generic React double rendering.

**Implemented as a separately approved follow-up:** the panel-local resolver retains
completed presentations while replacement metadata/reconciliation is pending; child
summaries receive matching image references, fields and totals rather than reading a
newer live selection independently. Membership remains immediate, with `aria-busy`
on retained panel content. Initial publication, resolved single-image transitions,
clear/late-response cancellation and failed-fetch data absence remain supported.
No store scheduling, persistence, datasource or LRU-cloning changes were made.
Two held-fetch/idle regressions failed before the fix; those lifecycle journeys and
both existing S3 publication controls pass. All 1,360 units, full build and 226 E2Es
passed with retries disabled (4.8m). A post-fix direct-ES TEST 2-to-3-to-2 UI sequence
exercised an uncached add and cached removal without forced delays. Both recorded
only pre-change and completed panel content, with no sampled intermediate content;
selection/checkmarks changed immediately while the prior display remained busy.
Internal pending/dirty states still occurred as expected. Clearing selection restored
the placeholder and cleared busy state; the recorder and subscription were removed.
The selected implementation queue is complete. The subsequent four-repetition
direct-ES campaign, "After perf-audit work" (18 September), is retained in the
[jank results](../../../e2e-perf/results/audit-log.json) and
[perceived results](../../../e2e-perf/results/perceived-log.json). It does not isolate
this fix from the other intervening changes or establish a causal speedup.

Investigation limits: one hover-control attempt timed out before changing selection;
no product failure was inferred from it. A stretched cached-add frame sample was not
used to infer latency. Probe state was removed afterward.

### S4. Full scans mutate LRU order

**Finding: measurement-gated.**

`LruMap.get()` is a delete-plus-set operation, so every read refreshes recency
([selection-store.ts](../../../src/stores/selection-store.ts#L46-L61)). Reconciliation
and selected-image panels repeatedly call it while scanning the selected set
([selection-store.ts](../../../src/stores/selection-store.ts#L243-L255),
[MultiImageMetadata.tsx](../../../src/components/MultiImageMetadata.tsx#L307-L315),
[UsagesSection.tsx](../../../src/components/UsagesSection.tsx#L317-L324)). Those bulk
reads both mutate the Map and distort recency based on render/reconciliation order.

**Recommendation:** add `peek(key)` for bulk derivation and reserve `get(key)` for
genuine access that should refresh recency. Measure large-selection reconciliation
before prioritizing this over S1-S3.

### S5. Range data is assembled eagerly in multiple event handlers

**Finding: confirmed repeated work, moderate design risk.**

Grid, table, and long-press handlers independently read stores, locate anchor/target
images, touch the metadata LRU, and extract sort values
([ImageGrid.tsx](../../../src/components/ImageGrid.tsx#L700-L755),
[ImageTable.tsx](../../../src/components/ImageTable.tsx#L598-L687),
[handleLongPressStart.ts](../../../src/lib/handleLongPressStart.ts#L33-L57)). Most clicks
do not become range selections, while `useRangeSelection` reads the stores again and
already owns endpoint fallback resolution
([useRangeSelection.ts](../../../src/hooks/useRangeSelection.ts#L98-L137)). Missing data
is currently converted to plausible sentinels (`0` and `[]`) in both click and
long-press policy
([interpretClick.ts](../../../src/lib/interpretClick.ts#L115-L132),
[handleLongPressStart.ts](../../../src/lib/handleLongPressStart.ts#L44-L53)).

**Disposition:** do not implement an ID-only `RangeIntent` as a standalone cleanup.
D3 client tuple retention is implemented; preserve this evidence for the remaining D2
range ID-versus-cursor contract decision before changing these callers. If that contract chooses
IDs, resolve both endpoints once at the range owner/server boundary and reject unavailable
endpoints rather than manufacturing valid-looking coordinates. Do not optimize image-derived
cursor assembly before that decision.

### S6. Hydration can retain a removed anchor

**Status: Done (hydration-only scope, 18 September 2026).**

`interpretClick` emits `set-anchor` followed by `toggle`, and long-press performs an
equivalent two-action sequence
([interpretClick.ts](../../../src/lib/interpretClick.ts#L96-L108),
[dispatchClickEffects.ts](../../../src/lib/dispatchClickEffects.ts#L48-L68),
[handleLongPressStart.ts](../../../src/lib/handleLongPressStart.ts#L57-L70)). The store's
public shape says toggle changes selection, but anchor atomicity is enforced by
call-site order. Hydration can also drop an anchored missing ID without re-electing
the anchor
([selection-store.ts](../../../src/stores/selection-store.ts#L657-L690)).

**Selected scope:** when hydration removes the current anchor, use the existing
fallback-election policy to choose a retained ID or null, and update the retained-cursor
anchor consistently. Preserve an anchor that remains selected. This also supports
D9's eventual omission of unauthorized IDs without choosing its transport or wiring.

The external action sequence is a separate maintenance observation, not authorization
for `toggleAtAnchor`, a shared action framework or a public toggle contract change.
Those broader changes are excluded from the initial queue.

**Implemented:** successful hydration re-elects a removed current anchor using the
existing last-insertion-order policy, or null when no IDs remain, and moves retained
cursor ownership alongside membership publication. Surviving and unset anchors stay
unchanged. Removed/empty-anchor regressions failed first; all four anchor cases also
check ownership after recent-cursor eviction and preserve the single metadata fetch.
No live images were deleted to create this case, and public selection actions are unchanged.

### Keep these boundaries

- Keep selection anchor, explicit focus, and viewport anchor separate. They drive
  range polarity, keyboard/detail semantics, and position preservation respectively
  ([selection-store.ts](../../../src/stores/selection-store.ts#L331-L370),
  [search-store.ts](../../../src/stores/search-store.ts#L1950-L1965),
  [useDataWindow.ts](../../../src/hooks/useDataWindow.ts#L134-L181)).
- Keep `useEffectiveFocusMode()` for rendering and `getEffectiveFocusMode()` for
  stable imperative listeners. They solve different subscription requirements
  ([ui-prefs-store.ts](../../../src/stores/ui-prefs-store.ts#L84-L94),
  [useListNavigation.ts](../../../src/hooks/useListNavigation.ts#L390-L405)).
- Do not create a generic click/keyboard/long-press command framework. Click policy is
  already pure, keyboard intentionally handles key repeat directly, and long press
  has non-destructive selection rules
  ([interpretClick.ts](../../../src/lib/interpretClick.ts#L88-L142),
  [useListNavigation.ts](../../../src/hooks/useListNavigation.ts#L390-L449),
  [handleLongPressStart.ts](../../../src/lib/handleLongPressStart.ts#L33-L72)).

## 2. Seek, sort distributions, and Elasticsearch

### Q1. Same-key distribution requests abort and restart

**Status: Done (18 September 2026).**

**Finding: confirmed network waste.**

Despite its name, `onFirstInteraction` is called on track clicks, pointer-down, and
qualifying mouse moves. The component comment explicitly says it is called for every
interaction
([Scrubber.tsx](../../../src/components/Scrubber.tsx#L255-L269),
[Scrubber.tsx](../../../src/components/Scrubber.tsx#L605-L620),
[Scrubber.tsx](../../../src/components/Scrubber.tsx#L650-L663),
[Scrubber.tsx](../../../src/components/Scrubber.tsx#L752-L775)). The store skips only a
completed key. If a same-key request is still in flight, the next call aborts it and
starts over
([search-store.ts](../../../src/stores/search-store.ts#L4082-L4125)). The null-zone
distribution uses the same completed-cache/abort pattern
([search-store.ts](../../../src/stores/search-store.ts#L4127-L4160)).

**Recommendation:** give each distribution owner a keyed in-flight promise:

```ts
ensureSortDistribution(key): Promise<SortDistribution | null>
ensureNullZoneDistribution(key): Promise<SortDistribution | null>
```

Calls for the same key share work. A changed key aborts the old controller and starts
a new request. Completion must still verify the current params key before publishing.
This is preferable to a one-shot guard in `Scrubber`: the store is the only layer that
knows whether a key is complete, in flight, stale, or superseded.

The null-zone key must also include the primary `missingField`; query, sort and direction
alone do not identify the requested distribution
([search-store.ts](../../../src/stores/search-store.ts#L4127-L4160)). Keep coalescing in the
store, above the concrete adapter, and retain stale-publication guards.

**Implemented:** each loader owns a private keyed promise and controller. Matching
callers await the same work; changed scopes and search invalidation cancel older
requests. Publication and final cleanup require current ownership, so an old A
cannot overwrite a later A after A-to-B-to-A changes or clear its pending slot.
Null-zone identity includes the missing field and current uploadTime direction.
Rejected/aborted work can retry; primary null results retain their existing completed
cache behavior and null-zone null results remain retryable. Controlled-promise cases
cover sharing, scope separation, retries, cancellation before dispatch and after a
same-query search, and superseded completion. No generic scheduler or adapter API
change was introduced. Final local unit/build/E2E gates and the guarded ES oracle
passed; no post-fix TEST request probe or performance campaign was run for Q1/Q2.

### Q2. Keyword deep seek asks for an invalid percentile first

**Status: Done (18 September 2026).**

**Finding: confirmed network waste on the deep keyword branch.**

The deep-seek planner calls `estimateSortValue` for any non-null primary field before
it resolves the keyword field. When Elasticsearch rejects percentiles on a keyword,
the adapter catches the error and returns `null`, after which the store enters the
keyword strategy
([search-store.ts](../../../src/stores/search-store.ts#L3178-L3235),
[es-adapter.ts](../../../src/dal/es-adapter.ts#L1428-L1497)). The keyword-seek test counts
the extra request explicitly
([search-store-keyword-seek.test.ts](../../../src/stores/search-store-keyword-seek.test.ts#L84-L116)).

**Selected scope:** resolve the existing `resolveKeywordSortInfo` descriptor before
primary estimation; no new sort spec or registry is needed. Dispatch keyword sorts
directly to cached distribution/composite logic. Retain the
percentile path for numeric and date sorts. For a resolved keyword bucket, retain the
later valid scoped `uploadTime` percentile used to land within that bucket
([search-store.ts](../../../src/stores/search-store.ts#L3235-L3295)). This removes only the
known-invalid keyword-primary request.

**Implemented:** the descriptor is resolved before primary estimation, routing
keyword sorts directly to existing cached-bucket/composite handling. The descriptor
also contains width/height for distribution lookup, so canonical numeric keys keep
their primary percentile path; dates and bucket-scoped uploadTime also remain intact.
Cached and uncached keyword regressions failed on the extra primary request before
the fix. Numeric controls caught and prevented an over-broad descriptor-only guard.
No new registry, cursor construction or sort semantics were introduced.

### Q3. Position-index chunks request unused exact totals

**Status: Done (18 September 2026).**

**Finding: confirmed Elasticsearch waste.**

Every `fetchPositionIndex` chunk sends `track_total_hits: true`. The response type
declares `hits.total`, but the loop reads only returned hits, their sort tuples, and
whether the page is shorter than the requested size
([es-adapter.ts](../../../src/dal/es-adapter.ts#L2090-L2158)).

**Recommendation:** set `track_total_hits: false` and remove the unused response field.
This is the cleanest performance-first change in the audit: no control-flow or result
semantics depend on the exact total. Preserve this as an acceptance rule for any future
server position-index implementation; it does not change ordinary first-page count needs.

**Implemented 18 September 2026:** chunks omit exact totals and the unused response
field is removed. A failing-first multi-chunk regression preserves both phases and
PIT cursor behavior without response totals; additional guards retain the uploadTime
missing phase and ordinary first-page counts. All 1,344 units, build, 210 habitual E2Es
and the guarded local ES oracle passed. No speedup or live TEST result is claimed.

The same function always builds and executes a second missing-primary phase whenever
there is a primary field
([es-adapter.ts](../../../src/dal/es-adapter.ts#L2004-L2072),
[es-adapter.ts](../../../src/dal/es-adapter.ts#L2159-L2175)). Elsewhere, source treats
`uploadTime` as universal
([search-store.ts](../../../src/stores/search-store.ts#L4132-L4143)). Under that invariant,
the default upload-time position map makes an empty second query. **Skipping that phase
is excluded from this Q3 fix.** Any separate proposal must first document whether
corrupt/missing upload times must still be represented. The selected change disables
unused totals only; it preserves both paging phases and ordinary first-page counts.

### Q4. Keyword distribution and deep-seek walks duplicate composite paging

**Finding: confirmed overlap and repeated requests.**

`findKeywordSortValue` and `getKeywordDistribution` independently build the same
composite source, request body, after-key pagination, and bucket parsing
([es-adapter.ts](../../../src/dal/es-adapter.ts#L1499-L1609),
[es-adapter.ts](../../../src/dal/es-adapter.ts#L1638-L1729)). Distribution deliberately
stops after five pages. A target beyond that represented prefix starts
`findKeywordSortValue` again at page zero and can walk up to fifty pages. The fallback
for a truncated prefix is an explicit tested path
([search-store-keyword-seek.test.ts](../../../src/stores/search-store-keyword-seek.test.ts#L170-L210)).

**Disposition:** do not implement client-held continuation or a resumable client walker.
The duplicated paging evidence remains useful to migration D5/D6 if those endpoints survive
their value gate. Any cross-request continuation must be an opaque server capability bound to
normalized query/filter/sort, authorization, cumulative rank, producer version and one
snapshot. If migration D5 is replaced by a rank oracle, this optimization has no consumer and
should be abandoned. A private non-resumable helper is optional maintenance work only.

### Q5. Sort semantics have three partial registries

**Finding: maintenance overlap with runtime opportunities.**

`sort-context.ts` maintains label/value/distribution maps and parsers, while
`sort-builders.ts` independently resolves aliases, Elasticsearch clauses, nested
settings, special date modes, and reversal
([sort-context.ts](../../../src/lib/sort-context.ts#L20-L111),
[sort-context.ts](../../../src/lib/sort-context.ts#L289-L352),
[sort-builders.ts](../../../src/dal/adapters/elasticsearch/sort-builders.ts#L93-L169)).
There is no proven current divergence, but adding a sort requires coordinated edits.

**Disposition:** do not create another authoritative client sort registry. D3's completed
amendments retain Option B; a semantic server builder is an unselected alternative.
Preserve this inventory for parity fixtures if such a replacement is separately approved.
Existing UI descriptors can own kind, display extraction and labeling; Q2 reuses them
without changing clause ownership. Keep Elasticsearch options in their existing DAL/server
owner and labels/tick policy in UI.

### Q6. Null-zone planning overlaps but evidence differs by layer

`null-zone.ts` already centralizes cursor detection, missing-field filtering, fallback
sorts, and tuple restoration for pagination
([null-zone.ts](../../../src/dal/null-zone.ts#L35-L121)). Position-index construction
re-derives primary field, exists/missing queries, fallback clauses, and tuple injection
([es-adapter.ts](../../../src/dal/es-adapter.ts#L1982-L2072)). A small pure
`buildNullZonePlan(sortClause)` could prevent query-shape drift.

Do not collapse UI null-zone detection into the same boolean. UI labeling infers the
zone from global position and `coveredCount`, while the DAL proves it from a null-bearing
cursor tuple
([sort-context.ts](../../../src/lib/sort-context.ts#L971-L1027),
[null-zone.ts](../../../src/dal/null-zone.ts#L42-L86)). They share a sort plan, not evidence.

**Disposition:** do not extract a standalone cross-language abstraction before the D3/D8
workplan assigns ownership. Preserve the cases as behavior fixtures: nested exists,
primary removal, full-tuple null remapping, reverse order and overshoot. Approximate UI
distribution evidence must not enter cursor or exact-rank decisions.

### Keep these boundaries

- Do not merge distribution floor lookup with seek bucket containment. One deliberately
  returns the preceding bucket across gaps; the other rejects unrepresented tails
  ([sort-context.ts](../../../src/lib/sort-context.ts#L358-L410),
  [search-store.ts](../../../src/stores/search-store.ts#L961-L980)).
- Do not add an eager ID-to-position Map to `PositionMap` without measurement. Its
  compact parallel arrays serve the dominant position-to-cursor path; reverse lookup
  currently has few call sites
  ([position-map.ts](../../../src/dal/position-map.ts#L28-L76),
  [useRangeSelection.ts](../../../src/hooks/useRangeSelection.ts#L125-L134)).
- Do not merge local tuple comparison with `countBefore`. One terminates an in-memory
  walk; the other constructs an Elasticsearch lexicographic rank query
  ([es-adapter.ts](../../../src/dal/es-adapter.ts#L99-L124),
  [es-adapter.ts](../../../src/dal/es-adapter.ts#L1278-L1400)).

## 3. URL search, history, snapshots, and caches

### H1. Typed search creates two entries with one identity

**Status: Done (18 September 2026).**

**Finding: correctness.**

On the first keystroke, both CQL and AI input handlers call raw
`history.pushState(history.state, ...)`, cloning the current `kupuaKey`. Their settled
updates replace that newly pushed entry and preserve its cloned key
([SearchBar.tsx](../../../src/components/SearchBar.tsx#L74-L124)). The history helper's
explicit contract is fresh key on push and current key on replace
([history-key.ts](../../../src/lib/orchestration/history-key.ts#L48-L99)). Consequently,
the pre-edit and settled-search entries can share one snapshot slot; the raw push also
bypasses the normal predecessor snapshot capture in `pushNavigate`
([search.ts](../../../src/lib/orchestration/search.ts#L356-L379)).

**Recommendation:** remove raw same-URL pushes. Start a typing session through a shared
push navigation that captures the predecessor and assigns `withFreshKupuaKey()`, then
let settled debounce updates replace that entry. This should be an explicit typing
primitive, not a generic history state machine, because CQL and AI timers need one
coordinated session boundary.

**Implemented 18 September 2026:** both editors use the shared typing-entry action
and existing fresh-key/snapshot push boundary, with one session while either debounce
is pending. Settled edits still replace. A typed-key regression failed before the fix;
CQL, mocked AI and controlled overlapping-edit coverage now pass. All 1,350 units,
build and 219 habitual E2Es passed; Home/fullscreen implementations remain unchanged.

### H2. Home reset can leave `_lastKupuaKey` stale

**Status: Done (18 September 2026).**

**Finding: correctness.**

Home reset preloads URL-sync's serialized dedupe state before awaiting its direct
search
([reset-to-home.ts](../../../src/lib/reset-to-home.ts#L42-L63)). The caller then pushes a
new entry with a fresh key, but `useUrlSearchSync` returns at the dedupe guard before
updating `_lastKupuaKey`; that assignment happens only later in the non-dedup path
([useUrlSearchSync.ts](../../../src/hooks/useUrlSearchSync.ts#L145-L165),
[useUrlSearchSync.ts](../../../src/hooks/useUrlSearchSync.ts#L350-L362)). A later Back can
therefore capture the departing Home state under the previous entry's key.

**Recommendation:** update `_lastKupuaKey = getCurrentKupuaKey()` before every dedupe
return that has consumed the navigation transition. Keep Home's direct awaited search;
its ordering is distinct from normal URL-driven search.

**Implemented 18 September 2026:** the consumed dedupe return refreshes the current
entry key. A failing-first Home/Back/Forward regression preserves an existing predecessor
snapshot and captures Home under its own key. All 1,350 units, build and 215 habitual
E2Es passed. Home's awaited search and navigation ordering are unchanged.

### H3. Search identity is duplicated, but it is not one universal key

URL dedupe projects display-only keys and serializes an object; history snapshots and
the image-offset cache build a sorted search key; Home manually reconstructs the search
projection and reset shape
([useUrlSearchSync.ts](../../../src/hooks/useUrlSearchSync.ts#L137-L154),
[build-history-snapshot.ts](../../../src/lib/build-history-snapshot.ts#L36-L55),
[image-offset-cache.ts](../../../src/lib/image-offset-cache.ts#L31-L43),
[reset-to-home.ts](../../../src/lib/reset-to-home.ts#L47-L62)). This invites drift and
repeated object scans/sorts.

**Recommendation:** centralize the projection, not every key:

```ts
projectSearchParams(params): SearchOnlyParams
buildStableSearchFingerprint(searchOnly): string
diffSearchParams(previous, next): SearchKey[]
URL_SEARCH_RESET: Readonly<SearchOnlyParams>
```

URL dedupe, snapshot identity, and offset-cache identity may consume the stable
projection. Aggregation keys must remain separate because they intentionally omit or
append different dimensions
([search-store.ts](../../../src/stores/search-store.ts#L659-L703)).

**Disposition:** preserve this projection work as input to the relevant API contract assessment. A local
fingerprint may serve URL dedupe or cache invalidation, but never authenticates or resumes
a server snapshot/session. Keep local equivalence separate from server
query, sort, authorization, read-epoch and protocol identity.

### H4. Snapshot capture repeats anchor election and storage choreography

Build-and-store is repeated around user pushes, popstate departure, and pagehide
([search.ts](../../../src/lib/orchestration/search.ts#L300-L316),
[useUrlSearchSync.ts](../../../src/hooks/useUrlSearchSync.ts#L250-L288),
[main.tsx](../../../src/main.tsx#L37-L52)). During a phantom transition, URL sync can elect
the viewport anchor to decide whether a snapshot changed, elect it again inside the
snapshot builder, and elect it again when collecting visible neighbours
([useUrlSearchSync.ts](../../../src/hooks/useUrlSearchSync.ts#L268-L284),
[useUrlSearchSync.ts](../../../src/hooks/useUrlSearchSync.ts#L330-L391),
[useDataWindow.ts](../../../src/hooks/useDataWindow.ts#L134-L190)). Each election queries
rendered nodes and reads their rectangles.

**Recommendation:** add one `captureHistorySnapshot(key, hints?)` operation next to the
builder. Allow an already-elected anchor ID/geometry to be passed through. Change
`getVisibleImageIds` to accept an anchor to exclude, avoiding its second election.
Measure layout events before attempting more elaborate caching: viewport geometry can
be stale immediately after resize or density change.

### H5. Session snapshot LRU repeats parsing and array allocation

The session-backed store scans storage when constructed, parses JSON on each storage
hit, and refreshes order with `_order.filter(...)`
([history-snapshot.ts](../../../src/lib/history-snapshot.ts#L114-L189)). Back/forward tends
to revisit a small working set.

**Recommendation:** use an insertion-ordered Map as an in-memory read-through LRU over
session storage. This can remove repeated parsing and list allocation while preserving
synchronous durability. Do not defer writes without a flush protocol because capture
must precede navigation/pagehide.

### H6. Sort-value extraction recompiles sort clauses

The image-offset cache rebuilds sort clauses each time it extracts one image's cursor
([image-offset-cache.ts](../../../src/lib/image-offset-cache.ts#L70-L116)). Grid/table range
assembly can extract target and anchor separately. If sort configuration is immutable
during a search, compiling an extractor would remove repeated clause parsing.

**Current disposition:** D3 amendment C1 implemented authoritative response-tuple retention.
That resolves the original ownership prerequisite, not approval for this optimization.
Server-returned tuples or server resolution remain authoritative; a raw-image fallback follows
fields that lean API images may omit. Compiling that fallback is separate maintainability/
performance work, not a replacement cursor contract.

### Keep these boundaries

- Do not merge history snapshots and image-offset records into one generic storage
  abstraction. Their keys, validation, eviction, write timing, and lifetime differ
  ([history-snapshot.ts](../../../src/lib/history-snapshot.ts#L76-L189),
  [image-offset-cache.ts](../../../src/lib/image-offset-cache.ts#L118-L164)).
- Do not route Home's awaited search back through URL sync. Its buffer replacement must
  finish before density navigation
  ([reset-to-home.ts](../../../src/lib/reset-to-home.ts#L93-L184)).
- Do not mint a fresh key for fullscreen's same-URL phantom entry. It is a transient
  back absorber, not a distinct searchable state
  ([FullscreenPreview.tsx](../../../src/components/FullscreenPreview.tsx#L139-L160),
  [FullscreenPreview.tsx](../../../src/components/FullscreenPreview.tsx#L376-L411)).

## 4. Data window, scrolling, views, and geometry

### W1. Visible-range coordinates are converted as if every mode were two-tier

**Status: Done (18 September 2026).**

**Finding: correctness.**

Normal mode reports buffer-local visible indices, while two-tier mode reports global
indices
([useDataWindow.ts](../../../src/hooks/useDataWindow.ts#L363-L435)).
`getVisibleImageIds()` nevertheless subtracts `bufferOffset` unconditionally
([useDataWindow.ts](../../../src/hooks/useDataWindow.ts#L173-L190)). With a deep normal-mode
buffer, valid local indices become negative or out of range and visible-neighbour
fallback can become empty. Those neighbours are used when promoting phantom focus
([useUrlSearchSync.ts](../../../src/hooks/useUrlSearchSync.ts#L380-L397)).

**Recommendation:** snapshot `total` with the store state and use
`isTwoTierFromTotal(total) ? index - bufferOffset : index`. Add a normal-mode test with
nonzero `bufferOffset`; existing anchor tests emphasize global/two-tier ranges
([useDataWindow-anchor.test.ts](../../../src/hooks/useDataWindow-anchor.test.ts#L75-L112)).

**Implemented 18 September 2026:** visible-neighbour lookup uses the existing
total-based predicate before converting indices. Deep and small normal-mode regressions
failed on the old conversion; both and a map-absent two-tier control now pass. All 1,350
units, build and 210 habitual E2Es passed without changing anchor election or scrolling.

### W2. The two-tier predicate already exists but is restated

`isTwoTierFromTotal` is the existing canonical predicate
([two-tier.ts](../../../src/lib/two-tier.ts#L10-L14)). `useDataWindow` uses it, while the
route and several store branches restate the thresholds
([useDataWindow.ts](../../../src/hooks/useDataWindow.ts#L338-L346),
[search.tsx](../../../src/routes/search.tsx#L134-L146),
[search-store.ts](../../../src/stores/search-store.ts#L1637-L1648),
[search-store.ts](../../../src/stores/search-store.ts#L3678-L3691)).

**Recommendation:** reuse the helper everywhere. This is maintenance-only but protects
the coordinate-space decision. In `useDataWindow`, derive the boolean from its already
subscribed `total` rather than adding a second selector subscription
([useDataWindow.ts](../../../src/hooks/useDataWindow.ts#L305-L343)).

### W3. Edge loading may perform two checks and three extra DOM reads per scroll

`reportVisibleRange()` performs index-based edge detection and extension. The same
scroll handler then reads `scrollHeight`, `scrollTop`, and `clientHeight` for a second
near-bottom `loadMore` path
([useScrollEffects.ts](../../../src/hooks/useScrollEffects.ts#L335-L369),
[useDataWindow.ts](../../../src/hooks/useDataWindow.ts#L385-L421)).

This may be fallback coverage when `virtualizer.range` is null or stale, so source alone
does not justify removal. Add a test for that condition and measure scroll layout reads.
If range reporting is reliable, gate the pixel fallback to `range === null`. Do not
remove it merely for DRYness.

### V1. Per-visible-item getter claim refuted

**Correction (18 September 2026):** the grid and table expressions test
`image.id === focusedImageId` before calling `getEffectiveFocusMode()`
([ImageGrid.tsx](../../../src/components/ImageGrid.tsx#L945),
[ImageTable.tsx](../../../src/components/ImageTable.tsx#L474)). Short-circuit evaluation
normally reaches the getter only for the matching focused item, not every rendered
cell or row. The original per-item cost claim and its optimization recommendation are
withdrawn from all queues and summaries. A separate reactivity defect would need its
own evidence; this finding does not justify adding renderer subscriptions.

### W4. Row mapper callbacks duplicate arithmetic and trigger return-effect churn

Grid and table allocate inline `flatIndexToRow` functions for shared hooks
([ImageGrid.tsx](../../../src/components/ImageGrid.tsx#L837-L868),
[ImageTable.tsx](../../../src/components/ImageTable.tsx#L935-L956)).
`useReturnFromDetail` includes the function in its effect dependencies
([useReturnFromDetail.ts](../../../src/hooks/useReturnFromDetail.ts#L155-L171)). Ordinary
renderer rerenders can therefore rerun transition logic even though the mapping is just
division by `columnsPerRow`.

**Recommendation:** pass `columnsPerRow` to `useReturnFromDetail` and calculate the row
inside the hook, or move terminal image-centering to the registered scroll owner. Keep
fullscreen's delayed resize-settle behavior separate.

### W5. Click context and detail-entry assembly are duplicated cold-path code

Grid and table both decode modifiers, assemble selection/range context, cache detail
entry offsets, and navigate
([ImageGrid.tsx](../../../src/components/ImageGrid.tsx#L674-L755),
[ImageTable.tsx](../../../src/components/ImageTable.tsx#L568-L687)). Policy and effect
execution are already shared in `interpretClick` and `dispatchClickEffects`
([interpretClick.ts](../../../src/lib/interpretClick.ts#L88-L142),
 [dispatchClickEffects.ts](../../../src/lib/dispatchClickEffects.ts#L36-L75)).

Consolidate small pure context builders only after S5 decides range-intent ownership.
A separate `useEnterImageDetail` can own cache/navigation ordering if grid/table tracing
differences are explicitly preserved. This is maintainability work, not a render-path
optimization.

### W6. Search-store first-page fallback patches repeat publication state

**Update (17 September 2026):** the enrichment omissions described below were fixed by
the completed D3 amendment batch. The original duplication observation and
possible maintainability refactor remain historical recommendations, not unfinished D3 work.

Several `_findAndFocusImage` fallbacks publish nearly the same first-page/reset patch
([search-store.ts](../../../src/stores/search-store.ts#L1468-L1492),
[search-store.ts](../../../src/stores/search-store.ts#L1547-L1572),
[search-store.ts](../../../src/stores/search-store.ts#L1838-L1862)). One differs in seek
target resets. More importantly, `fallbackFirstPage` omits its enrichment map, so fallback
publication cannot replace the overlay. On success, the visible one-image probe target is
inserted into the buffer while `_loadBufferAroundImage` merges only surrounding-page
enrichment. Both paths can therefore render stale server-authoritative fields.

**Original disposition:** this is D3 client completeness, not independent cold-path DRY. Feed it into
the bounded D3 readiness assessment. Every committed image must bring its enrichment; discarded probes have
no side effect; fresh/fallback publication replaces while additive buffers upsert. A shared
publication helper is useful only if it preserves those different semantics.

### Existing abstractions that should remain

- `useScrollEffects` is already the right shared scroll lifecycle. Grid and table pass
  geometry into it rather than duplicating handlers
  ([ImageGrid.tsx](../../../src/components/ImageGrid.tsx#L560-L579),
  [ImageTable.tsx](../../../src/components/ImageTable.tsx#L760-L779),
  [useScrollEffects.ts](../../../src/hooks/useScrollEffects.ts#L237-L369)).
- `alignBufferStart` is already reused for fresh landings, corrected focus landings,
  backward extension, and seeks
  ([buffer-column-align.ts](../../../src/lib/buffer-column-align.ts#L45-L62),
  [search-store.ts](../../../src/stores/search-store.ts#L1336-L1350),
  [search-store.ts](../../../src/stores/search-store.ts#L3487-L3502)). Forward eviction
  rounds removed items for survivor alignment and should not be forced through the same
  API
  ([search-store.ts](../../../src/stores/search-store.ts#L2529-L2546)).
- `scroll-container-ref` needs subscriptions because active elements change;
  `scroll-geometry-ref` is an imperative snapshot and does not. A generic mutable-ref
  factory would erase a useful performance distinction
  ([scroll-container-ref.ts](../../../src/lib/scroll-container-ref.ts#L28-L71),
  [scroll-geometry-ref.ts](../../../src/lib/scroll-geometry-ref.ts#L17-L33)).
- `useHeaderHeight` measures border-box header size; grid resize must capture an image
  anchor before changing columns. They both use geometry, but not the same operation
  ([useHeaderHeight.ts](../../../src/hooks/useHeaderHeight.ts#L23-L57),
  [ImageGrid.tsx](../../../src/components/ImageGrid.tsx#L475-L510)).
- `tuning.ts` and `layout.ts` are already centralized at the useful boundary: behavior
  knobs versus fixed geometry constants
  ([tuning.ts](../../../src/constants/tuning.ts#L1-L35),
  [layout.ts](../../../src/constants/layout.ts#L1-L28)).

### Do not merge these geometry surfaces

- Do not merge grid and table renderers. Grid virtualizes rows containing cells;
  table combines TanStack row models, visible-data limiting, CSS column variables, and
  memo boundaries
  ([ImageGrid.tsx](../../../src/components/ImageGrid.tsx#L875-L966),
  [ImageTable.tsx](../../../src/components/ImageTable.tsx#L800-L855),
  [ImageTable.tsx](../../../src/components/ImageTable.tsx#L1200-L1225)). A common renderer
  would add branches and broaden updates in the hottest UI surface.
- Do not make a generic local/global conversion helper. Buffer access, virtualizer
  lookup, traversal, route labels, and anchor restoration use different bounds and
  coordinate guarantees
  ([useDataWindow.ts](../../../src/hooks/useDataWindow.ts#L443-L483),
  [useImageTraversal.ts](../../../src/hooks/useImageTraversal.ts#L80-L91),
  [grid-scroll-anchor.ts](../../../src/lib/grid-scroll-anchor.ts#L54-L89)). Make mode
  explicit at the owning boundary instead.
- Do not merge `electViewportAnchor` and grid resize anchoring. One elects a candidate
  from DOM client rectangles; the other preserves an already-selected identity in
  virtual scroll coordinates
  ([viewport-anchor-geometry.ts](../../../src/lib/viewport-anchor-geometry.ts#L14-L53),
  [grid-scroll-anchor.ts](../../../src/lib/grid-scroll-anchor.ts#L54-L89)).

## 5. Scrubber derivation and render-time data work

### T1. Tick cache keys omit the data that determines ticks

**Status: Done (18 September 2026).**

**Finding: correctness.**

The route cache key includes order, total, bucket counts, and whether all data is in the
buffer. Tick computation consumes actual result dates, distribution keys, bucket
positions, and null-zone contents
([search.tsx](../../../src/routes/search.tsx#L196-L222),
[sort-context.ts](../../../src/lib/sort-context.ts#L693-L817)). Two searches with equal
totals and equal bucket counts can therefore reuse stale ticks.

**Recommendation:** use referential dependencies (`results`, `sortDistribution`,
`nullZoneDistribution`, `orderBy`, `total`, `bufferOffset`) in `useMemo`, or introduce
an explicit distribution revision generated by the store. Do not hash every bucket on
render; that would turn invalidation correctness into new linear hot-path work.

Track the inputs actually consumed by each mode: do not recompute distribution-only
ticks on irrelevant buffer churn. The live comparison used actual settled inputs,
including an extra focus-preserved buffer image, rather than assuming buffer length
must equal the reported total. Permanent tests should exercise the component contract,
not depend on the diagnostic React-fiber inspection used in that session.

Preserve `coveredCount`, `representedCount`, `complete` and `bucketPositionKind` as distinct
provenance; equal bucket counts do not imply equal distribution content.

**Implemented 18 September 2026:** the route memoizes by consumed data identities,
including buffer results/offset only for date fallback. Three rendered stale-tick
regressions failed before the fix; four permanent cases isolate full-buffer,
one-bucket fallback, primary and null-zone replacements. All 1,350 units, build and
214 habitual E2Es passed. Provenance and sort-context computation remain unchanged;
no performance gain is claimed.

### G1. Tick promotion and label isolation have quadratic scans

**Finding: measurement-gated.**

Tick promotion checks candidates against other ticks, and minor label placement scans
placed ticks, yielding quadratic structures
([Scrubber.tsx](../../../src/components/Scrubber.tsx#L905-L964)). The work is memoized but
can recompute on hover-state transitions
([Scrubber.tsx](../../../src/components/Scrubber.tsx#L1070-L1085)).

**Recommendation:** first record real tick counts and computation duration for normal
date spans. If material, sort once, place major ticks first, and use nearest-neighbour
sweeps or a pixel occupancy structure for minor labels. Preserve boundary and major
priority exactly. Do not optimize this solely from asymptotic shape; typical `n` may be
small.

### G2. Scrubber geometry is rebuilt in several event paths

Thumb placement, position conversion, drag conversion, and tick placement independently
derive thumb height, maximum top, and maximum position
([Scrubber.tsx](../../../src/components/Scrubber.tsx#L60-L74),
[Scrubber.tsx](../../../src/components/Scrubber.tsx#L427-L451),
[Scrubber.tsx](../../../src/components/Scrubber.tsx#L580-L603),
[Scrubber.tsx](../../../src/components/Scrubber.tsx#L673-L699),
[Scrubber.tsx](../../../src/components/Scrubber.tsx#L885-L903)).

Do not create a React geometry object per mousemove. A small pure
`readScrubberGeometry(track, total, visibleCount)` called once per event would improve
consistency and can reduce repeated DOM reads. Benchmark before expanding it; direct DOM
writes are correctly kept outside React during drag.

### R1. Special-sort maxima use allocating sorts in render/label code

**Disposition (18 September 2026):** optional display-only cleanup, outside the initial
implementation scope. Allocating maximum sorts are present, but no material rendering
benefit has been measured. Do not bundle cursor-extractor or sort-contract changes into it.

Grid and sort-label accessors filter and sort usage/collection date arrays to find a
maximum
([ImageGrid.tsx](../../../src/components/ImageGrid.tsx#L139-L160),
[sort-context.ts](../../../src/lib/sort-context.ts#L39-L67)). Elasticsearch cursor
extraction already uses a linear `Date.parse` maximum with explicit instant semantics
([sort-builders.ts](../../../src/dal/adapters/elasticsearch/sort-builders.ts#L20-L66)).

**Recommendation:** create a component-free `image-sort-values.ts` with
`latestUsageDate(image)` and `latestCollectionDate(image)`. Use one allocation-free
linear scan for cells, labels and registry accessors where semantics match. Use instant
comparison so it matches Elasticsearch `mode:max`; verify invalid dates and lexical-versus-
instant behavior. Cursor reconstruction remains defensive fallback only and must not replace
server tuples or snapshot resolution.

Grid also scans usages repeatedly for several flags and dates in each cell
([ImageGrid.tsx](../../../src/components/ImageGrid.tsx#L245-L265)). A one-pass
`deriveUsageSummary(image.usages)` is a cheap follow-on if a render profile shows these
cells matter.

### G3. Route panel resolution is duplicated

**Status: Done with S3 (narrow selected scope, 18 September 2026).**

Metadata and usages sections independently subscribe to and resolve the same
focused-or-single-selected image
([search.tsx](../../../src/routes/search.tsx#L307-L351),
[search.tsx](../../../src/routes/search.tsx#L377-L417)). Consolidate a narrow selector/hook
together with S3's metadata revision. Do not move this state into the parent
`SearchPage`, which would broaden rerenders across the page.

## 6. Detail, traversal, fullscreen preview, and return

### F1. Preview and traversal both schedule entry prefetch

**Finding: confirmed overlap, measurement-gated impact.**

Fullscreen preview manually resolves the local index and calls prefetch on entry, then
activates `useImageTraversal`, whose current-image effect also prefetches nearby images
([FullscreenPreview.tsx](../../../src/components/FullscreenPreview.tsx#L105-L158),
[useImageTraversal.ts](../../../src/hooks/useImageTraversal.ts#L165-L184)). The prefetch
layer suppresses many duplicate network requests, but a second call can still alter
cadence/cancellation and perform scheduling work
([image-prefetch.ts](../../../src/lib/image-prefetch.ts#L252-L287),
[image-prefetch.ts](../../../src/lib/image-prefetch.ts#L421-L438)).

While preview is inactive, traversal still subscribes to results, buffer offset, and
total because the hook is mounted with a null image ID
([useImageTraversal.ts](../../../src/hooks/useImageTraversal.ts#L119-L148)).

**Recommendation:** make `useImageTraversal` the single owner of entry and navigation
prefetch. Feed it the active current image ID, and make its inactive selectors return
stable snapshots. Before changing this, add an activation test that proves exactly one
prefetch schedule and profile inactive preview render counts.

### F2. Detail consumes a broad data-window hook

`ImageDetail` uses `total`, `findImageIndex`, and `getImage` from `useDataWindow`
([ImageDetail.tsx](../../../src/components/ImageDetail.tsx#L79-L85)). The hook also
subscribes to results, offset, loading, focus, density, multiple actions, and derived
mode state
([useDataWindow.ts](../../../src/hooks/useDataWindow.ts#L305-L346)). Traversal separately
resolves current position and adjacent images
([useImageTraversal.ts](../../../src/hooks/useImageTraversal.ts#L119-L155)).

**Recommendation:** let traversal return `currentImage` and use narrow selectors for
the remaining restoration operation and total. This may remove irrelevant detail
rerenders and duplicate lookups, but coordinate-mode behavior makes it a medium-risk,
profile-first refactor.

### F3. Return-to-list row calculation belongs with the mounted list

`useReturnFromDetail` depends on virtualizer details and inline row-mapping callbacks,
despite owning only a transition
([useReturnFromDetail.ts](../../../src/hooks/useReturnFromDetail.ts#L59-L171)). Both lists
already register imperative scrolling/geometry through shared owners
([useScrollEffects.ts](../../../src/hooks/useScrollEffects.ts#L280-L336)).

**Recommendation:** expose a narrow `scrollImageToCenter(imageId)` operation from the
mounted list owner. Detail return can call it on the next frame. Fullscreen preview
must keep its longer settle loop because exiting native fullscreen changes viewport
geometry asynchronously
([FullscreenPreview.tsx](../../../src/components/FullscreenPreview.tsx#L203-L253)).

### F4. Restoration guards overlap and one ref is ineffective

**Status: Done (18 September 2026).**

`ImageDetail` tracks both a boolean attempted flag and an image-ID ref, but the ID ref
is written without being read and the boolean persists across prop changes
([ImageDetail.tsx](../../../src/components/ImageDetail.tsx#L205-L240)). Because the route
keeps the component surface mounted across detail IDs, this can block restoration for a
later distinct missing image
([search.tsx](../../../src/routes/search.tsx#L288-L300)).

**Recommendation:** use one `attemptedImageIdRef` and suppress only when it equals the
current image ID. Treat this as a separate correctness check, not part of a viewer
consolidation.

**Implemented 18 September 2026:** a failing mounted-detail lifecycle test proved
that handling one image suppressed a later distinct cached image. The existing ID
guard now replaces the lifetime boolean. Distinct restores, same-image load/evict
suppression and unchanged cached cursor arguments pass, alongside all 1,350 units,
build and 216 habitual E2Es including the reload flood guard. No live reproduction
or viewer consolidation is claimed.

### Small, safe follow-ons

- Move the shared screen/native-cap URL policy to one helper used by detail current and
  side images, preview, and prefetch. Preview already delegates through
  `getCarouselImageUrl`; detail still reconstructs related policy in places
  ([FullscreenPreview.tsx](../../../src/components/FullscreenPreview.tsx#L60-L70),
  [ImageDetail.tsx](../../../src/components/ImageDetail.tsx#L570-L590),
  [image-prefetch.ts](../../../src/lib/image-prefetch.ts#L220-L235)). Preserve whether
  screen dimensions are read at module load or call time.
- Compute detail's valid usage count once rather than filtering twice for the title and
  again in the usages section
  ([ImageDetail.tsx](../../../src/components/ImageDetail.tsx#L880-L895),
  [UsagesSection.tsx](../../../src/components/UsagesSection.tsx#L234-L244)). This is minor.

### Do not create a shared viewer

- Detail renders a stable three-panel carousel with source preservation; preview renders
  one disposable fullscreen image
  ([ImageDetail.tsx](../../../src/components/ImageDetail.tsx#L780-L870),
  [FullscreenPreview.tsx](../../../src/components/FullscreenPreview.tsx#L460-L495)).
- Detail fullscreen lives inside a stable route container. Preview owns phantom history,
  fullscreen rejection recovery, popstate handling, and delayed return scrolling
  ([ImageDetail.tsx](../../../src/components/ImageDetail.tsx#L294-L338),
  [FullscreenPreview.tsx](../../../src/components/FullscreenPreview.tsx#L139-L160),
  [FullscreenPreview.tsx](../../../src/components/FullscreenPreview.tsx#L255-L293)).
- Keyboard semantics differ: detail is route-active and ignores editable targets;
  preview gates on active/cooldown and assigns different Backspace behavior
  ([ImageDetail.tsx](../../../src/components/ImageDetail.tsx#L500-L570),
  [FullscreenPreview.tsx](../../../src/components/FullscreenPreview.tsx#L405-L452)).

Shared traversal, navigation strips, zoom primitives, image prefetch, and cursor hiding
are already the right low-level boundary. A common viewer component would mostly be a
branch dispatcher in a render-sensitive surface.

## 7. Proposed consolidation map

This map includes deferred proposals; Section 9 alone defines the selected initial scope.

| Concern | Current ownership | Proposed owner | Boundary to preserve |
|---|---|---|---|
| Reconciliation scheduling | Boolean mode plus ID queue in selection store | Private coalesced full-recompute owner | No unused incremental API or generic scheduler |
| Selection metadata invalidation | Mutable LRU plus generic generation counter | Explicit metadata revision hook | Do not clone LRU |
| Range endpoint resolution | Grid, table, long press, range hook | Relevant D2/D3 contract decision | Click policy remains pure; do not pre-choose IDs versus cursors |
| Distribution request lifecycle | Scrubber triggers, store completed-key cache | Keyed in-flight promise in store | Changed key still aborts stale work |
| Primary sort kind | UI maps and DAL clause parsing | Existing descriptor for Q2; any sort-contract replacement separately approved | No second authoritative client API-sort registry |
| Keyword composite paging | Two direct-ES adapter loops | Deferred to migration D5/D6 | No raw/client continuation state |
| Null-zone sort plan | Null-zone adapter and position-index code | Behavior fixtures first; owner assigned by workplan | UI evidence remains position-based |
| Search parameter projection | URL sync, snapshot/cache key, Home | Deferred until server-session identity is separated | Local cache equivalence is not server authority |
| History capture ordering | Push, popstate, pagehide | Snapshot capture operation plus history primitives | Home and fullscreen retain special ordering |
| Visible local/global conversion | Call-site arithmetic | Data-window mode boundary | No universal coordinate helper |
| Special-sort image values | UI array sorts and DAL linear scans | Pure linear image-value helpers | Display values can differ from ES sort values |
| Return centering | Return hook plus renderer callback | Mounted list scroll owner | Fullscreen settle delay remains separate |

## 8. Explicitly rejected broad consolidations

| Tempting consolidation | Decision | Performance-first reason |
|---|---|---|
| One grid/table renderer | Reject | Different virtualization units and memoization boundaries; common code would branch in the hottest surface. |
| One local/global coordinate helper | Reject | Same arithmetic appears under different bounds and mode guarantees; an easy-to-call generic API would hide misuse. |
| One anchor model | Reject | Selection, explicit focus, viewport election, and resize anchoring carry different semantics and lifetimes. |
| One mutable-ref utility | Reject | Container ref changes are reactive; geometry is intentionally imperative and non-reactive. |
| One ResizeObserver hook for header and grid | Reject | Header measures border-box height; grid must preserve identity before changing layout. |
| One image viewer | Reject | Detail carousel and fullscreen preview have different DOM, history, settling, and image retention contracts. |
| One return workflow | Reject | Detail list remains laid out; native fullscreen exit requires delayed geometry settling. |
| One interaction command bus | Reject | Adds allocations/dispatch to keyboard repeat and obscures long-press safety rules. |
| One universal search/cache key | Reject | URL, aggregation, distribution, snapshot, and offset caches intentionally define different equivalence relations. |
| One JSON storage repository | Reject | Snapshot and image-offset durability, validation, eviction, and lookup patterns differ. |
| Eager reverse map in `PositionMap` | Reject pending measurement | Adds memory and GC to every indexed search for a few reverse lookups. |
| One null-zone boolean | Reject | UI infers from rank coverage; DAL proves from cursor tuple. |
| One distribution binary-search policy | Reject | Floor labels and strict containment intentionally disagree in gaps/tails. |
| One sort value for display and ES | Reject | Display dimensions can be oriented while ES ordering uses indexed raw fields. |

## 9. Recommended work sequence

**Selected scope and status (18 September 2026).** All twelve items are done.
The separately approved first-page sort clamp and coherent selection-panel follow-ups
are also done. The order below is
retained for traceability and does not authorize wider refactors or live campaigns.

| Order | Finding | Status | Exact selected scope | Migration effect |
|---|---|---|---|---|
| 1 | **Q3** | **Done** | Disable unused exact totals and remove the unused response field; preserve both paging phases. | Neutral: adapter-local; no new API obligation or change to ordinary counts. |
| 2 | **S2** | **Done** | Build unique add/remove deltas and reconcile/fetch each changed ID once; preserve atomic selection/persistence behavior. | Helps: reusable transport-independent selection tests. |
| 3 | **W1** | **Done** | Fix visible-neighbour coordinate conversion using the existing two-tier predicate. | Neutral: no new coordinate abstraction or server rank semantics. |
| 4 | **T1** | **Done** | Invalidate ticks from actual consumed identities, preserving provenance and avoiding hashing/irrelevant recomputation. | Neutral: works with either adapter's data. |
| 5 | **H2** | **Done** | Track the current entry after consumed dedupe transitions; preserve Home's awaited ordering. | Neutral: browser history identity, not server session identity. |
| 6 | **F4** | **Done** | Per-image restoration guard, with same-image duplicate suppression and authoritative cursors preserved. | Neutral: client scheduling; authoritative cursors unchanged. |
| 7 | **H1** | **Done** | Coordinated CQL/AI typing-session push with fresh key and predecessor capture; settled edits replace it. | Neutral: local history; preserve Home and fullscreen semantics. |
| 8 | **S1** | **Done** | Coalesce private full reconciliation, including empty selections, without constructing redundant ID queues. | Helps: clarifies the selection data-completion boundary without new transport coupling. |
| 9 | **S3 + narrow G3** | **Done** | Metadata-cache revision and affected panel subscriptions; share only the panels' focused/single-selected resolver. | Helps: reusable D9 publication tests; no LRU clone, parent-page subscriptions or datasource rewiring. |
| 10 | **S6, hydration only** | **Done** | Re-elect a removed anchor using existing policy and update the retained-cursor anchor; no public action redesign. | Helps: correct handling of D9 omitted IDs without choosing its contract. |
| 11 | **Q2** | **Done** | Resolve the existing keyword descriptor before primary estimation; preserve scoped uploadTime and numeric/date paths. | Helps: removes reliance on an ES-specific failed request; no new registry. |
| 12 | **Q1** | **Done** | Share same-key primary/null-zone work above the adapter; key by missingField too; preserve cancellation, retry and stale-publication guards. | Helps: reusable request ownership for future API methods. |

Outside this initial scope: refuted V1; optional R1; measurement-gated S4, W3/W4,
G1/G2, F1-F3 and H4/H5; broad W2 replacement and S6 action changes; generic schedulers
and viewer consolidation. Q4/Q5/Q6/S5/H6/H3 retain their separate boundary decisions.
W6's enrichment omissions are already fixed. None reopens D3 or imports index-migration,
durable-session or universal snapshot guarantees.

### Sort-position gate investigation (18 September 2026)

**Status: Done (locally and live verified).** S3's initial full E2E run ended with
220 passes and one retry-pass in the existing
[sort-toggle regression](../../../e2e/local/scrubber.spec.ts#L2521). Investigation and then
the narrow production fix were separately approved. A settled first-page-edge test
failed before implementation; it and two delayed-fill user-intent cases now pass.
All 1,360 units, full build and 224 E2Es passed with retries disabled (4.9 minutes).
The local S3 gate is clear. Read-only direct-ES TEST verification retained the same
index-198 target with zero vertical drift on both legs and zero return-column drift;
the return landing first published 200 hits before filling the 820-result corpus.

The hook retains a temporarily clamped ratio only for an incomplete small-result
buffer at offset zero, retries on growth and discards it on newer focus, scroll,
search or seek intent. Existing tests now await full buffer fill and explicitly
reject null columns before applying their unchanged position tolerances. No page
size, query, timer or broad scroll architecture changes were made. The observations
below describe the pre-fix investigation; the exact original null-read cause is
not claimed to have been proved by the separately reproduced clamp.

- **Pre-fix first-page clamp.** When the retained focus is already in the first
  page, [search publishes those 200 hits and increments the restoration generation](../../../src/stores/search-store.ts#L2405),
  then [fills the remaining small result set asynchronously](../../../src/stores/search-store.ts#L2478).
  [The restoration effect handles each generation once](../../../src/hooks/useScrollEffects.ts#L742)
  and [clamps against the current buffer's scroll height](../../../src/hooks/useScrollEffects.ts#L803).
  Near that temporary buffer's bottom, the desired position is clamped even though
  later results provide room; completing the fill does not retry placement.
- **Reproduction and causal control.** With the local 437-result March 15-20 corpus,
  wait for initial scroll-mode fill, seek to 0.5, scroll up one `GRID_ROW_HEIGHT`,
  and focus visible item 2. Assert its global index is 198, then toggle sort twice
  using the existing row/column assertions. All three attempts moved its top from
  176px to 345px, persisting after all 437 results were buffered at offset zero.
  A temporary test-only override of first-page read size from 200 to 204 supplied
  one extra row: all three control attempts retained the same index-198 target at
  top 176px/left 636px. Correct scrollTop was 14675; failing scrollTop was 14506.
  Increasing page size is a diagnostic control, not the proposed fix.
- **The original null measurement is separate evidence.** Its final left read returned
  null while a 104-item prepend/compensation ran after the sort wait. Subtracting
  null produced an apparent 636px shift, not a measured horizontal displacement.
  [The wait checks sort status/loading](../../../e2e/shared/helpers.ts#L1081), not completed
  top-up. This establishes overlapping work, not the precise missing-DOM/focus cause
  or recovery. Do not silently weaken that assertion or claim the clamp explains
  this exact trace. Subsequent unmodified attempts reproduced a real 169px vertical
  displacement (1/3); failure-only diagnostics reproduced it 2/10 and confirmed
  persistence after fill. Continuous geometry observation masked it in 6/6 attempts.
- **Attribution limit.** The implicated search-store and scroll-effect code is
  unchanged in this implementation queue; the clamp predates it and the one-shot
  generation handling predates S3. No clean pre-session-tree A/B was performed,
  so timing effects from current changes have not been excluded. Initial test setup
  can take either a seek or an already-filled scroll path, changing which return
  branch it exercises. Merely waiting longer does not repair the confirmed defect.
- **Diagnostic environment correction.** Three earlier navigation timeouts were
  caused by writing traces under an unignored `test-results-s3-sort-diagnostic/`
  directory: repeated Vite reloads prevented navigation completion. Moving output
  under `test-results/` resolved them without application or timeout changes.
  All temporary probes and request overrides were removed before the production
  fix. The permanent regression setup and validation are described above. No
  performance campaign ran.

## 10. Validation plan for future fixes

The pre-implementation reassessment used live probes, not regression coverage;
completed implementation notes are recorded above. Before each remaining fix, identify existing assertions affected and add a focused
test that fails for the stated reason. Stop if the premise is disproved; do not weaken
assertions to accommodate an unexplained behavior change. Then run the full required
unit/build surfaces and E2E for component/hook/store/scroll changes, applying the guarded
local oracle where required by repository rules. Suggest relevant performance campaigns,
but do not run them automatically.

| Finding | Minimum discriminating test or measurement |
|---|---|
| S1 | Empty full requests clear stale state and scheduling flags; repeated full requests coalesce; existing synchronous deltas and clear/cancellation behavior remain correct. |
| S2 | `add([id,id])` and `remove([id,id])` reconcile exactly once; range target duplication does not overcount. |
| S3 | Metadata fetch completion updates metadata/usages panel with no unrelated state change. |
| S6, hydration only | Dropped anchor falls back to a retained ID or null; surviving anchor is unchanged; retained-cursor anchor follows the same result. |
| H1 | Pre-edit and settled typed-search entries have different keys; Back restores each entry's own snapshot. |
| H2 | Home then Back captures Home under its own key when destination already has a snapshot. |
| W1 | Nonzero normal-mode `bufferOffset` returns visible IDs in centre-distance order. |
| T1 | Two same-sized result/distribution inputs with different dates/keys compute different ticks. |
| F4 | After handling one image, a distinct missing cached image can restore; the same image is not repeatedly restored when it leaves the buffer. |
| Q1 | Pending same-key calls share completion and invoke the adapter once; changed keys abort old work; missingField distinguishes null zones; stale A-to-B-to-A completions cannot publish; failed work can retry. |
| Q2 | Deep keyword seek never estimates a percentile on the keyword primary; a cached-bucket hit still estimates scoped `uploadTime`, and date/number paths remain unchanged. |
| Q3 | Every position-index request body disables exact totals and pagination output is unchanged. |
| G1 | Tick-layout duration and tick count at realistic long date spans; visual priority assertions unchanged. |
| F1 | Preview activation schedules one prefetch cadence; inactive focus/buffer updates do not rerender preview internals. |
| F3 | Grid and table both return to the same image/centering; fullscreen traversal still waits for resize settling. |

For separately authorized performance investigations, choose only measurements relevant
to the question; these are not blanket gates for every selected correctness fix:

- Elasticsearch request count and `took` per scrubber action.
- Main-thread time spent in tick derivation/layout.
- Grid/table commit counts and commit durations during scroll.
- Layout reads/events during phantom transition and return.
- Selection reconciliation duration at small and large selection sizes.
- Allocation pressure for LRU scans and special-sort value derivation.

## 11. File-by-file coverage

| File | Source-only assessment |
|---|---|
| `search-store.ts` | Central owner is necessarily large. Independent work: distribution ownership and sort-kind dispatch. D3 publication omissions are fixed; preserve its commit-point invariants. |
| `useDataWindow.ts` | Fix normal/two-tier visible-index conversion; derive two-tier from subscribed total; broad use in detail is avoidable. |
| `useScrollEffects.ts` | Good shared owner. Measure duplicate bottom detection; consider terminal image-centering API. |
| `two-tier.ts` | Correct existing canonical predicate; expand its use rather than adding another abstraction. |
| `buffer-column-align.ts` | Good pure boundary. Do not force forward eviction through fresh-buffer alignment semantics. |
| `scroll-container-ref.ts` | Reactive element registration is distinct and justified. |
| `scroll-geometry-ref.ts` | Imperative geometry snapshot is distinct and justified. |
| `tuning.ts` | Already useful centralization; supplies sizing/performance context, no consolidation defect found. |
| `layout.ts` | Already useful fixed-geometry centralization; no consolidation defect found. |
| `ImageGrid.tsx` | V1's per-item getter cost is refuted. Optional display-value work stays separate; keep the grid renderer distinct. |
| `ImageTable.tsx` | V1's per-item getter cost is refuted. Row-mapper work is measurement-gated; cold interaction changes wait for range ownership. |
| `grid-scroll-anchor.ts` | Specialized virtual-scroll preservation; do not merge with DOM anchor election. |
| `viewport-anchor-geometry.ts` | Good pure DOM-geometry election boundary; reuse elected result within one transition. |
| `useHeaderHeight.ts` | Correct specialized border-box measurement; no useful merger found. |
| `Scrubber.tsx` | Keep direct DOM drag path; coalesce distribution trigger downstream; measure quadratic tick placement; optionally snapshot per-event geometry. |
| `routes/search.tsx` | Fix tick invalidation, use two-tier helper, and share narrow panel image resolution. |
| `sort-context.ts` | Share lean UI sort-kind/value metadata and linear image values; never become the API sort authority. |
| `position-map.ts` | Compact representation fits dominant lookup; no eager reverse Map without evidence. |
| `null-zone.ts` | Existing pagination abstraction is sound; expose a plan builder only if position-index reuse stays simple. |
| `es-adapter.ts` | Selected adapter-local win: no position-map exact totals. Q2 dispatch belongs in the store. Skipping the null phase and resumable composite state are excluded. |
| `sort-builders.ts` | Supplies retained parity fixtures for any approved future sort work. Do not add a second client authority. |
| `useListNavigation.ts` | Item/page movement can share a local commit helper, but geometry calculations and direct keyboard handling should remain distinct. |
| `selection-store.ts` | Independent candidates: scheduler, batch deltas, metadata revision, anchor invariant and non-touching bulk reads. Datasource/range ownership needs the relevant D9/D2 decision. |
| `ui-prefs-store.ts` | Keep reactive and imperative APIs; V1 supplies no reason to change renderer subscriptions. |
| `interpretClick.ts` | Good pure policy owner. Simplify range effects after endpoint resolution moves downstream. |
| `dispatchClickEffects.ts` | Good effects boundary. Public atomic anchor-toggle redesign is outside the selected hydration-only S6 fix. |
| `handleLongPressStart.ts` | Keep long-press safety semantics; any range-intent change waits for the D2 boundary decision. |
| `useUrlSearchSync.ts` | Fix key tracking on dedup, explicit coordinate conversion use, duplicate anchor election, and shared search projection. |
| `build-history-snapshot.ts` | Good derivation owner; add capture operation/hints to avoid repeated geometry work. |
| `history-snapshot.ts` | Replace array-filter LRU refresh with Map/read-through caching; keep synchronous pre-navigation durability. |
| `history-key.ts` | Existing push-versus-replace contract is correct; typed raw pushes must use it. |
| `image-offset-cache.ts` | D3 retains authoritative tuples. Any compiled raw-fallback optimization remains separate, unapproved work; it must not replace response cursors. |
| `orchestration/search.ts` | Existing navigation/snapshot ordering is valuable; add explicit typed-search primitive rather than a generic state machine. |
| `reset-to-home.ts` | Keep awaited direct search; share projection/reset data and repair URL-sync key handoff. |
| `main.tsx` | Pagehide capture can use shared capture operation; no broader startup consolidation found. |
| `ImageDetail.tsx` | Narrow broad data-window subscriptions, simplify per-image restore guard, and reuse image/usage derivation; do not merge viewer DOM. |
| `useReturnFromDetail.ts` | Move row mapping/terminal centering to mounted list owner; keep transition policy here. |
| `useImageTraversal.ts` | Correct traversal owner; also make it sole prefetch owner and inactive-stable if measurements support it. |
| `FullscreenPreview.tsx` | Remove duplicate entry prefetch and hidden subscriptions; retain independent history/fullscreen/settling lifecycle. |

## Final recommendation

Do not launch a general DRY refactor across these files. The highest-return plan is:

1. Confirm the selected candidate against current source and tests; no general architecture prerequisite.
2. Retain Q5, Q6, H6/S5 and H3/Q4 as evidence for their bounded endpoint decisions;
  W6 is fixed and D3's completed amendments are not reopened.
3. The selected queue in Section 9 and both approved follow-ups are complete;
  assess any further candidate separately. V1 is refuted and R1 remains outside scope.
4. Introduce only helpers that remove demonstrated complexity or cost without creating a
  second authority for server contracts.
5. Profile before touching scroll fallbacks, tick layout, hidden preview subscriptions,
  viewer composition or bulk LRU behavior.

The governing rule should be: consolidate ownership and repeated expensive work, but
allow duplicated straight-line arithmetic or markup when an abstraction would add a
branch, allocation, subscription, or broader rerender to a hot path.