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

import { useSelectionStore } from "@/stores/selection-store";
import { useUiPrefsStore } from "@/stores/ui-prefs-store";

export function SelectionFab() {
  const selectedCount = useSelectionStore((s) => s.selectedIds.size);
  const clearSelection = useSelectionStore((s) => s.clear);
  const isCoarsePointer = useUiPrefsStore((s) => s._pointerCoarse);

  if (!isCoarsePointer || selectedCount === 0) return null;

  return (
    <button
      type="button"
      onClick={clearSelection}
      aria-label={`Clear selection (${selectedCount.toLocaleString()} selected)`}
      className="fixed bottom-6 right-4 z-50 flex items-center gap-2 rounded-full bg-grid-accent/75 text-white shadow-lg px-4 py-3 text-sm font-medium touch-manipulation select-none"
      style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <span>{selectedCount.toLocaleString()}</span>
      {/* Material Icons "close" */}
      <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
      </svg>
    </button>
  );
}
