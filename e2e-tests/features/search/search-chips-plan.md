# Search chips plan

Implemented fixtures and executable coverage for the
[search bar plan](./search-bar-plan.md). The registered keys are listed in the
[chip inventory](./search-chips-inventory.md) and each fixture's values in the
[fixture matrix](./search-chips-fixtures.md).

Use the current `@guardian/cql` input, not the legacy chips input or its retiring feature switch.

## Scope and coverage strategy

The suite uses **12 core images plus 16 supplemental images**, with
**31 interaction cases and 74 result cases** (105 browser cases, excluding
shared authentication setup). All planned behaviors have runnable scenarios and
step definitions. Two result cases expose a confirmed search defect; implemented
coverage is not the same as a fully passing application.
Suggestions are not validation lists: most chips also accept manually typed
values. Dynamic values below describe the checked-in e2e configuration, not
production.

The suite samples distinct interaction and query semantics rather than the
Cartesian product of all values. Exhaustive parser permutations, arbitrary
metadata strings and every possible dotted field path belong in lower-level
tests, not additional browser cases.

## Inventory coverage

All 39 built-in keys now have positive fixture data or a derived-predicate
example. All enumerated inventory subjects, supplier options, categories,
formats, configured photographer names and usage statuses/platforms are
represented. This closes the identified **data** gaps; it does not claim that
every field/value has already been exercised in browser scenarios.

| Previously identified gap | Fixture/configuration coverage |
| --- | --- |
| `usages@reference` | `assorted-usages-with-reference` supplies both a reference name and URI on one usage; `missing-metadata-unpersisted` has no usages. |
| Searchable illustrator name | `contract-illustration-leased`'s `metadata.credit`, completion and usage-rights creator all contain `Example Contracted Illustrator`; `staff-illustrator`/`commissioned-illustrator` add staff/commissioned names. |
| `has` existence contrasts | Each pairs a positive fixture with `missing-metadata-unpersisted`: `crops` via `harbour-night-cropped-png`; `labels` via `staff-photo-multi-persisted`; `people`, `city`, `dateTaken` and `usageRights` via `harbour-daylight-jpeg`. Empty arrays/objects do not imply indexed field existence. |
| Conditional `is` predicates | `old-agency-pick` has the configured `topshot` agency-pick term and is old enough for reaping under the current clock, with no persistence reasons. `tiff-identifier-over-quota` is non-reapable because it has a persisted identifier. With the seeded quota report loaded, its AAP supplier is over quota (695/400), while `supplier-rex-features` is under quota (1383/1600). `staff-photo-multi-persisted`/`contract-illustration-leased` cover ownership; `deleted-own-upload`/`deleted-other-upload` cover deletion. |
| All 12 persistence reasons | `tiff-identifier-over-quota`: `persistence-identifier`; `harbour-night-cropped-png`: `exports`; `split-print-and-published-usages`, `print-published-at-midnight`, `published-and-replaced-usages`, `assorted-usages-with-reference`: `usages`; `staff-photo-multi-persisted`: `archived`, `photographer-category`, `persisted-collection`, `photoshoot`, `labeled`; `contract-illustration-leased`: `illustrator-category`, `leases`; `legacy-commissioned-agency`: `commissioned-agency`; `edited-title`: `edited`; `missing-metadata-unpersisted`: none. |
| Remaining finite options | `tiff-identifier-over-quota`: TIFF and every subject; `legacy-commissioned-agency`, `pr-and-third-party`, `bylines-rights`, `contract-photographer`, `commissioned-photographer`, `staff-illustrator`, `commissioned-illustrator`: remaining categories; `contract-photographer`: contracted photographer; `assorted-usages-with-reference`: remaining usage statuses and `download`/`syndication`; the two harbour fixtures, `tiff-identifier-over-quota`, `legacy-commissioned-agency`, `edited-title`, `old-agency-pick` and the five named supplier fixtures: all 11 suppliers. JPEG/PNG remain `harbour-daylight-jpeg`/`harbour-night-cropped-png`; `jpg`/`tif` are query aliases for the existing JPEG/TIFF records. |
| Configured alias with options | `fixtureSubject` maps to `metadata.subjects`, offering `arts`, `news`, `sport`; `harbour-daylight-jpeg`, `staff-photo-multi-persisted` and `tiff-identifier-over-quota` provide those values. |
| Configured manual-entry alias | `fixtureReference` maps to `metadata.suppliersReference`, has no option list, and matches values such as `search-chips-harbour-daylight-jpeg`; `missing-metadata-unpersisted` has no supplier reference. |
| Configured existence alias | `fixtureHasPerson` maps to `metadata.peopleInImage`, offers `true`/`false` with `matchViaExistence`; `harbour-daylight-jpeg` is positive and `missing-metadata-unpersisted` is negative. |

The [e2e config generator](../../setup/config.ts) enables `useReaper` and
`showSendToPhotoSales`; download recording is enabled. All collections persist
(`persistence.onlyTheseCollections = null`), and the persistence identifier is
explicitly `picdarUrn`. Aliases are shared by Kahuna and media-api. Agency-pick
ingredients and the quota seed are supplied by the existing dev configuration.
These are chooser/query settings only: no reaper deletion process is started.
Wait for the quota store to load before asserting quota contrasts, and control
the clock when testing reaping thresholds or relative dates.

Additional backend syntax is not a finite chip option list. `staff-photo-multi-persisted` covers
`collection`/`~`; the existing upload/date-taken fields support `uploaded` and
`taken`; configured alias paths above provide dotted-field examples. Arbitrary
strings, field paths, date expressions and all parser permutations cannot be
exhaustively enumerated by a finite fixture set. `similar` requires the separate
AI-search infrastructure, disabled in this e2e stack, and remains outside this
chip plan rather than an unresolved metadata-fixture gap.

Run the focused data/configuration regression checks with
`node --test fixtures/elasticsearch/search-chips.test.ts` from the e2e package.
They verify finite option coverage, reference/creator data, new persistence
sources, alias settings and preservation of the original missing-field and
usage contrasts. Live API/browser searches still need a running, restarted and
reseeded stack; fixture checks do not replace those integration assertions.

Scope searches with the supported `ids` parameter so unrelated seeded images
cannot affect expected results. Do not add a shared label for isolation: a label
would itself change persistence behaviour, especially for `missing-metadata-unpersisted`.

## Implemented values

`SEARCH_CHIP_IMAGE_IDS` maps every fixture name to its ID, calculated as the SHA-1 of
`search-chips-<role>`. Use these IDs with the `ids` search parameter rather than
adding an isolation label. The current uploader is `TEST_ACCOUNTS.fullAccess`;
the contrasting uploader is `search-chips-other@guardian.co.uk`.

`SEARCH_CHIP_CORE_IMAGE_IDS` retains just the 12 `SEARCH_CHIP_CORE_ROLES`
(`harbour-daylight-jpeg` through `deleted-other-upload` in the [matrix](./search-chips-fixtures.md)). The
existing result-combination Given step uses that core scope so supplemental
records do not change its expected matches. Scope supplemental cases with their
explicit names from the full `SEARCH_CHIP_IMAGE_IDS` export.

- `harbour-daylight-jpeg` and `harbour-night-cropped-png` share
  `Harbour festival at the waterfront`, credit `Search Chips Shared Credit`,
  Bristol, Somerset, United Kingdom and sublocation Harbourside. The daylight
  fixture is JPEG with keyword `daylight`; the night fixture is PNG with keyword
  `night` and a crop by the current user. Both have `harbour` and subject `arts`.
- `pay-to-use-london` is London/pay-to-use/current uploader;
  `legacy-chargeable-cardiff` is Cardiff/chargeable/other uploader.
- `staff-photo-multi-persisted` uses Example Internal Photographer and Example
  publication, label `search-chips-featured`, collection `search-chips`,
  photoshoot `Search Chips Harbour Shoot` and archive status. The collection is
  also created by the [collection seeder](../../setup/seed-collections.ts).
- `contract-illustration-leased` uses Example Contracted Illustrator in both
  byline and credit, and Example publication, with an open-ended allow-use lease
  by the current user.
- `split-print-and-published-usages` has print/pending and digital/published
  usages; `print-published-at-midnight` has print/published.
  `published-and-replaced-usages` has digital/published and digital/replaced usages.
- `missing-metadata-unpersisted` has only title/description metadata, unknown
  rights, no edits, identifiers, crops, usages, leases or collections.
  `deleted-own-upload` and `deleted-other-upload` are soft-deleted records owned
  by the current and other uploader respectively.
- The supplemental and named supplier records provide the values listed in the
  matrix. `edited-title` retains its original title separately from its edited
  title; `old-agency-pick` uploads on `2000-01-01T12:00:00.000Z` for the
  reaping-age contrast.

The fixed timestamp is `2024-06-15T12:00:00.000Z`. `harbour-daylight-jpeg`
uploads one day before it; `legacy-chargeable-cardiff` uploads one day after it.
`published-and-replaced-usages` has usage dates that also straddle it. All
records except `missing-metadata-unpersisted` have date-taken metadata at that
boundary. `print-published-at-midnight`'s usage is added at midnight on 15 June
so equal inclusive calendar-date constraints exercise the boundary without
requiring unsupported timestamp-expression syntax. Credit completions match
metadata; `staff-photo-multi-persisted`'s photoshoot completion is stored in
`userMetadata.photoshoot.suggest`.

The existing image-file seeder backs these records with the same placeholder
JPEG as the captured records, including the indexed PNG and TIFF sources of
`harbour-night-cropped-png` and `tiff-identifier-over-quota`. These fixtures
test indexed search metadata, not original file decoding or upload ingestion.
Restart `dev:e2e` to regenerate the conditional-chip/alias configuration and
reseed the data before running scenarios. `GRID_RESEED=true` refreshes fixtures
on a reused stack, but a data-only reseed does not reload running service config.

## Implemented coverage

All planned behaviors have evidence-annotated scenarios and executable steps.
Each outline example is an independent browser test with a stable descriptive
name. No scenario is left as `@todo` or awaiting step definitions.

| Suite | Cases | Feature file | Step definitions |
| --- | --- | --- | --- |
| Interactions | 31 | [search-chips.feature](./search-chips.feature) | [search-chips.steps.ts](../../steps/search/search-chips.steps.ts), plus shared search steps |
| Results | 74 | [search-chips-results.feature](./search-chips-results.feature) | [search-chips-results.steps.ts](../../steps/search/search-chips-results.steps.ts) |

### Interactions

| Behavior | Coverage |
| --- | --- |
| Manual entry and field names | City, suggested field names, manual credit outside completions, free-entry alias and unsuggested usage status. |
| Local/configured suggestions | Format, subject, conditional platforms and predicates, persistence reasons, option-list and existence aliases. |
| Real API suggestions | Photographer, supplier and category options from metadata-editor's `/usage-rights/categories`; prefixed credit and photoshoot completions from media-api's `/suggest/metadata/credit` and `/suggest/metadata/photoshoot`. |
| Editing | A supplier suggestion replaces an existing chip without duplicating it. |
| Negation and removal | Polarity serializes correctly; removing one chip preserves neighboring text and another chip. |
| Quoting | A complete quoted expression remains one multi-word chip value and round-trips correctly. |
| Keyboard | Navigation into a chip permits character deletion; Backspace removes a newly typed empty chip. |
| URL and history | URL hydration, browser back and forward restore values, polarity and adjacent text. |

Label, source and illustrator value suggestions have no browser scenarios: the
label resolver follows a `suggested-labels` relation media-api does not advertise,
the source resolver expands to an unrouted `/suggest/metadata/source`, and the
illustrator resolver reads `options` that the contract-illustrator `creator`
property does not provide (it only has `optionsMap`). Those chips are still
covered by manual entry and result scenarios.

### Results

| Behavior | Fixtures and expectations |
| --- | --- |
| Intersections and exclusions | `harbour-daylight-jpeg`/`harbour-night-cropped-png` distinguish positive city/keyword intersections and excluded values. |
| Category compatibility | `pay-to-use-london`/`legacy-chargeable-cardiff` match modern pay-to-use expansion; `legacy-commissioned-agency`/`pr-and-third-party` match PR expansion; `bylines-rights` and the photographer/illustrator fixtures cover other configured categories. |
| Format and crops | `harbour-daylight-jpeg`/`harbour-night-cropped-png` distinguish JPEG without a crop from PNG with a crop; `tiff-identifier-over-quota` adds TIFF and `tif`. |
| Location scope | The harbour, London and Cardiff fixtures distinguish `in`, `city` and `location` with additional metadata and a zero-match near-miss. |
| Ownership | `staff-photo-multi-persisted`/`contract-illustration-leased` distinguish owned photographs, illustrations and aggregate ownership. |
| Compound persistence | `staff-photo-multi-persisted` intersects label, collection, photoshoot and archive persistence; `contract-illustration-leased` intersects lease owner and lease persistence; `missing-metadata-unpersisted` is the near-miss. |
| Same-usage matching | `print-published-at-midnight` matches print/published on one usage; `split-print-and-published-usages` does not satisfy the combination across separate usages. |
| Replaced defaults and negation | `print-published-at-midnight`/`published-and-replaced-usages` distinguish default exclusion, explicit replacement searches, impossible combined statuses and image-wide nested negation. |
| Date boundaries and missing fields | `print-published-at-midnight`'s usage matches equal inclusive calendar-date bounds; it also contrasts with `missing-metadata-unpersisted` for capture-date existence on the same upload date. |
| Deleted visibility | `deleted-own-upload`/`deleted-other-upload` are hidden by default and match explicit deletion plus their respective uploader; this account has global delete permission. |
| All persistence reasons | Every reason has a positive fixture and `missing-metadata-unpersisted` as the non-persisted near-miss. |
| Supplemental options | Every supplemental record has a positive result case, including creators, suppliers, subjects, statuses, platforms, reference name/URI and edited title. |
| Aliases and conditional predicates | Option lists, manual references, true/false existence, agency picks, reaping and positive/negated quota searches. Quota cases wait for the real report. |

Searches use explicit `ids` scopes and near-misses. The original scope retains
the 12 core fixtures; the selected-fixture step accepts any known fixture name. Assertions check both
the exact total and visible image IDs, including zero matches. The real UI,
lookup APIs and seeded search data are exercised without per-test API mocks.
The shared CQL input is not redundantly tested across both layouts; AI
similarity and unrelated controls remain in the parent search plan.

## Suggestion data sources

Every remaining suggestion scenario uses a routed endpoint on the running stack,
with no network mocks:

| Chip | Endpoint | Data source |
| --- | --- | --- |
| `by` | metadata-editor `/usage-rights/categories` | `photographer` options of `staff-photographer`/`contract-photographer`; both categories are added to `usageRights.applicable` in the [e2e config](../../setup/config.ts), with names from [service-config.js](../../../dev/script/generate-config/service-config.js#L67). |
| `supplier` | metadata-editor `/usage-rights/categories` | Agency `supplier` options from `freeSuppliers` in [service-config.js](../../../dev/script/generate-config/service-config.js#L54). |
| `category` | metadata-editor `/usage-rights/categories` | Category values/search aliases from `usageRights.applicable`. |
| `credit` | media-api `/suggest/metadata/credit` | `suggestMetadataCredit` completions indexed by the search-chip fixtures. |
| `photoshoot` | media-api `/suggest/metadata/photoshoot` | `userMetadata.photoshoot.suggest` on `staff-photo-multi-persisted`. |

