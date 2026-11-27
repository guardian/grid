import { useCallback, useEffect, useRef } from "react";
import { afterDetailsDeparture, hasChangedDetails } from "@/lib/details-departure";
import { useSelectionStore } from "@/stores/selection-store";

export function useDetailsBodyClick(single: (id: string, event: React.MouseEvent) => void, double: (id: string) => void) {
  const pending = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(pending.current), []);
  const click = useCallback((id: string, event: React.MouseEvent) => {
      const proceed = () => single(id, event);
      if (!hasChangedDetails() || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) { proceed(); return; }
      const ids = useSelectionStore.getState().selectedIds;
      if (!ids.size) { afterDetailsDeparture("Discard edit", proceed); return; }
      if (ids.size !== 1 || !ids.has(id)) { proceed(); return; }
      clearTimeout(pending.current);
      if (event.detail > 1) return;
      pending.current = setTimeout(() => {
        if (ids === useSelectionStore.getState().selectedIds && hasChangedDetails()) proceed();
      }, 500);
    }, [single]);
  const open = useCallback((id: string) => {
      clearTimeout(pending.current);
      afterDetailsDeparture("Discard and open", () => double(id));
    }, [double]);
  return { click, open };
}