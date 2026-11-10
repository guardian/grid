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

Enrichment retains `resource: { uri?, links }` alongside existing actions. Only the
image's `edits` and `crops` relations are retained here; media links keep their existing
path. An API entity with no such links has an empty list, while absent API enrichment
has no resource descriptor. Replacements do not merge in older capabilities. The
same requested-ID-bound standalone and attached-selection ownership applies.

Nested metadata resources are still flattened into values. A future editing consumer
must obtain its required nested controls from the authoritative resource; no general
raw-envelope cache is introduced. An optional singleton URI is never manufactured from
`ui:image`. The `crops` relation is a list, not the crop-creation endpoint. Capability
absence is not permission to construct a write URL, and capabilities do not enable writes.

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
quiet `null` absence after failure. Only the user's optional boolean `showPaid`,
`canUpload` and `canDelete` fields survive validation; identities and unknown fields
are discarded. Non-user principals are unavailable for this hosted-user helper.
Missing flags remain unknown, not false or permission grants. No current UI/startup
caller is added, no read defaults change, and direct-ES mode makes no session request.
The session relation must match the configured auth origin and exact `/session`
path. Local reads use `/grid-auth/session`; hosted reads use the validated direct
origin. Redirects are refused. Missing origin configuration yields quiet absence.
`invalidateGridSession()` clears the snapshot and latches it unavailable until
reload; an already pending response cannot restore it. Commands invoke this on
401/419. Account changes and reauthentication require a full page reload, not a
second call to the cached reader. No identity is retained to detect account changes
in other tabs, and no background refresh is introduced.
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

## Step-2 command boundary

[`grid-commands.ts`](../../lib/grid-commands.ts) is separate from the read DAL and
is connected at startup only in API mode with the temporary saved editing preference. `executeGridCommand` accepts `add-labels` or `remove-label`, a captured
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
is off. Settings > Hi, Joshua and Shift+F12 open its single-checkbox panel. Apply and
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
use loopback HTTP. Hosted calls use discovered addresses directly. Local calls use only
fixed `/grid-metadata` and `/grid-auth` targets configured by `VITE_GRID_METADATA_ORIGIN`
and `VITE_GRID_AUTH_ORIGIN`, which must match discovery. No arbitrary-target proxy,
guessed satellite hostname, rediscovery polling or address storage is introduced.
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
target IDs, three command executions in flight, at least 250 ms between starts, and
one waiting operation** behind the active operation. The store counts complete selected
membership before consulting target metadata; it neither truncates targets nor hydrates
an oversized edit. Ordinary selection display hydration remains independent and unchanged.
All targets must be eligible. IDs, label and command links are captured at submission;
waiting work is rechecked before execution. A command execution includes prerequisite
reads and its possible write, so this is not a four-HTTP-requests/second certificate.
Waiting targets reserve space in the existing 1,000-ID freshness map so permission
withdrawal received while waiting cannot be missed. Unchanged reservations are released
on queue exit; newer authority/metadata evidence is retained. This issues no extra reads.

The common queue serializes operations until commands and observation settle.
Uncertain or still-submitted same-image commands retain their freshness conflict protection.
A 429 delays unsent starts for at least one second; post-dispatch 429 remains unknown
and is never replayed. Authentication expiry or a blocked preparation stops unsent commands.
Existing transport timeouts remain in force.

Dispatch may start work for at most **120 seconds** from activation; at that boundary
remaining unsent items stop. Observation keeps **one group, the existing 200-ID admission
cap, three grouped mget attempts at least one second apart, and at most ten seconds
after dispatch settles, with a 130-second hard observation cap from activation**.
Queue waiting does not start those clocks. One early read can verify and publish completed
items while other targets wait; remaining attempts are reserved until dispatch settles.
The final attempt waits until halfway from the preceding attempt to the remaining
deadline, subject to the minimum interval, leaving time both for projection visibility
and for its response. The attempt count and deadline are limits, not guarantees of visibility.
All 100 IDs fit in one existing 200-ID mget request per attempt. Observation termination
stops remaining unsent work; dispatched commands retain their eventual outcomes even
after observation ends. Early canonical bodies can publish before the receipt's observation
group settles. Newer browsing reads can supersede older evidence without being overwritten.
Current standalone detail retains at most one full-projection follow-up. The document's
1,000-touched-ID bound remains; stopped, never-started reservations are released without
discarding newer permission or metadata evidence.

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

These are adjustable prototype limits, not measured capacity or server protection from
a broken client, multiple tabs or other writers. Any future change must compose dispatch,
readback and memory bounds rather than raising a target constant alone. GRID-019 covers both Edits and the Photoshoots GSI. A conservative
operator trial requires separate explicit activation; general shared activation requires
a capacity decision. No live/shared trial is performed by the Step-6 implementation.
