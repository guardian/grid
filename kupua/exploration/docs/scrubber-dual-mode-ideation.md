# The Scrubber's Two-Soul Problem

> **Created:** 2026-03-28
> **Last updated:** 2026-03-29 — marked Steps 1 & 2 as complete, annotated
> bug analysis with fix status.
>
> **Context:** Ideation for making the scrubber work as both a navigation tool
> for hundreds of thousands of results AND a smooth scrollbar for smaller sets
> (up to ~12k). Referenced from `AGENTS.md` → What's Next / Deferred items.

## Naming

The scrubber has two interaction modes. We call them:

- **Scroll mode** — the scrubber directly scrolls the content container.
  All results are in the buffer. Drag moves content in real time. No
  network requests during interaction. This is what a scrollbar does.
- **Seek mode** — the scrubber is a position-seeking control for a
  windowed buffer. Drag moves the thumb + tooltip but content doesn't
  update until pointer-up, when `seek()` replaces the buffer at the
  target position. This is a teleporter with a preview.

The implementation variable `allDataInBuffer` (`total <= bufferLength`)
determines which mode is active. These names replace it in discussion.

## What the problem was

> **Status: Bugs A, B, and C below are all fixed.** Steps 1 and 2 of
> the implementation plan are complete. This section is preserved as
> historical context for the design decisions. See "Ordered steps" for
> current status.

The scrubber operated in scroll mode and seek mode, but:

1. **Scroll mode activated too late and too unpredictably.** The initial
   search always fetched `PAGE_SIZE = 200`. Scroll mode required
   `total <= bufferLength`, so it was only immediately active for ≤200
   results. For 201–1000 results, it activated only after enough extends
   filled the buffer — meaning the user started in seek mode and
   transitioned mid-session. For 1001+ results, it never activated
   (buffer capped at 1000). A user with 700 results grabbed the scrubber,
   dragged, and **nothing happened** — content didn't move until
   pointer-up.
   **→ Fixed by Step 1:** `SCROLL_MODE_THRESHOLD` (env-configurable,
   default 1000) + `_fillBufferForScrollMode()` two-phase fetch.

2. **Scroll mode had visual bugs.** When it WAS active (≤200 results),
   the thumb "danced" (jumped erratically), "ran away" from the pointer,
   and looked nothing like a native scrollbar. Details in the bug analysis
   below.
   **→ Fixed by Step 2:** symmetric position mapping, inline `top`
   removed from JSX, scroll-listener-based continuous sync.

3. **The gap between 1,001 and ~60,000 results was pure seek mode.** Users
   who filtered to one day (~60k max, often much less) and just wanted to
   scroll were forced into the teleporter interaction.
   **→ Partially addressed by Step 1** (up to threshold). Step 4 (raise
   threshold) is pending.

And the nonlinear research (which was tried and shelved) was essentially
trying to patch this — make the teleporter *feel* like a scrollbar. But
you can't, because the fundamental interaction is different: a scrollbar
moves content continuously, a seek replaces it discretely.

## Bug analysis (scroll mode, pre-fix state)

> **All three bugs below are fixed.** This section is preserved as the
> root-cause analysis that informed the fixes.

### Bug A — Thumb "runs away" from pointer ✅ FIXED

`positionFromDragY()` mapped pixel → position using:
```
ratio = (adjustedY - rect.top) / maxTop    →  pos = round(ratio * (total - 1))
```
`thumbTopFromPosition()` reversed it:
```
top = (position / total) * th
```
The forward path used `(total - 1)`, the reverse used `total`. For 103
results on an ~800px track with a large thumb, this `102 vs 103`
asymmetry put the thumb consistently above the pointer. The bigger the
thumb relative to the track (i.e. the fewer results), the worse it got.

**Fix:** Both paths now use `total - visibleCount` as the max position,
matching native scrollbar math: `scrollTop / (scrollHeight - clientHeight)`.

### Bug B — Thumb "dances" / jumps wildly ✅ FIXED

Feedback loop during drag:
1. `onPointerMove` → `applyThumbPosition()` wrote `thumb.style.top = X`
   (direct DOM write)
2. Same handler → `scrollContentTo()` → content `scrollTop` changed
3. Content scroll → virtualizer → `reportVisibleRange()` → React
   re-rendered `Scrubber` with new `currentPosition`
4. Re-render computed `thumbTop` from `effectivePosition` and applied it
   via **inline JSX style** `style={{ top: thumbTop }}` — overwriting the
   direct DOM write from step 1

Even when the values nominally matched, there were rounding differences
between `thumbTopFromPosition()` (reads live `clientHeight`) and the
render-time formula (uses `trackHeight` from ResizeObserver state). The
two fought each other on every frame.

Additionally: `isDragging` is React state set via `setIsDragging(true)`.
The first `onPointerMove` may fire before React commits that state. During
that window, the thumb has `transition: top 100ms` (the non-dragging
style) and React sets a slightly different `top` → animated jump.

**Fix:** Inline JSX `style` on the thumb div no longer includes `top`.
Thumb position is controlled exclusively via direct DOM writes
(`applyThumbPosition` during drag/click, `useEffect` sync otherwise).
In scroll mode, a separate scroll-listener effect computes thumb
position from the continuous scroll ratio
(`scrollTop / (scrollHeight - clientHeight)`) — pixel-perfect match with
native scrollbar behavior, no dependency on the virtualizer's discrete
`visibleRange.start`.

### Bug C — Activation threshold is broken ✅ FIXED

`allDataInBuffer` = `total <= bufferLength`. `bufferLength` = number of
results currently in the buffer, which started at `PAGE_SIZE` (200) and
grew via extends up to `BUFFER_CAPACITY` (1000). So:
- **≤200 results:** scroll mode immediately. Worked (minus bugs A/B).
- **201–1000 results:** started in seek mode. Transitioned to scroll mode
  only after enough manual scrolling triggered extends to fill the buffer.
  Unpredictable, confusing.
- **1001+ results:** always seek mode. Never transitioned.

This was the most critical bug. The mode that's supposed to feel like a
scrollbar was unreachable for the most common "small result set" sizes.

**Fix:** `SCROLL_MODE_THRESHOLD` (env-configurable via
`VITE_SCROLL_MODE_THRESHOLD`, default 1000). When `total ≤ threshold`,
`_fillBufferForScrollMode()` eagerly fetches all remaining results in
PAGE_SIZE chunks immediately after the initial search. Two-phase: user
sees first 200 results instantly, scroll mode activates ~200–500ms later
when the buffer fill completes.

## Why this is hard (the real constraint)

The bottleneck isn't the scrubber UI — it's the **buffer architecture**. With BUFFER_CAPACITY=1000 and PAGE_SIZE=200, the maximum you can keep in memory is 1,000 images. For 12k results, that's only 8% coverage. You'd need ~12 extends to traverse the full set, each with ES latency.

Kahuna "solved" this by keeping a sparse array of up to ~10k results in memory (gu-lazy-table). It was horrible for memory and couldn't go past 10k, but it *felt* like scrolling because the virtualizer had a scrollHeight proportional to the total and could render any row on demand from the sparse array.

## Ideas — in order of how promising they are

### 1. Adaptive buffer capacity

The simplest lever: **if total ≤ N, increase BUFFER_CAPACITY to match total.**

- Total ≤ 12,000? Set buffer capacity = total. One search fetches everything (or a few extends do). The scrubber enters `allDataInBuffer` mode. Native scrollbar feel.
- Total > 12,000? Current windowed buffer. Scrubber is a seek control.

The threshold N is tunable. At ~5-10KB/image, 12k images = 60-120MB. That's... marginal on mobile, fine on desktop. You could go to 20k comfortably. The question is whether the *initial fetch* is acceptable. 12k results in one `from/size` query is legal in ES (max_result_window=101k on real clusters), takes ~200-500ms, and transfers ~60-120MB of JSON. That's... a lot. But you could:

- Fetch in chunks (3-4 pages of 3-4k) immediately on search, with the scrubber showing loading state
- Use `_source` filtering to only fetch the fields you actually display (thumbnail URL, title, upload time, dimensions, credit) — probably brings per-image size to ~1-2KB, so 12k = 12-24MB

**Pro:** Dead simple. No new architecture. The scrubber already has `allDataInBuffer` mode.
**Con:** There's still a "mode switch" threshold where UX changes. Users near the boundary feel the discontinuity. Also, eagerly loading 12k results for every date-filtered search is wasteful if the user just glances and refines.

**Honest take:** This is the most promising approach. The discontinuity is real but acceptable — most "I only care about one day" users would hit <12k. The ones who don't are already in "I'm exploring a large set" mode and expect different interaction.

### 2. Continuous extend during drag (instead of seek-on-pointer-up)

Instead of waiting for pointer-up, **fire extends continuously during drag** with heavy debouncing. The buffer slides as the user drags, and the content view updates in real-time (with loading placeholders for gaps).

- Small slow drags: extend forward/backward keeps up. Feels like scroll.
- Fast large drags: falls behind, shows placeholders, catches up on pause.

This is close to what Google Photos does for its timeline scrubber on web.

**Pro:** No mode switch. Works at any scale.
**Con:** Massively more complex. You'd need to manage:
- Cancelling in-flight extends when drag direction reverses
- Placeholder rendering for not-yet-loaded rows
- Visual jank when the buffer evicts rows the user is looking at
- Seek-during-drag (user drags fast, you need to teleport the buffer ahead, not just extend)
- Cooldown logic becomes much harder

This is essentially rebuilding the scrubber interaction model from scratch. The complexity is enormous and the benefit is "slightly smoother drag for the 1k-60k range." The seek-on-pointer-up model is honest and predictable.

### 3. Virtual scrollHeight trick (faking it)

Set the content container's `scrollHeight` to `total * rowHeight` (or a proportional approximation), even though only BUFFER_CAPACITY rows exist in the DOM. The native scrollbar appears and behaves normally. When the user scrolls to a region outside the buffer, intercept the scroll position, translate it to a global offset, and seek.

This is essentially what AG Grid's server-side row model does, and what TanStack Virtual's `estimateSize` enables.

**Pro:** Native scrollbar feel. No custom scrubber needed for this range.
**Con:**
- At 60k items × ~300px row height = 18M px scrollHeight. Browsers cap at ~33M px (Chrome), so this works for 60k but fails at 100k+.
- You'd still need the custom scrubber for >100k. So now you have THREE modes.
- The "scroll to empty region → seek → content appears" transition creates visual jank (blank rows, then pop-in).
- Fighting the browser's native scroll is a recipe for platform-specific bugs.

**Actively against this approach.** It's the worst of both worlds — complex, fragile, and still needs the custom scrubber for the case that actually matters (hundreds of thousands).

### 4. Hybrid: scrubber + native scrollbar coexist

Show the custom scrubber AND restore the native scrollbar. The native scrollbar handles within-buffer scrolling (which it does perfectly). The scrubber handles global seeking. They're two different controls for two different purposes.

**Pro:** Honest separation of concerns. The native scrollbar gives smooth 60fps scroll physics. The scrubber gives global navigation.
**Con:** Two scrollbar-like things on the right side of the screen is confusing. Users would ask "which one do I use?" You'd need clear visual differentiation and good documentation of the mental model. It's ugly.

### 5. "Just fetch everything for small sets" variant of #1 (RECOMMENDED)

Don't change BUFFER_CAPACITY — instead, when total ≤ threshold, set PAGE_SIZE = total and fetch everything in one shot in `search()`. The buffer fills completely, `allDataInBuffer` becomes true, scrubber switches to scroll mode. On the next search (user changes query), buffer resets.

This is functionally identical to #1 but more surgical — you're just tweaking the initial fetch size, not the buffer capacity constant.

**Combined with:** Making the scrubber look and feel as close to the native scrollbar as possible when in `allDataInBuffer` mode — or replacing it with the native scrollbar entirely when the two would be visually identical.

---

## Recommendation & Implementation Plan

**Approach #5 is the right move.** Fetch everything in the initial search
when total is small enough. The threshold should be configurable (env var)
and start conservative (1000), then raise based on measurement.

The key insight: **you don't need the scrubber to work as a scrollbar for
60k results. You need it to work as a scrollbar for the number of results
where a normal person would scroll.** And that number is way below 60k —
it's more like 2,000–5,000. Nobody scrolls through 60k results
one-by-one. They use the scrubber to jump, then scroll locally.

The nonlinear drag research was trying to solve "make the scrubber feel
good at 60k." But maybe the real answer is: **at 60k, the scrubber IS a
seek control, and that's fine.** The problem was only in the 1k–5k range
where seeking feels heavy-handed for what should be a "scroll down a bit"
interaction.

### Ordered steps

**Step 1 — Fix Bug C (activation threshold). ✅ DONE.** When
`total ≤ threshold`, fetch everything so scroll mode activates
immediately. Two-phase approach: fetch the normal 200 first (instant
results on screen), then if `total ≤ threshold`, immediately fire
`_fillBufferForScrollMode()` for the remainder. User sees results
instantly, scroll mode activates ~200–500ms later. Implemented as a
store-level change (`search-store.ts`). Threshold configurable via
`VITE_SCROLL_MODE_THRESHOLD` (default 1000).

**Step 2 — Fix Bugs A/B (thumb fighting & position asymmetry). ✅ DONE.**
Inline JSX `top` removed from thumb div — position controlled exclusively
via DOM writes (`applyThumbPosition` + `useEffect`). Position mapping
uses symmetric `total - visibleCount` in both directions. Scroll-mode
continuous sync via scroll listener (`scrollTop / (scrollHeight -
clientHeight)`) for pixel-perfect native-scrollbar-like behavior.
Stable `thumbVisibleCount` (frozen on scroll-mode activation) prevents
thumb height fluctuation during drag.

**Step 3 — Visual polish.** Make scroll mode look like a native
Chrome/macOS scrollbar: thin track, rounded thumb, overlay behavior (fade
in on hover/scroll, fade out on idle). This is mostly CSS, no logic
changes. We're targeting Chrome on macOS (majority of users) — not
attempting to match every platform's native scrollbar. The seek mode
retains its current distinctive look (tooltip, sort labels, wider track).

> **Note:** The visual philosophy below envisions differentiated visuals
> between modes, but the current implementation uses a unified style for
> both (same narrow pill, same colors). Step 3 will decide whether to
> keep the unified look or differentiate. See AGENTS.md "What's Next."

**Step 4 — Raise the threshold.** Increase the scroll-mode threshold via
env var. Start conservative (1000–2000), validate with real data, then
push toward 5000–10000. Depends on data demand findings from step 1.

### Data demands (step 1 coupling) — context only, not actionable now

Step 1 increases the initial data load. Current: every search fetches
exactly 200 results. Proposed: for small sets, fetch all of them.

> **Why this section is not actionable:** Kupua talks to ES directly as
> a Phase 2 shortcut. In production, it would talk to media-api, which
> controls what fields it returns — `_source` filtering wouldn't apply.
> The transfer size difference at threshold 1000 (~5–10MB vs ~500KB) is
> imperceptible over localhost or SSH tunnel. The real fix for "snappy
> feel" is Bug C (activating scroll mode), not reducing payload size.
> This analysis exists for future reference if the threshold is raised
> to 5000+ in step 4.

| Concern | Current (200) | At 1000 | At 5000 | Notes |
|---------|--------------|---------|---------|-------|
| ES query cost | Trivial | Trivial | Trivial | Large `size` is fine; deep `from` offsets are what hurt |
| Network transfer | ~1–2MB | ~5–10MB | ~25–50MB | At ~5–10KB/image (full doc). See view-specific analysis below |
| JSON parse time | ~10ms | ~50ms | ~100ms | Background-parseable if needed |
| Memory | ~1–2MB | ~5–10MB | ~25–50MB | Fine for desktop. Mobile is marginal at 5000 |

**`_source` filtering effectiveness varies dramatically by view:**

Grid view needs ~8 fields per image (id, description, title, byline,
credit, uploadTime, dateTaken, lastModified). Everything else — exports,
usages, leases, collections, fileMetadata, originalMetadata, userMetadata,
syndicationRights, full source asset details — is unused. With `_source`
filtering, per-image size drops from ~5–10KB to **~200–500 bytes** — a
10–25× reduction.

Table view needs ~30+ fields from the field registry (all of metadata,
usageRights, source dimensions, uploadInfo, plus config-driven aliases).
That's most of the document. `_source` filtering can still strip exports,
usages, leases, collections, fileMetadata, originalMetadata, but the
savings are only **1.5–2×**.

| | Grid view (8 fields) | Table view (30+ fields) |
|---|---|---|
| Per-image with `_source` | ~200–500 bytes | ~3–8KB |
| 1000 images | ~200–500KB | ~3–8MB |
| 5000 images | ~1–2.5MB | ~15–40MB |

**Implication for thresholds:** Grid view could comfortably handle scroll
mode at 10,000+ results. Table view hits practical limits around 2,000–
5,000. Options: (a) use the conservative (table) estimate for a single
threshold, (b) use view-specific thresholds, (c) always fetch full docs
and accept the table-view limit as the ceiling. Option (a) is simplest
and still a massive improvement over the current 200/1000 activation.

**Mitigations:**
- Two-phase fetch (200 first, remainder after) eliminates perceived delay
- `_source` filtering — huge win for grid view, modest for table view
- The threshold is configurable (env var) — start low, measure, raise

This is a known trade-off, not a blocker. The two-phase approach means
step 1 has zero impact on perceived initial load time.

### Visual philosophy

The user should not perceive two different controls. The principle:

- **Scroll mode:** looks and feels as close to a native scrollbar as
  practical. Targeting Chrome/macOS overlay scrollbar aesthetic. No
  tooltip (native doesn't have one). Proportional thumb. Fade in on
  hover/scroll, fade out on idle. The user shouldn't think "ah, this is a
  special control" — just "this is a scrollbar."
- **Seek mode:** retains the current distinctive look — wider track,
  tooltip with position counter and sort context labels, visible at all
  times. The user should understand "this is a navigation tool for a
  large set, not a scrollbar."
- **Transition:** when a search crosses the threshold (e.g. user adds a
  date filter and total drops from 50k to 3k), the scrubber quietly
  switches mode. Since the entire result set is changing anyway, the
  user's attention is on the content, not the scrollbar. No jarring
  visual discontinuity.

Whether scroll mode should be the custom scrubber *styled to look like*
a native scrollbar, or should literally be the native scrollbar (hidden
custom scrubber, visible `overflow-y: auto`), is a decision for step 3.
The latter is simpler and more correct but may have edge cases with
virtualizer scroll management.







