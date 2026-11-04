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
has no UI/startup caller. `executeGridCommand` accepts only `add-labels`, a captured
image ID, its retained resource links, and a nonempty label list. It requires the
matching per-image `edits` link, reads that metadata resource, and posts `{ data:
labels }` only to its advertised labels URI on the configured metadata origin.
Missing capabilities are never synthesized. These resources use concrete URIs,
not URI templates; unrelated media-template handling remains unchanged.

Both the global rollout boolean and the selected operation must be enabled. Missing,
invalid or unknown configuration/commands, direct-ES mode and invalid origins dispatch
nothing. Hosted settings come only from Kahuna's `mutations`, `metadataEditorUri`
and `authUri` payload; laptop settings use explicit `VITE_GRID_API_WRITES_ENABLED`,
`VITE_GRID_API_OPERATIONS`, `VITE_GRID_METADATA_ORIGIN` and `VITE_GRID_AUTH_ORIGIN`.
Service addresses must be origins without credentials, query or fragments; hosted
requires HTTPS, while local fixtures may use loopback HTTP. Local requests traverse
the guarded `/grid-metadata` and `/grid-auth` proxies, never a dynamic target proxy.

Admission is rechecked after prerequisite reads. `stopGridMutations()` blocks new
submissions until reload; changing hosted rollout to disabled also blocks pending
preparations. Neither can undo an already dispatched write. Server-side rollout
configuration changes reach existing pages only on reload; there is no remote
kill-switch polling. Temporary rollout switches may later be removed independently
of named-operation validation and outcome handling.

Results are `blocked`, `acknowledged`, `rejected` or `unknown`. Credentialed command
reads/writes refuse redirects and have a 15-second timeout. 401/419 invalidate the
session and prevent later submissions; 403/422 reject the write. Other post-dispatch
HTTP failures, including 400/5xx, and transport loss are conservatively unknown:
persistence/publication may already have happened. Argo error keys are reused for
explicit rejection; signed URLs and response bodies are not logged. There is no
automatic login, replay, queue, receipt UI or post-write publication.

This prevents accidental Kupua writes, not arbitrary authenticated browser requests.
Server authorization remains mandatory. The inspected `addLabels` handler authenticates
but does not apply the uploader/EditMetadata filter used by metadata replacement;
client capability checks are not a repair for that server-policy gap. No live
activation is approved. Isolated local-proxy and compiled-hosted fixtures exercise
dispatch/cookies/expiry, with synthetic CSP/CORS responses; deployed preflight,
CSRF, cookie policy and login-return integration are not certified by those fixtures.
