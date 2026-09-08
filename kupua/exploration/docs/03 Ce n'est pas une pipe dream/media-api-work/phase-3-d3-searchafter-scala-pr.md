# PR: `POST /images/search-after`

## What does this change?

Adds authenticated cursor pagination to media-api for Kupua:

```text
POST /images/search-after
```

Kupua currently talks directly to Elasticsearch. This endpoint is the first
server-side capability needed to move that traffic behind media-api while still
supporting deep, stable navigation through millions of images.

The request is JSON because cursors are ordered, mixed-type arrays and may contain
null. It accepts Kupua's search filters plus:

- a fully resolved Elasticsearch sort clause;
- optional `sortValues` and PIT ID;
- reverse pagination and seek-to-End flags.

The response contains enriched Argo image entities, total count, per-hit sort
cursors, the next cursor, and the refreshed PIT ID.

## Cursor contract

The endpoint supports Kupua's one-semantic-sort model: one user sort plus the
automatic `uploadTime` fallback and unique `id` tiebreaker. Object-form special
date sorts retain `mode:max`, missing-value behavior, and the nested `usages`
context.

A leading null primary value enters the missing-primary phase, where pagination
continues on `[uploadTime,id]`; returned cursors are remapped to their full public
shape. Elasticsearch's Long missing-value sentinels are serialized as null so End
cursors remain round-trippable.

This is a cursor endpoint, not an offset endpoint. Non-zero `offset` is rejected.
Malformed sort/cursor JSON, duplicate fields, unresolved Kupua aliases, unsupported
residual nulls, and cursor/sort arity mismatches return deliberate 4xx responses.

PIT searches intentionally omit Elasticsearch's implicit `_shard_doc` value from
public cursors. Kupua persists cursors beyond a PIT's lifetime and may retry without
the PIT, where `_shard_doc` is invalid; callers therefore end every supported sort
with the unique `id` tiebreaker.

## Containment

`POST /images/search-after` is a new route with no existing production callers.
The existing `GET /images`, `createSort`, source shaping for existing endpoints,
and Kahuna behavior are unchanged.

The one intentional adjacent change makes ascending Added to collection work for
direct `GET /images` API callers. Kahuna canonicalizes that token to Uploaded before
it reaches media-api, so its UI behavior is unaffected.

Search-after uses a lean schema-derived `_source` projection, excluding the large
`embedding`, `originalMetadata`, and full `fileMetadata` objects while retaining
configured alias leaves. Results still pass through the existing
`imageResponse.create` enrichment path.

## Review points

- Confirm POST-with-JSON and `auth.async(parse.json)` as the convention for
  cursor/body-heavy read endpoints.
- Confirm that client-resolved Elasticsearch sort clauses are acceptable at this
  migration stage. The server validates their shape but does not own the semantic
  sort registry yet.
- `include=fileMetadata` remains an open contract question: the lean projection
  does not fetch full file metadata, so the endpoint should eventually reject that
  include explicitly or support it only when requested.
- Present-but-wrong JSON types for `pitId`, `reverse`, and `seekToEnd` still fall
  back to their absent/default values. Kupua emits the correct types, but the API
  boundary should be tightened before production traffic.

## Validation

- `ElasticSearchTest`: 77 integration tests passing.
- `SortsTest`: 14 parser tests passing.
- The exact PR-branch files passed both focused suites above; the corresponding
  Kupua change passed 1,270 unit tests and 236 habitual E2E tests.
- Live TEST checks passed for Last used and Added to collection in both directions:
  initial/forward/backward pagination, seek, End/null continuation, focus, and
  restore all agreed between direct Elasticsearch and media-api.
- A deterministic local Elasticsearch fixture proves exact order, cursor, position
  map, rank, and range behavior independently of either adapter.

No production data is written by this endpoint.