# Obscure sorting decision: one semantic sort

> **Status:** Decided on 6 September 2026.
> **Owner:** Product and architecture decision record. Implementation belongs in
> `scroll-and-position-preservation-testing-4.2.2-obscure-sorting-workplan.md`.
> **Supersedes for O4-O8:** `scroll-and-position-preservation-testing-4-findings.md`.
> Remove O4-O8 from that live ledger after this document is reviewed; do not keep
> two authoritative copies.

## 1. Author and evidence boundary

I am GitHub Copilot, a fresh agent for this session. I did not inherit private
runtime knowledge from the agents that wrote the earlier reports. Before making
this decision I reviewed:

- `AGENTS.md`, the repository directives, `worklog-current.md`, the complete live
  findings ledger, and the complete `4.2-obscure-sorting-design-audit.md`,
  including its empirical follow-up and policy-impact trace;
- the uncommitted O3 diff in `src/dal/null-zone.ts` and
  `src/dal/selections-dal.test.ts`, plus their committed pre-O3 versions;
- sort construction, cursor manufacture and cursor use across
  `sort-builders.ts`, `search-store.ts`, `es-adapter.ts`,
  `grid-api-search-adapter.ts`, `strangler-adapter.ts`,
  `image-offset-cache.ts`, `sort-context.ts`, `useUrlSearchSync.ts`,
  `SearchFilters.tsx`, `ImageTable.tsx`, `ImageGrid.tsx`, `Scrubber.tsx`, and
  range-selection callers;
- D3 request parsing, sort conversion, null-zone reduction and tests in
  `media-api/app/controllers/MediaApi.scala`,
  `media-api/app/lib/elasticsearch/{ElasticSearch.scala,ElasticSearchModel.scala,sorts.scala}`,
  and `media-api/test/lib/elasticsearch/ElasticSearchTest.scala`;
- checked-in rationale and history in the frontend philosophy, deviations,
  changelog, capability reports and existing unit/E2E tests;
- three independent read-only code traces: cursor/operation ownership,
  secondary-sort UX/value, and D3 null serialization;
- bounded, read-only TEST-backed browser observations. No image identity, field
  value, response payload, index name or credential was written to disk.

The browser evidence is diagnostic, not a stable benchmark. On 6 September 2026,
against the user-started `--use-TEST` app:

- a 100-result `-uploadTime` versus `-uploadTime,width` comparison had no upload
  timestamp ties and changed 0 positions;
- `-width` versus `-width,-height` changed 5 of 100 positions and removed three
  observed Height inversions inside equal-Width groups;
- `credit` versus `credit,source` changed 23 of 100 positions, entirely as a
  tie-breaking effect inside Credit groups;
- for a query constrained by `-has:credit has:source`, `credit,source` and
  `source` produced the same first 100 identities in the same order: once every
  primary value is absent, preserving Source promotes it from tie-breaker to the
  effective primary sort;
- `-usagesDateAdded` reported 1,324,231 total results and a date-histogram
  `coveredCount` of 3,933. This did not itself prove or refute histogram
  overcounting; it established only that the live path could be exercised;
- a populated-zone seek requested position 983 and settled with buffer offset
  884. This single approximate landing is not sufficient to isolate O4 from
  histogram/percentile error and is not used as proof of O4.

Earlier empirical findings remain attributed to their original baselines in
Section 8 of `4.2-obscure-sorting-design-audit.md`. In particular, HEAD, dirty
O3, and D3 observations must never be conflated.

## 2. Decision

Kupua will support **one semantic user sort** at a time.

A semantic user sort is one choice such as Uploaded, Credit, Width, Last used,
or Added to collection. It may compile to more than one Elasticsearch clause.
Automatic implementation clauses remain supported:

1. `uploadTime`, when it is not already the semantic sort, provides meaningful
   and universal ordering within primary ties and the primary missing-value
   tail;
2. `id` is the unique deterministic pagination tiebreaker.

Those suffixes apply to ordinary Elasticsearch search. AI search is a separate
flat, in-memory ranking context with no cursor pagination. It supports only
Relevance and Uploaded; the other sort options remain visible but disabled so
the restriction is apparent and can be reconsidered later.

Arbitrary comma-separated user secondaries are not part of the product or API
contract. The two undisclosed Shift+click construction paths will be removed.
Incoming comma-separated `orderBy` URLs will examine only their first token. A
valid first token is retained and the tail discarded; an invalid first token
uses the current context's default. Later tokens are never salvaged. Duplicate
and special-secondary URL states therefore become unreachable, rather than
being supported differently by direct ES and D3.

This is deliberate simplification, not a claim that secondary sorting has zero
value. If a concrete workflow later requires a compound ordering, add it as one
named semantic sort with one resolved contract and dedicated tests. Do not
restore generic composition. Width then Height is the clearest current example,
but the user has confirmed that Width and Height are not important enough to
retain the generic feature now.

## 3. Why secondary sorting is only marginally useful

### 3.1 It acts only inside exact primary ties

For primary `P` and secondary `S`, the secondary cannot reorder documents with
different `P` values. Its value depends on the cardinality of `P`:

- **Uploaded then Width:** upload timestamps are sufficiently fine-grained that
  ties are uncommon. In the bounded live sample there were no adjacent ties and
  the secondary changed 0 of 100 positions.
- **Width then Height:** dimensions have many ties, so Height can arrange images
  with equal Width. It changed 5 of 100 sampled positions. This is real but
  specialised value.
- **Credit then Source:** Credit creates broad groups, so Source can visibly
  subdivide them. It changed 23 of 100 sampled positions. The practical default,
  however, already places newest uploads first inside each Credit group, which is
  usually a useful newsroom ordering.

The automatic `uploadTime` fallback means removal does not leave ties randomly
ordered. `id` then makes the cursor unique.

### 3.2 Preserving it through a primary null zone changes its role

Consider Credit ascending, Source ascending, then Uploaded descending:

| Image | Credit | Source | Uploaded |
|---|---|---|---|
| A | Getty | AP | 1 Sep |
| B | Getty | Reuters | 3 Sep |
| C | Getty | missing | 4 Sep |
| D | missing | AP | 2 Sep |
| E | missing | Reuters | 5 Sep |
| F | missing | missing | 6 Sep |

The choices produce materially different result sets:

| Policy | Order | Meaning |
|---|---|---|
| One semantic sort | C, B, A, F, E, D | Credit groups; newest upload inside every group and inside `No credit` |
| Secondary only before primary null zone | A, B, C, F, E, D | Source subdivides real Credit groups; `No credit` returns to Uploaded |
| Full lexicographic secondary | A, B, C, D, E, F | In `No credit`, Source becomes the effective primary; only `No credit, no source` falls back to Uploaded |

The live `-has:credit has:source` comparison made that promotion concrete:
`credit,source` was identical to `source` for the first 100 results. The existing
scrubber, by contrast, labels the primary null tail as `No credit` and shows
Uploaded dates/ticks. Full secondary preservation would therefore make the
control describe the wrong leading order.

### 3.3 The feature is not a finished interaction

Secondary sorting came from the Finder/Windows Explorer inspiration, not a
recorded Guardian workflow. It is constructed through Shift+click in either a
table header or the dropdown. The gesture is not explained in the accessible
name or visible UI. Secondary arrows are visual-only, table `aria-sort` reports
only the primary, the collapsed control names only the primary, and hidden
secondary table columns are not automatically revealed.

Keeping such a feature would require product work as well as cursor work: a
visible interaction, readable active state, clear “within equal values”
semantics, accessibility, and a documented missing-value policy. There is no
usage evidence sufficient to fund that work plus the pagination protocol.

## 4. Rejected alternatives

### 4.1 Simple one-primary-null-zone support

This policy would apply `[primary, secondary, uploadTime, id]` while the primary
exists, then change to `[uploadTime, id]` where it does not.

Its UX is defensible, but its implementation is not a local fallback switch. A
mixed page can cross the primary boundary; changing sort on the next request can
omit or duplicate documents unless pagination explicitly separates
primary-present and primary-absent phases. Forward and reverse extension, End,
deep seek, `countBefore`, position maps, focus restoration, range selection and
D3 must all agree on the phase.

Nullable secondaries also create missing-value boundaries inside populated
primary groups. Avoiding recursive handling would require a proven allow-list,
typed synthetic anchors, and an invariant stronger than one observed corpus.
That is too much cross-system machinery for a hidden, moderately valuable
feature.

### 4.2 Full recursive support

Correct lexicographic support for arbitrary nullable chains needs a parsed sort
model and a phase-aware cursor protocol. At null slot `j`, queries need equality
constraints for prior slots, a missing-field constraint at `j`, a reduced suffix
sort, reversible phase transitions, response remapping, and hierarchical rank
data for the scrubber. The same protocol would have to exist in TypeScript and
Scala and survive persisted cursors/history.

No current workflow justifies that architecture. It is rejected, not deferred as
the default next step.

## 5. Supported contract after implementation

- `orderBy` contains zero or one recognised semantic token, optionally prefixed
  with `-`.
- Missing/empty `orderBy` means `-uploadTime`.
- `-relevance` is a context-only ranking token: preserve it when `aiQuery` is
  active, but never send it to ordinary Elasticsearch sorting. A stale or pasted
  non-AI relevance URL falls back to `-uploadTime`.
- An incoming comma value examines only its first token. If that token is valid
  for the current context, preserve it and discard the rest; otherwise use the
  context default. Never scan later tokens looking for a valid sort. This is a
  compatibility normalisation, performed with `replace` so it does not create a
  second history entry.
- An unrecognised first token falls back to the default rather than reaching ES.
- One semantic special date token may compile to an object-form sort plus
  `uploadTime,id`.
- Generic user secondaries and duplicate semantic fields are unsupported.
- Ordinary search accepts one registry/special token and defaults to
  `-uploadTime`.
- AI search accepts only `relevance` or `uploadTime`, in either direction, and
  defaults to `-relevance`. Direct load and reload must apply the requested
  ranking; the current behavior that applies Uploaded only after a later
  sort-only interaction is outside the target contract.
- AI and a `collection:` query cannot coexist. AI activation is disabled while
  a collection filter is active. Selecting a collection while AI is active
  removes AI in the same navigation. A pasted conflicting URL drops `aiQuery`
  before searching and keeps the collection query. If its first sort token is a
  valid ordinary token, preserve it; if the sort is absent or AI-only, use
  `-dateAddedToCollection`.
- D3 remains defensive: malformed JSON/sort shapes and unresolved semantic
  aliases must return deliberate 4xx responses, never raw 5xx or silent page-one
  restart. This protects the endpoint independently of Kupua UI rollout.

**Resolved 8 September 2026 (Slice D, `c697cc148`).** D3 now strictly parses
sort/cursor JSON and deliberately rejects duplicate fields, unresolved aliases,
unsupported residual nulls and arity mismatches. Existing flat and object-form
sorts, leading-primary null reduction, reverse paging and PIT cursor truncation
remain intact. Focused Scala suites passed 75/75 and 14/14; live TEST
`--use-media-api` checks covered both fields/directions and deliberate 4xx
responses without retaining identities or field values. PR-branch parity remains
an operational follow-up before Slice J closes.

**Cross-path acceptance 8 September 2026 (Slice J, commit pending).** Direct
ES and D3 now agree with the independent one-semantic-sort contract in all four
special field/direction cases. J fixed special End clause option loss, D3
missing-sentinel serialization and D3's silently ignored offset. Exact fixture
walks own order/map/rank/range claims; live TEST checks own workflow parity;
approximate histogram evidence owns labels/ticks only.

## 6. O3 disposition

The dirty O3 experiment is broken and must not be committed as-is.

Retain only its nested-primary existence correction:

- use the `usages` nested path when excluding parents that possess
  `usages.dateAdded`;
- keep the focused query-shape regression.

Discard its secondary-preservation hunk and restore the committed
`[uploadTime,id]` primary-null fallback with direction derived from the complete
sort clause. Remove the test that blesses preservation of explicit secondaries.

This narrow O3 repair is independently valid because Last used remains a
supported primary semantic sort. It should be implemented in the same containment
phase as URL canonicalisation so the known pre-O3 multi-sort arity failure is not
left reachable.

## 7. Authoritative adjacent findings

These replace O4-O8 in the live findings ledger. O6 is deliberately corrected
from its earlier categorical wording. O9 (raw versus oriented dimensions)
remains separate in the live ledger.

### O4 - Object-form special-sort direction is misread in deep seek

**Confidence:** High from code; user-visible magnitude not isolated.

**Resolved 7 September 2026 (uncommitted Slice E).** Deep seek now parses the
primary clause with `parseSortField`. Failing-first store coverage above the
65,000 position-map threshold proved descending usage/collection sorts requested
the 25th percentile instead of the 75th; both ascending controls already passed.
Final focused coverage passes 4/4, full unit 1220/1220, and habitual E2E 236/236
in 5.0 minutes. Real-ES max-mode/pagination symmetry remains Slice F, not O4
evidence.

Deep seek reads the first clause value with a string cast. Special collection
and usage date sorts encode `{ order, missing, mode?, nested? }`, so descending
special sorts fail the `=== "desc"` check and use the ascending percentile.
Initial sorting and `parseSortField` already understand object-form directions.

**Failure:** A populated-zone scrubber seek can estimate from the opposite end of
the date distribution, producing a large correction or wrong landing.

**First proof:** a store test above 65,000 results with descending
`usagesDateAdded`, a controlled percentile estimator, and an assertion that the
requested percentile is `100 - positionRatio * 100`. Repeat for
`dateAddedToCollection`.

**Fix boundary:** use `parseSortField(primarySort)` in deep seek. Do not call O4
closed until the focused landing tests pass; O5/O10-O12 can otherwise mask its
user-visible effect.

### O5 - Multi-valued date histograms do not represent ranked parent images

**Confidence:** High mechanism; exact landing consequence needs a deterministic
ES fixture.

`getDateDistribution` creates one histogram contribution for every usage or
collection date. For nested usages, `reverse_nested` counts distinct parents
*within each bucket*, but a parent present in multiple buckets is counted once
in each. Summing bucket counts into `coveredCount` therefore can count the same
image repeatedly. Object-array collection dates have the same multi-bucket
problem. Actual sorting chooses one value per image.

**Failure:** The scrubber boundary between populated and missing values can be
misplaced; bucket start positions and deep-seek ratios can cease to be document
ranks.

**First proof:** a local deterministic ES fixture with one parent having dates in
two histogram buckets and another parent having one date. Assert that the current
sum exceeds the number of populated parents. A fetch mock is insufficient.

**Fix boundary:** first obtain exact populated-parent count independently of the
histogram. Exact per-rank buckets over max-per-parent values may require a stored
scalar; do not hide overcount with proportional scaling and call it exact.

### O6 - Secondary missing values have no defined cross-field cursor contract

**Confidence:** High; replaces the false claim that every residual null is
rejected.

Both adapters special-case only a leading primary `null`. A later `null` can
remain in `search_after`. Empirical D3 evidence showed a keyword-shaped
`[number,null,string]` continuation returning HTTP 200, so later null is not a
universal ES rejection. Numeric/date missing values are also represented by
large sentinels in some direct-ES responses and sanitised to `null`; behavior is
field- and version-dependent. Neither adapter validates, normalises or tests a
cross-field contract.

**Failure:** An arbitrary secondary can be accepted, rejected, skip, duplicate,
or fail only after reaching its missing-value boundary. HTTP 200 alone does not
prove omission-free lexicographic traversal.

**Disposition:** Generic secondaries are removed, making this unreachable from
Kupua. D3 should still deliberately reject unsupported residual-null shapes until
an endpoint contract proves them safe. Do not implement recursive null handling.

### O7 - Special date aliases are invalid inside comma sort chains

**Confidence:** Confirmed by code and an observed D3 HTTP 500.

`dateAddedToCollection` and `usagesDateAdded` expand only when they are the entire
`orderBy`. In any comma chain, they become literal non-ES field names and lose
`missing`, `mode`, and nested configuration.

**Failure:** A normal Shift+click can create a sort that fails before pagination;
D3 has exposed this as an accidental 500.

**Disposition:** Remove generic secondaries and canonicalise comma URLs. Also add
D3 validation for unresolved aliases so non-Kupua callers receive a stable 4xx.

### O8 - Duplicate semantic fields diverge between direct ES and D3

**Confidence:** High from code; end-to-end duplicate-null test still required for
server hardening.

The UI prevents choosing the primary as its secondary, but unrestricted URLs can
repeat fields. Direct ES removes every matching primary clause and cursor slot in
the primary null zone. D3 removes every matching clause but only the first cursor
slot, then rejects the arity mismatch.

**Failure:** The same shared URL behaves differently by adapter.

**Disposition:** canonicalise to one recognised semantic token before the store.
D3 should reject duplicate clauses deliberately; it need not define useful
semantics for them.

### O10 - Collection date sort does not pin max-value semantics

**Confidence:** High from clause construction.

**Resolved 7 September 2026 (uncommitted Slice F).** Collection sorts now set
`mode:"max"` in both directions. Builder tests failed first and verify reversal
changes only `order` while preserving `mode`, `missing`, and nested options.
Offset-mixed timestamp regressions also corrected cursor extraction to choose
the maximum parsed instant rather than lexicographic ISO text. The guarded
loopback-9220 oracle proves populated ordering, forward continuation, production-
style backward reconstruction, ES/extractor cursor parity, and terminal null
placement for both special sorts/directions; it cleaned its UUID-owned index to
404 and left the sample count unchanged. Focused units pass 145/145, the oracle
passes in 375ms, and habitual unit passes 1226/1226 without collecting it.

The product and client extractor define Added to collection as the maximum action
date across memberships. Its ES clause omits `mode: "max"`. Elasticsearch's
default mode depends on direction, so ascending order may use a different
per-image date than descending order. Reversing clauses for backward pagination
can therefore change the selected value instead of merely reversing document
order.

**Failure:** Forward and reverse traversal need not be inverses; client-derived
cursors can disagree with ES; ascending labels can show a date other than the one
that placed the image.

**First proof:** a deterministic image with two collection dates, plus neighbours,
asserting descending order, ascending order, and reversed-page identity symmetry.

**Likely fix:** add explicit `mode: "max"` to both directions and ensure D3's
object-sort parser preserves it.

### O11 - Position-map ordering is not the main special-sort ordering

**Confidence:** High from code; real-ES consequence unproved.

`fetchPositionIndex` rebuilds every clause as `{order, missing}`, discarding
special `mode` and `nested` options. It also uses root-level `exists` for the
nested usage primary and sets descending missing values to `_first`, contrary to
the main search's missing-last contract. Phase two preserves arbitrary
secondaries, while the supported product model requires only `uploadTime,id`.

**Failure:** In the indexed-scroll tier, scrubber positions and sort-around-focus
can refer to an order different from rendered search results.

**First proof:** capture generated phase-one/phase-two request bodies for both
special primary sorts, then use a local ES fixture to compare position-map IDs
with a complete ordinary `search_after` walk in both directions.

**Fix boundary:** preserve full clause objects through reverse/paging, use nested
exists where required, keep missing-last in original order, and derive the
primary-null phase from the same helper as ordinary search.

### O12 - `countBefore` does not robustly count max-of-many sort values

**Confidence:** Strong mechanism; exact affected directions need fixture proof.

`countBefore` approximates a special sort with range and equality queries over
individual nested/object values. For max-mode ordering, “any value satisfies the
range” is not always equivalent to “the selected maximum satisfies the range,”
especially for ascending comparisons. Equality also means any child equals the
cursor rather than the selected max equals it.

**Failure:** Deep-seek correction, sort-around-focus, restoration and range
selection can compute the wrong global position even when the fetched page order
is correct.

**First proof:** deterministic parents with date sets whose non-maximum child
crosses the cursor while their maximum does not. Compare `countBefore` against a
complete sorted walk for ascending and descending usage/collection sorts.

**Fix boundary:** do not add increasingly elaborate boolean approximations until
the fixture establishes which cases fail. A stored scalar selected date is the
clean exact solution.

## 8. Materialised scalar option

Detailed evidence, current-schema alternatives, PROD performance measurements,
and backend design obligations live in **Materialized scalars for Last used and
Added to collection**. Keep this section as the decision-record summary.

Current-schema evidence now rejects the exact filter-bank workaround as the
production solution: the 24-bucket half-year PROD request took 2,993ms before
fine month/day precision or concurrent users were considered. Option 2 (exact
null boundary with explicitly approximate populated-zone behavior) is the
selected interim contract. It keeps exact parent and approximate histogram
evidence coordinates separate, projects evidence only for scrubber labels and
ticks, and forbids approximate buckets from acting as exact seek or position-map
anchors. Root materialized latest-date fields remain the route to exact,
fine-grained, conventionally fast scrubber coordinates.

The clean long-term representation for the two special sorts is one indexed
scalar per image, for example `latestUsageDate` and
`latestCollectionActionDate`. Then sorting, percentiles, histograms, `exists`,
`countBefore`, position maps and cursors all operate on the same value and each
image contributes once.

This is not authorised implementation work. It would require mapping changes,
write/update ownership, backfill of the production corpus, consistency when
usage or membership changes, migration safety, and performance review. The
workplan therefore begins with deterministic proofs and a feasibility decision.
If exact current-schema queries cannot satisfy the contract cheaply, stop and
write a separate backend proposal rather than slipping a backfill into a frontend
bug fix.

## 9. Consequences and non-goals

- Removing secondaries does **not** fix O4, O5 or O10-O12. Special primary sorts
  remain supported and require their own correctness tranche.
- It does make O6-O8 unreachable from normal Kupua use and restores agreement
  between scrubber null-tail language and actual ordering.
- O9 remains independent: Width/Height display oriented dimensions while sorting
  raw dimensions.
- File size sort remains an independent possible enhancement.
- O1 distribution completeness remains independent.
- Do not implement “simple” or recursive secondary support during adjacent bug
  fixes.
- Do not restore generic secondaries in response to one named compound-sort
  request. Model that request as one semantic sort and assess it independently.

## 10. Reconsideration triggers

Reopen this decision only with at least one of:

- a concrete editorial workflow where automatic Uploaded fallback is materially
  insufficient;
- telemetry or repeated user reports showing secondary-sort use;
- a named compound sort whose semantics and null behavior can be implemented as
  one scalar/ranking contract;
- a backend rank/cursor abstraction that makes nullable composition cheap without
  duplicating a protocol across TypeScript and Scala.

“Finder supports it” and “the URL already accepts commas” are not sufficient.
