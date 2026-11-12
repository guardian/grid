import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject, type TouchEvent } from "react";
import { useContentPullToDrag } from "@/hooks/useContentPullToDrag";
import { useFocusTrap } from "@/hooks/useFocusTrap";

const PEEK_PX = 64;
/** Expanded card leaves the top quarter of the viewport uncovered. */
const EXPANDED_VH = 75;
const SNAP_TRANSITION = "translate 0.28s cubic-bezier(0.22, 1, 0.36, 1)";

function sheetViewport() {
  const visual = window.visualViewport;
  const height = visual?.height ?? window.innerHeight;
  return { height: Math.max(PEEK_PX, height * EXPANDED_VH / 100),
    bottom: Math.max(0, window.innerHeight - height - (visual?.offsetTop ?? 0)) };
}

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
  dragSurfaceRef?: RefObject<HTMLElement | null>;
  position?: "fixed" | "absolute";
  contentKey?: string;
  visible?: boolean;
  gestureEnabledRef?: RefObject<boolean>;
  onRevealDrag?: () => void;
  overlay?: boolean;
  floating?: ReactNode;
  headerActions?: ReactNode;
  onDragStart?: () => void;
}

/**
 * Compact-shell card: peeks from the bottom, expands to 75vh, swipe/tap to toggle.
 * Content scrolls only when expanded.
 */
export function BottomSheet({ header, children, expanded, onExpandedChange, onDismiss, label, scrim = true, dragSurfaceRef, position = "fixed", contentKey, visible = true, gestureEnabledRef, onRevealDrag, overlay = false, floating, headerActions, onDragStart }: BottomSheetProps) {
  const ref = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; t: number; base: number; moved: boolean } | null>(null);
  const touchOrigin = useRef<{ x: number; y: number } | null>(null);
  const lastTouchToggle = useRef(0);
  const suppressHeaderClick = useRef(false);
  const controlTouch = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [viewport, setViewport] = useState(sheetViewport);
  const maxH = viewport.height;
  const modal = visible && expanded && scrim;

  useLayoutEffect(() => {
    if (!modal || !ref.current) return;
    const previous = new Map<HTMLElement, boolean>();
    let branch: HTMLElement | null = ref.current;
    while (branch?.parentElement && branch !== document.body) {
      for (const sibling of branch.parentElement.children) {
        if (sibling instanceof HTMLElement && sibling !== branch && sibling !== scrimRef.current) {
          previous.set(sibling, sibling.inert);
          sibling.inert = true;
        }
      }
      branch = branch.parentElement;
    }
    return () => { for (const [element, inert] of previous) element.inert = inert; };
  }, [modal]);

  useLayoutEffect(() => {
    if (!expanded && contentRef.current?.contains(document.activeElement)) toggleRef.current?.focus({ preventScroll: true });
  }, [expanded]);

  useLayoutEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [contentKey]);

  useEffect(() => {
    const visual = window.visualViewport;
    const update = () => {
      const next = sheetViewport();
      setViewport(current => current.height === next.height && current.bottom === next.bottom ? current : next);
    };
    window.addEventListener("resize", update);
    visual?.addEventListener("resize", update);
    visual?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("resize", update);
      visual?.removeEventListener("resize", update);
      visual?.removeEventListener("scroll", update);
    };
  }, []);

  useLayoutEffect(() => {
    const active = document.activeElement;
    const content = contentRef.current;
    if (!expanded || !content || !content.contains(active) || !(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)) return;
    const nested = active.closest<HTMLElement>("[data-own-scroll]");
    const scroller = nested && content.contains(nested) ? nested : content;
    const bounds = scroller.getBoundingClientRect();
    const form = active.closest("form");
    const target = form && form.getBoundingClientRect().height <= bounds.height - 16 ? form : active;
    const box = target.getBoundingClientRect();
    if (box.bottom > bounds.bottom - 8) scroller.scrollTop += box.bottom - bounds.bottom + 8;
    else if (box.top < bounds.top + 8) scroller.scrollTop -= bounds.top + 8 - box.top;
  }, [expanded, viewport]);

  const restOffset = expanded ? 0 : maxH - PEEK_PX;
  const fadeTransition = `opacity 180ms ease, visibility 0s linear ${visible ? "0s" : "180ms"}`;
  const snapTransition = `${SNAP_TRANSITION}, ${fadeTransition}`;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = snapTransition;
    el.style.translate = `0 ${restOffset}px`;
  }, [restOffset, snapTransition]);

  const startDrag = (y: number) => {
    drag.current = { y, t: performance.now(), base: restOffset, moved: false };
  };
  const cancelDrag = () => {
    drag.current = null;
    touchOrigin.current = null;
    if (ref.current) {
      ref.current.style.transition = snapTransition;
      ref.current.style.translate = `0 ${restOffset}px`;
    }
  };
  const moveDrag = (y: number, defaultPrevented: boolean) => {
    const el = ref.current;
    const d = drag.current;
    if (!d || !el) return;
    if (defaultPrevented) {
      cancelDrag();
      return;
    }
    if (!d.moved) {
      if (Math.abs(y - d.y) < 10) return;
      d.moved = true;
      onDragStart?.();
    }
    suppressHeaderClick.current = true;
    const offset = Math.max(0, d.base + y - d.y);
    el.style.transition = fadeTransition;
    el.style.translate = `0 ${offset}px`;
  };
  const endDrag = (y: number, toggleOnTap = true) => {
    const el = ref.current;
    const d = drag.current;
    drag.current = null;
    if (!d || !el) return;
    const dy = y - d.y;
    const v = dy / Math.max(1, performance.now() - d.t);
    el.style.transition = snapTransition;
    if (!d.moved) {
      if (toggleOnTap) {
        lastTouchToggle.current = performance.now();
        onExpandedChange(!expanded);
      } else el.style.translate = `0 ${restOffset}px`;
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
  const onTouchStart = (event: TouchEvent) => {
    if (event.touches.length !== 1) { suppressHeaderClick.current = true; cancelDrag(); return; }
    suppressHeaderClick.current = false;
    if ((event.target as Element).closest("[data-image-action-popup]")) return;
    const button = (event.target as Element).closest("button");
    controlTouch.current = Boolean(button && button !== toggleRef.current);
    touchOrigin.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    startDrag(event.touches[0].clientY);
  };
  const onTouchMove = (event: TouchEvent) => {
    if (event.touches.length !== 1) { suppressHeaderClick.current = true; cancelDrag(); return; }
    const origin = touchOrigin.current;
    if (origin && Math.abs(event.touches[0].clientX - origin.x) > 10
      && Math.abs(event.touches[0].clientX - origin.x) > Math.abs(event.touches[0].clientY - origin.y)) {
      suppressHeaderClick.current = true;
      touchOrigin.current = null;
      cancelDrag();
      return;
    }
    moveDrag(event.touches[0].clientY, event.defaultPrevented);
  };
  const onTouchEnd = (event: TouchEvent) => {
    if (event.touches.length !== 0) { cancelDrag(); return; }
    if (!touchOrigin.current) return;
    touchOrigin.current = null;
    endDrag(event.changedTouches[0].clientY, !controlTouch.current);
  };
  const dragActions = useRef({ startDrag, moveDrag, endDrag, cancelDrag, onRevealDrag });
  dragActions.current = { startDrag, moveDrag, endDrag, cancelDrag, onRevealDrag };

  useEffect(() => {
    const surface = dragSurfaceRef?.current;
    if (!surface) return;
    let origin: { x: number; y: number } | null = null;
    let decided = false;
    let tracking = false;
    const cancel = () => {
      origin = null;
      tracking = false;
      dragActions.current.cancelDrag();
    };
    const start = (event: globalThis.TouchEvent) => {
      if (event.touches.length !== 1 || gestureEnabledRef?.current === false) { cancel(); return; }
      origin = { x: event.touches[0].clientX, y: event.touches[0].clientY };
      decided = false;
      tracking = false;
      dragActions.current.startDrag(origin.y);
    };
    const move = (event: globalThis.TouchEvent) => {
      if (!origin) return;
      if (event.touches.length !== 1 || gestureEnabledRef?.current === false) { cancel(); return; }
      const dx = event.touches[0].clientX - origin.x;
      const dy = event.touches[0].clientY - origin.y;
      if (!decided) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        decided = true;
        tracking = Math.abs(dy) > Math.abs(dx) && (expanded ? dy > 0 : dy < 0);
        if (tracking && !expanded) dragActions.current.onRevealDrag?.();
      }
      if (!tracking) return;
      dragActions.current.moveDrag(event.touches[0].clientY, event.defaultPrevented);
      event.preventDefault();
    };
    const end = (event: globalThis.TouchEvent) => {
      origin = null;
      if (tracking && event.changedTouches.length > 0) dragActions.current.endDrag(event.changedTouches[0].clientY, false);
      else drag.current = null;
      tracking = false;
    };
    surface.addEventListener("touchstart", start, { passive: true });
    surface.addEventListener("touchmove", move, { passive: false });
    surface.addEventListener("touchend", end, { passive: true });
    surface.addEventListener("touchcancel", cancel, { passive: true });
    return () => {
      surface.removeEventListener("touchstart", start);
      surface.removeEventListener("touchmove", move);
      surface.removeEventListener("touchend", end);
      surface.removeEventListener("touchcancel", cancel);
      if (origin) cancel();
    };
  }, [dragSurfaceRef, expanded, restOffset, gestureEnabledRef]);

  const contentPull = useContentPullToDrag(contentRef,
    { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: cancelDrag, isDragging: () => drag.current !== null }, expanded);
  // Modal only with a scrim; image detail's card leaves the image above interactive.
  useFocusTrap(ref, modal);

  return (
    <>
    {expanded && scrim && (
      <div
        ref={scrimRef}
        className="fixed inset-0 z-[39] bg-black/30 anim-scrim"
        data-testid="card-scrim"
        aria-hidden="true"
        onClick={() => onExpandedChange(false)}
      />
    )}
    <div
      ref={ref}
      role={modal ? "dialog" : "region"}
      aria-modal={modal || undefined}
      data-bottom-sheet
      data-visible={visible}
      data-suggestion-scope
      tabIndex={-1}
      aria-label={label}
      aria-hidden={!visible || undefined}
      inert={!visible}
      className={`chrome-fade ${position} inset-x-0 bottom-0 z-40 flex flex-col ${overlay && !expanded ? "bg-grid-bg/85" : "bg-grid-bg"} rounded-t-2xl border-t border-grid-separator shadow-[0_-8px_24px_rgba(0,0,0,0.45)] outline-none`}
      style={{ height: maxH, bottom: viewport.bottom, translate: `0 ${restOffset}px`, transition: snapTransition }}
    >
      {floating}
      <div
        className="shrink-0 select-none"
        style={{ height: PEEK_PX }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={cancelDrag}
        onPointerDownCapture={() => { suppressHeaderClick.current = false; }}
        onClickCapture={event => {
          if (event.detail > 0 && suppressHeaderClick.current) {
            event.preventDefault();
            event.stopPropagation();
            suppressHeaderClick.current = false;
          }
        }}
      >
        <div className="flex h-[11px] items-center justify-center touch-none">
          <span className="block w-10 h-1 rounded-full bg-grid-text-dim" />
        </div>
        <div className="flex h-11 items-center gap-2 px-3">
        <button
          ref={toggleRef}
          type="button"
          aria-expanded={expanded}
          aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
          className="h-11 min-w-0 flex-1 text-left text-sm text-grid-text-bright truncate touch-none"
          onClick={() => {
            // The touch handler already toggled for this tap.
            if (performance.now() - lastTouchToggle.current < 600) return;
            onExpandedChange(!expanded);
          }}
        >
          {header}
        </button>
        {headerActions}
        </div>
      </div>
      <div
        ref={contentRef}
        inert={!expanded}
        aria-hidden={!expanded || undefined}
        className={`flex-1 min-h-0 overflow-x-hidden overscroll-contain ${expanded ? "overflow-y-auto" : "overflow-hidden"}`}
        {...contentPull}
      >
        {children}
      </div>
    </div>
    </>
  );
}
