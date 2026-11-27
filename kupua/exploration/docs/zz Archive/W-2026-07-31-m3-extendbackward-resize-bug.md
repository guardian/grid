# M3 follow-up — extendBackward + resize leaves bufferOffset column-misaligned — FIXED

**DONE (2026-08-01).** Fixed by reusing the shared `alignBufferStart`
primitive in `extendBackward()` (same fix pattern as `dbb332f5f`). Reviewed
(`R-2026-08-01-extendbackward-resize-fix-review.md`, verdict: approve the
production change; one blocking test issue found and fixed — the headline
"no compounding drift" test was silently skipping 5 of its 6 cycles due to
`POST_EXTEND_COOLDOWN_MS`, passing vacuously even against the unfixed code).
**Correction to this doc's original text below:** the "two `it.fails`
regression tests" described in the original Summary were never actually
committed — the tests that shipped were always normal `it()` blocks (four of
them, not two). See the review for the full trace; treated as a documentation
error in this doc, not a discrepancy in the code.

**Date:** 2026-07-31
**Discovered via:** Vitest unit test, written to close the M3 wandering mission's
open gap (a live-browser resize-during-fetch race that couldn't be reliably
forced through embedded-browser tool round-trip latency — see
`wandering-findings/W-2026-07-31-m3-m4-m5-coverage.md`).
**Status: real bug, reproducible, NOT a race at all — FIXED.** Reused the
`alignBufferStart` primitive already shared by `_loadBufferAroundImage`,
`seek()`, and the async offset-correction — this was the "future fourth call
site" those three's own comments warned about.

## Summary

`extendBackward()`'s column-trim (the fix for the buffer-tier column-shift
bug, `dbb332f5f`) reads `getScrollGeometry()` fresh at trim time — correct in
isolation, and exactly what proved safe for the sort-around-focus trigger it
was built for. But it does nothing to reconcile a **pre-existing**
`bufferOffset` (aligned to the OLD column count) against a **new** column
count once one arrives. Any resize — panel toggle, window resize, or any
grid-density change that keeps grid mode — that happens while `bufferOffset
> 0` and not a multiple of the new column count, followed by **any later**
`extendBackward()` call (e.g. the user scrolls up a little afterwards), can
leave `bufferOffset` misaligned to the current column count. This reproduces
the same "items shift sideways" symptom class as the already-fixed bug, via a
different, more common trigger.

**Confirmed NOT a race** — the second test reproduces it with the resize
fully settled well before `extendBackward` is even called. No precise timing
is needed at all.

## Root cause (traced precisely)

`search-store.ts`, `extendBackward()`:

```ts
const fetchCount = Math.min(PAGE_SIZE, bufferOffset);   // independent of columns
...
const result = await dataSource.searchAfter(...);
...
const geo = getScrollGeometry();                         // read live, post-await
if (geo.columns > 1 && result.hits.length % geo.columns !== 0) {
  const excess = result.hits.length % geo.columns;
  if (result.hits.length > excess) {
    result.hits = result.hits.slice(excess);              // trims to align the NEW batch
    ...
  }
}
...
const newOffset = Math.max(0, state.bufferOffset - result.hits.length); // uses OLD bufferOffset
```

`fetchCount` is chosen to reach exactly to the buffer's true start
(`bufferOffset - fetchCount === 0`) whenever `bufferOffset ≤ PAGE_SIZE`. The
trim then discards `excess` items from the front so the **committed prepend
count** is a multiple of the *current* columns — correct for keeping already
-buffered items' columns stable going forward. But the resulting
`newOffset = oldBufferOffset - trimmedCount` is only guaranteed to be a
multiple of the current columns if `oldBufferOffset` was *also* already a
multiple of the current columns. If a resize happened since `oldBufferOffset`
was set (under the OLD columns), that precondition doesn't hold, and the
residual (`oldBufferOffset mod newColumns`, effectively) survives as a
permanently non-zero, non-aligned `bufferOffset` — until some *later*
`extendBackward` call happens to close the remaining gap exactly.

## Reproduction (deterministic, Vitest)

1. `columns=4`. `search()` a 300-item mock corpus, `seek(150)` →
   `bufferOffset=52` (aligned to 4 at the time: `52 % 4 === 0`).
2. Resize to `columns=6` (`registerScrollGeometry`) — fully settled, no
   `extendBackward` call anywhere near it.
3. Call `extendBackward()` normally (models the user scrolling up a bit
   later). It fetches `min(PAGE_SIZE, 52) = 52` items, trims `52 % 6 = 4`
   items to align the prepend to 6, commits 48.
4. **Result: `bufferOffset = 52 - 48 = 4`. `4 % 6 = 4 ≠ 0`** — misaligned to
   the current column count, and will stay that way until some future
   extend happens to close exactly this remaining 4-item gap.

Confirmed the mid-flight-race variant produces the identical failure mode
(`bufferOffset=4`) — the race framing was a red herring; the underlying issue
doesn't need one.

## Scope

- **Confirmed affected:** buffer tier grid density, any resize that changes
  column count while mid-scroll.
- **Confirmed immune:** table density (`columns=1`, tested explicitly —
  `x % 1` is always `0`).
- **Not tested this session:** two-tier and seek tier don't use this
  `extendBackward` column-trim path at all for their own virtualization (per
  the original column-shift finding doc's own scope table — global-index
  virtualization, not local buffer columns) — likely immune by the same
  reasoning, not independently re-verified here.
- **Severity:** low-to-moderate. Requires a specific sequence (resize while
  scrolled to a non-edge, non-zero position, followed by scrolling further
  toward the start) and produces a visible but non-destructive symptom
  (existing items shift by a few pixels/columns) — not data loss, not a
  crash, not silent corruption of `imagePositions` (verified via
  `assertPositionsConsistent` — the buffer stays internally consistent, it's
  the *column alignment* that's off, which only matters visually).

## Recommendation — IMPLEMENTED

Reused `alignBufferStart()` (`kupua/src/lib/buffer-column-align.ts`), the same
primitive already shared by `_loadBufferAroundImage`, `seek()`, and the async
offset-correction, rather than the ad-hoc trim: aligns to
`bufferOffset - fetchedCount` (not just `fetchedCount`), so the result is
provably a multiple of the CURRENT columns regardless of what the columns
were when `bufferOffset` was first set. Verified via independent review
(`R-2026-08-01-extendbackward-resize-fix-review.md`) — the production change
is correct and a strict generalisation of the prior (correct) behaviour when
no resize has occurred; one test was strengthened per the review (the
headline "no compounding drift" test wasn't actually exercising more than one
real cycle due to `POST_EXTEND_COOLDOWN_MS`).
