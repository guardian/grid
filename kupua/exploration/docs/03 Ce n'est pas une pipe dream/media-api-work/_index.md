# media-api-work — research & implementation docs

**`phase-3-minimal-gap-derivation-findings.md` IS the plan.**
It is the single source of truth for what work remains, in what order, and why.
Start there (its top banner has the build status + standing constraints). Do not start anywhere else.

---

## Active docs (kept here)

| File | What it is |
|------|------------|
| `phase-3-minimal-gap-derivation-findings.md` | **The plan.** Status banner + 20-method classification + post-D3 standing constraints. |
| `phase-3-d7-d8-d9-workplan.md` | **Next to build.** Detailed workplan for the three searchAfter companions (countWithTickers, PIT, mget). |
| `phase-3-d3-searchafter-scala-pr.md` | PR-description template for media-api Scala commits (one per gap). |
| `phase-3-d3-searchafter-sort-companion-workplan.md` | The deferred **Option A** sort design + its migration trigger. Live until Option A is built or abandoned. |
| `phase-3-d3-searchafter-perf-deep-dive.md` | Evidence-based perf analysis — the doc to discuss with engineers (lean envelope writer = the unbuilt prod lever). |
| `media-api-conventions.md` | Scala conventions extracted from the codebase. Hand to any agent doing media-api Scala work. |
| `media-api-instructions-for-agents.md` | Distilled agent instructions (mirrored to `.github/instructions/media-api.instructions.md`). Hand to implementing agents. |
| `media-api-worknotes.md` | Branch/PR-extraction recipe + early decisions (gap numbering is pre-findings). |

## Archived (moved to `zz Archive/media-api-work/` — findable, just out of the way)

D3 is shipped (`49cae4bb7` + `b52d027da`); B1/B2 are done. The build history, code reviews,
superseded perf docs, and the Phase-1/2/2.5 research inputs now live in the archive:

- `phase-3-d3-searchafter-{workplan,worklog,code-review,code-review-final,payload-perf-findings,perf-review,fileMetadata-aliases-companion-workplan}.md`
- `phase-3-b1-*`, `phase-3-b2-*` (B-bucket workplans — complete)
- `phase-3-minimal-gap-derivation-handoff.md`
- `phase-1-*`, `phase-2-*`, `phase-2.5-b2-hunt-*` (research inputs — subsumed by the findings doc)
- `ref--*` (pre-Phase-3 reference; gap numbering outdated, but `ref--…-feasibility.md` and
  `ref--…-findings-2.md` hold elastic4s/PIT Scala notes worth consulting for D8/D2/D4/D5/D6)

> Executing a future gap? Authoritative algorithm source is the live kupua TS
> (`es-adapter.ts`, `null-zone.ts`, `sort-builders.ts`), not the archived Phase-2 snapshot.
