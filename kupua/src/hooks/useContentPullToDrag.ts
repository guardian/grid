import { useRef, type RefObject, type TouchEvent } from "react";

interface SheetDragHandlers {
  onTouchStart: (e: TouchEvent) => void;
  onTouchMove: (e: TouchEvent) => void;
  onTouchEnd: (e: TouchEvent) => void;
  onTouchCancel: () => void;
}

/**
 * Content handlers for sheets: pulling down while the content is scrolled to the top
 * hands the gesture to the sheet's own drag handlers. While handed over, the content
 * is frozen so sheet and content move as one; nested `[data-own-scroll]` scrollers
 * keep their gestures.
 */
export function useContentPullToDrag(
  contentRef: RefObject<HTMLElement | null>,
  sheet: SheetDragHandlers & { isDragging: () => boolean },
  enabled = true,
) {
  const pull = useRef<{ x: number; y: number } | null>(null);
  const release = () => {
    pull.current = null;
    if (contentRef.current) contentRef.current.style.overflowY = "";
  };
  const end = (e: TouchEvent) => {
    if (pull.current !== null && sheet.isDragging()) sheet.onTouchEnd(e);
    release();
  };
  const cancel = () => {
    if (pull.current !== null && sheet.isDragging()) sheet.onTouchCancel();
    release();
  };
  return {
    onTouchStart: (e: TouchEvent) => {
      if (e.touches.length !== 1) { cancel(); return; }
      const nested = (e.target as Element).closest("[data-own-scroll]");
      pull.current = enabled && !nested && e.touches.length === 1 && (contentRef.current?.scrollTop ?? 0) <= 0
        ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
    },
    onTouchMove: (e: TouchEvent) => {
      const start = pull.current;
      if (!start) return;
      if (e.defaultPrevented || e.touches.length !== 1) {
        cancel();
        return;
      }
      if (!sheet.isDragging()) {
        const dx = e.touches[0].clientX - start.x;
        const dy = e.touches[0].clientY - start.y;
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        if (Math.abs(dx) > Math.abs(dy) || dy < 0) { release(); return; }
        sheet.onTouchStart(e);
        if (contentRef.current) contentRef.current.style.overflowY = "hidden";
      }
      sheet.onTouchMove(e);
    },
    onTouchEnd: end,
    onTouchCancel: cancel,
  };
}
