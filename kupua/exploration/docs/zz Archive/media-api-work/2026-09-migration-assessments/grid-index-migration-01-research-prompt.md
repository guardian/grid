# Grid index migration: PIT research prompt

> **Archived, 15 September 2026: completed historical prompt, do not execute.** It asked about
> stronger migration guarantees than the current prototype scope. Its instructions and output
> requirements are not current obligations; findings remain useful reference.
> Current scope: [media-api index](../../../03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/media-api-00-index.md).

**Recommended model:** Opus 4.6 or the strongest available architecture/research model.

Paste the prompt below into a fresh agent session. This is a read-only decision session,
not an implementation session.

---

You are a fresh, read-only architecture researcher working in the Grid repository. Decide
the correct D8 Point in Time (PIT) architecture for Kupua/media-api while a Grid Elasticsearch
index migration is running, and decide whether the current `POST /images/search-after` D3
contract should change **before its pending review**.

This is not a request to preserve sunk work. D3 may be frozen, additively extended, or held
for a coordinated redesign. Choose the architecture with the best correctness, operational
behavior and long-term migration outcome regardless of implementation cost. Conversely, do
not redesign D3 merely because redesign is intellectually cleaner: require concrete evidence.

## Decision to produce

Return one recommended D8 architecture and exactly one D3 verdict:

1. **Freeze D3:** its current contract is the right long-term boundary; D8 fits behind it.
2. **Additively extend D3 before review:** preserve current callers while adding the snapshot
   semantics needed for the better design.
3. **Hold D3 review for a coordinated D3/D8 change:** the current raw-`pitId` contract prevents
   a correct or materially better design.

No tied recommendation is allowed. If evidence cannot distinguish two candidates, name the
single cheapest empirical check that would distinguish them, recommend a default pending that
check, and state whether D3 review should proceed meanwhile.

## Source authority and scope

- Current code is authoritative.
- For planning, use only active files in
  `kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/`.
- Do not use `kupua/exploration/docs/zz Archive/media-api-work/` as current design. The one
  allowed archive read is the `_shard_doc` analysis explicitly linked by active rule 24:
  `phase-3-d3-searchafter-post-pr-review.md` section D-6.
- You may consult authoritative Elasticsearch 8.x documentation or dependency source for PIT,
  alias-filter, `search_after`, refreshed PIT ID and close semantics. Cite the exact URL/version.
- Read no runtime logs. Do not inspect TEST/CODE/PROD, credentials, cookies, real responses or
  user data. Do not issue any live request or write to any Elasticsearch cluster, unless read-only inspection would help in your decision, then ask user for permission.
- Do not edit product code or planning docs. The only research deliverable is
  `kupua/exploration/docs/zz Archive/media-api-work/2026-09-migration-assessments/grid-index-migration-02-research-findings.md`.
  Maintain `worklog-current.md` only as required by repository protocol.
- Do not run tests. Inspect existing tests and write a future test/measurement plan.
- Every factual claim needs a `file:line` citation or authoritative external citation.
  Unsourced claims are forbidden.
- Label each material conclusion **Proven**, **Inferred**, **Measurement-needed**, or **Unknown**.

## Required reading — stop only after these paths are traced

### Tier 0 — governing active decisions

Read in full:

- `kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/media-api-00-index.md`
- `kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/media-api-01-capability-inventory.md`
- `kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/media-api-02-next-endpoints-d7-d8-d9-workplan.md`
- `kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/d3-search-after-02-pr.md`
- `kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/d3-search-after-03-sort-options.md`
- `kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/media-api-90-conventions.md`
- `kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/media-api-91-instructions-for-agents.md`
- `kupua/exploration/docs/performance-first-dry-consolidation-audit-2026-09-13.md`, migration
  assessment only; its PIT discovery is a question, not an answer.

### Tier 1 — code that owns membership and snapshot behavior

Trace, including callers and tests:

- `media-api/app/lib/elasticsearch/ElasticSearch.scala`
  - `prepareSearch`
  - `searchAfter` / `searchAfterQuery`
  - PIT and non-PIT request branches
  - query/filter construction and runtime mappings
  - total, source projection, sort tuple and refreshed `pitId` handling
- `media-api/app/lib/elasticsearch/ElasticSearchModel.scala`
  - `SearchAfterParams`, JSON parsing and validation
- `media-api/app/controllers/MediaApi.scala`
  - `searchAfterImages`, visibility/enrichment and response shape
- `media-api/app/lib/elasticsearch/sorts.scala`
- `media-api/conf/routes`
- `media-api/app/MediaApiComponents.scala`
- `common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/MigrationStatusProvider.scala`
- `common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/ElasticSearchClient.scala`
- `thrall/app/lib/elasticsearch/ElasticSearch.scala`
  - migration-aware index/update/delete methods
  - dual-write order and `migratedTo` mutation
- `thrall/app/lib/elasticsearch/ThrallMigrationClient.scala`
  - start, pause, resume, completion preview, unpreview and alias switch
- `thrall/app/lib/kinesis/MessageProcessor.scala`
  - ordinary writes during migration
  - migrate insert-then-mark sequence
  - projection upsert marker reset/requeue behavior
- Any directly called delete/export/usage/update path that can make the two copies differ.

### Tier 1 — Kupua's actual PIT lifecycle

Trace:

- `kupua/src/stores/search-store.ts`
  - initial `openPit` and non-PIT first page running in parallel
  - PIT generation/supersession and close
  - forward/backward extension, seek, restore and sort-around-focus
  - concurrent bidirectional requests and which refreshed PIT ID wins
- `kupua/src/dal/es-adapter.ts`
  - direct PIT open/close
  - PIT `_search` request and expiry fallback
  - `_shard_doc` handling
  - dedicated position-map PIT
  - `getIdRange` and rank behavior
- `kupua/src/dal/grid-api-search-adapter.ts`
- `kupua/src/dal/strangler-adapter.ts`
- `kupua/src/dal/types.ts`
- `kupua/src/dal/adapters/elasticsearch/sort-builders.ts`
- `kupua/src/lib/history-snapshot.ts`
- `kupua/src/lib/image-offset-cache.ts`

### Tier 1 — existing evidence tests

Read the relevant cases in:

- `media-api/test/lib/elasticsearch/ElasticSearchTest.scala`
- `media-api/test/lib/elasticsearch/SortsTest.scala`
- `thrall/test/lib/elasticsearch/ElasticSearchTest.scala`
- `thrall/test/lib/elasticsearch/MigrationStatusProviderTest.scala`
- `kupua/src/stores/search-store-pit.test.ts`
- `kupua/src/dal/es-adapter.test.ts`
- `kupua/src/dal/strangler-adapter.test.ts`
- `kupua/src/stores/search-store-position-map.test.ts`
- `kupua/e2e/README.md` and the media-api exclusions in shared E2E helpers.

State explicitly what each test proves and, more importantly, what it does not prove.

### Tier 2 — operational and rollout constraints

Read as needed:

- `riff-raff.yaml` and media-api deployment configuration for instance count/autoscaling
- Vite media-api proxy/write guards
- D3's measured performance breakdown in
  `../../../03 Ce n'est pas une pipe dream/media-api-work/d3-search-after-04-performance.md`
- Elasticsearch client version and elastic4s version in build files
- Elasticsearch 8.x PIT documentation and implementation notes matching that version.

## Required current-state model

Build an exact sequence for each state:

1. `NotRunning`
2. `InProgress`
3. `Paused`
4. `CompletionPreview`
5. `StatusRefreshError(previousStatus)`
6. transition into/out of pause while a PIT is open
7. transition into/out of completion preview while a PIT is open
8. final alias swap while a PIT is open
9. migration-index insert before current-copy `migratedTo` marker
10. projection update that clears/requeues the marker
11. ordinary image update, usage/export update, soft delete and hard delete during migration

For each, state which physical copies exist, which may differ, what `prepareSearch` returns,
what each candidate PIT captures, and what page one versus continuation returns.

## Falsifiable hypotheses

Do not merely discuss these. Try to disprove each from source and existing tests.

### H1 — raw multi-index PIT duplicates

A raw PIT across current and migration indexes can contain two documents with one logical image
ID. Since D3's public sort ends in `id`, both copies may have identical public tuples; stripping
PIT `_shard_doc` then destroys uniqueness and can cause unstable order, skipped rows or repeated
rows. Disconfirm only with proof that duplicate physical copies cannot coexist at PIT open time
or that one is excluded by a frozen query in every transient state.

### H2 — frozen `must_not migratedTo` is sufficient

A multi-index PIT plus the current migration dedup predicate yields exactly one canonical copy.
Try to refute it with the insert-before-mark window, marker-reset/requeue path, failed migration,
concurrent update/delete, and a PIT opened between those operations. Distinguish a query frozen
as JSON from document values frozen by the PIT.

### H3 — current-index-only PIT is canonical while migration runs

During `InProgress` and `Paused`, a PIT on `imagesCurrentAlias` matches non-PIT
`prepareSearch` for logical membership, source version, authorization-visible hits, order,
sort tuples and total. Refute using every write/update/delete path that can make current and
migration copies differ. Do not equate “copy still exists” with “copy is canonical.”

### H4 — migration-index-only PIT is canonical in completion preview

During `CompletionPreview`, a PIT on the migration index matches `prepareSearch`, including
status-cache lag immediately before/after preview and the final alias switch.

### H5 — current parallel page one is an acceptable bounded gap

Opening PIT and fetching page one without it in parallel is acceptable for migration correctness.
Try to produce duplicate, missing, total or cursor discontinuities where page one uses one
migration state and continuation uses another. Separate the existing general indexing race from
new migration-specific failure modes.

### H6 — sequential existing-D3 first page is sufficient

Open D8 first, then call existing D3 with `pitId` and null cursor. Determine whether this gives
strict consistency without a server contract change, what latency it adds, and whether totals,
runtime mappings and filters remain identical.

### H7 — combined open-and-first-page is materially better

One D3 request atomically selects canonical membership, opens PIT and returns page one. Compare
its correctness and latency with H6, and determine whether it should replace or coexist with
standalone D8 open.

### H8 — refreshed PIT IDs are concurrency-safe

Forward/backward requests sharing one PIT may return different refreshed IDs. Prove which ID must
be retained, whether old IDs remain usable, what must be closed, and whether concurrent D1/D2/D4
consumers can fork snapshot lineage. Use authoritative Elasticsearch evidence.

### H9 — expiry fallback remains in one coordinate space

When a PIT expires during a migration-status transition, current fallback to live non-PIT search
preserves logical membership/order/tuple semantics. Try to refute this across pause, preview and
alias completion. Include persisted cursors whose original PIT no longer exists.

### H10 — server-side snapshot sessions are deployable

An opaque snapshot/session token can safely bind PIT, canonical migration membership, query,
semantic sort, tier/authorization, producer version and cumulative state. Treat JVM-local storage
as refuted unless deployment stickiness is proven. Compare stateless authenticated tokens,
shared storage and raw PIT IDs for security, rollout and operational cost.

## Architecture options that must be compared

At minimum score these; add an independently derived option if source suggests one:

1. **Defer D8:** keep direct-ES PIT open/close while D3 remains API-backed.
2. **Raw single-index PIT, parallel page one:** current alias during running/paused;
   migration index during completion preview; preserve current store timing.
3. **Raw single-index PIT, sequential page one:** same membership, but page one uses the PIT.
4. **Combined open + first page in D3:** one request owns membership and snapshot creation.
5. **Multi-index PIT + frozen dedup query/context:** define how transient duplicate states are
   excluded, not merely how the query is serialized.
6. **D3-owned opaque snapshot session:** media-api owns open/query/refresh/close and exposes a
   semantic token rather than a raw PIT ID.
7. **Migration-aware read alias or other Elasticsearch-native boundary:** assess feasibility,
   especially whether per-index alias filters can establish canonical copy precedence.
8. **Defer full API PIT migration until index migration is complete:** legitimate if safer and
   operationally acceptable; state what remains hybrid and for how long.

For every option compare:

- exactly-once logical identity and unique public cursor tuple
- canonical-copy precedence and source freshness
- page-one/continuation total, membership, order and cursor agreement
- all migration statuses and mid-session transitions
- update/delete/migrate races and failed migrations
- PIT refresh, expiry, close and resource cleanup
- D1 position map, D2 range walk and D4 exact-rank compatibility
- persisted cursor and browser-history restoration
- authorization/tier binding and information leakage
- direct-ES fallback and graceful media-api absence
- mixed old/new client and server versions during rollout
- multi-instance media-api operation, restart and rollback
- PIT count, keepalive, shard/segment retention, heap/file-descriptor impact
- initial latency, per-page latency and request count
- observability sufficient to diagnose coordinate-space divergence.

Correctness gates precede performance scoring. Any option that cannot guarantee unique logical
identity and a deterministic public cursor is rejected regardless of latency.

## Required fixture and test matrix

Specify future tests for at least these physical states:

- current only
- migration only
- both copies, old marked `migratedTo`
- both copies, old not yet marked
- both copies after projection marker reset
- migration write failed, current has failure metadata
- copies with identical source and sort tuple
- copies with differing source but identical sort tuple
- copies with differing primary/fallback sort values
- soft-deleted or hard-deleted during migration
- updated usage/export fields during migration
- transition to/from `Paused`
- transition to/from `CompletionPreview`
- final alias swap
- `StatusRefreshError` retaining every possible previous status
- PIT expiry before and after each transition
- concurrent forward/backward requests returning different refreshed PIT IDs.

For each fixture name the oracle: logical IDs, chosen physical index/source, total, complete order,
public sort tuples, first-page/continuation boundary, expiry behavior and close behavior.

## Required deliverable structure

Write 2,500–4,500 words, excluding evidence tables and appendices:

0. **Premise challenge (halt if needed).** If the supposed D8 problem is false or the research
   question is malformed, prove that here and stop. Do not comply with a false premise.
1. **Decision card.** One D8 recommendation, one D3 verdict, confidence, blockers, and the first
   implementation/review action.
2. **Current-state sequence.** Page one, PIT open, continuation, refresh, expiry and close.
3. **Migration state machine.** Physical copies, aliases, marker state and canonical read behavior.
4. **Required invariants.** Identity, copy precedence, snapshot, cursor, authorization and cleanup.
5. **Hypothesis table.** Evidence for/against H1–H10, disconfirmation attempts and verdicts.
6. **Fixture matrix.** All transient and stable states above.
7. **Option scorecard.** Correctness gates first; then performance, complexity, rollout and D1/D2/D4 fit.
8. **Recommended contract.** Exact open/first-page/continue/refresh/expire/close semantics and
   whether the client sees raw PIT IDs or semantic tokens. Describe shape only as far as the
   decision requires; do not write implementation code.
9. **D3 review verdict.** Files/contracts/tests affected and whether review should proceed now.
10. **Static test plan.** Existing tests to extend, missing integration harness, deterministic
    migration fixture setup and required assertions.
11. **Performance/capacity plan.** Measurements needed, environments, metrics and stop thresholds;
    do not invent numbers.
12. **Versioned rollout/rollback.** Mixed versions, fallback, feature flags, observability and
    removal criteria for transitional behavior.
13. **Residual unknowns and team decisions.** Each with owner and cheapest resolution.
14. **Source coverage.** Files/docs/external sources read and material surfaces not read.
15. **What done looks like.** Self-check every requirement in this prompt.

If your own later analysis refutes an earlier finding, delete or rewrite the earlier finding.
Do not leave both the claim and its contradiction in the report.

## Anti-goals

- No product implementation, patches, commits or test execution.
- No broad D7/D9/aggregation review.
- No general DRY, style, naming or service-boundary refactor.
- No assumption that avoiding a D3 change is inherently preferable.
- No assumption that changing D3 is inherently more future-proof.
- No claim that a PIT itself deduplicates logical IDs.
- No claim that a frozen query fixes an insert-before-marker snapshot without proof.
- No live migration-status lookup presented as frozen context.
- No process-local session registry unless single-instance/stickiness is proven.
- No weakening of the unique-`id` public tuple requirement.
- Do not “fix” D3's `_shard_doc` truncation; investigate its interaction with duplicate logical
  IDs, but preserve the documented reason persisted non-PIT cursors cannot contain it.
- No user-impact priority ranking. Rank options by demonstrated correctness, degradation,
  operational risk and measured cost.

## Completion standard

The work is not done until a reviewer can answer, without reopening the code:

- Which physical index/copy is canonical in every migration state?
- Can page one and every continuation return one logical image exactly once?
- Is every public cursor tuple unique and reusable after PIT expiry?
- What happens if migration state changes while the session is open?
- What happens when concurrent requests refresh one PIT?
- Does D3 proceed to review unchanged, additively extended, or held for redesign?
- How do D1, D2 and D4 consume the chosen snapshot?
- What deterministic tests can falsify the recommendation?
- What measurements and rollout evidence are still required?

---

**Expected output file:**
`kupua/exploration/docs/zz Archive/media-api-work/2026-09-migration-assessments/grid-index-migration-02-research-findings.md`