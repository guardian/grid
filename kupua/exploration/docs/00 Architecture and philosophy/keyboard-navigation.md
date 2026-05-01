# Keyboard Navigation

> How kupua handles keyboard scrolling and focus in grid/table views.
> Includes the page-scroll math and how it differs from kahuna.

## The Two Modes

Keyboard navigation has two modes, determined by whether an image is focused:

```
┌─────────────────────────────────────────────────────┐
│  focusedImageId === null  →  SCROLL-ONLY MODE       │
│  focusedImageId !== null  →  FOCUS MODE             │
└─────────────────────────────────────────────────────┘
```

**Nothing focused → scroll only.** Keys scroll the viewport. No image
gets highlighted. This is the default state when you load the page.

**Something focused → move focus.** Keys move the blue highlight between
images. The viewport follows the focused image.

Focus is established by clicking an image. It's cleared by clicking the
grid background (the gaps between cells, or any area not occupied by a
cell). In table view, focus clearing is not yet implemented.

## Key Matrix

| Key | No Focus (scroll only) | Has Focus |
|---|---|---|
| **↑** | Scroll up 1 row | Move focus up 1 row |
| **↓** | Scroll down 1 row | Move focus down 1 row |
| **←** | *(nothing)* | Move focus left 1 cell (grid only) |
| **→** | *(nothing)* | Move focus right 1 cell (grid only) |
| **PgUp** | Scroll up 1 page | Move focus up 1 page of rows |
| **PgDown** | Scroll down 1 page | Move focus down 1 page of rows |
| **Home** | Scroll to top (seek if windowed) | Scroll to top + focus first image |
| **End** | Scroll to bottom (seek if windowed) | Scroll to bottom + focus last image |
| **Enter** | *(nothing)* | Open focused image detail |

## Key Propagation from the Search Box

The CQL search input is a ProseMirror-based web component. When it has
focus (which is most of the time — it has autofocus), it must decide
which keys to keep for text editing and which to propagate to the list
navigation handler.

**Propagated** (reach the list navigation handler):
`ArrowUp`, `ArrowDown`, `PageUp`, `PageDown`, `Home`, `End`

**Trapped** (stay in the search box for cursor movement):
`ArrowLeft`, `ArrowRight`, all letter/number keys, modifiers, etc.

`Home` and `End` are intercepted in **capture phase** (before ProseMirror
sees them), because ProseMirror would otherwise consume them for
cursor-to-start/end-of-line. Native `<input>` elements (date pickers,
etc.) are excluded — they keep their own Home/End behaviour.

### vs Kahuna

Kahuna uses `angular-hotkeys` with `allowIn: ['INPUT']` for arrows and
PgUp/PgDown (so they work from the search box), but Home/End do NOT
have `allowIn` — so they only work when focus is outside the search box.
Kupua deliberately propagates Home/End from the search box because it's
more useful to jump to the start/end of results than to move the cursor
in a typically-short search query.

## Arrow Scrolling (↑/↓)

Simple: snap to the nearest row boundary, then add/subtract one row height.

```
scrollTop = snapToRow(scrollTop) + delta × rowHeight
snapToRow = Math.round(scrollTop / rowHeight) × rowHeight
```

`Math.round` corrects small drifts from manual scrolling or sub-pixel
positions. The result is always row-aligned.

## Page Scrolling (PgUp/PgDown)

### The Principle

> **Never re-see a row you've fully seen. Never skip a row you haven't
> fully seen.**

Getting this right required three iterations. Each fixed the previous
iteration's failure but introduced a new one.

### Iteration 1: Kahuna's Naive Approach

```
pageRows = floor(viewportHeight / rowHeight)
currentRow = round(scrollTop / rowHeight)
newScrollTop = (currentRow ± pageRows) × rowHeight
```

Snap to the nearest row, then jump by exactly `pageRows` rows.

The `round()` is the root problem. It doesn't look at the viewport at
all — it looks at `scrollTop` and snaps to whichever row boundary is
closest. When `scrollTop` is past the halfway point of a row, `round()`
snaps **forward** to the next row — skipping the one you were on. When
it's before the halfway point, `round()` snaps **backward** — and the
page jump is measured from that earlier row, re-showing content you've
already scrolled past.

Concrete example of the re-show bug:

```
          Kahuna PgDown — re-shows Row B
          ────────────────────────────────

rowHeight = 303, viewportHeight = 950, pageRows = 3

BEFORE: scrollTop = 100 (Row 0 is 67% scrolled past)
┌─────────────────────┐
│░░░ Row A  (33% vis) │  ← top 100px scrolled off
│ Row B  (full)       │
│ Row C  (full)       │
│ Row D ▄▄ (15% vis)  │
└─────────────────────┘

round(100 / 303) = round(0.33) = 0  ← snaps BACKWARD to row 0
newScrollTop = (0 + 3) × 303 = 909

AFTER: scrollTop = 909
┌─────────────────────┐
│ Row C  (full)       │  ← Row C was FULLY visible before!
│ Row D  (full)       │
│ Row E  (full)       │
│ Row F ▄▄ (15% vis)  │
└─────────────────────┘

Row B: fully visible before, now gone — OK.
Row C: FULLY VISIBLE BEFORE, FULLY VISIBLE AGAIN — wasted.
Row D: only 15% was visible, now full — that's the only useful new row.
```

The `round()` snapped backward to row 0, so the jump was measured from
row 0 instead of where the viewport actually was. This puts row C (which
was fully visible, nowhere near the edge) right at the top of the new
page. A full row of re-shown content, not at an edge — in the middle of
what you'd already seen.

The skip bug is the mirror image. If `scrollTop = 200` (66% past row 0),
`round(200/303) = 1`, and the jump starts from row 1 instead of row 0.
The partial row at the bottom disappears without ever being fully shown.

**Verdict:** Simple, always row-aligned. Systematically re-shows or skips
rows depending on whether `round()` snaps backward or forward. The
re-show case is especially jarring because the repeated row isn't at the
viewport edge — it's a row you saw in full, now occupying prime screen
real estate again.

### Iteration 2: Viewport-Edge Formula (first attempt)

```
PgDown: floor((scrollTop + viewportHeight) / rowHeight) × rowHeight
PgUp:   ceil(scrollTop / rowHeight) × rowHeight − viewportHeight
```

Instead of snapping `scrollTop` and offsetting, look at the viewport
*edge* in the direction of travel. The partial row at that edge becomes
the anchor for the new page.

```
          Viewport-edge PgDown — non-aligned bottom
          ───────────────────────────────────────────

BEFORE                          AFTER
┌─────────────────────┐         ┌─────────────────────┐
│ Row A  (full)       │         │ Row D  (top, full)  │
│ Row B  (full)       │         │ Row E  (full)       │
│ Row C  (full)       │         │ Row F  (full)       │
│ Row D ▄▄▄ (40% vis) │         │ Row G ▄▄▄ (40% vis) │
└─────────────────────┘         └─────────────────────┘

floor(bottom / rowHeight) = row D (partial) → becomes new top. ✓
Rows A–C (fully seen) gone. ✓  Row D's unseen 60% now visible. ✓
```

Works correctly when the bottom falls mid-row. Fails on **direction
reversal** when the bottom is exactly row-aligned.

PgUp always leaves the viewport bottom exactly on a row boundary (the
formula `ceil(top/rowHeight) × rowHeight` guarantees it). So PgUp → PgDown
always hits this failure:

```
          Bug: PgUp → PgDown re-shows the bottom row
          ────────────────────────────────────────────

rowHeight = 303, viewportHeight = 950

AFTER PgUp: scrollTop = 262, bottom = 1212 (exactly 4 × 303)
┌─────────────────────┐
│▄ Row 0  (13% vis)   │
│ Row 1  (full)       │
│ Row 2  (full)       │
│ Row 3  (full) ──────│← bottom = 1212, exactly on row boundary
└─────────────────────┘

Row 3 occupies 909–1212. It ends exactly at the bottom. Fully visible.
Row 4 starts at 1212. It has 0px visible.

floor(1212 / 303) = 4.  target = 4 × 303 = 1212.

AFTER: scrollTop = 1212
┌─────────────────────┐
│ Row 4  (full)       │
│ Row 5  (full)       │
│ Row 6  (full)       │
│ Row 7 ▄▄▄ (partial) │
└─────────────────────┘
```

In this specific trace, Row 4 had 0px visible, so the result is
technically correct. But the problem manifests with different viewport
sizes where the aligned boundary falls such that `floor()` of an exact
integer selects a row that WAS fully visible. The `floor()` of an exact
multiple is itself — it doesn't distinguish between "this row is fully
visible and ends here" and "this row starts here with 0px showing." The
formula treats both cases identically, and in the former case, it
re-shows a fully-visible row.

Confirmed by hands-on testing: PgUp then PgDown showed the same bottom
row reappearing at the top.

**Verdict:** Correct for the common case (non-aligned viewport edges).
Breaks on direction reversal when the viewport edge sits exactly on a
row boundary.

### Iteration 3: Boundary-Aware Formula (final, current)

```
PgDown:
  bottom = scrollTop + viewportHeight
  if bottom is row-aligned:
    target = bottom                          ← skip past all full rows
  else:
    target = floor(bottom / rowHeight) × rowHeight  ← partial row to top

PgUp:
  top = scrollTop
  if top is row-aligned:
    target = top − viewportHeight            ← skip past all full rows
  else:
    target = ceil(top / rowHeight) × rowHeight − viewportHeight
```

The key insight: when the viewport edge is exactly row-aligned, there
IS no partial row at that edge — every visible row is fully visible.
So we skip past them all. The next page starts (or ends) right at the
aligned edge.

```
          Boundary-aware PgDown — handles both cases
          ────────────────────────────────────────────

CASE 1: Bottom NOT aligned      CASE 2: Bottom IS aligned

BEFORE                          BEFORE
┌─────────────────────┐         ┌─────────────────────┐
│ Row A  (full)       │         │▄ Row A  (5% vis)    │
│ Row B  (full)       │         │ Row B  (full)       │
│ Row C  (full)       │         │ Row C  (full)       │
│ Row D ▄▄▄ (40%)    │         │ Row D  (full) ──────│← aligned
└─────────────────────┘         └─────────────────────┘

AFTER                           AFTER
┌─────────────────────┐         ┌─────────────────────┐
│ Row D  (top, full)  │         │ Row E  (top, full)  │
│ Row E  (full)       │         │ Row F  (full)       │
│ Row F  (full)       │         │ Row G  (full)       │
│ Row G ▄▄▄ (40%)    │         │ Row H ▄▄▄ (partial) │
└─────────────────────┘         └─────────────────────┘

Case 1: Row D was partial → now full at top. ✓
Case 2: Row D was full → gone. Row E (unseen) at top. ✓
```

**Round-trip guarantee:** PgDown → PgUp returns to exactly the same
scrollTop (clamped at 0 or scrollMax). This is because the two formulas
are mathematical inverses of each other for the aligned/non-aligned cases.

**Row alignment trade-off:** PgDown always produces a row-aligned scrollTop.
PgUp does NOT when the viewport height isn't a multiple of the row height
(which is almost always). This is inherent — you can't have both
"bottom row fully visible" and "scrollTop is a row multiple" when the
viewport doesn't divide evenly. The no-skip/no-re-show guarantee wins.

**Float safety:** `clientHeight` can be fractional in some browsers. The
boundary check uses a 0.5px epsilon: `remainder < 0.5 || rowHeight - remainder < 0.5`.

## Home/End

**No focus:** Scroll to absolute top (Home) or bottom (End). If the
buffer is windowed (deep in a 9M-image dataset), this triggers a seek
to offset 0 or `total - 1`.

**Has focus:** Same scroll/seek, PLUS focus the first or last image.
When seeking is required, the focus is deferred via
`_pendingFocusAfterSeek` in the search store — the post-seek effect
picks it up after the buffer is replaced.

## Implementation: Where the Code Lives

| Concern | File | Function/section |
|---|---|---|
| All keyboard logic | `hooks/useListNavigation.ts` | `useListNavigation` hook |
| Row-snap helper | same | `snapToRow()` |
| Page-scroll math | same | `pageScrollTarget()` |
| Key propagation from CQL | `components/CqlSearchInput.tsx` | `keysToPropagate` array |
| Native input guard | `lib/keyboard-shortcuts.ts` | `isNativeInputTarget()` |
| Post-seek focus | `stores/search-store.ts` | `_pendingFocusAfterSeek` |
| Post-seek focus effect | `hooks/useScrollEffects.ts` | Effect #6 |

## Full Comparison: Kupua vs Kahuna

| Aspect | Kahuna | Kupua |
|---|---|---|
| **Focus concept** | None. Keys only scroll. | Two modes: scroll-only and focus-move. |
| **Arrow keys** | Scroll by 1 row | Scroll (no focus) or move focus (has focus) |
| **←/→ in grid** | Not handled | Move focus within row (only when focused) |
| **←/→ from search box** | N/A (not propagated) | Trapped — stay in search box for cursor movement |
| **Page scroll math** | `round(scrollTop/rowHeight) ± pageRows` | Viewport-edge formula with boundary detection |
| **Page re-show/skip** | Can re-show or skip rows | Never re-shows, never skips |
| **Home/End from search box** | Not propagated (`allowIn` absent) | Propagated (capture phase intercept) |
| **Home/End + focus** | N/A (no focus) | Focus first/last image when focus exists |
| **Home/End + deep buffer** | N/A (no windowed buffer) | Triggers seek to offset 0 or total-1 |
| **Row alignment** | Always (round→multiply) | PgDown: always. PgUp: only if viewport divides evenly by row height. |
| **Scroll container** | `window` (page-level scroll) | Scroll div within the app (`.hide-scrollbar`) |
| **Event system** | angular-hotkeys (`allowIn: ['INPUT']`) | `document` listeners (bubble + capture phase) |

### If You Want to Revert to Kahuna's Math

Replace `pageScrollTarget()` in `useListNavigation.ts` with:

```typescript
function pageScrollTarget(
  scrollTop: number,
  rowHeight: number,
  viewportHeight: number,
  direction: "up" | "down",
): number {
  const pageRows = Math.max(1, Math.floor(viewportHeight / rowHeight));
  const snapped = Math.round(scrollTop / rowHeight) * rowHeight;
  return direction === "down"
    ? snapped + pageRows * rowHeight
    : snapped - pageRows * rowHeight;
}
```

This is simpler, always row-aligned, but will re-show fully-visible rows
and skip partially-visible ones at viewport-edge boundaries. The original
kahuna code is in `gu-lazy-table.js` lines 159–188.


