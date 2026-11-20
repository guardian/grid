# `dal/grid-api/` — Shared Grid API infrastructure

This directory retains service discovery, Argo envelope helpers, API types and
transport configuration. The live media-api datasource is
[`ApiDataSource`](../api-data-source.ts), using
[`grid-api-search-adapter.ts`](../grid-api-search-adapter.ts); it is selected
instead of direct Elasticsearch by the [DAL entry point](../index.ts).
The [API build plan](../../../exploration/docs/03%20Ce%20n'est%20pas%20une%20pipe%20dream/api-build/api-build-00-plan.md)
owns the current sequence, not the older hybrid workplan.

## Data modes and failure policy

Hosted Kupua is the future application and always uses media-api. Laptop builds
use their explicitly selected mode; direct-ES is temporary laptop support intended
for eventual, separately authorized removal. In API mode, including hosted mode,
never construct or invoke the direct-ES datasource, issue direct ES requests, or
select ES after API failure, empty data or invalid hosted configuration.

Keep the shell usable without disguising required-data failures as successful
empty results. Optional enrichment may be absent; required reads retain meaningful
failure outcomes for their owning caller. Preserve usable prior state where
appropriate without presenting it as freshly loaded. Do not add fallback sources,
parallel caches or automatic retries merely to hide API failure. Existing display
defaults and calculations on returned fields do not constitute ES access.

This replaces the migration-era blanket graceful-absence rule, not every existing
read contract. The current contracts below remain until deliberately changed in
their owning slice. Future commands must distinguish acknowledgement, rejection
and uncertainty, with no automatic replay after auth or transport failure; an
acknowledgement is not proof of search visibility. No command implementation or
direct-ES editing is enabled by this policy.

## Current reads and ownership

Search pages carry server enrichment; the search store publishes it only when
committing results. There is no mirror-search or per-image enrichment fan-out.
API overlays take precedence over local baseline calculations; direct mode and
partial overlays still need that baseline. Bulk selection lookup attaches enrichment
to each returned image without publishing into the shared search store.

Standalone detail is `ImageDetail → ApiDataSource.getById → apiGetImage`, reusing
`GET /images/:id`, normalizing once and checking the requested ID. Its enrichment
(including top-level actions) stays in ImageDetail's requested-ID-bound state,
not the shared enrichment store. Obsolete requests are cancelled; resident-image
traversal makes no singleton request. No `include=fileMetadata` is added.

Enrichment retains `resource: { uri?, links }` alongside existing actions. The
image's `edits`, `crops` and `download` relations are retained here; media links keep their existing
path. An API entity with no such links has an empty list, while absent API enrichment
has no resource descriptor. Replacements do not merge in older capabilities. The
same requested-ID-bound standalone and attached-selection ownership applies.

Nested metadata resources are still flattened into values. A future editing consumer
must obtain its required nested controls from the authoritative resource; no general
raw-envelope cache is introduced. An optional singleton URI is never manufactured from
`ui:image`. The `crops` relation is a list, not the crop-creation endpoint. Capability
absence is not permission to construct a write URL, and capabilities do not enable writes.

The selection/detail action UI prepares disconnected Share, full-frame, Download, Delete
and Library descriptions only. Retaining a download link neither fetches its file nor
records usage. These descriptions do not extend `executeGridCommand`, its supported
operation names, or the existing proxy guards; Labels remains the only connected family.

## Discovery and transport

[`grid-api-instance.ts`](../../lib/grid-api-instance.ts) keeps private session-scoped
`ServiceDiscovery` and the existing `initGridApi` / `apiAiSearchAvailable` entry points.
Search-route initialization and API-mode AI startup share one in-flight root request.
A failed root leaves capabilities unavailable until reload; discovery does not load
runtime client configuration. Root reads refuse redirects and have a 15-second deadline
combined with caller cancellation, so an already-started discovery cannot leave a
command waiting indefinitely. Failures are not retried.

`getGridSessionPermissions()` reads the discovered auth `session` relation on demand,
only in API mode. Concurrent/repeated callers share one page-lifetime result, including
quiet `null` absence after failure. The permission projection returns only the user's
optional boolean `showPaid`, `canUpload` and `canDelete` fields. The separate
`getGridSessionIdentity()` projection returns a validated human email for the
recent-library query, sharing that same read and invalidation boundary. Identity
stays in memory: it is neither logged nor put in URLs, descriptors or history keys.
Non-user principals have no identity projection. Missing flags remain unknown,
not false or permission grants. Upload entry reflects permission; recent browsing
does not require the mutation opt-in. Direct-ES mode makes no session request.
The session relation must match the configured auth origin and exact `/session`
path. Local reads use `/grid-auth/session`; hosted reads use the validated direct
origin. Redirects are refused. Missing origin configuration yields quiet absence.
`invalidateGridSession()` clears the snapshot and latches it unavailable until
reload; an already pending response cannot restore it. Commands invoke this on
401/419. Account changes and reauthentication require a full page reload, not a
second call to the cached reader. There is no persisted identity, cross-tab account
change detection or background refresh.
This is a display/preparation snapshot, not fresh authorization for a write;
it neither grants edit access nor overrides an uploader's per-image `edits` link.

Existing image reads use URI-encoded paths through `mediaApiUrl`; `imageUrl` retains
the same proxy/deployed-base helper. Neither expands the discovered image template.
Future satellite consumers must respect distinct service origins and existing
proxy/write guards rather than deriving one base URL from the root.

## Explicitly retained infrastructure

Keep `unwrapEntity` (live normalization), `unwrapResponse`, `unwrapSearchHits`,
`findLink`, `findAction`, `parseArgoErrorBody`, their meaningful contract tests and
all [API types](./types.ts). Nested HATEOAS resources and permission-aware actions
remain protocol knowledge for separately authorized consumers.
[`errors.ts`](./errors.ts) retains distinct auth, expired-session, server and
write-guard error vocabulary; it is not a current throw/toast policy.

The 8 October 2026 retirement removes only the unused `gridApi` allocation,
`GridApiDataSource.getImageDetail` implementation/suite and identity-only
`mergeReconciledFields`. It narrowly supersedes finding 21's archived keep decision,
not the reserved helpers/types/errors. P25's “reuse singleton GET” means the server
endpoint, not this retired client class.

## Failure and future work

Live standalone detail returns `undefined` for 404 or a wrong-ID entity; other
non-2xx/network/parse failures reject, and cancellation remains `AbortError`.
ImageDetail renders these quietly as unavailable. Discovery failure is capability
absence. Do not derive a new failure policy or auth toast from retired comments.

Canonical delivery links, signed-rendition renewal and downloads remain separately
authorized work. The retirement above added no replacement adapter or write client.

## Upload transport and jobs

[`upload-commands.ts`](../../lib/upload-commands.ts) owns API-only ingestion;
it does not extend the read DAL or construct an ES datasource. The independent
`kupua-allow-uploads` startup preference defaults off. **Allow real uploads** in
Hello, Joshua uses the same Apply/reload convention as editing. Every prepare/load,
signed PUT and queued-status mutation rechecks the centralized upload admission,
the shared session and `canUpload`; editing does not grant upload permission or
vice versa. Server authorization and validated service targets remain mandatory.
Changing preferences, logging in or transport failure never replays a submission.

The UI uses that startup preference and the shared permission projection before
exposing My recent uploads, the picker, activity or drop handlers. Direct `/upload`
visits, including retained batch/detail URLs, admit empty membership and explain
denied/disabled/unavailable access without browsing images. Denial uses Kahuna's
"You are not authorised to upload images." Session invalidation also clears active
Upload fullscreen presentation. Missing upload configuration separately prevents
submission controls; neither UI state nor local membership replaces server authority.

Site settings optionally provide `upload: { transport: "direct" | "signed",
maxFileBytes?: number }`. Absence/invalid configuration is unavailable, not a
default topology. Zero/omitted limits do not impose a client cap; only files strictly
above a positive limit are refused. Browser MIME is not an admission filter.
The existing laptop TEST-settings projection reads ingest-bucket presence and the
decimal MB limit without returning bucket names. Those TEST settings are not proof
of the local loader's configuration. The separately approved Kahuna configuration
producer supplies the same allowlisted transport and optional limit to real hosted
Kupua. It does not expose bucket names or capabilities, enable the upload gate or
verify the discovered destinations. Active hosting inherits Kahuna's `connect-src`;
deployed TEST uploads succeeded with its existing storage-origin allowance.

The advertised loader root must expose the exact prepare/load/status contracts.
Direct loading POSTs octet-stream bytes with only the encoded filename query;
signed loading hashes one file with browser SHA-1, prepares an ID/filename map,
PUTs the file using the returned validated storage capability and media-ID header,
then separately POSTs QUEUED. Loader/auth use existing independently selected
local proxies, allowlisted direct TEST origins or hosted direct HTTPS. Optional
`VITE_GRID_LOADER_ORIGIN` selects a fixed custom loader proxy, not a request-level
target. No storage write proxy is provided. Signed PUT omits cookies, refuses
redirects and does not expose its URL in job state, storage or application logs.
Storage capabilities must target regional S3 HTTPS or Grid's exact existing
LocalStack HTTPS origin, with the signed-query contract; no general origin override
is accepted. Preparation, queued-status and reads have 15-second deadlines. Byte
transfers use their owner's abort signal without a new size-dependent time limit.
Uncertain preparation/transfer and rejected/uncertain queued updates stay distinct.

[`upload-jobs-store.ts`](../../stores/upload-jobs-store.ts) owns submissions and
per-file attempts outside routes/rows. It bounds active work to one transfer/hash
and one observation request. Same names are not keys; several attempts may resolve
to one canonical image. Lightweight outcomes remain in memory, not image bodies or
signed capabilities. File references are released when submission settles. Processing
status, canonical image readability and indexed search visibility are separate
observations. GET is a real-time document read, not proof of search refresh: an
exact ID-scoped POST count through the existing API mapper/transport must also be
positive before images enter U1's immutable, revisioned batch membership. The GET
and count share one 15-second owner-cancellable deadline. There is no second buffer
or browsing engine, no inherited library filters and no empty/unrestricted count.
Missing status may be expiry, not failed transfer: bounded image reconciliation can
still find the known identity. A readable duplicate does not prove this attempt was
processed; the submission receipt is retained independently.

Automatic read observation ends after five minutes or an unavailable status read.
**Recheck** restarts reads only, never an upload mutation. Active work protects
reload/tab closure, but ordinary in-app navigation does not stop jobs or prompt.
Page interruption aborts owned requests, releases files/timers/listeners and retains
uncertainty for a surviving page; late responses cannot silently resume its job.
Reload restores only allowlisted local descriptors, never owned requests, timers,
file bytes or mutation authority. Unfinished attempts remain interrupted until an
explicit read-only status check; they are not resumed. WebCrypto hashes a whole file in memory, one
at a time; no large-file memory/performance claim follows from the fixture checks.
If a direct-load response is lost before returning an identity, the retained uncertain
attempt has no status target; the client does not guess one or replay the upload.

Search and Upload provide permission-aware multi-file picker/drop entry. Each
submission owns a distinct short local batch reference; internal Grid and in-page
image drags do not submit files. A small selector shows five recent batches plus
outstanding work and the selected older record. Search return is separate from
batch selection; Earlier batches reaches all retained descriptors and in-memory work.
The Upload page composes one open batch above all other current-human uploads through
one bounded buffer. `UploadPageReader` prefixes source cursors, translates offsets/ranks
and keeps lower ordering independent of the batch sort. Existing CQL negated canonical
IDs apply the open batch exclusion consistently to lower pages/counts/ranks/keys; this
is neither browser filtering nor a newest-50 limit. Identity and request failures do
not widen the query. The Upload fingerprint retains section membership/revision but
omits the in-memory human identity. View all your uploads deliberately opens ordinary
Search with that user's email in `uploadedBy`, matching Kahuna, without batch exclusion.
Partial pages keep their actual position and required-read failures remain recognizable.
A temporary activity indicator expands current-round file outcomes;
it is not batch history or a canonical-image count. Form density is connected, while
new post-upload metadata/preset writes remain U5-U7. B2's shared backend status/pending-object
identities are not repaired: local witnesses prove attempt retention, not concurrent server
isolation. Upload activity uses a left segment joined to Search's Upload button, a
toolbar control on Upload and a separate affordance elsewhere. Existing image-action
activity remains independently reachable with its captured targets.

[`local-batch-storage.ts`](../../lib/local-batch-storage.ts) persists tab-session
descriptors: submitted names/sizes, attempt and batch IDs, canonical/status IDs,
membership revision and lightweight outcomes. It retains no bytes, capabilities,
credentials, grants or complete images. Descriptors have a 2 MiB budget; history
snapshots have 1 MiB and their existing 50-entry LRU. Full membership fingerprints
remain qualified by revision; no snapshot-reference redesign was needed. A failed
descriptor write keeps work in memory, warns and protects page closure, without
deleting older records. The owning storage-retention action can retry persistence
without resubmitting uploads; the current activity popup has no upload-retry control.
Descriptor failures show a warning toast, unavailable requested history has its own
warning, and history-only write problems are console diagnostics. Failed history
writes retain in-page navigation within their existing reload limits.
Missing records and known-empty batches never become library reads.

Job-owned batches default to submitted-filename order. `ApiDataSource` hydrates
bounded ID chunks through existing ordered search reads, restores submission order
and uses matching count/key qualification for ranks, offsets and position maps.
Raw mget is not interchangeable here: it can return lifecycle-excluded images
that ordinary search omits. Omission never rewrites retained membership; a failed
read remains a failure. Explicit library sorts retain their existing server path.

`/upload` without `batch` is **My recent uploads**, an authenticated `uploadedBy`
query with paid/free images and no inherited library filters. It is not submission
history and has no batch applicator scope. `recentUploadScope` keeps identity only
in memory; the mapper sends the existing `uploadedBy` field. A stable identity-free
route key supports history/reload, whose targets are resolved through the current
authenticated query. Loading or unavailable identity admits an empty scope, never
all users. Both batch and recent browsing keep library selection dormant.

The indicator represents the current activity round across batches, with attention
before running and successful files. Individual error dismissal acknowledges presentation,
not cancellation or deletion. New work joins an active round; otherwise it replaces
old successes while retaining unacknowledged attention. An all-success indicator clears
on the next real navigation, and historical successes do not reappear after reload.
Original submission/queued outcomes remain in descriptors, not a receipt-history UI.
Error diagnostics are deduplicated and include known filename/identity and safe stage,
HTTP and server detail. `redactUploadError` removes URLs, credential headers/fields
(including quoted representations), tokens and emails before server details are
retained, logged or exposed in copyable processing-error disclosures. No success/progress
logging or pre-upload duplicate-existence lookup is added. Queued outcomes are never
retroactively acknowledged by later availability.
[GRID-024](../../../exploration/docs/bug-backlog.md#grid-024) owns the deferred loader
defect; the client still sends the queued request and never replays it automatically.

Actual local Grid/ES/LocalStack uploads passed in Vite and Kahuna-hosted Kupua,
including larger-file route-away completion, duplicate canonical membership and
inspectable queued rejection after availability. A representative operator-run
deployed TEST upload also reached matching canonical readability and exact-ID
indexed count one after processing continued on Search. Its storage transfer had
already been acknowledged before leaving Upload, and the known queued rejection
remained collapsed in receipt history. No metadata write or automatic retry was
observed. These are signed one-file transport witnesses, not bulk or durable-recovery
acceptance; the deployed batch/thumbnail was not separately reopened.
Laptop-to-TEST storage preflight rejects both local frontend origins; no shared
TEST CORS change or additional hosted storage CSP allowance was needed for the
successful deployed trial. See the
[hosting guide](../../../exploration/docs/00%20Architecture%20and%20philosophy/09-deployed-via-Kahuna.md#local-and-deployed-upload-boundaries)
for the topology boundary, and the
[U3 workplan](../../../exploration/docs/gradually-growing-teeth.upload-workplan.md#actual-upload-evidence-and-deployment-checkpoint)
for exact evidence and validation limits. Further real trials still require fresh
destination/file permission and C1/C4 disposition. Verify loader, storage, status,
CORS/CSP and auth independently; a local ES index does not make other writes local.

## Step-2 command boundary

[`grid-commands.ts`](../../lib/grid-commands.ts) is separate from the read DAL and
is connected at startup only in API mode with the temporary saved editing preference.
It accepts label commands described here and the narrowly scoped `edit-metadata`
command described under [U5 ordinary metadata](#u5-ordinary-metadata).
`add-labels` or `remove-label` take a captured
image ID, its retained resource links, and a nonempty label list or one exact label. It requires the
matching per-image `edits` link, reads that metadata resource, and posts `{ data:
labels }` only to its advertised labels URI on the discovered metadata origin.
Missing capabilities are never synthesized. These resources use concrete URIs,
not URI templates; unrelated media-template handling remains unchanged.

Step 5 adds single-image `remove-label`. The same prerequisite
GET must return the labels collection and exactly one embedded `{ uri, data }` entry
whose value equals the captured label. Its advertised URI must match the discovered
metadata origin, captured image and server form-style label encoding; only that URI
receives DELETE, without a body. Missing/foreign/mismatched resources block, never
become a constructed target or an acknowledged no-op. Removal preserves whitespace
in existing label identity. A valid authoritative labels collection with an explicit
list that already lacks the exact label instead returns `unchanged`, sending no
mutation and not stopping the other captured targets. Missing or malformed list data
is not absence. Canonical mget still checks the removal postcondition for unchanged
targets; they are not counted as acknowledged writes. Only new-label entry is trimmed.
Unsafe dot path segments
are blocked. The local guard admits only these supported method/resource shapes;
no image-delete endpoint is admitted.

One temporary `kupua-allow-editing` localStorage preference is captured at startup.
Only the exact saved value `true` enables it; missing, invalid or inaccessible storage
is off. Settings > Hello, Joshua and Shift+F12 open its panel alongside the independent upload preference. Apply and
reload saves and reloads; it is not a live switch or cross-tab cancellation mechanism.
Other tabs read the shared origin's preference on their next reload. Different origins
remain independent; changing a path or backing data at the same origin does not reset it.
There are no env, hosted, per-command or bulk rollout flags. This removable startup
brace is not permanent hosted policy: the eventual app relies on server permissions
and resource capabilities, without an editing rollout switch. Direct-ES remains read-only.

The existing shared directory read supplies root `edits` and exact `/session` links
once per page, retaining success/failure until reload. The edits service origin is not
an image capability. Missing/invalid relations block command execution. Service origins
exclude credentials, query and fragments; hosted requires HTTPS, local fixtures may
use loopback HTTP. Hosted calls use discovered addresses directly. Laptop calls to
exact local metadata/auth origins use `/grid-local-metadata` and `/grid-local-auth`.
Exact allowlisted TEST origins use direct credentialed browser requests: TEST cookies
cannot accompany local-origin proxy requests. Normal TEST login and the service's
CORS allowance for the frontend origin remain required; no cookies are copied or
authentication rules bypassed. Metadata and auth select their transports independently;
API location and ES backing do not imply a common satellite environment. No unauthenticated startup
directory request is needed. Optional explicit `VITE_GRID_METADATA_ORIGIN` and
`VITE_GRID_AUTH_ORIGIN` targets retain `/grid-metadata` and `/grid-auth` for custom
setups and fixtures. Unknown origins without an explicit target remain blocked.
No satellite proxies are registered in direct-ES mode. Exact proxy-name boundaries
and method/path guards protect proxied traffic; direct calls retain command/resource
validation and server authorization. TLS verification and redirect refusal remain.
No arbitrary-target proxy, rediscovery polling or address storage is introduced.
Authentication invalidation is rechecked after prerequisite reads; it cannot undo a
dispatched write. No one-way rollout stop latch or live preference recheck is retained.

Results are `blocked`, `acknowledged`, `unchanged`, `rejected` or `unknown`. Credentialed command
reads/writes refuse redirects and have a 15-second timeout. 401/419 invalidate the
session and prevent later submissions; 403/422 reject the write. Other post-dispatch
HTTP failures, including 400/5xx, and transport loss are conservatively unknown:
persistence/publication may already have happened. Argo error keys are reused for
explicit rejection; signed URLs and response bodies are not logged. There is no
automatic login, replay, queue or post-write publication in this boundary.

The separate [label operation owner](../../lib/label-operation.ts) consumes the
exported command types and an injected executor. It captures one confirmed
add/remove intent and all target IDs, distinguishing unavailable capabilities from
explicit absence. Startup supplies the production executor and existing readback owner
only when API mode and the startup preference permit editing. Otherwise the editor
remains disconnected. Connected addition and removal share the common batch policy
below without a separate bulk opt-in. Supplied-executor comma-separated input remains
refused before dispatch. Unpaced simulated multi-add remains available to existing fixtures;
connected fixtures select the same paced path as the application.
Receipts distinguish submitted, accepted-awaiting-visibility,
rejected, unknown and blocked/not-started; only matching explicit canonical evidence
can establish observed state. [LabelEditor](../../components/LabelEditor.tsx) and
its [in-memory store](../../stores/label-editor-store.ts) prepare these operations,
retaining target-bound input and receipts across SPA navigation. They never import
or invoke the production executor. Selection-panel editing uses current membership
and pending metadata, not the retained completed display; detail uses its owned
overlay. Default-off editing dispatches no command or observation read. Enabled single-label
execution uses bounded mget observation and grouped publication through existing owners;
returned authority is accepted independently of the label postcondition. Required-read
failure may leave a verified partial publication while other targets remain unavailable,
and an unknown command outcome stays unknown. No session refresh, replay, undo or general
permission cache is added. Fixture outcomes do not certify deployed behaviour.
Direct-ES exposes no editor controls.

Pending and uncertain attempts retain their receipts rather than replaying. A new
explicit connected submission may follow rejection, pre-dispatch refusal or an
acknowledged result whose observation has ended, provided current authority is
available. This permits add/remove/add and explicit recovery after an observation
deadline without treating an old receipt as a new command. Pending observation
still prevents repetition. Observation alone never clears an unknown command outcome.

Removal observation requires the exact label to be absent from an explicit label list
in a successfully returned authoritative image. Omitted images, missing label data,
404, denied access and failed reads are not successful removal. A current standalone
detail still requires its matching full projection. Authority withdrawal is accepted
before testing the label postcondition; cold-detail failure settlement is unchanged.
Command outcome, observation and grouped publication remain separate. Disconnected
multi-label preparation and the existing observation/deadline/freshness bounds remain.

This prevents accidental Kupua writes, not arbitrary authenticated browser requests.
Server authorization remains mandatory. The inspected `addLabels` and `removeLabel` handlers authenticate
but do not apply the uploader/EditMetadata filter used by metadata replacement;
client capability checks are not a repair for that server-policy gap. No shared-system
activation is approved. Isolated local-proxy and compiled-hosted fixtures exercise
dispatch/cookies/expiry, with synthetic CSP/CORS responses; deployed preflight,
CSRF, cookie policy and login-return integration are not certified by those fixtures.
An authorized operator-driven local Grid trial added and removed two labels separately,
including Unicode and whitespace, with acknowledged/observed receipts and exact restoration
of the original label set. Temporary rollout was disabled afterward. The former Kahuna
mutation/address payload has since been removed; the client no longer consumes those settings.
Real hosted/shared activation remains separately authorized and unverified; no backend
authorization policy changed. The [hosted guide](../../../exploration/docs/00%20Architecture%20and%20philosophy/09-deployed-via-Kahuna.md#editing-preference-and-service-discovery)
owns startup preference, service discovery and retained bootstrap/site configuration.

## Step-6 bounded label execution

`BATCH_POLICY` in [batch-execution.ts](../../lib/batch-execution.ts) owns the common limits: **100 actual
target IDs for Labels, no fixed start spacing, and at most two retained queue slots**
across execution, waiting and confirmation. The default dispatch cap is three.
The local tuning candidates use eight for connected Labels and five for one
captured bulk ordinary-metadata action; grouped individual saves retain three.
These are client bounds, not shared capacity decisions.
Labels retain their slot through confirmation; guarded metadata can release its
execution turn earlier without releasing its confirmation capacity. The store counts complete selected
membership before consulting target metadata; it neither truncates targets nor hydrates
an oversized edit. Ordinary selection display hydration remains independent and unchanged.
All targets must be eligible. IDs, label and command links are captured at submission;
waiting work is rechecked before execution. A command execution includes prerequisite
reads and its possible write, so this is not a fixed request-rate or server-capacity certificate.
Waiting targets reserve space in the 10,000-ID session freshness map so permission
withdrawal received while waiting cannot be missed. Unchanged reservations are released
on queue exit; newer authority/metadata evidence is retained. This issues no extra reads.

`BATCH_POLICY.speed` contains the two speed controls: concurrency and minimum start
spacing. The same policy owns command timeout, target/queue admission, observation
limits and touched-ID capacity; changing speed does not change correctness rules.
The mget protocol's request chunk size remains a DAL constraint, not an action limit.

Application startup creates one queue and injects it into the connected editor store.
Further connected edit families must borrow that same queue, not create a per-family
scheduler. The store factory can still own a private queue for isolated consumers.
A borrowing store disposes only its own operations; it cannot close the shared queue.
Disposal stops unsent work and observation, while a submitted command keeps its slot
until its outcome arrives. The common queue serializes write-execution groups. Labels
and metadata without usable source evidence also wait for observation; the guarded
metadata path below can overlap confirmation with a successor's execution.
Uncertain or still-submitted same-image commands retain their freshness conflict protection.
A 429 delays unsent starts for at least one second; post-dispatch 429 remains unknown
and is never replayed. Authentication expiry or a blocked preparation stops unsent commands.
Existing transport timeouts remain in force.

Dispatch may start work for at most **120 seconds** from activation; at that boundary
remaining unsent items stop. Observation keeps **at most two groups sharing a 200-target
admission budget, grouped mget attempts at least 500 ms apart per group, and at most ten seconds
after dispatch settles, with a 130-second hard observation cap from activation**.
Queue waiting does not start those clocks. One early read can verify and publish completed
items while other targets wait; remaining attempts are reserved until dispatch settles.
Connected observation checks remaining targets at the minimum interval until verified
or the deadline, without overlapping reads within a group. This permits at most twenty post-dispatch
reads plus the early read per group under the current bounds, rather than stretching a third
and final attempt across the window. It trades additional bounded read traffic for
prompt confirmation; source writes remain ordered and bounded separately. Simulated observation
retains its three-attempt limit. These bounds are not guarantees of visibility.
All 100 IDs fit in one existing 200-ID mget request per attempt. Observation termination
stops remaining unsent work; dispatched commands retain their eventual outcomes even
after observation ends. Early canonical bodies can publish before the receipt's observation
group settles. Newer browsing reads can supersede older evidence without being overwritten.
Each group retains at most one owner-qualified standalone full-projection follow-up. The document's
10,000-touched-ID bound applies; stopped, never-started reservations are released without
discarding newer permission or metadata evidence.

The exact image read accepted as current may also supply its own server-provided
edit links/actions when an untouched image has no edit timestamp. An unchanged
follow-up must not leave that image read-only solely because the timestamp is absent.
Older/unaccepted authority remains fenced, and a newer permission withdrawal still
wins; this does not synthesize permissions or relax mutation authorization.

Receipts expose progress and every bounded target outcome separately from observed state.
Stop remaining affects only commands not yet started, including a waiting operation;
it cannot undo a started command. Wholly unsent stopped work can be explicitly submitted
again; no automatic retry or mixed-unknown replay is added. Selection membership and
browsing geometry are unchanged by label publication.

After observation ends, ordinary selection hydration can reread an affected cached
image whose body or authority is stale. Current cache entries and active observation
do not cause extra reads. The accepted response still passes freshness and capability
checks; a revoked capability remains revoked. Single-selection metadata uses the
recovered selected body when its resident search-buffer copy is stale. This is a read
recovery path, not mutation replay, a background polling loop or a global search refresh.

U5 metadata uses this same startup queue and operation lifecycle. Complete captured
actions reserve freshness capacity before dispatch, then use groups of at most 100,
each with the existing dispatch/readback deadlines. Reference-counted reservations
prevent cancellation by one queued owner from releasing another's budget. Labels'
100-target action limit is unchanged; it is not imposed on metadata propagation.
The 10,000-distinct-image session budget refuses an action before writing when it
cannot fit, without evicting existing stale-read protection. This is a prototype
memory bound, not measured server capacity. Local speed evidence does not authorize shared rollout.

At activation, the metadata owner co-admits up to 100 already-waiting single-image
saves for distinct images into one execution/readback group. It stops collecting at
a repeated image, a multi-target action or an unresolved command conflict; it adds
no collection delay and never extends a captured group with later arrivals. Each
save retains its own intent, receipt, reservation and revision acknowledgement.
Stop removes only that save's unsent commands; submitted outcomes remain owned until
settlement. A newer unsent Form revision can still supersede its earlier group member.

Independent saves do not share image-local preparation refusals or early readback
failures: the affected receipt remains failed/unavailable while siblings proceed.
Disabled editing and session invalidation still stop unsent work. No failed read or
mutation is automatically replayed. Ordinary bulk actions and Labels keep their
existing stopping policy. A large action still waits for each non-final chunk's
confirmation; only its final chunk can release execution early. This is not general
large-action fairness or a priority scheduler.

## U5 ordinary metadata

`edit-metadata` reads the full singleton for original values and current edit authority,
then reads owning edits immediately before PUT to the exact advertised metadata URI.
Only supported ordinary fields are accepted. The replacement retains unrelated and
domain overrides; values equal to originals remove that override, while text/list
clears remain explicit when necessary. Date clearing is refused under GRID-025.
Location changes only supplied components; list add/remove treats each pill literally.
Filename fallback fills only a fresh missing description. This client's queue serializes
same-image work but does not remove the accepted GRID-020 cross-client GET/PUT race.

For an active/pending same-image chain, validated successful PUT content supplies
a comparison fingerprint in the existing reserved freshness fact, not a display
cache or future replacement body. The next executor captures that evidence before
any await, including before disposal can release its reservation. Its owning GET
must match before constructing replacement FROM THAT GET. A successful but differing
GET can be rechecked at most three times, 100ms apart, under one 15-second source-read
deadline. Failed reads are not replayed; persistent mismatch stays unsent, and an
uncertain mutation is never replayed. Authority and full original reads remain required.

Fingerprints sort object keys, treat Keywords/People as sets and valid dates as
instants, but retain Subjects order, exact text and absent-versus-explicit-clear
distinctions. Ambiguous null/unsupported evidence cannot authorize early release.
An unreadable successful PUT body remains acknowledged, not rejected or unknown;
it installs a missing-evidence fence. Accepted canonical raw overrides may fill
that fence after normal confirmation. Without comparable evidence the queued
successor remains unsent rather than blindly accepting a stale replacement base.

Only a final metadata execution group whose items are acknowledged/unchanged with
usable evidence can release its execution turn before confirmation. Receipts,
draft revisions, Stop and reservations remain owned until observation settles.
Evidence is stripped from receipt history and cleared at the last reservation.
Late older reads still pass normal issuance/version fences; rejected older snapshots
are reread. An obsolete same-field confirmation ends as superseded only after a
returned canonical override object matches a newer acknowledged write's evidence.
This does not publish the obsolete value or label supersession as observation.

The comparison guarantee is limited to active/pending save chains. After the last
reservation, a later independent save has no retained source witness and the existing
GET/PUT limitations remain. No general same-client or cross-client lost-update
guarantee, new backend contract, conditional write or alternate source is introduced.

Metadata uses exact command-computed postconditions with existing bounded canonical
readback/publication. Acknowledgement does not mean visibility, and observation cannot
turn an unknown response into an acknowledgement. Form uses a 600ms typing debounce
and immediate explicit/blur commits, retaining revisioned
intent outside mounted rows, coalesces unsent revisions and never replays an unchanged
failed/uncertain draft on blur. Details commits are explicit. Batch arrows retain their
captured operation identity even when membership changes. Upload follow-ups are distinct
from ingestion, captured per submission and never reconstructed from restored batches.
All writes still use the one startup-captured Allow editing switch; no new flag,
backend endpoint, direct-ES writer or live/shared-system permission is introduced.

These are prototype limits, not measured capacity or server protection from
a broken client, multiple tabs or other writers. Any future change must compose dispatch,
readback and memory bounds rather than raising a target constant alone. GRID-019 covers both Edits and the Photoshoots GSI. A conservative
operator trial requires separate explicit activation; general shared activation requires
a capacity decision. No live/shared trial is performed by the Step-6 implementation.
