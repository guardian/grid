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

**Current milestone (operator, 26 September):** U6z verifies zero browser Elasticsearch traffic
for non-AI operations, including recovery. Existing AI search remains unchanged as the sole
explicit ES exception pending team agreement on its migration. The absolute zero-ES goal above
is later, not a reason to disable AI. U7's media-delivery changes remain separate.

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
  yet migrated. After U6d the tested list is exactly `searchByAi`; retain that sole exception
  through U6z. No non-AI operation may use ES, including after refusal or recovery (KUP-010).
- **At U6z:** verify actual startup, selection/collection ownership and CQL first registration,
  not only adapters injected into an already-imported store. ES construction needed by existing
  AI is allowed; do not refactor or disable AI merely to remove that construction.
- **At eventual full API-only completion:** remove the final AI ES dependency and prove no ES
  construction or traffic across all owners. This is not U6z's present acceptance criterion.
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
| U3b | sort-profile: keyword-page | Scala | U3a | done |
| U4 | `POST /images/keys` (source-free, for maps and ranges) | Scala | U1 | done |
| U5 | `ApiDataSource` for all ordered reads; PIT-less; mode flag | Kupua | U1-U4 | done |
| M1 | Laptop measurement and iteration gate | Both | U5 | accepted by operator (confirmed 26 September) |
| U6a | Standalone detail via existing `GET /images/:id` | Kupua | U5 | done |
| U6b | `POST /images/count` (count + tickers) | Scala + Kupua | U1 | done |
| U6c | `POST /images/aggregations` + typeahead + collection counts | Scala + Kupua | U1 | done |
| U6d | `POST /images/mget` + selection injection (hydration and ranges) | Scala + Kupua | U1, U4 | done |
| U6z | Non-AI media-api coverage and recovery verification; existing AI retained | Kupua | U6a-d | not started |
| U8 | Deploy to TEST; `start.sh` switch for TEST media-api (cookie routing as in e2e-perf) | Both | U6z | not started |
| M2a | TEST API measurement, retaining current local image delivery | Both | U8 | not started |
| U7 | Media from canonical entity links (no `/s3`, `/imgproxy`) | Kupua | M2a | not started |
| M2b | Canonical media delivery checks and targeted measurement | Both | U7 | not started |
| U9 | AI migration and capability contract, subject to team agreement | Scala + Kupua | U6c, team agreement | deferred; existing AI unchanged |
| P1 | Import #4957 when merged; mapper default cleanup (KUP-011) | Both | merge | parallel |
| L1 | PIT open/close (only if M1/M2a/M2b justify) | Both | M1 | deferred |
| S | Split into reviewable PRs (section 7) | Both | M2b | later |

**Sequencing amendment (operator, 25 September):** U5 -> M1 -> U6a-d/U6z -> U8 -> M2a ->
U7 -> M2b. Measure the deployed API before changing image delivery, so those effects can be
assessed separately. M1 uses the modified branch's media-api on the laptop against TEST ES
through the tunnel; U8/M2a use that branch deployed to TEST. Neither requires merging to main.
U7 follows M2a by choice, not because deploying the API technically requires canonical media
delivery. **Amended 26 September:** U9 remains deferred while AI is discussed with the team;
U6z preserves today's working AI, including its ES path. Do not fold filter text into AI ranking,
change result/count semantics, hide the controls or remove saved-URL support to satisfy a gate.
[AI workplan](../../ai-search-catching-up-workplan.md) explains the compatibility gap; its older
proposed compromises are not approval to change current AI behavior.

**Pitstop order (operator, 26 September):** amend this plan, then investigate/fix
[KUP-033](../../bug-backlog.md#kup-033) (backward null-zone crossing), separately
[KUP-034](../../bug-backlog.md#kup-034) if confirmed (near-top backward-page sizing), then
[KUP-036](../../bug-backlog.md#kup-036) (incomplete D3/window execution), before U6z's final
verification. These are separate fixes, not permission to sweep section 11. Each session
confirms its implementation scope and any required Scala write permission before editing.

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
- **U3b decisions (operator, 25 September 2026):**
  - **Continuation:** the response's `after` is the last page's composite key as a plain JSON
    scalar; Kupua sends it back for the next page. No sealed server token (inventory 01's D5/D6
    token assumed a server-owned walk; the plan keeps loops in Kupua). Drift between pages without
    a PIT matches today's direct-ES walk; optional `pitId` still pins pages.
  - **Page size:** optional `size`, default and maximum 10,000 (today's value). The dev-only
    `VITE_KEYWORD_SEEK_BUCKET_SIZE` above 10,000 is refused in API mode.
  - **Covered count:** opt-in `includeCoveredCount: true` (the distribution's first page only), so
    the seek walk does not pay for it.
  - **Field admission:** `field` must be the primary sort field; nested and `mode: max` clauses are
    refused (422), since composite counts would be per value, not per image. All eight Kupua
    keyword/numeric sorts are single-valued and not nested. **Review fix (operator, option B):** the
    reviewer found that clause flags cannot prove a field is single-valued or flat (omitting
    `mode`/`nested` on `metadata.keywords` or `usages.platform` passed). A server list of the
    fields one consumer walks was tried and rejected as consumer coupling. Instead: a field inside
    a nested path of Grid's own mapping (`Mappings.imageMapping`) is refused, and counts are
    defined as images per value, so an image holding several values counts once per value.
    Counts equal positions only for single-valued fields, which the caller chooses. This matches
    D3/window/rank, which also trust clause flags (readiness finding N1).
- **U3b as built:** `operation: "keyword-page"` on the same `POST /images/sort-profile` (no new route).
  - **Body:** `field` (the primary sort field), optional `after` (string or number), `size`
    (integer, default 10,000) and `includeCoveredCount` (boolean, default false).
  - **Execution:** one size-0 `_search`, `track_total_hits: false`, a composite aggregation with one
    `terms` source on `field`, ordered by the clause's direction, `after` when given; no
    `missing_bucket`, so images without the value are skipped exactly as today. With
    `includeCoveredCount`, an `exists` filter aggregation on the field. Optional `pitId` as U3a.
  - **Response:** `{buckets: [{key, count}], after, coveredCount?, pitId?}`. A count is the number
    of admitted images holding that value (an image with several values counts in each). Keys and
    `after` are JSON
    scalars as stored (strings for keyword fields, numbers for width/height); `after` is
    Elasticsearch's `after_key` value, `null` when it reports none. No `startPosition`: Kupua
    accumulates it. Kupua's walk conditions (empty page, no `after`, short page) are unchanged.
  - **Refusals:** 400 for a non-scalar `after`, a non-integer `size` and a non-boolean
    `includeCoveredCount`; 422 for `size` outside 1-10,000, a field other than the primary, a
    field inside a nested path of Grid's mapping, and a nested or `mode: max` clause; 503 on
    timeout or failed shard.
  - **Cross-check:** walking pages of size 2 reproduces the runs of primary values in the order the
    window returns them (credit and width, both directions); tier and deleted scope match D3.

**U4: keys.**
- **Response:** ordered `{id, sortValues}` pages without `_source`, for both the valued and
  null-zone phases, plus a continuation.
- **Page size:** use the current map chunk size (10,000). Key pages have their own bounds; they
  do not inherit the 200-image cap.
- **Consumers:** the Kupua map and range collectors keep their loops.
- **Algorithm source:** `fetchPositionIndex` and `getIdRange` (es-adapter.ts:1986, :2258).
- **Decisions (operator, 25 September 2026):**
  - **Phase from the tuple (option A):** no `phase` field. As in D3, a tuple whose primary value
    is null continues in the null zone; a page that runs past the last valued image carries on
    into the null zone. The range walk keeps its loop; the map's two passes become one walk
    returning the same ids and tuples.
  - **Shared null-zone code:** D3's null-zone cursor handling moves into one shared helper used
    by D3 and keys, in its own behavior-preservation commit.
  - **Incomplete execution:** timeout or any failed shard → 503, as for rank and profiles. The
    map already treats it as failure; the range walk shows its error state instead of a short
    selection.
  - **Contract (agreed at intake):** body = D3 fields + `sort` + optional `sortValues` (exclusive
    start) + `size` (1-10,000, default 10,000) + optional `pitId`; response
    `{keys: [{id, sortValues}], after, pitId?}`, `id` the document `_id`, `after` the tuple to
    continue from or `null` once a page is shorter than `size`. Refused: `reverse`/`seekToEnd`
    true and a non-integer `size` (400); `size` out of range, non-zero `offset`, tuple length or
    non-primary null, and rank's nulls-last sort admission (422). No total is counted.
  - **Inherited limit:** a tuple with a null outside the primary slot (a configured alias
    expanding to several clauses) cannot be continued from, exactly as in D3.
  - **Shared sort admission (operator, 25 September, after review):** the review's sort gaps are
    branch-only code, not existing Grid behavior, so they are fixed once in the shared admission
    for every ordered read (D3, window, rank, profiles, keys), in their own commit: the sort must
    end with `id`; each clause's `nested` path must match Grid's mapping; `usages.dateAdded` and
    `collections.actionData.date` need `mode: max` (rank's predicates assume it; U3a parked item).
- **U4 as built:** `POST /images/keys` in `ImageQueryController`, through `admitSearchParams` and
  `admittedSearch`; one `_search` with `_source: false`, `track_total_hits: false`, `size` from the
  body, `search_after` from the start tuple; optional `pitId` (410 on expiry).
  - **Shared cursor rule:** D3's null-zone handling is now `cursorRead` (branch-only helper, D3
    behavior unchanged): a null-primary tuple reads without the primary clause, filtered to images
    lacking it (nested `exists` for nested clauses), and published tuples get the null re-inserted.
  - **Sort admission:** rank's nulls-last rule (`missing` only `_last`, `mode` only `max`, at most
    10 clauses) on top of the shared admission; the walk relies on nulls sorting last.
  - **Shared admission as built** (`admitSortClause`, every ordered read): non-empty, no duplicate,
    no unresolved alias, no `_shard_doc` (as before); then each clause's `nested` path must equal
    its field's innermost nested path in Grid's mapping (`Mappings.imageMapping`), or be absent for
    a flat field; `usages.dateAdded` and `collections.actionData.date` need `mode: max`; and the
    last clause must be `id`. Clause-shape errors from `jsonToSort` still come first. The
    profile-only special-date check and keyword-page mapping check became unreachable and were
    removed (their refusals now come from admission; one keyword-page test's expected message
    changed from "nested or max-mode" to "nested path none").
  - **Response:** `{keys: [{id, sortValues}], after, pitId?}`; `id` is `_id`; tuples truncated to
    the sort length (no `_shard_doc`); `after` is the last tuple of a full page, `null` otherwise.
  - **Refusals:** 400 `reverse`/`seekToEnd` true, non-integer `size`; 422 `size` outside 1-10,000,
    `offset` ≠ 0, tuple length mismatch or non-primary null, the sort admissions above; 503
    `keys-incomplete` on timeout or failed shard. `length` passes the shared validation (≤ 200) but
    does not size key pages; `countAll` is ignored.
  - **Cross-check:** for 16 supported sorts (all but the multi-clause expansion), walks of page size
    2, 9 and 100 equal the window's ids and tuples, and a page started from the tuple at every
    position k returns positions k+1 onward (null-zone starts and crossings included); under a PIT
    too. Tier and deleted scope match D3. Omitting `missing` or `mode` keeps walks equal to the
    window (null tails included); omitting or misstating `nested` is refused with 422, on a first
    page and on a null-zone start.

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

**Pre-U5 review recommendations (25 September): these must be critically assessed, not taken as gospel.**
They are hypotheses and preferred approaches, not approved implementation requirements or new
gates. Check current source, consumers and discriminating tests; reject or revise a recommendation
if its premise or trade-off does not hold. Seek operator approval before changing endpoint outcomes,
DAL contracts or accepted fallback behaviour. Existing obligations above and section 5 remain in force.

1. **Incomplete image pages.** Rank, keys and profiles reject explicit ES timeouts/failed shards;
  D3 and window currently do not. Window exposes `rawHitCount` but drops undecodable hits, while
  keys/rank still include those documents ([existing regression](../../../../../media-api/test/lib/elasticsearch/ElasticSearchTest.scala#L1012)).
  Assess whether publishing the surviving images as consecutive positions would misstate
  coordinates or exhaustion. If confirmed, prefer explicit failure/no publication for incomplete
  or decode/tuple-mismatched image pages on these new-read paths, not empty success, placeholders
  or unbounded refill. This would change the current omission contract and needs an explicit
  decision; do not alter legacy GET or shared Grid execution behaviour.
2. **Degraded deep seek.** The required fallback decision above remains open. Prefer an explicitly
  degraded shallow landing, with its actual coordinates, when no usable deep estimate remains.
  Critically assess the reduced emergency reach compared with today's roughly 100k fallback and
  obtain operator acceptance. Any clamp must be reflected where the store assigns `actualOffset`;
  silently clamping inside `ApiDataSource` would label the returned images with the wrong position.
  Do not raise the server limit or add an expensive cursor walk to hide the failure.
3. **Composed client tests.** Exercise the actual mapper and `ApiDataSource` with the consuming
  store, using controlled transport responses alongside the existing Scala golden-body replay.
  Prioritize both page directions, null tails, map failure, restore, cancellation and refusal.
  Prove migrated methods never rescue themselves through ES; keep explicitly unmigrated methods
  on the tested development-fallback list. Distinguish authorization refusals and core-read
  failures from optional profile absence. This is not a request for a duplicate browser suite;
  section 5's existing API preflights remain, and the additional E2E run is parked in section 11.
4. **Truthful small contracts and counting intent.** Assess narrow DAL adjustments instead of a
  store rewrite. For example, [openPit's current contract](../../../../src/dal/types.ts#L314) promises
  `Promise<string>`, but API mode is intended to return `null`: prefer an explicitly nullable
  result over a cast, fake ID or deliberate exception, subject to approval of that exception to
  section 3's signature-preservation rule. Also assess the smaller performance opportunity in
  [the current API mapper](../../../../src/dal/grid-api-search-adapter.ts#L119):
  `countAll: !searchAfterValues` requests exact totals for cursor-less non-startup reads too,
  including End. Prefer explicit counting intent in the new adapter after checking which callers
  consume totals. Preserve the required exact initial total and existing total ownership; do not
  assume every other count is redundant or promise an unmeasured saving.

**U5 decisions (operator, 25 September 2026):**
- **openPit:** the DAL contract becomes `Promise<string | null>`; API mode resolves `null` (no fake
  ID, no rejection, no warning). Approved exception to section 3's signature rule.
- **Counting intent:** API-mode reads send `countAll` explicitly, true only when the caller sets
  `trackTotalHits` (as direct ES counts). The hybrid mapper is unchanged.
- **Incomplete pages (review item 1):** not in U5. Timeouts/failed shards on D3/window are parked
  (section 11) for a decision after M1; undecodable images are not turned into failures.
- **Tests:** `ApiDataSource` contract tests with controlled responses; a composed store suite
  (real `ApiDataSource` and mapper over a fetch stand-in answering from `MockDataSource`) for
  both directions, End/null tail, deep seek, sort-around-focus, restore, map build/failure,
  range walks, cancellation and refusal versus absent profiles; golden bodies as media-api test
  fixtures replayed in Scala. Not a rerun of the whole store suite through the stand-in. The
  existing unit, build and direct-ES E2E gates still run unchanged.
- **Write guard:** the local Vite Grid API guard admits POST `/images/window`, `/rank`,
  `/sort-profile` and `/keys` as read-only, alongside `/search-after`.
- **Degraded deep seek (review item 2):** when no deep estimate exists, land at the data source's
  declared shallow limit minus one page (API mode: 10,000 - 200 = 9,800), and the store records that
  actual position. Direct ES keeps its `MAX_RESULT_WINDOW` reach. The 10,000 server limit is one
  branch-only constant (U1) and can be raised later up to the cluster's `max_result_window`.
- **Mode flag:** no new switch. `--use-media-api` (`VITE_USE_MEDIA_API=true`) stays the hybrid
  mode and now routes every ordered read through media-api via `ApiDataSource`, with the tested
  development fallback for unmigrated reads; the one-route `StranglerAdapter` path is replaced.
  Migrated reads no longer fall back to ES when media-api is unreachable. `--use-TEST` and local
  mode are unchanged. The perf runner's existing `--use-media-api` check needs no new mode; runs
  are told apart by label and git revision. A future switch for TEST-deployed media-api is U8.

**U5 as built:** `kupua/src/dal/api-data-source.ts` (`ApiDataSource`), built by `createDataSource()`
when `VITE_USE_MEDIA_API=true` over a development-fallback `ElasticsearchDataSource`; the one-route
`StranglerAdapter` and its tests are deleted.
- **Routing:** cursor-less, forward, non-End reads with `offset > 0` → `POST /images/window`
  (`offset`, `length`); every other page → `POST /images/search-after` without `offset`;
  `countBefore` → `/rank`; `estimateSortValue` → `sort-profile` `scalar-anchor`;
  `findKeywordSortValue`/`getKeywordDistribution` → `keyword-page` pages (the direct-ES walk loops,
  caps and completion rules unchanged; coverage only on the first distribution page);
  `getDateDistribution` → `date-stats` then `date-buckets` with the client-chosen interval (shared
  `chooseDateHistogramInterval`); `fetchPositionIndex` → one `/keys` walk (size
  `min(10,000, MAX_RESULT_WINDOW)`) following `after`; `getIdRange` → `/keys` pages of 1,000 from
  the start tuple, stopping at the first key strictly after the end tuple (shared
  `sortValuesStrictlyAfter`), cap 5,000 with one lookahead.
- **Bodies:** `buildReadBody` (the former D3 mapper's query/filter fields plus `sort`) is shared by
  every read; only page reads send `length`; `countAll` is `trackTotalHits === true`, also for the
  hybrid D3 path it replaced.
- **Failures:** pages, rank and range walks throw (refusals, 503 incomplete, unreachable), so the
  store's existing error/degradation paths run; profiles and maps return `null`, as direct ES does,
  without a console warning for media-api refusals, incomplete reads or unreachability (quiet
  absence; unexpected errors still warn). No migrated read calls the fallback. A 410 PIT expiry is
  retried once without the PIT on search-after and window reads (unreachable in practice:
  `openPit` returns `null`); a supplied PIT is forwarded with the window's offset.
- **DAL:** `openPit(): Promise<string | null>`; optional `offsetReadLimit` (API mode 10,000). The
  store's two no-estimate deep-seek fallbacks land at `min(fetchStart, limit - 200)`.
- **Fallback list** (tested exactly): `count`, `countWithTickers`, `getById`, `getByIds`,
  `getAggregation`, `getAggregations`, `searchByAi`. Selection and collections still construct
  their own ES data sources (U6d). The Vite Grid API guard admits the four new POST read paths.
- **Tests:** contract tests (`api-data-source.test.ts`); a composed store suite
  (`search-store-api-mode.test.ts`) through a fetch stand-in answering from `MockDataSource`, with a
  fallback that fails if a migrated read reaches it; 15 golden body files in
  `media-api/test/resources/ordered-read-bodies/`, written/compared by `ordered-read-bodies.test.ts`
  and replayed through `ImageQueryController` on the Elasticsearch fixture by `ElasticSearchTest`:
  every recording answers 200, and each must agree with a search-after walk of its own recorded
  scope (pages, window positions, ranks, keys, keyword and date profiles), substituting only
  tuples, ids or scope values the recording cannot know (review fix).
- **Not built:** API-mode E2E (parked, operator-deferred); keyword walk for alias sorts (parked).

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
- **Measured 25 September:** four-run API and direct-ES baselines used the same HTTPS origin,
  browser/viewport/DPR and corpus pin. Resident P14 traversal remained client-owned, issued zero
  hydration reads and was broadly equivalent at normal/fast cadence. API-backed perceived actions
  were consistently about 0.2-0.6 seconds slower locally (seek, sort-around-focus, search and
  restore), while client-only actions remained close; this is material but still includes the
  local JVM and SSH-tunnel topology, so it is not production/deployed-TEST capacity evidence.
  No visible PIT-less drift appeared in the pinned core; default seek totals differed by only a
  handful of live documents. Bare `sport` membership differed persistently (API 292,034 versus
  direct 285,238), confirming P23/P28's known Grid/Kupua free-text-policy difference and making
  PP8 a policy-plus-performance comparison rather than equal workload. P13c still used the direct
  ES singleton fallback in both modes, as expected before U6a. Carry the local latency delta and
  query-policy context explicitly to M2a; no endpoint redesign is selected by M1 alone.
- **Operator acceptance confirmed 26 September:** M1 was satisfactory and is complete. The
  operator has also run and committed newer baselines in both modes; use the current
  [jank history](../../../../e2e-perf/results/audit-log.md) and
  [perceived history](../../../../e2e-perf/results/perceived-log.md), with their revisions and
  topology qualifications, rather than treating the 25 September summary as the latest evidence.
  No repeat baseline is required to reopen this accepted gate. This does not claim query-policy
  equivalence or deployed-TEST measurement; M2a remains separate.

**U6a-U6d.**
- Detail reuses `GET /images/:id` through the S1 normalizer, bound to the requested ID
  (KUP-004 contract).
- **U6a recommendation to assess, not a new gate:** aim to preserve zero singleton
  requests during resident detail/fullscreen traversal, using buffered images and existing
  page extension. Prefer normalizing each singleton response once through S1 and publishing
  its image/enrichment only while the originating requested ID and request lifetime remain
  current. Consider a focused request-count regression alongside the existing identity tests.
  Check the actual consumers and revise the approach if needed; this does not prohibit U7's
  separate bounded expired-media renewal or weaken the existing KUP-004 contract.
- **U6a decisions (operator, 25 September 2026):**
  - **Overlay ownership (option A):** the singleton's server enrichment (cost, validity,
    persisted, actions, rights, syndication, usages) stays with ImageDetail's requested-ID-bound
    standalone state and is passed to the metadata panel; it is not written to the shared
    enrichment store, whose fresh-search `setEnrichment` would otherwise wipe it on pasted links.
  - **DAL change (approved exception to section 3's signature rule):** `getById(id, signal?)`
    resolves `{ image, enrichment? } | undefined`, mirroring `SearchAfterResult.enrichment`;
    direct ES and the mock return no enrichment. The signal cancels an obsolete request.
  - **No `include=fileMetadata`:** standalone images carry the same fields as page images.
- **U6a as built:** `ApiDataSource.getById` → `apiGetImage` (`grid-api-search-adapter.ts`):
  `GET /api/images/{encodeURIComponent(id)}`, sharing the ordered reads' fetch/failure/JSON
  helpers (extracted from `postImageRead`, behavior unchanged). The entity goes through the S1
  normalizer (`mapApiImageToImage`) and `extractEnrichment` (envelope `actions` included).
  - **Outcomes:** 404 (missing or hidden from the caller) and an entity whose `id` differs from
    the requested one → `undefined` ("Image not found", quiet); other non-2xx → `refused`,
    network failure → `unavailable` (both reject; ImageDetail shows "Image not found", no
    warning); an aborted signal rejects with `AbortError`. No ES fallback.
  - **ImageDetail:** the standalone state is `{imageId, image, enrichment, failed}`; each request
    has its own `AbortController`, aborted on identity change or when the image becomes resident.
    `ImageMetadata` receives `overlay` only while the standalone image is displayed;
    `useEnrichedImage(image, ownOverlay?)` prefers it to the shared store. Resident images and
    traversal are unchanged and issue no singleton request (new regression test).
  - **Fallback list:** `count`, `countWithTickers`, `getByIds`, `getAggregation`, `getAggregations`,
    `searchByAi`. The perf harness's P13c already switches to expecting media-api from this list.
  - **Review fix (P13c):** cancelling on identity change aborts the first read of a development
    Strict Mode replay, so the P13c probe now accepts exactly one aborted (`net::ERR_ABORTED`) first
    read of two, followed by a successful one; target, route and count checks are unchanged.
  - **Left for later:** `getByIds` still returns `Image[]` without enrichment; U6d chooses its
    shape (the `{image, enrichment?}` pattern here is precedent, not a decision). The overlay
    reaches only the detail metadata panel; any later detail consumer of server actions (for
    example editing) must take it from the same standalone state.
- Count keeps baseline-plus-latest polling (KUP-006).
- **U6b decisions (operator, 25 September 2026):**
  - **Tickers are Grid's:** the count endpoint returns the tickers Grid's configuration defines
    (the same ones `GET /images` reports), not client-supplied ticker queries. API-mode badges are
    therefore whatever Grid enables, as in Kahuna. Accepted difference: Grid's ticker clauses carry
    the default hidden-image conditions, so tickers read 0 while browsing `is:deleted`.
  - **Incomplete execution:** timeout or any failed shard → 503, as for rank, keys and profiles.
    Kupua then shows no tickers or keeps its previous new-images count, never a low number.
  - **Contract (agreed at intake):** body = the shared query fields (no `sort` sent) + optional
    `pitId`; response `{total, tickerCounts, pitId?}`, each ticker `{value, searchClause,
    backgroundColour, subCounts?}` as Grid's existing ticker writer produces. Refused:
    `sortValues`, `reverse: true`, `seekToEnd: true` (400); shared validation (422); PIT expiry
    (410). `sort`, `offset`, `length`, `countAll` do not affect the count.
- **U6b as built:** `POST /images/count` in `ImageQueryController`, through `admitSearchParams` and
  `admittedSearch`; one size-0 `_search`, `track_total_hits: true`, with Grid's existing ticker
  aggregations (`extraCountAggregations`, read with `extraCountsFrom`, both unchanged); optional
  `pitId` (410 on expiry).
  - **Response:** `{total, tickerCounts, pitId?}`; `tickerCounts` is `{}` when Grid configures no
    tickers; a ticker with no matching images reports `value: 0` without `subCounts`; sub-counts
    include `other` (possibly 0), as on `GET /images`.
  - **Refusals:** 400 `sortValues`, `reverse: true`, `seekToEnd: true`; 422 shared validation;
    503 `count-incomplete` on timeout or failed shard.
  - **Cross-checks:** total equals D3's total for the same body (also for a `since` interval, which
    excludes an image uploaded exactly then); each ticker equals D3's total with the ticker's clause
    as the query; total and tickers equal `GET /images` for the same scope; tier and deleted scope
    match D3; identical under a PIT.
  - **Kupua:** `ApiDataSource.countWithTickers` posts `buildReadBody` without `sort` and keeps each
    ticker's `value`/`subCounts`; `count` returns its total. Failures reject (callers already treat
    them as no tickers/no update). The Vite guard admits the path. **Review fix:** the guard's
    read-via-POST allowlist (now `src/dal/grid-api/read-via-post.ts`) matched by prefix, so every
    listed path also admitted write routes whose image ID equalled it (for example
    `/images/count/partner/true/syndicateImage`); it now matches exact paths, query string allowed,
    with a unit test. Fallback list: `getByIds`,
    `getAggregation`, `getAggregations`, `searchByAi`. Recorded bodies `count-tickers` and
    `count-poll-since` are replayed in Scala against a walk of the same scope.
- **U6c decisions (operator, 26 September 2026):**
  - **Performance risk noted:** the facet panel stops auto-refreshing once one aggregation fetch takes
    longer than `AGG_CIRCUIT_BREAKER_MS` (2,000 ms); media-api's extra hop (M1: +0.2-0.6 s locally)
    makes that likelier on large scopes. The limit may need raising after M2a; not changed in U6c.
  - **Usage counts from Grid's rollups (Q1):** no server nested/`reverse_nested` support. Kupua's
    platform/status counts request plain terms on the root copies `usagesPlatform`/`usagesStatus`
    (copy_to from the nested usages, already used by Grid's filters), which count each image once
    per value, as direct ES's nested+`reverse_nested` does.
  - **Unknown `is:` names count 0 (Q2),** compiled with Grid's own `is:` rules (as a query would match nothing).
  - **Uncountable fields refused (Q3):** 422 for a field inside a nested path of Grid's mapping (a
    root terms aggregation would silently count nothing) and for a field Elasticsearch cannot
    aggregate (for example a text field). Kupua already treats both as absent suggestions/facets.
  - **Incomplete execution (Q4):** timeout or any failed shard → 503, as for rank, keys, profiles, count.
  - **`getAggregation` removed (Q5):** dead in both modes (only reachable when typeahead has no
    search params, which no construction does). Removed from the DAL, adapters, mock and typeahead.
  - **Collections (Q6):** the collection store takes the app's data source, so API mode counts via
    media-api; scope unchanged (default free filter, deleted/replaced hidden: accepted compromise).
  - **No `total` or `took` (Q7):** `AggregationResult.total` becomes optional (direct ES still sets
    it); API mode shows no aggregation ES time in the dev search-bar readout.
  - **Limits (Q8):** at most 50 fields, `size` 1-10,000 (default 10), at most 20 `is:` names, no
    duplicates. Kupua's largest request is collections (6,000 buckets); the facet batch is ~17 fields.
- **U6c as built:** `POST /images/aggregations` in `ImageQueryController`, through `admitSearchParams`
  and `admittedSearch`; one size-0 `_search`, `track_total_hits: false`, one `terms` aggregation per
  field (verbatim path, the field's `size`) and one `filter` aggregation per `is:` name, compiled by
  Grid's own `is:` rules (`queryBuilder.makeQuery` of a single `is:` condition); positional
  aggregation names; optional `pitId` (410 on expiry).
  - **Body:** the shared query fields (no `sort` sent; one is ignored) + optional
    `fields: [{field, size?}]` + optional `isFilters: [string]` + optional `pitId`.
  - **Response:** `{fields: {<field>: {buckets: [{key, count}]}}, isFilterCounts: {<name>: count}, pitId?}`,
    fields in request order, keys as strings (Grid's existing `BucketResult`), counts the admitted
    images holding each value; names keyed exactly as sent.
  - **Refusals:** 400 `sortValues`/`reverse: true`/`seekToEnd: true`, `fields` not an array of
    `{field: string, size?: integer}`, `isFilters` not an array of strings; 422 shared validation,
    more than 50 fields or 20 names, `size` outside 1-10,000, an empty or duplicate field, a
    duplicate name, a field inside a nested path of Grid's mapping, and a field Elasticsearch cannot
    aggregate (its `illegal_argument_exception` root cause, for example a text field); 503
    `aggregations-incomplete` on timeout or failed shard.
  - **Found:** `ids: ""` makes Elasticsearch refuse every body read ("Ids can't be empty", 500), D3
    included: it fails closed, never widens. Kupua never sends it (known-empty AI membership sends no
    request). Parked.
  - **Cross-checks:** each value count equals D3's total with that value as a CQL clause; each
    `is:` count equals D3's total with the clause added; the usage rollups equal a nested
    `reverse_nested` parent count (and differ from usage-record counts); tier and deleted scope match
    D3; identical under a PIT; recorded bodies `aggregations-facets` and `aggregations-collections`
    replayed, the facets one against a walk of its own recorded scope.
  - **Kupua:** `ApiDataSource.getAggregations` posts `buildReadBody` without `sort`; `usageFilters`
    become `usagesPlatform`/`usagesStatus` terms (size 20, merged with any same field at the larger
    size) read back per value (absent value → 0); `is:` requests send each distinct `isFilter` once and
    map counts back to the caller's names; requested fields missing from the response are empty; no
    `took`/`total`. Failures reject (the store keeps its previous counts; typeahead and dynamic facets
    already isolate failures; collections show the tree without counts). `getAggregation` is removed
    from the DAL, the ES adapter, the mock, `ApiDataSource` and typeahead (which now always scopes to
    its params, `{}` if none). The collection store takes `loadCollections(dataSource)`, given the
    search store's data source by `main.tsx`, and no longer constructs `ElasticsearchDataSource`.
    The Vite guard admits the path. Fallback list: `getByIds`, `searchByAi`.
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
- **U6d decisions (operator, 26 September 2026):**
  - **Scope:** collections were already injected in U6c; U6d injects the app's data source into the
    selection store, which moves both detail hydration (`getByIds`) and shift-click range walks
    (`getIdRange`) onto media-api in API mode.
  - **No server enrichment for selection (Q1):** `getByIds` keeps returning `Image[]`; selection's
    Cost Summary keeps deriving off-screen images as in direct mode (KUP-029/030 stay deferred).
  - **Unreadable image = not found (Q2),** as Grid's `GET /images/:id` does; the server logs it. A
    restored selection then drops it with the existing "no longer available" toast.
  - **Visibility (Q3):** the singleton rule (`isVisibleToAccessor`, as `GET /images/:id` and U6a
    detail), not the search tier filter; hidden and missing IDs indistinguishable.
  - **Batching (Q4):** 200 IDs per request, two in flight, as tunable constants; measure 1,000 and
    5,000 selections in API mode in the browser before deciding any change.
  - **Contract (agreed at intake):** body `{ids: [string]}`, 1-200 IDs (422 outside, 400 malformed);
    duplicates allowed, each image once, request order; ID-only (no query scope, no `pitId`); one
    `_search` through the shared target choice with the lean projection; 503 on timeout or failed
    shard, never a partial list. Any failed chunk fails the whole `getByIds`; abort rejects.
- **U6d as built:** `POST /images/mget` in `ImageQueryController` (no `admitSearchParams`: ID-only).
  One `_search` of `ids` through `readTarget` (the helper's target choice, extracted from
  `admittedSearch` in its own behaviour-preserving commit: live migration-aware `prepareSearch` with
  the query timeout), `size` = distinct ID count, `track_total_hits: false`, lean projection and
  `resolveLeanHit`.
  - **Body/response:** `{ids: [string]}` → `{data: [entity]}`, each entity built by the controller's
    `hitToImageEntity`, in request order, each found image once; `?include=` honoured as elsewhere.
  - **Visibility:** applied in the ES layer from `ImageMgetParams.tier` with `MediaApi.isVisibleToAccessor`'s
    rule. Note: `ApiAccessor.hasAccess` already refuses every POST from syndication and read-only
    machine keys (403), so for mget, as for every other POST route, only internal callers arrive;
    the rule is defence in depth, tested at the ES layer.
  - **Refusals:** 400 `ids` absent or not an array of strings; 422 no IDs or more than 200 distinct
    IDs; 503 `mget-incomplete` on timeout or failed shard. Search fields in the body are ignored.
  - **Tests:** found images once in request order with missing omitted; membership equals
    `GET /images/:id`'s for every requested ID, including deleted and replaced images a default search
    hides (D3 control); syndication tier sees exactly the images available for syndication; alias
    leaves survive the projection; every usage and collection date survives; request shape; refusals;
    completeness; recorded body `mget-selection` replayed, and relationally (request order, no scope).
  - **Kupua:** `ApiDataSource.getByIds` → `apiGetByIds` (`grid-api-search-adapter.ts`): chunks of
    `MGET_CHUNK_SIZE` (200), at most `MGET_CONCURRENCY` (4, raised from 2 after the browser check) in flight, images normalized through S1,
    no enrichment; any failed chunk aborts the rest and rejects; an aborted call rejects. The selection
    store's default `dataSource` is the search store's, so hydration, `ensureMetadata` and range walks
    use the app's data source (media-api in API mode) and it constructs no ES data source. The Vite
    guard admits the path. Fallback list: `searchByAi`. Composed tests: hydration through the real
    `ApiDataSource` drops only IDs a complete lookup omitted and keeps membership on 503.
  - **Alias cursors (cold review S1, fixed):** media-api images carry configured fileMetadata values
    only under `aliases`, so an mget-hydrated anchor with no retained tuple extracted a null primary
    under an alias sort (such as Edit Status), and a range walk from it would have selected the wrong
    images. `extractSortValues` now falls back to the configured alias value when the raw path is
    absent (string or number only, as for raw paths). Tests: API hydration, then an off-buffer walk
    with a populated alias and a genuinely missing one; alias fallback and tuple-preference unit
    cases.
  - **Perf harness:** P18's route attribution now also owns `/api/images/mget`, and its route
    expectation follows the app mode. Before, it was hard-coded to `direct-es`, so it would have
    failed in API mode. New P19 is a 1,000-item out-of-buffer range with Details open, which covers
    the range walk and chunked hydration.
  - **Browser check (TEST via local media-api, 26 September 2026, dev build, warm tab):** reload
    hydration, range walks and the removal toast use only `/api/images/mget` and `/api/images/keys`,
    with no ES `_mget`. A planted non-existent ID gives exactly one "1 item … no longer available"
    message. Fetches happen whether or not Details is open, as before U6d. Dev StrictMode runs the
    mount hydration twice, which does not happen in production. Timings for one `hydrate()` call:
    1,003 IDs about 2.0 s; 4,953 IDs about 7.7-8.1 s (25 chunks, median about 560 ms per chunk);
    direct-ES `getByIds` of the same 4,953 about 2.5 s. For 4,953 IDs at 200 per chunk, two in flight
    took 7.2 s, four took 3.8 s and six took 3.3 s. A 1,003-image shift-click range settled in about
    3.6 s (keys 1.2 s); a 4,953-image range settled in about 8.7 s (keys 1.7 s). Operator chose four
    in flight (26 September 2026).

**U6z: non-AI media-api coverage and recovery verification.**
- **Promise:** in media-api mode, every non-AI image-data operation uses media-api, including
  recovery after failure. Existing `searchByAi` is the sole deliberate direct-ES exception.
  Preserve its implementation, UI, availability checks, ranking/filter semantics and saved URLs.
  Keep direct/local modes working; do not require zero ES construction while AI depends on it.
- **Startup and ownership:** set API mode before importing/initializing the app in tests. Check
  the real factory, search store, default selection owner, collection loading and CQL's first
  registered resolver. Exercise cold suggestions (including aliases/dotted fields) and Home/Clear
  remounts. Injecting an adapter after store import is not sufficient proof; no runtime hot-swap
  framework is required. Resolve the API-initialization part of KUP-026 on that evidence.
- **Recovery:** use the real store, adapter and mapper over controlled transport responses;
  exercise ordinary search, seek, restore rank/target/neighbour failures and their follow-up reads.
  Assert zero non-AI ES calls on refusal, unavailability and incomplete-read failure, plus the
  resulting UI/store state. Test cancellation and stale completion where the touched paths need
  it. Legitimate recovery through another admitted API read stays allowed. Scope KUP-010 closure
  to this demonstrated boundary; do not claim absolute API-only completion or wider private triage.
- **Failure is not empty success:** preserve existing caller-specific outcomes. Failed core reads
  use their existing error/recovery path; failed hydration retains selection membership; failed
  ranges publish no partial selection; maps/profiles may be absent; polling keeps previous values;
  a collection tree may remain without counts. Preserve quiet optional satellite absence, not a
  new global error policy. Keep successful empty results distinct from request failure.
- **AI exception:** the fallback list remains exactly `searchByAi`. Test that existing AI still
  dispatches there and that switching between AI and ordinary searches does not leak ES into
  non-AI operations. Counts, facets, detail and selection still use their migrated methods even
  when their scope originates in an AI result set. No AI migration or capability redesign here.
- **Enrichment:** reassess KUP-030's original stale same-ID fallback trigger and relevant
  AI/ordinary transitions, then offer only evidence-supported closure. U5 removed ordinary page
  fallback, but retained AI still returns baseline images. U6d deliberately keeps `getByIds`
  without enrichment: do not require every image read to carry an overlay, add selection
  enrichment, or silently clear selected overlays. KUP-029 remains deferred; any newly confirmed
  display repair needs a separate operator decision, not an automatic U6z blocker.
- **Verification:** extend existing test homes; retain section 5's unit/build/direct-ES E2E gates
  and operator API preflights. Include startup-to-completion request attribution for the selected
  non-AI browser workflows; the perf report's scenario-scoped ES counters alone are not proof.
  Preserve P13/P14 singleton/traversal and P19 selection coverage. A new general API-mode E2E
  configuration remains separately deferred, not a gate added by this amendment.
- **Separate fixes before final verification:** KUP-033, confirmed KUP-034 and KUP-036 follow
  the pitstop order above. KUP-036 targets 503 on explicit timeout/failed shards only, not
  rejection of individual undecodable images. No changes to AI, U7, PIT policy, accepted
  approximations, useful limits or unrelated section-11 observations follow from U6z.

**U8.** Deploy the branch's media-api to TEST (operator). Add a `start.sh` switch pointing the
`/api` proxy at TEST media-api, with cookie handling following the e2e-perf authentication
approach. Keep the existing local `/s3` and `/imgproxy` image delivery for M2a; U7 is not a
deployment prerequisite. Never write cookies or credentials into the repository.

**M2a: TEST API measurement before U7.** Use the existing perceived and jank suites with Kupua
on the laptop calling the modified media-api deployed to TEST, while image files still use the
existing local proxies. Assess API-backed search, seek, focus, restore and traversal in this
topology. Record client/server revisions, origin, corpus pin and cache conditions; differences
from M1 are not attributable solely to deployment if U6 also changed the client/server path.
Label runs `TEST-media-api api-mode local-media-delivery`. These measurements include server
response construction/signing, but do not establish correct use or renewal of canonical media URLs.

**U7.** After M2a, thumbnails and full images come from entity links (signed URLs, imgops),
replacing `/s3` and `/imgproxy` in API mode. Check the details that local imgproxy handles today:
rotation, format, DPR, transparency. Renew by re-fetching the singleton when a signed URL has expired.

**M2b: canonical media delivery checks.** After U7, the operator verifies returned URLs, bounded
expiry renewal, visual/transform correctness and affected image-loading/traversal performance
against the TEST deployment. Use the existing harness for the journeys U7 changes and label runs
`TEST-media-api api-mode canonical-media-delivery`. This is not automatically another complete
baseline campaign; broader measurement needs a specific unanswered question. Hosting Kupua for
other users remains separate work.

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
  coverage when a unit touches browsing. These use TEST data and the operator's cookies through
  the modified media-api on the laptop, or its TEST deployment after U8; identify the topology
  in the run label. Agents suggest them; the operator runs them. Together with the golden-body
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
uncontrolled cache. Do not rerun general baselines without a question M1/M2a/M2b names. Do not
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
table whenever a unit touches an existing file. State after U6d (26 September 2026):

| Existing file | Change | Effect on existing callers | Needed by | PR |
|---|---|---|---|---|
| `MediaApiComponents.scala` | Constructs `ImageQueryController` and adds it to the router list. | None: a new controller only. | Every Kupua endpoint | 1 |
| `conf/routes` | `POST /images/search-after`, `/window`, `/rank`, `/sort-profile`, `/keys`, `/count`, `/aggregations`, `/mget`, placed before `GET /images/:id`. | New paths only; the existing `POST /images/:id/...` route has more segments, so nothing is shadowed. | D3, window, rank, profiles, keys, count, aggregations, mget | 1, 2, 3, 4, 5, 6, 7, 8 |
| `ElasticSearchModel.scala`: new types | Params, results, body parsers and errors for D3, window, rank, sort profiles (`SortProfile*`, `DateStats`/`DateBuckets`/`ScalarAnchor`/`KeywordPage` and their results), keys (`ImageKeys*`, `ImageKey`), count (`ImageCount*`, importing common-lib's `ExtraCount`), aggregations (`FieldAggregation`, `ImageAggregations*`, reusing the existing `BucketResult` unchanged) and mget (`ImageMget*`). | None: new types only. | Their endpoint | 1-8 |
| `ElasticSearchModel.scala`: `SearchParams` | New field `hasRightsAcquired: Option[Boolean] = None`. `SearchParams.apply(request)` passes `None`, so `GET /images` never sets it. | None at runtime. Code that constructs `SearchParams` positionally must add the argument (compile-time only). | Kupua's rights filter, read from request bodies | 1 |
| `QueryBuilder.buildFilterOpt` | Adds a `syndicationRights.rights.acquired` filter when `hasRightsAcquired` is set. | None for `GET /images` (the field is always `None` there). Applies to any caller that sets it; today only Kupua's reads. Kahuna's own ignored parameter is [GRID-014](../../bug-backlog.md#grid-014), deliberately not fixed here. | Kupua | 1 |
| `sorts.scala` | Adds `jsonToSort` (client sort clause to elastic4s, refusing malformed shapes with 422) and `reverseSorts`. `createSort` and the collection-sort definitions are unchanged. | None. | D3, window, rank, profiles and keys sort admission | 1 |
| `ElasticSearch.scala` | Import changes (`duration._` replaces `FiniteDuration`; aggregation imports, including composite aggregation for U3b, and U3b's read-only use of common-lib `Mappings.imageMapping` to find nested paths); new private methods appended after the existing ones. Existing methods are unchanged; the new code calls `prepareSearch`, `withSearchQueryTimeout`, `executeAndLog` and `queryBuilder` as they are. U3a generalized branch-only rank helpers (`admitNullsLastSortClause`, `requireCompleteExecution`) with identical rank messages. U4 moved D3's branch-only null-zone cursor handling into `cursorRead`, shared by D3 and keys, with D3's behavior and tests unchanged, and tightened the branch-only shared sort admission (`id` suffix, mapped nested path, special-date `mode: max`) for every ordered read. U6b's count calls the existing private ticker helpers `extraCountAggregations`/`extraCountsFrom` without changing them. U6c's aggregations import common-lib's `ElasticSearchError` (to classify an unaggregatable field) and `IsField`/`IsValue`, and call the existing `queryBuilder.makeQuery` with one `is:` condition. U6d extracted the branch-only target choice of `admittedSearch` into `readTarget` (behaviour unchanged) and adds mget, importing common-lib's `Syndication`/`Tier` for its visibility rule (a copy of `MediaApi`'s private `isVisibleToAccessor`, which is unchanged). | None. | Every Kupua endpoint | 1 onward |
| Test support: `MediaApiTest.scala`, `SortsTest.scala`, `ElasticSearchTest.scala`, `ImageQueryControllerTest.scala` | Controller test helpers and new tests only. U5 adds a replay of recorded client request bodies (new `test/resources/ordered-read-bodies/`) through `ImageQueryController` against the Elasticsearch fixture; U6b adds the count recordings and a ticker-enabled test configuration; U6c adds the aggregation recordings; U6d adds the mget tests and recording. `ElasticSearchTestBase.scala` and all existing assertions are identical to `main`. | None. | Their endpoint's PR (the recorded bodies split by endpoint) | per PR |

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
| [Perf handbook](../../../../e2e-perf/README.md), [D3 performance](../media-api-work/d3-search-after-04-performance.md) | M1, M2a, M2b |
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
| Section 4 "do not expose a partially implemented API-only mode" | U6z proves non-AI API coverage with the tested `searchByAi` exception retained. Do not call this absolute API-only completion; zero ES construction/traffic waits for the separately agreed AI migration. |
| Sections 5/6 AI migration and S10 full cutover | Existing AI behavior stays unchanged through U6z and the non-AI deployment/measurement sequence. U9 needs team agreement; older AI workplan compromises are not implementation approval. |
| S10 bundles deployed delivery, bootstrap, hosting and API-only activation | U8/M2a deploy and measure the modified API on TEST with existing local image delivery; U7/M2b then integrate and check canonical media delivery. Hosting remains later. |
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
- 25 Sep 2026, U3b: `c513fcafc` (`keyword-page` on `POST /images/sort-profile`). No merge needed
  (main's new commits touch no media-api or Kupua files). First cold review: accept with fixes
  (flag-only field guard); its suggested field list was replaced by operator option B (Grid
  mapping nested check, per-value counts); fresh re-review: accept. Not yet called by Kupua (U5).
- 25 Sep 2026, U4: `eb32ec1ad` (shared null-zone cursor handling, behavior-preserving),
  `7065015bc` (shared sort admission: `id` suffix, mapped nested path, special-date `mode: max`
  for every ordered read), `dd5ab9a52` (`POST /images/keys`). No merge needed (main's new commits
  touch no media-api or Kupua files). Cold review: accept with fixes (nested path, `id` suffix,
  omission tests); operator chose the shared-admission fix. Split commits tested in a temporary
  worktree. Not yet called by Kupua (U5).
- 25 Sep 2026, U5: `a06f583fb` (recorded client request bodies replayed through media-api, test-only),
  `3fdfeece2` (`ApiDataSource`; `--use-media-api` reused, `StranglerAdapter` removed). No merge needed
  (main's new commits touch no media-api or Kupua files). Cold review: accept with fixes (relational
  replay, quiet optional absence, window keeps a supplied PIT; the reviewer's `!pitId` route was
  replaced by forwarding the PIT so the offset is kept). Operator dry-run preflights and a TEST
  browser drive passed. Deferred: API-mode E2E, D3/window incomplete pages (M1), alias-sort keyword
  walk; new backlog KUP-033/034 (both modes).
- 25 Sep 2026, U6a: `10e5231db` (standalone detail via `GET /images/:id`; `getById` returns
  `{image, enrichment?}` with a signal; overlay held with the standalone state). No merge needed
  (main's new commits touch no media-api or Kupua files). Cold review: accept with fixes (P13c probe
  now accepts one aborted Strict Mode replay); the stale metadata click-to-search decode test was
  repaired with operator approval. Operator API-mode dry-run preflights passed. Deferred: `getByIds`
  enrichment shape (U6d); unused `GridApiDataSource.getImageDetail` (parked).
- 25 Sep 2026, U6b: `0940dd9ab` (`POST /images/count`), `6b8fc9a1b` (`ApiDataSource` counts and
  tickers through it; Vite guard exact-path fix). No merge needed (main's new commits touch no
  media-api or Kupua files). Operator: Grid-owned tickers, 503 on incomplete. Cold review: accept
  with fixes (the guard's prefix match admitted `/images/<listed path>/...` write routes, for all
  six read paths; now exact). Deferred: operator API-mode preflights; two parked items (unused
  `count()`, unread exact total on ticker-only reads).
- 26 Sep 2026, U6c: `e52aee642` (`POST /images/aggregations`), `6a2b3edd8` (`ApiDataSource` aggregations,
  typeahead and collection counts through it; `getAggregation` removed; collection store takes the app's
  data source). No merge needed (main's new commits touch no media-api or Kupua files). Operator: all
  recommendations (usage rollups, unknown `is:` = 0, 422 for uncountable fields, 503, limits). Cold
  review: accept, no findings. Operator API-mode dry-run preflights passed; `is:` filters and collections
  checked in the app. Deferred: facet circuit-breaker latency risk (M2a); two parked items (`ids: ""`
  500, error log on 422).
- 26 Sep 2026, U6d: `7f5dc7862` (`readTarget` extracted from `admittedSearch`, behaviour-preserving;
  media-api suite green at that commit in a temporary worktree), `4e021c655` (`POST /images/mget`),
  `d7bfd5100` (`ApiDataSource.getByIds` via mget, 200 per request and four in flight; selection store
  takes the app's data source; alias sort-cursor fallback), `2c615881f` (P18 mode-aware, new P19). No
  merge needed (main's new commits touch no media-api or Kupua files). Operator: all recommendations
  (Q1-Q4), then concurrency 4 after the browser check. Cold review: reject (S1: alias cursor of an
  mget-hydrated anchor); fixed, and the re-review accepted. Operator dry-run preflights passed in both
  modes. Deferred: KUP-035 (full reconcile stall, both modes); parked perf network metric, boolean
  alias cursor, ES `getByIds` abort `[]`, stale controller comment.

## 11. Parked Observations

**Not work items. Executors append; they never act on entries here.** One line each: date, unit,
file:line, what was noticed, and whether it looks like a bug, a risk or a clean-up. Keep at most
20 lines. The operator periodically moves real bugs to the [backlog](../../bug-backlog.md), turns
others into plan changes, or deletes them. Anything that blocks the current unit goes to the
operator in chat instead, not here.

- 25 Sep, U3a, `search-store.ts:3328`: deep seek on a configured keyword-alias primary (e.g. editStatus) asks for a percentile on a keyword field; ES refuses, so `scalar-anchor` answers 500 (logged error) where direct ES gives null. Kupua still degrades. Risk/clean-up for U5: skip the call for non-numeric, non-date primaries.
- 25 Sep, U3a, sbt test harness: a test failing with a raw `ElasticSearchException` can crash the forked test JVM (non-serializable throwable), truncating the run. Clean-up; seen only under deliberate breaks.
- 25 Sep, U3a review, `ElasticSearch.scala` `admitNullsLastSortClause`: rank still admits a special-date clause without `mode: max` (ES then defaults to min for asc), so its max-mode predicates would not apply. Latent; Kupua always sends max. Profiles now refuse it. **Resolved in U4:** shared admission requires `mode: max` for every ordered read.
- 25 Sep, U3b, keyword-page: each page is bounded by media-api's 10 s query timeout (503 on timeout), where direct ES has no per-page limit, only Kupua's 8 s walk cap. Risk at PROD cardinality; measure in M1.
- 25 Sep, U4, `ElasticSearch.scala` `admitSortClause`: a nested field without `nested` passed D3/window/rank admission (500 on a first page; on a D3 null-zone cursor, valued images returned as null-zone hits), and a sort without a unique `id` suffix was accepted (ties skipped). **Resolved in U4:** shared admission refuses both for every ordered read.
- 25 Sep, pre-U5 review, [e2e/shared/helpers.ts:27](../../../../e2e/shared/helpers.ts#L27): habitual E2E blocks `/api/**`, leaving a coverage risk. Consider an **additional API-mode test run** reusing selected core browsing scenarios under a second backend configuration, not a duplicate full suite; exercise the modified media-api on the laptop or deployed to TEST and verify expected API calls/no forbidden ES fallback. A fully local media-api + local ES arrangement would need a separate setup assessment. **Operator-deferred:** revisit only when the operator chooses after seeing API mode work and comparing its speed with direct ES; not a new U5, U6 or measurement gate. Existing section 5 preflights remain unchanged in scope.
- 25 Sep, U5 intake, `ElasticSearch.scala` `searchAfterQuery`/`imageWindowQuery`: explicit timeout/failed-shard responses can be published as complete image pages. **Moved to [KUP-036](../../bug-backlog.md#kup-036), 26 September:** separate bounded repair before final U6z verification; target 503, preserve non-fatal undecodable-hit omission. Source-supported, not a reproduced live incident; M1 is accepted.
- 25 Sep, U5 intake, `search-store.ts:3312`: the 7 configured alias fields (e.g. Edit Status; sortable only by clicking their hidden-by-default table column header or via URL, not the sort dropdown) are not in `KEYWORD_SORT_ES_FIELDS`, so deep seek never uses the keyword walk and always takes the from/size fallback. The keyword-page endpoint could serve them. Clean-up/improvement for both modes.
- 25 Sep, U5 intake, `search-store.ts:1597`: the phantom neighbour batch sends `length = visibleNeighbours.length`; above 200 visible images D3 refuses (422) and the fallback clears focus. Existing hybrid limit, direct ES unaffected. Risk, likely rare.
- 25 Sep, U5 review, `ElasticSearch.scala` `cursorRead` and `es-adapter.ts` `_searchAfterImpl`: a reverse page from a null-primary tuple reads only the null tail, so a backward extend from the first null-tail image cannot cross back into the valued images before it (both modes; replay test asserts the confined contract). The live probe could not reach the boundary to confirm user impact (indexed tier likely covered by map seeks). Risk; needs a decision. **Moved to the backlog as [KUP-033](../../bug-backlog.md#kup-033).**
- 25 Sep, U5 review, `search-store.ts:1378` `_loadBufferAroundImage`: the backward page asks for 100 without capping at the target's offset; missing values sort last in reverse too, so a target among the first 100 of a null-tail sort would pull null-tail images into the buffer (both modes). Normally unreachable (such targets are in the first page). Latent. **Moved to the backlog as [KUP-034](../../bug-backlog.md#kup-034).**
- 25 Sep, U6a, [grid-api-adapter.ts:50](../../../../src/dal/grid-api/grid-api-adapter.ts#L50) `GridApiDataSource.getImageDetail`: still unused (only its tests call it); it drops the envelope's `actions` and mixes `null`/thrown outcomes. U6a's `apiGetImage` supersedes it for detail. Clean-up: delete or align when the satellite adapters are next touched.
- 25 Sep, U6a E2E, [browser-history.spec.ts:1163](../../../../e2e/local/browser-history.spec.ts#L1163): "metadata search pushes once; Back restores the exact rendered detail image" fails deterministically since `b1239d26d` made `waitForDecodedDetailImage` a real bounded loop (the old async `waitForFunction` passed vacuously). Local E2E has no media, so the detail shows "Image preview not available" and never decodes; identity and metadata were correct (resident image, not the U6a path). Test-harness bug; needs a decision (stub the media route as the KUP-021 tests do, or assert rendered identity only). Not weakened here. **Resolved in U6a (operator-authorized):** the test stubs `image-urls.ts` with an identity-tagged pixel, as the KUP-021 tests do; the decode check is unchanged.
- 25 Sep, U6b intake, [types.ts](../../../../src/dal/types.ts) `ImageDataSource.count`: no production caller (only tests); every mode must still implement it. Clean-up: drop it from the interface when the DAL is next trimmed.
- 25 Sep, U6b intake, [search-store.ts:2331](../../../../src/stores/search-store.ts#L2331): the ticker request fired with the first page computes an exact total nobody reads (the page supplies it), in both modes. Possible saving: an opt-out of the exact total for ticker-only reads. Unmeasured; filter aggregations already visit every match, so the gain may be small. Improvement.
- 26 Sep, U6c, `SearchParamsBody.fromJson` `ids`: a body with `ids: ""` becomes an empty ids query, which Elasticsearch refuses ("Ids can't be empty"), so every body read answers 500 (fails closed, never widens). Kupua never sends it. Clean-up: refuse with 422, or read it as an explicitly empty scope.
- 26 Sep, U6c, `executeAndLog`: an aggregation on an unaggregatable field (e.g. a `has:` facet on a text field) answers 422 but still logs an error-level Elasticsearch failure. Log noise, likely rare. Clean-up.
- 26 Sep, U6d, [es-adapter.ts](../../../../src/dal/es-adapter.ts) `getByIds`: an aborted call (or chunk) resolves to `[]`, which `hydrate` would read as "every selected image is gone". No caller passes a signal today, so latent. The media-api path rejects instead. Risk/clean-up.
- 26 Sep, U6d, `ImageQueryController.scala` header comment: "Every action admits its body through admitSearchParams" is no longer true (mget is ID-only). Left alone per the comment-pruning rule. Clean-up.
- 26 Sep, U6d P19 preflight, [selection-store.ts:199](../../../../src/stores/selection-store.ts#L199) `requestFullReconcile`: the full reconcile over 1,000 selected images runs as one idle task of about 318 ms, a 360 ms frame, in both modes. It is client work, not media-api. It was already noted in the archived 13 September consolidation audit and the interaction catalogue L08. **Moved to the backlog as [KUP-035](../../bug-backlog.md#kup-035).**
- 26 Sep, U6d, [image-offset-cache.ts](../../../../src/lib/image-offset-cache.ts) `readFieldPath`/`readAliasValue`: boolean alias values (e.g. `cutout`) give a `null` cursor in both modes, while ES sorts them as 1/0, so a range or restore from such an anchor under that sort starts in the wrong place. Latent. The media-api `false` for a missing `matchViaExistence` alias also reads as null, as [c2pa-matchViaExistence-support.md](../../c2pa-matchViaExistence-support.md) §3.4 requires. That workplan (not started) owns the rest; U6c's aggregation builder has no missing bucket yet (its C5).
- 26 Sep, U6d P19 preflight, [perf.spec.ts](../../../../e2e-perf/perf.spec.ts) `esRequests`/`esBytes` (the "Network (ES requests)" report and metric): these count only `/es/` traffic, so in `--use-media-api` runs they read 0. No verdict, chart or assertion uses them. Clean-up: add media-api counts alongside them, keeping the ES fields' meaning for history. This changes the probe shared by every scenario, so validate it with a full operator run.
