# Video Atom Integration — Design Document

> **Decision this serves:** Kupua presents video atoms alongside images by querying
> CAPI's Elasticsearch cluster directly — the same architectural pattern kupua already
> uses for Grid's ES. Local development uses Docker Compose (`localhost:9200`);
> production uses `ssh-tunnel-command.sh` with `--profile capi`.

---

## 1. Overview

Kupua integrates video atom data by querying CAPI's Elasticsearch index directly via
a Vite proxy, exactly as it already queries Grid's ES. The adapter filters all queries
with `{ "term": { "atomType": "media" } }` and maps `media_`-prefixed field paths to
kupua's `ImageDataSource` interface. Local development runs CAPI's ES in Docker Compose
at `localhost:9200` with a production snapshot restore (~50 GB). Production access uses
`elasticsearch/scripts/ssh-tunnel-command.sh CODE-ZEBRA content-api <port>`, forwarding `localhost:<port>` → `9200` via `ssm ssh --profile capi`.
No new indexer, no new infrastructure, no new auth mechanism.

---

## 2. Why Direct ES

Kupua's `ImageDataSource` (`kupua/src/dal/types.ts:222`) has ~20 methods, 12 of which
are ES-specific primitives: `openPit`, `closePit`, `searchAfter`, `countBefore`,
`estimateSortValue`, `findKeywordSortValue`, `getKeywordDistribution`,
`getDateDistribution`, `fetchPositionIndex`, `getIdRange`, `getAggregations`,
`getFilterAggregations`. These power the virtual scroll, scrubber, deep seek,
sort-around-focus, shift-click range, facet panel, and `is:` counts. Any data source
that cannot implement these methods produces fundamental UX holes, not graceful
degradation.

CAPI's HTTP API offers only page-based pagination (`page-size` max 200), title-only
free-text search, two sort orders (newest/oldest), and no aggregations. It cannot
satisfy any of the 12 ES primitives. Direct ES access satisfies all of them — CAPI
runs ES 9 (newer than Grid's 8.x), PIT is confirmed supported (introduced in 7.10),
and all necessary fields are indexed with correct types.

### Discarded alternatives

Other integration paths were examined and discarded:

1. **CAPI HTTP API** — structurally incompatible with kupua's query model. No cursor,
   no aggregations, title-only search. Would fail 10 of ~20 interface methods.
2. **Kinesis consumer → dedicated ES index** — viable and would yield a full kupua
   experience, but requires building a new indexer service (similar to thrall), ES
   mapping design, reindex capability, and cross-account IAM permissions. High infra
   effort. This remains the fallback if direct ES access is ever blocked.
3. **MAM API direct** — no search capability (DynamoDB full-scan with in-memory
   filter). Useful only for by-ID detail enrichment, not browsing.

---

## 3. A Note on Real Backends

Querying CAPI's ES directly is a deliberate deviation from how CAPI is designed to be
consumed. The HTTP API is CAPI's public contract; ES is an implementation detail.
This is the same reasoning behind kupua's existing ES-direct approach for Grid (bypassing
media-api). The deviation is pragmatic and documented — not a permanent bypass.

CAPI HTTP integration remains a valid long-term enhancement. If CAPI ever exposes
cursor-based pagination or aggregation endpoints, re-evaluating becomes worthwhile.
Until then, knowledge of the deviation keeps that reintegration path visible and helps
guard against coupling to ES internals that could change without notice.

This deviation should be recorded in `kupua/exploration/docs/deviations.md`.

---

## 4. Video Atom Data Shape

`MediaAtom` (`common/src/main/scala/com/gu/media/model/MediaAtom.scala:167`) has 36
fields split across the atom wrapper, the media-specific data block, and metadata.

### Atom-wrapper fields (3)

| Field | Type | Notes |
|---|---|---|
| `id` | `String` | UUID, CAPI/DynamoDB primary key |
| `labels` | `List[String]` | Atom-level labels; always empty in practice |
| `contentChangeDetails` | `ContentChangeDetails` | See below |

`ContentChangeDetails` (`ChangeRecord.scala:12`, `ContentChangeDetails.scala:12`):
`lastModified`, `created`, `published`, `revision: Long`, `scheduledLaunch`, `embargo`,
`expiry` — each field is `Option[ChangeRecord(date: DateTime, user: Option[User])]`.
This is the primary date surface for sorting and lifecycle state detection.

### Media data fields (13)

| Field | Type | In CAPI ES? |
|---|---|---|
| `title` | `String` | YES — `data.media.media_title` (keyword) |
| `category` | `Category` | YES — `data.media.media_category` (keyword) |
| `assets` | `List[Asset]` | YES (nested) |
| `activeVersion` | `Option[Long]` | YES — `data.media.media_activeVersion` (long) |
| `duration` | `Option[Long]` | YES — `data.media.media_duration` (long) |
| `source` | `Option[String]` | YES — `data.media.media_source` (keyword) |
| `description` | `Option[String]` | YES — `data.media.media_description` (text) |
| `trailText` | `Option[String]` | YES — `data.media.media_trailText` (text) |
| `posterImage` | `Option[Image]` | YES — `data.media.media_posterImage` (object) |
| `trailImage` | `Option[Image]` | YES — `data.media.media_trailImage` (object) |
| `youtubeOverrideImage` | `Option[Image]` | YES — `data.media.media_youtubeOverrideImage` (object) |
| `plutoData` | `Option[PlutoData]` | YES — `data.media.media_pluto` (nested object) |
| `iconikData` | `Option[IconikData]` | **NO** — absent from CAPI mapping |

### Metadata fields (20)

| Field | Type | In CAPI ES? |
|---|---|---|
| `tags` | `List[String]` | YES — `data.media.media_metadata.media_tags` (keyword) |
| `byline` | `List[String]` | YES — `data.media.media_byline` (keyword) |
| `commissioningDesks` | `List[String]` | **NO** — absent from CAPI mapping |
| `atomTagIds` | `List[String]` | YES — `tagIds` (keyword) |
| `keywords` | `List[String]` | YES — `data.media.media_keywords` (keyword) |
| `youtubeCategoryId` | `Option[String]` | **NO** — absent from CAPI mapping |
| `license` | `Option[String]` | YES — `data.media.media_license` (text) |
| `channelId` | `Option[String]` | YES — `media_channelId` (**text**, not keyword) |
| `legallySensitive` | `Option[Boolean]` | YES — `flags.legallySensitive` (boolean) |
| `sensitive` | `Option[Boolean]` | YES — `flags.sensitive` (boolean) |
| `privacyStatus` | `Option[PrivacyStatus]` | YES — `media_metadata.media_privacyStatus` (keyword) |
| `expiryDate` | `Option[Long]` | YES — `media_metadata.media_expiryDate` (long) |
| `youtubeTitle` | `String` | **NO** — absent from CAPI mapping |
| `youtubeDescription` | `Option[String]` | **NO** — absent from CAPI mapping |
| `blockAds` | `Boolean` | YES — `flags.blockAds` (boolean) |
| `composerCommentsEnabled` | `Option[Boolean]` | YES — `media_commentsEnabled` (boolean, `index: false`) |
| `optimisedForWeb` | `Option[Boolean]` | YES — `media_optimisedForWeb` (`index: false`) |
| `suppressRelatedContent` | `Option[Boolean]` | YES — `media_suppressRelatedContent` (`index: false`) |
| `videoPlayerFormat` | `Option[VideoPlayerFormat]` | YES — `media_selfHost.media_videoPlayerFormat` (keyword) |
| `platform` | `Option[Platform]` | YES — `data.media.media_platform` (keyword) |

*Fields marked `index: false` are stored and readable from `_source` but not
queryable or sortable. `channelId` (`media_channelId`) is `text` not `keyword` —
full-text searchable but not usable as a terms filter or sort field.*

### Asset structure (`Asset.scala:7`)

Each `Asset` carries: `assetType: AssetType` (Audio | Video | Subtitles),
`version: Long`, `id: String` (YouTube video ID *or* S3 URL for self-hosted),
`platform: Platform`, `mimeType: Option[String]`, `dimensions: Option[ImageAssetDimensions]`,
`aspectRatio: Option[String]`, `duration: Option[Long]`, `hasAudio: Option[Boolean]`.

Active version is selected by `activeVersion: Option[Long]` matching `asset.version`.
`Platform.getPlatform` (`Platform.scala:46`) resolves the atom-level platform from:
atom-level → active-asset platform → first-asset platform → default `Youtube`.

### Enum inventories

- **Category** (`Category.scala:12`): Documentary | Explainer | Feature | Hosted | News | Paid | Livestream
- **Platform** (`Platform.scala:12`): Youtube | Facebook | Dailymotion | Mainstream | Url
- **PrivacyStatus** (`PrivacyStatus.scala:12`): Private | Unlisted | Public
- **AssetType** (`AssetType.scala:10`): Audio | Video | Subtitles
- **VideoPlayerFormat** (`VideoPlayerFormat.scala:12`): Default | Loop | Cinemagraph

### Image fields within atoms (`Image.scala:51`)

`posterImage`, `trailImage`, `youtubeOverrideImage` are all `Option[Image]` where
`Image` carries `assets: List[ImageAsset]`, `master: Option[ImageAsset]`, **`mediaId: String`**,
`source: Option[String]`. The `mediaId` field is the **Grid image ID** — a direct
foreign-key reference into the Grid Elasticsearch `images` index. Every atom that has
a poster or trail image is already linked to a Grid image by primary key.

In CAPI's ES, these are at `data.media.media_posterImage.media_mediaId` (keyword),
`data.media.media_trailImage.media_mediaId` (keyword), and
`data.media.media_youtubeOverrideImage.media_mediaId` (keyword) — sortable, filterable,
and usable for cross-index lookups.

### Lifecycle states

There is no enum for "lifecycle"; it is composed from ContentChangeDetails fields:
- Draft: `published` is `None`
- Published: `contentChangeDetails.published` is `Some(...)` and `privacyStatus = Public`
- Scheduled: `scheduledLaunch` is `Some(...)`, `published` is `None`
- Expired: `expiryDate` is `Some(t)` where `t < now`, or `expiry` ChangeRecord is set
- Private/Unlisted: `privacyStatus = Private | Unlisted`

---

## 5. CAPI ES Index — Confirmed Mapping

CAPI is backed by its own Elasticsearch cluster (`content-api/elasticsearch/`). Atoms
sent via Kinesis are indexed here. The full mapping is at
`content-api/elasticsearch/es-config/templates/atoms-mapping.json`.

**ES version:** ES 9 (confirmed, upgrading). Newer than Grid's ES 8.x. All kupua
primitives are supported: PIT (introduced in 7.10), `search_after`, composite
aggregations, `date_histogram`. No version compatibility concern.

### Index structure

- **Shared index, type-discriminated.** All atom types (media, audio, quiz, recipe,
  etc.) live in one index. Filter with `atomType: "media"` (top-level keyword field).
- **`media_` prefix convention.** All fields inside `data.media` use a `media_`
  prefix: `data.media.media_title` not `data.media.title`. Top-level wrapper fields
  (`contentChangeDetails`, `title`, `tagIds`, `flags`) keep their original names.

### Field mapping table

| CAPI ES field path | Type | Sortable/Filterable? |
|---|---|---|
| `atomType` | keyword | YES — filter = `"media"` |
| `contentChangeDetails.created.date` | date | YES |
| `contentChangeDetails.lastModified.date` | date | YES |
| `contentChangeDetails.published.date` | date | YES |
| `contentChangeDetails.expiry.date` | date | YES |
| `title` (top-level) | text | NO (full-text only) |
| `data.media.media_title` | keyword | YES (sort/facet) |
| `data.media.media_category` | keyword | YES |
| `data.media.media_platform` | keyword | YES |
| `data.media.media_duration` | long | YES |
| `data.media.media_activeVersion` | long | YES |
| `data.media.media_description` | text | NO (full-text only) |
| `data.media.media_source` | keyword | YES |
| `data.media.media_byline` | keyword | YES |
| `data.media.media_keywords` | keyword | YES |
| `data.media.media_trailText` | text | NO |
| `data.media.media_posterUrl` | text | NO (`index: false`) |
| `data.media.media_metadata.media_privacyStatus` | keyword | YES |
| `data.media.media_metadata.media_channelId` | text | NO (full-text only — not keyword) |
| `data.media.media_metadata.media_expiryDate` | long | YES |
| `data.media.media_metadata.media_tags` | keyword | YES |
| `data.media.media_metadata.media_selfHost.media_videoPlayerFormat` | keyword | YES |
| `data.media.media_posterImage.media_mediaId` | keyword | YES — Grid image ID |
| `data.media.media_trailImage.media_mediaId` | keyword | YES — Grid image ID |
| `data.media.media_youtubeOverrideImage.media_mediaId` | keyword | YES — Grid image ID |
| `flags.legallySensitive` | boolean | YES |
| `flags.blockAds` | boolean | YES |
| `flags.sensitive` | boolean | YES |
| `tagIds` | keyword (`.raw`) | YES |

### Absent and non-queryable fields

- **Absent from CAPI mapping entirely** (MAM-internal, not sent to CAPI):
  `youtubeTitle`, `youtubeDescription`, `iconikData`, `commissioningDesks`,
  `youtubeCategoryId`.
- **Present but `index: false`** (stored in `_source`, not queryable/sortable):
  `media_posterUrl`, `media_optimisedForWeb`, `media_commentsEnabled`,
  `media_suppressRelatedContent`, all image asset URLs and dimensions.
- **`media_channelId` is `text`, not `keyword`** — cannot serve as a sort field or
  terms aggregation bucket. "Filter by YouTube channel" needs a `match` query
  workaround rather than a `terms` aggregation.

### Adapter query pattern

The adapter filters all queries with `{ "term": { "atomType": "media" } }` and uses
`media_`-prefixed field paths for all `data.media` fields. Sort by date →
`contentChangeDetails.created.date` or `contentChangeDetails.published.date`.
Full-text search → `title` (top-level text field). Category/platform facets →
standard terms aggs on `data.media.media_category` and `data.media.media_platform`.

### Local development

CAPI provides a Docker Compose environment (`local/docker-compose.yml`) with ES at
`http://localhost:9200`. Production data is restored from a snapshot (~50 GB download,
~150 GB free disk required) — the same s3-sync-to-local pattern kupua already uses
for Grid's ES. A Vite proxy entry pointing at `localhost:9200` works identically.

### Production access

`elasticsearch/scripts/ssh-tunnel-command.sh` forwards `localhost:<port>` → `9200`
on any stage. Usage: `ssh-tunnel-command.sh CODE-ZEBRA content-api 9201`. Internally
uses `ssm ssh --newest --profile capi -t elasticsearch,$stack,$stage`. The Vite proxy
target becomes `localhost:<port>`. Zero new infrastructure required. `capi` AWS
profile is reqired.

---

## 6. Integration with `ImageDataSource`

### Method-by-method implementation

`ImageDataSource` (`kupua/src/dal/types.ts:222`) has ~20 methods. The adapter
implements all of them against CAPI's ES.

| Method | Implementation |
|---|---|
| `getById(id)` | ES `GET /atoms/_doc/:id`. Maps atom document to kupua's type. |
| `getByIds(ids[])` | ES `_mget` against the atoms index. |
| `search(params)` | Full-text on `title` + field filters on keyword fields. All queries include `{ "term": { "atomType": "media" } }`. Field paths use `media_` prefix convention. |
| `count(params)` | ES `_count` with the same filters. |
| `countWithTickers(params)` | Filter aggregations. Kupua's image tickers (GNM-owned, agency picks) need atom-equivalent groupings (e.g. YouTube vs self-hosted, by category). Returns empty counts until groupings are defined. |
| `openPit()` / `closePit()` | Standard ES PIT API. CAPI runs ES 9 — confirmed supported. |
| `searchAfter(params, cursor, pitId)` | Core pagination primitive. Works identically to Grid's adapter. |
| `countBefore(params, sortValues)` | ES range query for sort-around-focus. |
| `estimateSortValue(params, field, percentile)` | ES percentile aggregation. |
| `findKeywordSortValue(params, field, value)` | ES terms query for keyword field resolution. |
| `getKeywordDistribution()` / `getDateDistribution()` | ES composite / `date_histogram` aggregations. |
| `fetchPositionIndex(params, signal)` | Chunked `search_after` with `_source: false`. |
| `getIdRange(params, from, to)` | Cursor-bounded `search_after` walk. |
| `getAggregations(params, fields[])` | Terms aggregations for facet panel. Keyword and date fields are properly indexed. |
| `getFilterAggregations(params, filters[])` | Named filter aggregations for `is:` counts. |

### Structural mismatches (image vs. atom)

| Image concept | Atom equivalent | Status |
|---|---|---|
| Single `source` asset | `assets[]` with versions | Mismatch — adapter resolves active version |
| No dual-state | Preview vs. Published tables | Mismatch — kupua has no concept of draft state |
| No expiry | `expiryDate` + `expiry` ChangeRecord | New field — kupua UI has no expiry display |
| `uploadedBy: String` | `contentChangeDetails.created.user` | Roughly equivalent |
| `uploadTime: String` | `contentChangeDetails.created.date` | Roughly equivalent |
| `lastModified: String` | `contentChangeDetails.lastModified.date` | Roughly equivalent |
| `metadata.description` | `description` | Equivalent |
| `metadata.title` | `title` | Equivalent |
| `metadata.byline[]` | `byline: List[String]` | Equivalent |
| `metadata.keywords[]` | `keywords: List[String]` | Equivalent |
| `source.dimensions` | Per-asset `dimensions` on active asset only | Degraded — not at atom level |
| `source.mimeType` | Per-asset `mimeType` on active asset only | Degraded |
| `source.size` | Not available at atom level | Missing |
| Collections (`collections[]`) | Pluto commission/project hierarchy | No equivalent |
| Leases | No leases concept | Missing |
| Usages (`usages[]`) | No usages concept | Missing |
| Usage rights (`usageRights`) | `license` + `blockAds` (partial) | Severely degraded |
| `syndicationRights` | Not present | Missing |
| Crops/exports | Not present | Missing |

### Supported kupua features

| Feature | Supported? |
|---|---|
| Basic grid view (thumbnail) | YES |
| Search by title | YES |
| Date range filter | YES (`contentChangeDetails.*` dates indexed) |
| Sort (by date) | YES |
| Sort by other fields | YES (keyword fields: category, platform, source) |
| Facet panel | YES |
| `is:` / `has:` filters | YES |
| CQL predicates | YES |
| Virtual scroll + PIT | YES (ES 9) |
| Scrubber | YES |
| Deep seek (>100k) | YES |
| Sort-around-focus | YES |
| Shift-click range | YES |
| Collections | NO — no equivalent concept in atoms |
| Multi-select | YES |

---

## 7. Corpus & Characteristics

### Size

The corpus is estimated at ~10k–50k media atoms (MAM launched circa 2016;
`ContentChangeDetails.created` dates span ~10 years). This is approximately
**0.1–0.5% the size of the Grid image corpus** (~9M images). At 5–10 KB per atom,
the full corpus is 50–500 MB uncompressed — trivially handled by a local ES instance.

### Image–atom overlap

Every atom with a `posterImage` or `trailImage` contains an `Image.mediaId` field
(`Image.scala:57`) which is the Grid image primary key. These Grid images are already
in the ES `images` index. The relationship is a direct foreign-key link: the atom
references the Grid image by ID. A video detail panel in kupua can look up the Grid
image for any atom's poster trivially.

### Platform distribution

`Platform.getPlatform` (`Platform.scala:46`) defaults to `Youtube` when no platform
is set. Self-hosted video (`Mainstream`, `Url`) requires an S3 upload pipeline with
Elastic Transcoder — the YouTube-hosted path is dominant. The `videoPlayerFormat`
field (Default | Loop | Cinemagraph) is only populated for self-hosted atoms.

### Growth rate

Not determinable from static analysis. The expirer Lambda runs every 15 minutes
(`ExpirerLambdaTrigger` cron `0/15 * * * ? *`), suggesting atoms expire regularly.
Scheduler Lambda also runs every 15 minutes for scheduled launches.

---

## 8. Structural Gaps

### `ImageDataSource` is an ES contract

The interface encodes ES-specific pagination semantics throughout. 12 of its ~20
methods (`openPit`, `closePit`, `searchAfter`, `countBefore`, `estimateSortValue`,
`findKeywordSortValue`, `getKeywordDistribution`, `getDateDistribution`,
`fetchPositionIndex`, `getIdRange`, `getAggregations`, `getFilterAggregations`) have
no equivalent in any non-ES data store. This is why the CAPI HTTP API was ruled out —
it cannot satisfy these methods, and kupua would have fundamental UX holes (broken
scrubber, no deep seek, no facets, no sort-around-focus) rather than graceful
degradation.

Direct ES access makes all methods implementable. The adapter is a second
`ImageDataSource` instance pointing at the CAPI atoms index — not a polymorphic
replacement for the image data source.

### Grid ES strict mapping (context for future consideration)

Grid's ES mapping is `dynamic: Strict` (`Mappings.scala:55`). Adding atom documents
to the existing `images` index would require a mapping migration. This is irrelevant
for the chosen approach (CAPI's own index is already separate), but worth noting for
context: if a dedicated kupua-controlled index were ever needed (the Kinesis consumer
fallback), it would be a new index, not a modification of `images`.

### Type-level mismatch

The `Image` type returned by `getById()` needs to accommodate atom documents. Options:
a union type (`Image | MediaAtom`), or mapping atoms into the existing `Image` shape
with degraded fields. The prototype uses minimum viable mapping: `id`, `mimeType`
(derived from active asset), `thumbnail` (from `media_posterUrl` or the Grid image
referenced by `media_posterImage.media_mediaId`). Full type design is deferred until
the UX for video items is scoped.

### Auth is not a concern

Direct ES access uses the same Vite proxy pattern as Grid's ES — the proxy forwards
to `localhost:9200` (local) or through an SSH tunnel (production). No IAM signing,
no API keys in the browser. The CAPI HTTP API would have required a server-side proxy
with IAM assume-role or API key management; direct ES avoids this entirely.

---

## 9. Prototype Scope

This section scopes the minimum work for a functional local prototype. It does not
include production wiring or UI polish.

### Prerequisites (local dev)

1. **CAPI local ES running.** `docker compose up elasticsearch` from `content-api/local/`
   → ES at `localhost:9200`. If restoring a production snapshot: ~50 GB download,
   ~150 GB free disk, same s3-sync-to-local pattern documented in
   `content-api/local/importing-a-production-snapshot.md`.
2. **Confirm atoms are indexed.** `GET localhost:9200/atoms/_count?q=atomType:media`.
   A non-zero result proves the index is populated and the `atomType` field resolves.
   This also gives the first real corpus count.

### New code: one adapter class

A `CapiEsDataSource` implementing `ImageDataSource` (`kupua/src/dal/types.ts:222`).
All ES calls are identical to `ElasticsearchDataSource` except:
- Every query gets a base filter: `{ "term": { "atomType": "media" } }`.
- Field paths use the `media_` prefix convention (e.g. sort by
  `contentChangeDetails.created.date`, facet on `data.media.media_category`).
- `getById` / `getByIds` resolve against the `atoms` index instead of `images`.
- Response documents are mapped to kupua's `Image` type (or a compatible union type).
  Minimum viable mapping: `id`, `mimeType` (derive from active asset), `thumbnail`
  (from `media_posterUrl` if stored, or the Grid image referenced by
  `media_posterImage.media_mediaId`).

### New Vite proxy entry

One entry in `vite.config.ts` (or `es-config.ts`) pointing `/capi-es` at
`http://localhost:9200`. A copy of the existing Grid ES proxy with a different prefix
and port.

### What is explicitly not in scope

- Production SSH tunnel wiring (confirmed available; treat as follow-up once the
  local prototype validates the adapter).
- UI changes (kupua renders what the adapter returns; no new components required for
  a basic grid view).
- Kinesis consumer fallback (revisit only if direct ES access is ever blocked).
- `countWithTickers` groupings (return empty for the prototype; define atom-specific
  groupings once the UX is scoped).
