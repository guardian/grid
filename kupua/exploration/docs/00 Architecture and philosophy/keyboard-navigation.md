# Keyboard Navigation

> How kupua handles keyboard scrolling and focus in Grid, Table and Justified views.
> Describes input ownership, row/page movement and destination placement.

## The Two Modes

Keyboard navigation has two modes, determined by effective focus:

```text
Explicit mode + focused image + empty selection -> FOCUS MODE
Otherwise                                      -> SCROLL-ONLY MODE
```

**No effective focus: scroll only.** This includes no stored focus, phantom mode,
and active selection hiding an older explicit focus. Navigation does not create
or move that hidden focus. Phantom position follows the viewport normally.

**Effective explicit focus: move focus.** Keys move the highlight between images;
the viewport follows the focused image.

Focus is established by clicking an image. It's cleared by clicking the
grid background (the gaps between cells, or any area not occupied by a
cell). In table view, focus clearing is not yet implemented.

## Key Matrix

| Key | No Effective Focus (scroll only) | Effective Explicit Focus |
|---|---|---|
| **↑** | Scroll up 1 row | Move focus up 1 row |
| **↓** | Scroll down 1 row | Move focus down 1 row |
| **←** | No-op in grid; horizontal scroll in table | Move focus left 1 cell in grid; horizontal scroll in table |
| **→** | No-op in grid; horizontal scroll in table | Move focus right 1 cell in grid; horizontal scroll in table |
| **PgUp** | Scroll up 1 page | Move focus up 1 page of rows |
| **PgDown** | Scroll down 1 page | Move focus down 1 page of rows |
| **Home** | Scroll to top (seek if windowed) | Scroll to top + focus first image |
| **End** | Scroll to bottom (seek if windowed) | Scroll to bottom + focus last image |
| **Enter** | *(nothing)* | Open focused image detail |

### Justified spatial navigation

Horizontal keys follow result order. Vertical movement chooses the nearest horizontal
centre in the adjacent row, with result order breaking ties; page movement uses actual
row geometry. Off-buffer row/page intent uses the existing snap-back lifecycle and admitted
destination geometry. Newer input supersedes it; selection/phantom paging cannot promote
hidden focus. The fixed-row arithmetic below applies to Grid/Table, not synthetic columns
or an average row height for Justified.

### Fixed-Grid Partial Rows

Grid uses the shared origin-aware row mapping, not `floor(localIndex / columns)`
with an assumed full first row. A buffer can begin partway across a global row;
leading layout space has no image index and cannot receive focus or selection.
Focused Page Up/Down uses the actual row count, preserves the column where possible
and clamps to real images, including a partial final row. Arrow movement still follows
result order or one fixed row, and scroll-only paging retains its viewport-edge rules.
See the [fixed-row window policy](03-scroll-architecture.md#fixed-row-window-policy).

### Deferred End

An End that needs data always retains its tail-scroll obligation, independently
of whether it may change focus. The pending intent captures the initiating focus
permission and image, then belongs to the existing seek request. Clearing selection
or enabling explicit mode during the wait cannot grant permission retroactively.
Completion only moves focus when the originating image is still current and
effective explicit focus remains enabled without selection.

A newer seek does not inherit End's edge intent. Home can cancel a pending End and
reuse an already-loaded first page without fetching it again. An uncommitted
failed/aborted request releases only its own intent; successful publication leaves
one-shot consumption to the scroll hook. These ownership rules do not establish a
general symmetric Home/End cancellation guarantee.

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

### Scroll-Only Paging

Fixed-row paging uses the viewport edge in the direction of travel. A partial
edge row becomes fully visible on the next page; an aligned edge advances to
unseen rows. Table uses the viewport height excluding its header. The resulting
target is clamped to the scroll container's available extent.

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

Directional reversal applies the same edge rules and clamping. Row-boundary
rounding means it need not restore an arbitrary fractional starting offset.

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


