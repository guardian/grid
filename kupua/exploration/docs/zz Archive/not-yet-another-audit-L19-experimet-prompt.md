# L19: Small-Result Tier Experiment

> **Archived 9 October 2026; the experiment remains unexecuted and unapproved.**
> This saved prompt is historical design input, not a current task. Any future reuse
> requires a fresh brief and current instructions; its gates and reviewer counts
> below are not standing execution requirements.

**DORMANT PROMPT, saved 6 October 2026. Not selected or authorised for execution.**
Reading, finding or linking this file does not activate it. Wait for the operator
to explicitly commission the experiment, then follow fresh-agent confirmation.
Saving this prompt authorises no code change, test, server, profiling, live access,
Git mutation or permanent tier removal. The coordinator/operator may revise it first.

## Purpose And Decision

Test whether removing Kupua's dedicated small-result eager-loading regime produces
a genuinely simpler system with acceptable user experience and request cost.
Only Kupua changes. Kahuna is historical comparison evidence, not an edit target.

Primary objective: fewer production responsibilities, schedulers and competing
state transitions. Secondary objective: lower network/ES work and better speed,
which require measurement. Implementation effort is not a rejection criterion.
If correctness repairs recreate comparable code and complexity elsewhere, the
simplification has failed. Do not rescue it with a new cache or loading engine.

[Stage 1](not-yet-another-audit-ledger.md#stage-1-small-result-tier-assessment-6-october-2026)
estimated 205-225 noncomment production lines removed, 50-100 added, net 105-175
fewer; tests could shrink or grow. These are estimates at `89bdb63705e2c0635eb555132b6c3420114fe5e3`,
not a deletion quota or measured result. This is not a proposal to halve Kupua.

## Read And Resume Locally

Read [AGENTS](../../../AGENTS.md), [worklog](../worklog-current.md), the ledger's
[Coordinator Brief](not-yet-another-audit-ledger.md#coordinator-brief),
[L19](not-yet-another-audit-ledger.md#tier-and-startup-cost-reassessment-l19), Stage 1,
test-maintenance/review requirements, and relevant sections of the
[measurement document](not-yet-another-audit-L19-network-measurmenets.md).
Before measurement, read the [perf harness guide](../../../e2e-perf/README.md),
[browser playbook](../embedded-browser-playbook.md) and [safeguards](../infra-safeguards.md).

Record current HEAD, relevant dirty work and differences from Stage 1. Preserve
other sessions' work. Revalidate the named deletion candidates and direct callers;
do not repeat a whole-app audit. Historical eager-preservation requirements are
not this experiment's contract. Existing evidence is reusable within its limits.

## Gate 1: Confirm The Deletion Case

Before implementation, reconcile Stage 1's table with current source. Identify
what actually disappears, what shared code stays, required adaptations and affected
tests. Keep production and test accounting separate; do not count moved/renamed
code, comments, wrappers or temporary A/B plumbing as simplification.

Expected removal: origin eager fill, re-centred eager top-up, their calls and
completion-specific state, and small-set extent-growth placement retry. Shared
extends, seek, publication, compensation and ownership do not all disappear.

Explain the specific remaining uncertainties: demand wake-up after cooldown or
publication, partial/failure settlement, rank ordering and legal offset paths.
If current source invalidates the credible smaller end-state, report why and STOP.
If a materially different candidate or comparable replacement machinery is needed,
return to the coordinator/operator; do not silently widen the task.

## Gate 2: Build A Reversible Local A/B

After explicit activation and scope confirmation, implement the bounded candidate:

- A: current small-result eager behaviour.
- B: ordinary small totals use existing indexed coordinates and demand loading,
  with neither full-set completion nor additional position maps.
- Select the policy coherently for the admitted search, not by map readiness or
  a mid-search toggle. Keep zero-result and finite AI contracts intact.
- Separate coordinate eligibility from map acquisition at every trigger. Preserve
  the existing larger-result map range; setting the scroll threshold to zero alone
  is not a valid experiment. Preserve supported forced-seek/local overrides.
- Hold page sizes, buffer capacity, media caching, prefetch and debounce settings
  constant initially. No new visited-window cache, eager driver, generic coordinator,
  permission system, backend change or tuning campaign.
- Keep KUP-039/default admission and polling identical in both arms. Preserve future
  permission-derived defaults and explicit rights; do not hard-code all-rights.
- API is the primary target; direct ES remains functional. Local ES's smaller
  legal result window must work through existing safe paths, not raised limits.
- Preserve publication, authorization, frozen admission, tuples, alignment,
  position/focus/selection, density and detail/traversal ownership.

Small correctness adaptations belong under existing owners. Visible demand must
not remain stranded until another user gesture, spin on empty/error pages or
redispatch after retirement. Hold late replies across same-total successors,
density/unmount and newer focus/Home intent. Preserve quiet API absence and useful
resident rows. Retain meaningful true-edge, short-extent and physical-clamp proof.

Identify affected existing assertions before editing. Write focused failing-first
proof for correctness repairs; update intentional eager-loading expectations
without weakening independent contracts. Reuse suites/fixtures and retire truly
obsolete completion-only proof. Do not build a large new combination matrix.

Run focused checks, then required full gates from repository root:

```sh
set -o pipefail; npm --prefix kupua test 2>&1 | tee "$TMPDIR/kupua-test-output.txt"
set -o pipefail; npm --prefix kupua run build 2>&1 | tee "$TMPDIR/kupua-test-output.txt"
set -o pipefail; npm --prefix kupua run test:e2e -- --retries=0 2>&1 | tee "$TMPDIR/kupua-test-output.txt"
```

Run separately and wait for completion; never hide the stream, poll an active run
or start a duplicate. Coordinate ports 3000/3030 and existing apps before E2E;
follow the repository's execution/sandbox rules. Preserve scoped validation records.
Validate each applicable A/B arm without assuming default-arm green proves B.
Use supported runner configuration; agree changes rather than invent ad-hoc test
overrides. If harness code changes, run its documented validation gate too.

On explicit activation, two independent read-only cold-review subagents are
authorised: structure/subtraction and correctness/proof. Supply complete scoped
baseline-to-current diffs, full new files, revision/dirty attribution and necessary
context in verified-readable artifacts; do not assume reviewer Git access. Repair
findings and provide the updated complete snapshot for re-review.

Report actual projected B-only subtraction, A/B plumbing separately, remaining
risks and local results. A passing prototype is not permanent adoption.
STOP before profiling for the next gate.

## Gate 3: Agent-Run Measurement

Propose and obtain approval for exact commands, topology, finite run/action budget,
cache conditions and stop conditions. Perf commands are not automatically authorised
by activation. Live-system authority is separately required for this session;
historical reports, configured tunnels or shared tabs do not supply it. Agent-led
profiling precedes the operator's hands-on assessment.

Start locally. Reuse existing harness facilities and canonical results; instrument
only unanswered candidate questions, not a second general profiling system. Select
enough paired repetitions to expose variation within the agreed budget, balance A/B
order, and retain individual runs. Do not compare moving revisions or silently pool
different configurations. Run measured arms sequentially or explicitly account for
other tabs/processes' polling and background work. A warm browser is not a cold server.

Prioritise position zero:

| Journey | Purpose |
| --- | --- |
| Broad Home entry, first viewport, short scroll and return to start | Primary common-workload regression control; large total stays seek-tier |
| Actual Home reset from elsewhere | Preserve reset/density/position ownership; not interchangeable with reload |
| Small searches around 200, 212 and 950-1000, initially staying at zero | Direct treatment: useful first display versus unused eager remainder |
| Immediate and settled drag, then end/start/end and steady traversal | Demand delay, reuse, repeat reads and total session cost |
| Middle restore, density change, detail traversal/return | Correctness and restoration costs beyond origin loading |
| Just above 1000 and representative large-result navigation | Boundary/shared-path controls; do not re-prove the entire million-scale core |

Use deterministic local fixtures and bounded controlled latency first. Live result
counts can change; label actual scope/count and comparison limits rather than imply
fixed membership. Keep matching permissions, query/sort, viewport/density, media and
build configuration. The first 1000 of millions is NOT a small result set. Broad
Home has no identified startup saving from removing this tier; any claimed gain
needs a demonstrated shared-path cause.

Measure separately:

- API work: initial, post-render, interaction and idle requests by endpoint/purpose,
  offset/page size, returned versus distinct/repeated rows, cancellations, failures,
  encoded/decoded bytes and useful publication. No extra small-set keys/map calls.
- Media: transfer/cache hits separately from API rows. Retained cursors are not a
  row-window cache; warm image bytes do not guarantee each image is decoded.
- UX: input-to-correct-visible-destination, placeholder exposure, decoded readiness,
  frame timing/jank and position stability. Request completion is not visual readiness.
- Server work: correlated available API/ES timings/work evidence, with attribution
  limits. Browser cancellation does not prove ES stopped; fewer bytes or requests
  do not establish less CPU, queueing or multi-user capacity.

Correctness/safety failure or unbounded requests stops the affected run. A bounded
increase in reads or delay is a measured trade-off for operator judgement, not an
automatic failure and not permission to optimise around it mid-campaign. Report
per-journey outcomes; do not invent usage percentages or hide bad cases in averages.

No load generation, remote ES writes or weakened safeguards. For authorised live
reads, enforce a reload-persistent guard allowing vetted reads, including legitimate
POST reads, while blocking mutations. Never save credentials, identities, raw live
payloads/HARs or signed URLs. Persist only safely redacted aggregates; inspection
tools and traces can leak URLs, so plan redaction before capture or disk output.

## Gate 4: Operator Replay And Decision

After agent measurement, provide two clearly identified runnable versions and a
short recipe for the same actions, including initial/settled timing and reset state.
Do not repurpose or stop the operator's existing app without agreement. Give URLs
and relevant prerequisites when launched; agent results precede subjective replay.

The coordinator/operator decides adopt, reject or one justified revision. Do not
ship B or delete A automatically. If repairs restore comparable complexity, fail
the simplification premise even if benchmarks improve. Conversely, modest line
savings can be worthwhile if competing mechanisms genuinely disappear. Speed,
server cost and code size are distinct outcomes; none substitutes for correctness.

## Outputs And Boundaries

- Ledger L19: concise current stage, selected scope, actual deletion accounting,
  decisions, remaining risks and links. Preserve earlier evidence with its limits.
- Existing measurement document: one clearly identified experiment section with
  revision/configuration, reproducible action recipes, paired results and caveats.
  Link canonical perf outputs instead of duplicating their data system.
- Existing ignored test-results area: temporary review/diagnostic artifacts only;
  durable conclusions must survive their cleanup. No report per agent/session.
- Worklog: temporary progress across sessions; follow its ownership/reset rules.
  Update AGENTS, owning architecture and changelog only as warranted by actual work.
- Chat handoff: actual subtraction, useful/wasted work, UX results, uncertainties
  and the specific next decision. State what was not verified.

All writes stay inside `kupua/`. No unrelated repairs, Kahuna edits, commits,
branch/worktree mutations or pushes. Preserve concurrent work. Do not turn this
experiment into a rewrite of the wider ledger's architecture programme.