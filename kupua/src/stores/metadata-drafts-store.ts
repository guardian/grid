import { create } from "zustand";

export interface MetadataDraft {
  baseline: string;
  value: string;
  revision: number;
}

let nextRevision = 0;

export const useMetadataDrafts = create<{
  drafts: ReadonlyMap<string, ReadonlyMap<string, MetadataDraft>>;
  setDraft: (imageId: string, fieldId: string, baseline: string, value: string, retain?: boolean) => void;
  clearDraft: (imageId: string, fieldId: string, revision: number) => void;
}>(set => ({
  drafts: new Map(),
  clearDraft: (imageId, fieldId, revision) => set(state => {
    if (state.drafts.get(imageId)?.get(fieldId)?.revision !== revision) return state;
    const drafts = new Map(state.drafts);
    const fields = new Map(drafts.get(imageId));
    fields.delete(fieldId);
    if (fields.size) drafts.set(imageId, fields); else drafts.delete(imageId);
    return { drafts };
  }),
  setDraft: (imageId, fieldId, baseline, value, retain = false) => set(state => {
    const drafts = new Map(state.drafts);
    const fields = new Map(drafts.get(imageId));
    const original = fields.get(fieldId)?.baseline ?? baseline;
    if (value === baseline && !retain) fields.delete(fieldId);
    else fields.set(fieldId, { baseline: original, value, revision: ++nextRevision });
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