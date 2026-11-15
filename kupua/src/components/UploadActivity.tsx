import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { gridUploadsEnabled } from "@/lib/upload-commands";
import { getGridSessionPermissions, subscribeGridSessionInvalidation } from "@/lib/grid-api-instance";
import { siteSettings } from "@/lib/site-settings";
import { pushNavigate } from "@/lib/orchestration/search";
import { activeUploadPhases, attentionUploadPhases, submitUploadFiles, useUploadJobsStore, type UploadBatch } from "@/stores/upload-jobs-store";
import { UploadProgress } from "./UploadProgress";
export { UploadNotices } from "./UploadProgress";

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
      if (batch) pushNavigate(navigate, { to: "/upload", search: { batch } });
    } : undefined}>
    {children}
    {available && dragging && <div className="fixed inset-2 z-[200] pointer-events-none border-2 border-dashed border-grid-accent bg-grid-bg/95 flex items-center justify-center text-grid-text">
      <span className="text-lg font-medium">{available ? "Upload files" : "Uploads unavailable"}</span>
    </div>}
  </div>;
}

export function UploadEntry({ withActivity = false }: { withActivity?: boolean }) {
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
      if (batch) pushNavigate(navigate, { to: "/upload", search: { batch } });
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

const outstanding = (batch: UploadBatch) => batch.attempts.some(attempt => activeUploadPhases.has(attempt.phase)
  || attentionUploadPhases.has(attempt.phase) && !attempt.notificationDismissed);
const batchReference = (id: string) => `Batch ${id.replace(/^local-/, "").slice(0, 8)}`;

export function UploadBatchSelector({ batch }: { batch?: string }) {
  const batches = useUploadJobsStore(state => state.batches);
  const navigate = useNavigate();
  const choices = [...batches].reverse().filter((item, index) => index < 5 || item.id === batch || outstanding(item));
  return <select aria-label="Upload batch" value={batch ?? ""} className="min-w-48 basis-48 flex-1 max-w-72 h-9 rounded border border-grid-border bg-grid-bg px-2 text-sm text-grid-text"
    onChange={event => pushNavigate(navigate, { to: "/upload", search: event.target.value ? { batch: event.target.value } : {} })}>
    <option value="">My recent uploads</option>
    {batch && !choices.some(item => item.id === batch) && <option value={batch} disabled>{batchReference(batch)} (unavailable)</option>}
    {choices.map(item => <option key={item.id} value={item.id}>{batchReference(item.id)} / {item.attempts.length} {item.attempts.length === 1 ? "file" : "files"}{outstanding(item) ? " / outstanding" : ""}</option>)}
  </select>;
}

export function UploadActivity({ toolbar = false, split = false }: { toolbar?: boolean; split?: boolean }) {
  const navigate = useNavigate();
  const available = useUploadAvailable();
  if (!available) return null;
  return <UploadProgress toolbar={toolbar} split={split} renderBatchControls={batch => <div className="upload-popup-header">
    <UploadBatchSelector batch={batch.id} />
    <button type="button" className="upload-link" onClick={() => pushNavigate(navigate, { to: "/upload", search: { batch: batch.id } })}>Open batch</button>
  </div>} />;
}
