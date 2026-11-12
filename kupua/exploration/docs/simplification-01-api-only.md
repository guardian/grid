# Simplification 1: Retire Direct Elasticsearch Support

Prepared 11 November 2026. **Status: parked until the operator selects this work
after the current editing milestone.** This document authorizes no implementation,
test execution, live access, infrastructure change or Git mutation by itself.

This is the first of three related briefs: API-only retirement, image data and
publication, and browsing-engine simplification. They are projects with finished
outcomes, not permission for general cleanup. The operator is one person working
through VS Code chat sessions, not a permanent engineering team.

## Start Here

| Brief | Intended Result | Starting Point |
| --- | --- | --- |
| This brief | Retire the second application data path and its unique obligations | A0 after the chosen editing checkpoint |
| [Image data and publication](simplification-02-image-publication.md) | Remove redundant representations and publication coordination | B0, preferably after API-only retirement |
| [Browsing engine](simplification-03-browsing-engine.md) | Retire a complete special case or coordination mechanism | C0; small-result demand loading is a candidate, not pre-approved policy |

Each brief contains its own chat procedure and prompts so a new session can start
from that file. Begin with this brief's Coordinator Kickoff; the agent prepares
the next filled handoff. The operator does not need to assemble a technical packet.

The editing prerequisite means an operator-chosen stable checkpoint, not finishing
every possible editing feature. Recheck current code at that checkpoint. Do not
start all three projects or detailed implementation plans simultaneously.

## Outcome

Kupua has one supported application data path: media-api. Maintaining a feature
no longer requires maintaining, configuring or testing a second direct-ES
implementation of that feature.

API mode already constructs no ES datasource and has no ES fallback. Merely
proving that again, changing a default flag, or hiding the old mode is not this
project's outcome. Retire the obsolete implementation and its unique obligations.

Preserve the working experience: arbitrary-position browsing among millions,
image-based continuity, density changes, detail/traversal, history, selections,
search and the editing capabilities actually present when execution begins.
Removing direct ES does not mean removing Elasticsearch from Grid's backend.

### Why This Is Worth Doing

The direct adapter duplicates query construction, filters, aggregations, AI
transport and snapshot operations that the API-backed application no longer
needs to perform directly. Supporting both modes also affects startup, controls,
fixtures and instructions. Removing a requirement creates genuine subtraction.

This is a maintainability project, not a promised speedup. It may remove payload,
initialisation or bookkeeping work, but report a speed gain only when measured.
Preserved performance is sufficient when the structural improvement is real.

## Execution State

Keep this block short and current. Do not turn it into a chronological worklog.

| Field | Current Value |
| --- | --- |
| Status | Parked; not authorized |
| Editing prerequisite | Operator has not yet declared the preceding editing milestone ready |
| Selected unit | None |
| Active writer | None |
| Accepted code baseline | Establish at kickoff; November source references below are orientation only |
| Approved scope and exceptions | None |
| Last accepted result | Research and this brief only; no retirement implemented |
| Validation against current code | None |
| Open decisions or blockers | Test topology and exact removal inventory must be selected at kickoff |
| Next action | Read-only kickoff, then operator confirmation of one bounded unit |

The active writer updates this block when a unit is approved, handed over or
accepted. Temporary details belong in [the existing worklog](worklog-current.md).
Durable behaviour belongs in its owning guide; code-change history belongs in
[the changelog](changelog.md). Do not add planning-only entries there.

## Evidence and Limits

The [April realistic plan](03%20Ce%20n'est%20pas%20une%20pipe%20dream/kupua-05-realistic-work-plan.md)
deliberately limited work to tests and moves, leaving the store largely intact.
That is evidence about the scope of that attempt, not proof that structural
change is impossible. Do not revive its frozen-store rule or speculative
seven-store architecture as instructions for this project.

The [API build plan](03%20Ce%20n'est%20pas%20une%20pipe%20dream/api-build/api-build-00-plan.md)
records the implemented API path, bounded endpoints and deliberate client-owned
sort-clause transport. Its migration-time instruction not to rewrite the store
protected that migration; a newly approved retirement may change client plumbing
where necessary. It does not authorize changing server contracts or product rules.

At the November reading, API code still imports helpers from the direct adapter;
sort clauses are built in the client; and `_pitGeneration` also guards general
search replacement. These are reasons to trace callers, not to preserve every
ES-named file or delete every ES-named field.

The ordinary browser fixture blocks `/api/**` by default, while API-backed store,
browser and shared client/server contract coverage already exists. Reuse that
evidence. Do not announce that the API path has no tests or build an entirely new
testing framework without first checking the existing fixtures.

## Scope

### In Scope

- Application datasource construction and the direct-ES implementation.
- Direct-only query compilation, AI/Bedrock client transport, configuration and
  startup choices, once actual consumers establish that they are direct-only.
- Mode-dependent branches whose only purpose is supporting direct ES.
- Client PIT operations that become unnecessary, with generic lifetime protection
  retained or expressed through an existing appropriate owner.
- Tests, local fixture wiring, scripts and documentation that support the retired
  mode. Preserve useful assertions while removing obsolete mode-specific machinery.
- Neutral placement of genuinely shared helpers when that removes an API-to-ES-
  adapter dependency. This is not a directory-reorganisation exercise.

### Out of Scope Unless Separately Approved

- New media-api endpoints, changed wire formats or moving sort/seek policy to Scala.
- Changes to Kahuna, shared backend behaviour, index migration or server PIT support.
- Removing S3/imgproxy delivery merely because direct-ES data access is removed.
  Data mode and media delivery are separate choices.
- A new entity cache, image-model redesign, tier removal, navigation rewrite,
  dependency upgrade, UI redesign or unrelated bug sweep.
- Live mutations, load tests, service/tunnel lifecycle changes or secret handling.
- Any write outside `kupua/`. In particular, changing the automatically loaded
  directive copy outside this directory requires explicit operator permission.

The prototype has no users, so a coherent reversible client change is acceptable.
Do not inflate this into a production migration programme. Shared Guardian
services and live images still have real users: that risk is not waived.

## Reading Route

Follow [AGENTS](../../AGENTS.md) and current standing instructions first. Then
read the selected unit, not the whole historical literature again.

| Responsibility | Current Entry Points |
| --- | --- |
| Construction and transport | [DAL factory](../../src/dal/index.ts), [API datasource](../../src/dal/api-data-source.ts), [direct adapter](../../src/dal/es-adapter.ts), [DAL types](../../src/dal/types.ts) |
| API mapping and shared sort helpers | [request mapper](../../src/dal/grid-api-search-adapter.ts), [sort builders](../../src/dal/adapters/elasticsearch/sort-builders.ts), [query editing](../../src/dal/adapters/elasticsearch/cql-query-edit.ts) |
| Search and lifetime consumers | [search store](../../src/stores/search-store.ts), [selection store](../../src/stores/selection-store.ts), [startup](../../src/main.tsx) |
| Configuration and launch | [Vite configuration](../../vite.config.ts), [startup script](../../scripts/start.sh), [package scripts](../../package.json) |
| Existing API proof | [API datasource tests](../../src/dal/api-data-source.test.ts), [API store tests](../../src/stores/search-store-api-mode.test.ts), [recorded request contracts](../../src/dal/ordered-read-bodies.test.ts) |
| Browser topology | [Playwright configuration](../../playwright.config.ts), [shared browser fixture](../../e2e/shared/helpers.ts), [E2E guide](../../e2e/README.md) |
| Editing and service boundaries | [API contract](../../src/dal/grid-api/README.md), [editing plan](gradually-growing-teeth.kupua-edits-steps.md) |
| Existing performance evidence | [campaign guide](../../e2e-perf/README.md), [measurement contracts](../../e2e-perf/measurement-reference.md), [findings](scroll-horizons-thumbs-and-blocking.md) |

Do not read or print authentication storage, cookies, private keys or environment
secrets to establish the design. Record configuration roles, not secret values.

## Work Units

Units are coherent outcomes, not mandatory one-chat-sized tasks. A unit may span
sessions. Do not split an ownership change halfway merely to fit a chat window.

### A0: Rebase the Brief and Agree the Removal Boundary

After the editing milestone, inspect current code, Git status and the relevant
tests. Do not assume the earlier research describes the final editing design.

Produce a compact removal/retention table inside this brief, with actual paths,
current consumers and one of these dispositions:

| Disposition | Required Meaning |
| --- | --- |
| Delete | No supported API, fixture or independently retained workflow needs it |
| Retain shared | Name the actual consumer and responsibility, not hypothetical future use |
| Replace | Name both the old mechanism removed and its replacement |
| Decision needed | Describe the operator-visible consequence, cost or scope change |

Trace construction beyond the main search store: selection, collections,
suggestions, AI, startup and editing admission must use the selected boundary.
Do not remove an authorization or editing-capability check with a mode check.

Select the browser-test topology. Prefer existing API fixtures exercising the
real client adapter, together with the existing server contract/integration
proof where appropriate. Do not require every browser test to boot the whole
Grid stack, but do not substitute a new fake datasource for the API adapter and
claim that this verifies API-only application wiring.

If useful browser coverage cannot migrate without new infrastructure or writes
outside Kupua, explain that specific blocker and ask. Do not quietly invent a
parallel service emulator. This kickoff ends with one recommended next unit,
its expected deletions and an operator confirmation, not another general audit.

### A1: Make Existing Journey Coverage Exercise the Future Path

Adapt the existing fixture/setup so the selected ordinary journeys actually use
`ApiDataSource`. Remove the unconditional API block where it contradicts that
topology. Keep live-service exclusion in isolated fixtures.

Reuse search, deep seek, reverse/eviction, density, detail/history, selection and
editing witnesses. Select representative existing cases; do not clone the full
suite once per transport or add one new test for every method.

Show the real mapper/request boundary exercised, not just a label saying API
mode. A failed API read must remain a failure of that path, never trigger ES or
Bedrock rescue. Keep empty-result and failed-request behaviour distinct.

This unit can precede production retirement while both modes still exist. Its
purpose is usable proof for deletion, not a permanent second test programme.

### A2: Retire Direct-Only Application Code

Remove the factory choice, direct transport and their now-unused producers and
branches according to A0. Change local startup defaults and controls coherently;
do not leave a nominally selectable mode that crashes when chosen.

Move genuinely shared helpers out of the retired adapter only where needed.
Query-chip editing and client sort semantics still serve the API application.
Their directory name is not evidence that their behaviour is obsolete.

Keep the public media-api contract unchanged. No new background reads, alternate
data sources, broader fetches or silent API failure conversions are justified.
Preserve synthetic/resident fixtures that still have a real test/research role;
they are not a reason to retain a supported direct-ES product mode.

After the first substantive edit, run the cheapest relevant executable check.
Do not build the whole replacement before discovering a local contract mismatch.

### A3: Remove Obsolete Lifetime and Compatibility Plumbing

Review client `openPit`/`closePit`, null-only arguments/results and expiry handling
against the now-single transport. Delete truly obsolete operations rather than
retaining no-op APIs for a hypothetical future implementation.

Some generations also protect search replacement, top-up or placement. Preserve
that protection, preferably through an existing search owner where equivalent.
Do not delete a guard because its name contains PIT, or create a new epoch system
merely to remove that name. A coupled change must cover its producers and consumers.

Do not remove server PIT support or alter index routing. Any retained client
compatibility must have a named current consumer; an unresolved remainder is
reported explicitly, not called completed retirement.

### A4: Close the Supported Surface

Remove direct-only test variants, obsolete mocks, launch options and misleading
setup instructions. Keep the only witness of a supported behaviour, translating
it to the API path where necessary. Source comments describing a removed mode
must not continue teaching future agents the old architecture.

Check preview/build, supported laptop startup and hosted startup contracts using
the appropriate existing fixtures. A hosted build may write outside `kupua/`;
do not run that command without the required permission.

Finish by comparing the patch with A0's table. Account for every intended removal
and every deliberate remainder. Do not opportunistically begin Brief 2.

## Proof and Acceptance

### Structural Acceptance

- The application no longer supports constructing or selecting direct ES.
- Its unique transport, producers and mode-specific support are actually gone,
  not disabled behind a flag or hidden behind another facade.
- API consumers no longer depend on the retired adapter to obtain shared helpers.
- Ordinary journey coverage runs through the API client, with its scope and
  server-side proof boundaries stated honestly.
- A future ordinary feature change does not require maintaining two transports.

### Behaviour and Cost Acceptance

Preserve useful query/sort behaviour, approximate deep landing, cursor ordering,
image/tuple alignment, bounds, before-paint placement, history, selections,
server authority and the completed editing contracts. Approximate display
positions must not become a new universal exact-rank requirement.

Use failing-first proof for an actual bug. For a parity refactor, establish the
relevant behaviour on the retained baseline; do not invent a failure or freeze
obsolete private fields merely to have a red test.

Follow current repository gates, including full unit tests after `src/` changes
and full E2E after component/hook/store/scroll changes. Use the build and applicable
E2E/perf typechecks when their surfaces change. Commands run from the repository
root, with the required foreground/live-output handling, for example:

```sh
set -o pipefail; npm --prefix kupua test 2>&1 | tee "$TMPDIR/kupua-test-output.txt"
set -o pipefail; npm --prefix kupua run test:e2e 2>&1 | tee "$TMPDIR/kupua-test-output.txt"
set -o pipefail; npm --prefix kupua run build 2>&1 | tee "$TMPDIR/kupua-test-output.txt"
```

These are separate invocations, not instructions to run everything concurrently.
Read current scripts/configuration and coordinate occupied app/test ports. Never
stop another session's server or interrupt its test run.

Performance campaigns and dry runs remain operator-run. Suggest the relevant
existing comparison when changed timing/render paths require it; do not create
a baseline campaign just because a new agent session started. Compare compatible
API environments and contracts, not old direct-ES timings as a claimed speedup.
Disclose any unmeasured performance obligation before acceptance.

## VS Code Chat Procedure

This procedure assumes no persistent agent, background coordinator or hidden
cross-session memory. Documents and the operator's pasted messages are the handoff.
Current repository instructions take precedence over examples in this brief.

### Roles and Permissions

| Role | Responsibility |
| --- | --- |
| Operator | Chooses the next unit, approves meaningful UX/cost/scope changes, runs campaigns and decides acceptance or rollback |
| Coordinator | Maintains the current unit and evidence in this brief, prepares filled handoffs and reconciles review; it is just one chat session |
| Executor | Implements the approved unit, validates it and reports actual subtraction and remaining risks |
| Reviewer | Independently checks the patch, preserved contracts, proof and claimed structural gain; does not expand the patch into a new audit |

The coordinator and executor may be the same session. Do not invent a separate
coordinator solely for ceremony. Prefer a separate review context for a substantial
replacement. Only one session owns product edits at a time in these shared files.

### Starting and Approving a Unit

1. Paste the kickoff prompt below into a fresh chat. The agent follows the fresh-
   agent protocol, reads current state and gives a short proposed scope.
2. The operator confirms the named unit and permissions. One confirmation can
   authorize its routine edits and local verification; do not ask per file.
3. The active writer updates Execution State and the existing worklog before
   substantive work. Do not overwrite another active session's notes.
4. Execute and validate iteratively. A local defect can be repaired within scope;
   an intent, cost or ownership change goes back to the operator in user terms.
5. End with a plain-language outcome, actual diff boundaries, validation and a
   ready-to-paste review or continuation message.

Useful operator replies, after the agent has named and explained the unit:

```text
Proceed with the unit you just summarized, within that scope. No live-system
work, new dependencies or Git mutations are approved.
```

```text
Pause here. Update the current state and give me a filled handoff for a new
chat. Do not start the next unit.
```

### Handoff and Context Loss

The outgoing agent fills the handoff completely. The operator should only need to
paste it, not discover file names, choose a technical boundary or reconstruct a
test history. A chat summary is not a substitute for the current document state.

Keep Execution State to the selected unit, approved scope, code baseline, last
accepted result, current proof and next action. The worklog holds temporary detail.
Preserve unfinished-task notes across a session handoff; on task completion reset
the worklog according to repository rules after retaining the durable outcome.

If a chat dies before handing off, use the recovery prompt. The new agent inspects
the actual worktree and reconciles it with the brief. It must not reapply a whole
patch, rerun an already-running test or infer success from an old green summary.
If ownership or the baseline is ambiguous, ask one concrete question before editing.

### Review and Repair

The reviewer gets the approved unit, actual changed files/diff, relevant new files,
validation summary and known limitations. Do not provide only the implementer's
interpretation. Manual review chats can read the shared workspace; subagents need
the same bounded task and access to the real patch.

Review findings return to the coordinator/operator in chat. The active executor
repairs justified findings and reruns their focused checks plus applicable gates.
Do not weaken an assertion or add retries just to make the review green. Unrelated
observations stay outside this unit unless separately selected.

### Subagents

Use them only when the current operator assignment and instructions permit it.
Suitable assignments are a read-only consumer trace or an independent patch review.
Give each a precise question, source scope, output shape and stop condition.
Respect the operator's current reviewer-model preference.

Do not have several agents rewrite the same store or shared fixtures concurrently.
A delegate must not change shared planning state, run live work or broaden its
permissions implicitly. If standing check-in/worklog rules conflict with the
proposed ownership, resolve that conflict rather than silently overriding them.
Integrate useful findings into the current brief; private subagent memory is not
durable coordination.

### Reversible Risk

The operator accepts ambitious, reversible prototype changes. A coherent replacement
is allowed to be larger than a cosmetic patch. Do not reject it solely because it
touches several files or takes more than one session.

Before a risky unit, establish a recoverable baseline: an operator-approved commit
or an agreed unit-owned patch/baseline accounting that preserves pre-existing work.
Do not create branches, commits or worktrees automatically. Never use a destructive
reset or discard unrelated changes. A failed experiment may be removed selectively;
keep the conclusion and useful behavioural proof, not abandoned scaffolding.

## Copy-Paste Prompts

These are chat messages, not automatically loaded instructions. They do not
override repository permissions or authorize all subsequent units.

### Coordinator Kickoff

```text
Read kupua/AGENTS.md, current applicable instructions, the existing worklog, and
kupua/exploration/docs/simplification-01-api-only.md.

We are considering this brief after the editing milestone. Start read-only.
Confirm with me that the editing baseline is ready before implementation.
Treat old plans as evidence, not active assignments. Inspect current code and
test topology only as needed to propose A0 and the next bounded implementation
unit. Do not restart a general audit.

Report the real removal opportunity, what must remain, the proposed proof and
any meaningful decision I must make. Explain decisions through a concrete user
workflow or resource consequence. Follow the fresh-agent confirmation protocol.
Read-only subagents may perform bounded consumer tracing or independent review;
give them explicit scope and do not create parallel product writers.
No live reads/writes, campaigns, infrastructure changes, dependencies or Git
mutations are authorized by this message. Do not modify product code yet.
```

### Executor Handoff

The coordinator fills every bracketed field before returning this message.

```text
You are the active executor for simplification-01-api-only.md, unit [ID/title].
Read current instructions, AGENTS, the existing worklog and this brief's
Execution State. First confirm that your understanding matches the current tree.

Operator-approved outcome: [one concrete outcome]
Approval/permissions: [exact scope; tests permitted; exclusions]
Observed baseline: [revision plus relevant dirty/untracked paths]
Owned paths and current changes: [paths and concise description]
Required deletions/replacements: [actual mechanisms]
Preserved contracts: [relevant behaviours and authorities]
Existing proof and tests to update: [specific paths/cases]
Validation already performed: [commands, outcomes, matching code state]
Not verified: [explicit gaps]
Next action: [one precise action]
Stop/ask when: [scope, intent, cost or safety boundary]

Do not touch unrelated work, start the next unit, run campaigns or use live
services without separate permission. Read-only tracing/review subagents are
permitted within the current unit; the active executor remains the sole writer.
At handoff update current document state and give me a fully filled continuation
or review prompt to paste into a chat.
```

### Independent Review

```text
Review the approved [unit] of
kupua/exploration/docs/simplification-01-api-only.md. Read current instructions,
AGENTS and the worklog. This is a read-only review, not implementation authority.

The coordinator supplies: [baseline, owned diff/new files, validation and gaps].
Check the actual patch, not only its summary. Does direct-ES responsibility
really disappear? Are shared helpers and generic lifetime guards preserved?
Do startup and browser tests exercise the intended API path? Can failures or
editing admission regress? Are tests proportionate and behaviour-based?

Return findings first, ordered by severity with code references, then missing
proof and an accept/repair judgement. Distinguish actual defects from preferences.
Do not edit, run tests/campaigns, access live systems or change planning files.
Do not demand an unrelated architecture or broader product guarantees.
```

### Recover a Lost Session

```text
The previous chat may have ended without a handoff. Read current instructions,
AGENTS, worklog-current.md and simplification-01-api-only.md's Execution State.
Inspect the real worktree read-only. Reconcile completed, partial and unverified
work; do not assume the last test result covers the current code.

Tell me the last accepted milestone, the current unit, whether another writer
or test run appears active, and the smallest next action. Ask only for missing
authority or a genuinely ambiguous decision. Do not restart the audit, reset
files, rerun an active command or edit until the current scope is confirmed.
```

### Operator-Friendly Closeout

Every unit ends with: what disappeared; what users still see; validation and its
limits; meaningful remaining risks; and the recommended next action. Attach one
filled handoff when another chat is needed. Do not ask the operator to interpret
internal counter names to decide whether the work succeeded.

## Finish or Stop

Accept when the agreed retirement is real, supported workflows and required
gates are preserved, and remaining shared mechanisms have explicit current jobs.
Do not keep tidying adjacent files after that point.

Stop for a decision if retirement requires a new backend contract, a material
performance/resource cost, a lost workflow, a second live data path, permission
outside Kupua, or comparable replacement infrastructure that defeats the goal.
Ordinary implementation difficulty is not itself evidence that simplification
is a bad idea. Report a failed premise honestly rather than preserve the old
system under new names and call the project complete.
