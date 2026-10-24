# Review — `extendBackward` resize/column-alignment fix (uncommitted)

**Date:** 2026-08-01
**Reviewer:** fresh agent (review-only; no source or test file was modified)
**Under review:** uncommitted changes to
`kupua/src/stores/search-store.ts` (`extendBackward`) and
`kupua/src/stores/search-store-extended.test.ts` (new describe block
`"extendBackward + resize (wandering M3 follow-up)"`).
**Context doc:** `exploration/docs/zz Archive/W-2026-07-31-m3-extendbackward-resize-bug.md`

---

## Verdict

**Approve the production change. One test change required before commit.**

The fix in `search-store.ts` is **correct**, provably so, and is a strict
generalisation of the behaviour it replaces (§1). It is consistent with the
three existing `alignBufferStart` call sites, and correctly leaves them alone
(§3). Full unit suite: **980/980 passing, 50/50 files** (§4). The two-tier
immunity claim is **verified** against `useDataWindow.ts` (§5).

The blocking issue is in the tests, not the code:

> **The headline test — "repeated resize/extend cycles do not compound
> drift" ([search-store-extended.test.ts:1136](kupua/src/stores/search-store-extended.test.ts#L1136))
> — does not do what it says. Five of its six cycles never run: they are
> silently rejected by `POST_EXTEND_COOLDOWN_MS` at
> [search-store.ts:2532](kupua/src/stores/search-store.ts#L2532). Empirically
> confirmed (§2.4). `bufferOffset` sits at `600` for cycles 2-6, and 600
> happens to be divisible by 4, 5 and 6, so every per-cycle assertion and
> the monotonicity loop pass vacuously. This test also passes against the
> unfixed code.**

That is not a defect in the fix — I verified separately that the property the
test *claims* to prove **does actually hold** (§2.4). But as committed, the
only test of the "no compounding" property is non-discriminating, and it is
the test the block's own comment points at ("The last test below specifically
exercises repeated cycles to prove this").

Everything else below is a nit or an observation.

---

## 1. Is the core claim correct? Yes — provably.

The change ([search-store.ts:2565-2591](kupua/src/stores/search-store.ts#L2565-L2591)):

```ts
const geo = getScrollGeometry();
const rawOffset = bufferOffset - result.hits.length;          // :2579
const { trimCount } = alignBufferStart(rawOffset, result.hits.length, geo.columns); // :2580
if (trimCount > 0 && result.hits.length > trimCount) {        // :2587
  result.hits = result.hits.slice(trimCount);
  result.sortValues = result.sortValues.slice(trimCount);
}
```

and the commit at [search-store.ts:2603](kupua/src/stores/search-store.ts#L2603):
`newOffset = Math.max(0, state.bufferOffset - result.hits.length)`.

**Proof.** Let `B = bufferOffset` (read pre-await at
[search-store.ts:2521](kupua/src/stores/search-store.ts#L2521)), `L =
result.hits.length` before trimming, `C = geo.columns`.
`rawOffset = B − L`. From
[buffer-column-align.ts:58-60](kupua/src/lib/buffer-column-align.ts#L58-L60):

- `idealTrim = (C − (rawOffset mod C)) mod C`
- `trimCount = min(idealTrim, L, protectUpTo)`; `protectUpTo` defaults to
  `availableCount` ([buffer-column-align.ts:56](kupua/src/lib/buffer-column-align.ts#L56)),
  and this call site passes no fourth argument, so the cap is just
  `min(idealTrim, L)`.

When the guard at :2587 passes (`L > trimCount`, which given `trimCount ≤ L`
means `trimCount = idealTrim`):

```
committed = L − idealTrim
newOffset = B − committed = (B − L) + idealTrim = rawOffset + idealTrim
          = alignedOffset  ≡ 0 (mod C)
```

So the resulting `bufferOffset` is a multiple of the **current** column
count, and the derivation never references the column count that was in
effect when `B` was set. The claim in the code comment holds.

**It is also a strict generalisation, not a behaviour change on the old
path.** If `B ≡ 0 (mod C)` (the precondition the previous code implicitly
assumed), then
`rawOffset mod C = (−L) mod C`, so
`idealTrim = (C − ((−L) mod C)) mod C = L mod C` — exactly the `excess =
result.hits.length % geo.columns` the removed code computed. Same trim, same
guard shape. Nothing that was previously correct changes.

`Math.max(0, …)` at :2603 cannot bind: `committed ≤ L ≤ fetchCount ≤ B`
([search-store.ts:2541](kupua/src/stores/search-store.ts#L2541)).

---

## 2. Edge cases

### 2.1 `columns = 1` (table density) and `columns = 0` (unregistered)

[buffer-column-align.ts:57](kupua/src/lib/buffer-column-align.ts#L57) short-circuits
`columns <= 1` to `trimCount: 0`, so the trim block at :2587 never fires —
behaviourally identical to the removed `geo.columns > 1` outer condition, and
it also protects against a `% 0 → NaN` if geometry is never registered.
Correct, and `x % 1 === 0` makes the alignment claim trivially true.

### 2.2 The audit #9 guard (never permanently block `extendBackward`)

The guard survives ([search-store.ts:2587](kupua/src/stores/search-store.ts#L2587))
and still does its job: since `trimCount ≤ L` by construction, the guard can
only fail when `trimCount = L`, i.e. `idealTrim ≥ L`, i.e. `L < C`. In that
case no trim happens, all `L` hits are committed, `startCursor` advances
([search-store.ts:2620-2622](kupua/src/stores/search-store.ts#L2620-L2622)) —
progress is made, no re-fetch/discard loop. Safe.

Note the interaction *direction* has changed: the guard is now much harder to
reach. Reaching it requires `L < C` **and** `B ≡ 0 (mod C)` (from
`rawOffset ≡ −L`, `idealTrim = L` ⟹ `B ≡ 0`), which in turn requires the
backward fetch to return **fewer hits than `fetchCount`** — because whenever
`B ≤ PAGE_SIZE` and the fetch is complete, `L = B`, `rawOffset = 0`, and
`idealTrim = 0`. See §"Concerns / C2": the existing audit-#9 regression test
no longer exercises the guard at all.

### 2.3 Buffer running out near the true start

Covered by the same analysis: when the fetch reaches the start
(`rawOffset = 0`), `idealTrim = 0`, no trim, `bufferOffset → 0`. Verified
empirically — a scratch probe reproducing the "settled resize" scenario
(300 items, `seek(150)`, `columns 4 → 6`) gives `before=52 after=0`.

### 2.4 Repeated resize/extend cycles — property holds; the shipped test doesn't test it

I ran two throwaway probe files **outside the repository** (in `$TMPDIR`,
since removed) against the current working tree, driving the store directly.

**Probe 1 — replica of the committed test's loop (no waits between cycles),
logging offsets and timings:**

```
afterSeek=800
[t+4ms  cols=4] offset 800->600 len 200->400
[t+5ms  cols=6] offset 600->600 len 400->400
[t+7ms  cols=4] offset 600->600 len 400->400
[t+10ms cols=5] offset 600->600 len 400->400
[t+12ms cols=6] offset 600->600 len 400->400
[t+15ms cols=4] offset 600->600 len 400->400
```
with store devLog output:
```
[extendBackward] BLOCKED: seekCooldown (47ms remaining)
[extendBackward] BLOCKED: seekCooldown (45ms remaining)
[extendBackward] BLOCKED: seekCooldown (44ms remaining)
[extendBackward] BLOCKED: seekCooldown (41ms remaining)
[extendBackward] BLOCKED: seekCooldown (38ms remaining)
```

Cause: a successful backward extend sets
`_seekCooldownUntil = Date.now() + POST_EXTEND_COOLDOWN_MS`
([search-store.ts:2670](kupua/src/stores/search-store.ts#L2670)), with
`POST_EXTEND_COOLDOWN_MS = 50` ([tuning.ts:182](kupua/src/constants/tuning.ts#L182)).
The committed loop only awaits `flush()` (`setTimeout(…, 0)`,
[search-store-extended.test.ts:29](kupua/src/stores/search-store-extended.test.ts#L29))
between cycles — the whole six-cycle loop finishes in ~15ms, well inside the
50ms window, so cycles 2-6 hit the guard at
[search-store.ts:2532](kupua/src/stores/search-store.ts#L2532) and return
without doing anything.

**Probe 2 — same sequence with the cooldown respected (150ms between cycles):**

```
afterSeek=800
cols=4 800->600 aligned=true
cols=6 600->402 aligned=true
cols=4 402->204 aligned=true
cols=5 204->5   aligned=true
cols=6 5->0     aligned=true
cols=4 0->0     aligned=true
```
with three real trims logged (`trimmed 2 … 6 columns`, `trimmed 2 … 4
columns`, `trimmed 1 … 5 columns`).

So: **the fix genuinely does not compound across cycles** — every cycle lands
exactly aligned to the then-current column count, and the residual is
re-absorbed rather than accumulated. The property is real. The committed test
just doesn't observe it.

### 2.5 Behavioural trade-off this fix deliberately makes (correct, but worth stating)

The previous code prioritised "never shift the already-buffered items"; this
one prioritises "end up at the natural column". When `bufferOffset` is
misaligned to the new column count, the committed prepend count
(`B − alignedOffset`) is necessarily *not* a multiple of `columns`, so every
already-buffered item — including on-screen ones — shifts column position
once, at the moment of the first `extendBackward` after the resize. Example
from probe 2: `800 → 600` with `columns = 6` commits 200 items, `200 % 6 = 2`
⟹ a two-column shift of existing content. Under the old code the shift didn't
happen but the offset stayed permanently wrong (`602`).

This is the intended trade (the test block's comment at
[search-store-extended.test.ts:1046-1053](kupua/src/stores/search-store-extended.test.ts#L1046-L1053)
argues it explicitly: "a one-time, bounded adjustment per resize is
acceptable"), and I agree it's the right call — one correcting shift beats
permanent misalignment. Flagging it only because the shift is **deferred**:
the user sees it on their next scroll-up, not at the resize, which reads as
an unprovoked jump. No test asserts the shift is one-time-only in a way that
actually executes (see §2.4).

---

## 3. Other `alignBufferStart` call sites — correctly untouched

`git diff HEAD` shows only the `extendBackward` block changed. The other
three were already correct, and none of them has this bug class, because each
**derives a fresh offset from an absolute quantity** rather than adjusting a
pre-existing `bufferOffset`:

- `_loadBufferAroundImage` — [search-store.ts:1238-1241](kupua/src/stores/search-store.ts#L1238-L1241):
  `rawBufferStart = max(0, exactOffset − backwardHits.length)`, and the
  returned `alignedOffset` *is* the new `bufferStart`. Nothing pre-existing
  feeds in.
- `seek()` — [search-store.ts:3459-3471](kupua/src/stores/search-store.ts#L3459-L3471):
  aligns `actualOffset` (computed for this seek) and applies
  `actualOffset += seekTrim`, also adjusting `backwardItemCount` so
  `computeScrollTarget`'s headroom stays correct. Its skip-instead-of-cap
  guard (`seekTrim < result.hits.length`) mirrors audit #9.
- `_findAndFocusImage` async correction — [search-store.ts:1735-1737](kupua/src/stores/search-store.ts#L1735-L1737):
  aligns `rawCorrectedOffset` derived from `countBefore`, with
  `protectUpTo = buf.targetLocalIndex`. This is the one site where the result
  is *not* guaranteed aligned, and that caveat is already documented at
  [buffer-column-align.ts:39-49](kupua/src/lib/buffer-column-align.ts#L39-L49)
  with a justification I find sound (the cap only binds when the backward
  page ran out near index 0).

`extendBackward` was the only site that took `bufferOffset` as an *input* and
returned a *delta*, which is exactly why it was the one that broke. Leaving
the other three alone is right.

---

## 4. Test suite

```
npm --prefix kupua test
Test Files  50 passed (50)
     Tests  980 passed (980)
  Duration  51.16s
```

No regressions. The four new tests also pass in isolation
(`-t "wandering M3 follow-up"`: 4 passed, 70 skipped).

---

## 5. Two-tier / seek-tier immunity claim — verified

The finding doc lists two-tier/seek tier as "likely immune, not independently
re-verified". It is verifiable and it is correct:

- In two-tier mode `findImageIndex` returns the **global** index directly
  ([useDataWindow.ts:490-492](kupua/src/hooks/useDataWindow.ts#L490-L492)),
  and the virtualizer spans `total`
  ([useDataWindow.ts:340](kupua/src/hooks/useDataWindow.ts#L340)), so an
  item's rendered column is `globalIndex % columns` — independent of
  `bufferOffset`. `getImage` uses `bufferOffset` only to map global → buffer
  slot ([useDataWindow.ts:466-470](kupua/src/hooks/useDataWindow.ts#L466-L470)),
  which is content lookup, not column placement.
- In normal (buffer) mode `findImageIndex` returns
  `globalIdx − bufferOffsetRef.current`
  ([useDataWindow.ts:495](kupua/src/hooks/useDataWindow.ts#L495)) — column
  placement *is* offset-dependent. This is the affected tier.

Nothing in the fix or its comments says anything false about this. But see
C3: the new tests are all in tiers where the misalignment is *not* visible.

---

## Concerns

### C1 — (blocking, test-only) The "no compounding drift" test is non-discriminating

[search-store-extended.test.ts:1136-1181](kupua/src/stores/search-store-extended.test.ts#L1136-L1181).
Cycles 2-6 never execute an extend (§2.4, empirically confirmed), so:

- the per-cycle assertion at
  [search-store-extended.test.ts:1160-1163](kupua/src/stores/search-store-extended.test.ts#L1160-L1163)
  evaluates `600 % 6`, `600 % 4`, `600 % 5` — all trivially `0`;
- the monotonicity loop at
  [search-store-extended.test.ts:1173-1178](kupua/src/stores/search-store-extended.test.ts#L1173-L1178)
  compares `600 ≤ 600` five times. Even if the extends *did* run, this
  assertion is near-tautological on its own: `extendBackward` can only
  decrease `bufferOffset` (`newOffset = state.bufferOffset −
  result.hits.length`, [search-store.ts:2603](kupua/src/stores/search-store.ts#L2603)),
  so "must not increase" cannot fail by construction;
- the one cycle that *does* run (`cols=4`, 200 hits, `rawOffset = 600`)
  produces `trimCount = 0` — the old code would have produced the identical
  `600` (`200 % 4 === 0`). **This test passes against the unfixed
  implementation.**

The fix does hold under this scenario (probe 2, §2.4) — the test just isn't
observing it. I'm not proposing the change, per the brief, but note the
existing file already has a `waitPastCooldown` helper
([search-store-extended.test.ts:30](kupua/src/stores/search-store-extended.test.ts#L30))
used by every other multi-extend test.

### C2 — (nit) The audit-#9 regression test no longer exercises its guard

[search-store-extended.test.ts:983-1015](kupua/src/stores/search-store-extended.test.ts#L983-L1015)
sets up `bufferOffset = 2`, `columns = 3`, backward fetch returns 2 hits. Its
comment describes the old arithmetic (`excess = 2 % 3 = 2 → slice(2) = []`).
Under the new code: `rawOffset = 2 − 2 = 0` ⟹ `idealTrim = 0` ⟹
`trimCount = 0` ⟹ the guard condition at
[search-store.ts:2587](kupua/src/stores/search-store.ts#L2587) is short-circuited
by `trimCount > 0` and the trim branch is never entered. The test still
passes, but for a different reason than the one it documents, and the guard
it exists to protect is now uncovered. Per §2.2 the guard is still reachable
(short backward page with an already-aligned offset), so it is not dead code —
just untested. The stale comment should at minimum be corrected.

### C3 — (nit) None of the four new tests runs in the tier where the bug is visible

Tests 1-3 use `MockDataSource(300)`
([search-store-extended.test.ts:1062](kupua/src/stores/search-store-extended.test.ts#L1062),
[:1096](kupua/src/stores/search-store-extended.test.ts#L1096),
[:1118](kupua/src/stores/search-store-extended.test.ts#L1118)) — `300 ≤
SCROLL_MODE_THRESHOLD` (1000, [tuning.ts:81](kupua/src/constants/tuning.ts#L81)),
so `isTwoTierFromTotal` is false ([two-tier.ts:10-13](kupua/src/lib/two-tier.ts#L10-L13)):
buffer-local indices, bug visible — good. Test 4 uses `MockDataSource(2000)`
([search-store-extended.test.ts:1137](kupua/src/stores/search-store-extended.test.ts#L1137)),
which **is** two-tier (`1000 < 2000 ≤ 65000`) — i.e. the "no compounding
drift" test runs in precisely the tier §5 shows is immune to column
misalignment. The store-level invariant is tier-agnostic so the test isn't
*wrong*, but the tier choice is unfortunate given the test's stated purpose.

### C4 — (nit) The `columns = 1` test asserts almost nothing

[search-store-extended.test.ts:1117-1134](kupua/src/stores/search-store-extended.test.ts#L1117-L1134):
its only assertion is `assertPositionsConsistent`, which checks
`imagePositions[i] === bufferOffset + i`
([search-store-extended.test.ts:45-53](kupua/src/stores/search-store-extended.test.ts#L45-L53)) —
an invariant maintained by `buildPositions` regardless of alignment. It does
not assert `bufferOffset` changed, nor that no trim occurred. It would pass
against the old code and against a no-op implementation. Harmless as a
smoke test; it does not demonstrate the "table density is immune" claim in
its title.

### C5 — (nit, pre-existing) Stale `bufferOffset` across the await

`bufferOffset` is captured before the fetch
([search-store.ts:2521](kupua/src/stores/search-store.ts#L2521)) and used to
compute `rawOffset` at :2579, while the commit uses the *live*
`state.bufferOffset` at :2603. The fix makes `extendBackward` newly sensitive
to `bufferOffset` mutating during the await (the old code's trim depended only
on `hits.length`). The concrete concurrent mutator is `extendForward`'s
eviction — `newOffset += evictedFromStart`
([search-store.ts:2452-2459](kupua/src/stores/search-store.ts#L2452-L2459)) —
which can overlap because the two actions use independent in-flight flags
(`_extendForwardInFlight` vs `_extendBackwardInFlight`). In practice this is
benign: `evictedFromStart` is rounded to a multiple of the current columns
([search-store.ts:2452-2454](kupua/src/stores/search-store.ts#L2452-L2454)),
so it preserves alignment mod `columns` unless a resize also lands in the same
window — and the next `extendBackward` re-heals it anyway. Recording it
because the sensitivity is new, not because I think it needs action.

### C6 — (nit) Dead branch introduced

[search-store.ts:2593-2596](kupua/src/stores/search-store.ts#L2593-L2596)
(`if (result.hits.length === 0)` immediately after the trim) is now
unreachable: the earlier check at :2562 handles the empty fetch, and the
guard at :2587 guarantees the trim leaves at least one hit. Cheap insurance,
not worth removing — but it's no longer the safety net its position implies.
Similarly `trimCount > 0` in the :2587 condition is redundant given
`result.hits.length > trimCount` already implies a no-op slice at
`trimCount === 0`; it does usefully suppress a misleading `trimmed 0 items`
devLog.

### C7 — (nit, docs) The finding doc is now stale, and its "starting failing tests" never existed

`W-2026-07-31-m3-extendbackward-resize-bug.md` is still titled "OPEN BUG, not
fixed" and states two `it.fails` regression tests were added to
`search-store-extended.test.ts`. `git show HEAD:kupua/src/stores/search-store-extended.test.ts`
contains no `it.fails`, no `OPEN, UNFIXED`, and no `wandering M3` — and the
working-tree diff for that file is a pure addition (`@@ -1016,3 +1016,168 @@`).
So the claimed failing-first tests were never committed, and the TDD trail the
doc describes can't be reconstructed from the repo. The doc should be updated
to FIXED (or superseded) as part of this change.

---

## Non-blocking observations

- The working tree is **not** isolated to this fix:
  `kupua/src/components/ImageGrid.tsx`, `kupua/e2e/local/ui-features.spec.ts`,
  `kupua/AGENTS.md`, plus untracked `kupua/src/lib/grid-scroll-anchor.ts` and
  its test, are also modified. Whoever commits this should stage
  `search-store.ts` + `search-store-extended.test.ts` (+ the finding doc per
  C7) separately from that unrelated work.
- The new code comment at
  [search-store.ts:2565-2576](kupua/src/stores/search-store.ts#L2565-L2576)
  is accurate, including the "future fourth call site" framing — it matches
  what [buffer-column-align.ts:14-20](kupua/src/lib/buffer-column-align.ts#L14-L20)
  predicted. Good docs hygiene.
- Per the AGENTS directive table, this change touches store/scroll behaviour,
  so the Playwright e2e surface should be run before commit (requires port
  3000 free). I did not run it — this was a review-only task and the unit
  suite was the surface named in the brief.

## What I did not do

No source or test file was modified, nothing was staged, committed or pushed.
The empirical probes in §2.4 were standalone vitest files written to
`$TMPDIR/kupua-probe/` with their own config, run against the unmodified
working tree, and deleted afterwards. No fix is proposed here.
