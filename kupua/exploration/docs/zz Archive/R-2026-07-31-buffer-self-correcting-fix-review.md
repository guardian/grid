# Review — `_bufferSelfCorrecting` fix (F3/F4 sort-around-focus scroll clobber)

Date: 2026-07-31
Scope reviewed (only these five files; other uncommitted repo changes ignored):

- `kupua/src/stores/search-store.ts`
- `kupua/src/hooks/useScrollEffects.ts`
- `kupua/e2e/local/scrubber.spec.ts`
- `kupua/e2e/shared/helpers.ts`
- `kupua/e2e/smoke/manual-smoke-test.spec.ts`

Reference (read-only): `W-2026-07-31-focus-bookmark-across-tiers.md` (F3/F4).

---

## Verdict

**The fix is correct and closes the described race.** It does not over-suppress any
of the four genuine "go home" paths. It has no reachable effect outside buffer tier.

Two things stop it being a clean pass:

1. Its correctness depends on an **unstated React scheduling assumption** that nothing
   in the code or tests pins.
2. The **only** thing guarding it is one live-ES e2e assertion. The store-side half of
   the contract is cheap to pin deterministically and currently isn't.

Neither is a blocker. Recommendations are ordered at the end.

---

## 1. Correctness

### 1.1 The premise checks out

Effect #8 is declared before effect #9 in `useScrollEffects.ts`, so within a *single*
commit #8 resets scroll and #9 then scrolls to focus — #9 wins, no bug. The F3/F4 bug
exists only because `_topUpScrollModeBuffer`'s `bufferOffset` writes land in **later**
commits, after #9 has already run and will not re-fire (its
`scrollAppliedResultsRef` guard explicitly skips re-fires when `results` changed, which
is exactly what a buffer extend does). So the last `bufferOffset → 0` transition of the
walk-down arrives with no one left to re-apply the scroll. Suppressing #8 for that
transition is the right lever.

### 1.2 Flag lifecycle is sound

- `search-store.ts:1032` (`total > SCROLL_MODE_THRESHOLD`), `:1037` (`> BUFFER_CAPACITY`)
  and `:1038` (`_topUpInFlight`) all `return` **before** `setState({_bufferSelfCorrecting: true})`
  at `:1040`. So a second concurrent caller can never clear a flag it doesn't own, and
  the flag is structurally unreachable outside buffer tier.
- Set before the first `await`, cleared in `finally` (`:1098`) — every loop exit path
  (staleness, step budget, no-progress cap, 15s deadline, throw) clears it.

### 1.3 The fragile bit: React commit ordering

The flag must still be `true` when React commits the render carrying `bufferOffset: 0`.
It is — but only because of microtask ordering that nothing documents:

1. `extendBackward`'s `set()` runs inside the awaited call; zustand's
   `useSyncExternalStore` subscriber schedules React's sync-lane flush as a **microtask
   queued at that moment**.
2. `extendBackward` then returns → its promise resolves → the top-up's `await`
   continuation (loop re-check → exit → `finally` → flag `false`) is queued as a
   **later** microtask.

So React commits (effect #8 sees `true`) before the `finally` runs. If that render ever
moves to a scheduler task instead of a sync-lane microtask, the flag clears first and
the bug returns **silently** — the only tripwire is one live-ES e2e test.

Worth a one-line comment at the `finally` recording the dependency. Not worth
re-engineering the flag into a generation/token scheme; see 4.1 for the cheaper fix.

### 1.4 Over-suppression: all four "go home" paths checked — safe

| Path | Lands `bufferOffset: 0` | Flag can be `true`? | Scroll still reset? |
|---|---|---|---|
| New search / query / filter change (`search-store.ts:2241` set) | yes | only if a *prior* top-up is mid-flight | yes — the set bumps `_scrollReset.gen`, effect 7b resets independently of #8 |
| AI-search landing (`:2035` set) | yes | same | yes — same `_scrollReset` bump |
| Home key / logo → `resetToHome` | yes | same | yes — `reset-to-home.ts` clears focus first, so `search()` takes the no-focus branch and bumps `_scrollReset.gen` |
| Sort-around-focus fallback landings (`:1367`, `:1448`) | yes | **yes, set synchronously right after** | yes — both sets bump `_scrollReset.gen`; the inline comment at `:1462` already explains why |

Two further reasons the risk is small:

- The plain page-1 landing tops up via `_fillBufferForScrollMode`, which does **not**
  set the flag. A genuine "go home" never turns it on in the first place.
- Effect 7b (`_scrollReset`) is a fully independent reset mechanism for exactly the
  cases that matter.

**But this is belt-and-braces by accident, not by design.** The residual window is real:
a top-up from a previous sort-around-focus can stay in flight for up to its 15s deadline,
and during that window every `bufferOffset >0 → 0` transition has #8 disabled. Today
every such transition also bumps `_scrollReset.gen`, so nothing strands. That's an
invariant nobody wrote down and nobody tests.

### 1.5 Suppression is not self-healing

`prevBufferOffsetRef.current = bufferOffset` is assigned **before** the guard
(`useScrollEffects.ts:711-714`), so a wrongly-suppressed reset gets no second chance —
the transition is consumed. Correct as written (you don't want a delayed reset either),
but it means any future case where the flag is wrongly `true` is a hard failure, not a
delayed one. Reinforces 4.1.

---

## 2. Tests

### 2.1 `scrubber.spec.ts` — genuinely covers the regression ✅

`waitForScrollMode` (`helpers.ts:551`) gates on `results.length >= total`. Since
`bufferOffset + results.length ≤ total` always holds, that condition implies
`bufferOffset === 0`, i.e. the **backward walk-down has finished**. The new assertions
therefore run after the last transition — precisely where the clobber would be visible.
Not incidentally green: with the fix reverted, scroll would be at 0 with the focused
item at ~50% of a ≥50-item corpus, so both `isFocusedCellVisible()` and
`getScrollTop() > 0` fail.

One ordering caveat: `waitForFunction` observes the *store*, which updates before React
commits. The scroll read only happens after the commit because 3-4 CDP round-trips
(`getStoreState`, `assertPositionsConsistent`, `getFocusedImageId`,
`isFocusedCellVisible`) intervene, and `getScrollTop()` is last. That's incidental. If
someone reorders the assertions so the scroll read comes first, the test can go falsely
green. An explicit settle barrier (one `waitForTimeout(50)` or a rAF wait) after
`waitForScrollMode` would make the intent survive editing.

### 2.2 `isFocusedCellVisible()` — useful, but over-promises

The name and doc-comment say "visible" / "the viewport was scrolled to show it"; the
implementation is a whole-document `querySelector` presence check. With virtualizer
overscan a cell can be in the DOM and fully off-screen, so the helper is strictly weaker
than its name. It catches the gross scroll-to-0 clobber (which is what's needed here) but
would not catch "scrolled nearly right" or "target only in overscan".

Three cheap improvements, all strictly stronger, none behaviour-changing:

- Compare the cell's `getBoundingClientRect()` against the scroll container's rect
  instead of testing presence. (Or keep presence semantics and rename to
  `isFocusedCellRendered` — but the rect check is barely more code and is what both
  call sites actually mean.)
- `CSS.escape(id)` in the selector, matching `useSwipeDismiss.ts:227`.
- Fall back to `_phantomFocusImageId` when `focusedImageId` is null. In phantom mode
  (mobile default) the helper currently returns `false` unconditionally — a confusing
  failure waiting for the first phantom-path caller.

### 2.3 `manual-smoke-test.spec.ts` S8 — good change, but **not coverage of this fix**

S8 uses a single-page corpus (`total < PAGE_SIZE`), so `bufferOffset` never leaves 0,
effect #8 never fires, and `_topUpScrollModeBuffer` isn't the fill path (`search()` takes
the `focusedInFirstPage` branch → `_fillBufferForScrollMode`, which doesn't set the flag).
The added assertions are a real improvement — the test name promised a scroll the test
never checked — but they should not be counted toward `_bufferSelfCorrecting` coverage.
**All regression coverage for this fix rests on the single `scrubber.spec.ts` test.**

The `waitForTimeout(1000)` → `waitForSortAroundFocus()` swap is a strict improvement:
deterministic, and 1000ms was well under the operation's own 8s timeout.

### 2.4 Conditional assertions assert nothing when the condition is false

`if (focusedPos > 0) { expect(scrollTop).toBeGreaterThan(0) }` in both tests silently
passes when `focusedPos === 0`. A sort-direction toggle maps position *p* → *total-1-p*,
so in practice it's non-zero in both tests. Still, `expect(focusedPos).toBeGreaterThan(0)`
as an explicit precondition converts a future logic change into a failure instead of a
silent no-op. Costs nothing. (Corpus drift is not a concern — local data is fixed.)

### 2.5 No unit test

`src/stores/search-store.test.ts` already has everything needed (`MockDataSource`,
`actions()`, `waitFor`, `assertPositionsConsistent`). A deterministic test can pin the
store-side half of the contract: drive a landing at non-zero `bufferOffset` with
`total ≤ SCROLL_MODE_THRESHOLD`, assert `_bufferSelfCorrecting === true` while
`bufferOffset > 0`, and `false` after `waitFor(results.length === total)`. It can't pin
the React commit ordering from 1.3 — but that's the half that's expensive; this is the
half that's cheap.

---

## 3. Tier safety — confirmed no impact

The flag is unreachable for two-tier and seek tier: `_topUpScrollModeBuffer` returns at
`search-store.ts:1032` for `total > SCROLL_MODE_THRESHOLD` before any `setState`. Effect
#8's other consumer — the two-tier "case (b)" reset documented at
`useScrollEffects.ts:697-704` — always reads `false` there, so its behaviour is byte-identical
to before.

The one cross-tier case worth naming: a search that moves buffer tier → two-tier while a
top-up is in flight. `isStale()` (total change) breaks the loop and the `finally` clears
the flag, but asynchronously — so the new landing can commit with the flag still `true`.
Same as 1.4: safe today only because that landing bumps `_scrollReset.gen`. Same fix
closes it (4.1).

---

## 4. Recommendations, in priority order

**4.1 — Worth doing.** Add `_bufferSelfCorrecting: false` to `search()`'s two landing
sets (`search-store.ts:2035`, `:2241`). One line each. It makes "the flag never outlives
a buffer replacement" an enforced invariant instead of a coincidence, and closes 1.4,
1.5 and the tier-transition case in §3 outright. Cheaper and more durable than any
redesign of the flag.

**4.2 — Worth doing.** Unit test per 2.5.

**4.3 — Cheap.** Strengthen `isFocusedCellVisible()` per 2.2 (rect intersection,
`CSS.escape`, phantom fallback).

**4.4 — Comment only.** Record the microtask-ordering dependency at the `finally` in
`_topUpScrollModeBuffer` (§1.3). Future readers cannot infer it from the code.

**4.5 — Explicitly not worth doing.** Replacing the boolean with a generation/token
scheme, or deferring the flag clear by a task. Both add machinery to a problem that 4.1
solves in two lines, and deferring the clear would *widen* the suppression window rather
than narrow it.
