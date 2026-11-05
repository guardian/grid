# PR: `POST /images/search-after`

## What does this change?

Adds cursor-based image search to media-api for Kupua, the experimental Grid frontend.

The existing `GET /images` uses offset pagination. Deep offsets become expensive and are
bounded by Elasticsearch's result window. Kupua currently queries ES directly to browse
beyond that window; this endpoint lets those paging requests go through Grid's authenticated
API instead, without replacing the search endpoint Kahuna uses.

## How does it work?

The client sends search filters, an ES sort clause and, when continuing a search, the sort
values from a previous result. The server uses `search_after` to fetch the next page. It also
supports paging backwards and fetching the last page without walking through earlier results.
JSON POST carries the structured sort and cursor data.

Results use the existing Grid image enrichment, including cost, validity, rights and actions,
and include the cursor values needed to continue. To keep browse responses small, the ES
request excludes `embedding`, `originalMetadata` and full `fileMetadata`, while preserving
configured field aliases.

Deleted-image searches apply the existing permission/uploader restriction to both results
and counts. Deleted images and replaced usages stay hidden by default, including when the
query is absent or cannot be parsed. Invalid cursor shapes and non-zero offsets are rejected.

Requests can use an ES point-in-time (PIT). An expired PIT returns a specific 410 error so
the client can retry against the live index. Cursors deliberately omit PIT-specific
`_shard_doc` values and rely on a unique image ID as the final tiebreaker.

## Effect on existing Grid

Kahuna continues to use `GET /images`. There are two shared changes worth calling out:

- GET now honors the previously ignored `hasRightsAcquired` parameter. True matches any
  acquired right; false matches none, including missing information. Omitting it preserves
  existing results. Kahuna's UI does not set this flag; it only passes through values supplied
  in the URL. Manually constructed or external links using it would be affected, but existing
  use of such links is unverified. `syndicationStatus` filtering is unchanged.
- Direct GET callers can request ascending Added to collection, with unmapped-field guards
  in both directions. Kahuna offers only new-to-old collection sorting; even an ascending
  token supplied in its URL falls back to upload date.

GET authorization is unchanged. The new route also retains the existing POST restrictions
for ReadOnly and Syndication API keys. New traffic, would it ever actually occur, still shares media-api and ES resources;
this is not a claim of zero production cost.

## Review points

- JSON POST and client-supplied ES sort clauses are intentional choices for review.
- PITs assume a single index and are not bound to a principal or query. Index migration
  is unsupported; the prototype also opens its PIT separately from its first page.
- `include=fileMetadata` currently returns empty metadata. Handling that request, stricter
  optional-parameter validation and the response to partial ES results remain open questions.

## How should a reviewer test this change?

Run `TZ=UTC sbt "media-api/test"` from the repository root. Tests cover pagination in both
directions, missing sort values, filter behavior, deleted-image permissions and counts,
and PIT expiry. GET regression coverage includes the shared rights and sort changes.

For a UI check, run local Grid with `--use-TEST` and Kupua with `--use-media-api`.
Browse deep into a search, move backwards, change sort and open/return from an image.
Check that cursor-page requests reach the local media-api; the prototype still uses ES
directly for other operations. Ordinary Kahuna searches should retain their behavior
apart from the two, speculative from users’ POV, changes above.