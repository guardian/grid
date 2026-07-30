# PR: `POST /images/search-after`

## Why

Kupua (the in-development Grid frontend prototype) needs cursor-based pagination
(search-after) to let users scroll through millions of images without the 100,000-hit ES
offset wall. Currently kupua hits ES directly. This PR adds the server-side half so that
traffic can eventually be routed through media-api instead.

This is the first of ~9 planned media-api extensions to support kupua (PIT snapshots,
multi-get, and others). The conventions established here — POST+JSON for cursor endpoints,
shared `hitToImageEntity`/`SearchParamsBody` building blocks — will apply to the rest, so
it's worth settling any disagreement now rather than per-PR later.

This is a net-new route with no existing callers — it carries zero traffic today and has
zero blast radius on current behaviour until kupua is switched to use it.

## What

New route: `POST /images/search-after`

**`sorts.scala`** — `reverseSorts`, `jsonToSort` (flat + nested-object sort clause deserialisation),
`orderOf`/`sortModeOf` helpers.

**`ElasticSearchModel.scala`** — `SearchAfterParams`, `SearchAfterRawResults`, `SearchParamsBody`
(parses the POST body: query, date range, label/uploader/category/collections/has/is filters,
`hasRightsAcquired`, `syndicationStatus`, `orderBy`, `countAll`, page size/offset). `payType` is
always `None` — not sent by kupua (disabled in its UI; cost filtering is a plain free/non-free
boolean there).

**`ElasticSearch.scala`** — `searchAfter()`: reuses `buildFilterOpt`, applies null-zone
strip/remap on seek-to-end cursors, validates cursor length, fans into a PIT branch (bypasses
`prepareSearch` migration dedup filter) or a plain branch. `_source` projection is
schema-derived at startup (reflection on `Image` fields minus `{embedding, originalMetadata,
fileMetadata}` plus `fieldAliasConfigs` paths) — cuts payload from ~1.7 MB to ~370 KB per page.
`resolveSearchAfterHit` strips the drop-set from a copy of `_source` before `validate[Image]`
(avoids `JsError` when field aliases touch `fileMetadata` leaves) while keeping the full source
for alias extraction.

**`QueryBuilder.scala`** — two additions: `dateAddedToCollection` filter widens to also match
`"-dateAddedToCollection"` (the ascending token kupua sends; see the Kahuna note below). Also a
new `hasRightsAcquiredFilter` (`syndicationRights.rights.acquired` term query) — closes a parity
gap where kupua's direct-ES path already applied this filter but it was silently dropped when
routed via media-api.

**`MediaApi.scala`** — `hitToImageEntity` lifted to private method. `searchAfterImages` action
enriches each hit via the lifted `hitToImageEntity` (→ `imageResponse.create`), with a typed
`SearchAfterResponse` case class + `OWrites`. (A lean one-pass writer, `createForBrowse`, was
prototyped and measured but **reverted** — it is not in this PR. See the Performance note below.)

**`conf/routes`** — `POST /images/search-after` before `GET /images/:id`.

**`ElasticSearchTest.scala` / `ElasticSearchTestBase.scala`** — 16 new integration tests:
forward/reverse cursor pagination, null-zone round-trip, seekToEnd+null-zone, cursor-mismatch
→ 422, dateAddedToCollection filter both orders (cursor path), dateAddedToCollection sort both
orders (Kahuna `search()` path), fieldAliases projection, isPotentiallyGraphic via fieldAlias.

## One small, intentional improvement to the media-api sort contract

This PR makes the `-dateAddedToCollection` (ascending) sort token **work** when calling
`GET /images` directly. It previously didn't: the token fell through to a `fieldSort` on
an unmapped field with no `unmappedType`, so ES errored / no-op'd. Two coupled pieces:

- `QueryBuilder.scala` — the `dateAddedToCollection` pathHierarchy filter now also fires for
  the negated token (kupua needs this; its ascending collection sort is meaningless without
  the collection filter).
- `sorts.scala` + `ElasticSearch.scala` — added `dateAddedToCollectionAscending` (ASC,
  `unmappedType("date")`) and the matching `search()` case, so the sort actually applies
  instead of erroring.

**Note on Kahuna:** Kahuna's `getOrder()` function in `media-api.js` transforms any
unrecognised `orderBy` token to `-uploadTime` before the request reaches media-api. So
`-dateAddedToCollection` is stripped by the JS layer and never arrives at this code path
from the Kahuna UI (even via manual URL editing). This change benefits **direct API
callers** (curl, REST clients, future integrations). We left the server-side contract
more correct; the Kahuna JS is a separate concern.

## Performance note

Each hit is enriched via the lifted `hitToImageEntity` → `imageResponse.create` — the same
path Kahuna's `GET /images` uses. On a fast production ES link the dominant per-page cost is
this Argo **envelope build** (~55 ms/page, measured): `imageResponse.create` runs a ~12-step
`JsObject.transform` chain and presigns S3 URLs per hit. A lean one-pass writer
(`createForBrowse`) was prototyped and measured (~42% envelope reduction) but **reverted** —
it is not in this PR. It is the main remaining server-side optimisation and is worth building
before this endpoint carries production browse traffic.

The ~3× slowness versus direct-ES that you may see in local dev is a **separate, dev-only
artefact**: the elastic4s client → ES leg is uncompressed (~5× the bytes over the same SSH
tunnel), which does not apply on the production same-VPC link. Independent confirmation: #4784
(gzip compression on the ES REST client, approved, not yet merged) measured the same shape —
a 2.4–3.2× win over the SSH tunnel, but no regression (±14 ms, within noise) on TEST's intra-VPC
link. Once #4784 merges, this local-dev artefact goes away for every endpoint, not just this one.

## Two decisions for team consideration

**1. `POST` for a read endpoint.** The cursor + sort clause + filter set is too large for a query
string. `POST` with `application/json` body is the pragmatic choice. Play's CSRF filter does not
check `application/json` by default, so no CSRF config changes were needed. Worth agreeing this
as the convention for future cursor/filter-heavy endpoints.

**2. `auth.async(parse.json)`.** The action uses `auth.async` with the `parse.json` body parser
combinator — first use of this pattern in media-api. If the team prefers a different shape for
authenticated JSON endpoints, this is the place to align.

Neither requires a code change here — just noting for review.
