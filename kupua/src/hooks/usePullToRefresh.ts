import { useEffect, type RefObject } from "react";
import { refreshResults } from "@/lib/refresh-results";
import { useSelectionStore } from "@/stores/selection-store";

const THRESHOLD_PX = 64;

/** Touch pull-down at the top of a results scroller re-runs the search (like the "N new" ticker). */
export function usePullToRefresh(containerRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let startY: number | null = null;
    let pull = 0;
    let containerTop = 0;
    let indicator: HTMLDivElement | null = null;

    const show = () => {
      if (!indicator) {
        indicator = document.createElement("div");
        indicator.setAttribute("aria-hidden", "true");
        indicator.className = "fixed left-1/2 z-40 w-9 h-9 -ml-[18px] rounded-full bg-grid-cell-hover shadow-lg flex items-center justify-center text-grid-text-bright pointer-events-none";
        indicator.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>';
        document.body.appendChild(indicator);
      }
      const progress = Math.min(1, pull / THRESHOLD_PX);
      indicator.style.top = `${containerTop + Math.min(pull, THRESHOLD_PX * 1.3) - 36}px`;
      indicator.style.opacity = String(progress);
      indicator.style.rotate = `${progress * 270}deg`;
      indicator.style.color = progress >= 1 ? "var(--color-grid-accent)" : "";
    };
    const hide = () => { indicator?.remove(); indicator = null; };

    const onStart = (e: TouchEvent) => {
      const selecting = useSelectionStore.getState().selectedIds.size > 0;
      startY = !selecting && e.touches.length === 1 && el.scrollTop <= 0 ? e.touches[0].clientY : null;
      if (startY !== null) containerTop = el.getBoundingClientRect().top;
      pull = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (startY === null || e.defaultPrevented || e.touches.length !== 1) return;
      if (el.scrollTop > 0) { startY = null; hide(); return; }
      pull = Math.max(0, (e.touches[0].clientY - startY) / 2);
      if (pull > 4) show(); else hide();
    };
    const onEnd = () => {
      if (startY !== null && pull >= THRESHOLD_PX) refreshResults();
      startY = null;
      pull = 0;
      hide();
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: true });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      hide();
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [containerRef]);
}
