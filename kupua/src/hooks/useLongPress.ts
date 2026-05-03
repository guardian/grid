/**
 * useLongPress -- coarse-pointer-aware long-press detection for Selection Mode entry.
 *
 * Attaches to a container element and detects long-press gestures:
 *  - Fires `onLongPressStart(cellId, x, y)` when the pointer has been held
 *    for LONG_PRESS_MS without significant movement.
 *  - Cancels silently if:
 *      - The pointer moves more than LONG_PRESS_MOVE_TOLERANCE_PX before
 *        the threshold fires (treat as a scroll gesture).
 *      - A scroll event fires on the container before the threshold.
 *      - The pointer type is not "touch" (mouse/stylus use click handlers).
 *      - The pointerdown target is `[data-tickbox]` -- tickbox has its own
 *        immediate click handler; long-press must not interfere.
 *
 * Coarse-pointer detection: the hook short-circuits for `pointerType !==
 * "touch"` events. On devices where the primary pointer is a mouse (fine),
 * a physical touch still registers as "touch" -- the hook correctly handles
 * hybrid laptop/tablet devices.
 *
 * Architecture: kupua/exploration/docs/selections-workplan.md §S5
 */

import { useEffect, useRef, type RefObject } from "react";
import {
  LONG_PRESS_MS,
  LONG_PRESS_MOVE_TOLERANCE_PX,
} from "@/constants/tuning";

export interface UseLongPressOptions {
  /**
   * The scrollable container that hosts the cells.
   * Touch events are listened here, not on individual cells.
   */
  containerRef: RefObject<HTMLElement | null>;

  /**
   * Fired when a long-press commits (threshold reached, no excessive movement).
   *
   * @param cellId - data-cell-id attribute of the pressed cell (or empty string
   *                 if the press was on background, not a cell).
   * @param x - clientX at commit time.
   * @param y - clientY at commit time.
   */
  onLongPressStart: (cellId: string, x: number, y: number) => void;
}

/**
 * Returns the `data-cell-id` of the nearest ancestor with that attribute,
 * or an empty string if none.
 */
function getCellId(target: EventTarget | null): string {
  if (!(target instanceof Element)) return "";
  const el = target.closest("[data-cell-id]");
  return el instanceof HTMLElement ? (el.dataset.cellId ?? "") : "";
}

export function useLongPress({
  containerRef,
  onLongPressStart,
}: UseLongPressOptions): void {
  // Store callbacks in refs so the effect never needs to re-attach listeners
  // when callbacks change identity (e.g. from useCallback recreations).
  const startRef = useRef(onLongPressStart);
  startRef.current = onLongPressStart;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Mutable gesture state -- reset on each pointerdown.
    let timer: ReturnType<typeof setTimeout> | undefined;
    let startX = 0;
    let startY = 0;
    let pointerId = -1;
    let cellId = "";
    let committed = false; // true once the long-press threshold fires

    function cancel(): void {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      // Remove the click suppressor if it hasn't fired yet (e.g. gesture
      // cancelled by pointercancel before the user lifted their finger).
      el.removeEventListener("click", suppressPostCommitClick, { capture: true });
      committed = false;
    }

    // Invoked at long-press commit to swallow the browser's synthetic click
    // that fires after pointerup, so the cell's onClick does not act on the
    // same gesture that onLongPressStart already handled.
    function suppressPostCommitClick(e: Event): void {
      e.stopPropagation();
    }

    function onPointerDown(e: PointerEvent): void {
      // Only handle touch pointers (not mouse or stylus).
      if (e.pointerType !== "touch") return;

      // Do not interfere with tickbox's own immediate click handler.
      if (e.target instanceof Element && e.target.closest("[data-tickbox]")) {
        return;
      }

      cancel(); // cancel any prior gesture

      startX = e.clientX;
      startY = e.clientY;
      pointerId = e.pointerId;
      cellId = getCellId(e.target);
      committed = false;

      timer = setTimeout(() => {
        timer = undefined;
        committed = true;
        startRef.current(cellId, startX, startY);
        // Suppress the synthetic click that browsers fire after pointerup.
        // Without this, the cell's onClick fires immediately after the long-press
        // completes, double-toggling the origin cell (toggle-on in onLongPressStart,
        // toggle-off in handleCellClick). Capture-phase + once:true auto-removes.
        el.addEventListener("click", suppressPostCommitClick, {
          capture: true,
          once: true,
        });
      }, LONG_PRESS_MS);
    }

    function onPointerMove(e: PointerEvent): void {
      if (e.pointerId !== pointerId || committed) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.sqrt(dx * dx + dy * dy) > LONG_PRESS_MOVE_TOLERANCE_PX) {
        cancel();
      }
    }

    function onPointerUp(e: PointerEvent): void {
      if (e.pointerId !== pointerId) return;
      if (timer !== undefined) {
        // Threshold not yet reached -- quick tap. Cancel the gesture silently.
        // The browser's native click event will fire naturally; onClick handles it.
        cancel();
      }
      // If committed is true, cleanup happens on the next pointerdown.
      // If we cancelled (timer was cleared by movement), nothing to do.
      committed = false;
    }

    function onPointerCancel(e: PointerEvent): void {
      if (e.pointerId !== pointerId) return;
      if (committed) {
        // The long-press already committed. Do NOT call cancel() here --
        // that would remove the suppressPostCommitClick listener, which must
        // stay alive to swallow any synthetic click the browser fires after
        // pointercancel (Android Chrome fires contextmenu then pointercancel
        // then a click when a long-press gesture ends).
        // committed is reset by the next pointerdown -> cancel() call.
        return;
      }
      cancel();
    }

    function onScroll(): void {
      // A scroll firing before threshold = the user is scrolling, not pressing.
      cancel();
    }

    function onContextMenu(e: Event): void {
      // Suppress the browser context menu while a touch long-press gesture is
      // pending or committed. On Android Chrome, a sustained touch fires
      // contextmenu (showing "Save image as" or "Open link") at ~500ms --
      // the same threshold as our long-press. Preventing it here keeps our
      // gesture uninterrupted.
      //
      // Guard: only suppress when our gesture is active (a touch pointerdown
      // has been received and the timer is still running, or the threshold
      // has just fired). Desktop right-click never sets timer because
      // onPointerDown returns early for pointerType !== "touch", so desktop
      // context menus are never affected.
      if (timer !== undefined || committed) {
        e.preventDefault();
      }
    }

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerCancel);
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("contextmenu", onContextMenu);

    return () => {
      cancel();
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerCancel);
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("contextmenu", onContextMenu);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- stable: containerRef + callback refs
  }, [containerRef]);
}
