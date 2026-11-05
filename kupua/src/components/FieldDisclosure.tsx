import { useLayoutEffect, useRef, type RefObject } from "react";
import { findScrollParent } from "@/lib/dom-utils";

interface FieldDisclosureProps {
  expanded: boolean;
  hasMore: boolean;
  loading?: boolean;
  controlsId: string;
  anchorRef: RefObject<HTMLDivElement | null>;
  onExpand: () => void;
  onCollapse: () => void;
}

export function FieldDisclosure({
  expanded, hasMore, loading = false, controlsId, anchorRef, onExpand, onCollapse,
}: FieldDisclosureProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pendingFocusRef = useRef(false);
  useLayoutEffect(() => {
    if (!pendingFocusRef.current) return;
    if (loading) {
      const retireFocus = (event: FocusEvent) => {
        if (event.target !== buttonRef.current) pendingFocusRef.current = false;
      };
      document.addEventListener("focusin", retireFocus);
      return () => document.removeEventListener("focusin", retireFocus);
    }
    pendingFocusRef.current = false;
    // A disabled loading button loses native focus; don't steal newer focus.
    if (document.activeElement === document.body || document.activeElement === buttonRef.current) {
      buttonRef.current?.focus({ preventScroll: true });
    }
  }, [loading, expanded]);

  if (!expanded && !hasMore) return null;

  return (
    <button
      ref={buttonRef}
      type="button"
      className="text-2xs text-grid-text-dim hover:text-grid-accent cursor-pointer pt-0.5 text-left px-1.5"
      aria-expanded={expanded}
      aria-controls={controlsId}
      aria-busy={loading || undefined}
      disabled={loading}
      onClick={(event) => {
        if (!expanded) {
          pendingFocusRef.current = document.activeElement === event.currentTarget;
          onExpand();
          return;
        }
        const button = event.currentTarget;
        const restoreFocus = document.activeElement === button;
        const anchor = anchorRef.current;
        const scroller = anchor && findScrollParent(anchor);
        onCollapse();
        requestAnimationFrame(() => {
          if (!anchor?.isConnected) return;
          // Restore orientation after the long list has been removed.
          if (scroller) {
            scroller.scrollTop += anchor.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
          }
          if (restoreFocus && (
            document.activeElement === button
            || (!button.isConnected && document.activeElement === document.body)
          )) {
            (button.isConnected ? button : anchor).focus({ preventScroll: true });
          }
        });
      }}
    >
      {expanded ? "Show fewer" : loading ? "Loading…" : "Show more…"}
    </button>
  );
}
