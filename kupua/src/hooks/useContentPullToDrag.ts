import { useRef, type RefObject, type TouchEvent } from "react";

interface SheetDragHandlers {
  onTouchStart: (e: TouchEvent) => void;
  onTouchMove: (e: TouchEvent) => void;
  onTouchEnd: (e: TouchEvent) => void;
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
  const pull = useRef<number | null>(null);
  const release = () => {
    pull.current = null;
    if (contentRef.current) contentRef.current.style.overflowY = "";
  };
  const end = (e: TouchEvent) => {
    if (pull.current !== null && sheet.isDragging()) sheet.onTouchEnd(e);
    release();
  };
  return {
    onTouchStart: (e: TouchEvent) => {
      const nested = (e.target as Element).closest("[data-own-scroll]");
      pull.current = enabled && !nested && (contentRef.current?.scrollTop ?? 0) <= 0 ? e.touches[0].clientY : null;
    },
    onTouchMove: (e: TouchEvent) => {
      const y0 = pull.current;
      if (y0 === null) return;
      if (!sheet.isDragging()) {
        const dy = e.touches[0].clientY - y0;
        if (dy < 8) { if (dy < 0) pull.current = null; return; }
        sheet.onTouchStart(e);
        if (contentRef.current) contentRef.current.style.overflowY = "hidden";
      }
      sheet.onTouchMove(e);
    },
    onTouchEnd: end,
    onTouchCancel: end,
  };
}
