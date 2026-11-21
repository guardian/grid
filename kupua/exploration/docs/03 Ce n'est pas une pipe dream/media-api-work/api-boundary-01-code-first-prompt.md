# API boundary 01: source-first design assessment

**Status:** Ready to run in a fresh agent session; research, not implementation.
**Required first read:** [Operator brief](api-boundary-00-brief.md).
**Your sole report:** `api-boundary-02-code-first-findings.md` in this folder.
**Next stage:** A different fresh agent will challenge your report. Do not run that stage.

## Your task

Determine the smallest defensible addition to trusted server capabilities that would let
Kupua preserve its current capabilities and performance without browser Elasticsearch access.
Consider changing Kupua's implementation substantially if that genuinely reduces Grid risk
and maintenance burden. Do not assume that its DAL methods must become matching endpoints,
that fewer endpoint names mean less server work, or that a wholesale rewrite is necessary.

The operator is not an engineer. Explain the recommended trade-off in ordinary language, with
technical evidence underneath it. This is an architectural decision study, not a general bug
hunt, code-quality audit, endpoint implementation assignment or search for features to remove.

**Your hypothesis is allowed to fail.** If preserving the required experience needs roughly
the existing amount of backend capability, say so. If the constraints conflict, explain the
specific conflict. Do not invent a reduction, a new service or a refactor to justify the task.
If no admissible architecture survives, write the decision, decisive evidence and smallest
needed operator decision, then stop rather than producing a fictional implementation plan.

## 1. Start and reading boundary

Follow the fresh-agent protocol. Read the shared brief, applicable safety instructions,
[AGENTS](../../../../AGENTS.md), and [the current worklog](../../worklog-current.md).
Read only the Current reality and Boundaries sections of the
[integration index](media-api-00-index.md) for current scope. State your understanding of the
task and obtain the operator's confirmation before any experiment requiring code changes.
Routine source reading and the permitted research outputs do not require implementation approval.

Your design evidence comes from current source, tests, observed behavior and explicitly stated
operator constraints. **Do not read the capability inventory, endpoint workplan, old integration
plans, architecture proposals, prior audit findings, D3 review narratives, this series' second
prompt, or their historical changelog narratives.** Do not search those documents for a plan.
Do not turn AGENTS' automatically visible endpoint ordering into your answer.

Allowed exceptions are applicable repository instructions, this brief, the index sections above,
and the browser/test/performance handbooks needed to operate an experiment safely. Read handbook
operating sections rather than following links to old architecture proposals. Existing raw
benchmark results may be consulted for a specific measurement question; their age, mode and corpus
must be checked. Official library/Elasticsearch documentation may resolve a technical mechanism;
verify the relevant version. Record unavoidable prior-plan exposure rather than claiming perfect
blindness. If an instruction genuinely requires more historical context, disclose that exception
and its reason; do not resolve the conflict by ignoring a safety instruction.

### Start at the actual behavior

Use these anchors, then follow only the consumers and helpers needed to settle your questions.
Do not read the entire repository or speculate about future writable features.

| Evidence | Initial source anchors |
|---|---|
| Data contracts and runtime routing | `kupua/src/dal/types.ts`, `index.ts`, `strangler-adapter.ts`, `grid-api-search-adapter.ts`, `grid-api/` |
| Actual search and navigation algorithms | `kupua/src/dal/es-adapter.ts`, `null-zone.ts`, `adapters/elasticsearch/sort-builders.ts`, `position-map.ts` |
| Callers, publication and separate data owners | `kupua/src/stores/search-store.ts`, `selection-store.ts`, `collection-store.ts`; relevant hooks, typeahead and field-registry consumers |
| Existing Grid capabilities | `media-api/conf/routes`, `app/controllers/MediaApi.scala`, `app/lib/elasticsearch/ElasticSearch.scala`, `ElasticSearchModel.scala`, `QueryBuilder.scala`, `sorts.scala`, `app/lib/ImageResponse.scala` |
| Real legacy usage and authorization | Actual Kahuna API callers, especially `kahuna/public/js/services/api/media-api.js`; trace relevant Grid auth/filter helpers when a candidate depends on them |
| Behavioral evidence | Nearby DAL/store tests, `kupua/src/dal/selections-dal.test.ts`, `kupua/integration/special-sort-es.test.ts`, relevant local E2E journeys, media-api ES/sort/controller tests |

Paths abbreviated within a row refer to the same owning directory as its full path; locate the
current file rather than trusting an old filename. Read tests for the behavior they actually
assert. Comments and type signatures are leads, not proof that every runtime owner uses them.
Distinguish the prototype working tree, available local main/PR refs and deployed behavior.
Use local history only when it resolves a concrete compatibility question; no automatic fetch.

## 2. Establish the experience that must survive

Build a compact workflow map, not a one-row-per-DAL-method catalogue. Trace each workflow to
the controlling source and network owner. Include composed workflows and non-search-store
owners, not just a successful initial search page.

Cover at least these groups:

- All three result-size tiers: complete small sets, indexed scrolling with position maps,
  and deep seeking through large sets; bounded image memory, both page directions, End,
  eviction/refill and navigation across buffer boundaries.
- Focus and position through sort changes and density changes; detail/fullscreen traversal,
  direct image URLs, browser back/forward and reload/restore.
- Every current semantic sort family, both directions where supported, configured aliases,
  tied values, missing values, and nested/multi-valued special dates. Exclude deliberately
  removed user-controlled secondary sorting, not the automatic tie-breakers.
- Live CQL and structured filters, safe defaults, counts/tickers and polling; effective query
  identity across companion requests. Do not invent functionality for currently unused methods
  or reserved/no-op parameters simply because they appear in a type.
- Facets, contextual typeahead, collection counts, sort distributions and deep-seek estimates;
  distinguish exact parent counts/ranks, bounded coverage and approximate display evidence.
- Selection hydration, missing/hidden image handling, out-of-buffer range selection and its
  truncation contract; aliases and server enrichment wherever the UI consumes them.
- Health-gated AI, its current filters, ranking choices, limits and total semantics; media
  delivery and optional satellites as dependencies, not unexamined ES escape paths.

Separate **current user-visible requirement**, **implementation choice**, **accepted limitation**,
**suspected existing defect**, and **proposed stronger guarantee**. Prototype authorization
shortcuts are not a feature to preserve in a trusted API. A known weak path is not permission to
claim it meets the performance requirement, nor permission to remove it without an operator choice.

## 3. Investigate the hard question first

After the initial source trace, choose one high-leverage uncertainty and say why resolving it
could change the architecture. Prefer a question about expensive navigation, query/sort ownership,
data volume, continuation/lifecycle or a similarly consequential dependency over an easy endpoint
chosen for its small implementation size. Do not assume which question wins before reading code.

For that question state:

1. The current mechanism and the proposed alternative, without treating either as correct.
2. Which capabilities and performance characteristics each must preserve.
3. A falsifiable hypothesis, including what would disprove the supposed saving.
4. The cheapest discriminating check: a source/test trace, local fixture, bounded experiment or
   explicit human decision. Do not substitute more prose if a feasible experiment would decide it.

Run permitted decisive checks under the brief's safeguards. Request the needed app mode and
session-specific TEST permission when appropriate. Start with a small, bounded experiment;
expand only to answer a new question exposed by its result. This task does not pre-authorize
product patches, Scala edits, production access, formal perf campaigns or load testing.

Treat keyword-mapping-based sorts as a concrete stress case when relevant. Establish whether
the weakness lies in supported field mappings, high-cardinality enumeration, deep seek, rank,
payload, rendering or another observed mechanism. Do not conflate the feature with one algorithm.
Compare direct and media-api paths only on a controlled, equivalent workload. Improvements must
not merely move large scans, response construction or memory pressure to another process.

## 4. Derive the server boundary

Only after the workflow and hard-question investigation, derive the capabilities the trusted
server actually needs. The result may retain current boundaries or propose new ones.

For every proposed server addition or existing-route reuse, establish:

- The real caller and user-visible need. Explain why an existing route is adequate or why it
  fails; check the current implementation, not a route name or an inferred library limitation.
- Whether client composition can preserve behavior and speed. Account for batch limits, ordering,
  round trips, duplicate work, enrichment and payload; do not replace a server loop with an
  expensive client fan-out and call that a win.
- Minimum request/response facts, permissions, validation, work bounds and error meaning.
  A compact illustrative contract is enough; do not write production code or a full API schema.
- Query and sort ownership, authoritative cursor/value provenance, declared data view and
  continuation ownership. Identify ordinary expiry, renewal, cancellation, overlapping requests
  and cleanup behavior. Stronger snapshot or persistent-session guarantees need a stated benefit,
  not an assumption that every positional operation must be redesigned together.
- Exact behavior retained, accepted approximation retained, and any changed behavior requiring
  approval. Failure is not a successful empty selection or zero count. Optional enrichment absence
  is different from losing the sole data source in API-only mode.
- New endpoint-local code versus changes to existing production-reachable code, shared defaults,
  auth, mappings or infrastructure. Shared behavior changes need justification and compatibility
  evidence. A new backend's complete operational responsibility belongs in the comparison.
- The focused test or experiment that would falsify the contract, plus the existing assertions
  and full regression surfaces affected by later implementation. Do not weaken an assertion to
  make a proposed architecture appear compatible.

Do not demand that every internal ES concept disappear from TypeScript unless doing so solves a
specific problem. Conversely, relaying unrestricted ES operations is not a substitute for a
trusted, bounded API. Preserve server policy rather than reproducing it casually in a new service.

Compare **two or three genuinely different candidates**, including a conservative continuation
of the present implementation as a baseline. Another candidate should test whether changing the
client/server division materially helps. A separate service is optional to investigate, not a
required third design. If only one candidate is viable, explain the rejection of the others.

Assess each by retained experience, expected/measured latency and work, new Grid logic, existing
Grid behavior touched, client churn, new infrastructure, reviewer burden and ongoing ownership.
Use ranges and confidence where sizing is possible; do not invent precise line/day estimates or
production capacity from source alone. Do not reward endpoint merging without a real reduction.

## 5. Evidence rules

- Every material source claim needs a current repository-relative file/line link to deciding
  code and, where relevant, an existing assertion or a named missing test. Documentation and
  comments alone cannot prove an existing route's limitation.
- Label evidence as **source**, **test read**, **experiment**, **operator constraint** or
  **hypothesis**. Reading a test is not executing it. An API-shaped mock is not an integrated
  media-api test. A test passing in hybrid mode can conceal a browser-ES fallback.
- Use the brief's experiment record and redaction rules. Record failed experiments as well as
  successful ones, and distinguish unavailable tooling from a falsified architecture.
- State performance claims at the measured topology, scale and cache state. First-visible data,
  interaction completion and frame responsiveness are different outcomes. Include the work
  occurring after first paint, including background maps, polls and hydration.
- If later evidence refutes your own claim, remove it from the actionable findings and record
  the corrected disposition once. Do not retain both a problem and its refutation as conclusions.
- Cap unrelated observations at three one-line pointers. No general cleanup queue, write-feature
  programme, speculative future consumers or independent Grid migration repair.

## 6. Required output

Write only the named report and permitted supporting artifacts. Aim for **1,500-2,500 prose
words plus one 15-25-row workflow matrix and compact evidence tables**. These are bounds on
presentation, not quotas for findings or endpoint counts. Merge truly equivalent workflows;
declare gaps rather than padding rows. Explain a necessary overrun for a material unresolved risk.

Use these sections:

0. **Decision.** The recommendation, its confidence, whether it preserves the full acceptance
   floor, and the hardest unresolved fact. A conditional recommendation must say what it depends on.
1. **Baseline and exposure.** Source/ref and modes examined, current capability/performance limits,
   instruction/planning context encountered, and operator facts separated from observations.
2. **Workflow coverage.** Stable row IDs `W01`, `W02`, etc.; behavior and bounds; controlling caller;
   proposed existing/new server capability; client change; compatibility/performance risk; evidence
   and remaining check. Every live browser ES owner must have a disposition.
3. **Boundary and alternatives.** The irreducible server work, existing-route reuse, minimal proposed
   contracts and candidate comparison. Distinguish eliminating work from moving or merely renaming it.
4. **Evidence.** Experiments `E01`, `E02`, etc., with controls/results/limits and links to any retained
   sanitised scratch artifacts. List tests actually executed separately from tests merely inspected.
5. **Hardest-first next step.** One bounded local proof or decision that could invalidate the chosen
   direction; proposed files/operations, prerequisites, success/failure criteria and rollback. Follow
   with at most five coherent implementation stages, not a speculative endpoint-by-endpoint schedule.
   Identify what maintainers must agree before extensive Scala work and how eventual review slices
   stay understandable without making each slice discover the architecture again.
6. **Unresolved decisions and coverage limits.** At most six material items, each with a precise
   next observation or owner decision. Put any proposed feature/performance concession here under
   **Separate product decision**, explicitly excluded from the preserved-capability recommendation.

If preservation is impossible under a candidate, reject that candidate explicitly. If all
candidates fail, the shorter negative-result output described above replaces the full template.
Do not create a second plan document, amend the active endpoint plan, or edit D3's PR description.

## Done when

- Every current workflow is covered or explicitly identified as unassessed; missing coverage
  prevents a claim of complete API-only feasibility.
- No capability was silently removed, no slowdown assumed acceptable, and no stronger consistency
  or migration guarantee was added as a hidden prerequisite.
- At least the highest-leverage uncertainty has a discriminating result or a precisely identified
  blocked check; the recommendation does not depend on an unmarked guess.
- Each claimed saving has a mechanism and preserved-behavior evidence or a clearly pending proof.
- The next action tackles consequential uncertainty and fits within the operator's scope.
- Reports, experiment status, browser instrumentation cleanup and any remaining worktree changes
  are accounted for. End with a short operator-facing recommendation, not a claim of implementation.