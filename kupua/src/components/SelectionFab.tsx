/**
 * SelectionFab -- Floating Action Button for mobile selection mode.
 *
 * Visible only on coarse-pointer (touch) devices when one or more images are
 * selected. Fixed to the bottom-right corner. Shows the selection count and a
 * large X button to clear the selection.
 *
 * Desktop shows count + Clear in the StatusBar instead (see StatusBar.tsx).
 * This component is the mobile equivalent -- no StatusBar changes needed for
 * the count/clear on touch devices.
 *
 * The FAB is a single pill: "[N selected]  [x]"
 * Pressing anywhere on it clears the selection.
 *
 * Naming rationale: "FAB" (Floating Action Button) is the Material Design
 * term used by Google Photos and Android for this pattern.
 */

import { useEffect, useState } from "react";
import { useSelectionStore } from "@/stores/selection-store";
import { useUiPrefsStore } from "@/stores/ui-prefs-store";
import { usePanelStore } from "@/stores/panel-store";
import { isCompactNow } from "@/hooks/useShell";

export function SelectionFab() {
  const selectedCount = useSelectionStore((s) => s.selectedIds.size);
  const clearSelection = useSelectionStore((s) => s.clear);
  const isCoarsePointer = useUiPrefsStore((s) => s._pointerCoarse);
  const rightVisible = usePanelStore((s) => s.config.right.visible);
  const togglePanel = usePanelStore((s) => s.togglePanel);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (selectedCount === 0) setExpanded(false);
  }, [selectedCount]);

  if (!isCoarsePointer || selectedCount === 0) return null;

  // Compact shell shows the selection card's peek strip along the bottom.
  const liftForCard = isCompactNow();

  const actions = [
    {
      label: "Details",
      onClick: () => { if (!rightVisible) togglePanel("right"); },
    },
    { label: "Clear selection", onClick: clearSelection },
  ];

  return (
    <>
      {expanded && (
        <div className="fixed inset-0 z-50" aria-hidden="true" onClick={() => setExpanded(false)} />
      )}
      <div
        className="selection-fab fixed right-4 z-50 flex flex-col items-end gap-2 transition-opacity"
        style={{ bottom: `calc(${liftForCard ? 80 : 24}px + env(safe-area-inset-bottom, 0px))` }}
      >
        {expanded && (
          <div role="menu" className="flex flex-col items-end gap-2">
            {actions.map((a, i) => (
              <button
                key={a.label}
                type="button"
                role="menuitem"
                onClick={() => { setExpanded(false); a.onClick(); }}
                className="anim-fab-item rounded-full bg-grid-cell-hover/95 text-grid-text-bright shadow-lg px-4 py-2.5 text-sm font-medium touch-manipulation select-none"
                style={{ animationDelay: `${(actions.length - 1 - i) * 40}ms` }}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-stretch rounded-full bg-grid-accent/85 text-white shadow-lg text-sm font-medium touch-manipulation select-none overflow-hidden">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-haspopup="menu"
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
      </div>
    </>
  );
}
