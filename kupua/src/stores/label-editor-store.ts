import { createStore } from "zustand/vanilla";
import { createLabelOperation, labelTargetCounts, type LabelEditContext, type LabelIntent, type LabelReceipt } from "@/lib/label-operation";

export function labelTargetKey(targetIds: readonly string[]): string {
  return JSON.stringify([...new Set(targetIds)].sort());
}

interface LabelDraft {
  readonly targetIds: readonly string[];
  readonly value: string;
}

interface LabelEditorState {
  drafts: ReadonlyMap<string, LabelDraft>;
  receipts: readonly LabelReceipt[];
  activityRevision: number;
  activeReceipt: number;
  repeated: boolean;
  setDraft: (targetIds: readonly string[], value: string) => void;
  prepare: (action: LabelIntent["action"], label: string, context: LabelEditContext) => boolean;
  observeSimulated: (index: number, evidence: { imageId: string; label: string; present: boolean }) => boolean;
}

export function createLabelEditorStore(simulate?: Parameters<typeof createLabelOperation>[0]) {
  const operations = new Map<string, ReturnType<typeof createLabelOperation>>();
  const ordered: ReturnType<typeof createLabelOperation>[] = [];
  return createStore<LabelEditorState>((set, get) => ({
    drafts: new Map(),
    receipts: [],
    activityRevision: 0,
    activeReceipt: -1,
    repeated: false,
    setDraft(targetIds, value) {
      const key = labelTargetKey(targetIds);
      const drafts = new Map(get().drafts);
      if (value) drafts.set(key, { targetIds: Object.freeze([...targetIds]), value });
      else drafts.delete(key);
      set({ drafts });
    },
    prepare(action, label, context) {
      const counts = labelTargetCounts(context);
      if (import.meta.env.VITE_USE_MEDIA_API !== "true" || context.pending || !label.trim()
        || !counts.selected || counts.unresolved || counts.ineligible) return false;
      const key = JSON.stringify([action, label.trim(), labelTargetKey(context.targetIds)]);
      const existing = operations.get(key);
      if (existing) {
        set({ activeReceipt: ordered.indexOf(existing), activityRevision: get().activityRevision + 1, repeated: true });
        return true;
      }
      const operation = createLabelOperation(simulate);
      const index = ordered.length;
      operations.set(key, operation);
      ordered.push(operation);
      set({ activeReceipt: index, activityRevision: get().activityRevision + 1, repeated: false });
      operation.subscribe(() => {
        const receipt = operation.getSnapshot();
        if (!receipt) return;
        const receipts = [...get().receipts];
        receipts[index] = receipt;
        set({ receipts });
      });
      void operation.confirm({ action, label, targetIds: context.targetIds }, context.targets);
      return Boolean(operation.getSnapshot());
    },
    observeSimulated(index, evidence) {
      return ordered[index]?.observeSimulated(evidence) ?? false;
    },
  }));
}

export const labelEditorStore = createLabelEditorStore();