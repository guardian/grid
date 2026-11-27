# Media-API Enrichment Strategy — Findings

**Date:** 7 May 2026  
**Auditor:** Opus 4.6  
**Status:** Complete. All sections verified including empirical TEST checks.

> **⚠ SUPERSEDED in part — 10 May 2026.** This doc was written when the plan
> was "direct-ES + background `?ids=` enrichment side-channel". After Inventory
> A/B/C surfaced that the enrichment loop was doing almost no useful work once
> SOURCE_INCLUDES is widened, the background loop was deleted. **`useEnrichment`
> no longer exists.** API enrichment now fires only on user intent (download click,
> selection actions, etc.). Per-image cost / validity / overquota / isPotentiallyGraphic
> are TS-computed from ES baseline. See **§F** for the pivot summary and **§E**
> for the inventory takeaways. Sections C and 4 below contain superseded
> recommendations — flagged inline.

---

## Section 0 — Push-back

No fundamental framing issues. The handoff's hypothesis is correct: the capability
gap makes wholesale-mirror impractical. The analysis below confirms this formally
and identifies the enrichment pattern.

One adjustment: Question A's empirical verification is a nice-to-have, not a
blocker. The source proves by construction that search hits get identical
enrichment to single-image responses (`hitToImageEntity` calls the same
`imageResponse.create(...)` as `getImageResponseFromES` — both in
`MediaApi.scala:540–548`). TEST verification adds confidence on `?ids=` mechanics
(ordering, cap, missing-ID behaviour) but doesn't change the strategic answer.

---

## Section A — Search endpoint enrichment parity

### By-construction proof (source only)

**Claim:** Every image hit returned by `GET /images?…` (search) carries the same
enrichment as `GET /images/{id}` (single-image).

**Evidence:**

1. `MediaApi.scala:540` — `hitToImageEntity` calls:
   ```scala
   imageResponse.create(elasticId, image, writePermission, deletePermission,
     deleteCropsOrUsagePermission, include, request.user.accessor.tier)
   ```
   Cite: `media-api/app/controllers/MediaApi.scala:546`

2. `MediaApi.scala:642` — `getImageResponseFromES` (used by `getImage`) calls:
   ```scala
   imageResponse.create(id, source, writePermission, deleteImagePermission,
     deleteCropsOrUsagePermission, include, request.user.accessor.tier)
   ```
   Cite: `media-api/app/controllers/MediaApi.scala:649`

3. Both pass through the same `ImageResponse.create()` method
   (`media-api/app/lib/ImageResponse.scala:64`) which appends: `cost`,
   `valid`, `invalidReasons`, `persisted`, `syndicationStatus`, signed
   URLs, `links`, `actions`.

**Conclusion:** List-context hits ARE fully enriched — identical to single-image.
No "lite" response shape for search hits.

### `?ids=` mechanics (source + TEST verification)

| Question | Source answer | Empirical (TEST) | Cite |
|---|---|---|---|
| Request-order preserved? | Source uses `pinned_query` — should preserve order. | **NO.** Response returns in default sort order, not request order. Client must re-sort. | `common-lib/…/elasticsearch/filters.scala:59`; TEST verification Check 2 |
| N cap? | `SearchParams.maxSize = 200` enforced by `validateLength`. URL length is the other limit (~8k chars for ~150 IDs). | Confirmed — 200 cap. | `ElasticSearchModel.scala:220` |
| Missing/deleted IDs? | `resolveHit` returns `None` for JSON parse failures; `hits.flatten` drops them. Missing IDs silently absent from response. | **Confirmed.** Nonexistent IDs silently dropped. | `ElasticSearch.scala:160–175`; TEST verification Check 3 |
| Pagination? | `offset`/`length` applies — so `?ids=a,b,c&offset=0&length=10` works. | Confirmed. | `ElasticSearch.scala:165–167` |

### Sub-question: empty `q=` vs omitted `q`

Both produce `List[Condition]()` → `matchAllQuery()`.
Cite: `ElasticSearchModel.scala:136` (`query.map(Parser.run) getOrElse List()`) +
`QueryBuilder.scala:97` (`conditions match { case Nil => matchAllQuery() }`).

Functionally identical.

---

## Section B — Capability Gap Inventory (PRIMARY DELIVERABLE)

### Method

1. Walked kupua's `ImageDataSource` interface (`src/dal/types.ts`) — 17 methods.
2. Checked `es-adapter.ts` for ES primitives each method uses.
3. Cross-referenced media-api's exposed surface: `conf/routes`,
   `ElasticSearch.scala`, `ElasticSearchModel.scala`, `sorts.scala`,
   `AggregationController.scala`.

### Gap Table

| # | Kupua capability | ES primitives used | media-api exposes? | Gap severity |
|---|---|---|---|---|
| 1 | **`searchAfter` cursor pagination** | `_search` + `search_after` + `sort` | No — offset/length only (`from`/`size`, max 200) | **HARD GAP** |
| 2 | **Point-in-Time (PIT)** | `POST _pit`, `DELETE _pit` | No endpoint, no param | **HARD GAP** |
| 3 | **`countBefore` (position lookup)** | `_count` with range query on sort values | No — no arbitrary count endpoint | **HARD GAP** |
| 4 | **`estimateSortValue` (percentile seek)** | `_search` + `percentiles` agg | No | **HARD GAP** |
| 5 | **`findKeywordSortValue` (composite walk)** | `_search` + `composite` agg | No | **HARD GAP** |
| 6 | **`getKeywordDistribution` (full composite)** | `_search` + `composite` agg, multi-page | No | **HARD GAP** |
| 7 | **`getDateDistribution` (date histogram)** | `_search` + `date_histogram` agg | Partial — `GET /images/aggregations/date/:field` exists but uses fixed monthly buckets, no query filter passthrough, no cumulative positions | **SOFT GAP** |
| 8 | **`fetchPositionIndex` (full position map)** | Multi-page `search_after` with `_source: false`, own PIT | No | **HARD GAP** |
| 9 | **Reverse sort / `missingFirst`** | `search_after` + reversed sort clause + `missing: "_first"` | No — single fixed sort direction per `orderBy` | **HARD GAP** |
| 10 | **Two-phase null-zone seek** | Two queries: exists-filter + must_not-exists-filter, custom sort per phase | No | **HARD GAP** |
| 11 | **`_source` include/exclude shaping** | `_source: { includes: [...] }` (29 fields) | No — full document returned always | **SOFT GAP** (bandwidth only) |
| 12 | **`getByIds` (multi-get, 1k chunks)** | `POST _mget` | Workaround: `GET /images?ids=a,b,c` (cap 200, paginate) | **SOFT GAP** |
| 13 | **`getIdRange` (cursor walk, `_source: false`)** | `search_after` + range filter + `_source: false` | No | **HARD GAP** |
| 14 | **Free-text + CQL** | `query_string` / `bool` via `cql.ts` | Yes — `q=` param passes through same `Parser.run` + `QueryBuilder` | **PARITY** |
| 15 | **Filter combinations** | Named bool filters | Yes — named params (`free`, `payType`, `since`, `until`, etc.) | **PARITY** |
| 16 | **Sort fields** | Multi-field sort clause (`-uploadTime`, `taken`, etc.) | Yes — `orderBy` param, same `sorts.createSort` logic | **PARITY** |
| 17 | **`count` (lightweight)** | `_count` | No dedicated endpoint (could use `length=0&countAll=true` as workaround — returns `total` in response) | **SOFT GAP** |
| 18 | **`getAggregation` / `getAggregations` (facets)** | `_search` + `terms` / multi-agg | Partial — `GET /images/metadata/:field` (metadata) + `GET /images/aggregations/date/:field` (dates). No batched multi-field. No pass-through of current search filters (only `?q=`). | **SOFT GAP** |
| 19 | **`getById` (single image)** | `GET _doc/{id}` / `_search ids:["x"]` | Yes — `GET /images/{id}` (fully enriched) | **PARITY** |
| 20 | **`search` (basic results)** | `_search` + `from`/`size` + sort | Yes — `GET /images?q=&length=N&offset=M` | **PARITY** (for first 200 results only) |

### Summary

- **9 HARD GAPS** (rows 1–6, 8–10, 13) — these are the foundations of kupua's
  scroll architecture (scrubber, position preservation, two-tier virtualisation,
  sort-around-focus, range selection). None have workarounds without Scala changes.
- **5 SOFT GAPS** (rows 7, 11, 12, 17, 18) — workarounds exist (extra
  round-trips, client-side post-processing, bandwidth overhead).
- **5 PARITY** (rows 14–16, 19–20) — media-api mirrors kupua's needs.

---

## Section C — Non-ES Datum Surface Map

Data sourced from comms-audit §2.1 "Data Model Accessors" and contract-audit §3.

> **§C SUPERSEDED in part — see banner at top.** The "API enrichment overwrites"
> framing throughout this section is stale. Cost / overquota / isPotentiallyGraphic
> are now TS-only (no per-image API call). The cost row's TS implementation landed
> as `calculate-cost.ts`; overquota is implemented (boot-time `quota-store.ts`,
> not a vendored snapshot). The `actions` / `links` / signed-URL rows remain
> accurate as describing the data Grid emits — but kupua no longer fetches them
> in the background; intent-driven only.

| Datum | Source | Kupua surface(s) | Fetch mechanism | Notes |
|---|---|---|---|---|
| `cost` — Free/Conditional/Pay (ES-derivable) | `usageRights.category` → `defaultCost` (static map); `usageRights.restrictions` → Conditional; `usageRights.supplier` + `suppliersCollection` → free supplier check (config list) | Results grid (badge), results table (column), image detail | **Client-side TS replication** using ES fields + vendored config snapshot | ~50 lines. Covers ~95% of images. Needs `freeSuppliers` + `suppliersCollectionExcl` (incl. `payGettySourceList`, ~400 entries) from `common-lib/src/main/scala/com/gu/mediaservice/lib/guardian/GuardianUsageRightsConfig.scala`. Vendor as `kupua/src/lib/cost/config-snapshot.json` — rare-changing, ~5–10KB. See "Cost computation" decision note below. Cite: `CostCalculator.scala:35–52`. |
| `cost` — Overquota (~~currently API-only~~ — **TS as of 10 May 2026**) | `UsageQuota.isOverQuota` — checks runtime usage store (S3 bucket, scheduled refresh) against per-supplier quotas | Results grid (overquota badge) | **Boot-time fetch** of `/api/usage/quotas` via `quota-store.ts`; synchronous read thereafter | Implemented 10 May 2026. No vendored placeholder. Empty map (dev / 401 / network failure) → no images marked overquota (graceful absence). Cite: `UsageQuota.scala:38–44`; `kupua/src/lib/cost/quota-store.ts`. |
| `leases` (active leases, access type) | Embedded in ES `leases` field — also via `GET /leases/media/{id}` | Image detail (lease indicator), results grid (teal colour = allow lease), multi-select | Per-id; `?ids=` for multi-select | Leases drive validity overrides: allow-lease overrides "paid_image" invalidity; deny-lease adds "current_deny_lease" to `invalidReasons`. The teal UsageRights UI colouring comes from `hasCurrentAllowLease`. Lease data IS in ES (`leases.leases[]` with `access`, `active` fields). Cite: `ImageExtras.scala:40–42` |
| `valid` + `invalidReasons` | Computed by `ImageResponse` from metadata completeness + rights + leases + quotas | Results grid (invalid overlay), image detail (warning) | Same as cost — comes with every API response | Blockers: missing credit, no rights, deny lease, paid without lease, over quota, TASS warning. Most checks use ES-available data; `over_quota` is the one that requires API. |
| `persisted` + reasons | Computed by `ImageResponse` from 12 persistence rules | Image detail (persistence badge), multi-select panel | Per-id (detail); `?ids=` for multi-select reconciliation | 12 rules match `SearchFilters.persistedFilter` |
| `actions` (delete, reindex, add-lease, etc.) | Permission-gated by `ImageResponse.imageActions` | Image detail (button visibility), multi-select (batch ops) | Per-id | Hide-not-disable pattern |
| `links` (crops, edits, usages, leases, download, optimised) | HATEOAS links from `ImageResponse.imageLinks` | Image detail (navigation), download button | Per-id | Permission-gated (crops need valid, edits need write) |
| Signed S3 URLs (source, thumb, optimisedPng) | S3 presign in `ImageResponse.create` | Image detail (full-res), fullscreen, download | Per-id | Currently handled by kupua's own s3-proxy + imgproxy |
| `usages` summary (platform, status, refs) | Embedded in image document (ES `usages` field) — also available via `GET /usages/media/{id}` | Image detail (usage list) | Per-id (full list from usage service) | Partial summary in ES; full via satellite |
| `syndicationStatus` + `syndicationRights` | `syndicationStatus` in ES; rights from RCS (external) | Image detail (syndication badge) | Per-id | Optional; RCS is external service |
| `exports` (crops list) | Embedded in ES `exports` field; details via cropper | Image detail (crops panel) | Per-id | Crop thumbnails need signed URLs |
| `collections` membership | ES `collections[]` field (path + pathId) | Image detail (collection chips), multi-select | Already in ES — no API needed for read | Write requires collections service |

### Grouping note

`cost`, `valid`, `invalidReasons`, `persisted`, `actions`, `links`, and signed
URLs all come from the SAME `imageResponse.create()` call — they always travel
together. A single `GET /images/{id}` (or a search hit) delivers all of them.
No separate fetches needed per datum.

### Cost computation — design decision (7 May 2026 — partly SUPERSEDED 10 May)

> **SUPERSEDED:** The "ES baseline + API overwrite, both permanent" framing
> assumed a background loop would overwrite TS-computed cost with server-
> authoritative values. After 10 May, **TS is the only path for cost,
> overquota, and isPotentiallyGraphic.** The API does not overwrite them.
> The vendored-config + drift-risk reasoning below remains accurate. Strike
> the "production-ready kupua will have API enrichment as the authoritative
> path" line and the "Pattern generalises (TS floor → API ceiling)" framing.

**Frame:** TS cost computation is the permanent and only path. ES baseline
→ TS compute → render. No API overwrite layer. Standalone (Setup C,
Playwright, no Grid) and connected (TEST/CODE/PROD) use the same code path.
This matches the graceful-absence directive: kupua works without Grid; with
Grid, only the quota snapshot is richer.

**Vendored config:** `freeSuppliers`, `suppliersCollectionExcl`, and
`payGettySourceList` are committed as a JSON snapshot under `kupua/src/lib/cost/`.
~5–10KB total. Refresh manually when Grid changes them; logged in
`deviations.md`. The fast-moving variable (per-supplier quota state) is
fetched once at boot via `quota-store.ts` and used as a synchronous lookup.

**Drift risk acknowledged.** `CostCalculator.scala` could change semantics and
our TS version would silently disagree with Grid. Mitigation: a comment in
the TS file pointing at the Scala source, a `deviations.md` entry, and the
research doc `01 Research/grid-cost-validity-pay-collection-overquota.md`
as a reference for verifying specific scenarios when needed.

**Lease awareness not needed for cost.** `CostCalculator.getCost` runs before
lease overrides apply. Leases affect `valid` / `invalidReasons` (per
contract-audit §6.7.1), not `cost`. Keeps the TS function genuinely small.

**Pattern:** TS-replicate from ES baseline whenever feasible.
`isPotentiallyGraphic` follows the same TS-only pattern (`graphic-image-blur.ts`).
Genuine API-only deltas (signed download URLs, write-fanout) fire on user
intent, never as a background loop. See §E.1 / §E.2 for the full split.

---

## Section D — Collections Data Model

**Date:** 7 May 2026. Read-only source research; no TEST requests made (none
needed — Q1 short-circuits the question).

---

### Q1 — Storage model: on-image, ES-queryable

**Collections membership is stored directly on the image document** as a
`List[Collection]` field.

**Evidence:**

1. `common-lib/src/main/scala/com/gu/mediaservice/model/Image.scala:29`:
   ```scala
   collections: List[Collection] = Nil,
   ```
   The `collections` field is part of the `Image` case class — embedded,
   not a foreign key or join.

2. `common-lib/src/main/scala/com/gu/mediaservice/model/Collection.scala:11`:
   ```scala
   case class Collection(path: List[String], actionData: ActionData, description: String) {
     val pathId = CollectionsManager.pathToPathId(path)
   }
   ```
   Each `Collection` entry has: `path` (e.g. `["fashion", "spring"]`),
   `description` (the leaf node name), `actionData` (see Q3), and computed
   `pathId` (lowercased slash-joined path: `"fashion/spring"`).

3. `common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/Mappings.scala:241–249`:
   ```scala
   def collectionMapping(name: String) = {
     nonDynamicObjectField(name).copy(properties = Seq(
       nonAnalysedList("path"),
       keywordField("pathId").copy(copyTo = Seq("collections.pathHierarchy")),
       hierarchyAnalysed("pathHierarchy"),
       keywordField("description"),
       actionDataMapping("actionData")
     ))
   }
   ```
   The `pathId` field copies its value to `collections.pathHierarchy`, a
   hierarchy-analysed field that enables prefix matching (searching for
   `"fashion"` matches images in `"fashion/spring"` and `"fashion/winter"`).

4. The mapping is applied at `Mappings.scala:76`:
   ```scala
   collectionMapping("collections"),
   ```
   So the `collections` field is indexed and queryable.

**The `pathHierarchy` field is queryable via CQL.** Media-api's query parser
recognises `~"fashion/spring"` (or `collection:fashion/spring`) as a
`CollectionRule`:

```
QuerySyntax.scala:89–93:
  def CollectionRule = rule { ("~" | "collection:") ~ ExactMatchValue ~> (
    collection => Match(HierarchyField, Phrase(collection.string.toLowerCase))
  )}
```

This resolves to `termQuery("collections.pathHierarchy", value)` at the ES
layer:

```
QueryBuilder.scala:64–66:
  case HierarchyField => condition.value match {
    case Phrase(value) => termQuery(resolveFieldPath("pathHierarchy"), value)
    case _ => throw InvalidQuery("Cannot accept non-Phrase value for HierarchyField Match")
  }
```

**Conclusion: on-image, ES-queryable.** A kupua ES query with filter
`collections.pathHierarchy = "fashion/spring"` returns exactly the images
in that collection, with no separate collections-service round-trip needed.

This short-circuits Q2 per the push-back clause.

---

### Q2 — Short-circuited

Q1 is "on-image, ES-queryable". The collections service (`collections/`) exists
for managing the tree structure (creating/renaming/deleting collection nodes,
adding/removing image memberships). It is write-path infrastructure. Kupua is
read-only against Grid, so it has no need to contact the collections service
at all.

---

### Q3 — "Date Added to Collection" sort

**Where the timestamp lives:**

`ActionData` is embedded per collection membership on the image doc:

```
Collection.scala:40–43:
  case class ActionData(author: String, date: DateTime)
```

The `actionDataMapping` in `Mappings.scala:225–232` maps `author` (keyword)
and `date` (date field). The full path is `collections.actionData.date`.

This timestamp is denormalised: each entry in an image's `collections[]` array
carries its own `actionData.date` — the date that image was added to that
specific collection. An image in three collections has three independent
timestamps.

**Caveat:** `collections` uses `nonDynamicObjectField` (not `nested`). ES
flattens multi-valued objects, so the correlation between `pathId` and
`actionData.date` within a single collection entry is lost at query time.
When an image is in multiple collections, the sort value ES uses is the
max/min across all `actionData.date` values — not the one for the currently
filtered collection. This is a known approximation: media-api behaves the
same way (see below).

**How Kahuna sorts by it — server-side, one-hop:**

Media-api supports `orderBy=dateAddedToCollection` as a named sort value:

```
sorts.scala:20:
  def dateAddedToCollectionDescending: Seq[Sort] =
    Seq(fieldSort("collections.actionData.date").order(SortOrder.DESC))
```

This is wired into the search path at:

```
ElasticSearch.scala:263:
  case Some("dateAddedToCollection") => sorts.dateAddedToCollectionDescending
```

Additionally, when this sort is active and the query contains a
`HierarchyField` match, an implicit ES filter is added:

```
ElasticSearch.scala:219–229:
  val dateAddedToCollectionFilter = {
    params.orderBy match {
      case Some("dateAddedToCollection") => {
        val pathHierarchyOpt = params.structuredQuery.flatMap {
          case Match(HierarchyField, Phrase(value)) => Some(value)
          case _ => None
        }.headOption
        pathHierarchyOpt.map { pathHierarchy =>
          termQuery("collections.pathHierarchy", pathHierarchy)
        }
      }
      case _ => None
    }
  }
```

Comment in source: `"// Port of special case code in elastic1 sorts. Using the
dateAddedToCollection sort implies an additional filter for reasons unknown"`.
This filter is functionally equivalent to what the `~"path"` CQL clause would
add anyway — it's a belt-and-suspenders guard, not a new constraint.

Kahuna automatically applies `dateAddedToCollection` sort whenever a collection
filter is in the query:

```
gr-sort-control-config.ts:47:
  export const COLLECTION_SORT_VALUE = SortOptions[4].value;
  // SortOptions[4].value = "dateAddedToCollection"

search/index.js:338:
  if (!checkForCollection(toQuery) && toParams.orderBy === COLLECTION_SORT_VALUE) {
    delete toParams.orderBy;  // strip the sort if no collection filter present
  }
```

And `query.js:228` auto-sets it on collection navigation. The sort is entirely
server-side — no client-side reorder pass needed.

**Render flow is one-hop:**

```
GET /images?q=~"fashion/spring"&orderBy=dateAddedToCollection&length=N&offset=M
```

media-api parses `~"fashion/spring"` → `termQuery("collections.pathHierarchy",
"fashion/spring")`, applies the `dateAddedToCollectionDescending` sort, and
returns fully enriched hits in the correct order. No `?ids=` involved.

For Kupua's **direct-ES path**, the same result is achievable by:
- Filter: `termQuery("collections.pathHierarchy", "fashion/spring")`
- Sort: `fieldSort("collections.actionData.date").order(SortOrder.DESC)`

Neither requires `?ids=`.

---

### Answers

| Question | Answer |
|---|---|
| **Storage model** | On-image, ES-queryable. `collections: List[Collection]` is embedded in every image document and fully indexed. Cite: `Image.scala:29`, `Mappings.scala:241–249`. |
| **Render flow** | One-hop. `GET /images?q=~"path"&orderBy=dateAddedToCollection` returns enriched hits in the right order directly. No `?ids=` needed. Cite: `QuerySyntax.scala:89`, `sorts.scala:20`, `ElasticSearch.scala:263`. |
| **Date-Added sort** | Server-side via media-api `orderBy=dateAddedToCollection`, which sorts by `collections.actionData.date` DESC in ES. No client-side reorder needed. Approximation: for images in multiple collections, ES sorts by the winning `actionData.date` across all memberships (non-nested object flattening), not strictly by the current collection's timestamp. Same approximation used by Kahuna. Cite: `sorts.scala:20`, `ElasticSearch.scala:219–229`. |
| **Does Kupua need `?ids=` for Collections?** | **No.** Mirror-search handles collection views without `?ids=`. Direct-ES handles it the same way. The collections service is write-path only; Kupua never needs to call it for read operations. |

---

## Section 4 — Recommendation (SUPERSEDED 10 May 2026)

> **The per-surface table below is the deleted background-enrichment plan.**
> Mirror-search + `?ids=` per buffer-fill is gone. Current strategy: ES-only
> baseline (with widened SOURCE_INCLUDES) + TS compute + intent-driven API for
> the few genuine gaps. Selection reconciliation no longer uses `?ids=` either —
> selection metadata comes from the same ES search hits as everything else.
> Kept here for historical reference; see **§F** for the current state and
> **§E.1 / §E.2** for the per-capability split.

### Per-surface mechanism (HISTORICAL — see §F)

| Kupua surface | Mechanism | Rationale |
|---|---|---|
| **Results grid** | Mirror search (`GET /images?q=…&length=N&orderBy=…`) per buffer-fill | Hits carry cost/valid/persisted/actions/links identical to single-image. Cap 200 per page matches kupua's buffer window. |
| **Results table** | Same mirror search | Same data, different density. |
| **Image detail (focused)** | Per-id (`GET /images/{id}`) | Already-cached enrichment from buffer covers most fields; per-id only needed for `?include=fileMetadata` or when arriving via deep link with no buffer context. |
| **Image detail prev/next** | Already enriched by buffer | Prev/next is a cursor span over the existing buffer — already covered by mirror-search. **No extra fetch.** |
| **Collections view** | Mirror search with collection filter (`q=~"path"&orderBy=dateAddedToCollection`) | Collection membership is on-image, ES-queryable. Server-side sort by `collections.actionData.date`. No `?ids=` needed. See §D. |
| **Non-contiguous selection reconciliation** | `GET /images?ids=a,b,c` (chunked at ~150) | **Only genuine `?ids=` consumer.** Persistent selection holds IDs not currently in any visible cursor span; mirror-search can't address an arbitrary id-set. Re-sort client-side (TEST/ES8 doesn't preserve request order). |

**Why so few `?ids=` rows:** Every other surface is a *cursor span* (a contiguous
range addressable by `q=…&orderBy=…&length=N`), not an arbitrary id-set. Only
persistent multi-selection genuinely requires id-set fetching, because the
selected IDs may be scattered across pages, sorts, or even queries that no
longer match the current view.

### Hard blockers requiring Scala changes?

**None for the enrichment side-channel pattern.** Kupua keeps direct-ES for
scroll/pagination and uses media-api purely for computed fields. No new
endpoints required — the existing `GET /images` and `GET /images/{id}` cover
all enrichment needs.

A future `search_after` endpoint on media-api would be needed only if kupua
were to wholesale-mirror — which it shouldn't (see below).

### Strategic answer (SUPERSEDED 10 May 2026)

> **Final position: stay direct-ES, drop the side-channel entirely, TS-replicate
> the gaps.** The historical text below described `useEnrichment` (~80 lines
> background loop) as "the path". After widening SOURCE_INCLUDES and reading
> Inventory C, the side-channel turned out to be doing almost no useful work.
> `useEnrichment` was deleted on 10 May; cost / overquota / isPotentiallyGraphic
> are TS-computed; API fires on user intent only. See §F.

**Stay direct-ES** ~~+ enrich via media-api~~. Wholesale-mirror is not viable:
9 hard gaps make it impossible without adding `search_after`, PIT, composite
aggs, percentile aggs, `_source` shaping, and reverse-sort to media-api —
effectively reimplementing kupua's entire pagination architecture in Scala.
That's a multi-month project with no user benefit (kupua already has these
capabilities). ~~The enrichment side-channel costs one additional HTTP request
per buffer-fill (mirror the same query to media-api, merge `cost`/`valid`/
`persisted` into the ES-sourced hits client-side). Net new code: ~80 lines
in a `useEnrichment` hook. This is the path.~~

---

## §E Inventory takeaways (10 May 2026)

Condensed from three inventory docs (A: from kupua docs, B: from kahuna source, C: from
Grid backend Scala) totalling 568 lines. Raw inventories deleted after this section landed.
Citations below reference surviving sources only.

---

### §E.1 — Confirmed TS-feasible (close the gap, drop the API call)

Capabilities that can be served from ES + TS compute without any API call.

- **`isPotentiallyGraphic` blur overlay** — TS path: `fileMetadata.xmp['pur:adultContentWarning'] != null` (XMP flag) + keyword scan for graphic-content phrases. API equivalent: Painless script field on search hits (not stored). Both paths already implemented. [Inv-C `ElasticSearch.scala:291-305`]
- **Persistence reasons (`persisted.value` + `persisted.reasons`)** — TS path: evaluate all 12 `PersistenceReason` rules against ES fields: `HasPersistenceIdentifier`, `HasExports`, `HasUsages`, `IsArchived`, `IsPhotographerCategory`, `IsIllustratorCategory`, `IsAgencyCommissionedCategory`, `HasLeases`, `IsInPersistedCollection`, `AddedToPhotoshoot`, `HasLabels`, `HasUserEdits`. All 12 are ES-derivable. API equivalent: `persisted` on enrichment payload. [Inv-C `ImagePersistenceReasons.scala:10-22`]
- **Lease display (active-lease teal colouring, validity overrides)** — TS path: `leases.leases[]` ES array with `access`/`active` fields; compute `hasCurrentAllowLease`, `hasCurrentDenyLease`. API equivalent: `leases` on enrichment payload. [enrichment-strategy §C]
- **`valid` + `invalidReasons` (ES-derivable subset)** — TS path: `validity-map.ts` already ports the non-quota checks (missing credit, missing description, no rights, deny lease, TASS warning). The `over_quota` check is handled separately by `quota-store.ts`. API equivalent: `valid` + `invalidReasons` on enrichment payload. [enrichment-strategy §C; `ImageExtras.scala:38-41`]
- **`actions[]` permission gating** — TS path: combine ES state (soft-deleted, archiver, exports, leases) with boot-time `GET /session` permissions cache. No per-image API fetch. API equivalent: `actions` HATEOAS array. [contract-audit §3.3]
- **Print/digital usage icons on cells** — TS path: `usages[]` array on ES search hit contains `platform` field; count `digital` and `print` entries. Zero extra fetch. API equivalent: kahuna's `tickerCounts`. [Inv-A `cost-signals §2 rows 13-14`]
- **Archiver status icon (`persisted.value`, `persisted.reasons`)** — TS path: same 12-rule evaluation as persistence reasons above; `IsArchived` reason drives the kept/archived/unarchived icon. [Inv-A `cost-signals §2 row 12`]
- **`TASS agency image` validity warning** — TS path: `metadata.source == "TASS"` or `originalMetadata.byline contains "ITAR-TASS"`. Overrideable. [Inv-C `ImageExtras.scala:38-41`]
- **`originalMetadata` vs `metadata` distinction** — TS path: both objects present in ES `_source`. `metadata` is always the Thrall-merged result (originalMetadata + userMetadata). Surfacing `originalMetadata` separately is TS-free once SOURCE_INCLUDES covers it. [Inv-C `Mappings.scala:154-174`]
- **Staff-photographer thumbnail border** — TS path: `usageRights.category` in `["staff-photographer", "contract-photographer"]` — same fields already driving cost badge. [Inv-B `image-logic.js:37-49`]

---

### §E.2 — Genuine API-only gaps (keep adapter ready, fire on intent)

- **Signed S3 download URL (original)** — Trigger: user clicks download. Endpoint: `download` HATEOAS link from `GET /images/:id`. Why API-only: S3 pre-signing requires AWS credentials server-side; secret-required. [Inv-B `downloads.js:44-73`]
- **Signed S3 download URL (low-res / optimised)** — Trigger: user clicks download variant. Endpoint: `downloadOptimised` HATEOAS link (imgops). Why API-only: same secret-required constraint. [Inv-B `imgops/service.js:33-60`]
- **`isDownloadable` gating** — Trigger: before showing download button. Endpoint: `download`/`downloadOptimised` link presence on `GET /images/:id`. Why API-only: `downloadableMap` evaluation includes quota state and `config.restrictDownload`; cannot be replicated client-side. [Inv-C `ImageExtras.scala:56-65`]
- **Image soft-delete / hard-delete / undelete** — Trigger: user confirms delete action (editing phase). Endpoint: `DELETE /images/:id` (soft), hard-delete route, undelete route. Why API-only: auth-gated (`DeleteImage` permission) + write-fanout to Kinesis. [contract-audit §5.11]
- **`syndicationStatus` (display in detail panel)** — Trigger: image detail open. Endpoint: `GET /images/:id` response field. Why API-only: computed from `syndicationRights` (RCS external service) at API response time; not stored in ES. [Inv-C `MediaApi.scala:63`; `es-adapter.ts:256`]
- **Quota status per supplier (`GET /usage/quotas`)** — Trigger: app boot (already implemented via `quota-store.ts`). Why API-only: quota store is S3-backed, server-refreshed. [Inv-C `UsageController.scala:57-71`]
- **Per-image soft-delete state (`softDeletedMetadata`)** — Trigger: image detail / delete action. Endpoint: `GET /images/:id/softDeletedMetadata`. Why API-only: authoritative state in DynamoDB, not always ES-consistent. [Inv-C `MediaApi.scala:269-281`]
- **Cropper write (export original, create crop)** — Trigger: user clicks export / crop tool (editing phase). Endpoint: `POST` to cropper service. Why API-only: write-fanout. [Inv-B `gr-export-original-image.js:23`]
- **Metadata-editor writes (labels, photoshoot, syndication, archive)** — Trigger: user edits field (editing phase). Endpoint: `metadata-editor/conf/routes`. Why API-only: auth-gated + write-fanout to Thrall/ES. [contract-audit §5.2]

---

### §E.3 — Out of scope for the Guardian deployment

Capabilities confirmed dead in Guardian PROD/TEST per `clientConfig`. A future agent should not evaluate these.

- Photo-sales syndicate flow — gated off by `showSendToPhotoSales`. [Inv-B `results.js:~820-855`]
- BBC warning-flags overlay — gated off by `enableWarningFlags`. [field-catalogue `domain_metadata` row]
- `usePermissionsFilter` / `interimFilterOptions` — BBC-only config; always false in Guardian. [comms-audit §1]
- `usageInstructions` config-injected override — gated by `customSpecialInstructions` config; not populated in Guardian. [Inv-C `ImageResponse.scala:258-271`]
- `recordDownloadAsUsage` download tracking — config false in Guardian; no download usage events fired. [Inv-C `usage/conf/routes:9`]
- Witness report integration — `witness.theguardian.com` pattern-match; not a Guardian PROD concern. [Inv-B `witness.js:14-52`]
- Telemetry / session logging — external telemetry service; not deployed for kupua. [comms-audit §2.11]
- Pinboard — not in Grid's scope for kupua. [out of scope, period]
- `agencyPicksColour` badge colour config — `agencyPicksIngredients` config not set in Guardian. `is:agency-pick` predicate is in §E.5 backlog, but the badge colour is config-only. [Inv-C out-of-scope item 9]
- `shouldDisplayOrgOwnedCountAndFilterCheckbox` / `maybeAgencyPickQuery` ticker counts — config-dependent; not configured in Guardian. [Inv-C out-of-scope item 8]

---

### §E.4 — Inventory contradictions resolved

- **`isPotentiallyGraphic` Lives-in** — A classified as `Both`; C contradicts: it is a Painless runtime `ScriptField` at search time, never written to ES by Thrall. Authoritative: C. Live-in is effectively `API-only` (script field on media-api search response). [`ElasticSearch.scala:291-305`]
- **Persistence reasons complexity** — A claimed "12 rules include S3 bucket checks, cross-index lookups". C reads actual Scala: all 12 `PersistenceReason` objects use only ES fields. No S3, no cross-index. Authoritative: C. [`ImagePersistenceReasons.scala:10-22`]
- **`metadata-search` / `label-search` service location** — A classified as `Other-service (satellite)`. C confirms both routes are on `media-api/conf/routes:4-5` — they are `API-only`, not satellite. Authoritative: C.
- **`payType` filter availability** — B implied disabled in backend (kahuna client-side comment). C: backend fully implements `Free`/`MaybeFree`/`Pay` in `SearchFilters.scala:26-43`. Authoritative: C. `MaybeFree` is particularly useful (matches free AND no-rights-category images).
- **`takenSince/Until`, `modifiedSince/Until`, `hasCrops`, `hasRightsAcquired`, `persisted` filter, `countAll`, typeahead, date field selector** — A/B original drafts marked several of these `Don't-have`. B §0 correction note explains the systematic error: the evaluating agent asked "does kupua call media-api with this param?" rather than "does kupua's DAL/schema handle it?". All are `Have-full` in kupua's direct-ES path. Authoritative: B §0 correction.
- **`metadata` is a Thrall merge result, not raw IPTC** — A treats `metadata.*` fields as directly IPTC-sourced. C: `metadata` is the Painless `refreshMetadataScript` merge of `originalMetadata + userMetadata.metadata`, applied on every ingest and every user edit. Kupua reads the correct merged field; `originalMetadata` is the separate pre-edit copy. [`thrall/ElasticSearch.scala:758-766`]
- **`syndicationStatus` search filter non-functional in direct-ES** — C reveals `syndicationStatus` is not stored in ES; it is computed from `syndicationRights` at API response time. Kupua's `es-adapter.ts:256` maps it to an ES field that doesn't exist, so the filter always returns no results in direct-ES mode. Authoritative: C. [`MediaApi.scala:63`; `es-adapter.ts:256`]

---

### §E.5 — Backlog items extracted

- **Print/digital usage icons on cells** — value: parity with kahuna cell info density; free from `usages[]` on search hit. Effort: trivial.
- **Staff-photographer thumbnail border** — value: visual role indicator from `usageRights.category`; zero extra data. Effort: trivial.
- **Archiver status icon** — value: persist/reap workflow signal per cell. Effort: trivial (same data as persistence reasons).
- **`is:agency-pick` CQL predicate** — value: editorial curation filter. Effort: moderate (config-driven ES query; needs `agencyPicksIngredients` config wired to CQL translator). [`IsQueryFilter.scala:67-68`; `image-logic.js:37-49`]
- **`is:reapable` CQL predicate** — value: admin bulk-deletion workflow filter. Effort: moderate (gated by `useReaper` config; replicates `IsQueryFilter` logic). [`IsQueryFilter.scala:64-66`]
- **`usagePlatform` / `usageStatus` search filter UI** — value: filter to published/digital/print/syndication usages. Effort: trivial (DAL already handles `usagesPlatform`/`usagesStatus` denormalised rollup fields; needs UI chips). [`Mappings.scala:341-343`]
- **`usages@platform` CQL value resolver** — value: typeahead for `usages@platform:digital` etc; `by` photographer value resolver also missing. Effort: moderate (B §0 notes these resolvers absent; needs ES agg resolver). [Inv-B §0 correction]
- **Credit / photoshoot completion suggesters** — value: typeahead suggestions from ES completion fields (faster and more accurate than terms agg). Effort: moderate (redo using `/suggest/metadata/credit` and `/suggest/metadata/photoshoot` endpoints; current typeahead uses terms agg). [`SuggestionController.scala:18-20`]
- **AI / vector search + more-like-this** — value: high; semantic image discovery. Effort: hard (C confirms `cohereEmbedV4` 256-dim + `cohereEmbedEnglishV3` 1024-dim in ES; kNN endpoint exists API-side; feature-switch `enable-ai-search` + `useAISearch` URL param pattern from kahuna). [`Mappings.scala:96-131`; `gr-more-like-this.js:15-19`]
- **`fromIndex` field on image responses** — value: migration correctness (when dual-index is active, kupua needs to know which index alias served the hit to avoid stale-index artefacts). Effort: trivial (field is on every API response; wire through to ES-source metadata). [`ImageResponse.scala:153`]
- **`GET /images/:id/_elasticsearch` + projection/diff** — value: debugging and migration auditing; nice-to-have routed under `/api` prefix same as kahuna pattern. Effort: trivial adapter wiring. [`MediaApi.scala:168-213`]
- **Image seen/seenSince tracking** — value: editorial workflow (mark batch as reviewed). Effort: trivial (localStorage key per query; no server involvement). [Inv-B `results.js:~700-730`]
- **"New images" polling banner** — value: live editorial workflows (know when fresh wire images arrive). Effort: moderate (15s poll for images since `lastSearchFirstResultTime`; disable for AI search). [Inv-B `results.js:~540-600`]
- **Upload paths** — value: kupua is read-only today; full DAM requires ingest. Effort: hard (direct-to-S3 + loader integration; SHA-1 client-side; `uploadStatuses` polling). [Inv-B `manager.js:49-66`]
- **Write paths: cropper, metadata-editor, collections tree, batch export** — value: full editing phase. Effort: hard (auth-gated, write-fanout; separate sessions per surface). [contract-audit §5; `metadata-editor/conf/routes`; `cropper/conf/routes`]

---

## §F Background enrichment dropped (10 May 2026)

After Inventory C confirmed the full shape of `?ids=` responses and the SOURCE_INCLUDES
whitelist was audited, the conclusion was: background enrichment is doing almost no useful
work. The fields it was fetching (`cost`, `valid`, `invalidReasons`, `usageRights`, `leases`,
`usages`, `actions`, `syndicationStatus`) are all stored in `_source` and can be returned
directly by ES search hits. Widening SOURCE_INCLUDES is ~10 lines; maintaining the polling
loop was ~200 lines of connection-starvation machinery.

The three genuinely API-only deltas:
- `cost: "overquota"` — TS-replicable via `/usage/quotas` on app boot (Session B).
- `isPotentiallyGraphic` — script field, not in `_source`. TS-replicable from XMP flag
  + keyword scan (Session B).
- Signed download URLs — fired on user click (no polling needed).

**Outcome:** `useEnrichment` deleted. SOURCE_INCLUDES widened. `deriveImage` unchanged —
overlay still applies for intent-driven single-image fetches. `hasEnrichment` is now almost
always false (accurate; ES baseline is authoritative). Background loop, AbortController
subscribe listener, phase-2 sequential chunking, setTimeout yield — all gone.

See §E for the final inventory that informed this decision. See `changelog.md` (10 May 2026,
Session A) for the full changeset.

---

## Appendix — TEST Verification (completed 7 May 2026)

All checks performed against `https://api.media.test.dev-gutools.co.uk`.

### Check 1 — Search hit vs single-image shape parity

**Result: CONFIRMED.** Data keys are identical between a search hit and
`GET /images/{id}` for the same image. Both carry: `cost`, `valid`,
`invalidReasons`, `persisted`, `syndicationStatus`, `aliases`, `collections`,
`exports`, `leases`, `usages`, `userMetadata`, + all metadata/source fields.

**One minor difference:** Search hits include `isPotentiallyGraphic` (a
painless script field computed at search time). Single-image does not.
Trivial — kupua can handle its absence gracefully.

Links: 11 in both. Actions: 8 in both.

### Check 2 — `?ids=` ordering

**Result: REQUEST ORDER NOT PRESERVED.** Sent `[68f0…, 550c…, b0d6…]`,
received `[b0d6…, 550c…, 68f0…]` (default uploadTime desc order).

Despite the source using `pinned_query` (which documents order preservation),
the response on TEST/ES8 does not honour request order. Kupua must re-sort
client-side after a `?ids=` call. This is trivial (create an id→index map,
sort the response array), but worth knowing.

### Check 3 — Missing/nonexistent IDs

**Result: GRACEFUL.** Request `?ids=nonexistent-fake-id,{real-id}` returned
only the real image. `total: 1`, `data.length: 1`. No error, no 404 — the
nonexistent ID is silently absent.

### Check 4 — Standard Kahuna search shape

**Result: CONFIRMED.** `GET /images?q=&length=1&orderBy=-uploadTime&free=true&countAll=true`
returns collection response with `offset`, `length`, `total` (1,175,881),
`data[]` (embedded entities with `uri`, `data`, `links`, `actions`), `links`
(prev/next), `actions`. Total count matches production expectations for TEST.

### Correction to source analysis

The `?ids=` ordering row in Section A's table was based on `pinned_query`
documentation. Empirically, request-order is **not** preserved on TEST.
Updated the table accordingly (see above — "Workaround: client-side reorder").

---

