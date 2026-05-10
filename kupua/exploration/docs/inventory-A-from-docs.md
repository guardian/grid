# Inventory A — Capability Inventory (from docs)

**Produced:** 9 May 2026  
**Sources:** 8 primary docs (fully read), 2 context docs (skimmed).  
**Method:** Synthesised from existing kupua exploration docs only. No Grid Scala source, no kahuna source read.

---

## Table of Contents

1. [Table](#table)
2. [Out-of-scope appendix](#out-of-scope-appendix)

---

## Table

> **Column definitions:**
> - **Lives in:** `ES-only` = data available directly from ES field; `API-only` = only available via a Grid microservice call; `Both` = in ES AND enriched/overwritten by API; `Other-service` = satellite service (cropper, leases, metadata-editor, collections, usage, loader); `Unknown` = not stated in source docs.
> - **Kupua status:** `Have-full` / `Have-partial` / `Don't-have` / `N/A-write-only`. "Have" claims anchored to source docs naming kupua files.
> - **TS-feasibility if API-only:** `Trivial` (≤50 LOC pure compute) / `Moderate` (50-300 LOC, data available) / `Hard` (missing data or non-trivial integration) / `Impossible-without-server` (auth, write, multi-service-fanout, secrets, audit-log) / `N/A` for ES-only or write-only.
> - **Server-only reason:** blank unless Hard or Impossible. Categories: `auth-gated` / `write-fanout` / `cross-service-aggregate` / `secret-required` / `server-state-only` / `compute-needs-data-we-dont-have` / `audit-log`.

Sorted by `Lives in` then `Capability` alphabetically.

---

### API-only

| Capability | Source(s) | Lives in | Kupua status | TS-feasibility if API-only | Server-only reason | Citation |
|---|---|---|---|---|---|---|
| Cost: overquota badge | contract-audit §6.7, enrichment-strategy §C | API-only | Have-partial (TS baseline, no overquota) | Impossible-without-server | `compute-needs-data-we-dont-have` (quota lives in S3, refreshed server-side by media-api) | enrichment-strategy §C; contract-audit §3.2.1.3 |
| Image hard-delete | contract-audit §5.11 | API-only | Don't-have | Impossible-without-server | `auth-gated` (`DeleteImage` permission) + `write-fanout` (publishes Kinesis message) | contract-audit §5.11 |
| Image soft-delete | contract-audit §5.11, comms-audit §2.1 | API-only | Don't-have | Impossible-without-server | `auth-gated` (`DeleteImage` perm or uploader) + `write-fanout` (Kinesis) | contract-audit §5.11.4; comms-audit §2.1 |
| Image undelete | contract-audit §3.3; comms-audit §2.1 | API-only | Don't-have | Impossible-without-server | `auth-gated` + `write-fanout` | contract-audit §3.3 table; comms-audit §2.1 |
| `invalidReasons` map (validity blockers) | contract-audit §6.7.1; enrichment-strategy §C | API-only | Have-partial (partial TS port via `validity-map.ts`; lease-override state is API-only) | Hard | `compute-needs-data-we-dont-have` (quota + lease interactions require server state) | contract-audit §6.7.1; AGENTS.md Component Summary "Cost calculator" |
| Pan-domain auth (panda cookie `gutoolsAuth-assym`) | contract-audit §6.2; workplan-b&b §0.3 | API-only | Don't-have | Impossible-without-server | `auth-gated` (cookie scoped to `.dev-gutools.co.uk`; cookie-setting is the auth service's job) | contract-audit §6.2; comms-audit §2.8 |
| Persistence reasons (`persisted.value`, `persisted.reasons`) | contract-audit §6.7.2; comms-audit §2.1 | API-only | Have-partial (enrichment-store receives it; `useEnrichment` hook passes to badge) | Hard | `compute-needs-data-we-dont-have` (12 persistence rules include S3 bucket checks, cross-index lookups) | contract-audit §6.7.2; AGENTS.md "Enrichment store" |
| Session / current user info (`user.email`, `user.permissions`) | contract-audit §6.4; comms-audit §2.1, §2.8 | API-only | Don't-have | Impossible-without-server | `auth-gated` (session endpoint on auth service) | comms-audit §2.1 table "Get session"; contract-audit §6.4 |
| Signed S3 source URL (expires ~15 min) | contract-audit §3.2 | API-only | Have-partial (kupua uses its own s3-proxy + imgproxy; API signed URL not consumed) | Hard | `secret-required` (S3 pre-signing requires AWS credentials server-side) | contract-audit §3.2 "Image data fields — always present" source.secureUrl note |
| `syndicationStatus` derived field | contract-audit §6.7.3; comms-audit §2.1 | API-only | Have-partial (enrichment payload receives it; badge rendering pending Cluster 1 wiring) | Impossible-without-server | `cross-service-aggregate` (depends on syndicationRights from RCS external service + usages + leases) | contract-audit §6.7.3; comms-audit §2.1 |
| User telemetry / session logging | comms-audit §2.11 | API-only | Don't-have | Impossible-without-server | `audit-log` (external telemetry service) | comms-audit §2.11 |

---

### Both (ES + API enrichment)

| Capability | Source(s) | Lives in | Kupua status | TS-feasibility if API-only | Server-only reason | Citation |
|---|---|---|---|---|---|---|
| Actions array (permission-gated HATEOAS actions) | contract-audit §3.3; comms-audit §2.1 | Both | Have-partial (enrichment-store receives `actions`; action-gated UI controls not yet rendered) | Hard | `compute-needs-data-we-dont-have` (permission evaluation requires server-side DynamoDB permissions.json lookup) | contract-audit §3.3; AGENTS.md "Grid API adapter" |
| Archive status (user-editable) | comms-audit §2.2; contract-audit §5.2 | Both (`userMetadata.archived` in ES; write via metadata-editor) | Don't-have (read from ES; write path not built) | N/A-write-only (for write) | — | comms-audit §2.2; field-catalogue `lastModified` note; contract-audit §5.2 |
| Collections membership (image ↔ collection path) | enrichment-strategy §D; contract-audit §4.5 | Both (on-image ES field `collections[]`; write via collections service) | Have-full (read: `collections.pathHierarchy` queryable in ES; write not built) | Trivial (for read) | — | enrichment-strategy §D Q1; field-catalogue (not a separate row — embedded in image) |
| Cost: free/conditional/pay badges on search cells | cost-signals §2; workplan-b&b Cluster1 | Both (ES fields drive TS baseline; API overwrites with authoritative value) | Have-partial (`calculate-cost.ts` TS baseline; API enrichment via `useEnrichment` + `enrichment-store`) | Moderate (TS covers ~95%; overquota impossible) | `compute-needs-data-we-dont-have` (overquota requires runtime S3 quota data) | enrichment-strategy §C; AGENTS.md "Cost calculator"; AGENTS.md "Grid" Cluster 1 note |
| Cost: multi-select summary pills with leased-fraction gradient | cost-signals §4; workplan-b&b Cluster1 rows 19 | Both | Have-partial (component `MultiImageMetadata` scoped for Cluster 1; gradient per `enrichment-strategy`) | Moderate | — | cost-signals §Section 4; workplan-b&b Cluster1 row 19 decision table |
| Export/crop assets list | contract-audit §4.3; comms-audit §2.4 | Both (`exports[]` embedded in ES `Image` doc; crop thumbnail signed URLs from API) | Don't-have (read from ES `exports` exists; crop UI and cropper integration not built) | Moderate (read); Impossible-without-server (write) | (write) `auth-gated` + `write-fanout` | contract-audit §4.3; comms-audit §2.4 |
| isPotentiallyGraphic blur overlay | cost-signals §2 row 5; comms-audit §2.1 | Both (painless script field on search hits; NOT present on single-image GET) | Don't-have (render path described in workplan-b&b Cluster1 row 5; not yet built) | Moderate (TS text heuristic fallback; server field is search-hit only) | — | cost-signals §2 row 5; enrichment-strategy Appendix Check 1 |
| Labels (user-managed tags) | field-catalogue `labels` row; comms-audit §2.2 | Both (`userMetadata.labels` in ES; write via metadata-editor) | Don't-have (field-catalogue: `missing`; parity-status: `pending-implementation`) | N/A-write-only (for write) | — | field-catalogue `labels` row; comms-audit §2.2 "Add label" |
| Lease display — active-lease teal colouring on cost badges | cost-signals §2 rows 1-4; enrichment-strategy §C | Both (leases embedded in ES `leases` field; `active` boolean computed by API) | Have-partial (enrichment-store receives leases; badge rendering Cluster 1) | Moderate (lease data IS in ES `leases.leases[]` with `access`/`active` fields) | — | enrichment-strategy §C "Leases (active leases…)"; cost-signals §2 rows 1-4 |
| HATEOAS links (crops, edits, usages, download, optimised) | contract-audit §3.4 | Both (links only meaningful via API; target resources may be in ES or satellite) | Have-partial (enrichment-store receives links; no UI consumers yet) | Impossible-without-server | `auth-gated` (links are permission-gated; permission evaluation server-side) | contract-audit §3.4 |
| Photoshoot (title, typeahead, batch add/remove) | field-catalogue `photoshoot` row; comms-audit §2.2 | Both (`userMetadata.photoshoot` in ES for read; write via metadata-editor) | Don't-have (field-catalogue: `missing`; requires photoshoot service typeahead) | Hard | `cross-service-aggregate` (typeahead calls metadata-search API) | field-catalogue `photoshoot` row; comms-audit §2.2 "Add photoshoot" |
| Usages: digital platform count + recent-warning icon | cost-signals §2 row 14; comms-audit §2.6 | Both (`usages[]` embedded in ES image doc; also via usage satellite) | Don't-have (render path described in workplan-b&b Cluster1 row 14; not yet built) | Trivial (free from search-hit `usages[]` — no extra fetch) | — | cost-signals §2 row 14 (corrected 7 May 2026: IS on search hit) |
| Usages: full detail list (status, platform, references, timestamps) | comms-audit §2.6; contract-audit §4.1 | Both (partial summary in ES `usages` field; full via usage satellite endpoint) | Don't-have | Moderate | — | comms-audit §2.6; contract-audit §4.1 |
| Usages: print platform count + recent-warning icon | cost-signals §2 row 13; comms-audit §2.6 | Both (`usages[]` embedded in ES image doc; also via usage satellite) | Don't-have (render path described in workplan-b&b Cluster1 row 13; not yet built) | Trivial (free from search-hit `usages[]` — no extra fetch) | — | cost-signals §2 row 13 (corrected 7 May 2026: IS on search hit) |
| Usages: syndication (photo sales) icon | cost-signals §2 row 15; comms-audit §2.6 | Both | Don't-have (gated by `showSendToPhotoSales` clientConfig flag; off in Guardian PROD + TEST) | Hard | — | cost-signals §2 row 15; workplan-b&b Cluster1 "Out of scope" note |
| `valid` boolean (image usability) | contract-audit §6.7.1; enrichment-strategy §C | Both (partially derivable from ES; authoritative value from API enrichment) | Have-partial (TS port `validity-map.ts` for ES baseline; API overwrites via enrichment hook) | Hard | `compute-needs-data-we-dont-have` (quota-based `over_quota` check requires server-side S3 quota) | contract-audit §6.7.1; AGENTS.md "Cost calculator" |

---

### ES-only

| Capability | Source(s) | Lives in | Kupua status | TS-feasibility if API-only | Server-only reason | Citation |
|---|---|---|---|---|---|---|
| Alias field: bits-per-sample | field-catalogue `alias_bitsPerSample` row | ES-only | Have-full | N/A | — | field-catalogue `alias_bitsPerSample` |
| Alias field: colour model | field-catalogue `alias_colourModel` row | ES-only | Have-full | N/A | — | field-catalogue `alias_colourModel` |
| Alias field: colour profile | field-catalogue `alias_colourProfile` row | ES-only | Have-full | N/A | — | field-catalogue `alias_colourProfile` |
| Alias field: cutout (has alpha channel) | field-catalogue `alias_cutout` row | ES-only | Have-full | N/A | — | field-catalogue `alias_cutout` |
| Alias field: digital source type (IPTC AI-generated flag) | field-catalogue `alias_digitalSourceType` row | ES-only | Have-full | N/A | — | field-catalogue `alias_digitalSourceType` |
| Alias field: edit status (XMP workflow) | field-catalogue `alias_editStatus` row | ES-only | Have-full | N/A | — | field-catalogue `alias_editStatus` |
| Alias field: scene code (IPTC Scene CV) | field-catalogue `alias_sceneCode` row | ES-only | Have-full | N/A | — | field-catalogue `alias_sceneCode` |
| Archiver status icon (kept/archived/unarchived, persisted reasons) | cost-signals §2 row 12 | ES-only | Don't-have (render path described in workplan-b&b Cluster1 row 12; not yet built) | N/A | — | cost-signals §2 row 12 note (`persisted.value` + `persisted.reasons` in ES via enrichment) |
| byline (`metadata.byline`) | field-catalogue `metadata_byline` row | ES-only | Have-full | N/A | — | field-catalogue `metadata_byline` |
| Byline title (`metadata.bylineTitle`) | field-catalogue `metadata_bylineTitle` row | ES-only | Have-full | N/A | — | field-catalogue `metadata_bylineTitle` |
| Collection filter / CQL `~"path"` search | enrichment-strategy §D; comms-audit §2.3 | ES-only | Have-partial (CQL translator exists; collection-specific filter + `dateAddedToCollection` sort not yet wired in kupua) | N/A | — | enrichment-strategy §D Q1 + Q3; comms-audit §2.3 |
| Collections sort by `dateAddedToCollection` | enrichment-strategy §D Q3 | ES-only | Don't-have | N/A | — | enrichment-strategy §D "Date-Added sort" |
| Copyright (`metadata.copyright`) | field-catalogue `metadata_copyright` row | ES-only | Have-full | N/A | — | field-catalogue `metadata_copyright` |
| Cost: free badge (filter visibility, no positive badge on cell) | cost-signals §Section 3; field-catalogue `cost_state` row | ES-only | Have-partial (free-to-use filter exists; no green "free" badge on grid cells — by design matching Kahuna) | N/A | — | cost-signals §Section 3 "Non-free cells"; cost-signals §Section 5 item 7 |
| Credit (`metadata.credit`) | field-catalogue `metadata_credit` row | ES-only | Have-full | N/A | — | field-catalogue `metadata_credit` |
| CQL free-text + structured search | enrichment-strategy §B row 14; comms-audit §3 | ES-only | Have-full (`cql.ts` translator, 478 LOC) | N/A | — | enrichment-strategy §B row 14; AGENTS.md "CQL" |
| Date taken (`metadata.dateTaken`) | field-catalogue `metadata_dateTaken` row | ES-only | Have-full | N/A | — | field-catalogue `metadata_dateTaken` |
| Deep seek / cursor pagination (search_after + PIT) | enrichment-strategy §B rows 1-2; integration-plan §direct-ES | ES-only | Have-full (direct-ES only; API-only impossible without Scala changes) | N/A | — | enrichment-strategy §B rows 1-2 (HARD GAP for API-only) |
| Description (`metadata.description`) | field-catalogue `metadata_description` row | ES-only | Have-full | N/A | — | field-catalogue `metadata_description` |
| Derivative image identifiers (`identifiers.derivative-of-media-ids`) | field-catalogue `identifiers_derivative` row | ES-only | Don't-have (field-catalogue: `missing`; parity: `pending-implementation`) | N/A | — | field-catalogue `identifiers_derivative` |
| Dimensions (width × height, orientedDimensions) | field-catalogue `dimensions` row | ES-only | Have-full | N/A | — | field-catalogue `dimensions` |
| Domain metadata (BBC-specific config-driven fields) | field-catalogue `domain_metadata` row; comms-audit §1 Client Config | ES-only | Don't-have (field-catalogue: `missing`; deferred to BBC parity session) | N/A | — | field-catalogue `domain_metadata` row |
| "Free to use only" filter (search param `free:true`) | cost-signals §Section 3; field-catalogue `usageRights_category` | ES-only | Have-full (`SearchFilters.tsx:55-66` confirmed in workplan-b&b Cluster1 row 20) | N/A | — | cost-signals §Section 3; workplan-b&b Cluster1 row 20 decision |
| Full position map (multi-page search_after with `_source:false`) | enrichment-strategy §B row 8; integration-plan §direct | ES-only | Have-full (direct-ES only; impossible via API) | N/A | — | enrichment-strategy §B row 8 (HARD GAP) |
| File size (`source.size`) | field-catalogue `source_size` row | ES-only | Have-full | N/A | — | field-catalogue `source_size` |
| File type / MIME (`source.mimeType`) | field-catalogue `source_mimeType` row | ES-only | Have-full | N/A | — | field-catalogue `source_mimeType` |
| Filename (`uploadInfo.filename`) | field-catalogue `uploadInfo_filename` row | ES-only | Have-full (always-suppress in multi-select, divergent-by-design) | N/A | — | field-catalogue `uploadInfo_filename` |
| Height (`source.orientedDimensions.height`) | field-catalogue `source_height` row | ES-only | Have-full | N/A | — | field-catalogue `source_height` |
| Image ID (`id`) | field-catalogue `imageId` row | ES-only | Have-full (click-to-copy in panel and table; kupua-improves on Kahuna) | N/A | — | field-catalogue `imageId` |
| Image type (`metadata.imageType`, config-gated) | field-catalogue `metadata_imageType` row | ES-only | Have-full (config-gated display implemented) | N/A | — | field-catalogue `metadata_imageType` |
| `is:` predicate filters (GNM-owned, agency-pick, etc.) | integration-plan §Phase 3 | ES-only | Don't-have (planned Phase 3 of direct-ES plan; CQL extension) | N/A | — | integration-plan §Phase 3 |
| Keyword distribution (composite aggregation) | enrichment-strategy §B rows 5-6; integration-plan §direct | ES-only | Have-full (direct-ES `getKeywordDistribution`; API-only impossible) | N/A | — | enrichment-strategy §B rows 5-6 (HARD GAPs) |
| Keywords (`metadata.keywords`, chip array) | field-catalogue `keywords` row | ES-only | Have-full (single-panel, table, filter; multi-panel pending S4) | N/A | — | field-catalogue `keywords` |
| Last modified (`lastModified`) | field-catalogue `lastModified` row | ES-only | Have-full (kupua-improves on Kahuna: shown in panel and table) | N/A | — | field-catalogue `lastModified` |
| Location composite (subLocation, city, state, country) | field-catalogue `location` + child rows | ES-only | Have-full (all 4 segments implemented: single-panel, table) | N/A | — | field-catalogue `location` parent + 4 child rows |
| Multi-image reconciled metadata panel | field-catalogue schema §Catalogue intro; AGENTS.md "Selection Store" | ES-only | Have-full (S4 complete per AGENTS.md; `MultiImageMetadata.tsx`) | N/A | — | field-catalogue §Summary; AGENTS.md "Multi-image panel (S4)" |
| Multi-image selection (set of IDs, sessionStorage persist) | field-catalogue header; AGENTS.md "Selection Store" | ES-only | Have-full (S0-S6 complete per AGENTS.md `selection-store.ts`) | N/A | — | AGENTS.md Component Summary "Selection Store" |
| People in image (`metadata.peopleInImage`, chip array) | field-catalogue `people` row | ES-only | Have-full (single-panel, table; multi-panel pending S4) | N/A | — | field-catalogue `people` |
| Percentile estimation for deep seek | enrichment-strategy §B row 4; integration-plan §direct | ES-only | Have-full (direct-ES `estimateSortValue`; API-only impossible) | N/A | — | enrichment-strategy §B row 4 (HARD GAP) |
| Position lookup (`countBefore`) | enrichment-strategy §B row 3; integration-plan §direct | ES-only | Have-full (direct-ES; API-only impossible — no arbitrary count endpoint) | N/A | — | enrichment-strategy §B row 3 (HARD GAP) |
| Replaces-Media-ID identifier (`identifiers.replaces-media-id`) | field-catalogue `identifiers_replaces` row | ES-only | Don't-have (field-catalogue: `missing`; parity: `pending-implementation`) | N/A | — | field-catalogue `identifiers_replaces` |
| Result count (lightweight count) | enrichment-strategy §B row 17 | ES-only | Have-partial (direct-ES `_count`; soft gap if API-only: `length=0&countAll=true` workaround) | N/A | — | enrichment-strategy §B row 17 (SOFT GAP) |
| Reverse sort / missingFirst for backward pagination | enrichment-strategy §B row 9 | ES-only | Have-full (direct-ES `search_after` reversed sort clause; impossible via API) | N/A | — | enrichment-strategy §B row 9 (HARD GAP) |
| `result--seen` (opacity 0.5, localStorage client state) | cost-signals §Section 5 item 3 | ES-only | Don't-have (pure client localStorage state; not a server field) | N/A | — | cost-signals §Section 5 item 3 |
| `result--selected` cyan border (client selection state) | cost-signals §Section 5 item 4 | ES-only | Have-full (driven by selection-store, CSS `data-selection-mode`) | N/A | — | cost-signals §Section 5 item 4; AGENTS.md "Selection UI" |
| Rights & Restrictions category (`usageRights.category`) | field-catalogue `usageRights_category` row | ES-only | Have-full (single-panel, table, filter) | N/A | — | field-catalogue `usageRights_category` |
| Scrubber (scroll/seek/indexed modes, ticks, tooltip) | AGENTS.md "Scrubber" | ES-only | Have-full (direct-ES only; API-first impossible without Scala PIT+percentile endpoints) | N/A | — | AGENTS.md "Scrubber"; enrichment-strategy §B rows 1-10 |
| Source (`metadata.source`) | field-catalogue `metadata_source` row | ES-only | Have-full (kupua-improves: promoted to main panel) | N/A | — | field-catalogue `metadata_source` |
| Special instructions (`metadata.specialInstructions`) | field-catalogue `metadata_specialInstructions` row | ES-only | Have-full | N/A | — | field-catalogue `metadata_specialInstructions` |
| Staff-photographer border (thick blue ring on thumbnail) | cost-signals §2 row 6; field-catalogue `usageRights_category` | ES-only | Don't-have (render path described in workplan-b&b Cluster1 row 6; not yet built) | N/A | — | cost-signals §2 row 6; workplan-b&b Cluster1 row 6 |
| Subjects (`metadata.subjects`, chip array) | field-catalogue `subjects` row | ES-only | Have-full (single-panel, table, filter; read-only in multi-select per Kahuna) | N/A | — | field-catalogue `subjects` |
| Suppliers reference (`metadata.suppliersReference`) | field-catalogue `metadata_suppliersReference` row | ES-only | Have-full (always-suppress in multi-select; kupua-improves: in main panel) | N/A | — | field-catalogue `metadata_suppliersReference` |
| Table view (TanStack Table + Virtual, column customisation) | AGENTS.md "Table" | ES-only | Have-full | N/A | — | AGENTS.md Component Summary "Table" |
| Ticker badges (server-defined count badges with click-filter) | cost-signals §2 row 21; integration-plan §Phase 3 | ES-only | Don't-have (search response `actions.tickerCounts` map; not yet wired) | N/A | — | cost-signals §2 row 21; workplan-b&b Phase A types note |
| Title (`metadata.title`) | field-catalogue `metadata_title` row | ES-only | Have-full | N/A | — | field-catalogue `metadata_title` |
| Two-tier virtualisation (scroll through 65k results) | AGENTS.md "Data Window" | ES-only | Have-full (direct-ES only; API-only impossible without `search_after` endpoint) | N/A | — | AGENTS.md "Data Window"; enrichment-strategy §B row 1 (HARD GAP) |
| Upload time (`uploadTime`) | field-catalogue `uploadTime` row | ES-only | Have-full | N/A | — | field-catalogue `uploadTime` |
| Uploaded by (`uploadedBy`) | field-catalogue `uploadedBy` row | ES-only | Have-full | N/A | — | field-catalogue `uploadedBy` |
| Width (`source.orientedDimensions.width`) | field-catalogue `source_width` row | ES-only | Have-full | N/A | — | field-catalogue `source_width` |
| Windowed buffer (max 1000 images, eviction, PIT, sort-around-focus) | AGENTS.md "Store" | ES-only | Have-full | N/A | — | AGENTS.md Component Summary "Store" |

---

### Other-service

| Capability | Source(s) | Lives in | Kupua status | TS-feasibility if API-only | Server-only reason | Citation |
|---|---|---|---|---|---|---|
| Archive (write: set/unset archived flag) | comms-audit §2.2; contract-audit §5.2 | Other-service (metadata-editor) | Don't-have | Impossible-without-server | `write-fanout` (DynamoDB → Kinesis → Thrall → ES) | contract-audit §5.2; comms-audit §2.2 "Set archived" |
| Batch metadata edit (sequential edit with progress events) | comms-audit §2.2 "Batch operations" | Other-service (metadata-editor) | Don't-have | Impossible-without-server | `write-fanout` | comms-audit §2.2 "Batch operations / trackAll()" |
| Collection tree browser (full hierarchy, DynamoDB-backed) | contract-audit §4.6; comms-audit §2.3 | Other-service (collections service, DynamoDB) | Don't-have | Impossible-without-server | `server-state-only` (tree structure is in DynamoDB; ES only has per-image membership) | contract-audit §4.6; enrichment-strategy §D Q2 |
| Crop create (new sized or full crop) | comms-audit §2.4; contract-audit §5.10 | Other-service (cropper) | Don't-have | Impossible-without-server | `auth-gated` + `write-fanout` (S3 write + Kinesis) | contract-audit §5.10; comms-audit §2.4 |
| Crop delete-all | comms-audit §2.4; contract-audit (implied §5.10) | Other-service (cropper) | Don't-have | Impossible-without-server | `auth-gated` (`DeleteCropsOrUsages`) + `write-fanout` | comms-audit §2.4 "Delete all crops" |
| Crop download links per size | comms-audit §2.4; contract-audit §4.3 | Other-service (cropper) | Don't-have | Impossible-without-server | `secret-required` (crop download URLs require per-size link from cropper; CDN origin-request signing) | comms-audit §2.4 "Crop Download Links"; contract-audit §4.3 |
| Image upload (direct-to-S3 or legacy through loader) | comms-audit §2.7; integration-plan §Phase 6 | Other-service (image-loader) | Don't-have | Impossible-without-server | `auth-gated` (`UploadImages`) + `write-fanout` + `secret-required` (S3 pre-signed PUT URLs) | comms-audit §2.7; integration-plan §Phase 6 |
| Import image from external URI | comms-audit §2.7 "Import URI" | Other-service (image-loader) | Don't-have | Impossible-without-server | `write-fanout` + `auth-gated` | comms-audit §2.7 "Import URI" |
| Labels: add label(s) | comms-audit §2.2; contract-audit §5.1 | Other-service (metadata-editor) | Don't-have | Impossible-without-server | `write-fanout` | contract-audit §5.1; comms-audit §2.2 "Add label" |
| Labels: label autocomplete / suggest | comms-audit §2.1 "Label search"; contract-audit §2 root links | Other-service (media-api label-search endpoint) | Don't-have | Hard | `cross-service-aggregate` (searches `userMetadata.labels` across all images) | comms-audit §2.1 table "Label search"; contract-audit §2 root links table |
| Labels: remove label | comms-audit §2.2; contract-audit §5.1 | Other-service (metadata-editor) | Don't-have | Impossible-without-server | `write-fanout` | contract-audit §5.1.3; comms-audit §2.2 "Remove label" |
| Lease add (allow/deny use or syndication, with date range) | comms-audit §2.5; contract-audit §5.5 | Other-service (leases) | Don't-have | Impossible-without-server | `write-fanout` (LeaseNotifier → Kinesis → Thrall → ES) | contract-audit §5.5; comms-audit §2.5 |
| Lease delete — all leases | comms-audit §2.5; contract-audit §5.8 | Other-service (leases) | Don't-have | Impossible-without-server | `write-fanout` | contract-audit §5.8 |
| Lease delete — single lease | comms-audit §2.5; contract-audit §5.9 | Other-service (leases) | Don't-have | Impossible-without-server | `write-fanout` | contract-audit §5.9 |
| Lease list (individual lease cards, allow/deny, dates, notes, active) | cost-signals §2 row 18; field-catalogue `lease_summary` row | Other-service (leases; embedded in ES `leases` field for read) | Don't-have (field-catalogue: `missing`; Cluster 1 adds count-only summary) | Moderate (read: lease data IS in ES `leases.leases[]`; write via leases service) | — | field-catalogue `lease_summary` row; cost-signals §2 row 18 |
| Lease replace-all | comms-audit §2.5; contract-audit §5.7 | Other-service (leases) | Don't-have | Impossible-without-server | `write-fanout` (also: fire-and-forget write — 202 before DynamoDB committed) | contract-audit §5.7 + §5.16 consistency table |
| Lease summary count (N current + M inactive) | field-catalogue `lease_summary` row; cost-signals §4 | Other-service (leases; data in ES for count) | Have-partial (enrichment payload receives `leases`; count-line rendering planned Cluster 1) | Moderate (count derivable from ES `leases.leases[]` with `active` flag) | — | field-catalogue `lease_summary`; workplan-b&b Cluster1 row 18 |
| Metadata edit (description, byline, credit, etc.) | comms-audit §2.2; contract-audit §5.3 | Other-service (metadata-editor) | Don't-have | Impossible-without-server | `write-fanout` + `auth-gated` (`EditMetadata` or uploader) | contract-audit §5.3; comms-audit §2.2 "Update metadata" |
| Metadata typeahead / autocomplete (photoshoot titles, field values) | comms-audit §2.1 "Metadata search"; contract-audit §2 | Other-service (media-api metadata-search endpoint) | Don't-have | Hard | `cross-service-aggregate` (aggregates field values across index) | comms-audit §2.1 "Metadata search"; contract-audit §2 root links |
| Metadata templates (pre-built edit templates, apply in batch) | comms-audit §1 `metadataTemplates` config key; comms-audit §2.2 | Other-service (metadata-editor; config in Kahuna controller) | Don't-have | Impossible-without-server | `cross-service-aggregate` + `write-fanout` | comms-audit §1 Client Config table |
| Photoshoot add / remove | comms-audit §2.2; contract-audit implied §5 | Other-service (metadata-editor) | Don't-have | Impossible-without-server | `write-fanout` | comms-audit §2.2 "Add photoshoot", "Remove photoshoot" |
| Set metadata from usage rights (auto-populate) | comms-audit §2.2; contract-audit §5.3.1 | Other-service (metadata-editor) | Don't-have | Impossible-without-server | `write-fanout` + `auth-gated` | comms-audit §2.2 "Set metadata from usage rights"; contract-audit §5.3.1 |
| Syndication rights (from RCS external service) | field-catalogue `syndication_rights` row; comms-audit §2.1 | Other-service (external RCS service, not in Grid) | Don't-have (field-catalogue: `missing`) | Impossible-without-server | `cross-service-aggregate` (RCS is an external Guardian service) | field-catalogue `syndication_rights`; comms-audit §2.1 |
| Syndicate image to partner (e.g. Capture / Photo Sales) | comms-audit §2.1; contract-audit §5.14 | Other-service (media-api syndicateImage + usage satellite) | Don't-have | Impossible-without-server | `write-fanout` + `auth-gated`; also: usage recording is fire-and-forget (§5.14.3) | contract-audit §5.14; comms-audit §2.1 "Syndicate image" |
| Thumbnail (CloudFront unsigned stable URL) | contract-audit §3.2 | Other-service (CloudFront CDN; URL from API) | Have-partial (kupua uses own s3-proxy + imgproxy; API `thumbnail.secureUrl` not consumed for display) | N/A | — | contract-audit §3.2 "thumbnail.secureUrl" note; integration-plan §"What Stays Kupua-Only" |
| Usage rights categories list (full + filtered) | comms-audit §2.2 "Get usage rights categories" | Other-service (metadata-editor `usage-rights-list` endpoint) | Don't-have | Impossible-without-server | `server-state-only` (categories + defaultCosts + lease templates defined in Scala config) | comms-audit §2.2 table "Get usage rights categories" |
| Usage rights edit (set/delete category + properties) | comms-audit §2.2; contract-audit §5.4 | Other-service (metadata-editor) | Don't-have | Impossible-without-server | `write-fanout` (no explicit permission check — any authenticated user) | contract-audit §5.4; comms-audit §2.2 "Update usage rights" |
| Usage rights lease auto-management (create/remove category leases on rights change) | comms-audit §2.5 "Usage Rights → Lease Auto-Management" | Other-service (leases + metadata-editor) | Don't-have | Impossible-without-server | `cross-service-aggregate` + `write-fanout` | comms-audit §2.5 "Usage Rights → Lease Auto-Management" |
| Usage instructions (`metadata.usageInstructions`, BBC-specific read-only note) | field-catalogue `usageInstructions` row | Other-service (config-driven, BBC-specific; ES path `metadata.usageInstructions`) | Don't-have (field-catalogue: `missing`; deferred to BBC parity session) | Moderate (config-driven; display only; data in ES) | — | field-catalogue `usageInstructions` row |
| Usages delete (admin: delete all usages for image) | comms-audit §2.6; contract-audit §5.15 | Other-service (usage service) | Don't-have | Impossible-without-server | `auth-gated` (`DeleteCropsOrUsages`) + `write-fanout` (fire-and-forget — 200 before deletes committed) | contract-audit §5.15; §5.16 consistency table |
| Upload status polling ("my uploads" section) | comms-audit §2.7 | Other-service (image-loader) | Don't-have | Impossible-without-server | `server-state-only` (upload state in loader service, not ES) | comms-audit §2.7 "Get upload statuses" |

---

### Unknown

| Capability | Source(s) | Lives in | Kupua status | TS-feasibility if API-only | Server-only reason | Citation |
|---|---|---|---|---|---|---|
| Announcements / banner notifications | comms-audit §1 Client Config `announcements` key | Unknown (appears to come from Kahuna Scala config injection, not Grid API) | Don't-have | Unknown | — | comms-audit §1 Client Config table `announcements` |
| Cost filter mode (chargeable/non-chargeable orientation, label) | comms-audit §1 `costFilterLabel` / `costFilterChargeable`; cost-signals §Section 3 | Unknown (config key; value comes from Kahuna server-side config injection) | Have-partial (filter exists; label hardcoded; chargeable-mode toggle not implemented) | Moderate | — | comms-audit §1 Client Config table; cost-signals §Section 3 "Filter control" |
| `enableWarningFlags` (selection overlay tints: alert/warning/lease-attached) | cost-signals §2 rows 7-10 | Unknown (clientConfig flag; off in Guardian PROD + TEST) | Don't-have (off in Guardian deployment; render path not built) | Moderate | — | cost-signals §2 rows 7-10; workplan-b&b Cluster1 "Out of scope" |
| Feature flags (`featureSwitches`) | comms-audit §1 Client Config `featureSwitches` | Unknown (Kahuna server-side config injection; no Grid API equivalent yet) | Don't-have | Hard | — | comms-audit §1 Client Config table |
| Field aliases config (operator-customisable CQL field names) | comms-audit §1 `fieldAliases`; field-catalogue Appendix B | Unknown (Kahuna server-side; for kupua currently hardcoded in `grid-config.ts`) | Have-partial (7 default aliases hardcoded in `field-registry.ts`; dynamic config via API-first Phase 1 not built) | Moderate | — | comms-audit §1 `fieldAliases`; field-catalogue Appendix B |
| imgops optimised image URLs (legacy nginx image-filter proxy) | contract-audit §3.4 `optimised` link; integration-plan §"What Stays Kupua-Only" | Unknown (imgops is a Docker container; kupua uses its own imgproxy instead) | N/A (kupua intentionally uses own imgproxy) | N/A | — | integration-plan §"imgproxy" note; contract-audit §3.4 |
| `interimFilterOptions` / permissions-filter mode | comms-audit §1 `interimFilterOptions` / `usePermissionsFilter` | Unknown (Kahuna config injection; off in Guardian PROD + TEST) | Don't-have | Hard | — | comms-audit §1 Client Config table; cost-signals §Section 3 §5 item 15 |
| Witness report (Guardian Witness integration) | comms-audit §2.10; contract-audit §2 root links `witness-report` | Unknown (external Guardian Witness service; link from HATEOAS root) | Don't-have | Impossible-without-server | `cross-service-aggregate` (external Witness service) | comms-audit §2.10; contract-audit §2 root links table |

---

**Total rows: 108**

---

## Out-of-scope appendix

≤20 bullet items. One line each.

1. **Contradiction: `GET /permissions` dead link.** contract-audit §2 root links table lists `permissions` link from HATEOAS root; §6.6 and §8 item 9 addendum explicitly states no route exists (404). Use `GET /session` on auth service instead. (contract-audit §2 vs §6.6)

2. **Contradiction: usages NOT on search hit (original) vs IS on search hit (corrected).** cost-signals §0 "Confidence notes" originally stated usages icons required a separate per-cell API call; §Section 5 item 5 contradicts §2 rows 13-14 which were corrected 7 May 2026 to confirm `usages[]` IS inline on search hit. The corrected version (IS on search hit) is authoritative.

3. **`reindex` action is a dead link.** contract-audit §3.3 table explicitly marks `reindex` action as dead — emitted by media-api but no matching route; returns Play 404 "Action Not Found". Do not call.

4. **`replace-leases` is fire-and-forget.** Despite returning 202, the `replaceLeases` DynamoDB Future is discarded; ES may not reflect the change before the response. Same applies to `DELETE /images/{id}` (soft-delete) and `DELETE /usages/media/{id}`. (contract-audit §5.16 consistency table)

5. **CloudFront thumbnail serving is being removed.** integration-plan §"Things We Might Be Wrong About" item 1 notes grid PR #4698 removes CloudFront image serving; post-CloudFront thumbnail story is unresolved at doc time. This may affect kupua's s3-proxy approach in production.

6. **`isPotentiallyGraphic` asymmetry.** Present on search hits (painless script field); absent on `GET /images/{id}` single-image responses. Treat absence as "unknown", not "false". (cost-signals §2 row 5; enrichment-strategy Appendix Check 1)

7. **`preview__image--agency-pick` CSS class is dead.** Set on thumbnails when `isAgencyPick` is true but has no CSS rule in any Kahuna stylesheet. Do not replicate. (cost-signals §Section 5 item 1)

8. **`conditional_paid` excluded from alert overlay.** Kahuna explicitly excludes the `conditional_paid` key from the red overlay check in `image.js:148`. Do not treat it as a red-overlay trigger. (cost-signals §Section 5 item 9)

9. **Collection membership is on-image, not a join.** `collections: List[Collection]` is embedded in every ES image document. Collections service is write-path only for kupua. `?ids=` not needed for collection views. (enrichment-strategy §D Q1)

10. **`cost` is not stored in ES.** Computed at request time by `ImageResponse.addUsageCost`. Re-merge fallback has a known TODO bug for stale records where user changed category. (contract-audit §3.2.1.3)

11. **`valid` and `invalidReasons` can both be non-empty simultaneously.** `valid` is recomputed after lease overrides; `invalidReasons` records the underlying reason a lease was needed. Do not use `invalidReasons` as a proxy for `!valid`. (contract-audit §6.7)

12. **`persisted.value` and `canBeDeleted` are fully independent.** `canBeDeleted == !hasExports && !hasUsages` — leases and archive state are irrelevant to it. Do not use `persisted` as a proxy for "undeletable". (contract-audit §6.7.2)

13. **`setupB` mixed-origin URLs.** In `--use-TEST` mode, the HATEOAS root returns `api.media.local.dev-gutools.co.uk` for media-api but `*.test.dev-gutools.co.uk` for satellite services. Never derive a single base URI from the root; always use per-link host. (contract-audit §6.6 "Mixed-origin service URLs")

14. **Wholesale API-mirror is architecturally impossible without Scala changes.** 9 hard gaps (search_after, PIT, countBefore, percentile, composite agg, full position map, reverse sort, two-phase null-zone, getIdRange) have no media-api equivalent. Kupua stays direct-ES for all pagination. (enrichment-strategy §B Summary)

15. **Kupua intentionally departs from Kahuna on 3 multi-select fields.** `alias_*` fields: reconciled in kupua, always-suppressed in Kahuna. `uploadInfo_filename`: always-suppress in kupua, show-if-all-same in Kahuna. These are documented as intentional improvements. (field-catalogue Appendix B)

16. **`POST /crops` response is NOT standard Argo EntityResponse.** Bare Crop JSON with `application/vnd.argo+json` content-type but no wrapper. Do not use standard `unwrapEntity` helper. (contract-audit §5.10.3; §8 item 2)

17. **Direct-ES plan and API-first plan are mutually exclusive for search.** The hybrid approach (docs decided May 2026) keeps direct-ES for all search/scroll operations indefinitely; API-first search endpoints require Scala collaborator + multi-month implementation. (workplan-b&b §"The hybrid approach"; enrichment-strategy §Recommendation)

18. **`add-collection` action has no permission gate.** Any authenticated Internal-tier user can add an image to any collection. (contract-audit §3.3 table; §5.12.3)
