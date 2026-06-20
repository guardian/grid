# Phase 3 — D7 + D8 + D9: searchAfter companions — Workplan

**Status:** READY TO IMPLEMENT. Three small, independent media-api endpoints, built in one
oversight session as **three separate Scala commits** (one per gap) for clean per-gap PR
extraction. Each reuses the POST plumbing D3 already shipped.

**The three gaps** (from `phase-3-minimal-gap-derivation-findings.md` §5):

| Gap | New capability | Size | Kupua DAL methods served |
|-----|----------------|------|--------------------------|
| **D7** | `countWithTickers` — `size=0` count + ticker aggs, no hits | S | `countWithTickers`, `count` (degenerate) |
| **D8** | PIT lifecycle — open/close a point-in-time snapshot | S | `openPit`, `closePit` |
| **D9** | `mget` — multi-doc fetch by ID, no 200-cap | S | `getByIds`, `getById` (degenerate) |

**Why batched:** all three are S-sized, mutually independent (no ordering dependency among
them), and reuse the same D3 controller plumbing (`auth.async(parse.json)`, the route-ordering
rule, the StranglerAdapter override pattern). Doing them together amortises the cost of
re-reading `MediaApi.scala` / `ElasticSearch.scala` / `conf/routes`.

**Why now:** D8 (PIT) is also the consistency dependency for the future L-items D1
(`fetchPositionIndex`) and D2 (`getIdRange`), so it should land before them. D7 and D9 are
high-frequency, must-have paths (D7 fires on every new-images poll tick; D9 backs every
multi-selection load) — they take kupua meaningfully closer to "100% on media-api".

**Build order within the session (suggested):** D7 → D9 → D8. D7 is the simplest (count, no
image enrichment); D9 reuses the lifted `hitToImageEntity`; D8 is structurally different (infra,
no `SearchParams`). Order is a convenience only — they don't depend on each other.

---

## 0. Research findings — 3 of 4 resolved, 1 decision for the team

The four "verify" items were investigated (read-only research, 2026-06-20). **Three are resolved**
and baked into the plan (§2–§4). **One (#4)** is a genuine decision for the team, with a
recommended default and the research that informs it. This section is the findings record to take
into the team discussion.

### #1 (D7) `ExtraCount` sub-breakdown — ✅ RESOLVED: the server already emits it
The server's existing ticker machinery already produces the agency-picks supplier sub-breakdown.
`maybeAgencyPicksExtraCount` (`ElasticSearch.scala:73-82`) defines
`maybeSubAggregation = Some(termsAgg("byAgency", "usageRights.supplier").size(9))`; it is attached
at `:332` and mapped into `ExtraCount.subCounts` at `:350-362` (with an `"other"` bucket). The
`ExtraCount` case class (`common-lib/.../argo/model/CollectionResponse.scala:15-20`) carries
`subCounts: Option[Map[String, Long]]`, matching the client's `TickerCountResult.subCounts`
(`types.ts:116`) and `gridConfig.tickerDefinitions` `subAggField: "usageRights.supplier"`
(`grid-config.ts:149`). **No server change needed** — the endpoint reuses the existing extraCounts
mapping as-is. (Baked into §2.)

### #2 (D8) Multi-index `createPointInTime` spelling — ✅ RESOLVED
`createPointInTime(index: Index)` takes a single `Index`; the elastic4s handler builds the URL as
`s"/${index.name}/_pit"` (raw string interpolation), so multi-index is the standard comma-join —
the same mechanism `SearchHandlers` uses (`.mkString(",")`). There is **no `Indexes` overload** and
**no raw-request fallback needed**. Buildable spelling:
`createPointInTime(Index(List(imagesCurrentAlias, migrationIndexName).mkString(","))).keepAlive(1.minute)`
→ `POST /a,b/_pit?keep_alive=60s`. (Baked into §3.)

### #3 (D9) Lean projection + strip for mget — ✅ RESOLVED: extract a shared helper
`resolveSearchAfterHit` (`ElasticSearch.scala:512`) uses only `hit.sourceAsString`/`.index`/`.id`,
so it generalises trivially. The projection vals (`imageSourceFields:496`,
`searchAfterDropFields:502` = `Set("embedding","originalMetadata","fileMetadata")`,
`projectionIncludes:595`) are private instance vals reusable from an mget path. elastic4s `multiget`
accepts projected `get(index,id).fetchSourceInclude(...)` sub-requests (existing model at `:147`).
`mapImageFrom` (`:478`) does a *raw* `validate[Image]` that fails on the partial `fileMetadata`, so
mget must use the strip path. **Plan:** extract the body of `resolveSearchAfterHit` into a shared
`mapLeanImageFrom(sourceAsString, id, index): Option[SourceWrapper[Image]]` called from both
`searchAfter` and mget. (Baked into §4.)

### #4 (D9) Enrichment-overlay population — ⚖️ DECISION (recommended default: populate, for both)
**Research.** The overlay is read on three paths: search (`ImageGrid.tsx:213`, `ImageTable.tsx:275`),
image-detail (`ImageMetadata.tsx:193`, reached from `ImageDetail.tsx:858`), and selection
(`MultiImageMetadata.tsx:320` — the Cost Summary's `deriveImage`). Therefore:
- **`getById` (image detail)** renders via `deriveImage` → it *needs* the overlay to show
  server-authoritative `cost`/`valid`/`syndicationStatus` in the sidebar.
- **`getByIds` (selection)** — most chips read `selection-store.metadataCache`, but the multi-select
  **Cost Summary** merges via `deriveImage(overlay)`; without it the aggregate can disagree with the
  grid's per-image cost icons.
- `upsertEnrichment` is an additive, id-scoped merge (`enrichment-store.ts:82`) → **no clobber** of
  search-store's overlay entries.

**Recommended default (for the team):** populate the overlay for **both** `getById` and `getByIds`.
The detail view mandatorily needs it; selection's Cost Summary needs it for consistency; it is
clobber-safe. The only counter-argument is minimalism, which the consistency wins outweigh. Write
at D3's commit-to-view discipline (on result commit, never inside a probe call).

> **★ Cross-cutting (couples #3 and #4):** selection renders alias fields (e.g. `editStatus`,
> `colourProfile`) that prefer the server `aliases` map and fall back to `fileMetadata` via
> `resolveEsPath` (`field-registry.tsx:947`). The lean projection drops `fileMetadata` bulk, so the
> mget response **must** carry the `aliases` map — which it does, because D9 enriches via
> `imageResponse.create` (same as searchAfter). The lean projection is safe for selection *only*
> because enrichment emits `aliases`; do **not** return raw `_source` without enrichment.

---

## 1. Shared foundation (built by D3 — reuse, do not rebuild)

All three endpoints inherit the conventions D3 established. See
`media-api-instructions-for-agents.md` items 23–27 for the Scala spelling.

| Asset | Location | Reused by |
|-------|----------|-----------|
| `auth.async(parse.json)` POST controller pattern | `MediaApi.searchAfterImages`, `MediaApi.scala:801` | D7, D9 (D8's POST is body-light) |
| `SearchParamsBody.fromJson(body, tier)` | `ElasticSearchModel.scala:91` | D7 (D9/D8 don't need full SearchParams) |
| Lifted private `hitToImageEntity(request, include)` | `MediaApi.scala` (lifted in D3) | D9 |
| `mapImageFrom(sourceAsString, id, index) → SourceWrapper[Image]` | `ElasticSearch.scala:466` | D9 |
| Lean `_source` projection + strip-before-validate | `ElasticSearch.scala:495-521` (`resolveSearchAfterHit`) | D9 |
| Migration-aware index list | `prepareSearch`, `ElasticSearch.scala:464` | D8 (replicate for PIT open) |
| Route-ordering rule (specific before `/:id`) | `conf/routes:15` (`search-after` before `GET /images/:id`) | D7, D8, D9 |
| Typed response case class + `OWrites` | D3's `SearchAfterResponse` in `MediaApi.scala` | D7, D8, D9 |
| StranglerAdapter override pattern | `strangler-adapter.ts:51` (`searchAfter` → `apiSearchAfter`) | D7, D8, D9 |
| `apiX` adapter-function pattern | `grid-api-search-adapter.ts` (`apiSearchAfter`) | D7, D8, D9 |

**Standing constraints that apply** (findings doc banner): POST + `auth.async(parse.json)`;
new `*Params`/`*Results` case classes in `ElasticSearchModel.scala` with `OWrites`; never touch
Kahuna-serving code (`createSort`, `imageSearch` behaviour) non-additively; one Scala commit per
gap; one PR doc per Scala commit (`phase-3-d3-searchafter-scala-pr.md` is the template).

---

## 2. D7 — `POST /images/count` (count + tickers)

### Endpoint contract

```
POST /images/count
Content-Type: application/json
Cookie: <panda>

{ "q": "cats", "since": "2024-01-01T00:00:00Z", ...all SearchParams filter fields... }

→ 200  application/vnd.argo+json
{
  "total": 1300000,
  "tickerCounts": {
    "GNM-owned":    { "value": 421,  "subCounts": null },
    "agency picks": { "value": 1180, "subCounts": { "Reuters": 640, "AP": 540 } }
  }
}
```

One endpoint serves both DAL methods: `countWithTickers` reads `{total, tickerCounts}`; `count`
reads `total` only (F2 — `count(params) ≡ countWithTickers(params).total`). Tickers are cheap
`size=0` aggs, so always return them.

### Server (Scala)

| File | Change |
|------|--------|
| `conf/routes` | `POST /images/count` — before `GET /images/:id`. |
| `ElasticSearchModel.scala` | New `CountWithTickersResults(total: Long, tickerCounts: Map[String, ExtraCount])` + `OWrites`. |
| `ElasticSearch.scala` | New `countWithTickers(params): Future[CountWithTickersResults]`. |
| `MediaApi.scala` | New `countImages()` action. |

**`ElasticSearch.countWithTickers`:** mirror the ticker path `imageSearch` already runs.
Build the filtered query exactly as `searchAfter` does (`queryBuilder.buildFilterOpt`), then a
`size(0).trackTotalHits(true)` search with the ticker aggregations from
`aggregationsNameToSearchClauseMap` (`ElasticSearch.scala:69`) — the same aggs `imageSearch`
already attaches at `:332` and maps into `ExtraCounts` at `:350`. Reuse that mapping; do not
re-invent it — it already emits the agency-picks `usageRights.supplier` sub-breakdown into
`ExtraCount.subCounts` (§0 #1 — resolved; `ElasticSearch.scala:73-82,350-362`). Return `total` +
the ticker map.

> Ticker names are config-derived server-side (`${config.staffPhotographerOrganisation}-owned`).
> On the GNM deployment these equal the client's hardcoded `GNM-owned` (parity confirmed). The
> response keys come from server config; the client consumes them by name — no translation needed
> on GNM, but note the coupling.

**`MediaApi.countImages`:** `auth.async(parse.json)` → `SearchParamsBody.fromJson` →
`elasticSearch.countWithTickers` → `Ok(Json.toJson(results)).as(ArgoMediaType)`. logMarker first.
Mirror `searchAfterImages` (`MediaApi.scala:801`) exactly, minus the hit-enrichment.

### Kupua (TypeScript)

| File | Change |
|------|--------|
| `grid-api-search-adapter.ts` | New `apiCountWithTickers(params)` — POST body via the same filter-mapping as `apiSearchAfter`; map `{total, tickerCounts}` → `CountWithTickersResult` (`types.ts:131`). |
| `strangler-adapter.ts` | Override `countWithTickers` → `apiCountWithTickers`; keep `count` delegating to `countWithTickers().then(r => r.count)` (or override too). |
| `vite.config.ts` | Whitelist `POST /api/images/count` in the write guard (as for `search-after`). |

Call sites unaffected (`search-store.ts:619` poll, `:1917` AI, `:1971` initial) — they call the
DAL method, which now routes to the server in `--use-media-api` mode.

### Test plan
- Scala: `ElasticSearchTest` — total matches a known fixture count; ticker counts match the
  fixtures for `is:GNM-owned` and `is:agency-pick`; `since` filter narrows total; agency-picks
  sub-counts present (if verify-item #1 requires the sub-agg).
- TS: `apiCountWithTickers` request-body shape + response mapping; `StranglerAdapter.countWithTickers`
  routes to the api fn.

### Done when
- [ ] `POST /images/count` returns `{total, tickerCounts}` (curl).
- [ ] `--use-media-api` poll banner + status bar counts correct; `--use-media-api=false` unchanged.
- [ ] Sub-counts (agency-by-supplier) present — reused from the existing `ExtraCount.subCounts` (§0 #1).

---

## 3. D8 — `POST /images/pit` + `DELETE /images/pit/:pitId`

### Endpoint contract

```
POST /images/pit              → 200 { "pitId": "abc..." }      (body optional: { "keepAlive": "1m" })
DELETE /images/pit/:pitId     → 204 (or 200 { "closed": true })
```

### Server (Scala)

| File | Change |
|------|--------|
| `conf/routes` | `POST /images/pit` and `DELETE /images/pit/:pitId` — **both before** `DELETE /images/:id` (`conf/routes:25`) and `GET /images/:id`, else Play routes `pit` as an `:id`. |
| `ElasticSearch.scala` | New `openPit(keepAlive): Future[String]` and `closePit(pitId): Future[Unit]`. |
| `MediaApi.scala` | New `openPit()` + `closePit(pitId)` actions. |

**`ElasticSearch.openPit`:** build the **migration-aware index list** exactly as `prepareSearch`
does (`ElasticSearch.scala:464`):
```
val indexes = migrationStatus match {
  case cp: CompletionPreview => List(cp.migrationIndexName)
  case r:  Running           => List(imagesCurrentAlias, r.migrationIndexName)
  case _                     => List(imagesCurrentAlias)
}
```
then open the PIT with the comma-joined index spelling (§0 #2 — resolved):
`createPointInTime(Index(indexes.mkString(","))).keepAlive(keepAlive)` → `POST /a,b/_pit?keep_alive=60s`.
(elastic4s has no `Indexes` overload for PIT; the handler interpolates `index.name` into the URL,
so comma-joining is the standard multi-index mechanism — same as `SearchHandlers`.) Reason it
matters: a PIT opened only against the old index during a migration would make already-migrated
images invisible to every `searchAfter` that uses it (the mirror of D3's F-6 fix).

**`ElasticSearch.closePit`:** `deletePointInTime(pitId)`, fire-and-forget, ignore the response
(matches the client's current `closePit`).

**`MediaApi` actions:** `openPit` — `auth.async` (no body parser needed; keepAlive optional via a
tiny JSON body or a query param), respond `{pitId}`. `closePit` — `auth.async`, respond 204.
Both are minimal; no `SearchParams`, no enrichment.

### Kupua (TypeScript)

| File | Change |
|------|--------|
| `grid-api-search-adapter.ts` | New `apiOpenPit(keepAlive?)` (POST, returns `pitId`) and `apiClosePit(pitId)` (DELETE). |
| `strangler-adapter.ts` | Override `openPit`/`closePit` (`:38-39`) to route to the api fns. |
| `vite.config.ts` | Whitelist `POST /api/images/pit` and `DELETE /api/images/pit/*`. |

The store's PIT lifecycle (`search-store.ts:1957` open in `Promise.all`, `:1835` close) is
unchanged — it calls the DAL methods. **Compatibility note:** the `pitId` the server returns is a
real ES PIT id, valid for both server-routed `searchAfter` and (if ever) direct-ES, because kupua
and the local media-api point at the same cluster (`KUPUA_ES_URL`, `vite.config.ts:133`). This is
the same assumption D3 already relies on.

### Test plan
- Scala: `openPit` returns a non-empty id; a `searchAfter` using that id paginates consistently;
  `closePit` succeeds; (if feasible) a migration-status fixture proves the index list spans both.
- TS: `apiOpenPit`/`apiClosePit` request shapes; `StranglerAdapter` routes both.

### Done when
- [ ] `POST /images/pit` → id; `DELETE /images/pit/:id` closes it (curl).
- [ ] `--use-media-api` scroll/seek session opens its PIT via the server and paginates correctly.
- [ ] Route ordering verified (`DELETE /images/pit/x` is NOT matched as `deleteImage("pit")`).

---

## 4. D9 — `POST /images/mget`

### Endpoint contract

```
POST /images/mget
Content-Type: application/json

{ "ids": ["abc001", "abc002", ...] }     // no 200 cap; missing ids silently absent

→ 200  application/vnd.argo+json
{ "data": [ <EmbeddedEntity per found image> ] }
```

Serves `getByIds` (returns the array) and `getById` (`getByIds([id])[0]`). Order: `_mget`
preserves request order; missing ids drop out, so the client must not assume positional
alignment (kupua's `getByIds` already filters `doc.found`, `es-adapter.ts:2114`).

### Server (Scala)

| File | Change |
|------|--------|
| `conf/routes` | `POST /images/mget` — before `GET /images/:id`. |
| `ElasticSearch.scala` | New `getByIds(ids): Future[Seq[(String, SourceWrapper[Image])]]` via elastic4s `multiget`. |
| `MediaApi.scala` | New `mgetImages()` action — enrich each via the lifted `hitToImageEntity`. |

**`ElasticSearch.getByIds`:** `multiget(ids.map(id => get(imagesCurrentAlias, id).fetchSourceInclude(projectionIncludes.head, projectionIncludes.tail: _*)))`
— reuse the existing lean projection vals (`imageSourceFields:496`, `searchAfterDropFields:502`,
`projectionIncludes:595`). For each `response.items.filter(_.found)`, turn `item.sourceAsString`
into a `SourceWrapper[Image]` via a **shared `mapLeanImageFrom(sourceAsString, id, index)` helper
extracted from the body of `resolveSearchAfterHit`** (§0 #3 — resolved). Do **not** use
`mapImageFrom` (`:478`) directly — it does a raw `validate[Image]` that fails on the partial
`fileMetadata` the lean projection produces; the strip-before-validate is mandatory. This is
*not* `lookupIds` (`:166`) — that uses `pinned_query` + the 200 cap and must not be reused.
Consider a server-side hard cap (e.g. 1000–5000) on `ids.length` with a 422 over it (kupua already
chunks at 1000).

**`MediaApi.mgetImages`:** `auth.async(parse.json)` → parse `{ids}` → `elasticSearch.getByIds`
→ map each via the lifted `hitToImageEntity(request, include)` → respond `{data: [...]}` as
`ArgoMediaType`. Mirrors `searchAfterImages` minus the cursor/sort machinery.

### Kupua (TypeScript)

| File | Change |
|------|--------|
| `grid-api-search-adapter.ts` | New `apiGetByIds(ids)` — POST `{ids}`; map the Argo `data` array → `Image[]` via the existing `mapApiImageToImage`; **populate the overlay** via `upsertEnrichment` for these ids (§0 #4 — recommended default: both `getById` and `getByIds`, pending team sign-off). |
| `strangler-adapter.ts` | Override `getByIds` → `apiGetByIds`; keep `getById` delegating to `getByIds([id]).then(r => r[0])`. |
| `vite.config.ts` | Whitelist `POST /api/images/mget`. |

Call sites unaffected: `selection-store.ts:635` (`ensureMetadata`), `:673` (`hydrate` — note it
drops `missingIds` and toasts, so silent-absence of missing ids must be preserved),
`ImageDetail.tsx:235` (`getById`).

### Test plan
- Scala: `getByIds` returns found docs in request order; missing ids absent; >cap → 422 (if
  capped); enriched fields present (cost/valid/etc. via `imageResponse.create`); lean projection
  + alias leaves intact (reuse D3's field-alias regression guard pattern).
- TS: `apiGetByIds` request/response mapping; missing-id handling; `StranglerAdapter` routes
  `getByIds` and `getById`; (if overlay) enrichment upsert covered.

### Done when
- [ ] `POST /images/mget` returns enriched images, missing ids absent (curl).
- [ ] `--use-media-api` multi-selection load + session reload (`hydrate`) work; missing-id toast
      still fires; image-detail direct-URL open (`getById`) works.
- [ ] Detail sidebar + multi-select Cost Summary show server-authoritative cost/validity (overlay
      populated — §0 #4).
- [ ] `--use-media-api=false` unchanged.

---

## 5. Ordering, commits, PRs

Per `media-api-worknotes.md` and standing constraint #27:

- **One session, six commits:** three Scala (one per gap) + three TS (one per gap), split by
  folder so each gap cherry-picks cleanly onto `main` as its own PR.
- **One PR doc per Scala commit:** `phase-3-d7-count-scala-pr.md`, `phase-3-d8-pit-scala-pr.md`,
  `phase-3-d9-mget-scala-pr.md` (template: `phase-3-d3-searchafter-scala-pr.md`). Each notes the
  POST + `auth.async(parse.json)` pattern (now established) and any verify-item resolution.
- **No Kahuna risk:** all three are purely additive new routes. None touches `createSort`,
  `imageSearch` behaviour, or `prepareSearch` (D8 *reads* its index-selection logic but does not
  modify it). `lookupIds` stays untouched (D9 uses `multiget`, not `lookupIds`).
- **PIT (D8) before D1/D2 later:** D8 is the snapshot-consistency dependency for the future
  L-items; landing it now unblocks them.

## 6. Combined test surface (run before any commit)

- Scala integration: `TZ=UTC sbt "media-api/test"` — new `ElasticSearchTest` blocks for each gap.
- TS unit: `npm --prefix kupua test` — new adapter + strangler tests for each gap.
- Playwright e2e (default ES mode, regression): `npm --prefix kupua run test:e2e` — these endpoints
  touch poll/selection/PIT paths; run the full suite. **Warn about port 3000 first.**
- Manual `--use-media-api`: poll banner (D7), scroll/seek PIT session (D8), multi-select +
  reload + image-detail open (D9).

## 7. Done when (all three)

- [ ] Three new routes respond on local media-api (curl).
- [ ] `--use-media-api` mode: counts, PIT-backed scrolling, and selection loads all correct.
- [ ] `--use-media-api=false`: zero regression (full e2e green).
- [ ] §0: items #1–#3 resolved (baked into the plan); #4 (overlay population) signed off by the team.
- [ ] Six commits (3 Scala + 3 TS), three Scala-PR docs.

## 8. Reference

| Source | What |
|--------|------|
| `phase-3-minimal-gap-derivation-findings.md` | The plan + standing constraints (status banner). D7/D8/D9 detail in §2 + §5. |
| `phase-3-d3-searchafter-scala-pr.md` | PR-doc template; the POST/`auth.async(parse.json)`/`fromJson`/`hitToImageEntity` precedent. |
| `media-api-instructions-for-agents.md` | Scala mechanics, items 23–27 (Option-B, PIT bypass, lean projection, shared blocks, commit discipline). |
| `media-api-conventions.md` | Controller/route/Argo/test conventions. |
| `media-api-worknotes.md` | Branch + PR-extraction recipe. |
| `zz Archive/media-api-work/ref--media-api-gap-01-searchAfter-findings-2.md` | elastic4s PIT API notes (for D8). |
| `zz Archive/media-api-work/ref--media-api-gap-closure-feasibility.md` | Per-gap feasibility (Gap 12 = mget, Gap 17 = count). |
