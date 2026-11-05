# API boundary P13: data producers, interfaces and assertions

## 1. Supported deciding answer

**Accept this bounded reading packet for coordinator integration, with the joins in section 5 still open.** P13 is a strong data-producer/interface/assertion review, not independent verification, an architecture approval or a product repair. All eleven assigned files were read completely: **7,009 lines; zero partial or unread assigned files**. Supplemental reads are separately bounded below. No tests were executed.

The migration must preserve the contracts that support smooth arbitrary-position browsing: parallel ordered hits and authoritative tuples; session-total-based coordinates; bidirectional cursor windows and null-tail ordering; rank and optional complete-map access; cancellable background work; useful range/AI limits; and distribution provenance that keeps exact coverage separate from approximate presentation. These are supporting mechanisms for browsing, position preservation and traversal/density continuity, not a reason to prioritize sorting over that core.

The decisive producer answer is that **an untracked direct-ES cursor page can return `total: 0` with nonempty hits**. This is not the session total or a count of remaining hits. The initial store search requests an exact total, but restore's neighbour pages do not add that hint. Restore tests its forward-page total for indexed-tier targeting while publishing the retained session total. The source therefore supplies the missing direct-ES premise of P09/E013's conditional mismatch. It does **not** establish an observed UI loop. The saved-rank/refreshed-tuple issue remains the existing source-only finding, not a new stronger snapshot requirement (C01 below).

The protected baseline remains the operator's working, measured core. This packet neither reinterprets unread canonical measurements nor requests a fresh baseline/performance campaign. Ordinary live-index drift, approximate deep landing/presentation, one semantic sort and existing useful caps remain accepted scope. No index-migration guarantee, durable session, global snapshot, Thrall interlock, automatic index change or D3 readiness restart follows.

## 2. Material sourced findings

### C01. A paging total is not necessarily a session total

Originals: [direct paging](../../../../src/dal/es-adapter.ts#L918), 918-1107; [initial caller](../../../../src/stores/search-store.ts#L2250), 2250-2325; [centred-window helper](../../../../src/stores/search-store.ts#L1327), 1327-1412; [restore](../../../../src/stores/search-store.ts#L3841), 3841-3978; [tier predicate](../../../../src/lib/two-tier.ts#L10); [view coordinates](../../../../src/hooks/useDataWindow.ts#L329), 329-346; [API mapper](../../../../src/dal/grid-api-search-adapter.ts#L93), 93-198.

| Call/path | Actual producer/request rule | Meaning of returned `total` |
| --- | --- | --- |
| Initial ordinary store search | `trackTotalHits: true`, null cursor, no PIT; PIT opening runs independently | Direct adapter returns `hits.total.value`, or zero if absent; caller retains this as session total. |
| Continuation, neighbour page, offset page, End, or query-scoped ID lookup | Direct adapter does not infer counting from cursor/offset/reverse/End/ID: only `trackTotalHits === true` enables it | With totals absent, zero even when hits exist. With the flag, the value is the effective query's count, not page length. A null-zone override narrows that query to missing-primary documents; an ID filter narrows it to those IDs. |
| Direct PIT-expiry retry | Reuses the request body without PIT, trimming an overlong cursor | Same total extraction/default, now a live-index response; explicit `pitId: null`. |
| Direct abort represented as `DOMException/AbortError` | Returns empty hits/tuples and zero | Cancellation-shaped result, not evidence that the query has no results. |
| `searchRange` | Delegates to `searchAfter(params, null, null, signal)` | No independent exact-total policy. |
| API mapper | Sends `countAll: !searchAfterValues`; does not serialize `trackTotalHits` | Passes through `json.total`. Cursorless initial/End/ID requests ask for counting; cursor continuations do not. Actual server counting and omitted-total behavior are **unread**, not inferred here. |
| `getById` / `getByIds` | Multi-get hydration, not a search result | No paging total at all; distinct from query-scoped `searchAfter` ID lookup. |

Restore counts the saved tuple concurrently with a fresh query-scoped target lookup, prefers the refreshed tuple for neighbours, receives `total: forwardResult.total`, computes `_seekTargetGlobalIndex` from `buf.total`, then publishes `total: get().total`. For a retained indexed-tier total and an untracked direct page whose total is absent, the former chooses `-1` while the view's session-total predicate remains indexed. No metadata change is needed for that **conditional source mismatch**; the separate saved-versus-refreshed tuple issue requires changed sort values to manifest. The generic non-abort catch still calls `seek(cachedOffset)`; hybrid refusal routing beyond that catch is not revalidated in P13.

**Consequence / smallest integration action:** qualify E013 with the direct producer and original caller lines; do not mark it runtime-verified. Preserve the distinction between session count, subset count and unavailable count in the boundary contract. The coordinator's core assertion owner must inspect ordinary restore assertions before any separately approved repair; API server totals remain D029/D018 work.

### C02. Shared query assembly is substantial, but not universal or server authority

Originals: [free/syndication/ticker builders](../../../../src/dal/es-adapter.ts#L128), 128-452; [inline query builder](../../../../src/dal/es-adapter.ts#L457), 457-593; [count and aggregations](../../../../src/dal/es-adapter.ts#L697), 697-883; positional methods at 948-1107, 1279-1477, 1480-1966 and 1986-2193 in the same file.

`buildQuery` combines imported `parseCql`'s `must`/`mustNot` with inline defaults and URL filters. It is reused by paging, rank, percentile/composite/histogram work, maps, batch aggregations, ticker counts and AI final prefilters. It consumes IDs, six date bounds, uploader, `nonFree`, crops, acquired rights and syndication status. Date-only bounds become UTC midnight; all six top-level bounds are exclusive (`gt`/`lt`). CQL date semantics are owned by the unread parser, not established by these top-level assertions.

Default deletion/replaced suppression uses raw string `includes` checks, not parsed-intent inspection. The code expressly has no per-user deleted-image authorization context. Free filtering is compiled once from vendored cost configuration; ticker definitions are also compiled once. Syndication review uses lease fields and configured categories/cutoff, without the server runtime-field logic mentioned in comments. These comments are provenance leads, not proof of current Grid parity or topology.

`payType`, `dateField`, `persisted`, pinboard parameters and `useAISearch` do not affect this inline builder; AI parameters are consumed separately, and offset/length/count hints belong to paging. An interface member's presence is not proof this producer implements its semantics. `getAggregation(field, query)` instead uses a catch-all `multi_match` or `match_all`, not `buildQuery`; multi-get is ID-only; the hybrid AI score probe is also not query-filter scoped. Do not flatten these into a claim that every method has identical query/auth scope.

**Consequence / smallest integration action:** D029 must disposition each parameter and default-hide rule with parser, mapper and server owners, while D018 owns authorization and D024/configuration owners own model/config equivalence. No CQL, actual local configuration, server or authorization implementation was read in this packet. Do not silently add previously ignored filters or copy a client approximation into an authoritative API without that decision.

### C03. One semantic sort still has a multi-value physical tuple

Originals: [sort construction](../../../../src/dal/adapters/elasticsearch/sort-builders.ts#L16), 16-252; [sentinels/comparison](../../../../src/dal/es-adapter.ts#L59), 59-126; [paging transformations](../../../../src/dal/es-adapter.ts#L918), 918-1107; [null helpers](../../../../src/dal/null-zone.ts#L43), 43-124.

Default order is upload time descending then unique ID ascending. Ordinary aliases resolve to fields, including configured alias expansion. The automatic upload-time suffix inherits a date primary's direction, otherwise descending; ID breaks ties. Special usage/collection date sorts select the maximum across all associated dates in **both** directions, with missing last; usages are nested, collections are not. There is no child filter in the special nested sort. Instant-based fallback extractors ignore invalid dates. Response tuples, rather than reconstructed display values, remain the authoritative paging values.

The builder itself accepts comma-separated clauses and configured multi-clause expansion; it is **not** the one-semantic-sort validator. That invariant belongs upstream. Special-token handling occurs before general alias expansion. Existing low-level multi-sort assertions do not authorize restoring user-facing secondary sorting or arbitrary wire fields.

Paging reverses every direction and reverses hits and tuple arrays together back into canonical order. End additionally moves the primary missing value first while retaining options such as `mode: max` and nested path. Reverse alone does not change missing placement. Output strips PIT's implicit extra suffix; numeric values with absolute magnitude at least `9.2e18` become null. Missing-primary cursor handling filters to the null zone, sends upload-time/ID fields only, then remaps to the supported full null-prefixed shape. It is scoped to that zone; crossing into populated predecessors is not performed by this helper. The selected scalar fields, suffix direction, tuple arity, sentinel normalization and End/null behavior must travel together.

**Consequence / smallest integration action:** preserve one semantic sort without assuming it means a one-element cursor. D027/D029/configuration integration must check configured physical expansions against null-zone fallback and field types. Missing upload time and malformed/multi-clause cursors are not certified by the supported-shape helper; actual mappings/configuration remain unread. No generic sort-language expansion is proposed.

### C04. Rank is an exact-count construction, not a snapshot guarantee

Original: [countBefore](../../../../src/dal/es-adapter.ts#L1279), 1279-1441; [selected-maximum assertions](../../../../src/dal/es-adapter.test.ts#L751), 751-868.

`countBefore` constructs lexicographic OR branches: each branch requires equality on earlier fields and a strict-before condition on the next. Descending uses greater-than; ascending uses less-than. A null field puts all valued documents before it regardless of direction, and equal preceding nulls mean missing fields. ID participates in tie resolution. No usable branches returns zero locally.

For selected-maximum special dates, ascending-before means the parent has a value and **no** value at/above the target; descending-before means some value exceeds the target. Equality requires the target value and excludes a greater value. Nested wrapping is applied to usages at the appropriate leaf predicates. These avoid equating an arbitrary older child value with the selected maximum. The final `_count` reuses the base query and takes an abort signal, but has **no PIT argument** and propagates request failures.

**Consequence / smallest integration action:** retain rank against the same semantic filter/order and the actual tuple used for landing. Exact query construction does not promise sameness with a separately opened paging/map PIT, mutated metadata, or unreviewed mappings. D024/D027/D028 must join those assumptions under ordinary live consistency, not introduce a universal snapshot.

### C05. Complete maps use a dedicated two-phase PIT; their size bound is caller-owned

Originals: [map producer](../../../../src/dal/es-adapter.ts#L1972), 1972-2193; [map interface/helper](../../../../src/dal/position-map.ts#L21), 21-77; [map publication](../../../../src/stores/search-store.ts#L1227), 1227-1290; [two caller branches](../../../../src/stores/search-store.ts#L2382), 2382-2398 and [2503](../../../../src/stores/search-store.ts#L2503), 2503-2519; [freeze helper](../../../../src/stores/search-store.ts#L819), 819-847; [tuning defaults](../../../../src/constants/tuning.ts#L84), 84-118.

The producer opens its own one-minute PIT. Phase one enumerates valued primaries using the complete canonical sort; phase two enumerates missing primaries using the remaining sort fields, appending their tuples with a null primary. Existence tests are nested for usages. It sends `_source: false`, `track_total_hits: false`, and pages of `min(10,000, MAX_RESULT_WINDOW)`. Internal continuation uses the **full** returned PIT tuple; published tuples discard `_shard_doc`. Refreshed PIT IDs are used on subsequent requests and close. Exhaustion is empty/short pages, not a hit total; exact multiples require an empty follow-up page.

Both phases must finish before a map is returned. Abort/error discards partial arrays; an empty map returns null. PIT open has no cancellation signal; abort is checked after opening and closes it. The loop checks cancellation before and after requests, yields between full chunks, and closes the dedicated PIT in `finally` without waiting for close. It has no expiry-to-live fallback and no producer-level aggregate entry/page/time cap. The store gates starts by the initial result total; source defaults are `1,000 < total <= 65,000`, configurable, with zero disabling maps. Actual overrides and index settings were not read. The helper publishes a map without checking its length against the retained session total.

Both start sites pass raw `params`. Initial history search may separately decorate the first page with `frozenUntil`; subsequent restore uses `frozenParams`, which caps `until` at `newCountSince`. The map producer does not add either cap itself. Therefore same builder does not imply identical effective filter or snapshot between map, first page and later windows. This is an explicit raw-versus-frozen integration question, not a newly imposed snapshot guarantee or observed failure.

`cursorForPosition(N)` returns the predecessor tuple for an in-range positive N; zero/negative returns null. At or beyond `map.length`, it returns the **last entry's tuple**, meaning paging strictly after that entry, not automatically fetching the last item. The End caller route is separate. Lookup is constant-time array access, not evidence about network latency or ES work.

**Consequence / smallest integration action:** preserve complete-or-absent maps, background cancellation, tuple provenance and indexed coordinates independent of map readiness. D016/D027 must explicitly disposition raw/frozen membership and caller eligibility before claiming end-to-end coherence. No new map hard cap, useful-limit reduction or automatic producer change is authorized.

### C06. Distribution provenance separates exact coverage from approximation

Originals: [percentile and composite seek](../../../../src/dal/es-adapter.ts#L1443), 1443-1630; [keyword distribution](../../../../src/dal/es-adapter.ts#L1643), 1643-1735; [date distribution](../../../../src/dal/es-adapter.ts#L1754), 1754-1966; [label lookup/interpolation](../../../../src/lib/sort-context.ts#L351), 351-642; [ticks/null boundary](../../../../src/lib/sort-context.ts#L692), 692-1107; [declarations](../../../../src/dal/types.ts#L207), 207-245.

| Mechanism | Actual bound / returned semantics | Qualification to retain |
| --- | --- | --- |
| Percentile | One `tdigest` aggregation, compression 200; optional exact `term` equality scope; nested aggregation when required; finite number or null | Approximate scalar seed, not exact ordinal. Nested multi-values are not a per-parent selected-max percentile. Errors return null; warnings on non-abort failures. |
| Keyword seek | Composite buckets, default 10,000 per page (configurable), max 50 pages, 8,000 ms checked **between** pages | Returns containing bucket when reached, otherwise last seen key on exhaustion/time/page cap or non-abort error; abort returns null. No response flag distinguishes exact bucket hit from approximation. The timer is not an in-flight deadline or ES cost bound. |
| Keyword distribution | Up to five 10,000-bucket pages; first request separately counts valued documents | `coveredCount` is valued coverage, `representedCount` is returned bucket mass, `complete` requires observed exhaustion. Cap does not manufacture a null zone. Missing valued-count data falls back to cumulative bucket mass; error discards the distribution. |
| Date distribution | Stats request chooses month/day/hour/30m/10m/5m interval, then a histogram request; zero stats count exits early | **Two requests on the populated path**, contrary to single-request comments. No explicit maximum histogram bucket count in this method. Both requests use the same assembled query, independently of paging PIT. |
| Special-date histogram | Exact parent-exists coverage from the stats request; usages use reverse-nested per-bucket parent counts; collections root counts | One parent can contribute to several date buckets. `bucketPositionKind: approximate-evidence` and `evidenceCount` explicitly separate that mass from exact coverage; missing parent-count data falls back to cumulative mass. Not selected-max ranks. |

`sort-context` binary-searches distributions, rejects positions outside valued or represented coverage, and projects approximate-evidence positions between evidence and populated-document spaces. It prefixes those date labels with `Approx.`; tick projection removes collisions inconsistent with label lookup. The primary distribution owns the null boundary; secondary upload-time distribution only enriches the tail. Missing primary distribution means no inferred null tail, and upload-time sorts suppress the boundary even when independent counts differ. A known null-zone position without secondary data returns no invented date label.

Other presentation remains deliberately less exact: keyword in-buffer values win, missing distributions use buffer edges, date fallback extrapolates linearly, and ordinary date histograms identify time buckets rather than each image's instant. No request occurs during these label/tick calculations. Numeric width/height are listed by the keyword-distribution descriptor, so that descriptor is not a pure datatype classifier. Display uses oriented-dimension fallback while sorting uses raw dimensions (existing known issue); special-date display accessors use lexically sorted strings while the fallback sort extractor compares instants. Unknown/configured labels can be absent because these label maps are static. None of these presentation values should be promoted to authoritative cursors.

**Consequence / smallest integration action:** preserve provenance and graceful presentation absence, not universal exact labels. D024/configuration owners must confirm single-valued field assumptions before interpreting composite bucket sums as ranks. D032 joins actual scrubber wiring/geometry; no presentation repair or new measurement is proposed here.

### C07. Range walks, hydration and cancellation have different completeness rules

Originals: [comparison](../../../../src/dal/es-adapter.ts#L87), 87-126; [hydration/range walk](../../../../src/dal/es-adapter.ts#L2199), 2199-2340; [range declarations](../../../../src/dal/types.ts#L247), 247-265 and 490-530; [range tuning](../../../../src/constants/tuning.ts#L269), 269-296.

`getIdRange` expects caller-ordered endpoints. It never swaps them. Search-after excludes the start; processing stops only when a tuple is strictly past the end, so the end is inclusive. It uses canonical directions, direction-independent null-last semantics, and `localeCompare` for string tuple components. Equivalence of that collation to actual ES keyword ordering is a specific model/selection join, not a proved cross-engine guarantee. IDs come from the explicit ID sort slot, not `_source`.

The walk uses source-free 1,000-hit pages and **no PIT**. After crossing into a null-prefixed cursor it continues with the null-zone override, including when the crossing page was short. A dynamic hard cap defaults to 5,000 IDs; one additional in-range document is required to return `truncated: true`. Full pages are fetched, so the wire-hit bound is not simply cap-plus-one. `walked` increments before the overshoot check and includes the extra in-range probe; it can exceed returned IDs without an error, contrary to its interface comment.

Cancellation breaks the loop and can return an already collected **partial** list with `truncated: false`. That flag means cap overflow, not general completeness; callers must check their signal/generation before committing. Non-abort errors throw, not a returned partial error record. The paging helper catches DOM AbortError as empty data, while the range caller also checks `signal.aborted`. Incoming `trackTotalHits` is spread through if supplied, though no totals are used by the walk.

`getByIds` sends 1,000-ID multi-get chunks with **all chunks concurrently** via `Promise.all`, source filtering in the query string, and no overall producer concurrency/ID cap. Missing/unavailable individual documents are omitted. Aborted chunks become empty lists, so other completed chunks can remain; non-abort request errors propagate. `getById` simply takes the first result. These are hydration APIs, not query membership or authorization checks.

**Consequence / smallest integration action:** D017's selection owner must verify endpoint ordering/swap-on-empty, abort-before-commit, cap UI and hydration batching against real callers/assertions. Preserve the useful 5,000-ID limit and actual inclusive/exclusive behavior. D024/D029 owns string ordering and field assumptions. The five assigned test files do not exercise the range walk or multi-get; this is not a claim that no such tests exist elsewhere.

### C08. Counts, facets and tickers are not all exact-total channels

Original: [ticker definitions/results](../../../../src/dal/es-adapter.ts#L374), 374-452; [count and aggregation methods](../../../../src/dal/es-adapter.ts#L697), 697-883.

`count` delegates to `countWithTickers`: size-zero search, shared query, `track_total_hits: true`, plus precompiled named filter aggregations. Ticker filter compilation uses the parsed `must` clauses; optional supplier terms return top nine plus `sum_other_doc_count` as `other`. The method has no signal parameter and errors propagate to its caller.

`getAggregation` defaults to 50 terms with its separate catch-all query scope. `getAggregations` defaults each field to ten terms under `buildQuery`; optional `is:` counts use the first parsed `must` clause. Usage filters share one nested traversal with platform/status terms of size 20 and reverse-nested parent counts. Missing buckets/counts become empty/zero. Both aggregation methods expose `hits.total.value` but do **not** request exact totals or preserve ES total relation; those numbers must not be assumed to be the session's exact size. Batched aggregations accept the supplied signal and propagate cancellation/failures rather than returning a null distribution.

**Consequence / smallest integration action:** D030 must join ticker additive/freeze behavior and facet scoping with their callers, including missing bucket versus absent data. D029/configuration owners must establish parser/definition parity. Source request counts, comments claiming cheaper execution and field bucket caps do not establish latency or ES computational complexity.

### C09. AI is a bounded result set, not a pageable ordinary search

Originals: [AI producer](../../../../src/dal/es-adapter.ts#L1114), 1114-1277; [AI assertions](../../../../src/dal/es-adapter.test.ts#L906), 906-1035; [AI declaration](../../../../src/dal/types.ts#L335), 335-348.

The implementation reads `params.aiQuery` directly, despite comments about extracting a chip. Absence falls back to ordinary first-page search. `vecWeight` is parsed/clamped to 0..1 (invalid becomes 1). Pure BM25 skips embedding; positive weights call the imported embedding client with the signal. Requests ask for at most 200 hits; pure KNN uses k=200/candidates=400, and hybrid asks for candidates=400 after an unfiltered lexical score probe. Final search uses the shared prefilter. Hybrid combines `should` clauses with a filter but sets no explicit `minimum_should_match`; actual relevance/scope policy belongs to the AI/query join, not an assumed mandatory lexical/vector match.

Returned hits carry `__aiScore`; synthetic tuples are descending result-index plus ID, not reusable ES paging tuples. `total` is exactly the returned array length and `pitId` is null. The request enforces the requested result bound; there is no local slice validating an oversized/malformed response. `orderBy` does not build an ES sort here; any relevance/uploaded reorder is caller-owned. Errors/aborts from embedding, probe or final ES request propagate rather than being converted to ordinary empty paging results.

**Consequence / smallest integration action:** D030/AI owners must preserve flat-result and synthetic-cursor boundaries, reorder semantics, hybrid probe/final-query scope and failure presentation; D026 owns actual embedding producer/deployment contracts. No network/Bedrock/ES behavior was observed, and no ranking repair or alternate algorithm is proposed.

### C10. Failure, safeguards and comments need explicit qualifications

Originals: [request safeguards/transport](../../../../src/dal/es-adapter.ts#L595), 595-683; [PIT lifecycle](../../../../src/dal/es-adapter.ts#L889), 889-910; [paging recovery](../../../../src/dal/es-adapter.ts#L1035), 1035-1107; interface comments throughout [types](../../../../src/dal/types.ts#L1).

Every direct transport call passes `assertReadOnly`, which checks imported non-local path/method allowlists and restricts DELETE to PIT paths. Local detection/config contents are unread, so this is a source control-flow fact, not configuration certification. Those safeguards must remain intact in behavior as well as code; no operation was executed. The transport passes the signal to fetch, throws on non-2xx and yields after JSON parsing. It has no added timeout, shared abort-controller ownership or response-schema validation in this file.

Ordinary paging alone swallows DOM AbortError as empty data and permits one live-index fallback for errors whose message matches `/40[04]|410/` when a PIT was supplied and the signal is not aborted. This matches 400 as well as 404/410 and inspects the message, not a typed expiry contract. Do not present it as equivalent to the API mapper's explicit expiry/refusal categories. Maps fail closed to null; distribution failures return null (often with warnings); rank/aggregations/AI normally reject; range/multi-get have the partial-abort behavior above. There is no uniform producer policy of optional absence for all core data.

Documentation-only corrections for later ownership, not edits here: the PIT interface says default five minutes/logged close errors, while implementation defaults to one minute and silently swallows close failure; date distribution says one request but normally uses two; AI comments describe chip extraction rather than `params.aiQuery`; range `walked` does not equal IDs on normal overshoot/cap probing; the range implementation still uses the comparison helper despite a comment saying it was eliminated; the freeze comment says inclusive `lte` although the producer uses exclusive `lt`. Historical timing claims in comments were read as comments, not promoted to measurements.

**Consequence / smallest integration action:** D018/D029/D031 must preserve intentional recovery while distinguishing typed refusals, absent enrichment, cancelled work and failed essential search. E017 remains a coordinator-owned hybrid caller join, not a live exploit or a reason to restart D3.

### C11. What the five assertion files actually establish

All rows are **test-read**, not executed evidence. Imports/fixtures outside the assigned set were not treated as read.

| Original file, complete reading | Assertions actually present | Important limits |
| --- | --- | --- |
| [es-adapter.test.ts](../../../../src/dal/es-adapter.test.ts#L1), 1-1035 | Mock fetch shapes for six exclusive/date-only bounds; valued versus represented keyword coverage; special-date exact coverage/repeated evidence; map phases, total omission, full internal PIT cursors and refreshed PIT IDs; initial exact totals; special End options; 404/410 fallback and explicit null PIT; keyword mid-walk approximation; rank sentinel and max-mode shapes; structured percentile terms; pure KNN mapping and embedding errors. | No real ES/API execution. First-page exact total is tested; ordinary untracked page-total/restore composition is not. No range/multi-get tests here, no pure-BM25/hybrid branch assertions. The no-AI fallback only asserts hit length >= 0. |
| [sort-builders.test.ts](../../../../src/dal/adapters/elasticsearch/sort-builders.test.ts#L1), 1-439 | Defaults/aliases/suffix direction, low-level multiple clauses, special max/nested options, reverse option retention, registry-derived one-field/order wire shape, array-max fallback cases. | Wire-shape assertions are not server acceptance, allowlist/auth or configured deployment parity. Titles calling collection sorts nested do not change the non-nested actual expectation. No proof that upstream rejects secondary semantic sorting. |
| [position-map.test.ts](../../../../src/dal/position-map.test.ts#L1), 1-244 | Predecessor/beyond-end/null/tied cursor lookup; mock map parallel arrays and simple structure; mock abort/empty behavior. | Mock default order is explicitly ascending timestamps, unlike real default descending. Mid-abort allows null **or complete**; empty mock may return an empty map unlike ES null. Mock implementation itself unread. |
| [sort-context.test.ts](../../../../src/lib/sort-context.test.ts#L1), 1-296 | Null-boundary cases and offsets, upload-time suppression, approximate-evidence projection/collisions/labels, binary-search property, unrepresented keyword tail, resolvers and missing-value labels. | Pure constructed data does not verify producer count accuracy, rendering/geometry, all presentation accessors or live consistency. |
| [search-store-position-map.test.ts](../../../../src/stores/search-store-position-map.test.ts#L1), 1-565 | Mock eligibility/lifecycle/final-state behavior, unique parallel arrays, lower boundary, map retention across extend/seek, countBefore spy during seek, start/end target coverage, lookup by ID. | Upper-bound tests return early when configured threshold >10,000. Loading test observes completed false, not transient true; invalidation test observes eventual replacement, not immediate null. Several exact/fast-path titles assert only target containment. The focus-acceleration test checks `indexOf`, not `_findAndFocusImage`. No restore invocation. |

**Consequence / smallest integration action:** add these assertion receipts to D031, not execution credit. The unexamined ordinary store, null-zone, range/selection, mock and local-ES oracle assertions are precise remaining ownership, not evidence missing from the project and not a request to execute them now.

## 3. Exhaustive actual reading receipt

All paths below were ordinary files, not symlinks, at inspection. SHA-256 values are current input fingerprints, not only copied inventory values. Final metadata validation rechecks them. Full reading is not independent verification. Assigned chunks were contiguous and their cross-chunk functions were read through to completion.

Assigned receipt proposals (only these eleven are the P13 assignment; `ranges` document complete coverage):

```json
[
  {"path":"kupua/src/dal/es-adapter.ts","packetId":"P13","sha256":"7ddcd36711bd5fc5a8edd6e2e35270bd51a554e210bf7ace8db2b194ed4573f5","method":"full-text","ranges":[[1,2340]],"note":"Full producer reading in contiguous chunks 1-390, 391-780, 781-1170, 1171-1560, 1561-1950, 1951-2340; no unread lines. Source only."},
  {"path":"kupua/src/dal/es-adapter.test.ts","packetId":"P13","sha256":"bf792b74f01dbcfc3ff8f8c800f4daabc243b80338db981d0bb96e68450e4f60","method":"full-text","ranges":[[1,1035]],"note":"Full assertions read in chunks 1-345, 346-690, 691-1035; no tests executed."},
  {"path":"kupua/src/dal/adapters/elasticsearch/sort-builders.ts","packetId":"P13","sha256":"f443558619cab45e01d604ff50fb5bcf8e3ef465e92c74dc2346049f52b64e09","method":"full-text","ranges":[[1,252]],"note":"Full semantic-to-physical sort, reverse and extraction helpers; no unread lines."},
  {"path":"kupua/src/dal/adapters/elasticsearch/sort-builders.test.ts","packetId":"P13","sha256":"0c923d21c85a323ee1b333cd032c9b57006ac6a745041da25ecd02b1b1bef19f","method":"full-text","ranges":[[1,439]],"note":"Full assertions read, including low-level multi-clause and wire-shape tests; not executed."},
  {"path":"kupua/src/dal/null-zone.ts","packetId":"P13","sha256":"777af7a6a1354dbb1c9dd36d1032b8e3b10484f24d70eabf132518494ecdfe27","method":"full-text","ranges":[[1,124]],"note":"Full detection, missing-field scope and remapping source."},
  {"path":"kupua/src/dal/position-map.ts","packetId":"P13","sha256":"f43ec0b1ed4d5a40f6b2f6abe9ee98efeca23bdb852b35e07ae946df1079aa29","method":"full-text","ranges":[[1,77]],"note":"Full map interface and predecessor lookup; historical comment metrics not measurement verification."},
  {"path":"kupua/src/dal/position-map.test.ts","packetId":"P13","sha256":"1a97ebd5d2f6406e679f6a202ed16e749566982fedb792fa3071f0955839cef8","method":"full-text","ranges":[[1,244]],"note":"Full helper/mock assertions read; mock implementation unread and tests not executed."},
  {"path":"kupua/src/lib/sort-context.ts","packetId":"P13","sha256":"c86136b631adbf94c7019fe738a0ebdd9239f56dd36abb01b37a8ab12e8618bd","method":"full-text","ranges":[[1,1107]],"note":"Full presentation/distribution consumer in contiguous chunks 1-370, 371-740, 741-1107; no unread lines."},
  {"path":"kupua/src/lib/sort-context.test.ts","packetId":"P13","sha256":"a49c37a45f36474d630df846a86c957a1d013742dfa687d409cdec06187d5b01","method":"full-text","ranges":[[1,296]],"note":"Full null-boundary, projection, lookup/property and resolver assertions; not executed."},
  {"path":"kupua/src/stores/search-store-position-map.test.ts","packetId":"P13","sha256":"6ce5cb41d3c568b549d1d3622776184dbe52cb24bdcbd25a7a08db9eeec9963a","method":"full-text","ranges":[[1,565]],"note":"Full store/mock assertion reading in chunks 1-300 and 301-565, with skips and weak observables qualified; not executed."},
  {"path":"kupua/src/dal/types.ts","packetId":"P13","sha256":"eee76d90dd39062b25aa85de9f27df1fdd777093c4ea13ef4893d2d8680c809d","method":"full-text","ranges":[[1,530]],"note":"Full declared interface rechecked against producers after P09; additive receipt, not replacement or verification of P09."}
]
```

Supplemental source/routing receipts, **not full-file reading except the 14-line tier helper**. Exact unread complements are explicit; grep hits outside these ranges were routing only.

| Path | SHA-256 | Actually read | Unread in this packet |
| --- | --- | --- | --- |
| [search-store.ts](../../../../src/stores/search-store.ts) | `f1e85ce469d9aaa54f365f950a273aecfc4ebb22ef6dbcd63ddfb105b540b872` | 819-852; 1227-1420; 2250-2325; 2360-2410; 2480-2530; 3841-3985. Freeze, complete map/window helpers, initial request, both map start sites, complete restore and edge context. | 1-818; 853-1226; 1421-2249; 2326-2359; 2411-2479; 2531-3840; 3986-4312. |
| [useDataWindow.ts](../../../../src/hooks/useDataWindow.ts) | `a9ffe7106e04b64312ec6def9ca4ee8ac0f7be206368e728f57a327e88269df6` | 329-346, total-derived coordinate decision only. | 1-328; 347-507. |
| [two-tier.ts](../../../../src/lib/two-tier.ts) | `eaaf94937d2357cabdf1ea5397b4dcff3bc8904851067a579efe0e9114f5c23a` | Full 1-14. | None. |
| [tuning.ts](../../../../src/constants/tuning.ts) | `55e656aa5aba2719dfd1ab1a366c2f2c0b22ddebaa520720ec65bd5e82f5bcd0` | 70-118; 262-296, code defaults and caps only. | 1-69; 119-261; 297-369. No actual local config inspected. |
| [grid-api-search-adapter.ts](../../../../src/dal/grid-api-search-adapter.ts) | `05e675e63ce4a50a94f010d09a2f0e2861274bc04e56584ccc2d52451b05bbeb` | 80-198, error class and complete `apiSearchAfter` function. | 1-79, including response declarations and image/enrichment mapping helpers. |
| [P09 routing report](api-boundary-09-p09-core-store.md) | `243170a57c38e4404e2424df002e2af7a14f5f8dc5b465d3ec66e72608afbc0c` | 78-100, C07-C09 routing; decisive facts re-read in originals. | 1-77; 101-359. Search-result snippets elsewhere are not coverage. |

Administrative/context accounting, excluded from application reading credit:

| Path | SHA-256 | Inspection |
| --- | --- | --- |
| [.github/copilot-instructions.md](../../../../../.github/copilot-instructions.md) | `765de30857a0cc81cff1219d8fad37b4971ccab88c97d2b127f85326eee261c7` | Full 1-154; attached directives also supplied. |
| [AGENTS.md](../../../../AGENTS.md) | `bad917ef0ee92a5191d729f9e6d161aebb1f5f7c56370aef2e244a37f8226ab4` | Full 1-226; existing stale review state is not cleared. No named handoff file required by its routing. |
| [worklog-current.md](../../worklog-current.md) | `8ccd505ddc4c4350c0fb11c80ad936a456772578ae9a094dcb24fb892e90d8fa` | Full 1-42; read only, no check-in/reset. |
| [protocol 05](api-boundary-05-review-protocol.md) | `76b7a4c0b2a779db0d2b579e2ce3aedc17c750ff7472d11583c75e522fec2108` | Full 1-261. |
| [prompt 08](api-boundary-08-review-prompt.md) | `7f46f9e57ecbc9078ba91be0db63b81d3c59ad763440fe30166455c68bebdbb6` | Full 1-156. |
| [coverage register](api-boundary-06-coverage.json) | `1c70e8a6e7255ed0e9da4f85eb484b8c21b1a3fced7537cd48bcee97b3b7d28c` | Structured extraction: exact P13 packet/assignments/file metadata; dependencies D016-D018 and D023-D032; check output. Whole 33,468-line register not semantically read. |
| [evidence register](api-boundary-07-evidence.json) | `6c149c81e30e527d841e269ba9f23ef63f6636c6a82db54bbe41b875d8582b62` | Structured extraction: keys and E009-E019 identity/kind/status/statement/scope/limits; E020-E028 source-routing records visible in the first extraction's retained output. Originals not read beyond supplemental receipts; no claim verification for unread cited files. Whole 1,210-line register not semantically read. |

No P12 draft or P10 report was read or relied on. P10 joins use original tier/view lines above and qualified evidence routing, not endorsement of its other conclusions. No supplemental `media-api/**` source was needed; its path instructions therefore were not invoked. Imported CQL, field registry, ES/cost/runtime configuration, models, embedding implementation, selection callers, ordinary store tests and historical measurement canon remain unread by P13 unless explicitly listed above. No full-server, auth or configuration coverage follows from imports or comments.

## 4. Qualified evidence dispositions and proposed records

Existing IDs remain coordinator-owned. **E013:** add the direct-ES total premise and original restore/view citations from C01; retain `kind: inference`, `status: supported`, source-only/no runtime reproduction. **E014:** corroborated only for the bounded saved-rank/refreshed-tuple lines; keep its known-issue scope. **E009-E012/E015 and E020/E028:** join the producer facts below, without calling the full original claims independently verified. E011 needs the C07 `walked`/cancellation qualifications. **E016/E017:** no new full dispatch/server verification; only the restore catch and API mapper were read here. **E018/E026:** keep prior test-read scope; P13 adds different assertion files. No prior performance claim is refuted or promoted, and no proposed record has a coordinator E ID yet.

The following array proposes new producer/assertion records using the existing evidence fields. C labels are local cross-references in `scope`, not competing registry IDs. References identify original files and exact source ranges, not this report as proof.

```json
[
  {
    "packetId":"P13","kind":"source","status":"supported",
    "statement":"Direct paging requests exact totals only when trackTotalHits is true and substitutes zero when ES omits hits.total; API mapping instead derives countAll from cursor absence and passes through json.total.",
    "scope":"P13-C01: producer total semantics, including cursorless End/ID versus cursor continuation; join E009/E013/E016.",
    "limits":["Not server response verification or a runtime restore failure.","Query-subset counts and absent counts are not retained session totals."],
    "sources":[
      {"path":"kupua/src/dal/es-adapter.ts","sha256":"7ddcd36711bd5fc5a8edd6e2e35270bd51a554e210bf7ace8db2b194ed4573f5","lines":[918,1107]},
      {"path":"kupua/src/dal/grid-api-search-adapter.ts","sha256":"05e675e63ce4a50a94f010d09a2f0e2861274bc04e56584ccc2d52451b05bbeb","lines":[93,198]}
    ]
  },
  {
    "packetId":"P13","kind":"source","status":"supported",
    "statement":"The inline query builder reuses CQL output plus explicit filters and exclusive top-level date bounds across positional producers, but default-hide detection is textual and ID hydration, single-field aggregation and hybrid score probing have different scope.",
    "scope":"P13-C02/C08/C09: client query ownership, not server/auth equivalence; join D018/D024/D029/D030.",
    "limits":["CQL, actual configuration, models and server originals unread.","Ignored SearchParams members cannot be credited merely from the interface."],
    "sources":[
      {"path":"kupua/src/dal/es-adapter.ts","sha256":"7ddcd36711bd5fc5a8edd6e2e35270bd51a554e210bf7ace8db2b194ed4573f5","lines":[128,593]},
      {"path":"kupua/src/dal/es-adapter.ts","sha256":"7ddcd36711bd5fc5a8edd6e2e35270bd51a554e210bf7ace8db2b194ed4573f5","lines":[697,883]},
      {"path":"kupua/src/dal/es-adapter.ts","sha256":"7ddcd36711bd5fc5a8edd6e2e35270bd51a554e210bf7ace8db2b194ed4573f5","lines":[918,2193]},
      {"path":"kupua/src/dal/es-adapter.ts","sha256":"7ddcd36711bd5fc5a8edd6e2e35270bd51a554e210bf7ace8db2b194ed4573f5","lines":[2199,2247]}
    ]
  },
  {
    "packetId":"P13","kind":"source","status":"supported",
    "statement":"Canonical sort suffixes, selected-maximum special dates, paired reverse ordering, End missing placement, sentinel normalization and full null-prefix remapping jointly define ordered cursor windows.",
    "scope":"P13-C03: supported one-semantic-sort producer mechanics; join E011/E012 and D027/D029.",
    "limits":["The low-level builder itself accepts multiple clauses; upstream validation and configured expansion remain separate.","Missing-primary helper is zone-scoped; no all-shape or server parity guarantee."],
    "sources":[
      {"path":"kupua/src/dal/adapters/elasticsearch/sort-builders.ts","sha256":"f443558619cab45e01d604ff50fb5bcf8e3ef465e92c74dc2346049f52b64e09","lines":[16,252]},
      {"path":"kupua/src/dal/null-zone.ts","sha256":"777af7a6a1354dbb1c9dd36d1032b8e3b10484f24d70eabf132518494ecdfe27","lines":[43,124]},
      {"path":"kupua/src/dal/es-adapter.ts","sha256":"7ddcd36711bd5fc5a8edd6e2e35270bd51a554e210bf7ace8db2b194ed4573f5","lines":[59,84]},
      {"path":"kupua/src/dal/es-adapter.ts","sha256":"7ddcd36711bd5fc5a8edd6e2e35270bd51a554e210bf7ace8db2b194ed4573f5","lines":[918,1107]}
    ]
  },
  {
    "packetId":"P13","kind":"source","status":"supported",
    "statement":"countBefore builds a lexicographic strict-before count, including null-last and selected-maximum parent predicates, but queries without a PIT.",
    "scope":"P13-C04: rank query construction; qualify E010/E011/E014 with producer facts.",
    "limits":["Not executed ES proof or equivalence to a separate paging/map snapshot.","Actual mappings and configured multivalue aliases remain a named integration dependency."],
    "sources":[{"path":"kupua/src/dal/es-adapter.ts","sha256":"7ddcd36711bd5fc5a8edd6e2e35270bd51a554e210bf7ace8db2b194ed4573f5","lines":[1279,1441]}]
  },
  {
    "packetId":"P13","kind":"source","status":"supported",
    "statement":"Position maps enumerate valued and missing-primary phases under a dedicated PIT, publish only complete nonempty arrays, retain full internal PIT cursors and expose trimmed tuples; caller thresholding rather than a producer aggregate cap bounds ordinary use.",
    "scope":"P13-C05: map construction, eligibility and raw-versus-frozen parameter join; E011/D016/D027.",
    "limits":["Raw map params need not equal decorated first-page or frozen continuation params.","No map-length/session-total equality check or universal snapshot is established; no latency inference."],
    "sources":[
      {"path":"kupua/src/dal/es-adapter.ts","sha256":"7ddcd36711bd5fc5a8edd6e2e35270bd51a554e210bf7ace8db2b194ed4573f5","lines":[1972,2193]},
      {"path":"kupua/src/dal/position-map.ts","sha256":"f43ec0b1ed4d5a40f6b2f6abe9ee98efeca23bdb852b35e07ae946df1079aa29","lines":[21,77]},
      {"path":"kupua/src/stores/search-store.ts","sha256":"f1e85ce469d9aaa54f365f950a273aecfc4ebb22ef6dbcd63ddfb105b540b872","lines":[819,847]},
      {"path":"kupua/src/stores/search-store.ts","sha256":"f1e85ce469d9aaa54f365f950a273aecfc4ebb22ef6dbcd63ddfb105b540b872","lines":[1227,1290]},
      {"path":"kupua/src/stores/search-store.ts","sha256":"f1e85ce469d9aaa54f365f950a273aecfc4ebb22ef6dbcd63ddfb105b540b872","lines":[2250,2325]},
      {"path":"kupua/src/stores/search-store.ts","sha256":"f1e85ce469d9aaa54f365f950a273aecfc4ebb22ef6dbcd63ddfb105b540b872","lines":[2382,2398]},
      {"path":"kupua/src/stores/search-store.ts","sha256":"f1e85ce469d9aaa54f365f950a273aecfc4ebb22ef6dbcd63ddfb105b540b872","lines":[2503,2519]}
    ]
  },
  {
    "packetId":"P13","kind":"source","status":"supported",
    "statement":"Percentile and capped keyword seeks may approximate; keyword distributions separate valued coverage from represented prefix; special-date histograms separate parent coverage from repeated evidence, and presentation projects/labels that evidence without using it as exact rank.",
    "scope":"P13-C06: distribution production and full sort-context consumer; E010/E011/D027/D032.",
    "limits":["Count fallbacks and single-valued mapping assumptions remain explicit.","Date distribution normally makes two requests; caps/request counts are not ES cost or latency measurements."],
    "sources":[
      {"path":"kupua/src/dal/es-adapter.ts","sha256":"7ddcd36711bd5fc5a8edd6e2e35270bd51a554e210bf7ace8db2b194ed4573f5","lines":[1443,1966]},
      {"path":"kupua/src/lib/sort-context.ts","sha256":"c86136b631adbf94c7019fe738a0ebdd9239f56dd36abb01b37a8ab12e8618bd","lines":[1,1107]},
      {"path":"kupua/src/dal/types.ts","sha256":"eee76d90dd39062b25aa85de9f27df1fdd777093c4ea13ef4893d2d8680c809d","lines":[207,245]}
    ]
  },
  {
    "packetId":"P13","kind":"source","status":"supported",
    "statement":"Range walking is caller-ordered, start-exclusive/end-inclusive, PIT-less and cap-plus-one checked; walked can exceed returned IDs and cancellation can return partial IDs without truncation. Multi-get batches all 1000-ID chunks concurrently with per-chunk abort-to-empty behavior.",
    "scope":"P13-C07: range/hydration producers; qualify E011 and route D017/D024/D031.",
    "limits":["String locale comparison versus ES collation is not established.","Selection signal/order/cap handling and neighboring range tests remain unread; no operation executed."],
    "sources":[
      {"path":"kupua/src/dal/es-adapter.ts","sha256":"7ddcd36711bd5fc5a8edd6e2e35270bd51a554e210bf7ace8db2b194ed4573f5","lines":[87,126]},
      {"path":"kupua/src/dal/es-adapter.ts","sha256":"7ddcd36711bd5fc5a8edd6e2e35270bd51a554e210bf7ace8db2b194ed4573f5","lines":[2199,2340]},
      {"path":"kupua/src/dal/types.ts","sha256":"eee76d90dd39062b25aa85de9f27df1fdd777093c4ea13ef4893d2d8680c809d","lines":[247,265]},
      {"path":"kupua/src/dal/types.ts","sha256":"eee76d90dd39062b25aa85de9f27df1fdd777093c4ea13ef4893d2d8680c809d","lines":[490,530]}
    ]
  },
  {
    "packetId":"P13","kind":"source","status":"supported",
    "statement":"Ticker counts request exact totals while term aggregations do not; usage facets use bounded terms with parent counts. AI requests a flat 200-hit result, returns hits.length as total with synthetic cursors/null PIT, and propagates embedding/search errors.",
    "scope":"P13-C08/C09: supporting producer contracts for D026/D030, not their full UI or deployment workflows.",
    "limits":["Parser/config/ticker policy, AI reorder and hybrid relevance scope remain owner joins.","No actual service, model, capacity or latency observation."],
    "sources":[
      {"path":"kupua/src/dal/es-adapter.ts","sha256":"7ddcd36711bd5fc5a8edd6e2e35270bd51a554e210bf7ace8db2b194ed4573f5","lines":[374,452]},
      {"path":"kupua/src/dal/es-adapter.ts","sha256":"7ddcd36711bd5fc5a8edd6e2e35270bd51a554e210bf7ace8db2b194ed4573f5","lines":[697,883]},
      {"path":"kupua/src/dal/es-adapter.ts","sha256":"7ddcd36711bd5fc5a8edd6e2e35270bd51a554e210bf7ace8db2b194ed4573f5","lines":[1114,1277]}
    ]
  },
  {
    "packetId":"P13","kind":"source","status":"supported",
    "statement":"Direct transport retains imported non-local read-only guards; paging converts DOM AbortError to empty data and uses message-regex PIT fallback, while PIT closing silently ignores errors.",
    "scope":"P13-C10 and C05-C09; qualify failure/absence joins E015-E017/D018/D031 without reopening D3.",
    "limits":["Actual allowlists/local classification and server error contracts unread.","No data operation, live exploit, universal absence policy or safeguard change."],
    "sources":[
      {"path":"kupua/src/dal/es-adapter.ts","sha256":"7ddcd36711bd5fc5a8edd6e2e35270bd51a554e210bf7ace8db2b194ed4573f5","lines":[595,683]},
      {"path":"kupua/src/dal/es-adapter.ts","sha256":"7ddcd36711bd5fc5a8edd6e2e35270bd51a554e210bf7ace8db2b194ed4573f5","lines":[889,1107]}
    ]
  },
  {
    "packetId":"P13","kind":"test-read","status":"supported",
    "statement":"Assigned adapter and sort-builder assertions specify mocked query/tuple/provenance/recovery shapes, not real ES or API behavior; AI hybrid, ordinary untracked-page restore composition, range and multi-get are not exercised in these files.",
    "scope":"P13-C11: complete adapter/sort assertion reads; additive D031 coverage only.",
    "limits":["Tests not executed; no current pass count or runtime certification.","Imported fixtures/registry/parser and tests elsewhere are not credited."],
    "sources":[
      {"path":"kupua/src/dal/es-adapter.test.ts","sha256":"bf792b74f01dbcfc3ff8f8c800f4daabc243b80338db981d0bb96e68450e4f60","lines":[1,1035]},
      {"path":"kupua/src/dal/adapters/elasticsearch/sort-builders.test.ts","sha256":"0c923d21c85a323ee1b333cd032c9b57006ac6a745041da25ecd02b1b1bef19f","lines":[1,439]}
    ]
  },
  {
    "packetId":"P13","kind":"test-read","status":"supported",
    "statement":"Assigned map/store assertions cover predecessor lookup and mock lifecycle/seek containment with explicit weak observables and upper-threshold skips; sort-context assertions cover null boundaries, projected evidence, bounded keyword tails and lookup properties.",
    "scope":"P13-C11: complete three-file assertion reading, not full producer/consumer workflow verification.",
    "limits":["No tests executed, no restore assertion in these files.","Focus-acceleration title tests indexOf, not focus execution; mock order differs from ES default."],
    "sources":[
      {"path":"kupua/src/dal/position-map.test.ts","sha256":"1a97ebd5d2f6406e679f6a202ed16e749566982fedb792fa3071f0955839cef8","lines":[1,244]},
      {"path":"kupua/src/stores/search-store-position-map.test.ts","sha256":"6ce5cb41d3c568b549d1d3622776184dbe52cb24bdcbd25a7a08db9eeec9963a","lines":[1,565]},
      {"path":"kupua/src/lib/sort-context.test.ts","sha256":"a49c37a45f36474d630df846a86c957a1d013742dfa687d409cdec06187d5b01","lines":[1,296]}
    ]
  },
  {
    "packetId":"P13","kind":"inference","status":"unverified",
    "statement":"A capability-preserving API migration needs coherent session coordinates and ordered windows with preserved tuple/rank/null/provenance/cancellation contracts, while retaining accepted approximate presentation, bounded work and ordinary live-consistency limits.",
    "scope":"P13 deciding answer and C01-C11; producer-supported requirement, to join E028 and D016-D018/D027-D032.",
    "limits":["Not proof that any proposed or deployed API supplies the complete contract.","No endpoint plan, stronger snapshot, capacity conclusion, feature reduction or new baseline campaign follows."],
    "sources":[
      {"path":"kupua/src/dal/types.ts","sha256":"eee76d90dd39062b25aa85de9f27df1fdd777093c4ea13ef4893d2d8680c809d","lines":[1,530]},
      {"path":"kupua/src/dal/es-adapter.ts","sha256":"7ddcd36711bd5fc5a8edd6e2e35270bd51a554e210bf7ace8db2b194ed4573f5","lines":[918,2340]},
      {"path":"kupua/src/stores/search-store.ts","sha256":"f1e85ce469d9aaa54f365f950a273aecfc4ebb22ef6dbcd63ddfb105b540b872","lines":[3841,3978]},
      {"path":"kupua/src/lib/two-tier.ts","sha256":"eaaf94937d2357cabdf1ea5397b4dcff3bc8904851067a579efe0e9114f5c23a","lines":[1,14]}
    ]
  }
]
```

## 5. Exact coordinator integration and dependency requests

1. Recheck section-3 fingerprints, accept P13 as bounded reading, and append its eleven full-text receipts. Ten assigned files may move from `inventoried` to `read`; keep the already-read types file's P09 receipt and add P13's producer-side receipt. Do not set any file to `verified`. Supplemental source ranges are additive partial receipts; never downgrade or replace earlier full receipts. Administrative/routing reading is not new application coverage. Integrate the twelve proposed claims only after assigning central IDs and checking originals. The report itself is not a second register.
2. **D027:** the assigned producer reading is complete, including the direct total premise, maps, rank, null, range, distributions and assertions. Keep the overall dependency unresolved until the coordinator records the cross-owner dispositions below. Either retain D027 as the integration umbrella or move its remaining named questions into coordinator-owned dependencies; do not close it merely because P13's files are read. No additional delegate is allocated here.

| Existing join / receiving coordinator-owned role | Exact remaining question / closure criterion |
| --- | --- |
| D016 core integration + D031 ordinary store assertions | Add C01's direct total/caller/view trace to E013. Do ordinary restore tests model a retained indexed total with zero/untracked forward total, and how should target-tier selection be dispositioned? Separate that from actual runtime symptoms and any later approved repair. |
| D027 position/core integration + D028 history owner | Map starts use raw params; first history page may use frozenUntil; subsequent windows use frozenParams. Disposition effective membership and separate PIT timing under accepted live consistency. Also retain saved-tuple rank versus refreshed-tuple paging as existing E014; no stronger universal guarantee. |
| D029 Grid query/shared-caller + DAL mapper owner | Trace actual server `countAll`, totals/relation/omission, cursorless End/ID subset totals, parsed default-hide intent, all SearchParams dispositions and upstream one-sort validation. Match canonical suffixes/reverse/End/null tuples without declaring client raw-string checks to be auth authority. |
| D024 Grid models/producers + configuration owner (D023 where applicable) | Confirm relevant field scalar/multivalue/nested/date mappings, configured alias expansions, upload-time availability, physical tuple shapes and string comparison order. Read public source/contracts, not local credential/runtime payloads. No automatic mapping/index changes. |
| D017 selection/shared-caller + D031 range/mock assertion owner | Verify ordered endpoints and swap-on-zero retry, inclusive end, cap-plus-one and walked meaning, signal/generation checks before committing partial abort results, hydration omissions and all-chunk concurrency. Read existing range/null-zone/mock/local-oracle assertions first; no suite execution requested. |
| D030 AI/facet/ticker/enrichment owner + D026 AI producer/deployment owner | Join exact ticker versus untracked facet totals, parser/config compilation, additive poll/frozen scope, optional enrichment versus essential failures, flat AI total/synthetic tuples, caller reorder, unfiltered hybrid probe and final optional-should relevance policy. Producer packaging/model/service behavior remains unobserved. |
| D018 auth/server-error + D017 DAL caller integration | Preserve non-local guards; distinguish direct message-regex fallback from typed API refusal/expiry. Revisit E017 only with original dispatch/server/caller chain: P13 confirms generic restore recovery, not an exploit or end-to-end refusal guarantee. |
| D032 scrubber/geometry owner with P10 integration | Combine this full sort-context receipt with actual scrubber props/geometry, primary/secondary distribution scope and pending seek publication. Approximate ticks/labels must stay presentation evidence; missing distributions cannot change the total-based coordinate tier. |

The smallest corrections at this stage are accurate receipts, qualified evidence and ownership, plus later owning-doc reconciliation of the specific misleading comments in C10. **No product/tooling repair, new experiment, feature reduction or plan replacement is requested or authorized by this report.**

## 6. Executed checks and limits

- Ran the exact read-only command `node kupua/exploration/experiments/api-boundary/api-boundary-review.mjs packet P13`. Actual output matched ID, strong role/class, ready status, deciding question, eleven scopes/hashes and this exact report path. The report did not previously exist.
- Ran `node kupua/exploration/experiments/api-boundary/api-boundary-review.mjs check`: no errors, four warning messages covering the already-known AGENTS receipt/staleness plus human directive copy and changelog staleness; `readyForSynthesis: false`. Snapshot remained 1,800 files: 1,560 required, two pending, 238 excluded; 99 read, 24 partial, three stale; 21 open dependencies. This is bookkeeping, not comprehension or a test suite.
- Ran bounded in-memory Node `fs`/`crypto` metadata/register projections with explicit P13 output markers. Eleven assigned fingerprints matched the register and all inspected paths were regular non-symlink files. The first overlarge projection was not treated as a complete read; hashes/dependencies and P09 claim identities were re-extracted in bounded output. No Git child process was spawned and no script wrote a file.
- Final report validation parses both JSON arrays, rechecks assigned/supplemental/admin/evidence source hashes, line bounds, source-within-receipt coverage and relative Markdown links; checks the six-section shape and exact assignment accounting; and compares shared register/worklog fingerprints with the captured inputs. These are allowed metadata/document checks only. The return message states the actual result.
- Only this assigned report was written, via `apply_patch`. No register, evidence, routing, worklog, AGENTS, changelog, code, configuration or test file was edited. User evidence-register edits and the reverted changelog remain untouched. P12 remains unintegrated here, and approved D022 visual work was not revisited.
- No test/build/performance command, application, browser, service, network/ES/AWS/data operation, Git mutation or subdelegation occurred. No ignored runtime/credential payload or actual local configuration was read. No real image identities, emails, host values, signed URLs, credentials or raw runtime bodies are reproduced. Source fixture examples were read only; the report cites their code rather than copying editorial values.
- Exactness claims are bounded source constructions or read assertions, with mapping/caller/server limits stated above. No actual production/global ES topology, deployed capacity, runtime regression, current suite status or new historical measurement interpretation is established. Stop after this report; coordinator integration is not applied.