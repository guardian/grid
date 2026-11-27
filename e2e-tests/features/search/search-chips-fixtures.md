# Search chip fixture matrix

The nine purpose-named records are implemented in
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
`search-chips-other@guardian.co.uk`. Unlisted optional values are absent or empty, not inherited from another
row. `in` searches the listed location values together.

| Fixture | Proposed distinguishing data | Main purpose | All populated chip values (Common plus overrides/additions unless stated) |
| --- | --- | --- | --- |
| `harbour-daylight-jpeg` | Shared text, credit and location; person in image | Positive baseline and intersections. | Common; `description` = `Harbour festival at the waterfront`; `credit` / `illustrator` = `Search Chips Shared Credit`; `city` = `Bristol`; `state` = `Somerset`; `country` = `United Kingdom`; `location` = `Harbourside`; `in` = those four location values; `keyword` = `harbour`, `daylight`; `subject` = `arts`; `person` = `Alex Example`; `category` = `agency`; `supplier` = `Reuters`; `date` = `2024-06-14T12:00:00.000Z`; no persistence reasons. |
| `staff-photo-multi-persisted` | Photographer ownership; label, collection, photoshoot and archive | Ownership and multiple persistence reasons. | Common; `by` = `Example Internal Photographer`; `subject` = `sport`; `category` = `staff-photographer`; `label` / `#` = `search-chips-featured`; `photoshoot` = `Search Chips Harbour Shoot`; `is` = `<org>-owned-photo`, `<org>-owned`; `persisted` = `photographer-category`, `archived`, `photoshoot`, `labeled`, `persisted-collection`; additional backend `collection` / `~` = `search-chips`. |
| `contract-illustration-leased` | Illustrator ownership; lease | Ownership contrast and lease persistence. | Common; `by` / `credit` / `illustrator` = `Example Contracted Illustrator`; `subject` = `arts`; `category` = `contract-illustrator`; `leasedBy` = current user; `is` = `<org>-owned-illustration`, `<org>-owned`; `persisted` = `illustrator-category`, `leases`. |
| `missing-metadata-unpersisted` | Unknown rights; optional metadata and date taken absent; no persistence reasons | Missing-field and non-persisted baseline. | **No Common metadata defaults**: `title` = `Search chips image missing-metadata-unpersisted`; `description` = `Missing optional metadata`; `uploader` = current user; `fileType` = `jpeg`; `filename` = `search-chips-missing-metadata-unpersisted.jpg`; `date` = `2024-06-15T12:00:00.000Z`. All other ordinary chip fields absent/empty, including `dateTaken`; no persistence reasons. |
| `deleted-own-upload` | Deleted image belonging to the current uploader | Deleted visibility and ownership. | Common; `is` = `deleted`; no persistence reasons. |
| `deleted-other-upload` | Deleted image belonging to another uploader | Deleted visibility contrast. | Common; `uploader` = other user; `is` = `deleted`; no persistence reasons. |
| `staff-illustrator` | Staff illustrator | Remaining illustrator category and searchable creator name. | Common; `credit` / `illustrator` = `Example Staff Illustrator`; `category` = `staff-illustrator`; `is` = `<org>-owned-illustration`, `<org>-owned`; `persisted` = `illustrator-category`. |
| `commissioned-illustrator` | Commissioned illustrator | Remaining illustrator category and searchable creator name. | Common; `credit` / `illustrator` = `Example Commissioned Illustrator`; `category` = `commissioned-illustrator`; `is` = `<org>-owned-illustration`, `<org>-owned`; `persisted` = `illustrator-category`. |
| `assorted-usages-with-reference` | Remaining usage statuses/platforms and a named reference URL | Complete usage options and positive reference searches. | Common; usages (`usages@platform` / `usages@status`): `digital` / `removed`, `syndication` / `syndicated`, `download` / `downloaded`, `digital` / `derivative`, `digital` / `failed`, `digital` / `unknown`; every added timestamp = `2024-06-15T12:00:00.000Z`; the removed digital usage has `usages@reference` = `Search Chips Harbour Story` / `https://search-chips.invalid/stories/harbour`; `persisted` = `usages`. `Added to Photo Sales` searches the `syndication` platform. |
