# Upload: Reusable Density and Local Working Sets

**Research-backed workplan, 13 November 2026.** This document proposes separately
selectable implementation sessions. It does not authorize implementation, new
dependencies, changes outside `kupua/`, live mutations, commits or deployment.
The operator selects a unit and supplies any additional permissions it requires.
There is no calendar deadline in this plan.

**Data-path boundary (operator, 14 November 2026): Upload is media-api-only.**
Leave direct-to-ES alone: do not add or mirror Upload browsing, transport, editing,
configuration or feature-parity work in that legacy path. Preserve its existing
ordinary search behavior and safeguards until its separately selected retirement
under [Simplification 1](simplification-01-api-only.md). This Upload plan does not
authorize that wider retirement. Direct-ES visits to Upload show unavailable;
they never browse a batch through ES, widen to the library or switch modes.
Upload witnesses must exercise the real API client through existing isolated
fixtures, not make direct ES a new acceptance dependency.

**U0b reviewed, 13 November 2026:** the operator selected familiar parity first
and closure on reviewed workflows, without a new interactive prototype or browser
demonstration. The [interaction decision record](#u0b-interaction-decision-record)
resolves C5-C7, distinguishes first-version requirements from later opportunities,
and leaves runtime witnesses planned. It does not certify a working Upload.

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

**U0a applicability decisions (operator, 13 November 2026):** TEST is the
prototype target; PROD is eventual, not an approved rollout. File picker/drop,
frequent current-batch arrows and preset labels are required. URL import is not
current Kahuna parity. Metadata templates are configured in TEST but not used by
this editorial workflow and reportedly off in PROD: defer their implementation,
retaining the shared-command extension path. BBC domain editors are explicitly
out of scope even though TEST has a schema. These qualify P08/P11 and U6c, not
unfinished acceptance gates. Essential editorial fields and their validation
guidance must be preserved even when not all of them determine server validity.

The image-and-fields presentation is a real density, not a standalone upload
list to be rewritten later. Its renderer consumes a bounded browsing window and
must remain usable in principle over ordinary large search results. Initial
product exposure is within Upload; globally exposing the density is not required.

### Selected Direction

- Upload is a distinct working context with density controls, sorting, editing,
  detail and crop navigation. **U0b:** omit Upload selection UI and its metadata
  panel initially; batch arrows provide the required multi-image application.
  Preserve reuse of selection/panel capabilities later without building them now.
  Initially there is no general CQL search bar or Filters facets.
  Facets-as-selection is a later interaction, not part of this build.
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

### First-Version Defaults and Planned Witnesses

U0b selects the following bounded direction. Its browser witnesses remain planned;
the completed geometry proof is not Upload interaction acceptance.

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
  density preservation within the active batch or draft retention. Leaving Upload
  for search and returning must restore the active batch and its position, as
  well as restoring the departing library search in the other direction.
- Arrows in current or retained batches capture known canonical image targets
  and show their count, including offscreen members. Processing files without
  canonical images are explicitly excluded in the first version; no instruction
  is silently queued for their later arrival. Recent uploads are not a batch.
  No arrow targets all uploads or all search results; viewport residency never
  defines membership. See the U0b record for exclusions and feedback.

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
| Batch reads need no new server collection object. | [POST read builder](../../src/dal/grid-api-search-adapter.ts#L132), [mget client](../../src/dal/grid-api-search-adapter.ts#L192), [server body parser](../../../media-api/app/lib/elasticsearch/ElasticSearchModel.scala#L550). Ordered reads and mget carry ID arrays in JSON. The existing URL-level search parameter remains comma-separated and is converted at the POST boundary. Both use existing image authorization. |
| mget and sorted pages return at most 200 images per request; a sorted scope may contain more IDs. | [server limits](../../../media-api/app/lib/elasticsearch/ElasticSearchModel.scala#L387), [page validation](../../../media-api/app/lib/elasticsearch/ElasticSearchModel.scala#L827), [client chunking](../../src/constants/tuning.ts#L320). Do not serialize hundreds of IDs into the browser URL. |
| The upload-status list is not historical image membership. | [status record](../../../image-loader/app/model/UploadStatus.scala#L5), [status store](../../../image-loader/app/lib/UploadStatusTable.scala#L48). Rows are image-keyed and expiring; user lookup scans the table. It has neither submission IDs nor durable batch boundaries. |
| Recent uploads currently searches by the authenticated user's identity; Kupua's session helper intentionally returns only permission flags. | [recent-uploads.js](../../../kahuna/public/js/upload/recent/recent-uploads.js#L22), [grid-api-instance.ts](../../src/lib/grid-api-instance.ts#L16). Provide a narrowly owned identity read for this query, without logging/persisting identity or conflating status history with recent library images. |
| Host configuration does not currently expose Upload's topology/size/template settings. | [KupuaPage.scala](../../../kahuna/app/lib/KupuaPage.scala#L7), [site-settings.ts](../../src/lib/site-settings.ts#L17), [hosted-config.ts](../../src/lib/hosted-config.ts). Small allowlisted plumbing is expected; raw configuration injection is not acceptable. Shared-host edits require separate permission. |

U0a's handler traces below establish rights/category side effects, template
execution ordering and lease/collection semantics from current source, not live
mutation evidence. Actual deployment CORS/CSP, ingestion/edit outcomes and recovery
remain unverified. URL import is excluded: the [file-only drop handler](../../../kahuna/public/js/upload/dnd-uploader.js#L84),
[existing specification](../../../e2e-tests/features/upload.feature#L140) and
operator all say dropped URLs are not uploads; no current paste-URL UI was found.
Backend derivative/replica/import support does not establish a UI requirement.

The new media-api endpoints are not yet merged. Their current wire formats are
evidence, not frozen requirements: correct a demonstrated contract gap at its
server owner while that change is still practical, rather than building lasting
client workarounds. This does not imply redesigning the existing backend.

### U0a Evidence Baseline (13 November 2026)

**Source baseline:** HEAD `00bbf9cca6` (U2-proto), after UB8 `9f1a0f86e` /
`7ecb32f36c` and B9/B10 `32b9519be1` / `2363227126`. Current handlers were
inspected, not only controls. No tests, uploads, edits, performance workloads,
AWS/infrastructure reads or server/tunnel changes were made. U2-proto's canonical
evidence above was retained without repeating campaigns. The [editing reference,
section 8](gradually-growing-teeth.kahuna-editing-ui-reference.md#8-coverage-limits-and-use-for-kupua)
already records Upload source coverage without claiming ingestion/duplicate/bucket
runtime evidence; its local metadata/collection trials do not certify Upload.

Evidence labels: **source** = current connected implementation; **observed config**
= bounded read of the operator-shared, already-loaded TEST Kahuna page;
**operator** = supplied workflow/deployment fact, not independently verified;
**planned** = future behavioural witness, not tested/passed. The [existing Upload
feature specification](../../../e2e-tests/features/upload.feature) is a reference,
not evidence of a passing Kupua implementation or a test run in this session.

**Operator workflow:** drop tens of files on search or Upload, less often pick
files. Description (filename fallback when absent) and Credit are essential for
usability, then Byline/Creator, labels/collections, rights; some users set
Photoshoot, leases are rarer. Batch arrows are used very often. Current Kahuna
arrows apply only to the current upload batch, not recent uploads. Applying them
to a retained local batch is an explicitly discussed Kupua extension, not current
Kahuna or durable server history. Preset labels at the top are required and are
distinct from deferred metadata templates.

**Essential versus invalid:** operator says red-marked fields are essential even
where editorial requirements exceed validity checks. A bounded read of control
labels/validation/styles (no values) found red Credit inputs with
`ng-invalid-required`; Description was required but populated/non-red. The
[form](../../../kahuna/public/js/upload/jobs/required-metadata-editor.html#L34)
marks Description and Credit required. Do not equate current red appearance with
the complete essential-field set, or add new validity/permission rules from
styling. [Server validation](../../../media-api/app/lib/ImageExtras.scala#L45)
checks missing Credit/Description alongside rights, cost, leases and quota; the
metadata checks are not the download validation contract. Server validity/cost/
capabilities remain authoritative; U0b preserves
essential-field guidance alongside fast completion of the whole editorial form.

### Transport and Configuration Contract

| Boundary | Evidence and consequence |
| --- | --- |
| Authority | Search [entry](../../../kahuna/public/js/search/view.html#L19) and Upload [view](../../../kahuna/public/js/upload/view.html#L11) gate picker/drop on `canUpload`; [caller](../../../kahuna/public/js/services/api/media-api.js#L123) checks root `loader`, permission-gated by [MediaApi](../../../media-api/app/controllers/MediaApi.scala#L128). [Loader](../../../image-loader/app/controllers/ImageLoaderController.scala#L65) independently enforces upload permission. Root availability, user flags, per-image capabilities and startup editing preference are distinct; repeat upload cannot grant edit authority. |
| Selected topology | [KahunaConfig](../../../kahuna/app/lib/KahunaConfig.scala#L99) selects signed upload when an ingest bucket is configured. **Observed config:** TEST page reports signed upload enabled, limit **666,000,000 bytes**, three templates, four editorial image types, one domain schema with two fields. Only switch/limit/counts were returned, never raw config, identities, bucket names or signed URLs. This proves page selection, not matching loader settings or functioning transport. **Operator:** TEST first, eventual PROD; templates off in PROD. No PROD inspection. |
| Signed transport | [Manager](../../../kahuna/public/js/upload/manager.js#L40): SHA-1 -> ID/filename prepare map -> signed file PUT with `x-amz-meta-media-id` -> POST QUEUED -> status. [Prepare](../../../image-loader/app/controllers/ImageLoaderController.scala#L273) uses authenticated identity and one-hour signature/status expiry; [presigner](../../../image-loader/app/lib/ImageLoaderStore.scala#L47) binds identity/filename destination and ID metadata. Browser PUT sends no Grid cookies. Kahuna [swallows queued-update failure](../../../kahuna/public/js/upload/manager.js#L121); [status store](../../../image-loader/app/lib/UploadStatusTable.scala#L27) only permits PREPARED -> QUEUED, which can race processing. Kupua must distinguish PUT acknowledgement, queued update and processing, without fallback/replay. |
| Service transport | [Loader client](../../../kahuna/public/js/services/api/loader.js#L27) posts raw `application/octet-stream` bytes to discovered `load`, with filename query parameter, not multipart or a URL import. [Handler](../../../image-loader/app/controllers/ImageLoaderController.scala#L308) authenticates before consuming the digested body, stores/quarantines and returns an accepted status resource. [Routes](../../../image-loader/conf/routes#L1) / [root links](../../../image-loader/app/controllers/ImageLoaderController.scala#L150) own paths. Retain isolated coverage of this alternate configured contract; it is not fallback after failed signed upload. |
| Size and content rules | [Manager](../../../kahuna/public/js/upload/manager.js#L27) skips only files strictly above a nonzero limit; other files proceed. [Picker](../../../kahuna/public/js/upload/file-uploader.html#L4) is multiple, with no MIME accept filter. [CommonConfig](../../../common-lib/src/main/scala/com/gu/mediaservice/lib/config/CommonConfig.scala#L79) converts `upload.limit.mb` to decimal bytes; [ingest consumer](../../../image-loader/app/controllers/ImageLoaderController.scala#L197) checks its own setting. [Uploader](../../../image-loader/app/model/Uploader.scala#L406) detects content, not filename/browser MIME; [MimeType](../../../common-lib/src/main/scala/com/gu/mediaservice/model/MimeType.scala#L22) recognises JPEG/PNG/TIFF. [Loader config](../../../image-loader/app/lib/ImageLoaderConfig.scala#L31) describes JPEG/PNG plus configured transcodes in errors. Deployed loader/transcode settings remain unchecked. Editorial `imageTypes` are not file types; invent neither a restrictive client MIME list nor a batch cap. |
| Completion | [Jobs](../../../kahuna/public/js/upload/jobs/upload-jobs.js#L49) poll status to COMPLETED/FAILED, then GET its canonical image URI until readable. [Status controller](../../../image-loader/app/controllers/UploadStatusController.scala#L22) supplies that URI. Labels uploading/queued/indexing/uploaded/error are lifecycle progress, not byte percentages; [upload transport](../../../kahuna/public/js/upload/manager.js#L102) has no connected byte-progress listener. Required metadata and follow-up writes remain separate from ingestion. [Status table](../../../image-loader/app/lib/UploadStatusTable.scala#L48) is expiring image-keyed activity, not batch membership/recent-library history. |
| Missing Kupua plumbing | [KupuaPage](../../../kahuna/app/lib/KupuaPage.scala#L7), [site settings](../../src/lib/site-settings.ts#L17), [hosted config](../../src/lib/hosted-config.ts#L7) omit topology/limit/templates/domain schema; image types already pass through. [Discovery](../../src/lib/grid-api-instance.ts#L53) locates relations, but [target routing](../../src/dal/grid-api/proxy-target.ts#L1) / [mutation policy](../../src/lib/grid-mutation-policy.ts#L28) have no loader writes. U3 needs allowlisted topology/limit and exact loader prepare/load/status admission in laptop/hosted modes. Signed capabilities require separate validated handling, no credentials/persistence/logging or arbitrary-origin write proxy. Shared host/backend files need separate permission. [Hosting](../../../kahuna/app/lib/KupuaPage.scala#L45) remains DEV/TEST-only; eventual PROD is not permission to widen it. |
| Browser policy | [KahunaConfig](../../../kahuna/app/lib/KahunaConfig.scala#L56) includes configured UI bucket in connect sources; [CSP builder](../../../kahuna/app/KahunaComponents.scala#L53) and [Kupua policy](../../../kahuna/app/lib/KupuaPage.scala#L57) preserve that framework. [GridComponents](../../../rest-lib/src/main/scala/com/gu/mediaservice/lib/play/GridComponents.scala#L32) retains CORS/CSRF filters and configured service origins. Source/development policy is not deployed bucket CORS, preflight, redirects or cookie evidence. Those require separately authorized pre-live checks, not a new experiment now. |

### Recent Uploads and Local Membership

[RecentUploadsCtrl](../../../kahuna/public/js/upload/recent/recent-uploads.js#L22)
uses `session.user.email`, then `search('', {uploadedBy})`; [caller defaults](../../../kahuna/public/js/services/api/media-api.js#L41)
are length 50 and `-uploadTime`, without free/valid/date filters for this call.
[All uploads](../../../kahuna/public/js/upload/view.html#L22) links to search with
uploader identity and `nonFree=true`. [Recent editors](../../../kahuna/public/js/upload/recent/recent-uploads.html#L10)
have no `withBatch`; [current-job editors](../../../kahuna/public/js/upload/jobs/upload-jobs.html#L45)
do when the jobs array has more than one item. Arrow absence on past uploads is
intentional, not evidence the current-batch operation is missing in Kahuna.

[Human auth session](../../../auth/app/auth/AuthController.scala#L54) already
supplies email (machine sessions have a different shape). [Kupua's schema](../../src/lib/grid-api-instance.ts#L10)
retains permissions only: U4 needs a narrow in-memory human identity read sharing
the existing invalidation/reload boundary. No persisted/logged identity, guessed
uploader, machine-name substitute or new backend endpoint. Identity failure must
show unavailable, never query all users. [Client builder](../../src/dal/grid-api-search-adapter.ts#L144),
[POST parser](../../../media-api/app/lib/elasticsearch/ElasticSearchModel.scala#L620)
and [query filter](../../../media-api/app/lib/elasticsearch/QueryBuilder.scala#L217)
already support `uploadedBy`. Explicitly set `nonFree=true` and clear unrelated
filters: the builder otherwise adds `free=true`. Query identity is not authority.

[ID hydration](../../src/dal/grid-api-search-adapter.ts#L192) chunks mget and
accumulates concurrent responses; callers must restore submission order and keep
missing members distinct from failed reads. [200-ID mget limit](../../../media-api/app/lib/elasticsearch/ElasticSearchModel.scala#L387)
is per request, not a batch cap. UB8 does not fix the client's truthiness-based
absent/empty ID collapse in [buildReadBody](../../src/dal/grid-api-search-adapter.ts#L146).
U1 must handle known-empty batches without any unrestricted query. No permanent
server batch, status scan or long browser ID-list URL is required.

### Remaining Checks and U0b Decisions

These bounded checks do not require another broad audit. No further live access
is implied by the shared page. C5-C7 are resolved as operator-reviewed interaction
decisions below; no new browser witness has run. C1-C4 remain separately owned.

| ID | Missing fact / decision | Owner and user-observable consequence |
| --- | --- | --- |
| C1 | TEST loader size/transcode settings; bucket CORS for permitted page origin, PUT and metadata header; credentialed loader preflight/auth redirects; effective hosted CSP. Page-selected transport/limit alone cannot prove these. | U3 pre-live, separately authorized. Ask operator/maintainer for sanitized policy facts, not secrets or bucket contents. Selected files must not stall because the page offers transport the browser cannot use. Not a U0b blocker. |
| C2 | PROD topology/limit/types and hosting/rollout permission. Only template-off operator report exists. | Before PROD work, not a TEST prototype gate. Do not infer PROD from TEST or widen stage admission. |
| C3 | One representative TEST rights category and its expected metadata/category-lease effects; writable catalogue and saves not exercised. | Select for U6a: after choosing rights, which credit/instructions/leases change and how does partial completion look? Priority is known; exact configured example remains to select using the existing handlers below. |
| C4 | GRID-018 rollout containment and owning roadmap delete/restore lifecycle disposition. | Before broad upload/destructive activation: approve bounded disposable-file trials versus backend repair. Missing search visibility must remain recognizable, not success-by-timeout or automatic re-upload. Existing [GRID-018](bug-backlog.md#grid-018) runtime evidence and [Step 17](gradually-growing-teeth.kupua-edits-steps.md#step-17-soft-delete-and-restore) own these, not a new migration/campaign prerequisite. |
| C5 | **Resolved by U0b:** mixed activity, editing and navigation. | Compact persistent batch summary with expandable file outcomes; real images alone enter the density. Input interaction edits without opening detail. Omit Upload selection UI and its redundant metadata panel initially; retain explicit image/detail/crop entry and a one-column phone form. Mixed/delayed desktop/compact witnesses are **planned**, not performed. See [U0b workflows](#u0b-interaction-decision-record). |
| C6 | **Resolved by U0b:** efficient saves, guidance and arrow scope. | Ordinary fields save after a short pause/on leaving the field; rights/leases keep explicit saves and separate substep outcomes. Preserve essential guidance beyond server validity. Arrows capture the batch, field value and known canonical targets, including offscreen images, with explicit pending/unavailable/denied exclusions. No pending-arrival intent in the first version; later drops/recent uploads never join. Retain drafts/receipts and acknowledge uncertainty, not automatic replay. Browser/command witnesses remain **planned**. |
| C7 | **Resolved by U0b:** current/recent/retained contexts and return. | Current and retained batches have explicit membership and arrows; recent uploads remain an identity-scoped query without batch arrows. Leaving for search and returning retains the active batch, jobs, outcomes, drafts and position. Switching to another batch may initially reset its view, not its work. Missing links show unavailable plus explicit alternatives. Durable batches/navigation panel are later opportunities, not current architecture or acceptance gates. Browser witnesses remain **planned**. |

**Settled:** picker/drop, no URL importer; TEST first/PROD later; preset labels
required; domain editors excluded; metadata templates deferred, not removed from
the future command-composition path. U2-proto stays complete. U0b settled C5-C7
through operator-reviewed workflows, not a repeat audit or campaign. No
interaction demonstration is implied by that decision closure.

## 3. Parity Checklist

U0a confirms applicability and source connections; U0b settles the named interaction
choices. Each row records owners and an existing or planned behavioural witness.
An unimplemented required row blocks final acceptance. If a feature is not
configured, document the configuration condition rather than claiming it passed.
Interface improvements may change presentation, not silently remove capability.

**Assessment, not acceptance passes:** all Kupua Upload witnesses are planned.
Existing specifications/tests below are reusable references/owners, not claimed
executed in U0a. Configured-but-deferred is not passed. Handler details following
the table qualify shorthand such as Save, apply and replace.

| ID | Applicability; current Kahuna owner | Kupua owner; connected / missing | Behavioural witness |
| --- | --- | --- | --- |
| P01 | **Required.** [Search entry](../../../kahuna/public/js/search/view.html#L19), [Upload entry](../../../kahuna/public/js/upload/view.html#L11), [picker](../../../kahuna/public/js/upload/file-uploader.js#L20), [drop](../../../kahuna/public/js/upload/dnd-uploader.js#L84): permission-aware file submission; Grid image drags excluded. URL import excluded. | U1/U4: [search route](../../src/routes/search.tsx), [URL sync](../../src/hooks/useUrlSearchSync.ts), future Upload admission. No connected Upload route/picker/drop. Existing filters/selection must not define batch mutation scope. | Existing [entry specification](../../../e2e-tests/features/upload.feature#L14); **planned:** deep filtered search -> picker/drop -> independent batch -> restore search place. Internal drag makes no upload. |
| P02 | **Required.** [Manager](../../../kahuna/public/js/upload/manager.js#L27) skips above-limit files; [content detection](../../../image-loader/app/model/Uploader.scala#L406) / [error UI](../../../kahuna/public/js/upload/jobs/upload-jobs.js#L153) reject unsupported content. TEST page limit known, loader settings unchecked. | U3/U4: [site settings](../../src/lib/site-settings.ts#L17), [hosted config](../../src/lib/hosted-config.ts#L7), future admission. No size/type/rejection path. | Existing [size-limit specification](../../../e2e-tests/features/upload.feature#L109); **planned:** mixed valid/oversized/unsupported files retain distinct outcomes; valid files proceed, no whole-batch disappearance or invented cap. |
| P03 | **Required.** TEST selects signed transport. [Manager](../../../kahuna/public/js/upload/manager.js#L40), [loader client](../../../kahuna/public/js/services/api/loader.js#L18), [prepare](../../../image-loader/app/controllers/ImageLoaderController.scala#L273), [status](../../../image-loader/app/controllers/UploadStatusController.scala#L22) connect both source contracts. | U3: [discovery](../../src/lib/grid-api-instance.ts#L53), [targets](../../src/dal/grid-api/proxy-target.ts#L1), [guards](../../src/lib/grid-mutation-policy.ts#L28) need loader admission; no ingestion command. | **Planned:** isolated signed prepare/PUT/queued/status success and failures plus alternate service contract; separately authorized real TEST ingest -> canonical image. Loaded config is not a transport pass. |
| P04 | **Required lifecycle progress**, not byte percentages. [Jobs](../../../kahuna/public/js/upload/jobs/upload-jobs.js#L46) own stages/failures; [controller](../../../kahuna/public/js/upload/controller.js#L19) guards navigation/unload. | U3 independent jobs + U4 activity display. Existing [batch execution](../../src/lib/batch-execution.ts) schedules labels, not upload jobs. No route-independent upload observation/recovery owner. | Existing [leave warning](../../../e2e-tests/features/upload.feature#L53) / [failure specification](../../../e2e-tests/features/upload.feature#L171); **planned:** held/failed/successful jobs survive density/route changes; one finishing does not discard siblings. |
| P05 | **Required.** [Current jobs](../../../kahuna/public/js/upload/jobs/upload-jobs.html#L1), [recent query](../../../kahuna/public/js/upload/recent/recent-uploads.js#L22), [all uploads link](../../../kahuna/public/js/upload/view.html#L22). Recent = newest 50 current-human-uploader images, not status rows/batch. | U4: [session schema](../../src/lib/grid-api-instance.ts#L10) drops email; [read builder](../../src/dal/grid-api-search-adapter.ts#L144) already supports uploader. Missing narrow identity read, unfiltered query admission, selector/recent destination; no backend endpoint needed. | Existing [all uploads specification](../../../e2e-tests/features/upload.feature#L48); **planned:** recent/all work after local history loss, unavailable identity never widens query, reauthentication cannot reuse old identity/authority. |
| P06 | **Required.** [Job list](../../../kahuna/public/js/upload/jobs/upload-jobs.html#L7) sorts submitted names; [editor status](../../../kahuna/public/js/edits/image-editor.html#L55) / [file information](../../../kahuna/public/js/edits/image-editor.html#L328) show server validity/cost/restrictions and file facts. Signed path collapses duplicate hashes. | U4/U2: [mget](../../src/dal/grid-api-search-adapter.ts#L192), [ImageGrid](../../src/components/ImageGrid.tsx), [enriched image](../../src/lib/derive-enriched-image.ts) provide reads/display, not per-file identity/order. Canonical IDs must be unique write targets. | **Planned:** out-of-order completion remains name-ordered; same bytes/different submitted names retain attempt outcomes without duplicate canonical edits. Submitted name and existing image's stored filename remain distinct. |
| P07 | **Required.** [Jobs](../../../kahuna/public/js/upload/jobs/upload-jobs.js#L101) fill missing description from basename before last dot with underscores changed to spaces; [preset service](../../../kahuna/public/js/services/preset-label.js#L8) stores label set locally. Sampled on job-controller initialization, not a metadata template. | U5/U4: [label operation](../../src/lib/label-operation.ts#L76) / [commands](../../src/lib/grid-commands.ts#L1) connect label writes under authority/editing gates. Metadata fallback command and preset control/per-submission capture missing; label executor alone is not follow-up wiring. | Existing [preset specification](../../../e2e-tests/features/upload.feature#L79) / [fallback](../../../e2e-tests/features/upload.feature#L192); **planned:** don't overwrite existing description; capture presets per submission; failed/unknown follow-up visible separately from ingestion success. |
| P08 | **Ordinary metadata/suggestions required. Domain editors excluded by operator.** [Controller](../../../kahuna/public/js/upload/jobs/required-metadata-editor.js#L25) / [form](../../../kahuna/public/js/upload/jobs/required-metadata-editor.html#L1): Description/Credit required; Byline, initially present Copyright, Special instructions, configured Image type; domain data carried but no inputs here. Preserve essential-field guidance, not just validity minimum. | U5: [MetadataTextEditor](../../src/components/MetadataTextEditor.tsx#L86) has local drafts and Not sent preparation; [command schema](../../src/lib/grid-commands.ts#L17) only permits labels. [Step 8](gradually-growing-teeth.kupua-edits-steps.md#step-8-editable-metadata-including-configured-domain-fields) owns fresh originals/overrides merge. Saving/retained form drafts missing; no domain editor implementation under this scope. | Existing [autosave specification](../../../e2e-tests/features/upload.feature#L235); **planned:** save/clear preserves unrelated/domain overrides, credit suggestions, eviction/density changes retain drafts/receipts; rejection/unknown never Saved. Reuse metadata-control/mutation suites. |
| P09 | **Required, central workflow.** [Metadata arrows](../../../kahuna/public/js/upload/jobs/required-metadata-editor.js#L106), [withBatch admission](../../../kahuna/public/js/upload/jobs/upload-jobs.html#L45), [list arrows](../../../kahuna/public/js/edits/list-editor.js#L125). Recent editors omit batch flag; broadcasts only reach instantiated recipients. | U4/U5-U7 captured batch IDs/value, independent of selection/viewport. [Label admission](../../src/lib/label-operation.ts#L28) / [batch policy](../../src/lib/batch-execution.ts#L1) exist; other propagation missing. Existing 100-label ceiling is not an approved Upload limit. | Existing [metadata arrows](../../../e2e-tests/features/upload.feature#L300) / [other field arrows](../../../e2e-tests/features/upload.feature#L318); **planned:** offscreen targets receive captured value; exclude later drops/recent uploads; C6 explicitly handles pending IDs; partial/unknown outcomes retain targets. |
| P10 | **Required; rare leases not excluded.** [Rights Save](../../../kahuna/public/js/usage-rights/usage-rights-editor.js#L229), [batch rights](../../../kahuna/public/js/edits/image-editor.js#L278), [lease form](../../../kahuna/public/js/leases/leases.js#L54) / [service](../../../kahuna/public/js/services/api/leases.js#L39) are connected but not identical/atomic paths. | U6a/U6b: [catalogue](../../src/lib/usage-rights-catalogue.ts#L11) is display/search, no writable properties/filtered list. Rights/lease facts exist, commands do not. Reuse authority/publication; don't infer usability from chosen category. | **Planned:** C3 representative category -> expected metadata/lease effects; batch rights and lease replace/clear, middle-step failure visibly partial, server validity/cost/capability readback. Existing [lease comparison tests](../../../kahuna/public/js/services/api/leases-helper.spec.js) are reference, not run here. |
| P11 | **Deferred, not a current acceptance gate.** TEST observed three templates; operator says not used, PROD off. [Controller](../../../kahuna/public/js/metadata-templates/metadata-templates.js#L130) / [preview callbacks](../../../kahuna/public/js/edits/image-editor.js#L212) connect preview/apply/cancel. | Later U6c / [Step 11](gradually-growing-teeth.kupua-edits-steps.md#step-11-metadata-templates-without-pretend-atomicity): allowlisted config + shared command composition, no second engine. No Kupua template controls/config/commands. Keep extension path without implementing now. | Existing [config tests](../../../kahuna/test/lib/MetadataTemplateConfigTest.scala) / [preview specification](../../../e2e-tests/features/upload.feature#L337); **planned only if selected later:** cancel sends nothing; composite reports every intended effect and partial failure. |
| P12 | **Required.** [Editor handlers](../../../kahuna/public/js/edits/image-editor.js#L95), [collections](../../../kahuna/public/js/services/api/collections-api.js#L90), [labels](../../../kahuna/public/js/services/label.js#L46), [list arrows](../../../kahuna/public/js/edits/list-editor.js#L125), [photoshoot](../../../kahuna/public/js/components/gr-photoshoot/gr-photoshoot.js#L64) connect individual/batch operations with different semantics below. | U7: [LabelEditor](../../src/components/LabelEditor.tsx) connects add/remove; [MetadataPillEditor](../../src/components/MetadataPillEditor.tsx), [MetadataTextEditor](../../src/components/MetadataTextEditor.tsx#L147), [CollectionTree](../../src/components/CollectionTree.tsx) prepare/show other families. Membership/keywords/photoshoot commands and Upload targeting missing; no collection tree redesign prerequisite. | Existing [field arrows specification](../../../e2e-tests/features/upload.feature#L318); **planned:** individual/batch labels/keywords, additive memberships and confirmed empty-source removal, photoshoot assignment/clear + suggestions. Reuse mutation/collections suites, no partner-publication trial. |
| P13 | **Required.** [Original storage](../../../common-lib/src/main/scala/com/gu/mediaservice/lib/ImageIngestOperations.scala#L34) avoids overwriting original; [request patch](../../../image-loader/app/model/Uploader.scala#L323) restores stored uploader/time/name; [Thrall](../../../thrall/app/lib/elasticsearch/ElasticSearch.scala#L891) excludes lifecycle/grouping/edit fields from repeat replacement. [Warning](../../../kahuna/public/js/edits/image-editor.html#L206), [deleted state](../../../kahuna/public/js/util/get-deleted-state.js#L10), [delete](../../../kahuna/public/js/components/gr-delete-image/gr-delete-image.js#L40), [restore](../../../media-api/app/controllers/MediaApi.scala#L435) own distinct checks. | U3/U7 attempt-vs-image identity + current capabilities. [Step 17](gradually-growing-teeth.kupua-edits-steps.md#step-17-soft-delete-and-restore) owns deletion/restore and lifecycle limitations. Delete preparation only, restore absent; duplicate must not appear newly owned/editable. | Existing [deleted-duplicate specifications](../../../e2e-tests/features/upload.feature#L204); **planned:** allowed/denied existing duplicate, soft-deleted repeat, server-permitted restore (archive first), delete rejection/partial failure. No hard-delete or automatic restore/re-upload. |
| P14 | **Required.** [Editor](../../../kahuna/public/js/edits/image-editor.html#L7) links detail and valid-image crop; [archiver](../../../kahuna/public/js/components/gr-archiver-status/gr-archiver-status.js#L35) checks root archive permission; [service](../../../kahuna/public/js/services/archive.js#L21) PUTs boolean and checks readback. Persistence is not deletion protection. | U1/U7 + [Step 13](gradually-growing-teeth.kupua-edits-steps.md#step-13-save-crops-create-full-frame-exports-and-browse-their-results): [detail](../../src/components/ImageDetail.tsx) / [crop](../../src/components/crop/CropEditor.tsx) exist with eligibility/notices/preparation; crop submission/archive missing. Return is currently search-oriented, not batch-aware. | **Planned:** batch -> detail/crop -> same batch/place; denied crop blocked; actual crop creation/readback and archive/unarchive use owning operations. Reuse history/crop/mutation suites. Preview/Not sent is not full workflow parity. |
| P15 | **Required recovery contract**, not a claim of strong Kahuna recovery. [Session](../../../kahuna/public/js/services/api/media-api.js#L101) cached; [manager](../../../kahuna/public/js/upload/manager.js#L10) in-memory sets; [controller](../../../kahuna/public/js/upload/controller.js#L19) departure warnings. No durable transfer resume/safe replay contract in those owners. | U1/U3/U4: [session invalidation](../../src/lib/grid-api-instance.ts#L22), [command outcomes](../../src/lib/grid-commands.ts#L27), [history](../../src/lib/history-snapshot.ts) reusable. Upload reauthentication/status reconciliation/descriptor recovery missing. Reconciliation is a read, not replay permission. | **Planned:** expiry stops unsent work, no mutation replay after login/reload; lost transfers interrupted/uncertain; known completed images discoverable; missing batch unavailable, never latest/library substitution. Reuse session/command/history fixtures; no live auth fault induced. |

### Operation Semantics Behind the Checklist

**Metadata:** the [required form](../../../kahuna/public/js/upload/jobs/required-metadata-editor.html#L34)
uses 750ms default debounce and immediate blur save; Credit uses datalist-update/
blur. [Save](../../../kahuna/public/js/upload/jobs/required-metadata-editor.js#L40)
builds overrides against original/effective baseline, retaining existing keywords
outside its rendered subset. [Edits update](../../../kahuna/public/js/edits/service.js#L157)
PUTs replacement data then polls the corresponding image edit for equality before
publication. This is not conflict prevention; use Step 8's fresh full singleton/
owning edits merge, never reconstruct originals from lean list data.

**Batch scope:** [metadata](../../../kahuna/public/js/upload/jobs/required-metadata-editor.js#L106),
[rights/collections](../../../kahuna/public/js/edits/image-editor.js#L278),
[lists](../../../kahuna/public/js/edits/list-editor.js#L125) and
[photoshoot](../../../kahuna/public/js/components/gr-photoshoot/gr-photoshoot.js#L79)
broadcast to current instantiated batch editors. They are not durable ID snapshots
or promises about not-yet-created editors. Capture explicit targets/values in
Kupua, including offscreen members. C6 selects readable canonical images for the
first version, not merely a prepared content-hash ID; processing/unavailable
files are explicitly excluded, with no later automatic application.

**Rights:** [Save](../../../kahuna/public/js/usage-rights/usage-rights-editor.js#L186)
builds category model (or `{}` to clear), drops unchecked restrictions, then
[runs](../../../kahuna/public/js/usage-rights/usage-rights-editor.js#L229) rights PUT,
category-lease events, metadata-from-rights action and image read. [Full/filtered
catalogues](../../../kahuna/public/js/services/api/edits-api.js#L65) govern writable
choices; an existing out-of-filter category can remain visible. Properties carry
required/options/dependent-map rules. [Lease helper](../../../kahuna/public/js/common/usageRightsUtils.js#L1)
uses today/upload/taken/domain TX dates and old-category matching lease types;
lease events are not awaited transactions. **Batch differs:** [recipients](../../../kahuna/public/js/edits/image-editor.js#L278)
PUT rights and trigger category-lease handling, but do not call
`updateMetadataFromUsageRights`; the sender can also broadcast category leases.
Do not promise identical atomic Save semantics. U6a composes intended per-image
effects with fresh before-state and explicit substep outcomes; C3 selects the
representative configured workflow, not a new general rights audit.

**Leases:** [form](../../../kahuna/public/js/leases/leases.js#L54) adds one; use
leases default to end-of-day in two days, deny-syndication clears start,
allow-syndication clears end and can prefix notes. Existing syndication leases
prompt overwrite confirmation; individual removal uses UUID. [Arrow](../../../kahuna/public/js/leases/leases.js#L171)
replaces the target's whole lease set, not union; empty source requests confirmation
before clearing all. [Service](../../../kahuna/public/js/services/api/leases.js#L39)
follows image clear/replace/add/add-many actions and lease deletion, with some
detached readback polling. Preserve intended state, not false completion or a
new one-lease-per-type rule.

**Collections/lists/photoshoot:** [collection arrow](../../../kahuna/public/js/edits/image-editor.js#L412)
adds source paths to target memberships, not nonempty replacement; empty source
confirms `Remove ALL collections in job?` before per-membership removal.
[API](../../../kahuna/public/js/services/api/collections-api.js#L90) follows image
`add-collection`/membership `remove` then image readback. [List arrow](../../../kahuna/public/js/edits/list-editor.js#L133)
adds source elements with tracked explicit removals; empty source confirms clear.
[Handlers](../../../kahuna/public/js/edits/image-editor.js#L95) use label POST/member
DELETE, while Keywords update metadata overrides. [Photoshoot](../../../kahuna/public/js/components/gr-photoshoot/gr-photoshoot.js#L64)
saves title (blank removes); [service](../../../kahuna/public/js/services/photoshoot.js#L21)
PUTs/DELETEs its distinct resource and polls equality. [Server handler](../../../metadata-editor/app/controllers/SyndicationController.scala#L27)
requires its own EditMetadata admission for set/delete, not merely a guessed
permission from uploader identity. [Composition](../../../metadata-editor/app/lib/Syndication.scala#L28)
compares rights across old/new photoshoots around the membership change and
publishes changed inferred syndication rights: the side-effect scope can exceed
the explicit batch. Title readback alone does not certify all those effects.
Wider execution/admission and recorded GRID-009/013 limits remain owned by
[Step 16](gradually-growing-teeth.kupua-edits-steps.md#step-16-photoshoots-syndication-rights-and-send-to-photo-sales),
not new read-endpoint prerequisites or permission for external publication.

**Deferred templates:** [selection](../../../kahuna/public/js/metadata-templates/metadata-templates.js#L130)
previews metadata replace/append/prepend with upload-date/time/uploader placeholders,
existing collection, rights and duration-based leases. [Cancel](../../../kahuna/public/js/metadata-templates/metadata-templates.js#L146)
restores preview without writes. [Apply](../../../kahuna/public/js/metadata-templates/metadata-templates.js#L152)
sequences metadata -> collection addition -> rights/derived metadata -> lease
add/replace. Catch/finally still calls applied after failure; do not copy that
success signal. Preview grants no authority; selecting is not autosaving.

**Duplicates:** [signed map](../../../kahuna/public/js/upload/manager.js#L41)
collapses same-hash inputs (last map value), unlike per-file service calls.
[Original object](../../../common-lib/src/main/scala/com/gu/mediaservice/lib/ImageIngestOperations.scala#L34)
is not overwritten; [request patch](../../../image-loader/app/model/Uploader.scala#L323)
restores stored uploader/time/filename. [Thrall](../../../thrall/app/lib/elasticsearch/ElasticSearch.scala#L891)
prunes user edits/uploader/lifecycle/grouping from repeat-ingest update and
[refreshes edits](../../../thrall/app/lib/elasticsearch/ElasticSearch.scala#L158).
[Delete](../../../media-api/app/controllers/MediaApi.scala#L391) checks deletability
and uploader/delete permission; [restore](../../../media-api/app/controllers/MediaApi.scala#L435)
checks its separate admission and archives first. Existing roadmap limitations
remain explicit dispositions, not new blanket backend prerequisites.

**Failure/recovery:** [manager](../../../kahuna/public/js/upload/manager.js#L61)
moves submissions to completed on transfer-promise settlement while [jobs](../../../kahuna/public/js/upload/jobs/upload-jobs.js#L49)
still poll processing/readability. `$q.all` can reject before siblings finish;
not every error decrements remaining, and filename/label follow-ups are not awaited
before upload success. [Leave guard](../../../kahuna/public/js/upload/controller.js#L19)
observes both sets/statuses. These justify one activity owner and separate outcomes,
not porting misleading states or fixing Kahuna in U0a. No retry/resumable transfer/
safe automatic replay contract was found in the inspected Upload owners.

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

U0b requires these jobs, outcomes and drafts to survive in-app navigation away
and return; a completion notice is a later UI, not a dependency of that ownership.
Do not port Kahuna's in-app leave warning as though safe route changes were tab
closure. Browser interruption/closure still has the narrower recovery contract below.

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
| UB8 | done 13 November (`9f1a0f86e`, `7ecb32f36`) |
| B9/B10 | done 13 November (`32b9519be`; documentation `236322712`) |
| U2-proto | complete and committed as a bounded proof of approach 13 November; all U2 witnesses and fresh full E2E pass; indexed comparison and full operator campaign recorded; broader media-readiness findings and historical E2E intermittents remain separate follow-ups, not claimed fixes or universal performance certification |
| U0a | complete 13 November: source/configuration baseline and all P01-P15 applicability/owners/witness plans recorded; TEST page selects signed upload; C1-C4 remain explicit deployment/runtime gaps, not passes |
| U0b | complete 13 November at operator-reviewed workflow scope: C5-C7 resolved; familiar parity first, selection/panel omitted initially, later opportunities retained; operator explicitly chose no new browser demonstrations; runtime acceptance remains planned |
| U1 | complete: route/scope foundation 13 November, API-only boundary 14 November; full unit/E2E/build/type gates pass; fixture-backed browsing only, no real Upload or recovery claim |
| U2-U8 | not started; domain editors excluded and U6c templates deferred by U0a operator decision |

**Recommended next separately selected unit:** U3, real upload transport and
route-independent jobs, with its own permissions and C1 checks. U1 supplies the
browsing boundary; U4 joins those foundations.

**Recommended execution order:** `U3 -> U4 -> U2 -> U5`, then the remaining required
U6a/U6b and U7 capabilities, followed by U8 acceptance. Real U2 comes immediately
after U4's working ingestion/batch-entry milestone and before U5 connects metadata
saving and batch propagation. U2 supplies the actual image-and-fields density and
retained editing state, reusing U2-proto's geometry rather than repeating its proof.
U6c templates remain deferred.

This is a priority order, not a new technical dependency: U2 remains independently
possible if the operator deliberately selects form work earlier. Each unit still
requires separate selection. No repeat U0a audit, U0b design exercise or U2-proto
campaign is needed. No product unit starts automatically from this status.

**Early milestone:** U3 + U4 (which also requires U1) gives real ingestion through
processing to canonical images and existing browsing/detail before the form density
exists. Only already-connected editing operations are usable at that point. This
is not editorial completion or Upload parity: required metadata, rights and other
applicable operations remain dependencies in U5-U7. Templates are deferred by
U0a, not a current acceptance gate. Say so in closeouts.
Most remaining effort sits in the editing roadmap steps those units depend on.

### UB8. Ordered-Read `ids` as a JSON Array (do first)

Operator-approved standalone unit; touches `media-api/` with that explicit scope.
Replace the POST ordered-read `ids` string with an optional array of nonempty
strings, matching mget. Absent = unrestricted; a wrong shape = 400 and an empty
list or empty ID = 422 (status split refined by B10).
Client, server, Scala tests, recorded POST bodies and the label-editor fixture
changed together; no CSV compatibility layer; legacy GET unchanged. UB8 left the
other optional fields alone; the separately selected B9/B10 work subsequently
addressed their shared body parsing. Details: [B8](#unmerged-endpoints-review-now).

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

#### Prototype Decision Record (13 November 2026)

**Keep the bounded geometry and measurement owner; keep the UI dev-only.**
`window.__kupua_measured__.enable()` substitutes the stand-in for the Justified
slot; `enable(false)` restores Justified. `field("extra", false)` or
`field("note", false)` changes the fake global field set. No Upload, real metadata
commands, new route, datasource, dependency or global history policy was added.

| Question | Decision and evidence |
| --- | --- |
| Q1: ownership | [useMeasuredLayout](../../src/hooks/useMeasuredLayout.ts) owns DOM measurement and internal-field capture; [useScrollEffects](../../src/hooks/useScrollEffects.ts) remains the compensation writer. TanStack size adjustment and native anchoring are disabled, as for Justified, to avoid competing scroll writers. Old committed geometry supplies just-evicted heights. An input capture expires after its measurement opportunity and yields to newer browsing. Stable identity keys and a bounded active-editor range keep focus through publication. The [maintenance witness](../../e2e/local/justified-windowed.spec.ts) covers prepend, eviction, pixels, draft and input focus in indexed/seek projects. |
| Q2: pre-paint | Initial reads occur in a layout effect; ResizeObserver publishes through `flushSync`, then the shared layout effect corrects placement. Observation is suspended during observer delivery to avoid observing reused nodes mid-delivery; new nodes are still measured synchronously, with observation alone reattached next frame. Observer callbacks use committed state. [Browser witnesses](../../e2e/shared/browse-density.ts) assert stable sampled-frame coordinates from density arrival and during offscreen correction, field changes, reflow, visible growth and shrink; they also reject observer errors. This is Chromium frame-coordinate evidence, not compositor-video or mobile timing certification. |
| Q3: estimates | The stand-in uses its image-derived thumbnail height plus a cheap field-count allowance; exact wrapping comes only from DOM measurement. [Measured geometry](../../src/lib/windowed-measured-layout.ts) retains measured heights only for loaded identities. Its `prepareSeek` builds destination geometry and delegates headroom/end policy to `prepareDestinationSeek`; the store's existing variable branch stays unchanged. [Pure tests](../../src/lib/windowed-measured-layout.test.ts) cover pruning, old eviction geometry, empty destinations and sub-row seek preparation; browser journeys cover distant landing and return. |
| Q4: indexed tier | One estimated head span, loaded rows and one estimated tail span cover the native extent. Logical item lookup, visible-range reporting and keyboard spatial geometry remain separate from those virtual rows. The [real-TanStack unit witness](../../src/lib/windowed-measured-layout.test.ts) visits **1,002 rows** for correction at both 12k and 65k totals with a 1,000-image window. No result-sized geometry array or whole-result read is introduced. Indexed boundary arrows use item geometry, not the entire unloaded span. |
| Q5: drafts | [MeasuredGrid](../../src/components/MeasuredGrid.tsx) owns sparse draft intent outside disposable cells and the measurement cache. The shared browser journey types a value, performs three exact-pixel Grid/Table/stand-in cycles, leaves and re-enters a distant window, and hides/restores the input without losing it. Tall-form interiors survive panel/density round trips; a disappearing active field hands placement to the next retained field or image. The resident case also checks a 390px coarse-pointer compact shell without horizontal overflow. |
| Q6: performance | The operator ran the [indexed comparison](../../e2e-perf/research/density-app-research.spec.ts) four times on 13 November; all passed. The stand-in had lower p95 and worst sampled frame intervals in every pair, while achieving the requested scrolling speed. The measured representation remained bounded to 302 virtual rows for 300 loaded records. This supports the approach for this workload, not equal-throughput, capacity-window, real-media or real-metadata performance parity. Results and limits are below; no agent-run perf campaign was used. |

Directly copying Justified invalidation was rejected before implementation:
installed TanStack core 3.17.11 made 12,000/65,000 estimate calls after `measure()`
at those result totals, and 11,799/64,799 after correcting item 200. The operator
then authorized the bounded adapter. These counts are complexity evidence, not
observed frame-time harm in Justified. Existing canonical history was checked:
the latest two inspected campaigns (7/9 November) cover existing densities in
seek mode; they do not answer DOM-measured indexed correction cost.

Two independent GPT-6.1 Sol reviews found four S2 issues: span-targeted arrows,
tall-form interior clamping, stale input capture, and tall-form PageDown. All
received failing-first witnesses and local repairs in the existing navigation and
browser suites. The selection/focus disagreement gap also reproduced a 120px
shift and was repaired by reusing `chooseReflowAnchor` against committed geometry.
No existing assertion was weakened. Geometry remains independent
of the fake fields; per-image measurements do not prevent future grouped rows,
compact forms or layout-keyed field/zoom changes. Those controls are not built.

**Operator comparison results (13 November).** Four paired repetitions at
65,000 results and 1720x960, alternating density order, scrolling at 1200px/s for
four seconds. Source: the operator's `kupua-u2-frames.txt` log, eight JSON records.

| Metric | Justified | Measured stand-in |
| --- | --- | --- |
| Median of four run-level frame-p95 values | 25.25ms | 20.4ms |
| Largest observed interval across the four runs | 66.3ms | 54.4ms |
| Median achieved speed | 1202.1px/s | 1199.8px/s |
| Loaded records at each run's end | 500 | 300 |
| Virtual rows at each run's end | 6793 | 302 |

Stand-in measurement records numbered 31-43, all within its loaded window. Paired
p95 differences favored it by 3.0-7.9ms. These are scroll-step intervals sampled
by the rAF-driven driver, not isolated layout CPU time or compositor captures.
The densities process different numbers of images at equal pixel speed, and the
windows were not at the 1,000-image capacity. Synthetic media excludes real delivery
costs; fake fields do not establish real-editor cost. Occasional long intervals
remain, so this is not a claim of hitch-free scrolling. No further identical run
is needed to answer this bounded comparison.

Reproduction command, already run by the operator (isolated local fixtures;
port 3041 free; normal Kupua need not be running):

```sh
set -o pipefail; npm --prefix kupua run test:perf-research -- --grep="U2 measured comparison" --repeat-each=4 --headed 2>&1 | tee "$TMPDIR/kupua-u2-frames.txt"
```

The habitual jank and perceived surfaces separately check existing workflows for
regressions. Choose their backend/delivery flags after confirming the running
normal app's mode, per the [performance guide](../../e2e-perf/README.md). These are
templates, not ready-to-paste commands for an arbitrarily configured app:

```sh
set -o pipefail; npm --prefix kupua run test:perf -- --runs 3 --label "U2-proto jank" 2>&1 | tee "$TMPDIR/kupua-test-output.txt"
set -o pipefail; npm --prefix kupua run test:perf -- --perceived-only --runs 4 --label "U2-proto perceived" 2>&1 | tee "$TMPDIR/kupua-test-output.txt"
```

Inspect frame tails, achieved demand and usable-content readiness together.
The habitual suites check existing workflows; the isolated comparison above is
the stand-in measurement. The dedicated comparison closes the prototype's bounded
frame-cost question within its stated limits; it adds no canonical-history entry.
Real-editor performance and broader media-readiness acceptance belong to their
selected implementation or investigation, not an indefinite U2-proto prerequisite.

The operator subsequently completed all four habitual suites with four repetitions
(`c431760a-0d03-4a54-a23e-106e61a62167`). The
[full assessment](scroll-horizons-thumbs-and-blocking.md#13-november-imgops-checkpoint)
compares the 9 November checkpoint, preserves substantial app-change and uncontrolled
media/cache caveats, and separates improved response paths from slower full-image
readiness and forward thumbnail exposure. The operator corrected the delivery context:
this used existing imgops, not imgproxy; the mistaken campaign label remains historical
provenance. This is a current-app baseline, not an isolated U2 or image-processor
comparison or universal acceptance. These suites do not activate
the measured form; its indexed comparison above remains separate evidence.

Validation: **3,846 units across 114 files**, build, `typecheck:e2e` and
`typecheck:perf` pass on the retained source. The latest full local E2E run with
retries disabled passed **596/596**, including all **nine U2 cases**. The earlier
**594/596** run failed hosted label-receipt ordering and a mobile fixture
module fetch; both had passed unchanged in isolation. The subsequent investigation
passed both owning specs (75 cases) and the fresh full suite without a product fix.
A new receipt assertion checks that observation is still pending before releasing
the held readback. No existing expectation was weakened. R7/R8 retain the earlier
intermittent observations without claiming they were root-caused or repaired.
The phone witness uses
startup touch emulation, with coarse-pointer/compact-shell/no-overflow assertions
and a reviewed screenshot. The operator ran the comparisons above; the agent ran
no perf workload. The prototype and retained evidence are committed with this
decision record; nothing was pushed. This closes the proof, not the real form
density or Upload.

### U0. Parity and Interaction Baseline

Run as two sessions: **U0a** parity checklist and transport/configuration
(research only); **U0b** interaction study with the operator.

**Goal:** make acceptance and the first engineering choices concrete before broad edits.

U0a is complete at its research scope in sections 2-3: TEST's page-selected signed
topology is observed, deployment/runtime limits remain explicit, and operator
applicability decisions qualify the original capability list. U0b is complete at
the reviewed-workflow scope recorded below, not browser/runtime acceptance.

**U0a remit (completed):** confirm P01-P15 and the selected upload topology/configuration. Read the relevant
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

**Original U0b demonstration brief:** use existing fixtures and real Kupua controls
for a small desktop/compact mixed batch with delayed arrivals, not a static
perfect-success mock. The operator subsequently selected workflow review without
a new demonstration; retain the following as implementation witnesses, not work
still required to close U0b:

- How pending/failed jobs remain visible while canonical images enter the density.
  Prefer separate job ownership and a compact activity area; inline pending slots
  require an explicit slot model, not fabricated `Image` records.
- How one image's editable form is focused, selected and opened without text-input
  clicks becoming navigation, and how the redundant Details panel is handled.
- How current batch, recent uploads and the batch selector are distinguished.
- Which save interactions retain Kahuna's efficient completion workflow. Existing
  autosave and explicit multi-step saves cannot be indiscriminately replaced by
  a click-heavy Save-per-field design merely to simplify implementation.

**U0 deliverable:** P01-P15 applicability and planned witnesses, one recommended
interaction direction with bounded alternatives where necessary, and the recorded
source/page-selected transport contract with deployment checks explicitly open.
Operator review concerns concrete workflows, not code terms; it does not turn the
parity checklist into passing runtime evidence. No live submission without permission.

#### U0b Interaction Decision Record

**Operator-reviewed direction, 13 November 2026: familiar parity first.** A working
Upload is more useful than refining hypothetical improvements in a large mock.
Use the initial behaviour below; preserve inexpensive ownership boundaries for
later improvements, not speculative infrastructure or dormant implementations.
The operator approved a bounded scratch study, then explicitly chose to close on
reviewed workflows with new browser demonstrations recorded as **not performed**.
No study files were created and no app/server was started or inspected live.

**Evidence:** U0a remains the source/configuration baseline; U2-proto remains the
completed geometry proof. Targeted current-source checks confirmed that Kupua's
[ordinary text editor](../../src/components/MetadataTextEditor.tsx#L147) prepares
Not sent intent, while [MeasuredGrid](../../src/components/MeasuredGrid.tsx) has
stand-in fields, not real Upload. Existing [label/publication fixtures](../../e2e/shared/label-editor-fixture.tsx)
provide reusable controls and media, not a mixed-upload implementation. None was
run in U0b. The operator reports losing sight of remaining uploads when scrolling
down. A focused recheck of the [Kahuna job list](../../../kahuna/public/js/upload/jobs/upload-jobs.html#L1)
and [metadata arrows](../../../kahuna/public/js/upload/jobs/required-metadata-editor.js#L106)
confirmed that existing editable current-batch forms receive an arrow even below
the fold; files whose images/editors arrive later do not inherit that click.
That is a source fact, not a live mutation observation.

##### Reviewed Workflows

| Workflow | First-version decision; what the user sees and does | Owner / planned witness |
| --- | --- | --- |
| Drop or pick files | A submission creates one named local batch, separate from later submissions. Tens of files are normal, not an implied cap; splitting work because of historic failures is not the preferred workload. Keep the preset-label control available and retain its set locally; capture it for each new submission. Changing presets does not silently rewrite earlier batches. | U3/U4/U5; P01-P03/P07. Existing configured size/content rules, separate outcomes for rejected files and follow-up edits. No new ingestion trial in U0b. |
| Scroll while some files are pending or failed | Keep a compact batch summary visible while editing: ready, still processing and needs attention. Expand it to inspect file-level stages/errors; it must remain usable on a phone without permanently covering the form. Show counts of files separately from unique images where duplicates differ. Real images enter the density in submitted-filename order; pending/error entries are activity, not fake library images. Arrivals do not steal typing focus or reset the view. | U3/U4/U2; P04/P06/P13. Mixed success/processing/rejection, delayed arrival while editing and an offscreen failure remain planned browser witnesses. Geometry is reused, not re-proved. |
| Complete metadata | The form is an editing surface, with Description/Credit guidance and all applicable field families retained, not merely fields that currently have red borders. Ordinary fields save after a short pause or when leaving the field; suggestions retain their normal choice/blur interaction. Do not require repeated pencil/Save actions for routine completion in this density. Preserve read-only/permission states and distinguish pending, acknowledged-but-not-yet-visible, rejected and uncertain outcomes. An uploaded image is not proof its follow-up edits saved. | U2/U5; P07/P08. Reuse shared field controls/commands; do not change search/detail's existing explicit preparation controls merely to make the form fast. Retained drafts and uncertain-save witnesses remain planned. |
| Apply a field to the batch | Keep frequent per-field arrows readily available, without a confirmation dialog for every ordinary application. Capture the displayed batch, value/action and known canonical image targets at the click. Include offscreen members; deduplicate canonical IDs. Show target counts and processing/unavailable/denied exclusions rather than claiming all files were edited. A later arrival or drop does not expand that operation. Empty-source destructive clears retain the existing confirmations; additive lists/collections, lease replacement and other operation semantics remain as recorded in U0a. | U4/U5/U6/U7; P09/P10/P12. Captured-target, delayed-arrival, duplicate and partial-outcome witnesses remain planned. No pending-arrival instruction queue in the first version. |
| Understand the mixed-batch arrow | Example: 12 files, eight ready images including the source, three processing and one rejected. Assuming the seven other images are editable, show an application to those **seven other images**, with **three processing excluded** and **one rejected file**, while the source's own save has its own result. Later arrival does not imply a saved value. The operator may deliberately apply again with newly displayed counts; unknown earlier outcomes must remain visible, never trigger automatic replay or look like success. | C6 resolved as known-image scope. A future explicit apply-on-arrival option is R13, not a current hidden promise. This example was discussed, not executed. |
| Choose rights or leases | Keep deliberate Save/Apply for multi-step rights and lease edits; category/lease side effects and partial completion remain visible. Do not autosave a half-completed rights choice or label a partially completed composite Saved. Preserve configured requirements and server authority. | U6a/U6b; P10. C3 still selects the representative configured category at implementation; no new general rights audit. Templates remain deferred. |
| Open an image or crop | Inputs and their keyboard gestures edit without opening the image. Use an explicit image/detail entry and the existing permitted crop entry, with return to the same batch/place. Do not render a redundant single-image metadata panel beside a form that already contains those fields. Existing detail/crop surfaces remain available, with their own capability and disconnected-operation limits. | U1/U2/U7; P14. Detail/crop round trip and text-entry witnesses remain planned; no crop submission demonstrated. |
| Select images | **Operator amendment:** omit Upload selection UI and its metadata panel initially. Selection becomes useful when an intentional apply-to-selection surface exists. A batch can be thought of as a selection and arrows as applicators, but that is a product analogy, not approval to unify stores or turn batch membership into the current search selection. Preserve existing search selection behaviour. | U1/U2/U4. No new Upload checkbox/selection-panel acceptance requirement. Future selection remains possible through explicit command targets, not advance UI or a general set framework. |
| Switch contexts | Distinguish current batch, recent uploads and retained local batches. Current/retained batches have explicit membership and the same arrows; recent uploads are a query, never an implicit batch. Start with five recent batch choices plus outstanding work; this is a display limit, not deletion of older descriptors. An older retained URL still resolves. Opening another batch may initially reset that view's position/refinement, but not drafts/jobs/outcomes. | U1/U4; P05/P09/P15. A richer navigation panel and per-batch view recall are later opportunities, not prerequisites. Missing/empty scope never becomes an unrestricted query. |
| Leave Upload, then return | Allow ordinary in-app navigation to search without Kahuna's blanket leave warning. Restore the departing search place; returning to Upload restores the active batch and its place, with jobs, outcomes and drafts intact. Jobs do not belong to the visible list. Do not require a completion-notification UI to deliver this round trip. | U1/U3/U4; P04/P15. Hold jobs and a draft, navigate away, resolve some jobs, return: planned fixture witness. Notification presentation is later, not already implemented. |
| Open a missing batch link or reload | A missing batch explains that its local record is unavailable and offers explicit recent-uploads/search/retained-batch alternatives; never substitute the newest batch. Reload/tab closure differs from in-app navigation: preserve known lightweight membership where storage permits, but do not promise durable drafts, retained file bytes or transfer resumption. Warn where work could be lost; interrupted/uncertain jobs remain recognizable. Storage failure is explicit; active work is not silently evicted to satisfy a selector limit. | U1/U3/U4; P15. No automatic re-upload or mutation replay after authentication/reload. Durable/server batches are deferred B7, not an implied first-version guarantee. |
| Work on a compact/phone layout | Use one-column forms and the existing touch/input conventions. Status and arrow scope must be readable/tappable, not available only through hover. Avoid duplicate sheets/panels and keep inputs accessible with the keyboard open. Preserve natural heights and the settled placement contract. | U2/U4/U8. New Upload phone/keyboard/suggestion witnesses remain planned; U2's compact geometry witness is not real-form usability evidence. |

##### Boundaries That Keep Later Improvements Possible

- **Jobs, membership and presentation remain separate.** This enables notification,
  better interruption/recovery and a later batch navigator without tying work to
  the Upload page. It does not imply browser background execution, resumable
  transfers, persistent file bytes or a notification subsystem now.
- **Batch lookup is local, image reads and authority are not.** Keep the short
  batch reference separate from explicit image targets and current authorization.
  A future durable batch service can supply membership without redefining editing
  or browsing. Do not prebuild a backend schema or use Collections as batch storage.
- **Commands accept captured targets independently of their chooser.** Current
  batch arrows, a future selection panel or deferred templates can use shared
  operations. Do not couple operations to rendered rows, global broadcasts or
  whichever batch happens to be visible when a response arrives.
- **The form remains a density, not an Upload-only renderer.** Keep Upload activity
  and batch controls outside its reusable rendering/field logic. Ordinary Grid
  exposure, other result contexts and selection remain later work; leaving Upload
  must not strand search on an unavailable density.
- **Keep the settled layout/field seams.** Natural heights, a global visible-field
  set and bounded geometry already permit later live field toggles and grouped
  forms. Do not hard-code one form per row as a universal contract, add fixed-height
  clipping, or build zoom/field-toggle UI now. Zoom behaviour remains unselected.

These are narrow ownership requirements already supported by the workplan, not a
promise that every future feature will be cheap. Future UX and backend choices
belong in the opportunity registers below and separately selected work.

##### Completion and Remaining Decisions

**C5-C7 are resolved for implementation.** There is one recommended first-version
direction, not competing designs to re-audit. Exact summary styling/placement and
compact wording can be refined against working controls in U4/U8. Per-batch view
recall beyond the required search/Upload return is optional initially. Applying
to processing files, notification UI, durable batches, a navigation panel, global
form exposure, zoom and field-toggle controls are deferred choices, not unfinished
U0b gates. The registers describe benefit, cost/risk and a selection trigger.

**Demonstrations performed:** none in U0b. No new interactive prototype, browser
read/interaction, upload/edit, phone trial, test or performance workload occurred.
Only source-backed workflow discussion and operator review were performed.
All P01-P15 applicability decisions remain intact; their required Kupua runtime
witnesses remain planned. Existing U0a observed TEST configuration and U2-proto
evidence are retained with their original limits, not presented as new evidence.

**Still separately owned:** C1 TEST transport checks before U3 live use; C2 eventual
PROD permission/configuration; C3 the U6a configured rights example; C4 lifecycle/
GRID-018 disposition. UB8/B9/B10 stay done; B11/B12 stay explicit low-priority
backend decisions. No U0b workflow established another ordered-read API gap.
Recommend **U1 next**, separately selected, followed by the U3/U4 ingestion path;
required editing families still gate final parity. No new broad audit is needed.

### U1. Route-Safe Browsing and Scope Admission

**Depends on:** U0's working-set contract. **Goal:** a new context can use existing
views/detail without leaking or inheriting the library search.

Apply the [U0b decisions](#u0b-interaction-decision-record): preserve search and
active-Upload return positions, omit Upload selection/panel UI initially, and
retain empty/missing-scope guards. Do not unify batch membership with the search
selection store because both can conceptually describe a set of images.

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

#### Implemented Admission Boundary

[Browsing context](../../src/lib/browsing-context.tsx) supplies the active route
and immutable fixture membership snapshots; [browsing navigation](../../src/lib/browsing-navigation.ts)
captures search/Upload departure before route disposal. The existing search store,
data window and densities remain the only active browsing engine. A typed internal
`imageScope` carries key, revision and canonical IDs; only the IDs reach existing
media-api POST read bodies. The URL contains a short `batch`, never the ID array.
Known-empty and unresolved scopes publish empty locally after cancellation.
Library arrival polling does not own batch growth; revisions do.

Admission follows the existing startup data mode. Direct-ES mode displays
`Upload requires media-api mode.`, hides Upload controls and admits only an empty
scope to cancel prior work without page/count reads. The direct-ES adapter is
unchanged; no Upload-specific ID filtering or other feature support belongs there.
The explicit Search alternative still returns to ordinary search. Shared scope
contracts and synthetic mocks remain useful API/test infrastructure, not a
supported direct-ES Upload implementation.

Upload has no search filters, selection controls or list metadata panel. Library
selection is dormant, not cleared or merged into membership. Existing density,
detail/crop and explicit search links use the admitted context. Cross-context
return restores URL, density and represented position without retaining a second
buffer. A newer revision can qualify a same-batch/query/sort snapshot only while
its anchor remains a member; ordinary library history matching stays strict.

This supplier is fixture-facing, in-memory membership only, not U4's durable
descriptor/resolver or U3's jobs. Recent uploads remain explicitly disconnected;
empty/missing links, including `image`, never substitute another batch or the library.
Only Grid/Table/Justified are currently admitted; no form density, file entry,
transport, jobs/outcomes/drafts or recovery guarantee is implemented by U1.
The [state guide](00%20Architecture%20and%20philosophy/state-management.md#search-and-upload-scope-admission)
and [history guide](00%20Architecture%20and%20philosophy/04-browser-history-architecture.md#search-and-upload-return)
own the mechanics.

#### U1 Validation and Limits

The final API-only source passes the following local gates, including the
14 November amendment and cold-review repairs. All commands ran
foreground from the repo root with `set -o pipefail` and `2>&1 | tee` output.
`build` includes the application TypeScript check.

Cold review identified and reproduced Home scope/departure, active-arrival position,
touch selection/refresh, compact-sort and activity-visibility defects. Independent
verification accepted the repairs; the full gates below were rerun on that frozen
source, not carried forward from the pre-review snapshot.

| Command | Outcome |
| --- | --- |
| `npm --prefix kupua test` | 3,855 tests in 114 files pass. |
| `npm --prefix kupua run test:e2e -- --retries=0` | 600/600 pass across normal, forced-seek and Justified projects; unchanged visual baselines. |
| `npm --prefix kupua run build` | Pass. |
| `npm --prefix kupua run build:hosted -- --outDir node_modules/.cache/u1-hosted` | Pass; final hosted output stays inside Kupua. |
| `npm --prefix kupua run typecheck:e2e` | Pass. |
| `npm --prefix kupua run typecheck:perf` | Pass; compiler only, no performance workload. |

Existing suites gained nine focused unit cases, three API-backed browser journeys
and one direct-ES refusal/return witness, not another runner or parallel browsing
fixture engine. [The existing API continuation fixture](../../e2e/local/grid-mutations.spec.ts)
drives the real `ApiDataSource` and mapper, checks the scoped POST body and rejects
unexpected transport; [history coverage](../../e2e/local/browser-history.spec.ts)
retains the direct-ES denial case. The former direct-ES copies of the Upload
journeys were removed, not kept as another transport variant. The journeys cover filtered
search departure with retained selection, density/detail/crop return, membership
growth while away, distinct batches with identical sorting, held obsolete work,
active revision changes, Back/Forward densities and no page/count reads for
empty/missing/recent-unavailable scopes. The compact journey checks dormant
selection through refresh, scoped sorting and reachable activity with its original
outside-batch target. An image parameter cannot hide those
unavailable alternatives. Existing direct-detail history assertions and visual
baselines remain intact. A failing-first return witness established the newer-
revision placement repair; R19 records the effect-order regression and correction.

This is local fixture and regression evidence, not a real upload/edit, hosted
deployment, native physical-Back or transport-recovery witness. Synthetic touch
events check application handlers, not native-device scrolling; the disconnected
preview checks activity visibility and target capture, not a running mutation queue.
No new dependencies,
backend changes, live-system browser access, performance workload, commits or pushes
were used. Jobs, outcomes and drafts must still be owned outside the view in U3-U5;
membership surviving in-app navigation does not prove those unimplemented lifetimes.
No product blocker remains for U1's API-only browsing boundary. C1-C4 and U2-U8
retain their separately owned limits. The direct-ES adapter is unchanged from the
pre-U1 baseline; the normal hosted build configuration is also unchanged.

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
Use U0b's direct form-editing workflow without a redundant single-image panel;
Upload selection controls remain deferred. Keep the field/layout boundaries for
later global density exposure, zoom and live field visibility, without adding
those controls or reopening U2-proto now.

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

#### Development Upload Gate

**Operator decision, 14 November 2026:** add a separate, default-off **Allow real
uploads** opt-in to the existing Hi, Joshua dialog, following its saved startup
preference and Apply/reload convention. The existing editing preference must not
implicitly enable uploads, and enabling uploads must not enable metadata writes.
Post-upload edits still require their own editing admission and server authority.

Enforce the upload opt-in at the owning command/transport boundary, before any
real prepare/load, signed file PUT or queued-status mutation. Picker/drop controls
reflect that policy but are not its only enforcement. Disabled upload dispatch
must remain blocked even when called without the UI; existing outcomes and safe
read-only status reconciliation need not disappear. Enabling the gate or signing
in again never automatically replays interrupted or uncertain submissions.

Keep the temporary opt-in narrowly owned: one preference/control and a centralized
upload-admission check, not component-local checks, per-phase flags or a new feature-
flag framework. It must be removable by a small, separately approved cleanup once
the operator considers development safeguards settled, without rewriting jobs,
transport or views. Retiring temporary upload/editing opt-ins must not remove
permanent authentication, upload permission, advertised-service admission or
validated transport targets. This decision specifies U3 work; no upload switch
or real ingestion transport is implemented yet.

#### Operator Testing Order

1. Establish isolated transport/job coverage using the existing fixtures, including
  disabled-gate refusal, editing enabled with uploads disabled, and uploads enabled
  with metadata editing disabled. Fixture execution must not contact real services.
2. Perform the first actual uploads during U3 against the operator's local Grid API
  backed by a local ES index. Start Grid without its `--use-TEST` flag. Most hands-on
  development testing happens here; U4 subsequently supplies normal picker/drop
  and batch navigation, without waiting for U2 or U5.
3. Only after the local cases work, test the local Grid API backed by TEST ES using
  Grid's `--use-TEST` flag, with the applicable C1 browser/configuration checks and
  C4 trial/rollout disposition. This remains TEST integration, not PROD approval.

Kupua stays in API mode throughout, using its existing `--use-media-api` selection
and independently configured media delivery. Do not confuse Grid's backing-service
flag with [Kupua's launcher](../../scripts/start.sh#L143): Kupua's `--use-TEST`
selects direct ES and is not an Upload test mode. Verify the actual API/backing-index
topology rather than inferring it from a localhost URL or a bare flag name.

A local ES index does not by itself make the loader, storage bucket, status or
metadata services local. Verify those upload/write destinations independently
before real transfers in either stage. The client opt-in is neither server
authorization nor permission for an agent to perform live trials: agent-run real
service access still needs explicit session-specific approval and approved files.
These operator-run stages do not authorize an agent to start/reconfigure services
or tunnels, inspect infrastructure or perform live writes automatically.

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
Implement U0b's compact persistent summary with expandable outcomes, keeping
file counts distinct from unique canonical-image/edit-target counts. Current and
retained batches share known-image arrows; recent uploads do not gain batch scope.
Completion notifications and a full batch-navigation panel are later opportunities.

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
metadata versus overrides, clearing semantics and unrelated overrides, including
preserving existing domain data without adding excluded domain editors. Obtain the authoritative resource/projection required
by each operation; lean list data is not automatically sufficient to construct a
whole-object replacement. Fresh reads mitigate but do not eliminate concurrent
editor races; do not promise server conflict prevention that does not exist.

Connect filename fallback and preset labels as owned follow-up operations with
their own results. Implement per-field propagation against captured canonical
targets, including offscreen members. Do not reproduce global UI broadcasts that
only reach mounted editors or other batches accidentally.
Use U0b's pause/blur-speed ordinary saves and explicit arrow counts/exclusions.
Processing files without canonical images are excluded, not silently queued for
later edits. Preserve captured intent and outcomes when leaving Upload, but do
not implement deferred-arrival application merely to keep that future option open.

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

- **U6a Rights:** category-specific fields, notices, single and current/retained-batch
  application; preserve the existing associated metadata/lease effects without
  claiming transactional completion across services.
- **U6b Leases:** the lease controls required by the Upload editor, correct target
  and permission handling, and the existing validity/readback semantics.
- **U6c Templates:** configured template choices and preview/apply/cancel, composing
  the established metadata, rights, collection and lease operations. Do not create
  a second template engine or grant authority from template configuration.
  **Deferred by U0a operator decision:** not a current acceptance gate despite
  TEST configuration; retain an easy shared-command extension path and select
  implementation separately later. BBC domain editors remain out of scope.

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
U0b closed through operator review, not a new browser demonstration: its mixed
batch, delayed arrival, scroll/status orientation and search/Upload return
witnesses still need execution against the implementation. Upload selection UI
and its panel are not first-version gates; existing search selection must not regress.

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

The normal `build:hosted` script intentionally writes into `kahuna/public/kupua`;
that is the correct hosted packaging workflow, not an incorrect build target.
For isolated validation under an explicitly Kupua-only write scope, override it
with `-- --outDir node_modules/.cache/u1-hosted` (or another ignored directory
inside Kupua). This validation override does not change the normal build configuration.

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
Every agent executing any unit must record concrete improvement ideas encountered
in that work, including ideas not needed for MVP. Parity is the floor, not the
ceiling: record how an idea would improve the user's workflow rather than treating
Kahuna's limitations as requirements. Use section 8's existing registers and the
evidence/benefit/cost/trigger format below; a hypothesis is welcome when labelled
as such, not presented as an established need. For backend opportunities, prefer
additive Kupua-specific support, then small shared changes with substantial
evidence/shared benefit; larger changes remain deferred. None becomes an MVP
prerequisite or implementation approval merely by being recorded.

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
4. Record every concrete finding; there is no entry cap. Prefer updating/merging
   an existing entry over a near-duplicate.
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
| B8 | Previously, [SearchParamsBody](../../../media-api/app/lib/elasticsearch/ElasticSearchModel.scala#L550) read `ids` with `asOpt[String]`; a wrong type became an absent ID constraint. Client and server consistently used a string, unlike mget's array. | **Done 13 November (UB8: `9f1a0f86e`, `7ecb32f36`).** Ordered-read POST `ids` is now an optional array of nonempty strings. Omission is unrestricted by ID; malformed shape/type is 400 and an empty array or empty ID is 422 (B10's final status split). Client, server, recorded bodies and fixtures changed together without a CSV compatibility layer. Legacy GET and authorization remain unchanged. |
| B9 | Every other shared body field was also read with `asOpt`: a wrong type (for example `free: "true"`, `reverse: "true"`) silently became absent, unparseable dates were dropped, unknown syndication/usage statuses threw (500) and a non-object body read as empty. | **Done 13 November (`32b9519be`; documentation `236322712`).** All shared fields are typed in one parser; null reads as absent except `ids`; list fields are JSON arrays; `pitId`/`reverse`/`seekToEnd` are type-checked centrally; the body must be an object. Unknown fields are still ignored by design. Legacy GET unchanged. |
| B10 | Malformed bodies answered 400 on endpoint-specific fields but 422 on shared ones. | **Done 13 November (`32b9519be`; documentation `236322712`).** Wrong JSON type or shape: 400 `invalid-params`, as Grid's other services and mget's shape check. Well-typed but unacceptable value (date, status, empty ID list, vector weight, CQL): 422 `invalid-uri-parameters`. |
| B11 | [Sort clause reading](../../../media-api/app/lib/elasticsearch/sorts.scala#L40) keeps only `order`, `missing`, `mode` and `nested.path`; other nested or sort-object options, including wrongly typed ones, are silently discarded (B9 cold review, S3). The [final D3 review](zz%20Archive/media-api-work/phase-3-d3-searchafter-code-review-final.md#L162) deliberately left this as silent truncation, judging a 422 over-engineering for a path Kupua cannot produce. Its malformed sort shapes also answer 422, not B10's 400. Unrelated to the removed user [secondary sorts](zz%20Archive/scroll-and-position-preservation-testing-4.2.1-obscure-sorting-decision.md), which concerned a second semantic field, not sort-object options. | Open, low priority. B9 adopted refusal over silent ignoring for body fields; applying the same rule here would reverse that D3 decision and needs an explicit operator choice. Kupua's recorded sort clauses use only the four supported keys, so refusal would not affect it. If done, align malformed sort shapes with B10's 400. |
| B12 | Endpoint-specific nulls are inconsistent with B9's shared rule: `sortValues: null` and `sort: null` are refused where omission is accepted (B9 cold review, S3). | Open. Either read endpoint nulls as absent or state that the null rule covers shared fields only. Not a Kupua regression. |

Further entries belong here only when a concrete Upload need reaches the new
endpoint boundary. A change's proximity to that code does not make an unrelated
legacy redesign small or necessary.

**U0a pre-merge checkpoint (13 November): retain existing read contracts.** No
new ordered-read amendment was established by the inspected Upload flows. UB8 and
B9/B10 are complete; B11/B12 remain explicit decisions, not automatic fixes.

| Concrete Upload need | Owning contract and disposition |
| --- | --- |
| Recent/all uploads for the current human | [Auth session](../../../auth/app/auth/AuthController.scala#L54) already supplies identity; [POST body](../../../media-api/app/lib/elasticsearch/ElasticSearchModel.scala#L620) accepts `uploadedBy`, forwarded by [client](../../src/dal/grid-api-search-adapter.ts#L144). **Retain backend.** Narrow identity projection/unfiltered admission is U4 client work, not a new endpoint. |
| Batch ID scope, sorting, hydration and pages | UB8 arrays + [mget chunking](../../src/dal/grid-api-search-adapter.ts#L192) cover membership hydration. **Retain backend.** Submitted filename order is local submission information, not a canonical server sort; restore it locally. Known-empty scope admission is U1; do not add durable server batches or a 200-image product cap. |
| Safe metadata overrides/reset | [Full singleton](../../src/dal/grid-api-search-adapter.ts#L175) plus authoritative edits already supply the required resources. **Retain lean projection.** Fetch originals/edits at the operation boundary per [Step 8](gradually-growing-teeth.kupua-edits-steps.md#step-8-editable-metadata-including-configured-domain-fields), not more payload on every browse read or a new blanket conflict API. |
| Bytes/status and rights/leases/membership/photoshoot/crop/lifecycle writes | Existing loader/satellite handlers own these, not new ordered-read endpoints. Add narrowly admitted client commands/configuration in selected units. Existing service reliability/concurrency findings retain roadmap/backlog dispositions; proximity to unmerged reads does not justify redesign. |

This is a bounded source assessment, not deployed/fixture acceptance. If a later
selected unit encounters an actual projection/pagination/ordering gap, name its
concrete workflow and failing existing contract before proposing an amendment.

**B8 provenance and implemented amendment:** the
[original D3 workplan](zz%20Archive/media-api-work/phase-3-d3-searchafter-workplan.md#L204)
explicitly mirrored `SearchParams.apply(request)` parsing. The
[final D3 review](zz%20Archive/media-api-work/phase-3-d3-searchafter-code-review-final.md#L209)
verified that client and server both used comma-separated strings and correctly
called that consistency "not a bug." This explains the existing format; do not
describe B8 as an accidental client/server mismatch.

The pre-merge amendment was justified by the
[active build plan](03%20Ce%20n'est%20pas%20une%20pipe%20dream/api-build/api-build-00-plan.md#L8)
permitting reshaping, the
[POST rationale](03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/media-api-90-conventions.md#L884)
favouring native structured JSON, and the
[mget contract](03%20Ce%20n'est%20pas%20une%20pipe%20dream/api-build/api-build-00-plan.md#L717)
already using an ID array. The operator confirmed Kupua as the sole current caller
of these new endpoints. UB8 changed ordered-read POST `ids` to an optional array
of nonempty strings, changing client and server together without a CSV compatibility
layer. Legacy GET URLs and internal search parameters retain their representation;
conversion occurs at the POST transport boundary.

The implemented boundary retains omission's unrestricted-by-ID meaning. Present
empty arrays or empty IDs receive 422; malformed shapes or types receive 400 under
B10's final contract. This preserves mget's nonempty-input convention without
introducing a 200-ID scope limit into ordered reads or silently omitting a supplied
empty constraint. U1 must still admit known-empty client batches without issuing
an unscoped read; the wire correction alone does not implement that context boundary.

The [parked empty-string finding](03%20Ce%20n'est%20pas%20une%20pipe%20dream/api-build/api-build-00-plan.md#L1488)
and [existing integration assertion](../../../media-api/test/lib/elasticsearch/ElasticSearchTest.scala#L2529)
recorded `ids: ""` failing closed in Elasticsearch, not widening. UB8 replaced that
failure expectation with intentional validation and retained an unscoped control
and malformed-type witnesses. Actual mapper-recorded POST bodies, Scala replay and
the [browser fixture](../../e2e/shared/label-editor-plugin.ts#L32) changed together,
preserving repaired known-empty AI membership handling. The
[D3 validation disposition](03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/d3-search-after-01-readiness-findings.md#L35)
cautions against broad hardening. UB8 stayed scoped to ID representation; B9/B10's
shared parsing changes were separately selected and completed. Neither completion
authorizes further authentication, sorting, PIT or legacy GET changes. B11/B12
remain explicit decisions, not automatic Upload prerequisites or backend approval.

### Existing Backend: Deferred by Default

| ID | Evidence and constraint | Possible improvement; trigger and limits |
| --- | --- | --- |
| B1 | [UploadStatusTable.queryByUser](../../../image-loader/app/lib/UploadStatusTable.scala#L48) scans all status rows and filters in application memory. | Consider an owner/time query index with pagination if this endpoint needs sustained use. Do not make it the new recent-library or batch-history source now; no performance measurement was made. |
| B2 | [Status records](../../../image-loader/app/model/UploadStatus.scala#L5) are keyed by image ID, and [prepare](../../../image-loader/app/controllers/ImageLoaderController.scala#L273) overwrites that record. Repeated/concurrent submissions of the same content have no separate server attempt identity. U0a also traced [presigned destinations](../../../image-loader/app/lib/ImageLoaderStore.scala#L50) to uploader/filename, not attempt ID: different bytes with the same submitted name can share the pending object destination. This is source-derived collision potential, not reproduced lost ingestion. | Attempt identity and attempt-qualified pending keys could support isolation/history, but require loader/presigner/consumer compatibility work and backend permission. Retain local attempts now; do not claim server per-attempt isolation or a demonstrated authorization exploit. Before promising concurrent same-name reliability, obtain a bounded isolated witness and explicit disposition. No general ingestion rewrite, automatic retry or new ordered-read API prerequisite. |
| B3 | [prepare](../../../image-loader/app/controllers/ImageLoaderController.scala#L273) assigns a one-hour expiry; [updateStatus](../../../image-loader/app/lib/UploadStatusTable.scala#L27) changes status/error only. [Terminal update code](../../../image-loader/app/controllers/ImageLoaderController.scala#L485) already notes possible expired rows. | Review expiry extension/terminal retention if an actual processing/recovery case is harmed. Never treat status absence as proof of transfer failure or permission to replay. |
| B4 | [Status update error helpers](../../../image-loader/app/controllers/ImageLoaderController.scala#L461) construct failed futures in `Unit` helpers; the failure is not returned through the mapped result. | A small focused error-propagation repair may be worthwhile with an existing failure witness. It requires backend permission and is not a reason to redesign ingestion. |
| B5 | [Prepare request parsing](../../../image-loader/app/controllers/ImageLoaderController.scala#L277) uses `asJson.get.as[Map[String, String]]` and does not define a submission contract beyond that map. | Typed input validation and useful client errors may be a small follow-up. Any count/body limits need actual resource/compatibility justification, not the guessed 250-500 batch size. |
| B6 | [GRID-018](bug-backlog.md#grid-018) already records a dynamic metadata mapping conflict that can prevent search visibility after transfer. | Keep the finding in its owning backlog; agree containment/rollout evidence. A longer client spinner is not a fix, and no automatic migration/reindex project follows. |
| B7 | [Collections identity](../../../common-lib/src/main/scala/com/gu/mediaservice/model/Collection.scala#L11) is the path; [membership](../../../collections/app/store/ImageCollectionsStore.scala#L17) copies records per image. No private batch identity/ACL follows from a user-named path. **U0b operator opportunity:** permanent batches and a way to navigate back to them; local tab descriptors deliberately cannot promise this. | **Deferred hypothesis:** an additive Kupua batch/set service could provide stable references, ownership and membership for navigation, later sharing or clipboard-like sets. Benefit: recover a batch beyond one tab without confusing recent uploads with submission history. Cost/risk: authorization, retention/deletion, privacy, synchronization and service ownership; a permanent reference does not make transfers/drafts resumable. Trigger: operator selects durable-batch requirements after working local Upload demonstrates the need. Keep the local resolver separate from image reads/commands now; do not prebuild a universal set abstraction or repurpose Collections. Prefer additive support; a small shared change needs substantial evidence/shared benefit, and a larger redesign remains deferred. |

### Refactoring and Frontend Opportunities

| ID | Evidence and opportunity | Boundary |
| --- | --- | --- |
| R1 | The shared Grid/Table/detail/scroll consumers previously knew `/search` directly, and URL-level `ids=""` was dropped as unrestricted. | **U1 implementation:** a narrow [browsing context](../../src/lib/browsing-context.tsx), typed internal membership scope, fail-closed empty admission and route-aware shared consumers remove the coupling needed here. Upload is API-only; the direct-ES adapter is unchanged. Library CSV share links remain supported; batch IDs never become CSV browser URLs. Wider router/store cleanup remains deferred; no universal workspace framework or direct-ES Upload parity work. |
| R2 | [MetadataTextEditor](../../src/components/MetadataTextEditor.tsx#L86) combines draft state, intent preparation and rendering; single/multi/form consumers need some common behaviour. | U2/U5 may extract the necessary controlled field/draft boundary. Do not rewrite all metadata presentation or unify unlike command families just for symmetry. |
| R3 | [Service discovery comments](../../src/dal/grid-api/service-discovery.ts) still describe old hybrid/proxy/graceful-absence assumptions, while the [current API contract](../../src/dal/grid-api/README.md) says otherwise. | Correct stale comments when touching that boundary; do not change working transport policy to match obsolete commentary or use this as a broad documentation-cleanup task. |
| R4 | Composed tests each build their own media-api stand-in that maps request bodies back to `SearchParams` ([search-store-api-mode](../../src/stores/search-store-api-mode.test.ts#L66), [ImageDetail](../../src/components/ImageDetail.test.tsx#L1712)); UB8's wire change had to be repeated in each. | Extract one shared test stand-in before U1/U4 add more. Test-only; no production change. |
| R5 | Recorded mapper bodies replayed in Scala caught UB8's shape change immediately. | Discipline, not code: every new or reshaped POST field gets a mapper-recorded body and Scala replay, never a hand-written body. |
| R6 | Justified's total-row invalidation and [indexed estimated-block construction](../../src/lib/windowed-justified-layout.ts) scale with result extent. U2-proto's deterministic dependency probe established this, not measured frame-time harm. | **Resolved for measured forms** by [bounded spans](../../src/lib/windowed-measured-layout.ts) after operator approval. Reducing Justified's indexed relayout work could help, but changing its packing/navigation representation is higher-risk work. Pursue only if a profile attributes material cost to that construction; the unequal-throughput U2 comparison is not that evidence. No automatic Justified rewrite. |
| R7 | [exerciseBulkEditor](../../e2e/local/grid-mutations.spec.ts#L1707) expected `[superseded, observed]` but received `[observed, observed]`, first locally and later compiled-hosted. The isolated tracked-source control failed earlier at [exerciseObservedEditor](../../e2e/local/grid-mutations.spec.ts#L1569), not the same assertion. The selected follow-up passed both command cases, both owning specs (75 cases) and a fresh full suite (596 cases), without retries or a product fix. | Retain as an unexplained intermittent, not a currently reproduced defect or claimed repair. A new assertion verifies observation is pending before releasing the held request; it does not weaken the expected receipt pair. If this recurs, distinguish an ineffective request hold from publication/read ordering using that invariant. No inheritance or U2 causality is established. |
| R8 | An earlier full run's mobile double-tap case failed during [module interception](../../e2e/local/selections-mobile.spec.ts#L39) with `route.fetch: read ECONNRESET`; app startup then lacked its store. It subsequently passed unchanged in isolation, the selected two-spec investigation and the fresh 596-case full run, all without retries. | Retain as an unexplained fixture/server transport intermittent; investigate module-request lifetime if it recurs. The latest full gate is green, but no causal repair is claimed. This is not evidence of a gesture regression or permission to add retries, weaken readiness assertions, or alter product transport behavior. |
| R9 | The prototype deliberately reuses [ImageGrid's lifecycle](../../src/components/ImageGrid.tsx#L528), but `justified` now also means measured cells, with explicit exclusions in [zoom subscription](../../src/components/ImageGrid.tsx#L649) and [gesture setup](../../src/components/ImageGrid.tsx#L940), plus form-specific rendering branches. Shared browsing ownership and thumbnail-specific policies still live in one component. | Before U2 adds real form rendering, separate only the necessary layout/cell/gesture policies from the existing browsing host. Benefit: new form behavior need not inherit or bypass thumbnail-only behavior, without copying the lifecycle. Moderate-to-high regression risk across density, selection, navigation and media admission; retain their witnesses. Coordinate with R1's route adapter, but do not create a new engine/store factory or refactor unrelated Grid rendering now. |
| R10 | [Measured geometry](../../src/lib/windowed-measured-layout.ts#L53) maps items to bounded virtual rows, while its [spatial interface](../../src/lib/windowed-measured-layout.ts#L77) uses logical item rows. Both return `LayoutRow` with a numeric `index`; [navigation's `virtualizerCount`](../../src/hooks/useListNavigation.ts#L71) is also named/documented as a row count although callers supply the logical item extent. Confusing these domains caused the indexed boundary-arrow defect fixed in U2-proto. | Before grouped/side-by-side forms or another geometry consumer, name and document logical items, spatial rows and virtual rows explicitly at the adapter boundary; use distinguishing types where they prevent this demonstrated mismatch. Benefit: fewer accidental whole-span scroll targets and count errors. Moderate cross-consumer cost; preserve the boundary-arrow and tall-page witnesses. No universal coordinate-branding project or change to history/anchor policy. |
| R11 | The [research transforms](../../e2e-perf/research/density-app-research.spec.ts#L222) require literal import text, and [row/cell-key transforms](../../e2e-perf/research/density-app-research.spec.ts#L235) require exact source substrings and occurrence counts. U2 integration had to preserve those source shapes even though they are not application behavior. | When those experiments are next maintained, replace the relevant fragile text rewrites with a test-only AST transform or an existing explicit hook. Benefit: behavior-preserving production edits need not preserve incidental spelling/import layout for research. Moderate validation cost and risk of changing what an experiment measures; retain fail-closed checks and controlled variants. No new hot-path instrumentation, dependency or wholesale research-framework rewrite merely for this prototype. |
| R12 | **Operator report, U0b:** scrolling down while files are uploading loses orientation about remaining activity; even an experienced user cannot confidently predict which processing files an arrow will affect. **Source:** [job list](../../../kahuna/public/js/upload/jobs/upload-jobs.html#L1) puts the remaining count at the section heading and creates editors only after images arrive; [metadata arrows](../../../kahuna/public/js/upload/jobs/required-metadata-editor.js#L106) reach existing editable recipients, not future arrivals. This is not a new live-upload witness. | **Selected interaction for U4/U5:** keep a compact batch summary visible during editing, with expandable file outcomes and explicit arrow scope. Benefit: orientation without repeatedly returning to the top and fewer unnoticed omissions. Cost/risk: scarce phone space, accessible status updates and separation of files, unique images and edit outcomes. Validate against working desktop/compact controls, not another geometry campaign. **Deferred hypothesis:** an in-app completion/attention notice could let users return from search when needed. Keep route-independent jobs/outcomes now; select notification presentation after the first working round trip. No browser/system notification permission or background-upload guarantee follows. |
| R13 | **U0b source fact:** pending files have no current editor and do not inherit a metadata-arrow click. **Decision:** first-version arrows capture known canonical images with explicit exclusions. **Operator priority:** familiar parity before speculative improvements. | **Deferred hypothesis:** explicitly retaining an operation for the original batch's processing files could prevent a second manual application and omissions. Cost/risk: repeated arrows, intervening per-image edits, duplicate attempts, failed ingestion, changed authority and cancellation/reload semantics; never silently overwrite newer intent or auto-replay uncertain saves. Trigger: working Upload shows this omission is materially costly and the operator selects those semantics. Keep file-attempt identity, canonical membership and captured command intent separate now; do not build a pending-edit queue, automatic catch-up or template engine in advance. |
| R14 | **Operator ambition, not a measured failure in U0b:** robust uploads of large files, many files, or both, and recovery without losing trust. Existing transport/status limitations are recorded in B2/B3/B6 and C1/C4; splitting batches after failures is coping behaviour, not evidence of a preferred small workload. | **Deferred improvements selected by evidence:** clearer recovery/reconciliation and, only if justified, stronger transport support. Benefit: less repeated work and fewer lost outcomes. Cost/risk: browser memory/lifecycle limits, uncertain server outcomes and compatibility across loader/signed storage; no safe-resume or exactly-once guarantee exists merely from a local job record. Trigger: a separately authorized representative workflow demonstrates a specific bottleneck/failure or the operator selects a bounded investigation. Preserve independent jobs, separate phase/edit outcomes and bounded client resources now; do not invent a batch cap, resumable-upload subsystem or autonomous performance campaign. Backend amendments follow Section 7's additive-first policy and their owning register. |
| R15 | **U0b operator opportunity:** a panel for navigating batches, permanence and eventual selection operations. The operator notes that a batch is conceptually a selection, but explicitly rejects immediate material changes from that analogy. Current/recent/retained scopes and short local references are already distinct contracts. | **Deferred hypothesis:** a batch navigator, per-batch position/refinement recall and later selection editing could make revisiting work easier. Cost/risk: panel competition with form content, phone space, retention policy and misleading expectations of durable/shared history; permanence separately depends on B7. Trigger: evaluate real repeated-batch use after U4, then select the navigation/selection surface. Keep the descriptor/resolver and explicit command targets independent of the active view now. Use the small selector initially; no Places sidebar, generalized workspace system or batch/selection-store merger. |
| R16 | **Settled architecture plus U0b operator opportunity:** the image-and-fields layout is a genuine density, initially exposed only in Upload. Existing browsing, detail and metadata consumers already have different contexts; R1/R2/R9 identify the necessary shared boundaries. | **Deferred exposure:** use the density elsewhere in Grid and preserve coherent transitions between search, Upload and detail. Benefit: the same efficient image/metadata work outside a submission batch. Cost/risk: search-scale hydration, permissions, unavailable persisted density, competing panels and context-specific applicators. Trigger: working Upload density demonstrates reuse value, then select global exposure. Keep activity/batch controls outside the reusable renderer, shared commands/drafts outside rows and one browsing engine now; no separate Upload app or global rollout in U2. |
| R17 | **Settled U2-proto/field contract plus U0b operator opportunity:** natural variable heights, a global visible-field set and bounded geometry already support layout changes. Desired later controls include zooming and adding/removing visible fields; no particular zoom interaction has been selected. | **Deferred hypotheses:** fewer visible fields or a different form scale/grouping could match different editorial tasks. Benefit: adjust information density without abandoning image context. Cost/risk: hiding essential guidance, preserving focused/dirty fields, grouped-row navigation and mobile legibility; geometry feasibility does not establish real-editor performance. Trigger: select controls after trying real forms. Keep field visibility separate from data/drafts, use layout-sensitive measurements and allow one or more forms per row at the boundary. Do not implement toggles/zoom now, reopen U2's proof or promise every layout is already validated. |
| R18 | **U1 source constraint, not a measured quota failure:** [scope fingerprints](../../src/lib/image-offset-cache.ts) include immutable membership and revision, and [history storage](../../src/lib/history-snapshot.ts) retains those fingerprints per entry. Short browser URLs therefore do not imply small stored snapshots; membership can be repeated across retained entries. | **Deferred hypothesis for U4:** budget descriptor and history storage together, potentially qualifying snapshots through a lightweight membership reference rather than repeating IDs. Benefit: retain useful batch/navigation history with less storage pressure and explicit storage-failure feedback. Cost/risk: revision lookup, reload availability, isolation and existing cursor qualification; do not weaken identity checks or silently evict active work. Trigger: select U4's descriptor/storage budget and use representative retained batches. No demonstrated overflow, hash dependency, new persistence subsystem or U1 gate is claimed. |
| R19 | **U1 observed lifecycle constraint:** moving [URL synchronization](../../src/hooks/useUrlSearchSync.ts) into the parent route broke all eight existing direct-Forward detail history cases; restoring a first-child synchronization owner made those cases pass unchanged. Existing [return](../../src/hooks/useReturnFromDetail.ts) and placement effects depend on this ordering. | **Deferred refactoring hypothesis:** make this admission-before-consumer boundary explicit if the route/detail effect structure is reorganized again. Benefit: a presentation move need not accidentally change navigation settlement. Cost/risk: lifecycle coordination across history, continuity, detail and layout, with meaningful regression risk; retain the existing direct-detail assertions. Trigger: another required route/detail ownership change demonstrates that the documented first-child boundary is insufficient. No history-policy rewrite or new navigation engine is authorized by this finding. |

## 9. Completion Report

Close the feature with the parity checklist, selected deployment topology,
operator-reviewed UX, retained regression evidence, known limits and deferred
opportunities. Explicitly separate actual upload/edit evidence from mocks and
read-only browser exploration. Reset the session worklog before staging; do not
commit without permission. Update owning mechanics guides and the changelog for
implemented code, not with planning/session narratives.

The finished implementation should be recognizably one Kupua browsing/editor
experience with an Upload context, not two applications sharing a stylesheet.