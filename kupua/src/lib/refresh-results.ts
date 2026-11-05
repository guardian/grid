import { resetScrollAndFocusSearch } from "@/lib/orchestration/search";
import { useSearchStore } from "@/stores/search-store";
import { useSelectionStore } from "@/stores/selection-store";
import { SELECTIONS_PERSIST_ACROSS_NAVIGATION } from "@/constants/tuning";

/** Re-run the current search from the top (the "N new" ticker and pull-to-refresh). */
export function refreshResults(): void {
  resetScrollAndFocusSearch({ skipEagerScroll: true });
  // Clear before reSearch so the multi-panel doesn't flash old reconciled state.
  if (!SELECTIONS_PERSIST_ACROSS_NAVIGATION) useSelectionStore.getState().clear();
  void useSearchStore.getState().search();
}
