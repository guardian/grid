import { create } from "zustand";
import { prepareImageAction, type ImageAction, type ImageActionContext, type PreparedImageAction } from "@/lib/image-actions";

export interface ImageActionPreview extends PreparedImageAction {
  readonly previewId: number;
  readonly returnFocus?: WeakRef<HTMLElement>;
}

interface ImageActionState {
  prepared: readonly ImageActionPreview[];
  revision: number;
  prepare: (action: ImageAction, context: ImageActionContext, returnFocus?: HTMLElement) => boolean;
  dismiss: (previewId: number) => void;
}

export const useImageActionStore = create<ImageActionState>((set) => ({
  prepared: [],
  revision: 0,
  dismiss(previewId) {
    set(state => ({ prepared: state.prepared.filter(preview => preview.previewId !== previewId) }));
  },
  prepare(action, context, returnFocus) {
    const intent = prepareImageAction(action, context);
    if (!intent) return false;
    set(state => {
      const previewId = state.revision + 1;
      const preview = Object.freeze({ ...intent, previewId, ...(returnFocus && { returnFocus: new WeakRef(returnFocus) }) });
      return { revision: previewId, prepared: [...state.prepared, preview].slice(-20) };
    });
    return true;
  },
}));