/**
 * usePinchZoom — two-finger pinch to zoom, single-finger pan while zoomed,
 * double-tap to toggle 1x ↔ 2x.
 *
 * Standard pattern in GPhotos, iOS Photos, Twitter/X.
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

interface UsePinchZoomOptions {
  /** Container element — for measuring bounds. */
  containerRef: RefObject<HTMLElement | null>;
  /** The <img> element — transform is applied here. */
  imageRef: RefObject<HTMLImageElement | null>;
  /** When false, the effect is a no-op. */
  enabled?: boolean;
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

/** Clamp translate so image edges don't scroll past container edges. */
function clampTranslate(
  tx: number,
  ty: number,
  scale: number,
  imgW: number,
  imgH: number,
  cW: number,
  cH: number,
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

  const maxTx = Math.max(0, (renderedW * scale - cW) / 2);
  const maxTy = Math.max(0, (renderedH * scale - cH) / 2);
  return {
    tx: Math.max(-maxTx, Math.min(maxTx, tx)),
    ty: Math.max(-maxTy, Math.min(maxTy, ty)),
  };
}

export function usePinchZoom({
  containerRef,
  imageRef,
  enabled = true,
}: UsePinchZoomOptions): UsePinchZoomReturn {
  const scaleRef = useRef(1);

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

    function applyTransform(animate = false) {
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
        const cr = getContainerRect();
        const cx = cr.left + cr.width / 2;
        const cy = cr.top + cr.height / 2;

        // Vector from container center to initial pinch midpoint
        const dx0 = pinchMidStart.x - cx;
        const dy0 = pinchMidStart.y - cy;
        // Vector from container center to current pinch midpoint
        const dx1 = mid.x - cx;
        const dy1 = mid.y - cy;

        // The translate that keeps the pinch-point stable:
        // (translate + mid) / scale == (startTranslate + startMid) / startScale
        translateX = pinchTranslateStart.x + dx1 - dx0 * (scale / pinchScaleStart);
        translateY = pinchTranslateStart.y + dy1 - dy0 * (scale / pinchScaleStart);

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
        // If one finger lifted but one remains, switch to pan
        if (e.touches.length === 1 && scale > 1) {
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
          // Snap to 1x if pinched below
          if (scale <= 1) {
            resetZoom(true);
          }
        }
        return;
      }

      if (isPanning) {
        isPanning = false;

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

    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchmove", onTouchMove, { passive: false });
    container.addEventListener("touchend", onTouchEnd, { passive: true });

    // Reset zoom when image changes (handled by effect re-run via enabled dep)
    return () => {
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
      if (momentumRaf) cancelAnimationFrame(momentumRaf);
      // Clean up transform if leaving
      resetZoom();
    };
  }, [containerRef, imageRef, enabled]);

  return { scaleRef };
}
