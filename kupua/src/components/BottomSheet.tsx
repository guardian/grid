import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from "react";
import { useContentPullToDrag } from "@/hooks/useContentPullToDrag";
import { useFocusTrap } from "@/hooks/useFocusTrap";

const PEEK_PX = 64;
/** Expanded card leaves the top quarter of the viewport uncovered. */
const EXPANDED_VH = 75;

interface BottomSheetProps {
  /** Shown in the always-visible peek strip next to the handle. */
  header: ReactNode;
  children: ReactNode;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  /** Swipe down from peek dismisses (when provided). */
  onDismiss?: () => void;
  label: string;
  /** Dim and block the page behind the expanded card (tap collapses). */
  scrim?: boolean;
}

/**
 * Compact-shell card: peeks from the bottom, expands to 75vh, swipe/tap to toggle.
 * Content scrolls only when expanded.
 */
export function BottomSheet({ header, children, expanded, onExpandedChange, onDismiss, label, scrim = true }: BottomSheetProps) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; t: number; base: number } | null>(null);
  const lastTouchToggle = useRef(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const [maxH, setMaxH] = useState(() => window.innerHeight * EXPANDED_VH / 100);

  useEffect(() => {
    const onResize = () => setMaxH(window.innerHeight * EXPANDED_VH / 100);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const restOffset = expanded ? 0 : maxH - PEEK_PX;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = "translate 0.28s cubic-bezier(0.22, 1, 0.36, 1)";
    el.style.translate = `0 ${restOffset}px`;
  }, [restOffset]);

  const onTouchStart = (e: TouchEvent) => {
    drag.current = { y: e.touches[0].clientY, t: performance.now(), base: restOffset };
  };
  const onTouchMove = (e: TouchEvent) => {
    const el = ref.current;
    const d = drag.current;
    if (!d || !el) return;
    const offset = Math.max(0, d.base + e.touches[0].clientY - d.y);
    el.style.transition = "none";
    el.style.translate = `0 ${offset}px`;
  };
  const onTouchEnd = (e: TouchEvent) => {
    const el = ref.current;
    const d = drag.current;
    drag.current = null;
    if (!d || !el) return;
    const dy = e.changedTouches[0].clientY - d.y;
    const v = dy / Math.max(1, performance.now() - d.t);
    el.style.transition = "translate 0.28s cubic-bezier(0.22, 1, 0.36, 1)";
    if (Math.abs(dy) < 6) {
      lastTouchToggle.current = performance.now();
      onExpandedChange(!expanded);
      return;
    }
    const offset = d.base + dy;
    if (!expanded && onDismiss && (dy > 40 || v > 0.5)) {
      el.style.translate = `0 ${maxH}px`;
      el.addEventListener("transitionend", onDismiss, { once: true });
      return;
    }
    const wantExpanded = v < -0.4 ? true : v > 0.4 ? false : offset < (maxH - PEEK_PX) / 2;
    if (wantExpanded === expanded) el.style.translate = `0 ${restOffset}px`;
    else onExpandedChange(wantExpanded);
  };
  const contentPull = useContentPullToDrag(contentRef,
    { onTouchStart, onTouchMove, onTouchEnd, isDragging: () => drag.current !== null }, expanded);
  // Modal only with a scrim; image detail's card leaves the image above interactive.
  useFocusTrap(ref, expanded && scrim);

  return (
    <>
    {expanded && scrim && (
      <div
        className="fixed inset-0 z-[39] bg-black/30 anim-scrim"
        data-testid="card-scrim"
        aria-hidden="true"
        onClick={() => onExpandedChange(false)}
      />
    )}
    <div
      ref={ref}
      role="region"
      tabIndex={-1}
      aria-label={label}
      className="fixed inset-x-0 bottom-0 z-40 flex flex-col bg-grid-bg rounded-t-2xl border-t border-grid-separator shadow-[0_-8px_24px_rgba(0,0,0,0.45)] outline-none"
      style={{ height: maxH, translate: `0 ${restOffset}px` }}
    >
      <div
        className="shrink-0 touch-none select-none"
        style={{ height: PEEK_PX }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <div className="flex justify-center pt-2 pb-1.5">
          <span className="block w-10 h-1 rounded-full bg-grid-text-dim" />
        </div>
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
          className="w-full px-4 text-left text-sm text-grid-text-bright truncate"
          onClick={() => {
            // The touch handler already toggled for this tap.
            if (performance.now() - lastTouchToggle.current < 600) return;
            onExpandedChange(!expanded);
          }}
        >
          {header}
        </button>
      </div>
      <div
        ref={contentRef}
        className={`flex-1 min-h-0 overscroll-contain ${expanded ? "overflow-y-auto" : "overflow-hidden"}`}
        {...contentPull}
      >
        {children}
      </div>
    </div>
    </>
  );
}
