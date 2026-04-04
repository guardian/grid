/**
 * useListNavigation — shared keyboard navigation for all density views.
 *
 * Abstracts the common navigation logic (move focus, page, home, end)
 * parameterised by density geometry. Table passes `columnsPerRow: 1`,
 * grid passes `columnsPerRow: N`. The hook registers keyboard listeners
 * and manages focus movement.
 *
 * ## What this hook does
 *
 * - **moveFocus(delta):** Move focus by `delta` items (±1 for left/right,
 *   ±columnsPerRow for up/down). Viewport-aware start when no focus exists.
 *   Skips placeholders (up to 10). Triggers loadMore near the edge.
 *
 * - **pageFocus(direction):** Scroll viewport by one page, focus the edge row.
 *
 * - **Home/End:** Scroll to top/bottom, focus first/last loaded image.
 *
 * - **Enter:** Opens the focused image (delegates to caller's handler).
 *
 * - **Arrow keys:** Up/Down always work. Left/Right only when `columnsPerRow > 1`.
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
   * Table has a sticky header; grid has none. Used for pageFocus calculation.
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
// Hook
// ---------------------------------------------------------------------------

export function useListNavigation(config: ListNavigationConfig): void {
  // Store everything in refs to avoid re-registering listeners on every render.
  const configRef = useRef(config);
  configRef.current = config;

  // -------------------------------------------------------------------------
  // moveFocus — move focus by delta items
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
      columnsPerRow,
    } = configRef.current;

    if (count === 0) return;

    let currentIdx = currentId ? findImageIndex(currentId) : -1;

    // If no focus, start from the current viewport position.
    if (currentIdx < 0) {
      const vItems = virtualizer.getVirtualItems();
      if (vItems.length > 0) {
        // For grid: vItems are rows, so first visible flat index = row * cols.
        // For table: vItems are flat indices directly.
        if (columnsPerRow > 1) {
          currentIdx = delta > 0
            ? vItems[0].index * columnsPerRow - 1
            : (vItems[vItems.length - 1].index + 1) * columnsPerRow;
        } else {
          currentIdx = delta > 0
            ? vItems[0].index - 1
            : vItems[vItems.length - 1].index + 1;
        }
      } else {
        currentIdx = delta > 0 ? -1 : count;
      }
    }

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
    if (count - nextIdx <= 5 && resultsLength < total) {
      loadMore();
    }
  }, []);

  // -------------------------------------------------------------------------
  // pageFocus — scroll by one page, focus the edge row
  // -------------------------------------------------------------------------

  const pageFocus = useCallback((direction: "up" | "down") => {
    const {
      scrollRef,
      virtualizerCount: count,
      rowHeight,
      headerHeight,
      columnsPerRow: cols,
      getImage,
      setFocusedImageId,
      resultsLength,
      total,
      loadMore,
    } = configRef.current;

    const el = scrollRef.current;
    if (!el || count === 0) return;

    const viewportRowSpace = el.clientHeight - headerHeight;
    const pageRows = Math.max(1, Math.floor(viewportRowSpace / rowHeight));
    const scrollDelta = pageRows * rowHeight;

    if (direction === "down") {
      const prevTop = el.scrollTop;
      el.scrollTop = Math.min(
        el.scrollHeight - el.clientHeight,
        prevTop + scrollDelta,
      );
      el.dispatchEvent(new Event("scroll"));
      // Focus the first item of the last fully visible row
      const lastVisibleRow = Math.floor((el.scrollTop + el.clientHeight - headerHeight) / rowHeight) - 1;
      const lastVisibleIdx = Math.min(count - 1, Math.max(0, lastVisibleRow * cols));
      const img = lastVisibleIdx >= 0 ? getImage(lastVisibleIdx) : undefined;
      if (img) setFocusedImageId(img.id);
      if (count - lastVisibleIdx <= 5 && resultsLength < total) loadMore();
    } else {
      const prevTop = el.scrollTop;
      el.scrollTop = Math.max(0, prevTop - scrollDelta);
      el.dispatchEvent(new Event("scroll"));
      // Focus the first item of the first fully visible row
      const firstVisibleRow = Math.ceil((el.scrollTop + headerHeight) / rowHeight);
      const firstVisibleIdx = Math.max(0, firstVisibleRow * cols);
      // Scan forward a few indices to find a loaded image
      let img: import("@/types/image").Image | undefined;
      for (let i = 0; i <= 10; i++) {
        img = getImage(firstVisibleIdx + i);
        if (img) break;
      }
      if (img) setFocusedImageId(img.id);
    }
  }, []);

  // -------------------------------------------------------------------------
  // Keyboard event listeners
  // -------------------------------------------------------------------------

  useEffect(() => {
    const handleBubble = (e: KeyboardEvent) => {
      const c = configRef.current;
      if (c.imageParam) return;
      if (isNativeInputTarget(e)) return;

      const cols = c.columnsPerRow;
      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          moveFocus(-cols);
          break;
        case "ArrowDown":
          e.preventDefault();
          moveFocus(cols);
          break;
        // ArrowLeft/Right only meaningful in multi-column densities (grid)
        case "ArrowLeft":
          if (cols > 1) {
            e.preventDefault();
            moveFocus(-1);
          }
          break;
        case "ArrowRight":
          if (cols > 1) {
            e.preventDefault();
            moveFocus(1);
          }
          break;
        case "PageUp":
          e.preventDefault();
          pageFocus("up");
          break;
        case "PageDown":
          e.preventDefault();
          pageFocus("down");
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

    const handleCapture = (e: KeyboardEvent) => {
      const c = configRef.current;
      if (c.imageParam) return;

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
              c.seek(0);
            } else {
              // Already at the start — just scroll to top and focus first image
              const el = c.scrollRef.current;
              if (el) {
                el.scrollTop = 0;
                if (c.resetScrollLeftOnHome) el.scrollLeft = 0;
                el.dispatchEvent(new Event("scroll"));
              }
              const firstImage = c.getImage(0);
              if (firstImage) c.setFocusedImageId(firstImage.id);
            }
          }
          break;
        case "End":
          e.preventDefault();
          {
            // If the buffer is windowed and not at the end, seek to the last position
            const bufOff = c.bufferOffset ?? 0;
            if (c.seek && bufOff + c.resultsLength < c.total) {
              c.seek(Math.max(0, c.total - 1));
            } else {
              const el = c.scrollRef.current;
              if (el) {
                el.scrollTop = el.scrollHeight - el.clientHeight;
                el.dispatchEvent(new Event("scroll"));
              }
              const count = c.virtualizerCount;
              const scanFrom = Math.max(0, count - 50);
              for (let i = count - 1; i >= scanFrom; i--) {
                const img = c.getImage(i);
                if (img) {
                  c.setFocusedImageId(img.id);
                  break;
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
  }, [moveFocus, pageFocus]);
}




