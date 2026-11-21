# Simplification 3: Remove Browsing Mechanisms, Not Just Move Them

Prepared 11 November 2026. **Status: parked until the operator selects this work
after the current editing milestone.** No prototype, policy change, test run,
live access or Git mutation is authorized by the existence of this document.

Prefer to complete [API-only retirement](simplification-01-api-only.md) first.
If [image publication](simplification-02-image-publication.md) is also selected,
let that contract settle before changing the same store/hook boundaries. Neither
is an absolute technical prerequisite, but parallel rewrites are not the plan.
Do not make an unselected image-model project an indefinite gate on this work.

The editing prerequisite means an operator-chosen stable checkpoint, not every
future editing feature. This brief includes its own kickoff, review and recovery
prompts; a new chat can resume from the documents without a permanent coordinator.

## Outcome

Deliver a materially simpler browsing engine by retiring a complete special case
or replacing a complete coordination mechanism. Preserve the continuous experience
across large result sets, densities, detail, history, selection and editing.

The first candidate worth assessing is **ordinary small results using the existing
global-coordinate, demand-loaded path instead of separate eager-completion paths**.
It names concrete machinery that can disappear. It is a candidate, not an approved
UX change or a claim that the whole engine becomes simple afterward.

A better family-local replacement may be proposed at kickoff if current code
supports greater useful subtraction. Recommend one candidate; do not give the
operator an unranked catalogue or start a universal navigation-engine project.

### Human Meaning of the Candidate

With, for example, 800 matches, Kupua currently loads an initial page and then
tries to load the remaining set in the background. After a centred restoration,
another mechanism tries to complete both sides. Once all images are resident,
jumping around that small set needs no further metadata reads.

The candidate would load the useful window and fetch other windows when demanded,
using machinery the application already has. It could avoid unnecessary reads
and remove two completion drivers. But an early jump to result 700 might wait
for data, and repeated distant jumps might read a window again.

That trade-off must be shown and accepted, not hidden behind internal terminology
or a smaller line count. Correct positions, identities and permissions are not
negotiable merely because loading policy is being reconsidered.

## Execution State

Maintain current status here; temporary session detail stays in the existing worklog.

| Field | Current Value |
| --- | --- |
| Status | Parked; no prototype selected |
| Editing prerequisite | Rebase after the operator declares the preceding editing milestone ready |
| Predecessor status | API-only preferred; image publication only if separately selected |
| Selected candidate | None; small-result demand loading is the first assessment candidate |
| Selected unit | None |
| Active writer | None |
| Accepted code baseline | Establish at kickoff, including relevant dirty/untracked work |
| Approved UX/cost trade-offs | None |
| Last accepted result | Research and this brief only |
| Validation against current code | None |
| Open questions | Actual subtraction, demand liveness, first-jump/revisit cost and current editing joins |
| Next action | Read-only C0 and an operator decision on one bounded prototype |

The coordinator is the current chat role, not a persistent process. Update this
block at approval, handoff and acceptance. Use [worklog-current.md](worklog-current.md)
for short temporary notes. Durable contracts belong in their owning guides and
code-change history in [changelog.md](changelog.md); do not create a new research
or planning-history ledger just to coordinate sessions.

## Evidence and Limits

The [earlier consolidation design](zz%20Archive/scroll-and-position-preservation-consolidation-spec.md#phase-3b-target-protocol-design-result)
was rejected before production work because its proposed signalling layer would
coexist with too much old machinery. That rejects that design, not simplification
in general. Later work implemented owned continuity, history, density and reset
changes. Do not propose merely introducing an owned handoff as though none exists.

The [closed cleanup campaign](zz%20Archive/not-yet-another-audit-ledger.md)
records real repairs and unresolved limits. Its Home-guard removal controls show
those guards needed by the arrangement tested, not that the arrangement cannot
be replaced. Preserve the behavioural witnesses while questioning implementation.

Its [small-result assessment](zz%20Archive/not-yet-another-audit-ledger.md#stage-1-small-result-tier-assessment-6-october-2026)
recommended a reversible demand-loading prototype, but that prototype was not
selected. It was parked, not proved impossible. The November source still has
the main fill/top-up drivers and a small-extent placement retry. Some state named
in the old deletion inventory has already disappeared. Recalculate the current
scope; do not quote old line estimates as a present removal guarantee.

The [performance findings](scroll-horizons-thumbs-and-blocking.md) distinguish
useful progress, ready images, frame smoothness and position stability. Preserve
those distinctions. Neither fewer requests nor a simpler coordinate predicate
alone proves a better experience. Do not rerun old investigations merely because
the current executor did not perform them.

## Scope

### Candidate Scope

- Ordinary searches whose admitted total lies in the current small-result range.
  At the writing baseline this is up to 1,000, with 200-image pages; verify current
  configuration and overrides before execution.
- Separate global-coordinate eligibility from background position-map eligibility.
- Remove small-result eager remainder/top-up work, its unique state and its
  fill-growth placement retry if the replacement actually makes them unnecessary.
- Adapt existing demand, failure and wake-up handling under existing owners.
- Update affected tests and documentation while retaining meaningful user contracts.

This concerns the **total result set**, not the first loaded 1,000 images of a
million-result query. Keep intermediate-map and large-seek strategies unchanged.
AI's finite, fully returned membership remains a separate valid input, not an
excuse to run ordinary paging against AI results.

### Out of Scope Unless Separately Approved

- A new universal coordinator, state library, epoch hierarchy, entity cache,
  visited-window cache, prefetch scheduler or second scrolling engine.
- New backend endpoints, larger server limits, PIT adoption or index-migration work.
- Changes to image delivery, loading priority, eager thumbnail bands, page size,
  buffer capacity or the independent map range to make the candidate look better.
- Redesigning focus/selection policy, honest-edge rules, Home, history or detail.
- Justified packing/retention replacement, broad renderer cleanup or a bug backlog sweep.
- Live mutations, unapproved shared-service traffic, dependencies or writes outside Kupua.

The operator accepts ambitious, reversible local work because the product has no
users. A complete replacement can span several files and sessions. Do not use
that fact to justify changing shared live systems or hiding an expensive trade-off.

## Reading Route

Read [AGENTS](../../AGENTS.md), current instructions, this brief's selected unit
and the worklog first. Read source producers, acceptance and consumers together.

| Question | Current Entry Points |
| --- | --- |
| Current behaviour and distinct lifetimes | [state guide](00%20Architecture%20and%20philosophy/state-management.md), [focus/position guide](00%20Architecture%20and%20philosophy/02-focus-and-position-preservation.md), [scroll guide](00%20Architecture%20and%20philosophy/03-scroll-architecture.md) |
| Eager completion and its callers | [search store](../../src/stores/search-store.ts): `_fillBufferForScrollMode`, `_topUpScrollModeBuffer`, ordinary search, focus/restore/fallback and seek takeover |
| Coordinate choice and demand | [tier predicate](../../src/lib/two-tier.ts), [data window](../../src/hooks/useDataWindow.ts), [scroll effects](../../src/hooks/useScrollEffects.ts), [tuning](../../src/constants/tuning.ts) |
| Existing continuity | [continuity](../../src/lib/search-continuity.ts), [URL/history sync](../../src/hooks/useUrlSearchSync.ts), [Home](../../src/lib/reset-to-home.ts) |
| Scrubber, traversal and geometry | [Scrubber](../../src/components/Scrubber.tsx), [traversal](../../src/hooks/useImageTraversal.ts), [geometry interface](../../src/lib/scroll-geometry-ref.ts), [windowed Justified](../../src/lib/windowed-justified-layout.ts) |
| Legal API reads | [API datasource](../../src/dal/api-data-source.ts), [request mapper](../../src/dal/grid-api-search-adapter.ts) |
| Current editing joins | [publication plan](gradually-growing-teeth.step-4-publication-plan.md), [publisher](../../src/lib/image-publication.ts), [freshness](../../src/lib/image-read-freshness.ts), [current API contract](../../src/dal/grid-api/README.md) |
| Existing proof | [search-store tests](../../src/stores/search-store.test.ts), [API store tests](../../src/stores/search-store-api-mode.test.ts), [data-window tests](../../src/hooks/useDataWindow.test.ts), [scroll-effects tests](../../src/hooks/useScrollEffects.test.ts), [scrubber journeys](../../e2e/local/scrubber.spec.ts), [forced-seek journeys](../../e2e/local/forced-seek.spec.ts) |
| Measurement and browser operation | [campaign guide](../../e2e-perf/README.md), [measurement contracts](../../e2e-perf/measurement-reference.md), [browser playbook](embedded-browser-playbook.md) |

Old source links and test names are discovery anchors, not proof that a scenario
still reproduces. Do not reread the entire archived ledger on every restart.

## Design Requirements

### Preserve These Distinctions

- Focus, selection and viewport anchor are different; matching IDs do not merge
  their policy or lifetime.
- Display position, response scan frontier and exact current rank are different,
  especially after editing. Ordinary browsing must not pay a global rank-repair tax.
- Data arrival, accepted publication and before-paint placement are different.
- A useful search/user destination may survive a density change that cancels an
  obsolete view-owned refill or placement.
- Coordinate space must not change merely because a position map arrives.
- A failed read is not an empty successful result or permission to use another source.
- A true result end is not a temporary buffer wall. Empty/partial/refused work
  must settle under the current contract without an endless retry loop.

These facts are constraints on a replacement, not a requirement to retain every
current boolean, counter or callback. Replace a complete family if that removes
more coordination than it introduces.

### Candidate Removal Accounting

Rebase this table against actual code before approval.

| Mechanism | Candidate End State |
| --- | --- |
| Initial eager remainder loop | Gone; the existing initial page and demanded extension own loading |
| Re-centred forward/backward top-up walk | Gone; no alternative walk whose goal is full residency |
| Top-up re-entry/deadline/step budgets | Gone where unique to that walk; shared cancellation stays |
| Calls requesting eager completion after success/fallback/restore | Gone; accepted publication can wake useful demand under its existing owner |
| Small-only extent-growth placement replay | Gone if a full logical extent removes its reason; ordinary clamp/retirement proof stays |
| Small buffer-local coordinate choice | Replaced by the selected stable global-coordinate policy |
| Position-map eligibility | Retained independently, without introducing small-result maps |
| Accepted-page publication, tuples, authority and shared extends | Retained, not claimed as newly removed complexity |

Bounded wake-up after a cooldown/publication may need a small adaptation. It must
belong to an existing view/window lifetime. A third scheduler or renamed eager
completion loop defeats the premise.

## Work Units

### C0: Rebase and Select One Consequential Replacement

Confirm the editing baseline and predecessor choices. Check the current eager
drivers, their callers, map triggers, placement retry and relevant test fixtures.
Do not resume a historical experiment prompt as though it were authorized.

Update the removal table with actual source and consumer references. Identify
required additions, not only potential deletions. Include the recently completed
editing cases: unavailable slots, full-fit deletion, stale ordering and current
authority must not be accidentally weakened by new small-result loading.

Recommend this candidate or one better bounded replacement. A larger coherent
family-local design is allowed when it can retire old producers, state and
consumers together. A generic new operation envelope that leaves them all active
is not enough. Do not prescribe seven stores or a framework from the April plan.

Explain the proposed experiment to the operator using the 800-result example:
what appears initially, what an early far jump does, and what happens when they
return to a recently visited region. Obtain approval for the local prototype,
not advance approval that its loading trade-off is acceptable for adoption.

### C1: Build a Coherent Reversible Prototype

Implement the whole selected small-result policy consistently: coordinate choice,
eager dispatch removal, completion-call removal, independent map eligibility and
necessary existing-owner demand wake-up. Do not prototype only a changed threshold
while old completion drivers still run and then interpret the result as the design.

Use current local fixtures and the real client engine. No new backend or live
data is needed to learn whether the ownership change is viable. Temporary A/B
selection is permitted when it enables a bounded comparison, but has a named
removal point and is not a permanent product mode.

Preserve legal offset/page bounds. After Brief 1, direct-ES-only limits no longer
define the application contract; retained fixture overrides still need honest
coverage. Do not change server limits or resurrect a small-result map to avoid
handling legal reads.

After the first substantive edit, run the cheapest discriminating check. Repair
a local defect and rerun that check before widening. Implementation difficulty
alone is not a reason to retreat to cosmetic extraction.

### C2: Prove Liveness, Continuity and Editing Joins

Use representative existing cases for genuinely different paths. The old 212-
result origin and centred roughly-1,000-result schedules are useful starting
points, not immutable fixture requirements or a Cartesian test matrix.

| Case | What Must Be Demonstrated |
| --- | --- |
| First page, then still-visible missing demand | Useful demand wakes after publication/cooldown without another user scroll |
| Off-window jump and repeated 0/middle/end jumps | Correct destination, bounded work, honest loading, no stranded blanks |
| Centred focus/history/detail restoration | Target and intended placement survive without a whole-set top-up |
| Delayed, empty or failed page | Usable existing data and appropriate failure state; no stale busy cleanup or unbounded retry |
| Newer query/Home/focus/density while work is held | Old work cannot regain publication/placement authority; useful destination is not indiscriminately cancelled |
| True edges and short physical extent | Honest clamp/padding and full visibility where geometry permits |
| Content/capability publication and deletion | Current editing contracts survive; no hidden rank repair or wrong full-fit compaction |
| Finite AI and naturally resident results | No ordinary paging added; useful resident reuse remains |
| Larger indexed and million-scale seek controls | Existing strategies and bounds remain unchanged |

Retire tests whose only purpose was full-set completion, top-up step counting or
obsolete fill-growth replay. Rewrite waits for the usable view, not a deleted
implementation state. Preserve the independent assertions about cancellation,
position, identity, authority and accepted pages. A smaller suite is welcome;
deleting the only witness of a guarantee is not.

### C3: Show the Operator the Trade-off

Use the browser playbook and an explicitly isolated local fixture for the first
rehearsal. Show first-page browsing, an early far jump, a return to a prior window,
and one centred restoration. The operator should be able to see the difference
without reading code or choosing between internal counters.

Compare equivalent action points. Waiting for the old eager loader to finish
before starting every observation can hide startup work; comparing a fully warm
old set with a cold candidate can exaggerate interaction differences. State which
question each comparison answers. Keep media readiness separate from metadata.

Report read counts, abandoned/repeated work and relevant readiness/placement
outcomes with their limits. Reuse existing observation helpers. Do not launch a
new broad performance campaign to compensate for an unclear local comparison.
Any live-system or habitual campaign comparison needs its separate permission
and operator-run procedure.

Ask one concrete adoption question if the behaviour/cost trade-off is material.
The prototype is not accepted merely because its tests pass, and a temporary
loading difference is not automatically a forbidden product regression if that
is the very trade-off the operator agreed to evaluate.

### C4: Adopt and Remove the Old Path, or Reject Cleanly

On acceptance, remove the old completion drivers, unique state/callers and
temporary A/B plumbing. Update the affected tests and owning guides. Prove the
adopted source, not just a fixture-only intervention or disabled old path.

On rejection, remove only the unit-owned prototype changes, preserving unrelated
editing work and any separately accepted repair. Record the reason and relevant
evidence in the owning decision. Do not keep abandoned framework scaffolding or
create another planning-history document.

This completes one meaningful simplification, not certification that the whole
browsing engine is simple. Another replacement requires a new selected outcome;
do not keep working through every old ledger item.

## Proof and Acceptance

### Structural Acceptance

- The selected special case or coordination mechanism is actually retired.
- The old completion drivers do not survive behind wrappers, callbacks or a new
  scheduler. Required replacement work is included in the accounting.
- Existing request, publication and placement owners remain understandable;
  another authority has not been added on top.
- Temporary dual-path code and obsolete implementation tests are removed.
- The operator can receive a short accurate explanation of what the engine no
  longer has to do, without a claim that every difficult behaviour disappeared.

### Behavioural and Performance Acceptance

Parity contracts are proved on the baseline and candidate. Loading-policy changes
are separately approved and demonstrated. Actual bugs need failing-first witnesses;
a structural refactor does not require inventing a bug to justify itself.

Preserve the agreed image/viewport continuity and distinct current authorities.
No fresh-result flashes at intermediate positions, permanent skeletons, stale
placement, unexpected read chains, lost selection or widened permissions are
acceptable simplification techniques. Keep ordinary accepted approximation;
do not introduce universal exact rank, snapshot or all-frame guarantees.

Follow current full unit/E2E/build gates and relevant TypeScript checks. From
repository root, use the documented live-output/exit-status handling:

```sh
set -o pipefail; npm --prefix kupua test 2>&1 | tee "$TMPDIR/kupua-test-output.txt"
set -o pipefail; npm --prefix kupua run test:e2e 2>&1 | tee "$TMPDIR/kupua-test-output.txt"
set -o pipefail; npm --prefix kupua run build 2>&1 | tee "$TMPDIR/kupua-test-output.txt"
```

These are separate invocations. Coordinate app/test ports and running sessions.
Do not restart shared servers, interrupt tests or infer complete validation from
a partial terminal result. Scope fixture and compiler checks to their actual files.

Frame/layout changes require suggesting the relevant existing operator-run jank
comparison; search/store/continuity changes also trigger the perceived-performance
consideration in current instructions. Agents do not run campaigns or dry runs.
The existing million-scale campaign alone may not answer this small-result policy
question: name the missing question before adding a narrow control, and keep its
cost proportionate. A new session is not a reason to repeat a baseline campaign.

Removing eager reads can save work but add later requests or latency. It is not
a proved net speedup. The broad default million-result search does not currently
run these small-result completion loops, so this candidate cannot claim to speed
up that startup. Preserve performance and shared-service safeguards; any material
trade-off goes to the operator rather than being hidden in an average.

## VS Code Chat Procedure

This procedure is for one operator chatting with replaceable agents. A coordinator
is an ordinary chat role with fallible context. Durable current state and filled
handoffs, not assumed memory, keep the work coherent.

### Roles and Approval

The operator selects one candidate/unit, approves product/cost trade-offs, runs
campaigns and accepts or rejects the result. The coordinator maintains scope and
prepares the next message; it may also execute. The executor owns the code and
validation. An independent reviewer checks the actual patch read-only.

1. Start with the kickoff prompt and current fresh-agent instructions.
2. The agent reads Execution State, worklog and necessary current code, then
   reports its recommended unit and concrete decision, not a general audit plan.
3. The operator confirms one bounded prototype or implementation unit. A local
   prototype approval does not approve its eventual UX trade-off or live access.
4. The active writer updates current state and works iteratively. Several files
   or sessions are acceptable when one mechanism must change coherently.
5. At the unit boundary, report actual subtraction, behaviour, costs and proof;
   provide a filled review/continuation prompt for the operator to paste.

Only one session edits shared product owners and fixtures at a time. A chat or
subagent is not an isolated worktree. Resolve ownership conflicts explicitly.

After the agent explains C0's proposed experiment, a suitable operator reply is:

```text
Proceed with the local prototype you described. Its loading trade-off is not
yet accepted for adoption. Show me the comparison before replacing the old
policy permanently. No live systems, dependencies or Git mutations are approved.
```

For a session transfer:

```text
Pause and update the current state. Give me a filled handoff for a new chat;
do not expand the experiment or start the next unit.
```

### Handoffs and Forgetful Coordinators

The outgoing agent writes the current selected candidate, approved trade-offs,
baseline/diff scope, last accepted result, validation and next action into the
brief/worklog before context is exhausted. Keep the brief concise; do not append
every attempted selector, test run or conversation.

It then supplies a fully filled handoff in chat. The operator should not have to
assemble technical context. A replacement coordinator follows the same recovery
procedure as an executor: inspect the real worktree, compare with current state,
and ask only for missing authority or a genuinely divergent choice.

Do not restart the whole literature review, rerun an active command, reapply a
patch or assume an old green test result covers new code. Preserve unfinished-task
worklog notes across handoff. On accepted completion, keep durable mechanics and
code history in the proper owners, then reset the worklog according to repository
rules. Never erase another active session's notes.

### Review and Delegation

Give a reviewer the approved candidate, actual baseline/diff/new files, validation
and known limits. Ask whether the replacement really deletes the old mechanism,
whether delayed work still has a coherent owner, and whether tests hide a loading
or placement regression. Findings return in chat; the active executor repairs them.

Subagents may perform bounded research or independent review when the assignment
and standing instructions permit it. Supply a precise question and source scope,
required evidence and stop conditions. Honour the current reviewer-model preference.
Do not parallelize edits to search, data-window, scroll-effects or their fixtures.
Do not let delegates write shared progress documents or run live/campaign work
without explicit authority. Reconcile their findings; their context is not durable.

### Risk and Rollback

No users means a worthwhile replacement need not be reduced to harmless file
moves. Agree a recoverable baseline and show a working prototype early enough
to reject a bad premise. Do not require a design to prove every future case on
paper before any local experiment is allowed.

Commits, branches and worktrees still require permission. If a checkpoint is not
committed, agree which existing changes are outside the unit before experimenting.
Rollback removes only the unit's work; never reset the whole tree or discard a
different session's edits. No failure of a local prototype authorizes changes to
real ES, live images, server limits or safeguard configuration.

Repair a local defect and rerun its focused check. Ask rather than invent intent
when the next approach changes the chosen behaviour, scope or cost. A rejected
candidate is a result, not a reason to implement more machinery to rescue it.

## Copy-Paste Prompts

### Coordinator Kickoff

```text
Read current applicable instructions, kupua/AGENTS.md, the existing worklog, and
kupua/exploration/docs/simplification-03-browsing-engine.md.

Start read-only and follow the fresh-agent confirmation protocol. Confirm that
the editing baseline is ready and which preceding simplifications were adopted.
Rebase C0. The first candidate is removing ordinary small-result eager
completion using existing global-coordinate demand loading, not a new engine.
Recommend one better bounded alternative only if current code supports it.

Show actual old mechanisms removed, necessary replacements, existing proof and
the user-visible loading/cost trade-off. Do not revive old execution prompts,
freeze the current implementation merely because its guards are needed today,
or call another wrapper simplification. Ask me to approve one local prototype.
Read-only subagents may do bounded tracing or independent review; do not create
parallel writers for the engine or shared fixtures.
No product edits, live access, campaigns, dependencies, infrastructure changes
or Git mutations are authorized by this kickoff alone.
```

### Executor Handoff

The coordinator fills every field before giving this message to the operator.

```text
Execute only [approved C unit/title] from
kupua/exploration/docs/simplification-03-browsing-engine.md.
Read current instructions, AGENTS, the worklog and Execution State. Reconcile
this handoff with the real worktree and confirm scope before editing.

Selected candidate and outcome: [specific mechanism retired/replaced]
Operator approval: [prototype/adoption scope, permitted tests, exclusions]
Baseline/predecessors: [revision, relevant dirty work, accepted prior briefs]
Owned paths/current patch: [actual files and state]
Deletion and replacement accounting: [mechanisms, not just line targets]
Approved versus undecided trade-offs: [concrete user behaviour/cost]
Required surviving contracts: [specific workflows and authorities]
Existing tests to retain/change/retire: [paths and guarantees]
Validation and observations: [commands/results/code state; no invented timings]
Unverified questions: [explicit]
Next action: [one precise action]
Stop/ask when: [intent, scope, cost or safety boundary]

Do not add a completion driver under a new name, a general coordinator/cache,
live work or a campaign. Read-only tracing/review subagents are allowed within
the unit; the active executor remains the sole writer. Keep any temporary A/B
path bounded and remove it on adoption or rejection. At handoff update current
state and supply a completely filled continuation or review prompt for the
next chat.
```

### Independent Review

```text
Review [approved C unit/candidate] from simplification-03-browsing-engine.md
read-only. Follow current instructions and read AGENTS/worklog. The coordinator
supplies [baseline, actual diff/new files, validation and known limitations].

Check actual subtraction, demand wake-up, stale completion, coordinate/map
separation, centred restoration, short physical extents, finite AI and current
editing joins. Distinguish an approved loading-policy experiment from an
unapproved loss of identity, position, permissions or usable data.

Are old and new schedulers still coexisting? Have tests merely replaced useful
guarantees with weaker waits? Is a claimed speedup supported by the right
measurement? Does the design introduce comparable ownership complexity?

Return severity-ordered findings with references, missing proof and an
accept/repair/reject judgement. Do not edit, run tests/campaigns, access live
systems, change shared planning state or broaden this into a whole-engine audit.
```

### Recover a Lost Session

```text
Recover the current work described in
kupua/exploration/docs/simplification-03-browsing-engine.md.
Read current instructions, AGENTS, Execution State and worklog-current.md, then
inspect the actual worktree read-only. Historical L19 is evidence, not approval.

Identify the selected candidate, whether we are prototyping or adopting, the
last accepted result, any surviving A/B bridge, matching validation and the
smallest next step. Do not confuse a session ending with a unit being complete.
Ask one concrete question if approval, ownership or the intended trade-off is
missing. Do not reset files, interrupt/rerun an active test, repeat the general
audit or edit before the current unit is confirmed.
```

### Operator-Friendly Closeout

Explain what the user can now do, what may wait or reread, what code mechanisms
disappeared, and what was actually validated. Separate structural benefit,
behaviour repair and measured performance. State whether adoption is recommended
and why. Give one filled handoff, not several documents for the operator to assemble.

## Finish or Stop

Accept one complete replacement when its agreed subtraction is real, the operator
accepts any material loading trade-off, and the required behavioural/performance
evidence supports adoption. Stop doing adjacent cleanup once that result is reached.

Reject or redesign if correct demand requires another whole-result completion
driver, a second ownership system or a general cache whose costs erase the gain.
Stop for operator decisions on new UX guarantees, material service/render cost,
server changes or permissions outside the approved boundary. A failed candidate
does not establish that the entire browsing engine is irreducible; a successful
small candidate does not establish that the entire house has been cleaned.
