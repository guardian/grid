import type { Image } from "@/types/image";
import { useSelectionStore } from "@/stores/selection-store";
import { writeGridImageDragData } from "./grid-drag-data";
import { beginImageDrag } from "./internal-image-drag";
import { setImageDragPreview } from "./image-drag-preview";

export function startResultImageDrag(source: Element, transfer: DataTransfer, image: Image, selectionEnabled: boolean) {
  const selected = useSelectionStore.getState().selectedIds;
  const ids = selectionEnabled && selected.has(image.id) ? [...selected] : [image.id];
  transfer.effectAllowed = "copy";
  if (ids.length === 1) writeGridImageDragData(transfer, image);
  else {
    transfer.setData("text/plain", ids.join(","));
    transfer.setData("application/vnd.mediaservice.images+json", JSON.stringify(ids.map(id => ({ data: { id } }))));
  }
  beginImageDrag(source, transfer, ids);
  setImageDragPreview(transfer, source, ids);
}