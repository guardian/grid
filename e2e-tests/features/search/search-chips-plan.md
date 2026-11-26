# Search chips plan

Coverage for search chips in the
[search bar plan](./search-bar-plan.md). The registered keys are listed in the
[chip inventory](./search-chips-inventory.md) and each fixture's values in the
[fixture matrix](./search-chips-fixtures.md).

## Scope and coverage strategy

The suite has **31 interaction cases** and **7 result cases**, excluding shared
authentication setup. Interaction cases cover creating, editing and removing
chips and choosing typeahead suggestions. Result cases run real chip queries
against seeded images and are kept only where they exercise client code that no
other scenario covers.
Suggestions are not validation lists: most chips also accept manually typed
values.

Search behaviour that is decided entirely by media-api and Elasticsearch is not
tested in the browser. It is covered by `ParserTest`, `QueryBuilderTest` and
`ElasticSearchTest` in media-api, which index fixture images and assert the exact
matches for persistence reasons, category expansion, ownership, agency picks,
reaping, quotas, field aliases, deleted-image visibility, usage matching and
dates, `leasedBy` and `supplier`.

## Fixtures

[search-chips.ts](../../fixtures/elasticsearch/search-chips.ts) adds nine image
fixtures, appended after the captured images by the
[shared loader](../../setup/image-fixtures.ts). They back the indexed suggestion
lookups and the result cases; see the [fixture matrix](./search-chips-fixtures.md)
for every value.

- `harbour-daylight-jpeg` supplies the `Search Chips Shared Credit` completion.
- `staff-photo-multi-persisted` supplies the `Search Chips Harbour Shoot`
  photoshoot completion, and the label, `search-chips` collection and archive
  status for the combined label/collection result case. The collection is also
  created by the [collection seeder](../../setup/seed-collections.ts).
- `contract-illustration-leased`, `staff-illustrator` and
  `commissioned-illustrator` back the `illustrator:` result cases.
- `assorted-usages-with-reference` backs the `persisted:usages` result case.
- `deleted-own-upload` and `deleted-other-upload` back the deleted-image result case.
- `missing-metadata-unpersisted` is the near-miss with no optional metadata or
  persistence reasons.

`SEARCH_CHIP_IMAGE_IDS` maps each fixture name to its ID, the SHA-1 of
`search-chips-<role>`. Result searches are scoped with the `ids` parameter so
unrelated seeded images cannot affect the expected matches. Do not add a shared
label for isolation: a label would itself change persistence behaviour.

## Implemented coverage

| Suite | Cases | Feature file | Step definitions |
| --- | --- | --- | --- |
| Interactions | 31 | [search-chips.feature](./search-chips.feature) | [search-chips.steps.ts](../../steps/search/search-chips.steps.ts), plus shared search steps |
| Results | 7 | [search-chips-results.feature](./search-chips-results.feature) | [search-chips-results.steps.ts](../../steps/search/search-chips-results.steps.ts) |

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
covered by manual entry and, for labels and illustrators, by result cases.

### Results

Each case asserts the exact total and visible image IDs.

| Behavior | Fixtures and expectations | Client code exercised |
| --- | --- | --- |
| Label, collection, photoshoot and archive intersect | `staff-photo-multi-persisted` matches `#search-chips-featured ~"search-chips" photoshoot:"…" persisted:archived`; `missing-metadata-unpersisted` does not. | Label and collection chip parsing and rendering, label suggestions, collection sort order and the `orderBy` watcher. |
| Illustrator names (3) | Contracted, staff and commissioned illustrator names each return only their own fixture. | Illustrator value suggestions. |
| Existence alias | `fixtureHasPerson:true` returns `harbour-daylight-jpeg`, not `missing-metadata-unpersisted`. | Graphic-image blur keyword check while rendering results. |
| Persistence by usage | `persisted:usages` returns `assorted-usages-with-reference`. | Photo Sales flag in the image preview. |
| Explicit deleted search | `is:deleted uploader:<current user>` returns `deleted-own-upload`, not `deleted-other-upload`. | No-results telemetry fallback. |

## Suggestion data sources


| Chip | Endpoint | Data source |
| --- | --- | --- |
| `by` | metadata-editor `/usage-rights/categories` | `photographer` options of `staff-photographer`/`contract-photographer`; both categories are added to `usageRights.applicable` in the [e2e config](../../setup/config.ts), with names from [service-config.js](../../../dev/script/generate-config/service-config.js#L67). |
| `supplier` | metadata-editor `/usage-rights/categories` | Agency `supplier` options from `freeSuppliers` in [service-config.js](../../../dev/script/generate-config/service-config.js#L54). |
| `category` | metadata-editor `/usage-rights/categories` | Category values/search aliases from `usageRights.applicable`. |
| `credit` | media-api `/suggest/metadata/credit` | `suggestMetadataCredit` completions indexed by the search-chip fixtures. |
| `photoshoot` | media-api `/suggest/metadata/photoshoot` | `userMetadata.photoshoot.suggest` on `staff-photo-multi-persisted`. |

