/**
 * useSwipeDismiss — pull down to dismiss image detail.
 *
 * Standard pattern: GPhotos, Instagram, Twitter/X, iOS Photos.
 * Drag the image downward → the entire detail view (header + image +
 * metadata) translates down and scales, while the grid/list underneath
 * fades in → past threshold, dismiss; under threshold, spring back.
 *
 * Three refs:
 * - containerRef: where touch events are captured (image area, touch-action: none)
 * - wrapperRef:   the entire detail view (animated: translateY + scale + opacity)
 * - backdropRef:  the grid/list behind (opacity animated in sync)
 *
 * Gesture conflict with useSwipeCarousel is resolved by direction:
 * horizontal → carousel, vertical downward → dismiss. Decided in the
 * first ~10px of movement. Mutually exclusive by axis.
 *
 * Only active on the image container (touch-action: none), mobile only.
 * Disabled in fullscreen (tap exits fullscreen instead).
 *
 * Same imperative pattern as useSwipeCarousel: direct DOM manipulation
 * via touch listeners, refs for mutable state, no React re-renders
 * during the gesture.
 */

import { useEffect, useRef, type RefObject } from "react";

/** Minimum movement before deciding vertical vs horizontal. */
const DECIDE_THRESHOLD = 10;

/** Distance (px) to commit a slow drag. */
const DISMISS_DISTANCE = 150;

/** Velocity threshold (px/ms) — above this, commit regardless of distance. */
const DISMISS_VELOCITY = 0.3;

/** Max scale reduction at full threshold (1.0 → 0.9). */
const SCALE_FACTOR = 0.0005;

/** Spring-back / commit animation duration (ms). */
const ANIMATION_MS = 200;

/** Hero dismiss FLIP animation duration — slightly longer for the cross-screen flight. */
const HERO_ANIMATION_MS = 280;

interface UseSwipeDismissOptions {
  /** The image container — touch events are captured here (touch-action: none area). */
  containerRef: RefObject<HTMLElement | null>;
  /** The entire detail view wrapper — animated (translateY + scale + opacity). */
  wrapperRef: RefObject<HTMLElement | null>;
  /** The grid/list container behind the detail — faded in during dismiss. */
  backdropRef?: RefObject<HTMLElement | null>;
  /** Called when dismiss is committed. */
  onDismiss: () => void;
  /** Called once when the dismiss gesture starts (direction decided as vertical-down).
   *  Use to pre-scroll the grid behind the detail view to the correct position. */
  onDragStart?: () => void;
  /** When false, the effect is a no-op. */
  enabled?: boolean;
  /** When scale > 1, suppress dismiss (image is zoomed — pan instead). */
  scaleRef?: RefObject<number>;
  /** Current image id — used for FLIP hero animation (fly-back to grid thumbnail). */
  imageId?: string;
  /** If provided, this element is animated during drag instead of wrapperRef.
   *  Used in fullscreen where the wrapper is the fullscreen element — moving it
   *  is invisible (black-on-black). The container bg is cleared so the drag
   *  target appears to float. */
  dragTargetRef?: RefObject<HTMLElement | null>;
}

export function useSwipeDismiss({
  containerRef,
  wrapperRef,
  backdropRef,
  onDismiss,
  onDragStart,
  enabled = true,
  scaleRef,
  imageId,
  dragTargetRef,
}: UseSwipeDismissOptions): void {
  const cbDismiss = useRef(onDismiss);
  cbDismiss.current = onDismiss;
  const cbDragStart = useRef(onDragStart);
  cbDragStart.current = onDragStart;
  const imageIdRef = useRef(imageId);
  imageIdRef.current = imageId;

  useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    const wrapper = wrapperRef.current;
    if (!container || !wrapper) return;
    const backdrop = backdropRef?.current;
    const dragTarget = dragTargetRef?.current; // fullscreen: animate image directly

    let startY = 0;
    let startX = 0;
    let lastY = 0;
    let lastTime = 0;
    let velocity = 0; // px/ms, positive = moving down
    let tracking = false;
    let decided = false;
    let animating = false;
    // Chrome elements — cached on drag start, used during drag + cleanup.
    let headerEl: HTMLElement | null = null;
    let asideEl: HTMLElement | null = null;
    let scrollEl: HTMLElement | null = null; // container's parent (mobile scroll area)

    /** Set backdrop opacity (the grid/list fading in behind). */
    function setBackdropOpacity(opacity: string) {
      if (backdrop) backdrop.style.opacity = opacity;
    }

    function onTouchStart(e: TouchEvent) {
      if (animating || e.touches.length !== 1) return;
      if (scaleRef?.current && scaleRef.current > 1) return; // zoomed — pan, not dismiss
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      lastY = startY;
      lastTime = e.timeStamp;
      velocity = 0;
      tracking = false;
      decided = false;
    }

    function onTouchMove(e: TouchEvent) {
      if (animating || e.touches.length !== 1) return;
      const currentY = e.touches[0].clientY;
      const dy = currentY - startY;
      const dx = e.touches[0].clientX - startX;

      if (!decided) {
        if (Math.abs(dx) < DECIDE_THRESHOLD && Math.abs(dy) < DECIDE_THRESHOLD) return;
        decided = true;
        // Claim only if predominantly vertical AND downward
        tracking = Math.abs(dy) > Math.abs(dx) && dy > 0;
        if (!tracking) return;
        // Fire onDragStart once — pre-scroll the grid to the correct image
        cbDragStart.current?.();
        // Cache chrome elements for per-frame opacity during drag
        headerEl = wrapper.querySelector("header") as HTMLElement | null;
        asideEl = wrapper.querySelector("aside") as HTMLElement | null;
        scrollEl = container.parentElement as HTMLElement | null;
      }
      if (!tracking) return;

      e.preventDefault();

      // Track velocity (EMA for smoothness)
      const dt = e.timeStamp - lastTime;
      if (dt > 0) {
        const instantV = (currentY - lastY) / dt;
        velocity = velocity * 0.4 + instantV * 0.6;
      }
      lastY = currentY;
      lastTime = e.timeStamp;

      // Clamp to downward only (no upward pull past origin)
      const offset = Math.max(0, dy);

      // Progress 0→1 as offset approaches dismiss distance
      const progress = Math.min(1, offset / DISMISS_DISTANCE);

      // Animate wrapper: translate down + slight scale reduction
      const scale = Math.max(0.85, 1 - offset * SCALE_FACTOR);

      if (dragTarget) {
        // Fullscreen mode: animate just the image, not the wrapper/container.
        // The wrapper IS the fullscreen element — its bg is UA `background: black`.
        // Moving it is invisible (black-on-black). Instead, make the container
        // transparent and move the image itself so it floats against the dark backdrop.
        container.style.background = "transparent";
        dragTarget.style.transform = `translateY(${offset}px) scale(${scale})`;
        dragTarget.style.opacity = `${Math.max(0.3, 1 - progress * 0.4)}`;
      } else {
        wrapper.style.transform = `translateY(${offset}px) scale(${scale})`;

        // Chrome (header, metadata) fades faster than the image.
        // We can't use wrapper opacity (multiplies children). Instead:
        // - wrapper stays opacity 1
        // - header + aside (metadata) fade at ~2× rate
        // - image container stays mostly opaque (slight fade at end)
        const chromeFade = `${Math.max(0, 1 - progress * 1.8)}`;
        const imageFade = `${Math.max(0.3, 1 - progress * 0.4)}`;
        if (headerEl) headerEl.style.opacity = chromeFade;
        if (asideEl) asideEl.style.opacity = chromeFade;
        container.style.opacity = imageFade;
        // Hide wrapper bg, image-area bg, and scrollbar so only the image is visible
        wrapper.style.backgroundColor = "transparent";
        container.style.backgroundColor = "transparent";
        if (scrollEl) scrollEl.style.overflow = "hidden";
      }

      // Fade in grid/list behind
      setBackdropOpacity(`${progress}`);
    }

    function onTouchEnd() {
      if (!tracking || animating) return;

      const transformEl = dragTarget ?? wrapper;
      const match = transformEl.style.transform.match(/translateY\(([-.0-9]+)px\)/);
      const offset = match ? parseFloat(match[1]) : 0;
      // Commit only when the user is still moving downward (or stopped).
      // If velocity is negative (returning upward), ALWAYS cancel — even if
      // offset is past the threshold. This matches GPhotos: you can pull way
      // past the threshold but flick back up to cancel the dismiss.
      const movingDown = velocity >= 0;
      const commit =
        movingDown &&
        (offset > DISMISS_DISTANCE || velocity > DISMISS_VELOCITY);

      const transition = `transform ${ANIMATION_MS}ms ease-out, opacity ${ANIMATION_MS}ms ease-out`;

      if (commit) {
        animating = true;

        // ── Hero dismiss: phantom image flies back to grid/table thumbnail ──
        // Instead of animating the wrapper (whose center ≠ image center),
        // create a position:fixed phantom <img> at the image's current visual
        // position, hide the wrapper fast (chrome vanishes), and fly the
        // phantom to the thumbnail. This is the GPhotos pattern.
        const heroId = imageIdRef.current;
        const thumb = heroId && backdrop
          ? backdrop.querySelector(`[data-image-id="${CSS.escape(heroId)}"] img`) as HTMLElement | null
          : null;
        const currentImg = container.querySelector('img[fetchpriority="high"]') as HTMLImageElement
          ?? container.querySelector('img') as HTMLImageElement;

        if (thumb && currentImg) {
          const imageRect = container.getBoundingClientRect();
          const thumbRect = thumb.getBoundingClientRect();

          // Create phantom at the image's current visual position
          const phantom = document.createElement("img");
          phantom.src = currentImg.src;
          phantom.draggable = false;
          phantom.style.cssText = [
            "position:fixed",
            "z-index:99999",
            "pointer-events:none",
            "object-fit:contain",
            `left:${imageRect.left}px`,
            `top:${imageRect.top}px`,
            `width:${imageRect.width}px`,
            `height:${imageRect.height}px`,
            "transform-origin:center center",
            "will-change:transform,opacity",
          ].join(";");
          document.body.appendChild(phantom);

          // Immediately hide the wrapper (chrome fades fast)
          wrapper.style.transition = `transform 80ms ease-out, opacity 80ms ease-out`;
          wrapper.style.transform = `translateY(${offset + 40}px) scale(0.95)`;
          wrapper.style.opacity = "0";

          // Backdrop to full
          if (backdrop) {
            backdrop.style.transition = `opacity ${HERO_ANIMATION_MS}ms ease-out`;
            backdrop.style.opacity = "1";
          }

          // FLIP: fly phantom center → thumbnail center
          const thumbCx = thumbRect.left + thumbRect.width / 2;
          const thumbCy = thumbRect.top + thumbRect.height / 2;
          const imageCx = imageRect.left + imageRect.width / 2;
          const imageCy = imageRect.top + imageRect.height / 2;
          const dx = thumbCx - imageCx;
          const dy = thumbCy - imageCy;
          const s = Math.min(thumbRect.width / imageRect.width, thumbRect.height / imageRect.height);

          requestAnimationFrame(() => {
            phantom.style.transition = `transform ${HERO_ANIMATION_MS}ms ease-in-out, opacity ${HERO_ANIMATION_MS}ms ease-in-out`;
            phantom.style.transform = `translate(${dx}px, ${dy}px) scale(${s})`;
            phantom.style.opacity = "0";
          });

          phantom.addEventListener(
            "transitionend",
            () => {
              phantom.remove();
              animating = false;
              wrapper.style.transition = "";
              wrapper.style.transform = "";
              wrapper.style.opacity = "";
              // Reset chrome opacity + bg from drag phase
              if (headerEl) headerEl.style.opacity = "";
              if (asideEl) asideEl.style.opacity = "";
              container.style.opacity = "";
              container.style.backgroundColor = "";
              wrapper.style.backgroundColor = "";
              if (scrollEl) scrollEl.style.overflow = "";
              if (backdrop) {
                backdrop.style.transition = "";
                backdrop.style.opacity = "";
              }
              cbDismiss.current();
            },
            { once: true },
          );
        } else if (dragTarget) {
          // Fullscreen fallback: animate the drag target (image) down + fade
          dragTarget.style.transition = transition;
          dragTarget.style.transform = `translateY(${offset + 100}px) scale(0.85)`;
          dragTarget.style.opacity = "0";

          dragTarget.addEventListener(
            "transitionend",
            () => {
              animating = false;
              dragTarget.style.transition = "";
              dragTarget.style.transform = "";
              dragTarget.style.opacity = "";
              container.style.background = "";
              cbDismiss.current();
            },
            { once: true },
          );
        } else {
          // Fallback: generic slide-down fade (thumbnail not found or no image)
          wrapper.style.transition = transition;
          wrapper.style.transform = `translateY(${offset + 100}px) scale(0.85)`;
          wrapper.style.opacity = "0";

          if (backdrop) {
            backdrop.style.transition = `opacity ${ANIMATION_MS}ms ease-out`;
            backdrop.style.opacity = "1";
          }

          wrapper.addEventListener(
            "transitionend",
            () => {
              animating = false;
              wrapper.style.transition = "";
              wrapper.style.transform = "";
              wrapper.style.opacity = "";
              if (headerEl) headerEl.style.opacity = "";
              if (asideEl) asideEl.style.opacity = "";
              container.style.opacity = "";
              container.style.backgroundColor = "";
              wrapper.style.backgroundColor = "";
              if (scrollEl) scrollEl.style.overflow = "";
              if (backdrop) {
                backdrop.style.transition = "";
                backdrop.style.opacity = "";
              }
              cbDismiss.current();
            },
            { once: true },
          );
        }
      } else {
        // Spring back
        if (dragTarget) {
          // Fullscreen spring back: reset drag target
          if (offset < 1) {
            dragTarget.style.transform = "";
            dragTarget.style.opacity = "";
            container.style.background = "";
          } else {
            dragTarget.style.transition = transition;
            dragTarget.style.transform = "";
            dragTarget.style.opacity = "";
            container.style.background = "";
            dragTarget.addEventListener(
              "transitionend",
              () => { dragTarget.style.transition = ""; },
              { once: true },
            );
          }
        } else if (offset < 1) {
          wrapper.style.transform = "";
          if (headerEl) headerEl.style.opacity = "";
          if (asideEl) asideEl.style.opacity = "";
          container.style.opacity = "";
          container.style.backgroundColor = "";
          wrapper.style.backgroundColor = "";
          if (scrollEl) scrollEl.style.overflow = "";
          setBackdropOpacity("");
        } else {
          wrapper.style.transition = transition;
          wrapper.style.transform = "";
          // Chrome opacity resets via transition
          if (headerEl) {
            headerEl.style.transition = `opacity ${ANIMATION_MS}ms ease-out`;
            headerEl.style.opacity = "";
          }
          if (asideEl) {
            asideEl.style.transition = `opacity ${ANIMATION_MS}ms ease-out`;
            asideEl.style.opacity = "";
          }
          container.style.transition = `opacity ${ANIMATION_MS}ms ease-out`;
          container.style.opacity = "";
          container.style.backgroundColor = "";
          wrapper.style.backgroundColor = "";
          if (scrollEl) scrollEl.style.overflow = "";
          if (backdrop) {
            backdrop.style.transition = `opacity ${ANIMATION_MS}ms ease-out`;
            backdrop.style.opacity = "";
          }
          wrapper.addEventListener(
            "transitionend",
            () => {
              wrapper.style.transition = "";
              if (headerEl) headerEl.style.transition = "";
              if (asideEl) asideEl.style.transition = "";
              container.style.transition = "";
              if (backdrop) backdrop.style.transition = "";
            },
            { once: true },
          );
        }
      }
    }

    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchmove", onTouchMove, { passive: false });
    container.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
    };
  }, [containerRef, wrapperRef, backdropRef, enabled]);
}
