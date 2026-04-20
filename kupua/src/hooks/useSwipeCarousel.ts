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
 * Flash prevention: after a committed swipe animation, the strip is
 * immediately reset to translateX(0) and the swiped-to image is copied
 * imperatively to the center panel — all in the transitionend callback,
 * BEFORE calling navigate(). This eliminates the async gap between
 * animation end and React's DOM commit where the wrong image could flash.
 * React's subsequent re-render is a visual no-op (same src already set).
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
    const targetImg = targetPanel.querySelector("img");
    const centerImg = centerPanel.querySelector("img");
    if (targetImg && centerImg) {
      centerImg.src = targetImg.src;
    }
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
}

interface UseSwipeCarouselReturn {
  /** True if a swipe gesture was in progress during the last touch sequence.
   *  Check this in onClick handlers to suppress tap actions after swipe. */
  swipedRef: RefObject<boolean>;
}

export function useSwipeCarousel({
  containerRef,
  stripRef,
  onSwipeLeft,
  onSwipeRight,
  enabled = true,
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

    function onTouchStart(e: TouchEvent) {
      if (animating || e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      lastX = startX;
      lastTime = e.timeStamp;
      velocity = 0;
      tracking = false;
      decided = false;
      swipedRef.current = false;
      strip.style.transition = "none";
    }

    function onTouchMove(e: TouchEvent) {
      if (animating || e.touches.length !== 1) return;
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

      strip.style.transition = `transform ${ANIMATION_MS}ms ease-out`;

      if (commitLeft) {
        // Snap to next — animate strip fully left
        animating = true;
        const cb = cbLeft.current!;
        pendingCb = cb;
        pendingDirection = "left";
        strip.style.transform = `translateX(${-w}px)`;
        strip.addEventListener(
          "transitionend",
          () => {
            animating = false;
            pendingCb = null;
            // Imperatively copy next panel's image to center and reset strip.
            // This eliminates the async gap — center panel shows the correct
            // image BEFORE navigate() fires. React's re-render is a visual no-op.
            commitStripReset(strip, "left");
            cb();
          },
          { once: true },
        );
      } else if (commitRight) {
        // Snap to prev — animate strip fully right
        animating = true;
        const cb = cbRight.current!;
        pendingCb = cb;
        pendingDirection = "right";
        strip.style.transform = `translateX(${w}px)`;
        strip.addEventListener(
          "transitionend",
          () => {
            animating = false;
            pendingCb = null;
            commitStripReset(strip, "right");
            cb();
          },
          { once: true },
        );
      } else {
        // Below threshold — snap back
        if (Math.abs(offset) < 1) {
          // Already at rest, no transition needed
          strip.style.transition = "none";
          strip.style.transform = "";
        } else {
          strip.style.transform = "translateX(0)";
          strip.addEventListener(
            "transitionend",
            () => {
              strip.style.transition = "none";
              strip.style.transform = "";
            },
            { once: true },
          );
        }
      }
    }

    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchmove", onTouchMove, { passive: false });
    container.addEventListener("touchend", onTouchEnd, { passive: true });

    // Handle container resize during animation (orientation change mid-swipe).
    // Kill the transition and commit immediately.
    let pendingCb: (() => void) | null = null;
    let pendingDirection: "left" | "right" | null = null;
    const ro = new ResizeObserver(() => {
      if (animating && pendingCb) {
        animating = false;
        const cb = pendingCb;
        const dir = pendingDirection!;
        pendingCb = null;
        pendingDirection = null;
        commitStripReset(strip, dir);
        cb();
      }
    });
    ro.observe(container);

    return () => {
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
      ro.disconnect();
    };
  }, [containerRef, stripRef, swipedRef, enabled]);

  return { swipedRef };
}
