# Prompt - Revised workplan for API-only Kupua outside index migrations

> **Archived, 15 September 2026: completed historical prompt, do not execute.** Its bounded-
> detection/atomic-exclusion and universal snapshot requirements exceed the current prototype
> agreement. Capability coverage is useful; these stronger guarantees are not automatic mandates.
> Current scope: [media-api index](../../../03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/media-api-00-index.md).

**Recommended model:** Opus 4.6 or the strongest available architecture/planning model.  
**Mode:** Read-only architecture correction and implementation workplanning. No product-code edits,
tests, builds, profiling, live requests or real systems.

Paste the prompt below into a fresh agent session.

---

You are a fresh architecture and implementation-planning agent working in the Grid repository.
Produce the replacement for the current endpoint-gap plan: one implementation-ready workplan for a
Kupua mode in which the browser makes **no direct Elasticsearch requests during ordinary use**.

The mode does **not** support operation during a Grid Elasticsearch index migration. That is a
deliberate product boundary, not an unresolved edge case. The plan must include a reliable,
fail-closed migration gate which stops admission once migration is observed, invalidates existing
sessions within a stated bound and never falls back to direct Elasticsearch. It must distinguish
atomic exclusion from bounded detection rather than quietly promising one with the mechanics of the
other. Do not import the full production migration redesign from decision 04 merely to make this
reduced mode migration-transparent.

This session serves a concrete build decision:

> What is the smallest coherent set of media-api capabilities, Kupua ownership changes, D3
> revisions, tests and rollout gates needed to run all accepted current Kupua workflows through
> backend APIs in ordinary non-migration operation, with zero browser-to-Elasticsearch traffic and
> no changes to existing Kahuna contracts?

Unknown production load is expected. It is **not** by itself a reason to stop after D3 or reject the
endpoint programme. Route-level and aggregate production impact can only be measured honestly once
the relevant implementation exists behind disabled flags. The workplan must therefore separate:

1. correctness and isolation evidence required before implementation or review;
2. functional acceptance required before the mode can be called API-only; and
3. post-build load/capacity evidence required before production traffic is enabled.

Do not assume that every endpoint in the old plan should be built. Do not assume one endpoint per
`ImageDataSource` method. Re-derive the backend boundary from current browser workflows, shared
snapshot requirements and actual datasource owners.

## Required output

The sole substantive research deliverable is:

`kupua/exploration/docs/zz Archive/media-api-work/2026-09-migration-assessments/api-only-assessment-01-workplan.md`

Use that filename exactly. Protocol-only updates to `kupua/exploration/docs/worklog-current.md`,
`kupua/AGENTS.md` and `kupua/exploration/docs/changelog.md` are permitted when required by repository
directives and do not count as side deliverables. Do not edit product code, tests, current plans,
routing documents, findings or agent instructions. Do not create any other report or scratch
finding on disk.

Target **6,000-10,000 words**, excluding compact evidence and endpoint matrices, with a hard
**15,000-word maximum for the entire file**. The result must be understandable by an engineer who
has not followed the preceding audit sequence. Prefer names such as “cursor search,” “position map”
and “multi-image fetch” over bare labels such as D3, D1 and D9. Include old identifiers in a
cross-reference column only.

## One mindset

Produce a corrected implementation workplan, not another open-ended audit and not product code.

The current `../../../03 Ce n'est pas une pipe dream/media-api-work/media-api-01-capability-inventory.md` is an amended historical inventory, not a
safe implementation plan. Its correction banner, the newer uncommitted research and current source
are evidence. The output of this session replaces its planning function for the reduced API-only
mode; it does not rewrite that file.

Endpoint contracts, request/response ownership, file-level implementation steps, dependency order,
test changes, flags, rollout and rollback belong in the output. Delivery-date estimates, large code
listings and speculative infrastructure redesign do not.

## Premise challenge and halt

Test the reduced-mode premise before planning.

The expected result is that index migration is the only proven reason a fully backend-served
current Kupua needs a Grid-wide production redesign. Other endpoint work should be additive, with
runtime load gated after implementation. Verify this from current source and the newer findings.

Write **Section 0 - Premise failure** and stop if any of these is proven:

- a current, accepted Kupua workflow cannot be served without changing an existing
  production/Kahuna contract and cannot be coherently reduced;
- neither bounded fail-closed detection with a correctness-safe overlap window nor a narrow additive
  admission-generation interlock can exclude active migration without the full decision-04 write
  fence, cutover or canonical-read programme;
- zero browser Elasticsearch traffic cannot be enforced because a required direct-ES owner has no
  injectable or replaceable boundary;
- ordinary-operation correctness requires changing shared migration, alias, mapping, write or
  authorization semantics rather than adding isolated routes/helpers;
- source cannot distinguish current built behavior, current D3, planned-only routes and historical
  sketches well enough to produce an implementation plan.

Do **not** halt because production traffic, fleet shape, Elasticsearch headroom or final latency is
unknown. Those are explicit post-build enablement gates. Do not halt because an optional
presentation feature is expensive or difficult if the mode can name and justify a coherent
reduction. Do not claim a premise failure from the index-migration case: migration is deliberately
out of contract.

If the premise passes, say so in the decision card and continue. Do not include an empty Section 0.

## Target mode: define it precisely

Call the target **API-only ordinary-operation mode** in prose. Legacy gap IDs may appear in
parentheses for traceability, never as the primary explanation.

The plan must establish all of these properties:

1. **Zero direct ES from the browser.** While the mode is active, no user workflow issues `/es`,
   `_search`, `_count`, `_mget`, `_pit`, aggregation or other Elasticsearch requests from Firefox
   or any browser. No store constructs an `ElasticsearchDataSource` for operational use.
2. **No silent fallback.** Core API failure, expired session, unknown migration state or unsupported
   operation never falls back to browser ES. Define a coherent unavailable/retry/re-anchor state.
3. **Current workflows are accounted for.** Search, all three browsing tiers, forward/backward
  extension, seek, sort-around-focus, detail/traversal, history/re-anchor, facets, typeahead,
  collections, selection hydration, range selection, counts/polling, distributions, enrichment,
  signed/media response use and currently reachable AI behavior must be served.
4. **There is a non-reducible acceptance floor.** The complete disabled implementation cannot be
  cursor-search-only or search-only. It must preserve every currently reachable workflow named in
  item 3, including out-of-buffer range selection, position maps, exact rank where currently
  claimed, all current sorts and AI when its current health gate says it is available. The only
  pre-authorized reductions are: no operation during index migration; existing graceful absence
  for services which are already optional; removal/reservation of methods with no application
  caller; and preserving an existing explicitly approximate presentation as approximate. Any
  further user-visible reduction requires a named decision in the output decision card and cannot
  be used to declare the workplan complete silently. If a core workflow cannot meet this floor
  additively, write Section 0 and stop.
5. **Migration unsupported.** Once migration or migration-status uncertainty is observed, no new
  session is admitted and loaded sessions become unusable within a stated maximum detection
  interval. A pre-migration session cannot resume after the gate reopens. The workplan must prove
  that any unavoidable check-to-start overlap stays internally correct and cannot cross cutover;
  otherwise it must specify a narrow admission-generation interlock or halt. Do not claim atomic
  exclusion from polling alone.
6. **Ordinary indexing remains supported.** New images, metadata updates, deletes and asynchronous
   projections continue during normal operation. Any page, total, map, rank or range claimed to be
   exact must describe the same snapshot. Deliberately live presentation data must be labelled and
   prevented from minting exact coordinates.
7. **Existing production behavior stays unchanged.** Existing `GET /images`, existing sort/query
   behavior, Kahuna responses, authorization defaults, mappings, aliases and writes remain intact.
   New Kupua routes and endpoint-specific helpers are preferred. Shared extraction must be proven
   behavior-preserving.
8. **Direct mode may continue separately.** This task adds a reliable API-only mode; it need not
   delete the existing direct-ES development mode. The modes must not accidentally mix within one
   session.
9. **Build before capacity verdict.** All new traffic remains disabled by default until functional
   parity and aggregate load gates pass. Lack of current capacity data does not block writing or
   implementing isolated endpoints.

State whether “API-only” covers only Elasticsearch or also removes current S3/imgproxy/dev-proxy
paths. The required minimum is zero direct ES. Do not silently expand the project into a complete
one-URL production deployment unless a current workflow requires it.

## Source authority and plan hierarchy

Use this order. When documents conflict, the earlier item wins.

1. **Current source and tests** for actual behavior and ownership.
2. **Newer uncommitted findings and decisions** for defects already traced in depth:
   - `production-impact-01-findings.md`;
   - `grid-index-migration-02-research-findings.md`;
   - `grid-index-migration-04-architecture-proposal.md`;
   - `grid-index-migration-05-scope-reassessment.md`;
   - `../../performance-first-dry-consolidation-audit-2026-09-13.md` where it traces concrete
     query, sort, cursor, enrichment, datasource-ownership and test defects.
3. **Current D3 implementation and focused evidence:**
   - `../../../03 Ce n'est pas une pipe dream/media-api-work/d3-search-after-02-pr.md`;
   - `../../../03 Ce n'est pas une pipe dream/media-api-work/d3-search-after-03-sort-options.md`;
   - `../../../03 Ce n'est pas une pipe dream/media-api-work/d3-search-after-04-performance.md`;
   - current Scala/TypeScript source and tests.
4. **`../../../03 Ce n'est pas une pipe dream/media-api-work/media-api-02-next-endpoints-d7-d8-d9-workplan.md` as input only.** It contains useful shaped implementation
   research, but its old endpoint contracts, size labels, migration policy, batching and sequencing
   are superseded where newer evidence disagrees. Never copy its plan wholesale.
5. **`../../../03 Ce n'est pas une pipe dream/media-api-work/media-api-01-capability-inventory.md` as historical inventory plus correction banner.**
   Use it to ensure coverage and recover rationale, not as implementation instructions.
6. `../integration-plan-api-first.md` for the original product direction and additive constraint,
   not for current endpoint contracts, effort, performance claims or sequencing.
7. Archive documents only when a current document explicitly points to one narrow finding. The
   `_shard_doc` analysis in archived D3 post-review Section D-6 is permitted; archived endpoint
   sketches are not current authority.

Do not infer deployment from source presence. D3 is implemented on the working branch, review-held
and not proven deployed. Do not fetch remotes to make that unknown disappear.

Every factual current-state claim about behavior, ownership, callers, contracts, tests, deployment,
migration status or performance must carry a current `file:line` citation. Label facts not
established by source **Unknown** and route each to one evidence gate. Every proposed requirement
must cite the current defect, caller need or invariant it addresses. Unsourced factual claims are
forbidden. A citation to an old plan is not evidence of current behavior.

## Required reading

Read these in full before settling the workplan:

- `.github/copilot-instructions.md`, `kupua/AGENTS.md`, and
  `kupua/exploration/docs/worklog-current.md`;
- active `kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/media-api-00-index.md`;
- the five newer uncommitted findings/decision documents listed in authority item 2;
- the three D3 documents listed in authority item 3;
- `../../../03 Ce n'est pas une pipe dream/media-api-work/media-api-02-next-endpoints-d7-d8-d9-workplan.md` and the correction banner plus matrices in
  `../../../03 Ce n'est pas une pipe dream/media-api-work/media-api-01-capability-inventory.md`;
- `../../../03 Ce n'est pas une pipe dream/media-api-work/media-api-90-conventions.md` and `../../../03 Ce n'est pas une pipe dream/media-api-work/media-api-91-instructions-for-agents.md`;
- `../integration-plan-api-first.md`, concentrating on the target and additive promise rather than
  historical endpoint designs.

Trace current source from these anchors:

- `kupua/src/dal/types.ts`, `dal/index.ts`, `dal/strangler-adapter.ts`,
  `dal/grid-api-search-adapter.ts`, `dal/grid-api/`, `dal/es-adapter.ts` and every direct constructor
  of `ElasticsearchDataSource`;
- all `ImageDataSource` call sites in `kupua/src/stores/search-store.ts`, selection and collection
  stores;
- search, detail, history, traversal, range-selection, facets/typeahead, collection and AI call
  paths needed to identify observable behavior;
- `kupua/vite.config.ts`, startup scripts and E2E configuration only far enough to define mode
  selection, `/es` enforcement, API proxying and tests;
- `media-api/conf/routes`, `media-api/app/controllers/MediaApi.scala`,
  `media-api/app/lib/elasticsearch/ElasticSearch.scala`,
  `media-api/app/lib/elasticsearch/ElasticSearchModel.scala`,
  `media-api/app/lib/elasticsearch/sorts.scala`, `media-api/app/lib/ImageResponse.scala`,
  query/filter/auth/component wiring and their relevant tests;
- migration status source and refresh/error states only far enough to design the unsupported-
  migration gate. Do not redesign Thrall migration or cutover;
- deployment/config surfaces only far enough to distinguish build work from post-build production
  enablement evidence.

Inspect existing tests that assert old direct-ES behavior before planning replacements. Do not run
them in this session.

You may use up to four non-overlapping read-only subagents: browser/data-owner inventory; D3
revision; remaining endpoint contracts; tests/performance/rollout. They create no files. The
primary agent cross-checks their evidence and writes the sole output.

## Bounded workflow

### Phase 1 - Map every browser ES escape

Build a current-source inventory before choosing endpoints. Start from, but do not limit it to,
the 18 `ImageDataSource` methods. Include direct constructors, raw fetch helpers, startup health
checks, selection/collection owners, AI and media paths.

For each escape record:

| Workflow | Current browser caller | Current ES operation | Observable correctness requirement | Frequency/trigger | Proposed backend owner | Existing route usable? | Snapshot-bound or deliberately live? | Client rewiring needed | Test that proves zero ES |
|---|---|---|---|---|---|---|---|---|---|

Target **20-40 grouped rows**. A method with no current application caller still gets one row marked
unused/reserved. The output must account for every interface method but must not invent an endpoint
to make the matrix look complete.

The cheapest falsification of the whole plan is this inventory: if a current accepted workflow has
no additive backend boundary and no coherent reduction, stop under Section 0.

### Phase 2 - State what is wrong with the old endpoint plan

Before presenting the replacement, provide one plain-English section that a human can read without
knowing the gap IDs. At minimum adjudicate these suspected flaws against current source:

- operations over one ordered result were planned as independent live endpoints/snapshots;
- standalone PIT open/close exposes the wrong public abstraction and allows page one outside the
  snapshot;
- current D3 has production-contract and client-integration defects;
- initial exact count can have two owners;
- multi-image fetch has unresolved visibility, cap, projection, enrichment-owner and datasource-
  wiring issues;
- contextual aggregations are more than a generic terms-aggregation proxy;
- special-date and keyword distributions cannot always support exact positions;
- several historical A items have no current caller or are not actually semantically equivalent;
- Strangler overrides alone do not migrate stores which construct ES directly;
- route-by-route performance evidence cannot substitute for a complete API-only workload;
- migration exclusion has not yet been expressed as an executable server/client gate;
- correction banners have superseded detailed historical bodies, leaving the old plan unsafe to
  implement literally.

For each alleged flaw choose **confirmed**, **modified** or **refuted**, cite current evidence and
state the replacement rule. If later evidence refutes an earlier claim, remove or rewrite it; do not
leave contradictions in the output.

### Phase 3 - Choose one coherent backend boundary

Decide, do not return a tie, whether ordinary-operation correctness requires a semantic browse
session which owns page one, continuation and exact coordinate operations. Compare only options
proportionate to the reduced mode, for example:

- server opens a current-index PIT and returns page one from it;
- a simple opaque current-index session with server-owned semantics;
- a protected state-bearing handle;
- a simpler request contract if current concurrency can be serialized safely.

Do not inherit decision 04's global read epoch, write fence or cutover programme. Do inherit any
ordinary-operation invariant that still applies: one snapshot for exact membership/coordinates,
server-owned authorization/query/sort, fail-closed expiry/partial results, multi-instance behavior
and no live fallback after coordinates are published.

The workplan must choose:

- what creates a session and returns page one;
- whether existing `POST /images/search-after` remains public, becomes the create/continue
  implementation, is versioned, or is replaced before review;
- which operations share the browse snapshot: continuation, reverse, position map, exact rank,
  range selection and any focus/restore probes;
- which operations remain deliberately live: polling, optional facets/typeahead/distributions;
- how concurrent forward/backward/map/rank/range calls handle a refreshed PIT or session lineage;
- how expiry, close, cancellation, lost response and re-anchor work without direct ES;
- how requests route across media-api instances without relying on undocumented stickiness;
- a conservative configurable provisional session lifetime and resource cleanup mechanism which is
  sufficient to implement and test the disabled mode. Label the value provisional, not measured;
  define the post-build experiment and decision rule which accepts or replaces it before production
  enablement.

Keep the architecture as small as correctness allows. If serialization avoids a shared state store,
prefer it unless current callers require concurrency; if it does not, prove why.

## Mandatory D3 revision dossier

The output must contain a dedicated, implementation-ready section titled **“Revise the existing
cursor-search implementation”**. “Update D3” or “follow decision 04” is not sufficient.

Begin with a table covering the current Scala and TypeScript implementation:

| Current D3 behavior/code path | Keep, change or remove | Reason | Replacement contract | Server files/tests | Kupua files/tests | Rollout compatibility |
|---|---|---|---|---|---|---|

At minimum resolve every item below.

### D3 public role and transition

- State that D3 is implemented but review-held and not proven deployed.
- Choose whether D3 becomes session creation, session continuation, both, or an internal primitive.
- Define any temporary old-client/new-server or new-client/old-server compatibility requirement
  from actual rollout mechanics. Do not add dual contracts merely from anxiety.
- Say when the current raw `sort` and raw `pitId` request/response fields disappear, remain behind a
  disabled compatibility version, or are internalized.
- Identify the route, controller/model, ES method, client adapter and Strangler changes by file and
  symbol.

### Query, authorization and disclosure

- Reproduce the existing production deleted-image rule: users lacking blanket delete permission
  may not use `is:deleted` to see every uploader's deleted records. Cover hits, exact totals and
  errors so hidden existence is not leaked.
- Preserve syndication-tier visibility and omission of hidden IDs.
- Reconcile Kupua's inclusive upload/taken/modified bounds with media-api's shared exclusive helper
  without changing the legacy GET contract.
- Build one semantic request mapping for every effective current `SearchParams` field. Explicitly
  classify accepted-but-unused fields such as historical/dead parameters; do not silently drop a
  live filter.
- Preserve default deleted and replaced-usage hiding exactly once. Do not rely on duplicated client
  string injection when the server owns semantics unless the transition requires it.
- Keep legacy `GET /images`, `Parser`, shared filters and Kahuna behavior unchanged unless a shared
  extraction is proven byte/behavior preserving.

### Sort and cursor authority

- Replace the client-supplied Elasticsearch sort clause with semantic `orderBy`, unless current
  evidence proves a superior reduced-mode boundary.
- A server semantic builder must be new and Kupua-specific. Never “fix” or call legacy
  Kahuna-serving `sorts.createSort` to obtain Kupua parity.
- Cover every static sort, configured alias, upload-time fallback, `id` tiebreaker, both directions,
  Added to collection, Last used, nested `mode:max`, missing/null zone and companion collection
  filter.
- Define one language-neutral fixture source which proves the server clause and public tuple for
  every semantic sort. Avoid two hand-maintained expectation sets that can agree with themselves
  while differing from observable Kupua order.
- Preserve authoritative per-hit tuples by image ID through commit, eviction, focus, restore and
  range selection. Do not reconstruct configured-alias cursors from lean images whose value moved
  under `aliases`.
- Re-adjudicate the deliberate `_shard_doc` truncation in the chosen no-live-fallback session
  contract. Do not casually “fix” it; read archived post-review D-6. State why the chosen public
  cursor may or may not contain PIT-local values.

### Snapshot, page one and exact coordinates

- Page one and continuation must use the same ordinary-operation snapshot if the workplan claims
  stable pagination. Do not preserve the current parallel no-PIT page/PIT-open race merely for the
  reported latency saving.
- Focus, restore and centred-buffer probes which publish results must use the correct session.
- Position map, exact rank and ID range must use that same snapshot to satisfy the acceptance floor;
  separate live requests cannot be called exact. If current source proves one cannot be supported
  additively, halt rather than quietly reducing it.
- Define count ownership: page-one exact total belongs to exactly one request. Polling remains live.
  Select one buildable initial ticker shape which never executes two initial exact counts. If a
  post-build comparison may replace that shape, specify the alternate behind a disabled experiment
  flag and the pre-registered decision rule. Correctness ownership cannot remain undecided pending
  performance results.

### Result integrity and failure

- Treat timed-out or incomplete-shard responses as non-publishable for pages, totals, maps, ranks
  and ranges. Do not alter legacy GET's partial-result policy.
- Define typed outcomes for invalid request, unsupported sort/filter, session expired, migration
  unavailable, hidden/missing image, cancellation and internal failure.
- Present-but-wrong JSON types for session/cursor/reverse/end fields must fail validation rather
  than silently become defaults.
- There is no browser ES fallback in API-only mode. Define retry versus new-session/re-anchor
  behavior and the visible unavailable state.
- Reconcile this core dependency with the current graceful-API-absence directive. Optional
  enrichment may disappear; core search cannot pretend to have an ES baseline in this mode. Name
  any directive/deviation documentation change the implementation will require.

### Projection, enrichment and media response

- Retain or revise D3's lean schema-derived projection with explicit evidence. Preserve complete
  arrays needed for Last used/Added to collection and configured alias values.
- Decide `include=fileMetadata`: support it deliberately or reject it explicitly.
- Keep server-authoritative cost, validity, persistence, rights, actions and usages in the
  enrichment channel where current UI consumes them.
- Fix all commit-to-view paths: fresh search, extension, seek, fallback first page,
  sort-around-focus target and restoration. Probe/discarded calls must not mutate global enrichment.
- Measure the final Argo response and per-hit enrichment/signing cost after implementation. Do not
  claim the lean writer or link/signature omission until the response fields current Kupua actually
  consumes are inventoried.

### D3 tests and review exit

List the exact existing tests likely to change before specifying new tests. Require failing-first
coverage for each confirmed defect. At minimum plan:

- deleted-query authorization across admin/uploader/other/syndication principals;
- inclusive boundary documents for every date filter;
- every semantic sort and cursor tuple in both directions, including null zones and configured
  aliases;
- page one plus continuation in one snapshot under ordinary insert/update/delete;
- concurrent/serialized page, map, rank and range behavior according to the chosen session model;
- timeout, incomplete shard, expiry, wrong JSON type, lost response, duplicate request and close;
- enrichment and authoritative tuple retention through every commit/eviction/focus/restore path;
- old direct mode unchanged and legacy Kahuna GET tests unchanged;
- API-only browser tests proving no browser-to-Elasticsearch request under any configured origin or
  path.

End the D3 dossier with explicit **review can resume when** criteria and the old D3 PR description
sections that must be rewritten. Do not treat its historical passing test counts as acceptance of
the revised contract.

## Remaining endpoint/workflow decisions

For every family below, the output must choose **build new**, **reuse existing**, **fold into the
browse session**, **keep deliberately live**, **client-only rewire**, or **defer unused**. A feature
may be reduced only where the target-mode acceptance floor expressly permits it; otherwise failure
to support a current workflow additively triggers Section 0. Explain in ordinary language and
include old IDs only for lookup.

### Counts and polling

- Keep live new-image/ticker polling distinct from snapshot membership.
- Choose one exact initial-count owner.
- Preserve ticker names/sub-counts and define active/hidden-tab frequency.
- Plan route-level instrumentation and an off-by-default flag; capacity is a post-build gate.

### Contextual facets, typeahead and collection counts

- Support fully qualified field paths verbatim; never blindly prefix `metadata.`.
- Include named `is:` filters and nested usage aggregations with reverse-nested parent-image counts.
- Apply current search context, visibility tier, field allowlists, bucket/cardinality caps and
  cancellation.
- Route the collection store through the API-only datasource; a Strangler override alone is
  insufficient.
- Decide whether a shared batched endpoint or smaller semantic endpoints best match current calls.

### Position map, exact rank and range selection

- Treat these as operations over the displayed order, not independent generic endpoints.
- Specify the same-snapshot contract, scheduling/serialization, chunk/response caps, cancellation,
  progress and expiry behavior.
- Preserve exact selected-maximum semantics for Last used/Added to collection.
- Route the selection store through the API-only datasource.
- If current source proves any accepted exact operation cannot be served additively, halt under
  Section 0 rather than reclassifying it as an optional reduction.

### Multi-image and single-image reads

- Reuse existing `GET /images/:id` where its current contract is sufficient; account for detail,
  traversal, actions and API absence.
- Design multi-image fetch from actual selection sizes and fields consumed, not the direct `_mget`
  chunk size.
- Omit unauthorized IDs exactly like missing IDs, with no count/error disclosure.
- Specify a conservative configurable provisional server cap and matching abort-aware client
  chunking policy for implementation and functional tests. Label it provisional; define the
  post-build size/concurrency experiment and decision rule which accepts or replaces it before
  production enablement.
- Choose exactly one enrichment commit owner.
- Preserve complete special-date arrays and alias values required for display/cursors.
- In this reduced mode, migration requests are rejected rather than selecting C/M precedence.

### Distributions and seek estimates

- Separate exact coordinate operations from approximate presentation.
- Scalar-date/null-zone evidence may be exact only where source proves it. Multi-valued special-date
  histograms must remain labelled approximate unless using materialized latest-date fields.
- Keyword distribution must report represented versus valued coverage and completion; an incomplete
  response cannot fabricate a null boundary or rank.
- Reassess the high-cardinality keyword target-walk **endpoint shape**, not the current deep-keyword-
  seek capability. The historical walk may be discarded only if another backend algorithm preserves
  the current accepted seek behavior. The capped direct-ES `from/size` fallback is not available in
  API-only mode and is not an acceptable substitute for a requested deep position. If no additive
  backend algorithm can preserve the workflow, halt under Section 0.
- Give optional routes independent flags and rollback.

### AI search

- Current media-api AI is not assumed equivalent to current Kupua AI. Compare filters, blend,
  result cap, totals, sort and Bedrock/ES ownership.
- Preserve current Kupua AI semantics behind an additive backend route whenever the existing AI
  health gate says the capability is available. Ordinary health-gated absence may remain unchanged.
  If semantic parity cannot be achieved without changing an existing production contract, halt
  under Section 0 rather than disabling AI or leaving it accidentally direct ES.

### Unused/reserved methods

- Verify current application callers for `searchRange`, corpus-wide `getAggregation`, `count` and
  every optional method.
- Do not build an endpoint for an unused method merely to satisfy the interface. Remove, reserve or
  make mode support explicit in types/tests as appropriate.

## Mandatory migration-exclusion design

Do not say only “disable Kupua during migration.” Produce an executable gate design with an honest
guarantee level.

Trace the current migration status provider and choose the smallest reliable surface. The plan must
specify:

- which server component decides `available` versus `migration-unavailable`;
- how `NotRunning`, `InProgress`, `Paused`, completion preview and status-refresh error map to that
  decision;
- how session creation and every session-bound operation fail closed;
- how an already-loaded but idle Firefox tab learns that migration began within a bounded interval;
- how active requests and background map/range/count work are cancelled or refused;
- how the client discards all pre-migration session handles and loaded coordinate authority;
- why a session cannot resume when migration ends and the current alias may point elsewhere;
- what must be observed before new sessions are admitted after completion;
- behavior when migration status is unavailable or stale;
- behavior in direct-ES development mode, which may remain separate but must never be selected as a
  fallback from API-only mode;
- tests for start-during-session, pause, preview, status error, completion, browser reload and
  cross-instance requests.

Choose one of these guarantees explicitly:

1. **Bounded fail-closed detection:** media-api owns the gate; name the status freshness and polling
   bounds, prove a session admitted in the check-to-start overlap stays on one concrete ordinary-
   operation snapshot and is invalidated before it can cross cutover, and never claim that no
   session can begin after migration's true start instant; or
2. **Atomic exclusion:** migration start and every API-only session create/operation share a narrow,
   durable admission-generation interlock. This limited coordination is in scope only if it is
   additive and leaves writes, canonical read policy, cutover, aliases and Kahuna behavior
   unchanged.

Do not change Thrall write behavior, canonical migration reads, alias cutover or existing Kahuna
read policy. If bounded detection cannot make the overlap correctness-safe and atomic exclusion
requires the wider decision-04 programme, Section 0 must say so and stop.

## Client ownership and zero-ES enforcement

The output must make “zero direct ES” mechanically testable rather than aspirational.

At minimum plan:

- one datasource/mode composition root used by search, selection, collection counts, detail and
  every optional capability;
- removal of direct `new ElasticsearchDataSource()` from API-only runtime owners;
- no mixed API/ES method delegation in API-only mode;
- startup configuration that does not require an ES URL, index name, ES health request or SSH ES
  tunnel for this mode;
- a development/runtime guard which fails loudly if browser code attempts `/es` while API-only mode
  is active;
- a maintained browser-network assertion covering every accepted workflow and failing on any
  browser-to-Elasticsearch request, including background polling, typeahead, facets, position maps
  and selection. Classify traffic using every configured ES base/origin plus Elasticsearch API
  signatures such as `_search`, `_count`, `_mget`, `_pit` and aggregation requests; a `/es`-only
  path assertion is insufficient;
- explicit API-only capability typing so optional absence cannot accidentally invoke the ES
  implementation;
- an intentional core-service unavailable state with no silent empty-result corruption and no
  direct fallback;
- preservation of the separate direct-ES mode until the team chooses to remove it.

Choose a checked-in browser-to-media-api transport for development and API-only browser acceptance.
Vite proxying is development/test evidence, not proof of a production ingress. Inventory every new
read-via-POST route in the Vite write guard and permit those exact reads without enabling the global
write flag; prove unrelated writes remain blocked. The output must also specify the intended browser
principal/authentication model and the additive production ingress/config work or evidence gate.
Unknown production CORS/CSRF/ingress details may block production enablement, but they must not be
mislabelled as capacity work or omitted from the implementation footprint.

Name every existing test that assumes the API is blocked or direct local ES is present and state
whether it remains a direct-mode test, becomes shared, or gains an API-only counterpart. In
particular, the habitual E2E fixture which intercepts `/api/**` cannot prove API-only mode.

## Test strategy required in the workplan

The output is implementation-ready only if each implementation slice has a falsifiable test and
the complete relevant regression surface.

For every confirmed bug, require a failing test first and confirmation that it fails for the right
reason. Before each behavior change, list existing tests likely to assert the old behavior. If a
test fails, the implementation session must decide whether code, test or intended behavior is
wrong; never weaken assertions automatically.

Plan these layers:

1. **Language-neutral semantic fixtures:** query/filter/date/sort/cursor parity shared by Scala and
   TypeScript tests.
2. **media-api integration tests:** real local Elasticsearch for query, session, map/rank/range,
   mget, aggregation, migration-gate and failure behavior.
3. **Controller/auth tests:** principals, hidden versus missing, JSON validation, typed failures and
   migration unavailable. Existing lack of controller tests is not a reason to leave these
   contracts unproved.
4. **Kupua unit/store tests:** API routing, session lifecycle, tuple/enrichment publication,
   cancellation, history/re-anchor, selection and optional reductions.
5. **API-only browser tests:** all accepted workflows against backend APIs with the browser ES
  proxy absent or terminal and all configured ES origins/signatures forbidden. Include Firefox or
  explain exactly how equivalent browser-network evidence will be obtained. A test which only
  rejects `/es` is insufficient.
6. **Existing regression surfaces:** full media-api tests, full Kupua unit tests and habitual direct-
   mode E2E after relevant changes. Follow the repository's commands and port warnings in future
   implementation sessions; do not run them now.
7. **Special-sort local ES oracle:** run after changes to sort clauses, cursor extraction, maps,
   ranks, ranges and distributions, subject to its existing local-only safeguard.

Give each phase entry criteria, exact focused tests, full regression tests and exit criteria. The
final API-only acceptance journey must exercise search, all three browsing tiers, sort/focus,
history, facets/typeahead, collection count, detail/traversal, selection hydration/range and every
retained optional feature while proving zero browser-to-Elasticsearch requests under any configured
origin or path.

## Performance, capacity and production enablement

Do not ask for a production capacity verdict before there is a complete disabled implementation.
Do not postpone instrumentation until after implementation either.

The workplan must include two separate phases:

### During implementation

- retain/add per-route request duration, ES `took`, result count, response bytes, timeout/partial
  outcome and error dimensions without logging queries, IDs or sensitive data;
- expose PIT/session create/continue/close/expiry and cleanup counts;
- record work/caps for map, range, distributions, aggregations and mget;
- keep every new capability off by default and independently reversible where practical;
- use current D3 measurements as component evidence only, never as the whole-mode verdict.

### After functional completion, before production enablement

Define one representative aggregate workload based on real Kupua interactions, including search
starts, page extension, active-tab polling, facet/typeahead use, map construction, deep seek,
rank/range, detail/traversal, selection hydration and concurrent tabs/users. Measure route-level and
combined behavior.

Require owners to set numeric budgets before inspecting results for:

- existing Kahuna/media-api p95/p99 latency and error rate;
- media-api CPU, allocation, GC, post-GC heap, active requests and autoscaling recovery;
- Elasticsearch search queue/rejections, `took`, heap, disk, file descriptors, open contexts and
  retained segments;
- final Argo response bytes, serialization, enrichment and signing;
- session cleanup/expiry and return to baseline;
- per-feature latency and interaction delay;
- satellite/media-origin load where a retained workflow introduces it.

Specify a canary, rollback flags and the rule that a failed route may be disabled independently only
when the target-mode acceptance floor already classifies that feature as optional. If a required
workflow fails its capacity gate, keep the complete API-only mode dark until it is corrected or the
user explicitly approves a revised product boundary; never silently reduce it or restore browser
ES. A separate service/fleet is an evidence-triggered mitigation, not the default architecture.

## Implementation workplan requirements

The output must be buildable by fresh implementation agents. Organize work into dependency-ordered
phases rather than one phase per historical gap. For each phase include:

- user-visible capability delivered or reduction enforced;
- exact current defect/ownership boundary addressed;
- selected endpoint/session contract and typed outcomes;
- server files, symbols and shared helpers changed;
- Kupua files, symbols and composition-root changes;
- existing tests affected;
- failing-first tests and focused validation;
- full relevant regression surface;
- feature flag, mixed-version behavior, rollback and observability;
- prerequisites and what later phases it unblocks;
- explicit done criteria, including zero-ES evidence where applicable.

Choose slices that can be reviewed and validated independently but converge on one API-only mode.
Do not prescribe commits or pushes. Do not suggest shipping a partially mixed mode as the final
measurement target. An intermediate Strangler route is allowed only behind development flags and
must have a named expiry/removal point.

Include a final file-impact table grouped by Kupua, media-api, tests, config/scripts and docs. Call
out shared production-reachable files separately from new Kupua-only paths.

## Required output structure

0. **Premise failure** - only if halting.
1. **Decision card** - premise verdict, selected architecture, accepted workflows/reductions,
   largest risks and exact next implementation phase in plain English.
2. **Target mode contract** - what API-only means, what migration unsupported means and explicit
   non-goals.
3. **Source and status map** - current built, current D3, planned-only, historical/superseded and
   deployment unknown.
4. **Current browser-to-ES escape matrix** - 20-40 grouped rows, every datasource method and owner.
5. **What is wrong with the old endpoint plan** - confirmed/modified/refuted, plain language.
6. **Selected ordinary-operation architecture** - one decision, session/live boundaries and why it
   is proportionate without decision 04's production migration programme.
7. **Revise the existing cursor-search implementation** - the mandatory D3 dossier above.
8. **Corrected capability and endpoint matrix** - build/reuse/fold/live/rewire/defer/reduce, old IDs
   as cross-references only.
9. **Endpoint and client contracts** - enough request/response/error detail to implement, including
   caps and ownership.
10. **Migration-exclusion gate** - server/client lifecycle and exact tests.
11. **Zero-direct-ES client wiring and enforcement** - composition root, startup, guards and
    browser proof.
12. **Implementation sequence** - dependency-ordered phases with file/symbol/test/flag/done detail.
13. **Test migration and parity plan** - existing tests affected, failing-first and full surfaces.
14. **Instrumentation and aggregate load plan** - build-time metrics, post-build capacity decision,
    canary and rollback.
15. **Production/Kahuna isolation argument** - existing caller reachability and every shared file
    touched.
16. **Discarded and deferred old-plan items** - why no endpoint is built for them and exact product
    consequence.
17. **File and service footprint** - Kupua, media-api, Elasticsearch, auth/config and optional
    services.
18. **Residual decisions and evidence gates** - owner, cheapest resolution and whether it blocks
    implementation or only production enablement.
19. **Source coverage and untraced surfaces** - bounded, not a file dump.
20. **What done looks like** - self-check against this prompt.

## Plain-language rules

- Introduce each legacy identifier once as `Cursor search (D3)`, then use the name.
- No sentence may rely on an unexplained A0/A2/P/R/U, D-number, Q-number or internal nickname.
- If impact categories help, put their plain-English meaning beside them every time.
- Start each major section with the conclusion, then evidence and implementation detail.
- Prefer one corrected matrix to prose that repeatedly reclassifies the same endpoint.
- Clearly distinguish “must be built,” “may be deferred,” and “must be measured after build.”
- Do not call something exact, equivalent, safe, easy or additive without stating the property and
  evidence.

## Anti-goals

- No product code, tests, builds, profiling, live systems or production data in this session.
- No support for browsing through an active index migration.
- No re-adjudication or implementation of decision 04's canonical epoch, global mutation fence,
  cutover readiness, alias transition or rollback programme.
- No D3-only production measurement presented as evidence for the complete API-only mode.
- No D3-only or search-only implementation accepted as the complete disabled API-only mode.
- No direct-ES fallback in API-only mode, including on API failure, expiry or migration status
  uncertainty.
- No one-endpoint-per-interface-method assumption.
- No endpoint for an unused method merely to make an interface complete.
- No copy/paste of the D7-D9 workplan or historical broad-plan endpoint shapes.
- No modification of legacy Kahuna `createSort`, `GET /images` semantics, authorization defaults,
  mappings, aliases or writes to make Kupua easier.
- No raw ES query/sort/filter capability exposed merely because current TypeScript already has it.
- No approximate histogram/distribution allowed to mint exact positions or cursors.
- No claim of zero production impact before aggregate post-build measurement.
- No requirement for capacity data that can only exist after implementation as an excuse not to
  produce the workplan.
- No unexplained letter-heavy prose.
- No stale finding and its contradiction retained in the output.

## Completion standard

The workplan is complete only if a fresh implementation agent can answer without reopening the
planning bonanza:

- Exactly what does API-only ordinary-operation mode support and reduce?
- How is zero browser Elasticsearch traffic enforced and tested in Firefox?
- Why is active index migration safely out of contract, including already-loaded sessions?
- What is wrong with the old endpoint plan, and which old items are discarded?
- Exactly how must current D3 change on the server and in Kupua before review can resume?
- What D3 mechanics and evidence are retained, and what raw sort/PIT/fallback behavior is removed?
- Which operations share one snapshot, and which are deliberately live?
- Who owns the initial exact count, polling counts and ticker counts?
- How do facets, nested usages, collection counts, position maps, ranks, ranges, single/multi reads,
  distributions and AI leave direct ES or become explicit reductions?
- Which stores currently bypass the Strangler and how are they rewired?
- Which existing production contracts remain byte/behavior unchanged?
- What tests fail first, which existing tests change, and what full surfaces run after each phase?
- What browser journey proves all accepted workflows with zero browser-to-Elasticsearch requests
  under any configured origin or path?
- What is instrumented during implementation, and what aggregate workload is measured only after
  functional completion?
- What evidence blocks implementation, versus what evidence blocks only production enablement?
- What is the exact dependency-ordered implementation sequence, rollback boundary and done
  criterion for every phase?

If any answer is “follow D3/D8/D9” or “see the earlier findings” rather than being restated and
resolved in the output, the workplan is not done.

---

**Expected output file:**  
`kupua/exploration/docs/zz Archive/media-api-work/2026-09-migration-assessments/api-only-assessment-01-workplan.md`