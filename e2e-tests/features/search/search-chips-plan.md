# Search chips plan

Chip inventory, implemented fixtures and executable coverage for the
[search bar plan](./search-bar-plan.md).

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

## Chip inventory

Classification describes **value suggestions**, not whether the key itself is
suggested or whether arbitrary values are valid. The CQL input consumes the
[same registered keys and resolvers][cql-typeahead]. There are 14 built-in keys
with a value resolver (8 API lookups and 6 local/configured option lists), plus
25 built-in keys without one. `persisted` is conditional; configured aliases
are additional to these counts.

Rows are sorted by classification: API lookup, local/configured options, manual
entry, and additional backend syntax. Built-in keys are alphabetical within each
group. Configured aliases appear
in the applicable suggestion/manual-entry group. A declared resolver is not a
claim that its API wiring has been verified to work.

**Manual entry** means no value resolver and no enumerated frontend value list.
Dates, field names and identifiers can still have backend constraints. In those
rows the Value Source column links to the registration that omits a resolver;
the Backend Interpretation column identifies the parser/mapping instead of
inventing a value-definition list.

| Chip | Classification | Current values or source | Key definition | Value source | Backend interpretation | Coverage notes |
| --- | --- | --- | --- | --- | --- | --- |
| `by` | Value suggestions: API lookup | Configured photographers: Example External Photographer, Example Internal Photographer, Example Contracted Photographer | [Key][key-by] | [Category API extraction][photographer-values] | [Maps to `metadata.byline`][named-fields] | Quote names containing spaces; search is not against the usage-rights photographer property. |
| `category` | Value suggestions: API lookup | `pay-to-use`, `pr-and-third-party`, `agency`, `Bylines`, `staff-photographer`, `contract-photographer`, `commissioned-photographer`, `contract-illustrator`, `commissioned-illustrator`, `staff-illustrator` | [Key][key-category] | [Category values/search aliases][category-values] | [`usageRights.category` mapping][field-paths]; [legacy category expansion][category-query] | Include modern and legacy category expansion. |
| `credit` | Value suggestions: API lookup | Indexed completions through `/suggest/metadata/credit`; depends on seeded images | [Key][key-credit] | [Resolver][credit-values]; [completion field][completion-fields] | [`metadata.credit` mapping][field-paths] | Verify resolver response shape, not just the presence of indexed completions. |
| `illustrator` | Value suggestions: API lookup | Configured creator options; currently Example Contracted Illustrator | [Key][key-illustrator] | [Category API extraction][illustrator-values] | [Maps to `metadata.credit`][named-fields] | Verify the resolver/API property shape; the backend does not search the usage-rights creator property. |
| `label` / `#` | Value suggestions: API lookup | Arbitrary labels, with a declared suggestion lookup | [Key][key-label]; [CQL shortcut][cql-shortcuts] | [Resolver][label-values]; [requested relation][label-relation] | [Maps to `userMetadata.labels`][named-fields]; [`#` parsing][hash-query] | The requested `suggested-labels` relation is absent from the [advertised links][metadata-relation]. |
| `photoshoot` | Value suggestions: API lookup | Indexed completions through `/suggest/metadata/photoshoot`; seeded for `staff-photo-multi-persisted` | [Key][key-photoshoot] | [Resolver][photoshoot-values]; [completion field][completion-fields] | [Maps to `userMetadata.photoshoot.title`][image-aliases] | Verify resolver response shape separately from seeded completion data. |
| `source` | Value suggestions: API lookup | Requests metadata suggestions for source | [Key][key-source] | [Resolver][source-values]; [advertised URI template][metadata-relation] | [`metadata.source` mapping][field-paths] | The advertised lookup expands to `/suggest/metadata/source`, absent from the [routes][suggestion-routes]; the separate generic metadata route is not what this resolver follows. |
| `supplier` | Value suggestions: API lookup | AAP, Alamy, Allstar Picture Library, AP, EPA, Getty Images, PA, Reuters, Rex Features, Ronald Grant Archive, Action Images | [Key][key-supplier] | [Agency supplier property options][supplier-values] | [`usageRights.supplier` mapping][field-paths] | Configured options, including multi-word values. |
| Configured aliases with options | Value suggestions: local/configured options | Alias-specific non-empty `searchHintOptions` | [Dynamic key registration][alias-keys] | [Option-list selection][alias-values] | [Configured Elasticsearch path and existence matching][alias-query] | Only aliases with `displaySearchHint` enabled enter this registry. |
| `fileType` | Value suggestions: local/configured options | Suggested: `jpeg`, `tiff`, `png`; backend also supports `jpg`, `tif` | [Key][key-fileType] | [Local list][file-type-values] | [MIME field mapping][mime-field]; [accepted values/MIME conversion][mime-values] | Distinguish suggestions from accepted aliases. |
| `is` | Value suggestions: local/configured options | `<org>-owned-photo`, `<org>-owned-illustration`, `<org>-owned`, `under-quota`, `deleted`; conditionally `reapable`, `agency-pick` | [Key][key-is] | [Configured/local list][is-values] | [Special predicate dispatch][is-query] | Ownership and conditional values depend on config; these are not ordinary metadata values. |
| `persisted` | Value suggestions: local/configured options | `persistence-identifier`, `exports`, `usages`, `archived`, `photographer-category`, `illustrator-category`, `commissioned-agency`, `leases`, `persisted-collection`, `photoshoot`, `labeled`, `edited` | [Conditional key][key-persisted] | [Reaper-dependent list][persisted-values] | [Persistence-reason lookup][persisted-query]; [reason definitions][persistence-reasons] | The chooser is registered only when `useReaper` is true; compare with `missing-metadata-unpersisted`, which has no persistence reasons. |
| `subject` | Value suggestions: local/configured options | `arts`, `crime`, `disaster`, `finance`, `education`, `environment`, `health`, `human`, `labour`, `lifestyle`, `nature`, `news`, `politics`, `religion`, `science`, `social`, `sport`, `war`, `weather` | [Key][key-subject] | [Local list][subject-values] | [Maps to `metadata.subjects`][named-fields] | Sample representative values, not every subject. |
| `usages@platform` | Value suggestions: local/configured options | `print`, `digital`; conditionally `download`, `Added to Photo Sales` | [Key][key-usages-platform] | [Config-dependent list][platform-values] | [Nested usage matching][nested-query]; [Photo Sales translates to `syndication`][field-query] | Availability depends on configuration. |
| `usages@status` | Value suggestions: local/configured options | Suggested: `published`, `pending`, `removed`, `replaced`; model also has `syndicated`, `downloaded`, `derivative`, `failed`, `unknown` | [Key][key-usages-status] | [Inline option list][status-values] | [Nested usage matching][nested-query]; [default replaced exclusion][parser-defaults] | Suggested values are not the entire model enum. `published-and-replaced-usages` requires an explicit replaced-status search to override the default exclusion. |
| Configured aliases without options | Manual entry | User-entered; no enumerated list | [Dynamic key registration][alias-keys] | [Resolver omitted for an empty option list][alias-values] | [Configured Elasticsearch path and existence matching][alias-query] | Visibility depends on `displaySearchHint`; some aliases interpret literal booleans as existence tests. |
| `city` | Manual entry | User-entered city | [Key][key-city] | [No value resolver][key-city] | [`metadata.city` mapping][field-paths] | Contrast with `in`. |
| `copyright` | Manual entry | User-entered metadata text | [Key][key-copyright] | [No value resolver][key-copyright] | [`metadata.copyright` mapping][field-paths] | Include quoted text. |
| `country` | Manual entry | User-entered country | [Key][key-country] | [No value resolver][key-country] | [`metadata.country` mapping][field-paths] | Contrast with `in`. |
| `croppedBy` | Manual entry | User-entered email/source identifier | [Key][key-croppedBy] | [No value resolver][key-croppedBy] | [Maps to `exports.author`][image-aliases] | Exercise current versus another user. |
| `date` | Manual entry | Year/month/day expressions, `today`, `yesterday` | [Key][key-date] | [No value resolver][key-date] | [Upload-time mapping][date-fields]; [date expression parsing][date-values] | Manual entry, but constrained date syntax; control time for relative dates. |
| `dateTaken` | Manual entry | User-entered ordinary field-search value | [Key][key-dateTaken] | [No value resolver][key-dateTaken] | [`metadata.dateTaken` mapping][field-paths]; [ordinary field matching][field-query] | Backend `taken:` uses the [special date parser][date-fields]; do not equate it with `dateTaken:`. |
| `description` | Manual entry | User-entered metadata text | [Key][key-description] | [No value resolver][key-description] | [`metadata.description` mapping][field-paths] | Include quoted text and intersections. |
| `filename` | Manual entry | User-entered filename | [Key][key-filename] | [No value resolver][key-filename] | [Maps to `uploadInfo.filename`][image-aliases] | Use deterministic fixture filenames. |
| `has` | Manual entry | Indexed field name, e.g. `crops`, `dateTaken`, `usageRights`, `city`, `people`, `labels` | [Key][key-has] | [No value resolver][key-has] | [Field-existence predicate][has-query]; [field/alias resolution][field-paths] | No frontend list, but the value names an indexed field, not arbitrary metadata text. |
| `in` | Manual entry | User-entered location text | [Key][key-in] | [No value resolver][key-in] | [Searches sublocation, city, state and country][named-fields] | Include a match outside the city field. |
| `keyword` | Manual entry | User-entered keyword | [Key][key-keyword] | [No value resolver][key-keyword] | [Maps to `metadata.keywords`][named-fields] | Contrast keywords across `harbour-daylight-jpeg`/`harbour-night-cropped-png`. |
| `leasedBy` | Manual entry | User-entered email/source identifier | [Key][key-leasedBy] | [No value resolver][key-leasedBy] | [Maps to `leases.leases.leasedBy`][image-aliases] | Exercise `contract-illustration-leased`'s lease owner. |
| `location` | Manual entry | User-entered sublocation | [Key][key-location] | [No value resolver][key-location] | [Maps to `metadata.subLocation`][named-fields] | Not the same scope as `in`. |
| `person` | Manual entry | User-entered person's name | [Key][key-person] | [No value resolver][key-person] | [Maps to `metadata.peopleInImage`][named-fields] | Use contrasting people metadata. |
| `specialInstructions` | Manual entry | User-entered metadata text | [Key][key-specialInstructions] | [No value resolver][key-specialInstructions] | [`metadata.specialInstructions` mapping][field-paths] | Quote multi-word values. |
| `state` | Manual entry | User-entered state/region | [Key][key-state] | [No value resolver][key-state] | [`metadata.state` mapping][field-paths] | Contrast with `in`. |
| `suppliersReference` | Manual entry | User-entered supplier reference | [Key][key-suppliersReference] | [No value resolver][key-suppliersReference] | [`metadata.suppliersReference` mapping][field-paths] | Use deterministic reference values. |
| `title` | Manual entry | User-entered title text | [Key][key-title] | [No value resolver][key-title] | [`metadata.title` mapping][field-paths] | Include quoted text and intersections. |
| `uploader` | Manual entry | User-entered email/source identifier | [Key][key-uploader] | [No value resolver][key-uploader] | [Maps to top-level `uploadedBy`][named-fields] | Respect another uploader named explicitly. |
| `usages@<added` | Manual entry | User-entered date upper boundary | [Key][key-usages-before] | [No value resolver][key-usages-before] | [Nested date constraints][nested-date-query]; [inclusive ranges][field-query] | Date syntax is constrained; include the boundary. |
| `usages@>added` | Manual entry | User-entered date lower boundary | [Key][key-usages-after] | [No value resolver][key-usages-after] | [Nested date constraints][nested-date-query]; [inclusive ranges][field-query] | Use fixed timestamps for assertions. |
| `usages@orderedBy` | Manual entry | User-entered ordering identifier | [Key][key-usages-orderedBy] | [No value resolver][key-usages-orderedBy] | [Print ordered-by mapping, allowing configured overrides][ordered-by-query] | Quote multi-word values. |
| `usages@publication` | Manual entry | User-entered publication code or name | [Key][key-usages-publication] | [No value resolver][key-usages-publication] | [Nested publication code/name mapping][nested-fields] | Pair with platform/status. |
| `usages@reference` | Manual entry | User-entered reference name or URL | [Key][key-usages-reference] | [No value resolver][key-usages-reference] | [Usage reference URI/name mapping][named-fields] | Quote values where needed. |
| `usages@section` | Manual entry | User-entered print section code or name | [Key][key-usages-section] | [No value resolver][key-usages-section] | [Nested section code/name mapping][nested-fields] | Pair with platform/status. |
| Additional backend syntax | Additional backend syntax; not part of the 39 registered keys | `collection`/`~`, `similar`, `uploaded`, `taken`, canonical aliases and arbitrary dotted field paths | [Backend grammar][backend-keys]; [CQL shortcuts][cql-shortcuts] | No shared value resolver established by this registry | [Collections][collection-query], [dates][date-fields], [open-ended field resolution][named-fields] and [AI-only similar handling][similar-query] | Separate controls may supply values; backend acceptance alone does not establish chip typeahead support. |

For ordinary fields, the mapping references above identify the indexed path;
[query construction][field-query] determines word/phrase matching. Dynamic
lookups obtain their values through the [usage-rights API][rights-api] or
[media-api helpers][metadata-helper], not a closed list in the key registration.
The [advertised metadata relation][metadata-relation] determines the actual
lookup URL. `#` is shorthand for `label`, not an additional registered key.

[cql-typeahead]: ../../../kahuna/public/js/components/gr-cql-input/gr-cql-input.ts#L28
[cql-shortcuts]: ../../../kahuna/public/js/components/gr-cql-input/syntax.ts#L17
[key-by]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L113
[key-category]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L118
[key-city]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L121
[key-copyright]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L122
[key-country]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L123
[key-credit]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L125
[key-description]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L128
[key-fileType]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L130
[key-illustrator]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L134
[key-in]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L138
[key-keyword]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L139
[key-label]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L141
[key-location]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L144
[key-person]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L145
[key-source]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L147
[key-specialInstructions]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L150
[key-state]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L151
[key-subject]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L153
[key-supplier]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L157
[key-suppliersReference]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L160
[key-title]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L161
[key-uploader]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L162
[key-usages-before]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L163
[key-usages-after]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L164
[key-usages-orderedBy]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L165
[key-usages-platform]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L166
[key-usages-publication]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L167
[key-usages-status]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L169
[key-usages-reference]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L172
[key-usages-section]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L173
[key-has]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L174
[key-croppedBy]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L175
[key-filename]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L176
[key-persisted]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L178
[key-photoshoot]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L181
[key-leasedBy]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L184
[key-is]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L185
[key-dateTaken]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L186
[key-date]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L187
[alias-keys]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L188
[subject-values]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L26
[file-type-values]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L48
[is-values]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L53
[persisted-values]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L65
[status-values]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L170
[supplier-values]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L216
[category-values]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L226
[photographer-values]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L240
[illustrator-values]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L254
[credit-values]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L264
[source-values]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L270
[label-values]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L276
[photoshoot-values]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L282
[platform-values]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L288
[alias-values]: ../../../kahuna/public/js/search/structured-query/query-suggestions.ts#L300
[rights-api]: ../../../kahuna/public/js/services/api/edits-api.js#L64
[metadata-helper]: ../../../kahuna/public/js/services/api/media-api.js#L107
[label-relation]: ../../../kahuna/public/js/services/api/media-api.js#L115
[metadata-relation]: ../../../media-api/app/controllers/MediaApi.scala#L139
[completion-fields]: ../../../media-api/app/controllers/SuggestionController.scala#L18
[suggestion-routes]: ../../../media-api/conf/routes#L33
[named-fields]: ../../../media-api/app/lib/querysyntax/QuerySyntax.scala#L150
[nested-fields]: ../../../media-api/app/lib/querysyntax/QuerySyntax.scala#L144
[hash-query]: ../../../media-api/app/lib/querysyntax/QuerySyntax.scala#L88
[collection-query]: ../../../media-api/app/lib/querysyntax/QuerySyntax.scala#L95
[backend-keys]: ../../../media-api/app/lib/querysyntax/QuerySyntax.scala#L116
[nested-date-query]: ../../../media-api/app/lib/querysyntax/QuerySyntax.scala#L61
[mime-field]: ../../../media-api/app/lib/querysyntax/QuerySyntax.scala#L199
[date-fields]: ../../../media-api/app/lib/querysyntax/QuerySyntax.scala#L203
[date-values]: ../../../media-api/app/lib/querysyntax/QuerySyntax.scala#L211
[mime-values]: ../../../media-api/app/lib/querysyntax/QuerySyntax.scala#L227
[image-aliases]: ../../../common-lib/src/main/scala/com/gu/mediaservice/lib/ImageFields.scala#L52
[field-paths]: ../../../common-lib/src/main/scala/com/gu/mediaservice/lib/ImageFields.scala#L62
[alias-query]: ../../../media-api/app/lib/elasticsearch/QueryBuilder.scala#L27
[category-query]: ../../../media-api/app/lib/elasticsearch/QueryBuilder.scala#L99
[field-query]: ../../../media-api/app/lib/elasticsearch/QueryBuilder.scala#L92
[has-query]: ../../../media-api/app/lib/elasticsearch/QueryBuilder.scala#L118
[persisted-query]: ../../../media-api/app/lib/elasticsearch/QueryBuilder.scala#L140
[ordered-by-query]: ../../../media-api/app/lib/elasticsearch/QueryBuilder.scala#L174
[nested-query]: ../../../media-api/app/lib/elasticsearch/QueryBuilder.scala#L165
[similar-query]: ../../../media-api/app/lib/elasticsearch/QueryBuilder.scala#L135
[persistence-reasons]: ../../../media-api/app/lib/ImagePersistenceReasons.scala#L10
[is-query]: ../../../media-api/app/lib/elasticsearch/IsQueryFilter.scala#L28
[parser-defaults]: ../../../media-api/app/lib/querysyntax/Parser.scala#L5

### Evidence anchors

- [Query suggestions](../../../kahuna/public/js/search/structured-query/query-suggestions.ts)
  define field/value suggestions and lookups.
- [Query syntax](../../../media-api/app/lib/querysyntax/QuerySyntax.scala)
  and [parser tests](../../../media-api/test/lib/querysyntax/ParserTest.scala)
  describe query-to-filter behaviour. Keep exhaustive parser permutations there.
- [E2e configuration](../../setup/config.ts) supplies the configured values.
- The syntax help template provides frontend examples; reconcile these with the
  current CQL input before turning backend-only syntax into UI scenarios.

## Search-chip fixture matrix

The 28 records (23 purpose-named records plus five named supplier records) are implemented in
[search-chips.ts](../../fixtures/elasticsearch/search-chips.ts) and appended after
the captured images by the [shared loader](../../setup/image-fixtures.ts).
The existing Elasticsearch and image-file seeders consume that combined list.
Existing records and their lookup order are preserved.

Each fixture name states the contrast it was added to test, so a scenario's
scope and expected matches are readable without consulting this table.

The chip-value column uses the inventory's query keys rather than raw JSON field
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
| `supplier-getty-images` | Remaining supplier option | Positive supplier search. | Common; `category` = `agency`; `supplier` = `Getty Images`; no persistence reasons. |
| `supplier-pa` | Remaining supplier option | Positive supplier search. | Common; `category` = `agency`; `supplier` = `PA`; no persistence reasons. |
| `supplier-rex-features` | Remaining multi-word supplier option | Positive supplier search and under-quota contrast. | Common; `category` = `agency`; `supplier` = `Rex Features`; matches `is:under-quota` with the seeded report; no persistence reasons. |
| `supplier-ronald-grant-archive` | Remaining multi-word supplier option | Positive supplier search. | Common; `category` = `agency`; `supplier` = `Ronald Grant Archive`; no persistence reasons. |
| `supplier-action-images` | Remaining multi-word supplier option | Positive supplier search. | Common; `category` = `agency`; `supplier` = `Action Images`; no persistence reasons. |

### Inventory coverage

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

### Implemented values

`SEARCH_CHIP_IMAGE_IDS` maps every fixture name to its ID, calculated as the SHA-1 of
`search-chips-<role>`. Use these IDs with the `ids` search parameter rather than
adding an isolation label. The current uploader is `TEST_ACCOUNTS.fullAccess`;
the contrasting uploader is `search-chips-other@guardian.co.uk`.

`SEARCH_CHIP_CORE_IMAGE_IDS` retains just the 12 `SEARCH_CHIP_CORE_ROLES`
(`harbour-daylight-jpeg` through `deleted-other-upload` in the matrix). The
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

## Known application defects

Two strict regression cases carry `@known-defect`. This is a label, not a skip:
the default suite still runs them. Their failures are not unfinished tests, and
neither the fixtures nor network mocks are used to hide incorrect application behavior.

| Defect | Failing cases | Evidence |
| --- | --- | --- |
| Identifier persistence requires every identifier instead of any one | `tiff-identifier-over-quota` fails `persisted:persistence-identifier` and incorrectly matches `is:reapable`. | [Persistence query](../../../common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/PersistedQueries.scala#L28) uses the [AND-based helper](../../../common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/filters.scala#L51), unlike the [response-side reason](../../../media-api/app/lib/ImagePersistenceReasons.scala#L35). Live API/Elasticsearch probes confirm this. |

## Validation

From the e2e package, generate and run the complete suite:

```sh
node --test fixtures/elasticsearch/search-chips.test.ts
npx bddgen
npx playwright test search-chips --project=chromium --workers=1 --retries=1 --reporter=list
```

To isolate the confirmed defects or verify the remaining cases:

```sh
npx playwright test search-chips --grep @known-defect --project=chromium --workers=1 --reporter=list
npx playwright test search-chips --grep-invert @known-defect --project=chromium --workers=1 --retries=1 --reporter=list
```

Validation generated all 105 cases without undefined steps and passed the five
fixture/configuration checks. The suite has not yet been re-run live since the
suggestion mocks were removed and the photographer categories were configured.