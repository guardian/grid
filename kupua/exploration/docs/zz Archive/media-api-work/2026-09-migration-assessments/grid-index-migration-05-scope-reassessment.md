# Grid index migration: prototype scope reassessment

> **Archived, 15 September 2026: decision input, not a current workplan.** The operator has
> since selected incremental additive work with migrations unsupported. The option analysis
> remains reference; it does not mandate a session transport or automatic exclusion mechanism.
> Current scope: [media-api index](../../../03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/media-api-00-index.md).

**Date:** 2026-09-14  
**Status:** Scope decision input. This does not refute the technical conclusion in decision 04;
it asks whether implementing that conclusion is proportionate to Kupua's current prototype scope.

## Short answer

Decision 04 describes the strongest final architecture, but it is well beyond the original
integration boundary. The original D3 change was an additive Kupua endpoint with no existing
production caller and no change to Kahuna's `GET /images`, sort builder or response behavior
(`../../../03 Ce n'est pas une pipe dream/media-api-work/d3-search-after-02-pr.md:8-18,50-65`). The full architecture instead changes Grid's
canonical migration reads, getters, write admission, Thrall completion, aliases, rollback and
operational procedures. It is a production migration redesign whose first beneficiary happens to
be Kupua.

**Rough size, low confidence until implementation planning:** about **2,000-4,000 lines of
production server/configuration code**, plus roughly **2,000-5,000 lines of server integration,
fixture and failure-path tests**. The difficult part is not PIT open/close. It is the durable epoch
lease, complete mutation-ingress fence, failure/projection/delete reconciliation, Elasticsearch
write blocks and refresh proof, strict alias transition, rollback rules and multi-instance
operation required by `CutoverReady`
(`grid-index-migration-04-architecture-proposal.md:14-41,220-267`). These are order-of-
magnitude estimates, not measured task sizing.

**Production containment:** some pieces remain additive and Kupua-only: a new semantic browse-
session route, an endpoint-specific semantic sort builder, opaque snapshot transport and Kupua
client lifecycle. The complete design does not. It must alter code and operations serving current
production Kahuna, principally media-api's shared read/getter behavior and Thrall's migration and
cutover path. Legacy Kahuna `createSort` can and should remain untouched, but that does not make
the overall change additive (`../../../03 Ce n'est pas une pipe dream/media-api-work/d3-search-after-03-sort-options.md:108-125,148-174`).

## What the full design buys

There is a respectable case for doing the production work. Research found real source-level
migration defects, not merely Kupua incompatibilities:

- Backfill inserts migration index’s M before marking current index’s C, and projection replacement later clears C's marker while an
  older M copy may remain. Current progressive C+M search can therefore expose two physical copies
  of one logical image (`thrall/app/lib/kinesis/MessageProcessor.scala:70-123`;
  `media-api/app/lib/elasticsearch/ElasticSearch.scala:699-710`).
- Search and detail can disagree: search uses marker-filtered C+M, whereas getters prefer any M
  copy and fall back to C. After marker reset, a getter can select stale M while search uses repaired
  C (`media-api/app/lib/elasticsearch/ElasticSearch.scala:103-149`).
- `CompletionPreview` changes production search to M but establishes no drain, failure, projection
  or delete-readiness barrier; current completion checks only preview state before switching aliases
  (`thrall/app/lib/elasticsearch/ThrallMigrationClient.scala:60-75,93-118`).
- Current completion has no global write fence or search-visibility proof, and its alias removals
  are not strict all-action requirements. Elasticsearch can report per-action partial success when
  `must_exist` is false
  (`thrall/app/lib/elasticsearch/ThrallMigrationClient.scala:93-118`;
  [Elasticsearch 8.18 aliases](https://www.elastic.co/guide/en/elasticsearch/reference/8.18/aliases.html)).

The full design would therefore improve current production migration correctness as well as make
Kupua migration-transparent. It would establish one logical source, one read/write epoch, a
falsifiable cutover, deterministic session behavior and an honest rollback boundary. If Grid's
migration machinery is independently due for hardening, doing one coherent redesign is better than
adding a Kupua exception beside known production defects.

There is also a long-term architectural argument. Kupua's position map, exact rank, range walk,
history restore and bidirectional pagination all consume one ordered corpus. A server-owned
semantic session is a cleaner final boundary than keeping direct Elasticsearch access and raw PIT
lineage in a browser. Avoiding it now creates transitional work that must later be removed.

## Why this is disproportionate for the prototype

The counterargument is stronger for current project scope. The research prompt explicitly asked
for the best final outcome regardless of implementation cost; decision 04 correctly answered that
question. It did not establish that Kupua's prototype value justifies changing production write
admission and migration completion.

The blast radius is qualitatively different from an additive endpoint. A mistake in D3 affects one
opt-in Kupua caller. A mistake in the full cutover fence, alias action, status transition or writer
inventory can block or misroute production writes and reads for the whole editorial system.
Decision 04 itself says fence completeness is unknown until every mutation principal and ingress is
identified, and that fence duration and operational acceptability require measurement
(`grid-index-migration-04-architecture-proposal.md:63-75`). That uncertainty is acceptable in
a production migration programme; it is a warning sign when incurred to perfect a prototype.

Nor is Kupua generally unusable without the redesign. The severe failure is specifically the
**current hybrid during an active migration**. Kupua opens a direct C PIT while fetching a no-PIT
page one through media-api in parallel (`kupua/src/stores/search-store.ts:2196-2249`). The D3 no-PIT
branch uses migration-aware C+M or preview-M, while the PIT branch searches the PIT's single target
(`media-api/app/lib/elasticsearch/ElasticSearch.scala:817-843`). Page one and continuation can thus
have different membership, total and ordering. Because Kupua builds long-lived scroll, rank,
selection and history coordinates from those results, this is more structurally damaging than
Kahuna's mostly request-local duplicate or stale-result behavior.

Outside migration, that split-corpus defect disappears. During migration, Kupua can remain coherent
on C only if **every session-authoritative operation** uses the same C PIT, or an unaligned feature
is disabled. Merely putting page one in the PIT is insufficient: focus/restore probes currently run
without one, D1 opens another PIT, and D2/D4 use separate live coordinates
(`kupua/src/stores/search-store.ts:1504-1529,3793-3800`;
`kupua/src/dal/es-adapter.ts:1278-1438,1971-1978,2251-2287`). TEST startup already resolves
`Images_Current` to one concrete physical index and keeps it in `VITE_ES_INDEX`
(`kupua/scripts/start.sh:428-462`). The price is a reduced feature set plus an explicit forced
session shutdown/re-anchor at final cutover, not transparent continuity.

## Half-house options

### A. Contained pinned-C mode - viable with strict client gates

Keep current production migration behavior untouched. In Kupua, open the existing direct,
single-C PIT **before** page one and pass that PIT to D3 for page one as well as continuations.
Current D3 already accepts a PIT, bypasses `prepareSearch`, and lets Elasticsearch resolve the
single target from it; existing integration tests prove a complete single-index PIT walk with no
duplicate or missing IDs (`media-api/app/lib/elasticsearch/ElasticSearch.scala:817-885`;
`media-api/test/lib/elasticsearch/ElasticSearchTest.scala:1116-1204`).

This can remain predominantly Kupua work and leave Kahuna, shared `prepareSearch`, getters, Thrall
and aliases unchanged. It is correct only with all of these gates:

- Every search that can publish into the session - first page, focus/restore probe, centred buffer,
  forward/backward fill and seek - uses that PIT. No no-PIT D3 result may enter its buffer.
- PIT operations are serialized on the latest returned PIT ID, or any ambiguous fork terminates
  the session. Current paired loads and fills do not implement Elasticsearch's documented latest-
  ID progression (`kupua/src/stores/search-store.ts:997-1089,1313-1380,2478-2754`). Existing D3
  tests prove a simple single-index walk, not sibling-head concurrency
  (`media-api/test/lib/elasticsearch/ElasticSearchTest.scala:1116-1190`).
- D1, D2, exact D4, positional counts and any cursor-producing getter either use that same snapshot
  or are feature-gated off. Live ticker counts may remain presentation-only and cannot alter list
  coordinates.
- PIT open failure, expiry, timed-out/partial result and unknown lineage fail closed. Recovery opens
  a new C session and re-anchors; current client behavior instead proceeds without PIT and retries
  an expired PIT live (`kupua/src/stores/search-store.ts:2211-2224`;
  `kupua/src/dal/es-adapter.ts:1051-1124`).
- `CompletionPreview` remains irrelevant to this session: it continues reading pinned C.
- Before production cutover, new Kupua sessions are disabled and all loaded clients are forced to
  close/reload. Restarting only the deployment is insufficient because browser sessions survive.
  New sessions are verified against M before access resumes; otherwise Kupua is unavailable for
  the cutover window.

The current client comment estimates that parallel PIT opening saves roughly 131 ms, but that is
not the full performance cost. Serializing refreshed PIT use also removes current parallel
forward/backward optimizations, so latency and client scope require measurement
(`kupua/src/stores/search-store.ts:2203-2218,2866-2933`).

The limitations must be explicit:

- Kupua sees C, not progressive M projections, while migration runs.
- It retains direct Elasticsearch access and raw PIT ownership temporarily, with a non-trivial
  search-store lifecycle rewrite.
- It is not transparent across final cutover. The Kupua deployment/session is restarted or
  invalidated and re-anchored onto M; old C results are not merged with new M reads. This requires
  an enforceable app-level shutdown/reload gate, not an operator convention.
- If that operational boundary cannot be guaranteed, Kupua's media-api pagination mode is disabled
  for the migration, or Kupua is declared unavailable during the cutover window.

Incremental server cost beyond the already additive D3 implementation can be near zero for basic
page sequencing. Fail-closed timeout/partial-result behavior may still need small additive D3
hardening. Most cost is a meaningful Kupua lifecycle rewrite plus tests, not the full production
migration programme. This is the most capable option that can preserve the original backend scope.

### B. Additive media-api current-index session

Add a Kupua-only route that opens a PIT on `Images_Current` and returns page one, while leaving
existing searches/getters/migration behavior unchanged. This removes direct PIT opening from the
browser and can hide raw PIT identity, but it still deliberately reads only C during migration and
still treats final cutover as session invalidation. Rough server scale is likely **300-800
production lines plus comparable or greater tests** for a thin route; that estimate is as
low-confidence as the full-design estimate and excludes a robust opaque lifecycle.

This is cleaner than A but risks rebuilding a reduced version of the session machinery before the
transport decision. It also does not align Kupua's still-direct D1/D2/D4/count/getter paths by
itself; it inherits every alignment, fail-closed and cutover gate from A. Choose B only if removing
browser PIT access now has independent value.

### C. Explicit no-migration support

Ship additive D3 for ordinary `NotRunning` operation and refuse or disable Kupua whenever a
migration is active. A whole-app unavailability gate is safer than falling back to today's direct
mode unless that mode also adopts PIT-before-page-one, latest-head serialization and fail-closed
recovery. This has the **smallest production-backend blast radius**, but it is not perfect snapshot
correctness: current page one is live while its PIT opens in parallel, so an ordinary concurrent
index/update/delete can still create a bounded first-page/continuation race even in `NotRunning`
(`kupua/src/stores/search-store.ts:2202-2224`;
`media-api/app/lib/elasticsearch/ElasticSearch.scala:817-824`). Either accept and document that as
a prototype limitation, disable pagination/positional claims, or adopt A's PIT-before-page-one,
latest-head and fail-closed core. C still requires a reliable migration gate and is not a
production-ready end state.

### D. Small production hardening as independent work

Some production fixes may be worth doing without adopting the full architecture: capture one
migration-status value per `prepareSearch` request; make completion alias actions strict and verify
their targets; ensure `Images_Historical` has one target; or add explicit completion diagnostics.
These can benefit Kahuna and reduce risk, but none makes Kupua's hybrid page/PIT coordinate system
correct, and none should be smuggled into the prototype budget. Each deserves its own production
case, owner and review.

### Not a valid compromise

A multi-index PIT plus the existing `must_not migratedTo` filter is not a half-house solution. A
snapshot opened between M insert and C marking, or after marker reset, contains two unmarked copies.
Nor is keeping parallel union page one plus C continuation an acceptable temporary correctness
model. Both fail the unique logical-ID and one-coordinate-space requirements before performance or
scope is considered (`grid-index-migration-04-architecture-proposal.md:78-84`).

## Recommendation

Do **not** make the full decision-04 production migration redesign a prerequisite for proving or
demonstrating Kupua. If minimum production blast radius is paramount and the ordinary page/PIT race
is an accepted prototype limitation, choose **C: migrations unsupported**. If Kupua claims stable
pagination or must remain available during long-running backfill, the minimum defensible choice is
A's full set of client gates, not merely sequential page one. State plainly that A is not
migration-transparent: it reads one pinned current physical index, sacrifices progressive M
visibility, and forcibly closes and re-anchors at cutover.

Keep decision 04 as the preferred long-term architecture and as a production-hardening proposal.
Advance to snapshot-transport document 05 only if the team separately accepts that production
programme. Otherwise the next plan should be a much smaller containment plan, not a diluted
implementation of `CutoverReady`.

A is a smaller correct domain: one physical index and one PIT for one Kupua session, with cutover
explicitly outside its continuity guarantee. C is instead a conscious prototype compromise with
the smallest backend risk and a remaining ordinary timing race. Neither makes all of Grid's
production migration semantics transparent to Kupua. That broader capability is valuable, but it
is a separate project and should be approved, staffed and reviewed as one.