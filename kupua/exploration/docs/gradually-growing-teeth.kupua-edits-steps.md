# Gradually Growing Teeth: Kupua Editing Steps

**Proposed execution plan, 2 November 2026.** Requested scope: "Everything and then some",
not only metadata fields. This document authorizes no implementation, shared-environment
writes, safeguard changes or deployment. Each step is a separately selectable work unit;
larger steps should be split at the named operation boundaries. No product code was changed
or live services contacted to prepare it.

**Policy update, 3 November 2026:** explicit data modes and failure handling replace
the migration-era graceful-absence directive. Hosted is the future API-only app;
direct-ES remains temporary laptop support, intended for separately authorized
removal and never an API fallback. This documentation decision enables no writes
and does not mark step 2 implemented.

## 0. The Recommendation

**Build a real editor with a disconnected submission path, then connect one complete operation.
Do not build every button first, and do not enable every backend write first.**

The useful version of a "dead button" is what the crop editor has started: real input,
validation, preview and request construction, but no submission. A disabled button alone
proves very little. An active button that pretends to save is worse. Before connecting it,
test the same command through a fake transport, including failure and delayed visibility.
Then enable that one operation for one disposable image, observe its whole lifecycle, and
only then expand its scope.

The shared preparation is **steps 1-5**: capabilities, guarded transport, a disconnected label
editor, stable post-write refresh, and the first real label edit. At that point Kupua has a
usable editing foundation and the other feature families can be scheduled freely according
to their local dependencies. **Step 6 adds the common bounded batch path.** Neither requires
finishing the entire Grid backlog, inventing batch APIs, adding PIT or solving KUP-041.

Recommended first live actions: labels, archive, collection additions; then metadata fields.
Crop saving can move immediately after step 5 if preferred, once its own notices and
eligibility gate is satisfied. Upload, leases, rights and destructive workflows do not all
have to wait for one another. The numbered order below is a safe default, not a demand for
one giant linear programme.

### What Is Already There

- Hosted search, windows, singleton reads, selections, counts and service discovery exist.
  The read migration is a foundation to preserve, not a project to restart. The
  [hosted guide](00%20Architecture%20and%20philosophy/09-deployed-via-Kahuna.md), read in full,
  describes the current data ownership and canonical media delivery.
- Server image responses already carry capabilities. Step 1 now retains image URI and
   edits/crops links alongside actions; future nested write controls remain consumer-scoped.
- Selection is an ID set, independently cached metadata and reconciliation. It is not an
   operation queue. The 5,000 range-walk and metadata-cache limits are not a hard ceiling
   on the whole selected set; keep them separate from the write-action limit.
- Crop geometry and request construction exist, but actual creation, notices and capability
  handling do not. Do not replace the working crop engine to add submission.
- The current host implementation admits DEV/TEST, not PROD, and excludes iframe pickers:
  [KupuaPage.scala](../../../kahuna/app/lib/KupuaPage.scala). Full replacement includes a later
  deployment/integration decision, not just finishing the editor panels.

### Corrections Needed Before Turning Research Into Instructions

1. **Fresh read is mitigation, not conflict prevention.** Whole-object metadata replacement
   can still race between GET and PUT. Never promise that it cannot overwrite another editor.
2. **Six concurrent requests is not six requests per second.** About 300 targets and six
   flights are starting ceilings, not a capacity certificate. Shared capacity, rate and
   multi-step actions also matter; [GRID-019](bug-backlog.md#grid-019) remains relevant.
3. **The Vite guard does not protect hosted requests.** Hosted calls go straight to service
   origins. Current guard comments claiming a universal browser boundary are stale.
4. **GET does not mean side-effect-free.** Downloads can record usage; administrative GETs
   also exist. No "read-only" rehearsal may invoke them accidentally.
5. **Count convergence is useful, not universal.** It works only when the predicate expresses
   the actual postcondition under the correct admission scope. It proves observed state,
   not which operation caused it, persistence, event delivery or completion of every substep.
6. **Current Kahuna does expose exceptional hard deletion.** The batch report's "not exposed
   in the UI" statement is superseded by the current
   [takedown workflow](../../../kahuna/public/js/takedown/delete-from-grid-step.tsx).
   Keep "never hard delete" for ordinary/batch editing. Full Kahuna parity needs a separately
   authorized, single-image takedown decision, not a hard-delete toolbar button.

## 1. Shared Foundation

### Step 1. Agree the Write Contract and Retain Authoritative Capabilities

**Depends on:** approval of this bounded foundation, not approval of every later feature.

**✅ Complete: both agreed read-only parts, 2 November 2026.**

1. **Image-specific capabilities:** Kupua now keeps the server's information about whether
   this user may edit or crop each image, across search results, detail and selections.
   New responses can remove previously available capabilities.
2. **User-level permissions:** Kupua can ask for the signed-in user's general permissions
   when needed. This does not override permission for a particular image, and it adds no
   request when the app starts. No current button calls this new reader yet.

**What this means:** the information needed by future editing controls is available; the
controls and saving are not connected. Both parts were developed with failing-first tests
and passed the full unit, build and browser checks. No live-service verification was performed.

**Still deliberately deferred:** nested write controls and the policy for reporting save
failures, until submission work. The [component reference](00%20Architecture%20and%20philosophy/component-detail.md)
explains where these responsibilities live; the [API contract](../../src/dal/grid-api/README.md)
defines the technical details. The instructions below retain the intended contract, not a
request to reimplement the completed preparation.

Review [hosted rights and capabilities](hosted-rights-and-capabilities-review.md), then resolve
[KUP-044](bug-backlog.md#kup-044). Preserve needed image URI, links and actions, and selected
nested resource controls through page/window/AI, singleton and selection reads. Extend the
existing enrichment ownership; do not introduce a second permissions cache or retain every
raw response by default. An accepted response without a capability must remove the old one.

Read the discovered auth `session` relation, which targets auth `GET /session`; do not call
media-api's advertised but unrouted `/permissions`. Global permissions, per-image capability,
operation eligibility and rollout enablement are separate checks. Uploader-specific rights
must work without a global editor permission. Unknown/unavailable authority means no write.
Server handlers remain the authorization boundary; a client flag or cached link is not one.
Direct-ES mode stays read-only and gains no satellite reads for permission approximation.

**Use the right authority, not one universal permission flag:**

| Fact needed by a future control | Existing server source |
| --- | --- |
| General signed-in-user flags | Auth session supplies only `showPaid`, `canUpload`, `canDelete`; there is no global edit/archive/crop flag in this response. |
| Edit this image | Its `edits` link, including uploader-specific access; now retained by step 1. |
| Crop this image | Its `crops` link, separately governed by server validity; now retained. |
| Download this image | Its download relation, not `valid` or `crops`; retention belongs to step 14. |
| Upload / archive availability | Permission-gated root `loader` / `archive` relations; inspect these in steps 15 / 7. |
| Delete, lease or usage operations on this image | Its named actions and the owning service's checks, not a global `canDelete` flag alone. |

Ordinary service-root links locate a service; their presence is not blanket permission to
mutate its resources. Persistence reasons also differ from deletability: an archived image
is not necessarily protected from deletion, while usages/exports affect deletion eligibility.
Sources: [P16 policy distinctions](03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-09-p16-image-response.md#f1-canonical-image-creation-is-policy-and-delivery-work-not-a-free-envelope),
[media-api root](../../../media-api/app/controllers/MediaApi.scala),
[auth session](../../../auth/app/auth/AuthController.scala).

**Write-outcome policy:** the standing directive now requires explicit acknowledgement,
rejection and uncertainty, not silent `null` on mutation failure. Transport loss after
dispatch is unknown; server acknowledgement does not prove search visibility. Never
automatically replay a mutation after authentication or transport failure. Step 2 owns
the small transport outcome contract; step 3 owns visible pending/rejected/unknown
outcomes and retained drafts, with partial completion handled when multi-step work is
introduced. Required-read failures remain distinguishable from empty results; optional
enrichment may be omitted. No ES fallback, general retry framework or live-write approval
follows from this policy.

**Executor pointers:** [mapper](../../src/dal/grid-api-search-adapter.ts),
[Argo helpers](../../src/dal/grid-api/argo.ts), [API types](../../src/dal/grid-api/types.ts),
[enrichment store](../../src/stores/enrichment-store.ts),
[derivation](../../src/lib/derive-enriched-image.ts),
[enrichment hook](../../src/hooks/useEnrichedImage.ts),
[discovery](../../src/dal/grid-api/service-discovery.ts),
[Kahuna session caller](../../../kahuna/public/js/services/api/media-api.js),
[auth response](../../../auth/app/auth/AuthController.scala).

**Done when:** existing mapper, enrichment, detail and selection tests cover allowed-to-absent
replacement, standalone ownership, off-screen selection, session absence and uploader-only
access. No capability fan-out per rendered image and no mutations. This also supplies the
common facts needed by crop notices; it does not itself enable cropping.

### Step 2. Establish a Default-Off Mutation Boundary in Both Topologies

**Depends on:** step 1; explicit permission for any host/shared-service file changes.

**Complete for the default-off, fixture-verified boundary, 4 November 2026.** One
named `add-labels` operation now uses the authoritative edits/labels resource,
with default-off global/per-operation rollout, validated metadata/auth origins,
local guarded proxies and Kahuna-injected hosted settings. No UI caller or live
activation is present. [The API contract](../../src/dal/grid-api/README.md#step-2-command-boundary)
owns exact outcomes, reload policy and fixture/deployment limits. The temporary
rollout gates are intended to be removable once editing is verified, not a permanent
configuration framework. The requirements below define the implemented boundary;
steps 3/4 and actual shared-service writes remain separate authorization.

Failing-first regressions, independent correctness/security, test-simplicity and
hosted-integration reviews, full units, browser types, laptop/hosted builds, Kahuna
page tests and full local E2E passed. Review follow-ups bounded shared discovery,
pinned the local fixture's API target, and added direct guard/read-POST and HTTP
outcome witnesses. Local fixtures exercise real Vite proxying; the hosted fixture
loads a compiled page with synthetic configuration, cookies and service responses.
Deployed preflight/CORS/CSRF, cookie and login-return behavior remain unverified;
the existing backend label-authorization concern remains a live-activation boundary.
No editor UI, queue, post-write refresh, shared mutation, deployment or later step
was implemented or authorized by this completion.

Add a small command transport distinct from the read DAL. It executes only named, implemented
operations using authoritative resources, the expected method and an admitted service origin.
Start with metadata-editor and session routing; add other satellite routes with their feature,
not an unrestricted forwarding facility. Reuse Argo error parsing and URI-template support
already available in the project. Never synthesize a write target from a missing capability.

Local Vite routes inherit the existing guard and exact-path read-POST allowlist. A global
write-enable switch alone is too broad: require the selected operation to be enabled too.
Hosted calls need their own default-off rollout configuration consumed at the shared command
boundary, with per-operation enablement and an emergency stop for new submissions. Missing
or invalid write configuration must fail closed, unlike harmless display defaults.

This is **accidental-write prevention in Kupua**, not security against arbitrary browser
requests. Existing service authentication/authorization must enforce access. If the operator
requires transport-enforced read-only hosted trials even for a fully privileged principal,
select a server-side operation gate or dedicated ingress with Grid maintainers before that
trial; frontend flags cannot provide that guarantee. Do not add a proxy service by default.

Verify credentialed cross-origin methods, preflight, CSP, the existing CSRF/auth arrangement,
session expiry and login-return behavior without relaxing policies globally. An expired
session stops queued submissions; do not automatically replay writes after login.
Step 1's session reader and discovery retain a page-lifetime snapshot, including failure.
Before relying on them around writes, select an explicit reload or refresh/invalidation
boundary for expiry, reauthentication and account changes. The existing cached result is
not a revalidation merely because a caller awaits it again; no silent background refresh
or automatic write replay is selected by this requirement.
Never send credentials to an unvalidated discovered origin or log signed resource URLs.

**Executor pointers:** [Vite guards/proxies](../../vite.config.ts),
[read-POST allowlist](../../src/dal/grid-api/read-via-post.ts),
[transport target](../../src/dal/grid-api/proxy-target.ts),
[hosted validation](../../src/lib/hosted-config.ts),
[Kahuna config injection](../../../kahuna/app/lib/KupuaPage.scala),
[Kahuna CSP](../../../kahuna/app/KahunaComponents.scala),
[shared HTTP filters](../../../rest-lib/src/main/scala/com/gu/mediaservice/lib/play/GridComponents.scala),
[safeguards](infra-safeguards.md#8-grid-api-write-protection--method-guard-at-proxy-boundary).

**Done when:** fake local and hosted transports prove disabled/unknown actions dispatch nothing,
only the selected enabled operation can dispatch, reads retain their exceptions, and expiry
stops pending/new submissions (step 2 introduces no queue). Verify a built hosted page,
not just Vite middleware. `build:hosted` writes
outside Kupua into Kahuna and therefore needs explicit scope permission. No shared writes yet.

### Step 3. Build One Useful Disconnected Editor and an Operation Receipt

**Depends on:** steps 1-2. Start with adding/removing a label on one image.

**Complete at the agreed disconnected desktop-prototype scope, 5 November 2026.**
The agreed common interaction for editable pills covers adding a value, removing one, applying a partially covered
value to every selected image, and remove a value from every selected image.
Labels are the first consumer; this does not enable other field families. All four
label interactions prepare disconnected intent. Fake execution remains limited to
the existing `add-labels` command contract; removal transport is explicitly deferred.
Small partial-outcome fixtures do not introduce production batch scheduling.
Kahuna is a visual and functional reference, not a wiring or architectural template.
The operator approved implementation after consultation on shared behaviour and
theming. Other editable fields retain their existing read-only presentation.

**Interaction decisions:** ordinary add, remove and apply-to-all gestures are the
action boundary, not entry to a separate confirmation dialog or accumulated-change
review workflow. There is no temporary confirmation dialog for the prototype.
The operator's 5 November adjustment supersedes the earlier no-discard decision:
Plus reveals entry, Escape or Close cancels unsent input, and Enter prepares each
comma-separated label. Do not introduce operation cancellation, undo or speculative
rollback. Large-edit warnings and future cancellation/compensation designs require
separate selection.
Preserve unfinished input rather than silently abandoning it during navigation.
The disconnected output should follow the crop mock's small formatted-data panel
and `Not sent` wording. Clearly truncate long display output only, never the
captured intent or target set. Share a small presenter if useful, not a generic
mock framework; do not copy crop console logging or expose resource URLs.

**Implemented:** `src/lib/label-operation.ts` owns one immutable
confirmed intent and observable in-memory receipt, with all target IDs counted,
pending/absent capabilities unresolved, and no eligible-subset selection. Normal
preparation has no executor, independent of rollout flags. An injected fixture
executor supports held addition outcomes, duplicate-confirmation protection and
explicit simulated observation; acknowledgement alone never establishes observation.
Direct-ES preparation is blocked. The owner imports only the command types, not
the production executor, and creates no reads, queues, polling or image updates.

`LabelEditor` supplies the shared pill search/action split, input validation and
capability-gated controls for API-mode single and multi-image metadata. Counts and
target identity remain in admission and receipts, not a diagnostic block in the row.
Its right-aligned compact Plus reveals a reduced-height field; full and partial pills
share their height. Enter prepares trimmed, deduplicated comma-separated additions;
Escape or Close clears only the unsent draft and returns focus to Plus.
The operator authorized existing-quality label suggestions on 5 November, without
backend changes. The editor and CQL search reuse one extracted label provider:
case-insensitive prefix matching preserves popularity within the bounded shortlist.
Editor scope is explicitly the accessible library, not selected IDs or browsing
filters. Selection replaces only the active comma token without submitting other
labels; unavailable suggestions leave free entry usable. Shortlist omissions are
accepted. The longer-term matching plan is in
[Better suggestions](better-suggestions-aggregation-endpoint-enhancement.md), not a
backend-change prerequisite for this version.
The route supplies current selection ownership separately from its retained panel;
cold detail supplies its requested-ID-owned overlay. No permission reads are added.
`label-editor-store` retains target-bound input and receipts in memory across SPA
navigation. The root activity panel shows newest-first formatted dry-run data with
explicitly shortened previews and warns on document exit with unfinished input or
uncertain/in-flight simulation. No operation cancellation, undo, extra
confirmation or automatic replay is implemented. Identical action/label/target-set
gestures share their existing receipt rather than resubmitting.

Receipt presentation follows the active compact selection sheet's focus scope and
otherwise remains at the root. Native activation keys stay with the pill controls;
pending selection changes withhold stale coverage fractions. Repeated actions
explicitly resurface their existing receipt instead of leaving apparently failed input.

Local and compiled-hosted fixtures exercise the production editor and its injected
executor, while the compiled app also exercises cold detail, off-screen selection
and a held metadata replacement. These synthetic fixtures are not live-system or
deployed browser-policy certification.

**Validation and limits:** all 109 unit files / 3,562 tests and all 523 standard
browser tests passed, with zero retries or skips. App build and browser typecheck
passed. Existing local and compiled-hosted fixtures cover the settled editor,
shared-provider scope/order, comma-token replacement, overlay geometry, capability
guards and mutation restrictions. Synthetic fixtures are not live-system or deployed
browser-policy certification; no performance campaign or live write was performed.

**Mobile editing UX is explicitly deferred.** Current touch-target and focus-scope
safeguards are retained, not accepted as the final mobile interaction model.
Phone access to an API-backed or isolated synthetic preview and the general mobile
metadata-editing interaction need separate design work. This does not enable editing
in direct-ES mode or block desktop prototype closeout.

### Step-3 Closeout and Deferred-Work Schedule

| Work | When it is tackled | Boundary |
| --- | --- | --- |
| Mobile metadata-editing UX and phone preview access | Separately scheduled design work | Keep existing touch safeguards; do not claim the desktop pill model is a finished mobile design or enable direct-ES editing. |
| Improved suggestion discovery beyond the popularity shortlist | Separate proposal | Current entry reuses search suggestions; [Better suggestions](better-suggestions-aggregation-endpoint-enhancement.md) owns the longer-term plan. No backend or mapping change is required for this step. |
| Removal command support and fake-executor lifecycle coverage | At the start of step 5, before connecting any live editing | Explicitly authorize the bounded transport extension; keep it default-off and verify the same editor/receipt path with fixtures first. The step-3 removal UI currently prepares intent only. |
| Post-write publication and visibility | Step 4, after step-3 validation closes | Initially use simulated addition. Removal transport is not a new gate for beginning this work. |
| Real single-image addition and removal | Step 5, after its preparation and steps 1-4 pass | Separate target/session/action authorization and live-activation safeguards still apply. |
| Production multi-image scheduling and progress | Step 6, after step 5 | Small step-3 partial-outcome fixtures do not implement a batch scheduler or a production progress workflow. |
| Other editable pill fields | Their respective feature-family steps after the shared foundation | Reuse the common controls; do not expand label transport into a universal editing command. |

Operation cancellation, undo and extra confirmation are not unfinished step-3
requirements: they remain explicitly excluded. Escape-to-discard unsent input was
separately authorized on 5 November; it does not cancel an operation. Further
reconsideration is a new operator decision, not an implicit backlog commitment.

This schedule does not authorize steps 4-6, transport/safeguard changes, shared-system
writes, deployment, staging, commit or push. Commit preparation follows successful
validation and operator discussion; committing still requires explicit approval.

Build input, validation, permission-aware presentation, target preview and action UX.
The disconnected mode computes intent but does not call a service or claim a save. Capture a
fixed target ID list and intended change at the user's action; later selection changes must
not retarget the operation. Retain selected, eligible, ineligible and unresolved counts
in the operation receipt, not a diagnostic block below the label field. Do not
silently operate on only the eligible subset: require an explicit subset choice or block.
Count targets from the captured selected-ID set, not loaded rows or the metadata summary.
That summary may cover only cached/available images after eviction or a failed read;
unresolved target capabilities must remain unresolved until checked, not silently excluded.

Use a small in-memory operation owner outside selection state. Track per-item/substep
not-started, submitted, accepted-awaiting-visibility, observed, rejected and unknown states.
Transport loss after dispatch is unknown, not proof of no write. No stop/cancel or undo
control is selected for this step. Route changes must not silently orphan the operation.
Warn before closing with unfinished work; do not promise reload recovery.

Use the same executor interface with a fake transport, not a second mock-only UI implementation.
Hold responses and simulate partial failure, expiry and duplicate clicks. No automatic retry
for non-idempotent actions. Even apparently idempotent actions need action-specific review
because persistence and event publication are not transactional.

**Executor pointers:** [single metadata](../../src/components/ImageMetadata.tsx),
[multi metadata](../../src/components/MultiImageMetadata.tsx),
[selection owner](../../src/stores/selection-store.ts),
[search route](../../src/routes/search.tsx),
[crop precedent](../../src/components/crop/CropEditor.tsx),
[Kahuna labels](../../../kahuna/public/js/services/label.js),
[Kahuna batch tracking](../../../kahuna/public/js/util/batch-tracking.js).

**Done when:** desktop keyboard actions, retained touch safeguards and selection changes work, exactly one fake
command per captured target is admitted per action, partial outcomes remain accessible, and network assertions
prove zero mutations, including side-effecting GETs. Do not reproduce Kahuna's allSettled-as-success
behavior. Keep receipts in memory initially; no generic job system or signed-URL diagnostics.
Required validation passes unretried and unskipped at this scope. The deferred
mobile UX is not a claim of mobile completion, and closeout does not enable saving.

### Step 4. Resolve KUP-043 With Simulated Writes Before Enabling Real Ones

**Depends on:** completed steps 1-3 and the bounded execution authority below.

**Execution scope, 5 November:** the [implementation plan](gradually-growing-teeth.step-4-publication-plan.md)
records accepted section-1 choices and authorization for Unit A's three sessions:
A1 extension dedup, A2 publication-route comparison, and A3 simulated readback and
publication after A2's choice. Each session retains its operator checkpoint; do not
start the next without confirmation. The Unit B feasibility spike and Units B-D
are not authorized. The plan owns rationale, freshness, performance and proof details.
Home, New images ticker and existing refresh behavior remain unchanged, with no
new refresh-view control or compulsory reload. No live writes or later editing
steps are enabled by Unit A or by this documentation update.

**Implemented through A2, 6 November:** extension acceptance excludes duplicate
incoming IDs while retaining raw cursor progress and useful demand. Same-slot
buffer replacement is the selected publication route; unchanged-ratio metadata
updates preserve geometry and scrolling prediction. The per-cell experiment and
interactive trial tooling are removed, while regression coverage remains. Editing
and readback are still disconnected. The [A2 checkpoint](gradually-growing-teeth.step-4-publication-plan.md#a2-comparison-checkpoint)
records the operator decision, trial results, final validation and accepted caveat.
A3 has not started; KUP-043 remains open for its remaining contracts.

**UX clarification, 5 November:** distant changes in a millions-image search must
not interrupt local scrolling just to reconcile imperceptible rank/count drift.
Stable display positions and approximate navigation remain useful without exact
global ordinals; identities, permissions, operation outcomes and exact range targets
remain strict. Ordinary continuation is not automatically a rebase trigger. The
detailed proposal now includes a testing sub-plan with a nine-million logical-result
fixture, a five-image counterexample and mandatory agent-driven embedded-browser
rehearsal. None of those tests has been implemented or run by this planning update.

Begin only after step 3's closeout. Use simulated label
addition initially; the deferred removal command is scheduled for step-5 preparation,
not a prerequisite that silently expands this step.

This is the hardest common prerequisite, not a cosmetic refresh button. Use the disconnected
label operation plus delayed canonical fixtures to implement one shared publication path.
Keep the current viewport stable: update affected images in place, retain surviving boxes,
and represent confirmed deleted/unavailable entries without immediately compacting
a scrolling list. The detailed plan's section 5.6 owns the accepted exception for
confirmed deletions when the whole result set fits the viewport; its implementation
belongs to Unit C, which is not yet authorized, rather than Unit A.
Update buffer, requested-ID-owned detail, selected metadata, reconciliation and capabilities
together. Do not globally refresh search after each completed item.

The policy must explicitly cover these cases:

- **Freshness:** reads started before the operation cannot overwrite its newer accepted state.
  Use request/operation ownership and meaningful source versions where available. A root
  timestamp alone does not version every lease, collection, crop or delete lifecycle. A
  later timestamp also does not prove the intended field is present. Refresh whole authoritative
  entities, not just optimistic scalar fields; clear pending state only on a valid postcondition.
   In particular, root `lastModified`, root `userMetadataLastModified` and nested
   `userMetadata.lastModified` have different meanings; use the metadata source/projection
   version for metadata, not "last human edit" inferred from the root clock. See
   [P23 timestamp provenance](03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-09-p23-query-mapping-s1.md#f4-identity-and-edited-date-provenance-are-now-joined).
- **Membership/order:** labels, rights, archive and metadata can change the active filter;
  every relevant write can move an image under `lastModified` sorting. Preserve the current
  mounted order until an explicit rebase, but mark affected totals/maps/distributions stale.
  Do not use stale ordinals for seeks, range walks or history restoration as though still exact.
- **Rebase:** an action whose meaning requires current membership or precise target
   resolution obtains it under its own destination and placement policy; ordinary
   cursor continuation need not rerank merely because global coordinates are stale.
   Home logo, New images
   ticker, pull-to-refresh, new query/sort and history retain their existing behavior;
   preserving a departing anchor is not a universal override. No new refresh-view
   control or required browser reload. The detailed proposal distinguishes identity,
   fraction, ordinal and true-edge intent, including failed reacquisition. Never
   silently send an old rank hint into new membership or compact retained rows to
   remove duplicates. Safe cursor continuation and boundary recovery need composed proof.
- **Selection:** edits may put selected IDs outside the current query without a new search.
  Retain the operation's original targets and make this distinction visible; do not silently
  shrink them mid-flight. Confirmed deletion disables further actions for that image. Failed
  reads or permission-filtered omissions are not evidence of deletion. Preserve the existing
  selection-clear policy on explicit new searches.
- **History/AI:** old snapshots must not resurrect pre-edit bodies/capabilities or trusted stale
  maps. Finite AI result membership stays stable until rerun; editing a result must not trigger
  an automatic AI rerank. Standalone detail must remain usable without a resident search buffer.

The original convergence direction uses bounded `POST /images/count` over the **captured operation IDs** plus a
supported exact postcondition, independent of the browsing query/default free filter/frozen
upload boundary. This may require an operation-specific body rather than blindly reusing
the defaulted browse mapper. No empty-ID request may become a corpus-wide poll. Stop on
deadline or lost ownership. One matching count cannot identify failed items: fetch changed
documents in existing 200-ID mget chunks for publication and bounded failure reconciliation.
For unsupported predicates or service-owned substeps, use bounded owning-resource reads.
Do not add N concurrent singleton polling loops, and do not treat zero results as proof of
successful deletion or lost permission as successful convergence.

The 5 November review found literal-label predicate and projection limits. The
[detailed plan](gradually-growing-teeth.step-4-publication-plan.md#52-readback-documents-first-for-the-initial-label-proof)
records the accepted mget-first observation path for the initial label proof,
with count remaining a separately justified optimization. Implementation follows
the Unit-A session checkpoints above; this choice authorizes no backend repair
or later unit.

**Executor pointers:** [KUP-043](bug-backlog.md#kup-043),
[search store](../../src/stores/search-store.ts),
[selection store](../../src/stores/selection-store.ts),
[detail](../../src/components/ImageDetail.tsx),
[API datasource](../../src/dal/api-data-source.ts),
[request mapper](../../src/dal/grid-api-search-adapter.ts),
[selection drift/extension design](00%20Architecture%20and%20philosophy/05-selections.md),
[position contracts](00%20Architecture%20and%20philosophy/02-focus-and-position-preservation.md).

**Done when:** amend existing store/API-mode/detail/selection tests and owning browser suites
with representative delayed-read, off-screen selection, filter-exit, changed-sort and deletion
cases. Witness retained visible boxes in Grid, Table and Justified; cover resident/indexed/seek
boundaries, history and cold detail without multiplying every combination. Identify assertions
of the old behavior before editing them. Prove the resulting user behavior, not just a map
invalidation flag. Complete the detailed proposal's adversarial fixture checks and
agent-driven embedded-browser rehearsal, including undisturbed distant-change browsing
and the small-set UX. No PIT, universal external-edit freshness service or live mutations needed.

### Step 5. Give One Label Operation Real Teeth

**Depends on:** steps 1-4 passing; explicit target/session/action authorization.

**First: complete the removal preparation deferred from step 3.** Obtain explicit
authorization for a bounded, default-off removal command using the authoritative
resource and existing origin/method policy. Exercise its lifecycle through the same
editor and receipt owner with isolated local and compiled-hosted fixtures, including
blocked, rejected, uncertain and held outcomes. Verify its postcondition through
the step-4 publication path before any live activation. Do not manufacture a removal
URL from missing capabilities, silently extend the add-only transport, or treat the
already-present disconnected remove control as evidence that execution exists.
Any required safeguard changes still need separate permission.

Only after this preparation passes may the separately authorized live connection begin.
Connect the existing metadata-editor label resource to the real command transport for **one
image only**. First use isolated local services or a deterministic service fixture; test the
hosted build against fixtures as well. Then request a bounded operator-run/authorized TEST
trial identifying disposable images, the exact action and cleanup. TEST is shared, not a
disposable database. No broad test suite against TEST and no PROD trial by implication.
Starting a local Grid backend against shared ES is not a read-only setup step: startup can
create an index or assign an alias. Use isolated local targets or an already separately
approved service; do not launch a shared-target backend just to inspect it. The controlling
source and boundary are in [P24 F5](03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-09-p24-backend-admission.md#f5-startup-ordinary-target-and-pit-admission-differ).

Observe command admission, source response, projected visibility and stable publication.
Re-read capabilities immediately before dispatch where they can have become stale. Confirm
the actual installed backend/configuration; checkout code does not identify a deployed binary.
Disable the operation again if handoff or outcome accounting is ambiguous. Cleanup is another
authorized write, not an automatic right to mutate the environment.

**Executor pointers:** [Kahuna label service](../../../kahuna/public/js/services/label.js),
[metadata-editor routes](../../../metadata-editor/conf/routes),
[EditsController](../../../metadata-editor/app/controllers/EditsController.scala),
[write lifecycle evidence](03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-09-p33-grid-edit-delete-collection-lifecycles.md).

**Done when:** one add and one explicitly authorized removal have truthful outcomes and stable
readback through the real chosen topology; unavailable/denied/unknown cases are covered locally.
No other action becomes live. **This is the common-blockers-removed milestone.** Later feature
work reuses this path rather than reopening infrastructure design each time.

### Step 6. Expand to Bounded, Paced Multi-Image Operations

**Depends on:** step 5; capacity decision before shared batch activation.

Preserve current selection behavior: 5,000 bounds a server range walk and the metadata LRU,
not all accumulated selected IDs. Start with an approximately **300-image write ceiling and
at most six in-flight requests**, with smaller action-specific limits for expensive or
destructive work. Reject oversized actions before hydrating/submitting them; explain the
limit, never silently truncate. Account for each item's multiple reads/writes, not just item count.
Check the actual captured set size even when it exceeds the metadata cache. See
[P21 F3/F4](03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-09-p21-selection-collections.md#f3-range-retry-lifetime-and-limits-need-composed-assertions)
and the current [selection add/toggle actions](../../src/stores/selection-store.ts).

Add explicit pacing and backoff on throttling, a shared queue for overlapping Kupua operations,
and serialization of conflicting changes to the same image. A per-tab limit cannot protect
the organisation from many tabs/users. Resolve GRID-019 with the infrastructure owner before
general multi-user batching: table **and Photoshoots GSI**, observed capacity/alarms and a
documented admitted rate. A smaller one-operator prototype exception needs explicit approval;
300/six alone is not that approval or a guarantee against throttling.

Snapshot target IDs, retain partial results, allow stop-remaining, and retry only explicitly
selected failed/unknown items after reconciling current state. Appending text, adding leases,
creating crops and collection appends must not be blindly replayed. Use batched convergence,
bounded mget and coalesced publication; keep browsing responsive during progress updates.

**Executor pointers:** [batch report section 0](batch-editing-at-scale.md#0-realistic-next-steps),
[GRID-019](bug-backlog.md#grid-019), [tuning constants](../../src/constants/tuning.ts),
[mget implementation](../../src/dal/grid-api-search-adapter.ts),
[Kahuna batch reference](../../../kahuna/public/js/util/batch-tracking.js).

**Done when:** existing selection/store/browser fixtures prove the boundary, fixed targets,
mixed permissions, stop-remaining, throttling and partial completion. Full relevant product
gates pass. The cap/rate is explicit configuration, not an undocumented concurrency constant.
No new backend batch endpoint or durable operation service is required.

## 2. Add Feature Families Independently

For every following step: use the same disconnected-preview -> fake execution -> bounded live
activation progression. A successful UI rehearsal is not backend validation; a 2xx response
is not projected completion. Single-image activation can precede batch activation.

### Step 7. Finish Labels, Archive and Collection Addition

**Depends on:** step 5; step 6 for batches.

Complete label suggestions, add/remove and mixed-selection behavior. Add archive/unarchive as
explicit target states, not a blind toggle across mixed values. Archive is persistence/reaper
policy, not soft deletion. Add selected images to an existing collection, using canonical path
identity and fresh capability information. Avoid duplicate additions on ambiguous retry.

**Executor pointers:** [labels](../../../kahuna/public/js/services/label.js),
[archive](../../../kahuna/public/js/services/archive.js),
[collections caller](../../../kahuna/public/js/services/api/collections-api.js),
[Kupua tree](../../src/components/CollectionTree.tsx),
[collection store](../../src/stores/collection-store.ts),
[collection controller](../../../collections/app/controllers/ImageCollectionsController.scala).

**Done when:** each action works singly and at its approved batch cap, updates detail/selection
and search display, and preserves the viewport under a matching label/archive/collection filter.
Collection removal and tree deletion remain disabled until step 12. Archive overwrite is
last-writer-wins, not a universal commutative-operation guarantee.

### Step 8. Editable Metadata, Including Configured Domain Fields

**Depends on:** step 5; step 6 for batch fields; a documented concurrency choice.

Implement fields exposed by the current Kahuna metadata editor, not merely the few visible by
default in Kupua: title, description, special instructions, byline, credit, copyright,
date taken, image type, people, keywords, location and configured domain metadata. Distinguish
editable metadata from server-derived usage instructions and read-only file metadata/aliases.
Preserve validation, empty/clear/reset semantics, lists/dates and configured field types.
For multi-edit, preserve overwrite/append/prepend where Kahuna supports them; mixed does not
mean blank and opening an editor must not erase values.

Existing PUT replaces the override object. Immediately before each write fetch the current
authoritative edits; merge the intended field into those overrides, retaining other overrides
and the original/effective metadata distinction. Do not build the replacement from the selected
image's cached display model or populate every effective field as a new override. Serialize
this client's same-image changes. State the residual GET/PUT race explicitly.
Lean browse/mget responses omit original metadata; their defaulted empty value is not evidence
that an image had no original metadata. When reset/diff behavior needs original values, fetch
the existing full singleton together with the fresh owning edits resource, rather than deriving
an override from that lean cache. Do not slim or globally flatten the shared GET response to
make it match Kupua's internal model. See [P16 F2/F5](03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-09-p16-image-response.md#f2-lean-projection-requires-two-representations-and-a-scoped-parser).

For a single-operator prototype, that residual may be explicitly accepted, as section 0
recommends. Before claiming concurrent-editor protection, choose a separately approved
field-level update or version/conditional-write contract. A patch of one field protects
unrelated fields; append/prepend and same-field conflicts still require their own semantics.
Do not make a new conflict API a blanket gate for unrelated label/crop work.

**Executor pointers:** [Kahuna editor fields](../../../kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html),
[edit service](../../../kahuna/public/js/edits/service.js),
[override diff](../../../kahuna/public/js/edits/metadataDiff.js),
[domain metadata](../../../kahuna/public/js/edits/domainMetadata.js),
[metadata controller](../../../metadata-editor/app/controllers/EditsController.scala),
[field registry](../../src/lib/field-registry.tsx),
[host config](../../../kahuna/app/lib/KahunaConfig.scala).

**Done when:** a fresh intervening change to another override survives; the selected concurrency
contract has a real regression test, not only a serialized happy path. Add allowlisted domain
specifications to hosted bootstrap with validation and tests. Saving changed sort/filter fields
passes step 4's continuity policy. Do not infer an edit permission from a registered display field.

### Step 9. Lease Editing and Trustworthy Lease Display

**Depends on:** step 5; step 6 for batch additions.

Add the four access types (allow/deny use and syndication), notes and applicable date rules.
Support add, multiple additions, individual deletion and the replace/clear operations needed
by existing workflows/templates. Replacement needs fresh state and explicit whole-set intent.
Do not impose one lease per type: current service rules are narrower, especially for syndication.
Resolve [KUP-045](bug-backlog.md#kup-045) in this slice so the operation's result is consistently
visible across single/multi metadata and badges. Lease appearance must never confer permission.

**Executor pointers:** [Kahuna lease editor](../../../kahuna/public/js/leases/leases.js),
[lease service](../../../kahuna/public/js/services/api/leases.js),
[lease comparison tests](../../../kahuna/public/js/services/api/leases-helper.spec.js),
[server controller](../../../leases/app/controllers/MediaLeaseController.scala),
[lease model](../../../common-lib/src/main/scala/com/gu/mediaservice/model/leases/MediaLease.scala),
[shared display review](hosted-rights-and-capabilities-review.md).

**Done when:** additions/deletions/replacements reconcile by the relevant lease identity/state,
not merely any newer image timestamp; server cost/validity/capabilities refresh together. Keep
unrelated existing leases and distinguish accepted source changes from lagging ES visibility.

### Step 10. Usage Rights as an Explicit Multi-Step Operation

**Depends on:** steps 8-9; step 6 for batch rights.

Use the server's writable/filtered category catalogue, properties, required fields, defaults,
dependent options and restrictions. The search category catalogue alone is not an edit form.
Support clearing/removing overrides without losing unrelated rights properties accidentally.
Preview whole-object replacement explicitly, especially for mixed selections.

Kahuna rights saving also manages category leases and invokes metadata-from-rights. Preserve
those intended effects, with per-image before-state and ordered, individually visible substeps.
Do not broadcast-and-forget dependent writes or report the whole operation successful when only
rights saved. Retrying a later failed substep must not replay earlier non-idempotent work.
Resolve [KUP-046](bug-backlog.md#kup-046) where server wording is needed for the resulting notice.
Private maintainer review of write-admission consistency must precede broader activation of
affected rights routes; this plan contains no exploit recipe or permission bypass.

**Executor pointers:** [rights editor](../../../kahuna/public/js/usage-rights/usage-rights-editor.js),
[category lease helpers](../../../kahuna/public/js/common/usageRightsUtils.js),
[catalogue caller](../../../kahuna/public/js/services/api/edits-api.js),
[EditsApi](../../../metadata-editor/app/controllers/EditsApi.scala),
[EditsController](../../../metadata-editor/app/controllers/EditsController.scala),
[Kupua catalogue](../../src/lib/usage-rights-catalogue.ts).

**Done when:** category change/removal, dependent metadata and leases, mixed targets and a failed
middle substep have tested outcomes. Cost, restrictions, validity and crop/download capability
are refreshed from the server, not guessed from the chosen category.

### Step 11. Metadata Templates Without Pretend Atomicity

**Depends on:** steps 7-10 for the operations a template actually uses.

Inject allowlisted template definitions via hosted configuration. Preserve preview/cancel,
replace/append/prepend strategies, placeholders, collection additions, rights-derived metadata,
and lease add-versus-replace with duration rules. Execute a template as a composition of the
existing commands, with a visible substep receipt. No all-or-nothing promise: current services
cannot provide a cross-service transaction. Re-preview against fresh data before replaying.

**Executor pointers:** [template implementation](../../../kahuna/public/js/metadata-templates/metadata-templates.js),
[template config tests](../../../kahuna/test/lib/MetadataTemplateConfigTest.scala),
[metadata preview handoff](../../../kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js),
[upload editor](../../../kahuna/public/js/upload/jobs/required-metadata-editor.js),
[hosted config](../../src/lib/hosted-config.ts).

**Done when:** preview cancellation sends nothing, one representative composite template applies
all its intended effects, and a partial failure remains visibly partial. Reuse these commands
later in upload completion; do not implement a second template engine there.

### Step 12. Collection Removal and Tree Management

**Depends on:** step 7; resolve GRID-011 before claiming safe concurrent membership removal.

Implement per-image and selected-image removal after a bounded server repair or explicitly
approved prototype limitation. A client queue cannot prevent another user's concurrent add
being lost by the server's read/filter/write replacement. Keep that distinct from tree CRUD.

Support root/child creation and permitted leaf deletion. Preserve case-insensitive path IDs,
tree name validation, non-leaf refusal and independent tree/membership/count refresh. Current
tree deletion does not cascade memberships. Show its consequence and require a product decision
for populated leaves; do not silently invent cascading deletion, rename or move.

**Executor pointers:** [GRID-011](bug-backlog.md#grid-011),
[Kahuna collections](../../../kahuna/public/js/services/api/collections-api.js),
[membership controller](../../../collections/app/controllers/ImageCollectionsController.scala),
[membership store](../../../collections/app/store/ImageCollectionsStore.scala),
[tree controller](../../../collections/app/controllers/CollectionsController.scala),
[Kupua collections tests](../../src/components/CollectionTree.test.tsx),
[browser suite](../../e2e/local/collections.spec.ts).

**Done when:** an interleaved removal/addition regression preserves the independent addition;
tree and membership outcomes are separate; stale counts do not pretend to be exact. Retain
accepted subtree-count approximation. Rename/move belongs to step 22, not hidden delete/create.

### Step 13. Save Crops, Create Full-Frame Exports and Browse Their Results

**Depends on:** steps 1-5 and KUP-047; step 6 only for batch full-frame export.
**Can move earlier:** does not require the metadata/rights editors themselves.

Wire server cost/restriction notices and crop eligibility through the common enriched image,
including standalone detail and fullscreen. Recommend retaining read-only framing when saving
is unavailable, but obtain that UX decision explicitly. Complete KUP-047 before live creation.

Preserve the existing geometry-to-oriented-original mapping, ratio/custom/default constraints,
numeric controls, draft/history behavior and small-crop warning. Use canonical media-api source
URI, not `ui:image` or a signed media asset. The image's `crops` relation identifies a list;
creation follows the discovered cropper root's `crop` relation. Support rectangular crops and
the separate `type: full` export operation, including bounded batch full-frame creation.
Preserve cropper's full singleton `include=fileMetadata` dependency, principal forwarding,
oriented dimensions, source MIME and colour/alpha inputs. A lean mget image is not a substitute
for that server-to-server contract; see [P25 F7](03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-09-p25-delivery-satellites.md#f7-downloads-and-cropper-must-remain-semantically-intact).

After creation, retain the returned export identity, confirm that export is visible, display its
renditions and permit selection/navigation/download handoff. Prevent double submission without
assuming an ambiguous retry is harmless. Do not infer a missing crop from a failed refresh.

**Executor pointers:** [CropEditor](../../src/components/crop/CropEditor.tsx),
[request mapping](../../src/lib/crop/crop-request.ts),
[crop tests](../../src/lib/crop/crop.test.ts),
[Kahuna crop client](../../../kahuna/public/js/services/api/media-cropper.js),
[crop lifecycle](../../../kahuna/public/js/crop/controller.js),
[batch full export](../../../kahuna/public/js/components/gr-batch-export-original-images/gr-batch-export-original-images.js),
[cropper controller](../../../cropper/app/controllers/CropperController.scala),
[Kahuna result view](../../../kahuna/public/js/image/view.html).

**Done when:** saved coordinates/output identity and visible result match the preview, including
orientation and a custom ratio; notices survive normal/fullscreen layouts; denied capability
and double-click cases dispatch correctly. Amend existing crop tests and browser coverage.
Refresh expiring source/delivery information on demand without discarding the crop draft; do
not require a general background URL-renewal service before unrelated editing can ship.

### Step 14. Original, Optimised and Crop Downloads, Including ZIP

**Depends on:** steps 1-5; step 13 for crop-result UI. Ordinary downloads can move earlier.

Retain authoritative download links, configured restrictions and crop-download settings.
Downloadability is not image/crop validity: Grid's download checks do not include the same
missing-credit/description checks. Do not disable downloads solely because `valid` is false,
or grant them from cost/persistence. Preserve the server's distinct advertised decision.
Use actual download endpoints for downloads, not raw secure assets: usage recording is an
intentional side effect. Keep preview/prefetch paths separate. Preserve names, original format,
optimised choices, crop asset size choices and selected-image ZIP behavior.

Give downloads their own admitted count/byte/concurrency limits rather than assuming 300 large
originals fit memory. Show partial download failures; clean up blobs and object URLs. A retry
may record another usage; do not promise exactly-once accounting. Check session expiry and
fresh links for long-lived tabs, without requiring a reload that loses editing work.

**Executor pointers:** [downloads service](../../../kahuna/public/js/services/image/downloads.js),
[download control](../../../kahuna/public/js/components/gr-downloader/gr-downloader.js),
[server download handlers](../../../media-api/app/controllers/MediaApi.scala),
[image links](../../../media-api/app/lib/ImageResponse.scala),
[image URL owner](../../src/lib/image-urls.ts),
[delivery/side-effect evidence](03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-09-p25-delivery-satellites.md#f7-downloads-and-cropper-must-remain-semantically-intact).

**Done when:** original/optimised/crop choices produce the correct file and intended usage
behavior in isolated tests; previews produce no download usage. Configuration and capability
absence block the action. No live download used as a supposedly read-only probe.

### Step 15. Upload, Import and Post-Upload Editing

**Depends on:** steps 1-5; steps 8/10/11 for corresponding completion editors/templates.

Port file picker, drag/drop, URL import and recent-uploads/job UI. Carry upload permission,
size limits, required metadata and configured upload topology in the hosted allowlist. Kahuna
supports both service upload and prepare -> signed bucket PUT -> queued-status update -> status
polling; support the chosen deployed mode and retain a tested contract for the other supported
mode. Signed upload URLs are scoped capabilities, not generic discovered write destinations;
never persist/log them or send session credentials to the bucket unnecessarily.

Distinguish bytes transferred, queued, processed, indexed/visible, duplicate and failed states.
Support cancellation/partial batches without claiming rollback, revoke preview object URLs,
and preserve existing duplicate/soft-deleted-image handling. Reuse the field/rights/template
commands for required metadata rather than sending a new whole-image payload.

Resolve or explicitly contain [GRID-018](bug-backlog.md#grid-018) before broad upload rollout:
mapping conflict can drop an upload from search after transfer succeeds. A success spinner or
longer poll is not its repair. Coordinate mapping/normalization and dropped-message alerting
with Grid maintainers; existing mappings may prevent an in-place type change, so no automatic
reindex/migration requirement follows. A bounded prototype trial can use approved fixtures,
but cannot establish general ingest reliability.

**Executor pointers:** [upload manager](../../../kahuna/public/js/upload/manager.js),
[loader client](../../../kahuna/public/js/services/api/loader.js),
[job lifecycle](../../../kahuna/public/js/upload/jobs/upload-jobs.js),
[drop handling](../../../kahuna/public/js/upload/dnd-uploader.js),
[loader controller](../../../image-loader/app/controllers/ImageLoaderController.scala),
[status controller](../../../image-loader/app/controllers/UploadStatusController.scala),
[loader routes](../../../image-loader/conf/routes).

**Done when:** upload/import reach a usable image and required editing, failures remain visible,
and existing duplicates are not silently treated as new items. Verify bucket CORS/CSP and session
boundaries in the actual selected topology. Backend-only derivative/replica endpoints are not
automatically new UI actions just because they exist.

### Step 16. Photoshoots, Syndication Rights and Send to Photo Sales

**Depends on:** steps 8-10 as applicable; source/event handoff decisions for GRID-009/013.

Support photoshoot assignment/removal and the existing rights/syndication workflow exposed by
the target deployment. A photoshoot change can affect rights of other images: preview that
scope and do not apply the ordinary 300-target cap as though only those records can change.
Separate setting rights/leases from actually publishing/sending to a syndication partner.

For Photo Sales preserve configured availability, eligibility checks, confirmation and partner
parameters. Await/report each accepted request; do not copy Kahuna's immediate success and
selection clearing before its promises settle. A retry can duplicate external work and requires
reconciliation or an explicit operator decision. Never exercise real partner publication as a
routine TEST smoke check.

**Executor pointers:** [photoshoot service](../../../kahuna/public/js/services/photoshoot.js),
[syndication controller](../../../metadata-editor/app/controllers/SyndicationController.scala),
[syndication composition](../../../metadata-editor/app/lib/Syndication.scala),
[Photo Sales caller](../../../kahuna/public/js/search/results.js),
[publication handler](../../../media-api/app/controllers/MediaApi.scala),
[Thrall processor](../../../thrall/app/lib/kinesis/MessageProcessor.scala),
[GRID-009](bug-backlog.md#grid-009), [GRID-013](bug-backlog.md#grid-013).

**Done when:** source persistence/publication/consumer futures have the selected tested contract;
fan-out and partial failure are visible. A settings change is not reported as partner delivery.
Keep [GRID-003](bug-backlog.md#grid-003) unknown-status decoding safe if this slice consumes it,
and review [GRID-014](bug-backlog.md#grid-014) if relying on rights-filtered GET/AI membership.

### Step 17. Soft Delete and Restore

**Depends on:** steps 4-6; a slice-local GRID-012 repair and GRID-010 decision.

Keep ordinary Delete strictly soft. Preview exact IDs/count, require deliberate confirmation,
recheck per-image deletion capability and refuse protected images. Do not remove usages/crops
automatically to manufacture deletability. Restore must preserve the server's archive-before-
undelete behavior and special reaper admission; it is not an arbitrary inverse request.

Repair [GRID-012](bug-backlog.md#grid-012)'s premature acknowledgement before treating accepted
delete as a completed source handoff. For [GRID-010](bug-backlog.md#grid-010), either implement
the selected lifecycle ordering guard or explicitly restrict/accept a prototype trial. Serializing
this tab and waiting for visibility reduces exposure but does not solve cross-client/retry
ordering. General restore/undo claims require a resolution; never promise undo while state is
unknown. One-shard observations are not a universal ordering contract.

**Executor pointers:** [delete caller](../../../kahuna/public/js/components/gr-delete-image/gr-delete-image.js),
[restore caller](../../../kahuna/public/js/components/gr-undelete-image/gr-un-delete-image.js),
[media-api lifecycle](../../../media-api/app/controllers/MediaApi.scala),
[soft-delete source](../../../common-lib/src/main/scala/com/gu/mediaservice/lib/metadata/SoftDeletedMetadataTable.scala),
[Thrall lifecycle projection](../../../thrall/app/lib/elasticsearch/ElasticSearch.scala),
[P33 lifecycle evidence](03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-09-p33-grid-edit-delete-collection-lifecycles.md).

**Done when:** blocked, accepted-pending, failed and confirmed deletion/restoration are distinct;
deleted focus/selection and neighboring positions follow step 4. Delayed/failed source writes
and reversed lifecycle messages are tested locally. Poll explicit status/postconditions, not
absence from a filtered count alone. No hard-delete or automatic batch undo is enabled.

### Step 18. Privileged Crop and Usage Removal

**Depends on:** steps 9/13 and the destructive-command safeguards from step 17.

Add existing crop deletion and usage cleanup with fresh operation capabilities, a separate
confirmation and an explicit description of what will be removed. Include specific-usage-set
deletion where the takedown workflow needs it. Deleting a usage record does not remove an image
from a published article. Deleting crops can break consumers; neither operation is ordinary
metadata editing or something to run automatically before Delete.
Keep resource-specific absence semantics: the usage-list endpoint can return 404 for an empty
list, while the lease endpoint returns an empty collection. Neither establishes a universal
"404 means deleted" rule. Satellite authentication is also not proof of media-api's per-image
visibility check; review the selected service boundary without weakening it. See
[P25 F6](03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-09-p25-delivery-satellites.md#f6-optional-services-have-different-sources-and-absence-shapes).

**Executor pointers:** [crop removal control](../../../kahuna/public/js/components/gr-delete-crops/gr-delete-crops.js),
[usage removal control](../../../kahuna/public/js/components/gr-delete-usages/gr-delete-usages.js),
[usage service](../../../kahuna/public/js/services/image/usages.js),
[cropper controller](../../../cropper/app/controllers/CropperController.scala),
[usage controller](../../../usage/app/controllers/UsageApi.scala),
[action builder](../../../media-api/app/lib/ImageResponse.scala).

**Done when:** only advertised, authorized cleanup is available; partial/unknown cleanup cannot
unlock a subsequent delete. Confirm projected usages/exports and refresh image capabilities
after cleanup. Existing server-to-server usage ingestion/status/reindex routes are not exposed
as new editor controls without a separate use case and admission review.

### Step 19. Guided Takedown, Including the Hard-Delete Decision

**Depends on:** steps 9, 17-18 and explicit approval of this high-risk feature.

Reproduce the current guided workflow: discover capability, inspect active/pending content,
link to the owning editorial tools for removal, and unlock Grid cleanup only after authoritative
checks permit it. Missing/unavailable content data must not mean "no active content". Preserve
the deny-lease option's retained downloaded/published-print usage records. Recheck capability
after each cleanup stage before soft/hard deletion; preserve a truthful partial receipt.

Full parity includes Kahuna's single-image hard-delete choice. **Recommendation: implement its
disconnected flow and isolated tests, but keep activation separately disabled until the operator
and Grid maintainers approve irreversible deletion and its operational recovery limits.** This
is a named exception decision to the ordinary "never hard delete" policy, not approval supplied
by this plan. No batch hard delete, guessed endpoints, automatic retries or automatic partner/CMS
writes. A fallback link to Kahuna may bridge the rollout, but is not completed Kupua parity.

**Executor pointers:** [takedown admission](../../../kahuna/public/js/takedown/index.ts),
[content step](../../../kahuna/public/js/takedown/delete-from-content-step.tsx),
[state/polling](../../../kahuna/public/js/takedown/takedown-context.tsx),
[Grid cleanup step](../../../kahuna/public/js/takedown/delete-from-grid-step.tsx),
[media-api hard-delete handler](../../../media-api/app/controllers/MediaApi.scala).

**Done when:** the approved soft/deny/hard paths preserve ordering and retained records, reject
unavailable safety evidence, and handle an already-removed image without expanding authority.
Hard-delete completion is not established merely by one 404, which can also mean invisibility.
Document the actual confirmation boundary and retained limitations on asset cleanup. An
unapproved hard-delete path remains an explicit parity gap, not silently counted as complete.

## 3. Complete Replacement, Then Go Further

### Step 20. Editorial Integration and Configuration Parity

**Depends on:** the image/crop/download/upload commands needed by the selected integration.

Preserve Kahuna's image/crop drag payloads, asset handles, copy/link formats and embedding
contracts used by Composer/Pinboard and other configured consumers. Crop selection must honor
requested ratios/defaults and report the correct created/exported identity. Retain multi-image
behavior where supported; do not replace established MIME contracts with Kupua-only JSON.

The current host deliberately leaves iframes on Kahuna. Keep that fallback until the embedding
contract is implemented and accepted. Audit message origins/target origins with the integration
owner rather than blindly copying the legacy wildcard. Configured third-party integrations
and permission-gated scripts require their own admission, not wholesale `_clientConfig` copying.

**Executor pointers:** [Kahuna drag/embed contracts](../../../kahuna/public/js/main.js),
[image route](../../../kahuna/public/js/image/index.js),
[image/crop view](../../../kahuna/public/js/image/view.html),
[host iframe gate](../../../kahuna/app/lib/KupuaPage.scala),
[host config](../../../kahuna/app/lib/KahunaConfig.scala),
[selection extension points](00%20Architecture%20and%20philosophy/05-selections.md#13-phase-3-extension-points--what-were-explicitly-leaving-room-for).

**Done when:** isolated embedding/drag consumers receive compatible payloads and no unintended
write occurs on drag/preview. Required configured workflows have explicit implemented/not-enabled
dispositions. If a proprietary external integration cannot be exercised, name that acceptance
gap and its owner; source inspection alone is not a replacement certificate.

### Step 21. Accept Full Parity and Roll Out by Operation

**Depends on:** all selected parity rows below, plus deployment-owner approval.

Walk the checklist against the current Kahuna UI and actual target configuration. Recheck for
new callers before declaring parity: this plan is a source-backed snapshot, not a forever-frozen
feature inventory. Include single/multi selection, detail/deep link, keyboard, compact/touch,
session expiry, stale capabilities, partial service absence and navigation during operations.
Do not require every theoretical combination; use representative witnesses for distinct paths.

Release through a small operator cohort, then an agreed user cohort, enabling one operation
family at a time. Keep a default-off kill switch for new submissions and a usable read-only
experience. Turning writes off is not rollback of accepted work. Monitor operation rejection,
unknown/partial outcomes, convergence delay, shared throttling and dropped messages without
logging private metadata, identities or credentials. Coordinate Grid deployment/PRs separately;
finishing Kupua source is not proof those fixes are deployed.

**Executor pointers:** [hosted guide](00%20Architecture%20and%20philosophy/09-deployed-via-Kahuna.md),
[backend impact checklist](00-kupua-backend-merge-to-MAIN-impact-map.md),
[test guide](../../e2e/README.md), [scripts](../../package.json),
[bug backlog](bug-backlog.md), [safeguards](infra-safeguards.md).

**Done when:** every parity row has implementation and acceptance evidence, or an explicit
operator-approved exclusion that narrows the parity claim. Check server admission privately
before expansion beyond the approved tiers/cohort, including GRID-016 where relevant. Promote
DEV/TEST hosting to another stage only by separate authorization. Preserve the working browsing
experience; performance regressions require a decision, not an invisible trade for editing.

### Step 22. Beyond Kahuna, Only After the Common Path Works

These are follow-on capabilities, not prerequisites for the first editing releases:

1. **Supplier notices by pasted IDs/references:** resolve identifiers, show unresolved/duplicate
   inputs and preview exact affected images; apply restrictions without replacing unrelated
   rights, using the requester's identity. Replace unsafe script workflows, not their mistakes.
   A supplier reference can resolve to several images across several pages: collect the complete
   bounded result or refuse the incomplete resolution before writing, never silently use the
   first hit/page. [P26 Q4/C2](03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-09-p26-configuration-evidence.md#q4-existing-alamy-and-sample-uploader-read-contracts)
   records the existing script's first-page limitation; no script execution is needed to test this.
   Reuse the capped operation runner first. Read [batch report section 7](batch-editing-at-scale.md#7-hand-run-scripts--can-kupua-replace-them).
2. **Better conflict handling:** field-level/conditional mutations and meaningful conflict UI
   if concurrent editing requires more than the explicitly accepted fresh-read compromise.
   Before-value undo must refuse to overwrite a later third-party change; it is a new operation,
   not an unconditional replay of a stale whole object.
3. **Larger batches:** only after measured demand/capacity justifies them, add bounded server
   operations, per-item results, idempotency and source-of-truth updates. A separate low-priority
   lane requires ordering protection for every event it can emit, including GRID-010; moving
   traffic is not a substitute for capacity control. No direct ES bulk writes.
4. **Collection rename/move and richer templates:** explicit backend/product semantics for
   identity, descendants, memberships and partial completion; not a hidden delete/add macro.
5. **Durable receipts/resume or query-defined operations:** only if real usage/audit needs them.
   Keep these separate from the selection store. Do not raise selection limits to emulate jobs
   or execute `update_by_query` against ES, which is only the projection.

**Executor pointers:** [batch recommendations and limits](batch-editing-at-scale.md#9-recommendations-in-detail),
[selections versus operations](00%20Architecture%20and%20philosophy/05-selections.md#15-selections-vs-operations--separate-problems),
[P33 source-of-truth lifecycle](03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-09-p33-grid-edit-delete-collection-lifecycles.md).
The older selection guide's speculative ES update-by-query wording must not override the newer
source-of-truth rule. Each selected addition needs its own bounded plan and approval; no durable
service, new bulk lane or migration work is implicitly selected here.

## 4. Parity Checklist and Dependency Map

All rows are planned, not implemented by this document. "After" refers to this plan's step.

| Kahuna capability / acceptance family | After | Additional dependency or limit |
| --- | --- | --- |
| Labels add/remove, suggestions and mixed selection | 7 | Common single/batch path |
| Archive/unarchive | 7 | Archive permission; preserve reaper meaning |
| Add images to collections, including drop integration | 7, 20 | Canonical path identity; no duplicate blind retry |
| Metadata fields, clear/reset and list/date/location values | 8 | Whole-override semantics; accepted conflict contract |
| Configured domain fields and batch overwrite/append/prepend | 8 | Hosted specs; no write inferred from display aliases |
| Lease add/remove/replace/clear and batch addition | 9 | Date/access rules; consistent display |
| Rights category/properties/restrictions and removal | 10 | Writable catalogue; metadata/category-lease side effects |
| Metadata templates and preview/cancel | 11 | Composition of fields, collections, rights and leases |
| Collection membership removal and tree create/delete | 12 | GRID-011; explicit non-cascade semantics |
| Crop creation, ratio constraints, existing crop selection | 13 | KUP-044/047; canonical source and export identity |
| Full-frame export, single and batch | 13 | Separate crop creation, not original download |
| Original/optimised/crop download and selected ZIP | 14 | Download policy, usage side effects, byte bounds |
| Files, URL imports, recent uploads, jobs and required editing | 15 | Configured upload mode; GRID-018 disposition |
| Photoshoot assignment/removal and syndication workflow | 16 | Fan-out; GRID-009/013; configured exposure |
| Send to Photo Sales | 16 | Partner side effects; no fire-and-forget success |
| Soft delete, restore and reaper restore | 17 | GRID-012; explicit GRID-010 decision |
| Privileged crop/usage cleanup, selected usage IDs | 18 | Fresh capabilities and destructive confirmation |
| Guided content takedown, deny lease and exceptional hard delete | 19 | Explicit irreversible-action approval; no batch hard delete |
| Image/crop drag, copy/link, asset handles and embedded picking | 20 | External consumers; current iframe exclusion |
| Hosted rollout, permission/configuration variants, full parity acceptance | 21 | Real target/deployment evidence; no hidden fallback counted as parity |

**Useful independent order after step 5:** crop/download can advance while metadata work is
underway; ordinary labels/archive/add-to-collection do not wait for collection-removal repairs;
uploads can begin with their disconnected job UI while ingest reliability is addressed;
syndication and destructive features wait only for their own prerequisites. Backend owners
can prepare GRID-011/012/009/013 fixes independently of the client UI.

## 5. Which Bugs Actually Block What?

| Item | Plan disposition |
| --- | --- |
| KUP-043 | Common live-editing gate: stable authoritative refresh, stale reads, position and selection ownership. Step 4, not a full store rewrite. |
| KUP-044 | Image-level retention implemented in step 1; nested write controls remain consumer-scoped, not a new image endpoint. |
| KUP-045 | Lease-display acceptance in step 9; not a gate for labels. |
| KUP-046 | Server wording in rights/notices work; not a blanket first-write blocker. |
| KUP-047 | Live crop gate in step 13 after shared capabilities; current mock can stay usable. |
| GRID-019 | General batch rollout gate; resolve table/GSI capacity or explicitly bound an operator-only exception. No "six flights makes it safe" claim. |
| GRID-018 and missing drop alert | Upload reliability/operational work, step 15; does not block editing existing images. |
| GRID-011 | Concurrent collection removal, step 12; add-only workflows can proceed. |
| GRID-012 | Source acknowledgement for soft delete, step 17. HTTP acceptance currently precedes the owned handoff. |
| GRID-010 | Delete/restore ordering decision; mandatory protection before a separate bulk lane or stronger undo guarantee. Not a universal first-edit gate. |
| GRID-009/013 | Syndication/photoshoot source and consumer handoff, step 16; no need to hold labels hostage. |
| Private write-admission findings | Maintainer review of affected mutation routes before wider activation; no security detail expansion or live probing here. |
| GRID-003/014/016 | Revisit only where the selected syndication/tier/query path depends on them; GRID-016 is a private deployment/admission question, not a generic editor refactor. |
| KUP-041 | Independent read-resource lifetime/performance work. Do not attach mutation lifetime to search cancellation. |
| KUP-040, S4a/S4b | Already repaired; preserve them, do not schedule them again. |
| KUP-029/030/042 | Resolved bounded work; retain their contracts, do not reopen as general editing prerequisites. |
| KUP-011 direct-parser residual; other parked Grid bugs | Not hosted-editing gates without a demonstrated selected-path dependency. |

Report the batch document's confirmed operational findings to Grid engineers separately, with
their evidence limits: upload loss/drop alert, Edits/GSI capacity and SupplierCleanUp's rights
replacement/actor problem. That communication is useful now, not permission to modify production
settings or run the script. Source-only races must not be described as observed incidents.

## 6. Performance and Validation Rules for Executing Agents

### Preserve the Read Foundation

Read [request lifetime and performance parity](api-request-lifetime-and-performance-parity.md),
especially its decision summary and section 8. Producer-side duplicate request repairs are done;
server cancellation, parse-yield, lean GET/envelope work and PIT are independent proposals.
Do not make them prerequisites or claim they will pay for write-related regressions.

Writes have a different lifetime from superseded reads. Cancelling a search or closing an editor
must not be represented as cancelling a committed mutation. Convergence reads can be abandoned;
the receipt still needs to say what is known about the underlying operation. No global abort-all
manager, automatic retry layer or ES fallback belongs in the write path.

Keep server cost, validity, links and actions if a later lean-envelope optimization is selected.
PIT would hide own writes and does not solve KUP-043. Preserve current PIT-less behavior and
unsupported index-migration scope. Use existing performance histories before proposing new
experiments; request only a measurement that answers a named unresolved question.

### Per-Step Handoff

An executing agent starts with AGENTS, current worklog, this step, its linked owners and the
current backlog entries. Confirm the requested action, topology and writable directory scope.
Read the controlling implementation and existing tests again: historical reports supply
contract questions, not current implementation/deployment certificates.

For each code step:

1. Name its user-visible contract, operation postcondition and explicit non-goals. Identify
   existing assertions that change before implementing. Bug fixes get a failing regression first.
2. Use the smallest existing test homes. New command logic may need a new natural owner suite;
   do not create one framework/file per requirement or a Cartesian permission/topology matrix.
3. Verify no-dispatch when disabled, exact targets, source-method/body contract, meaningful
   denied/unknown/partial outcomes and stale-read ownership at the actual composed boundary.
   Choose representative cases for that operation, not an exhaustive shared checklist rerun.
4. Run the focused test immediately after the first code edit. Then full unit tests after any
   source change, build/type checks, and full E2E after component/hook/store/scroll changes.
   From repository root, use the documented npm scripts, foreground execution and pipefail/tee:
   `set -o pipefail; npm --prefix kupua run test 2>&1 | tee "$TMPDIR/kupua-test-output.txt"`.
   Apply the same runner convention to `build`, `typecheck:e2e` and `test:e2e` when required.
5. Shared Scala/service work needs its owning instructions, focused async/admission tests and
   relevant service suite/integration gates. Preserve Kahuna callers and shared contracts;
   isolate controller/event regressions with fixtures, never live deletions. See the
   [Scala instructions](03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/media-api-91-instructions-for-agents.md).
6. Suggest, do not autonomously run, performance campaigns when touching render/scroll paths
   or the named perceived-performance owners. Discuss serious likely impact before implementing.
   No live-system checks without the required per-session permission. Normal unit/E2E gates
   remain local; no shared mutations in automated suites.
7. Update current owning guides/backlog only for demonstrated changes, the implementation
   changelog for code changes, and deviations for deliberate departures. Record exact validation
   limits. No commit/push without the standing approvals; no secrets in fixtures, receipts or docs.

### Planning Evidence and Limits

This plan used batch-editing section 0 and relevant lifecycle/capacity sections, the hosted guide
in full, current backlog dispositions, request-lifetime findings and its later latency/PIT section,
the [completed read-build decisions](03%20Ce%20n'est%20pas%20une%20pipe%20dream/api-build/api-build-00-plan.md),
the [historical capability reference](03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/media-api-01-capability-inventory.md),
and P25/P33's delivery/write-lifecycle evidence. Current caller searches and targeted source reads
checked each mutation family named above, hosted gates/config, mapper loss, template/rights
side effects, uploads, downloads and the newer takedown exception.

This is not a line-by-line audit of both applications, a fresh deployed permission/capacity
assessment, or proof that every historical backend finding still occurs at runtime. The initial
planning pass ran no tests, builds, browser probes, real downloads, uploads, writes,
infrastructure changes or benchmarks. Step 1's later, separately approved implementation is
marked above; remaining implementation and operational activation require their own approval.