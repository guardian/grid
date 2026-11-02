# Batch Editing and Deletion at Scale — Research and Recommendations

**Status:** research report, 31 October 2026. No code was changed. Nothing here authorizes
implementation. Most infrastructure figures were read from Guardian PROD by the operator
(section 12). Figures marked *estimate* are derived from source code, not measured.

**Audience:** the operator (not an engineer) and future agents. **Section 0 is the decision.**
Everything after it is evidence and later options.

**2 November corrections from the editing-plan cross-check:** references below to a
"5,000 selection cap" mean the range-walk limit and metadata-cache capacity, not an enforced
ceiling on all selected IDs. Add/toggle can accumulate more; write admission must count the
actual target set, never the loaded metadata cohort. Also, current Kahuna's guided takedown
does expose exceptional single-image hard deletion; ordinary batch editing must still exclude
it. See [the editing plan](gradually-growing-teeth.kupua-edits-steps.md) for the separately gated
takedown step and current capability preparation. These corrections do not approve larger
write batches, hard deletion or any live operation.

---

## 0. Realistic Next Steps

### Tell Grid Engineers (Broken Today)

Definite, in order of evidence:

1. **Uploads can silently vanish from search** ([GRID-018](bug-backlog.md#grid-018)). Four PROD
   uploads were dropped on 30 October because of a dynamic file-metadata mapping conflict. No
   alert fired; the missing alert on `message will be ignored` is part of the problem.
2. **The `Edits` DynamoDB table is fixed at 20 writes/s for everyone, with auto-scaling off**
   ([GRID-019](bug-backlog.md#grid-019)). Any large Kahuna batch or script can throttle all
   users' edits. The fix is one setting and costs a few dollars a month.
3. **`SupplierCleanUp` destroys rights data** (section 7). It replaces the whole usage-rights
   object instead of adding a restriction, and it records the machine key, not the requester, as the actor.

Real but source-only and rare. Send these as a bundle: [GRID-011](bug-backlog.md#grid-011)
(collection-removal lost update) and [GRID-009](bug-backlog.md#grid-009)/[012](bug-backlog.md#grid-012)/[013](bug-backlog.md#grid-013)
(success reported before work completes). [GRID-010](bug-backlog.md#grid-010) is unlikely with one
shard per stream; it matters only if shards or a bulk lane are added.

### Do in Kupua (First Editing Iteration)

1. **Per-image writes through the existing endpoints** (Kahuna parity); no new batch API.
2. **Separate write-action cap of about 300 images and about 6 requests in flight.** The
   selection may stay at 5,000 for viewing. Above the write cap, disable the action and explain why.
3. **Ship in order of safety:**
   1. labels, archive and adding to collections (commutative, nothing to clobber);
   2. then single metadata fields, always read fresh just before writing;
   3. then soft delete, with confirmation;
   4. never hard delete.
4. **Keep the capabilities media-api already sends.** Every search, window and `mget` hit
   carries `actions` (including `delete`) and the `edits` link. Kupua keeps the actions but drops
   the `edits` link ([KUP-044](bug-backlog.md#kup-044)). This is a small client fix; no backend change is needed.
5. **Patch results in place after a write; do not reflow** ([KUP-043](bug-backlog.md#kup-043)).
   This is the hardest part and the most user-visible.
6. **Confirm convergence with `POST /images/count` (`ids` plus a predicate)**, not by polling each image.
7. **Plumbing:** proxy routes for metadata-editor, collections and leases behind the existing
   write guard; read permissions from `/session`, as Kahuna does. Details are in sections 9.0 and 9.0a.

### Not Now

Batch endpoints, durable jobs, a bulk lane, partition keys, raising the selection cap and PIT.
Sections 4–11 keep the evidence and designs for when real users or real scale require them.

---

## 1. Summary

**The short answer:** Kupua *can* do much better than Kahuna at batch writes, and it *should*,
but not by porting Kahuna's approach and raising the selection cap. The obstacles are not mainly
in the browser. They are in how Grid's backend accepts, orders and applies writes. Today every
batch is N independent single-image writes on the same priority lane as every user's single
edits, with no ordering guarantee, no conflict detection, no record of what the batch did and
no recovery if a write is dropped.

At Kahuna's practical scale (tens to a few hundred images) these weaknesses rarely surface.
At 5,000 images, with 2,000 users, they become operational problems:

1. **Shared capacity is small and unprotected from batches.** DynamoDB `Edits` is provisioned
   at **20 write units per second** for the whole organisation. A Kahuna-style 5,000-image
   batch would use up its burst allowance and throttle *everyone's* edits (section 4.3).
   Thrall is a single serial consumer. PROD measurements show its priority lanes do protect
   user edits from automation bursts (about 0.3 s wait under 30k background messages).
   However, user-initiated batches and today's scripts publish on the *user* lane, where a
   5,000-image batch would put about a minute of work ahead of colleagues' edits (estimate).
2. **Stale data can silently overwrite other people's edits.** A metadata edit replaces the
   *whole* user-metadata object, built by the client from what it last saw. A batch built from
   cached data can revert another person's recent change to a different field on the same
   image. The risk grows with batch size and with the age of the client's cache.
3. **Writes can be lost without anyone knowing.** Thrall makes two attempts, then acknowledges and
   drops the message, with no dead-letter queue (DLQ). DynamoDB keeps the edit, but search can
   show the old value until that image is touched again. A large batch increases the chance of
   this, especially under Elasticsearch (ES) load or during an index migration.
4. **Delete and undelete events can be applied out of order.** The soft-delete scripts have no
   version guard (`GRID-010`). PROD has one shard per stream, so reordering *within* a stream is
   unlikely today. It becomes real across the two streams, which is exactly what moving bulk work
   to its own lane would create, or as soon as a stream is resharded. Batch delete followed by
   batch undo is the pattern that exposes it.
5. **Nothing is recorded.** If a tab closes halfway through, there is no record of which
   images changed. There is no batch identity, audit trail or undo.

**Longer-term options** (detail in section 9; section 0 is what to do now):

- **Phase 0 — fix the Grid prerequisites (small, independent PRs, useful even without Kupua):**
  add timestamp or version guards to every Thrall update a bulk lane can emit (`GRID-010`
  first), fix
  detached futures (`GRID-009`/`012`/`013`) and the collection lost update (`GRID-011`), and
  triage write-admission consistency privately.
- **Phase 1 — a batch write API, not a job system:** add new endpoints accepting up to
  about 1,000 IDs per call. They should use *field-level operations* such as "set credit" or
  "add label X", not whole-object replacement. Authorization, DynamoDB writes and Kinesis
  publication should be batched on the server. Bulk traffic should go to a **separate lane**,
  the existing low-priority stream. Results should be reported per item, with an idempotency
  key and before-values that enable undo. Kupua sends 5,000 images as five calls and confirms
  convergence with a few count queries rather than 5,000 polling loops.
- **Phase 1 also covers agency notices.** They are mostly about 100 images and only
  occasionally a large spreadsheet (operator, 31 October 2026). Add a "paste supplier references
  or IDs" input that resolves to IDs and calls the same batch endpoints with a preview. That
  replaces `SupplierCleanUp` for the common case.
- **Phase 2 — a durable "operation" service: deferred, possibly never.** It is justified only if
  large (> 5,000) or query-defined operations become frequent, or legal audit requirements demand
  durable, resumable jobs. At current frequency, an occasional large spreadsheet can be submitted
  through Phase 1 in chunks from Kupua or a script that uses the same endpoints.
- **Keep the 5,000 selection cap.** Raising it does not help the real large-scale use cases,
  and it costs memory and reconciliation work in the browser. Requirements above 5,000 belong
  to Phase 2's operation-by-list/query model, as
  [selections §15](00%20Architecture%20and%20philosophy/05-selections.md#15-selections-vs-operations--separate-problems)
  already anticipated.
- **Never bulk-write ES directly** (for example with `update_by_query`). ES is a projection of
  DynamoDB and other stores; the next projection or migration would silently undo such writes.

**Infrastructure cost is negligible** (section 11). **The real cost is engineering time**
(*rough* Phase 0 1–2 weeks plus one infrastructure setting; Phase 1 6–10 weeks across Grid
and Kupua; Phase 2 4–8 weeks only if ever needed). **The risk of doing nothing** is a Kahuna-style per-image batch at 10× Kahuna's scale. It would
throttle a 20-write-per-second edits table that everyone shares, put minutes of work on the user
lane and keep agency notices in engineers' hands and hand-run scripts.

---

## 2. Orientation: Kupua's New Read Endpoints and How They Differ from Kahuna

Kupua's read migration ([API build plan](03%20Ce%20n'est%20pas%20une%20pipe%20dream/api-build/api-build-00-plan.md))
added these additive `POST` endpoints to media-api in `ImageQueryController`
([routes](../../../media-api/conf/routes)):

| Endpoint | Purpose |
|---|---|
| `POST /images/search-after` | Cursor paging with authoritative sort tuples. |
| `POST /images/window` | Arbitrary-position window, used for deep seek. |
| `POST /images/rank` | Exact position of an image in an ordering. |
| `POST /images/sort-profile` | Scrubber distribution data: scalar anchors, date statistics and buckets, and keyword pages. |
| `POST /images/keys` | Sort keys and IDs without image bodies, used for range selection. |
| `POST /images/count` | Exact counts. |
| `POST /images/aggregations` | Facets and tickers. |
| `POST /images/mget` | Up to 200 images by ID (selection metadata). |

All of them share one server helper that applies the caller's tier, the deleted-image
restriction, syndication visibility and sort validation. Clients cannot send ES DSL.

**Differences from Kahuna that matter for writes:**

| Concern | Kahuna | Kupua |
|---|---|---|
| Selection size | No general cap; practical ceiling of about 500 (O(N²) reconciliation, see [Kahuna findings](01%20Research/selections-kahuna-findings.md)) | Hard cap of 5,000 on range walks ([`RANGE_HARD_CAP`](../../src/constants/tuning.ts)), soft toast at 2,000, 5,000-entry metadata LRU |
| Selection state | Image *resources* (HATEOAS objects with action links) | IDs only (`Set<string>`); metadata in a separate LRU |
| Range selection | Loaded images only; silently drops gaps | Server walk via `/images/keys`; never drops items |
| Metadata for N images | Already loaded with each resource | `POST /images/mget`, 200 per call, 4 in flight ([`MGET_CHUNK_SIZE`/`MGET_CONCURRENCY`](../../src/constants/tuning.ts)) |
| Writes | Per-image HATEOAS links (`edits`, `delete`, `add-collection`, …) | **None yet**. Kupua is read-only ([selections §13](00%20Architecture%20and%20philosophy/05-selections.md#13-phase-3-extension-points--what-were-explicitly-leaving-room-for)). |

The key structural point is that Kupua holds **IDs, not resources**. Doing what Kahuna does would
require fetching or synthesizing a HATEOAS resource for each of 5,000 images just to obtain write
links. That alone argues for ID-addressed batch endpoints instead.

---

## 3. How Kahuna Does Batch Writes Today

Sources: `kahuna/public/js/util/batch-tracking.js`, `services/label.js`, `services/archive.js`,
`services/photoshoot.js`, `services/api/leases.js`, `services/api/collections-api.js`,
`components/gr-delete-image/`, `components/gr-undelete-image/`, `util/async.js`, and
`usage-rights/usage-rights-editor.js`.

| Operation | HTTP pattern | Concurrency | Confirmation |
|---|---|---|---|
| Metadata fields, usage rights, labels, archive, photoshoot, leases (add) | One request per image through its HATEOAS resource | `trackAll`: p-queue, **30 concurrent** per stage | Polls each image until the change appears |
| Collections add/remove | One request per image | **Unthrottled** (`$q.all`) | Polls each image |
| Soft delete / undelete | One request per image | **Unthrottled** (`$q.all`) | Polls until `softDeletedMetadata` appears or disappears |
| Hard delete | Not exposed in the UI | — | — |

**Common properties:**

- **Polling (`apiPoll`)** uses one global queue with concurrency 10, retries up to 100 times with
  waits of `500 + 10n` ms, then gives up after about **100 seconds** in total
  ([async.js](../../../kahuna/public/js/util/async.js)). For a 5,000-image batch, that means at
  least 5,000 extra GETs, and more if Thrall is behind.
- **No cancellation or recovery.** Navigating away or closing the tab abandons in-flight work.
  Nothing records which images were done.
- **Partial failure is swallowed.** `trackAll` uses `Promise.allSettled` and resolves
  successfully. Delete emits `images-deleted` even after some failures.
- **No conflict detection.** No ETag, `If-Match` or version is sent. Metadata edits send the client's
  current view of *all* overrides (`getMetadataDiff`), so the server replaces the entire
  `metadata` object.
- **Permission is checked per image.** Delete visibility is computed by checking each selected
  image's `canBeDeleted` action. Kahuna's findings document this as one cause of the
  ~500-item ceiling.

Kahuna's approach is reasonable for about 50 images and tolerable for about 500. At 5,000
it multiplies every per-request cost by 10–100 and keeps every risk listed in section 1.

---

## 4. Current Backend Write Pipeline

### 4.1 Path of an Edit

```
Browser ──PUT/POST──▶ metadata-editor / media-api / collections / leases
                        │ 1. authenticate (+ per-image uploader-or-permission check)
                        │ 2. DynamoDB UpdateItem (synchronous, no condition)
                        │ 3. Kinesis putRecord (synchronous, RANDOM partition key)
                        ▼
                    Kinesis "UI" stream (high priority)        usage service ──▶ "low priority" stream
                        │
                        ▼
                    Thrall: KCL source per stream → MergePreferred(UI > automation > migration)
                            → mapAsync(1)  (ONE message at a time per Thrall instance)
                            → 2 attempts × 20 s timeout → then ACK and DROP (no DLQ)
                        │
                        ▼
                    ES painless update on Images_Current (+ migration index if running)
                    default refresh (~1 s), no retry_on_conflict
```

Evidence: [Kinesis.scala](../../../common-lib/src/main/scala/com/gu/mediaservice/lib/aws/Kinesis.scala)
(random UUID partition key and synchronous `putRecord`),
[ThrallStreamProcessor.scala](../../../thrall/app/lib/ThrallStreamProcessor.scala) (priorities,
`MergePreferred` and `mapAsync(1)`),
[ThrallEventConsumer.scala](../../../thrall/app/lib/kinesis/ThrallEventConsumer.scala)
(retry, then drop),
[ElasticSearch.scala](../../../thrall/app/lib/elasticsearch/ElasticSearch.scala)
(`migrationAwareUpdater` and scripts),
[DynamoDB.scala](../../../common-lib/src/main/scala/com/gu/mediaservice/lib/aws/DynamoDB.scala)
(`update` without a condition and `jsonAdd` with "send the WHOLE document"), and the
[P33 lifecycle report](03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-09-p33-grid-edit-delete-collection-lifecycles.md).

**DynamoDB is the source of truth. ES is a projection.** The `metadata`, `labels`, `archived`,
`usageRights` and `photoshoot` fields live in the `Edits` table. Soft-delete status, collections,
leases, usages, crops and syndication each have their own store. The image-loader projection
endpoint rebuilds an image from all of them
([ImageDataMerger.scala](../../../common-lib/src/main/scala/com/gu/mediaservice/ImageDataMerger.scala)).

### 4.2 Write Semantics by Field

These semantics decide what is safe to batch:

| Field / action | DynamoDB semantics | Conflict behavior | Batch safety |
|---|---|---|---|
| `metadata` (description, byline, credit and other fields) | `SET metadata = <whole map>` | **Lost update.** The last writer replaces every field, including fields it did not intend to change. | ❌ unsafe at scale as implemented |
| `usageRights` | `SET usageRights = <whole object>` | Lost update across rights subfields. | ⚠️ acceptable only as a deliberate replacement |
| `labels` | DynamoDB string set `ADD`/`DELETE` | **Commutative and conflict-free.** | ✅ safe |
| `archived` | Boolean `SET`/`REMOVE` | Idempotent; the final value wins. | ✅ safe |
| `photoshoot` | `SET` plus syndication fan-out to other images | Fan-out amplifies the change. | ⚠️ needs care (one edit can update many images) |
| Collections add | Atomic list append | Duplicates are possible. | ✅ mostly |
| Collections remove | **Read, filter, write without a condition** | Lost update (`GRID-011`). | ❌ unsafe concurrently |
| Leases add | Leases service write | Independent records. | ✅ |
| Soft delete / undelete | Status table and event | **No ordering guard** (`GRID-010`); 202 can return before persistence (`GRID-012`). | ❌ until fixed |
| Hard delete | Event → ES delete → S3 delete | Irreversible; skipped when not `canBeDeleted`. | Not for batch UI |

**Metadata stores `metadata` as a DynamoDB map** (`jsonAdd` → `AttributeValue.fromM`). Atomic
field-level updates such as `SET metadata.credit = :v` are therefore technically possible
without a schema migration. That is the most important enabler in this report.

**ES ordering for metadata** is protected by a `userMetadataLastModified` timestamp guard in the
painless script: an older message cannot overwrite a newer one. **Soft delete and undelete have
no equivalent guard.** Partition keys are random, so on a multi-shard stream two messages for
the same image can land on different shards and be applied in either order. **Guardian PROD
has one shard per stream** (operator, 31 October 2026), so today the order within a stream is
already preserved. Messages for the same image on *different* streams (UI and low priority) are
reordered by design, because UI is preferred.

### 4.3 Throughput and Head-of-Line Blocking (*Estimates*)

Thrall reads all shards of both streams into one merged stream and processes **one message at a
time** (`mapAsync(1)`). Throughput per instance is therefore about `1 / (ES round trip + script)`.
At a plausible 20–50 ms per update, that is about 20–50 messages per second per Thrall instance.

- A 5,000-image batch means 5,000 messages, or about **2–4 minutes of Thrall time per instance**.
  The total depends on how many instances share the shards (*unknown*).
- Every user's single edit uses **the same high-priority lane**. If a batch lands just
  before your edit, your edit waits behind it.
- Kahuna's `apiPoll` gives up after about 100 seconds. A colleague's edit made during
  someone else's 5,000-image batch can therefore show as failed in Kahuna, even though it later
  applies.
- Several users running large batches at once multiply the delay. With 2,000 users, that
  becomes a normal working-day event, not an edge case.

**Scale context.** Operator-supplied infrastructure facts (31 October 2026, Guardian PROD):
**Thrall runs as a single `t4g.small` instance** (2 burstable vCPUs, 2 GB). Metadata-editor runs
on two `t4g.small` instances. A full index migration is rare (the last was roughly two years ago)
and took **about two days**, from recollection. The largest recent agency notice covered about
6,000 images.

A single Thrall instance means **one global serial queue for every write from every user**. A
5,000-message batch delays *all* other edits by Thrall's processing time for those 5,000
messages. The instance uses `unlimited` CPU credits, so it is not throttled when credits run
out (extra cost instead). Its peak CPU on the available graph was about 16%, so CPU is not the
constraint. Serial processing is.

**Kinesis:** UI and low-priority streams are each **1 provisioned shard**: 1,000 records/s or
1 MB/s write, and 2 MB/s and five `GetRecords` calls/s read, per stream. A batch publisher must
pace itself below about 1,000 records/s, and well below that to leave room for everyone else.
**DynamoDB:** the `Edits` table is provisioned at **20 write capacity units (WCU) and 20 read
capacity units, with auto-scaling off for both**. Its `Photoshoots` global secondary index (GSI)
has 4/4, also with auto-scaling off. The table holds ~6.68M items in 1.7 GB, so the average edits
item is about **250 bytes**. Each edit therefore costs 1 WCU, and the table sustains
**20 edit writes per second for the whole organisation**. No throttling appeared in two weeks.
- DynamoDB keeps up to about 300 seconds of unused capacity as best-effort burst, about
  6,000 WCU when fully idle.
- A Kahuna-style batch at 30 concurrent writes runs at roughly 100–200 writes/s. It drains the
  burst in about 30–75 seconds, after **roughly 3,000–7,500 writes**, and then **throttles**.
- A single 5,000-image batch might squeeze through on a quiet table. A 6,000-image agency run, or
  two people running batches at once, would not.
- When the table throttles, the SDK retries and then the user sees errors. *Every other user's
  edits throttle too*, because the table is shared.
- The `Photoshoots` GSI is sparse, so only images with a photoshoot use it. A batch photoshoot
  edit is limited to about 4 index writes per second after burst, and GSI throttling also blocks
  base-table writes.

**This is the tightest bottleneck found, tighter than Thrall.** A 6,000-image agency run that
sets usage rights writes to this table and probably hit it. The run was outside the two-week
metric window. Mitigation is cheap: on-demand capacity or auto-scaling (section 11). Any batch
endpoint must pace DynamoDB writes regardless.

The Guardian PROD index baseline from
[mapping enhancements §10](mapping-enhancements.md#10-cost-estimates--prod-calibrated) is about
9.8M images and 16.7M ES documents (the remainder are nested usage/collection objects), a
134 GB primary store and 5 primary shards with replicas. Every scripted update rewrites the whole
image source **and its nested documents**. Heavily used images therefore cost more per edit,
and the 2–4 minute estimate above is for typical images.

**Sensitivity for a larger installation.** BBC PROD might be roughly **5× larger**. That is an
operator's hunch, not data: about 50M images, comparable to Guardian's former 56M peak.
- Costs that scale with **batch size** are unchanged by corpus size: DynamoDB writes, Kinesis
  records and Thrall messages for 5,000 images.
- Costs that scale with **corpus size** grow:
  - Index migrations last about 5× longer, so more batches overlap a migration (section 10).
  - Phase 2 manifests and query-defined operations become larger.
  - ES per-update cost rises modestly with segment count and merge pressure.
- Costs that scale with **user count** create lane contention: more concurrent batches on a
  serial consumer. If a larger installation also has more users, head-of-line blocking is the
  first thing to break. Moving bulk traffic to its own lane (Phase 1) matters *more* there, not less.

The **low-priority stream already exists** and is preferred *below* UI traffic.

**What else shares the UI lane** (source-verified): image-loader (**every upload**, about 65k
images a day per the operator), metadata-editor, media-api (deletes), leases, collections,
cropper and part of the usage service publish to the UI stream. Only the usage service's
`UsageNotifier` uses the low-priority stream. Roughly half of the ~140k UI-lane messages a day
are therefore new uploads.

A user batch on the UI lane delays not only colleagues' edits but also **new photographs
appearing in Grid**, which matters in breaking news. A large agency ingest burst likewise delays
users' edits. This strengthens the case for a separate bulk lane.

**The reaper is a different path.** It runs inside Thrall on a timer, by default every 15
minutes, with up to 1,000 soft and 1,000 hard deletions per run, or at most 96k/day of each
([ReaperController.scala](../../../thrall/app/controllers/ReaperController.scala)). It selects
IDs with a search and applies them with an **ES `_bulk` request through `migrationAwareUpdater`**.
It does not go through the Kinesis queue. It competes with the queue for ES and the
`t4g.small`'s CPU, but not for queue position. It is also Grid's **existing precedent for a safe
server-side bulk update**: it is bounded, scheduled, migration-aware, pausable and records each
batch in S3. A Phase 1 batch endpoint could reuse this ES bulk pattern, while still writing
DynamoDB first as the source of truth. The configured count per run in PROD is unknown; Kibana
`"Soft deleting next" AND app:thrall` shows it.

### 4.3a PROD Measurements (Kibana, 10-Day Window Ending 31 October 2026)

Source: Thrall `Record processed` logs (`duration` = milliseconds Thrall spent on one message).
The operator ran the queries; values are aggregates only.

| Measure | Value | Reading |
|---|---|---|
| Messages processed | ~5.3M in 10 days (~530k/day, ~6/s average) | All on one serial consumer |
| UI lane (`high`) vs automation (`low`) | ~1.4M vs ~3.9M (free-text match, approximate) | User-originated writes are ~140k/day |
| Median processing time | ~10 ms | Theoretical capacity ~100 messages/s |
| 99th percentile | Usually ~140 ms, sometimes ~475 ms | Some messages are much more expensive (likely large or nested documents) |
| Peak bucket (27 Oct, 16:40, 10-minute buckets) | ~20k messages; summed duration ~281 s | **~47% busy** over that 10 minutes (~33 messages/s); individual minutes inside it may have been close to saturation |
| Typical daily peak | Summed duration > 50 s per 10-minute bucket on most days, including Saturday | ≥ 8% busy at daily peaks; the all-day average is about 7% (530k × ~12 ms) |
| 27 Oct 16:30–17:00 mix | `high` ~6.9k, `low` ~30.4k | The burst was mostly automation traffic |
| Kinesis iterator age, maximum, same half-hour | UI lane ~49 s; low lane ~6 s | Not representative of user wait (see next row) |
| **Actual wait of UI-lane records** (`start − recordArrivalTime`, 4 samples each) | **0.23–0.32 s during the spike**; 0.02–0.25 s on a quiet Sunday | **30k automation messages did not delay user edits.** Lane priority works. |
| Dropped ("message will be ignored") | **10 in 10 days** | Low. None were user edits (see finding below). |

**Interpretation:** Thrall has plenty of *average* headroom (~7% busy). Measured samples show
that the UI lane is isolated from automation-lane bursts: user edits started within about
0.3 seconds even while about 30,000 automation messages were being processed. Bulk work is
therefore harmless to colleagues **when it is on the low lane**. It is a queueing problem only
when it shares the UI lane, which is where Kahuna-style batches and today's hand-run scripts put
it, because metadata-editor and media-api publish to the UI stream. There, a 5,000-image batch
puts about 50–70 seconds of serial work (5,000 × 10–14 ms) ahead of a colleague's next edit.
That estimate is from median timings and has not been observed. The measurement turns the
lane-separation recommendation from a hypothesis into a demonstrated mechanism, provided ordering
guards exist (section 6).
Why the UI lane lagged more than the low lane during an automation-heavy burst is unexplained.
Both are single shards. Iterator age measures how old records are *when fetched*, not when
processed. Records already fetched wait in Thrall's in-memory buffer, so iterator age can
understate the real wait. The definitive measure is `start − recordArrivalTime` on individual
`Record processed` log lines (section 12).

### 4.3b Finding: Uploads Rejected by Dynamic File-Metadata Mapping (Grid, Log Evidence)

On 30 October 2026, **four uploaded images failed to index** (five `ImageMessage` failures,
one apparently a retry). The error from ES was `document_parsing_exception`: "object mapping for
`fileMetadata.xmp.avm:Distance` tried to parse … as object, but found a concrete value". The four
`UpdateEmbeddingMessage` failures in the same window are for **the same four image IDs**. They
failed with `ElasticNotFoundException` because the images never reached the index.

- **Mechanism:** `fileMetadata.*` is dynamically mapped
  ([Mappings.scala](../../../common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/Mappings.scala)).
  The first document to contain an XMP key fixes its type. A later file whose XMP has the same
  key in another shape (scalar instead of struct) is rejected *as a whole document*. Thrall then
  drops the message after two attempts.
- **Impact:** the upload succeeds from the user's point of view (S3 and image-loader). However,
  the image is absent from search until it is reingested, and reingestion will fail the same way.
  The embedding is also lost.
- **Why it matters here:** this is the same "acknowledge and drop, no DLQ, nobody told" path as
  section 4.4. Here it is observed in PROD, not inferred from source.
- **Candidate fixes (for engineers, not implemented):** normalize XMP values to one shape before
  indexing, or map `fileMetadata.xmp` as `flattened`/non-indexed. On a parse error, retry with the
  offending `fileMetadata` subtree stripped rather than dropping the image. Add an alert on
  `message will be ignored`. Affected image IDs (30 October 2026):
  `cc8fc914d8f1694675952618c0ef500e94af6297`, `9a4865f934301c5d37572a97d24204bfaa420cc7`,
  `8533a736cfe90dafa756b2c4145718a68ec0754c`, `4fb77af82701f5c286500093e51420d636f620ac`.
  These IDs were extracted from the Kibana export by co-occurrence with the failure message. Check
  them before acting. Only the usage
service publishes to it today. Routing bulk writes there is the cheapest effective isolation:
interactive edits always overtake bulk ones.

Upstream of Thrall, each request to metadata-editor performs a **blocking** DynamoDB
`updateItem` and a **blocking** Kinesis `putRecord` inside a `Future`. For non-privileged users,
`actionFilterForUploaderOr` also calls media-api to obtain the uploader of *each* image
([Authorisation.scala](../../../rest-lib/src/main/scala/com/gu/mediaservice/lib/auth/Authorisation.scala)).
A browser running 30 concurrent writes therefore creates about 30 blocked threads per user on the
write services, plus a media-api lookup for each image.

### 4.4 Failure and Loss

- **Producer side:** DynamoDB and Kinesis are not transactional. If `putRecord` fails after
  DynamoDB commits, the client sees an error, but the edit exists in DynamoDB and never reaches ES
  (the declared limitation in P33). Detached futures make some outcomes invisible
  (`GRID-009`, `GRID-012`, `GRID-013`).
- **Consumer side:** after two failed attempts, the message is **acknowledged and dropped**. A
  burst of 5,000 scripted updates makes ES rejections (`429`), timeouts and version conflicts
  more likely. Thrall's update requests do not set `retry_on_conflict`.
- **Detection:** media-api has a per-image `GET /images/:id/projection/diff` (ES compared with
  the source projection). Nothing runs it systematically.

The consequence is that **no layer today can tell a user "all 5,000 changes are in search"**.
Kahuna's per-image polling is the only check, and it gives up after about 100 seconds.

---

## 5. What It Would Mean to Delete 5,000 Images

Deletion is three separate things, so "delete" must be precise:

| Kind | What happens | Reversible | Today |
|---|---|---|---|
| **Soft delete** | DynamoDB status record plus ES `softDeletedMetadata` marker; hidden from default search | Yes (`PUT /images/:id/undelete`) | Per image, Kahuna batch with `$q.all` |
| **Hard delete** | ES document removed and S3 original/thumbnail/optimized files deleted | **No** (the DynamoDB edits record is retained) | Per-image route; not used by Kahuna |
| **Reaper** | Scheduled batch soft and hard reap by eligibility, writing ES directly in bulk | Soft: yes | Thrall `doBatchSoftReap`/`doBatchHardReap` |

**Preconditions for each image:** `canBeDeleted` (no usages and no exports), *and* either the
user is the uploader or has `DeleteImage`. For agency material in particular, **many images have
usages and cannot be deleted**. This is why `SupplierCleanUp` falls back to restricting rights and
adding a deny lease (section 7).

**A 5,000-image soft delete therefore needs:**

1. **Per-item classification before execution:** deletable, blocked by usages/exports, or
   forbidden. This is a preview, not a surprise afterwards. It needs a server-side check over
   N IDs, not N calls to `canBeDeleted`.
2. **Ordering protection** (`GRID-010`) before offering undo. Batch delete followed by
   batch undo is the classic reordering trigger.
3. **Honest completion reporting:** 202 must mean "persisted and published" (`GRID-012`), and
   convergence in search must be verified, not assumed.
4. **Kupua UX:** images disappear from current results, so focus, position and selection must handle
   holes in the buffer. Selected IDs that are now deleted should be dropped or flagged, as the
   [selections drift design](00%20Architecture%20and%20philosophy/05-selections.md#9-drift-handling--selection-vs-search-results)
   anticipates.

**Hard delete should not be a Kupua batch action.** It is irreversible, and soft delete plus the
reaper already provide the delayed-purge model (Google Drive's trash is the prior art). If legal
takedown requires immediate removal, use the Phase 2 operation with stronger gates and an audit
trail, not a toolbar button.

---

## 6. Concurrency and Conflicts — Current Behavior and What It Should Be

**Current behavior:** last writer wins at the level of the *DynamoDB attribute*. For `metadata`,
that attribute is the *whole map*.

Example: Alice batch-sets `credit` on 3,000 images using Kupua's selection cache, loaded
10 minutes ago. Meanwhile Bob corrected the `description` of 40 of those images. If Kupua sends
whole metadata objects, as Kahuna does, Bob's 40 corrections are silently reverted. Nobody is told.

Kahuna has the same flaw. Its smaller batches, short-lived selections and fresh resources make it
rarer. Kupua's selection survives reloads, sorts and density changes, and its cache can be
older, so **porting the Kahuna approach would make this worse**.

**Recommended semantics** (consistent with prior art in section 8):

| Operation type | Semantics | Conflict policy |
|---|---|---|
| Set or clear one metadata field | Server-side `SET metadata.<field> = :v` / `REMOVE` | Last writer wins **per field**. This matches user intent; no version check is needed. |
| Add or remove labels, archive, add collection | Commutative set operations | No conflict possible. |
| Replace usage rights (whole object) | Replacement with optional `expectedLastModified` (`ConditionExpression`) | A conflict is reported as a per-item failure: "changed since you looked". |
| Remove collection | Fix `GRID-011`: conditional write or set semantics | A conflict leads to a retry. |
| Soft delete / undelete | Lifecycle version guard in ES (`GRID-010`) | The newer operation wins deterministically, on any stream or shard. |

**Version guards, not partition keys, are the real fix.** Using the image ID as the partition key
would preserve per-image order *within* a multi-shard stream. Guardian PROD has one shard per
stream, so this is irrelevant today. It never helps across the UI and low-priority streams.
Separating bulk traffic into its own lane therefore **requires** every message type that bulk
work can emit to be guarded by a timestamp or version, as metadata already is. Soft delete,
undelete (`GRID-010`) and any others found must be guarded first. The partition-key change
remains a cheap safeguard for installations with more shards, for example if BBC is sharded.

**Same user, double submit** (double click or retry after a timeout) needs an idempotency key
on the batch call.

**Two users with overlapping batches:** field-level semantics make this well defined (last writer
wins per field). That is acceptable and matches what users expect from Kahuna today.

---

## 7. Hand-Run Scripts — Can Kupua Replace Them?

[`SupplierCleanUp.scala`](../../../scripts/src/main/scala/com/gu/mediaservice/scripts/SupplierCleanUp.scala)
is the current "agency notice" tool. It:

1. reads a CSV of supplier references (PROD) and looks each one up with `GET /images?q=suppliersReference:<ref>`
   (50 concurrent, in groups of 1,000, with 2 seconds between groups);
2. calls `DELETE /images/:id` for each image;
3. on `405` (not deletable, usually because the image has usages), **replaces the entire
   usage-rights object** with `{category: chargeable, restrictions: "No longer available…"}`
   and adds a `deny-use` lease;
4. prints outcomes to stdout.

[`BulkRemoveFromCollection`](../../../scripts/src/main/scala/com/gu/mediaservice/scripts/BulkRemoveFromCollection.scala)
and [`EyeVine`](../../../scripts/src/main/scala/com/gu/mediaservice/scripts/EyeVine.scala)
follow the same pattern: hand-assembled ID lists, an engineer's API key and per-image HTTP calls.

**Problems with this as a recurring legal or business workflow:**

- **Attribution:** the actions are made by a machine key. Internal API keys pass
  `isUploaderOrHasPermission` unconditionally. The editorial or legal person who requested the
  action is not recorded on the image.
- **Data integrity:** step 3 discards existing rights detail (supplier, original category and
  restrictions) instead of adding a restriction.
- **No preview or dry run:** you learn how many images were deleted versus restricted only afterwards.
- **No resumability:** a crash halfway through leaves you to grep stdout.
- **50-way concurrency on the high-priority lane** creates exactly the head-of-line blocking described in section 4.3.
- **Engineer dependency:** a legal deadline waits on someone with PROD keys and sbt.

**Can Kupua do it?** Yes. The UI is not a selection. It is a form: paste or upload references
or IDs → server resolves them → **preview** ("112 images: 90 deletable, 20 have usages → will be
restricted, 2 not found") → confirm → Phase 1 batch calls → progress → downloadable report. The same
pipeline covers "remove collection X from these IDs" and "label every image matching this query".

**Should it?** Yes, through Phase 1, not Phase 2. Notices are mostly about 100 images and
large ones are rare (operator, 31 October 2026). The value lies in removing engineers from the
loop and fixing attribution and rights clobbering. Scale is not the driver. A
"paste references → preview → apply" form on top of the Phase 1 batch endpoints is enough.

---

## 8. Prior Art — What Mature Systems Converge On

Summarized from vendor and engineering documentation. Internal architectures of closed products
are inferred from documented behavior and marked accordingly.

- **Three tiers by size.** Small batches are synchronous. Medium batches are chunked, with
  progress. Large or query-defined sets become a **job resource** with status and per-item
  results: Salesforce Bulk API 2.0, Jira bulk change (background task, historically capped at
  about 1,000 issues), AEM asset jobs (*inferred*) and Cloudinary delete-by-tag/prefix.
- **Snapshot the selection.** Resolve a query into a fixed ID manifest at submission (Jira
  freezes the JQL result), so the job is deterministic, resumable and auditable.
- **Partial success is normal.** Google AIP-233 explicitly allows partial success for
  asynchronous batches of "complex resources", while requiring atomicity only for simple
  synchronous batches. Grid's case is the former.
- **Long-running operation shape** (Google AIP-151; Microsoft REST guidelines): `202` plus an
  operation resource with `done`, progress metadata and a result or error. The guidance says
  "long-running" begins at roughly 10 seconds.
- **Idempotency keys** (Stripe; Azure `Repeatable-Request-ID`) make a retried submission return
  the same job instead of starting a second one.
- **Commutative operations beat whole-object replacement.** DynamoDB set `ADD`/`DELETE` is
  conflict-free. Whole-object replacement should use optimistic concurrency
  (`ConditionExpression`, ETag/`If-Match`) and report conflicts per item.
- **Bulk traffic must not compete with interactive traffic.** GitHub tells API clients to
  avoid concurrent mutations and to back off. ES `update_by_query` has `requests_per_second`
  throttling. Kinesis limits each shard to 1,000 records/s or 1 MB/s.
- **Reversibility is bounded.** Gmail's undo lasts seconds; Drive's trash lasts 30 days. Nobody
  offers indefinite undo for bulk destructive actions. Grid's soft delete plus reaper already
  matches the Drive model.
- **Durable audit trail** per job and per item (who, what, before → after), queryable after
  the objects change again (Salesforce results feed; AEM audit, *inferred*).
- **Limits worth knowing:** DynamoDB `BatchWriteItem` allows 25 items and has no conditions.
  `TransactWriteItems` allows 100 items or 4 MB, all-or-nothing. Kinesis `PutRecords` allows
  500 records per call. ES `terms` queries default to at most 65,536 terms
  (`index.max_terms_count`).

**Negative prior art:** do not run ES-native bulk mutations (`update_by_query`) against a
projection index. It is fast, but it bypasses the source of truth. The next projection,
reingestion or migration would quietly undo it, and migration-aware dual writes would be skipped.

---

## 9. Recommendations in Detail

### 9.0 First Iteration (Prototype, No Real Users): What Is Actually Needed

Most of sections 4–6 is about **scale and shared PROD capacity**. A first Kupua editing iteration
used by the operator on local/TEST needs very little of it. It only has to avoid harming shared
systems and other people's data. The minimum:

1. **Cap and pace on the client.** Use a selection cap for write actions of about 200–500
   images and about 6–10 concurrent requests. That keeps DynamoDB use well inside its burst
   allowance (section 4.3), even against PROD's 20 WCU, and keeps the UI lane short. No backend
   change is needed.
2. **Read fresh before replacing metadata.** Existing `PUT /metadata/:id/metadata` replaces the
   whole object. Fetch the current edits immediately before each write, rather than using the
   selection cache, and change only the intended field. This avoids clobbering other people's
   edits (section 6) at the cost of one extra read per image.
3. **Use per-image routes Kahuna already uses** for labels, archive, usage rights, photoshoot,
   leases, collections and soft delete/undelete. Skip batch hard delete.
4. **Confirm convergence with existing `POST /images/count`** using `ids` plus a predicate,
   instead of polling each image.
5. **Prototype safeguards stay:** the Vite write guard (`VITE_GRID_API_WRITES_ENABLED`, see
   [infra safeguards](infra-safeguards.md)) and per-session operator approval for writes
   against any shared environment.
6. **Result stability after a write is a Kupua design problem, independent of scale.** Cursor
   paging survives writes, but position maps, totals and selection invariants do not. Writes
   that delete, re-filter or re-sort images, including any edit under `lastModified` sorting,
   reflow results. See [KUP-043](bug-backlog.md#kup-043) for the analysis and the candidate
   "patch in place, do not reflow" direction. Capability flags for gating Edit and Delete are
   [KUP-044](bug-backlog.md#kup-044).

Phases 0–2 become relevant when Kupua has real users, or when anyone wants batches larger than
a few hundred against PROD.

### 9.0a Gaps in Current Endpoints for Kupua Writes (Source-Verified)

| Gap | Why it matters to Kupua | Smallest fix |
|---|---|---|
| **Kupua drops the `edits` capability link** (corrected). The new endpoints already return per-image `links`/`actions` exactly like `GET /images/:id`: `edits`, and `delete` including `canBeDeleted`. Kupua keeps `actions` in enrichment but discards the `edits` link. | Without it Kupua cannot tell which selected images the user may edit. | Client-only: retain `edits`-link presence in enrichment ([KUP-044](bug-backlog.md#kup-044)). |
| **Metadata is whole-object replacement only.** | Read-modify-write is per image and races with concurrent editors. | First iteration: read fresh (9.0, item 2). Later: a field-level `PATCH` (`SET metadata.<field>`). |
| **Write services have no Kupua proxy routes.** Only `/api` (media-api) is proxied. metadata-editor, collections, leases, cropper and usage are separate services. | Browser writes cannot reach them in the dev setup; hosted mode needs a CORS/origin check. | Add satellite proxy prefixes behind the existing write guard; check [deployed-via-Kahuna](00%20Architecture%20and%20philosophy/09-deployed-via-Kahuna.md) hosting. |
| **No batch routes anywhere.** | N requests for N images. | Acceptable at prototype caps; Phase 1 later. |
| **Global user permissions** come from auth `GET /session` (Kahuna). The media-api root advertises a `permissions` link with no matching media-api route. | Kupua needs session permissions to show or hide write UI at all. | Read `/session`, as Kahuna does. |
| **Upload** (`image-loader` `/prepare`, `/images`, `/imports`) | A write Kupua does not do yet. | Out of scope here. |

---

### 9.1 Phase 0 — Grid Prerequisites (Do First; Valuable Regardless)

Each item is a small, separately reviewable Grid PR or infrastructure change that also helps Kahuna:

0. **DynamoDB `Edits` capacity:** switch to on-demand, or enable auto-scaling with a sensible
   maximum, for the table and the `Photoshoots` GSI. This is an infrastructure change of a few
   dollars a month, needed before *any* batch feature, including today's scripts.
1. **`GRID-010` and an audit of every Thrall update script for a timestamp or version guard.**
   This is a prerequisite for a separate bulk lane, because cross-lane order is not preserved.
2. **Partition key = image ID** in `Kinesis.publish`. This is cheap insurance for multi-shard
   installations and has no effect on Guardian PROD today.
3. **`GRID-012`, `GRID-009`, `GRID-013`:** make returned futures cover persistence and publication.
4. **`GRID-011`:** make collection removal conditional or set-based.
5. **Private triage of write-admission consistency** across metadata-editor routes (see the
   private disposition in P33). A batch endpoint must not amplify an admission gap 1,000-fold.
6. **Observability** (each item would have answered a question in this research without manual digging):
   - In Thrall's `Record processed` log, emit `subject` and `recordPriority` as top-level
     indexed fields, not only inside `event_original`. Add a numeric
     `queueWaitMs = start − recordArrivalTime`, so lane lag can be charted directly.
   - Add **producer attribution** to every Thrall message and to the producer's
     `Publishing message to kinesis` log: the originating app, principal type (user or API key
     *name*, never the key) and an optional `batchId`. Spikes such as 27 October then become
     attributable in one query.
   - Raise an alert or metric on `message will be ignored` (section 4.3b shows real loss going unnoticed).
   - Add CloudWatch alarms on DynamoDB `Edits` throttling (table and GSI) and on Kinesis
     iterator age per stream.

### 9.2 Phase 1 — Batch Write API (the Kahuna-Beating Core)

**Server (Grid):**

- New ID-addressed endpoints, for example `POST /metadata/batch` in metadata-editor,
  `POST /images/batch-delete` and `/batch-undelete` in media-api, and batch add/remove for
  leases and collections. Each accepts **≤ 1,000 IDs** (tunable) and a list of **typed
  operations**: `setField`, `clearField`, `addLabels`, `removeLabels`, `setArchived`,
  `replaceUsageRights{expectedLastModified?}`, `addLease`, and others.
- **Authorization done once per batch:** one permission check, plus one ES `ids`/`terms` lookup
  for `uploadedBy`/`canBeDeleted` when the user lacks the blanket permission. This replaces up to
  1,000 cross-service calls.
- **DynamoDB:** one `UpdateItem` per image with a field-level expression, bounded server-side
  parallelism (for example 16–32) and backoff on throttling. `BatchWriteItem` cannot express
  field updates.
- **Kinesis:** `PutRecords` (≤ 500 per call) to the **low-priority stream**, paced well below
  one shard's limit of 1,000 records/s. Only message types with ordering guards may use it
  (Phase 0, item 1).
- **Response:** per-item outcome (`ok`, `forbidden`, `notDeletable`, `conflict`, `error`), plus
  the **before-values** for each changed field. The client then has enough to offer
  "Undo this batch" as another batch with `expected*` guards.
- **Idempotency key** per call. A replay returns the stored result for a short TTL.
- **Batch ID and actor** recorded on each message and logged in a structured form. This gives a
  basic audit trail before Phase 2.

**Client (Kupua):**

- **Chunked submission:** 5,000 IDs become five calls, one or two in flight. Persist the progress
  cursor in `sessionStorage` so a reload can offer "resume / discard" and a closed tab is
  recoverable within the session. That is a large improvement on Kahuna's nothing.
- **Convergence check without per-image polling:** after submission, run a periodic
  `POST /images/count` with `ids:[chunk] AND <predicate>`, for example
  `userMetadataLastModified ≥ batchStart` or `label:X`. Four or five count queries per second
  replace 5,000 GET loops, at negligible ES cost. Reconcile stragglers once with `mget`.
- **Preview before destructive actions:** counts by outcome class from a dry-run flag on the same
  endpoint. Confirmation is required above a threshold, with the planned `useConfirm()`
  ([selections §13](00%20Architecture%20and%20philosophy/05-selections.md#13-phase-3-extension-points--what-were-explicitly-leaving-room-for)).
- **Cache invalidation:** after convergence, refresh the selection's metadata cache, which also
  fixes the stale-cache issue noted in selections §13, and the visible buffer. Handle images
  that move or leave the result set when the edited field is the sort key or a filter. Selection
  must not lose them silently.
- **Edit the shared metadata panel only through field-level operations.** Never send the whole
  metadata object assembled from cached data.

**What Kupua gains over Kahuna at 5,000 images (*estimates*):**

| Metric | Kahuna-style at 5,000 | Phase 1 |
|---|---|---|
| HTTP write requests | 5,000 | 5 |
| Per-image auth lookups (non-privileged user) | up to 5,000 | ≤ 5 batched ES lookups |
| Confirmation requests | ≥ 5,000 GETs (more when lagging) | ~10–100 count queries |
| Effect on colleagues' edits | Queued behind the batch on the shared lane | Interactive lane overtakes bulk |
| Stale-overwrite risk | Whole metadata object | None (field-level) |
| Tab close mid-batch | Unknown partial state | Resumable within session; per-item results |
| Undo | None | Inverse batch from before-values |

### 9.3 Phase 2 — Durable Operations (Deferred: > 5,000, Query-Defined)

**Not recommended at current demand.** Agency notices are mostly about 100 images, and large
ones are rare. Build this only if frequent large or query-defined operations, or a legal audit
requirement, appear. Design sketch, kept for that case:

- An `Operation` resource in DynamoDB (initiator, input or snapshotted query, resolved ID manifest
  in S3, action, status, counts and per-item results), following the AIP-151 shape.
- Input as a list of IDs, list of supplier references or query. The **server** resolves it into a
  frozen manifest (snapshot semantics). Large term lists are chunked below `max_terms_count`.
- Execution by a worker that calls the **Phase 1 primitives** in chunks, so it uses no new write
  paths and the same lane, authorization and audit trail. A worker inside an existing service is
  simpler and cheaper than SQS or Step Functions at this volume. Choose the hosting with infra (section 12).
- Required preview step, typed confirmation for destructive operations ("type 6,214"), cancellation,
  a downloadable CSV report and a post-run **verification sweep** using the existing
  projection-diff logic for a sample, or all items if small.
- First workflow to ship: **"Supplier withdrawal"**, encoding `SupplierCleanUp` correctly. It
  should *add* a restriction and deny lease rather than replace rights, and record the requesting
  person, not only the machine key.

### 9.4 What I Recommend *Not* Doing

- **Do not raise `RANGE_HARD_CAP`** for this purpose. Hand-selecting more than 5,000 images is
  not a real workflow. Large sets come from lists and queries (Phase 2). A larger client
  selection costs about 5–10 MB of heap per 1,000 cached images, approaches the `sessionStorage`
  quota at around 50,000 IDs and forces server-side reconciliation. That would be work without a user.
- **Do not port Kahuna's per-image approach "for now"** at a 5,000 cap. It is the option most
  likely to cause a visible incident for other users and the hardest to retreat from once people rely on it.
  If something is needed before Phase 1, ship **commutative operations only** (labels, archive,
  collection add, lease add), with a client cap of about 500 and concurrency of about 6. Defer
  metadata-field batch editing and batch delete until Phase 0 and Phase 1 exist.
- **Do not write ES directly** for bulk changes (section 8).
- **Do not build a generic job platform first.** One concrete workflow (agency notices) should
  drive Phase 2.
- **Do not add batch hard delete to the UI.**

---

## 10. Index Migration

**Kupua reads:** index migration remains unsupported for the Kupua read path by operator decision
([API build plan, decision 5](03%20Ce%20n'est%20pas%20une%20pipe%20dream/api-build/api-build-00-plan.md#1-decisions-operator-23-september-2026)).
Batch writes do not change that decision.

**Reassessment of how "unsafe" API-mode reads are (31 October 2026, source-based).** In API mode,
every Kupua read uses the same migration-aware `prepareSearch` as Kahuna's `GET /images`. While a
migration is running, searches span both indices and exclude current-index copies already marked
`migratedTo`. The documented hazard ("duplicates can appear during backfill") is real but narrow.
A duplicate needs an image present in the migration index while its current copy lacks the
marker. That happens in these cases:
- the milliseconds between the migrator's insert and its `setMigrationInfo`;
- a failed `setMigrationInfo`;
- an `upsertFromProjection`/reingest during migration, which deliberately wipes the marker and
  requeues the image.

The only observed case is **one image** on TEST during a paused migration (build plan,
27 September). Consequences for Kupua:
- **Counts, ranks, windows and position maps stay mutually consistent,** because all of them use
  the same query, including the duplicate. Totals are high by the number of duplicates,
  typically 0 to a handful.
- **Rendering tolerates a repeated ID.** Grid cells are keyed by slot or index, not image ID.
  ID-keyed state such as `imagePositions`, focus and detail return resolves to one copy, so
  focusing a duplicated image can jump to its twin. This is a cosmetic, bounded glitch. It is
  untested: a mock datasource returning one ID twice would settle it.
- **`CompletionPreview` reads only the new index,** so not-yet-migrated images are missing until
  completion. This is an operator-controlled phase and affects Kahuna identically.
- **Mapping changes,** which are often the reason for a migration, can make the same query
  match differently in the two indices. Kahuna has this too.
- **KUP-044 is unaffected:** `mget` and singleton reads are migration-aware (new index first,
  then current).

**Verdict:** API-mode Kupua is about as migration-tolerant as Kahuna, not uniquely unsafe. The
"unsupported" decision is a sound scope choice for a prototype, at about two days every two to
three years. It is not evidence of a serious hazard. Making Kupua "migration-tolerant like Kahuna"
would need a duplicate-ID test and fix, if one is needed, and an explicit acceptance of totals
being high by a few. It would not need a PIT, Thrall interlock or backend redesign. **Direct-ES
mode**, which opens its own PITs on a fixed target, is a different story; this reassessment covers
only API mode.

**How Grid writes behave during a migration** (verified in source):

- Edits, deletes and other updates go through `migrationAwareUpdater`. They apply to the current
  index and, while a migration is running, to the migration index. "Not found in the migration
  index" counts as success.
- The migrator rebuilds each image from **all source stores**, including edits, soft-delete
  status, leases, collections, usages, crops and syndication. It inserts the image only if the ES
  version on the current index has not changed since the ID was queued; otherwise it postpones
  the image. Hard-deleted images fail the version lookup and are not resurrected.
- Searches read migrated images from the migration index and the rest from current, removing
  duplicates with the `migratedTo` marker.

**Consequences for batch writes:**

1. **ID-addressed batches are safe in principle during a migration.** Edits made before an image
   migrates are picked up from DynamoDB; edits made afterwards are dual-written.
2. **There is a narrow race.** If an edit's migration-index attempt happens between the
   migrator's version check and its insert, on a different Thrall instance, the migration index
   keeps the pre-edit image while current carries the new edit and the `migratedTo` marker. After
   completion, search shows the old value. The window is milliseconds per image, but a
   5,000-image batch runs it 5,000 times. **Mitigation:** the Phase 1/2 verification step, and
   optionally a post-migration projection-diff sweep over images whose `lastModified` falls inside
   the migration window.
3. **Lane contention:** migration messages are the *lowest* priority. Large bulk jobs on the
   low-priority lane will slow a migration, which is acceptable and arguably correct. Bulk jobs on
   the UI lane slow both migration and users.
4. **Dropped messages hurt more during migration** because there are two index writes and more ES
   load. This is another reason for the drop metric in Phase 0.
5. **Query-defined operations (Phase 2)** must resolve their manifest using the same
   migration-aware search and remove duplicate IDs. ID manifests are migration-neutral once resolved.
6. **Suggested policy:** allow Phase 1 batches during migration, verified as above. Block or warn
   for Phase 2 operations above a size threshold during `CompletionPreview`, and run a verification
   sweep after completion.

---

## 11. Costs

**Infrastructure** (*order of magnitude*, eu-west-1 list prices; confirm against actual capacity modes):

| Item | Per 5,000-image batch | Notes |
|---|---|---|
| DynamoDB writes | ~5,000–15,000 WRU ≈ **$0.01–0.02** on demand | Edits items of a few KB. Provisioned mode may throttle bursts and needs backoff. |
| `Edits` capacity change | On-demand: ~1M writes cost about $1 or less (verify current eu-west-1 price); provisioned at 20 WCU costs roughly $10–15/month today | Switching to on-demand, or enabling auto-scaling with a sensible maximum, removes the tightest bottleneck for a few dollars a month. It is an infrastructure decision for engineers. |
| Kinesis | ~5,000 records, a few MB ≈ **< $0.01** | Shard-hour costs are fixed. Bursts must stay below 1,000 records/s per shard. |
| ES | 5,000 scripted updates | No extra spend. It uses cluster headroom, which is the real constraint. |
| Thrall | Minutes of serial processing | No extra spend unless instances are added. |
| Phase 2 job store | DynamoDB rows plus S3 manifests | Negligible. |
| Hard delete storage saving | ~5,000 originals, tens of GB | About $1/month of S3; not a motivation. |

Batching through Phase 1 is **cheaper** than Kahuna-style batching because it uses about 1,000
times fewer HTTP requests, authorization lookups and polling GETs.

**Engineering** (*rough*, for planning conversations only):

- Phase 0: about 1–2 weeks of Grid work, as small PRs.
- Phase 1: about 3–5 weeks for Grid endpoints, tests and lane routing, plus about 3–5 weeks
  for Kupua batch UI, client, convergence and undo.
- Phase 2: about 4–8 weeks, depending on hosting and audit requirements.

**Cost of not doing it:** continued engineer time on agency notices, legal exposure from
unattributed and destructive rights changes, and, if Kupua ships Kahuna-style batching at 5,000,
user-visible incidents for colleagues whose edits appear to fail.

---

## 12. Open Questions for the Operator / Infrastructure

**Answered (operator, 31 October 2026, Guardian PROD):**
- one `t4g.small` Thrall with unlimited credits;
- two `t4g.small` metadata-editor instances;
- one provisioned shard on each Kinesis stream;
- provisioned DynamoDB `Edits` at 20 WCU/20 RCU with auto-scaling off, ~6.68M items in 1.7 GB
  (~250 bytes, 1 WCU per edit), `Photoshoots` GSI at 4/4, and no throttling in two weeks;
- ES: 4 nodes, zero write thread-pool rejections since node start;
- user-lane records start about 0.02–0.3 s after arrival, even during automation bursts;
- the last full migration was about two years ago and took about two days;
- the largest recent agency notice was about 6,000 images.

Measured Thrall figures are in section 4.3a. Record aggregate numbers only. Do not record ARNs,
account IDs, hostnames or instance identifiers here.

**Answered later (operator, 31 October 2026):** two `t4g.small` media-api instances. Agency
notices are rare, mostly about 100 images and occasionally a large spreadsheet. User batch soft
deletes should follow the same reaper hard-delete delay as single deletes.

The 27 October spike came from `usage-stream` (~50%) and `octopus-converter` (~47%), by app share
of `Publishing message to kinesis` logs. It was usage traffic, not a user script. octopus-converter
is outside this repository; treating it as print-usage ingestion is unverified.

**Still open:**
1. Legal audit requirements for agency or supplier actions, if any.

## 13. Evidence Index

- Kupua selection and limits: [05-selections.md](00%20Architecture%20and%20philosophy/05-selections.md), [tuning.ts](../../src/constants/tuning.ts), [Kahuna findings](01%20Research/selections-kahuna-findings.md).
- Grid write lifecycles: [P33](03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-09-p33-grid-edit-delete-collection-lifecycles.md); backlog [`GRID-009`–`GRID-013`](bug-backlog.md).
- Producer: [Kinesis.scala](../../../common-lib/src/main/scala/com/gu/mediaservice/lib/aws/Kinesis.scala), [DynamoDB.scala](../../../common-lib/src/main/scala/com/gu/mediaservice/lib/aws/DynamoDB.scala), [EditsController.scala](../../../metadata-editor/app/controllers/EditsController.scala), [Authorisation.scala](../../../rest-lib/src/main/scala/com/gu/mediaservice/lib/auth/Authorisation.scala), [MediaApi.scala](../../../media-api/app/controllers/MediaApi.scala).
- Consumer: [ThrallStreamProcessor.scala](../../../thrall/app/lib/ThrallStreamProcessor.scala), [ThrallEventConsumer.scala](../../../thrall/app/lib/kinesis/ThrallEventConsumer.scala), [MessageProcessor.scala](../../../thrall/app/lib/kinesis/MessageProcessor.scala), [ElasticSearch.scala](../../../thrall/app/lib/elasticsearch/ElasticSearch.scala).
- Migration: [MigrationSourceWithSender.scala](../../../thrall/app/lib/MigrationSourceWithSender.scala), [ImageDataMerger.scala](../../../common-lib/src/main/scala/com/gu/mediaservice/ImageDataMerger.scala), media-api [ElasticSearch.scala](../../../media-api/app/lib/elasticsearch/ElasticSearch.scala).
- Scripts: [SupplierCleanUp.scala](../../../scripts/src/main/scala/com/gu/mediaservice/scripts/SupplierCleanUp.scala), [BulkRemoveFromCollection.scala](../../../scripts/src/main/scala/com/gu/mediaservice/scripts/BulkRemoveFromCollection.scala).
- Kahuna: `kahuna/public/js/util/batch-tracking.js`, `kahuna/public/js/util/async.js`, `services/label.js`, `services/api/leases.js`, `services/api/collections-api.js`, `components/gr-delete-image/gr-delete-image.js`.
- Prior art: Google AIP-151/233 (google.aip.dev), Microsoft REST API guidelines (github.com/microsoft/api-guidelines), Stripe idempotent requests (docs.stripe.com/api/idempotent_requests), Elastic optimistic concurrency and update-by-query docs, AWS DynamoDB `BatchWriteItem`/transactions and Kinesis quotas, and Google Drive trash (support.google.com/drive/answer/2375102).
