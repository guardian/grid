# Grid index migration: architecture proposal

> **Archived, 15 September 2026: implementation not approved.** The decision below selected
> an architecture under stronger migration requirements; it did not authorize changing Grid's
> production machinery. Preserve its reasoning, not its execution gates as current instructions.
> Current scope: [media-api index](../../../03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/media-api-00-index.md).

**Date:** 2026-09-14  
**Status:** Architecture decision produced by document 03. No product code or tests changed or
run.  
**Evidence labels:** **Proven** means current source or cited Elasticsearch 8.18 documentation
establishes the claim; **Inferred** is the selected architectural conclusion from that evidence;
**Measurement-needed** requires the bounded research in Section 10; **Unknown** is not established
by available source. Normative requirements are labelled **Required** and are not claims about
current behavior.

## 1. Decision card

**Architecture - Inferred, high confidence:** adopt a blue-green **canonical read/write epoch**
through the existing single-target `Images_Current` alias, called **R** in this document. R points
to the pre-migration current physical index **C** before and throughout backfill, pause and
completion preview. One guarded whole-index cutover moves R to migration index **M** only after the
`CutoverReady` contract in Section 6 is true. All canonical search, count, aggregation, AI, getter,
D9 and direct-fallback paths resolve the same R policy. The current progressive C+M search and
independent M-first getter policy end
(`media-api/app/lib/elasticsearch/ElasticSearch.scala:103-149,699-710`).

The cutover is linearized by a durable migration-epoch lease plus a mandatory global admission
fence. The epoch record names C and M by concrete index name and UUID, records the fence phase and
monotonic read epoch, and is authoritative over process-local migration status. The fence covers
every write and every eligibility, precondition, candidate-selection or version read that can
produce a mutation; acknowledged ES write blocks on both C and M are the backstop that drains and
rejects missed direct writes. It remains held through final drain, M refresh/search verification,
strict alias action, postcondition verification, epoch publication and writer release against M.
All media-api and direct-fallback browse-session creation enters the same epoch-admission gate
before resolving a target and remains accounted for until page-one publication. Current completion
has neither that lease/fence nor a readiness barrier, and after it `NotRunning` writes only to M
(`thrall/app/lib/elasticsearch/ThrallMigrationClient.scala:93-118`;
`thrall/app/lib/elasticsearch/ElasticSearch.scala:47-69`;
[Elasticsearch 8.18 index blocks](https://www.elastic.co/guide/en/elasticsearch/reference/8.18/index-modules-blocks.html)).

Rollback while the fence remains held and no post-swap M write has been admitted may restore R to
C and verify it before release; any M PIT already opened remains a valid retained snapshot. Once M
writes are admitted, C is historical and an alias-only rollback is forbidden: rollback requires a
new fenced M-to-C reconciliation or forward migration. This is less convenient than a staged read
alias, but it avoids inventing a permanent third writer phase solely to make rollback look cheap.

**Intentional behavior change - Inferred, accepted:** regenerated M projections are not
progressively user-visible. C remains the canonical user-facing source until whole-index read
cutover, even when a newer projection already exists in M. This trades early projection visibility
for one logical document, one total and one ordered coordinate space. C is authority **by
contract**, not proven physically freshest: full-image writes can update M before C, and generic
updates can commit one side before the other fails
(`thrall/app/lib/elasticsearch/ElasticSearch.scala:47-69,95-156`).

**D3 verdict: 3 - hold review for a coordinated D3/D8/read-epoch contract change.** Page one and
continuations must use one snapshot. Snapshot creation belongs to a separate semantic browse-
session resource that returns page one only after opening and using the snapshot. The media-api
client sees an opaque session handle, not a raw PIT ID. The handle may be state-backed, state-
bearing, or hybrid; Section 10 deliberately leaves that mechanism to documents 05/06. Current D3
accepts and returns raw PIT identity and a client-resolved ES clause
(`media-api/app/lib/elasticsearch/ElasticSearchModel.scala:90-139`;
`media-api/app/controllers/MediaApi.scala:824-889`).

**Sort decision - Inferred:** replace client-resolved ES `sort` with semantic `orderBy` in this
pre-review contract change. A new media-api-only semantic builder must be independent of legacy
Kahuna-serving `createSort`; language-neutral fixtures must pin every alias, fallback, nested sort,
null zone and direction. Current `createSort` cannot reproduce Kupua's clause, while Option B leaks
the ES clause and would make every future snapshot consumer repeat that coupling
(`../../../03 Ce n'est pas une pipe dream/media-api-work/d3-search-after-03-sort-options.md:18-52,54-125,148-174`;
`../../performance-first-dry-consolidation-audit-2026-09-13.md:395-412`).

**Confidence:** high on one canonical read/write alias, diagnostic-only preview, same-snapshot page
one and holding D3. Fence completeness is **Unknown** until the principal/ingress inventory closes;
fence duration and operational acceptability are **Measurement-needed**. Confidence is medium on
opaque-session cost until 05 measures it.

**Blockers:** current Thrall state cannot represent `CutoverReady`; production Elasticsearch
version and PIT capacity are unknown; session concurrency/cleanup behavior must be tested on the
exact supported combination; and the migration owners must accept delayed progressive projection
visibility as the explicit Grid behavior. Repository tests use Elasticsearch 8.18.3 while the
build uses elastic4s 8.19.1 (`common-lib/src/test/scala/com/gu/mediaservice/testlib/ElasticSearchDockerBase.scala:12-31`;
`build.sbt:81-104`).

**Next action:** write document 05 directly from Section 10. Do not review D3, write product code,
or change the read policy while transport research is in progress.

## 2. Document 02 adjudication

| # | Finding from 02 | Decision and superior replacement |
|---|---|---|
| 1 | Raw multi-index PIT is invalid. | **Accept - Proven.** M insert precedes C marking, and projection replacement clears C's marker while old M remains. Both physical copies can enter one PIT; PIT `_shard_doc` distinguishes physical documents but cannot make one logical ID canonical (`thrall/app/lib/kinesis/MessageProcessor.scala:70-123`; `media-api/app/lib/elasticsearch/ElasticSearch.scala:817-885`; [Elasticsearch 8.18 pagination](https://www.elastic.co/guide/en/elasticsearch/reference/8.18/paginate-search-results.html)). |
| 2 | Frozen `must_not migratedTo` cannot fix unmarked/reset duplicates. | **Accept - Proven.** A PIT opened after M insert but before C mark, or after C projection reset, freezes two copies that both lack the excluding marker. Freezing Query DSL cannot manufacture a later document value (`thrall/app/lib/kinesis/MessageProcessor.scala:70-123`). |
| 3 | Current-index-only PIT is not today's progressive read. | **Accept - Proven.** Running search uses C+M and marker exclusion; running getters prefer M. C-only is the new intentional policy, not a parity claim (`media-api/app/lib/elasticsearch/ElasticSearch.scala:103-149,699-710`). |
| 4 | `CompletionPreview` is not a readiness barrier. | **Accept - Proven.** Preview only adds an alias, stops automatic scanning, and current completion checks no drain, write, failure, projection or delete condition (`thrall/app/lib/elasticsearch/ThrallMigrationClient.scala:60-75,93-118`; `thrall/app/lib/MigrationSourceWithSender.scala:65-105`). |
| 5 | Current parallel page one is migration-inconsistent. | **Accept - Proven.** Kupua concurrently opens a direct C PIT and runs no-PIT page one; Strangler routes only the latter through migration-aware media-api. In preview the two targets are necessarily M and C (`kupua/src/stores/search-store.ts:2196-2249`; `kupua/src/dal/strangler-adapter.ts:25-66`; `media-api/app/lib/elasticsearch/ElasticSearch.scala:699-710`). |
| 6 | Combined open plus first page is the right ownership boundary. | **Modify - Inferred.** Same-snapshot page one is required. The superior boundary is a semantic browse-session **create** operation that publishes handle and page one together; PIT open and search remain sequential ES operations. Correctness does not depend on pretending they are atomic, and a standalone raw D8 open is not public ([Elasticsearch 8.18 PIT API](https://www.elastic.co/guide/en/elasticsearch/reference/8.18/point-in-time-api.html)). |
| 7 | One canonical read epoch is preferable to per-ID precedence. | **Modify - Inferred.** R is the existing canonical read/write alias, moved once under a global fence and stronger readiness contract. A separate staged read alias creates a second writer mode and unsafe handoff; cheap post-release rollback is rejected. C is selected authority, not universally freshest (`thrall/app/lib/elasticsearch/ElasticSearch.scala:47-69,95-156`; `thrall/app/lib/elasticsearch/ThrallMigrationClient.scala:93-118`). |
| 8 | A shared opaque snapshot session is required. | **Modify - Inferred/Measurement-needed.** An opaque semantic session is required; a **shared store** is not yet proven necessary. Signed state-bearing and hybrid handles remain viable until 05 tests PIT forks, lost responses, retries, close and capacity. media-api's autoscaling deployment gives no checked-in singleton/stickiness guarantee (`riff-raff.yaml:10-14,55-57`). |
| 9 | PIT expiry must never silently fall back. | **Accept - Proven current defect; Inferred requirement.** Direct ES retries PIT 400/404/410 live and clears the ID, which changes snapshot coordinates even if the target physical index is unchanged. Expiry, partial shards and timeout must terminate that session instead (`kupua/src/dal/es-adapter.ts:1051-1124`; [Elasticsearch 8.18 Search API](https://www.elastic.co/guide/en/elasticsearch/reference/8.18/search-search.html)). |
| 10 | History restore opens a new snapshot and resolves a logical anchor. | **Accept - Inferred.** History stores semantic search identity, logical anchor and upload freeze, not PIT state. A restored session therefore opens a new snapshot and resolves the anchor inside it; exact continuation of the expired snapshot is not promised (`kupua/src/lib/history-snapshot.ts:18-42`; `kupua/src/hooks/useUrlSearchSync.ts:244-395`). |
| 11 | D1/D4 share browse snapshot while D2 owns another. | **Modify - Inferred.** D1, exact D4 and a D2 range initiated between displayed endpoints all use the browse snapshot. A fresh D2 snapshot can select a range the user never saw. 05 may test safe branches/slices of the same snapshot, but not silently substitute a later corpus (`kupua/src/dal/es-adapter.ts:1278-1457,1972-2178`; `kupua/src/hooks/useRangeSelection.ts:120-235`). |
| 12 | Getters, D9 and direct fallback converge on the read epoch. | **Accept with precision - Inferred.** Standalone reads use current R. Snapshot-bound reads attached to an old C browse continue inside that PIT after cutover; deliberately live adjuncts use current M and cannot alter the old list without opening/re-anchoring a new session. Current getter and fallback policies differ (`media-api/app/lib/elasticsearch/ElasticSearch.scala:103-149`; `kupua/src/dal/es-adapter.ts:1051-1124`). |

## 3. Canonical read policy

### 3.1 Selected physical boundary

**Proven.** Current progressive search has no universal precedence rule. During backfill, M is
inserted before C receives `migratedTo`; projection upsert later replaces only C and clears the
marker while old M remains. Search can then include both copies, while an M-first getter can select
the stale M copy (`thrall/app/lib/kinesis/MessageProcessor.scala:70-123`;
`media-api/app/lib/elasticsearch/ElasticSearch.scala:103-149,699-710`). One-sided update and delete
outcomes also mean neither physical copy can be inferred freshest merely from existence
(`thrall/app/lib/elasticsearch/ElasticSearch.scala:47-69,469-499`).

**Inferred.** R is `Images_Current`, the only canonical read/write selector. It names exactly one
concrete physical index:

1. R -> C before migration, throughout `InProgress`, `Paused`, `CompletionPreview`, and every
   pre-cutover error/transient window.
2. Once all non-fence readiness checks are provisionally true, acquire the global mutation-
   and session-admission fence. All mutation-producing reads/writes and serving instances
   acknowledge the epoch; drain admitted work, add acknowledged write blocks to C/M, explicitly
   refresh M, and re-evaluate failures, projection generations, deletes and search visibility at
   the fence watermark.
3. While the blocks and fence remain held, perform one strict alias operation that removes R from C, removes
   `Images_Migration` from M, adds R to M, and adds `Images_Historical` to C. Verify every
   postcondition, including exactly one `Images_Historical` target C and the recorded concrete
   index UUIDs. The fixed historical alias is a moving pointer to the immediately previous
   canonical index, not immutable epoch identity; the durable epoch record retains the latter.
   Publish the new epoch. Remove M's write block only after every serving writer acknowledges
   M; keep C write-blocked. Only then admit new sessions and writes.
4. If the action fails or is ambiguous, keep the fence held until observed alias state is restored
   to verified C or completed to verified M. After verified M, release writers against R -> M.
   Retain C at least through the absolute maximum C-session lifetime; alias-only rollback is then
   forbidden without a new reconciliation barrier.

Elasticsearch performs a multi-action alias swap atomically, but absent `must_exist=true` one
failed remove can coexist with successful additions. Current Thrall does not request strict
all-action failure, so its completion action is evidence, not the selected cutover contract
(`thrall/app/lib/elasticsearch/ThrallMigrationClient.scala:93-118`;
[Elasticsearch 8.18 aliases](https://www.elastic.co/guide/en/elasticsearch/reference/8.18/aliases.html)).

**Inferred, accepted trade-off.** Progressive M visibility is not worth preserving. It currently
offers regenerated fields earlier, but not predictably: marker reset can make M stale and visible,
and unmarked copies can duplicate totals and cursors. A materialized canonical projection could
preserve progressive visibility safely, but only by becoming another continuously reconciled
write model with generation and tombstone authority. That permanent cost is disproportionate to a
temporary migration benefit; Section 9 keeps it as the valid alternative if delayed publication is
later rejected.

### 3.2 Query, totals, cursor and fallback

**Required.** Canonical live search, D3 session creation, getters and D9 query R, never C+M. Page
one, its exact total and all continuations execute inside one PIT opened after resolving R to one
concrete target. Semantic sort ends in logical `id`, making each public tuple unique because R has
one physical document namespace. PIT-local `_shard_doc` stays internal and is not persisted in
public/history cursors; current D3 deliberately removes it and the permitted D-6 evidence shows
short semantic tuples are accepted (`media-api/app/lib/elasticsearch/ElasticSearch.scala:847-885`;
`../../zz Archive/media-api-work/phase-3-d3-searchafter-post-pr-review.md:108-143`).

**Required.** A direct fallback may create its own same-target PIT and first page only when no
media-api session has been established. It must address R rather than the startup-resolved C
physical name and participate in epoch admission; a deployment that cannot gate fallback session
creation makes `CutoverReady` false. API absence therefore keeps migration safely on C rather than
allowing an ungated cutover. Current TEST startup pins the physical name once
(`kupua/scripts/start.sh:414-462`; `kupua/src/dal/es-adapter.ts:884-905`). An established session
never falls through to live direct search on network failure or expiry.

**Required.** `CompletionPreview` is a separately labelled diagnostic M surface. It neither changes
R nor supplies canonical cursors/totals. If it paginates, it owns a distinct diagnostic snapshot;
its results cannot be fed to D1, D2, D4, D9 or history as canonical coordinates.

## 4. Migration state semantics

| State or transition | Canonical user-facing behavior | Evidence / status |
|---|---|---|
| Pre-migration `NotRunning` | R -> C. New live reads use C; browse creation snapshots C. | **Inferred from Proven state.** Absence of `Images_Migration` derives `NotRunning`, and current reads/writes use current (`common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/MigrationStatusProvider.scala:36-46`; `thrall/app/lib/elasticsearch/ElasticSearch.scala:64-67`). |
| `InProgress(M)` | R remains C. M backfill and dual writes are provisional. Marked M projections are intentionally invisible canonically. | **Inferred.** Current progressive behavior is C+M/M-first (`media-api/app/lib/elasticsearch/ElasticSearch.scala:103-149,699-710`). |
| `Paused(M)` | R remains C. Existing and new canonical sessions are unchanged. Pause blocks read cutover until all queued/in-flight work is accounted for. | **Inferred from Proven behavior.** Pause stops automatic emission but manual queue work and already projected records are not drained by it (`thrall/app/lib/MigrationSourceWithSender.scala:65-127`). |
| `CompletionPreview(M)` | R remains C. Preview is diagnostic M-only and cannot issue canonical coordinates. | **Inferred from Proven insufficiency.** Preview is an alias flag and automatic scanning stops (`thrall/app/lib/elasticsearch/ThrallMigrationClient.scala:60-75`; `common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/MigrationStatusProvider.scala:36-41`). |
| `StatusRefreshError(previousStatus)` before cutover | R remains C regardless of `previousStatus`. Reads do not consult process-local status. Readiness becomes false until status and missed M work are reconciled. | **Inferred.** Current provider retains previous status only inside an error value, while read/write matches fall through to C and each process refreshes independently (`common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/MigrationStatusProvider.scala:20-27,36-80`; `thrall/app/lib/elasticsearch/ElasticSearch.scala:64-67`). |
| `StatusRefreshError(previousStatus)` after cutover | R is M and migration is `NotRunning`; ordinary writes and reads use R -> M. A status error cannot retarget R or revive C. | **Inferred from the selected alias authority.** Current non-running/error write fallback uses `Images_Current`, which is M after completion (`thrall/app/lib/elasticsearch/ElasticSearch.scala:64-67`; `thrall/app/lib/elasticsearch/ThrallMigrationClient.scala:93-118`). |
| M insert before C marker | Only C is canonical. The provisional M-only write cannot add or replace a logical hit. | **Inferred from Proven ordering.** M insert and C marker are separate writes (`thrall/app/lib/kinesis/MessageProcessor.scala:85-123`). |
| Projection upsert/marker reset before cutover | Repaired C is canonical; old M is ignored. The ID is unready until a projection derived from the new C generation is present in M. | **Inferred from Proven reset.** Projection writes only current C and deliberately wipes migration metadata (`thrall/app/lib/kinesis/MessageProcessor.scala:70-82`). |
| Projection upsert after cutover | R is M, so the same current-alias write targets M. There is no rollback-C mirror after the fence releases. | **Inferred from Proven alias-based write.** Projection replacement writes `imagesCurrentAlias`, whose target has changed to M (`thrall/app/lib/kinesis/MessageProcessor.scala:70-82`; `thrall/app/lib/elasticsearch/ThrallMigrationClient.scala:93-118`). |
| One-sided update/delete failure before cutover | C outcome controls visible state. Failure of canonical C prevents acknowledgement; failure of provisional M is recorded/retried and blocks readiness. Deletes require durable absence/tombstone evidence. | **Required from Proven partial-commit risk.** Generic operations and hard deletes can complete independently (`thrall/app/lib/elasticsearch/ElasticSearch.scala:47-69,469-499`). |
| Whole-index cutover with old sessions open | The fence blocks writes and all new session admission. After verified alias swap, new sessions snapshot M; existing C sessions become snapshot-read-only and may finish page/D1/D2/D4 plus snapshot-returned detail/enrichment/action rendering. C cannot be deleted while those PITs may exist. | **Inferred/Required.** A PIT copies target/routing at open and is not retargeted, but it does not prevent physical-index deletion ([Elasticsearch 8.18 PIT API](https://www.elastic.co/guide/en/elasticsearch/reference/8.18/point-in-time-api.html)). |
| Post-cutover `NotRunning` | R targets former M; new writes and all live reads use M. Old C sessions retain only frozen results and snapshot-bound coordinate operations. Polling may signal that a new M session exists, but live getter/D9/facet data is not merged into the C session. Detail may show retained C response data read-only; edit/delete or fresh metadata requires explicit re-anchor into M, with missing/changed state surfaced. | **Inferred from Proven completion shape and current mixed fallback risk** (`thrall/app/lib/elasticsearch/ThrallMigrationClient.scala:93-118`; `kupua/src/components/ImageDetail.tsx:221-271`; `kupua/src/stores/selection-store.ts:635-711`). |
| Cutover failure before fence release | Observe alias state while the fence stays held. Restore verified R -> C or complete verified R -> M before admitting any write/session; never infer success from a timeout alone. | **Required.** Alias updates can be applied despite acknowledgement timeout, and non-strict actions can partially succeed ([Elasticsearch 8.18 Aliases API](https://www.elastic.co/guide/en/elasticsearch/reference/8.18/indices-aliases.html)). |
| Rollback after fence release | No alias-only rollback. Reconcile/replay every post-cutover M update/delete into a new C candidate under a new global fence, then apply the same forward cutover contract in reverse, or perform a new forward migration. | **Inferred/Required.** `NotRunning` writes only current M, so historical C diverges immediately (`thrall/app/lib/elasticsearch/ElasticSearch.scala:47-69`). |

## 5. Architecture invariants

1. **Identity - Required.** One canonical result contains at most one document per logical `id`.
   Physical-copy identity never appears as a second public item.
2. **Source - Required.** A read session records one concrete physical target and read epoch at
   creation. C is authoritative before whole-index cutover, M after; no per-ID precedence or cached
   migration status can override it.
3. **Cursor - Required.** The server-issued public tuple exactly matches semantic `orderBy`, null-
   zone remapping and unique logical `id`. Approximate distributions and image-reconstructed alias
   values are not cursor authority; configured aliases are returned under `aliases` while current
   reconstruction follows dropped raw paths
   (`../../performance-first-dry-consolidation-audit-2026-09-13.md:549-574`).
4. **Snapshot - Required.** Page one, exact total, continuation, reverse walk, D1, D2 and exact D4
   use one logical snapshot. Query, filters, runtime mappings, sort version, access tier and epoch
   cannot change inside it. Elasticsearch itself requires unchanged query/sort for `search_after`
   ([Elasticsearch 8.18 pagination](https://www.elastic.co/guide/en/elasticsearch/reference/8.18/paginate-search-results.html)).
5. **Semantic ownership - Required.** media-api owns query/filter and ES clause generation from
   semantic inputs. A local Kupua fingerprint may cache or deduplicate but cannot authenticate or
   resume a server session (`../../performance-first-dry-consolidation-audit-2026-09-13.md:488-517`).
6. **Authorization - Required.** Every operation reauthenticates and the session is bound to
   principal/access class, tier and producer protocol. Possession of a handle cannot broaden
   query, sort or visibility.
7. **Lineage - Required, mechanism unresolved.** Concurrent consumers cannot choose the latest PIT
   head by HTTP response arrival order. Elasticsearch says every search may return a new ID and the
   next request must use the most recently received ID, but does not define sibling/old-ID behavior
   ([Elasticsearch 8.18 PIT API](https://www.elastic.co/guide/en/elasticsearch/reference/8.18/point-in-time-api.html)).
8. **Failure - Required.** Expiry, unknown lineage, timeout, incomplete shards or transport-state
   uncertainty publishes no coordinates and never retries live. Current D3 maps a successful ES
   response without rejecting `timed_out` or incomplete shards, and search defaults permit partial results
   (`media-api/app/lib/elasticsearch/ElasticSearch.scala:82-99,847-885`;
   [Elasticsearch 8.18 Search API](https://www.elastic.co/guide/en/elasticsearch/reference/8.18/search-search.html)).
9. **Cleanup - Required.** Close is idempotent at the semantic boundary; all resources known to the
   chosen mechanism expire or close within a measured bound. PITs retain old segments, file
   handles and deletion liveness state, so TTL-only cleanup must still pass capacity gates
   ([Elasticsearch 8.18 PIT API](https://www.elastic.co/guide/en/elasticsearch/reference/8.18/point-in-time-api.html)).
10. **Publication - Required.** Every image committed to Kupua's visible buffer brings its complete
    enrichment and authoritative tuple; discarded probes have no publication side effect
    (`../../performance-first-dry-consolidation-audit-2026-09-13.md:666-679`).

## 6. `CutoverReady` contract

**Proven:** current Thrall cannot represent this barrier. `CompletionPreview` is sufficient for
`completeMigration`; the repeating source exposes neither a stable completion watermark nor
queue/in-flight drain, manual submissions bypass pause, C migration failures cover only one class
of failure, and hard delete leaves no reconciliation ledger
(`thrall/app/lib/elasticsearch/ThrallMigrationClient.scala:25-45,93-147`;
`thrall/app/lib/MigrationSourceWithSender.scala:35-132`;
`thrall/app/lib/elasticsearch/ElasticSearch.scala:469-499`).

`CutoverReady(C,M,generation)` has two phases. Before fencing, every durable check below must be
provisionally true. The coordinator then acquires one global mutation and session-admission lease,
drains work admitted before the fence, installs acknowledged ES write blocks on C and M, and
re-evaluates the checks at one fence watermark. The closed ingress classes are: Kinesis/manual
message publication and consumption; migration projection; media-api delete/undelete eligibility
and publication; reaper candidate selection/mutation; startup `GoodToGoCheck`; scheduled/direct
maintenance; and administrative scripts. Any newly discovered ingress, independent alias mutation
or unregistered principal makes readiness false. The fence spans M refresh/search verification,
strict alias action, postcondition verification, read-epoch publication and writer/session release.
Any unknown/error is false. Thrall's migration coordinator owns the aggregate decision; each named
producer owns its admission acknowledgement and drain evidence
(`media-api/app/controllers/MediaApi.scala:332-426`;
`thrall/app/lib/elasticsearch/GoodToGoCheck.scala:17-102`;
`scripts/src/main/scala/com/gu/mediaservice/scripts/EsScript.scala:130-174`).

| Check | Evidence owner | Fail-closed result | Current representation |
|---|---|---|---|
| Automatic scan has reached the barrier watermark; automatic/manual queues and projection work admitted before it are empty; no in-flight insert/mark remains. | Migration source plus projection pipeline. | R stays C; preview may remain diagnostic. | **Absent - Proven.** Empty pages reset a repeating scroll and pause does not drain manual/in-flight work (`thrall/app/lib/MigrationSourceWithSender.scala:35-132`). |
| No unresolved backfill, generic dual-write, dead-letter or one-sided operation failure exists through the watermark. | Thrall stream/write coordinator. | R stays C; named failures reconcile or migration aborts. | **Partial - Proven.** C stores projection/backfill failures, but generic partial writes/deletes lack the same ledger (`thrall/app/lib/elasticsearch/ThrallMigrationClient.scala:121-147`; `thrall/app/lib/elasticsearch/ElasticSearch.scala:47-69`). |
| Every live logical C ID has exactly one M projection derived from a C generation at least as new as the barrier; every marker reset admitted before the barrier is remigrated. Content equality is not required because projection intentionally transforms source. | Projection producer plus migration coordinator. | R stays C. | **Absent - Proven.** Reset requeues by deleting metadata but records no generation/completion watermark (`thrall/app/lib/kinesis/MessageProcessor.scala:70-82`). |
| Every logical delete through the barrier is absent/tombstoned in both copies; no M-only orphan can reappear after cutover. | Write/delete coordinator. | R stays C. | **Absent - Proven.** Per-index hard-delete outcomes are independent and no tombstone is retained here (`thrall/app/lib/elasticsearch/ElasticSearch.scala:469-499`). |
| The epoch lease prevents publication/consumption of queued mutations, read-before-write decisions and session creates. Every serving instance/principal acknowledges the fence; queued-during-fence work remains pending; all previously admitted work drains. Acknowledged ES write blocks on concrete C/M are then the fail-safe for stale processes and uncoordinated data writes. | Migration coordinator; Kinesis/manual queue owners; media-api mutation controllers; projection, reaper, startup, maintenance, script and browse-session owners. | R stays C; no alias action while an ingress/principal is unknown, work is in flight, or either write block is unacknowledged. | **Absent - Proven.** Current operations use process-local status and different ordering; projection, reaper, syndication, startup and scripts have independent paths (`common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/MigrationStatusProvider.scala:36-80`; `thrall/app/lib/elasticsearch/GoodToGoCheck.scala:17-102`; `scripts/src/main/scala/com/gu/mediaservice/scripts/EsScript.scala:130-174`). The Add Index Block API accounts for in-flight writes before successful return ([Elasticsearch 8.18 index blocks](https://www.elastic.co/guide/en/elasticsearch/reference/8.18/index-modules-blocks.html)). |
| After final mutation drain and while both indices are write-blocked, M is explicitly refreshed and a search-level generation/count/delete oracle proves the complete barrier state is visible before any M PIT/getter is admitted. | Migration coordinator/ES search client. | R stays C; refresh timeout, stale generation or getter/search disagreement fails readiness. | **Absent - Proven.** Current writes use default asynchronous visibility, so successful writes need not yet be searchable ([Elasticsearch 8.18 refresh](https://www.elastic.co/guide/en/elasticsearch/reference/8.18/docs-refresh.html); [near-real-time search](https://www.elastic.co/guide/en/elasticsearch/reference/8.18/near-real-time.html)). |
| R resolves to the recorded C name/UUID under the fence; one strict action removes migration/current aliases and every prior `Images_Historical` association, adds current to recorded M, then adds the fixed historical alias only to recorded C. The acknowledged and independently observed postcondition proves each target before epoch publication; immutable old-epoch identity lives in the durable epoch record. | Migration coordinator/ES alias client. | Fence remains held on failure, timeout or ambiguous state until verified C restoration or M completion. | **Not present - Proven.** Current completion lacks `must_exist`, removal of prior historical associations, mutation fencing and exact target postconditions; generic alias lookup accepts `headOption` (`thrall/app/lib/elasticsearch/ThrallMigrationClient.scala:93-118`; `common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/ElasticSearchClient.scala:81-88`; [Elasticsearch 8.18 aliases](https://www.elastic.co/guide/en/elasticsearch/reference/8.18/aliases.html)). |
| C remains retained for the absolute maximum C-session lifetime and measured PIT capacity; old sessions are barred from live C adjunct reads after cutover. | Session owner plus ES operations. | Do not delete C; reject/expire old snapshot operations that cannot remain inside their PIT. | **Absent - Unknown operational policy.** PIT cannot prevent index deletion ([Elasticsearch 8.18 PIT API](https://www.elastic.co/guide/en/elasticsearch/reference/8.18/point-in-time-api.html)). |

**Inferred.** Lease admission plus acknowledged C/M write blocks is the smallest closed, race-free
handoff supported by the current write model. “All writers eventually converge” is insufficient:
generic C/M writes execute independently and full-image writes use M-then-C ordering, so an admitted
mutation can cross an unfenced alias swap (`thrall/app/lib/elasticsearch/ElasticSearch.scala:47-69,95-156`).
The team must inventory every credential able to mutate either index/alias and bound fence/refresh
duration operationally; an unknown credential keeps cutover closed.

## 7. D3/D8 contract boundary

**Inferred:** expose one versioned semantic browse-session resource. D8's PIT lifecycle is an
internal capability of that resource; current D3's search logic is an internal page operation, not
the long-term raw-PIT wire contract.

- **Create and first page - Required.** Enter epoch admission before target resolution; authenticate
   semantic search parameters, semantic `orderBy`, count intent and page size; resolve R once to the
   concrete target/epoch; open a PIT; run first page and exact total inside it; epoch-validate before
   publishing page, authoritative per-hit tuples, opaque handle and protocol/expiry metadata. A
   create resolved before a fence is either published and counted before the fence drains, or closed
   and retried after epoch release. Opening and searching are two
  ordered ES calls because PITs must be opened explicitly
  ([Elasticsearch 8.18 PIT API](https://www.elastic.co/guide/en/elasticsearch/reference/8.18/point-in-time-api.html)).
- **Continue - Required.** Handle plus issued cursor/direction identifies the immutable semantic
  context. The client does not resubmit authoritative query, ES sort, tier or epoch. Forward,
  backward, D1, D2 and D4 operations obey one transport-defined lineage rule.
- **Opaque identity - Inferred.** Raw PIT ID is an ES capability with no semantic query/sort/auth
  binding in current D3 (`media-api/app/lib/elasticsearch/ElasticSearchModel.scala:90-139`). The
  client instead receives an opaque session handle. Opaque does not imply server-side storage: an
  authenticated/encrypted state-bearing token can satisfy the boundary if 05 proves concurrency,
  retry and cleanup.
- **Expiry - Required.** Expired, missing, revoked or indeterminate state returns one terminal
  `snapshot-expired` semantic outcome. No live continuation exists. The UI may keep already loaded
  results, then create a new session and re-anchor.
- **Restore - Required.** Browser history stores semantic search and logical anchor. Restore opens
  a new session and resolves that ID/rank in the new snapshot. If absent, return an explicit
  unavailable-anchor result and use documented neighboring/fallback behavior; old tuples are hints,
  not proof of an exact position.
- **Close - Required.** Close is idempotent to callers and terminal for that handle. Exact PIT-head
  enumeration, revocation and TTL cleanup belong to 05/06.
- **Partial execution - Required.** Timed-out or incomplete-shard pages, totals, maps and ranks are
  not published. PIT open defaults fail on missing shards, but later search defaults allow partial
  results unless explicitly rejected
  ([Elasticsearch 8.18 PIT API](https://www.elastic.co/guide/en/elasticsearch/reference/8.18/point-in-time-api.html);
  [Elasticsearch 8.18 Search API](https://www.elastic.co/guide/en/elasticsearch/reference/8.18/search-search.html)).

**Order ownership - Inferred:** semantic `orderBy` replaces raw `sort` now, not through a later
versioned transition. D3 has one known pre-review client, the session must bind one semantic order,
and planned D1/D2/D4 need identical clauses. Deferring would preserve a wire format already known
to be the wrong ownership boundary. The new builder must not call or change legacy `createSort`,
and Q6's nested-exists, primary removal, remapping, reverse and overshoot cases are mandatory
fixtures (`../../../03 Ce n'est pas une pipe dream/media-api-work/d3-search-after-03-sort-options.md:108-125,148-174`;
`../../performance-first-dry-consolidation-audit-2026-09-13.md:413-440`).

## 8. Read-path convergence matrix

| Path | Epoch/snapshot relationship | Required behavior |
|---|---|---|
| media-api `prepareSearch` | **Same current R epoch; deliberately live** for non-session/Kahuna requests. | Resolve only R, not migration status, C+M or preview. Canonical paged Kupua search uses session create instead. Current `prepareSearch` reads process-local status twice and builds progressive targets/filter (`media-api/app/lib/elasticsearch/ElasticSearch.scala:699-710`). |
| Initial exact count and ticker counts | **Same browse snapshot.** | Whichever D3/D7 owner survives later planning must compute the initial exact total and any membership-derived initial counts against the created session, with one exact-count owner. Current initial search runs `countWithTickers` beside the no-PIT page (`kupua/src/stores/search-store.ts:2202-2249`; `../../../03 Ce n'est pas une pipe dream/media-api-work/media-api-01-capability-inventory.md:63-80`). |
| New-image polling counts | **Current R epoch; deliberately live.** | Polling observes post-snapshot writes and therefore uses current R. After cutover an old C browse may report only a generic refresh-available signal; M IDs/count deltas are not merged into the C snapshot. |
| Facets and filter aggregations | **Current R epoch; deliberately live unless a surface promises exact snapshot parity.** | Results may reflect ordinary post-open writes but never C+M. Any aggregation used as an exact positional/cursor oracle instead moves into the browse snapshot. Strangler currently delegates `getAggregation(s)` direct (`kupua/src/dal/strangler-adapter.ts:25-50`). |
| Sort/null-zone distributions and seek estimates | **Current R epoch for presentation; exact coordinate operations use the browse snapshot.** | Approximate histograms/ticks cannot mint cursors, totals or ranks. Current Strangler delegates date/keyword distributions and estimates direct; Q6 already separates UI inference from tuple proof (`kupua/src/dal/strangler-adapter.ts:17-50`; `../../performance-first-dry-consolidation-audit-2026-09-13.md:413-440`). |
| Typeahead/suggestion aggregations | **Same current R epoch; deliberately live.** | Suggestions may be fresh but cannot authorize or resume a browse and must not mix C/M. Current adapter aggregation paths are direct (`kupua/src/dal/strangler-adapter.ts:25-50`). |
| AI, media-api lexical and semantic search | **Same current R epoch; one operation snapshot if pagination/positional consumers are introduced, otherwise deliberately live bounded results.** | Never hardcode `Images_Current` while R may target M. Current media-api lexical/semantic requests target current directly and Kupua AI remains a direct adapter path (`media-api/app/lib/elasticsearch/ElasticSearch.scala:198-238`; `kupua/src/dal/strangler-adapter.ts:17-24`). |
| Collection counts (C1) | **Same current R epoch; deliberately live.** | Collection tree may survive without counts, but published counts cannot query C while canonical results query M. The collection store currently constructs direct ES independently (`kupua/src/stores/collection-store.ts:116-137`; `../../../03 Ce n'est pas une pipe dream/media-api-work/media-api-01-capability-inventory.md:80-87`). |
| Single-image getter and D9 | **Current R for standalone/new-session reads; snapshot-returned C data only inside an old C session.** | Never M-first/C-fallback. After cutover, old C detail/enrichment/action rendering is read-only from retained session data; live hydration, edit/delete or fresh metadata first re-anchors the logical ID into M and surfaces changed/missing state. D9 returns at most one source per ID. Current getter is M-first (`media-api/app/lib/elasticsearch/ElasticSearch.scala:103-149`). |
| D3 page one and continuation | **Same snapshot.** | Created/published together through the semantic session; unchanged query/sort/access/epoch. |
| Kupua direct fallback | **Same current R epoch and its own same-page snapshot.** | Allowed only before API session creation. Target R dynamically, open PIT then run page one in it. Never continue an API session live. Current Strangler delegates PIT lifecycle and most methods direct (`kupua/src/dal/strangler-adapter.ts:13-66`). |
| D1 position map | **Same browse snapshot.** | Map membership/order/total must describe the displayed list. 05 decides serialized chunks versus proven same-PIT branches/slices, with interactive scheduling measured. Current map owns a separate PIT (`kupua/src/dal/es-adapter.ts:1972-2178`). |
| D4 exact rank | **Same browse snapshot.** | Rank predicate and exact total use the browse sort/query/snapshot; no live `_count` substitution. The active plan already notes `_count` cannot bind PIT (`../../../03 Ce n'est pas une pipe dream/media-api-work/media-api-01-capability-inventory.md:563-600`). |
| D2 range walk | **Same browse snapshot**, not a newly opened operation corpus. | Resolve logical anchor/target and walk the order the user saw. Mechanism may serialize or use a proven branch of the same snapshot; unavailable/expired endpoints return explicitly. Current UI supplies displayed anchors (`kupua/src/hooks/useRangeSelection.ts:120-235`). |
| History restore/re-anchor | **New snapshot; child restore operation inside it.** | Recreate semantic search, resolve logical anchor and rank in the new snapshot; do not reuse expired coordinate claims (`kupua/src/lib/history-snapshot.ts:18-42`). |
| Diagnostic completion preview | **Deliberately noncanonical; own live read or operation snapshot on M.** | Clear diagnostic labelling; no canonical handle/cursor reuse, D1/D2/D4 input or history authority. |

## 9. Options scorecard

Gates are: **G1** one logical document/ID; **G2** deterministic public cursor; **G3** canonical
source in every state; **G4** page-one/continuation membership, total and order agreement; **G5**
update/delete/cutover/rollback safety; **G6** search/getter/D9/fallback parity; **G7** D1/D2/D4;
**G8** multi-instance; **G9** measurable capacity/performance; **G10** versioned rollout/rollback.
`P` passes by contract, `F` fails, `C` could pass only with the stated additional authority, and
`M` is a measurement gate. Any F in G1-G6 rejects the option before cost comparison.

| Architecture | G1 | G2 | G3 | G4 | G5 | G6 | G7 | G8 | G9 | G10 | Decision |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Current progressive C+M, marker filter, M-first getters | F | F | F | F | F | F | F | P | M | F | **Reject.** Unmarked/reset duplicates and split page/PIT targets fail correctness (`MessageProcessor.scala:70-123`; `ElasticSearch.scala:103-149,699-710`). |
| Existing `Images_Current` with today's unfenced completion | P | P | P | P | F | P | P | P | M | F | **Reject.** Current completion lacks readiness, strict all-action failure, mutation quiescence and verified postconditions (`ThrallMigrationClient.scala:93-118`; [ES aliases](https://www.elastic.co/guide/en/elasticsearch/reference/8.18/aliases.html)). |
| **Existing R, fenced whole-index cutover, semantic browse session (selected)** | P | P | P | C | C | C | C | M | M | C | **Select conditionally.** G4-G8 become pass only when epoch-admitted create, M visibility, old-session fixtures, D1/D2/D4 transport and multi-instance tests demonstrate Sections 6-10. Until then cutover is prohibited, not approximated. |
| Materialized canonical read index / one-document projection | C | P | C | P | C | P | P | P | M | C | **Correct alternative, reject after gates.** It needs permanent generation, ordering, delete/tombstone and replay authority equivalent to another write model; no current component supplies it. Choose it only if delayed M visibility is rejected. |
| Correct merge over C and M snapshots | C | C | C | C | C | P | C | P | M | C | **Reject as infeasible without materialization.** Copies of one ID can have different sort positions, so an online merge needs session-global seen/precedence state and a full distinct-ID pass for exact total. That is per-query materialization, not a bounded cursor merge (`MessageProcessor.scala:70-123`). |
| Defer API snapshot migration until index migration completes | P | P | P | P | P | P | P | P | M | F | **Keep only as rollback mode.** It passes G1-G6 only if API pagination is disabled and all direct first/continuation/getter paths use C/R; it does not govern future migrations or settle D3. |

Field collapse is not another viable progressive option: with `search_after`, Elasticsearch
requires collapse and sort on the same field, forbids secondary sorts, and reports physical total
rather than distinct groups
([Elasticsearch 8.18 collapse](https://www.elastic.co/guide/en/elasticsearch/reference/8.18/collapse-search-results.html)).

**Inferred final comparison.** The materialized projection is the only alternative that can both
preserve progressive M projection visibility and pass correctness gates. It is rejected because it
turns a temporary migration into a permanent third-copy consistency system. The selected R policy
uses Elasticsearch's native one-target/PIT strengths, contains migration inconsistency behind a
falsifiable cutover, and leaves transport optimization measurable rather than embedding global
dedup state in every browse.

## 10. Transport research brief for document 05

### 10.1 Candidates that remain viable

1. **Shared compare-and-set session state:** authoritative revision/latest PIT lineage, immutable
   semantic bindings, request replay records, expiry/close state and bounded branch inventory.
2. **Authenticated and confidential state-bearing handle:** server-verifiable immutable bindings
   plus PIT/revision/request state carried by the client; no raw PIT capability is exposed. It is
   viable only if serialized or branched use survives lost responses and all resources close/expire
   within budget.
3. **Hybrid:** signed immutable context with shared minimal replay/head/close state. This is viable
   only if it materially reduces shared hot-path cost without weakening semantics.

**Rejected without further research:** process-local authoritative state. media-api uses an
autoscaling deployment template and no checked-in singleton/stickiness guarantee exists; restart
alone also loses it (`riff-raff.yaml:10-14,55-57`). Raw client-visible PIT is excluded by the
selected semantic boundary, but a PIT ID may exist inside a protected token or shared record.

### 10.2 Falsifiable hypotheses and exact-version tests

| Hypothesis 05 must test | Deterministic test / oracle | Stop condition |
|---|---|---|
| **H1: refreshed PIT heads can be made linear or safely branched.** | On ES 8.18.3 with elastic4s 8.19.1, issue concurrent opposite-direction, D1, D2 and D4 searches from one parent; force distinct returned IDs and reverse response order. Continue from parent and both successors; relocate shards where deterministic; close each observed ID. Oracle is one snapshot order with no duplicate/missing IDs and bounded contexts. | Reject any mechanism whose chosen head depends on response arrival, whose siblings change membership/order, or whose uncloseable contexts exceed budget. ES documents only sequential “use latest ID,” not sibling behavior ([PIT API](https://www.elastic.co/guide/en/elasticsearch/reference/8.18/point-in-time-api.html)). |
| **H2: lost response and retry are recoverable.** | Drop the response after ES returns and after each possible transport commit point; retry the same request ID/revision; also send stale revision and duplicate requests. Oracle is either the identical committed page/successor or a terminal no-publication outcome with recoverable latest state. | Reject if retry can skip/repeat rows, fork authority unknowably, or require live fallback. |
| **H3: a state-bearing handle can close and expire safely.** | Lose one or more successor tokens, close using every remaining token, then observe PIT contexts, segments and TTL cleanup. Test key rotation/revocation and oversized/tampered tokens. | Reject stateless form if lost tokens leave resources beyond capacity or close cannot be made semantically idempotent. |
| **H4: multi-instance and restart preserve semantics.** | Route create and every continuation to different media-api instances; restart between open, response loss, retry and close. | Reject process affinity or any state loss that changes query/epoch/lineage. |
| **H5: binding prevents replay or widening.** | Reuse a handle under different principal/access class, tier, query, filters, semantic `orderBy`, sort-builder version, page-size bound, read epoch and protocol version. | Any accepted mismatch or hidden-ID existence signal rejects the candidate. |
| **H6: D1/D2/D4 can use the browse snapshot without starving pages.** | Interleave interactive forward/backward pages with map chunks, exact rank and range walk; expire/close mid-operation. Compare every ID/tuple/rank/range to one complete snapshot oracle. | Reject a transport that needs a fresh corpus for exact operations, corrupts lineage, or exceeds an agreed interactive-delay budget. |
| **H7: rollout and rollback are version-safe.** | Mix old/new media-api instances and clients, protocol versions, signing keys/store schemas and C/M epochs; hold sessions across R cutover and rollback. | Reject if an old producer handle is misinterpreted, silently retargeted, or cannot drain/close during rollback. |

### 10.3 Binding, lifecycle and measurements

**Required inputs:** normalized semantic query/filter identity, server sort-builder version,
principal/access class and tier, concrete target plus read-epoch ID, protocol/producer version,
creation/absolute expiry, renewable expiry bounds, and operation/request/revision identity. A cursor
must be server-issued for that session; H3's local search fingerprint is not an authority
(`../../performance-first-dry-consolidation-audit-2026-09-13.md:488-517`).

**Required lifecycle outcomes:** create either publishes first page plus usable handle or publishes
nothing and releases within a bound; duplicate continuation is idempotent or terminal; stale
revision cannot mutate authority; expiry never searches live; re-anchor creates a new session;
close is idempotent; cleanup covers response loss, instance death, partial store failure and all
observed PIT heads.

**Exact-version scope - Proven/Unknown:** source-controlled ES is 8.18.3 and elastic4s is 8.19.1;
production ES version is not checked in (`common-lib/src/test/scala/com/gu/mediaservice/testlib/ElasticSearchDockerBase.scala:12-31`;
`build.sbt:81-104`). Test that combination first, verify the deployed version without a data query,
then rerun against that exact server. Test search timeout/incomplete shards separately because PIT
open's partial-results default does not control later searches
([Elasticsearch 8.18 Search API](https://www.elastic.co/guide/en/elasticsearch/reference/8.18/search-search.html)).

**Measurements:** create/first-page and continuation p50/p95/p99 latency; ES `took`; shared-store
read/CAS/write and conflict/retry rate; token encode/verify/encrypt cost and byte size; media-api CPU,
allocation and response bytes; concurrent session/PIT count; retained segment bytes/count; heap;
file descriptors; disk reclamation delay; close/TTL success; D1/D2/D4 interactive delay; and
behavior under update/delete load. Current D3 evidence measures page/envelope work, not session
transport (`../../../03 Ce n'est pas une pipe dream/media-api-work/d3-search-after-04-performance.md:197-265`). Owners must set numeric budgets
before results are visible; no post-hoc threshold is valid.

**Universal stop conditions:** any duplicate/missing logical ID, wrong source epoch, public tuple
drift, page/total disagreement, partial-result publication, authorization replay, unrecoverable lost
response, unbounded context leak, multi-instance affinity, or inability to drain old protocol
sessions rejects the mechanism. If all candidates fail, return to Section 7's concurrency
assumption; do not weaken snapshot correctness.

## 11. Impact on active migration plan and D3 review

**Required later document changes, not edits made by this session:** routing document 00 must record
that 04 modifies 02's coupled cutover/shared-CAS/D2 recommendations; the broad migration plan must
replace progressive read and M-first D9 rules with R; the D7/D8/D9 plan must discard standalone raw
D8 and M-first D9; the D3 PR evidence must remain held; the sort companion must mark Option A
selected; and media-api agent rule 24 must be rewritten around the semantic session after 06/08.
Those active contradictions are currently acknowledged as decision inputs
(`grid-index-migration-00-routing.md:145-164`;
`../../../03 Ce n'est pas une pipe dream/media-api-work/media-api-02-next-endpoints-d7-d8-d9-workplan.md:1-25,329-340`;
`../../../03 Ce n'est pas une pipe dream/media-api-work/media-api-91-instructions-for-agents.md:101-119`).

**D3 review remains held.** Review resumes only when the reviewed contract represents semantic
`orderBy`, same-snapshot first page, opaque handle, explicit expiry/no-live-fallback, fail-closed
partial results, authoritative tuples and selected transport semantics. Current single-index PIT
walking and `_shard_doc` truncation tests remain implementation evidence, not contract approval
(`media-api/test/lib/elasticsearch/ElasticSearchTest.scala:844-1195`).

**Required compatibility direction:** existing raw D3/Option B may remain a feature-off rollback
surface during rollout, but it must not create sessions during an active migration unless all its
paths use R and same-snapshot page one. Removal waits until the maximum old-session lifetime and
mixed-version metrics show no old producer/consumer.

## 12. Residual unknowns and team decisions

| Unknown / decision | Label | Owner | Cheapest resolution |
|---|---|---|---|
| Shared CAS, protected state-bearing token or hybrid | **Measurement-needed; delegated to 05/06** | media-api/ES platform | Section 10 exact-version concurrency, loss, restart and close matrix. |
| Production ES version and partial-result cluster override | **Unknown** | Grid platform | Inspect deployment metadata/config without querying user data; run the same container oracle on that version. |
| Complete principal/ingress inventory for the closed fence classes in Section 6 | **Unknown; cutover blocker** | Thrall/Grid migration owners | Static producer/credential inventory including media-api delete publication, projection, syndication, reaper, startup, maintenance and scripts. Any unowned principal blocks readiness (`media-api/app/controllers/MediaApi.scala:332-426`; `thrall/app/lib/elasticsearch/GoodToGoCheck.scala:17-102`). |
| Durable generation, delete ledger and queue/in-flight authorities for `CutoverReady` | **Unknown; cutover blocker** | Thrall/projection owners | Contract review against every Section 6 check; no implementation estimate in this decision. |
| Maximum semantic-session lifetime, old-C read-only UX and historical-C retention | **Unknown/Measurement-needed** | Migration owner/SRE/Kupua | Exercise old-session detail/selection/poll behavior and choose an absolute lifetime from PIT capacity; C retention must exceed it. |
| D1/D2/D4 same-snapshot branching versus serialization | **Measurement-needed; semantics decided** | media-api/Kupua | H1/H6; a fresh operation snapshot is not an acceptable optimization for exact displayed coordinates. |
| Principal/access binding stable across login renewal | **Unknown** | auth/media-api | Define stable accessor claims and run H5 replay matrix. |
| Quantitative latency, CAS conflict, retained-segment, heap, FD and cleanup budgets | **Unknown** | service owners/SRE | Record budgets before Section 10 measurements. |

Delayed progressive M visibility is **not** residual uncertainty: this decision accepts its loss.
If product owners reject that behavior, the decision must be reopened explicitly and the
materialized canonical projection becomes the leading alternative; the progressive union does not.

## 13. Source coverage

**Read in full:** routing 00; prompt/findings 01/02; adjudication prompt 03; active `../../../03 Ce n'est pas une pipe dream/media-api-work/media-api-00-index.md`;
`../../../03 Ce n'est pas une pipe dream/media-api-work/media-api-01-capability-inventory.md`; D3 PR evidence and sort companion; D7/D8/D9 plan;
media-api conventions and agent instructions; D3 performance deep dive; `kupua/AGENTS.md`; and the
repository worklog.

**Current code traced:** media-api `ElasticSearch`, model, controller, routes, components and sorts;
common-lib migration status/client; Thrall migration ES client, migration client/source, message and
stream processors, controller/reaper paths; Kupua search store PIT/open/seek/extend/restore paths,
ES/API/Strangler adapters, DAL types, sort builders, selection datasource, history and offset cache;
deployment/version files (`riff-raff.yaml`, `build.sbt`, ES Docker test base).

**Existing tests inspected, not run:** media-api `ElasticSearchTest` and `SortsTest`; Thrall
`ElasticSearchTest`, `MigrationStatusProviderTest` and stream tests; Kupua search-store PIT,
position-map, ES-adapter, Strangler, history-snapshot and image-offset-cache tests; habitual E2E
README/helper exclusions. These establish single-index mechanics and mocked lifecycle behavior, not
the two-index transition/concurrency contract
(`media-api/test/lib/elasticsearch/ElasticSearchTest.scala:844-1195`;
`thrall/test/lib/elasticsearch/ElasticSearchTest.scala:772-870`;
`kupua/src/stores/search-store-pit.test.ts:76-185`;
`kupua/e2e/shared/helpers.ts:18-37`).

**Consolidation audit scope:** execution disposition and Q5, Q6, W6, H3, H6 and S5 only. The sole
archive read was active rule 24's permitted `_shard_doc` D-6 analysis. No runtime logs, tests, live
requests, TEST/CODE/PROD access, credentials, real responses or user data were used.

**External authoritative sources:** Elasticsearch 8.18
[PIT API](https://www.elastic.co/guide/en/elasticsearch/reference/8.18/point-in-time-api.html),
[pagination](https://www.elastic.co/guide/en/elasticsearch/reference/8.18/paginate-search-results.html),
[Search API](https://www.elastic.co/guide/en/elasticsearch/reference/8.18/search-search.html),
[index blocks](https://www.elastic.co/guide/en/elasticsearch/reference/8.18/index-modules-blocks.html),
[refresh](https://www.elastic.co/guide/en/elasticsearch/reference/8.18/docs-refresh.html),
[near-real-time search](https://www.elastic.co/guide/en/elasticsearch/reference/8.18/near-real-time.html),
[aliases](https://www.elastic.co/guide/en/elasticsearch/reference/8.18/aliases.html),
[Aliases API](https://www.elastic.co/guide/en/elasticsearch/reference/8.18/indices-aliases.html), and
[field collapse](https://www.elastic.co/guide/en/elasticsearch/reference/8.18/collapse-search-results.html).
Production version, load-balancer affinity, actual instance count and PIT capacity remain unread or
unavailable and are not claimed.

## 14. What done looks like

- [x] One architecture: existing single-target read/write alias R with one globally fenced,
   readiness-guarded C -> M whole-index cutover.
- [x] Progressive regenerated-M visibility is explicitly and intentionally removed.
- [x] Canonical physical source, closed ingress classes, epoch/session admission, ES write-block
   fence and search-visibility behavior are stated for every stable/transient state, projection
   reset, one-sided failure, cutover failure and post-release rollback.
- [x] `CompletionPreview` remains diagnostic and is not `CutoverReady`.
- [x] `CutoverReady` has falsifiable checks, owners, fail-closed outcomes and an explicit finding
  that current Thrall cannot represent it.
- [x] Exactly one D3 verdict: **hold for coordinated D3/D8/read-epoch change**.
- [x] Page one and continuations share a snapshot owned by a semantic session resource.
- [x] Client-visible raw PIT is rejected; opaque identity is selected without choosing CAS versus
  token.
- [x] Semantic `orderBy` is selected now; legacy Kahuna `createSort` remains excluded.
- [x] Every required and currently identified canonical read path has an epoch/snapshot
   classification; old C sessions are snapshot-read-only after cutover, counts, aggregations, AI,
   typeahead, distributions and collection counts cannot remain pinned to C, and displayed D2
   ranges remain in the browse snapshot.
- [x] Every required 02 finding is accepted, modified or rejected with replacement evidence.
- [x] All required options are correctness-gated before complexity/performance comparison.
- [x] Document 05 has candidates, hypotheses, exact-version tests, measurements and stop
  conditions for concurrency, loss, retries, multi-instance, binding, expiry, close, cleanup,
  D1/D2/D4 and rollout.
- [x] Active-plan impacts, residual owners and source coverage are explicit.
- [x] No product code, tests, live system, implementation workplan or transport mechanism was
  produced.