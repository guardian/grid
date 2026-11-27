import { create } from "zustand";
import { FULL_FRAME_TARGET_LIMIT, prepareImageAction, type ImageAction, type ImageActionContext, type PreparedImageAction } from "@/lib/image-actions";
import { addToast } from "./toast-store";
import { beginCropSave, finishCropSave } from "./crop-save-store";
import { attachedEnrichment } from "./enrichment-store";
import { BATCH_POLICY, createBatchExecution, createBatchQueue } from "@/lib/batch-execution";
import { executeGridCommand, observeSavedCrop, showsSavedCrop, type CropReceipt } from "@/lib/grid-commands";
import { invalidateGridSession, isGridSessionInvalidated } from "@/lib/grid-api-instance";
import { isImageMetadataCurrent } from "@/lib/image-read-freshness";
import { hasNewerImageCopy, publishImages, readForStandalonePublication } from "@/lib/image-publication";
import { apiGetByIds, SearchAfterApiError } from "@/dal/grid-api-search-adapter";
import type { Image } from "@/types/image";

export type FullFrameStatus = "queued" | "preflight" | "working" | "acknowledged" | "saved" | "unchanged" | "rejected" | "uncertain" | "unsent" | "skipped";
export type FullFrameReceipt = { id: string; status: FullFrameStatus; reason?: string };
export type FullFrameBatch = { id: number; active: boolean; receipts: readonly FullFrameReceipt[] };

const CROP_VISIBILITY_MS = 65_000;
const CROP_POLL_MS = [250, 500, 1000, 2000, 4000];
const STANDALONE_READ_MS = [0, 500, 1000, 2000, 4000];
const RETAINED_BATCHES = 5;

interface ImageActionState {
  prepare: (action: ImageAction, context: ImageActionContext, returnFocus?: HTMLElement) => PreparedImageAction | false;
  fullFrameBatches: readonly FullFrameBatch[];
  submitFullFrame: (intent: PreparedImageAction) => boolean;
  inspectFullFrame: () => void;
}

let cropQueue: ReturnType<typeof createBatchQueue> | undefined;

export function configureImageActionQueue(queue: ReturnType<typeof createBatchQueue>) {
  cropQueue = queue;
}

export function createImageActionStore(queue?: ReturnType<typeof createBatchQueue>, execute = executeGridCommand,
  readImages: (ids: string[], signal: AbortSignal) => Promise<Image[]> = apiGetByIds) {
  let batches = 0;
  return create<ImageActionState>((set, get) => ({
  fullFrameBatches: [],
  inspectFullFrame() { set(state => ({ fullFrameBatches: state.fullFrameBatches.filter(batch => batch.active) })); },
  submitFullFrame(intent) {
    if (get().fullFrameBatches.some(batch => batch.active) || intent.operation !== "full-frame" || !intent.commands.length
      || intent.targetIds.length > FULL_FRAME_TARGET_LIMIT || isGridSessionInvalidated()) return false;
    const slot = (queue ?? cropQueue)?.admit();
    if (!slot) return false;
    const batchId = ++batches;
    const skipped = new Map(intent.skipped.map(item => [item.id, item.reason]));
    const receipts = intent.targetIds.map((id): FullFrameReceipt => skipped.has(id)
      ? { id, status: "skipped", reason: skipped.get(id) } : { id, status: "queued" });
    set(state => ({ fullFrameBatches: [{ id: batchId, active: true, receipts }, ...state.fullFrameBatches].slice(0, RETAINED_BATCHES) }));
    const update = (ids: ReadonlySet<string>, status: FullFrameStatus, reason = isGridSessionInvalidated() && status !== "saved" ? "Reload page" : undefined) => set(state => ({
      fullFrameBatches: state.fullFrameBatches.map(batch => batch.id !== batchId ? batch : { ...batch, receipts: batch.receipts.map(receipt =>
        ids.has(receipt.id) ? { id: receipt.id, status, ...(reason !== undefined && { reason }) } : receipt) }),
    }));

    const awaiting = new Map<string, { receipt: CropReceipt; until: number }>();
    let observing: Promise<void> | undefined;
    const poll = async () => {
      for (let attempt = 0; awaiting.size && !isGridSessionInvalidated(); attempt++) {
        await new Promise(resolve => setTimeout(resolve, CROP_POLL_MS[Math.min(attempt, CROP_POLL_MS.length - 1)]));
        const now = performance.now();
        for (const [id, entry] of awaiting) if (now > entry.until) awaiting.delete(id);
        if (!awaiting.size || isGridSessionInvalidated()) break;
        let images: Image[];
        try { images = await readImages([...awaiting.keys()], AbortSignal.timeout(5000)); }
        catch (error) {
          if (error instanceof SearchAfterApiError && (error.status === 401 || error.status === 419)) {
            invalidateGridSession();
            update(new Set(awaiting.keys()), "acknowledged");
            break;
          }
          continue;
        }
        const seen = images.flatMap(image => {
          const entry = awaiting.get(image.id);
          return entry && showsSavedCrop(image, attachedEnrichment(image), entry.receipt) && isImageMetadataCurrent(image)
            ? [{ image, receipt: entry.receipt }] : [];
        });
        if (!seen.length || isGridSessionInvalidated()) continue;
        for (const { image } of seen) awaiting.delete(image.id);
        publishImages(seen.filter(({ image }) => !hasNewerImageCopy(image)).map(({ image }) => ({ image, enrichment: attachedEnrichment(image) })));
        update(new Set(seen.map(({ image }) => image.id)), "saved");
        await Promise.all(seen.map(async ({ image: { id }, receipt }) => {
          const full = await readForStandalonePublication(id, () => observeSavedCrop(id, receipt, STANDALONE_READ_MS)).catch(() => undefined);
          if (full && isImageMetadataCurrent(full.image) && !hasNewerImageCopy(full.image) && !isGridSessionInvalidated()) publishImages([full]);
        }));
      }
    };
    const observe = (): Promise<void> => observing ??= poll().finally(() => {
      observing = undefined;
      if (awaiting.size && !isGridSessionInvalidated()) void observe();
    });

    let unsettled = intent.commands.length;
    const settled = (count: number) => {
      unsettled -= count;
      if (unsettled === 0) slot.dispatched();
    };
    const execution = createBatchExecution(intent.commands, async ({ imageId, body }) => {
      const ids = new Set([imageId]);
      const settle = (status: FullFrameStatus, reason?: string) => update(ids, status, reason);
      let throttled = false;
      try {
        if (isGridSessionInvalidated() || typeof body?.source !== "string") settle("unsent");
        else if (!beginCropSave(imageId)) settle("unsent", "A crop is already being saved for this image");
        else {
          let uncertain = false;
          try {
            const result = await execute({ operation: "create-crop", imageId, request: { type: "full", source: body.source } },
              undefined, undefined, { onPost: () => settle("working") });
            if (result.outcome === "acknowledged" && result.crop) {
              settle("acknowledged");
              awaiting.set(imageId, { receipt: result.crop, until: performance.now() + CROP_VISIBILITY_MS });
              void observe();
            } else if (result.outcome === "unchanged") settle("unchanged");
            else if (result.outcome === "blocked") settle("unsent");
            else if (result.outcome === "rejected") settle("rejected");
            else {
              settle("uncertain");
              uncertain = true;
            }
            throttled = "status" in result && result.status === 429;
            if (throttled) slot.pacing.nextStart = Math.max(slot.pacing.nextStart, Date.now() + BATCH_POLICY.throttleDelayMs);
          } catch {
            settle("uncertain");
            uncertain = true;
          } finally {
            finishCropSave(imageId, uncertain);
          }
        }
      } finally {
        settled(1);
      }
      return { stop: isGridSessionInvalidated(), throttled };
    }, {
      started: item => update(new Set([item.imageId]), "preflight"),
      stopped: items => {
        update(new Set(items.map(item => item.imageId)), "unsent");
        settled(items.length);
      },
    }, slot.pacing, 2, null);
    void (async () => {
      await slot.wait;
      execution.start();
      await execution.done;
      slot.complete();
      while (observing) await observing.catch(() => {});
      set(state => ({ fullFrameBatches: state.fullFrameBatches.map(batch => batch.id === batchId ? { ...batch, active: false } : batch) }));
    })();
    return true;
  },
  prepare(action, context) {
    const intent = prepareImageAction(action, context);
    if (!intent) return false;
    if (action === "full-frame") {
      if (get().submitFullFrame(intent)) return intent;
      addToast({ category: "information", message: "Full frame was not sent. Another Full frame batch is still saving." });
      return false;
    }
    const count = intent.skipped.length;
    const reasons = new Set(intent.skipped.map(item => item.reason));
    const skippedText = count ? `; ${intent.eligibleIds.length} prepared; ${count} skipped${reasons.size === 1 ? ` (${intent.skipped[0].reason})` : ""}` : "";
    addToast({ category: "information", message: `Not sent - ${intent.label}${skippedText}` });
    return intent;
  },
  }));
}

export const useImageActionStore = createImageActionStore();
