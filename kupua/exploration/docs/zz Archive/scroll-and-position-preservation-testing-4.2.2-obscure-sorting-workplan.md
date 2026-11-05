# Obscure sorting implementation workplan

> **Status:** A-I implemented, validated and committed; J implemented and validated, commit pending.
> **Decision source:**
> `scroll-and-position-preservation-testing-4.2.1-obscure-sorting-decision.md`.
> **Scope:** Kupua containment, O3 repair, D3 defensive validation, then special
> primary-sort correctness. This plan does not authorise recursive secondary-sort
> support or a production backfill.

## 0. Contract and non-negotiables

Implement this contract, not a reinterpretation of it:

- Ordinary Kupua search accepts one recognised semantic `orderBy` token.
- Automatic `uploadTime` fallback and `id` tiebreaker are implementation clauses,
  not user secondaries; they do not apply to flat in-memory AI results.
- AI search supports only Relevance and Uploaded. Other sort options remain
  visible but disabled. `-relevance` is not an Elasticsearch field sort.
- AI and `collection:` queries cannot coexist; collection wins any conflict.
- Generic Shift+click secondary sorting is removed from both toolbar and table.
- Incoming comma URLs keep their first token only when it is valid for the
  current context. Invalid first tokens use the context default; later tokens
  are never salvaged.
- O3 retains only the nested `usages.dateAdded` existence correction; primary
  null zones use `[uploadTime,id]`.
- Special date primary sorts remain supported. They are fixed separately.
- D3 rejects unsupported shapes deliberately; it does not implement recursive
  null phases.

**Halt and ask the user** if preserving comma-separated shared-URL semantics is
required. That reopens the product decision; do not silently implement the
“simple” policy.

## 1. Working rules for every agent

1. Read `AGENTS.md`, `.github/copilot-instructions.md`,
   `worklog-current.md`, the decision document, and this workplan before editing.
2. Inspect `git status --short -- kupua`. The worktree is intentionally dirty.
   Never revert or overwrite unrelated changes.
3. Maintain `worklog-current.md` for every non-trivial slice. On completion,
   update `AGENTS.md` and append a concise narrative to `changelog.md` under the
   current phase. Do not turn AGENTS into a history log.
4. Write a failing test first. Run it and confirm that it fails for the intended
   behavioral reason. If the premise is false, stop; do not invent a fix.
5. Before changing observable behavior, identify existing tests that assert the
   old behavior. Do not weaken assertions merely to get green.
6. After any `kupua/src/` change, run the full unit suite:
   `npm --prefix kupua test 2>&1 | tee "$TMPDIR/kupua-test-output.txt"`.
7. After component, hook, store, range-selection, focus or scroll changes, full
   habitual E2E is mandatory. Before any Playwright command, warn that port 3000
  must be free, ask the user to confirm that the user-started app is stopped and
  port 3000 is free, and wait for that explicit confirmation. Do not run while
  the answer is absent or ambiguous. Then run:
   `npm --prefix kupua run test:e2e 2>&1 | tee "$TMPDIR/kupua-e2e-output.txt"`.
8. Never run perf tests autonomously. Suggest perceived-perf validation after
   special seek/position changes; the user decides whether to run it.
9. Any edit under `media-api/` requires explicit user permission because the
   standing scope is Kupua only. Read the media-api instruction file and
   conventions sections 14-15 before editing.
10. TEST/CODE/PROD access is read-only and requires explicit session permission.
    Never persist identities, values, payloads, credentials, signed URLs or index
    names. Deterministic local fixture identities are allowed.
11. Do not commit without explicit user approval. For Kupua changes, stage only
  `kupua/` from repo root. Slice D's conceptual Scala-only commit is not
  authorised by this Kupua-scoped workflow: do not stage or commit
  `media-api/`. When the user wants that commit, stop for explicit direction
  that resolves the repository staging directive or hand it to a separately
  scoped media-api agent. Keep docs/worklog out of a narrowly requested code
  commit unless the user asks otherwise.

## 2. Dependency graph and commit boundaries

Execute in this order: A-C, E-I, D, then J. D is deliberately deferred until
the direct-ES special-sort contract is settled; J still requires D3 parity
before final acceptance.

| Slice | Purpose | Depends on | Suggested commit |
|---|---|---|---|
| A | Canonical one-sort boundary | none | 1 |
| B | Remove secondary UI | A | 1, together with A |
| C | Narrow broken O3 | A | 1, together with A/B |
| E | O4 direction parsing | C | 3 |
| F | O10 max-mode symmetry | E | 4 |
| G | O5 distribution truth | F | investigation/decision, then 5 if local fix exists |
| H | O11 position-map parity | F and G's selected canonical value | 6 |
| I | O12 countBefore parity | F and G's selected canonical value | 7 |
| D | D3 defensive contract | product contract A; settled E-I request shapes; separate edit permission | 2, separate media-api-scoped commit/handoff |
| J | Cross-path special-sort acceptance | E-I | final verification, no unrelated cleanup |

A-C are one containment change because restoring pre-O3 fallback while comma
URLs remain reachable recreates a known arity failure. Do not land C alone.

D remains independently valuable API hardening but must not expand into general
D3 redesign. It does not block E-I, but J cannot complete until D validates the
settled request shapes. E-I are one finding per implementation/review cycle even
if the user later batches commits differently.

## 3. Phase 1: contain unsupported secondary states

### Slice A - Canonicalise `orderBy` at the URL boundary

**Behavioral target**

- `/search?orderBy=-lastModified,width` replaces itself with
  `/search?orderBy=-lastModified` before the store searches.
- `/search?orderBy=bogus,width` replaces itself with
  `/search?orderBy=-uploadTime`.
- Whitespace and empty comma parts do not reach `buildSortClause`.
- A valid primary special token remains intact.
- AI context accepts only Relevance and Uploaded, defaults to `-relevance`, and
  applies the selected ranking on direct load/reload. `orderBy=-relevance`
  without `aiQuery` canonicalises to `-uploadTime` before ordinary ES search.
- A pasted `query=collection:...&aiQuery=...` conflict drops `aiQuery` before
  search. It preserves a valid ordinary first sort token; absent or AI-only sort
  becomes `-dateAddedToCollection`.
- Browser Back does not reveal an intermediate uncanonicalised entry.

**Preferred ownership**

Add pure functions in `src/lib/search-params-schema.ts` or a nearby dedicated
`src/lib/order-by.ts` only if that keeps the schema readable:

```ts
canonicalizeOrderBy(
  value: string | undefined,
  context: { aiQuery?: string },
): string | undefined
```

Derive ordinary allowed semantic tokens from `Object.values(SORTABLE_FIELDS)`
plus sort-only special tokens; do not create a hand-maintained copy of registry
fields. Treat `relevance` as an explicit context-only exception already present
in `DESC_BY_DEFAULT`: in AI context accept only `relevance` and `uploadTime`, in
either direction, and default invalid first tokens to `-relevance`. Preserve
direction. Canonicalise the complete parsed search object rather than
transforming `orderBy` without access to `aiQuery` and `query`. Use the earliest
route-normalization path.
Verify actual TanStack behavior: a schema transform may change the parsed object
without replacing the address bar. If so, add a replace navigation in
`useUrlSearchSync`; it must return before `setParams/search` and re-enter with the
canonical URL. Check collection and AI auto-sort transitions in
`useUpdateSearchParams`; normalization must not erase their valid single token or
capture a canonical fallback as the pre-mode sort.

Apply these conflict rules atomically:

1. `AiSearchInput` is disabled while a collection filter is active; communicate
  the reason through its accessible disabled state/title.
2. Selecting a collection while AI is active clears `aiQuery` and sets the new
  collection query in one `updateSearch` call. Do not issue an intermediate AI
  search.
3. A pasted/reloaded conflict drops AI before the store searches; collection
  remains active.
4. Removing a collection does not resurrect an AI query.
5. Normal browser Back/Forward restores only valid non-conflicting states.

Current initial AI search publishes Bedrock/KNN order without applying an
alternate URL sort, while `resortAiBuffer` implements only Relevance and
Uploaded. If Uploaded is selected, apply it before publishing the initial or
reloaded AI buffer, not only on later sort-only changes. In `SearchFilters`, keep
ordinary sort options visible during AI mode but disabled; only Relevance and
Uploaded are enabled.

Do **not** canonicalise only inside `buildSortClause`. That would leave shared
URLs, history keys, UI state and adapter requests disagreeing about the search.

**Failing tests first**

No search-param test file currently exists. Add a focused pure unit test near the
canonicaliser covering:

1. `undefined` and `""`;
2. `-lastModified,width -> -lastModified`;
3. `credit,source,uploadedBy -> credit`;
4. duplicate `credit,credit -> credit`;
5. `-usagesDateAdded,width -> -usagesDateAdded`;
6. `uploadTime,usagesDateAdded -> uploadTime`;
7. unknown first token -> `-uploadTime`;
8. configured field aliases remain accepted;
9. whitespace is trimmed;
10. AI query plus either Relevance direction remains valid;
11. AI query plus either Uploaded direction remains valid and direct load/reload
  produces the requested order;
12. AI query plus Credit or a special date defaults to `-relevance`;
13. non-AI `-relevance` becomes `-uploadTime`;
14. entering a collection while AI is active removes AI atomically;
15. AI activation is unavailable while a collection filter is active;
16. pasted AI+collection conflict keeps collection and drops AI before search;
17. unknown-first `bogus,width` uses the context default and does not salvage
  `width` from the second slot.

Add a route/hook-level test if one exists by implementation time. Otherwise E2E
in Slice B must prove address-bar replacement and exactly one settled search
lifecycle. Do not build a broad router harness solely for this slice.

**Focused validation**

From repo root, substitute the actual canonicaliser test path if it differs:

```sh
npm --prefix kupua test -- src/lib/order-by.test.ts src/lib/field-registry.test.ts src/dal/adapters/elasticsearch/sort-builders.test.ts 2>&1 | tee "$TMPDIR/kupua-sort-focused-output.txt"
npm --prefix kupua test 2>&1 | tee "$TMPDIR/kupua-test-output.txt"
```

**Stop conditions**

- If configured aliases cannot be derived without introducing a dependency cycle,
  move only the token metadata to a lower-level pure module; do not duplicate it.
- If URL replacement necessarily creates a second ES search, stop and repair the
  normalization boundary before continuing.
- If old shared links must retain secondary meaning, stop and ask the user.

### Slice B - Remove secondary-sort construction and presentation

**Files**

- `src/components/SearchFilters.tsx`
- `src/components/ImageTable.tsx`
- `e2e/local/ui-features.spec.ts`
- any focused component tests discovered before editing

**Changes**

- Delete `parseSecondarySort` and secondary state from `SearchFilters`.
- Normal dropdown selection sets/toggles one primary. Shift+click has no distinct
  sort behavior. Prefer treating it exactly as a normal click; do not leave a
  hidden no-op gesture.
- Direction toggle changes the primary only.
- Delete secondary double-arrow rendering and any secondary-specific visual or
  accessible state.
- In `ImageTable`, simplify `handleSort` to primary-only behavior and remove
  parsing/rendering of the second token. Preserve other Shift+click semantics:
  range selection and metadata click-to-search are unrelated and must not change.
- Remove stale comments and docs claiming Shift+click adds a secondary.

**Failing E2E first**

Rewrite the existing `ui-features.spec.ts` test currently named
`shift-clicking a column header adds a secondary sort` before production edits.
The replacement must prove:

1. Shift+click on Source after Credit yields only `orderBy=source` (same behavior
   as a normal primary selection), with no comma;
2. the sort control/header exposes one indicator, not a secondary double arrow;
3. navigating directly to `orderBy=credit,source` ends at `orderBy=credit`;
4. store params are canonical and no request contains an unresolved special
   secondary.

Add the equivalent toolbar Shift+click assertion if the existing test does not
cover it. Keep this focused; do not alter range-selection Shift+click tests.

**Validation**

Full unit, then full E2E after the mandatory port warning. Manually inspect both
table and grid sort controls at desktop width only if E2E cannot establish the
state. No screenshot baseline is needed unless existing visual tests require it.

### Slice C - Narrow O3 to nested-primary filtering

**Files**

- dirty `src/dal/null-zone.ts`
- dirty `src/dal/selections-dal.test.ts`

**Desired implementation**

Start from committed pre-O3 behavior, then retain only:

- the `NESTED_SORT_FIELDS` import;
- nested wrapping of the primary `exists` query;
- the focused nested-primary test.

Restore:

- derivation of `uploadTime` direction from the full clause;
- `strippedCursor` shape `[uploadTime,id]`;
- `sortOverride` shape `[{uploadTime: dir},{id:"asc"}]`;
- response remapping to the original one-semantic-sort tuple.

Delete/rewrite the dirty test named `preserves explicit secondary sorts inside
the primary null zone`. It blesses a rejected and reproduced-broken contract.

**Failing-first requirement**

Because the nested test already failed before its production hunk, preserve that
red/green history in the worklog. Add a canonicalisation-level regression proving
a comma URL cannot invoke `detectNullZoneCursor`. Do not manufacture a direct
helper test for an impossible multi-sort state after Slice A.

**Focused validation**

Run `src/dal/selections-dal.test.ts`, then the full unit suite. A-C together touch
components/store orchestration behavior, so run full E2E after the port gate.

**Acceptance**

- ordinary and special primary null-zone tests pass;
- no Kupua UI/URL state contains semantic commas;
- direct ES reduced sort and cursor lengths always match;
- nested usages exclusion has the correct query shape;
- no recursive null handling was added.

## 4. Phase 2: harden D3 independently

### Slice D - Deliberate rejection, never accidental 500/restart

**Status:** Implemented, validated and committed 8 September 2026 (`c697cc148`).
PR-branch harvest and exact-file parity remain part of Slice J acceptance.

**Permission gate**

Ask explicitly before editing any `media-api/` file. If permission is denied,
write the exact failing-test proposal to the worklog and leave this slice open.

**Read first**

- `.github/instructions/media-api.instructions.md`
- media-api conventions sections 14-15
- D3 post-review notes about Option B and `_shard_doc`

Do not change `createSort`, PIT tiebreaker truncation, source shaping, or general
endpoint architecture.

**Contract**

- `sort` and `sortValues`, when present, must have the expected JSON types.
  Wrong-type input must not become `None` and silently restart page one.
- resolved one-semantic-sort clauses continue to work, including object-form
  special primary sorts;
- unresolved semantic aliases, duplicate field clauses, and residual `JsNull`
  outside the supported leading-primary slot receive `InvalidUriParams` and a
  stable 4xx;
- leading-primary `JsNull` reduction continues to work;
- cursor/sort arity mismatch remains deliberate 422;
- direct ES and D3 need parity only for the supported one-semantic-sort contract.

**Tests first**

In `media-api/test/lib/elasticsearch/ElasticSearchTest.scala`, add method-level
red tests for:

1. one supported flat primary cursor;
2. one supported nested special primary leading-null cursor;
3. residual `JsNull` after leading reduction;
4. residual `JsNull` without leading reduction;
5. duplicate field clauses;
6. unresolved `usagesDateAdded` and `dateAddedToCollection` aliases;
7. reverse form where validation order could differ.

In `SortsTest.scala`, add only parser-level cases owned by `jsonToSort`.

No controller-test directory currently exists. Do not invent a broad controller
harness without asking. First inspect whether `searchAfterImages` request parsing
can be extracted as a small pure `Reads`/validator with focused tests. If not,
record that method-level rejection is proved but HTTP wrong-type behavior remains
an explicit gap. Existing browser evidence of a special-secondary HTTP 500 is
not a substitute for an automated action test.

**Implementation boundary**

Likely files, after permission:

- strict request body parsing in `MediaApi.scala` or a request `Reads` in
  `ElasticSearchModel.scala`;
- supported cursor/duplicate validation beside the existing arity check in
  `ElasticSearch.scala`;
- unresolved alias validation in `sorts.scala` or the request validator;
- contract comment in `ElasticSearchModel.scala`.

Keep server validation semantic enough to reject known Kupua aliases, but do not
copy the whole field registry into Scala. D3 accepts resolved ES clauses under
Option B; its primary safety checks are shape, duplicate fields, supported null
position and forbidden unresolved alias names.

**Focused command**

Use the established focused surfaces from repo root, with visible tee output:

```

TZ=UTC sbt "media-api/testOnly lib.elasticsearch.SortsTest" 2>&1 | tee "$TMPDIR/media-api-sorts-test-output.txt"
TZ=UTC sbt "media-api/testOnly lib.elasticsearch.ElasticSearchTest" 2>&1 | tee "$TMPDIR/media-api-es-test-output.txt"

```

Do not run the full monorepo/media-api suite unless the user asks or the focused
change reveals broader impact.

**Stop conditions**

- If current ES accepts a residual keyword null, the server may still reject it
  as outside the declared contract. Do not broaden support merely because one
  mapping accepts it.
- If a second legitimate client requires arbitrary multi-sort clauses, stop and
  reopen endpoint requirements.
- If strict JSON parsing requires broad controller rearchitecture, report the
  residual gap and keep the data-layer guard small.

**Result**

Strict request parsing now distinguishes omitted first-page cursors from malformed
sort/cursor JSON. The data layer rejects duplicate fields, unresolved special-sort
aliases, residual nulls outside the supported leading-primary phase and cursor
arity mismatches before Elasticsearch. `jsonToSort` rejects malformed optional
object properties while preserving valid `order`, `missing`, `mode` and nested
path configuration.

Failing-first coverage proved the prior requests either reached Elasticsearch or
were accepted. Final focused suites passed `ElasticSearchTest` 75/75 and
`SortsTest` 14/14. Live TEST `--use-media-api` validation covered initial,
forward, backward and null-zone behavior for both special fields/directions, plus
deliberate 400/422 responses. Existing Grid/Kahuna paths are unchanged. Strict
typing of D3's `pitId`, `reverse` and `seekToEnd` envelope fields remains a narrow
pre-production follow-up, not work for D8.

## 5. Phase 3: special date primary correctness

This phase retains Last used and Added to collection as primary sorts. It must use
one canonical per-image value: the maximum relevant date. Do not conflate it with
secondary-sort removal.

### Shared deterministic fixture requirement

Fetch mocks can prove request shape but not Elasticsearch multi-value semantics.
Before Slice F/G/H/I claims ordering correctness:

1. Ask permission to create a uniquely named local-only test index on port 9220.
2. Use only fixed synthetic documents and non-sensitive IDs.
3. Record the real local sample-index count before and after; never write to it.
4. Delete only the synthetic index in cleanup and prove it returns 404.
5. Preserve the fixture/setup as automated test infrastructure if practical;
   otherwise preserve the exact red test design in the worklog.
6. If permission is denied, limit conclusions to request-shape tests and mark
   ordering claims unproved.

The local-ES test must be opt-in and excluded from habitual `npm test`. Create a
dedicated surface such as:

- `integration/special-sort-es.test.ts`;
- `vitest.special-sort-es.config.ts`, including only that file;
- package script `test:special-sort-es`;
- an explicit environment guard such as `KUPUA_LOCAL_ES_MUTATION_OK=1`;
- a hard runtime assertion that the target is exactly loopback port 9220 before
  any create, index or delete operation.

**Future-run triggers:** run this oracle after changing either special sort
clause, reverse pagination, special cursor extraction, position-map special-sort
handling, date distributions, `countBefore`, the `usages`/`collections` mappings,
or the Elasticsearch version. It is intentionally absent from habitual unit and
E2E runs; `package.json` exposes the named command, while `AGENTS.md`, this
workplan, and the test-file header carry the triggers so the explicit surface
remains discoverable.

Run it only after the user's explicit fixture permission:

```sh
KUPUA_LOCAL_ES_MUTATION_OK=1 npm --prefix kupua run test:special-sort-es 2>&1 | tee "$TMPDIR/kupua-special-sort-es-output.txt"
```

The test owns only a unique synthetic index and cleans it in `finally`. It must
never discover or mutate the normal local sample index. Configure the ordinary
Vitest suite to exclude this file explicitly; do not rely only on its directory
or environment guard.

Suggested minimal documents:

- parent A dates `[2024-01-01, 2024-03-01]`;
- parent B date `[2024-02-01]`;
- parent C dates `[2024-01-15, 2024-04-01]`;
- parent D has the container but no date;
- parent E has no container;
- distinct upload times and deterministic IDs.

Create equivalent nested `usages` and object-array `collections` shapes.

### Slice E - O4 object-form direction

**Status:** Implemented, validated and committed 7 September 2026 (`2122bed05`).

**Red tests**

Add focused deep-seek store cases to `search-store-extended.test.ts` or a new
special-sort seek test file if isolation is cleaner:

- total must exceed 65,000 (for example 66,000 or 120,000), otherwise the
  position-map fast path masks deep seek;
- descending `usagesDateAdded` at 25% of covered results calls
  `estimateSortValue` with approximately the 75th percentile;
- ascending form calls approximately the 25th percentile;
- repeat for `dateAddedToCollection`;
- capture the emitted sort/cursor length and mapped types;
- wait for all store operations/cooldowns so module-level in-flight flags do not
  poison later tests.

The first test must fail because `primaryDir` is derived by casting an object to
string.

**Change**

Use `parseSortField(primarySort)` for field and direction in the deep-seek path.
Do not refactor all sort parsing in this slice.

**Acceptance**

Focused red/green, full unit, full E2E after port gate. A landing tolerance test
must not be used to prove O4 until fixture distributions are trustworthy.

### Slice F - O10 max-mode and reverse symmetry

**Status:** Implemented, validated and committed 7 September 2026 (`6d57f9c47`).

**Red tests**

1. Update builder expectations so both collection directions specify
   `mode: "max"` and `missing: "_last"`.
2. Assert `reverseSortClause` flips only `order` and preserves `mode`, `missing`
   and nested options.
3. With the deterministic ES fixture, prove that ascending results are the exact
   reverse of descending results after accounting for the fixed `id` tiebreaker,
   and that backward pagination reconstructs the preceding page without overlap
   or omission.
4. Assert `extractSortValues` matches each ES-returned selected date.

The exact-reverse and backward-page assertions apply to the populated region.
Missing values remain terminal in both directions; raw ES exposes an internal
date sentinel that cannot be reused directly in `search_after`. Assert terminal
null placement in one page here. Production cursor sanitization and null-zone
crossing remain H/J parity requirements.

**Change**

Add explicit max mode to `dateAddedToCollection`. Ensure D3 `jsonToSort` already
preserves the mode; add a focused parser assertion if missing.

**Stop** if Elasticsearch cannot apply `mode:max` to the object-array collection
mapping. In that case, do not choose another implicit mode; move directly to the
materialised-scalar decision in Slice G.

### Slice G - O5 exact boundary and distribution decision

**Status:** Option B selected, implemented, validated and committed 8 September
2026 (`e9819c6be`).

**Decision evidence (7 September 2026):** PROD's monthly histogram inflated
4,142,917 dated parents to 5,034,659 positions (+21.5%). The exact 12-bucket
filter bank took 1,829ms; a still-coarse 24-bucket half-year bank took 2,993ms,
reaching the agreed rejection threshold with no timeout or failed shards. Reject
Option A as the shipped solution and do not run larger/concurrent PROD banks.
Option B is the selected interim contract.
Detailed evidence lives in **Materialized scalars for Last used and Added to
collection**.

Split two contracts:

1. **Exact null boundary:** number of parent images whose selected special date
   exists.
2. **Position labels/ticks:** approximate or exact rank of the selected max date.

**Red tests**

- fixture proves current histogram sum counts a multi-bucket parent more than
  once;
- exact populated-parent count equals unique parents with at least one date;
- `coveredCount <= total` always;
- null boundary stays identical in ascending and descending order;
- bucket `startPosition` must not be labelled exact unless each parent contributes
  to exactly one bucket.

**Decision gate**

Investigate, in order:

A. Can a current-schema ES aggregation cheaply bucket parents by their selected
maximum and count each parent once? Require one bounded query, no scripted sort,
no per-document client walk, and a measured local/TEST performance argument.

B. If not, can the scrubber use an exact boundary plus explicitly approximate
populated-zone labels without corrupting seek? Seek must not consume approximate
bucket positions as exact anchors.

C. If neither is acceptable, disable populated-zone scrubber seek/ticks for the
special sort while preserving ordinary scroll and null-zone boundary, or propose
materialised scalar fields.

**Halt for performance:** any scripted aggregation, runtime field, composite walk
through all parent dates, or additional per-seek iterative requests may seriously
impact performance. Explain and ask the user before proceeding.

**Allowed local fix**

It is safe to compute exact `coveredCount` with a separate cardinality/count query
only if it measures parent images and does not create a second source of truth for
ordering. Do not rescale flawed histogram buckets and call them exact.

**Implemented contract**

- a root-parent existence aggregation supplies exact `coveredCount` for both
  special fields and therefore the exact populated/null boundary;
- child/object histogram cumulative counts remain separate `evidenceCount`
  coordinates with `bucketPositionKind: "approximate-evidence"`;
- one endpoint-aware projection maps evidence to the exact populated span for
  ticks and maps ranks back to evidence for explicitly `Approx.` labels;
- approximate buckets are presentation evidence only and never keyword-style
  deep-seek anchors;
- null-zone classification uses the exact boundary even before upload-time
  enrichment loads, and Scrubber accessibility text strips visual label markup.

Focused Option B contracts passed 25/25 before review. Independent review found
and corrected a null-zone enrichment dependency, inconsistent forward/reverse
coordinate projections, and missing second-request aggregation-shape coverage.
Post-review focused tests passed 32/32. A pre-commit review then found and fixed
compressed evidence buckets retaining a tick inconsistent with the label at the
same rank; focused collision coverage passed 16/16. Final full unit passed
1238/1238 across 64 files, habitual E2E passed 236/236 in 5.2 minutes, and the
guarded local-ES oracle proved 3 exact parents versus 5 histogram evidence
contributions while retaining sort/pagination and cleanup assertions.

**Materialised-scalar proposal trigger**

If exact max-per-parent ranks cannot be queried cheaply, write a separate design
proposal covering mappings, producers, mutation consistency, backfill, migration,
read compatibility and rollout. Do not implement mapping/backfill in this plan.
The proposal/evidence record now exists as **Materialized scalars for Last used
and Added to collection**; update it rather than duplicating future measurements.

### Slice H - O11 position-map parity

**Status:** Implemented, validated and committed 8 September 2026 (`6b7398e2e`).

Do not begin until Slice F defines the canonical sort clause and Slice G defines
whether ranked distribution is exact or approximate.

**G dependency:** Option B's histogram buckets are approximate presentation
evidence only. They must not feed, rescale, relax or validate the position map.
H remains an exact identity/rank oracle: preserve the complete `mode:max`
special-sort clause and require zero-tolerance parity with a complete ordinary
`search_after` walk for both special fields and both directions.

**Red request-shape tests**

Capture `fetchPositionIndex` phase requests and assert:

- phase one preserves the entire primary clause including `mode:max`, nested path
  and `missing:_last`;
- nested usage `exists` is wrapped in a nested query;
- collection `exists` remains root/object-path appropriate;
- original-order missing values stay last for both directions;
- primary-null phase sorts only by `[uploadTime,id]`;
- stored phase-two tuples remap to full one-semantic-sort shape;
- reverse operations preserve clause options.

**Red ES parity test**

For each special sort and direction, compare every fixture ID from
`fetchPositionIndex` with a complete ordinary `search_after` walk. Identity arrays
must match exactly. No tolerance is allowed.

**Implementation direction**

Extract/reuse a pure helper for primary-present and primary-absent phase clauses
only if it genuinely makes ordinary search and position map share the same rule.
Do not introduce a generic recursive sort abstraction.

**Validation**

Focused DAL/position-map tests, full unit, full E2E. Suggest perceived-perf runs;
do not run them autonomously because position-map construction affects indexed
scroll timing.

**Result**

`fetchPositionIndex` now preserves canonical phase-one clauses verbatim,
including `mode:max`, nested options and `missing:_last`, and uses the canonical
`[uploadTime,id]` fallback for the primary-null phase. Usage existence is nested;
collection existence remains root-scoped. G's approximate histogram evidence is
not read anywhere in the position-map path.

Request-shape tests cover both special fields and directions. A 10,000-hit-per-
phase fixture forces continuation requests and proves full PIT cursors plus
refreshed PIT IDs. The guarded local-ES oracle walks the complete fixture through
production `searchAfter` in two-item pages, crosses into and through the null
zone, and requires exact ID/full-tuple parity with production
`fetchPositionIndex` for all four cases. Focused tests passed 22/22, full unit
passed 1243/1243 across 64 files, habitual E2E passed 236/236 in 4.9 minutes, and
the guarded oracle passed with fixture cleanup and unchanged sample count.

### Slice I - O12 `countBefore` parity

**Status:** Implemented, validated and committed 8 September 2026 (`f4bad5237`).

**Red fixture oracle**

Build the expected rank by performing a complete sorted fixture walk. For each
returned cursor, call `countBefore`; it must equal that cursor's zero-based rank.
Cover:

- usages max date, asc and desc;
- collection max date, asc and desc;
- two parents sharing the same selected max, resolved by uploadTime then id;
- a parent with an earlier child crossing the cursor while its maximum does not;
- first null-primary document and later null-zone document.

Also assert sort-around-focus and range selection use the correct rank with these
cursors if their code can be exercised cheaply against the same fixture.

**Decision gate**

If boolean queries over child values cannot express selected-max rank exactly,
stop. Do not pile more ranges onto the approximation. Choose one:

- use a backend aggregation/rank endpoint with measured acceptable cost;
- use the materialised scalar proposal;
- explicitly disable operations requiring exact rank for special sorts.

Any fallback must be visible and deterministic. A wrong global counter is not an
acceptable approximation.

**Result**

The decision gate did not require a fallback. Exact current-schema predicates
are expressible for `mode:max`: equality requires an equal child and no greater
child; ascending-before requires field existence and no child at or above the
cursor; descending-before remains any child greater than the cursor. Ordinary
non-max sort predicates are unchanged.

The seven-document guarded local-ES oracle verifies every zero-based rank for
both special fields/directions, including crossing children, selected-max ties,
distinct and equal upload times, final ID tiebreaking, first/later nulls, exact
populated ranges and populated-to-null range selection. Restore forwards the
complete `[selectedMax,uploadTime,id]` cursor. Focused adapter tests passed
26/26 and the focused store suite passed 101/101.

Three sequential direct-TEST median-cursor checks found no pathological cost:
usage asc 90/132/118ms, usage desc 87/95/122ms, collection asc 94/131/90ms,
collection desc 113/90/87ms wall time. This is shape/latency evidence, not a
PROD benchmark. Final full unit passed 1248/1248 across 64 files, habitual E2E
passed 236/236 in 5.0 minutes, and independent review found no correctness or
safety issue.

### Slice J - Cross-path acceptance

**Status:** Implemented and validated 8 September 2026; commit pending.

After E-I, one-semantic special sorts must satisfy this matrix in both directions:

| Operation | Last used | Added to collection | Required assertion |
|---|---|---|---|
| Initial page | yes | yes | exact fixture order |
| Forward extension | yes | yes | no overlap/omission |
| Backward extension | yes | yes | inverse page identities |
| Midpoint populated seek | per G decision | per G decision | exact rank or visibly disabled |
| Null-zone seek and End | yes | yes | fallback `[uploadTime,id]`, correct boundary |
| Position map | yes | yes | identical complete ID order |
| Sort-around-focus | yes | yes | correct identity and rank |
| Detail/history restore | yes | yes | same identity, supported placement |
| Range selection | yes | yes | exact IDs or named disabled behavior |
| Scrubber labels/ticks | per G decision | per G decision | never claim false exactness |
| Direct ES / D3 | yes | yes | same supported clause/cursor contract |

Before changing any existing position/focus expectation, identify tests asserting
the old behavior and reason whether the test or implementation is wrong.

Run full unit and, after the port gate, full habitual E2E. Suggest the perceived
perf surface because `search-store`, sort-around-focus, position map and scrubber
trace sites are touched. Never run it autonomously.

**Result**

Cross-path acceptance exposed two defects rather than merely confirming E-I.
First, direct ES `seekToEnd` rebuilt the primary clause from field/direction and
dropped `mode:max` plus the nested usage context. The guarded oracle failed on
the nested sort and now proves exact End IDs/cursors for both fields/directions.
Second, D3 serialized Elasticsearch's missing-date Long sentinels as numbers and
silently ignored non-zero `offset`. The first broke null-cursor round trips; the
second made media-api shallow seeks return page-one identities under a fabricated
deep buffer offset.

`seekToEnd` now preserves the canonical object-form clause while changing only
`missing` to `_first`. D3 serializes Long min/max sentinels as null and rejects
non-zero offset. `StranglerAdapter` keeps only plain cursorless shallow-offset
paging on direct ES; PIT, cursor, reverse and End calls remain D3-backed.

The seven-document oracle proves exact full order, forward/backward behavior,
End, maps, every `countBefore` rank and ranges with zero tolerance. Four-way
unit coverage protects End clauses, focus/restore cursors and explicitly
approximate labels/ticks. Live TEST matrices in direct and media-api modes
matched on initial/forward/backward pages, exact seek coordinates, focus rank,
restore placement and null-zone End behavior. Final validation passed 1,270
unit tests, 236 habitual E2E in 5.2 minutes, 77 Scala integration tests, 14
Scala parser tests and the guarded oracle in 831ms. Independent final review
found no defects. G evidence remained presentation-only throughout.

## 6. Documentation updates by slice

After A-C:

- remove O4-O8 from `scroll-and-position-preservation-testing-4-findings.md` only
  after confirming the decision doc is reviewed and linked;
- update KAD #8 in `AGENTS.md` from comma-separated multi-sort to one semantic
  sort plus automatic fallbacks;
- update component summary/context docs that advertise secondary Shift+click;
- update frontend philosophy, capability/feature inventory, scrubber docs and
  deviations where they claim generic secondary support;
- append the implementation narrative to `changelog.md`;
- keep this workplan's status current.

After each of E-I:

- mark the authoritative finding resolved in the decision doc with commit/test
  evidence, without deleting the original mechanism;
- update architecture docs only where the shipped contract changed;
- append detailed narrative to changelog and keep AGENTS lean.

If materialised scalar fields are selected, create a separate backend design and
link it from the decision doc. Do not put migration history into AGENTS.

## 7. Review checklist

A lesser agent may call a slice complete only when every applicable item is true:

- [ ] It named one falsifiable mechanism before editing.
- [ ] A new test failed first for the intended reason.
- [ ] Existing tests asserting old behavior were identified before production edits.
- [ ] The focused test passed after the smallest change.
- [ ] Full Kupua unit suite passed after every `src` change.
- [ ] Full habitual E2E passed after component/hook/store/scroll changes, with the
      port-3000 warning and user confirmation first.
- [ ] Direct ES and D3 were not conflated.
- [ ] No TEST identity/value/payload or credential was written to disk.
- [ ] No unrelated dirty-worktree change was reverted.
- [ ] No recursive secondary-sort machinery was introduced.
- [ ] Exact versus approximate position claims are labelled honestly.
- [ ] Performance-sensitive proposals were stopped for user review.
- [ ] Worklog, changelog and lean AGENTS snapshot were updated as required.
- [ ] No commit was made without explicit approval.

## 8. Definition of done

The project is complete when:

1. Kupua cannot construct or retain a semantic secondary through UI, URL,
   history, store or DAL.
2. Dirty O3 has become the nested-primary fix plus fallback-only null handling.
3. D3 deliberately rejects unsupported request shapes and safely serves every
   emitted one-semantic-sort shape.
4. O4 and O10 have deterministic red/green coverage.
5. O5, O11 and O12 are either fixed exactly or result in explicitly disabled
   operations plus an approved materialised-scalar design; none remains silently
   approximate while claiming exact global position.
6. The cross-path matrix passes for both special primary sorts.
7. The live findings ledger no longer duplicates O4-O8, and architecture docs
   describe the shipped contract.
8. Full required tests are green, with any unrun manual perf surface clearly
   reported to the user.

## 9. Adjacent observations (out of scope)

Keep this list succinct. Do not investigate an item unless it blocks the active
slice or the user explicitly promotes it.

- Width/Height display oriented dimensions but sort raw dimensions (O9).
- Cancelled navigation can emit noisy background position-map fetch warnings.
- Vite warns that `__dirname` is incompatible with its future native config loader.
- A local hostname can silently serve another checkout if that checkout owns port 3000.
