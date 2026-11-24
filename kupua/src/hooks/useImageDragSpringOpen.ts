import { useCallback, useEffect, useRef, type DragEvent } from "react";
import { imageDragSignal } from "@/lib/internal-image-drag";

export function useImageDragSpringOpen(canOpen: () => boolean, open: () => void) {
  const pending = useRef<(() => void) | undefined>(undefined);
  const cancel = useCallback(() => pending.current?.(), []);
  useEffect(() => cancel, [cancel]);

  return {
    onDragOver(event: DragEvent) {
      if (pending.current || !canOpen()) return;
      const signal = imageDragSignal(event.dataTransfer);
      if (!signal) return;
      const timer = window.setTimeout(() => {
        cancel();
        if (canOpen()) open();
      }, 600);
      pending.current = () => {
        window.clearTimeout(timer);
        signal.removeEventListener("abort", cancel);
        pending.current = undefined;
      };
      signal.addEventListener("abort", cancel);
    },
    onDragLeave(event: DragEvent) {
      if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
      cancel();
    },
    onDrop: cancel,
  };
}