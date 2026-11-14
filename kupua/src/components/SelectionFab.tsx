import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useSelectionStore } from "@/stores/selection-store";
import { useIsCompact } from "@/hooks/useShell";
import { ImageActions, SelectionImageActions } from "./ImageActions";
import type { ImageActionContext } from "@/lib/image-actions";
import { useActionPopupPlacement } from "@/hooks/useActionPopupPlacement";

function ActionSurface({ strip, popup, visible, below, shiftX, maxHeight }: {
  strip: RefObject<HTMLDivElement | null>; popup: RefObject<HTMLDivElement | null>;
  visible: boolean; below: boolean; shiftX: number; maxHeight: number;
}) {
  const shadowId = useId();
  const [shape, setShape] = useState({ left: 0, top: 0, width: 112, height: 44, path: "" });
  useLayoutEffect(() => {
    const measure = () => {
      const buttonWidth = strip.current?.offsetWidth || 112;
      const buttonHeight = strip.current?.offsetHeight || 44;
      const menuWidth = visible ? popup.current?.offsetWidth || 136 : 0;
      const menuHeight = visible ? popup.current?.offsetHeight || 0 : 0;
      const menuLeft = buttonWidth - menuWidth + shiftX;
      const left = menuHeight ? Math.min(0, menuLeft) : 0;
      const width = menuHeight ? Math.max(buttonWidth, menuLeft + menuWidth) - left : buttonWidth;
      const height = buttonHeight + menuHeight;
      const buttonLeft = .5 - left;
      const buttonRight = buttonWidth - left - .5;
      const menuStart = menuLeft - left + .5;
      const menuEnd = menuLeft + menuWidth - left - .5;
      const topLeft = menuHeight && !below ? menuStart : buttonLeft;
      const topRight = menuHeight && !below ? menuEnd : buttonRight;
      const bottomLeft = menuHeight && below ? menuStart : buttonLeft;
      const bottomRight = menuHeight && below ? menuEnd : buttonRight;
      const joint = below ? buttonHeight : menuHeight;
      const points = menuHeight ? [
        [topLeft, .5], [topRight, .5], [topRight, joint], [bottomRight, joint],
        [bottomRight, height - .5], [bottomLeft, height - .5], [bottomLeft, joint], [topLeft, joint],
      ] : [[buttonLeft, .5], [buttonRight, .5], [buttonRight, height - .5], [buttonLeft, height - .5]];
      const unique = points.filter((point, index) => {
        const previous = points[(index + points.length - 1) % points.length];
        return point[0] !== previous[0] || point[1] !== previous[1];
      });
      const vertices = unique.filter((point, index) => {
        const previous = unique[(index + unique.length - 1) % unique.length];
        const next = unique[(index + 1) % unique.length];
        return (point[0] - previous[0]) * (next[1] - point[1]) !== (point[1] - previous[1]) * (next[0] - point[0]);
      });
      const corners = vertices.map((vertex, index) => {
        const previous = vertices[(index + vertices.length - 1) % vertices.length];
        const next = vertices[(index + 1) % vertices.length];
        const before = Math.hypot(previous[0] - vertex[0], previous[1] - vertex[1]);
        const after = Math.hypot(next[0] - vertex[0], next[1] - vertex[1]);
        const buttonCorner = !menuHeight || below && vertex[1] === .5 || !below && vertex[1] === height - .5;
        const radius = Math.min(buttonCorner ? 20 : 16, before / 2, after / 2);
        return {
          entry: vertex.map((coordinate, axis) => coordinate + (previous[axis] - coordinate) * radius / before),
          exit: vertex.map((coordinate, axis) => coordinate + (next[axis] - coordinate) * radius / after), vertex,
        };
      });
      const path = `M ${corners.at(-1)!.exit.join(" ")} ${corners.map(corner => `L ${corner.entry.join(" ")} Q ${corner.vertex.join(" ")} ${corner.exit.join(" ")}`).join(" ")} Z`;
      const next = { left, top: menuHeight && !below ? -menuHeight : 0, width, height, path };
      setShape(current => current.left === next.left && current.top === next.top && current.width === next.width && current.height === next.height && current.path === path ? current : next);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    if (strip.current) observer.observe(strip.current);
    if (popup.current) observer.observe(popup.current);
    return () => observer.disconnect();
  }, [strip, popup, visible, below, shiftX, maxHeight]);
  const bounds = { left: shape.left, top: shape.top, width: shape.width, height: shape.height };
  return <>
    <svg className="selection-fab-shadow" aria-hidden="true" style={bounds} viewBox={`0 0 ${shape.width} ${shape.height}`}>
      <defs><filter id={shadowId} x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="4" stdDeviation="10" floodColor="#000" floodOpacity="0.23" />
        <feComposite in2="SourceGraphic" operator="out" />
      </filter></defs>
      <path d={shape.path} filter={`url(#${shadowId})`} />
    </svg>
    <div className="selection-fab-glass" aria-hidden="true" style={{ ...bounds, clipPath: `path("${shape.path}")` }}>
      <svg viewBox={`0 0 ${shape.width} ${shape.height}`}><path d={shape.path} /></svg>
    </div>
  </>;
}

interface ActionFabProps {
  docked?: boolean;
  detailsExpanded?: boolean;
  closeSignal?: number;
}

export function SelectionFab(props: ActionFabProps) {
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const clearSelection = useSelectionStore((s) => s.clear);
  return <ActionFab {...props} selectedIds={selectedIds} clearSelection={clearSelection} />;
}

export function ImageActionFab(props: ActionFabProps & { context: ImageActionContext }) {
  return <ActionFab {...props} />;
}

function ActionFab({ docked = false, context, selectedIds, clearSelection, detailsExpanded = false, closeSignal = 0 }: ActionFabProps & {
  context?: ImageActionContext; selectedIds?: ReadonlySet<string>; clearSelection?: () => void;
}) {
  const selectedCount = selectedIds?.size ?? 0;
  const isCompact = useIsCompact();
  const [expanded, setExpanded] = useState(false);
  const [present, setPresent] = useState(false);
  const actionsId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const floatyRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const count = context ? context.targets.length : selectedCount;
  const collapsedWidth = 112;
  const expandedWidth = 136;
  const deselectWidth = 64;
  const targetKey = JSON.stringify(context ? context.targets.map(target => target.id) : [...selectedIds ?? []]);
  const placement = useActionPopupPlacement(triggerRef, popupRef, expanded, docked && detailsExpanded);
  const close = () => { setExpanded(false); triggerRef.current?.focus({ preventScroll: true }); };

  useEffect(() => {
    setExpanded(false);
  }, [targetKey, detailsExpanded, closeSignal]);
  useEffect(() => {
    if (expanded) { setPresent(true); return; }
    if (!present) return;
    const timer = setTimeout(() => setPresent(false), 160);
    return () => clearTimeout(timer);
  }, [expanded, present]);
  useEffect(() => {
    if (!expanded) return;
    popupRef.current?.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      if (!floatyRef.current?.contains(event.target as Node)) setExpanded(false);
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [expanded]);

  if (!isCompact || count === 0) return null;

  return (
      <div
        ref={floatyRef}
        className={`selection-fab ${docked ? "relative shrink-0" : "fixed right-4"} z-50 flex flex-col items-end transition-opacity`}
        data-expanded={expanded}
        data-side={placement.below ? "below" : "above"}
        style={docked ? undefined : { bottom: "calc(80px + env(safe-area-inset-bottom, 0px))" }}
        onKeyDown={event => {
          if (event.key === "Escape" && expanded) { event.preventDefault(); event.stopPropagation(); close(); }
        }}
        onBlur={event => {
          if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setExpanded(false);
        }}
      >
        <ActionSurface strip={stripRef} popup={popupRef} visible={expanded || present} below={placement.below} shiftX={placement.shiftX} maxHeight={placement.maxHeight} />
        <div ref={stripRef} className="selection-fab-trigger flex items-stretch text-white text-sm font-medium touch-manipulation select-none overflow-hidden"
          style={{ width: collapsedWidth }}>
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-controls={expanded ? actionsId : undefined}
            aria-label={context ? "Image actions" : `${selectedCount.toLocaleString()} selected — actions`}
            className="flex flex-1 items-center gap-1.5 px-3 min-h-11 justify-center active:bg-white/15 touch-none"
          >
            <svg className={`w-4 h-4 ${context && (expanded ? !placement.below : detailsExpanded) ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d={context ? "M7.41 15.41 12 10.83l4.59 4.58L18 14l-6-6-6 6z" : "M6 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z"} />
            </svg>
            {context && <span>Actions</span>}
          </button>
          {!context && <>
          <span className="w-px my-2 bg-white/40" aria-hidden="true" />
          <button
            type="button"
            onClick={clearSelection}
            aria-label={`Clear selection (${selectedCount.toLocaleString()} selected)`}
            style={{ width: deselectWidth }}
            className="flex gap-1 px-1.5 shrink-0 items-center justify-center active:bg-white/15 touch-none"
          >
            <span className="text-xs">Deselect</span>
          </button>
          </>}
        </div>
        {(expanded || present) && (
          <div ref={popupRef} id={actionsId} tabIndex={-1} data-image-action-popup={expanded || undefined} data-own-scroll data-closing={!expanded || undefined} inert={!expanded} aria-hidden={!expanded || undefined} role="group" aria-label={context ? "Image action options" : "Selection actions"}
            onKeyDown={event => {
              if (event.key !== "Tab") event.stopPropagation();
              if (event.key === "Escape") { event.preventDefault(); close(); }
            }}
            style={{ maxHeight: placement.maxHeight, width: expandedWidth, maxWidth: "calc(100vw - 32px)", translate: `${placement.shiftX}px 0` }}
            className={`selection-fab-options absolute right-0 grid grid-cols-1 overflow-y-auto overscroll-contain outline-none ${placement.below ? "top-full" : "bottom-full"}`}>
            {context ? <ImageActions context={context} expanded presentation="floaty" onPrepared={close} />
              : <SelectionImageActions expanded presentation="floaty" onPrepared={close} />}
          </div>
        )}
      </div>
  );
}
