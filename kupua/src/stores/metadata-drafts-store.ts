import { create } from "zustand";

export interface MetadataDraft {
  baseline: string;
  value: string;
}

export const useMetadataDrafts = create<{
  drafts: ReadonlyMap<string, ReadonlyMap<string, MetadataDraft>>;
  setDraft: (imageId: string, fieldId: string, baseline: string, value: string) => void;
}>(set => ({
  drafts: new Map(),
  setDraft: (imageId, fieldId, baseline, value) => set(state => {
    const drafts = new Map(state.drafts);
    const fields = new Map(drafts.get(imageId));
    const original = fields.get(fieldId)?.baseline ?? baseline;
    if (value === baseline) fields.delete(fieldId);
    else fields.set(fieldId, { baseline: original, value });
    if (fields.size) drafts.set(imageId, fields);
    else drafts.delete(imageId);
    return { drafts };
  }),
}));

if (typeof window !== "undefined") {
  const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
  const unsubscribe = useMetadataDrafts.subscribe((next, previous) => {
    if (next.drafts.size && !previous.drafts.size) window.addEventListener("beforeunload", warn);
    if (!next.drafts.size) window.removeEventListener("beforeunload", warn);
  });
  import.meta.hot?.dispose(() => { unsubscribe(); window.removeEventListener("beforeunload", warn); });
}