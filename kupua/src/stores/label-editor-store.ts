import { createStore } from "zustand/vanilla";
import { createLabelOperation, validLabelIntent, type LabelIntent, type LabelReceipt } from "@/lib/label-operation";
import { captureMetadataEditTargets, metadataEditTargetCounts, nextEditSequence, type MetadataEditContext } from "@/lib/metadata-edit-execution";
import { BATCH_POLICY, createBatchQueue } from "@/lib/batch-execution";
import { hasImageCommandConflict, watchQueuedLabelTargets } from "@/lib/image-read-freshness";

export function labelTargetKey(targetIds: readonly string[]): string {
  return JSON.stringify([...new Set(targetIds)].sort());
}

interface LabelDraft {
  readonly targetIds: readonly string[];
  readonly value: string;
}

interface LabelEditorState {
  executionMode: "simulated" | "connected";
  drafts: ReadonlyMap<string, LabelDraft>;
  receipts: readonly LabelReceipt[];
  activityRevision: number;
  activeReceipt: number;
  repeated: boolean;
  refusal: "multiple-labels" | LabelReceipt["blocked"] | undefined;
  setDraft: (targetIds: readonly string[], value: string) => void;
  prepare: (action: LabelIntent["action"], label: string, context: MetadataEditContext) => boolean;
  prepareLabels: (labels: readonly string[], context: MetadataEditContext) => boolean;
  stopRemaining: (index: number) => void;
  dispose: () => void;
}

export function createLabelEditorStore(simulate?: Parameters<typeof createLabelOperation>[0], observation?: Parameters<typeof createLabelOperation>[1], executionMode: "simulated" | "connected" = "simulated", sharedQueue?: ReturnType<typeof createBatchQueue>) {
  type Operation = Pick<ReturnType<typeof createLabelOperation>, "getSnapshot" | "stopRemaining" | "cancelObservation">;
  const operations = new Map<string, Operation>();
  const ordered: Operation[] = [];
  let disposed = false;
  const connected = Boolean(simulate) && executionMode === "connected";
  const queue = sharedQueue ?? createBatchQueue();
  return createStore<LabelEditorState>((set, get) => ({
    executionMode,
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
      const ids = [...new Set(context.targetIds)];
      if (connected && ids.length > BATCH_POLICY.maxTouchedImages) {
        set({ refusal: "freshness-capacity" });
        return false;
      }
      const counts = metadataEditTargetCounts(context);
      if (import.meta.env.VITE_USE_MEDIA_API !== "true" || context.pending || !label.trim()
        || !counts.selected || counts.unresolved || counts.ineligible || counts.unavailable) return false;
      const key = JSON.stringify([action, action === "remove" ? label : label.trim(), labelTargetKey(context.targetIds)]);
      const existing = operations.get(key);
      const previous = existing?.getSnapshot();
      const settled = executionMode === "connected" && previous && (previous.blocked || previous.items.every(item =>
        item.state === "stopped" || item.state === "rejected" || item.state === "not-started" || item.result?.outcome === "blocked"
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
      const sequence = nextEditSequence();
      if (slot && ids.length > BATCH_POLICY.maxTargets) {
        const release = watchQueuedLabelTargets(ids);
        if (!release) { slot.complete(); set({ refusal: "freshness-capacity" }); return false; }
        const targets = captureMetadataEditTargets(ids, context.targets);
        const intent = { action, label, targetIds: Object.freeze(ids) };
        let receipt: LabelReceipt = { mode: "connected", intent, sequence, counts, items: ids.map(imageId => ({ imageId, state: "queued" })) };
        let child: ReturnType<typeof createLabelOperation> | undefined;
        let stopped = false;
        let waiting = Boolean(slot.wait);
        const publish = (next: LabelReceipt) => {
          receipt = next;
          const receipts = [...get().receipts];
          receipts[index] = receipt;
          set({ receipts });
        };
        const stopUnsent = () => {
          if (receipt.items.some(item => item.state === "queued")) publish({ ...receipt, items: receipt.items.map(item => item.state === "queued" ? { ...item, state: "stopped" } : item) });
        };
        const grouped: Operation = { getSnapshot: () => receipt, stopRemaining: () => { stopped = true; child?.stopRemaining(); stopUnsent(); if (waiting) { release(); slot.complete(); } }, cancelObservation: () => child?.cancelObservation() };
        ordered.push(grouped);
        operations.set(key, grouped);
        set({ activeReceipt: index, activityRevision: get().activityRevision + 1, repeated: false, refusal: undefined });
        publish(receipt);
        void (async () => {
          try {
            if (slot.wait) await slot.wait;
            waiting = false;
            if (stopped) return;
            const current = metadataEditTargetCounts({ targetIds: ids, targets }, true);
            if (current.eligible !== ids.length || ids.some(hasImageCommandConflict)) {
              publish({ ...receipt, blocked: current.eligible !== ids.length ? "capabilities" : "conflict" });
              return;
            }
            for (let offset = 0; !stopped && offset < ids.length; offset += BATCH_POLICY.maxTargets) {
              const group = ids.slice(offset, offset + BATCH_POLICY.maxTargets);
              child = createLabelOperation(simulate, observation, executionMode, { pacing: slot.pacing, captured: true });
              let settle!: () => void;
              const done = new Promise<void>(resolve => { settle = resolve; });
              const unsubscribe = child.subscribe(() => {
                const part = child!.getSnapshot()!;
                const items = receipt.items.slice();
                items.splice(offset, group.length, ...part.items.map(item => part.blocked ? { ...item, admissionRefusal: part.blocked } : item));
                publish({ ...receipt, items, ...(part.blocked && !offset ? { blocked: part.blocked } : {}) });
                if (!part.items.some(item => item.state === "queued" || item.state === "submitted" || item.observation === "pending")) settle();
              });
              try {
                await child.confirm({ ...intent, targetIds: group }, targets);
                await done;
                const part = child.getSnapshot()!;
                if (part.blocked || part.items.some(item => item.state === "stopped" || item.result?.outcome === "blocked" || item.result && "status" in item.result && [401, 419].includes(item.result.status ?? 0))) break;
              } finally { unsubscribe(); child = undefined; }
            }
          } finally { stopUnsent(); release(); slot.complete(); }
        })();
        return !receipt.blocked;
      }
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
        receipts[index] = { ...receipt, sequence };
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
      if (!sharedQueue) queue.dispose();
      for (const operation of ordered) { operation.stopRemaining(); operation.cancelObservation(); }
    },
  }));
}

export const labelEditorStore = createLabelEditorStore();