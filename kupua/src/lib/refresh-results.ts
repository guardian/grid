import { resetScrollAndFocusSearch } from "@/lib/orchestration/search";
import { useSearchStore } from "@/stores/search-store";
import { useSelectionStore } from "@/stores/selection-store";
import { SELECTIONS_PERSIST_ACROSS_NAVIGATION } from "@/constants/tuning";
import { afterDetailsDeparture } from "@/lib/details-departure";

/** Re-run the current search from the top (the "N new" ticker and pull-to-refresh). */
export function refreshResults(): void {
  const refresh = () => {
    resetScrollAndFocusSearch({ skipEagerScroll: true });
    if (clearSelection) useSelectionStore.getState().clear();
    void useSearchStore.getState().search();
  };
  const params = useSearchStore.getState().params;
  const clearSelection = !SELECTIONS_PERSIST_ACROSS_NAVIGATION && !params.imageScope && !params.recentUploadScope;
  if (clearSelection) afterDetailsDeparture("Discard edit", refresh);
  else refresh();
}
