/**
 * Scrubber — vertical position indicator for the full result set.
 *
 * Represents the user's global position within potentially millions of
 * results. The native scrollbar is hidden; the scrubber is the sole
 * scroll/seek control. For small result sets that fit entirely in the
 * buffer, click/drag directly scrolls the content container. For large
 * sets, it triggers seek() to reposition the windowed buffer.
 *
 * Hidden when total ≤ 0 (no results) — shows a disabled empty track to
 * prevent layout shifts.
 *
 * See kupua/exploration/docs/search-after-plan.md → "The Scrubber — UI for
 * Position Control" for the full design.
 */

import { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Track hit-target width in pixels. Wider than the visible thumb to make
 * it easy to grab. The thumb is visually inset within this space.
 */
const TRACK_WIDTH = 14;

/** Minimum thumb height in pixels (ensures it's always grabbable). */
const MIN_THUMB_HEIGHT = 20;

/**
 * Thumb inset — left/right margin within the track, creating a narrow
 * pill centered in the hit target. Native macOS overlay scrollbar thumb
 * is ~7px wide; with 14px track and 3px inset each side = 8px thumb.
 */
const THUMB_INSET = 3;

/**
 * Thumb colors — semi-transparent white on the dark Grid background.
 * Inspired by Chrome/macOS overlay scrollbar on dark backgrounds.
 * Always visible (no fade-to-zero) — Apple is wrong. ;-)
 */
const THUMB_COLOR_IDLE = "rgba(255, 255, 255, 0.25)";
const THUMB_COLOR_HOVER = "rgba(255, 255, 255, 0.45)";
const THUMB_COLOR_ACTIVE = "rgba(255, 255, 255, 0.6)";

/** Arrow key step size (number of results to move per press). */
const ARROW_STEP = 50;

/** Shift+Arrow key step size (larger jump). */
const ARROW_STEP_LARGE = 500;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute the pixel top-offset for the thumb (or tooltip) given a global
 * position and total. Reads track dimensions from the DOM element directly
 * so the value is always fresh (no dependency on React state `trackHeight`).
 */
function thumbTopFromPosition(
  position: number,
  total: number,
  visibleCount: number,
  trackEl: HTMLElement,
): number {
  const th = trackEl.clientHeight;
  const minH = Math.max(MIN_THUMB_HEIGHT, (visibleCount / total) * th);
  const maxTop = Math.max(0, th - minH);
  // The scrubber position is the first visible item. Its range is
  // 0..(total - visibleCount). When the last item is visible (position =
  // total - visibleCount), ratio = 1.0 and the thumb touches the bottom.
  // This matches native scrollbar behavior: scrollTop / (scrollHeight - clientHeight).
  const maxPosition = Math.max(1, total - visibleCount);
  const ratio = Math.min(1, position / maxPosition);
  return Math.min(maxTop, ratio * maxTop);
}

/** Set thumb + tooltip DOM positions and text for instant visual feedback. */
function applyThumbPosition(
  position: number,
  total: number,
  visibleCount: number,
  trackEl: HTMLElement | null,
  thumbEl: HTMLElement | null,
  tooltipEl: HTMLElement | null,
  sortLabel?: string | null,
): void {
  if (!thumbEl || !trackEl || total <= 0) return;
  const top = thumbTopFromPosition(position, total, visibleCount, trackEl);
  thumbEl.style.top = `${top}px`;
  if (tooltipEl) {
    const tipH = tooltipEl.offsetHeight || 28;
    tooltipEl.style.top = `${Math.max(0, Math.min(trackEl.clientHeight - tipH, top))}px`;

    // Update the sort context label (first child span, data-sort-label).
    // Uses innerHTML because date labels contain a fixed-width <span> for
    // the month abbreviation (prevents tooltip width jitter across months).
    const sortLabelEl = tooltipEl.querySelector("[data-sort-label]") as HTMLElement | null;
    if (sortLabelEl) {
      if (sortLabel) {
        sortLabelEl.innerHTML = sortLabel;
        sortLabelEl.style.display = "";
      } else {
        sortLabelEl.style.display = "none";
      }
    }

    // Update the position text — find the text node that contains "X of Y"
    // It's after the sort label span in the new layout.
    const label = `${Math.min(position + 1, total).toLocaleString()} of ${total.toLocaleString()}`;
    // Walk child nodes looking for the text node with position info
    for (const node of tooltipEl.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent?.includes("of")) {
        node.textContent = label;
        break;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ScrubberProps {
  /** Total number of matching results in the full result set. */
  total: number;
  /** Current global position (bufferOffset + first visible index within buffer). */
  currentPosition: number;
  /** Number of items visible in the viewport (for proportional thumb sizing). */
  visibleCount: number;
  /** Number of items currently in the buffer. */
  bufferLength: number;
  /** Whether a seek/search is in flight. */
  loading: boolean;
  /** Callback to seek to a global offset. */
  onSeek: (globalOffset: number) => void;
  /**
   * Optional callback to get a sort-context label for a global position.
   * Returns e.g. "14 Mar 2024" for date sorts, "Getty" for credit sort,
   * or null if no label available. Called during drag and for the current position.
   */
  getSortLabel?: (globalPosition: number) => string | null;
  /**
   * Called once on the first user interaction (click, drag, or keyboard).
   * Used to lazily trigger data fetches (e.g. keyword distribution for sort labels)
   * that aren't needed until the user actually touches the scrubber.
   */
  onFirstInteraction?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Scrubber({
  total,
  currentPosition,
  visibleCount,
  bufferLength,
  loading,
  onSeek,
  getSortLabel,
  onFirstInteraction,
}: ScrubberProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Fire onFirstInteraction once per sort configuration. Ref-stabilised so
  // it doesn't re-fire when the callback identity changes. Reset when the
  // prop transitions from undefined→defined (e.g. sort change to keyword).
  const onFirstInteractionRef = useRef(onFirstInteraction);
  onFirstInteractionRef.current = onFirstInteraction;
  const hasInteractedRef = useRef(false);
  // Reset if the prop appeared (new keyword sort needs its distribution fetched)
  if (onFirstInteraction && !hasInteractedRef.current) {
    // No reset needed — hasn't interacted yet
  } else if (!onFirstInteraction) {
    hasInteractedRef.current = false; // Reset for next keyword sort
  }
  const notifyFirstInteraction = useCallback(() => {
    if (!hasInteractedRef.current && onFirstInteractionRef.current) {
      hasInteractedRef.current = true;
      onFirstInteractionRef.current();
    }
  }, []);

  // Set initial thumb position when the element mounts. Without this,
  // the thumb would flash at top:0 for one frame before the useEffect
  // sets the correct position (useEffect fires after paint).
  const thumbCallbackRef = useCallback((el: HTMLDivElement | null) => {
    (thumbRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    if (el && trackRef.current && total > 0) {
      const top = thumbTopFromPosition(currentPosition, total, stableVisibleCountRef.current || visibleCount, trackRef.current);
      el.style.top = `${top}px`;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Intentionally empty — only runs on mount

  const allDataInBuffer = total <= bufferLength;
  const [trackHeight, setTrackHeight] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // Stable visibleCount for thumb height calculation. In scroll mode,
  // the thumb height should not change as the user scrolls (native
  // scrollbar behavior). We freeze visibleCount when scroll mode first
  // activates. Reset when total changes (new search) or when leaving
  // scroll mode. In seek mode, use the live value (thumb height matters
  // less — the scrubber is a seeking control, not a scrollbar).
  const stableVisibleCountRef = useRef<number>(visibleCount);
  const stableTotalRef = useRef<number>(total);
  if (!allDataInBuffer) {
    // Seek mode — always use live value
    stableVisibleCountRef.current = visibleCount;
    stableTotalRef.current = total;
  } else if (stableVisibleCountRef.current === 0 || total !== stableTotalRef.current) {
    // Scroll mode, first activation or new search — capture current value
    stableVisibleCountRef.current = visibleCount;
    stableTotalRef.current = total;
  }
  // Otherwise: scroll mode, already captured — keep the frozen value.
  const thumbVisibleCount = allDataInBuffer ? stableVisibleCountRef.current : visibleCount;

  // Tooltip visibility — stays on during drag, lingers 1.5s after click/keyboard
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Show the tooltip — stays visible during drag, auto-hides after delay otherwise. */
  const flashTooltip = useCallback(() => {
    if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
    setTooltipVisible(true);
    tooltipTimerRef.current = setTimeout(() => setTooltipVisible(false), 1500);
  }, []);

  // Keep tooltip visible during drag, clear timer on drag end
  useEffect(() => {
    if (isDragging) {
      if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
      setTooltipVisible(true);
    } else if (tooltipVisible) {
      // Drag ended — start the linger timer
      tooltipTimerRef.current = setTimeout(() => setTooltipVisible(false), 1500);
    }
  }, [isDragging]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ref-stabilise onSeek to avoid re-registering listeners
  const onSeekRef = useRef(onSeek);
  onSeekRef.current = onSeek;

  // Ref-stabilise getSortLabel
  const getSortLabelRef = useRef(getSortLabel);
  getSortLabelRef.current = getSortLabel;

  // Pending seek position — a ref (not state) that holds the user's intended
  // global position while a seek is in flight. Blocks the DOM sync effect
  // from snapping the thumb back to the old currentPosition. Cleared when:
  // - total changes (new search)
  // - currentPosition changes and not dragging (seek landed)
  // - loading true→false and not dragging (operation finished)
  const pendingSeekPosRef = useRef<number | null>(null);
  const prevCurrentPosRef = useRef(currentPosition);
  const prevTotalRef = useRef(total);
  const prevLoadingRef = useRef(loading);

  // Clear the pending seek when the data catches up.
  // This runs on every render but only mutates the ref — no re-render cost.
  if (total !== prevTotalRef.current) {
    // New search — unconditionally clear
    pendingSeekPosRef.current = null;
    prevTotalRef.current = total;
    prevCurrentPosRef.current = currentPosition;
    prevLoadingRef.current = loading;
  } else if (pendingSeekPosRef.current != null && !isDragging) {
    const positionChanged = currentPosition !== prevCurrentPosRef.current;
    const loadingFinished = prevLoadingRef.current && !loading;
    if (positionChanged || loadingFinished) {
      pendingSeekPosRef.current = null;
    }
    prevCurrentPosRef.current = currentPosition;
    prevTotalRef.current = total;
    prevLoadingRef.current = loading;
  } else {
    prevCurrentPosRef.current = currentPosition;
    prevTotalRef.current = total;
    prevLoadingRef.current = loading;
  }

  // -------------------------------------------------------------------------
  // Measure track height + wheel forwarding (callback ref)
  // -------------------------------------------------------------------------

  // Callback ref instead of useEffect([], []) because the component returns
  // null when total <= 0. A mount-time effect would see trackRef.current =
  // null and never set up the observer.
  const observerRef = useRef<ResizeObserver | null>(null);
  const trackCallbackRef = useCallback((el: HTMLDivElement | null) => {
    (trackRef as React.MutableRefObject<HTMLDivElement | null>).current = el;

    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      setTrackHeight(entries[0]?.contentRect.height ?? el.clientHeight);
    });
    observer.observe(el);
    observerRef.current = observer;
    setTrackHeight(el.clientHeight);

    // Forward wheel events to the adjacent content scroll container.
    // No explicit teardown — the element is removed from the DOM when the
    // component returns null (total <= 0), and the listener is GC'd.
    el.addEventListener("wheel", (e: WheelEvent) => {
      const scrollContainer = el.previousElementSibling?.querySelector("[role='region']")
        ?? el.previousElementSibling?.querySelector(".overflow-auto");
      if (scrollContainer) {
        const before = scrollContainer.scrollTop;
        scrollContainer.scrollTop += e.deltaY;
        // Only prevent default if the scroll actually moved — otherwise let
        // the event propagate so the browser can handle it normally. After a
        // seek, the scroll container may briefly have scrollHeight === clientHeight
        // (virtualizer hasn't re-rendered), making the assignment a no-op.
        if (scrollContainer.scrollTop !== before) {
          e.preventDefault();
        }
      }
    }, { passive: false });
  }, []);

  // -------------------------------------------------------------------------
  // Thumb geometry
  // -------------------------------------------------------------------------

  const effectivePosition = pendingSeekPosRef.current ?? currentPosition;
  const thumbHeight = Math.max(
    MIN_THUMB_HEIGHT,
    trackHeight > 0 ? (thumbVisibleCount / total) * trackHeight : MIN_THUMB_HEIGHT,
  );
  const maxThumbTop = Math.max(0, trackHeight - thumbHeight);
  // maxPosition: the highest value currentPosition can reach (first visible
  // item when scrolled to the very bottom). Matches thumbTopFromPosition().
  const maxPosition = Math.max(1, total - thumbVisibleCount);
  // Used for tooltip positioning and aria — NOT for inline thumb style
  // (thumb position is controlled exclusively via DOM writes to avoid
  // React reconciler fighting with direct DOM writes during drag).
  const thumbTop =
    total > 1
      ? Math.min(maxThumbTop, (effectivePosition / maxPosition) * maxThumbTop)
      : 0;

  // Sync thumb DOM position with React's computed value when no
  // seek is pending and not dragging. This is the ONLY path that sets
  // thumb.style.top outside of drag/click handlers — the inline JSX
  // style intentionally omits `top` to prevent the React reconciler
  // from fighting direct DOM writes.
  //
  // In scroll mode, the continuous sync effect below handles positioning
  // from the actual scroll ratio — skip here to avoid the two fighting.
  useEffect(() => {
    if (isDragging || pendingSeekPosRef.current != null) return;
    if (allDataInBuffer) return; // scroll mode — handled by scroll listener below
    const thumbEl = thumbRef.current;
    if (thumbEl) thumbEl.style.top = `${thumbTop}px`;
    const tipEl = tooltipRef.current;
    if (tipEl) {
      const tipH = tipEl.offsetHeight || 28;
      tipEl.style.top = `${Math.max(0, Math.min(trackHeight - tipH, thumbTop))}px`;
    }
  }, [thumbTop, isDragging, trackHeight, allDataInBuffer]);

  // -------------------------------------------------------------------------
  // Scroll-mode continuous sync
  //
  // In scroll mode (allDataInBuffer), the discrete visibleRange.start from
  // the virtualizer has a "dead zone" at the top: it stays at 0 until the
  // first row fully scrolls out of view. This makes the scrubber thumb lag
  // behind the native scrollbar.
  //
  // Fix: attach a scroll listener directly to the content container and
  // compute thumb position from the continuous scroll ratio:
  //   ratio = scrollTop / (scrollHeight - clientHeight)
  // This exactly matches native scrollbar behavior — pixel-perfect.
  // -------------------------------------------------------------------------

  /** Find the scroll container adjacent to the scrubber track. */
  const findScrollContainer = useCallback((): Element | null => {
    const contentCol = trackRef.current?.previousElementSibling;
    if (!contentCol) return null;
    return contentCol.querySelector("[role='region']")
      ?? contentCol.querySelector(".overflow-auto");
  }, []);

  useEffect(() => {
    if (!allDataInBuffer) return; // seek mode — handled by the discrete sync above

    const scrollEl = findScrollContainer();
    if (!scrollEl) return;

    const syncFromScroll = () => {
      if (isDragging) return; // drag handler controls thumb during drag
      const thumbEl = thumbRef.current;
      if (!thumbEl) return;

      const maxScroll = scrollEl.scrollHeight - scrollEl.clientHeight;
      const ratio = maxScroll > 0 ? scrollEl.scrollTop / maxScroll : 0;
      const clampedRatio = Math.max(0, Math.min(1, ratio));
      const top = clampedRatio * maxThumbTop;

      thumbEl.style.top = `${top}px`;
      const tipEl = tooltipRef.current;
      if (tipEl) {
        const tipH = tipEl.offsetHeight || 28;
        tipEl.style.top = `${Math.max(0, Math.min(trackHeight - tipH, top))}px`;
      }
    };

    // Sync immediately (covers programmatic scroll resets, buffer changes)
    syncFromScroll();

    scrollEl.addEventListener("scroll", syncFromScroll, { passive: true });
    return () => scrollEl.removeEventListener("scroll", syncFromScroll);
  }, [allDataInBuffer, isDragging, maxThumbTop, trackHeight, findScrollContainer]);

  // -------------------------------------------------------------------------
  // Position → offset and back
  // -------------------------------------------------------------------------

  /** Scroll the adjacent content container to a position ratio (0–1). */
  const scrollContentTo = useCallback((ratio: number) => {
    const contentCol = trackRef.current?.previousElementSibling;
    if (!contentCol) return;
    const scrollContainer = contentCol.querySelector("[role='region']")
      ?? contentCol.querySelector(".overflow-auto");
    if (scrollContainer) {
      scrollContainer.scrollTop = Math.round(
        ratio * (scrollContainer.scrollHeight - scrollContainer.clientHeight),
      );
    }
  }, []);

  const positionFromY = useCallback(
    (clientY: number): number => {
      const el = trackRef.current;
      if (!el || total <= 0) return 0;
      const rect = el.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      const maxPos = Math.max(1, total - thumbVisibleCount);
      return Math.round(ratio * maxPos);
    },
    [total, thumbVisibleCount],
  );

  // -------------------------------------------------------------------------
  // Click on track → instant seek
  // -------------------------------------------------------------------------

  const handleTrackClick = useCallback(
    (e: React.MouseEvent) => {
      // Don't re-seek if the user clicked the thumb
      if ((e.target as HTMLElement).dataset.scrubberThumb) return;
      notifyFirstInteraction();
      const pos = positionFromY(e.clientY);

      applyThumbPosition(pos, total, thumbVisibleCount, trackRef.current, thumbRef.current, tooltipRef.current, getSortLabelRef.current?.(pos));

      if (allDataInBuffer) {
        // All data in buffer — scroll the content container
        const maxPos = Math.max(1, total - thumbVisibleCount);
        scrollContentTo(pos / maxPos);
      } else {
        pendingSeekPosRef.current = pos;
        onSeekRef.current(pos);
      }
      flashTooltip();
    },
    [positionFromY, total, thumbVisibleCount, allDataInBuffer, scrollContentTo, flashTooltip],
  );

  // -------------------------------------------------------------------------
  // Drag thumb → linear seek (deferred to pointer up)
  //
  // Drag is purely a seeking tool. The thumb follows the cursor linearly
  // (like any scrollbar). Position = cursor Y mapped to 0..total-1.
  // No data is fetched during drag — just the thumb and tooltip move.
  // One single seek fires on pointer up. Fine-grained browsing of
  // adjacent items is done via wheel/trackpad (native scroll physics).
  //
  // For small result sets (allDataInBuffer), drag directly scrolls the
  // content container — no seek needed, instant feedback.
  // -------------------------------------------------------------------------

  const handleThumbPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      notifyFirstInteraction();

      const thumb = e.currentTarget as HTMLElement;
      thumb.setPointerCapture(e.pointerId);
      setIsDragging(true);

      // Freeze the thumb at its current visual position during the grab.
      pendingSeekPosRef.current = currentPosition;

      // Capture the offset of the pointer within the thumb so dragging
      // doesn't snap the thumb top to the cursor position.
      const thumbRect = thumb.getBoundingClientRect();
      const pointerOffsetInThumb = e.clientY - thumbRect.top;

      let latestPosition = currentPosition;
      let hasMoved = false;

      // Freeze visible count for the duration of this drag — prevents
      // thumb height from fluctuating as content scrolls.
      const dragVisibleCount = thumbVisibleCount;

      /** Compute position from clientY, adjusting for the grab offset. */
      const positionFromDragY = (clientY: number): number => {
        const el = trackRef.current;
        if (!el || total <= 0) return 0;
        const rect = el.getBoundingClientRect();
        const th = el.clientHeight;
        const minH = Math.max(MIN_THUMB_HEIGHT, (dragVisibleCount / total) * th);
        const adjustedY = clientY - pointerOffsetInThumb;
        const maxTop = Math.max(0, th - minH);
        const ratio = Math.max(0, Math.min(1, (adjustedY - rect.top) / maxTop));
        const maxPos = Math.max(1, total - dragVisibleCount);
        return Math.round(ratio * maxPos);
      };

      const onPointerMove = (moveEvent: PointerEvent) => {
        hasMoved = true;
        const pos = positionFromDragY(moveEvent.clientY);
        latestPosition = pos;

        // Move thumb + tooltip via direct DOM writes (60fps, no React)
        applyThumbPosition(pos, total, dragVisibleCount, trackRef.current, thumbRef.current, tooltipRef.current, getSortLabelRef.current?.(pos));

        if (allDataInBuffer) {
          // Small result set — scroll content directly
          const maxPos = Math.max(1, total - dragVisibleCount);
          scrollContentTo(pos / maxPos);
        }
        // Large result set: no seek during drag. Thumb + tooltip show
        // the target position; data loads on pointer up.
        pendingSeekPosRef.current = pos;
      };

      const onPointerUp = () => {
        if (hasMoved) {
          if (allDataInBuffer) {
            const maxPos = Math.max(1, total - dragVisibleCount);
            scrollContentTo(latestPosition / maxPos);
          } else {
            // Single seek to the final position
            onSeekRef.current(latestPosition);
          }
        } else {
          // Click-without-drag
          pendingSeekPosRef.current = null;
          flashTooltip();
        }
        setIsDragging(false);
        document.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("pointerup", onPointerUp);
        document.removeEventListener("pointercancel", onPointerUp);
      };

      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", onPointerUp);
      document.addEventListener("pointercancel", onPointerUp);
    },
    [currentPosition, total, thumbVisibleCount, allDataInBuffer, scrollContentTo, flashTooltip],
  );

  // -------------------------------------------------------------------------
  // Keyboard accessibility
  // -------------------------------------------------------------------------

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      notifyFirstInteraction();
      let newPos: number | null = null;
      const step = e.shiftKey ? ARROW_STEP_LARGE : ARROW_STEP;
      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          newPos = Math.max(0, currentPosition - step);
          break;
        case "ArrowDown":
          e.preventDefault();
          newPos = Math.min(total - 1, currentPosition + step);
          break;
        // Home/End/PageUp/PageDown: prevent the browser from applying
        // default behaviour (e.g. selection highlight) on the focused
        // track element. The actual seek is handled by useListNavigation
        // via its document-level capture listener, but we need
        // preventDefault here to suppress the visual glitch.
        case "Home":
        case "End":
        case "PageUp":
        case "PageDown":
          e.preventDefault();
          break;
      }
      if (newPos != null) {
        pendingSeekPosRef.current = newPos;
        onSeekRef.current(newPos);
        flashTooltip();
        applyThumbPosition(newPos, total, thumbVisibleCount, trackRef.current, thumbRef.current, tooltipRef.current, getSortLabelRef.current?.(newPos));
      }
    },
    [currentPosition, total, thumbVisibleCount, flashTooltip],
  );

  // -------------------------------------------------------------------------
  // Empty state — show a disabled scrubber when there are no results.
  // Never fully hide: layout shifts are disorienting.
  // -------------------------------------------------------------------------

  if (total <= 0) {
    return (
      <div
        className="relative z-20 h-full shrink-0 select-none"
        style={{ width: TRACK_WIDTH, opacity: 0.15 }}
        aria-hidden="true"
      />
    );
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const positionLabel = `${Math.min(effectivePosition + 1, total).toLocaleString()} of ${total.toLocaleString()}`;
  const sortLabel = getSortLabel?.(effectivePosition) ?? null;

  // Thumb color — three states: dragging > hover > idle
  const thumbColor = isDragging
    ? THUMB_COLOR_ACTIVE
    : isHovered
      ? THUMB_COLOR_HOVER
      : THUMB_COLOR_IDLE;

  return (
    <div
      ref={trackCallbackRef}
      role="slider"
      aria-label="Result set position"
      aria-valuemin={0}
      aria-valuemax={Math.max(0, total - 1)}
      aria-valuenow={Math.round(effectivePosition)}
      aria-valuetext={sortLabel ? `${positionLabel} — ${sortLabel}` : positionLabel}
      aria-orientation="vertical"
      tabIndex={0}
      className="relative z-20 h-full shrink-0 select-none outline-none"
      style={{
        width: TRACK_WIDTH,
        /* Track is always transparent — the thumb is the only visible part.
           The track is wider than the thumb for a generous hit target. */
        backgroundColor: "transparent",
        transition: "opacity 300ms",
      }}
      onClick={handleTrackClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onKeyDown={handleKeyDown}
    >
      {/* Thumb — narrow pill inset within the track. Position controlled
          exclusively via DOM writes (useEffect + applyThumbPosition).
          Inline style omits `top` to prevent React reconciler fighting. */}
      <div
        ref={thumbCallbackRef}
        data-scrubber-thumb="true"
        className="absolute"
        style={{
          left: THUMB_INSET,
          right: THUMB_INSET,
          height: thumbHeight,
          borderRadius: (TRACK_WIDTH - THUMB_INSET * 2) / 2, // full pill
          backgroundColor: thumbColor,
          transition: isDragging
            ? "background-color 80ms"
            : "top 100ms, height 100ms, background-color 200ms",
        }}
        onPointerDown={handleThumbPointerDown}
      />

      {/* Position tooltip — shown during drag and briefly after click/keyboard.
          Suppressed when all data fits on screen (thumb covers most of the track) —
          showing "1 of 3" when everything is visible is just noise.
          Right-aligned so width changes (month names, position digits) push the
          less-visible left edge while the right edge stays locked to the scrubber. */}
      {tooltipVisible && !(allDataInBuffer && thumbHeight >= trackHeight * 0.8) && (
        <div
          ref={tooltipRef}
          className="absolute right-full mr-2 px-2 py-1 rounded text-xs text-white whitespace-nowrap pointer-events-none z-20"
          style={{
            top: Math.max(0, Math.min(trackHeight - 48, thumbTop)),
            textAlign: "right",
            backgroundColor: "var(--color-grid-panel)",
            border: "1px solid var(--color-grid-border)",
          }}
        >
          {/* Sort context label — primary display, updated live via data-sort-label.
              Uses innerHTML because date labels contain a fixed-width <span> for
              the month abbreviation. Values are always generated internally
              (formatSortDate or ES keyword values), never user input. */}
          <span
            data-sort-label=""
            className="block font-medium"
            style={sortLabel ? undefined : { display: "none" }}
            dangerouslySetInnerHTML={sortLabel ? { __html: sortLabel } : undefined}
          />
          {/* Position text — secondary, must be the first text node child for live DOM updates */}
          {positionLabel}
          {/* Loading dot — always in the DOM to prevent width twitch on load
              state changes. Visibility toggled, not presence. */}
          <span
            className="ml-1.5 text-grid-accent animate-pulse"
            style={{ visibility: loading ? "visible" : "hidden" }}
          >●</span>
        </div>
      )}
    </div>
  );
}
