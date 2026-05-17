/**
 * usePinchZoom — zoom and pan for both touch and mouse.
 *
 * Touch: two-finger pinch to zoom, single-finger pan while zoomed,
 * double-tap to toggle 1x ↔ 2x.
 *
 * Mouse (desktop fullscreen): single click toggles 1x ↔ 2x at click
 * point, mousewheel zooms continuously centred on cursor, drag-to-pan
 * while zoomed with momentum.
 *
 * Applies transform to the `<img>` element directly (not the container),
 * so carousel layout and dismiss gestures are unaffected.
 *
 * Exposes `scaleRef` so callers can guard other gestures:
 * - useSwipeCarousel: skip swipe when scale > 1 (pan instead)
 * - useSwipeDismiss: skip dismiss when scale > 1
 *
 * Same imperative pattern as useSwipeCarousel: direct DOM manipulation,
 * refs for mutable state, no React re-renders during gestures.
 */

import { useEffect, useRef, type RefObject } from "react";

/** Scale bounds. */
const MIN_SCALE = 1;
const MAX_SCALE = 5;

/** Double-tap detection. */
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_DISTANCE = 20; // px

/** Double-tap target scale. */
const DOUBLE_TAP_SCALE = 2;

/** Snap-back animation duration (ms). */
const ANIMATION_MS = 200;

/** Snap-to-1 threshold — pinch/pan ending below this scale snaps to 1×.
 *  Prevents "almost zoomed out" stuck states where scaleRef stays > 1
 *  (blocking swipe-dismiss, arrow keys, etc.) after an imprecise unpinch. */
const SNAP_TO_1_THRESHOLD = 1.05;

/** Post-swipe cooldown — suppress zoom triggers for this long after a swipe. */
const SWIPE_ZOOM_COOLDOWN_MS = 400;

interface UsePinchZoomOptions {
  /** Container element — for measuring bounds. */
  containerRef: RefObject<HTMLElement | null>;
  /** The <img> element — transform is applied here. */
  imageRef: RefObject<HTMLImageElement | null>;
  /** When false, the effect is a no-op. */
  enabled?: boolean;
  /** Timestamp of last committed swipe — suppress zoom during cooldown. */
  lastSwipeTimeRef?: RefObject<number>;
  /** Optional external scaleRef — if provided, used instead of internal. */
  scaleRef?: RefObject<number>;
  /** Called when zoom state crosses the 1x threshold (zoomed in ↔ out). */
  onScaleChange?: (zoomed: boolean) => void;
  /** Called on rapid double-click (second click within 300ms). Resets zoom first. */
  onDoubleClick?: () => void;
}

interface UsePinchZoomReturn {
  /** Current scale — read by other hooks to guard gestures. */
  scaleRef: RefObject<number>;
}

/** Distance between two touch points. */
function touchDistance(a: Touch, b: Touch): number {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Midpoint between two touch points. */
function touchMidpoint(a: Touch, b: Touch): { x: number; y: number } {
  return {
    x: (a.clientX + b.clientX) / 2,
    y: (a.clientY + b.clientY) / 2,
  };
}

/**
 * Clamp translate so image doesn't scroll too far past container edges.
 * @param overflow — fraction of container dimension allowed beyond the tight
 *   edge (0 = image edges stop at container edges, 0.5 = corners can reach
 *   screen centre). Drag/momentum use 0.5; keyboard uses 0.05.
 */
function clampTranslate(
  tx: number,
  ty: number,
  scale: number,
  imgW: number,
  imgH: number,
  cW: number,
  cH: number,
  overflow = 0.5,
): { tx: number; ty: number } {
  // The image is object-contain inside the container, so its rendered size
  // may be smaller than the container. Compute rendered size:
  const aspectImg = imgW / imgH;
  const aspectContainer = cW / cH;
  let renderedW: number, renderedH: number;
  if (aspectImg > aspectContainer) {
    // Image is wider than container — width-limited
    renderedW = cW;
    renderedH = cW / aspectImg;
  } else {
    // Image is taller — height-limited
    renderedH = cH;
    renderedW = cH * aspectImg;
  }

  // Tight bound: image edge stops at container edge.
  // Overflow adds a fraction of container size beyond that.
  const tightX = Math.max(0, (renderedW * scale - cW) / 2);
  const tightY = Math.max(0, (renderedH * scale - cH) / 2);
  const maxTx = scale > 1 ? tightX + cW * overflow : 0;
  const maxTy = scale > 1 ? tightY + cH * overflow : 0;
  return {
    tx: Math.max(-maxTx, Math.min(maxTx, tx)),
    ty: Math.max(-maxTy, Math.min(maxTy, ty)),
  };
}

export function usePinchZoom({
  containerRef,
  imageRef,
  enabled = true,
  lastSwipeTimeRef,
  scaleRef: externalScaleRef,
  onScaleChange,
  onDoubleClick,
}: UsePinchZoomOptions): UsePinchZoomReturn {
  const internalScaleRef = useRef(1);
  const scaleRef = externalScaleRef ?? internalScaleRef;
  const onScaleChangeRef = useRef(onScaleChange);
  onScaleChangeRef.current = onScaleChange;
  const onDoubleClickRef = useRef(onDoubleClick);
  onDoubleClickRef.current = onDoubleClick;

  useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    const img = imageRef.current;
    if (!container || !img) return;

    // Current transform state
    let scale = 1;
    let translateX = 0;
    let translateY = 0;

    // Pinch tracking
    let initialPinchDist = 0;
    let pinchScaleStart = 1;
    let pinchMidStart = { x: 0, y: 0 };
    let pinchTranslateStart = { x: 0, y: 0 };
    let isPinching = false;

    // Pan tracking (single-finger while zoomed)
    let panStartX = 0;
    let panStartY = 0;
    let panTranslateStart = { x: 0, y: 0 };
    let isPanning = false;

    // Double-tap tracking
    let lastTapTime = 0;
    let lastTapX = 0;
    let lastTapY = 0;

    // Track whether any movement happened — suppress double-tap after drag
    let moved = false;

    // Velocity tracking for pan momentum (px/ms, EMA-smoothed)
    let panVx = 0;
    let panVy = 0;
    let panLastX = 0;
    let panLastY = 0;
    let panLastTime = 0;
    let momentumRaf = 0; // requestAnimationFrame id — 0 = none

    // Touch-vs-mouse disambiguation — suppress mouse handlers after touch
    let lastTouchTime = 0;

    function applyTransform(animate = false) {
      const wasZoomed = scaleRef.current > 1;
      if (animate) {
        img.style.transition = `transform ${ANIMATION_MS}ms ease-out`;
      } else {
        img.style.transition = "";
      }
      // Use scale3d and translate3d for GPU compositing
      img.style.transform =
        scale <= 1 + 0.001
          ? ""
          : `translate3d(${translateX}px, ${translateY}px, 0) scale3d(${scale}, ${scale}, 1)`;
      img.style.willChange = scale > 1 ? "transform" : "";
      scaleRef.current = scale;
      const isZoomed = scale > 1;
      if (isZoomed !== wasZoomed) onScaleChangeRef.current?.(isZoomed);
    }

    function resetZoom(animate = false) {
      scale = 1;
      translateX = 0;
      translateY = 0;
      applyTransform(animate);
    }

    function getContainerRect() {
      return container.getBoundingClientRect();
    }

    function getImageNaturalSize() {
      return { w: img.naturalWidth || 1, h: img.naturalHeight || 1 };
    }

    function onTouchStart(e: TouchEvent) {
      lastTouchTime = Date.now();
      // Suppress zoom during post-swipe cooldown
      if (lastSwipeTimeRef?.current && Date.now() - lastSwipeTimeRef.current < SWIPE_ZOOM_COOLDOWN_MS) return;
      if (e.touches.length === 2) {
        // Start pinch
        isPinching = true;
        isPanning = false;
        moved = false;
        initialPinchDist = touchDistance(e.touches[0], e.touches[1]);
        pinchScaleStart = scale;
        pinchMidStart = touchMidpoint(e.touches[0], e.touches[1]);
        pinchTranslateStart = { x: translateX, y: translateY };
        if (momentumRaf) { cancelAnimationFrame(momentumRaf); momentumRaf = 0; }
        img.style.transition = "";
      } else if (e.touches.length === 1 && scale > 1) {
        // Start pan (only while zoomed)
        isPanning = true;
        isPinching = false;
        moved = false;
        panStartX = e.touches[0].clientX;
        panStartY = e.touches[0].clientY;
        panTranslateStart = { x: translateX, y: translateY };
        // Init velocity tracking
        panVx = 0;
        panVy = 0;
        panLastX = e.touches[0].clientX;
        panLastY = e.touches[0].clientY;
        panLastTime = e.timeStamp;
        // Cancel any in-flight momentum
        if (momentumRaf) { cancelAnimationFrame(momentumRaf); momentumRaf = 0; }
        img.style.transition = "";
      } else if (e.touches.length === 1) {
        // Single touch at 1x — reset moved so double-tap detection works
        // after a pinch-zoom-out (which leaves moved=true from the pinch).
        moved = false;
      }
    }

    function onTouchMove(e: TouchEvent) {
      if (isPinching && e.touches.length === 2) {
        moved = true;
        const dist = touchDistance(e.touches[0], e.touches[1]);
        const mid = touchMidpoint(e.touches[0], e.touches[1]);

        // New scale from pinch ratio
        const rawScale = pinchScaleStart * (dist / initialPinchDist);
        scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, rawScale));

        // Adjust translate to keep the pinch midpoint stable.
        // The midpoint on screen should map to the same image point
        // throughout the pinch.
        //
        // Anchor the pinch in IMAGE space, not screen space. The image-space
        // offset of the initial midpoint (relative to the image's
        // untransformed centre, which sits at container centre) is:
        //   imgOff = (mid - centre - translate) / scale
        // To keep that same image point under the new midpoint after rescale:
        //   newTranslate = newMid - centre - imgOff * newScale
        // Equivalent to the prior formula PLUS the missing scale-factor on
        // pinchTranslateStart, which is why pinch was correct from origin
        // but drifted after any pan.
        const cr = getContainerRect();
        const cx = cr.left + cr.width / 2;
        const cy = cr.top + cr.height / 2;

        const imgOffX = (pinchMidStart.x - cx - pinchTranslateStart.x) / pinchScaleStart;
        const imgOffY = (pinchMidStart.y - cy - pinchTranslateStart.y) / pinchScaleStart;
        translateX = (mid.x - cx) - imgOffX * scale;
        translateY = (mid.y - cy) - imgOffY * scale;

        // Clamp translate
        const nat = getImageNaturalSize();
        const clamped = clampTranslate(translateX, translateY, scale, nat.w, nat.h, cr.width, cr.height);
        translateX = clamped.tx;
        translateY = clamped.ty;

        applyTransform();
        e.preventDefault();
      } else if (isPanning && e.touches.length === 1) {
        moved = true;
        const dx = e.touches[0].clientX - panStartX;
        const dy = e.touches[0].clientY - panStartY;
        translateX = panTranslateStart.x + dx;
        translateY = panTranslateStart.y + dy;

        // Track velocity (EMA for smoothness)
        const dt = e.timeStamp - panLastTime;
        if (dt > 0) {
          const ivx = (e.touches[0].clientX - panLastX) / dt;
          const ivy = (e.touches[0].clientY - panLastY) / dt;
          panVx = panVx * 0.4 + ivx * 0.6;
          panVy = panVy * 0.4 + ivy * 0.6;
        }
        panLastX = e.touches[0].clientX;
        panLastY = e.touches[0].clientY;
        panLastTime = e.timeStamp;

        // Clamp
        const cr = getContainerRect();
        const nat = getImageNaturalSize();
        const clamped = clampTranslate(translateX, translateY, scale, nat.w, nat.h, cr.width, cr.height);
        translateX = clamped.tx;
        translateY = clamped.ty;

        applyTransform();
        e.preventDefault();
      }
    }

    function onTouchEnd(e: TouchEvent) {
      if (isPinching) {
        // If one finger lifted but one remains, switch to pan —
        // UNLESS scale is near 1× (imprecise unpinch), in which case snap.
        if (e.touches.length === 1 && scale >= SNAP_TO_1_THRESHOLD) {
          isPinching = false;
          isPanning = true;
          panStartX = e.touches[0].clientX;
          panStartY = e.touches[0].clientY;
          panTranslateStart = { x: translateX, y: translateY };
          // Init velocity tracking for the new pan
          panVx = 0;
          panVy = 0;
          panLastX = e.touches[0].clientX;
          panLastY = e.touches[0].clientY;
          panLastTime = e.timeStamp;
        } else {
          isPinching = false;
          // Snap to 1x if at or near minimum scale
          if (scale < SNAP_TO_1_THRESHOLD) {
            resetZoom(true);
          }
        }
        return;
      }

      if (isPanning) {
        isPanning = false;

        // Snap to 1x if scale drifted near minimum (e.g. pinch→pan→release
        // path where the pinch ended just above 1 and pan didn't change scale).
        if (scale < SNAP_TO_1_THRESHOLD) {
          resetZoom(true);
          // Skip momentum + double-tap — we're snapping out.
          return;
        }

        // Momentum: if the finger was moving fast enough, drift with deceleration.
        const speed = Math.sqrt(panVx * panVx + panVy * panVy);
        if (speed > 0.15) { // px/ms threshold — below this, stop instantly
          const friction = 0.95; // per-frame decay (60fps ≈ 16.7ms/frame)
          let vx = panVx * 16; // convert px/ms → px/frame (~16ms)
          let vy = panVy * 16;
          let prevTime = performance.now();

          const step = (now: number) => {
            const elapsed = now - prevTime;
            prevTime = now;
            // Scale friction by actual frame time vs ideal 16.67ms
            const frames = elapsed / 16.67;
            const f = Math.pow(friction, frames);
            vx *= f;
            vy *= f;

            translateX += vx;
            translateY += vy;

            // Clamp to bounds — stop axis that hits edge
            const cr = getContainerRect();
            const nat = getImageNaturalSize();
            const clamped = clampTranslate(translateX, translateY, scale, nat.w, nat.h, cr.width, cr.height);
            if (clamped.tx !== translateX) vx = 0;
            if (clamped.ty !== translateY) vy = 0;
            translateX = clamped.tx;
            translateY = clamped.ty;

            applyTransform();

            if (Math.abs(vx) > 0.5 || Math.abs(vy) > 0.5) {
              momentumRaf = requestAnimationFrame(step);
            } else {
              momentumRaf = 0;
            }
          };
          momentumRaf = requestAnimationFrame(step);
        }
      }

      // Double-tap detection — only on single finger release with no movement
      if (e.touches.length === 0 && e.changedTouches.length === 1 && !moved) {
        const t = e.changedTouches[0];
        const now = e.timeStamp;
        const dx = t.clientX - lastTapX;
        const dy = t.clientY - lastTapY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const dt = now - lastTapTime;

        if (dt < DOUBLE_TAP_MS && dist < DOUBLE_TAP_DISTANCE) {
          // Suppress double-tap zoom during post-swipe cooldown
          if (lastSwipeTimeRef?.current && Date.now() - lastSwipeTimeRef.current < SWIPE_ZOOM_COOLDOWN_MS) return;
          // Double tap — toggle zoom
          lastTapTime = 0; // reset so triple-tap doesn't re-trigger
          if (scale > 1) {
            // Zoom out
            resetZoom(true);
          } else {
            // Zoom in to 2x centred on tap point
            const cr = getContainerRect();
            const cx = cr.left + cr.width / 2;
            const cy = cr.top + cr.height / 2;
            const tapX = t.clientX;
            const tapY = t.clientY;

            scale = DOUBLE_TAP_SCALE;
            // Translate so the tapped point stays under the finger:
            // The tap point relative to container center
            translateX = (cx - tapX) * (scale - 1);
            translateY = (cy - tapY) * (scale - 1);

            // Clamp
            const nat = getImageNaturalSize();
            const clamped = clampTranslate(translateX, translateY, scale, nat.w, nat.h, cr.width, cr.height);
            translateX = clamped.tx;
            translateY = clamped.ty;

            applyTransform(true);
          }
        } else {
          lastTapTime = now;
          lastTapX = t.clientX;
          lastTapY = t.clientY;
        }
      }
    }

    // ── Mouse handlers (desktop zoom) ────────────────────────────────

    let mouseDown = false;
    let mouseMovedDuringDrag = false;
    let mousePanStartX = 0;
    let mousePanStartY = 0;
    let mousePanTranslateStart = { x: 0, y: 0 };
    let mousePanVx = 0;
    let mousePanVy = 0;
    let mousePanLastX = 0;
    let mousePanLastY = 0;
    let mousePanLastTime = 0;

    /** Suppress mouse handlers briefly after touch to avoid ghost clicks. */
    function isRecentTouch() { return Date.now() - lastTouchTime < 500; }

    function onMouseDown(e: MouseEvent) {
      if (e.button !== 0 || isRecentTouch()) return;
      if (scale <= 1) return; // only pan when zoomed
      if ((e.target as HTMLElement).closest("button")) return;
      mouseDown = true;
      mouseMovedDuringDrag = false;
      mousePanStartX = e.clientX;
      mousePanStartY = e.clientY;
      mousePanTranslateStart = { x: translateX, y: translateY };
      mousePanVx = 0;
      mousePanVy = 0;
      mousePanLastX = e.clientX;
      mousePanLastY = e.clientY;
      mousePanLastTime = e.timeStamp;
      if (momentumRaf) { cancelAnimationFrame(momentumRaf); momentumRaf = 0; }
      img.style.transition = "";
      e.preventDefault();
    }

    function onMouseMove(e: MouseEvent) {
      if (!mouseDown) return;
      const dx = e.clientX - mousePanStartX;
      const dy = e.clientY - mousePanStartY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) mouseMovedDuringDrag = true;
      translateX = mousePanTranslateStart.x + dx;
      translateY = mousePanTranslateStart.y + dy;
      const dt = e.timeStamp - mousePanLastTime;
      if (dt > 0) {
        const ivx = (e.clientX - mousePanLastX) / dt;
        const ivy = (e.clientY - mousePanLastY) / dt;
        mousePanVx = mousePanVx * 0.4 + ivx * 0.6;
        mousePanVy = mousePanVy * 0.4 + ivy * 0.6;
      }
      mousePanLastX = e.clientX;
      mousePanLastY = e.clientY;
      mousePanLastTime = e.timeStamp;
      const cr = getContainerRect();
      const nat = getImageNaturalSize();
      const clamped = clampTranslate(translateX, translateY, scale, nat.w, nat.h, cr.width, cr.height);
      translateX = clamped.tx;
      translateY = clamped.ty;
      applyTransform();
    }

    function onMouseUp() {
      if (!mouseDown) return;
      mouseDown = false;
      // Momentum — same physics as touch pan
      const speed = Math.sqrt(mousePanVx * mousePanVx + mousePanVy * mousePanVy);
      if (speed > 0.15 && mouseMovedDuringDrag) {
        const friction = 0.95;
        let vx = mousePanVx * 16;
        let vy = mousePanVy * 16;
        let prevTime = performance.now();
        const step = (now: number) => {
          const elapsed = now - prevTime;
          prevTime = now;
          const frames = elapsed / 16.67;
          const f = Math.pow(friction, frames);
          vx *= f;
          vy *= f;
          translateX += vx;
          translateY += vy;
          const cr = getContainerRect();
          const nat = getImageNaturalSize();
          const clamped = clampTranslate(translateX, translateY, scale, nat.w, nat.h, cr.width, cr.height);
          if (clamped.tx !== translateX) vx = 0;
          if (clamped.ty !== translateY) vy = 0;
          translateX = clamped.tx;
          translateY = clamped.ty;
          applyTransform();
          if (Math.abs(vx) > 0.5 || Math.abs(vy) > 0.5) {
            momentumRaf = requestAnimationFrame(step);
          } else {
            momentumRaf = 0;
          }
        };
        momentumRaf = requestAnimationFrame(step);
      }
    }

    let lastClickTime = 0;

    function onClick(e: MouseEvent) {
      if (mouseMovedDuringDrag) { mouseMovedDuringDrag = false; return; }
      if (isRecentTouch()) return;
      if ((e.target as HTMLElement).closest("button")) return;

      const now = e.timeStamp;
      const dt = now - lastClickTime;
      lastClickTime = now;

      // Rapid second click → double-click: reset zoom and fire callback
      if (dt < DOUBLE_TAP_MS && onDoubleClickRef.current) {
        lastClickTime = 0; // prevent triple-click re-trigger
        resetZoom(true);
        onDoubleClickRef.current();
        return;
      }

      if (scale > 1) {
        resetZoom(true);
      } else {
        const cr = getContainerRect();
        const cx = cr.left + cr.width / 2;
        const cy = cr.top + cr.height / 2;
        scale = DOUBLE_TAP_SCALE;
        translateX = (cx - e.clientX) * (scale - 1);
        translateY = (cy - e.clientY) * (scale - 1);
        const nat = getImageNaturalSize();
        const clamped = clampTranslate(translateX, translateY, scale, nat.w, nat.h, cr.width, cr.height);
        translateX = clamped.tx;
        translateY = clamped.ty;
        applyTransform(true);
      }
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const zoomSpeed = 0.002;
      const delta = -e.deltaY * zoomSpeed;
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * (1 + delta)));
      if (Math.abs(newScale - scale) < 0.001) return;
      const cr = getContainerRect();
      const cx = cr.left + cr.width / 2;
      const cy = cr.top + cr.height / 2;
      // Zoom centred on cursor: keep the image point under the cursor stable
      const imgOffX = (e.clientX - cx - translateX) / scale;
      const imgOffY = (e.clientY - cy - translateY) / scale;
      scale = newScale;
      translateX = (e.clientX - cx) - imgOffX * scale;
      translateY = (e.clientY - cy) - imgOffY * scale;
      const nat = getImageNaturalSize();
      const clamped = clampTranslate(translateX, translateY, scale, nat.w, nat.h, cr.width, cr.height);
      translateX = clamped.tx;
      translateY = clamped.ty;
      applyTransform();
    }

    // ── Keyboard handlers (desktop zoom) ────────────────────────────

    /** Fraction of viewport per arrow-key press. */
    const PAN_STEP = 0.25;
    /** Keyboard clamp: 5% beyond tight image edge. */
    const KB_OVERFLOW = 0.05;

    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

      // Space: toggle zoom centred (no double-click trigger)
      if (e.key === " ") {
        e.preventDefault();
        if (momentumRaf) { cancelAnimationFrame(momentumRaf); momentumRaf = 0; }
        if (scale > 1) {
          resetZoom(true);
        } else {
          scale = DOUBLE_TAP_SCALE;
          translateX = 0;
          translateY = 0;
          applyTransform(true);
        }
        return;
      }

      // Everything below: only when zoomed
      if (scale <= 1) return;

      const cr = getContainerRect();
      const nat = getImageNaturalSize();

      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          if (momentumRaf) { cancelAnimationFrame(momentumRaf); momentumRaf = 0; }
          translateX += cr.width * PAN_STEP;
          break;
        case "ArrowRight":
          e.preventDefault();
          if (momentumRaf) { cancelAnimationFrame(momentumRaf); momentumRaf = 0; }
          translateX -= cr.width * PAN_STEP;
          break;
        case "ArrowUp":
          e.preventDefault();
          if (momentumRaf) { cancelAnimationFrame(momentumRaf); momentumRaf = 0; }
          translateY += cr.height * PAN_STEP;
          break;
        case "ArrowDown":
          e.preventDefault();
          if (momentumRaf) { cancelAnimationFrame(momentumRaf); momentumRaf = 0; }
          translateY -= cr.height * PAN_STEP;
          break;
        case "Home": {
          e.preventDefault();
          if (momentumRaf) { cancelAnimationFrame(momentumRaf); momentumRaf = 0; }
          const max = clampTranslate(1e6, 1e6, scale, nat.w, nat.h, cr.width, cr.height, KB_OVERFLOW);
          translateX = e.shiftKey ? -max.tx : max.tx;
          translateY = max.ty;
          applyTransform(true);
          return;
        }
        case "End": {
          e.preventDefault();
          if (momentumRaf) { cancelAnimationFrame(momentumRaf); momentumRaf = 0; }
          const max = clampTranslate(1e6, 1e6, scale, nat.w, nat.h, cr.width, cr.height, KB_OVERFLOW);
          translateX = e.shiftKey ? max.tx : -max.tx;
          translateY = -max.ty;
          applyTransform(true);
          return;
        }
        default:
          return;
      }

      // Clamp and apply for arrow keys (instant — no animation, supports key repeat)
      const clamped = clampTranslate(translateX, translateY, scale, nat.w, nat.h, cr.width, cr.height, KB_OVERFLOW);
      translateX = clamped.tx;
      translateY = clamped.ty;
      applyTransform();
    }

    // ── Listener registration ────────────────────────────────────────

    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchmove", onTouchMove, { passive: false });
    container.addEventListener("touchend", onTouchEnd, { passive: true });

    container.addEventListener("click", onClick);
    container.addEventListener("wheel", onWheel, { passive: false });
    container.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    document.addEventListener("keydown", onKeyDown);

    // Reset zoom when image changes (handled by effect re-run via enabled dep)
    return () => {
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
      container.removeEventListener("click", onClick);
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("keydown", onKeyDown);
      if (momentumRaf) cancelAnimationFrame(momentumRaf);
      // Clean up transform if leaving
      resetZoom();
    };
  }, [containerRef, imageRef, enabled]);

  return { scaleRef };
}
