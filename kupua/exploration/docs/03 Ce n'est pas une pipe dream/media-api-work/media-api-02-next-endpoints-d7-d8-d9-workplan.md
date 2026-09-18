# Next endpoints: D7 counts, D8 PIT lifecycle, D9 image reads

> **Current scope, 17 September 2026:** use [media-api-00-index.md](media-api-00-index.md).
> The [agreed D3 amendment batch](d3-search-after-01-readiness-findings.md) is complete.
> Prepare one separately authorized additive capability at a time; these are not unfinished
> D3 amendments or one approved implementation batch.
> Preserve current workflows and accepted compromises; index-migration support is out of scope.
>
> - **D7/initial count:** polling is required. Initial-count ownership is an explicit D7/D3
>   choice, not a compulsory fusion experiment before unrelated work.
> - **D8:** replace the multi-index/no-dedup design below. Thrall retains both copies
>   during migration and marks the old one `migratedTo`; that PIT can snapshot duplicate
>   identities. Decide ordinary-operation PIT lifecycle and dependent consumers without
>   importing the archived architecture, Dynamo storage or Thrall hooks.
> - **D9:** retain the existing focused review and add datasource wiring. Selection owns
>   a directly constructed `ElasticsearchDataSource`, so a `StranglerAdapter` override
>   alone will not migrate `getByIds`. The same issue affects D2 `getIdRange`.
>
> The detailed endpoint sketches below are research input, not build instructions, until
> these reviews amend them. See the authoritative banner in
> `media-api-01-capability-inventory.md` and the migration addendum in
> `../../zz Archive/performance-first-dry-consolidation-audit-2026-09-13.md`.

> **Historical D9 review amendment — 7 September 2026 (D7/D8 readiness superseded
> by the 13 September amendment above):** Before implementing D9, perform a focused plan review;
> do not treat its current section as ready. Resolve three material issues:
> (1) apply `isVisibleToAccessor` and omit unauthorized images exactly like
> missing IDs; (2) align client chunking and server per-request limits because
> the proposed Strangler override bypasses ES-adapter chunking; (3) choose a
> coherent enrichment-write boundary instead of simultaneously requiring
> commit-to-view writes and adapter-side `upsertEnrichment`. The review must also
> retain the special-date projection regression added below.

**Status:** D7 needs a count-ownership decision; D8 needs an ordinary PIT contract;
D9 needs focused contract review and datasource wiring. None is approved merely by this document.
If implemented, keep separate
Scala commits (one per gap) for per-gap PR extraction and reuse D3's POST plumbing.

**The three gaps** (from `media-api-01-capability-inventory.md` §5):

| Gap | New capability | Size | Kupua DAL methods served |
|-----|----------------|------|--------------------------|
| **D7** | `countWithTickers` — `size=0` count + ticker aggs, no hits | S | `countWithTickers`, `count` (degenerate) |
| **D8** | PIT lifecycle and page/expiry contract | Unestimated | `openPit`, `closePit` and consumers |
| **D9** | Bounded, visible, enriched multi-image reads | Unestimated | `getByIds`, `getById` |

**Why originally batched (sizing premise now superseded):** they appeared S-sized and reused the
same D3 controller plumbing. The review found contract coupling in D7/D3, high-risk membership in
D8, and migration/envelope/routing work in D9. They are no longer one implementation batch.

**Why now:** D8 (PIT) is also the consistency dependency for the future L-items D1
(`fetchPositionIndex`) and D2 (`getIdRange`), so it should land before them. D7 and D9 are
high-frequency, must-have paths (D7 fires on every new-images poll tick; D9 backs every
multi-selection load) — they take kupua meaningfully closer to "100% on media-api".

**Provisional preparation order after the completed D3 batch:** D7, then D9; resolve D8
before implementing its dependent positional capabilities. No D3 reassessment or archived
document-number gate remains. Amend only the next capability's contract before its
implementation is authorized.

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

### #2 (D8) PIT spelling — library mechanism resolved, architecture unresolved
`createPointInTime(index: Index)` can open a single index; comma-joining can technically address
multiple indexes. That proves transport mechanics only. It does not establish canonical-copy
selection, logical-ID uniqueness, page-one consistency, refreshed-ID ownership or expiry behavior.
The dedicated D8 research must choose the index/session model and decide whether raw `pitId` remains
the correct D3 contract.

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
`media-api-91-instructions-for-agents.md` items 23–27 for the Scala spelling.

| Asset | Location | Reused by |
|-------|----------|-----------|
| `auth.async(parse.json)` POST controller pattern | `MediaApi.searchAfterImages`, `MediaApi.scala:801` | D7, D9 (D8's POST is body-light) |
| `SearchParamsBody.fromJson(body, tier)` | `ElasticSearchModel.scala:91` | D7 (D9/D8 don't need full SearchParams) |
| Lifted private `hitToImageEntity(request, include)` | `MediaApi.scala` (lifted in D3) | D9 |
| `mapImageFrom(sourceAsString, id, index) → SourceWrapper[Image]` | `ElasticSearch.scala:466` | D9 |
| Lean `_source` projection + strip-before-validate | `ElasticSearch.scala:495-521` (`resolveSearchAfterHit`) | D9 |
| Existing live query routing | `prepareSearch` | Reuse where appropriate; do not copy its multi-index migration target into a PIT. |
| Route-ordering rule (specific before `/:id`) | `conf/routes:15` (`search-after` before `GET /images/:id`) | D7, D8, D9 |
| Typed response case class + `OWrites` | D3's `SearchAfterResponse` in `MediaApi.scala` | D7, D8, D9 |
| StranglerAdapter override pattern | `strangler-adapter.ts:51` (`searchAfter` → `apiSearchAfter`) | D7, D8, D9 |
| `apiX` adapter-function pattern | `grid-api-search-adapter.ts` (`apiSearchAfter`) | D7, D8, D9 |

**Standing constraints that apply** (findings doc banner): POST + `auth.async(parse.json)`;
new `*Params`/`*Results` case classes in `ElasticSearchModel.scala` with `OWrites`; never touch
Kahuna-serving code (`createSort`, `imageSearch` behaviour) non-additively; one Scala commit per
gap; one PR doc per Scala commit (`d3-search-after-02-pr.md` is the template).

---

## 2. D7 — `POST /images/count` (count + tickers)

> **Decision needed:** D7 serves polling/count-only calls. Before using it at startup, name the
> owner of the displayed initial total and tickers. Options include retaining current parallel
> behavior with its documented timing limitation or consolidating into D3/D7 with explicit count
> intent. Preserve exact totals. Do not fuse responses or strengthen snapshot guarantees merely
> to satisfy this plan. Measure if choosing between materially different cost/latency paths.

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

The D7 endpoint serves actual `countWithTickers` callers. Do not add a standalone count route
solely for an unused interface wrapper. The initial-search pattern follows the ownership decision
above; the contract below sketches the polling response only.

### Server (Scala)

| File | Change |
|------|--------|
| `conf/routes` | `POST /images/count` — before `GET /images/:id`. |
| `ElasticSearchModel.scala` | New `CountWithTickersResults(total: Long, tickerCounts: Map[String, ExtraCount])` + `OWrites`. |
| `ElasticSearch.scala` | New `countWithTickers(params): Future[CountWithTickersResults]`. |
| `MediaApi.scala` | New `countImages()` action; change D3 only if selected by the count decision. |

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

Poll/AI count call sites continue through the DAL. Startup changes depend on the chosen contract.
Poll failures must not publish zero as a successful count. Eventual API-only failure cannot invoke
browser ES; the hybrid mode's behavior remains a separate contract.

### Test plan
- Scala: `ElasticSearchTest` — total matches a known fixture count; ticker counts match the
  fixtures for `is:GNM-owned` and `is:agency-pick`; `since` filter narrows total; agency-picks
  sub-counts present (if verify-item #1 requires the sub-agg).
- TS: `apiCountWithTickers` request-body shape + response mapping; `StranglerAdapter.countWithTickers`
  routes to the api fn.
- If changing initial-count ownership, test publication and compare latency/work against the
  current path. Do not run live experiments without permission or make fusion a precondition.

### Done when
- [ ] `POST /images/count` returns `{total, tickerCounts}` (curl).
- [ ] Initial total/ticker ownership and consistency are explicit and tested for the selected
  contract; any intentional timing compromise is accepted rather than hidden.
- [ ] `--use-media-api` poll banner + status bar counts correct; `--use-media-api=false` unchanged.
- [ ] Sub-counts (agency-by-supplier) present — reused from the existing `ExtraCount.subCounts` (§0 #1).

---

## 3. D8 — Ordinary-operation PIT lifecycle (decision required)

Decide the smallest ordinary-operation contract needed to remove browser PIT calls. Compare
sequential use of D3, combined opening/page one, and protected continuation transport only as
necessary. Shared storage is not predetermined by multiple API servers. Identify current handling
of refreshed IDs, failed/lost responses, expiry and cleanup; distinguish existing limitations from
regressions or stronger guarantees. No multi-index PIT or Thrall change is authorized.

Constraints that survive every option:

- logical image IDs appear at most once and public sort tuples stay deterministic;
- the ordinary-operation target and the limits of any snapshot guarantee are explicit;
- page-one versus continuation consistency is stated explicitly rather than implied;
- close is idempotent and the selected continuation transport is authenticated and lossless;
- D3's deliberate `_shard_doc` truncation is not casually changed;
- hybrid behavior is distinct from eventual API-only operation, which cannot fall back to browser ES;
- known limitations need explicit acceptance; authorization/integrity risks must not be hidden.

### Done when

- [ ] Current PIT behavior/tests are read and the smallest unresolved question has a focused check.
- [ ] Record the chosen ordinary contract, limitations, caller changes and tests here before
  implementation; any new infrastructure needs explicit approval.
- [ ] Identify affected D3/positional consumers; do not claim migration support.

**Addendum (12 August 2026, from `search-request-cancellation-workplan.md` §10):**
- `closePit` must gracefully no-op on a PIT id that's unfamiliar, already-expired, or was
  never used for a real search — kupua's store now proactively closes a superseded
  search's PIT (opened, then immediately superseded before ever being needed), so
  `closePit` will be called in more scenarios than a naive design might assume. This
  should not surface as an error to the client — mirrors the already-accepted, already-
  caught `DELETE .../_pit` 404 on the direct-ES path today.
- Give `openPit`/`countWithTickers` a `signal` param on the TS/Scala surface for
  consistency with the rest of the interface. Not urgent — a spike found these calls
  usually complete faster than a realistic typing pause in kupua's current dev/TEST
  environment, so client-side cancellation would rarely fire — but that finding is
  latency-dependent and may not hold at production scale (JVM GC pauses, ES thread-pool
  queueing under many concurrent users). Cheap to include now, expensive to retrofit later.

**Addendum (17 August 2026) — do NOT "fix" the PIT cursor tiebreaker.** D8 makes the PIT
branch of `searchAfter` a server lifecycle concern; it is already reachable in hybrid mode.
ES appends an implicit `_shard_doc` to every hit's sort array under a
PIT, and `searchAfter` truncates it away. That truncation is deliberate and correct —
cursors outlive the PIT (kupua persists them and retries without a PIT on 404/410, where a
`_shard_doc` value is rejected with a 400), and client-synthesised cursors could never
contain one. It was measured, "fixed", and reverted. Full reasoning:
`zz Archive/media-api-work/phase-3-d3-searchafter-post-pr-review.md` §D-6.

---

## 4. D9 — `POST /images/mget`

> **Additional review gate:** route or inject the selection store's datasource before claiming
> that the Strangler override migrates this method. Add a media-api-mode routing test for selection
> hydration; preserve exactly one commit-to-view enrichment owner. Also measure before selecting a
> cap: D3's current enriched Argo envelope costs about 137ms per 200 hits, so applying the same path
> to 1,000 selected images can make this endpoint neither S-sized nor operationally cheap. Prefer a
> measured smaller client chunk and/or a bulk response that omits unused signed URLs/links while
> retaining aliases and the server-authoritative fields selection actually consumes.

### Endpoint contract

```
POST /images/mget
Content-Type: application/json

{ "ids": ["abc001", "abc002", ...] }     // explicit server cap to be selected; hidden/missing IDs omitted

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
The focused review must measure envelope CPU, signing work, payload and memory before choosing the
server cap. Do not default to 1,000 merely because direct `_mget` uses that chunk size; the response
path now enriches every image.

> **Scope:** this sketch targets ordinary operation. Existing `migrationAwareGetter` prefers
> migration copies; do not change it or promise equivalent behavior during migration. Dual-index
> batching is not required for the unsupported case. Before general Grid API use, agree and disclose
> the supported scope and maintenance behavior with the team.

> **Review required — limit/chunking:** the existing 1,000-ID chunking is inside
> `ElasticsearchDataSource.getByIds`. Overriding `StranglerAdapter.getByIds`
> bypasses it. Choose one contract before implementation: preferably the API
> client issues abort-aware parallel chunks at the measured cap and the server
> rejects larger individual requests with a stable 422. Do not claim “no cap”
> while also relying on an implicit client cap.

**`MediaApi.mgetImages`:** `auth.async(parse.json)` → parse `{ids}` → `elasticSearch.getByIds`
→ map each via the lifted `hitToImageEntity(request, include)` → respond `{data: [...]}` as
`ArgoMediaType`. Mirrors `searchAfterImages` minus the cursor/sort machinery.

Before enrichment/response mapping, call `isVisibleToAccessor` for every found
image. Omit unauthorized images exactly like missing IDs; never reveal whether a
requested hidden ID exists. Add a mixed visible/hidden Scala regression.

### Kupua (TypeScript)

| File | Change |
|------|--------|
| `grid-api-search-adapter.ts` | New `apiGetByIds(ids)` — POST abort-aware chunks within the agreed per-request cap; map Argo `data` → `Image[]`. **Review required:** either extend the result contract so callers write enrichment at commit-to-view points, or explicitly approve adapter-side `upsertEnrichment` as a documented D9 exception. Do not implement both ownership models. |
| `strangler-adapter.ts` | Override `getByIds` → `apiGetByIds`; keep `getById` delegating to `getByIds([id]).then(r => r[0])`. |
| `vite.config.ts` | Whitelist `POST /api/images/mget`. |

Route or inject the selection store's datasource so `ensureMetadata` and `hydrate`
actually use D9; a Strangler override alone does not migrate that owner. Retain the
detail `getById` path and the existing missing-ID handling. A failed or aborted read
must not be treated as a successful response that omitted every selected ID.

Preserve the current client lifecycle documented in the
[selection guide](../../00%20Architecture%20and%20philosophy/05-selections.md).
Reuse the [selection-store regressions](../../../../src/stores/selection-store.test.ts)
and [selection panel journeys](../../../../e2e/local/selections.spec.ts) when changing
transport. These are existing client guarantees, not additional server responsibilities.

### Test plan
- Scala: `getByIds` returns found docs in request order; missing and unauthorized
  IDs are both absent; a mixed visible/hidden request leaks no existence signal;
  over-cap input receives stable 422; enriched fields remain present; lean
  projection and aliases remain intact.
- Migration fixture: a batch containing migration-only/current-only/both/missing IDs returns one
  result per found ID, prefers the migration copy when both exist, and falls back to current.
- Performance: measure 200/500/1,000-ID envelope CPU, signed-URL/link work, payload and heap before
  accepting a cap. Reject a design that scales D3's full browse envelope blindly to bulk selection.
- Scala/TS projection regression: include one image with multiple
  `usages.dateAdded` values and multiple `collections.actionData.date` values.
  Prove the mget response preserves both complete arrays and that Kupua's
  `extractSortValues` chooses the same maximum date as the canonical `mode:max`
  sort. This protects range-selection cursor synthesis; D9 does not otherwise
  own special-sort ordering.
- TS: `apiGetByIds` chunks requests at the agreed cap with abort propagation;
  maps missing/hidden IDs safely; `StranglerAdapter` routes `getByIds` and
  `getById`; cover whichever enrichment ownership model the review selects.
- Client regressions: late off-buffer metadata publishes to Details/Usages through
  the cache revision; panels retain a coherent completed presentation while fetching
  and reconciling. Successful missing/hidden-ID omissions repair the selection anchor
  and retained cursor ownership. Failed reads preserve membership, and clear/navigation
  prevents late responses from resurrecting the old panel presentation.

### Done when
- [ ] `POST /images/mget` returns enriched images, missing ids absent (curl).
- [ ] Unauthorized IDs are indistinguishable from missing IDs.
- [ ] Running migration batches prefer the migration copy and fall back to current without duplicates.
- [ ] Client chunking and server request cap agree and are tested above the cap.
- [ ] Enrichment writes have one documented owner.
- [ ] Selection-owner routing and the existing metadata-publication, panel-coherence
  and hydration-anchor regressions pass through the media-api path.
- [ ] Multiple usage/collection dates survive projection and synthesize the
  canonical maximum-date cursor.
- [ ] `--use-media-api` multi-selection load + session reload (`hydrate`) work; missing-id toast
      still fires; image-detail direct-URL open (`getById`) works.
- [ ] Detail sidebar + multi-select Cost Summary show server-authoritative cost/validity (overlay
      populated — §0 #4).
- [ ] `--use-media-api=false` unchanged.

---

## 5. Ordering, commits, PRs

Per `../../zz Archive/media-api-work/media-api-worknotes.md` and standing constraint #27:

- **One session, six commits:** three Scala (one per gap) + three TS (one per gap), split by
  folder so each gap cherry-picks cleanly onto `main` as its own PR.
- **One PR doc per Scala commit:** `phase-3-d7-count-scala-pr.md`, `phase-3-d8-pit-scala-pr.md`,
  `phase-3-d9-mget-scala-pr.md` (template: `d3-search-after-02-pr.md`). Each notes the
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
| `media-api-01-capability-inventory.md` | The plan + standing constraints (status banner). D7/D8/D9 detail in §2 + §5. |
| `d3-search-after-02-pr.md` | PR-doc template; the POST/`auth.async(parse.json)`/`fromJson`/`hitToImageEntity` precedent. |
| `media-api-91-instructions-for-agents.md` | Scala mechanics, items 23–27 (pre-review semantic sort, PIT research gate, lean projection, shared blocks, commit discipline). |
| `media-api-90-conventions.md` | Controller/route/Argo/test conventions. |
| `../../zz Archive/media-api-work/media-api-worknotes.md` | Branch + PR-extraction recipe. |
| `zz Archive/media-api-work/ref--media-api-gap-01-searchAfter-findings-2.md` | elastic4s PIT API notes (for D8). |
| `zz Archive/media-api-work/ref--media-api-gap-closure-feasibility.md` | Per-gap feasibility (Gap 12 = mget, Gap 17 = count). |
