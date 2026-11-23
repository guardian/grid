import { createStore } from "zustand/vanilla";
import { pillCommandField, SUBJECTS } from "@/lib/metadata-pill-fields";
import { BATCH_POLICY, createBatchQueue } from "@/lib/batch-execution";
import { createMetadataOperation, type MetadataIntent, type MetadataReceipt } from "@/lib/metadata-operation";
import { metadataEditTargetCounts, nextEditSequence, sessionStopReason, type MetadataEditObservation, type MetadataEditTarget } from "@/lib/metadata-edit-execution";
import { rightsValueSchema, type GridCommandResult, type MetadataCommand } from "@/lib/grid-commands";
import { leaseChangeSchema, type LeaseChange } from "@/lib/lease-change";
import { attachedEnrichment } from "./enrichment-store";
import { acceptImageRead, captureImageRead, ensureImageRead, getMetadataWriteWitness, hasImageCommandConflict, watchQueuedLabelTargets } from "@/lib/image-read-freshness";
import { useMetadataDrafts } from "./metadata-drafts-store";

const publisherFields = ["metadata_byline", "metadata_credit", "metadata_imageType"];

export interface MetadataSave {
  id: number;
  sequence?: number;
  intent: MetadataIntent;
  state: "queued" | "saving" | "finished";
  items: MetadataReceipt["items"];
  excluded: number;
  message?: string;
}

export function metadataIntent(fieldId: string, action: string, value: string | string[] | Record<string, string | undefined> | LeaseChange, targetIds: readonly string[], removed?: string[]): MetadataIntent | undefined {
  if (Array.isArray(value)) {
    if (fieldId === "subjects" && action === "add" && (value.length || removed?.length) && [...value, ...(removed ?? [])].every(subject => SUBJECTS.includes(subject)))
      return { fieldId: "metadata_subjects", action, value, removed, targetIds };
    if (action !== "overwrite" || value.some(item => !item.trim())) return;
    if (fieldId === "labels") return { fieldId, action: value.length ? "add" : "overwrite", value, targetIds };
    if (fieldId !== "people" && fieldId !== "keywords" && fieldId !== "subjects") return;
    return { fieldId: pillCommandField(fieldId) as MetadataCommand["fieldId"], action: value.length ? "add" : "overwrite",
      value: fieldId === "subjects" ? value.filter(subject => SUBJECTS.includes(subject)) : value, targetIds };
  }
  if (fieldId === "leases" && action === "overwrite") {
    const change = leaseChangeSchema.safeParse(value);
    return change.success ? { fieldId, action, value: change.data, targetIds } : undefined;
  }
  if (typeof value !== "string" && "kind" in value) return;
  if (fieldId === "usageRights_category" && action === "overwrite") {
    const rights = rightsValueSchema.safeParse(value);
    return rights.success ? { fieldId, action, value: rights.data, targetIds } : undefined;
  }
  if (fieldId === "labels" && (action === "add" || action === "remove") && typeof value === "string" && value.trim()) return { fieldId, action, value: action === "remove" ? value : value.trim(), targetIds };
  const field = pillCommandField(fieldId);
  if (field === "metadata_subjects" && (typeof value !== "string" || !(action === "remove" || action === "add" && SUBJECTS.includes(value)))) return;
  if (field.startsWith("location_")) return { fieldId: "location", action: "overwrite", value: { [field.slice(9)]: value as string }, targetIds };
  if (!["metadata_title", "metadata_description", "metadata_specialInstructions", "metadata_byline", "metadata_credit",
    "metadata_copyright", "metadata_dateTaken", "metadata_imageType", "metadata_keywords", "metadata_peopleInImage", "metadata_subjects", "location"].includes(field)) return;
  if (field === "metadata_dateTaken") {
    if (typeof value !== "string" || !value || !Number.isFinite(Date.parse(value))) return;
    value = new Date(value).toISOString();
  }
  return { fieldId: field as MetadataCommand["fieldId"], action: action as MetadataCommand["action"], value, targetIds };
}

export function metadataSaveStatus(save: MetadataSave): string {
  if (save.message) return save.message;
  const observed = save.items.filter(item => item.observation === "observed" && !(item.result && "labelSteps" in item.result && item.result.labelSteps)).length;
  const steps = { acknowledged: 0, rejected: 0, uncertain: 0, notSent: 0 };
  for (const { result } of save.items) {
    if (!result || !("labelSteps" in result) || !result.labelSteps) continue;
    for (const key of ["acknowledged", "rejected", "uncertain", "notSent"] as const) steps[key] += result.labelSteps[key];
  }
  const stepSummary = [steps.acknowledged && `${steps.acknowledged} acknowledged`, steps.rejected && `${steps.rejected} rejected`,
    steps.uncertain && `${steps.uncertain} uncertain`, steps.notSent && `${steps.notSent} not sent`].filter(Boolean).join(" · ");
  const unknown = save.items.filter(item => item.state === "unknown").length;
  const superseded = save.items.filter(item => item.observation === "superseded").length;
  const rejected = save.items.filter(item => item.state === "rejected" || item.result?.outcome === "blocked").length;
  const derived = save.items.flatMap(item => item.result?.outcome === "acknowledged" && item.result.metadataFromRights ? [item.result.metadataFromRights] : []);
  const notSaved = derived.filter(state => state === "rejected" || state === "not-sent").length;
  const notConfirmed = derived.filter(state => state === "unknown").length;
  return `${save.state === "queued" ? "Queued" : save.state === "saving" ? "Saving" : "Finished"}: ${observed}/${save.intent.targetIds.length} visible`
    + (unknown ? `; ${unknown} uncertain` : "") + (rejected ? `; ${rejected} not saved` : "")
    + (superseded ? `; ${superseded} superseded` : "")
    + (save.excluded ? `; ${save.excluded} excluded` : "")
    + (save.items.some(item => item.result?.outcome === "blocked" && item.result.reason === "unaddressable-label") ? "; An existing label cannot be removed by Grid's member URL" : "")
    + (stepSummary ? `; Interrupted label steps: ${stepSummary}` : "")
    + (notSaved || notConfirmed ? `; Metadata from rights: ${[notSaved && `${notSaved} not saved`, notConfirmed && `${notConfirmed} not confirmed`].filter(Boolean).join(" · ")}` : "");
}

export function createMetadataEditorStore(
  execute?: (command: import("@/lib/metadata-operation").EditorCommand) => Promise<GridCommandResult>,
  observation?: MetadataEditObservation,
  sharedQueue?: ReturnType<typeof createBatchQueue>,
) {
  const queue = sharedQueue ?? createBatchQueue();
  let disposed = false;
  let pumping = false;
  let waiting: { id: number; complete: () => void } | undefined;
  let nextId = 0;
  const pending: number[] = [];
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const capturedDrafts = new Map<number, { imageId: string; fieldId: string; revision: number }>();
  const submittedDrafts = new Map<string, number>();
  const deferredDrafts = new Map<string, number>();
  const running = new Map<number, ReturnType<typeof createMetadataOperation>>();
  const stopped = new Set<number>();
  const reservations = new Map<number, () => void>();
  const pillSources = new Map<number, string>();
  const pillApplications = new Map<number, { key: string; captured: readonly string[] }>();
  const keyFor = (imageId: string, fieldId: string) => JSON.stringify([imageId, fieldId]);
  const latestSingle = new Map<string, number>();
  const pendingByField = new Map<string, Set<number>>();
  const keysFor = (intent: MetadataIntent) => intent.targetIds.flatMap(id => (intent.fieldId === "location" && typeof intent.value === "object"
    ? Object.keys(intent.value).map(component => `location_${component}`) : [intent.fieldId]).map(field => keyFor(id, field)));
  const store = createStore<{
    connected: boolean;
    latestSingle: (imageId: string, field: string) => MetadataSave | undefined;
    hasPendingField: (imageId: string, field: string) => boolean;
    pendingFieldIds: (imageId: string, field: string) => Iterable<number>;
    saves: ReadonlyMap<number, MetadataSave>;
    derivedOwners: ReadonlyMap<string, number>;
    formRightsSaves: ReadonlyMap<string, { id: number; revision: number; superseded?: boolean }>;
    formLeaseSaves: ReadonlyMap<string, { id: number; revision: number }>;
    trackFormLease: (imageId: string, id: number, revision: number) => void;
    trackFormRights: (imageId: string, id: number, revision: number) => void;
    panelSaves: readonly { id: number; targetKey: string; returnFocus?: WeakRef<HTMLElement> }[];
    arrowSaves: ReadonlyMap<string, number>;
    removedPills: ReadonlyMap<string, readonly string[]>;
    submitArrow: (intent: MetadataIntent, key: string) => void;
    submit: (intent: MetadataIntent, newRevision?: boolean, pillSource?: string) => number | undefined;
    schedule: (imageId: string, fieldId: string) => void;
    deferDraft: (imageId: string, fieldId: string) => void;
    settleDraftGrant: (imageId: string, fieldId: string, granted: boolean) => void;
    flush: (imageId: string, fieldId: string) => void;
    pause: (imageId: string, fieldId: string) => void;
    stop: (id: number) => void;
    dispose: () => void;
  }>((set, get) => ({
    connected: Boolean(execute && observation), saves: new Map(), derivedOwners: new Map(), panelSaves: [], arrowSaves: new Map(),
    formRightsSaves: new Map(), formLeaseSaves: new Map(), removedPills: new Map(),
    trackFormLease(imageId, id, revision) { set(state => ({ formLeaseSaves: new Map(state.formLeaseSaves).set(imageId, { id, revision }) })); },
    trackFormRights(imageId, id, revision) { set(state => ({ formRightsSaves: new Map(state.formRightsSaves).set(imageId, { id, revision }) })); },
    latestSingle: (imageId, field) => get().saves.get(latestSingle.get(keyFor(imageId, field)) ?? -1),
    pendingFieldIds: (imageId, field) => pendingByField.get(keyFor(imageId, field)) ?? [],
    hasPendingField: (imageId, field) => {
      const owners = pendingByField.get(keyFor(imageId, field));
      if (owners) for (const owner of owners) if (get().saves.get(owner)?.state !== "finished") return true;
      return false;
    },
    submitArrow(intent, key) {
      const id = get().submit(intent);
      const captured = get().removedPills.get(key);
      if (id !== undefined && captured && get().saves.get(id)?.state !== "finished") pillApplications.set(id, { key, captured });
      if (id !== undefined) set({ arrowSaves: new Map(get().arrowSaves).set(key, id) });
    },
    submit(input, newRevision = false, pillSource) {
      if (!execute || !observation || disposed || !input.targetIds.length) return;
      const targetIds = [...new Set(input.targetIds)];
      const intent: MetadataIntent = input.fieldId === "leases" ? { ...input, targetIds, value: structuredClone(input.value) } : input.fieldId === "usageRights_category" ? { ...input, targetIds, value: { ...input.value } } : input.fieldId === "labels" ? { ...input, targetIds, value: Array.isArray(input.value) ? [...input.value] : input.value }
        : { ...input, targetIds, value: typeof input.value === "string" ? input.value : Array.isArray(input.value) ? [...input.value] : { ...input.value } };
      if (!newRevision) {
        const targets = new Set(targetIds);
        const latest = [...get().saves.values()].findLast(save => save.intent.fieldId === intent.fieldId
          && save.intent.targetIds.some(id => targets.has(id)));
        if (latest && latest.state !== "finished" && JSON.stringify(latest.intent) === JSON.stringify(intent)) return latest.id;
      }
      const id = ++nextId;
      const sequence = nextEditSequence();
      if (targetIds.length === 1) for (const key of keysFor(intent)) latestSingle.set(key, id);
      const release = watchQueuedLabelTargets(intent.targetIds);
      if (!release) {
        set({ saves: new Map(get().saves).set(id, { id, intent, sequence, state: "finished", items: [], excluded: 0,
          message: "Not sent: session editing capacity reached. Reload before starting this action." }) });
        return id;
      }
      const keys = keysFor(intent);
      if (intent.fieldId === "usageRights_category" && ["publisher-photography", "publisher-illustration"].includes(intent.value.category)) {
        for (const imageId of targetIds) for (const field of publisherFields) keys.push(keyFor(imageId, field));
      }
      for (const key of keys) {
        const owners = pendingByField.get(key) ?? new Set<number>();
        owners.add(id); pendingByField.set(key, owners);
      }
      reservations.set(id, () => {
        pillSources.delete(id); pillApplications.delete(id);
        for (const key of keys) {
          const owners = pendingByField.get(key);
          owners?.delete(id); if (!owners?.size) pendingByField.delete(key);
        }
        release();
      });
      if (pillSource) pillSources.set(id, pillSource);
      if (get().derivedOwners.size) {
        const keys = intent.fieldId === "usageRights_category" ? publisherFields : [intent.fieldId];
        const affected = targetIds.flatMap(imageId => keys.map(field => keyFor(imageId, field))).filter(key => get().derivedOwners.has(key));
        if (affected.length) { const owners = new Map(get().derivedOwners); affected.forEach(key => owners.delete(key)); set({ derivedOwners: owners }); }
      }
      set({ saves: new Map(get().saves).set(id, { id, intent, sequence, state: "queued", items: [], excluded: 0 }) });
      pending.push(id);
      queueMicrotask(() => void pump());
      return id;
    },
    pause(imageId, fieldId) {
      const key = keyFor(imageId, fieldId);
      clearTimeout(timers.get(key));
      timers.delete(key);
    },
    deferDraft(imageId, fieldId) {
      get().pause(imageId, fieldId);
      const revision = useMetadataDrafts.getState().drafts.get(imageId)?.get(fieldId)?.revision;
      if (revision !== undefined) deferredDrafts.set(keyFor(imageId, fieldId), revision);
    },
    settleDraftGrant(imageId, fieldId, granted) {
      const key = keyFor(imageId, fieldId), revision = deferredDrafts.get(key);
      if (revision === undefined) return;
      deferredDrafts.delete(key);
      if (granted && useMetadataDrafts.getState().drafts.get(imageId)?.get(fieldId)?.revision === revision) get().schedule(imageId, fieldId);
    },
    schedule(imageId, fieldId) {
      get().pause(imageId, fieldId);
      const key = keyFor(imageId, fieldId);
      deferredDrafts.delete(key);
      if (get().connected) timers.set(key, setTimeout(() => get().flush(imageId, fieldId), 600));
    },
    flush(imageId, fieldId) {
      get().pause(imageId, fieldId);
      const key = keyFor(imageId, fieldId);
      deferredDrafts.delete(key);
      const draft = useMetadataDrafts.getState().drafts.get(imageId)?.get(fieldId);
      if (!draft) return;
      if (submittedDrafts.get(key) === draft.revision) return;
      const intent = metadataIntent(fieldId, "overwrite", draft.dateInstant ?? draft.value, [imageId]);
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
        if (waiting?.id === id) waiting.complete();
        reservations.get(id)?.(); reservations.delete(id);
        capturedDrafts.delete(id);
        update(id, { state: "finished", message: "Stopped; changes not sent" });
      }
    },
    dispose() {
      disposed = true;
      unsubscribe();
      waiting?.complete();
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
    await runSave(id, slot, true);
  }

  async function runSave(id: number, slot: NonNullable<ReturnType<typeof queue.admit>>, primary: boolean) {
    if (!execute || !observation) return;
    const save = store.getState().saves.get(id)!;
    const group = [save];
    const progress = new Map<number, { items: MetadataReceipt["items"][number][]; excluded: number }>();
    let dispatchReleased = false;
    const releaseDispatch = () => {
      if (dispatchReleased) return;
      dispatchReleased = true;
      slot.dispatched();
      if (primary) {
        pumping = false;
        queueMicrotask(() => void pump());
      }
    };
    try {
      waiting = { id, complete: slot.complete };
      await slot.wait;
      waiting = undefined;
      if (disposed || stopped.has(id)) return;
      const unique = new Set(save.intent.targetIds);
      if (primary && unique.size === 1 && !hasImageCommandConflict(save.intent.targetIds[0])) {
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
        const targets = new Map<string, MetadataEditTarget>();
        for (const image of images) {
          if (!ids.includes(image.id) || stopped.has(owners.get(image.id)!.id)) continue;
          const overlay = attachedEnrichment(image);
          ensureImageRead(image, issued, "lean", overlay);
          if (acceptImageRead(image) !== image) continue;
          const target = { resource: overlay?.resource };
          if (metadataEditTargetCounts({ targetIds: [image.id], targets: new Map([[image.id, target]]) }).eligible) targets.set(image.id, target);
        }
        for (const imageId of ids) {
          const owner = owners.get(imageId)!;
          if (!targets.has(imageId) && !stopped.has(owner.id)) progress.get(owner.id)!.excluded++;
        }
        if (!targets.size) continue;
        const intents = new Map([...targets.keys()].map(imageId => [imageId, owners.get(imageId)!.intent]));
        const operation = createMetadataOperation(execute, observation, {
          onDerivedDispatch: (imageId, fields) => {
            const ownerId = owners.get(imageId)!.id;
            store.setState(state => {
              const changed = new Map(state.derivedOwners);
              for (const field of fields) changed.set(keyFor(imageId, field), ownerId);
              return { derivedOwners: changed };
            });
          },
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
          && operation.getSnapshot()!.items.every(item => !["leases", "labels"].includes(intents.get(item.imageId)?.fieldId ?? "")
            && (item.result?.outcome === "acknowledged" || item.result?.outcome === "unchanged")
            && typeof getMetadataWriteWitness(item.imageId) === "string")) releaseDispatch();
        await done;
        release();
        for (const member of group) running.delete(member.id);
        const receipt = operation.getSnapshot()!;
        for (const item of receipt.items) {
          const own = progress.get(owners.get(item.imageId)!.id)!;
          own.items.push(item);
        }
        if (receipt.blocked || receipt.items.some(item => item.result?.outcome === "blocked" || item.state === "stopped" && !stopped.has(owners.get(item.imageId)!.id)
          || sessionStopReason(item.result))) break;
        if (primary && group.length === 1 && save.intent.fieldId.startsWith("metadata_") && !stopped.has(id)
          && offset + BATCH_POLICY.maxTargets < allIds.length) {
          while (pending.length && stopped.has(pending[0])) pending.shift();
          const next = pending[0];
          const draft = capturedDrafts.get(next);
          if (draft && !hasImageCommandConflict(draft.imageId) && (!unique.has(draft.imageId) || progress.get(id)!.items.some(item =>
            item.imageId === draft.imageId && item.observation === "observed" && (item.state === "unchanged" || item.state === "accepted-awaiting-visibility")))) {
            let resume!: () => void;
            const turn = new Promise<void>(resolve => { resume = resolve; });
            const borrowed = queue.borrowTurn(slot, resume);
            if (borrowed) {
              pending.shift();
              void runSave(next, borrowed, false);
              await turn;
              const single = store.getState().saves.get(next);
              const reason = sessionStopReason(single?.items[0]?.result);
              if (reason) {
                const own = progress.get(id)!;
                own.items = [...own.items, ...allIds.slice(offset + BATCH_POLICY.maxTargets).map((imageId): MetadataSave["items"][number] => ({
                  imageId, state: "not-started", result: { outcome: "blocked", reason },
                }))];
                break;
              }
            }
          }
        }
      }
      store.setState(state => {
        const saves = new Map(state.saves);
        for (const member of group) saves.set(member.id, { ...saves.get(member.id)!, ...progress.get(member.id)!, state: "finished",
          ...(stopped.has(member.id) ? { message: "Stopped remaining; submitted outcomes retained" } : {}) });
        let removedPills: Map<string, readonly string[]> | undefined;
        for (const member of group) {
          const source = pillSources.get(member.id), applied = pillApplications.get(member.id);
          if (!source && !applied) continue;
          const final = saves.get(member.id)!;
          if (final.excluded || final.items.length !== final.intent.targetIds.length || !final.items.every(item => item.observation === "observed" && (item.state === "unchanged" || item.state === "accepted-awaiting-visibility"))) continue;
          const history = removedPills ??= new Map(state.removedPills);
          if (applied && history.get(applied.key) === applied.captured) history.delete(applied.key);
          if (source && final.intent.fieldId === "metadata_subjects" && Array.isArray(final.intent.value)) {
            const values = new Set(history.get(source));
            for (const subject of final.intent.removed ?? []) values.add(subject);
            for (const subject of final.intent.value) values.delete(subject);
            if (values.size) history.set(source, [...values]); else history.delete(source);
          } else if (source && typeof final.intent.value === "string") {
            const values = new Set(history.get(source));
            if (final.intent.action === "remove") values.add(final.intent.value); else values.delete(final.intent.value);
            if (values.size) history.set(source, [...values]); else history.delete(source);
          }
        }
        let owners: Map<string, number> | undefined;
        let rightsSaves: Map<string, { id: number; revision: number; superseded?: boolean }> | undefined;
        for (const member of group) {
          if (member.intent.fieldId !== "usageRights_category") continue;
          for (const item of progress.get(member.id)!.items) {
            const older = state.formRightsSaves.get(item.imageId);
            if (older && older.id < member.id && item.observation === "observed" && (item.state === "unchanged" ||
              item.result?.outcome === "acknowledged" && (!item.result.metadataFromRights || item.result.metadataFromRights === "acknowledged"))) {
              (rightsSaves ??= new Map(state.formRightsSaves)).set(item.imageId, { ...older, superseded: true });
            }
            if (item.observation !== "observed" || item.result?.outcome !== "acknowledged" || item.result.metadataFromRights !== "acknowledged") continue;
            for (const field of publisherFields) {
              const key = keyFor(item.imageId, field);
              if (state.derivedOwners.get(key) === member.id) (owners ??= new Map(state.derivedOwners)).delete(key);
            }
          }
        }
        return { saves, ...(removedPills && { removedPills }), ...(owners && { derivedOwners: owners }), ...(rightsSaves && { formRightsSaves: rightsSaves }) };
      });
      for (const member of group) {
        const { items } = progress.get(member.id)!;
        if ((member.intent.fieldId === "usageRights_category" || member.intent.fieldId === "leases") && member.intent.targetIds.length === 1) {
          const imageId = member.intent.targetIds[0];
          const tracked = (member.intent.fieldId === "leases" ? store.getState().formLeaseSaves : store.getState().formRightsSaves).get(imageId);
          if (tracked?.id === member.id && items.length === 1 && items[0].observation === "observed" &&
            (items[0].state === "accepted-awaiting-visibility" || items[0].state === "unchanged")) {
            useMetadataDrafts.getState().clearDraft(imageId, member.intent.fieldId, tracked.revision);
          }
        }
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