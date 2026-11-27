import { createStore } from "zustand/vanilla";
import { pillCommandField, SUBJECTS } from "@/lib/metadata-pill-fields";
import { BATCH_POLICY, canLendEdit, createBatchQueue, editEffect } from "@/lib/batch-execution";
import { addressableLabel } from "@/lib/grid-mutation-policy";
import { SELECTION_CAP } from "@/constants/tuning";
import { createMetadataOperation, matchesPhotoshoot, type MetadataIntent, type MetadataReceipt } from "@/lib/metadata-operation";
import { metadataEditTargetCounts, nextEditSequence, sessionStopReason, type MetadataEditObservation, type MetadataEditTarget } from "@/lib/metadata-edit-execution";
import { rightsValueSchema, type GridCommandResult, type MetadataCommand } from "@/lib/grid-commands";
import { leaseChangeSchema, type LeaseChange } from "@/lib/lease-change";
import { attachedEnrichment } from "./enrichment-store";
import { useCollectionStore } from "./collection-store";
import { acceptImageRead, captureImageRead, ensureImageRead, getMetadataWriteWitness, hasImageCommandConflict, watchQueuedLabelTargets } from "@/lib/image-read-freshness";
import { useMetadataDrafts } from "./metadata-drafts-store";
import { invalidateGridSession, isGridSessionInvalidated } from "@/lib/grid-api-instance";

const publisherFields = ["metadata_byline", "metadata_credit", "metadata_imageType"];
const scalarFields = new Set(["metadata_title", "metadata_description", "metadata_specialInstructions", "metadata_byline", "metadata_credit",
  "metadata_copyright", "metadata_dateTaken", "metadata_imageType"]);

function sessionReadFailure(error: unknown): boolean {
  return !!error && typeof error === "object" && "status" in error && (error.status === 401 || error.status === 419);
}

export interface MetadataSave {
  settled?: { confirmed: number; observed: number; unknown: number; rejected: number; superseded: number; reload: boolean };
  id: number;
  sequence?: number;
  draftRevision?: number;
  intent: MetadataIntent;
  state: "queued" | "saving" | "finished";
  items: MetadataReceipt["items"];
  excluded: number;
  message?: string;
}

export function metadataIntent(fieldId: string, action: string, value: string | string[] | Record<string, string | undefined> | LeaseChange, targetIds: readonly string[], removed?: string[]): MetadataIntent | undefined {
  if (fieldId === "archived") return action === "overwrite" && (value === "archive" || value === "unarchive") ? { fieldId, action, value, targetIds } : undefined;
  if (fieldId === "collections") {
    if (action === "overwrite" && Array.isArray(value) && value.every(path => path.length > 0)) return { fieldId, action: value.length ? "add" : "overwrite", ...(value.length && { fillMissing: true as const }), value: [...new Set(value)], targetIds };
    if ((action === "add" || action === "remove") && typeof value === "string" && value.length) return { fieldId, action, value: [value], targetIds };
    return;
  }
  if (fieldId === "photoshoot") return action === "overwrite" && typeof value === "string" ? { fieldId, action, value: value.trim(), targetIds } : undefined;
  if (Array.isArray(value)) {
    if (fieldId === "labels" && action === "add") {
      const labels = [...new Set(value.map(label => label.trim()))];
      return labels.length && labels.every(addressableLabel) ? { fieldId, action, value: labels, targetIds } : undefined;
    }
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
  if (!scalarFields.has(field) && !["metadata_keywords", "metadata_peopleInImage", "metadata_subjects", "location"].includes(field)) return;
  if (field === "metadata_dateTaken") {
    if (typeof value !== "string" || !value || !Number.isFinite(Date.parse(value))) return;
    value = new Date(value).toISOString();
  }
  return { fieldId: field as MetadataCommand["fieldId"], action: action as MetadataCommand["action"], value, targetIds };
}

function usesGroupedReceipt(intent: MetadataIntent) {
  return (intent.fieldId === "archived" || intent.fieldId === "photoshoot") && intent.targetIds.length > BATCH_POLICY.maxTargets;
}

export function metadataSaveStatus(save: MetadataSave): string {
  if (save.message) return save.message;
  const observed = (save.settled?.observed ?? 0) + save.items.filter(item => item.observation === "observed" && !(item.result && "labelSteps" in item.result && item.result.labelSteps)).length;
  const steps = { acknowledged: 0, rejected: 0, uncertain: 0, notSent: 0 };
  for (const { result } of save.items) {
    if (!result || !("labelSteps" in result) || !result.labelSteps) continue;
    for (const key of ["acknowledged", "rejected", "uncertain", "notSent"] as const) steps[key] += result.labelSteps[key];
  }
  const stepSummary = [steps.acknowledged && `${steps.acknowledged} acknowledged`, steps.rejected && `${steps.rejected} rejected`,
    steps.uncertain && `${steps.uncertain} uncertain`, steps.notSent && `${steps.notSent} not sent`].filter(Boolean).join(" · ");
  const unknown = (save.settled?.unknown ?? 0) + save.items.filter(item => item.state === "unknown").length;
  const superseded = (save.settled?.superseded ?? 0) + save.items.filter(item => item.observation === "superseded").length;
  const grouped = usesGroupedReceipt(save.intent);
  const notSent = grouped ? save.items.filter(item => item.state === "not-started" || item.state === "stopped" || item.result?.outcome === "blocked").length : 0;
  const rejected = (save.settled?.rejected ?? 0) + save.items.filter(item => grouped ? item.state === "rejected" && item.result?.outcome !== "blocked" : item.state === "rejected" || item.result?.outcome === "blocked").length;
  const derived = save.items.flatMap(item => item.result?.outcome === "acknowledged" && item.result.metadataFromRights ? [item.result.metadataFromRights] : []);
  const notSaved = derived.filter(state => state === "rejected" || state === "not-sent").length;
  const notConfirmed = derived.filter(state => state === "unknown").length;
  return `${save.state === "queued" ? "Queued" : save.state === "saving" ? "Saving" : "Finished"}: ${observed}/${save.intent.targetIds.length} visible`
    + (unknown ? `; ${unknown} uncertain` : "") + (rejected ? `; ${rejected} ${grouped ? "rejected" : "not saved"}` : "") + (notSent ? `; ${notSent} not sent` : "")
    + (superseded ? `; ${superseded} superseded` : "")
    + (save.excluded ? `; ${save.excluded} excluded` : "")
    + (save.items.some(item => item.result?.outcome === "blocked" && item.result.reason === "unaddressable-label") ? "; An existing label cannot be removed by Grid's member URL" : "")
    + (stepSummary ? `; Interrupted ${save.intent.fieldId === "collections" ? "collection" : "label"} steps: ${stepSummary}` : "")
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
  const detailsSingles = new WeakSet<MetadataIntent>();
  const userSingles = new WeakSet<MetadataIntent>();
  let detailsPreflight: { id: number; controller: AbortController } | undefined;
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
    pendingArchiveIds: ReadonlySet<string>;
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
    submit: (intent: MetadataIntent, newRevision?: boolean | number, pillSource?: string, origin?: "details-scalar" | "user") => number | undefined;
    schedule: (imageId: string, fieldId: string) => void;
    deferDraft: (imageId: string, fieldId: string) => void;
    settleDraftGrant: (imageId: string, fieldId: string, granted: boolean) => void;
    flush: (imageId: string, fieldId: string) => void;
    pause: (imageId: string, fieldId: string) => void;
    stop: (id: number) => void;
    dispose: () => void;
  }>((set, get) => ({
    connected: Boolean(execute && observation), pendingArchiveIds: new Set(), saves: new Map(), derivedOwners: new Map(), panelSaves: [], arrowSaves: new Map(),
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
      const id = get().submit(intent, false, undefined, "user");
      const captured = get().removedPills.get(key);
      if (id !== undefined && captured && get().saves.get(id)?.state !== "finished") pillApplications.set(id, { key, captured });
      if (id !== undefined) set({ arrowSaves: new Map(get().arrowSaves).set(key, id) });
    },
    submit(input, newRevision = false, pillSource, origin) {
      if (!execute || !observation || disposed || !input.targetIds.length) return;
      const targetIds = [...new Set(input.targetIds)];
      const intent: MetadataIntent = input.fieldId === "leases" ? { ...input, targetIds, value: structuredClone(input.value) } : input.fieldId === "usageRights_category" ? { ...input, targetIds, value: { ...input.value } } : input.fieldId === "labels" ? { ...input, targetIds, value: Array.isArray(input.value) ? [...input.value] : input.value }
        : input.fieldId === "archived" ? { ...input, targetIds } : input.fieldId === "collections" ? { ...input, targetIds, value: [...input.value] } : input.fieldId === "photoshoot" ? { ...input, targetIds, value: input.value.trim() }
        : { ...input, targetIds, value: typeof input.value === "string" ? input.value : Array.isArray(input.value) ? [...input.value] : { ...input.value } };
      if (!newRevision) {
        const targets = new Set(targetIds);
        const latest = [...get().saves.values()].findLast(save => save.intent.fieldId === intent.fieldId
          && save.intent.targetIds.some(id => targets.has(id)));
        if (latest && latest.state !== "finished" && JSON.stringify(latest.intent) === JSON.stringify(intent)) return latest.id;
      }
      const id = ++nextId;
      const sequence = nextEditSequence();
      const draftRevision = typeof newRevision === "number" ? newRevision : undefined;
      if (targetIds.length === 1) for (const key of keysFor(intent)) latestSingle.set(key, id);
      if ((intent.fieldId === "photoshoot" || intent.fieldId === "archived") && targetIds.length > SELECTION_CAP) {
        set({ saves: new Map(get().saves).set(id, { id, intent, sequence, state: "finished", items: [], excluded: 0,
          message: `Not sent: select at most ${SELECTION_CAP.toLocaleString()} images.` }) });
        return id;
      }
      const release = watchQueuedLabelTargets(intent.targetIds);
      if (!release) {
        set({ saves: new Map(get().saves).set(id, { id, intent, sequence, draftRevision, state: "finished", items: [], excluded: 0,
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
        if (intent.fieldId === "archived") set(state => {
          const pendingArchiveIds = new Set(state.pendingArchiveIds);
          for (const imageId of targetIds) if (!pendingByField.has(keyFor(imageId, "archived"))) pendingArchiveIds.delete(imageId);
          return { pendingArchiveIds };
        });
      });
      if (pillSource) pillSources.set(id, pillSource);
      if (get().derivedOwners.size) {
        const keys = intent.fieldId === "usageRights_category" ? publisherFields : [intent.fieldId];
        const affected = targetIds.flatMap(imageId => keys.map(field => keyFor(imageId, field))).filter(key => get().derivedOwners.has(key));
        if (affected.length) { const owners = new Map(get().derivedOwners); affected.forEach(key => owners.delete(key)); set({ derivedOwners: owners }); }
      }
      pending.push(id);
      if (origin && targetIds.length === 1) userSingles.add(intent);
      if (origin === "details-scalar" && targetIds.length === 1 && scalarFields.has(intent.fieldId)) detailsSingles.add(intent);
      set({ saves: new Map(get().saves).set(id, { id, intent, sequence, draftRevision, state: "queued", items: [], excluded: 0 }),
        ...(intent.fieldId === "archived" && { pendingArchiveIds: new Set([...get().pendingArchiveIds, ...targetIds]) }) });
      if (userSingles.has(intent)) void pump();
      else queueMicrotask(() => void pump());
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
      if (get().connected && fieldId !== "photoshoot") timers.set(key, setTimeout(() => get().flush(imageId, fieldId), 600));
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
      const id = get().submit(intent, draft.revision, undefined, "user");
      if (id !== undefined) {
        capturedDrafts.set(id, { imageId, fieldId, revision: draft.revision });
        submittedDrafts.set(key, draft.revision);
      }
    },
    stop(id) {
      stopped.add(id);
      if (detailsPreflight?.id === id) detailsPreflight.controller.abort();
      running.get(id)?.stopTargets(get().saves.get(id)!.intent.targetIds);
      if (get().saves.get(id)?.state === "queued") {
        if (waiting?.id === id) waiting.complete();
        reservations.get(id)?.(); reservations.delete(id);
        capturedDrafts.delete(id);
        const { intent } = get().saves.get(id)!;
        update(id, { state: "finished", message: "Stopped; changes not sent", ...(usesGroupedReceipt(intent) && { items: intent.targetIds.map(imageId => ({ imageId, state: "stopped" as const })) }) });
      }
    },
    dispose() {
      disposed = true;
      detailsPreflight?.controller.abort();
      unsubscribe();
      waiting?.complete();
      for (const timer of timers.values()) clearTimeout(timer);
      for (const operation of new Set(running.values())) { operation.stopRemaining(); operation.cancelObservation(); }
      for (const release of reservations.values()) release();
      reservations.clear();
      if (!sharedQueue) queue.dispose();
    },
  }));
  function privateHead() {
    while (pending.length && stopped.has(pending[0])) pending.shift();
    return store.getState().saves.get(pending[0]);
  }
  const unsubscribe = queue.subscribe(() => void pump(), () => privateHead()?.sequence);

  function update(id: number, patch: Partial<MetadataSave>) {
    store.setState(state => ({ saves: new Map(state.saves).set(id, { ...state.saves.get(id)!, ...patch }) }));
  }

  async function pump() {
    if (pumping || disposed || !execute || !observation) return;
    const save = privateHead();
    if (!save) return;
    const imageId = save.intent.targetIds[0];
    const slot = queue.admit(userSingles.has(save.intent) ? { imageId, effect: editEffect(save.intent.fieldId), sequence: save.sequence!, conflicted: () => hasImageCommandConflict(imageId) } : { sequence: save.sequence! });
    if (!slot) return;
    pumping = true;
    pending.shift();
    await runSave(save.id, slot, true);
  }

  function haltReason(items: MetadataReceipt["items"]) {
    if (isGridSessionInvalidated() || items.some(item => item.reloadRequired)) return "reload-required";
    for (const item of items) {
      const reason = sessionStopReason(item.result);
      if (reason) return reason;
    }
  }

  async function runSave(id: number, slot: NonNullable<ReturnType<typeof queue.admit>>, primary: boolean, turn?: "details" | "settled") {
    if (!execute || !observation) return;
    const save = store.getState().saves.get(id)!;
    const group = [save];
    const groupedAction = usesGroupedReceipt(save.intent);
    const boundedProgress = groupedAction || scalarFields.has(save.intent.fieldId) && save.intent.targetIds.length > BATCH_POLICY.maxTargets;
    let settled = { confirmed: 0, observed: 0, unknown: 0, rejected: 0, superseded: 0, reload: false };
    const progress = new Map<number, { items: MetadataReceipt["items"][number][]; excluded: number }>();
    let releaseWindow: (() => void) | undefined;
    let dispatchReleased = false;
    const turnObservation = { ...observation, onReadError: (error: unknown) => {
      if (!sessionReadFailure(error)) return false;
      invalidateGridSession();
      return true;
    } };
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
      waiting = { id, complete: () => slot.complete(isGridSessionInvalidated() ? "reload-required" : disposed ? "disabled" : undefined) };
      await slot.wait;
      waiting = undefined;
      if (disposed || stopped.has(id)) return;
      const detailsTurn = turn === "details" || slot.isLent && detailsSingles.has(save.intent);
      const unique = new Set(save.intent.targetIds);
      if (primary && !slot.isLent && unique.size === 1 && !hasImageCommandConflict(save.intent.targetIds[0])) {
        while (pending.length && group.length < BATCH_POLICY.maxTargets) {
          const candidate = store.getState().saves.get(pending[0])!;
          if (stopped.has(candidate.id)) { pending.shift(); continue; }
          if (queue.hasEarlierWaiter(candidate.sequence!)) break;
          const targets = candidate.intent.targetIds;
          if (candidate.intent.fieldId === "photoshoot" || save.intent.fieldId === "photoshoot") break;
          if (candidate.intent.fieldId === "archived" || save.intent.fieldId === "archived") break;
          if (targets.length !== 1 || unique.has(targets[0]) || hasImageCommandConflict(targets[0])) break;
          pending.shift();
          group.push(candidate);
          unique.add(targets[0]);
        }
      }
      for (const member of group) progress.set(member.id, { items: [], excluded: 0 });
      const owners = new Map(group.flatMap(member => member.intent.targetIds.map(imageId => [imageId, member] as const)));
      const allIds = [...owners.keys()];
      const notSent = (ids: readonly string[], reason: "unavailable" | "disabled" | "reload-required") => {
        for (const imageId of ids) {
          const owner = owners.get(imageId)!.id;
          if (!stopped.has(owner)) progress.get(owner)!.items.push({ imageId, state: "not-started", result: { outcome: "blocked", reason } });
        }
      };
      store.setState(state => ({ saves: new Map([...state.saves].map(([saveId, value]) => [saveId,
        progress.has(saveId) ? { ...value, state: "saving" as const } : value])) }));
      for (let offset = 0; offset < allIds.length && !disposed; offset += BATCH_POLICY.maxTargets) {
        const ids = allIds.slice(offset, offset + BATCH_POLICY.maxTargets).filter(imageId => !stopped.has(owners.get(imageId)!.id));
        if (!ids.length) continue;
        if (isGridSessionInvalidated()) { notSent(allIds.slice(offset), "reload-required"); break; }
        const issued = captureImageRead();
        let images: Awaited<ReturnType<typeof observation.readImages>>;
        const timeout = AbortSignal.timeout(BATCH_POLICY.commandTimeoutMs);
        if (detailsTurn) detailsPreflight = { id, controller: new AbortController() };
        try { images = await observation.readImages([...ids], detailsTurn && detailsPreflight ? AbortSignal.any([timeout, detailsPreflight.controller.signal]) : timeout); }
        catch (error) {
          if (!disposed && !(detailsTurn && stopped.has(id))) notSent(allIds.slice(offset), turnObservation.onReadError(error) ? "reload-required" : "unavailable");
          break;
        } finally { if (detailsTurn) detailsPreflight = undefined; }
        if (disposed) break;
        if (isGridSessionInvalidated()) { notSent(allIds.slice(offset), "reload-required"); break; }
        const targets = new Map<string, MetadataEditTarget>();
        for (const image of images) {
          if (!ids.includes(image.id) || stopped.has(owners.get(image.id)!.id)) continue;
          const overlay = attachedEnrichment(image);
          ensureImageRead(image, issued, "lean", overlay);
          if (acceptImageRead(image) !== image) continue;
          const intent = owners.get(image.id)!.intent;
          const held = new Set(image.collections?.map(member => member.pathId));
          const target = { resource: overlay?.resource, ...(intent.fieldId === "archived" && { archiveGrant: !image.softDeletedMetadata && typeof image.userMetadata?.archived === "boolean" }), ...(intent.fieldId === "collections" && { collectionGrant: Array.isArray(image.collections) && (
            intent.action === "add" ? intent.fillMissing && intent.value.every(key => held.has(key)) || !!overlay?.actions?.some(action => action.name === "add-collection" && action.method === "POST" && !!action.href)
              : (intent.action === "overwrite" ? [...held] : intent.value).every(key => !held.has(key) || !!key && overlay?.removableCollections?.has(key))) }) };
          if (metadataEditTargetCounts({ targetIds: [image.id], targets: new Map([[image.id, target]]) }).eligible) targets.set(image.id, target);
        }
        if (groupedAction && targets.size !== ids.length) { notSent(allIds.slice(offset), "unavailable"); break; }
        for (const imageId of ids) {
          const owner = owners.get(imageId)!;
          if (!targets.has(imageId) && !stopped.has(owner.id)) progress.get(owner.id)!.excluded++;
        }
        const listAddition = save.intent.fieldId === "labels" && save.intent.targetIds.length > 1 && Array.isArray(save.intent.value) && save.intent.action === "add" && !save.intent.removed?.length;
        if ((save.intent.fieldId === "photoshoot" || save.intent.fieldId === "archived" || listAddition) && targets.size !== ids.length) { notSent([...targets.keys(), ...allIds.slice(offset + ids.length)], "unavailable"); break; }
        if (!targets.size) continue;
        const intents = new Map([...targets.keys()].map(imageId => [imageId, owners.get(imageId)!.intent]));
        const shoot = save.intent.fieldId === "photoshoot" ? save.intent.value : undefined;
        const operation = createMetadataOperation(execute, turnObservation, {
          matchingPhotoshoots: shoot === undefined ? undefined : new Set(images.filter(image => matchesPhotoshoot(image, shoot)).map(image => image.id)),
          onDerivedDispatch: (imageId, fields) => {
            const ownerId = owners.get(imageId)!.id;
            store.setState(state => {
              const changed = new Map(state.derivedOwners);
              for (const field of fields) changed.set(keyFor(imageId, field), ownerId);
              return { derivedOwners: changed };
            });
          },
          pacing: slot.pacing, continueAfterLocalBlock: group.length > 1,
          dispatchConcurrency: save.intent.fieldId === "photoshoot" ? 1 : group.length === 1 && save.intent.fieldId !== "labels" && save.intent.fieldId !== "archived" && allIds.length > 1 ? 5 : undefined,
        }, intents);
        for (const member of group) running.set(member.id, operation);
        let finish!: () => void;
        const done = new Promise<void>(resolve => { finish = resolve; });
        releaseWindow = operation.subscribe(() => {
          const receipt = operation.getSnapshot()!;
          store.setState(state => {
            const saves = new Map(state.saves);
            for (const member of group) {
              const own = progress.get(member.id)!;
              const items = boundedProgress ? receipt.items : [...own.items, ...receipt.items.filter(item => owners.get(item.imageId)?.id === member.id)];
              saves.set(member.id, { ...saves.get(member.id)!, items, excluded: own.excluded,
                ...(boundedProgress && { settled }), ...(receipt.blocked && !groupedAction ? { message: `Not sent: ${receipt.blocked}` } : {}) });
            }
            return { saves };
          });
          if (!receipt.items.some(item => item.state === "queued" || item.state === "submitted" || item.observation === "pending")) finish();
        });
        await operation.confirm({ ...save.intent, targetIds: [...targets.keys()] }, targets);
        if (!turn && !slot.isLent && !disposed && offset + BATCH_POLICY.maxTargets >= allIds.length
          && operation.getSnapshot()!.items.every(item => { const field = intents.get(item.imageId)?.fieldId;
            return (field?.startsWith("metadata_") || field === "location" || field === "usageRights_category")
            && (item.result?.outcome === "acknowledged" || item.result?.outcome === "unchanged")
            && typeof getMetadataWriteWitness(item.imageId) === "string"; })) releaseDispatch();
        await done;
        releaseWindow();
        releaseWindow = undefined;
        for (const member of group) running.delete(member.id);
        const receipt = operation.getSnapshot()!;
        if (boundedProgress) settled = { ...settled };
        for (const item of receipt.items) {
          const own = progress.get(owners.get(item.imageId)!.id)!;
          if (groupedAction && (item.state === "not-started" || item.state === "stopped") && !stopped.has(id) && !item.result) {
            own.items.push({ ...item, result: { outcome: "blocked", reason: "unavailable" } });
          } else own.items.push(item);
          if (boundedProgress) {
            if (item.observation === "observed") { settled.observed++; if (item.state === "accepted-awaiting-visibility" || item.state === "unchanged") settled.confirmed++; }
            if (item.state === "unknown") settled.unknown++;
            if (item.observation === "superseded") settled.superseded++;
            if (item.state === "rejected" || item.result?.outcome === "blocked") settled.rejected++;
            settled.reload ||= Boolean(item.reloadRequired || sessionStopReason(item.result) === "reload-required");
          }
        }
        const halt = haltReason(receipt.items);
        if (halt) { notSent(allIds.slice(offset + BATCH_POLICY.maxTargets), halt); break; }
        if (receipt.blocked || receipt.items.some(item => item.result?.outcome === "blocked" || item.state === "stopped" && !stopped.has(owners.get(item.imageId)!.id))) {
          if (groupedAction) notSent(allIds.slice(offset + BATCH_POLICY.maxTargets), "unavailable");
          break;
        }
        if (primary && !slot.isLent && group.length === 1 && !stopped.has(id)
          && offset + BATCH_POLICY.maxTargets < allIds.length) {
          const head = privateHead();
          const parent = { ids: unique, effect: editEffect(save.intent.fieldId) };
          const known = !receipt.items.some(item => item.state === "unknown");
          const transfer = known ? queue.lendWaiting(slot, parent, head?.sequence) : undefined;
          if (transfer) {
            const reason = await transfer;
            if (reason) { notSent(allIds.slice(offset + BATCH_POLICY.maxTargets), reason); break; }
            continue;
          }
          if (!head || !userSingles.has(head.intent)) continue;
          const next = head.id;
          const imageId = head.intent.targetIds[0];
          if (hasImageCommandConflict(imageId)) continue;
          const details = detailsSingles.has(head.intent);
          const ordinary = (groupedAction || save.intent.fieldId.startsWith("metadata_")) &&
            (details && (groupedAction || scalarFields.has(save.intent.fieldId)) || capturedDrafts.has(next)) &&
            (!groupedAction || scalarFields.has(head.intent.fieldId)) && (!unique.has(imageId) || !groupedAction && progress.get(id)!.items.some(item =>
              item.imageId === imageId && item.observation === "observed" && (item.state === "unchanged" || item.state === "accepted-awaiting-visibility")));
          if (ordinary || known && canLendEdit(parent, { imageId, effect: editEffect(head.intent.fieldId) })) {
            let resume!: (halt?: "disabled" | "reload-required") => void;
            const turn = new Promise<Parameters<typeof resume>[0]>(resolve => { resume = resolve; });
            const borrowed = queue.borrowTurn(slot, resume);
            if (borrowed) {
              pending.shift();
              void runSave(next, borrowed, false, details ? "details" : ordinary && !groupedAction ? undefined : "settled");
              const halt = await turn;
              const single = store.getState().saves.get(next);
              const reason = halt ?? haltReason(single?.items ?? []);
              if (reason) {
                notSent(allIds.slice(offset + BATCH_POLICY.maxTargets), reason);
                break;
              }
            }
          }
        }
      }
      store.setState(state => {
        const saves = new Map(state.saves);
        for (const member of group) {
          const completed = progress.get(member.id)!;
          if (groupedAction) {
            const byId = new Map(completed.items.map(item => [item.imageId, item]));
            completed.items = member.intent.targetIds.map(imageId => byId.get(imageId) ?? { imageId, state: "stopped" });
          }
          saves.set(member.id, { ...saves.get(member.id)!, ...completed, settled: undefined, state: "finished",
            ...(stopped.has(member.id) ? { message: "Stopped remaining; submitted outcomes retained" } : {}) });
        }
        let removedPills: Map<string, readonly string[]> | undefined;
        for (const member of group) {
          const source = pillSources.get(member.id), applied = pillApplications.get(member.id);
          if (!source && !applied) continue;
          const final = saves.get(member.id)!;
          if (final.excluded || final.items.length !== final.intent.targetIds.length || !final.items.every(item => item.observation === "observed" && (item.state === "unchanged" || item.state === "accepted-awaiting-visibility"))) continue;
          const history = removedPills ??= new Map(state.removedPills);
          if (applied && history.get(applied.key) === applied.captured) history.delete(applied.key);
          if (source && (final.intent.fieldId === "metadata_subjects" || final.intent.fieldId === "labels") && Array.isArray(final.intent.value)) {
            const values = new Set(history.get(source));
            for (const removed of final.intent.removed ?? []) values.add(removed);
            for (const added of final.intent.value) values.delete(added);
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
      if (group.some(member => member.intent.fieldId === "collections" && progress.get(member.id)!.items.some(({ result, observation }) =>
        result?.outcome === "acknowledged" ||
        (result?.outcome === "partial" || result?.outcome === "unknown") &&
          ((result.labelSteps?.acknowledged ?? 0) > 0 || observation === "observed")))) useCollectionStore.getState().invalidateCounts();
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
      releaseWindow?.();
      for (const member of group) {
        if (!boundedProgress) { update(member.id, { state: "finished", message: "Save unavailable; no automatic retry" }); continue; }
        const active = running.get(member.id);
        const byId = new Map([...progress.get(member.id)?.items ?? [], ...active?.getSnapshot()?.items ?? []].map(item => [item.imageId, item]));
        active?.stopRemaining();
        active?.cancelObservation();
        const items = member.intent.targetIds.map(imageId => {
          const item = byId.get(imageId);
          if (!item || item.state === "queued") return { imageId, state: "not-started" as const };
          return { ...item, ...(item.state === "submitted" && { state: "unknown" as const }), ...(item.observation === "pending" && { observation: "unavailable" as const }) };
        });
        running.delete(member.id);
        update(member.id, { state: "finished", items, settled: undefined, ...(!groupedAction && { message: "Save unavailable; no automatic retry" }) });
      }
    } finally {
      for (const member of group) { reservations.get(member.id)?.(); reservations.delete(member.id); }
      slot.complete(slot.isLent ? haltReason(store.getState().saves.get(id)?.items ?? []) ?? (disposed ? "disabled" : undefined) : undefined);
      releaseDispatch();
    }
  }
  return store;
}

export const metadataEditorStore = createMetadataEditorStore();

export function reportUploadFollowups(editor: typeof metadataEditorStore, operations: readonly { label: string; id: number | undefined }[], report: (rows: readonly import("./upload-jobs-store").UploadFollowup[]) => void) {
  const publish = () => {
    const { saves } = editor.getState();
    const rows = operations.map(operation => {
      const save = operation.id === undefined ? undefined : saves.get(operation.id);
      return { label: operation.label, summary: save ? metadataSaveStatus(save) : "Not sent",
        pending: Boolean(save && save.state !== "finished"), attention: !save || save.state === "finished"
          && (Boolean(save.message) || save.excluded > 0 || save.items.some(item => item.state === "unknown" || item.observation !== "observed")) };
    });
    if (operations.every(({ id }) => id === undefined || saves.get(id)?.state === "finished")) unsubscribe();
    report(rows);
  };
  const unsubscribe = editor.subscribe((next, previous) => {
    if (operations.some(({ id }) => id !== undefined && next.saves.get(id) !== previous.saves.get(id))) publish();
  });
  publish();
}