# CQL dynamic-field-aggregations — correctness review

> **DONE — all real findings actioned.** F1 (already fixed pre-review) and
> F2–F5 all fixed with TDD tests; two appendix items (#3, #6) fixed on
> follow-up; remaining appendix items (#2, #4, #5, #7, #8) assessed and
> deliberately left as-is (product decisions or already-documented
> tradeoffs). Full unit suite 1043/1043, e2e 244/244 (two full runs).
> See `changelog.md` (11 August 2026 entry) for the distilled account.
> Archived here for reference; not further maintained.

> Report only. No fixes applied, no commits, no test runs. Reviewed against
> the uncommitted working tree (22 changed/added files, `kupua/src` diff
> = 527 insertions / 41 deletions).
> Mindset: bug-hunt / correctness. Not refactor, perf, or architecture.

## Summary

The feature works as designed in its core paths, and the design premise is
sound — I have no Section 0 objection. `cql-ast-serialize.ts` is a faithful,
line-for-line reimplementation of `@guardian/cql`'s
`interpreter.ts::cqlQueryStrFromQueryAst` with exactly one predicate changed
(verified against `node_modules/@guardian/cql/src/lang/interpreter.ts` and
`src/lang/utils.ts` — `NEEDS_QUOTING = /[\s:()"]/` is exactly
`hasWhitespace || hasReservedChar`), and `CqlInput.ts:86` confirms
`detail.queryStr` really was AST-derived, so the swap changes nothing except
the quoting. The isolated-aggregation plumbing, `findHasFieldTargets`, the
`matchField` `?? ""` fix, and the extended incomplete-chip regex all look
correct and are covered by meaningful tests.

**One showstopper (F1, S1):** the `liveQueryRef` mechanism does *not*
"require zero special-casing" for `scopedAgg` as the worklog claims. It now
feeds the *raw* live query — including the in-progress valueless chip
(`credit:`) — to every **static** field resolver, and the regex-based
`stripFieldFromQuery` that `scopedAgg` uses cannot strip a valueless chip.
The result compiles to `match_none`, so every registered dynamic-value field
(`credit`, `source`, `supplier`, `label`, `category`, `photoshoot`,
`fileType`, plus all config field-aliases) returns **zero** value suggestions
at exactly the moment the popover should first open. The dynamic fallback is
immune only because it uses the parser-based `removeAllFieldTerms` instead.
No unit test and no e2e test covers this; e2e has not been re-run since the
change.

The remaining findings are S2/S3.

---

## Findings

### `kupua/src/components/CqlSearchInput.tsx` + `kupua/src/lib/typeahead-fields.ts`

**F1 — S1 — `liveQueryRef` feeds an incomplete chip into static resolvers'
aggregation scope, producing `match_none` and zero value suggestions.**

- [kupua/src/components/CqlSearchInput.tsx](kupua/src/components/CqlSearchInput.tsx#L173-L178) — `getParams()` returns `{ ...params, query: liveQueryRef.current }`, i.e. the raw AST serialisation, **not** passed through `deriveEffectiveQuery`.
- [kupua/src/lib/lazy-typeahead.ts](kupua/src/lib/lazy-typeahead.ts#L160-L164) — the ref is written as `queryStrFromAst(program)`; for the AST of `credit:` that is the string `"credit:"`.
- [kupua/src/lib/typeahead-fields.ts](kupua/src/lib/typeahead-fields.ts#L111-L118) — `stripFieldFromQuery`'s pattern `key:(?:"[^"]*"|\S+)` requires at least one character after the colon, so it **cannot** match `credit:`; the query passes through unchanged.
- [kupua/src/lib/typeahead-fields.ts](kupua/src/lib/typeahead-fields.ts#L122-L128) — `queryContainsField` *does* match `credit:` (`(?:^|\s)[+\-]?credit:`), so the resolver takes the `scopedAgg` branch and skips the store's cached buckets entirely.
- [kupua/src/lib/typeahead-fields.ts](kupua/src/lib/typeahead-fields.ts#L196-L212) — `scopedAgg` therefore calls `getAggregations` with `query: "credit:"`.
- [kupua/src/dal/adapters/elasticsearch/cql.ts](kupua/src/dal/adapters/elasticsearch/cql.ts#L290-L296) — `fieldToClause` returns `{ match_none: {} }` when the value is empty → the terms agg runs over zero documents → zero buckets → the resolver returns `[]`.

Trace for the general case `cats credit:` → scope becomes `cats AND match_none`
→ same result. This is a **regression introduced by the `liveQueryRef`
change**: before it, `getParams()` read `useSearchStore.getState().params`,
whose `query` had already been through `deriveEffectiveQuery`, which strips
exactly this incomplete-chip form. Affects every resolver in
`buildTypeaheadFields` that calls `scopedAgg` with a `cqlKey`, plus the
`is:` resolver's filter-agg counts (options still render; counts go to 0).
`buildDynamicFieldFallback` is unaffected because
[kupua/src/lib/typeahead-fields.ts](kupua/src/lib/typeahead-fields.ts#L568)
uses the parser-based `removeAllFieldTerms`, which *does* handle a valueless
chip (that was this session's fix #2).

*Test coverage:* **none.** [kupua/src/lib/lazy-typeahead.test.ts](kupua/src/lib/lazy-typeahead.test.ts#L78-L92)
("still resolves suggestions correctly for a registered static field") uses a
resolver that ignores `getParams`, so it cannot catch this. There is no e2e
coverage of typeahead value suggestions at all (only
[kupua/e2e/local/cql-search-quoting.spec.ts](kupua/e2e/local/cql-search-quoting.spec.ts#L19),
which asserts chip round-tripping). A new test is needed: assert that with
the live query `credit:`, the query handed to `getAggregations` contains no
`credit` term.

---

### `kupua/src/lib/cql-effective-query.ts`

**F2 — S2 — the incomplete-chip regex strips `word:` from *inside* a quoted
phrase when a space follows the colon.**

- [kupua/src/lib/cql-effective-query.ts](kupua/src/lib/cql-effective-query.ts#L26) — `/[+\-]?(?:"[^"]*"|[\w#~@.]*):(?=\s|$)/g`. The `[\w#~@.]*` alternative is not anchored to a token boundary, so for the input `"note: hello"` it matches `note:` at offset 1 (lookahead sees the space) and deletes it, leaving `" hello"`. The following quote-normalisation pass ([kupua/src/lib/cql-effective-query.ts](kupua/src/lib/cql-effective-query.ts#L36-L39)) then unquotes it, so the user's phrase search `"note: hello"` silently becomes the free-text search `hello`.

This is pre-existing in form, but **this session materially increased its
reachability**: `queryStrFromAst` now *preserves* quotes on phrases
containing colons, so colon-bearing quoted phrases (e.g. `"Breaking: Live"`)
now survive to reach `deriveEffectiveQuery`, where before the upstream bug
had already stripped the quotes upstream of it. The quoted-key alternative
added this session (`"[^"]*"`) handles the *key* form but not this sibling
case.

*Test coverage:* none — the six new tests at
[kupua/src/lib/cql-effective-query.test.ts](kupua/src/lib/cql-effective-query.test.ts#L44-L78)
all cover keys, not colons inside a phrase. A new test would be needed
(`deriveEffectiveQuery('"note: hello"')` should be unchanged).

---

### `kupua/src/stores/search-store.ts` + `kupua/src/components/FacetFilters.tsx`

**F3 — S2 — the dynamic facet aggregates the *raw* `has:` value, while
`has:` itself filters on `getFieldPath(value)` — so alias/short-name targets
never produce a facet, and always cost a wasted ES request.**

- [kupua/src/dal/adapters/elasticsearch/cql.ts](kupua/src/dal/adapters/elasticsearch/cql.ts#L298-L303) — `has:` compiles to `exists: { field: getFieldPath(value) }`, i.e. `has:croppedBy` → `exports.author`, `has:credit` → `metadata.credit`, `has:photoshoot` → `userMetadata.photoshoot.title` ([kupua/src/dal/adapters/elasticsearch/cql.ts](kupua/src/dal/adapters/elasticsearch/cql.ts#L69-L86)).
- [kupua/src/dal/adapters/elasticsearch/cql-query-edit.ts](kupua/src/dal/adapters/elasticsearch/cql-query-edit.ts#L275-L284) — `findHasFieldTargets` returns the literal value, unresolved.
- [kupua/src/stores/search-store.ts](kupua/src/stores/search-store.ts#L3950-L3963) — the isolated terms agg is issued on that literal value (`croppedBy`), an unmapped ES path → empty buckets, no error.
- [kupua/src/components/FacetFilters.tsx](kupua/src/components/FacetFilters.tsx#L98) / [kupua/src/components/FacetFilters.tsx](kupua/src/components/FacetFilters.tsx#L243-L255) — buckets absent → section renders `null`.

Net effect: one clause filters on path A and aggregates on path B. The
user's filter works, the facet silently never appears, and a guaranteed-empty
ES request is issued on every aggregation fetch. The `AGG_FIELDS` de-dupe
filter at [kupua/src/stores/search-store.ts](kupua/src/stores/search-store.ts#L3950-L3952)
also compares against full ES paths, so it can't de-dupe an alias either.

*Test coverage:* none — the `findHasFieldTargets` tests
([kupua/src/dal/adapters/elasticsearch/cql-query-edit.test.ts](kupua/src/dal/adapters/elasticsearch/cql-query-edit.test.ts#L216-L253))
only use full ES paths. A new test with `has:croppedBy` would pin down
whichever resolution behaviour is chosen.

**F4 — S3 — a negated `-has:X` clause is treated as a facet target, which
can never yield buckets.**

- [kupua/src/dal/adapters/elasticsearch/cql-query-edit.ts](kupua/src/dal/adapters/elasticsearch/cql-query-edit.ts#L275-L284) — polarity is not inspected.
- [kupua/src/dal/adapters/elasticsearch/cql-query-edit.test.ts](kupua/src/dal/adapters/elasticsearch/cql-query-edit.test.ts#L249-L253) asserts this as intended behaviour.

By construction the result set for `-has:X` contains no document with field
`X`, so the isolated terms agg on `X` always returns zero buckets. The
outcome degrades gracefully (no section), but it is an unconditionally
wasted ES round-trip per aggregation fetch, and the code cannot be reading
the semantics correctly. Flagging it because it is a code-criterion
"always-useless work" case, not a style opinion.

*Test coverage:* a test already asserts the current behaviour, so any fix
must **change** [cql-query-edit.test.ts](kupua/src/dal/adapters/elasticsearch/cql-query-edit.test.ts#L249-L253),
not just add to it.

---

### `kupua/src/lib/lazy-typeahead.ts`

**F5 — S3 — the abort-signal change is a no-op for every static resolver;
the comment overstates what it achieves.**

- [kupua/src/lib/lazy-typeahead.ts](kupua/src/lib/lazy-typeahead.ts#L179-L190) — comment claims the own-controller signal exists so "a real ES aggregation call" isn't cancelled prematurely.
- [kupua/src/lib/lazy-typeahead.ts](kupua/src/lib/lazy-typeahead.ts#L237) — the signal is forwarded to `resolver.resolveSuggestions(valueStr, signal)`…
- …but [kupua/src/components/CqlSearchInput.tsx](kupua/src/components/CqlSearchInput.tsx#L188-L200) builds each `TypeaheadField` resolver as `async (_fieldName: string) => …` — a **one-argument** function. The signal is dropped on the floor.
- [kupua/src/lib/typeahead-fields.ts](kupua/src/lib/typeahead-fields.ts#L205) — `scopedAgg`'s `dataSource.getAggregations(adjustedParams, [{ field, size }])` passes **no** `signal` at all.

So only `buildDynamicFieldFallback`
([kupua/src/lib/typeahead-fields.ts](kupua/src/lib/typeahead-fields.ts#L570-L573))
actually honours cancellation. Static-field aggregations remain
uncancellable on rapid keystrokes, exactly as before the change. The change
itself is harmless; the finding is that the comment asserts a property the
code does not have, which will mislead the next reader debugging typeahead
latency.

*Test coverage:* none, and none is warranted for a comment. If the intent is
to actually cancel static fetches, a new test would be needed asserting
`getAggregations` receives an abort signal.

---

## Verified negatives (checked, no finding)

- **`cql-ast-serialize.ts` is faithful.** The `AND`-only / implicit-OR branch in [kupua/src/lib/cql-ast-serialize.ts](kupua/src/lib/cql-ast-serialize.ts#L39-L46) is byte-identical in intent to upstream `strFromBinary`; the missing escaping of an embedded `"` in [kupua/src/lib/cql-ast-serialize.ts](kupua/src/lib/cql-ast-serialize.ts#L65-L69) is also identical to upstream `strFromField`/`strFromExpr`, i.e. matching-upstream is the goal here, not a kupua-introduced defect.
- **No sibling of the `matchField` `undefined`/`""` bug in `cql-query-edit.ts`.** The other two derivation sites ([L229](kupua/src/dal/adapters/elasticsearch/cql-query-edit.ts#L229), [L281](kupua/src/dal/adapters/elasticsearch/cql-query-edit.ts#L281)) are now consistent with [L85](kupua/src/dal/adapters/elasticsearch/cql-query-edit.ts#L85); `findHasFieldTargets`' `if (value)` guard is a deliberate presence check, not a comparison. Token-offset arithmetic at [L106](kupua/src/dal/adapters/elasticsearch/cql-query-edit.ts#L106) is correct — the scanner's `Token.end` is `max(start, currentIndex - 1)`, i.e. inclusive, so `+1` is right.
- **No sibling of the `UsageFacetSection` wrong-guard.** [`IsSection`](kupua/src/components/FacetFilters.tsx#L445) uses `visibleItems.length === 0` and [`FacetSection`](kupua/src/components/FacetFilters.tsx#L289) uses `buckets.length === 0`; neither ANDs in a "counts not loaded" condition. The fix at [L535](kupua/src/components/FacetFilters.tsx#L535) is the only one of its kind.
- **No duplicate facet section for a `has:` target that is already a static facet.** `AGG_FIELDS` ([kupua/src/stores/search-store.ts](kupua/src/stores/search-store.ts#L73-L76)) and `FACET_FIELDS` ([kupua/src/components/FacetFilters.tsx](kupua/src/components/FacetFilters.tsx#L37-L40)) apply an identical registry filter, so the store's skip and the component's empty-bucket `null` line up exactly.
- **"Show more" sizing is consistent for dynamic facets** — the isolated fetch uses `AGG_DEFAULT_SIZE` ([kupua/src/stores/search-store.ts](kupua/src/stores/search-store.ts#L3960)) = 10 ([kupua/src/constants/tuning.ts](kupua/src/constants/tuning.ts#L213)), matching `INITIAL_VISIBLE` ([kupua/src/components/FacetFilters.tsx](kupua/src/components/FacetFilters.tsx#L43)).
- **`isolateAggregationFailure`'s `DOMException`/`AbortError` check matches house convention** — 11 identical checks in [kupua/src/dal/es-adapter.ts](kupua/src/dal/es-adapter.ts#L1049) and friends, and `MockDataSource` throws the same shape ([kupua/src/dal/mock-data-source.ts](kupua/src/dal/mock-data-source.ts#L381)).

---

## Tier 3

**Reached — both items covered, briefly.**

**DAL-mode parity: clean.** Nothing added this session reaches behind
`ImageDataSource`. `buildDynamicFieldFallback`
([kupua/src/lib/typeahead-fields.ts](kupua/src/lib/typeahead-fields.ts#L570))
and the store's isolated fetch
([kupua/src/stores/search-store.ts](kupua/src/stores/search-store.ts#L3960))
both call `dataSource.getAggregations` only, and
[kupua/src/dal/strangler-adapter.ts](kupua/src/dal/strangler-adapter.ts#L33-L34)
still delegates both aggregation methods verbatim. `typeahead-fields.ts`'s new
import of `removeAllFieldTerms` from `dal/adapters/elasticsearch/` is a pure
string helper on the CQL query — the same input format both modes take — and
`FacetFilters.tsx` already imported from that module, so it introduces no new
mode dependency.

**Test-quality pass — three notes, none rising to a finding:**

1. [kupua/src/lib/cql-ast-serialize.test.ts](kupua/src/lib/cql-ast-serialize.test.ts#L50-L54) — the test titled "joins multiple terms with AND" actually exercises the *implicit* (non-`AND`) branch of `strFromBinary`; the `binary.right.operator === "AND"` branch at [kupua/src/lib/cql-ast-serialize.ts](kupua/src/lib/cql-ast-serialize.ts#L41) is untested, as is `strFromGroup`. Both would revert silently.
2. [kupua/src/stores/search-store.test.ts](kupua/src/stores/search-store.test.ts#L2114-L2118) — the fake discriminates the static batch from an isolated request by `fields.length > 1`, an implementation detail. It still fails correctly if the isolation is removed (the thrown error would propagate), so the assertion is meaningful; the discriminator is just brittle to any future change in `AGG_FIELDS` cardinality.
3. Everything else checked is behaviour-asserting and would genuinely fail on revert — in particular the `removeAllFieldTerms` valueless-chip tests ([kupua/src/dal/adapters/elasticsearch/cql-query-edit.test.ts](kupua/src/dal/adapters/elasticsearch/cql-query-edit.test.ts#L259-L281)), the `deriveEffectiveQuery` quoted/dotted-key tests, and `isolateAggregationFailure`'s AbortError-rethrow test.

---

## Appendix — out-of-scope observations (unrelated to this feature)

1. [kupua/src/components/CqlSearchInput.tsx](kupua/src/components/CqlSearchInput.tsx#L526-L533) — `selfCausedChangeRef` is set on every editor-caused change but consumed once per `value` prop change; two coalesced edits leave it `true` and swallow the next *external* `setAttribute`.
2. [kupua/src/stores/search-store.ts](kupua/src/stores/search-store.ts#L3987-L3993) — the `fetchAggregations` catch leaves `aggregations`/`dynamicFacetBuckets` stale on a non-abort failure.
3. [kupua/src/dal/adapters/elasticsearch/cql-query-edit.ts](kupua/src/dal/adapters/elasticsearch/cql-query-edit.ts#L19-L24) and [kupua/src/dal/adapters/elasticsearch/cql.ts](kupua/src/dal/adapters/elasticsearch/cql.ts#L24-L29) create parsers with `groups`/`operators` enabled, while the widget uses `operators: false, groups: false` ([kupua/src/components/CqlSearchInput.tsx](kupua/src/components/CqlSearchInput.tsx#L72-L79)) — divergent parses are possible for queries containing `AND`/`(`.
4. [kupua/src/dal/adapters/elasticsearch/cql-query-edit.ts](kupua/src/dal/adapters/elasticsearch/cql-query-edit.ts#L86-L90) — key and value matching are case-insensitive, but ES field paths are case-sensitive; a `fileMetadata.*` path differing only in case would be treated as the same term.
5. [kupua/src/lib/typeahead-fields.ts](kupua/src/lib/typeahead-fields.ts#L111-L128) — `stripFieldFromQuery`/`queryContainsField` remain regex-based (deviations.md §14) while a parser-based equivalent now exists in the codebase; they disagree on quoted keys and valueless chips.
6. [kupua/src/components/FacetFilters.tsx](kupua/src/components/FacetFilters.tsx#L187-L189) — `hasFacetBuckets` (which gates the "No results to filter" message) ignores `dynamicFacetBuckets`.
7. [kupua/src/lib/cql-effective-query.ts](kupua/src/lib/cql-effective-query.ts#L36-L39) — the quote-normalisation pass unquotes a single-token phrase (`"climate"` → `climate`), converting a phrase match into a best-fields match.
8. [kupua/src/dal/es-adapter.ts](kupua/src/dal/es-adapter.ts#L786) — aggregation names are the raw field paths, so a `has:` target containing ES-reserved agg-name characters would be rejected by ES rather than isolated per-field.
