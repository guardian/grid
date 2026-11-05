# Panel toggle / resize progressively shifts the grid viewport (no focus) — FIXED

**DONE (2026-08-01).** Fixed, reviewed (`R-2026-08-01-panel-toggle-anchor-fix-review.md`,
review findings applied), unit + e2e verified (980/980 unit, 243/243 e2e),
committed. Archived here alongside its review. See `changelog.md` for the
summary entry.

**Date:** 2026-08-01
**Discovered via:** Directed live-TEST browser session per user's exact repro
steps (load middle/two-tier corpus, scroll to ~half, note the left-most-column
image in the middle row **without focusing it**, open+close Details (RHS)
panel, open+close Browse (LHS) panel, resize thinner then back).
**Status: real bug, reproduced live in all 3 tiers, root cause found, fixed
and unit-tested. Not yet committed** (pending user review).

## Summary

Toggling a side panel (or resizing the window) changes `ImageGrid`'s column
count. `ImageGrid` captures a "scroll anchor" before the column count changes
and restores the equivalent viewport position after
(`kupua/src/components/ImageGrid.tsx`, `captureAnchor` + the column-count
`useLayoutEffect`), so the reflow doesn't visually jump. This works correctly
when an image is **explicitly focused** (the anchor is genuinely that image's
resolved global position via `imagePositions`). But the **phantom** (no
explicit focus) fallback branch computed a synthetic index instead — "the
first image of the row nearest the viewport centre", recomputed from the
*current* `scrollTop` via floor-division row arithmetic — rather than tracking
one real, stable image identity.

That synthetic index is not the same physical anchor across a resize: a
column-count change reflows which flat index lands at "row nearest centre",
so a full open+close round trip (even back to the exact same column count)
does not cancel out. Confirmed live: a single RHS-panel open+close round trip
shifted the tracked anchor image and `scrollTop` by ~1 row; a second
(LHS-panel) round trip shifted it another row. Repeating panel toggles
compounds this — exactly the user's reported "progressive shift" symptom.
`bufferOffset` was unaffected throughout (confirmed via store reads) — this is
**not** the earlier `extendBackward`/column-alignment bug
(`W-2026-07-31-m3-extendbackward-resize-bug.md`, fixed separately, uncommitted
in the same session); it's a distinct bug in `ImageGrid`'s own client-side
anchor math, only manifesting when no image is explicitly focused.

## Live reproduction (real TEST, two-tier corpus `city:Dublin`, 13,687 docs)

Scrolled to `globalIdx≈6850`, no focus. Tracked the phantom viewport anchor
(`getViewportAnchorId()` → `imagePositions`) and `scrollTop` across a single
round trip, **before the fix**:

| Step | Anchor image | `scrollTop` |
|---|---|---|
| Initial | `af1655e...` (idx 6850) | 518435 |
| RHS panel open | `5f811ff...` (idx 6847) | 691145 |
| RHS panel closed | `a237ca0...` (idx 6846) | 518132 (**-303 vs. initial**) |
| LHS panel open | `f360323...` (idx 6844) | 690842 |
| LHS panel closed | `191fb28...` (idx 6842) | 517829 (**-303 more, -606 total**) |

Confirmed in all three tiers (two-tier, buffer tier via
`keyword:"mid length half celebration"`, seek tier via unfiltered
`until=2026-03-04T00:00:00Z`, ~1.25M docs, including with a non-zero
`bufferOffset` via a real `seek()`).

## Root cause

`kupua/src/components/ImageGrid.tsx`, `captureAnchor`'s no-focus fallback
(before fix):

```ts
const centreScroll = el.scrollTop + el.clientHeight / 2;
const centreRow = Math.floor(centreScroll / ROW_HEIGHT);
const centreIdx = centreRow * cols; // first image in that row
```

This invents a fresh flat index at every resize event from whatever
`scrollTop` currently is — not a real image ID resolved through
`imagePositions` (as the focused-image branch, just above it, already did
correctly). Each resize's capture/restore is only an approximation of "the
image that was near centre", and since the *identity* of "first image of the
centre row" changes across a column-count change, a full open+close cycle
doesn't restore the same physical anchor — the error compounds with repeated
toggles.

## Fix

Extracted the anchor math into a new, pure, unit-tested module,
`kupua/src/lib/grid-scroll-anchor.ts`:

- `resolveAnchorVirtIndex(imageId, imagePositions, bufferOffset, isTwoTier)` —
  resolves a **real image ID** to its virtualizer index (mirrors the existing
  focused-image logic).
- `captureAnchorAtIndex` / `restoreAnchorScrollTop` — the row/ratio math,
  unchanged in spirit, but now always driven by a resolved index.
- `computeFallbackAnchor` — the old synthetic heuristic, kept only as a
  last-resort path for when no anchor image is known at all (e.g. before the
  first `reportVisibleRange` call).

`ImageGrid.tsx`'s `captureAnchor` now tries, in order: the **focused image**,
then the **phantom viewport anchor** (`getViewportAnchorId()`, already
continuously tracked regardless of focus mode — just wasn't being used here),
then the synthetic fallback. Both real-ID paths resolve through
`imagePositions`, so every capture starts fresh from an accurate global
position — no compounding.

## Verification

- **Unit:** `kupua/src/lib/grid-scroll-anchor.test.ts` (new, 10 tests) —
  includes a same-columns round-trip check, a repeated-cycle (6 transitions)
  no-drift check using a stable ID, and a regression test proving the OLD
  fallback-only approach *does* drift on the identical sequence (documents
  the bug it fixes). Full suite: 980/980 passed, no regressions.
- **Typecheck:** `tsc -b --noEmit` clean.
- **Live TEST, all 3 tiers, post-fix:** repeated the exact repro (4 full
  RHS+LHS toggle cycles = 16 toggles) — anchor image identity and `scrollTop`
  identical on every return to the same column count, zero drift. Also
  verified 3× window-resize-thinner-then-back cycles (two-tier) and a seek-tier
  run with a real non-zero `bufferOffset` (via `seek(600000)`) — all clean.

## Not yet done

- E2E (`npm run test:e2e`) not run this session — requires stopping the
  dev server on :3000, which is currently serving the live TEST app used for
  this investigation. Needs explicit go-ahead per session convention.
- Not committed — fix sits alongside the already-uncommitted M3
  (`extendBackward` + resize) fix in the same working tree, pending user
  review of both together.
