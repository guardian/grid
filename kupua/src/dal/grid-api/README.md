# `dal/grid-api/` — Shared Grid API infrastructure

This directory retains service discovery, Argo envelope helpers, API types and
transport configuration. The live media-api datasource is
[`ApiDataSource`](../api-data-source.ts), using
[`grid-api-search-adapter.ts`](../grid-api-search-adapter.ts); it is selected
instead of direct Elasticsearch by the [DAL entry point](../index.ts).
The [API build plan](../../../exploration/docs/03%20Ce%20n'est%20pas%20une%20pipe%20dream/api-build/api-build-00-plan.md)
owns the current sequence, not the older hybrid workplan.

## Current reads and ownership

Search pages carry server enrichment; the search store publishes it only when
committing results. There is no mirror-search or per-image enrichment fan-out.
API overlays take precedence over local baseline calculations; direct mode and
partial overlays still need that baseline. Bulk selection lookup returns images
without publishing enrichment.

Standalone detail is `ImageDetail → ApiDataSource.getById → apiGetImage`, reusing
`GET /images/:id`, normalizing once and checking the requested ID. Its enrichment
(including top-level actions) stays in ImageDetail's requested-ID-bound state,
not the shared enrichment store. Obsolete requests are cancelled; resident-image
traversal makes no singleton request. No `include=fileMetadata` is added.

Current normalization flattens nested metadata resources into values, discarding
their resource links/actions. Future editing must deliberately retain the required
nested links/actions and take standalone enrichment/actions from that same
requested-ID-bound owner. Action availability is server/permission-aware; absence
is not permission to construct a write URL or infer authorization.

## Discovery and transport

[`grid-api-instance.ts`](../../lib/grid-api-instance.ts) keeps private session-scoped
`ServiceDiscovery` and the existing `initGridApi` / `apiAiSearchAvailable` entry points.
Search-route initialization and API-mode AI startup share one in-flight root request.
A failed root leaves capabilities unavailable until reload; discovery does not load
runtime client configuration.

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

Canonical delivery links, signed-rendition renewal, downloads and editing remain
separately authorized work. No replacement adapter, write client, new requests or
server/authorization/proxy changes accompany this retirement.
