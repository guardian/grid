import { createStore } from "zustand/vanilla";
import { createLabelOperation, validLabelIntent, type LabelIntent, type LabelReceipt } from "@/lib/label-operation";
import { captureMetadataEditTargets, metadataEditTargetCounts, nextEditSequence, sessionStopReason, type MetadataEditContext } from "@/lib/metadata-edit-execution";
import { BATCH_POLICY, createBatchQueue, editEffect } from "@/lib/batch-execution";
import { invalidateGridSession, isGridSessionInvalidated } from "@/lib/grid-api-instance";
import { hasImageCommandConflict, watchQueuedLabelTargets } from "@/lib/image-read-freshness";
import { addressableLabel } from "@/lib/grid-mutation-policy";

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
  prepare: (action: LabelIntent["action"], label: string, context: MetadataEditContext, additionalLabels?: readonly string[]) => boolean;
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
  const readback = connected && observation ? { ...observation, onReadError(error: unknown) {
    const classified = observation.onReadError?.(error);
    if (!classified && !(error && typeof error === "object" && "status" in error && (error.status === 401 || error.status === 419))) return false;
    invalidateGridSession();
    return true;
  } } : observation;
  const execute: typeof simulate = connected && simulate ? async command => isGridSessionInvalidated()
    ? { outcome: "blocked", reason: "reload-required" } : disposed ? { outcome: "blocked", reason: "disabled" } : simulate(command) : simulate;
  const haltReason = (receipt: LabelReceipt) => {
    if (isGridSessionInvalidated() || receipt.items.some(item => item.reloadRequired)) return "reload-required";
    for (const item of receipt.items) {
      const reason = sessionStopReason(item.result);
      if (reason) return reason;
    }
    if (disposed) return "disabled";
  };
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
      if (connected && labels.length > 1) return get().prepare("add", labels[0], context, labels.slice(1));
      if (simulate && labels.length !== 1) {
        set({ refusal: "multiple-labels" });
        return false;
      }
      return labels.length > 0 && labels.every(label => get().prepare("add", label, context));
    },
    prepare(action, label, context, additionalLabels) {
      if (additionalLabels && (action !== "add" || ![label, ...additionalLabels].every(addressableLabel))) return false;
      const extra = additionalLabels?.length ? { additionalLabels: Object.freeze([...additionalLabels]) } : {};
      if (disposed || !validLabelIntent({ action, label, targetIds: context.targetIds })) return false;
      const ids = [...new Set(context.targetIds)];
      if (connected && ids.length > BATCH_POLICY.maxTouchedImages) {
        set({ refusal: "freshness-capacity" });
        return false;
      }
      const counts = metadataEditTargetCounts(context);
      if (import.meta.env.VITE_USE_MEDIA_API !== "true" || context.pending || !label.trim()
        || !counts.selected || counts.unresolved || counts.ineligible || counts.unavailable) return false;
      const key = JSON.stringify([action, additionalLabels ? [label, ...additionalLabels].sort() : action === "remove" ? label : label.trim(), labelTargetKey(context.targetIds)]);
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
      const sequence = nextEditSequence();
      const effect = editEffect("labels");
      const slot = connected ? queue.admit(ids.length === 1 ? {
        imageId: ids[0], effect, sequence, conflicted: () => hasImageCommandConflict(ids[0]),
      } : { sequence }) : undefined;
      if (connected && !slot) {
        set({ refusal: "busy" });
        return false;
      }
      const index = ordered.length;
      if (slot && ids.length > BATCH_POLICY.maxTargets) {
        const release = watchQueuedLabelTargets(ids);
        if (!release) { slot.complete(); set({ refusal: "freshness-capacity" }); return false; }
        const targets = captureMetadataEditTargets(ids, context.targets);
        const intent = { action, label, ...extra, targetIds: Object.freeze(ids) };
        let receipt: LabelReceipt = { mode: "connected", intent, sequence, counts, items: ids.map(imageId => ({ imageId, state: "queued" })) };
        let child: ReturnType<typeof createLabelOperation> | undefined;
        let stopped = false;
        let halt: ReturnType<typeof sessionStopReason>;
        const parent = { ids: new Set(ids), effect };
        let waiting = Boolean(slot.wait);
        const publish = (next: LabelReceipt) => {
          receipt = next;
          const receipts = [...get().receipts];
          receipts[index] = receipt;
          set({ receipts });
        };
        const stopUnsent = () => {
          if (receipt.items.some(item => item.state === "queued")) publish({ ...receipt, items: receipt.items.map(item => item.state !== "queued" ? item : halt
            ? { ...item, state: "not-started", result: { outcome: "blocked", reason: halt } } : { ...item, state: "stopped" }) });
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
            if (disposed) { halt = "disabled"; return; }
            if (stopped) return;
            if (isGridSessionInvalidated()) { halt = "reload-required"; return; }
            const current = metadataEditTargetCounts({ targetIds: ids, targets }, true);
            if (current.eligible !== ids.length || ids.some(hasImageCommandConflict)) {
              publish({ ...receipt, blocked: current.eligible !== ids.length ? "capabilities" : "conflict" });
              return;
            }
            for (let offset = 0; !stopped && offset < ids.length; offset += BATCH_POLICY.maxTargets) {
              const group = ids.slice(offset, offset + BATCH_POLICY.maxTargets);
              child = createLabelOperation(execute, readback, executionMode, { pacing: slot.pacing, captured: true });
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
                halt = haltReason(part);
                if (halt || stopped || part.blocked || part.items.some(item => item.state === "stopped" || item.result?.outcome === "blocked")) break;
              } finally { unsubscribe(); child = undefined; }
              if (offset + group.length < ids.length) {
                const loan = queue.lendWaiting(slot, parent);
                if (loan) halt = await loan;
                if (isGridSessionInvalidated()) halt = "reload-required";
                if (halt) break;
              }
            }
          } finally { stopUnsent(); release(); slot.complete(halt); }
        })();
        return !receipt.blocked;
      }
      let releaseReservation: (() => void) | undefined;
      if (slot?.wait && observation) {
        releaseReservation = watchQueuedLabelTargets(context.targetIds);
        if (!releaseReservation) { slot.complete(); set({ refusal: "freshness-capacity" }); return false; }
      }
      const wait = slot?.wait?.then(() => {
        releaseReservation?.();
        if (disposed) operation.stopRemaining();
      });
      const operation = createLabelOperation(execute, readback, executionMode, slot ? { wait, pacing: slot.pacing } : undefined);
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
          slot.complete(haltReason(receipt));
        }
      });
      void operation.confirm({ action, label, ...extra, targetIds: context.targetIds }, context.targets);
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