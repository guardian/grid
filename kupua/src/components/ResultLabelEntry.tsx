import { useContext, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useStore } from "zustand";
import { LabelEditorContext } from "./LabelEditor";
import { MetadataSuggestionInput } from "./MetadataSuggestionInput";
import { PillActionButton } from "./SearchPill";
import { labelTargetKey } from "@/stores/label-editor-store";
import { useSelectionStore } from "@/stores/selection-store";
import { useSearchStore } from "@/stores/search-store";
import { attachedEnrichment, useEnrichmentStore } from "@/stores/enrichment-store";
import { resolveImageOverlay, isImageMetadataCurrent, getImageAvailability } from "@/lib/image-read-freshness";
import { isGridSessionInvalidated } from "@/lib/grid-api-instance";
import { addressableLabel, parseLabelEntry } from "@/lib/grid-mutation-policy";

export function resultLabelTarget(id: string) {
  const selection = useSelectionStore.getState(), search = useSearchStore.getState();
  if (selection.selectedIds.size || selection.isRangeWalking || isGridSessionInvalidated() || getImageAvailability(id)) return;
  const index = search.imagePositions.get(id);
  const image = index === undefined ? undefined : search.results[index - search.bufferOffset];
  if (!image || image.id !== id || image.softDeletedMetadata || image.__availability) return;
  const attached = attachedEnrichment(image), stored = useEnrichmentStore.getState().data.get(id);
  const resource = resolveImageOverlay(image, stored, attached)?.resource;
  if (isImageMetadataCurrent(image, stored, attached) && resource?.links.some(link => link.rel === "edits" && link.href)) return { resource };
}

export function ResultLabelEntry({ anchor, id, close }: { anchor: HTMLElement; id: string; close: () => void }) {
  const store = useContext(LabelEditorContext);
  const key = labelTargetKey([id]);
  const value = useStore(store, state => state.drafts.get(key)?.value ?? "");
  const selected = useSelectionStore(state => !!state.selectedIds.size || state.isRangeWalking);
  const form = useRef<HTMLFormElement>(null);
  const [error, setError] = useState("");
  useLayoutEffect(() => {
    let frame = 0;
    const place = () => {
      frame = 0;
      if (!anchor.isConnected || anchor.dataset.resultLabelAdd !== id || selected || !anchor.getClientRects().length) { close(); return; }
      const rect = anchor.getBoundingClientRect(), panel = form.current!;
      const region = anchor.closest('[role="region"]')?.getBoundingClientRect();
      if (region && (rect.bottom <= region.top || rect.top >= region.bottom)) { close(); return; }
      const width = panel.offsetWidth, height = panel.offsetHeight;
      const left = `${Math.max(8, Math.min(innerWidth - width - 8, rect.right - width))}px`;
      const top = `${rect.bottom + height + 8 <= innerHeight ? rect.bottom + 4 : Math.max(8, rect.top - height - 4)}px`;
      if (panel.style.left !== left) panel.style.left = left;
      if (panel.style.top !== top) panel.style.top = top;
      panel.dispatchEvent(new Event("result-label-placed"));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(place); };
    const onScroll = (event: Event) => { if (event.target === document || event.target instanceof Element && event.target.contains(anchor)) schedule(); };
    const outside = (event: PointerEvent) => { if (!form.current?.contains(event.target as Node) && event.target !== anchor && !anchor.contains(event.target as Node)) close(); };
    const visibility = new IntersectionObserver(entries => { if (!entries[0]?.isIntersecting || !anchor.isConnected || anchor.dataset.resultLabelAdd !== id) close(); }, { root: anchor.closest('[role="region"]') });
    visibility.observe(anchor);
    place();
    document.addEventListener("pointerdown", outside, true); document.addEventListener("scroll", onScroll, true); window.addEventListener("resize", schedule);
    return () => { cancelAnimationFrame(frame); visibility.disconnect(); document.removeEventListener("pointerdown", outside, true); document.removeEventListener("scroll", onScroll, true); window.removeEventListener("resize", schedule); };
  }, [anchor, id, close, selected]);
  const done = () => { store.getState().setDraft([id], ""); close(); if (anchor.isConnected && anchor.dataset.resultLabelAdd === id) anchor.focus({ preventScroll: true }); };
  const save = () => {
    const labels = parseLabelEntry(value);
    if (!labels.length || !labels.every(addressableLabel)) { setError("Enter a label other than . or .."); return; }
    const target = resultLabelTarget(id);
    if (!target || anchor.dataset.resultLabelAdd !== id || !anchor.isConnected || !window.matchMedia("(hover: hover) and (pointer: fine)").matches || !store.getState().prepareLabels(labels, { targetIds: [id], targets: new Map([[id, target]]) })) { setError("Label change not sent"); return; }
    done();
  };
  return createPortal(<form ref={form} role="dialog" aria-label="Add labels to image" data-suggestion-scope data-suggestion-width className="result-label-entry" onSubmit={event => { event.preventDefault(); save(); }} onKeyDown={event => {
    event.stopPropagation(); if (event.key === "Escape" && !event.nativeEvent.isComposing) { event.preventDefault(); done(); }
  }} onClick={event => event.stopPropagation()}>
    <MetadataSuggestionInput label="New labels" fieldKey="label" value={value} placeholder="label1, label2, label3…" onChange={next => { setError(""); store.getState().setDraft([id], next); }} />
    <PillActionButton action="cancel" label="Cancel label entry" onClick={done} />
    <PillActionButton action="confirm" label="Save labels" disabled={!value.trim()} onClick={save} />
    {error && <span role="status" className="col-span-full text-xs text-grid-error">{error}</span>}
  </form>, document.body);
}