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
import { useBrowsingContext } from "@/lib/browsing-context";

export function useIsSelected(id: string): boolean {
  const { path } = useBrowsingContext();
  return useSelectionStore((s) => path === "/search" && s.selectedIds.has(id));
}
