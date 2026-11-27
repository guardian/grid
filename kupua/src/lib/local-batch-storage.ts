import { z } from "zod";
import { create } from "zustand";
import type { UploadBatch } from "@/stores/upload-jobs-store";

export const BATCH_STORAGE_PREFIX = "kupua:uploadBatch:";
export const BATCH_STORAGE_BUDGET = 2 * 1024 * 1024;
export const HISTORY_STORAGE_BUDGET = 1024 * 1024;

export const useLocalPersistenceStore = create<{
  batchIssues: Readonly<Record<string, string>>;
  descriptorIssue: string | null;
  historyIssue: string | null;
}>(() => ({ batchIssues: {}, descriptorIssue: null, historyIssue: null }));

const imageId = z.string().regex(/^[a-f0-9]{40}$/);
const descriptorSchema = z.object({
  version: z.literal(1),
  id: z.string().regex(/^local-[a-zA-Z0-9-]+$/),
  createdAt: z.number().int().nonnegative(),
  revision: z.number().int().positive(),
  attempts: z.array(z.object({
    id: z.string().min(1), name: z.string(), size: z.number().int().nonnegative(),
    phase: z.enum(["waiting", "preparing", "transferring", "processing", "visibility", "complete", "failed", "blocked", "uncertain", "interrupted"]),
    statusId: imageId.optional(), imageId: imageId.optional(), processingComplete: z.boolean().optional(),
    message: z.string().optional(),
    notificationDismissed: z.boolean().optional(),
    metadataNeedsAttention: z.literal(true).optional(),
    serverError: z.string().optional(),
    submission: z.object({
      outcome: z.enum(["accepted", "blocked", "failed", "uncertain"]),
      stage: z.enum(["preparation", "transfer", "queued"]), imageId: imageId.optional(),
      queued: z.enum(["acknowledged", "blocked", "rejected", "uncertain"]).optional(),
      failureKind: z.enum(["server", "failed", "size", "session"]).optional(), maxFileBytes: z.number().optional(),
      httpStatus: z.number().optional(),
    }).optional(),
  })),
});

const interruptedPhases = new Set(["waiting", "preparing", "transferring", "processing", "visibility"]);

export function loadUploadBatches(): Array<UploadBatch & { revision: number }> {
  const batches: Array<UploadBatch & { revision: number }> = [];
  try {
    for (let index = 0; index < sessionStorage.length; index++) {
      const key = sessionStorage.key(index);
      if (!key?.startsWith(BATCH_STORAGE_PREFIX)) continue;
      let value: unknown;
      try { value = JSON.parse(sessionStorage.getItem(key) ?? "null"); } catch { value = null; }
      const parsed = descriptorSchema.safeParse(value);
      if (!parsed.success || key !== BATCH_STORAGE_PREFIX + parsed.data.id) {
        useLocalPersistenceStore.setState({ descriptorIssue: "Some retained local batches are unavailable because their records could not be read." });
        continue;
      }
      batches.push({ ...parsed.data, restored: true, attempts: parsed.data.attempts.map(({ metadataNeedsAttention, ...attempt }) => ({ ...attempt,
        ...(metadataNeedsAttention && { followups: [{ label: "Metadata", summary: "Check the image: one or more edits were not confirmed before reload.", pending: false, attention: true }] }),
        phase: interruptedPhases.has(attempt.phase) ? "interrupted" : attempt.phase,
        ...(attempt.phase === "interrupted" || interruptedPhases.has(attempt.phase)
          ? { message: "This page was interrupted. Nothing was resumed or resubmitted. Check status explicitly when an identity is known." } : {}),
      })) });
    }
  } catch {
    useLocalPersistenceStore.setState({ descriptorIssue: "Local batch storage is unavailable. New work remains in this page but may not survive reload." });
  }
  return batches.sort((first, second) => first.createdAt - second.createdAt);
}

export function saveUploadBatch(batch: UploadBatch, revision: number): void {
  try {
    const descriptor = descriptorSchema.parse({ version: 1, ...batch, revision,
      attempts: batch.attempts.map(attempt => ({ ...attempt,
        ...(attempt.followups?.some(item => item.attention || item.pending) && { metadataNeedsAttention: true }),
        phase: attempt.interrupted || interruptedPhases.has(attempt.phase) ? "interrupted" : attempt.phase,
      })),
    });
    const key = BATCH_STORAGE_PREFIX + batch.id;
    const raw = JSON.stringify(descriptor);
    let bytes = 2 * (key.length + raw.length);
    for (let index = 0; index < sessionStorage.length; index++) {
      const previous = sessionStorage.key(index);
      if (previous?.startsWith(BATCH_STORAGE_PREFIX) && previous !== key) {
        bytes += 2 * (previous.length + (sessionStorage.getItem(previous)?.length ?? 0));
      }
    }
    if (bytes > BATCH_STORAGE_BUDGET) throw new Error("Local descriptor budget exhausted");
    sessionStorage.setItem(key, raw);
    useLocalPersistenceStore.setState(state => ({ batchIssues: Object.fromEntries(
      Object.entries(state.batchIssues).filter(([id]) => id !== batch.id)),
    }));
  } catch {
    useLocalPersistenceStore.setState(state => ({ batchIssues: { ...state.batchIssues,
      [batch.id]: "This batch has changes that could not be retained. Keep this page open; reload may lose those changes. Older records were not removed.",
    } }));
  }
}