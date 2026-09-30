# Core Logic Cleanup: Session Prompt

Start a session with: *"Follow `kupua/exploration/docs/not-yet-another-audit-prompt.md`
for ledger item Lx"* (or *"for the next unblocked item"*). The work list is the
[ledger](not-yet-another-audit-ledger.md); the behaviour map is
[focus and position preservation](00%20Architecture%20and%20philosophy/02-focus-and-position-preservation.md).

## The Question

Kupua's position engine grew through many competent fixes, each adding machinery
without always removing what it superseded. It broadly works. The question for
this series of sessions:

> Can position preservation be expressed as one anchor decision, one placement
> capture and explicit transition ownership, without changing behaviour the
> operator has not decided to change? What machinery disappears once it is?

Answer it one ledger item at a time. Prefer deleting mechanisms and duplicated
decisions over renaming, moving or wrapping. Do not rewrite for its own sake, do
not manufacture refactors, and keep the ledger's Leave Alone list alone.

## Read First, and Only

1. The repository startup protocol: copilot instructions, `kupua/AGENTS.md`, the worklog.
2. The 02 behaviour map and the ledger.
3. The source files the item names, their callers where the claim needs them,
   and their tests.

Other docs (archives, audits, handoffs, the API-boundary corpus, the changelog)
are likely stale. Load one only for a specific fact the item needs. Code wins over
any document; a document that disagrees with code is a ledger Doc item. Read the
[test guide](../../e2e/README.md) before running tests and the
[browser playbook](embedded-browser-playbook.md) before browser work.

## Session Contract

1. **One item.** Restate its claim and disproof check in the worklog before editing.
2. **Check first.** Run the disproof check. If the claim is refuted, delete the item,
   tell the operator why, and stop.
3. **Tests before change.** List existing tests asserting the affected behaviour.
   Refactors start with characterisation tests; bugs start with a failing test that
   fails for the right reason.
4. **Change.** Delete superseded code and every comment it makes false in the same
   change. Comments state only what code cannot show, timelessly, with no history.
5. **No unplanned behaviour change** (ledger D3). If the item turns out to need an
   undecided behaviour change, stop and ask.
6. **Verify.** Unit tests after any `kupua/src/` change; e2e after any component,
   hook, store or scroll change; suggest a perceived-performance run after store or
   scroll changes (ledger D4). Follow the repository test directives exactly.
7. **Record.** Changelog entry for code changes. Update 02 when behaviour or
   ownership changes, as current description, not history. In the ledger: delete
   the item, add any newly found items (claim, disproof check, kind), respect the cap.
8. **Ask before committing.** One item, one commit, unless the operator says otherwise.

## Done, by Kind

| Kind | Done when |
|---|---|
| Delete | Code gone, including test/debug hooks and DOM attributes that only it fed; tests green |
| Comment | Every touched comment matches current code; no history narrative |
| Bug | Failing test now passes; relevant e2e green |
| Decision | Operator answer recorded in ledger Decisions and 02; code follow-up added as an item |
| Characterise | Tests record current behaviour; ask before keeping them permanently |
| Consolidate / Refactor | Characterisation tests unchanged; changelog names the mechanisms removed; 02 ownership updated |
| Move | No logic change; tests unchanged |
| Doc | Rewritten as timeless description, or deleted with operator approval |

## Stop and Ask When

- the item needs a behaviour decision not in the ledger's Decisions;
- it is bigger than one session (split it into ledger items instead);
- an approach has failed once;
- a check would need TEST/CODE/PROD access.

## Safety

- Public repository: never write secrets, signed URLs, tokens or real emails.
- Edit only under `kupua/`. No Git mutations without asking; never push.
- Real Elasticsearch only read-only, with explicit permission per session and
  environment; never weaken `es-config.ts` safeguards.
- Playwright ports, foreground `tee` output and no polling, per the test directives.
- Remove temporary diagnostics; keep only the evidence the changelog or ledger needs.
- Delegation is optional: delegates get one named question, work read-only, edit
  no files and report back; the session lead verifies what it keeps.

## Method for Delete and Consolidate Claims

- Find every consumer, not just imports: callbacks, registrations, store
  subscriptions, DEV window hooks, DOM attributes read by tests.
- Counterfactual test: what changes if this computation, state, branch or flag
  disappears? Equal final values are not enough; check intermediate frames,
  timing, cancellation, request count, errors and every tier and focus mode.
- Throwaway diagnostics may use spies, mocks or browser probes against the real
  code path. Copied replacement logic proves nothing about the implementation.
- A passing test covers what it asserts, not equivalence across untested modes.
  Read assertions and mocks critically.
- Prefer local or fixture-backed checks; establish the app's actual data source
  before operating it in the browser.
