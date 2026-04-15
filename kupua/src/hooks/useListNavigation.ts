/**
 * useListNavigation — shared keyboard navigation for all density views.
 *
 * Abstracts the common navigation logic parameterised by density geometry.
 * Table passes `columnsPerRow: 1`, grid passes `columnsPerRow: N`.
 *
 * ## Two modes
 *
 * **No focus (focusedImageId === null):**
 *   - Arrow Up/Down: scroll exactly one row, snapping to row boundary.
 *   - PageUp/Down: scroll one page, snapping to row boundary, never skipping
 *     a row that wasn't fully visible before the scroll.
 *   - Home/End: scroll to absolute start/end.
 *   - None of these keys set focus.
 *
 * **Has focus (focusedImageId !== null):**
 *   - Arrow Up/Down: move focus by ±columnsPerRow items (one visual row).
 *   - Arrow Left/Right (grid only): move focus by ±1 item.
 *   - PageUp/Down: move focus by one page of rows, using the same row-aligned
 *     principles as no-focus mode, but targeting the focused image.
 *   - Home/End: scroll to start/end AND focus first/last image.
 *   - Enter: open the focused image.
 *
 * ## Key propagation
 *
 * CqlSearchInput propagates ArrowUp/Down, PageUp/Down, Home/End (not Left/Right).
 * Native inputs (date filters etc.) are excluded via `isNativeInputTarget`.
 *
 * ## What stays in the density component
 *
 * - Scroll reset on search param change
 * - Density-switch viewport position preservation
 * - All rendering
 */

import { useCallback, useEffect, useRef } from "react";
import type { Virtualizer } from "@tanstack/react-virtual";
import { isNativeInputTarget } from "@/lib/keyboard-shortcuts";
import { useSearchStore } from "@/stores/search-store";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ListNavigationConfig {
  /** Number of columns per visual row. Table: 1, Grid: N. */
  columnsPerRow: number;

  /** The virtualizer instance (row-based for grid, flat for table). */
  virtualizer: Virtualizer<HTMLDivElement, Element>;

  /** The scroll container element ref. */
  scrollRef: React.RefObject<HTMLDivElement | null>;

  /** Row height in pixels (used for page size calculation). */
  rowHeight: number;

  /**
   * Height of any fixed header inside the scroll container (px).
   * Table has a sticky header; grid has none. Used for page calculation.
   */
  headerHeight: number;

  /** Current focused image ID (from useDataWindow). */
  focusedImageId: string | null;

  /** Set the focused image ID (from useDataWindow). */
  setFocusedImageId: (id: string | null) => void;

  /** Total virtualizer row count. */
  virtualizerCount: number;

  /** Get image at a flat index (from useDataWindow). */
  getImage: (index: number) => import("@/types/image").Image | undefined;

  /** Find flat index of an image by ID (from useDataWindow). */
  findImageIndex: (imageId: string) => number;

  /** Loaded results length (for loadMore guard). */
  resultsLength: number;

  /** Total matching images in ES. */
  total: number;

  /** Load more results. */
  loadMore: () => Promise<void>;

  /** Handler for Enter key (open image detail). */
  onEnter: (imageId: string) => void;

  /** Current image URL param (when set, keyboard nav is disabled). */
  imageParam: string | undefined;

  /**
   * Convert a flat image index to the virtualizer row index for scrolling.
   * Table: identity (flat index IS the row). Grid: Math.floor(idx / columns).
   */
  flatIndexToRow: (flatIndex: number) => number;

  /** Whether Home should also reset horizontal scroll (table: yes). */
  resetScrollLeftOnHome?: boolean;

  /** Current buffer offset (for Home/End seek detection). */
  bufferOffset?: number;

  /** Seek to a global offset (for Home/End when buffer is windowed). */
  seek?: (globalOffset: number) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Snap a scroll position to the nearest row boundary.
 * Rounds to nearest so small drifts (sub-pixel, user drag) are corrected.
 * Used by ArrowUp/Down (single-row steps where waste isn't a concern).
 */
function snapToRow(scrollTop: number, rowHeight: number): number {
  return Math.round(scrollTop / rowHeight) * rowHeight;
}

/**
 * Compute the target scrollTop for a page scroll that never re-shows a
 * fully-visible row and never skips a partially-visible one.
 *
 * Two cases per direction, depending on whether the viewport edge in the
 * direction of travel is exactly row-aligned:
 *
 * **PgDown:**
 *   - Bottom edge NOT aligned: the partially-visible bottom row becomes the
 *     new top row. `floor(bottom / rowHeight) * rowHeight`
 *   - Bottom edge aligned: every visible row is fully visible (no partial at
 *     bottom). The next unseen row starts at `bottom`. Target = `bottom`.
 *
 * **PgUp:**
 *   - Top edge NOT aligned: the partially-visible top row's bottom edge
 *     becomes the new viewport bottom. `ceil(top / rowHeight) * rowHeight - vh`
 *   - Top edge aligned: every visible row is fully visible (no partial at
 *     top). The previous unseen row ends at `top`. Target = `top - vh`.
 *
 * This guarantees perfect round-tripping: PgDown then PgUp returns to the
 * same scrollTop (or clamped to 0 / scrollMax).
 */
function pageScrollTarget(
  scrollTop: number,
  rowHeight: number,
  viewportHeight: number,
  direction: "up" | "down",
): number {
  // Small epsilon for floating-point comparisons (clientHeight can be fractional).
  const EPS = 0.5;

  if (direction === "down") {
    const bottomEdge = scrollTop + viewportHeight;
    const remainder = bottomEdge % rowHeight;
    if (remainder < EPS || rowHeight - remainder < EPS) {
      // Bottom is row-aligned — all visible rows fully visible.
      // Next unseen row starts at bottomEdge.
      return Math.round(bottomEdge / rowHeight) * rowHeight;
    }
    // Bottom row is partial — it becomes the new top row.
    return Math.floor(bottomEdge / rowHeight) * rowHeight;
  }

  // PgUp
  const topEdge = scrollTop;
  const remainder = topEdge % rowHeight;
  if (remainder < EPS || rowHeight - remainder < EPS) {
    // Top is row-aligned — all visible rows fully visible.
    // Previous unseen row ends at topEdge.
    return Math.round(topEdge / rowHeight) * rowHeight - viewportHeight;
  }
  // Top row is partial — its bottom edge becomes the new viewport bottom.
  return Math.ceil(topEdge / rowHeight) * rowHeight - viewportHeight;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useListNavigation(config: ListNavigationConfig): void {
  // Store everything in refs to avoid re-registering listeners on every render.
  const configRef = useRef(config);
  configRef.current = config;

  // -------------------------------------------------------------------------
  // scrollByRows — scroll-only mode (no focus changes)
  // -------------------------------------------------------------------------

  /**
   * Scroll by the given number of rows, snapping to row boundary.
   * Positive = down, negative = up.
   */
  const scrollByRows = useCallback((rowDelta: number) => {
    const { scrollRef, rowHeight } = configRef.current;
    const el = scrollRef.current;
    if (!el) return;

    const snapped = snapToRow(el.scrollTop, rowHeight);
    const target = snapped + rowDelta * rowHeight;
    const clamped = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, target));
    el.scrollTop = clamped;
    el.dispatchEvent(new Event("scroll"));
  }, []);

  // -------------------------------------------------------------------------
  // scrollByPage — scroll one page, never skip / never re-show
  // -------------------------------------------------------------------------

  /**
   * Scroll by one page. The viewport-edge formula guarantees you never
   * re-see a fully-visible row and never skip one you haven't fully seen.
   */
  const scrollByPage = useCallback((direction: "up" | "down") => {
    const {
      scrollRef, rowHeight, headerHeight,
      resultsLength, total, loadMore, virtualizerCount: count, columnsPerRow: cols,
    } = configRef.current;
    const el = scrollRef.current;
    if (!el || count === 0) return;

    const viewportHeight = el.clientHeight - headerHeight;

    // Compute target using viewport-edge-based formula: never re-shows a
    // fully-visible row, never skips a partially-visible one.
    const target = pageScrollTarget(el.scrollTop, rowHeight, viewportHeight, direction);
    const clamped = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, target));
    el.scrollTop = clamped;
    el.dispatchEvent(new Event("scroll"));

    // Load more when approaching the end
    if (direction === "down") {
      const lastVisibleRow = Math.floor((el.scrollTop + el.clientHeight - headerHeight) / rowHeight) - 1;
      const lastVisibleIdx = Math.min(count - 1, lastVisibleRow * cols);
      const bufOff = configRef.current.bufferOffset ?? 0;
      if (count - lastVisibleIdx <= 5 && bufOff + resultsLength < total) loadMore();
    }
  }, []);

  // -------------------------------------------------------------------------
  // moveFocus — move focus by delta items (only called when focus exists)
  // -------------------------------------------------------------------------

  const moveFocus = useCallback((delta: number) => {
    const {
      virtualizerCount: count,
      focusedImageId: currentId,
      findImageIndex,
      getImage,
      setFocusedImageId,
      virtualizer,
      flatIndexToRow,
      resultsLength,
      total,
      loadMore,
    } = configRef.current;

    if (count === 0 || !currentId) return;

    const currentIdx = findImageIndex(currentId);
    if (currentIdx < 0) return;

    const rawTarget = currentIdx + delta;
    let nextIdx = Math.max(0, Math.min(count - 1, rawTarget));

    // Skip placeholders (up to 10)
    const step = delta > 0 ? 1 : -1;
    if (!getImage(nextIdx)) {
      for (let skip = 1; skip <= 10; skip++) {
        const candidate = nextIdx + step * skip;
        if (candidate < 0 || candidate >= count) break;
        if (getImage(candidate)) {
          nextIdx = candidate;
          break;
        }
      }
    }

    const nextImage = getImage(nextIdx);
    if (nextImage) {
      setFocusedImageId(nextImage.id);
    }

    // Scroll to the row containing this index
    virtualizer.scrollToIndex(flatIndexToRow(nextIdx), { align: "auto" });

    // Load more when approaching the end
    if (count - nextIdx <= 5 && (configRef.current.bufferOffset ?? 0) + resultsLength < total) {
      loadMore();
    }
  }, []);

  // -------------------------------------------------------------------------
  // pageFocus — move focus by one page (only called when focus exists)
  // -------------------------------------------------------------------------

  const pageFocus = useCallback((direction: "up" | "down") => {
    const {
      scrollRef,
      virtualizerCount: count,
      rowHeight,
      headerHeight,
      columnsPerRow: cols,
      focusedImageId: currentId,
      findImageIndex,
      getImage,
      setFocusedImageId,
      virtualizer,
      flatIndexToRow,
      resultsLength,
      total,
      loadMore,
    } = configRef.current;

    const el = scrollRef.current;
    if (!el || count === 0 || !currentId) return;

    const currentIdx = findImageIndex(currentId);
    if (currentIdx < 0) return;

    const viewportRowSpace = el.clientHeight - headerHeight;
    const pageRows = Math.max(1, Math.floor(viewportRowSpace / rowHeight));

    // Move focus by pageRows worth of visual rows
    const currentRow = flatIndexToRow(currentIdx);
    const colWithinRow = currentIdx - currentRow * cols;
    const targetRow = direction === "down"
      ? Math.min(Math.ceil(count / cols) - 1, currentRow + pageRows)
      : Math.max(0, currentRow - pageRows);
    let targetIdx = targetRow * cols + colWithinRow;
    // Clamp to valid range
    targetIdx = Math.max(0, Math.min(count - 1, targetIdx));

    // Skip placeholders
    const step = direction === "down" ? 1 : -1;
    if (!getImage(targetIdx)) {
      for (let skip = 1; skip <= 10; skip++) {
        const candidate = targetIdx + step * skip;
        if (candidate < 0 || candidate >= count) break;
        if (getImage(candidate)) {
          targetIdx = candidate;
          break;
        }
      }
    }

    const img = getImage(targetIdx);
    if (img) setFocusedImageId(img.id);

    // Scroll so the focused row is visible
    virtualizer.scrollToIndex(flatIndexToRow(targetIdx), { align: "auto" });

    // Load more when approaching the end
    if (direction === "down" && count - targetIdx <= 5 && (configRef.current.bufferOffset ?? 0) + resultsLength < total) {
      loadMore();
    }
  }, []);

  // -------------------------------------------------------------------------
  // Keyboard event listeners
  // -------------------------------------------------------------------------

  useEffect(() => {
    /**
     * Bubble-phase handler: arrows, PageUp/Down, Enter.
     * Skipped for native inputs (date pickers, etc.) but NOT for the CQL
     * custom element (which deliberately propagates the keys it wants us
     * to handle).
     */
    const handleBubble = (e: KeyboardEvent) => {
      const c = configRef.current;
      if (c.imageParam) return;
      // When FullscreenPreview is active (browser Fullscreen API), all keyboard
      // navigation is handled by FullscreenPreview — bail out to prevent double-
      // processing (e.g. ArrowLeft moving focus twice, skipping an image).
      if (document.fullscreenElement) return;
      if (isNativeInputTarget(e)) return;

      const cols = c.columnsPerRow;
      const hasFocus = c.focusedImageId !== null;

      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          if (hasFocus) {
            moveFocus(-cols);
          } else {
            scrollByRows(-1);
          }
          break;
        case "ArrowDown":
          e.preventDefault();
          if (hasFocus) {
            moveFocus(cols);
          } else {
            scrollByRows(1);
          }
          break;
        // ArrowLeft/Right only meaningful in multi-column densities (grid)
        // and only when focus exists (they're trapped in CQL search box)
        case "ArrowLeft":
          if (hasFocus && cols > 1) {
            e.preventDefault();
            moveFocus(-1);
          }
          break;
        case "ArrowRight":
          if (hasFocus && cols > 1) {
            e.preventDefault();
            moveFocus(1);
          }
          break;
        case "PageUp":
          e.preventDefault();
          if (hasFocus) {
            pageFocus("up");
          } else {
            scrollByPage("up");
          }
          break;
        case "PageDown":
          e.preventDefault();
          if (hasFocus) {
            pageFocus("down");
          } else {
            scrollByPage("down");
          }
          break;
        case "Enter": {
          const id = c.focusedImageId;
          if (id) {
            e.preventDefault();
            c.onEnter(id);
          }
          break;
        }
        default:
          return;
      }
    };

    /**
     * Capture-phase handler: Home/End.
     * Must be capture phase so we intercept before the CQL web component's
     * internal ProseMirror handlers. Native inputs are excluded so they
     * keep their own Home/End behaviour.
     */
    const handleCapture = (e: KeyboardEvent) => {
      const c = configRef.current;
      if (c.imageParam) return;
      if (document.fullscreenElement) return;
      if (isNativeInputTarget(e)) return;

      const hasFocus = c.focusedImageId !== null;

      switch (e.key) {
        case "Home":
          e.preventDefault();
          {
            // If the buffer is windowed and not at the start, seek to 0.
            // DON'T reset scrollTop eagerly — that would flash the top of
            // the stale deep-offset buffer. Let seek(0) replace the buffer
            // with fresh data; effect #8 (BufferOffset→0 guard) resets
            // scrollTop in the same render frame. Same pattern as deep-to-deep
            // seeks which already have zero flash.
            if (c.bufferOffset && c.bufferOffset > 0 && c.seek) {
              if (hasFocus) {
                useSearchStore.setState({ _pendingFocusAfterSeek: "first" });
              }
              c.seek(0);
              // After seek, focus first image only if something was focused
              // (seek resets buffer, so we can't focus immediately — the
              // post-seek effect will handle scroll position)
            } else {
              // Already at the start — just scroll to top
              const el = c.scrollRef.current;
              if (el) {
                el.scrollTop = 0;
                if (c.resetScrollLeftOnHome) el.scrollLeft = 0;
                el.dispatchEvent(new Event("scroll"));
              }
              // Focus first image only if something was already focused
              if (hasFocus) {
                const firstImage = c.getImage(0);
                if (firstImage) c.setFocusedImageId(firstImage.id);
              }
            }
          }
          break;
        case "End":
          e.preventDefault();
          {
            // If the buffer is windowed and not at the end, seek to the last position
            const bufOff = c.bufferOffset ?? 0;
            if (c.seek && bufOff + c.resultsLength < c.total) {
              if (hasFocus) {
                useSearchStore.setState({ _pendingFocusAfterSeek: "last" });
              }
              c.seek(Math.max(0, c.total - 1));
            } else {
              const el = c.scrollRef.current;
              if (el) {
                el.scrollTop = el.scrollHeight - el.clientHeight;
                el.dispatchEvent(new Event("scroll"));
              }
              // Focus last image only if something was already focused
              if (hasFocus) {
                const count = c.virtualizerCount;
                const scanFrom = Math.max(0, count - 50);
                for (let i = count - 1; i >= scanFrom; i--) {
                  const img = c.getImage(i);
                  if (img) {
                    c.setFocusedImageId(img.id);
                    break;
                  }
                }
              }
              if (c.resultsLength < c.total) c.loadMore();
            }
          }
          break;
        default:
          return;
      }
    };

    document.addEventListener("keydown", handleBubble);
    document.addEventListener("keydown", handleCapture, true);
    return () => {
      document.removeEventListener("keydown", handleBubble);
      document.removeEventListener("keydown", handleCapture, true);
    };
  }, [moveFocus, pageFocus, scrollByRows, scrollByPage]);
}




