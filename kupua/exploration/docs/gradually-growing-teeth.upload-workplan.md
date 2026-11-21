# Upload: Reusable Density and Local Working Sets

**Status, 20 November:** U5 metadata editing is implemented: required-field
editing, captured batch arrows, and upload follow-ups. Batch arrows use inset
Sync Alt controls and show progress in place, including queued work. Batch
details stay on demand; the upload counters remain unchanged. Routine automatic
follow-ups are quiet in Activity, with problems expandable per file. A visible
value does not acknowledge a lost write response: an uncertain arrow keeps its
attention details and does not replay on inspection. An active arrow alone protects
against accidental reload. Upload Activity remains separate from Search edit progress.
See the
[performance summary](editing-performance-evidence.md#executive-summary-20-november).

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
  detail and crop navigation. Show one open batch above all other uploads on the
  same page, under [U4.5](#u45-unified-upload-page-and-navigation). Omit Upload
  selection UI and its metadata panel initially; batch arrows provide the required
  whole-batch application, not subset editing.
  Preserve reuse of selection/panel capabilities later without building them now.
  Initially there is no general CQL search bar or Filters facets.
  Facets-as-selection is a later interaction, not part of this build.
- Entering Upload does not inherit the departing query, date filters, free-only
  filter, frozen arrival boundary or unrelated selection as mutation targets.
  Returning to search restores its represented position through existing history
  mechanisms. This is not a general multi-workspace system.
- A file-picker submission or drop creates an explicit local batch. Multiple
  submissions are never appended to an existing batch or merged. Upload activity, image membership and
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

The following defines the required behavior for the selected units, including
[U4.5](#u45-unified-upload-page-and-navigation). Unit Status records what is actually
implemented; the geometry proof alone is not Upload interaction acceptance.

- Show five recent batches in the Upload chooser, plus outstanding work and the
  selected older batch. Earlier batches expands access to every retained batch.
  The selector limit is not automatic deletion of older membership records.
  Retain lightweight descriptors for the tab session subject to a documented
  storage budget; active jobs and unsaved work are never silently evicted.
- Fresh entry through My recent uploads or plain `/upload` shows the top of the
  combined page with the newest retained batch selected, without detail/crop.
  Explicit batch references address that upper batch; the lower section contains
  all other current-user uploads, excluding its canonical members. U4.5 owns
  section origin, detail/crop and history qualification.
- A missing local batch produces an unavailable state with explicit alternatives,
  not substitution of the latest batch or a library-wide search.
- Switching batches may initially reset refinement/position. This does not waive
  density preservation or draft retention. History, inspection return and reload
  retain their addressed batch/section/place; the main doorway deliberately starts
  at the newest batch. Back to search restores the departing library search.
- Arrows in current or retained batches capture known canonical image targets
  from the open upper Form section and show their count, including offscreen members.
  Other uploads and detail/fullscreen/crop have no batch arrows. Processing files without
  canonical images are explicitly excluded in the first version; no instruction
  is silently queued for their later arrival. Recent uploads are not a batch.
  No arrow targets all uploads or all search results; viewport residency never
  defines membership. See the U0b record for exclusions and feedback.

## 2. Evidence and Remaining Uncertainty

**U0a baseline, 13 November:** the source and "missing" statements in this section
describe the initial survey, not today's implementation; use
[current parity status](#current-parity-status) and [unit status](#unit-status)
for subsequent work and trial evidence. This research read source and existing documentation. Earlier browser
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
| C1 | TEST loader size/transcode settings; bucket CORS for permitted page origin, PUT and metadata header; credentialed loader preflight/auth redirects; effective hosted CSP. Page-selected transport/limit alone cannot prove these. | **Partially witnessed in U3:** one deployed TEST signed upload succeeded under inherited policy; laptop-to-TEST storage CORS is blocked. Loader/transcode and other deployment/auth cases remain unverified. Further live checks require separate authorization and sanitized evidence. |
| C2 | PROD topology/limit/types and hosting/rollout permission. Only template-off operator report exists. | Before PROD work, not a TEST prototype gate. Do not infer PROD from TEST or widen stage admission. |
| C3 | One representative TEST rights category and its expected metadata/category-lease effects; writable catalogue and saves not exercised. | Select for U6a: after choosing rights, which credit/instructions/leases change and how does partial completion look? Priority is known; exact configured example remains to select using the existing handlers below. |
| C4 | GRID-018 rollout containment and owning roadmap delete/restore lifecycle disposition. | The authorized bounded U3 TEST ingestion trial occurred; it is not broad rollout acceptance. Before broad upload/destructive activation, decide remaining containment and lifecycle limits. The newer XMP retry is on direct insertion, not ordinary ingestion; see [GRID-018](bug-backlog.md#grid-018) and [Step 17](gradually-growing-teeth.kupua-edits-steps.md#step-17-soft-delete-and-restore). Neither is a U5 metadata gate. |
| C5 | **Resolved by U0b:** mixed activity, editing and navigation. | Compact persistent batch summary with expandable file outcomes; real images alone enter the density. Input interaction edits without opening detail. Omit Upload selection UI and its redundant metadata panel initially; retain explicit image/detail/crop entry and a one-column phone form. Mixed/delayed desktop/compact witnesses are **planned**, not performed. See [U0b workflows](#u0b-interaction-decision-record). |
| C6 | **Resolved by U0b:** efficient saves, guidance and arrow scope. | Ordinary fields save after a short pause/on leaving the field; rights/leases keep explicit saves and separate substep outcomes. Preserve essential guidance beyond server validity. Arrows capture the batch, field value and known canonical targets, including offscreen images, with explicit pending/unavailable/denied exclusions. No pending-arrival intent in the first version; later drops/recent uploads never join. Retain drafts/receipts and acknowledge uncertainty, not automatic replay. Browser/command witnesses remain **planned**. |
| C7 | **Resolved:** one open retained/current batch above all other uploads, with distinct editing and navigation origins. | U4.5 owns the combined page and entry/return table. History, inspection return and reload preserve the addressed batch/section/place; My recent uploads enters at the newest batch and top. Jobs, outcomes and in-memory drafts outlive navigation. The lower query has no batch arrows. Missing links never substitute another batch. Durable batches and selection features remain deferred. |

**Settled:** picker/drop, no URL importer; TEST first/PROD later; preset labels
required; domain editors excluded; metadata templates deferred, not removed from
the future command-composition path. U2-proto stays complete. U0b settled C5-C7
through operator-reviewed workflows, not a repeat audit or campaign. No
interaction demonstration is implied by that decision closure.

## 3. Parity Checklist

### Current parity status

This is the current crosswalk, not final U8 acceptance. **Done locally** means the
named implementation and recorded local/fixture witnesses exist; it is not a claim
of physical-phone, all-deployment or end-to-end editorial acceptance. See the linked
unit checkpoints for exact validation and live-trial limits.

| Row | Current status | Remaining work or limit |
| --- | --- | --- |
| P01 | **Done locally:** API-only route, permission-aware picker/drop and independent batches (U1/U4). | Final integrated workflow and deployment acceptance remain U8. URL import excluded. |
| P02 | **Done locally:** configured size admission and distinct processing failures (U3/U4). | Actual loader/deployment limits and wider inputs still need applicable acceptance; no invented MIME or batch cap. |
| P03 | **Done at representative scope:** direct/signed fixture contracts, local ingestion and one deployed TEST signed upload (U3). | Laptop-to-TEST storage CORS remains blocked; broader topology and rollout acceptance are separate. GRID-024's rejected QUEUED receipt is not an acknowledgement. |
| P04 | **Done locally:** route-independent jobs, activity, outcomes and interruption handling (U3/U4). | No durable transfer resume; complete integrated acceptance remains U8. |
| P05 | **Done locally:** authenticated lower-section browsing and Search link (U4/U4.5). | The explicit Search URL contains the current uploader identity by operator decision; Upload does not persist or log that identity. Final deployment acceptance remains U8. |
| P06 | **Done locally:** attempt identity, canonical deduplication and submitted-filename ordering (U3/U4/U4.5). | Server isolation for concurrent same-name submissions is not established; batch editing deduplication remains U5-U7. |
| P07 | **Not connected:** label add/remove exists for Search/detail, but not automatic Upload follow-ups. | U5: filename-description fallback and captured preset labels, with separate outcomes. |
| P08 | **Partial:** Form has retained direct-entry text/date/location drafts, required-input borders and editorial guidance; Search/detail retain their separate explicit preparation controls. | U5 and Step 8: shared ordinary-metadata commands, authoritative merge, save/readback and outcomes. Domain editors are excluded from Upload. |
| P09 | **Not connected:** U4.5 establishes explicit upper-batch ownership. | U5-U7: captured, offscreen-capable batch arrows and accessible exclusions; no lower-section or later-arrival targets. |
| P10 | **Not connected:** rights and lease facts/display exist. | U6a/U6b: authorized commands, side effects, readback and partial outcomes. |
| P11 | **Deferred by operator:** templates are not a current Upload acceptance gate. | U6c only if separately selected; not a passed feature. |
| P12 | **Partial:** labels are connected in Search/detail; Form list plus/add/remove controls and other panel controls prepare unsent intent. | U7: Upload targeting and connected keywords, collection membership and photoshoot operations. |
| P13 | **Partial:** per-attempt outcomes and deduplicated canonical membership exist. | U7/Step 17: authorized deletion/restore, duplicate eligibility and lifecycle handling. No automatic restore or re-upload. |
| P14 | **Partial:** batch-aware detail/crop return and disconnected crop eligibility/notices are implemented. | U7/Steps 7 and 13: archive and actual crop creation/readback. |
| P15 | **Done locally at bounded recovery scope:** retained descriptors, interrupted/uncertain outcomes and read-only Recheck (U3/U4). | No durable draft/transfer recovery or automatic replay; real expiry/login-return acceptance remains separate. |

The [unit status](#unit-status) is the execution sequence; the detailed U3/U4/U4.5
checkpoints record which witnesses actually ran. Required unfinished rows block U8
unless the operator changes scope. U0a's original source survey below is retained for
the Kahuna handlers and planned witnesses; its Kupua state and "planned" labels are
**historical, 13 November**, not the current completion record above. Handler details
following it qualify shorthand such as Save, apply and replace.

<details>
<summary>U0a original parity and witness baseline (historical)</summary>

| ID | Applicability; current Kahuna owner | Kupua owner; connected / missing | Behavioural witness |
| --- | --- | --- | --- |
| P01 | **Required.** [Search entry](../../../kahuna/public/js/search/view.html#L19), [Upload entry](../../../kahuna/public/js/upload/view.html#L11), [picker](../../../kahuna/public/js/upload/file-uploader.js#L20), [drop](../../../kahuna/public/js/upload/dnd-uploader.js#L84): permission-aware file submission; Grid image drags excluded. URL import excluded. | U1/U4: [search route](../../src/routes/search.tsx), [URL sync](../../src/hooks/useUrlSearchSync.ts), future Upload admission. No connected Upload route/picker/drop. Existing filters/selection must not define batch mutation scope. | Existing [entry specification](../../../e2e-tests/features/upload.feature#L14); **planned:** deep filtered search -> picker/drop -> independent batch -> restore search place. Internal drag makes no upload. |
| P02 | **Required.** [Manager](../../../kahuna/public/js/upload/manager.js#L27) skips above-limit files; [content detection](../../../image-loader/app/model/Uploader.scala#L406) / [error UI](../../../kahuna/public/js/upload/jobs/upload-jobs.js#L153) reject unsupported content. TEST page limit known, loader settings unchecked. | U3/U4: [site settings](../../src/lib/site-settings.ts#L17), [hosted config](../../src/lib/hosted-config.ts#L7), future admission. No size/type/rejection path. | Existing [size-limit specification](../../../e2e-tests/features/upload.feature#L109); **planned:** mixed valid/oversized/unsupported files retain distinct outcomes; valid files proceed, no whole-batch disappearance or invented cap. |
| P03 | **Required.** TEST selects signed transport. [Manager](../../../kahuna/public/js/upload/manager.js#L40), [loader client](../../../kahuna/public/js/services/api/loader.js#L18), [prepare](../../../image-loader/app/controllers/ImageLoaderController.scala#L273), [status](../../../image-loader/app/controllers/UploadStatusController.scala#L22) connect both source contracts. | U3: [discovery](../../src/lib/grid-api-instance.ts#L53), [targets](../../src/dal/grid-api/proxy-target.ts#L1), [guards](../../src/lib/grid-mutation-policy.ts#L28) need loader admission; no ingestion command. | **Planned:** isolated signed prepare/PUT/queued/status success and failures plus alternate service contract; separately authorized real TEST ingest -> canonical image. Loaded config is not a transport pass. |
| P04 | **Required lifecycle progress**, not byte percentages. [Jobs](../../../kahuna/public/js/upload/jobs/upload-jobs.js#L46) own stages/failures; [controller](../../../kahuna/public/js/upload/controller.js#L19) guards navigation/unload. | U3 independent jobs + U4 activity display. Existing [batch execution](../../src/lib/batch-execution.ts) schedules labels, not upload jobs. No route-independent upload observation/recovery owner. | Existing [leave warning](../../../e2e-tests/features/upload.feature#L53) / [failure specification](../../../e2e-tests/features/upload.feature#L171); **planned:** held/failed/successful jobs survive density/route changes; one finishing does not discard siblings. |
| P05 | **Required.** [Current jobs](../../../kahuna/public/js/upload/jobs/upload-jobs.html#L1), [recent query](../../../kahuna/public/js/upload/recent/recent-uploads.js#L22), [all uploads link](../../../kahuna/public/js/upload/view.html#L22). Kahuna shows its newest 50 current-human-uploader images, not status history or a batch. | U4/U4.5: the narrow [session identity](../../src/lib/grid-api-instance.ts) and [read builder](../../src/dal/grid-api-search-adapter.ts) supply the uploader query. U4.5 shows all other uploads below the open batch with bounded browsing, plus an identity-private View all your uploads link to ordinary Search. No 50-image acceptance limit or new server batch endpoint. | Existing [all uploads specification](../../../e2e-tests/features/upload.feature#L48); **planned:** lower browsing beyond 50, older batch exclusion and Search entry, useful uploads after local history loss, unavailable identity never widens query, reauthentication cannot reuse old identity/authority. |
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

</details>

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

Section identity and ordering are explicit in the combined Upload page; one query's
ordinals or visible rows must not stand in for the other section's navigation or
editing scope. Apply U4.5's fresh-entry versus history/inspection-return policy.

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
| U3 | representative one-file ingestion/job checks complete 14 November: local hosted/Vite and deployed TEST succeeded with readable/indexed canonical identity; processing completed on Search; laptop-to-TEST remains blocked by storage CORS; broader batch/editor/recovery work remains separate |
| U4 | complete locally 14 November: multi-file entry, retained/recent navigation and explicit recovery over one engine; final full unit/E2E/build/type gates pass; no U2/U5 or durable/server-side batch guarantee |
| U2 | complete locally 14 November: real Upload Form density, sparse retained drafts and passive-arrival integration; cold-review repairs and final full gates pass; no new saves, live-upload or real-editor performance claim |
| Post-U2 UI polish | implemented locally 15 November: toolbar/activity presentation, Kahuna-like Form proportions and upload-access gating; cold-review repairs and final full gates pass; operator visual acceptance remains separate, U5 and R27 are not started |
| U4.5 | implemented and independently reviewed 15 November: unified batch-plus-all-other-uploads page, retained-batch discovery and explicit entry/return navigation; local validation closed with the operator-approved KUP-053 E2E exception; U5 remains separate |
| Pre-U5 Form presentation | implemented 18 November: Upload-specific field recipe, editorial guidance, preparation-only list controls, direct-entry date/location drafts and condensed file facts; Details unchanged and U5 saves/arrows remain disconnected; mechanics in the Form component reference |
| U5-U8 | U5 shared scheduling/policy foundation implemented 18 November; metadata commands, autosave, arrows and upload follow-ups remain unimplemented. U6-U8 not started. U5 overlaps ordinary editing Step 8; domain editors remain excluded and U6c templates deferred. |

**U3's representative local and deployed TEST ingestion checks have passed.**
The deployed trial used the inherited hosting policy and existing TEST storage
CORS; it required no shared policy change. Laptop-to-TEST remains a separate,
blocked topology, not an alternative acceptance gate. See U3's evidence and
limits below; this is not broad editorial rollout or durable-recovery approval.
The Unit Status table and execution order below identify current work; passing
ingestion checks does not automatically start another unit.

**Next candidate:** U5 together with the ordinary-metadata portion of
[editing Step 8](gradually-growing-teeth.kupua-edits-steps.md#step-8-editable-metadata-including-configured-domain-fields),
then the required U6a/U6b and U7 families, followed by U8 acceptance. U3, U4,
U2 and U4.5 are already implemented at the scopes above. Reuse U2-proto's geometry
and existing label/publication foundation rather than repeating their proofs.
U6c templates and Step 8's configured-domain editors remain outside Upload's selected scope.
Each unit still requires separate selection; no product work starts automatically.

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
| Apply a field to the batch | Put frequent per-field arrows only in the open upper Form section, without a confirmation dialog for every ordinary application. Capture that batch, value/action and known canonical targets at the click, including offscreen members and deduplicating IDs. Show counts and processing/unavailable/denied exclusions without hover. Other uploads, other batches and Search selection are never implicit targets; detail/fullscreen/crop have no batch arrows. Later arrivals/drops cannot expand the operation. Preserve existing destructive-clear confirmations and family-specific semantics. | U4.5 supplies section provenance; U5/U6/U7 connect commands. P09/P10/P12 witnesses cover scope, delayed arrival, duplicates and partial outcomes. No pending-arrival instruction queue. |
| Understand the mixed-batch arrow | Example: 12 files, eight ready images including the source, three processing and one rejected. Assuming the seven other images are editable, show an application to those **seven other images**, with **three processing excluded** and **one rejected file**, while the source's own save has its own result. Later arrival does not imply a saved value. The operator may deliberately apply again with newly displayed counts; unknown earlier outcomes must remain visible, never trigger automatic replay or look like success. | C6 resolved as known-image scope. A future explicit apply-on-arrival option is R13, not a current hidden promise. This example was discussed, not executed. |
| Choose rights or leases | Keep deliberate Save/Apply for multi-step rights and lease edits; category/lease side effects and partial completion remain visible. Do not autosave a half-completed rights choice or label a partially completed composite Saved. Preserve configured requirements and server authority. | U6a/U6b; P10. C3 still selects the representative configured category at implementation; no new general rights audit. Templates remain deferred. |
| Open an image or crop | Inputs and their keyboard gestures edit without opening the image. Use an explicit image/detail entry and the existing permitted crop entry, with return to the same batch/place. Do not render a redundant single-image metadata panel beside a form that already contains those fields. Existing detail/crop surfaces remain available, with their own capability and disconnected-operation limits. | U1/U2/U7; P14. Detail/crop round trip and text-entry witnesses remain planned; no crop submission demonstrated. |
| Select images | **Operator amendment:** omit Upload selection UI and its metadata panel initially. Selection becomes useful when an intentional apply-to-selection surface exists. A batch can be thought of as a selection and arrows as applicators, but that is a product analogy, not approval to unify stores or turn batch membership into the current search selection. Preserve existing search selection behaviour. | U1/U2/U4. No new Upload checkbox/selection-panel acceptance requirement. Future selection remains possible through explicit command targets, not advance UI or a general set framework. |
| Switch contexts | Keep one open current/retained batch above all other uploads. Choosing another batch replaces only the upper group and changes the lower exclusion; it never combines edit targets. Five quick choices plus outstanding/selected work and Earlier batches reach all retained records. Switching may reset that batch's view, not drafts/jobs/outcomes. | U4.5; P05/P09/P15. No larger navigation panel, selection UI, batch merging or per-batch view-recall system. Missing/empty upper scope never becomes an unrestricted batch query. |
| Leave Upload, then return | Allow safe in-app navigation without a blanket leave warning. Back to search restores the departing search place. My recent uploads enters at the newest retained batch/top with no detail; browser history, inspection return and reload retain their addressed batch/section/place. Jobs, outcomes and in-memory drafts remain independent of the view. | U4.5 entry/return table; P04/P15. Distinguish fresh entry from return in fixtures while jobs settle. Do not require a completion-notification subsystem or promise durable drafts. |
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

**Still separately owned:** C1's remaining deployment/transport checks (the bounded
U3 TEST trial has since passed); C2 eventual PROD permission/configuration; C3 the U6a
configured rights example; C4 lifecycle/GRID-018 disposition. UB8/B9/B10 stay done; B11/B12 stay explicit low-priority
backend decisions. No U0b workflow established another ordered-read API gap.
Required editing families still gate final parity. Follow the current Unit Status
and U4.5 execution sequence; no new broad audit is needed.

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

#### Implemented U2 Boundary and Limits

Upload now defaults to Form alongside Grid, Table and Justified, with an independent
tab-session preference. Search does not expose Form; Home and cross-context return
retain destination preferences. The renderer reuses the measured browsing host and
registry metadata, with natural heights, explicit image/detail entry and one-column
compact presentation. No second image cache, per-form singleton read or browsing
engine was added. The [component guide](00%20Architecture%20and%20philosophy/component-detail.md#form-density-componentsmeasuredgridtsx)
owns the field and measurement mechanics.

Shared controlled text/suggestion inputs edit sparse image/field drafts outside
cells, preserving native selection/IME/Tab and required Description/Credit guidance.
Existing explicit editors keep their preparation workflow. Capability, stale and
unavailable states remain authoritative. Drafts survive density, eviction and in-app
context changes without changing canonical images. They are Not sent and warn before
reload/closure, but are not persisted. Dates, rights, leases, lists and other unconnected
families remain read-only in Form. U5 owns new saving, filename fallback, presets and
batch arrows; U6/U7 and detail/crop retain their separately owned operation limits.

Geometry stays bounded to loaded identities plus estimated head/tail spans. Anchor
election from committed geometry prevents a changed neighbour from stealing field
correction. Integral extents avoid cumulative native-scroll rounding without clipping
content. The focused form and its immediate loaded neighbours preserve native Tab
adjacency without rendering the intervening range. Compensation remains shared.

Authoritative membership/activity still publishes immediately after readable/indexed
admission. Membership-only browsing waits for an in-flight read, then admits the
latest revision without a timer/cache; explicit navigation remains immediate. Passive
continuity preserves active-field/interior position without phantom navigation feedback.
Batch discovery reuses the page's authoritative total rather than also fetching ticker
counts. Per-upload visibility checks, consistent lifecycle eligibility, failures and
stale guards remain; upload concurrency and replay policy are unchanged.

Cold GPT-6.1 Sol reviews identified a Tab skip outside overscan and Home writing
Search density choices into Upload's preference. Both were reproduced in the existing
API journey and repaired. A further source review found no confirmed production defect
but identified weak IME and compact-suggestion witnesses. Strengthened checks cover
Chromium composition spanning held arrivals, both selection endpoints and committed
text, plus touch suggestion choice in a reduced keyboard-sized viewport. This is not
physical-phone/OS-keyboard or cross-browser certification.

**Final validation, 14 November:** full units passed **3,891 tests across 116 files**;
the complete local E2E rerun passed **610/610 with retries disabled**, including all
eleven U2 journeys, compiled-hosted Form/detail return and unchanged visual baselines.
Normal `build`, isolated `build:hosted -- --outDir node_modules/.cache/u2-hosted`,
`typecheck:e2e` and `typecheck:perf` passed. Commands ran sequentially from repo root
with foreground pipefail/tee output and frozen source/configuration. Scoped editor
diagnostics are clean. Desktop compiled-hosted, compact form and reduced-viewport
suggestion captures were reviewed; all media/data in these witnesses is synthetic.

The earlier full unit run exposed a Home race from waking all URL synchronization
on loading changes; completion wake-up was narrowed to actually deferred membership
work. The first full E2E run passed 609/610: its touch-refresh witness expected the
removed redundant count. The fixture's generic page counter also excludes ID-scoped
reads, so the retained assertion observes the actual scoped POST, successful 80-image
settlement, unchanged count traffic and dormant selection. That case and the full
suite then passed without retries. No behavior assertion or geometry tolerance was
weakened. Existing suites gained six units and two composed browser journeys; the
nine prototype geometry journeys now exercise the real renderer rather than duplicate
stand-in coverage. These are current-source gates, not inherited U4 results.

No dependency, backend/transport change, live upload, infrastructure change or
performance workload was used. The prototype comparison remains historical stand-in
evidence. The adapted research driver names the real Form workload separately; it
does not supply a new result or require repeating the campaign.

### Post-U2 UI Polish Checkpoint (15 November 2026)

The operator selected toolbar/activity presentation, a first-pass Kahuna-like Form
layout and hidden Upload entry/drop UI when permission is denied or the startup
upload switch is off. This is separately selected polish, not U5 or final Upload parity.

- Search ends with My recent uploads, a joined status/blue Upload control and Settings;
  labels fit the available toolbar width. Upload uses shared Home/Search navigation,
  batch selection, activity, sort/order and submission controls.
- Activity is a temporary cross-batch round, not history. Attention takes precedence
  over running and completion, individual errors can be acknowledged, and Recheck is
  read-only. All-success activity clears on navigation; old successes do not return
  after reload. Retained batches and submission receipts have independent lifetimes.
  Queued failures remain diagnostics/descriptor facts rather than a receipt-history UI.
- Form has a centered 900px maximum, proportional previews bounded to 256px and aligned
  desktop labels; compact result areas stack naturally. The existing measured host,
  field markers, compensation, drafts and arrival policy remain. R27 sticky previews
  were not selected. Existing fields/controls were not silently removed.
- Permission loading, denial, disabled preference and session-read failure are distinct.
  Refused direct batch/detail routes admit empty membership and an explanation;
  fullscreen images close on session invalidation. UI gating does not replace command
  admission or automatically replay/cancel independently owned work.

Cold independent reviews covered lifecycle/transport/persistence, layout/input/toolbar,
and access/presentation, followed by repair verification. Failing-first witnesses
established quoted-credential leakage, popup keyboard leakage, short-screen Sort
visibility/Tab/reopening defects and retained fullscreen after session loss; these were
repaired. Existing tests also gained decoded portrait geometry and activity-round
replacement witnesses, without another runner or fixture engine. The earlier
unavailable-preview width and delayed-permission remount defects remain covered.

Final frozen-source gates passed: **3,900 unit tests across 117 files**, **611/611 local
E2E with retries disabled**, normal build and E2E/performance typechecks. Compiled-hosted
journeys remain within the full browser gate; no new normal hosted output outside
Kupua was authorised. No live upload, backend/infrastructure change, dependency,
performance campaign, commit or push was made. Current mechanics live in the
[component guide](00%20Architecture%20and%20philosophy/component-detail.md#form-density-componentsmeasuredgridtsx),
[state guide](00%20Architecture%20and%20philosophy/state-management.md#search-and-upload-scope-admission)
and [upload contract](../../src/dal/grid-api/README.md#upload-transport-and-jobs).
Further operator visual judgment and any selected performance checks remain distinct
from these functional gates. U5, sticky previews, duplicate detection and automatic
follow-up edits are not supplied by this checkpoint.

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
uploads** opt-in to the existing Hello, Joshua dialog, following its saved startup
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
or real ingestion transport was implemented by that decision alone. The U3
implementation below now supplies both, with live acceptance still separate.

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

The local-first and selected deployed TEST stages have now passed. The mixed
laptop-to-TEST stage reached a
storage CORS barrier, also reproduced by read-only preflight for the Vite origin;
ordinary Kahuna failed in the operator's mixed setup too. The operator selected
deployed TEST testing rather than changing shared TEST bucket policy to make the
laptop topology work. The resulting one-file deployed trial reached readable and
indexed availability after processing continued on Search. The
[hosting guide](00%20Architecture%20and%20philosophy/09-deployed-via-Kahuna.md#local-and-deployed-upload-boundaries)
owns the topology evidence. An earlier local-hosting storage-CSP experiment was
discarded after deployed TEST succeeded with the inherited policy.

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

#### Implemented U3 Boundary and Limits

[Upload commands](../../src/lib/upload-commands.ts) implement configured octet-stream
load and SHA-1 prepare/signed PUT/QUEUED contracts with central upload admission,
shared session invalidation, exact loader targets and cookie-free storage transfer.
The optional allowlisted `gridConfig.upload` projection supplies transport and byte
limit; missing configuration is unavailable, not fallback. Laptop TEST settings
project those fields without retaining bucket details. The separately approved
Kahuna allowlist now injects the same transport and optional limit for hosted
Kupua; no bucket name, capability or upload opt-in is exposed by that projection.
Local loader routing uses Grid's advertised `loader.media` hostname convention.
Neither the projection nor a local ES index alone verifies upload destinations.
The local development setup adds Kupua's Vite origin to nginx and local ingest
CORS; no shared TEST policy is changed. Active hosting preserves inherited
`connect-src`, which already permits the storage destination in deployed TEST.

[Jobs](../../src/stores/upload-jobs-store.ts) own independent submission/attempt
records, partial receipts, processing and canonical visibility beyond routes/rows.
One transfer/hash and one read observation are active at a time. Files are released
after submission; statuses and IDs, not complete images, remain in job state.
Readable canonical IDs enter U1's revisioned membership, preserving empty refusal
and captured command targets. Same names never merge local attempts; repeated
content may share one canonical member. B2's backend attempt/pending-key isolation
is not repaired or established by the local witnesses.

Missing status can trigger a read of the known image identity, never a mutation.
Processing completion is retained across later visibility checks. Automatic read
observation is bounded to five minutes; failed/missing reads and deadlines retain
uncertainty and explicit read-only reconciliation. Original submission and queued
outcomes survive later image availability. A lost direct-load response without
a status ID cannot be reconstructed or safely replayed. Active work protects
reload/closure, not safe in-app navigation; page interruption aborts owned work,
and late results retain uncertainty rather than reviving jobs.

For [GRID-024](bug-backlog.md#grid-024), an accepted submission's rejected queued
receipt remains visible until verified availability, then becomes collapsed
Upload receipt history alongside Image available. The rejection is retained,
not acknowledged retroactively. Unresolved and failed attempts keep their feedback;
no protocol call, observation cadence or replay policy changes. The browser
presentation witness supplies a representative signed receipt on the existing
direct-upload fixture job; signed transport rejection remains separately covered
by command tests. This is not a backend repair or a new live-upload witness.

Canonical GET is a real-time document read, not proof of search refresh. Completion
also requires a positive exact-ID count through the existing POST read mapper and
transport, with no inherited library filters or second browsing engine. GET and
count share a 15-second deadline; zero remains waiting and failure remains unavailable.
The isolated browser witness keeps membership empty while GET is readable but the
ID is not yet searchable, then releases indexed visibility without replaying bytes.

The existing Hello, Joshua Apply/reload dialog now includes default-off **Allow real
uploads**, independent of editing. A minimal one-file entry on `/upload` and
global [activity](../../src/components/UploadActivity.tsx) reach the existing batch
and image display. This is not U4's full picker/drop/recent/retained navigation or
descriptor persistence, U2's form, or U5-U7's post-upload metadata/preset operations.

Existing isolated fixtures cover direct/signed contracts, gate independence,
failure stages and no replay, same-name/repeated-content outcomes, expired-status
reconciliation, late interruption, reload protection, route-independent arrival
and SPA detail history. Those fixture witnesses remain separate from the actual
upload evidence below. No U4 bulk entry or U5 metadata writes follow from them.

#### Actual Upload Evidence and Deployment Checkpoint

All live trials were individually authorized and used API mode. They did not
authorize further uploads, cleanup deletes, shared policy changes or deployment.

| Topology | Observed result and boundary |
| --- | --- |
| Local Vite, local Grid/ES/LocalStack | Fresh uploads reached canonical readability and exact-ID indexed visibility. Larger-file work continued through processing and visibility after leaving Upload. A known-completed duplicate retained one canonical batch member without increasing the catalogue. Post-workaround duplicate activity kept the rejected queued receipt inspectable beneath Image available. |
| Local Kahuna-hosted Kupua, local Grid/ES/LocalStack | Fresh and intentional duplicate uploads reached the expected image/batch with loaded thumbnails and readable/indexed identity. Larger-file trials established active route-away completion; the later small-file receipt check did not establish active navigation timing by itself. |
| Local hosted Kupua with TEST backing services | Preparation returned 200; separate attempts exposed a document CSP/configuration mismatch and a storage CORS preflight rejection. The CORS failure preceded Search navigation; no queued update followed. Activity retained an uncertain outcome, and the known canonical identity returned 404 when checked. No retry or metadata write was made. |
| Local Vite origin against TEST storage | Read-only storage preflight returned 403 for the required PUT and headers. No Vite-backed TEST file trial was performed; switching frontend alone would not bypass this storage barrier. |
| Deployed TEST without Kupua | Read-only inspection found an explicit TEST ingest S3 origin in Kahuna's enforced CSP; the deployed frontend origin passed the storage preflight. This is prerequisite evidence only, not deployed Kupua upload acceptance or an exact comparison with the stopped local host's effective destination. |
| Deployed TEST Kupua | The operator submitted one 904,837-byte file with uploads enabled and metadata editing off. Preparation and storage PUT returned 200; the queued update returned the known 400. Status advanced from PREPARED to COMPLETED; matching canonical GET returned 200 and the exact-ID count returned one. Processing and visibility completed on Search after the transfer had already been acknowledged on Upload. Activity retained one file/one image and a collapsed rejected queued receipt. No metadata write or automatic retry was observed; the passive observer was removed. No additional storage CSP allowance or TEST CORS change was needed. |

Successful local and deployed TEST signed trials returned prepare/PUT 200 and
queued-update 400.
[GRID-024](bug-backlog.md#grid-024) explains the deferred loader codec-condition
defect; storage notifications still triggered ingestion. The client did not
retroactively acknowledge that receipt. These trials establish representative
one-file workflows, not large-file/mobile certification, broad editorial parity,
safe durable resume or general TEST rollout approval. The deployed trial did not
independently reopen its batch/thumbnail or expand the receipt; those UI witnesses
were established locally. The Search ticker is a separate poller, not proof of
upload success; its completion nudge remains deferred in Followups.

**Validation retained, 14 November 2026:** the latest full units passed (116 files,
3,876 tests). A full retry-free E2E rerun completed normally with all 601 tests
passing across normal, forced-seek and Justified projects, superseding the earlier
interrupted run. That E2E result preceded restoration of the inherited Scala
connection policy and the final Hello, Joshua wording change. All 16 active
hosting tests passed after that policy restoration. After the
wording change, full units and E2E typecheck passed; the three affected browser
selectors were updated without another browser run, as explicitly requested.
Normal and hosted builds passed before the final wording change, including builds
served for the local hosted trials; those local builds are not evidence for a
later merged deployment. The deployed trial independently verified the running
Kupua page, settings, session/loader admission, inherited CSP and actual upload
outcome on TEST. No performance campaign or shared TEST CORS change was made.

The selected deployed ingestion trial now has an explicit successful outcome at
the bounded scope above. Keep further live trials individually authorized;
readable/indexed identity, honest receipts and route ownership remain required.
Failed or uncertain outcomes must stay distinct and never replay automatically.
Temporary local upload-configuration restoration remains an operator check before
returning to all-local ingestion. U4's fuller batch/navigation UI, U5 metadata and
durable recovery are not supplied or accepted by this result.

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

#### Implemented U4 Boundary and Limits

Search and Upload now admit multiple files through permission-aware picker/drop.
Each submission creates a separate local batch; Grid MIME and in-page drag-origin
guards exclude internal image drags. Short references and a small selector separate
batch choice from Search return. Five recent choices are supplemented by outstanding
work and the selected older record; older descriptors are not deleted by that limit.
Persistent activity expands filename-ordered file outcomes, with distinct file and
canonical-image counts, partial failures, duplicates and retained queued receipts.
The existing Grid/Table/Justified/detail/crop engine and first-child synchronization
boundary remain in place. No form or metadata-arrow implementation is implied.

Allowlisted tab-session descriptors retain attempts, names/sizes, canonical/status
IDs, membership revision and lightweight outcomes, not bytes, grants, capabilities,
credentials, authenticated identity or image bodies. Reload restores known members
and marks unfinished attempts interrupted without resuming transfers or observation.
An explicit status check is read-only. Descriptors have a 2 MiB budget and history
has 1 MiB plus its existing 50-entry LRU, using conservative UTF-16 key/JSON byte
accounting. Full membership fingerprints remain; lightweight snapshot references
were not required. Quota/blocked storage retains in-page state, reports limitations
and protects unretained work even after transfer settles. Local-storage retry does
not submit or reconcile uploads. Browser/origin quota can be reached before these
budgets; tab closure/history eviction still has the documented local limits.

My recent uploads is a newest-first authenticated `uploadedBy` library query over
ordinary bounded pages, not submission history or a batch target set. The shared
session exposes separate permission and in-memory human-identity projections.
Identity never enters URLs, descriptor/history keys or development logs. Stable,
identity-free recent-route qualification supports Back/Forward and deep-detail
reload; reads always use the current authenticated query. Missing/invalidated
identity admits an empty unavailable scope. Library selection remains dormant in
both Upload scopes. UUID minting reuses the existing HTTP-LAN-safe fallback.

Submitted-filename ordering uses bounded ID-scoped ordered search pages, with
matching count/rank/key qualification and explicit server-sort alternatives.
Raw mget can include lifecycle-excluded images that count/search omit; using those
different memberships could hide a later live member when a buffer appeared full.
The client now shares search qualification without changing POST contracts or
rewriting retained membership. Missing members remain distinct from failed reads.

Three independent cold reviews covered recovery/storage, ordered browsing, and
entry/recent/navigation. The actionable read-qualification, identity logging,
UUID availability, dormant-selection and reload-key findings were reproduced in
existing suites and repaired. Recovery review reported no actionable defect;
remaining characterization gaps are not durable-storage or server-isolation claims.
Final validation on the retained source, including the compact selector's readable
minimum width, passed from repository root with foreground pipefail/tee commands.
No suite was interrupted or retried, and source/configuration stayed frozen during
each full run. Existing normal, forced-seek and Justified coverage and visual
baselines remain intact.

| Command | Final outcome |
| --- | --- |
| `npm --prefix kupua test` | 3,885 tests across 116 files pass. |
| `npm --prefix kupua run test:e2e -- --retries=0` | 608/608 pass across all local projects. |
| `npm --prefix kupua run build` | Pass, including application TypeScript. |
| `npm --prefix kupua run build:hosted -- --outDir node_modules/.cache/u4-hosted` | Pass; isolated output stays inside Kupua. |
| `npm --prefix kupua run typecheck:e2e` | Pass. |
| `npm --prefix kupua run typecheck:perf` | Pass; compiler only, no performance workload. |

Existing suites gained representative recovery/storage, identity/privacy and
ordered-read checks, plus composed browser journeys rather than a new test engine.
They cover successive Search/Upload drops, internal-drag exclusion, older retained
links beyond five choices, no replay after reload, explicit quota recovery,
mixed/duplicate/rejected files, filename order, lifecycle-excluded members and the
last live result, recent identity loss, Back/reload, deep-detail traversal and
compact detail/crop return. The compiled-hosted journey uses direct service origins
and no DEV-only globals. Reviewed screenshots show the final hosted desktop and
startup coarse-pointer compact controls; no native-device or cross-browser
certification follows. These automated witnesses are not a live U4 upload trial
or performance campaign. No POST contract, backend, dependency, deployment or
shared policy changed.

#### Subsequent Operator-Run Local Evidence (14 November)

All trials below used the local Kahuna-hosted compiled Kupua with operator-confirmed
local backing services. The operator selected and submitted the files; bounded
passive observers made no extra requests or file reads. Recorded fetch destinations
were local. Timings are sampled workflow boundaries, not controlled benchmarks.

| Trial | Observed outcome and limits |
| --- | --- |
| 150 files, 40,695,429 bytes; no duplicate filenames | All 150 attempts reached available with 150 unique canonical images by approximately 49 seconds after selection; transfers had finished by approximately 14 seconds. Prepare/PUT each returned 150 HTTP 200s. Browsing-request churn is recorded in Section 8. |
| One 98,780,879-byte file, initial attempt | File read/hash and preparation succeeded, but the browser could not read a successful PUT response and reported a CORS error. Kupua retained an uncertain transfer without replay. Localstack's nginx mapping and included server configuration had a 20 MiB body limit, strongly consistent with an oversized-request response hidden by CORS; the actual response status was not captured. No loader-capacity conclusion follows. |
| Explicit resubmission of that file | After a separately authorized temporary localstack-only nginx limit increase to 512 MiB and operator validation/reload, the full-file PUT returned 200. Read/hash took approximately 386/78 ms; the image reached readable/indexed availability by approximately 13 seconds. The grid loaded a 256 by 154 server thumbnail; full-resolution browser rendering was not tested. The earlier uncertain attempt remained separate. |
| Five files, 349,055,229 bytes | All five attempts completed with five unique canonical members, one already known in an earlier batch. Submission preceded fresh instrumentation, so this is an outcome witness with no full-batch timing or concurrency evidence. |
| Twelve files, 701,542,077 bytes, including the previous five | All 12 PUTs returned 200 with maximum one outstanding transfer; all 12 attempts completed with 12 unique canonical members by approximately 55 seconds. Five were previously uploaded images, not new catalogue entries. No transport rejection or automatic replay was observed. |
| Ten potentially problematic files, 95,147,427 bytes | All ten completed by approximately 42 seconds. Their suspected corruption was not established; this is a mixed-input success witness, not evidence of a repaired decoder or failure handling. |
| Eight files, 43,028,271 bytes, including one TXT and one GIF | All eight PUTs returned 200. Six images became readable/indexed; the TXT and GIF retained failed outcomes with "The loader reports processing failed." All attempts were accounted for by approximately eight seconds, with zero still processing and two needing attention. Good files were not blocked; no automatic replay occurred. The generic failure does not establish a specific decoder cause or universal GIF policy. |

Every signed trial retained the known queued-update HTTP 400 separately from
successful storage transfer and later availability. No receipt was retroactively
acknowledged. No observer bookkeeping errors were recorded; owned fetch/digest/
file-read hooks and the comparison's XHR hooks were restored and observer globals
removed after capture. Native image transfers, decoded-memory peaks and backend
queue/CPU were not measured. The weak local loader's capacity does not establish
production thresholds, including for larger editorial files. The 512 MiB proxy
change is local-only: the ignored generated mapping and host configuration changed,
not the tracked template; a successful setup regenerates the original 20 MiB limit.

A separate operator-run local Kahuna comparison selected 151 files (42,717,926
bytes). Its 151 current-upload rows reached ready by approximately 57 seconds and
showed no sampled existing-row movement. The counter also included 50 recent-upload
rows, which were excluded from final batch accounting. Kahuna used one bulk prepare
and up to 151 outstanding PUTs, including browser-queued work, and made additional
image reads and 151 other writes. Automatic metadata behaviour was disclosed.
Different inputs, work and readiness contracts prevent a throughput ranking against
Kupua; Kahuna row readiness was not an independent exact-ID indexed-count witness.

These trials establish representative local success, known-image handling,
transfer uncertainty and partial processing failure. They do not establish
same-name server isolation, durable recovery, native-phone capacity, a new deployed
U4 result or a performance campaign. Loader outage and a stalled byte transfer
were not induced manually; their remaining limits and isolated regression coverage
must not be represented as new live acceptance. No product source changed during
these observations, so the functional gates above remain the retained validation,
not freshly rerun results.

This supplies the U3+U4 ingestion/browsing milestone only. U2 forms and U5-U7
editing remain separate. B2's uploader/filename pending destination and image-keyed
status are unchanged: sequential browser transfer does not serialize backend
processing, and local attempt IDs do not establish server isolation. No stronger
same-name reliability claim follows from the trials. GRID-024 stays deferred;
successful availability never acknowledges its rejected queued receipt. Existing
U3 local/deployed evidence and the deleted unused CSP patch remain separate.

### U4.5. Unified Upload Page and Navigation

**Implemented and independently reviewed.** Current page controls, fresh-arrival following,
jump-only section headings, responsive placement and scrubber presentation are described in
the [Upload component reference](00%20Architecture%20and%20philosophy/component-detail.md#upload-sections-componentsuploadsectionstsx-storesupload-layout-storets).
**Depends on:** U1/U3/U4, U2 and the current post-U2 UI baseline.
**Goal:** a familiar Upload page with one clearly bounded batch above all other
uploads, useful retained-batch access and predictable navigation. Finish this unit
before U5; it connects no new metadata writes or batch arrows.

#### Scope and User Model

The operator has selected **all other uploads through bounded progressive browsing**,
not Kahuna's latest-50 preview. Keep batches: their immediate benefit is preserving
an exact submission group through navigation and reload, independently of a future
server service. This unit is not a permanent-history or cross-device feature.

- Show **one open batch** at the top and **My other uploads** below it. They are
  sibling sections on one page, not mutually exclusive dropdown destinations,
  nested cards, several stacked batches or independently scrolling panes.
- A different batch replaces the upper section and brings that section into view.
  It never appends another group or silently changes an offscreen editing target.
- Keep the upper batch in submitted-filename order by default, with the existing
  supported batch sort choices. Keep the lower section newest-upload-first.
  A batch sort must not reorder the lower section. Label sort controls accordingly.
- One Upload density preference applies to both sections: Form, Grid, Justified
  and Table. Preserve the user's choice on batch changes; on entry always choose Form layout. Search keeps
  its own supported densities; global Form exposure is not selected.
- The lower query is scoped to the current authenticated human, with paid/free
  images included and no inherited library query/date/frozen-arrival constraints.
  Exclude the open batch's canonical members from this lower query so one image
  is not displayed twice on the page. Do not exclude every retained batch.
  With no open batch, show the ordinary current-user uploads query.
- Membership exclusion must affect page reads, counts, keys/ranks and traversal
  consistently. Do not fetch an unbounded query and filter it in the browser or
  silently lose results at page boundaries. Reuse existing read contracts; if a
  necessary backend change is demonstrated, stop for separate permission.
- Keep the section boundary evident in every density. While working within the
  batch, its recognizable heading and image count remain available; when browsing
  other uploads, the section indicator must identify that different scope. Headers
  must not obscure focused fields, suggestions or phone keyboard space.
- Distinguish file-attempt counts, unique canonical membership and currently
  available images. Progress, errors and the transient activity round retain
  their current owners; disappearing successful activity never deletes a batch.

Each separate picker submission/drop creates and opens a **new** batch, including
when performed on Upload. No append-to-current, append-to-past, merge, rename,
manual membership management or automatic application to later arrivals. Pending
and failed files remain activity, never fabricated library images. Opening a new
batch must not discard drafts or stop independently owned jobs in earlier ones.

#### Retained-Batch Chooser

Show five recent batch choices plus outstanding work and the selected older batch.
Provide an **Earlier batches** expansion within this chooser that reaches every
batch still retained in this tab, including in-memory work whose persistence failed.
Five is a quick-access limit, not a retention or editing limit. No separate history
page, Places sidebar, new storage system or server batch object is required.

Use submission date/time, file/image counts and a representative submitted filename
where space permits; do not rely on opaque short IDs as the main label. Distinguish
similar submissions and an older open batch from the newest one. Preserve accessible
names, keyboard operation and usable compact controls without hover-only information.
The URL still uses a short local reference, not filenames, uploader identity or a
serialized ID list. Retain the existing storage budgets and explicit failure states;
do not evict work merely to simplify the chooser.

#### Entry, Return and Search Links

Use the existing `/upload` route. Distinguish the user's navigation action from
the URL alone; reload and history must not accidentally execute the fresh-entry
policy. The executor selects the smallest explicit route/history representation
needed to preserve the page, selected batch, section origin and detail/crop state.

| Action | Required destination and retained state |
| --- | --- |
| My recent uploads button, or a fresh plain `/upload` entry | Top of the combined list, newest retained submission selected, no detail/crop open. Newest means newest submission, not last viewed or last successful batch. With no retained batch, start at other uploads. |
| A new drop/picker submission | Top of the newly created batch, with its independent activity and membership. Do not merge with the previously open batch. |
| Choose an earlier batch | That batch replaces the upper section and is brought into view. Retain all batches' jobs and outcomes.. Per-batch sort/position recall beyond history is not required. |
| Browser Back/Forward | Restore the addressed batch, section, view and represented position, including a historical detail/crop state. Preserve existing browser-specific history limits; do not rewrite global history policy. |
| Back to uploads from detail | Return to the originating batch or other-uploads section and its represented place, even if a newer batch exists. This is a return, not fresh entry. |
| Back to image from crop | Return to the same image and originating section; the next return goes to its Upload list position. Preserve crop draft and existing capability rules. |
| Reload or an explicit batch/detail URL | Honor the addressed batch/section/image, not the latest submission. Restore only supported persisted membership/history; do not claim persisted Form drafts, receipt recovery or transfer resumption. |
| Back to search from the Upload list | Restore the departing library search and represented position without importing batch scope or altering its selection. |
| Grid/Home | Deliberately start the normal default library search. It is not Back and need not resume the previous query. |
| View all your uploads | Open ordinary Search with a fresh current-human uploader filter and paid/free images included. Do not inherit unrelated filters, the open batch or its lower-section exclusion; do not auto-select images. |
| Searchable metadata link within Upload | Open the explicitly requested ordinary library search, leaving Upload scope. Preserve meaningful browser-history return without turning the main My recent uploads button into a resume-detail action. |

Keep the familiar **My recent uploads** entry in Search. It is a doorway that does
not require submitting files. Add **View all your uploads** beside the lower-section
heading, as in Kahuna. Resolve its human identity through the existing session
owner; use the raw email used in Kahuna's
link (uploadedBy=). Reload/Back must resolve the current authenticated identity. Identity failure
must not widen to an unrestricted query. The resulting page is ordinary Search,
including its selection/filter behavior, not Upload hidden under a different path.

Do not add the per-image **Show in search** action in this unit. Its placement and
destination remain undecided. In particular, do not copy Kahuna's validity/status
badge as an unexplained navigation link or call navigation an archive/Library action.

#### Detail, Fullscreen and Future Editing Scope

An image opened from the batch retains that section as its traversal origin; show
an identifiable batch context and an in-batch counter. An image opened below retains
the other-uploads query origin. Previous/Next in detail or fullscreen must stop at
the section's end, not cross into the other section. Ordinary page scrolling can
cross the visible section boundary; it never changes an operation's targets.

Use **Back to uploads** for Upload detail, with its origin distinguishable, and
**Back to image** for crop. Do not add competing Back-to-search and Back-to-uploads
buttons in image detail. Batch selection belongs on the Upload list, not in detail,
fullscreen or crop. Fullscreen may retain minimal context in its existing controls;
it must not introduce a second editing surface.

The same image opened from Search has Search's context. Do not infer a hidden batch
scope merely because that identity belongs to a retained batch. Batches reference
shared canonical images, not independent copies: editing an image later changes its
canonical state wherever it is displayed, including another batch containing it.

U4.5 establishes explicit section/batch identity for U5's command admission; it does
not add inactive arrows, a second executor or simulated saves to the ordinary app.
In U5, arrows belong only to fields in the upper **Form** section. They capture that
displayed batch's eligible known canonical IDs, including offscreen members, never
the combined page, lower query, newest batch by accident or Search selection.
Counts/exclusions must be accessible without hover; routine non-destructive arrows
do not gain a confirmation dialog per click. Preserve existing destructive-clear
confirmation semantics. Individual detail/lower-section editing remains single-image.

Upload selection checkboxes and its selection-metadata panel remain absent in all
densities. Batch-to-Search selection handoff is also deferred. Do not repurpose the
ordinary Search selection store as the batch registry. Neither opportunity becomes
a U4.5 or U5 gate.

#### Data, Geometry and Failure Ownership

This is two independently ordered sources under **one active browsing/placement
owner**, not one query with a decorative heading. Preserve the existing bounded
data windows and measured layout. Never hydrate every prior upload, allocate
catalogue-sized geometry, mount two competing singleton browsers or use fixed-height
clipping to make the composition fit. Section headings are not fake `Image` records.

Before the first product edit, name the minimal composition change and its cheapest
behavioral check. Explicitly account for section identity, independent cursors/order,
combined extent, local/global offsets, detail traversal and snapshot qualification.
Reuse existing ownership rather than cloning stores or inventing a universal
workspace/set framework. Keep image authority/freshness separate from position and
section provenance. No exact catalogue-wide pixel/rank guarantee or PIT is added.

Use the existing scroll/compensation owner. A batch completion, membership revision,
height change or late response must not displace the field/image being read, steal
input focus, pulse phantom navigation, or publish into another section/batch. A
growing upper section must not move a reader currently in the lower section.
Switching the open batch changes the lower exclusion as well: qualify/cancel both
affected read generations while preserving route-independent upload work.
Retain bounded reads/DOM/geometry at resident, indexed and seek extents and support
arbitrary-position browsing of the lower query, not only sequential loading from top.
The page scrubber/position feedback must distinguish sections; section-local detail
ordinals are not interchangeable with combined-page positions.

An unresolved/known-empty batch issues no unrestricted batch read and does not
silently select another batch. Its explicit unavailable/processing/empty state may
coexist with the independently admitted current-user lower section; that lower
query is not a fallback for the batch. Conversely, a failed identity/lower read must
not masquerade as no previous uploads or discard a valid upper batch. Preserve the
existing whole-Upload refusal on disabled/denied/invalidated access. Missing image
reads never rewrite retained membership, imply deletion or grant edit authority.

#### Starting Owners and Test Impact

Start with [route admission](../../src/routes/search.tsx),
[browsing context](../../src/lib/browsing-context.tsx),
[entry/departure helpers](../../src/lib/browsing-navigation.ts),
[URL synchronization](../../src/hooks/useUrlSearchSync.ts) and
[router capture](../../src/router.ts). Then follow the necessary boundary into
[API reads](../../src/dal/api-data-source.ts),
[POST mapping](../../src/dal/grid-api-search-adapter.ts),
[search state](../../src/stores/search-store.ts),
[data window](../../src/hooks/useDataWindow.ts),
[measurement](../../src/hooks/useMeasuredLayout.ts) and
[placement](../../src/hooks/useScrollEffects.ts).

Reuse [Upload controls](../../src/components/UploadActivity.tsx),
[activity](../../src/components/UploadProgress.tsx),
[jobs](../../src/stores/upload-jobs-store.ts),
[descriptors](../../src/lib/local-batch-storage.ts),
[Form](../../src/components/MeasuredGrid.tsx),
[ImageGrid](../../src/components/ImageGrid.tsx),
[ImageTable](../../src/components/ImageTable.tsx),
[ImageDetail](../../src/components/ImageDetail.tsx),
[navigation controls](../../src/components/DetailNavigation.tsx),
[SearchBar](../../src/components/SearchBar.tsx),
[preferences](../../src/stores/ui-prefs-store.ts) and
[history snapshots](../../src/lib/history-snapshot.ts).
Kahuna's [stacked page](../../../kahuna/public/js/upload/view.html) and
[non-batch recent editors](../../../kahuna/public/js/upload/recent/recent-uploads.html)
are presentation references, not permission to copy its component-owned jobs or broadcasts.

Identify old-behavior assertions **before** editing them. In particular,
[grid-mutations journeys](../../e2e/local/grid-mutations.spec.ts) currently assert
one selected Upload source, six ordinary selector options, no reads for some
empty/missing scopes, and My recent uploads restoring a previous destination.
Distinguish intentional changes from regressions: the lower section can now make
its own identity-scoped reads; the missing batch still cannot widen. Preserve
history return and geometry assertions rather than weakening them to match fresh
entry. Amend owning [history](../../e2e/local/browser-history.spec.ts),
[density](../../e2e/local/browse-density.spec.ts),
[windowing](../../e2e/local/justified-windowed.spec.ts), API/store and scroll suites
only where affected. Keep meaningful existing direct-ES refusal and Search tests.

#### Execution and Acceptance

One executor owns the integrated change, with cold review subagents under Section 6.
Do not delegate overlapping edits to shared navigation, store or geometry owners.

1. **Bounded composition:** implement the smallest real-API-fixture journey with
   one batch plus a multi-page lower query. Establish correct exclusion, section
   positions and stale-response ownership before expanding controls. Reuse the
   real Form/geometry implementation; this is not a new throwaway prototype.
2. **Page and navigation:** integrate the chooser, section presentation, ordering,
   density controls, fresh-entry/return table, contextual detail/crop/fullscreen
   and uploader-scoped Search link. Add no U5 transport or deferred features.
3. **Integrated closure:** perform desktop/compact browser review, inline cold
   subagent reviews, findings repair/verification and full required gates on the
   final source. Do not stop after the first-stage fixture or screenshots.

Compose representative witnesses in existing suites rather than one test per bullet:

- Two submissions remain distinct; switching/reloading the older batch works;
  more than five batches are discoverable without a remembered URL. Fresh entry
  opens the newest at top, while history and detail return restore the older one.
- The lower section contains all accessible other uploads, including pages well
  beyond 50. Exclusion/count/order remain coherent with duplicate identities,
  lifecycle omissions and a failed read. Switching batches replaces the exclusion;
  a held old completion cannot publish over the new page.
- Both sections use the four densities. Density/reflow, loaded-window maintenance,
  distant lower-section entry and return retain the represented image/field.
  Delayed upper arrivals while reading/typing below do not move it. Use a bounded
  large-logical-total fixture and one representative 250-500-member batch fixture;
  no catalogue hydration, arbitrary batch cap or new performance campaign.
- Detail/fullscreen traversal stops within its source section; crop returns through
  its image to the right section/place. Fresh entry never reopens detail; explicit
  detail links/history still work. Preserve Search selection and its ordinary history.
- View all your uploads reaches normal Search with the current-user filter, without
  inherited filters/exclusion. Its `uploadedBy` URL parameter contains the current
  user's email, matching Kahuna (operator-confirmed, 15 November 2026); this explicit
  Search-link behavior does not permit persisting or logging Upload session identity.
  Missing identity/access cannot produce all-user results. Empty/missing upper and
  failed lower states remain distinguishable without losing independent usable work.
- Desktop and coarse-pointer compact controls identify the open batch and active
  section, expose older choices and survive short/keyboard-sized viewports. Preserve
  input/IME/draft lifetime through the changed composition. Verify compiled-hosted
  behavior as well as Vite, using isolated synthetic data and existing fixtures.

Run focused checks immediately after edits, then full units, full local E2E with
retries disabled, normal build, isolated hosted build, `typecheck:e2e` and
`typecheck:perf`, with Section 6's repo-root foreground pipefail/tee commands.
For hosted validation use
`npm --prefix kupua run build:hosted -- --outDir node_modules/.cache/u4-5-hosted`.
Do not write the normal hosted bundle outside Kupua without permission. Coordinate
test ports/server ownership and do not edit source during runs. Suggest the relevant
jank and perceived campaigns; do not run them. Live TEST reads/uploads from this
planning discussion grant no permission to a new executor session.

**Stop and ask** if the implementation needs backend/dependency/safeguard changes,
a new storage system, two competing browsers, whole-result hydration or a serious
likely performance regression. Explain the concrete user workflow and narrower
alternatives; do not silently replace All with 50 or waive Form/position preservation.

**Done when:** the combined page and navigation table work through real isolated
API clients in both frontends; section origins cannot become combined-page edit
targets; retained batches remain useful; scoped review findings have evidence-backed
dispositions and final gates pass. Update owning component/state/history/API guides,
the implementation changelog and any necessary deviations. No commit/push without
permission. Closeout must explicitly say that U5 saves/arrows, selection features,
server persistence and per-image Show in search are not supplied by U4.5.

#### Implementation Evidence

**15 November:** isolated real-client journeys cover the combined 650-result lower
query, distinct submissions, retained-batch discovery, fresh entry versus addressed
history/reload, section detail/crop return and the explicit uploader-email Search
link. A 250-file submission with its final transfer held preserves a distant lower
Form input's node, focus, IME selection, value and screen position when that member
arrives; density round trips retain its draft. Desktop/compact and compiled-hosted
witnesses exercise the shared implementation. Table section controls remain
viewport-contained during horizontal column scrolling.

Actual inline cold GPT-6.1 Sol reviews and independent repair verification covered
source/cursor/geometry ownership and navigation/identity/workflow boundaries.
Confirmed findings were repaired, including partial-page publication, failed-read
terminal handling, approximate/End targets, unloaded-span keys, native spatial
navigation, Grid phase/Justified context, entry capture, activity/detail return,
inspection chooser/sort semantics and Table command reachability.

The complete unit surface passed 3,910 tests in 117 files with two workers; original
assertions and startup deadlines were retained. The
operator accepted that recorded exception and explicitly requested only relevant
E2E after the heading repair: all four affected desktop/compact/Form/hosted journeys
passed, with retries disabled. Normal and Kupua-isolated hosted builds plus both
browser/performance compiler gates passed on the final source. No full suite was
rerun after that operator instruction. Default-concurrency unit runs can exceed
the unchanged startup test's cold-import deadline; two-worker validation avoids
that resource contention without changing the test.

These are local/synthetic checks, not live TEST/PROD, physical-keyboard or performance
campaign certification. B13 remains the operator-dispositioned hypothetical limit;
R34 records a deferred request-local count opportunity. U5 saves/arrows, Upload
selection, batch-to-Search selection handoff, per-image Show in search, batch
append/merge and server persistence are not supplied by U4.5.

#### Section 8 Applicability

| Opportunity | Treatment during U4.5 |
| --- | --- |
| R1, R15, R29 | Required: explicit combined-page admission, readable/accessibly reachable retained batches, and the entry/return/label corrections above. Do not build R15's larger navigation panel or generalized workspace system. |
| R9, R10, R19, R22, R31 | Inspect at the touched ownership boundaries and make the smallest necessary changes for section-aware rendering, logical positions, admission ordering and traversal. No blanket host/store extraction; preserve existing geometry and history witnesses. |
| R4, R5, R20, R21 | Reuse real-client fixtures, coherent query eligibility and privacy controls. No new POST contract is selected; if an actual contract gap requires one, obtain permission and follow the mapper/server replay rule. |
| R18 | Preserve descriptor/history budgets and failure handling. Recheck that composite snapshots remain qualified and bounded; no snapshot-reference redesign without demonstrated need. |
| R2, R25, R26 | Preserve existing image/field drafts, but leave cross-surface draft handoff, discard/outstanding-save UX and conflict comparison to their separately selected editing work. |
| R6, R11-R14, R16-R17, R27-R28, R30 | Deferred unless a concrete failure of U4.5 requires a narrowly justified repair. No Justified rewrite, research tooling rebuild, arrival-intent queue, transport tuning, global Form exposure, sticky preview, zoom, field chooser or speculative persistence/draft optimization. |
| R7-R8 | Existing intermittent-test evidence, not permission to add retries or weaken expectations. Investigate a recurrence in its owning fixture before attributing it to U4.5. |
| R23-R24 | Retain the implemented HTTP-LAN identity mint and identity-free history/session contracts; no account-switch framework. |
| R32-R33, B7 | Explicitly deferred: Search selection handoff, Upload subset editing and durable server batches. They are not prerequisites for this unit or U5. |

### U5. Required Metadata Saving and Batch Propagation

**Depends on:** U2, U4.5 and the existing command/publication foundation. Use U4's
retained membership and U4.5's explicit upper-batch/other-uploads origins.

**Status: U5 hookup implemented, cold-reviewed and validated (18 November).**
Ordinary metadata now uses one command/operation path for explicit Details commits,
Form pause/blur saves, upper-batch arrows and filename fallback. Preset labels are
captured per submission and share startup admission/pacing with these saves and Labels.
Metadata actions reserve their complete captured set, then execute in groups of 100;
the session freshness budget is 10,000 distinct images. Each group retains the existing
dispatch/readback bounds; the [current batch policy](../../src/dal/grid-api/README.md#step-6-bounded-label-execution) supersedes the initial tuning below.
The budget is a session resource refusal before dispatch, not a batch-size promise.
Two independent cold reviews and a repair verification resolved the draft-revision,
reservation-ownership, receipt-identity and repeat-submission findings. Full validation:
3,938 units across 117 files; normal and isolated hosted builds; E2E/performance
typechecks; 598 retry-free E2E tests in 10.7 minutes. Existing WASM/chunk-size build
warnings remain. No live metadata mutations, deployment or speed tuning occurred.
The new browser journey reuses the existing Upload fixture; eight unit witnesses
were added within existing suites. Its final focused run took 17.8 seconds; this
is measured suite runtime, not a production editing-performance result.
The [command contract](../../src/dal/grid-api/README.md#step-6-bounded-label-execution)
owns the current queue, lifetime and remaining capacity boundaries.

This is the same shared ordinary-metadata command work as
editing Step 8, not a second implementation or a prerequisite to finish all of Step 8.
When selected together, connect the existing Search/detail single/multi-image controls
and Upload's Form through the same operation, authority, outcome and publication owners.
Keep panel submission explicit and Form pause/blur saves; only upper-Form arrows capture
the open batch. Filename fallback, presets and those arrows are Upload-specific additions.
Configured-domain editors remain a separate Step 8 capability and are excluded here;
existing domain overrides must still survive every write. This coordination grants no
implementation or live-write authorization.

Follow roadmap **Step 8**, Kahuna's [required metadata editor](../../../kahuna/public/js/upload/jobs/required-metadata-editor.js)
and [edits service](../../../kahuna/public/js/edits/service.js), and Kupua's
[command boundary](../../src/lib/grid-commands.ts),
[publication](../../src/lib/image-publication.ts),
[freshness](../../src/lib/image-read-freshness.ts) and existing field controls.

**Temporary date restriction (operator, 18 November 2026):** [GRID-025](bug-backlog.md#grid-025)
documents the backend's inability to explicitly clear an embedded Taken on date.
Form and Details clearing is disabled until a separately authorized backend PR
provides that ability and deployed readback is verified. U5 must retain this refusal,
including autosave and batch propagation; setting/replacing dates and other metadata
clears remain in scope. This is an explicit temporary limitation, not a U5-wide gate
or permission to implement a backend workaround.

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
Use pause/blur-speed ordinary Form saves in both sections and preserve the explicit
single-image panel workflow. Batch arrows appear only in the upper Form section,
including when an older retained batch is open. Capture its IDs and value at the
click; no lower-query, combined-page, detail or Search-selection target inference.
Keep the idle arrow compact; expose captured counts and exclusions on demand and retain existing destructive-clear
confirmations. Reloaded membership permits new deliberate actions after fresh
authority checks, not replay of a prior operation. Switching batches or sections
cannot retarget an in-flight operation.
Processing files without canonical images are excluded, not silently queued for
later edits. Preserve captured intent and outcomes when leaving Upload, but do
not implement deferred-arrival application merely to keep that future option open.

Review current prototype action and freshness capacities against ordinary batch
parity; the old 100-label limit is not an approved new Upload product limit.
Do not replace this review with an unbounded dispatch/retry system or a speculative
server-capacity campaign. Keep resource control, operation lifetime and user-facing
target limits distinct. A larger target set must fit the actual publication/
freshness ownership, not just a raised constant.

**Related review, not additional implementation gates:** when choosing the shared
Form/panel save and receipt interaction, assess [R2](#refactoring-and-frontend-opportunities)
(draft handoff), [R25/R26](#u2-follow-on-opportunities) (discard/outstanding work and
newer canonical values). Record whether each is selected, refuted for the chosen
workflow or deferred; a comparison UI is not conflict prevention. R12/R13 in the
same [register](#refactoring-and-frontend-opportunities) explain why target/exclusion
feedback matters and why applying to future arrivals remains deferred. The accepted
[GRID-020](bug-backlog.md#grid-020) prototype race and [GRID-019](bug-backlog.md#grid-019)
shared-capacity risk remain distinct from the client capacity decision above.
If the receipt-order intermittent R7 recurs, investigate its held-read invariant;
do not add retries or weaken assertions. Reuse existing fixtures (R4), and apply R5's
mapper-body/Scala replay discipline only if a POST read contract changes.

**U5 disposition of R2/R25/R26:** defer cross-surface draft handoff, a global
outstanding-edits/discard navigator and a newer-canonical-value comparison UI.
Form owns revisioned image/field drafts and retained save receipts; panels retain
explicit local editing intent and share commands/publication, not Form's autosave
draft lifecycle. Newer Form revisions survive earlier saves, and unchanged blur
does not resubmit rejected or uncertain intent. This preserves the chosen workflows
without claiming conflict prevention or implementing those additional interfaces.
People/Keywords ordinary metadata is connected; Subjects, Collections, Photoshoot,
configured-domain editors, rights and leases remain outside U5.

**Witnesses:** real single save and clear in the selected surfaces; preserved unrelated metadata; viewport
eviction/density switch during edit and save; delayed stale read cannot undo a
newer accepted value; an older batch's arrow includes offscreen eligible members
but excludes the lower section, later submissions and unrelated selection; pending
arrivals do not join captured targets. Partial/unknown outcomes retain drafts/receipts
without automatic replay. A canonical image shared by two batches is still one
image: publication must update its returned representations without suggesting
that a second batch-wide operation was dispatched.

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

**Related bugs:** U6b/Step 9 owns the composed lease-display check for
[KUP-045](bug-backlog.md#kup-045); U6a/Step 10 owns server notice wording
[KUP-046](bug-backlog.md#kup-046) where relevant. Assess them at those boundaries,
not as a prerequisite for U5 or a reason to infer authority from display.

Preserve U4.5's scopes: individual controls may edit their own image in the supported
surfaces, while batch applicators belong only to the open upper Form section and
capture that retained/current batch. Other uploads and detail/fullscreen/crop never
gain implicit batch scope. Explicit multi-step Save is not permission for a
page-wide action, selection UI or automatic application to later arrivals.

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

**Depends on:** the relevant shared command family, U4 membership and U4.5 section
and navigation ownership. Apply-to-batch operations use the open upper Form section,
not all displayed images or an implicit Search selection. Detail/crop return and
traversal preserve their section origin; keep fresh-entry/history behavior intact.
**Witness:** corresponding P12-P14 rows pass through real connected operations in
the authorized test setup; duplicate ownership and denied targets remain visible.
Do not claim Upload complete while a required family is still only preparation UI.

**Related follow-ups:** if label presentation is touched, check whether the observed
[KUP-050](bug-backlog.md#kup-050) flash still occurs without concealing pending states.
Crop creation belongs to Step 13, including its separately scoped
[GRID-022](bug-backlog.md#grid-022) repeat-save and
[GRID-023](bug-backlog.md#grid-023) unavailable-list decisions. These observations
do not authorize unrelated fixes or live crop trials.

### U8. Visual Review and Parity Acceptance

**Depends on:** required P01-P15 work, with U0's confirmed applicability.

Review desktop and compact workflows in the browser: progress/partial failures,
long metadata, keyboard/IME editing, suggestions, batch switching, density/detail/
crop return and the absence of redundant competing metadata panels. Reuse Kupua's
visual language and inline icons; no new icon/design system dependency.
Review U4.5's combined page in all four densities, all-other-uploads browsing beyond
50, reachability of older retained batches, correct fresh-entry/history/inspection
return and section-bounded detail/fullscreen traversal. Batch arrows appear only
in the open upper Form section, with accessible target counts/exclusions; individual
edits below must not acquire batch scope. The lower query excludes the open batch,
while View all your uploads opens ordinary current-user Search without that exclusion.
U0b closed through operator review, not a new browser demonstration: its mixed
batch, delayed arrival, scroll/status orientation and search/Upload return
witnesses still need execution against the implementation. Upload selection UI
and its panel are not first-version gates; existing search selection must not regress.

Use mostly small representative batches, plus a deliberate upper-end case around
250-500 files/IDs to expose chunking, browser memory and offscreen propagation
problems. Larger accepted inputs must not be truncated because of the fixture size.
Distinguish an ID-read fixture from a real large-file ingestion trial; the latter
requires separately approved resources and mutation scope.

**Related observations to triage during review:** consider whether the real workflow
justifies [R27/R28](#u2-follow-on-opportunities) (sticky preview/draft-store cost) or
[R17](#refactoring-and-frontend-opportunities) (field/zoom choices); no layout or
performance change is implied without its recorded evidence and separate selection.
Retain the [R14](#refactoring-and-frontend-opportunities) and
[B2/B3](#existing-backend-deferred-by-default) recovery/attempt-isolation limits:
local attempt IDs do not establish server isolation,
and status expiry is not proof of a failed transfer. The hypothetical B13 request limit
is revisited only if a supported workflow actually fails. For a real failure of the
Settings, focus or Table interactions, use [KUP-049](bug-backlog.md#kup-049),
[KUP-052](bug-backlog.md#kup-052) or [KUP-048](bug-backlog.md#kup-048) respectively;
do not treat an unexplained old intermittent as fixed or add retries. If switching a
local Grid to TEST for separately authorized trials, first account for the local-data
loss risk in [GRID-021](bug-backlog.md#grid-021); no environment switch is required here.

Complete the required regression gates, then an operator-authorized real upload
trial in the selected topology: ingest -> processing -> visible image -> required
editing -> usable result, including an existing duplicate and a recoverable failure
where safe. Use disposable approved files; record sanitized outcomes, never
credentials, signed URLs, personal metadata dumps or raw live responses.

Final acceptance lists every parity row as passed, blocked, configuration-inapplicable
or operator-deferred/excluded, with evidence and a reference to any operator decision
that narrows the acceptance claim. Configured-but-deferred templates are not passed
or configuration-inapplicable, and are not a current completion gate. A required
unfinished capability remains blocked unless the operator explicitly changes scope.
An inherited backend issue must have an explicit disposition; it
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

**Mandatory inline cold subagent review, for every implementation unit:** the
executing agent must invoke independent review subagents within its execution
conversation before closing the unit. A self-review, an earlier unit's review, or
instructions for somebody to review later do not satisfy this requirement. The
executor chooses focused remits from the actual changes and risks, with enough
independent coverage for the integrated result; do not reuse a blanket checklist
or require a fixed number of findings. Coherent intermediate reviews are useful,
but do not replace review of the accumulated integration.

Use the operator's review model preference, **GPT-6.1 Sol (openai)**, and reviewers
that did not author the implementation. If delegation or that model is unavailable,
report the blocker and request an explicit alternative; do not silently substitute
self-review. Supply the selected unit, relevant acceptance boundaries, current
diff/source and neighboring tests without feeding reviewers the executor's preferred
conclusions. Review delegates are read-only: no edits, live access, independent test
campaigns, Git mutations or shared-worklog changes. Ask for concrete file/line evidence,
failure scenarios and scope gaps rather than stylistic enumeration.

The executor must act on every finding: establish a failing witness and repair a
confirmed in-scope defect; refute an incorrect claim with evidence; or obtain an
explicit operator disposition for a genuine unresolved acceptance/safety issue.
For a valid non-blocking out-of-scope opportunity, record or merge it in Section 8
with evidence, benefit, cost/risk and trigger, and defer it without expanding
implementation or acceptance. That path cannot dispose of an actual blocker.
Record the dispositions concisely in the worklog and closeout. Request independent
verification of substantive repairs, rerun affected focused checks and the required
full gates on the final source. Review is not permission for unrelated cleanup,
broader implementation, backend changes or live access.

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
| B13 | **Hypothetical boundary, operator disposition 15 November:** existing CQL supports canonical-ID exclusion through the [shared mapper](../../src/dal/grid-api-search-adapter.ts). Serialized requests with 2,000 exclusions fit the existing 100KB parser limit (approximately 98.3KB including sort/cursor fields); operator-provided read-only local Elasticsearch 8.18.3 validation accepted 500, 1,000 and 2,000 exclusions. This does not certify TEST/PROD limits, full API behavior or performance. The invented 3,000-image case is not workflow evidence; submissions above 1,000 are extraordinarily unlikely in roughly ten years of operator UI use. | **Not a U4.5 blocker or backend prerequisite.** Continue selected open-batch exclusion with existing contracts, no batch cap/rejection, duplicate substitute or frozen lower snapshot. Request-size/clause limits remain a hypothetical opportunity: revisit only if an actual supported workflow fails. Potential benefit is handling that demonstrated failure; cost/risk includes shared parser/query capacity and backend ownership. No new infrastructure/tests for this hypothetical, parser configuration, backend changes, dependencies or live access are authorized. |

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
the [browser fixture](../../e2e/shared/grid-mutation-plugin.ts) changed together,
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
| B6 | [GRID-018](bug-backlog.md#grid-018) records a dynamic metadata mapping conflict that can prevent search visibility after transfer. A newer XMP retry covers direct insertion, not ordinary `ImageMessage` upserts. | Remains open for ordinary ingestion; agree containment/rollout evidence. A longer client spinner is not a fix, and no automatic migration/reindex project follows. |
| B7 | [Collections identity](../../../common-lib/src/main/scala/com/gu/mediaservice/model/Collection.scala#L11) is the path; [membership](../../../collections/app/store/ImageCollectionsStore.scala#L17) copies records per image. No private batch identity/ACL follows from a user-named path. **U0b operator opportunity:** permanent batches and a way to navigate back to them; local tab descriptors deliberately cannot promise this. | **Deferred hypothesis:** an additive Kupua batch/set service could provide stable references, ownership and membership for navigation, later sharing or clipboard-like sets. Benefit: recover a batch beyond one tab without confusing recent uploads with submission history. Cost/risk: authorization, retention/deletion, privacy, synchronization and service ownership; a permanent reference does not make transfers/drafts resumable. Trigger: operator selects durable-batch requirements after working local Upload demonstrates the need. Keep the local resolver separate from image reads/commands now; do not prebuild a universal set abstraction or repurpose Collections. Prefer additive support; a small shared change needs substantial evidence/shared benefit, and a larger redesign remains deferred. |

### Refactoring and Frontend Opportunities

| ID | Evidence and opportunity | Boundary |
| --- | --- | --- |
| R1 | The shared Grid/Table/detail/scroll consumers previously knew `/search` directly, and URL-level `ids=""` was dropped as unrestricted. | **U1 implementation:** a narrow [browsing context](../../src/lib/browsing-context.tsx), typed internal membership scope, fail-closed empty admission and route-aware shared consumers remove the coupling needed here. Upload is API-only; the direct-ES adapter is unchanged. Library CSV share links remain supported; batch IDs never become CSV browser URLs. Wider router/store cleanup remains deferred; no universal workspace framework or direct-ES Upload parity work. |
| R2 | [MetadataTextEditor](../../src/components/MetadataTextEditor.tsx) uses external image/field Form drafts, while panel editing begins from the canonical value. U5 connects both through shared commands/publication, but a retained unsent or failed Form draft is not handed to Details; returning to Form retains it. | **Assessed and deferred in U5:** explicit single-image draft handoff could let someone start a description in Form and finish it in Details without competing values. Benefit: continuity beyond shared commands. Cost/risk: autosave versus explicit Commit, cancel semantics, stale authority and separation from multi-image overwrite/prepend/append intent. Trigger: operator selects this interaction after using connected surfaces, or encounters confusing divergent drafts. Do not merge every editor store or publish drafts as canonical data. |
| R3 | [Service discovery comments](../../src/dal/grid-api/service-discovery.ts) described obsolete hybrid/proxy/graceful-absence assumptions. | **Corrected in U3:** comments now describe explicit API routing, independently validated satellites, failure versus empty data and the actual site-settings owner. No working transport policy was changed to match obsolete commentary, and no broad cleanup was undertaken. |
| R4 | Composed tests each build their own media-api stand-in that maps request bodies back to `SearchParams` ([search-store-api-mode](../../src/stores/search-store-api-mode.test.ts#L66), [ImageDetail](../../src/components/ImageDetail.test.tsx#L1712)); UB8's wire change had to be repeated in each. | **U4:** extended the existing [API/label fixture](../../e2e/shared/grid-mutation-plugin.ts), including multiple canonical uploads and lifecycle qualification; compiled-hosted traffic reuses it rather than another API engine. Its initial Upload URL is preserved and production build environment isolated. Benefit: real mapper/control coverage without duplicate transport scaffolding. Wider unit stand-in extraction remains deferred until a contract change requires coordinated edits; it is not a new U4 gate or testing framework. |
| R5 | Recorded mapper bodies replayed in Scala caught UB8's shape change immediately. | Discipline, not code: every new or reshaped POST field gets a mapper-recorded body and Scala replay, never a hand-written body. |
| R6 | Justified's total-row invalidation and [indexed estimated-block construction](../../src/lib/windowed-justified-layout.ts) scale with result extent. U2-proto's deterministic dependency probe established this, not measured frame-time harm. | **Resolved for measured forms** by [bounded spans](../../src/lib/windowed-measured-layout.ts) after operator approval. Reducing Justified's indexed relayout work could help, but changing its packing/navigation representation is higher-risk work. Pursue only if a profile attributes material cost to that construction; the unequal-throughput U2 comparison is not that evidence. No automatic Justified rewrite. |
| R7 | [exerciseBulkEditor](../../e2e/local/grid-mutations.spec.ts#L1707) expected `[superseded, observed]` but received `[observed, observed]`, first locally and later compiled-hosted. The isolated tracked-source control failed earlier at [exerciseObservedEditor](../../e2e/local/grid-mutations.spec.ts#L1569), not the same assertion. The selected follow-up passed both command cases, both owning specs (75 cases) and a fresh full suite (596 cases), without retries or a product fix. | Retain as an unexplained intermittent, not a currently reproduced defect or claimed repair. A new assertion verifies observation is pending before releasing the held request; it does not weaken the expected receipt pair. If this recurs, distinguish an ineffective request hold from publication/read ordering using that invariant. No inheritance or U2 causality is established. |
| R8 | An earlier full run's mobile double-tap case failed during [module interception](../../e2e/local/selections-mobile.spec.ts#L39) with `route.fetch: read ECONNRESET`; app startup then lacked its store. It subsequently passed unchanged in isolation, the selected two-spec investigation and the fresh 596-case full run, all without retries. | Retain as an unexplained fixture/server transport intermittent; investigate module-request lifetime if it recurs. The latest full gate is green, but no causal repair is claimed. This is not evidence of a gesture regression or permission to add retries, weaken readiness assertions, or alter product transport behavior. |
| R9 | The prototype reused [ImageGrid](../../src/components/ImageGrid.tsx) but conflated variable geometry with Justified thumbnail behavior. Real forms also exposed changed-neighbour measurement anchoring and native Tab skipping outside overscan. | **U2:** variable-row policy is named separately; the renderer composes explicit image entry with independent form content. Committed-geometry anchoring and immediate loaded focus neighbours repair the demonstrated placement/Tab defects. Benefit: shared browsing without thumbnail input policies or copied lifecycle. Cost/risk remains shared navigation/media behavior, covered by retained witnesses. Wider host extraction stays deferred until another necessary consumer exposes real duplication. |
| R10 | [Measured geometry](../../src/lib/windowed-measured-layout.ts) maps logical items to bounded virtual rows, while its spatial interface uses logical rows. Confusing these domains caused the prototype's boundary-arrow defect. | **U2:** the touched host names `logicalItemCount` separately from virtual `rowCount`; navigation's existing parameter documents its logical extent. Boundary-arrow and tall-page witnesses remain. Benefit: clearer adapter domains without a shared API rewrite. Distinguishing types/grouped-row redesign stays deferred until a concrete additional adapter needs it; no universal coordinate-branding project. |
| R11 | The [research transforms](../../e2e-perf/research/density-app-research.spec.ts) rely on literal import/cell-key text and occurrence counts, not application behavior. | **U2:** adapted the touched host-policy references and gave the real Form comparison a distinct workload/record name. Fail-closed checks and compiler validation remain; no campaign ran. Production naming is not retained solely for text matching. AST/hook replacement remains a deferred maintenance improvement if another integration repeatedly breaks these transforms; benefit is less incidental coupling, cost/risk is experiment-equivalence validation. No instrumentation, dependency or framework rebuild. |
| R12 | **Operator report, U0b:** scrolling during uploads makes remaining activity and arrow scope difficult to follow. Kahuna's [metadata arrows](../../../kahuna/public/js/upload/jobs/required-metadata-editor.js#L106) reach existing editors, not future arrivals. U5's [Form arrow](../../src/components/MetadataEditing.tsx) now captures upper-batch canonical IDs, shows recipient/exclusion counts and retains the captured receipt when membership changes. The source image's save is separate and labelled separately from Batch. | **U4/U5 implemented:** persistent batch orientation, per-file activity, captured offscreen propagation and operation-specific feedback/Stop controls. The existing U5 browser journey covers an older batch, held execution, navigation and later canonical arrival without retargeting or losing the receipt. Benefit: visible scope and outcomes without inferring membership from the viewport. Remaining cost/risk: phone space and unlike activity lifetimes. Further completion/attention UI remains a hypothesis triggered by actual repeated-batch difficulty, not permission for browser notifications or background guarantees. |
| R13 | **Implemented U5 boundary:** pending files do not inherit an arrow click. [Captured saves](../../src/stores/metadata-editor-store.ts) retain known canonical targets; a later arrival updates membership and displayed candidate counts, not the old operation. The browser journey witnesses this exclusion. | **Deferred hypothesis:** explicitly retaining intent for the original batch's processing files could avoid a second manual application and omissions. Cost/risk: repeated arrows, intervening edits, duplicate attempts, failed ingestion, changed authority and cancellation/reload semantics; never silently overwrite newer intent or replay uncertain saves. Trigger: connected Upload demonstrates material repeated work and the operator selects those semantics. Keep attempts, canonical membership and captured intent separate; no pending-arrival applicator or template engine is selected. |
| R14 | **Operator ambition, not a measured failure in U0b:** robust uploads of large files, many files, or both, and recovery without losing trust. Existing transport/status limitations are recorded in B2/B3/B6 and C1/C4; splitting batches after failures is coping behaviour, not evidence of a preferred small workload. | **Deferred improvements selected by evidence:** clearer recovery/reconciliation and, only if justified, stronger transport support. Benefit: less repeated work and fewer lost outcomes. Cost/risk: browser memory/lifecycle limits, uncertain server outcomes and compatibility across loader/signed storage; no safe-resume or exactly-once guarantee exists merely from a local job record. Trigger: a separately authorized representative workflow demonstrates a specific bottleneck/failure or the operator selects a bounded investigation. Preserve independent jobs, separate phase/edit outcomes and bounded client resources now; do not invent a batch cap, resumable-upload subsystem or autonomous performance campaign. Backend amendments follow Section 7's additive-first policy and their owning register. |
| R15 | [The current chooser](../../src/components/UploadActivity.tsx) exposes five recent records plus outstanding/selected work, labels them mainly by short IDs, and switches between batch and recent-query views. Older retained records are not discoverable through a complete chooser. The operator wants familiar combined-page orientation and useful return to earlier work, not batch removal. | **Selected for U4.5:** one open batch above all other uploads, recognizable labels and an Earlier batches expansion reaching all retained records. Benefit: exact-group return without a remembered URL or a second page. Cost/risk: phone space, local-history expectations, section provenance and position. A larger navigator and extra per-batch view recall remain deferred; B7 owns permanence and R32/R33 own the separately deferred selection opportunities. No Places sidebar, generalized workspace system or batch/selection-store merger. |
| R16 | **Settled architecture plus U0b operator opportunity:** the image-and-fields layout is a genuine density, initially exposed only in Upload. Existing browsing, detail and metadata consumers already have different contexts; R1/R2/R9 identify the necessary shared boundaries. | **Deferred exposure:** use the density elsewhere in Grid and preserve coherent transitions between search, Upload and detail. Benefit: the same efficient image/metadata work outside a submission batch. Cost/risk: search-scale hydration, permissions, unavailable persisted density, competing panels and context-specific applicators. Trigger: working Upload density demonstrates reuse value, then select global exposure. Keep activity/batch controls outside the reusable renderer, shared commands/drafts outside rows and one browsing engine now; no separate Upload app or global rollout in U2. |
| R17 | **Settled U2-proto/field contract plus U0b operator opportunity:** natural variable heights, a global visible-field set and bounded geometry already support layout changes. Desired later controls include zooming and adding/removing visible fields; no particular zoom interaction has been selected. | **Deferred hypotheses:** fewer visible fields or a different form scale/grouping could match different editorial tasks. Benefit: adjust information density without abandoning image context. Cost/risk: hiding essential guidance, preserving focused/dirty fields, grouped-row navigation and mobile legibility; geometry feasibility does not establish real-editor performance. Trigger: select controls after trying real forms. Keep field visibility separate from data/drafts, use layout-sensitive measurements and allow one or more forms per row at the boundary. Do not implement toggles/zoom now, reopen U2's proof or promise every layout is already validated. |
| R18 | **U1 source constraint:** [scope fingerprints](../../src/lib/image-offset-cache.ts) include immutable membership and revision, and [history storage](../../src/lib/history-snapshot.ts) retains those fingerprints per entry. Short browser URLs therefore do not imply small stored snapshots; membership can be repeated across retained entries. | **U4 decided:** 2 MiB for descriptors and 1 MiB for history, counting keys/JSON as UTF-16 bytes, with the existing 50-entry history LRU. Keep complete membership/revision fingerprints rather than introducing snapshot references. Descriptor refusal never evicts older records or work; it warns, protects unretained work and permits storage-only retry. History refusal retains bounded in-page snapshots and warns; cached reads preserve LRU promotion. Benefit: explicit limits without weakened qualification. **Deferred hypothesis:** compact snapshot references may reduce repeated membership if representative usage reaches these budgets frequently. Cost/risk remains revision lookup, reload availability and identity isolation; that demonstrated pressure, not this implementation alone, is the trigger. |
| R19 | **U1 observed lifecycle constraint:** moving [URL synchronization](../../src/hooks/useUrlSearchSync.ts) into the parent route broke all eight existing direct-Forward detail history cases; restoring a first-child synchronization owner made those cases pass unchanged. Existing [return](../../src/hooks/useReturnFromDetail.ts) and placement effects depend on this ordering. | **Deferred refactoring hypothesis:** make this admission-before-consumer boundary explicit if the route/detail effect structure is reorganized again. Benefit: a presentation move need not accidentally change navigation settlement. Cost/risk: lifecycle coordination across history, continuity, detail and layout, with meaningful regression risk; retain the existing direct-detail assertions. Trigger: another required route/detail ownership change demonstrates that the documented first-child boundary is insufficient. No history-policy rewrite or new navigation engine is authorized by this finding. |

**Polish follow-up for R7:** the same expected `[superseded, observed]` versus
actual `[observed, observed]` bulk-editor receipt pair recurred in an early polish
focused run. The final 611-case full gate passed without a causal repair to that
path. R7 remains an unexplained intermittent, not a repaired Upload regression;
retain its request-hold/observation invariant for a future recurrence.

**Shared-foundation gate follow-up, 18 November (related to R7/R8):** the full
retry-free browser run passed 596 cases and failed the API-fixture Table B10 case
in [forced-seek](../../e2e/local/forced-seek.spec.ts#L70) before geometry sampling:
`B10 native wheel did not stop before held sampling`. That unchanged case passed
alone. The preserved trace shows an enclosing twelve-frame wait taking 2.51 seconds,
against the probe's one-second bound for three stable scroll frames, with no new
wheel command during that wait. This supports a frame-delay hypothesis, not a proven
cause or a scrolling repair. The operator accepted this investigated gate exception;
the full suite is not claimed green. If it recurs, capture bounded frame times and
scroll offsets to distinguish scheduling delay from continuing scroll before changing
readiness logic. Benefit: diagnose the actual failed prerequisite; cost/risk: local
probe complexity and extra runs. No timeout increase, retry or weaker geometry assertion
was introduced. Raw synthetic artifacts remain ignored, not committed.

**U3 resource follow-up for R14:** [browser hashing](../../src/lib/upload-commands.ts)
uses WebCrypto's whole-file SHA-1 with one active file, not an incremental digest.
This is a source constraint, not a measured large-file or phone failure. A proven
incremental/worker facility could reduce peak byte-buffer pressure if representative,
separately authorized large-file use demonstrates a problem. Cost/risk: dependency
approval, worker/file lifetime and digest compatibility. Do not infer capacity from
small fixtures or start another performance campaign now.

**U3 witnesses for B2/B3:** same-name/different-content and repeated-content local
attempts retain independent partial outcomes and deduplicated canonical membership;
the synthetic loader does not establish server attempt isolation or reproduce data
loss. Expired/missing-status witnesses prove read-only image reconciliation and
retained identity, not terminal-status durability. Backend repairs remain deferred
under their existing permission boundaries.

**U3 existing-read contract finding:** [singleton reads](../../../media-api/app/lib/elasticsearch/ElasticSearch.scala#L141)
use real-time document GET, while batch browsing uses indexed search. This is not a
backend defect or permission for a new endpoint: the existing ID-scoped count supplies
the necessary visibility check. Benefit: a newly readable image cannot prematurely
end observation and strand an empty batch. Cost: one bounded count after a successful
GET; no catalogue-wide query, cache or rank repair. Further observation aggregation
would need a demonstrated workload benefit and separate selection, not this finding.

**U3 activity opportunity, related to R12/R15:** [upload activity](../../src/components/UploadActivity.tsx)
and [image activity](../../src/components/ImageActivityFrame.tsx) have independent
owners and can coexist. A later unified attention/navigation affordance could reduce
competing phone controls while preserving captured edit targets and per-file outcomes.
Cost/risk: unlike lifetimes, receipt semantics, keyboard focus and limited screen space.
Trigger: U4's working batches demonstrate a concrete navigation need; do not merge
the stores or build a generalized activity system during U3.

**U3 validation follow-up, related to R7/R8:** the existing
[selection/sort witness](../../e2e/local/selections.spec.ts#L147) once lost its
browser execution context during a placement read in a full run. The unchanged
case passed in isolation and in the final full suite; no cause or product repair
is claimed. If it recurs, distinguish browser/fixture reload from geometry failure
using the retained local trace before changing behavior or assertions. Benefit:
trustworthy gates; cost/risk: focused lifecycle/runner investigation, not broader
selection refactoring. It is not a new U3 or live-upload gate.

#### U4 Boundary Findings

| ID | Evidence and constraint | Benefit, cost/risk and trigger |
| --- | --- | --- |
| R20 | **Observed read-contract mismatch:** raw mget can return lifecycle-excluded images that search/count/keys omit; see [the server witness](../../../media-api/test/lib/elasticsearch/ElasticSearchTest.scala#L2679) and [submitted paging](../../src/dal/api-data-source.ts). U4 initially mixed those sets, allowing a buffer to appear complete before its last live member. | **Repaired in U4:** bounded ID-scoped search hydration shares count/key qualification, restores local order and retains the descriptor. Benefit: coherent traversal without a backend change or broader lifecycle redesign. **Future hypothesis:** make lookup-versus-query eligibility explicit at the DAL boundary if another consumer needs to combine them. Cost/risk: wider type/caller changes; trigger that concrete next consumer, not general read unification. |
| R21 | **Observed privacy boundary:** the existing [dedup setter](../../src/lib/orchestration/search.ts) logged complete serialized params, including U4's in-memory recent identity in Vite. The owning browser witness reproduced it with a synthetic identity. | **Repaired in U4:** remove payload logging; permission/identity projections and persisted fingerprints remain separate. Benefit: identity does not reach development console output. **Future hypothesis:** review/redact diagnostic inputs when another sensitive projection or telemetry consumer is selected. Cost: reduced raw diagnostic detail; no new logging framework, payload capture or broad audit now. |
| R22 | **Observed context-policy gap:** [sort continuity](../../src/lib/search-continuity.ts) excluded selection anchors for `imageScope` but not the new recent-upload scope, so dormant Search selection could replace the current Upload focus. | **Repaired in U4:** both Upload scopes keep selection dormant; ordinary Search selected-sort behavior is retained. Benefit: correct represented position without clearing selection. **Future hypothesis:** one small context predicate could prevent repeated variant checks if another scope/consumer needs them. Cost/risk: import/initialization coupling and history semantics; trigger that additional consumer, not a workspace abstraction now. |
| R23 | **Observed browser boundary:** direct UUID generation in Upload mount/submission fails on HTTP LAN origins, while [the existing history mint](../../src/lib/orchestration/history-key.ts) already has a `getRandomValues` fallback. | **Repaired in U4:** recent entry needs no nonce and upload identities reuse that existing mint. Benefit: phone/LAN entry does not crash. Cost: reuse of a currently history-named primitive; consider extraction only if another necessary ID owner needs it. This does not make secure-context hashing or real-service CORS work on arbitrary HTTP origins. |
| R24 | **Observed history boundary:** a document-specific recent key invalidated persisted snapshots and cursor entries after reload; [recent browsing](../../src/routes/search.tsx) now has a stable identity-free route key. | **Repaired in U4:** reload/Back and deep-detail traversal resolve through the current authenticated query, without persisting email or grants. Benefit: meaningful recent history under the existing reload-only session policy. **Future hypothesis:** in-page account switching would require explicit principal-transition invalidation across these owners. Cost/risk: privacy, caches and operation authority; trigger separately selected account-switch/session-refresh work, not persisted identities or cross-tab machinery now. |

**B2 remains source-derived, not closed by U4:** the [transfer owner](../../src/stores/upload-jobs-store.ts)
can start another transfer before backend processing finishes. One browser transfer
at a time therefore does not establish isolation for the backend's shared
uploader/filename pending destination. Synthetic multi-file fixtures exercise local
outcomes, not that destination. No bounded real-backend collision witness was run,
and no stronger same-name reliability is promised. Such a witness/disposition and
backend permission remain required before making that stronger claim.

**U4 local-trial browsing churn, related to R20/R22:** the local 150-file trial
recorded 150 scoped-page starts (30 HTTP 200, 120 promise rejections), 298
multi-ID scope counts and 152 single-ID counts. The retained last-100-operation
timeline contains 14 rejected pages, all `AbortError`; it does not independently
classify all 120 rejections or prove server-side cancellation. The owning source
explains the request shape: each verified completion publishes membership in
[the job store](../../src/stores/upload-jobs-store.ts); the
[membership registry](../../src/lib/browsing-context.tsx) increments revision;
[URL synchronization](../../src/hooks/useUrlSearchSync.ts) starts a replacement
search for that revision; [search discovery](../../src/stores/search-store.ts)
aborts the previous page and independently requests ticker/count metadata without
that page's abort signal. Meanwhile [submitted paging](../../src/dal/api-data-source.ts)
counts the same scope before ordered hydration. For 150 singleton arrivals this
predicts 150 page starts and 300 batch counts: 298 multi-ID plus two one-ID counts,
with the other 150 single-ID counts used for required visibility verification.
The separate 1,325 upload-status reads follow the job observation policy and are
not explained by browse restarts.

**Implemented in U2:** membership-only browse refresh retains the latest revision
while a read is in flight, then admits it on completion. Authoritative membership,
receipts and explicit navigation remain current; there is no timer or new cache.
Batch discovery reuses the authoritative page total instead of also requesting ticker
counts. The held-arrival API witness reproduced four read starts and now requires two,
while retaining input node, focus, composition, selection and represented field position.
Lifecycle-excluded-member, ordered-page and history witnesses remain. Cost/risk is the
existing request lifetime and continuity ownership, not an upload-concurrency change.
No raw mget shortcut, optimistic visibility or batching of upload writes follows.
Elapsed-time improvement and the share of backend work saved remain unmeasured;
browser cancellation alone is not upstream cancellation.

**U4 arrival animation investigation, same boundary:** operator observed repeated
phantom-focus feedback while images arrived, and noted that Upload presentation
would be redesigned with U2 form density. At the U4 baseline, source inspection found
membership refresh called `captureSearchContinuity(false)` in
[URL synchronization](../../src/hooks/useUrlSearchSync.ts). The
[continuity chooser](../../src/lib/search-continuity.ts) prefers remembered focus,
otherwise an on-demand viewport-centre image; with no rendered images there is
no centre anchor. This is per refresh, not continuous scroll-frame tracking.
[Search publication](../../src/stores/search-store.ts) maps the anchor into
phantom placement and, after initial load, also sets `_phantomPulseImageId`.
That marker does not distinguish background membership maintenance from a user
transition, and is not conditioned on actual scroll displacement.
[Effect 9](../../src/hooks/useScrollEffects.ts) separately restores the captured
ratio, possibly writing an unchanged or clamped offset. The
[pulse CSS](../../src/index.css) changes box shadow, not layout; arrival
translation/fade is a different class. Thus a pulse is not proof that the view
was moved or a new centre elected every frame. The original passive collector
did not record exact pulse targets or scroll writes, so no per-arrival movement
or animation-restart count is claimed.

**Implemented in U2:** maintenance provenance preserves surviving-image and active
form-interior continuity without phantom navigation pulses. First-page and farther
anchor publication retain placement; a deliberate-navigation control still pulses.
Benefit: routine arrivals do not announce a focus transition. Shared history and
detail-return semantics remain the risk boundary, with their existing witnesses
retained. This is separate from refresh-frequency reduction, not a Grid-specific
animation patch or globally disabled anchoring. No new live movement measurement
is claimed.

**Operator boundary after prototype review:** retain the shared canonical-image
browsing model. A Kahuna-style attempt-slot/pending-row model or second browsing
engine was discussed and rejected, not selected as U2 work. Reuse U2-proto's bounded
measurement, field anchoring and draft ownership; do not repeat its proof campaign.
R2 and R9 identify the necessary controlled-field and form-policy boundaries to
evaluate during integration; R10 is limited to adapter clarity actually needed,
with R11/R22 conditional on a concrete touched dependency or consumer. This does
not select broad refactoring, global form exposure, pending-arrival metadata,
transport tuning or backend work. Embedded JPEG extraction was researched only
as optional faster display and then declined for now; no dependency or preview
implementation was added. UI polish remains after real U2 integration.

#### U2 Follow-on Opportunities

Recorded under Section 7 after U2 implementation, 14 November. These are source-backed
constraints and proposed improvements, not new runtime findings, U2 closure gates or
permission to implement them. R2 above owns the cross-surface draft-handoff opportunity;
R15/R17 already own broader batch navigation and field/zoom customization.

| ID | Evidence and observation | Proposed benefit, cost/risk and trigger |
| --- | --- | --- |
| R25 | **U5 source:** [Form fields and receipts](../../src/components/MetadataTextEditor.tsx) now expose queued/saving/observed/uncertain outcomes and Stop controls. The [draft owner](../../src/stores/metadata-drafts-store.ts) clears a successful observed save only for its captured revision; failed/uncertain intent remains, and unchanged blur does not resubmit it. Drafts and receipts survive SPA navigation, but there is still no explicit per-field discard or global jump to outstanding edits. | **Assessed and deferred in U5:** a small outstanding-edits summary and deliberate discard could help find unfinished work or abandon unsent intent. Cost/risk: shared images across batches, changed canonical values and preserving uncertain receipts; discard must not imply undoing a dispatched write. Trigger: operator selects this interaction or demonstrates difficulty finding/abandoning retained work. Reuse existing activity/navigation owners; no Places panel, durable operation store or global editor framework is implied. |
| R26 | **U5 source and witnesses:** the [draft store](../../src/stores/metadata-drafts-store.ts) retains baseline and revision; a draft can still cover a newer canonical value. Revision-based acknowledgement fixes the demonstrated A-to-B-to-A own-save race, while [commands](../../src/lib/grid-commands.ts) preserve fresh unrelated overrides. Neither establishes concurrent-editor conflict prevention or supplies a comparison UI. | **Assessed and deferred in U5:** bounded comparison/keep/discard could show that the underlying value changed before replacement. Cost/risk: distinguishing own writes, delayed readback and another editor's changes; a comparison is not an atomic save guarantee. Trigger: operator selects the interaction or demonstrates a conflicting-edit workflow. Preserve GRID-020's accepted residual race; no automatic merge/retry, new versioning API or universal conflict subsystem is selected. |
| R27 | **Source and geometry evidence:** [MeasuredGrid](../../src/components/MeasuredGrid.tsx#L34) places a non-sticky preview at the start of each natural-height form; the retained tall-form journeys intentionally read interiors below that preview. The image can therefore leave view while lower metadata is being edited. No loss of identity or measured user error is claimed. | **Hypothesis:** a desktop preview constrained to stay within its own form while scrolling could keep the image available for checking credit/description, without opening detail or moving the field being edited. Cost/risk: sticky geometry must not alter anchor election, overlap the next image or consume scarce keyboard space on phones; virtualized disposal, graphic-image protection and detail entry must remain correct. Trigger: operator use of real forms demonstrates a need to keep the image visible. Evaluate separately from R17's field visibility and zoom choices; this is not permission for a second metadata panel or fixed-height clipping. |
| R28 | **Source, extended by U5:** [draft updates](../../src/stores/metadata-drafts-store.ts) copy sparse maps, but successful observed saves now remove their captured draft revision. Separately, [metadata saves](../../src/stores/metadata-editor-store.ts) retain completed receipts, copy the save map on updates and search it for repeated intent; [field feedback](../../src/components/MetadataEditing.tsx) searches retained saves. The 10,000-distinct-image freshness budget does not bound repeated saves on the same image. This is a retention/allocation observation, not measured typing or memory degradation. | **Deferred hypothesis:** localize subscriptions/lookups or compact eligible completed history if representative long-session editing attributes material cost here. Benefit: less work as save history grows, not merely as dirty-image count grows. Cost/risk: losing uncertainty, per-target outcomes or arrow receipt identities; never silently evict unresolved work or freshness protection. Trigger: meaningful measured input latency or retained-memory pressure during actual editing. Inspect drafts and receipts separately; no arbitrary draft cap, automatic pruning or speculative store rewrite is approved. |

##### Recommended Execution Placement

These are recommended homes for explicit selection, not additions to unit acceptance
criteria or approval to implement every opportunity. None reopens U2.

| Opportunity | Natural step/session | Sequencing and boundary |
| --- | --- | --- |
| R25: outstanding edits and discard | Separately selected follow-up; [U8](#u8-visual-review-and-parity-acceptance) can expose concrete need | Assessed and deferred in U5. Real pending/rejected/uncertain outcomes now exist; select navigation/discard only with clear interaction semantics, coordinating with R2. Abandoning an unsent draft must not imply undoing a dispatched write or deleting uncertainty. |
| R26: changed canonical value beneath a draft | Separately selected follow-up; U8 can exercise actual editing behavior | Assessed and deferred in U5. Authoritative reads and revisioned acknowledgements are implemented, not comparison/keep/discard UI or cross-client conflict prevention. Select an additional interaction explicitly after a demonstrated need. |
| R27: form-bounded sticky preview | Operator-led UI polish after U2, before U5 | This is independent of save transport and is the most natural candidate for the planned polish session if the operator wants it. Keep it a bounded layout/interaction change with existing tall-form, field-anchor, density and compact witnesses. If not selected now, leave it for [U8's visual review](#u8-visual-review-and-parity-acceptance); it must not delay U5. |
| R28: draft/receipt retention and update costs | Evidence-led local tuning after U5; [U8](#u8-visual-review-and-parity-acceptance) is also an observation point | Distinguish outstanding drafts from accumulated completed receipts, including repeated edits to the same IDs. Attribute material typing or memory cost before selecting localized updates or safe history compaction. Existing evidence comes first; performance campaigns remain operator-run. No scheduled rewrite or additional U8 gate follows from source complexity alone. |

#### Navigation and Editing-Scope Opportunities

| ID | Evidence and observation | Proposed benefit, cost/risk and trigger |
| --- | --- | --- |
| R34 | **U4.5 source observation:** [section bounds](../../src/dal/upload-page-reader.ts) count upper/lower sources for cursor translation; submitted-order paging also performs its own authoritative membership count in [ApiDataSource](../../src/dal/api-data-source.ts). This can repeat a bounded count within one composed read. No latency or backend-work saving was measured. | **Deferred hypothesis:** reuse request-local authoritative count evidence where its query/generation is identical, reducing duplicate work without a new cache. Cost/risk: stale boundaries, lifecycle omissions, independent failures and cursor/rank consistency. Trigger: a selected request-lifetime change or representative evidence attributes meaningful cost here. No timer, parallel cache, transport tuning or performance campaign is selected. |
| R29 | [SearchBar](../../src/components/SearchBar.tsx) labels `returnToBrowsing(..., "/upload")` as My recent uploads, but [the return owner](../../src/lib/browsing-navigation.ts) restores the departed batch or detail parameters. [DetailNavigation](../../src/components/DetailNavigation.tsx) also labels Upload detail's return Back to search. Hosted TEST reproduced both mismatches even with zero retained batches: the latter returned to Upload Form; leaving an Upload detail via Home and choosing My recent uploads reopened detail. The subsequent two-batch check also restored the older selected batch through that label. | **Selected for U4.5:** keep the familiar main entry label but make fresh entry show the newest batch/top without detail; history and inspection return preserve their actual destination. Upload detail says Back to uploads. Benefit: predictable navigation without removing membership or Form. Cost/risk: departure/history/position and compact controls; preserve meaningful history witnesses. No global history rewrite. |
| R30 | [Job updates and their subscription](../../src/stores/upload-jobs-store.ts) scan retained batches/attempts, recompute membership and serialize changed batches; [descriptor saving](../../src/lib/local-batch-storage.ts) scans storage to enforce its budget. **U5 adds a concrete path:** each active follow-up subscriber in [startup](../../src/main.tsx) reports on every metadata-store notification, even when its own summaries are unchanged. Reports still replace the attempt/batch and reach persistence, although follow-up fields are transient and excluded from the descriptor schema. The five-choice selector limit does not bound this work. No latency saving or regression has been measured. | **Deferred improvement:** suppress unchanged follow-up reports and/or avoid persistence when no persisted fact changed, before considering indexed lookup or wider reorganization. Benefit: less repeated rendering/serialization during overlapping uploads and saves. Cost/risk: missing a pending/uncertain transition, stale activity or lost interruption facts; preserve those witnesses. Trigger: selected lifecycle work or representative tuning attributes meaningful work to this path. No timer, storage framework, silent eviction or autonomous campaign is selected. |
| R35 | **U5 save-fairness constraint:** [the metadata pump](../../src/stores/metadata-editor-store.ts) acquires one shared slot for an entire captured action and releases it only after all groups and their observation settle. Later individual autosaves, Details commits, Labels or upload follow-ups can wait behind that action. The held-arrow browser journey exposed independent Batch and queued source-image controls; it is not a latency benchmark. Smaller groups bound execution/readback but do not interleave other actions. | **Assess in the next authorized local tuning exercise:** edit an unrelated image while a representative batch runs; distinguish queue wait, execution/acknowledgement and canonical visibility for that individual save and the batch. Benefit of possible group-boundary yielding: responsive individual editing without necessarily increasing backend pressure. Cost/risk: same-image ordering, overlapping reservations, observation ownership, Stop behavior and starvation in either direction. Select scheduling changes only if observed waiting is unacceptable; speed knobs alone do not change admission order. No priority queue, job platform, automatic retry or new fairness guarantee is authorized here. |
| R31 | [UploadPage](../../src/routes/search.tsx) currently admits one batch or one recent query; [URL synchronization](../../src/hooks/useUrlSearchSync.ts) and [detail](../../src/components/ImageDetail.tsx) use the active browsing state for query/traversal. The proposed combined page has independently ordered sections and a lower query whose exclusion changes with the open batch. One flat query/ordinal cannot describe both. This is an integration constraint, not a defect in the current single-source view. | **Address in U4.5:** explicit section provenance, independent read qualification and bounded composition under one placement owner. Benefit: no crossed detail traversal, stale section publication or accidental page-wide edit scope. Cost/risk: cursors, counts/ranks, headers, history and upper-arrival compensation while reading below. Select only the adapter needed here; no cloned search stores, catalogue geometry, fake images or universal workspace framework. |
| R32 | [Batch membership](../../src/lib/browsing-context.tsx), [selection](../../src/stores/selection-store.ts) and [captured label operations](../../src/lib/label-operation.ts) are independent owners. A retained batch could supply an explicit snapshot of canonical image IDs to ordinary Search selection without redefining the upload attempt record. Current UI provides no such handoff. | **Deferred by operator:** consider Select this batch in Search after U5, exposing the captured set visibly and defining replace-versus-add for an existing selection. Benefit: reuse the existing multi-image editor for retained work. Cost/risk: unavailable/denied IDs, pending arrivals, selection hydration, local-reference/history qualification and accidentally retargeting prior operations. Deselecting must not rewrite the batch; later completions must not silently expand the selection. No server persistence or generalized set framework is implied. |
| R33 | [Upload's route](../../src/routes/search.tsx) omits the selection metadata panel and [ImageGrid](../../src/components/ImageGrid.tsx) enables selection only for Search. Whole-batch Form arrows do not address editing a subset; other Upload densities currently offer browsing and individual detail, not selection editing. | **Deferred by operator:** consider explicit subset selection and the existing multi-image editor within Upload after the basic workflow works. Benefit: apply a change to three images rather than the whole batch, particularly in Grid/Table/Justified. Cost/risk: coexistence with whole-batch arrows, cross-section selection, dormant library selection and redundant Form panels. Keep selected-target and batch-target meanings explicit across densities; decide cross-section behavior separately. No checkbox/panel implementation or U5 gate now. |

**R35 local upload-follow-up evidence, 18 November:** an operator-submitted batch
of 100 JPEGs (27,774,867 bytes) used Vite and operator-confirmed local Grid,
ES and LocalStack, with uploads and editing enabled. The first-edit freshness
repair was present; concurrency remained three and minimum start spacing 250ms.
A bounded passive fetch/activity observer ran from file selection to completion;
its capture was not truncated and its wrappers/listeners were removed afterward.
No request bodies, credentials, signed URLs or image identities were retained.

All 100 storage PUTs completed by 26.805 seconds. Required upload visibility/count
traffic ended by 32.160 seconds; final activity completion was 239.702 seconds.
All 100 metadata PUTs returned 200 (median 40ms, p95 67ms), with at most one PUT
in flight. Gaps from one PUT's response to the next PUT's start totalled 229.352
seconds (median 1.469s, p95 5.990s). Those gaps include prerequisite reads and
client/backend visibility waits, not pure browser CPU idle or measured backend
processing time. All 100 saves were acknowledged and canonically observed with
zero exclusions; a subsequent single bounded mget confirmed every description.
The known 100 rejected QUEUED updates remained separate from successful ingestion.

The source explains the largely serial tail: filename follow-ups are separate
single-image actions, and each holds the shared slot through canonical observation.
Their start gaps exceed the configured pacing interval; simply reducing that
interval does not address this bottleneck. This is one local diagnostic capture,
not a matched Kahuna comparison or shared-server capacity result. Earlier failed
follow-ups skipped work and are not a valid faster baseline. Consider bounded
shared execution/readback for independent ready follow-ups before increasing
pressure; scheduling changes still require selection and must preserve distinct
values, receipts, authority, same-image ordering and no automatic replay. Individual
save fairness behind a large action remains a separate, unmeasured R35 question.

**Selected repair after that observation:** ready independent single-image metadata
saves now co-admit into groups of at most 100, sharing existing paced execution and
canonical readback while retaining each save's value, outcome, reservation and Stop.
Collection uses already-waiting work, not a timer or later-arrival promise, and stops
at a same-image successor, multi-target action or unresolved command conflict. Unsent
Form revisions still coalesce. Image-local command/readback failures remain local;
session invalidation still stops the group. This repairs the observed serial-follow-up
path without changing speed controls. It does not resolve large-action fairness.

**Post-repair local capture, 18 November:** another 100-file submission, using the
next sample files and the same confirmed local topology, transferred 30,307,254 bytes.
Storage PUTs finished at 27.245 seconds (previously 26.805); the last metadata PUT
finished at 49.344 seconds (previously 238.450), and activity completed at 54.702
seconds (previously 239.702). All 100 description saves were acknowledged/observed,
with zero exclusions, and a subsequent bounded mget confirmed 100 matching values.
Mget request count fell from 319 to 19. Metadata PUT median/p95 were 56/140ms,
versus 40/67ms previously; completion improved through scheduling, not quicker
individual writes. Maximum overlapping metadata PUTs was two, versus one. The
existing 3/250 controls remained unchanged. This is a 77% elapsed-time reduction
across two local diagnostic submissions, not a matched benchmark: files/bytes and
cache/server conditions differ. No Kahuna or shared-environment comparison follows.

The post-repair capture retained 100 prepare/storage successes and the known 100
QUEUED-update 400s. Count traffic contained 208 successes and 32 aborted requests;
these were not failed metadata writes. The capture ended normally without truncation;
fetch was restored, observers removed and the retained timing global deleted.

**Operator-authorized Kahuna comparison, same local stack:** the next 100 sample
files totalled 27,345,698 bytes. A separately validated fetch/XHR observer measured
file selection through current-submission job descriptions, excluding recent rows.
One bulk prepare covered 100 unique images. All 100 storage PUTs returned 200 and
finished by 3.751 seconds; up to 100 were outstanding, including browser-queued work.
The first job became uploaded at 4.405 seconds, and its description was present by
5.662 seconds. All jobs were uploaded at 35.471 seconds; all descriptions were
present in canonical job images at 37.960 seconds. All 100 initially lacked a
description. Metadata PUTs all returned 200, finishing by 37.335 seconds, with
median/p95 1.189/2.452 seconds and up to 14 outstanding. The known 100 QUEUED
rejections remained; no failed job was observed. There were 747 status reads and
550 singleton starts, of which 540 had completed and ten remained outstanding at
the observation cutoff; those ten are not classified as failed requests.

A subsequent bounded mget verified 100 distinct images and matching descriptions.
The observer reported no errors or truncation, restored fetch/XHR descriptors and
removed listeners; its retained global was deleted. There were 202 sampled model
progress changes, not 202 independently observed paints. The operator reported quick
first-image readiness and useful, unevenly progressing counters. Kahuna's uploaded
state precedes metadata completion; its canonical job-image readiness also does not
supply Kupua's exact-ID indexed-upload-count witness. Different files, payloads,
cache conditions, request patterns and readiness contracts prevent a controlled
throughput ranking. Nonetheless this ballpark run completed descriptions about
16.7 seconds before the repaired Kupua run (38.0 versus 54.7 seconds), with substantially
more outstanding transfers/writes. No speed policy or product behavior changed for
this comparison, and no shared-environment capacity claim follows.

**Progress opportunity observed in the same capture:** activity changed from 100
to 99, 95, 75 and 46 in progress, then to 100 completed at group settlement. The
operator also reported stale/jumping batch-chooser counts; that control was not
instrumented. The metadata owner currently finishes individual save records at
group completion, so activity does not report each independently settled member.
Consider per-save terminal progress without releasing shared execution/observation
ownership early. Benefit: truthful incremental feedback; risk: confusing published
visibility, pending commands and failed/unknown outcomes. Select only after checking
the relevant receipt transition, without adding artificial progress or delaying
work. No counter or chooser repair was selected in this timing assessment.

#### Next Investigation: Overlapping Upload and Edits

**Operator direction, 18 November:** aim to exceed Kahuna's speed without losing
data or trustworthy outcomes. The existing ingestion/edit separation is not rejected;
the complete workflow must become usable quickly. Current conservative pacing is not
a measured capacity requirement. Counter progression is secondary, and matching
Kahuna's arrow appearance is later work. Neither is a substitute for correct fast saves.

Users reportedly repeat Kahuna batch arrows because they do not trust the result.
Contention with ongoing uploads or rapid edits to multiple fields/batches is an
operator hypothesis. The local witness below demonstrates filename-description loss
during overlapping edits, but does not establish the cause or frequency of those
user reports. Distinguish excluded late arrivals, delayed visibility and unclear
feedback from lost values.

Recommended separately selected witnesses, using small cohorts before larger timing runs:

1. After ingestion and automatic follow-ups settle, apply different fields in quick
  succession. Establish exact per-field target/value expectations as a control.
2. While both ingestion and automatic filename/preset saves remain active, apply
  different field arrows and one individual edit. Capture actual overlap, the
  source's separate save, each arrow's known targets and pending exclusions. Later
  arrivals do not retroactively join a captured action under the current contract.
3. If needed to isolate the cause, repeat during the metadata-follow-up tail after
  ingestion ends, then test a deliberate repeated idempotent overwrite or a second
  batch. Do not manufacture concurrency claims when the relevant work already ended.
4. Keep Search selection bulk editing, settled Upload arrows and large-action
  single-save fairness as distinct workflows. Success in one cannot certify another.

Use Kahuna's real controls and recipient semantics for its comparison, not Kupua's
internal hooks or assumed offscreen targeting. Record admission, dispatch, acknowledgement,
canonical values and visible completion separately. Repair concrete correctness failures
before changing one pressure control at a time; do not copy Kahuna's outstanding-request
counts or weaken safeguards merely to match a completion counter.

Fresh, similarly sized cohorts suffice for initial correctness and ballpark timing.
The operator offered selected hard deletion or an operator-run `setup.sh --clean`
as possible future ways to reuse identical files; no destructive action is selected.
Reuploads with retained descriptions are not equivalent fresh-upload work, and an
ES-only deletion does not prove Grid storage, edits or status were reset. Before any
matched reset trial, choose and verify the supported local cleanup boundary, exact
targets and effects with the operator, preserving needed local configuration. No
direct-ES shortcut, invented hard-delete endpoint or broad wipe follows from this plan.

#### Local Overlap Witnesses, 18 November

Operator-authorized local Grid/ES/LocalStack only; no speed constants or product
code changed. Browser instrumentation filled ordinary Form inputs and activated
their arrow controls, respecting each app's readiness and blur-to-save behavior.
The two arrows were approximately 200ms apart, followed by one individual Credit
change. These are rapid browser-driven functional witnesses, not physical-input
timings, incidence estimates or matched benchmarks. No request delays were injected.

Both cohorts contained 20 fresh JPEGs without preset labels. Kupua used 4,548,554
bytes; Kahuna used 5,646,481 bytes. Different images, readiness contracts and actual
recipient counts prevent a fair throughput ratio. Capture started before file
selection and covered fetch, plus XHR in Kahuna; identities and payloads remained
in browser memory. All observed storage destinations were local. Known queued-status
400 responses were recorded separately from successful ingestion. The accepted
captures had no observer errors or truncation.

| Observation | Kupua | Kahuna |
|---|---|---|
| Last storage PUT acknowledged | 3.815s | 1.540s |
| All ingestion/readability reported by native app | 11.353s, includes indexed visibility | 7.877s, uploaded state |
| Credit / Byline arrow times | 5.872s / 6.073s | 2.368s / 2.544s |
| Recipients at each arrow | Six peers; source saved separately | Two editors, including source |
| Actual overlap | Seven complete, 13 processing/visibility, seven filename follow-ups pending | Two uploaded, 18 indexing, filename metadata PUTs active |
| Last metadata PUT acknowledged | 32.586s | 7.919s |
| Metadata PUTs | 34 | 27 |
| Pre-cleanup canonical descriptions | 20/20 correct | 18/20 correct; both arrow recipients empty |
| Pre-cleanup Credit / Byline | 20/20 expected for each field | 20/20 expected for each field |
| Unrelated metadata / excluded arrivals | Preserved; 13 late arrivals unchanged | Preserved; 18 late arrivals unchanged |

**Kupua:** the newer individual source Credit superseded its earlier unsent draft;
all intended values were independently verified. Activity progressed from 20 pending
to 19 at 6.600s, to 13 at 14.295s, then 20 completed at 37.808s. The 23.5-second
plateau concealed ongoing work, not a failed upload. The chooser separately reported
ingested images; activity includes automatic follow-ups, not explicit arrow saves.
The Credit arrow waited until 14.295s to enter saving and finished at 20.999s; Byline
ran 21.034-27.722s, source Byline 27.740-29.094s, and individual Credit
29.140-37.727s. This is a concrete queue-wait witness for the existing ownership
model, not proof that a generic fairness redesign is necessary. Incremental counters
alone would not remove those waits.

**Kahuna:** the two filename-description PUTs returned 200 at 2.468s and 2.512s.
Overlapping Credit/Byline/individual editor PUTs omitted description; canonical
reads later confirmed it empty on exactly those two images. The full-object
replacement contract is explicit in
[editsService.update](../../../kahuna/public/js/edits/service.js#L157), while
[the upload editor](../../../kahuna/public/js/upload/jobs/required-metadata-editor.js#L38)
builds its override from its current local metadata and broadcasts arrows to
mounted editable upload editors. The other 18 images retained their filename
descriptions. This is an observed overwrite of automatic metadata, not a failed
HTTP request or evidence that the tested Credit/Byline arrows themselves were lost.

Kahuna's remaining counter advanced through every count and disappeared at 7.877s,
when 15 descriptions were visible in its job models. Only 18 were present by 8.502s.
The capture counted 646 singleton reads; 413 began after 8.502s, all for the two
affected images, and reads continued through the approximately 62-second capture
boundary. That tail is right-censored, not a measured termination time. Its
[readback matcher](../../../kahuna/public/js/edits/service.js#L39) compares the whole
edit object, consistent with polling for versions replaced by subsequent writes.
Early UI completion must not be presented as completion of all background work.

**Controls and cleanup:** two earlier Kupua cohorts were not overlap witnesses:
one probe read a stale imported upload store, and the next attempted a mounted but
not yet editable input. Neither dispatched an arrow or experimental field edit;
their description results were independently verified. The driver was corrected
and a single settled-image edit/restore verified before the accepted witness.
Kahuna was reloaded before its run so previous completed-current jobs could not
join its broadcasts. After evidence capture, all seven Kupua recipients and both
Kahuna recipients had Credit/Byline restored through UI, with canonical checks.
The two lost Kahuna descriptions were explicitly repaired as cleanup, not silently
counted as successful experiment outcomes. Final Kahuna checks passed 20/20
descriptions, original Credit/Byline and unrelated metadata. Observers and transport
wrappers were restored; uploaded samples retained. No backend changes, reset,
deletion, automatic mutation replay or TEST/PROD work followed.

**Next decision:** retain this multi-field preservation witness while reducing
Kupua's demonstrated queue/readback waits. Kahuna's visible speed remains useful
evidence; its correctness failure is not justification for accepting slow Kupua
operation. Search bulk edits, settled-batch rapid arrows, repeated arrows and
large-action fairness remain separate, untested contexts in this investigation.

#### Queue/Readback Investigation, 19 November

After the operator restarted the apps, both local Upload pages were reopened.
Kupua's initial 401 cleared after the operator reloaded. No further uploads,
metadata writes, resets or live timing captures were performed.

The initial hypothesis needs narrowing: releasing the metadata queue slot after
dispatch is not an isolated repair. The [metadata pump](../../src/stores/metadata-editor-store.ts)
holds it through observation, but [freshness admission](../../src/lib/image-read-freshness.ts)
also permits only one active observation group. Releasing only the queue would
leave subsequent operations refused as busy. Supporting independent concurrent
groups would require a broader ownership change, and would not by itself remove
the observed Credit/Byline delay on the same six images. Do not select that redesign
merely because unrelated saves can be shown to wait too.

The smaller timing mechanism is in [operation observation](../../src/lib/label-operation.ts):
one early read may run during dispatch; further attempts wait for dispatch to end.
The third and final attempt is spaced halfway through the remaining observation
window, with a minimum one-second interval. A second read that is too early can
therefore leave several seconds without another check even after data is visible.

A temporary fake-clock probe in the existing metadata component suite used two
acknowledged saves, existing 250ms write spacing, and visibility exactly two seconds
after each acknowledgement. A later save was submitted at 250ms. Two cases varied
only whether it targeted an earlier image or an independent image:

| Event | Both cases |
|---|---:|
| Initial write acknowledgements | 0ms, 250ms |
| Initial group's readback attempts | 0ms, 1,000ms, 5,625ms |
| Both initial values available in fixture | 2,250ms |
| Later save first dispatched | 5,625ms |
| Available-but-not-rechecked interval | 3,375ms |

Both probes passed their timing assertions. This is deterministic characterization
of the actual operation/store code, not a live benchmark, measured server visibility
delay or attribution of the entire earlier 23-second queue wait. The probe was
removed afterward; all 96 existing tests in the metadata component and label-operation
suites passed (6.48s measured runner duration). Existing delayed-four-second visibility,
unknown-outcome, Stop and shared-queue witnesses were retained unchanged. No permanent
source/test changes or full unit/E2E reruns followed this investigation.

**Recommendation, pending approval:** investigate more regular bounded readback
within the existing confirmation window before redesigning queue ownership. Keep
write concurrency/spacing, exact-value verification, same-image ordering and uncertain
outcome fences unchanged. Merely moving the third check earlier sacrifices the
existing slow-visibility witness; regular checks require a deliberately larger read
budget. Checking at most once per second until verified or the existing deadline
would cost up to roughly ten post-dispatch grouped reads, plus the early read,
instead of three total. This is an explicit latency/read-load trade-off and a tuning
decision, not a proven correctness fix or an approved default. No policy changed.

**Operator-approved experiment, 19 November:** connected observation now uses the
existing one-second minimum interval until values are verified or the existing
deadline. The stretched final check and connected three-attempt cap are removed;
simulation keeps that cap. This is a small change in the existing operation, not
a new scheduler, background polling service, cache or queue-ownership redesign.
Write pacing, fresh originals/overrides, same-image ordering, unknown fences and
Stop behavior are unchanged. See the [current contract](../../src/dal/grid-api/README.md#step-6-bounded-label-execution)
for the read budget. The existing delayed-four-second test failed before the change
and passed afterward; its full visibility assertion was retained. One additional
case in the same suite bounds non-visible work to eleven reads, verifies deadline
abort and no further reads, and preserves exactly two writes.

Validation: all 3,945 units across 117 files passed (70.87s); normal build and browser
typecheck passed with existing WASM/chunk warnings. Independent GPT-6.1 Sol review
found no concrete defect and retained the read-load/capacity caveat. The full retry-free
E2E run passed 595/598 cases (11.3 minutes), including Upload/editing journeys. It
failed sort/comma-URL navigation on a load timeout, table early-keyboard restoration
on pending focus, and B10 direct-ES table prepend on native-wheel settlement. Their
traces contained no metadata writes; the case code does not exercise edit confirmation.
All three unchanged cases passed together in a separate retry-free isolated run
(17.0s, three workers). This does not retroactively make the full run clean or prove
their causes. No unrelated fixes, weakened assertions, increased timeouts or automatic
retries were introduced. Full-run failure artifacts remain under
`kupua/node_modules/.cache/readback-cadence-failures/full-run/`.

No new E2E cases were added. One existing operation test was strengthened and one
deadline-bound case added to its existing suite. No new live upload/edit comparison
or production-capacity measurement was performed; fixture timing is not a live speed
claim. The operator stopped the Kupua dev server for validation; it was not implicitly
restarted or reconfigured. Both MCP tabs remain open for a later authorized trial.

## 9. Completion Report

Close the feature with the parity checklist, selected deployment topology,
operator-reviewed UX, retained regression evidence, known limits and deferred
opportunities. Explicitly separate actual upload/edit evidence from mocks and
read-only browser exploration. Reset the session worklog before staging; do not
commit without permission. Update owning mechanics guides and the changelog for
implemented code, not with planning/session narratives.

The finished implementation should be recognizably one Kupua browsing/editor
experience with an Upload context, not two applications sharing a stylesheet.

## Followups

### Recovery After Observation Stops: Bulk or Automatic Recheck

**Deferred UX question, raised by the operator 19 November 2026; no decision,
implementation authorization or new performance gate.** Consider recovery when
processing finishes after Kupua's bounded observation has stopped. Per-file Recheck
works, but a batch-wide interruption can leave users facing many individual clicks.

In local R020,100 transferred uploads became uncertain during an ingestion-service
interruption. After the operator restarted Grid, Recheck recovered the first image
and then the other99 without a Kupua refresh or file resubmission. All100 captions
were verified and follow-ups were unchanged, with no metadata writes. This shows
the recovery interaction, not hosted incidence or expired-authentication behavior;
hosted deauth resilience remains separately deferred. The [R020 record](editing-performance-evidence.md#r020-storage-complete-ingestion-blocked-by-sqs-19-november)
owns the underlying run, not a new failure investigation here.

Assess a batch-scoped "Recheck all", bounded automatic read checks after a meaningful
recovery signal, or both. Decide scope (current batch versus retained history),
authentication readiness, request limits/backoff, duplicate in-flight checks and
stopping conditions before selecting a policy. Do not introduce indefinite polling.
Temporary service/network interruptions, delayed visibility or a suspended client
could produce a similar gap; the local incident does not establish their frequency.
Also assess whether Activity distinguishes waiting, needs-attention and completed
counts clearly: its numeric badge stayed100 while its label changed to100completed.

Never retransmit files or replay submitted/uncertain mutations automatically.
Recheck may resume previously captured unsent follow-ups through existing ownership
and gates; it is not a blanket promise of zero writes. Reuse existing observation
owners if selected; no new scheduler, retry framework or backend work is authorized.

### Plain-Language Activity Follow-up Outcomes

**Copy/presentation cleanup, raised by the operator 19 November 2026; not yet implemented.**
Activity currently exposes "Filename description: Finished: 1/1 visible", produced
by startup's upload-follow-up wiring using the generic metadata save summary.
"Visible" means verified by canonical readback, not necessarily displayed onscreen.
In the captioned R020 batch, the description already existed and nothing was changed;
"Filename description" therefore misleadingly describes a write that did not happen.

The operator explicitly rejected "Description already present" too: users need not
know that filename fallback exists. Describe the upload or their requested action,
not internal operation names/counters. Successful automatic filename handling should
be quiet. Distinguish uploading, processing, ready, delayed/unconfirmed and failed
outcomes without implying that a successfully transferred file failed to upload.
For explicitly requested changes, use action-appropriate progress/outcomes that can
cover entities beyond labels; do not hardcode all follow-ups as label operations.
Exact strings/presentation still need a focused implementation, not a new UI framework.

Keep pending work, rejected changes and uncertain outcomes distinguishable; an
acknowledgement alone must not become "Saved" or a finished upload claim. Preserve
attention flags and meaningful failure information, including requested entity changes.
This is presentation work, not permission to change queue, confirmation or retry
semantics. No product code or test behavior changed when recording this follow-up.

### Prompt Arrival Ticker Checks After Upload Completion

**Deferred follow-up, recorded 14 November 2026; not a U3 acceptance gate or
implementation authorization.** An upload can reach Image available before
Search's new-images notification catches up. Prompt the existing
[arrival poller](../../src/stores/search-store.ts#L971) after each job reaches
verified readable and indexed availability, including jobs finishing after
leaving Upload. Coalesce nearby completions rather than issue one count per file;
if a check is already in flight, retain at most one follow-up hint. When no
eligible library poller is active, retain one pending hint for Search to resume.

The hint requests an authoritative query-qualified check, never an optimistic
increment. An identical image already in Grid before the browsing boundary must
contribute no new arrival; a genuinely new-since-boundary image uploaded repeatedly
must count only once. Preserve filters, the frozen arrival boundary, cumulative
ticker accounting and stale-response guards. Do not insert images into the
current results, change scroll position or bypass click-to-refresh behavior.

Leave ordinary polling unchanged: currently 10 seconds in a visible tab,
30 seconds while hidden (subject to browser throttling), with an immediate check
when the tab becomes visible. Unrelated uploads still use that cadence; this is
not server push. Reuse the existing count transport and poll owner, with no
duplicate cache, new endpoint, fallback, retry system or notification framework.

**Why and scope:** avoid an unnecessary wait after a known successful upload with
a small jobs-to-poller notification. Request coordination and replaced-search
ownership are the main risks, not a new UI surface. Extend existing job/poller
tests for fresh versus duplicate arrivals, burst/in-flight coalescing, completion
outside Search and query replacement; preserve existing membership/position
assertions and run required full unit/E2E gates if implemented. No separate
performance campaign is proposed.

### Use the Filename When Uploaded Metadata Has No Description

**Implemented in U5; filename normalization corrected 18 November.**
Match [Kahuna's post-upload behavior](../../../kahuna/public/js/upload/jobs/upload-jobs.js#L104):
when the uploaded image has no Description, derive one from the submitted filename
by removing the final extension and replacing underscores with spaces. For example,
`evening_sky.jpg` becomes `evening sky`. Preserve an existing Description, including
one already present on a deduplicated canonical image; do not replace embedded
metadata merely because the file has a different name.

This is a post-upload metadata write owned with U5, not part of transfer success
or a display-only default. Respect the separate editing gate, server capability
and metadata-write outcome handling; enabling uploads must not silently enable
this edit. Fresh `if-empty` command checks preserve existing descriptions, including
duplicates, without automatic mutation replay. Startup removes the final extension
and replaces underscores before submission; filenames without an extension retain
their name. The existing U5 browser journey now uses `u5_0.original.jpg` and expects
`u5 0.original`; it failed on the raw filename before this correction and passed
afterward. Full units, normal build and browser typecheck passed after the fix;
the earlier 598-case full E2E gate predates this narrow correction and was not rerun.

### Decide Whether Rare Duplicate Uploads Warrant an Existence Check

**Deferred operator decision, 14 November 2026; not an acceptance gate or
implementation authorization.** The operator reports a rare but confusing Kahuna
workflow: a user uploads an image already in Grid, sees it in the current upload
batch, then cannot find it in My recent uploads after reload when its original
uploader is someone else. Preserving the original uploader is correct; the
uploader-scoped recent query is also correct. The problem is explaining an existing
image's successful re-upload, not changing attribution or promising permanent batch
history. This is an operator-reported experience, not a new runtime reproduction.

**Possible benefit:** when prior existence is confirmed, show "File already in Grid"
with links on the filename and "in Grid", so the user can find the existing image
and understand why it need not appear in their uploader-scoped recent results.
Do not infer prior existence merely because two submitted files share an image ID:
signed uploads calculate that ID before sending bytes, and repeated files can also
represent a newly created image in the same submission.

**Options to assess if selected:** one authenticated lookup per signed-upload file,
bounded groups through the existing POST `/images/mget` endpoint, or a separately
approved authoritative server signal. Kahuna currently hashes files and prepares
signed URLs together without a pre-upload image-existence lookup. Grid's mget accepts
up to 200 distinct IDs per request, with existing client chunking. A returned image
is positive evidence; omission or a failed lookup must not establish that an image
is new. Preserve authorization and distinguish unavailable reads from absence.

**Cost and decision:** a per-file check adds a request and latency to every upload
to clarify a rare case. Grouping reduces requests but requires hashes before the
lookup and can delay the first transfer; preserve bounded hashing resources and do
not silently change upload concurrency. Decide whether the user benefit justifies
that habitual cost before choosing either approach. Do not add the check merely
to match the mock, skip normal upload processing, rewrite the uploader, or add
automatic replay. Until separately selected, duplicate-specific pre-upload lookups
must not be enabled as part of the toolbar/activity polish.

A cheaper option is to compare the uploader on images already returned in batch results with the signed-in user, explaining the different-uploader case after indexing without extra requests or pre-upload delay, but without detecting reuploads of the user's own images.

**Readback reuse assessment, 19 November:** the operator asked whether edit-confirmation
reads could also perform this postponed check. They run after upload, for images already
available for editing, and stop at confirmation or a bounded deadline; they are not an
idle catalogue poll. Finding an image then establishes current existence, not existence
before this submission. Reusing these reads cannot supply a general duplicate verdict.
The cheaper different-uploader explanation above can use existing returned batch data
without any additional request and directly addresses the reported My recent uploads
confusion. Prefer assessing that bounded UI change separately from readback scheduling;
do not add pre-upload lookups or label every returned image as an existing duplicate.
No duplicate-specific lookup or UI behavior was implemented in the timing experiment.

**Kahuna parity and deferred follow-up, 19 November:** in the signed mode verified
in the local Kahuna tab, the [upload manager](../../../kahuna/public/js/upload/manager.js#L40)
groups each submission by SHA-1 before creating jobs. Identical bytes get one
slot even under different filenames; the last file wins. Direct mode creates a
job per file. This says nothing about whether a matching image was already in Grid.
Kahuna keeps ordinary failures in their [filename-sorted job rows](../../../kahuna/public/js/upload/jobs/upload-jobs.html#L7);
files over the configured limit are named in an alert and skipped.

Keep one real-image row per Grid ID in Kupua. Its [position lookup](../../src/lib/upload-section-layout.ts#L99)
cannot distinguish two occurrences of one ID, so repeating image rows could
restore focus or scroll to the wrong occurrence. Defer occurrence-aware image
rows. The smaller follow-up is to surface failed filenames and reasons in
Current batch, including when revisiting it, without adding failed attempts to
search results, altering position anchors, or changing edit targets. Keep
this separate from performance tuning and from any prior-existence lookup.