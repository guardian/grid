# CQL Dynamic Field Aggregations — Design Sketch

> Status: both capabilities implemented, live-tested against real TEST data
> (1.3M images), and shipped. Several latent bugs (in kupua's own code, and
> in `@guardian/cql` itself) were found and fixed along the way — see
> `changelog.md` for the full account once distilled; this doc is left as
> the original design sketch and not updated into a build log.
> Scope: Kupua only. Originates from a CQL typeahead exploration session
> (see `changelog.md`, 9 August 2026 entry, for the bug-fix session this
> followed on from).

## Problem

`fileMetadata.*` is dynamically mapped — a sample dev mapping already has
**2,452 distinct leaf field paths** (vs. 21 for `originalMetadata.*`, 10 for
`source.*`). Users who know the exact syntax (`fileMetadata.xmp.dc:creator`)
can filter on it today, but:

1. There's no value-typeahead for any field outside the fixed, hand-registered
   set in `field-registry.tsx`/`typeahead-fields.ts`.
2. There's no way to see a value distribution for an arbitrary field in the
   Filters panel — only the static, pre-registered facet fields appear there.

## Goals

1. **Value-typeahead for arbitrary field paths** (not just registered ones),
   when the field's ES mapping actually supports it (keyword-typed) —
   gracefully absent otherwise, no error surfaced.
2. **A dynamic Filters-panel facet section** that appears at the bottom of
   the panel only when the active query contains a `has:"<field>"` clause,
   showing the aggregation for that exact field. Absent if the field isn't
   aggregatable.

## Non-goals (this doc)

- **Key-name discovery** — browsing/auto-completing *what fields exist* in
  the jungle (a `_field_caps`/`_mapping`-backed feature). Separate, larger,
  requires a genuinely new server endpoint not covered by anything below.
  Out of scope here.
- Changing `has:`'s existing filtering semantics — not touched by this doc.

## What already exists (confirmed by reading the code, not assumed)

- **`has:` already works today**, unmodified. `fieldToClause()` in
  `dal/adapters/elasticsearch/cql.ts` special-cases `key === "has"` and
  compiles it straight to `{ exists: { field: getFieldPath(value) } }`.
  `getFieldPath` only rewrites a small set of known short aliases — an
  arbitrary raw path like `fileMetadata.xmp.dc:creator` passes through
  unchanged. So `+has:"fileMetadata.xmp.dc:creator"` already filters
  correctly today; this doc only adds typeahead + a facet section on top.
- **The DAL already accepts arbitrary field paths.** `getAggregation`/
  `getAggregations` in `es-adapter.ts` take a raw ES path string, no
  allowlist, no schema check.
- **Graceful-absence is already the house style.** `FacetFilters.tsx`
  already filters out any registered facet whose aggregation returned zero
  buckets (`(f) => (aggregations?.fields[...]?.buckets?.length ?? 0) > 0`).
  The "don't show a section for a non-aggregatable field" requirement is
  the *same* rule already applied to static facets — no new logic class
  needed, just reuse.
- **This session's quote-fix is a hard prerequisite.** `@guardian/cql`
  quotes a field *value* containing a colon exactly the same way it quotes
  a *key* containing one (`shouldQuoteFieldValue` applies uniformly). So
  `has:"fileMetadata.xmp.dc:creator"` — where the colon is inside the
  **value** this time — depends on the `deriveEffectiveQuery` fix shipped
  in commit `d49ca171e` to round-trip correctly at all.

## Capability 1 — dynamic value-typeahead for arbitrary fields

`LazyTypeahead.suggestField()` (`lib/lazy-typeahead.ts`) currently only
finds a resolver by exact match against a fixed, pre-built `TypeaheadField[]`
array — an unregistered key returns no value suggestions.

**Addition:** when no static resolver matches the typed key, attempt a
scoped aggregation on the literal typed path via `dataSource.getAggregations`
(same call shape as every existing resolver's `scopedAgg` helper in
`typeahead-fields.ts`).

- Success (≥1 bucket) → shape into the same suggestion format every other
  resolver already returns.
- Failure or empty (non-aggregatable field, bad/nested path, ES error) →
  return no value suggestions — identical to how text fields like `byline`
  behave today. No field-type introspection needed up front; let the
  aggregation attempt itself be the check.

Needs `dataSource` (or a small resolver callback) threaded into
`LazyTypeahead`'s constructor, which currently only takes
`fields`/`hiddenFieldIds`.

**Rough size:** ~40–60 LOC across `lazy-typeahead.ts`, `typeahead-fields.ts`,
and the one `new LazyTypeahead(...)` call site in `CqlSearchInput.tsx`. No
new DAL method, no server work.

## Capability 2 — dynamic Filters-panel facet, triggered by `has:`

**Detection:** walk the current query's AST for `has:` clauses and collect
their *values* (the target field paths), not the `has` key itself. This
reuses the exact AST-walk pattern `cql-query-edit.ts` already has for
`findFieldTerm`/`collectByKey` — a new small pure helper, e.g.
`findHasFieldTargets(query): string[]`.

**Fetch:** feed the detected field path(s) into `search-store.ts`'s
`fetchAggregations()` — but **as a separate, isolated call**, not merged
into the same batched request as the static `AGG_FIELDS` set.

> **Why this isolation matters (confirmed, not speculative):**
> `getAggregations` builds **one combined ES request** with every requested
> field as a named sub-aggregation under a single `aggs` object
> (`es-adapter.ts`, `async getAggregations`). If a `has:`-derived dynamic
> field turns out to be a `text`-mapped field without fielddata, that one
> bad aggregation is very likely to fail the **entire** `_search` call —
> taking every already-working static facet down with it. The dynamic
> field's aggregation must be its own request with its own try/catch, so a
> bad `has:` target can only make its own section silently not appear,
> never break the rest of the Filters panel.

**Render:** one extra `FacetSection`-shaped block at the bottom of
`FacetFilters.tsx`, reusing the existing component — only when its bucket
list is non-empty, same hide-if-empty rule already applied to static
facets. No new UI component needed, just a new data source feeding the
existing render path.

**Rough size:** ~30–50 LOC (AST-walk helper + isolated store-side fetch +
one new render branch reusing `FacetSection`).

## Media-api readiness

Both capabilities call **only** `dataSource.getAggregation`/
`getAggregations` — the `ImageDataSource` DAL interface — never
`es-adapter.ts` directly. Today, `StranglerAdapter.getAggregations` is a
one-line passthrough to direct-ES (`--use-media-api` mode hasn't migrated
this method yet — it's Gap 18/C1, "not started" per
`phase-3-minimal-gap-derivation-findings.md`'s status table). Section 7,
note 13 of that doc already requires the planned `POST /images/aggregations`
endpoint to treat field paths as opaque verbatim ES paths — explicitly
covering this exact scenario (`has:fileMetadata.xmp.SomeKey` → real
buckets).

**Consequence: neither capability above needs any change when Gap 18/C1
ships.** The migration is entirely internal to `strangler-adapter.ts` (one
delegation line swaps from calling ES to calling the new endpoint) —
invisible to everything built here, by construction of already routing
through the DAL interface rather than the concrete adapter.

## Open questions / risks

- ~~**Confirm the ES failure mode empirically** before implementing~~ —
  **RESOLVED.** Confirmed both locally and against real TEST data: a
  `terms` agg on a non-aggregatable field fails the entire batched
  `_search` request (400, all-shards-failed), not just its own
  sub-aggregation. The isolation requirement above is necessary, not just
  a safe default — implemented via per-field isolated requests.
- **Where the `has:`-detection helper lives** — favour a pure, exported
  function (testable in isolation, matching `cql-query-edit.ts`
  conventions) over inlining it into `search-store.ts`.
- **Re-fetch cadence** — the dynamic facet should only refire when the
  `has:` clause's *value* changes, not on every unrelated query edit;
  should reuse whatever staleness/caching check `fetchAggregations()`
  already has for static facets rather than inventing a new one.

## Sizing summary

| Capability | Rough LOC | New DAL method? | New endpoint now? | media-api ready? |
|---|---|---|---|---|
| 1 — typeahead value-agg for arbitrary fields | 40–60 | No | No | Yes, transparently |
| 2 — `has:`-triggered dynamic facet section | 30–50 | No | No | Yes, transparently |

## Cross-references

- `kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/phase-3-minimal-gap-derivation-findings.md`
  — Section 7 note 13 (opaque field paths requirement), Gap 18/C1 (`POST /images/aggregations`).
- `changelog.md`, 9 August 2026 entry — the CQL quoting fix this design
  depends on for `has:"field:with:colons"` to round-trip correctly.
- Not yet logged elsewhere: the fileMetadata mapping-scale finding (2,452
  leaf fields in the sample mapping) that motivated this whole exploration.
