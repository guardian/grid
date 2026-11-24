# Gradually Growing Teeth: Kupua Editing Steps

**24 November 2026 — Collection membership and original/saved-crop drags connected.** Guardian Rights
and its derived metadata are connected. Do not rebuild Rights or ordinary metadata
for Upload: [Step 15's workplan](gradually-growing-teeth.upload-workplan.md#unit-status)
reuses those editors. After Leases, select one missing Upload action at a time,
then review the whole editorial journey. Full Kahuna replacement is a wider goal.

<details>
<summary>Editing interactions, original brief and policy history (2–20 November)</summary>

**Unsent Details edits:** a changed field belongs to the open editor, not to a saved
selection. Selecting B before removing A keeps the text and Description action;
Commit uses the current targets and freezes them on admission. Escape or Cancel
discards the field. Leaving the editor or deselecting the last image asks before
discarding changed work. Double-clicking into full Detail is a departure, not a
transfer of the draft to that image. Reload or tab close requests the browser's
native warning; no Details draft is restored after reload. Upload Form retains
its separate per-image autosave behavior.

**Final selection workflow:** committing closes the field on admission. An exact-set
scalar overwrite can show the submitted value while locked; canonical state and
edit authority still come from reads. Panel and label saves share one transient
selection slot, independent of the current selection. Its numerator counts observed
acknowledged or unchanged edits; one image edited twice counts twice. Issues take
priority. Opening the warning preserves the current selection and distinguishes
not saved from not confirmed. Explicitly selecting the affected IDs narrows the
selection, reveals its first result without replay, and restores remaining progress.
Full Detail shows unresolved issues for its own image. Automatic stops include never-sent targets; a City edit cannot repair a
Country issue. There is no user-facing Stop or receipt history for Details/Labels.
Unload protection for outstanding work is independent of the presenter.

**Proposed execution plan, 2 November 2026.** Requested scope: "Everything and then some",
not only metadata fields. This document authorizes no implementation, shared-environment
writes, safeguard changes or deployment. Each step is a separately selectable work unit;
larger steps should be split at the named operation boundaries. No product code was changed
or live services contacted to prepare it.

**Policy update, 3 November 2026:** explicit data modes and failure handling replace
the migration-era graceful-absence directive. Hosted is the future API-only app;
direct-ES remains temporary laptop support, intended for separately authorized
removal and never an API fallback. That decision alone enabled no writes; Step 2
was subsequently implemented at its bounded label scope.

</details>

## 0. The Recommendation

<a id="current-status-and-shared-ownership-16-november-2026"></a>

### Current status and shared ownership

The numbering is a capability map, not the order in which work was done. **Done**
below means the stated scope is implemented, not that every deployment or later
operation has been accepted. [Upload unit status](gradually-growing-teeth.upload-workplan.md#unit-status)
and its [current parity status](gradually-growing-teeth.upload-workplan.md#current-parity-status)
own the Upload-specific evidence and remaining work.

| Area | Done | Still needed |
| --- | --- | --- |
| Steps 1-4 | Capability retention, default-off label boundary, disconnected editor and simulated stable publication. | Nested controls belong to their consumers; actual deletion behavior remains Step 17. |
| Steps 5-6 | Connected single/bounded multi-image label add/remove, local and hosted fixtures, and local real-write trials. | Shared rollout/capacity and deployment-specific authentication remain separate decisions. Later families reuse this foundation; each still needs its own command. |
| Steps 7-8 | Connected labels, collection additions and U5 ordinary metadata; bounded Subjects added under KUP-051. Explicit Search/detail commits, Form autosave and shared observation/publication. | Archive; configured-domain editors remain separate. |
| Step 10 / U6a | **Done for Guardian:** save or clear Rights; confirm the override and report derived metadata separately. Uses the filtered catalogue and server notice wording. | Deployment acceptance. No category-triggered leases in Guardian scope. |
| Step 9 / U6b | Manual add, individual removal, selection Add and upper-batch replace/clear; date-based badges and canonical readback. | Target-deployment acceptance. No removal from aggregate rows. |
| Step 11 / U6c | No template execution. | Deferred for Upload, not passed or required for its acceptance. |
| Step 13 | Saved-crop browsing, ratio controls and disconnected eligibility/notices, including KUP-047's selected UI boundary. | Crop/full-frame submission and returned-export lifecycle. |
| Steps 12, 14, 16, 17, 20 | Collection add/remove, same-tab tree drops and hover controls; Photoshoot membership; original and saved-crop drag payloads. | Tree CRUD; file/ZIP delivery; syndication and Photo Sales; soft delete/restore; clipboard, embedding and external consumer acceptance. |
| Step 15 / Upload | Ingestion, local batches, Form, navigation, ordinary metadata, upload follow-ups, Guardian Rights, manual Leases, batch pill fields, Photoshoot and collection membership. | U7 archive, crop creation and delete/restore; U8 integrated and target-deployment acceptance. |
| Steps 18-19, 21 | Not done. | Privileged cleanup and takedown need separate destructive-operation decisions. Full replacement and rollout need deployment-owner acceptance. |
| Step 22 | Beyond Kahuna. | Optional follow-ons, not parity gates. |

### What editing guarantees today

For bounded work in one tab, a save captures its target IDs; changing selection does not retarget it. A completed autosave clears only its own draft revision. Kupua distinguishes an acknowledged write from a change observed in search and does not automatically replay an uncertain write.

These are client guarantees, not transactions. Two editors changing different fields on one image can still lose an edit ([GRID-020](bug-backlog.md#grid-020)). Syndication replacement checks the lease UUID the user approved, but cannot make the subsequent server replacement atomic ([GRID-027](bug-backlog.md#grid-027)). Label authorization remains a service-owner decision ([GRID-028](bug-backlog.md#grid-028)). Image deletion stays disconnected: a 202 can precede persistence, absence from search is not proof, and restore has a separate ordering risk ([GRID-012](bug-backlog.md#grid-012), [GRID-010](bug-backlog.md#grid-010)).

For the dated review and its companion ledgers, see the [23 November editing audit](zz%20Archive/2026-11-23-editing-audit/editing-trust-assessment.md). The [changelog](changelog.md) records the client repairs.

### Cross-workflow performance evidence

The [performance plan](editing-performance-plan.md) and [evidence ledger](editing-performance-evidence.md)
own tuning questions and measured results. Local trials are not shared capacity or rollout approval.

<details>
<summary>Foundation rationale, U5 integration and original research qualifications</summary>

**U5 coordination:** Upload and the ordinary-metadata portion of Step 8 share one
authoritative metadata operation for Form and existing single/multi-image panels.
Form pause/blur saves, upper-batch arrows, filename fallback and preset-label follow-ups
retain their different interaction and target scopes. Configured-domain editors
remain outside U5. This implementation is not deployment approval, a new conflict
API or permission for live writes.

**Selected U5 integration, 18 November:** ordinary metadata, Form autosave, upper-batch
arrows and upload follow-ups share startup admission/pacing. Speed remains unchanged.
Metadata actions reserve complete captured membership, execute in groups of 100 and
retain freshness protection within a 10,000-image session budget. Cold review, repairs
and full gates are complete; local tuning remains separate. The Upload U5 section
owns scope and validation evidence.

**Build a real editor with a disconnected submission path, then connect one complete operation.
Do not build every button first, and do not enable every backend write first.**

The useful version of a "dead button" is what the crop editor has started: real input,
validation, preview and request construction, but no submission. A disabled button alone
proves very little. An active button that pretends to save is worse. Before connecting it,
test the same command through a fake transport, including failure and delayed visibility.
Then enable that one operation for one disposable image, observe its whole lifecycle, and
only then expand its scope.

The shared preparation was **steps 1-5**: capabilities, guarded transport, a disconnected label
editor, stable post-write refresh, and the first real label edit. Kupua now has that
editing foundation and the other feature families can be scheduled according
to their local dependencies. **Step 6 added the bounded label batch path.** Neither requires
finishing the entire Grid backlog, inventing batch APIs, adding PIT or solving KUP-041.

Labels, ordinary metadata and collection membership are connected; archive remains
open. Crop saving can proceed after its own authorization without
waiting for metadata/rights editors. Upload, leases, rights and destructive workflows do
not all have to wait for one another. The numbered order is not a linear programme.

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
- Crop geometry, request construction and disconnected eligibility/notices exist; actual
  creation and export publication do not. Do not replace the working crop engine to add submission.
- The current host implementation admits DEV/TEST, not PROD, and excludes iframe pickers:
  [KupuaPage.scala](../../../kahuna/app/lib/KupuaPage.scala). Full replacement includes a later
  deployment/integration decision, not just finishing the editor panels.

### Corrections Needed Before Turning Research Into Instructions

1. **Fresh read is mitigation, not conflict prevention.** Whole-object metadata replacement
   can still race between GET and PUT. Never promise that it cannot overwrite another editor.
2. **Concurrency is not requests per second.** The selected 100 targets and three
   per-image executions are prototype ceilings, not a capacity certificate. Shared capacity, rate and
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

</details>

## 1. Shared Foundation

**Done: Steps 1–6** at their stated prototype scopes. The recorded real writes were local;
hosted fixture coverage does not establish shared deployment capacity or session behavior.

<details>
<summary>Steps 1–6: original contracts, implementation closeouts and local label trials</summary>

### Step 1. Agree the Write Contract and Retain Authoritative Capabilities

**Depends on:** approval of this bounded foundation, not approval of every later feature.

**✅ Complete: both agreed read-only parts, 2 November 2026.**

1. **Image-specific capabilities:** Kupua now keeps the server's information about whether
   this user may edit or crop each image, across search results, detail and selections.
   New responses can remove previously available capabilities.
2. **User-level permissions:** Kupua can ask for the signed-in user's general permissions
   when needed. This does not override permission for a particular image. The later
   connected label and Upload paths now use the session reader.

**What this meant at Step 1:** the information needed by future editing controls was available;
the later connected label and Upload paths are described above. Both parts were developed with failing-first tests
and passed the full unit, build and browser checks. No live-service verification was performed.

**Still consumer-scoped:** nested write controls. Steps 2-3 subsequently defined and
implemented label write outcomes; new operation families need their own contracts. The [component reference](00%20Architecture%20and%20philosophy/component-detail.md)
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

**Original default-off, fixture-verified boundary, 4 November 2026.** One
named `add-labels` operation now uses the authoritative edits/labels resource,
with default-off global/per-operation rollout, validated metadata/auth origins,
local guarded proxies and Kahuna-injected hosted settings. No UI caller or live
activation is present. [The API contract](../../src/dal/grid-api/README.md#step-2-command-boundary)
owns exact outcomes, reload policy and fixture/deployment limits. The temporary
rollout gates are intended to be removable once editing is verified, not a permanent
configuration framework. **Step 6 supersedes those rollout/address dependencies with
one startup-captured preference and existing-root discovery.** The requirements below describe the current boundary;
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

Local Vite routes retain exact supported methods/paths and the read-POST allowlist.
One temporary saved startup preference controls editing in both frontends, requiring
reload rather than live switching. Missing/invalid storage is off. Do not add per-feature,
per-command or bulk rollout flags. Root edits/session discovery supplies validated service
origins once per page; local fixed proxies must match. Hosted bootstrap/site settings
remain separate. Eventual API-backed editing has no rollout switch, only proper permissions.

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

**Done when:** fake local and hosted transports prove default-off/unknown actions dispatch nothing,
only implemented commands with exact capabilities can dispatch, reads retain their exceptions, and expiry
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
labels; unavailable suggestions leave free entry usable. Shortlist omissions were
accepted for this step. The later [U6c enhancement](zz%20Archive/better-suggestions-aggregation-endpoint-enhancement.md)
adds discovery beyond the shortlist in API mode without changing the editing workflow.
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

**Historical Step-3 boundary:** mobile editing UX was deferred at this checkpoint.
The separately selected Step-7 expansion subsequently integrated actual desktop/mobile
metadata controls; see the [current implementation checkpoint](#current-implementation-checkpoint)
and [UI decisions](gradually-growing-teeth.editing-ui-decisions.md). Physical-phone
keyboard/native-picker acceptance remains distinct from browser emulation. Direct-ES
editing remains unavailable.

### Step-3 Closeout and Deferred-Work Schedule

**Historical closeout:** Step 4 and the Step 5/6 label work listed below have since
been implemented at their recorded scopes; retain this schedule as the original handoff.

| Work | When it is tackled | Boundary |
| --- | --- | --- |
| Mobile metadata-editing UX and phone preview access | Subsequently implemented at the selected app-UI scope under Step 7 | Standalone studies are retired; physical-phone input acceptance and new save hookups are not implied. Direct-ES remains read-only. |
| Improved suggestion discovery beyond the popularity shortlist | Completed separately on 21 November | API-backed search and entry share the [enhanced U6c lookup](zz%20Archive/better-suggestions-aggregation-endpoint-enhancement.md); the original editor step required no backend change. |
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

**Execution scope, 7 November:** the [implementation plan](gradually-growing-teeth.step-4-publication-plan.md)
owns accepted choices, rationale, freshness, performance and proof details. Units A-B
have completed their checkpoints; separately authorized Unit C is implemented and
validated at its operator checkpoint. Unit D was separately confirmed on 7 November
for integrated proof and closeout only. After its gates, rehearsal and independent reviews,
the operator accepted Unit D and the Step-4 simulated foundation on 7 November.
Do not start another step merely because its predecessor passed.
Home, New images ticker and existing refresh behavior remain unchanged, with no
new refresh-view control or compulsory reload. No live writes or later editing
steps are enabled by these units or by this documentation update.

**Implemented plumbing:** extension acceptance excludes duplicate
incoming IDs while retaining raw cursor progress and useful demand. Same-slot
buffer replacement is the selected publication route; unchanged-ratio metadata
updates preserve geometry and scrolling prediction. The per-cell experiment and
interactive trial tooling are removed, while regression coverage remains. Normal
editing remains disconnected. Injected single-label simulation now has bounded
canonical observation, touched-ID freshness and grouped publication through existing
owners, including selected metadata and current full standalone projection.
Unit B separates retained display positions, raw scan frontiers and action-owned rank
authority. Unit C adds explicit unavailable/deleted slots, local complete-set deletion
when the mounted viewport fits, and cross-view acceptance. The detailed plan's checkpoints
record their evidence and limits. KUP-043 is closed for the accepted simulated contract;
real deletion and live activation are not implied by these implementations.

**UX clarification, 5 November:** distant changes in a millions-image search must
not interrupt local scrolling just to reconcile imperceptible rank/count drift.
Stable display positions and approximate navigation remain useful without exact
global ordinals; identities, permissions, operation outcomes and exact range targets
remain strict. Ordinary continuation is not automatically a rebase trigger. The
detailed proposal now includes a testing sub-plan with a nine-million logical-result
fixture, a five-image counterexample and mandatory agent-driven embedded-browser
rehearsal. The detailed plan's checkpoints record executed evidence and its limits.

Begin only after step 3's closeout. Use simulated label
addition initially; the deferred removal command is scheduled for step-5 preparation,
not a prerequisite that silently expands this step.

This is the hardest common prerequisite, not a cosmetic refresh button. Use the disconnected
label operation plus delayed canonical fixtures to implement one shared publication path.
Keep the current viewport stable: update affected images in place, retain surviving boxes,
and represent confirmed deleted/unavailable entries without immediately compacting
a scrolling list. The detailed plan's section 5.6 owns the implemented complete-set
exception and the contextual deletion direction: deliberate command removal, background
stability and harmless offscreen cleanup. Unit C supplies conservative plumbing, not
the completed real Delete-button experience. The latter belongs to Step 17's separately
commissioned interaction walkthrough and implementation, not an expansion of Unit D.
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

**Done at the connected local label scope:** add and removal transport, fixtures,
real local add/remove and stable observed readback are complete; Step 6 subsequently
added bounded batches. Hosted TEST evidence below is operator-reported; wider hosted
activation and deployment-policy certification are not complete.

**Completed preparation, retained as contract:** removal support deferred from step 3
was implemented with a bounded, default-off command. Its original requirements were to obtain explicit
authorization for a bounded, default-off removal command using the authoritative
resource and existing origin/method policy. Exercise its lifecycle through the same
editor and receipt owner with isolated local and compiled-hosted fixtures, including
blocked, rejected, uncertain and held outcomes. Verify its postcondition through
the step-4 publication path before any live activation. Do not manufacture a removal
URL from missing capabilities, silently extend the add-only transport, or treat the
already-present disconnected remove control as evidence that execution exists.
Any required safeguard changes still need separate permission.

The following describes the completed local connection and the separate live-trial boundary.
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

**Selected local checkpoint (7 November 2026):** default-off startup wiring now connects
the existing executor, editor/receipt and bounded readback/publication owners for one
image and one label per submission. Local-proxy and compiled-hosted fixtures exercise
ordinary connected controls with two writes, one observation read per write and unchanged
retained-cell geometry. Existing synthetic cases retain blocked/rejected/unknown/held,
authority-withdrawal and standalone failure coverage. Explicit connected add/remove/add
is permitted after acknowledged observation; pending/unknown outcomes are not replayed.

The operator manually added two labels separately to the one authorized local Grid image,
including a label containing Unicode and a space, then removed only those additions.
All four actions were acknowledged and observed. Kupua retained cell geometry and the
original label; a bounded read of the advertised local Grid resource confirmed the exact
original label set. Temporary enablement was disabled after the trial. No backend policy,
shared TEST/PROD service or image deletion was changed. This is local-topology evidence,
not deployed CSP/CORS/CSRF/login-return certification. Hosted activation and production
batching require separate authorization.
The brief existing-label colour flash reported during the trial was reproduced and fixed
as [KUP-050](bug-backlog.md#kup-050); it was a presentation defect, not a persistence failure.

**API-topology admission alignment:** implementing a named operation includes aligning
the shared client and exact Vite transport guard, with focused tests,
so supported API frontends do not require an additional code change merely to select
that operation. Existing-root discovery supplies satellite addresses; do not add Kahuna
editing flags or address fields for each feature. This is part of the operation's integration, not something deferred
until Step 21. It must not enable editing by default, admit unimplemented names, extend
hosting stages or add direct-ES editing. Live/configuration activation and deployment
verification remain separately authorized; code support is not evidence of deployed
cookie/CORS/CSRF or backend policy correctness.

The original label follow-up aligned Kahuna's producer with both operation names.
Step 6 removes that temporary producer policy and satellite-address injection after
rewiring consumers to discovery. The existing Scala suite preserves bootstrap, opt-in,
stage/iframe and CSP guarantees; compiled-hosted fixtures exercise add/remove without
the removed fields. See the
[hosted guide](00%20Architecture%20and%20philosophy/09-deployed-via-Kahuna.md#editing-support-by-frontend)
for the current support matrix, exact script flags and configuration locations.
No real hosted/shared-system activation follows from this alignment.

### Step 6. Expand to Bounded, Paced Multi-Image Operations

**Depends on:** step 5; capacity decision before shared batch activation.

**Done for bounded connected label add/remove in the recorded local/fixture scope.**
The runner and publication owners are reusable foundations, not proof that other
families or larger Upload batches are implemented. Shared multi-user activation and
any larger target/freshness capacity require their own decisions.

Preserve current selection behavior: 5,000 bounds a server range walk and the metadata LRU,
not all accumulated selected IDs. The selected common policy is a **100-image write ceiling and
at most three concurrent per-image executions**, with smaller action-specific limits for expensive or
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
100/three alone is not that approval or a guarantee against throttling.

Snapshot target IDs, retain partial results and allow stop-remaining. A future retry of
failed/unknown items must be explicitly selected and reconciled; the current label UI
does not provide a general per-item retry workflow. Appending text, adding leases,
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

**Step-6 implementation checkpoint (10 November 2026):** one common policy/execution/queue
owner admits 100 images, three concurrent image-edit executions, 250 ms between starts and
one waiting operation. This replaces both the initial 20/two implementation and the earlier
approximately-300/six plan direction. One temporary default-off saved preference is captured
at startup in Vite and hosted builds. Hi, Joshua in Settings or Shift+F12 opens the panel;
Apply and reload saves and reloads. No live switching, cross-tab admission synchronization,
per-operation/bulk flags or numeric tuning UI is introduced. Root discovery supplies edits/
session once per page, allowing removal of Kahuna's mutation and satellite-address injection.

Addition and removal capture one label and all target IDs, reject oversized actions
before edit hydration and preserve whole-target eligibility. The existing editor store
serializes operations; receipts expose queued, in-progress, stopped and partial outcomes.
Stop remaining never undoes started commands. A 429 delays unsent starts by one second,
never retries a possibly accepted write, and remains unknown after dispatch.

One group, the existing 200-ID admission cap, three grouped mget attempts at least one
second apart and 1,000 touched IDs remain. Connected dispatch has a 120-second bound;
final observation lasts up to ten seconds after dispatch settles, under a 130-second
hard observation cap. After one early read, remaining attempts wait for dispatch.
Waiting operations start clocks only on activation. Slow/throttled work can still finish
with explicit unsent stopped items. Early partial readback and grouped canonical publication
preserve selection and geometry. Stopped unsent reservations are released without rolling
back newer read evidence. The [command contract](../../src/dal/grid-api/README.md#step-6-bounded-label-execution)
owns the precise composition and adjustable policy location.

Isolated ordinary local-proxy and compiled-hosted workflows exercise multi-image add/remove,
overlap, stop/resubmit and navigation. Newer navigation reads may supersede an older
observation while retaining the actual label. These fixtures are not live-system evidence.
The operator's earlier hosted TEST trial is operator-reported Step-5 evidence, not an
agent-observed bulk trial. No live flag, service or configuration has been changed.

Acceptance requires independent correctness/resource and simplicity/test reviews of
coherent batches and accumulated integration, plus the full unit, build, browser-type and
E2E gates with retries disabled. Historical successful Step-6 checks do not certify a later
policy change or authorize live bulk activation.

**Operator clarification:** GRID-019 need not be repaired before a separately authorized,
conservative operator trial. Its table/GSI risk remains relevant to general shared activation;
client bounds are not server protection. No infrastructure repair or performance campaign
is part of this implementation.

### Step-6 Local Testing Addendum (10 November 2026)

**Scope:** repaired Kahuna-hosted Kupua, one foreground desktop browser and a local
Grid with 606 uploaded images, Docker ES and LocalStack. Labels only, using the selected
100-target ceiling, three executions, 250 ms start spacing and one waiter. These results
complement existing Kahuna production experience and the automated fixtures; they are
functional/local timing evidence, not an AWS capacity calibration or a new rollout gate.

**What acknowledgement and readback mean:** a successful label acknowledgement follows
the source write and event publication; it does not mean the change is already visible
through media-api's search-backed mget. A 100-target action uses 100 prerequisite edits
GETs and 100 individual writes, then at most three grouped observation reads. Later reads
request only targets still needing observation. They do not save the change again or
replay a mutation. Service discovery/session reads, normal browsing reads and explicit
agent verification reads are separate from this operation budget.

The original local exploration found an acknowledged target whose observation expired
and whose stale selected metadata prevented further editing. The repair reserves the
final read later in the existing window and permits deliberate fresh-state recovery
after expiry, without relaxing authority or unknown-outcome guards. Local and compiled-hosted
regressions cover expiry, reselection and a new explicit action. The original failed
response bodies were not captured, so navigation was not established as its cause.

**Stationary repaired-hosted timing baseline:** one 100-image add and one 100-image removal.
Durations are browser round trips, not isolated DynamoDB or Kinesis timings.

| Measurement | Add | Remove |
| --- | ---: | ---: |
| Prerequisite read, median | 18 ms | 21 ms |
| Write acknowledgement, median | 36 ms | 38 ms |
| Write acknowledgement, 95th percentile | 63 ms | 54 ms |
| Source-read start to acknowledgement, median | 58 ms | 62 ms |
| First write start to last acknowledgement | 24.8 s | 24.9 s |
| All targets observed | About 30 s | About 30 s |
| Maximum overlapping captured image executions | 1 | 1 |

The approximately 25-second dispatch duration was principally the deliberate start
spacing, not evidence of laptop saturation. Raising the three-execution ceiling alone
would not have accelerated these particular runs. The immediate final reads saw 98 additions
and 96 removals; the reads about five seconds later observed the remaining two/four.
This bounds when visibility was checked, not the exact time each projection became visible.
Both operations acknowledged and observed every target, with stable selection and sampled
row geometry. Their 200 writes matched 200 publications and 200 processed backend records.

**Kahuna comparison on the same local cohort:** the same 100 images were identified
by an existing label, loaded and selected through Kahuna's normal UI, then given one
new label and had it removed. Query/selection setup and a separate final verification
read are excluded from action timing. Both clients used their unchanged default policies;
this compares the same editing workload, not identical schedulers or request shapes.

| Measurement | Kupua add | Kahuna add | Kupua remove | Kahuna remove |
| --- | ---: | ---: | ---: | ---: |
| Write acknowledgement, median | 36 ms | 569 ms | 38 ms | 548 ms |
| Write acknowledgement, 95th percentile | 63 ms | 774 ms | 54 ms | 1,211 ms |
| All 100 writes acknowledged | 24.8 s | 2.15 s | 24.9 s | 2.42 s |
| All targets observed | About 30 s | 2.70 s | About 30 s | 2.94 s |
| Maximum outstanding client writes | 1 | 30 | 1 | 30 |
| Prerequisite edits GETs during action | 100 | 0 | 100 | 0 |
| Observation requests before completion | 3 grouped mgets | 200 singleton GETs | 3 grouped mgets | 199 singleton GETs |

Kahuna's writes use already-held label resource links; Kupua's current command contract
first reads the authoritative edits resource. After batch completion Kahuna issued another
100 image GETs for each action. Its pre-completion image reads peaked at ten outstanding,
matching the shared polling queue; the later refresh burst peaked at 100. These are client
requests outstanding, including possible browser/server queueing, not a measurement of
simultaneously executing backend handlers. All captured image reads ended by 3.19 s for
addition and 3.30 s for removal. Kupua's unrelated browsing traffic was not separately
measured in its stationary baseline; do not present the named request counts as a complete
all-traffic comparison.

Both Kahuna actions dispatched exactly once to each captured target, returned 200 for all
200 writes and reported 100 successful canonical results each. Per-phase captured response
bodies confirmed the expected label sets; final canonical verification confirmed all
original label sets restored. Backend logs matched 200 publications and 200 processed
records with no dropped-message or document-parse failures. The timed capture contained no
API/metadata 401 or 419, and this window had no Kahuna/auth-service warnings; metrics
logger warnings were separate from operation outcomes. Temporary observers were removed.

This is one sequential, warm-selection pair, not repeated or counterbalanced. Kahuna's
cohort query and UI differ from Kupua's broader browsing query, and cache/renderer effects
were not isolated. The large difference is nevertheless a real local UX result under
these defaults: Kupua deliberately spaces starts, whereas Kahuna bursts work. Longer
individual Kahuna request times coexist with much shorter total batch time. The comparison
does not establish where those requests waited or extrapolate AWS capacity from a laptop.

If shorter batch duration becomes the next objective, a small comparison of start spacing
while retaining Kupua's execution ceiling is worth considering before increasing
concurrency. Do not copy Kahuna's singleton polling or remove authoritative-resource checks
merely to match its request count. No defaults were changed for this comparison; existing
Kahuna production experience and infrastructure evidence remain relevant to future choices.

**Start-spacing experiment (10 November 2026):** an operator-authorized reversible
comparison used the same warm, selected 100-image cohort and one temporary label on
the isolated local stack. A fresh 250 ms add/remove control preceded a 100 ms pair.
Only start spacing changed; the target cap, three-execution ceiling, waiter, authority
checks and observation limits stayed unchanged. Cohort and original-label digests
matched across the hosted rebuild, and all original label sets were restored after
each pair and verified again after reloading the restored bundle.

| Measurement | 250 ms add | 100 ms add | 250 ms remove | 100 ms remove |
| --- | ---: | ---: | ---: | ---: |
| Prerequisite GET, median / p95 | 20 / 46 ms | 16 / 29 ms | 17 / 40 ms | 16 / 26 ms |
| Write acknowledgement, median / p95 | 40 / 60 ms | 30 / 50 ms | 37 / 63 ms | 31 / 49 ms |
| Image execution, median / p95 | 62 / 105 ms | 48 / 76 ms | 58 / 97 ms | 48 / 72 ms |
| First-to-last write dispatch | 24.81 s | 10.02 s | 24.85 s | 10.00 s |
| All 100 writes acknowledged | 24.98 s | 10.13 s | 24.96 s | 10.10 s |
| All 100 targets observed | 30.01 s | 15.16 s | 30.01 s | 15.15 s |
| Peak unfinished image executions | 1 | 3 | 1 | 2 |

Every action issued exactly 100 authoritative prerequisite GETs, 100 unique target
writes returning HTTP 200, and three grouped observation mgets. Each action also
matched 100 successful metadata publications and 100 processed Thrall records;
there were no publication failures or non-metrics consumer warnings. The broader
window had no metadata-editor, Kahuna or auth warnings; existing CloudWatch and
media-api metrics warnings remained separate. Additional image reads were captured
separately (four/three for the control add/remove, two/two for the faster pair),
including follow-up traffic; these are not additional grouped observation attempts
or a claim of identical all-traffic boundaries.

During the faster removal, 67 trusted wheel events and a Grid-to-Justified switch
preserved all selected IDs; 61 wheel events occurred before final observation,
including input within 300 ms of that point. Original label sets were restored.
This is a functional browsing check, not measured frame timing or a no-jank claim.

The faster pair reduced dispatch by roughly 15 seconds and complete observation
by roughly half without worse median/p95 acknowledgement in this sample. Maximum
write latency was 271 ms for the faster add versus 171 ms in its control; one
sequential pair does not establish tail-latency equivalence. The faster final mgets
started at approximately 0.12 s, 10.1 s and 15.1 s. The unchanged final observation
schedule accounts for the roughly five seconds after last acknowledgement; this
is not a measurement of five-second backend processing.

The result supports considering 100 ms as a prototype default, not raising
concurrency or copying Kahuna's polling. It is one warm, non-counterbalanced local
pair per policy, not a shared-cloud capacity certificate. The experimental source
and two timing-test adjustments were restored, all 3,722 units passed on both
policies, and the original hosted bundle was rebuilt and verified. No permanent
default was selected; no full E2E or performance campaign was run for this temporary
experiment. Any adopted change still needs its normal regression gates.

**Authentication limit:** the earlier expiry-related warning was not a rejected label write.
Kahuna includes Pandular reauthentication configuration and an initial API-failure login
redirect; Kupua does not inherit that client JavaScript merely because Kahuna hosts it.
Kupua uses the shared login cookie and discovered session, invalidates editing after
401/419, stops unsent work and requires reload after reauthentication/account change.
It never automatically replays a mutation. Real expiry/login-return behavior, including
deployment-specific cookies/CORS/CSRF, was not exercised by these successful local samples.
The command policy is shared by local and hosted builds; that is not certification of
every deployment's authentication integration.

**Additional workflow checks:**

| Case | Observed result |
| --- | --- |
| Browsing during a 100-image removal | Detail entry/return retained the running receipt and targets. During 58 native wheel actions and Grid-to-Justified switching, both publication points coincided with wheel input. Eight Grid and 16 Justified shared visible slots had zero measured unexpected position/size change after accounting for scrolling. |
| Last modified sorting during a 100-image add | All targets acknowledged/observed; visible order, scroll position and 15 sampled slot positions remained stable. This checks retained browsing, not exact global ranks after editing. |
| Removing the matching label under its active filter | All 100 targets acknowledged/observed, selected membership and visible order retained, with 25 sampled positions unchanged. An explicit reload then returned zero query matches while retaining the 100 selected IDs outside the query. |
| Reload during a 100-target action | Reload caught four dispatched writes; all four acknowledged and appeared in canonical state. The remaining 96 were not sent, and no writes resumed in the new document during the bounded check. The exit warning appeared, selection survived and the page-memory receipt was cleared. This is not rollback or durable recovery. |

Selection iteration order changed after a detail/history journey, but membership did not;
the operation's captured targets remained fixed. The initial add used to prepare the
moving-browsing case is not credited as concurrent-publication coverage. These are sampled
functional geometry checks, not frame-timing, paint or sustained-scroll benchmarks.

The additional workflow window contained 404 acknowledged writes, matching 404 metadata
publications and 404 processed records, with no dropped-message or document-parse failures.
Recurring local CloudWatch-metrics warnings and one expiry-related Kahuna authentication
warning were recorded separately; no label write was rejected. This was not a deliberate
authentication-failure test. Temporary observers/listeners were removed; no raw logs,
credentials or image identities were retained in this document.

**Interpretation and recommendations:** retain the target/concurrency limits and bounded
grouped readback; these checks justify no concurrency increase or new tuning control.
The start-spacing comparison above supports a separate decision on 100 ms, with
250 ms restored until that decision. It supplements these correctness results and
the existing Kahuna/infra evidence rather than replacing them.
Corpus size alone is not a write-rate multiplier. Local latency, shared AWS capacity,
concurrent editors and projection work remain distinct considerations.

Live throttling, transport/authentication faults, multiple clients and mobile editing UX
were not established by these checks. Existing isolated fixtures cover failure outcomes;
any real fault exercise needs an agreed bounded mechanism. No per-image polling system,
forced ES refresh, durable job service, automatic retry or wider editing family follows
from this addendum. The [command contract](../../src/dal/grid-api/README.md#step-6-bounded-label-execution)
continues to own the precise behavior and limits.

</details>

## 2. Add Feature Families Independently

For every following step: use the same disconnected-preview -> fake execution -> bounded live
activation progression. A successful UI rehearsal is not backend validation; a 2xx response
is not projected completion. Single-image activation can precede batch activation.

### Current Implementation Checkpoint

The status table above owns current completion. The following checkpoint explains why
a visible action such as Download, Library or Delete is not yet a connected operation.

<details>
<summary>Panel and action UI checkpoints, preparation contracts and deletion blocker</summary>

**11 November 2026: broader UI, not broader execution.** The operator selected a real
single/multi-image editing surface rather than completing only Step 7's original
family list. The result deliberately brings some later-step presentation forward;
it neither completes Step 7 nor authorizes the remaining save paths.

**12 November 2026: action UI brought forward, not execution.** Search selections and
image detail now expose Share with URL, Crop full frame, Download, Delete and Library.
All five capture immutable **Not sent** previews in the existing activity surface,
including Share: no clipboard write, file transfer, export creation, deletion or archive
change occurs. The startup editing preference does not connect these new actions.
Existing connected Labels is unchanged. Photo Sales and More like this remain outside
this batch. This advances presentation from steps 13, 14, 17 and 20 without completing
their operation implementations or authorizing activation.

| Step / Family | Implemented Now | Still To Do |
| --- | --- | --- |
| 7: Labels, Archive, collection addition | Labels and collection additions connected, including selected images. Library actions prepare Not sent intent. | Archive/unarchive. |
| 8: Ordinary/configured metadata | U5 connects ordinary fields through fresh override merges, readback and publication. KUP-051 adds bounded Subjects. Changed Details drafts follow the open editor; Form autosaves per image and field. | Configured-domain schema and editors. Replacing Taken on works; clearing an embedded date remains disabled (GRID-025). |
| 12: Collection removal/tree | Membership removal and partial apply-to-all controls use canonical path IDs. Same-tab tree drops and hover controls are connected. | Tree create/delete and populated-leaf decisions; GRID-011 accepted for the single-operator prototype. |
| 13: Full frame / Crop entry | Saved-export rail/preview and replace-only crop URLs; shared ratio restrictions; demand-driven mobile lists; enriched eligibility/source/notices in normal, direct and fullscreen editor. Full-frame preparation skips existing/known-ineligible targets with count feedback. All preparation remains Not sent. | Cropper submission/outcomes, returned export identity/readback/publication and canonical result delivery. |
| 14: Download | Advertised download relation retained; single/selection action prepares Not sent intent. | File delivery, names, ZIP generation, resource limits, failures and usage publication. |
| 16: Photoshoots and syndication | Photoshoot assignment and clearing connected; readback confirms target membership only. | Syndication and Photo Sales workflows. |
| 17: Delete | Target-bound red second-activation confirmation prepares Not sent intent. | Command lifecycle, authoritative confirmation, search gap closure and detail-to-search position preservation. |
| 20: Share and drag | Captured-ID link preparation; original and saved-crop drag payloads with canonical grants. | Clipboard delivery and feedback, embedding and external consumer acceptance. |

Other later-step families are unchanged by these UI batches. The
[UI decisions](gradually-growing-teeth.editing-ui-decisions.md) own selected interactions
and deferred badge ideas; the [Kahuna reference](gradually-growing-teeth.kahuna-editing-ui-reference.md)
retains source/local observations useful for finishing the remaining families. Neither
document authorizes a later command or live trial.

#### Action Hookup Boundary

The UI is complete at its disconnected scope, not "99% connected". Share still needs
clipboard handling; Download needs actual file/ZIP work; Full frame, Delete and Library
need their real command, outcome, observation and publication paths. Connect and accept
them individually in a separately selected testing session. Existing bounded Labels
execution is a working precedent, not permission to send other operation names through it.

`image-actions.ts` owns eligibility and captured preview descriptions;
`image-action-store.ts` is a dismissible in-memory ledger of the latest 20 previews,
not a queue or executor. Stable preview identities preserve existing activity disclosures
and Label UI when the ledger changes; disconnected previews do not limit Label receipts.
`ImageActions` supplies shared controls and `ImageActivityFrame` supplies the existing
activity panel shell. Label drafts, execution and receipts retain their existing owners.
Reuse the applicable target, pacing, outcome and publication mechanics when connecting a
second family; do not create one store/operation per metadata field or independent queues
for each button. Request construction and successful-observation predicates remain
operation-specific. Prepared HTTP-shaped descriptions are not a validated transport.

Search actions use explicit selected IDs, not the focused image or retained panel content;
detail actions use the current requested image, independently of an old search selection.
Available selected/resident bodies and capability overlays are resolved using existing
read-order evidence, rather than blindly preferring older selection-cache data. Deferred
Crop entry loses ownership on navigation, capability withdrawal or API-session invalidation.
Pending information blocks preparation immediately without delaying arriving data.
Full frame reports skipped existing/ineligible targets rather than rejecting an otherwise
usable selection; unknown crop information is not evidence that a full frame is absent.
Library changes only explicit archive flags, preserving server-owned retention reasons.

**Deletion activation blocker:** confirmed deliberate deletions must disappear and close
gaps on the search page, not remain as confusing deleted slots. Detail deletion returns
to search with a nearby surviving image as the position anchor. Failed/uncertain targets
remain selected. The existing complete-set/viewport-fit compaction exception is not the
scrollable/indexed implementation of this requirement; finish that separately before
activating Delete. No optimistic disappearance or simulated successful deletion is added
to the ordinary app by this preview UI.

The full local unit, build, browser-type and E2E gates passed with E2E retries disabled.
These are disconnected/local-fixture checks, not live-command, deployed-authentication,
physical-phone keyboard or performance certification.

</details>

### Step 7. Finish Labels, Archive and Collection Addition

**Depends on:** step 5; step 6 for batches.

**Status: partial.** Labels and collection addition are connected for individual images,
selections and Upload. Archive/unarchive remains unimplemented.

<details>
<summary>10–11 November UI inventory (before U5 connected ordinary metadata)</summary>

**Expanded UI scope, 10 November 2026:** the operator selected integration in the
actual app, not another desktop mock. Labels retain their existing connected or
disconnected executor. The ordinary metadata fields in the register below and
collection membership have inline controls that prepare explicitly **Not sent** intents;
they do not write, optimistically alter canonical metadata or claim persistence.
The UI boundary captures field, action, value and image IDs. Future hookup must
reuse existing admission, execution, readback and publication ownership, not treat
the presentation callback as authorization or transport.

Shared controls include wrapping pills, delicate inset action separators, counted
action tooltips, stronger hover limited to fine hover-capable pointers, unclipped
input focus, icon-only field-header Add, overlay suggestions and 36px touch targets.
Desktop uses the existing boxed plus; touch uses a dashed circle, with pill values
below the heading. Suggestions follow available panel/card width, including resize.
Metadata suggestions sit above the owning field or below its actions, rather than
overlapping the editor footer; the viewport-limited list scrolls when space is short.
Refine retains input-based placement. Editor resize and scrolling update the popup.
Wider touch sheets are width-constrained and retain existing drag/scroll ownership.
The shared card follows the keyboard's visual viewport temporarily; the selection
floaty docks above its real top and moves with it, with actions kept onscreen.
The mock's Read only switch is removed; the existing startup editing preference
is unchanged. New prepared actions remain disconnected regardless of that preference.

Description uses independent bottom-positioned mode drafts: mixed selections open
blank with Overwrite selected; matching selections open prefilled without a visible
Overwrite control, reserving its space. Add before/after can be toggled off to return
to the shared text. Multiline Enter inserts a newline; Cmd/Ctrl+Enter prepares.
All-empty unchanged fields cannot commit. Blank Overwrite clears populated/shared
or mixed text without a separate Clear action; empty Add before/after remains a no-op.
Mixed text overwrite editors use field-specific italic placeholders that disappear
with input. Taken on uses explicit numeric segments and a separate native calendar;
Image type has a named mixed choice.
Pending reads disable preparation without discarding
an open draft; incomplete selections cannot claim complete coverage.

Phone scalar reading rows keep labels and values side by side, with pencils at the
right edge. Open scalar forms can use full width. Multiline fields and pill blocks
remain stacked. Read-only neutral metadata pills use the same touch height as editable
Keywords without gaining edit actions; table and thumbnail sizing are unchanged.

#### Ordinary Metadata UI Coverage

**UI-only register, 11 November 2026.** This describes the API-mode panels, not
connected save support, permission certification or a new command rollout. The
[Kahuna inventory](gradually-growing-teeth.kahuna-editing-ui-reference.md#2-textual-metadata-empty-shared-and-mixed)
remains the source reference; it is not Kupua's completion record.

| Field | Current UI / Prepared Value |
| --- | --- |
| Title | Existing multiline editor; string. |
| Description | Multiline, independent Overwrite/Add before/Add after drafts; string. |
| Special instructions | Multiline user addition only; upstream Usage instructions remain a separate read-only value. |
| By, Credit, Copyright | Text entry; Credit uses the existing suggestion provider, other fields stay plain textboxes without invented catalogs. |
| Taken on | Numeric day/month/year/time/millisecond groups with auto-selection, digit-group navigation and a separate whole-second native calendar. Existing fractions survive unchanged/reverted entry; changing other date/time groups resets them to zero, while manual fraction edits remain possible. Mixed dates initially show italic Multiple dates; activation reveals/focuses the groups. Clearing is temporarily disabled under [GRID-025](bug-backlog.md#grid-025), including empty mixed-date submission. Existing ambiguous-hour offset handling and formatted readout remain; prepares a valid ISO instant only. |
| Image type | Select from configured image types; hidden without a catalog. Mixed placeholder differs from an explicit Unknown/clear choice. |
| Location | One four-component form. Intent contains only changed components. Trashcan actions explicitly mark individual mixed components for clearing; untouched mixed components are preserved. Italic `Multiple cities`-style placeholders denote differing values, without the parentheses used in comma-separated reading text. There is no whole-location Clear action. |
| People, Keywords | Existing editable-pill presentation; named add/remove preparation. |
| Photoshoot | Suggested text using the existing provider; trimmed no-op/clear semantics, separate `photoshoot` identity rather than `metadata.*`. |
| Labels | Existing target-bound draft, admission, queue, execution and observation owners; not replaced with the new preparation-only path. |
| Collections | Existing breadcrumb-pill membership preparation; no new tree management or transport. |

Prefilled text/textarea entry puts the caret at the end. Desktop pencil positions
share the field's far-right edge; date and grouped Location forms use full panel
width while editing. Escape first dismisses an open suggestion list, then cancels
the field; IME candidate dismissal does not cancel a label draft. Suggestions do
not consume Cmd/Ctrl+Enter from the field's preparation handler. Native date errors
remain visible and associated with their input.

**Remaining configuration boundary:** configured-domain editors cannot be selected
from opaque values or search aliases. Current hosted bootstrap does not supply the
domain schema (type, options, labels and edit-mode opt-in); the local configuration
has no specifications. Supplying that schema is separate scope, not permission to
make arbitrary alias fields editable. Source, Byline title, supplier references,
file/system fields and Usage instructions remain read-only. Other workflow
families retain their separately selected roadmap steps. Direct-ES remains read-only;
its projection and safeguards are unchanged by this API-mode editor work.

The scalar control catalog is in [MetadataTextEditor](../../src/components/MetadataTextEditor.tsx),
the list catalog in [MetadataPillEditor](../../src/components/MetadataPillEditor.tsx),
and composite preparation in [MetadataLocationEditor](../../src/components/MetadataLocationEditor.tsx).

This does **not** complete archive/unarchive, connect new metadata or membership
writes, implement collection-tree CRUD, or settle the final desktop/collection UX.
The operator accepts existing single-operator prototype concurrency limits for
future hookup: [GRID-011](bug-backlog.md#grid-011) and
[GRID-020](bug-backlog.md#grid-020) remain recorded, not new blanket editing gates.
No server repair, shared-environment mutation or broader rollout is authorized here.

</details>

Label suggestions, add/remove and mixed-selection behavior are implemented. Add archive/unarchive as
explicit target states, not a blind toggle across mixed values. Archive is persistence/reaper
policy, not soft deletion. Selection additions use an existing collection's canonical path
identity and fresh capability information. Do not replay an ambiguous addition.

**Executor pointers:** [labels](../../../kahuna/public/js/services/label.js),
[archive](../../../kahuna/public/js/services/archive.js),
[collections caller](../../../kahuna/public/js/services/api/collections-api.js),
[Kupua tree](../../src/components/CollectionTree.tsx),
[collection store](../../src/stores/collection-store.ts),
[collection controller](../../../collections/app/controllers/ImageCollectionsController.scala).

**Done when:** each action works singly and at its approved batch cap, updates detail/selection
and search display, and preserves the viewport under a matching label/archive/collection filter.
Step 12 covers connected membership removal and still-unimplemented tree deletion. Archive overwrite is
last-writer-wins, not a universal commutative-operation guarantee.

### Step 8. Editable Metadata, Including Configured Domain Fields

**Depends on:** step 5; step 6 for batch fields; a documented concurrency choice.

**Ordinary metadata connected through U5; configured-domain editors remain excluded.**
**Collection permissions: no separate cache planned.** Consume the actions on existing image reads. There is no withdrawal poll or extra permission request; the selected panel calculates eligibility locally from current images and memberships. Keep freshness fences authoritative. Revisit only if profiling shows this calculation materially affects a representative workflow; do not cache today's server policy as an authorization shortcut.

Ordinary fields use fresh original/override reads, intended-field merges and shared
publication. Equality with an original removes that override; no separate Reset UI
is introduced. The configured-domain schema/editors described below remain future work.
Subjects editing was selected separately under KUP-051 and now uses this shared save path.

**Temporary date restriction (operator, 18 November 2026):** [GRID-025](bug-backlog.md#grid-025)
records that the backend cannot explicitly clear an embedded Taken on date. Clearing
is disabled in Form and single/multi-image Details; setting/replacing dates is connected
through U5. A separately authorized backend PR
and verified deployed support must precede re-enabling it. The clear requirements
below remain the target capability, not a claim that today's backend supports dates.

**Related scope:** [KUP-051](bug-backlog.md#kup-051) covers bounded add/remove and confirmed batch clear. The Upload plan's
[U5 review](gradually-growing-teeth.upload-workplan.md#u5-required-metadata-saving-and-batch-propagation)
also routes draft handoff, discard and changed-canonical-value candidates to this
shared work without preselecting new UX or weakening the accepted GRID-020 boundary.

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

**Connected at local fixture scope:** see the [manual editing guide](00%20Architecture%20and%20philosophy/07-syndication-and-leases.md#manual-editing-in-api-backed-kupua). Manual leases follow the connected Guardian rights editor as an
independent family. Category-triggered lease automation is BBC-specific and is
excluded even when configured on TEST. Templates remain deferred.

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

**Depends on:** the shared Step 8 metadata path and Step 6 batch execution, not Step 9.

**Done for Guardian (22 November).** The [Kupua editor](../../src/components/UsageRightsEditor.tsx)
and [command path](../../src/lib/grid-commands.ts) support single, selected and upper-batch
edits. The [browser witness](../../e2e/local/grid-mutations.spec.ts) covers a rejected
derived-metadata step and server notices. This is implementation, not deployment acceptance.

<details>
<summary>Rights contract, original acceptance criteria and source references</summary>

Use the server's writable/filtered category catalogue, properties, required fields, defaults,
dependent options and restrictions. The search category catalogue alone is not an edit form.
Support clearing/removing overrides without losing unrelated rights properties accidentally.
Preview whole-object replacement explicitly, especially for mixed selections.

For Guardian rights, save the override and invoke metadata-from-rights. Do not
run the optional category-lease work. Keep individually visible substep outcomes.
Do not broadcast-and-forget dependent writes or report the whole operation successful when only
rights saved. Retrying a later failed substep must not replay earlier non-idempotent work.
Detail now uses the server wording for known validity reasons ([KUP-046](bug-backlog.md#kup-046)).
Private maintainer review of write-admission consistency must precede broader activation of
affected rights routes; this plan contains no exploit recipe or permission bypass.

**Executor pointers:** [rights editor](../../../kahuna/public/js/usage-rights/usage-rights-editor.js),
[category lease helpers](../../../kahuna/public/js/common/usageRightsUtils.js),
[catalogue caller](../../../kahuna/public/js/services/api/edits-api.js),
[EditsApi](../../../metadata-editor/app/controllers/EditsApi.scala),
[EditsController](../../../metadata-editor/app/controllers/EditsController.scala),
[Kupua catalogue](../../src/lib/usage-rights-catalogue.ts).

**Done when:** category change/clearing, dependent metadata, mixed targets and a failed
middle substep have tested outcomes. Cost, restrictions, validity and crop/download capability
are refreshed from the server, not guessed from the chosen category.

</details>

### Step 11. Metadata Templates Without Pretend Atomicity

**Deferred for Upload.** No implementation or acceptance is claimed.

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

**Membership connected; no tree CRUD.** Per-image, selection and Upload controls add and remove
memberships. A tree row's hover controls add or remove the selected images. Dropping a
same-tab image drag on an existing tree row adds membership; hovering
over the closed header or a closed branch opens it without selecting a filter or writing.
GRID-011 is accepted for the single-operator prototype: a concurrent add can still be lost
when the server replaces memberships during removal.

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

**Done when:** the selected prototype limitation is explicit, or an interleaved
removal/addition regression proves the independent addition survives under a repaired
contract. Do not claim cross-client safety under the prototype limitation. Tree and
membership outcomes are separate; stale counts do not pretend to be exact. Retain accepted
subtree-count approximation. Rename/move belongs to step 22, not hidden delete/create.

### Step 13. Save Crops, Create Full-Frame Exports and Browse Their Results

**Depends on:** steps 1-5; step 6 only for batch full-frame export. KUP-047's
selected disconnected eligibility/notices boundary is already resolved.
**Can move earlier:** does not require the metadata/rights editors themselves.

**UI checkpoint:** full-frame action preparation and normal detail Crop-entry gating are
implemented as described above, together with saved-export selection/URLs, shared ratio
constraints and KUP-047 enriched notices/eligibility. Submission remains unimplemented;
an already-open/deep-linked read-only crop is not a live save path.

Wire server cost/restriction notices and crop eligibility through the common enriched image,
including standalone detail and fullscreen. The selected read-only UI retains frames when
preparation is withheld, using existing facts without polling. KUP-047 is resolved at that
boundary, not authorization for live creation.

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

**Related decisions:** [GRID-022](bug-backlog.md#grid-022) concerns repeat saves that
regenerate shared assets and duplicate export identities; current display deduplication
is not a backend repair or proof that repeated bounds can always be reused. Discuss
refresh/idempotency with the owning maintainers before claiming that guarantee.
[GRID-023](bug-backlog.md#grid-023) is a separate candidate for distinguishing a
withheld crop list from an empty one; assess its UX if this surface is touched, without
revealing unavailable exports or making it a new creation gate. Backend changes and
live trials require separate authorization.

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

**UI checkpoint:** Download currently prepares Not sent intent only. Initial hookup follows
Kahuna's basic single-file/multi-image ZIP workflow, not a new rendition-choice UI. No
download endpoint has been invoked merely to rehearse the control.

Retain authoritative download links, configured restrictions and crop-download settings.
Downloadability is not image/crop validity: Grid's download checks do not include the same
missing-credit/description checks. Do not disable downloads solely because `valid` is false,
or grant them from cost/persistence. Preserve the server's distinct advertised decision.
Use actual download endpoints for downloads, not raw secure assets: usage recording is an
intentional side effect. Keep preview/prefetch paths separate. Preserve names, original format,
optimised choices, crop asset size choices and selected-image ZIP behavior.

Give downloads their own admitted count/byte/concurrency limits rather than assuming 100 large
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

**Built:** file upload and ordinary metadata (U1–U5), Guardian Rights (U6a), manual Leases (U6b), and U7 pill fields, Photoshoot and collection membership. Remaining image actions and U8 acceptance are open.

**Batch editing contract.** An arrow captures the other known images in the open batch, including offscreen peers. Scalar fields set one value; Location sets only the named component. Rights applies the category and its properties. Leases replaces the whole set after confirmation. Labels, Keywords and People apply current pills and explicitly removed pills, preserving unrelated values on peers; an empty source requires a second click to clear that field. For example, removing *Sport* and adding *Football* leaves a peer's *Local* pill intact. Photoshoot assigns one title or confirms a batch clear. Collections copies current memberships additively, never propagating individual removals. Only a confirmed empty source clears peer memberships.

Upload Form opens missing Rights directly for an authorised editor; opening is not a save. Other categories retain the pencil. Cost/restrictions, usability and Library status sit below the thumbnail. Library uses the existing action policy and does not archive an image. Search/Detail keep their own presentation and targets. The [Upload unit status](gradually-growing-teeth.upload-workplan.md#unit-status) owns acceptance and remaining work.

The [Upload workplan](gradually-growing-teeth.upload-workplan.md) owns the sequence,
reusable-density/local-batch contract, source-backed parity checklist and deferred
opportunities. Its [U4.5](gradually-growing-teeth.upload-workplan.md#u45-unified-upload-page-and-navigation)
establishes one open batch above all other uploads, explicit entry/return behavior
and section-bounded navigation. U5 connected ordinary metadata and arrows.
Batch arrows belong only to the upper Form section and capture the displayed batch;
other uploads and detail never become implicit batch targets. Upload selections,
batch-to-Search selection handoff and per-image Show in search remain deferred.
Neither document supplies live-write approval.

File picker, drag/drop and route-independent upload jobs are implemented. URL import
is excluded from the selected Upload scope, domain editors are excluded there, and
metadata templates remain deferred. Do not implement those merely from this broader
editing roadmap. Preserve one new batch per submission; no appending or merging.
Carry upload permission,
size limits, required metadata and configured upload topology in the hosted allowlist. Kahuna
supports both service upload and prepare -> signed bucket PUT -> queued-status update -> status
polling; support the chosen deployed mode and retain a tested contract for the other supported
mode. Signed upload URLs are scoped capabilities, not generic discovered write destinations;
never persist/log them or send session credentials to the bucket unnecessarily.

Distinguish bytes transferred, queued, processed, indexed/visible, duplicate and failed states.
Retain partial and interrupted outcomes without claiming rollback or automatically
replaying uploads. Cancellation/resume controls require separate selection; release
owned file/preview resources and preserve duplicate/soft-deleted-image handling.
Reuse the shared field/rights commands for required metadata, and template composition
only if separately selected, rather than sending a new whole-image payload.

Resolve or explicitly contain [GRID-018](bug-backlog.md#grid-018) before broad upload rollout:
mapping conflict can drop an upload from search after transfer succeeds. A success spinner or
longer poll is not its repair. Coordinate mapping/normalization and dropped-message alerting
with Grid maintainers; existing mappings may prevent an in-place type change, so no automatic
reindex/migration requirement follows. A bounded prototype trial can use approved fixtures,
but cannot establish general ingest reliability.

If separately selected loader/recovery work touches these boundaries, consult Upload's
[B1-B5](gradually-growing-teeth.upload-workplan.md#existing-backend-deferred-by-default):
status scans are not batch history, local attempts do not prove server isolation,
and expiry or failed status updates are not permission to replay. Investigate B4/B5's
error propagation/input validation only with the relevant loader scope and approval;
they are not blanket Upload or U5 gates.

**Executor pointers:** [upload manager](../../../kahuna/public/js/upload/manager.js),
[loader client](../../../kahuna/public/js/services/api/loader.js),
[job lifecycle](../../../kahuna/public/js/upload/jobs/upload-jobs.js),
[drop handling](../../../kahuna/public/js/upload/dnd-uploader.js),
[loader controller](../../../image-loader/app/controllers/ImageLoaderController.scala),
[status controller](../../../image-loader/app/controllers/UploadStatusController.scala),
[loader routes](../../../image-loader/conf/routes).

**Done when:** selected file-upload workflows reach a usable image and required editing, failures remain visible,
and existing duplicates are not silently treated as new items. Verify bucket CORS/CSP and session
boundaries in the actual selected topology. Backend-only derivative/replica endpoints are not
automatically new UI actions just because they exist.

### Step 16. Photoshoots, Syndication Rights and Send to Photo Sales

**Backend boundary:** GRID-009/013's original handoff defects are fixed in [Grid PR #5231](https://github.com/guardian/grid/pull/5231). [GRID-029](bug-backlog.md#grid-029) is a separate reproduced backend defect, accepted for prototype membership editing. Removing a shoot can clear indexed explicit syndication rights while the source retains them.

**Photoshoot membership connected:** Details commits explicitly; Upload Form saves on suggestion choice or blur. A batch arrow applies the trimmed title to captured peers, with a second click to clear. At most 100 direct targets are admitted, one membership write at a time. This is not a ceiling on server-side rights recalculation. Observation confirms target membership only. No syndication editor, partner delivery or client-side rights repair.

**Local verification, 24 November:** on the authenticated HTTPS Vite app, Details assigned a temporary shoot to one unassigned image (PUT 200) and cleared it (DELETE 202). Metadata-editor and media-api agreed after both actions; the image returned to its original unassigned state. This verifies local membership editing, not deployment or downstream rights correctness.

Support photoshoot assignment/removal and the existing rights/syndication workflow exposed by
the target deployment. A photoshoot change can affect rights of other images: preview that
scope and do not apply the ordinary 100-target cap as though only those records can change.
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

**UI checkpoint:** Delete confirmation prepares Not sent intent only. The operator selected
search gap closure and detail-to-search return around a surviving neighbour; see the
activation blocker above. Restore and real deletion are not enabled by the control.

**Interaction design before implementation/activation:** use the
[contextual deletion policy](gradually-growing-teeth.step-4-publication-plan.md#56-unavailable-and-deleted-entries).
The operator and an agent must walk through what the user sees after deleting a single
image, the open detail image or a multi-selection, including partial failure, uncertainty
and delayed completion after browsing resumes. Successful deliberate deletion should
remove confirmed targets and close the gaps; unsolicited changes should not disturb
visible browsing. Offscreen cleanup is permitted only when it leaves visible geometry,
navigation and selection undisturbed. Agree detail's next image, surviving placement
and post-delete selection explicitly; do not silently prune immutable operation targets.
This walkthrough can be separately commissioned earlier, but is not part of Unit D
and is not authorized merely by documenting this direction. No external-change delivery
or offscreen-compaction engine is commissioned here.

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

**Drag support is not embedding parity.** Original and saved-crop drags use canonical grants;
a saved crop requires the matching cropper response and its returned assets. Producing a
payload does not establish that Composer, Pinboard or another external consumer accepts it.

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

### Step 21. Accept Full Parity and Retire Temporary Rollout

**Depends on:** all selected parity rows below, plus deployment-owner approval.

Walk the checklist against the current Kahuna UI and actual target configuration. Recheck for
new callers before declaring parity: this plan is a source-backed snapshot, not a forever-frozen
feature inventory. Include single/multi selection, detail/deep link, keyboard, compact/touch,
session expiry, stale capabilities, partial service absence and navigation during operations.
Do not require every theoretical combination; use representative witnesses for distinct paths.

Coordinate release and any broader user cohort with deployment owners. Retire the temporary
startup editing switch once accepted; the API-backed app offers implemented editing according
to server permissions and resource capabilities, not a permanent flag for every operation
family. Preserve usable read-only behavior when permission is absent. No client switch is
rollback of accepted work. Monitor operation rejection,
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

Related deferred candidates, only if separately selected: [GRID-007](bug-backlog.md#grid-007)
is the historical supplier-script pagination finding behind item 1, not evidence that
the absent script still runs. The Upload register's [B7](gradually-growing-teeth.upload-workplan.md#existing-backend-deferred-by-default)
and [R16/R17](gradually-growing-teeth.upload-workplan.md#refactoring-and-frontend-opportunities)
and [R32/R33](gradually-growing-teeth.upload-workplan.md#navigation-and-editing-scope-opportunities)
cover durable batches, Form exposure/customization and explicit batch/selection handoffs.
Do not silently fold them into U5 or claim local batch history is durable.

**Executor pointers:** [batch recommendations and limits](batch-editing-at-scale.md#9-recommendations-in-detail),
[selections versus operations](00%20Architecture%20and%20philosophy/05-selections.md#15-selections-vs-operations--separate-problems),
[P33 source-of-truth lifecycle](03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-09-p33-grid-edit-delete-collection-lifecycles.md).
The older selection guide's speculative ES update-by-query wording must not override the newer
source-of-truth rule. Each selected addition needs its own bounded plan and approval; no durable
service, new bulk lane or migration work is implicitly selected here.

## 4. Parity Checklist and Dependency Map

Use the [current status](#current-status-and-shared-ownership) for sequencing.
This checklist maps each Kahuna capability to its owning step. A connected
operation is not a deployment sign-off; a preview is not a connected operation.

| Kahuna capability / acceptance family | Step | Status, dependency or limit |
| --- | --- | --- |
| Labels add/remove, suggestions and mixed selection | 7 | Done on the shared single/batch path |
| Archive/unarchive | 7 | Archive permission; preserve reaper meaning |
| Add images to collections, including drop integration | 7, 20 | Connected for individual images, selections and Upload; same-tab tree drop and hover controls implemented |
| Ordinary metadata and list/date/location values | 8 | Connected with fresh override merges; clearing an embedded Taken date remains disabled (GRID-025) |
| Configured domain fields and batch overwrite/append/prepend | 8 | Hosted specs; no write inferred from display aliases |
| Lease add/remove/replace/clear and batch addition | 9 | Connected; deployed acceptance separate |
| Guardian rights category/properties/restrictions and clearing | 10 | Done for Guardian: filtered catalogue and derived metadata; no category-triggered leases |
| Metadata templates and preview/cancel | 11 | Deferred for Upload; no template execution |
| Collection membership removal and tree create/delete | 12 | Membership removal connected under accepted GRID-011 limitation; no tree CRUD |
| Crop creation, ratio constraints, existing crop selection | 13 | KUP-044 image facts and KUP-047 read-only UI done; canonical source, creation and export identity remain |
| Full-frame export, single and batch | 13 | Separate crop creation, not original download |
| Original/optimised/crop download and selected ZIP | 14 | Download policy, usage side effects, byte bounds |
| File uploads, retained batches, other uploads, jobs and required editing | 15 | Upload workplan applicability and U4.5 scope; configured upload mode; GRID-018 disposition; URL import excluded |
| Photoshoot assignment/removal and syndication workflow | 16 | Fan-out; GRID-009/013; configured exposure |
| Send to Photo Sales | 16 | Partner side effects; no fire-and-forget success |
| Soft delete, restore and reaper restore | 17 | GRID-012; explicit GRID-010 decision |
| Privileged crop/usage cleanup, selected usage IDs | 18 | Fresh capabilities and destructive confirmation |
| Guided content takedown, deny lease and exceptional hard delete | 19 | Explicit irreversible-action approval; no batch hard delete |
| Image/crop drag, copy/link, asset handles and embedded picking | 20 | Original and saved-crop drag payloads with canonical grants implemented; external consumer acceptance and embedding remain separate, with iframes still on Kahuna |
| Hosted rollout, permission/configuration variants, full parity acceptance | 21 | Real target/deployment evidence; no hidden fallback counted as parity |

**Sequencing:** after manual Leases, select one remaining U7 family at a time, then U8.
Crop, downloads and the other replacement features can be selected independently when their
own dependencies are met. Backend rollout and destructive-operation decisions remain separate.

## 5. Which Bugs Actually Block What?

| Item | Plan disposition |
| --- | --- |
| KUP-043 | **Resolved** for Step 4's simulated publication contract; connected labels reuse it. Each new operation still needs its own readback/postcondition; deliberate deletion remains Step 17. |
| KUP-044 | Image-level retention implemented in step 1; nested write controls remain consumer-scoped, not a new image endpoint. |
| KUP-045 | Lease-display acceptance in step 9; not a gate for labels. |
| KUP-046 | Resolved for known Detail validity reasons: preserve supplied server wording. |
| KUP-047 | **Resolved** at the disconnected crop UI boundary; live crop creation/readback remains Step 13 work, not an open KUP-047 prerequisite. |
| GRID-019 | General batch rollout gate; resolve table/GSI capacity or explicitly bound an operator-only exception. No "three flights makes it safe" claim. |
| GRID-018 and missing drop alert | **Open for ordinary ingestion:** the newer XMP retry covers direct insertion, not the ordinary ImageMessage upsert. Contain or resolve for broad Upload rollout; not a U5 metadata or existing-image editing gate. |
| GRID-011 | **Open, accepted for the single-operator prototype:** membership removal is connected. Safe cross-client removal still requires repair or a stronger contract. |
| GRID-012 | Source acknowledgement for soft delete, step 17. HTTP acceptance currently precedes the owned handoff. |
| GRID-010 | Delete/restore ordering decision; mandatory protection before a separate bulk lane or stronger undo guarantee. Not a universal first-edit gate. |
| GRID-020 | **Open, accepted for the single-operator prototype:** fresh override reads and same-client serialization mitigate but do not eliminate the race. Not a U5 blocker; concurrent-editor protection needs a separate contract. |
| GRID-009/013; GRID-029 | Original source and consumer handoff defects repaired. GRID-029 remains open and accepted for prototype Photoshoot editing. |
| GRID-024 | **Open backend defect, mitigated in Upload:** rejected QUEUED receipts remain truthful while availability is independently confirmed. Not a U5 gate. |
| Private write-admission findings | Maintainer review of affected mutation routes before wider activation; no security detail expansion or live probing here. |
| GRID-003/014/016 | Revisit only where the selected syndication/tier/query path depends on them; GRID-016 is a private deployment/admission question, not a generic editor refactor. |
| KUP-041 | Independent read-resource lifetime/performance work. Do not attach mutation lifetime to search cancellation. |
| KUP-040, S4a/S4b | Already repaired; preserve them, do not schedule them again. |
| KUP-029/030/042 | Resolved bounded work; retain their contracts, do not reopen as general editing prerequisites. |
| KUP-011 direct-parser residual; other parked Grid bugs | Not hosted-editing gates without a demonstrated selected-path dependency. |
| GRID-004/005, GRID-006, GRID-017 | Independently parked backfill/embedding, local imgops and Kahuna startup work; no natural remaining editing or Upload step without a demonstrated dependency. |

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
infrastructure changes or benchmarks. Later separately approved implementation is
marked above; remaining implementation and operational activation require their own approval.