import { create } from "zustand";
import { uploadBatchMembership } from "@/lib/browsing-context";
import { observeGridUpload, observeUploadedImage, submitGridUpload, type UploadSubmission } from "@/lib/upload-commands";

export type UploadPhase = "waiting" | "preparing" | "transferring" | "processing" | "visibility" | "complete" | "failed" | "blocked" | "uncertain";
export type UploadAttempt = {
  id: string;
  name: string;
  size: number;
  phase: UploadPhase;
  statusId?: string;
  imageId?: string;
  processingComplete?: boolean;
  submission?: UploadSubmission;
  message?: string;
};
export type UploadBatch = { id: string; attempts: readonly UploadAttempt[] };
export const useUploadJobsStore = create<{ batches: readonly UploadBatch[] }>(() => ({ batches: [] }));
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
  refreshLifecycle();
}

function publishMembership(): void {
  for (const batch of useUploadJobsStore.getState().batches) {
    uploadBatchMembership.getState().set(batch.id, batch.attempts.flatMap(attempt => attempt.imageId ? [attempt.imageId] : []));
  }
}

function warnBeforeUnload(event: BeforeUnloadEvent): void {
  if (!hasActiveWork()) return;
  event.preventDefault();
  event.returnValue = "";
}

function hasActiveWork(): boolean {
  return useUploadJobsStore.getState().batches.some(batch => batch.attempts.some(attempt =>
    ["waiting", "preparing", "transferring", "processing", "visibility"].includes(attempt.phase)));
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
  const id = `local-${crypto.randomUUID()}`;
  const attempts = submitted.map(file => {
    const attemptId = crypto.randomUUID();
    files.set(attemptId, file);
    return { id: attemptId, name: file.name, size: file.size, phase: "waiting" as const };
  }).sort((first, second) => first.name.localeCompare(second.name));
  useUploadJobsStore.setState(state => ({ batches: [...state.batches, { id, attempts }] }));
  uploadBatchMembership.getState().set(id, []);
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
      publishMembership();
    } else if (result.outcome === "failed") {
      update(id, { phase: "failed", message: "The loader reports processing failed." });
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
  update(id, { phase: attempt.processingComplete ? "visibility" : "processing", message: undefined });
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
      ? { ...attempt, phase: "uncertain", message: "This page was interrupted. No upload will be replayed." } : attempt),
  })) }));
  if (lifecycleOwned) {
    window.removeEventListener("beforeunload", warnBeforeUnload);
    window.removeEventListener("pagehide", disposeUploadJobs);
    lifecycleOwned = false;
  }
}