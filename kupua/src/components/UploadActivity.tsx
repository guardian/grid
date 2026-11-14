import { useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { gridUploadsEnabled } from "@/lib/upload-commands";
import { siteSettings } from "@/lib/site-settings";
import { pushNavigate } from "@/lib/orchestration/search";
import { checkUploadAttempt, submitUploadFiles, useUploadJobsStore, type UploadPhase } from "@/stores/upload-jobs-store";
import { containPillActivation } from "./SearchPill";

const phaseLabels: Record<UploadPhase, string> = {
  waiting: "Waiting", preparing: "Preparing", transferring: "Transferring", processing: "Transfer acknowledged; awaiting processing",
  visibility: "Processing complete; awaiting search visibility", complete: "Image available", failed: "Failed", blocked: "Not submitted", uncertain: "Outcome uncertain",
};

export function UploadEntry() {
  const input = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const available = gridUploadsEnabled() && !!siteSettings().upload;
  return <>
    <input ref={input} type="file" aria-label="Upload one file" className="hidden" onChange={event => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      const batch = submitUploadFiles([file]);
      if (batch) pushNavigate(navigate, { to: "/upload", search: { batch } });
    }} />
    <button type="button" disabled={!available} onClick={() => input.current?.click()} aria-label="Upload one file"
      title={available ? "Upload one file" : "Uploads disabled or configuration unavailable"}
      className="w-9 h-9 shrink-0 flex items-center justify-center rounded hover:bg-grid-hover disabled:opacity-40 disabled:cursor-not-allowed">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5" aria-hidden="true">
        <path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6" />
      </svg>
    </button>
  </>;
}

export function UploadActivity() {
  const batches = useUploadJobsStore(state => state.batches);
  const navigate = useNavigate();
  if (!batches.length) return null;
  const attempts = batches.flatMap(batch => batch.attempts);
  const ready = new Set(attempts.flatMap(attempt => attempt.imageId ? [attempt.imageId] : [])).size;
  return <details onKeyDown={containPillActivation} className="shrink-0 border-b border-grid-separator bg-grid-bg text-grid-text text-sm">
    <summary className="cursor-pointer px-3 py-2"><span aria-live="polite">Upload activity: {attempts.length} {attempts.length === 1 ? "file" : "files"}; {ready} {ready === 1 ? "image" : "images"} available</span></summary>
    <div className="max-h-48 overflow-y-auto px-3 pb-2" aria-label="Upload activity">
      {batches.map(batch => <section key={batch.id} className="border-t border-grid-separator py-2">
        <button className="underline mb-2" onClick={() => pushNavigate(navigate, { to: "/upload", search: { batch: batch.id } })}>Open batch</button>
        <ul className="space-y-2">{batch.attempts.map(attempt => <li key={attempt.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="min-w-0 break-all">{attempt.name}</span>
          <span className="text-grid-text-muted">{phaseLabels[attempt.phase]}</span>
          {attempt.submission && attempt.submission.outcome !== "accepted" && <span className="text-grid-text-muted">Submission {attempt.submission.outcome} during {attempt.submission.stage}</span>}
          {attempt.submission?.queued && attempt.submission.queued !== "acknowledged" && (
            attempt.phase === "complete" && attempt.submission.outcome === "accepted" && attempt.imageId
              ? <details className="text-grid-text-muted">
                <summary className="cursor-pointer underline">Upload receipt</summary>
                <span>Queued update {attempt.submission.queued}; file transfer acknowledged</span>
              </details>
              : <span className="text-grid-text-muted">Queued update {attempt.submission.queued}; file transfer acknowledged</span>
          )}
          {attempt.message && <span className="w-full text-grid-text-muted">{attempt.message}</span>}
          {attempt.imageId && <button className="underline" onClick={() => pushNavigate(navigate, { to: "/upload", search: { batch: batch.id, image: attempt.imageId }, state: { _detailEntryImageId: attempt.imageId } })}>Open image</button>}
          {attempt.statusId && ["uncertain", "failed", "blocked"].includes(attempt.phase) && <button className="underline" onClick={() => checkUploadAttempt(attempt.id)}>Check status</button>}
        </li>)}</ul>
      </section>)}
    </div>
  </details>;
}