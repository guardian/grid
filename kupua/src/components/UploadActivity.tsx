import { useEffect, useLayoutEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { gridUploadsEnabled } from "@/lib/upload-commands";
import { getGridSessionPermissions, subscribeGridSessionInvalidation } from "@/lib/grid-api-instance";
import { siteSettings } from "@/lib/site-settings";
import { pushNavigate } from "@/lib/orchestration/search";
import { setPrevParamsSerialized } from "@/lib/orchestration/search";
import { useUiPrefsStore } from "@/stores/ui-prefs-store";
import { withFreshKupuaKey } from "@/lib/orchestration/history-key";
import { activeUploadPhases, attentionUploadPhases, submitUploadFiles, useUploadJobsStore, type UploadBatch } from "@/stores/upload-jobs-store";
import { UploadProgress } from "./UploadProgress";
import { formatRecentGridDate } from "@/lib/format-grid-date";
import { useUploadLayoutStore } from "@/stores/upload-layout-store";
export { UploadNotices } from "./UploadProgress";

export function useToolbarUploadFit(enabled = true) {
  const ref = useRef<HTMLElement>(null);
  const update = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    const toolbar = ref.current;
    if (!enabled || !toolbar) return;
    let frame = 0;
    const measure = () => {
      if (!toolbar.clientWidth) return;
      const style = getComputedStyle(toolbar);
      const grid = style.display === "grid";
      const clearance = grid ? parseFloat(style.getPropertyValue("--toolbar-clearance-max")) || 0 : 0;
      const children = [...toolbar.children].flatMap(child => getComputedStyle(child).display === "contents" ? [...child.children] : [child])
        .filter(child => child.getClientRects().length > 0 && (!grid || getComputedStyle(child).gridRowStart !== "2"));
      const labels = [...toolbar.querySelectorAll<HTMLElement>(".results-recent-uploads [data-toolbar-label], .results-upload [data-toolbar-label], .upload-toolbar > .upload-primary [data-toolbar-label]")].map(label => ({
        kind: label.dataset.toolbarLabel,
        width: label.getBoundingClientRect().width + 6,
        active: getComputedStyle(label).position !== "fixed" && getComputedStyle(label).display !== "none",
        visible: getComputedStyle(label).display !== "none",
      })).filter(label => label.visible);
      const occupied = children.reduce((width, child) => {
        if (child.matches(".results-query")) return width + 160;
        if (child.matches(".flex-1")) return width;
        const childStyle = getComputedStyle(child);
        return width + child.getBoundingClientRect().width
          + (parseFloat(childStyle.marginLeft) || 0) + (parseFloat(childStyle.marginRight) || 0);
      }, (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0)
        + clearance
        + Math.max(0, children.length - 1) * (parseFloat(style.columnGap) || 0));
      const base = occupied - labels.reduce((width, label) => width + (label.active ? label.width : 0), 0);
      if (grid) toolbar.style.setProperty("--toolbar-clearance", `${Math.min(clearance, Math.max(0, toolbar.clientWidth - (base - clearance) - 12))}px`);
      const fits = ["full", "my", "short", "icons"] as const;
      const current = Math.max(0, fits.indexOf(toolbar.dataset.uploadFit as typeof fits[number]));
      const fit = fits.find((candidate, index) => base + labels.reduce((width, label) => width + (
        candidate !== "icons" && (label.kind === "upload" || label.kind === candidate) ? label.width : 0
      ), 0) <= toolbar.clientWidth - (index < current ? 20 : 12)) ?? "icons";
      if (toolbar.dataset.uploadFit !== fit) toolbar.dataset.uploadFit = fit;
    };
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(() => {
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; measure(); });
    });
    observer?.observe(toolbar);
    for (const element of toolbar.querySelectorAll(":scope > *, [data-toolbar-label]")) observer?.observe(element);
    update.current = measure;
    measure();
    return () => {
      update.current = null;
      toolbar.style.removeProperty("--toolbar-clearance");
      observer?.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [enabled]);
  useLayoutEffect(() => { update.current?.(); });
  return ref;
}

export function enterUploads(navigate: ReturnType<typeof useNavigate>) {
  setPrevParamsSerialized("");
  const batch = useUploadJobsStore.getState().batches.at(-1)?.id;
  if (batch) useUploadLayoutStore.getState().followBatch(batch);
  pushNavigate(navigate, { to: "/upload", search: batch ? { batch } : {}, state: withFreshKupuaKey({ _uploadFresh: true }) });
}

export function RecentUploadsEntry({ iconOnly = false, shortLabel = false, onOpen }: { iconOnly?: boolean; shortLabel?: boolean; onOpen?: () => void }) {
  const navigate = useNavigate();
  return <button type="button" aria-label="My recent uploads" title="My recent uploads"
    className={`results-recent-uploads image-action flex shrink-0 items-center justify-center gap-1.5 text-sm hover:bg-grid-hover cursor-pointer text-grid-text-muted ${shortLabel ? "h-9 px-2" : iconOnly ? "size-9" : "h-11 px-2 border-l border-grid-separator"}`}
    onClick={() => { onOpen?.(); enterUploads(navigate); }}>
    <svg className="size-4 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M22 16V4c0-1.1-.9-2-2-2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2ZM11 12l2.03 2.71L16 11l4 5H8l3-4ZM2 6v14c0 1.1.9 2 2 2h14v-2H4V6H2Z" />
    </svg>
    {shortLabel ? <span className="upload-recent-label">Uploads</span> : !iconOnly && <>
      <span data-toolbar-label="full">My recent uploads</span>
      <span data-toolbar-label="my">My uploads</span>
      <span data-toolbar-label="short">Uploads</span>
    </>}
  </button>;
}

function openSubmittedBatch(navigate: ReturnType<typeof useNavigate>, batch: string) {
  const withinUpload = useUiPrefsStore.getState().densityContext === "upload";
  pushNavigate(navigate, { to: "/upload", search: { batch }, state: withFreshKupuaKey({ _uploadFresh: !withinUpload, _uploadAddressed: withinUpload, _uploadSubmitted: true }) });
}

export function useUploadAccess(): "loading" | "available" | "denied" | "disabled" | "unavailable" {
  const [permitted, setPermitted] = useState<boolean | null>();
  const enabled = gridUploadsEnabled();
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    const unsubscribe = subscribeGridSessionInvalidation(() => setPermitted(null));
    void getGridSessionPermissions().then(session => { if (!disposed) setPermitted(session ? session.canUpload === true : null); });
    return () => { disposed = true; unsubscribe(); };
  }, [enabled]);
  return !enabled ? "disabled" : permitted === undefined ? "loading" : permitted === null ? "unavailable" : permitted ? "available" : "denied";
}

function useUploadAvailable(): boolean {
  return useUploadAccess() === "available" && !!siteSettings().upload;
}

export function UploadDropzone({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const available = useUploadAvailable();
  const browsing = useRouterState({ select: state => state.location.pathname === "/search" || state.location.pathname === "/upload" });
  const internal = useRef(false);
  const depth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const reset = () => { depth.current = 0; setDragging(false); internal.current = false; };
  const externalFiles = (event: DragEvent) => browsing && !internal.current && event.dataTransfer.types.includes("Files")
    && !event.dataTransfer.types.some(type => type.startsWith("application/vnd.mediaservice."));
  return <div className="contents" data-upload-dropzone={available ? "" : undefined} onDragStartCapture={available ? () => { internal.current = true; setDragging(false); } : undefined}
    onDragEndCapture={available ? reset : undefined} onDragEnterCapture={available ? event => {
      if (!externalFiles(event)) return;
      event.preventDefault();
      depth.current++;
      setDragging(true);
    } : undefined} onDragOverCapture={available ? event => {
      if (!externalFiles(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = available ? "copy" : "none";
    } : undefined} onDragLeaveCapture={available ? () => { if (--depth.current <= 0) { depth.current = 0; setDragging(false); } } : undefined}
    onDropCapture={available ? event => {
      const files = externalFiles(event) ? Array.from(event.dataTransfer.files) : [];
      if (externalFiles(event)) event.preventDefault();
      reset();
      if (!available || !files.length) return;
      const batch = submitUploadFiles(files);
      if (batch) openSubmittedBatch(navigate, batch);
    } : undefined}>
    {children}
    {available && dragging && <div className="fixed inset-2 z-[200] pointer-events-none border-2 border-dashed border-grid-accent bg-grid-bg/95 flex items-center justify-center text-grid-text">
      <span className="text-lg font-medium">{available ? "Upload files" : "Uploads unavailable"}</span>
    </div>}
  </div>;
}

export function UploadEntry({ withActivity = false, onSubmitted }: { withActivity?: boolean; onSubmitted?: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const available = useUploadAvailable();
  if (!available) return null;
  return <div className="upload-primary">
    {withActivity && <UploadActivity split />}
    <input ref={input} type="file" multiple aria-label="Upload files" className="hidden" onChange={event => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = "";
      if (!available || !files.length) return;
      const batch = submitUploadFiles(files);
      if (batch) {
        onSubmitted?.();
        openSubmittedBatch(navigate, batch);
      }
    }} />
    <button type="button" disabled={!available} onClick={() => input.current?.click()} aria-label="Upload files"
      title={available ? "Upload files" : "Uploads disabled, permission or configuration unavailable"}
      className="upload-entry" data-unavailable={!available || undefined}>
      <span className="upload-face">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4 shrink-0" aria-hidden="true">
          <path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6" />
        </svg>
        <span data-toolbar-label="upload">Upload</span>
      </span>
    </button>
  </div>;
}

export function UploadFilePrompt() {
  return <section aria-label="File upload" className="upload-file-prompt">
    <div className="upload-prompt-message">
      <span>Either drag 'n drop images onto this screen or click Upload to get your images on the Grid.</span>
    </div>
    <div className="upload-preset-labels">
      <span>Apply label e.g. culture</span>
      <button type="button" disabled aria-label="Add label to all uploads" title="Add label to all uploads (not connected yet)" className="upload-preset-add">
        <svg viewBox="0 0 24 24" fill="currentColor" className="size-5" aria-hidden="true">
          <path fillRule="evenodd" d="M5 3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5Zm6 4v4H7v2h4v4h2v-4h4v-2h-4V7h-2Z" clipRule="evenodd" />
        </svg>
      </button>
      <span>to all uploads</span>
    </div>
  </section>;
}

const outstanding = (batch: UploadBatch) => batch.attempts.some(attempt => activeUploadPhases.has(attempt.phase)
  || attentionUploadPhases.has(attempt.phase) && !attempt.notificationDismissed);
const batchReference = (id: string) => `Batch ${id.replace(/^local-/, "").slice(0, 8)}`;

export function UploadBatchSelector({ batch }: { batch?: string }) {
  const batches = useUploadJobsStore(state => state.batches);
  const navigate = useNavigate();
  const [earlier, setEarlier] = useState(false);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const choices = [...batches].reverse().filter((item, index) => earlier || index < 5 || item.id === batch || outstanding(item));
  const selected = batches.find(item => item.id === batch);
  return <div className="upload-batch-selector flex items-center min-w-0 gap-1 shrink-0">
    <select aria-label="Upload batch" title={selected ? new Date(selected.createdAt).toLocaleString("en-GB") : undefined} value={batch ?? ""} className="min-w-48 w-48 wide:w-64 max-w-72 h-8 rounded border border-grid-border bg-grid-bg px-2 text-sm text-grid-text"
    onChange={event => pushNavigate(navigate, { to: "/upload", search: event.target.value ? { batch: event.target.value } : {}, state: withFreshKupuaKey({ _uploadAddressed: true }) })}>
    {!batch && <option value="" disabled>{batches.length ? "Choose a batch" : "No retained batches"}</option>}
    {batch && !choices.some(item => item.id === batch) && <option value={batch} disabled>{batchReference(batch)} (unavailable)</option>}
    {choices.map(item => {
      const count = new Set(item.attempts.flatMap(attempt => attempt.imageId ? [attempt.imageId] : [])).size;
      const date = formatRecentGridDate(item.createdAt, now);
      return <option key={item.id} value={item.id} title={new Date(item.createdAt).toLocaleString("en-GB")}>{date.charAt(0).toUpperCase() + date.slice(1)} / {count} {count === 1 ? "image" : "images"}</option>;
    })}
    </select>
    {batches.length > 5 && <button type="button" aria-expanded={earlier} className="text-xs px-2 h-9 cursor-pointer underline" onClick={() => setEarlier(value => !value)}>{earlier ? "Recent batches" : "Earlier batches"}</button>}
  </div>;
}

export function UploadActivity({ toolbar = false, split = false }: { toolbar?: boolean; split?: boolean }) {
  const navigate = useNavigate();
  const available = useUploadAvailable();
  const showBatchControls = useRouterState({ select: state => state.location.pathname === "/search"
    && !state.location.search.image && !state.location.search.cropping });
  if (!available) return null;
  return <UploadProgress toolbar={toolbar} split={split} renderBatchControls={!showBatchControls ? undefined : () => <div className="upload-popup-header">
    <button type="button" className="upload-link" onClick={() => enterUploads(navigate)}>Go to recent uploads</button>
  </div>} />;
}
