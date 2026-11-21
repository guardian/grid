# API boundary 03: adversarial review and reconciliation

**Status:** Run in a fresh session only after the first report exists.
**Required first read:** [Operator brief](api-boundary-00-brief.md).
**Input:** `api-boundary-02-code-first-findings.md` in this folder.
**Your sole report:** `api-boundary-04-reconciled-recommendation.md` in this folder.

## Your task

Try to falsify the first report's recommendation that its proposed boundary can preserve Kupua's
capabilities and performance while reducing justified production-Grid change and risk. Reconcile
the surviving claims with current code and actual operator decisions. The deliverable is a decision
about that proposal, not another independently invented master plan.

An adversarial review is not a requirement to find a defect. **If the proposal survives, say so.**
If it fails, identify the concrete counterexample and the smallest repair or decision that follows.
If no bounded repair preserves the acceptance floor, reject it rather than turning this task into
a third architecture programme. More documentation or agreement between agents is not proof.

## 1. Inputs and scope

Follow the fresh-agent protocol. Read the shared brief, applicable instructions,
[AGENTS](../../../../AGENTS.md) and [the current worklog](../../worklog-current.md).
If the first report is absent, stop and ask for that stage to be completed; do not manufacture its
recommendation. Read the report and its evidence, then trace its load-bearing claims into current
source and nearby tests before following historical recommendations.

Identify source/ref differences since stage 01. Check whether a changed implementation invalidates
an observation, rather than silently treating two different trees as an A/B comparison. Do not
fetch, switch branches, discard others' work or rerun stage 01 merely to make the inputs match.

You may now read planning and decision documents, in this order and only to the extent relevant:

1. [Active integration index](media-api-00-index.md): current scope, not historical mandates.
2. [Capability inventory](media-api-01-capability-inventory.md): current summary first; inspect
   historical detail only where a claim or missing workflow needs checking.
3. [Immediate endpoint workplan](media-api-02-next-endpoints-d7-d8-d9-workplan.md): distinguish
   its current qualifications from contradicted lower-level instructions.
4. [Completed D3 findings](d3-search-after-01-readiness-findings.md),
   [sort decisions](d3-search-after-03-sort-options.md) and
   [performance evidence](d3-search-after-04-performance.md), where the proposal depends on them.
5. Only the owning UX/architecture guide, archived assessment or research section necessary to
   distinguish a current guarantee, accepted limitation, refuted fix or unapproved stronger design.
   Do not resume an archived research sequence or treat its execution gates as current authority.

Use the first prompt to resolve its assigned scope, not as evidence that its conclusions are right.
An old document saying an endpoint is missing is a lead to source verification. A newer document
is not automatically a new operator decision. If operator intent genuinely remains ambiguous,
ask one focused question rather than silently weakening a feature or demanding stronger guarantees.

## 2. Review method

Select the report's **8-12 load-bearing claims**, or fewer if that covers them all. Prioritise the
claim with the greatest architectural consequence, not the easiest inconsistency to find.

For each claim:

1. Restate exactly what is promised, with the first report's section/workflow/evidence ID.
2. Name the input, scale, state transition or permission case most likely to disprove it.
3. Trace the controlling code and relevant existing assertion. Separate a real mismatch from
   an implementation detail that need not be identical across modes.
4. Perform the cheapest permitted discriminating check if source alone cannot decide it.
   Experiments are allowed under the shared brief; this is not a static-only review. Request
   the required app mode and session-specific real-system permission rather than assuming access.
5. Classify the result as **supported**, **refuted**, **unverified**, or **operator decision**.
   Give the minimum consequence for the recommendation, not an unrelated refactor proposal.

Reproduce only measurements whose conclusion matters and whose control or interpretation needs
checking. Existing valid evidence may be reused with its limitations; do not demand a new campaign
just because it was gathered by another agent. A materially unverified performance claim makes the
verdict conditional, not automatically false and not silently accepted.

## 3. Counterexamples to examine

Apply these lenses where the proposal depends on them. They are not presumed bugs or reasons to
grow the project. Cover them collectively through the claim register rather than duplicating a
second exhaustive source inventory.

### Capabilities and interaction performance

- Does every workflow in the first report's coverage matrix actually retain the required behavior?
  Check all result-size tiers, both paging directions, deep seek, End, missing values, configured
  aliases, special-date sorts, focus/density changes, traversal/history and selection outside the
  buffer. Method optionality is not feature-removal permission.
- Is an apparent saving bought with ordinary pagination, lower limits, weaker selection, missing
  counts, skipped enrichment, reduced sort support or an unacknowledged latency increase?
- Is the proposed keyword-sort treatment evidence-based? Separate a direct-mode limitation from
  API overhead and an algorithmic replacement from removal of the feature. Do not reinstate
  user-controlled secondary sorting that was deliberately removed.
- Does a fast first page hide expensive maps, full-image downloads, repeated counts, large bucket
  walks, concurrent selection hydration or a long interaction settlement? Could different cache
  warmth, corpus, background-tab throttling or local/prod topology explain the claimed win?
- Does moving work into Kupua or another service increase round trips, payload, memory, CPU,
  signing, background work or shared-cluster load? One HTTP route containing many operations is
  not automatically a smaller backend. A tiny fixture cannot establish large-corpus performance.

### Query, data and trust boundaries

- Verify reused routes through their actual controller/query paths. Check full filter context,
  date conventions, empty/default queries, deleted/hidden-image policy, request/batch limits,
  ordering requirements and enrichment. Do not inherit a legacy disclosure defect as a shortcut.
- Check that hits, counts, facets and ID-only responses all enforce the appropriate permissions;
  a lack of images in a response does not make its information harmless. Client validation alone
  is not server authorization or a work bound. Existing machine-principal method policy matters.
- Check authoritative tuples, null-zone crossings, nested/multi-valued maximum-date semantics,
  exact rank/map operations and bounded range completion/truncation. Separate exactness within a
  declared view from a new requirement that every operation share one immutable session.
- Examine ordinary continuation, overlapping requests, refreshed identifiers, expiry, lost/failed
  responses, cancellation and cleanup. Do not fix them by silently adding durable coordination,
  serialising previously parallel work without considering latency, or reintroducing migration
  support. If a stronger guarantee is genuinely necessary, name and justify that specific change.
- Does API failure become false empty success, erase selection, publish stale data or lose the
  only baseline in API-only mode? Are optional enrichments still optional without making required
  navigation disappear? Check projection, complete arrays, aliases and commit-time enrichment.
- For AI reuse, compare actual query/filter, ranking/blending, cap, total and health behavior;
  the same model name does not prove the same capability or quality. Distinguish existing optional
  availability from disabling an accepted workflow to simplify migration.

### Production containment and proof quality

- Classify endpoint-local additions, existing-caller behavior changes, shared resource effects and
  new infrastructure separately. Neither an additive route nor a separate process proves safety.
- Does the proposal depend on changing Kahuna's shared behavior, authorization, index mappings,
  migration machinery or another service? Identify that dependency precisely; do not imply it is
  approved because the new caller is a prototype. Prefer a bounded alternative where supported.
- Does the proposed no-browser-ES test cover every runtime owner and failure path, including
  selection, collections and AI? Hybrid fallback, mocked API responses, and habitual tests that
  block media-api cannot prove real API-only integration. Name the needed integration check.
- Are source observations, read-but-unrun tests, experiments, old measurements and operator
  decisions labelled correctly? Are source refs and measured modes current enough for the claim?
- Is a rejected historical fix being revived without new evidence, or an archived demand being
  used to enlarge current scope? Is a real ordinary-operation defect being dismissed merely by
  calling it a migration problem? Both errors need correction.

## 4. Reconcile rather than multiply plans

Keep the first report intact as the proposal reviewed. Your report owns the disposition; do not
silently rewrite its evidence or overwrite the active inventory/workplan during this task.

Where current documents conflict, identify which statement is an operator constraint, current
implementation fact, historical sketch or unapproved improvement. Recommend the smallest change
to the existing owning document after a decision. Cap this at six material corrections; this is
not a documentation cleanup programme.

The final recommendation must preserve the whole acceptance floor. A potential feature reduction
belongs under **Separate product decision**, not inside a supposedly compatible plan. Reject an
alternative that only wins after such a reduction. If all alternatives need a concession, stop
with that decision rather than choosing for the operator.

Do not automatically reopen D3's completed amendment batch or change its review status. A proven
dependency requiring a later D3 change belongs in the recommendation with its cost and scope.
Human maintainer agreement and production enablement remain separate from this agent's verdict.

## 5. Required output

Write `api-boundary-04-reconciled-recommendation.md` in this folder. Aim for **1,200-2,000 prose
words plus compact claim/evidence tables**. No minimum finding count; normally no more than eight
material findings. Explain any essential overrun. Cite current deciding source with repository-
relative file/line links, and retain sanitised experiment artifacts only under the shared scheme.

Use these sections:

0. **Verdict.** Choose **proceed to bounded local proof**, **amend then prove**, **reject proposal**,
   or **blocked on named evidence/decision**. State whether the preserved-capability design survives
   and whether performance is demonstrated, plausible but unverified, or contradicted. None of
   these verdicts authorizes implementation or production rollout by itself.
1. **Material findings.** Order by consequence for the decision. For each: claim tested, concrete
   counterexample, accepted expected behavior, observed/source behavior, evidence and confidence,
   and smallest consequence. Distinguish introduced regression, existing defect, scope expansion
   and missing evidence. Remove any finding your own later evidence refutes; do not leave both.
2. **Claim dispositions.** The 8-12 load-bearing claims and their supported/refuted/unverified/
   operator-decision outcomes. Include relevant first-report `W`/`E` IDs and your own check IDs.
   Reading a passed test's code is not rerunning it; state exactly what was independently checked.
3. **Reconciled direction.** Retained boundary, minimal changes to it, surviving backend additions,
   client responsibility and workflow coverage deltas. Do not reproduce the whole first matrix;
   name affected rows and any missing workflow. If rejected, explain why and whether one already
   assessed alternative survives; do not invent a complete replacement programme.
4. **Hardest-first next action.** One experiment, bounded local implementation proof or human
   decision, with proposed scope, app/test prerequisites, acceptance criteria and stop conditions.
   Include whole-journey performance and capability checks, not only endpoint success. Identify
   the earliest useful maintainer review point and a route to full local API-only verification.
5. **Decision/document reconciliation.** At most six material contradictions or superseded claims,
   their current disposition and owning file to amend only after approval. Explicit product
   concessions remain separate and are not counted as implementation savings.
6. **Evidence and limits.** Refs/modes checked, experiments and tests actually run, their controls
   and bounds, blocked work, retained artifacts and cleanup. Source review and bounded TEST use
   do not establish deployed production capacity or previously unknown caller behavior.

## Done when

- The claims controlling the recommendation have concrete dispositions, not a vote between docs.
- No required feature or performance property vanished during reconciliation; any concession is
  visibly awaiting an operator decision.
- Shared-production impact and ordinary-operation guarantees are explicit without importing the
  rejected migration programme or demanding arbitrary stronger correctness.
- The verdict follows the evidence, including a clean result when no material issue is found.
- One actionable next step tackles the most consequential remaining uncertainty; no new generic
  audit queue or unapproved implementation programme has been created.
- The report and experiment cleanup are complete. End with a concise recommendation for the
  operator and stop; do not implement the recommendation or launch another agent automatically.