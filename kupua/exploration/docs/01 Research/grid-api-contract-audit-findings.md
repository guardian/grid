# Grid API Surface Contract

**Produced:** 2026-04-29  
**Auditor model:** Claude Sonnet 4.6 (High)  
**Status:** Audit complete. No code was changed, no services run, no HTTP calls made.  
**Serves:** `integration-workplan-bread-and-butter.md` Phases A, B, C.

---

## Table of Contents

1. [Methodology](#section-1--methodology)
2. [HATEOAS root and service discovery](#section-2--hateoas-root-and-service-discovery)
3. [Phase A endpoints — image detail](#section-3--phase-a-endpoints-image-detail)
4. [Phase B endpoints — read-only resources](#section-4--phase-b-endpoints-read-only-resources)
5. [Phase C endpoints — writes](#section-5--phase-c-endpoints-writes)
6. [Cross-cutting concerns](#section-6--cross-cutting-concerns)
7. [Unknowns and open questions](#section-7--unknowns-and-open-questions)
8. [Workplan corrections](#section-8--workplan-corrections)
9. [TypeScript type appendix](#section-9--typescript-type-appendix)

---

## Section 1 — Methodology

**Files read end-to-end:**
- `media-api/app/controllers/MediaApi.scala` — HATEOAS root, image controller, delete, syndication
- `media-api/app/lib/ImageResponse.scala` — response builder, actions array, cost injection
- `media-api/conf/routes`
- `common-lib/.../argo/model/` — EmbeddedEntity, EntityResponse, ErrorResponse, CollectionResponse, Link, Action
- `common-lib/.../argo/ArgoHelpers.scala` — respond/respondError helpers
- `rest-lib/.../auth/Authentication.scala` — principal types, 401/403 responses
- `rest-lib/.../auth/Permissions.scala` — permission definitions
- `rest-lib/.../auth/Authorisation.scala` — permission checks, isUploaderOrHasPermission
- `rest-lib/.../guardian/auth/PandaAuthenticationProvider.scala` — panda cookie auth
- `rest-lib/.../guardian/auth/PermissionsAuthorisationProvider.scala` — permission implementation
- `rest-lib/.../play/GridComponents.scala` — CORS config
- `common-lib/.../config/CommonConfig.scala` — corsAllowedOrigins config key
- `common-lib/.../config/Services.scala` — corsAllowedDomains derivation
- `metadata-editor/app/controllers/EditsController.scala`
- `metadata-editor/conf/routes`
- `cropper/app/controllers/CropperController.scala`
- `cropper/app/model/ExportRequest.scala`
- `cropper/conf/routes`
- `leases/app/controllers/MediaLeaseController.scala`
- `leases/conf/routes`
- `collections/app/controllers/ImageCollectionsController.scala`
- `collections/conf/routes`
- `usage/app/controllers/UsageApi.scala`
- `usage/conf/routes`
- `common-lib/src/main/resources/application.conf`

**Model files read:**
- `Image.scala`, `Asset.scala`, `Crop.scala`, `Export.scala`, `Collection.scala`, `Edits.scala`, `ImageMetadata.scala`, `UsageRights.scala`, `Cost.scala`, `SyndicationRights.scala`, `SyndicationStatus.scala`, `leases/MediaLease.scala`, `leases/LeasesByMedia.scala`, `usage/Usage.scala`

**Also consulted:** `dev/nginx-mappings.yml` (URL patterns in dev), `media-api/app/lib/usagerights/CostCalculator.scala`

**Taken as given (not verified against panda source):** The pan-domain cookie name and exact cookie structure — the panda library is an external dependency, its source is not in this repo.

**Originally not derivable from source alone — now resolved by follow-up live verification (see §6.6 and §7):** Cookie name (`gutoolsAuth-assym`), CORS dev allowlist (kupua origin not present), permission bucket contents for mk's account (`showPaid:false`, `canUpload:true`, `canDelete:true`).

---

## Section 2 — HATEOAS root and service discovery

### Request

```
GET /
Host: api.media.{domainRoot}
Cookie: <panda-auth-cookie>
```

Auth required. Returns `EntityResponse<{description: string}>`.

### Response shape

```
Content-Type: application/vnd.argo+json
```

```json
{
  "data": { "description": "This is the Media API" },
  "links": [ ...see table below... ]
}
```

### Root links table

All links are present unless noted. `href` values are **RFC 6570 URI templates** where `{...}` appears; otherwise they are absolute URLs.

| `rel` | Target service | `href` pattern | Permission gate | Source |
|---|---|---|---|---|
| `search` | media-api | `${rootUri}/images{?q,ids,offset,length,orderBy,since,until,...}` | None (query filters may restrict results) | `MediaApi.scala:86` |
| `image` | media-api | `${rootUri}/images/{id}` | None | `MediaApi.scala:104` |
| `metadata-search` | media-api | `${rootUri}/suggest/metadata/{field}{?q}` | None | `MediaApi.scala:106` |
| `label-search` | media-api | `${rootUri}/images/edits/label{?q}` | None | `MediaApi.scala:107` |
| `cropper` | cropper | `${cropperUri}` (no template) | None | `MediaApi.scala:108` |
| `edits` | metadata-editor | `${metadataUri}` (no template) | None | `MediaApi.scala:109` |
| `session` | auth | `${authUri}/session` | None | `MediaApi.scala:110` |
| `witness-report` | Guardian Witness | `${guardianWitnessBaseUri}/2/report/{id}` | None | `MediaApi.scala:111` |
| `collections` | collections | `${collectionsUri}` (no template) | None | `MediaApi.scala:112` |
| ⚠️ ~~`permissions`~~ | ~~media-api~~ | ~~`${rootUri}/permissions`~~ | **Dead link — do not call.** Emitted by media-api but no matching route exists; returns 404. Use `GET /session` on the auth service instead. See §6.6 and §8 item 9 addendum. |
| `leases` | leases | `${leasesUri}` (no template) | None | `MediaApi.scala:114` |
| `syndicate-image` | media-api | `${rootUri}/images/{id}/{partnerName}/{startPending}/syndicateImage` | None | `MediaApi.scala:115` |
| `undelete` | media-api | `${rootUri}/images/{id}/undelete` | None | `MediaApi.scala:116` |
| `usage` | usage | `${usageUri}` (no template) | None | `MediaApi.scala:117` |
| `loader` | image-loader | `${loaderUri}` | `UploadImages` (**always true** in Guardian impl) | `MediaApi.scala:119-120` |
| `archive` | metadata-editor | `${metadataUri}/metadata/{id}/archived` | `ArchiveImages` (**always true** in Guardian impl) | `MediaApi.scala:121-122` |

**No `actions` array at root level.** The root `respond()` call passes no actions.

### URL construction (critical)

Service base URIs are computed from `domainRoot` and prefixes:

| Service | URL pattern | Example (dev) |
|---|---|---|
| media-api | `https://api.media.{domainRoot}` | `https://api.media.local.dev-gutools.co.uk` |
| metadata-editor | `https://media-metadata.{domainRoot}` | `https://media-metadata.local.dev-gutools.co.uk` |
| cropper | `https://cropper.media.{domainRoot}` | `https://cropper.media.local.dev-gutools.co.uk` |
| leases | `https://media-leases.{domainRoot}` | `https://media-leases.local.dev-gutools.co.uk` |
| collections | `https://media-collections.{domainRoot}` | `https://media-collections.local.dev-gutools.co.uk` |
| usage | `https://media-usage.{domainRoot}` | `https://media-usage.local.dev-gutools.co.uk` |
| auth | `https://media-auth.{domainRoot}` | `https://media-auth.local.dev-gutools.co.uk` |

Source: `Services.scala:41-78`, `dev/nginx-mappings.yml`.

**⚠️ Kupua's service-discovery strategy:** Call `GET /` once, parse all link `href` values, store as a map of `rel -> href` **as absolute URLs, exactly as returned**. Do **not** derive a single base URI by stripping RFC 6570 template variables and reuse it for sub-resources — in `--use-TEST` mode the HATEOAS root returns mixed-origin URLs (media-api at `*.local.dev-gutools.co.uk`, satellites at `*.test.dev-gutools.co.uk`), so a derived base URI would be wrong for at least some services. Always use the per-`rel` host as returned. See §6.6 "Mixed-origin service URLs in `--use-TEST` mode" for the full implications.

---

## Section 3 — Phase A endpoints (image detail)

### 3.1 Request

```
GET /images/{id}
Host: api.media.{domainRoot}
Cookie: <panda-auth-cookie>
```

| Parameter | Location | Type | Required | Notes |
|---|---|---|---|---|
| `id` | path | string | yes | SHA-1 of image content |
| `include` | query | comma-separated string | no | Only recognised value: `fileMetadata`. Causes `fileMetadata.data` to be populated. |

No `Accept` header required (response is always `application/vnd.argo+json`).

Source: `MediaApi.scala:151-164`, `MediaApi.scala:627-650`.

### 3.2 Response (success)

```
HTTP/1.1 200 OK
Content-Type: application/vnd.argo+json
```

```json
{
  "data": { ...ImageData... },
  "links": [ ...Link[] ... ],
  "actions": [ ...Action[]... ]
}
```

The response is an `EntityResponse<ImageData>`. TypeScript type: see §9 `ImageResponse`.

**Image data fields — always present:**

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | SHA-1 |
| `uploadTime` | `string` | ISO-8601 datetime |
| `uploadedBy` | `string` | email for human uploads; configured identifier string (e.g. `"getty"`) for SFTP/FTP uploads |
| `identifiers` | `Record<string, string>` | external system IDs |
| `uploadInfo` | `UploadInfo` | `{ filename?: string }` |
| `source` | `Asset` | original file; `source.file` is HTTP (unsigned S3); `source.secureUrl` is signed HTTPS S3 (expires ~15 min) — always use `secureUrl` |
| `thumbnail` | `Asset \| null` | `thumbnail.secureUrl` is an **unsigned** CloudFront URL (no query string, stable, does not expire) — distinct from source |
| `metadata` | `ImageMetadata` | pre-computed field-by-field merge: `originalMetadata` baseline overlaid by `userMetadata.metadata`; empty-string values stripped. See §3.2.1.1. |
| `originalMetadata` | `ImageMetadata` | pre-edit IPTC |
| `usageRights` | `UsageRights` | pre-computed by Thrall: whole-object from `userMetadata.usageRights` if set; otherwise whole-object from `originalUsageRights`. See §3.2.1.2. |
| `originalUsageRights` | `UsageRights` | pre-edit rights |
| `exports` | `Export[]` | crops/exports; may be empty |
| `usages` | `EmbeddedEntity<EmbeddedEntity<Usage>[]>` | inlined usage list — each element is `EmbeddedEntity<Usage>`, access via `image.usages.data[n].data` |
| `leases` | `EmbeddedEntity<LeasesByMedia>` | inlined leases |
| `collections` | `EmbeddedEntity<CollectionResponse>[]` | inlined, one per collection |
| `cost` | `"free" \| "conditional" \| "pay" \| "overquota"` | server-computed from usageRights |
| `valid` | `boolean` | server-computed validity |
| `invalidReasons` | `Record<string, string>` | key→reason for invalid cases |
| `persisted` | `{ value: boolean, reasons: string[] }` | server-computed |
| `syndicationStatus` | `"sent" \| "queued" \| "blocked" \| "review" \| "unsuitable"` | server-computed; see §6.7.3 |
| `embedding` | `Embedding \| null` | numeric embedding vector(s); `null` when no embedding exists; key is always present in the response |
| `userMetadata` | `EmbeddedEntity<EditsEntity>` | nested EmbeddedEntity per edit field |
| `fromIndex` | `string` | ES index name the document came from |

**Image data fields — conditionally present:**

| Field | Condition |
|---|---|
| `softDeletedMetadata` | Only when image is soft-deleted |
| `lastModified` | Only when set |
| `optimisedPng` | Only when an optimised PNG exists |
| `fileMetadata` | `EmbeddedEntity` always present, but `data` is `null` unless `?include=fileMetadata` |
| `syndicationRights` | Only when rights have been set |
| `userMetadataLastModified` | Only when edits exist |
| `aliases` | Config-defined field aliases; may be empty object |

Source: `ImageResponse.scala:57-78` (create method), `ImageResponse.scala:302-357` (imageResponseWrites).

### 3.2.1 Reconciliation rules (how merged fields are computed)

The `Image` document in Elasticsearch stores both original and user-edited versions of certain fields. Thrall maintains the pre-computed merged versions via Painless scripts run on every ingest and on every metadata edit.

#### 3.2.1.1 Metadata merge algorithm

**Source:** `ElasticSearch.scala`, `refreshMetadataScript`

```painless
ctx._source.metadata = new HashMap();
if (ctx._source.originalMetadata != null) {
    ctx._source.metadata.putAll(ctx._source.originalMetadata);
}
if (ctx._source.userMetadata != null && ctx._source.userMetadata.metadata != null) {
    ctx._source.metadata.putAll(ctx._source.userMetadata.metadata);
}
ctx._source.metadata = ctx._source.metadata.entrySet().stream()
    .filter(x -> x.value != "")
    .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
```

**Algorithm:** (1) Start empty. (2) Copy all `originalMetadata` fields. (3) Overwrite with `userMetadata.metadata` fields (field-by-field, user wins). (4) Remove any field with empty-string value (treating `""` as "clear this field").

| Scenario | Result |
|---|---|
| User has not edited a field | Original value survives |
| User sets a field to `null` / `None` | Play JSON omits the key entirely — treated as "not edited"; original survives |
| User sets a field to `""` | Overwrites original in step 3, then filtered out — field **absent** from merged `metadata` |
| `originalMetadata` is null | Step 2 skipped; only user edits appear |
| `userMetadata.metadata` is null | Step 3 skipped; merged == `originalMetadata` minus any empty strings |

**Arrays (`keywords`, `peopleInImage`, `subjects`):** `putAll` replaces wholesale — no element-wise merge. `keywords: []` (empty array) overwrites the original (the empty-string filter only removes `""` scalars, not empty arrays).

**`domainMetadata`:** `putAll` replaces top-level keys wholesale; sub-keys within a domain key are not independently merged.

Note: `ImageMetadata.merge()` exists in `ImageMetadata.scala` but is **not** used in the ES write path. It exists only for migration tooling.

#### 3.2.1.2 UsageRights merge algorithm

**Source:** `ElasticSearch.scala`, `refreshUsageRightsScript`

```painless
if (ctx._source.userMetadata != null && ctx._source.userMetadata.usageRights != null) {
    ctx._source.usageRights = new HashMap();
    ctx._source.usageRights.putAll(ctx._source.userMetadata.usageRights);
} else if (ctx._source.originalUsageRights == null) {
    ctx._source.usageRights = null;
} else {
    ctx._source.usageRights = new HashMap();
    ctx._source.usageRights.putAll(ctx._source.originalUsageRights);
}
```

**Algorithm:** Whole-object replace. If user has set an override: use it entirely (no fields from `originalUsageRights` survive). Otherwise: use `originalUsageRights` entirely. Rationale: `UsageRights` is a tagged union discriminated by `category`; partial overlay would produce incoherent results.

| Scenario | Result |
|---|---|
| User has not edited usage rights | `usageRights == originalUsageRights` |
| User sets any override | Merged `usageRights` is entirely the user's value |
| User explicitly deletes their override | `userMetadata.usageRights` → null; next reindex restores `originalUsageRights` |

#### 3.2.1.3 cost — read-time computation with fallback

**Source:** `ImageResponse.scala`, `addUsageCost`

`cost` is **not stored in ES**. It is computed at request time by re-merging `usageRights` and `userMetadata.usageRights` via Play JSON `++` (right-wins, field-by-field). The re-merge exists as a fallback for stale records not yet reindexed by Thrall — for up-to-date records it is a no-op. `CostCalculator.getCost` then applies this priority chain:

1. `restrictions` field non-empty → `conditional`
2. Category `defaultCost` (e.g. `pay` for Agency)
3. Supplier-specific logic (Agency only): `freeSuppliers` + quota → `free` or `overquota`
4. Default: `pay`

The re-merge fallback has a known `// TODO` bug for stale records where the user has changed `category` — the JSON `++` merge can produce structurally incoherent `UsageRights` before deserialisation.

---

### 3.3 The `actions` array — full enumeration

Actions are only present for **Internal tier** principals (i.e. regular human users). Syndication-tier users get no actions.

Source: `ImageResponse.scala:165-200`.

| `name` | `method` | URL | Condition |
|---|---|---|---|
| `delete` | `DELETE` | `${rootUri}/images/{id}` | `!hasExports && !hasUsages` **AND** (user is uploader OR `DeleteImage` permission) |
| ⚠️ ~~`reindex`~~ | ~~`POST`~~ | ~~`${rootUri}/images/{id}/reindex`~~ | **Dead link — do not call.** The action is emitted whenever the user has write permission, but no matching route exists in media-api; calling it returns Play 404 "Action Not Found" (HTML, not Argo). See §8 item 9. |
| `add-lease` | `POST` | `${leasesUri}/leases` | `EditMetadata` OR uploader |
| `add-leases` | `POST` | `${leasesUri}/leases/media/{id}` | `EditMetadata` OR uploader |
| `replace-leases` | `PUT` | `${leasesUri}/leases/media/{id}` | `EditMetadata` OR uploader |
| `delete-leases` | `DELETE` | `${leasesUri}/leases/media/{id}` | `EditMetadata` OR uploader |
| `delete-usages` | `DELETE` | `${usageUri}/usages/media/{id}` | `DeleteCropsOrUsages` permission |
| `add-collection` | `POST` | `${collectionsUri}/images/{id}` | Always (no permission gate) |

**Note:** `add-collection` appears for all authenticated Internal-tier users regardless of permissions. The collections endpoint itself also has no extra permission check.

Source: `ImageResponse.scala:165-199`, `MediaApi.scala:631-650`.

### 3.4 The image `links` array — full enumeration

Links are only fully present for **Internal tier** principals.

| `rel` | URL | Condition |
|---|---|---|
| `download` | `${rootUri}/images/{id}/download` | Always (all tiers); conditional on `config.restrictDownload` & `isDownloadable` |
| `downloadOptimised` | `${rootUri}/images/{id}/downloadOptimised?{&width,height,quality}` | Always (all tiers); same condition |
| `crops` | `${cropperUri}/crops/{id}` | `valid == true` AND `withWritePermission == true` |
| `edits` | `${metadataUri}/metadata/{id}` | `withWritePermission == true` |
| `optimisedPng` | imgops URL for PNG | Only when `optimisedPng` asset exists |
| `optimised` | imgops URL for source | Always (Internal only) |
| `ui:image` | `${kahunaUri}/images/{id}` | Always (Internal only) |
| `usages` | `${usageUri}/usages/media/{id}` | Always (Internal only) |
| `leases` | `${leasesUri}/leases/media/{id}` | Always (Internal only) |
| `fileMetadata` | `${rootUri}/images/{id}/fileMetadata` | Always (Internal only) |
| `loader` (projection) | `${loaderUri}/images/project/{id}` | Always (Internal only) |
| `api` (diff) | `${rootUri}/images/{id}/projection/diff` | Always (Internal only) |

Source: `ImageResponse.scala:143-162`.

### 3.5 Response (errors)

| Status | `errorKey` | Cause |
|---|---|---|
| 401 | `authentication-failure` | Missing or invalid panda cookie |
| 419 | `authentication-expired` | Cookie present but expired (grace period exceeded) |
| 403 | `principal-not-authorised` | Authenticated but not authorised (syndication tier viewing non-syndication image returns 404, not 403) |
| 404 | `image-not-found` | No image with that ID in ES |
| 404 (syndication) | `image-not-found` | Syndication-tier principal trying to view non-syndication image |

Source: `MediaApi.scala:127-131`, `Authentication.scala:31-42`.

---

## Section 4 — Phase B endpoints (read-only resources)

### 4.1 Usages

#### 4.1.1 Discovery
Link `usages` on image response: `${usageUri}/usages/media/{id}` (`ImageResponse.scala:159`).

#### 4.1.2 Request
```
GET /usages/media/{mediaId}
Host: media-usage.{domainRoot}
Cookie: <panda-auth-cookie>
```

#### 4.1.3 Response
```
HTTP/1.1 200 OK
Content-Type: application/vnd.argo+json
```

`EntityResponse<Usage[]>` — an entity response wrapping a list. Each item is a `Usage` object (not `EmbeddedEntity<Usage>`; the `/usages/media/{mediaId}` endpoint responds with `respond(usages, ...)` directly).

On zero usages: 404 with `errorKey: "not-found"` and message "No usages found."

Source: `UsageApi.scala:101-126`.

#### 4.1.4 Single usage
```
GET /usages/{usageId}
```
Returns `EntityResponse<Usage>` with links `media` and `media-usage`.

#### 4.1.5 Notes
- Usages are also inlined in the image response at `image.usages` — reading them there avoids a second round-trip.
- Usage types: `print`, `digital`, `syndication`, `front`, `download`, `child`.
- For kupua read paths, the inlined `image.usages` is sufficient.

---

### 4.2 Leases

#### 4.2.1 Discovery
Link `leases` on image response: `${leasesUri}/leases/media/{id}` (`ImageResponse.scala:160`). Actions `add-lease`, `add-leases`, `replace-leases`, `delete-leases` on image response.

#### 4.2.2 Request (read)
```
GET /leases/media/{id}
Host: media-leases.{domainRoot}
Cookie: <panda-auth-cookie>
```

#### 4.2.3 Response
```
HTTP/1.1 200 OK
Content-Type: application/vnd.argo+json
```

`EntityResponse<LeasesByMedia>`. The `LeasesByMedia` shape is `{ leases: MediaLease[], lastModified: string | null }`.

Leases are also inlined in the image response at `image.leases` — use that for read paths.

#### 4.2.4 Errors
- 401/403/419 as per standard.

#### 4.2.5 Notes
- `MediaLease.active` is a computed boolean (within start/end dates) — present in JSON response.
- Leases index (GET `/`) exposes link `by-media-id`: `${rootUri}/leases/media/{id}`.

Source: `MediaLeaseController.scala:33-37`, `MediaLease.scala`.

---

### 4.3 Crops / Exports

#### 4.3.1 Discovery
Link `crops` on image response: `${cropperUri}/crops/{id}` — present only if `valid == true` AND `withWritePermission == true` (`ImageResponse.scala:143-146`).

#### 4.3.2 Request (read)
```
GET /crops/{id}
Host: cropper.media.{domainRoot}
Cookie: <panda-auth-cookie>
```

#### 4.3.3 Response
```
HTTP/1.1 200 OK
Content-Type: application/vnd.argo+json
```

`EntityResponse<Crop[]>` with:
- `links`: `[{ "rel": "image", "href": <original image URI> }, ...cropDownloadLinks]`
- `actions`: `[{ "name": "delete-crops", "href": "...", "method": "DELETE" }]` — present only if user has `DeleteCropsOrUsages` AND crops exist.

Each `Crop` in the array (see §9 type).

#### 4.3.4 Notes
- Crops are also inlined in image response at `image.exports` (as `Export[]`, structurally identical to `Crop[]`).
- Download links per crop per size: `link.rel = "crop-download-{exportId}-{width}"`.

Source: `CropperController.scala:101-147`.

---

### 4.4 Edits (user metadata)

#### 4.4.1 Discovery
Link `edits` on image response: `${metadataUri}/metadata/{id}` — present only if `withWritePermission == true` (`ImageResponse.scala:147-148`).

The user metadata is also inlined in the image response at `image.userMetadata` as a deeply-nested `EmbeddedEntity<EditsEntity>` (see §6.1 for nesting detail).

#### 4.4.2 Request (read)
```
GET /metadata/{id}
Host: media-metadata.{domainRoot}
Cookie: <panda-auth-cookie>
```

#### 4.4.3 Response
`EntityResponse<Edits>` where `Edits` is `{ archived, labels, metadata, usageRights?, photoshoot?, lastModified? }`. If no edits exist, returns empty `Edits` object (not 404).

Source: `EditsController.scala:72-81`.

---

### 4.5 Collections (on image)

#### 4.5.1 Discovery
`image.collections` in image response — inlined as `EmbeddedEntity<CollectionResponse>[]`. Each has `actions: [{ name: "remove", method: "DELETE", href: "..."}]`.

Also: action `add-collection` on image response → `${collectionsUri}/images/{id}` (POST).

#### 4.5.2 Request (read)
```
GET /images/{imageId}
Host: media-collections.{domainRoot}
Cookie: <panda-auth-cookie>
```

Returns `EntityResponse<Collection[]>` or 404 "No collections found" if image has no collections.

Source: `ImageCollectionsController.scala:28-35`.

---

### 4.6 Collection tree

#### 4.6.1 Discovery
Link `collections` in HATEOAS root → `${collectionsUri}`.

#### 4.6.2 Requests (read)
```
GET /collections
Host: media-collections.{domainRoot}
Cookie: <panda-auth-cookie>
```

Returns full collection tree.

```
GET /collections/*collection
```

Returns a specific collection path (URL-encoded path segments).

Source: `collections/conf/routes`.

#### 4.6.3 Notes
- Collection `path` is `string[]`, e.g. `["sport", "football"]`.
- `pathId` is a lowercase version of `path.join("~")`.
- `description` is `path[last]`.

---

## Section 5 — Phase C endpoints (writes)

### 5.1 Labels

#### 5.1.1 Discovery
The `image.userMetadata.data.labels.uri` gives the labels endpoint. Or construct: `${metadataUri}/metadata/{id}/labels`.

#### 5.1.2 Add labels
```
POST /metadata/{id}/labels
Host: media-metadata.{domainRoot}
Content-Type: application/json
Cookie: <panda-auth-cookie>

{ "data": ["label1", "label2"] }
```

Response: `200 OK` `CollectionResponse` of label `EmbeddedEntity[]`.

#### 5.1.3 Remove a label
```
DELETE /metadata/{id}/labels/{label}
```
`{label}` must be URL-encoded. Returns `CollectionResponse` of remaining labels.

#### 5.1.4 Permission gate
None — `auth.async` only (no extra permission filter). Any authenticated user can add/remove labels.

Source: `EditsController.scala:128-148`.

#### 5.1.5 Eventual consistency
Write → Kinesis → Thrall → ES reindex. No guaranteed lag time. Kupua must refetch image to see updated labels.

#### 5.1.6 Idempotency
`setAddV2` uses DynamoDB set operations; adding an existing label is a no-op.

---

### 5.2 Archive

#### 5.2.1 Discovery
Action implicit in HATEOAS root link `archive`: `${metadataUri}/metadata/{id}/archived`. Also reachable directly.

#### 5.2.2 Set archived
```
PUT /metadata/{id}/archived
Host: media-metadata.{domainRoot}
Content-Type: application/json
Cookie: <panda-auth-cookie>

{ "data": true }
```

Body: `{ "data": boolean }`. 

Response: `200 OK`, `EntityResponse<boolean>`.

#### 5.2.3 Unset archived
```
DELETE /metadata/{id}/archived
```

No body. Response `200 OK`, `EntityResponse<false>`.

#### 5.2.4 Permission gate
`ArchiveImages` — but in the Guardian's `PermissionsAuthorisationProvider`, `ArchiveImages => true` for **all users**. Effectively no gate.

Source: `EditsController.scala:91-107`, `PermissionsAuthorisationProvider.scala:57-58`.

#### 5.2.5 Eventual consistency
Same Kinesis chain as labels. Kupua must refetch.

---

### 5.3 Metadata edit

#### 5.3.1 Discovery
Link `edits` on image: `${metadataUri}/metadata/{id}`. Or action `set-from-usage-rights` on `userMetadata.data.metadata.actions`.

#### 5.3.2 Set metadata
```
PUT /metadata/{id}/metadata
Host: media-metadata.{domainRoot}
Content-Type: application/json
Cookie: <panda-auth-cookie>

{ "data": { ...ImageMetadata fields... } }
```

Body wraps a partial or full `ImageMetadata` in `{ "data": ... }`. Only non-null fields are written to DynamoDB (absent fields are not cleared). Response: `200 OK`, `EntityResponse<ImageMetadata>`.

#### 5.3.3 Permission gate
`EditMetadata` permission **OR** user is the image uploader. Checked via `authorisedForEditMetadataOrUploader(id)`.

Source: `EditsController.scala:152-187`.

#### 5.3.4 Eventual consistency
Same Kinesis chain.

#### 5.3.5 Idempotency
Idempotent for same values.

---

### 5.4 Usage rights edit

#### 5.4.1 Discovery
`${metadataUri}/metadata/{id}/usage-rights`

#### 5.4.2 Set
```
PUT /metadata/{id}/usage-rights
Content-Type: application/json

{ "data": { "category": "...", ...UsageRights fields... } }
```

Response: `200 OK`, `EntityResponse<UsageRights>`.

#### 5.4.3 Delete
```
DELETE /metadata/{id}/usage-rights
```
Returns `202 Accepted`.

#### 5.4.4 Permission gate
`auth.async` only — **no extra permission check**. Any authenticated user can set usage rights.

Source: `EditsController.scala:208-232`.

---

### 5.5 Lease add

#### 5.5.1 Discovery
Action `add-lease` on image: `POST ${leasesUri}/leases`.

#### 5.5.2 Request
```
POST /leases
Host: media-leases.{domainRoot}
Content-Type: application/json
Cookie: <panda-auth-cookie>

{ ...MediaLease fields... }
```

Body is a **bare `MediaLease`** (not wrapped in `{ "data": ... }`).

Required fields: `mediaId` (string), `access` (lease type string), `notes?`, `startDate?`, `endDate?`.

Response: `202 Accepted` (empty body).

#### 5.5.3 Permission gate
`auth.async` only — no extra permission check. `leasedBy` is set from `Authentication.getIdentity(request.user)`.

Source: `MediaLeaseController.scala:99-108`.

#### 5.5.4 Side effects
If `access == "allow-syndication"`, adding it **replaces** all existing non-syndication leases. `allowSyndicationLease` replaces itself. Source: `MediaLeaseController.scala:57-67`.

#### 5.5.5 Eventual consistency
Lease notifications via `LeaseNotifier` which publishes to Kinesis → Thrall → ES.

---

### 5.6 Lease add-multiple

#### 5.6.1 Discovery
Action `add-leases`: `POST ${leasesUri}/leases/media/{id}`.

#### 5.6.2 Request
```
POST /leases/media/{id}
Content-Type: application/json

[ { ...MediaLease... }, ... ]
```

Body is a **bare JSON array** of `MediaLease` objects (not wrapped).

Response: `202 Accepted`.

Source: `MediaLeaseController.scala:109-117`.

---

### 5.7 Replace all leases

#### 5.7.1 Discovery
Action `replace-leases`: `PUT ${leasesUri}/leases/media/{id}`.

#### 5.7.2 Request
```
PUT /leases/media/{id}
Content-Type: application/json

[ { ...MediaLease... }, ... ]
```

Clears all existing leases for the image, then adds the provided list. Validates at most 1 syndication lease.

Response: `202 Accepted` (or `400 Bad Request` with `errorKey: "validation-error"` if >1 syndication lease).

Source: `MediaLeaseController.scala:119-130`.

---

### 5.8 Delete all leases

#### 5.8.1 Discovery
Action `delete-leases`: `DELETE ${leasesUri}/leases/media/{id}`.

#### 5.8.2 Request
```
DELETE /leases/media/{id}
Cookie: <panda-auth-cookie>
```

Response: `202 Accepted`.

Source: `leases/conf/routes`, `MediaLeaseController.scala`.

---

### 5.9 Delete single lease

```
DELETE /leases/{leaseId}
Cookie: <panda-auth-cookie>
```

Response: `202 Accepted`. Source: `leases/conf/routes`.

---

### 5.10 Crop create

#### 5.10.1 Discovery
Action `crops` link on image: `${cropperUri}/crops/{id}` (GET, not POST). The POST endpoint for creation is **`POST /crops`** on the cropper service — not on the per-image URL.

**Important:** The crop creation URL is **not an action on the image** — it's the base `/crops` endpoint. The implementing agent must use the cropper base URI discovered from the HATEOAS root link `cropper`.

#### 5.10.2 Request
```
POST /crops
Host: cropper.media.{domainRoot}
Content-Type: application/json
Cookie: <panda-auth-cookie>

{
  "source": "<media-api URI of image, e.g. https://api.media.{domain}/images/{id}>",
  "type": "crop",
  "x": 10,
  "y": 20,
  "width": 300,
  "height": 200,
  "aspectRatio": "5:3"
}
```

OR for a full export:

```json
{
  "source": "<media-api URI>",
  "type": "full"
}
```

`aspectRatio`: optional string matching `\d+:\d+`.

#### 5.10.3 Response (success)
```
HTTP/1.1 200 OK
Content-Type: application/vnd.argo+json
```

**Bare `Crop` JSON** (NOT wrapped in `EntityResponse`):

```json
{
  "id": "10_20_300_200",
  "author": "user@guardian.co.uk",
  "date": "...",
  "specification": { "uri": "...", "bounds": {...}, "aspectRatio": "5:3", "type": "crop" },
  "master": { ...Asset... },
  "assets": [ ...Asset[]... ]
}
```

Source: `CropperController.scala:73-76`. Note: `Ok(cropJson).as(ArgoMediaType)` — the content-type is `application/vnd.argo+json` but the body is NOT wrapped in an `EntityResponse`.

#### 5.10.4 Permission gate
`auth.async` only (no explicit permission check on the controller action). However, the cropper fetches the source image via an authenticated call to media-api, so the user must be able to read the image.

#### 5.10.5 Errors

| Status | `errorKey` | Cause |
|---|---|---|
| 400 | `invalid-source` | URI not a media API URI |
| 400 | `image-not-found` | Image not found via media-api |
| 400 | `invalid-image` | Image could not be processed |
| 400 | `no-source-image` | Missing secure URL on the image |
| 400 | `invalid-crop` | Crop bounds invalid |
| 502 | `api-failed` | media-api request failed |

Source: `CropperController.scala:78-98`.

#### 5.10.6 Eventual consistency
Crop is stored in S3 and update published via Kinesis. The image's `exports` array in ES will not be updated until Thrall processes the message.

#### 5.10.7 Idempotency
Not idempotent. Crop ID is derived from bounds `{x}_{y}_{width}_{height}`. Re-posting same bounds re-runs the crop.

---

### 5.11 Delete image (soft)

#### 5.11.1 Discovery
Action `delete` on image — present only when `canBeDeleted && withDeleteImagePermission`.

#### 5.11.2 Request
```
DELETE /images/{id}
Host: api.media.{domainRoot}
Cookie: <panda-auth-cookie>
```

Response: `202 Accepted`.

#### 5.11.3 Condition
`canBeDeleted == !hasExports && !hasUsages` (`Image.scala:38`). Returns `405 MethodNotAllowed / cannot-delete` when the image has exports or has usages — regardless of `persisted` state. The server error message says "Cannot delete persisted images", which is misleading; the actual check is the `canBeDeleted` flag. See §5.16 and §6.7.2 for the `persisted` / `canBeDeleted` distinction.

#### 5.11.4 Permission gate
User must be the uploader **OR** have `DeleteImage` permission.

Source: `MediaApi.scala:344-376`.

#### 5.11.5 Eventual consistency
Publishes `SoftDeleteImage` message to Kinesis.

---

### 5.12 Add to collection

#### 5.12.1 Discovery
Action `add-collection` on image: `POST ${collectionsUri}/images/{id}`.

#### 5.12.2 Request
```
POST /images/{imageId}
Host: media-collections.{domainRoot}
Content-Type: application/json
Cookie: <panda-auth-cookie>

{ "data": ["path", "component", "list"] }
```

Response: `200 OK`, `EntityResponse<Collection>`.

#### 5.12.3 Permission gate
`auth.async` only — no permission check. Any authenticated user.

Source: `ImageCollectionsController.scala:37-47`.

---

### 5.13 Remove from collection

#### 5.13.1 Discovery
Action `remove` inside `image.collections[n].actions`: `DELETE ${collectionsUri}/images/{imageId}/{path}`.

#### 5.13.2 Request
```
DELETE /images/{imageId}/{collectionPathString}
Host: media-collections.{domainRoot}
Cookie: <panda-auth-cookie>
```

The `{collectionPathString}` is the collection path as URL-encoded string (slash-separated, then URI-encoded with `+` as space, source: `UriOps.encodePlus`).

Response: `200 OK`, `EntityResponse<Collection[]>`.

Source: `ImageCollectionsController.scala:50-67`.

---

### 5.14 Syndication

#### 5.14.1 Discovery
Link `syndicate-image` in HATEOAS root: `POST ${rootUri}/images/{id}/{partnerName}/{startPending}/syndicateImage`.

#### 5.14.2 Request
```
POST /images/{id}/{partnerName}/{startPending}/syndicateImage
Host: api.media.{domainRoot}
Cookie: <panda-auth-cookie>
```

`startPending`: `"true"` or `"false"` string in path.

Response: `200 OK` (no body).

#### 5.14.3 Side effects
Records a syndication usage via `POST ${usageUri}/usages/syndication`.

**Note:** `postToUsages(...)` is called fire-and-forget inside `syndicateImage` — its `Future` is discarded. If the POST to the usage service fails, the caller receives 200 with no indication that usage recording was skipped.

Source: `MediaApi.scala:445-462`.

---

### 5.15 Delete usages

#### 5.15.1 Discovery
Action `delete-usages` on image: `DELETE ${usageUri}/usages/media/{id}`.

#### 5.15.2 Request
```
DELETE /usages/media/{mediaId}
Host: media-usage.{domainRoot}
Cookie: <panda-auth-cookie>
```

Response: `200 OK` (usage API responds with standard `respond` call).

#### 5.15.3 Permission gate
`DeleteCropsOrUsages` permission.

Source: `UsageApi.scala`, `usage/conf/routes`.

---

### 5.16 Async / consistency table

For each write endpoint, what is committed by the time the HTTP response returns and when ES reflects the change.

**"DynamoDB ✓"** = the write to the primary datastore has completed before the response.
**"DynamoDB ✗ fire-and-forget"** = the write is started but not awaited; response returns before the write is guaranteed.
**"ES catch-up"** = Kinesis → Thrall → Elasticsearch (no documented SLO; typically sub-second in healthy state).

| Endpoint | HTTP status | DynamoDB by response? | ES catch-up |
|---|---|---|---|
| `POST /metadata/{id}/labels` | 200 | ✓ committed | Kinesis → Thrall → ES |
| `DELETE /metadata/{id}/labels/{label}` | 200 | ✓ committed | Kinesis → Thrall → ES |
| `PUT /metadata/{id}/archived` | 200 | ✓ committed | Kinesis → Thrall → ES |
| `DELETE /metadata/{id}/archived` | 200 | ✓ committed | Kinesis → Thrall → ES |
| `PUT /metadata/{id}/metadata` | 200 | ✓ committed | Kinesis → Thrall → ES |
| `POST /metadata/{id}/metadata/set-from-usage-rights` | 200 | ✓ committed | Kinesis → Thrall → ES |
| `PUT /metadata/{id}/usage-rights` | 200 | ✓ committed | Kinesis → Thrall → ES |
| `DELETE /metadata/{id}/usage-rights` | 202 | ✓ committed | Kinesis → Thrall → ES |
| `PUT /metadata/{id}/photoshoot` | 200 | ✓ committed | Kinesis → Thrall → ES |
| `DELETE /metadata/{id}/photoshoot` | 202 | ✓ committed | Kinesis → Thrall → ES |
| `POST /leases` | 202 | ✓ committed | Kinesis → Thrall → ES |
| `POST /leases/media/{id}` | 202 | ✓ committed (`.map(_ => Accepted)`) | Kinesis → Thrall → ES |
| `PUT /leases/media/{id}` | 202 | **✗ fire-and-forget** — `replaceLeases` Future discarded (§8 item 10) | ES update only after write eventually completes |
| `DELETE /leases/media/{id}` | 202 | ✓ committed | Kinesis → Thrall → ES |
| `DELETE /leases/{leaseId}` | 202 | ✓ committed | Kinesis → Thrall → ES |
| `POST /crops` | 200 | ✓ S3 write + Kinesis publish committed | Kinesis → Thrall → ES |
| `DELETE /crops/{id}` | 202 | ✓ S3 delete committed | Kinesis → Thrall → ES |
| `DELETE /images/{id}` (soft-delete) | 202 | **✗ fire-and-forget** — `setStatus` Future discarded (§8 item 12) | ES update only after write eventually completes |
| `PUT /images/{id}/undelete` | 202 | ✓ committed (`flatMap` + `.map { _ => Accepted }`) | Kinesis → Thrall → ES |
| `DELETE /images/{id}/hard-delete` | 202 | N/A (no DynamoDB write; Kinesis message published synchronously) | Kinesis → Thrall → ES |
| `POST /images/{imageId}` (collection add) | 200 | ✓ committed | Kinesis → Thrall → ES |
| `DELETE /images/{imageId}/{collectionPath}` | 200 | ✓ committed | Kinesis → Thrall → ES |
| `POST /images/{id}/{partner}/{pending}/syndicateImage` | 200 | **✗ fire-and-forget** — inner POST to usage service discarded (§5.14.3) | Usage service records asynchronously |
| `DELETE /usages/media/{id}` | 200 | **✗ fire-and-forget** — query + deletes discarded (§8 item 11) | ES update only after deletes eventually complete |

**The four fire-and-forget writes (dangerous):**
1. `PUT /leases/media/{id}` — replace all leases
2. `DELETE /images/{id}` — soft-delete
3. `DELETE /usages/media/{id}` — delete all usages
4. `POST /images/{id}/.../syndicateImage` — usage recording side-effect

---

## Section 6 — Cross-cutting concerns

### 6.1 Argo / EmbeddedEntity rules

**Core type** (see §9 for TypeScript):

```typescript
interface EmbeddedEntity<T> {
  uri: string;           // absolute URL — the canonical URL for this resource
  data?: T;             // absent when resource is link-only (e.g. fileMetadata without ?include)
  links?: Link[];       // absent when empty
  actions?: Action[];   // absent when empty
}
```

Source: `EmbeddedEntity.scala`. The `someListOrNone` helper writes `null` for empty lists, and Play's `writeNullable` omits the key entirely.

**When data is inlined vs link-only:**

| Field | Behaviour |
|---|---|
| `image.usages` | Always inlined (`data` present, contains `EmbeddedEntity<Usage>[]` — each element is `EmbeddedEntity<Usage>`; access individual usages via `image.usages.data[n].data`) |
| `image.leases` | Always inlined (`data` present, contains `LeasesByMedia`) |
| `image.collections[n]` | Always inlined (`data` present, contains `CollectionResponse`) |
| `image.userMetadata` | Always inlined (deeply nested — see below) |
| `image.fileMetadata` | `data` absent unless `?include=fileMetadata` |
| `image.exports[n]` | Bare `Export[]`, not EmbeddedEntity |

**Empty arrays are present, not absent.** `collections`, `exports`, `usages.data`, and `labels.data` are all `[]` when empty — the keys are never absent. Contrast: the standalone `GET /usages/media/{id}` endpoint returns 404 on zero usages, but the inlined `image.usages.data` is always an array.

**Export/crop `asset.secureUrl` values are unsigned CDN URLs** (no query string, stable, do not expire) — same as `thumbnail.secureUrl`. `source.secureUrl` is signed S3 and expires.

**Deep nesting example — `userMetadata`:**

`image.userMetadata` is `EmbeddedEntity<EditsEntity>` where `EditsEntity` has each sub-field as its own `EmbeddedEntity`:

```json
{
  "uri": "https://media-metadata.../metadata/{id}",
  "data": {
    "archived": {
      "uri": "https://media-metadata.../metadata/{id}/archived",
      "data": false
    },
    "labels": {
      "uri": "https://media-metadata.../metadata/{id}/labels",
      "data": [
        { "uri": "https://media-metadata.../metadata/{id}/labels/sport", "data": "sport" }
      ]
    },
    "metadata": {
      "uri": "https://media-metadata.../metadata/{id}/metadata",
      "data": { ...ImageMetadata... },
      "actions": [
        { "name": "set-from-usage-rights", "href": "...", "method": "POST" }
      ]
    },
    "usageRights": {
      "uri": "https://media-metadata.../metadata/{id}/usage-rights",
      "data": { ...UsageRights... }  // absent if no override
    },
    "photoshoot": {
      "uri": "https://media-metadata.../metadata/{id}/photoshoot",
      "data": { "title": "..." }  // absent if not set
    }
  }
}
```

Source: `Edits.scala:65-90`, `ImageResponse.scala:246-249`.

**How kupua should consume EmbeddedEntity:**

One generic helper: `unwrap<T>(e: EmbeddedEntity<T>): T | null => e.data ?? null`. For deeply-nested structures like `userMetadata`, access fields via `image.userMetadata.data?.archived.data`, `image.userMetadata.data?.labels.data`, etc.

**`EntityResponse` vs `EmbeddedEntity`:** Top-level responses use `EntityResponse` (same fields: `uri?`, `data`, `links?`, `actions?`). Sub-resources use `EmbeddedEntity`. The shapes are identical; the difference is semantic.

---

### 6.2 Auth

**Mechanism:** Pan-domain authentication (panda) — a Guardian-internal OAuth2 + cookie system.

**Cookie name:** `gutoolsAuth-assym`. The `-assym` suffix indicates the asymmetric-key variant of panda auth. Confirmed live: observed in DevTools on `media.local.dev-gutools.co.uk` (see §6.6).

**Cookie domain:** Set by panda for `.{domainRoot}`. In dev: `.local.dev-gutools.co.uk`. The cookie is automatically sent to all `*.local.dev-gutools.co.uk` subdomains, which includes both `api.media.local.dev-gutools.co.uk` and `media.local.dev-gutools.co.uk` (kahuna). Source: pan-domain library default behaviour.

**401 behaviour:** Returns JSON, does **not** redirect. Response: `{ "errorKey": "authentication-failure", "errorMessage": "Authentication failure", "links": [{"rel": "login", "href": "<login URL>"}] }`. Source: `Authentication.scala:31-34`.

**419 behaviour:** Custom status 419 for expired-but-present cookie (distinct from 401 for absent cookie). `errorKey: "authentication-expired"`. Source: `Authentication.scala:38-41`.

**Session expiry vs no permission:**
- 401 = no cookie or invalid cookie
- 419 = cookie present but expired (grace period elapsed)
- 403 = cookie valid, user not authorised for specific operation

The `gracePeriodCountsAsAuthenticated = true` in `invokeBlock` means requests during the grace period (24h) are treated as authenticated. Source: `Authentication.scala:79`, `PandaAuthenticationProvider.scala:35`.

---

### 6.3 CORS

**Configuration key:** `security.cors.allowedOrigins` (string set). Source: `CommonConfig.scala:83`.

**How origins are allowed:** `corsAllowedDomains = corsAllowedOrigins.map(baseUri) + kahunaBaseUri + apiBaseUri + thrallBaseUri`. The `baseUri` function adds the `https://` scheme. Source: `Services.scala:84`.

**Runtime config:** The actual values of `security.cors.allowedOrigins` in dev/TEST/PROD live in the (private) S3 config bucket — not in the repo. The defaults are not set in `application.conf`.

**Is `kupua.media.local.dev-gutools.co.uk` covered?** No. The CORS allowlist is explicit; wildcard subdomain matching is not used. Kupua's origin would need to be added to the dev `security.cors.allowedOrigins` config. This is a Phase 0 blocker. Source: `GridComponents.scala:41-43`.

**CORS filter applies to all services** via `GridComponents`. All Grid microservices share the same CORS logic.

---

### 6.4 Permissions catalogue

| Permission | Scala name | Guardian impl | What it gates |
|---|---|---|---|
| `GridAccess` | `Permissions.GridAccess` | Checks `permissions.json` in S3 | Basic access to Grid at all |
| `EditMetadata` | `Permissions.EditMetadata` | Checks `permissions.json` | `PUT /metadata/{id}/metadata`, `POST /metadata/{id}/metadata/set-from-usage-rights` (only these two require `EditMetadata` or uploader-match; all other metadata-editor write endpoints — usage-rights, photoshoot, syndication — use `auth.async` only, see §5.4.4) |
| `DeleteImage` | `Permissions.DeleteImage` | Checks `permissions.json` | `DELETE /images/{id}` (along with being the uploader) |
| `DeleteCropsOrUsages` | `Permissions.DeleteCropsOrUsages` | Checks `permissions.json` | `DELETE /usages/media/{id}`, `DELETE /crops/{id}` (crops action shown on image) |
| `UploadImages` | `Permissions.UploadImages` | **Always `true`** | Conditional root link `loader` |
| `ArchiveImages` | `Permissions.ArchiveImages` | **Always `true`** | `PUT/DELETE /metadata/{id}/archived` (effectively no gate) |

**"Always true" means:** The `PermissionsAuthorisationProvider` hard-codes `UploadImages => true` and `ArchiveImages => true` for all users. The `Authorisation` code still gates the endpoint, but the check always passes.

Source: `PermissionsAuthorisationProvider.scala:57-63`, `Permissions.scala`.

**Uploader rule:** `isUploaderOrHasPermission` — for `EditMetadata` and `DeleteImage`, a user can act if they uploaded the image even without the explicit permission. Source: `Authorisation.scala:63-73`.

---

### 6.5 Error response standard

All errors return `application/vnd.argo+json`.

**Shape:**
```typescript
interface ArgoErrorResponse {
  errorKey: string;
  errorMessage: string;
  data: null;           // always null; key present
  links?: Link[];       // may include "login" link on auth errors
}
```

**Known `errorKey` values kupua will encounter:**

| `errorKey` | HTTP status | Source |
|---|---|---|
| `authentication-failure` | 401 | `Authentication.scala:32` |
| `authentication-expired` | 419 | `Authentication.scala:39` |
| `principal-not-authorised` | 403 | `Authentication.scala:36`, `Authorisation.scala` |
| `permission-denied` | 403 | `Authorisation.scala:12` |
| `image-not-found` | 404 | `MediaApi.scala:128` |
| `not-found` | 404 | `ArgoHelpers.scala:55` (generic) |
| `cannot-delete` | 405 | `MediaApi.scala:127` |
| `delete-not-allowed` | 403 | `MediaApi.scala:129` |
| `edit-not-allowed` | 403 | `MediaApi.scala:130` |
| `invalid-source` | 400 | `CropperController.scala:82` |
| `image-not-found` | 400 | `CropperController.scala:85` (note: 400 not 404 from cropper) |
| `invalid-image` | 400 | `CropperController.scala:87` |
| `no-source-image` | 400 | `CropperController.scala:90` |
| `invalid-crop` | 400 | `CropperController.scala:93` |
| `bad-request` | 400 | `CropperController.scala`, `recoverTotal` — body parse failure (distinct from domain errors above) |
| `api-failed` | 502 | `CropperController.scala:96` |
| `media-leases-parse-failed` | 400 | `MediaLeaseController.scala:52` |
| `validation-error` | 400 | `MediaLeaseController.scala` (>1 syndication lease) |
| `invalid-form-data` | 400 | Various `EditsController` handlers |
| `item-not-found` | 404 | `EditsController.scala` |

Source: varies — cited per entry.

---

## Section 6.6 — Verified live values

Produced: 2026-04-29. Method: `curl` against local Grid dev stack (`--use-TEST` mode) — read-only GETs and OPTIONS preflights only. No writes, no PROD/CODE access.

| # | Question | Answer | Cluster | Source |
|---|---|---|---|---|
| 7.1 | Panda cookie name | `gutoolsAuth-assym` (the `-assym` suffix indicates the asymmetric-key variant) | local/dev | DevTools → Application → Cookies on `media.local.dev-gutools.co.uk` |
| 7.1 | `PLAY_SESSION` `Set-Cookie` attributes | `SameSite=Lax; Path=/; Domain=api.media.test.dev-gutools.co.uk; Secure` | local/dev (`--use-TEST` mode) | `curl -si … GET /` response headers |
| 7.2 | `security.cors.allowedOrigins` for local media-api | Does **not** include `kupua.media.local.dev-gutools.co.uk` | local/dev | OPTIONS preflight → 403 |
| 7.3 | Kupua origin in CORS allowlist? | **No** — both local media-api and TEST metadata-editor return `403 Forbidden` (`Vary: Origin`, no `Access-Control-Allow-Origin`) | local/dev + TEST | `curl -X OPTIONS -H "Origin: https://kupua.media.local.dev-gutools.co.uk"` |
| 7.4 | mk's effective permissions | `showPaid: false`, `canUpload: true`, `canDelete: true` | local/dev | `GET /session` on auth service |
| 7.7 | `config.restrictDownload` in dev | **Not restricted** — both `download` and `downloadOptimised` links present | local/dev | `GET /images/{id}` → links array |

### Additional observed facts (live)

#### ⚠️ Mixed-origin service URLs in `--use-TEST` mode (kupua-side adapter implication)

The HATEOAS root, when called against a **local** media-api running with `--use-TEST`, returns `api.media.local.dev-gutools.co.uk` for media-api itself but `*.test.dev-gutools.co.uk` hosts for cropper, metadata-editor, leases, collections, usage, loader, and imgops. Kupua in this mode talks to **two different domain roots within a single image's response**.

**Scope of this finding:**
- **Local Grid + `--use-TEST` mode:** confirmed mixed-origin (this is the recommended dev setup because it gives kupua access to TEST images, see workplan "Setup B").
- **Local Grid without `--use-TEST`:** all hosts will be `*.local.dev-gutools.co.uk` — single origin. Not affected.
- **Kupua talking directly to deployed TEST/CODE/PROD:** all hosts uniform within an environment. Not affected.

**Kupua adapter implications (matter even though most users will hit the single-origin cases too):**
1. **Never derive a base URI from the HATEOAS root and reuse it for non-root endpoints.** The contract previously suggested "strip RFC 6570 template variables to get base URIs for services" — that's safe only in single-origin environments. The robust pattern is: for every image-scoped operation, take the URL from the image response's `links` / `actions` arrays directly. The service-discovery map should hold per-`rel` hosts, not a single derived base.
2. **CORS allowlist additions are required on both** the local media-api config and on each TEST satellite service config (metadata-editor, cropper, leases, collections, usage). One-stop CORS fixing won't work in `--use-TEST`.
3. **Cookie scope must cover both domain roots** for `--use-TEST` to work end-to-end — see the `PLAY_SESSION` domain note below.

**`PLAY_SESSION` domain mismatch:**
Local media-api sets `Domain=api.media.test.dev-gutools.co.uk` on the `PLAY_SESSION` cookie (TEST domain, not local). This is because local media-api uses `domainRoot = test.dev-gutools.co.uk` in `--use-TEST` mode.

**CORS positive control:**
`OPTIONS` preflight with `Origin: https://media.local.dev-gutools.co.uk` (kahuna) returned 200 with `Access-Control-Allow-Origin`, `Access-Control-Allow-Credentials: true`, `Access-Control-Max-Age: 3600`. CORS enforcement is working; the 403 on kupua's origin is a real allowlist miss.

**`GET /permissions` is a dead link (§8 item 9 addendum):**
The HATEOAS root links to `${rootUri}/permissions`, but no matching route exists in media-api. Returns `404 Action Not Found`. Actual permissions are at `GET /session` on the **auth service** (`media-auth.{domainRoot}/session`) — the `data.user.permissions` object contains `showPaid`, `canUpload`, `canDelete`. Use `GET /session` for user permissions; do not call `GET /permissions`.

**Image structure verified:**
`GET /images/{id}` returned 200 with all five `userMetadata.data` sub-fields present (`archived`, `labels`, `metadata`, `usageRights`, `photoshoot`). Full `actions` array including `delete`, `reindex`, `add-lease`, `add-leases`, `replace-leases`, `delete-leases`, `delete-usages`, `add-collection` — matching §3.3 exactly.

### CORS workplan note

The Phase 0 CORS step remains a **hard blocker**. Required actions:
1. Add `kupua.media.local.dev-gutools.co.uk` to `security.cors.allowedOrigins` in the **local** media-api S3 config bucket.
2. Add it to each **TEST** satellite service config bucket (metadata-editor, cropper, leases, collections, usage) — since `--use-TEST` mode routes to `*.test.dev-gutools.co.uk` for those services.

Once kupua's origin is added, `Access-Control-Allow-Credentials: true` is already handled by the framework (confirmed via kahuna positive control), so cookies will be forwarded correctly.

---

## Section 6.7 — Server-computed fields

The following fields in the image response are computed by media-api at request time and are not stored in Elasticsearch:

| Field | Source | Derivation |
|---|---|---|
| `cost` | `usageRights` (merged) + `userMetadata.usageRights` (raw) | `CostCalculator.getCost(usageRights)` — priority: restrictions → category defaultCost → supplier logic → default `pay`. Re-merge fallback for stale records; see §3.2.1.3. |
| `valid` | `image.usageRights`, `image.metadata`, `image.leases`, caller's write permission | `ImageExtras.isValid(validityMap)` — all validity checks pass (accounting for lease/permission overrides). See §6.7.1. |
| `invalidReasons` | same as `valid` | `ImageExtras.invalidReasons(validityMap)` — map of failing check ID → human description. Empty `{}` when `valid == true`, but **`valid` and `invalidReasons` can both be non-empty simultaneously** — `valid` is recomputed after lease overrides; `invalidReasons` records the underlying reason a lease was needed. Do not use `invalidReasons` as a proxy for `!valid`. |
| `persisted.value` | `image.*` (multiple fields) | `imagePersistenceReasons(image).nonEmpty`. See §6.7.2. |
| `persisted.reasons` | same | `List[String]` of matching reason codes. |
| `syndicationStatus` | `image.syndicationRights`, `image.usages`, `image.leases` | Computed property on `Image` model. See §6.7.3. |

### 6.7.1 — Validity checks

Source: `ImageExtras.scala`, `validationMap`.

| Check ID | Invalid when | Overrideable by |
|---|---|---|
| `no_rights` | `usageRights == NoRights` | allow-lease or write permission |
| `paid_image` | `cost == pay` | allow-lease or write permission |
| `over_quota` | agency quota exceeded | allow-lease or write permission |
| `conditional_paid` | `cost == conditional` | allow-lease or write permission |
| `current_deny_lease` | active deny-use lease exists | allow-lease or write permission |
| `tass_agency_image` | `metadata.source == "TASS"` OR `originalMetadata.byline == "ITAR-TASS News Agency"` | Always overridden (warning only) |
| `missing_credit` | `metadata.credit` absent | **Not overrideable** — always produces `valid == false` |
| `missing_description` | `metadata.description` absent | **Not overrideable** — always produces `valid == false` |

`customUsageRestrictions` (from config) can force `conditional_paid` even when the cost calculation would not.

### 6.7.2 — Persistence reasons

Source: `ImagePersistenceReasons.scala`. Full reason string list:

| Reason string | Condition |
|---|---|
| `"persistence-identifier"` | `image.identifiers` contains a configured persistence identifier key |
| `"exports"` | `image.hasExports` |
| `"usages"` | `image.hasUsages` |
| `"archived"` | `userMetadata.archived == true` |
| `"photographer-category"` | `usageRights` is a `Photographer` subtype |
| `"illustrator-category"` | `usageRights` is an `Illustrator` subtype |
| `"agency-commissioned-category"` | `usageRights` is `CommissionedAgency` |
| `"leases"` | `image.leases.leases.nonEmpty` |
| `"persisted-collection"` | image is in any collection (or configured subset) |
| `"photoshoot"` | `userMetadata.photoshoot` is defined |
| `"labeled"` | `userMetadata.labels.nonEmpty` |
| `"edited"` | `userMetadata.metadata != ImageMetadata.empty` |

Note: a recent commit adds `"derivative-of-media-ids"` and `"replaces-me"` — may appear on the wire. Persistence uses the **merged** `usageRights`, not original.

**`persisted` and `canBeDeleted` are fully independent.** `canBeDeleted == !hasExports && !hasUsages` — leases are irrelevant to it. An image can be simultaneously persisted (e.g., reason `"leases"`) and deletable (`canBeDeleted == true`). Do **not** use `persisted.value` as a proxy for "undeletable". Use the presence of the `delete` action in the response.

### 6.7.3 — syndicationStatus derivation

Source: `Image.scala`, `syndicationStatus` computed property.

```
if !syndicationRights.exists(_.isRightsAcquired) → "unsuitable"
else if usages contains SyndicationUsage           → "sent"
else if allowSyndicationLease && !denySyndicationLease → "queued"
else if !allowSyndicationLease && denySyndicationLease → "blocked"
else                                                → "review"
```

An image with no `syndicationRights` field produces `"unsuitable"`.

---

## Section 7 — Unknowns and open questions

| # | Question | Status | Note |
|---|---|---|---|
| ~~7.1~~ | ~~Exact panda cookie name~~ | **RESOLVED** | Cookie name: `gutoolsAuth-assym`. `PLAY_SESSION` attributes also captured (see §6.6). |
| ~~7.2~~ | ~~Exact value of `security.cors.allowedOrigins` in dev~~ | **RESOLVED** | Kupua's origin is absent from both local media-api and TEST satellite configs (see §6.6). |
| ~~7.3~~ | ~~Whether kupua's dev origin needs to be added to CORS allowlist~~ | **RESOLVED** | Yes, required. Both local media-api config bucket and TEST satellite configs need updating (see §6.6 CORS workplan note). |
| ~~7.4~~ | ~~Exact permissions granted to mk's account~~ | **RESOLVED** | `showPaid: false`, `canUpload: true`, `canDelete: true`. Retrieved via `GET /session` on auth service — not `GET /permissions` which is a dead link (see §6.6). |
| 7.5 | Thrall processing lag | Unresolved — requires a write to observe | Monitor ES `lastModified` before/after a write |
| 7.6 | `Bounds` JSON shape | **RESOLVED from source** | `x`, `y`, `width`, `height` are top-level keys — confirmed by `Json.reads[Bounds]` |
| ~~7.7~~ | ~~`config.restrictDownload` value in dev~~ | **RESOLVED** | Not restricted in dev. `download` and `downloadOptimised` links both present (see §6.6). |
| 7.8 | Whether `DELETE /images/{id}` is truly soft-delete | **RESOLVED from source** | Confirmed. See `MediaApi.scala:362-406`. |

---

## Section 8 — Workplan corrections

The following are corrections or clarifications against `integration-workplan-bread-and-butter.md`:

1. **Crop creation URL.** The workplan doesn't specify the crop creation endpoint. It is `POST /crops` on the cropper service (not a per-image URL). The `crops` link on an image (`${cropperUri}/crops/{id}`) is GET-only for reading existing crops.

2. **Crop response is not standard Argo.** The `POST /crops` response is a **bare `Crop` JSON object** with `Content-Type: application/vnd.argo+json` but NOT wrapped in an `EntityResponse`. Kupua must not try to unwrap it via the standard `EntityResponse` helper. Source: `CropperController.scala:73-76`.

3. **`ArchiveImages` and `UploadImages` are always true.** The workplan's "permission gates" for these two operations are functionally no-ops in the Guardian's implementation. All authenticated users can archive and "upload" (the upload link is always present). This is a feature, not a bug — but kupua should not assume these gates are meaningful.

4. **No `actions` array at HATEOAS root.** The workplan's Section "Phase 0" implies the root response has an `actions` array. It does not — only `links`.

5. **CORS is a hard Phase 0 blocker.** The workplan notes CORS as a concern but doesn't flag it as a blocker. Based on source reading, kupua's origin is **definitely not** in the default allowlist. Adding it requires a config change to the dev S3 config bucket. This needs to happen before any API call from kupua can succeed.

6. **Label operations are not permission-gated.** The workplan implies write operations need `EditMetadata`. Label add/remove (`POST/DELETE /metadata/{id}/labels`) use only `auth.async` — no permission check. Any authenticated user can label any image.

7. **Leases `POST /leases` body format.** The `add-lease` action points to `POST /leases`. The body is a **bare `MediaLease` JSON object** — not wrapped in `{ "data": ... }`. Other metadata-editor endpoints use `(req.body \ "data").validate[...]` but the leases endpoint does `request.body.validate[MediaLease]` directly. Source: `MediaLeaseController.scala:99-108`.

8. **Collections `POST /images/{imageId}` body format.** Body must be `{ "data": ["path", "segments"] }` — the path as a JSON array, wrapped in a `data` key. Source: `ImageCollectionsController.scala:38`.

9. **`reindex` action is a dead link.** The `reindex` action (`POST /images/{id}/reindex`) is emitted for every image where `withWritePermission == true`, but **no route** matching this URL exists in `media-api/conf/routes`. Calling it returns a Play 404 "Action Not Found" (HTML, not Argo JSON). The actual "reindex" feature lives in thrall's admin UI (`POST /upsertProject` on `thrall.media.{domainRoot}`) which is a web form endpoint using thrall's own session auth — not callable by kupua. **Do not invoke or surface the `reindex` action.** Source: `ImageResponse.scala:177`, `MediaApi.scala` routes.

10. **`PUT /leases/media/{id}` is fire-and-forget at the DynamoDB level.** `MediaLeaseController.replaceLeasesForMedia` calls `replaceLeases(...)` without chaining on its result — the `Future[Unit]` is silently discarded, and `Accepted` is returned immediately before the DynamoDB clear-and-rewrite has even started. If `replaceLeases` fails, the caller receives no indication. Kupua must treat this endpoint as unreliable-delivery and read back to confirm. Contrast: `POST /leases/media/{id}` correctly chains with `.map(_ => Accepted)`. Source: `MediaLeaseController.scala:~119`.

11. **`DELETE /usages/media/{id}` discards its deletion future.** The query and per-record deletes run in the background. `Future.successful(Ok)` is returned before the query has even run. The Kinesis `DeleteUsages` message is also published before the deletions complete. Source: `UsageApi.scala:~345`.

12. **`DELETE /images/{id}` discards the DynamoDB soft-delete write.** The `.map` (not `.flatMap`) on the ES response means the DynamoDB `setStatus` call and Kinesis publish happen in a discarded inner Future. The client receives 202 before `setStatus` starts. Source: `MediaApi.scala:344-376`.

13. **§6.4 permissions table overstated `EditMetadata` gate.** Corrected in §6.4: only `PUT /metadata/{id}/metadata` and `POST /metadata/{id}/metadata/set-from-usage-rights` require `EditMetadata` or uploader-match. Usage-rights, photoshoot, and syndication endpoints use `auth.async` only. Source: `EditsController.scala`, `SyndicationController.scala`.

14. **`PUT /images/{id}/undelete` method is `PUT` (not specified in HATEOAS).** The `Link` type carries no method; the route is `PUT /images/:id/undelete`. Kupua must use `PUT`. Note: `unSoftDeleteImage` properly chains its DynamoDB future (not fire-and-forget, unlike `deleteImage`). Source: `MediaApi.scala`.

15. **`POST /crops` body parse failure uses `"bad-request"` errorKey.** When the request body cannot be deserialized as `ExportRequest`, the controller returns `respondError(BadRequest, "bad-request", errorMessage)`. This key is not listed in §5.10.5's domain error table — add it. Distinct from `"invalid-source"` (bad URI) and `"invalid-crop"` (bad bounds). Source: `CropperController.scala`, `recoverTotal`.

16. **`DELETE /metadata/{id}/usage-rights` does not cascade.** Removing usage-rights only removes that sub-resource; it does not clear photoshoot, labels, metadata, or syndication rights. Source: `EditsController.scala`.

17. **Undocumented write endpoints in metadata-editor and usage routes.** These exist but have no §5 entry in this contract:

| Endpoint | Body | Status | Gate |
|---|---|---|---|
| `PUT /metadata/{id}/photoshoot` | `{ "data": { "title": "..." } }` | 200 | `auth.async` only |
| `DELETE /metadata/{id}/photoshoot` | none | 202 | `auth.async` only |
| `GET /metadata/{id}/syndication` | — | 200 or 404 | `auth.async` only |
| `PUT /metadata/{id}/syndication` | `{ "data": { ...SyndicationRights... } }` | 200 | `auth.async` only |
| `DELETE /metadata/{id}/syndication` | none | 202 | `auth.async` only |
| `DELETE /usages/media/{mediaId}/{usageId}` | none | 200 or 404 | `DeleteCropsOrUsages` |

All photoshoot and syndication write endpoints use `auth.async` only (no `EditMetadata` check).

---

## Section 9 — TypeScript type appendix

```typescript
// TODO: imports from kupua/src/types/

// ─── Argo primitives ─────────────────────────────────────────────────────────

interface Link {
  rel: string;
  href: string; // absolute URL or RFC 6570 URI template
}

interface Action {
  name: string;
  href: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
}

interface EmbeddedEntity<T> {
  uri: string;
  data?: T;
  links?: Link[];
  actions?: Action[];
}

interface EntityResponse<T> {
  uri?: string;
  data: T;
  links?: Link[];
  actions?: Action[];
}

interface ArgoErrorResponse {
  errorKey: string;
  errorMessage: string;
  data: null;
  links?: Link[];
}

// ─── Cost ────────────────────────────────────────────────────────────────────

type Cost = 'free' | 'conditional' | 'pay' | 'overquota';

// ─── Syndication ─────────────────────────────────────────────────────────────

type SyndicationStatus = 'sent' | 'queued' | 'blocked' | 'review' | 'unsuitable';

// ─── Embedding ────────────────────────────────────────────────────────────────

interface CohereV3Embedding {
  image: number[];
}

interface CohereV4Embedding {
  image: number[];
}

interface Embedding {
  cohereEmbedEnglishV3?: CohereV3Embedding; // not currently written to ES
  cohereEmbedV4?: CohereV4Embedding;         // currently the only type written
}

// ─── Assets ──────────────────────────────────────────────────────────────────

interface Dimensions {
  width: number;
  height: number;
}

interface Asset {
  file: string;           // S3 URI (not signed)
  size?: number;
  mimeType?: string;      // e.g. "image/jpeg"
  dimensions?: Dimensions;
  secureUrl?: string;     // signed S3 or CloudFront URL — use this for display
  orientationMetadata?: unknown;
  orientedDimensions?: Dimensions;
  orientation?: string;   // "portrait" | "landscape"
}

// ─── Metadata ────────────────────────────────────────────────────────────────

interface ImageMetadata {
  dateTaken?: string;         // ISO-8601
  description?: string;
  credit?: string;
  creditUri?: string;
  byline?: string;
  bylineTitle?: string;
  title?: string;
  copyright?: string;
  suppliersReference?: string;
  source?: string;
  specialInstructions?: string;
  keywords?: string[];
  subLocation?: string;
  city?: string;
  state?: string;
  country?: string;
  subjects?: string[];
  peopleInImage?: string[];
  domainMetadata?: Record<string, Record<string, unknown>>;
  imageType?: string;
}

// ─── Usage Rights ─────────────────────────────────────────────────────────────

// UsageRights is a tagged union discriminated by `category`.
// Only the common fields are typed here — full category list in UsageRights.scala.
// An image with no rights set has usageRights == {} (empty object, not null).
interface UsageRightsBase {
  category: string;
  restrictions?: string;
  // Each concrete subtype has additional fields
}
type UsageRights = UsageRightsBase & Record<string, unknown>;
type EmptyUsageRights = Record<string, never>;

// ─── Crop / Export ───────────────────────────────────────────────────────────

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

type ExportType = 'crop' | 'full';

interface CropSpec {
  uri: string;          // media-api URI of the source image
  bounds: Bounds;
  aspectRatio?: string; // e.g. "5:3"
  type: ExportType;
  rotation?: number;
}

// Export (as it appears in image.exports) and Crop (from cropper endpoints)
// are structurally identical. Export is the image-response alias; Crop is the
// native cropper type.
interface Export {
  id?: string;
  author?: string;
  date?: string;        // ISO-8601
  specification: CropSpec;
  master?: Asset;
  assets: Asset[];
}

type Crop = Export;

// ─── Leases ──────────────────────────────────────────────────────────────────

type MediaLeaseType = 'allow-use' | 'deny-use' | 'allow-syndication' | 'deny-syndication';

interface MediaLease {
  id?: string;
  leasedBy?: string;
  startDate?: string;   // ISO-8601; absent for deny-syndication
  endDate?: string;     // ISO-8601; absent for allow-syndication
  access: MediaLeaseType;
  notes?: string;
  mediaId: string;
  createdAt: string;    // ISO-8601
  active: boolean;      // computed: within startDate/endDate window
}

interface LeasesByMedia {
  leases: MediaLease[];
  lastModified?: string; // ISO-8601; last createdAt among leases
}

// ─── Collections ─────────────────────────────────────────────────────────────

interface ActionData {
  author: string;
  date: string; // ISO-8601
}

interface CollectionResponse {
  path: string[];
  pathId: string;    // lowercase path.join("~")
  description: string;
  cssColour?: string;
  actionData: ActionData; // records who added the image to the collection and when
}

// ─── Usages ──────────────────────────────────────────────────────────────────

type UsageType =
  | 'print'
  | 'digital'
  | 'syndication'
  | 'front'
  | 'download'
  | 'child';

type UsageStatus =
  | 'pending'
  | 'published'
  | 'removed'
  | 'cancelled';

interface UsageReference {
  type: string;
  uri?: string;
  name?: string;
}

interface Usage {
  id: string;
  references: UsageReference[];
  platform: UsageType;
  media: string;
  status: UsageStatus;
  dateAdded?: string;
  dateRemoved?: string;
  lastModified: string;
  printUsageMetadata?: unknown;
  digitalUsageMetadata?: unknown;
  syndicationUsageMetadata?: unknown;
  frontUsageMetadata?: unknown;
  downloadUsageMetadata?: unknown;
  childUsageMetadata?: unknown;
}

// ─── Edits (userMetadata) ────────────────────────────────────────────────────

// As returned by GET /metadata/{id} — the flat Edits shape
interface Edits {
  archived: boolean;
  labels: string[];
  metadata: ImageMetadata;
  usageRights?: UsageRights;
  photoshoot?: { title: string };
  lastModified?: string;
}

// As inlined in image.userMetadata — each field is a nested EmbeddedEntity
interface EditsEntity {
  archived: EmbeddedEntity<boolean>;
  labels: EmbeddedEntity<EmbeddedEntity<string>[]>;
  metadata: EmbeddedEntity<ImageMetadata>;    // has action "set-from-usage-rights"
  usageRights: EmbeddedEntity<UsageRights>;  // data absent if no override
  photoshoot: EmbeddedEntity<{ title: string } | undefined>;
  lastModified?: string;
}

// ─── UploadInfo ───────────────────────────────────────────────────────────────

interface UploadInfo {
  filename?: string;
}

// ─── SoftDeletedMetadata ─────────────────────────────────────────────────────

interface SoftDeletedMetadata {
  deleteTime: string;
  deletedBy: string;
}

// ─── SyndicationRights ───────────────────────────────────────────────────────

interface SyndicationRights {
  published: string;          // ISO-8601 with timezone offset
  suppliers: Array<{
    supplierName: string;
    supplierId: string;
    prAgreement: boolean;
  }>;
  rights: Array<{
    rightCode: string;
    acquired: boolean;
    properties: Array<{
      propertyCode: string;
      expiresOn: string;      // ISO-8601 with offset
      value: string;
    }>;
  }>;
  isInferred: boolean;
}

// ─── Main image response ─────────────────────────────────────────────────────

interface ImageData {
  // Always present
  id: string;
  uploadTime: string;
  uploadedBy: string;
  identifiers: Record<string, string>;
  uploadInfo: UploadInfo;
  source: Asset;
  metadata: ImageMetadata;
  originalMetadata: ImageMetadata;
  usageRights: UsageRights | EmptyUsageRights; // {} (empty object) when no rights set
  originalUsageRights: UsageRights | EmptyUsageRights;
  exports: Export[];
  usages: EmbeddedEntity<EmbeddedEntity<Usage>[]>; // each element is EmbeddedEntity<Usage>; access via image.usages.data[n].data
  leases: EmbeddedEntity<LeasesByMedia>;
  collections: EmbeddedEntity<CollectionResponse>[];
  userMetadata: EmbeddedEntity<EditsEntity>;
  cost: Cost;
  valid: boolean;
  invalidReasons: Record<string, string>;
  persisted: { value: boolean; reasons: string[] };  // reason strings enumerated in §6.7.2
  syndicationStatus: SyndicationStatus;
  fromIndex: string;
  embedding: Embedding | null;   // always present; null when no embedding data

  // Conditionally present
  thumbnail?: Asset;
  optimisedPng?: Asset;
  softDeletedMetadata?: SoftDeletedMetadata;
  lastModified?: string;
  syndicationRights?: SyndicationRights;
  userMetadataLastModified?: string;
  fileMetadata?: EmbeddedEntity<FileMetadata>;
  aliases?: Record<string, string>;  // config-driven projection of fileMetadata; keys vary by image
}

// fileMetadata — populated only with ?include=fileMetadata
// Source: image-loader/app/lib/imaging/FileMetadataReader.scala
interface FileMetadata {
  iptc?: Record<string, string>;
  exif?: Record<string, string>;
  exifSub?: Record<string, string>;
  xmp?: Record<string, unknown>;    // values are string, string[], or array-of-arrays (XMP lang qualifiers)
  icc?: Record<string, string>;     // long TRC values truncated server-side with a "REDACTED (value longer...)" placeholder
  getty?: Record<string, string>;   // present only for Getty images
  colourModel?: string | null;
  colourModelInformation?: Record<string, string>;
}

// The full image endpoint response
type ImageResponse = EntityResponse<ImageData>;

// ─── HATEOAS root ────────────────────────────────────────────────────────────

interface RootResponse {
  data: { description: string };
  links: Link[];
}

// ─── Write request bodies ────────────────────────────────────────────────────

// POST /crops
interface CropRequest {
  source: string; // media-api URI of image, e.g. "https://api.media.{domain}/images/{id}"
  type: 'crop';
  x: number;
  y: number;
  width: number;
  height: number;
  aspectRatio?: string; // matches \d+:\d+
}

interface FullCropRequest {
  source: string;
  type: 'full';
}

// POST /leases  (bare object, NOT wrapped in {data: ...})
interface AddLeaseRequest {
  mediaId: string;
  access: MediaLeaseType;
  notes?: string;
  startDate?: string; // ISO-8601
  endDate?: string;   // ISO-8601
  // id, leasedBy, createdAt are set server-side
}

// POST/PUT /leases/media/{id}  (bare array, NOT wrapped in {data: ...})
type LeaseListRequest = AddLeaseRequest[];

// PUT /metadata/{id}/archived
interface SetArchivedRequest {
  data: boolean;
}

// POST /metadata/{id}/labels
interface AddLabelsRequest {
  data: string[];
}

// PUT /metadata/{id}/metadata
interface SetMetadataRequest {
  data: Partial<ImageMetadata>;
}

// PUT /metadata/{id}/usage-rights
interface SetUsageRightsRequest {
  data: UsageRights;
}

// POST /images/{imageId}  (add to collection)
interface AddCollectionRequest {
  data: string[]; // collection path as array of strings
}
```

---

*End of §9 (TypeScript appendix). See §10 below for annotated real response samples.*

---

## Section 10 — Annotated real response samples

**Environment:** TEST (`*.test.dev-gutools.co.uk`)  
**Date:** 2026-04-29  
**Redaction:** Signed URL query strings → `?<redacted-signature>`. User emails → `user@example.com`. Embedding vectors → `["<256-dim vector elided>"]`. Cookie value never written. S3 bucket name suffixes → `[REDACTED]`.

---

### 10.1 Richly-edited agency image (exports, usages, lease, collection, labels, photoshoot)

**Image state:** Agency image (Getty/GC Images) uploaded via SFTP. Two exports (full + 1:1 crop), one digital usage (pending, linked to a Composer article), one active `allow-use` lease, one collection ("What's On"), user-edited metadata and usage rights, photoshoot set, label added.

Key things to observe: merged-vs-original divergence in `metadata`/`originalMetadata`; deep `userMetadata` nesting; `persisted.reasons` array; `delete` action absent (image has exports and usages); `uploadedBy: "getty"` (SFTP, not email — see §3.2 table note on `uploadedBy`).

```json
{
  "data": {
    "id": "7c33986723c0fd458d1efd823e5d803cefaa9ab0",
    "uploadTime": "2026-04-29T20:01:53.922Z",
    "uploadedBy": "getty",
    "uploadInfo": { "filename": "2273750301.jpg" },
    "identifiers": {},
    "fromIndex": "images_2026-02-12_16-22-48_1e6eb09",
    "lastModified": "2026-04-29T21:51:32.933Z",
    "userMetadataLastModified": "2026-04-29T21:09:22.423Z",
    "cost": "free",
    "valid": true,
    "invalidReasons": {},
    "syndicationStatus": "unsuitable",
    "persisted": {
      "value": true,
      "reasons": ["exports", "usages", "leases", "persisted-collection", "photoshoot", "labeled", "edited"]
    },
    "embedding": ["<256-dim vector elided>"],
    "source": {
      "file": "http://media-service-test-[REDACTED].s3.amazonaws.com/7/c/3/3/9/8/7c33986723c0fd458d1efd823e5d803cefaa9ab0",
      "size": 3132503,
      "mimeType": "image/jpeg",
      "dimensions": { "width": 2062, "height": 3000 },
      "orientation": "portrait",
      "secureUrl": "https://media-service-test-[REDACTED].s3.eu-west-1.amazonaws.com/7/c/3/3/9/8/7c33986723c0fd458d1efd823e5d803cefaa9ab0?<redacted-signature>"
    },
    "thumbnail": {
      "file": "http://media-service-test-thumb[REDACTED].s3.amazonaws.com/7/c/3/3/9/8/7c33986723c0fd458d1efd823e5d803cefaa9ab0",
      "size": 12777,
      "mimeType": "image/jpeg",
      "dimensions": { "width": 176, "height": 256 },
      "orientation": "portrait",
      "secureUrl": "https://[REDACTED].cloudfront.net/7/c/3/3/9/8/7c33986723c0fd458d1efd823e5d803cefaa9ab0"
    },
    "metadata": {
      "dateTaken": "2026-04-29T03:56:56.210Z",
      "description": "NEW YORK, NEW YORK - APRIL 29: [description redacted for brevity]",
      "credit": "GC Images added",
      "byline": "Raymond Hall added",
      "bylineTitle": "Contributor",
      "title": "Celebrity Sightings In New York City - April 29, 2026",
      "copyright": "2026 Raymond Hall added",
      "suppliersReference": "2273750301",
      "source": "GC Images",
      "keywords": ["Color Image", "Vertical", "arts culture and entertainment", "added"],
      "subLocation": "added",
      "city": "New York added",
      "state": "New York added",
      "country": "United States added",
      "subjects": ["arts"],
      "peopleInImage": [": Grace Gummer", "added"]
    },
    "originalMetadata": {
      "dateTaken": "2026-04-29T03:56:56.210Z",
      "description": "NEW YORK, NEW YORK - APRIL 29: [description redacted for brevity]",
      "credit": "GC Images",
      "byline": "Raymond Hall",
      "bylineTitle": "Contributor",
      "title": "Celebrity Sightings In New York City - April 29, 2026",
      "copyright": "2026 Raymond Hall",
      "suppliersReference": "2273750301",
      "source": "GC Images",
      "keywords": ["Color Image", "Vertical", "arts culture and entertainment"],
      "city": "New York",
      "state": "New York",
      "country": "United States",
      "subjects": ["arts"],
      "peopleInImage": [": Grace Gummer"]
    },
    "usageRights": {
      "category": "agency",
      "supplier": "EPA",
      "suppliersCollection": "GC Images added"
    },
    "originalUsageRights": {
      "category": "agency",
      "supplier": "Getty Images",
      "suppliersCollection": "GC Images"
    },
    "exports": [
      {
        "id": "0_0_2062_3000",
        "author": "user@example.com",
        "date": "2026-04-29T21:47:45.006Z",
        "specification": {
          "uri": "https://api.media.test.dev-gutools.co.uk/images/7c33986723c0fd458d1efd823e5d803cefaa9ab0",
          "bounds": { "x": 0, "y": 0, "width": 2062, "height": 3000 },
          "type": "full"
        },
        "master": {
          "file": "https://[REDACTED]/7c33986723c0fd458d1efd823e5d803cefaa9ab0/0_0_2062_3000/master/2062.jpg",
          "size": 1707295, "mimeType": "image/jpeg",
          "dimensions": { "width": 2062, "height": 3000 },
          "secureUrl": "https://[REDACTED]/7c33986723c0fd458d1efd823e5d803cefaa9ab0/0_0_2062_3000/master/2062.jpg"
        },
        "assets": [
          { "file": "https://[REDACTED]/7c33986723c0fd458d1efd823e5d803cefaa9ab0/0_0_2062_3000/1375.jpg", "size": 235152, "mimeType": "image/jpeg", "dimensions": { "width": 1375, "height": 2000 }, "secureUrl": "https://[REDACTED]/7c33986723c0fd458d1efd823e5d803cefaa9ab0/0_0_2062_3000/1375.jpg" },
          { "file": "https://[REDACTED]/7c33986723c0fd458d1efd823e5d803cefaa9ab0/0_0_2062_3000/687.jpg", "size": 81870, "mimeType": "image/jpeg", "dimensions": { "width": 687, "height": 1000 }, "secureUrl": "https://[REDACTED]/7c33986723c0fd458d1efd823e5d803cefaa9ab0/0_0_2062_3000/687.jpg" },
          { "file": "https://[REDACTED]/7c33986723c0fd458d1efd823e5d803cefaa9ab0/0_0_2062_3000/344.jpg", "size": 28479, "mimeType": "image/jpeg", "dimensions": { "width": 344, "height": 500 }, "secureUrl": "https://[REDACTED]/7c33986723c0fd458d1efd823e5d803cefaa9ab0/0_0_2062_3000/344.jpg" },
          { "file": "https://[REDACTED]/7c33986723c0fd458d1efd823e5d803cefaa9ab0/0_0_2062_3000/2062.jpg", "size": 469751, "mimeType": "image/jpeg", "dimensions": { "width": 2062, "height": 3000 }, "secureUrl": "https://[REDACTED]/7c33986723c0fd458d1efd823e5d803cefaa9ab0/0_0_2062_3000/2062.jpg" }
        ]
      },
      {
        "id": "0_0_2062_2060",
        "author": "user@example.com",
        "date": "2026-04-29T21:47:55.376Z",
        "specification": {
          "uri": "https://api.media.test.dev-gutools.co.uk/images/7c33986723c0fd458d1efd823e5d803cefaa9ab0",
          "bounds": { "x": 0, "y": 0, "width": 2062, "height": 2060 },
          "aspectRatio": "1:1",
          "type": "crop"
        },
        "master": {
          "file": "https://[REDACTED]/7c33986723c0fd458d1efd823e5d803cefaa9ab0/0_0_2062_2060/master/2062.jpg",
          "size": 1252757, "mimeType": "image/jpeg",
          "dimensions": { "width": 2062, "height": 2060 },
          "secureUrl": "https://[REDACTED]/7c33986723c0fd458d1efd823e5d803cefaa9ab0/0_0_2062_2060/master/2062.jpg"
        },
        "assets": [
          { "dimensions": { "width": 2000, "height": 2000 }, "secureUrl": "https://[REDACTED]/7c33986723c0fd458d1efd823e5d803cefaa9ab0/0_0_2062_2060/2000.jpg", "size": 323083, "mimeType": "image/jpeg", "file": "https://[REDACTED]/7c33986723c0fd458d1efd823e5d803cefaa9ab0/0_0_2062_2060/2000.jpg" },
          { "dimensions": { "width": 1000, "height": 1000 }, "secureUrl": "https://[REDACTED]/7c33986723c0fd458d1efd823e5d803cefaa9ab0/0_0_2062_2060/1000.jpg", "size": 114327, "mimeType": "image/jpeg", "file": "https://[REDACTED]/7c33986723c0fd458d1efd823e5d803cefaa9ab0/0_0_2062_2060/1000.jpg" },
          { "dimensions": { "width": 500, "height": 500 }, "secureUrl": "https://[REDACTED]/7c33986723c0fd458d1efd823e5d803cefaa9ab0/0_0_2062_2060/500.jpg", "size": 40168, "mimeType": "image/jpeg", "file": "https://[REDACTED]/7c33986723c0fd458d1efd823e5d803cefaa9ab0/0_0_2062_2060/500.jpg" },
          { "dimensions": { "width": 140, "height": 140 }, "secureUrl": "https://[REDACTED]/7c33986723c0fd458d1efd823e5d803cefaa9ab0/0_0_2062_2060/140.jpg", "size": 8083, "mimeType": "image/jpeg", "file": "https://[REDACTED]/7c33986723c0fd458d1efd823e5d803cefaa9ab0/0_0_2062_2060/140.jpg" }
        ]
      }
    ],
    "usages": {
      "uri": "https://media-usage.test.dev-gutools.co.uk/usages/media/7c33986723c0fd458d1efd823e5d803cefaa9ab0",
      "data": [
        {
          "uri": "https://media-usage.test.dev-gutools.co.uk/usages/composer%2F69316c358f08e6d311dc4ea3_c1fc6d6727f1143262b15a771aa83e85",
          "data": {
            "id": "composer/69316c358f08e6d311dc4ea3_c1fc6d6727f1143262b15a771aa83e85",
            "references": [
              { "type": "frontend", "uri": "http://www.code.dev-theguardian.com/global/2026/apr/29/fafarafa", "name": "Fafarafa" },
              { "type": "composer", "uri": "https://composer.code.dev-gutools.co.uk/content/69316c358f08e6d311dc4ea3" }
            ],
            "platform": "digital",
            "media": "image",
            "status": "pending",
            "dateAdded": "2026-04-29T21:51:27.494Z",
            "lastModified": "2026-04-29T21:51:27.494Z",
            "digitalUsageMetadata": {
              "webUrl": "http://www.code.dev-theguardian.com/global/2026/apr/29/fafarafa",
              "webTitle": "Fafarafa",
              "sectionId": "global",
              "composerUrl": "https://composer.code.dev-gutools.co.uk/content/69316c358f08e6d311dc4ea3"
            }
          }
        }
      ]
    },
    "leases": {
      "uri": "https://media-leases.test.dev-gutools.co.uk/leases/media/7c33986723c0fd458d1efd823e5d803cefaa9ab0",
      "data": {
        "leases": [
          {
            "id": "fa309333-8d6f-4056-8024-05778b240de6",
            "leasedBy": "user@example.com",
            "startDate": "2026-04-29T03:56:56.210Z",
            "endDate": "2027-04-29T03:56:56.210Z",
            "access": "allow-use",
            "notes": "Test automated lease for Agency.",
            "mediaId": "7c33986723c0fd458d1efd823e5d803cefaa9ab0",
            "createdAt": "2026-04-29T21:08:13.398Z",
            "active": true
          }
        ],
        "lastModified": "2026-04-29T21:08:13.722Z"
      }
    },
    "collections": [
      {
        "uri": "https://media-collections.test.dev-gutools.co.uk/images/7c33986723c0fd458d1efd823e5d803cefaa9ab0/What%E2%80%99s%20On",
        "data": {
          "path": ["What's On"],
          "pathId": "what's on",
          "description": "What's On",
          "actionData": {
            "author": "user@example.com",
            "date": "2026-04-29T21:09:02.260+00:00"
          }
        },
        "actions": [
          { "name": "remove", "href": "https://media-collections.test.dev-gutools.co.uk/images/7c33986723c0fd458d1efd823e5d803cefaa9ab0/What%E2%80%99s%20On", "method": "DELETE" }
        ]
      }
    ],
    "userMetadata": {
      "uri": "https://media-metadata.test.dev-gutools.co.uk/metadata/7c33986723c0fd458d1efd823e5d803cefaa9ab0",
      "data": {
        "archived": {
          "uri": "https://media-metadata.test.dev-gutools.co.uk/metadata/7c33986723c0fd458d1efd823e5d803cefaa9ab0/archived",
          "data": false
        },
        "labels": {
          "uri": "https://media-metadata.test.dev-gutools.co.uk/metadata/7c33986723c0fd458d1efd823e5d803cefaa9ab0/labels",
          "data": [
            { "uri": "https://media-metadata.test.dev-gutools.co.uk/metadata/7c33986723c0fd458d1efd823e5d803cefaa9ab0/labels/added", "data": "added" }
          ]
        },
        "metadata": {
          "uri": "https://media-metadata.test.dev-gutools.co.uk/metadata/7c33986723c0fd458d1efd823e5d803cefaa9ab0/metadata",
          "data": {
            "credit": "GC Images added",
            "byline": "Raymond Hall added",
            "copyright": "2026 Raymond Hall added",
            "keywords": ["Color Image", "Vertical", "arts culture and entertainment", "added"],
            "subLocation": "added",
            "city": "New York added",
            "state": "New York added",
            "country": "United States added",
            "peopleInImage": [": Grace Gummer", "added"]
          },
          "actions": [
            { "name": "set-from-usage-rights", "href": "https://media-metadata.test.dev-gutools.co.uk/metadata/7c33986723c0fd458d1efd823e5d803cefaa9ab0/metadata/set-from-usage-rights", "method": "POST" }
          ]
        },
        "usageRights": {
          "uri": "https://media-metadata.test.dev-gutools.co.uk/metadata/7c33986723c0fd458d1efd823e5d803cefaa9ab0/usage-rights",
          "data": { "category": "agency", "supplier": "EPA", "suppliersCollection": "GC Images added" }
        },
        "photoshoot": {
          "uri": "https://media-metadata.test.dev-gutools.co.uk/metadata/7c33986723c0fd458d1efd823e5d803cefaa9ab0/photoshoot",
          "data": { "title": "added" }
        },
        "lastModified": "2026-04-29T21:09:22.423Z"
      }
    },
    "fileMetadata": {
      "uri": "https://api.media.test.dev-gutools.co.uk/images/7c33986723c0fd458d1efd823e5d803cefaa9ab0/fileMetadata"
    },
    "aliases": {
      "transmissionReference": "776424877",
      "objectName": "2273750301",
      "xmpRightsUrl": "https://www.gettyimages.com/eula?utm_medium=organic&utm_source=google&utm_campaign=iptcurl",
      "colourProfile": "sRGB IEC61966-2.1",
      "colourModel": "RGB",
      "hasAlpha": "false",
      "bitsPerSample": "8"
    }
  },
  "links": [
    { "rel": "edits", "href": "https://media-metadata.test.dev-gutools.co.uk/metadata/7c33986723c0fd458d1efd823e5d803cefaa9ab0" },
    { "rel": "crops", "href": "https://cropper.media.test.dev-gutools.co.uk/crops/7c33986723c0fd458d1efd823e5d803cefaa9ab0" },
    { "rel": "optimised", "href": "https://media-imgops.test.dev-gutools.co.uk/7/c/3/3/9/8/7c33986723c0fd458d1efd823e5d803cefaa9ab0?<redacted-signature>" },
    { "rel": "ui:image", "href": "https://media.test.dev-gutools.co.uk/images/7c33986723c0fd458d1efd823e5d803cefaa9ab0" },
    { "rel": "usages", "href": "https://media-usage.test.dev-gutools.co.uk/usages/media/7c33986723c0fd458d1efd823e5d803cefaa9ab0" },
    { "rel": "leases", "href": "https://media-leases.test.dev-gutools.co.uk/leases/media/7c33986723c0fd458d1efd823e5d803cefaa9ab0" },
    { "rel": "fileMetadata", "href": "https://api.media.test.dev-gutools.co.uk/images/7c33986723c0fd458d1efd823e5d803cefaa9ab0/fileMetadata" },
    { "rel": "loader", "href": "https://loader.media.test.dev-gutools.co.uk/images/project/7c33986723c0fd458d1efd823e5d803cefaa9ab0" },
    { "rel": "api", "href": "https://api.media.test.dev-gutools.co.uk/images/7c33986723c0fd458d1efd823e5d803cefaa9ab0/projection/diff" },
    { "rel": "download", "href": "https://api.media.test.dev-gutools.co.uk/images/7c33986723c0fd458d1efd823e5d803cefaa9ab0/download" },
    { "rel": "downloadOptimised", "href": "https://api.media.test.dev-gutools.co.uk/images/7c33986723c0fd458d1efd823e5d803cefaa9ab0/downloadOptimised?{&width,height,quality}" }
  ],
  "actions": [
    { "name": "reindex", "href": "https://api.media.test.dev-gutools.co.uk/images/7c33986723c0fd458d1efd823e5d803cefaa9ab0/reindex", "method": "POST" },
    { "name": "add-lease", "href": "https://media-leases.test.dev-gutools.co.uk/leases", "method": "POST" },
    { "name": "add-leases", "href": "https://media-leases.test.dev-gutools.co.uk/leases/media/7c33986723c0fd458d1efd823e5d803cefaa9ab0", "method": "POST" },
    { "name": "replace-leases", "href": "https://media-leases.test.dev-gutools.co.uk/leases/media/7c33986723c0fd458d1efd823e5d803cefaa9ab0", "method": "PUT" },
    { "name": "delete-leases", "href": "https://media-leases.test.dev-gutools.co.uk/leases/media/7c33986723c0fd458d1efd823e5d803cefaa9ab0", "method": "DELETE" },
    { "name": "delete-usages", "href": "https://media-usage.test.dev-gutools.co.uk/usages/media/7c33986723c0fd458d1efd823e5d803cefaa9ab0", "method": "DELETE" },
    { "name": "add-collection", "href": "https://media-collections.test.dev-gutools.co.uk/images/7c33986723c0fd458d1efd823e5d803cefaa9ab0", "method": "POST" }
  ]
}
```

**Call-outs:**
- `delete` action is absent — image has both exports and usages (`canBeDeleted == false`).
- `metadata` reflects merged result; `originalMetadata` has no `subLocation` (not in IPTC) — the user edit added it and the merged `metadata` includes it. Fields absent in the original are not backfilled to null.
- `usageRights` at top level is the merged result (EPA, user override). `originalUsageRights` is Getty Images. These are distinct objects — §3.2.1.2.
- `userMetadata.data.photoshoot.data` is `{ title: string }`. Only one field.
- `aliases` has 7 keys here — set varies per image based on config and what IPTC/XMP fields are present.

---

### 10.2 Same image with `?include=fileMetadata`

**Image state:** Identical to 10.1. Showing only the `fileMetadata.data` difference (all other fields omitted).

```json
{
  "data": {
    "fileMetadata": {
      "uri": "https://api.media.test.dev-gutools.co.uk/images/7c33986723c0fd458d1efd823e5d803cefaa9ab0/fileMetadata",
      "data": {
        "iptc": {
          "Category": "E",
          "Caption/Abstract": "[redacted for brevity — same as description]",
          "Credit": "GC Images",
          "Source": "GC Images",
          "City": "New York",
          "Keywords": "Color Image;Vertical;arts culture and entertainment",
          "Object Name": "2273750301",
          "Date Created": "2026:04:29",
          "By-line Title": "Contributor",
          "Country/Primary Location Name": "United States",
          "Country/Primary Location Code": "USA",
          "Copyright Notice": "2026 Raymond Hall",
          "Supplemental Category(s)": "ACE CEL ENT",
          "Coded Character Set": "UTF-8",
          "By-line": "Raymond Hall",
          "Urgency": "50",
          "Headline": "Celebrity Sightings In New York City - April 29, 2026",
          "Province/State": "New York",
          "Caption Writer/Editor": "XX / XX",
          "Original Transmission Reference": "776424877"
        },
        "exif": {
          "X Resolution": "300 dots per inch",
          "Software": "Adobe Photoshop Lightroom Classic 14.5.1 (Macintosh)",
          "Make": "NIKON CORPORATION",
          "Copyright": "2026 Raymond Hall",
          "Resolution Unit": "Inch",
          "Y Resolution": "300 dots per inch",
          "Date/Time": "2026:04:29 15:29:13",
          "Model": "NIKON D5"
        },
        "exifSub": {
          "Exposure Time": "1/250 sec",
          "Exposure Program": "Manual control",
          "ISO Speed Ratings": "2000",
          "Lens Model": "24.0-120.0 mm f/4.0",
          "Focal Length": "58 mm",
          "F-Number": "f/10.0",
          "Body Serial Number": "[REDACTED]",
          "Date/Time Original Composite": "2026-04-29T03:56:56.210Z",
          "Color Space": "sRGB"
        },
        "xmp": {
          "GettyImagesGIFT:ImageRank": "2",
          "dc:description": ["[description]", [{"xml:lang":"x-default"}]],
          "plus:DataMining": "http://ns.useplus.org/ldf/vocab/DMI-PROHIBITED-EXCEPTSEARCHENGINEINDEXING",
          "photoshop:AuthorsPosition": "Contributor",
          "Iptc4xmpExt:PersonInImage": [": Grace Gummer"],
          "xmpRights:WebStatement": "https://www.gettyimages.com/eula?utm_medium=organic&utm_source=google&utm_campaign=iptcurl",
          "dc:Rights": "2026 Raymond Hall",
          "dc:creator": ["Raymond Hall"],
          "GettyImagesGIFT:AssetID": "2273750301",
          "photoshop:TransmissionReference": "776424877",
          "dc:subject": ["Color Image", "Vertical", "arts culture and entertainment"]
        },
        "icc": {
          "Profile Size": "3144",
          "Profile Description": "sRGB IEC61966-2.1",
          "Red TRC": "REDACTED (value longer than 5000 characters, please refer to the metadata stored in the file itself)",
          "Primary Platform": "Microsoft Corporation",
          "Color space": "RGB",
          "Profile Connection Space": "XYZ",
          "Device model": "sRGB",
          "Version": "2.1.0"
        },
        "getty": {
          "Image Rank": "2",
          "Asset ID": "2273750301"
        },
        "colourModel": "RGB",
        "colourModelInformation": {
          "hasAlpha": "false",
          "colorType": "TrueColor",
          "bitsPerSample": "8"
        }
      }
    }
  }
}
```

**Call-outs:**
- Top-level `fileMetadata.data` keys: `iptc`, `exif`, `exifSub`, `xmp`, `icc`, `getty` (Getty images only), `colourModel`, `colourModelInformation`.
- `icc` values are human-readable strings; long TRC curves are truncated server-side with the `"REDACTED (value longer than 5000 characters...)"` placeholder — this is server behaviour, not our redaction.
- `xmp` values are highly heterogeneous: strings, arrays, arrays-of-arrays with XMP lang qualifiers. Treat as `Record<string, unknown>`.
- `?include=fileMetadata` is the only difference from 10.1. All other top-level fields are unchanged.
- `colourModelInformation` duplicates some `aliases` keys (`hasAlpha`, `bitsPerSample`). Values are strings in both places.

---

### 10.3 Image with `syndicationStatus: "blocked"` and `syndicationRights`

**Image state:** Guardian staff photo. No exports, no usages, no collections. Has a `deny-syndication` lease. Has `syndicationRights` set (blocking syndication). `cost: "pay"`. `valid: true` but `invalidReasons` non-empty (`paid_image`, `no_rights`) — the active lease overrides validity. `uploadedBy` is `"user@example.com"` (staff uploader, not SFTP).

```json
{
  "data": {
    "id": "ae6f90ce02e8b766aba7bf7cdf7f20e63b115858",
    "uploadTime": "2023-11-22T16:08:04.788Z",
    "uploadedBy": "user@example.com",
    "uploadInfo": { "filename": "_21A1552 (ae6f90ce02e8b766aba7bf7cdf7f20e63b115858).jpg" },
    "identifiers": {},
    "fromIndex": "images_2026-[REDACTED]",
    "lastModified": "2025-03-25T12:36:47.057Z",
    "userMetadataLastModified": "2023-11-22T16:11:29.760Z",
    "cost": "pay",
    "valid": true,
    "invalidReasons": {
      "paid_image": "Paid imagery requires a lease",
      "no_rights": "No rights to use this image"
    },
    "syndicationStatus": "blocked",
    "persisted": {
      "value": true,
      "reasons": ["leases", "edited"]
    },
    "embedding": ["<256-dim vector elided>"],
    "source": {
      "file": "http://media-service-test-imagebucket-[REDACTED].s3.amazonaws.com/a/e/6/f/9/0/ae6f90ce02e8b766aba7bf7cdf7f20e63b115858",
      "size": 1041507,
      "mimeType": "image/jpeg",
      "dimensions": { "width": 4134, "height": 3118 },
      "orientation": "landscape",
      "secureUrl": "https://media-service-test-imagebucket-[REDACTED].s3.eu-west-1.amazonaws.com/a/e/6/f/9/0/ae6f90ce02e8b766aba7bf7cdf7f20e63b115858?<redacted-signature>"
    },
    "thumbnail": {
      "file": "http://media-service-test-thumbbucket-[REDACTED].s3.amazonaws.com/a/e/6/f/9/0/ae6f90ce02e8b766aba7bf7cdf7f20e63b115858",
      "size": 9860,
      "mimeType": "image/jpeg",
      "dimensions": { "width": 256, "height": 193 },
      "orientation": "landscape",
      "secureUrl": "https://[REDACTED].cloudfront.net/a/e/6/f/9/0/ae6f90ce02e8b766aba7bf7cdf7f20e63b115858"
    },
    "metadata": {
      "dateTaken": "2023-07-21T11:43:21.580Z",
      "description": "Liberal MP Julian Lesser, Indigenous Leader Noel Pearson and Constitutional Lawyer Dr Shireen Morris after a discussion and questions answered on the Voice Referendum at Beecroft Community Centre, Sydney, Australia. 22 July",
      "credit": "The Guardian",
      "byline": "Jessica Hromas",
      "copyright": "The Guardian",
      "keywords": [],
      "subjects": [],
      "peopleInImage": []
    },
    "originalMetadata": {
      "dateTaken": "2023-07-21T11:43:21.580Z",
      "keywords": [],
      "subjects": [],
      "peopleInImage": []
    },
    "usageRights": {},
    "originalUsageRights": {},
    "exports": [],
    "usages": {
      "uri": "https://media-usage.test.dev-gutools.co.uk/usages/media/ae6f90ce02e8b766aba7bf7cdf7f20e63b115858",
      "data": []
    },
    "leases": {
      "uri": "https://media-leases.test.dev-gutools.co.uk/leases/media/ae6f90ce02e8b766aba7bf7cdf7f20e63b115858",
      "data": {
        "leases": [
          {
            "id": "d4935b02-dfc5-44f1-bf5d-d48cddd7a1c5",
            "leasedBy": "user@example.com",
            "access": "deny-syndication",
            "mediaId": "ae6f90ce02e8b766aba7bf7cdf7f20e63b115858",
            "createdAt": "2025-03-25T12:36:47.057Z",
            "active": true
          }
        ],
        "lastModified": "2025-03-25T12:36:47.057Z"
      }
    },
    "collections": [],
    "syndicationRights": {
      "published": "2022-01-27T00:10:00.000+00:00",
      "suppliers": [
        {
          "supplierName": "TEST SUPPLIER",
          "supplierId": "DO NOT SYNDICATE",
          "prAgreement": true
        }
      ],
      "rights": [
        {
          "rightCode": "LICENSINGNONSUBSALES",
          "acquired": true,
          "properties": [
            {
              "propertyCode": "TERM",
              "expiresOn": "1980-07-31T00:00:00.000+00:00",
              "value": "THESE ARE IGNORED"
            }
          ]
        }
      ],
      "isInferred": false
    },
    "userMetadata": {
      "uri": "https://media-metadata.test.dev-gutools.co.uk/metadata/ae6f90ce02e8b766aba7bf7cdf7f20e63b115858",
      "data": {
        "archived": {
          "uri": "https://media-metadata.test.dev-gutools.co.uk/metadata/ae6f90ce02e8b766aba7bf7cdf7f20e63b115858/archived",
          "data": false
        },
        "labels": {
          "uri": "https://media-metadata.test.dev-gutools.co.uk/metadata/ae6f90ce02e8b766aba7bf7cdf7f20e63b115858/labels",
          "data": []
        },
        "metadata": {
          "uri": "https://media-metadata.test.dev-gutools.co.uk/metadata/ae6f90ce02e8b766aba7bf7cdf7f20e63b115858/metadata",
          "data": {
            "description": "Liberal MP Julian Lesser...",
            "credit": "The Guardian",
            "byline": "Jessica Hromas",
            "copyright": "The Guardian"
          },
          "actions": [
            { "name": "set-from-usage-rights", "href": "https://media-metadata.test.dev-gutools.co.uk/metadata/ae6f90ce02e8b766aba7bf7cdf7f20e63b115858/metadata/set-from-usage-rights", "method": "POST" }
          ]
        },
        "usageRights": {
          "uri": "https://media-metadata.test.dev-gutools.co.uk/metadata/ae6f90ce02e8b766aba7bf7cdf7f20e63b115858/usage-rights"
        },
        "photoshoot": {
          "uri": "https://media-metadata.test.dev-gutools.co.uk/metadata/ae6f90ce02e8b766aba7bf7cdf7f20e63b115858/photoshoot"
        },
        "lastModified": "2023-11-22T16:11:29.760Z"
      }
    },
    "fileMetadata": {
      "uri": "https://api.media.test.dev-gutools.co.uk/images/ae6f90ce02e8b766aba7bf7cdf7f20e63b115858/fileMetadata"
    },
    "aliases": {
      "colourProfile": "Adobe RGB (1998)",
      "colourModel": "RGB",
      "hasAlpha": "false",
      "bitsPerSample": "8"
    }
  },
  "links": [
    { "rel": "edits", "href": "https://media-metadata.test.dev-gutools.co.uk/metadata/ae6f90ce02e8b766aba7bf7cdf7f20e63b115858" },
    { "rel": "crops", "href": "https://cropper.media.test.dev-gutools.co.uk/crops/ae6f90ce02e8b766aba7bf7cdf7f20e63b115858" },
    { "rel": "optimised", "href": "https://media-imgops.test.dev-gutools.co.uk/a/e/6/f/9/0/ae6f90ce02e8b766aba7bf7cdf7f20e63b115858?<redacted-signature>" },
    { "rel": "ui:image", "href": "https://media.test.dev-gutools.co.uk/images/ae6f90ce02e8b766aba7bf7cdf7f20e63b115858" },
    { "rel": "usages", "href": "https://media-usage.test.dev-gutools.co.uk/usages/media/ae6f90ce02e8b766aba7bf7cdf7f20e63b115858" },
    { "rel": "leases", "href": "https://media-leases.test.dev-gutools.co.uk/leases/media/ae6f90ce02e8b766aba7bf7cdf7f20e63b115858" },
    { "rel": "fileMetadata", "href": "https://api.media.test.dev-gutools.co.uk/images/ae6f90ce02e8b766aba7bf7cdf7f20e63b115858/fileMetadata" },
    { "rel": "loader", "href": "https://loader.media.test.dev-gutools.co.uk/images/project/ae6f90ce02e8b766aba7bf7cdf7f20e63b115858" },
    { "rel": "api", "href": "https://api.media.test.dev-gutools.co.uk/images/ae6f90ce02e8b766aba7bf7cdf7f20e63b115858/projection/diff" },
    { "rel": "download", "href": "https://api.media.test.dev-gutools.co.uk/images/ae6f90ce02e8b766aba7bf7cdf7f20e63b115858/download" },
    { "rel": "downloadOptimised", "href": "https://api.media.test.dev-gutools.co.uk/images/ae6f90ce02e8b766aba7bf7cdf7f20e63b115858/downloadOptimised?{&width,height,quality}" }
  ],
  "actions": [
    { "name": "delete", "href": "https://api.media.test.dev-gutools.co.uk/images/ae6f90ce02e8b766aba7bf7cdf7f20e63b115858", "method": "DELETE" },
    { "name": "reindex", "href": "https://api.media.test.dev-gutools.co.uk/images/ae6f90ce02e8b766aba7bf7cdf7f20e63b115858/reindex", "method": "POST" },
    { "name": "add-lease", "href": "https://media-leases.test.dev-gutools.co.uk/leases", "method": "POST" },
    { "name": "add-leases", "href": "https://media-leases.test.dev-gutools.co.uk/leases/media/ae6f90ce02e8b766aba7bf7cdf7f20e63b115858", "method": "POST" },
    { "name": "replace-leases", "href": "https://media-leases.test.dev-gutools.co.uk/leases/media/ae6f90ce02e8b766aba7bf7cdf7f20e63b115858", "method": "PUT" },
    { "name": "delete-leases", "href": "https://media-leases.test.dev-gutools.co.uk/leases/media/ae6f90ce02e8b766aba7bf7cdf7f20e63b115858", "method": "DELETE" },
    { "name": "delete-usages", "href": "https://media-usage.test.dev-gutools.co.uk/usages/media/ae6f90ce02e8b766aba7bf7cdf7f20e63b115858", "method": "DELETE" },
    { "name": "add-collection", "href": "https://media-collections.test.dev-gutools.co.uk/images/ae6f90ce02e8b766aba7bf7cdf7f20e63b115858", "method": "POST" }
  ]
}
```

**Call-outs:**
- `delete` action present — no exports, no usages. Confirms `canBeDeleted == true` even though `persisted.value == true` (reasons: `"leases"`, `"edited"`). `persisted` and `canBeDeleted` are fully independent — see §6.7.2.
- `valid: true` with non-empty `invalidReasons` — the active lease satisfies the override condition for the user's write permission. `invalidReasons` records the underlying reasons; do not use it as `!valid`.
- `usageRights: {}` and `originalUsageRights: {}` — empty objects, not null. Handle as "no rights set".
- `syndicationRights` shape confirmed — see §9 `SyndicationRights`. Grid passes this blob through unchanged; only checks `isRightsAcquired` for `syndicationStatus`.
- Lease `deny-syndication` has no `startDate`, `endDate`, `notes` — confirmed optional.
- `userMetadata.data.usageRights` and `userMetadata.data.photoshoot` have only `uri`, no `data` key — when a sub-resource has no data, the `data` key is absent entirely (not null).
- `labels.data: []`, `collections: []`, `usages.data: []` — present as empty arrays, never absent.
- `originalMetadata` is sparser — `description`, `credit`, `byline`, `copyright` were added via user edits; not in original IPTC.
- `aliases` has only 4 keys here vs 7 in 10.1 — the keyset varies per image.

---

*End of contract. The implementing agent can read this document and start writing kupua adapter code without re-reading Scala.*
