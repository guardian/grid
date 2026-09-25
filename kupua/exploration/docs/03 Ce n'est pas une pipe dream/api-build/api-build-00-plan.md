# API Build Plan: Kupua on media-api, built locally first

**Active build plan, 23 September 2026.** This is the document executing agents work from. Start
every build session with [the session prompt](api-build-01-session-prompt.md). The research
mountain under `../media-api-work/` is background; section 9 says exactly which parts to open,
and when.

**Goal:** Kupua runs with zero browser Elasticsearch traffic, through additive media-api
endpoints. First on the operator's laptop against local modified media-api (TEST ES via tunnel),
then against the same media-api deployed to TEST. We measure and iterate on the endpoint shapes
freely. Only once it works do we split the media-api code into small human-reviewable PRs.
Hosting Kupua for other users is a later, separate decision.

## 1. Decisions (operator, 23 September 2026)

1. **Build locally first; split late.** No endpoint PR is opened while shapes are still changing.
   Nothing becomes one big PR: the final split is 6-9 small PRs (section 7).
2. **D3 is moldable.** The D3 code on this branch is identical to PR #4849, which is in draft and
   not under review. Reshape it as needed; it becomes one of the split PRs. Link #4849's review
   history from the eventual PR. **Update 24 September:** #4849 will be closed, never merged; its
   amendments to Kahuna's `GET /images` path are removed, not ported (section 7).
3. **Do not wait for Grid PR #4957** (usage-search fix). Every server read uses the shared helper
   (section 3), so all endpoints agree with one another before or after #4957. When #4957 merges,
   import it as a parallel unit (P1). Until then, usage-negative/print-code queries carry
   GRID-001/008 behavior in API mode. That is a known limitation, not a blocker.
4. **Build without PIT; add PIT later, after measurement.** Kupua already browses correctly
   without a PIT: local mode, PIT-open failure and expiry all take that path. New uploads are
   excluded by the frozen-until cap. PIT open/close endpoints are unit L1, added only if
   measurement or observed drift gives a concrete reason. Three choices keep that door open (section 3).
5. **Index migrations remain unsupported.** Running without a PIT does not make them safe:
   duplicates can appear during backfill. A PIT pinned to one index is a possible *later* route
   to migration availability; it is not part of this plan.
6. **Hosting later.** Tom's point stands: deploying to AWS needs the media-api route. Laptop,
   then TEST, then hosting.

Why this shape: [P34 assessment](../media-api-work/api-boundary-09-p34-whole-migration-critical-assessment.md)
findings F1-F6. Contract and invariant detail lives in [candidate 11](../media-api-work/api-boundary-11-candidate-plan.md).

## 2. What Must Not Break (short form)

Read the linked sections when a unit touches them; this list is the checklist.

- **Browsing:** three tiers (≤1k scroll, 1k-65k indexed, >65k seek), both page directions, End
  and null tail, deep seek, sort-around-focus, restore, density switches, traversal. The store,
  virtualizer and geometry are not redesigned; the new datasource plugs in behind `ImageDataSource`.
  [Candidate section 5](../media-api-work/api-boundary-11-candidate-plan.md#5-workflow-preservation).
- **Useful limits:** 1,000 buffer, 65,000 indexed threshold, 5,000 range walk, 200 AI results.
  Do not lower them to fit an endpoint.
- **One semantic sort.** Keep D3's Option B sort-clause transport with server validation of the
  supported clause shapes. No second server sort builder. Never call or modify Kahuna's `createSort`.
- **Authoritative tuples:** sort values paired with images, retained through eviction, history and
  ranges. Public tuples never contain `_shard_doc`; read the
  [D-6 review](../../zz%20Archive/media-api-work/phase-3-d3-searchafter-post-pr-review.md) before touching this.
- **Accepted approximations stay approximate:** deep landing, special-date histograms. Exact
  coverage, rank and null boundaries stay exact.
- **Authorization:** caller tier, the deleted-search uploader restriction and syndication
  visibility are applied by Grid on every read. No client-supplied ES DSL, index or target.
- **Grid callers unchanged:** no behavior change to `GET /images`, `createSort`, `prepareSearch`,
  getters, `ImageResponse.create` or existing routes. New code is additive.
- **Completed client repairs keep their contracts:** KUP-001/002/003/004/009/024/025 and the rest,
  as recorded in the [backlog](../../bug-backlog.md). The restore path keeps the accepted
  conditional-rank cost.

## 3. Engineering Choices Baked In

**The shared helper.** One place, written once, that every Kupua-facing read calls:

1. Decode the JSON body into `SearchParams` with the caller's tier (today `SearchParamsBody.fromJson`).
2. Apply the deleted-search uploader restriction (today inline in `searchAfterImages`) and validate.
3. Build the query: `makeQuery` + `buildFilterOpt` (tier filter included) + the conditional
   syndication runtime mapping.
4. Validate Option B sort clauses and tuple arity for ordered operations.
5. **Choose the target:** no snapshot id → live, migration-aware `prepareSearch`; snapshot id →
   `search(Nil).pit(...)`, exactly as D3 does today. Apply the query timeout either way.
6. For image-returning reads, the lean projection and strip-before-validate hit resolution.

D3 is refactored onto the helper first, with its existing tests unchanged. Consistency between
endpoints comes from this helper, not from separate alignment work.

**PIT-ready without PIT:**
- (a) the helper's target choice above;
- (b) **every read goes through `_search`, never `_count`**; `_count` cannot bind to a PIT, so
  rank is a size-0 `_search` with exact total hits;
- (c) public tuples stay PIT-independent, and request bodies may carry an optional `pitId`
  that the helper honors.

Kupua keeps its existing PIT plumbing; in API mode `openPit` resolves `null`.

**Code placement.** New handlers go in a new controller named by function, not "Kupua"
(for example `ImageQueryController`), wired in `MediaApiComponents`. D3 may move there too, so
long as existing handlers keep their behavior. Routes go before `GET /images/:id`. Pattern:
`auth.async(parse.json)`, logMarker first, typed `*Params`/`*Results` with `OWrites`. Follow
[the instructions](../media-api-work/media-api-91-instructions-for-agents.md) and
[conventions](../media-api-work/media-api-90-conventions.md).

**Kupua datasource.** A new `ApiDataSource` implementing `ImageDataSource`, selected by a mode
flag. Existing direct-ES and current hybrid (`VITE_USE_MEDIA_API=true`) modes must keep working.
- **During the build:** API mode may use a *development fallback* ES datasource for methods not
  yet migrated. A test lists exactly which methods still fall back; that list shrinks to empty by U6.
- **At completion:** API mode constructs no `ElasticsearchDataSource` anywhere — factory,
  selection, collections, or the CQL first-registered resolver — and never falls back (KUP-010).
- **Store:** the store is not rewritten; method signatures stay.

**Composed tests.** Capture real Kupua mapper request bodies (golden JSON) in Kupua unit tests
and replay the same bodies in Scala ES integration tests. A hand-written request that bypasses
the mapper does not prove the real path. The usage investigation used this pattern.

## 4. Build Units

One unit per session unless noted. Scala and Kupua work stay in separate commits. Status is
maintained here by the executing agent at completion (section 8).

| ID | Unit | Side | Depends on | Status |
|---|---|---|---|---|
| U1 | Shared helper (D3 refactored onto it) + `POST /images/window` | Scala | — | done |
| U2 | `POST /images/rank` | Scala | U1 | done |
| U3a | `POST /images/sort-profile`: scalar-anchor, date-stats, date-buckets | Scala | U1 | done |
| U3b | sort-profile: keyword-page | Scala | U3a | not started |
| U4 | `POST /images/keys` (source-free, for maps and ranges) | Scala | U1 | not started |
| U5 | `ApiDataSource` for all ordered reads; PIT-less; mode flag | Kupua | U1-U4 | not started |
| M1 | Laptop measurement and iteration gate | Both | U5 | not started |
| U6a | Standalone detail via existing `GET /images/:id` | Kupua | U5 | not started |
| U6b | `POST /images/count` (count + tickers) | Scala + Kupua | U1 | not started |
| U6c | `POST /images/aggregations` + typeahead + collection counts | Scala + Kupua | U1 | not started |
| U6d | `POST /images/mget` + selection injection (hydration and ranges) | Scala + Kupua | U1, U4 | not started |
| U6z | Zero-ES verification: fallback list empty, no ES construction | Kupua | U6a-d | not started |
| U7 | Media from canonical entity links (no `/s3`, `/imgproxy`) | Kupua | U5 | not started |
| U8 | Deploy to TEST; `start.sh` switch for TEST media-api (cookie routing as in e2e-perf) | Both | U6z, U7 | not started |
| M2 | TEST measurement | Both | U8 | not started |
| U9 | AI compatibility endpoint + capability gate | Scala + Kupua | U6c | not started |
| P1 | Import #4957 when merged; mapper default cleanup (KUP-011) | Both | merge | parallel |
| L1 | PIT open/close (only if M1/M2 justify) | Both | M1 | deferred |
| S | Split into reviewable PRs (section 7) | Both | M2 | later |

### Unit notes (what "done" means)

**U1: helper + window.**
- **Request:** the D3 body fields, plus `offset` and `length`.
- **Response:** canonical image entities, a tuple per hit, `total` when counted, and a raw hit
  count so that dropped undecodable hits are visible.
- **Refusals:** `offset + length` above the result window (10,000) → 422.
- **Tests:**
  - D3's existing Scala tests pass unchanged.
  - `window(k, n)` returns exactly positions `[k, k+n)` of a D3 cursor walk (ids and tuples),
    on a fixture with ties, nulls, reverse ordering and one special sort.
  - Deleted-intent and tier controls give identical results through D3 and window.
  - A default query and a GRID-001 witness give the same membership through both (consistency,
    not correctness).
- **Algorithm source:** current D3.
- **As built (operator decisions, 24 September 2026):**
  - **Placement:** D3 and window both live in a new `ImageQueryController`; every later Kupua read
    goes there too. `MediaApi.scala` is byte-identical to `main` (D3's lift of the GET search's
    `hitToImageEntity` is undone; the new controller keeps its own copy, per instructions item 9).
    D3's test assertions are unchanged; its controller tests moved to `ImageQueryControllerTest`.
  - **Shallow rule:** refuse `offset >= 10,000` (422). The refusal is on the start position, not
    `offset + length`: Kupua's shallow seek centres a 200-image page, so starts up to 9,999 must
    work (up to 10,199 end). `length <= 200` stays enforced by `SearchParams.validate`.
  - **Body:** `sortValues`, `reverse: true` and `seekToEnd: true` are refused with 400 (defaults
    accepted); optional `pitId` is honoured through the helper and returns D3's 410 expiry contract.
  - **Response:** `data`, `offset`, `total` (omitted when `countAll` is false), `sortValues`
    (one public tuple per decoded hit, no `_shard_doc`), `rawHitCount`, `pitId` (when present).
  - **Helper (ES side):** `admittedSearch` (query + filters + runtime mapping + live/PIT target +
    timeout), `admitSortClause`, `requireTupleMatches`, `requireSuccessfulRead`, `publicTuple`,
    `withLeanImageSource`/`resolveLeanHit`. Controller side: `admitSearchParams`.
  - **Sort admission** (D3 and window): non-empty, no duplicates, no unresolved aliases, and no
    explicit `_shard_doc` (its PIT-specific value would otherwise survive in public tuples).
  - **GRID-001 test:** asserts D3/window agreement only. Current grouped negation also swallows
    the default replaced-usage hiding once user usage negatives are present; that is GRID-001 and
    changes with #4957, so it is deliberately not asserted.

**U2: rank.**
- **Algorithm:** port `countBefore` from [es-adapter.ts](../../../../src/dal/es-adapter.ts#L1282)
  (live TypeScript is the algorithm source), including null handling, selected-maximum special
  dates and nested usage dates. Implement as a size-0 `_search`.
- **Tests:** rank of the tuple at window position `k` equals `k`, across every supported sort.
- **Decisions (operator, 24 September 2026):**
  - **Incomplete execution:** if the rank search times out or any shard fails, respond with an
    error (503), never a partial count. Kupua's existing countBefore-failure paths handle it
    (sort-around-focus degrades, seek shows its error state, restore falls back to approximate
    seek). A returned "incomplete" flag was rejected: the client could only treat it as a failure
    or use the wrong number.
  - **Shared `sortValues` parser:** D3's inline element check is extracted into one shared body
    parser used by D3 and rank (and later keys), in its own behavior-preservation commit.
  - **Contract (agreed at intake):** body = D3 fields + `sort` + required `sortValues` + optional
    `pitId`; response `{rank, pitId?}`. Nulls allowed in any tuple slot; tuple length must equal
    the sort length. Refused: `reverse`/`seekToEnd` true (400); `missing` other than `_last`,
    `mode` other than `max`, `_shard_doc`, length mismatch, more than 10 sort clauses (422; tie
    predicates grow quadratically). `offset`/`length` pass the same shared validation as D3 and
    window (offset >= 0, length <= 200) but do not affect the count; `countAll` is ignored. The
    count is always exact (`track_total_hits`). Nested path comes from the
    clause, not a client table. Golden-body replay waits for U5 (no Kupua caller yet).

**U3a/U3b: profiles.**
- **Scope:** fixed operation enum only, no generic aggregation DSL. Port from es-adapter.ts
  `estimateSortValue`, `getDateDistribution`, `getKeywordDistribution` and `findKeywordSortValue`.
- **Walk loops:** the page loops and their time/page caps stay in Kupua. The server executes one
  bounded page per call.
- **Exactness:** keep the exact-coverage versus approximate-bucket distinction
  ([inventory 01](../media-api-work/media-api-01-capability-inventory.md), `getDateDistribution` section).
- **Watch:** keyword walks at PROD cardinality (inventory 01, Gap 5); measure in M1.
- **U3a decisions (operator, 25 September 2026):**
  - **Field admission:** `field`, `missingField` and `scope` fields must come from the admitted
    `sort`; `missingField` must be its first (primary) field. Nested path, direction and
    multi-valued (`mode: max`) semantics are read from that clause, never sent separately.
  - **Incomplete execution:** timeout or any failed shard → 503 for every profile operation,
    as for rank. Kupua's existing null paths (no labels, approximate seek fallback) handle it.
  - **Interval:** Kupua keeps choosing the `date-buckets` interval from `date-stats` (fixed enum
    month/day/hour/30m/10m/5m); no server-side stats-then-buckets fusion. ES `search.max_buckets`
    bounds a mistaken fine interval.
- **U3a as built:** `POST /images/sort-profile` in `ImageQueryController`, through `admitSearchParams`
  and `admittedSearch`; size-0 `_search`, `track_total_hits: false`; optional `pitId` (410 on expiry).
  - **Body:** D3 fields + `sort` + `operation` + `field`; `scalar-anchor` adds `percentile` (0-100)
    and optional `scope: [{field, value}]` (term filters); `date-stats` and `date-buckets` add
    optional `missingField`; `date-buckets` adds `interval`.
  - **Responses:** `{value}` (null when no value); `{valueCount, min, max, coveredCount?}` (epoch ms,
    null when no values; `coveredCount` only for max-mode clauses, from an exists filter);
    `{buckets: [{key, count, startPosition}], positionKind, evidenceCount}`, `positionKind`
    `exact-rank` or, for max-mode clauses, `approximate-evidence`; `pitId` when present.
  - **Ports:** tdigest compression 200; nested wrapper and `reverse_nested` parent counts from the
    clause's nested path; zero-count buckets dropped; `min_doc_count: 1`, key order from the clause.
  - **Refusals:** 400 for missing/unknown operation, missing field, bad interval/percentile/scope/
    missingField types, and `sortValues`, `reverse: true` or `seekToEnd: true`; 422 for a field or
    scope field outside the sort, `missingField` other than the primary, percentile outside 0-100,
    `usages.dateAdded`/`collections.actionData.date` profiled without `mode: max` (review fix),
    and the rank sort admission (missing `_last`, mode `max`, at most 10 clauses); 503
    `sort-profile-incomplete` on timeout or failed shard.

**U4: keys.**
- **Response:** ordered `{id, sortValues}` pages without `_source`, for both the valued and
  null-zone phases, plus a continuation.
- **Page size:** use the current map chunk size (10,000). Key pages have their own bounds; they
  do not inherit the 200-image cap.
- **Consumers:** the Kupua map and range collectors keep their loops.
- **Algorithm source:** `fetchPositionIndex` and `getIdRange` (es-adapter.ts:1986, :2258).

**U5: Kupua ordered reads.**
- **Routing:** D3/window/rank/profiles/keys via `ApiDataSource`; `openPit` → `null`; position
  maps built live from keys (still optional).
- **Tests:** golden bodies shared with the Scala tests; the existing store tests pass against
  `ApiDataSource`; direct-mode unit/build/E2E unchanged.
- **Operator check:** a browsing check in API mode.
- **Harness:** teach the e2e-perf runner's environment check to recognize the new API mode, as it
  recognizes `--use-media-api` today, so the smoke check in section 5 works from U5 on. Keep the
  runs labelled distinctly from hybrid runs.
- **Must handle (from U1, operator-required):** the degraded seek fallback
  ([search-store.ts:3510](../../../../src/stores/search-store.ts#L3510),
  [:3521](../../../../src/stores/search-store.ts#L3521)) asks from/size for offsets up to
  `MAX_RESULT_WINDOW - PAGE_SIZE` (~99,800) when the keyword walk's first page fails or no
  estimator exists. Window refuses offsets >= 10,000, so in API mode this would show the error
  state instead of today's approximate landing. Decide the API-mode behaviour (for example land
  via the deep path, or clamp) in U5; do not raise the server limit to fit it.
- **Browser check (from U1):** in API mode, jump to positions around 9,800-10,200 and confirm the
  landing looks right and requests go to `/images/window` below 10,000 and deep paths above.

**M1: laptop measurement.** Run the existing perceived suites (PP1-PP9, JA/JB) and the jank
suite in API mode.
- **Comparisons:**
  - the 12 September media-api baseline ([perceived-log](../../../../e2e-perf/results/perceived-log.md#L1151));
  - a direct-ES run **through the same HTTPS origin** (`KUPUA_PERF_BASE_URL`,
    [handbook](../../../../e2e-perf/README.md#L166)), which removes the origin confound in the old pair.
- **Questions to answer:** (1) what do sort-around-focus, seek and search cost once rank and
  profiles are server-side (PP3/PP4/PP7/PP8); (2) is PIT-less drift visible in practice;
  (3) are keyword walks acceptable.
- **Output:** iterate endpoint shapes if needed. Record results and interpretation in the
  normal perf history; label runs `local-media-api api-mode`.

**U6a-U6d.**
- Detail reuses `GET /images/:id` through the S1 normalizer, bound to the requested ID
  (KUP-004 contract).
- Count keeps baseline-plus-latest polling (KUP-006).
- Aggregations need:
  - verbatim field paths (no `metadata.` prefix);
  - named `is:` filters;
  - nested usage counts with `reverse_nested`;
  - an explicitly empty allowed-ID set distinguished from no restriction.
  See inventory 01 section 7, notes 11-13.
- mget: bounded ID list; per-found-image visibility before enrichment; hidden and missing IDs
  indistinguishable. Evaluate 200 images per request with two in flight; measure a large selection.
  Inject the datasource into selection and collections (today they construct ES directly:
  [selection-store.ts:358](../../../../src/stores/selection-store.ts#L358),
  [collection-store.ts:116](../../../../src/stores/collection-store.ts#L116)).

**U6z.**
- Spies prove zero `ElasticsearchDataSource` construction and zero fallback in API mode,
  including refusal and restore recovery (KUP-010).
- Core-read failures show the existing error state, never an empty result. Optional data
  (collections tree, AI, leases) stays quietly absent.

**U7.** Thumbnails and full images come from entity links (signed URLs, imgops). Check the
details that local imgproxy handles today: rotation, format, DPR, transparency. Renew by
re-fetching the singleton when a signed URL has expired.

**U8.** Deploy the branch's media-api to TEST (operator). Add a `start.sh` switch pointing the
`/api` proxy at TEST media-api, with cookie handling following the e2e-perf authentication
approach. Never write cookies or credentials into the repository.

## 5. Gates for Every Unit

- **Failing test first**, confirmed failing for the right reason. List the existing assertions
  the change may affect before editing.
- **Scala:** `TZ=UTC sbt "media-api/test"` from the repository root (Docker-backed ES tests).
- **Kupua:** `npm --prefix kupua test`, `npm --prefix kupua run build`, and
  `npm --prefix kupua run test:e2e` after store/hook/component/DAL changes. Use the repository's
  runner rules (pipefail + tee, unsandboxed, ports 3000/3030 free, ask the operator first).
- **Direct-ES mode stays green.** The normal E2E suite is direct-ES, so it does not prove API mode.
- **API-mode smoke check (from U5 on):** the operator runs the existing e2e-perf media-api
  preflights: `P14d,P17,P18 --use-media-api --dry-run --runs 2` and
  `--use-media-api --long-perceived-only --dry-run --runs 2`, about two minutes, writing no history
  ([handbook](../../../../e2e-perf/README.md#L84)). Add `--perceived --dry-run` for broader journey
  coverage when a unit touches browsing. These run against TEST through local media-api with the
  operator's cookies. Agents suggest them; the operator runs them. Together with the golden-body
  tests and operator browsing, this is API mode's regression net.
- **No live system access** without the operator's per-session permission; read-only always.
- **Cold review before commit:** the operator runs the [review prompt](api-build-02-review-prompt.md)
  in a fresh chat, using the executing agent's handoff facts. Required for Scala units;
  recommended for Kupua units that touch the store or the DAL.
- **Stop and ask** if: the unit needs a change to existing Grid behavior; authorization differs
  between endpoints; a preservation test would have to be weakened; results disagree
  unexplainedly; or a cost looks material.

## 6. Performance Rules

Existing measurements are the baseline, with their topology limits: local JVM, SSH tunnel,
uncontrolled cache. Do not rerun general baselines without a question M1/M2 names. Do not
extrapolate the historical ~137 ms envelope cost per 200 hits linearly. Keep startup parallel;
add no mandatory serial hop, per-image request or lowered limit. PP6c and P8 remain qualified
watchpoints.

## 7. Splitting Into PRs (unit S)

Target order, each small and independently reviewable:

1. Shared helper + D3.
2. Window.
3. Rank.
4. Profiles.
5. Keys.
6. Count.
7. Aggregations.
8. mget.
9. AI.

Keep one Scala commit (or short series) per endpoint throughout the build, with its tests, so the
split is mechanical. Any shared-file change is its own behavior-preservation commit. Rebase on
main regularly, and use `git merge-tree` before extraction (instructions item 27). PR
descriptions follow the repo memory rule: why, effects on existing callers, risks, reviewer-run
tests. Kupua client commits stay on the prototype branch.

### Existing Grid code this branch touches

**Every split PR description must cover every row it contains:** what changes, why Kupua needs
it, and the effect on existing callers (Kahuna, `GET /images`, other services), even when that
effect is "none". Before opening any PR, rerun `git diff main -- media-api` and reconcile it with
this table; a difference not listed here is a finding to resolve first. Executors update the
table whenever a unit touches an existing file. State after U3a (25 September 2026):

| Existing file | Change | Effect on existing callers | Needed by | PR |
|---|---|---|---|---|
| `MediaApiComponents.scala` | Constructs `ImageQueryController` and adds it to the router list. | None: a new controller only. | Every Kupua endpoint | 1 |
| `conf/routes` | `POST /images/search-after`, `/window`, `/rank`, `/sort-profile`, placed before `GET /images/:id`. | New paths only; the existing `POST /images/:id/...` route has more segments, so nothing is shadowed. | D3, window, rank, profiles | 1, 2, 3, 4 |
| `ElasticSearchModel.scala`: new types | Params, results, body parsers and errors for D3, window, rank and sort profiles (`SortProfile*`, `DateStats`/`DateBuckets`/`ScalarAnchor`). | None: new types only. | Their endpoint | 1-4 |
| `ElasticSearchModel.scala`: `SearchParams` | New field `hasRightsAcquired: Option[Boolean] = None`. `SearchParams.apply(request)` passes `None`, so `GET /images` never sets it. | None at runtime. Code that constructs `SearchParams` positionally must add the argument (compile-time only). | Kupua's rights filter, read from request bodies | 1 |
| `QueryBuilder.buildFilterOpt` | Adds a `syndicationRights.rights.acquired` filter when `hasRightsAcquired` is set. | None for `GET /images` (the field is always `None` there). Applies to any caller that sets it; today only Kupua's reads. Kahuna's own ignored parameter is [GRID-014](../../bug-backlog.md#grid-014), deliberately not fixed here. | Kupua | 1 |
| `sorts.scala` | Adds `jsonToSort` (client sort clause to elastic4s, refusing malformed shapes with 422) and `reverseSorts`. `createSort` and the collection-sort definitions are unchanged. | None. | D3, window, rank sort admission | 1 |
| `ElasticSearch.scala` | Import changes (`duration._` replaces `FiniteDuration`; aggregation imports); new private methods appended after the existing ones. Existing methods are unchanged; the new code calls `prepareSearch`, `withSearchQueryTimeout`, `executeAndLog` and `queryBuilder` as they are. U3a generalized branch-only rank helpers (`admitNullsLastSortClause`, `requireCompleteExecution`) with identical rank messages. | None. | Every Kupua endpoint | 1 onward |
| Test support: `MediaApiTest.scala`, `SortsTest.scala`, `ElasticSearchTest.scala`, `ImageQueryControllerTest.scala` | Controller test helpers and new tests only. `ElasticSearchTestBase.scala` and all existing assertions are identical to `main`. | None. | Their endpoint's PR | per PR |

**Removed from the branch on 24 September** (U2 session, operator decision, `8a60f495d`): abandoned PR #4849's
amendments to Kahuna's `GET /images` path. These were the `dateAddedToCollection` ascending sort,
`unmappedType` and filter widening, `GET /images` reading `hasRightsAcquired` (now GRID-014), and
an orphaned `graphic-image-1` test fixture. #4849 will be closed and none of this is ported.

## 8. Recording Progress

This is the single completion checklist; the session prompt points here. Record each operator
decision in the unit note when it is made, not only at the end. Items 2-4 are done **before the
handoff** (the cold review checks them); the rest after committing. The executing agent:

1. Sets the unit's status row in section 4 and adds a one-line result under section 10: done,
   commit hashes, anything deferred.
2. Updates the unit note: operator decisions and "as built" contract (shape, refusals, limits).
3. Updates the section 7 table for every existing Grid file the unit touched, and confirms
   `git diff main -- ':!kupua'` has no unlisted difference.
4. Appends to section 11 anything noticed but out of scope, and marks resolved entries.
5. Adds newly found Kupua or Grid bugs to the [backlog](../../bug-backlog.md) (next free ID,
   At a Glance row and counts, AGENTS.md ID count).
6. Adds a changelog entry for code changes.
7. Updates AGENTS.md only if architecture, routing or a stated status changed.
8. Resets the worklog to its scaffold before staging.

Endpoint shape changes are recorded in the unit note above, not in a new document. No new
planning documents.

## 9. What Executors Read

| Read | When |
|---|---|
| This plan + the session prompt, AGENTS.md, worklog | Always |
| [Instructions](../media-api-work/media-api-91-instructions-for-agents.md), [conventions](../media-api-work/media-api-90-conventions.md) sections 14-16 | Any Scala unit |
| Candidate 11 [section 2](../media-api-work/api-boundary-11-candidate-plan.md#2-ownership-and-invariants), [section 3](../media-api-work/api-boundary-11-candidate-plan.md#3-concrete-api-capabilities) row for the unit's endpoint, [section 5](../media-api-work/api-boundary-11-candidate-plan.md#5-workflow-preservation) | The unit's endpoint |
| Current source: `media-api` D3 path, `kupua/src/dal/es-adapter.ts` (algorithm source), `strangler-adapter.ts`, `grid-api-search-adapter.ts`, the consuming store code | Every unit |
| Inventory 01 per-method sections and section 7 notes 11-13; workplan 02 section 4 (mget projection/visibility) | U3, U6c, U6d |
| [Sort options](../media-api-work/d3-search-after-03-sort-options.md), D-6 review | Only if touching sort or tuples |
| [Backlog](../../bug-backlog.md) entries named in the unit | Only those entries |
| [Perf handbook](../../../../e2e-perf/README.md), [D3 performance](../media-api-work/d3-search-after-04-performance.md) | M1, M2 |
| [Usage investigation](../../grid-usage-search-investigation.md), candidate [section 15](../media-api-work/api-boundary-11-candidate-plan.md#15-post-merge-prototype-query-alignment-workplan) | P1 only |

**Do not read** unless a unit explicitly points there: registers 06/07 (JSON), the protocol and
packet prompts (05/08), reports P01-P34, report 10, challenge 12, the April plans or the
archived migration assessments. They are research history, not build input. Their useful
conclusions are already folded into candidate 11 and this plan.

### Known conflicts with candidate 11 (this plan wins)

Candidate 11 predates the 23 September decisions. When reading it, treat these statements as
superseded, not as gates:

| Candidate 11 says | Now |
|---|---|
| Header, section 13 and section 15: implementation paused; the next unit is post-merge query alignment; await #4957 before D3 work | Build now. Alignment is parallel unit P1, run when #4957 merges. |
| Section 3 "ordered-path" and "mapped-field" activation dependencies; window row "shared browse consumer may not activate"; S2 row gated on #4957/GRID-001/GRID-008 | The shared helper makes all server reads agree. GRID-001/008 behavior in API mode is a known limitation until P1. It gates usage-query parity claims only. |
| Sections 1-2: "ordinary PIT/map" work; maps use their own PIT; PIT opening parallel with page one | API mode runs without PIT. Maps are built live from keys. PIT is L1, after measurement. |
| Section 3 PIT open/close row, "PIT admission" and lifecycle-interoperability paragraphs; keys row "map context required for a map attempt"; S4 row | Deferred to L1. Keys take an optional `pitId` only through the helper. |
| Section 4 "do not expose a partially implemented API-only mode" | During the build, API mode may use a development fallback with a tested, shrinking list. It must be empty (U6z) before API mode counts as complete. |
| S10 bundles deployed delivery, bootstrap, hosting and API-only activation | Split into U7 (media on the laptop), U8 (TEST) and later hosting. |
| Section 3 execution policy: withholding windows on decode mismatch "requires explicit agreement" | U1 returns a raw hit count so drops are visible. Withholding stays a later decision; ask if a consumer needs it. |

Everything else in candidate 11 — invariants, endpoint contracts, authorization, limits, workflow
preservation, the restore and selection consumer contracts — still applies. If a candidate 11
statement looks like a gate and is not in this table, ask the operator rather than obeying or
ignoring it.

## 10. Progress Log

(One line per completed unit: date, unit, commits, notes.)

- 24 Sep 2026, U1: `6fad30e37` (helper, D3 moved to `ImageQueryController`, `_shard_doc` refused),
  `d0c9da7bf` (`POST /images/window`). Branch merged `main` first (`b45e9d9ab`). Not yet called
  by Kupua (U5); U5 must handle the degraded >10k seek fallback (see U5 note).
- 24 Sep 2026, U2: `5ee26d83f` (shared `sortValues` parser, behavior-preserving), `b24b9259f`
  (`POST /images/rank`). Branch merged `main` first (`d36a764ce`). Cold review: accept with
  fixes (arity cap, broader sort matrix; shared pagination validation kept). Mutation check
  strengthened the collection fixture. Not yet called by Kupua (U5). Same session: `8a60f495d`
  restored Kahuna's `GET /images` path to `main` (#4849 leftovers; section 7, GRID-014).
- 25 Sep 2026, U3a: `d7b2f84ab` (shared nulls-last sort admission and completeness check,
  behavior-preserving), `64afaabe9` (`POST /images/sort-profile`). No merge needed (main's new
  commits touch only `build.sbt` packaging/CI). Cold review: accept with fixes (special dates now
  require `mode: max`; section 7 updated). Not yet called by Kupua (U5); keyword-page is U3b.

## 11. Parked Observations

**Not work items. Executors append; they never act on entries here.** One line each: date, unit,
file:line, what was noticed, and whether it looks like a bug, a risk or a clean-up. Keep at most
20 lines. The operator periodically moves real bugs to the [backlog](../../bug-backlog.md), turns
others into plan changes, or deletes them. Anything that blocks the current unit goes to the
operator in chat instead, not here.

- 25 Sep, U3a, `search-store.ts:3328`: deep seek on a configured keyword-alias primary (e.g. editStatus) asks for a percentile on a keyword field; ES refuses, so `scalar-anchor` answers 500 (logged error) where direct ES gives null. Kupua still degrades. Risk/clean-up for U5: skip the call for non-numeric, non-date primaries.
- 25 Sep, U3a, sbt test harness: a test failing with a raw `ElasticSearchException` can crash the forked test JVM (non-serializable throwable), truncating the run. Clean-up; seen only under deliberate breaks.
- 25 Sep, U3a review, `ElasticSearch.scala` `admitNullsLastSortClause`: rank still admits a special-date clause without `mode: max` (ES then defaults to min for asc), so its max-mode predicates would not apply. Latent; Kupua always sends max. Profiles now refuse it.
