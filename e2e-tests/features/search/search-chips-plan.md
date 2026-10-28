# Search chips plan

Chip types, available values, a reusable image fixture proposal and a bounded
scenario strategy for the [search bar plan](./search-bar-plan.md).

This is a documentation-only plan. No fixtures, feature files or step definitions
are created by this change. Use the current `@guardian/cql` input, not the legacy
chips input or its retiring feature switch.

## Scope and coverage strategy

Catalogue every chip, but use **12 reusable images and approximately 26 browser
scenarios** rather than testing the Cartesian product of fields and values.
Suggestions are not validation lists: most chips also accept manually typed
values. Dynamic values below describe the checked-in e2e configuration, not
production.

The recovered discussion specifies the inventory, fixture matrix and a split of
12 interaction scenarios plus 12 result combinations. Its saved response cuts
off during the result-combination summary. The detailed allocation below is a
proposed expansion of those groups; the remaining two scenario slots need
confirmation before feature files are written.

## Chip inventory

| Chip | Current values or source | Coverage notes |
| --- | --- | --- |
| `by` | Configured photographers: Example External Photographer, Example Internal Photographer, Example Contracted Photographer | Representative creator values; quote names containing spaces. |
| `category` | Category API: `pay-to-use`, `pr-and-third-party`, `agency`, `Bylines`, `staff-photographer`, `contract-photographer`, `commissioned-photographer`, `contract-illustrator`, `commissioned-illustrator`, `staff-illustrator` | Include modern and legacy category expansion. |
| `supplier` | AAP, Alamy, Allstar Picture Library, AP, EPA, Getty Images, PA, Reuters, Rex Features, Ronald Grant Archive, Action Images | Configured options, including multi-word values. |
| `illustrator` | Configured creator options; currently Example Contracted Illustrator | Verify the resolver/API shape mismatch before testing suggestions. |
| `credit` | Indexed completion suggestions through `/suggest/metadata/credit` | Values depend on seeded images. |
| `source` | Requests metadata suggestions | Corresponding route appears missing; verify separately from typed searches. |
| `label`, `#` | Arbitrary labels | Suggestion relation appears missing. |
| `photoshoot` | Indexed suggestions through `/suggest/metadata/photoshoot` | Existing fixtures lack completions. |
| `fileType` | Suggested: `jpeg`, `tiff`, `png`; backend also supports `jpg`, `tif` | Distinguish suggestions from accepted aliases. |
| `subject` | `arts`, `crime`, `disaster`, `finance`, `education`, `environment`, `health`, `human`, `labour`, `lifestyle`, `nature`, `news`, `politics`, `religion`, `science`, `social`, `sport`, `war`, `weather` | Sample representative values, not every subject. |
| `city`, `country`, `state`, `location` | Free-form location values | Contrast individual fields with `in`. |
| `in` | Free-form; searches sublocation, city, state and country | Include a match outside the city field. |
| `description`, `title`, `copyright`, `specialInstructions` | Free-form metadata | Include quoted text and intersections. |
| `keyword`, `person`, `suppliersReference` | Free-form metadata | Use contrasting values across images. |
| `uploader`, `croppedBy`, `leasedBy` | Email/source identifiers; no value suggestions | Exercise current versus another user where relevant. |
| `filename` | Free-form filename | Use a deterministic fixture filename. |
| `usages@status` | Suggested: `published`, `pending`, `removed`, `replaced`; model also has `syndicated`, `downloaded`, `derivative`, `failed`, `unknown` | Suggested values are not the entire model enum. |
| `usages@platform` | `print`, `digital`; conditionally `download`, `Added to Photo Sales` | Availability depends on configuration. |
| `usages@section`, `usages@publication` | Free-form print section/publication code or name | Pair with usage platform/status. |
| `usages@orderedBy`, `usages@reference` | Free-form ordering value, reference name or URL | Quote values where needed. |
| `usages@<added`, `usages@>added` | Dates; comparisons include the boundary | Use fixed timestamps for boundary assertions. |
| `date` | Year/month/day expressions, `today`, `yesterday`; upload-time ranges | Control time before testing relative dates. |
| `dateTaken` | Ordinary field search | Backend `taken:` provides special date-range parsing; do not treat them as equivalent. |
| `has` | Open-ended indexed field existence, e.g. `crops`, `dateTaken`, `usageRights`, `city`, `people`, `labels` | Include present and missing optional fields. |
| `is` | `<org>-owned-photo`, `<org>-owned-illustration`, `<org>-owned`, `under-quota`, `deleted`; conditionally `reapable`, `agency-pick` | Ownership and conditional values depend on config. |
| `persisted` | Conditional chooser: `persistence-identifier`, `exports`, `usages`, `archived`, `photographer-category`, `illustrator-category`, `commissioned-agency`, `leases`, `persisted-collection`, `photoshoot`, `labeled`, `edited` | Contrast persistence reasons with an image having none. |
| Configured aliases | Alias-specific `searchHintOptions`, otherwise free-form | Visibility is controlled by configuration. |
| Additional backend syntax | `collection`/`~`, `similar`, `uploaded`, `taken`, canonical aliases and arbitrary dotted field paths | Accepted fields are open-ended; backend support alone does not establish CQL chip support. |

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

Preserve existing images and add contrasting records with deterministic IDs and
metadata. These are logical roles, not fixture files to create yet.

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

Before implementation, assign exact values and expected result IDs to each
record. Distribute the remaining metadata fields, subjects, usage details and
fixed date boundaries across these same images rather than multiplying fixtures.
Confirm how to seed completion fields, usages, crops, leases and deleted records
through the existing setup mechanisms.

## Scenario allocation

Use small, readable scenarios with explicit expected image IDs, including
near-misses. A browser scenario should prove user-visible behaviour; exhaustive
field aliases and parser permutations belong in parser tests. The numbered list
is a proposed breakdown, not an assertion that the behaviours already work.

### Interactions: 12 scenarios

| Slot | Behaviour to capture |
| --- | --- |
| 1 | Create a chip by typing a supported field and value. |
| 2 | Select a suggested field name. |
| 3 | Select a static/configured value suggestion. |
| 4 | Select a dynamic value suggestion from seeded completion data. |
| 5 | Enter a valid value that is not offered as a suggestion. |
| 6 | Edit an existing chip value and update the search. |
| 7 | Negate a chip and verify its query representation. |
| 8 | Remove one chip without removing neighbouring text or chips. |
| 9 | Enter a quoted value containing spaces. |
| 10 | Create chips using supported shortcuts, including the label shorthand. |
| 11 | Move between text and chips with the keyboard and establish Backspace behaviour. |
| 12 | Restore chips and adjacent text from the URL, including browser history navigation. |

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

Slots **25 and 26** are reserved pending confirmation of the untruncated strategy.
Do not silently invent agreed scenarios or increase the fixture set. Potential
gaps to assess include conditional/configured chips and suggestion failure
behaviour, but neither is committed to these slots yet.

## Implementation gates

- [ ] Confirm slots 25-26 and the detailed allocation of the first 24 slots.
- [ ] Verify the illustrator resolver/API shape, source suggestion route and
      label suggestion relation. Record defects separately from intended behaviour.
- [ ] Confirm completion data for credit/photoshoot and exact fixture metadata.
- [ ] Resolve frontend support for backend-only syntax and configured aliases.
- [ ] Assign deterministic expected IDs and date boundaries to result scenarios.
- [ ] Implement the 12-image set only after these decisions, preserving existing fixtures.
- [ ] Write evidence-annotated feature files, then wire steps using the shared
      search-box locators in the existing search step directory.
- [ ] Run focused BDD generation and browser checks against a running stack.

The chip input is shared by both search layouts. Avoid duplicating every
combination across layouts; add layout-specific coverage only where controls
change the query or available options. Keep AI search and unrelated filter
controls in their own parts of the parent plan.