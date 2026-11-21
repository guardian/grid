# Review: panel-toggle / resize scroll-anchor fix (phantom anchor)

**Date:** 2026-08-01
**Reviewer:** fresh review agent (review-only — no source/test edits, no commit)
**Under review (uncommitted):**
- `kupua/src/lib/grid-scroll-anchor.ts` (new)
- `kupua/src/lib/grid-scroll-anchor.test.ts` (new)
- `kupua/src/components/ImageGrid.tsx` (modified)
- `kupua/e2e/local/ui-features.spec.ts` (modified)
- Context: `W-2026-08-01-panel-toggle-progressive-shift.md`

---

## Verdict: **approve with nits**

The diagnosis is right, the extraction is clean, and the change is a genuine
improvement over the pre-fix behaviour. The explicit-focus path is unchanged
and correct.

But the fix's headline claim is **overstated in one specific way**, and the
unit tests **assume** the property they are presented as proving:

> "every capture starts fresh from an accurate global position via
> `imagePositions`, so rounding never compounds across cycles"
> — `grid-scroll-anchor.ts:20-24`

Exact round-trip cancellation requires the **same** image ID to be resolved at
*both* captures of an open→close cycle. For the focused image that holds. For
the phantom anchor it does **not** hold structurally: `_viewportAnchorId` is
recomputed by `reportVisibleRange` from a **column-count-dependent** visible
midpoint (`useDataWindow.ts:439-458`, fed by `useScrollEffects.ts:354-359`), so
the anchor image identity generally *changes* when the column count changes —
i.e. between the two captures of a cycle. The unit test that claims "does not
compound drift" hard-codes a constant `virtIdx` (`grid-scroll-anchor.test.ts:66`)
and therefore proves the *math is exact given identity stability*, not that the
identity is stable.

This is a **C2 (should address before commit, but not a blocker for the
behaviour being better than before)** concern about *claims and test framing*,
not a demonstrated user-visible bug: live TEST verification and the new e2e
test both show zero residual in the configurations actually exercised. Details
and evidence in **Concern C1** below.

Everything else checks out. Unit suite: **980/980 passing** (50 files).

---

## 1. Core claim — is id-based anchoring actually the right fix?

**Yes, directionally, and the root-cause analysis is correct.**

The old code (removed in the diff, previously at the tail of `captureAnchor`)
computed `centreIdx = centreRow * cols` from the *current* `scrollTop`. That
index is a pure function of `(scrollTop, cols)` — it carries no identity across
the reflow, so the capture at `cols=A` and the capture at `cols=B` refer to
different physical images by construction. The new code resolves through
`imagePositions` (`grid-scroll-anchor.ts:40-51`), which is a stable
image→global-index map rebuilt from the buffer hits
(`search-store.ts:766` `buildPositions`), so the anchor is a real image.

The algebra behind the claim: with `capture` at `cols=A` and `restore` at
`cols=B` (`grid-scroll-anchor.ts:60-62`, `:92-95`),

$$S' = S + \left(\left\lfloor \tfrac{i}{B}\right\rfloor - \left\lfloor \tfrac{i}{A}\right\rfloor\right)H$$

and a return trip at index $j$ gives

$$S'' = S + \big(f(j) - f(i)\big)H, \qquad f(x) = \left\lfloor \tfrac{x}{A}\right\rfloor - \left\lfloor \tfrac{x}{B}\right\rfloor .$$

So the round trip is **exactly** the identity **iff $f(i) = f(j)$** — trivially
true when $i = j$ (same anchor image both times). That is precisely the
property the fix buys, and it is a real property the old code could never have.
The reasoning is sound, not merely empirical. The residual question is whether
$i = j$ actually holds — see C1.

## 2. Buffer-local vs two-tier index handling — **correct**

`resolveAnchorVirtIndex` (`grid-scroll-anchor.ts:40-51`) is a faithful
extraction of the pre-fix focused-image branch:

- `isTwoTier ? globalIdx : globalIdx - bufferOffset` (`:49`) — identical to the
  removed inline `const virtIdx = isTwoTier ? globalIdx : globalIdx - bufferOffset`.
- `globalIdx == null || globalIdx < 0` (`:47`) — identical to the removed
  `globalIdx != null && globalIdx >= 0`.
- `virtIdx >= 0 ? virtIdx : null` (`:50`) — identical to the removed
  `if (virtIdx >= 0)`.

`isTwoTierFromTotal(total)` (`ImageGrid.tsx:534`) is byte-for-byte the same
predicate as the removed inline expression (`two-tier.ts:10-13`:
`POSITION_MAP_THRESHOLD > 0 && total > SCROLL_MODE_THRESHOLD && total <= POSITION_MAP_THRESHOLD`).
Critically, it is still derived from `useSearchStore.getState()`
(`ImageGrid.tsx:531`) rather than the hook-scope `twoTier`, preserving the
stale-closure fix the comment at `:532-533` documents. Good — that was the
easiest thing to break in this refactor and it wasn't broken.

Unit coverage for both branches exists (`grid-scroll-anchor.test.ts:22-30`),
including the negative-index guard (`:32-35`).

## 3. Is `computeFallbackAnchor` still reachable in a normal flow?

**Mostly no — with one plausible exception.** Reachable when
`resolveAnchorVirtIndex` returns `null` (`ImageGrid.tsx:536-543`):

| Path | Reachable? | Assessment |
|---|---|---|
| No scroll/range reported yet | Effectively no — `handleScroll()` is fired imperatively on buffer/results change (`useScrollEffects.ts:398`), not only on user scroll, so the anchor is populated shortly after first results | fine |
| After `resetViewportAnchor()` (logo / go home) (`reset-to-home.ts:89`) | Yes, briefly, at `scrollTop ≈ 0` where the fallback is harmless | fine |
| Two-tier viewport outside buffer (skeletons) → `_viewportAnchorId = null` (`useDataWindow.ts:423`) | Yes — fast scrubber drag with a seek in flight | acceptable: a pending seek repositions anyway; single-shot, not compounding |
| **Focused image not in `imagePositions`** | **Yes** — see C2 | the one real gap |

The important structural point: the fallback is **single-shot approximate**,
and the bug only compounded because the fallback was used on *every* capture.
Reaching it occasionally does not reintroduce the compounding failure mode.

## 4. Explicit-focus path — **no behaviour change** (confirmed from the diff)

Reading `git diff HEAD -- kupua/src/components/ImageGrid.tsx` line by line, the
focused path is a pure extraction:

- Anchor resolution: same map lookup, same null/negative guards, same
  two-tier branch (see §2).
- Ratio math: removed `const rowTop = Math.floor(virtIdx / cols) * ROW_HEIGHT;`
  / `(rowTop - el.scrollTop) / el.clientHeight` is verbatim
  `captureAnchorAtIndex` (`grid-scroll-anchor.ts:60-62`).
- Restore math: removed `newRowTop` / `targetScroll` / `clamped` block is
  verbatim `restoreAnchorScrollTop` (`grid-scroll-anchor.ts:92-95`), and the
  call site (`ImageGrid.tsx:605`) keeps `virtualizer.scrollToOffset(clamped)`
  and the same `useLayoutEffect` deps `[columns, virtualizer]`.
- Capture trigger, `isFirstUpdate` mount guard (`ImageGrid.tsx:487-501`) and
  `anchorRef` consume-once semantics (`:595-599`) are untouched.

Two incidental deltas, both benign:
- `useSearchStore.getState()` + `isTwoTierFromTotal` now run unconditionally
  per capture rather than only when a focused id exists (`ImageGrid.tsx:531-534`).
  This is one `getState()` per column-count change — irrelevant.
- `SCROLL_MODE_THRESHOLD` / `POSITION_MAP_THRESHOLD` imports dropped from
  `ImageGrid.tsx`; no remaining uses in that file (typecheck + suite pass).

## 5. Tests

**Unit suite: 980 passed / 980, 50 files.** No regressions.
Command: `npm --prefix kupua test`.

### What the new unit tests do prove
- `resolveAnchorVirtIndex` mode/guard matrix — complete and correct
  (`grid-scroll-anchor.test.ts:13-36`).
- Same-columns capture/restore is exactly the identity (`:43-54`).
- Capture/restore is exactly the identity across arbitrarily many column
  changes **when the index is held constant** (`:56-81`).

### What they do not prove (and are framed as proving)
- **`:56-81` assumes its own premise.** `const virtIdx = 6850` (`:66`) never
  changes across the loop, and the comment at `:60-63` asserts this models
  "re-resolving the SAME real anchor image's virtIdx fresh at every step (as
  the fix does)". The fix does *not* guarantee that for the phantom path
  (C1). The test is a correct test of the arithmetic; its comment claims more.
- **The regression test at `:83-107` is weak.** `expect(scrollTop).not.toBe(518435)`
  (`:106`) passes on any non-zero delta — it does not assert direction,
  magnitude, or that the error *compounds* (which was the actual bug; a
  bounded one-off offset would also satisfy it). It also runs a **4-transition**
  sequence (`:95`) against the id-based test's **6-transition** sequence (`:69`),
  so the two are not the same experiment, weakening the pairing they're
  presented as. A stronger pairing: identical sequences, and assert the old
  path's `|delta|` *grows* with cycle count while the new path's stays 0.
- No coverage of `restoreAnchorScrollTop`'s clamping (`grid-scroll-anchor.ts:94`):
  every test passes `scrollHeight = 10_000_000` so neither the `0` floor nor the
  `scrollHeight - clientHeight` ceiling is ever exercised.
- `computeFallbackAnchor` tests (`:115-124`) are thin — `imageIndex % 5 === 0`
  is nearly tautological.

### E2E test (`ui-features.spec.ts:362-403`)
Good addition, correctly placed, and **not vacuous**: the Playwright viewport is
1400×900 (`playwright.config.ts:64`) → `floor(1400/280) = 5` columns
(`GRID_MIN_CELL_WIDTH = 280`, `layout.ts:23`); opening the right panel
(`DEFAULT_RIGHT_WIDTH = 320`, `panel-store.ts:52`) → 3 columns, left panel
(280) → 4. So a real reflow happens on every toggle.

Two limitations worth recording:
- **It samples state only at column-count parity.** `readAnchor()` is called
  once per full 4-toggle cycle (`:399-402`), always with both panels closed.
  It therefore cannot observe the intermediate anchor identity, which is exactly
  where C1 lives. It proves "the round trip returns exactly", which is the
  user-visible property — fine as an acceptance test, but it should not be
  read as evidence the anchor identity is stable mid-cycle.
- **Single tier.** The local corpus exercises one tier only; two-tier and
  non-zero `bufferOffset` resolution is covered only by unit tests
  (`grid-scroll-anchor.test.ts:22-30`) and the manual live-TEST run recorded
  in the findings doc. Acceptable, but the "verified in all 3 tiers" claim
  rests on manual verification, not automation.
- `expect(initial.anchorId).not.toBeNull()` (`:385`) correctly makes the test
  fail loudly rather than silently pass if `__kupua_getViewportAnchorId__` is
  absent (it's `import.meta.env.DEV`-gated, `useDataWindow.ts:545-548`). Good.

**E2E not re-run by this review.** Per project convention it needs port 3000
free and explicit go-ahead; I did not assume the port was free and did not ask
to interrupt. The diff is behaviourally conservative on the focus path, so the
main e2e risk is the new test itself.

---

## Concerns

### C1 — The "no compounding" guarantee is not structurally enforced for the phantom path
**Cites:** `grid-scroll-anchor.ts:20-24` (claim), `grid-scroll-anchor.test.ts:60-66`
(test premise), `useDataWindow.ts:439-458` (anchor recomputation),
`useScrollEffects.ts:354-359` (column-scaled range), `useScrollEffects.ts:379,398`
(when it fires).

`_viewportAnchorId` is set to `results[round((startIndex + endIndex) / 2)]`
(`useDataWindow.ts:447-457`), where the range is `[startRow*cols, (endRow+1)*cols - 1]`
(`useScrollEffects.ts:355-358`). Both endpoints scale with `cols`, so the
midpoint **image** changes when the column count changes. Between panel-open and
panel-close, `restoreAnchorScrollTop` moves `scrollTop` → scroll event → 
`handleScroll` (`useScrollEffects.ts:379`) → `reportVisibleRange` → **new
`_viewportAnchorId`**. So the close-capture generally uses a *different* image
than the open-capture, and per §1 exactness requires $f(i) = f(j)$, which is
only guaranteed when $i = j$.

The findings doc is actually careful here — it claims identity/scrollTop
"identical on every **return to the same column count**", not mid-cycle. The
module doc comment (`grid-scroll-anchor.ts:20-24`) and the unit-test comment
(`:60-63`) are the places that overstate.

**Evidence (directional, from a standalone simulation — not run against the app):**
modelling TanStack's visible-row range, the column-scaled flat range, the
midpoint anchor, and `captureAnchorAtIndex`/`restoreAnchorScrollTop`, sweeping
`clientHeight ∈ {500,700,813,900,1000,1200}`, `cols ∈ 2..7` pairs and ~90k
starting `scrollTop` values:
- ~42% of configurations show a **non-zero residual on the first A→B→A cycle**,
  up to ~3 rows;
- the residual **converges to a fixed point** within a few cycles rather than
  growing (delta at cycle 30 == delta at cycle 60 in every sampled config);
- the specific configuration used in the tests (`cols 5↔4`, `H≈300`,
  `C=813`) is one of the zero-residual ones, as are `4↔5` and `6↔4` — which is
  consistent with the clean live TEST results.

**Caveat, stated plainly so this isn't over-read:** the same simplified model
also fails to reproduce the *old* code's unbounded per-cycle drift (it converges
too), so the model is missing something real about the app (fractional
heights, virtualizer measurement, timing of range reports). It is therefore
**not** evidence that the fix is inadequate — only evidence that "never
compounds" is stronger than what the code guarantees, and that the property
depends on a value the module does not control.

**What I'd want changed:** the claims, not the code. Soften
`grid-scroll-anchor.ts:20-24` and `grid-scroll-anchor.test.ts:60-63` to state
the actual guarantee — *exact* for a stable anchor identity (always true for
explicit focus), *approximate but non-accumulating in practice* for the phantom
anchor, because `_viewportAnchorId` is re-derived from a column-dependent
midpoint. If exactness for the phantom path is wanted, it needs the anchor ID
to be pinned for the duration of the reflow rather than re-read at each capture
— but that's a design change, and I'm explicitly not proposing an
implementation here.

### C2 — `??` means an unresolvable focused ID never falls back to the phantom anchor
**Cites:** `ImageGrid.tsx:535-543`, `grid-scroll-anchor.ts:47`.

```ts
const fid = focusedImageIdRef.current ?? getViewportAnchorId();
const virtIdx = resolveAnchorVirtIndex(fid, imagePositions, bufferOffset, isTwoTier);
if (virtIdx != null) { ... }
// else → computeFallbackAnchor
```

`??` only substitutes when `focusedImageIdRef.current` is `null`/`undefined` —
**not** when it is set but fails to resolve (absent from `imagePositions`, or
negative buffer-local index, `grid-scroll-anchor.ts:47-50`). That happens after
a seek/scrubber drag that moves the buffer away from a still-focused image
(`imagePositions` is rebuilt per buffer, `search-store.ts:1680,3610`). In that
state the phantom anchor is often still valid, but the code skips it and goes
straight to the synthetic fallback — the exact path the fix set out to avoid.

This is **not a regression** (pre-fix behaviour was the same: the old code fell
through to the synthetic fallback in that case), so it doesn't block the commit.
But since the fix's whole thesis is "prefer a real, resolvable ID", leaving a
plausible flow that skips the second real candidate is an inconsistency worth
noting explicitly rather than leaving implicit.

### C3 — Regression test doesn't distinguish "wrong" from "compounding"
**Cites:** `grid-scroll-anchor.test.ts:83-107`, specifically `:106`.

Covered in §5. `not.toBe(518435)` would also pass if the old code produced a
single bounded 1-row offset that then stabilised — which is *not* the bug that
was reported (progressive, compounding shift). As written, the "documents the
bug it fixes" claim in the findings doc is weaker than stated. Also note the
sequence-length mismatch (`:69` 6 transitions vs `:95` 4).

---

## Nits

- **N1** — `grid-scroll-anchor.ts:62,81` divide by `clientHeight` with no
  zero guard; `restoreAnchorScrollTop:93-95` then produces `NaN`, which
  `Math.max/Math.min` propagate into `virtualizer.scrollToOffset(NaN)`
  (`ImageGrid.tsx:605-606`). Reachable in principle if the grid is measured at
  height 0 mid panel-transition (width 0 → `cols = Math.max(1, 0) = 1`, i.e. a
  column-count *change*, `ImageGrid.tsx:490`). **Pre-existing** — the removed
  inline code had the identical division — but extracting to a pure, tested
  module was the natural moment to guard it, and the tests never pass
  `clientHeight = 0`.
- **N2** — `resolveAnchorVirtIndex` has no *upper* bound check, unlike the
  otherwise-parallel `findImageIndex` (`useDataWindow.ts:494-496`, which rejects
  `localIdx >= resultsLen`). Safe today only because `imagePositions` is
  rebuilt exclusively from buffer-resident hits (`buildPositions`,
  `search-store.ts:766`), so the invariant holds implicitly. Worth a one-line
  comment given the two functions now sit side by side doing the same
  conversion with different guards.
- **N3** — `ImageGrid.tsx:530` still declares the return type inline
  (`{ imageIndex: number; viewportRatio: number } | null`) and `anchorRef`
  (`:469-474`) re-declares the same shape, while `CapturedAnchor`
  (`grid-scroll-anchor.ts:26-31`) now exists and is exported. Three copies of
  one type.
- **N4** — The `captureAnchor` doc comment (`ImageGrid.tsx:519-528`) and the
  section header at `:454-459` now disagree: the header still says the anchor is
  "the focused image (if any), otherwise the image nearest the viewport centre"
  computed inline; that's stale relative to the three-tier preference the fix
  introduced.

---

## Summary

| Question asked | Answer |
|---|---|
| 1. Core claim correct & soundly reasoned? | Correct and soundly reasoned **for a stable anchor identity**; the "never compounds" phrasing overstates what the phantom path guarantees (C1) |
| 2. Buffer-local vs two-tier handled like the focused branch? | Yes — verbatim extraction, incl. the stale-closure `getState()` guard (§2) |
| 3. Can the old heuristic still fire in a normal flow? | Only transiently (skeleton zone, post-reset) — plus one real gap when a focused ID can't resolve (C2). Single-shot, non-compounding |
| 4. Explicit-focus behaviour change? | None — confirmed line-by-line from the diff (§4) |
| 5. Unit suite | 980/980 passing, no regressions |
| 6. E2E | Not run (port 3000 convention; not requested/confirmed) |

Approve with nits. The concerns are about **claim strength and test framing**,
plus one pre-existing inconsistency (C2) that the fix's own thesis argues
against. None of them are grounds to hold the commit, but C1's wording should
be corrected before it becomes load-bearing documentation for a future agent.
