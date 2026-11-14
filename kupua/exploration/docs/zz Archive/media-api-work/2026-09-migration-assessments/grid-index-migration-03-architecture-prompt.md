# Grid index migration: architecture assessment prompt

> **Archived, 15 September 2026: completed historical prompt, do not execute.** This exercise
> sought a stronger migration end state, not the smallest additive prototype change. Its
> architecture programme is not approved or a prerequisite for D3 review.
> Current scope: [media-api index](../../../03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/media-api-00-index.md).

**Recommended model:** Opus 4.6 or the strongest available architecture model.  
**Mode:** Read-only decision session. No implementation, tests, live systems or profiling.

Paste the prompt below into a fresh agent session.

---

You are a fresh architecture adjudicator working in the Grid repository. Your task is to
adversarially assess the recommendation in
`grid-index-migration-02-research-findings.md` and select the system architecture that
should govern D3, D8 and Grid's index-migration read behavior.

This is a decision session, not a workplan session. Do not preserve the returned recommendation
because it is detailed, and do not preserve the current D3 implementation because it is already
written. Conversely, do not choose a larger redesign merely because it is cleaner. Select the
best final outcome on demonstrated correctness, operational behavior, user-visible migration
semantics, performance feasibility and evolvability. Implementation cost is evidence, not a veto.

## Required output

The only research deliverable is:

`kupua/exploration/docs/zz Archive/media-api-work/2026-09-migration-assessments/grid-index-migration-04-architecture-proposal.md`

Do not edit product code or any other planning document. Maintain `worklog-current.md` only as
required by repository protocol. The output must make one architecture decision and one D3 review
decision. It must leave snapshot transport/state mechanism questions in a precise form from which
document 05 can be written.

## Source and evidence rules

- Current source is authoritative.
- Active planning scope is only
  `kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/`.
- Do not use `zz Archive/media-api-work/` as current design. The sole archive exception is the
  `_shard_doc` analysis explicitly linked by active rule 24.
- Read `grid-index-migration-00-routing.md` first.
- Read documents 01 and 02 in full. Treat 02 as a recommendation to challenge, not authority.
- Read the current D3 code, migration/Thrall code, direct-ES fallback and all tests cited by 02.
- Read the active broad migration plan, D3 PR evidence, sort companion, D7/D8/D9 plan,
  conventions and agent instructions.
- From the consolidation audit, read the execution disposition and Q5, Q6, W6, H3, H6 and S5.
  Use them only where this prompt asks; do not reopen the general DRY audit.
- You may consult authoritative Elasticsearch documentation and exact dependency source. Cite
  URL and version.
- Every factual claim needs a current `file:line` or authoritative external citation.
- Label each material conclusion **Proven**, **Inferred**, **Measurement-needed**, or **Unknown**.
- If your later analysis refutes an earlier claim, remove or rewrite the earlier claim. Do not
  leave a finding and its contradiction in the output.
- No test execution, live request, runtime log, TEST/CODE/PROD access or real user data.

## One mindset

Architecture adjudication only. Decide canonical read behavior and contract boundaries. Do not
write implementation steps, endpoint controller pseudocode, schema migrations, task estimates,
commit plans or code. Do not decide CAS versus signed token here unless one candidate is made
logically impossible by the selected architecture; that mechanism decision belongs to 05/06.

## Section 0 — premise challenge and halt

First test whether this adjudication is premature or malformed. If source cannot establish the
physical-copy/migration state model needed to choose a read policy, write Section 0 with the exact
missing evidence and stop. Do not manufacture a decision. Missing benchmark numbers alone are not
a reason to halt if architecture can be decided with explicit measurement gates.

## Decisions that must be made

### 1. Canonical read policy

Accept, modify or reject 02's blue-green single-target read epoch. Compare at least:

- current progressive current+M search with per-document `migratedTo` filtering/M-first getters;
- one single-target canonical read alias with guarded whole-index cutover;
- a materialized canonical read index or equivalent one-document-per-ID projection;
- a correct server merge over two snapshots, if feasible;
- deferring media-api snapshot migration until index migration is complete;
- any independently derived option that source supports.

For each, determine logical-ID uniqueness, canonical source freshness, search/getter/D9 parity,
delete/update behavior, page-one/continuation consistency, totals, sort tuples, fallback, preview,
cutover, rollback and operational complexity. Correctness gates precede cost scoring.

Explicitly decide whether losing progressive visibility of regenerated M projections until a
whole-index cutover is an acceptable intentional behavior change. Do not hide that trade-off.

### 2. Migration state semantics

Define the canonical user-facing behavior for:

- `NotRunning` before migration;
- `InProgress`;
- `Paused`;
- `CompletionPreview`;
- `StatusRefreshError(previousStatus)`;
- insert-before-marker and projection marker reset;
- one-sided update/delete failure;
- cutover while old sessions remain open;
- post-cutover rollback.

Decide whether `CompletionPreview` remains diagnostic only or participates in canonical reads.

### 3. `CutoverReady`

If the selected policy has a whole-index cutover, define a falsifiable readiness barrier. Assess
02's proposed requirements: migration drain, unresolved failures, current-only projection work,
delete/tombstone reconciliation, write fencing or mandatory M writes, atomic alias switch and
postcondition verification. Add, remove or reject requirements with evidence.

State which component owns each check, what fails closed, and whether current Thrall state can
represent the barrier. This is an architecture contract, not implementation pseudocode.

### 4. D3 contract and review posture

Choose exactly one:

1. review current D3 substantially unchanged;
2. revise D3 before review but keep raw PIT identity;
3. hold review for coordinated D3/D8/read-epoch contract change.

Decide whether page one must be inside the same snapshot as continuations and whether snapshot
creation belongs in D3, standalone D8, or a separate session resource. Decide whether the client
sees raw PIT IDs or only an opaque semantic handle. Define expiry and restore semantics at the
architecture level.

Also adjudicate Q5/Option A. D3 has one known client and is pre-review; decide whether semantic
`orderBy` replaces the client-resolved ES `sort` now, later through a versioned transition, or not
at all. Never use legacy Kahuna-serving `createSort` as the semantic builder.

### 5. Read-path convergence

List every path that must share the selected read epoch or snapshot semantics, including:

- media-api `prepareSearch`;
- single-image getter and D9;
- D3 page one and continuation;
- Kupua direct fallback;
- D1 position map;
- D4 rank;
- D2 range walk;
- history restore/re-anchor;
- diagnostic preview surfaces.

For each, state same epoch, same snapshot, child/operation snapshot, or deliberately live read.

### 6. Snapshot transport requirements for 05

Do not choose CAS versus signed token by taste. Produce the exact requirements and unresolved
hypotheses that document 05 must investigate. At minimum address:

- refreshed PIT-head linearity under concurrent opposite-direction requests;
- lost response, retry, stale revision and duplicate request behavior;
- multi-instance media-api and restart;
- query/sort/principal/tier/read-epoch binding;
- expiry, re-anchor, close and cleanup;
- D1/D2/D4 sharing or child snapshots;
- rollout coexistence and rollback;
- exact-version Elasticsearch behavior and capacity measurements.

If the architecture makes one transport impossible, prove that. Otherwise leave viable candidates
for 05 rather than prematurely selecting one.

## Findings from 02 that must be adjudicated explicitly

Create an accept/modify/reject table for at least:

1. raw multi-index PIT is invalid;
2. frozen `must_not migratedTo` cannot fix unmarked/reset duplicates;
3. current-index-only PIT is not equivalent to today's progressive reads;
4. `CompletionPreview` is not a readiness barrier;
5. current parallel page one is migration-inconsistent;
6. combined open-plus-first-page is the right ownership boundary;
7. one canonical read epoch is preferable to progressive per-ID precedence;
8. a shared opaque snapshot session is required at the architecture level;
9. PIT expiry must never silently fall back across coordinate spaces;
10. history restore should open a new snapshot and resolve a logical anchor;
11. D1/D4 share the browse snapshot while D2 uses an operation-owned snapshot;
12. canonical getters/D9/direct fallback must converge on the same read epoch.

For every modified or rejected item, explain the superior replacement and what evidence changed
the result.

## Options scorecard

Score every viable architecture using explicit gates:

1. exactly one logical document per ID;
2. deterministic public cursor;
3. canonical source defined in every stable and transient migration state;
4. page-one/continuation membership, total and order agreement;
5. update/delete/cutover/rollback safety;
6. search, getter, D9 and fallback consistency;
7. feasible D1/D2/D4 semantics;
8. multi-instance deployability;
9. measurable capacity/performance envelope;
10. versioned rollout and rollback.

Reject any option that fails gates 1–6. Only then compare complexity and performance.

## Required output structure

Target 2,500–4,500 words excluding evidence tables.

0. **Premise challenge** — only if halting.
1. **Decision card** — one architecture, one D3 verdict, confidence, blockers and next action.
2. **02 adjudication table** — accept/modify/reject every required finding.
3. **Canonical read policy** — physical target/copy and intentional user-visible behavior.
4. **Migration state table** — all stable/transient states and transitions.
5. **Architecture invariants** — identity, source, cursor, snapshot, auth, failure and cleanup.
6. **`CutoverReady` contract** — or a proof that no such barrier belongs in the architecture.
7. **D3/D8 contract boundary** — create, first page, continuation, expiry, restore and close at
   semantic level; no transport mechanism implementation.
8. **Read-path convergence matrix** — every path listed above.
9. **Options scorecard** — correctness first, then operations/performance.
10. **Transport research brief for 05** — candidates, falsifiable hypotheses, exact-version tests,
    measurements and stop conditions.
11. **Impact on active migration plan and D3 review** — documents/contracts that must later change.
12. **Residual unknowns/team decisions** — owner and cheapest resolution.
13. **Source coverage** — read and unread material surfaces.
14. **What done looks like** — self-check against this prompt.

## Anti-goals

- No product code, tests, live requests, commits or implementation workplan.
- No CAS-versus-token conclusion without proof that architecture forces it.
- No general media-api gap audit, D7/D9 design, DRY review or style cleanup.
- No treating current D3 work or 02's detail as sunk-cost authority.
- No assuming single-target reads are correct merely because they avoid duplicates.
- No preserving progressive M visibility without defining exact duplicate/canonical semantics.
- No calling `CompletionPreview` a cutover barrier without proving its prerequisites.
- No process-local session state unless deployment topology proves it safe.
- No weakening the unique logical-ID/public-cursor requirement.
- No “fix” to `_shard_doc` truncation without reconciling persisted non-PIT cursors and logical
  duplicate IDs.
- No unsourced claim and no user-impact priority ranking.

## Completion standard

The output is complete only if a planning agent can read 04 and know:

- which physical copy is canonical in every migration state;
- whether progressive projection visibility remains or is deliberately removed;
- whether and when read cutover occurs;
- exactly what makes cutover ready;
- whether D3 review proceeds, changes or remains held;
- whether page one and continuations share a snapshot;
- whether D3 uses semantic `orderBy`;
- which read paths share an epoch/snapshot;
- which mechanism questions, tests and measurements document 05 must resolve;
- which architecture alternatives were rejected and why.

---

**Expected output file:**
`kupua/exploration/docs/zz Archive/media-api-work/2026-09-migration-assessments/grid-index-migration-04-architecture-proposal.md`