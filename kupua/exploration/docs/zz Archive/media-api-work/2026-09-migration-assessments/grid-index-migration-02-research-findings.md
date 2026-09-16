# Grid index migration: PIT research findings

> **Archived, 15 September 2026: reference, not approved implementation.** Findings below
> concern stronger migration requirements than the current prototype scope. Recommendations,
> blockers and checklists are historical, not prerequisites for additive API work.
> Current scope: [media-api index](../../../03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/media-api-00-index.md).

**Date:** 2026-09-13  
**Mode:** Read-only architecture decision; no product code or tests changed or run.  
**Citation rule:** Factual claims are labelled **Proven**, **Inferred**, **Measurement-needed**, or **Unknown** and carry source citations. Proposed contract and test requirements are normative, not claims about current behavior.

## 0. Premise challenge

The premise is valid; do not halt this research.

**Proven.** Kupua currently starts a direct-ES PIT open and a non-PIT first-page search in parallel. In Strangler mode, only `searchAfter` crosses media-api; PIT open/close still use direct ES. TEST startup resolves `Images_Current` to one physical index for Kupua, while media-api's non-PIT `prepareSearch` can search current plus migration or migration alone. Therefore page one and continuation can occupy different physical and logical coordinate spaces during a migration (`kupua/src/stores/search-store.ts:2196-2251`; `kupua/src/dal/strangler-adapter.ts:25-67`; `kupua/scripts/start.sh:414-462`; `media-api/app/lib/elasticsearch/ElasticSearch.scala:699-710`).

**Proven.** Two physical documents with one logical image ID can coexist. Backfill inserts the migration copy and only then marks current; projection upsert writes current alone and deliberately removes the marker by replacing the source. A multi-index snapshot can consequently capture both copies before the marker or after its reset (`thrall/app/lib/kinesis/MessageProcessor.scala:70-82,85-123`). D3 removes PIT's implicit `_shard_doc`, while the public tuple ends in logical `id`; duplicate physical copies can therefore have the same public tuple (`media-api/app/lib/elasticsearch/ElasticSearch.scala:847-885`; `kupua/exploration/docs/zz Archive/media-api-work/phase-3-d3-searchafter-post-pr-review.md:108-143`; [Elasticsearch 8.18 pagination](https://www.elastic.co/guide/en/elasticsearch/reference/8.18/paginate-search-results.html)).

**Conclusion — Proven.** D8 is a real correctness problem, and the current raw-`pitId` D3 review cannot proceed as though D8 were an internal implementation detail.

## 1. Decision card

### Recommendation

**Recommended architecture — Inferred (high confidence): a blue-green single-target read epoch, combined first page, and a shared opaque snapshot session.**

1. Introduce one logical read alias that always targets exactly one physical index. It remains on pre-migration current C through `InProgress` and `Paused`, then moves to M only at a guarded read cutover. All user-facing search and ID-read paths, including `prepareSearch`, `migrationAwareGetter`, D3, D9 and direct fallback, must use the same epoch. This deliberately replaces today's progressive per-image rule, where marked IDs read projected M while unmarked IDs read C (`media-api/app/lib/elasticsearch/ElasticSearch.scala:95-149,699-710`; `../../../03 Ce n'est pas une pipe dream/media-api-work/media-api-02-next-endpoints-d7-d8-d9-workplan.md:338-340`). The cost is that regenerated M projections are not user-visible until the whole-index read cutover; the benefit is one authoritative document per logical ID and one deterministic query coordinate space.
2. Today's `CompletionPreview` remains an explicitly diagnostic M-only surface. Moving the canonical read alias requires a real `CutoverReady` barrier: migration work drained, unresolved failures handled, current-only projection work reconciled, C deletions/tombstones reconciled so M-only orphans cannot reappear, writes fenced or made mandatory on M, and the alias switch performed and verified atomically. Existing preview establishes none of those conditions (`thrall/app/lib/elasticsearch/ThrallMigrationClient.scala:60-75,93-118`; `thrall/app/lib/MigrationSourceWithSender.scala:65-93`).
3. A no-snapshot D3 request authenticates and normalizes the semantic request, resolves the read alias to one concrete target, opens a PIT there, and executes page one through that PIT before publishing a response. This is coordinated server orchestration, not one Elasticsearch primitive: Elasticsearch requires PIT open before PIT search ([Elasticsearch 8.18 PIT API](https://www.elastic.co/guide/en/elasticsearch/reference/8.18/point-in-time-api.html)).
4. The client receives a stable opaque session handle, never a raw PIT ID. The recommended default is a shared compare-and-set record owning latest PIT ID, revision, normalized query, semantic sort version, authorization scope, concrete read epoch, total, expiry and close state. This is selected for server-enforced multi-instance sequencing and recovery after lost responses, not because Elasticsearch documentation proves stateless chaining impossible. An exact-version concurrency/relocation test remains a decision gate against the simpler signed-token alternative.
5. Expiry returns `410 snapshot-expired`; it never retries against a live non-PIT corpus. History restoration opens a new snapshot and re-resolves its anchor by logical ID.

**D3 verdict: 3 — Hold D3 review for a coordinated D3/D8 change.** The current request accepts raw `pitId` and client-resolved `sort`, while the response publishes refreshed raw PIT state (`media-api/app/lib/elasticsearch/ElasticSearchModel.scala:90-191`; `media-api/app/lib/elasticsearch/ElasticSearch.scala:754-885`). The active plan already intends to replace raw sort with semantic `orderBy`; snapshot ownership should change in that same pre-review revision (`kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/media-api-01-capability-inventory.md:145-162`; `kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/d3-search-after-03-sort-options.md:157-206`).

**Confidence.** High that current hybrid and multi-index PIT designs fail correctness; high that a system-wide single-target epoch and combined page one are the right boundaries; medium that delaying projected M visibility is an acceptable migration behavior change; medium that a shared session store beats signed stateless chaining once both are measured.

**Blockers.** The Grid team must ratify the whole-index blue-green read policy, including coordinated changes to D9 and existing M-first getters, and define `CutoverReady`. media-api must compare shared CAS with signed serialized tokens on exact ES 8.x; D1 scheduling must prove it cannot starve interactive pages. The first implementation/review action is that decision plus a contract spike for combined page one and both session transports. Do not review the current raw-PIT D3 contract meanwhile.

## 2. Current-state sequence

### 2.1 One Kupua search

**Proven.** `search()` supersedes prior work, increments search and PIT generations, clears positional state, and best-effort closes the prior PIT without awaiting it (`kupua/src/stores/search-store.ts:1989-2089,2196-2200`). It then runs direct `openPit("1m")`, first-page `searchAfter(..., pitId=null)`, and ticker counts concurrently. PIT-open failure is isolated; first-page failure rejects the search and can leave an already-open PIT to expire (`kupua/src/stores/search-store.ts:2202-2249`; `kupua/src/stores/search-store-pit.test.ts:76-185`).

**Proven.** Page one contributes total, images and public cursors; state retains `result.pitId ?? openedPitId`. Later forward pagination may adopt a refreshed ID, but backward pagination discards it, fill loops reuse their captured ID, and paired forward/backward loads retain only one branch's response (`kupua/src/stores/search-store.ts:997-1089,1308-1384,2251-2439,2478-2754,2765-2945,3480-3650`).

**Proven.** Elasticsearch says PIT open and every PIT search may return different IDs and the next request must always use the most recently received ID. It also adds `_shard_doc`, unique per physical document within that PIT ([Elasticsearch 8.18 PIT API](https://www.elastic.co/guide/en/elasticsearch/reference/8.18/point-in-time-api.html); [Elasticsearch 8.18 pagination](https://www.elastic.co/guide/en/elasticsearch/reference/8.18/paginate-search-results.html)). Current branch selection is therefore outside the documented progression contract.

### 2.2 Sequence by migration state

| State at page one | Current `prepareSearch` | Direct PIT opened by Kupua | First page versus continuation |
|---|---|---|---|
| `NotRunning` | Current alias only (`media-api/app/lib/elasticsearch/ElasticSearch.scala:699-710`) | Startup current physical index (`kupua/src/dal/es-adapter.ts:884-905`) | Same intended corpus, but independent open/search instants permit the ordinary indexing race. |
| `InProgress(M)` | Current + M, excluding documents whose own source says `migratedTo=M` (`media-api/app/lib/elasticsearch/ElasticSearch.scala:699-710`) | Current physical index only | Page one may choose M for marked IDs and may include both unmarked copies; continuation reads C only. |
| `Paused(M)` | Same as `InProgress` | Current physical index only | Same mismatch; only automatic backfill pauses (`thrall/app/lib/MigrationSourceWithSender.scala:65-93`). |
| `CompletionPreview(M)` | M only | Current physical index only | Necessarily different targets. |
| `StatusRefreshError(previous)` | Current alias only; previous status is ignored by this match | Current physical index | Usually the same target, but different media-api instances can retain different cached states during refresh failure (`common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/MigrationStatusProvider.scala:36-80`). |

**Proven.** A supplied PIT bypasses `prepareSearch`; D3 searches `Nil`, renews one-minute keepalive, rebuilds the query/sort/runtime mappings, strips the implicit tiebreaker, and returns ES's refreshed PIT ID if present (`media-api/app/lib/elasticsearch/ElasticSearch.scala:817-885`). An already-open PIT remains on its captured physical index through pause, preview and alias transitions because PIT searches inherit index/routing from the PIT ([Elasticsearch 8.18 PIT API](https://www.elastic.co/guide/en/elasticsearch/reference/8.18/point-in-time-api.html)).

**Proven.** Direct ES retries PIT 404/410 without PIT and returns `pitId:null`; media-api's adapter throws on non-2xx and has no equivalent fallback (`kupua/src/dal/es-adapter.ts:1051-1124`; `kupua/src/dal/grid-api-search-adapter.ts:127-163`). Either behavior is wrong for a migration-bound session: the former silently changes corpus; the latter lacks a typed recovery contract.

## 3. Migration state machine

Let **C** be the physical index behind `Images_Current` before completion and **M** the physical index behind `Images_Migration`. After completion, `Images_Current` points to former M and `Images_Historical` points to former C (`common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/ElasticSearchClient.scala:28-35`; `thrall/app/lib/elasticsearch/ThrallMigrationClient.scala:93-118`). The recommended **R** is a logical read alias whose single physical target defines a read epoch independently of each process's cached migration status.

| State/transition | Physical-copy facts | Current read behavior | Correct snapshot target |
|---|---|---|---|
| Pre-migration `NotRunning` | C is the active copy; no represented M. | C. | R→C. |
| `InProgress(M)` | Backfill deliberately regenerates source into M and marks C only after insert; current search progressively publishes M for marked IDs (`thrall/app/lib/kinesis/MessageProcessor.scala:85-123`; `media-api/app/lib/elasticsearch/ElasticSearch.scala:699-710`). M may still be absent, ahead, stale or failed for individual IDs. | Union plus marker exclusion. | R→C under the selected whole-index policy. |
| `Paused(M)` | Backfill stops, but manual migration requests and ordinary writes can still affect copies (`thrall/app/lib/MigrationSourceWithSender.scala:65-105`). | Same union. | R→C. |
| `CompletionPreview(M)` | Preview merely adds an alias for any `Running` state; it proves neither drain nor equality (`thrall/app/lib/elasticsearch/ThrallMigrationClient.scala:60-75`). | M only. | R→C until `CutoverReady`; M is a diagnostic target. |
| `StatusRefreshError(previous)` | Provider retains `previous`, but current write/read matches fall through as non-running (`common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/MigrationStatusProvider.scala:20-27,41-80`; `thrall/app/lib/elasticsearch/ElasticSearch.scala:61-69`). | Current alias only. | Whatever single physical target R already names; cached status cannot change it. |
| Post-cutover `NotRunning` | `Images_Current` and R point to former M; former C is historical. | Former M through current alias. | R→former M. |
| Pause/resume with PIT open | Aliases marking pause change; PIT's physical snapshot does not. | New non-PIT requests retain union semantics. | Existing C PIT continues; new sessions open C. |
| Preview/unpreview with PIT open | Preview alias appears/disappears after per-process status refresh; PIT does not move. | New page one can flip C+M ↔ M while continuation stays C. | Existing and new canonical sessions stay C. |
| Final alias swap with PIT open | One strict alias request removes migration alias, moves current and R from C to M, and adds historical to C; current code already moves current/historical but must add R and fail-closed verification (`thrall/app/lib/elasticsearch/ThrallMigrationClient.scala:93-118`). | New current searches use M; old PIT uses C. | Both are valid snapshots around one guarded read-epoch transition. |

### 3.1 Divergence windows

| Operation | Ordering and possible divergence | Canonical consequence |
|---|---|---|
| Backfill migrate | Version-check C, project fresh source, insert M, then mark C. Insert-before-mark exposes both; marker failure leaves both unmarked (`thrall/app/lib/MigrationSourceWithSender.scala:112-124`; `thrall/app/lib/kinesis/MessageProcessor.scala:85-123`). | Frozen marker filtering is insufficient. R remains on C until whole-index cutover, deliberately delaying the projected M source. |
| Projection upsert | Replaces C only, wiping marker and deliberately requeueing while an old M may remain (`thrall/app/lib/kinesis/MessageProcessor.scala:70-82`). | Union may duplicate or prefer stale M; C is repaired authority. |
| Full image update | M upsert first; M failure becomes failure metadata, then C is updated. C failure propagates after possible M success (`thrall/app/lib/elasticsearch/ElasticSearch.scala:94-156`). | Acknowledged state is defined at C; M-only success is provisional. |
| Usage/export/metadata/lease/collection/soft-delete | Generic updater starts C and M requests independently; missing M is accepted, other one-sided failures fail the combined future (`thrall/app/lib/elasticsearch/ElasticSearch.scala:47-69,180-325,501-715`). Retries can still leave partial state after final stream recovery (`thrall/app/lib/ThrallStreamProcessor.scala:108-123`). | No query can infer a universally fresher copy; choose one commit authority. |
| Hard delete | Eligibility and deletion run independently per index; `ImageNotDeletable` is recovered independently (`thrall/app/lib/elasticsearch/ElasticSearch.scala:469-499`; `thrall/app/lib/kinesis/MessageProcessor.scala:155-176`). | M-only remnants must not resurrect an ID deleted from C. |
| Syndication-only update | The processor maps over `getImage` and does not await the returned update futures (`thrall/app/lib/kinesis/MessageProcessor.scala:199-207`). | M completeness cannot be assumed at preview. |

**Conclusion — Inferred.** The only efficient query-time architecture with deterministic precedence under current metadata is a single designated physical read epoch. Multi-index aliases and alias filters cannot express “use M iff an M copy exists, otherwise C”; alias filters are per-index Query DSL filters, not cross-index joins ([Elasticsearch 8.18 aliases](https://www.elastic.co/guide/en/elasticsearch/reference/8.18/aliases.html)). Field collapse also fails: with `search_after` it requires collapse and sort on the same field, forbids secondary sorts, and reports physical rather than distinct total ([Elasticsearch 8.18 collapse](https://www.elastic.co/guide/en/elasticsearch/reference/8.18/collapse-search-results.html)). Preserving progressive M precedence would instead require a materialized one-document canonical read index or a potentially whole-result server merge; neither exists. The recommendation consciously chooses delayed whole-index publication over those costs and must be approved as a Grid-wide behavior change, not hidden inside D8.

## 4. Required invariants

1. **Identity — Required.** Every logical `id` occurs exactly once. Physical `_shard_doc` may remain internal; every public tuple ends in unique logical `id` and contains no PIT-local value.
2. **Copy precedence — Required.** R's one physical target defines precedence for every user-facing read. It is C before guarded cutover and M afterward. Diagnostic preview must be explicitly separate, and D9/single-image reads cannot retain today's independent M-first rule.
3. **Snapshot — Required.** Page one, total, every continuation, D1 map and D4 rank use one PIT session. Query, filters, runtime mappings, semantic sort and authorization cannot change within it.
4. **Cursor — Required.** Public tuples are stable semantic values. They are unique and can seed recovery, but after expiry they are only hints: exact continuation is impossible once the old snapshot is gone. Recovery re-resolves the anchor ID in a new snapshot.
5. **Authorization — Required.** Session state binds authenticated principal/access class and tier; every call reauthenticates. A token cannot be replayed under a broader query or different tier.
6. **Lineage — Required.** Exactly one committed latest PIT head exists. Concurrent operations serialize or create explicitly tracked branches; response arrival order cannot select the head.
7. **Failure — Required.** PIT expiry, shard failure, timeout or session-store uncertainty fails closed. No live-search fallback crosses coordinate spaces.
8. **Cleanup — Required.** Close is idempotent, closes the latest known head, marks the session terminal and permits TTL cleanup. Lost HTTP responses do not lose server-owned PIT state.

## 5. Hypothesis table

| Hypothesis | Disconfirmation attempt and evidence | Verdict |
|---|---|---|
| **H1 raw multi-index PIT duplicates** | Backfill insert precedes marker; projection reset clears marker while M persists (`MessageProcessor.scala:70-123`). PIT `_shard_doc` distinguishes physical copies, but D3 deliberately removes it (`ElasticSearch.scala:847-885`). | **Proven true.** Reject raw multi-index PIT. |
| **H2 frozen `must_not migratedTo` is sufficient** | A PIT freezes document values, including “unmarked” in insert-before-mark/reset states. Freezing query JSON does not create a later marker in that snapshot. | **Proven false.** Both copies pass the frozen predicate. |
| **H3 C-only PIT matches current running reads** | Current `prepareSearch` uses C+M and prefers projected M for marked IDs (`ElasticSearch.scala:699-710`); ID reads do likewise (`ElasticSearch.scala:95-149`). Hard-delete and partial-write paths can differ. | **Proven false as stated.** **Inferred:** R→C is a coherent replacement policy only if approved system-wide; it delays projected M visibility and must replace D9/getter precedence too. |
| **H4 M-only is canonical in preview** | Preview has no drain/failure barrier; projection is C-only; M failures are recorded on C; status error writes C only (`ThrallMigrationClient.scala:60-75`; `ElasticSearch.scala:94-156`; `MessageProcessor.scala:70-82`). | **Proven false.** Current preview is diagnostic, not canonical. |
| **H5 parallel page one is a bounded acceptable gap** | In progress, page one can contain M while continuation can only contain C; in preview they target wholly different indexes. Total and boundary can disagree for the whole session. | **Proven false for migration.** It is not merely the normal refresh race. |
| **H6 sequential existing-D3 first page is sufficient** | Open a correct C PIT, then pass raw ID with null cursor: D3 uses PIT for page one and retains query/filter/runtime mapping parity (`ElasticSearch.scala:779-843`). | **Inferred partially true.** It is a valid transitional oracle, but leaves raw capability binding, cleanup, refreshed-ID concurrency and extra request boundary unresolved. |
| **H7 combined open + first page is materially better** | Correctness equals H6 only if both open the same target. Combined ownership removes the client-visible gap and lets the server close on page-one failure; latency benefit is unmeasured. | **Inferred true for contract/cleanup; Measurement-needed for latency.** |
| **H8 refreshed IDs are concurrency-safe today** | Forward/backward branches share one head and discard one successor (`search-store.ts:1308-1384,2478-2754`). ES requires the most recently returned ID for the next request but does not document sibling/older-ID validity. | **Proven:** current arbitration does not implement the documented linear progression. **Measurement-needed:** whether signed client serialization suffices or shared CAS is necessary. |
| **H9 expiry fallback stays in one coordinate space** | Direct fallback retries live; status, alias and physical target may have changed (`es-adapter.ts:1051-1124`). | **Proven false.** Return typed expiry and reopen/re-anchor. |
| **H10 server snapshot sessions are deployable** | media-api is deployed through an autoscaling template, with no repository proof of stickiness (`riff-raff.yaml:12-14,55-57`). Process-local state is therefore invalid. Existing code demonstrates asynchronous DynamoDB access, but not this workload (`common-lib/src/main/scala/com/gu/mediaservice/lib/metadata/SoftDeletedMetadataTable.scala:12-41`). | **Inferred feasible with shared CAS storage; Measurement-needed.** Signed tokens remain viable if exact-version tests prove serialized chaining, response-loss retry and close semantics acceptable. |

## 6. Fixture matrix

Every future fixture must assert this common oracle: exact logical-ID set with no duplicates; expected source index and source body per ID; exact total; complete order; unique public tuples; page-one-plus-continuation equality with the complete order; typed expiry with no live fallback; and idempotent close of the latest stored PIT head.

| Fixture | Deterministic setup | Expected canonical oracle |
|---|---|---|
| Current only | ID exists only in C. | One C hit. |
| Migration only before cutover | ID exists only in M, modeling provisional/orphan state. | No canonical hit; diagnostic preview may show M. |
| Both, C marked | Same ID in C/M; C has `migratedTo=M`; M's regenerated projection changes a queryable field and a sort-bearing field. | Before cutover, D3, D9 and ID reads all return only C with C membership/order; after cutover all return only M with M membership/order. This explicitly proves delayed projection publication. |
| Both, C unmarked | Pause between M insert and C marker (`MessageProcessor.scala:99-123`). | One C hit; never two. |
| Both after projection reset | Seed marked pair, replace C without `esInfo` (`MessageProcessor.scala:70-82`). | One repaired C hit. |
| Migration write failed | C contains failure metadata; M absent or stale (`ElasticSearch.scala:141-156`). | One C hit with C source. |
| Identical source and tuple | C/M copies byte-equivalent. | Still one logical hit; tuple ending `id` unique. |
| Different source, same tuple | C/M differ only in non-sort source. | C source before cutover; M after. |
| Different primary/fallback sort | C/M copies land far apart and match different filters. | Only R's target contributes membership, tuple and order; D3 and D9 select the same source. |
| Soft delete during migration | Barrier each generic updater completion independently (`ElasticSearch.scala:47-69,276-318`). | Corpus follows C commit state before cutover. |
| Hard delete during migration | Permit delete in one index and protect/fail the peer (`ElasticSearch.scala:469-499`). | C absence/presence controls pre-cutover membership. |
| Usage/export update | Pause one index's update and vary sort-bearing nested values. | C source/sort controls pre-cutover order. |
| Enter/leave `Paused` | Hold one C PIT while toggling pause alias. | Existing order unchanged; new canonical session also C. |
| Enter/leave preview | Hold C PIT while toggling completion-preview alias. | Canonical D3 remains C; diagnostic M query is separately labelled. |
| Final alias swap | Open session immediately before and after guarded atomic switch. | Old session remains C snapshot; new session is M; neither changes mid-session. |
| Old browse session plus new detail read | Hold a C-backed D3 session across cutover, then resolve one of its IDs through D9/single-image R→M. | The old list remains a valid C snapshot; the new detail read is explicitly M-epoch data. No endpoint silently rewrites the old session's tuple/source, and UI reconciliation follows a documented cross-epoch policy. |
| C-deleted, M-orphan at cutover | Delete or omit an ID in C while deliberately retaining it in M, then request `CutoverReady`. | Cutover is rejected or the M orphan is removed/tombstoned before R moves; the deleted logical image never reappears after cutover. |
| `StatusRefreshError(previous)` | Parameterize previous as `NotRunning`, `InProgress`, `Paused`, `CompletionPreview`, then fail refresh (`MigrationStatusProvider.scala:20-27,41-58`). | Canonical open uses current alias; no per-instance union/M decision. |
| Expiry around every transition | Expire before/after pause, preview and completion. | Next call is `410`; recovery opens current alias and re-resolves anchor. |
| Concurrent forward/backward | Force two requests and different refreshed IDs, reverse response order, drop one response. | Shared revision serializes heads; subsequent request uses stored latest ID; all heads close. |
| D1/D4 contention | Interleave position-map chunks, rank and interactive page requests. | Same snapshot order/total; interactive scheduling is bounded. |
| D2 range | Change/erase sort fields between clicks, then resolve IDs in operation-owned snapshot. | Explicit unavailable-anchor outcome or exact ID range; no mixed live/cached tuples. |

## 7. Option scorecard

Correctness gates are identity, canonical source, page agreement and linear PIT lineage. A failed gate rejects the option regardless of speed.

| Option | Correctness gates | Operational/performance | D1/D2/D4 and rollout | Decision |
|---|---|---|---|---|
| 1. Defer D8; current hybrid | **FAIL:** page one and PIT diverge in running/preview states. | Lowest new work; current orphan/expiry behavior remains. | D1/D2/D4 remain direct and unsynchronized. | Reject as architecture; use only as feature-off fallback before cutover. |
| 2. Raw single-index, parallel page one | **FAIL:** single PIT is unique, but page one is live union/M. | Preserves latency overlap. | Mixed coordinate space infects total/map/rank. | Reject. |
| 3. Raw single-index, sequential page one | **PASS** if target is C and requests serialize; weak auth/query binding and cleanup. | One extra browser-server round trip; cheapest correctness oracle. | Requires invasive client ownership of all consumers. | Keep as benchmark/rollback design, not final boundary. |
| 4. Combined open + page one | **PASS** with C target and fail-closed search. | Fewer client requests; server performs two ES operations. | Good common opening boundary. | Select as part of recommendation. |
| 5. Multi-index PIT + frozen dedup | **FAIL:** unmarked/reset duplicates; no cross-index precedence. | Potentially more shards/segments. | Public tuples and totals are invalid. | Reject. |
| 6. D3 opaque snapshot session | **PASS** with one canonical target and either proven serialized signed-token chaining or shared latest-head state. | Shared CAS adds hot-path I/O; signed tokens add fork/retry risk to falsify. | Best binding, expiry, close and cross-consumer ownership. | Select shared CAS as default pending one exact-version discriminating test. |
| 7. Migration-aware read alias/native boundary | Multi-index filtered alias **FAILS**; existing single-target current alias **PASSES** when declared authority and guarded at cutover. | Alias open is native and old PITs survive switch. | Direct clients must use the same canonical target. | Select the single-target form; do not add a union alias. |
| 8. Defer API PIT until migration completes | **PASS** only if media-api pagination is disabled for the entire migration and direct clients remain on current. | Operationally safe but postpones value and repeats each future migration. | Does not settle long-term D3 ownership. | Acceptable rollback, not recommendation. |
| 9. Two-PIT server merge (derived) | **FAIL without materialization:** copies with different sort positions require global seen-ID state; distinct total is unavailable cheaply. | Potentially scans/stores millions of IDs. | Poor map/rank fit. | Reject; materialize one canonical index instead. |

## 8. Recommended contract

### Open and first page

A versioned D3 request without `snapshot` contains semantic search parameters, semantic `orderBy`, explicit count intent, page length and optional start intent. media-api authenticates, resolves R to exactly one concrete index, constructs one canonical query/sort, opens a PIT on that target with partial shards disallowed, creates the shared session record, then executes page one with that PIT. It publishes nothing if alias resolution, open, state creation, search, enrichment or state update fails; any opened context is closed best-effort.

The response contains enriched hits, exact initial total when requested, authoritative public tuple per hit, next public cursor, stable opaque `snapshot`, session protocol version and expiry metadata. It contains no raw PIT ID or client-resolved ES sort.

### Continue and refresh

A continuation sends the opaque handle, direction, page size and a public cursor issued for that session. Query, sort, read epoch and tier come from session state rather than being resubmitted. Under the recommended shared-CAS default, the server reauthenticates, validates principal/access binding and cursor arity, acquires a revision lease, searches with the stored latest PIT ID, persists the returned PIT ID and renewed expiry before replying, then releases. Elasticsearch's requirement to use the newest ID is therefore satisfied even if the HTTP response is lost ([Elasticsearch 8.18 PIT API](https://www.elastic.co/guide/en/elasticsearch/reference/8.18/point-in-time-api.html)).

Opposite-direction loads may remain logically parallel in Kupua, but media-api sequences PIT-head mutations. D1 runs chunked and low-priority against the same browse session so its length/order equals D3 total; interactive work can preempt between chunks. D4 runs `size:0, track_total_hits:true` with the exact rank predicate in that same session because `_count` cannot take a PIT (`../../../03 Ce n'est pas une pipe dream/media-api-work/media-api-01-capability-inventory.md:591-600`). D2 accepts `anchorId` and `targetId`, opens a short operation-owned canonical session, resolves both authoritative tuples there, walks and closes; it returns an explicit unavailable-anchor result instead of mixing cached tuples with live reads (`../../../03 Ce n'est pas une pipe dream/media-api-work/media-api-01-capability-inventory.md:865-881`).

### Expire, restore and close

Missing/expired/terminal state or expired ES PIT returns stable `410 snapshot-expired`. There is no non-PIT retry. Browser history stores semantic search and anchor ID, not snapshot capability; current history already stores search identity, anchor and upload freeze rather than a PIT (`kupua/src/lib/history-snapshot.ts:18-42`). Restore opens a new combined session and resolves the anchor ID/rank inside it. Old tuples remain useful diagnostic/recovery hints but do not promise exact continuation in a new snapshot.

Close atomically marks the session closed, closes every tracked latest/branch PIT ID best-effort, and returns success for already-closed, expired or unknown handles. Elasticsearch expires PITs automatically but recommends prompt explicit close because open PITs retain old segments and consume file handles/heap ([Elasticsearch 8.18 PIT API](https://www.elastic.co/guide/en/elasticsearch/reference/8.18/point-in-time-api.html)).

## 9. D3 review verdict

**Verdict — Hold D3 review for coordinated D3/D8 change.** Do not review the current raw `pitId` shape as the long-term boundary.

The coordinated revision affects:

- `media-api/app/lib/elasticsearch/ElasticSearchModel.scala`: replace raw sort/PIT inputs with semantic create/continue/session forms and strict JSON validation.
- `media-api/app/lib/elasticsearch/ElasticSearch.scala`: canonical PIT open, fail-closed first page, latest-head continuation, no live fallback, retained public tuple behavior.
- `media-api/app/controllers/MediaApi.scala`, `media-api/conf/routes`, `media-api/app/MediaApiComponents.scala`: lifecycle handlers and opaque-session wiring.
- Thrall migration status/client/controller: single-target R, guarded `CutoverReady`, and strict verified atomic completion.
- `migrationAwareGetter`, D9 and every direct fallback: replace per-image M-first/current-union behavior with R so list, detail and selection share one source epoch.
- `kupua/src/dal/types.ts`, `grid-api-search-adapter.ts`, `strangler-adapter.ts`, and `stores/search-store.ts`: opaque session lifecycle and removal of client PIT-head arbitration.
- D1/D2/D4 implementations and their tests, because snapshot ownership is shared contract rather than a D8-only endpoint.

**Proven.** D3's current single-index PIT walking tests remain valuable implementation evidence, and `_shard_doc` must still stay out of public tuples (`media-api/test/lib/elasticsearch/ElasticSearchTest.scala:1116-1195`; allowed D-6 analysis at `phase-3-d3-searchafter-post-pr-review.md:108-143`). Review may resume only after the session/cutover contract and Option-A semantic sort are represented in code and deterministic fixtures.

## 10. Static test plan

### Existing evidence and limits

| Existing test | Proves | Does not prove |
|---|---|---|
| `media-api/test/lib/elasticsearch/ElasticSearchTest.scala:844-1195` | Single-index first/continuation, null zone, reverse, seek-end, PIT walk and public tuple truncation. | Migration copies, transitions, expiry, refreshed-head concurrency, controller/auth. |
| `media-api/test/lib/elasticsearch/SortsTest.scala:8-89` | Raw sort JSON decoding. | Planned semantic builder parity or session binding. |
| `thrall/test/lib/elasticsearch/ElasticSearchTest.scala:772-870` | Current-only, missing-M and happy dual-write/marker paths. | Insert/mark barrier windows, partial failures, deletes, preview readiness. |
| `thrall/test/lib/elasticsearch/MigrationStatusProviderTest.scala:6-20` | `NotRunning` and start→`InProgress`. | Pause, preview, every previous-status error and multi-instance lag. |
| `kupua/src/stores/search-store-pit.test.ts:76-185` | Open failure isolation, synchronous generation, stale-open cleanup. | Real ES, first-page agreement, latest refreshed ID, response loss. |
| `kupua/src/dal/es-adapter.test.ts:381-566,705-778` | Mocked sequential position-map refresh, direct expiry fallback and rank predicate. | Shared browse snapshot, migration corpus, sibling heads. |
| `kupua/src/dal/strangler-adapter.test.ts:10-84` | Method routing. | End-to-end PIT/session behavior or graceful expiry. |
| `kupua/src/stores/search-store-position-map.test.ts:85-378` | Static map lifecycle and seeks. | Map/main snapshot equality under writes. |
| History/cache tests | Serialization, LRU and tuple reconstruction (`history-snapshot.test.ts:28-160`; `image-offset-cache.test.ts:79-267`). | Expiry, changed tuple, alias cutover. |
| Habitual E2E | Local direct-ES UI journeys. `/api/**` is normally blocked (`kupua/e2e/shared/helpers.ts:18-37`; `kupua/e2e/README.md:18-57`). | D3/D8 integration. |

### Required deterministic harness

Build a two-index ES integration fixture with real aliases and controlled barriers around insert, marker, generic dual update, projection reset, delete and alias switch. Add media-api HTTP tests with an in-memory deterministic session-store implementation for contract cases and a shared-store adapter contract suite for CAS/TTL behavior. Add a signed-token prototype using the same external opaque contract. Against the exact supported ES version, reorder concurrent responses, drop replies, retry from an older token, relocate shards, close each observed ID and test state-write failure. The fixture matrix in Section 6 is the minimum table-driven corpus.

A separate integrated Kupua/media-api E2E project must exercise create, forward, backward, centered load, D1, D4, expiry/re-anchor and close; it cannot rely on the shared helper that blocks `/api/**`. No live cluster is required. Existing behavioral tests that assert parallel first page, raw `pitId`, direct expiry fallback or independent position-map PITs must be identified before implementation and changed only after deciding whether their old behavior is intentionally replaced.

## 11. Performance and capacity plan

**Inferred baseline.** The D3 deep dive estimates a production-like 200-hit server page at roughly 230 ms, dominated by about 137 ms of envelope construction, with proposed unrelated optimizations reducing the estimate toward 155 ms (`../../../03 Ce n'est pas une pipe dream/media-api-work/d3-search-after-04-performance.md:300-344`). Those are projections, not a snapshot-session measurement.

Measure four implementations over identical deterministic corpora: current parallel hybrid as latency baseline only; sequential raw R-PIT plus existing D3 as correctness oracle; combined first-page signed-token chaining; and combined first-page shared CAS. Record browser-to-response and server p50/p95/p99, ES `took`, PIT-open time, token size/verification, shared-store read/CAS/write time, conflict/retry rate, request count, CPU, allocation and enrichment cost. Separate initial page, continuation, paired direction, lost response/retry, D1 interleaving, D2 walk, D4 rank, expiry and close. The cheapest discriminating check is a container test that issues two searches from one PIT head during forced relocation, loses one successor, and then attempts continuation and close from every observed ID. Shared CAS remains the default unless signed chaining passes that correctness test and its simpler latency/operations profile is material.

Capacity runs must vary concurrent sessions, update/delete rate, keepalive and D1 map activity. Record `open_contexts`, retained segment bytes/count, heap, file descriptors, disk reclamation delay, shared-store item count/TTL lag and close success. Elasticsearch documents that PITs retain old segments and require extra file handles and heap under updates/deletes ([Elasticsearch 8.18 PIT API](https://www.elastic.co/guide/en/elasticsearch/reference/8.18/point-in-time-api.html)).

**Stop thresholds.** Correctness threshold is absolute: any duplicate/missing logical ID, wrong source, first/continuation disagreement, partial shard publication, cross-space fallback, unclosed observed head or authorization replay stops the option. Before performance testing, media-api/search owners must record numerical p95/p99 latency, conflict/retry, resource and D1-interactive-delay budgets; this report does not invent them. Stop rollout if agreed budgets are exceeded, resources fail to return toward baseline after close/expiry, or the selected transport cannot fail closed without leaking PITs.

Use local/container fixtures first, then a representative non-production environment only with explicit permission. No production traffic or live migration inspection is needed to decide the contract.

## 12. Versioned rollout and rollback

1. **Policy and transport gates.** Approve delayed whole-index projection publication, then run the signed-token/shared-CAS discriminating test. If evidence cannot distinguish them, retain the shared-CAS default and keep D3 held.
2. **Canonical prerequisite.** Create R on current C. Deploy Thrall guarded-cutover checks, strict fail-closed alias actions, postcondition verification and an observable read epoch. Route `prepareSearch`, D9, M-first getters and direct fallback through R before migration begins.
3. **Infrastructure/server.** If the default survives, provision shared session storage, least-privilege IAM, TTL, encryption and metrics. Deploy the versioned opaque-session route disabled; keep raw D3 only as rollback evidence. Because media-api autoscales and stickiness is unproven (`riff-raff.yaml:12-14,55-57`), all serving instances must understand the chosen protocol before clients enable it.
4. **Client switch.** Deploy Kupua capability detection and opaque lifecycle. During media-api absence, direct ES may remain the graceful fallback only while it resolves R and guarded cutover is blocked. A `410` from an established session is not API absence and must re-open/re-anchor rather than silently fall back.
5. **Consumers.** Move D1 and D4 to the browse session and D2 to its operation-owned R session. Remove direct position/rank/range paths only after parity fixtures pass.
6. **Migration enablement.** Exercise the entire two-index matrix, then allow `InProgress`/`Paused`; enable diagnostic preview and guarded completion last. Existing sessions on R→C remain valid PIT snapshots after the atomic R/current switch; new sessions open former M.
7. **Retirement.** Remove raw `pitId`, client ES `sort`, direct session consumers and temporary version routing only after no old-client/session metrics remain for more than the maximum absolute session lifetime.

Rollback stops new session creation, blocks read cutover, routes new searches to direct R or the sequential R-PIT oracle, and leaves enough v2 media-api capacity to drain/close active handles. Do not roll the whole server fleet back while those handles require v2. Never log raw PIT IDs or session tokens; log a one-way correlation ID, protocol version, read epoch, status-at-open, revision/conflict result, close result and typed expiry.

## 13. Residual unknowns and team decisions

| Unknown/decision | Label | Owner | Cheapest resolution |
|---|---|---|---|
| Exact `CutoverReady` invariants and whether preview may continue as a diagnostic M view | **Unknown** | Thrall/Grid migration owners | One design review using the Section 6 matrix; encode accepted checks as controller tests. |
| Shared CAS versus signed serialized token | **Measurement-needed, decision-blocking** | media-api/ES platform | Run Section 11's exact-version fork, relocation, lost-response and close test; retain shared CAS by default. |
| D1 strict same-snapshot requirement versus a child snapshot | **Unknown** | Kupua search UX owner | Replay map/main divergence fixtures; retain same-session default unless product semantics permit approximation. |
| Server scheduling under D1 plus interactive paging | **Measurement-needed** | media-api/Kupua | Deterministic contention benchmark with interactive-delay budget agreed first. |
| Blue-green read epoch versus today's progressive projected-M publication | **Unknown, decision-blocking** | Grid migration owners | Approve the explicit behavior change or reject this recommendation and design a materialized one-document canonical index. |
| Production ES version and partial-search policy | **Unknown** | Grid platform | Verify deployment manifest/config; test exact version without a live data query. Build currently uses elastic4s 8.19.1 and tests default to ES 8.18.3 (`build.sbt:81-127`; `ElasticSearchDockerBase.scala:12-31`). |
| Principal binding granularity across renewed login sessions | **Unknown** | auth/media-api | Decide stable accessor identity and tier claims; add replay matrix. |
| Direct fallback target across final alias swap | **Proven current risk** | Kupua/runtime | Resolve R per session or require restart before cutover; never pin startup C across the read epoch (`kupua/scripts/start.sh:414-462`). |
| Quantitative latency/resource stop budgets | **Unknown** | service owners/SRE | Record budgets before running Section 11; no post-hoc acceptance. |

## 14. Source coverage

**Read in full or traced for material sections:** all Tier 0 active documents named in the research prompt; D3 performance deep dive; media-api conventions/instructions; `ElasticSearch.scala`, `ElasticSearchModel.scala`, controller, routes, components and sorts; common migration status/client; Thrall migration client, write/delete paths, message processor/source/controller; Kupua store PIT/search/seek/restore paths, ES/API/Strangler adapters, sort builders, types, history and offset cache; and the named Scala, Vitest and E2E evidence tests. The one archive read was the expressly permitted D-6 `_shard_doc` analysis.

**External authoritative sources:** Elasticsearch 8.18 [PIT API](https://www.elastic.co/guide/en/elasticsearch/reference/8.18/point-in-time-api.html), [pagination](https://www.elastic.co/guide/en/elasticsearch/reference/8.18/paginate-search-results.html), [aliases](https://www.elastic.co/guide/en/elasticsearch/reference/8.18/aliases.html), [Aliases API](https://www.elastic.co/guide/en/elasticsearch/reference/8.18/indices-aliases.html), and [field collapse](https://www.elastic.co/guide/en/elasticsearch/reference/8.18/collapse-search-results.html).

**Not read/used:** runtime logs, TEST/CODE/PROD, credentials, real responses, user data or live cluster state. No test or request was run. Actual load-balancer stickiness, instance counts, production ES version, production PIT capacity and shared-store latency remain deliberately unclaimed. Broad D7/D9/aggregation design and archived media-api plans were out of scope.

## 15. What done looks like

- [x] One recommendation: guarded canonical-current combined first page with shared opaque session.
- [x] Exactly one D3 verdict: **hold review for coordinated D3/D8 change**.
- [x] Canonical physical copy stated for every migration state and transition.
- [x] Page one, continuation, total, refresh, expiry and close specified.
- [x] H1-H10 actively tested against source, with verdicts.
- [x] All required stable/transient fixtures and their complete oracle specified.
- [x] Exactly-once identity and unique public tuple are correctness gates.
- [x] Expired tuples are honestly limited to recovery hints; no false exact-continuation claim.
- [x] Concurrent refreshed PIT IDs are server-sequenced and response-loss behavior is defined.
- [x] D1, D2, D4 and history restoration have explicit snapshot semantics.
- [x] All required architecture options plus a derived two-PIT merge were scored.
- [x] Static tests, performance/capacity measurements and stop rules are specified without invented numbers.
- [x] Multi-instance rollout, mixed versions, graceful API absence, rollback, cleanup and observability are covered.
- [x] Residual unknowns have owners and cheapest resolution paths.
- [x] No code, tests, live systems, worklog, changelog or `AGENTS.md` were modified.
