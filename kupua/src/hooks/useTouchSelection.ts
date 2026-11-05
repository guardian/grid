import { useRef, type RefObject } from "react";
import type { Image } from "@/types/image";
import type { AddRangeEffect } from "@/lib/dispatchClickEffects";
import { useLongPress } from "@/hooks/useLongPress";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { createDragSelect, handleLongPressStart, type DragSelectSession } from "@/lib/handleLongPressStart";
import { useSelectionStore } from "@/stores/selection-store";

/** Touch gestures shared by grid/justified and table: long-press, paint/erase drag-select, pull-to-refresh. */
export function useTouchSelection({ containerRef, handleRange, findImageIndex, getImage, getOrderBy }: {
  containerRef: RefObject<HTMLElement | null>;
  handleRange?: (effect: AddRangeEffect) => void;
  findImageIndex: (id: string) => number;
  getImage: (idx: number) => Image | undefined;
  getOrderBy: () => string | undefined;
}): void {
  const handleRangeRef = useRef(handleRange);
  handleRangeRef.current = handleRange;
  const dragSelectRef = useRef<DragSelectSession | null>(null);
  dragSelectRef.current ??= createDragSelect(() => ({ handleRange: handleRangeRef.current, orderBy: getOrderBy() }));
  const dragSelect = dragSelectRef.current;

  useLongPress({
    containerRef,
    onLongPressStart: (cellId) => {
      const sel = useSelectionStore.getState();
      const wasSelected = sel.selectedIds.has(cellId);
      dragSelect.prime(cellId, wasSelected);
      // A selected origin starts an erase-drag: no range fill first.
      if (wasSelected) { sel.setAnchor(cellId); return; }
      handleLongPressStart({ cellId, handleRange, findImageIndex, getImage, orderBy: getOrderBy() });
    },
    onDragEnterCell: (originId, cellId) => dragSelect.enter(originId, cellId),
    onDragEnd: () => dragSelect.end(),
  });
  usePullToRefresh(containerRef);
}
