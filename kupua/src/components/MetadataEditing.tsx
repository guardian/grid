import { createContext, useContext, useRef, useState } from "react";
import { useStore } from "zustand";
import { metadataEditorStore, metadataIntent, metadataSaveStatus } from "@/stores/metadata-editor-store";

export const MetadataEditorContext = createContext(metadataEditorStore);
export const FormBatchContext = createContext<{ key: string; ids: readonly string[]; processing: number } | undefined>(undefined);

export function MetadataBatchArrow({ imageId, fieldId, label, value, disabled }: {
  imageId: string; fieldId: string; label: string; value: string; disabled: boolean;
}) {
  const batch = useContext(FormBatchContext);
  const store = useContext(MetadataEditorContext);
  const key = JSON.stringify([batch?.key, imageId, fieldId]);
  const save = useStore(store, state => state.saves.get(state.arrowSaves.get(key) ?? -1));
  const [detailsFor, setDetailsFor] = useState<number>();
  const [dismissed, setDismissed] = useState<number>();
  const trigger = useRef<HTMLButtonElement>(null);
  if (!batch || !store.getState().connected) return null;
  const targets = batch.ids.filter(id => id !== imageId);
  const valid = Boolean(metadataIntent(fieldId, "overwrite", value, targets));
  const busy = !!save && save.state !== "finished";
  const needsAttention = !!save && save.id !== dismissed && !busy && (!!save.message || save.excluded > 0
    || save.items.length !== save.intent.targetIds.length || save.items.some(item => item.observation !== "observed"));
  if (!busy && !needsAttention && !valid && fieldId !== "metadata_dateTaken") return null;
  const applyLabel = `Apply ${label} to ${targets.length} batch images`;
  const tooltip = busy ? `Applying ${label}...` : needsAttention ? `${label} edit needs attention` : applyLabel;
  const hasDetails = busy || needsAttention;
  const expanded = hasDetails && save?.id === detailsFor;
  const apply = () => {
    if (value === "" && !window.confirm(`Clear ${label} for ${targets.length} batch images?`)) return;
    const intent = metadataIntent(fieldId, "overwrite", value, [...targets]);
    if (intent) store.getState().submitArrow(intent, key);
  };
  return <div className="metadata-batch-tool"
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDetailsFor(undefined); }}
    onKeyDown={event => {
      if (event.key !== "Escape" || !expanded) return;
      event.stopPropagation();
      setDetailsFor(undefined);
      trigger.current?.focus();
    }}>
    <button ref={trigger} type="button" disabled={!hasDetails && (disabled || !valid || !targets.length)} className="metadata-edit-tool"
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
    {expanded && save && <div className="metadata-batch-popover text-xs">
      <p>{metadataSaveStatus(save)}</p>
      {busy && !disabled && valid && save.intent.value !== value && <button type="button" className="mr-2 underline"
        onClick={() => { apply(); trigger.current?.focus(); }}>Apply newer value</button>}
      {busy ? <button type="button" className="underline" aria-label="Stop batch save" onClick={() => store.getState().stop(save.id)}>Stop remaining</button>
        : <button type="button" className="underline" onClick={() => { trigger.current?.focus(); setDismissed(save.id); }}>Dismiss</button>}
    </div>}
  </div>;
}

export function useMetadataCommit() {
  const store = useContext(MetadataEditorContext);
  return (input: { fieldId: string; action: string; value: string | Record<string, string | undefined>; targetIds: readonly string[] }) => {
    const intent = metadataIntent(input.fieldId, input.action, input.value, input.targetIds);
    return intent ? store.getState().submit(intent) : undefined;
  };
}

export function MetadataSaveFeedback({ fieldId, targetIds, saveId, batch = false }: { fieldId: string; targetIds: readonly string[]; saveId?: number; batch?: boolean }) {
  const store = useContext(MetadataEditorContext);
  const field = metadataIntent(fieldId, "overwrite", fieldId === "metadata_dateTaken" ? "2026-01-01T00:00:00Z" : "", targetIds)?.fieldId;
  const save = useStore(store, state => saveId !== undefined ? state.saves.get(saveId)
    : [...state.saves.values()].findLast(item => item.intent.fieldId === field && item.intent.targetIds.length === targetIds.length
      && item.intent.targetIds.every(id => targetIds.includes(id))));
  if (!save) return null;
  return <div className="mt-1 text-xs text-grid-text-muted">
    <p role="status">{batch ? "Batch: " : targetIds.length === 1 ? "This image: " : ""}{metadataSaveStatus(save)}</p>
    {save.state !== "finished" && <button type="button" className="underline" aria-label={batch ? "Stop batch save" : "Stop image save"}
      onClick={() => store.getState().stop(save.id)}>Stop remaining</button>}
  </div>;
}