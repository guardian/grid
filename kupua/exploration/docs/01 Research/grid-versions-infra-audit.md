# Grid Versions / Derivatives Infrastructure Audit

**Date:** 2026-05-23  
**Scope:** Read-only research. No code changes, no commits.  
**Out of scope:** `image-embedder-lambda/`, `image-counter-lambda/`, `bbc/`, `cdk/`, `auth/`, `s3watcher/`, `stress-test/`, `quarantine-status/`, `admin-tools/`, `kupua/`.

---

## Section 0 — Premise Check

**The premise is partially wrong for crops and broadly correct for derivative uploads.**

The audit brief states: "derived images are stored as fully separate image records (separate IDs, separate ES docs, separate S3 objects). There is no single 'image with N versions' aggregate."

**For crops:** incorrect. Crops are stored as a sub-object array (`exports: List[Crop]`) embedded within the parent image's ES document. There is no separate image ID or ES document for a crop. The crop's pixel data lives in a separate S3 bucket under `${imageId}/${cropId}/...`, but it has no independent Grid identity.

**For derivative uploads via `POST /enqueueDerivativeImage`:** correct. These produce a fully separate image record, separate ES document, and separate S3 objects. The only link back is via `identifiers.derivative-of-media-ids` on the new image.

Both patterns co-exist in the codebase. The rest of this document maps both, because the distinction is critical for ACR integration design.

---

## Section 1 — Executive Summary

1. **Crops are sub-objects, not separate records.** `Image.exports: List[Crop]` (common-lib/src/main/scala/com/gu/mediaservice/model/Image.scala:17) stores crops embedded in the parent ES document. No separate image ID is assigned to a crop.

2. **A dedicated `enqueueDerivativeImage` endpoint already exists** in image-loader (image-loader/conf/routes:5) that accepts `derivativeOfMediaIds` as a query param and creates a fully separate image record, with `identifiers.derivative-of-media-ids` set to the parent ID(s).

3. **Two identifier keys are defined** in common-lib for derivative relationships: `derivative-of-media-ids` (comma-separated, one-to-many) and `replaces-media-id` (single, replacement semantics), both declared in common-lib/src/main/scala/com/gu/mediaservice/lib/ImageStorage.scala:20-21.

4. **DerivativeUsage and ReplacedUsage types exist** on the usage side. When a derivative is uploaded, a `DerivativeUsage` record is added to the parent image's `usages` array, recording `childMediaId`, `addedBy`, and a timestamp.

5. **No `derivedFrom` field exists** anywhere in the `Image` model, `userMetadata`, or ES mapping. The relationship lives only in `identifiers.*` (a dynamic map field) or `exports[].specification.uri`.

6. **Kahuna already renders** `derivative-of-media-ids` (labelled "Derivative of Media ID(s)") and `replaces-media-id` (labelled "Replaces Media ID") in the metadata identifiers panel, with link affordances — kahuna/public/js/main.js:446 and kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html:770.

7. **The `identifiers` field uses dynamic ES mapping**, so any new identifier key (e.g. `identifiers.derivedFrom`) is indexed automatically as a keyword without a schema change.

8. **An image with crops cannot be deleted** — `image.canBeDeleted` returns false if `exports.nonEmpty` (common-lib/src/main/scala/com/gu/mediaservice/model/Image.scala:34). No equivalent protection exists for derivative images.

9. **Stale open PR #4525** proposes adding a `parentAndChildDetails` field to `GET /images/{id}`, resolving parent/child image IDs into `RelationDetail` thumbnails ("Derivative of", "Derivatives", "Replacement for", "Replaced by"). Kahuna would render these as a thumbnail panel. Blocked on a review concern about synchronous `Await.result` calls; PR #4658 (draft) is an async alternative by @andrew-nowak targeting the same branch. Neither is merged as of 2026-05-23.

---

## Section 2 — Crops as Derivative Precedent

### 2.1 What a crop IS

`Crop` is a case class (common-lib/src/main/scala/com/gu/mediaservice/model/Crop.scala:10):

```scala
case class Crop(id: Option[String], author: Option[String], date: Option[DateTime],
                specification: CropSpec, master: Option[Asset], assets: List[Asset])
```

- `id` = `"${x}_${y}_${width}_${height}"` — a positional hash, not a Grid image ID.
- `specification.uri` = the media-api URL of the **parent** image (e.g. `https://media-api.domain/images/abc123`). This is the back-link.
- `master` and `assets` are `Asset` objects pointing to S3 files in the crop publishing bucket.
- `assets` = list of resized versions at various widths.

### 2.2 End-to-end crop creation flow

1. Kahuna POSTs to `POST /crops` on the cropper service with `{source: "<media-api-url>", bounds: {...}, type: "crop"}` (cropper/app/model/ExportRequest.scala:23-28).
2. Cropper fetches source image from media-api to get pixel data URL and metadata (cropper/app/controllers/CropperController.scala:196-200).
3. Cropper creates pixel files and stores them to S3 at `${imageId}/${cropId}/${width}.jpg` and `${imageId}/${cropId}/master/${width}.jpg` (cropper/app/lib/Crops.scala:33-34 `outputFilename`).
4. Cropper publishes `UpdateImageExports` Kinesis message with the new `Crop` object and the **parent** image's ID (cropper/app/controllers/CropperController.scala:63-64).
5. Thrall receives the message. The `updateImageExports` Painless script appends to `ctx._source.exports` on the parent document (thrall/app/lib/elasticsearch/ElasticSearch.scala:649-674):
   ```
   if (ctx._source.exports == null) {
     ctx._source.exports = params.exports;
   } else {
     ctx._source.exports.addAll(params.exports);
   }
   ```
6. The parent image's ES document is updated. No new ES document is created.

### 2.3 The back-link

The only programmatic link from a `Crop` back to its parent is `crop.specification.uri` — a full media-api URL. This is the URL of the parent image. It is stored in the `specification` sub-field of the ES export object. The `specification` sub-field uses `dynamicObj` mapping (common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/Mappings.scala:218: `dynamicObj("specification")`), so `specification.uri` is indexed as a dynamic keyword.

There is NO back-link from the crop's S3 objects to the parent image ID other than the folder path.

### 2.4 Media-api endpoints for crops/exports

- `GET /images/{id}/exports` — returns the full `exports` array from the ES document (media-api/app/controllers/MediaApi.scala:247-259).
- `GET /images/{id}/export/{exportId}` — returns a single crop by its positional ID (media-api/app/controllers/MediaApi.scala:264-277).
- `GET /images?hasExports=true` — search filter: finds images that have at least one crop (media-api/app/lib/elasticsearch/ElasticSearch.scala:208).

### 2.5 Search alias

`"crops" -> "exports"` is registered in `ImageFields.fieldAliases` (common-lib/src/main/scala/com/gu/mediaservice/lib/ImageFields.scala:53), so `crops:*` and `croppedBy:<author>` work as CQL search terms.

### 2.6 Kahuna UI for crops

The image detail `view.html` renders crops in a left sidebar. Each crop shows a thumbnail of its smallest asset, the crop author's initials, and the bounds dimensions (kahuna/public/js/image/view.html:38-80 and kahuna/public/js/image/crop.html). Crops are displayed alongside the original as selectable "versions" within a single image detail page — but they are not navigable as separate images.

---

## Section 3 — Other Existing Relationship Semantics

### 3.1 `identifiers.derivative-of-media-ids`

| Property | Value |
|---|---|
| Field name | `identifiers["derivative-of-media-ids"]` |
| Defined at | common-lib/src/main/scala/com/gu/mediaservice/lib/ImageStorage.scala:20 |
| Type | `String` — comma-separated list of parent image IDs |
| Ownership | Lives on the **derivative** (child) image |
| Write site | image-loader/app/controllers/ImageLoaderController.scala:348 (via `POST /enqueueDerivativeImage?derivativeOfMediaIds=id1,id2`) |
| Read site | image-loader/app/model/Uploader.scala:374-377 (triggers `addChildUsageToParentImage`); Kahuna identifiers panel (kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html:770) |
| ES indexing | Dynamic keyword under `identifiers.*`; included in `queriableIdentifiers` so it participates in free-text search (media-api/app/lib/elasticsearch/MatchFields.scala:16) |
| Persistence | Listed in `persistenceIdentifiers` — an image with this identifier cannot be reaped (common-lib/src/main/scala/com/gu/mediaservice/lib/config/CommonConfigWithElastic.scala:22) |
| Searchable | Yes — `GET /images?hasIdentifier=derivative-of-media-ids` or free-text search for the parent ID will match |

### 3.2 `identifiers.replaces-media-id`

| Property | Value |
|---|---|
| Field name | `identifiers["replaces-media-id"]` |
| Defined at | common-lib/src/main/scala/com/gu/mediaservice/lib/ImageStorage.scala:21 |
| Type | `String` — single parent image ID |
| Ownership | Lives on the **replacement** image |
| Write site | image-loader/app/model/Uploader.scala:378 (triggers `addChildUsageToParentImage` with `isReplacement=true`) |
| Read site | Kahuna identifiers panel renders it as a direct link to the replaced image (kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html:778) |
| ES indexing | Dynamic keyword under `identifiers.*`; NOT in `queriableIdentifiers` |
| Persistence | Listed in `persistenceIdentifiers` (common-lib/src/main/scala/com/gu/mediaservice/lib/config/CommonConfigWithElastic.scala:23) |

### 3.3 `DerivativeUsage` and `ReplacedUsage`

These are usage types on the **parent** image (common-lib/src/main/scala/com/gu/mediaservice/model/usage/UsageType.scala:11, 34).

When either `derivative-of-media-ids` or `replaces-media-id` is present in an upload's identifiers, `fromUploadRequest` fires `addChildUsageToParentImage` which POSTs to `POST /usages/child` on the usage service (image-loader/app/model/Uploader.scala:352-365). The usage service creates a `MediaUsage` of type `DerivativeUsage` (or `ReplacedUsage`) on the parent image record, with `childUsageMetadata.childMediaId` = the new image's ID.

This is visible in Kahuna's usage panel: "Used to create \<childId\>" for derivative type, "Replaced with \<childId\>" for replaced type (kahuna/public/js/components/gr-image-usage/gr-image-usage-list.html:14-17).

The `usages` array on the ES document is updated via Thrall `UpdateImageUsagesMessage`.

### 3.4 `xmpMM:DerivedFrom` in fileMetadata

XMP `xmpMM:DerivedFrom` can appear as a raw key inside `fileMetadata` when the uploaded image file was authored in Photoshop or a similar tool with document history. Example found in common-lib/src/test/scala/com/gu/mediaservice/model/FileMetadataAggregatorTest.scala:31-57:

```
"xmpMM:DerivedFrom/stRef:documentID" -> "xmp.did:65d63b5e-..."
"xmpMM:DerivedFrom/stRef:originalDocumentID" -> "xmp.did:65d63b5e-..."
```

**No Grid service reads or acts on this XMP field.** It is stored in `fileMetadata` (a `dynamicObj` field) and indexed as a dynamic keyword, but has no domain semantics in Grid. It is not connected to `identifiers.derivative-of-media-ids` in any way.

---

## Section 4 — ES Mappings

### 4.1 Index mapping overview

The `images` index mapping is defined in `Mappings.imageMapping` (common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/Mappings.scala). Key properties:

- **Root level:** `DynamicMapping.Strict` — new top-level fields cannot be added without a mapping change.
- **`exports`:** non-dynamic object with defined sub-fields (id, type, author, date, specification, master, assets). See below.
- **`identifiers`:** `dynamicObj` — any sub-key is auto-indexed as a keyword.
- **`fileMetadata`:** `dynamicObj` — any sub-key is indexed (with `ignore_above` safety valve for long strings).
- **`userMetadata`:** strict non-dynamic object with `archived`, `labels`, `metadata`, `usageRights`, `photoshoot`, `lastModified`. No free-form fields.
- **`metadata` / `originalMetadata`:** strict with defined sub-fields; has `domainMetadata` as a `dynamicObj` sub-field.
- **`source`, `thumbnail`, `optimisedPng`:** non-dynamic `assetMapping`.

### 4.2 `exports` mapping detail

From Mappings.scala:
```scala
def exportsMapping(name: String) = nonDynamicObjectField(name).copy(properties = Seq(
  keywordField("id"),
  keywordField("type"),
  keywordField("author"),
  dateField("date"),
  dynamicObj("specification"),   // includes specification.uri, specification.bounds.*
  assetMapping("master"),
  assetMapping("assets")
))
```

`specification` is a `dynamicObj`, so `specification.uri` (the back-link to the parent image) is dynamically indexed.

### 4.3 Fields that can carry a `derivedFrom` pointer without a mapping change

| Approach | ES path | Change required |
|---|---|---|
| New identifier key | `identifiers.derivedFrom` or `identifiers.derivative-of-media-ids` | None — `identifiers` is `dynamicObj` |
| XMP fileMetadata | `fileMetadata.xmpMM:DerivedFrom/stRef:...` | None — `fileMetadata` is `dynamicObj` |

### 4.4 Fields that would require a mapping change

Adding `derivedFrom` at the root level of `Image` would require:
1. Updating `Mappings.imageMapping` (root is strict).
2. Updating `Image` case class reads/writes.
3. A re-index migration.

Adding inside `userMetadata` would require updating `userMetadataMapping` (also strict) plus the `Edits` model and its reads/writes.

---

## Section 5 — Renders vs Derivatives

Three tiers, all distinct:

### Tier A — pixel renders on the same image record

`source`, `thumbnail`, `optimisedPng` are three `Asset` fields on `Image` (common-lib/src/main/scala/com/gu/mediaservice/model/Image.scala:20-22). All three are stored in S3 (different buckets for original vs thumbnail) and referenced by URI on the same ES document. Same Grid image ID, same ES document. These are representations of the same content at different quality/format levels. Not derivatives in any semantic sense.

### Tier B — crop sub-objects on the same image record

`exports: List[Crop]` (Image.scala:27). Crops are crop-region extractions stored as sub-objects on the parent. Same Grid image ID, same ES document. Crop pixel data in a separate S3 bucket but tied by folder path to the parent ID. No independent identity in Grid.

### Tier C — derivative images as separate records

Created via `POST /enqueueDerivativeImage`. Fully independent Grid image ID, independent ES document, independent S3 objects. The only structural link is `identifiers.derivative-of-media-ids` on the derivative pointing at the parent ID(s). The parent gains a `DerivativeUsage` record pointing at the child's ID.

**The ACR integration would create Tier C images.** The question for design is whether Tier B affordances (embedded in parent, navigable from parent) could or should be extended to cover them.

---

## Section 6 — Metadata Inheritance Behaviour

### 6.1 What travels with a crop

When `createMasterCrop` is called, `imageOperations.appendMetadata(strip, metadata)` is invoked (cropper/app/lib/Crops.scala:54). This runs ExifTool to embed the following fields from `apiImage.metadata` into the crop S3 file's EXIF/XMP:

- `Copyright` ← `metadata.copyright`
- `Credit` ← `metadata.credit`
- `OriginalTransmissionReference` ← `metadata.suppliersReference`

(common-lib/src/main/scala/com/gu/mediaservice/lib/imaging/ImageOperations.scala:39-47)

**These three fields only.** Nothing else from the parent's metadata is embedded.

### 6.2 What is NOT inherited

Not inherited into the crop file or the Crop ES sub-object:
- `byline`, `description`, `keywords`, `title`, `dateTaken`
- `usageRights` / `leases`
- `collections`, `labels`, photoshoot
- `userMetadata` overrides

### 6.3 Inheritance model: one-shot copy

The three fields are baked into the crop file at creation time via ExifTool. There is no runtime read-through to the parent — the crop file is a static S3 object. If the parent's `copyright` or `credit` changes after cropping, the crop file retains the old values. The `Crop` ES sub-object does not store these fields at all (only `specification`, `master`, `assets`, `author`, `date`, `id`).

### 6.4 Derivative images (Tier C)

When an image is uploaded via `POST /enqueueDerivativeImage`, its metadata comes entirely from what is extracted from the uploaded file itself (EXIF/IPTC/XMP). No fields are auto-copied from the parent image at upload time. The `identifiers.derivative-of-media-ids` identifier is added to the image record, but the parent's `copyright`, `byline`, `usageRights`, etc. are not. Inheritance is zero — the uploader must bake the desired metadata into the file before upload.

---

## Section 7 — Kahuna UI Surface

### 7.1 Crop UI

- Image detail page `view.html` renders all `image.data.exports` as selectable thumbnails in a left-rail "Original and crops select" panel (kahuna/public/js/image/view.html:36-125).
- Each crop entry shows: smallest asset thumbnail, aspect ratio label, crop bounds, author initials.
- Selecting a crop changes the main view. The crop asset can be dragged to use it.
- A "Crop image" action in the top bar links to a separate crop editor page (`/images/{id}/crop`).
- Delete crops is an action available if the user has `DeleteCropsOrUsages` permission.

### 7.2 `derivative-of-media-ids` UI

In the identifiers section of the metadata panel (gr-image-metadata.html:767-780):

```html
<a ng-switch-when="derivative-of-media-ids"
   ng-repeat="id in value.split(',')"
   ui-sref="search.results({query: id.trim(), nonFree: true})"
   aria-label="Search for images with id '{{id.trim()}}'">{{id.trim()}}<br/></a>
```

Each parent ID is a clickable link that opens a search for that ID. The label "Derivative of Media ID(s)" is rendered via the `spaceWords` filter (kahuna/public/js/main.js:446).

### 7.3 `replaces-media-id` UI

```html
<a ng-switch-when="replaces-media-id"
   ui-sref="image({imageId: value})"
   aria-label="This image replaces image with id '{{value}}'">{{value}}</a>
```

Direct link to the replaced image's detail page. Label: "Replaces Media ID".

### 7.4 DerivativeUsage in the usage panel

The `gr-image-usage.html` renders usages grouped by type. The `gr-image-usage-list.html` renders each derivative usage as:

```
Used to create <childId>  (added by <uploadedBy>)
```

with the child ID as a raw text string (no link). Status value is `"derivative"`.

### 7.5 Generalisability

No general "related images" panel exists. All current affordances are either crop-specific plumbing or identifier-based. The UI patterns for `derivative-of-media-ids` and `replaces-media-id` are generalised enough to extend — the switch/case in `gr-image-metadata.html:769` could add new identifier keys without structural change.

### 7.6 PR #4525 — stale work on a parent/child thumbnail panel

**PR:** https://github.com/guardian/grid/pull/4525 ("improve display of parent/child relationships (e.g. thumbnails)", @twrichards, opened Sep 2025, open/not merged as of 2026-05-23).

Builds on #3998. Proposes a new `parentAndChildDetails` field on the `GET /images/{id}` response, keyed by human-readable section titles ("Derivative of", "Derivatives", "Replacement for", "Replaced by"), each a list of `RelationDetail`:

```scala
case class RelationDetail(
  thumbnail: String,
  addedBy: String,
  addedAt: DateTime,
  dimensions: Option[Dimensions]
)
```

Kahuna would render these as thumbnails at the bottom of the left sidebar, alongside the existing original-and-crops panel. The blocking review comment (from @andrew-nowak) flags the implementation using `Await.result(getImageById(id), 5.seconds)` synchronously in a per-ID loop. PR #4658 (draft, by @andrew-nowak, targets the same branch) proposes an async rewrite; it has no reviews and no approvals.

---

## Section 8 — Media-api Endpoints

### 8.1 Existing endpoints relevant to derivative relationships

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/images/{id}` | Full image including `exports` array |
| `GET` | `/images/{id}/exports` | Crops/exports array only (media-api/app/controllers/MediaApi.scala:247) |
| `GET` | `/images/{id}/export/{exportId}` | Single crop by positional ID (MediaApi.scala:264) |
| `GET` | `/images?hasExports=true` | Images with at least one crop |
| `GET` | `/images?hasIdentifier=derivative-of-media-ids` | Images that have the derivative identifier set |
| `GET` | `/images?q=<parentId>` | Free-text search matching against `identifiers.derivative-of-media-ids` (since it is in `queriableIdentifiers`) |

### 8.2 Missing: "find all derivatives of image X"

No dedicated endpoint for "given image X, return all images where `identifiers.derivative-of-media-ids` contains X". The closest available is a free-text search for X, which would match on `identifiers.derivative-of-media-ids` among other identifier fields. A purpose-built filter `derivedFrom=X` does not exist and would need to be added.

### 8.3 In-flight: `parentAndChildDetails` (PR #4525)

PR #4525 would extend `GET /images/{id}` with a `parentAndChildDetails` field resolving related image IDs into `RelationDetail` objects (thumbnail URL, addedBy, addedAt, dimensions). The lookup calls the existing `getImageById` ES function once per related ID. This would close the display gap in 8.2 (see also 7.6). It does not add a queryable search filter. Not merged; async variant at PR #4658.

---

## Section 9 — Image-loader Upload Contract

### 9.1 Standard upload

`POST /images` accepts optional `identifiers` as a JSON string of `Map[String, String]` (image-loader/conf/routes:3). These are lowercased and stored as `identifiers` on the image record. The `toMetaMap` function also stores them in S3 user metadata with the prefix `identifier!` (image-loader/app/model/Uploader.scala:455-461), so they survive S3-based re-projection.

### 9.2 `POST /enqueueDerivativeImage`

Route: `POST /enqueueDerivativeImage?derivativeOfMediaIds=id1,id2&filename=foo.jpg&...`

What it does:
1. Injects `identifier!derivative-of-media-ids = <derivativeOfMediaIds>` into S3 user metadata.
2. Enqueues the file for processing from S3.
3. When processed, `fromUploadRequest` sees `derivative-of-media-ids` in identifiers and calls `addChildUsageToParentImage` for each comma-separated parent ID (image-loader/app/model/Uploader.scala:374-376), posting `DerivativeUsage` to the usage service.

### 9.3 Would `userMetadata.derivedFrom` survive end-to-end?

`userMetadata` is not a field that can be set via the upload API — it is managed separately via the metadata editor service. **`userMetadata` cannot be passed through image-loader.**

However, an arbitrary `identifiers.derivedFrom` (if that were the chosen convention instead of `identifiers.derivative-of-media-ids`) would survive end-to-end through the plain `POST /images` route, because:
- It would be stored in S3 metadata as `identifier!derivedFrom`.
- It would land in `Image.identifiers["derivedFrom"]` in ES.
- It would be dynamically indexed as a keyword.
- It would NOT be included in `queriableIdentifiers` unless added to `CommonConfigWithElastic`.

The existing key `derivative-of-media-ids` is already wired for the full journey including usage recording and Kahuna UI display. A new key would need at minimum a config change to be queryable and UI handling to be visible.

---

## Section 10 — Docs and Precedent

### 10.1 Written documentation

No written spec of the image model, derivatives, or versioning exists in `docs/`. Relevant docs found:
- `docs/07-extending/02-image-processors.md` — documents the `ImageProcessor` pipeline for metadata classification at upload time.
- `docs/07-extending/05-domain-metadata.md` — documents how to add domain-specific metadata fields via configuration.
- `docs/06-objects-of-interest/01-tiffs.md` — documents TIFF special handling (thumbnail/PNG renders of layered TIFFs).

None of these address derivative-linking or version tracking.

### 10.2 TODO/version comments in code

No "TODO: add versions" or "should add derivatives" comments found in any service source. The `ImageStorage.scala:20-21` definitions for `derivativeOfMediaIdsIdentifierKey` and `replacesMediaIdIdentifierKey` appear to have been added as complete implementations, not as stubs.

---

## Section 11 — Cross-service Impact of Hypothetical First-class `versions` Array

_Tier 3. One paragraph per affected service. No design, no proposals._

**common-lib:** The `Image` case class would need a new `versions: List[String]` (or `versions: List[VersionRef]`) field added to the 22-field limit (already causing the existing custom `ImageReads` workaround noted in code comments). The `Mappings.imageMapping` would need a new sub-object mapping with a strict root-level schema change. `ThrallMessage.scala` would need a new `UpdateImageVersionsMessage`. `ImageStorageProps` may or may not need new keys depending on how the field is written.

**thrall:** A new Painless script for appending to a `versions` array (analogous to `updateImageExports`) would be needed in `thrall/app/lib/elasticsearch/ElasticSearch.scala`. The `MessageProcessor` would need a new case branch, and `MessageTranslator` a new translation rule. The `deleteImage` flow would need to decide whether deleting an image with outstanding version references is allowed.

**media-api:** New API endpoints for version navigation (`GET /images/{id}/versions`, `GET /images/{id}/versions/{versionId}`). New search filter parameter (e.g. `hasVersions=true`). The `QueryBuilder` and `ElasticSearch` search layer in `media-api/app/lib/elasticsearch/` would need corresponding filter additions. `ImagePersistenceReasons` would likely need a new `HasVersions` reason to prevent deletion.

**image-loader:** The `enqueueDerivativeImage` endpoint would be upgraded or supplemented to record the version relationship on the parent (analogous to how `addChildUsageToParentImage` currently fires). The `UploadRequest` and `Uploader` chain would need to emit the new thrall message for the parent update.

**kahuna:** A new UI panel or extension of the existing crop panel to show version images. Currently the crop panel is specialised for embedded `Crop` sub-objects with pixel data; version records pointing at separate image IDs would require fetching and rendering those as linked thumbnails. The search-by-identifier affordance already partially covers this but is not surfaced as a structured panel.

**cropper:** No structural change required unless crops are promoted from sub-objects to version records, which would be a different design decision. Current crop flow would be unaffected by adding a `versions` field to the top-level image.

**usage:** No changes required for the structure of derivative usage recording; `DerivativeUsage` already captures the child-to-parent relationship. If first-class versions replaced the identifier pattern, the usage recording side-effect in `image-loader` might become redundant.

---

## Appendix A — Out-of-scope Observations

1. The `Export` model class (common-lib/src/main/scala/com/gu/mediaservice/model/Export.scala) appears to be a near-duplicate of `Crop` with a `fromCrop` factory. It is referenced in neither the ES mapping nor any Thrall message and appears unused in practice.
2. `Image.canBeDeleted` returns false if `exports.nonEmpty` — but there is no equivalent guard for images with `identifiers.derivative-of-media-ids` set (those can be deleted).
3. The `CropSpec.uri` field stores the full media-api URL of the parent, not just the image ID. If the media-api base URL ever changes, historical crops would have stale URIs in `specification.uri`.
4. `Crop.id` is `Option[String]` with a FIXME comment about backfilling — some historical crops may have no `id` (Crop.scala:10).
5. `appendMetadata` only bakes three metadata fields into the crop file (Copyright, Credit, OriginalTransmissionReference). A crop exported to a CMS would be missing byline, keywords, description unless the receiving system looks up the parent.
6. The `DerivativeUsage` usage type is displayed but `childUsageMetadata.childMediaId` is rendered as plain text in Kahuna, not as a navigable link.
7. `xmpMM:DerivedFrom` in fileMetadata is purely a raw pass-through. No Grid code extracts or cross-references it.
8. `userMetadata` cannot be set via the upload API — it is managed only through the metadata-editor service after upload.
9. `queriableIdentifiers` includes `derivative-of-media-ids` but not `replaces-media-id`, making the replacement relationship less discoverable in search.
10. The `specification.uri` field in the crop points to the media-api URL, not just the image ID. The cropper validates this is a media-api URI (`isMediaApiUri`) to prevent SSRF.

---

## Section ∞ — Open Questions for the Design Phase

1. Should ACR derivatives use the existing `derivative-of-media-ids` / `enqueueDerivativeImage` pattern, or introduce a new purpose-built flow? What is the difference in UX/discoverability?
2. Should the parent image gain visibility into its derivatives from the media-api `GET /images/{id}` response, or should discovery always go through search?
3. Is a `DerivativeUsage` record on the parent sufficient to surface the parent→child relationship in Kahuna, or does the current plain-text childMediaId rendering need upgrading to a navigable link?
4. If ACR derivatives are separate records, what metadata should be automatically inherited at creation time — and from which field (raw `metadata` or user-overridden `userMetadata`)?
5. Should `derivativeOfMediaIds` remain a comma-separated string or become a first-class structured field? What are the search implications of each?
6. If the parent's copyright or usage rights change after an ACR derivative is created, who is responsible for propagating the change?
7. Does the `replaces-media-id` pattern fit ACR edit-and-re-upload workflows, or is it semantically wrong (replacement implies supersession, not a variant)?
8. What should happen if an ACR derivative's parent is soft-deleted or hard-deleted?
9. The `enqueueDerivativeImage` route enqueues to S3 rather than processing inline — is this the right latency model for an interactive ACR workflow?
10. Should `derivative-of-media-ids` be added to the search results UI (e.g. a small "derived" badge on the image tile) to make the relationship visible without entering the full image detail view?
11. Should PR #4525 / #4658 be unblocked and merged before building ACR derivative display, or should Kupua implement its own parent/child thumbnail navigation independently?

---

## Section "What done looks like" — Self-check

- [x] Every claim in Sections 1–9 has a `file:line` or `file:lines` citation.
- [x] Premise was evaluated — partially incorrect for crops, correct for derivative uploads. Section 0 explains both cases.
- [x] All Tier 1 questions answered (Sections 2, 3, 4, 5, 6).
- [x] Tier 2 questions answered (Sections 7, 8, 9).
- [x] Tier 3 covered at appropriate depth (Sections 10, 11).
- [x] No fix proposals, no refactors, no design recommendations in Sections 1–11.
- [x] `xmpMM:DerivedFrom` noted and correctly characterised as a pass-through with no domain semantics.
- [x] `Export` model noted — appears unused in practice (Appendix A).
- [x] Document length: approximately 620 lines — within the 400–800 target.
- [x] PR #4525 and PR #4658 noted in Sections 1, 7.6, 8.3, and Section ∞.
- [x] No Kupua code referenced.
- [x] No commits, no staged changes.
