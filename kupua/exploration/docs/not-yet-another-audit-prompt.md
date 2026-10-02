# Position Preservation: Code-First Characterisation

Start a session with: *"Follow `kupua/exploration/docs/not-yet-another-audit-prompt.md`
to perform L7 characterisation."* Preparing this prompt does not execute it.
Follow the repository startup and task-confirmation protocol before starting.

## Purpose

Give a non-engineer operator a reliable basis for deciding how Kupua should behave,
and later engineers a basis for simplifying its core without accumulating more
special cases. Answer three separate questions:

1. What does the current implementation actually do, including across sequences
   of interactions and when work completes later?
2. Where do implementation paths disagree with each other, tiers produce different
   preservation outcomes, or written contracts and tests contradict code or each other?
3. Which choices must the operator settle before coherent fixes or consolidation?

This is characterisation, not implementation or an architecture competition.
Do not assume the code is a mess, every difference is wrong, or one universal
anchor rule, table-driven policy or coordinator is the right design. Necessary
complexity and intentional differences must remain visible.

The ultimate aim is a well-reasoned, simpler, clearer and less brittle machine,
with better performance where evidence supports it, not an endless series of
local bug patches. Bugs matter and must remain actionable. The operator's role
is to settle unclear user-visible behaviour, not choose internal mechanisms or
reapprove established requirements. Characterisation should leave later engineers
with the code model, reproducible bugs and explicit decisions needed to assess
coherent refactoring, including broader replacement if justified and authorized.
Do not promise a rewrite to 25% of the code, optimize for line count, or equate
fewer lines with less complexity or greater speed. Later proposals must identify
responsibilities and mechanisms removed, complexity added, preserved behaviour,
risks and measurement needs. This session does not design or execute that rewrite.

## Authority and Baseline

- Read applicable instructions, `kupua/AGENTS.md`, the worklog and the
  [ledger](not-yet-another-audit-ledger.md). Inspect read-only Git status/diff;
  record the revision and relevant local changes. Preserve other sessions' work.
- Establish the actual baseline; do not assume previous conversations' proposed
  fixes exist. Distinguish uncommitted behaviour from committed behaviour.
- Code establishes implementation, not product correctness. Tests establish only
  asserted behaviour under their setup. Comments and guides are claims.
- D8 is under reconsideration, not blanket on-screen-anchor policy. A history
  entry's own focus (including none) and viewport position are separate concerns:
  restoring position must not accidentally discard or replace its focus. Exact
  scrolling policy remains for the operator to decide case by case.
- Selection means tickbox/multi-image selection, not explicit focus. Preservation
  policy should not depend on scroll tier. Different coordinate/fetch mechanisms
  are legitimate; different user-visible preservation outcomes need examination.
- Archived "confirmed" decisions are evidence of prior intent, not permission to
  override current uncertainty. Keep incompatible claims visible until reconciled.

## Source Coverage

Read current code first to build an end-to-end model, not a symbol inventory.
You may read any repository source needed, including callers, helpers, tests,
routing, adapters and relevant library implementations. No additional permission
is needed for read-only source exploration. Do not audit unrelated subsystems
merely because their files are available.

The lead personally reads these implementations in full, including all five
views. Searches locate owners but do not replace full reads. If a file moved,
follow its current owner and record the substitution. Paths below are relative
to `kupua/src/`:

- `stores/search-store.ts`
- `hooks/useDataWindow.ts`, `hooks/useScrollEffects.ts`, `hooks/useUrlSearchSync.ts`
- `hooks/useReturnFromDetail.ts`, `hooks/useListNavigation.ts`, `hooks/useImageTraversal.ts`
- `lib/build-history-snapshot.ts`, `lib/history-snapshot.ts`, `lib/image-offset-cache.ts`
- `lib/grid-scroll-anchor.ts`, `lib/viewport-anchor-geometry.ts`, `lib/two-tier.ts`
- `lib/reset-to-home.ts`, `lib/fullscreen-exit.ts`
- `lib/orchestration/search.ts`, `lib/orchestration/history-key.ts`
- `components/ImageGrid.tsx`, `components/ImageTable.tsx`, `components/ImageDetail.tsx`
- `components/FullscreenPreview.tsx`, `components/Scrubber.tsx`

Follow actual initiators and consumers beyond this list. Resolve selection/focus
preference lifetimes, click/tickbox dispatch, density controls, route mounting,
pagehide/reload capture, keyboard/gesture handling, geometry and tuning constants.
Read complete relevant functions and dependencies; record whether additional files
were fully or partially read. Inspect datasource contracts where rank, cursor,
membership or failure semantics affect the outcome. This is not backend redesign
or a general rendering-performance audit.

Keep compact source/trace coverage in the worklog. One lead owns the whole model
and table. Optional read-only delegates may challenge a named claim or find missed
consumers; they do not replace the lead's required reads, write reports, edit shared
files, delegate further or run competing experiments. The lead verifies retained claims.

## Contracts to Compare

After establishing code paths, read these as potentially conflicting evidence:

- [Focus and position guide](00%20Architecture%20and%20philosophy/02-focus-and-position-preservation.md)
- [Scroll guide](00%20Architecture%20and%20philosophy/03-scroll-architecture.md)
- [History guide](00%20Architecture%20and%20philosophy/04-browser-history-architecture.md)
- [Selection guide](00%20Architecture%20and%20philosophy/05-selections.md)
- [Archived consolidation specification](zz%20Archive/scroll-and-position-preservation-consolidation-spec.md)
- Relevant current test assertions, fixtures and existing experimental results.

The archive supplies a transition catalogue and distinctions such as interaction
anchor and placement. Its implementation account is not current-code authority,
and its sections may disagree. Its rejected consolidation proposal is not an
active plan: do not revive its phases, gates or proposed protocol. Read other
docs/history for a named question, not an indiscriminate corpus review. A conflict
may be stale documentation, a bug, an intentional compromise or an undecided
choice; label it rather than guessing.

## What Each Case Must Establish

This section specifies the engineer's investigation, not columns the operator
must understand. Translate its findings into observable behaviour in the first
deliverable layer; retain mechanisms and citations in the second.

Separate explicit focus, selection/range anchor, viewport-centre anchor, recently
viewed interaction target and one-shot positioning target, even when code stores
them in the same field. "Phantom focus" alone is not a sufficient explanation.
Map actual field names to their roles and consumers.

| Dimension | Required questions |
|---|---|
| Preconditions | Mode, view, selection, focus present/absent, visible/partly visible/off-screen, loaded/unloaded, membership and pending work? |
| Anchor | Which identity wins, from which source and moment: before departure, detail entry, after traversal or destination history entry? |
| Lifetime | Durable bookmark, fresh inference or one-operation target? What overwrites, consumes, suppresses or invalidates it? |
| Viewport | Native position, ratio, centre, top/bottom or no write? Image/row top versus centre, usable area, horizontal position, edge clamps and temporary buffer limits? |
| Focus | Retained, changed, cleared or restored from this entry? Distinguish stored focus, ring visibility, keyboard behaviour and transient pulse. |
| Selection | Membership retained/cleared? Which anchor is used, and is it also the range-selection pivot? Does selection hide older focus? |
| History/URL | Push, replace or neither? Which entry owns focus/position? What is captured, persisted, restored or skipped on Back, Forward, reload and display-only navigation? |
| Fallback | Anchor absent/unloaded/deleted, missing snapshot/cursor, empty results, failed/aborted request: resulting viewport, focus and selection? |
| Supersession | Later scroll, focus, search, history navigation or unmount: which intention wins? Can obsolete work move the view or clear newer state? |
| Completion | Data ready, scroll requested/written or geometry stable? Intermediate jumps, stale content, skeleton slots versus correctly placed thumbnail placeholders? |

Trace producer -> capture -> data publication -> positioning consumer -> completion
and cancellation. Where different producers choose identity and placement, check
that they refer to the same image/context. Equal final state does not establish
equal intermediate behaviour. Missing acknowledgements do not automatically
justify introducing a coordinator.

## Transitions and Sequences

Cover query/filter changes, sort changes (including AI entry/exit and re-sort),
missing-anchor neighbours/fallback, seek and arrow snap-back, Home/End, logo reset,
new-image refresh, buffer extension/eviction, density switches, panel/browser resize,
detail/fullscreen entry/traversal/return, selection changes/clear, Back/Forward,
list reload and reload while detail is open. Distinguish real result edges from
temporary loaded-buffer edges. Include meaningful failure and interrupted paths.

Do not infer sequences from isolated actions. At minimum trace:

- Focus -> seek or scroll away -> density/resize; distinguish off-screen loaded
  focus from focus no longer in the buffer.
- Tickbox selection -> seek away -> repeated density/resize; separately with no
  focus and with older focus hidden by selection.
- Detail/preview -> close with and without traversal -> scroll -> query/filter/sort.
  Does the last-viewed target affect later actions, and for how long?
- Selection -> clear -> another transition; distinguish revealing focus from scrolling.
- Entries with distinct focus, or none -> Back -> Forward -> reload; distinguish
  destination state from state carried from the departing entry.
- Density toggle -> scroll/focus change -> Back/Forward; distinguish display-only
  entries from search-context entries and density changes during history restore.
- Queued restoration followed by newer navigation or scrolling; repeated density
  changes both after settlement and before earlier work completes.

For density/history keep three undecided policies distinct: whether a toggle adds
a Back step, whether Back restores destination density, and whether current density
persists across navigation. URL reload/share behaviour is another dimension;
retaining density in the URL does not require creating a history entry.

## Tests and Browser Work Are Authorized

Relevant existing tests, useful build checks, browser operation and bounded
throwaway diagnostic tests are permitted. Do not stop at proposals when an
authorized check can resolve material uncertainty.

- Read the [test guide](../../e2e/README.md) before tests and the
  [browser playbook](embedded-browser-playbook.md) before browser operation.
  Follow prescribed runners, foreground output, port coordination and sandbox rules.
  Ask the operator to stop their running app before e2e; wait for confirmation.
  Never interrupt or poll an active test run; await its completion notification.
- Establish actual app mode, datasource and tier before probing. Prefer local or
  fixture-backed checks. TEST/CODE/PROD needs explicit permission for that environment
  in the executing session; browser permission is not live-system permission.
- Inspect existing evidence first. Name each experiment's unanswered question,
  why prior results cannot answer it, expected alternatives and discriminating check.
  Do not rerun a campaign merely because this agent did not run it originally.
- Exercise production paths with existing fixtures/helpers. Temporary spies, mocks
  and browser probes may expose ownership, timing and request counts; copied replacement
  logic proves nothing about the implementation. Do not weaken existing assertions.
- Track stable image identity, not nth rendered cells. Measure signed placement
  against usable DOM bounds; distinguish buffer/global coordinates. Wait for relevant
  operation/layout completion, not just `loading === false`. A fixed delay or two
  stable frames alone does not prove no later work can move the view.
- Compare preservation outcomes across buffer, indexed/two-tier and seek modes with
  equivalent preconditions. Map readiness must not silently change policy. Different
  seek accuracy or loading mechanics are not automatically preservation bugs; describe
  their scope. Record actual thresholds, datasource and fixture limitations.
- Label source-established, runtime-observed, test-asserted and unresolved claims.
  Seek counterexamples; retract refuted claims. Do not extrapolate finite probes
  into unbounded drift or exhaustive timing coverage.
- Formal performance campaigns retain separate authorization rules. No speed-up or
  performance-equivalence claims from passing functional tests or incidental timing.

## Deliverable and Boundaries

Write both deliverable layers in the existing
[characterisation and cleanup ledger](not-yet-another-audit-ledger.md). It owns
the operator's decision table, engineering evidence, discovered bugs and open work.
Keep these as distinct sections linked by case IDs, not competing inventories.

The [02 guide](00%20Architecture%20and%20philosophy/02-focus-and-position-preservation.md)
is a timeless architecture document and a contract source for this investigation,
not its output location. Do not put research tables, unresolved decisions, bug
lists or session history there, or rewrite it during characterisation. After the
assessment and operator decisions are complete, a separate documentation step
can update it to describe settled behaviour and architecture.

Prefer the existing ledger. If its readability genuinely requires another
deliverable document, explain the need and ask before creating it; any approved
file must be under `kupua/exploration/docs/` with a `not-yet-another-audit-` prefix.
Keep the ledger as the entry point and link evidence rather than duplicating it.

Use two linked layers in this one document, with shared stable case IDs. Do not
make the operator read implementation analysis to answer product questions.

### Layer 1: Observable Behaviour and Decisions

Lead with a plain-language table grouped by interaction. Suggested columns:
case/situation; what happens now; evidence confidence; choice if needed; operator
decision. A situation should read like "Focus A, scroll elsewhere, switch to table",
not a store-state formula. Explain separately where the view lands, which image
remains focused, what stays selected and what Back/reload remember. Include later
jumps, intermediate flashes and whether a newer action wins, not just final screenshots.

Keep source citations, field names, generations, coordinate arithmetic and internal
tier labels out of this table. Link case IDs to Layer 2. Label confidence as
observed, inferred from code, or not established; keep environment limitations in
the evidence notes. Do not present code inference as a browser observation.

Only ask the operator about genuine choices or unsettled intent. Existing settled
behaviour needs no new question; show "No decision needed" with the established
expectation. For undecided cases, "Keep current behaviour" can be an option, not
an answer silently selected by the agent. Group equivalent choices to avoid asking
the same policy question repeatedly. Present options through their UX consequences;
any recommendation must be labelled and separate from facts.

Inconsistent observable behaviour belongs here too: for example, "stays put when
loaded, but jumps after loading". Do not hide a user-visible bug in technical notes.
Conversely, different mechanisms with equivalent outcomes are not operator decisions.
Aim for roughly 25-35 grouped cases, not a quota or coverage cap; split cases only
when the observable outcome or unresolved decision materially differs.

### Layer 2: Engineering Evidence and Bugs

For the same case IDs, retain source traces, exact supporting test assertions and
contract sections, ownership/lifetime, fallback, supersession and completion details.
Distinguish code-vs-code, tier outcome, code-vs-contract, contract-vs-contract and
test coverage gaps. A code difference is not automatically a behavioural inconsistency.
Record equivalent-precondition comparisons and identify where evidence is missing.

Classify issues so bugs remain actionable without becoming unnecessary interviews:

- **Product choice:** multiple plausible outcomes with no settled requirement;
  expose the alternatives in Layer 1 for the operator.
- **Established-contract violation:** cite the requirement and evidence of breach;
  record the bug without asking the operator to approve the requirement again.
- **Unsettled contract:** conflicting or ambiguous intent, including provisional
  D8; ask about a concrete outcome, not an implementation mechanism.
- **Implementation difference only:** retain for engineering assessment, not as
  a product question. Explain any maintenance consequence without claiming a bug.
- **Evidence gap or suspected bug:** state the unproved claim and discriminating
  check; do not label it a reproduced defect or invent certainty.

For each retained bug record expected versus actual behaviour, minimal reproduction
or source proof, conditions/modes/tiers, confidence, existing test coverage and the
missing assertion. Separate demonstrated cause from suspected cause. Retract refuted
claims. Keep bugs as a clearly labelled subsection linked to cases and existing
ledger/backlog entries where relevant, not a second report or competing register.
No bug repair is authorized by discovering it during characterisation.

Include compact coverage/evidence: files and traces completed/partial, checks and
environments, unread dependencies, blocked cases and unsupported modes. Distinguish
necessary mechanisms from potentially duplicated responsibilities only where the
traces support it; do not force an architecture recommendation. Finish with the
few highest-value unanswered operator questions. The result should support later
fixes and refactoring without making the operator choose how either is implemented.

No product fixes, refactors, configuration/dependency changes, weakened tests or
new persistence protocols. Manual edits/diagnostics stay under `kupua/`; use prescribed
runner output locations. Never write secrets, real emails, authorization headers or
signed URLs. Never write to non-local Elasticsearch or weaken safeguards.
No Git mutations without fresh explicit approval; never push.

Maintain the worklog with coverage and resumable next steps. If unfinished, mark
the assessment partial and retain that state; do not rush decisions to fit a session.
Remove only your temporary artifacts. Ask before retaining diagnostic tests permanently.
Keep the ledger's decisions and characterisation evidence available for operator
review and later fixes; its open-item deletion rule applies to the task list, not
to the evidence or decision table. Make minimal AGENTS routing and required
browser-playbook updates; no research changelog entry. Reset your worklog only
after retaining durable findings and completing the task.

## Done Means

The lead has completed required full source reads and cross-file traces. Layer 1
lets the operator settle only unclear observable behaviour without understanding
the code. Layer 2 preserves actionable bugs, contract conflicts, same-condition
code/tier differences and verification gaps under the same case IDs. State is
distinct from presentation, anchor from focus, and implementation from intended
policy. Material uncertainty has a discriminating check or an honest blocker.
The resulting evidence and decisions support a coherent later simplification;
neither a rewrite nor a sequence of fixes follows automatically from this task.
