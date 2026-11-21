# Phase 1 — Media-API Capability Inventory: Findings

**Scope:** `media-api/` only. Read-only. No code changes. No test runs.
**Audit date:** 2026-05-31
**Files read in full:** `conf/routes`, `app/controllers/MediaApi.scala`,
`app/lib/elasticsearch/ElasticSearch.scala`, `app/lib/elasticsearch/ElasticSearchModel.scala`,
`app/lib/elasticsearch/SearchFilters.scala`, `app/lib/elasticsearch/QueryBuilder.scala`,
`app/lib/elasticsearch/IsQueryFilter.scala`, `app/lib/elasticsearch/SyndicationFilter.scala`,
`app/lib/elasticsearch/MatchFields.scala`, `app/lib/elasticsearch/sorts.scala`,
`app/lib/querysyntax/Parser.scala`, `app/lib/querysyntax/QuerySyntax.scala`,
`app/lib/querysyntax/model.scala`, `app/lib/MediaApiConfig.scala`,
`app/lib/ImageResponse.scala`, `app/controllers/AggregationController.scala`,
`app/controllers/SuggestionController.scala`, `app/controllers/UsageController.scala`,
`app/controllers/ConfigurationController.scala`, `app/controllers/AggregateResponses.scala`,
`common-lib/.../aws/Bedrock.scala`, `common-lib/.../aws/Embedder.scala`,
`common-lib/.../model/Image.scala`, `common-lib/.../model/Embedding.scala`

---

## Section 1 — Routes Table

32 routes total (within the expected 20–60 range). Listed in declaration order.

| Method | Path | Controller action | Notes |
|--------|------|-------------------|-------|
| GET | `/` | `MediaApi.index` | Returns hypermedia index with service links |
| GET | `/images/metadata/:field` | `SuggestionController.metadataSearch(field, q)` | Terms agg on metadata field |
| GET | `/images/edits/:field` | `SuggestionController.editsSearch(field, q)` | Terms agg on edits labels (field param currently ignored) |
| GET | `/images/:id/softDeletedMetadata` | `MediaApi.getSoftDeletedMetadata(id)` | DynamoDB lookup, not ES |
| GET | `/images/aggregations/date/:field` | `AggregationController.dateHistogram(field, q)` | Monthly date histogram on requested field |
| GET | `/images/:id` | `MediaApi.getImage(id)` | Single image fetch |
| GET | `/images/:id/_elasticsearch` | `MediaApi.getImageFromElasticSearch(id)` | Returns raw ES source (not transformed) |
| GET | `/images/:id/projection/diff` | `MediaApi.diffProjection(id)` | ES source vs loader projection diff |
| GET | `/images/:id/fileMetadata` | `MediaApi.getImageFileMetadata(id)` | Returns `image.fileMetadata` only |
| GET | `/images/:imageId/uploadedBy` | `MediaApi.uploadedBy(imageId)` | Returns `uploadedBy` string only |
| GET | `/images/:imageId/export/:exportId` | `MediaApi.getImageExport(imageId, exportId)` | Single export by ID |
| GET | `/images/:imageId/export/:exportId/asset/:width/download` | `MediaApi.downloadImageExport(imageId, exportId, width)` | Streams asset from S3 |
| GET | `/images/:imageId/export` | `MediaApi.getImageExports(imageId)` | All exports for image |
| GET | `/images/:imageId/download` | `MediaApi.downloadOriginalImage(imageId)` | Streams original from S3 |
| GET | `/images/:imageId/downloadOptimised` | `MediaApi.downloadOptimisedImage(imageId, width, height, quality)` | Redirects to imgops |
| POST | `/images/:id/:partnerName/:startPending/syndicateImage` | `MediaApi.syndicateImage(id, partnerName, startPending)` | Posts to usages service; returns 200 |
| DELETE | `/images/:id` | `MediaApi.deleteImage(id)` | Soft-delete; posts SoftDeleteImage message |
| DELETE | `/images/:id/hard-delete` | `MediaApi.hardDeleteImage(id)` | Hard-delete; posts DeleteImage message |
| PUT | `/images/:id/undelete` | `MediaApi.unSoftDeleteImage(id)` | Un-soft-delete |
| GET | `/images` | `MediaApi.imageSearch()` | Primary search; supports AI search path |
| GET | `/suggest/metadata/credit` | `SuggestionController.suggestMetadataCredit(q, size)` | ES completion suggestion on `suggestMetadataCredit` field |
| GET | `/suggest/metadata/photoshoot` | `SuggestionController.suggestPhotoshoot(q, size)` | ES completion suggestion on photoshoot suggest field |
| GET | `/usage/suppliers` | `UsageController.bySupplier` | Aggregated usage count per supplier (30-day window) |
| GET | `/usage/suppliers/:id` | `UsageController.forSupplier(id)` | Usage count for one supplier (30-day window) |
| GET | `/usage/quotas` | `UsageController.quotas` | All quota statuses from UsageStore |
| GET | `/usage/quotas/:id` | `UsageController.quotaForImage(id)` | Quota status for one image's usage rights |
| GET | `/configuration/crop-variations` | `ConfigurationController.cropVariations` | Returns supported crop options; **no auth** |
| GET | `/management/healthcheck` | `ElasticSearchHealthCheck.healthCheck` | Admin; ES health |
| GET | `/management/manifest` | `Management.manifest` | Admin; build manifest |
| GET | `/management/imageCounts` | `ElasticSearchHealthCheck.imageCounts` | Admin; ES doc counts |
| GET | `/management/whoAmI` | `InnerServiceStatusCheckController.whoAmI(depth)` | Admin; service identity |
| GET | `/robots.txt` | `Management.disallowRobots` | Robots exclusion |

**Coverage gaps:** None. All routes enumerated. No Tier 2/3 skips that would affect Section 1 completeness.

---

## Section 2 — Endpoint Detail

### GET /images

**Action:** `MediaApi.imageSearch` at `media-api/app/controllers/MediaApi.scala:543`

**Query parameters accepted:**

| Name | Type | Default | Purpose | Parsed at |
|------|------|---------|---------|-----------|
| `q` | String | — | Full query string; fed into CQL parser | `ElasticSearchModel.scala:SearchParams.apply` |
| `ids` | CSV String | — | Comma-separated image IDs; bypasses text query | `ElasticSearchModel.scala:SearchParams.apply` |
| `offset` | Int | 0 | Pagination offset; must be ≥ 0 | `ElasticSearchModel.scala:SearchParams.apply` |
| `length` | Int | 10 | Page size; must be ≤ 200 | `ElasticSearchModel.scala:SearchParams.apply` |
| `orderBy` | String | — | Sort field; `oldest`→`uploadTime`, `newest`→`-uploadTime`, `taken`→`metadata.dateTaken,-uploadTime`, `dateAddedToCollection` is a special case with extra filter | `ElasticSearchModel.scala:SearchParams.apply` |
| `since` | DateTime | — | Upload time lower bound (`uploadTime` range) | `ElasticSearchModel.scala:SearchParams.apply` |
| `until` | DateTime | — | Upload time upper bound | `ElasticSearchModel.scala:SearchParams.apply` |
| `modifiedSince` | DateTime | — | `lastModified` lower bound | `ElasticSearchModel.scala:SearchParams.apply` |
| `modifiedUntil` | DateTime | — | `lastModified` upper bound | `ElasticSearchModel.scala:SearchParams.apply` |
| `takenSince` | DateTime | — | `metadata.dateTaken` lower bound | `ElasticSearchModel.scala:SearchParams.apply` |
| `takenUntil` | DateTime | — | `metadata.dateTaken` upper bound | `ElasticSearchModel.scala:SearchParams.apply` |
| `archived` | Boolean | — | `edits.archived` exists (`true`) or missing (`false`) | `ElasticSearchModel.scala:SearchParams.apply` |
| `hasExports` | Boolean | — | `exports` exists or missing | `ElasticSearchModel.scala:SearchParams.apply` |
| `hasIdentifier` | String | — | Specified identifier field must exist | `ElasticSearchModel.scala:SearchParams.apply` |
| `missingIdentifier` | String | — | Specified identifier field must be absent | `ElasticSearchModel.scala:SearchParams.apply` |
| `valid` | Boolean | — | Passes/fails `validFilter` (required metadata fields exist) | `ElasticSearchModel.scala:SearchParams.apply` |
| `free` | Boolean | — | Simple cost filter (superseded by `payType`) | `ElasticSearchModel.scala:SearchParams.apply` |
| `payType` | Enum | — | `free` \| `maybe-free` \| `pay` \| `all` | `ElasticSearchModel.scala:SearchParams.apply` |
| `hasRightsCategory` | Boolean | — | `usageRights.category` exists | `ElasticSearchModel.scala:SearchParams.apply` |
| `uploadedBy` | String | — | `uploadedBy` exact term match | `ElasticSearchModel.scala:SearchParams.apply` |
| `labels` | CSV String | — | `edits.labels` terms match | `ElasticSearchModel.scala:SearchParams.apply` |
| `hasMetadata` | CSV String | — | Listed metadata fields must exist | `ElasticSearchModel.scala:SearchParams.apply` |
| `persisted` | Boolean | — | Persistence filter (true = any persistence reason; false = none) | `ElasticSearchModel.scala:SearchParams.apply` |
| `usageStatus` | CSV String | — | `usagesStatus` terms match | `ElasticSearchModel.scala:SearchParams.apply` |
| `usagePlatform` | CSV String | — | `usagesPlatform` terms match | `ElasticSearchModel.scala:SearchParams.apply` |
| `syndicationStatus` | String | — | Syndication status filter (see Section 2 note on SyndicationFilter) | `ElasticSearchModel.scala:SearchParams.apply` |
| `countAll` | Boolean | true | When `false`, skips `trackTotalHits` and returns `total=0` | `ElasticSearchModel.scala:SearchParams.apply` |
| `printUsageIssueDate` | DateTime | — | Anchor date for print usage nested filter | `ElasticSearchModel.scala:SearchParams.apply` |
| `printUsageSectionCode` | String | — | Print usage nested filter: section code | `ElasticSearchModel.scala:SearchParams.apply` |
| `printUsagePageNumber` | Int | — | Print usage nested filter: page number | `ElasticSearchModel.scala:SearchParams.apply` |
| `printUsageEdition` | Int | — | Print usage nested filter: edition | `ElasticSearchModel.scala:SearchParams.apply` |
| `printUsageOrderedBy` | String | — | Print usage nested filter: ordered-by | `ElasticSearchModel.scala:SearchParams.apply` |
| `useAISearch` | Boolean | — | Engages AI (KNN/hybrid) search path; bypasses normal ES query entirely | `ElasticSearchModel.scala:SearchParams.apply` |
| `vecWeight` | Double [0,1] | 1.0 (when AI) | Weight of vector vs lexical in hybrid search | `ElasticSearchModel.scala:SearchParams.apply` |
| `include` | CSV String | — | Include optional fields in image response (e.g. `fileMetadata`) | `MediaApi.scala:getIncludedFromParams` |

**Cookie (implicit param):**

| Name | Type | Default | Purpose |
|------|------|---------|---------|
| `SHOULD_BLUR_GRAPHIC_IMAGES` | `"true"/"false"` | `config.defaultShouldBlurGraphicImages` | Enables `isPotentiallyGraphic` script field on each hit | `MediaApi.scala:545` |

**Request body:** None.

**Response shape:** Argo `respondCollection` at `MediaApi.scala:563`. Top-level fields:

- `data`: array of embedded image entities (see GET /images/:id for per-entity shape)
- `offset`: Int
- `total`: Long (0 if `countAll=false`)
- `extraCounts`: optional object — map of ticker name → `{value, searchClause, backgroundColour, subCounts}` (see Section 4)
- `links`: prev/next pagination links (absent at boundaries)

Each entity in `data`:
- `uri`: `${rootUri}/images/{id}`
- `data`: transformed Image JSON (see GET /images/:id)
- `links`, `actions` (permission-gated)

**Pagination model:** Offset-based. `offset` + `length`. Prev/next links generated at `MediaApi.scala:720`. `until` is frozen to `DateTime.now` in next/prev links to prevent new images slipping in. No search_after or PIT.

**Aggregations returned:** Ticker aggregations always-on (but config-gated). See Section 4.

**Filter capabilities:** Full CQL query via `q` param plus all explicit filters above. See Section 3 for CQL operators.

**Special modes:**
- `useAISearch=true`: bypasses normal ES `search()` entirely; routes to `knnSearch` or `hybridSearch`; no filters (date, cost, etc.) are applied; results limited to `config.aiSearchResultLimit` (default 200)
- `countAll=false`: disables `trackTotalHits`; returned `total` is 0
- `orderBy=dateAddedToCollection`: injects an additional `collections.pathHierarchy` term filter for the collection path extracted from `q` (`MediaApi.scala` / `ElasticSearch.scala:329`)

**Embeddings/AI:** See Section 5.

---

### GET /images/:id

**Action:** `MediaApi.getImage` at `media-api/app/controllers/MediaApi.scala:155`

**Query parameters accepted:**

| Name | Type | Default | Purpose | Parsed at |
|------|------|---------|---------|-----------|
| `include` | CSV String | — | `fileMetadata` causes file metadata to be embedded in response | `MediaApi.scala:145` |

**Request body:** None.

**Response shape:** Argo `respond(imageData, imageLinks, imageActions)`. `imageData` is the full `Image` JSON transformed by `ImageResponse.create` (`ImageResponse.scala:58`):

- All `Image` model fields (id, uploadTime, uploadedBy, softDeletedMetadata, lastModified, identifiers, uploadInfo, source, thumbnail, optimisedPng, fileMetadata, userMetadata, metadata, originalMetadata, usageRights, originalUsageRights, exports, usages, leases, collections, syndicationRights, embedding, userMetadataLastModified)
- **Computed additions:**
  - `secureUrl` — signed S3 URL for original
  - `thumbnail.secureUrl` — CloudFront URL (or signed S3)
  - `optimisedPng.secureUrl` — if present
  - `valid` Boolean
  - `invalidReasons` map
  - `cost` String
  - `persisted` Boolean + `persistenceReasons` list
  - `syndicationStatus` String
  - `aliases` — field alias values from config
  - `fromIndex` — which ES index served the document
  - Possibly `fileMetadata` (if `include=fileMetadata`)
  - `isPotentiallyGraphic` — only present in collection results (script field), not in single-get

**Pagination model:** None (single document).

**Aggregations returned:** None.

**Special modes:**
- Syndication-tier callers get 404 for images not available for syndication (`MediaApi.scala:159`)

---

### GET /images/:id/_elasticsearch

**Action:** `MediaApi.getImageFromElasticSearch` at `MediaApi.scala:173`

Same as `GET /images/:id` but returns the **raw ES source** (`Image` model instance as-is, pre-transformation) rather than the fully computed response. Links and actions are still appended. Useful for debugging projection drift.

---

### GET /images/metadata/:field

**Action:** `SuggestionController.metadataSearch(field, q)` at `app/controllers/SuggestionController.scala:27`

**Query parameters accepted:**

| Name | Type | Default | Purpose | Parsed at |
|------|------|---------|---------|-----------|
| `field` | String (path) | — | Metadata field name to aggregate over; maps to `metadata.{field}` | `SuggestionController.scala:27` |
| `q` | String | — | Optional CQL query to filter the aggregation's document set | `ElasticSearchModel.scala:AggregateSearchParams.apply` |

**Response shape:** Argo `respondCollection` of `BucketResult(key: String, count: Long)`.
Cite: `ElasticSearch.scala:metadataSearch`, `ElasticSearchModel.scala:BucketResult`.

**Aggregation used:** `termsAgg(name="metadata", field=metadataField(params.field))` (`ElasticSearch.scala:469`).

---

### GET /images/edits/:field

**Action:** `SuggestionController.editsSearch(field, q)` at `SuggestionController.scala:33`

Same shape as `/images/metadata/:field`. The `field` path param is **currently ignored** — the aggregation always uses `labels` (`ElasticSearch.scala:474`: `val field = "labels" // TODO was - params.field`). The only meaningful value is `label`.

---

### GET /images/aggregations/date/:field

**Action:** `AggregationController.dateHistogram(field, q)` at `AggregationController.scala:15`

**Query parameters accepted:**

| Name | Type | Default | Purpose | Parsed at |
|------|------|---------|---------|-----------|
| `field` | String (path) | — | Date field to histogram over (e.g. `uploadTime`) | `AggregationController.scala:15` |
| `q` | String | — | Optional CQL query to filter the document set | `ElasticSearchModel.scala:AggregateSearchParams.apply` |

**Response shape:** Argo `respondCollection` of `BucketResult(key: String, count: Long)` where key is the ISO date of each month bucket.

**Aggregation used:** `dateHistogramAgg(name=field, field=field).calendarInterval(Month).minDocCount(0)` (`ElasticSearch.scala:463`).

---

### GET /suggest/metadata/credit

**Action:** `SuggestionController.suggestMetadataCredit(q, size)` at `SuggestionController.scala:18`

**Query parameters accepted:**

| Name | Type | Default | Purpose | Parsed at |
|------|------|---------|---------|-----------|
| `q` | String | — | Prefix text to suggest completions for | `SuggestionController.scala:47` |
| `size` | Int | 10 | Number of suggestions to return | `SuggestionController.scala:47` |

**Response shape:** Argo `respondCollection` of `CompletionSuggestionResult(key: String, score: Float)`.

**ES mechanism:** `ElasticDsl.completionSuggestion("suggestMetadataCredit", "suggestMetadataCredit").text(q).skipDuplicates(true)` (`ElasticSearch.scala:530`).

---

### GET /suggest/metadata/photoshoot

**Action:** `SuggestionController.suggestPhotoshoot(q, size)` at `SuggestionController.scala:19`

Same mechanism as `/suggest/metadata/credit` but field name is `photoshootField("suggest")` (resolves to `userMetadata.photoshoot.suggest`).

---

### GET /images/:id/softDeletedMetadata

**Action:** `MediaApi.getSoftDeletedMetadata(id)` at `MediaApi.scala:255`

**Note:** This does **not** query Elasticsearch. It queries a DynamoDB table (`SoftDeletedMetadataTable`). Returns the soft-delete record for the image if present. Response is an Argo `respond(record)` of the `SoftDeletedMetadata` shape (deleteTime, deletedBy).

---

### GET /configuration/crop-variations

**Action:** `ConfigurationController.cropVariations` at `ConfigurationController.scala:9`

**No authentication.** Returns `Json.toJson(CropOption.supported)` — the list of supported crop aspect-ratio options.

---

## Section 3 — Shared Parameter Vocabulary

### SearchParams case class

Defined at `media-api/app/lib/elasticsearch/ElasticSearchModel.scala:57`.

| Field | Type | Default | Parsed from |
|-------|------|---------|-------------|
| `query` | `Option[String]` | None | `q` query string param |
| `structuredQuery` | `List[Condition]` | `Nil` | Parsed by `Parser.run(q)` |
| `ids` | `Option[List[String]]` | None | `ids` CSV param |
| `offset` | `Int` | 0 | `offset`; min 0 |
| `length` | `Int` | 10 | `length`; max 200 |
| `orderBy` | `Option[String]` | None | `orderBy`; `oldest`→`uploadTime`, `newest`→`-uploadTime` |
| `since` | `Option[DateTime]` | None | `since` |
| `until` | `Option[DateTime]` | None | `until` |
| `modifiedSince` | `Option[DateTime]` | None | `modifiedSince` |
| `modifiedUntil` | `Option[DateTime]` | None | `modifiedUntil` |
| `takenSince` | `Option[DateTime]` | None | `takenSince` |
| `takenUntil` | `Option[DateTime]` | None | `takenUntil` |
| `archived` | `Option[Boolean]` | None | `archived` |
| `hasExports` | `Option[Boolean]` | None | `hasExports` |
| `hasIdentifier` | `Option[String]` | None | `hasIdentifier` |
| `missingIdentifier` | `Option[String]` | None | `missingIdentifier` |
| `valid` | `Option[Boolean]` | None | `valid` |
| `free` | `Option[Boolean]` | None | `free` |
| `payType` | `Option[PayType]` | None | `payType`; values: `free`, `maybe-free`, `all`, `pay` |
| `hasRightsCategory` | `Option[Boolean]` | None | `hasRightsCategory` |
| `uploadedBy` | `Option[String]` | None | `uploadedBy` |
| `labels` | `List[String]` | `Nil` | `labels` CSV |
| `hasMetadata` | `List[String]` | `Nil` | `hasMetadata` CSV |
| `persisted` | `Option[Boolean]` | None | `persisted` |
| `usageStatus` | `List[UsageStatus]` | `Nil` | `usageStatus` CSV |
| `usagePlatform` | `List[String]` | `Nil` | `usagePlatform` CSV |
| `tier` | `Tier` | *(from auth)* | Not a query param; derived from authentication principal |
| `syndicationStatus` | `Option[SyndicationStatus]` | None | `syndicationStatus` |
| `countAll` | `Option[Boolean]` | None (→ true) | `countAll`; when false, total returns as 0 |
| `printUsageFilters` | `Option[PrintUsageFilters]` | None | `printUsageIssueDate` (required anchor) + optional `printUsageSectionCode`, `printUsagePageNumber`, `printUsageEdition`, `printUsageOrderedBy` |
| `shouldFlagGraphicImages` | `Boolean` | false | **Not** a query param; read from cookie `SHOULD_BLUR_GRAPHIC_IMAGES` or `config.defaultShouldBlurGraphicImages`; injected in `imageSearch()` before calling `elasticSearch.search()` |
| `useAISearch` | `Option[Boolean]` | None | `useAISearch`; when true, bypasses normal search entirely |
| `vecWeight` | `Option[Double]` | None (→ 1.0) | `vecWeight`; bounded [0, 1]; NaN and Infinity rejected; used only in AI search path |

**Validation** (`SearchParams.validate`): offset ≥ 0; length ≤ 200. Returns 422 on failure.

### AggregateSearchParams case class

Defined at `ElasticSearchModel.scala:41`.

| Field | Type | Parsed from |
|-------|------|-------------|
| `field` | `String` | Path param |
| `q` | `Option[String]` | `q` query string param |
| `structuredQuery` | `List[Condition]` | Parsed by `Parser.run(q)` |

### CQL parsing entry point

`Parser.run(input: String): List[Condition]` at `media-api/app/lib/querysyntax/Parser.scala:7`.

Behaviour: automatically appends `-is:deleted` and `-usages@status:replaced` to every query string that does not already contain them. Then delegates to PEG grammar (`QuerySyntax`).

### CQL operators supported (via `QuerySyntax.scala`)

| Operator / Syntax | Produces | Example |
|---|---|---|
| Plain words | `Match(AnyField, Words(...))` | `cats` |
| Quoted phrase | `Match(AnyField, Phrase(...))` | `"cats and dogs"` |
| `field:value` | `Match(SingleField, Words(...))` | `byline:photographer` |
| `field:"phrase"` | `Match(SingleField, Phrase(...))` | `description:"breaking news"` |
| `-term` | `Negation(Match(...))` | `-is:deleted` |
| `#label` | `Match(SingleField(labels), Phrase(...))` | `#sports` |
| `~collection` / `collection:path` | `Match(HierarchyField, Phrase(...))` | `~UK/Sport` |
| `has:field` | `Match(HasField, HasValue(...))` | `has:byline` |
| `is:value` | `Match(IsField, IsValue(...))` | `is:deleted` |
| `date:expr` | `Match(SingleField(uploadTime), DateRange(...))` | `date:today` |
| `uploaded:expr` | Same as `date:` | |
| `taken:expr` | `Match(SingleField(dateTaken), DateRange(...))` | `taken:2024` |
| `added:expr` | `Match(SingleField(dateAdded), DateRange(...))` | `added:yesterday` |
| `>date:expr` | Date constraint after date | `>date:2024-01-01` |
| `<date:expr` | Date constraint before date | `<date:2024-12-31` |
| `@dateExpr` | Date range on `uploadTime` | `@2024-01-01` |
| `fileType:jpg/jpeg/png/tiff/tif` | `Match(SingleField(mimeType), Words(...))` | `fileType:jpeg` |
| `usages@status:value` | `Nested(usages, status, ...)` | `usages@status:published` |
| `usages@platform:value` | `Nested(usages, platform, ...)` | `usages@platform:print` |
| `-usages@status:value` | `NegationNested(Nested(...))` | `-usages@status:replaced` |
| `similar:imageId` | Parsed in controller (not CQL level) | `similar:abc123` |

**Field aliases resolved in `QuerySyntax.resolveNamedField`:**

| Alias | Resolves to |
|---|---|
| `illustrator` | `credit` |
| `uploader` | `uploadedBy` |
| `label` | `labels` |
| `subject` | `subjects` |
| `location` | `subLocation` |
| `by`, `photographer` | `byline` |
| `keyword` | `keywords` |
| `person` | `peopleInImage` |
| `in` | `MultipleField([subLocation, city, state, country])` |
| `publication` | `MultipleField([publicationName, publicationCode])` |
| `section` | `MultipleField([sectionId, sectionCode])` |
| `reference` | `MultipleField([usages.references.uri, usages.references.name])` |

**Date expression formats supported** (via `DateRangeParser`): `today`, `yesterday`, `dd MMMMM YYYY`, `d/M/YYYY`, `dd/MM/YYYY`, `YYYY-MM-dd`, `MMMMM YYYY`, `YYYY`.

### `is:` filter registry

Defined in `IsQueryFilter.scala:26`. Resolution is case-insensitive after lowercasing.

| Token | Resolves to | ES query | Cite |
|---|---|---|---|
| `{org}-owned-photo` | `IsOwnedPhotograph` | `terms(usageRights.category, photographer categories)` | `IsQueryFilter.scala:47` |
| `{org}-owned-illustration` | `IsOwnedIllustration` | `terms(usageRights.category, illustrator categories)` | `IsQueryFilter.scala:51` |
| `{org}-owned` | `IsOwnedImage` | `terms(usageRights.category, wholly-owned categories)` | `IsQueryFilter.scala:55` |
| `under-quota` | `IsUnderQuota` | `mustNot(terms(usageRights.supplier, overQuotaAgencies))` | `IsQueryFilter.scala:59` |
| `deleted` | `IsDeleted(true)` | `existsOrMissing("softDeletedMetadata", true)` | `IsQueryFilter.scala:63` |
| `reapable` | `IsReapable` | Composite persistence-based filter | `IsQueryFilter.scala:65` |
| `agency-pick` | `IsAgencyPick` | Config-supplied query (match phrases on configured fields) | `IsQueryFilter.scala:66` |
| *(any other value)* | `None` → `matchNoneQuery()` | Returns zero results silently | `QueryBuilder.scala:63` |

`{org}` is `config.staffPhotographerOrganisation` (lowercase); at the Guardian this is `gnm`.

### Multi-match fields (text search base)

Defined in `MatchFields.scala`:

- `id` (source field)
- `mimeType` (source field)
- `metadata.description`, `metadata.title`, `metadata.byline`, `metadata.source`, `metadata.credit`, `metadata.keywords`, `metadata.subLocation`, `metadata.city`, `metadata.state`, `metadata.country`, `metadata.suppliersReference`, `metadata.peopleInImage`, `metadata.specialInstructions`, `metadata.englishAnalysedCatchAll`, `metadata.imageType`
- `userMetadata.labels` (edits)
- `identifiers.{key}` for each `config.queriableIdentifiers`
- `usageRights.restrictions`

---

## Section 4 — Aggregations Catalogue

### Always-on ticker aggregations (on `GET /images` results)

These are filter aggregations added to every `search()` call and returned in `extraCounts`. The set is config-gated.

| Name | Type | Trigger | ES filter | Sub-aggregation | Cite |
|---|---|---|---|---|---|
| `{org}-owned` (e.g. `gnm-owned`) | `filter` agg | Config: `shouldDisplayOrgOwnedCountAndFilterCheckbox=true` | `queryBuilder.makeQuery(Parser.run("is:{org}-owned"))` | None | `ElasticSearch.scala:49` |
| `agency picks` | `filter` agg | Config: `maybeAgencyPickQuery` is defined | `queryBuilder.makeQuery(Parser.run("is:agency-pick"))` | `termsAgg(name="byAgency", field="usageRights.supplier").size(9)` | `ElasticSearch.scala:55` |

Sub-aggregation result shape: `{ subCounts: { supplierName: count, ..., "other": otherDocCount } }` (only returned if any bucket has count > 0). Cite: `ElasticSearch.scala:412`.

### Metadata / edits / date aggregations (on-demand endpoints)

| Name | Type | Field | Returned when | Cite |
|---|---|---|---|---|
| `metadata` | `terms` | `metadata.{field}` | `GET /images/metadata/:field` | `ElasticSearch.scala:469` |
| `edits` | `terms` | `userMetadata.labels` (always, field param ignored) | `GET /images/edits/:field` | `ElasticSearch.scala:473` |
| `{field}` date histogram | `date_histogram` (calendar_interval: month, min_doc_count: 0) | Caller-supplied field name | `GET /images/aggregations/date/:field` | `ElasticSearch.scala:461` |

### Completion suggestions (not aggregations, but autocomplete)

| Name | ES field | Endpoint | Cite |
|---|---|---|---|
| `suggestMetadataCredit` | `suggestMetadataCredit` (completion) | `GET /suggest/metadata/credit` | `ElasticSearch.scala:530` |
| Photoshoot | `userMetadata.photoshoot.suggest` (completion) | `GET /suggest/metadata/photoshoot` | `ElasticSearch.scala:530` |

---

## Section 5 — KNN / Vector Search

### ES embedding field

- **Field path:** `embedding.cohereEmbedV4.image`
- **Type:** dense_vector (inferred from KNN usage; dimensions confirmed as 256 from `Bedrock.scala:50`)
- **Model:** `cohere.embed-v4:0` (global cross-region inference) via AWS Bedrock
- **Input type for text:** `search_query`
- **Embedding types:** `["float"]`
- **Output dimensions:** 256
- Cite: `Bedrock.scala:40–57`; field reference: `ElasticSearch.scala:175`

Stored per-image embedding is in `Image.embedding.cohereEmbedV4.image: List[Double]` (cite: `Embedding.scala:21`). Note: query embeddings returned by Bedrock are `List[Float]`; stored embeddings in the model are `List[Double]`.

### `knnSearch(queryEmbedding, k, numCandidates)`

Defined at `ElasticSearch.scala:168`. Pure KNN search — no lexical component.

- Constructs `Knn("embedding.cohereEmbedV4.image").queryVector(embedding).k(k).numCandidates(numCandidates)`
- Uses only `imagesCurrentAlias` (no migration awareness)
- Does **not** apply any of the standard search filters (date, cost, validity, etc.)
- Returns `SearchResults(hits, total=imageHits.length, extraCounts=None)` — note: total is set to hit count, not ES total
- Called by: image-to-image (`similar:<id>`) path in `imageSearch()`; cite: `MediaApi.scala:596`

### `hybridSearch(query, queryEmbedding, k, numCandidates, vecWeight)`

Defined at `ElasticSearch.scala:220`.

- First fetches max BM25 score for the query via a separate ES request (`fetchMaxBm25Score`) to compute a scaling factor. Cite: `ElasticSearch.scala:192`
- Constructs a `BoolQuery.should(multiMatchQuery, knn)` where:
  - KNN: `Knn("embedding.cohereEmbedV4.image").queryVector(embedding).k(k).numCandidates(numCandidates).boost(if vecWeight > 0 then 1.0 else 0.0)`
  - Multi-match: `BEST_FIELDS`, fuzziness=AUTO, maxExpansions=50, operator=AND, prefixLength=1; boost = `(lexicalWeight/vecWeight) * scalingFactor`
  - `scalingFactor = 1.0 / maxBm25Score` (normalises BM25 to approx [0,1] range)
- `vecWeight=1.0` → pure vector (multi-match boost approaches 0); `vecWeight=0.0` → pure lexical (knn.boost=0.0)
- Returns `SearchResults(hits, total=imageHits.length, extraCounts=None)` — same note as above; not ES total
- Does **not** apply standard search filters
- Called by: text query AI search path in `imageSearch()`; cite: `MediaApi.scala:617`

### Image-to-image (`similar:<id>`) path

- Regex: `similar:([^\\s]+)` parsed in `parseAiSearchMode` at `MediaApi.scala:567`
- Fetch image from ES by ID → read `image.embedding.cohereEmbedV4.image` → convert `List[Double]` to `List[Float]`
- If embedding absent (image never embedded, or invisible to caller's tier): returns empty results, no error. Cite: `MediaApi.scala:584`
- Calls `knnSearch(embedding, k=config.aiSearchResultLimit, numCandidates=max(k*2, 100))`

### Text query AI search path

- Called when `useAISearch=true` and query string is non-blank
- Normalises key: `query.trim.toLowerCase`
- Process-local Scaffeine `AsyncLoadingCache` (max size: `config.aiSearchEmbeddingCacheMaxSize`, default 500): concurrent requests for same key share a single in-flight Bedrock call. Cite: `MediaApi.scala:55`
- Cache miss → `embedder.createQueryEmbedding(query)` → `bedrock.createTextEmbedding(query)` → Bedrock sync call (wrapped in `Future {}`) → extracts `(json \ "embeddings" \ "float")(0).as[List[Float]]`. Cite: `Bedrock.scala:79`, `Embedder.scala:21`
- Calls `hybridSearch(query, embedding, k, numCandidates, vecWeight.getOrElse(1.0))`

### Short-circuit conditions for AI search

When `useAISearch=true`:
- `length=0`: returns empty collection immediately (used by polling callers). Cite: `MediaApi.scala:624`
- Empty or blank `q`: returns empty collection immediately. Cite: `MediaApi.scala:628`

---

## Section 6 — Capability Gaps Within media-api Itself

These are internal "almost-exposed" features — present in the ES/controller layer but partially or not wired to public routes.

### 6.1 AI search ignores all standard search filters

The `useAISearch=true` code path calls `knnSearch` or `hybridSearch` directly, completely bypassing the filter assembly logic in `ElasticSearch.search()`. That means all of: date ranges, cost filters, validity, labels, archived, persisted, usageStatus, syndicationStatus, etc. are silently ignored when `useAISearch=true`. There is no wiring to combine KNN with a post-filter. Cite: `MediaApi.scala:622–634`.

### 6.2 `editsSearch` field param is ignored

`GET /images/edits/:field` route exposes a `:field` path param, but the implementation always aggregates on `labels` regardless. The `field` param is accepted and logged but has no effect. Cite: `ElasticSearch.scala:474`: `val field = "labels" // TODO was - params.field`.

### 6.3 `lookupIds` method not wired to a dedicated route

`ElasticSearch.lookupIds(ids, offset, length)` exists as a public method (cite: `ElasticSearch.scala:157`) but is not called from any controller directly. The `ids` param in `GET /images` goes through the normal `search()` path (via `idsFilter` in `SearchParams`). `lookupIds` would provide a lighter-weight pinned-ID search if directly exposed.

### 6.4 `hybridSearch` does not support the full filter set

`hybridSearch` is purely a semantic scoring mechanism; it has no `filterOpt` parameter. To add filters (e.g. date range, cost) to hybrid results would require compositing the `BoolQuery` with filter clauses — a non-trivial wiring task. Cite: `ElasticSearch.scala:220–243`.

### 6.5 Embedding field stored on image but not exposed in search response

`Image.embedding` is indexed in ES and returned by `getImageById`. However `imageSearch()` does not expose the embedding in search results (it would be filtered by the `imageResponseWrites` transformer unless `include=fileMetadata` unlocks additional fields). This is expected — embeddings are large and should not be returned in bulk — but means a caller cannot use search to bulk-fetch embeddings.

### 6.6 `knnSearch` total is hit count, not ES total

Both `knnSearch` and `hybridSearch` return `total = imageHits.length` (not `r.result.totalHits`). For KNN this is technically correct (KNN returns exactly `k` results), but it means `countAll` semantics don't apply and the total displayed to users for AI search is always the page size, not a corpus-wide count. Cite: `ElasticSearch.scala:181`, `243`.

---

## Section 7 — Anti-Goals Appendix (≤30 items, one line each)

1. `ElasticSearch.search()` creates aggregations via a `Map` — iteration order is undefined; ticker display order may vary across JVM runs.
2. `PostToUsages` in `downloadImageExport` and `downloadOriginalImage` is fire-and-forget; failures are silently swallowed.
3. The `similar:<id>` parsing uses `split(":", 2)` — image IDs containing colons would parse incorrectly (unlikely but possible).
4. `fetchMaxBm25Score` fires a full ES query before every hybrid search that isn't already cached — doubles ES load per uncached AI query.
5. `SearchQueryTimeout` is 10 seconds hardcoded; cluster-level timeout is 15 seconds; the ES `allow_partial_search_results=true` default means timed-out searches silently return partial results.
6. `GET /configuration/crop-variations` has no auth — intentional per comment, but worth noting for external access.
7. The `SHOULD_BLUR_GRAPHIC_IMAGES` cookie mechanism bypasses query-string param documentation; callers cannot set this via the API without setting the cookie.
8. `syndicationReviewQueueFixMapping` injects a runtime field for `AwaitingReviewForSyndication` status queries — runtime fields are slow; this is guarded by `config.useRuntimeFieldsToFixSyndicationReviewQueueQuery`.
9. `GET /images/edits/:field` field param being ignored is a silent API contract violation — the URL implies field selection but it's hardcoded.
10. `hybridSearch` makes two sequential ES requests (max BM25 score, then hybrid query) — no batching possible with current elastic4s client.
11. `EmbeddingCache` is process-local (not distributed) — multiple media-api instances each maintain independent caches; warm-up cost is per-instance.
12. The `is:reapable` filter is complex and depends on `maybePersistOnlyTheseCollections` and `persistenceIdentifiers` from config — its exact semantics are environment-specific.
13. `lookupIds` uses `filters.pinnedIds` which may use ES `pinned` query or `ids` query — behaviour depends on the underlying filters implementation in `common-lib`.

---

## Self-check

- [x] Every route in `conf/routes` appears in Section 1 (32 routes)
- [x] Every image-related endpoint has the template filled in Section 2 (10 endpoints)
- [x] Every query param is cited to its parsing location
- [x] Aggregations in Section 4 each have a file:line
- [x] No "TODO" / "I think" / "probably" left in the document
- [x] No fix proposals outside Section 7; no critiques outside Section 7
- [x] Coverage gaps explicitly declared (none — all Tier 1 and key Tier 2 files read in full)
- [x] No code written, no tests run, no files modified outside this findings doc
