import { useDeleteConfirmation } from "@/hooks/useDeleteConfirmation";
import { useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useStore } from "zustand";
import { MetadataEditorContext, MetadataSaveFeedback, useMetadataCommit } from "./MetadataEditing";
import { labelTargetKey } from "@/stores/label-editor-store";
import { useSelectionStore } from "@/stores/selection-store";
import { useSearchStore } from "@/stores/search-store";
import { useEnrichmentStore } from "@/stores/enrichment-store";
import { isGridSessionInvalidated, serviceLink, serviceLinkAvailable, subscribeGridSessionInvalidation } from "@/lib/grid-api-instance";
import { useImageActionStore } from "@/stores/image-action-store";
import { addToast } from "@/stores/toast-store";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useActionPopupPlacement } from "@/hooks/useActionPopupPlacement";
import { Chevron } from "./Chevron";
import { useCropSettings } from "@/hooks/useCropSettings";
import { describeImageAction, IMAGE_ACTIONS, selectionImageActionContext, SHARE_IMAGE_LIMIT, type ImageAction, type ImageActionContext } from "@/lib/image-actions";

import { LibraryIcon } from "./LibraryIcon";

function ImageActionIcon({ action }: { action: Exclude<ImageAction, "library"> }) {
  const paths = {
    share: "M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7a3.2 3.2 0 0 0 0-1.4l7.05-4.11A3 3 0 1 0 15 5c0 .24.03.47.09.7L8.04 9.81a3 3 0 1 0 0 4.38l7.12 4.16A3 3 0 1 0 18 16.08Z",
    "full-frame": "M6 2v4H2v2h4v10h12v4h2v-4h2v-2H8V2H6Zm4 4v2h6v6h2V6h-8Z",
    download: "M19 9h-4V3H9v6H5l7 7 7-7ZM5 18v3h14v-3H5Z",
    delete: "M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12ZM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4Z",
  };
  return <svg className="size-4 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={paths[action]} /></svg>;
}

function ImageActionOptions({ context, resolveContext, actions, label }: {
  context: ImageActionContext; resolveContext?: () => ImageActionContext; actions: readonly ImageAction[]; label: string;
}) {
  const fullFrame = label === "Full frame options";
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const id = useId();
  const placement = useActionPopupPlacement(trigger, popup, open, true);
  const targetKey = JSON.stringify(context.targets.map(target => target.id));
  useEffect(() => { setOpen(false); }, [targetKey]);
  useFocusTrap(popup, open);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  return <div ref={ref} data-image-action-options data-crop-options={fullFrame || undefined} className={`relative flex shrink-0 ${fullFrame ? "self-center h-11" : "self-stretch"}`}>
    <button ref={trigger} type="button" aria-label={label} title={fullFrame ? "Crop full frame" : label} aria-expanded={open}
      aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)} className={`flex ${fullFrame ? "w-[22px] h-11" : "w-8 h-full"} items-center justify-center hover:bg-grid-hover cursor-pointer`}>
      {fullFrame ? <Chevron direction={open ? "up" : "down"} />
        : <svg className="size-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" /></svg>}
    </button>
    {open && <div ref={popup} tabIndex={-1} id={id} data-image-action-popup
      onKeyDown={event => {
        if (event.key !== "Tab") event.stopPropagation();
        if (event.key === "Escape") { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
      }}
      style={{ maxHeight: placement.maxHeight, width: "min(260px, calc(100vw - 16px))", translate: `${placement.shiftX}px 0` }}
      className={`absolute right-0 ${placement.below ? "top-full mt-2" : "bottom-full mb-2"} z-[60] overflow-y-auto border border-grid-separator bg-grid-bg shadow-lg outline-none`}>
      <ImageActions context={context} resolveContext={resolveContext} actions={actions} expanded showReasons={!fullFrame} onPrepared={() => { setOpen(false); trigger.current?.focus(); }} />
    </div>}
  </div>;
}

export function FullFrameOptions({ context }: { context: ImageActionContext }) {
  return <ImageActionOptions context={context} actions={["full-frame"]} label="Full frame options" />;
}

interface ImageActionsProps {
  context: ImageActionContext;
  resolveContext?: () => ImageActionContext;
  actions?: readonly ImageAction[];
  expanded?: boolean;
  onPrepared?: () => void;
  presentation?: "toolbar" | "detail" | "floaty";
  showReasons?: boolean;
  iconOnly?: boolean;
  uploadForm?: boolean;
  selectedIds?: ReadonlySet<string>;
}

let latestShare = 0;

async function shareImages(ids: readonly string[], selection: boolean) {
  const attempt = ++latestShare;
  const path = selection
    ? `/search?nonFree=true&ids=${ids.map(id => encodeURIComponent(id)).join(",")}`
    : `/images/${encodeURIComponent(ids[0])}`;
  const href = new URL(path, window.location.origin).href;
  const link = { href, label: "Open link" };
  let copied = false;
  try {
    await navigator.clipboard.writeText(href);
    copied = true;
  } catch { /* The same link remains available. */ }
  if (attempt !== latestShare) return;
  addToast({ category: copied ? "success" : "information", message: copied ? "Share link copied to clipboard." : "Share with URL",
    lifespan: "session", interaction: "share", link });
}

function setsOverlap(smaller: ReadonlySet<string>, larger: ReadonlySet<string>) {
  for (const id of smaller) if (larger.has(id)) return true;
  return false;
}

export function SelectionImageActions(props: Omit<ImageActionsProps, "context" | "resolveContext">) {
  const selected = useSelectionStore(state => state.selectedIds);
  const targetKey = useMemo(() => labelTargetKey([...selected]), [selected]);
  const editor = useContext(MetadataEditorContext);
  const saving = (state: ReturnType<typeof editor.getState>, key: string) => state.panelSaves.some(entry => {
    if (entry.targetKey !== key) return false;
    const save = state.saves.get(entry.id);
    return save?.intent.fieldId !== "archived" && (save?.state === "queued" || save?.state === "saving");
  });
  const metadataSaving = useStore(editor, state => saving(state, targetKey));
  useSelectionStore(state => state.metadataRevision);
  useSelectionStore(state => state.pendingFetchIds);
  useSelectionStore(state => state.isRangeWalking);
  useSearchStore(state => state.results);
  useEnrichmentStore(state => state.data);
  return <ImageActions {...props} selectedIds={selected} context={{ ...selectionImageActionContext(null), metadataSaving }} resolveContext={() => {
    const context = selectionImageActionContext(null);
    return { ...context, metadataSaving: saving(editor.getState(), labelTargetKey(context.targets.map(target => target.id))) };
  }} />;
}

export function ImageActions({ context, resolveContext, actions = IMAGE_ACTIONS, expanded = false, onPrepared, presentation = "toolbar", showReasons = true, iconOnly = false, uploadForm = false, selectedIds }: ImageActionsProps) {
  const editor = useContext(MetadataEditorContext);
  const commit = useMetadataCommit(uploadForm);
  const pendingArchive = useStore(editor, state => actions.includes("library") ? state.pendingArchiveIds : undefined);
  const libraryBusy = !!pendingArchive?.size && (selectedIds && selectedIds.size > pendingArchive.size
    ? setsOverlap(pendingArchive, selectedIds) : context.targets.some(target => pendingArchive.has(target.id)));
  useSyncExternalStore(subscribeGridSessionInvalidation, isGridSessionInvalidated, () => false);
  const { settings: cropSettings } = useCropSettings();
  const [archive, setArchive] = useState(() => import.meta.env.VITE_USE_MEDIA_API === "true" ? serviceLinkAvailable("archive") : null);
  const settledOpacity = useRef(new Map<ImageAction, number>());
  const [narrow, setNarrow] = useState(() => window.matchMedia?.("(max-width: 599px)").matches ?? false);
  useEffect(() => {
    const query = window.matchMedia?.("(max-width: 599px)");
    if (!query) return;
    const change = () => setNarrow(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (import.meta.env.VITE_USE_MEDIA_API !== "true" || archive !== null) return;
    let active = true;
    void serviceLink("archive").then(link => { if (active) setArchive(Boolean(link)); });
    return () => { active = false; };
  }, [archive]);
  const current = { ...context, archive, cropSettings };
  const descriptions = new Map(actions.map(action => [action, describeImageAction(action, current)] as const));
  const targetKey = JSON.stringify(current.targets.map(target => target.id));
  const selectionToolbar = selectedIds !== undefined && presentation === "toolbar" && !expanded;
  const lastLibrary = useRef<{ key: string; icon: "add" | "remove" | "locked"; label: string } | undefined>(undefined);
  useLayoutEffect(() => {
    const library = descriptions.get("library");
    if (library && (selectionToolbar ? !library.pending : library.libraryIcon)) {
      lastLibrary.current = { key: targetKey, icon: library.libraryIcon ?? "add", label: library.label };
    }
    for (const [action, description] of descriptions) {
      if (!description.pending) settledOpacity.current.set(action, description.reason ? 0.4 : 1);
    }
  });
  const deleteReason = descriptions.get("delete")?.reason;
  const [armedDelete, setArmedDelete] = useDeleteConfirmation(targetKey, deleteReason);
  const activate = (action: ImageAction, trigger: HTMLButtonElement) => {
    const latest = { ...(resolveContext?.() ?? context), archive };
    const description = describeImageAction(action, latest);
    if (description.reason) return;
    if (action === "share") {
      if (current.targets.length > SHARE_IMAGE_LIMIT) return;
      void shareImages(description.eligibleIds, selectedIds !== undefined);
      onPrepared?.();
      return;
    }
    const latestKey = JSON.stringify(latest.targets.map(target => target.id));
    if (action === "library" && selectionToolbar) {
      const shown = descriptions.get("library")!;
      if (shown.reason || latestKey !== targetKey || description.operation !== shown.operation
        || description.eligibleIds.length !== shown.eligibleIds.length
        || description.eligibleIds.some((id, index) => id !== shown.eligibleIds[index])) return;
    }
    if (action === "delete" && armedDelete !== latestKey) { setArmedDelete(latestKey); return; }
    const disclosure = trigger.closest(".selection-fab, [data-image-action-options]");
    const returnFocus = disclosure?.querySelector<HTMLButtonElement>("button[aria-expanded]") ?? trigger;
    if (action === "library" && editor.getState().connected) {
      if (latest.targets.some(target => editor.getState().hasPendingField(target.id, "archived"))) return;
      if (commit({ fieldId: "archived", action: "overwrite", value: description.operation, targetIds: description.eligibleIds, panelTargetKey: labelTargetKey(latest.targets.map(target => target.id)) }, returnFocus)) onPrepared?.();
      return;
    }
    if (useImageActionStore.getState().prepare(action, latest, returnFocus)) {
      setArmedDelete(null);
      onPrepared?.();
    }
  };
  const renderAction = (action: ImageAction) => {
      const description = descriptions.get(action)!;
      const shareOverLimit = action === "share" && current.targets.length > SHARE_IMAGE_LIMIT && !description.pending;
    const settlingLibrary = action === "library" && selectionToolbar && description.pending;
    const retained = settlingLibrary ? lastLibrary.current : action === "library" && !description.libraryIcon
      && (description.pending || libraryBusy) && lastLibrary.current?.key === targetKey ? lastLibrary.current : undefined;
    const icon = retained?.icon ?? description.libraryIcon ?? "add";
      const confirming = action === "delete" && armedDelete === targetKey && !description.reason;
      const label = confirming ? `Confirm delete ${current.targets.length} ${current.targets.length === 1 ? "image" : "images"}` : retained?.label ?? description.label;
      const visibleLabel = presentation === "floaty" ? confirming ? "Confirm delete" : action === "library" ? label : description.shortLabel : label;
      return <button key={action} type="button" aria-label={label} data-share-trigger={action === "share" ? "" : undefined} disabled={!shareOverLimit && (Boolean(description.reason) || action === "library" && libraryBusy)} aria-disabled={shareOverLimit || undefined} onClick={event => activate(action, event.currentTarget)}
        aria-busy={description.pending || action === "library" && libraryBusy || undefined}
        style={description.pending ? { opacity: settledOpacity.current.get(action) ?? 0.4, visibility: settlingLibrary && !retained ? "hidden" : undefined } : undefined}
        aria-description={description.reason}
        title={settlingLibrary ? undefined : description.reason ?? label}
        className={`image-action group/action flex shrink-0 items-center justify-center gap-1.5 px-2 text-sm hover:bg-grid-hover disabled:opacity-40 disabled:cursor-not-allowed aria-disabled:cursor-not-allowed cursor-pointer ${shareOverLimit ? "relative text-grid-text-muted/60" : confirming ? "bg-grid-error text-white" : "text-grid-text-muted"}`}>
        {action !== "library" ? <ImageActionIcon action={action} /> : uploadForm && icon === "remove" ? description.reason && !libraryBusy ? <LibraryIcon variant="added" /> : <>
            <LibraryIcon variant="added" className="group-hover/action:hidden group-focus-visible/action:hidden" />
            <LibraryIcon variant="remove" className="hidden group-hover/action:block group-focus-visible/action:block" />
          </> : <LibraryIcon variant={icon} />}
        {!iconOnly && <span className={expanded ? "min-w-0 whitespace-normal wrap-anywhere" : "image-action-full"}>{action === "library" && presentation !== "floaty" ? <span className="library-toolbar-label"><span aria-hidden="true" /><span>{visibleLabel}</span></span> : visibleLabel}
          {expanded && ((showReasons && presentation !== "floaty") || shareOverLimit) && description.reason && <span className="block text-xs font-normal">{description.reason}</span>}
        </span>}
        {!iconOnly && !expanded && <span className="image-action-short">{confirming ? "Confirm" : description.shortLabel}</span>}
        {shareOverLimit && !expanded && <span aria-hidden="true" className="pointer-events-none absolute top-full right-0 z-50 mt-1 hidden w-52 whitespace-normal rounded border border-grid-separator bg-grid-bg p-2 text-left text-xs text-grid-text shadow-lg group-focus-visible/action:block">{description.reason}</span>}
      </button>;
  };
  const inline = narrow && !expanded ? actions.filter(action => action === "share" || action === "library") : actions;
  const overflow = narrow && !expanded ? actions.filter(action => !inline.includes(action)) : [];
  return <><div role="group" aria-label="Image actions" data-surface={!expanded && presentation !== "floaty" ? presentation === "detail" ? "detail" : "search" : undefined}
    className={presentation === "floaty" ? "image-actions image-actions-floaty" : expanded ? "image-actions image-actions-expanded flex flex-col" : "image-actions flex h-full shrink-0"}>
    {inline.map(renderAction)}
    {overflow.length > 0 && <ImageActionOptions context={context} resolveContext={resolveContext} actions={overflow} label="More image actions" />}
    {armedDelete === targetKey && <button type="button" aria-label="Cancel deletion" title="Cancel deletion" className="image-action flex items-center justify-center px-2 hover:bg-grid-hover" onClick={() => setArmedDelete(null)}>
      <svg className="size-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m6 4 6 6 6-6 2 2-6 6 6 6-2 2-6-6-6 6-2-2 6-6-6-6 2-2Z" /></svg>
    </button>}
  </div>{uploadForm && context.targets.length === 1 && <MetadataSaveFeedback fieldId="archived" targetIds={[context.targets[0].id]} />}</>;
}