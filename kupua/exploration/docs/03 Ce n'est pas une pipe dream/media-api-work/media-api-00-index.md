# Media-api integration: start here

**Scope agreed with the operator, 15 September 2026.** Continue making the working read-only
Kupua prototype deployable through incremental, additive media-api capabilities. Preserve all
existing workflows and their explicitly accepted compromises. A finding about stronger
correctness is information for a decision, not automatic authorization to implement it.

## Current reality

- `--use-TEST` accesses TEST Elasticsearch through an SSH tunnel.
- `--use-media-api` uses locally running modified Grid media-api for qualifying `searchAfter`
  requests; other paths still use direct ES. This is a transitional mode, not API-only.
- The operator confirms that D3 has one caller: Kupua on their laptop. It was deployed to TEST
  once and worked. PR #4849 now includes the agreed code amendments; human review remains.
  Draft/ready status is the operator's choice, not a hold for known pending amendments.
  Recorded Copilot review comments and local-media-api performance campaigns are different evidence.
- B1/B2 and D3 are implemented. The remaining endpoints are not implemented merely because a
  research document specifies them. Read current source before implementing a capability.

## Boundaries

Grid index migration is unsupported by the prototype; the operator may stop using Kupua during
it. Future deployed operation may use maintenance mode. No atomic exclusion, bounded detection
deadline or migration-transparent browsing guarantee is currently promised. A deployable
maintenance mechanism must be agreed before relying on it for other users, not invented here.

Do not make Dynamo-backed sessions, Thrall hooks, canonical read/write changes or the archived
migration programme prerequisites for additive endpoint work. Ordinary PIT lifecycle, authorization,
query/sort parity and request validation still need proportionate decisions and tests. Neither
prototype status nor additive routing excuses data disclosure or unintended changes to Kahuna.

The eventual deployed mode must have no direct browser ES access. Incremental hybrid development
is allowed before that point. Do not describe a hybrid fallback as proof of API-only completion.
Production resource/load acceptance remains necessary; existing measurements should be reused,
not replaced by assumptions or repeated without a specific question.

## What to read next

| Purpose | Document | Authority |
|---|---|---|
| Completed D3 amendments | [Findings and amendment workplan](d3-search-after-01-readiness-findings.md) | Agreed scope complete; Section 6 records the executed plan and Section 7 the verification. |
| Assessment background | [Readiness prompt](d3-search-after-00-readiness-prompt.md) | Background for the completed assessment, not an instruction to restart it. |
| Remaining capabilities and known gaps | [Capability inventory](media-api-01-capability-inventory.md) | Current summary; historical derivation is evidence only. |
| D7/D8/D9 preparation after D3 | [Next endpoints](media-api-02-next-endpoints-d7-d8-d9-workplan.md) | Bounded choices and per-capability preparation, not one approved implementation batch. |
| Current D3 draft | [PR draft](d3-search-after-02-pr.md) | Implementation/evidence description; not declared ready by this docs pass. |
| D3 sort alternatives | [Sort options](d3-search-after-03-sort-options.md) | Trade-offs; no automatic requirement to switch ownership. |
| Existing D3 measurements | [Performance](d3-search-after-04-performance.md) | Dated evidence; distinguish local, deployed TEST and inferred PROD costs. |
| Scala conventions | [Conventions](media-api-90-conventions.md) | Implementation reference. |
| Implementing-agent rules | [Instructions](media-api-91-instructions-for-agents.md) | Safety and repository mechanics; mirrored to the automatic instruction file. |
| Archived audit and deferred evidence | [Completed consolidation audit](../../zz%20Archive/performance-first-dry-consolidation-audit-2026-09-13.md) | Selected queue complete; remaining findings are deferred or endpoint-routed, not build instructions. |

**Amendment status: DONE (17 September).** E2/C1 and E1/N4/C2/C3 are implemented and committed.
Independent written-code reviews, 305 Scala tests, 1,342 client units, 210 habitual E2Es, the
full client build and the guarded local cursor oracle passed. Scoped live direct-ES and locally
modified media-api/TEST checks also passed; findings Section 7 distinguishes them from mocked
fixtures and the injected API-outage check. Scala-only commit `e6485be4b` is isolated for
porting and has been integrated after merging `main` into the PR branch, then pushed as
`95a45f4ee`. All 305 media-api tests also passed on that integrated PR tree. The paired
client/docs amendments remain on the prototype. No known amendments in the agreed batch
remain pending; human review, merge and deployment are separate. Do not restart a general
assessment or equate these checks with production
capacity, whole-hybrid permission consistency or API-only readiness.

## Historical research

The September index-migration, production-impact and complete API-only assessments preserve
useful findings under stronger requirements than the current scope. Their implementation
sequences, gates and checklists are not active instructions. Do not resume their numbered
research programme without a new explicit decision. Archiving does not refute their findings.

- [Grid index-migration research](../../zz%20Archive/media-api-work/2026-09-migration-assessments/grid-index-migration-00-routing.md): historical sequence and assumptions.
- [API-only assessment](../../zz%20Archive/media-api-work/2026-09-migration-assessments/api-only-assessment-01-workplan.md): workflow coverage and proposed stronger architecture.
- [Production-impact findings](../../zz%20Archive/media-api-work/2026-09-migration-assessments/production-impact-01-findings.md): authorization, isolation, load and broader-horizon evidence.

Earlier D3 build/review evidence remains in `../../zz Archive/media-api-work/`. In particular,
read [the measured tiebreaker review](../../zz%20Archive/media-api-work/phase-3-d3-searchafter-post-pr-review.md)
section D-6 before changing `_shard_doc` handling. Prior proposal prose never outranks current
source, current accepted behavior, or the operator's scope decision above.
