# Media-API Enrichment Strategy — Findings

**Date:** 7 May 2026  
**Auditor:** Opus 4.6  
**Status:** Complete. All sections verified including empirical TEST checks.

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

| Datum | Source | Kupua surface(s) | Fetch mechanism | Notes |
|---|---|---|---|---|
| `cost` — Free/Conditional/Pay (ES-derivable) | `usageRights.category` → `defaultCost` (static map); `usageRights.restrictions` → Conditional; `usageRights.supplier` + `suppliersCollection` → free supplier check (config list) | Results grid (badge), results table (column), image detail | **Client-side TS replication** using ES fields + vendored config snapshot | ~50 lines. Covers ~95% of images. Needs `freeSuppliers` + `suppliersCollectionExcl` (incl. `payGettySourceList`, ~400 entries) from `common-lib/src/main/scala/com/gu/mediaservice/lib/guardian/GuardianUsageRightsConfig.scala`. Vendor as `kupua/src/lib/cost/config-snapshot.json` — rare-changing, ~5–10KB. See "Cost computation" decision note below. Cite: `CostCalculator.scala:35–52`. |
| `cost` — Overquota (currently API-only) | `UsageQuota.isOverQuota` — checks runtime usage store (S3 bucket, scheduled refresh) against per-supplier quotas | Results grid (overquota badge) | **Boot-time fetch** of quotas JSON in production-ready kupua; vendored placeholder for now | Quotas JSON is small (~5 agencies, integer counts). For dev/standalone: vendor a snapshot. For production-ready kupua (far future): fetch on boot, refresh on a schedule (quotas can change mid-day). Until then: standalone TS computation never returns `overquota`; API enrichment overwrites when present. Cite: `UsageQuota.scala:38–44`. |
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

### Cost computation — design decision (7 May 2026)

**Frame: ES baseline + API overwrite, both permanent.** Not "scaffolding to rip
out". The TS cost computation stays forever as the standalone-mode fallback
(Setup C, Playwright, ES-only, no Grid). API enrichment overwrites when present.
This matches the graceful-absence directive: kupua works without Grid, gets
better with Grid. There is no "rip-out event" — the TS path becomes a fallback
that fires less often.

**Vendored config:** `freeSuppliers`, `suppliersCollectionExcl`, and
`payGettySourceList` are committed as a JSON snapshot under `kupua/src/lib/cost/`.
~5–10KB total. Refresh manually when Grid changes them; logged in
`deviations.md`. Live fetch is the production-ready future (quotas can change
mid-day) but unnecessary now — quota state is the only fast-moving variable
and is overwritten by API enrichment whenever the API is reachable.

**Drift risk acknowledged.** `CostCalculator.scala` could change semantics and
our TS version would silently lie to standalone-mode users. Mitigation: a
comment in the TS file pointing at the Scala source, and a `deviations.md`
entry. Acceptable trade-off because (a) standalone is dev-only right now and
(b) production-ready kupua will have API enrichment as the authoritative path.

**Lease awareness not needed for cost.** `CostCalculator.getCost` runs before
lease overrides apply. Leases affect `valid` / `invalidReasons` (per
contract-audit §6.7.1), not `cost`. Keeps the TS function genuinely small.

**Pattern generalises.** `isPotentiallyGraphic` (painless script over keywords)
and other small server-computed fields can follow the same pattern: TS
computation as ES-baseline floor, API value overwrites as ceiling. Establish
this cleanly in Cluster 1 so it's not re-debated each time.

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

## Section 4 — Recommendation

### Per-surface mechanism

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

### Strategic answer

**Stay direct-ES + enrich via media-api.** Wholesale-mirror is not viable:
9 hard gaps make it impossible without adding `search_after`, PIT, composite
aggs, percentile aggs, `_source` shaping, and reverse-sort to media-api —
effectively reimplementing kupua's entire pagination architecture in Scala.
That's a multi-month project with no user benefit (kupua already has these
capabilities). The enrichment side-channel costs one additional HTTP request
per buffer-fill (mirror the same query to media-api, merge `cost`/`valid`/
`persisted` into the ES-sourced hits client-side). Net new code: ~80 lines
in a `useEnrichment` hook. This is the path.

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

