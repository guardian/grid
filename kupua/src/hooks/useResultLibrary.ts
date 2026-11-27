import { createElement, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type MouseEvent as ReactMouseEvent } from "react";
import { ResultLabelEntry, resultLabelTarget } from "@/components/ResultLabelEntry";
import { LabelEditorContext } from "@/components/LabelEditor";
import { labelTargetKey } from "@/stores/label-editor-store";
import { useStore } from "zustand";
import { MetadataEditorContext, useMetadataCommit } from "@/components/MetadataEditing";
import { serviceLink, isGridSessionInvalidated, subscribeGridSessionInvalidation } from "@/lib/grid-api-instance";
import { describeImageAction } from "@/lib/image-actions";
import { isImageMetadataCurrent, resolveImageOverlay } from "@/lib/image-read-freshness";
import { useSearchStore } from "@/stores/search-store";
import { useSelectionStore } from "@/stores/selection-store";
import { attachedEnrichment, useEnrichmentStore } from "@/stores/enrichment-store";

const pointerQuery = "(hover: hover) and (pointer: fine)";
const finePointer = () => window.matchMedia?.(pointerQuery).matches ?? false;
function watchPointer(change: () => void) {
  const media = window.matchMedia?.(pointerQuery);
  media?.addEventListener("change", change);
  return () => media?.removeEventListener("change", change);
}
function inlineButton(target: EventTarget | null) {
  return target instanceof Element ? target.closest<HTMLButtonElement>("button[data-inline-library],button[data-result-label-add]") : null;
}

export function useResultLibrary(search: boolean) {
  const editor = useContext(MetadataEditorContext);
  const labels = useContext(LabelEditorContext);
  const commit = useMetadataCommit();
  const fine = useSyncExternalStore(watchPointer, finePointer, () => false);
  const invalid = useSyncExternalStore(subscribeGridSessionInvalidation, isGridSessionInvalidated, () => false);
  const active = search && fine && !invalid && import.meta.env.VITE_USE_MEDIA_API === "true" && editor.getState().connected;
  const [grant, setGrant] = useState(false);
  useEffect(() => {
    if (!active) return;
    let mounted = true;
    void serviceLink("archive").then(link => { if (mounted) setGrant(!!link); });
    return () => { mounted = false; };
  }, [active]);
  const enabled = active && grant;
  const [entry, setEntry] = useState<{ anchor: HTMLButtonElement; id: string }>();
  const close = useCallback(() => setEntry(undefined), []);
  const draftTitle = (target: EventTarget | null) => {
    const button = inlineButton(target), id = button?.dataset.resultLabelAdd;
    if (id && button) button.title = labels.getState().drafts.get(labelTargetKey([id]))?.value ? "Resume label entry for this image" : "Add labels to this image";
  };
  const pending = useStore(editor, state => enabled ? state.pendingArchiveIds : undefined);
  const press = useRef<{ button: HTMLButtonElement; intent?: string; touch: boolean } | null>(null);
  function activate(event: ReactMouseEvent) {
    const button = inlineButton(event.target);
    if (!button) return;
    event.stopPropagation();
    const origin = press.current;
    press.current = null;
    const intent = button.dataset.resultLabelAdd ?? button.dataset.inlineLibrary;
    if (!active || !finePointer() || isGridSessionInvalidated() || event.detail > 1 || event.button !== 0
      || (event.nativeEvent as PointerEvent).pointerType === "touch" || event.detail && origin && (origin.button !== button || origin.intent !== intent || origin.touch)) return;
    const labelId = button.dataset.resultLabelAdd;
    if (labelId) { if (resultLabelTarget(labelId)) setEntry({ anchor: button, id: labelId }); return; }
    if (!enabled) return;
    const selection = useSelectionStore.getState();
    const id = button.dataset.libraryImage!;
    if (selection.selectedIds.size || selection.isRangeWalking || editor.getState().hasPendingField(id, "archived")) return;
    const state = useSearchStore.getState();
    const position = state.imagePositions.get(id);
    const image = position === undefined ? undefined : state.results[position - state.bufferOffset];
    if (!image || image.id !== id || typeof image.userMetadata?.archived !== "boolean") return;
    const stored = useEnrichmentStore.getState().data.get(id), attached = attachedEnrichment(image);
    const overlay = resolveImageOverlay(image, stored, attached);
    const action = describeImageAction("library", { api: true, archive: grant, targets: [{ id, image, overlay, pending: !isImageMetadataCurrent(image, stored, attached) }] });
    if (!action.reason && action.operation === button.dataset.inlineLibrary && action.eligibleIds.includes(id)) {
      commit({ fieldId: "archived", action: "overwrite", value: action.operation, targetIds: [id] }, button);
    }
  }
  return { enabled, pending, labelEditing: active, entry: active && entry ? createElement(ResultLabelEntry, { key: entry.id, ...entry, close }) : null, events: active ? {
    onFocusCapture(event: React.FocusEvent) { draftTitle(event.target); },
    onPointerOverCapture(event: React.PointerEvent) { draftTitle(event.target); },
    onClickCapture: activate,
    onPointerDownCapture(event: React.PointerEvent) {
      const button = inlineButton(event.target);
      if (button) press.current = { button, intent: button.dataset.resultLabelAdd ?? button.dataset.inlineLibrary, touch: event.pointerType === "touch" };
    },
    onMouseDownCapture(event: ReactMouseEvent) {
      const button = inlineButton(event.target);
      if (button) { event.preventDefault(); event.stopPropagation(); if (!event.button) button.focus({ preventScroll: true }); }
    },
    onDoubleClickCapture(event: ReactMouseEvent) { if (inlineButton(event.target)) event.stopPropagation(); },
  } : undefined };
}