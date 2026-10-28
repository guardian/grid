# Search chips plan

Chip types, available values, a reusable image fixture proposal and a bounded
scenario strategy for the [search bar plan](./search-bar-plan.md).

Use the current `@guardian/cql` input, not the legacy chips input or its retiring feature switch.

## Scope and coverage strategy

Catalogue every chip, but use **12 reusable images and approximately 26 browser
scenarios** rather than testing the Cartesian product of fields and values.
Suggestions are not validation lists: most chips also accept manually typed
values. Dynamic values below describe the checked-in e2e configuration, not
production.

The recovered discussion specifies the inventory, fixture matrix and a split of
12 interaction scenarios plus 12 result combinations. Its saved response cuts
off during the result-combination summary. The detailed allocation below is a
proposed expansion of those groups; the remaining two scenario slots can be
decided after drafting the first 24 scenarios and do not block that work.

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
| `photoshoot` | Value suggestions: API lookup | Indexed completions through `/suggest/metadata/photoshoot`; seeded for E | [Key][key-photoshoot] | [Resolver][photoshoot-values]; [completion field][completion-fields] | [Maps to `userMetadata.photoshoot.title`][image-aliases] | Verify resolver response shape separately from seeded completion data. |
| `source` | Value suggestions: API lookup | Requests metadata suggestions for source | [Key][key-source] | [Resolver][source-values]; [advertised URI template][metadata-relation] | [`metadata.source` mapping][field-paths] | The advertised lookup expands to `/suggest/metadata/source`, absent from the [routes][suggestion-routes]; the separate generic metadata route is not what this resolver follows. |
| `supplier` | Value suggestions: API lookup | AAP, Alamy, Allstar Picture Library, AP, EPA, Getty Images, PA, Reuters, Rex Features, Ronald Grant Archive, Action Images | [Key][key-supplier] | [Agency supplier property options][supplier-values] | [`usageRights.supplier` mapping][field-paths] | Configured options, including multi-word values. |
| Configured aliases with options | Value suggestions: local/configured options | Alias-specific non-empty `searchHintOptions` | [Dynamic key registration][alias-keys] | [Option-list selection][alias-values] | [Configured Elasticsearch path and existence matching][alias-query] | Only aliases with `displaySearchHint` enabled enter this registry. |
| `fileType` | Value suggestions: local/configured options | Suggested: `jpeg`, `tiff`, `png`; backend also supports `jpg`, `tif` | [Key][key-fileType] | [Local list][file-type-values] | [MIME field mapping][mime-field]; [accepted values/MIME conversion][mime-values] | Distinguish suggestions from accepted aliases. |
| `is` | Value suggestions: local/configured options | `<org>-owned-photo`, `<org>-owned-illustration`, `<org>-owned`, `under-quota`, `deleted`; conditionally `reapable`, `agency-pick` | [Key][key-is] | [Configured/local list][is-values] | [Special predicate dispatch][is-query] | Ownership and conditional values depend on config; these are not ordinary metadata values. |
| `persisted` | Value suggestions: local/configured options | `persistence-identifier`, `exports`, `usages`, `archived`, `photographer-category`, `illustrator-category`, `commissioned-agency`, `leases`, `persisted-collection`, `photoshoot`, `labeled`, `edited` | [Conditional key][key-persisted] | [Reaper-dependent list][persisted-values] | [Persistence-reason lookup][persisted-query]; [reason definitions][persistence-reasons] | The chooser is registered only when `useReaper` is true; compare with I's absence of persistence reasons. |
| `subject` | Value suggestions: local/configured options | `arts`, `crime`, `disaster`, `finance`, `education`, `environment`, `health`, `human`, `labour`, `lifestyle`, `nature`, `news`, `politics`, `religion`, `science`, `social`, `sport`, `war`, `weather` | [Key][key-subject] | [Local list][subject-values] | [Maps to `metadata.subjects`][named-fields] | Sample representative values, not every subject. |
| `usages@platform` | Value suggestions: local/configured options | `print`, `digital`; conditionally `download`, `Added to Photo Sales` | [Key][key-usages-platform] | [Config-dependent list][platform-values] | [Nested usage matching][nested-query]; [Photo Sales translates to `syndication`][field-query] | Availability depends on configuration. |
| `usages@status` | Value suggestions: local/configured options | Suggested: `published`, `pending`, `removed`, `replaced`; model also has `syndicated`, `downloaded`, `derivative`, `failed`, `unknown` | [Key][key-usages-status] | [Inline option list][status-values] | [Nested usage matching][nested-query]; [default replaced exclusion][parser-defaults] | Suggested values are not the entire model enum. J requires an explicit replaced-status search to override the default exclusion. |
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
| `keyword` | Manual entry | User-entered keyword | [Key][key-keyword] | [No value resolver][key-keyword] | [Maps to `metadata.keywords`][named-fields] | Contrast keywords across A/B. |
| `leasedBy` | Manual entry | User-entered email/source identifier | [Key][key-leasedBy] | [No value resolver][key-leasedBy] | [Maps to `leases.leases.leasedBy`][image-aliases] | Exercise F's lease owner. |
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

## Twelve-image fixture proposal

The 12 records are implemented in
[search-chips.ts](../../fixtures/elasticsearch/search-chips.ts) and appended after
the captured images by the [shared loader](../../setup/image-fixtures.ts).
The existing Elasticsearch and image-file seeders consume that combined list.
Existing records and their lookup order are preserved.

| Image | Proposed distinguishing data | Main purpose |
| --- | --- | --- |
| A | Shared text, credit and location with B; distinct uploader, keyword and file type; no crop | Positive baseline and intersections. |
| B | Shared text, credit and location with A; different uploader, keyword and file type; has a crop | Exclusion, format and crop contrasts. |
| C | Modern `pay-to-use` category; city and uploader differ from D | Category expansion and metadata filtering. |
| D | Legacy `chargeable` category; contrasting city and uploader | Legacy category compatibility. |
| E | Photographer ownership; label, collection, photoshoot and archive | Ownership and multiple persistence reasons. |
| F | Illustrator ownership; lease | Ownership contrast and lease persistence. |
| G | Separate usages: one print, another published; neither has both | Detect cross-usage matching semantics. |
| H | One usage that is both print and published | Contrast with G for combined usage filters. |
| I | Unknown rights; optional metadata and date taken absent; no persistence reasons | Missing-field and non-persisted baseline. |
| J | Both published and replaced usages | Status combinations and negation. |
| K | Deleted image belonging to the current uploader | Deleted visibility and ownership. |
| L | Deleted image belonging to another uploader | Deleted visibility contrast. |

Scope searches with the supported `ids` parameter so unrelated seeded images
cannot affect expected results. Do not add a shared label for isolation: a label
would itself change persistence behaviour, especially for I.

### Implemented values

`SEARCH_CHIP_IMAGE_IDS` exports the A-L IDs, calculated as the SHA-1 of
`search-chips-<role>`. Use these IDs with the `ids` search parameter rather than
adding an isolation label. The current uploader is `TEST_ACCOUNTS.fullAccess`;
the contrasting uploader is `search-chips-other@guardian.co.uk`.

- A and B share `Harbour festival at the waterfront`, credit
  `Search Chips Shared Credit`, Bristol, Somerset, United Kingdom and sublocation
  Harbourside. A is JPEG with keyword `daylight`; B is PNG with keyword `night`
  and a crop by the current user. Both have `harbour` and subject `arts`.
- C is London/pay-to-use/current uploader; D is Cardiff/chargeable/other uploader.
- E uses Example Internal Photographer and Example publication, label
  `search-chips-featured`, collection `search-chips`, photoshoot
  `Search Chips Harbour Shoot` and archive status. The collection is also created
  by the [collection seeder](../../setup/seed-collections.ts).
- F uses Example Contracted Illustrator and Example publication, with an
  open-ended allow-use lease by the current user.
- G has print/pending and digital/published usages; H has print/published.
  J has digital/published and digital/replaced usages.
- I has only title/description metadata, unknown rights, no edits, identifiers,
  crops, usages, leases or collections. K and L are soft-deleted records owned
  by the current and other uploader respectively.

The fixed timestamp is `2024-06-15T12:00:00.000Z`. A uploads one day before it;
D uploads one day after it. J's usage dates also straddle it. All records except
I have date-taken metadata at that boundary. Credit completions match metadata;
E's photoshoot completion is stored in `userMetadata.photoshoot.suggest`.

The existing image-file seeder backs these records with the same placeholder
JPEG as the captured records, including B's indexed PNG source. These fixtures
test indexed search metadata, not original file decoding or upload ingestion.
Reseed a reused stack with `GRID_RESEED=true`, or restart `dev:e2e`, before
running scenarios against the new data.

## Scenario allocation

Use small, readable scenarios with explicit expected image IDs, including
near-misses. A browser scenario should prove user-visible behaviour; exhaustive
field aliases and parser permutations belong in parser tests. The numbered list
is a proposed breakdown, not an assertion that the behaviours already work.

The 12 interaction scenarios cover five representative value-resolution paths,
alongside shared chip interactions. This is not one browser test per chip:

1. **Usage-rights API lookup**: configured creator/category/supplier values;
  use `by` in slot 6.
2. **Indexed-metadata API lookup**: values from seeded image metadata;
  use `credit` in slot 4.
3. **Label API lookup**: label suggestions and the `#` shortcut in slot 10.
  The missing suggestion relation remains an implementation prerequisite.
4. **Local/configured option lists**: representative list selection with
  `fileType` in slot 3. Conditional lists and configured alias options share
  this source family, but are not all exercised by that one scenario.
5. **No-resolver manual entry**: a key such as `city` in slot 1. This is the
  no-lookup fallback, not another API resolver.

Key-name suggestions are a separate shared interaction, covered in slot 2.
Slot 5 also checks that a field with suggestions still accepts a manually typed
value outside the offered list. Resolver-level tests should cover each distinct
resolver's extraction/filtering logic; these browser scenarios exercise the
representative paths and their integration with the chip input. The separate
12 result-combination scenarios cover backend search semantics.

### Interactions: 12 scenarios

| Slot | Behaviour to capture | Unique behaviour covered |
| --- | --- | --- |
| 1 | Create a `city` chip by typing its field and value. | No-resolver path: a chip can be completed without any value suggestions. |
| 2 | Select a suggested field name. | Key-name completion is distinct from value resolution and inserts the selected key. |
| 3 | Select a static/configured value suggestion, using `fileType`. | Local option-list path: selecting an offered value completes the correct chip without a remote value lookup. |
| 4 | Select a `credit` suggestion from seeded completion data. | Indexed-metadata API path: the typed prefix drives a lookup and the selected returned value becomes the chip value. |
| 5 | Manually enter a valid `credit` value that is not offered as a suggestion. | Suggestions are not a validation whitelist; a suggested-value field still accepts manual input. |
| 6 | Edit an existing `by` chip by selecting another suggested photographer, and update the search. | Usage-rights API path: configured creator options populate the chooser, and editing replaces the existing value rather than adding another chip. |
| 7 | Negate a chip and verify its query representation. | Exclusion polarity survives serialisation and changes the query rather than becoming part of the value text. |
| 8 | Remove one chip without removing neighbouring text or chips. | Targeted deletion preserves the surrounding query and removes only the intended filter. |
| 9 | Enter a quoted value containing spaces. | A multi-word value remains one chip value and preserves its meaning when serialised. |
| 10 | Create a label chip with `#` and select a label suggestion. | Label API path: shorthand resolves to the `label` key and uses its label-specific suggestion lookup. Verify the missing relation before implementation. |
| 11 | Move between text and chips with the keyboard and establish Backspace behaviour. | Keyboard navigation crosses text/chip boundaries, with deletion behaviour distinct from explicit chip removal. |
| 12 | Restore chips and adjacent text from the URL, including browser history navigation. | Query hydration and back/forward navigation reconstruct the same chip keys, values, polarity and neighbouring text. |

Coordinate slots 10 and 11 with the parent plan's free-text-and-chips section to
avoid duplicate coverage. Observe the actual CQL component behaviour before
specifying editing, negation and keyboard expectations.

### Result combinations: 12 scenarios

| Slot | Representative combination | Fixture roles |
| --- | --- | --- |
| 13 | Intersect shared metadata with a distinguishing uploader or keyword. | A, B |
| 14 | Exclude a value while retaining a positive metadata constraint. | A, B |
| 15 | Match modern and legacy chargeable categories through category expansion. | C, D |
| 16 | Combine file type and crop existence. | A, B |
| 17 | Combine location filtering with another metadata field; contrast `in` and a specific location field. | A-D |
| 18 | Distinguish photographer, illustrator and aggregate organisation ownership. | E, F |
| 19 | Combine label, collection or photoshoot constraints with persistence reasons. | E, I |
| 20 | Contrast lease persistence with no persistence reasons. | F, I |
| 21 | Combine print platform and published status to expose same-usage versus cross-usage semantics. | G, H |
| 22 | Combine or negate usage statuses when an image has both published and replaced usages. | J |
| 23 | Exercise an inclusive date boundary and missing date-taken metadata. | Fixed-date records, I |
| 24 | Contrast deleted images owned by the current and another uploader. | K, L |

For slots 21 and 22, derive expected matches from the parser and actual query
semantics, not an assumption that every usage constraint binds to one usage.
Keep category expansion, ownership, persistence and visibility expectations
explicit because they can introduce implicit filters.

### Remaining two slots

Slots **25 and 26** remain unallocated. After drafting the first 24 scenarios,
decide whether conditional/configured chips or suggestion failure behaviour add
distinct coverage. This decision does not block writing or running the defined
scenarios.

## Next steps

The 12-image fixture set is already implemented. Use it for the following work;
there is no separate fixture or resolver-audit phase required before drafting
the feature files.

- [ ] Write evidence-annotated feature files for the 12 interaction scenarios,
  covering the five value-resolution paths and the unique behaviours above.
  Establish any uncertain keyboard/editing expectations from the current
  component while drafting the affected scenario.
- [ ] Write feature files for the 12 result-combination scenarios. State the
  expected fixture matches and near-misses, scope searches with `ids`, and
  make cost, ownership, deleted/replaced defaults and date boundaries
  explicit where they affect the outcome.
- [ ] Implement the step definitions for those feature files in the existing
  search step directory. Reuse the shared search-box locators and fixture ID
  helpers; exercise the real UI, lookup APIs and seeded search results.
- [ ] Generate and run the matching BDD tests against a running stack. Check for
  undefined steps with `npx bddgen`, then run the relevant generated search
  specs with Playwright. Fix test/setup issues and report application defects
  exposed by the scenarios.

Investigate the noted illustrator/source/label lookup concerns when working on
their scenarios; they are not prerequisites for unrelated coverage. Do not mock
away a broken lookup to make an end-to-end scenario pass. Additional backend
syntax and configured aliases only need further investigation if selected for
a feature file, rather than as a blanket prerequisite.

The chip input is shared by both search layouts. Avoid duplicating every
combination across layouts; add layout-specific coverage only where controls
change the query or available options. Keep AI search and unrelated filter
controls in their own parts of the parent plan.