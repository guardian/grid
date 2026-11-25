# Search chip fixture matrix

The 28 records (23 purpose-named records plus five named supplier records) are implemented in
[search-chips.ts](../../fixtures/elasticsearch/search-chips.ts) and appended after
the captured images by the [shared loader](../../setup/image-fixtures.ts).
The existing Elasticsearch and image-file seeders consume that combined list.
Existing records and their lookup order are preserved.

Each fixture name states the contrast it was added to test, so a scenario's
scope and expected matches are readable without consulting this table.

The chip-value column uses the [inventory's](./search-chips-inventory.md) query keys rather than raw JSON field
names. **Common** means all of the following values, with row-specific overrides
replacing them; `{role}` is the fixture name. Values are data, not necessarily
ready-to-paste query syntax: quote multi-word values when searching.

- `title` = `Search chips image {role}`; `description` = `Search chips fixture {role}`.
- `by` = `Example External Photographer`; `credit` = `Search Chips Agency`;
  `illustrator` = `Search Chips Agency` (the chip also searches `metadata.credit`).
- `copyright` = `Search Chips Copyright`; `source` = `Search Chips Wire`;
  `suppliersReference` = `search-chips-{role}`;
  `specialInstructions` = `Editorial use only`.
- `keyword` = `search-chips-{role}`; `subject` = `news`.
- `uploader` = `grid-e2e-account@guardian.co.uk`; `fileType` = `jpeg`;
  `filename` = `search-chips-{role}.jpg`.
- `date` (upload time) and `dateTaken` = `2024-06-15T12:00:00.000Z`.

**Current user** means `grid-e2e-account@guardian.co.uk`; **other user** means
`search-chips-other@guardian.co.uk`. **Print details** means
`usages@publication` = `G` / `The Guardian`, `usages@section` = `CUL` / `Culture`,
and `usages@orderedBy` = current user, all on the print usage only.
`usages@>added` and `usages@<added` query the same `dateAdded` timestamp listed
per usage below; they are lower/upper boundary operators, not separately stored
values. Unlisted optional values are absent or empty, not inherited from another
row. `in` searches the listed location values together.

| Fixture | Proposed distinguishing data | Main purpose | All populated chip values (Common plus overrides/additions unless stated) |
| --- | --- | --- | --- |
| `harbour-daylight-jpeg` | Shared text, credit and location with `harbour-night-cropped-png`; distinct uploader, keyword and file type; no crop | Positive baseline and intersections. | Common; `description` = `Harbour festival at the waterfront`; `credit` / `illustrator` = `Search Chips Shared Credit`; `city` = `Bristol`; `state` = `Somerset`; `country` = `United Kingdom`; `location` = `Harbourside`; `in` = those four location values; `keyword` = `harbour`, `daylight`; `subject` = `arts`; `person` = `Alex Example`; `category` = `agency`; `supplier` = `Reuters`; `date` = `2024-06-14T12:00:00.000Z`; no persistence reasons. |
| `harbour-night-cropped-png` | Shared text, credit and location with `harbour-daylight-jpeg`; different uploader, keyword and file type; has a crop | Exclusion, format and crop contrasts. | Common; `description` = `Harbour festival at the waterfront`; `credit` / `illustrator` = `Search Chips Shared Credit`; `city` = `Bristol`; `state` = `Somerset`; `country` = `United Kingdom`; `location` = `Harbourside`; `in` = those four location values; `keyword` = `harbour`, `night`; `subject` = `arts`; `category` = `agency`; `supplier` = `AP`; `uploader` = other user; `fileType` = `png`; `filename` = `search-chips-harbour-night-cropped-png.png`; `croppedBy` = current user; `persisted` = `exports`. |
| `pay-to-use-london` | Modern `pay-to-use` category; city and uploader differ from `legacy-chargeable-cardiff` | Category expansion and metadata filtering. | Common; `city` = `London`; `country` = `United Kingdom`; `in` = those two location values; `keyword` = `chargeable`; `category` = `pay-to-use`; no persistence reasons. |
| `legacy-chargeable-cardiff` | Legacy `chargeable` category; contrasting city and uploader | Legacy category compatibility. | Common; `city` = `Cardiff`; `country` = `United Kingdom`; `in` = those two location values; `keyword` = `chargeable`; `category` = `chargeable`; `uploader` = other user; `date` = `2024-06-16T12:00:00.000Z`; no persistence reasons. |
| `staff-photo-multi-persisted` | Photographer ownership; label, collection, photoshoot and archive | Ownership and multiple persistence reasons. | Common; `by` = `Example Internal Photographer`; `subject` = `sport`; `category` = `staff-photographer`; `label` / `#` = `search-chips-featured`; `photoshoot` = `Search Chips Harbour Shoot`; `is` = `<org>-owned-photo`, `<org>-owned`; `persisted` = `photographer-category`, `archived`, `photoshoot`, `labeled`, `persisted-collection`; additional backend `collection` / `~` = `search-chips`. |
| `contract-illustration-leased` | Illustrator ownership; lease | Ownership contrast and lease persistence. | Common; `by` / `credit` / `illustrator` = `Example Contracted Illustrator`; `subject` = `arts`; `category` = `contract-illustrator`; `leasedBy` = current user; `is` = `<org>-owned-illustration`, `<org>-owned`; `persisted` = `illustrator-category`, `leases`. |
| `split-print-and-published-usages` | Separate usages: one print, another published; neither has both | Detect cross-usage matching semantics. | Common; usage 1: `usages@platform` = `print`, `usages@status` = `pending`, Print details, added = `2024-06-15T12:00:00.000Z`; usage 2: `usages@platform` = `digital`, `usages@status` = `published`, added = `2024-06-15T12:00:00.000Z`; `persisted` = `usages`. |
| `print-published-at-midnight` | One usage that is both print and published | Contrast with `split-print-and-published-usages` and inclusive calendar-date boundaries. | Common; one usage: `usages@platform` = `print`, `usages@status` = `published`, Print details, added = `2024-06-15T00:00:00.000Z`; `persisted` = `usages`. |
| `missing-metadata-unpersisted` | Unknown rights; optional metadata and date taken absent; no persistence reasons | Missing-field and non-persisted baseline. | **No Common metadata defaults**: `title` = `Search chips image missing-metadata-unpersisted`; `description` = `Missing optional metadata`; `uploader` = current user; `fileType` = `jpeg`; `filename` = `search-chips-missing-metadata-unpersisted.jpg`; `date` = `2024-06-15T12:00:00.000Z`. All other ordinary chip fields absent/empty, including `dateTaken`; no persistence reasons. |
| `published-and-replaced-usages` | Both published and replaced usages | Status combinations and negation. | Common; usage 1: `usages@platform` = `digital`, `usages@status` = `published`, added = `2024-06-14T12:00:00.000Z`; usage 2: `usages@platform` = `digital`, `usages@status` = `replaced`, added = `2024-06-16T12:00:00.000Z`; `persisted` = `usages`. |
| `deleted-own-upload` | Deleted image belonging to the current uploader | Deleted visibility and ownership. | Common; `is` = `deleted`; no persistence reasons. |
| `deleted-other-upload` | Deleted image belonging to another uploader | Deleted visibility contrast. | Common; `uploader` = other user; `is` = `deleted`; no persistence reasons. |
| `tiff-identifier-over-quota` | TIFF, complete subject list, persisted identifier and over-quota supplier | Remaining format/subject options and identifier persistence. | Common; `fileType` = `tiff` (also searchable as `tif`); `filename` = `search-chips-tiff-identifier-over-quota.tiff`; `subject` = all 19 inventory values; `category` = `agency`; `supplier` = `AAP`; `persisted` = `persistence-identifier`; `identifiers.picdarUrn` = `search-chips-persistence-identifier`; does not match `is:under-quota` once the seeded quota report is loaded. |
| `legacy-commissioned-agency` | Legacy commissioned agency | Commissioned-agency persistence and category expansion. | Common; `category` = `commissioned-agency`; `supplier` = `Alamy`; `persisted` = `commissioned-agency`. |
| `edited-title` | Real title edit with original title retained | User-edit persistence. | Common; `title` = `Search chips edited title`; `category` = `agency`; `supplier` = `Allstar Picture Library`; `persisted` = `edited`. Original title is `Search chips image edited-title`. |
| `pr-and-third-party` | Modern PR/third-party rights | Remaining modern category option. | Common; `category` = `pr-and-third-party`; rights source = `Search Chips PR Office` (the `source` chip still searches Common metadata source); no persistence reasons. |
| `bylines-rights` | Bylines rights | Remaining category option. | Common; `category` = `Bylines`; no persistence reasons. |
| `contract-photographer` | Contract photographer | Remaining configured photographer suggestion and category. | Common; `by` = `Example Contracted Photographer`; `category` = `contract-photographer`; `is` = `<org>-owned-photo`, `<org>-owned`; `persisted` = `photographer-category`. |
| `commissioned-photographer` | Commissioned photographer | Remaining photographer category. | Common; `category` = `commissioned-photographer`; `is` = `<org>-owned-photo`, `<org>-owned`; `persisted` = `photographer-category`. |
| `staff-illustrator` | Staff illustrator | Remaining illustrator category and searchable creator name. | Common; `credit` / `illustrator` = `Example Staff Illustrator`; `category` = `staff-illustrator`; `is` = `<org>-owned-illustration`, `<org>-owned`; `persisted` = `illustrator-category`. |
| `commissioned-illustrator` | Commissioned illustrator | Remaining illustrator category and searchable creator name. | Common; `credit` / `illustrator` = `Example Commissioned Illustrator`; `category` = `commissioned-illustrator`; `is` = `<org>-owned-illustration`, `<org>-owned`; `persisted` = `illustrator-category`. |
| `assorted-usages-with-reference` | Remaining usage statuses/platforms and a named reference URL | Complete usage options and positive reference searches. | Common; usages (`usages@platform` / `usages@status`): `digital` / `removed`, `syndication` / `syndicated`, `download` / `downloaded`, `digital` / `derivative`, `digital` / `failed`, `digital` / `unknown`; every added timestamp = `2024-06-15T12:00:00.000Z`; the removed digital usage has `usages@reference` = `Search Chips Harbour Story` / `https://search-chips.invalid/stories/harbour`; `persisted` = `usages`. `Added to Photo Sales` searches the `syndication` platform. |
| `old-agency-pick` | Old, non-persisted agency pick | Positive reapable and agency-pick predicates. | Common; `description` = `Search chips topshot agency pick`; `category` = `agency`; `supplier` = `EPA`; `date` = `2000-01-01T12:00:00.000Z`; `is` = `agency-pick`, `reapable` when the clock is at least 20 days after upload; no persistence reasons. |
| `aap-quota-usage-1`, `aap-quota-usage-2` | AAP images with a recent qualifying usage | Push AAP over its seeded quota of 1. | Common; `category` = `agency`; `supplier` = `AAP`; one usage: `usages@platform` = `print`, `usages@status` = `published`, Print details, added = seed time; `persisted` = `usages`. |
| `supplier-getty-images` | Remaining supplier option | Positive supplier search. | Common; `category` = `agency`; `supplier` = `Getty Images`; no persistence reasons. |
| `supplier-pa` | Remaining supplier option | Positive supplier search. | Common; `category` = `agency`; `supplier` = `PA`; no persistence reasons. |
| `supplier-rex-features` | Remaining multi-word supplier option | Positive supplier search and under-quota contrast. | Common; `category` = `agency`; `supplier` = `Rex Features`; matches `is:under-quota` with the seeded report; no persistence reasons. |
| `supplier-ronald-grant-archive` | Remaining multi-word supplier option | Positive supplier search. | Common; `category` = `agency`; `supplier` = `Ronald Grant Archive`; no persistence reasons. |
| `supplier-action-images` | Remaining multi-word supplier option | Positive supplier search. | Common; `category` = `agency`; `supplier` = `Action Images`; no persistence reasons. |
