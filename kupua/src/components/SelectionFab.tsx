/**
 * SelectionFab -- Floating Action Button for mobile selection mode.
 *
 * Visible only on coarse-pointer (touch) devices when one or more images are
 * selected. Docked above the selection card when available, otherwise fixed
 * above the bottom edge. The count opens actions; X clears the selection.
 *
 * Desktop shows count + Clear in the StatusBar instead (see StatusBar.tsx).
 * This component is the mobile equivalent -- no StatusBar changes needed for
 * the count/clear on touch devices.
 *
 * The FAB is a split pill: "[N selected]  [x]". Actions open below the pill
 * above an expanded card, keeping them inside short landscape viewports.
 *
 * Naming rationale: "FAB" (Floating Action Button) is the Material Design
 * term used by Google Photos and Android for this pattern.
 */

import { useEffect, useId, useRef, useState } from "react";
import { useSelectionStore } from "@/stores/selection-store";
import { usePanelStore } from "@/stores/panel-store";
import { useIsCompact } from "@/hooks/useShell";
import { ImageActions } from "./ImageActions";
import type { ImageActionContext } from "@/lib/image-actions";
import { useActionPopupPlacement } from "@/hooks/useActionPopupPlacement";

export function SelectionFab({ docked = false, context, onDetails, detailsExpanded = false }: {
  docked?: boolean; context?: ImageActionContext; onDetails?: () => void; detailsExpanded?: boolean;
}) {
  const selectedCount = useSelectionStore((s) => s.selectedIds.size);
  const clearSelection = useSelectionStore((s) => s.clear);
  const isCompact = useIsCompact();
  const rightVisible = usePanelStore((s) => s.config.right.visible);
  const togglePanel = usePanelStore((s) => s.togglePanel);
  const [expanded, setExpanded] = useState(false);
  const actionsId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const floatyRef = useRef<HTMLDivElement>(null);
  const count = context ? context.targets.length : selectedCount;
  const cardOpen = context ? detailsExpanded : rightVisible;
  const collapsedWidth = context ? 112 : 2 * Math.max(82, 48 + selectedCount.toLocaleString().length * 8);
  const expandedWidth = Math.max(176, collapsedWidth);
  const deselectWidth = (collapsedWidth - 1) / 2;
  const targetKey = context ? JSON.stringify(context.targets.map(target => target.id)) : String(selectedCount);
  const placement = useActionPopupPlacement(triggerRef, popupRef, expanded, docked && cardOpen);
  const close = () => { setExpanded(false); triggerRef.current?.focus({ preventScroll: true }); };

  useEffect(() => {
    setExpanded(false);
  }, [targetKey]);
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

  const actions = [
    {
      label: cardOpen ? "Close details" : "Details",
      onClick: () => { if (onDetails) onDetails(); else togglePanel("right"); },
    },
  ];

  return (
      <div
        ref={floatyRef}
        className={`selection-fab ${docked ? "absolute" : "fixed"} right-4 z-50 flex flex-col items-end transition-opacity`}
        data-expanded={expanded}
        data-side={placement.below ? "below" : "above"}
        style={{ bottom: docked ? "calc(100% + 16px + env(safe-area-inset-bottom, 0px))" : "calc(80px + env(safe-area-inset-bottom, 0px))" }}
        onKeyDown={event => {
          if (event.key === "Escape" && expanded) { event.preventDefault(); event.stopPropagation(); close(); }
        }}
        onBlur={event => {
          if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setExpanded(false);
        }}
      >
        <div className="selection-fab-trigger flex items-stretch text-white text-sm font-medium touch-manipulation select-none overflow-hidden"
          style={{ width: expanded ? expandedWidth : collapsedWidth }}>
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-controls={expanded ? actionsId : undefined}
            aria-label={context ? "Image actions" : `${selectedCount.toLocaleString()} selected — actions`}
            className="flex flex-1 items-center gap-1.5 px-3 min-h-11 justify-center active:bg-white/15"
          >
            <svg className={`w-4 h-4 transition-transform ${(expanded ? !placement.below : cardOpen) ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M7.41 15.41 12 10.83l4.59 4.58L18 14l-6-6-6 6z" />
            </svg>
            <span className="tabular-nums">{context ? "Actions" : selectedCount.toLocaleString()}</span>
          </button>
          {!context && <>
          <span className="w-px my-2 bg-white/40" aria-hidden="true" />
          <button
            type="button"
            onClick={clearSelection}
            aria-label={`Clear selection (${selectedCount.toLocaleString()} selected)`}
            style={{ width: deselectWidth }}
            className="flex gap-1 px-1.5 shrink-0 items-center justify-center active:bg-white/15"
          >
            {expanded && <span className="text-xs">Deselect</span>}
            {/* Material Icons "close" */}
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
          </>}
        </div>
        {expanded && (
          <div ref={popupRef} id={actionsId} tabIndex={-1} data-image-action-popup role="group" aria-label={context ? "Image action options" : "Selection actions"}
            onKeyDown={event => {
              if (event.key !== "Tab") event.stopPropagation();
              if (event.key === "Escape") { event.preventDefault(); close(); }
            }}
            style={{ maxHeight: placement.maxHeight, width: `min(${expandedWidth}px, calc(100vw - 32px))`, translate: `${placement.shiftX}px 0` }}
            className={`selection-fab-options absolute right-0 grid grid-cols-1 overflow-y-auto overscroll-contain outline-none ${placement.below ? "top-full" : "bottom-full"}`}>
            <ImageActions context={context} expanded presentation="floaty" onPrepared={close} />
            {actions.map(action => (
              <button key={action.label} type="button" onClick={() => { close(); action.onClick(); }}
                className="selection-fab-detail flex items-center text-white touch-manipulation select-none" title={action.label}>
                <svg className="size-4" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d={cardOpen
                  ? "m480-500 160-160H320l160 160Zm280-340q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560ZM200-320v120h560v-120H200Zm560-80v-360H200v360h560Zm-560 80v120-120Z"
                  : "M320-500h320L480-660 320-500ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-200v120h560v-120H200Zm0-80h560v-360H200v360Zm0 80v120-120Z"} /></svg>
                <span>{action.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
  );
}
