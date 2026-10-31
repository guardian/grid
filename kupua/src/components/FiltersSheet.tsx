import { useEffect, useRef, type TouchEvent } from "react";
import { useSearchStore } from "@/stores/search-store";
import { useUpdateSearchParams } from "@/hooks/useUrlSearchSync";
import { useContentPullToDrag } from "@/hooks/useContentPullToDrag";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { SearchFilters } from "./SearchFilters";
import { DateFilter } from "./DateFilter";
import { RefineChips } from "./RefineChips";

/** Refine: a bottom sheet with chips on touch phones; a plain dropdown under the bar on narrow desktop. */
export function FiltersSheet({ onClose, fields, onFieldsChange, dropdown = false }: {
  onClose: () => void;
  fields: string;
  onFieldsChange: (fields: string) => void;
  dropdown?: boolean;
}) {
  const total = useSearchStore((s) => s.total);
  const loading = useSearchStore((s) => s.loading);
  const updateSearch = useUpdateSearchParams();
  const sheetRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; t: number } | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onTouchStart = (e: TouchEvent) => {
    drag.current = { y: e.touches[0].clientY, t: performance.now() };
    if (sheetRef.current) sheetRef.current.style.animation = "none";
  };
  const onTouchMove = (e: TouchEvent) => {
    const el = sheetRef.current;
    if (!drag.current || !el) return;
    const dy = Math.max(0, e.touches[0].clientY - drag.current.y);
    el.style.transition = "none";
    el.style.translate = `0 ${dy}px`;
  };
  const onTouchEnd = (e: TouchEvent) => {
    const el = sheetRef.current;
    const d = drag.current;
    drag.current = null;
    if (!d || !el) return;
    const dy = Math.max(0, e.changedTouches[0].clientY - d.y);
    const v = dy / Math.max(1, performance.now() - d.t);
    el.style.transition = "translate 0.2s cubic-bezier(0.22, 1, 0.36, 1)";
    if (dy > 120 || v > 0.6) {
      el.style.translate = "0 100%";
      el.addEventListener("transitionend", onClose, { once: true });
    } else {
      el.style.translate = "0 0";
    }
  };
  const contentPull = useContentPullToDrag(contentRef,
    { onTouchStart, onTouchMove, onTouchEnd, isDragging: () => drag.current !== null });
  const dropdownRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dropdown ? dropdownRef : sheetRef, true);

  const reset = () => {
    if (!dropdown) onFieldsChange("");
    updateSearch({
      nonFree: "true", orderBy: undefined, dateField: undefined, since: undefined, until: undefined,
      takenSince: undefined, takenUntil: undefined, modifiedSince: undefined, modifiedUntil: undefined,
    });
  };

  if (dropdown) {
    return (
      <>
        <div className="fixed inset-x-0 top-11 bottom-0 z-[54] bg-black/20" aria-hidden="true" onClick={onClose} />
        <div ref={dropdownRef} tabIndex={-1} role="dialog" aria-label="Filters and sort" className="outline-none fixed inset-x-0 top-11 z-[55] max-h-[calc(100vh-3rem)] overflow-y-auto bg-grid-bg border-b border-grid-separator shadow-lg px-4 py-3 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <SearchFilters inSheet />
            <SearchFilters.Sort inSheet />
          </div>
          <DateFilter inline />
          <div className="flex justify-end">
            <button type="button" onClick={reset} className="px-3 h-8 text-sm text-grid-accent">Reset</button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="fixed inset-x-0 top-11 bottom-0 z-[54] bg-black/40 anim-scrim" aria-hidden="true" onClick={onClose} />
      <div ref={sheetRef} tabIndex={-1} role="dialog" aria-label="Refine search" className="outline-none fixed inset-x-0 bottom-0 top-[112px] z-[55] flex flex-col bg-grid-bg rounded-t-2xl border-t border-grid-separator shadow-[0_-8px_24px_rgba(0,0,0,0.45)] anim-sheet-up">
        <div
          className="shrink-0 touch-none"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
        >
          <div className="flex justify-center pt-2"><span className="block w-10 h-1 rounded-full bg-grid-text-dim" /></div>
          <div className="flex items-center h-11 px-2">
            <button type="button" onClick={onClose} aria-label="Close filters" className="w-11 h-11 flex items-center justify-center text-grid-text-muted">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>
            <h2 className="flex-1 text-base text-grid-text-bright ml-1">Refine</h2>
            <button type="button" onClick={reset} className="px-3 h-11 text-sm text-grid-accent">Reset</button>
          </div>
        </div>
        <div
          ref={contentRef}
          className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4 flex flex-col gap-5 pt-2"
          {...contentPull}
        >
          <RefineChips fields={fields} onFieldsChange={onFieldsChange} />
          <div className="flex items-center justify-between gap-3">
            <SearchFilters inSheet />
            <SearchFilters.Sort inSheet />
          </div>
          <DateFilter inline />
        </div>
        <div className="p-3 border-t border-grid-separator shrink-0" style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}>
          <button type="button" onClick={onClose} className="w-full h-11 rounded-lg bg-grid-accent text-white font-medium">
            {loading ? "Searching…" : `Show ${total.toLocaleString()} results`}
          </button>
        </div>
      </div>
    </>
  );
}
