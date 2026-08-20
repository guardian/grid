# Review: `_offsetCorrectionGeneration` (Fix A) + opinion on Fix B

**Date:** 2026-08-20
**Reviewer:** fresh agent (review-only; no code changed by this review)
**Subject:** the uncommitted working-tree change fixing "focused cell climbs one
row per sort toggle" in buffer tier / deep-seek.
**Context:** `worklog-current.md` (root-cause investigation), `AGENTS.md`.

This document has two independent parts:

- **Part 1** — review of the uncommitted fix (Fix A).
- **Part 2** — opinion on the deferred Fix B, written as a standalone
  recommendation. Part 2 does not depend on Part 1's findings being actioned.

---

## Part 1 — Review of Fix A (uncommitted)

### 1.1 What the change is

Five source/test files (the other six modified files are artifacts — see §1.7):

| File | Change |
|---|---|
| [kupua/src/stores/search-store.ts](kupua/src/stores/search-store.ts#L242-L254) | New store field `_offsetCorrectionGeneration`, initialised at [line 1885](kupua/src/stores/search-store.ts#L1885) |
| [kupua/src/stores/search-store.ts](kupua/src/stores/search-store.ts#L1790) | Bumped inside the async `countBefore` correction's `set()` |
| [kupua/src/hooks/useScrollEffects.ts](kupua/src/hooks/useScrollEffects.ts#L741-L742) | Effect #9 subscribes to it |
| [kupua/src/hooks/useScrollEffects.ts](kupua/src/hooks/useScrollEffects.ts#L770-L791) | `scrollAppliedResultsRef` (results-identity proxy) replaced by `handledCorrectionGenRef` (explicit signal) |
| [kupua/src/stores/search-store-extended.test.ts](kupua/src/stores/search-store-extended.test.ts#L483) | 2 new unit tests |
| [kupua/e2e/local/scrubber.spec.ts](kupua/e2e/local/scrubber.spec.ts#L2763) | 5 new e2e tests (parameterised loop) |
| [kupua/e2e/shared/helpers.ts](kupua/e2e/shared/helpers.ts#L211) | New `getFocusedCellTop()` helper |

Net source diff: **+14 lines in the store, +58/−29 in the hook.** For a fix to a
bug of this subtlety, that is an appropriately small footprint.

### 1.2 Verdict

**The fix is correct, well-placed, and is a genuine net simplification.** It
replaces a fragile proxy signal with an explicit one and deletes more
conditional logic than it adds. I would sign it off after two blocking items
(§1.6 B1, B2) are resolved, and I would strongly encourage one non-blocking
cleanup (§1.4 R9) that is arguably worth more than the fix itself.

### 1.3 Correctness — store side

**R1 — Atomicity is right. (Good, no action.)**
The bump at [search-store.ts:1790](kupua/src/stores/search-store.ts#L1790) is
inside the *same* `set()` that writes `results`, `startCursor`, `bufferOffset`
and `imagePositions`. Zustand applies it as one update, so Effect #9 can never
observe a bumped counter against un-corrected positions. If the bump had been a
separate `set()` — even the very next line — there would be a one-render window
where the effect re-scrolls using stale `imagePositions`. It isn't. Good.

**R2 — Single bump site is correct; nothing else needs one. (Verified.)**
`offsetIsEstimate` is set in exactly one place
([search-store.ts:1589](kupua/src/stores/search-store.ts#L1589)) and consumed in
exactly one place ([line 1736](kupua/src/stores/search-store.ts#L1736)). No
other code path performs a trim-after-render:

- The two-tier branch ([lines 1562-1580](kupua/src/stores/search-store.ts#L1562-L1580))
  awaits `countBefore` synchronously — the offset is exact before anything
  renders.
- `_loadBufferAroundImage` and `seek()` align columns *before* committing.
- `restoreAroundCursor` is synchronous by construction.

So one bump site is complete coverage. Confirmed by grep: the field appears in
exactly 3 source locations.

**R3 — The bump is unconditional, including when `trimCount === 0`.**
*(Design note, no change requested — but the comment should say why.)*
When no trim occurs, `correctedResults === state.results`, the focused item's
buffer-local index is unchanged, and the re-fire recomputes an identical scroll
offset. That is a wasted layout-effect pass, not a bug. I'd keep it
unconditional — gating on `trimCount > 0` would encode an assumption about
which downstream consumers care, and the current form is the more defensive
choice. But the comment at
[search-store.ts:1788-1789](kupua/src/stores/search-store.ts#L1788-L1789)
currently reads as though a trim is implied; one clause explaining "bumped even
without a trim, because `bufferOffset` moving is itself observable" would stop
a future reader from 'optimising' it away.

**Status: Done.** The comment at the `_offsetCorrectionGeneration` bump site
in `search-store.ts` now explains this exact point.

**R4 — `effectiveTotal` is trustworthy here. (Verified, relevant to Part 2.)**
`total` is only ever written from a response that requested
`track_total_hits: true` — i.e. the initial `search()`
([es-adapter.ts:974](kupua/src/dal/es-adapter.ts#L974),
[types.ts:80-84](kupua/src/dal/types.ts#L80-L84)). `_loadBufferAroundImage`
returns a `total` derived from an untracked extend response, but the store
deliberately does *not* use it — [line 1700](kupua/src/stores/search-store.ts#L1700)
writes `fallbackFirstPage?.total ?? get().total`. Tier routing therefore never
runs on a lower-bounded count. No action for Fix A; this is load-bearing for
Fix B (see §2.3).

### 1.4 Correctness — effect side

**R5 — The `useLayoutEffect` placement is the reason this works. (Good.)**
This is the crux and it deserves calling out explicitly, because it is what
makes the fix invisible rather than janky. The trim shortens `results` from the
front, which shifts the focused cell up by `trimCount / columns` rows *with no
scroll change* — content moving under a stationary viewport. Because the
compensating scroll runs in a `useLayoutEffect` keyed on
`offsetCorrectionGeneration`, it executes in the **same commit, before paint**.
The user never sees an intermediate frame. Had this been a `useEffect` or a
`requestAnimationFrame`, the fix would have traded a silent drift for a visible
one-row jump. It isn't. This should be stated in the code comment — it is the
non-obvious property a future refactor is most likely to destroy.

**Status: Not done.** No comment stating the `useLayoutEffect`/before-paint
significance was added. Still a valid, low-cost improvement for whoever next
touches this effect.

**R6 — Removing `scrollAppliedResultsRef` is correct, and it was already dead
code. (Good — but the safety argument should be written down.)**
The removed guard existed to block re-fires caused by buffer extends. Post the
23 May 2026 perf fix, extends **cannot re-run this effect at all**:
`findImageIndex` is frozen with `[]` deps and reads the store imperatively
([useDataWindow.ts:484-501](kupua/src/hooks/useDataWindow.ts#L484-L501), with an
explicit comment naming this very effect), and the remaining deps
(`virtualizer`, `parentRef`) are stable identities. So the effect's dependency
array only changes when a generation counter changes, and the old branch was
unreachable. The replacement comment at
[useScrollEffects.ts:764-769](kupua/src/hooks/useScrollEffects.ts#L764-L769)
gets this right.

However — the *entire* safety argument for this fix now rests on
`virtualizer`'s identity being stable across renders. That is true for TanStack
Virtual, but it is an external library invariant, asserted nowhere, and if it
ever changes the effect starts re-firing on every render with
`handledCorrectionGenRef` as the only thing standing between the user and a
scroll teleport. Worth one line in the dep-array comment: *"deps are
generation-only in practice — `findImageIndex` is `[]`-frozen and `virtualizer`
is a stable instance."*

**Status: Done.** That exact line (and more) was added to the
`handledCorrectionGenRef` comment block in `useScrollEffects.ts`.

**R7 — Latent: a bailed-out correction is marked handled and never retried.
(Low severity, no action.)**
[Line 791](kupua/src/hooks/useScrollEffects.ts#L791) assigns
`handledCorrectionGenRef.current` *before* the early returns at
[lines 794-796](kupua/src/hooks/useScrollEffects.ts#L794-L796) (`!id`,
`idx < 0`). If a correction's re-fire bails, that correction is consumed and no
later pass will re-apply it. The old code's `null` sentinel would have allowed a
retry. In practice unreachable: `alignBufferStart` is explicitly bounded by
`buf.targetLocalIndex` so the focused item is never trimmed away, and
`imagePositions` is rebuilt in the same `set()`. Flagging for the record, not
asking for a change — adding a retry path would reintroduce exactly the
complexity this fix removed.

**R8 — Known residual (snap-back) is correctly scoped out. (Agree.)**
[Line 774](kupua/src/hooks/useScrollEffects.ts#L774) hard-blocks the effect for
the whole generation once the arrow snap-back delta is consumed, so a
correction landing after that is silently dropped. The worklog already
identifies this. I agree with deferring: the delta math is immune to the
estimate error (it cancels in `targetGlobalIdx - bufferOffset`), the window is
narrow, and it was never reproduced live. Worth noting that this fix makes it
*cheaper* to address later — the condition becomes "allow through if
`handledCorrectionGenRef.current !== offsetCorrectionGeneration`" — but doing so
changes snap-back semantics and belongs in its own change with its own repro.

**R9 — The misleading "deep-seek only" comments should be fixed. (Strongly
recommended, not blocking.)**
This is the highest-value item in the review and it is not a code change.
The bug survived undetected because three comments assert that the estimate
path is deep-seek-only, when it also covers buffer tier (both tiers lack a
position map):

- [search-store.ts:1512](kupua/src/stores/search-store.ts#L1512) — *"C. No position map (>65k deep-seek mode)"*
- [search-store.ts:1581](kupua/src/stores/search-store.ts#L1581) — *"No position map → >65k results (deep-seek mode)"*
- [useScrollEffects.ts:750-751](kupua/src/hooks/useScrollEffects.ts#L750-L751) — *"In deep-seek mode (>65k), `_findAndFocusImage` uses a placeholder offset"* — **still present in the new code**, immediately above the ref the fix introduces.

The fix's own new comments get it right (they say "deep-seek/buffer-tier"), but
leaving the old ones in place means the next reader gets contradictory
statements a few lines apart. Fixing three comments costs minutes and removes
the exact trap that cost this investigation. Do it in this commit.

**Status: Done.** All three comments corrected in the committed fix
(commit `dd678a9de`).

### 1.5 Test review

**T1 — BLOCKING: the e2e tests probably do not exercise the fix.**
This is the most serious finding. [scrubber.spec.ts:2782](kupua/e2e/local/scrubber.spec.ts#L2782)
waits via `waitForSortAroundFocus`, which resolves on
`sortAroundFocusStatus === null && !loading`
([helpers.ts:887-899](kupua/e2e/shared/helpers.ts#L887-L899)). That status is
cleared in the `set()` at [search-store.ts:1687-1712](kupua/src/stores/search-store.ts#L1687-L1712),
which happens **before** `countBefore` is even called
([line 1737](kupua/src/stores/search-store.ts#L1737)). The test then waits two
`requestAnimationFrame`s — roughly 32ms — for a network round trip.

The failure mode is not a flake; it is worse. If the assertion runs before the
correction lands, it measures the *pre-correction* position, which is the
expected value — **the test passes green without ever exercising the code path
it exists to guard.** The unit test immediately above it even documents this
exact hazard in its own comment ("the status flag clears before the correction
resolves") and correctly waits on `_offsetCorrectionGeneration` instead; the
e2e test does not.

Two required actions:

1. Add a `waitForOffsetCorrection(previousGen)` helper that polls
   `__kupua_store__.getState()._offsetCorrectionGeneration` for a change, and
   use it between the toggle and the measurement. Deterministic; ~10 lines.
2. **Prove RED.** Stash only `search-store.ts` and `useScrollEffects.ts` and
   confirm these 5 tests fail. If they still pass, the test is worthless
   regardless of how it waits. Per the project's own fix-discipline, a
   failing-first test that was never observed failing is not a test.

**Status: Done.** `waitForOffsetCorrection()` added to `helpers.ts` and used
in the test. RED was confirmed (a stash accidentally left the fix reverted
mid-session; the test failed as expected, then passed again once restored).

**T2 — The e2e assertion can only see drift that crosses a row boundary.
(Medium; worth strengthening.)**
`getFocusedCellTop` measures vertical offset only. A trim shifts the focused
item's local index by 1-3, which changes its *column* always but its *row* only
sometimes. The 5-index sweep is a sensible mitigation and the rationale is
documented in the test comment, but it is probabilistic. Adding the cell's
`left` offset to the helper's return (or asserting on
`imagePositions.get(id) - bufferOffset` directly) would make the test detect any
uncompensated index shift rather than the subset that happens to cross a row.
Cheap, and it makes the sweep less load-bearing.

**Status: Done.** `getFocusedCellLeft()` added and asserted on the final leg
of the toggle sequence (where column is expected to match exactly).

**T3 — Suite cost. (Medium; worth trimming.)**
Five tests × (`gotoWithParams` + `seekTo` + 2 sort toggles, each toggle carrying
a 500ms fixed wait inside `toggleSortDirection` plus a 15s-budget wait) is
material additive runtime on a habitual suite already at ~9 minutes for 244
tests. Suggest determining empirically which of `[2, 5, 9, 14, 20]` actually
produce `trimCount > 0` (the `devLog` at
[search-store.ts:1783](kupua/src/stores/search-store.ts#L1783) prints it) and
keeping those plus one control. Three tests that are known to hit the path beat
five chosen by hope.

**Status: Done.** Pruned to `[2, 5, 9]`.

**T4 — BLOCKING (for debuggability): geometry leak in the new unit test.**
[search-store-extended.test.ts:508](kupua/src/stores/search-store-extended.test.ts#L508)
resets `registerScrollGeometry` as the last statement of the test body, with no
`afterEach`. `registerScrollGeometry` is module-global. If the test throws — and
it contains two `waitFor` calls with 5s timeouts, so it can — every subsequent
test in the file runs with `columns: 4` instead of `columns: 1`, producing a
cascade of unrelated failures in `density-switch`, `cursor integrity`,
`large-scale consistency`, `ES request count` and the null-zone block. The
sibling describe at
[line 1274-1276](kupua/src/stores/search-store-extended.test.ts#L1274-L1276)
already does this correctly with `afterEach`. Copy that pattern. This is a
one-line change and it prevents a genuinely miserable debugging session.

**Status: Done.** `afterEach` added to the new describe block.

**T5 — Unit test title overclaims. (Low.)**
`"bumps when the async correction trims results for column alignment"` — the
assertion only proves the counter moved, and the bump is unconditional (R3), so
the test passes identically with `trimCount === 0`. It relies on a comment
pointing at a *different* test to establish that a trim occurred. Either assert
the trim locally (capture `state().results.length` before/after) or rename to
`"bumps when the async correction lands"`. I'd do both: rename, and add a
separate assertion on the trim if the trim is what you care about.

**Status: Partially done.** Renamed to `"bumps when the async correction
lands (whether or not it needs a trim)"`. No separate trim-specific
assertion was added.

**T6 — Second unit test is near-tautological but worth keeping. (Low.)**
The counter is only written inside `_findAndFocusImage`, so extends
structurally cannot bump it. That makes the test weak *today* but it is a cheap
pin on the 23 May 2026 perf guarantee, which is exactly the kind of invariant
that erodes silently. Keep it. One note: it depends on the file-level
`beforeEach` re-creating `mock` at 10,000 docs
([line 74-75](kupua/src/stores/search-store-extended.test.ts#L74-L75)) after the
preceding test reassigns it to 500 — correct, but non-obvious enough to deserve
an inline comment, since `seek(5000)` would silently misbehave on a 500-doc
corpus.

**T7 — Counter reset missing from `beforeEach`. (Low.)**
The file-level `beforeEach` resets `sortAroundFocusGeneration`, `_seekGeneration`
and `_prependGeneration` but not `_offsetCorrectionGeneration`
([lines 74-104](kupua/src/stores/search-store-extended.test.ts#L74-L104)). Both
new tests defend against this by capturing `genBefore`, so nothing is broken —
but the omission is an inconsistency that will bite whoever writes the third
test. Add it.

**Status: Done.**

**T8 — The effect side has no direct test coverage.**
Roughly 80% of the behavioural change lives in Effect #9, and the only coverage
for it is the e2e suite. Combined with T1, that currently means the effect may
have **zero** effective coverage. This is the single strongest reason T1 is
blocking rather than advisory.

**T9 — Focus mode is not pinned in the e2e test. (Low.)**
The test asserts on `getFocusedImageId()` (explicit focus only) while
`getFocusedCellTop()` falls back to `_phantomFocusImageId`. An
`ensureExplicitMode()` call before `gotoWithParams` removes the dependency on
ambient prefs. One line.

**Status: Done.**

**T10 — `getFocusedCellTop` duplicates most of `isFocusedCellVisible`.
(No action.)** ~80% overlap with
[helpers.ts:194-209](kupua/e2e/shared/helpers.ts#L194-L209). For test helpers,
obvious-and-duplicated beats clever-and-shared. Leave it.

### 1.6 Pre-commit checklist — final status

All blocking and strongly-recommended items were completed before commit
`dd678a9de`. Full detail is inline on each R/T item above; summary:

Blocking:

- **B1** ✅ Done — `waitForOffsetCorrection()` added; RED observed (see T1).
- **B2** ✅ Done — `afterEach` added (see T4).

Strongly recommended:

- **B3** ✅ Done — three comments corrected (see R9).
- **B4** ✅ Done — unit: **1134/1134** pass. E2E: **247/247** pass (full
  suite, run after all amendments below, not just at review time — including
  the 3-index-pruned regression tests).
- **B5** ✅ Done — `AGENTS.md` updated to 1134 unit / 247 e2e; `changelog.md`
  entry appended (20 August 2026).

Optional — all actioned except R5: T2 ✅, T3 ✅, T5 ✅ (partial), T7 ✅,
T9 ✅, R3 ✅, R6 ✅. **R5 not actioned** — still valid, low-cost, left for
whoever next touches this effect.

### 1.7 Working-tree hygiene

Six files in the diff are not part of the fix:

- `e2e-perf/results/audit-log.{json,md}`, `perceived-log.{js,json,md}` — perf
  baseline artifacts. The worklog itself records that **temporary `devLog`
  instrumentation was still present during that run**, and that `devLog` is only
  dead-code-eliminated in prod builds, not the dev server the perf harness
  drives. So PP3/PP4 in this baseline are knowingly suspect. Committing a
  suspect baseline inside a bug-fix commit means someone will later diff against
  it and draw a wrong conclusion. Either drop these from the commit, or commit
  them separately with the caveat in the message.
- `exploration/docs/worklog-current.md` — per directive, its content moves to
  `changelog.md` when the task is declared done, and the file starts fresh.

Recommended staging: one commit for the fix + tests + comment cleanup; a second
(or none) for the perf artifacts.

**Resolution:** committed as one commit (`dd678a9de`); perf artifacts included
with the caveat above (explicit user decision — accepted as a known,
non-pristine baseline rather than re-run). `worklog-current.md` was cleared
and this review archived to `zz Archive/` in a follow-up amend to the same
commit, per explicit user decision (2026-08-20).

### 1.8 Things this fix does not do (correctly)

- Does not touch the deep-seek `countBefore` latency (that's Part 2).
- Does not resolve the snap-back residual (R8) — deliberately.
- Does not alter `restoreAroundCursor` or the two-tier path, both of which are
  immune by construction.
- Does not reintroduce per-extend effect re-fires — verified by R6 and pinned by
  the second unit test.

---

## Part 2 — Opinion on Fix B

> **B, as described in the worklog:** route buffer tier through a *synchronous*
> `countBefore` (as the two-tier branch already does) instead of the
> estimate-then-correct-async path, removing buffer tier from the
> `offsetIsEstimate` branch entirely.

### 2.1 Verdict

**Do it — but not framed as described, not as a replacement for A, and not
next.** My recommendation is: **yes, with three amendments, and ranked below
two cheaper items.**

### 2.2 Where I agree with the worklog

- The estimate-then-correct window is genuinely fragile. Fix A is
  *compensation*; B is *elimination*. Any future consumer that renders from
  `results`/`bufferOffset` between the estimate and the correction inherits this
  same class of bug and will need its own compensation. There is already
  evidence this window is load-bearing and delicate: the correction handler has
  to explicitly defer `_topUpScrollModeBuffer` until after it lands, because an
  early `extendForward` would replace `results` and permanently disable the
  correction ([search-store.ts:1799-1806](kupua/src/stores/search-store.ts#L1799-L1806)).
  That is a comment explaining why an ordering hazard doesn't fire. Removing the
  window removes the hazard.
- The cost premise is sound. The synchronous branch already exists for ≤65k and
  is documented as "~10ms"; buffer tier means total ≤ 1,000, a strictly smaller
  case.
- Deferring it out of A's changeset was the right call. Bundling a tier-routing
  change with a scroll-compensation fix would have made both harder to review
  and impossible to bisect.

### 2.3 Amendment 1 — do not "extend the condition"; add a sibling branch

This is my main objection and it is about the *shape* of the change, not the
idea.

The current condition is:

```ts
POSITION_MAP_THRESHOLD > 0 &&
effectiveTotal > SCROLL_MODE_THRESHOLD &&
effectiveTotal <= POSITION_MAP_THRESHOLD
```

"Extend it to also cover `effectiveTotal <= SCROLL_MODE_THRESHOLD`" collapses to
`POSITION_MAP_THRESHOLD > 0 && effectiveTotal <= POSITION_MAP_THRESHOLD`. That
inherits the `POSITION_MAP_THRESHOLD > 0` guard, which exists so two-tier can be
disabled via `VITE_POSITION_MAP_THRESHOLD=0`
([tuning.ts:101-102](kupua/src/constants/tuning.ts#L101-L102)). In that
configuration, buffer tier would silently fall back to the estimate path — the
bug returns, in precisely the config where nobody is looking for it, with no
test covering it.

**Amendment:** add a separate branch keyed only on the buffer-tier condition,
independent of `POSITION_MAP_THRESHOLD`:

```ts
} else if (effectiveTotal > 0 && effectiveTotal <= SCROLL_MODE_THRESHOLD) {
  // Buffer tier: countBefore is cheap (≤1k results) and exact — no reason to
  // estimate. Deliberately independent of POSITION_MAP_THRESHOLD.
  offset = await dataSource.countBefore(fp, imageSortValues, combinedSignal);
}
```

Two clauses, two reasons, no coupling. The worklog is right that "getting the
boundary wrong turns a subtle drift bug into a multi-second UI freeze" — the way
to not get it wrong is to stop the two thresholds sharing a condition, not to
merge them more tightly.

### 2.4 Amendment 2 — the safety precondition is already satisfied; say so

The obvious way B goes catastrophically wrong is `effectiveTotal` under-reporting
a huge result set as ≤1,000, routing a 9M-doc corpus into a synchronous
`countBefore`. I checked this (§1.4 R4): `total` is only ever written from a
`track_total_hits: true` response, and the untracked `total` returned by
`_loadBufferAroundImage` is deliberately discarded at
[search-store.ts:1700](kupua/src/stores/search-store.ts#L1700). **The precondition
holds today.** B is therefore a ~20-line change, not a no-go.

But it holds by convention, not by construction, and B makes it load-bearing for
a 2-5 second freeze rather than a wrong scrubber thumb. **Amendment:** land B
with a unit test that pins the routing directly — spy on `countBefore` and
assert it is called synchronously (before the buffer load resolves) for a ≤1k
corpus, and *not* called synchronously for a >65k corpus — plus a case with
`POSITION_MAP_THRESHOLD = 0`. Assert on the spy, not on resulting state; state
assertions can't distinguish "synchronous" from "corrected fast".

### 2.5 Amendment 3 — correct the perf framing before anyone relies on it

The worklog says B's perf effect is *"likely neutral-to-good — trades one small
synchronous wait for skipping the later async-correction round-trip that happens
anyway today."*

I don't think that's right, and it matters because it is the sentence someone
will quote when approving the change. The async correction is **off** the
critical path by construction: today the buffer loads and paints immediately,
and the correction lands later. B moves that round trip **onto** the critical
path, in front of `_loadBufferAroundImage`. So B is a straight added latency on
the sort-around-focus hot path — small, but not a wash.

At ~10ms that is still very probably worth paying for the robustness. But this
is exactly the tier where PP3/PP4 live, and the project's own directive says
perceived-perf runs are suggested after touching sort-around-focus paths.
**Amendment:** measure PP3/PP4 before and after on the 958-result buffer-tier
corpus. If it's in the noise, land it. If it isn't, B stops being obviously
worth it. Note also that the *existing* baseline is contaminated (§1.7), so a
clean before-run is needed regardless.

### 2.6 The framing correction that matters most: B does not supersede A

If anyone is holding "B is the real fix, A is a workaround", that is wrong and
worth stating loudly.

Deep-seek (>65k) keeps the estimate path permanently and by design — a 2-5s
blocking `countBefore` is not negotiable. The uncompensated-trim bug is
therefore **real and unfixed in deep-seek without A**. A is the only fix for
that tier and is load-bearing forever. B narrows A's blast radius from two tiers
to one; it does not make A removable, and no part of A should be reverted after
B lands.

Restated: after A, the user-visible bug is **already fixed everywhere**. B
delivers no new bug fix. Its actual deliverables are (a) exact scrubber thumb
and position counter immediately rather than one round trip later in buffer
tier, and (b) removal of a fragile code path. That's a robustness refactor, and
it should be judged and prioritised as one.

### 2.7 The best argument for B, which the worklog doesn't make

If buffer tier leaves the estimate path, then `offsetIsEstimate === true`
becomes *exactly* synonymous with "deep-seek, >65k, no position map". At that
point every comment flagged in R9 becomes true again, and the code becomes
self-describing rather than actively misleading.

Given that the misleading comment is the documented reason this bug survived
undetected across four call sites, "makes the existing comments correct" is a
stronger justification than either the perf argument or the robustness argument.
I'd lead with it.

### 2.8 Reasons I would abandon B

I'd drop it if any of these turn out true:

- PP3/PP4 regress measurably on the buffer-tier corpus (§2.5).
- The `track_total_hits` invariant turns out to be violable by some path I
  didn't check (§2.4) — then the freeze risk outweighs the tidiness.
- The routing test can't be written to distinguish synchronous from
  fast-corrected. If the invariant can't be pinned, don't create a
  multi-second-freeze failure mode that depends on it.

### 2.9 Priority

Ranked by value-per-unit-risk, B is third:

1. **R9 — fix the three misleading comments.** Minutes of work; directly
   addresses the documented cause of the original misdiagnosis. Do it in A's
   commit.
2. **R8 — the snap-back residual.** Now cheap thanks to A's explicit signal, and
   it's a real (if narrow) hole rather than a refactor. Needs its own repro
   first.
3. **B.** Worth doing. Not urgent, because after A it fixes nothing
   user-visible. Own session, own PR, own tests, scoped as a sibling branch,
   gated on a PP3/PP4 measurement.

### 2.10 Addendum — decision and preserved context (2026-08-20)

**Decision: deferred.** Discussed directly with the user after this review was
read. Given B fixes no remaining user-visible bug (§2.6) and its perf effect
is a net added cost rather than a wash (§2.5), the user chose not to pursue it
now. This file is archived rather than deleted specifically so the reasoning
and amendments above survive if it's ever picked up — considered unlikely.

**Context folded in from `worklog-current.md` before it was cleared** (this
consolidates for a reader who never saw the worklog; it does not materially
change §2.1-§2.9):

- Fix A landed as commit `dd678a9de` (2026-08-20). Verified: unit 1134/1134,
  e2e 247/247, including the new regression tests at `scrubber.spec.ts`
  (search `"Scroll mode — buffer fill"` → `"sort toggle preserves focused
  cell row position"`).
- **Line-number references throughout this document are pre-commit and will
  have drifted further with later edits.** Re-locate by symbol name
  (`offsetIsEstimate`, `_findAndFocusImage`, `handledCorrectionGenRef`,
  `_offsetCorrectionGeneration`) rather than trusting any `#L123` anchor above.
- The R8 snap-back residual (§1.4) is separate from B and was NOT rolled into
  it — do not conflate the two if either is ever picked up. It remains open,
  narrow, and unreproduced live.
- If B is ever attempted: Amendment 1 (§2.3, sibling branch, not an extended
  condition) and Amendment 2 (§2.4, spy-based synchronicity test including a
  `POSITION_MAP_THRESHOLD=0` case) are not optional refinements — treat them
  as required, not "nice to have".

---

## Appendix — verification performed for this review

Read and cross-checked: the full working-tree diff for `src/` and `e2e/`;
`_findAndFocusImage` (search-store.ts 1510-1830); Effect #9 in full
(useScrollEffects.ts 730-865); `findImageIndex` (useDataWindow.ts 478-501);
`countBefore` (es-adapter.ts 1282+) and its `track_total_hits` usage;
`SCROLL_MODE_THRESHOLD` / `POSITION_MAP_THRESHOLD` (tuning.ts 82-102);
`waitForSortAroundFocus`, `isFocusedCellVisible`, `focusNthItem`,
`toggleSortDirection` (helpers.ts); the test file's `beforeEach` and the
existing `async offset correction — column alignment (buffer tier)` describe.

**Not performed:** no test suite was run as part of this review (see B4), and
the RED state of the new e2e tests was not verified — that is the point of T1.
