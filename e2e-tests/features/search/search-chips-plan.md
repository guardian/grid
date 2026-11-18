# Search chips plan

Interaction coverage for search chips in the
[search bar plan](./search-bar-plan.md). The registered keys are listed in the
[chip inventory](./search-chips-inventory.md).

## Scope and coverage strategy

The suite has **31 interaction cases**, excluding shared authentication setup.
They cover creating, editing and removing chips and choosing typeahead
suggestions; search-result combinations are covered separately.
Suggestions are not validation lists: most chips also accept manually typed
values.

## Fixtures

[search-chips.ts](../../fixtures/elasticsearch/search-chips.ts) adds two image
fixtures, appended after the captured images by the
[shared loader](../../setup/image-fixtures.ts), to back the indexed suggestion
lookups:

- `harbour-daylight-jpeg` supplies the `Search Chips Shared Credit` completion.
- `staff-photo-multi-persisted` supplies the `Search Chips Harbour Shoot`
  photoshoot completion.

## Implemented coverage

| Suite | Cases | Feature file | Step definitions |
| --- | --- | --- | --- |
| Interactions | 31 | [search-chips.feature](./search-chips.feature) | [search-chips.steps.ts](../../steps/search/search-chips.steps.ts), plus shared search steps |

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
covered by manual entry.

## Suggestion data sources


| Chip | Endpoint | Data source |
| --- | --- | --- |
| `by` | metadata-editor `/usage-rights/categories` | `photographer` options of `staff-photographer`/`contract-photographer`; both categories are added to `usageRights.applicable` in the [e2e config](../../setup/config.ts), with names from [service-config.js](../../../dev/script/generate-config/service-config.js#L67). |
| `supplier` | metadata-editor `/usage-rights/categories` | Agency `supplier` options from `freeSuppliers` in [service-config.js](../../../dev/script/generate-config/service-config.js#L54). |
| `category` | metadata-editor `/usage-rights/categories` | Category values/search aliases from `usageRights.applicable`. |
| `credit` | media-api `/suggest/metadata/credit` | `suggestMetadataCredit` completions indexed by the search-chip fixtures. |
| `photoshoot` | media-api `/suggest/metadata/photoshoot` | `userMetadata.photoshoot.suggest` on `staff-photo-multi-persisted`. |

