# Focus, Phantom Focus, and the Position Preservation Engine

> **Created:** 2026-04-17
> **Status:** Living document.
> **Companion to:** `01-frontend-philosophy.md` § "Never Lost" Principle.
> **Purpose:** Define the focus model, explain why we built explicit focus knowing
> we'd hide it, and lay out the position-preservation engine that underpins both
> visible and invisible modes.

---

## 1. The Scaffolding Principle

Kupua has an explicit focus concept: a single highlighted image, set by click or
keyboard, visually marked with a ring. Users of Grid (which has no such concept —
single-click enters image detail) will see this as an unwanted extra click.

We built it anyway.

The reasoning: **the hardest position-preservation problems are solvable only when
there is an explicit anchor.** Keeping a focused image in view across density
changes, panel openings, window resizes, sort-order changes, and search-context
changes requires an identified image to anchor to. Without one, you're guessing
based on viewport geometry — fragile and approximate.

Explicit focus is scaffolding. We erect it first, solve every position-preservation
problem against the strictest possible requirement ("this specific image must stay
visible"), verify it works, then selectively hide the scaffolding. What remains is
an invisible engine that preserves position just as rigorously — but from the user's
perspective, there's nothing extra to click.

The order matters. You cannot retrofit "Never Lost" onto an app that never tracked
position. You _can_ hide a tracker that already works.

---

## 2. The Position Preservation Engine

At the core of Kupua is a position-preservation engine. It is **always running**,
regardless of whether focus is visible. Its job: the user should never feel lost.

### 2.1 What It Tracks

The engine maintains a **position anchor** — the identity of the image that
represents "where the user is" in the result set. This anchor exists in two forms:

| Form | What it is | When it's active |
|------|-----------|-----------------|
| **Explicit focus** | A user-set `focusedImageId` with a visible ring | User clicked or keyboard-navigated to an image |
| **Phantom focus** | An invisible `viewportAnchorId` — the image nearest the viewport centre | No explicit focus is set (or explicit focus is disabled) |

Phantom focus is updated silently on every scroll frame. Explicit focus overrides
phantom focus when set — the engine anchors to whichever is active, preferring
explicit.

### 2.2 What It Guarantees

The position anchor (whether explicit or phantom) must survive:

| Scenario | Guarantee |
|----------|-----------|
| **Density change** (table ↔ grid ↔ detail) | Anchor image appears at the same viewport-relative position in the new view |
| **Panel open/close** (left or right) | Anchor image stays in view despite width change |
| **Window resize** | Same |
| **Sort order change** (with explicit focus) | Focused image found in re-sorted results, scrolled to its new position |
| **Sort order change** (phantom focus only) | Relaxed — reset to top (see §4) |
| **Seek** (scrubber jump to distant position) | Explicit focus persists as durable state; image is off-screen but remembered. Seeking back restores it. Phantom focus resets to new viewport centre |
| **Search context change** (query/filter change) | If the anchor image exists in new results → stay on it. If not → find nearest surviving neighbour. If none survive → accept defeat, reset to top |
| **Buffer eviction** (image scrolled out of the 1000-item window) | Explicit focus persists as ID even when the image is no longer in the buffer. Phantom focus tracks whatever is currently visible |

### 2.3 Focus Surviving Search Context Change

This is the crown jewel — the guarantee nobody else provides.

**Primary path (covers ~90% of real use):**

1. Image A is focused. User changes query (e.g., focuses a Reuters photo, then
   searches `credit:"Reuters"`).
2. New results arrive. The engine checks: is image A in the new result set?
3. **Yes →** Keep A focused, scroll to its new position. Done.

This path is the one that matters most. When a user narrows a search around a
focused image, that image almost always survives the new query. The user should
see it, still focused, staring back at them.

**Fallback path (best-effort, accept graceful failure):**

4. Image A is **not** in the new results. The engine checks the IDs of A's
   neighbours from the old buffer (±N images, nearest first, alternating
   forward/backward).
5. First surviving neighbour found → focus it, scroll to its new position.
   The user is "in the neighbourhood" — they recognise nearby images.
6. No neighbours survive (completely disjoint result sets — the user typed an
   entirely different query) → reset to top. This is acceptable because the
   context change was so large that adjacency is meaningless.

**Implementation notes:**

- Neighbour IDs are cheap — they're already in the buffer. Cache ±10–20 IDs
  before initiating the search. This is fragile if the focused image was near
  the buffer edge, but that's acceptable — the fallback to top is not a
  catastrophe when we've tried hard enough first.
- Checking whether image A (or its neighbours) exist in the new result set can
  be done by scanning the first page of new results (if they happen to be there)
  or by a targeted ES query. Start with the cheap scan; add the query later if
  needed.

### 2.4 Focus Surviving Seek

When the user scrubber-jumps to a distant position, the buffer is replaced
entirely. Under explicit focus:

- `focusedImageId` remains set (durable state). The image is off-screen and not
  in the buffer, but focus is not cleared.
- The visual ring is not rendered (the image isn't in view).
- If the user seeks back to the neighbourhood of the focused image, focus
  reappears naturally as the image re-enters the buffer.
- Keyboard navigation (↓↑) from a distant viewport: **snaps back to the focused
  image's position first** (a seek), then moves from there. This is "go back to
  where I was, then navigate" — the focus acts as a bookmark.

Under phantom focus: seek simply resets the phantom anchor to whatever is now
in the viewport centre. No memory of the previous position. This is correct —
phantom focus tracks "where you are," and a seek is "take me somewhere else."

---

## 3. Two UI Modes, One Engine

The position-preservation engine runs identically in both modes. The difference
is purely what the user sees and can interact with.

### 3.1 Explicit Focus Mode (development default, power users)

| Interaction | Effect |
|-------------|--------|
| Single-click an image | Sets explicit focus (visible ring) |
| Double-click an image | Enters image detail |
| Arrow keys | Move focus between images |
| PageUp / PageDown | Move focus by one page of rows |
| Enter | Opens focused image in detail |
| Backspace (from detail) | Returns to list, focus on the image that was open |
| `f` key | Fullscreen preview of focused image (from list/grid) |
| Escape (from fullscreen preview) | Returns to list/grid |
| Escape (from fullscreen within detail) | Returns to image detail |
| Home / End | Focus first / last image, scroll to it |

This is the mode where all position-preservation behaviours are developed and
tested. It is the strictest mode — every guarantee in §2.2 is actively
exercised.

### 3.2 Phantom Focus Mode (mobile, optional desktop preference)

| Interaction | Effect |
|-------------|--------|
| Single-click / tap an image | Enters image detail directly |
| Arrow keys | Scroll by rows (no focus movement, no focus reveal) |
| PageUp / PageDown | Scroll by one page of rows |
| Enter | No effect (no focused image to open) |
| `f` key | No effect (no focused image to preview) |
| Backspace (from detail) | Returns to list; phantom focus set to the image that was open |
| Escape (from fullscreen within detail) | Returns to image detail |
| Home / End | Scroll to top / bottom (no focus) |
| Swipe left/right (touch) | Navigate prev/next in detail view |

Focus is **completely invisible and unreachable.** There is no arrow-key path to
reveal it, no shift-click, no long-press (for now — see §6 on selections). The
only entity that knows about position is the engine. From the user's perspective,
this mode behaves like Grid/Kahuna: click to enter, back to return.

But under the hood, the phantom focus engine is tracking position. When the user
returns from detail, they land where they were. When they change density, their
position is preserved. When they resize the window, the same images stay visible.
They get all of "Never Lost" without ever seeing a focus ring.

### 3.3 Why Not Reveal Focus on Arrow Keys?

It's tempting: keep focus hidden, but reveal it when the user presses an arrow
key (desktop keyboard users would "discover" focus). Two reasons not to:

1. **Once revealed, click-to-enter breaks.** If pressing ↓ creates a visible
   focus, the user now expects single-click to enter detail (they can see the
   focused image — why would they double-click?). But single-click sets focus in
   explicit mode. The modes become muddled, and you need a third hybrid mode.

2. **Users expect arrows to scroll rows.** Grid/Kahuna users (and most app users)
   expect ↑↓ to scroll the viewport by one row. In explicit focus mode, arrows
   move the focus ring, which feels different — you traverse one image at a time
   through a full page of thumbnails before the viewport starts scrolling. Users
   who prefer the scrolling behaviour would be surprised by a mode that silently
   switches to focus behaviour when they press an arrow key.

The clean answer: phantom focus mode has no focus affordance. Period. If we
later need keyboard-accessible focus in phantom mode (e.g. accessibility
requirements), we design it intentionally rather than letting it leak.

### 3.4 The Preference

A `focusMode: "explicit" | "phantom"` setting, persisted in localStorage.

- **Desktop default:** `explicit` (during development; may flip to `phantom`
  once users migrate from Kahuna, if research confirms the "extra click"
  complaint outweighs the power-user benefit).
- **Mobile / `pointer: coarse`:** always `phantom`, ignoring the preference.
  Explicit focus is meaningless without a mouse and keyboard.

The preference controls:
- Whether single-click sets focus or enters detail
- Whether the focus ring renders
- Whether arrow keys move focus or scroll rows
- Whether `Enter` and `f` operate on the focused image

It does **not** control:
- The position-preservation engine (always on)
- Phantom focus tracking (always on)
- Sort-around-focus behaviour (uses explicit focus if available, phantom otherwise)
- Density-change position restoration (uses best available anchor)

---

## 4. The Relaxation Model

The scaffolding principle means we build the maximum guarantee first, then
**explicitly relax** it in specific scenarios where a weaker behaviour is more
helpful. Relaxation is always a deliberate decision, never a bug.

Current relaxations:

| Scenario | Explicit focus behaviour | Phantom focus behaviour | Rationale |
|----------|------------------------|------------------------|-----------|
| **Sort order change** | Keep focused image in view at new position | Reset to top | When the user changes sort order without a specific image in mind (phantom), they want to see "what's first in the new order," not "where my phantom anchor ended up" |
| **Scrubber seek** | Focus persists (durable), seek back restores it | Phantom resets to new position | A deliberate seek is "take me there" — phantom should follow. But explicit focus is a bookmark the user chose to set |
| **Completely disjoint search** | Focus cleared, reset to top | Phantom reset to top | Context change so large that any anchor is meaningless |

Future relaxation candidates (not yet decided):

| Scenario | Question |
|----------|----------|
| **Filter narrows results and focused image survives** | Should we scroll to it, or let the new results start from the top? |
| **Filter narrows results and focused image is gone** | Neighbour search, or just top? |
| **User explicitly clicks "New Search" / clears query** | Preserve position or reset? |
| **Returning from a long detail session** | The user spent 5 minutes in detail, navigated through 50 images. Where do they land — on the last image they viewed, or on the image they entered from? |

Each relaxation should be discussed and decided individually. The default is
always the strictest guarantee; we only relax with a reason.

---

## 5. Relationship to Selections

Selections are a separate concept, orthogonal to focus. They will be designed
and implemented as a separate workstream. Brief notes on how they interact:

- **Selection is multi-persistent; focus is single-ephemeral.** Selecting images
  does not move focus. Moving focus does not alter the selection.
- **Selection survives density changes** (same as focus — "Never Lost" applies).
- **Selection does not need position preservation** in the same way focus does.
  Selected images are a *set*, not a *position*. When search context changes,
  selected images that leave the result set are silently dropped.
- **Selection gestures must not conflict with focus/detail entry.** In explicit
  focus mode, single-click = focus, double-click = detail, so selection needs a
  separate gesture (checkbox, Ctrl/Cmd-click, or a selection-mode toggle). In
  phantom focus mode, single-click = detail, so selection again needs a separate
  gesture (checkbox, long-press on mobile, or selection-mode toggle).
- **The metadata/details panel** shows metadata for: (a) the selection, if any
  images are selected; or (b) the focused image, if no selection but explicit
  focus exists; or (c) nothing, if neither. Selection takes priority.

Detailed selection design will be documented separately when we begin that work.

---

## 6. How Kahuna Works (for reference, not as a constraint)

Grid's existing frontend has no focus concept. Its interaction model:

- **Single-click** an image in the search grid → enters image detail.
- **Checkbox on hover** → selects/deselects the image for batch operations.
- **Once images are selected**, clicking another image also selects it (selection
  mode is sticky). A "Clear selection" button exits selection mode.
- **Arrow keys** scroll the grid by rows. No concept of focus movement.
- **Info panel** is toggled by a button, shows metadata for the selected image(s).
  When multiple images are selected, it shows shared values and flags conflicts.
- **Position preservation** is minimal: a scroll-position service remembers where
  you were when you entered detail, and "Back to search" restores it. No
  preservation across sort changes, filter changes, panel toggles, or resizes.

Kupua's phantom focus mode is designed to feel familiar to Kahuna users (click to
enter, arrows to scroll) while providing dramatically better position preservation
invisibly. The explicit focus mode is a power-user capability that Kahuna never
offered.

---

## 7. Implementation Roadmap

Priority order for the position-preservation engine:

1. **Focus survives search context change** — the §2.3 algorithm. This is the
   hardest guarantee and the one that makes Kupua unique. Primary path first
   (focused image found in new results), fallback path (neighbours) second.

2. **Focus survives seek** — durable `focusedImageId` that persists across buffer
   replacement. Arrow-key snap-back to focused position.

3. **Promote viewport anchor to first-class phantom focus** — give it the same
   guarantees as explicit focus (density change, panel toggle, resize are already
   there; add search-context-change and sort-change relaxation).

4. **Phantom focus mode** — the `focusMode` preference and `pointer: coarse`
   detection. Single-click/tap enters detail. Focus ring hidden. Arrow keys
   scroll rows.

5. **Selection** — separate workstream. Checkbox + Ctrl/Cmd-click in explicit
   mode, checkbox + long-press in phantom mode. Batch operations, metadata panel
   integration.

Each step builds on the previous. Step 1 is the architectural heart; step 4 is
a UI skin over a working engine; step 5 is orthogonal.
