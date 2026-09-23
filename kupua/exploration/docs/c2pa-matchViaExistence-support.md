# C2PA `matchViaExistence` Support — Workplan

> **Status:** Planning / not started.
> **Scope:** Kupua support for Grid field aliases whose Boolean meaning is represented by
> Elasticsearch field presence rather than an explicitly indexed `false` value.
> **Initial field:** `c2paMetadataAvailable` → `fileMetadata.c2pa.isAvailable`.
> **Relationship to the API build:** independent companion work. This does not change the
> sequence or endpoint architecture in `03 Ce n'est pas une pipe dream/api-build/api-build-00-plan.md`.

## 1. Goal

Make the following forms behave consistently in Kupua's direct-ES, current hybrid media-api,
and eventual API-only modes:

```text
c2paMetadataAvailable:true
c2paMetadataAvailable:false
fileMetadata.c2pa.isAvailable:true
fileMetadata.c2pa.isAvailable:false
```

For a configured alias with `matchViaExistence = true`, `true` means that the underlying ES
field exists and `false` means that it does not exist. This is different from an ordinary
Boolean alias such as `cutout`, where both `true` and `false` are literal indexed values.

The completed work must also expose the configured field in Kupua's metadata and typeahead
surfaces, preserve accurate scoped suggestion counts, and keep existing aliases unchanged.

## 2. Why This Is Separate From The API Build Plan

Grid already owns server-side existence semantics in `FieldAlias`, `QueryBuilder`, and
`ImageResponse`. The API build plan's shared helper calls `QueryBuilder` for every
Kupua-facing read, so window, rank, profiles, keys, count, and scoped aggregation queries
inherit the same CQL filter semantics. Individual endpoints must not reimplement or inspect
`matchViaExistence`.

Kupua still needs bounded client work for:

1. its vendored alias configuration and field registry;
2. direct-ES CQL compilation, retained as a supported mode;
3. hybrid methods and fallback paths that still execute direct ES;
4. missing-value aggregation counts used by typeahead;
5. direct-ES presentation of an absent presence-backed field as `false`.

The lack of server-delivered frontend configuration is known. For this work, continue using
Kupua's existing vendored configuration mechanism; do not introduce a configuration service.

## 3. Required Semantic Contract

### 3.1 Query truth table

Given an alias configured with `matchViaExistence = true`:

| CQL | ES meaning |
| --- | --- |
| `alias:true` | `exists(field)` |
| `alias:false` | `must_not exists(field)` |
| `-alias:true` | `must_not exists(field)` |
| `-alias:false` | `exists(field)` |

The same table applies when the raw configured ES path is used instead of the friendly alias.
`true` and `false` are case-insensitive and may be quoted or unquoted. A non-Boolean value,
such as `alias:maybe`, retains the existing literal match behavior.

Aliases without the flag retain literal behavior. In particular, `cutout:false` must continue
to match explicitly indexed false values; it must not become a missing-field query.

### 3.2 Existing `has:` syntax

These existing forms remain valid and unchanged:

```text
has:fileMetadata.c2pa.isAvailable
-has:fileMetadata.c2pa.isAvailable
```

They are useful controls for the new friendly syntax. Do not special-case or rewrite `has:` as
part of this work.

### 3.3 Presentation contract

- A present underlying value is displayed as `true`.
- A missing underlying value for a `matchViaExistence` alias is displayed as `false`.
- Missing ordinary aliases remain absent and hidden as today.
- Media-api's `aliases` projection remains authoritative when present.
- Direct-ES mode synthesizes `false` only at the configured field-access boundary; it must not
  mutate the source image or treat arbitrary missing fields as false.

### 3.4 Sorting contract

`matchViaExistence` changes matching and presentation, not sorting. Preserve the current ES
sort behavior: present values sort by their stored value and absent values remain null/missing.
Do not synthesize false sort values or alter cursor tuples.

## 4. Current State

### Direct-ES mode

- Kupua's `FieldAlias` type has no `matchViaExistence` member.
- The vendored alias list has no C2PA alias.
- configured aliases resolve only from friendly name to ES path;
- ordinary field matching always emits `match` or `match_phrase`;
- raw `has:` / `-has:` can express C2PA presence and absence;
- literal `:false` cannot match a field that is never indexed false.

### Current hybrid media-api mode

- `searchAfter` sends CQL to media-api, where Grid already applies existence semantics;
- media-api projects an absent configured alias as `aliases.c2paMetadataAvailable = false`;
- Kupua preserves arbitrary JSON alias values, including Boolean false;
- Kupua has no field definition or typeahead entry that consumes this alias;
- every non-`searchAfter` method in `StranglerAdapter`, plus selection's independently
  constructed ES datasource, still uses Kupua's direct-ES compiler;
- media-api unavailability fallback also returns to the direct-ES compiler.

This means manually typed API-backed searches can have correct pages and totals while maps,
rank helpers, aggregations, ranges, selection, or fallback disagree. Direct-ES support is what
closes that hybrid inconsistency.

### Eventual API-only mode

- Query filtering is inherited from the API build plan's shared server helper.
- Image-returning endpoints inherit media-api alias projection.
- The aggregation endpoint needs one localized rule for presence-backed missing buckets; it
  must not spread alias semantics across every endpoint.

## 5. Implementation Units

Execute one unit at a time. Write a failing test first and confirm that it fails for the intended
reason. If closer inspection disproves an assumption, stop rather than inventing a workaround.

### C1. Extend the vendored alias contract

**Files:**

- `src/lib/grid-config.ts`
- `exploration/mock/grid-config.conf`
- nearby config/field-registry tests

**Changes:**

1. Add `matchViaExistence?: boolean` to Kupua's `FieldAlias` interface. Optional means false;
   do not add repetitive `false` values to every existing alias.
2. Add the C2PA alias with:
   - `elasticsearchPath: "fileMetadata.c2pa.isAvailable"`;
   - `alias: "c2paMetadataAvailable"`;
   - `label: "C2PA Metadata Available"`;
   - `displaySearchHint: true`;
   - `displayInAdditionalMetadata: true`;
   - `searchHintOptions: ["true", "false"]`;
   - `matchViaExistence: true`.
3. Keep the mock HOCON snapshot and TypeScript snapshot aligned.

**Tests:**

- the C2PA field is generated in the field registry;
- existing aliases with no property behave as `false`;
- `cutout` remains an ordinary literal Boolean alias.

### C2. Centralize configured-alias lookup

**File:** `src/dal/adapters/elasticsearch/cql.ts`

Replace path-only lookup with one helper that returns the full configured alias record when the
input matches either:

- `alias.alias`, or
- `alias.elasticsearchPath`.

Use this helper for both path resolution and existence semantics. Keep field identifiers
case-sensitive, matching the server contract; only Boolean values are case-insensitive.

Do not duplicate C2PA path checks in `fieldToClause`, the ES adapter, store, or UI.

**Tests:**

- friendly alias and raw path resolve to the same config;
- unrelated and ordinary configured fields retain their current resolution;
- `has:` configured-alias resolution remains green.

### C3. Compile presence-backed Boolean matches in direct ES

**File:** `src/dal/adapters/elasticsearch/cql.ts`

Before ordinary single-field `match` / `match_phrase` construction:

1. inspect the full configured alias record;
2. if `matchViaExistence` is true and the value is Boolean-looking, emit an `exists` query;
3. toggle the clause's negation for false rather than nesting unnecessary Boolean structures;
4. preserve outer CQL polarity according to the truth table in section 3.1;
5. fall through to literal matching for non-Boolean values.

The implementation should be generic for configured presence-backed aliases, not named for
C2PA.

**Tests:**

- alias and raw-path forms;
- quoted and unquoted values;
- `true`, `false`, `TRUE`, and `False`;
- all four polarity combinations in section 3.1;
- non-Boolean fallback;
- ordinary explicit false (`cutout:false`) remains a literal match;
- full `parseCql` output places clauses in the expected `must` / `mustNot` arrays.

### C4. Present false consistently

**Files:**

- `src/lib/field-registry.tsx`
- `src/lib/field-registry.test.ts`

Update the generated alias accessor:

1. prefer `image.aliases[alias]` when media-api supplied it;
2. otherwise resolve the raw ES path;
3. when both are absent and `matchViaExistence` is true, return the display value `"false"`;
4. retain `undefined` for an absent ordinary alias.

Preserve raw API alias JSON in the image model. Conversion to display text remains a field
boundary concern.

**Tests:**

- API `true` and `false` values display correctly;
- direct-ES present path displays `true`;
- direct-ES missing path displays `false` only for a flagged alias;
- missing ordinary alias remains absent;
- media-api alias value wins over the raw-path fallback.

### C5. Add accurate typeahead counts

**Files:**

- `src/dal/types.ts`
- `src/dal/es-adapter.ts`
- `src/lib/typeahead-fields.ts`
- corresponding tests

A normal terms aggregation has no `false` bucket for a presence-backed field. Do not show zero:
zero would incorrectly claim that no missing documents match.

Use an explicit missing bucket in the aggregation request. The smallest current shape is:

1. extend `AggregationRequest` with an optional typed `missing` value;
2. for a `matchViaExistence` typeahead alias, request the underlying field with
   `missing: false`;
3. pass that value to the ES terms aggregation;
4. merge the returned `true` and synthetic `false` buckets with the configured static options;
5. leave every ordinary aggregation request unchanged.

This is valid because the alias contract states that false is represented by absence. Do not set
`missing: false` merely because an alias offers `true` and `false` options.

For the eventual API aggregation endpoint, apply the equivalent missing-bucket rule in its one
server aggregation builder by resolving the requested configured path. Do not send arbitrary ES
aggregation DSL and do not teach window/rank/keys endpoints about the flag.

**Tests:**

- direct-ES request body includes `missing: false` only for the flagged alias;
- scoped true and false counts are both displayed;
- editing the active C2PA chip still self-excludes it from the scoped count query;
- ordinary alias aggregation bodies are unchanged;
- a query with zero present values reports the scoped total as false, not an absent/zero bucket;
- a query with every value present reports false as zero.

### C6. Verify hybrid and API behavior

**Files:** adapter/store tests first; E2E only where needed.

Add mode-focused contract tests rather than endpoint-specific implementations:

1. `apiSearchAfter` forwards all four canonical CQL strings verbatim apart from existing default
   clauses; the mapper does not interpret `matchViaExistence`.
2. A media-api response carrying Boolean alias values remains unmodified in the image model and
   displays through the generated field.
3. Hybrid direct-ES delegates compile the same query membership as server-backed `searchAfter`.
4. ES fallback after media-api absence preserves the same membership.
5. Position-map, `countBefore`, aggregation, range, and selection tests use the shared direct-ES
   compiler rather than bespoke C2PA logic.
6. When the API build reaches its aggregation unit, add one composed C2PA false-count witness to
   that unit's golden-body/server test. Do not amend every build unit.

## 6. Existing Tests Likely To Need Updates

Identify exact assertions before implementation. Expected areas are:

- `src/dal/adapters/elasticsearch/cql.test.ts` — configured alias fixtures and clause shapes;
- `src/lib/field-registry.test.ts` — generated alias count/order and missing-value access;
- `src/lib/typeahead-fields.test.ts` — alias requests, options, and counts;
- `src/dal/es-adapter.test.ts` — aggregation request bodies;
- `src/dal/grid-api-search-adapter.test.ts` — raw Boolean alias preservation and mapper opacity;
- `src/stores/search-store-eviction-cursor.test.ts` and sort tests only if adding the alias changes
  fixture selection or registry-derived allowed sort values.

Do not weaken assertions simply because the generated alias list grows. Update exact lists when
the new field is intentionally part of the public registry; otherwise make fixtures select the
specific alias they need.

## 7. Validation

### Unit and build gates

After any `kupua/src` change:

```text
npm --prefix kupua test
npm --prefix kupua run build
```

Run with the repository's required `pipefail` + `tee` form.

### E2E gate

Because this touches the DAL, field registry, typeahead, and hybrid fallback behavior, run:

```text
npm --prefix kupua run test:e2e
```

Follow the repository port and execution rules before starting Playwright.

### Focused behavior checks

Verify this matrix with a controlled local fixture containing one document with the leaf and one
without it:

| Mode | Alias true | Alias false | Raw true | Raw false | Typeahead counts | Metadata |
| --- | --- | --- | --- | --- | --- | --- |
| Direct ES | present doc | missing doc | present doc | missing doc | exact | true / false |
| Hybrid media-api | same | same | same | same | exact via direct delegate | true / false |
| API-only, when available | same | same | same | same | exact via API agg | true / false |

Also verify `cutout:false` against an explicitly false fixture and the existing positive/negative
`has:` controls.

No real-cluster write or reindex is part of this work. Live read-only checks, if later requested,
require the normal explicit operator permission.

## 8. Documentation And Completion

When implementation is complete:

1. update `deviations.md` only if any intentional Grid/library departure remains;
2. update the field catalogue/component detail if the new metadata field changes those inventories;
3. update `AGENTS.md` and append the code change plus validation to `changelog.md` under the
   current phase;
4. retain this document as the concise contract and mark each implementation unit complete;
5. do not copy this work into the API build sequence. Add only the single U6c cross-reference if
   the future server aggregation unit needs the missing-bucket acceptance witness.

## 9. What Done Looks Like

- [ ] Kupua's alias model carries optional `matchViaExistence` with false as the default.
- [ ] The C2PA alias is present in the vendored and mock configuration.
- [ ] Friendly alias and raw path have identical true/false behavior.
- [ ] Direct-ES, hybrid server pages, hybrid delegates, and ES fallback agree on membership.
- [ ] Outer negation obeys the four-row truth table.
- [ ] Existing literal Boolean aliases remain literal.
- [ ] API and direct-ES images display explicit true/false consistently.
- [ ] Typeahead offers true/false with correct scoped counts, including missing documents.
- [ ] Sorting and cursor tuples are unchanged.
- [ ] Unit, build, and full E2E gates pass.
- [ ] No endpoint outside the shared server query/aggregation owners learns C2PA-specific logic.