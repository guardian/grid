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

export function SelectionFab({ docked = false }: { docked?: boolean }) {
  const selectedCount = useSelectionStore((s) => s.selectedIds.size);
  const clearSelection = useSelectionStore((s) => s.clear);
  const isCompact = useIsCompact();
  const rightVisible = usePanelStore((s) => s.config.right.visible);
  const togglePanel = usePanelStore((s) => s.togglePanel);
  const [expanded, setExpanded] = useState(false);
  const actionsId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (selectedCount === 0) setExpanded(false);
  }, [selectedCount]);

  if (!isCompact || selectedCount === 0) return null;

  const actions = [
    {
      label: "Details",
      onClick: () => { if (!rightVisible) togglePanel("right"); else triggerRef.current?.focus(); },
    },
    { label: "Clear selection", onClick: clearSelection },
  ];

  return (
    <>
      {expanded && (
        <div className={docked ? "absolute -inset-[100vmax] z-50" : "fixed inset-0 z-50"} aria-hidden="true" onClick={() => setExpanded(false)} />
      )}
      <div
        className={`selection-fab ${docked ? "absolute" : "fixed"} right-4 z-50 flex flex-col items-end gap-2 transition-opacity`}
        style={{ bottom: docked ? "calc(100% + 16px + env(safe-area-inset-bottom, 0px))" : "calc(80px + env(safe-area-inset-bottom, 0px))" }}
        onKeyDown={event => {
          if (event.key === "Escape" && expanded) { event.preventDefault(); event.stopPropagation(); setExpanded(false); triggerRef.current?.focus(); }
        }}
      >
        <div className="flex items-stretch rounded-full bg-grid-accent/85 text-white shadow-lg text-sm font-medium touch-manipulation select-none overflow-hidden">
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-controls={expanded ? actionsId : undefined}
            aria-label={`${selectedCount.toLocaleString()} selected — actions`}
            className="flex items-center gap-1.5 pl-4 pr-4 py-3 min-w-[4.5rem] justify-center active:bg-white/15"
          >
            <svg className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M7.41 15.41 12 10.83l4.59 4.58L18 14l-6-6-6 6z" />
            </svg>
            <span className="tabular-nums">{selectedCount.toLocaleString()}</span>
          </button>
          <span className="w-px my-2 bg-white/40" aria-hidden="true" />
          <button
            type="button"
            onClick={clearSelection}
            aria-label={`Clear selection (${selectedCount.toLocaleString()} selected)`}
            className="pl-3.5 pr-4 py-3 active:bg-white/15"
          >
            {/* Material Icons "close" */}
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
        {expanded && (
          <div id={actionsId} role="group" aria-label="Selection actions" className={`absolute right-0 flex flex-col items-end gap-2 ${docked && rightVisible ? "top-full mt-2" : "bottom-full mb-2"}`}>
            {actions.map((action, index) => (
              <button key={action.label} type="button" onClick={() => { setExpanded(false); action.onClick(); }}
                className="anim-fab-item rounded-full bg-grid-cell-hover/95 text-grid-text-bright shadow-lg px-4 py-2.5 text-sm font-medium touch-manipulation select-none"
                style={{ animationDelay: `${(actions.length - 1 - index) * 40}ms` }}>
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
