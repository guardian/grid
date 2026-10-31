# API boundary P09: core store and DAL contracts

## 1. Deciding answer

**Accept the P09 reading packet with the qualifications and integration requests below.** This is a source/doc/contract review, not independent verification, migration approval, or closure of D016-D018. All four assigned files were read in full: 7,179 lines. Three small supplemental dispatch/error-contract files were also read in full: 324 lines. No tests, builds, measurements, services, browser sessions, live requests, Git mutations or subdelegation were performed.

The migration must preserve the existing caller-owned browsing state machine, not merely replace its first-page transport. The store coordinates bounded buffers, stable result-set totals, response-tuple retention, bidirectional paging, separate cancellation domains, approximate deep landing plus rank lookup, optional position maps/distributions, explicit/phantom focus, restoration, AI results, facets and tickers. Its publication signals are a contract with views: results, positions, total, cursors, enrichment and the appropriate scroll generation must describe the same landing. Supporting mechanisms serve arbitrary-position browsing, position preservation and traversal across densities; they are not a reason to reduce workflows or impose stronger universal exactness.

Current ownership is hybrid. The factory always constructs ES; media-api mode wraps it. Most methods still delegate to ES, and even `searchAfter` deliberately bypasses media-api for positive-offset shallow pages and falls back to ES for classified unavailability. Expiry recovery is different from refusal. Eventual zero-browser-ES deployment therefore needs the complete caller/producer accounting requested here, while retaining the authorized transitional direct-ES mode. This report is not a global candidate plan.

Three particularly consequential unresolved boundaries are: restore choosing its coordinate target from a page total rather than the session total; restore ranking a saved tuple but paging around a refreshed one; and store-level generic restore recovery potentially reaching a direct-ES shallow seek after an API refusal. These are bounded source findings, not claims of observed production failures or grounds to reopen the completed D3 amendment batch.

## 2. Material sourced contract findings

The labels C01-C14 below are report-local, not evidence-register IDs. Source facts, type contracts, assertions read, documentation claims and inferences are identified separately.

### C01. State, totals and view publication are one caller contract

**Source:** [search-store.ts](../../../../src/stores/search-store.ts#L199), lines 199-435, declares the dense window, global `bufferOffset`, `imagePositions`, start/end cursors, total, loading/error, focus, generations and view targets. Forward extension appends and evicts from the start; backward extension prepends and evicts from the end ([source](../../../../src/stores/search-store.ts#L2538), 2538-2831). Position entries are added/evicted with their buffer entries. Forward eviction rounds to current columns; backward trim aligns the resulting offset, with a guard against discarding a whole short page. Retained response tuples are preferred when rebuilding an eviction-edge cursor, then extraction, then the last good cursor.

Initial ordinary search requests `trackTotalHits: true` and publishes its total. Fill, extend, seek and restore preserve the existing store total rather than adopting a page's zero, filtered or otherwise unsuitable count ([search](../../../../src/stores/search-store.ts#L2268), 2268-2440; [fill](../../../../src/stores/search-store.ts#L1070), 1070-1095; [seek](../../../../src/stores/search-store.ts#L3721), 3721-3780; [restore](../../../../src/stores/search-store.ts#L3931), 3931-3960). This matters because total selects the coordinate tier, not just the counter label.

The store emits separate `_prependGeneration`/count, `_forwardEvictGeneration`/count, `_seekGeneration` with local/global/sub-row targets, `_scrollReset` with `sortOnly`, and `sortAroundFocusGeneration`. `_pendingFocusAfterSeek`, `_pendingFocusDelta`, `_phantomFocusImageId` and `_bufferSelfCorrecting` also carry view intent. A response adapter cannot independently decide scroll/reset/focus behavior. The source uses current geometry during commit; exact visual placement still requires P10's original consumer ranges. Buffer sizing and timing constants are imported, not independently read here; numeric defaults in this report are attributed to the guide/tests, not certified configuration.

### C02. Cancellation has several identities, not a single request flag

**Source:** [module state](../../../../src/stores/search-store.ts#L532), 532-649, and [search](../../../../src/stores/search-store.ts#L2024), 2024-2153:

- New search increments `_searchGeneration`, stops the poll, aborts/replaces range and focus controllers, cancels aggregations/distributions/expanded facets/maps, clears in-flight flags and invalidates map/distribution state. It retains the old buffer while loading. After initial awaits, stale search cannot publish and closes the PIT it opened.
- Seek/restore abort range work and capture their own signal before awaits. Focus discovery has a separate search-owned controller so scroll-triggered seeks cannot kill its target/rank work. Focus then aborts old range work before loading its replacement using the focus signal.
- Extends share the range signal plus directional in-flight flags and cooldowns. `_pitGeneration` guards old PIT use. The map has its own signal; seeks and extends do not invalidate it.
- Polling uses its own generation before and after the count request. Static aggregations use cancellation plus `_aggRequestGeneration`; distributions additionally check request-object identity and current scope key before publication/final cleanup.

**Limit:** This is not a claim that every catch/finally has identical stale-write protection. Expanded facets publish after awaiting without a post-await signal/generation check ([source](../../../../src/stores/search-store.ts#L4119), 4119-4167); they depend more directly on producer cancellation rejection. Fill/map aborted paths can clear loading flags. Seek/restore generic non-AbortError catches do not carry a separate request-generation check. These are exact producer obligations for integration, not a general bug-fix queue. The DEV search-lifecycle subscription (4286-4312) is a testing/trace signal, not a server browse-session identity or proof that all background work has finished.

### C03. PIT lifecycle is deliberately weaker than one universal snapshot

**Source:** [ordinary search](../../../../src/stores/search-store.ts#L2252), 2252-2307, opens a non-local PIT with `"1m"` in parallel with a PIT-less first page and ticker count. Local mode skips PIT opening. Open failure is tolerated. Old PIT closure is fire-and-forget; a superseded successful initial tuple closes its newly opened PIT. The freeze boundary is established after initial resolution, or restored from `options.frozenUntil`; `frozenParams` takes the earlier explicit `until` and `newCountSince` ([source](../../../../src/stores/search-store.ts#L815), 815-847).

**Type contract:** [types.ts](../../../../src/dal/types.ts#L127), 127-148, distinguishes omitted PIT from explicit `null` expiry. `createExpiryAwareSearchAfter` checks cancellation before/after the call, stops reusing a PIT cleared in state, and prevents a sibling response from resurrecting it ([source](../../../../src/stores/search-store.ts#L1416), 1416-1429). Bidirectional loads propagate either direction's explicit expiry. Not every call uses that wrapper: initial/target lookup and small-set fill call the datasource directly. Fill notices explicit expiry but does not adopt non-null refreshed PIT IDs; backward extension likewise clears expiry without publishing a refreshed non-null ID (1013-1109, 2672-2831). Initial search uses `result.pitId ?? newPitId`, which has different context from a continuation expiring its supplied PIT.

Maps have a dedicated PIT by interface contract; the store launches them with `params`, not `frozenParams` (1244-1287, 2381-2393, 2507-2519). Distribution requests also use raw params; `countBefore` has no PIT argument. Do not infer atomic consistency between first page, map, rank, histogram and future pages. The upload-time cap is not a metadata/deletion freeze and string comparison in the cap assumes the surrounding date-normalization contract. The source comment still says `lte` and idle `>5 min`; that is not authority to undo the current exclusive-date and unsupported-index-migration decisions in [AGENTS](../../../../AGENTS.md).

### C04. Preserve complete response tuples and one semantic sort

**Type/source:** [SortValues](../../../../src/dal/types.ts#L15), 15-24, is an opaque `(string | number | null)[]`, parallel to hits on `SearchAfterResult`. The store retains response tuples at actual buffer commits, including fallback first pages, target insertion, fill, seek, restore and extends. It does not universally reconstruct them from image metadata. `_loadBufferAroundImage` inserts the target between exclusive backward/forward pages and combines the matching tuples ([source](../../../../src/stores/search-store.ts#L1327), 1327-1413). An API must preserve tuple order, null shape and hit alignment, including reversed pages and any PIT-related suffix handling owned by the producer.

The store nevertheless has intentional sort knowledge for synthetic seek anchors and null-zone routing: `buildSeekCursorAnchors`, sort-clause parsing, numeric width/height exceptions, structured equality scope for a keyword bucket, and full null-prefixed `[null, uploadTime, id]` cursors (937-993, 3048-3360). The adapter owns translating reverse/null/end cursors into query behavior and remapping results. This is a shared semantic boundary, not proof the browser is ES-agnostic. Preserve the current one semantic sort plus automatic suffixes from AGENTS; do not interpret multi-field transport tuples/tests as authorization for multiple user-selected sorts.

**Unresolved:** Cache search identity, retention bounds/active anchor, persistence and fallback extraction live in [image-offset-cache.ts](../../../../src/lib/image-offset-cache.ts); exact alias/special-date/null/tiebreaker semantics live in [sort-builders.ts](../../../../src/dal/adapters/elasticsearch/sort-builders.ts) and [null-zone.ts](../../../../src/dal/null-zone.ts). Their internals were not read. Store calls prove use, not correctness of these helpers or range/history callers.

### C05. Arbitrary-position seek has several preserved routes and accepted approximations

**Source:** [seek](../../../../src/stores/search-store.ts#L2833), 2833-3829, in actual priority order:

| Route | Owning calls and returned-coordinate meaning |
|---|---|
| Near end, with deep `fetchStart` | Reverse `searchAfter(null, reverse=true, seekToEnd=true)`; uses session total minus returned length. `seekToEnd` preserves the true missing-value tail. |
| Shallow `fetchStart < DEEP_SEEK_THRESHOLD` | `searchAfter` with positive `offset`, no cursor and no PIT; exact from/size coordinate assumption. This precedes the map route. |
| Map available and target within its length | `cursorForPosition` for forward, target entry for backward; parallel calls, no rank request, combine tuples/enrichment. Exact coordinate assumption relative to map. |
| Deep null zone | `coveredCount` selects the missing-field tail. Estimate uploadTime from null-zone distribution interpolation, or unscoped uploadTime percentile if unavailable; pass full null-prefixed cursor, then `countBefore` on returned tuple. |
| Deep date/numeric | Percentile against valued coverage (clamped away from endpoints), direction-aware suffix anchors, page, then `countBefore` of landing. Width/height stay numeric despite having distribution descriptors. |
| Deep keyword | Cached bucket at `fetchStart` allows uploadTime percentile with structured `{field,value}` scope; null estimate means bucket-start anchor. Otherwise optional `findKeywordSortValue` walks vocabulary, followed by page/rank. No raw keyword-primary percentile. |
| Missing/failed keyword capability | Null keyword lookup, unavailable keyword method or no usable route falls back to from/size capped at `MAX_RESULT_WINDOW - PAGE_SIZE`; it does not promise requested deep position. |

Deep routes generally add a backward half-page after the forward/rank work, preserving headroom and merging enrichment. Composite drift near the end can trigger a true end-page fallback. Column alignment trims hits and tuples together without emptying the page. Empty/no-result seeks leave the old buffer and clear loading. Successful publication sets actual landed offset and preserves session total.

**Important qualification:** `countBefore` establishes the rank of the returned cursor; it does not move an approximate landing to the originally requested ordinal. Exact-route positioning uses the clamped target; approximate-route positioning uses current scroll geometry/headroom, and indexed mode uses the actual buffer centre rather than a possibly distant requested index (3580-3780). The store contains no SHA-1 binary-search refinement loop. No source-derived latency or smoothness claim follows from these branches. Work caps for composite walks, maps and server rank queries need their producers reviewed; bounded full-image buffer memory alone does not bound all request/metadata work.

### C06. Map and distribution absence is supported, but not semantically free

**Types:** [distribution provenance](../../../../src/dal/types.ts#L205), 205-235, distinguishes `coveredCount`, `representedCount`, `complete`, `bucketPositionKind` (`exact-rank` versus `approximate-evidence`) and `evidenceCount`. Missing buckets must not imply missing documents. Date histogram evidence is not a substitute for an exact rank/map/range contract. Optional `fetchPositionIndex` returns a complete map or null, discarding partial results and owning a separate PIT (468-488).

**Source:** The store only starts maps for its middle total range, publishes returned maps as-is, and otherwise keeps null (1244-1287). Seek preserves a map. Total range, not map readiness, governs its global target. Small sets instead fill forward from the first page; centred small-set landings run `_topUpScrollModeBuffer`, with reentrancy, total/PIT-generation, progress, step and 15-second deadline guards (1013-1224). That top-up signals `_bufferSelfCorrecting` and explicitly depends on consumer commit ordering; P10 must reconcile this with views.

Primary distributions coalesce by result-set key plus sort; null-zone distributions have separate work keyed by filters, missing primary field and uploadTime direction (665-715, 4177-4282). Search cancels both. Primary null can be cached; null-zone null remains retryable. Null-zone publication retains only buckets and coveredCount, relying on the missing-field uploadTime producer's coordinate semantics. Seek's keyword bucket lookup only trusts an actually covered bucket range; exact valued coverage is used to distinguish truncated vocabulary from nulls. The consumer's use of approximate date evidence is not verified here: [sort-context.ts](../../../../src/lib/sort-context.ts) remains a named dependency.

### C07. Focus, history hints and restoration are publication workflows

**Source:** [focus discovery](../../../../src/stores/search-store.ts#L1448), 1448-1925, and [search branching](../../../../src/stores/search-store.ts#L2321), 2321-2519:

- Search captures ordered previous neighbours, or caller-supplied visible neighbours for phantom mode. If target is absent from the first page but total is positive, it holds old results **and old total** until target/fallback publication. It does not display page zero first.
- Target lookup is `searchAfter` with an ID filter, current query/sort, no PIT, and fresh tuple. Missing target can batch-check neighbours, recursively choosing the closest survivor once; otherwise first-page fallback publishes at zero. An 8-second timeout aborts/falls back (the source has a compatibility fallback when `AbortSignal.any` is absent).
- Rank uses a map ID lookup if available, otherwise `countBefore`. With no map outside the indexed tier, count and cursor-centred load run concurrently, then align before one result publication. Rank failure may leave the hint-based coordinates; this is a fallback, not a new guarantee of universal exactness.
- Explicit versus phantom/selection-anchor retention is caller intent. Normal focus reposition uses `sortAroundFocusGeneration` without also firing seek. Phantom positioning in current code also uses that generation with `_phantomFocusImageId`, despite stale comments saying it uses `_seekGeneration`. Small-set top-up follows successful centred landings and some fallbacks.
- `seekToFocused` uses the known focus offset as a hint and clears vanished focus/pending delta if discovery did not advance its generation (2004-2022). Seek itself does not clear explicit focus.
- `restoreAroundCursor` consumes a reset-to-home suppression flag; without a cursor it delegates to approximate `seek(cachedOffset)`. With a cursor it counts, fetches the target, loads neighbours and publishes seek targets. Missing target leaves standalone behavior rather than inserting a fabricated image. `setFocus` is opt-in (3841-3978).

History callers own entry identity, anchor precedence, `frozenUntil`, viewport ratios, suppression cleanup, snapshot hints and when restore may run. Reading these options is not a full history/traversal review; D016 stays open.

### C08. Two restore inconsistencies require precise integration disposition

**Source fact, previously documented:** [restore](../../../../src/stores/search-store.ts#L3877), 3877-3908, runs `countBefore(params, cursor)` on the saved tuple concurrently with target lookup, then prefers the target's refreshed tuple for neighbours. If a sorted value changed, coordinate and neighbourhood can disagree. [AGENTS](../../../../AGENTS.md) already records this as source-only with runtime reproduction pending. Preserve that qualification; no duplicate bug campaign or stronger snapshot prerequisite is requested.

**New boundary inference supported by source:** `_loadBufferAroundImage` returns `total: forwardResult.total` ([source](../../../../src/stores/search-store.ts#L1393), 1393-1406). Restore chooses whether `_seekTargetGlobalIndex` exists using `buf.total`, but immediately publishes `total: get().total` ([source](../../../../src/stores/search-store.ts#L3919), 3919-3958). The DAL says only initial search should demand an exact total ([types](../../../../src/dal/types.ts#L73), 73-81); the API request mapper sends `countAll: !searchAfterValues` ([mapper](../../../../src/dal/grid-api-search-adapter.ts#L112), 112-122). A cursor page returning zero/untracked or subset total can therefore choose a buffer-local target for an indexed-tier session. This is a demonstrable conditional coordinate mismatch, not a reproduced UI loop or verified server response. The assigned extended tests contain no restore test. Ordinary tests and producer totals must be examined by the named integration owner before any repair decision.

### C09. Enrichment belongs to commits, not transport side effects

**Types/source:** [SearchAfterResult](../../../../src/dal/types.ts#L140), 140-148, explicitly makes enrichment optional and caller-published. The supplemental [API mapper](../../../../src/dal/grid-api-search-adapter.ts#L23), 23-79 and 178-198, flattens Argo usages/leases/collections and returns per-ID cost/validity/rights/actions/etc. without mutating the enrichment store.

Fresh first-page publication replaces the overlay; ordinary fill/extend/seek/restore and successful buffer-around-focus merge it. First-page timeout/missing-target/error fallbacks also replace it, so the comment claiming fresh search is the only `setEnrichment` path is not literally exhaustive. Forward/backward enrichment is combined and target enrichment is inserted explicitly (1359-1413); stale work must not upsert before commit. Undefined enrichment leaves the overlay untouched. AI does not follow the ordinary tuple/enrichment publication path. Overlay lifetime, later detail/satellite fetches and derived-image precedence require their own owners; this review does not infer that optional enrichment alone can serve as the failure policy for essential search data.

### C10. Preserve supporting workflows and their distinct failure behavior

**Source:** [AI search](../../../../src/stores/search-store.ts#L2159), 2159-2249, uses optional `searchByAi`; absence sets a store error. The result is sorted in memory by relevance/uploadTime, total equals loaded hits, and no PIT, paging/map fill or new-image poll is started. Anchor restoration has explicit/phantom handling; AI ticker/facet params are decorated with result IDs. `resortAiBuffer` updates in-memory positions/scroll intent (3985-4004). The interface's bounded AI result statement is a contract, not a producer inspection.

Ordinary tickers run alongside the first page; a poll uses the later of explicit `since` and `newCountSince`, current params, visibility-dependent scheduling, generation guards and additive ticker/subcount merging (717-813, 2268-2297). Tick errors are ignored. The implementation does not advance `newCountSince` each poll; assessing deduplication/additive semantics belongs with the count producer, not an assumption from the explanatory comment.

Facets are keyed by result membership, excluding sort/pagination; aggregate params are frozen and AI-decorated. Debounced/immediate/force modes, circuit breaking, IS filters and parent-image usage counts are part of this API surface (4006-4117). Arbitrary `has:` targets are isolated one-field calls so one bad field does not kill the main batch. Expanded fields use their own cache/loading state/controller and larger request size (4119-4175).

Failure semantics are not uniform null-on-error throughout this store: core search/extends/seek set errors; focus/restore catch and fall back; maps/distributions/fill may warn and retain absence/partial data; aggregations and tickers are mostly silent; AI may toast on 503. This is in tension with an unqualified reading of the graceful-optional-API directive. The coordinator must distinguish essential search refusal/failure from optional enrichment absence, rather than silently applying a catch-all null policy to every future endpoint.

### C11. The full interface includes consumers not owned by this store

**Type contract:** [ImageDataSource](../../../../src/dal/types.ts#L259), 259-530, has 18 methods, five optional. Store calls cover seven required methods (`searchAfter`, `openPit`, `closePit`, `countBefore`, `estimateSortValue`, `countWithTickers`, `getAggregations`) and the five optional methods. The other six remain real migration inputs, not unused merely because this store does not call them:

| Method | Required retained contract from types, not verified implementation |
|---|---|
| `searchRange` | Additive loads must not cancel each other; optional caller signal. |
| `count` | Matching-document count without hits. |
| `getById` | Undefined when missing. |
| `getAggregation` | Single-field terms result for filter consumers. |
| `getByIds` | Batched parallel hydration, silently missing IDs, no input-order guarantee. |
| `getIdRange` | `(fromCursor, toCursor]` in sort order; caller orders endpoints, or swaps/retries if `walked === 0`; 5,000-ID hard-cap contract, with `truncated` true only if an additional in-range document exists beyond cap. |

`SearchParams` also carries the full ordinary/CQL/date/rights/crops/syndication/persistence/ID/uploader/AI filter surface and pinboard pass-through fields, not just query and sort (26-82). Mapping each to an endpoint or intentionally unused/pass-through disposition remains necessary. `getIdRange` is not governed by the store's main PIT signature. Selection construction, cache/anchor behavior and range producer cancellation cannot be certified by reading this interface. Keep D017 and the selection/range ownership open.

### C12. Current dispatch, refusal and transport adaptation have explicit exceptions

**Supplemental source:** [factory](../../../../src/dal/index.ts#L30), 30-41, constructs ES and optionally wraps it. [StranglerAdapter](../../../../src/dal/strangler-adapter.ts#L17), 17-85, binds optional methods to ES and delegates every required method except `searchAfter` unchanged. Its `searchAfter` sends positive-offset, no-cursor/no-PIT/non-reverse/non-end requests directly to ES. Otherwise API succeeds, explicit PIT-expired with a supplied PIT retries API once without PIT and returns `pitId: null`, classified unavailable falls back to ES, and refused is thrown. The retry is not an unbounded recovery loop.

[API classifier](../../../../src/dal/grid-api-search-adapter.ts#L81), 81-198: fetch/body-read TypeError can mean unavailable; explicit `410` plus `search-after-pit-expired` is expiry; bare/unparseable-body 502/504 without `Retry-After` is unavailable; other non-OK responses are refused. Cancellation is checked throughout. The returned mapper uses `json.pitId ?? null`, collapsing wire omission to null. `countAll` depends on cursor absence, not `trackTotalHits`, so end/ID lookup calls can differ from the interface's initial-only counting hint.

The mapper sends client-built sort clauses plus `orderBy`, injects default-hide query terms, maps crops to exports/free/rights booleans and forwards six date bounds, IDs, uploader and syndication status. It explicitly omits `payType`; it also does not serialize every SearchParams field (notably `persisted`/`dateField` have no body assignment here). Server interpretation, existing caller expectations and intentional dispositions are unread dependencies, not automatically new defects in the completed amendment batch.

**Caller-boundary finding:** [restore catch](../../../../src/stores/search-store.ts#L3967), 3967-3977, treats any non-AbortError as grounds for `seek(cachedOffset)`. If target lookup or neighbour paging was refused and that seek is shallow with positive offset, C05/C12 take the direct-ES route. Thus the adapter's no-fallback-on-refusal rule is not by itself an end-to-end store guarantee. No live authorization bypass is alleged; direct-ES development is supported. The integration/auth owners must explicitly disposition this generic recovery path for API-only refusal behavior. No product fix is authorized here.

### C13. Assigned assertions read: what they do and do not establish

**Test-source assertions, not executed evidence:** [search-store-extended.test.ts](../../../../src/stores/search-store-extended.test.ts), full 1-1480:

| Lines | Assertion surface examined |
|---|---|
| 1-108 | Mock setup, polling/wait helpers, position and focus consistency helpers; shared store/module state is not a live server. |
| 110-225 | Sort-context labels and interpolation, including unavailable labels and empty totals. |
| 231-399 | Search resets, seek/extend chains, explicit focus persistence and seek generation/target bounds. |
| 405-521 | Focus lookup/generations and a gated count proving old-buffer retention until aligned publication in the mock. |
| 527-631 | Buffer-local density ratio arithmetic and sort-clause/reversal expectations; not mounted view execution or multi-user-sort support. |
| 639-764 | Cursor identity/non-null eviction guards and larger mock consistency. The test titled "100 random positions" actually uses five fixed plus fifteen random positions. |
| 770-813 | Mock request counters. The outside-first-page title says at most five, but the assertion is at most six; comments about immediate polling are not current call-path evidence. |
| 819-1019 | Sparse descending missing-field seek/extend, full tuple shape, missing source field and stable session total. |
| 1021-1079 | Ascending valued/null regions with mock drift tolerance, not exact arbitrary-ordinal landing. |
| 1085-1320 | Short backward pages, settled/mid-flight resize, table geometry and repeated resize/extend no-compounding assertions. |
| 1327-1389 | Subscription-based intermediate offset alignment across focus/top-up, not just final offset zero. |
| 1397-1480 | All-null and mixed null-zone boundary/tick assertions. |

These do not execute real ES, verify media-api refusal/expiry, prove production latency, or close restore/history/range/cancellation coverage in unassigned tests. In particular the assigned file has no `restoreAroundCursor` assertions. Ordinary [search-store.test.ts](../../../../src/stores/search-store.test.ts), adapter tests, mock implementation and E2E/performance records were not semantically read here. A mock route that supplies a map may not exercise the deep fallback implied by a test comment; producer/config review is required before crediting exact route coverage.

### C14. Reconcile the architecture guide, do not inherit its stale guarantees

**Documentation read in full:** [03-scroll-architecture.md](../../00%20Architecture%20and%20philosophy/03-scroll-architecture.md). Its purpose, bounded-window rationale and total-derived coordinate split remain useful (14-33, 180-210). The following claims need coordinator-owned routing/correction, not silent promotion to current behavior:

| Guide location | Source reconciliation |
|---|---|
| 281-301, first page visible then focus jump | Current search deliberately withholds first page/total when target is elsewhere; C07 and test 485-521. |
| 507-511, 598-599, 640-666, SHA-1 refinement | No such refinement exists anywhere in the fully read store seek. Current keyword landing is accepted after rank; producer/helper ownership may explain historical text but cannot make it a current store branch. |
| 559-580, map before shallow | Current branch order is near-end-with-deep-guard, shallow, then map (2914-2940). |
| 471-480, 629-633, count correction hides target error | Rank tells the actual landing; it does not guarantee the requested neighbourhood. No stronger exactness requirement follows. |
| 527-541, all 404/410 fallback / single-request loss | Actual media-api recovery requires a specific error key; explicit expiry clears stored PIT. Map has a separate PIT and first page is PIT-less. |
| 432-455, 625-626, 668-691, 841, latency/O(1) claims | Request counts are not server computational complexity or current timings. Rank/percentile producers are unread. Timing/zero-shift passages are historical claims, not new measurements or an API capacity guarantee. |
| 757-799, all histogram buckets as cumulative rank | Must be qualified by current distribution provenance (`approximate-evidence`, exact valued coverage versus represented buckets), and consumer review. |

The guide's "clear buffer" prose is also not literal initial state mutation for current seek: loading begins while old results remain until replacement. Its file sizes are historical. No code/design changes were made. Existing recorded performance remains evidence; not reading canonical campaigns here does not mean the core was unmeasured.

## 3. Complete coverage receipt

Ranges are inclusive, 1-based. SHA-256 is content identity, not verification. All assigned source/doc/test fingerprints matched the packet before reading and the post-read check. Supplemental factory/strangler hashes were captured after their initial bounded read and rechecked with final validation; no pre-read fingerprint is claimed for those two. API mapper fingerprint was captured before its full read. Administrative inputs were read in full and fingerprinted, with no application coverage requested for them.

| Input (repository-relative) | SHA-256 | Actual reading and unread scope |
|---|---|---|
| [kupua/src/stores/search-store.ts](../../../../src/stores/search-store.ts) | `f1e85ce469d9aaa54f365f950a273aecfc4ebb22ef6dbcd63ddfb105b540b872` | Full 1-4312, chunks 1-420, 421-840, 841-1260, 1261-1680, 1681-2100, 2101-2520, 2521-2940, 2941-3360, 3361-3780, 3781-4312. No unread assigned lines. |
| [kupua/src/stores/search-store-extended.test.ts](../../../../src/stores/search-store-extended.test.ts) | `2e0c20ac13c5ed932730f9c3df7107395bb3e0da6cb8c9c085be176d356a0b49` | Full 1-1480, chunks 1-380, 381-760, 761-1140, 1141-1480. Assertions read, not run. No unread assigned lines. |
| [kupua/src/dal/types.ts](../../../../src/dal/types.ts) | `eee76d90dd39062b25aa85de9f27df1fdd777093c4ea13ef4893d2d8680c809d` | Full 1-530, chunks 1-280, 281-530. No unread assigned lines. |
| [kupua/exploration/docs/00 Architecture and philosophy/03-scroll-architecture.md](../../00%20Architecture%20and%20philosophy/03-scroll-architecture.md) | `5473632883f103c5f8d063eb72e3bf1f7095562315547d1d8adc7f8d8f700b43` | Full 1-857, chunks 1-300, 301-590, 591-857. No unread assigned lines; current/historical claims separated in C14. |
| [kupua/src/dal/index.ts](../../../../src/dal/index.ts) | `4c9b5395ad937e15f08a8f29c12cfb3be060a6157fbb2b17a37e72d74f768b0a` | Supplemental full 1-41: factory/export dispatch only. |
| [kupua/src/dal/strangler-adapter.ts](../../../../src/dal/strangler-adapter.ts) | `530547cf2430d174e84693b3a705a18e5dbee1edd1bb8e90a692cbb0963fa7f3` | Supplemental full 1-85: delegation and recovery control flow. |
| [kupua/src/dal/grid-api-search-adapter.ts](../../../../src/dal/grid-api-search-adapter.ts) | `05e675e63ce4a50a94f010d09a2f0e2861274bc04e56584ccc2d52451b05bbeb` | Supplemental full 1-198: request mapping, error classification, response/enrichment mapping. Does not verify server implementation. |

Administrative context, excluded from application reading totals:

| Input | SHA-256 | Scope read |
|---|---|---|
| [.github/copilot-instructions.md](../../../../../.github/copilot-instructions.md) | `765de30857a0cc81cff1219d8fad37b4971ccab88c97d2b127f85326eee261c7` | Full 1-154; explicit temporary delegated authority. |
| [kupua/AGENTS.md](../../../../AGENTS.md) | `6698c871e00ea4a9227db9848830f65eb68c38cc62b653c4d4bb6fe6dae6b4a6` | Full 1-226; current scope, routing, accepted limitations and known restore issue. No handoff-named path was referenced here. |
| [worklog-current.md](../../worklog-current.md) | `88a5797e85afb50d12e3152d42fc3776d5914cf2f38b4241c3131181924a7a17` | Full 1-35 at intake; coordinator-owned, no check-in/edit/reset. |
| [protocol 05](api-boundary-05-review-protocol.md) | `4f667461beba9f77e3c659fcc91760bae888f7f4d1c5378079399c836651eaa4` | Full 1-250. |
| [prompt 08](api-boundary-08-review-prompt.md) | `b31cc5769ca2df52b6ff690aec983c33a51d55ca7e77f6f7ac6933ad39ec17bf` | Full 1-152. |

Structured administrative inspection: [coverage register](api-boundary-06-coverage.json) P09 packet projection including four file hashes/status/receipts; `/baseline`; root keys; one existing receipt object to check vocabulary; `/dependencies` filtered by IDs D016-D018. [Evidence register](api-boundary-07-evidence.json): `/claims/0` and `/claims/1` object shapes, plus all claims' `id`, `kind`, `status` fields. An initial broader projection exceeded tool output and was not credited as reading its hidden contents. Registers deliberately have no self-referential application fingerprints. Register baseline reported `0e79a4dec637e3eaf05bb252c2ec7f95e8e68c8d`; no independent Git HEAD/worktree examination was performed. Memory guidance was consulted through the memory tool, not treated as fingerprinted source evidence.

**Unread:** all unassigned internals, including ordinary store tests, mock datasource, direct ES producer, position-map helper, sort/query/null/rank/distribution/range producers, cache/history/orchestration, constants/configuration, view/hooks/traversal, selection/collection/enrichment/AI producers, Scala/auth/models/mappings and canonical performance data. No P10 report or draft was read or relied on. The report's links to these files identify dependencies, not reading credit. No split of assigned work is necessary; producer/consumer follow-ups are separate semantic units, not hidden unfinished store ranges.

## 4. Evidence dispositions and proposed claims

Retain E001-E008 unchanged with their existing qualifications. P09 did not independently verify their original sources or measurement interpretations. No newly measured timing, smoothness, capacity or correctness claim is proposed. The coordinator assigns any new E IDs and independently checks decisive originals.

The following proposed objects use existing `packetId/kind/status/statement/scope/limits/sources` fields and omit IDs deliberately. Test reading uses `kind: source` with an explicit assertion-only scope, not executed-test evidence. Their `supported` status is confined to the stated source facts or qualified inferences, never whole-file verification.

```json
[
  {
    "packetId": "P09", "kind": "source", "status": "supported",
    "statement": "The store owns cancellation identities, atomic buffer/coordinate publication and stable session totals; paging totals do not replace the initial total.",
    "scope": "C01-C03: ordinary search, fill, extensions, seek and publication in the fully read store.",
    "limits": ["View consumers and producer cancellation implementations remain unresolved.", "PIT-less first page, separate map PIT and upload-time cap do not form a universal snapshot."],
    "sources": [
      {"path": "kupua/src/stores/search-store.ts", "sha256": "f1e85ce469d9aaa54f365f950a273aecfc4ebb22ef6dbcd63ddfb105b540b872", "lines": [2024, 2521]},
      {"path": "kupua/src/stores/search-store.ts", "sha256": "f1e85ce469d9aaa54f365f950a273aecfc4ebb22ef6dbcd63ddfb105b540b872", "lines": [2538, 2831]},
      {"path": "kupua/src/stores/search-store.ts", "sha256": "f1e85ce469d9aaa54f365f950a273aecfc4ebb22ef6dbcd63ddfb105b540b872", "lines": [3721, 3780]}
    ]
  },
  {
    "packetId": "P09", "kind": "source", "status": "supported",
    "statement": "Seek selects end, shallow, map or approximate deep routes, ranks the actual landing, preserves backward headroom, and can cap fallback offset rather than reach the requested deep ordinal.",
    "scope": "C04-C06: complete seek control flow, not timing or server computational cost.",
    "limits": ["No current store SHA-1 refinement loop.", "Exact ranks are producer contracts, not independently verified queries.", "Accepted approximate landing is not to be upgraded silently."],
    "sources": [
      {"path": "kupua/src/stores/search-store.ts", "sha256": "f1e85ce469d9aaa54f365f950a273aecfc4ebb22ef6dbcd63ddfb105b540b872", "lines": [2833, 3780]}
    ]
  },
  {
    "packetId": "P09", "kind": "source", "status": "supported",
    "statement": "The client contract distinguishes opaque per-hit tuples, explicit PIT expiry, distribution provenance, optional complete maps, and an exclusive/inclusive capped range walk with caller-owned endpoint order.",
    "scope": "C03-C06 and C11: types and the store's distribution publication; not range/map implementation verification.",
    "limits": ["Optional methods cannot be dropped without assessing the workflows they currently support.", "Approximate histogram evidence does not establish exact rank.", "Selection/range callers are unread."],
    "sources": [
      {"path": "kupua/src/dal/types.ts", "sha256": "eee76d90dd39062b25aa85de9f27df1fdd777093c4ea13ef4893d2d8680c809d", "lines": [15, 24]},
      {"path": "kupua/src/dal/types.ts", "sha256": "eee76d90dd39062b25aa85de9f27df1fdd777093c4ea13ef4893d2d8680c809d", "lines": [127, 148]},
      {"path": "kupua/src/dal/types.ts", "sha256": "eee76d90dd39062b25aa85de9f27df1fdd777093c4ea13ef4893d2d8680c809d", "lines": [205, 530]},
      {"path": "kupua/src/stores/search-store.ts", "sha256": "f1e85ce469d9aaa54f365f950a273aecfc4ebb22ef6dbcd63ddfb105b540b872", "lines": [4177, 4282]}
    ]
  },
  {
    "packetId": "P09", "kind": "source", "status": "supported",
    "statement": "Focus replacement holds the prior buffer and total until target/fallback publication, retains response tuples and commits enrichment for target plus both directions; phantom and explicit intent have distinct state but use the focus generation.",
    "scope": "C04, C07, C09: owning store paths and mapper return shape.",
    "limits": ["History, selection-anchor precedence, cache retention bounds and overlay consumers are not verified.", "Rank failure and timeout preserve existing fallbacks, not stronger exactness."],
    "sources": [
      {"path": "kupua/src/stores/search-store.ts", "sha256": "f1e85ce469d9aaa54f365f950a273aecfc4ebb22ef6dbcd63ddfb105b540b872", "lines": [1327, 1925]},
      {"path": "kupua/src/stores/search-store.ts", "sha256": "f1e85ce469d9aaa54f365f950a273aecfc4ebb22ef6dbcd63ddfb105b540b872", "lines": [2321, 2478]},
      {"path": "kupua/src/dal/grid-api-search-adapter.ts", "sha256": "05e675e63ce4a50a94f010d09a2f0e2861274bc04e56584ccc2d52451b05bbeb", "lines": [178, 198]}
    ]
  },
  {
    "packetId": "P09", "kind": "inference", "status": "supported",
    "statement": "Restore can select a buffer-local seek target for an indexed-tier session when its cursor page total is zero/untracked or subset-sized, because target-tier selection uses the page total while publication preserves the session total.",
    "scope": "C08 conditional producer/caller mismatch; source-only, no reproduced runtime symptom.",
    "limits": ["Requires producer total and ordinary restore-test integration.", "No fix or new experiment authorized.", "The assigned extended tests do not cover restore."],
    "sources": [
      {"path": "kupua/src/stores/search-store.ts", "sha256": "f1e85ce469d9aaa54f365f950a273aecfc4ebb22ef6dbcd63ddfb105b540b872", "lines": [1393, 1406]},
      {"path": "kupua/src/stores/search-store.ts", "sha256": "f1e85ce469d9aaa54f365f950a273aecfc4ebb22ef6dbcd63ddfb105b540b872", "lines": [3919, 3958]},
      {"path": "kupua/src/dal/types.ts", "sha256": "eee76d90dd39062b25aa85de9f27df1fdd777093c4ea13ef4893d2d8680c809d", "lines": [73, 81]},
      {"path": "kupua/src/dal/grid-api-search-adapter.ts", "sha256": "05e675e63ce4a50a94f010d09a2f0e2861274bc04e56584ccc2d52451b05bbeb", "lines": [112, 122]}
    ]
  },
  {
    "packetId": "P09", "kind": "source", "status": "supported",
    "statement": "Restore ranks the saved cursor while loading neighbours around a refreshed target tuple when available, so changed sorted metadata remains an unresolved coordinate-consistency boundary.",
    "scope": "C08; retain the existing AGENTS source-only known-issue disposition rather than duplicate it as a new observed failure.",
    "limits": ["No runtime reproduction or stronger snapshot requirement.", "Cache/history producer and consumer work remains open."],
    "sources": [
      {"path": "kupua/src/stores/search-store.ts", "sha256": "f1e85ce469d9aaa54f365f950a273aecfc4ebb22ef6dbcd63ddfb105b540b872", "lines": [3877, 3908]}
    ]
  },
  {
    "packetId": "P09", "kind": "source", "status": "supported",
    "statement": "AI, ticker, facet and expanded-aggregation workflows have distinct identity, parameter decoration, cancellation and failure contracts beyond cursor paging.",
    "scope": "C02 and C10: store calls, branches and results only.",
    "limits": ["AI/count/aggregation implementations and UI error handling are unread.", "Expanded facets depend on producer cancellation rejection rather than a post-await identity guard.", "Optional API absence is not a verified universal core-search policy."],
    "sources": [
      {"path": "kupua/src/stores/search-store.ts", "sha256": "f1e85ce469d9aaa54f365f950a273aecfc4ebb22ef6dbcd63ddfb105b540b872", "lines": [665, 847]},
      {"path": "kupua/src/stores/search-store.ts", "sha256": "f1e85ce469d9aaa54f365f950a273aecfc4ebb22ef6dbcd63ddfb105b540b872", "lines": [2159, 2297]},
      {"path": "kupua/src/stores/search-store.ts", "sha256": "f1e85ce469d9aaa54f365f950a273aecfc4ebb22ef6dbcd63ddfb105b540b872", "lines": [3985, 4175]}
    ]
  },
  {
    "packetId": "P09", "kind": "source", "status": "supported",
    "statement": "Hybrid dispatch delegates non-searchAfter methods to ES, bypasses API for shallow positive offsets, retries explicit expiry once without PIT, and permits ES fallback only for classified unavailability at the adapter boundary.",
    "scope": "C12 supplemental full dispatch/error/request mapping reads.",
    "limits": ["Does not certify all parameter/server semantics or all external constructors.", "API-only target and transitional hybrid support are distinct.", "No D3 readiness reassessment."],
    "sources": [
      {"path": "kupua/src/dal/index.ts", "sha256": "4c9b5395ad937e15f08a8f29c12cfb3be060a6157fbb2b17a37e72d74f768b0a", "lines": [30, 41]},
      {"path": "kupua/src/dal/strangler-adapter.ts", "sha256": "530547cf2430d174e84693b3a705a18e5dbee1edd1bb8e90a692cbb0963fa7f3", "lines": [17, 85]},
      {"path": "kupua/src/dal/grid-api-search-adapter.ts", "sha256": "05e675e63ce4a50a94f010d09a2f0e2861274bc04e56584ccc2d52451b05bbeb", "lines": [81, 198]}
    ]
  },
  {
    "packetId": "P09", "kind": "inference", "status": "supported",
    "statement": "Adapter-level refusal preservation is not an end-to-end restore guarantee: generic non-abort restore recovery can call shallow seek and therefore direct ES after a refused API request.",
    "scope": "C12 conditional cross-call source trace in supported hybrid mode.",
    "limits": ["No live authorization bypass or exploit is claimed.", "Coordinator/auth owners must disposition API-only behavior; no autonomous fix.", "The completed D3 batch is not reopened."],
    "sources": [
      {"path": "kupua/src/stores/search-store.ts", "sha256": "f1e85ce469d9aaa54f365f950a273aecfc4ebb22ef6dbcd63ddfb105b540b872", "lines": [3967, 3977]},
      {"path": "kupua/src/stores/search-store.ts", "sha256": "f1e85ce469d9aaa54f365f950a273aecfc4ebb22ef6dbcd63ddfb105b540b872", "lines": [2928, 2940]},
      {"path": "kupua/src/dal/strangler-adapter.ts", "sha256": "530547cf2430d174e84693b3a705a18e5dbee1edd1bb8e90a692cbb0963fa7f3", "lines": [55, 83]}
    ]
  },
  {
    "packetId": "P09", "kind": "source", "status": "supported",
    "statement": "The assigned extended test file asserts mock buffer/cursor/focus/total/alignment behavior, including old-buffer retention until rank resolves; it does not assert restoreAroundCursor behavior or execute real producers.",
    "scope": "C13 full test-source reading, 1-1480; no tests executed.",
    "limits": ["No claim about unassigned ordinary tests or current suite status.", "Mock setup, loose assertions and route eligibility limit behavioral conclusions.", "Test titles are not exact coverage counts."],
    "sources": [
      {"path": "kupua/src/stores/search-store-extended.test.ts", "sha256": "2e0c20ac13c5ed932730f9c3df7107395bb3e0da6cb8c9c085be176d356a0b49", "lines": [1, 1480]}
    ]
  },
  {
    "packetId": "P09", "kind": "source", "status": "supported",
    "statement": "The architecture guide mixes useful total-derived tier design with stale store descriptions of visible first-page focus transitions, SHA-1 refinement, branch ordering and broad PIT fallback.",
    "scope": "C14 reconciles the fully read guide against current assigned source and bounded adapter reads.",
    "limits": ["Historical timing and zero-shift passages are not independently checked measurements.", "No new campaign or plan replacement is proposed."],
    "sources": [
      {"path": "kupua/exploration/docs/00 Architecture and philosophy/03-scroll-architecture.md", "sha256": "5473632883f103c5f8d063eb72e3bf1f7095562315547d1d8adc7f8d8f700b43", "lines": [180, 210]},
      {"path": "kupua/exploration/docs/00 Architecture and philosophy/03-scroll-architecture.md", "sha256": "5473632883f103c5f8d063eb72e3bf1f7095562315547d1d8adc7f8d8f700b43", "lines": [281, 301]},
      {"path": "kupua/exploration/docs/00 Architecture and philosophy/03-scroll-architecture.md", "sha256": "5473632883f103c5f8d063eb72e3bf1f7095562315547d1d8adc7f8d8f700b43", "lines": [432, 691]},
      {"path": "kupua/src/stores/search-store.ts", "sha256": "f1e85ce469d9aaa54f365f950a273aecfc4ebb22ef6dbcd63ddfb105b540b872", "lines": [2321, 2380]},
      {"path": "kupua/src/stores/search-store.ts", "sha256": "f1e85ce469d9aaa54f365f950a273aecfc4ebb22ef6dbcd63ddfb105b540b872", "lines": [2914, 3475]}
    ]
  }
]
```

## 5. Exact integration and dependency requests

**Coordinator-only register integration:** accept P09 only after checking the decisive originals and current hashes. For each of the seven file rows in section 3, append a P09 receipt using existing `method: "full-text"`, that row's SHA-256 and a note identifying full inclusive range and source/doc/assertion scope; request reading status `read`, never `verified`. Four rows are assigned, three supplemental. Preserve existing receipts and any later staleness. Do not turn administrative hashes or register projections into application coverage. Integrate/merge the proposed evidence objects without duplicating existing claims and allocate E IDs centrally. Retain E001-E008 and D016-D018 open. No global coverage/synthesis claim follows.

| Request | Exact deciding question and original boundary | Named intended owner |
|---|---|---|
| R1, extend D016 | Do the C01/C07 generations and local/global/sub-row targets compose with `useDataWindow`/`useScrollEffects`, including map-pending state, top-up `_bufferSelfCorrecting`, density/selection-anchor changes and stale work? Reconcile C08's `buf.total` tier choice against ordinary restore assertions and the actual consumer. | Coordinator's core integration reviewer after P09 and P10; P10 owns view/hooks original reads, not a request to read its draft here. |
| R2, POSITION producer follow-up | Do `searchAfter`, `countBefore`, maps, null-zone helpers, query/sort builders and distributions use the same one-sort/filter/null semantics, tuple suffixes and date boundaries? What exact totals/caps/cancellation results do they produce, and what makes approximate-evidence distinct from ranks? Resolve C03/C05/C06/C08, including dedicated PIT/map and raw-versus-frozen params. | Coordinator's POSITION/DAL producer reviewer; direct [es-adapter.ts](../../../../src/dal/es-adapter.ts), [position-map.ts](../../../../src/dal/position-map.ts), [sort-builders.ts](../../../../src/dal/adapters/elasticsearch/sort-builders.ts), [null-zone.ts](../../../../src/dal/null-zone.ts), [sort-context.ts](../../../../src/lib/sort-context.ts), their imports and existing tests. |
| R3, HISTORY/TRAVERSAL | Who supplies and validates saved tuple/search key/offset/frozenUntil, anchor precedence and suppression cleanup? How are changed sorted metadata, missing targets, explicit/phantom focus and detail entry identities dispositioned under accepted live-consistency scope? Preserve C08's existing known-issue status. | Coordinator's HISTORY/TRAVERSAL reviewer; [image-offset-cache.ts](../../../../src/lib/image-offset-cache.ts), [useUrlSearchSync.ts](../../../../src/hooks/useUrlSearchSync.ts), [useReturnFromDetail.ts](../../../../src/hooks/useReturnFromDetail.ts), [useImageTraversal.ts](../../../../src/hooks/useImageTraversal.ts), [reset-to-home.ts](../../../../src/lib/reset-to-home.ts), snapshot producers/callers and ordinary store tests. |
| R4, extend D017/D018 | Does refusal remain terminal across **caller** recovery, specifically restore catch -> shallow seek -> ES bypass, and how should optional absence versus essential search refusal be represented in eventual API-only mode? What cancellation/error shapes do direct ES and server clients actually return? | Coordinator's DAL/shared-caller integration reviewer with Grid auth/query owner. Disposition C02/C10/C12 from originals; do not infer D3 endpoint failure or authorize fixes. |
| R5, parameter parity | For every SearchParams member, is it serialized, compiled through CQL, deliberately omitted, or handled by another workflow? Resolve `countAll` versus `trackTotalHits`, `persisted`, `dateField`, documented payType omission, default-hide parsing and wire PIT omission without changing one-sort/current date scope. | Coordinator's Grid query/shared-caller contract reviewer with DAL mapper owner; server endpoint/parser and existing contract tests, plus current active [media-api index](media-api-00-index.md). |
| R6, extend D017 | Which selection/collection/detail constructors bypass the factory, and who owns `getByIds`, `getIdRange` endpoint ordering/retry/truncation, retained range anchor tuples and actual useful limits? Trace all six methods not called by this store before declaring complete API wiring. | Coordinator's selection/collection/enrichment owners plus DAL/shared-caller integration reviewer; [selection-store.ts](../../../../src/stores/selection-store.ts), [collection-store.ts](../../../../src/stores/collection-store.ts), [useRangeSelection.ts](../../../../src/hooks/useRangeSelection.ts), their producers/tests. |
| R7, supporting workflows | How do AI result scoping, in-memory reorder, ticker additive deltas/frozen boundary and independent/expanded/dynamic facets compose with server filtering and absence? Are mock request counts faithful to actual calls? What are overlay lifetime and producer commit/cancellation assumptions? | Coordinator's AI/facets/ticker/enrichment reviewers, with [ai-search-params.ts](../../../../src/lib/ai-search-params.ts), [safe-aggregation.ts](../../../../src/lib/safe-aggregation.ts), [enrichment-store.ts](../../../../src/stores/enrichment-store.ts), actual DAL producers and neighboring tests. |
| R8, source assertions and configuration | Which ordinary store/adapter tests cover C02/C03/C08/C12 and mock total/PIT/cancellation shapes? Confirm actual constant defaults/overrides and route eligibility rather than treating test names/doc timings as proof. Source reading only in this mandate. | Coordinator's core test/config reviewer; [search-store.test.ts](../../../../src/stores/search-store.test.ts), [mock-data-source.ts](../../../../src/dal/mock-data-source.ts), [tuning.ts](../../../../src/constants/tuning.ts), applicable test/config files and adapter assertions. |
| R9, document reconciliation | Record C14's current-source corrections and C03/C07/C09 comment drift in owning documentation/routing only when coordinator-authorized. Retain useful historical evidence and link canonical performance interpretations; do not copy timings into a new API promise. | Coordinator's documentation/integration owner; no delegate edits or new measurement request. |

These are integration questions, not new packet allocations, product repairs, experiments or a global candidate. Dependency ownership must remain explicit even if P09 itself is accepted.

## 6. Checks and limits

- Read-only packet command executed: `node kupua/exploration/experiments/api-boundary/api-boundary-review.mjs packet P09`; four assignments/hashes and ready status matched the delegation. The designated report did not exist before this write.
- Full bounded file reads above; targeted text searches only located citations after reading, not substitutes for assigned content. Structured Node projections inspected vocabulary/baseline/selected dependency objects; hashing/line counting conferred no reading credit.
- Initial and post-read SHA-256 checks matched for all four assigned files and administrative inputs checked at both points. Supplemental fingerprints are reported with their actual capture timing. Report-only Node validation passed: six sections, 11 proposed claim objects, 31 source ranges, 75 local links and 12 unchanged receipt hashes. Its first attempt over-trimmed trailing blank lines when counting source lines; correcting the command's physical-line counter resolved that check failure without a source or tooling edit. This validation does not certify semantic correctness.
- Read-only `node kupua/exploration/experiments/api-boundary/api-boundary-review.mjs check` returned no errors, two stale-inventory warnings (the human directive copy and changelog), and `readyForSynthesis: false`. Its current bookkeeping was 1,795 entries, 1,568 required, 206 pending, 21 excluded; 46 read, four partial, two stale; 1,507 unassigned and 20 open dependencies. P09 remained ready, not integrated/accepted. These counts are administrative state, not this delegate's coverage. Scoped editor diagnostics reported no errors in this report.
- No test, build, performance or network command was run. Assertions and guide performance passages were read only. Existing performance evidence retains its topology/version/cache/scenario limitations; no new latency or smoothness inference is made and no campaign is proposed.
- Only this report was written by this delegate via `apply_patch`. Registers, worklog, AGENTS, changelog, prior plans/reports and product/tooling files were not changed. No Git command or mutation was performed. No real image identities, emails, credentials, signed URLs or raw runtime bodies were copied into the report.
- Full assigned reading is complete, but corpus coverage, producer/consumer correctness, authorization, production load, and D016-D018 remain open. This report stops at the assigned boundary.