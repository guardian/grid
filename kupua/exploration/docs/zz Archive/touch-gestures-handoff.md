# Touch Gesture Polish — Handoff

## Status (21 April 2026)

### ✅ Implemented
- **Swipe-to-dismiss** (`useSwipeDismiss.ts`) — pull down to dismiss image detail.
  Whole-page animation (header + image + metadata), grid/list fades in behind.
  Pre-scrolls grid to correct image position on drag start. Velocity-aware:
  upward reversal always cancels (even past distance threshold). Mobile only,
  non-fullscreen only. ~190 lines.
- **Pinch-to-zoom** (`usePinchZoom.ts`) — two-finger pinch 1x–5x, single-finger
  pan while zoomed, double-tap toggle 1x↔2x. Fullscreen-only. Translate clamped
  to rendered image bounds (object-contain-aware). ~260 lines.
- **Carousel guard** — `scaleRef > 1` check in both `touchstart` and `touchmove`
  in `useSwipeCarousel.ts`. Suppresses swipe while zoomed.
- **Dismiss guard** — `scaleRef > 1` check in `useSwipeDismiss.ts`.
- **Double-tap vs fullscreen** — entering fullscreen = instant tap, exiting =
  300ms delay cancelled by second tap. `dblclick` suppressed on mobile in
  fullscreen (zoom, not toggle). `touch-none` on container in fullscreen.
- **Zoom reset on image change** — `scaleRef`, img transform, and willChange
  all reset in `useLayoutEffect` on imageId change + in `commitStripReset`.

### 🔲 Deferred: Hero Dismiss Animation (image flies back to grid thumbnail)

GPhotos-style shared-element transition: on dismiss commit, the detail image
shrinks and flies back into its thumbnail position in the grid. FLIP animation.

See implementation plan below.

---

## Hero Dismiss Animation — Implementation Plan

### What
On dismiss commit, instead of generic fade-out, the image animates from its
current position/size into the exact position of its thumbnail in the grid.
Standard FLIP (First-Last-Invert-Play) pattern.

### Prerequisites
1. **`data-image-id` attribute on grid/table thumbnails.** Needed for DOM lookup.
   Add to the `<div>` or `<img>` wrapper in `ImageGrid.tsx` (grid cells) and
   `ImageTable.tsx` (thumbnail column). One line each.

2. **Grid pre-scroll already works.** `onDragStart` calls `setFocusedImageId()`
   + `scrollFocusedIntoView()`, so the thumbnail is in the DOM and at its
   correct layout position before the animation needs its rect.

### Implementation (~30 lines in `useSwipeDismiss.ts`)

In the commit branch of `onTouchEnd`, replace the generic fade-out with:

```ts
// 1. Find the target thumbnail in the grid DOM
const thumb = backdrop?.querySelector(
  `[data-image-id="${imageId}"] img`
) as HTMLElement | null;

if (thumb) {
  // 2. FLIP: First (current image rect) → Last (thumbnail rect)
  const first = wrapper.getBoundingClientRect();
  const last = thumb.getBoundingClientRect();

  // 3. Invert: compute the transform that maps current → thumbnail
  const dx = last.left + last.width / 2 - (first.left + first.width / 2);
  const dy = last.top + last.height / 2 - (first.top + first.height / 2);
  const scaleX = last.width / first.width;
  const scaleY = last.height / first.height;
  const s = Math.min(scaleX, scaleY); // uniform scale (aspect ratio preserved)

  // 4. Play: animate wrapper to the thumbnail position
  wrapper.style.transition = `transform ${ANIMATION_MS}ms ease-out, opacity ${ANIMATION_MS}ms ease-out`;
  wrapper.style.transformOrigin = "center center";
  wrapper.style.transform = `translate(${dx}px, ${dy}px) scale(${s})`;
  wrapper.style.opacity = "0.3"; // slight fade, thumbnail takes over
  // ... transitionend → cleanup + onDismiss()
} else {
  // Fallback: generic fade-out (thumbnail not found — edge case)
  // ... existing code
}
```

### Why aspect ratio is a non-issue
Both thumbnail and full image are the same source rendered at different sizes
via `object-contain`. The aspect ratios are identical. The FLIP scale is
uniform (`min(scaleX, scaleY)`), so no distortion.

### Why column count is irrelevant
`getBoundingClientRect()` returns the actual rendered position. Whether the
grid has 1, 2, 4, or 7 columns, the thumbnail's rect is correct. Zero layout
assumptions in the animation code.

### Edge cases
- **Thumbnail not in DOM** (image was deep-navigated to via prev/next, and
  the grid virtualized the row off-screen): `scrollFocusedIntoView()` should
  bring it into the virtualizer's rendered range, but overscan is finite.
  If `querySelector` returns null → fallback to generic fade-out.
- **Thumbnail image still loading** (not yet painted): rect is still valid
  (the container is laid out), so animation works. The thumbnail may briefly
  show a placeholder before the real image paints.

### Files to modify
- `kupua/src/hooks/useSwipeDismiss.ts` — FLIP logic in commit branch (~30 lines)
- `kupua/src/components/ImageGrid.tsx` — add `data-image-id={image.id}` to cell div
- `kupua/src/components/ImageTable.tsx` — add `data-image-id` to row div
- `kupua/src/hooks/useSwipeDismiss.ts` interface — add `imageId: string` prop
  (or pass it via a ref from ImageDetail)

### Files to read before starting
- `kupua/src/hooks/useSwipeDismiss.ts` — the commit branch in onTouchEnd
- `kupua/src/components/ImageGrid.tsx` — cell rendering (find where to add data attr)
- `kupua/src/components/ImageTable.tsx` — row rendering
- This file — the plan above
