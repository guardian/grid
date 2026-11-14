import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { gridUploadsEnabled } from "@/lib/upload-commands";
import { getGridSessionPermissions, subscribeGridSessionInvalidation } from "@/lib/grid-api-instance";
import { siteSettings } from "@/lib/site-settings";
import { useLocalPersistenceStore } from "@/lib/local-batch-storage";
import { pushNavigate } from "@/lib/orchestration/search";
import { checkUploadAttempt, retainUploadBatches, submitUploadFiles, useUploadJobsStore, type UploadBatch, type UploadPhase } from "@/stores/upload-jobs-store";
import { containPillActivation } from "./SearchPill";

const phaseLabels: Record<UploadPhase, string> = {
  waiting: "Waiting", preparing: "Preparing", transferring: "Transferring", processing: "Transfer acknowledged; awaiting processing",
  visibility: "Processing complete; awaiting search visibility", complete: "Image available", failed: "Failed", blocked: "Not submitted", uncertain: "Outcome uncertain",
  interrupted: "Interrupted; not resumed",
};

function useUploadAvailable(): boolean {
  const [permitted, setPermitted] = useState(false);
  const enabled = gridUploadsEnabled() && !!siteSettings().upload;
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    const unsubscribe = subscribeGridSessionInvalidation(() => setPermitted(false));
    void getGridSessionPermissions().then(session => { if (!disposed) setPermitted(session?.canUpload === true); });
    return () => { disposed = true; unsubscribe(); };
  }, [enabled]);
  return enabled && permitted;
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
  return <div className="contents" data-upload-dropzone="" onDragStartCapture={() => { internal.current = true; setDragging(false); }}
    onDragEndCapture={reset} onDragEnterCapture={event => {
      if (!externalFiles(event)) return;
      event.preventDefault();
      depth.current++;
      setDragging(true);
    }} onDragOverCapture={event => {
      if (!externalFiles(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = available ? "copy" : "none";
    }} onDragLeaveCapture={() => { if (--depth.current <= 0) { depth.current = 0; setDragging(false); } }}
    onDropCapture={event => {
      const files = externalFiles(event) ? Array.from(event.dataTransfer.files) : [];
      if (externalFiles(event)) event.preventDefault();
      reset();
      if (!available || !files.length) return;
      const batch = submitUploadFiles(files);
      if (batch) pushNavigate(navigate, { to: "/upload", search: { batch } });
    }}>
    {children}
    {dragging && <div className="fixed inset-2 z-[200] pointer-events-none border-2 border-dashed border-grid-accent bg-grid-bg/95 flex items-center justify-center text-grid-text">
      <span className="text-lg font-medium">{available ? "Upload files" : "Uploads unavailable"}</span>
    </div>}
  </div>;
}

export function UploadEntry() {
  const input = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const available = useUploadAvailable();
  return <>
    <input ref={input} type="file" multiple aria-label="Upload files" className="hidden" onChange={event => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = "";
      if (!available || !files.length) return;
      const batch = submitUploadFiles(files);
      if (batch) pushNavigate(navigate, { to: "/upload", search: { batch } });
    }} />
    <button type="button" disabled={!available} onClick={() => input.current?.click()} aria-label="Upload files"
      title={available ? "Upload files" : "Uploads disabled, permission or configuration unavailable"}
      className="w-9 h-9 shrink-0 flex items-center justify-center rounded hover:bg-grid-hover disabled:opacity-40 disabled:cursor-not-allowed">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5" aria-hidden="true">
        <path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6" />
      </svg>
    </button>
  </>;
}

const activePhases = new Set<UploadPhase>(["waiting", "preparing", "transferring", "processing", "visibility"]);
const attentionPhases = new Set<UploadPhase>(["failed", "blocked", "uncertain", "interrupted"]);
const outstanding = (batch: UploadBatch) => batch.attempts.some(attempt => activePhases.has(attempt.phase)
  || attentionPhases.has(attempt.phase) && attempt.phase !== "blocked");
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

export function UploadActivity() {
  const batches = useUploadJobsStore(state => state.batches);
  const persistence = useLocalPersistenceStore();
  const location = useRouterState({ select: state => state.location });
  const navigate = useNavigate();
  const batchId = location.pathname === "/upload" ? (location.search as { batch?: string }).batch : undefined;
  const batch = batches.find(item => item.id === batchId) ?? batches.at(-1);
  const issue = (batch && persistence.batchIssues[batch.id]) ?? Object.values(persistence.batchIssues)[0]
    ?? persistence.descriptorIssue ?? persistence.historyIssue;
  if (!batch && !issue) return null;
  const attempts = batch?.attempts ?? [];
  const ready = new Set(attempts.flatMap(attempt => attempt.imageId ? [attempt.imageId] : [])).size;
  const processing = attempts.filter(attempt => activePhases.has(attempt.phase)).length;
  const attention = attempts.filter(attempt => attentionPhases.has(attempt.phase)).length;
  const otherOutstanding = batches.filter(item => item !== batch && outstanding(item)).length;
  return <div className="shrink-0 border-b border-grid-separator bg-grid-bg text-grid-text text-sm">
    {batch && <details onKeyDown={containPillActivation}>
      <summary className="cursor-pointer px-3 py-1.5 break-words">
        <span aria-live="polite">Upload activity: {attempts.length} {attempts.length === 1 ? "file" : "files"}; {ready} {ready === 1 ? "image" : "images"} {batch.restored ? "known" : "available"}</span>
        <span className="ml-2 text-grid-text-muted">{batchReference(batch.id)} / {processing} processing / {attention} need attention{otherOutstanding ? ` / ${otherOutstanding} other outstanding batches` : ""}</span>
      </summary>
      <div className="max-h-[min(40dvh,20rem)] overflow-y-auto px-3 pb-2" aria-label="Upload activity">
        <div className="flex flex-wrap items-center gap-3 py-2">
          <UploadBatchSelector batch={batch.id} />
          <button className="underline" onClick={() => pushNavigate(navigate, { to: "/upload", search: { batch: batch.id } })}>Open batch</button>
        </div>
        {batch.restored && <p className="mb-2 text-grid-text-muted">Restored local record. Unfinished submissions were not resumed.</p>}
        <ul className="space-y-2">{attempts.map((attempt, index) => <li key={attempt.id} data-upload-attempt={attempt.id} className="border-t border-grid-separator pt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="min-w-0 break-all">{attempt.name}</span>
          <span className="text-grid-text-muted">{attempt.phase === "complete" && batch.restored ? "Known image" : phaseLabels[attempt.phase]}</span>
          {attempt.imageId && attempts.findIndex(item => item.imageId === attempt.imageId) !== index && <span className="text-grid-text-muted">Same canonical image as another file</span>}
          {attempt.submission && attempt.submission.outcome !== "accepted" && <span className="text-grid-text-muted">Submission {attempt.submission.outcome} during {attempt.submission.stage}</span>}
          {attempt.submission?.queued && attempt.submission.queued !== "acknowledged" && (
            attempt.phase === "complete" && attempt.submission.outcome === "accepted" && attempt.imageId
              ? <details className="text-grid-text-muted"><summary className="cursor-pointer underline">Upload receipt</summary>
                <span>Queued update {attempt.submission.queued}; file transfer acknowledged</span></details>
              : <span className="text-grid-text-muted">Queued update {attempt.submission.queued}; file transfer acknowledged</span>
          )}
          {attempt.message && <span className="w-full text-grid-text-muted">{attempt.message}</span>}
          {attempt.imageId && <button className="underline" onClick={() => pushNavigate(navigate, { to: "/upload", search: { batch: batch.id, image: attempt.imageId }, state: { _detailEntryImageId: attempt.imageId } })}>Open image</button>}
          {attempt.statusId && attentionPhases.has(attempt.phase) && <button className="underline" onClick={() => checkUploadAttempt(attempt.id)}>Check status</button>}
        </li>)}</ul>
      </div>
    </details>}
    {issue && <div className="px-3 py-2 text-grid-text"><p role="status">{issue}</p>
      {Object.keys(persistence.batchIssues).length > 0 && <button type="button" className="underline mt-1" onClick={retainUploadBatches}>Try local storage again</button>}
    </div>}
  </div>;
}