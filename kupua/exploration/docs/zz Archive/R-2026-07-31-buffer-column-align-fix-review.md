# Review — buffer-tier column-alignment fix (`alignBufferStart`)

Date: 2026-07-31
Scope reviewed (only these five files; other uncommitted repo changes ignored):

- `kupua/src/lib/buffer-column-align.ts` (new)
- `kupua/src/lib/buffer-column-align.test.ts` (new)
- `kupua/src/stores/search-store.ts` (modified)
- `kupua/src/stores/search-store-extended.test.ts` (modified)
- `kupua/exploration/docs/zz Archive/F-2026-07-31-buffer-tier-column-shift-fix-design.md`
  (moved + Resolution section added)

Reference (read-only): the design doc above; `R-2026-07-31-buffer-self-correcting-fix-review.md`.

---

## Verdict

**The fix is correct at the site it targets, and the extraction into a shared pure
function is the right call** — it turns "three inline copies of the same modulo
trick, one of which was missing" into one tested primitive with one obvious place
for a fourth caller to reuse. Both pre-existing call sites are behaviour-preserving
(checked by hand, §2). The new call site closes the reproduced bug.

Three things stop it being a clean pass:

1. One **new, narrow, silent-total-failure mode** introduced by the `startCursor`
   recompute: it can commit `startCursor: null`, which hard-blocks `extendBackward`
   for the rest of the search. One-line fix (§1.1).
2. The design doc's Resolution claims the remaining `extendBackward` guard is
   **"provably unreachable"**. It isn't — it rests on two unstated assumptions,
   one of which (column count is mutable) is violated by an ordinary window resize.
   The right response is to **soften the doc, not write more code** (§3).
3. The store-level regression test is a **10ms polling sampler** — it can miss the
   very transient it exists to catch, and costs ~3.5s of suite time. A store
   subscription makes it deterministic, complete and near-free (§4.1).

Nothing here is a blocker for committing. Recommendations ordered at the end.

---

## 1. The new call site — async offset correction

`search-store.ts` lines 1721–1758. This is the actual bug fix; the rest is refactor.

The core reasoning is right and the comment explains it well: buffer tier has no
position map, so this branch is the *normal* path, and an unaligned `bufferOffset`
here survives the whole top-up because every `extendBackward` step can only change
`bufferOffset` by a multiple of `columns`. Aligning at the landing site is the
correct lever — it makes the *final* closing prepend (`fetchCount = bufferOffset`,
line 2531) automatically a multiple of `columns`, which is where the visible shift
was actually coming from (`823→623→423→223→23→3→0` — everything is fine until the
last 3-item prepend). That mechanism is worth stating explicitly somewhere, because
it's the whole reason a landing-site fix cures a symptom that manifests in
`extendBackward`.

Arithmetic checks out: after the trim the target's local index becomes
`targetLocalIndex - trimCount` and the offset becomes `rawCorrectedOffset + trimCount`,
so the target's global position is still exactly `exactOffset`. `_focusedImageKnownOffset`
is re-derived from the rebuilt `imagePositions` afterwards, so it stays consistent.
Trimmed items are below the new `bufferOffset` and are re-fetched by the subsequent
top-up, so `results.length` still reaches `total` — no permanently lost items,
provided §1.1 holds.

### 1.1 `newStartCursor` can be `null` — silent permanent block (fix this)

`search-store.ts` lines 1745–1747:

```ts
const newStartCursor = trimCount > 0 && correctedResults[0]
  ? extractSortValues(correctedResults[0], fp.orderBy)
  : state.startCursor;
```

`extractSortValues` is typed `SortValues | null` (`image-offset-cache.ts:73`) and
returns `null` whenever a sort clause has no readable field. That `null` is then
committed as `startCursor`, and `extendBackward` bails unconditionally on it:

```ts
if (!startCursor) { devLog(`[extendBackward] BLOCKED: startCursor is null`); return; }
```
(`search-store.ts:2528–2531`)

Result: the buffer can never extend backwards again for the remainder of that
search — strictly worse than the stale-cursor bug this block was added to fix, and
it fails silently behind a `devLog`. Low frequency, total impact.

Fix: `?? state.startCursor` on the extraction, so a failed extraction degrades to
the stale-cursor behaviour (a re-fetch/discard cycle) rather than to a hard stop.

### 1.2 `correctedResults[0]` can be `undefined` — silent fallback to the stale cursor

`results` is `(Image | undefined)[]` (sparse placeholders). When the new first slot
is a placeholder, the `&& correctedResults[0]` guard falls through to
`state.startCursor` — i.e. exactly the "cursor points at a trimmed-away item"
condition the comment above it says must not happen, silently. Same one-line
neighbourhood as §1.1; worth at least a `devLog` so it isn't invisible if it ever
bites. Not worth more than that.

### 1.3 `protectUpTo` weakens the function's headline postcondition — document it

`buffer-column-align.ts:51` clamps `trimCount` by `protectUpTo`, so
`alignBufferStart` does **not** guarantee an aligned result — by design (never
discard the anchor). The unit test is honest about this (the property sweep is
scoped "given enough available items"), but nothing records *why* the cap is benign
at the async-correction site. The argument is: `protectUpTo = buf.targetLocalIndex`,
and `targetLocalIndex < columns` implies the backward page ran out, which implies
`rawCorrectedOffset` is at or near 0 and therefore already aligned. That's a real
argument and it should be one sentence in the JSDoc, because it's the only thing
standing between this cap and a quiet re-introduction of the bug at a future call
site that passes a `protectUpTo` without the same property.

---

## 2. The two refactored sites — behaviour-preserving (verified)

**`_loadBufferAroundImage`** (`search-store.ts:1238–1240`). Old: `trim = cols > 1 ?
min(ideal, backwardResult.hits.length) : 0`. New: `alignBufferStart(rawBufferStart,
backwardResult.hits.length, cols)` with `protectUpTo` defaulting to `availableCount`,
so the third clamp is inert. Identical. `bufferStart` moved from its old late
declaration into the destructure; nothing reads it in between. No `protectUpTo` is
needed here and none is passed — correct, the target hit isn't part of `bwHits`.

**`seek()`** (`search-store.ts:3446–3457`). Old outer guard was
`seekCols > 1 && actualOffset % seekCols !== 0`, giving `seekTrim ∈ [1, cols-1]`,
applied only when `seekTrim < result.hits.length`. New: `trimCount = min(ideal,
hits.length)`, applied when `0 < trimCount < hits.length`. The extra `min` only
changes the value when `hits.length < ideal` — in which case both old and new fail
the `< hits.length` guard and skip. Equivalent. Discarding `alignedOffset` in favour
of the manual `actualOffset += seekTrim` is mildly redundant but correct, and keeps
the `backwardItemCount` adjustment adjacent to it — fine.

The updated comment here ("Skip (not cap) when the trim would consume the whole
page") is a good addition: it records a deliberate divergence from the shared
function's clamping behaviour, which is otherwise the kind of thing a later reader
would "tidy up" into a bug.

---

## 3. The "provably unreachable" claim is overstated (soften the doc; do not code)

The Resolution section asserts that `extendBackward`'s audit-#9 skip-guard
(`search-store.ts:2564–2577`) "becomes provably unreachable once every landing site
keeps `bufferOffset` congruent to 0 mod columns". Two assumptions are doing the work
there, and neither is guaranteed:

1. **ES returns exactly `fetchCount` hits.** The guard needs
   `result.hits.length <= excess`, i.e. `hits.length < columns`. With an aligned,
   non-zero `bufferOffset` we get `fetchCount >= columns` — but a short page (PIT
   drift, deleted docs, dedup) can still return 2 hits for a request of 8, and the
   guard fires.
2. **`columns` is constant between landing and the last top-up prepend.**
   `getScrollGeometry().columns` changes on window resize and on Browse/Details panel
   toggle. `bufferOffset` aligned mod 4 is not aligned mod 5. A resize during the
   ~0.5–1.5s top-up window puts the final closing prepend back to an arbitrary size —
   the original symptom, exactly.

Note that (2) does *not* generally reintroduce the shift for mid-walk prepends: those
are `PAGE_SIZE`-sized and get trimmed to a multiple of the *current* `columns`
regardless. Only the final gap-closing prepend is sized by `bufferOffset` itself.
So the residual hole is: **resize (or panel toggle) during the top-up, then the last
prepend.** Narrow.

**Recommendation: do not fix this.** The doc's own §4.1 "carry the remainder across
`extendBackward` calls" design is invasive, changes `extendBackward`'s calling
contract (and therefore the audit-#9 regression test's assumptions), and buys
coverage of a window measured in hundreds of milliseconds that requires the user to
resize mid-settle. That is a bad trade. What should change is one paragraph of prose:
replace "provably unreachable" with "unreachable under the assumptions that ES
returns a full page and `columns` does not change mid-settle", and note the two
counterexamples so the next person doesn't have to re-derive them. If the symptom is
ever reported again *with a resize in the repro steps*, this is where to look.

---

## 4. Tests

### 4.1 The store-level test samples; it should subscribe

`search-store-extended.test.ts` (new block, ~lines 1017–1070). The intent is right and
well-argued in the comment: the bug is about *intermediate* misalignment, the end
state is always 0, so only checking the end state would prove nothing. The
`it.each` sweep over six adjacent target IDs (rather than one magic ID) is also the
right instinct and directly addresses the design doc's §6.1 warning.

The mechanism is the weak part. A `for` loop of 60 × 10ms real-timer sleeps:

- **can miss the transient.** If two `bufferOffset` writes land between samples, the
  misaligned one is never observed and the test passes on a broken build. The
  reported 5/6 pre-fix failures suggest sampling happens to be dense enough today,
  but nothing pins that — a faster mock or a machine under load changes the odds.
- **costs ~600ms × 6 = ~3.5s** of unit-suite wall time.
- **couples to `_bufferSelfCorrecting`**, an internal, as a loop-exit condition.

`useSearchStore.subscribe` recording every `bufferOffset` transition instead gives
complete coverage (no gaps by construction), removes the sleep entirely, and lets the
test await a single settle condition. Same assertion, strictly stronger, faster.

Two smaller points on the same test: `% 4` is hardcoded in the assertion rather than
read from the `columns` value passed to `registerScrollGeometry`; and it only exercises
`columns: 4`, so the `PAGE_SIZE % columns` interaction the design doc's §6.5 asked to
be stressed (odd column counts) is covered only in the pure-function test, where
`PAGE_SIZE` isn't involved at all. Extending the `it.each` to a couple of column
counts would close that, and is cheap once the sleeps are gone.

### 4.2 The pure-function test is good

`buffer-column-align.test.ts` — the property sweep over `columns ∈ {2..6}` × 50
offsets, plus the `columns <= 1` no-op, the `availableCount` clamp and the
`protectUpTo` clamp, covers the whole surface of a 6-line function. Honest scoping on
the property ("given enough available items"). No notes.

The final "reproduces the exact live-repro numbers" case is the magic-number test
the design doc §6.1 warned against — but the warning was aimed at store-level
regression tests, and on a pure function this costs nothing and preserves the live
trace as documentation. Keep it; no action.

### 4.3 Not covered, deliberately or otherwise

The two refactored sites (`_loadBufferAroundImage`, `seek()`) gained no new
assertions. Given the equivalence check in §2 that's defensible, but it does mean the
shared primitive's contract is only pinned at one of its three call sites. If the
`it.each` in §4.1 is being touched anyway, adding `bufferOffset % columns === 0` to
the existing "buffer positions are correct after sort-around-focus" test (as the
design doc §6.3 suggested) is a two-line way to pin a second site.

---

## 5. Docs and commit hygiene

- **The JSDoc references a changelog entry that does not exist.**
  `buffer-column-align.ts:17` says *"see changelog 'buffer-tier grid-density column
  shift'"*. `changelog.md` has no such entry — the only `column shift` match
  (`changelog.md:4556`) is an older, unrelated item. Either the changelog append is
  missing from the commit scope, or the comment should stop citing it.
- **The proposed 5-file commit contains no `changelog.md` append.** The repo
  directive requires the detailed narrative to land in `changelog.md` after any change
  of this kind. Recommend adding it as a sixth file — it is squarely part of this fix,
  unlike the other uncommitted working-tree files, and it makes the code comment above
  resolve. (`AGENTS.md` is a separate judgement call; a bug fix plus one small lib file
  probably doesn't move the Component Summary, so leaving it out is reasonable.)
- **The design doc now contradicts itself by design.** §2's "Root cause — confirmed"
  and §4/§5's fix plan all point at `extendBackward`, which the Resolution says was
  never touched. The header does say the doc is otherwise left as written, and there's
  archaeological value in that — but §2's heading in particular ("Root cause —
  confirmed, reproduced twice with instrumentation") will mislead anyone who skims. A
  one-line "superseded — see Resolution" marker under the §2 and §4 headings is enough.

---

## 6. Recommendations, in order

1. **`?? state.startCursor`** on the `extractSortValues` result (§1.1). One line,
   removes a silent total-failure mode. Do this before committing.
2. **Add the `changelog.md` entry to the commit** (§5). Directive-mandated, and the
   new file's own comment already cites it.
3. **Soften the "provably unreachable" wording** in the design doc's Resolution and
   add the two counterexamples (§3). Prose only — explicitly do *not* implement §4.1's
   carry-remainder design.
4. **Convert the store-level test from sampling to `subscribe`** (§4.1), and take the
   extra column counts while you're in there. Strictly stronger, ~3.5s faster.
5. One sentence of JSDoc pinning why `protectUpTo` is safe at the async-correction
   site (§1.3), and "superseded" markers on the design doc's §2/§4 (§5).
6. Optional: `devLog` on the `correctedResults[0] === undefined` fallback (§1.2), and
   an alignment assertion on the existing sort-around-focus positions test (§4.3).

Items 1 and 2 are worth doing before the commit. 3–6 are cheap follow-ups that can
ride along or be skipped without risk.
