import { createStore } from "zustand/vanilla";
import { createLabelOperation, labelTargetCounts, validLabelIntent, type LabelEditContext, type LabelIntent, type LabelReceipt } from "@/lib/label-operation";
import { BATCH_POLICY, createBatchQueue } from "@/lib/batch-execution";
import { watchQueuedLabelTargets } from "@/lib/image-read-freshness";

export function labelTargetKey(targetIds: readonly string[]): string {
  return JSON.stringify([...new Set(targetIds)].sort());
}

interface LabelDraft {
  readonly targetIds: readonly string[];
  readonly value: string;
}

interface LabelEditorState {
  executionMode: "simulated" | "connected";
  targetLimit: number | undefined;
  drafts: ReadonlyMap<string, LabelDraft>;
  receipts: readonly LabelReceipt[];
  activityRevision: number;
  activeReceipt: number;
  repeated: boolean;
  refusal: "multiple-labels" | LabelReceipt["blocked"] | undefined;
  setDraft: (targetIds: readonly string[], value: string) => void;
  prepare: (action: LabelIntent["action"], label: string, context: LabelEditContext) => boolean;
  prepareLabels: (labels: readonly string[], context: LabelEditContext) => boolean;
  stopRemaining: (index: number) => void;
  dispose: () => void;
}

export function createLabelEditorStore(simulate?: Parameters<typeof createLabelOperation>[0], observation?: Parameters<typeof createLabelOperation>[1], executionMode: "simulated" | "connected" = "simulated") {
  const operations = new Map<string, ReturnType<typeof createLabelOperation>>();
  const ordered: ReturnType<typeof createLabelOperation>[] = [];
  let disposed = false;
  const connected = Boolean(simulate) && executionMode === "connected";
  const queue = createBatchQueue();
  return createStore<LabelEditorState>((set, get) => ({
    executionMode,
    targetLimit: connected ? BATCH_POLICY.maxTargets : undefined,
    drafts: new Map(),
    receipts: [],
    activityRevision: 0,
    activeReceipt: -1,
    repeated: false,
    refusal: undefined,
    setDraft(targetIds, value) {
      const key = labelTargetKey(targetIds);
      const drafts = new Map(get().drafts);
      if (value) drafts.set(key, { targetIds: Object.freeze([...targetIds]), value });
      else drafts.delete(key);
      set({ drafts, refusal: undefined });
    },
    prepareLabels(labels, context) {
      if (simulate && labels.length !== 1) {
        set({ refusal: "multiple-labels" });
        return false;
      }
      return labels.length > 0 && labels.every(label => get().prepare("add", label, context));
    },
    prepare(action, label, context) {
      if (disposed || !validLabelIntent({ action, label, targetIds: context.targetIds })) return false;
      if (connected && new Set(context.targetIds).size > BATCH_POLICY.maxTargets) {
        set({ refusal: "target-limit" });
        return false;
      }
      const counts = labelTargetCounts(context);
      if (import.meta.env.VITE_USE_MEDIA_API !== "true" || context.pending || !label.trim()
        || !counts.selected || counts.unresolved || counts.ineligible || counts.unavailable) return false;
      const key = JSON.stringify([action, action === "remove" ? label : label.trim(), labelTargetKey(context.targetIds)]);
      const existing = operations.get(key);
      const previous = existing?.getSnapshot();
      const settled = executionMode === "connected" && previous && (previous.blocked || previous.items.every(item =>
        item.state === "stopped" || item.state === "rejected" || item.result?.outcome === "blocked"
          || (item.state === "accepted-awaiting-visibility" || item.state === "unchanged")
            && item.observation !== undefined && item.observation !== "pending"));
      if (existing && !settled) {
        set({ activeReceipt: ordered.indexOf(existing), activityRevision: get().activityRevision + 1, repeated: true });
        return !existing.getSnapshot()?.blocked;
      }
      const slot = connected ? queue.admit() : undefined;
      if (connected && !slot) {
        set({ refusal: "busy" });
        return false;
      }
      const index = ordered.length;
      let releaseReservation: (() => void) | undefined;
      if (slot?.wait && observation) {
        releaseReservation = watchQueuedLabelTargets(context.targetIds);
        if (!releaseReservation) { slot.complete(); set({ refusal: "freshness-capacity" }); return false; }
      }
      const wait = slot?.wait?.then(() => { releaseReservation?.(); });
      const operation = createLabelOperation(simulate, observation, executionMode, slot ? { wait, pacing: slot.pacing } : undefined);
      operations.set(key, operation);
      ordered.push(operation);
      set({ activeReceipt: index, activityRevision: get().activityRevision + 1, repeated: false });
      operation.subscribe(() => {
        const receipt = operation.getSnapshot();
        if (!receipt) return;
        const receipts = [...get().receipts];
        receipts[index] = receipt;
        set({ receipts });
        if (slot && !receipt.items.some(item => item.state === "queued"
          || item.state === "submitted" || item.observation === "pending")) {
          slot.complete();
        }
      });
      void operation.confirm({ action, label, targetIds: context.targetIds }, context.targets);
      const receipt = operation.getSnapshot();
      set({ refusal: receipt?.blocked });
      return Boolean(receipt && !receipt.blocked);
    },
    stopRemaining(index) {
      ordered[index]?.stopRemaining();
    },
    dispose() {
      disposed = true;
      queue.dispose();
      for (const operation of ordered) { operation.stopRemaining(); operation.cancelObservation(); }
    },
  }));
}

export const labelEditorStore = createLabelEditorStore();