import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { uploadPending, uploadAttention, checkUploadAttempt, dismissUploadAttempt, useUploadJobsStore, type UploadAttempt, type UploadBatch } from "@/stores/upload-jobs-store";
import { redactUploadError, uploadFailureLabel } from "@/lib/upload-error";
import { useLocalPersistenceStore } from "@/lib/local-batch-storage";
import { pushNavigate } from "@/lib/orchestration/search";
import { addToast } from "@/stores/toast-store";
import { Chevron } from "./Chevron";
import { containPillActivation } from "./SearchPill";
import { getCurrentKupuaKey } from "@/lib/orchestration/history-key";
import { formatRecentGridDate } from "@/lib/format-grid-date";

function StatusIcon({ status }: { status: "complete" | "active" | "error" }) {
  if (status === "active") return <svg className="upload-status-icon" viewBox="0 0 24 24" aria-hidden="true">
    <circle className="upload-progress-arc" r="9" pathLength="100" transform="translate(12 12) rotate(-95) scale(1 -1)" />
  </svg>;
  return <svg className="upload-status-icon" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d={status === "complete"
    ? "m424-296 282-282-56-56-226 226-114-114-56 56 170 170Zm56 216q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Z"
    : "M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q88 0 166.5 36T782-742L480-440v-360q-134 0-227 93t-93 227q0 134 93 227t227 93q69 0 132-28.5T720-270v110q-53 38-114 59T480-80Zm320-160v-320h80v320h-80Zm11.5 148.5Q800-103 800-120t11.5-28.5Q823-160 840-160t28.5 11.5Q880-137 880-120t-11.5 28.5Q857-80 840-80t-28.5-11.5Z"} /></svg>;
}

function ToolIcon({ copy = false }: { copy?: boolean }) {
  return <svg className="size-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={copy
    ? "M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"
    : "M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"} /></svg>;
}

function ActivityRow({ attempt, batch, showBatch, onDismiss }: {
  attempt: UploadAttempt; batch: UploadBatch; showBatch: boolean; onDismiss: (id: string) => void;
}) {
  const navigate = useNavigate();
  const location = useRouterState({ select: state => state.location });
  const [details, setDetails] = useState(false);
  const [copied, setCopied] = useState(false);
  const outputRef = useRef<HTMLPreElement>(null);
  const active = uploadPending(attempt);
  const failed = uploadAttention(attempt);
  const followupIssues = attempt.phase === "complete" ? attempt.followups?.filter(result => result.attention) : undefined;
  const hasFollowupIssues = Boolean(followupIssues?.length);
  const label = hasFollowupIssues ? "Uploaded; metadata needs attention" : failed ? uploadFailureLabel(attempt) : null;
  const recheckable = Boolean(attempt.statusId && (attempt.phase === "uncertain" || attempt.phase === "interrupted"));
  const serverError = attempt.serverError ? redactUploadError(attempt.serverError) : undefined;
  const batchDate = formatRecentGridDate(batch.createdAt);
  const batchLabel = location.pathname === "/upload" && location.search.batch === batch.id ? "Current batch"
    : batchDate.charAt(0).toUpperCase() + batchDate.slice(1);
  const errorText = serverError ? `File: ${attempt.name}\nMedia ID: ${attempt.statusId ?? "Not available"}\n\n${JSON.stringify({ data: { status: "FAILED", errorMessage: serverError } }, null, 2)}` : "";
  const openImage = async () => {
    if (location.pathname !== "/upload" || location.search.image || location.search.batch !== batch.id) {
      let pending = Promise.resolve();
      const key = pushNavigate((options: Parameters<typeof navigate>[0]) => { pending = Promise.resolve(navigate(options)); }, {
        to: "/upload", search: { batch: batch.id }, state: { _uploadAddressed: true },
      });
      await pending;
      if (getCurrentKupuaKey() !== key) return;
    }
    pushNavigate(navigate, { to: "/upload", search: { batch: batch.id, image: attempt.imageId, section: "batch" },
      state: { _detailEntryImageId: attempt.imageId, _uploadAddressed: true } });
  };
  const copyError = async () => {
    try { await navigator.clipboard.writeText(errorText); setCopied(true); }
    catch {
      if (!outputRef.current) return;
      const range = document.createRange(); range.selectNodeContents(outputRef.current);
      const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
    }
  };
  return <li className="upload-activity-row" data-upload-attempt={attempt.id}>
    <div className="upload-row-line">
      <StatusIcon status={active ? "active" : failed ? "error" : "complete"} />
      {attempt.phase === "complete" && attempt.imageId
        ? <button type="button" className="upload-filename upload-link" title={attempt.name} onClick={openImage}>{attempt.name}</button>
        : <span className="upload-filename" title={attempt.name}>{attempt.name}</span>}
      {serverError || hasFollowupIssues ? <button type="button" className="upload-link upload-row-action" aria-expanded={details} onClick={() => setDetails(value => !value)}>{label}</button>
        : label && <span className="upload-row-label">{label}</span>}
      {recheckable && <button type="button" className="upload-link upload-row-action" onClick={() => checkUploadAttempt(attempt.id)}>Recheck</button>}
      {showBatch && <span className="upload-row-batch">{batchLabel}</span>}
      {failed && <button type="button" className="upload-dismiss" title="Acknowledge error" aria-label={`Acknowledge error for ${attempt.name}`} onClick={() => onDismiss(attempt.id)}><ToolIcon /></button>}
    </div>
    {details && followupIssues?.map((result, index) => <p key={index} className="text-xs text-grid-text-muted wrap-anywhere">{result.label}: {result.summary}</p>)}
    {details && serverError && <section className="upload-error-detail" role="region" aria-label={`Upload error for ${attempt.name}`}>
      <div className="flex items-center gap-2"><span className="text-xs text-grid-text-muted">Server response</span>
        {copied && <span role="status" className="ml-auto text-xs">Copied</span>}
        <button type="button" className="upload-dismiss ml-auto" title="Copy error" aria-label="Copy error" onClick={() => { void copyError(); }}><ToolIcon copy /></button>
      </div>
      <pre ref={outputRef} tabIndex={0}>{errorText}</pre>
    </section>}
  </li>;
}

export function UploadProgress({ toolbar = false, split = false, renderBatchControls }: {
  toolbar?: boolean; split?: boolean; renderBatchControls?: (batch: UploadBatch) => ReactNode;
}) {
  const batches = useUploadJobsStore(state => state.batches);
  const activityIds = useUploadJobsStore(state => state.activityAttemptIds);
  const location = useRouterState({ select: state => state.location });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [position, setPosition] = useState({ top: 44, right: 12, maxWidth: 560, maxHeight: 400 });
  const list = !(location.search as { image?: string }).image;
  const inToolbar = location.pathname === "/upload" && list;
  const inSearch = location.pathname === "/search" && list;
  const entries = batches.flatMap(batch => batch.attempts.filter(attempt => activityIds.has(attempt.id) && !attempt.notificationDismissed).map(attempt => ({ attempt, batch })));
  const priority = (attempt: UploadAttempt) => uploadAttention(attempt) ? 0 : uploadPending(attempt) ? 1 : 2;
  entries.sort((left, right) => priority(left.attempt) - priority(right.attempt));
  const errors = entries.filter(entry => uploadAttention(entry.attempt)).length;
  const running = entries.filter(entry => uploadPending(entry.attempt)).length;
  const status = errors ? "error" : running ? "active" : "complete";
  const count = errors || running || entries.length;
  const statusLabel = errors ? `${errors} need attention` : running ? `${running} in progress` : `${count} completed`;
  const showBatch = new Set(entries.map(entry => entry.batch.id)).size > 1;
  useEffect(() => { setExpanded(false); }, [location.href]);
  useEffect(() => { if (!entries.length) setExpanded(false); }, [entries.length]);
  useLayoutEffect(() => {
    if (!expanded) return;
    const anchor = split ? triggerRef.current?.closest<HTMLElement>(".upload-primary") : triggerRef.current;
    if (!anchor) return;
    const place = () => {
      const bounds = anchor.getBoundingClientRect();
      const visual = window.visualViewport;
      const left = visual?.offsetLeft ?? 0;
      const right = left + (visual?.width ?? innerWidth);
      const bottom = (visual?.offsetTop ?? 0) + (visual?.height ?? innerHeight);
      const maxWidth = Math.max(0, Math.min(560, right - left - 24));
      const edge = Math.min(Math.max(bounds.right, left + 12 + maxWidth), right - 12);
      const next = { top: bounds.bottom + 4, right: innerWidth - edge,
        maxWidth, maxHeight: Math.max(0, bottom - bounds.bottom - 16) };
      setPosition(current => current.top === next.top && current.right === next.right && current.maxWidth === next.maxWidth && current.maxHeight === next.maxHeight ? current : next);
    };
    place();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(place);
    observer?.observe(anchor);
    window.addEventListener("resize", place);
    window.visualViewport?.addEventListener("resize", place);
    window.visualViewport?.addEventListener("scroll", place);
    return () => { observer?.disconnect(); window.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("resize", place); window.visualViewport?.removeEventListener("scroll", place); };
  }, [expanded, split]);
  useEffect(() => {
    if (!expanded) return;
    const dismiss = (event: PointerEvent) => {
      if (!triggerRef.current?.contains(event.target as Node) && !panelRef.current?.contains(event.target as Node)) setExpanded(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); event.stopPropagation(); setExpanded(false); triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape, true);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape, true); };
  }, [expanded]);
  if (!entries.length || (toolbar ? !inToolbar : split ? !inSearch : inToolbar || inSearch)) return null;
  const dismiss = (id: string) => {
    dismissUploadAttempt(id);
    queueMicrotask(() => { (triggerRef.current ?? document.querySelector<HTMLButtonElement>(".upload-entry:not(:disabled)"))?.focus(); });
  };
  return <div className={`upload-activity${split ? " upload-activity-split" : toolbar ? "" : " upload-activity-global"}`}>
    <button ref={triggerRef} type="button" className="upload-activity-trigger" aria-label={`Upload activity: ${statusLabel}`}
      aria-expanded={expanded} title={`Upload activity: ${statusLabel}`} onClick={() => setExpanded(value => !value)}>
      <Chevron direction={expanded ? "up" : "down"} /><StatusIcon status={status} /><span aria-live="polite">{count}</span>
    </button>
    {expanded && createPortal(<div ref={panelRef} className="upload-activity-popup" style={position} role="region" aria-label="Upload activity" onKeyDown={event => {
      containPillActivation(event);
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End"].includes(event.key)) event.stopPropagation();
    }}>
      {renderBatchControls?.(entries.find(entry => entry.batch.id === (location.search as { batch?: string }).batch)?.batch ?? entries[0].batch)}
      <ul>{entries.map(entry => <ActivityRow key={entry.attempt.id} {...entry} showBatch={showBatch} onDismiss={dismiss} />)}</ul>
    </div>, document.body)}
  </div>;
}

export function UploadNotices() {
  const seen = useRef(new Map<string, string>());
  const warned = useRef(false);
  useEffect(() => {
    const report = () => {
      const state = useLocalPersistenceStore.getState();
      const issues = new Map<string, string>(Object.entries(state.batchIssues).map(([id, message]) => [`batch:${id}`, message]));
      if (state.descriptorIssue) issues.set("descriptor", state.descriptorIssue);
      if (state.historyIssue) issues.set("history", state.historyIssue);
      for (const [key, message] of issues) {
        if (seen.current.get(key) === message) continue;
        console.error("[Upload storage]", { filename: null, mediaId: null, message: redactUploadError(message) });
        if (key === "descriptor") addToast({ category: "warning", message: "Requested upload history unavailable" });
      }
      if (Object.keys(state.batchIssues).length && !warned.current) addToast({ category: "warning", message: "Upload history saving error" });
      warned.current = Object.keys(state.batchIssues).length > 0;
      seen.current = issues;
    };
    report();
    return useLocalPersistenceStore.subscribe(report);
  }, []);
  return null;
}