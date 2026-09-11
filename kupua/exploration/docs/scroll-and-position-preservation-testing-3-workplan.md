# Scroll and position preservation: bug-led simplification workplan

> **Status:** Active, reset 2026-09-05 after consolidation design was rejected.

## Purpose

Improve Kupua's scroll and position behavior through concrete, independently
valuable fixes. Use each fix to simplify code that becomes demonstrably
obsolete. Do not pursue a top-down rewrite or reconstruct the retired fuzzer.

The project succeeds when the app has fewer real bugs, stronger behavioral
tests, faster trustworthy feedback, and less reachable coordination machinery.
It does not need a new central abstraction to succeed.

## Why this plan changed

Eight project commits delivered real value: accessibility and keyboard fixes,
keyword-seek correctness/performance, reliable Playwright interactions,
selection-sort semantics, geometric viewport anchors, atomic publication, and
deletion of the obsolete offset-correction protocol. See the live findings
ledger for the commit table.

The attempted viewport-operation design did not pass its deletion gate:

- reset signalling was already a small family-local command; replacing it was
  mostly renaming plus acknowledgement;
- semantic restoration signalling was shared by sort, phantom, history,
  search fallback and keyboard paths, so a bounded migration could not delete
  the old consumer; and
- migrating every owner together would have been the risky rewrite this project
  was designed to avoid.

The successful simplification came instead from F12: correcting selection-sort
behavior required atomic final-coordinate publication, which made the old
offset-correction protocol producerless and removable in the next commit.

## Authoritative artifacts

- `zz Archive/scroll-and-position-preservation-testing-4-findings.md` - delivered
  commit summary and final dispositions; historical, not a live work queue.
- `scroll-and-position-preservation-consolidation-spec.md` - product contract,
  current-protocol map and rejected consolidation design. Reference material,
  not an active migration plan.
- `zz Archive/scroll-and-position-preservation-testing-3.1-tests-inventory.md` - completed evidence inventory
  map and test-maintenance source. It is not authority to delete tests.
- `worklog-current.md` - current item only.

## Operating method

### 1. Choose one item

Select the highest-value credible open finding. Do not batch unrelated findings
or organize work by file/cluster.

### 2. Discriminate before changing code

Name the user-visible failure, suspected controlling path, one cheap check that
could refute it, and tests likely to encode old behavior. If the first check
refutes the finding, delete or correct the finding and stop.

### 3. Use the right observation surface

- Pure/store algorithm: deterministic Vitest with a controlled data source.
- Hook/component lifecycle: focused render/component test.
- DOM geometry, fullscreen, history or interaction: drive the browser with
  stable image identity and signed usable-viewport geometry.
- Scale-only behavior: targeted read-only TEST observation after checking the
  embedded-browser playbook; never broad campaigns.

Browser observation is encouraged when it resolves an actual ambiguity. It is
not permission for open-ended browsing. Never carry ordinal locators across
virtualizer movement and never write live image IDs or sensitive values to disk.

### 4. TDD fix

1. Write the failing test first.
2. Confirm it fails for the intended reason.
3. Make the smallest root-cause change.
4. Run the focused check immediately.
5. Inspect adjacent state publication and frame behavior for a second visible
   state, as F12 demonstrated.
6. Update or add every relevant test that intentionally changes behavior.
   Never weaken assertions merely to regain green.

### 5. Harvest simplification

After behavior is correct, search for machinery made unreachable: producerless
generation counters, duplicate refs/guards, stale flash suppression, fixed waits
replaced by observable completion, obsolete helpers/tests, and comments about
deleted phases. Delete only with direct evidence; do not use a bug fix as
permission for unrelated cleanup.

### 6. Validate and commit

- Run focused tests first.
- Run `npm --prefix kupua test 2>&1 | tee "$TMPDIR/kupua-test-output.txt"`
  after any `src/` change.
- Run `set -o pipefail; npm --prefix kupua run test:e2e 2>&1 | tee "$TMPDIR/kupua-test-output.txt"`
  after component, hook, store or scroll/focus changes, but first warn the user,
  ask whether port 3000 is occupied, and wait for confirmation.
- Suggest relevant perceived/jank checks; never run them autonomously.
- One finding/fix per commit. A fix commit contains production code, its tests,
  its own changelog entry and finding status update only. Do not include the
  workplan, worklog or unrelated docs.

## Ordered program

### Lane A - Product bug harvest

1. **O1 truncated keyword distribution/null-zone classification.** Start with
   the deterministic store test. This is the highest-impact cheap check.
2. **O2 pending traversal session leakage.** Start with hook lifecycle TDD.
3. **O3 rejected fullscreen exit.** Start with a bounded component test.
4. **O4 distant traversal + reload + close.** Browser reproduction only; fix
   nothing unless stable-identity geometry reproduces the failure.

After each fix, perform the dead-machinery pass before choosing the next item.

### Lane B - Test feedback and observability

Run separately from product fixes:

Correct remaining position-sensitive waits to use stable identity and signed
geometry where needed. Do not build a global production acknowledgement system.

### Lane C - Documentation cleanup

Keep the findings ledger live. When an item is fixed, reduce it to a short fixed
summary or remove it after its commit/changelog entry is authoritative. Delete
refuted and superseded claims rather than appending corrections indefinitely.

## Reopening larger refactoring

Do not reopen consolidation because `useScrollEffects` is large or because the
protocol looks inelegant. Reopen only when concrete fixes expose a bounded
family for which one reversible change can delete all old producers, fields,
refs and consumer branches; retain pre-paint/tier behavior; add no request or
per-frame subscribed state; pass signed-geometry/endpoint checks; and show no
material performance regression.

If a proposed abstraction coexists with the old protocol, reject it.

## What done looks like

- All live findings are fixed, refuted or consciously deferred.
- The findings ledger contains no stale fuzzer conclusions.
- Position-sensitive tests distinguish store readiness from rendered geometry.
- The habitual E2E surface is faster only where measurement proves equivalent
  or stronger coverage.
- Each fix leaves less reachable complexity when the code permits it.
- No rewrite is attempted without a deletion-first bounded opportunity.
