import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { TypeaheadSuggestion } from "@/lib/typeahead-fields";

interface Props {
  anchorRef: RefObject<HTMLInputElement | null>;
  items: readonly TypeaheadSuggestion[];
  id: string;
  label: string;
  activeIndex?: number;
  onSelect: (item: TypeaheadSuggestion) => void;
  onVisibilityChange?: (visible: boolean) => void;
}

interface Placement {
  host: HTMLElement;
  left: number;
  top: number;
  width: number;
  maxHeight: number;
  above: boolean;
}

export function SuggestionDropdown({ anchorRef, items, id, label, activeIndex = -1, onSelect, onVisibilityChange }: Props) {
  const ref = useRef<HTMLUListElement>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const visible = !!placement && placement.maxHeight >= 36 && items.length > 0;
  useLayoutEffect(() => { onVisibilityChange?.(visible); }, [visible, onVisibilityChange]);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor || !items.length) { setPlacement(null); return; }
    const host = anchor.closest<HTMLElement>('[data-suggestion-scope], [role="dialog"]')
      ?? (document.fullscreenElement instanceof HTMLElement ? document.fullscreenElement : document.body);
    const widthOwner = anchor.closest<HTMLElement>("[data-suggestion-width]") ?? (host === document.body ? null : host);
    const editor = anchor.closest<HTMLElement>("[data-metadata-field]");
    const update = () => {
      const bounds = anchor.getBoundingClientRect();
      const editorBounds = editor?.getBoundingClientRect() ?? bounds;
      const visual = window.visualViewport;
      const visibleTop = visual?.offsetTop ?? 0;
      const visibleBottom = visibleTop + (visual?.height ?? window.innerHeight);
      const visibleLeft = visual?.offsetLeft ?? 0;
      const visibleRight = visibleLeft + (visual?.width ?? window.innerWidth);
      const widthBounds = widthOwner?.getBoundingClientRect() ?? bounds;
      const inset = widthOwner === host ? 12 : 0;
      const left = Math.max(visibleLeft + 8, widthBounds.left + inset);
      const right = Math.max(left, Math.min(visibleRight - 8, widthBounds.right - inset));
      const belowEdge = Math.max(visibleTop + 8, Math.min(visibleBottom - 8, editorBounds.bottom + 6));
      const aboveEdge = Math.max(visibleTop + 8, Math.min(visibleBottom - 8, editorBounds.top - 6));
      const below = Math.max(0, visibleBottom - 8 - belowEdge);
      const aboveRoom = Math.max(0, aboveEdge - visibleTop - 8);
      const above = below < Math.min(180, aboveRoom);
      const hostBounds = host === document.body ? null : host.getBoundingClientRect();
      const next = {
        host, above,
        left: left - (hostBounds?.left ?? 0) - (hostBounds ? host.clientLeft : 0) + (hostBounds ? host.scrollLeft : 0),
        top: (above ? aboveEdge : belowEdge) - (hostBounds?.top ?? 0) - (hostBounds ? host.clientTop : 0) + (hostBounds ? host.scrollTop : 0),
        width: right - left,
        maxHeight: Math.max(0, Math.min(240, above ? aboveRoom : below)),
      };
      setPlacement(current => current && Object.keys(next).every(key => current[key as keyof Placement] === next[key as keyof Placement]) ? current : next);
    };
    update();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : undefined;
    observer?.observe(anchor);
    if (widthOwner && widthOwner !== anchor) observer?.observe(widthOwner);
    if (editor && editor !== anchor && editor !== widthOwner) observer?.observe(editor);
    window.addEventListener("resize", update);
    document.addEventListener("scroll", update, true);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
      document.removeEventListener("scroll", update, true);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, [anchorRef, items.length]);

  useLayoutEffect(() => {
    const list = ref.current;
    const option = list?.children[activeIndex] as HTMLElement | undefined;
    if (!list || !option) return;
    if (option.offsetTop < list.scrollTop) list.scrollTop = option.offsetTop;
    else if (option.offsetTop + option.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = option.offsetTop + option.offsetHeight - list.clientHeight;
    }
  }, [activeIndex, ref, placement]);

  if (!visible || !placement) return null;
  return createPortal(<ul ref={ref} id={id} role="listbox" aria-label={label} data-own-scroll
    className="overflow-y-auto overscroll-contain rounded-sm border border-grid-separator bg-grid-bg text-grid-text shadow-lg"
    style={{ position: placement.host === document.body ? "fixed" : "absolute", zIndex: 80,
      left: placement.left, top: placement.top, width: placement.width, maxHeight: placement.maxHeight,
      transform: placement.above ? "translateY(-100%)" : undefined }}>
    {items.map((item, index) => <li role="presentation" key={item.value}>
      <button type="button" role="option" id={`${id}-${index}`} aria-selected={index === activeIndex} tabIndex={-1}
        onPointerDown={event => event.preventDefault()} onClick={() => onSelect(item)}
        className={`flex min-h-6 pointer-coarse:min-h-[var(--mobile-edit-control-size)] w-full cursor-pointer items-center justify-between gap-3 px-3 py-1 text-left text-xs hover:bg-grid-cell-hover ${index === activeIndex ? "bg-grid-cell-hover text-grid-text-bright" : "text-grid-text"}`}>
        <span className="min-w-0 wrap-anywhere">{item.label ?? item.value}</span>
        {item.count !== undefined && <span className="shrink-0 tabular-nums text-grid-text-dim">{item.count.toLocaleString()}</span>}
      </button>
    </li>)}
  </ul>, placement.host);
}