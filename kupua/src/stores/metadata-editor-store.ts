import { createStore } from "zustand/vanilla";
import { BATCH_POLICY, createBatchQueue } from "@/lib/batch-execution";
import { createMetadataOperation, type MetadataIntent, type MetadataReceipt } from "@/lib/metadata-operation";
import { labelTargetCounts, type LabelObservation, type LabelTarget } from "@/lib/label-operation";
import type { AddLabelsCommand, GridCommandResult, MetadataCommand } from "@/lib/grid-commands";
import { attachedEnrichment } from "./enrichment-store";
import { acceptImageRead, captureImageRead, ensureImageRead, getMetadataWriteWitness, hasImageCommandConflict, watchQueuedLabelTargets } from "@/lib/image-read-freshness";
import { useMetadataDrafts } from "./metadata-drafts-store";

export interface MetadataSave {
  id: number;
  intent: MetadataIntent;
  state: "queued" | "saving" | "finished";
  items: MetadataReceipt["items"];
  excluded: number;
  message?: string;
}

export function metadataIntent(fieldId: string, action: string, value: string | Record<string, string | undefined>, targetIds: readonly string[]): MetadataIntent | undefined {
  const field = fieldId === "keywords" ? "metadata_keywords" : fieldId === "people" ? "metadata_peopleInImage" : fieldId;
  if (field.startsWith("location_")) return { fieldId: "location", action: "overwrite", value: { [field.slice(9)]: value as string }, targetIds };
  if (!["metadata_title", "metadata_description", "metadata_specialInstructions", "metadata_byline", "metadata_credit",
    "metadata_copyright", "metadata_dateTaken", "metadata_imageType", "metadata_keywords", "metadata_peopleInImage", "location"].includes(field)) return;
  if (field === "metadata_dateTaken") {
    if (typeof value !== "string" || !value || !Number.isFinite(Date.parse(value))) return;
    value = new Date(value).toISOString();
  }
  return { fieldId: field as MetadataCommand["fieldId"], action: action as MetadataCommand["action"], value, targetIds };
}

export function metadataSaveStatus(save: MetadataSave): string {
  if (save.message) return save.message;
  const observed = save.items.filter(item => item.observation === "observed").length;
  const unknown = save.items.filter(item => item.state === "unknown").length;
  const superseded = save.items.filter(item => item.observation === "superseded").length;
  const rejected = save.items.filter(item => item.state === "rejected" || item.result?.outcome === "blocked").length;
  return `${save.state === "queued" ? "Queued" : save.state === "saving" ? "Saving" : "Finished"}: ${observed}/${save.intent.targetIds.length} visible`
    + (unknown ? `; ${unknown} uncertain` : "") + (rejected ? `; ${rejected} not saved` : "")
    + (superseded ? `; ${superseded} superseded` : "")
    + (save.excluded ? `; ${save.excluded} excluded` : "");
}

export function createMetadataEditorStore(
  execute?: (command: MetadataCommand | AddLabelsCommand) => Promise<GridCommandResult>,
  observation?: LabelObservation,
  sharedQueue?: ReturnType<typeof createBatchQueue>,
) {
  const queue = sharedQueue ?? createBatchQueue();
  let disposed = false;
  let pumping = false;
  let nextId = 0;
  const pending: number[] = [];
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const capturedDrafts = new Map<number, { imageId: string; fieldId: string; revision: number }>();
  const submittedDrafts = new Map<string, number>();
  const running = new Map<number, ReturnType<typeof createMetadataOperation>>();
  const stopped = new Set<number>();
  const reservations = new Map<number, () => void>();
  const keyFor = (imageId: string, fieldId: string) => JSON.stringify([imageId, fieldId]);
  const store = createStore<{
    connected: boolean;
    saves: ReadonlyMap<number, MetadataSave>;
    arrowSaves: ReadonlyMap<string, number>;
    submitArrow: (intent: MetadataIntent, key: string) => void;
    submit: (intent: MetadataIntent, newRevision?: boolean) => number | undefined;
    schedule: (imageId: string, fieldId: string) => void;
    flush: (imageId: string, fieldId: string) => void;
    pause: (imageId: string, fieldId: string) => void;
    stop: (id: number) => void;
    dispose: () => void;
  }>((set, get) => ({
    connected: Boolean(execute && observation), saves: new Map(), arrowSaves: new Map(),
    submitArrow(intent, key) {
      const id = get().submit(intent);
      if (id !== undefined) set({ arrowSaves: new Map(get().arrowSaves).set(key, id) });
    },
    submit(input, newRevision = false) {
      if (!execute || !observation || disposed || !input.targetIds.length) return;
      const targetIds = [...new Set(input.targetIds)];
      const intent: MetadataIntent = input.fieldId === "labels" ? { ...input, targetIds }
        : { ...input, targetIds, value: typeof input.value === "string" ? input.value : { ...input.value } };
      if (!newRevision) {
        const targets = new Set(targetIds);
        const latest = [...get().saves.values()].findLast(save => save.intent.fieldId === intent.fieldId
          && save.intent.targetIds.some(id => targets.has(id)));
        if (latest && latest.state !== "finished" && JSON.stringify(latest.intent) === JSON.stringify(intent)) return latest.id;
      }
      const id = ++nextId;
      const release = watchQueuedLabelTargets(intent.targetIds);
      if (!release) {
        set({ saves: new Map(get().saves).set(id, { id, intent, state: "finished", items: [], excluded: 0,
          message: "Not sent: session editing capacity reached. Reload before starting this action." }) });
        return id;
      }
      reservations.set(id, release);
      set({ saves: new Map(get().saves).set(id, { id, intent, state: "queued", items: [], excluded: 0 }) });
      pending.push(id);
      queueMicrotask(() => void pump());
      return id;
    },
    pause(imageId, fieldId) {
      const key = keyFor(imageId, fieldId);
      clearTimeout(timers.get(key));
      timers.delete(key);
    },
    schedule(imageId, fieldId) {
      get().pause(imageId, fieldId);
      if (get().connected) timers.set(keyFor(imageId, fieldId), setTimeout(() => get().flush(imageId, fieldId), 600));
    },
    flush(imageId, fieldId) {
      get().pause(imageId, fieldId);
      const draft = useMetadataDrafts.getState().drafts.get(imageId)?.get(fieldId);
      if (!draft) return;
      const key = keyFor(imageId, fieldId);
      if (submittedDrafts.get(key) === draft.revision) return;
      const intent = metadataIntent(fieldId, "overwrite", draft.value, [imageId]);
      if (!intent) return;
      for (const [id, captured] of capturedDrafts) {
        const save = get().saves.get(id);
        const unsent = save?.state === "queued" || save?.state === "saving" && save.items.every(item => item.state === "queued");
        if (captured.imageId === imageId && captured.fieldId === fieldId && unsent) get().stop(id);
      }
      const id = get().submit(intent, true);
      if (id !== undefined) {
        capturedDrafts.set(id, { imageId, fieldId, revision: draft.revision });
        submittedDrafts.set(key, draft.revision);
      }
    },
    stop(id) {
      stopped.add(id);
      running.get(id)?.stopTargets(get().saves.get(id)!.intent.targetIds);
      if (get().saves.get(id)?.state === "queued") {
        reservations.get(id)?.(); reservations.delete(id);
        update(id, { state: "finished", message: "Stopped; changes not sent" });
      }
    },
    dispose() {
      disposed = true;
      unsubscribe();
      for (const timer of timers.values()) clearTimeout(timer);
      for (const operation of new Set(running.values())) { operation.stopRemaining(); operation.cancelObservation(); }
      for (const release of reservations.values()) release();
      reservations.clear();
      if (!sharedQueue) queue.dispose();
    },
  }));
  const unsubscribe = queue.subscribe(() => void pump());

  function update(id: number, patch: Partial<MetadataSave>) {
    store.setState(state => ({ saves: new Map(state.saves).set(id, { ...state.saves.get(id)!, ...patch }) }));
  }

  async function pump() {
    if (pumping || disposed || !execute || !observation) return;
    while (pending.length && stopped.has(pending[0])) pending.shift();
    const id = pending[0];
    if (id === undefined) return;
    const slot = queue.admit();
    if (!slot) return;
    pumping = true;
    pending.shift();
    const save = store.getState().saves.get(id)!;
    const group = [save];
    const progress = new Map<number, { items: MetadataReceipt["items"]; excluded: number }>();
    let dispatchReleased = false;
    const releaseDispatch = () => {
      if (dispatchReleased) return;
      dispatchReleased = true;
      slot.dispatched();
      pumping = false;
      queueMicrotask(() => void pump());
    };
    try {
      await slot.wait;
      if (disposed || stopped.has(id)) return;
      const unique = new Set(save.intent.targetIds);
      if (unique.size === 1 && !hasImageCommandConflict(save.intent.targetIds[0])) {
        while (pending.length && group.length < BATCH_POLICY.maxTargets) {
          const candidate = store.getState().saves.get(pending[0])!;
          if (stopped.has(candidate.id)) { pending.shift(); continue; }
          const targets = candidate.intent.targetIds;
          if (targets.length !== 1 || unique.has(targets[0]) || hasImageCommandConflict(targets[0])) break;
          pending.shift();
          group.push(candidate);
          unique.add(targets[0]);
        }
      }
      for (const member of group) progress.set(member.id, { items: [], excluded: 0 });
      const owners = new Map(group.flatMap(member => member.intent.targetIds.map(imageId => [imageId, member] as const)));
      const allIds = [...owners.keys()];
      store.setState(state => ({ saves: new Map([...state.saves].map(([saveId, value]) => [saveId,
        progress.has(saveId) ? { ...value, state: "saving" as const } : value])) }));
      for (let offset = 0; offset < allIds.length && !disposed; offset += BATCH_POLICY.maxTargets) {
        const ids = allIds.slice(offset, offset + BATCH_POLICY.maxTargets).filter(imageId => !stopped.has(owners.get(imageId)!.id));
        if (!ids.length) continue;
        const issued = captureImageRead();
        const images = await observation.readImages([...ids], AbortSignal.timeout(BATCH_POLICY.commandTimeoutMs));
        if (disposed) break;
        const targets = new Map<string, LabelTarget>();
        for (const image of images) {
          if (!ids.includes(image.id) || stopped.has(owners.get(image.id)!.id)) continue;
          const overlay = attachedEnrichment(image);
          ensureImageRead(image, issued, "lean", overlay);
          if (acceptImageRead(image) !== image) continue;
          const target = { resource: overlay?.resource };
          if (labelTargetCounts({ targetIds: [image.id], targets: new Map([[image.id, target]]) }).eligible) targets.set(image.id, target);
        }
        for (const imageId of ids) {
          const owner = owners.get(imageId)!;
          if (!targets.has(imageId) && !stopped.has(owner.id)) progress.get(owner.id)!.excluded++;
        }
        if (!targets.size) continue;
        const intents = new Map([...targets.keys()].map(imageId => [imageId, owners.get(imageId)!.intent]));
        const operation = createMetadataOperation(execute, observation, {
          pacing: slot.pacing, continueAfterLocalBlock: group.length > 1,
          dispatchConcurrency: group.length === 1 && save.intent.fieldId !== "labels" && allIds.length > 1 ? 5 : undefined,
        }, intents);
        for (const member of group) running.set(member.id, operation);
        let finish!: () => void;
        const done = new Promise<void>(resolve => { finish = resolve; });
        const release = operation.subscribe(() => {
          const receipt = operation.getSnapshot()!;
          store.setState(state => {
            const saves = new Map(state.saves);
            for (const member of group) {
              const own = progress.get(member.id)!;
              const items = [...own.items, ...receipt.items.filter(item => owners.get(item.imageId)?.id === member.id)];
              saves.set(member.id, { ...saves.get(member.id)!, items, excluded: own.excluded,
                ...(receipt.blocked ? { message: `Not sent: ${receipt.blocked}` } : {}) });
            }
            return { saves };
          });
          if (!receipt.items.some(item => item.state === "queued" || item.state === "submitted" || item.observation === "pending")) finish();
        });
        await operation.confirm({ ...save.intent, targetIds: [...targets.keys()] }, targets);
        if (!disposed && offset + BATCH_POLICY.maxTargets >= allIds.length
          && operation.getSnapshot()!.items.every(item => intents.get(item.imageId)?.fieldId !== "labels"
            && (item.result?.outcome === "acknowledged" || item.result?.outcome === "unchanged")
            && typeof getMetadataWriteWitness(item.imageId) === "string")) releaseDispatch();
        await done;
        release();
        for (const member of group) running.delete(member.id);
        const receipt = operation.getSnapshot()!;
        for (const item of receipt.items) {
          const own = progress.get(owners.get(item.imageId)!.id)!;
          own.items = [...own.items, item];
        }
        if (receipt.blocked || receipt.items.some(item => item.result?.outcome === "blocked" || item.state === "stopped" && !stopped.has(owners.get(item.imageId)!.id)
          || item.result && "status" in item.result && [401, 419].includes(item.result.status ?? 0))) break;
      }
      store.setState(state => {
        const saves = new Map(state.saves);
        for (const member of group) saves.set(member.id, { ...saves.get(member.id)!, ...progress.get(member.id)!, state: "finished",
          ...(stopped.has(member.id) ? { message: "Stopped remaining; submitted outcomes retained" } : {}) });
        return { saves };
      });
      for (const member of group) {
        const { items } = progress.get(member.id)!;
        const draft = capturedDrafts.get(member.id);
        if (draft && items.length === 1 && ["acknowledged", "unchanged"].includes(items[0].result?.outcome ?? "") && items[0].observation === "observed") {
          useMetadataDrafts.getState().clearDraft(draft.imageId, draft.fieldId, draft.revision);
        }
        capturedDrafts.delete(member.id);
      }
    } catch {
      for (const member of group) update(member.id, { state: "finished", message: "Save unavailable; no automatic retry" });
    } finally {
      for (const member of group) { reservations.get(member.id)?.(); reservations.delete(member.id); }
      slot.complete();
      releaseDispatch();
    }
  }
  return store;
}

export const metadataEditorStore = createMetadataEditorStore();