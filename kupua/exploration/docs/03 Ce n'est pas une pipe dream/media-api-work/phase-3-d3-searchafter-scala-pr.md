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

This is a net-new route with no existing production callers — it carries zero production
traffic today and has zero blast radius on current behaviour until kupua is switched to use it.

## What

New route: `POST /images/search-after`

**`sorts.scala`** — `reverseSorts`, strict `jsonToSort` deserialisation for flat and
nested-object clauses, and `orderOf`/`sortModeOf` helpers. Malformed optional object
properties are rejected rather than silently discarded.

**`ElasticSearchModel.scala`** — `SearchAfterParams`, `SearchAfterRawResults`, `SearchParamsBody`
(parses the POST body: query, date range, label/uploader/category/collections/has/is filters,
`hasRightsAcquired`, `syndicationStatus`, `orderBy`, `countAll`, page size/offset), plus
`SearchAfterParamsBody`, which strictly parses the resolved sort clause and mixed scalar cursor.
Wrong JSON types return `400 invalid-params` rather than becoming an omitted cursor and silently
restarting page one. `payType` is always `None` — not sent by kupua (disabled in its UI; cost
filtering is a plain free/non-free boolean there).

**`ElasticSearch.scala`** — `searchAfter()`: reuses `buildFilterOpt`, deliberately rejects
duplicate fields, unresolved Kupua sort aliases, residual nulls and cursor arity mismatches,
applies supported leading-primary null-zone strip/remap, then fans into a PIT branch (bypasses
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

**[EDIT: amended post-Copilot review] `ElasticSearchTest.scala` /
`ElasticSearchTestBase.scala`** — 23 integration tests, and a new `SortsTest.scala` — 9 unit
tests (no Docker) for the sort-clause deserialiser: forward/reverse cursor pagination, null-zone
round-trip, seekToEnd+null-zone, cursor-mismatch → 422, dateAddedToCollection filter both orders
(cursor path), dateAddedToCollection sort both orders (Kahuna `search()` path), fieldAliases
projection, isPotentiallyGraphic via fieldAlias.

**[EDIT: obscure-sorting amendment]** 10 further integration cases cover strict request types,
populated and leading-null cursor parsing, residual nulls, duplicate fields and unresolved
aliases. Five further no-Docker parser cases cover malformed optional object-sort properties.
The D3 additions now total 33 integration tests and 14 `SortsTest` unit tests.

## Defensive request contract

The endpoint accepts resolved one-semantic-sort clauses, including object-form Last used and
Added to collection clauses, and the supported leading-primary null cursor that switches to the
`[uploadTime,id]` phase. It returns deliberate client errors for malformed sort/cursor JSON,
unresolved aliases, duplicate sort fields, residual nulls and arity mismatches. These checks are
confined to `POST /images/search-after`; `createSort`, ordinary `GET /images`, source shaping,
routes and PIT architecture are unchanged. PIT hit `_shard_doc` values are still intentionally
truncated because persisted cursors must also work without their original PIT.

One narrow envelope-hardening item remains before production traffic: present-but-wrong JSON
types for `pitId`, `reverse` and `seekToEnd` are still interpreted as absent/default values. This
does not affect requests emitted by Kupua and is not part of the obscure-sorting amendment, but
it should be resolved in D3 rather than assigned to the later PIT-lifecycle endpoint.

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

## Amendment validation — 8 September 2026

The defensive amendment was developed failing-first and committed on the prototype branch as
`c697cc148`. Focused validation passed `ElasticSearchTest` 75/75 and `SortsTest` 14/14.
A live TEST `--use-media-api` check covered both special fields in both directions: initial and
forward pages were non-empty and disjoint, backward paging reconstructed the previous page,
all cursors retained three slots, and leading-null reduction returned remapped full cursors.
Synthetic malformed requests returned deliberate `400` or `422` responses. No live image
identity or metadata value was retained. The commit still needs to be harvested onto the PR
branch after its merge conflicts are resolved and the resulting D3 files compared exactly.
