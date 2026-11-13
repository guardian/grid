import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { useSelectionStore } from "@/stores/selection-store";
import { useSearchStore } from "@/stores/search-store";
import { useEnrichmentStore } from "@/stores/enrichment-store";
import { isGridSessionInvalidated, serviceLink, subscribeGridSessionInvalidation } from "@/lib/grid-api-instance";
import { useImageActionStore } from "@/stores/image-action-store";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useActionPopupPlacement } from "@/hooks/useActionPopupPlacement";
import { Chevron } from "./Chevron";
import { useCropSettings } from "@/hooks/useCropSettings";
import { describeImageAction, IMAGE_ACTIONS, selectionImageActionContext, type ImageAction, type ImageActionContext } from "@/lib/image-actions";

export function ImageActionIcon({ action }: { action: ImageAction }) {
  const paths: Record<ImageAction, string> = {
    share: "M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7a3.2 3.2 0 0 0 0-1.4l7.05-4.11A3 3 0 1 0 15 5c0 .24.03.47.09.7L8.04 9.81a3 3 0 1 0 0 4.38l7.12 4.16A3 3 0 1 0 18 16.08Z",
    "full-frame": "M6 2v4H2v2h4v10h12v4h2v-4h2v-2H8V2H6Zm4 4v2h6v6h2V6h-8Z",
    download: "M19 9h-4V3H9v6H5l7 7 7-7ZM5 18v3h14v-3H5Z",
    delete: "M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12ZM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4Z",
    library: "M20 2H8a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2ZM18 11h-3v3h-2v-3h-3V9h3V6h2v3h3v2ZM4 6H2v14a2 2 0 0 0 2 2h14v-2H4V6Z",
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
}

export function SelectionImageActions(props: Omit<ImageActionsProps, "context" | "resolveContext">) {
  useSelectionStore(state => state.selectedIds);
  useSelectionStore(state => state.metadataRevision);
  useSelectionStore(state => state.pendingFetchIds);
  useSelectionStore(state => state.isRangeWalking);
  useSearchStore(state => state.results);
  useEnrichmentStore(state => state.data);
  return <ImageActions {...props} context={selectionImageActionContext(null)} resolveContext={() => selectionImageActionContext(null)} />;
}

export function ImageActions({ context, resolveContext, actions = IMAGE_ACTIONS, expanded = false, onPrepared, presentation = "toolbar", showReasons = true }: ImageActionsProps) {
  useSyncExternalStore(subscribeGridSessionInvalidation, isGridSessionInvalidated, () => false);
  const { settings: cropSettings } = useCropSettings();
  const [archive, setArchive] = useState<boolean | null>(null);
  const [armedDelete, setArmedDelete] = useState<string | null>(null);
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
    if (import.meta.env.VITE_USE_MEDIA_API !== "true") return;
    let active = true;
    void serviceLink("archive").then(link => { if (active) setArchive(Boolean(link)); });
    return () => { active = false; };
  }, []);
  const current = { ...context, archive, cropSettings };
  const descriptions = new Map(actions.map(action => [action, describeImageAction(action, current)] as const));
  useLayoutEffect(() => {
    for (const [action, description] of descriptions) {
      if (!description.pending) settledOpacity.current.set(action, description.reason ? 0.4 : 1);
    }
  });
  const targetKey = JSON.stringify(current.targets.map(target => target.id));
  const deleteReason = descriptions.get("delete")?.reason;
  useEffect(() => { setArmedDelete(null); }, [targetKey, deleteReason]);
  useEffect(() => {
    if (!armedDelete) return;
    const timer = setTimeout(() => setArmedDelete(null), 5000);
    return () => clearTimeout(timer);
  }, [armedDelete]);
  const activate = (action: ImageAction, trigger: HTMLButtonElement) => {
    const latest = { ...(resolveContext?.() ?? context), archive };
    if (describeImageAction(action, latest).reason) return;
    const latestKey = JSON.stringify(latest.targets.map(target => target.id));
    if (action === "delete" && armedDelete !== latestKey) { setArmedDelete(latestKey); return; }
    const disclosure = trigger.closest(".selection-fab, [data-image-action-options]");
    const returnFocus = disclosure?.querySelector<HTMLButtonElement>("button[aria-expanded]") ?? trigger;
    if (useImageActionStore.getState().prepare(action, latest, returnFocus)) {
      setArmedDelete(null);
      onPrepared?.();
    }
  };
  const renderAction = (action: ImageAction) => {
      const description = descriptions.get(action)!;
      const confirming = action === "delete" && armedDelete === targetKey && !description.reason;
      const label = confirming ? `Confirm delete ${current.targets.length} ${current.targets.length === 1 ? "image" : "images"}` : description.label;
      const visibleLabel = presentation === "floaty" ? confirming ? "Confirm delete" : action === "library" ? description.label : description.shortLabel : label;
      return <button key={action} type="button" aria-label={label} disabled={Boolean(description.reason)} onClick={event => activate(action, event.currentTarget)}
        aria-busy={description.pending || undefined} style={description.pending ? { opacity: settledOpacity.current.get(action) ?? 0.4 } : undefined}
        aria-description={description.reason}
        title={description.reason ?? description.label}
        className={`image-action flex shrink-0 items-center justify-center gap-1.5 px-2 text-sm hover:bg-grid-hover disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${confirming ? "bg-grid-error text-white" : "text-grid-text-muted"}`}>
        <ImageActionIcon action={action} />
        <span className={expanded ? "min-w-0 whitespace-normal wrap-anywhere" : "image-action-full"}>{visibleLabel}
          {expanded && showReasons && presentation !== "floaty" && description.reason && <span className="block text-xs font-normal">{description.reason}</span>}
        </span>
        {!expanded && <span className="image-action-short">{confirming ? "Confirm" : description.shortLabel}</span>}
      </button>;
  };
  const inline = narrow && !expanded ? actions.filter(action => action === "share" || action === "library") : actions;
  const overflow = narrow && !expanded ? actions.filter(action => !inline.includes(action)) : [];
  return <div role="group" aria-label="Image actions" data-surface={!expanded && presentation !== "floaty" ? presentation === "detail" ? "detail" : "search" : undefined}
    className={presentation === "floaty" ? "image-actions image-actions-floaty" : expanded ? "image-actions image-actions-expanded flex flex-col" : "image-actions flex h-full shrink-0"}>
    {inline.map(renderAction)}
    {overflow.length > 0 && <ImageActionOptions context={context} resolveContext={resolveContext} actions={overflow} label="More image actions" />}
    {armedDelete === targetKey && <button type="button" aria-label="Cancel deletion" title="Cancel deletion" className="image-action flex items-center justify-center px-2 hover:bg-grid-hover" onClick={() => setArmedDelete(null)}>
      <svg className="size-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m6 4 6 6 6-6 2 2-6 6 6 6-2 2-6-6-6 6-2-2 6-6-6-6 2-2Z" /></svg>
    </button>}
  </div>;
}