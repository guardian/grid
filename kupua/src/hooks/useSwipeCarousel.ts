/**
 * useSwipeCarousel — horizontal swipe with visual slide-in animation.
 *
 * Mimics Google Photos swipe mechanics:
 * - 1:1 finger tracking during drag (no acceleration)
 * - Velocity-aware commit: a fast flick (>400px/s) commits even at short
 *   distance; a slow drag needs >35% of container width to commit
 * - Below threshold: spring back with ease-out
 * - At edges (no prev/next): rubber-band resistance (30%)
 * - Binary outcome: either commits fully or snaps back, never stuck halfway
 *
 * Uses direct DOM manipulation during drag (no React re-renders per frame).
 * The strip element should contain absolutely-positioned prev/current/next
 * panels offset by translateX(-100%/0/100%).
 *
 * Flash prevention: after a committed swipe animation, commitStripReset
 * copies the target panel's img.src to the center panel, sets a
 * `data-committed` flag, then resets the strip to translateX(0).
 * StableImg checks the flag in useLayoutEffect — if present, it skips
 * writing src (which would reset img.complete and cause the ⏳ cascade).
 * Side panels are cleared (src removed) to destroy stale compositor
 * textures — React writes fresh URLs on the next render.
 *
 * Duplicate-image prevention: at COMMIT time, if the target panel's
 * img.complete is false (AVIF still decoding), its src is swapped to
 * a pre-cached thumbnail via the data-thumb attribute. Thumbnails decode
 * from cache in <10ms, ensuring the animation never shows stale pixels.
 * See worklog-current.md for full investigation.
 */

import { useEffect, useRef, type RefObject } from "react";

/** Minimum movement before deciding horizontal vs vertical. */
const DECIDE_THRESHOLD = 10;

/** Fraction of container width to trigger a committed swipe (slow drag). */
const SNAP_DISTANCE_RATIO = 0.35;

/** Velocity threshold (px/ms) — above this, commit regardless of distance. */
const SNAP_VELOCITY = 0.4;

/** Snap animation duration (ms). */
const ANIMATION_MS = 200;

/** Rubber-band resistance when swiping past the edge (no prev/next). */
const RUBBER_BAND = 0.3;

/**
 * After swipe animation, copy the swiped-to panel's img.src to the center
 * panel, then reset the strip to translateX(0). This makes the visual
 * transition instant — the center panel shows the correct image BEFORE
 * navigate() is called. React's re-render becomes a visual no-op.
 */
function commitStripReset(strip: HTMLElement, direction: "left" | "right") {
  // Panels are the direct children of the strip: [prev, center, next]
  // (or fewer if prev/next are conditionally rendered).
  // Find center panel (no inline transform) and target panel.
  const panels = Array.from(strip.children) as HTMLElement[];
  let centerPanel: HTMLElement | null = null;
  let targetPanel: HTMLElement | null = null;
  const targetTranslate = direction === "left" ? "translateX(100%)" : "translateX(-100%)";

  for (const panel of panels) {
    const t = panel.style.transform;
    if (!t) centerPanel = panel;
    else if (t === targetTranslate) targetPanel = panel;
  }

  if (centerPanel && targetPanel) {
    const centerImg = centerPanel.querySelector("img");
    const targetImg = targetPanel.querySelector("img");
    if (centerImg && targetImg) {
      // Copy the swiped-to image into the center panel so it's visible
      // the instant the strip resets to translateX(0). The data-committed
      // flag tells StableImg to skip its next useLayoutEffect write —
      // without it, StableImg would re-set the same-image URL (which
      // may differ in imgproxy sizing params), resetting img.complete
      // and causing the ⏳ cascade.
      centerImg.src = targetImg.src;
      centerImg.setAttribute("data-committed", "");
      // Reset any pinch-zoom transform — incoming image starts at 1x.
      centerImg.style.transform = "";
      centerImg.style.willChange = "";
      centerImg.style.transition = "";
    }
  }

  // Clear side-panel bitmaps. The browser deprioritizes decoding off-screen
  // images (translateX(±100%)), so even cached thumbnails can remain ⏳ for
  // 50-60ms. During that window the <img> shows the OLD compositor texture —
  // that's the "duplicate image" bug. Clearing the src destroys the stale
  // bitmap. React will write new URLs in the next render; if decode isn't
  // done when the next swipe starts, the panel is blank (invisible) instead
  // of showing the wrong image. Side panels are off-screen here so clearing
  // has zero visual impact.
  for (const panel of panels) {
    if (panel === centerPanel) continue;
    const img = panel.querySelector("img");
    if (img) img.removeAttribute("src");
  }

  // Reset strip — center panel now shows the correct image
  strip.style.transition = "none";
  strip.style.transform = "";
}

interface UseSwipeCarouselOptions {
  /** Container element — listens for touch gestures here. */
  containerRef: RefObject<HTMLElement | null>;
  /** Inner strip element — animated with translateX. */
  stripRef: RefObject<HTMLElement | null>;
  /** Called after successful left swipe (show next). Undefined = no next. */
  onSwipeLeft?: () => void;
  /** Called after successful right swipe (show prev). Undefined = no prev. */
  onSwipeRight?: () => void;
  /** When false, the effect is a no-op. Toggle to re-attach listeners when
   *  the container DOM element becomes available (e.g. after async image load). */
  enabled?: boolean;
  /** When scale > 1, suppress swipe (let pinch-zoom handle pan instead). */
  scaleRef?: RefObject<number>;
}

interface UseSwipeCarouselReturn {
  /** True if a swipe gesture was in progress during the last touch sequence.
   *  Check this in onClick handlers to suppress tap actions after swipe. */
  swipedRef: RefObject<boolean>;
  /** Timestamp (Date.now()) of the last committed swipe animation completing.
   *  Used by zoom and tap handlers to enforce post-swipe cooldowns. */
  lastSwipeTimeRef: RefObject<number>;
}

export function useSwipeCarousel({
  containerRef,
  stripRef,
  onSwipeLeft,
  onSwipeRight,
  enabled = true,
  scaleRef,
}: UseSwipeCarouselOptions): UseSwipeCarouselReturn {
  // Store callbacks in refs so the effect closure always sees current values
  // without re-attaching listeners on every render.
  const cbLeft = useRef(onSwipeLeft);
  const cbRight = useRef(onSwipeRight);
  cbLeft.current = onSwipeLeft;
  cbRight.current = onSwipeRight;

  // Exposed to callers so they can guard onClick handlers.
  // Set to true when a swipe gesture is detected, reset on next touchstart.
  const swipedRef = useRef(false);
  // Timestamp of last committed swipe — for cooldown guards.
  const lastSwipeTimeRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    const strip = stripRef.current;
    if (!container || !strip) return;

    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastTime = 0;
    let velocity = 0;     // px/ms, positive = moving right
    let tracking = false; // true once we've committed to horizontal
    let decided = false;  // true once direction is determined
    let animating = false;

    // State for pending swipe animation — used by ResizeObserver and
    // cleanup to cancel in-flight animations. Declared here (above the
    // touch handlers) because the closures reference them.
    let pendingCb: (() => void) | null = null;
    let pendingDirection: "left" | "right" | null = null;
    let pendingAnimation: Animation | null = null;

    function onTouchStart(e: TouchEvent) {
      // Always reset tracking state first — prevents stale flags from a
      // previous touch sequence from leaking into this sequence's
      // touchmove/touchend handlers.
      tracking = false;
      decided = false;

      if (animating || e.touches.length !== 1) {
        return;
      }
      if (scaleRef?.current && scaleRef.current > 1) return; // zoomed — let pinchZoom handle pan
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      lastX = startX;
      lastTime = e.timeStamp;
      velocity = 0;
      swipedRef.current = false;
      strip.style.transition = "none";
    }

    function onTouchMove(e: TouchEvent) {
      if (animating || e.touches.length !== 1) return;
      // Guard: if zoomed in (pinch happened after touchstart), bail — let pinchZoom pan
      if (scaleRef?.current && scaleRef.current > 1) {
        tracking = false;
        decided = false;
        return;
      }
      const currentX = e.touches[0].clientX;
      const dx = currentX - startX;
      const dy = e.touches[0].clientY - startY;

      if (!decided) {
        if (Math.abs(dx) < DECIDE_THRESHOLD && Math.abs(dy) < DECIDE_THRESHOLD) return;
        decided = true;
        tracking = Math.abs(dx) > Math.abs(dy);
        if (!tracking) return;
      }
      if (!tracking) return;

      // Mark that a swipe gesture occurred — used by callers to guard onClick
      swipedRef.current = true;

      // Block vertical scroll while swiping horizontally
      e.preventDefault();

      // Track velocity (exponential moving average for smoothness)
      const dt = e.timeStamp - lastTime;
      if (dt > 0) {
        const instantV = (currentX - lastX) / dt;
        velocity = velocity * 0.4 + instantV * 0.6;
      }
      lastX = currentX;
      lastTime = e.timeStamp;

      // Rubber-band at edges (no prev or no next)
      let offset: number;
      if (dx > 0 && !cbRight.current) {
        offset = dx * RUBBER_BAND;
      } else if (dx < 0 && !cbLeft.current) {
        offset = dx * RUBBER_BAND;
      } else {
        offset = dx;
      }

      strip.style.transform = `translateX(${offset}px)`;
    }

    function onTouchEnd() {
      if (!tracking || animating) return;

      const w = container.offsetWidth;
      const match = strip.style.transform.match(/translateX\(([-.0-9]+)px\)/);
      const offset = match ? parseFloat(match[1]) : 0;
      const absOffset = Math.abs(offset);
      const absVelocity = Math.abs(velocity);

      // Commit decision: fast flick OR dragged far enough
      const commitLeft = offset < 0 && cbLeft.current &&
        (absVelocity > SNAP_VELOCITY || absOffset > w * SNAP_DISTANCE_RATIO);
      const commitRight = offset > 0 && cbRight.current &&
        (absVelocity > SNAP_VELOCITY || absOffset > w * SNAP_DISTANCE_RATIO);

      if (commitLeft || commitRight) {
        animating = true;
        const direction: "left" | "right" = commitLeft ? "left" : "right";
        const cb = commitLeft ? cbLeft.current! : cbRight.current!;
        const targetX = commitLeft ? -w : w;
        // Thumbnail fallback: if the target panel's image hasn't decoded
        // (⏳), the browser will show a stale compositor texture during the
        // animation — causing the "duplicate image" bug. Swap to thumbnail
        // (pre-cached, <10ms decode) before the animation starts. The
        // thumbnail src is stored as data-thumb on the <img> element.
        const targetTranslateDir = commitLeft ? "translateX(100%)" : "translateX(-100%)";
        for (const panel of Array.from(strip.children) as HTMLElement[]) {
          if (panel.style.transform === targetTranslateDir) {
            const img = panel.querySelector("img");
            if (img && !img.complete) {
              const thumb = img.getAttribute("data-thumb");
              if (thumb) img.src = thumb;
            }
            break;
          }
        }

        pendingCb = cb;
        pendingDirection = direction;

        // Clear inline styles — WAAPI takes over from this frame.
        strip.style.transition = "none";
        strip.style.transform = "";

        const anim = strip.animate(
          [
            { transform: `translateX(${offset}px)` },
            { transform: `translateX(${targetX}px)` },
          ],
          { duration: ANIMATION_MS, easing: "ease-out", fill: "forwards" },
        );
        pendingAnimation = anim;

        anim.finished.then(() => {
          // .finished resolves as a microtask — no touch events can fire
          // between these lines. This closes the race window that
          // transitionend (macrotask) left open.
          pendingCb = null;
          pendingDirection = null;
          pendingAnimation = null;
          commitStripReset(strip, direction);
          anim.cancel(); // Remove WAAPI effect — inline transform is now ""
          animating = false;
          lastSwipeTimeRef.current = Date.now();
          cb();
        }).catch(() => {
          // Cancelled by ResizeObserver or cleanup — state already handled
        });
      } else {
        // Below threshold — snap back
        if (Math.abs(offset) < 1) {
          // Already at rest, no animation needed
          strip.style.transition = "none";
          strip.style.transform = "";
        } else {
          // Clear inline transform — WAAPI animates from offset to 0.
          // When the animation ends (no fill), the inline "" takes over.
          strip.style.transition = "none";
          strip.style.transform = "";

          strip.animate(
            [
              { transform: `translateX(${offset}px)` },
              { transform: "translateX(0)" },
            ],
            { duration: ANIMATION_MS, easing: "ease-out" },
          );
        }
      }
    }

    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchmove", onTouchMove, { passive: false });
    container.addEventListener("touchend", onTouchEnd, { passive: true });

    // Handle container resize during animation (orientation change mid-swipe).
    // Kill the animation and commit immediately.
    const ro = new ResizeObserver(() => {
      if (animating && pendingCb && pendingAnimation) {
        const cb = pendingCb;
        const dir = pendingDirection!;
        pendingAnimation.cancel(); // triggers .catch() (no-op)
        pendingAnimation = null;
        pendingCb = null;
        pendingDirection = null;
        animating = false;
        commitStripReset(strip, dir);
        cb();
      }
    });
    ro.observe(container);

    return () => {
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
      if (pendingAnimation) pendingAnimation.cancel();
      ro.disconnect();
    };
  }, [containerRef, stripRef, swipedRef, enabled]);

  return { swipedRef, lastSwipeTimeRef };
}
