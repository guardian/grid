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

/** Track width in pixels. */
const TRACK_WIDTH = 12;

/** Minimum thumb height in pixels (ensures it's always grabbable). */
const MIN_THUMB_HEIGHT = 20;

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
  return Math.min(maxTop, (position / total) * th);
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
    tooltipEl.style.top = `${Math.max(0, Math.min(trackEl.clientHeight - 28, top))}px`;

    // Update the sort context label (first child span, data-sort-label)
    const sortLabelEl = tooltipEl.querySelector("[data-sort-label]") as HTMLElement | null;
    if (sortLabelEl) {
      if (sortLabel) {
        sortLabelEl.textContent = sortLabel;
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
}: ScrubberProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const allDataInBuffer = total <= bufferLength;
  const [trackHeight, setTrackHeight] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

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
    trackHeight > 0 ? (visibleCount / total) * trackHeight : MIN_THUMB_HEIGHT,
  );
  const maxThumbTop = Math.max(0, trackHeight - thumbHeight);
  const thumbTop =
    total > 0
      ? Math.min(maxThumbTop, (effectivePosition / total) * trackHeight)
      : 0;

  // Force-sync thumb DOM position with React's computed value when no
  // seek is pending and not dragging. Direct DOM writes during interaction
  // may drift from React's last-set style; this corrects on completion.
  useEffect(() => {
    if (isDragging || pendingSeekPosRef.current != null) return;
    const thumbEl = thumbRef.current;
    if (thumbEl) thumbEl.style.top = `${thumbTop}px`;
    const tipEl = tooltipRef.current;
    if (tipEl) tipEl.style.top = `${Math.max(0, Math.min(trackHeight - 28, thumbTop))}px`;
  }, [thumbTop, isDragging, trackHeight]);

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
      return Math.round(ratio * (total - 1));
    },
    [total],
  );

  // -------------------------------------------------------------------------
  // Click on track → instant seek
  // -------------------------------------------------------------------------

  const handleTrackClick = useCallback(
    (e: React.MouseEvent) => {
      // Don't re-seek if the user clicked the thumb
      if ((e.target as HTMLElement).dataset.scrubberThumb) return;
      const pos = positionFromY(e.clientY);

      applyThumbPosition(pos, total, visibleCount, trackRef.current, thumbRef.current, tooltipRef.current, getSortLabelRef.current?.(pos));

      if (allDataInBuffer) {
        // All data in buffer — scroll the content container
        scrollContentTo(pos / Math.max(1, total - 1));
      } else {
        pendingSeekPosRef.current = pos;
        onSeekRef.current(pos);
      }
      flashTooltip();
    },
    [positionFromY, total, visibleCount, allDataInBuffer, scrollContentTo, flashTooltip],
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

      /** Compute position from clientY, adjusting for the grab offset. */
      const positionFromDragY = (clientY: number): number => {
        const el = trackRef.current;
        if (!el || total <= 0) return 0;
        const rect = el.getBoundingClientRect();
        const th = el.clientHeight;
        const minH = Math.max(MIN_THUMB_HEIGHT, (visibleCount / total) * th);
        const adjustedY = clientY - pointerOffsetInThumb;
        const maxTop = Math.max(0, th - minH);
        const ratio = Math.max(0, Math.min(1, (adjustedY - rect.top) / maxTop));
        return Math.round(ratio * (total - 1));
      };

      const onPointerMove = (moveEvent: PointerEvent) => {
        hasMoved = true;
        const pos = positionFromDragY(moveEvent.clientY);
        latestPosition = pos;

        // Move thumb + tooltip via direct DOM writes (60fps, no React)
        applyThumbPosition(pos, total, visibleCount, trackRef.current, thumbRef.current, tooltipRef.current, getSortLabelRef.current?.(pos));

        if (allDataInBuffer) {
          // Small result set — scroll content directly
          scrollContentTo(pos / Math.max(1, total - 1));
        }
        // Large result set: no seek during drag. Thumb + tooltip show
        // the target position; data loads on pointer up.
        pendingSeekPosRef.current = pos;
      };

      const onPointerUp = () => {
        if (hasMoved) {
          if (allDataInBuffer) {
            scrollContentTo(latestPosition / Math.max(1, total - 1));
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
    [currentPosition, total, visibleCount, allDataInBuffer, scrollContentTo, flashTooltip],
  );

  // -------------------------------------------------------------------------
  // Keyboard accessibility
  // -------------------------------------------------------------------------

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
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
        applyThumbPosition(newPos, total, visibleCount, trackRef.current, thumbRef.current, tooltipRef.current, getSortLabelRef.current?.(newPos));
      }
    },
    [currentPosition, total, visibleCount, flashTooltip],
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

  const active = isDragging || isHovered || isFocused;
  const positionLabel = `${Math.min(effectivePosition + 1, total).toLocaleString()} of ${total.toLocaleString()}`;
  const sortLabel = getSortLabel?.(effectivePosition) ?? null;

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
      className="relative z-20 h-full shrink-0 cursor-pointer select-none outline-none"
      style={{
        width: TRACK_WIDTH,
        opacity: active ? 1 : 0.4,
        backgroundColor: active
          ? "var(--color-grid-separator)"
          : "transparent",
        transition: "opacity 300ms, background-color 150ms",
      }}
      onClick={handleTrackClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      onKeyDown={handleKeyDown}
    >
      {/* Thumb */}
      <div
        ref={thumbRef}
        data-scrubber-thumb="true"
        className="absolute left-0 right-0 rounded-sm transition-colors"
        style={{
          top: thumbTop,
          height: thumbHeight,
          backgroundColor:
            isDragging || isHovered
              ? "var(--color-grid-accent)"
              : "var(--color-grid-text-dim)",
          transition: isDragging
            ? "background-color 100ms"
            : "top 100ms, height 100ms, background-color 150ms",
          cursor: isDragging ? "grabbing" : "grab",
        }}
        onPointerDown={handleThumbPointerDown}
      />

      {/* Position tooltip — shown during drag and briefly after click/keyboard.
          Suppressed when all data fits on screen (thumb covers most of the track) —
          showing "1 of 3" when everything is visible is just noise. */}
      {tooltipVisible && !(allDataInBuffer && thumbHeight >= trackHeight * 0.8) && (
        <div
          ref={tooltipRef}
          className="absolute right-full mr-2 px-2 py-1 rounded text-xs text-white whitespace-nowrap pointer-events-none z-20"
          style={{
            top: Math.max(0, Math.min(trackHeight - 28, thumbTop)),
            backgroundColor: "var(--color-grid-panel)",
            border: "1px solid var(--color-grid-border)",
          }}
        >
          {/* Sort context label — primary display, updated live via data-sort-label */}
          <span
            data-sort-label=""
            className="block font-medium"
            style={sortLabel ? undefined : { display: "none" }}
          >
            {sortLabel}
          </span>
          {/* Position text — secondary, must be the first text node child for live DOM updates */}
          {positionLabel}
          {loading && (
            <span className="ml-1.5 text-grid-accent animate-pulse">●</span>
          )}
        </div>
      )}
    </div>
  );
}
