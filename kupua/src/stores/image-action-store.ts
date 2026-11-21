import { create } from "zustand";
import { prepareImageAction, type ImageAction, type ImageActionContext, type PreparedImageAction } from "@/lib/image-actions";
import { addToast } from "./toast-store";

interface ImageActionState {
  prepare: (action: ImageAction, context: ImageActionContext, returnFocus?: HTMLElement) => PreparedImageAction | false;
}

export const useImageActionStore = create<ImageActionState>(() => ({
  prepare(action, context) {
    const intent = prepareImageAction(action, context);
    if (!intent) return false;
    const count = intent.skipped.length;
    const reasons = new Set(intent.skipped.map(item => item.reason));
    const skipped = count ? `; ${intent.eligibleIds.length} prepared; ${count} skipped${reasons.size === 1 ? ` (${intent.skipped[0].reason})` : ""}` : "";
    addToast({ category: "information", message: `Not sent - ${intent.label}${skipped}` });
    return intent;
  },
}));