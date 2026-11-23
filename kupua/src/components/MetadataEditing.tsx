import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
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
  return { track, state, locked: state === "Saving…" || state === "Not confirmed" };
}
export function FieldSaveNote({ state }: { state?: FieldSaveState }) {
  return state ? <span role="status" className="metadata-field-status" data-save-state={state}>{state}</span> : null;
}
export function SavingValue({ saving, state = saving ? "Saving…" : undefined, children }: { saving?: boolean; state?: FieldSaveState; children: React.ReactNode }) {
  if (!state) return <>{children}</>;
  return <div className="metadata-saving" data-field-state={state}><FieldSaveNote state={state} /><div aria-busy={state === "Saving…"}>{children}</div></div>;
}
export const FormBatchContext = createContext<{ key: string; ids: readonly string[] } | undefined>(undefined);

export function MetadataBatchArrow({ imageId, fieldId, label, value, disabled }: {
  imageId: string; fieldId: string; label: string; value: string | string[] | Record<string, string | undefined> | LeaseChange; disabled: boolean;
}) {
  const batch = useContext(FormBatchContext);
  const store = useContext(MetadataEditorContext);
  const key = JSON.stringify([batch?.key, imageId, fieldId]);
  const save = useStore(store, state => state.saves.get(state.arrowSaves.get(key) ?? -1));
  const removed = useStore(store, state => state.removedPills.get(key));
  const sourcePending = useStore(store, state => Array.isArray(value) && state.hasPendingField(imageId, fieldId === "people" ? "metadata_peopleInImage" : fieldId === "keywords" ? "metadata_keywords" : fieldId));
  const [confirming, setConfirming] = useState<typeof batch>();
  const pill = Array.isArray(value) && ["labels", "keywords", "people", "collections"].includes(fieldId);
  const emptyPills = pill && value.length === 0;
  useEffect(() => {
    if (!confirming) return;
    if (confirming !== batch || !emptyPills || disabled || sourcePending) { setConfirming(undefined); return; }
    const timer = setTimeout(() => setConfirming(undefined), 5000);
    return () => clearTimeout(timer);
  }, [confirming, batch, emptyPills, disabled, sourcePending]);
  const [detailsFor, setDetailsFor] = useState<number>();
  const [dismissed, setDismissed] = useState<number>();
  const trigger = useRef<HTMLButtonElement>(null);
  if (!batch || !store.getState().connected) return null;
  const peerCount = batch.ids.length - Number(batch.ids.includes(imageId));
  const valid = Boolean(metadataIntent(fieldId, "overwrite", value, batch.ids));
  const busy = !!save && save.state !== "finished";
  const needsAttention = !!save && save.id !== dismissed && !busy && !panelSaveSucceeded(save);
  const unsupported = fieldId === "collections" || fieldId === "photoshoot" ? `${label} batch editing is not connected` : undefined;
  if (!busy && !needsAttention && !valid && fieldId !== "metadata_dateTaken" && !unsupported) return null;
  const clear = value === "" || (Array.isArray(value) ? !value.length : typeof value === "object" && (
    fieldId === "leases" && value.kind === "replace" && value.leases?.length === 0 ||
    fieldId === "usageRights_category" && "category" in value && value.category === ""
  ));
  const peers = `${peerCount} ${peerCount === 1 ? "image" : "images"}`;
  const others = `${peerCount} other ${peerCount === 1 ? "image" : "images"}`;
  const removals = pill && !emptyPills ? removed?.filter(item => !value.includes(item)) : undefined;
  const noun = fieldId === "people" ? "people" : fieldId === "keywords" ? "keywords" : "labels";
  const applyLabel = pill ? emptyPills ? `Clear ${fieldId} on ${others}` : removals?.length
    ? `Apply ${fieldId} to ${others} (also removes ${removals.length === 1 ? `“${removals[0]}”` : `${removals.length} ${noun}`})` : `Add ${fieldId} to ${others}`
    : fieldId === "leases" ? clear ? `Clear leases on ${others}` : `Replace leases on ${peerCount === 1 ? "the" : "all"} ${others}`
    : clear ? `Clear ${label} on ${peers}` : `Apply ${label} to ${peerCount} batch ${peerCount === 1 ? "image" : "images"}`;
  const question = `Remove ALL ${fieldId} from the ${others}?`;
  const tooltip = busy ? `Applying ${label}...` : needsAttention ? `${label} edit needs attention`
    : unsupported ? `${applyLabel} (${unsupported})` : !valid && fieldId === "metadata_dateTaken" ? `${label} cannot be cleared` : applyLabel;
  const hasDetails = busy || needsAttention;
  const expanded = hasDetails && save?.id === detailsFor;
  const apply = (confirmed = false) => {
    if (emptyPills && !confirmed) { setConfirming(batch); return; }
    if (clear && !emptyPills && !window.confirm(`${applyLabel}?`)) return;
    if (!clear && fieldId === "leases" && !window.confirm(`Replace all leases on ${peers}?`)) return;
    const intent = metadataIntent(fieldId, "overwrite", value, batch.ids.filter(id => id !== imageId));
    if (intent) store.getState().submitArrow(removals?.length ? { ...intent, removed: removals } : intent, key);
  };
  return <div className="metadata-batch-tool"
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { setDetailsFor(undefined); setConfirming(undefined); } }}
    onKeyDown={event => {
      if (event.key !== "Escape" || (!expanded && !confirming)) return;
      setConfirming(undefined);
      event.stopPropagation();
      setDetailsFor(undefined);
      trigger.current?.focus();
    }}>
    <button ref={trigger} type="button" disabled={!hasDetails && (disabled || pill && sourcePending || !valid || !peerCount)} className="metadata-edit-tool"
      aria-label={tooltip} title={tooltip} aria-expanded={hasDetails ? expanded : undefined}
      onClick={() => {
        if (hasDetails) { setDetailsFor(expanded ? undefined : save?.id); return; }
        apply();
      }}>
      {busy ? <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <circle className="upload-progress-arc" r="9" pathLength="100" transform="translate(12 12) rotate(-95) scale(1 -1)" />
      </svg> : needsAttention ? <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-grid-warning" aria-hidden="true">
        <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
      </svg> : <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M7,21L2,16l5-5l1.43,1.4L5.83,15H21v2H5.83l2.6,2.6L7,21Zm10-8l-1.42-1.4L18.18,9H3V7H18.18l-2.6-2.6L17,3l5,5l-5,5Z" />
      </svg>}
    </button>
    {confirming === batch && emptyPills && !disabled && !sourcePending && !busy && <div className="metadata-batch-popover text-xs"><button type="button" className="bg-grid-error text-white p-1" onClick={() => { setConfirming(undefined); apply(true); trigger.current?.focus(); }}>{question}</button></div>}
    {expanded && save && <div className="metadata-batch-popover text-xs">
      <p>{metadataSaveStatus(save)}</p>
      {busy && !disabled && valid && save.intent.value !== value && <button type="button" className="mr-2 underline"
        onClick={() => { apply(); trigger.current?.focus(); }}>Apply newer value</button>}
      {!busy && <button type="button" className="underline" onClick={() => { trigger.current?.focus(); setDismissed(save.id); }}>Dismiss</button>}
    </div>}
  </div>;
}

export function useMetadataCommit(form = false) {
  const store = useContext(MetadataEditorContext);
  const batch = useContext(FormBatchContext);
  return (input: { fieldId: string; action: string; value: string | Record<string, string | undefined> | LeaseChange; targetIds: readonly string[] }, returnFocus?: HTMLElement | null) => {
    const intent = metadataIntent(input.fieldId, input.action, input.value, input.targetIds);
    const source = form && batch && input.targetIds.length === 1 && ["labels", "people", "keywords"].includes(input.fieldId) ? JSON.stringify([batch.key, input.targetIds[0], input.fieldId]) : undefined;
    const id = intent ? store.getState().submit(intent, false, source) : undefined;
    if (!form && id !== undefined && !store.getState().panelSaves.some(item => item.id === id)) store.setState(state => ({ panelSaves: [{ id, targetKey: labelTargetKey(input.targetIds), returnFocus: returnFocus ? new WeakRef(returnFocus) : undefined }, ...state.panelSaves] }));
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
        const field = fieldId === "location" ? "Location" : fieldId === "metadata_byline" ? "Byline" : FIELDS_BY_ID.get(fieldId === "metadata_peopleInImage" ? "people" : fieldId === "metadata_keywords" ? "keywords" : fieldId)?.label ?? "Metadata";
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
  const field = fieldId === "metadata_peopleInImage" ? "people" : fieldId === "metadata_keywords" ? "keywords" : fieldId;
  const updating = metadataCount + labelCount > 1 ? `${metadataCount + labelCount} saves: ` : `Updating ${FIELDS_BY_ID.get(field ?? "")?.label ?? "selection"}: `;
  if (!compact) return renderSlot(<span role="progressbar" aria-label="Updating selected images" title={`${updating}${progressText}`}
    aria-valuemin={0} aria-valuemax={total} aria-valuenow={confirmed} aria-valuetext={progressText}
    className="isolate relative inline-flex self-stretch shrink-0 items-center gap-1.5 px-2 overflow-hidden text-white whitespace-nowrap tabular-nums @min-[800px]:w-[184px]">
    <span aria-hidden="true" className="absolute inset-y-0 left-0 -z-10 bg-grid-accent" style={{ width: `${percent}%` }} />
    <svg className="size-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true"><circle className="upload-progress-arc" r="9" pathLength="100" transform="translate(12 12) rotate(-95) scale(1 -1)" /></svg>
    <span className="status-control-label truncate">{updating}</span><span className="inline-block" style={{ minWidth: `${2 * String(total).length + 1}ch` }}>{confirmed}/{total}</span>
  </span>);
  return renderSlot(<span data-selection-title-state="saving" className="pointer-events-none inline-flex shrink-0 items-center w-[90px] h-11">
    <span role="progressbar" aria-label="Updating selected images" title={progressText}
      aria-valuemin={0} aria-valuemax={total} aria-valuenow={confirmed} aria-valuetext={progressText}
      className="inline-flex h-full w-full items-center gap-[5px] text-grid-text-bright">
      <svg className="size-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true"><circle className="upload-progress-arc" r="9" pathLength="100" transform="translate(12 12) rotate(-95) scale(1 -1)" /></svg>
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

export function MetadataSaveFeedback({ fieldId, targetIds, saveId }: { fieldId: string; targetIds: readonly string[]; saveId?: number }) {
  const store = useContext(MetadataEditorContext);
  const field = fieldId === "keywords" ? "metadata_keywords" : fieldId === "people" ? "metadata_peopleInImage" : fieldId;
  const save = useStore(store, state => {
    const latest = saveId !== undefined ? state.saves.get(saveId) : state.latestSingle(targetIds[0], field);
    return latest?.state === "finished" && !panelSaveSucceeded(latest) ? latest : undefined;
  });
  if (!save || save.state !== "finished" || panelSaveSucceeded(save)) return null;
  const item = save.items.find(item => item.imageId === targetIds[0]);
  const derived = item && derivedIssue(item);
  const issue = derived ?? editIssue(targetIds[0], fieldId, item, true);
  if (issue.steps) return <p role="status" className="metadata-field-status">Label changes: {issue.steps}{issue.reload && ". Reload page"}</p>;
  return <p role="status" className="metadata-field-status">{derived ? "Metadata from rights: 1 " : ""}{issue.notSaved ? derived ? "not saved" : "Not saved" : derived ? "not confirmed" : "Not confirmed"}</p>;
}