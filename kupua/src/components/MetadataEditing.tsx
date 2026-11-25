import { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import { pillCommandField, pillDisplayField } from "@/lib/metadata-pill-fields";
import { metadataEditorStore, metadataIntent, metadataSaveStatus, type MetadataSave } from "@/stores/metadata-editor-store";
import { addToast } from "@/stores/toast-store";
import { FIELDS_BY_ID } from "@/lib/field-registry";
import { labelTargetKey } from "@/stores/label-editor-store";
import { useSelectionStore } from "@/stores/selection-store";
import { useSearchStore } from "@/stores/search-store";
import { scrollFocusedIntoView } from "@/lib/orchestration/search";
import { useShallow } from "zustand/react/shallow";
import { editIssue, EditIssueDisclosure, type EditIssue } from "./EditIssueDisclosure";
import type { LabelReceipt } from "@/lib/label-operation";
import type { LeaseChange } from "@/lib/lease-change";
import { ProgressGlyph } from "./ProgressGlyph";

export const MetadataEditorContext = createContext(metadataEditorStore);
export type FieldSaveState = "Saving…" | "Not saved" | "Not confirmed" | "Partially saved";
const derivedItems = new WeakMap<MetadataSave["items"], ReadonlyMap<string, MetadataSave["items"][number]>>();
function derivedItem(items: MetadataSave["items"], id: string) {
  let index = derivedItems.get(items);
  if (!index) { index = new Map(items.map(item => [item.imageId, item])); derivedItems.set(items, index); }
  return index.get(id);
}
export function useDerivedFieldState(ids: readonly string[], field: string): FieldSaveState | undefined {
  return useStore(useContext(MetadataEditorContext), state => {
    if (!["metadata_credit", "metadata_byline", "metadata_imageType"].includes(field)) return;
    if (!state.derivedOwners.size) return;
    let pending = false, failed = false, unknown = false;
    for (const id of ids) {
      const owner = state.derivedOwners.get(JSON.stringify([id, field]));
      const save = owner === undefined ? undefined : state.saves.get(owner);
      if (!save) continue;
      const item = derivedItem(save.items, id);
      const result = item?.result;
      if (result?.outcome === "acknowledged" && result.metadataFromRights === "unknown") unknown = true;
      else if (result?.outcome === "acknowledged" && result.metadataFromRights === "rejected") failed = true;
      else if (item?.observation !== "observed" && item?.observation !== "superseded") {
        if (save.state === "finished") unknown = true; else pending = true;
      }
    }
    return unknown ? "Not confirmed" : failed ? "Not saved" : pending ? "Saving…" : undefined;
  });
}
export function useSubmittedField(onConfirmed: () => void, retainedId?: number) {
  const [id, track] = useState<number>();
  const tracked = retainedId ?? id;
  const save = useStore(useContext(MetadataEditorContext), state => tracked === undefined ? undefined : state.saves.get(tracked));
  const confirmed = !!save && save.state === "finished" && !save.message && !save.excluded && save.items.length === save.intent.targetIds.length && save.items.every(item =>
    item.observation === "observed" && (item.state === "accepted-awaiting-visibility" || item.state === "unchanged"));
  const state: FieldSaveState | undefined = !save || confirmed ? undefined : save.state !== "finished" ? "Saving…"
    : save.items.some(item => item.state === "partial") && !save.items.some(item => item.state === "unknown") ? "Partially saved"
    : save.items.every(item => editIssue(item.imageId, "", item).notSaved) ? "Not saved" : "Not confirmed";
  useEffect(() => { if (confirmed) { track(undefined); onConfirmed(); } }, [confirmed, onConfirmed]);
  const reload = !!save && save.items.some(item => editIssue(item.imageId, "", item).reload);
  return { track, state, reload, locked: state === "Saving…" || state === "Not confirmed" || reload };
}
export function FieldSaveNote({ state, label = "changes" }: { state?: FieldSaveState; label?: string }) {
  const visible = useDelayedBusy(state === "Saving…" ? label : undefined);
  if (state === "Saving…") return visible ? <span role="status" aria-label={`Saving ${label}`} title={`Saving ${label}`} className="metadata-pending-glyph"><ProgressGlyph size={16}/></span> : null;
  return state ? <span role="status" className="metadata-field-status" data-save-state={state}>{state}</span> : null;
}
function useDelayedBusy(key?: number | string) {
  const [visible, setVisible] = useState<typeof key>();
  useEffect(() => {
    setVisible(undefined);
    if (key === undefined) return;
    const timer = setTimeout(() => setVisible(key), 150);
    return () => clearTimeout(timer);
  }, [key]);
  return key !== undefined && visible === key;
}

function useEditDisclosure() {
  const [openFor, setOpenFor] = useState<string>();
  const trigger = useRef<HTMLButtonElement>(null);
  const popId = useId();
  const close = () => setOpenFor(undefined);
  const focusTrigger = () => trigger.current?.focus();
  return { trigger, popId, openFor, close, focusTrigger,
    toggle: (key: string) => setOpenFor(current => current === key ? undefined : key),
    attributes: (expanded: boolean | undefined) => ({ "aria-expanded": expanded, "aria-controls": expanded ? popId : undefined }),
    events: (expanded: boolean, cancelConfirmation?: () => void) => ({
      onBlur(event: React.FocusEvent<HTMLElement>) {
        if (!event.currentTarget.contains(event.relatedTarget)) { close(); cancelConfirmation?.(); }
      },
      onKeyDown(event: React.KeyboardEvent<HTMLElement>) {
        if (event.key !== "Escape" || !expanded) return;
        if (!cancelConfirmation) event.preventDefault();
        event.stopPropagation(); close(); cancelConfirmation?.(); focusTrigger();
      },
    }),
  };
}

function SaveGlyph({ busy }: { busy: boolean }) {
  return busy ? <ProgressGlyph />
    : <svg aria-hidden="true" width="24" height="24" viewBox="0 -960 960 960" fill="#e3e3e3"><path d="m40-120 440-760 440 760H40Zm138-80h604L480-720 178-200Zm302-40q17 0 28.5-11.5T520-280q0-17-11.5-28.5T480-320q-17 0-28.5 11.5T440-280q0 17 11.5 28.5T480-240Zm-40-120h80v-200h-80v200Z"/></svg>;
}

export function FieldSignal({ state, label, detail, onDismiss }: { state: FieldSaveState; label: string; detail?: string; onDismiss?: () => void }) {
  const disclosure = useEditDisclosure();
  const open = disclosure.openFor === "field";
  const busy = state === "Saving…";
  const visible = useDelayedBusy(busy ? label : undefined);
  const name = busy ? `Saving ${label}` : `${label} ${state.toLowerCase()}`;
  if (busy && !visible) return <span aria-hidden="true" className="metadata-edit-tool invisible" />;
  return <span className="metadata-field-signal" {...disclosure.events(open)}><span className="sr-only" role="status">{name}</span><button ref={disclosure.trigger} type="button" className="metadata-edit-tool" aria-label={name} title={name} {...disclosure.attributes(open)} onClick={() => disclosure.toggle("field")}><SaveGlyph busy={busy}/></button>
    {open && <span id={disclosure.popId} role="group" aria-label={name} className="metadata-batch-popover text-xs"><strong>{name}</strong>{detail && <span className="block">{detail}</span>}{state === "Not confirmed" && <span className="block">Couldn’t verify the change. It may have saved.</span>}<button type="button" className="block underline" onClick={() => { disclosure.close(); disclosure.focusTrigger(); if (!busy) onDismiss?.(); }}>{!busy && onDismiss ? "Dismiss" : "Close"}</button></span>}
  </span>;
}

function batchIssueSummary(save: MetadataSave, label: string) {
  if (save.message || save.excluded || save.items.length !== save.intent.targetIds.length) return metadataSaveStatus(save);
  const groups = new Map<string, number>();
  for (const item of save.items) {
    const issue = editIssue(item.imageId, label, item);
    if (issue.steps || issue.reload || derivedIssue(item) || item.state === "partial" || item.observation === "superseded") return metadataSaveStatus(save);
    if (item.observation === "observed" && (item.state === "unchanged" || item.state === "accepted-awaiting-visibility")) continue;
    const reason = item.result?.outcome === "rejected" && item.result.status === 403 ? "No permission to edit" : `${label} ${issue.notSaved ? "not saved" : "not confirmed"} on`;
    groups.set(reason, (groups.get(reason) ?? 0) + 1);
  }
  return [...groups].map(([reason, count]) => `${reason} ${count} other ${count === 1 ? "image" : "images"}.`).join(" ") || metadataSaveStatus(save);
}
export function SavingValue({ saving, state = saving ? "Saving…" : undefined, children }: { saving?: boolean; state?: FieldSaveState; children: React.ReactNode }) {
  if (!state) return <>{children}</>;
  return <div className="metadata-saving" data-field-state={state}><FieldSaveNote state={state} /><div aria-busy={state === "Saving…"}>{children}</div></div>;
}
export const FormBatchContext = createContext<{ key: string; ids: readonly string[] } | undefined>(undefined);

export function MetadataBatchArrow({ imageId, fieldId, label, value, disabled, hideWhenDisabled = false, source }: {
  imageId: string; fieldId: string; label: string; value: string | string[] | Record<string, string | undefined> | LeaseChange; disabled: boolean; hideWhenDisabled?: boolean;
  source?: { id: number; state: FieldSaveState; detail?: string; dismiss?: () => void };
}) {
  const batch = useContext(FormBatchContext);
  const store = useContext(MetadataEditorContext);
  const key = JSON.stringify([batch?.key, imageId, fieldId]);
  const save = useStore(store, state => state.saves.get(state.arrowSaves.get(key) ?? -1));
  const removed = useStore(store, state => state.removedPills.get(key));
  const sourcePending = useStore(store, state => Array.isArray(value) && state.hasPendingField(imageId, pillCommandField(fieldId)));
  const [confirming, setConfirming] = useState<typeof batch>();
  const confirmButton = useRef<HTMLButtonElement>(null);
  const pill = Array.isArray(value) && ["labels", "keywords", "people", "subjects", "collections"].includes(fieldId);
  const emptyPills = pill && value.length === 0;
  const emptyLeases = fieldId === "leases" && typeof value === "object" && !Array.isArray(value) && value.kind === "replace" && value.leases?.length === 0;
  const confirmClear = emptyPills || emptyLeases || fieldId === "photoshoot" && typeof value === "string" && !value.trim();
  useEffect(() => {
    if (!confirming) return;
    if (confirming !== batch || !confirmClear || disabled || sourcePending) { setConfirming(undefined); return; }
    const timer = setTimeout(() => {
      if (document.activeElement !== confirmButton.current) setConfirming(undefined);
    }, 5000);
    return () => clearTimeout(timer);
  }, [confirming, batch, confirmClear, disabled, sourcePending]);
  const disclosure = useEditDisclosure();
  const [dismissed, setDismissed] = useState<number>();
  const showBusy = useDelayedBusy(save && save.state !== "finished" ? save.id : undefined);
  const showSourceBusy = useDelayedBusy(source?.state === "Saving…" ? source.id : undefined);
  if (!batch || !store.getState().connected) return source ? <div className="metadata-batch-tool"><FieldSignal key={source.id} label={label} state={source.state} detail={source.detail} onDismiss={source.dismiss}/></div> : null;
  const peerCount = batch.ids.length - Number(batch.ids.includes(imageId));
  const candidate = metadataIntent(fieldId, "overwrite", value, batch.ids);
  const valid = Boolean(candidate && !(candidate.fieldId === "metadata_subjects" && candidate.action === "add" && Array.isArray(candidate.value) && !candidate.value.length && !removed?.length));
  const busy = !!save && save.state !== "finished";
  const needsAttention = !!save && save.id !== dismissed && !busy && !panelSaveSucceeded(save);
  if (hideWhenDisabled && disabled && !busy && !needsAttention) return null;
  if (!source && !busy && !needsAttention && !valid && fieldId !== "metadata_dateTaken" && fieldId !== "subjects") return null;
  const clear = confirmClear || value === "" || (Array.isArray(value) ? !value.length : typeof value === "object" && (
    fieldId === "usageRights_category" && "category" in value && value.category === ""
  ));
  const others = `${peerCount} other ${peerCount === 1 ? "image" : "images"}`;
  const removals = pill && !emptyPills ? removed?.filter(item => !value.includes(item)) : undefined;
  const noun = fieldId;
  const applyLabel = pill ? emptyPills ? `Clear ${fieldId} on ${others}` : removals?.length
    ? `Apply ${fieldId} to ${others} (also removes ${removals.length === 1 ? `“${removals[0]}”` : `${removals.length} ${noun}`})` : `Add ${fieldId} to ${others}`
    : fieldId === "leases" ? clear ? `Clear leases on ${others}` : `Replace leases on ${peerCount === 1 ? "the" : "all"} ${others}`
    : clear ? `Clear ${label} on ${others}` : `Apply ${label} to ${others}`;
  const question = fieldId === "photoshoot" ? `Clear Photoshoot on ${others}?` : `Remove ALL ${fieldId} from the ${others}?`;
  const sourceIssue = !!source && source.state !== "Saving…";
  const sourceText = sourceIssue ? `${label} ${source.state.toLowerCase()}` : `Saving ${label}`;
  const captured = save?.intent.targetIds.length ?? peerCount;
  const batchText = `Applying ${label} to ${captured} other ${captured === 1 ? "image" : "images"}`;
  const reload = needsAttention && save.items.some(item => editIssue(item.imageId, label, item).reload);
  const tooltip = needsAttention ? `${label} edit needs attention` : sourceIssue ? sourceText : busy ? batchText : showSourceBusy ? sourceText
    : !valid && fieldId === "metadata_dateTaken" ? `${label} cannot be cleared` : applyLabel;
  const hasDetails = busy || needsAttention || sourceIssue || showSourceBusy;
  const receiptKey = busy || needsAttention ? `batch:${save.id}` : `source:${source?.id}`;
  const expanded = hasDetails && receiptKey === disclosure.openFor;
  const showConfirmation = confirming === batch && confirmClear && !disabled && !sourcePending && !busy;
  const apply = (confirmed = false) => {
    if (confirmClear && !confirmed) { setConfirming(batch); return; }
    if (clear && !confirmClear && typeof value !== "string" && !window.confirm(`${applyLabel}?`)) return;
    const intent = metadataIntent(fieldId, "overwrite", value, batch.ids.filter(id => id !== imageId));
    if (intent) store.getState().submitArrow(removals?.length ? { ...intent, removed: removals } : intent, key);
  };
  return <><div className="metadata-batch-tool" {...disclosure.events(expanded || !!confirming, () => setConfirming(undefined))}>
    <button ref={disclosure.trigger} type="button" disabled={!hasDetails && (disabled || pill && sourcePending || !valid || !peerCount)} className="metadata-edit-tool"
      aria-label={tooltip} title={tooltip} {...disclosure.attributes(showConfirmation || (hasDetails ? expanded : confirmClear ? false : undefined))}
      onClick={() => {
        if (hasDetails) { disclosure.toggle(receiptKey); return; }
        apply();
      }}>
      {showBusy || needsAttention || showSourceBusy || sourceIssue ? <SaveGlyph busy={!needsAttention && !sourceIssue}/> : <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M7,21L2,16l5-5l1.43,1.4L5.83,15H21v2H5.83l2.6,2.6L7,21Zm10-8l-1.42-1.4L18.18,9H3V7H18.18l-2.6-2.6L17,3l5,5l-5,5Z" />
      </svg>}
    </button>
    {showConfirmation && <div id={disclosure.popId} role="group" aria-label={question} className="metadata-batch-popover text-xs"><button ref={confirmButton} type="button" className="bg-grid-error text-white p-1" onBlur={() => setConfirming(undefined)} onClick={() => { setConfirming(undefined); apply(true); disclosure.focusTrigger(); }}>{question}</button></div>}
    <span className="sr-only" role="status">{needsAttention || sourceIssue || showBusy || showSourceBusy ? tooltip : ""}</span>
    {expanded && <div id={disclosure.popId} role="group" aria-label={`${label} update`} className="metadata-batch-popover text-xs">
      {source && <p>{sourceText} on this image.{source.detail && ` ${source.detail}`}{source.state === "Not confirmed" && " It may have saved."}</p>}
      {save && (busy || needsAttention) && <p>{busy ? metadataSaveStatus(save) : batchIssueSummary(save, label)}{reload && " Reload before saving again."}</p>}
      {!needsAttention && !busy && source && !disabled && valid && peerCount > 0 && <button type="button" className="mr-2 underline" onClick={() => { disclosure.close(); apply(); }}>{applyLabel}</button>}
      {busy && !disabled && valid && save?.intent.value !== value && <button type="button" className="mr-2 underline"
        onClick={() => { apply(); disclosure.focusTrigger(); }}>Apply newer value</button>}
      <button type="button" className="underline" onClick={() => { disclosure.focusTrigger(); disclosure.close(); if (needsAttention && !reload && save) setDismissed(save.id); if (sourceIssue) source.dismiss?.(); }}>{sourceIssue && source.dismiss || needsAttention && !reload ? "Dismiss" : "Close"}</button>
    </div>}
  </div>{fieldId === "subjects" && !!removals?.length && <p className="metadata-field-status hidden pointer-coarse:block">Batch arrow also removes {removals.join(", ")} from the {others}.</p>}</>;
}

export function useMetadataCommit(form = false, panelTargetKey?: string) {
  const store = useContext(MetadataEditorContext);
  const batch = useContext(FormBatchContext);
  return (input: { fieldId: string; action: string; value: string | string[] | Record<string, string | undefined> | LeaseChange; removed?: string[]; targetIds: readonly string[] }, returnFocus?: HTMLElement | null, origin?: "details-scalar") => {
    const intent = metadataIntent(input.fieldId, input.action, input.value, input.targetIds, input.removed);
    const source = form && batch && input.targetIds.length === 1 && ["labels", "people", "keywords", "subjects"].includes(input.fieldId) ? JSON.stringify([batch.key, input.targetIds[0], input.fieldId]) : undefined;
    const id = intent ? store.getState().submit(intent, false, source, origin) : undefined;
    if (!form && id !== undefined && !store.getState().panelSaves.some(item => item.id === id)) store.setState(state => ({ panelSaves: [{ id, targetKey: panelTargetKey ?? labelTargetKey(input.targetIds), returnFocus: returnFocus ? new WeakRef(returnFocus) : undefined }, ...state.panelSaves] }));
    return id === undefined ? undefined : store.getState().saves.get(id);
  };
}

const finishedSuccess = new WeakMap<MetadataSave, boolean>();
export function panelSaveSucceeded(save: MetadataSave) {
  if (save.state !== "finished") return false;
  const known = finishedSuccess.get(save);
  if (known !== undefined) return known;
  const success = !save.message && !save.excluded && save.items.length === save.intent.targetIds.length && save.items.every(item =>
    item.observation === "observed" && (item.state === "accepted-awaiting-visibility" || item.state === "unchanged") && !derivedIssue(item));
  finishedSuccess.set(save, success);
  return success;
}

export function usePendingPillIntents(targetKey: string, fieldId: string, formImageId?: string) {
  return useStore(useContext(MetadataEditorContext), useShallow(state => {
    const intents = [];
    const ids = formImageId ? state.pendingFieldIds(formImageId, fieldId) : state.panelSaves.filter(entry => entry.targetKey === targetKey).map(entry => entry.id);
    for (const id of ids) {
      const save = state.saves.get(id);
      if (!save || save.state === "finished" || save.intent.fieldId !== fieldId) continue;
      const item = formImageId ? derivedItem(save.items, formImageId) : undefined;
      if (item && item.state !== "queued" && item.state !== "submitted" && item.observation !== "pending") continue;
      if (save.intent.action === "add" || save.intent.action === "remove" || (save.intent.action === "overwrite" && Array.isArray(save.intent.value))) intents.push(save.intent);
    }
    return intents;
  }));
}

export function usePendingPanelIntent(targetKey: string, fieldId?: string, reconciling = false) {
  const [held, setHeld] = useState<number>();
  const active = useStore(useContext(MetadataEditorContext), state => {
    for (const entry of state.panelSaves) {
      if (entry.targetKey !== targetKey) continue;
      const save = state.saves.get(entry.id);
      if (save && (!fieldId || save.intent.fieldId === fieldId) && (save.state !== "finished" ||
        (reconciling && held === save.id && panelSaveSucceeded(save)))) return save.id;
    }
  });
  if (active !== held) setHeld(active);
  const store = useContext(MetadataEditorContext);
  return active === undefined ? undefined : store.getState().saves.get(active)?.intent;
}

const inspectedPanelIssues = new WeakSet<MetadataSave | LabelReceipt>();
function derivedIssue(item: MetadataSave["items"][number]): EditIssue | undefined {
  const result = item.result;
  if (result?.outcome !== "acknowledged" || !result.metadataFromRights || result.metadataFromRights === "acknowledged") return;
  return { imageId: item.imageId, field: "Metadata from rights", notSaved: result.metadataFromRights !== "unknown", reload: result.status === 401 || result.status === 419 };
}
const noLabels: readonly LabelReceipt[] = [];
export function SelectionSaveIndicator({ targetKey, compact = false, below = true, detailImageId, desktopCount, renderSlot = status => status, labelTotal = 0, labelConfirmed = 0, labelCount = 0, finishedLabels = noLabels }: { targetKey: string; compact?: boolean; below?: boolean; detailImageId?: string; desktopCount?: number; renderSlot?: (status: React.ReactElement | null) => React.ReactNode; labelTotal?: number; labelConfirmed?: number; labelCount?: number; finishedLabels?: readonly LabelReceipt[] }) {
  const editor = useContext(MetadataEditorContext);
  const [inspection, setInspection] = useState(0);
  const [saveId, metadataTotal, metadataConfirmed, metadataCount] = useStore(editor, useShallow(state => {
    let id = 0, total = 0, confirmed = 0, count = 0;
    for (let index = state.panelSaves.length - 1; index >= 0; index--) {
      const entry = state.panelSaves[index];
      const save = state.saves.get(entry.id);
      if (!save || save.state === "finished" || detailImageId && !save.intent.targetIds.includes(detailImageId)) continue;
      id = entry.id; count++; total += save.intent.targetIds.length;
      for (const item of save.items) if (item.observation === "observed" && (item.state === "accepted-awaiting-visibility" || item.state === "unchanged")) confirmed++;
    }
    return [id, total, confirmed, count] as const;
  }));
  const total = metadataTotal + labelTotal;
  const confirmed = metadataConfirmed + labelConfirmed;
  const busy = total > 0;
  const percent = busy ? 100 * confirmed / total : 0;
  const progressText = `${confirmed} of ${total} confirmed`;
  const finished = useStore(editor, useShallow(state => state.panelSaves.flatMap(entry => {
    const save = state.saves.get(entry.id);
    return save?.state === "finished" ? [save] : [];
  })));
  const details = useMemo(() => {
    const fields = new Map<string, Map<string, EditIssue>>();
    for (const save of [...[...finished].reverse(), ...finishedLabels].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))) {
      const intent = save.intent;
      const fieldId = "fieldId" in intent ? intent.fieldId : "labels";
      const value = "value" in intent ? intent.value : intent.label;
      const keys = fieldId === "location" ? Object.keys(value).map(component => `location:${component}`)
        : [JSON.stringify([fieldId, ...(intent.action === "add" || intent.action === "remove" ? [value] : intent.action === "prepend" || intent.action === "append" ? [intent.action, value] : [])])];
      const message = "id" in save ? save.message : undefined;
      const items = new Map(save.items.map(item => [item.imageId, item]));
      for (const key of keys) {
        const affected = fields.get(key) ?? new Map<string, EditIssue>();
        const field = fieldId === "location" ? "Location" : fieldId === "metadata_byline" ? "Byline" : FIELDS_BY_ID.get(pillDisplayField(fieldId))?.label ?? "Metadata";
        for (const id of save.intent.targetIds) {
          if (detailImageId && id !== detailImageId) continue;
          const item = items.get(id);
          if (fieldId === "usageRights_category" && item) {
            const derived = fields.get("metadata-from-rights") ?? new Map<string, EditIssue>();
            const issue = derivedIssue(item);
            if (issue && !inspectedPanelIssues.has(save)) derived.set(id, issue);
            else if (item.result?.outcome === "acknowledged" && item.result.metadataFromRights === "acknowledged" && item.observation === "observed") derived.delete(id);
            fields.set("metadata-from-rights", derived);
          }
          if (item?.observation === "observed" && (item.state === "unchanged" || item.state === "accepted-awaiting-visibility")) affected.delete(id);
          else if (!inspectedPanelIssues.has(save) && !(message?.startsWith("Stopped") && (!item || item.state === "stopped"))) affected.set(id, editIssue(id, field, item, !message || message.startsWith("Not sent")));
        }
        fields.set(key, affected);
      }
    }
    return [...fields.values()].flatMap(items => [...items.values()]);
  }, [finished, finishedLabels, inspection, detailImageId]);
  const issues = useMemo(() => [...new Set(details.map(issue => issue.imageId))], [details]);
  const operationKey = busy ? "saving" : undefined;
  const [visibleKey, setVisibleKey] = useState<string>();
  const visible = busy && visibleKey === operationKey;
  useEffect(() => {
    setVisibleKey(undefined);
    if (!operationKey) return;
    const timer = setTimeout(() => setVisibleKey(operationKey), 1500);
    return () => clearTimeout(timer);
  }, [operationKey]);
  if (detailImageId && busy) return null;
  if (issues.length) {
    const select = () => {
      const selection = useSelectionStore.getState();
      if (labelTargetKey([...selection.selectedIds]) !== targetKey) return;
      const subset = new Set(issues);
      selection.add(issues.filter(id => !selection.selectedIds.has(id)));
      selection.remove([...selection.selectedIds].filter(id => !subset.has(id)));
      const search = useSearchStore.getState();
      const first = issues.reduce((leading, id) => (search.imagePositions.get(id) ?? Infinity) < (search.imagePositions.get(leading) ?? Infinity) ? id : leading);
      const position = search.imagePositions.get(first);
      if (position !== undefined && search.results[position - search.bufferOffset]?.id === first) {
        search.setFocusedImageId(first);
        scrollFocusedIntoView();
      } else if (!search.params.aiQuery) {
        search.setFocusedImageId(first);
        void search.seekToFocused();
      }
      for (const save of finished) inspectedPanelIssues.add(save);
      for (const receipt of finishedLabels) inspectedPanelIssues.add(receipt);
      setInspection(value => value + 1);
      requestAnimationFrame(() => document.querySelector<HTMLElement>(compact ? '[data-bottom-sheet] button[aria-expanded]' : 'button[aria-label="Deselect"]')?.focus({ preventScroll: true }));
    };
    return renderSlot(<>{!compact && desktopCount !== undefined && <span role="status" aria-label={`${desktopCount.toLocaleString()} selected`} className="shrink-0 whitespace-nowrap px-2 text-sm text-grid-accent">{desktopCount.toLocaleString()} selected</span>}
        <EditIssueDisclosure issues={details} count={issues.length} compact={compact} below={below} onSelect={detailImageId ? undefined : select} /></>);
  }
      if (detailImageId) return null;
  if (!visible) return renderSlot(!desktopCount ? null : <span role="status" aria-label={`${desktopCount.toLocaleString()} selected`} aria-live="polite" aria-atomic="true" className="flex items-center px-2 text-grid-accent text-sm whitespace-nowrap shrink-0">
    {desktopCount.toLocaleString()}<span className="status-control-label">&nbsp;selected</span>
  </span>);
  const fieldId = metadataTotal ? editor.getState().saves.get(saveId)?.intent.fieldId : "labels";
  const field = fieldId && pillDisplayField(fieldId);
  const updating = metadataCount + labelCount > 1 ? `${metadataCount + labelCount} saves: ` : `Updating ${FIELDS_BY_ID.get(field ?? "")?.label ?? "selection"}: `;
  if (!compact) return renderSlot(<span role="progressbar" aria-label="Updating selected images" title={`${updating}${progressText}`}
    aria-valuemin={0} aria-valuemax={total} aria-valuenow={confirmed} aria-valuetext={progressText}
    className="isolate relative inline-flex self-stretch shrink-0 items-center gap-1.5 px-2 overflow-hidden text-white whitespace-nowrap tabular-nums @min-[800px]:w-[184px]">
    <span aria-hidden="true" className="absolute inset-y-0 left-0 -z-10 bg-grid-accent" style={{ width: `${percent}%` }} />
    <ProgressGlyph className="size-4 shrink-0" />
    <span className="status-control-label truncate">{updating}</span><span className="inline-block" style={{ minWidth: `${2 * String(total).length + 1}ch` }}>{confirmed}/{total}</span>
  </span>);
  return renderSlot(<span data-selection-title-state="saving" className="pointer-events-none inline-flex shrink-0 items-center w-[90px] h-11">
    <span role="progressbar" aria-label="Updating selected images" title={progressText}
      aria-valuemin={0} aria-valuemax={total} aria-valuenow={confirmed} aria-valuetext={progressText}
      className="inline-flex h-full w-full items-center gap-[5px] text-grid-text-bright">
      <ProgressGlyph className="size-4 shrink-0" />
      <span className="relative isolate grid h-5 min-w-0 flex-1 place-items-center overflow-hidden rounded-xs bg-[#303030] text-xs text-white tabular-nums">
        <span aria-hidden="true" className="absolute inset-y-0 left-0 -z-10 bg-[#116787]" style={{ width: `${percent}%` }} /><span className={total >= 10000 ? "text-[9px]" : total >= 1000 ? "text-[10px]" : undefined}>{confirmed}/{total}</span>
      </span>
    </span>
  </span>);
}

export function panelSaveAdmitted(save: MetadataSave | undefined, preparedMessage: string) {
  if (save && save.state !== "finished") return true;
  addToast({ category: save ? "warning" : "information", message: save ? metadataSaveStatus(save) : preparedMessage });
  return false;
}

export function SubjectSaveStatus({ id }: { id: number }) {
  const save = useStore(useContext(MetadataEditorContext), state => state.saves.get(id));
  return <span role="status" className="sr-only">{save && (save.state !== "finished" ? "Saving subjects" : panelSaveSucceeded(save) ? "Subjects saved" : "Subjects not confirmed")}</span>;
}

export function MetadataSaveFeedback({ fieldId, targetIds, saveId }: { fieldId: string; targetIds: readonly string[]; saveId?: number }) {
  const store = useContext(MetadataEditorContext);
  const field = pillCommandField(fieldId);
  const save = useStore(store, state => {
    const latest = saveId !== undefined ? state.saves.get(saveId) : state.latestSingle(targetIds[0], field);
    return latest?.state === "finished" && !panelSaveSucceeded(latest) ? latest : undefined;
  });
  if (!save || save.state !== "finished" || panelSaveSucceeded(save)) return null;
  const item = save.items.find(item => item.imageId === targetIds[0]);
  const derived = item && derivedIssue(item);
  const issue = derived ?? editIssue(targetIds[0], fieldId, item, true);
  if (issue.steps) return <p role="status" className="metadata-field-status">{fieldId === "collections" ? "Collection" : "Label"} changes: {issue.steps}{issue.reload && ". Reload page"}</p>;
  return <p role="status" className="metadata-field-status">{derived ? "Metadata from rights: 1 " : ""}{issue.notSaved ? derived ? "not saved" : "Not saved" : derived ? "not confirmed" : "Not confirmed"}</p>;
}