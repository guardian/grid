# Search chip inventory

Registered search-chip keys, their value sources and backend interpretation for the
[search chips plan](./search-chips-plan.md).

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

## Evidence anchors

- [Query suggestions](../../../kahuna/public/js/search/structured-query/query-suggestions.ts)
  define field/value suggestions and lookups.
- [Query syntax](../../../media-api/app/lib/querysyntax/QuerySyntax.scala)
  and [parser tests](../../../media-api/test/lib/querysyntax/ParserTest.scala)
  describe query-to-filter behaviour. Keep exhaustive parser permutations there.
- [E2e configuration](../../setup/config.ts) supplies the configured values.
- The syntax help template provides frontend examples; reconcile these with the
  current CQL input before turning backend-only syntax into UI scenarios.
