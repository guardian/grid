/**
 * Per-id selection selector.
 *
 * Subscribes to the selection store on a per-image basis so that only
 * the component displaying that specific image re-renders when its
 * selection state changes. Using `s.selectedIds` directly (the whole Set)
 * would re-render every subscriber on every toggle — the exact mistake
 * Kahuna made (selections-kahuna-findings.md §3 Cause 4).
 */
import { useSelectionStore } from "@/stores/selection-store";

export function useIsSelected(id: string): boolean {
  return useSelectionStore((s) => s.selectedIds.has(id));
}
