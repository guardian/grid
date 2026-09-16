# D3 search-after: targeted readiness reassessment

**Status:** Ready to run when explicitly requested. Writing this prompt does not execute it.
**Decision:** What, if anything, must change or be disclosed before PR #4849 returns to human
review, given current source, earlier reviews and the agreed additive prototype scope?
**Output:** `d3-search-after-01-readiness-findings.md` beside this prompt. Do not create it until
the assessment is performed. No new master plan, architecture programme or implementation prompt.

## Scope and operator facts

Read [the active index](media-api-00-index.md) first. It overrides archived execution gates.
Kupua is a working read-only prototype with current browsing, sorting, selection and history
behavior. Preserve all workflows and explicitly accepted approximations. Do not turn API adoption
into universal exactness. Conversely, prototype status does not excuse authorization defects,
unbounded backend work or unintended changes to existing Grid clients.

The operator confirms: `--use-TEST` is direct TEST ES through an SSH tunnel; `--use-media-api`
uses locally running modified Grid media-api plus remaining direct ES paths. D3 has one laptop
caller, was deployed to TEST once successfully, and PR #4849 is back in draft without human
review. Recorded Copilot reviews are not human review. Local-media-api performance campaigns
and the separately deployed TEST gzip experiment are not a full deployed-D3 load campaign.
Do not invent unknown callers, require another deployment investigation, or design a versioned
compatibility window without new contradictory evidence.

Grid index migration is unsupported by the prototype. The operator may not use it during a
migration; deployed maintenance behavior can be agreed separately. There is no current promise
of atomic exclusion, an automatic detection deadline or migration-transparent browsing. Do not
require Dynamo, Thrall changes or completion of the archived migration sequence for D3 review.
Ordinary-operation defects still matter; classify them rather than dismissing them as migration.

This reassessment is report-only. Read local code, tests and relevant Git history. Do not edit
product code/tests, run tests/builds/profilers, send browser/ES/AWS requests, fetch remotes, change
branches, stage, commit or push. No subagents unless separately requested. Only the named report
and local session worklog may be written; do not add an assessment narrative to the changelog.
Never persist credentials, signed URLs, real user data or request/response bodies.

## Read in this order

1. `kupua/AGENTS.md`, current worklog, index above and the current-summary portion of
   [the capability inventory](media-api-01-capability-inventory.md).
2. [Current PR draft](d3-search-after-02-pr.md), [sort options](d3-search-after-03-sort-options.md),
   [implementing instructions](media-api-91-instructions-for-agents.md), and the relevant parts
   of [Scala conventions](media-api-90-conventions.md).
3. [Earlier post-PR review](../../zz%20Archive/media-api-work/phase-3-d3-searchafter-post-pr-review.md),
   especially D-6, and [the final implementation review](../../zz%20Archive/media-api-work/phase-3-d3-searchafter-code-review-final.md).
   Read the May/June D3 and August review changelog entries when needed to distinguish fixes,
   refutations and accepted limitations. Do not restart those reviews from scratch.
4. Only the D3-relevant findings in [the consolidation audit](../../performance-first-dry-consolidation-audit-2026-09-13.md),
   [production-impact assessment](../../zz%20Archive/media-api-work/2026-09-migration-assessments/production-impact-01-findings.md),
   and [API-only assessment](../../zz%20Archive/media-api-work/2026-09-migration-assessments/api-only-assessment-01-workplan.md).
   Their architecture recommendations and acceptance checklists are not requirements for this task.
5. [D3 performance evidence](d3-search-after-04-performance.md) and
  [the performance handbook](../../../../e2e-perf/README.md) for topology and already-measured costs.

Then trace the named finding into the current controlling source and nearby tests. Start with
`media-api/conf/routes`, `MediaApi.searchAfterImages`, `SearchParamsBody.fromJson`,
`SearchAfterParams`, `ElasticSearch.searchAfter`, `jsonToSort`, `QueryBuilder`, existing auth
helpers and `ImageResponse`. On the client, follow `apiSearchAfter`, `StranglerAdapter`,
`search-store` commit/eviction/focus paths, tuple cache and enrichment store only as needed.
Do not explore unrelated writes, infrastructure or rendering internals.

## Candidate register, not assumed bugs

Give every row a disposition. Merge duplicates; do not manufacture a finding to fill a row.

| Candidate | What to establish from current source/tests |
|---|---|
| Deleted-image authorization and visibility | Compare intended principal rules with legacy search and D3 hits/totals. Trace positive deleted predicates, uploader scope and visibility before enrichment. Do not weaken existing POST/machine-principal policy. |
| Query defaults and filters | Establish actual parser/default ownership, empty query behavior and any filter dropped, duplicated or changed at the boundary. A duplicated default is not automatically an observable defect. |
| Date boundaries | Compare all effective upload/taken/modified bounds with direct Kupua and legacy GET. Distinguish a Kupua port mismatch from an intentionally different legacy convention. |
| Strict body and cursor validation | Check wrong JSON types, offset, sort fields/options, cursor arity/types, page limits and error shaping. Confirm which previous fixes already cover them. |
| Raw sort and raw PIT transport | Identify concrete validation, binding, disclosure, replay or resource risks. A semantic contract may be preferable, but ES-specific wire shape alone does not prove it must change before review. |
| Partial/incomplete responses | Trace timeouts, failed shards, invalid projected hits and image/tuple alignment. State what D3 does versus legacy/direct mode, and the observable consequence. |
| Projection and include | Check configured aliases and complete arrays consumed by special sorts; classify `include=fileMetadata` against the actual lean projection. Do not redesign `ImageResponse`. |
| Client tuples | Trace server tuple retention through eviction, range, focus and restore. Determine whether raw-path reconstruction from an API-shaped image is actually reachable. |
| Client enrichment | Check fresh/fallback/focus/seek/extension commits; probes must remain side-effect free. Identify Scala fixes separately from client publication fixes. |
| PIT lifecycle and initial counts | Identify page-one/PIT timing, refreshed-ID handling, expiry fallback and count ownership. Separate existing direct-mode limitations from new D3 regressions and stronger proposed guarantees. |
| Containment and cost | Identify actual shared production-reachable changes and existing regressions/tests. Reuse compression/projection/enrichment measurements; do not demand a new writer or full API-only implementation as a condition of D3 review. |

The `_shard_doc` review already measured and refuted a proposed fix. Do not resurrect it without
new evidence that invalidates that result under D3's actual single-index/unique-ID contract.
Similarly, approximate special-date presentation and small live distribution/count differences
are not permission to weaken exact map/rank requirements, but neither are they new bugs solely
because a stronger snapshot model could remove them.

## Evidence and stopping rules

- For each claim, cite current repository-relative `file:line` at the deciding code path and a
  relevant test or named missing test. Historical source line numbers are leads, not verification.
- Label evidence as current source, existing test assertion, historical measurement, operator fact,
  or unverified hypothesis. Reading a test is not running it; do not report historical green counts
  as current verification. Identify whether inspected source is the working branch or an available
  local PR ref; do not claim the remote PR matches without evidence.
- For a suspected defect, state input/condition, actual behavior, accepted expected behavior and
  the cheapest check that could disprove it. Separate endpoint, client and shared-backend ownership.
- If a claim is refuted or already fixed, remove it from the actionable list and record that
  disposition once. No simultaneous bug and refutation entries.
- If a technical choice needs a product decision, explain the observable trade-off in plain English
  and give a recommendation. Do not infer permission for the stronger alternative.
- Stop when the candidate register is disposed of and the review recommendation is supported.
  Only add a newly discovered adjacent issue if it materially changes D3 readiness. Cap unrelated
  observations at three one-line pointers; no repository-wide audit or new research queue.
- If no actionable new findings remain, say so and stop. A useful result can be "return to review
  with these disclosures"; no minimum bug count or mandatory architecture change exists.

## Output shape

Keep the report around 1,200 prose words plus one compact matrix, normally no more than 15 rows.
Exceed the bound only for a concrete unresolved security/correctness issue and explain why.

1. **Decision:** ready for human review, ready with explicit decisions/disclosures, or named fixes
   needed first. This is not permission to deploy to production or a certification of correctness.
2. **Disposition matrix:** finding/candidate; endpoint/client/shared owner; evidence and confidence;
   classification; concrete consequence; smallest next action or discriminating check.
   Use exactly: **fix before review**, **team decision/disclosure**, **later work**,
   **already resolved/refuted**. Explain why a blocking row must block this incremental PR.
3. **Fix/test impact:** for each proposed fix, identify the failing-first test to add, old-behavior
   assertions likely to change, and full relevant suites required after implementation. Tests are
   not run in this assessment. Do not weaken old assertions without explaining the behavior choice.
4. **Review notes:** concise material for the existing PR draft: scope, unsupported migration,
   known limitations, measurement topology and remaining team questions. No speculative consumers.
5. **Coverage limits:** source/ref inspected, tests not executed and genuinely unresolved facts.

Relevant existing suites include `ElasticSearchTest`, `SortsTest`, API adapter/Strangler tests,
search-store PIT and eviction-cursor tests, enrichment tests and the local special-sort oracle.
Future code fixes must run the required full surfaces: media-api tests for Scala changes; Kupua
units for `src` changes; habitual E2E for store/hook/component/scroll changes, with the required
port warning and live streaming. Do not run the local mutation oracle against TEST/PROD.

## Done

- Every named candidate is classified, with prior fixes/refutations respected.
- No architecture is selected merely because a previous assessment recommended it.
- Current workflows, accepted compromises, authorization and Kahuna isolation are preserved.
- Endpoint readiness is distinguished from client completeness and production enablement.
- The report leads to bounded fixes or team review, not another master plan.