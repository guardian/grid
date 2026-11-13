# Upload: Reusable Density and Local Working Sets

**Research-backed workplan, 13 November 2026.** This document proposes separately
selectable implementation sessions. It does not authorize implementation, new
dependencies, changes outside `kupua/`, live mutations, commits or deployment.
The operator selects a unit and supplies any additional permissions it requires.
There is no calendar deadline in this plan.

The [editing roadmap](gradually-growing-teeth.kupua-edits-steps.md) remains the
capability reference. This plan owns the proposed Upload sequence, local-batch
contract and density integration. Existing repository instructions, data-mode
safeguards and command-outcome policies still apply.

## 1. Outcome and Boundaries

Two completion conditions are non-negotiable:

1. People can actually upload files and reach usable Grid images in Kupua.
2. The supported Upload workflow is not worse than current Kahuna: completing
   required metadata/rights and the other existing upload-editor operations
   cannot require returning to Kahuna or using disconnected Save controls.

The image-and-fields presentation is a real density, not a standalone upload
list to be rewritten later. Its renderer consumes a bounded browsing window and
must remain usable in principle over ordinary large search results. Initial
product exposure is within Upload; globally exposing the density is not required.

### Selected Direction

- Upload is a distinct working context with density controls, sorting, selection,
  editing, detail and crop navigation. Initially it has no general CQL search bar
  or Filters facets. Facets-as-selection is an interesting later interaction, not
  part of this build.
- Entering Upload does not inherit the departing query, date filters, free-only
  filter, frozen arrival boundary or unrelated selection as mutation targets.
  Returning to search restores its represented position through existing history
  mechanisms. This is not a general multi-workspace system.
- A file-picker submission or drop creates an explicit local batch. Multiple
  submissions are not silently merged. Upload activity, image membership and
  presentation have separate lifetimes.
- Short local-batch URLs resolve through tab-local state, then use existing POST
  image reads. Backend batch persistence, permanent batch links, private
  collections, cross-device history and a Places sidebar are deferred.
- Most batches are small. Roughly 250-500 files is an upper-end validation case,
  not a new acceptance limit or the assumed normal workload. Preserve actual
  configured file-size/type rules; do not invent a batch cap from that estimate.
- Preserve the existing large-result navigation and approximation contracts.
  No exact catalogue-wide pixel layout, rank-repair project or new PIT requirement
  is introduced. Visible continuity and editing stability remain essential.

### Settled Decisions (operator, 13 November 2026)

- **Form density is an ordinary density.** It follows the existing placement
  contract in [focus and position preservation](00%20Architecture%20and%20philosophy/02-focus-and-position-preservation.md#33-placement-values):
  the image the user is looking at keeps its screen position across density,
  resize, panel, zoom and field-visibility changes, in all three scroll tiers,
  with no drift on round trips. It is not a special case for users.
- **Natural form heights.** Fields are not clamped to fixed heights. Off-screen
  height changes are the machinery's problem: an approximate scrollbar/scrubber
  is accepted in all tiers (already true for Justified/seek). On-screen growth
  (typing, opening rights) pushes content below down, never above. If the field
  the user is looking at disappears, the next visible field or the image anchors.
- **Field visibility:** the form layout reads a global visible-field set (default
  all), applied on top of per-image "show if present". No toggle UI is built now;
  adding one later must be a control plus a preference, possibly shared with
  Table columns.
- **Zoom is undecided.** Possible later forms: forms side by side, more compact
  forms, fewer fields. The layout must not preclude any of them (row = one or
  more forms; height from content), but none is built. Font scaling is left to
  browser page zoom.
- **Phones:** Upload must be fully usable on phones; a simpler one-column
  presentation is acceptable.
- **Performance is decisive.** Height-correction cost must scale with the loaded
  window, never with the result total.

### Proposed Defaults to Demonstrate, Not Quietly Reinterpret

- Show five recent batches in the Upload selector, plus outstanding activity.
  The selector limit is not automatic deletion of older membership records.
  Retain lightweight descriptors for the tab session subject to a documented
  storage budget; active jobs and unsaved work are never silently evicted.
- `/upload` represents recent uploads. `/upload?batch=local-<id>` represents a
  particular batch; `image` and crop state can retain their current meanings
  within that context. Exact router structure is selected in U1.
- A missing local batch produces an unavailable state with explicit alternatives,
  not substitution of the latest batch or a library-wide search.
- Switching batches may initially reset refinement/position. This does not waive
  density preservation within the active batch, draft retention, or restoration
  of the departing library search.
- Current-batch arrows use an explicitly captured batch target and show its
  count. Recent uploads are not a batch. No arrow targets all uploads or all
  search results; viewport residency never defines an operation's membership.

## 2. Evidence and Remaining Uncertainty

This research read current source and existing documentation. Earlier browser
exploration covered Kupua densities/detail/crop and Kahuna search/detail/crop/
recent uploads, but did not submit files or edits. Active-batch arrows, failure
recovery and the deployment's upload configuration were not exercised live.
No application tests or performance campaigns were run to prepare this plan.

| Finding | Source and engineering consequence |
| --- | --- |
| Kahuna supports octet-stream service upload and a hash/prepare/signed PUT/status path. | [manager.js](../../../kahuna/public/js/upload/manager.js#L25), [loader.js](../../../kahuna/public/js/services/api/loader.js#L18), [loader routes](../../../image-loader/conf/routes). Preserve the configured topology; do not assume one endpoint handles both. |
| Completion UI polls processing status and then the image resource. It also supplies a missing description from the submitted filename and applies preset labels. | [upload-jobs.js](../../../kahuna/public/js/upload/jobs/upload-jobs.js#L41). A transferred file is not yet a complete editorial workflow. Automatic follow-up edits need independently reported outcomes. |
| Current job rows are ordered by submitted filename. | [upload-jobs.html](../../../kahuna/public/js/upload/jobs/upload-jobs.html#L6). Do not accidentally replace this with HTTP-completion order or upload time. |
| Upload editing includes rights, leases, templates, metadata, collections, labels, keywords, photoshoots and duplicate/deleted-image handling. | [image-editor.html](../../../kahuna/public/js/edits/image-editor.html), [image-editor.js](../../../kahuna/public/js/edits/image-editor.js), [required-metadata-editor.js](../../../kahuna/public/js/upload/jobs/required-metadata-editor.js#L25). Required capabilities must be accounted for separately, not hidden inside a layout task. |
| Ordinary metadata editing in Kupua is prepared but disconnected; only label commands are currently admitted. | [grid-commands.ts](../../src/lib/grid-commands.ts#L17), [MetadataTextEditor](../../src/components/MetadataTextEditor.tsx#L149), [editing UI decisions](gradually-growing-teeth.editing-ui-decisions.md). The new form cannot simply wrap these controls and claim parity. Recheck current completion before implementing each family. |
| The row layout API already has a variable-layout/window branch, but fixed-only call sites remain. | [scroll-geometry-ref.ts](../../src/lib/scroll-geometry-ref.ts#L44), [useScrollEffects](../../src/hooks/useScrollEffects.ts#L581). Forms need a real window geometry implementation, not a cast to fixed rows. |
| Justified reuses ImageGrid's lifecycle, but its geometry is derived from image dimensions. | [JustifiedGrid](../../src/components/JustifiedGrid.tsx), [ImageGrid](../../src/components/ImageGrid.tsx#L826). DOM-measured forms add a different height-change problem. Existing virtualizer adjustment is deliberately disabled for Justified. |
| Browsing consumers are coupled to `/search` and singleton state. | [search route](../../src/routes/search.tsx), [useScrollEffects](../../src/hooks/useScrollEffects.ts#L212), [ImageGrid](../../src/components/ImageGrid.tsx#L527), [ImageDetail](../../src/components/ImageDetail.tsx#L108), [URL sync](../../src/hooks/useUrlSearchSync.ts#L88). A separate route needs explicit admission/navigation adaptation, not two active engines sharing these globals. |
| Ordinary field drafts are component-local. | [MetadataTextEditor](../../src/components/MetadataTextEditor.tsx#L86). Unmounting an edited virtual row can lose work unless draft ownership changes. Labels already has a different operation owner. |
| Batch reads need no new server collection object. | [POST read builder](../../src/dal/grid-api-search-adapter.ts#L132), [mget client](../../src/dal/grid-api-search-adapter.ts#L192), [server body parser](../../../media-api/app/lib/elasticsearch/ElasticSearchModel.scala#L550). Sorted reads carry comma-separated IDs in JSON; mget takes an array. Both use existing image authorization. |
| mget and sorted pages return at most 200 images per request; a sorted scope may contain more IDs. | [server limits](../../../media-api/app/lib/elasticsearch/ElasticSearchModel.scala#L387), [page validation](../../../media-api/app/lib/elasticsearch/ElasticSearchModel.scala#L827), [client chunking](../../src/constants/tuning.ts#L320). Do not serialize hundreds of IDs into the browser URL. |
| The upload-status list is not historical image membership. | [status record](../../../image-loader/app/model/UploadStatus.scala#L5), [status store](../../../image-loader/app/lib/UploadStatusTable.scala#L48). Rows are image-keyed and expiring; user lookup scans the table. It has neither submission IDs nor durable batch boundaries. |
| Recent uploads currently searches by the authenticated user's identity; Kupua's session helper intentionally returns only permission flags. | [recent-uploads.js](../../../kahuna/public/js/upload/recent/recent-uploads.js#L22), [grid-api-instance.ts](../../src/lib/grid-api-instance.ts#L16). Provide a narrowly owned identity read for this query, without logging/persisting identity or conflating status history with recent library images. |
| Host configuration does not currently expose Upload's topology/size/template settings. | [KupuaPage.scala](../../../kahuna/app/lib/KupuaPage.scala#L7), [site-settings.ts](../../src/lib/site-settings.ts#L17), [hosted-config.ts](../../src/lib/hosted-config.ts). Small allowlisted plumbing is expected; raw configuration injection is not acceptable. Shared-host edits require separate permission. |

Unverified operation-specific details remain explicit work in the relevant unit:
rights/category side effects, template execution ordering, lease/collection
replacement semantics, retry eligibility, and actual target-environment CORS/CSP.
The roadmap's URL-import statement is not established by the inspected file/drop
path; U0 must locate a current user-facing workflow before calling it required
parity. Do not add a new importer merely because an older plan named one.

The new media-api endpoints are not yet merged. Their current wire formats are
evidence, not frozen requirements: correct a demonstrated contract gap at its
server owner while that change is still practical, rather than building lasting
client workarounds. This does not imply redesigning the existing backend.

## 3. Parity Checklist

U0 confirms this checklist against the current target configuration. For each row,
record the implementation owner and an existing or planned behavioural witness.
An unimplemented required row blocks final acceptance. If a feature is not
configured, document the configuration condition rather than claiming it passed.
Interface improvements may change presentation, not silently remove capability.

| ID | Existing capability to preserve | Acceptance witness |
| --- | --- | --- |
| P01 | Picker and file drop from search and Upload; permission-aware entry. Internal Grid image drags are not new uploads. | Enter from a deep filtered search, submit files, and reach the correct batch without retaining those filters. |
| P02 | Configured file-size/type rules and readable rejection. | Valid files proceed when another submitted file is rejected; no whole-batch disappearance or false success. |
| P03 | Configured service or signed-bucket pipeline, including hashing, preparation and queued/status handling. | An actual authorized upload reaches a canonical image in the selected topology; the alternate supported contract has isolated coverage. |
| P04 | Per-file progress, processing, failures, partial success and leaving-page protection. | Held/failed jobs remain identifiable across density/navigation changes; finishing one does not finish or discard another. |
| P05 | Current uploads, recent uploads and access to all the user's uploads. | Recent library images remain accessible after local batch history is gone; selection uses current identity and server authorization. |
| P06 | Submitted filename ordering, filename/type information, image preview and visible validity/cost/restrictions. | Deterministic ordering despite out-of-order completion; duplicate IDs and current filenames are not confused with different library images. |
| P07 | Missing-description filename fallback and preset labels. | Existing metadata is not overwritten; follow-up write failure is distinguished from successful ingestion. |
| P08 | Required metadata, configured domain fields, suggestions and single-image saving. | Type, leave/re-enter and change density without losing edits; the server value, failure or uncertain outcome is visible. |
| P09 | Per-field propagation to the current batch, including offscreen members. | Capture the intended IDs and value before dispatch; unrelated recent images and later submissions are not included. |
| P10 | Rights/restrictions and leases, including applicable batch operations. | A representative initially unusable image can be completed through the same permitted workflow as Kahuna. Partial multi-step completion is not reported as atomic success. |
| P11 | Metadata templates, preview/apply/cancel and their configured metadata/rights/collection/lease effects. | A configured template has the same intended effects; cancellation does not accidentally submit it. |
| P12 | Collections membership, labels, keywords and photoshoot operations exposed in Upload. | Individual and batch targets use the existing feature semantics. Collection tree redesign is not required. |
| P13 | Existing-image ownership warnings, soft-deleted duplicates, permitted undelete and deletion. | Re-uploading the same file does not grant new permissions, erase edits or silently claim a new image. |
| P14 | Library/archive, image detail and crop access exposed by the existing editor. | Existing eligibility/permissions remain authoritative; return leads to the originating batch and position. A disconnected crop save cannot count as full crop workflow parity. |
| P15 | Authentication expiry, refresh, history and recovery. | No automatic mutation replay after login/reload; local missing-batch URLs fail honestly; usable completed images remain discoverable. |

Parity does not require copying global Angular broadcasts, component-owned
polling, discarded error promises or misleading status labels. Likewise, it does
not authorize an unrelated ingestion rewrite. [GRID-018](bug-backlog.md#grid-018)
needs an explicit rollout/test disposition, not an invented client-side cure.

## 4. Implementation Contracts

### Upload Activity Is Not an Image Cache

Own jobs outside the virtualized view and outside a route component's lifetime.
Keep a submission ID, a distinct per-file/attempt identity, file information,
progress/outcome and the canonical image ID when known. Several attempts can
resolve to one content-hash image ID; retain their outcomes without performing
the same batch edit multiple times on that image.

Do not persist file bytes, object URLs, credentials, signed upload URLs or complete
image/enrichment bodies in batch descriptors. Known membership and lightweight
display/outcome facts may survive refresh. A lost transport becomes interrupted
or uncertain, not resumed or automatically resubmitted. Read-only status
reconciliation is different from replaying a mutation.

Capture preset labels and the submitted target set at their defined admission
point. Follow-up edits have separate outcomes from transfer/processing. Hashing
and preview memory need bounded client resource use; this is not a restriction
on how many files the user may submit. Reuse browser/proven hashing facilities;
new dependencies need operator approval, and no hand-written crypto is requested.

### Local Membership and Reads

The local batch resolver maps a short URL ID to membership; media-api receives
image IDs through the existing DAL, never the local ID. Membership does not equal
the current successful response: pending indexing, unreadable/unauthorized images,
deletions and failed requests must not silently rewrite the batch.

Use existing ordered reads for supported server sorting, and bounded mget for
identity hydration where appropriate. Preserve submitted filename order without
assuming concurrent mget responses arrive in order. A small batch may be fully
resident; that must not become a renderer requirement. Do not implement a second
permanent image cache or construct direct-ES fallback in API mode.

Scope identity must distinguish two batches and revisions as successful members
arrive. Integrate with existing request/generation ownership so stale search or
older-membership results cannot publish over the current batch. Never issue an
unscoped library search because a new/missing batch has no available IDs yet.

### One Active Browsing Engine

Preserve a departure snapshot and use existing history restoration on return.
Do not keep two competing browsing views mounted against singleton geometry,
selection and search stores. Upload jobs can continue independently of the active
view. Metadata suggestions/search links, Home, keyboard shortcuts, selection
panels and detail/crop navigation must use the admitted context, not hard-coded
`/search` assumptions or hidden search-bar effects.

Keep density independent of the URL. Resolve availability/defaults deliberately:
the Upload-only form density must not leave ordinary search with an unsupported
persisted density. Preserve user intent rather than forcing the form view again
after every arrival or rerender. Avoid a general workspace/store factory solely
to support these two contexts.

### Form Density and Drafts

Render a bounded visible window and overscan with TanStack Virtual and the shared
placement/navigation contracts. Geometry estimates and measured heights belong
to the active layout, not a catalogue-sized array. Cover resident, indexed and
seek-style windows through controlled fixtures; no live million-image campaign
is needed to establish the ownership contract.

Give size-change compensation one owner. Coordinate TanStack adjustment,
measurement, prepend/eviction and shared scroll effects to avoid double movement.
Do not disguise arbitrary form height as a constant grid row height or an image
aspect ratio. Active editing must not jump away when a suggestion, validation,
rights section or neighbouring image changes size.

Sparse image/field-bound drafts, pending saves and receipts outlive disposable
rows and density changes. Do not initialize a persistent editor for every result.
Use existing metadata controls, authority checks and publication/freshness owners;
extract only the genuinely shared presentation/intent logic needed by the new
consumer. Do not mount an entire independent singleton editor with network
subscriptions for every resident image.

## 5. Execution Units

Each unit is selected separately. Before code changes, inspect the named current
owners and neighbouring tests, identify old-behaviour assertions likely to change,
and state a local falsifiable expectation. Use the smallest discriminating check
after the first edit, then the required full gates. For a real bug, establish a
failing regression first; for a new feature, use a behaviour-scoped witness.

Every closeout states what is usable, what remains disconnected, tests run/not run,
and the next dependency. Do not mark a unit complete on screenshots alone or turn
this document into a running session diary. Working notes belong in the worklog;
implementation history belongs in the existing changelog.

### Unit Status

Update one line when a unit's state changes; this is not a session diary.

| Unit | State |
| --- | --- |
| UB8 | done locally 13 November; uncommitted pending operator review |
| U2-proto | approved prerequisite, not started |
| U0a, U0b, U1-U8 | not started |

**Early milestone:** U3 + U4 with editing through existing image detail gives
real uploads end to end before the form density exists. Say so in closeouts.
Most remaining effort sits in the editing roadmap steps U5-U7 depend on.

### UB8. Ordered-Read `ids` as a JSON Array (do first)

Operator-approved standalone unit; touches `media-api/` with that explicit scope.
Replace the POST ordered-read `ids` string with an optional array of nonempty
strings, matching mget. Absent = unrestricted; present empty or malformed = 422.
Client, server, Scala tests, recorded POST bodies and the label-editor fixture
change together; no CSV compatibility layer; legacy GET unchanged. Do not widen
to other optional fields (they share the `asOpt` fail-open shape deliberately
left alone). Details: [B8](#unmerged-endpoints-review-now).

### U2-proto. Variable-Height Density Prototype (prerequisite)

Independent of Upload. Build a stand-in density of variable-height cells (random
heights, a few text inputs) on the shared geometry contract and real searches in
all three tiers. Settle before U1/U2:

1. **Anchor:** the on-screen image keeps its pixel through density round trips,
   resize/panel, extend/evict, deep seek, field-set change and estimate-to-measured
   correction. Correction reuses the existing reflow/compensation owner (as
   Justified's identity-based compensation does); one owner, no second engine.
2. **Drafts:** typed input survives leaving/re-entering the window and density
   switches, owned outside row components.
3. **Estimates:** the cheapest unloaded-height estimate (from visible fields and
   image data) that keeps corrections invisible; measured heights retained only
   for the loaded window.
4. **Performance:** compare frame cost with Justified; operator runs perf suites.

Outcome is a decision record plus reusable layout code, or a named blocker.
Throwaway UI is acceptable; geometry/ownership code should be keepable.

### U0. Parity and Interaction Baseline

Run as two sessions: **U0a** parity checklist and transport/configuration
(research only); **U0b** interaction study with the operator.

**Goal:** make acceptance and the first engineering choices concrete before broad edits.

Confirm P01-P15 and the selected upload topology/configuration. Read the relevant
operation handlers before promising their semantics; do not audit unrelated Grid
features. Turn the unknowns in section 2 into named remaining checks or refuted
requirements. Confirm recent uploads and any claimed URL-import entry point.

**Pre-merge API checkpoint:** classify each concrete backend need by its owning
contract, not merely the file it lives in. B8 is settled (UB8). Review further
[unmerged-endpoint candidates](#unmerged-endpoints-review-now) before designing
client workarounds or merging those endpoints. Check any actual
batch scope, ordering, projection or pagination gap encountered by the selected
workflow; do not reopen a general API audit. Record a decision to amend, retain
with rationale, or investigate a named missing witness. A necessary new-endpoint
amendment can precede Upload completion; a legacy-service redesign normally cannot.

Prepare a small desktop/compact interaction study using existing fixtures and real
Kupua controls. Demonstrate a small mixed batch and delayed arrivals, not a static
perfect-success mock. Review these user-visible questions together:

- How pending/failed jobs remain visible while canonical images enter the density.
  Prefer separate job ownership and a compact activity area; inline pending slots
  require an explicit slot model, not fabricated `Image` records.
- How one image's editable form is focused, selected and opened without text-input
  clicks becoming navigation, and how the redundant Details panel is handled.
- How current batch, recent uploads and the batch selector are distinguished.
- Which save interactions retain Kahuna's efficient completion workflow. Existing
  autosave and explicit multi-step saves cannot be indiscriminately replaced by
  a click-heavy Save-per-field design merely to simplify implementation.

**Deliverable:** a completed parity checklist, one recommended layout/interaction
direction with bounded alternatives where necessary, and the confirmed transport
contract. Operator review is about concrete before/after workflows, not code terms.
No live file submission without explicit permission.

### U1. Route-Safe Browsing and Scope Admission

**Depends on:** U0's working-set contract. **Goal:** a new context can use existing
views/detail without leaking or inheriting the library search.

Start at [search.tsx](../../src/routes/search.tsx), [useUrlSearchSync](../../src/hooks/useUrlSearchSync.ts),
[useScrollEffects](../../src/hooks/useScrollEffects.ts), [ImageGrid](../../src/components/ImageGrid.tsx),
[ImageDetail](../../src/components/ImageDetail.tsx), [history snapshots](../../src/lib/history-snapshot.ts)
and [UI preferences](../../src/stores/ui-prefs-store.ts). Follow actual call sites
for Table, range selection, metadata search links and crop return.

Select the smallest explicit route/scope adapter. Keep one active data/window
owner and the current request-cancellation semantics. Admit resolved batch IDs
without writing them into the URL; qualify scope and growing membership properly.
Return-to-search capture must happen before the old route is disposed.

**Witnesses:** two different local IDs with the same sort do not share a result
context; empty/missing batch makes no library search; obsolete completion cannot
replace a batch; search -> temporary scoped view -> detail/crop -> search restores
the original represented position and does not corrupt density/selection intent.
Use supplied local fixture membership, not a live upload dependency.

**Stop:** if the proposed change requires cloning the search store, creating a
general workspace framework, or changing accepted global history semantics,
present the narrower alternatives before proceeding.

### U2. Variable-Height Density and Retained Editing State

**Depends on:** U0's form interaction. U1 can be developed independently until
route integration; do not overlap edits without explicit coordination.

Start at [LayoutGeometry](../../src/lib/scroll-geometry-ref.ts),
[useDataWindow](../../src/hooks/useDataWindow.ts), [useScrollEffects](../../src/hooks/useScrollEffects.ts),
[ImageGrid virtualizer](../../src/components/ImageGrid.tsx#L826),
[MetadataTextEditor](../../src/components/MetadataTextEditor.tsx),
[metadata primitives](../../src/components/metadata-primitives.tsx), and the
[windowed Justified guide](00%20Architecture%20and%20philosophy/component-detail.md#justified-density-componentsjustifiedgridtsx-libwindowed-justified-layoutts).

Build on U2-proto's decision record: natural heights, estimates for unloaded
forms, measured heights for the loaded window only, and corrections through the
existing anchor/compensation owner. Complete the density using the shared
infrastructure, including a one-column phone presentation; do not copy ImageGrid's lifecycle wholesale or turn its
`layoutFactory` switch into an unrelated form renderer by accident.

Retain drafts outside row components and separate canonical image state from
local intent. Text selection, IME, Tab traversal, validation and keyboard shortcuts
must remain normal editing interactions. Reuse the existing shell/input policy.

**Witnesses:** Grid/Table/Justified/form transitions retain the intended image;
an edited row can leave/re-enter the rendered window without losing its draft;
height changes above/within the viewport preserve a coherent visible anchor;
prepend/eviction and distant entry work with bounded records, DOM and geometry.
Exercise actual new form density in resident/indexed/seek fixtures, not just a
small-array mock. No full-library UI exposure or catalogue-sized measurement.

**Stop:** if the proof requires whole-result hydration, per-image singleton reads
for the entire buffer, fixed-height clipping of required fields, or a second scroll
engine. A failed proof calls for revising the local adapter, not abandoning the
genuine-density requirement without operator agreement.

### U3. Real Upload Transport and Route-Independent Jobs

**Depends on:** U0. **Goal:** reach a real canonical image early, without waiting for
all new form styling. Use existing detail/presentation where possible.

Start at Kahuna's [manager](../../../kahuna/public/js/upload/manager.js),
[loader client](../../../kahuna/public/js/services/api/loader.js),
[job lifecycle](../../../kahuna/public/js/upload/jobs/upload-jobs.js), loader
[controller](../../../image-loader/app/controllers/ImageLoaderController.scala),
[status controller](../../../image-loader/app/controllers/UploadStatusController.scala),
and Kupua's [service discovery](../../src/lib/grid-api-instance.ts),
[transport boundary](../../src/dal/grid-api/proxy-target.ts),
[site settings](../../src/lib/site-settings.ts) and [hosted config](../../src/lib/hosted-config.ts).

Add only the required loader/service configuration and validated transport paths.
Support the configured topology and isolated tests of both existing upload
contracts. Signed bucket PUTs are scoped capabilities: no session cookies sent to
the bucket, no signed URLs logged or persisted, and no arbitrary-origin write
proxy. Recheck actual CORS/CSP and redirect behaviour before live use.

Own jobs and status reconciliation independently of row/route mounting. Distinguish
preparation, transfer, accepted processing, search visibility, failure and uncertain
outcome. A progress indicator must not imply backend rollback after browser abort.
Retain partial outcomes and the ability to find completed images. Preserve leave/
reload protection without blocking ordinary safe navigation unnecessarily.

**Witnesses:** single success reaches the existing image display; a small mixed
submission retains successful and failed files; signed preparation/PUT/queued
failure cases are distinct; auth expiry dispatches no replay; a view unmount does
not stop owned status observation or forget the job. Clean up object URLs, workers,
listeners and settled request resources.

**Permissions:** changes to Kahuna host injection/CSP or any backend file require
explicit approval outside `kupua/`. Do not broaden permitted hosting stages or
weaken safeguards. A fixture pass is not live-topology approval.

### U4. Local Batches, Entry Points and Navigation

**Depends on:** U1 and U3; integrate U2 when available.

Implement the local descriptor/resolver and Upload entry points, picker/drop,
selector, recent-uploads destination and short URL contract. Keep the original
search return distinct from batch switching. A later drop starts another batch;
it never changes targets captured by an earlier operation.

Use a narrowly owned authenticated identity read for recent-library uploads;
the expiring status table is not a substitute. Follow current server permissions
after reauthentication. Local membership is not authority and contains no cached
grants. Keep normal browser Back/Forward, direct visits and reload meaningful in
both Vite and compiled hosted builds.

Preserve filename ordering and explicit activity counts. Resolve pending jobs to
canonical images without creating fake library data, sudden whole-page resets or
hidden successful uploads. Five visible recent choices must not silently evict
pending work or every older history target. Define/test storage failure and quota
handling; no new IndexedDB/cross-tab synchronization subsystem is required.

**Witnesses:** two successive drops remain distinct; older batch URL resolves while
retained; missing descriptor is unavailable; reload restores known members but
does not claim transfer resumption; old query/free filters never suppress a new
batch; internal Grid drags do not trigger ingestion; return from detail/crop keeps
batch identity; invalid/duplicate files retain understandable outcomes.

### U5. Required Metadata Saving and Batch Propagation

**Depends on:** U2 plus the existing command/publication foundation. Integrate U4
targets when available; use fixture identities until then.

Follow roadmap **Step 8**, Kahuna's [required metadata editor](../../../kahuna/public/js/upload/jobs/required-metadata-editor.js)
and [edits service](../../../kahuna/public/js/edits/service.js), and Kupua's
[command boundary](../../src/lib/grid-commands.ts),
[publication](../../src/lib/image-publication.ts),
[freshness](../../src/lib/image-read-freshness.ts) and existing field controls.

Connect real metadata commands, not a second Upload-only writer. Respect original
metadata versus overrides, clearing semantics, unrelated override fields and
configured domain fields. Obtain the authoritative resource/projection required
by each operation; lean list data is not automatically sufficient to construct a
whole-object replacement. Fresh reads mitigate but do not eliminate concurrent
editor races; do not promise server conflict prevention that does not exist.

Connect filename fallback and preset labels as owned follow-up operations with
their own results. Implement per-field propagation against captured canonical
targets, including offscreen members. Do not reproduce global UI broadcasts that
only reach mounted editors or other batches accidentally.

Review current prototype action and freshness capacities against ordinary batch
parity; the old 100-label limit is not an approved new Upload product limit.
Do not replace this review with an unbounded dispatch/retry system or a speculative
server-capacity campaign. Keep resource control, operation lifetime and user-facing
target limits distinct. A larger target set must fit the actual publication/
freshness ownership, not just a raised constant.

**Witnesses:** real single save and clear; preserved unrelated metadata; viewport
eviction/density switch during edit and save; delayed stale read cannot undo a
newer accepted value; apply-to-batch excludes a later submission and unrelated
selection; partial/unknown outcomes retain drafts/receipts without automatic replay.

### U6. Rights, Leases and Templates

These are separate sessions, not one giant patch. Follow roadmap **Steps 9-11** and
their current source pointers, reusing any operation family completed meanwhile.

- **U6a Rights:** category-specific fields, notices, single and current-batch
  application; preserve the existing associated metadata/lease effects without
  claiming transactional completion across services.
- **U6b Leases:** the lease controls required by the Upload editor, correct target
  and permission handling, and the existing validity/readback semantics.
- **U6c Templates:** configured template choices and preview/apply/cancel, composing
  the established metadata, rights, collection and lease operations. Do not create
  a second template engine or grant authority from template configuration.

**Depends on:** U0's configuration inventory and applicable shared commands;
templates wait for the operations they actually invoke. Each session names one
representative configured workflow and its meaningful failure path.

**Witness:** an initially unusable uploaded image can be completed and used through
the same permitted editorial path as in Kahuna. Every required sub-operation's
outcome is accounted for; a partially applied template is not labelled Saved.

### U7. Remaining Upload-Editor Capabilities

Select one missing family per session, using roadmap **Steps 7, 12, 13, 16 and 17**
as applicable. Reuse implemented work rather than porting it again.

- Collection membership add/remove and batch propagation, including the existing
  removal confirmation. Do not redesign/rename the collection tree for Upload.
- Keywords, labels and photoshoot editing exposed in the current Upload editor.
- Library/archive, soft delete and authorized undelete of an existing deleted
  image returned by a repeat upload. No new hard-delete flow.
- Existing detail/crop return and any still-disconnected crop operation required
  to complete the P14 workflow. This is a named dependency, not hidden Upload UI
  work; follow its already-owned crop implementation plan.

**Depends on:** the relevant shared command family and U4 target ownership.
**Witness:** corresponding P12-P14 rows pass through real connected operations in
the authorized test setup; duplicate ownership and denied targets remain visible.
Do not claim Upload complete while a required family is still only preparation UI.

### U8. Visual Review and Parity Acceptance

**Depends on:** required P01-P15 work, with U0's confirmed applicability.

Review desktop and compact workflows in the browser: progress/partial failures,
long metadata, keyboard/IME editing, suggestions, batch switching, density/detail/
crop return and the absence of redundant competing metadata panels. Reuse Kupua's
visual language and inline icons; no new icon/design system dependency.

Use mostly small representative batches, plus a deliberate upper-end case around
250-500 files/IDs to expose chunking, browser memory and offscreen propagation
problems. Larger accepted inputs must not be truncated because of the fixture size.
Distinguish an ID-read fixture from a real large-file ingestion trial; the latter
requires separately approved resources and mutation scope.

Complete the required regression gates, then an operator-authorized real upload
trial in the selected topology: ingest -> processing -> visible image -> required
editing -> usable result, including an existing duplicate and a recoverable failure
where safe. Use disposable approved files; record sanitized outcomes, never
credentials, signed URLs, personal metadata dumps or raw live responses.

Final acceptance lists every parity row as passed, blocked or configuration-inapplicable
with evidence. An inherited backend issue must have an explicit disposition; it
cannot be hidden by a success label or silently turned into a mandatory backend
rewrite. Keep any unverified deployment claim separate from fixture results.

## 6. Test and Execution Discipline

Use [the existing E2E guide](../../e2e/README.md) and standing directives. Run from
the repository root, foreground, with live output and preserved exit status:

```sh
set -o pipefail; npm --prefix kupua test 2>&1 | tee "$TMPDIR/kupua-test-output.txt"
```

Use the same pattern for the other required scripts. Full units follow any `src/`
change; component/hook/store/scroll changes also require full local E2E, including
applicable normal/forced-seek/Justified projects. Run `build`, `build:hosted` when
hosted/configuration is affected, and `typecheck:e2e` for changed browser fixtures.
Any authorized Scala change follows that service's test instructions; host-config
work includes the existing `test:hosted-config` script. No live mutation is implied
by permission to run isolated tests.

Coordinate ports 3000/3030/3040 and the user's running app before browser suites;
never stop their app/tunnel implicitly. Do not edit source during a run, hide live
output with tail/grep, rerun a still-running suite, weaken meaningful assertions
or add retries to conceal failures. Preserve unresolved traces before subsequent
runs clear test results. Perceived/jank performance campaigns remain operator-run;
suggest the relevant ones after render/scroll/data-window changes, using existing
evidence before proposing a new experiment.

Reuse the owning suites: [browse-density](../../e2e/local/browse-density.spec.ts),
[Justified windowing](../../e2e/local/justified-windowed.spec.ts),
[history](../../e2e/local/browser-history.spec.ts),
[mutations](../../e2e/local/grid-mutations.spec.ts),
[selection](../../e2e/local/selections.spec.ts), and
[scroll-effects units](../../src/hooks/useScrollEffects.test.ts).
Add an Upload-specific suite/fixture only where no existing owner fits; do not
create a parallel runner or one test file per requirement. Keep representative
behavioural witnesses, not a Cartesian product of every field, density and error.
Remove superseded duplicate scaffolding only when a retained test still proves
the behaviour. A failing existing assertion requires an explanation, not weakening.

## 7. Refactoring and Opportunity Policy

Recording opportunities is allowed; opportunistic scope expansion is not.

1. Make a local refactor in the selected unit only when it is necessary for correct
   ownership or removes meaningful duplication introduced/exercised by that unit.
   State the reason, preserve behaviour and include the focused regression check.
2. Unrelated cleanup, module reorganization and speculative generalization are
   deferred even when the file is already open. Do not turn a family of adjacent
   findings into a refactor batch disguised as a feature.
3. Record only concrete opportunities encountered while doing the assigned work:
   source reference, observed constraint, proposed benefit, cost/risk and when it
   would become worth doing. Separate verified facts from hypotheses. No general
   codebase audit, numeric finding quota or speculative performance claim.
4. Keep the register below short: prefer updating/merging an existing entry;
   retain at most eight backend and three refactoring entries. Additional findings
   belong in an existing owning issue only if genuinely distinct and worth review.
   Remove or correct refuted claims rather than leaving contradictory findings.
5. A security/data-loss blocker or an observed failure of the selected capability
   is not merely a deferred opportunity: stop and explain the concrete blocker.
  Distinguish existing-backend improvements from amendments adjacent to the new,
  unmerged media-api endpoints. The former are deferred by default; the latter
  should be reviewed and, when justified, corrected before merge rather than
  avoided through client complexity. Preserve legacy callers of any shared
  helper and update the new endpoint's callers, fixtures and documentation
  together. Do not add speculative compatibility layers for an unmerged contract.
  Small legacy fixes can still be proposed with a concrete benefit. All changes
  outside `kupua/` need explicit scope permission; recording or prioritizing an
  idea is never blanket implementation approval.

## 8. Backend Review and Deferred Opportunities

The two backend lanes have different timing. A justified amendment to a new,
unmerged endpoint belongs in pre-merge work; an existing service/data-model
improvement is normally deferred until Upload works. Neither lane authorizes an
unbounded audit or turns every observation into a prerequisite. Facts below are
source observations, not claims of measured production impact.

### Unmerged Endpoints: Review Now

| ID | Evidence and constraint | Pre-merge decision and checks |
| --- | --- | --- |
| B8 | [SearchParamsBody](../../../media-api/app/lib/elasticsearch/ElasticSearchModel.scala#L550) reads `ids` with `asOpt[String]`; an array or other wrong type becomes an absent ID constraint. mget intentionally uses an array, while the current ordered-read adapter correctly sends a string. | **Approved 13 November as UB8** for consistency with mget; not on Upload's critical path (filename order uses mget). Resolve the new POST contract before merge: distinguish omitted scope, explicitly empty membership and malformed input so an intended batch cannot silently become an unscoped read. Consider aligning JSON ID representation with mget now rather than preserving the current string shape by default. Use focused parser/controller/query witnesses and update affected POST callers/fixtures together; preserve legacy GET query-string behaviour and authorization. This is a targeted amendment candidate, not approval to change backend files in this planning task. |

Further entries belong here only when a concrete Upload need reaches the new
endpoint boundary. A change's proximity to that code does not make an unrelated
legacy redesign small or necessary.

**B8 provenance and recommended amendment (not implemented):** the
[original D3 workplan](zz%20Archive/media-api-work/phase-3-d3-searchafter-workplan.md#L204)
explicitly mirrored `SearchParams.apply(request)` parsing. The
[final D3 review](zz%20Archive/media-api-work/phase-3-d3-searchafter-code-review-final.md#L209)
verified that client and server both used comma-separated strings and correctly
called that consistency "not a bug." This explains the existing format; do not
describe B8 as an accidental client/server mismatch.

There is still a reasonable pre-merge improvement: the
[active build plan](03%20Ce%20n'est%20pas%20une%20pipe%20dream/api-build/api-build-00-plan.md#L8)
permits reshaping, the
[POST rationale](03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/media-api-90-conventions.md#L884)
favours native structured JSON, and the
[mget contract](03%20Ce%20n'est%20pas%20une%20pipe%20dream/api-build/api-build-00-plan.md#L717)
already uses an ID array. The operator confirms Kupua is the sole current caller
of these new endpoints. Recommend an optional array of nonempty strings for the
ordered-read POST `ids` field, changing client and server together without a CSV
compatibility layer. Legacy GET URLs and internal search parameters need not
change representation; convert at the POST transport boundary.

For a bounded amendment, recommend omission retaining its unrestricted-by-ID
meaning, and present empty arrays or malformed values receiving the ordered-read
boundary's 422 response. This follows mget's nonempty-input convention; it does
not change mget's existing validation/status codes or introduce a 200-ID scope
limit into ordered reads. Never silently omit a supplied empty constraint during
conversion. Known-empty client batches can remain empty without issuing a read.

The [parked empty-string finding](03%20Ce%20n'est%20pas%20une%20pipe%20dream/api-build/api-build-00-plan.md#L1488)
and [existing integration assertion](../../../media-api/test/lib/elasticsearch/ElasticSearchTest.scala#L2529)
record `ids: ""` failing closed in Elasticsearch, not widening. Replace that
failure expectation with intentional validation and retain a meaningful unscoped
control. Separately prove malformed types cannot erase the ID restriction.
Update actual mapper-recorded POST bodies and Scala replay, including the
[browser fixture parsing string IDs](../../e2e/shared/label-editor-plugin.ts#L32),
and preserve repaired known-empty AI membership handling. The
[D3 validation disposition](03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/d3-search-after-01-readiness-findings.md#L35)
cautions against broad hardening: do not expand this amendment to other optional
fields, authentication, sorting, PIT or legacy GET behaviour. These are planning
recommendations, not backend implementation approval.

### Existing Backend: Deferred by Default

| ID | Evidence and constraint | Possible improvement; trigger and limits |
| --- | --- | --- |
| B1 | [UploadStatusTable.queryByUser](../../../image-loader/app/lib/UploadStatusTable.scala#L48) scans all status rows and filters in application memory. | Consider an owner/time query index with pagination if this endpoint needs sustained use. Do not make it the new recent-library or batch-history source now; no performance measurement was made. |
| B2 | [Status records](../../../image-loader/app/model/UploadStatus.scala#L5) are keyed by image ID, and [prepare](../../../image-loader/app/controllers/ImageLoaderController.scala#L273) overwrites that record. Repeated/concurrent submissions of the same content have no separate server attempt identity. | An attempt/submission identity separate from the image hash would support unambiguous durable history. This is a backend design project, not required for local grouping; do not infer a demonstrated authorization exploit from the shape alone. |
| B3 | [prepare](../../../image-loader/app/controllers/ImageLoaderController.scala#L273) assigns a one-hour expiry; [updateStatus](../../../image-loader/app/lib/UploadStatusTable.scala#L27) changes status/error only. [Terminal update code](../../../image-loader/app/controllers/ImageLoaderController.scala#L485) already notes possible expired rows. | Review expiry extension/terminal retention if an actual processing/recovery case is harmed. Never treat status absence as proof of transfer failure or permission to replay. |
| B4 | [Status update error helpers](../../../image-loader/app/controllers/ImageLoaderController.scala#L461) construct failed futures in `Unit` helpers; the failure is not returned through the mapped result. | A small focused error-propagation repair may be worthwhile with an existing failure witness. It requires backend permission and is not a reason to redesign ingestion. |
| B5 | [Prepare request parsing](../../../image-loader/app/controllers/ImageLoaderController.scala#L277) uses `asJson.get.as[Map[String, String]]` and does not define a submission contract beyond that map. | Typed input validation and useful client errors may be a small follow-up. Any count/body limits need actual resource/compatibility justification, not the guessed 250-500 batch size. |
| B6 | [GRID-018](bug-backlog.md#grid-018) already records a dynamic metadata mapping conflict that can prevent search visibility after transfer. | Keep the finding in its owning backlog; agree containment/rollout evidence. A longer client spinner is not a fix, and no automatic migration/reindex project follows. |
| B7 | [Collections identity](../../../common-lib/src/main/scala/com/gu/mediaservice/model/Collection.scala#L11) is the path; [membership](../../../collections/app/store/ImageCollectionsStore.scala#L17) copies records per image. No private batch identity/ACL follows from a user-named path. | A future explicit set store could provide stable IDs, ownership and membership for Places/clipboard/sharing. Do not repurpose or repair Collections as an Upload prerequisite. |

### Refactoring

| ID | Evidence and opportunity | Boundary |
| --- | --- | --- |
| R1 | [ImageGrid](../../src/components/ImageGrid.tsx#L519), [ImageDetail](../../src/components/ImageDetail.tsx#L108) and [useScrollEffects](../../src/hooks/useScrollEffects.ts#L212) know `/search` directly. | U1 must remove the coupling needed for a second context. Any wider router/store architecture cleanup remains deferred; no universal workspace framework. |
| R2 | [MetadataTextEditor](../../src/components/MetadataTextEditor.tsx#L86) combines draft state, intent preparation and rendering; single/multi/form consumers need some common behaviour. | U2/U5 may extract the necessary controlled field/draft boundary. Do not rewrite all metadata presentation or unify unlike command families just for symmetry. |
| R3 | [Service discovery comments](../../src/dal/grid-api/service-discovery.ts) still describe old hybrid/proxy/graceful-absence assumptions, while the [current API contract](../../src/dal/grid-api/README.md) says otherwise. | Correct stale comments when touching that boundary; do not change working transport policy to match obsolete commentary or use this as a broad documentation-cleanup task. |

## 9. Completion Report

Close the feature with the parity checklist, selected deployment topology,
operator-reviewed UX, retained regression evidence, known limits and deferred
opportunities. Explicitly separate actual upload/edit evidence from mocks and
read-only browser exploration. Reset the session worklog before staging; do not
commit without permission. Update owning mechanics guides and the changelog for
implemented code, not with planning/session narratives.

The finished implementation should be recognizably one Kupua browsing/editor
experience with an Upload context, not two applications sharing a stylesheet.