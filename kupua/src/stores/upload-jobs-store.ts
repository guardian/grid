import { create } from "zustand";
import { uploadBatchMembership } from "@/lib/browsing-context";
import { loadUploadBatches, saveUploadBatch, useLocalPersistenceStore } from "@/lib/local-batch-storage";
import { mintKupuaKey } from "@/lib/orchestration/history-key";
import { observeGridUpload, observeUploadedImage, submitGridUpload, type UploadSubmission } from "@/lib/upload-commands";
import { redactUploadError } from "@/lib/upload-error";

export type UploadPhase = "waiting" | "preparing" | "transferring" | "processing" | "visibility" | "complete" | "failed" | "blocked" | "uncertain" | "interrupted";
export type UploadAttempt = {
  id: string;
  name: string;
  size: number;
  phase: UploadPhase;
  statusId?: string;
  imageId?: string;
  processingComplete?: boolean;
  interrupted?: boolean;
  submission?: UploadSubmission;
  message?: string;
  notificationDismissed?: boolean;
  serverError?: string;
};
export type UploadBatch = { id: string; createdAt: number; restored?: boolean; attempts: readonly UploadAttempt[] };
export const activeUploadPhases = new Set<UploadPhase>(["waiting", "preparing", "transferring", "processing", "visibility"]);
export const attentionUploadPhases = new Set<UploadPhase>(["failed", "blocked", "uncertain", "interrupted"]);
export const useUploadJobsStore = create<{ batches: readonly UploadBatch[]; activityAttemptIds: ReadonlySet<string> }>(() => ({ batches: [], activityAttemptIds: new Set() }));
const reportedProblems = new Map<string, Set<string>>();
const files = new Map<string, File>();
const requests = new Map<string, AbortController>();
const observation = new Map<string, { due: number; deadline: number }>();
const OBSERVE_FOR = 5 * 60_000;
let timer: ReturnType<typeof setTimeout> | undefined;
let transferring = false;
let observing = false;
let lifecycleOwned = false;

function attemptById(id: string): UploadAttempt | undefined {
  return useUploadJobsStore.getState().batches.flatMap(batch => batch.attempts).find(attempt => attempt.id === id);
}

function update(id: string, patch: Partial<UploadAttempt>): void {
  useUploadJobsStore.setState(state => ({ batches: state.batches.map(batch => batch.attempts.some(attempt => attempt.id === id)
    ? { ...batch, attempts: batch.attempts.map(attempt => attempt.id === id ? { ...attempt, ...patch } : attempt) } : batch) }));
  const attempt = attemptById(id);
  if (attempt) reportProblem(attempt);
  refreshLifecycle();
}

function reportProblem(attempt: UploadAttempt): void {
  const queued = attempt.submission?.queued;
  const problems: { stage: string; message: string; serverError?: string; httpStatus?: number }[] = [];
  if (queued && queued !== "acknowledged") {
    problems.push({ stage: "queued", message: attempt.submission?.reason ?? `Queued status update ${queued}.`, httpStatus: attempt.submission?.httpStatus });
  }
  if (attentionUploadPhases.has(attempt.phase)) {
    const stage = attempt.phase === "failed" && attempt.submission?.outcome === "accepted" ? "processing" : attempt.submission?.stage ?? attempt.phase;
    problems.push({ stage, message: attempt.message ?? `Upload ${attempt.phase} during ${stage}.`, serverError: attempt.serverError,
      ...(!queued ? { httpStatus: attempt.submission?.httpStatus } : {}) });
  }
  const previous = reportedProblems.get(attempt.id) ?? new Set<string>();
  for (const problem of problems) {
    const diagnostic = { ...problem, message: redactUploadError(problem.message),
      ...(problem.serverError ? { serverError: redactUploadError(problem.serverError) } : {}) };
    const signature = JSON.stringify(diagnostic);
    if (previous.has(signature)) continue;
    previous.add(signature);
    reportedProblems.set(attempt.id, previous);
    console.error("[Upload]", { filename: redactUploadError(attempt.name), mediaId: attempt.statusId ?? attempt.imageId ?? null, ...diagnostic });
  }
}

export function acknowledgeUploadNavigation(): void {
  const state = useUploadJobsStore.getState();
  const visible = state.batches.flatMap(batch => batch.attempts).filter(attempt => state.activityAttemptIds.has(attempt.id));
  if (visible.length && visible.every(attempt => attempt.phase === "complete")) {
    useUploadJobsStore.setState({ activityAttemptIds: new Set() });
  }
}

export function dismissUploadAttempt(id: string): void {
  const attempt = attemptById(id);
  if (!attempt || !attentionUploadPhases.has(attempt.phase)) return;
  update(id, { notificationDismissed: true });
  useUploadJobsStore.setState(state => ({ activityAttemptIds: new Set([...state.activityAttemptIds].filter(attemptId => attemptId !== id)) }));
}

function warnBeforeUnload(event: BeforeUnloadEvent): void {
  if (!hasActiveWork()) return;
  event.preventDefault();
  event.returnValue = "";
}

function hasActiveWork(): boolean {
  const issues = useLocalPersistenceStore.getState().batchIssues;
  return useUploadJobsStore.getState().batches.some(batch => !!issues[batch.id] || batch.attempts.some(attempt =>
    ["waiting", "preparing", "transferring", "processing", "visibility"].includes(attempt.phase)));
}

export function retainUploadBatches(): void {
  for (const batch of useUploadJobsStore.getState().batches) {
    saveUploadBatch(batch, uploadBatchMembership.getState().batches.get(batch.id)!.revision);
  }
  refreshLifecycle();
}

function refreshLifecycle(): void {
  if (hasActiveWork()) ownLifecycle();
  else if (lifecycleOwned) {
    window.removeEventListener("beforeunload", warnBeforeUnload);
    window.removeEventListener("pagehide", disposeUploadJobs);
    lifecycleOwned = false;
  }
}

function ownLifecycle(): void {
  if (lifecycleOwned || typeof window === "undefined") return;
  lifecycleOwned = true;
  window.addEventListener("beforeunload", warnBeforeUnload);
  window.addEventListener("pagehide", disposeUploadJobs);
}

export function submitUploadFiles(submitted: readonly File[]): string | undefined {
  if (!submitted.length) return undefined;
  const id = `local-${mintKupuaKey()}`;
  const attempts = submitted.map(file => {
    const attemptId = mintKupuaKey();
    files.set(attemptId, file);
    return { id: attemptId, name: file.name, size: file.size, phase: "waiting" as const };
  }).sort((first, second) => first.name.localeCompare(second.name));
  useUploadJobsStore.setState(state => {
    const previous = state.batches.flatMap(batch => batch.attempts).filter(attempt => state.activityAttemptIds.has(attempt.id));
    const continuing = previous.some(attempt => activeUploadPhases.has(attempt.phase));
    const retained = previous.filter(attempt => continuing || attentionUploadPhases.has(attempt.phase));
    return { batches: [...state.batches, { id, createdAt: Date.now(), attempts }],
      activityAttemptIds: new Set([...retained.map(attempt => attempt.id), ...attempts.map(attempt => attempt.id)]) };
  });
  ownLifecycle();
  void transferNext();
  return id;
}

async function transferNext(): Promise<void> {
  if (transferring) return;
  transferring = true;
  try {
    for (const [id, file] of files) {
      const controller = new AbortController();
      requests.set(id, controller);
      update(id, { phase: "preparing" });
      try {
        const submission = await submitGridUpload(file, (stage, statusId) => {
          if (controller.signal.aborted) return;
          update(id, { phase: stage === "preparation" ? "preparing" : stage === "transfer" ? "transferring" : "processing",
            ...(statusId ? { statusId } : {}) });
        }, controller.signal);
        update(id, { submission, statusId: submission.imageId ?? attemptById(id)?.statusId,
          message: controller.signal.aborted ? "This page was interrupted. Check status before taking further action." : submission.reason,
          phase: controller.signal.aborted ? "uncertain" : submission.outcome === "accepted" ? "processing" : submission.outcome });
        if (submission.outcome === "accepted" && submission.imageId && !controller.signal.aborted) {
          observation.set(id, { due: Date.now(), deadline: Date.now() + OBSERVE_FOR });
          scheduleObservation();
        }
      } catch {
        update(id, { phase: "uncertain", message: "Upload was interrupted. No automatic retry was made." });
      } finally {
        files.delete(id);
        requests.delete(id);
      }
    }
  } finally { transferring = false; }
}

function scheduleObservation(): void {
  if (timer) clearTimeout(timer);
  timer = undefined;
  if (observing || !observation.size) return;
  const next = [...observation.entries()].sort((first, second) => first[1].due - second[1].due)[0];
  timer = setTimeout(() => { timer = undefined; void observeAttempt(next[0]); }, Math.max(0, next[1].due - Date.now()));
}

async function observeAttempt(id: string): Promise<void> {
  const attempt = attemptById(id);
  const window = observation.get(id);
  if (!attempt?.statusId || !window) return;
  observing = true;
  const controller = new AbortController();
  requests.set(id, controller);
  try {
    let result = attempt.phase === "visibility" ? await observeUploadedImage(attempt.statusId, controller.signal)
      : await observeGridUpload(attempt.statusId, controller.signal);
    if (result.outcome === "missing" && attempt.phase !== "visibility" && !controller.signal.aborted) {
      const image = await observeUploadedImage(attempt.statusId, controller.signal);
      if (image.outcome === "visible") result = image;
    }
    if (controller.signal.aborted || !observation.has(id)) return;
    if (result.outcome === "visible") {
      update(id, { phase: "complete", imageId: attempt.statusId, message: undefined });
      observation.delete(id);
    } else if (result.outcome === "failed") {
      update(id, { phase: "failed", message: "The loader reports processing failed.", serverError: result.errorMessage });
      observation.delete(id);
    } else if (result.outcome === "unavailable" || (result.outcome === "missing" && attempt.phase !== "visibility")) {
      update(id, { phase: "uncertain", message: result.outcome === "missing"
        ? "Upload status is missing or expired. This does not prove the upload failed."
        : "Status could not be checked. No upload was replayed." });
      observation.delete(id);
    } else if (Date.now() >= window.deadline) {
      update(id, { phase: "uncertain", message: "Processing or search visibility is still unconfirmed. Check status again later." });
      observation.delete(id);
    } else {
      const processingComplete = attempt.processingComplete || result.outcome === "status" && result.status === "COMPLETED";
      update(id, { phase: processingComplete ? "visibility" : "processing", processingComplete });
      observation.set(id, { ...window, due: Date.now() + 2_000 });
    }
  } finally {
    requests.delete(id);
    observing = false;
    scheduleObservation();
  }
}

export function checkUploadAttempt(id: string): void {
  const attempt = attemptById(id);
  if (!attempt?.statusId || requests.has(id) || files.has(id) || observation.has(id)) return;
  update(id, { phase: attempt.processingComplete ? "visibility" : "processing", interrupted: false, message: undefined });
  observation.set(id, { due: Date.now(), deadline: Date.now() + OBSERVE_FOR });
  scheduleObservation();
}

export function disposeUploadJobs(): void {
  if (timer) clearTimeout(timer);
  timer = undefined;
  for (const controller of requests.values()) controller.abort();
  observation.clear();
  files.clear();
  useUploadJobsStore.setState(state => ({ batches: state.batches.map(batch => ({ ...batch,
    attempts: batch.attempts.map(attempt => ["waiting", "preparing", "transferring", "processing", "visibility"].includes(attempt.phase)
      ? { ...attempt, phase: "uncertain", interrupted: true, message: "This page was interrupted. No upload will be replayed." } : attempt),
  })) }));
  for (const batch of useUploadJobsStore.getState().batches) {
    for (const attempt of batch.attempts) if (attempt.interrupted) reportProblem(attempt);
  }
  if (lifecycleOwned) {
    window.removeEventListener("beforeunload", warnBeforeUnload);
    window.removeEventListener("pagehide", disposeUploadJobs);
    lifecycleOwned = false;
  }
}

const retainedBatches = loadUploadBatches();
for (const batch of retainedBatches) {
  uploadBatchMembership.getState().set(batch.id, batch.attempts.flatMap(attempt => attempt.imageId ? [attempt.imageId] : []), batch.revision, true);
}
useUploadJobsStore.setState({ batches: retainedBatches,
  activityAttemptIds: new Set(retainedBatches.flatMap(batch => batch.attempts.filter(attempt => attentionUploadPhases.has(attempt.phase) && !attempt.notificationDismissed).map(attempt => attempt.id))) });
useUploadJobsStore.subscribe((state, previous) => {
  if (state.batches === previous.batches) return;
  for (const batch of state.batches) {
    if (previous.batches.includes(batch)) continue;
    const membership = uploadBatchMembership.getState();
    membership.set(batch.id, batch.attempts.flatMap(attempt => attempt.imageId ? [attempt.imageId] : []), undefined, true);
    saveUploadBatch(batch, uploadBatchMembership.getState().batches.get(batch.id)!.revision);
  }
});